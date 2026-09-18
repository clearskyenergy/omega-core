#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   scripts/test-compute-lease.js
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Exercises api/compute-lease.js's model with no network and no Firebase.

   WHY. The offer this produces is a number a rep says to a site host out
   loud. The two failure modes that matter are both silent: pricing a site
   that should have been refused, and refusing one that should have been
   priced. Neither shows up as an error — they show up as a bad deal or a
   lost one, months later. So the gates, the hard gate, the tranche and the
   arithmetic are all asserted here.

     node scripts/test-compute-lease.js

   Exit 0 clean, 1 on any failure.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

var M = require('../api/compute-lease')._model;
var pass = 0, fail = 0;

function ok(name, cond, detail) {
  if (cond) { pass++; return; }
  fail++;
  console.error('  FAIL  ' + name + (detail != null ? '\n        ' + detail : ''));
}
function eq(name, got, want) { ok(name, got === want, 'got ' + JSON.stringify(got) + ', want ' + JSON.stringify(want)); }
function near(name, got, want, tol) {
  ok(name, Math.abs(got - want) <= tol, 'got ' + got + ', want ' + want + ' ±' + tol);
}

/* A site that clears everything on evidence. The reference case. */
var GOOD = {
  rep: {
    address: '1 Industrial Way, Rockford, IL',
    availableMw: 2, willServe: 'confirmed',
    fiberOnSite: 'yes', fiberDownMbps: 1000, fiberUpMbps: 1000, fiberMonthlyCost: 900,
    zoningCode: 'I-2', ownerName: 'Rockford Holdings LLC',
    controlType: 'owner', willingToLease: 'yes', maxTermYears: 20,
    leasedAcres: 1, meterPosture: 'keep'
  },
  evidence: {
    gridAtlas: { score: 82, nearestSubKm: 0.9, maxKv: 138, resolvedAddress: '1 Industrial Way, Rockford, IL' },
    network: { verdict: 'likely', reasons: ['city conduit at 0 mi'], lateral: { mi: 0, costLow: 0, costHigh: 0 } },
    parcel: { ok: true, zoning: 'I-2', owner: 'ROCKFORD HOLDINGS LLC', acres: 4.2, county: 'Winnebago', apn: '11-22-333' }
  }
};

function clone(o) { return JSON.parse(JSON.stringify(o)); }

/* Staff see the build-up; a tenant rep sees the offer and the version only.
   Most assertions below are about the model, so they run staff-side. */
var STAFF = { disclose: true };

console.log('compute-lease model · ' + M.BUILD);

/* ── the reference case ──────────────────────────────────────────────────── */
var r = M.evaluate(GOOD, STAFF);
eq('good site · verdict', r.verdict, 'qualified');
eq('good site · offerable', r.offerable, true);
eq('good site · power gate', r.gates.power.status, 'pass');
eq('good site · fiber gate', r.gates.fiber.status, 'pass');
eq('good site · zoning gate', r.gates.zoning.status, 'pass');
eq('good site · site control gate', r.gates.siteControl.status, 'pass');
eq('good site · zoning classified industrial', r.gates.zoning.zoningClass, 'industrial');
eq('good site · tranche 1 when meter is kept', r.tranche.n, 1);
ok('good site · offer exists', r.offer != null);
ok('good site · low < base < high monthly',
   r.offer.monthly.low < r.offer.monthly.base && r.offer.monthly.base < r.offer.monthly.high,
   JSON.stringify(r.offer.monthly));
eq('good site · term is 15 years by default', r.offer.termYears, 15);
ok('good site · monthly is above the floor', r.offer.monthly.low > M.RATE_CARD.floorMonthly);
ok('good site · no asks left on a fully answered site', r.asks.length === 0,
   JSON.stringify(r.asks.map(function (a) { return a.gate + ': ' + a.ask; })));

/* The arithmetic, checked by hand rather than by re-running the model.
   2 MW = 2,000 kW at $55/kW-yr base = $110,000, plus 1 acre at $5,000 =
   $115,000 gross, × quality × tranche 1.00, no lateral.

   The tolerance is 0.1% rather than a couple of dollars because the response
   reports qualityAdj rounded to three decimals while the model multiplies by
   the full value — on a six-figure rent those differ by tens of dollars, and
   a test that failed on that would only ever be teaching us to loosen it. */
