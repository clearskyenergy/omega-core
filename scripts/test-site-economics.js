/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var assert = require('assert'), model = require('../api/_lib/site-economics');
function input() {return {assumptions:{computeKw:70,pue:1.3,utilizationPct:70,computeRate:0.6,
  batteryCost:24000,inverterCost:2500,chipCost:250000,otherCapex:50000,capexMode:'itemized',
  serviceKw:200,otherPeakKw:30,evPeakKw:50,energyRate:0.10,demandRate:12,annualOpex:10000,
  annualReplacement:25000,otherAnnualNet:0,recoveryYears:5,returnPct:12,hostSharePct:50,
  revenueBasis:'scenario',revenueNote:'Test sensitivity, not a quote'}};}
var b=input(), r=model.evaluate(b);
assert.equal(r.capex,326500);assert.equal(r.computePeakKw,91);assert.equal(r.annualComputeKwh,797160);
assert.equal(r.availableComputeKw,120);assert.equal(r.status,'indicative');assert(r.offer.annual>0);
assert(Math.abs(r.offer.annual-(r.annualBeforeRent-r.annualCapitalRecovery)*0.5)<0.001);
b.assumptions.computeRate=0;r=model.evaluate(b);assert.equal(r.offer.annual,0);assert.equal(r.status,'no-rent-headroom');
b=input();b.assumptions.serviceKw=100;r=model.evaluate(b);assert.equal(r.offer,null);assert.equal(r.status,'power-constrained');
b=input();b.assumptions.computeRate='';r=model.evaluate(b);assert.equal(r.offer,null);assert(r.missing.indexOf('computeRate')>=0);
b=input();b.assumptions.otherCapex='';assert.equal(model.evaluate(b).offer,null);
b=input();b.assumptions.capexMode='run';b.run={at:123,stale:false,capex:400000,annualRevenue:999999};
r=model.evaluate(b);assert.equal(r.capex,400000);assert.equal(r.annualComputeRevenue,257544);
b.run.stale=true;assert.equal(model.evaluate(b).offer,null);
b=input();b.assumptions.utilizationPct=0;r=model.evaluate(b);assert.equal(r.annualComputeKwh,797160);assert.equal(r.annualComputeRevenue,0);assert.equal(r.breakEvenRate,null);
b=input();b.assumptions.returnPct=0;r=model.evaluate(b);assert.equal(r.annualCapitalRecovery,65300);
b=input();b.assumptions.pue=0.5;assert.throws(function(){model.evaluate(b);},/pue/);
b=input();b.assumptions.computeRate='NaN';assert.throws(function(){model.evaluate(b);},/computeRate/);
b=input();b.assumptions.hostSharePct=101;assert.throws(function(){model.evaluate(b);},/hostSharePct/);
assert.equal(model.evaluate({}).offer,null);
// Handler must authenticate and enforce billing before running the new model.
var auth=require('../api/_lib/verify-token'), handler=require('../api/compute-lease');
var originalAuth=auth.authenticateWithTier, originalRead=auth.readAsCaller;
function request(a, body) {
 auth.authenticateWithTier=function(){return Promise.resolve(a);};
 auth.readAsCaller=function(token,path){return Promise.resolve(path.indexOf('/members/')>=0 ? {status:'active'} : {status:'active'});};
 var result;var res={setHeader:function(){},status:function(s){this.code=s;return this;},json:function(j){result={status:this.code,body:j};}};
 return handler({method:'POST',headers:{authorization:'Bearer test'},body:body},res).then(function(){return result;});
}
var caller={staff:false,orgId:'example.com',uid:'test'};
var body=input();body.action='site-economics';body.rep={};
request({caller:caller,billing:{},tier:'trial'},body).then(function(x){assert.equal(x.status,403);
 return request({caller:caller,billing:{toolOverrides:{computelease:false}},tier:'enterprise'},body);
}).then(function(x){assert.equal(x.status,403);return request({caller:caller,billing:{},tier:'standard'},body);
}).then(function(x){assert.equal(x.status,200);assert.equal(x.body.model,'site-economics/1');
 console.log('Site economics: model, missing inputs, power constraint, no double counting, and endpoint access passed.');
}).finally(function(){auth.authenticateWithTier=originalAuth;auth.readAsCaller=originalRead;}).catch(function(e){console.error(e);process.exitCode=1;});
