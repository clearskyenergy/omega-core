/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var test=require('node:test'),assert=require('node:assert/strict');
var G=require('../api/_lib/geocode-listings');
test('address variants: ranges, suites, corners, and an unparsed full line',function(){
  var v=G.variants({addr:'1234-1240 W Madison St, Ste 200',city:'Chicago',state:'IL',zip:'60607'});
  assert.deepEqual(v,['1234-1240 W Madison St, Ste 200, Chicago, IL 60607','1234 W Madison St, Ste 200, Chicago, IL 60607','1234-1240 W Madison St, Chicago, IL 60607','1234 W Madison St, Chicago, IL 60607']);
  assert.deepEqual(G.variants({addr:'NWC Main St & 1st Ave',city:'Skokie',state:'IL',zip:''}),['NWC Main St & 1st Ave, Skokie, IL','Main St, Skokie, IL','1st Ave, Skokie, IL']);
  assert.equal(G.variants({addr:'233 S Wacker Dr',city:'',state:'IL',zip:'',fullAddress:'233 S Wacker Dr Chicago IL 60606'})[0],'233 S Wacker Dr Chicago IL 60606');
  assert.deepEqual(G.variants({addr:'0 Unnamed Rd',city:'Chicago',state:'IL',zip:'60601'}),[],'a zero house number is never sent');
});
test('a match outside the county box is refused; a transport failure is raised, not recorded as no match',async function(){
  var far={result:{addressMatches:[{coordinates:{x:-118.2,y:34.05},matchedAddress:'LOS ANGELES'}]}};
  assert.equal(await G.geocodeRow({addr:'1 Chicago Ave',city:'Chicago',state:'IL',zip:'60601'},async()=>far),null);
  await assert.rejects(G.geocodeRows([{addr:'1 A St',city:'Chicago',state:'IL',zip:'60601',lat:null}],async()=>{throw Error('down');}),/down/);
  assert.equal(G.parseCensus({result:{addressMatches:[]}}),null);
});
test('the time budget bounds a pass and the rest stay untried; area fallback uses matched rows only, ZIP before city',async function(){
  var t=0,rows=[];for(var i=0;i<10;i++)rows.push({id:i,addr:(i+1)+' A St',city:'Chicago',state:'IL',zip:'6060'+(i%2),lat:null,lon:null});
  var r=await G.geocodeRows(rows,async()=>{t+=1000;return {result:{addressMatches:[]}};},{budgetMs:2500,concurrency:1,now:()=>t});
  assert.equal(r.attempted,3);assert.equal(r.remaining,7);
  var pool=[{zip:'60601',city:'Chicago',lat:41.8,lon:-87.6,geocode:{status:'matched'}},{zip:'60601',city:'Chicago',lat:41.9,lon:-87.7,geocode:{status:'matched'}},{zip:'60602',city:'Chicago',lat:41.0,lon:-87.0,geocode:{status:'approximate'}},
    {zip:'60601',city:'Chicago',lat:null,lon:null},{zip:'60602',city:'Chicago',lat:null,lon:null},{zip:'',city:'Elsewhere',lat:null,lon:null}];
  assert.equal(G.areaFallback(pool),2);
  assert.ok(Math.abs(pool[3].lat-41.85)<1e-9);assert.equal(pool[3].geocode.area,'ZIP 60601');
  assert.equal(pool[4].geocode.area,'Chicago','a ZIP with fewer than two matched rows falls to the city');assert.ok(Math.abs(pool[4].lat-41.85)<1e-9,'approximate rows never seed another approximation');
  assert.equal(pool[5].lat,null);
});
