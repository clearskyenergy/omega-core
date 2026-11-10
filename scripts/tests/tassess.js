/* scripts/tests/tassess.js — the site assessment (2026-11-09, Tommy: "when i
   upload a portfolio it then would run all these numbers … i should be able
   to select run … the goal is to get sites shovel ready").
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Three layers, all offline:
     E  the two engines against the figures of the models they carry: the
        grid battery's reference case to the cent, the fast-charging host
        case to the cent — a change in either engine's arithmetic fails here.
        E05 and E06 (2026-11-09, the audit Tommy asked for: "make sure the
        IRR calculators are acurate … make sure those engines are perfect")
        pin every SWITCH the reference case leaves off: each figure there is
        the source model's own formulas evaluated independently of this
        code, cell by cell, and the engine agreed to half a cent on all of it
     A  the assessment library: the power rules (measured, entered, ceiling,
        none: never a zero peak), the compute shelf, the readiness score,
        the verifications, the approval
     D  the door on the shared Firestore double: Run, the screening job a
        phase at a time (Grid Atlas, then the parcel), a readiness mark, the
        approval for pre-development, the list row without its tables
   node scripts/tests/tassess.js */
'use strict';
var assert = require('assert');
var FD = require('../_lib/firestore-double');
var B = require('../../api/_lib/portfolio/assess-bess'), T = require('../../api/_lib/portfolio/assess-supercharger');
var A = require('../../api/_lib/portfolio/assess'), DOOR = require('../../api/_lib/portfolio/assess-door'), DG = require('../../api/_lib/portfolio/diligence');
var ORG = 'acme-sites.com', O = 'omega_orgs/' + ORG, NOW = '2026-11-09T15:00:00.000Z', PAT = { uid: 'u-pat', email: 'pat@acme-sites.com', orgId: ORG, staff: false };
var passed = 0, failed = 0, queue = [];
function test(name, fn) { queue.push([name, fn]); }
function httpError(s, m) { var e = new Error(m); e.status = s; return e; }
async function rejects(p, status, re) { try { await p; } catch (e) { assert.equal(e.status, status, e.message); if (re) assert.ok(re.test(e.message), e.message); return e; } assert.fail('expected ' + status); }
function near(a, b, tol, what) { assert.ok(Math.abs(a - b) <= (tol == null ? 0.011 : tol), (what || '') + ' got ' + a + ', want ' + b); }

