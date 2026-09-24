#!/usr/bin/env python3
"""© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
Optional state coverage summary. Requires shapely; never interprets records as coverage.
"""
import argparse,json,pathlib
from shapely.geometry import shape
from shapely.strtree import STRtree
ROOT=pathlib.Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--states',type=pathlib.Path,required=True);a=p.parse_args()
states=json.loads(a.states.read_text())['features'];folder=ROOT/'data/fiber'
files={'mapped_fiber_records':'osm-fiber-routes.geojson','unknown_medium_records':'osm-telecom-routes-unknown.geojson','telecom_facility_records':'osm-telecom-facilities.geojson','california_design_records':'ca-middle-mile-design.geojson'}
trees={}
for key,file in files.items():
    geometries=[shape(f['geometry']) for f in json.loads((folder/file).read_text())['features']]
    trees[key]=STRtree(geometries)
results=[]
for state in states:
    p=state['properties'];g=shape(state['geometry']);item={'state':p['STUSAB'],'name':p['NAME']}
    for k,tree in trees.items():item[k]=len(tree.query(g,predicate='intersects'))
    item['inventory_completeness']='unknown';item['site_capacity_records']=0;results.append(item)
results.sort(key=lambda x:x['state'])
m=json.loads((folder/'manifest.json').read_text())
out={'dataset_built_at':m['built_at'],'method':'Feature intersection with generalized U.S. Census state geometry. Border-crossing routes can count in more than one state. Counts are source records, not sites served or unique cable routes. Small offshore geometry can fall outside generalized boundaries.',
     'boundary_source':'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/0','states':results}
(folder/'coverage-by-state.json').write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps({'jurisdictions':len(results),'states_with_mapped_fiber':sum(x['mapped_fiber_records']>0 for x in results if x['state'] not in ('DC','PR','VI','GU','MP','AS')),'states_with_facilities':sum(x['telecom_facility_records']>0 for x in results if x['state'] not in ('DC','PR','VI','GU','MP','AS')),'focus':[x for x in results if x['state'] in ('IA','IL','CT','NJ','MA','AK','HI')]}))
