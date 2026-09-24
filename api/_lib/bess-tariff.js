/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
/* ====================================================================== *
 *  TARIFF ENGINE — what the meter actually costs
 *  ------------------------------------------------------------------    *
 *  The sizing engine valued every shaved kW at ONE demand rate. Almost no
 *  commercial tariff works that way. A typical C&I schedule bills:
 *
 *    a facility (non-coincident) demand charge on the month's highest kW,
 *    an on-peak demand charge on the highest kW DURING the on-peak window,
 *    sometimes a part-peak charge on a third window,
 *    energy at a different price in each window,
 *    all of it seasonal,
 *    and a ratchet on some components and not others.
 *
 *  Those are different determinants and a battery cannot shave them all at
 *  once - shaving the 4pm coincident peak and shaving the 11am facility
 *  peak are different dispatches worth different money. Collapsing them
 *  into one $/kW is not a rounding error: on a summer-only on-peak charge
 *  it is the difference between most of the value and none of it, and it
 *  swamps every other correction in this codebase.
 *
 *  SCHEMA. This is the OpenEI Utility Rate Database shape, deliberately.
 *  URDB is public, free, and carries thousands of US tariffs; building to
 *  anything else would mean writing an importer later and getting the
 *  edge cases wrong. A URDB record drops in here essentially as-is.
 *
 *    energyratestructure      [period][tier] {max, rate, adj, sell}
 *    energyweekdayschedule    12 x 24 matrix of period indices
 *    energyweekendschedule    12 x 24
 *    demandratestructure      [period][tier] {max, rate, adj}
 *    demandweekdayschedule    12 x 24        TOU (coincident) demand
 *    demandweekendschedule    12 x 24
 *    flatdemandstructure      [period][tier] {max, rate, adj}
 *    flatdemandmonths         12 period indices   facility demand
 *    fixedchargefirstmeter    $/month
 *    demandratchetpercentage  0-100, applied to the trailing 11 months
 *
 *  Months are 0-11 and hours are 0-23 local clock, which is what URDB
 *  uses. Tiers are cumulative within the month, as URDB defines them.
 * ====================================================================== */

var HOURS = 24, MONTHS = 12;

function num(v, d) {
  var n = Number(v);
  return (v == null || v === '' || !isFinite(n)) ? d : n;
}

/* ---------------------------------------------------------------------- *
 *  Normalising. A tariff that is wrong in a way nobody notices is worse
 *  than one that is refused, so this is strict about shape and explicit
 *  about what it filled in.
 * ---------------------------------------------------------------------- */
function normalize(raw) {
  raw = raw || {};
  var t = {
    name: String(raw.name || raw.rateName || 'Unnamed rate'),
    utility: String(raw.utility || raw.utilityName || ''),
    sector: String(raw.sector || 'Commercial'),
    source: raw.source || null,
    notes: []
  };

  t.energyRates  = tierTable(raw.energyratestructure);
  t.demandRates  = tierTable(raw.demandratestructure);
  t.flatRates    = tierTable(raw.flatdemandstructure);

  t.energyWeekday = schedule(raw.energyweekdayschedule, t.energyRates.length);
  t.energyWeekend = schedule(raw.energyweekendschedule || raw.energyweekdayschedule,
                             t.energyRates.length);
  t.demandWeekday = schedule(raw.demandweekdayschedule, t.demandRates.length);
  t.demandWeekend = schedule(raw.demandweekendschedule || raw.demandweekdayschedule,
                             t.demandRates.length);

  /* flatdemandmonths maps each month to a row of flatdemandstructure. A
     tariff with a facility charge and no month map is a tariff whose
     facility charge never applies, which is never what was meant. */
  t.flatMonths = [];
  var fm = raw.flatdemandmonths;
  for (var m = 0; m < MONTHS; m++) {
    var idx = Array.isArray(fm) ? num(fm[m], -1) : -1;
    t.flatMonths.push((idx >= 0 && idx < t.flatRates.length) ? idx : -1);
  }
  if (t.flatRates.length && !t.flatMonths.some(function (x) { return x >= 0; })) {
    for (var m2 = 0; m2 < MONTHS; m2++) t.flatMonths[m2] = 0;
    t.notes.push('A facility demand rate was given with no month map, so it ' +
                 'was applied to every month.');
  }

  t.fixedPerMonth = num(raw.fixedchargefirstmeter, 0);
  if (String(raw.fixedchargeunits || '').indexOf('day') >= 0) {
    t.fixedIsDaily = true;
  }
  t.ratchetPct = num(raw.demandratchetpercentage, 0);
  t.taxPct = num(raw.taxpercentage != null ? raw.taxpercentage : raw.taxPct, 0);
  /* A per-kWh rider that rides on metered energy. Round-trip losses pay it
     too, which is why it is modelled and not folded into the energy rate. */
  t.adderPerKwh = num(raw.adderPerKwh, 0);

  t.hasEnergy = t.energyRates.length > 0;
  t.hasTouDemand = t.demandRates.length > 0;
  t.hasFlatDemand = t.flatRates.length > 0;
  if (!t.hasEnergy && !t.hasTouDemand && !t.hasFlatDemand) {
    t.notes.push('This tariff has no energy and no demand charges - every ' +
                 'bill under it is the fixed charge alone.');
  }
  return t;
}

