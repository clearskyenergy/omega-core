/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var assert=require('assert'),engine=require('../../api/_lib/site-discovery');
var good={name:'Example',load_kw:750,grid_dist_mi:0.4,incentive_score:60,land_score:80,offtake_score:70,interconnect_score:75};
function one(patch,weights){return engine.rank([Object.assign({},good,patch)],weights).rows[0];}
assert.equal(one({}).score,73.875);
assert.equal(one({grid_dist_mi:0}).parts.grid,100);
['',null,undefined,-1,'invalid',Infinity,'2 miles'].forEach(function(v){var r=one({grid_dist_mi:v});assert.equal(r.score,null);assert.equal(r.parts.grid,null);assert.equal(r.scoreRange[1]-r.scoreRange[0],25);});
assert.equal(one({load_kw:0}).parts.size,0);
assert.equal(one({incentive_score:0}).parts.incentive,0);
[-1,101,'no',true,{}].forEach(function(v){assert.equal(one({incentive_score:v}).score,null);});
assert.equal(one({load_kw:4000}).parts.size,100);
assert.equal(one({grid_dist_mi:6}).parts.grid,0);
assert.equal(one({name:''}).score,null);
var onlyGrid={grid:1,size:0,incentive:0,land:0,offtake:0,interconnect:0};
assert.equal(one({load_kw:'',incentive_score:''},onlyGrid).score,92);
assert.throws(function(){one({},Object.assign({},onlyGrid,{grid:0}));},/positive/);
assert.throws(function(){one({},Object.assign({},onlyGrid,{grid:-1}));});
var portfolio=Array.from({length:50},function(_,i){return Object.assign({},good,{name:'Site '+i,grid_dist_mi:i===0?'':i/10});});
var ranked=engine.rank(portfolio).rows;assert.equal(ranked.length,50);assert.equal(ranked[49].name,'Site 0');assert.equal(ranked[49].status,'Verify');
assert.deepEqual(engine.rank([good,good]).rows.map(function(r){return r.originalIndex;}),[0,1]);
async function main(){
  var auth=require('../../api/_lib/verify-token'),gate=require('../../api/_lib/screening-auth');
  var originalVerify=auth.verifyIdToken,originalRead=auth.readAsCaller;
  var bill={packaged:true,packagingState:'paid',modules:['lite','sitefinder'],accessUntil:Date.now()+86400000};
  auth.verifyIdToken=async function(){return {uid:'u',orgId:'example.com',emailVerified:true,staff:false};};
  auth.readAsCaller=async function(token,path){return path.endsWith('/current')?bill:path.indexOf('/members/')>=0?{role:'member',status:'active'}:{status:'active'};};
  try{
    var req={headers:{authorization:'Bearer test'}};await gate(req,'discovery');
    bill.modules=['lite','storage'];await assert.rejects(gate(req,'discovery'));
    bill={tier:'deluxe',toolOverrides:{sitediscovery:false}};await assert.rejects(gate(req,'discovery'));
    await assert.rejects(gate({headers:{}},'discovery'));
  }finally{auth.verifyIdToken=originalVerify;auth.readAsCaller=originalRead;}
  console.log('PASS Site Discovery: weighted score, unknowns, zero values, invalid values, bounds, weights, stable 50-site ranking and module access.');
}
main().catch(function(e){console.error(e);process.exitCode=1;});
