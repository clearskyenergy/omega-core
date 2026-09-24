/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var CAP = require('./bess-capacity');

/* ====================================================================== *
 *  LEGACY SIZING ADAPTER
 *  ------------------------------------------------------------------    *
 *  The site-map editor and the standalone Battery Sizer used to POST to
 *  the same endpoint with different `mode` values, which forked into two
 *  entirely separate engines. On identical input they disagreed by 24% on
 *  energy and 52% on a real 8760 - and because the editor's answer is
 *  written into the project and carried into the proposal, the same site
 *  could be quoted two ways depending on which screen it was sized from.
 *
 *  There is one engine now: battery-tool-engine.js, which is the more
 *  complete of the two (ITC, O&M, fade, escalation, discounting, IRR,
 *  ratchet, time-of-use, subscription tariffs, and a P50/P90 load shape
 *  from the bill rather than a single assumed one).
 *
 *  This file is the seam. It translates the editor's request into that
 *  engine's vocabulary and translates the answer back into the result
 *  shape the editor's UI already reads, so the editor gets the accurate
 *  numbers without a rewrite of its four tabs.
 *
 *  It is a TRANSLATION, not a second model. Nothing here computes a
 *  quantity the engine did not already compute; every field is either a
 *  rename, a unit change, or a restatement of one the engine returned.
 * ====================================================================== */

var MONTH_DAYS = [31,28,31,30,31,30,31,31,30,31,30,31];

function num(v, d) {
  var n = Number(v);
  return (v == null || v === '' || !isFinite(n)) ? d : n;
}

/* The editor's tariff object, in the engine's settings vocabulary.
   Ratchet is the one genuine unit change: the editor carries a fraction,
   the engine a percentage, and getting that backwards silently turns a
   80% ratchet into 0.8%. */
function toSettings(tariff, extra) {
  tariff = tariff || {};
  var s = {
    dRate:    num(tariff.demandChargePerKw, 18),
    eRate:    num(tariff.energyRate, 0.11),
    ratchet:  num(tariff.ratchetPct, 0) * 100,
    cKwh:     num(tariff.capexPerKwh, 400),
    cKw:      num(tariff.capexPerKw, 250),
    cRate:    num(tariff.maxC, 0.5),
    dod:      num(tariff.dodPct, 90),
    rte:      num(tariff.rtePct, 88),
    otherEff: num(tariff.otherEffPct, 100),
    itc:      num(tariff.itcPct, 30),
    om:       num(tariff.omPerKwYr, 10),
    term:     num(tariff.termYr, 10),
    disc:     num(tariff.discountPct, 8),
    fade:     num(tariff.fadePctYr, 2),
    escal:    num(tariff.escalPctYr, 3),
    /* The editor has never had a headroom control and its results were
       never grossed up, so carrying one here would silently inflate every
       size the moment this adapter landed. */
    headroom: 0,
    /* "Deepest shave that still pays" is what the editor's own copy says
       it does, and maximum savings subject to a payback target is how it
       said it. Maximum NPV is the same intent, stated in money. */
    obj:      'npv'
  };
  if (extra) for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) s[k] = extra[k];
  return s;
}

/* Durations to sweep. The editor never exposed a duration control; it
   derived one. Sweeping the practical set and letting the economics choose
   is strictly more informative, and it is what the standalone tool does. */
var DURATIONS = [1, 2, 4, 6];

/* ---------------------------------------------------------------------- *
 *  Request translation
 * ---------------------------------------------------------------------- */

/* A flat kW column plus an interval length, into the engine's per-month
   series. The editor sends the year as one array; demand charges are
   billed monthly, so it has to be cut into months before it means
   anything. startMonth honours a file that begins at the billing cycle
   rather than on 1 January. */
