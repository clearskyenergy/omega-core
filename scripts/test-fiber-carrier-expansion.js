/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var assert=require('assert'),fs=require('fs'),path=require('path');
var m=require('../data/usa-fiber/manifest.json'),api=require('../api/_lib/fiber-evidence');
var history=m.expansionHistory.find(function(h){return h.id==='20260919';});
var counts={},lineCounts={},seen=new Set(),samples={},records=0,parts=0;
assert(history,'Carrier import audit is present');
m.states.forEach(function(s){
 var fc=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/usa-fiber/'+s.code+'.geojson')));
 fc.features.forEach(function(f){
  var p=f.properties;if(p.importBatch!=='20260919'||seen.has(p.id))return;seen.add(p.id);
  var lines=f.geometry.type==='LineString'?[f.geometry.coordinates]:f.geometry.coordinates;
  assert.equal(lines.length,p.publishedLineParts);assert(lines.length<=100);
  assert.equal(p.geometryQuality,'publisher_geometry_unverified');
  assert.equal(p.serviceability,'Unconfirmed');assert.equal(p.routeDiversity,'Unconfirmed');assert.equal(p.dataDate,null);
  assert(p.sourceRecordIds.length>0&&p.sourceRecordIds.every(function(id){return /^\d+$/.test(id);}));
  assert(!Object.keys(p).some(function(k){return /email|phone|contact|popup|description/i.test(k);}));
  lines.forEach(function(line){assert(line.length>=2);line.forEach(function(c){assert(c.length===2&&c.every(Number.isFinite));assert(c[0]>=-180&&c[0]<=180&&c[1]>=-90&&c[1]<=90);assert(c[0]>=f.bbox[0]&&c[0]<=f.bbox[2]&&c[1]>=f.bbox[1]&&c[1]<=f.bbox[3]);});});
  if(p.sourceId.indexOf('ks-freestate-new-')===0){assert.equal(p.category,'planned');assert.equal(api.usaAdapt(f).properties.proximity_eligible,false);}
  else if(p.sourceId.indexOf('ks-freestate-existing-')===0)assert.equal(p.category,'existing');
  else assert.equal(p.category,'unknown');
  if(!samples[p.sourceId])samples[p.sourceId]=f;
  counts[p.sourceId]=(counts[p.sourceId]||0)+1;lineCounts[p.sourceId]=(lineCounts[p.sourceId]||0)+lines.length;records++;parts+=lines.length;
 });
});
assert.equal(records,history.addedRecords);assert.equal(parts,history.addedLineParts);
assert(m.uniqueSegments>=history.preservedBaselineRecords+history.addedRecords,'Later additive batches preserve the earlier inventory');
// Simulate production: raw national shards are deliberately not bundled.
var read=fs.readFileSync;
fs.readFileSync=function(file){
 assert(!/[/\\]usa-fiber[/\\][A-Z]{2}\.geojson$/.test(String(file)),'Production lookup must use compressed state shards');
 return read.apply(fs,arguments);
};
history.sourceIds.forEach(function(id){
 var source=m.sources.find(function(s){return s.id===id;}),f=samples[id];
 assert(source&&f);assert.equal(counts[id],source.includedFeatures);assert.equal(lineCounts[id],source.includedLineParts);
 assert.equal(source.inputLineParts,['includedLineParts','duplicateLineParts','invalidLineParts','outsideStateBoundaries'].reduce(function(n,k){return n+(source[k]||0);},0));
 var c=f.geometry.coordinates[0][0];
 assert(api.usaCandidates([c[0]-.02,c[1]-.02,c[0]+.02,c[1]+.02]).some(function(x){return x.id===f.properties.id&&api.geometryDistance(c,x.geometry)<.01;}),'Compressed production lookup reaches '+id);
});
fs.readFileSync=read;
var deploy=require('../vercel.json');
['api/fiber-screen.js','api/network-proximity.js','api/dc-site-screen.js'].forEach(function(file){
 assert.equal(deploy.functions[file].includeFiles,'{data/fiber/**,data/usa-fiber/*.geojson.gz,data/usa-fiber/manifest.json}');
 assert.equal(deploy.functions[file].excludeFiles,'data/usa-fiber/*.geojson');
});
var overview=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/usa-fiber/overview.geojson')));
assert.equal(overview.features.filter(function(f){return f.properties.importBatch==='20260919';}).length,history.addedRecords,'Overview preserves latest-batch filtering');
var images=require('../data/usa-fiber/map-references.json');
images.maps.forEach(function(r){assert(/^https:\/\//.test(r.sourceUrl));assert(!r.geometry&&!r.bounds,'Images are not unverified map overlays');if(r.imageUrl)assert(/^https:\/\//.test(r.imageUrl));assert(r.vintage&&r.note&&r.publisher);});
['TX','GA','IL','CT','OH','FL','SC','CA'].forEach(function(code){assert(images.maps.some(function(r){return r.states.indexOf(code)>=0;}));});
var ui=fs.readFileSync(path.join(__dirname,'../fiber-map-references.js'),'utf8');
assert(!/geoJSON|imageOverlay|polyline/.test(ui),'Image gallery cannot inject geometry into route distance/scoring');
assert(/usaFiberSource/.test(fs.readFileSync(path.join(__dirname,'../grid-atlas-usa-fiber.js'),'utf8')));
console.log('PASS carrier GIS + Kansas status separation, metadata minimization, geometry bounds, audit totals, compressed API lookup, image isolation and priority-state references');
