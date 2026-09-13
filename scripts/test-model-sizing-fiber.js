/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var assert=require('assert'), fs=require('fs'), vm=require('vm');
var E=require('../api/_lib/bess-engine'), tool=require('../api/_lib/battery-tool-engine');
var checks=0;
function check(name,fn){fn();checks++;console.log('ok '+name);}
var year=Array.from({length:8760},function(_,i){return i%24>=10&&i%24<15?1000:300;});
check('monthly candidates carry finite power, capex, savings and C-rate',function(){
 var r=E.sizeFromMonthly(Array.from({length:12},function(_,i){return {month:i,demandKw:1000,kwh:200000};}),{});
 assert(r.ok);r.candidates.forEach(function(c){assert(Number.isFinite(c.powerKw)&&Number.isFinite(c.capex)&&Number.isFinite(c.savingsYr));assert(c.powerKw/c.nameplateKwh<=0.5+1e-8);});
});
check('invalid loads, interval duration and tariff fail closed',function(){
 [NaN,Infinity,-1,'500'].forEach(function(v){var a=year.slice();a[5]=v;assert.equal(E.sizeFromInterval(a,{}).ok,false);});
 assert.equal(E.sizeFromInterval(year,{intervalMin:-15}).ok,false);
 assert.equal(E.sizeFromInterval(year,{tariff:{maxC:0}}).ok,false);
 assert.equal(E.sizeFromMonthly([{demandKw:500,kwh:-1}],{}).ok,false);
});
check('zero-load month retains dispatch alignment',function(){
 var a=year.slice();for(var i=744;i<1416;i++)a[i]=0;
 var r=E.sizeFromInterval(a,{});assert(r.ok);assert.equal(r.meta.peaks.length,12);assert.equal(r.meta.peaks[1].peakKw,0);
 assert.equal(r.recommended.months[1].billedKw,0);
});
check('February receives leap day and near-year gaps are rejected',function(){
 assert.equal(E.monthSpans(8784,60,0)[1].b-E.monthSpans(8784,60,0)[1].a,696);
 assert.equal(E.monthSpans(8759,60,0),null);assert.equal(E.sizeFromInterval(year.slice(0,-1),{}).ok,false);
});
check('meter includes charging and complete round-trip losses',function(){
 var d=E.dispatchYear([0,10,0,10],[{a:0,b:4}],[5],5,5,1,0.8);
 assert(Math.abs(d.chargeKwh-10)<1e-8);assert(Math.abs(d.dischargeKwh-8)<1e-8);
 assert.equal(d.billedPeaks[0],6);assert.equal(d.finalSocKwh,0);
});
check('ratchet never bills against future peaks',function(){assert.deepEqual(E.billedDemand([{peakKw:100},{peakKw:1000}],0,0.8),[100,1000]);});
check('unscheduled arbitrage is excluded from payback',function(){var r=E.sizeFromInterval(year,{tariff:{touSpread:0.3}});assert(r.ok);assert(r.candidates.every(function(c){return c.arbitrageYr===0&&c.savingsYr<=c.demandSavingsYr;}));});
function lift(source,name){var a=source.indexOf('function '+name+'(');assert(a>=0,name);var b=source.indexOf('\n}',a);return source.slice(a,b+2);}
var html=fs.readFileSync('editor.html','utf8'), box={};vm.createContext(box);vm.runInContext(lift(html,'elementBox'),box);
check('rectangular 2D equipment retains its height in 3D',function(){var b=box.elementBox({type:'evgear',x:20,y:30,w:100,h:40});assert.equal(b.h,40);assert.equal(b.y+b.h/2,50);assert.equal(box.elementBox({type:'bess-asm',w:100}).h,55);});
var atlas=fs.readFileSync('grid-atlas.html','utf8'), gb={};vm.createContext(gb);vm.runInContext(lift(atlas,'validateFiberGeoJSON'),gb);
check('fiber accepts route geometry and rejects coverage polygons and invalid coordinates',function(){
 function fc(type,coordinates){return {type:'FeatureCollection',features:[{geometry:{type,coordinates},properties:{source:'test'}}]};}
 assert.equal(gb.validateFiberGeoJSON(fc('LineString',[[-87,41],[-87.1,41.1]])).length,1);
 assert.throws(function(){gb.validateFiberGeoJSON(fc('Polygon',[]));});
 assert.throws(function(){gb.validateFiberGeoJSON(fc('LineString',[[200,41],[0,0]]));});
});
check('fiber source selection includes licensed routes and excludes subsea',function(){var keys=/var fiberKeys=([^;]+);/.exec(atlas)[1];assert(keys.includes('fiber_licensed'));assert(keys.includes('fiber_import'));assert(!keys.includes('subsea'));assert(!atlas.includes('On-net — minimal lateral build'));});
check('standalone dispatch is continuous and reports finite economics',function(){
 var month=Array.from({length:744},function(_,i){return i%24>=10&&i%24<15?1000:300;});
 var r=tool({mode:'tool-interval',settings:{obj:'npv'},durations:[2],data:[{load:month,dt:1,peak:1000,min:300,days:31,label:'Jan 2025',key:'2025-01',kwh:300000},{load:month,dt:1,peak:1000,min:300,days:31,label:'Feb 2025',key:'2025-02',kwh:300000}]});
 assert(Number.isFinite(r.rec.capex));assert.equal(r.netProfiles.length,2);
 var soc=0, total=0, b=r.best;
 r.months.forEach(function(m,k){var peak=0;m.load.forEach(function(load,i){var net=load,T=b.peaks[k];if(load>T){var out=Math.min(load-T,b.kW,soc);soc-=out;net-=out;}else{var ch=Math.min(T-load,b.kW,(b.kWh-soc)/.88);soc+=ch*.88;net+=ch;}assert(Math.abs(net-r.netProfiles[k][i])<1e-6);peak=Math.max(peak,net);});total+=(m.peak-peak)*18.5;});
 assert(Math.abs(total-r.best.periodSav)<1e-4);
});
check('CSV import keeps invalid load rows and detects 5-minute leap years',function(){
 var v=E.parseInterval('Timestamp,kW\n2025-01-01T00:00:00,400\n2025-01-01T01:00:00,bad\n2025-01-01T02:00:00,0');
 assert.equal(v.length,3);assert(Number.isNaN(v[1]));assert.equal(v[2],0);assert.equal(E.detectInterval(105408),5);
});
console.log(checks+' focused regression checks passed');
