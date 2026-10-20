#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * The utility rate book lives on the server (api/_lib/utility-rates.js behind
 * GET /api/utility-rates) and never in editor.html again (2026-10-12: a
 * customer's engineer proposed building their own editor; the curated tables
 * were the thing to copy). Holds the library's answers, the endpoint's gate,
 * and that the page carries a cache and not the book. 2026-10-17: the four
 * ZIP shadows (RI under National Grid MA, UI under Eversource CT, MidAmerican
 * and downstate Ameren under ComEd) are fixed deliberately, one assertion
 * each, and the serving utility's EIA id (from POST /api/hosting-capacity)
 * now names the record before the ZIP does. */
'use strict';
var assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '../..'), count = 0;
function read(f) { return fs.readFileSync(path.join(ROOT, f), 'utf8'); }
/* firebase-admin is intercepted at load, as tclientadmin.js and thomeclaim.js
   do: CI runs this with no npm install (tests.yml), and api/_lib/admin.js
   requires it at load. Nothing here reaches Firestore or Auth; the stand-in
   only lets the modules load, the same in CI as on a laptop with
   node_modules. */
var Module = require('module'), _load = Module._load;
function noFirebase() { throw new Error('firebase-admin is a stand-in in this test'); }
var FAKE_ADMIN = { apps: [], initializeApp: function () { FAKE_ADMIN.apps.push({}); }, credential: { cert: function (k) { return k; } }, firestore: noFirebase, auth: noFirebase };
Module._load = function (request) { return request === 'firebase-admin' ? FAKE_ADMIN : _load.apply(this, arguments); };
try { require(path.join(ROOT, 'api/_lib/admin.js')); } finally { Module._load = _load; }
var U = require(path.join(ROOT, 'api/_lib/utility-rates'));

/* the library */
assert.equal(U._count.detailed, 8); assert.equal(U._count.states, 51); count += 2;
var comed = U.lookup('60601');
assert.equal(comed.key, 'comed'); assert.equal(comed.demandRate, 19.85); assert.equal(comed.tou, true); count += 3;
assert.ok(!('zips' in comed), 'the ZIP prefixes a utility covers never leave the server'); count++;
assert.ok(!comed._fallback && !comed._stateResolved, 'a detailed-table ZIP is real evidence'); count++;
var ia = U.lookup('51001');
assert.equal(ia.name, 'MidAmerican Energy'); assert.equal(ia._stateResolved, true); assert.equal(ia._state, 'IA'); count += 3;
assert.equal(U.lookup('99501').name, 'Chugach Electric'); count++;
assert.equal(U.lookup('').key, 'comed'); assert.equal(U.lookup('')._default, true); count += 2;
assert.equal(U.lookup('00100')._fallback, true); assert.match(U.lookup('00100')._fallbackNote, /00100/); count += 2;
assert.equal(U.fromState('ct').name, 'Eversource Energy (Connecticut)'); assert.equal(U.fromState('XX'), null); count += 2;
assert.equal(U.stateForZip('606'), 'IL'); assert.equal(U.stateForZip('abc'), null); count += 2;
['name', 'demandRate', 'energyRate', 'demandPct', 'tou', 'peakWindow', 'ratchet'].forEach(function (k) { assert.ok(k in ia, k); count++; });
assert.equal(U.lookup('06103').ratchet, 0.0, 'a stated zero ratchet stays zero'); count++;

/* 2026-10-17 (DESIGN C6, r12 A7): the ZIP book was shadowed in four places.
   These change deliberately, each for the reason named. */
