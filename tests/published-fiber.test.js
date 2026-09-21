/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),zlib=require('zlib');
const root=path.resolve(__dirname,'..'),read=p=>JSON.parse(fs.readFileSync(path.join(root,p)));
const m=read('data/usa-fiber/manifest.json'),UI=require('../omega-published-fiber'),ev=require('../api/_lib/fiber-evidence');
test('every detailed state shard is lossless in the deployed API, finite and attributable',()=>{
  const unique=new Set(),sources=new Set(m.sources.map(s=>s.id));let totalParts=0;
  for(const s of m.states){
    const fc=read('data/usa-fiber/'+s.code+'.geojson');
    const packed=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root,'data/fiber-api/'+s.code+'.json.gz'))));
    assert.deepEqual(packed,fc,s.code+' API geometry must equal displayed detail');
    assert.equal(fc.features.length,s.segments);assert.equal(new Set(fc.features.map(f=>f.properties.id)).size,s.segments);
    let stateParts=0;
    for(const f of fc.features){
      assert(sources.has(f.properties.sourceId));assert(f.properties.states.includes(s.code));
      const lines=f.geometry.type==='LineString'?[f.geometry.coordinates]:f.geometry.coordinates;
      for(const line of lines){assert(line.length>=2);for(const q of line)assert(Number.isFinite(q[0])&&Number.isFinite(q[1])&&Math.abs(q[0])<=180&&Math.abs(q[1])<=90);}
      stateParts+=lines.length;if(!unique.has(f.properties.id)){totalParts+=lines.length;unique.add(f.properties.id);}
    }
    assert.equal(stateParts,s.publishedLineParts);
    assert.equal(read('data/usa-fiber/'+s.code+'.overview.geojson').features.length,s.segments);
  }
  assert.equal(unique.size,m.uniqueSegments);assert.equal(totalParts,m.publishedLineParts);
  assert.deepEqual(read('data/fiber-api/manifest.json'),m);
});
test('ten requested priorities lead navigation; empty coverage stays explicit',()=>{
  assert.deepEqual(UI.priority,['TX','GA','IL','NJ','NY','CT','FL','MA','SC','NC']);
  for(const code of UI.priority)assert(m.states.find(s=>s.code===code).segments>0);
  for(const s of m.states.filter(s=>!s.segments))assert.match(s.coverage,/unknown/);
});
test('state/status/source filters do not connect lines or count cross-border duplicates',()=>{
  const tx=read('data/usa-fiber/TX.geojson').features;
  const p=tx.find(f=>f.properties.category==='planned')||tx[0];
  const selected=UI.select([p,p],p.bbox,'TX',p.properties.category,p.properties.sourceId);
  assert.deepEqual(selected,[p]);assert.strictEqual(selected[0].geometry,p.geometry);
  assert.equal(UI.select([p],p.bbox,'CT','all','').length,0);
  assert.equal(UI.select([p],p.bbox,'TX','all','missing-source').length,0);
  assert.notEqual(UI.style({properties:{category:'planned'}}).dashArray,UI.style({properties:{category:'existing'}}).dashArray);
});
test('new priority geometry reaches the shared screening engine and deduplicates state overlaps',()=>{
  for(const code of UI.priority){
    const f=read('data/usa-fiber/'+code+'.geojson').features[0];
    const q=f.geometry.type==='LineString'?f.geometry.coordinates[0]:f.geometry.coordinates[0][0];
    const candidates=ev.usaCandidates(ev.boxAround(q[1],q[0],1));
    assert(candidates.some(x=>x.id===f.properties.id),code+' route must reach API');
    assert.equal(new Set(candidates.map(x=>x.id)).size,candidates.length);
    assert.equal(ev.geometryDistance(q,f.geometry),0);
  }
  const result=ev.screen({lat:42.37,lon:-71.08,radius_km:2,limit:50});
  assert(result.routes.some(r=>r.source_id==='ma-cambridge-published-kmz'));
  assert.equal(result.site_has_fiber,null);assert.equal(result.available_capacity_gbps,null);assert.equal(result.physical_route_diversity,'unconfirmed');
});
test('route popups escape source content and reject script URLs',()=>{
  const html=UI.popup({properties:{name:'<script>x</script>',category:'unknown',sourceUrl:'javascript:alert(1)'}},{},false);
  assert(!html.includes('<script>'));assert(!html.includes('href="javascript:'));assert.match(html,/Simplified/);
});
