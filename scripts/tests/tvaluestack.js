/* What a battery earns, and who says so.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   A revenue stack is where optimism gets laundered into a spreadsheet, so
   the rule is stricter here than on the cost side, not looser. Every stream
   declares its tier, a stream nobody supplied is reported as MISSING rather
   than defaulted to zero-and-forgotten, and the two numbers most often got
   wrong — PJM accreditation and the ComEd rebate's conditions — are pinned. */
'use strict';
const path = require('path'), assert = require('assert');
global.window = global;
const V = require(path.join(__dirname, '..', '..', 'api/_lib/value-stack.js'));
let fails = 0;
function ok(name, fn){
  try { fn(); console.log('  ✓ ' + name); }
  catch (e) { fails++; console.log('  ✗ ' + name + '\n      ' + e.message); }
}

console.log('value stack — published rates, applied to one site');

ok('PJM capacity is accredited, not quoted at nameplate', function(){
  /* The commonest error in a storage pro forma: a 4-hour battery is not
     1 MW of capacity, it is 59% of 1 MW. Quoting the clearing price against
     nameplate overstates this stream by nearly half. */
  const s = V.stack({ kw: 1000, hours: 4 });
  const cap = s.streams.filter(x => x.id === 'pjm.capacity')[0];
  assert(cap, 'no capacity stream');
  const nameplate = 1 * V.PJM.price * 365;
  assert(cap.usd < nameplate * 0.65,
    'capacity is being quoted at or near nameplate ($' + Math.round(cap.usd) + ')');
  assert(/59%/.test(cap.how), 'the accreditation rate is not shown in the working');
});

ok('longer duration accredits higher, as PJM publishes it', function(){
  const four = V.stack({ kw: 1000, hours: 4 }).streams[0].usd;
  const eight = V.stack({ kw: 1000, hours: 8 }).streams[0].usd;
  assert(eight > four, 'an 8-hour battery does not accredit above a 4-hour one');
  assert.strictEqual(V.elccFor(4).rate, 0.59);
  assert.strictEqual(V.elccFor(8).rate, 0.71);
});

ok('a duration below the lowest class claims nothing', function(){
  /* There is no storage class under four hours to accredit against.
     Extrapolating one would be inventing an accreditation. */
  const s = V.stack({ kw: 1000, hours: 2 });
  assert(!s.streams.filter(x => x.id === 'pjm.capacity').length,
    'capacity revenue was claimed for a 2-hour battery');
  assert(s.missing.join(' ').indexOf('PJM capacity') >= 0,
    'and it is not reported as missing either');
});

ok('a stream with no input is MISSING, never zero', function(){
  /* A total that silently omits two of five reads like a complete answer. */
  const s = V.stack({ kw: 826, hours: 6 });
  assert(s.missing.length >= 2, 'absent streams are not reported');
  assert(!s.streams.filter(x => x.usd === 0).length,
    'an absent stream was counted as a zero-value stream');
});

ok('every stream carries a tier and a working', function(){
  const s = V.stack({ kw: 826, hours: 6, demandLoPerKwMonth: 8,
                      demandHiPerKwMonth: 14, vppPerKwYear: 150 });
  s.streams.forEach(function (x) {
    assert(x.tier, x.id + ' has no tier');
    assert(x.how && x.how.length > 10, x.id + ' shows no arithmetic');
    assert(x.ref && x.ref.length > 10, x.id + ' cites nothing');
  });
  assert(s.streams.filter(x => x.tier === 'published').length >= 1,
    'nothing in the stack is published');
});

ok('the VPP rate is NOT presented as published without a citation', function(){
  /* ComEd's Rider VPP / BYODLR is still before the ICC. */
  const s = V.stack({ kw: 826, hours: 6, vppPerKwYear: 150 });
  const vpp = s.streams.filter(x => x.id === 'vpp')[0];
  assert.strictEqual(vpp.tier, 'planning',
    'an unfiled tariff is being presented as a published rate');
  assert(/ICC|indicative/.test(vpp.ref), 'its status is not disclosed');
});

/* ── incentives ───────────────────────────────────────────────────────── */
ok('the ComEd rebate is per kWh, as their own terms state', function(){
  /* It looks like a typo and it is not: "$250 per kilowatt-hour ('kWh') …
     for eligible energy storage facilities associated with a qualified DG
     facility". Checked against ComEd's DG Rebate Terms and Conditions. */
  assert.strictEqual(V.COMED_REBATE.perKwh, 250);
  assert(/per kWh/i.test(V.COMED_REBATE.ref), 'the unit is not stated in the citation');
  assert(/comed\.com/.test(V.COMED_REBATE.url), 'no link to the source document');
});

