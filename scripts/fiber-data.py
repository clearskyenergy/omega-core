#!/usr/bin/env python3
"""© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
Refresh and normalize permitted public evidence. Python 3.10+, standard library only.
OSM-derived files retain ODbL; California files retain CDT public-use terms.
"""
import argparse, collections, datetime as dt, hashlib, json, math, os, pathlib
import re, sys, urllib.parse, urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
CA_BASE = 'https://services6.arcgis.com/sAv98EYUZbLCVPW0/arcgis/rest/services/'
OVERPASS = 'https://overpass-api.de/api/interpreter'
OSM_LICENSE = 'https://www.openstreetmap.org/copyright'
CA_ITEMS = {
    'ca_network': ('7debc3879ec8438c8c37ec51b9e958f0', 'MMBI_Statewide_Network_Versions_Download_vw'),
    'ca_partners': ('7dceccdae28d428984930b3c5b8884fe', 'CDT_Nework_Partner_Public_vw'),
}

def dump(path, value):
    path = pathlib.Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + '.tmp')
    temp.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')) + '\n')
    temp.replace(path)

def get_json(url, data=None):
    request = urllib.request.Request(url, data=data, headers={'User-Agent': 'OmegaFiberAtlas/1.0', 'Accept': 'application/json'})
    with urllib.request.urlopen(request, timeout=210) as response:
        value = json.load(response)
    if value.get('error') or value.get('remark'):
        raise RuntimeError(str(value.get('error') or value.get('remark')))
    return value

def arc_query(service, params):
    return get_json(CA_BASE + service + '/FeatureServer/0/query?' + urllib.parse.urlencode(params))

def arc_all(service, where):
    # Explicit ID pagination: a truncated first page is never a successful download.
    ids = arc_query(service, {'f':'json', 'where':where, 'returnIdsOnly':'true'}).get('objectIds')
    if ids is None:
        raise RuntimeError('ArcGIS did not return object IDs')
    features = []
    for start in range(0, len(ids), 100):
        page = arc_query(service, {'f':'geojson', 'objectIds':','.join(map(str, ids[start:start+100])),
                                  'outFields':'*', 'outSR':4326})
        if page.get('exceededTransferLimit') or page.get('properties', {}).get('exceededTransferLimit'):
            raise RuntimeError('ArcGIS transfer limit exceeded; reduce page size')
        features.extend(page.get('features', []))
    if len(features) != len(ids):
        raise RuntimeError('ArcGIS feature count did not match ID count')
    return {'type':'FeatureCollection', 'features':features}

def refresh(raw):
    raw.mkdir(parents=True, exist_ok=True)
    route_q = '''[out:json][timeout:180];area["ISO3166-1"="US"]["admin_level"="2"]->.us;
    (way(area.us)["telecom:medium"~"fibre|fiber"];way(area.us)["communication:medium"~"fibre|fiber"];
    way(area.us)["cable"~"fiber_optic|fibre_optic"];);out meta geom;'''
    facility_q = '''[out:json][timeout:180];area["ISO3166-1"="US"]["admin_level"="2"]->.us;
    (nwr(area.us)["telecom"~"^(exchange|data_center|internet_exchange|central_office|cable_landing_station)$"];
    nwr(area.us)["building"="data_center"];);out meta center;'''
    telecom_q = '''[out:json][timeout:180];area["ISO3166-1"="US"]["admin_level"="2"]->.us;
    (way(area.us)["communication"="line"];way(area.us)["telecom"~"^(cable|line)$"];);out meta geom;'''
    for name, query in [('osm-post.json', route_q), ('osm-facilities.json', facility_q), ('osm-telecom.json',telecom_q)]:
        value = get_json(OVERPASS, urllib.parse.urlencode({'data':query}).encode())
        if 'elements' not in value:
            raise RuntimeError('Missing OSM elements')
        dump(raw / name, value)
        print(name, len(value['elements']), flush=True)
    for key, (item, service) in CA_ITEMS.items():
        meta = get_json('https://www.arcgis.com/sharing/rest/content/items/' + item + '?f=json')
        if 'public audience' not in meta.get('licenseInfo', '').lower():
            raise RuntimeError('CDT terms changed: review before refreshing')
        dump(raw / (key + '-item.json'), meta)
        if key == 'ca_network':
            versions = arc_query(service, {'f':'json','where':'1=1','returnDistinctValues':'true',
                'outFields':'Version_MonthYear','returnGeometry':'false'})
            names = [x['attributes']['Version_MonthYear'] for x in versions['features']]
            latest = max(names, key=lambda s: dt.datetime.strptime(s, '%B %Y'))
            where = "Version_MonthYear='" + latest + "'"
            filename = 'ca-network-data.json'
        else:
            where, filename = '1=1', 'ca-partners-data.json'
        dump(raw / filename, arc_all(service, where))
        print(filename, 'downloaded', flush=True)
    # Public construction progress is a separate source, not a claim of lit capacity.
    status_base=CA_BASE+'Statewide_Network_Project_Status_vw/FeatureServer/1/query?'
    ids=get_json(status_base+urllib.parse.urlencode({'f':'json','where':'1=1','returnIdsOnly':'true'}))['objectIds']
    features=[]
    for start in range(0,len(ids),100):
        page=get_json(status_base+urllib.parse.urlencode({'f':'geojson','objectIds':','.join(map(str,ids[start:start+100])),'outFields':'*','outSR':4326}))
        if page.get('exceededTransferLimit'):raise RuntimeError('Truncated California status query')
        features+=page['features']
    if len(features)!=len(ids):raise RuntimeError('California status count mismatch')
    dump(raw/'ca-status-data.json',collection(features))

