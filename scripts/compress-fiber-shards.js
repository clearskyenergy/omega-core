/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
// Offline data packaging, not an application build step. Commit these files.
// --check verifies byte-for-byte parity without writing anything.
var fs=require('fs'),path=require('path'),zlib=require('zlib'),assert=require('assert');
var root=path.join(__dirname,'../data/usa-fiber'),m=require('../data/usa-fiber/manifest.json');
var check=process.argv.indexOf('--check')>=0,plainBytes=0,packedBytes=0;
m.states.forEach(function(s){
 var file=path.join(root,s.code+'.geojson'),plain=fs.readFileSync(file),packed;
 if(check){packed=fs.readFileSync(file+'.gz');assert(zlib.gunzipSync(packed).equals(plain),'Stale compressed shard: '+s.code);}
 else {packed=zlib.gzipSync(plain,{level:9});fs.writeFileSync(file+'.gz',packed);}
 plainBytes+=plain.length;packedBytes+=packed.length;
});
console.log((check?'PASS byte-identical':'Packaged')+' 51 fiber shards: '+(plainBytes/1e6).toFixed(1)+' MB JSON / '+(packedBytes/1e6).toFixed(1)+' MB gzip');
