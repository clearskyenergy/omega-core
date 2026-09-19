# © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
"""Add the reviewed September 19 carrier GIS and Kansas planning snapshots.

Requires Shapely 2.x. Usage: python scripts/import-fiber-expansion.py RAW_DIR
Keeps every other source record exactly as it was. Never draws connecting
segments, invents street paths, imports access points, or promotes a plan.
"""
import collections, datetime, hashlib, io, json, math, os, pathlib, subprocess, sys, tempfile, zipfile
import xml.etree.ElementTree as ET
from shapely.geometry import LineString, MultiLineString, shape, mapping
from shapely.strtree import STRtree

RAW = pathlib.Path(sys.argv[1]).resolve()
OUT = pathlib.Path(__file__).resolve().parents[1] / 'data/usa-fiber'
BATCH = '20260919'
NOW = datetime.datetime.now(datetime.timezone.utc).isoformat()
NS = {'k':'http://www.opengis.net/kml/2.2'}
manifest = json.loads((OUT/'manifest.json').read_text())
boundaries = json.loads((OUT/'states.geojson').read_text())['features']
codes = [f['properties']['STATE_ABBR'] for f in boundaries]
tree = STRtree([shape(f['geometry']) for f in boundaries])
additions, sources = [], []

def digest(data):
    return hashlib.sha256(data).hexdigest()

def import_lines(source, records):
    groups, seen, audit = collections.defaultdict(list), set(), collections.Counter()
    for record_id, coords in records:
        audit['inputLineParts'] += 1
        try:
            coords = [tuple(c[:2]) for c in coords]
            assert all(len(c)==2 and all(isinstance(v,(int,float)) and not isinstance(v,bool) and math.isfinite(v) for v in c) and -180<=c[0]<=180 and -90<=c[1]<=90 for c in coords)
            g = LineString(coords)
            assert g.is_valid and not g.is_empty and g.length>0
        except (AssertionError, TypeError, ValueError):
            audit['invalidLineParts'] += 1
            continue
        key = g.normalize().wkb_hex
        if key in seen:
            audit['duplicateLineParts'] += 1
            continue
        seen.add(key)
        states = tuple(sorted(codes[int(i)] for i in tree.query(g,predicate='intersects')))
        if not states:
            audit['outsideStateBoundaries'] += 1
            continue
        audit['includedLineParts'] += 1
        b = g.bounds
        tile = (math.floor((b[0]+b[2])*2), math.floor((b[1]+b[3])*2))
        groups[(states,tile)].append((coords,record_id))
    before = len(additions)
    for (states,tile), rows in sorted(groups.items()):
        for offset in range(0,len(rows),100):
            chunk = rows[offset:offset+100]
            g = MultiLineString([r[0] for r in chunk])
            feature_id = source['id']+'-'+digest(g.normalize().wkb)[:20]
            props = dict(id=feature_id,sourceId=source['id'],source=source['name'],
                sourceUrl=source['pageUrl'],name=source['name'],carrier=source['publisher'],
                category=source['category'],routeStatus=source['routeStatus'],
                evidence='publisher_route' if source['category']!='planned' else 'approximate_project_route',
                geometryQuality='publisher_geometry_unverified',dataDate=None,
                metadataModified=source.get('itemModified'),retrievedAt=source['retrievedAt'],
                networkType=source['networkType'],serviceability='Unconfirmed',routeDiversity='Unconfirmed',
                states=list(states),publishedLineParts=len(chunk),importBatch=BATCH,
                sourceRecordIds=sorted(set(str(r[1]) for r in chunk)))
            additions.append(dict(type='Feature',geometry=mapping(g),properties=props,bbox=list(g.bounds)))
    assert audit['inputLineParts'] == sum(audit[k] for k in ['includedLineParts','duplicateLineParts','invalidLineParts','outsideStateBoundaries'])
    source.update(dict(audit),includedFeatures=len(additions)-before,
        geometryQuality='publisher_geometry_unverified',importBatch=BATCH)
    sources.append(source)
    print(source['id'],dict(audit),'map records',source['includedFeatures'],flush=True)

downloaded = json.loads((RAW/'sources.json').read_text())
assert downloaded and all(s.get('downloadStatus')=='complete' for s in downloaded), 'Do not import a partial download batch'
for source in downloaded:
    data = (RAW/(source['id']+'.json')).read_bytes()
    assert digest(data)==source['rawSha256'], 'Snapshot hash mismatch'
    features = json.loads(data)['features']
    assert len(features)==source['count'], 'Snapshot record count mismatch'
    import_lines(source, ((f['sourceRecordId'],line) for f in features for line in f['paths']))

# The publicly offered planning ZIP separates routes from intentionally vague
# facility heatmaps. Read only route polylines, never the points or heatmap.
archive = RAW/'kansas-freestate-20240808.zip'
with zipfile.ZipFile(archive) as z:
    kmz = z.read('Final2/Freestate-planning-map.kmz')