def coord(c):
    return (isinstance(c, list) and len(c) >= 2 and
            all(isinstance(v, (int,float)) and not isinstance(v,bool) and math.isfinite(v) for v in c[:2]) and
            -180 <= c[0] <= 180 and -90 <= c[1] <= 90)

def base_properties(source, key, kind, name, operator, retrieved):
    return dict(source_id=source, source_feature_id=str(key), feature_kind=kind,
        name=name, operator=operator or None, retrieved_at=retrieved,
        operational_status='unknown', positional_accuracy_m=None,
        serviceability='unconfirmed', fiber_strands_reported=None,
        lit_capacity_gbps=None, spare_capacity_gbps=None, offered_capacity_gbps=None,
        capacity_evidence=None, route_diversity='unconfirmed')

def positive_int(s):
    return int(s) if re.fullmatch(r'[1-9][0-9]*', str(s or '')) else None

def osm_data(raw, retrieved):
    elements, timestamps = {}, []
    for name in ['osm-post.json', 'osm-facilities.json', 'osm-telecom.json']:
        if not (raw / name).exists(): continue
        value = json.loads((raw / name).read_text())
        if value.get('remark'): raise RuntimeError('Incomplete OSM response: ' + value['remark'])
        timestamps.append(value.get('osm3s',{}).get('timestamp_osm_base'))
        for e in value['elements']:
            key = e['type'] + '/' + str(e['id'])
            # Preserve detailed geometry when a later center-only result overlaps.
            if key not in elements or ('geometry' in e and 'geometry' not in elements[key]): elements[key] = e
    routes, unknown, facilities, skipped = [], [], [], collections.Counter()
    facility_types = {'exchange','central_office','data_center','internet_exchange','cable_landing_station'}
    for key, e in sorted(elements.items()):
        t = e.get('tags', {})
        route = e['type']=='way' and (t.get('communication')=='line' or t.get('telecom') in ('line','cable') or t.get('cable') in ('fiber_optic','fibre_optic'))
        medium = ' '.join(t.get(k,'') for k in ('telecom:medium','communication:medium','cable')).lower().strip()
        optical = 'fibre' in medium or 'fiber' in medium
        underwater = t.get('location')=='underwater' or t.get('submarine')=='yes' or t.get('seamark:type')=='cable_submarine'
        if route:
            if underwater:
                skipped['underwater_routes'] += 1; continue
            if medium and not optical:
                skipped['explicit_nonfiber_routes'] += 1; continue
            points = [[p['lon'],p['lat']] for p in e.get('geometry', []) if 'lon' in p and 'lat' in p]
            if len(points)<2 or not all(coord(p) for p in points):
                skipped['invalid_route_geometry'] += 1; continue
            kind = 'fiber_route' if optical else 'telecom_route_unknown'
            p = base_properties('osm_us', key, kind, t.get('name') or t.get('ref') or t.get('operator') or 'Mapped telecom route', t.get('operator') or t.get('owner'), retrieved)
            p.update(geometry_quality='community_mapped', source_url='https://www.openstreetmap.org/'+key,
                license='ODbL-1.0', attribution='© OpenStreetMap contributors', medium_reported=medium or None,
                source_last_edited=e.get('timestamp'), source_version=e.get('version'), placement=t.get('location'),
                operational_status='mapped_unspecified', proximity_eligible=optical,
                published_status=t.get('status'), geometry_role='mapped_route')
            for tag, status in [('proposed','planned'),('construction','under_construction'),('disused','disused'),('abandoned','abandoned')]:
                if t.get(tag) not in (None,'no') or any(k.startswith(tag+':') for k in t):
                    p['operational_status']=status; p['proximity_eligible']=False
            if optical:
                for field in ('fiber:count','fibre:count','fibers','fibres','capacity'):
                    n=positive_int(t.get(field))
                    if n is not None:
                        p['fiber_strands_reported']=n
                        p['capacity_evidence']={'field':field,'raw_value':t[field],'unit':'reported_strands','source_url':p['source_url'],'verification':'community_reported'}
                        break
            f={'type':'Feature','id':'osm:'+key,'geometry':{'type':'LineString','coordinates':points},'properties':p}
            (routes if optical else unknown).append(f)
        elif t.get('telecom') in facility_types or t.get('building')=='data_center':
            center = e if 'lat' in e else e.get('center')
            if not center:
                points = [p for p in e.get('geometry',[]) if 'lat' in p and 'lon' in p]
                if points: center={'lat':sum(p['lat'] for p in points)/len(points),'lon':sum(p['lon'] for p in points)/len(points)}
            if not center or not coord([center.get('lon'),center.get('lat')]):
                skipped['facility_without_center']+=1; continue
            p=base_properties('osm_us',key,'telecom_facility',t.get('name') or t.get('operator') or 'Telecom facility',t.get('operator'),retrieved)
            p.update(source_url='https://www.openstreetmap.org/'+key,license='ODbL-1.0',attribution='© OpenStreetMap contributors',
                geometry_quality='community_mapped',geometry_role='representative_point',facility_type=t.get('telecom') or 'data_center',
                source_last_edited=e.get('timestamp'),city=t.get('addr:city'),state=t.get('addr:state'),
                medium_reported=medium or None,proximity_eligible=False)
            facilities.append({'type':'Feature','id':'osm:'+key,'geometry':{'type':'Point','coordinates':[center['lon'],center['lat']]},'properties':p})
        else: skipped['other_nonroute_features']+=1
    return routes,unknown,facilities,{'osm_base_timestamps':sorted(set(x for x in timestamps if x)), 'excluded':dict(skipped)}

