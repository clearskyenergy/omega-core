# © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
"""Fetch only registered public line layers into a separate raw-input directory.

python scripts/download-fiber-expansion.py /absolute/raw-directory
No credentials, point assets, free-text descriptions or contact fields are read
from feature records. TLS validation stays enabled. Fail closed on count drift,
duplicate IDs, partial pages, non-public items or unexpected geometry types.
"""
import concurrent.futures, datetime, hashlib, json, pathlib, subprocess, sys
from urllib.parse import urlencode

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = pathlib.Path(sys.argv[1]).resolve()
if ROOT == OUT or ROOT in OUT.parents:
    raise SystemExit('Raw inputs must stay outside the deployable project')
OUT.mkdir(parents=True, exist_ok=True)
SPECS = json.loads((pathlib.Path(sys.argv[2]) if len(sys.argv)>2 else ROOT / 'scripts/fiber-expansion-sources.json').read_text())

def get(url, params):
    response = subprocess.run(['curl', '--fail', '--silent', '--show-error',
        '--location', '--proto', '=https', '--proto-redir', '=https',
        '--max-time', '90', '--retry', '2', url + '?' + urlencode(params)],
        check=True, capture_output=True).stdout
    data = json.loads(response)
    if data.get('error'):
        raise ValueError(str(data['error']))
    return data

def iso(ms):
    return datetime.datetime.fromtimestamp(ms/1000, datetime.timezone.utc).isoformat() if ms else None

def download(spec):
    s = dict(spec)
    s['retrievedAt'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    try:
        item = get('https://www.arcgis.com/sharing/rest/content/items/' + s['itemId'], {'f':'json'})
        assert item['access'] == 'public', 'Source item is not public'
        meta = get(s['url'], {'f':'json'})
        assert meta['geometryType'] == 'esriGeometryPolyline', 'Not a line layer'
        oid = next(f['name'] for f in meta['fields'] if f['type'] == 'esriFieldTypeOID')
        s.update(itemModified=iso(item.get('modified')),
            dataDate=iso(meta.get('editingInfo', {}).get('dataLastEditDate')),
            license=item.get('licenseInfo') or 'Public map; no explicit redistribution license in item metadata. Retain attribution and verify provider terms.',
            copyrightText=meta.get('copyrightText') or s['publisher'])
        query = {'where':s.get('where','1=1'), 'f':'json'}
        count = get(s['url'] + '/query', dict(query, returnCountOnly='true'))['count']
        assert 0 < count <= 350000, 'Empty source or unexpectedly large count; review before importing'
        limit = min(meta.get('maxRecordCount',1000), 2000)
        features, seen = [], set()
        for offset in range(0, count, limit):
            page = get(s['url'] + '/query', dict(query, outFields=oid,
                orderByFields=oid + ' ASC', outSR=4326, returnGeometry='true',
                returnZ='false', returnM='false', resultOffset=offset, resultRecordCount=limit))
            fs = page.get('features', [])
            assert len(fs) == min(limit,count-offset), 'Incomplete page'
            for f in fs:
                record = f['attributes'][oid]
                assert record not in seen, 'Duplicate source ID during paging'
                seen.add(record)
                paths = (f.get('geometry') or {}).get('paths', [])
                features.append({'sourceRecordId':record,'paths':paths})
            print(s['id'], len(features), '/', count, flush=True)
        assert get(s['url'] + '/query', dict(query,returnCountOnly='true'))['count'] == count, 'Source changed while downloading'
        content = json.dumps({'features':features},separators=(',',':')).encode()
        (OUT / (s['id'] + '.json')).write_bytes(content)
        s.update(downloadStatus='complete',count=count,rawSha256=hashlib.sha256(content).hexdigest())
    except Exception as e:
        s.update(downloadStatus='failed',error=str(e))
        print(s['id'], 'FAILED', str(e), flush=True)
    return s

with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    results = list(pool.map(download, SPECS))
(OUT / 'sources.json').write_text(json.dumps(results, indent=2))
if any(s['downloadStatus'] != 'complete' for s in results):
    raise SystemExit('At least one download failed; existing bundled data was not changed')