/* URDB tiers: [{max, rate, adj}]. `max` is the cumulative kWh (or kW) at
   which the next tier begins; the last tier is unbounded. */
function tierTable(rows) {
  if (!Array.isArray(rows)) return [];
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var period = Array.isArray(rows[i]) ? rows[i] : [rows[i]];
    var tiers = [];
    for (var j = 0; j < period.length; j++) {
      var tr = period[j] || {};
      tiers.push({
        max:  (tr.max == null || tr.max === '') ? Infinity : num(tr.max, Infinity),
        rate: num(tr.rate, 0) + num(tr.adj, 0)
      });
    }
    if (!tiers.length) tiers.push({ max: Infinity, rate: 0 });
    out.push(tiers);
  }
  return out;
}

/* A 12x24 matrix of period indices. Anything out of range is clamped to
   period 0 rather than silently dropping the hour from the bill. */
function schedule(m, periodCount) {
  var out = [], r, h;
  var ok = Array.isArray(m) && m.length === MONTHS;
  for (r = 0; r < MONTHS; r++) {
    var row = [];
    for (h = 0; h < HOURS; h++) {
      var v = ok && Array.isArray(m[r]) ? num(m[r][h], 0) : 0;
      if (!(v >= 0) || (periodCount > 0 && v >= periodCount)) v = 0;
      row.push(v);
    }
    out.push(row);
  }
  return out;
}

/* Cost of `qty` under a cumulative tier table. */
function tierCost(tiers, qty) {
  var remaining = qty, prev = 0, cost = 0, i;
  for (i = 0; i < tiers.length && remaining > 1e-12; i++) {
    var cap = tiers[i].max;
    var band = (cap === Infinity) ? remaining : Math.max(0, Math.min(remaining, cap - prev));
    cost += band * tiers[i].rate;
    remaining -= band;
    prev = cap;
  }
  return cost;
}
/* The rate the NEXT unit would be charged at - what a battery actually
   saves on the margin. */
function marginalRate(tiers, qty) {
  var prev = 0, i;
  for (i = 0; i < tiers.length; i++) {
    if (qty < tiers[i].max) return tiers[i].rate;
    prev = tiers[i].max;
  }
  return tiers.length ? tiers[tiers.length - 1].rate : 0;
}

/* ---------------------------------------------------------------------- *
 *  Billing an interval profile. This is the exact answer: every reading is
 *  priced in the period it falls in, and each demand charge is billed on
 *  its own determinant.
 *
 *  `samples` is {kw: [], dt: hours per reading, startMonth, startDayOfWeek}.
 *  The caller supplies the calendar; guessing it here is how January's
 *  readings end up billed at August's rate.
 * ---------------------------------------------------------------------- */
function billFromProfile(samples, tariff) {
  var t = (tariff && tariff.energyWeekday) ? tariff : normalize(tariff);
  var kw = samples.kw || [];
  var dt = num(samples.dt, 1);
  var startMonth = num(samples.startMonth, 0) % MONTHS;
  var startDow = num(samples.startDayOfWeek, 1);   /* 0 Sun .. 6 Sat */
  var daysInMonth = samples.daysInMonth ||
    [31,28,31,30,31,30,31,31,30,31,30,31];

  var perDay = Math.max(1, Math.round(HOURS / dt));
  var months = [], i, idx = 0, mi = startMonth, dow = startDow, k = 0;

  while (idx < kw.length && k < 24) {
    var days = daysInMonth[mi] || 30;
    var want = days * perDay;
    var slice = kw.slice(idx, idx + want);
    if (!slice.length) break;

    var energyByPeriod = {}, demandByPeriod = {}, flatMax = 0, totalKwh = 0;
    for (i = 0; i < slice.length; i++) {
      var v = Math.max(0, num(slice[i], 0));
      var hourOfDay = Math.floor((i % perDay) * dt) % HOURS;
      var dayIndex = Math.floor(i / perDay);
      var d = (dow + dayIndex) % 7;
      var weekend = (d === 0 || d === 6);

      var ep = (weekend ? t.energyWeekend : t.energyWeekday)[mi][hourOfDay];
      var dp = (weekend ? t.demandWeekend : t.demandWeekday)[mi][hourOfDay];

      var kwh = v * dt;
      totalKwh += kwh;
      energyByPeriod[ep] = (energyByPeriod[ep] || 0) + kwh;
      if (!(demandByPeriod[dp] >= v)) demandByPeriod[dp] = v;
      if (v > flatMax) flatMax = v;
    }

    months.push({
      month: mi, days: days,
      energyByPeriod: energyByPeriod,
      demandByPeriod: demandByPeriod,
      facilityKw: flatMax,
      kwh: totalKwh
    });

    idx += want;
    dow = (dow + days) % 7;
    mi = (mi + 1) % MONTHS;
    k++;
  }
  return billFromMonthly(months, t);
}

