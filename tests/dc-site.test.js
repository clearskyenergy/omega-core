/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),path=require('path');
var model=require('../api/_lib/dc-site-score'),engine=require('../api/_lib/dc-site-evidence');
function route(m){return {feature_kind:'fiber_route',mapped_distance_m:m,source_url:'https://example.com/routes',operator:'Published operator'};}
function attr(r,key){return r.attributes.find(function(a){return a.key===key;});}
test('missing evidence stays unknown; weights sum to 100 and no readiness inferred',function(){var r=model.build({});assert.equal(r.score,null);assert.equal(r.measured_weight_pct,0);assert.equal(r.attributes.reduce(function(n,a){return n+a.weight;},0),100);assert.equal(r.ready_for_development,null);assert.equal(r.readiness_score,null);});
test('real route proximity contributes without granting service, capacity or diversity',function(){var r=model.build({fiber:{status:'ok',routes:[route(50)]}});assert.equal(r.score,100);assert.equal(r.measured_weight_pct,20);['carrier_service','power_capacity','physical_diversity','cooling','land'].forEach(function(k){assert.equal(attr(r,k).score,null);});assert.match(r.verdict,/unresolved/);});
test('planned, unknown medium, facilities, corridors, images and raw route count earn no proximity points',function(){var r=model.build({fiber:{status:'ok',routes:[],planning_routes:[route(0)],unknown_medium_routes:[route(0)],facilities:[route(0)],counts_in_radius:{routes:999}},corridor:{distance_km:0},images:[{}]});assert.equal(r.score,null);var one=model.build({fiber:{status:'ok',routes:[route(500)]}}),many=model.build({fiber:{status:'ok',routes:[route(500),route(500),route(500)]}});assert.equal(one.score,many.score);});
test('failures, empty and truncated sources are unknown not zero or clear',function(){['failed','empty','partial'].forEach(function(status){var r=model.build({fiber:{status:status,routes:status==='empty'?[]:[route(50)]},market:{status:status},flood:{status:status}});assert.equal(r.score,null);});});
test('FEMA high risk is a flag even when other signals score strongly; unmapped or D stays unknown',function(){var r=model.build({fiber:{status:'ok',routes:[route(0)]},flood:{status:'ok',zones:[{zone:'AE',sfha:'T'}]}});assert.equal(attr(r,'flood').score,10);assert.equal(r.requirements.find(function(g){return g.key==='hazards';}).status,'mapped_risk');assert.equal(model.build({flood:{status:'ok',zones:[{zone:'D'}]}}).score,null);assert.equal(model.build({flood:{status:'empty',zones:[]}}).score,null);});
test('strict input parsing rejects coercion and caller-provided scores cannot enter model',function(){for(var bad of ['',null,false,[],{},'Infinity'])assert.throws(function(){engine.parse({lat:bad,lon:-96});});assert.throws(function(){engine.parse({lat:32,lon:-96,requested_mw:-1});});assert.throws(function(){engine.parse({lat:32,lon:-96,profile:'invented'});});assert.equal(engine.parse({lat:32,lon:-96,score:100}).score,undefined);});
test('collector uses fixed source URLs, minimizes fields, surfaces failures and normalizes dates',async function(){
 var seen=[];function fetcher(url){seen.push(url);var j;
  if(url.indexOf('Electric_Substations/')>=0)j={features:[{attributes:{OBJECTID:1,NAME:'Published station',MAX_VOLT:138,SOURCEDATE:1484611200000},geometry:{x:-96,y:32}}]};
  else if(url.indexOf('Transmission_Lines/')>=0)j={features:[],exceededTransferLimit:true};
  else if(url.indexOf('NFHL')>=0)j={features:[]};
  else j={data:[{id:1,name:'Unknown network count',latitude:32,longitude:-96},{id:2,name:'Market facility',latitude:32,longitude:-96,net_count:20}]};
  return Promise.resolve({ok:true,json:function(){return Promise.resolve(j);}});
 }
 var r=await engine.collect({lat:32,lon:-96,sourceUrl:'http://localhost/secrets'}, {fetch:fetcher,fiberScreen:function(){return {routes:[route(50)],counts_in_radius:{routes:1}};}});
 assert.equal(seen.length,4);assert(seen.every(function(u){return u.indexOf('localhost')<0;}));assert.equal(r.sources.transmission,'partial');assert.equal(r.source_details.substations.nearest.source_date,'2017-01-17');assert.equal(r.source_details.peeringdb.nearest.id,2);assert.equal(r.measured_weight_pct,50);
 var fail=await engine.collect({lat:32,lon:-96},{fetch:function(){return Promise.reject(Error('offline'));},fiberScreen:function(){throw Error('missing shard');}});assert.equal(fail.score,null);assert.equal(fail.sources.fiber,'failed');assert.equal(fail.sources.fema,'failed');
});
test('scoring API authenticates and authorizes before touching evidence, is private and rejects invalid requests',async function(){
 async function run(opts){opts=opts||{};var calls=0,result={headers:{}},auth={httpError:function(s,m){var e=Error(m);e.status=s;return e;},authenticateWithTier:function(req){if(!req.headers.authorization)return Promise.reject(this.httpError(401,'No token'));return Promise.resolve({caller:{orgId:'example.com',uid:'member',staff:false},billing:{toolOverrides:opts.denied?{gridatlas:false}:{}}});},readAsCaller:function(t,p){return Promise.resolve(p.indexOf('/members/')>=0?(opts.noMember?null:{status:'active',toolAccess:opts.noAccess?[]:['gridatlas']}):{status:opts.suspended?'suspended':'active'});}};
  var gate={module:{exports:{}},require:function(){return auth;},Promise:Promise};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../api/_lib/grid-atlas-access.js'),'utf8'),gate);
  var api={module:{exports:{}},require:function(n){return n.indexOf('access')>=0?gate.module.exports:{parse:engine.parse,collect:function(){calls++;return Promise.resolve(model.build({}));}};}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../api/dc-site-screen.js'),'utf8'),api);var res={setHeader:function(k,v){result.headers[k]=v;},status:function(s){result.status=s;return res;},json:function(x){result.body=x;return res;}};
  await api.module.exports({method:opts.method||'POST',headers:opts.noToken?{}:{authorization:'Bearer fixture'},body:opts.body||{lat:32,lon:-96}},res);result.calls=calls;return result;
 }
 for(var o of [{noToken:true},{suspended:true},{noMember:true},{noAccess:true},{denied:true}]){var denied=await run(o);assert([401,403].includes(denied.status));assert.equal(denied.calls,0);}
 assert.equal((await run({body:{lat:'',lon:1}})).status,400);assert.equal((await run({method:'GET'})).status,405);var ok=await run();assert.equal(ok.status,200);assert.equal(ok.calls,1);assert.equal(ok.headers['Cache-Control'],'private, no-store');
});
test('all deployed fiber entrypoints include compressed geometry, not raw shards',function(){var cfg=require('../vercel.json');['api/dc-site-screen.js','api/fiber-screen.js','api/network-proximity.js'].forEach(function(p){assert.match(cfg.functions[p].includeFiles,/geojson\.gz/);assert.equal(cfg.functions[p].excludeFiles,'data/usa-fiber/*.geojson');});});
test('missing national manifest cannot silently become no fiber evidence',function(){
 var fake=Object.assign({},fs,{readFileSync:function(file){if(String(file).indexOf('usa-fiber')>=0)throw Error('missing inventory');return fs.readFileSync.apply(fs,arguments);}});
 var box={module:{exports:{}},__dirname:path.join(__dirname,'../api/_lib'),require:function(n){return n==='fs'?fake:require(n);}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../api/_lib/fiber-evidence.js'),'utf8'),box);
 assert.throws(function(){box.module.exports.usaCandidates([-97,32,-96,33]);},/missing inventory/);
});
