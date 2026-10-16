/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   The Compute Site Pro Forma, offline: the engine (api/_lib/compute-site.js)
   on the one tariff engine and the one finance engine, the gate on
   POST /api/compute-proforma (api/compute-proforma.js), the deck's compute
   story (proforma-logic.js) and the tool's registrations.

   The load balance is held by invariants rather than snapshots: the meter
   never goes above the service limit, energy balances hour by hour, the
   battery stays inside its power and energy, firm compute is lost only when
   firm load itself exceeds the service, managed charging never costs more
   than unmanaged, and on-demand GPUs are curtailed only where the demand
   charge makes that pay.

   No network, no credentials, no npm install.
   Run: node scripts/tests/tcomputesite.js
*/
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var ROOT = path.join(__dirname, '..', '..');
var CS = require(path.join(ROOT, 'api', '_lib', 'compute-site'));
var PF = require(path.join(ROOT, 'api', '_lib', 'proforma-engine'));
var X = CS._internal;

var pass = 0, fail = 0, queue = Promise.resolve();
function ok(name, cond, got) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (got !== undefined ? '  got: ' + JSON.stringify(got).slice(0, 400) : '')); }
}
function section(t) { console.log('\n' + t); }
function later(fn) { queue = queue.then(fn); }
function merge(a, b) {
  var o = JSON.parse(JSON.stringify(a || {}));
  Object.keys(b || {}).forEach(function (k) {
    o[k] = b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && o[k] && typeof o[k] === 'object' ? merge(o[k], b[k]) : b[k];
  });
  return o;
}
var BASE = { site: { name: 'Oak Street', zip: '78701', city: 'Austin', host: 'Oak Street Apartments', hostType: 'multifamily', sponsor: 'Acme Edge' },
  service: { amps: 800, volts: 480 }, load: { type: 'profile', annualKwh: 450000 }, ev: { ports: 8 }, compute: { pods: 1 } };
var TIGHT = merge(BASE, { site: { zip: '60601', city: 'Chicago' }, service: { amps: 300 }, compute: { pods: 2 } });
function site(over) { return merge(BASE, over || {}); }
function sum(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s; }
function maxOf(a) { var m = -Infinity; for (var i = 0; i < a.length; i++) if (a[i] > m) m = a[i]; return m; }

/* ── input ─────────────────────────────────────────────────────────────── */
section('Input');
var rd = CS.read(BASE);
ok('a site with a ZIP and a service reads clean', rd.errors.length === 0, rd.errors);
ok('the service from amps: 800 A at 480 V three-phase, 0.95 pf', Math.abs(rd.cfg.service.kw - 800 * 480 * Math.sqrt(3) * 0.95 / 1000) < 1e-9, rd.cfg.service.kw);
ok('the H200 defaults are the published planner figures', rd.cfg.compute.kwPerGpu === 0.70 && rd.cfg.compute.gpusPerPod === 48, rd.cfg.compute);
ok('B300 pods hold 32 GPUs', CS.read(site({ compute: { gpuClass: 'b300' } })).cfg.compute.gpusPerPod === 32);
ok('Laitent\'s published mix is the default', rd.cfg.compute.tiers.offtake.sharePct === 40 && rd.cfg.compute.tiers.edge.sharePct === 30 && rd.cfg.compute.tiers.spot.sharePct === 30);
function errs(over) { return CS.read(merge(BASE, over)).errors.map(function (e) { return e.field; }); }
ok('no ZIP is refused', errs({ site: { zip: 'abc' } }).indexOf('site.zip') >= 0);
ok('no service size is refused', CS.read({ site: { zip: '78701' } }).errors.some(function (e) { return e.field === 'service.kw'; }));
ok('shares that do not add to 100 are refused', errs({ compute: { tiers: { spot: { sharePct: 50 } } } }).indexOf('compute.tiers') >= 0);
ok('a battery with power and no energy is refused', errs({ battery: { kw: 50 } }).indexOf('battery.kwh') >= 0);
ok('more sessions than a port can host is refused', errs({ ev: { sessionsPerPortDay: 3, dwellHours: 11 } }).indexOf('ev.sessionsPerPortDay') >= 0);
ok('a custom GPU needs its power, cost and prices', ['compute.kwPerGpu', 'compute.capexPerGpu', 'compute.tiers.edge.price'].every(function (f) { return errs({ compute: { gpuClass: 'custom' } }).indexOf(f) >= 0; }));
ok('an unknown structure is refused', errs({ deal: { structure: 'magic' } }).indexOf('deal.structure') >= 0);
ok('a text number is refused, not read as zero', errs({ compute: { pods: 'two' } }).indexOf('compute.pods') >= 0);

/* ── the physics ───────────────────────────────────────────────────────── */
/* compute on its OWN meter (the Omega-Core skid, 2026-10-13): no building
   behind it, nothing assumed, its own words */
var OWN = { site: { zip: '91304', hostType: 'commercial' }, service: { kw: 135, loadingPct: 100, own: true, volts: 480 }, load: { none: true }, ev: { ports: 0 },
  compute: { pods: 1, gpuClass: 'custom', gpuName: 'Omega-Core skid \u00b7 NVIDIA HGX H100', gpuShort: 'Omega-Core H100', gpusPerPod: 48, kwPerGpu: 1.275, overheadPct: 0, pue: 1.2,
             tiers: { offtake: { sharePct: 0, price: 2.46 }, edge: { sharePct: 0, price: 2.46 }, spot: { sharePct: 100, price: 2.46, utilPct: 85 } }, spotMode: 'always', capexPerGpu: 13312.5, podInfraPerPod: 125000 },
  battery: { kw: 60, kwh: 61.44, capexPerKwh: 0 }, deal: { structure: 'own', rentPerYear: 12000 } };
