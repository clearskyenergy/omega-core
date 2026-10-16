#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * The EV Cost Workbook's price books run on the server (api/_lib/ev-pricebook.js
 * behind POST /api/ev-price; 2026-10-13). Holds the library against the
 * numbers the page itself produced on two reference jobs (fixtures/
 * ev-pricebook-goldens.json, captured before the move), the endpoint's gate,
 * the page carrying no price, and the page's wrappers cut out and run under a
 * fake sign-in and fetch. */
'use strict';
var assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm');
var ROOT = path.join(__dirname, '../..'), count = 0;
function read(f) { return fs.readFileSync(path.join(ROOT, f), 'utf8'); }
var EV = require(path.join(ROOT, 'api/_lib/ev-pricebook')), G = JSON.parse(read('scripts/tests/fixtures/ev-pricebook-goldens.json'));
var JOBS = {
  ma10: { data: { plugs: 10, city: 'Boston, MA', ftTrench: 120, ftConduit: 300, ftCable: 40, ftConduitUG: 300, ftConduitAG: 40, trenchSurface: 'Continuously paved (asphalt, concrete)', serviceScenario: 'New service', nBollard: 4, nPad: 5, nPedestal: 0, nServicePedestal: 2, nFpPositions: 2, ftConduitFP: 0, ftTrenchFP: 0, class: 'l2', needPanel: 'Yes' },
    ctx: { ports: 10, paved: 120, turf: 0, newService: true, ma: true, form: { designFlat: 0, short: 'NG MA' }, subtotalExPermit: 20000, chargerClass: 'l2', fleetUnits: 0, trenchSurfacePaved: true, hasConduitAG: { mr: true } }, fleet: [] },
  ct4: { data: { plugs: 4, city: 'New Haven, CT', ftTrench: 50, ftTrenchPaved: 30, ftTrenchTurf: 20, ftConduit: 90, ftCable: 0, trenchSurface: 'Non-continuously paved (ground cover, turf)', needPanel: 'No', nBollard: 0, nPad: 0, nPedestal: 2, class: 'l2' },
    ctx: { ports: 4, paved: 30, turf: 20, newService: false, ma: false, form: { designFlat: 2000, short: 'ES CT' }, subtotalExPermit: 0, chargerClass: 'l2', fleetUnits: 2, trenchSurfacePaved: false, hasConduitAG: {} },
    fleet: [{ qty: 2, kw: 19.2, model: 'AC Pro', mfr: 'Autel', unitCost: 1119, unitInstall: 900, pn: 'UW19L002' }] }
};
Object.keys(JOBS).forEach(function (name) {
  var J = JOBS[name], r = EV.rates(Object.assign({ data: J.data }, J.ctx)), g = G[name];
  Object.keys(g.rates).forEach(function (k) {
    var want = g.rates[k], got = r.rates[k];
    if (k.split('|')[1] === 'permit') { assert.equal(got.lab, want.lab, name + ' ' + k); count++; return; }
    assert.deepEqual(got, want, name + ' ' + k); count++;
  });
  var b = EV.baseline({ data: J.data, fleet: J.fleet, opt: {} }), gb = g.baseline.map(function (x) { var y = Object.assign({}, x); delete y.id; return y; });
  assert.deepEqual(b, gb, name + ' baseline'); count++;
});
assert.deepEqual([EV.dcfcSteppedLabor(30, 'mr'), EV.dcfcSteppedLabor(80, 'mr'), EV.dcfcSteppedLabor(150, 'fp')], G.ma10.dcfc.stepped); assert.equal(EV.dcfcRestorationLabor(40), G.ma10.dcfc.restore); assert.deepEqual(EV.dcfcRebate(100000, 300000, 20000), G.ma10.dcfc.rebate); count += 3;
/* overrides ride on the request */
var o = EV.rates(Object.assign({ data: JOBS.ma10.data }, JOBS.ma10.ctx, { overrides: { trenchPaved: { lab: 60 }, _design: { lab: 900 }, _permitPct: { mat: 5 } } }));
assert.equal(o.rates['mr|trench'].lab, 120 * 60); assert.equal(o.rates['mr|design'].lab, 9000); assert.equal(o.rates['mr|permit'].lab, 1000); assert.equal(o.card.trenchPaved.lab, 80, 'the defaults shown are the card, not the override'); count += 4;
/* the National Grid book: lines, flags, and what the page needs for its check */
var ng = EV.ng({ ports: 6, paved: 80, unpaved: 0, conduit: 200, handholes: 0, service: 'standard', hw80PerPort: 0, ports80: 0, segment: 'MUD', extras: [], submitted: [] });
assert.equal(ng.P, 6); assert.equal(ng.S, 3); assert.ok(ng.lines.length >= 10); assert.ok(ng.band && ng.band.lo > 0 && ng.panelSingleTotal > 0 && /v2/.test(ng.version)); assert.ok(!('changes' in ng), 'the change table is the page\'s'); count += 5;
assert.equal(ng.lines.filter(function (l) { return l.row === 'charger'; })[0].mat, 6 * 2000, 'the confirmed $2,000 a plug'); count++;
/* the endpoint */
var ep = read('api/ev-price.js');
assert.match(ep, /req\.method !== 'POST'/); assert.match(ep, /A\.authenticate\(req\)/); assert.match(ep, /caller\.orgId \|\| caller\.staff/); ['rates', 'baseline', 'ng', 'dcfc'].forEach(function (a) { assert.ok(ep.indexOf("b.action === '" + a + "'") >= 0, a); }); count += 7;
/* the page: no price book, the wrappers, the pending rule */
var ed = read('ev-cost-workbook.html');
['labBase:1170', 'a50:2000', 'designPerPort:1423', "charger:{mat:2200", 'trenchPaved:   { mat:15.00', 'perPort:{ charger', 'networking:{mat:480', 'bollard:{ mat:250,  lab:300  }', 'xfmrEach', 'switchgear:      800500', "case 'trench':     return ftT>0"].forEach(function (t) { assert.ok(ed.indexOf(t) < 0, 'a price or rule is still in the page: ' + t); count++; });
assert.match(ed, /fetch\('\/api\/ev-price', \{ method:'POST'/); count++;
assert.match(ed, /if\(rate===undefined\) continue;\s+\/\* being priced: leave the line as it is \*\//); count++;
assert.match(ed, /if\(rate===undefined\)\{ _evpPendingStd=true; continue; \}/); count++;
assert.match(ed, /function ngPriceBook\(Q\)\{\n  var R = _evpRequest\('ng', \{ q:Q \}\);/); count++;
assert.match(ed, /var B=\(NG_LAST&&NG_LAST\.band\)\|\|/); count++;
/* The page LOADS. The move left `window.STANDARD_ITEMS=STANDARD_ITEMS;` behind
   after the table it published was deleted: a ReferenceError at load that killed
   the one script block holding boot, the message listener and the ready ping,
   so the editor's EV Cost Workbook button opened an empty shell and nothing was
   ever handed over (Concord, 2026-10-14). The wrappers above are cut out and run
   on their own, which is how that slipped past. Every inline block runs here in
   a stub browser; a top-level throw of any kind fails. */
(function () {
  var re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi, m, n = 0;
  function el() { var e = { style: {}, value: '', textContent: '', innerHTML: '', dataset: {}, classList: { add: function () {}, remove: function () {}, toggle: function () {}, contains: function () { return false; } } }; ['addEventListener', 'setAttribute', 'appendChild', 'removeChild', 'remove', 'focus', 'click'].forEach(function (k) { e[k] = function () {}; }); e.getAttribute = function () { return null; }; e.querySelector = function () { return null; }; e.querySelectorAll = function () { return []; }; return e; }
  var w = { document: { getElementById: el, querySelector: el, querySelectorAll: function () { return []; }, createElement: el, body: el(), documentElement: el(), head: el(), addEventListener: function () {}, readyState: 'loading', title: '' },
    navigator: { userAgent: 'node' }, location: { hostname: 'concordenergyusa.clearskyomega.com', origin: 'https://concordenergyusa.clearskyomega.com', search: '', href: '', pathname: '/' },
    localStorage: { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} }, console: console,
    setTimeout: function () { return 0; }, clearTimeout: function () {}, setInterval: function () { return 0; }, clearInterval: function () {}, requestAnimationFrame: function () { return 0; },
    fetch: function () { return new Promise(function () {}); }, addEventListener: function () {}, removeEventListener: function () {}, alert: function () {}, matchMedia: function () { return { matches: false, addEventListener: function () {}, addListener: function () {} }; },
    innerWidth: 1200, innerHeight: 800, history: { replaceState: function () {}, pushState: function () {} }, performance: { now: function () { return 0; } }, opener: null,
    URL: { createObjectURL: function () { return ''; }, revokeObjectURL: function () {} }, Blob: function () {}, FileReader: function () {}, Image: function () {}, MutationObserver: function () { return { observe: function () {}, disconnect: function () {} }; } };
  w.sessionStorage = w.localStorage; w.window = w; w.self = w; w.top = w; w.parent = w;
  vm.createContext(w);
  while ((m = re.exec(ed))) {
    n++;
    var at = ed.slice(0, m.index).split('\n').length;
    try { vm.runInContext(m[1], w, { filename: 'ev-cost-workbook.html block ' + n }); }
    catch (e) { throw new Error('ev-cost-workbook.html: the inline script block at line ' + at + ' throws at load (' + e.name + ': ' + e.message + '), which kills boot and the handoff listener'); }
  }
  assert.ok(n >= 2, 'both inline blocks ran'); assert.equal(typeof w.__omegaBoot, 'function', 'boot is wired after load'); count += 2;
})();
/* the wrappers under a fake sign-in and fetch */
function cut(name) { var s = ed.indexOf('function ' + name + '('), k = ed.indexOf('{', s), d = 0; for (; ; k++) { if (ed[k] === '{') d++; else if (ed[k] === '}') { d--; if (!d) break; } } return ed.slice(s, k + 1); }
var calls = [], ctx = { DATA: JOBS.ma10.data, FORM: { designFlat: 0, short: 'NG MA', writer: 'nationalgrid' }, EDITOR_FLEET: [], LINES: [], _nid: 1, RATE_OVERRIDES: {}, PERMIT_PCT: 0.03,
  window: {}, JSON: JSON, Object: Object, Math: Math, Promise: Promise, String: String, Number: Number, parseFloat: parseFloat, isFinite: isFinite, setTimeout: setTimeout,
  rowExists: function (b, k) { return b === 'mr' && k === 'conduitAG'; }, isNewService: function () { return true; }, chargerClass: function () { return 'l2'; },
  trenchSurfacePaved: function () { return true; }, trenchSplit: function () { return { paved: 120, turf: 0 }; }, subtotalExcluding: function () { return 20000; },
  permitFromSubtotal: function (x) { return Math.round(x * 0.03 * 100) / 100; }, render: function () { ctx.renders = (ctx.renders || 0) + 1; }, ngChanges: function () { return []; }, ngStationsFor: function (p) { return Math.max(1, Math.ceil(p / 2)); },
  fetch: function (url, opts) { var b = JSON.parse(opts.body); calls.push(b); assert.equal(opts.headers.Authorization, 'Bearer tok'); var ans = b.action === 'rates' ? EV.rates(b) : b.action === 'baseline' ? EV.baseline(b) : EV.ng(b.q); return Promise.resolve({ ok: true, json: function () { return Promise.resolve(ans); } }); } };
ctx.window.firebase = { auth: function () { return { currentUser: { getIdToken: function () { return Promise.resolve('tok'); } } }; } }; ctx.firebase = ctx.window.firebase;
vm.createContext(ctx);
vm.runInContext('function num(v){ if(v==null||v===\'\') return 0; var n=parseFloat(String(v)); return isFinite(n)?n:0; }\n' + ed.slice(ed.indexOf('var _EVP_CACHE = {}'), ed.indexOf('function standardRate(')) + cut('standardRate') + cut('applyBaselineFromSite') + cut('ngPriceBook') + '\nthis.r1 = standardRate("trench","mr"); this.n1 = applyBaselineFromSite({replace:true});', ctx);
assert.equal(ctx.r1, undefined, 'pending answers undefined'); assert.equal(ctx.n1, 0); count += 2;
new Promise(function (res) { setTimeout(res, 80); }).then(function () {
  assert.equal(calls.length, 2); assert.equal(calls[0].action, 'rates'); assert.equal(calls[0].ports, 10); assert.ok(!/"mat":|"lab":|"rate"/.test(JSON.stringify(calls[0])), 'facts up, no price'); count += 4;
  vm.runInContext('this.r2 = standardRate("trench","mr"); this.r3 = standardRate("warranty","evse"); this.r4 = standardRate("permit","mr");', ctx);
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.r2)), G.ma10.rates['mr|trench']); assert.equal(ctx.r3.lab, 0); assert.equal(ctx.r4.lab, 600); count += 3;
  assert.equal(ctx.LINES.length, 12, 'the baseline landed on the sheet when the answer did'); assert.ok(ctx.renders >= 1); count += 2;
  vm.runInContext('this.ng = ngPriceBook({ ports:6, paved:80, unpaved:0, conduit:200, handholes:0, service:"standard", hw80PerPort:0, ports80:0, segment:"MUD", extras:[], submitted:[] });', ctx);
  assert.equal(ctx.ng.pending, true); count++;
  return new Promise(function (res) { setTimeout(res, 40); });
}).then(function () {
  vm.runInContext('this.ng2 = ngPriceBook({ ports:6, paved:80, unpaved:0, conduit:200, handholes:0, service:"standard", hw80PerPort:0, ports80:0, segment:"MUD", extras:[], submitted:[] });', ctx);
  assert.equal(ctx.ng2.pending, undefined); assert.equal(ctx.ng2.S, 3); assert.ok(ctx.ng2.band.lo > 0); assert.equal(calls.length, 3, 'cached: one request per distinct job'); count += 4;
  console.log('tevpricebook: ' + count + ' assertions passed');
}).catch(function (e) { console.error(e); process.exit(1); });