with zipfile.ZipFile(io.BytesIO(kmz)) as z:
    kml = ET.fromstring(z.read(next(n for n in z.namelist() if n.endswith('.kml'))))
for placemark in kml.findall('.//k:Placemark',NS):
    lines = placemark.findall('.//k:LineString',NS)
    if not lines:
        continue
    name = placemark.findtext('k:name','',NS)
    assert name in ['New Cable & Duct Path','New Cable Path','Existing Un-Funded Cable Path'], 'Unknown route class requires review'
    existing = name=='Existing Un-Funded Cable Path'
    slug = {'New Cable & Duct Path':'new-cable-duct','New Cable Path':'new-cable','Existing Un-Funded Cable Path':'existing-cable'}[name]
    s = dict(id='ks-freestate-'+slug+'-20260919',name='Kansas Freestate — '+name,
        publisher='Kansas Department of Commerce / Freestate Network',
        pageUrl='https://www.kansascommerce.gov/officeofbroadbanddevelopment/route-maps-and-planning-files/',
        url='https://www.kansascommerce.gov/wp-content/uploads/2024/08/Final186.zip',
        category='existing' if existing else 'planned',
        routeStatus='Existing cable reported in August 2024 plan; current availability unconfirmed' if existing else 'Proposed cable in August 2024 planning file; not confirmed built',
        networkType='Published planning alignment subject to design and permitting changes',
        retrievedAt=NOW,itemModified=None,dataDate=None,sourceVintage='2024-08-08',
        license='Officially offered planning download; preserve attribution. No unrestricted redistribution license established.',
        downloadStatus='complete',rawSha256=digest(archive.read_bytes()),count=len(lines))
    records = [(i,[tuple(float(v) for v in token.split(',')[:2]) for token in line.findtext('k:coordinates','',NS).split()]) for i,line in enumerate(lines)]
    import_lines(s,records)

replace = {s['id'] for s in sources}
features = {}
for code in codes:
    for f in json.loads((OUT/(code+'.geojson')).read_text())['features']:
        if f['properties']['sourceId'] not in replace:
            features[f['properties']['id']] = f
baseline_count = len(features)
for f in additions:
    assert f['properties']['id'] not in features, 'Duplicate generated ID'
    features[f['properties']['id']] = f

shards = {c:[] for c in codes}
overview = []
def parts(f):
    return len(f['geometry']['coordinates']) if f['geometry']['type']=='MultiLineString' else 1

for f in features.values():
    p = f['properties']
    for c in p['states']:
        shards[c].append(f)
    g = shape(f['geometry']).simplify(.002,preserve_topology=True)
    properties = {k:p[k] for k in ['id','sourceId','category','states','routeStatus','carrier','publishedLineParts','importBatch'] if k in p}
    overview.append(dict(type='Feature',geometry=mapping(g),properties=properties,bbox=f['bbox']))
for row in manifest['states']:
    fs = shards[row['code']]
    row.update(segments=len(fs),counts=dict(collections.Counter(f['properties']['category'] for f in fs)),
        sources=sorted({f['properties']['sourceId'] for f in fs}),publishedLineParts=sum(parts(f) for f in fs),
        coverage='Partial published route data; not statewide completeness' if fs else 'No bundled route data; fiber availability unknown')

manifest.update(builtAt=NOW,uniqueSegments=len(features),publishedLineParts=sum(parts(f) for f in features.values()),
    statesWithData=sum(bool(r['segments']) for r in manifest['states']),
    categoryCounts=dict(collections.Counter(f['properties']['category'] for f in features.values())),
    sources=[s for s in manifest['sources'] if s['id'] not in replace]+sources)
manifest['expansionHistory'] = [h for h in manifest.get('expansionHistory',[]) if h.get('id')!=BATCH]+[
    dict(id=BATCH,retrievedAt=NOW,preservedBaselineRecords=baseline_count,addedRecords=len(additions),
         addedLineParts=sum(parts(f) for f in additions),sourceIds=sorted(replace))]
assert len(features)==baseline_count+len(additions) and len(shards)==51

# Stage all generated files before replacing any bundled file.
with tempfile.TemporaryDirectory(prefix='omega-fiber-import-') as temp:
    stage = pathlib.Path(temp)
    payloads = {c+'.geojson':dict(type='FeatureCollection',features=fs) for c,fs in shards.items()}
    payloads.update({'overview.geojson':dict(type='FeatureCollection',features=overview),'manifest.json':manifest})
    for filename,data in payloads.items():
        (stage/filename).write_text(json.dumps(data,separators=(',',':')))
    for filename in payloads:
        os.replace(stage/filename,OUT/filename)
subprocess.run(['node',str(pathlib.Path(__file__).with_name('compress-fiber-shards.js'))],check=True)
print(json.dumps({k:manifest[k] for k in ['uniqueSegments','publishedLineParts','statesWithData','expansionHistory']},indent=2))