var qa = r.offer.qualityAdj;
near('good site · base annual matches the build-up', r.offer.annual.base,
     Math.round(115000 * qa), Math.round(115000 * 0.001));
near('good site · monthly is annual/12', r.offer.monthly.base, Math.round(r.offer.annual.base / 12), 1);

/* 15 years of an escalating annuity, not 15 × year one. */
ok('good site · term total exceeds flat 15×annual',
   r.offer.termTotal.base > r.offer.annual.base * 15, r.offer.termTotal.base + ' vs ' + (r.offer.annual.base * 15));
near('escalatedTotal · 2.5% over 15y on $100k', M.escalatedTotal(100000, 0.025, 15), 1793193, 2000);
eq('escalatedTotal · zero escalator is flat', M.escalatedTotal(1000, 0, 15), 15000);

/* ── the hard gate ───────────────────────────────────────────────────────── */
var noFiber = clone(GOOD);
noFiber.rep.fiberOnSite = 'no';
delete noFiber.rep.fiberDownMbps; delete noFiber.rep.fiberUpMbps;
noFiber.evidence.network = { verdict: 'unlikely', reasons: ['52 mi to the nearest carrier'], lateral: { mi: 52, costLow: 2340000, costHigh: 13000000 } };
var rf = M.evaluate(noFiber);
eq('hard gate · fiber fails', rf.gates.fiber.status, 'fail');
eq('hard gate · site is disqualified', rf.verdict, 'disqualified');
eq('hard gate · not offerable', rf.offerable, false);
eq('hard gate · NO offer is priced', rf.offer, null);
ok('hard gate · reason names fiber', /fiber is the hard gate/i.test(rf.verdictReason), rf.verdictReason);
eq('hard gate · perfect power does not rescue it', rf.gates.power.status, 'pass');

/* Reachable-but-not-on-site is conditional, priced, and carries the trench. */
var lateral = clone(GOOD);
lateral.rep.fiberOnSite = 'no';
delete lateral.rep.fiberDownMbps; delete lateral.rep.fiberUpMbps;
lateral.evidence.network = { verdict: 'plausible', reasons: ['long-haul route 3 mi away'], lateral: { mi: 3, costLow: 135000, costHigh: 750000 } };
var rl = M.evaluate(lateral, STAFF);
eq('lateral · fiber is conditional', rl.gates.fiber.status, 'conditional');
eq('lateral · site is conditional', rl.verdict, 'conditional');
ok('lateral · still offerable', rl.offer != null);
ok('lateral · rent is lower than the on-site case', rl.offer.annual.base < r.offer.annual.base,
   rl.offer.annual.base + ' vs ' + r.offer.annual.base);
ok('lateral · drag is capped at the rate card share',
   rl.offer.components.base.lateralDragAnnual <= rl.offer.components.base.grossAnnual * M.RATE_CARD.lateralMaxShareOfRent + 1,
   JSON.stringify(rl.offer.components.base));

/* A ruinous lateral is capped, never negative, never below the floor. */
var ruinous = clone(lateral);
ruinous.evidence.network.lateral = { mi: 40, costLow: 1800000, costHigh: 10000000 };
var rr = M.evaluate(ruinous, STAFF);
ok('ruinous lateral · rent never goes negative', rr.offer.annual.low > 0, String(rr.offer.annual.low));
ok('ruinous lateral · rent never drops below the floor',
   rr.offer.monthly.low >= M.RATE_CARD.floorMonthly, String(rr.offer.monthly.low));

/* ── power gate ──────────────────────────────────────────────────────────── */
var small = clone(GOOD); small.rep.availableMw = 0.4;
var rs = M.evaluate(small);
eq('power · under 1 MW fails', rs.gates.power.status, 'fail');
eq('power · site is disqualified', rs.verdict, 'disqualified');
eq('power · no offer', rs.offer, null);
ok('power · the ask asks whether it is the meter or the service', rs.asks.some(function (a) { return /meter today or the service size/.test(a.ask); }));

