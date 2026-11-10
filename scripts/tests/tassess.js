/* scripts/tests/tassess.js — the site assessment (2026-11-09, Tommy: "when i
   upload a portfolio it then would run all these numbers … i should be able
   to select run … the goal is to get sites shovel ready").
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Three layers, all offline:
     E  the two engines against the figures of the models they carry: the
        grid battery's reference case to the cent, the fast-charging host
        case to the cent — a change in either engine's arithmetic fails here
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
test('A04 compute: the shelf is 75 kW, 350 kW, 1 MW and 1.77 MW of IT at the meter; the largest that fits is chosen, and repeated where it fits more than once', function () {
  var cfg = A.configOf(null);
  assert.deepStrictEqual(A.MODULARS.map(function (m) { return m.itKw; }), [75, 350, 1000, 1770]);
  var c = A.computeOf({ availableKw: 1500, basis: 'measured' }, cfg, {});
  assert.deepStrictEqual(c.shelf.map(function (s) { return s.meterKw; }), [90, 420, 1200, 2124]);
  assert.equal(c.chosen.key, 'm1000'); assert.equal(c.chosen.units, 1); assert.equal(c.chosen.leftKw, 300); assert.ok(c.economics.ok && c.economics.gpus > 0 && c.economics.capexUsd > 0);
  assert.ok(c.economics.irrPct != null && /public spot reference/.test(c.economics.irrBasis)); assert.ok(c.economics.notes.some(function (n) { return /screening figure/.test(n); }));
  assert.equal(A.computeOf({ availableKw: 300, basis: 'ceiling' }, cfg, {}).chosen.units, 3);
  assert.equal(A.computeOf({ availableKw: 5000, basis: 'measured' }, cfg, {}).chosen.key, 'm1770');
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
  assert.equal(small.power.availableKw, 240); assert.equal(small.compute.chosen.units, 2); assert.equal(small.supercharger.ok, false); assert.ok(small.bess.ok);
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
  assert.equal(one.status, 'withdrawn'); assert.equal(w.site('s1').status, ''); assert.equal(w.site('s1').assessment.decision.status, 'withdrawn'); assert.equal(w.site('s2').status, 'Pre-development');
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

(async function () {
  for (var i = 0; i < queue.length; i++) {
    try { await queue[i][1](); passed++; console.log('PASS ' + queue[i][0]); }
    catch (e) { failed++; console.log('FAIL ' + queue[i][0] + '\n     ' + (e && e.stack || e)); }
  }
  console.log('site assessment: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})();
