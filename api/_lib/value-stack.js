/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   Server-only value stack, incentive and utility-cost model.
   Browsers consume authenticated /api/price-site results. Never serve as a static asset. */
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
             "published tariff. ComEd's Rider SDVPP was approved by the ICC with " +
             "tariff sheets effective 16 July 2026 (service begins no later than " +
             "1 March 2027) and pays $10/kW-season, so treat any higher figure as " +
             "indicative until a contract stands behind it."
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

     THE ILLINOIS STORAGE REBATE IS GENUINELY PER kWh, and it is large
     enough that it looks like a typo. ComEd's own DG Rebate Terms and
     Conditions (2026 edition): owners of a qualified DG facility at a
     large C&I customer are eligible for $250 per kWh of nameplate storage
     capacity ($300 per kWh residential and small C&I). At 5,407 kWh that
     is $1.35M, which can exceed the whole project — the programme is
     designed to do that.

     So a rebate is applied as entered. What is carried with it are the
     conditions that decide whether it arrives at all, because they are
     where this goes wrong in practice and none is visible in the headline
     rate. THE 2026 T&C CHANGED THEM: the old "take supply under Rate BESH
     for the life of the facility" is gone; what stands now is the DG
     pairing and participation in ComEd's Scheduled Dispatch Virtual Power
     Plant programme (Rider SDVPP — approved by the ICC, tariff sheets
     effective 16 July 2026, service begins no later than 1 March 2027).
     This is exactly why the incentive book below carries an asOf on every
     row and the incentive scout re-verifies it against the primary
     documents (.claude/agents/incentive-scout.md).

     A flag still fires when a rebate exceeds 60% of the project, not to
     dispute the rate but to make sure somebody has confirmed the row's own
     conditions before a number that large goes in front of a customer. */
  var COMED_REBATE = {
    perKwh: 250,
    resPerKwh: 300,
    ref: "ComEd Distributed Generation Rebate Terms and Conditions (2026): $250 "
       + "per kWh of nameplate capacity for eligible energy storage facilities "
       + "associated with a qualified DG facility at a large C&I customer; $300 "
       + "per kWh residential and small C&I.",
    url: "https://www.comed.com/cdn/assets/v3/assets/blt3ebb3fed6084be2a/"
       + "blt2810b689df2e361f/6a19a2f492d70cb21c15fe39/"
       + "DG-Rebate-Terms-and-Conditions--2026.pdf",
    conditions: "What decides whether this arrives: the storage must be "
       + "associated with a qualified DG facility (the DG itself need not take "
       + "a rebate), and the customer must participate in ComEd's Scheduled "
       + "Dispatch Virtual Power Plant programme for the required term (Rider "
       + "SDVPP — approved by the ICC, tariff sheets effective 16 July 2026, a "
       + "five-year programme term, service begins no later than 1 March 2027). "
       + "For interconnection agreements signed after 1 June 2026, state law is "
       + "reported to cap the rebate at 5 kWh per kW of participating power "
       + "and 25,000 kWh in total (projects whose interconnection application "
       + "was filed and paid before that date are reported to keep a 150,000 "
       + "kWh ceiling) — confirm against the current tariff."
  };
  V.COMED_REBATE = COMED_REBATE;

  /* ── THE ONE-TIME INCENTIVE BOOK, utility and market specific ────────
     One row per standing programme, selected by WHERE THE SITE IS (the
     locate() answer: state, the ComEd and NYC flags) and the segment.
     Every row carries the primary source, an asOf, and the conditions
     that decide whether the money arrives. A territory with no row gets
     the ITC alone and the response says so — an empty answer is a true
     answer; an invented rebate is not.

     Verified against the primary documents 2026-10-06; the incentive
     scout (.claude/agents/incentive-scout.md) re-verifies daily. */
  V.INCENTIVE_BOOK = [
    {
      id: "comed.dg.storage", utility: "ComEd", name: "ComEd storage rebate (DG Rebate)",
      state: "IL", comed: true,
      perKwh: COMED_REBATE.perKwh, resPerKwh: COMED_REBATE.resPerKwh,
      tier: "published", asOf: "2026 Terms and Conditions; Rider SDVPP tariff effective 2026-07-16; read 2026-10-06",
      ref: COMED_REBATE.ref, url: COMED_REBATE.url, conditions: COMED_REBATE.conditions
    },
    {
      id: "ameren.cgr.storage", utility: "Ameren Illinois", name: "Ameren Illinois storage rebate (Rider CGR)",
      state: "IL", comed: false,
      perKwh: 250, resPerKwh: 300,
      tier: "published", asOf: "Ameren Rider CGR tariff (effective 2025-04-21) and Rider SD VPP (effective 2026-07-16); read 2026-10-06",
      ref: "Illinois' DG rebate on Ameren Illinois' own tariff (Rider CGR — Customer "
         + "Generation & Storage Rebate, Ill. C.C. No. 1, 2nd Revised Sheet No. 59.003, "
         + "effective 21 April 2025): an additional $250 per kWh of nameplate storage "
         + "capacity for competitively-declared (large C&I) customers, $300 per kWh "
         + "residential and small C&I.",
      url: "https://www.ameren.com/-/media/rates/files/illinois/aiel59rdcgr.ashx",
      conditions: "The same Illinois rebate as ComEd's, on Ameren's tariff: DG-paired "
         + "storage, and a storage rebate received on or after 1 June 2026 requires "
         + "taking service under Ameren's Rider SD VPP once operational, no later than "
         + "1 March 2027 ($10 per kW of performance per programme year). The ZIP places "
         + "this site outside ComEd, so Ameren Illinois is assumed — municipal utilities "
         + "and co-ops are not covered; confirm the serving utility."
    },
    {
      id: "ca.sgip.storage", utility: "PG&E / SCE / SoCalGas / SDG&E (SGIP)", name: "California SGIP, large-scale storage",
      state: "CA", nonresidential: true,
      perKwh: 250, perKwhItc: 180,
      tier: "published", asOf: "Step 5, statewide, dashboard data of 2026-10-05; read 2026-10-06",
      ref: "CPUC Self-Generation Incentive Program, large-scale storage (over 10 kW), "
         + "Step 5: $0.25/Wh, or $0.18/Wh for projects claiming the federal ITC. The "
         + "open step's rate on selfgenca.com replaces this.",
      url: "https://www.selfgenca.com/home/program_metrics/",
      conditions: "Paid through the IOU programme administrators (PG&E, SCE, SoCalGas "
         + "and SDG&E territories — confirm the serving utility); each step's budget "
         + "subscribes and the next pays less. Step 5 funds left as of 2026-10-05: "
         + "roughly $12M at PG&E but only about $2M each at SCE, SoCalGas and SDG&E, "
         + "so a single large project can exhaust a territory. This screening assumes "
         + "the ITC is claimed, so the ITC-adjusted rate is used. A resiliency adder "
         + "of $0.15/Wh exists for critical facilities. Residential budgets differ "
         + "and are not priced here."
    },
    {
      id: "ny.nyserda.retail", utility: "NYSERDA", name: "NYSERDA Retail Energy Storage Incentive",
      state: "NY", nonresidential: true,
      perKwh: 175, perKwhNyc: 75, maxKwh: 20000,
      tier: "published", asOf: "open blocks on NYSERDA's dashboard, read 2026-10-06",
      ref: "NYSERDA Retail Energy Storage Incentive (MWh-block design under the "
         + "2024–2030 implementation plan): the open blocks pay $175 per kWh upstate "
         + "(Block 5) and $75 per kWh in New York City (Block 10, opened 23 April "
         + "2026), on systems up to 20,000 kWh. The region's open block on NYSERDA's "
         + "dashboard replaces this.",
      url: "https://www.nyserda.ny.gov/All-Programs/Energy-Storage-Program/Commercial-Energy-Storage",
      conditions: "A declining block per region: the open block's rate decides, and a "
         + "fully subscribed region pays less or nothing until new funds are allocated. "
         + "New York City's blocks burned from $125 to $75 inside sixteen months, so "
         + "confirm the open block before quoting. Westchester has its OWN open block "
         + "at $125 per kWh — this screening prices Westchester at the upstate figure, "
         + "so check the dashboard. A Retail Inclusive block of $350 per kWh for "
         + "critical facilities in disadvantaged communities opened 13 April 2026."
    },
    {
      id: "md.rces.grant", utility: "Maryland Energy Administration", name: "Maryland RCES storage grant",
      state: "MD", nonresidential: true,
      pctOfCost: 0.30, capUsd: 150000,
      tier: "planning", asOf: "FY2027 round open (FOA issued 2026-09-24); read 2026-10-06",
      ref: "Maryland Energy Administration Residential and Commercial Energy Storage "
         + "(RCES) grant: 30% of total installed cost, up to $150,000 for a commercial "
         + "system (FY27 figures as relayed from the FOA — confirm in the FOA itself "
         + "on the MyMEA portal). It replaced the storage income tax credit, inactive "
         + "since the end of 2024.",
      url: "https://energy.maryland.gov/Pages/Energy-Storage-Grant-Program.aspx",
      conditions: "First-come grants from a small annual budget. The FY27 round is "
         + "OPEN: up to $4M anticipated, 0% reserved as of 6 October 2026, applications "
         + "due 31 May 2027 or until funds exhaust, and FY27 prioritises systems "
         + "enrolling in utility VPP pilots. Held at planning-grade because the FY27 "
         + "rates are relayed from the portal-gated FOA, not read from it — the FY26 "
         + "round (also 30% / $150k) closed 5 June 2026 once funds ran out."
    }
  ];

  /* The book rows that apply to THIS site, resolved to concrete figures.
     loc is vpp-sim's locate() answer ({ state, comed, nyc, ... });
     opts.itcClaimed picks the ITC-adjusted rate where a programme pays
     differently when the credit is taken (SGIP does). */
  V.rebatesFor = function (loc, segment, opts) {
    loc = loc || {};
    opts = opts || {};
    var residential = segment === "residential";
    var out = [], i;
    for (i = 0; i < V.INCENTIVE_BOOK.length; i++) {
      var b = V.INCENTIVE_BOOK[i];
      if (b.state && b.state !== loc.state) continue;
      if (b.comed === true && !loc.comed) continue;
      if (b.comed === false && loc.comed) continue;
      if (b.nonresidential && residential) continue;
      var perKwh = b.perKwh;
      if (residential && isFinite(+b.resPerKwh)) perKwh = b.resPerKwh;
      if (opts.itcClaimed && isFinite(+b.perKwhItc)) perKwh = b.perKwhItc;
      if (loc.nyc && isFinite(+b.perKwhNyc)) perKwh = b.perKwhNyc;
      out.push({
        id: b.id, name: b.name, utility: b.utility,
        perKwh: perKwh, pctOfCost: b.pctOfCost, capUsd: b.capUsd, maxKwh: b.maxKwh,
        tier: b.tier, asOf: b.asOf, ref: b.ref, url: b.url, conditions: b.conditions
      });
    }
    return out;
  };

  function rebateFlag(row, applied, capex) {
    return "The " + (row.name || "rebate") + " comes to $" + Math.round(applied).toLocaleString() +
      " against a $" + Math.round(capex).toLocaleString() + " project. That is not " +
      "necessarily wrong — a per-kWh programme is designed to run this large — but " +
      "confirm the conditions before a number this size goes to a customer: " +
      (row.conditions || "the programme's own terms decide.");
  }

  /* incentives({ capexUsd, kwh, itcRate, rebates: [rows] }) — or the
     legacy single-rebate fields (rebatePerKwh, rebateName, rebateCapUsd,
     rebateRef, rebateConditions, rebateUrl), which api/price-site.js still
     sends; both run through the ONE arithmetic below. */
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
                 short: Math.round(itcRate * 100) + "% · needs prevailing wage",
                 ref: "Statutory. The full rate requires the prevailing-wage and "
                    + "apprenticeship conditions; without them the base rate applies." });
    }

    var rebates = Array.isArray(input.rebates) ? input.rebates.slice() : [];
    var reb = +input.rebatePerKwh;
    if (isFinite(reb) && reb > 0) {
      rebates.push({ id: "rebate", name: input.rebateName || "Utility rebate",
                     perKwh: reb, capUsd: input.rebateCapUsd,
                     tier: "published",
                     ref: input.rebateRef || COMED_REBATE.ref,
                     conditions: input.rebateConditions || COMED_REBATE.conditions,
                     url: input.rebateUrl || COMED_REBATE.url });
    }

    var i;
    for (i = 0; i < rebates.length; i++) {
      var row = rebates[i];
      var usd = null, how = "";
      var cap = +row.capUsd;
      if (isFinite(+row.perKwh) && +row.perKwh > 0 && isFinite(kwh)) {
        var maxKwh = +row.maxKwh;
        var paidKwh = (isFinite(maxKwh) && maxKwh > 0) ? Math.min(kwh, maxKwh) : kwh;
        var raw = +row.perKwh * paidKwh;
        usd = (isFinite(cap) && cap > 0) ? Math.min(raw, cap) : raw;
        how = "$" + row.perKwh + " / kWh on " + Math.round(paidKwh).toLocaleString() + " kWh" +
              (paidKwh < kwh ? " (the programme pays at most " + Math.round(maxKwh).toLocaleString() + " kWh)" : "") +
              (usd < raw ? ", capped at $" + Math.round(cap).toLocaleString() : "");
      } else if (isFinite(+row.pctOfCost) && +row.pctOfCost > 0 && isFinite(capex)) {
        var rawP = capex * +row.pctOfCost;
        usd = (isFinite(cap) && cap > 0) ? Math.min(rawP, cap) : rawP;
        how = Math.round(+row.pctOfCost * 100) + "% of installed cost" +
              (usd < rawP ? ", capped at $" + Math.round(cap).toLocaleString() : "");
      }
      if (usd == null || !(usd > 0)) continue;
      if (isFinite(capex) && usd > capex * 0.6) flags.push(rebateFlag(row, usd, capex));
      out.push({ id: row.id || "rebate", name: row.name || "Utility rebate",
                 usd: usd, tier: row.tier || "published", how: how,
                 short: row.short || null, utility: row.utility || null,
                 asOf: row.asOf || null,
                 ref: row.ref, conditions: row.conditions, url: row.url || null });
    }

    var tot = 0;
    for (i = 0; i < out.length; i++) tot += out[i].usd;
    return { items: out, total: tot, flags: flags };
  };

  /* ── THE LIFECYCLE ───────────────────────────────────────────────────
     Twenty years of the stack against the cost of the project, so the
     editor can put an IRR beside the year-1 number instead of leaving the
     reader to divide two figures and call it a return.

     The IRR and payback come from THE finance engine
     (api/_lib/proforma-engine.js irr/payback — bracketed bisection, the
     multiple-root guard, the no-payback guard), never a local root finder:
     two IRR functions that disagree by a tenth of a point cost more trust
     than either earns. This file only builds the cash flows.

     PLANNING GRADE, and honest about which grade: an UNLEVERED, PRE-TAX
     project IRR on the owner's share of the stack, incentives taken at
     year 0. Tax, depreciation, debt and reserves are the Pro Forma's job
     (api/proforma.js on the same engine); this is the screening number
     that says whether that work is worth commissioning.

     Degradation follows what each stream is paid on: an energy stream
     (TOU arbitrage) fades with usable kWh, a power stream (demand,
     capacity programmes) with deliverable kW. Year 1 already carries a
     year of fade — indexing from year 1 would gift the model a free year
     of a brand-new battery. One augmentation back to nameplate is bought
     when usable energy falls below the threshold, because a 20-year model
     on a battery that fades out in year 12 is a 12-year model wearing a
     20-year label. */
  var PF = null;
  try {
    if (typeof module !== "undefined" && module.exports && typeof require === "function") {
      PF = require("./proforma-engine");
    }
  } catch (e) {}

  V.LIFECYCLE_DEFAULTS = {
    years: 20,
    omPctOfCapex: 0.025,
    omRef: "Fixed O&M at 2.5% of installed cost a year, the NREL ATB convention "
         + "for battery storage. An O&M contract replaces it.",
    omEscalation: 0.025,
    billEscalation: 0.02,
    billEscalationRef: "Bill-side streams (demand, TOU) ride the tariff, escalated "
         + "2%/yr; programme and market streams are held FLAT, because a cleared "
         + "price has no claim on next year's auction.",
    energyFadePct: 0.018,
    powerFadePct: 0.005,
    fadeRef: "Planning degradation: usable energy -1.8%/yr, deliverable power "
         + "-0.5%/yr. The manufacturer's warranted curve replaces both.",
    augmentAtPct: 0.70,
    augmentCostPerKwh: 200,
    augmentRef: "One augmentation back to nameplate when usable energy falls below "
         + "70%, at $200/kWh — a planning figure for future module cost.",
    discountRate: 0.08
  };

  function lcNum(v, dflt, lo, hi) {
    var n = +v;
    if (!isFinite(n)) return dflt;
    if (n < lo) return lo;
    if (n > hi) return hi;
    return n;
  }

  /* input: {
       capexUsd           required, > 0
       incentiveUsd       taken at year 0 (ITC + rebates); capped at capex
       streams            [{ id, name, usd, basis:'energy'|'power'|'fixed',
                             escalates: bool }] — year-1 OWNER dollars
       kwh                for sizing the augmentation
       years, omPctOfCapex | omUsdYear, omEscalation, billEscalation,
       energyFadePct, powerFadePct, augmentAtPct (0 disables),
       augmentCostPerKwh, discountRate
     } */
  V.lifecycle = function (input) {
    input = input || {};
    var capex = +input.capexUsd;
    if (!isFinite(capex) || capex <= 0) {
      return { ok: false, error: "No project cost, no IRR. Run the cost estimate " +
               "(or enter a contracted price) first — a return computed against a " +
               "guessed cost is a guess wearing a percent sign." };
    }
    var raw = Array.isArray(input.streams) ? input.streams : [];
    var streams = [], i;
    for (i = 0; i < raw.length; i++) {
      var s = raw[i];
      if (s && isFinite(+s.usd) && +s.usd > 0) {
        streams.push({ id: String(s.id || "stream" + i), name: String(s.name || s.id || "stream"),
                       usd: +s.usd, basis: s.basis === "energy" ? "energy" : (s.basis === "fixed" ? "fixed" : "power"),
                       escalates: s.escalates === true });
      }
    }
    if (!streams.length) {
      return { ok: false, error: "No revenue streams carry a dollar figure, so there " +
               "is no cash flow to discount." };
    }
    if (!PF) return { ok: false, error: "The finance engine is not available here." };

    var D = V.LIFECYCLE_DEFAULTS;
    var years = Math.round(lcNum(input.years, D.years, 5, 30));
    var omEsc = lcNum(input.omEscalation, D.omEscalation, 0, 0.1);
    var billEsc = lcNum(input.billEscalation, D.billEscalation, 0, 0.1);
    var eFadeR = lcNum(input.energyFadePct, D.energyFadePct, 0, 0.1);
    var pFadeR = lcNum(input.powerFadePct, D.powerFadePct, 0, 0.1);
    var augAt = lcNum(input.augmentAtPct, D.augmentAtPct, 0, 0.95);
    var augCost = lcNum(input.augmentCostPerKwh, D.augmentCostPerKwh, 0, 1000);
    var disc = lcNum(input.discountRate, D.discountRate, 0, 0.25);
    var kwh = isFinite(+input.kwh) && +input.kwh > 0 ? +input.kwh : null;

    var om1;
    if (isFinite(+input.omUsdYear) && +input.omUsdYear >= 0) om1 = +input.omUsdYear;
    else om1 = capex * lcNum(input.omPctOfCapex, D.omPctOfCapex, 0, 0.1);

    var inc = isFinite(+input.incentiveUsd) && +input.incentiveUsd > 0 ? +input.incentiveUsd : 0;
    var incCapped = false;
    if (inc > capex) { inc = capex; incCapped = true; }
    var net = capex - inc;

    var flows = [-net];
    var rows = [{ year: 0, capacityPct: 1, revenue: 0, om: 0, augment: 0,
                  net: -net, cum: -net }];
    var augmented = 0, augYear = 0, cum = -net, y;
    for (y = 1; y <= years; y++) {
      /* Energy fade restarts at the augmentation (new modules); power fade
         does not (the inverters are not replaced). */
      var eFade = Math.pow(1 - eFadeR, y - augYear);
      var pFade = Math.pow(1 - pFadeR, y);
      var aug = 0;
      /* never in the final year: modules bought with no years left to earn
         them back only exist to make year N look bad */
      if (augAt > 0 && kwh && eFade < augAt && augmented < 1 && y < years) {
        aug = kwh * (1 - eFade) * augCost;
        augmented++;
        augYear = y;
        eFade = 1;
      }
      var esc = Math.pow(1 + billEsc, y - 1);
      var rev = 0;
      for (i = 0; i < streams.length; i++) {
        var st = streams[i];
        var fade = st.basis === "energy" ? eFade : (st.basis === "power" ? pFade : 1);
        rev += st.usd * fade * (st.escalates ? esc : 1);
      }
      var om = om1 * Math.pow(1 + omEsc, y - 1);
      var cash = rev - om - aug;
      flows.push(cash);
      cum += cash;
      rows.push({ year: y, capacityPct: eFade, revenue: rev, om: om,
                  augment: aug, net: cash, cum: cum });
    }

    var npv = 0;
    for (y = 0; y < flows.length; y++) npv += flows[y] / Math.pow(1 + disc, y);

    var assumptions = [
      "An unlevered, pre-tax project IRR on the owner's share of the stack over " +
        years + " years, incentives taken at year 0. Tax, depreciation, debt and " +
        "reserves are the Pro Forma's job; this is the screening number.",
      D.fadeRef, D.billEscalationRef,
      "O&M $" + Math.round(om1).toLocaleString() + " in year 1 (" + D.omRef + "), " +
        "escalated " + (omEsc * 100).toFixed(1) + "%/yr.",
      augAt > 0 && kwh ? D.augmentRef
        : "No augmentation is modelled" + (kwh ? " (disabled)" : " — the battery's kWh was not given") +
          ", so late years ride the faded battery.",
      "NPV discounted at " + (disc * 100).toFixed(1) + "%."
    ];
    if (incCapped) assumptions.push("Incentives were capped at the project cost; " +
      "the uncapped figure exceeded it.");

    return {
      ok: true,
      years: years,
      capexUsd: capex, incentiveUsd: inc, netCostUsd: net,
      rows: rows,
      irr: PF.irr(flows),
      npv: npv, discountRate: disc,
      paybackYears: PF.payback(flows),
      augmentations: augmented,
      omYear1Usd: om1,
      assumptions: assumptions
    };
  };

  /* ── BANKABILITY ─────────────────────────────────────────────────────
     The investor's cut of the same streams. A saving is not revenue: a
     bill-side stream becomes the PROJECT's income only under a contract
     with the host (an energy services / shared-savings agreement), and
     what an investor then underwrites is the host's credit. A programme
     stream has a real counterparty — a utility, an ISO through an
     aggregator — and a reset cadence an underwriter must know. Those
     facts ride each programme row in vpp-sim.js (`bank`); this function
     only arranges them and refuses to blur the one distinction that
     matters: a PLANNING rate is not underwriteable until the programme's
     own terms replace it, however plausible the number.

     streams: vpp-sim's stream rows. split: the revenue share (owner
     fraction applied to programme earnings, as the totals already do). */
  V.bankability = function (streams, split) {
    streams = Array.isArray(streams) ? streams : [];
    var keep = (split && isFinite(+split.owner)) ? +split.owner : 1;
    var rows = [], hostYr = 0, programYr = 0, underYr = 0, i;
    for (i = 0; i < streams.length; i++) {
      var s = streams[i];
      if (!s || !s.counted || !(s.usd > 0)) continue;
      var row;
      if (s.category === "bill") {
        hostYr += s.usd;
        row = {
          id: s.id, name: s.name, usdYr: s.usd, tier: s.tier, grade: "host-contract",
          paidBy: "the host customer",
          vehicle: "an energy services / shared-savings agreement — without one, " +
                   "these are the host's own savings, not the project's revenue",
          tenor: "the ESA term you sign; 10–15 years is customary"
        };
      } else {
        var own = s.usd * keep;
        programYr += own;
        var b = s.bank || {};
        row = {
          id: s.id, name: s.name, usdYr: own, grossYr: s.usd, tier: s.tier, grade: "program",
          paidBy: b.paidBy || "the programme",
          vehicle: b.vehicle || "programme enrolment",
          tenor: b.tenor || "programme year"
        };
      }
      if (s.tier === "planning") {
        row.note = "a planning rate — not underwriteable until the programme's " +
                   "own terms replace it";
      } else {
        underYr += row.usdYr;
      }
      rows.push(row);
    }
    var totalYr = hostYr + programYr;
    return {
      rows: rows,
      totals: {
        hostYr: hostYr, programYr: programYr, totalYr: totalYr,
        underwriteableYr: underYr, planningYr: totalYr - underYr
      },
      /* The paperwork that turns the stack into something a lender reads. */
      contracts: [
        "Energy services / shared-savings agreement with the host — the contract " +
          "that converts demand and TOU savings into the project's contracted revenue; " +
          "the counterparty an investor underwrites is the host's credit and tenancy.",
        "Aggregator / curtailment-service-provider agreement — the route to capacity " +
          "and programme revenue; it fixes the revenue share and can floor a multi-year rate.",
        "Programme enrolments held in, or assignable to, the project entity — a payment " +
          "to the host's account is not the SPV's revenue.",
        "The one-time incentives sit in the capital stack, not the revenue stack: the ITC " +
          "is transferable for cash under §6418, and a utility rebate pays once at " +
          "commissioning against its own conditions."
      ]
    };
  };

  root.OmegaValueStack = V;
  if (typeof module !== "undefined" && module.exports) module.exports = V;
})(typeof window !== "undefined" ? window : this);