var pending = clone(GOOD); pending.rep.willServe = 'requested';
var rp = M.evaluate(pending);
eq('power · pending will-serve is unconfirmed, not failed', rp.gates.power.status, 'unconfirmed');
eq('power · site drops to incomplete', rp.verdict, 'incomplete');
ok('power · still priced, but indicative', rp.offer != null);
ok('power · verdict says do not present as firm', /not confirmed/i.test(rp.verdictReason), rp.verdictReason);

/* Grid Atlas is a secondary signal — it must never settle the gate. */
var noGA = clone(GOOD); delete noGA.evidence.gridAtlas;
var rg = M.evaluate(noGA);
eq('power · a confirmed will-serve still passes with no Grid Atlas', rg.gates.power.status, 'pass');
ok('power · and the missing lookup is reported', rg.findings.some(function (f) { return /Grid Atlas did not run/.test(f.text); }));

/* ── zoning ──────────────────────────────────────────────────────────────── */
eq('zoning · I-2 is industrial', M.classifyZoning('I-2'), 'industrial');
eq('zoning · M1 is industrial', M.classifyZoning('M1'), 'industrial');
eq('zoning · C-3 is commercial', M.classifyZoning('C-3'), 'commercial');
eq('zoning · B2 is commercial', M.classifyZoning('B2'), 'commercial');
eq('zoning · PUD is mixed', M.classifyZoning('PUD'), 'mixed');
eq('zoning · A-1 is agricultural', M.classifyZoning('A-1'), 'agricultural');
eq('zoning · R-4 is residential', M.classifyZoning('R-4'), 'residential');
eq('zoning · an unknown code is unrecognised, not guessed', M.classifyZoning('ZX-99'), 'unrecognised');
eq('zoning · nothing in, null out', M.classifyZoning(''), null);

var resi = clone(GOOD); resi.rep.zoningCode = 'R-1'; resi.evidence.parcel.zoning = 'R-1';
var rz = M.evaluate(resi);
eq('zoning · residential fails', rz.gates.zoning.status, 'fail');
eq('zoning · and disqualifies the site', rz.verdict, 'disqualified');

var ag = clone(GOOD); ag.rep.zoningCode = 'A-1'; ag.evidence.parcel.zoning = 'A-1';
var ra = M.evaluate(ag);
eq('zoning · agricultural is conditional, not a refusal', ra.gates.zoning.status, 'conditional');
ok('zoning · agricultural is still offerable', ra.offer != null);
ok('zoning · agricultural rent is below the industrial case', ra.offer.annual.base < r.offer.annual.base);

/* ── site control ────────────────────────────────────────────────────────── */
var wont = clone(GOOD); wont.rep.willingToLease = 'no';
eq('control · a host who will not sign fails', M.evaluate(wont).gates.siteControl.status, 'fail');
eq('control · and disqualifies', M.evaluate(wont).verdict, 'disqualified');

var shortTerm = clone(GOOD); shortTerm.rep.maxTermYears = 5;
var rt = M.evaluate(shortTerm);
eq('control · a 5-year ceiling is conditional', rt.gates.siteControl.status, 'conditional');
ok('control · and the ask offers the renewal-option structure',
   rt.asks.some(function (a) { return /renewal options/.test(a.ask); }));

/* ── tranches ────────────────────────────────────────────────────────────── */
eq('tranche · meter transfer is 3', M.classifyTranche({ meterPosture: 'transfer' }).n, 3);
eq('tranche · open to energy structure is 2', M.classifyTranche({ openToEnergyStructure: true }).n, 2);
eq('tranche · sharing the meter is 2', M.classifyTranche({ meterPosture: 'share' }).n, 2);
eq('tranche · keeping the meter is 1', M.classifyTranche({ meterPosture: 'keep' }).n, 1);
eq('tranche · a passive host is 1', M.classifyTranche({ hostEngagement: 'passive' }).n, 1);
eq('tranche · nothing asked is not classifiable', M.classifyTranche({}).n, null);
eq('tranche · and it names all three questions', M.classifyTranche({}).missing.length, 3);

