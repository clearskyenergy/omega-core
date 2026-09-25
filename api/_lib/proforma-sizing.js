/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
/* ====================================================================== *
 *  PRO FORMA SIZING BRIDGE
 *  ------------------------------------------------------------------    *
 *  The pro forma prices a battery; it does not size one. The size, the
 *  savings it earns and how those savings fade come from the ONE sizing
 *  engine (battery-tool-engine.js) that the Battery Sizer and the site-map
 *  editor already use, so an investor deck cannot quote a battery that the
 *  engineering screens would have sized differently.
 *
 *  This file is a TRANSLATION, like bess-size-adapter.js and built on it:
 *  the pro forma's request goes into the engine's vocabulary through the
 *  adapter's own toSettings / intervalToMonths / monthlyToBills, the
 *  engine runs in-process, and its answer comes back as the small summary
 *  the finance engine reads. Nothing here dispatches, prices demand or
 *  fades a pack. Requests are refused by the same rules POST
 *  /api/bess-size uses (bess-size-validate.js).
 *
 *  Three engine habits it has to steer around:
 *  - The recommendation is grossed up by a headroom that defaults to 10%
 *    and earns no extra savings. The pro forma must price exactly the
 *    system it reports, so headroom is the request's (default 0).
 *  - pickBest() ranks by whatever `obj` says and has no default. It is
 *    always 'npv' here.
 *  - A bill needs a "Mon YYYY" label and the bills must be in date order:
 *    the ratchet reads the eleven bills BEFORE each one by position.
 *
 *  size(req) never throws for bad input: it answers
 *  {ok:false, error, field} with `field` naming the request path.
 * ====================================================================== */
var ENGINE = require('./battery-tool-engine');
var ADAPTER = require('./bess-size-adapter');
var TARIFF = require('./bess-tariff');
var V = require('./bess-size-validate');

var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
var MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
var MIN_READINGS = 8760;
/* A tail shorter than this after the last whole month is dropped rather
   than billed as a month of its own - the Battery Sizer's rule, and what a
   leap year leaves over once the adapter cuts 365 days of fixed months. */
var STUB_DAYS = 5;

var DEFAULTS = {
  tariff: { demandChargePerKw: 18, energyRate: 0.11 },
  bess: { capexPerKw: 250, capexPerKwh: 400, rtePct: 88, dodPct: 90, cRate: 0.5, omPerKwYr: 10,
          fadePctYr: 2, minSohPct: 70, durations: [1, 2, 4, 6], headroomPct: 0 },
  finance: { itcPct: 30, termYears: 25, discountPct: 8, escalatorPct: 3 }
};

/* The request path of every key the shared checks can name, in both of
   the vocabularies they check - the editor's tariff object and the
   engine's settings - so a refusal points at the field the user typed. */
var FIELD = {
  demandChargePerKw: 'tariff.demandChargePerKw', dRate: 'tariff.demandChargePerKw',
  energyRate: 'tariff.energyRate', eRate: 'tariff.energyRate',
  ratchetPct: 'tariff.ratchetPct', ratchet: 'tariff.ratchetPct',
  capexPerKwh: 'bess.capexPerKwh', cKwh: 'bess.capexPerKwh',
  capexPerKw: 'bess.capexPerKw', cKw: 'bess.capexPerKw',
  maxC: 'bess.cRate', cRate: 'bess.cRate',
  dodPct: 'bess.dodPct', dod: 'bess.dodPct',
  rtePct: 'bess.rtePct', rte: 'bess.rtePct',
  omPerKwYr: 'bess.omPerKwYr', om: 'bess.omPerKwYr',
  fadePctYr: 'bess.fadePctYr', fade: 'bess.fadePctYr',
  minSoh: 'bess.minSohPct', replKwh: 'bess.replPerKwh', headroom: 'bess.headroomPct',
  itcPct: 'finance.itcPct', itc: 'finance.itcPct',
  termYr: 'finance.termYears', term: 'finance.termYears',
  discountPct: 'finance.discountPct', disc: 'finance.discountPct',
  escalPctYr: 'finance.escalatorPct', escal: 'finance.escalatorPct'
};
function fieldName(k) { return FIELD[k] || k; }

function httpError(status, message) { var e = new Error(message); e.status = status; return e; }
function invalid(message, field) { var e = httpError(400, message); e.field = field || null; return e; }
/* Runs a shared check and files its refusal under a request path. */
function under(path, check) {
  try { return check(); } catch (e) {
    if (e && e.status) e.field = path + (e.field ? '.' + e.field : '');
    throw e;
  }
}