var own = CS.model(OWN);
ok('a compute unit on its own meter runs with no building load: the load is none, zero kWh, known exactly (never assumed, never a warning)', own.ok && own.load.source === 'none' && own.load.annualKwh === 0 && own.load.quality === 'high' && !own.proforma.warnings.some(function (w) { return w.code === 'LOAD_ASSUMED'; }), own.ok ? own.load : own.errors);
ok('the custom accelerator wears the name its caller gave it', own.ok && own.compute.gpuName === 'Omega-Core skid \u00b7 NVIDIA HGX H100' && /48 Omega-Core H100 GPUs/.test(own.story.flow[0][1]), own.ok && own.story.flow);
ok('the service reads as the compute\u2019s own meter, not a shared building service', own.ok && own.story.flow.some(function (f) { return f[0] === 'grid' && f[1] === 'Own service' && /own meter/.test(f[2]); }) && /on its own 135 kW service/.test(own.story.narrative) && own.proforma.assumptions.some(function (a) { return /own meter billed/.test(a) && /no building load/.test(a); }), own.ok && own.story);
ok('a battery priced inside another line ($0/kWh) has no $0 line of its own, and the GPU and pod lines carry the skid\u2019s price', own.ok && !own.schedule.capex.some(function (l) { return l.id === 'bess'; }) && own.schedule.capex.filter(function (l) { return l.id === 'gpu'; })[0].amount === Math.round(639000 * 1.08) && own.schedule.capex.filter(function (l) { return l.id === 'pods'; })[0].amount === Math.round(125000 * 1.08), own.ok && own.schedule.capex);
ok('the meter balances: the skid\u2019s compute and battery never exceed its own 135 kW', own.ok && own.balance.limitKw === 135 && own.balance.overloadHours === 0 && own.balance.peakKw > 0 && own.balance.peakKw <= 135, own.ok && own.balance);
ok('a shared service still reads shared', CS.model(BASE).story.flow.some(function (f) { return f[0] === 'grid' && f[1] === 'Existing service'; }));

/* THE HOST'S SYSTEM BESIDE THE COMPUTE (2026-10-14, Tommy: "the compute IRR
   reflects the total ask of the project … the build of the system existing
   and the cost of that system now with the cost of the compute system and
   the payback on that"): money, never dispatch */
var HOST = JSON.parse(JSON.stringify(OWN));
HOST.host = { solarKwDc: 368, bessKw: 250, bessKwh: 1000, basis: 'Site Map cost run of 2026-10-14', ppa: { ratePerKwh: 0.225, escPct: 2.5, termYears: 28 },
  capexLines: [{ id: 'nextnrg', label: 'NextNRG solar + storage system, installed (labor included)', amount: 2208000, asset: 'blended' }, { id: 'balance', label: 'Site equipment, engineering, permitting and contingency', amount: 40000, asset: 'blended' }] };
var hs = CS.model(HOST), hpf = hs.ok && hs.proforma;
ok('the host\u2019s lines are in the capital, unscaled, on their asset classes, after the compute\u2019s own', hs.ok && hs.schedule.capex.filter(function (l) { return l.host; }).map(function (l) { return [l.id, l.amount, l.asset]; }).join('|') === 'host-nextnrg,2208000,blended|host-balance,40000,blended' && hs.host.capex === 2248000 && hs.computeCapex === own.proforma.capex.total, hs.ok ? hs.schedule.capex : hs.errors);
ok('the sources and uses are the whole project\u2019s', hs.ok && hpf.sourcesUses.totalUses > own.proforma.sourcesUses.totalUses + 2248000 && hpf.capex.total === own.proforma.capex.total + 2248000, hs.ok && hpf.sourcesUses);
ok('the PPA prices the solar the engine generates, year by year, escalating', hs.ok && hpf.inputs.revenue.ppa.rate1 === 0.225 && hpf.inputs.solar.kwDc === 368 && hpf.rows[0].ppaRevenue > 100000 && hpf.rows[1].ppaRevenue > hpf.rows[0].ppaRevenue, hs.ok && hpf.rows[0]);
ok('the NextNRG system is energy property with its credit', hs.ok && hpf.tax.itc.byAsset.blended.basis > 2000000 && hpf.tax.itc.byAsset.blended.basis <= 2248000 && hpf.tax.itc.face > 0, hs.ok && hpf.tax.itc);
ok('the host\u2019s O&M is a line of its own; the compute\u2019s own revenue and dispatch are unchanged', hs.ok && hs.schedule.opex.some(function (l) { return l.id === 'hostom' && l.schedule[0] === Math.round(1000 * 6 + 368 * 20); }) && hs.compute.revenue.gross === own.compute.revenue.gross && hs.balance.peakKw === own.balance.peakKw, hs.ok && hs.schedule.opex);
ok('the IRR and the payback are of the whole, and the words say so', hs.ok && hpf.metrics.afterTaxIrr < own.proforma.metrics.afterTaxIrr && hpf.metrics.afterTaxIrr > 0.02 && /368 kW-dc of solar/.test(hs.story.narrative) && /under a PPA/.test(hs.story.narrative) && hpf.assumptions.some(function (a) { return /host\u2019s own system beside the compute/.test(a) && /\$0\.225\/kWh/.test(a); }), hs.ok && [hpf.metrics.afterTaxIrr, hs.story.narrative]);
/* the host's PPA outlives the term: a terminal value at year N for the remaining years, so the whole-project IRR reflects the 28-year PPA (2026-10-14, Tommy: the IRR "should improve from having the compute there") */
var tvLine = hs.ok && hs.schedule.revenue.filter(function (l) { return l.id === 'hostterminal'; })[0];
ok('a 28-year PPA on a 10-year term leaves a terminal value at year 10: the remaining 18 years less O&M, discounted, as one revenue line in year 10 only', !!tvLine && tvLine.schedule.length === 10 && tvLine.schedule[9] > 500000 && tvLine.schedule.slice(0, 9).every(function (v) { return v === 0; }) && hs.host.terminalValue && hs.host.terminalValue.yearsLeft === 18 && hs.host.terminalValue.year === 10 && hs.host.terminalValue.amount === tvLine.schedule[9], tvLine);
/* THE CONTRACT AS WRITTEN (2026-10-15, Tommy: "very accurate … able to be verified by the bank"): the executed PPA's own price table and its expected first-year production, and the term's own IRR beside the headline */
var TBL = []; for (var ty = 0; ty < 28; ty++) TBL.push(Math.round(0.225 * Math.pow(1.02, ty) * 10000) / 10000);
var TABLE = JSON.parse(JSON.stringify(HOST)); TABLE.host.ppa = { schedule: TBL, termYears: 28, year1Kwh: 540000 };
var tb = CS.model(TABLE), tpf = tb.ok && tb.proforma;
ok('the table prices each year as the contract reads: year one is its first row, year ten its tenth, and the engine carries the table', tb.ok && tpf.inputs.revenue.ppa.rate1 === 0.225 && tpf.inputs.revenue.ppa.schedule.length === 28 && Math.abs(tpf.rows[9].ppaRevenue / tpf.rows[9].solarNetKwh - TBL[9]) < 1e-9 && tb.host.ppa.schedule.length === 28 && tb.host.ppa.termYears === 28, tb.ok ? tpf.inputs.revenue.ppa : tb.errors);
ok('the contract\u2019s expected first-year production is what the solar generates, not the ZIP\u2019s yield', tb.ok && tpf.inputs.solar.kwh1 === 540000 && hpf.inputs.solar.kwh1 !== 540000 && !tpf.warnings.some(function (w) { return w.code === 'PPA_PRODUCTION_ASSUMED'; }), tb.ok && [tpf.inputs.solar, hpf.inputs.solar]);
ok('the terminal value is priced off the same table (years 11 to 28 as written), and the words name the table', tb.ok && tb.host.terminalValue && tb.host.terminalValue.amount > 0 && tb.host.terminalValue.amount < hs.host.terminalValue.amount && tpf.assumptions.some(function (a) { return /contract\u2019s own price table/.test(a) && /\$0\.225\/kWh in year one to \$0\.384\/kWh in year 28/.test(a) && /540,000 kWh/.test(a); }), tb.ok && [tb.host.terminalValue, hs.host.terminalValue, tpf.assumptions.slice(0, 4)]);
ok('a 2.0% table returns less than the 2.5% rate on the same facts', tb.ok && tpf.metrics.afterTaxIrr < hpf.metrics.afterTaxIrr, [tpf.metrics.afterTaxIrr, hpf.metrics.afterTaxIrr]);
ok('the term\u2019s own IRR with no terminal value rides beside the headline, lower than it, on the deal and the host block', hs.ok && hs.host.terminalValue.irrExTerminal != null && hs.host.terminalValue.irrExTerminal < hpf.metrics.afterTaxIrr && hs.deals.own.irrExTerminal === hs.host.terminalValue.irrExTerminal, hs.ok && [hs.host.terminalValue, hs.deals.own]);
ok('a PPA with no escalator on record is said to be assumed, a rate without a table is told the table exists, the ZIP yield is named; a table silences the first two', hs.ok && !hpf.warnings.some(function (w) { return w.code === 'PPA_ESCALATOR_ASSUMED'; }) && hpf.warnings.some(function (w) { return w.code === 'PPA_TABLE_MISSING'; }) && hpf.warnings.some(function (w) { return w.code === 'PPA_PRODUCTION_ASSUMED' && /kWh in year one/.test(w.message); }) && !tpf.warnings.some(function (w) { return w.code === 'PPA_TABLE_MISSING' || w.code === 'PPA_ESCALATOR_ASSUMED'; }) &&
   (function () { var A = JSON.parse(JSON.stringify(HOST)); delete A.host.ppa.escPct; var r = CS.model(A); return r.ok && r.proforma.warnings.some(function (w) { return w.code === 'PPA_ESCALATOR_ASSUMED'; }) && r.host.ppa.escPct === 2.5 && /2\.5% assumed/.test(r.proforma.assumptions.join(' ')); })(), hs.ok && hpf.warnings.map(function (w) { return w.code; }));