/* ── E: the engines ─────────────────────────────────────────────────────── */
test('E01 the grid battery’s reference case, to the cent: capital, credit, rebate, year one, ten years, NPV, the taxes and the swept loan', function () {
  var c = B.bessCase({ powerKw: 855.25, state: 'IL', utility: 'ComEd' });
  assert.ok(c.ok); assert.equal(c.market.fit, 'zone');
  near(c.sizing.kwh, 3421); near(c.capex.hardware, 598675); near(c.capex.softCosts, 47894); near(c.capex.construction, 400000); near(c.capex.total, 1071569);
  near(c.capex.itcGross, 321470.7); near(c.capex.itcProceeds, 295753.04); near(c.capex.rebate, 855250); near(c.capex.net, -79434.04);
  near(c.revenue.grossPerKwYear, 293); near(c.revenue.netPerKwYear, 190.45);
  near(c.year1.netRevenue, 162882.36); near(c.year1.netCashFlow, 129287.25); near(c.year1.incomeTax, 48988.25); near(c.year1.equityCashFlow, 37436.24); near(c.year1.propertyTax, 11790.9); near(c.year1.chargingLoss, 4472.86);
  var y10 = c.projections[9];
  near(y10.energyMwh, 2.85); near(y10.grossRevenue, 235942.97); near(y10.netCashFlow, 127870.36); near(y10.incomeTax, 52508.04); near(y10.equityCashFlow, 75362.31); near(y10.propertyTax, 4716.36);
  near(c.returns.cumulative, 1364079.08); near(c.returns.npv, 942113.8); near(c.returns.equityNpv, 579090.43); near(c.returns.cumulativeEquity, 834121.65);
  near(c.returns.incomeTaxTotal, 487094.67); near(c.returns.propertyTaxTotal, 82536.33);
  near(c.debt.loan, 1071569); near(c.debt.repaidFromIncentives, 1071569); near(c.debt.bridgeInterest, 42862.76); assert.equal(c.debt.termBalance, 0); assert.equal(c.debt.minDscr, null);
  /* the credit and the rebate cover the cost: no IRR is invented */
  assert.equal(c.returns.noNetInvestment, true); assert.equal(c.returns.irrPct, null); assert.equal(c.returns.paybackYears, 0);
  assert.ok(c.notes.some(function (n) { return /no net investment/.test(n); }));
});
test('E02 the battery elsewhere: no rebate outside Illinois, an IRR on the net capital, and the market said for what it is', function () {
  var ok = B.bessCase({ powerKw: 400, state: 'OK' });
  assert.equal(ok.capex.rebate, 0); assert.equal(ok.capex.rebateApplies, false); assert.ok(ok.capex.net > 0);
  assert.equal(ok.market.fit, 'reference'); assert.ok(/not in that market/.test(ok.market.words));
  assert.ok(ok.returns.irrPct > 5 && ok.returns.irrPct < 20, ok.returns.irrPct); assert.equal(ok.returns.noNetInvestment, false);
  near(ok.returns.paybackYears, ok.capex.net / ok.year1.netCashFlow, 0.01);
  var oh = B.bessCase({ powerKw: 400, state: 'OH' }); assert.equal(oh.market.fit, 'market');
  /* over the rebate's ceiling in Illinois: none counted */
  assert.equal(B.bessCase({ powerKw: 6000, state: 'IL' }).capex.rebate, 0);
  assert.equal(B.bessCase({ powerKw: 0, state: 'IL' }).ok, false); assert.equal(B.bessCase({}).ok, false);
  /* a workspace's own figure replaces the set's; an unknown key is set aside and named */
  var own = B.bessCase({ powerKw: 400, state: 'OK', assumptions: { bessPricePerKwh: 150, revenue: { regulation: 100 }, madeUp: 1 } });
  assert.ok(own.capex.hardware < ok.capex.hardware && own.revenue.grossPerKwYear === 213); assert.ok(own.notes.some(function (n) { return /madeUp/.test(n); }));
});
test('E03 the fast-charging host case, to the cent: capital, year one, the after-tax and pre-tax returns, NPV and payback', function () {
  var c = T.superchargerCase({ state: 'CA', posts: 4, startYear: 2027, pricePerKwh: 0.68, kwhPerPostDay: 300, assumptions: { annualRentUsd: 9600 } });
  assert.ok(c.ok); near(c.capex.total, 360000); near(c.capex.equipment, 200000); near(c.capex.installation, 160000);
  assert.equal(c.year1.kwh, 438000); near(c.year1.revenue, 291883.2); near(c.year1.earningsBeforeTax, 126793.2); near(c.year1.cashFlow, 101434.56);
  near(c.projections[1].revenue, 312315.02); near(c.projections[1].rent, 9888); near(c.projections[14].revenue, 752630.8, 0.02);
  near(c.returns.preTaxIrrPct, 40.74); near(c.returns.irrPct, 33.27); near(c.returns.npv, 717796.15); near(c.returns.paybackYears, 3.3); near(c.returns.averageRevenue, 488982.62); near(c.returns.cumulative, 1987607.95);
});
test('E05 the battery’s switches, each against the model’s own formulas evaluated independently: no rebate, the rebate as a price reduction, augmentation with a part loan that is not swept, usable losses with part bonus, a 2-hour battery with a loss limit', function () {
  var ok = B.bessCase({ powerKw: 1200, state: 'OK' });                      /* the register's own Oklahoma case */
  near(ok.returns.irrPct, 10.59); near(ok.returns.npv, 129512.66); near(ok.returns.equityNpv, 114246.39); near(ok.projections[0].equityCashFlow, 3827.42); near(ok.returns.cumulativeEquity, 175118.3); near(ok.debt.minDscr, 1.11); assert.equal(ok.returns.equityIrrPct, null);
  var pr = B.bessCase({ powerKw: 855.25, state: 'IL', utility: 'ComEd', assumptions: { rebateAsPriceReduction: true } });
  near(pr.returns.irrPct, 82.18); near(pr.returns.npv, 706064.8); near(pr.returns.equityNpv, 421404.33); near(pr.projections[0].equityCashFlow, 66550.47); near(pr.returns.cumulativeEquity, 609188.25); near(pr.debt.minDscr, 5.48);
  var au = B.bessCase({ powerKw: 2000, state: 'TX', assumptions: { augment: true, debt: { pctOfCapex: 0.6, sweepIncentives: false, rate: 0.09, termYears: 7 } } });
  near(au.returns.irrPct, 9.81); near(au.returns.equityIrrPct, 10.01); near(au.returns.npv, 148748.75); near(au.returns.equityNpv, 57605.71); near(au.projections[0].equityCashFlow, 7759.89); near(au.returns.cumulativeEquity, 435556.62); near(au.debt.minDscr, 0.95);
  assert.ok(au.returns.augmentationTotal > 0); assert.equal(au.projections[9].capacityFactor, 1);
  var lu = B.bessCase({ powerKw: 500, state: 'OH', assumptions: { revenueEscalation: 0.02, platformFixedPerKw: 4, tax: { lossesUsable: true, bonusPct: 0.6 }, propertyTax: { escalation: 0.03 } } });
  near(lu.returns.irrPct, 11.4); near(lu.returns.npv, 75962.6); near(lu.returns.equityNpv, 114035.2); near(lu.projections[0].equityCashFlow, 126222.23); near(lu.returns.cumulativeEquity, 102011.78); near(lu.debt.minDscr, 1.07);
  var h2 = B.bessCase({ powerKw: 3000, state: 'OK', assumptions: { durationHours: 2, tax: { lossLimit: 0.8 }, debt: { pctOfCapex: 0.8 } } });
  near(h2.sizing.kwh, 6000); near(h2.returns.irrPct, 34.43); near(h2.returns.equityIrrPct, 82.16); near(h2.returns.npv, 1913065.36); near(h2.returns.equityNpv, 1235916.38); near(h2.projections[0].equityCashFlow, 323548.92); near(h2.returns.cumulativeEquity, 1864059.08); near(h2.debt.minDscr, 3.27);
});
test('E06 the charging case’s switches, each against the calculator’s own formulas evaluated independently: the credit with pedestals and incentives, escalations over ten years from a leap year, and a case that never pays back', function () {
  var ok = T.superchargerCase({ state: 'OK', posts: 8, startYear: 2027 });  /* the register's own Oklahoma case */
  near(ok.capex.total, 720000); near(ok.returns.preTaxIrrPct, 35.51); near(ok.returns.irrPct, 28.83); near(ok.returns.npv, 1097829.08); near(ok.returns.paybackYears, 3.75);
  var cr = T.superchargerCase({ state: 'IL', posts: 12, startYear: 2027, assumptions: { installCase: 'high', utilizationCase: 'low', federalCredit: true, pedestals: true, incentiveUsd: 60000, additionalIncentiveUsd: 15000, annualRentUsd: 24000 } });
  near(cr.capex.total, 1021785); near(cr.returns.preTaxIrrPct, 17.33); near(cr.returns.irrPct, 13.32); near(cr.returns.npv, 218282.53); near(cr.returns.paybackYears, 7.11);
  var es = T.superchargerCase({ state: 'MO', posts: 6, startYear: 2028, assumptions: { installCase: 'low', utilizationCase: 'high', priceEscalation: 0.02, electricityEscalation: 0.03, years: 10, taxRate: 0.27, discountRate: 0.08 } });
  near(es.capex.total, 450000); near(es.returns.preTaxIrrPct, 41); near(es.returns.irrPct, 29.64); near(es.returns.npv, 613371.07); near(es.returns.paybackYears, 3.46); assert.equal(es.projections.length, 10);
  var no = T.superchargerCase({ state: 'NE', posts: 4, startYear: 2027, assumptions: { installCase: 'high', utilizationCase: 'low' } });
  near(no.returns.preTaxIrrPct, -4.86); near(no.returns.irrPct, -7.2); near(no.returns.npv, -292024.46); assert.equal(no.returns.paybackYears, null);
});
test('E04 fast charging sized on the power: whole posts at the planning draw, never under the four-post minimum, the state’s indicative figures said', function () {
  var c = T.superchargerCase({ state: 'OK', availableKw: 800, startYear: 2027 });
  assert.ok(c.ok); assert.equal(c.sizing.posts, 5); assert.equal(c.inputs.pricePerKwh, 0.51); assert.equal(c.inputs.electricityPerKwh, 0.166); assert.equal(c.inputs.kwhPerPostDay, 325);
  assert.ok(c.notes.some(function (n) { return /indicative figure for OK/.test(n); }));
  var no = T.superchargerCase({ state: 'OK', availableKw: 240, startYear: 2027 });
  assert.equal(no.ok, false); assert.ok(/does not carry the 4-post minimum \(600 kW/.test(no.reason)); assert.equal(no.needKw, 600);
  assert.equal(T.superchargerCase({ availableKw: 800 }).ok, false);          /* no state: no price to use, said */
  assert.equal(T.superchargerCase({ state: 'OK' }).ok, false);               /* no power */
  assert.equal(T.sizePosts(100000).posts, T.SIZING.maxPosts);
});

/* ── A: the library ─────────────────────────────────────────────────────── */
test('A01 power: a limit less a peak is MEASURED; a transformer is kVA × 0.8; the lower limit binds', function () {
  var p = A.powerOf({ serviceCapacityKw: 800, existingPeakKw: 350 });
  assert.equal(p.availableKw, 450); assert.equal(p.basis, 'measured'); assert.equal(p.grade, 'A'); assert.ok(/800 kW service, 350 kW peak, so 450 kW free/.test(p.words));
  var t = A.powerOf({ transformerKva: 500, serviceCapacityKw: 800, existingPeakKw: 100 });
  assert.equal(t.limitKw, 400); assert.equal(t.availableKw, 300); assert.equal(t.transformerKva, 500); assert.ok(/500 kVA transformer × 0.8/.test(t.words));
  assert.ok(!t.verify.some(function (v) { return v.key === 'power-kva'; }));
  assert.equal(A.powerOf({ serviceCapacityKw: 300, existingPeakKw: 500 }).availableKw, 0);
});
test('A02 power: no peak on file is a CEILING, said, with the verification that firms it; an unresolved reported peak is not subtracted; nothing on file is nothing', function () {
  var p = A.powerOf({ transformerKva: 750 });
  assert.equal(p.availableKw, 600); assert.equal(p.basis, 'ceiling'); assert.equal(p.grade, 'C'); assert.ok(/ceiling, not free capacity/.test(p.words));
  assert.ok(p.verify.some(function (v) { return v.key === 'power-peak'; }));
  var u = A.powerOf({ serviceCapacityKw: 500, reportedPeakKw: 200, peakUnresolved: true });
  assert.equal(u.basis, 'ceiling'); assert.equal(u.availableKw, 500); assert.ok(u.flags.some(function (f) { return /unresolved/.test(f); }));
  assert.equal(A.powerOf({ serviceCapacityKw: 500, reportedPeakKw: 200 }).availableKw, 300);
  var n = A.powerOf({}); assert.equal(n.availableKw, null); assert.equal(n.grade, 'D'); assert.ok(n.verify.some(function (v) { return v.key === 'power-limit'; }) && n.verify.some(function (v) { return v.key === 'power-kva'; }));
  var e = A.powerOf({ availablePowerMw: 1.2, serviceCapacityKw: 1000 }); assert.equal(e.availableKw, 1200); assert.equal(e.basis, 'entered'); assert.ok(e.flags.some(function (f) { return /more than the limit/.test(f); }));
});
test('A03 power: the utility’s published hosting figure rides beside the site’s own and flags a size above it; the substation and the utility are the screen’s', function () {
  var p = A.powerOf({ serviceCapacityKw: 1500 }, { hosting: { coverage: 'read', loadKw: 900, circuit: 'F0297' }, power: { substation: 'Bondurant', kv: 69, distanceMi: 1.4 }, utility: { name: 'MidAmerican Energy' } });
  assert.equal(p.hosting.loadKw, 900); assert.ok(p.flags.some(function (f) { return /published load hosting figure \(900 kW, F0297\)/.test(f); }));
  assert.equal(p.substation.name, 'Bondurant'); assert.equal(p.utility, 'MidAmerican Energy'); assert.equal(p.availableKw, 1500);
});
test('A04 compute: the shelf is 75, 150, 350, 500 and 750 kW and 1 MW of IT at the meter; ONE right-sized pod a site, never a row of small ones; only the 1 MW Micro pod repeats; the chiller’s share of the meter load and the pad are said', function () {
  var cfg = A.configOf(null);
  assert.deepStrictEqual(A.MODULARS.map(function (m) { return m.itKw; }), [75, 150, 350, 500, 750, 1000]);
  var c = A.computeOf({ availableKw: 1500, basis: 'measured' }, cfg, {});
  assert.deepStrictEqual(c.shelf.map(function (s) { return s.meterKw; }), [90, 180, 420, 600, 900, 1200]);
  /* beside the pod: a battery on what it leaves (the same battery engine on the kW left), so the pod and that battery are a pair that fits */
  var pr = A.assess({ address: { state: 'OK', zip: '74834' }, transformerKva: 500 }, { now: NOW });
  assert.equal(pr.pairing.leftKw, 220); assert.equal(pr.pairing.bess.kw, 220); assert.equal(pr.pairing.bess.kwh, 880); near(pr.pairing.bess.irrPct, B.bessCase({ powerKw: 220, state: 'OK' }).returns.irrPct); assert.equal(pr.bess.sizing.kw, 400);
  assert.ok(/Beside the 150 kW Nano pod, the 220 kW it leaves carries a 220 kW \/ 880 kWh battery/.test(pr.pairing.words));
  assert.equal(A.assess({ state: 'OK', transformerKva: 750 }, { now: NOW }).pairing, null);            /* a 500 kW pod uses all 600 kW */
  assert.equal(A.assess({ state: 'OK', serviceCapacityKw: 100 }, { now: NOW }).pairing, null);         /* 10 kW left: nothing worth a pad */
  /* submitted for funding as compute + battery, that pair is one amount */
  var pcfg = A.configOf({ portfolioAssessment: { funding: { mode: 'committee', members: [{ name: 'B', email: 'b@x.co' }] } } });
  var pq = A.fundingRequest(pr, ['bess', 'compute']); assert.equal(pq.paired, true); assert.equal(pq.amountUsd, Math.round(pr.compute.economics.capexUsd + pr.pairing.bess.capexUsd)); assert.ok(/on the 220 kW the pod leaves/.test(pq.lines[1].size)); assert.ok(/one amount/.test(pq.words));
  assert.equal(A.fundingRequest(pr, ['bess']).amountUsd, pr.bess.capex.total); assert.equal(A.fundingRequest(pr, ['compute', 'bess', 'supercharger'].slice(0, 2).concat([])).paired, true); assert.ok(pcfg.funding);
  /* 400 kW was four 75 kW skids; it is one 150 kW pod (a 350 needs 420 kW at the meter), with 220 kW left */
  var four = A.computeOf({ availableKw: 400, basis: 'ceiling' }, cfg, {}); assert.equal(four.chosen.key, 'm150'); assert.equal(four.chosen.units, 1); assert.equal(four.chosen.leftKw, 220);
  assert.equal(four.chosen.coolingKw, 30); assert.ok(/30 kW of the 180 kW at the meter is the chiller, pumps and losses/.test(four.cooling.words)); assert.ok(/One pod and its chiller.*not on file/.test(four.space.words));
  assert.deepStrictEqual([90, 180, 420, 600, 800, 900, 1200].map(function (kw) { return A.computeOf({ availableKw: kw, basis: 'measured' }, cfg, {}).chosen.key; }), ['m75', 'm150', 'm350', 'm500', 'm500', 'm750', 'm1000']);
  assert.ok(c.shelf.every(function (u) { return u.units <= 1; }));
  var big = A.computeOf({ availableKw: 3700, basis: 'measured' }, cfg, {}); assert.equal(big.chosen.key, 'm1000'); assert.equal(big.chosen.units, 3); assert.equal(big.chosen.leftKw, 100); assert.ok(/3 pods, each with its own chiller/.test(big.space.words));
  assert.equal(c.chosen.key, 'm1000'); assert.equal(c.chosen.units, 1); assert.equal(c.chosen.leftKw, 300); assert.ok(c.economics.ok && c.economics.gpus > 0 && c.economics.capexUsd > 0);
  assert.ok(c.economics.irrPct != null && /public spot reference/.test(c.economics.irrBasis)); assert.ok(c.economics.notes.some(function (n) { return /screening figure/.test(n); }));
  assert.equal(A.computeOf({ availableKw: 300, basis: 'ceiling' }, cfg, {}).chosen.units, 1); assert.equal(A.computeOf({ availableKw: 300, basis: 'ceiling' }, cfg, {}).chosen.key, 'm150');
  assert.equal(A.computeOf({ availableKw: 5000, basis: 'measured' }, cfg, {}).chosen.units, 4);
  var small = A.computeOf({ availableKw: 60, basis: 'measured' }, cfg, {}); assert.equal(small.fits, false); assert.equal(small.needKw, 90); assert.ok(/does not carry the smallest unit/.test(small.words));
  assert.equal(A.computeOf({ availableKw: null }, cfg, {}).fits, false);
  /* the engine's notes naming a partner never reach this answer */
  assert.ok(!/Lightsmith/.test(JSON.stringify(c)));
});
test('A05 the assessment: three ALTERNATIVE uses on the same free power, the recommendation, the grade, and nothing sized on nothing', function () {
  var a = A.assess({ name: 'Yard', state: 'OK', serviceCapacityKw: 1500, existingPeakKw: 300 }, { now: NOW });
  assert.equal(a.power.availableKw, 1200); assert.equal(a.confidence.grade, 'A');
  assert.equal(a.compute.chosen.key, 'm1000'); assert.equal(a.bess.sizing.kw, 1200); assert.equal(a.bess.sizing.kwh, 4800); assert.equal(a.supercharger.sizing.posts, 8);
  assert.equal(a.supercharger.inputs.startYear, 2027);
  assert.deepStrictEqual(a.recommend.fits.map(function (f) { return f.use; }), ['compute', 'bess', 'supercharger']); assert.ok(a.recommend.best);
  assert.ok(/alternatives, not a stack/.test(a.note));
  var none = A.assess({ name: 'Nothing', state: 'OK' }, { now: NOW });
  assert.equal(none.compute.fits, false); assert.equal(none.bess.ok, false); assert.equal(none.supercharger.ok, false); assert.equal(none.recommend.fits.length, 0); assert.equal(none.confidence.grade, 'D');
  var small = A.assess({ state: 'OK', transformerKva: 300 }, { now: NOW });
  assert.equal(small.power.availableKw, 240); assert.equal(small.compute.chosen.units, 1); assert.equal(small.compute.chosen.key, 'm150'); assert.equal(small.supercharger.ok, false); assert.ok(small.bess.ok);
});
test('A06 readiness: forty-nine items in eight sections; public data and imported facts only SCREEN an item, a person’s mark makes it done, and the score counts done alone', function () {
  assert.equal(A.CHECKLIST.length, 8); assert.equal(A.ITEM_KEYS.length, 49);
  var site = { state: 'OK', serviceCapacityKw: 1500, existingPeakKw: 300, termYearsRemaining: 7.3 };
  var screen = { complete: true, at: NOW, located: { usable: true }, power: { substation: 'Enid North', kv: 69, distanceMi: 2.1 }, utility: { name: 'OG&E' },
    fiber: { carriersRead: true, carriers: ['Cox', 'AT&T'], symmetric1g: true, carrierHotel: 'OKC IX', carrierHotelMi: 80 }, hosting: { coverage: 'none' } };
  var parcel = { ok: true, zoning: 'C-2', acres: 2.31, county: 'Garfield', owner: 'Yard LLC', at: NOW };
  var a = A.assess(site, { screen: screen, parcel: parcel, now: NOW }), R = a.readiness;
  function item(k) { var hit; R.sections.forEach(function (s) { s.items.forEach(function (i) { if (i.key === k) hit = i; }); }); return hit; }
  assert.equal(R.total, 49); assert.equal(R.pct, 0); assert.equal(R.done, 0); assert.ok(R.screened >= 9, R.screened); assert.equal(R.label, 'Screened');
  assert.equal(item('zoning-designation').state, 'screened'); assert.ok(/Zoned C-2/.test(item('zoning-designation').words)); assert.equal(item('zoning-designation').source, 'Parcel record');
  assert.ok(/7.3 years left/.test(item('control-evidence').words)); assert.ok(/2 carriers/.test(item('conn-fiber').words)); assert.ok(/Enid North, 69 kV, 2.1 mi · OG&E/.test(item('power-evidence').words));
  assert.equal(item('env-flood').state, 'open'); assert.equal(item('power-capacity').state, 'screened');
  /* a mark: done counts, na leaves the count, the label moves */
  var b = A.assess(site, { screen: screen, parcel: parcel, now: NOW, marks: { 'zoning-designation': { state: 'done', note: 'Zoning letter on file', by: 'pat', at: NOW }, 'env-air': { state: 'na' } } });
  assert.equal(b.readiness.done, 1); assert.equal(b.readiness.applicable, 48); assert.equal(b.readiness.pct, 2); assert.equal(b.readiness.label, 'In diligence');
  /* a ceiling never screens the capacity item: it is a hint on an open item */
  var c = A.assess({ state: 'OK', serviceCapacityKw: 1500 }, { now: NOW }); var pc; c.readiness.sections.forEach(function (s) { s.items.forEach(function (i) { if (i.key === 'power-capacity') pc = i; }); });
  assert.equal(pc.state, 'open'); assert.ok(/ceiling only/i.test(pc.words));
});
test('A07 the verifications: power first, then the will-serve, control, zoning and fiber; an approximate address is named; a site not yet screened says so', function () {
  var a = A.assess({ state: 'OK', serviceCapacityKw: 1500 }, { now: NOW }), keys = a.verify.map(function (v) { return v.key; });
  assert.deepStrictEqual(keys.slice(0, 2), ['power-peak', 'power-kva']); assert.ok(keys.indexOf('will-serve') > 1 && keys.indexOf('screen') > 0);
  var b = A.assess({ state: 'OK', transformerKva: 500, existingPeakKw: 100 }, { now: NOW, screen: { complete: true, located: { usable: false, approximate: true }, utility: { name: 'OG&E' } } });
  assert.ok(b.verify.some(function (v) { return v.key === 'address'; })); assert.ok(b.verify.some(function (v) { return /OG&E/.test(v.label); })); assert.ok(!b.verify.some(function (v) { return v.key === 'screen' || v.key === 'power-peak' || v.key === 'power-kva'; }));
});
test('A08 the approval: one use or a hybrid, in a fixed order, its project kinds; an unknown use refused; none withdraws', function () {
  var d = A.decisionOf({ uses: ['supercharger', 'compute'], note: 'go' }, { by: 'pat', now: NOW });
  assert.equal(d.status, 'approved'); assert.deepStrictEqual(d.uses, ['compute', 'supercharger']); assert.equal(d.label, 'Compute + Fast charging'); assert.deepStrictEqual(d.scopes, ['compute', 'dcfc']); assert.equal(d.hybrid, true);
  assert.equal(A.decisionOf({ uses: 'bess' }).label, 'Battery storage'); assert.equal(A.decisionOf({ uses: [] }).status, 'withdrawn');
  assert.throws(function () { A.decisionOf({ uses: ['solar'] }); }, /not compute, bess or supercharger/);
});
test('A09 the list row: the answer without its yearly tables or the checklist’s items, stale when a fact it rests on changes', function () {
  var site = { state: 'OK', serviceCapacityKw: 1500 }, stored = { result: A.assess(site, { now: NOW }), by: 'pat' };
  var row = A.listView(stored, site, {});
  assert.equal(row.stale, false); assert.ok(!row.bess.projections && !row.supercharger.projections && !row.readiness.sections[0].items); assert.equal(row.readiness.sections.length, 8);
  assert.ok(JSON.stringify(row).length < 12000, JSON.stringify(row).length);
  assert.equal(A.listView(stored, { state: 'OK', serviceCapacityKw: 1500, existingPeakKw: 400 }, {}).stale, true);
  assert.equal(A.listView(null, site, {}), null); assert.equal(A.listView({}, site, {}), null);
  assert.equal(A.listView({ decision: A.decisionOf({ uses: ['bess'] }) }, site, {}).decision.label, 'Battery storage');
});

test('A10 compute: under 1 MW is a Nano pod and 1 MW and up a Micro pod; electricity is the site’s own price, else the rate book for its ZIP, else its state; a site nothing places says the engine’s default', function () {
  assert.equal(A.klassOf(75).key, 'nano'); assert.equal(A.klassOf(350).label, 'Nano pod'); assert.equal(A.klassOf(1000).key, 'micro'); assert.equal(A.klassOf(1770).label, 'Micro pod');
  var r = A.assess({ address: { state: 'OK', zip: '74834' }, transformerKva: 1500 }, { now: NOW }), c = r.compute, e = c.economics;
  assert.equal(c.chosen.klass, 'micro'); assert.equal(c.chosen.klassLabel, 'Micro pod'); assert.deepStrictEqual(c.shelf.map(function (u) { return u.klass; }), ['nano', 'nano', 'nano', 'nano', 'nano', 'micro']);
  assert.equal(e.basis, 'spot'); assert.equal(e.electricity.source, 'zip'); near(e.electricity.perKwh, 0.0805, 0.00001); assert.ok(/OG&E/.test(e.electricity.utility));
  near(e.irrPct, 55.19); assert.equal(e.paybackMonths, 26); assert.ok(e.notes.some(function (n) { return /planning rates for ZIP 74834/.test(n); }));
  var own = A.rateOf({ state: 'OK', powerPricePerKwh: 0.11 }); assert.equal(own.source, 'site'); assert.equal(own.perKwh, 0.11);
  assert.equal(A.rateOf({ state: 'OK' }).source, 'state'); assert.equal(A.rateOf({}), null);
  var none = A.assess({ serviceCapacityKw: 1500 }, { now: NOW }).compute.economics; assert.equal(none.electricity.source, 'default'); assert.ok(none.notes.some(function (n) { return /engine’s default/.test(n); }));
  /* a dearer ZIP returns less than a cheaper one on the same unit */
  var ca = A.assess({ address: { state: 'CA', zip: '94105' }, serviceCapacityKw: 1500 }, { now: NOW }).compute.economics; assert.ok(ca.electricity.perKwh > e.electricity.perKwh && ca.irrPct < e.irrPct, ca.irrPct + ' vs ' + e.irrPct);
});
test('A11 the compute pro forma on the offtake partner’s stated figures: $35M and about $26M a year for 1 MW, the utility at THIS site’s rate with the partner’s $4M case beside it, through the one contract engine; only where the workspace asks for it', function () {
  var cfg = A.configOf({ portfolioAssessment: { compute: { basis: 'partner' } } }), site = { address: { state: 'OK', zip: '74834' }, transformerKva: 1500 };
  var e = A.assess(site, { now: NOW, config: cfg }).compute.economics, pf = e.proforma;
  assert.equal(e.basis, 'partner'); assert.equal(e.priceBasis, 'partner ref'); assert.equal(e.capexUsd, 35000000); assert.equal(e.gpus, 504); assert.equal(e.chipset.key, 'gb200');
  assert.equal(pf.partner, 'Lightsmith Energy'); assert.equal(pf.verified, false); assert.equal(pf.revenuePerYear, 26000000); assert.equal(pf.partnerFeePerYear, 2600000); assert.equal(pf.utilityBasis, 'site');
  near(pf.utilityPerYear, 840634, 1); near(e.irrPct, 70.71); assert.equal(e.paybackMonths, 22);
  near(pf.asStated.utilityPerYear, 4054706, 1); near(pf.asStated.irrPct, 54.03); assert.equal(pf.asStated.paybackMonths, 26);     /* their own case sits inside the 25–55% and ~2 years they stated */
  near(pf.ebitdaPerYear, pf.revenuePerYear - pf.partnerFeePerYear - pf.utilityPerYear - pf.otherOperatingPerYear, 2);   /* each line is rounded to the dollar */
  assert.ok(e.notes.some(function (n) { return /as stated and unverified/.test(n); }) && e.notes.some(function (n) { return /not a contract: the offtake/.test(n); }) && e.notes.some(function (n) { return /Ask what it covers/.test(n); }));
  /* a Nano pod is that reference scaled by its IT load, and says so; the 75 kW skid stays the skid */
  var nano = A.assess({ address: { state: 'OK', zip: '74834' }, transformerKva: 750 }, { now: NOW, config: cfg }).compute; assert.equal(nano.chosen.key, 'm500'); assert.equal(nano.economics.capexUsd, 17500000); assert.equal(nano.economics.proforma.revenuePerYear, 13000000); assert.ok(nano.economics.notes.some(function (n) { return /scaled by its IT load/.test(n); }));
  assert.equal(A.assess({ address: { state: 'OK' }, serviceCapacityKw: 100 }, { now: NOW, config: cfg }).compute.economics.basis, 'spot');
  /* no rate on file: the partner's own utility figure is the case, said */
  var nr = A.assess({ serviceCapacityKw: 1500 }, { now: NOW, config: cfg }).compute.economics; assert.equal(nr.proforma.utilityBasis, 'stated'); near(nr.irrPct, 54.03);
  /* the workspace's own figures replace the stated ones; without the setting nothing prices on the partner */
  var own = A.configOf({ portfolioAssessment: { compute: { basis: 'partner', reference: { revenueUsdPerMwYear: 20000000 } } } });
  var o = A.assess(site, { now: NOW, config: own }).compute.economics; assert.equal(o.proforma.revenuePerYear, 20000000); assert.ok(o.irrPct < e.irrPct); assert.ok(o.notes.some(function (n) { return /1 of those figures are this workspace’s own/.test(n); }));
  assert.equal(A.assess(site, { now: NOW }).compute.economics.basis, 'spot'); assert.equal(A.configOf({ portfolioAssessment: { compute: { basis: 'anything' } } }).compute.basis, null);
});
test('A12 a utility-side upgrade request: the power asked for (a shelf unit’s, or a figure) more than the site has, who asks, where it stands; it sizes nothing today and says what it would carry; granted, declined and withdrawn are marks', function () {
  var ctx = { by: 'pat', now: NOW, limitKw: 600, partner: 'Francis Energy' }, up = A.upgradeOf(null, { unit: 'm1000', note: 'for the Micro pod' }, ctx);
  assert.equal(up.status, 'requested'); assert.equal(up.targetKw, 1200); assert.equal(up.unit, 'm1000'); assert.equal(up.askedBy, 'Francis Energy'); assert.equal(up.requestedBy, 'pat'); assert.equal(up.history.length, 1);
  assert.equal(A.upgradeOf(null, { targetKw: 2000, askedBy: 'the host' }, ctx).askedBy, 'the host');
  assert.throws(function () { A.upgradeOf(null, { targetKw: 500 }, ctx); }, /already has 600 kW on file/); assert.throws(function () { A.upgradeOf(null, {}, ctx); }, /how much power/); assert.throws(function () { A.upgradeOf(null, { unit: 'm9' }, ctx); }, /not a unit/);
  assert.throws(function () { A.upgradeOf(null, { status: 'granted' }, ctx); }, /no upgrade request/); assert.throws(function () { A.upgradeOf(up, { status: 'maybe' }, ctx); }, /requested, granted, declined or withdrawn/);
  var site = { address: { state: 'OK', zip: '74834' }, transformerKva: 750, portfolioPartner: 'Francis Energy' }, r = A.assess(site, { now: NOW, upgrade: up });
  assert.equal(r.power.availableKw, 600); assert.equal(r.compute.chosen.key, 'm500');                         /* today's size is today's power */
  assert.equal(r.upgrade.status, 'requested'); assert.equal(r.upgrade.addKw, 600); assert.equal(r.upgrade.compute.label, '1 MW'); assert.equal(r.upgrade.compute.klass, 'micro'); assert.ok(r.upgrade.compute.irrPct > 0);
  assert.ok(/Nothing is sized on it until the utility grants it/.test(r.upgrade.words)); assert.equal(r.verify[0].key, 'upgrade');
  var item = null; r.readiness.sections.forEach(function (s) { s.items.forEach(function (i) { if (i.key === 'power-interconnection') item = i; }); }); assert.equal(item.state, 'screened'); assert.ok(/upgrade to 1,200 kW is requested through Francis Energy/.test(item.words));
  var gr = A.upgradeOf(up, { status: 'granted' }, { by: 'ann', now: NOW }); assert.equal(gr.status, 'granted'); assert.equal(gr.targetKw, 1200); assert.equal(gr.requestedBy, 'pat'); assert.equal(gr.history.length, 2);
  var rg = A.assess(site, { now: NOW, upgrade: gr }); assert.equal(rg.power.availableKw, 600); assert.ok(/Record the new service/.test(rg.upgrade.words)); assert.equal(rg.verify[0].key, 'upgrade-record');
  var wd = A.upgradeOf(gr, { status: 'withdrawn' }, ctx); assert.equal(A.assess(site, { now: NOW, upgrade: wd }).upgrade, null); assert.equal(wd.history.length, 3);
  /* THE UPGRADE TO ASK FOR is derived for every sized site under 1 MW, and is never a mark: what 1 MW is short by, what the next size up needs, the compute that would follow */
  var adv = A.assess({ address: { state: 'OK', zip: '74834' }, transformerKva: 500 }, { now: NOW }).upgradeAdvice;          /* 400 kW: one 150 kW pod today */
  assert.equal(adv.unit, 'm1000'); assert.equal(adv.needKw, 1200); assert.equal(adv.shortKw, 800); assert.equal(adv.targetKw, 1200); assert.equal(adv.next.unit, 'm350'); assert.equal(adv.next.shortKw, 20); assert.ok(adv.compute.irrPct > 0);
  assert.ok(/400 kW carries a 150 kW Nano pod today.*800 kW more.*20 kW more would already carry a 350 kW Nano pod.*Nothing has been asked of the utility yet/.test(adv.words));
  var peaky = A.assess({ state: 'OK', transformerKva: 750, existingPeakKw: 150 }, { now: NOW }).upgradeAdvice; assert.equal(peaky.shortKw, 750); assert.equal(peaky.targetKw, 1350);   /* the site's own load is on the same service */
  assert.equal(A.assess({ state: 'OK', transformerKva: 1500 }, { now: NOW }).upgradeAdvice, null);          /* it carries the Micro pod */
  assert.equal(A.assess({ state: 'OK' }, { now: NOW }).upgradeAdvice, null);                               /* not sized: its power first */
  assert.equal(r.upgradeAdvice, null); assert.equal(A.assess(site, { now: NOW, upgrade: wd }).upgradeAdvice.shortKw, 600);   /* a mark replaces the advice; withdrawn, it is back */
  assert.equal(A.upgradeOf(null, { unit: 'm1000' }, { limitKw: 600, availableKw: 450 }).targetKw, 1350);
  /* the row is stale when the mark changes, and carries it */
  var stored = { result: r, upgrade: up }; assert.equal(A.listView(stored, site, {}).stale, false); assert.equal(A.listView(stored, site, {}).upgrade.targetKw, 1200); assert.equal(A.listView({ result: r, upgrade: gr }, site, {}).stale, true);
});
test('A13 the funding list: only where the workspace names a committee; screened first, submitted with what it is for and the figure off the assessment, decided by a member of the committee alone; a decline says why', function () {
  var cfg = A.configOf({ portfolioAssessment: { funding: { mode: 'committee', name: 'Finance committee', members: [{ name: 'Barry D', email: 'Barry@acme-sites.com' }, { name: 'Eli N', email: 'eli@acme-sites.com' }, { email: 'not an address' }, { name: 'Twice', email: 'eli@acme-sites.com' }] } } });
  assert.equal(cfg.funding.members.length, 2); assert.equal(cfg.funding.members[0].email, 'barry@acme-sites.com'); assert.equal(A.configOf({ portfolioAssessment: { funding: { mode: 'committee', members: [] } } }).funding, null); assert.equal(A.configOf({}).funding, null);
  assert.deepStrictEqual(A.fundingInfo(cfg, 'pat@acme-sites.com'), { mode: 'committee', name: 'Finance committee', members: ['Barry D', 'Eli N'], canDecide: false }); assert.equal(A.fundingInfo(cfg, 'ELI@acme-sites.com').canDecide, true); assert.equal(A.fundingInfo(A.configOf({}), 'x'), null);
  var res = A.assess({ address: { state: 'OK', zip: '74834' }, transformerKva: 1500 }, { now: NOW }), base = { by: 'pat@acme-sites.com', now: NOW, config: cfg, result: res, screened: true };
  assert.throws(function () { A.fundingChange(null, 'submit', { uses: ['compute'] }, { config: A.configOf({}), result: res, screened: true }); }, /no funding list/);
  assert.throws(function () { A.fundingChange(null, 'submit', { uses: ['compute'] }, Object.assign({}, base, { screened: false })); }, /Screen the site first/);
  assert.throws(function () { A.fundingChange(null, 'submit', { uses: ['compute'] }, Object.assign({}, base, { result: null })); }, /Run the assessment first/);
  assert.throws(function () { A.fundingChange(null, 'submit', { uses: [] }, base); }, /what the funding is for/); assert.throws(function () { A.fundingChange(null, 'submit', { uses: ['solar'] }, base); }, /not compute, bess or supercharger/);
  assert.throws(function () { A.fundingChange(null, 'submit', { uses: ['bess'] }, Object.assign({}, base, { canEdit: false })); }, /not submit/);
  var f = A.fundingChange(null, 'submit', { uses: ['compute'], note: 'first batch' }, base);
  assert.equal(f.status, 'submitted'); assert.equal(f.amountUsd, res.compute.economics.capexUsd); assert.equal(f.lines[0].size, '1 MW Micro pod'); assert.equal(f.submittedBy, 'pat@acme-sites.com'); assert.equal(f.decision, null);
  var hy = A.fundingChange(null, 'submit', { uses: ['supercharger', 'bess'] }, base); assert.equal(hy.amountUsd, null); assert.equal(hy.label, 'Battery storage + Fast charging'); assert.equal(hy.lines.length, 2); assert.ok(/no single amount/.test(hy.words));
  var small = A.assess({ state: 'OK', serviceCapacityKw: 100 }, { now: NOW }); assert.throws(function () { A.fundingChange(null, 'submit', { uses: ['supercharger'] }, Object.assign({}, base, { result: small })); }, /Fast charging does not fit/);
  assert.throws(function () { A.fundingChange(f, 'decide', { decision: 'approved' }, base); }, function (e) { return e.status === 403 && /decided by Finance committee \(Barry D, Eli N\)/.test(e.message); });
  var eli = Object.assign({}, base, { by: 'eli@acme-sites.com' });
  assert.throws(function () { A.fundingChange(f, 'decide', { decision: 'declined' }, eli); }, /Say why/); assert.throws(function () { A.fundingChange(f, 'decide', { decision: 'maybe' }, eli); }, /approved or declined/); assert.throws(function () { A.fundingChange(null, 'decide', { decision: 'approved' }, eli); }, /not been submitted/);
  var ok = A.fundingChange(f, 'decide', { decision: 'approved', note: 'go' }, eli); assert.equal(ok.status, 'approved'); assert.equal(ok.decision.name, 'Eli N'); assert.equal(ok.decision.by, 'eli@acme-sites.com'); assert.equal(ok.history.length, 2);
  assert.throws(function () { A.fundingChange(ok, 'submit', { uses: ['compute'] }, base); }, /already approved/); assert.throws(function () { A.fundingChange(ok, 'withdraw', {}, base); }, /committee has decided/);
  var no = A.fundingChange(ok, 'decide', { decision: 'declined', note: 'power is a ceiling' }, eli); assert.equal(no.status, 'declined'); assert.equal(A.fundingChange(no, 'submit', { uses: ['compute'] }, base).status, 'submitted');
  assert.equal(A.fundingChange(f, 'withdraw', {}, base).status, 'withdrawn'); assert.equal(A.fundingView(A.fundingChange(f, 'withdraw', {}, base)), null);
  var v = A.fundingView(ok); assert.equal(v.status, 'approved'); assert.equal(v.decision.name, 'Eli N'); assert.ok(!('history' in v));
  assert.equal(A.listView({ result: res, funding: ok }, { address: { state: 'OK', zip: '74834' }, transformerKva: 1500 }, {}).funding.status, 'approved');
});

test('A14 the workspace’s own gates, read off the record in its order: power against the transformer it prefers, the lease against the years it wants, the pathway picked, its hurdle and its committee, the checklist, its review; OPEN is never failed; no settings, no gates', function () {
  var cfg = A.configOf({ portfolioAssessment: { gates: { minKva: 500, minLeaseYears: 5, irrHurdlePct: 25 }, review: { members: [{ name: 'Barry', email: 'barry@x.co' }, { name: 'Eli', email: 'eli@x.co' }, { name: 'Tom', email: 'tom@x.co' }, { name: 'Seth', email: 'seth@x.co' }] },
    funding: { mode: 'committee', members: [{ name: 'Barry', email: 'barry@x.co' }, { name: 'Eli', email: 'eli@x.co' }] } } });
  assert.deepStrictEqual(cfg.gates, { minKva: 500, minLeaseYears: 5, irrHurdlePct: 25 }); assert.equal(cfg.review.name, 'Executive Review'); assert.equal(cfg.review.members.length, 4);
  assert.equal(A.configOf({}).gates, null); assert.equal(A.configOf({}).review, null); assert.equal(A.configOf({ portfolioAssessment: { gates: { minKva: -1 } } }).gates, null);
  function gate(g, k) { return g.list.filter(function (x) { return x.key === k; })[0]; }
  var small = { address: { state: 'OK', zip: '74834' }, transformerKva: 300, termYearsRemaining: 2.6 }, rs = A.assess(small, { now: NOW, config: cfg }), g = A.gatesOf(small, rs, cfg, {});
  assert.deepStrictEqual(g.list.map(function (x) { return x.key; }), ['G0', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6']);
  assert.equal(gate(g, 'G1').state, 'fail'); assert.ok(/300 kVA: under the 500 kVA preferred/.test(gate(g, 'G1').words)); assert.equal(gate(g, 'G2').state, 'fail'); assert.ok(/2\.6 years left: under the 5 years wanted/.test(gate(g, 'G2').words));
  assert.equal(g.screen, 'fail'); assert.deepStrictEqual(g.failed, ['G1', 'G2']); assert.equal(gate(g, 'G3').state, 'open'); assert.equal(gate(g, 'G5').state, 'open'); assert.equal(gate(g, 'G6').state, 'open'); assert.ok(/waiting on Barry, Eli, Tom, Seth/.test(gate(g, 'G6').words));
  /* a site that passes the screen; nothing on file is OPEN, never failed */
  var good = { address: { state: 'OK', zip: '74834' }, transformerKva: 1000, termYearsRemaining: 7.7 }, rg = A.assess(good, { now: NOW, config: cfg }), gg = A.gatesOf(good, rg, cfg, {});
  assert.equal(gate(gg, 'G1').state, 'pass'); assert.equal(gate(gg, 'G2').state, 'pass'); assert.equal(gg.screen, 'pass');
  var blank = { state: 'OK' }, gb = A.gatesOf(blank, A.assess(blank, { now: NOW, config: cfg }), cfg, {}); assert.equal(gate(gb, 'G1').state, 'open'); assert.equal(gate(gb, 'G2').state, 'open'); assert.equal(gb.screen, 'open'); assert.deepStrictEqual(gb.failed, []);
  var svc = { state: 'OK', serviceCapacityKw: 400, termYearsRemaining: 6 }; assert.equal(gate(A.gatesOf(svc, A.assess(svc, { now: NOW, config: cfg }), cfg, {}), 'G1').state, 'pass');   /* 400 kW of service is 500 kVA at the continuous rating */
  /* G3 and G4 follow the pathway and the committee */
  var fd = A.fundingChange(null, 'submit', { uses: ['bess'] }, { by: 'pat@x.co', now: NOW, config: cfg, result: rg, screened: true }), g3 = A.gatesOf(good, rg, cfg, { funding: fd });
  assert.equal(gate(g3, 'G3').state, 'pass'); assert.equal(gate(g3, 'G4').state, 'fail'); assert.ok(/is under the 25% hurdle; with finance committee/.test(gate(g3, 'G4').words));     /* the battery's screening return is under 25% */
  var fc = A.fundingChange(null, 'submit', { uses: ['compute'] }, { by: 'pat@x.co', now: NOW, config: cfg, result: rg, screened: true });
  assert.equal(gate(A.gatesOf(good, rg, cfg, { funding: fc }), 'G4').state, 'open');                                                                                               /* clears the hurdle, waiting on the committee */
  var ok = A.fundingChange(fc, 'decide', { decision: 'approved' }, { by: 'eli@x.co', now: NOW, config: cfg }); assert.equal(gate(A.gatesOf(good, rg, cfg, { funding: ok }), 'G4').state, 'pass');
  var no = A.fundingChange(fc, 'decide', { decision: 'declined', note: 'not this one' }, { by: 'eli@x.co', now: NOW, config: cfg }); assert.equal(gate(A.gatesOf(good, rg, cfg, { funding: no }), 'G4').state, 'fail');
  var noHurdle = A.configOf({ portfolioAssessment: { gates: { minKva: 500 } } }), gn = A.gatesOf(good, rg, noHurdle, {}); assert.deepStrictEqual(gn.list.map(function (x) { return x.key; }), ['G0', 'G1', 'G3', 'G5']);
  /* G5: every applicable item with evidence */
  var marks = {}; A.ITEM_KEYS.forEach(function (k) { marks[k] = { state: 'done' }; }); assert.equal(gate(A.gatesOf(good, A.assess(good, { now: NOW, config: cfg, marks: marks }), cfg, {}), 'G5').state, 'pass');
  /* THE REVIEW: a member's vote; the decision is EVERY member's, the same way; anybody else is refused */
  var ctx = { now: NOW, config: cfg }, rv = A.reviewChange(null, { vote: 'own', note: 'keep it' }, Object.assign({ by: 'Tom@x.co' }, ctx));
  var v1 = A.reviewView(rv, cfg); assert.equal(v1.outcome, null); assert.equal(v1.cast, 1); assert.deepStrictEqual(v1.waiting, ['Barry', 'Eli', 'Seth']);
  ['barry@x.co', 'eli@x.co', 'seth@x.co'].forEach(function (e) { rv = A.reviewChange(rv, { vote: 'own' }, Object.assign({ by: e }, ctx)); });
  var v4 = A.reviewView(rv, cfg); assert.equal(v4.outcome, 'own'); assert.equal(v4.outcomeLabel, 'Own and operate'); assert.ok(/all 4 agreed/.test(v4.words)); assert.equal(gate(A.gatesOf(good, rg, cfg, { review: rv }), 'G6').state, 'pass');
  rv = A.reviewChange(rv, { vote: 'flip' }, Object.assign({ by: 'seth@x.co' }, ctx)); var vs = A.reviewView(rv, cfg); assert.equal(vs.outcome, null); assert.equal(vs.split, true); assert.ok(/split/.test(vs.words));
  rv = A.reviewChange(rv, { vote: 'clear' }, Object.assign({ by: 'seth@x.co' }, ctx)); assert.deepStrictEqual(A.reviewView(rv, cfg).waiting, ['Seth']); assert.equal(rv.history.length, 6);
  assert.throws(function () { A.reviewChange(rv, { vote: 'own' }, Object.assign({ by: 'pat@x.co' }, ctx)); }, function (e) { return e.status === 403 && /Executive Review is Barry, Eli, Tom, Seth\. Only they vote/.test(e.message); });
  assert.throws(function () { A.reviewChange(rv, { vote: 'maybe' }, Object.assign({ by: 'tom@x.co' }, ctx)); }, /own .* or flip/); assert.throws(function () { A.reviewChange(null, { vote: 'own' }, { by: 'tom@x.co', config: A.configOf({}) }); }, /no review board/);
  assert.deepStrictEqual(A.reviewInfo(cfg, 'seth@x.co'), { name: 'Executive Review', members: ['Barry', 'Eli', 'Tom', 'Seth'], canVote: true, me: 'Seth' }); assert.equal(A.reviewInfo(cfg, 'pat@x.co').canVote, false); assert.equal(A.reviewInfo(A.configOf({}), 'x'), null);
  /* the row carries both; a workspace with neither setting carries neither */
  var row = A.listView({ result: rg, review: rv }, good, { config: cfg }); assert.equal(row.gates.of, 7); assert.equal(row.review.cast, 3);
  assert.equal(A.listView({ result: rg }, good, {}).gates, null); assert.equal(A.listView({ result: rg }, good, {}).review, null); assert.equal(A.gatesOf(good, rg, A.configOf({}), {}), null);
});

test('A15 closing a site: purchased from the partner, the host agreement assigned to us, a lease of the length the workspace needs; a shorter lease is recorded and said, never rounded up; site control closes when all three stand, and the lease gate reads the new lease', function () {
  var cfg = A.configOf({ portfolioAssessment: { gates: { minKva: 500, minLeaseYears: 5 }, closing: { minLeaseYears: 15, agreement: 'SHA' } } }), ctx = { by: 'pat', now: NOW, config: cfg };
  assert.deepStrictEqual(cfg.closing, { minLeaseYears: 15, agreement: 'SHA' }); assert.equal(A.configOf({}).closing, null); assert.equal(A.configOf({ portfolioAssessment: { closing: { minLeaseYears: 0 } } }).closing, null);
  var site = { address: { state: 'OK', zip: '74834' }, transformerKva: 500, termYearsRemaining: 7.3, portfolioPartner: 'Francis Energy' }, res = A.assess(site, { now: NOW, config: cfg });
  var v0 = A.closingView(null, cfg, site); assert.equal(v0.done, 0); assert.equal(v0.complete, false); assert.deepStrictEqual(v0.waiting, ['purchase', 'assignment', 'lease']);
  assert.equal(v0.steps[0].label, 'Purchased from Francis Energy'); assert.ok(/Francis Energy has to get it signed over/.test(v0.steps[1].words)); assert.ok(/7\.3 years are left on the agreement on file/.test(v0.steps[2].words));
  function gate(g, k) { return g.list.filter(function (x) { return x.key === k; })[0]; }
  var g0 = A.gatesOf(site, res, cfg, {}); assert.equal(gate(g0, 'G0').state, 'open'); assert.ok(/0 of 3 closing steps done/.test(gate(g0, 'G0').words)); assert.equal(gate(g0, 'G2').state, 'pass');      /* 7.3 years clears the 5-year screen */
  var c = A.closingChange(null, { step: 'purchase', note: 'batch one' }, ctx); c = A.closingChange(c, { step: 'assignment' }, ctx);
  assert.throws(function () { A.closingChange(c, { step: 'lease' }, ctx); }, /how many years the lease runs \(the workspace needs 15 or more\)/); assert.throws(function () { A.closingChange(c, { step: 'deed' }, ctx); }, /purchase, assignment or lease/);
  assert.throws(function () { A.closingChange(c, { step: 'purchase' }, Object.assign({}, ctx, { canEdit: false })); }, /not mark them/); assert.throws(function () { A.closingChange(null, { step: 'purchase' }, { config: A.configOf({}) }); }, /no closing steps/);
  c = A.closingChange(c, { step: 'lease', years: 10 }, ctx); var v10 = A.closingView(c, cfg, site);
  assert.equal(v10.done, 2); assert.equal(v10.complete, false); assert.equal(v10.steps[2].short, true); assert.ok(/a longer lease \(10 of 15 years\)/.test(v10.words)); assert.equal(gate(A.gatesOf(site, res, cfg, { closing: c }), 'G0').state, 'open');
  c = A.closingChange(c, { step: 'lease', years: 20 }, ctx); var v20 = A.closingView(c, cfg, site), g20 = A.gatesOf(site, res, cfg, { closing: c });
  assert.equal(v20.complete, true); assert.equal(v20.leaseYears, 20); assert.ok(/Closed: purchased, the SHA assigned, a 20-year lease in place/.test(v20.words)); assert.equal(gate(g20, 'G0').state, 'pass'); assert.ok(/20-year lease recorded at closing/.test(gate(g20, 'G2').words));
  var back = A.closingChange(c, { step: 'assignment', done: false }, ctx); assert.equal(A.closingView(back, cfg, site).complete, false); assert.equal(back.history.length, 5); assert.equal(back.purchase.note, 'batch one');
  assert.equal(A.listView({ result: res, closing: c }, site, { config: cfg }).closing.complete, true); assert.equal(A.listView({ result: res }, site, {}).closing, null);
  /* a workspace with only closing steps still has a site-control gate */
  var only = A.configOf({ portfolioAssessment: { closing: { minLeaseYears: 20 } } }); assert.deepStrictEqual(A.gatesOf(site, res, only, {}).list.map(function (x) { return x.key; }), ['G0', 'G3', 'G5']); assert.equal(only.closing.agreement, 'site host agreement');
});

/* ── D: the door ────────────────────────────────────────────────────────── */
function world(opts) {
  opts = opts || {};
  var db = new FD.DB(), calls = { atlas: 0, network: 0, hosting: 0, parcel: 0 };
  db.seed(O, { name: 'Acme Sites', status: 'active' });
  db.seed(O + '/billing/current', Object.assign({ tier: 'enterprise' }, opts.billing || {}));
  db.seed(O + '/sites/s1', { name: 'Williams Food', address: '1812 E 1st St', city: 'Chandler', state: 'OK', serviceCapacityKw: 1500, termYearsRemaining: 7.3, status: 'Operational', revision: 2, updatedAt: '2026-11-01T00:00:00.000Z', siteScopes: ['dcfc'] });
  db.seed(O + '/sites/s2', { name: 'OK Lawn & Pest', address: '426 S Main St', city: 'McAlester', state: 'OK', transformerKva: 150, existingPeakKw: 40, revision: 1 });
  db.seed(O + '/sites/s3', { name: 'No facts', city: 'Tulsa', state: 'OK', revision: 1 });
  var deps = { A: { httpError: httpError }, now: function () { return NOW; }, env: {},
    handlers: function () {
      return { atlas: function () { calls.atlas++; return Promise.resolve(opts.atlasDown ? { status: 502, body: { error: 'down' } } : { status: 200, body: { lat: 35.7, lng: -96.88, geocode: { precision: 'exact' }, substations: [{ name: 'Chandler', distanceKm: 3.2, voltageKv: 69 }], sources: { substations: 'HIFLD' } } }); },
        network: function () { calls.network++; return Promise.resolve({ status: 200, body: { fcc: { status: 'ok', providers: [{ name: 'Cox', down: 1000, up: 1000 }] }, facilities: { nearestMajor: { name: 'OKC IX', mi: 44 } }, fiber: { lateral: { mi: 1.2, to: 'OKC IX' } } } }); },
        hosting: function () { calls.hosting++; return Promise.resolve({ status: 200, body: { utility: { key: 'oge', display: 'OG&E' }, coverage: 'none' } }); },
        parcel: function (body) { calls.parcel++; calls.parcelBody = body; return Promise.resolve(opts.parcelMiss ? { status: 200, body: { ok: false, reason: 'no parcel record here' } } : { status: 200, body: { ok: true, ring: [[1, 2], [3, 4], [5, 6]], apn: '0001-22', owner: 'Williams Family LP', acres: 3.456, zoning: 'C-3', county: 'Lincoln', source: 'regrid' } }); } };
    } };
  var door = DOOR.make(deps), root = db.collection('omega_orgs').doc(ORG);
  function ctx(b, extra) { return Object.assign({ db: db, org: ORG, root: root, caller: PAT, by: PAT.email, b: b, site: b.site || null, canEdit: true, req: { headers: { authorization: 'Bearer t' } } }, extra || {}); }
  function audits(a) { var n = []; db.data.forEach(function (v, k) { if (k.indexOf('omega_audit/') === 0 && v.action === a) n.push(v); }); return n; }
  return { db: db, door: door, root: root, calls: calls, audits: audits, site: function (id) { return db.data.get(O + '/sites/' + id); }, post: function (b, extra) { return door.post(ctx(b, extra)); }, ctx: ctx };
}
test('D01 Run: every chosen site assessed from its facts, stored on the site, one audit row; the facts, the revision and updatedAt untouched; a viewer refused', async function () {
  var w = world(), r = await w.post({ action: 'assess-run', ids: ['s1', 's2', 's3', 'gone'] });
  assert.equal(r.ran, 3); assert.equal(r.sized, 2); assert.deepStrictEqual(r.missing, ['gone']); assert.ok(/3 sites assessed; 1 with no power figure/.test(r.note));
  var s1 = w.site('s1'), a = s1.assessment;
  assert.equal(a.result.power.availableKw, 1500); assert.equal(a.result.power.basis, 'ceiling'); assert.equal(a.result.compute.chosen.key, 'm1000'); assert.equal(a.result.supercharger.sizing.posts, 10); assert.equal(a.by, PAT.email); assert.equal(a.at, NOW);
  assert.equal(s1.revision, 2); assert.equal(s1.updatedAt, '2026-11-01T00:00:00.000Z'); assert.equal(s1.serviceCapacityKw, 1500);
  assert.equal(w.site('s2').assessment.result.power.availableKw, 80); assert.equal(w.site('s2').assessment.result.power.basis, 'measured'); assert.equal(w.site('s2').assessment.result.compute.fits, false);
  assert.equal(w.site('s3').assessment.result.power.availableKw, null);
  assert.equal(w.audits('sitecrm-assess-run').length, 1); assert.equal(w.audits('sitecrm-assess-run')[0].sites, 3);
  await rejects(w.post({ action: 'assess-run', ids: ['s1'] }, { canEdit: false }), 403, /read the assessment/);
  await rejects(w.post({ action: 'assess-run', ids: [] }), 400); var many = []; for (var i = 0; i <= DOOR.RUN_CAP; i++) many.push('x' + i); await rejects(w.post({ action: 'assess-run', ids: many }), 400, /At most 50/);
  assert.ok(DOOR.owns('assess-run') && DOOR.owns('assess-approve') && !DOOR.owns('site-save') && !DOOR.owns('diligence-gate'));
});
test('D02 the screens: a job, the Grid Atlas a phase, then the network and the parcel; what they find lands on the site and the assessment is run again on it', async function () {
  var w = world(), st = await w.post({ action: 'assess-screen-start', ids: ['s1'] });
  assert.equal(st.job.total, 1); assert.equal(st.job.status, 'paused'); assert.equal(st.job.kind, 'assess-screen');
  var a = await w.post({ action: 'assess-screen-step', jobId: st.job.id });
  assert.equal(a.phase, 'grid'); assert.equal(a.item.status, 'running'); assert.equal(w.calls.atlas, 1); assert.equal(w.calls.network, 0); assert.equal(w.site('s1').assessment, undefined);
  var b = await w.post({ action: 'assess-screen-step', jobId: st.job.id });
  assert.equal(b.job.status, 'complete'); assert.equal(b.item.status, 'done'); assert.equal(b.item.parcel, true); assert.equal(w.calls.network, 1); assert.equal(w.calls.hosting, 1); assert.equal(w.calls.parcel, 1);
  assert.deepStrictEqual(w.calls.parcelBody, { lat: 35.7, lng: -96.88 });
  var s = w.site('s1').assessment;
  assert.equal(s.screen.complete, true); assert.equal(s.screen.power.substation, 'Chandler'); assert.equal(s.screen.utility.name, 'OG&E'); assert.deepStrictEqual(s.screen.fiber.carriers, ['Cox']);
  assert.deepStrictEqual(s.parcel, { ok: true, apn: '0001-22', owner: 'Williams Family LP', acres: 3.46, zoning: 'C-3', county: 'Lincoln', source: 'regrid', at: NOW });
  assert.equal(s.result.power.utility, 'OG&E'); assert.equal(s.result.confidence.screened, true); assert.ok(s.result.readiness.screened >= 8);
  assert.ok(!s.result.verify.some(function (v) { return v.key === 'screen'; }));
  assert.equal(w.audits('sitecrm-assess-screen').length, 1); assert.equal(w.site('s1').diligence, undefined);
  /* fresh: a second start screens nothing unless forced */
  var again = await w.post({ action: 'assess-screen-start', ids: ['s1'] }); assert.deepStrictEqual(again.skippedFresh, ['s1']); assert.equal(again.job.total, 0);
  assert.equal((await w.post({ action: 'assess-screen-start', ids: ['s1'], force: true })).job.total, 1);
  await rejects(w.post({ action: 'assess-screen-start', ids: ['nope'] }), 404); await rejects(w.post({ action: 'assess-screen-step', jobId: 'nope' }), 404);
});
test('D03 a screen that cannot answer is an answer: the atlas down fails the site and screens nothing; a parcel miss is kept as a miss; a site with no street address is said', async function () {
  var w = world({ atlasDown: true }), st = await w.post({ action: 'assess-screen-start', ids: ['s1'] }), r = await w.post({ action: 'assess-screen-step', jobId: st.job.id });
  assert.equal(r.item.status, 'failed'); assert.deepStrictEqual(r.item.errors, ['grid-atlas']); assert.equal(w.calls.parcel, 0);
  assert.equal(w.site('s1').assessment.screen.located, null); assert.equal(w.site('s1').assessment.result.power.availableKw, 1500);
  var m = world({ parcelMiss: true }), s2 = await m.post({ action: 'assess-screen-start', ids: ['s1', 's3'] });
  await m.post({ action: 'assess-screen-step', jobId: s2.job.id }); await m.post({ action: 'assess-screen-step', jobId: s2.job.id });
  assert.equal(m.site('s1').assessment.parcel.ok, false); assert.ok(/no parcel record/.test(m.site('s1').assessment.parcel.reason));
  var last = await m.post({ action: 'assess-screen-step', jobId: s2.job.id });
  assert.equal(last.job.status, 'complete'); assert.equal(m.site('s3').assessment.screen.errors[0].source, 'location');
});
test('D04 where the diligence is on, the same screen lands on diligence.screen by the diligence’s own rule', async function () {
  var w = world({ billing: { toolOverrides: { 'portfolio-diligence': true } } }), st = await w.post({ action: 'assess-screen-start', ids: ['s1'] });
  await w.post({ action: 'assess-screen-step', jobId: st.job.id }); await w.post({ action: 'assess-screen-step', jobId: st.job.id });
  var s = w.site('s1'); assert.ok(DG.enabled({ toolOverrides: { 'portfolio-diligence': true } }));
  assert.equal(s.diligence.screen.power.substation, 'Chandler'); assert.equal(s.assessment.screen.power.substation, 'Chandler');
});
test('D05 a readiness item marked by a person: stored with who and when, the score follows, audited; an unknown item or state refused', async function () {
  var w = world(); await w.post({ action: 'assess-run', ids: ['s1'] });
  var r = await w.post({ action: 'assess-check', site: 's1', item: 'power-evidence', state: 'done', note: 'Will-serve letter from OG&E, 2026-11-02' });
  assert.equal(r.readiness.done, 1); assert.equal(r.readiness.pct, 2); assert.ok(!r.verify.some(function (v) { return v.key === 'will-serve'; }));
  var a = w.site('s1').assessment; assert.deepStrictEqual(a.checklist['power-evidence'], { state: 'done', note: 'Will-serve letter from OG&E, 2026-11-02', by: PAT.email, at: NOW });
  assert.equal(w.audits('sitecrm-assess-check')[0].to, 'done');
  await w.post({ action: 'assess-check', site: 's1', item: 'power-evidence', state: 'open' }); assert.equal(w.site('s1').assessment.checklist['power-evidence'], undefined); assert.equal(w.site('s1').assessment.result.readiness.done, 0);
  await rejects(w.post({ action: 'assess-check', site: 's1', item: 'made-up', state: 'done' }), 400); await rejects(w.post({ action: 'assess-check', site: 's1', item: 'env-flood', state: 'maybe' }), 400);
  await rejects(w.post({ action: 'assess-check', item: 'env-flood', state: 'done' }), 400, /Which site/);
});
test('D06 approve for pre-development: the decision, the status and the project kinds on each site, audited; a use the assessment does not show fitting is named; [] withdraws', async function () {
  var w = world(); await w.post({ action: 'assess-run', ids: ['s1', 's2'] });
  var r = await w.post({ action: 'assess-approve', ids: ['s1', 's2'], uses: ['compute', 'bess'], note: 'Francis batch one' });
  assert.equal(r.count, 2); assert.equal(r.label, 'Compute + Battery storage'); assert.ok(/2 sites approved for pre-development: Compute \+ Battery storage/.test(r.note));
  assert.ok(r.notFitting.some(function (x) { return x.siteId === 's2' && x.use === 'compute'; }) && /does not show compute fitting OK Lawn/.test(r.note));
  var s1 = w.site('s1'); assert.equal(s1.status, 'Pre-development'); assert.deepStrictEqual(s1.siteScopes, ['dcfc', 'compute', 'bess']); assert.equal(s1.assessment.decision.status, 'approved'); assert.equal(s1.assessment.decision.by, PAT.email);
  assert.equal(s1.revision, 2); assert.ok(s1.assessment.result);
  assert.equal(w.audits('sitecrm-assess-approve').length, 2);
  var one = await w.post({ action: 'assess-approve', site: 's1', uses: [] });
  /* a withdrawal puts back the status the site had (Operational), never a blank; one that had none goes back to none */
  assert.equal(one.status, 'withdrawn'); assert.equal(w.site('s1').status, 'Operational'); assert.equal(w.site('s1').assessment.statusBefore, undefined); assert.equal(w.site('s1').assessment.decision.status, 'withdrawn'); assert.equal(w.site('s2').status, 'Pre-development'); assert.equal(w.site('s2').assessment.statusBefore, '');
  await w.post({ action: 'assess-approve', site: 's1', uses: ['bess'] }); await w.post({ action: 'assess-approve', site: 's1', uses: ['compute'] });       /* changed while approved: the first status is the one kept */
  assert.equal(w.site('s1').assessment.statusBefore, 'Operational'); await w.post({ action: 'assess-approve', site: 's1', uses: [] }); assert.equal(w.site('s1').status, 'Operational');
  await w.post({ action: 'assess-approve', site: 's2', uses: [] }); assert.equal(w.site('s2').status, '');
  await rejects(w.post({ action: 'assess-approve', ids: ['s1'], uses: ['solar'] }), 400);
  await rejects(w.post({ action: 'assess-approve', ids: ['s1'], uses: ['bess'] }, { canEdit: false }), 403);
});
test('D07 the reads: the register’s row carries no yearly table; one site’s view carries them all, recomputed, and says when the stored answer is stale', async function () {
  var w = world(); await w.post({ action: 'assess-run', ids: ['s1'] }); await w.post({ action: 'assess-approve', site: 's1', uses: ['supercharger'] });
  var rows = await w.door.listJoin({ root: w.root }, [{ id: 's1', data: function () { return w.site('s1'); } }, { id: 's3', data: function () { return w.site('s3'); } }]);
  assert.equal(rows.s1.power.availableKw, 1500); assert.ok(!rows.s1.bess.projections); assert.equal(rows.s1.decision.label, 'Fast charging'); assert.equal(rows.s1.stale, false); assert.equal(rows.s3, null);
  var full = await w.door.fullView({ root: w.root }, { id: 's1' }, w.site('s1'));
  assert.equal(full.result.bess.projections.length, 10); assert.equal(full.result.supercharger.projections.length, 15); assert.equal(full.result.readiness.sections[3].items.length, 8); assert.equal(full.stale, false); assert.equal(full.decision.label, 'Fast charging');
  var changed = Object.assign({}, w.site('s1'), { existingPeakKw: 500 });
  var f2 = await w.door.fullView({ root: w.root }, { id: 's1' }, changed); assert.equal(f2.stale, true); assert.equal(f2.result.power.availableKw, 1000);
  assert.equal((await w.door.listJoin({ root: w.root }, [{ id: 's1', data: function () { return changed; } }])).s1.stale, true);
});

test('D08 a utility-side upgrade request through the door: marked on one site or many, the answer assessed again with what it would carry, audited; a figure the site already has is refused per site; a viewer refused', async function () {
  var w = world(); await w.post({ action: 'assess-run', ids: ['s1', 's2'] });
  var r = await w.post({ action: 'assess-upgrade', site: 's2', unit: 'm350', note: 'ask Francis' });
  assert.equal(r.status, 'requested'); assert.equal(r.upgrade.targetKw, 460); assert.equal(r.upgrade.compute.label, '350 kW');   /* 420 kW free on top of the 40 kW the site already draws */ assert.ok(/marked as requested on 1 site/.test(r.note));
  var s2 = w.site('s2'); assert.equal(s2.assessment.upgrade.status, 'requested'); assert.equal(s2.assessment.result.upgrade.targetKw, 460); assert.equal(s2.assessment.result.power.availableKw, 80); assert.equal(s2.revision, 1);
  assert.equal(w.audits('sitecrm-assess-upgrade').length, 1); assert.equal(w.audits('sitecrm-assess-upgrade')[0].targetKw, 460);
  assert.equal(w.site('s1').assessment.result.upgradeAdvice, null); assert.equal(w.site('s2').assessment.result.upgradeAdvice, null);   /* s1 carries the Micro pod; s2 has its mark */
  var many = await w.post({ action: 'assess-upgrade', ids: ['s1', 's2', 'gone'], targetKw: 1300 });      /* s1 already has 1,500 kW: refused by name; s2 moves to 1,300 */
  assert.equal(many.count, 1); assert.equal(many.refused.length, 2); assert.ok(/Williams Food \(The site already has 1,500 kW on file/.test(many.note)); assert.equal(w.site('s2').assessment.upgrade.targetKw, 1300);
  await rejects(w.post({ action: 'assess-upgrade', site: 's1', targetKw: 1300 }), 400, /already has 1,500 kW/);
  var g = await w.post({ action: 'assess-upgrade', site: 's2', status: 'granted' }); assert.ok(/Record the new service/.test(g.note)); assert.equal(w.site('s2').assessment.result.upgrade.status, 'granted');
  await w.post({ action: 'assess-upgrade', site: 's2', status: 'withdrawn' }); assert.equal(w.site('s2').assessment.result.upgrade, null); assert.equal(w.site('s2').assessment.upgrade.history.length, 4);
  await rejects(w.post({ action: 'assess-upgrade', site: 's2', status: 'granted' }), 409, /no upgrade request/);
  await rejects(w.post({ action: 'assess-upgrade', site: 's2', unit: 'm350' }, { canEdit: false }), 403);
});
test('D09 the funding list through the door: 409 where the workspace names no committee; a site not screened is refused by name; a submitted site carries the figure assessed NOW; only a committee member on a verified address decides; every step audited', async function () {
  var plain = world(); await plain.post({ action: 'assess-run', ids: ['s1'] }); await rejects(plain.post({ action: 'assess-fund-submit', site: 's1', uses: ['compute'] }), 409, /no funding list/);
  assert.equal(await plain.door.info(plain.ctx({})), null); assert.equal(await plain.door.fundingMode({ root: plain.root }), false);
  var FUND = { portfolioAssessment: { funding: { mode: 'committee', name: 'Finance committee', members: [{ name: 'Barry D', email: 'barry@acme-sites.com' }, { name: 'Eli N', email: 'eli@acme-sites.com' }] } } };
  var w = world({ billing: FUND }); await w.post({ action: 'assess-run', ids: ['s1', 's2'] });
  assert.equal(await w.door.fundingMode({ root: w.root }), true); assert.deepStrictEqual((await w.door.info(w.ctx({}))).members, ['Barry D', 'Eli N']); assert.equal((await w.door.info(w.ctx({}))).canDecide, false);
  await rejects(w.post({ action: 'assess-fund-submit', site: 's1', uses: ['compute'] }), 409, /Screen the site first/);
  var st = await w.post({ action: 'assess-screen-start', ids: ['s1'] }); for (var i = 0; i < 6 && w.db.data.get(O + '/site_jobs/' + st.job.id).status !== 'complete'; i++) await w.post({ action: 'assess-screen-step', jobId: st.job.id });
  assert.equal(w.site('s1').assessment.screen.complete, true);
  var both = await w.post({ action: 'assess-fund-submit', ids: ['s1', 's2'], uses: ['compute'], note: 'batch one' });           /* s2 is not screened, and compute does not fit it */
  assert.equal(both.count, 1); assert.equal(both.refused[0].siteId, 's2'); assert.ok(/1 site submitted to finance committee for funding\. 1 not changed: OK Lawn & Pest \(Screen the site first/.test(both.note));
  var fd = w.site('s1').assessment.funding; assert.equal(fd.status, 'submitted'); assert.equal(fd.amountUsd, w.site('s1').assessment.result.compute.economics.capexUsd); assert.equal(fd.submittedBy, PAT.email); assert.equal(fd.note, 'batch one');
  assert.equal(w.audits('sitecrm-assess-fund-submit').length, 1); assert.equal(w.site('s1').revision, 2);
  await rejects(w.post({ action: 'assess-fund-decide', site: 's1', decision: 'approved' }), 403, /decided by Finance committee \(Barry D, Eli N\)/);                      /* an editor is not the committee */
  var ELI = { uid: 'u-eli', email: 'eli@acme-sites.com', orgId: ORG, staff: false, claims: { email_verified: true } };
  await rejects(w.post({ action: 'assess-fund-decide', site: 's1', decision: 'approved' }, { caller: Object.assign({}, ELI, { claims: {} }), by: ELI.email }), 403, /Confirm your email address/);   /* the name alone is not enough */
  await rejects(w.post({ action: 'assess-fund-decide', site: 's1', decision: 'approved' }, { caller: { uid: 'u-staff', email: 'ops@clearsky-usa.com', staff: true, claims: { email_verified: true } }, by: 'ops@clearsky-usa.com' }), 403);   /* nor is staff */
  assert.equal((await w.door.info(w.ctx({}, { caller: ELI, by: ELI.email }))).canDecide, true);
  await rejects(w.post({ action: 'assess-fund-decide', site: 's1', decision: 'declined' }, { caller: ELI, by: ELI.email }), 400, /Say why/);
  var ok = await w.post({ action: 'assess-fund-decide', site: 's1', decision: 'approved', note: 'go' }, { caller: ELI, by: ELI.email, canEdit: false });
  assert.equal(ok.funding.status, 'approved'); assert.equal(ok.funding.decision.name, 'Eli N'); assert.ok(/Funding approved on 1 site/.test(ok.note)); assert.equal(w.site('s1').assessment.funding.history.length, 2);
  assert.equal(w.audits('sitecrm-assess-fund-decide').length, 1); assert.equal(w.audits('sitecrm-assess-fund-decide')[0].by, ELI.email);
  await rejects(w.post({ action: 'assess-fund-withdraw', site: 's1' }), 409, /committee has decided/);
  var rows = await w.door.listJoin({ root: w.root }, [{ id: 's1', data: function () { return w.site('s1'); } }]); assert.equal(rows.s1.funding.status, 'approved'); assert.equal(rows.s1.confidence.screened, true);
  var full = await w.door.fullView({ root: w.root }, { id: 's1' }, w.site('s1')); assert.equal(full.funding.status, 'approved'); assert.equal(full.fundingHistory.length, 2);
});

test('D10 the review through the door: 409 with no board in the settings; a member’s vote on a verified address is stored and audited, nobody else’s is taken (an editor, staff, an unverified member); the decision appears when all have voted', async function () {
  var plain = world(); await plain.post({ action: 'assess-run', ids: ['s1'] }); await rejects(plain.post({ action: 'assess-review-vote', site: 's1', vote: 'own' }), 409, /no review board/); assert.equal(await plain.door.reviewInfo(plain.ctx({})), null);
  var SET = { portfolioAssessment: { gates: { minKva: 500, minLeaseYears: 5 }, review: { members: [{ name: 'Barry', email: 'barry@acme-sites.com' }, { name: 'Tom', email: 'tom@acme-sites.com' }] } } };
  var w = world({ billing: SET }); await w.post({ action: 'assess-run', ids: ['s1', 's2'] });
  function as(name, extra) { var who = { uid: 'u-' + name, email: name + '@acme-sites.com', orgId: ORG, staff: false, claims: { email_verified: true } }; return Object.assign({ caller: who, by: who.email }, extra || {}); }
  await rejects(w.post({ action: 'assess-review-vote', site: 's1', vote: 'own' }), 403, /Executive Review is Barry, Tom\. Only they vote/);
  await rejects(w.post({ action: 'assess-review-vote', site: 's1', vote: 'own' }, { caller: { uid: 'u-s', email: 'ops@clearsky-usa.com', staff: true, claims: { email_verified: true } }, by: 'ops@clearsky-usa.com' }), 403);
  await rejects(w.post({ action: 'assess-review-vote', site: 's1', vote: 'own' }, { caller: { uid: 'u-b', email: 'barry@acme-sites.com', orgId: ORG, claims: {} }, by: 'barry@acme-sites.com' }), 403, /Confirm your email address/);
  await rejects(w.post({ action: 'assess-review-vote', site: 's1', vote: 'later' }, as('tom')), 400);
  var one = await w.post({ action: 'assess-review-vote', site: 's1', vote: 'own', note: 'the best of the batch' }, as('tom', { canEdit: false }));
  assert.equal(one.review.outcome, null); assert.equal(one.review.cast, 1); assert.ok(/Your vote \(own and operate\) is recorded on 1 site/.test(one.note));
  var both = await w.post({ action: 'assess-review-vote', ids: ['s1', 's2', 'gone'], vote: 'own' }, as('barry'));
  assert.equal(both.count, 2); assert.equal(both.refused.length, 1);
  var s1 = w.site('s1'), rows = await w.door.listJoin({ root: w.root }, [{ id: 's1', data: function () { return s1; } }, { id: 's2', data: function () { return w.site('s2'); } }]);
  assert.equal(rows.s1.review.outcome, 'own'); assert.equal(rows.s2.review.outcome, null); assert.equal(rows.s1.gates.list.filter(function (x) { return x.key === 'G6'; })[0].state, 'pass');
  assert.equal(rows.s1.gates.list.filter(function (x) { return x.key === 'G1'; })[0].state, 'pass'); assert.equal(rows.s2.gates.list.filter(function (x) { return x.key === 'G1'; })[0].state, 'fail');     /* 1,500 kW of service; a 150 kVA transformer */
  assert.equal(rows.s1.gates.list.filter(function (x) { return x.key === 'G2'; })[0].state, 'pass'); assert.equal(rows.s2.gates.list.filter(function (x) { return x.key === 'G2'; })[0].state, 'open');
  assert.equal(w.audits('sitecrm-assess-review-vote').length, 3); assert.equal(s1.revision, 2); assert.ok(s1.assessment.review.votes['tom@acme-sites_com']);
  var full = await w.door.fullView({ root: w.root }, { id: 's1' }, s1); assert.equal(full.review.outcome, 'own'); assert.equal(full.gates.of, 6);   /* G0, G1, G2, G3, G5, G6: no hurdle and no committee here, so no G4 */
  assert.deepStrictEqual(await w.door.reviewInfo(w.ctx({}, as('tom'))), { name: 'Executive Review', members: ['Barry', 'Tom'], canVote: true, me: 'Tom' }); assert.equal((await w.door.reviewInfo(w.ctx({}))).canVote, false);
});

test('D11 a closing step through the door: 409 with none in the settings; an editor records a step on one site or many, stored with who and when and audited; a lease needs its years; a viewer is refused', async function () {
  var plain = world(); await plain.post({ action: 'assess-run', ids: ['s1'] }); await rejects(plain.post({ action: 'assess-closing', site: 's1', step: 'purchase' }), 409, /no closing steps/);
  var w = world({ billing: { portfolioAssessment: { gates: { minLeaseYears: 5 }, closing: { minLeaseYears: 15, agreement: 'SHA' } } } }); await w.post({ action: 'assess-run', ids: ['s1', 's2'] });
  var many = await w.post({ action: 'assess-closing', ids: ['s1', 's2', 'gone'], step: 'purchase' }); assert.equal(many.count, 2); assert.equal(many.refused.length, 1); assert.ok(/Recorded the purchase on 2 sites/.test(many.note));
  var as = await w.post({ action: 'assess-closing', site: 's1', step: 'assignment', note: 'signed 11/9' }); assert.equal(as.closing.done, 2); assert.ok(/Recorded the SHA assignment on 1 site/.test(as.note));
  await rejects(w.post({ action: 'assess-closing', site: 's1', step: 'lease' }), 400, /how many years/);
  var le = await w.post({ action: 'assess-closing', site: 's1', step: 'lease', years: 20 }); assert.equal(le.closing.complete, true); assert.ok(/the lease \(20 years\)/.test(le.note));
  var s1 = w.site('s1'); assert.equal(s1.assessment.closing.lease.years, 20); assert.equal(s1.assessment.closing.assignment.by, PAT.email); assert.equal(s1.revision, 2); assert.equal(s1.termYearsRemaining, 7.3);      /* the site's own fact is not rewritten */
  var rows = await w.door.listJoin({ root: w.root }, [{ id: 's1', data: function () { return w.site('s1'); } }, { id: 's2', data: function () { return w.site('s2'); } }]);
  assert.equal(rows.s1.closing.complete, true); assert.equal(rows.s2.closing.done, 1); assert.equal(rows.s1.gates.list[0].state, 'pass'); assert.equal(rows.s2.gates.list[0].state, 'open');
  var undo = await w.post({ action: 'assess-closing', site: 's1', step: 'lease', done: false }); assert.equal(undo.closing.complete, false); assert.ok(/Took back the lease/.test(undo.note));
  assert.equal(w.audits('sitecrm-assess-closing').length, 5); assert.equal((await w.door.fullView({ root: w.root }, { id: 's1' }, w.site('s1'))).closingHistory.length, 4);
  await rejects(w.post({ action: 'assess-closing', site: 's1', step: 'purchase' }, { canEdit: false }), 403);
});

(async function () {
  for (var i = 0; i < queue.length; i++) {
    try { await queue[i][1](); passed++; console.log('PASS ' + queue[i][0]); }
    catch (e) { failed++; console.log('FAIL ' + queue[i][0] + '\n     ' + (e && e.stack || e)); }
  }
  console.log('site assessment: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})();