function isObject(v) { return v != null && typeof v === 'object' && !Array.isArray(v); }
function blank(v) { return v == null || v === ''; }
function pick(v, d) { return blank(v) ? d : v; }
function isInt(v, lo, hi) { return typeof v === 'number' && isFinite(v) && Math.floor(v) === v && v >= lo && v <= hi; }
function daysIn(year, month) {
  var leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return month === 1 && leap ? 29 : MONTH_DAYS[month];
}
function fmt(n, dp) {
  var s = Math.abs(n).toFixed(dp || 0).split('.');
  s[0] = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (n < 0 ? '-' : '') + s.join('.');
}
function money(n, dp) { return '$' + fmt(n, dp); }
/* A unit price at the precision it was typed: $0.11 and $0.0875, not $0.110. */
function price(n) { return '$' + fmt(n, 4).replace(/(\.\d\d\d*?)0+$/, '$1'); }
function list(xs) { return xs.length > 1 ? xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1] : String(xs[0]); }
function section(req, key) {
  var v = req[key];
  if (v == null) return {};
  if (!isObject(v)) throw invalid(key + ' must be an object.', key);
  return v;
}

/* Whole years only: the count is ambiguous otherwise (17,520 readings are
   a year of half-hours or two years of hours), and guessing wrong would
   bill every month at twice or half its length. */
function detectInterval(n) {
  var i, step;
  for (i = 0; i < V.INTERVAL_MINUTES.length; i++) {
    step = V.INTERVAL_MINUTES[i];
    if (n === 365 * 1440 / step || n === 366 * 1440 / step) return step;
  }
  return null;
}

/* ---------------------------------------------------------------------- *
 *  Request -> engine request
 * ---------------------------------------------------------------------- */
function intervalLoad(load, notes) {
  var values = load.values;
  if (!Array.isArray(values)) throw invalid('load.values must be an array of kW readings.', 'load.values');
  var n = values.length;
  if (n < MIN_READINGS || n > V.MAX_READINGS) {
    throw invalid('load.values must hold ' + fmt(MIN_READINGS) + ' to ' + fmt(V.MAX_READINGS) +
                  ' readings; got ' + fmt(n) + '.', 'load.values');
  }
  under('load.values', function () { V.checkReadings(values, httpError); });

  var intervalMin = load.intervalMin, detected = blank(intervalMin);
  if (detected) {
    intervalMin = detectInterval(n);
    if (!intervalMin) {
      throw invalid('load.intervalMin is needed: ' + fmt(n) + ' readings is not one whole year ' +
                    'at 5, 10, 15, 20, 30 or 60 minutes.', 'load.intervalMin');
    }
  } else {
    under('load.intervalMin', function () { V.checkIntervalMin(intervalMin, httpError); });
    intervalMin = Number(intervalMin);
  }
  var startMonth = pick(load.startMonth, 0);
  if (!isInt(startMonth, 0, 11)) {
    throw invalid('load.startMonth must be a month index from 0 (January) to 11.', 'load.startMonth');
  }
  var startYear = pick(load.startYear, null);
  if (startYear !== null && !isInt(startYear, 1990, 2100)) {
    throw invalid('load.startYear must be a four-digit year.', 'load.startYear');
  }

  var months = ADAPTER.intervalToMonths(values, intervalMin, startMonth);
  var used = n;
  var tail = months[months.length - 1];
  if (months.length > 1 && tail.days < STUB_DAYS) {
    months.pop();
    used -= tail.load.length;
    notes.warnings.push('The last ' + fmt(tail.load.length) + ' readings (' + fmt(tail.days, 1) +
      (tail.days === 1 ? ' day' : ' days') + ') fall after the final whole month and were not used. ' +
      'Months are cut at fixed calendar lengths with a 28-day February, so a leap year leaves one ' +
      'day over.');
  }
  if (months.length > 24) {
    throw invalid('Interval sizing takes at most 24 months of readings; these cover ' +
                  months.length + ' at ' + intervalMin + ' minutes.', 'load.values');
  }
  months.forEach(function (m, k) {
    m.label = MON[m.month] + (startYear === null ? '' : ' ' + (startYear + Math.floor((startMonth + k) / 12)));
  });
  var last = months[months.length - 1];
  if (last.days < MONTH_DAYS[last.month]) {
    notes.warnings.push(last.label + ' covers only ' + fmt(last.days, 1) + ' days of readings, and its ' +
      'peak is billed as a whole month.');
  }

  notes.assumptions.push('Sized on ' + months.length + ' months of measured ' + intervalMin +
    '-minute readings' + (detected ? ' (interval length read from the count: ' + fmt(n) + ' readings)' : '') +
    ', starting ' + months[0].label + (blank(load.startMonth) ? ' (start month not stated; taken as January)' : '') +
    '. Each month is dispatched to the lowest peak the battery can hold with foresight of that ' +
    'month\'s load, starting empty and carrying state of charge from month to month; no energy is ' +
    'traded on time-of-use prices.');
  return {
    mode: 'tool-interval', basis: 'interval', data: months,
    summary: { mode: 'interval', intervalMin: intervalMin, intervalDetected: detected, readings: n,
               readingsUsed: used, startMonth: startMonth, startYear: startYear,
               months: months.length }
  };
}

