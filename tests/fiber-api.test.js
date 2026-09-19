/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var test=require('node:test'),assert=require('node:assert/strict'),vm=require('vm'),fs=require('fs'),path=require('path');
var source=fs.readFileSync(path.join(__dirname,'../api/fiber-screen.js'),'utf8');
var real=require('../api/_lib/fiber-evidence');
var realParcel=require('../api/_lib/fiber-parcel');
function error(status,message){var e=new Error(message);e.status=status;return e;}
async function run(opts){
 opts=opts||{};var calls=0,screened=0,result={headers:{}};
 var auth={httpError:error,authenticateWithTier:function(req){if(!req.headers.authorization)return Promise.reject(error(401,'missing bearer token'));return Promise.resolve({caller:{staff:!!opts.staff,orgId:'example.com',uid:'test'},billing:{toolOverrides:opts.denied?{gridatlas:false}:{}},tier:'trial'});},
 readAsCaller:function(token,p){calls++;return Promise.resolve(p.indexOf('/members/')>=0?(opts.member===undefined?{status:'active',toolAccess:['gridatlas']}:opts.member):{status:opts.orgStatus||'active'});}};
 var engine={parseRequest:real.parseRequest,screen:function(){screened++;return {site_has_fiber:null};}};
 var gate={module:{exports:{}},require:function(){return auth;},Promise:Promise};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../api/_lib/grid-atlas-access.js'),'utf8'),gate);
 var sandbox={module:{exports:{}},require:function(name){return name==='./_lib/verify-token'?auth:name==='./_lib/grid-atlas-access'?gate.module.exports:name==='./_lib/fiber-parcel'?{parse:realParcel.parse,inspect:function(){screened++;return {site_has_fiber:null};}}:engine;},Promise:Promise};vm.runInNewContext(source,sandbox);
 var res={setHeader:function(k,v){result.headers[k]=v;},status:function(s){result.status=s;return res;},json:function(j){result.body=j;return res;}};
 await sandbox.module.exports({method:opts.method||'GET',body:opts.body,query:opts.query||{lat:41,lon:-87},headers:opts.noToken?{}:{authorization:'Bearer test'}},res);
 result.calls=calls;result.screened=screened;return result;
}
test('missing bearer token cannot reach the data engine',async function(){var r=await run({noToken:true});assert.equal(r.status,401);assert.equal(r.screened,0);});
test('explicit tool denial, suspended org and missing member are refused',async function(){for(var opts of [{denied:true},{orgStatus:'suspended'},{member:null},{member:{status:'active',toolAccess:[]}}]){var r=await run(opts);assert.equal(r.status,403);assert.equal(r.screened,0);}});
test('authorized member reaches screening with private no-store responses',async function(){var r=await run();assert.equal(r.status,200);assert.equal(r.calls,2);assert.equal(r.headers['Cache-Control'],'private, no-store');assert.equal(r.body.site_has_fiber,null);});
test('invalid request and wrong HTTP method fail without processing data',async function(){assert.equal((await run({query:{lat:'',lon:0}})).status,400);assert.equal((await run({method:'DELETE'})).status,405);assert.equal((await run({method:'POST'})).status,400);});
test('parcel POST uses the same tenant gate and validates the boundary before inspection',async function(){
 var body={boundary:{type:'Polygon',coordinates:[[[-97,32],[-96.999,32],[-96.999,32.001],[-97,32.001],[-97,32]]]}};
 for(var opts of [{noToken:true},{denied:true},{orgStatus:'suspended'},{member:null}]){var r=await run(Object.assign({method:'POST',body:body},opts));assert(r.status===401||r.status===403);assert.equal(r.screened,0);}
 var ok=await run({method:'POST',body:body});assert.equal(ok.status,200);assert.equal(ok.screened,1);assert.equal(ok.headers['Cache-Control'],'private, no-store');
 var bad=await run({method:'POST',body:{boundary:{type:'LineString',coordinates:[]}}});assert.equal(bad.status,400);assert.equal(bad.screened,0);
});
