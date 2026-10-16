#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Grid Atlas built into Site Map (docs/GUIDED-SITE-FLOW.md, 2026-10-16).
 * Holds: the verdict engine (api/_lib/grid-verdict.js) — net of the queue,
 * Fits / Fits only smaller / Needs a study, the substation chip — the door
 * (api/grid-verdict.js), the panel holding no threshold, the editor loading
 * the ONE ComEd layer module rather than a copy, the save allowlist and the
 * load carrying `grid`, the pre-screen keeping the panel's answer for the
 * same point, and the whole path run in a VM: the real omega-comed-layers.js
 * probing a fake hosting service, the real panel posting into the real
 * engine, and grid.substation / grid.circuit / grid.verdict landing on S. */
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

/* ── the door ───────────────────────────────────────────────────────── */
var ep = read('api/grid-verdict.js');
assert.match(ep, /req\.method !== 'POST'/); assert.match(ep, /A\.authenticate\(req\)/); assert.match(ep, /caller\.orgId \|\| caller\.staff/);
assert.match(ep, /withCaller\(caller, MODULES/); assert.match(ep, /\['gridatlas', 'siteintel', 'sitefinder', 'compute'\]/, 'the set /api/grid-atlas asks'); count += 5;
assert.match(read('api/grid-atlas.js'), /\['gridatlas', 'siteintel', 'sitefinder', 'compute'\]/); count++;

/* ── the page holds no rule and no copy ─────────────────────────────── */
var panel = read('omega-grid-panel.js'), ed = read('editor.html');
['SMALLEST_OFFER_KW', 'THIN_SHARE', '34.5', 'maxKm', 'minKv', '>= 250', 'Moderate run', 'right voltage'].forEach(function (t) {
  assert.ok(panel.indexOf(t) < 0, 'a verdict rule is in the browser: ' + t); count++; });
['SMALLEST_OFFER_KW', 'THIN_SHARE', 'grid-verdict-v1'].forEach(function (t) { assert.ok(ed.indexOf(t) < 0, 'a verdict rule is in the editor: ' + t); count++; });
assert.match(panel, /fetch\('\/api\/grid-verdict'/); count++;
assert.match(ed, /<script src="\/omega-comed-layers\.js"><\/script>\s*<script src="\/omega-grid-panel\.js"><\/script>/); count++;
assert.ok(ed.indexOf('function interpret(') < 0 && ed.indexOf('BESS_HC') < 0, 'no pasted ComEd layer code in the editor'); count++;
assert.match(read('api/_lib/modules.js'), /gridatlas: 'rb-gridatlas rb-grid-panel'/, 'the button is Omega Grid\'s'); count++;
/* saved through the allowlist (savedBy rides the same payload), restored on load */
var save = ed.slice(ed.indexOf('async function saveProject(){'), ed.indexOf('_stripUndefinedInPlace(payload);'));
assert.match(save, /grid:\s+\(S\.grid && typeof S\.grid==='object'\)/); assert.match(save, /savedBy: \{ email:/); count += 2;
assert.match(ed, /S\.grid\s+= \(d\.grid\s+&& typeof d\.grid==='object'\)\s+\? d\.grid\s+: null;/); count++;
assert.match(ed, /\['substation', 'circuit', 'verdict'\]\.forEach\(function \(k\) \{ if \(S\.grid\[k\] !== undefined\) keep\[k\] = S\.grid\[k\]; \}\);/, 'the pre-screen keeps the panel\'s answer for the same point'); count++;

/* ── the whole path in a VM ─────────────────────────────────────────── */
var FEATURE = { attributes: { Feeder: 'F0297', SS_N: 'Crawford TSS 21', BESS_HC: 15620, PV_HC_kW: 9000, EV_HC_kW: 8000, Feeder_Q: 4895, IN_QUEUE_DATA_REFRESH_DATE: '2026-09-30' } };
var urls = [];
function XHR() {}
XHR.prototype.open = function (m, u) { this.url = u; urls.push(u); };
XHR.prototype.send = function () {
  var x = this; x.readyState = 4; x.status = 200;
  x.responseText = JSON.stringify(/\/75\/query/.test(x.url) ? { features: [FEATURE] } : { features: [] });
  setTimeout(function () { x.onreadystatechange(); }, 0);
};
var posted = [], saved = 0;
var S = { bessList: [{ mfr: 'FENECON', model: 'Industrial XXL', kw: '2508', kwh: '5015', qty: '1' }] };
function el() { return { style: {}, setAttribute: function () {}, addEventListener: function () {}, querySelector: function () { return null; }, remove: function () {}, innerHTML: '' }; }
var panelEl = null;
var ctx = {
  S: S, console: { info: function () {} }, setTimeout: setTimeout, setInterval: function () { return 0; }, clearInterval: function () {},
  Promise: Promise, JSON: JSON, Math: Math, isFinite: isFinite, XMLHttpRequest: XHR,
  document: { readyState: 'complete', body: { appendChild: function (e) { panelEl = e; } },
    getElementById: function (id) { return id === 'omega-grid-panel' ? panelEl : null; }, createElement: function () { return el(); } },
  OmegaGridPrescreen: {
    site: function () { return { lat: 41.81522, lng: -87.62261, address: '3400 S Federal St, Chicago, IL' }; },
    run: function (cb) { cb({ lat: 41.81522, lng: -87.62261, substations: [{ name: 'Crawford', voltageKv: 138, distanceKm: 1.2, owner: 'ComEd' }] }); },
    saveToProject: function (g) { S.grid = { lat: g.lat, lng: g.lng, substations: g.substations, source: 'grid-atlas-service' }; },
    feedSiteScore: function () {}
  },
  firebase: { auth: function () { return { currentUser: { getIdToken: function () { return Promise.resolve('tok'); } } }; } },
  fetch: function (url, opts) { assert.equal(url, '/api/grid-verdict'); assert.equal(opts.headers.Authorization, 'Bearer tok');
    var body = JSON.parse(opts.body); posted.push(body);
    return Promise.resolve({ ok: true, json: function () { return Promise.resolve(GV.judge(body)); } }); },
  saveProject: function () { saved++; return Promise.resolve(); },
  _setSaved: function () {}
};
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(read('omega-comed-layers.js'), ctx, { filename: 'omega-comed-layers.js' });
vm.runInContext(read('omega-grid-panel.js'), ctx, { filename: 'omega-grid-panel.js' });
ctx.OmegaComEdLayers.__setLayersForTest([{ id: 75 }]);
ctx.OmegaGridPanel.open();

function wait(cond, n) { return new Promise(function (res, rej) { (function tick(i) { if (cond()) return res(); if (i > (n || 200)) return rej(new Error('timed out')); setTimeout(function () { tick(i + 1); }, 5); })(0); }); }
wait(function () { return !!ctx.OmegaGridPanel.last(); }).then(function () {
  assert.ok(urls.some(function (u) { return /^\/comed-proxy\/75\/query\?/.test(u); }), 'the circuit is read through the ONE layer module, same-origin proxy'); count++;
  var p = posted[0];
  assert.deepEqual(p.unit, { kw: 2508, kwh: 5015, name: 'FENECON Industrial XXL' }, 'the unit is the Guided Build\'s, nothing typed'); count++;
  assert.deepEqual(p.substation, { name: 'Crawford', kv: 138, km: 1.2, owner: 'ComEd', source: 'grid-atlas-service' }); count++;
  assert.equal(p.circuit.id, 'F0297'); assert.equal(p.circuit.publishedKw, 15620); assert.equal(p.circuit.queuedKw, 4895); assert.equal(p.circuit.addressResolved, true); count += 4;
  var g = S.grid;
  assert.deepEqual(Object.keys(g.substation).sort(), ['chip', 'km', 'kv', 'miles', 'name', 'source', 'state']); assert.equal(g.substation.miles, 0.75); count += 2;
  assert.equal(g.circuit.utility, 'ComEd'); assert.equal(g.circuit.netKw, 10725); assert.equal(g.circuit.publishedKw, 15620); assert.equal(g.circuit.queuedKw, 4895);
  assert.ok(g.circuit.at); assert.match(g.circuit.source, /layer 75 · queue 2026-09-30/); count += 6;
  assert.equal(g.verdict.key, 'fits'); assert.equal(g.verdict.unitKw, 2508); assert.equal(g.substations.length, 1, 'the service\'s measurement stays beside it'); count += 3;
  assert.match(panelEl.innerHTML, /10,725 kW/); assert.match(panelEl.innerHTML, /room left after the queue \(net\)/); count += 2;
  assert.ok(panelEl.innerHTML.indexOf('10,725 kW') < panelEl.innerHTML.indexOf('15,620 kW'), 'the net is read before the headline'); count++;
  console.log('tgridverdict: ' + count + ' assertions passed');
}).catch(function (e) { console.error(e); process.exit(1); });
