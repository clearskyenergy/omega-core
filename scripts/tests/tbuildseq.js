#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   The 3D Site Visualizer's Build player, held without a browser.

   The library (api/_lib/build-sequence.js) on the REAL roll-up
   (api/_lib/editor-cost.js): every archetype the visualizer draws has a step
   or stands from the first frame; the steps add up to the Run total to the
   cent on a sample site and on 400 random drawings, and "in place" after the
   last step IS that total; the Run's contingency rides on exactly the lines
   it applies to (NextNRG's installed prices and the Omega-Core skid carry
   none); a contracted total is spread by the estimate's shares, or carried
   whole when nothing is priced; a line the steps do not cover, or a total
   they do not reach, throws instead of leaving money out; the days follow
   the planning rates with their working, the jurisdiction's and the
   utility's clocks read "not on file" with no number, energize waits on the
   utility, crews are added on big jobs; what the page sends is cleaned and
   never priced.

   The door (api/build-sequence.js) on the Firestore double: the money is
   the roll-up's on the body's quantities with the CALLER's workspace (a body
   naming a vendor changes nothing); Omega Plans in a package, Site Map on a
   legacy plan, an active workspace and an active member each refuse on
   their own; staff pass; a body past the cap and a read that fails refuse.
   node scripts/tests/tbuildseq.js */
'use strict';
var assert = require('node:assert/strict'), path = require('path'), fs = require('fs');
var ROOT = path.join(__dirname, '..', '..');
var EC = require(path.join(ROOT, 'api', '_lib', 'editor-cost.js'));
var BS = require(path.join(ROOT, 'api', '_lib', 'build-sequence.js'));
var FD = require(path.join(ROOT, 'scripts', '_lib', 'firestore-double.js'));
var pass = 0;
function ok(v, label) { assert.ok(v, label); pass++; }
function eq(a, b, label) { assert.deepEqual(a, b, label); pass++; }
function sum(list, k) { return list.reduce(function (s, x) { return s + x[k]; }, 0); }
function keys(s) { return s.phases.map(function (p) { return p.key; }); }
function phase(s, k) { return s.phases.filter(function (p) { return p.key === k; })[0]; }
function line(s, k) { var out = null; s.phases.forEach(function (p) { p.lines.forEach(function (l) { if (l.key === k) out = l; }); }); return out; }
function exact(s, out, label) {
  var cents = Math.round(out.totals.total * 100);
  ok(s.cents === cents && sum(s.phases, 'cents') === cents, label + ': the steps add up to the Run total to the cent');
  ok(s.phases[s.phases.length - 1].inPlaceCents === cents, label + ': in place after the last step is the Run total');
  ok(s.phases.every(function (p) { return sum(p.lines, 'cents') === p.cents; }), label + ': each step is the sum of its lines');
}

