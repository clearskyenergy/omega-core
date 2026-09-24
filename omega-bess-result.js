/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
/* ====================================================================== *
 *  OMEGA BESS RESULT — the record a sizing run leaves behind
 *  ------------------------------------------------------------------    *
 *  A battery gets sized in one of two places and then has to be believed
 *  in several others: the financing application, the deal room, the
 *  proposal. Before this file, none of that travelled. The sizer knew the
 *  system, the financing form asked the person to type it again, and the
 *  marketplace received a megawatt figure with no basis attached — so a
 *  capital partner underwriting it could not tell whether it came from a
 *  year of interval data or one bill and an assumption.
 *
 *  This is the shape that travels. It is written by every sizer, stored
 *  on the project, and read wherever the number is needed.
 *
 *  TWO RULES.
 *
 *  It is a RECORD, not a model. Nothing here computes a sizing quantity;
 *  every field comes from an /api/ response. The engine stays server-side
 *  (CLAUDE.md), and this file would be a way to smuggle a second opinion
 *  into the browser if it did any arithmetic of its own. The only maths
 *  below is unit conversion and multiplying a percentage out.
 *
 *  It carries its BASIS. A number without its provenance invites a reader
 *  to treat a single-bill screening estimate as a measured result. Every
 *  record says which engine produced it, from what kind of data, over how
 *  many months, and how confident that makes it — and the consumers below
 *  print that beside the figure rather than under a tooltip.
 * ====================================================================== */