ok('the conditions that decide the rebate travel with it, per the 2026 T&C', function(){
  /* The 2026 Terms and Conditions REPLACED the old Rate BESH supply
     commitment with participation in ComEd's SDVPP programme. Pinning the
     current conditions is the point: when ComEd changes them again, this
     test is how the change is noticed. */
  const inc = V.incentives({ capexUsd: 1021000, kwh: 5407, itcRate: 0.30,
                             rebatePerKwh: 250 });
  const reb = inc.items.filter(x => x.id === 'rebate')[0];
  assert(/qualified DG facility/i.test(reb.conditions),
    'the DG pairing condition is missing');
  assert(/SDVPP|Scheduled Dispatch/i.test(reb.conditions),
    'the SDVPP participation condition is missing');
  assert(!/Rate BESH/i.test(reb.conditions),
    'the retired Rate BESH condition is still being told to customers');
  assert(/2026/.test(V.COMED_REBATE.ref), 'the citation does not date itself');
});

ok('a rebate larger than the project is flagged, not suppressed', function(){
  const inc = V.incentives({ capexUsd: 1021000, kwh: 5407, itcRate: 0.30,
                             rebatePerKwh: 250 });
  assert(inc.flags.length === 1, 'no flag on a rebate exceeding the project');
  /* The flag must point at the CONDITIONS, not at the rate. The rate is
     right; I doubted it and ComEd's own terms say otherwise. A flag that
     tells somebody their correct number looks wrong trains them to ignore
     flags. */
  assert(/qualified DG facility/i.test(inc.flags[0]) && /SDVPP|Scheduled Dispatch/i.test(inc.flags[0]),
    'the flag does not name the conditions that actually decide the rebate');
  assert(/not necessarily wrong|designed to run this large/i.test(inc.flags[0]),
    'the flag reads as a dispute of the rate rather than a prompt to confirm terms');
  const reb = inc.items.filter(x => x.id === 'rebate')[0];
  assert(Math.round(reb.usd) === 250 * 5407,
    'the rebate was silently reduced instead of being flagged');
});

ok('a cap is applied when one is entered', function(){
  const inc = V.incentives({ capexUsd: 1021000, kwh: 5407, rebatePerKwh: 250,
                             rebateCapUsd: 400000 });
  const reb = inc.items.filter(x => x.id === 'rebate')[0];
  assert.strictEqual(Math.round(reb.usd), 400000, 'the cap was ignored');
  assert(/capped/.test(reb.how), 'the cap is not disclosed in the working');
});

/* ── the incentive book: utility and market specific ──────────────────── */
ok('every book row carries its source, date and conditions', function(){
  V.INCENTIVE_BOOK.forEach(function (b) {
    assert(b.id && b.name && b.utility, (b.id || '?') + ' has no identity');
    assert(b.tier && b.asOf, b.id + ' has no tier or asOf — an undated incentive is a rumour');
    assert(b.ref && b.ref.length > 40 && b.url, b.id + ' cites nothing');
    assert(b.conditions && b.conditions.length > 40, b.id + ' carries no conditions');
  });
});

ok('ComEd and Ameren split Illinois; nobody else gets an Illinois rebate', function(){
  const comed = V.rebatesFor({ state: 'IL', comed: true }, 'commercial', {});
  const ameren = V.rebatesFor({ state: 'IL', comed: false }, 'commercial', {});
  assert.strictEqual(comed.length, 1);
  assert.strictEqual(comed[0].id, 'comed.dg.storage');
  assert.strictEqual(ameren.length, 1);
  assert.strictEqual(ameren[0].id, 'ameren.cgr.storage');
  assert(/confirm the serving utility/i.test(ameren[0].conditions),
    'the Ameren assumption from the ZIP is not disclosed');
  const mo = V.rebatesFor({ state: 'MO' }, 'commercial', {});
  assert.strictEqual(mo.length, 0, 'a state with no programme invented one');
});

ok('Illinois pays by customer class: $250 large C&I, $300 residential', function(){
  assert.strictEqual(V.rebatesFor({ state: 'IL', comed: true }, 'commercial', {})[0].perKwh, 250);
  assert.strictEqual(V.rebatesFor({ state: 'IL', comed: true }, 'residential', {})[0].perKwh, 300);
});

ok('SGIP prices at the ITC-adjusted rate when the ITC is claimed', function(){
  assert.strictEqual(V.rebatesFor({ state: 'CA' }, 'commercial', { itcClaimed: true })[0].perKwh, 180);
  assert.strictEqual(V.rebatesFor({ state: 'CA' }, 'commercial', { itcClaimed: false })[0].perKwh, 250);
});