assert.deepEqual(U._overlaps(), [], 'one ZIP3 index: a prefix belongs to one record'); count++;
assert.equal(U.lookup('02903').name, 'Rhode Island Energy', '028/029 are Rhode Island ZIPs, not National Grid MA'); assert.equal(U.lookup('02903').key, 'state:RI'); count += 2;
assert.equal(U.lookup('06510').key, 'ui_ct', 'New Haven (065) is UI, not Eversource'); assert.equal(U.lookup('06604').key, 'ui_ct', 'Bridgeport (066) is UI'); count += 2;
assert.equal(U.lookup('06450').key, 'eversource_ct', '064 is mixed (Meriden is Eversource) and stays with Eversource'); count++;
assert.equal(U.lookup('01608').key, 'ngrid_ma', 'Worcester (016) is National Grid'); assert.equal(U.lookup('02108').key, 'eversource_ma'); count += 2;
assert.equal(U.lookup('61201').key, 'midamerican', 'Rock Island (612) is MidAmerican, not ComEd'); count++;
['62201', '62301', '62401', '61401'].forEach(function (z) { assert.equal(U.lookup(z).key, 'ameren', z + ' is downstate Ameren, not ComEd'); count++; });
assert.equal(U.lookup('60901').key, 'comed', 'Kankakee (609) is ComEd'); assert.equal(U.lookup('61101').key, 'comed', 'Rockford (611)'); count += 2;
/* by the serving utility's EIA id (the Load step passes the territory's) */
assert.equal(U.byEia('4110').key, 'comed'); assert.equal(U.byEia('4110').eiaId, '4110'); assert.equal(U.byEia('19497').key, 'ui_ct'); count += 3;
assert.equal(U.byEia('13214').name, 'Rhode Island Energy'); assert.equal(U.byEia('7801').name, 'Florida Power & Light (FPL)', 'Gulf Power is FPL'); count += 2;
var ace = U.byEia('963', { display: 'Atlantic City Electric', state: 'NJ' });
assert.equal(ace.name, 'Atlantic City Electric', 'the utility at the point, by its own name'); assert.equal(ace.ratesFrom, 'PSE&G'); assert.equal(ace._stateResolved, true); count += 3;
assert.match(ace._rateNote, /No rate book for Atlantic City Electric yet; these are NJ planning rates \(PSE&G\)/); assert.ok(!('zips' in ace)); count += 2;
assert.equal(U.byEia('963', { state: 'NJ' }), null, 'no name, no record: never another utility\'s name over its rates'); assert.equal(U.byEia(''), null); count += 2;
assert.equal(U.byEia('963', { display: 'Atlantic City Electric', zip: '08401' })._state, 'NJ', 'the state from the ZIP when not given'); count++;

