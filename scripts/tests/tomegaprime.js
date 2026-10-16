#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Omega Prime sets up the real project (2026-10-16, Tommy: "it does the set
 * up and system like the artifact sandbox"). Holds:
 *   - omega-prime-project.js: the unit list (the tenant's own products first,
 *     the shipped XXL after), the battery entry, the ZIP and peaks readers,
 *     and the project record in the shapes editor.html's _loadProject reads;
 *   - the record touches no drawing key beyond the empty arrays a new project
 *     is created with, and Prime's updates touch none (drawingWriteAllowed);
 *   - omega-prime.html holds no verdict rule, asks through the one client
 *     (omega-grid-verdict.js), reads the tenant's list, the utility's rates,
 *     homes the project by the orgId claim then the email domain, and opens
 *     Site Map with from=prime;
 *   - omega-prime-handoff.js, run in a VM: fills the entry from the editor's
 *     own catalog, opens the BESS Guided Build once, drops the parameter,
 *     and does nothing without it. */
'use strict';
var assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm');
var ROOT = path.join(__dirname, '../..'), count = 0;
function read(f) { return fs.readFileSync(path.join(ROOT, f), 'utf8'); }
var PP = require(path.join(ROOT, 'omega-prime-project.js'));

/* ── the unit list ──────────────────────────────────────────────────── */
var none = PP.units(null);
assert.equal(none.length, 1); assert.equal(none[0].key, 'FENECON-IND-XXL'); assert.equal(none[0].kw, 2508); count += 3;
var tenant = { keys: ['CLEANCELL-CC-2000', 'CLEANCELL-MOD-1', 'CLEANCELL-NOFOOT'], entries: {
  'CLEANCELL-CC-2000': { mfr: 'Clean Cell', model: 'CC-2000', kw: 1000, kwh: 2000, usable: 1900, dur: 2, widthFt: 8, depthFt: 20, xfmr: '1500 kVA' },
  'CLEANCELL-MOD-1': { mfr: 'Clean Cell', model: 'Module', kwh: 5 },                       /* no kW: not placeable */
  'CLEANCELL-NOFOOT': { mfr: 'Clean Cell', model: 'R60', kw: 60, kwh: 61.44 } } };
var us = PP.units(tenant);
assert.deepEqual(us.map(function (u) { return u.key; }), ['CLEANCELL-CC-2000', 'CLEANCELL-NOFOOT', 'FENECON-IND-XXL'], 'the tenant\'s own products lead, the XXL after'); count++;
assert.equal(us[0].name, 'Clean Cell CC-2000'); assert.equal(us[0].lFt, 20); assert.equal(us[0].wFt, 8); assert.equal(us[0].tenant, true); count += 4;
assert.equal(us[1].lFt, null, 'a footprint not on file stays unknown, never assumed'); assert.equal(us[1].hours, 1.02); count += 2;
assert.equal(PP.units({ keys: ['FEN-XXL'], entries: { 'FEN-XXL': { mfr: 'FENECON', model: 'Industrial XXL', kw: 2508, kwh: 5015 } } }).length, 1, 'no second XXL when the list carries it'); count++;
['price', 'eqcost', 'cost'].forEach(function (k) { assert.ok(!(k in PP.XXL) && !(k in us[0]), 'no price on a unit: ' + k); count++; });

/* ── readers ────────────────────────────────────────────────────────── */
assert.equal(PP.zipOf('3400 S Federal St, Chicago, IL, 60616'), '60616'); assert.equal(PP.zipOf('12 Main St, Joliet IL 60435-1234'), '60435'); assert.equal(PP.zipOf('no zip here'), ''); count += 3;
assert.deepEqual(PP.peaks('1,420  1,388\n1402, 1510 kW'), [1420, 1388, 1402, 1510]); assert.equal(PP.peaks('1 2 3 4 5 6 7 8 9 10 11 12 13 14').length, 12); assert.deepEqual(PP.peaks(''), []); count += 3;