function monthlyLoad(load, tariff, notes) {
  var rows = load.rows;
  if (!Array.isArray(rows) || !rows.length || rows.length > 24) {
    throw invalid('load.rows must hold 1 to 24 monthly bills.', 'load.rows');
  }
  var prev = null;
  rows.forEach(function (r, i) {
    var at = 'load.rows[' + i + ']';
    if (!isObject(r)) throw invalid(at + ' must be an object.', at);
    under(at, function () { V.checkMonthlyRows([r], httpError); });
    if (!isInt(r.month, 0, 11)) {
      throw invalid(at + '.month must be a month index from 0 (January) to 11.', at + '.month');
    }
    if (!isInt(r.year, 1990, 2100)) throw invalid(at + '.year must be a four-digit year.', at + '.year');
    if (!blank(r.days) && !(Number(r.days) >= 1 && Number(r.days) <= 62)) {
      throw invalid(at + '.days must be a billing period of 1 to 62 days.', at + '.days');
    }
    if (!blank(r.onPeakKw) && !(Number(r.onPeakKw) >= 0 && isFinite(Number(r.onPeakKw)))) {
      throw invalid(at + '.onPeakKw must be a nonnegative number of kW.', at + '.onPeakKw');
    }
    var ord = r.year * 12 + r.month;
    if (prev !== null && ord <= prev) {
      throw invalid('load.rows must be in date order with no month repeated; ' + MON[r.month] + ' ' +
                    r.year + ' does not follow the bill before it.', at);
    }
    prev = ord;
  });

  var bills = ADAPTER.monthlyToBills(rows, tariff), heavy = [];
  bills.forEach(function (bill, i) {
    var r = rows[i];
    bill.label = MON[r.month] + ' ' + r.year;
    /* The adapter fills a calendar month with a 28-day February. A bill's
       energy is spread over the days it actually covers, and a 33-day
       billing cycle or a leap February is a different load shape. */
    bill.days = blank(r.days) ? daysIn(r.year, r.month) : Number(r.days);
    if (!blank(r.onPeakKw)) bill.onPeakKw = Number(r.onPeakKw);
    if (bill.kwh > bill.peak * bill.days * 24) heavy.push(bill.label);
  });
  if (heavy.length) {
    notes.warnings.push('Usage on ' + heavy.join(', ') + ' is more than the billed peak running ' +
      'around the clock; the modelled load shape caps the load factor at 98%, so check those ' +
      'bills\' kWh and kW.');
  }
  notes.assumptions.push('Sized on ' + bills.length + ' monthly bill' + (bills.length === 1 ? '' : 's') +
    ' (' + bills[0].label + (bills.length > 1 ? ' to ' + bills[bills.length - 1].label : '') +
    '). Without interval data each bill\'s load shape is modelled from its peak and energy (base ' +
    'load 60% of peak, the peak day 15% above the average day); the P90 figure reads the same ' +
    'bills as a flat-topped load, the downside case.');
  return {
    mode: 'tool-monthly', basis: 'monthly', data: bills,
    summary: { mode: 'monthly', months: bills.length, first: bills[0].label, last: bills[bills.length - 1].label }
  };
}

