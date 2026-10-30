/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
const assert=require('assert');let caller=null, allowed=true, keys=[];
function mock(name,exports){const id=require.resolve(name);require.cache[id]={id,filename:id,loaded:true,exports};}
mock('../../api/_lib/admin',{handler:fn=>fn,authenticate:async()=>caller,httpError:(s,m)=>Object.assign(new Error(m),{status:s})});
mock('../../api/_lib/package-access',{withCaller:async(c,k)=>{keys.push(k);if(!allowed)throw Object.assign(new Error('denied'),{status:403});},
  withModuleAnyPlan:async(c,k)=>{keys.push('module:'+k);if(!allowed)throw Object.assign(new Error('denied'),{status:403});}});
mock('../../api/_lib/embed',{rateLimit:()=>{}});
mock('../../api/_lib/guided-build',{VERSION:'test',list:()=>[],plan:()=>({ok:true})});
const config=require('../../api/editor-v2-3d-config'), build=require('../../api/guided-build'), tiles=require('../../api/editor-v2-3d-tiles');
let code=0;const res={setHeader:()=>{},end:()=>{},set statusCode(v){code=v;},get statusCode(){return code;}};
(async()=>{
 await assert.rejects(config({method:'GET'},res),e=>e.status===403);
 await assert.rejects(build({method:'POST'},res),e=>e.status===403);
 await tiles({method:'GET'},res);assert.strictEqual(code,403);
 caller={uid:'u',orgId:'example.com'};allowed=false;
 await assert.rejects(config({method:'GET'},res),e=>e.status===403);
 await assert.rejects(build({method:'POST',body:{builder:'compute'}},res),e=>e.status===403);
 await tiles({method:'GET'},res);assert.strictEqual(code,403);
 allowed=true;const result=await config({method:'GET'},res);assert.deepStrictEqual(Object.keys(result).sort(),['ionTerrain','photorealistic']);
 await build({method:'POST',body:{builder:'compute'}},res);assert.strictEqual(keys.pop(),'compute');assert.strictEqual(keys.pop(),'module:maximus','Omega Maximus is asked before the build');
 await build({method:'POST',body:{builder:'bess'}},res);assert.strictEqual(keys.pop(),'lite');assert.strictEqual(keys.pop(),'module:maximus');
 keys=[];await config({method:'GET'},res);assert.deepStrictEqual(keys,['module:maximus','lite'],'3D asks for Omega Maximus first');
 console.log('editor v2 gates: auth and billing checked before configuration, tile proxy and guided builds');
})().catch(e=>{console.error(e);process.exitCode=1;});