ok('NYSERDA pays by region, and only the first 20,000 kWh', function(){
  const nyc = V.rebatesFor({ state: 'NY', nyc: true }, 'commercial', {})[0];
  const ros = V.rebatesFor({ state: 'NY', nyc: false }, 'commercial', {})[0];
  assert.strictEqual(nyc.perKwh, 125);
  assert.strictEqual(ros.perKwh, 175);
  const inc = V.incentives({ capexUsd: 20000000, kwh: 25000, rebates: [ros] });
  const row = inc.items.filter(x => x.id === 'ny.nyserda.retail')[0];
  assert.strictEqual(Math.round(row.usd), 175 * 20000,
    'the 20,000 kWh programme ceiling was not applied');
  assert(/at most 20,000 kWh/.test(row.how), 'the ceiling is not shown in the working');
});

ok('Maryland is a percent-of-cost grant, capped, and planning-grade', function(){
  const md = V.rebatesFor({ state: 'MD' }, 'commercial', {})[0];
  assert.strictEqual(md.tier, 'planning', 'a first-come grant from a tiny budget read as bankable');
  const inc = V.incentives({ capexUsd: 1000000, kwh: 800, rebates: [md] });
  const row = inc.items.filter(x => x.id === 'md.rces.grant')[0];
  assert.strictEqual(Math.round(row.usd), 150000, '30% of $1M should cap at $150k');
  assert(/capped/.test(row.how));
});

ok('residential-only exclusions hold: SGIP/NYSERDA/MD rows are nonresidential', function(){
  assert.strictEqual(V.rebatesFor({ state: 'CA' }, 'residential', {}).length, 0);
  assert.strictEqual(V.rebatesFor({ state: 'NY', nyc: true }, 'residential', {}).length, 0);
  assert.strictEqual(V.rebatesFor({ state: 'MD' }, 'residential', {}).length, 0);
});

/* ── utility cost, both directions ────────────────────────────────────── */
ok('utility cost reports capex AND opex, and guesses neither', function(){
  /* A pro forma carrying only the one-off cost is wrong every year after
     the first. */
  const u = V.utilityCost({ kw: 826 });
  assert.strictEqual(u.capexUsd, null);
  assert.strictEqual(u.opexPerYear, null);
  assert(/interconnection study/i.test(u.capexNote), 'capex note says nothing useful');
  assert(/every year|annually/i.test(u.opexNote), 'the recurring nature is not stated');
  const u2 = V.utilityCost({ kw: 826, standbyPerKwMonth: 2 });
  assert.strictEqual(Math.round(u2.opexPerYear), 826 * 2 * 12);
});

/* ── the lifecycle: the stack against the cost of the project ─────────── */
const PF = require(path.join(__dirname, '..', '..', 'api/_lib/proforma-engine.js'));
const LC_IN = () => ({ capexUsd: 1000000, incentiveUsd: 300000, kwh: 1600,
  streams: [
    { id: 'bill.demand', name: 'Demand', usd: 60000, basis: 'power', escalates: true },
    { id: 'bill.tou', name: 'TOU', usd: 15000, basis: 'energy', escalates: true },
    { id: 'prog', name: 'Programme', usd: 30000, basis: 'power', escalates: false }
  ] });

ok('no project cost, no IRR — a refusal, not a guess', function(){
  const r = V.lifecycle({ streams: LC_IN().streams });
  assert.strictEqual(r.ok, false);
  assert(/cost/i.test(r.error), 'the error does not say what is missing');
  const r2 = V.lifecycle({ capexUsd: 1000000, streams: [] });
  assert.strictEqual(r2.ok, false, 'an empty stack produced a cash flow');
});

ok('the IRR and payback are the finance engine\'s own, on these flows', function(){
  const r = V.lifecycle(LC_IN());
  assert(r.ok, r.error);
  const flows = r.rows.map(x => x.net);
  assert.strictEqual(r.rows[0].net, -(1000000 - 300000), 'year 0 is not the net cost');
  assert.strictEqual(r.irr, PF.irr(flows), 'a second IRR implementation crept in');
  assert.strictEqual(r.paybackYears, PF.payback(flows), 'a second payback implementation crept in');
  assert(r.irr > 0 && r.irr < 0.5, 'IRR outside any plausible band: ' + r.irr);
});

