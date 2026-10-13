#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * The utility rate book lives on the server (api/_lib/utility-rates.js behind
 * GET /api/utility-rates) and never in editor.html again (2026-10-12: a
 * customer's engineer proposed building their own editor; the curated tables
 * were the thing to copy). Holds the library's answers, the endpoint's gate,
 * and that the page carries a cache and not the book. */
'use strict';
var assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '../..'), count = 0;
function read(f) { return fs.readFileSync(path.join(ROOT, f), 'utf8'); }
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

/* the endpoint: GET, a workspace sign-in, one record */
var ep = read('api/utility-rates.js');
assert.match(ep, /req\.method !== 'GET'/); assert.match(ep, /A\.authenticate\(req\)/); count += 2;
assert.match(ep, /caller\.orgId \|\| caller\.staff/); assert.match(ep, /httpError\(403/); count += 2;
assert.match(ep, /U\.lookup\(zip\)/); assert.ok(ep.indexOf('IL_UTILITY_RATES') < 0, 'the endpoint never hands out the table'); count += 2;

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
    console.log('tutilityrates: ' + count + ' assertions passed');
  });
}).catch(function (e) { console.error(e); process.exit(1); });
