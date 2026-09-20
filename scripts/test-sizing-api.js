/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
const assert=require('assert'),fs=require('fs'),vm=require('vm');
const tool=require('../api/_lib/battery-tool-engine');
const adapter=require('../api/_lib/bess-size-adapter');
const design=require('../api/_lib/bess-design-engine');
function stubAuth(tier,staff,billing){return{authenticateWithTier:()=>Promise.resolve({tier,caller:{staff},billing:billing||{}}),httpError:(status,message)=>Object.assign(new Error(message),{status})};}
/* Map every module bess-size.js requires. A stub that falls through to one
   default module is how the adapter got handed the retired engine and the
   endpoint answered 500 to a valid request. */
function handler(tier,staff){const box={module:{exports:{}},require:n=>{
  if(n.includes('verify-token'))return stubAuth(tier,staff);
  if(n.includes('battery-tool-engine'))return tool;
  if(n.includes('bess-size-adapter'))return adapter;
  throw new Error('bess-size.js required an unstubbed module: '+n);
}};vm.runInNewContext(fs.readFileSync('api/bess-size.js','utf8'),box);return box.module.exports;}
/* The design endpoint carries the same gate as the sizer, so it gets the
   same adversarial pass: an ungated tier, a wrong method, an out-of-range
   number and a cross-field contradiction all have to be refused BEFORE the
   engine runs, because the engine will happily divide by whatever it is
   handed. */
function designHandler(tier,staff,billing){const box={module:{exports:{}},require:n=>n.includes('verify-token')?stubAuth(tier,staff,billing):design,Date};vm.runInNewContext(fs.readFileSync('api/bess-design.js','utf8'),box);return box.module.exports;}
async function call(h,body,method='POST'){const result={};const res={setHeader(){},status(n){result.status=n;return this;},json(j){result.body=j;return this;}};await h({method,body},res);return result;}
(async()=>{
 assert.equal((await call(handler('trial',false),{})).status,403);
 assert.equal((await call(handler('deluxe',false),{},'GET')).status,405);
 /* An empty reading list is a MALFORMED request, not a well-formed one the
    engine cannot answer, so it is refused before the engine is asked. It
    returned 422 while the editor ran its own engine, which reached the
    engine first and let it decline. 422 is still used, for data the engine
    accepts and cannot size. Either way the editor surfaces the message. */
 assert.equal((await call(handler('deluxe',false),{mode:'interval',data:[]})).status,400);
 assert.equal((await call(handler('deluxe',false),{mode:'monthly',data:[]})).status,400);
 assert.equal((await call(handler('deluxe',false),{mode:'tool-interval',data:[],durations:[2]})).status,400);
 const r=await call(handler('standard',false),{mode:'monthly',data:[{demandKw:1000,kwh:200000}]});assert.equal(r.status,200);assert(Number.isFinite(r.body.recommended.capex));
 /* Both editor modes must now name the shared engine; a fork back to a
    second sizing model is the regression this line exists to catch. */
 assert.equal(r.body.engine,'battery-tool-engine');
 const ri=await call(handler('standard',false),{mode:'interval',data:new Array(744).fill(500),opts:{intervalMin:60}});
 assert.equal(ri.status,200);assert.equal(ri.body.engine,'battery-tool-engine');
 const r2=await call(handler('deluxe',false),{mode:'tool-monthly',durations:[2],settings:{rte:0},data:[{peak:1000,kwh:200000,days:30,rate:18}]});assert.equal(r2.status,400);
 /* ---- /api/bess-design ---- */
 const DOK={loadMw:1,durationH:4,pcsOutputKv:0.48,systemKv:13.8};
 assert.equal((await call(designHandler('trial',false),DOK)).status,403);
 assert.equal((await call(designHandler('deluxe',false),DOK,'GET')).status,405);
 /* The engineering addon is a separate route through the gate from the tier. */
 assert.equal((await call(designHandler('trial',false,{addons:['engineering']}),DOK)).status,200);
 /* An explicit false override beats the tier, and staff beat the override. */
 assert.equal((await call(designHandler('deluxe',false,{toolOverrides:{batterysizer:false}}),DOK)).status,403);
 assert.equal((await call(designHandler('deluxe',true,{toolOverrides:{batterysizer:false}}),DOK)).status,200);
 /* Out of range is refused, not clamped: 8.5 is a typo for a 0.85 power
    factor and silently fixing it hands back a schedule nobody asked for. */
 assert.equal((await call(designHandler('deluxe',false),{...DOK,powerFactor:8.5})).status,400);
 assert.equal((await call(designHandler('deluxe',false),{...DOK,dodPct:0})).status,400);
 assert.equal((await call(designHandler('deluxe',false),{...DOK,analysisYears:500})).status,400);
 assert.equal((await call(designHandler('deluxe',false),{...DOK,cRate:'not a number'})).status,400);
 /* kV mistaken for V on one side only. */
 assert.equal((await call(designHandler('deluxe',false),{...DOK,systemKv:480})).status,400);
 /* A nested solar block is validated too, and a bad one does not slip past. */
 assert.equal((await call(designHandler('deluxe',false),{...DOK,solar:{enabled:true,vdcMaxV:5}})).status,400);
 assert.equal((await call(designHandler('deluxe',false),[1,2,3])).status,400);
 const d=await call(designHandler('deluxe',false),DOK);
 assert.equal(d.status,200);
 assert(d.body.capacity.units>0&&d.body.boq.length>0&&d.body.checks.overall);
 assert(!/NaN|Infinity/.test(JSON.stringify(d.body)),'design response must not carry NaN or Infinity');
 console.log('9 sizing + 14 design API authorization/input contract checks passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
