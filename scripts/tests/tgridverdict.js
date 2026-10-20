#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Grid Atlas built into Site Map (docs/GUIDED-SITE-FLOW.md, 2026-10-16).
 * Holds: the verdict engine (api/_lib/grid-verdict.js) — net of the queue,
 * Fits / Fits only smaller / Needs a study, the substation chip — the door
 * (api/grid-verdict.js), the panel holding no threshold, no utility's name
 * and no upstream field, the save allowlist and the load carrying `grid`,
 * the pre-screen keeping the panel's answer for the same point, and the
 * whole path run in a VM.
 * 2026-10-17: the national additions (an unpublished queue is never 0, a
 * netted queue is not netted twice, a band is judged at its low end, a
 * one-direction figure never reads as storage), with the ComEd sentence
 * pinned byte for byte. The panel asks the national door Omega Prime asks
 * (POST /api/hosting-capacity through omega-grid-verdict.js), so the VM runs
 * the real panel, the real client and the REAL door's run() on a fake
 * network: ComEd at 3400 S Federal St reads the same sentence it read off
 * the ComEd-only probe, Mesa AZ names the City of Mesa beside Salt River
 * Project with no ComEd word, the queue and side words follow the answer,
 * every coverage case is drawn, and a door that does not answer records
 * nothing.
 * 2026-10-20: who may serve the point is ONE list (GV.whoServes) that Omega
 * Prime's Circuit step, this panel and Site Plan's layer all draw. Downtown
 * Mesa lists the City of Mesa by its own map, with the city's service-area
 * map to check, and folds Salt River Project and APS away with the reason;
 * the city's map down lists all three with their routes and pages. Every
 * case is held to Prime's own candidatesBlock, run on the same answer: the
 * same words, in the same order, with the same links. */
'use strict';
var assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm');
var ROOT = path.join(__dirname, '../..'), count = 0;
function read(f) { return fs.readFileSync(path.join(ROOT, f), 'utf8'); }
var GV = require(path.join(ROOT, 'api/_lib/grid-verdict'));

var XXL = { kw: 2508, kwh: 5015, name: 'FENECON Industrial XXL' };

/* ── the engine ─────────────────────────────────────────────────────── */
var a = GV.judge({ unit: XXL, substation: { name: 'Crawford', kv: 138, km: 1.2 },
  circuit: { utility: 'ComEd', id: 'F0297', publishedKw: 15620, queuedKw: 4895, addressResolved: true } });
assert.equal(a.circuit.netKw, 10725, 'the queue is subtracted'); assert.equal(a.circuit.headroomKw, 8217);
assert.equal(a.verdict.key, 'fits'); assert.equal(a.verdict.label, 'Fits'); count += 4;
assert.equal(a.substation.chip, 'Short run · right voltage for 2.5 MW'); assert.equal(a.substation.state, 'good'); assert.equal(a.substation.miles, 0.75); count += 3;
assert.match(a.verdict.say, /^Circuit F0297 has about 10,725 kW of room: 15,620 kW published, less 4,895 kW already queued\./); count++;

/* a headline that fits and a net that does not: the net decides */
var b = GV.judge({ unit: XXL, circuit: { publishedKw: 3000, queuedKw: 1200, addressResolved: true } });
assert.equal(b.circuit.netKw, 1800); assert.equal(b.verdict.key, 'smaller'); assert.equal(b.verdict.label, 'Fits only smaller'); assert.equal(b.circuit.maxKw, 1800); count += 4;
assert.equal(b.substation, null, 'no substation sent, none invented'); count++;
var c = GV.judge({ unit: XXL, circuit: { publishedKw: 400, queuedKw: 300 } });
assert.equal(c.verdict.key, 'study'); assert.match(c.verdict.say, /best circuit in the surrounding block/, 'a block-grain answer says so'); count += 2;
assert.equal(GV.judge({ unit: XXL, circuit: { publishedKw: null, queuedKw: 0 } }).verdict.key, 'study', 'no published figure is never a fit'); count++;
assert.equal(GV.judge({ unit: XXL }).verdict.key, 'study', 'no circuit is a study'); count++;
assert.equal(GV.judge({ circuit: { publishedKw: 5000, queuedKw: 0 } }).verdict.key, 'unsized', 'no unit: judged when one is chosen'); count++;
assert.equal(GV.judge({ unit: XXL, circuit: { publishedKw: 2600, queuedKw: 0, addressResolved: true } }).circuit.thin, true); count++;
/* the substation chip against the unit */
assert.equal(GV.judge({ unit: { kw: 30000 }, substation: { name: 'X', kv: 12, km: 0.5 } }).substation.state, 'risk', '30 MW on a 12 kV substation is light'); count++;
assert.equal(GV.judge({ unit: XXL, substation: { name: 'X', kv: null, km: 3 } }).substation.chip, 'Moderate run · voltage not on record'); count++;
assert.equal(GV.judge({ unit: XXL, substation: { name: 'X', kv: 69, km: 20 } }).substation.state, 'risk', 'a long run'); count++;

