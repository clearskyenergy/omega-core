/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var test=require('node:test'),assert=require('node:assert/strict'),vm=require('vm'),fs=require('fs');
var C=require('../api/_lib/site-catalog');
function sample(){return {manifest:{orgId:'example.com'},rows:[{id:'crexi:123',addr:'1 Test St',city:'Chicago',fullAddress:'1 Test St, Chicago, IL 60601',lat:null,lon:null,listed:{url:'https://www.crexi.com/properties/123/test',askPrice:100},feederId:'forged',owner:{name:'forged'},photos:['javascript:bad']}]};}
test('catalog validation pins destination and identity; never imports holds, owners, scores or guessed capacity',function(){var v=C.validate(sample(),'example.com');assert.equal(v.rows[0].feederId,'');assert.deepEqual(v.rows[0].owner,{name:''});assert.deepEqual(v.rows[0].photos,[]);assert.equal(v.manifest.located,0);assert.throws(()=>C.validate(sample(),'other.com'));var d=sample();d.rows.push(d.rows[0]);assert.throws(()=>C.validate(d,'example.com'));d=sample();d.rows[0].listed.url='https://www.crexi.com/properties/456/test';assert.throws(()=>C.validate(d,'example.com'));});
test('invalid or unproven coordinates are rejected',function(){var d=sample();d.rows[0].lat=41;d.rows[0].lon=-87;assert.throws(()=>C.validate(d,'example.com'));d.rows[0].geocode={status:'matched'};assert.equal(C.validate(d,'example.com').manifest.located,1);d.rows[0].lat=Infinity;assert.throws(()=>C.validate(d,'example.com'));});
function fakeDB(){var docs=new Map(),writes=[];function ref(p){return {path:p,collection:k=>ref(p+'/'+k),doc:k=>ref(p+'/'+k),get:async()=>({exists:docs.has(p),data:()=>docs.get(p),updateTime:{toMillis:()=>1}})};}return {docs,writes,collection:ref,batch:()=>{var ops=[];return {create:(r,d)=>ops.push([r.path,d]),commit:async()=>ops.forEach(([p,d])=>{assert(!docs.has(p));docs.set(p,d);writes.push(p);})};},runTransaction:async f=>f({get:r=>r.get(),set:(r,d)=>{docs.set(r.path,d);writes.push(r.path);}})};}
test('publish is retryable, read-back verified and writes only existing tenant toolData; stars untouched',async function(){var db=fakeDB();db.docs.set('sites/star',{saved:true,notes:'preserve'});var a=await C.publish(db,'example.com',sample());assert.equal(a.imported,1);await C.publish(db,'example.com',sample());assert.deepEqual(db.docs.get('sites/star'),{saved:true,notes:'preserve'});assert(db.writes.every(p=>p.startsWith('toolData/example.com/tools/sitefinderCatalog')));});
function endpoint(){
  var caller={orgId:'example.com',staff:false},allowed=true,reads=0;
  var A={httpError:(s,m)=>Object.assign(Error(m),{status:s}),handler:f=>f,safeOrg:s=>/^[a-z.]+$/.test(s)?s:'',
    authenticate:async req=>{if(!req.token)throw Object.assign(Error('auth'),{status:401});return caller;},
    canActInOrg:async(c,o)=>c.orgId===o,db:()=>{reads++;return fakeDB();}};
  var box={module:{exports:{}},require:function(n){
    if(n==='./_lib/admin')return A;
    if(n==='./site-score')return {_helpers:{entitle:async()=>{if(!allowed)throw Object.assign(Error('denied'),{status:403});}}};
    return C;
  },Date,Number,Object,Array};
  vm.runInNewContext(fs.readFileSync(require.resolve('../api/site-catalog'),'utf8'),box);
  return {api:box.module.exports,setAllowed:v=>allowed=v,reads:()=>reads};
}
test('API denies signed-out, foreign tenant, disabled entitlement and nonstaff imports before data reads',async function(){var h=endpoint(),res={setHeader:()=>{}};await assert.rejects(h.api({method:'POST',body:{}},res),{status:401});await assert.rejects(h.api({method:'POST',token:true,body:{orgId:'other.com'}},res),{status:403});await assert.rejects(h.api({method:'POST',token:true,body:{action:'import',catalog:sample()}},res),{status:403});h.setAllowed(false);await assert.rejects(h.api({method:'POST',token:true,body:{}},res),{status:403});assert.equal(h.reads(),0);});
test('search and bounds retain unlocated records only in text search, with explicit pagination',function(){var h=endpoint(),rows=[];for(var i=0;i<101;i++)rows.push({fullAddress:'Chicago '+i,lat:i?41:null,lon:i?-87:null});var a=h.api._helpers.select({manifest:null,rows},{q:'Chicago'});assert.equal(a.total,101);assert.equal(a.rows.length,100);assert.equal(a.hasMore,true);assert.equal(h.api._helpers.select({rows},{bbox:{n:42,s:40,e:-86,w:-88}}).total,100);});
test('an approximate area location is accepted only with its accuracy note, and is counted apart from matches',function(){var d=sample();d.rows[0].lat=41.9;d.rows[0].lon=-87.6;d.rows[0].geocode={status:'approximate'};assert.throws(()=>C.validate(d,'example.com'));d.rows[0].geocode={status:'approximate',source:'derived',accuracy:'area centre of 3 matched listings in ZIP 60601; not the parcel',area:'ZIP 60601'};var v=C.validate(d,'example.com');assert.equal(v.manifest.located,1);assert.equal(v.manifest.approximate,1);assert.equal(v.manifest.unmatched,0);assert.equal(v.rows[0].geocode.area,'ZIP 60601');});
test('finish matching: geocodes untried rows within the budget, then derives area centres, publishes and reports progress',async function(){
  var G=require('../api/_lib/geocode-listings'),db=fakeDB();
  function row(n,addr,city,zip,lat,lon){return {id:'crexi:'+n,addr:addr,city:city,state:'IL',zip:zip,fullAddress:addr+', '+city+', IL '+zip,lat:lat,lon:lon,listed:{url:'https://www.crexi.com/properties/'+n+'/x',askPrice:null},geocode:lat==null?{status:'unmatched',source:'US Census',accuracy:'unknown'}:{status:'matched',source:'US Census',accuracy:'street-interpolated, not rooftop'}};}
  var rows=[row(1,'1 A St','Chicago','60601',41.88,-87.63),row(2,'2 A St','Chicago','60601',41.89,-87.64),row(3,'100-120 B St, Ste 4','Chicago','60601',null,null),row(4,'Lot 9 Nowhere','Chicago','60601',null,null),row(5,'Lot 9 Elsewhere','Nocity','',null,null)];
  await C.publish(db,'example.com',{manifest:{orgId:'example.com',source:'test'},rows:rows});
  var urls=[];
  async function fetchJson(u){u=decodeURIComponent(u);urls.push(u);if(/100 B St/.test(u))return {result:{addressMatches:[{coordinates:{x:-87.62,y:41.87},matchedAddress:'100 B ST'}]}};if(/999 Far/.test(u))return {result:{addressMatches:[{coordinates:{x:-118,y:34},matchedAddress:'LA'}]}};return {result:{addressMatches:[]}};}
  var box={module:{exports:{}},require:function(n){if(n==='./_lib/admin')return {httpError:(s,m)=>Object.assign(Error(m),{status:s}),handler:f=>f};if(n==='./site-score')return {_helpers:{entitle:async()=>{}}};if(n==='./_lib/geocode-listings')return G;return C;},Date,Number,Object,Array,JSON,Math,Promise,console,setTimeout};
  vm.runInNewContext(fs.readFileSync(require.resolve('../api/site-catalog'),'utf8'),box);
  var r=await box.module.exports._helpers.finishMatching(db,'example.com',{_fetchJson:fetchJson});
  assert.equal(r.attempted,3);assert.equal(r.matched,1);assert.equal(r.approximate,1);assert.equal(r.done,true);assert.equal(r.located,4);assert.equal(r.unmatched,1);
  assert(urls.some(u=>/^100 B St, Ste 4, Chicago, IL 60601/.test(u.split('address=')[1])),'the range variant was tried');
  var m=db.docs.get('toolData/example.com/tools/sitefinderCatalog');assert.equal(m.located,4);assert.equal(m.approximate,1);
  var page=db.docs.get('toolData/example.com/tools/sitefinderCatalog_'+m.version+'_0').rows;
  assert.equal(page[2].geocode.status,'matched');assert.equal(page[3].geocode.status,'approximate');assert.equal(page[3].lat,41.88,'the area centre includes the row matched in this pass');assert.equal(page[4].lat,null);assert.equal(page[4].geocode.attempted,true);
  var again=await box.module.exports._helpers.finishMatching(db,'example.com',{_fetchJson:fetchJson});assert.equal(again.attempted,0);assert.equal(again.done,true);
});
