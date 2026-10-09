/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
const assert=require('assert/strict'), I=require('../api/_lib/brain-inventory');
(async()=>{
 let active=0,max=0;
 const refs=Array.from({length:17},(_,i)=>({id:i===0?'projects':i===1?'twin_runs':'test'+i,count:()=>({get:async()=>{active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,2));active--;if(i===2)throw Error('unavailable');return {data:()=>({count:i+1})};}})}));
 const nested=id=>({count:()=>({get:async()=>({data:()=>({count:id==='projects'?4:0})})})});
 const result=await I.collect({listCollections:async()=>refs,collectionGroup:nested});
 assert.equal(result.failed,1);assert.equal(result.total,153);assert.equal(result.collections.find(r=>r.id==='test2').count,null);assert(max<=6);assert.equal(result.groups.reduce((n,g)=>n+g.count,0),153);
 assert.equal(result.groups.find(g=>g.id==='telemetry').count,2);assert.equal(result.collections.find(r=>r.id==='nested:projects').count,3);assert.deepEqual(result.value.scenarios.map(s=>s.annual),[24000,48000,96000]);
 await assert.rejects(()=>I.collect({listCollections:async()=>{throw Error('denied');}}),/denied/);
 const adminPath=require.resolve('../api/_lib/admin');let caller={email:'other@clearsky-usa.com',claims:{email_verified:true}},reads=0;
 require.cache[adminPath]={id:adminPath,filename:adminPath,loaded:true,exports:{handler:f=>f,authenticate:async()=>caller,httpError:(status,message)=>Object.assign(Error(message),{status}),db:()=>{reads++;return {listCollections:async()=>refs,collectionGroup:nested};}}};
 const api=require('../api/brain-inventory');const res={setHeader:()=>{}};
 await assert.rejects(()=>api({method:'GET'},res),e=>e.status===403);assert.equal(reads,0);
 caller={email:'tom@clearsky-usa.com',claims:{email_verified:false}};await assert.rejects(()=>api({method:'GET'},res),e=>e.status===403);
 caller.claims.email_verified=true;await assert.rejects(()=>api({method:'POST'},res),e=>e.status===405);
 const first=await api({method:'GET'},res);const second=await api({method:'GET'},res);assert.equal(first,second);assert.equal(reads,1);
 caller.email='other@clearsky-usa.com';await assert.rejects(()=>api({method:'GET'},res),e=>e.status===403);assert.equal(reads,1);
 console.log('PASS: exact totals, partial failures, concurrency bound, valuation arithmetic, private owner gate, method and authenticated cache.');
})().catch(e=>{console.error(e);process.exitCode=1;});
