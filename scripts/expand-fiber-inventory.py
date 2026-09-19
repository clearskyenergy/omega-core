# © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
"""Add public KMZ / ArcGIS line geometry without replacing earlier sources.

Usage: python expand-fiber-inventory.py INPUT_DIRECTORY
Requires shapely 2.x. Raw inputs stay outside deployment. Reruns replace only
this import's source IDs. Source geometries are never road-snapped or inferred.
"""
import collections, datetime, hashlib, json, math, pathlib, subprocess, sys, zipfile
import xml.etree.ElementTree as ET
from shapely.geometry import LineString, MultiLineString, shape, mapping
from shapely.strtree import STRtree

INPUT=pathlib.Path(sys.argv[1]); OUT=pathlib.Path(__file__).resolve().parents[1]/'data/usa-fiber'
NOW=datetime.datetime.now(datetime.timezone.utc).isoformat()
NS={'k':'http://www.opengis.net/kml/2.2'}
def dump(path, value): path.write_text(json.dumps(value,separators=(',',':')))
states=json.loads((OUT/'states.geojson').read_text())['features']
geoms=[shape(f['geometry']) for f in states]; tree=STRtree(geoms)
codes=[f['properties']['STATE_ABBR'] for f in states]
manifest=json.loads((OUT/'manifest.json').read_text())
sources=[]; additions=[]; audit=collections.Counter()

def state_codes(g): return sorted(codes[int(i)] for i in tree.query(g,predicate='intersects'))
def feature(g,s,name,carrier,state_list,parts=1,record_id=None):
 key=hashlib.sha256((s['id']+name+g.normalize().wkb_hex).encode()).hexdigest()[:20]
 p=dict(id=s['id']+'-'+key,sourceId=s['id'],source=s['name'],sourceUrl=s['url'],name=name,carrier=carrier,category='unknown',routeStatus='Status not established',evidence='publisher_route',dataDate=s.get('dataDate'),metadataModified=s.get('itemModified'),retrievedAt=s['retrievedAt'],networkType='Published fiber route; precision and network class unverified',serviceability='Unconfirmed',routeDiversity='Unconfirmed',states=state_list,publishedLineParts=parts)
 if record_id is not None: p['sourceRecordId']=record_id
 return dict(type='Feature',geometry=mapping(g),properties=p,bbox=list(g.bounds))

def kmz(filename,s,fixed_carrier=None):
 path=INPUT/filename
 if not path.exists(): raise FileNotFoundError(path)
 s.update(retrievedAt=NOW,downloadStatus='complete',itemModified=None,rawSha256=hashlib.sha256(path.read_bytes()).hexdigest())
 groups=collections.defaultdict(list); seen=set(); local=collections.Counter()
 with zipfile.ZipFile(path) as z:
  doc=ET.fromstring(z.read(next(n for n in z.namelist() if n.lower().endswith('.kml'))))
 for placemark in doc.findall('.//k:Placemark',NS):
  carrier=fixed_carrier or (placemark.findtext('k:name',default='Unspecified member',namespaces=NS).replace('\u200b','').strip())
  # Do not copy descriptions, contact names, emails, facilities or point assets.
  for line in placemark.findall('.//k:LineString',NS):
   local['inputLineParts']+=1
   try:
    coords=[tuple(float(v) for v in token.split(',')[:2]) for token in line.findtext('k:coordinates',default='',namespaces=NS).split()]
    if not all(len(c)==2 and all(math.isfinite(v) for v in c) and -180<=c[0]<=180 and -90<=c[1]<=90 for c in coords): raise ValueError('Invalid WGS84')
    g=LineString(coords)
    if g.is_empty or not g.is_valid or g.length==0: raise ValueError('Invalid line')
   except Exception: local['invalidLineParts']+=1;continue
   key=carrier+g.normalize().wkb_hex
   if key in seen: local['duplicateLineParts']+=1;continue
   seen.add(key); ss=state_codes(g)
   if not ss: local['outsideStateBoundaries']+=1;continue
   local['includedLineParts']+=1
   # Local groups limit Leaflet objects/metadata; never connect disjoint lines.
   b=g.bounds; tile=(math.floor((b[0]+b[2])*2),math.floor((b[1]+b[3])*2))
   groups[(carrier,tuple(ss),tile)].append(coords)
 count=0
 for (carrier,ss,tile),lines in sorted(groups.items()):
  for offset in range(0,len(lines),100):
   chunk=lines[offset:offset+100];g=MultiLineString(chunk)
   additions.append(feature(g,s,carrier+' published routes',carrier,list(ss),len(chunk)));count+=1
 s.update(dict(local));s['includedFeatures']=count;s['count']=count;sources.append(s);audit.update(local)
 print(s['id'],dict(local),'map records',count,flush=True)

