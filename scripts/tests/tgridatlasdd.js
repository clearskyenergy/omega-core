#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * Grid Atlas due diligence: the three site profiles (Tesla Supercharger,
 * BESS, modular AI compute) judged by grid-atlas-dd.js and wired into
 * grid-atlas.html. Holds:
 *   1. the compute profile IS the Francis Energy Site Readiness Checklist —
 *      eight sections, in its order, every unmappable item carried as an
 *      OPEN evidence item with the checklist's wording, never guessed;
 *   2. honesty: an unloaded layer reads unknown ("never looked"), which is
 *      not a pass, not a risk and never averaged into the readiness score;
 *   3. the capacity, flood, substation and fiber judgements at their
 *      thresholds;
 *   4. the page wiring: the companion script loaded, the dd keys on the
 *      presets, the checklist rendered from the pin analysis, export and
 *      print present, and the fiber-screen stash that feeds §6.
 * No network, no DOM. */
'use strict';
var assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '../..');
var DD = require(path.join(ROOT, 'grid-atlas-dd.js'));
var n = 0;
function ok(c, m) { assert.ok(c, m); n++; }
function eq(a, b, m) { assert.equal(a, b, m); n++; }

/* ── 1 · the three profiles exist and compute is the checklist ─────────── */
['supercharger', 'bess', 'compute'].forEach(function (k) {
  ok(DD.PROFILES[k], 'profile ' + k + ' exists');
  ok(DD.PROFILES[k].sections.length >= 4, k + ' has sections');
});
var cp = DD.PROFILES.compute;
eq(cp.sections.length, 8, 'compute carries the checklist’s eight sections');
var wantSections = ['Site Control & Legal', 'Zoning & Land Use', 'Permitting',
  'Power, Generation & Interconnection', 'Physical Site', 'Connectivity',
  'Environmental', 'Readiness Package'];
wantSections.forEach(function (w, i) {
  ok(cp.sections[i].name.indexOf(w) >= 0, 'compute section ' + (i + 1) + ' is ' + w + ' (got "' + cp.sections[i].name + '")');
});
/* the checklist's own evidence wording survives on the open items */
var flat = {};
cp.sections.forEach(function (s) { s.items.forEach(function (it) { flat[it.id] = it; }); });
ok(/ALTA\/NSPS/.test(flat['cp-title'].evidence), 'title item cites ALTA/NSPS survey');
ok(/10 Gbps.*5 Gbps|5 Gbps.*10 Gbps/.test(flat['cp-quote'].evidence), 'fiber quote item carries the 10/5 Gbps bandwidths');
ok(/20–40 ft|20-40 ft/.test(flat['cp-pad'].evidence), 'pad item carries the 20–40 ft container');
ok(cp.loadOptions && cp.loadOptions.length === 4 && cp.loadOptions[0].itKw === 75 && cp.loadOptions[3].itKw === 1770,
   'compute offers the four IT loads: 75 kW, 350 kW, 1 MW, 1.77 MW');

/* every item either judges automatically or names its evidence */
Object.keys(DD.PROFILES).forEach(function (k) {
  DD.PROFILES[k].sections.forEach(function (s) {
    s.items.forEach(function (it) {
      ok(typeof it.auto === 'function' || (typeof it.evidence === 'string' && it.evidence.length > 10),
         k + '/' + it.id + ' judges or names its evidence');
    });
  });
});

/* ── 2 · never looked is not a reading ─────────────────────────────────── */
var empty = DD.run('compute', {});
eq(empty.readiness, null, 'nothing measured → no readiness number');
empty.sections.forEach(function (s) {
  s.items.forEach(function (it) {
    ok(it.status === 'open' || it.status === 'unknown',
       'unmeasured ' + it.id + ' is open or unknown, never a verdict (got ' + it.status + ')');
  });
});
ok(/measured/i.test(empty.verdict) || /turn the profile/i.test(empty.verdict), 'empty verdict says nothing was measured');

/* unknown and a measured adverse reading are different answers */
function itemOf(r, id) {
  var hit = null;
  r.sections.forEach(function (s) { s.items.forEach(function (it) { if (it.id === id) hit = it; }); });
  return hit;
}
var offFlood = DD.run('bess', { floodMeasured: false });
eq(itemOf(offFlood, 'bs-flood').status, 'unknown', 'flood layer off → unknown');
var inFlood = DD.run('bess', { floodMeasured: true, inFlood: true, floodZone: 'AE' });
eq(itemOf(inFlood, 'bs-flood').status, 'risk', 'mapped SFHA → risk');
var dryFlood = DD.run('bess', { floodMeasured: true, inFlood: false });
eq(itemOf(dryFlood, 'bs-flood').status, 'pass', 'measured outside SFHA → pass');
/* the unknown never joins the average */
ok(offFlood.tally.unknown > 0 && offFlood.readiness === null, 'unknown-only run averages nothing');

/* ── 3 · thresholds ────────────────────────────────────────────────────── */
var strong = DD.run('compute', { lineKvMax: 345, mwLow: 500, mwBand: '500–1,000 MW', targetMw: 1.25 });
eq(itemOf(strong, 'cp-cap').status, 'pass', '345 kV band covers 1.25 MW');
ok(/NOT confirmed/i.test(itemOf(strong, 'cp-cap').note), 'capacity pass still says not confirmed');
var thin = DD.run('supercharger', { lineKvMax: 12, mwLow: 2, mwBand: '<10 MW (distribution)', targetMw: 3 });
eq(itemOf(thin, 'sc-cap').status, 'conditional', 'distribution band is conditional for a 3 MW site');
var noV = DD.run('supercharger', { mwBand: 'unknown' });
eq(itemOf(noV, 'sc-cap').status, 'unknown', 'no voltage read → unknown, not a verdict');