function prepare(req) {
  if (!isObject(req)) throw invalid('The sizing request must be an object.', null);
  var t = section(req, 'tariff'), b = section(req, 'bess'), f = section(req, 'finance');
  var load = req.load;
  if (!isObject(load)) throw invalid('load is required: interval readings or monthly bills.', 'load');
  if (load.mode !== 'interval' && load.mode !== 'monthly') {
    throw invalid('load.mode must be \'interval\' or \'monthly\'.', 'load.mode');
  }

  var urdb = null;
  if (t.urdb != null) urdb = under('tariff.urdb', function () { return V.checkTariff(t.urdb, httpError); });
  /* The engine reads its ratchet from settings, never from the tariff, so
     a URDB ratchet would be silently dropped. It stands in when the
     request states none; a stated ratchet, zero included, wins. */
  var urdbRatchet = urdb && Number(urdb.demandratchetpercentage) > 0 ? Number(urdb.demandratchetpercentage) / 100 : 0;

  /* The editor's tariff vocabulary, which is what toSettings translates
     from and what bess-size.js validates for the editor. Values stay as
     sent until they are checked: toSettings quietly swaps anything it
     cannot read for a default, which would size a different battery. */
  var tariff = {
    demandChargePerKw: pick(t.demandChargePerKw, DEFAULTS.tariff.demandChargePerKw),
    energyRate: pick(t.energyRate, DEFAULTS.tariff.energyRate),
    ratchetPct: pick(t.ratchetPct, urdbRatchet),
    capexPerKwh: pick(b.capexPerKwh, DEFAULTS.bess.capexPerKwh),
    capexPerKw: pick(b.capexPerKw, DEFAULTS.bess.capexPerKw),
    maxC: pick(b.cRate, DEFAULTS.bess.cRate),
    dodPct: pick(b.dodPct, DEFAULTS.bess.dodPct),
    rtePct: pick(b.rtePct, DEFAULTS.bess.rtePct),
    itcPct: pick(f.itcPct, DEFAULTS.finance.itcPct),
    omPerKwYr: pick(b.omPerKwYr, DEFAULTS.bess.omPerKwYr),
    termYr: pick(f.termYears, DEFAULTS.finance.termYears),
    discountPct: pick(f.discountPct, DEFAULTS.finance.discountPct),
    fadePctYr: pick(b.fadePctYr, DEFAULTS.bess.fadePctYr),
    escalPctYr: pick(f.escalatorPct, DEFAULTS.finance.escalatorPct)
  };
  V.checkEditorTariff(tariff, httpError, fieldName);
  var settings = ADAPTER.toSettings(tariff, {
    minSoh: pick(b.minSohPct, DEFAULTS.bess.minSohPct),
    replKwh: pick(b.replPerKwh, tariff.capexPerKwh),
    headroom: pick(b.headroomPct, DEFAULTS.bess.headroomPct),
    obj: 'npv'
  });
  V.checkToolSettings(settings, httpError, fieldName);
  settings.minSoh = Number(settings.minSoh);
  settings.replKwh = Number(settings.replKwh);
  settings.headroom = Number(settings.headroom);
  /* The schedule has one row per year of the term; the engine rounds a
     fractional term, and the pro forma would then read a strip one year
     shorter or longer than the analysis it asked for. */
  if (Math.floor(settings.term) !== settings.term) {
    throw invalid('finance.termYears must be a whole number of years.', 'finance.termYears');
  }
  if (settings.headroom > 100) throw invalid('bess.headroomPct must be at most 100.', 'bess.headroomPct');

  var durations = pick(b.durations, DEFAULTS.bess.durations);
  if (!V.isDurations(durations)) {
    throw invalid('bess.durations must list one to six of 1, 2, 3, 4, 6 and 8 hours.', 'bess.durations');
  }
  durations = durations.filter(function (d, i) { return durations.indexOf(d) === i; })
                       .sort(function (x, y) { return x - y; });

  var notes = { assumptions: [], warnings: [] };
  var built = load.mode === 'interval' ? intervalLoad(load, notes) : monthlyLoad(load, tariff, notes);
  if (built.data.length < 12) {
    notes.warnings.push('Only ' + built.data.length + ' month' + (built.data.length === 1 ? '' : 's') +
      ' of data: annual savings are scaled by 12/' + built.data.length + ', and a missing seasonal ' +
      'peak understates both the saving and the power rating.');
  }

  if (urdb && built.basis === 'interval') {
    /* Not handed to the engine: its interval dispatch prices demand at one
       flat rate today, and a tariff it started reading one day would move
       the answer without this warning being revisited. Its ratchet, read
       above, still applies - interval dispatch honours a ratchet. */
    notes.warnings.push('The structured tariff\'s demand rates are applied to monthly bills only. ' +
      'Interval sizing prices every shaved kW at the flat ' + price(settings.dRate) + '/kW-month demand charge.');
    urdb = null;
  }
  if (urdb) {
    var norm = TARIFF.normalize(urdb), missing = built.data.filter(function (m) { return m.onPeakKw == null; });
    if (norm.hasTouDemand && missing.length) {
      notes.warnings.push('The tariff\'s on-peak demand charge is priced only on bills that state an ' +
        'on-peak kW (onPeakKw); ' + missing.length + ' of ' + built.data.length + ' do not, so that ' +
        'charge earns nothing on them.');
    }
    notes.assumptions.push('Demand is priced month by month from the structured tariff "' + norm.name + '".');
  } else {
    notes.assumptions.push('Demand is priced at a flat ' + price(settings.dRate) + '/kW-month.');
  }
  if (settings.ratchet > 0) {
    notes.assumptions.push('A demand ratchet of ' + fmt(settings.ratchet, 0) + '%' +
      (blank(t.ratchetPct) ? ' (the structured tariff\'s)' : '') + ' holds each month\'s billed ' +
      'demand to that share of the highest of the eleven months before it, with and without the ' +
      'battery; the first month has no history to ratchet from.');
  }

  return { mode: built.mode, basis: built.basis, data: built.data, durations: durations,
           settings: settings, urdb: urdb, summary: built.summary, notes: notes };
}