/* ── 1. every archetype the visualizer draws has a step, or stands ── */
var html = fs.readFileSync(path.join(ROOT, 'editor.html'), 'utf8'), at = html.indexOf('var ARCH = {');
var block = html.slice(at, html.indexOf('\n};', at)), archs = [], m, rx = /^\s*'([a-z-]+)'\s*:\s*\{/gm;
while ((m = rx.exec(block))) archs.push(m[1]);
ok(archs.length >= 30, 'the visualizer’s archetypes were read (' + archs.length + ')');
var drawn = archs.filter(function (a) { return a !== 'ignore'; });
eq(drawn.filter(function (a) { return !BS.REVEAL[a]; }), [], 'every archetype the visualizer draws has a step or stands from the start');
eq(Object.keys(BS.REVEAL).filter(function (a) { return archs.indexOf(a) < 0; }), [], 'and no step names an archetype the visualizer does not have');
ok(Object.keys(BS.REVEAL).every(function (a) { return BS.REVEAL[a] === 'existing' || BS.PHASE_KEYS.indexOf(BS.REVEAL[a]) >= 0; }), 'every reveal names a real step');
eq(BS.PHASE_KEYS, ['design', 'survey', 'trench', 'pads', 'equipment', 'solar', 'ev', 'envelope', 'wiring', 'finish', 'utility', 'commission', 'energize'], 'the steps, in build order');

/* ── 2. a battery-and-chargers site ── */
function site() {
  return { fleet: { units: 2, byModel: { 'GOTION-EDGE-760': { qty: 2, kwh: 261, kw: 125, catalogKey: 'GOTION-EDGE-760' } } }, fleetRating: { kwh: 522, kw: 250 },
    counts: { pad: 2, disco: 1, meter: 1, bollard: 8, jbox: 1, panel: 1, hasXfmr: true, mgc: 0 }, sheet: { eng: 12000, perm: 4000, comm: 6000, xfmr: 45000 },
    ev: { items: [{ kind: 'evl2', kw: 11.5, qty: 1 }, { kind: 'evl2', kw: 11.5, qty: 1 }, { kind: 'evunit', evId: 'autel_dc_compact', kw: 40, qty: 1 }] },
    solarKwDc: 350, solar: { byMount: { ground: 0, roof: 350, canopy: 0 } }, conduitFt: { 'RMC-AC': 420, 'EMT-BMS': 200, 'PVC-UG': 300 }, conduitRuns: { 'RMC-AC': 3, 'EMT-BMS': 2, 'PVC-UG': 2 },
    emsOn: true, configuredKwh: 522, configuredKw: 250 };
}
var BUILD = { trenchFt: 640, items: { 'bess-cabinet': 2, xfmr: 1, pad: 2, meter: 1, panel: 1, disco: 1, jbox: 1, 'solar-roof': 2, charger: 3, bollard: 8, building: 1 }, conduit: true };
var q1 = site(), o1 = EC.rollup(q1), s1 = BS.sequence(o1, q1, BUILD);
exact(s1, o1, 'the sample site');
eq(keys(s1), ['design', 'survey', 'trench', 'pads', 'equipment', 'solar', 'ev', 'wiring', 'finish', 'utility', 'commission', 'energize'], 'its steps: no building upgrades, everything else');
ok(s1.phases.every(function (p, i) { return p.index === i && p.inPlaceCents === (i ? s1.phases[i - 1].inPlaceCents : 0) + p.cents; }), 'in place climbs by each step');
var cont = o1.totals.contPct;
ok(Math.abs(line(s1, 'bess').amount - (o1.lines.bess.total) * (1 + cont)) < 0.011 && line(s1, 'bess').contingency, 'a line carries the Run’s contingency at the Run’s rate');
ok(Math.abs(line(s1, 'indirect.eng').amount - 12000 * (1 + cont)) < 0.011 && phase(s1, 'design').lines.length === 2, 'engineering and permits are the design step’s money');
ok(Math.abs(phase(s1, 'commission').amount - (6000 + o1.lines.indirect.emsSetup) * (1 + cont)) < 0.011, 'commissioning and the EMS setup are commissioning’s');
ok(phase(s1, 'trench').cents === 0 && phase(s1, 'trench').conduitBom === Math.round(o1.lines.conduit.total * 100) / 100 && /BOM, not in the Run total/.test(phase(s1, 'trench').notes.join(' ')), 'trenching names the conduit BOM and adds nothing it does not carry');
ok(phase(s1, 'wiring').cents === 0 && /installed/.test(phase(s1, 'wiring').notes.join(' ')), 'wiring has no line of its own, and says why');
eq(phase(s1, 'trench').reveal, ['conduit'], 'the conduit goes in with the trenching');
ok(phase(s1, 'equipment').reveal.indexOf('xfmr') >= 0 && phase(s1, 'solar').reveal.indexOf('solar-roof') >= 0 && phase(s1, 'ev').reveal[0] === 'charger', 'each step names what it puts in place');
/* the days, by the planning rates, with the working */
eq([phase(s1, 'survey').days, phase(s1, 'trench').days, phase(s1, 'pads').days], [2, 3, 1], 'survey 2 days; 640 ft of trench at 250 a day is 3; two pads are 1');
eq([phase(s1, 'pads').finish, phase(s1, 'pads').cure, phase(s1, 'equipment').start], [6, 7, 13], 'equipment waits for the pads to cure');
ok(/640 ft of trench at 250 ft a crew-day/.test(phase(s1, 'trench').basis[0]), 'the working is printed: ' + phase(s1, 'trench').basis[0]);
eq(phase(s1, 'solar').days, 6, '350 kW-DC on a roof at 60 a crew-day is 6 days');
eq(phase(s1, 'ev').days, 4, 'two Level 2 at ½ and one DC fast at 3 is 4 days');
ok(phase(s1, 'design').days === null && phase(s1, 'design').start === null && phase(s1, 'utility').days === null && !phase(s1, 'utility').known, 'the jurisdiction’s and the utility’s clocks are not on file: no number');
eq(s1.schedule.open, ['design', 'utility'], 'and the schedule says which are open');
ok(/not on file/.test(s1.schedule.plus) && phase(s1, 'energize').waitsOn[0] === 'utility', 'energize waits on the utility, and the total says so');
eq(s1.schedule.workingDays, phase(s1, 'energize').start, 'the working days end at energize');
ok(phase(s1, 'wiring').start === Math.max(phase(s1, 'equipment').finish, phase(s1, 'solar').finish, phase(s1, 'ev').finish), 'terminations wait for everything they tie in');
var s1road = BS.sequence(o1, q1, Object.assign({}, BUILD, { items: Object.assign({ road: 1 }, BUILD.items) }));
eq(phase(s1road, 'survey').days, 5, 'an access road adds the grading');
var s1none = BS.sequence(o1, q1, {});
ok(phase(s1none, 'trench').days === 2 && /underground conduit/.test(phase(s1none, 'trench').basis[0]), 'no trench drawn: the underground conduit times it (300 ft), and says which');

/* ── 3. 400 random drawings through the real roll-up ── */
var seed = 7;
function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
function pick(a) { return a[Math.floor(rnd() * a.length)]; }
function maybe(p, v) { return rnd() < p ? v : undefined; }
var models = ['GOTION-EDGE-760', 'GOTION-GRID-3421', 'PYTES-30-60', 'CUSTOM-A', 'NextNRG Saft 1000', 'CC-R60'];
var fuzzed = 0, contracted = 0, nn = 0;
for (var f = 0; f < 400; f++) {
  var byModel = {}, nm = Math.floor(rnd() * 3), units = 0;
  for (var i = 0; i < nm; i++) { var k = pick(models), qty = 1 + Math.floor(rnd() * 6); units += qty;
    byModel[k] = { qty: qty, kwh: Math.round(50 + rnd() * 4000), kw: Math.round(30 + rnd() * 2000), catalogKey: k, nextnrg: /NextNRG/.test(k), cost: maybe(0.2, Math.round(rnd() * 900000)), mixed: false }; }
  var solar = rnd() < 0.6 ? Math.round(rnd() * 8000) : 0, g = rnd() * solar, r = rnd() * (solar - g);
  var q = { fleet: { units: units, byModel: byModel }, fleetRating: { kwh: maybe(0.3, Math.round(rnd() * 5000)) || 0, kw: maybe(0.3, Math.round(rnd() * 2000)) || 0 },
    counts: { pad: Math.floor(rnd() * 5), disco: Math.floor(rnd() * 3), meter: Math.floor(rnd() * 3), bollard: Math.floor(rnd() * 20), jbox: Math.floor(rnd() * 4), panel: Math.floor(rnd() * 3), hasXfmr: rnd() < 0.5, mgc: rnd() < 0.15 ? 1 : 0 },
    sheet: { eng: maybe(0.5, Math.round(rnd() * 90000)), perm: maybe(0.5, Math.round(rnd() * 30000)), comm: maybe(0.4, Math.round(rnd() * 40000)), xfmr: maybe(0.4, Math.round(rnd() * 200000)),
      misc: maybe(0.3, Math.round(rnd() * 20000)), contPct: maybe(0.4, pick([0, 5, 7.5, 12, 15])), actualTotal: maybe(0.08, Math.round(rnd() * 5e6)), pvWdc: maybe(0.15, +(1 + rnd() * 2).toFixed(2)) },
    ev: { items: rnd() < 0.5 ? [{ kind: 'evl2', kw: 11.5, qty: 1 + Math.floor(rnd() * 8) }, { kind: 'evunit', evId: pick(['autel_dc_compact', 'autel_fast_disp', null]), kw: pick([40, 150, 240]), qty: 1 + Math.floor(rnd() * 3) }] : [] },
    solarKwDc: solar, solar: { byMount: { ground: g, roof: r, canopy: Math.max(0, (solar - g - r) * rnd()) }, nextnrgKwDc: rnd() < 0.2 ? solar * rnd() : 0 },
    conduitFt: { 'PVC-UG': Math.round(rnd() * 2000), 'RMC-DC': Math.round(rnd() * 500) }, conduitRuns: { 'PVC-UG': 2, 'RMC-DC': 1 },
    emsOn: rnd() < 0.5, configuredKwh: Math.round(rnd() * 3000), configuredKw: Math.round(rnd() * 1500),
    compute: { podsN: rnd() < 0.15 ? 1 + Math.floor(rnd() * 3) : 0, podKw: 1000 * (1 + Math.floor(rnd() * 3)), shellPerPod: 0, itPerPod: 0, excludeIt: false },
    omegaCore: { skids: rnd() < 0.2 ? 1 + Math.floor(rnd() * 2) : 0 },
    gen: rnd() < 0.15 ? [{ kind: 'deralt', altId: 'gen_ng', kw: 500 }] : [], dc: rnd() < 0.1 ? { element: { itKw: 2000, pue: 1.3 } } : {},
    bnzCapex: rnd() < 0.1 ? Math.round(rnd() * 400000) : 0, vendorOrg: rnd() < 0.1 ? 'nextnrg.com' : 'sunrise.example' };
  Object.keys(q.sheet).forEach(function (k2) { if (q.sheet[k2] === undefined) delete q.sheet[k2]; });
  var out = EC.rollup(q), s = BS.sequence(out, q, { trenchFt: Math.round(rnd() * 3000), items: { pad: q.counts.pad, xfmr: q.counts.hasXfmr ? 1 : 0, charger: 2 } });
  var cents = Math.round(out.totals.total * 100);
  assert.equal(sum(s.phases, 'cents'), cents, 'drawing ' + f + ': the steps add up to the Run total');
  assert.equal(s.phases[s.phases.length - 1].inPlaceCents, cents, 'drawing ' + f + ': in place at the end');
  s.phases.forEach(function (p) { assert.equal(sum(p.lines, 'cents'), p.cents, 'drawing ' + f + ': ' + p.key + ' is its lines'); });
  if (!out.totals.contracted && out.totals.inScope) {
    /* each line is its own money, with the contingency where the Run applies it */
    s.phases.forEach(function (p) { p.lines.forEach(function (l) { assert.ok(l.cents >= 0, 'drawing ' + f + ': ' + l.key + ' is not negative'); }); });
    var nnNoCont = ['nextnrg.solar', 'nextnrg.storage', 'omegaCore'];
    s.phases.forEach(function (p) { p.lines.forEach(function (l) { if (nnNoCont.indexOf(l.key) >= 0) assert.equal(l.contingency, false, l.key + ' carries no contingency'); }); });
  }
  if (out.totals.contracted) contracted++;
  if (out.totals.nextnrg > 0 || out.totals.nextnrgStorageAlone > 0) nn++;
  assert.ok(s.phases.every(function (p) { return p.known === false ? p.days === null : p.days >= 0; }), 'drawing ' + f + ': a day count or not on file');
  fuzzed++;
}
pass += fuzzed;
ok(contracted >= 10 && nn >= 10, 'the random drawings covered contracted totals (' + contracted + ') and NextNRG’s prices (' + nn + ')');

/* ── 4. what carries no contingency ── */
var q4 = site(); q4.solar.nextnrgKwDc = 100; q4.solarKwDc = 450; q4.omegaCore = { skids: 1 };
var o4 = EC.rollup(q4), s4 = BS.sequence(o4, q4, BUILD);
exact(s4, o4, 'NextNRG solar and a skid');
ok(line(s4, 'nextnrg.solar').cents === Math.round(o4.totals.nextnrg * 100) && !line(s4, 'nextnrg.solar').contingency, 'NextNRG’s installed solar is its price, no contingency');
ok(line(s4, 'omegaCore').cents === Math.round(o4.totals.omegaCore * 100) && !line(s4, 'omegaCore').contingency && phase(s4, 'equipment').lines.some(function (l) { return l.key === 'omegaCore'; }), 'the Omega-Core skid is its recorded price, set with the equipment');

/* ── 5. a contracted total ── */
var q5 = site(); q5.sheet.actualTotal = 1000000;
var o5 = EC.rollup(q5), s5 = BS.sequence(o5, q5, BUILD);
ok(s5.total === 1000000 && s5.contracted && s5.spread === 'contracted' && /contracted cost is spread/.test(s5.notes.join(' ')), 'a contracted total replaces the estimate, spread by its shares, and says so');
exact(s5, o5, 'contracted');
var share = phase(s1, 'equipment').cents / s1.cents;
ok(Math.abs(phase(s5, 'equipment').cents / s5.cents - share) < 0.00001, 'each step keeps the estimate’s share');
var o5b = EC.rollup({ sheet: { actualTotal: 250000 } }), s5b = BS.sequence(o5b, {}, {});
ok(s5b.spread === 'contracted-whole' && phase(s5b, 'energize').cents === 25000000 && /not split/.test(s5b.notes.join(' ')), 'nothing priced to split it by: the contracted total is carried whole, and said so');

/* ── 6. nothing placed ── */
var o6 = EC.rollup({}), s6 = BS.sequence(o6, {}, {});
ok(s6.cents === 0 && /Nothing priceable/.test(s6.notes.join(' ')), 'nothing placed: nothing in place, and said so');
eq(keys(s6), ['design', 'survey', 'utility', 'commission', 'energize'], 'only the steps every job has');
var o6b = EC.rollup({ sheet: { eng: 5000 } }), s6b = BS.sequence(o6b, {}, {});
ok(s6b.cents === 0 && phase(s6b, 'design').lines.length === 0, 'a typed fee with nothing placed puts nothing in place, as the Run counts nothing');

/* ── 7. drift: never quietly leave money out ── */
var bad = JSON.parse(JSON.stringify(o1)); bad.totals.sub += 500;
assert.throws(function () { BS.lines(bad); }, /do not add up to the Run’s subtotal/); pass++;
var bad2 = JSON.parse(JSON.stringify(o1)); bad2.totals.total += 500;
assert.throws(function () { BS.money(bad2); }, /do not add up to the Run total/); pass++;
var bad3 = JSON.parse(JSON.stringify(o1)); bad3.lines.newThing = { total: 9999 }; bad3.totals.sub += 9999; bad3.totals.total += 9999 * (1 + cont);
assert.throws(function () { BS.sequence(bad3, q1, BUILD); }, /subtotal/); pass++;
ok(true, 'a line the steps do not cover throws instead of leaving money out');

/* ── 8. what the page sends is cleaned, and never priced ── */
eq(BS.clean({ trenchFt: -5, items: { pad: 3, nuke: 9, xfmr: -2, charger: 'x', fence: 2.7 }, conduit: 'yes' }), { trenchFt: 0, items: { pad: 3, fence: 2 }, conduit: false }, 'unknown archetypes, negatives and words are dropped');
eq(BS.clean({ trenchFt: 9e9, items: { pad: 9e9 }, conduit: true }), { trenchFt: 1000000, items: { pad: 100000 }, conduit: true }, 'and the rest capped');
eq(BS.clean(null), { trenchFt: 0, items: {}, conduit: false }, 'nothing is nothing');
var priced = BS.sequence(o1, q1, Object.assign({ total: 1, cents: 5, price: 99, phases: [] }, BUILD));
eq(priced, s1, 'a total, a price or steps in the body change nothing');

/* ── 9. crews are added on big jobs ── */
var q9 = { solarKwDc: 5000, solar: { byMount: { ground: 5000, roof: 0, canopy: 0 } }, sheet: {} }, s9 = BS.sequence(EC.rollup(q9), q9, {});
eq([phase(s9, 'solar').crewDays, phase(s9, 'solar').crews, phase(s9, 'solar').days], [50, 3, 17], '5 MW on the ground: 50 crew-days, 3 crews, 17 days');
ok(/3 crews/.test(phase(s9, 'solar').basis.join(' ')) && /Stake the ground array: 5 MW-DC/.test(phase(s9, 'survey').basis.join(' ')), 'and the working says so, with the staking');
var q9b = { solarKwDc: 20000, solar: { byMount: { ground: 20000, roof: 0, canopy: 0 } }, sheet: {} }, s9b = BS.sequence(EC.rollup(q9b), q9b, {});
eq([phase(s9b, 'solar').crews, phase(s9b, 'solar').days], [6, 34], '20 MW: six crews at most, 34 days');
var q9c = { solarKwDc: 12, solar: { byMount: { ground: 0, roof: 12, canopy: 0 } }, sheet: {} }, s9c = BS.sequence(EC.rollup(q9c), q9c, {});
eq(phase(s9c, 'solar').days, 2, 'a home-sized array is two days');
var q9d = { solarKwDc: 300, solar: { byMount: { ground: 100, roof: 0, canopy: 50 } }, sheet: {} }, s9d = BS.sequence(EC.rollup(q9d), q9d, {});
ok(/150 kW-DC with no mount on record, timed as ground/.test(phase(s9d, 'solar').basis.join(' ')) && /canopy at 25 kW/.test(phase(s9d, 'solar').basis.join(' ')), 'a canopy is timed as steel, and kW with no mount on record says so');

/* ── 10. the door ── */
(async function () {
  var DB, AUTH;
  var ME = { uid: 'u1', email: 'dana@sunrise.example', orgId: 'sunrise.example', staff: false, claims: { email_verified: true } };
  function as(c) { AUTH = function () { return Promise.resolve(JSON.parse(JSON.stringify(c))); }; }
  function reset(billing, member, org) {
    DB = new FD.DB(); as(ME);
    if (org !== null) DB.seed('omega_orgs/sunrise.example', org || { name: 'Sunrise', status: 'active' });
    DB.seed('omega_orgs/sunrise.example/billing/current', billing || { tier: 'deluxe' });
    if (member !== null) DB.seed('omega_orgs/sunrise.example/members/u1', member || { role: 'member', status: 'active' });
  }
  function httpError(s, msg) { var e = new Error(msg); e.status = s; return e; }
  FD.mock('../api/_lib/admin.js', { handler: function (fn) { return fn; }, httpError: httpError, db: function () { return DB; },
    authenticate: function (req) { return AUTH(req); },
    safeOrg: function (v) { v = String(v || '').toLowerCase(); return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(v) ? v : ''; } });
  var api = require(path.join(ROOT, 'api', 'build-sequence.js')), headers = {};
  var res = { setHeader: function (k, v) { headers[k] = v; } };
  function call(body, method) { return api({ method: method || 'POST', headers: {}, body: body }, res); }
  async function refused(body, status, why, method) { try { await call(body, method); assert.fail('expected ' + status + ': ' + why); } catch (e) { assert.equal(e.status, status, why + ' → ' + e.message); pass++; return e; } }

  reset();
  var r = await call({ q: site(), build: BUILD });
  var mine = site(); mine.vendorOrg = 'sunrise.example';
  eq(r, BS.sequence(EC.rollup(mine), mine, BUILD), 'a legacy member gets the sequence of the roll-up on the body’s quantities');
  eq(headers['Cache-Control'], 'no-store', 'never cached');
  var spoof = site(); spoof.vendorOrg = 'nextnrg.com'; spoof.solar.nextnrgKwDc = 0; spoof.fleet.byModel['NextNRG Saft'] = { qty: 1, kwh: 1000, kw: 500, catalogKey: 'X' }; spoof.fleet.units = 3;
  var asked = await call({ q: JSON.parse(JSON.stringify(spoof)), build: BUILD });
  var fair = JSON.parse(JSON.stringify(spoof)); fair.vendorOrg = 'sunrise.example';
  ok(asked.cents === Math.round(EC.rollup(fair).totals.total * 100) && asked.cents !== Math.round(EC.rollup(spoof).totals.total * 100), 'a body naming NextNRG’s workspace is priced as the caller’s own');
  as(Object.assign({}, ME, { orgId: 'nextnrg.com' })); DB.seed('omega_orgs/nextnrg.com/billing/current', { tier: 'deluxe' });
  var theirs = await call({ q: site(), build: BUILD }), nnq = site(); nnq.vendorOrg = 'nextnrg.com';
  eq(theirs.cents, Math.round(EC.rollup(nnq).totals.total * 100), 'NextNRG’s own workspace is priced at its own rate, as the Run is');

  reset({ packaged: true, packagingState: 'paid', modules: ['lite', 'plansets'], accessUntil: Date.now() + 30 * 86400000 });
  ok((await call({ q: site() })).ok, 'a package with Omega Plans plays the build');
  reset({ packaged: true, packagingState: 'paid', modules: ['lite'], accessUntil: Date.now() + 30 * 86400000 });
  var np = await refused({ q: site() }, 403, 'a package without Omega Plans');
  ok(/Omega Plans/.test(np.message) && /3D Site Visualizer/.test(np.message), 'and says which module carries it: ' + np.message);
  reset({ packaged: true, packagingState: 'paid', modules: ['lite', 'plansets'], accessUntil: Date.now() - 86400000 });
  await refused({ q: site() }, 403, 'a lapsed package is read-only');
  reset(null, null, { status: 'suspended' }); await refused({ q: site() }, 403, 'a suspended workspace');
  reset(null, null, { status: 'pending' }); await refused({ q: site() }, 403, 'a pending workspace');
  reset(null, null, { status: 'cancelled' }); await refused({ q: site() }, 403, 'a cancelled workspace');
  reset(null, null, null); ok((await call({ q: site() })).ok, 'no workspace record yet: open, as the editor gate is');
  reset(null, { role: 'member', status: 'disabled' }); await refused({ q: site() }, 403, 'a disabled member');
  reset(null, { role: 'member', status: 'active', toolAccess: ['gridatlas'] }); await refused({ q: site() }, 403, 'a member without Site Map');
  reset({ tier: 'deluxe', toolAccess: ['gridatlas'] }); await refused({ q: site() }, 403, 'a product without Site Map');
  reset(null, { role: 'viewer', status: 'active' }); ok((await call({ q: site() })).ok, 'a viewer may watch the build: it writes nothing');
  reset(); as(Object.assign({}, ME, { orgId: 'not a domain' })); await refused({ q: site() }, 403, 'no workspace on the token');
  reset(); as({ uid: 's1', email: 'ops@clearsky-usa.com', orgId: null, staff: true, claims: { email_verified: true } });
  ok((await call({ q: site() })).ok, 'staff');
  reset(); await refused({ q: site() }, 405, 'GET is not the door', 'GET');
  var big = {}; for (var b = 0; b <= EC.MAX_ITEMS; b++) big['m' + b] = { qty: 1, kwh: 1 };
  await refused({ q: { fleet: { units: 1, byModel: big } } }, 413, 'a body past the cap');
  reset(); DB = { collection: function () { return { doc: function () { var d = { get: function () { return Promise.reject(new Error('unavailable')); } }; d.collection = function () { return { doc: function () { return d; } }; }; return d; } }; } };
  await refused({ q: site() }, 503, 'a plan read that fails is try-again, never a guess');

  console.log('tbuildseq: ' + pass + ' passed');
})().catch(function (e) { console.error(e); process.exit(1); });
