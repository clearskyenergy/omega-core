#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
// Add an inspected inventory snapshot without dropping any existing source IDs.
// Geometry is copied losslessly. Compressed API shards use the same coordinates.
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const root = path.resolve(__dirname, '../data/usa-fiber');
const incoming = path.resolve(process.argv[2] || root);
const read = (dir, name) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
const old = read(root, 'manifest.json'), next = read(incoming, 'manifest.json');
const records = new Map(), overviews = new Map(), sources = new Map();
for (const dir of [...new Set([root, incoming])]) {
  const m = read(dir, 'manifest.json');
  for (const s of m.sources) sources.set(s.id, s);
  for (const s of m.states) {
    for (const f of read(dir, s.code + '.geojson').features) {
      const p = f.properties, lines = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates;
      if (!p.id || !p.sourceId || !['LineString', 'MultiLineString'].includes(f.geometry.type)) throw Error('Invalid route');
      if (!lines.length || lines.some(line => line.length < 2 || line.some(q => !Number.isFinite(q[0]) || !Number.isFinite(q[1]) || Math.abs(q[0]) > 180 || Math.abs(q[1]) > 90))) throw Error('Invalid coordinates: ' + p.id);
      const prev = records.get(p.id);
      if (prev && JSON.stringify(prev.geometry) !== JSON.stringify(f.geometry)) throw Error('Geometry changed for existing ID: ' + p.id);
      records.set(p.id, f);
    }
  }
  for (const f of read(dir, 'overview.geojson').features) overviews.set(f.properties.id, f);
}
const priority = ['TX','GA','IL','NJ','NY','CT','FL','MA','SC','NC'];
const count = list => list.reduce((a,f) => { const c=f.properties.category; a[c]=(a[c]||0)+1; return a; }, {});
const parts = f => f.geometry.type === 'MultiLineString' ? f.geometry.coordinates.length : 1;
const all = [...records.values()];
const output = new Map();
const states = next.states.map(s => {
  const fs = all.filter(f => f.properties.states.includes(s.code));
  output.set(s.code + '.geojson', JSON.stringify({type:'FeatureCollection', features:fs}));
  return {...s, segments:fs.length, publishedLineParts:fs.reduce((n,f)=>n+parts(f),0), counts:count(fs), sources:[...new Set(fs.map(f=>f.properties.sourceId))], coverage:fs.length?'Partial published routes; statewide completeness and positional accuracy unverified':'No bundled route geometry; fiber availability unknown'};
});
for (const f of all) {
  if (!sources.has(f.properties.sourceId) || !overviews.has(f.properties.id)) throw Error('Missing source or overview: '+f.properties.id);
}
const manifest = {...next, builtAt:next.builtAt, integratedAt:new Date().toISOString(), priorityStates:priority, sources:[...sources.values()], states,
  uniqueSegments:all.length, publishedLineParts:all.reduce((n,f)=>n+parts(f),0), statesWithData:states.filter(s=>s.segments).length, categoryCounts:count(all),
  preservedProductionRecords:old.preservedBaselineRecords||old.preservedProductionRecords||old.uniqueSegments, recordCountNote:'Source map records and line parts are not unique physical cables. Overlapping publishers can describe the same infrastructure.'};
output.set('overview.geojson', JSON.stringify({type:'FeatureCollection',features:all.map(f=>overviews.get(f.properties.id))}));
output.set('manifest.json', JSON.stringify(manifest,null,2)+'\n');
// State-specific overviews avoid transferring the national geometry for deep links.
for (const s of states) output.set(s.code+'.overview.geojson',JSON.stringify({type:'FeatureCollection',features:all.filter(f=>f.properties.states.includes(s.code)).map(f=>overviews.get(f.properties.id))}));
for (const [name, data] of output) fs.writeFileSync(path.join(root,name),data);
// API-only compressed files are outside the static inventory include pattern.
const apiRoot = path.resolve(__dirname,'../data/fiber-api');
fs.mkdirSync(apiRoot,{recursive:true});
fs.writeFileSync(path.join(apiRoot,'manifest.json'),output.get('manifest.json'));
for(const s of states) fs.writeFileSync(path.join(apiRoot,s.code+'.json.gz'),zlib.gzipSync(output.get(s.code+'.geojson'),{level:9}));
console.log(JSON.stringify({records:all.length,lineParts:manifest.publishedLineParts,stateAreas:manifest.statesWithData,priority:states.filter(s=>priority.includes(s.code)).map(s=>({state:s.code,records:s.segments,lineParts:s.publishedLineParts}))},null,2));