def ca_data(raw, retrieved):
    output=[]
    for filename,source in [('ca-network-data.json','ca_network'),('ca-partners-data.json','ca_partners')]:
        value=json.loads((raw/filename).read_text())
        if value.get('error') or value.get('exceededTransferLimit'): raise RuntimeError('Invalid California download')
        for f in value['features']:
            old=f['properties']; g=f['geometry']
            lines=[g['coordinates']] if g['type']=='LineString' else g['coordinates'] if g['type']=='MultiLineString' else None
            if lines is None: raise ValueError('Expected California lines')
            for index,line in enumerate(lines):
                if len(line)<2 or not all(coord(p) for p in line): raise ValueError('Invalid California geometry')
                key=str(old['OBJECTID'])+':'+str(index)
                partner=old.get('Segment_Partner')
                p=base_properties(source,key,'network_design',partner or 'California middle-mile design',partner or 'California Department of Technology',retrieved)
                p.update(source_url='https://www.arcgis.com/home/item.html?id='+CA_ITEMS[source][0],
                    license='CDT public-use terms',attribution='California Department of Technology, MMBI',
                    geometry_quality='generalized_public_design',geometry_role='network_design',
                    operational_status='design_status_unspecified',published_status=None,proximity_eligible=False,
                    source_vintage=old.get('Version_MonthYear'),agreement_type=old.get('Agreement_Type'),
                    notes='Public design geometry. Includes project development; no operational status or available bandwidth established.')
                output.append({'type':'Feature','id':source+':'+key,'geometry':{'type':'LineString','coordinates':line},'properties':p})
    if (raw/'ca-status-data.json').exists():
        value=json.loads((raw/'ca-status-data.json').read_text())
        if value.get('error') or value.get('exceededTransferLimit'):raise RuntimeError('Invalid California status data')
        for f in value['features']:
            old=f['properties'];g=f['geometry'];lines=[g['coordinates']] if g['type']=='LineString' else g['coordinates']
            for index,line in enumerate(lines):
                if len(line)<2 or not all(coord(p) for p in line):raise ValueError('Invalid California status geometry')
                key=str(old['OBJECTID'])+':'+str(index);status=old.get('Public_Construction_Status')
                p=base_properties('ca_status',key,'network_design','California MMBI: '+str(old.get('County_Name','')), 'California Department of Technology',retrieved)
                p.update(source_url='https://www.arcgis.com/home/item.html?id=ab3010840faa4cbea569ee2e2d5858d1',
                    license='CDT public-use terms',attribution='California Department of Technology, MMBI',
                    geometry_quality='generalized_public_design',geometry_role='project_progress',
                    operational_status={'Installation':'under_construction','Pre-Construction':'planned','Ready-to-Connect':'ready_to_connect_reported'}.get(status,'unknown'),
                    published_status=status,proximity_eligible=False,source_vintage=None,
                    source_last_edited=dt.datetime.fromtimestamp(old['EditDate']/1000,dt.timezone.utc).isoformat() if old.get('EditDate') else None,
                    notes='Public project status. Ready-to-Connect does not establish service or bandwidth at a neighboring parcel.')
                output.append({'type':'Feature','id':'ca_status:'+key,'geometry':{'type':'LineString','coordinates':line},'properties':p})
    return output