ok('incentives that cover the cost: no net IRR, day-one payback, and the full-cost view beside it', function(){
  /* 760 kWh in Ameren territory, 2026-10-06: the storage rebate alone
     exceeded the project cost, net $0, and the panel showed a dash. */
  const i = LC_IN(); i.capexUsd = 178802; i.incentiveUsd = 243641;
  const r = V.lifecycle(i);
  assert(r.ok, r.error);
  assert.strictEqual(r.netCostUsd, 0, 'the net cost is not zero');
  assert.strictEqual(r.incentivesCoverCost, true);
  assert.strictEqual(r.irr, null, 'an IRR on nothing at risk');
  assert.strictEqual(r.paybackYears, 0, 'payback is not day one');
  const gf = r.rows.map(x => x.net); gf[0] = -178802;
  assert.strictEqual(r.gross.capexUsd, 178802);
  assert.strictEqual(r.gross.irr, PF.irr(gf), 'the full-cost IRR is not the engine\'s on the full-cost flows');
  assert.strictEqual(r.gross.paybackYears, PF.payback(gf));
  assert(r.gross.irr > 0, 'a 760 kWh battery earning $100k+ a year against $179k has no return: ' + r.gross.irr);
  assert(/full cost/i.test(r.irrNote) && /day one/i.test(r.irrNote), 'the note does not say why: ' + r.irrNote);
  assert(r.assumptions.some(a => /full cost/i.test(a)), 'the assumption list does not carry it');
  /* an ordinary case carries the full-cost view too, and no note */
  const o = V.lifecycle(LC_IN());
  assert.strictEqual(o.incentivesCoverCost, false);
  assert.strictEqual(o.irrNote, null);
  assert(o.gross && o.gross.irr < o.irr, 'the full-cost IRR should sit below the net one');
});

ok('year 1 already carries a year of fade and no escalation bump', function(){
  /* Indexing fade from year 1 gifts the model a free year of a brand-new
     battery; escalating year 1 charges the customer a year early. */
  const base = LC_IN();
  base.streams = [{ id: 'tou', name: 'TOU', usd: 10000, basis: 'energy', escalates: true }];
  base.augmentAtPct = 0;
  const r = V.lifecycle(base);
  assert(Math.abs(r.rows[1].revenue - 10000 * Math.pow(1 - 0.018, 1)) < 1,
    'year 1 revenue is ' + r.rows[1].revenue + ', not one year of fade on the quoted dollars');
});

ok('energy streams fade faster than power streams', function(){
  const mk = basis => {
    const i = LC_IN();
    i.streams = [{ id: 's', name: 's', usd: 10000, basis: basis, escalates: false }];
    i.augmentAtPct = 0;
    return V.lifecycle(i);
  };
  const e = mk('energy'), p = mk('power');
  assert(e.rows[10].revenue < p.rows[10].revenue,
    'an energy-paid stream does not fade faster than a power-paid one');
});

ok('one augmentation, bought when usable falls below the line, resets energy fade', function(){
  /* A faster fade pulls the augmentation into mid-horizon so the years
     after it are on the table to inspect. */
  const fast = LC_IN(); fast.energyFadePct = 0.05;
  const r = V.lifecycle(fast);
  assert.strictEqual(r.augmentations, 1, 'expected exactly one augmentation');
  const augRow = r.rows.filter(x => x.augment > 0)[0];
  assert(augRow, 'no row carries the augmentation cost');
  assert(augRow.capacityPct === 1, 'the augment year does not return to nameplate');
  assert(r.rows[augRow.year + 1].capacityPct >= 0.94,
    'the year AFTER the augmentation fell straight back to the old fade — the buy-back lasted one year');
  const off = LC_IN(); off.augmentAtPct = 0;
  assert.strictEqual(V.lifecycle(off).augmentations, 0, 'augmentAtPct 0 does not disable it');
});

ok('incentives are capped at the project cost and the cap is disclosed', function(){
  const i = LC_IN(); i.incentiveUsd = 2000000;
  const r = V.lifecycle(i);
  assert.strictEqual(r.netCostUsd, 0, 'net cost went negative');
  assert(r.assumptions.join(' ').indexOf('capped') >= 0, 'the cap is silent');
});

ok('a project that never pays back says so, in both figures', function(){
  const i = LC_IN();
  i.streams = [{ id: 's', name: 's', usd: 100, basis: 'power', escalates: false }];
  const r = V.lifecycle(i);
  assert.strictEqual(r.paybackYears, null, 'a payback was reported for a project that has none');
  assert.strictEqual(r.irr, null, 'an IRR was reported with no sign change in the flows');
});