kmz('fna-routes.kmz',dict(id='fna-member-routes-20260918',name='Fiber Network Alliance member fiber lines',publisher='Fiber Network Alliance / participating members',url='https://www.fibernetworkalliance.com/membership-map-line/',downloadUrl='https://drive.google.com/file/d/1ulsCVWisT6Yy4_XQET0RN82qeOpoOuc9/view',license='Publisher offers download, embedding, copying and customization; retain attribution. Carrier names are as published, not current-ownership verification.',termsUrl='https://www.fibernetworkalliance.com/membership-map-line-pop/',status='Unknown; undated member map',dataDate=None))
kmz('logix-routes.kmz',dict(id='logix-public-routes-20260918',name='LOGIX public network map',publisher='LOGIX Fiber Networks',url='https://logix.com/network-maps/',downloadUrl='https://pub.logix.com/map/admin/files/kmz/Connected2Fiber-02012024-blue.kmz',license='Public carrier map; no explicit redistribution license identified. Retain attribution and verify terms before external redistribution.',status='Unknown; public map filename dated 02012024, not field verification',dataDate=None),'LOGIX (as published)')
for s in json.loads((INPUT/'priority-fiber/sources.json').read_text()):
 if s['downloadStatus']!='complete' or not s.get('count'): continue
 fs=json.loads((INPUT/'priority-fiber'/(s['id']+'.json')).read_text())['features']; n=0
 for f in fs:
  g=shape(f['geometry']);ss=state_codes(g)
  if not ss or not g.is_valid or g.is_empty: continue
  additions.append(feature(g,s,s['name'],s['publisher'],ss,len(g.geoms) if g.geom_type=='MultiLineString' else 1,f['properties']['sourceRecordId']));n+=1
 s.pop('fields',None);s['includedFeatures']=n;sources.append(s)

# Preserve baseline features exactly; deduplicate IDs appearing in multiple states.
replace={s['id'] for s in sources}; all_features={}
for code in codes:
 for f in json.loads((OUT/(code+'.geojson')).read_text())['features']:
  if f['properties']['sourceId'] not in replace: all_features[f['properties']['id']]=f
baseline_count=len(all_features)
for f in additions: all_features[f['properties']['id']]=f
shards={c:[] for c in codes};overview=[];category=collections.Counter()
for f in all_features.values():
 p=f['properties'];category[p['category']]+=1
 for code in p['states']: shards[code].append(f)
 g=shape(f['geometry']).simplify(.002,preserve_topology=True)
 props={k:p[k] for k in ['id','sourceId','category','states','routeStatus']}
 for k in ['carrier','publishedLineParts','importBatch']:
  if k in p: props[k]=p[k]
 overview.append(dict(type='Feature',geometry=mapping(g),properties=props,bbox=f['bbox']))
for row in manifest['states']:
 fs=shards[row['code']];row.update(segments=len(fs),counts=dict(collections.Counter(f['properties']['category'] for f in fs)),sources=sorted({f['properties']['sourceId'] for f in fs}),publishedLineParts=sum(f['properties'].get('publishedLineParts',len(f['geometry']['coordinates']) if f['geometry']['type']=='MultiLineString' else 1) for f in fs),coverage='Partial published route data; not statewide completeness' if fs else 'No bundled route data; fiber availability unknown')
manifest.update(builtAt=NOW,uniqueSegments=len(all_features),statesWithData=sum(bool(r['segments']) for r in manifest['states']),categoryCounts=dict(category),sources=[s for s in manifest['sources'] if s['id'] not in replace]+sources,recordCountNote='Unique source-derived map records, NOT unique cables. Nearby line parts may be grouped into MultiLineString records. Different sources may describe the same physical infrastructure.',expansionAudit=dict(audit),preservedBaselineRecords=baseline_count)
manifest['publishedLineParts']=sum(f['properties'].get('publishedLineParts',len(f['geometry']['coordinates']) if f['geometry']['type']=='MultiLineString' else 1) for f in all_features.values())
# Validate before writing. Existing features and all complete source imports retained.
assert len(all_features)>=baseline_count and len(shards)==51
for c,fs in shards.items(): dump(OUT/(c+'.geojson'),dict(type='FeatureCollection',features=fs))
dump(OUT/'overview.geojson',dict(type='FeatureCollection',features=overview));dump(OUT/'manifest.json',manifest)
subprocess.run(['node',str(pathlib.Path(__file__).with_name('compress-fiber-shards.js'))],check=True)
print(json.dumps({k:manifest[k] for k in ['uniqueSegments','publishedLineParts','statesWithData','preservedBaselineRecords']}),flush=True)
print([(r['code'],r['segments'],r['publishedLineParts']) for r in manifest['states']],flush=True)
