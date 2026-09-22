/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var test=require('node:test'),assert=require('node:assert/strict'),vm=require('vm'),fs=require('fs');
var PC=require('../api/_lib/project-cost'),SL=require('../api/_lib/site-lease');
function est(o){return Object.assign({total:{base:1000000,lo:900000,hi:1200000},kw:1000,kwh:4000,hours:4,estimateClass:'Class 5',estimateClassPlain:'Screening estimate',assumedSize:false,accuracy:{rangeLowUsd:700000,rangeHighUsd:1500000},financial:{incentives:{total:300000},netCostUsd:700000}},o||{});}
test('both routes on one page: the build is the same, site control differs, and the verdict names the cheaper route and the break-even year',function(){
  var offer=SL.offer({kw:1000,kwh:4000,termYears:15});
  var r=PC.compose({capex:est(),lease:offer,askPrice:2450000,sqft:44000});
  assert.equal(r.capex.base,1000000);assert.equal(r.capex.perKwh,250);assert.equal(r.capex.net,700000);assert.equal(r.capex.incentives,300000);
  assert.equal(r.buy.pending,false);assert.equal(r.buy.total,3450000);assert.equal(r.buy.totalNet,3150000);assert.equal(r.buy.pricePerSqft,55.68);
  assert.equal(r.lease.siteControl,offer.termTotal.base);assert.equal(r.lease.total,1000000+offer.termTotal.base);assert.equal(r.lease.termYears,15);
  assert.equal(r.compare.cheaper,'lease');assert.equal(r.compare.saving,r.buy.total-r.lease.total);
  assert.equal(r.compare.breakEvenYears,PC.breakEvenYears(offer.annual.base,offer.escalatorPct.base,2450000,30));
  assert.match(r.compare.sentence,/Leasing costs \$[\d,]+ less than buying over 15 years/);
  var cheap=PC.compose({capex:est(),lease:offer,askPrice:100000});
  assert.equal(cheap.compare.cheaper,'buy');assert.match(cheap.compare.sentence,/Buying costs .* less than leasing .* rent passes the asking price in year \d+/);
});
test('no asking price: the purchase route is pending API integration, never a made-up number',function(){
  var r=PC.compose({capex:est(),lease:SL.offer({kw:1000,kwh:4000})});
  assert.equal(r.buy.pending,true);assert.equal(r.buy.total,null);assert.match(r.buy.note,/pending API integration/);assert.equal(r.compare.cheaper,null);assert.match(r.compare.sentence,/needs an asking price/);
  assert.throws(function(){PC.compose({capex:null,lease:SL.offer({kw:10})});},/priced system/);
});
test('break-even: cumulative escalated rent against the asking price',function(){
  assert.equal(PC.breakEvenYears(100000,0,250000,30),3);assert.equal(PC.breakEvenYears(100000,2.5,1e9,30),null);assert.equal(PC.breakEvenYears(0,2.5,100,30),null);
});
test('the endpoint refuses before pricing, prices through the price-site path, and hides the rate components from a rep',async function(){
  var calls=[],caller={uid:'u',orgId:'example.com',staff:false},gateOk=true;
  var box={module:{exports:{}},require:function(n){
    if(n==='./_lib/admin')return {httpError:(s,m)=>Object.assign(Error(m),{status:s}),handler:f=>f,safeOrg:s=>/^[a-z.]+$/.test(s)?s:'',authenticate:async req=>{if(!req.token)throw Object.assign(Error('auth'),{status:401});return caller;},canActInOrg:async(c,o)=>c.orgId===o};
    if(n==='./_lib/embed')return {rateLimit:()=>{}};
    if(n==='./price-site')return {_helpers:{gate:async()=>{calls.push('gate');if(!gateOk)throw Object.assign(Error('no'),{status:403});},validateInput:b=>{calls.push('validate');if(!b.kw)throw Object.assign(Error('kw is required'),{status:400});},orgPricing:async()=>{calls.push('orgPricing');return {rates:null};},finish:(c,o,b)=>{calls.push('finish');return est({kw:Number(b.kw),kwh:Number(b.kw)*Number(b.hours||4),site:{id:b.site&&b.site.id}});}}};
    if(n==='./_lib/site-lease')return SL;if(n==='./_lib/project-cost')return PC;throw Error('unexpected require '+n);
  },Date,Number,Object,Array,JSON,Math,Promise,console,String,isFinite};
  vm.runInNewContext(fs.readFileSync(require.resolve('../api/project-cost'),'utf8'),box);
  var api=box.module.exports,res={setHeader(){}};
  await assert.rejects(api({method:'POST',body:{}},res),{status:401});
  await assert.rejects(api({method:'POST',token:true,body:{orgId:'other.com',kw:100}},res),{status:403});
  gateOk=false;await assert.rejects(api({method:'POST',token:true,body:{kw:100}},res),{status:403});assert.deepEqual(calls,['gate'],'refused before any pricing');
  gateOk=true;calls.length=0;
  await assert.rejects(api({method:'POST',token:true,body:{kw:100,askPrice:-5}},res),{status:400});calls.length=0;
  var out=await api({method:'POST',token:true,body:{kw:1000,hours:4,askPrice:2450000,termYears:20,sqft:44000,site:{id:'crexi:1'}}},res);
  assert.deepEqual(calls,['gate','validate','orgPricing','finish']);
  assert.equal(out.build,'project-cost/1');assert.equal(out.result.buy.total,3450000);assert.equal(out.result.lease.termYears,20);assert.equal(out.offer.components,undefined,'a rep never sees the rate components');assert.equal(out.offer.rateCard.disclosed,false);
  assert.equal(out.estimate.total.base,1000000);assert.match(out.disclaimer,/not a bid/);
  caller.staff=true;var st=await api({method:'POST',token:true,body:{kw:1000,hours:4}},res);assert.ok(st.offer.components,'staff see the components');assert.equal(st.result.buy.pending,true);
});