ok('a bad price in the table is refused by name', errs({ host: { solarKwDc: 100, capexLines: [], ppa: { schedule: [0.2, 9] } } }).indexOf('host.ppa.schedule[1]') >= 0);
var SHORT = JSON.parse(JSON.stringify(HOST)); SHORT.host.ppa.termYears = 10;
var sh10 = CS.model(SHORT);
ok('a PPA that ends with the term leaves no terminal value, and the IRR with the longer PPA is the higher one', sh10.ok && !sh10.schedule.revenue.some(function (l) { return l.id === 'hostterminal'; }) && sh10.host.terminalValue === null && hpf.metrics.afterTaxIrr > sh10.proforma.metrics.afterTaxIrr, sh10.ok && [hpf.metrics.afterTaxIrr, sh10.proforma.metrics.afterTaxIrr]);
ok('the assumptions say so', hs.ok && hpf.assumptions.some(function (a) { return /terminal value of \$[\d,]+ taken as income in year 10/.test(a); }), hpf.assumptions.slice(0, 3));
var NOREV = JSON.parse(JSON.stringify(HOST)); delete NOREV.host.ppa;
var nr = CS.model(NOREV);
ok('a host system with no PPA on record: the solar is in the ask with nothing against it and the model says so; the battery still earns on the dispatch', nr.ok && nr.proforma.warnings[0].code === 'HOST_SOLAR_NO_REVENUE' && !nr.schedule.revenue.some(function (l) { return /Host system revenue/.test(l.label); }) && nr.host.revenueBasis === '' && nr.schedule.revenue.some(function (l) { return l.id === 'hoststorage'; }), nr.ok && nr.proforma.warnings[0]);
var NOB = JSON.parse(JSON.stringify(NOREV)); NOB.host.bessKw = 0; NOB.host.bessKwh = 0; var nb = CS.model(NOB);
ok('with no battery and no PPA the host has no revenue at all, and the model says so first', nb.ok && nb.proforma.warnings[0].code === 'HOST_NO_REVENUE' && nb.host.storage === null, nb.ok && nb.proforma.warnings[0]);
/* THE HOST'S BATTERY EARNS (2026-10-15, Tommy: "give the host's battery its revenue in the whole-project compute case through the platform's own dispatch (demand charges, VPP, grid services)") */
var sr = hs.ok && hs.host.storage, stLine = hs.ok && hs.schedule.revenue.filter(function (l) { return l.id === 'hoststorage'; })[0];
ok('the host\u2019s battery is dispatched on the host\u2019s meter by the ONE dispatch: demand charges and time-of-use computed, the grid programmes open at the ZIP, each stream with its tier', !!sr && sr.year1 > 0 && sr.streams.some(function (x) { return x.id === 'bill.demand' && x.tier === 'computed'; }) && sr.streams.some(function (x) { return x.id === 'bill.tou'; }) && sr.market && sr.market.key === 'CAISO' && sr.version === require('../../api/_lib/vpp-sim').VERSION, sr);
ok('the project is paid 80% of the bill savings as a storage service fee and the published owner share of the grid earnings, and that is the year-one line', !!sr && sr.sharePct === 80 && sr.fee === Math.round(sr.billSavings * 0.8) && sr.grid === Math.round(sr.gridEarnings * 0.7) && sr.year1 === sr.fee + sr.grid && !!stLine && stLine.schedule[0] === sr.year1 && /storage service fee and grid services/.test(stLine.label), sr && [sr, stLine]);
ok('the line rises with inflation and fades with the battery', !!stLine && stLine.schedule[1] > stLine.schedule[0] * 0.99 && stLine.schedule[9] > 0, stLine);
var OFF = JSON.parse(JSON.stringify(HOST)); OFF.host.storage = { dispatch: false }; var off = CS.model(OFF);
ok('with the dispatch off the battery earns nothing, the line is gone, and the IRR with it is the higher one', off.ok && off.host.storage === null && !off.schedule.revenue.some(function (l) { return l.id === 'hoststorage'; }) && hpf.metrics.afterTaxIrr > off.proforma.metrics.afterTaxIrr, off.ok && [hpf.metrics.afterTaxIrr, off.proforma.metrics.afterTaxIrr]);
ok('a host with no usage on record is dispatched against the typical load for its type, and the model says so (info, never silent)', !!sr && sr.load && sr.load.source === 'profile' && hpf.warnings.some(function (w) { return w.code === 'HOST_LOAD_ASSUMED' && w.level === 'info' && /assumed/.test(w.message); }), hpf.warnings);
var USE = JSON.parse(JSON.stringify(HOST)); USE.host.storage = { annualKwh: 1200000 }; var use = CS.model(USE);
ok('the host\u2019s annual usage on record shapes the load it is dispatched against, and the assumption note goes', use.ok && use.host.storage.load.annualKwh === 1200000 && !use.proforma.warnings.some(function (w) { return w.code === 'HOST_LOAD_ASSUMED'; }), use.ok && use.host.storage.load);
ok('the deck\u2019s assumptions say what the battery earns, on what, at what share, and that it is a screening dispatch', hpf.assumptions.some(function (a) { return /host\u2019s battery earns on the host\u2019s meter/.test(a) && /storage service fee/.test(a) && /80%/.test(a) && /screening dispatch/.test(a); }), hpf.assumptions);
ok('the flow names the host battery as dispatched', hs.story.flow.some(function (f) { return f[0] === 'bess' && /host BESS/.test(f[1]) && /Dispatched on the host/.test(f[2]); }), hs.story.flow);
NOREV.host.revenuePerYear = 61000; NOREV.host.revenueBasis = 'the Site Map run\u2019s year-one revenue';
var rr = CS.model(NOREV);
ok('the run\u2019s own revenue stands in when there is no PPA, rising with inflation', rr.ok && rr.schedule.revenue.some(function (l) { return /Host system revenue/.test(l.label) && l.schedule[0] === 61000 && l.schedule[1] > 61000; }) && !rr.proforma.warnings.some(function (w) { return w.code === 'HOST_NO_REVENUE'; }), rr.ok && rr.schedule.revenue);
ok('a PPA needs solar; a host battery needs both figures', errs({ host: { bessKw: 250, bessKwh: 1000, ppa: { ratePerKwh: 0.2 }, capexLines: [] } }).indexOf('host.ppa') >= 0 && errs({ host: { bessKwh: 1000, capexLines: [] } }).indexOf('host.bessKwh') >= 0);
ok('a lease never carries the host\u2019s system', (function () { var L = JSON.parse(JSON.stringify(HOST)); L.deal.structure = 'lease'; var r = CS.model(L); return r.ok && r.host === null && !r.schedule.capex.some(function (l) { return l.host; }); })());

