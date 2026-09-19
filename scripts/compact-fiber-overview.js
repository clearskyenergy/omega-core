/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
// Only the already-generalized low-zoom overview is rounded. Detailed state
// shards retain source coordinate precision and are the only API inputs.
var fs=require('fs'),path=require('path'),file=path.join(__dirname,'../data/usa-fiber/overview.geojson');
var raw=fs.readFileSync(file,'utf8'),fc=JSON.parse(raw);
function round(v){return typeof v==='number'?Math.round(v*1e6)/1e6:v.map(round);}
fc.features.forEach(function(f){f.geometry.coordinates=round(f.geometry.coordinates);});
var compact=JSON.stringify(fc);
if(process.argv.indexOf('--check')>=0){if(raw!==compact)throw new Error('Regenerate the compact fiber overview');}
else if(raw!==compact)fs.writeFileSync(file,compact);
console.log('Low-zoom overview: '+(Buffer.byteLength(compact)/1e6).toFixed(1)+' MB; six-decimal display coordinates; detailed source paths unchanged.');
