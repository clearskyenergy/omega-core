/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
/* ====================================================================== *
 *  RETIRED 2026-09-20 — NOT ON THE LIVE PATH.
 *  ------------------------------------------------------------------    *
 *  This was the sizing engine behind the site-map editor's `interval` and
 *  `monthly` modes, while the standalone Battery Sizer ran a different
 *  one. On identical input the two disagreed by 24% on energy from bills
 *  and 52% on a real 8760, and payback by roughly 70% - largely because
 *  this file computes payback as GROSS capex over savings, with no
 *  investment tax credit, no O&M, no capacity fade, no escalation and no
 *  discounting, while the other charged all five.
 *
 *  api/bess-size.js now routes BOTH modes to battery-tool-engine.js
 *  through bess-size-adapter.js. Nothing calls this file any more.
 *
 *  It is kept, rather than deleted, for two reasons. Its 29 tests in
 *  scripts/test-bess-sizer.js are the behavioural reference the
 *  replacement had to match - ratchet windows, leap years, meter-side
 *  accounting, and the rule that savings are credited off the peak the
 *  meter ACTUALLY saw rather than the one the sweep asked for. And a
 *  quoted project sized before this date was sized here, so the file is
 *  the only way to reproduce a number a customer is already holding.
 *
 *  Do not add features here, and do not route anything back to it.
 *
 *  ONE THING TO KNOW IF YOU READ IT: `var window = {}` below means the
 *  `window.BESS_DOD` lookup in derate() can never resolve server-side, so
 *  this engine always ran at a hardcoded 95% depth of discharge no matter
 *  what the caller set. That is one of the reasons its sizes differed.
 * ====================================================================== */