section('Compute and charging loads');
var run = X.start(BASE), c = run.c, ctx = run.ctx;
var cl = X.computeLoad(c, ctx, 1);
ok('a GPU at the meter is its rating plus overhead and cooling', Math.abs(cl.rated - 0.70 * 1.2 * 1.15) < 1e-12, cl.rated);
ok('a pod serving draws its GPUs at the serving share', Math.abs(cl.podKwServe - 48 * cl.rated * 0.85) < 1e-9, cl.podKwServe);
ok('on-demand GPUs offered never exceed the on-demand GPUs', maxOf(cl.spotCap) <= cl.g.spot + 1e-9 && maxOf(cl.spotCap) > 0);
ok('firm compute is never below every GPU idling', Math.min.apply(null, Array.prototype.slice.call(cl.firm)) >= cl.gpus * cl.idle - 1e-9);
var coh = X.evCohorts(c), wk = 0;
for (var i = 0; i < coh.length; i++) wk += coh[i].kwh;
var days = { we: 0, wd: 0 };
for (var d = 0; d < 365; d++) { var dow = (3 + d) % 7; if (dow === 0 || dow === 6) days.we++; else days.wd++; }
var want = 8 * 1 * 20 / 0.92 * (days.wd + days.we * 0.9);
ok('a year of sessions is ports × sessions × kWh ÷ charger efficiency', Math.abs(wk - want) / want < 1e-9, [wk, want]);
ok('a car arriving on 31 December leaves in January (the year wraps)', coh.some(function (x) { return x.z > 8760; }));
var firm = new Float64Array(8760);
for (var h = 0; h < 8760; h++) firm[h] = ctx.building[h] + cl.firm[h];
var mgd = X.planEv(c, ctx, coh, firm, true), umg = X.planEv(c, ctx, coh, firm, false);
ok('on a roomy service every session is served, managed or not', mgd.unservedKwh < 1 && umg.unservedKwh < 1, [mgd.unservedKwh, umg.unservedKwh]);
function eCost(ev) { var s = 0; for (var k = 0; k < 8760; k++) s += ev[k] * ctx.price[k]; return s; }
ok('managed charging never costs more energy than unmanaged', eCost(mgd.ev) <= eCost(umg.ev) + 1e-6, [eCost(mgd.ev), eCost(umg.ev)]);
function peakWith(ev) { var p = 0; for (var k = 0; k < 8760; k++) p = Math.max(p, firm[k] + ev[k]); return p; }
ok('managed charging never lifts the peak above unmanaged', peakWith(mgd.ev) <= peakWith(umg.ev) + 1e-6, [peakWith(mgd.ev), peakWith(umg.ev)]);
var tiny = merge(c, {}); tiny.ev = c.ev;
var ctxTiny = Object.create(ctx); ctxTiny.limit = Math.min.apply(null, Array.prototype.slice.call(firm)) + 1;
var squeezed = X.planEv(c, ctxTiny, coh, firm, true);
ok('a service with little room reports what charging it cannot deliver', squeezed.unservedKwh > 100, squeezed.unservedKwh);
var ev2 = X.planEv(c, ctxTiny, coh, firm, false), over = 0;
for (h = 0; h < 8760; h++) over = Math.max(over, ev2.ev[h] - Math.max(0, ctxTiny.limit - firm[h]));
ok('unmanaged charging is still held under the service (the panel\'s load management)', over <= 1e-6, over);

