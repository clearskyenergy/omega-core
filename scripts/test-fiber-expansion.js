/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var assert=require('assert'),fs=require('fs'),inventory=require('../api/_lib/fiber-evidence');
var m=require('../data/usa-fiber/manifest.json'),research=require('../data/usa-fiber/research-sources.json');
assert.deepStrictEqual(research.priorityOrder,['TX','GA','IL','CT','OH','FL','SC','CA']);
var ids={},parts=0,records=0,sampled={},sourceCounts={};
m.states.forEach(function(s){
 assert(research.references.some(function(r){return r.state===s.code;}),'Every state/DC has an honest research status');
 var fc=JSON.parse(fs.readFileSync('data/usa-fiber/'+s.code+'.geojson','utf8')),stateParts=0;
 fc.features.forEach(function(f){
  var p=f.properties,lines=f.geometry.type==='LineString'?[f.geometry.coordinates]:f.geometry.coordinates;
  var n=p.publishedLineParts||lines.length;stateParts+=n;
  if(ids[p.id])return;ids[p.id]=true;records++;parts+=n;
  if(!/^(fna-|logix-|ct-norwalk-|ga-atlanta-)/.test(p.sourceId))return;
  sourceCounts[p.sourceId]=(sourceCounts[p.sourceId]||0)+1;
  assert.equal(p.category,'unknown');assert.equal(p.serviceability,'Unconfirmed');assert.equal(p.routeDiversity,'Unconfirmed');
  assert.equal(p.dataDate,null);assert.equal(p.publishedLineParts,lines.length);
  assert(!Object.keys(p).some(function(k){return /email|phone|contact|description/i.test(k);}));
  lines.forEach(function(line){assert(line.length>=2);line.forEach(function(c){assert(c.length===2);assert(c.every(Number.isFinite));assert(c[0]>=-180&&c[0]<=180&&c[1]>=-90&&c[1]<=90);assert(c[0]>=f.bbox[0]&&c[0]<=f.bbox[2]&&c[1]>=f.bbox[1]&&c[1]<=f.bbox[3]);});});
  if(!sampled[p.sourceId]){sampled[p.sourceId]=true;var c=lines[0][0];var candidates=inventory.usaCandidates([c[0]-.02,c[1]-.02,c[0]+.02,c[1]+.02]);var found=candidates.some(function(x){return x.id===p.id&&inventory.geometryDistance(c,x.geometry)<0.01;});assert(found,'New source is reachable through the production shared API library');assert.equal(new Set(candidates.map(function(x){return x.id;})).size,candidates.length,'Cross-border records are returned once');}
 });
 assert.equal(stateParts,s.publishedLineParts);
});
assert.equal(records,m.uniqueSegments);assert.equal(parts,m.publishedLineParts);
m.sources.forEach(function(s){if(sourceCounts[s.id])assert.equal(sourceCounts[s.id],s.includedFeatures);});
var fna=m.sources.find(function(s){return s.id==='fna-member-routes-20260918';});
assert.equal(fna.inputLineParts,fna.includedLineParts+fna.duplicateLineParts+fna.invalidLineParts+fna.outsideStateBoundaries);
assert.equal(m.states.filter(function(s){return s.segments>0;}).length,m.statesWithData);
var atlas=fs.readFileSync('grid-atlas.html','utf8');
assert(/pf_inventory: \{/.test(atlas),'Expanded inventory remains in the current Grid Atlas layer registry');
assert(/usa-fiber-map\.html/.test(atlas)&&/fiber-research\.html/.test(atlas),'State maps and research are reachable from Grid Atlas');
console.log('PASS nationwide research order, coordinate/bbox validation, line-part accounting, production API lookup, cross-border deduplication, provenance minimization and atlas navigation');