/* ── the project record ─────────────────────────────────────────────── */
var grid = { lat: 41.81522, lng: -87.62261, substation: { name: 'Crawford' }, circuit: { id: 'Z13733', netKw: 240 }, verdict: { key: 'study' }, source: 'omega-prime' };
var st = { addr: '3400 S Federal St, Chicago, IL 60616', lat: 41.81522, lng: -87.62261, geoSrc: 'U.S. Census geocoder', unit: PP.XXL, grid: grid,
  load: { utility: 'ComEd', demandRate: 19.85, peaksKw: [1420], peakKw: 1420 },
  area: { s: 41.8151, w: -87.6227, n: 41.8153, e: -87.6225, wFt: 60.4, hFt: 40.2, sqft: 2428.1 }, unitAt: { lat: 41.81521, lng: -87.62262 }, poi: null, conduitFt: null };
var who = { uid: 'u1', email: 'Rep@ClearSky-USA.com', name: 'Rep', orgId: 'clearsky-usa.com' };
var d = PP.projectDoc(st, who, 'TS');
assert.equal(d.orgId, 'clearsky-usa.com'); assert.equal(d.uid, 'u1'); assert.equal(d.ownerEmail, 'rep@clearsky-usa.com'); count += 3;
assert.equal(d.type, 'bess'); assert.deepEqual(d.siteScopes, ['bess']); assert.equal(d.stage, 'candidate'); assert.equal(d.name, st.addr); assert.equal(d.address, st.addr); count += 5;
assert.deepEqual(d.mapState, { lat: 41.81522, lng: -87.62261, zoom: 19 }); count++;
assert.equal(d.bessList.length, 1); assert.equal(d.bessList[0].catalogKey, 'FENECON-IND-XXL'); assert.equal(d.bessList[0].kw, '2508'); assert.equal(d.bessList[0]._fromPrime, true); count += 4;
assert.equal(d.grid, grid); assert.equal(d.load.demandRate, 19.85); assert.equal(d.createdAt, 'TS'); count += 3;
assert.deepEqual(d.elements, []); assert.deepEqual(d.conduits, []); assert.deepEqual(d.annotations, []); assert.ok(!('shapes' in d) && !('geoElements' in d), 'no drawing is forged'); count += 4;
assert.deepEqual(d.prime.layout.area, { s: 41.8151, w: -87.6227, n: 41.8153, e: -87.6225, wFt: 60, hFt: 40, sqft: 2428 }); assert.deepEqual(d.prime.layout.unit, { lat: 41.81521, lng: -87.62262 }); assert.equal(d.prime.layout.poi, null); count += 3;
assert.ok(!('grid' in PP.projectDoc({ addr: 'x', lat: 1, lng: 2, unit: PP.XXL }, who)), 'no grid answer, no grid field'); count++;