section('The dispatch');
function invariants(label, input) {
  var r = X.start(input), full = X.full(r, r.c.compute.pods, r.c.battery.kw, r.c.battery.kwh), y = full.y1, D = y.dispatch.rec;
  var lim = r.ctx.limit, bat = y.battery, eff = bat.eff, maxOver = 0, balance = 0, socOk = true, powOk = true;
  for (var k = 0; k < 8760; k++) {
    maxOver = Math.max(maxOver, D.net[k] - lim);
    var expect = y.base[k] + D.sold[k] * y.cl.delta + D.chg[k] - D.dis[k] - D.lost[k];
    balance = Math.max(balance, Math.abs(Math.max(0, expect) - D.net[k]));
    if (D.soc[k] < -1e-6 || D.soc[k] > bat.usable + 1e-6) socOk = false;
    if (D.chg[k] > bat.kw + 1e-6 || D.dis[k] > bat.kw + 1e-6) powOk = false;
  }
  ok(label + ': the meter never exceeds the service limit', maxOver <= 1e-6, maxOver);
  ok(label + ': energy balances every hour', balance <= 1e-6, balance);
  ok(label + ': the battery stays inside its energy and power', socOk && powOk);
  var firmOver = 0; for (k = 0; k < 8760; k++) if (D.lost[k] > 1e-9 && y.base[k] <= lim + 1e-9) firmOver++;
  ok(label + ': firm compute is lost only in hours firm load exceeds the service', firmOver === 0, firmOver);
  return { y: y, r: r, y0: full.y0 };
}
var roomy = invariants('roomy, battery', site({ battery: { kw: 100, kwh: 200 } }));
var tight = invariants('tight, no battery', TIGHT);
var tightB = invariants('tight, battery', merge(TIGHT, { battery: { kw: 100, kwh: 200 } }));
var over4 = invariants('overloaded, no battery', merge(TIGHT, { compute: { pods: 4 } }));
var over4b = invariants('overloaded, battery', merge(TIGHT, { compute: { pods: 4 }, battery: { kw: 50, kwh: 100 } }));
ok('four pods on a 300 A service lose firm compute', over4.y.overKwh > 0 && over4.y.overHours > 100, over4.y.overHours);
ok('a battery protects firm compute: far fewer lost hours', over4b.y.overHours < over4.y.overHours / 3, [over4b.y.overHours, over4.y.overHours]);
ok('a tight service curtails some on-demand GPU-hours without a battery', tight.y.spotCurtailedGpuH > 0, tight.y.spotCurtailedGpuH);
ok('the battery lowers the peak on a tight service', tightB.y.peak < tight.y.peak - 5, [tightB.y.peak, tight.y.peak]);
var always = X.start(merge(TIGHT, { compute: { spotMode: 'always' } })), ya = X.full(always, 2, 0, 0).y1;
ok('"always on" curtails on-demand GPUs only against the service limit', ya.spotCurtailedGpuH <= tight.y.spotCurtailedGpuH, [ya.spotCurtailedGpuH, tight.y.spotCurtailedGpuH]);
var off = X.start(merge(BASE, { compute: { spotMode: 'offpeak' } })), yo = X.full(off, 1, 0, 0).y1, onPeakSold = 0;
for (h = 0; h < 8760; h++) if (off.ctx.onPeak[h]) onPeakSold += yo.dispatch.rec.sold[h];
ok('"off-peak only" sells no on-demand GPU-hours in on-peak hours', onPeakSold === 0 && yo.gpuHours.spot > 0, onPeakSold);
var cheapDemand = X.start(merge(TIGHT, { tariff: { demandCharge: 0 } })), yc = X.full(cheapDemand, 2, 0, 0).y1;
var dearDemand = X.start(merge(TIGHT, { tariff: { demandCharge: 60 } })), yd = X.full(dearDemand, 2, 0, 0).y1;
ok('with no demand charge on-demand GPUs are never curtailed under the limit', yc.spotCurtailedGpuH <= tight.y.spotCurtailedGpuH, yc.spotCurtailedGpuH);
ok('a dear demand charge curtails more on-demand GPU-hours than a free one', yd.spotCurtailedGpuH > yc.spotCurtailedGpuH, [yd.spotCurtailedGpuH, yc.spotCurtailedGpuH]);
ok('the bill is the tariff engine\'s, not the search\'s estimate', roomy.y.bill.total > 0 && Array.isArray(roomy.y.bill.months) && roomy.y.bill.months.length === 12);