var window = {};
(function () {
  'use strict';
  if (window.OmegaBessSizerEngine) return;

  /* Nameplate is not usable energy: depth of discharge limits what can be
     taken out, and round-trip efficiency limits what reaches the meter.
     Read the app's constants when they exist so one change moves both. */
  function derate() {
    var dod = (typeof window.BESS_DOD === 'number') ? window.BESS_DOD : 0.95;
    var rte = (typeof window.BESS_RTE === 'number') ? window.BESS_RTE : 0.88;
    return dod; /* usable AC discharge budget; all RTE losses charged on recharge */
  }

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function validateTariff(t) {
    var keys = Object.keys(defaultTariff());
    for(var i=0;i<keys.length;i++) if(typeof t[keys[i]]!=='number' || !isFinite(t[keys[i]]) || t[keys[i]]<0) return 'Tariff inputs must be finite nonnegative numbers.';
    if(t.maxC<=0 || t.targetPaybackYr<=0 || t.ratchetPct>1) return 'C-rate and target payback must be positive; ratchet must be between 0 and 1.';
    return null;
  }
  function defaultTariff() {
    return {
      demandChargePerKw: 18,      /* $/kW-month                            */
      energyRate: 0.11,           /* $/kWh flat, used only for arbitrage   */
      touSpread: 0,               /* $/kWh on-peak minus off-peak          */
      ratchetPct: 0,              /* 0 = no ratchet; 0.8 = 80% of 11-mo max */
      capexPerKwh: 400,           /* installed $/kWh                        */
      capexPerKw: 250,            /* installed $/kW of power                */
      maxC: 0.5,                  /* power / energy limit, 0.5C = 2 h min   */
      targetPaybackYr: 7
    };
  }

  /* ================================================================== *
   *  1.  INTERVAL DATA — the measured answer                           *
   * ================================================================== */

  /* Contiguous runs above a threshold, merging brief dips: a battery that
     is discharging does not get to recover during a two-interval dip, so
     two runs separated by less than the tolerance are one event. */
  function eventsAbove(vals, hrs, thr, dipTol) {
    dipTol = dipTol == null ? Math.max(1, Math.round(0.5 / hrs)) : dipTol;
    var out = [], cur = null, below = 0, i;
    for (i = 0; i < vals.length; i++) {
      if (vals[i] > thr) {
        if (!cur) cur = { a: i, b: i, energyKwh: 0, peakKw: 0 };
        else if (below) {
          /* absorb the dip we just walked through */
          for (var k = cur.b + 1; k < i; k++) cur.energyKwh += Math.max(0, vals[k] - thr) * hrs;
        }
        cur.b = i; below = 0;
        cur.energyKwh += (vals[i] - thr) * hrs;
        if (vals[i] > cur.peakKw) cur.peakKw = vals[i];
      } else if (cur) {
        below++;
        if (below > dipTol) {
          cur.hours = (cur.b - cur.a + 1) * hrs;
          out.push(cur); cur = null; below = 0;
        }
      }
    }
    if (cur) { cur.hours = (cur.b - cur.a + 1) * hrs; out.push(cur); }
    return out;
  }

  /* Rough month boundaries for a full year of evenly spaced intervals.
     A partial series is evaluated as one block and says so. */
  /* startMonth is the calendar month row zero falls in. A utility export
     usually begins at the BILLING CYCLE rather than on 1 January, and
     demand charges are billed per month — so assuming January on a file
     that starts in July attributes every peak to the wrong month and sizes
     against the wrong one. The caller reads it off a timestamp column when
     the file has one and passes 0 when it does not, saying so. */
  function monthSpans(n, intervalMin, startMonth) {
    var perDay = Math.round(24 * 60 / intervalMin);
    if (n !== perDay * 365 && n !== perDay * 366) return null;
    var days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31], out = [], at = 0;
    if (n === perDay * 366) days[1] = 29;
    var s0 = (startMonth == null ? 0 : ((startMonth % 12) + 12) % 12);
    for (var i = 0; i < 12; i++) {
      var m = (s0 + i) % 12;
      /* The last span runs to the end of the series: a leap year is 24 h
         longer than the table and those hours were never examined. */
      var b = (i === 11) ? n : Math.min(n, at + days[m] * perDay);
      out.push({ a: at, b: b, month: m });
      at = b;
    }
    return out;
  }

  /* ══════════════════════════════════════════════════════════════════════
     DISPATCH — the only thing that knows whether a battery can do the job

     Everything above this line sizes ANALYTICALLY: measure the energy above
     a line, divide by the derate, check the gap between events against a
     recharge time. It is fast, it is readable, and on a real load shape it
     is wrong in the direction that costs the customer money.

     Measured on a 1,150 kW two-peak profile: the analytic sizer recommended
     537 kW / 1,927 kWh and promised $107,069 a year. Dispatching that exact
     system hour by hour against the same load, it failed to hold the target
     in 591 of 8,760 hours and delivered $41,424 — a 61% overstatement.

     The reason is a constraint the analytic form cannot express. The
     threshold in every month had landed on that month's average, which is
     what the "you cannot shave into the baseline" cap allows. But the cap is
     about the wrong quantity: what matters is not whether the threshold sits
     above the baseline, it is whether the energy discharged in a day can be
     PUT BACK in that day's off-peak hours at the headroom that is left. At a
     threshold equal to the average there was 52-213 kW of charge room
     against a 100-537 kW shave. No arrangement of the analytic terms sees
     that; a simulation sees it immediately.

     So the simulation is now the sizer, not a checker. It runs a greedy
     peak-shaving policy with a real state of charge:
       discharge to hold the month's threshold, limited by power and by what
       is in the battery;
       charge whenever the load is under the threshold, limited by power, by
       the headroom UNDER the threshold — a charge that creates a new peak is
       not shaving — and by what the pack still has room for;
       round-trip losses are taken on the way in.

     It reports the peak the meter ACTUALLY sees each month. That number, not
     the target, is what the utility bills, so that number is what the
     savings are computed from. A battery that misses its target still gets
     credit for what it did achieve, and never for what it did not.
     ══════════════════════════════════════════════════════════════════════ */
  function dispatchYear(vals, blocks, thresholds, powerKw, usableKwh, hrs, rte) {
    var soc = 0, chargeEff = rte;
    var chargeKwh = 0;
    var billed = [], breaches = 0, shortfallKwh = 0, worstBreachKw = 0, dischargeKwh = 0;
    for (var b = 0; b < blocks.length; b++) {
      var sp = blocks[b], thr = thresholds[b], metered = 0;
      for (var i = sp.a; i < sp.b; i++) {
        var load = vals[i], net = load;
        if (load > thr) {
          var give = Math.min(load - thr, powerKw, soc / hrs);
          if (give > 0) { soc -= give * hrs; dischargeKwh += give * hrs; net = load - give; }
          if (net > thr + 1e-6) {
            breaches++;
            shortfallKwh += (net - thr) * hrs;
            if (net - thr > worstBreachKw) worstBreachKw = net - thr;
          }
        } else {
          var room = Math.min(powerKw, thr - load, (usableKwh - soc) / (hrs * chargeEff));
          if (room > 0) { soc = Math.min(usableKwh, soc + room * hrs * chargeEff); net += room; chargeKwh += room * hrs; }
        }
        if (net > metered) metered = net;
      }
      billed.push(metered);
    }
    return { billedPeaks: billed, breaches: breaches, shortfallKwh: shortfallKwh,
             worstBreachKw: worstBreachKw, dischargeKwh: dischargeKwh, chargeKwh: chargeKwh, finalSocKwh: soc };
  }

  /* The smallest usable energy that lets the dispatch hold every threshold.
     Doubling to find a working size, then bisecting for the edge — a search
     rather than a formula, because the feasible point depends on where the
     off-peak hours fall relative to the peaks, which is exactly the thing a
     formula cannot carry. Bounded: past a day of storage at full power the
     answer is "this shave is not reachable", not a bigger battery. */
  function solveEnergy(vals, blocks, thresholds, powerKw, hrs, rte, seedKwh) {
    var ceiling = powerKw * 24;
    var lo = 0, hi = Math.max(1, Math.min(ceiling, seedKwh || powerKw * 2));
    var res = dispatchYear(vals, blocks, thresholds, powerKw, hi, hrs, rte);
    var guard = 0;
    while (res.breaches > 0 && hi < ceiling && ++guard < 20) {
      lo = hi; hi = Math.min(ceiling, hi * 2);
      res = dispatchYear(vals, blocks, thresholds, powerKw, hi, hrs, rte);
    }
    if (res.breaches > 0) {
      /* Not reachable at this power. Return the ceiling and the damage, so
         the caller can still price what it DOES achieve. */
      return { usableKwh: hi, feasible: false, sim: res };
    }
    for (var k = 0; k < 18 && hi - lo > Math.max(1, hi * 0.01); k++) {
      var mid = (lo + hi) / 2;
      var r = dispatchYear(vals, blocks, thresholds, powerKw, mid, hrs, rte);
      if (r.breaches > 0) lo = mid; else { hi = mid; res = r; }
    }
    return { usableKwh: hi, feasible: true, sim: res };
  }

  function sizeFromInterval(vals, opts) {
    /* The 24-value floor lived only in the dialog, so a direct call —
       which the console API openly invites — would size a battery from
       three numbers and report it with the same confidence as a year of
       data. The guard belongs on the engine. */
    if (!vals || vals.length < 24) {
      return { ok: false, error: 'Interval sizing needs at least 24 readings; ' +
               'got ' + ((vals && vals.length) || 0) + '. Paste a load column in kW.' };
    }
    opts = opts || {};
    var tariff = merge(defaultTariff(), opts.tariff);
    var invalid = validateTariff(tariff);
    if (invalid) return {ok:false,error:invalid};
    var intervalMin = opts.intervalMin == null ? 60 : +opts.intervalMin;
    if ([5, 10, 15, 20, 30, 60].indexOf(intervalMin) < 0) return {ok:false,error:'Choose a supported interval length (5, 10, 15, 20, 30 or 60 minutes).'};
    for (var vi=0; vi<vals.length; vi++) if (typeof vals[vi] !== 'number' || !isFinite(vals[vi]) || vals[vi]<0) return {ok:false,error:'Load readings must be finite, nonnegative kW. Export/negative readings need a net-load model.'};
    var hrs = intervalMin / 60;
    var spans = monthSpans(vals.length, intervalMin, opts.startMonth);
    if (!spans) return {ok:false,error:'Annual interval sizing requires a complete 365- or 366-day series. Use the standalone Battery Sizer for explicitly annualized partial-period screening.'};
    var blocks = spans;
    var D = derate();
    var RTE = (typeof window.BESS_RTE === 'number') ? window.BESS_RTE : 0.88;

    var peaks = blocks.map(function (sp) {
      var p = 0, sum = 0;
      for (var i = sp.a; i < sp.b; i++) { if (vals[i] > p) p = vals[i]; sum += vals[i]; }
      return { month: sp.month, peakKw: p, avgKw: (sp.b > sp.a) ? sum / (sp.b - sp.a) : 0,
               kwh: sum * hrs, a: sp.a, b: sp.b };
    });

    var annualPeak = peaks.reduce(function (m, p) { return Math.max(m, p.peakKw); }, 0);
    var annualKwh = peaks.reduce(function (s, p) { return s + p.kwh; }, 0);

    /* Evaluate one candidate shave depth across every month. Each month
       bills its own peak, so each month gets its own threshold. */
    /* Energy above the threshold in the worst single DAY of a span. Two
       peaks in one day with an hour between them is the ordinary shape of a
       facility with a shift change, and a battery that cannot get back up in
       that hour has to carry both. */
    function worstDayKwh(a, b, thr) {
      var per = Math.max(1, Math.round(24 / hrs)), worst = 0;
      for (var d = a; d < b; d += per) {
        var e = 0, lim = Math.min(b, d + per);
        for (var i = d; i < lim; i++) if (vals[i] > thr) e += (vals[i] - thr) * hrs;
        if (e > worst) worst = e;
      }
      return worst;
    }

    function evaluate(shaveKw) {
      var worstHours = 0, events = 0, months = [], thresholds = [], analytic = 0;
      var minGapH = Infinity;

      peaks.forEach(function (m) {
        /* The threshold is still capped at peak-minus-average: below the
           month's own average the meter can never come back under the line,
           so there is no off-peak at all and nothing to recharge from. That
           cap is necessary and it is NOT sufficient — see dispatchYear. */
        var applied = Math.min(shaveKw, Math.max(0, m.peakKw - m.avgKw));
        var thr = Math.max(0, m.peakKw - applied);
        thresholds.push(thr);

        var ev = eventsAbove(vals, hrs, thr, Math.max(1, Math.round(0.5 / hrs)));
        ev = ev.filter(function (e) { return e.a >= m.a && e.a < m.b; });
        var worst = 0, prevEnd = null;
        ev.forEach(function (e) {
          if (e.energyKwh > worst) worst = e.energyKwh;
          if (e.hours > worstHours) worstHours = e.hours;
          if (prevEnd != null) {
            var gap = (e.a - prevEnd) * hrs;
            if (gap < minGapH) minGapH = gap;
          }
          prevEnd = e.b;
        });
        events += ev.length;
        if (worst > analytic) analytic = worst;
        months.push({ month: m.month, peakKw: m.peakKw, thresholdKw: thr,
                      shaveKw: applied, capped: applied < shaveKw,
                      eventKwh: worst, events: ev.length });
      });

      var powerKw = months.length
        ? months.reduce(function (mx, m) { return Math.max(mx, m.shaveKw); }, 0)
        : shaveKw;
      if (!(powerKw > 0)) return null;

      /* SIZED BY SIMULATION. The analytic worst-event figure is kept only as
         the search seed and as something to report against — it is what the
         old sizer would have answered, and on the test profile it was 61%
         optimistic. */
      var sol = solveEnergy(vals, blocks, thresholds, powerKw, hrs, RTE,
                            (analytic / D) || powerKw * 2);
      var sim = sol.sim;

      /* The meter's own peaks, which is what the utility bills. A battery
         that misses its target is credited with what it did achieve. */
      var achieved = months.map(function (m, k) {
        return Math.max(0, m.peakKw - (sim.billedPeaks[k] != null ? sim.billedPeaks[k] : m.peakKw));
      });
      months.forEach(function (m, k) {
        m.billedKw = sim.billedPeaks[k];
        m.achievedKw = achieved[k];
        m.heldTarget = sim.billedPeaks[k] <= m.thresholdKw + 1e-6;
      });

      var nameplateKwh = sol.usableKwh / D;
      return {
        shaveKw: shaveKw, powerKw: powerKw,
        usableKwh: sol.usableKwh, nameplateKwh: nameplateKwh,
        analyticKwh: analytic / D,
        achievedShave: achieved,
        durationH: powerKw > 0 ? sol.usableKwh / powerKw : 0,
        events: events, worstEventH: worstHours,
        throughputKwh: sim.dischargeKwh, chargingKwh: sim.chargeKwh, finalSocKwh: sim.finalSocKwh,
        cyclesYr: sol.usableKwh > 0 ? sim.dischargeKwh / sol.usableKwh : 0,
        breaches: sim.breaches, shortfallKwh: sim.shortfallKwh,
        worstBreachKw: sim.worstBreachKw,
        feasible: sol.feasible,
        rechargeH: powerKw > 0 ? sol.usableKwh / powerKw : 0,
        minGapH: isFinite(minGapH) ? minGapH : null,
        rechargeTight: !sol.feasible,
        monthsCapped: months.filter(function (m) { return m.capped; }).length,
        months: months, basis: spans ? 'interval-12mo-dispatch' : 'interval-partial-dispatch'
      };
    }

    return sweep(evaluate, annualPeak, peaks, tariff, {
      basis: spans ? 'interval' : 'interval-partial',
      confidence: spans ? 'measured' : 'measured (partial year)',
      startMonth: spans ? spans[0].month : null,
      startAssumed: opts.startMonth == null,
      annualPeak: annualPeak, annualKwh: annualKwh, peaks: peaks,
      loadFactor: annualPeak > 0 ? (annualKwh / (annualPeak * vals.length * hrs)) : 0,
      intervalMin: intervalMin
    });
  }

  /* ================================================================== *
   *  2.  TWELVE MONTHLY BILLS — real peaks, assumed shape              *
   * ================================================================== */
  function sizeFromMonthly(rows, opts) {
    opts = opts || {};
    var tariff = merge(defaultTariff(), opts.tariff);
    var invalid = validateTariff(tariff);
    if (invalid) return {ok:false,error:invalid};
    if(!Array.isArray(rows)||!rows.length||rows.some(function(r){return !r||!isFinite(+r.demandKw)||+r.demandKw<0||!isFinite(+r.kwh)||+r.kwh<0||(r.hours!=null&&(!isFinite(+r.hours)||+r.hours<=0));})) return {ok:false,error:'Monthly inputs must contain finite nonnegative demand and energy, with positive hours.'};
    if(opts.peakHours!=null && (!isFinite(+opts.peakHours)||+opts.peakHours<=0)) return {ok:false,error:'Peak hours must be positive.'};
    var D = derate();
    var peaks = rows.filter(function (r) { return +r.demandKw > 0; }).map(function (r, i) {
      var kwh = +r.kwh || 0, peak = +r.demandKw;
      var hoursInMonth = +r.hours || 730;
      return { month: (r.month != null ? r.month : i), peakKw: peak, kwh: kwh,
               avgKw: kwh > 0 ? kwh / hoursInMonth : 0,
               loadFactor: kwh > 0 ? Math.min(1, kwh / (peak * hoursInMonth)) : null };
    });
    if (!peaks.length) return { ok: false, error: 'No months with a billed demand value.' };

    var annualPeak = peaks.reduce(function (m, p) { return Math.max(m, p.peakKw); }, 0);
    var annualKwh = peaks.reduce(function (s, p) { return s + p.kwh; }, 0);
    var lf = peaks.filter(function (p) { return p.loadFactor != null; });
    var avgLf = lf.length ? lf.reduce(function (s, p) { return s + p.loadFactor; }, 0) / lf.length : null;

    /* A monthly bill has no shape, so peak DURATION has to be assumed.
       Rather than bury one number, the assumption is explicit, defaults
       from load factor, and the answer is reported across a band. */
    var assumedH = +opts.peakHours || defaultPeakHours(avgLf);

    function evaluate(shaveKw) {
      var needKwh = 0, months = [];
      peaks.forEach(function (m) {
        /* You cannot shave below the month's average demand and still
           recharge; that bound keeps the sweep physical. */
        var maxShave = Math.max(0, m.peakKw - m.avgKw);
        var applied = Math.min(shaveKw, maxShave);
        var e = applied * assumedH;
        if (e > needKwh) needKwh = e;
        months.push({ month: m.month, peakKw: m.peakKw, thresholdKw: m.peakKw - applied,
                      shaveKw: applied, eventKwh: e, capped: applied < shaveKw });
      });
      var nameplate = needKwh / D;
      var powerKw = months.reduce(function(mx,m){return Math.max(mx,m.shaveKw);},0);
      if (!(powerKw>0)) return null;
      return {
        powerKw: powerKw, achievedShave: months.map(function(m){return m.shaveKw;}),
        shaveKw: shaveKw, usableKwh: needKwh, nameplateKwh: nameplate,
        durationH: assumedH, assumedDuration: true,
        events: null, worstEventH: assumedH,
        throughputKwh: needKwh * 250,           /* nominal weekday cycling */
        cyclesYr: 250, rechargeH: shaveKw > 0 ? nameplate / shaveKw : 0,
        minGapH: null, rechargeTight: false,
        months: months, basis: '12-month bills'
      };
    }

    var res = sweep(evaluate, annualPeak, peaks, tariff, {
      basis: rows.length >= 6 ? 'monthly' : 'single-bill',
      confidence: rows.length >= 6 ? 'billed peaks, assumed duration' : 'single bill, low confidence',
      annualPeak: annualPeak, annualKwh: annualKwh, peaks: peaks,
      loadFactor: avgLf, assumedPeakHours: assumedH
    });

    /* Duration sensitivity: the same shave at 1, 2, 3 and 4 hours. This is
       the honest way to present an assumed number — as a range whose width
       is the cost of not having interval data. */
    if (res.ok && res.recommended) {
      res.sensitivity = [1, 2, 3, 4].map(function (h) {
        var kwh = res.recommended.powerKw * h / D;
        return { hours: h, nameplateKwh: Math.round(kwh),
                 capex: Math.round(kwh * tariff.capexPerKwh +
                                   res.recommended.powerKw * tariff.capexPerKw) };
      });
    }
    return res;
  }

  function defaultPeakHours(lf) {
    if (lf == null) return 2;
    if (lf < 0.30) return 3;      /* spiky: short, sharp peaks but deep     */
    if (lf < 0.50) return 2.5;
    if (lf < 0.70) return 2;
    return 1.5;                   /* flat load: the peak is barely a peak   */
  }

  /* ================================================================== *
   *  3.  SWEEP AND RECOMMEND                                           *
   *  Rather than picking a shave fraction out of the air, walk the      *
   *  depth from shallow to deep and let the economics choose.           *
   * ================================================================== */
  /* `shave` is either one kW figure or a per-month array.
     PER-MONTH MATTERS. A sweep step asks for, say, 690 kW, but a shoulder
     month can only give up peak-minus-baseline before the battery has
     nothing to recharge from — so evaluate() caps each month separately.
     Crediting the full 690 kW against EVERY month bills the customer's
     savings for a shave that month physically cannot take, and on the test
     profile twelve of twelve months were capped while the savings line
     claimed the deep number for all of them. */
  function billedDemand(peaks, shave, ratchetPct) {
    var per = Array.isArray(shave);
    /* Ratchet: the billed demand is the greater of this month's peak and
       a percentage of the highest peak in the trailing months. Sizing that
       ignores a ratchet promises savings the tariff will not pay, because
       one un-shaved peak sets the floor for a year. */
    var after = peaks.map(function (p, i) {
      var sh = per ? (+shave[i] || 0) : shave;
      return Math.max(0, p.peakKw - sh);
    });
    if (!ratchetPct) return after;
    var out = [];
    for (var i = 0; i < after.length; i++) {
      var hi = 0;
      for (var j = Math.max(0,i-11); j < i; j++) if (after[j] > hi) hi = after[j];
      out.push(Math.max(after[i], hi * ratchetPct));
    }
    return out;
  }

  function sweep(evaluate, annualPeak, peaks, tariff, meta) {
    var D = derate();
    var annualization = meta.basis === 'interval' ? 1 : 12 / peaks.length;
    meta.annualizationFactor=annualization;
    var baseBilled = billedDemand(peaks, 0, tariff.ratchetPct);
    var baseDemandCost = baseBilled.reduce(function (s, kw) { return s + kw * tariff.demandChargePerKw; }, 0) * annualization;

    var candidates = [];
    var steps = 24;
    for (var i = 1; i <= steps; i++) {
      var shaveKw = Math.round(annualPeak * (i / steps) * 0.6);   /* up to 60% of peak */
      if (!shaveKw) continue;
      if (candidates.length && candidates[candidates.length - 1].shaveKw === shaveKw) continue;
      var c = evaluate(shaveKw);
      if (!c) continue;

      /* C-rate limit: a battery cannot deliver more power than its energy
         and chemistry allow. If the sweep asks for it, grow the energy. */
      var minKwhForPower = c.powerKw / tariff.maxC;
      if (c.nameplateKwh < minKwhForPower) {
        c.nameplateKwh = minKwhForPower;
        c.usableKwh = c.nameplateKwh * D;
        c.cRateLimited = true;
      }

      /* ── SAVINGS COME OFF THE METER, NOT OFF THE TARGET ───────────────
         This used to bill against the shave the sweep ASKED for. The
         dispatch reports the peak the meter actually saw in each month, and
         that is what the utility charges on — so a system that misses its
         target is credited with what it achieved and never with what it
         intended. On the profile that exposed this, the difference between
         those two readings was $107,069 promised against $41,424 real. */
      var after = billedDemand(peaks, c.achievedShave, tariff.ratchetPct);
      var afterCost = after.reduce(function (s, kw) { return s + kw * tariff.demandChargePerKw; }, 0);
      c.demandSavingsYr = baseDemandCost - afterCost * annualization;

      /* ── ARBITRAGE CANNOT EXCEED ONE CYCLE A DAY, AND IT COMPETES ─────
         This multiplied the battery's usable energy by cyclesYr — a number
         derived from DEMAND-SHAVING throughput, which on a peaky site
         legitimately exceeds 365 equivalent cycles because a battery sized
         for the worst event discharges partially on many smaller ones.
         Feeding that back in as an arbitrage cycle count credited 455
         cycles a year: 1.25x the physical ceiling, and it moved payback
         from 7.8 years to 4.4, which is the number a customer signs on.

         Two things are true and neither was modelled. A battery cannot
         deliver more than one full cycle a day without a second cycle's
         degradation and a tariff that pays for it. And arbitrage COMPETES
         with demand shaving for the same stored energy rather than adding
         to it — a battery working hard on demand charges has less room to
         trade, not more.

         So: an annual discharge ceiling of one cycle a day, minus what
         demand shaving has already committed, priced at the spread. It is
         a simple model and it is bounded by physics, which the old one was
         not. */
      var annualCeilingKwh = c.nameplateKwh * D * 365;
      c.arbitrageKwh = (tariff.touSpread > 0)
        ? Math.max(0, annualCeilingKwh - (c.throughputKwh || 0))
        : 0;
      c.arbitrageCycles = c.nameplateKwh > 0 ? c.arbitrageKwh / (c.nameplateKwh * D) : 0;
      c.arbitragePotentialYr = c.arbitrageKwh * Math.max(0,tariff.touSpread - tariff.energyRate*(1/0.88-1));
      c.arbitrageYr = 0; /* no hourly buy/sell schedule was supplied */
      c.chargingLossCostYr = (c.chargingKwh!=null ? Math.max(0,c.chargingKwh-(c.throughputKwh||0)) : (c.throughputKwh||0)*(1/0.88-1)) * tariff.energyRate;
      c.savingsYr = c.demandSavingsYr - c.chargingLossCostYr;
      c.capex = c.nameplateKwh * tariff.capexPerKwh + c.powerKw * tariff.capexPerKw;
      c.paybackYr = c.savingsYr > 0 ? c.capex / c.savingsYr : null;
      c.savingsPerCapex = c.capex > 0 ? c.savingsYr / c.capex : 0;
      candidates.push(c);
    }
    if (!candidates.length) return { ok: false, error: 'Not enough load data to size anything.' };

    /* Choosing the size.
       Savings and cost both scale with depth, so "best return per dollar"
       degenerates to "smallest battery" on a linear tariff — it would
       recommend a token system on every site. What a developer actually
       wants is the DEEPEST shave the tariff still pays for: maximum
       absolute savings, subject to the payback target and to the battery
       being able to recharge between events. Return per dollar is carried
       alongside so the trade is visible rather than hidden. */
    /* rechargeTight is NOT a veto any more. evaluate() now grows the battery
       to carry the whole day when it cannot get back up between two events,
       so a tight duty cycle is a fact about the system that was sized, not a
       reason there is no system. Leaving it in this filter is what emptied
       the eligible list on every two-peak site and sent the recommendation
       to the smallest candidate in the sweep. */
    var eligible = candidates.filter(function (c) {
      return c.feasible !== false && c.paybackYr != null && c.paybackYr <= tariff.targetPaybackYr;
    });
    var best = null;
    if (eligible.length) {
      eligible.forEach(function (c) { if (!best || c.savingsYr > best.savingsYr) best = c; });
    } else {
      /* Nothing meets the target. Show the best return anyway and say so,
         rather than recommending nothing or pretending the target was met. */
      /* BEST PAYBACK, NOT BEST RATIO. On a linear tariff "return per dollar"
         is monotonically best at the smallest battery, so this branch used to
         recommend a token system whenever the target was missed — the exact
         degeneracy the eligible branch was written to avoid, reproduced in
         its fallback. The honest answer when nothing hits the target is the
         size that comes CLOSEST to hitting it. */
      candidates.forEach(function (c) {
        if (c.feasible === false || c.paybackYr == null) return;
        if (!best || c.paybackYr < best.paybackYr) best = c;
      });
      if (!best) candidates.forEach(function (c) {
        if (c.feasible !== false && (!best || c.savingsPerCapex > best.savingsPerCapex)) best = c;
      });
    }

    if (!best) return {ok:false,error:'No candidate held the requested demand target within the storage search limit.'};
    meta.ratchetBasis = 'Trailing 11 observed months; prior history not supplied';
    meta.dispatchBasis = 'Starts empty; state of charge carries through all intervals';
    meta.arbitrageBasis = 'Potential only; excluded from payback without time-of-use dispatch';
    return {
      ok: true, meta: meta, tariff: tariff, derate: D,
      candidates: candidates, recommended: best,
      metTarget: eligible.length > 0,
      baseDemandCostYr: baseDemandCost,
      annualPeak: annualPeak
    };
  }

  /* ================================================================== *
   *  4.  PARSERS AND HELPERS                                           *
   * ================================================================== */
  function merge(a, b) {
    var o = {}, k;
    for (k in a) o[k] = a[k];
    if (b) for (k in b) if (b[k] != null && b[k] !== '') o[k] = b[k];
    return o;
  }

  /* Accepts a pasted column or CSV; takes the last numeric column, which
     is where load lands in nearly every utility export. */
  /* Split on delimiters that are OUTSIDE quotes. Utility exports write
     thousands separators inside quoted fields ("1,234.5"), so a naive
     split turns 1,234.5 kW into 234.5 kW — a tenfold sizing error that
     looks entirely plausible on screen. */
  function splitRow(ln) {
    var out = [], cur = '', q = false;
    for (var i = 0; i < ln.length; i++) {
      var ch = ln.charAt(i);
      if (ch === '"') { q = !q; continue; }
      if (!q && (ch === ',' || ch === ';' || ch === '\t')) { out.push(cur); cur = ''; continue; }
      cur += ch;
    }
    out.push(cur);
    return out;
  }

  function parseInterval(text) {
    var lines=String(text||'').split(/[\r\n]+/),vals=[],column=null;
    function number(value){var clean=String(value==null?'':value).replace(/[$,"\s]/g,'');return clean!=='' && /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(clean)?Number(clean):NaN;}
    lines.forEach(function(line){
      if(!line.trim())return;
      var parts=splitRow(line);
      if(column==null){
        for(var i=parts.length-1;i>=0;i--){if(isFinite(number(parts[i]))){column=i;break;}}
        if(column==null)return; // leading nonnumeric header
      }
      vals.push(number(parts[column])); // invalid data stays invalid; never substitute a timestamp
    });return vals;
  }

  function detectInterval(n) {
    var steps=[5,10,15,20,30,60];
    for(var i=0;i<steps.length;i++){var per=1440/steps[i];if(n===365*per||n===366*per)return steps[i];}
    return 60; // annual engine rejects incomplete data; standalone tool accepts explicit interval lengths
  }

  /* Round to something orderable rather than a calculated decimal. */
  function roundProduct(kw, kwh, step) {
    step = step || { kw: 25, kwh: 50 };
    return {
      kw: Math.ceil(kw / step.kw) * step.kw,
      kwh: Math.ceil(kwh / step.kwh) * step.kwh
    };
  }

  function summarize(res) {
    if (!res || !res.ok) return null;
    var r = res.recommended;
    /* powerKw, not shaveKw. The sweep ASKS for shaveKw; powerKw is the
       deepest shave any month can actually take, and it is what the capex,
       the C-rate limit and the savings were all computed against. Handing
       Config the swept number would install an inverter the analysis never
       priced. */
    var p = roundProduct(r.powerKw != null ? r.powerKw : r.shaveKw, r.nameplateKwh);
    return {
      kw: p.kw, kwh: p.kwh,
      durationH: p.kw > 0 ? +(p.kwh * res.derate / p.kw).toFixed(2) : 0,
      shaveKw: r.powerKw != null ? r.powerKw : r.shaveKw, calcKwh: Math.round(r.nameplateKwh),
      /* What the hour-by-hour dispatch found. A size with breaches is a size
         that misses its target in that many intervals of the year; savings
         are already credited off the metered peak, but the count is the
         thing that says whether the system does what it was drawn to do. */
      breaches: r.breaches != null ? r.breaches : null,
      worstBreachKw: r.worstBreachKw != null ? Math.round(r.worstBreachKw) : null,
      feasible: r.feasible !== false,
      analyticKwh: r.analyticKwh != null ? Math.round(r.analyticKwh) : null,
      savingsYr: Math.round(r.savingsYr), capex: Math.round(r.capex),
      paybackYr: r.paybackYr != null ? +r.paybackYr.toFixed(1) : null,
      cyclesYr: Math.round(r.cyclesYr || 0),
      basis: res.meta.basis, confidence: res.meta.confidence,
      assumedDuration: !!r.assumedDuration,
      cRateLimited: !!r.cRateLimited,
      metTarget: res.metTarget
    };
  }

  window.OmegaBessSizerEngine = {
    MONTHS: MONTHS, defaultTariff: defaultTariff, derate: derate,
    eventsAbove: eventsAbove, monthSpans: monthSpans,
    sizeFromInterval: sizeFromInterval, sizeFromMonthly: sizeFromMonthly,
    billedDemand: billedDemand, defaultPeakHours: defaultPeakHours,
    parseInterval: parseInterval, splitRow: splitRow, detectInterval: detectInterval,
    roundProduct: roundProduct, summarize: summarize,
    /* Exported so the sizing can be checked from outside the thing that did
       it — the regression suite re-dispatches the recommendation through a
       separately written loop, which is the only test that would catch the
       engine agreeing with itself. */
    dispatchYear: dispatchYear, solveEnergy: solveEnergy
  };
})();
module.exports = window.OmegaBessSizerEngine;
