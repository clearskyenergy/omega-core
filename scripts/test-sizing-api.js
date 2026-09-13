/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
const assert=require('assert'),fs=require('fs'),vm=require('vm');
const engine=require('../api/_lib/bess-engine'),tool=require('../api/_lib/battery-tool-engine');
function handler(tier,staff){const box={module:{exports:{}},require:n=>n.includes('verify-token')?{authenticateWithTier:()=>Promise.resolve({tier,caller:{staff},billing:{}}),httpError:(status,message)=>Object.assign(new Error(message),{status})}:n.includes('battery-tool-engine')?tool:engine};vm.runInNewContext(fs.readFileSync('api/bess-size.js','utf8'),box);return box.module.exports;}
async function call(h,body,method='POST'){const result={};const res={setHeader(){},status(n){result.status=n;return this;},json(j){result.body=j;return this;}};await h({method,body},res);return result;}
(async()=>{
 assert.equal((await call(handler('trial',false),{})).status,403);
 assert.equal((await call(handler('deluxe',false),{},'GET')).status,405);
 assert.equal((await call(handler('deluxe',false),{mode:'interval',data:[]})).status,422);
 assert.equal((await call(handler('deluxe',false),{mode:'tool-interval',data:[],durations:[2]})).status,400);
 const r=await call(handler('standard',false),{mode:'monthly',data:[{demandKw:1000,kwh:200000}]});assert.equal(r.status,200);assert(Number.isFinite(r.body.recommended.capex));
 const r2=await call(handler('deluxe',false),{mode:'tool-monthly',durations:[2],settings:{rte:0},data:[{peak:1000,kwh:200000,days:30,rate:18}]});assert.equal(r2.status,400);
 console.log('6 sizing API authorization/input contract checks passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