var t3 = clone(GOOD); t3.rep.meterPosture = 'transfer';
var t2 = clone(GOOD); t2.rep.meterPosture = ''; t2.rep.openToEnergyStructure = true;
var r3 = M.evaluate(t3), r2 = M.evaluate(t2);
eq('tranche · t3 classified', r3.tranche.n, 3);
eq('tranche · t2 classified', r2.tranche.n, 2);
ok('tranche · rent rises 1 → 2 → 3',
   r.offer.annual.base < r2.offer.annual.base && r2.offer.annual.base < r3.offer.annual.base,
   [r.offer.annual.base, r2.offer.annual.base, r3.offer.annual.base].join(' → '));

var unclassified = clone(GOOD); unclassified.rep.meterPosture = '';
var ru = M.evaluate(unclassified);
eq('tranche · unclassified stays null', ru.tranche.n, null);
eq('tranche · and prices at the Tranche 1 floor, never the premium',
   ru.offer.annual.base, r.offer.annual.base);
ok('tranche · the three questions reach the ask list',
   ru.asks.filter(function (a) { return a.gate === 'Tranche'; }).length === 3);

/* ── the empty site ──────────────────────────────────────────────────────── */
var empty = M.evaluate({ rep: {}, evidence: {} });
eq('empty · every gate unconfirmed · power', empty.gates.power.status, 'unconfirmed');
eq('empty · every gate unconfirmed · fiber', empty.gates.fiber.status, 'unconfirmed');
eq('empty · every gate unconfirmed · zoning', empty.gates.zoning.status, 'unconfirmed');
eq('empty · every gate unconfirmed · control', empty.gates.siteControl.status, 'unconfirmed');
eq('empty · verdict is incomplete, not disqualified', empty.verdict, 'incomplete');
ok('empty · an unanswered question never counts as a failure',
   Object.keys(empty.gates).every(function (k) { return empty.gates[k].status !== 'fail'; }));
ok('empty · it still prices, at the 1 MW gate', empty.offer != null && empty.offer.contractedKw === 1000);
ok('empty · and it hands back a full call list', empty.asks.length >= 6, String(empty.asks.length));
ok('empty · the disclaimer names the rate card version',
   empty.disclaimer.indexOf(M.RATE_CARD.version) >= 0);

/* ── who sees the rate card ──────────────────────────────────────────────
   The number a rep says out loud is not the commercial position that produced
   it. A tenant caller gets the range and the version; the bands and the
   component build-up (which discloses $/kW by division) are staff-only. */
var tenant = M.evaluate(GOOD);
ok('disclosure · tenant still gets the offer range', tenant.offer != null && tenant.offer.monthly.base > 0);
eq('disclosure · tenant gets the rate card VERSION', tenant.offer.rateCard.version, M.RATE_CARD.version);
eq('disclosure · and is told it is redacted', tenant.offer.rateCard.disclosed, false);
eq('disclosure · tenant does NOT get $/kW-year', tenant.offer.rateCard.capacityPerKwYear, undefined);
eq('disclosure · tenant does NOT get $/acre-year', tenant.offer.rateCard.padPerAcreYear, undefined);
eq('disclosure · tenant does NOT get the component build-up', tenant.offer.components, undefined);
ok('disclosure · staff DO get the bands', r.offer.rateCard.capacityPerKwYear != null);
ok('disclosure · staff DO get the components', r.offer.components != null);
eq('disclosure · redaction never changes the number', tenant.offer.annual.base, r.offer.annual.base);

/* ── the rate card is traceable ──────────────────────────────────────────── */
ok('rate card · echoed in the offer', r.offer.rateCard.version === M.RATE_CARD.version);
ok('rate card · version is on the response', r.rateCardVersion === M.RATE_CARD.version);
ok('rate card · bands are ordered', M.RATE_CARD.capacityPerKwYear.low < M.RATE_CARD.capacityPerKwYear.base
   && M.RATE_CARD.capacityPerKwYear.base < M.RATE_CARD.capacityPerKwYear.high);
ok('rate card · tranche premiums rise', M.RATE_CARD.tranchePremium[1] < M.RATE_CARD.tranchePremium[2]
   && M.RATE_CARD.tranchePremium[2] < M.RATE_CARD.tranchePremium[3]);

console.log((fail ? '\n' : '') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