/* the endpoint: GET, a workspace sign-in, one record */
var ep = read('api/utility-rates.js');
assert.match(ep, /req\.method !== 'GET'/); assert.match(ep, /A\.authenticate\(req\)/); count += 2;
assert.match(ep, /caller\.orgId \|\| caller\.staff/); assert.match(ep, /httpError\(403/); count += 2;
assert.match(ep, /U\.lookup\(zip\)/); assert.ok(ep.indexOf('IL_UTILITY_RATES') < 0, 'the endpoint never hands out the table'); count += 2;
assert.match(ep, /U\.byEia\(eia, \{ display: display, state: st, zip: zip \}\)/); assert.match(ep, /HS\.byKey\(key\) : HS\.byEia\(eia\)/, 'the name comes from the one hosting registry'); count += 2;
/* the endpoint, run: ?eia= wins, a ZIP is the fallback */
var endpointRun = (function () {
  var A = require(path.join(ROOT, 'api/_lib/admin'));
  var real = A.authenticate; A.authenticate = function () { return Promise.resolve({ uid: 'u', orgId: 'clearsky-usa.com' }); };
  var h = require(path.join(ROOT, 'api/utility-rates.js'));
  function call(q) {
    return new Promise(function (ok) {
      var res = { h: {}, setHeader: function (k, v) { this.h[k] = v; }, status: function (s) { this.s = s; return this; }, json: function (j) { ok({ s: this.s, j: j }); }, end: function () { ok({ s: this.s }); }, headersSent: false };
      h({ method: 'GET', headers: {}, query: q }, res);
    });
  }
  return call({ eia: '963', zip: '08401' }).then(function (r) {
    assert.equal(r.s, 200); assert.equal(r.j.name, 'Atlantic City Electric'); count += 2;
    return call({ utility: 'ui', zip: '06450' });
  }).then(function (r) {
    assert.equal(r.j.key, 'ui_ct', 'a registry key resolves through its EIA id'); count++;
    return call({ eia: '99999', zip: '02903' });
  }).then(function (r) {
    assert.equal(r.j.name, 'Rhode Island Energy', 'an id nobody can name falls back to the ZIP'); count++;
    return call({ eia: '17040', name: 'Shelby Electric Coop', zip: '62565' });
  }).then(function (r) {
    assert.equal(r.j.name, 'Shelby Electric Coop', 'a co-op the registry knows only as a group keeps the territory\'s name'); assert.match(r.j._rateNote, /IL planning rates/); count += 2;
    A.authenticate = real;
  });
})();

/* the page: a cache, not the book */
var ed = read('editor.html');
['IL_UTILITY_RATES', 'STATE_PRIMARY_UTILITY', 'demandRate:19.85', "name:'Alabama Power'", "name:'Pacific Gas", "'Eversource Energy (Connecticut)'"].forEach(function (k) {
  assert.ok(ed.indexOf(k) < 0, 'the book is in the page: ' + k); count++;
});
assert.match(ed, /fetch\('\/api\/utility-rates\?'\+q/); count++;
assert.match(ed, /function _fomGetUtility\(zip\)\{\n  var key=_fomUtilKey\(zip,''\);\n  if\(!_FOM_UTIL_CACHE\[key\]\) _fomUtilityFetch\(zip,''\);\n  return _FOM_UTIL_CACHE\[key\];/); count++;
/* every reader of the record copes with a pending one */
assert.match(ed, /const util    = _fomGetUtility\(zip\);\n  if \(_fomUtilPending\(util\)\)/); count++;
assert.match(ed, /_fomUtilityFetch\(bill\.zip\)\.then\(function\(util\)\{/); count++;
/* the interconnect score asks the server, which reads the rate book itself (teditorscore.js) */
assert.ok(ed.indexOf('_fomGetUtility') < ed.indexOf('function computeInterconnectScore(') && ed.slice(ed.indexOf('function computeInterconnectScore('), ed.indexOf('function computeInterconnectScore(') + 2500).indexOf('_fomGetUtility') < 0, 'the interconnect score no longer reads the page cache'); count++;
assert.match(ed, /the server's rate book, cached per ZIP prefix\n  if \(_fomUtilPending\(util\)\)/); count++;
/* the postal fact stays for the synchronous readers */
assert.match(ed, /^function _fomStateForZip\(zip\)\{/m); count++;


/* the page's cache, cut from editor.html and run under a fake sign-in and
   fetch: a first read is pending and starts ONE request per ZIP prefix, the
   record lands in the cache, a second read is the same object (the bill
   import edits it in place), a refused fetch leaves nothing cached. */
var start = ed.indexOf('var _FOM_UTIL_CACHE = {};'), end = ed.indexOf('function _fomUtilPending(u)');
end = ed.indexOf('\n', end) + 1;
assert.ok(start > 0 && end > start, 'the cache block'); count++;
var calls = [], refuse = false;
var ctx = {
  window: { firebase: { auth: function () { return { currentUser: { getIdToken: function () { return Promise.resolve('tok'); } } }; } } },
  fetch: function (url, opts) {
    calls.push(url); assert.equal(opts.headers.Authorization, 'Bearer tok');
    var zip = (url.match(/zip=(\d*)/) || [])[1], state = (url.match(/state=(\w*)/) || [])[1];
    if (refuse) return Promise.resolve({ ok: false, json: function () { return Promise.resolve({ error: 'nope' }); } });
    return Promise.resolve({ ok: true, json: function () { return Promise.resolve(zip && zip.length >= 3 ? U.lookup(zip) : U.fromState(state)); } });
  },
  Promise: Promise, String: String, encodeURIComponent: encodeURIComponent
};
ctx.firebase = ctx.window.firebase;
var vm = require('vm'); vm.createContext(ctx);
vm.runInContext(ed.slice(start, end) + '\nthis._g=_fomGetUtility; this._s=_fomUtilityFromState; this._p=_fomUtilPending; this._c=_FOM_UTIL_CACHE;', ctx);
var first = ctx._g('60601');
assert.equal(ctx._p(first), true); assert.equal(first.demandRate, null); count += 2;
ctx._g('60602');
first._promise.then(function (rec) {
  /* the request goes out after the sign-in token resolves, once per prefix */
  assert.equal(calls.length, 1); assert.match(calls[0], /^\/api\/utility-rates\?zip=60601$/); count += 2;
  assert.equal(rec.key, 'comed'); assert.equal(ctx._p(ctx._g('60699')), false); count += 2;
  assert.equal(ctx._g('60601'), rec, 'the cached object itself, so in-place edits persist'); count++;
  var st = ctx._s('IA', ''); assert.equal(ctx._p(st), true); count++;
  return st._promise;
}).then(function (rec) {
  assert.match(calls[1], /state=IA$/); count++;
  assert.equal(rec.name, 'MidAmerican Energy'); assert.equal(rec._stateResolved, true); count += 2;
  refuse = true;
  var bad = ctx._g('99501');
  return bad._promise.then(function () { throw new Error('should refuse'); }, function (e) {
    assert.equal(e.message, 'nope'); assert.equal(ctx._c['zip:995'], undefined, 'a refused fetch caches nothing'); count += 2;
    return endpointRun.then(function () { console.log('tutilityrates: ' + count + ' assertions passed'); });
  });
}).catch(function (e) { console.error(e); process.exit(1); });
