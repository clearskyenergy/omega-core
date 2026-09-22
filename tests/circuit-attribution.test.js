/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var test=require('node:test'),assert=require('node:assert/strict');
var CA=require('../api/_lib/circuit-attribution');
function row(n,lat,status,extra){return Object.assign({id:'crexi:'+n,lat:lat,lon:-87.7,geocode:{status:status||'matched'}},extra||{});}
function feature(feeder,np,q,sub){return {attributes:{Feeder:feeder,Feeder_N:feeder?'F'+feeder:'',SS_N:sub||'S1',BESS_HC:np,Feeder_Q:q,PV_HC_kW:0,EV_HC_kW:0}};}
test('only matched street positions not yet tried are asked; the most available circuit wins; a miss is recorded once',async function(){
  var rows=[row(1,42.04),row(2,42.05,'approximate'),row(3,null),row(4,42.06,'matched',{circuit:{attempted:true,status:'none'}}),row(5,42.07)];
  var asked=[];
  async function fetchJson(u){asked.push(u);if(/42\.04/.test(u))return {features:[feature('C1',500,100),feature('C2',900,600),feature('',9999,0)]};return {features:[]};}
  var r=await CA.attributeRows(rows,fetchJson,{now:function(){return 'T';}});
  assert.deepEqual(asked.length,2);
  assert.equal(r.attempted,2);assert.equal(r.attributed,1);assert.equal(r.none,1);assert.equal(r.remaining,0);assert.equal(r.transportError,null);
  assert.equal(rows[0].feederId,'C1','500-100 beats 900-600; a feature without an id is ignored');assert.equal(rows[0].nameplate,500);assert.equal(rows[0].queue,100);assert.equal(rows[0].sub,'S1');
  assert.deepEqual(rows[0].circuit,{attempted:true,status:'attributed',at:'T',source:CA.SOURCE,service:CA.SERVICE_NAME});
  assert.equal(rows[4].feederId,'');assert.equal(rows[4].nameplate,null);assert.equal(rows[4].circuit.status,'none');
  assert.equal(rows[1].circuit,undefined,'an area pin is never attributed');assert.equal(rows[3].feederId,undefined,'a tried row is left alone');
  assert.ok(/Hosting_Capacity_[A-Z]{3}20\d\d/.test(CA.SERVICE_NAME));
});
test('a transport or service error stops the pass without marking rows, and the budget bounds it',async function(){
  var rows=[row(1,42.04),row(2,42.05),row(3,42.06)],n=0;
  var r=await CA.attributeRows(rows,async function(){n++;if(n===1)return {features:[feature('C1',100,0)]};throw Error('socket hang up');},{concurrency:1});
  assert.equal(r.attempted,1);assert.equal(r.transportError,'socket hang up');assert.equal(r.remaining,2);assert.equal(rows[1].circuit,undefined);
  var r2=await CA.attributeRows([row(9,42.0)],async function(){return {error:{code:403,message:'Access denied'}};});
  assert.equal(r2.attempted,0);assert.match(r2.transportError,/403/);
  var slow=await CA.attributeRows([row(1,42.04),row(2,42.05)],async function(){await new Promise(function(ok){setTimeout(ok,30);});return {features:[]};},{budgetMs:1,concurrency:1});
  assert.equal(slow.attempted,1,'one request is in flight when the budget expires; the next is not started');assert.equal(slow.remaining,1);
});
