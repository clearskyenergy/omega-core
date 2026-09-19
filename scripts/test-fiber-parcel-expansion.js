/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var fs=require('fs'),assert=require('assert'),m=require('../data/usa-fiber/manifest.json'),E=require('../api/_lib/fiber-evidence'),seen=new Set(),counts={},parts={},sample={};
var h=m.expansionHistory.find(function(x){return x.id==='20260919-parcel';});assert(h&&h.addedRecords===8989&&h.addedLineParts===549825);
m.states.forEach(function(s){var file='data/usa-fiber/'+s.code+'.geojson';assert(fs.statSync(file).size<100*1024*1024);JSON.parse(fs.readFileSync(file)).features.forEach(function(f){var p=f.properties;if(p.importBatch!==h.id||seen.has(p.id))return;seen.add(p.id);counts[p.sourceId]=(counts[p.sourceId]||0)+1;parts[p.sourceId]=(parts[p.sourceId]||0)+p.publishedLineParts;sample[p.sourceId]=f;
 assert.equal(f.geometry.type,'MultiLineString');assert.equal(f.geometry.coordinates.length,p.publishedLineParts);assert(p.publishedLineParts<=100);assert(p.sourceRecordIds.every(function(id){return /^\d+$/.test(id);}));
 f.geometry.coordinates.forEach(function(line){assert(line.length>=2);line.forEach(function(c){assert(c.length===2&&c.every(Number.isFinite));assert(c[0]>=f.bbox[0]&&c[0]<=f.bbox[2]&&c[1]>=f.bbox[1]&&c[1]<=f.bbox[3]);});});
 if(p.sourceId==='il-silvis-reference-20260919'){assert.equal(p.proximityEligible,false);assert.equal(p.dataDate,'approximately 2014');assert.equal(E.usaAdapt(f).properties.proximity_eligible,false);}
 if(p.sourceId==='uniti-developing-20260919'){assert.equal(p.category,'planned');assert.equal(E.usaAdapt(f).properties.proximity_eligible,false);}
 if(p.sourceId==='tx-roundrock-existing-20260919')assert.equal(p.category,'existing');
 });});
h.sourceIds.forEach(function(id){var s=m.sources.find(function(x){return x.id===id;});assert.equal(counts[id],s.includedFeatures);assert.equal(parts[id],s.includedLineParts);assert.equal(s.inputLineParts,['includedLineParts','duplicateLineParts','invalidLineParts','outsideStateBoundaries'].reduce(function(n,k){return n+(s[k]||0);},0));assert(s.rawSha256&&s.downloadStatus==='complete');var p=sample[id].geometry.coordinates[0][0];assert(E.usaCandidates([p[0]-.001,p[1]-.001,p[0]+.001,p[1]+.001]).some(function(f){return f.id===sample[id].properties.id;}));});
assert.equal(seen.size,h.addedRecords);assert(fs.statSync('data/usa-fiber/overview.geojson').size<100*1024*1024);
console.log('PASS parcel expansion: 8,989 records, 549,825 line parts, source audits, geometry, historical/planned exclusions, production reachability and file-size limits.');