/* ---------------------------------------------------------------------- *
 *  Engine answer -> pro forma summary
 * ---------------------------------------------------------------------- */
function translate(p, raw) {
  var best = raw.best, rec = raw.rec, s = p.settings;
  var scale = 12 / raw.nMon;
  var notes = p.notes;

  var schedule = rec.schedule.map(function (y) {
    return { year: y.year, soh: y.soh, savingsRatio: y.ratio, grossSavings: y.savings,
             lossCost: y.loss, netSavings: y.savings - y.loss };
  });
  var replacements = rec.schedule.filter(function (y) { return y.replacement > 0; })
    .map(function (y) { return { year: y.year, cost: y.replacement }; });
  var y1 = schedule[0];

  /* The best size at each other duration, where one pays back. A duration
     with no positive NPV is left out rather than listed at its least-bad
     size: ranking a set with no winner returns a battery approaching zero,
     which reads as a recommendation and is an artefact (see pickBest in
     the engine). The chosen duration's row IS the chosen system, as priced,
     so the row a page highlights and the headline cannot disagree. */
  var byDur = {}, unviable = [];
  raw.sweep.forEach(function (row) {
    if (!(row.annSav > 0) || !(row.npv > 0)) return;
    if (!byDur[row.dur] || row.npv > byDur[row.dur].npv) byDur[row.dur] = row;
  });
  var alternatives = [];
  p.durations.forEach(function (d) {
    if (d === best.dur) {
      alternatives.push({ durationH: d, kw: rec.kW, usableKwh: rec.kWh, nameplateKwh: rec.nameplate,
                          netY1: y1.netSavings, npv: rec.npv, chosen: true });
    } else if (byDur[d]) {
      var r = byDur[d];
      alternatives.push({ durationH: d, kw: r.kW, usableKwh: r.kWh, nameplateKwh: r.nameplate,
                          netY1: r.annSav - r.lossCost, npv: r.npv, chosen: false });
    } else {
      unviable.push(d);
    }
  });

  /* Before and after are metered peaks, so the bars compare like with
     like; the costs are what was billed, ratchet included. */
  var months = raw.months.map(function (m, i) {
    return { label: m.label, peakKw: m.peak, afterKw: best.peaks[i],
             costBefore: raw.costRows[i].before, costAfter: raw.costRows[i].after };
  });

  if (!raw.sweep.some(function (row) { return row.npv > 0; })) {
    notes.warnings.push('No size pays back on the sizing engine\'s screening NPV. The system shown is ' +
      'the deepest one at the best return per dollar - how far short the site falls - not a ' +
      'recommendation.');
  }
  if (rec.degradation !== 'measured') {
    notes.warnings.push('The fade curve could not be measured on this load, so each year\'s saving ' +
      'is scaled by state of health (the conservative reading).');
  }

  var headroom = Math.round(s.headroom);
  var a = notes.assumptions;
  a.push('Nameplate is usable energy / ' + s.dod + '% depth of discharge / the discharge half of ' +
    s.rte + '% round-trip efficiency, and never less than kW / ' + s.cRate + 'C.');
  a.push('Charging losses are priced at ' + price(s.eRate) + '/kWh. Savings escalate ' + s.escal +
    '%/yr. Capacity fades ' + s.fade + '%/yr, and ' + (rec.degradation === 'measured'
      ? 'each year\'s saving is re-solved at that year\'s state of health rather than scaled with it.'
      : 'each year\'s saving is scaled by state of health.'));
  a.push('The pack is replaced when state of health falls below ' + fmt(rec.minSohPct, 0) + '%, at ' +
    money(s.replKwh) + '/kWh of nameplate in today\'s dollars; a replacement resets the fade.');
  a.push('The size maximises the sizing engine\'s screening NPV over batteries of ' +
    list(p.durations) + ' hours (' + s.itc + '% ITC on the whole installed cost at ' + money(s.cKwh) + '/kWh and ' +
    money(s.cKw) + '/kW, O&M ' + money(s.om) + '/kW-yr, ' + s.disc + '% discount, ' + s.term +
    ' years). That NPV only ranks sizes; returns, tax and financing are the pro forma\'s.');
  if (best.cRateForced) {
    a.push('At ' + fmt(rec.kW, 0) + ' kW the ' + s.cRate + 'C rating, not the ' + best.dur +
      '-hour duty, sets the pack: ' + fmt(rec.nameplate, 0) + ' kWh nameplate, delivering ' +
      fmt(rec.kWh / rec.kW, 2) + ' hours. The extra energy is paid for and dispatched.');
  }
  if (unviable.length) {
    a.push('Batteries of ' + list(unviable) + ' hours do not pay back at any size swept and are ' +
      'not listed as alternatives.');
  }
  if (headroom > 0) {
    a.push('The system is ' + headroom + '% larger than the optimum; the oversize is costed but ' +
      'earns no extra saving.');
  }

  var used = {}, k;
  for (k in s) if (Object.prototype.hasOwnProperty.call(s, k)) used[k] = s[k];
  used.durations = p.durations.slice();

  return {
    ok: true,
    basis: p.basis,
    engine: 'battery-tool-engine',
    degradation: rec.degradation,
    system: {
      kw: rec.kW, usableKwh: rec.kWh, nameplateKwh: rec.nameplate,
      durationH: best.dur, effectiveDurationH: rec.kW > 0 ? rec.kWh / rec.kW : 0,
      cRateForced: !!best.cRateForced, cRateBound: !!rec.cRateBound
    },
    savings: {
      demandY1: y1.grossSavings, lossY1: y1.lossCost, netY1: y1.netSavings,
      /* The same bills read as a flat-topped load, net of the same losses. */
      p90Y1: p.basis === 'monthly' ? best.p90Ann - rec.lossCost : null
    },
    months: months,
    annualPeakKw: raw.maxPeak,
    baseDemandCostYr: raw.baseCost * scale,
    throughputKwhYr: best.disAnn,
    cyclesYr: best.kWh > 0 ? best.disAnn / best.kWh : 0,
    schedule: schedule,
    replacements: replacements,
    minSohPct: rec.minSohPct,
    alternatives: alternatives,
    load: p.summary,
    settings: used,
    assumptions: a,
    warnings: notes.warnings
  };
}

