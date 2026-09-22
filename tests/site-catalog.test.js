/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var test=require('node:test'),assert=require('node:assert/strict'),vm=require('vm'),fs=require('fs');
var C=require('../api/_lib/site-catalog');
function sample(){return {manifest:{orgId:'example.com'},rows:[{id:'crexi:123',addr:'1 Test St',city:'Chicago',fullAddress:'1 Test St, Chicago, IL 60601',lat:null,lon:null,listed:{url:'https://www.crexi.com/properties/123/test',askPrice:100},feederId:'forged',owner:{name:'forged'},photos:['javascript:bad']}]};}
test('catalog validation pins destination and identity; never imports holds, owners, scores or guessed capacity',function(){var v=C.validate(sample(),'example.com');assert.equal(v.rows[0].feederId,'');assert.deepEqual(v.rows[0].owner,{name:''});assert.deepEqual(v.rows[0].photos,[]);assert.equal(v.manifest.located,0);assert.throws(()=>C.validate(sample(),'other.com'));var d=sample();d.rows.push(d.rows[0]);assert.throws(()=>C.validate(d,'example.com'));d=sample();d.rows[0].listed.url='https://www.crexi.com/properties/456/test';assert.throws(()=>C.validate(d,'example.com'));});
test('invalid or unproven coordinates are rejected',function(){var d=sample();d.rows[0].lat=41;d.rows[0].lon=-87;assert.throws(()=>C.validate(d,'example.com'));d.rows[0].geocode={status:'matched'};assert.equal(C.validate(d,'example.com').manifest.located,1);d.rows[0].lat=Infinity;assert.throws(()=>C.validate(d,'example.com'));});
function fakeDB(){var docs=new Map(),writes=[];function ref(p){return {path:p,id:p.split('/').pop(),collection:k=>ref(p+'/'+k),doc:k=>ref(p+'/'+k),get:async()=>({exists:docs.has(p),data:()=>docs.get(p),updateTime:{toMillis:()=>1}}),set:async(d,o)=>{docs.set(p,o&&o.merge?Object.assign({},docs.get(p)||{},d):d);writes.push(p);}};}return {docs,writes,collection:ref,batch:()=>{var ops=[];return {create:(r,d)=>ops.push([r.path,d]),commit:async()=>ops.forEach(([p,d])=>{assert(!docs.has(p));docs.set(p,d);writes.push(p);})};},runTransaction:async f=>f({get:r=>r.get(),set:(r,d)=>{docs.set(r.path,d);writes.push(r.path);}})};}
test('publish is retryable, read-back verified and writes only existing tenant toolData; stars untouched',async function(){var db=fakeDB();db.docs.set('sites/star',{saved:true,notes:'preserve'});var a=await C.publish(db,'example.com',sample());assert.equal(a.imported,1);await C.publish(db,'example.com',sample());assert.deepEqual(db.docs.get('sites/star'),{saved:true,notes:'preserve'});assert(db.writes.every(p=>p.startsWith('toolData/example.com/tools/sitefinderCatalog')));});
function endpoint(){
  var caller={orgId:'example.com',staff:false},allowed=true,reads=0;
  var A={httpError:(s,m)=>Object.assign(Error(m),{status:s}),handler:f=>f,safeOrg:s=>/^[a-z.]+$/.test(s)?s:'',
    authenticate:async req=>{if(!req.token)throw Object.assign(Error('auth'),{status:401});return caller;},
    canActInOrg:async(c,o)=>c.orgId===o,db:()=>{reads++;return fakeDB();}};
  var box={module:{exports:{}},require:function(n){
    if(n==='./_lib/admin')return A;
    if(n==='./site-score')return {_helpers:{entitle:async()=>{if(!allowed)throw Object.assign(Error('denied'),{status:403});}}};
    if(n==='./_lib/circuit-attribution')return require('../api/_lib/circuit-attribution');if(n==='./_lib/comed-service')return require('../api/_lib/comed-service');
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
  var box={module:{exports:{}},require:function(n){if(n==='./_lib/admin')return {httpError:(s,m)=>Object.assign(Error(m),{status:s}),handler:f=>f};if(n==='./site-score')return {_helpers:{entitle:async()=>{}}};if(n==='./_lib/geocode-listings')return G;if(n==='./_lib/circuit-attribution')return require('../api/_lib/circuit-attribution');if(n==='./_lib/comed-service')return require('../api/_lib/comed-service');return C;},Date,Number,Object,Array,JSON,Math,Promise,console,setTimeout};
  vm.runInNewContext(fs.readFileSync(require.resolve('../api/site-catalog'),'utf8'),box);
  var r=await box.module.exports._helpers.finishMatching(db,'example.com',{_fetchJson:fetchJson});
  assert.equal(r.attempted,3);assert.equal(r.matched,1);assert.equal(r.approximate,1);assert.equal(r.done,true);assert.equal(r.located,4);assert.equal(r.unmatched,1);
  assert(urls.some(u=>/^100 B St, Ste 4, Chicago, IL 60601/.test(u.split('address=')[1])),'the range variant was tried');
  var m=db.docs.get('toolData/example.com/tools/sitefinderCatalog');assert.equal(m.located,4);assert.equal(m.approximate,1);
  var page=db.docs.get('toolData/example.com/tools/sitefinderCatalog_'+m.version+'_0').rows;
  assert.equal(page[2].geocode.status,'matched');assert.equal(page[3].geocode.status,'approximate');assert.equal(page[3].lat,41.88,'the area centre includes the row matched in this pass');assert.equal(page[4].lat,null);assert.equal(page[4].geocode.attempted,true);
  var again=await box.module.exports._helpers.finishMatching(db,'example.com',{_fetchJson:fetchJson});assert.equal(again.attempted,0);assert.equal(again.done,true);
});
test('captured listing pages land on their rows as typed fields plus trimmed text; strays are reported, not added',async function(){
  var db=fakeDB(),rows=[];
  for(var i=1;i<=3;i++)rows.push({id:'crexi:'+i,addr:i+' A St',city:'Chicago',state:'IL',zip:'60601',fullAddress:i+' A St, Chicago, IL 60601',lat:41.8,lon:-87.6,geocode:{status:'matched',accuracy:'street-interpolated'},listed:{url:'https://www.crexi.com/properties/'+i+'/x',askPrice:null}});
  await C.publish(db,'example.com',{manifest:{orgId:'example.com',source:'test'},rows:rows});
  var box={module:{exports:{}},require:function(n){if(n==='./_lib/admin')return {httpError:(s,m)=>Object.assign(Error(m),{status:s}),handler:f=>f};if(n==='./site-score')return {_helpers:{entitle:async()=>{}}};if(n==='./_lib/geocode-listings')return require('../api/_lib/geocode-listings');if(n==='./_lib/circuit-attribution')return require('../api/_lib/circuit-attribution');if(n==='./_lib/comed-service')return require('../api/_lib/comed-service');return C;},Date,Number,Object,Array,JSON,Math,Promise,console,setTimeout,String};
  vm.runInNewContext(fs.readFileSync(require.resolve('../api/site-catalog'),'utf8'),box);
  var page='1 A St, Chicago, IL 60601 For Sale\n$2,450,000 | 12 days on market\nWarehouse\nDetails\nSquare Footage\t52,000\tYear Built\t1978\nNOI\t$100,000\nJane Broker PRO\nIL IL: #475.1\nView phone number\nAcme Realty\nListed by Acme Realty - Chicago.';
  var captures=[{listingId:'1',url:'https://www.crexi.com/properties/1/x',text:page,capturedAt:'2026-09-22T10:00:00Z'},{listingId:'999',text:'Unpriced | 1 day on market'}];
  /* the endpoint refuses before touching the catalogue */
  var A2=box.require('./_lib/admin');
  assert.throws(()=>C.applyCaptures(rows,[{listingId:'1',url:'https://www.crexi.com/properties/2/x',text:'x'}]),/identity/);
  assert.throws(()=>C.applyCaptures(rows,[{listingId:'1',url:'https://evil.example/properties/1/x',text:'x'}]),/not a Crexi/);
  assert.throws(()=>C.applyCaptures(rows,[]),/Between/);
  var t=C.applyCaptures(rows.map(r=>JSON.parse(JSON.stringify(r))),captures);
  assert.equal(t.applied,1);assert.deepEqual(t.unknown,['999']);assert.equal(t.fields.noi,1);
  var r1=t.rows[0];assert.equal(r1.detail.askPrice,2450000);assert.equal(r1.listed.askPrice,2450000,'a price read off the page updates the listing');assert.equal(r1.sqft,52000);
  assert.equal(r1.detail.brokers[0].name,'Jane Broker');assert.equal(r1.detail.brokers[0].firm,'Acme Realty');assert.equal(r1.detail.daysOnMarket,12);
  assert.ok(r1.detailText.length<=3000);
  var v=C.validate({manifest:{orgId:'example.com'},rows:t.rows},'example.com');
  assert.equal(v.rows[0].detail.noi,100000);assert.equal(v.rows[0].detail.bogus,undefined);assert.equal(v.rows[1].detail,undefined);
  var pub=await C.publish(db,'example.com',{manifest:{orgId:'example.com',source:'test'},rows:t.rows});
  assert.equal(pub.manifest.detailed,1);
  assert.equal(db.docs.get('toolData/example.com/tools/sitefinderCatalog_'+pub.manifest.version+'_0').rows.length,3);
});
test('the scheduled worker finishes the map on its own: one pass per tick, marks the manifest done, then leaves it alone',async function(){
  var db=fakeDB(),G=require('../api/_lib/geocode-listings');
  db.collection=(function(orig){return function(k){var r=orig(k);if(k==='toolData')r.listDocuments=async()=>[orig('toolData/other.com'),orig('toolData/example.com')];return r;};})(db.collection);
  function row(n,addr,lat,lon){return {id:'crexi:'+n,addr:addr,city:'Chicago',state:'IL',zip:'60601',fullAddress:addr+', Chicago, IL 60601',lat:lat,lon:lon,listed:{url:'https://www.crexi.com/properties/'+n+'/x',askPrice:null},geocode:lat==null?{status:'unmatched',source:'US Census',accuracy:'unknown'}:{status:'matched',source:'US Census',accuracy:'street-interpolated, not rooftop'}};}
  await C.publish(db,'example.com',{manifest:{orgId:'example.com',source:'t'},rows:[row(1,'1 A St',41.88,-87.63),row(2,'2 A St',41.89,-87.64),row(3,'Lot 9 Nowhere',null,null)]});
  var ticks=0,box={module:{exports:{}},require:function(n){if(n==='./_lib/admin')return {httpError:(s,m)=>Object.assign(Error(m),{status:s}),handler:f=>f};if(n==='./site-score')return {_helpers:{entitle:async()=>{}}};if(n==='./_lib/geocode-listings')return Object.assign({},G,{fetchJson:async()=>{ticks++;return {result:{addressMatches:[]}};}});return C;},Date,Number,Object,Array,JSON,Math,Promise,console,setTimeout,String};
  vm.runInNewContext(fs.readFileSync(require.resolve('../api/site-catalog'),'utf8'),box);
  var H=box.module.exports._helpers;
  assert.equal(await H.nextCatalogueToMatch(db),'example.com');
  var r=await H.matchNextCatalogue(db,5000);
  assert.equal(r.orgId,'example.com');assert.equal(r.done,true);assert.equal(r.approximate,1,'the leftover row took the area centre');assert.ok(ticks>0,'the geocoder was tried first');
  var m=db.docs.get('toolData/example.com/tools/sitefinderCatalog');assert.equal(m.matchingDone,true);assert.equal(m.located,3);
  assert.equal(await H.nextCatalogueToMatch(db),null,'a finished catalogue is left alone');
  assert.equal(await H.matchNextCatalogue(db),null);
});
test('a circuit survives a server re-publish and never a staff import; the list sorts and filters by what is left on it',function(){
  var d=sample();d.rows[0].lat=41.9;d.rows[0].lon=-87.6;d.rows[0].geocode={status:'matched'};
  d.rows[0].feederId='C785';d.rows[0].sub='S0741';d.rows[0].nameplate=1500;d.rows[0].queue=100;d.rows[0].circuit={attempted:true,status:'attributed',at:'2026-09-22T00:00:00Z',source:'ComEd',service:'ComEd_BESS_Hosting_Capacity_SEP2026'};
  var imported=C.validate(d,'example.com');assert.equal(imported.rows[0].feederId,'');assert.equal(imported.rows[0].nameplate,undefined);assert.equal(imported.rows[0].circuit,undefined);assert.equal(imported.manifest.circuits,0);
  var kept=C.validate(d,'example.com',{keepCircuits:true});assert.equal(kept.rows[0].feederId,'C785');assert.equal(kept.rows[0].nameplate,1500);assert.equal(kept.rows[0].queue,100);assert.equal(kept.rows[0].sub,'S0741');assert.equal(kept.rows[0].circuit.status,'attributed');
  assert.equal(kept.manifest.circuits,1);assert.equal(kept.manifest.circuitsTried,1);
  d.rows[0].nameplate='1500';assert.throws(()=>C.validate(d,'example.com',{keepCircuits:true}),/circuit/);
  d.rows[0].circuit={attempted:true,status:'none'};d.rows[0].nameplate=1500;var none=C.validate(d,'example.com',{keepCircuits:true});assert.equal(none.rows[0].feederId,'','a miss carries no circuit whatever the row says');assert.equal(none.manifest.circuits,0);assert.equal(none.manifest.circuitsTried,1);
  var h=endpoint(),rows=[{id:'a',fullAddress:'x',lat:41,lon:-87,nameplate:1500,queue:100},{id:'b',fullAddress:'x',lat:41,lon:-87},{id:'c',fullAddress:'x',lat:41,lon:-87,nameplate:2000,queue:0},{id:'d',fullAddress:'x',lat:41,lon:-87,nameplate:0,queue:0}];
  assert.deepEqual(h.api._helpers.select({rows},{sort:'capacity'}).rows.map(r=>r.id),['c','a','d','b'],'most available first, unknown last');
  assert.deepEqual(h.api._helpers.select({rows},{sort:'capacity',minKw:1000}).rows.map(r=>r.id),['c','a']);
  assert.deepEqual(h.api._helpers.select({rows},{minKw:0}).rows.map(r=>r.id),['a','b','c','d'],'no minimum keeps the catalogue order');
  assert.throws(()=>h.api._helpers.select({rows},{sort:'price'}),{status:400});assert.throws(()=>h.api._helpers.select({rows},{minKw:-1}),{status:400});
});
test('circuit attribution: reads matched rows once, publishes with the circuits kept, marks the manifest, and the worker picks the next catalogue',async function(){
  var db=fakeDB();
  function row(n,lat,lon,status){return {id:'crexi:'+n,addr:n+' A St',city:'Chicago',state:'IL',zip:'60601',fullAddress:n+' A St, Chicago, IL 60601',lat:lat,lon:lon,listed:{url:'https://www.crexi.com/properties/'+n+'/x',askPrice:null},geocode:lat==null?{status:'unmatched',attempted:true}:{status:status||'matched',source:'US Census',accuracy:'street-interpolated'}};}
  var rows=[row(1,42.04,-87.78),row(2,42.05,-87.79),row(3,42.06,-87.80,'approximate'),row(4,null,null)];rows[2].geocode.accuracy='area centre';
  await C.publish(db,'example.com',{manifest:{orgId:'example.com',source:'test'},rows:rows});
  await db.collection('toolData').doc('example.com').collection('tools').doc('sitefinderCatalog').set({matchingDone:true,matchedAt:'M'},{merge:true});
  db.collection=(function(orig){return function(k){var r=orig(k);if(k==='toolData')r.listDocuments=async()=>[orig('toolData/example.com')];return r;};})(db.collection);
  /* the worker path reads through comed-service.fetchJson; here that is a service that refuses, never the network */
  var box={module:{exports:{}},require:function(n){if(n==='./_lib/admin')return {httpError:(s,m)=>Object.assign(Error(m),{status:s}),handler:f=>f};if(n==='./site-score')return {_helpers:{entitle:async()=>{}}};if(n==='./_lib/geocode-listings')return require('../api/_lib/geocode-listings');if(n==='./_lib/circuit-attribution')return require('../api/_lib/circuit-attribution');if(n==='./_lib/comed-service')return Object.assign({},require('../api/_lib/comed-service'),{fetchJson:async()=>({error:{code:403,message:'Access denied'}})});return C;},Date,Number,Object,Array,JSON,Math,Promise,console,setTimeout,String};
  vm.runInNewContext(fs.readFileSync(require.resolve('../api/site-catalog'),'utf8'),box);
  var H=box.module.exports._helpers,asked=[];
  async function fetchJson(u){asked.push(u);if(/42\.04/.test(u))return {features:[{attributes:{Feeder:'C785',Feeder_N:'F4661',SS_N:'S0741',BESS_HC:1500,Feeder_Q:100}}]};return {features:[]};}
  assert.equal(await H.nextCatalogueToAttribute(db),'example.com');
  var r=await H.attributeCircuits(db,'example.com',{_fetchJson:fetchJson});
  assert.equal(r.attempted,2);assert.equal(r.attributed,1);assert.equal(r.none,1);assert.equal(r.done,true);assert.equal(r.circuits,1);assert.equal(r.circuitsTried,2);
  var m=db.docs.get('toolData/example.com/tools/sitefinderCatalog');assert.equal(m.circuits,1);assert.equal(m.circuitsDone,true);assert.equal(m.matchingDone,true,'the geocoding mark survives the re-publish');assert.equal(m.matchedAt,'M');
  var page=db.docs.get('toolData/example.com/tools/sitefinderCatalog_'+m.version+'_0').rows;
  assert.equal(page[0].feederId,'C785');assert.equal(page[0].nameplate,1500);assert.equal(page[0].queue,100);assert.equal(page[1].circuit.status,'none');assert.equal(page[2].circuit,undefined,'an area pin is not attributed');
  assert.equal(await H.nextCatalogueToAttribute(db),null,'a finished catalogue is not re-read');
  var again=await H.attributeCircuits(db,'example.com',{_fetchJson:fetchJson});assert.equal(again.attempted,0);assert.equal(asked.length,2);
  var listed=H.select(await H.catalog(db,'example.com'),{sort:'capacity'});assert.equal(listed.rows[0].id,'crexi:1');assert.equal(listed.manifest.circuits,1);
  /* a rotated service: nothing is marked, and the worker will try again next tick */
  var db2=fakeDB();await C.publish(db2,'example.com',{manifest:{orgId:'example.com',source:'test'},rows:rows});
  var err=await H.attributeCircuits(db2,'example.com',{_fetchJson:async()=>({error:{code:403,message:'Access denied'}})});
  assert.equal(err.attempted,0);assert.equal(err.done,false);assert.match(err.transportError,/403/);assert.equal(db2.docs.get('toolData/example.com/tools/sitefinderCatalog').circuitsDone,undefined);
  db2.collection=(function(orig){return function(k){var r=orig(k);if(k==='toolData')r.listDocuments=async()=>[orig('toolData/example.com')];return r;};})(db2.collection);
  var tick=await H.attributeNextCatalogue(db2,5000);assert.equal(tick.orgId,'example.com','the worker keeps trying a catalogue the service refused');assert.equal(tick.attempted,0);assert.match(tick.transportError,/403/);
});
