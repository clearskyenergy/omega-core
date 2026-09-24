#!/usr/bin/env python3
# © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
"""Import ONLY published CNS fiber lines from the Telecom Ramblings-linked KMZ.
Usage: python3 scripts/import-cambridge-fiber.py /path/to/CambridgeNetworkSolutions.kmz
Raw points, descriptions, contacts and image overlays are deliberately omitted.
Then run node scripts/import-published-fiber.js to rebuild indexes/API shards.
"""
import datetime, hashlib, json, math, pathlib, sys, zipfile
import xml.etree.ElementTree as ET
root = pathlib.Path(__file__).resolve().parents[1] / 'data/usa-fiber'
raw = pathlib.Path(sys.argv[1]).read_bytes()
with zipfile.ZipFile(sys.argv[1]) as archive:
    tree = ET.fromstring(archive.read('doc.kml'))
ns = {'k': 'http://www.opengis.net/kml/2.2'}
now = datetime.datetime.now(datetime.timezone.utc).isoformat()
sid = 'ma-cambridge-published-kmz'
url = 'https://telecomramblings.com/files/media/CambridgeNetworkSolutions.kmz'
features, seen, excluded = [], set(), 0
for p in tree.findall('.//k:Placemark', ns):
    name = p.findtext('k:name', default='', namespaces=ns)
    if name not in ('CNS fiber', 'CNS in progress'):
        continue
    for line in p.findall('.//k:LineString', ns):
        coords = [list(map(float, q.split(',')[:2])) for q in line.findtext('k:coordinates', default='', namespaces=ns).split()]
        if len(coords) < 2 or len(set(tuple(q) for q in coords)) < 2:
            excluded += 1
            continue
        # Reviewed source extent: Boston/Cambridge/Lowell, entirely in MA.
        if any(len(q)!=2 or not all(math.isfinite(v) for v in q) or not (-72<q[0]<-70 and 42<q[1]<42.8) for q in coords):
            raise ValueError('Unexpected CNS source extent; review state attribution')
        key = hashlib.sha256(json.dumps(coords).encode()).hexdigest()[:20]
        if key in seen:
            excluded += 1
            continue
        seen.add(key)
        planned = name == 'CNS in progress'
        bbox = [min(q[0] for q in coords), min(q[1] for q in coords), max(q[0] for q in coords), max(q[1] for q in coords)]
        features.append(dict(type='Feature', bbox=bbox, geometry=dict(type='LineString',coordinates=coords), properties=dict(
            id=sid+'-'+key, sourceId=sid, source='Cambridge Network Solutions published KMZ', sourceUrl=url,
            name=name, carrier='Cambridge Network Solutions (as published)', states=['MA'],
            category='planned' if planned else 'unknown', routeStatus='In progress in undated source; current completion unknown' if planned else 'Fiber in undated publisher map; current operational status unknown',
            evidence='publisher_route', retrievedAt=now, dataDate=None, metadataModified=None, publishedLineParts=1,
            networkType='Published metro fiber; positional accuracy unverified', serviceability='Unconfirmed', routeDiversity='Unconfirmed')))
manifest = json.loads((root/'manifest.json').read_text())
source = dict(id=sid,name='Cambridge Network Solutions — Boston / Cambridge / Lowell',publisher='Cambridge Network Solutions; hosted by Telecom Ramblings',
    url=url,discoveryUrl='https://www.telecomramblings.com/metro-fiber-maps/new-england/',retrievedAt=now,dataDate=None,
    rawSha256=hashlib.sha256(raw).hexdigest(),includedFeatures=len(features),count=len(features),excludedInvalidOrDuplicate=excluded,
    license='Public operator map linked and hosted by Telecom Ramblings. Attribution retained; no unrestricted redistribution license stated.',
    status='Undated map; current ownership and operational status unverified')
manifest['sources']=[s for s in manifest['sources'] if s['id']!=sid]+[source]
manifest['builtAt']=now
for file in ['MA.geojson','overview.geojson']:
    fc=json.loads((root/file).read_text())
    fc['features']=[f for f in fc['features'] if f['properties']['sourceId']!=sid]+features
    (root/file).write_text(json.dumps(fc,separators=(',',':')))
(root/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('Massachusetts:',len(features),'published lines;',excluded,'invalid/duplicate excluded')