function refusal(e) { return { ok: false, error: e.message, field: e.field || null }; }

/* {ok:true} when the request would be sized, else the refusal size() would
   give. Anything that is not a refusal is a fault in this file and throws. */
function validate(req) {
  try { prepare(req); return { ok: true }; } catch (e) {
    if (e && e.status) return refusal(e);
    throw e;
  }
}

function size(req) {
  var p;
  try { p = prepare(req); } catch (e) {
    if (e && e.status) return refusal(e);
    throw e;
  }
  var raw;
  /* A request that passed every check and still cannot be sized is the
     data's fault, not a server fault - the same answer bess-size.js gives. */
  try {
    raw = ENGINE({ mode: p.mode, data: p.data, durations: p.durations, settings: p.settings, tariff: p.urdb });
  } catch (err) {
    return { ok: false, field: 'load', error: err && err.message
      ? 'Could not size from this data: ' + err.message : 'Could not size from this data.' };
  }
  if (!raw || !raw.best || !raw.rec) return { ok: false, field: 'load', error: 'Could not size from this data.' };
  if (!(raw.best.annSav > 0)) {
    return { ok: false, field: 'load', error: 'No battery size saves money on this load at this tariff: ' +
      'the monthly peaks are too flat, or the demand charge too low, to shave.' };
  }
  return translate(p, raw);
}

module.exports = { size: size, validate: validate };
