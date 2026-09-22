/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var test=require('node:test'),assert=require('node:assert/strict');
var S=require('../api/_lib/comed-service');
test('only the service root, a layer and a layer query are reachable through the proxy',function(){
  assert.equal(S.safePath(''),'');assert.equal(S.safePath('/75/query/'),'75/query');assert.equal(S.safePath('75'),'75');
  ['../x','75/applyEdits','75/query/extra','abc','75/addFeatures','info'].forEach(function(p){assert.equal(S.safePath(p),null,p);});
  assert.throws(function(){S.url('75/applyEdits',{});},/not allowed/);
});
test('the proxied URL names the current service, keeps the caller\'s query, drops the path key and forces JSON',function(){
  var u=S.url('75/query',{path:'75/query',where:'1=1',geometry:'-87.78,42.04'});
  assert.ok(u.indexOf(S.SERVICE+'/75/query?')===0);assert.ok(/where=1%3D1/.test(u));assert.ok(/geometry=-87\.78%2C42\.04/.test(u));assert.ok(/(\?|&)f=json/.test(u));assert.ok(!/path=/.test(u));
  assert.equal(S.url('',{f:'pjson'}),S.SERVICE+'?f=pjson');
  assert.ok(/Hosting_Capacity_[A-Z]{3}20\d\d\/FeatureServer$/.test(S.SERVICE),'the service constant names a monthly publication');
});
test('a point query asks the attribution layer within the 46 m rule for the capacity fields',function(){
  var u=S.pointQueryUrl(42.04,-87.78);
  assert.ok(u.indexOf(S.SERVICE+'/75/query?')===0);assert.ok(/geometry=-87\.78%2C42\.04/.test(u));assert.ok(/distance=46/.test(u));assert.ok(/units=esriSRUnit_Meter/.test(u));
  assert.ok(/outFields=Feeder%2CFeeder_N%2CSS_N%2CBESS_HC/.test(u));assert.ok(/returnGeometry=false/.test(u));
  var h=S.headers();assert.ok(/exelonutilities\.maps\.arcgis\.com/.test(h.Referer));assert.equal(h.Origin,'https://exelonutilities.maps.arcgis.com');
});
