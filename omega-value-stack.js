/* ==========================================================================
   omega-value-stack.js  ·  ClearSky-OMEGA shared platform file
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   --------------------------------------------------------------------------
   WHAT A BATTERY EARNS, AND WHO SAYS SO.

   The platform could say what a site costs and never what it returns, so
   every conversation ended at a capex number. This is the other half.

   IT IS BUILT THE SAME WAY THE COST MODEL IS. Every figure declares its
   tier — published, planning, or user-stated — and a stream with no source
   is reported as an assumption rather than as revenue. A revenue stack is
   exactly where optimism gets laundered into a spreadsheet, so the rule is
   stricter here than on the cost side, not looser.

   ES5, dependency-free: it runs in the site finder, in the estimator, and
   in a Vercel function.
   ========================================================================== */
(function (root) {
  "use strict";

  var V = {};

  /* ── PJM CAPACITY ────────────────────────────────────────────────────
     Two published numbers, both off PJM's own documents, both dated.

     The clearing price is what capacity sold for. The ELCC class rating is
     what PJM will actually ACCREDIT a battery at, and it is the number
     people leave out: a 4-hour battery is not 1 MW of capacity, it is 59%
     of 1 MW. Quoting the clearing price against nameplate overstates this
     stream by nearly half, and it is the single commonest error in a
     storage pro forma.

     Longer duration accredits higher, which is a real argument for the
     8-hour system the fit list keeps proposing — and one of the few places
     where the bigger battery pays for itself twice. */
  var PJM = {
    price: 325.00,                 /* $/MW-day UCAP */
    priceRef: "PJM 2028/2029 Base Residual Auction results report, 14 July 2026 — "
            + "all prices cleared at the $325.00 cap. ComEd was modelled as an LDA "
            + "and cleared at the RTO price.",
    priceUrl: "https://www.pjm.com/-/media/DotCom/markets-ops/rpm/rpm-auction-info/"
            + "2028-2029/2028-2029-bra-results-report.pdf",
    /* Duration class -> accredited fraction of nameplate. */
    elcc: [[4, 0.59], [6, 0.68], [8, 0.71], [10, 0.78]],
    elccRef: "PJM ELCC Class Ratings for the 2028/2029 Base Residual Auction: "
           + "4-hr storage 59%, 6-hr 68%, 8-hr 71%, 10-hr 78%.",
    elccUrl: "https://www.pjm.com/-/media/DotCom/planning/res-adeq/elcc/"
           + "28-29-bra-elcc-class-ratings.pdf"
  };

  /* PJM assigns a class by duration. A 6.5-hour battery does not get the
     8-hour rating, so the class at or below the duration is used — and
     below four hours there is no storage class here at all, which is
     reported rather than extrapolated. */
  function elccFor(hours) {
    var best = null, i;
    for (i = 0; i < PJM.elcc.length; i++) {
      if (hours >= PJM.elcc[i][0]) best = PJM.elcc[i];
    }
    return best ? { hours: best[0], rate: best[1] } : null;
  }

  V.PJM = PJM;
  V.elccFor = elccFor;

  /* ── THE STACK ───────────────────────────────────────────────────────
     input: { kw, hours, demandLoPerKwMonth, demandHiPerKwMonth,
              vppPerKwYear, vppRef, utilityOpexPerKwYear, utilityOpexRef }

     Anything the caller does not supply is simply absent from the stack —
     never defaulted to a number. An absent stream shows as "not counted"
     and the total says how many streams it is missing, because a total
     that silently omits two of five reads like a complete answer. */
  V.stack = function (input) {
    input = input || {};
    var kw = +input.kw, hours = +input.hours;
    if (!isFinite(kw) || kw <= 0) return null;
    var mw = kw / 1000;
    var streams = [], missing = [];

    /* 1 — PJM capacity, published on both halves. */
    var e = isFinite(hours) ? elccFor(hours) : null;
    if (e) {
      var ucapMw = mw * e.rate;
      streams.push({
        id: "pjm.capacity",
        name: "PJM capacity",
        usd: ucapMw * PJM.price * 365,
        tier: "published",
        how: Math.round(kw).toLocaleString() + " kW accredited at " +
             Math.round(e.rate * 100) + "% (PJM's " + e.hours + "-hour storage class) = " +
             (Math.round(ucapMw * 1000)).toLocaleString() + " kW UCAP, at $" +
             PJM.price.toFixed(2) + " / MW-day.",
        ref: PJM.priceRef + " " + PJM.elccRef,
        url: PJM.priceUrl
      });
    } else {
      missing.push("PJM capacity — under four hours there is no storage class to " +
                   "accredit against, so nothing is claimed.");
    }

    /* 2 — Demand charges avoided. Not revenue: a bill that stops arriving.
       Kept in the stack because it is usually the largest single line and
       leaving it out understates the case as badly as inventing one
       overstates it. */
    var dLo = +input.demandLoPerKwMonth, dHi = +input.demandHiPerKwMonth;
    if (isFinite(dLo) && isFinite(dHi) && dLo > 0) {
      streams.push({
        id: "demand",
        name: "Demand charges avoided",
        usd: kw * dLo * 12, usdHi: kw * dHi * 12,
        tier: "planning",
        how: Math.round(kw).toLocaleString() + " kW against $" + dLo + "–$" + dHi +
             " / kW-month of delivery and capacity charge.",
        ref: "A screening band for ComEd C&I, not this customer's tariff. " +
             "Twelve months of bills replaces it."
      });
    } else {
      missing.push("Demand charges avoided — no tariff band supplied.");
    }

    /* 3 — The utility's own virtual power plant programme. */
    var vpp = +input.vppPerKwYear;
    if (isFinite(vpp) && vpp > 0) {
      streams.push({
        id: "vpp",
        name: "Virtual power plant",
        usd: kw * vpp,
        tier: input.vppRef ? "published" : "planning",
        how: Math.round(kw).toLocaleString() + " kW at $" + vpp + " / kW-year.",
        ref: input.vppRef || "A planning figure carried by this platform, not a " +
             "published tariff. ComEd's Rider VPP / BYODLR is still before the ICC, " +
             "so treat it as indicative until the tariff is final."
      });
    } else {
      missing.push("Virtual power plant — no programme rate on file.");
    }

    var total = 0, totalHi = 0, i;
    for (i = 0; i < streams.length; i++) {
      total += streams[i].usd;
      totalHi += (streams[i].usdHi != null ? streams[i].usdHi : streams[i].usd);
    }
    return { kw: kw, hours: hours, streams: streams, missing: missing,
             perYear: total, perYearHi: totalHi };
  };

  /* ── WHAT THE UTILITY CHARGES, BOTH WAYS ─────────────────────────────
     An interconnection has a one-off cost and a recurring one, and a pro
     forma that carries only the first is wrong every year after the first.
     Both are reported; neither is guessed. */
  V.utilityCost = function (input) {
    input = input || {};
    var kw = +input.kw;
    var capex = (typeof input.upgradeUsd === "number") ? input.upgradeUsd : null;
    var opexRate = +input.standbyPerKwMonth;
    var opex = (isFinite(opexRate) && isFinite(kw) && opexRate > 0)
                 ? kw * opexRate * 12 : null;
    return {
      capexUsd: capex,
      capexNote: capex == null
        ? "Not known until the interconnection study returns. It can exceed the "
          + "cost of the battery."
        : (input.upgradeCarried ? "An allowance, not a quote — the study has not returned."
                                : "From the interconnection study."),
      opexPerYear: opex,
      opexNote: opex == null
        ? "No standby or facilities charge on file. ComEd bills these against the "
          + "interconnected capacity and they run every year, so a pro forma "
          + "without one is optimistic by a fixed amount annually."
        : Math.round(kw).toLocaleString() + " kW at $" + opexRate + " / kW-month."
    };
  };

  /* ── INCENTIVES ──────────────────────────────────────────────────────
     Two shapes that behave differently: a tax credit is a fraction of what
     you spend, a rebate is a rate against what you install.

     THE COMED STORAGE REBATE IS GENUINELY PER kWh, and it is large enough
     that it looks like a typo. Their own DG Rebate Terms and Conditions:
     owners of a DG facility "are eligible for a rebate of $250 per
     kilowatt-hour ('kWh') or $300 per kWh of nameplate capacity for
     eligible energy storage facilities associated with a qualified DG
     facility". At 5,407 kWh that is $1.35M, which can exceed the whole
     project — this programme is designed to do that.

     So the rebate is applied as entered. What is carried with it are the
     two conditions that decide whether it arrives at all, because they are
     where this goes wrong in practice and neither is visible in the
     headline rate:

       the storage must be ASSOCIATED WITH A QUALIFIED DG FACILITY, and
       the customer must take supply under RATE BESH for the life of the
       storage facility.

     A flag still fires when the rebate exceeds the project, not to dispute
     the rate but to make sure somebody has confirmed those two before a
     number that large is put in front of a customer. */
  var COMED_REBATE = {
    perKwh: 250,
    ref: "ComEd Distributed Generation Rebate Terms and Conditions: a rebate of "
       + "$250 per kWh (or $300 per kWh for some classes) of nameplate capacity "
       + "for eligible energy storage facilities associated with a qualified DG "
       + "facility.",
    url: "https://www.comed.com/cdn/assets/v3/assets/blt3ebb3fed6084be2a/"
       + "blt2810b689df2e361f/67741700adc7815acf7dba44/"
       + "DGRebate_TermsConditions-2024-v2.pdf",
    conditions: "Two conditions decide whether this arrives: the storage must be "
       + "associated with a qualified DG facility, and the customer must take "
       + "supply under Rate BESH for the life of the storage facility."
  };
  V.COMED_REBATE = COMED_REBATE;
  V.incentives = function (input) {
    input = input || {};
    var capex = +input.capexUsd, kwh = +input.kwh;
    var out = [], flags = [];

    var itcRate = (typeof input.itcRate === "number") ? input.itcRate : null;
    if (itcRate && isFinite(capex)) {
      out.push({ id: "itc", name: "Federal investment tax credit",
                 usd: capex * itcRate, tier: "published",
                 how: Math.round(itcRate * 100) + "% of installed cost.",
                 /* The condition, short enough to survive onto a card. The
                    full rate is not automatic and a customer who reads only
                    the number will assume it is. */
                 short: Math.round(itcRate * 100) + "% \u00b7 needs prevailing wage",
                 ref: "Statutory. The full rate requires the prevailing-wage and "
                    + "apprenticeship conditions; without them the base rate applies." });
    }

    var reb = +input.rebatePerKwh;
    if (isFinite(reb) && reb > 0 && isFinite(kwh)) {
      var raw = reb * kwh;
      var cap = +input.rebateCapUsd;
      var applied = (isFinite(cap) && cap > 0) ? Math.min(raw, cap) : raw;
      if (isFinite(capex) && applied > capex * 0.6) {
        flags.push("The rebate comes to $" + Math.round(applied).toLocaleString() +
          " against a $" + Math.round(capex).toLocaleString() + " project. That is not " +
          "necessarily wrong — the ComEd programme is per kWh and is designed to run " +
          "this large — but confirm both conditions before a number this size goes to a " +
          "customer: the storage must be associated with a qualified DG facility, and " +
          "the customer must take supply under Rate BESH for the life of the facility.");
      }
      out.push({ id: "rebate", name: input.rebateName || "Utility rebate",
                 usd: applied, tier: "published",
                 how: "$" + reb + " / kWh on " + Math.round(kwh).toLocaleString() + " kWh" +
                      ((isFinite(cap) && cap > 0 && raw > cap)
                        ? ", capped at $" + Math.round(cap).toLocaleString() : ""),
                 short: "$" + reb + " / kWh \u00b7 needs paired DG + Rate BESH",
                 ref: input.rebateRef || COMED_REBATE.ref,
                 conditions: input.rebateConditions || COMED_REBATE.conditions,
                 url: input.rebateUrl || COMED_REBATE.url });
    }

    var tot = 0, i;
    for (i = 0; i < out.length; i++) tot += out[i].usd;
    return { items: out, total: tot, flags: flags };
  };

  root.OmegaValueStack = V;
  if (typeof module !== "undefined" && module.exports) module.exports = V;
})(typeof window !== "undefined" ? window : this);