function intervalToMonths(values, intervalMin, startMonth) {
  var dt = num(intervalMin, 60) / 60;
  var perDay = Math.round(24 / dt);
  var start = num(startMonth, 0);
  if (!(start >= 0 && start <= 11)) start = 0;

  var months = [], i = 0, k = 0;
  while (i < values.length) {
    var mi = (start + k) % 12;
    var want = MONTH_DAYS[mi] * perDay;
    var slice = values.slice(i, i + want);
    if (!slice.length) break;
    var peak = -Infinity, min = Infinity, sum = 0;
    for (var j = 0; j < slice.length; j++) {
      var v = slice[j];
      if (v > peak) peak = v;
      if (v < min) min = v;
      sum += v;
    }
    months.push({
      month: mi,
      label: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][mi],
      key: 'm' + mi,
      load: slice, dt: dt,
      peak: peak, min: min,
      kwh: sum * dt,
      days: slice.length / perDay
    });
    i += want; k++;
    if (k > 24) break;
  }
  return months;
}

function monthlyToBills(rows, tariff) {
  var rate = num((tariff || {}).demandChargePerKw, 18);
  return rows.map(function (r, idx) {
    var mi = num(r.month, idx) % 12;
    var days = MONTH_DAYS[mi] || 30;
    return {
      month: mi,
      label: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][mi],
      key: 'm' + mi,
      peak: num(r.demandKw, 0),
      kwh: num(r.kwh, 0),
      days: days,
      rate: rate
    };
  });
}

/* ---------------------------------------------------------------------- *
 *  Response translation
 * ---------------------------------------------------------------------- */

function toCandidate(c, derate, basis) {
  var nameplate = num(c.nameplate, 0);
  return {
    /* shaveKw and powerKw were distinct in the old engine: one was what
       the sweep ASKED for, the other what the dispatch ACHIEVED. This
       engine only ever reports the achieved figure, so they are the same
       number and neither is a promise the dispatch did not keep. */
    shaveKw: Math.round(num(c.kW, 0)),
    powerKw: num(c.kW, 0),
    nameplateKwh: nameplate,
    usableKwh: num(c.kWh, 0),
    durationH: num(c.dur, 0),
    savingsYr: num(c.annSav, 0) - num(c.lossCost, 0),
    demandSavingsYr: num(c.annSav, 0),
    chargingLossCostYr: num(c.lossCost, 0),
    capex: num(c.capex, 0),
    netCapex: num(c.net, 0),
    paybackYr: isFinite(c.payback) ? c.payback : null,
    npv: num(c.npv, 0),
    irr: c.irr == null ? null : c.irr,
    cyclesYr: nameplate > 0 && derate > 0
      ? Math.round(num(c.disAnn, 0) / (nameplate * derate)) : 0,
    cRateLimited: !!c.cRateBound,
    /* The old engine flagged a battery that could not refill between two
       peaks. This one carries state of charge through the whole year in
       interval mode, so a system that cannot recharge shows up as a
       smaller achieved shave rather than as a flag - there is nothing
       left to warn about that the number does not already say. */
    rechargeTight: false,
    feasible: true,
    breaches: basis === 'interval' ? 0 : null,
    worstBreachKw: null,
    analyticKwh: Math.round(num(c.maxEvt, 0)),
    assumedDuration: basis !== 'interval'
  };
}