/* ── the operating schedule ────────────────────────────────────────────── */
section('The year-by-year schedule');
ok('a 5-year refresh in a 10-year term is in year 5', X.refreshPlan({ compute: { refreshYears: 5 } }, 10).join() === '5');
ok('a refresh with under two years left is not bought', X.refreshPlan({ compute: { refreshYears: 4 } }, 9).join() === '4');
ok('no refresh cycle, no refresh', X.refreshPlan({ compute: { refreshYears: 0 } }, 10).length === 0);
ok('the hardware\'s age resets after a refresh', X.ageOf(5, [5]) === 4 && X.ageOf(6, [5]) === 0 && X.ageOf(9, [5]) === 3);
var sch = X.schedule(roomy.r.c, roomy.y, roomy.y0, 'own');
function line(re) { for (var q = 0; q < sch.revenue.length; q++) if (re.test(sch.revenue[q].label)) return sch.revenue[q].schedule; return null; }
var offS = line(/offtake/), edgeS = line(/edge/);
ok('offtake holds its price for the contract term, then re-prices', offS[0] === offS[1] && offS[1] === offS[2] && offS[3] < offS[2], offS.slice(0, 5));
ok('edge revenue ramps in year one, then falls with the hardware\'s age', edgeS[0] < edgeS[1] && edgeS[2] < edgeS[1], edgeS.slice(0, 4));
ok('a refresh restores the price', edgeS[5] > edgeS[4], [edgeS[4], edgeS[5]]);
var infraS = X.schedule(roomy.r.c, roomy.y, roomy.y0, 'infra');
ok('the power-layer owner buys no GPUs', !infraS.capex.some(function (l) { return l.id === 'gpu'; }) && sch.capex.some(function (l) { return l.id === 'gpu'; }));
ok('and earns its share of gross compute', Math.abs(infraS.revenue[0].schedule[0] - Math.round((offS[0] + edgeS[0] + line(/on-demand/)[0]) * 0.20)) <= 2, infraS.revenue[0]);

/* ── the pro forma ─────────────────────────────────────────────────────── */
section('The pro forma');
var M = CS.model(site({ battery: { kw: 100, kwh: 200 } }));
ok('the model runs', M.ok, M.errors);
var pf = M.proforma;
ok('the returns are the finance engine\'s own result', pf && pf.version === PF.VERSION && pf.metrics && pf.metrics.irrBuild && pf.rows.length === 10);
ok('year-one revenue is the schedule the hourly model handed over', Math.abs(pf.rows[0].revenue - M.schedule.revenue.reduce(function (a, l) { return a + l.schedule[0]; }, 0)) < 1);
ok('the chosen structure\'s IRR is the deal table\'s', Math.abs(M.deals.own.irr - pf.metrics.afterTaxIrr) < 1e-12);
ok('three structures, priced side by side', ['own', 'infra', 'lease'].every(function (k) { return M.deals[k] && !M.deals[k].error; }));
ok('the lease with no capital is valued, not given an IRR', M.deals.lease.capital === 0 && M.deals.lease.irr === null && M.deals.lease.npv > 0 && M.deals.lease.valueUplift > 0);
ok('the battery earns its storage credit', pf.tax.itc.face > 0);
ok('and no cost of storage is quoted for it', pf.metrics.lcosCents === null);
ok('the GPUs are refreshed in year 5 under the engine\'s refresh', pf.rows[4].refreshCapex > 0 && pf.rows.filter(function (r) { return r.refreshCapex > 0; }).length === 1);
ok('the compute sensitivities join the engine\'s', ['gpu-20', 'gpu+20', 'util-10', 'power+25', 'ev-25'].every(function (k) { return pf.sensitivity.some(function (s) { return s.key === k; }); }));
ok('lower GPU prices lower the IRR', pf.sensitivity.filter(function (s) { return s.key === 'gpu-20'; })[0].afterTaxIrr < pf.metrics.afterTaxIrr);
ok('the site\'s warnings lead the engine\'s', pf.warnings[0].code === 'PLANNING_RATE' || pf.warnings.some(function (w) { return w.code === 'LOAD_ASSUMED'; }));
ok('the conventions say how the site was modelled', /8,760 hours/.test(pf.assumptions[0]));
ok('the battery\'s own "not sized" warning does not apply here', !pf.warnings.some(function (w) { return w.code === 'NO_SIZING'; }));
var gross1 = M.compute.revenue.gross;
ok('one 48-GPU H200 pod grosses $650K–$900K a year (Laitent publishes ~$710K EBITDA a property)', gross1 > 650000 && gross1 < 900000, gross1);
var L0 = CS.model(site({ deal: { structure: 'lease' } }));
ok('a lease with no host capital has no pro forma, and says what it is worth', L0.ok && L0.proforma === null && L0.lease && L0.lease.npv > 0);
var L1 = CS.model(site({ deal: { structure: 'lease', lease: { hostCapex: 80000, rentPerYear: 35000, hostKeepsCharging: true } } }));
ok('Laitent\'s amenity model ($80K of chargers, $35K rent) gets the full pro forma', L1.ok && L1.proforma && L1.proforma.metrics.afterTaxIrr > 0.2, L1.proforma && L1.proforma.metrics.afterTaxIrr);
var Lev = CS.model(site({ deal: { structure: 'infra' }, finance: { debt: {} } }));
ok('project debt defaults to a hardware-life tenor inside the term', Lev.ok && Lev.proforma.debt && Lev.proforma.debt.tenorYears === 7, Lev.errors || (Lev.proforma && Lev.proforma.debt));
var bad = CS.model(site({ finance: { tax: { federalPct: 90 } } }));
ok('a finance input the engine refuses comes back on its field', bad.ok === false && bad.errors.some(function (e) { return e.field === 'finance.tax.federalPct'; }), bad.errors);
ok('the story names the compute for the deck', /pod/.test(M.story.title) && M.story.flow[0][0] === 'compute' && /seeking/.test(M.story.narrative));

section('The screen');
var S1 = CS.screen(BASE);
ok('a roomy service advances', S1.ok && S1.verdict.act === 'ADVANCE', S1.verdict);
var S2 = CS.screen(merge(TIGHT, { compute: { pods: 4 } }));
ok('firm load over the service holds, and says what fixes it', S2.verdict.act === 'HOLD' && /battery|service upgrade|fewer pods/.test(S2.verdict.gate), S2.verdict);
var S3 = CS.screen(merge(TIGHT, { ev: { managed: false, ports: 12, kwPerPort: 19.2 }, compute: { pods: 1 } }));
ok('unmanaged chargers that could exceed the service need load management', S3.verdict.act === 'VERIFY' && /625\.42|manage/.test(S3.verdict.gate + S3.verdict.label), S3.verdict);
ok('three days, twelve months and a duration curve come back', S1.days.length === 3 && S1.days[0].hours.length === 24 && S1.months.length === 12 && S1.duration.length === 52);
ok('the expected unmanaged peak is reported without the panel\'s limit, and never above every charger at full power',
  S3.ev.unmanagedPeakKw >= S3.balance.firmPeakKw && S3.ev.unmanagedPeakKw <= S3.balance.necNameplateKw && S3.balance.necNameplateKw > S3.balance.limitKw,
  [S3.ev.unmanagedPeakKw, S3.balance.firmPeakKw, S3.balance.necNameplateKw, S3.balance.limitKw]);