/* ── the national additions (2026-10-17), all back-compatible ────────── */
/* the ComEd sentence, byte for byte, when the queue is a number */
assert.equal(a.verdict.say, 'Circuit F0297 has about 10,725 kW of room: 15,620 kW published, less 4,895 kW already queued. The 2.5 MW unit fits with 8,217 kW to spare.'); count++;
assert.equal(a.circuit.queueNetted, false); assert.equal(a.circuit.basis, null); assert.equal(a.circuit.band, null); count += 3;
/* a queue nobody published is unknown, never 0 */
var nq = GV.judge({ unit: XXL, circuit: { id: 'NJ0748', publishedKw: 5000, queuedKw: null, addressResolved: true } });
assert.equal(nq.circuit.queuedKw, null); assert.equal(nq.circuit.netKw, 5000); count += 2;
assert.match(nq.verdict.say, /^Circuit NJ0748 has about 5,000 kW of room: 5,000 kW published; no queue is published with this figure, so nothing was subtracted\. The 2\.5 MW unit fits/); count++;
assert.equal(GV.judge({ unit: XXL, circuit: { publishedKw: 5000, addressResolved: true } }).circuit.queuedKw, null, 'an absent queue is not invented either'); count++;
/* a figure already net of its queue is not netted twice */
var nn = GV.judge({ unit: XXL, circuit: { id: 'NEB8001', publishedKw: 4875, queuedKw: 125, queueNetted: true, addressResolved: true } });
assert.equal(nn.circuit.netKw, 4875); assert.equal(nn.circuit.queueNetted, true); count += 2;
assert.match(nn.verdict.say, /^Circuit NEB8001 has about 4,875 kW of room: 4,875 kW published, net of the queue as published \(125 kW queued\)\./); count++;
/* a band is judged at its low end, never the high */
var nb = GV.judge({ unit: XXL, circuit: { publishedKw: null, queuedKw: null, band: { minKw: 0, maxKw: 100, text: 'Less than 100 kW AC' }, addressResolved: true } });
assert.equal(nb.circuit.publishedKw, 0); assert.equal(nb.verdict.key, 'study'); assert.deepEqual(nb.circuit.band, { minKw: 0, maxKw: 100, text: 'Less than 100 kW AC' }); count += 3;
assert.match(nb.verdict.say, /published as a band of 0–100 kW, judged at its low end/); count++;
assert.match(GV.judge({ unit: { kw: 300 }, circuit: { band: { minKw: 7500, maxKw: null }, queuedKw: null, basis: 'load', addressResolved: true } }).verdict.say, /band of 7,500 kW or more/); count++;
/* a one-direction figure for a battery: judged, never read as storage */
var ng = GV.judge({ unit: XXL, circuit: { id: '05_14_31L1', publishedKw: 7000, queuedKw: 0, basis: 'gen', addressResolved: true } });
assert.equal(ng.verdict.key, 'fits'); assert.equal(ng.circuit.direction, 'gen-only'); count += 2;
assert.match(ng.verdict.say, /Published for generation \(export\) only; the charging side is not published for this circuit, so this is not a storage figure\.$/); count++;
assert.ok(GV.judge({ unit: XXL, circuit: { publishedKw: 7000, queuedKw: 0, basis: 'gen', mode: 'export', addressResolved: true } }).verdict.say.indexOf('not a storage figure') < 0, 'an export project is not told about the charging side'); count++;
/* the other side IS published but did not answer this time: said so, never "not published" */
var nm = GV.judge({ unit: XXL, circuit: { publishedKw: 7000, queuedKw: 0, basis: 'gen', sideUnanswered: true, addressResolved: true } });
assert.match(nm.verdict.say, /Only the generation \(export\) side answered for this circuit; the charging side did not this time, so this is not a storage figure yet\.$/); assert.equal(nm.circuit.direction, 'gen-only'); count += 2;
assert.ok(nm.verdict.say.indexOf('is not published') < 0, 'a side that did not answer is never called unpublished'); count++;
assert.match(GV.judge({ unit: XXL, circuit: { publishedKw: 7500, queuedKw: null, basis: 'load', addressResolved: true } }).verdict.say, /Published for load \(charging\) only; the export side is not published for this circuit/); count++;
assert.ok(GV.judge({ unit: XXL, circuit: { publishedKw: 7000, queuedKw: 0, basis: 'storage', addressResolved: true } }).verdict.say.indexOf('Published for') < 0, 'a storage figure carries no caveat'); count++;
assert.equal(GV.judge({ unit: XXL, circuit: { publishedKw: 7000, queuedKw: 0, basis: 'nonsense' } }).circuit.basis, null, 'basis is an allowlist'); count++;
assert.equal(GV.judge({ unit: XXL, circuit: { publishedKw: 700, source: 'x'.repeat(200) } }).circuit.source.length, 80, 'truncated like every field'); count++;