function adapt(result, opts, basis) {
  var tariff = (opts && opts.tariff) || {};
  var settings = toSettings(tariff, opts && opts.settingsOverride);
  var derate = CAP.usableFromNameplateKwh(1000, {
    dodPct: settings.dod, rtePct: settings.rte, otherEffPct: settings.otherEff
  }) / 1000;

  var candidates = (result.sweep || []).map(function (c) {
    return toCandidate(c, derate, basis);
  });
  /* The recommendation is econ() re-run on the headroom-grossed size, and
     econ() does not carry a duration - only the sweep rows do. Take it off
     the modelled optimum the recommendation was built from, or the editor
     renders a 0-hour battery. */
  var bestRow = result.best || {};
  var recSource = result.rec || bestRow;
  if (recSource.dur == null) {
    var copy = {};
    for (var rk in recSource) if (Object.prototype.hasOwnProperty.call(recSource, rk)) copy[rk] = recSource[rk];
    copy.dur = num(bestRow.dur, 0);
    copy.disAnn = num(recSource.disAnn, num(bestRow.disAnn, 0));
    copy.maxEvt = num(recSource.maxEvt, num(bestRow.maxEvt, 0));
    recSource = copy;
  }
  var recommended = toCandidate(recSource, derate, basis);
  /* The recommendation has to be the SAME OBJECT as its row in the sweep
     or the editor's "which row is the pick" comparison silently matches
     nothing. Match on the modelled optimum, which is what the sweep holds. */
  var bestShave = Math.round(num((result.best || {}).kW, 0));
  for (var i = 0; i < candidates.length; i++) {
    if (candidates[i].shaveKw === bestShave &&
        candidates[i].durationH === num((result.best || {}).dur, 0)) {
      /* Carry the recommendation's economics onto the matched row so the
         highlighted row and the headline cannot disagree. */
      recommended.shaveKw = candidates[i].shaveKw;
      candidates[i] = recommended;
      break;
    }
  }

  var peaks = (result.months || []).map(function (m) {
    var days = num(m.days, 30);
    var avg = days > 0 ? num(m.kwh, 0) / (days * 24) : null;
    return {
      month: m.month != null ? m.month : null,
      peakKw: Math.round(num(m.peak, 0)),
      kwh: Math.round(num(m.kwh, 0)),
      avgKw: avg != null ? Math.round(avg) : null
    };
  });

  var totalKwh = 0, maxPeak = num(result.maxPeak, 0), hours = 0;
  (result.months || []).forEach(function (m) {
    totalKwh += num(m.kwh, 0);
    hours += num(m.days, 30) * 24;
  });
  var loadFactor = (maxPeak > 0 && hours > 0) ? (totalKwh / hours) / maxPeak : null;

  var target = num(tariff.targetPaybackYr, 7);
  var metTarget = recommended.paybackYr != null && recommended.paybackYr <= target;

  /* "If the peak lasts..." - the same system priced at each duration the
     sweep actually evaluated, which is the width of the duration
     assumption that monthly bills force. */
  var byDuration = {};
  (result.sweep || []).forEach(function (c) {
    var d = num(c.dur, 0);
    if (!d) return;
    if (!byDuration[d] || c.npv > byDuration[d].npv) byDuration[d] = c;
  });
  var sensitivity = Object.keys(byDuration).map(function (d) {
    return {
      hours: +d,
      nameplateKwh: Math.round(num(byDuration[d].nameplate, 0)),
      capex: Math.round(num(byDuration[d].capex, 0))
    };
  }).sort(function (a, b) { return a.hours - b.hours; });

  return {
    ok: true,
    engine: 'battery-tool-engine',
    meta: {
      basis: basis,
      confidence: basis === 'interval'
        ? 'measured'
        : (peaks.length >= 12 ? 'billed peaks, swept duration' : 'billed peaks, partial year'),
      peaks: peaks,
      loadFactor: loadFactor,
      monthsAnalyzed: peaks.length,
      annualizationFactor: peaks.length ? 12 / peaks.length : 1,
      assumedPeakHours: basis === 'interval' ? null : recommended.durationH,
      startSource: (opts && opts.startSource) || null,
      dispatchBasis: result.dispatchBasis ||
        'Starts empty; state of charge carries through every modelled month.',
      economicsBasis: 'Payback and NPV are net of the ' + settings.itc +
        '% investment tax credit, after O&M at $' + settings.om +
        '/kW-yr, with ' + settings.fade + '%/yr capacity fade and ' +
        settings.escal + '%/yr tariff escalation, discounted at ' + settings.disc + '%.'
    },
    tariff: tariff,
    settings: settings,
    derate: derate,
    candidates: candidates,
    recommended: recommended,
    metTarget: metTarget,
    sensitivity: sensitivity,
    annualPeak: Math.round(maxPeak),
    baseDemandCostYr: Math.round(num(result.baseCost, 0) *
      (peaks.length ? 12 / peaks.length : 1)),
    breakEven: result.breakEven || null,
    underwriting: result.underwriting || '',
    shortPeriod: result.shortPeriod || ''
  };
}

module.exports = {
  toSettings: toSettings,
  intervalToMonths: intervalToMonths,
  monthlyToBills: monthlyToBills,
  adapt: adapt,
  DURATIONS: DURATIONS
};