section('The sizing sweep');
var t0 = Date.now(), O = CS.optimize(TIGHT), ms = Date.now() - t0;
ok('the sweep runs pods against battery sizes', O.ok && O.grid.length >= 10 && O.batteries.length >= 4, O.grid && O.grid.length);
ok('the best fits and is the highest NPV that does', O.best && O.best.fits && O.grid.every(function (x) { return !x.fits || x.npv == null || x.npv <= O.best.npv; }));
ok('a size that loses firm compute never fits', O.grid.every(function (x) { return x.overloadHours === 0 || !x.fits; }));
ok('the sweep finishes well inside the function limit (' + ms + ' ms)', ms < 20000);

/* ── the deck ──────────────────────────────────────────────────────────── */
section('The deck');
global.window = global;
require(path.join(ROOT, 'proforma-logic.js'));
var R = global.OmegaProformaReport;
var html = R.render(pf, { name: 'Acme Edge' }, { title: M.story.title, flow: M.story.flow, terms: M.story.terms, narrative: M.story.narrative });
ok('the deck carries the compute site\'s title, flow and terms', html.indexOf('H200 GPUs') >= 0 && html.indexOf('1 H200 pod') >= 0 && html.indexOf('offtake') >= 0);
ok('with a compute glyph', /pf-ico/.test(html) && html.indexOf('rx=".72"') >= 0);
ok('and no NaN, undefined or Infinity', !/NaN|undefined|Infinity/.test(html.replace(/<[^>]+>/g, ' ')));
var bessOnly = PF.run({ years: 20, project: { name: 'Battery only', state: 'IL' }, bess: { kw: 500, kwh: 2000 },
  capex: { lines: [{ id: 'b', label: 'Battery', amount: 900000, asset: 'storage' }] }, revenue: { bess: { mode: 'fixed', fixedPerKwMonth: 20 } } });
var plain = R.render(bessOnly, { name: 'Acme' }, {});
ok('a BESS deck without those options is unchanged: its own title', /500 kW \/ 2 MWh battery storage in IL/.test(plain));

/* ── registrations ─────────────────────────────────────────────────────── */
section('Registrations');
var MODS = require(path.join(ROOT, 'api', '_lib', 'modules'));
ok('Omega Compute owns the tool', MODS.get('compute').tools.indexOf('computeproforma') >= 0 && MODS.catalog().filter(function (m) { return m.tools.indexOf('computeproforma') >= 0; }).length === 1);
ok('Omega Compute says what it now does', /power and load screening/i.test(MODS.get('compute').features.join(' ')) && /pro forma/i.test(MODS.get('compute').blurb));
var toolsBox = { window: {} }; toolsBox.window = toolsBox;
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'omega-tools.js'), 'utf8'), toolsBox);
var entry = toolsBox.OMEGATools.catalog().filter(function (t) { return t.key === 'computeproforma'; })[0];
ok('the registry lists it as a Finance tool at /compute-proforma.html', entry && entry.category === 'finance' && entry.file === '/compute-proforma.html', entry);
var HUBSRC = fs.readFileSync(path.join(ROOT, 'omega-workspace-hub.js'), 'utf8');
ok('the Finance hexagon lists it right after the VPP Earnings Simulator', /'vppsim', 'computeproforma'/.test(HUBSRC));
ok('the Compute hexagon lists it too', /key: 'compute',[^\n]*'computeproforma'/.test(HUBSRC));
var vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
ok('the sweep has a minute to run', vercel.functions['api/compute-proforma.js'] && vercel.functions['api/compute-proforma.js'].maxDuration === 60);

/* ── the gate ──────────────────────────────────────────────────────────── */
var SRC = fs.readFileSync(path.join(ROOT, 'api', 'compute-proforma.js'), 'utf8');
var ORG = 'example-energy.com', BASEP = 'omega_orgs/' + ORG, UID = 'u1';
function httpError(status, message) { var e = new Error(message); e.status = status; return e; }
function load(docs, caller) {
  var stub = {
    httpError: httpError,
    verifyIdToken: function (t) {
      if (t !== 'good') return Promise.reject(httpError(401, 'bad token'));
      return Promise.resolve(caller || { uid: UID, email: 'ana@' + ORG, emailVerified: true, orgId: ORG, staff: false, claims: {} });
    },
    readAsCaller: function (t, p) {
      var d = docs[p];
      if (d && d.__throws) return Promise.reject(httpError(d.__throws, 'x'));
      return Promise.resolve(d === undefined ? null : JSON.parse(JSON.stringify(d)));
    }
  };
  var box = { module: { exports: {} }, console: { error: function () {} }, process: process, Date: Date,
    require: function (n) {
      if (/\/verify-token$/.test(n)) return stub;
      if (/\/package-access$/.test(n)) return require(path.join(ROOT, 'api/_lib/package-access'));
      if (/\/compute-site$/.test(n)) return CS;
      if (/\/proforma-engine$/.test(n)) return PF;
      if (/\/deck-brand$/.test(n)) return require(path.join(ROOT, 'api/_lib/deck-brand'));
      throw new Error('api/compute-proforma.js required an unstubbed module: ' + n);
    } };
  vm.runInNewContext(SRC, box, { filename: 'api/compute-proforma.js' });
  return box.module.exports;
}
function call(docs, body, opts) {
  opts = opts || {};
  var out = { status: 0 };
  var res = { setHeader: function () {}, status: function (n) { out.status = n; return res; }, json: function (j) { out.body = j; return res; } };
  return Promise.resolve(load(docs, opts.caller)({ method: opts.method || 'POST',
    headers: { authorization: 'Bearer ' + (opts.token || 'good') }, body: body }, res)).then(function () { return out; });
}
function docs(org, bill, member) {
  var d = {}; if (org !== undefined) d[BASEP] = org; if (bill !== undefined) d[BASEP + '/billing/current'] = bill;
  if (member !== undefined) d[BASEP + '/members/' + UID] = member; return d;
}
var SCR = { action: 'screen', site: BASE };
var PKG = function (mods) { return { packaged: true, packagingState: 'paid', accessUntil: 4102444800000, modules: mods }; };

