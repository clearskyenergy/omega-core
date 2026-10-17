/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   Offline checks for the analysis engines: reference cases, rate sanity,
   ZIP territory, and how old a dated source is. No network. The CLI is
   scripts/validate-analysis-data.js; it adds the optional live probes. */
'use strict';

var T = require('./bess-tariff');
var V = require('./value-stack');
var Rates = require('./utility-rates');
var Sim = require('./vpp-sim');
var PF = require('./proforma-engine');
var Screen = require('../../omega-demand-screen');
var Host = require('./hosting-capacity');
var Comed = require('./comed-service');

var MONTHS = { january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

function ageDays(iso, now) {
  var t = Date.parse(iso + 'T00:00:00Z');
  if (!isFinite(t)) return null;
  return Math.floor((now.getTime() - t) / 86400000);
}

function readDates(text) {
  var out = [], re = /read\s+(20\d{2}-\d{2}-\d{2})/gi, m;
  var s = String(text || '');
  while ((m = re.exec(s))) out.push(m[1]);
  return out;
}

function comedToken(service) {
  var m = /_([A-Z]{3})(20\d{2})/.exec(String(service || ''));
  if (!m || MONTHS[m[1].toLowerCase()] == null) return null;
  return { token: m[1] + m[2], year: +m[2], month: MONTHS[m[1].toLowerCase()] };
}

function run(opts) {
  opts = opts || {};
  var now = opts.now instanceof Date ? opts.now : new Date();
  var staleDays = opts.staleDays != null ? opts.staleDays : 45;
  var errorDays = opts.errorDays != null ? opts.errorDays : 180;
  var checks = [];

  function add(c) {
    checks.push({
      id: c.id, severity: c.severity || 'error', ok: !!c.ok,
      message: c.message, detail: c.detail == null ? null : c.detail
    });
  }

  /* ── reference cases ── */
  var cap = V.stack({ kw: 1000, hours: 4 });
  var pjm = cap && cap.streams.filter(function (s) { return s.id === 'pjm.capacity'; })[0];
  add({
    id: 'ref.pjm.capacity.4h',
    ok: pjm && Math.abs(pjm.usd - 69988.75) < 0.01,
    message: '1 MW, 4-hour storage: 59% ELCC × $325/MW-day × 365 = $69,988.75',
    detail: { usd: pjm && pjm.usd }
  });

  var flat = T.flatTariff({ demandChargePerKw: 20, energyRate: 0.1, fixedPerMonth: 15 });
  var bill = T.billFromMonthly([{ month: 0, kwh: 10000, facilityKw: 100, days: 31 }], flat);
  add({
    id: 'ref.bill.flat',
    ok: bill && Math.abs(bill.total - 3015) < 0.01,
    message: '100 kW at $20/kW plus 10,000 kWh at $0.10 plus a $15 customer charge = $3,015',
    detail: { total: bill && bill.total }
  });

  var ratchetTariff = T.normalize({
    name: 'ratchet',
    flatdemandstructure: [[{ rate: 10 }]],
    flatdemandmonths: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    demandratchetpercentage: 50
  });
  var ratchetBill = T.billFromMonthly([{ month: 0, facilityKw: 100 }, { month: 1, facilityKw: 40 }], ratchetTariff);
  var month1 = ratchetBill.months[1].lines.filter(function (l) { return l.kind === 'demand-facility'; })[0];
  add({
    id: 'ref.bill.ratchet',
    ok: month1 && month1.qty === 50 && Math.abs(ratchetBill.total - 1500) < 0.01,
    message: 'A 50% ratchet bills month 2 at max(40 kW, 50% of 100 kW) = 50 kW, $1,500 for the two months',
    detail: { qty: month1 && month1.qty, total: ratchetBill.total }
  });

  var base = Screen.basis({ annualBill: 120000, demandRate: 20, energyRate: 0.1, demandBillPct: 0.4 });
  var screen = base && Screen.savings({ peakKw: base.peakKw, shavePct: 0.25, demandRate: 20, peakHours: 4, ratchet: 0.7 });
  add({
    id: 'ref.demand-screen',
    ok: base && base.peakKw === 200 && base.annualEnergyKwh === 720000 &&
      screen && screen.shaveKW === 50 && screen.battKWh === 200 &&
      screen.annualSavingsDemand === 12000 && screen.ratchetSavings === 0 &&
      screen.totalAnnualSavings === 12000,
    message: '50 kW shaved at $20/kW-month for 12 months is $12,000. A 0.70 ratchet is not added again (that used to make $14,400).',
    detail: screen
  });

  var itcFull = PF.itcRate({ pwa: true, energyCommunity: true, domesticContent: true }, { asset: 'storage', kwAc: 2000, bocMonth: '2026-06' });
  var itcBase = PF.itcRate({}, { asset: 'storage', under1MWac: true, bocMonth: '2026-06' });
  var itcCliff = PF.itcRate({ pwa: true }, { asset: 'solar', kwAc: 500, bocMonth: '2026-08', pisMonth: '2028-06' });
  add({
    id: 'ref.itc.statutory',
    ok: itcFull.ratePct === 50 && itcBase.ratePct === 30 && itcCliff.ratePct === 0,
    message: 'Storage with wage and both 10-point adders is 50%. Under 1 MW with no adders is 30%. Solar begun after 4 July 2026 and in service after 2027 is 0%.',
    detail: { full: itcFull.ratePct, base: itcBase.ratePct, cliff: itcCliff.ratePct }
  });

  var rebate = V.incentives({ capexUsd: 400000, kwh: 100, itcRate: 0.3, rebates: V.rebatesFor({ state: 'IL', comed: true }, 'commercial', {}) });
  var rebateUsd = rebate.items.filter(function (x) { return x.id === 'comed.dg.storage'; })[0];
  add({
    id: 'ref.comed.rebate',
    ok: rebateUsd && rebateUsd.usd === 25000,
    message: 'ComEd large C&I storage rebate is $250/kWh: 100 kWh is $25,000',
    detail: { usd: rebateUsd && rebateUsd.usd }
  });

  /* 1 MW. 4 h stays on nameplate (4,000 kWh is under 5 kWh/kW). 8 h pays
     5,000 kWh. 10 MW × 4 h (40,000 kWh) hits the 25,000 kWh total, because
     5 kWh/kW would still allow 50,000. A date before 2026-06-01 pays nameplate. */
  function ilUsd(comed, kwh, kw, systemDate) {
    var id = comed ? 'comed.dg.storage' : 'ameren.cgr.storage';
    var inc = V.incentives({
      capexUsd: 50000000, kwh: kwh, kw: kw, systemDate: systemDate,
      rebates: V.rebatesFor({ state: 'IL', comed: comed }, 'commercial', {})
    });
    var row = inc.items.filter(function (x) { return x.id === id; })[0];
    return row ? row.usd : null;
  }
  var cap4 = ilUsd(true, 4000, 1000, '2026-06-01');
  var cap8 = ilUsd(true, 8000, 1000, '2026-06-01');
  var capTotal = ilUsd(true, 40000, 10000, '2026-06-01');
  var capBefore = ilUsd(true, 8000, 1000, '2026-05-31');
  var capAmeren = ilUsd(false, 8000, 1000, '2026-06-01');
  add({
    id: 'ref.il.rebate.cap',
    ok: cap4 === 1000000 && cap8 === 1250000 && capTotal === 6250000 &&
      capBefore === 2000000 && capAmeren === 1250000,
    message: 'From 2026-06-01, ComEd and Ameren pay the lesser of nameplate, 5 kWh per kW, and 25,000 kWh. A 1 MW / 4 h battery stays $1,000,000. A 1 MW / 8 h battery is $1,250,000 (it was $2,000,000). A 10 MW / 4 h battery is $6,250,000.',
    detail: { mw4h: cap4, mw8h: cap8, mw10at4h: capTotal, before: capBefore, ameren8h: capAmeren }
  });

  /* ── territory ── */
  var places = [
    ['60601', 'comed', 'IL', 'PJM', true],
    ['60901', 'comed', 'IL', 'PJM', true],
    ['61201', 'midamerican', 'IL', 'MISO', false],
    ['61401', 'ameren', 'IL', 'MISO', false],
    ['62201', 'ameren', 'IL', 'MISO', false],
    ['62701', 'ameren', 'IL', 'MISO', false],
    ['06511', 'ui_ct', 'CT', 'ISONE', false],
    ['06103', 'eversource_ct', 'CT', 'ISONE', false],
    ['02903', 'state:RI', 'RI', 'ISONE', false],
    ['05501', 'state:MA', 'MA', 'ISONE', false],
    ['39819', 'state:GA', 'GA', 'SE', false],
    ['56901', 'state:DC', 'DC', 'PJM', false],
    ['88501', 'state:TX', 'TX', 'ERCOT', false],
    ['00501', 'state:NY', 'NY', 'NYISO', false]
  ];
  places.forEach(function (row) {
    var rec = Rates.lookup(row[0]);
    var loc = Sim.locate(row[0]);
    add({
      id: 'territory.' + row[0],
      ok: rec.key === row[1] && loc.ok && loc.state === row[2] && loc.market === row[3] && loc.comed === row[4],
      message: row[0] + ' is ' + row[1] + ' in ' + row[2] + ' / ' + row[3] + (row[4] ? ' (ComEd)' : ''),
      detail: { key: rec.key, state: loc.state, market: loc.market, comed: loc.comed }
    });
  });

  /* ── sanity of the books ── */
  var badRates = [];
  function scanRate(name, r) {
    if (!(r.demandRate >= 5 && r.demandRate <= 80)) badRates.push(name + ' demand ' + r.demandRate);
    if (!(r.energyRate >= 0.03 && r.energyRate <= 0.5)) badRates.push(name + ' energy ' + r.energyRate);
    if (!(r.ratchet >= 0 && r.ratchet <= 1)) badRates.push(name + ' ratchet ' + r.ratchet);
    if (!(r.demandPct >= 0.15 && r.demandPct <= 0.6)) badRates.push(name + ' demand share ' + r.demandPct);
  }
  Object.keys(Rates._tables.detailed).forEach(function (k) { scanRate(k, Rates._tables.detailed[k]); });
  Object.keys(Rates._tables.states).forEach(function (k) { scanRate(k, Rates._tables.states[k]); });
  add({
    id: 'sanity.rate-book',
    ok: badRates.length === 0,
    message: badRates.length ? badRates.join('; ') : 'Every planning demand, energy, ratchet and demand-share figure is inside the screening bounds',
    detail: { outliers: badRates }
  });

  var elccOk = true, prev = 0, ei;
  for (ei = 0; ei < V.PJM.elcc.length; ei++) {
    var pair = V.PJM.elcc[ei];
    if (!(pair[1] > prev && pair[1] < 1)) elccOk = false;
    prev = pair[1];
  }
  add({
    id: 'sanity.pjm.elcc',
    ok: elccOk && V.PJM.price >= 50 && V.PJM.price <= 1000,
    message: 'PJM storage ELCC rises with duration and stays below 100%, and the clearing price is inside $50–$1,000/MW-day',
    detail: { price: V.PJM.price, elcc: V.PJM.elcc }
  });

  var badInc = [];
  V.INCENTIVE_BOOK.forEach(function (b) {
    if (b.perKwh != null && !(b.perKwh > 0 && b.perKwh <= 500)) badInc.push(b.id + ' perKwh');
    if (b.resPerKwh != null && !(b.resPerKwh > 0 && b.resPerKwh <= 500)) badInc.push(b.id + ' resPerKwh');
    if (b.pctOfCost != null && !(b.pctOfCost > 0 && b.pctOfCost <= 1)) badInc.push(b.id + ' pct');
    if (!b.asOf || !b.url) badInc.push(b.id + ' missing asOf or url');
  });
  add({
    id: 'sanity.incentives',
    ok: badInc.length === 0,
    message: badInc.length ? badInc.join('; ') : 'Incentive rows have a source, an as-of, and a rate inside the screening bounds',
    detail: { outliers: badInc }
  });

  /* ── freshness: only a "read YYYY-MM-DD" counts, not the tariff's effective date ── */
  var dated = [];
  V.INCENTIVE_BOOK.forEach(function (b) {
    readDates(b.asOf).forEach(function (d) { dated.push({ id: b.id, read: d, age: ageDays(d, now) }); });
  });
  var stale = dated.filter(function (d) { return d.age > staleDays; });
  var expired = dated.filter(function (d) { return d.age > errorDays; });
  add({
    id: 'freshness.incentive-reads',
    severity: expired.length ? 'error' : (stale.length ? 'warn' : 'info'),
    ok: stale.length === 0,
    message: stale.length
      ? stale.map(function (d) { return d.id + ' last read ' + d.read + ' (' + d.age + ' days)'; }).join('; ')
      : 'Every incentive row was read within ' + staleDays + ' days',
    detail: { staleDays: staleDays, errorDays: errorDays, reads: dated }
  });

  var token = comedToken(Comed.SERVICE);
  var comedAge = token ? ((now.getUTCFullYear() - token.year) * 12 + (now.getUTCMonth() - token.month)) : null;
  add({
    id: 'freshness.comed-service',
    severity: comedAge == null || comedAge >= 3 ? 'error' : (comedAge >= 2 ? 'warn' : 'info'),
    ok: comedAge != null && comedAge <= 1,
    message: token
      ? 'ComEd hosting service token is ' + token.token + ' (' + comedAge + ' month' + (comedAge === 1 ? '' : 's') + ' behind this month). The name rotates; one month of lag is expected.'
      : 'ComEd hosting service URL has no MONYYYY token',
    detail: { service: Comed.SERVICE, ageMonths: comedAge }
  });

  var undated = (Sim.PROGRAMS || []).filter(function (p) { return readDates(p.ref).length === 0; }).map(function (p) { return p.id; });
  add({
    id: 'freshness.programmes-undated',
    severity: 'info',
    ok: true,
    message: undated.length + ' grid-programme rows are planning figures with no read date. They are labelled planning in the simulator; a dated tariff replaces them.',
    detail: { ids: undated }
  });

  Host.SOURCES.forEach(function (s) {
    add({
      id: 'hosting.' + s.id,
      severity: 'info',
      ok: /^https:\/\//.test(s.service) && s.layer != null && s.verified,
      message: s.utility + ' ' + s.grain + ' via ' + s.access + ', verified ' + s.verified,
      detail: { id: s.id, units: s.units, auth: s.auth }
    });
  });

  var errors = checks.filter(function (c) { return !c.ok && c.severity === 'error'; });
  var warnings = checks.filter(function (c) { return !c.ok && c.severity === 'warn'; });
  return {
    ok: errors.length === 0,
    generatedAt: now.toISOString(),
    mode: 'offline',
    summary: {
      passed: checks.filter(function (c) { return c.ok; }).length,
      errors: errors.length,
      warnings: warnings.length,
      checks: checks.length
    },
    checks: checks
  };
}

module.exports = { run: run, ageDays: ageDays, readDates: readDates, comedToken: comedToken };