/* ── the door ───────────────────────────────────────────────────────── */
var ep = read('api/grid-verdict.js');
assert.match(ep, /req\.method !== 'POST'/); assert.match(ep, /A\.authenticate\(req\)/); assert.match(ep, /caller\.orgId \|\| caller\.staff/);
assert.match(ep, /withCaller\(caller, MODULES/); assert.match(ep, /\['gridatlas', 'siteintel', 'sitefinder', 'compute'\]/, 'the set /api/grid-atlas asks'); count += 5;
assert.match(read('api/grid-atlas.js'), /\['gridatlas', 'siteintel', 'sitefinder', 'compute'\]/); count++;
assert.match(read('api/hosting-capacity.js'), /\['gridatlas', 'siteintel', 'sitefinder', 'compute'\]/, 'the national door asks the same set'); count++;

/* ── the page holds no rule and no copy ─────────────────────────────── */
var panelSrc = read('omega-grid-panel.js'), clientSrc = read('omega-grid-verdict.js'), panel = panelSrc + clientSrc, ed = read('editor.html');
['SMALLEST_OFFER_KW', 'THIN_SHARE', '34.5', 'maxKm', 'minKv', '>= 250', 'Moderate run', 'right voltage'].forEach(function (t) {
  assert.ok(panel.indexOf(t) < 0, 'a verdict rule is in the browser: ' + t); count++; });
['SMALLEST_OFFER_KW', 'THIN_SHARE', 'grid-verdict-v1'].forEach(function (t) { assert.ok(ed.indexOf(t) < 0, 'a verdict rule is in the editor: ' + t); count++; });
assert.match(clientSrc, /fetch\('\/api\/grid-verdict'/); assert.match(clientSrc, /call\('POST', '\/api\/hosting-capacity', body\)/); count += 2;
assert.ok(panelSrc.indexOf('fetch(') < 0, 'the panel asks through the one client'); count++;
/* the panel asks the national door with the point, the unit and the
   substation, never the ComEd-only probe, and names no utility, upstream
   field or registry URL of its own: the answer names them */
assert.match(panelSrc, /G\.hosting\(\{ lat: s\.lat, lng: s\.lng, unit: u \? \{ kw: u\.kw, kwh: u\.kwh, name: u\.name \} : null,\s+substation: b \? \{ name: b\.name, kv: b\.kv, km: b\.km \} : null, mode: 'storage' \}\)/); count++;
assert.match(panelSrc, /G\.fromHosting\(res\)/, 'the record is the one client\'s shape'); count++;
['OmegaComEdLayers', 'probePoint', 'territoryAt', 'comed-proxy', 'ComEd', 'Feeder_Q', 'BESS_HC', 'PV_HC_kW', 'https://'].forEach(function (t) {
  assert.ok(panelSrc.indexOf(t) < 0, 'the panel names ' + t); count++; });
/* the editor loads the one client and the panel, and not the ComEd layer
   module any more (the Site Finder keeps it); nothing of it is pasted */
assert.match(ed, /<script src="\/omega-grid-verdict\.js"><\/script>\s*<script src="\/omega-grid-panel\.js"><\/script>/); count++;
assert.ok(ed.indexOf('omega-comed-layers.js') < 0, 'the editor no longer loads the ComEd-only module'); count++;
assert.ok(ed.indexOf('function interpret(') < 0 && ed.indexOf('BESS_HC') < 0, 'no pasted ComEd layer code in the editor'); count++;
assert.match(read('api/_lib/modules.js'), /gridatlas: 'rb-gridatlas rb-grid-panel'/, 'the button is Omega Grid\'s'); count++;
/* saved through the allowlist (savedBy rides the same payload), restored on load */
var save = ed.slice(ed.indexOf('async function saveProject(){'), ed.indexOf('_stripUndefinedInPlace(payload);'));
assert.match(save, /grid:\s+\(S\.grid && typeof S\.grid==='object'\)/); assert.match(save, /savedBy: \{ email:/); count += 2;
assert.match(ed, /S\.grid\s+= \(d\.grid\s+&& typeof d\.grid==='object'\)\s+\? d\.grid\s+: null;/); count++;
assert.match(ed, /\['substation', 'circuit', 'verdict'\]\.forEach\(function \(k\) \{ if \(S\.grid\[k\] !== undefined\) keep\[k\] = S\.grid\[k\]; \}\);/, 'the pre-screen keeps the panel\'s answer for the same point'); count++;
/* every coverage case the door can answer has words, and they are Omega
   Prime's (held in the one client; Prime keeps its own copy for now) */
var CASES = [], cm, coverRe = /coverage = '([a-z-]+)'/g, door = read('api/hosting-capacity.js');
while ((cm = coverRe.exec(door))) if (CASES.indexOf(cm[1]) < 0) CASES.push(cm[1]);
assert.deepEqual(CASES.slice().sort(), ['account-required', 'no-public-map', 'none-here', 'not-wired', 'outside', 'read', 'unreachable'], 'the door\'s coverage cases'); count++;
var primeSrc = read('omega-prime.html'), primeCover = /var COVER = (\{[\s\S]*?\});/.exec(primeSrc);
assert.ok(primeCover || /GV\.COVERAGE/.test(primeSrc), 'Omega Prime names its coverage words, or reads the client\'s'); count++;
/* who may serve the point: ONE list in the one client, drawn by all three
   pages, none of which carries a word of it (2026-10-20) */
var layerSrc = read('omega-editor-v2-grid.js');
assert.match(clientSrc, /function whoServes\(res\)/); assert.match(clientSrc, /whoServes: whoServes/); count += 2;
assert.match(primeSrc, /GV\.whoServes\(res\)/, 'Omega Prime draws the one list'); assert.match(panelSrc, /G\.whoServes\(res\)/, 'the panel draws the one list');
assert.match(layerSrc, /GV\.whoServes\(res\)/, 'Site Plan draws the one list'); count += 3;
['Who serves this point', 'More than one utility is mapped', 'the one read here', 'Confirm the utility with the customer', 'Also on the territory maps', 'a weak match', 'Instead: '].forEach(function (t) {
  [['omega-prime.html', primeSrc], ['omega-grid-panel.js', panelSrc], ['omega-editor-v2-grid.js', layerSrc]].forEach(function (f) {
    assert.ok(f[1].indexOf(t) < 0, f[0] + ' carries its own copy of the list\'s words: ' + t); count++;
  });
});
/* Prime's own candidatesBlock, cut out of the page with its esc and
   safeHref: what the panel's list is held to, word for word */
function cut(src, name) {
  var i = src.indexOf('function ' + name + '('), j = src.indexOf('{', i), d = 0, k;
  assert.ok(i >= 0, 'omega-prime.html has ' + name);
  for (k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}' && !--d) break; }
  return src.slice(i, k + 1);
}
var PRIME_LIST = cut(primeSrc, 'esc') + '\n' + cut(primeSrc, 'safeHref') + '\n' + cut(primeSrc, 'candidatesBlock');

/* ── the whole path in a VM ─────────────────────────────────────────── */
/* The real panel asks the real client, and the client's fetch runs the REAL
   national door (api/hosting-capacity.js run()) on a fake network, as
   thostingsources.js and render-omega-prime.js run it: only the territory
   layers and the utility's own map are faked. firebase-admin is intercepted
   at load, as tclientadmin.js and thostingsources.js do: CI runs this with
   no npm install (tests.yml) and api/_lib/admin.js requires it at load. The
   door never reaches Firestore here (db is null); the stand-in only lets the
   modules load, the same in CI as on a laptop with node_modules. */
var H = (function () {
  var Module = require('module'), load = Module._load;
  function noFirebase() { throw new Error('firebase-admin is a stand-in in this test'); }
  var FAKE_ADMIN = { apps: [], initializeApp: noFirebase, credential: { cert: noFirebase }, firestore: noFirebase, auth: noFirebase };
  Module._load = function (request) { return request === 'firebase-admin' ? FAKE_ADMIN : load.apply(this, arguments); };
  try { return require(path.join(ROOT, 'api/hosting-capacity'))._helpers; } finally { Module._load = load; }
})();
var HS = require(path.join(ROOT, 'api/_lib/hosting-sources')), CS = require(path.join(ROOT, 'api/_lib/comed-service'));
function Esri(rows) { return { features: rows.map(function (r) { return { attributes: { NAME: r[1], Utility_ID: r[0], TYPE: r[2], STATE: r[3] || '', HOLDING_CO: r[1], Total_Customer_Count_2024: r[4] || null, Shape__Area: r[5] || null } }; }) }; }
function Places(names) { return { features: names.map(function (n) { return { attributes: { NAME: n + ' city', BASENAME: n } }; }) }; }
var asked = [];
function network(routes) {
  return function (url) {
    asked.push(url);
    for (var i = 0; i < routes.length; i++) if (routes[i][0].test(url)) {
      if (routes[i][1] instanceof Error) return Promise.reject(routes[i][1]);
      return Promise.resolve(JSON.parse(JSON.stringify(routes[i][1])));
    }
    return Promise.resolve({ features: [] });
  };
}
/* the City of Mesa's own electric service area (2026-10-20): a polygon
   1.5 km around downtown, as the city's map answers at 29 W Main St */
var MESA_AREA = /GCX_ExploreMesa\/MapServer\/13\/query/;
function square(lat, lng, m) { var a = m / 111320, b = m / (111320 * Math.cos(lat * Math.PI / 180)); return { rings: [[[lng - b, lat - a], [lng + b, lat - a], [lng + b, lat + a], [lng - b, lat + a], [lng - b, lat - a]]] }; }
var COMED_AT = new RegExp('^' + CS.SERVICE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/' + CS.ATTRIB_LAYER + '/query\\?');
var FEATURE = { attributes: { Feeder: 'F0297', SS_N: 'Crawford TSS 21', BESS_HC: 15620, PV_HC_kW: 15620, EV_HC_kW: 16100, Feeder_Q: 4895, Queue_RD: '09/30/2026' } };
var CHICAGO = { lat: 41.81522, lng: -87.62261, address: '3400 S Federal St, Chicago, IL',
  sub: { name: 'Crawford', voltageKv: 138, distanceKm: 1.2, owner: 'ComEd' },
  net: network([[/Electricity_Rates_H3_Res5/, Esri([['4110', 'COMMONWEALTH EDISON CO', 'INVESTOR OWNED', 'IL', 4130749, 6.1e10]])],
    [/tigerweb/, Places(['Chicago'])], [COMED_AT, { features: [FEATURE] }]]) };
/* downtown Mesa (Tommy's 29 W Main St; 2026-10-17, then 2026-10-20): the
   national layer names the City of Mesa, Salt River Project and Arizona
   Public Service; the city's own electric service area map puts the point
   well inside the city's area, so the City of Mesa serves it, and none of
   them publishes hosting capacity. MESA_DOWN: the city's map did not answer,
   so every utility on the national map is named and the bill decides. */
var MESA_ROWS = [['12351', 'CITY OF MESA - (AZ)', 'MUNICIPAL', 'AZ', 18101, 4.3e9], ['16572', 'SALT RIVER PROJECT', 'POLITICAL SUBDIVISION', 'AZ', 1166094, 3e10],
  ['803', 'ARIZONA PUBLIC SERVICE CO', 'INVESTOR OWNED', 'AZ', 1400037, 1.3e11]];
var MESA = { lat: 33.4152, lng: -111.8329, address: '29 W Main St, Mesa, AZ 85201',
  sub: { name: 'Mesa Downtown', voltageKv: 69, distanceKm: 0.62, owner: 'Salt River Project' },
  net: network([[/Electricity_Rates_H3_Res5/, Esri(MESA_ROWS)], [/tigerweb/, Places(['Mesa'])],
    [MESA_AREA, { features: [{ attributes: { FACILITYID: 'ELSA2' }, geometry: square(33.4152, -111.8329, 1500) }] }]]) };
var MESA_DOWN = { lat: MESA.lat, lng: MESA.lng, address: MESA.address, sub: MESA.sub,
  net: network([[/Electricity_Rates_H3_Res5/, Esri(MESA_ROWS)], [/tigerweb/, Places(['Mesa'])], [MESA_AREA, new Error('the city\'s map is down')]]) };

var HERE = CHICAGO, DOOR = { canned: null, fail: null }, fetched = [], posted = [];
var S = { bessList: [{ mfr: 'FENECON', model: 'Industrial XXL', kw: '2508', kwh: '5015', qty: '1' }] };
function el() { return { style: {}, setAttribute: function () {}, addEventListener: function () {}, querySelector: function () { return null; }, remove: function () {}, innerHTML: '' }; }
var panelEl = null;
var ctx = {
  S: S, console: { info: function () {} }, setTimeout: setTimeout, setInterval: function () { return 0; }, clearInterval: function () {},
  Promise: Promise, JSON: JSON, Math: Math, isFinite: isFinite,
  document: { readyState: 'complete', body: { appendChild: function (e) { panelEl = e; } },
    getElementById: function (id) { return id === 'omega-grid-panel' ? panelEl : null; }, createElement: function () { return el(); } },
  OmegaGridPrescreen: {
    site: function () { return { lat: HERE.lat, lng: HERE.lng, address: HERE.address }; },
    run: function (cb) { cb({ lat: HERE.lat, lng: HERE.lng, substations: [HERE.sub] }); },
    /* as editor.html's: a re-measure of the SAME point keeps the panel's answer */
    saveToProject: function (g) {
      var keep = {}, o = S.grid;
      if (o && Math.abs(o.lat - g.lat) < 1e-5 && Math.abs(o.lng - g.lng) < 1e-5) ['substation', 'circuit', 'verdict'].forEach(function (k) { if (o[k] !== undefined) keep[k] = o[k]; });
      S.grid = { lat: g.lat, lng: g.lng, substations: g.substations, source: 'grid-atlas-service' };
      Object.keys(keep).forEach(function (k) { S.grid[k] = keep[k]; });
    },
    feedSiteScore: function () {}
  },
  firebase: { auth: function () { return { currentUser: { getIdToken: function () { return Promise.resolve('tok'); } } }; } },
  fetch: function (url, opts) {
    fetched.push({ url: url, method: opts.method, auth: opts.headers.Authorization });
    var b = JSON.parse(opts.body); posted.push(b);
    if (DOOR.fail) { var f = DOOR.fail; DOOR.fail = null; return Promise.resolve({ ok: false, status: f.status, json: function () { return Promise.resolve(f.body); } }); }
    var answer = DOOR.canned ? Promise.resolve(DOOR.canned)
      : H.run({ lat: b.lat, lng: b.lng, unit: b.unit, substation: b.substation, mode: b.mode },
              { fetchJson: HERE.net, db: function () { return null; }, now: function () { return 1790000000000; }, log: function () {} });
    return answer.then(function (r) { var j = JSON.parse(JSON.stringify(r)); return { ok: true, status: 200, json: function () { return Promise.resolve(j); } }; });
  },
  saveProject: function () { return Promise.resolve(); },
  _setSaved: function () {}
};
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(read('omega-grid-verdict.js'), ctx, { filename: 'omega-grid-verdict.js' });
vm.runInContext(read('omega-grid-panel.js'), ctx, { filename: 'omega-grid-panel.js' });
var P = ctx.OmegaGridPanel, ST = P._t.ST, COVER = JSON.parse(JSON.stringify(ctx.OmegaGridVerdict.COVERAGE));
if (primeCover) { assert.deepEqual(COVER, JSON.parse(JSON.stringify(vm.runInNewContext('(' + primeCover[1] + ')'))), 'the panel and Omega Prime word every case the same'); count++; }
CASES.forEach(function (k) { assert.ok(COVER[k], 'words for ' + k); count++; });

function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function plain(o) { return JSON.parse(JSON.stringify(o)); }
/* Prime's list, run on the same client as the panel */
var primeCtx = { GV: ctx.OmegaGridVerdict };
vm.createContext(primeCtx);
vm.runInContext(PRIME_LIST, primeCtx, { filename: 'omega-prime.html' });
function primeList(res) { return primeCtx.candidatesBlock(JSON.parse(JSON.stringify(res))); }
/* an element of the panel's HTML, from the tag that opens it to the one
   that closes it; what a list says (its text, tags dropped) and its links */
function block(html, open) {
  var i = html.indexOf(open);
  if (i < 0) return '';
  var tag = /^<(\w+)/.exec(open)[1], re = new RegExp('<(/?)' + tag + '\\b', 'g'), d = 0, m;
  re.lastIndex = i;
  while ((m = re.exec(html))) { d += m[1] ? -1 : 1; if (!d) return html.slice(i, html.indexOf('>', m.index) + 1); }
  return '';
}
function words(html) { return String(html).replace(/<[^>]*>/g, '').replace(/&#39;/g, '\'').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'); }
function hrefs(html) { var out = [], re = /<a href="([^"]*)"/g, m; while ((m = re.exec(html))) out.push(m[1]); return out; }
/* the panel's list against Prime's for the same answer */
function samePrime(h, res, what) {
  var mine = block(h, '<div data-gp="who"'), theirs = primeList(res);
  assert.equal(words(mine), words(theirs), what + ': the list in Omega Prime\'s words and order'); count++;
  assert.deepEqual(hrefs(mine), hrefs(theirs), what + ': the same links, in the same order'); count++;
  return mine;
}

/* ── the one list by itself: drawn as the door sends it, nothing judged ── */
var WS = ctx.OmegaGridVerdict.whoServes, APS_E = HS.byKey('aps'), SRP_E = HS.byKey('srp');
function cand(key, o) {
  var e = HS.byKey(key), c = { eiaId: e.eiaIds[0], name: e.display.toUpperCase(), display: e.display, weak: false, hosting: HS.publication(e) };
  Object.keys(o || {}).forEach(function (k) { c[k] = o[k]; });
  return c;
}
function ans(o, t) {
  var r = { coverage: 'read', note: 'The note.', utility: { key: 'aps', display: 'Arizona Public Service', eiaId: '803' }, verify: { viewerUrl: APS_E.viewerUrl } };
  Object.keys(o || {}).forEach(function (k) { r[k] = o[k]; });
  r.territory = t;
  return r;
}
assert.equal(WS(ans({}, { confident: true, candidates: [cand('aps')] })), null, 'a figure read for the one utility: no list'); count++;
assert.equal(WS(ans({}, { confident: false, candidates: [cand('aps')] })), null, 'a figure read, one utility on the maps: no list'); count++;
assert.equal(WS(ans({ coverage: 'outside' }, { confident: false, candidates: [] })), null); assert.equal(WS(ans({}, null)), null); assert.equal(WS(null), null); count += 3;
var two = plain(WS(ans({}, { confident: false, candidates: [cand('aps'), cand('srp')] })));
assert.equal(two.head, 'More than one utility is mapped at this point.'); assert.equal(two.confirm, 'Confirm the utility with the customer’s bill.'); count += 2;
assert.deepEqual(two.items.map(function (x) { return x.name + x.mark; }), ['Arizona Public Service — the one read here', 'Salt River Project'], 'a figure read but more than one utility mapped: all listed, the read one marked'); count++;
assert.equal(two.items[0].says, 'Publishes no hosting capacity.', 'the read utility\'s route is the note\'s'); count++;
assert.equal(two.items[1].says, 'Publishes no hosting capacity. Instead: ' + SRP_E.route + '.', 'another utility\'s route is said'); count++;
assert.deepEqual(two.items[0].links.map(function (l) { return l.url; }), [APS_E.check.url], 'the read utility\'s page is the Check it on link'); count++;
assert.deepEqual(two.items[1].links.map(function (l) { return l.url; }), [SRP_E.viewerUrl, SRP_E.check.url]); count++;
var lone = plain(WS(ans({ coverage: 'no-public-map', note: '' }, { confident: true, candidates: [cand('aps')] })));
assert.equal(lone.head, 'Who serves this point'); assert.equal(lone.items[0].mark, '', 'one utility: no mark'); assert.equal(lone.confirm, ''); count += 3;
assert.equal(lone.items[0].says, 'Publishes no hosting capacity. Instead: ' + APS_E.route + '.', 'no note, so the route is said in the list'); count++;
var weakOnly = plain(WS(ans({ coverage: 'no-public-map' }, { confident: false, candidates: [cand('srp', { weak: true, why: 'a county-sized stand-in polygon' })] })));
assert.equal(weakOnly.items.length, 1); assert.equal(weakOnly.items[0].name, 'Salt River Project'); assert.equal(weakOnly.fold, null, 'nothing else mapped: the weak one is listed, not folded'); count += 3;
var folded = plain(WS(ans({ coverage: 'no-public-map' }, { confident: true, candidates: [cand('aps'), cand('srp', { weak: true, why: '' })] })));
assert.deepEqual(folded.fold, { title: 'Also on the territory maps, not this point (1)', items: [{ name: 'Salt River Project', why: 'a weak match' }] }, 'a weak one beside a strong one folds, with a reason'); count++;
var hostile = plain(WS(ans({ coverage: 'no-public-map' }, { confident: true, candidates: [{ eiaId: '1', display: 'X', hosting: { says: 'publishes x', link: { url: 'javascript:alert(1)', label: 'a' }, check: { url: 'http://plain.example/map', label: 'b' } } }] })));
assert.deepEqual(hostile.items[0].links, [], 'https only'); assert.equal(hostile.items[0].says, 'Publishes x.'); count += 2;
function wait(cond, n) { return new Promise(function (res, rej) { (function tick(i) { if (cond()) return res(); if (i > (n || 400)) return rej(new Error('timed out')); setTimeout(function () { tick(i + 1); }, 5); })(0); }); }
function idle() { return wait(function () { return !ST.busy; }); }
var XXL_BODY = { kw: 2508, kwh: 5015, name: 'FENECON Industrial XXL' };
var COMED_SAY = 'Circuit F0297 has about 10,725 kW of room: 15,620 kW published, less 4,895 kW already queued. The 2.5 MW unit fits with 8,217 kW to spare.';
/* What the door answers for a reading whose utility fields the fake
   network does not carry: the door's own shape, the REAL engine's verdict,
   the REAL registry's notes and links. */
function judged(circuit) { return GV.judge({ unit: XXL, substation: { name: HERE.sub.name, kv: HERE.sub.voltageKv, km: HERE.sub.distanceKm }, circuit: circuit }); }
var EF = 'Eastfield Electric';
function readAnswer(c) {
  var body = { utility: EF, id: 'EF-12', substation: 'Eastfield North', publishedKw: c.publishedKw, queuedKw: c.queuedKw, queueNetted: !!c.queueNetted,
               basis: c.basis || 'storage', band: c.band || null, addressResolved: true, grain: 'the nearest line section', source: EF + '\'s published hosting capacity', mode: 'storage' };
  return { version: H.VERSION, point: { lat: HERE.lat, lng: HERE.lng }, mode: 'storage', coverage: 'read',
    territory: { candidates: [{ eiaId: '99001', name: 'EASTFIELD ELECTRIC CO', display: EF, weak: false }], confident: true, caution: null, source: 'a test territory layer' },
    utility: { key: 'eastfield', display: EF, eiaId: '99001' },
    source: { key: 'eastfield', label: EF + '\'s published hosting capacity', grain: 'line-section', addressResolved: true, distanceM: 14, refreshed: '2026-10-01', units: 'kW', layer: 'EF_Hosting layer 0' },
    circuits: [{ id: 'EF-12', name: '', substation: 'Eastfield North', kv: 13.2, basis: body.basis, publishedKw: body.publishedKw, queuedKw: body.queuedKw, queueNetted: body.queueNetted, band: body.band,
                 upstream: { transformerKw: null, bankKw: 9800, substationKw: null, pnode: null, feederQueuedKw: null }, distanceM: 14, refreshed: '2026-10-01', notes: [] }],
    best: 0, body: body, verdict: judged(body),
    note: H.noteFor('read', null, { display: EF }, { source: { grainWords: 'the nearest line section', distanceM: 14 }, basis: body.basis, mode: 'storage' }),
    verify: { viewerUrl: 'https://maps.eastfield.example/hosting', label: EF + '\'s hosting map' }, tried: [{ source: 'eastfield', ms: 140, outcome: 'features 1' }] };
}
function coverAnswer(coverage, key, display, ctx2) {
  var e = key ? HS.byKey(key) : null, util = display ? { key: key, display: display, eiaId: e ? e.eiaIds[0] : null } : null;
  return { version: H.VERSION, point: { lat: HERE.lat, lng: HERE.lng }, mode: 'storage', coverage: coverage,
    territory: { candidates: util ? [{ eiaId: util.eiaId, display: display, weak: false, hosting: HS.publication(e) }] : [], confident: !!util, caution: null, source: util ? 'a test territory layer' : null },
    utility: util, source: null, circuits: [], best: null, body: null, verdict: judged(null),
    note: H.noteFor(coverage, e, util, ctx2 || {}),
    verify: e && e.viewerUrl ? { viewerUrl: e.viewerUrl, label: e.viewerLabel || display + '\'s map' } : (coverage === 'not-wired' && !e ? { viewerUrl: HS.DOE_ATLAS, label: 'the DOE atlas of utility hosting capacity maps' } : null),
    tried: [] };
}
function ask(canned) { DOOR.canned = canned; P.run(true); return idle().then(function () { DOOR.canned = null; return panelEl.innerHTML; }); }

P.open();
idle().then(function () {
  /* ── ComEd, through the door: the same sentence the ComEd probe gave ── */
  assert.deepEqual(fetched, [{ url: '/api/hosting-capacity', method: 'POST', auth: 'Bearer tok' }], 'one question, to the national door'); count++;
  assert.equal(ctx.OmegaComEdLayers, undefined, 'the ComEd-only probe is not on the page'); count++;
  assert.deepEqual(posted[0], { lat: 41.81522, lng: -87.62261, unit: XXL_BODY, substation: { name: 'Crawford', kv: 138, km: 1.2 }, mode: 'storage' },
    'the site point, the Guided Build\'s unit (nothing typed) and the nearest substation'); count++;
  assert.equal(asked.filter(function (u) { return COMED_AT.test(u); }).length, 1, 'ComEd\'s map is read by the door, server-side'); count++;
  var r = P.hosting();
  assert.equal(r.coverage, 'read'); assert.equal(r.utility.display, 'ComEd'); assert.equal(r.territory.confident, true); count += 3;
  var g = S.grid;
  assert.deepEqual(Object.keys(g.substation).sort(), ['chip', 'km', 'kv', 'miles', 'name', 'source', 'state']); assert.equal(g.substation.miles, 0.75); count += 2;
  assert.deepEqual(Object.keys(g.circuit).sort(), ['addressResolved', 'at', 'band', 'basis', 'coverage', 'eiaId', 'grain', 'headroomKw', 'id', 'ledgerId', 'netKw',
    'publishedKw', 'queueNetted', 'queuedKw', 'source', 'substation', 'utility', 'utilityKey'], 'GV.fromHosting\'s record, the one Prime writes'); count++;
  assert.equal(g.circuit.utility, 'ComEd'); assert.equal(g.circuit.id, 'F0297'); assert.equal(g.circuit.substation, 'Crawford TSS 21'); count += 3;
  assert.equal(g.circuit.netKw, 10725); assert.equal(g.circuit.publishedKw, 15620); assert.equal(g.circuit.queuedKw, 4895); assert.equal(g.circuit.headroomKw, 8217); count += 4;
  assert.equal(g.circuit.queueNetted, false); assert.equal(g.circuit.basis, 'storage'); assert.equal(g.circuit.addressResolved, true); count += 3;
  assert.equal(g.circuit.utilityKey, 'comed'); assert.equal(g.circuit.eiaId, '4110'); assert.equal(g.circuit.coverage, 'read'); assert.ok(g.circuit.at); count += 4;
  assert.match(g.circuit.source, /^ComEd's published hosting capacity · ComEd_BESS_Hosting_Capacity_[A-Z]{3}20\d\d layer 75 · refreshed 2026-09-30$/, 'the source named from the answer'); count++;
  assert.deepEqual(Object.keys(g.verdict).sort(), ['at', 'key', 'label', 'say', 'unitKw', 'unitName', 'version']); count++;
  assert.equal(g.verdict.key, 'fits'); assert.equal(g.verdict.unitKw, 2508); assert.equal(g.verdict.say, COMED_SAY, 'the ComEd sentence, byte for byte, through the door'); count += 3;
  assert.equal(g.substations.length, 1, 'the service\'s measurement stays beside it'); count++;
  var h = panelEl.innerHTML;
  assert.match(h, /10,725 kW/); assert.match(h, /room left after the queue \(net\)/); count += 2;
  assert.ok(h.indexOf('10,725 kW') < h.indexOf('15,620 kW'), 'the net is read before the headline'); count++;
  assert.match(h, /the utility’s headline, gross of the queue/); assert.match(h, /− 4,895 kW/); assert.match(h, /subtracted here; the utility does not/); count += 3;
  assert.ok(h.indexOf(esc(COMED_SAY)) > 0, 'the panel says the sentence'); count++;
  assert.match(h, />Serving utility</); assert.match(h, /font-weight:700">ComEd<\/div><div style="font-size:11px;color:var\(--sub,#64748B\)">hosting capacity</); count += 2;
  assert.match(h, /font-weight:700">ComEd circuit F0297</); assert.match(h, /out of Crawford TSS 21/); count += 2;
  assert.ok(h.indexOf('href="' + esc(CS.REFERER) + '"') > 0 && /Check it on ComEd&#39;s hosting capacity map ↗/.test(h), 'ComEd\'s own map to verify'); count++;
  assert.match(h, /Where the power comes from/); count++;
  assert.match(h, /Source: ComEd&#39;s published hosting capacity · ComEd_BESS_Hosting_Capacity_[A-Z]{3}20\d\d layer 75 · refreshed 2026-09-30\./); count++;
  assert.match(h, /Grain: the utility&#39;s circuit at the address, resolved at the parcel\./); count++;
  assert.match(h, /Queue: the DER already queued on the feeder is subtracted here; the utility publishes its figure gross of it\./); count++;
  assert.match(h, /Verdict: OMEGA grid verdict \(grid-verdict-v1\)\./); assert.match(h, /comed · 0 ms · features 1/, 'the door\'s request log'); count += 2;
  assert.ok(h.indexOf('More than one utility') < 0, 'one utility, answered with confidence'); count++;
  assert.ok(h.indexOf('data-gp="who"') < 0 && primeList(r) === '', 'a figure read for the one utility mapped: no list, here or in Prime'); count++;
  assert.ok(!/Feeder_Q|BESS_HC|usrsvcs/.test(h), 'no upstream field or URL reaches the page'); count++;

  /* ── Mesa, Arizona: the utility named, never one utility's words ── */
  HERE = MESA; var mark = asked.length;
  P.run(true);
  return idle().then(function () {
    var p = posted[posted.length - 1];
    assert.deepEqual(p, { lat: 33.4152, lng: -111.8329, unit: XXL_BODY, substation: { name: 'Mesa Downtown', kv: 69, km: 0.62 }, mode: 'storage' }, 'Mesa: one question at the point'); count++;
    assert.ok(!asked.slice(mark).some(function (u) { return COMED_AT.test(u); }), 'ComEd is never asked in Arizona'); count++;
    var m = P.hosting();
    assert.equal(m.utility.display, 'City of Mesa'); assert.equal(m.coverage, 'no-public-map'); assert.equal(m.territory.confident, true, 'the city\'s own map settles downtown Mesa'); count += 3;
    var h2 = panelEl.innerHTML;
    assert.match(h2, /font-weight:700">City of Mesa<\/div><div style="font-size:11px;color:var\(--sub,#64748B\)">publishes no hosting capacity</, 'the city\'s own utility, and what it publishes'); count++;
    assert.ok(h2.indexOf('More than one utility') < 0 && h2.indexOf('islands') < 0, 'one utility, answered with confidence: no SRP caution'); count++;
    assert.match(h2, /City of Mesa publishes no hosting capacity/, 'the server\'s note, in its words'); count++;
    assert.match(h2, /Needs a study/); assert.match(h2, /Mesa Downtown/); assert.match(h2, /29 W Main St, Mesa, AZ 85201/); count += 3;
    assert.ok(h2.indexOf('data-gp="verify" href="' + esc(HS.byKey('mesa').viewerUrl) + '"') >= 0, 'the link is the city\'s own page, never a hosting map that does not exist'); count++;
    assert.ok(!/comed|feeder_q/i.test(h2), 'no ComEd word anywhere in Arizona'); count++;
    assert.equal(S.grid.lat, 33.4152); assert.equal(S.grid.circuit, null, 'no circuit, none recorded'); assert.equal(S.grid.verdict.key, 'study'); count += 3;
    assert.equal(S.grid.substation.name, 'Mesa Downtown'); count++;
    /* who serves the point: the City of Mesa by its own map, what it
       publishes and the city's own service-area map to check; Salt River
       Project and APS are on the national map but not this point, folded
       away with the reason */
    var MESA_E = HS.byKey('mesa'), INSIDE = 'the point is inside the City of Mesa&#39;s own electric service area (the city&#39;s map)';
    var w2 = samePrime(h2, m, 'Mesa');
    assert.ok(w2.indexOf('<b>Who serves this point</b><ul') > 0, 'one utility serves it'); count++;
    assert.match(w2, /<ul[^>]*><li[^>]*><b>City of Mesa<\/b><div[^>]*>inside its own electric service area \(the city&#39;s map\)<\/div><div>Publishes no hosting capacity\.<\/div><div><a href="[^"]+" target="_blank" rel="noopener"[^>]*>the City of Mesa&#39;s electric service area <span style="white-space:nowrap">map ↗<\/span><\/a><\/div><\/li><\/ul>/,
      'the City of Mesa, why, what it publishes, and the city\'s map'); count++;
    assert.deepEqual(hrefs(w2), [MESA_E.check.url], 'the city\'s service-area map; the city\'s page is the Check it on link, never twice'); count++;
    assert.ok(w2.indexOf('Instead:') < 0, 'the read utility\'s route is the note\'s, never said twice'); count++;
    assert.ok(w2.indexOf('<details data-gp="who-fold" ') > 0 && !/<details[^>]*\sopen/.test(w2), 'the rest folded until opened'); count++;
    assert.ok(w2.indexOf('<summary style="cursor:pointer">Also on the territory maps, not this point (2)</summary>') > 0, 'how many are folded'); count++;
    assert.ok(w2.indexOf('<li>Salt River Project (' + INSIDE + ')</li><li>Arizona Public Service (' + INSIDE + ')</li>') > 0, 'Salt River Project, then APS, each with the reason'); count++;
    /* the city's map down: every utility on the national map named, the bill decides */
    HERE = MESA_DOWN; P.run(true);
    return idle();
  }).then(function () {
    var m = P.hosting(), h3 = panelEl.innerHTML, MESA_E = HS.byKey('mesa');
    assert.equal(m.utility.display, 'City of Mesa'); assert.equal(m.territory.confident, false); count += 2;
    /* every utility on the national map, each with what it publishes, the
       route it offers instead and its own pages; the bill decides */
    var w3 = samePrime(h3, m, 'Mesa, the city\'s map down');
    assert.ok(w3.indexOf('<b>More than one utility is mapped at this point.</b><ul') > 0); count++;
    assert.match(w3, /<li[^>]*><b>City of Mesa<\/b> — the one read here<div[^>]*>the city&#39;s own utility; it serves part of the city, so confirm with the bill<\/div><div>Publishes no hosting capacity\.<\/div>/,
      'the city first, the one read here, and why'); count++;
    assert.ok(w3.indexOf('<li style="margin:3px 0"><b>Salt River Project</b><div>Publishes no hosting capacity. Instead: ' + esc(SRP_E.route) + '.</div>') > 0, 'SRP: what it publishes, and its route'); count++;
    assert.ok(w3.indexOf('<li style="margin:3px 0"><b>Arizona Public Service</b><div>Publishes no hosting capacity. Instead: ' + esc(APS_E.route) + '.</div>') > 0, 'APS: what it publishes, and its route'); count++;
    assert.ok(w3.indexOf('City of Mesa') < w3.indexOf('Salt River Project') && w3.indexOf('Salt River Project') < w3.indexOf('Arizona Public Service'), 'in the territory\'s order'); count++;
    assert.deepEqual(hrefs(w3), [MESA_E.check.url, SRP_E.viewerUrl, SRP_E.check.url, APS_E.viewerUrl, APS_E.check.url], 'each utility\'s own pages; the city\'s page once, as the Check it on link'); count++;
    assert.ok(/<\/ul>Confirm the utility with the customer’s bill\.<\/div>$/.test(w3) && w3.indexOf('<details') < 0, 'the bill decides; nothing folded'); count++;
    assert.match(h3, /encloses Arizona Public Service and City of Mesa islands/, 'the server\'s caution, in its words'); count++;
    assert.match(h3, /The City of Mesa’s own service-area map did not answer|The City of Mesa&#39;s own service-area map did not answer/, 'the city\'s map down, said'); count++;
  });
}).then(function () {
  /* ── the queue and side words follow the answer ── */
  return ask(readAnswer({ publishedKw: 5000, queuedKw: null })).then(function (h) {
    assert.match(h, /room as published \(no queue is published with it\)/); assert.match(h, />not published<br>/); assert.match(h, /nothing subtracted/); count += 3;
    assert.ok(h.indexOf('subtracted here') < 0 && h.indexOf('− 0 kW') < 0 && h.indexOf('room left after the queue') < 0, 'an unpublished queue is never 0 and never subtracted'); count++;
    assert.match(h, /Queue: none is published with this figure, so nothing was subtracted\./); count++;
    assert.equal(S.grid.circuit.queuedKw, null); assert.equal(S.grid.circuit.netKw, 5000); count += 2;
    assert.match(S.grid.verdict.say, /no queue is published with this figure, so nothing was subtracted/); count++;
    assert.match(h, /font-weight:700">Eastfield Electric<\/div>/); assert.match(h, /Check it on Eastfield Electric&#39;s hosting map ↗/); assert.match(h, /Upstream bank/); count += 3;
    return ask(readAnswer({ publishedKw: 4875, queuedKw: 125, queueNetted: true }));
  }).then(function (h) {
    assert.match(h, /room left, net of the queue as published/); assert.match(h, /the utility’s figure, already net of its queue/); count += 2;
    assert.match(h, />125 kW<br>/); assert.match(h, /already in the published figure; not subtracted again/); count += 2;
    assert.ok(h.indexOf('− 125 kW') < 0 && h.indexOf('subtracted here') < 0, 'a netted queue is never subtracted twice'); count++;
    assert.equal(S.grid.circuit.netKw, 4875); assert.equal(S.grid.circuit.queueNetted, true); count += 2;
    return ask(readAnswer({ publishedKw: 7000, queuedKw: 0, basis: 'gen' }));
  }).then(function (h) {
    assert.match(h, /Published hosting \(generation only\)/); assert.match(h, /the export side only; not a storage figure/); count += 2;
    assert.match(S.grid.verdict.say, /Published for generation \(export\) only; the charging side is not published for this circuit, so this is not a storage figure\.$/); count++;
    assert.equal(S.grid.circuit.basis, 'gen'); count++;
    return ask(readAnswer({ publishedKw: null, queuedKw: null, basis: 'load', band: { minKw: 7500, maxKw: null, text: '7.5 MW or more' } }));
  }).then(function (h) {
    assert.match(h, /Published hosting \(load only\)/); assert.match(h, />7\.5 MW or more<br>/); assert.match(h, /a published band, judged at its low end/); count += 3;
    assert.equal(S.grid.circuit.publishedKw, 7500); assert.deepEqual(plain(S.grid.circuit.band), { minKw: 7500, maxKw: null, text: '7.5 MW or more' }); count += 2;
  });
}).then(function () {
  /* ── every coverage case, in the server's words and Prime's ── */
  var cases = [
    coverAnswer('none-here', 'ri-energy', 'Rhode Island Energy', { radiusM: 400 }),
    coverAnswer('account-required', 'georgia-power', 'Georgia Power'),
    coverAnswer('not-wired', null, 'Delaware Electric Cooperative'),
    coverAnswer('unreachable', 'pge', 'PG&E', { why: 'it timed out' }),
    coverAnswer('outside', null, null)
  ];
  return cases.reduce(function (p, a) {
    return p.then(function () { return ask(a); }).then(function (h) {
      var name = a.utility ? a.utility.display : 'No utility on record';
      assert.ok(h.indexOf('font-weight:700">' + esc(name) + '</div>') > 0, a.coverage + ': the utility named'); count++;
      if (a.coverage !== 'outside') { assert.ok(h.indexOf('>' + esc(COVER[a.coverage]) + '<') > 0, a.coverage + ': Prime\'s words'); count++; }
      else { assert.ok(h.indexOf('>' + COVER.outside + '<') < 0, 'outside: the name is not said twice'); count++; }
      assert.ok(h.indexOf(esc(a.note)) > 0, a.coverage + ': the server\'s sentence'); count++;
      if (a.verify) { assert.ok(h.indexOf('href="' + esc(a.verify.viewerUrl) + '"') > 0 && h.indexOf('Check it on ' + esc(a.verify.label) + ' ↗') > 0, a.coverage + ': the utility\'s own map'); count++; }
      else { assert.ok(h.indexOf('data-gp="verify"') < 0, a.coverage + ': no map invented'); count++; }
      assert.equal(S.grid.circuit, null); assert.equal(S.grid.verdict.key, 'study'); assert.match(h, /data-gp="save"/); count += 3;
      assert.ok(!/ComEd/.test(h), a.coverage + ': no ComEd word'); count++;
      /* no figure read: who serves the point, as Prime lists it */
      if (a.coverage !== 'outside') {
        var w = samePrime(h, a, a.coverage);
        assert.ok(w.indexOf('<b>Who serves this point</b><ul') > 0 && w.indexOf('<b>' + esc(name) + '</b>') > 0, a.coverage + ': who serves the point, where no figure is read'); count++;
      } else { assert.ok(h.indexOf('data-gp="who"') < 0 && primeList(a) === '', 'outside: no utility, no list'); count++; }
    });
  }, Promise.resolve());
}).then(function () {
  /* ── a door that does not answer: said so, nothing judged or recorded ── */
  var before = JSON.stringify({ substation: S.grid.substation, circuit: S.grid.circuit, verdict: S.grid.verdict });
  DOOR.fail = { status: 429, body: { error: 'Too many requests; try again in a minute' } };
  P.run(true);
  return idle().then(function () {
    var h = panelEl.innerHTML;
    assert.match(h, /The hosting capacity check did not answer: Too many requests; try again in a minute/); count++;
    assert.ok(h.indexOf('data-gp="save"') < 0, 'nothing to save'); assert.match(h, /data-gp="rerun"/); assert.match(h, /Mesa Downtown/); count += 3;
    assert.equal(P.last(), null); assert.equal(P.hosting(), null); count += 2;
    assert.equal(JSON.stringify({ substation: S.grid.substation, circuit: S.grid.circuit, verdict: S.grid.verdict }), before, 'nothing recorded'); count++;
  });
}).then(function () {
  console.log('tgridverdict: ' + count + ' assertions passed');
}).catch(function (e) { console.error(e); process.exit(1); });
