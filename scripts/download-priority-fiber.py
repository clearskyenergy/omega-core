# © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
import concurrent.futures, datetime, json, pathlib, urllib.parse, urllib.request, subprocess, sys
ROOT = pathlib.Path(sys.argv[1]) / 'priority-fiber'
ROOT.mkdir(exist_ok=True)
layers = [
 ('vt-state-owned-46', 'Vermont state-owned fiber routes', 'Vermont Department of Public Service / VCGI', 'https://maps.vcgi.vermont.gov/arcgis/rest/services/PSD_services/OPENDATA_PSD_LAYERS_SP_NOCACHE_v1/MapServer/46', '1=1'),
 ('tx-temple-fiber', 'Temple fiber optic lines', 'City of Temple, Texas', 'https://arcgiswap02.ci.temple.tx.us/arcgiswap02/rest/services/Editing/ELECTRIC/FeatureServer/2', "TYPE IN ('MM FIBER OPTIC','SM FIBER OPTIC')"),
 *[('ct-norwalk-'+str(i), 'Norwalk '+name, 'Norwalk CT GIS', 'https://services2.arcgis.com/HfsHDBmkGwb1UtID/ArcGIS/rest/services/Fiber/FeatureServer/'+str(i), '1=1') for i,name in [(0,'City Traffic fiber'),(1,'City MAN fiber'),(2,'Fibertech fiber')]],
 *[('ga-atlanta-'+str(i), name, 'City of Atlanta DPW', 'https://dpwgis.atlantaga.gov/hostingserver/rest/services/Fiber_Assets/FeatureServer/'+str(i), '1=1') for i,name in [(16,'City of Atlanta Fiber'),(17,'Atlanta Unknown/Unmarked Fiber'),(18,'Atlanta GDOT Fiber')]],
]
def request(url, **params):
 j=json.loads(subprocess.check_output(['curl','--fail','--silent','--show-error','--location','--max-time','50',url+'?'+urllib.parse.urlencode(params)]))
 if 'error' in j: raise ValueError(j['error'])
 return j
def download(row):
 sid,name,publisher,url,where=row
 s=dict(id=sid,name=name,publisher=publisher,url=url,status='Status not established',retrievedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),itemModified=None,license='Public agency GIS; no explicit redistribution license identified. Retain attribution; verify terms before external redistribution.',where=where)
 try:
  meta=request(url,f='json')
  if meta.get('geometryType')!='esriGeometryPolyline': raise ValueError('Not a polyline layer')
  s['layerDescription']=meta.get('description','');s['copyrightText']=meta.get('copyrightText','')
  s['fields']=meta.get('fields',[])
  ids=request(url+'/query',f='json',where=where,returnIdsOnly='true').get('objectIds') or []
  oid=meta.get('objectIdField') or next(f['name'] for f in meta['fields'] if f['type']=='esriFieldTypeOID')
  # Only public route geometry and an opaque record ID. No asset access/contact fields.
  features=[]
  for i in range(0,len(ids),150):
   j=request(url+'/query',f='json',objectIds=','.join(map(str,ids[i:i+150])),outFields=oid,outSR=4326,returnGeometry='true',returnZ='false',returnM='false')
   if j.get('exceededTransferLimit'): raise ValueError('Transfer limit; refusing incomplete batch')
   for f in j.get('features',[]):
    paths=(f.get('geometry') or {}).get('paths',[])
    if not paths: continue
    features.append(dict(type='Feature',properties={'sourceRecordId':str(f['attributes'][oid])},geometry={'type':'MultiLineString','coordinates':paths}))
  if len(features)!=len(ids): raise ValueError('Missing or geometry-less records: '+str((len(features),len(ids))))
  (ROOT/(sid+'.json')).write_text(json.dumps(dict(type='FeatureCollection',features=features),separators=(',',':')))
  s.update(downloadStatus='complete',count=len(ids))
 except Exception as e: s.update(downloadStatus='failed',error=str(e))
 print(sid,s['downloadStatus'],s.get('count',s.get('error')),flush=True)
 return s
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool: sources=list(pool.map(download,layers))
(ROOT/'sources.json').write_text(json.dumps(sources,indent=2))