(function (root) {
  'use strict';

  var VERSION = 1;

  function n(v) { var x = Number(v); return isFinite(x) ? x : null; }
  function r0(v) { var x = n(v); return x == null ? null : Math.round(x); }
  function r2(v) { var x = n(v); return x == null ? null : Math.round(x * 100) / 100; }

  /* Both response shapes, one record.
     `tool-monthly` / `tool-interval` answer with {best, rec, months}; the
     editor's `monthly` / `interval` answer with {recommended, meta} through
     the adapter. They are the same engine, so they must produce the same
     record - a consumer should never have to know which screen ran it. */
  function fromApi(res, opts) {
    if (!res) return null;
    opts = opts || {};

    var rec, best, basis, confidence, months, settings, engine;

    if (res.recommended) {                 /* adapted (editor) shape */
      rec = res.recommended;
      basis = (res.meta && res.meta.basis) || null;
      confidence = (res.meta && res.meta.confidence) || null;
      months = (res.meta && res.meta.monthsAnalyzed) || null;
      settings = res.settings || {};
      engine = res.engine || 'battery-tool-engine';
      return stamp({
        powerKw:       r2(rec.powerKw),
        usableKwh:     r2(rec.usableKwh),
        nameplateKwh:  r2(rec.nameplateKwh),
        durationH:     r2(rec.durationH),
        annualSavings: r0(rec.savingsYr),
        capex:         r0(rec.capex),
        netCapex:      r0(rec.netCapex),
        paybackYr:     r2(rec.paybackYr),
        npv:           r0(rec.npv),
        irr:           rec.irr == null ? null : r2(rec.irr * 100),
        cyclesYr:      r0(rec.cyclesYr),
        cRateBound:    !!rec.cRateLimited,
        basis: basis, confidence: confidence, monthsAnalyzed: months,
        settings: settings, engine: engine
      }, res, opts);
    }

    if (res.best) {                        /* native tool shape */
      best = res.best;
      rec = res.rec || best;
      basis = res.mode === 'interval' ? 'interval' : 'monthly';
      months = res.nMon || null;
      confidence = basis === 'interval'
        ? 'measured'
        : (months >= 12 ? 'billed peaks, swept duration'
                        : 'billed peaks, partial year');
      return stamp({
        powerKw:       r2(rec.kW),
        usableKwh:     r2(rec.kWh),
        nameplateKwh:  r2(rec.nameplate),
        durationH:     r2(best.dur),
        annualSavings: r0((best.annSav || 0) - (best.lossCost || 0)),
        capex:         r0(rec.capex),
        netCapex:      r0(rec.net),
        paybackYr:     isFinite(rec.payback) ? r2(rec.payback) : null,
        npv:           r0(rec.npv),
        irr:           rec.irr == null ? null : r2(rec.irr * 100),
        /* Throughput over usable energy is the cycle count, and the engine
           already reports both, so this is a restatement and not a model. */
        cyclesYr:      (rec.kWh > 0 && best.disAnn != null)
                         ? r0(best.disAnn / rec.kWh) : null,
        cRateBound:    !!rec.cRateBound,
        basis: basis, confidence: confidence, monthsAnalyzed: months,
        settings: opts.settings || {}, engine: 'battery-tool-engine'
      }, res, opts);
    }
    return null;
  }

  function stamp(base, res, opts) {
    base.v = VERSION;
    base.at = Date.now();
    base.by = opts.by || null;
    base.source = opts.source || null;         /* which screen ran it   */
    base.projectId = opts.projectId || null;
    base.unit = (res.units && res.units.input) || 'kw';
    /* The annual energy the battery moves. A financing application asks for
       "estimated annual production"; for storage that is throughput, not
       generation, and saying so is the difference between a number a
       credit analyst can use and one they will query. */
    base.annualThroughputKwh = (base.cyclesYr != null && base.usableKwh != null)
      ? Math.round(base.cyclesYr * base.usableKwh) : null;
    var s = base.settings || {};
    base.assumptions = {
      demandRatePerKw: n(s.dRate),
      itcPct:          n(s.itc),
      omPerKwYr:       n(s.om),
      termYr:          n(s.term),
      discountPct:     n(s.disc),
      dodPct:          n(s.dod),
      rtePct:          n(s.rte),
      cRate:           n(s.cRate)
    };
    delete base.settings;
    return base;
  }

  /* One line a human can check at a glance, basis included. */
  function describe(rec) {
    if (!rec) return '';
    var big = rec.powerKw >= 10000;
    var p = big ? (rec.powerKw / 1000).toFixed(2) + ' MW' : Math.round(rec.powerKw) + ' kW';
    var e = big ? (rec.nameplateKwh / 1000).toFixed(2) + ' MWh'
                : Math.round(rec.nameplateKwh) + ' kWh';
    var s = p + ' / ' + e + ' nameplate';
    if (rec.durationH) s += ', ' + rec.durationH + '-hour';
    if (rec.confidence) s += ' — ' + rec.confidence;
    if (rec.monthsAnalyzed) s += ' (' + rec.monthsAnalyzed + ' month' +
      (rec.monthsAnalyzed === 1 ? '' : 's') + ')';
    return s;
  }

  /* How trustworthy the number is, in a word a reader already understands.
     A single bill is a screening estimate however good the engine is, and
     a deal room should say so next to the figure. */
  function grade(rec) {
    if (!rec) return null;
    if (rec.basis === 'interval') return 'measured';
    if ((rec.monthsAnalyzed || 0) >= 12) return 'twelve bills';
    if ((rec.monthsAnalyzed || 0) > 1) return 'partial year';
    return 'single bill';
  }

  /* Prefill for financing.html. Keys are that form's input ids.
     Only fields the sizing genuinely determines: a customer's legal entity
     is not derivable from a load profile, and guessing it is the kind of
     help that puts a wrong name on a credit application. */
  function toApplicationFields(rec) {
    if (!rec) return {};
    var out = {};
    if (rec.capex != null) out.financedAmount = rec.capex;
    if (rec.annualThroughputKwh != null) out.annualKwh = rec.annualThroughputKwh;
    if (rec.annualSavings != null) out.savingsY1 = rec.annualSavings;
    var a = rec.assumptions || {};
    if (a.itcPct != null) {
      out.itcPct = a.itcPct;
      if (rec.capex != null) out.itcAmount = Math.round(rec.capex * a.itcPct / 100);
    }
    if (a.termYr != null) out.termMonths = Math.round(a.termYr * 12);
    out.scope = 'Battery energy storage — ' + describe(rec) +
                '. Sized from ' + (rec.basis === 'interval'
                  ? 'interval meter data'
                  : (rec.monthsAnalyzed || 0) + ' month' +
                    ((rec.monthsAnalyzed === 1) ? '' : 's') + ' of utility bills') +
                ' by ClearSky OMEGA.';
    return out;
  }

  /* What a deal room carries. `mw` is the field fin_projects already has;
     the rest rides alongside so a capital partner sees the basis. */
  function toDealFields(rec) {
    if (!rec) return {};
    return {
      mw: rec.powerKw != null ? Math.round(rec.powerKw / 1000 * 1000) / 1000 : null,
      bessKw: rec.powerKw,
      bessKwh: rec.nameplateKwh,
      bessDurationH: rec.durationH,
      capexUsd: rec.capex,
      annualSavingsUsd: rec.annualSavings,
      paybackYr: rec.paybackYr,
      sizingBasis: rec.basis,
      sizingGrade: grade(rec),
      sizingConfidence: rec.confidence,
      sizingMonths: rec.monthsAnalyzed,
      sizingAt: rec.at,
      sizingEngine: rec.engine
    };
  }

  /* Rows for a read-only summary panel. */
  function summaryRows(rec) {
    if (!rec) return [];
    var a = rec.assumptions || {};
    var rows = [
      ['System', describe(rec)],
      ['Basis', grade(rec) + (rec.confidence ? ' — ' + rec.confidence : '')],
      ['Installed cost', rec.capex != null ? '$' + rec.capex.toLocaleString() : null],
      ['Annual savings', rec.annualSavings != null ? '$' + rec.annualSavings.toLocaleString() : null],
      ['Simple payback', rec.paybackYr != null ? rec.paybackYr + ' yr' : 'does not pay back'],
      ['Demand charge assumed', a.demandRatePerKw != null ? '$' + a.demandRatePerKw + '/kW-mo' : null],
      ['Sized', rec.at ? new Date(rec.at).toLocaleDateString() : null]
    ];
    return rows.filter(function (r) { return r[1] != null; });
  }

  var API = {
    VERSION: VERSION,
    fromApi: fromApi,
    describe: describe,
    grade: grade,
    toApplicationFields: toApplicationFields,
    toDealFields: toDealFields,
    summaryRows: summaryRows,
    /* Where it lives on the project. One field, one name, everywhere. */
    FIELD: 'bessSizing'
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (root) root.OmegaBessResult = API;
})(typeof window !== 'undefined' ? window : null);