/* ---------------------------------------------------------------------- *
 *  Billing month aggregates. Same tariff, less information: without a
 *  shape the caller has to state the per-period energy and demand it can
 *  read off the bill. Whatever it cannot state is billed on what it can,
 *  and the gap is reported rather than assumed away.
 * ---------------------------------------------------------------------- */
function billFromMonthly(months, tariff) {
  var t = (tariff && tariff.energyWeekday) ? tariff : normalize(tariff);
  var lines = [], total = 0, i, p;
  var facilityHistory = [];

  for (i = 0; i < months.length; i++) {
    var m = months[i];
    var mi = num(m.month, i) % MONTHS;
    var monthLines = [];

    /* ---- energy ---- */
    var eByP = m.energyByPeriod;
    if (!eByP && m.kwh != null) { eByP = {}; eByP[0] = num(m.kwh, 0); }
    for (p in (eByP || {})) {
      if (!Object.prototype.hasOwnProperty.call(eByP, p)) continue;
      var pi = Number(p);
      var tiers = t.energyRates[pi] || t.energyRates[0];
      if (!tiers) continue;
      var qty = num(eByP[p], 0);
      var amt = tierCost(tiers, qty);
      monthLines.push({ kind: 'energy', period: pi, label: 'Energy, period ' + pi,
                        qty: qty, unit: 'kWh', rate: marginalRate(tiers, qty), amount: amt });
    }

    /* ---- time-of-use (coincident) demand ---- */
    var dByP = m.demandByPeriod || {};
    for (p in dByP) {
      if (!Object.prototype.hasOwnProperty.call(dByP, p)) continue;
      var dpi = Number(p);
      var dtiers = t.demandRates[dpi];
      if (!dtiers) continue;
      var dkw = num(dByP[p], 0);
      var damt = tierCost(dtiers, dkw);
      /* A tariff's off-peak period usually exists only to say "not billed
         here", and a real bill carries no $0.00 demand line for it. Emitting
         one is worse than cosmetic: a caller reading the first demand line
         gets the period that never moves, and a battery that shaves the
         window that IS billed looks like it achieved nothing. */
      if (damt === 0 && marginalRate(dtiers, dkw) === 0) continue;
      monthLines.push({ kind: 'demand-tou', period: dpi,
                        label: 'On-peak demand, period ' + dpi,
                        qty: dkw, unit: 'kW', rate: marginalRate(dtiers, dkw),
                        amount: damt });
    }

    /* ---- facility (non-coincident) demand, with the ratchet ---- */
    var fIdx = t.flatMonths[mi];
    var facility = num(m.facilityKw, 0);
    if (fIdx >= 0 && t.flatRates[fIdx]) {
      var billed = facility;
      var ratchetFloor = 0;
      if (t.ratchetPct > 0 && facilityHistory.length) {
        var hi = 0, back = Math.min(11, facilityHistory.length);
        for (var h2 = facilityHistory.length - back; h2 < facilityHistory.length; h2++) {
          if (facilityHistory[h2] > hi) hi = facilityHistory[h2];
        }
        ratchetFloor = hi * t.ratchetPct / 100;
        if (ratchetFloor > billed) billed = ratchetFloor;
      }
      var ftiers = t.flatRates[fIdx];
      monthLines.push({ kind: 'demand-facility', period: fIdx,
                        label: 'Facility demand', qty: billed, unit: 'kW',
                        rate: marginalRate(ftiers, billed),
                        amount: tierCost(ftiers, billed),
                        ratchetApplied: ratchetFloor > facility,
                        meteredKw: facility });
    }
    facilityHistory.push(facility);

    /* ---- fixed, adders, tax ---- */
    var fixed = t.fixedIsDaily ? t.fixedPerMonth * num(m.days, 30) : t.fixedPerMonth;
    if (fixed) monthLines.push({ kind: 'fixed', label: 'Customer charge',
                                 qty: 1, unit: 'month', rate: fixed, amount: fixed });
    if (t.adderPerKwh) {
      var allKwh = num(m.kwh, 0) || sumValues(eByP);
      monthLines.push({ kind: 'adder', label: 'Per-kWh rider', qty: allKwh,
                        unit: 'kWh', rate: t.adderPerKwh,
                        amount: allKwh * t.adderPerKwh });
    }
    var sub = 0;
    for (var L = 0; L < monthLines.length; L++) sub += monthLines[L].amount;
    if (t.taxPct) {
      var tax = sub * t.taxPct / 100;
      monthLines.push({ kind: 'tax', label: 'Tax', qty: sub, unit: '$',
                        rate: t.taxPct / 100, amount: tax });
      sub += tax;
    }

    total += sub;
    lines.push({ month: mi, subtotal: sub, lines: monthLines });
  }

  return { total: total, months: lines, tariff: t.name, notes: t.notes };
}

