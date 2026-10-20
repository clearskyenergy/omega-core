/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var assert = require('assert'), price = require('../../api/_lib/editor-v2-component-cost');
assert.strictEqual(price({kind:'array',kw:100,solarKw:500}).cost,198000);
assert.strictEqual(price({kind:'array',kw:100,solarKw:500,mount:'carport'}).cost,275000);
assert.strictEqual(price({key:'bess',kw:500,kwh:1000}).cost,430500);
assert.throws(function(){price({kw:-1});});
assert.throws(function(){price({kw:'Infinity'});});
var caller, allowed=true, checks=0;
var aPath=require.resolve('../../api/_lib/admin'), xPath=require.resolve('../../api/_lib/package-access');
require.cache[aPath]={id:aPath,filename:aPath,loaded:true,exports:{
 handler:function(fn){return fn;},authenticate:function(){return Promise.resolve(caller);},
 httpError:function(s,m){var e=new Error(m);e.status=s;return e;}
}};
require.cache[xPath]={id:xPath,filename:xPath,loaded:true,exports:{withCaller:function(c,key){
 assert.strictEqual(key,'estimate');checks++; return allowed?Promise.resolve():Promise.reject(Object.assign(new Error('Denied'),{status:403}));
}}};
var api=require('../../api/editor-v2-component-cost'), res={setHeader:function(){}};
(async function(){
 caller=null; await assert.rejects(api({method:'POST',body:{}},res),function(e){return e.status===403;});
 caller={orgId:'example.com'}; allowed=false;
 await assert.rejects(api({method:'POST',body:{kw:100}},res),function(e){return e.status===403;});
 allowed=true; assert.strictEqual((await api({method:'POST',body:{kind:'array',kw:100}},res)).cost,198000);
 assert.strictEqual(checks,2); console.log('teditorv2cost: quantities, shared prices, authentication and billing gate passed');
})().catch(function(e){console.error(e);process.exitCode=1;});