section('The design’s cost');
var D0 = CS.model(site({ compute: { pods: 2 } })), D1 = CS.model(site({ compute: { pods: 2 }, capex: { total: 1500000, basis: 'Site Map cost run' } }));
ok('without a design cost the catalog prices the capex and nothing is scaled', D0.ok !== false && D0.proforma.capexScale == null);
ok('the Site Map cost run replaces the catalog total, the lines kept for their asset classes and scaled to it', D1.ok !== false && D1.proforma.capex.total === 1500000 && D1.proforma.capexScale.to === 1500000 && D1.proforma.capexScale.from === D0.proforma.capex.total, D1.proforma && D1.proforma.capexScale);
ok('the scaled lines sum to the run exactly', D1.schedule.capex.reduce(function (a, l) { return a + l.amount; }, 0) === 1500000 && D1.schedule.capex.every(function (l) { return l.scaled === true; }));
ok('the assumptions say so', D1.proforma.assumptions.some(function (a) { return /Site Map cost run, \$1,500,000/.test(a); }), D1.proforma.assumptions[0]);
ok('a different cost is a different IRR', D0.proforma.metrics.afterTaxIrr !== D1.proforma.metrics.afterTaxIrr);
var DL = CS.model(site({ compute: { pods: 2 }, deal: { structure: 'lease' }, capex: { total: 1500000 } }));
ok('a lease carries no equipment capex, so the design cost does not apply', DL.ok !== false && (DL.proforma == null || DL.proforma.capexScale == null));
ok('a nonsense cost is refused', CS.model(site({ capex: { total: -5 } })).ok === false);
later(function () { section('Gate'); });
[
  ['GET answers with no auth and no numbers', {}, null, { method: 'GET', token: 'none' }, function (r) { return r.status === 200 && r.body.engines && !r.body.result; }],
  ['a bad token is 401', docs(), SCR, { token: 'nope' }, function (r) { return r.status === 401; }],
  ['a missing org record is allowed (legacy tenant)', docs(undefined, { tier: 'standard' }), SCR, null, function (r) { return r.status === 200 && r.body.result.verdict; }],
  ['a trial workspace runs it', docs({ status: 'active' }, { tier: 'trial' }), SCR, null, function (r) { return r.status === 200; }],
  ['pending refuses', docs({ status: 'pending' }, { tier: 'standard' }), SCR, null, function (r) { return r.status === 403; }],
  ['cancelled refuses', docs({ status: 'cancelled' }, { tier: 'standard' }), SCR, null, function (r) { return r.status === 403; }],
  ['toolOverrides.computeproforma false refuses', docs({ status: 'active' }, { tier: 'enterprise', toolOverrides: { computeproforma: false } }), SCR, null, function (r) { return r.status === 403; }],
  ['a toolAccess allowlist without it refuses (absent is not empty)', docs({ status: 'active' }, { tier: 'enterprise', toolAccess: ['editor', 'gridatlas'] }), SCR, null, function (r) { return r.status === 403; }],
  ['a toolAccess allowlist with it passes', docs({ status: 'active' }, { tier: 'enterprise', toolAccess: ['computeproforma'] }), SCR, null, function (r) { return r.status === 200; }],
  ['a member list narrows it', docs({ status: 'active' }, { tier: 'standard' }, { status: 'active', toolAccess: ['proforma'] }), SCR, null, function (r) { return r.status === 403; }],
  ['an unknown tier refuses', docs({ status: 'active' }, { tier: 'free' }), SCR, null, function (r) { return r.status === 403; }],
  ['an override lifts an unknown tier', docs({ status: 'active' }, { tier: 'free', toolOverrides: { computeproforma: true } }), SCR, null, function (r) { return r.status === 200; }],
  ['a package with Omega Compute runs it', docs({ status: 'active' }, PKG(['lite', 'compute']), { role: 'member', status: 'active' }), SCR, null, function (r) { return r.status === 200; }],
  ['a package without Omega Compute is refused', docs({ status: 'active' }, PKG(['lite', 'storage']), { role: 'member', status: 'active' }), SCR, null, function (r) { return r.status === 403 && /not in your package/.test(r.body.error); }],
  ['a read-only (unpaid) package does not run it', docs({ status: 'active' }, { packaged: true, packagingState: 'paid', accessUntil: 1000, modules: ['lite', 'compute'] }, { role: 'member', status: 'active' }), SCR, null, function (r) { return r.status === 403; }],
  ['a billing read that throws is 503, never a pass', docs({ status: 'active' }, { __throws: 502 }), SCR, null, function (r) { return r.status === 503; }],
  ['staff skip the entitlement', docs({ status: 'suspended' }), SCR, { caller: { uid: 's', email: 'x@clearsky-usa.com', emailVerified: true, orgId: 'clearsky-usa.com', staff: true } }, function (r) { return r.status === 200; }],
  ['bad input is 400 with field errors', docs(undefined, { tier: 'standard' }), { action: 'model', site: { site: { zip: 'x' } } }, null, function (r) { return r.status === 400 && r.body.errors.some(function (e) { return e.field === 'site.zip'; }); }],
  ['an unknown action is 400', docs(undefined, { tier: 'standard' }), { action: 'dump' }, null, function (r) { return r.status === 400; }],
  ['options name the GPU classes and patterns, and the finance defaults', docs(undefined, { tier: 'standard' }), { action: 'options' }, null, function (r) { return r.status === 200 && r.body.options.gpus.h200 && r.body.options.patterns.overnight && r.body.options.finance.years === 25; }],
  ['context returns the caller\'s brand for the deck', docs({ status: 'active', name: 'Example Energy' }, { tier: 'standard' }), { action: 'context' }, null, function (r) { return r.status === 200 && r.body.brand && r.body.orgId === ORG; }],
  ['model returns the pro forma', docs(undefined, { tier: 'standard' }), { action: 'model', site: BASE }, null, function (r) { return r.status === 200 && r.body.result.proforma && r.body.result.deals; }]
].forEach(function (cse) {
  later(function () {
    return call(cse[1], cse[2], cse[3] || {}).then(function (r) { ok(cse[0], cse[4](r), { status: r.status, body: r.body && (r.body.error || r.body.errors) }); });
  });
});

later(function () {
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  if (fail) process.exit(1);
});