function sumValues(o) {
  var s = 0, k;
  for (k in (o || {})) if (Object.prototype.hasOwnProperty.call(o, k)) s += num(o[k], 0);
  return s;
}

/* ---------------------------------------------------------------------- *
 *  The degenerate case, so nothing that already works has to change.
 *  A single demand rate and a single energy rate expressed in the same
 *  schema, which keeps one billing path rather than two.
 * ---------------------------------------------------------------------- */
function flatTariff(opts) {
  opts = opts || {};
  var demand = num(opts.demandChargePerKw, 0);
  var energy = num(opts.energyRate, 0);
  var flat12 = [];
  for (var m = 0; m < MONTHS; m++) flat12.push(0);
  return normalize({
    name: opts.name || 'Flat demand and energy',
    energyratestructure: energy ? [[{ rate: energy }]] : [],
    energyweekdayschedule: zeros(),
    energyweekendschedule: zeros(),
    flatdemandstructure: demand ? [[{ rate: demand }]] : [],
    flatdemandmonths: flat12,
    demandratchetpercentage: num(opts.ratchetPct, 0) * (opts.ratchetIsFraction ? 100 : 1),
    fixedchargefirstmeter: num(opts.fixedPerMonth, 0),
    adderPerKwh: num(opts.adderPerKwh, 0),
    taxPct: num(opts.taxPct, 0)
  });
}
function zeros() {
  var out = [], r, h;
  for (r = 0; r < MONTHS; r++) { var row = []; for (h = 0; h < HOURS; h++) row.push(0); out.push(row); }
  return out;
}

/* What one more kW on each determinant costs this month. The sizing engine
   needs this to know which peak is worth shaving: a battery that cuts the
   facility peak on a tariff whose money is in the on-peak window has
   earned nothing, and the only way to see that is to price both. */
function marginalDemandRates(monthIndex, tariff) {
  var t = (tariff && tariff.energyWeekday) ? tariff : normalize(tariff);
  var mi = num(monthIndex, 0) % MONTHS;
  var out = { facility: 0, byPeriod: {} };
  var fIdx = t.flatMonths[mi];
  if (fIdx >= 0 && t.flatRates[fIdx]) out.facility = t.flatRates[fIdx][0].rate;
  for (var p = 0; p < t.demandRates.length; p++) {
    /* A period that never appears in this month's schedule is not billed
       in this month, whatever its rate says. */
    var appears = false, h;
    for (h = 0; h < HOURS; h++) {
      if (t.demandWeekday[mi][h] === p || t.demandWeekend[mi][h] === p) { appears = true; break; }
    }
    /* A zero-rate period is not a determinant. Reporting it invites a
       caller to sum over byPeriod and find a charge that is not there. */
    if (appears && t.demandRates[p][0].rate > 0) out.byPeriod[p] = t.demandRates[p][0].rate;
  }
  return out;
}

/* Which hours of a given month a demand period covers, as a 24-slot
   weekday/weekend pair. The dispatcher needs the window, not just the rate. */
function demandWindows(monthIndex, tariff) {
  var t = (tariff && tariff.energyWeekday) ? tariff : normalize(tariff);
  var mi = num(monthIndex, 0) % MONTHS;
  return { weekday: t.demandWeekday[mi].slice(), weekend: t.demandWeekend[mi].slice() };
}

module.exports = {
  normalize: normalize,
  flatTariff: flatTariff,
  billFromProfile: billFromProfile,
  billFromMonthly: billFromMonthly,
  marginalDemandRates: marginalDemandRates,
  demandWindows: demandWindows,
  tierCost: tierCost,
  marginalRate: marginalRate
};