def collection(features): return {'type':'FeatureCollection','features':features}

def build(raw):
    stamp=dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds').replace('+00:00','Z')
    routes,unknown,facilities,osm_meta=osm_data(raw,stamp)
    ca=ca_data(raw,stamp)
    layers={'osm-fiber-routes.geojson':routes,'osm-telecom-routes-unknown.geojson':unknown,
            'osm-telecom-facilities.geojson':facilities,'ca-middle-mile-design.geojson':ca}
    output=ROOT/'data/fiber'; entries=[]
    for filename,features in layers.items():
        dump(output/filename,collection(features))
        content=(output/filename).read_bytes()
        entries.append({'file':filename,'count':len(features),'sha256':hashlib.sha256(content).hexdigest(),'bytes':len(content)})
    manifest={'schema_version':'1.0','built_at':stamp,'coverage':'partial_public_evidence',
        'query_scope':'United States OSM administrative area plus California MMBI; source completeness is unknown',
        'complete_national_route_inventory':False,'site_capacity_verified':False,
        'no_evidence_meaning':'unknown; never no fiber','datasets':entries,'osm':osm_meta,
        'fiber_strand_records':sum(f['properties']['fiber_strands_reported'] is not None for f in routes),
        'site_service_records':0,'available_capacity_records':0,
        'california_records_by_source':dict(collections.Counter(f['properties']['source_id'] for f in ca)),
        'california_records_by_status':dict(collections.Counter(f['properties']['operational_status'] for f in ca)),
        'california_design_vintage':sorted(set(f['properties']['source_vintage'] for f in ca if f['properties']['source_vintage'])),
        'facility_query_loaded':(raw/'osm-facilities.json').exists() or (raw/'osm-telecom.json').exists()}
    dump(output/'manifest.json',manifest)
    print(json.dumps(manifest,indent=2))

def main():
    p=argparse.ArgumentParser();p.add_argument('--raw-dir',type=pathlib.Path,default=ROOT/'.fiber-cache');p.add_argument('--refresh',action='store_true')
    a=p.parse_args()
    if a.refresh: refresh(a.raw_dir)
    build(a.raw_dir)
if __name__=='__main__': main()