ok('every lifecycle assumption is stated, with its grade', function(){
  const r = V.lifecycle(LC_IN());
  const all = r.assumptions.join(' ');
  assert(/unlevered, pre-tax/i.test(all), 'the IRR\'s grade is not stated');
  assert(/Pro Forma/i.test(all), 'the reader is not pointed at the full treatment');
  assert(/NREL ATB/i.test(all), 'the O&M convention cites nothing');
  assert(/flat/i.test(all), 'the flat treatment of programme revenue is not disclosed');
});

/* ── bankability: the investor's cut of the same streams ──────────────── */
const BK_STREAMS = [
  { id: 'bill.demand', name: 'Demand charges avoided', category: 'bill', usd: 20000, tier: 'computed', counted: true },
  { id: 'bill.tou', name: 'TOU energy', category: 'bill', usd: 8000, tier: 'computed', counted: true },
  { id: 'pjm.capacity', name: 'PJM capacity', category: 'grid', usd: 30000, tier: 'published', counted: true,
    bank: { paidBy: 'PJM settlement, via a curtailment service provider', vehicle: 'CSP agreement', tenor: 'one delivery year per auction' } },
  { id: 'pjm.comedvpp', name: 'ComEd Rider VPP', category: 'grid', usd: 40000, tier: 'planning', counted: true,
    bank: { paidBy: 'ComEd', vehicle: 'rider enrolment', tenor: 'annual' } },
  { id: 'pjm.plc', name: 'PLC', category: 'grid', usd: 99000, tier: 'planning', counted: false, why: 'same hours' }
];

ok('a saving is not revenue: bill streams need the ESA, and say so', function(){
  const b = V.bankability(BK_STREAMS, { owner: 0.7 });
  const demand = b.rows.filter(r => r.id === 'bill.demand')[0];
  assert(demand && demand.grade === 'host-contract');
  assert.strictEqual(demand.paidBy, 'the host customer');
  assert(/shared-savings|energy services/i.test(demand.vehicle), 'the ESA is not named');
  assert(/not the project's revenue/i.test(demand.vehicle),
    'the distinction between a saving and revenue is not stated');
});

ok('a programme stream carries its real counterparty, net of the share', function(){
  const b = V.bankability(BK_STREAMS, { owner: 0.7 });
  const cap = b.rows.filter(r => r.id === 'pjm.capacity')[0];
  assert.strictEqual(Math.round(cap.usdYr), 21000, 'the owner share was not applied');
  assert.strictEqual(cap.grossYr, 30000, 'the gross is not disclosed beside it');
  assert(/curtailment service provider/i.test(cap.paidBy));
  assert(/delivery year/i.test(cap.tenor), 'the reset cadence is missing');
});

ok('a planning rate is upside, never collateral', function(){
  const b = V.bankability(BK_STREAMS, { owner: 0.7 });
  const vpp = b.rows.filter(r => r.id === 'pjm.comedvpp')[0];
  assert(/not underwriteable/i.test(vpp.note || ''), 'the planning stream carries no warning');
  assert.strictEqual(Math.round(b.totals.underwriteableYr), 20000 + 8000 + 21000,
    'the underwriteable total does not exclude exactly the planning streams');
  assert.strictEqual(Math.round(b.totals.planningYr), 28000);
});

ok('an uncounted stream never reaches the investor view', function(){
  const b = V.bankability(BK_STREAMS, { owner: 0.7 });
  assert(!b.rows.some(r => r.id === 'pjm.plc'), 'a stream the dispatch refused is in the ladder');
});

ok('the paperwork list names the three contracts and the ITC transfer', function(){
  const all = V.bankability(BK_STREAMS, { owner: 0.7 }).contracts.join(' ');
  assert(/shared-savings/i.test(all), 'no ESA');
  assert(/curtailment-service-provider|aggregator/i.test(all), 'no aggregator agreement');
  assert(/assignable/i.test(all), 'assignability to the project entity is not raised');
  assert(/6418/.test(all), 'the ITC transfer is not mentioned');
});

ok('every programme in the simulator carries its counterparty facts', function(){
  /* The bank facts ride each programme row in vpp-sim.js, one copy, beside
     the ref — a programme without them would print "the programme" in an
     investor table, which reads like evasion. */
  const SIM = require(path.join(__dirname, '..', '..', 'api/_lib/vpp-sim.js'));
  SIM.PROGRAMS.forEach(function (p) {
    assert(p.bank && p.bank.paidBy && p.bank.vehicle && p.bank.tenor,
      p.id + ' has no bank facts (paidBy / vehicle / tenor)');
  });
});

console.log(fails ? '\n' + fails + ' failed' : '\nall passed');
process.exit(fails ? 1 : 0);