var subNear = DD.run('bess', { subKm: 1.2, subName: 'MARYVILLE', subKv: 69 });
eq(itemOf(subNear, 'bs-sub').status, 'pass', 'substation at 1.2 km passes the BESS screen');
var subFar = DD.run('bess', { subKm: 24 });
eq(itemOf(subFar, 'bs-sub').status, 'risk', 'substation at 24 km is a measured cost risk');

/* fiber: the server screen is §6 evidence; absent it the item routes to it */
var noFs = DD.run('compute', {});
eq(itemOf(noFs, 'cp-fs').status, 'open', 'no server screen → open item');
ok(/Check map center/.test(itemOf(noFs, 'cp-fs').note), 'open item routes to the fiber evidence panel');
var withFs = DD.run('compute', { fiberScreen: { routes: 3, facilities: 2, radiusKm: 25 } });
eq(itemOf(withFs, 'cp-fs').status, 'conditional', 'server screen present → conditional (serviceability stays unconfirmed)');
ok(/UNCONFIRMED/i.test(itemOf(withFs, 'cp-fs').note), 'screen result never claims serviceability');

/* ── 4 · readiness math: measured items only ───────────────────────────── */
var sc = DD.run('supercharger', {
  subKm: 2, subName: 'X', subKv: 69, lineKvMax: 69, mwLow: 10, mwBand: '10–60 MW',
  utilityMeasured: true, utility: 'Evergy', evMeasured: true, evWithin15: 3,
  floodMeasured: true, inFlood: false, targetMw: 3
});
eq(sc.readiness, 100, 'all five supercharger autos measured and passing → 100 over the measured span');
eq(sc.tally.open, 8, 'the eight evidence items stay open — a map clears nothing');
ok(/clears nothing/i.test(sc.disclaimer), 'disclaimer says a screen clears nothing');

/* ── 5 · the page wiring ───────────────────────────────────────────────── */
var html = fs.readFileSync(path.join(ROOT, 'grid-atlas.html'), 'utf8');
ok(/<script src="\/grid-atlas-dd\.js"><\/script>/.test(html), 'page loads the companion before the inline IIFE');
ok(/key:"bess"[^}]*dd:"bess"/.test(html), 'BESS preset carries its dd key');
ok(/key:"datacenter"[^}]*dd:"compute"/.test(html), 'Data Center preset screens the compute checklist');
ok(/key:"supercharger"[^}]*dd:"supercharger"/.test(html), 'Tesla Supercharger preset exists with its dd key');
ok(/GridAtlasDD\.run\(/.test(html), 'analyze() runs the checklist');
ok(/ddExport/.test(html) && /ddPrint/.test(html), 'DD report export and print are wired');
ok(/@media print/.test(html), 'print stylesheet turns the panel into the report');
ok(/__gaReanalyze/.test(html), 'page exposes the re-analyze hook for the fiber screen');
var fib = fs.readFileSync(path.join(ROOT, 'omega-fiber-atlas.js'), 'utf8');
ok(/__gaFiberScreen/.test(fib) && /__gaReanalyze/.test(fib), 'fiber evidence panel stashes the server screen and pokes the checklist');
/* the supercharger preset turns on what its checklist reads */
var scPreset = html.match(/\{key:"supercharger"[^}]*\}/);
ok(scPreset && ['substations', 'ev', 'utility_terr', 'flood'].every(function (l) { return scPreset[0].indexOf('"' + l + '"') >= 0; }),
   'supercharger preset loads the layers its own checks read');

/* ── 6 · easy to use (2026-11-09, Tommy: "it needs to be easy to use") ─── */
ok(/<!--GLANCE-->/.test(html) && /class="glance"/.test(html) && /At a glance/.test(html), 'the answer for the pin comes first, as an at-a-glance card');
ok(/h=h\.replace\('<!--GLANCE-->',function\(\)/.test(html), 'the card is placed with a function, so a "$" in a carrier name is not a pattern');
ok(/collapseSections\(\);/.test(html) && /function collapseSections\(\)/.test(html) && /var secOpen=\{\}/.test(html), 'detail sections collapse, and what is open is remembered across re-renders');
ok(/data-jump=/.test(html) && /function openSection\(key\)/.test(html), 'a line of the card opens the section it summarises');
ok(/\.secbody\{display:block !important\}/.test(html), 'the printed report shows every section, open or not');
ok(/<details id="fiberTools">/.test(html), 'the fiber map tools are folded to one line above the answer');
ok(/optgroup label="Site due diligence/.test(html) && /What are you siting\?/.test(html), 'the profile choice leads with the due-diligence checklists, in plain words');
ok(/\[\?&\]profile=/.test(html), 'a link can open on a checklist (?profile=compute|bess|supercharger)');
ok(/function fetchArc\(key,cb,envOverride\)/.test(html) && /function pinGridEnsure\(ll\)/.test(html) && /pinGridEnsure\(ll\);/.test(html),
   'the pin looks around itself for the nearest substation and line, whatever the zoom');
ok(/LAYERS\.substations\.on\?pg\.subs:\[\]/.test(html), 'and a layer switched off is still not asked — off stays "not measured"');

console.log('tgridatlasdd: ' + n + ' checks passed');
