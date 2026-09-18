"""© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential."""
import importlib.util,json,pathlib,tempfile,unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
def module(file):
    spec=importlib.util.spec_from_file_location(file,ROOT/'scripts'/file);mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod);return mod
pipeline=module('fiber-data.py');fcc=module('import-fcc.py')
class Tests(unittest.TestCase):
    def test_buildings_copper_subsea_and_planned_are_not_live_fiber(self):
        def elem(id,t):return {'type':'way','id':id,'tags':t,'geometry':[{'lon':-87,'lat':41},{'lon':-87.01,'lat':41.01}]}
        cases=[elem(1,{'communication':'line','telecom:medium':'fibre','capacity':'144'}),elem(2,{'communication':'line'}),elem(3,{'communication':'line','telecom:medium':'copper'}),elem(4,{'telecom':'exchange','telecom:medium':'fibre'}),elem(5,{'communication':'line','telecom:medium':'fibre','location':'underwater'}),elem(6,{'communication':'line','telecom:medium':'fibre','construction':'yes'})]
        with tempfile.TemporaryDirectory() as d:
            p=pathlib.Path(d);(p/'osm-post.json').write_text(json.dumps({'elements':cases}))
            routes,unknown,facilities,meta=pipeline.osm_data(p,'2026-09-18')
            self.assertEqual(len(routes),2);self.assertEqual(len(unknown),1);self.assertEqual(len(facilities),1)
            self.assertEqual(routes[0]['properties']['fiber_strands_reported'],144)
            self.assertEqual(routes[0]['properties']['offered_capacity_gbps'],None)
            self.assertFalse(routes[1]['properties']['proximity_eligible'])
    def test_truncated_source_fails_instead_of_becoming_empty_coverage(self):
        with tempfile.TemporaryDirectory() as d:
            p=pathlib.Path(d);(p/'osm-post.json').write_text(json.dumps({'elements':[],'remark':'timeout'}))
            with self.assertRaises(RuntimeError):pipeline.osm_data(p,'2026-09-18')
    def test_fcc_speed_is_advertised_not_enterprise_capacity_and_id_is_preserved(self):
        with tempfile.TemporaryDirectory() as d:
            p=pathlib.Path(d)/'test.csv';p.write_text('location_id,technology,max_advertised_download_speed,max_advertised_upload_speed,provider_id\n0000123456,50,1000,500,123\n0000123456,40,1000,30,456\n')
            rows=list(fcc.rows(p,'2025-12-31'));self.assertEqual(len(rows),1);self.assertEqual(rows[0]['location_id'],'0000123456');self.assertEqual(rows[0]['advertised_download_gbps'],1);self.assertIsNone(rows[0]['enterprise_capacity_gbps']);self.assertIsNone(rows[0]['geometry'])
if __name__=='__main__':unittest.main()