/* Site Map reads every field the record is made with */
var ed = read('editor.html');
assert.match(ed, /if\(d\.bessList\)S\.bessList=d\.bessList;/); assert.match(ed, /const ms = d\.mapState \|\| \{\};/); assert.match(ed, /S\.grid\s+= \(d\.grid\s+&& typeof d\.grid==='object'\)/);
assert.match(ed, /const savedAddr = d\.address/); assert.match(ed, /OmegaWorkspaces\.setProject\(d\.type, d\.siteScopes, true\)/); count += 5;
/* and none of what Prime writes or updates is a drawing key */
var rules = read('firestore.rules'), keys = JSON.parse(rules.match(/function drawingKeys\(\) \{\s*return (\[[^\]]*\]);/)[1].replace(/'/g, '"'));
['grid', 'load', 'prime', 'bessList', 'mapState', 'updatedAt', 'name', 'address', 'type', 'siteScopes'].forEach(function (k) { assert.ok(keys.indexOf(k) < 0, 'Prime writes a drawing key: ' + k); count++; });

/* ── the page ───────────────────────────────────────────────────────── */
var pg = read('omega-prime.html');
['net >= UNIT.kw', 'else if (net > 0)', 'SMALLEST_OFFER_KW', "'<b>Fits.</b>"].forEach(function (t) { assert.ok(pg.indexOf(t) < 0, 'a verdict rule is in Omega Prime: ' + t); count++; });
assert.match(pg, /GV\.ask\(body\)/); assert.match(pg, /GV\.circuitBody\(S\.probe, 0, S\.circuitUtility\)/); assert.match(pg, /GV\.fields\(S\.verdict, S\.probe, 0\)/); count += 3;
var order = ['/omega-comed-layers.js', '/omega-bess-products.js', '/omega-grid-verdict.js', '/omega-prime-project.js'].map(function (f) { return pg.indexOf('<script src="' + f + '"></script>'); });
assert.ok(order.every(function (i, k) { return i > 0 && (k === 0 || i > order[k - 1]); }), 'the shared modules load in order'); count++;
assert.match(pg, /B\.load\(\)\.then\(function \(t\) \{ UNITS = PP\.units\(t\);/); count++;
assert.match(pg, /fetch\('\/api\/utility-rates\?zip=' \+ encodeURIComponent\(zip\)/); count++;
assert.match(pg, /var claim = r && r\.claims && r\.claims\.orgId;/); assert.match(pg, /orgId: claim \? String\(claim\) : \(B && B\.orgOf \? B\.orgOf\(u\.email\) : ''\)/, 'homed as userOrg() is: the claim, then the email domain'); count += 2;
assert.match(pg, /db\.collection\('projects'\)\.add\(PP\.projectDoc\(docState\(\), w, FV\.serverTimestamp\(\)\)\)/); count++;
assert.match(pg, /'\/editor\.html\?id=' \+ encodeURIComponent\(S\.projectId\) \+ '&from=prime'/); count++;
assert.ok(!/FENECON\\'s quote|send FENECON|routed to FENECON/.test(pg), 'the routing names the chosen unit\'s maker, not one brand'); count++;
assert.match(ed, /<script src="\/omega-grid-panel\.js"><\/script>[\s\S]{0,400}<script src="\/omega-prime-handoff\.js"><\/script>/); count++;

/* ── the hand-off, in a VM ──────────────────────────────────────────── */
function handoff(search, catalogEntry) {
  var opened = 0, url = null, S = { bessList: [PP.bessEntry(PP.XXL)] };
  var ctx = { S: S, console: { info: function () {}, warn: function () {} }, setTimeout: function (f) { f(); }, URL: URL,
    BESS_CATALOG: catalogEntry ? { 'FENECON-IND-XXL': catalogEntry } : {},
    location: { search: search, href: 'https://x.test/editor.html' + search + '#v' },
    history: { state: null, replaceState: function (s, t, u) { url = u; } },
    document: { readyState: 'complete', getElementById: function (id) { return id === 'addr-in' ? {} : (id === 'bm-catalog' ? { value: '' } : null); } },
    openBessGuidedBuild: function () { opened++; }, __omegaPrimeHandoffNoAuto: true };
  ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(read('omega-prime-handoff.js'), ctx);
  var ran = ctx.OmegaPrimeHandoff.run({ wait: 1, max: 30 });
  return { ran: ran, opened: opened, url: url, b: S.bessList[0] };
}
var h = handoff('?id=p1&from=prime', { mfr: 'FENECON', model: 'FENECON Industrial XXL — 2.508 MW', kw: 2508, kwh: 5015, inv: 'Central Inverter, 2.5 MW class', ikva: 2508, controller: 'FEMS', gridConnectV: '480V 3-phase AC', _incPCS: true });
assert.equal(h.ran, true); assert.equal(h.opened, 1, 'the Guided Build opens once'); assert.equal(h.url, '/editor.html?id=p1#v', 'from=prime is dropped'); count += 3;
assert.equal(h.b.inv, 'Central Inverter, 2.5 MW class'); assert.equal(h.b.ikva, '2508'); assert.equal(h.b._controller, 'FEMS'); assert.equal(h.b._gridConnectV, '480V 3-phase AC'); assert.equal(h.b._incPCS, true); count += 5;
var n = handoff('?id=p1', {}); assert.equal(n.ran, false); assert.equal(n.opened, 0, 'inert without the parameter'); count += 2;
var late = handoff('?id=p1&from=prime', null); assert.equal(late.opened, 1, 'a catalog entry that never lands still opens the build with what Prime wrote'); count++;

console.log('tomegaprime: ' + count + ' assertions passed');
