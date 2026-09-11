/* ==========================================================================
   omega-cost-model.js  ·  ClearSky-OMEGA shared platform file
   --------------------------------------------------------------------------
   THE cost model. One copy, read by the browser tool and by /api/.

   It exists because the alternative had already bitten this codebase twice in
   one day. A modular data centre was carried at 1 MW in one table and 1.77 MW
   in another, and every pod count, conductor and acreage figure came off
   whichever table the code path happened to read. A pedestal was $1,250 in one
   place and $450 in another. Two copies of a number are not a fallback; they
   are a coin toss nobody knows they are running.

   So when the site finder wants a price without opening the estimator, it must
   not get a second implementation of these tables. It calls /api/price-site,
   which requires this file — the same file clearsky-cost-estimator.html loads
   in the browser. Correct one rate here and both move together.

   ES5 and dependency-free on purpose: no build step (see CLAUDE.md), and it
   has to run unchanged in a Vercel function and in an embedded browser.

   Every figure below was lifted verbatim out of the estimator, not retyped.
   ========================================================================== */
(function (root) {
  "use strict";

  var M = {};

  var MODEL = [
   { id:"eq", name:"Equipment & storage hardware", lines:[
     { id:"eq.dc",  n:"Battery enclosures — LFP racks, BMS, thermal, internal suppression",
       basis:"kwh", rate:115, lab:0.00 },
     { id:"eq.pcs", n:"Power conversion system (PCS) and DC collection",
       basis:"kw",  rate:58,  lab:0.00 },
     { id:"eq.xfmr",n:"Step-up transformer",
       basis:"kw",  rate:42,  lab:0.00, vs:"xfmr" },
     { id:"eq.swg", n:"AC switchgear, protective relaying, revenue metering",
       basis:"kw",  rate:38,  lab:0.10, vs:"swg" },
     { id:"eq.ems", n:"EMS, site controller, SCADA, communications and cyber",
       basis:"kw",  rate:17,  lab:0.15 },
     { id:"eq.bop", n:"Auxiliary power, station service, DC/AC balance of plant",
       basis:"kw",  rate:15,  lab:0.20 }
   ]},
  
   { id:"cv", name:"Civil & site works", lines:[
     { id:"cv.grd", n:"Clearing, grubbing, grading, drainage and erosion control",
       basis:"pad", rate:9.2,  lab:0.75, soil:true },
     { id:"cv.fnd", n:"Reinforced concrete equipment foundations and pads",
       basis:"pad", rate:11.7, lab:0.70, soil:true },
     { id:"cv.acc", n:"Access drive, fire lane, bollards and gravel apron",
       basis:"semi",rate:11000,lab:0.70 },
     { id:"cv.fen", n:"Perimeter fence, gates, signage and site lighting",
       basis:"semi",rate:9000, lab:0.60 },
     { id:"cv.swm", n:"Stormwater controls, containment and surface restoration",
       basis:"semi",rate:5000, lab:0.60, soil:true }
   ]},
  
   { id:"el", name:"Electrical installation & interconnection works", lines:[
     { id:"el.trn", n:"Trenching, duct bank, backfill and surface restoration",
       basis:"ft",  rate:58,  lab:0.85 },
     { id:"el.cbl", n:"Power cable, conduit, cable tray and termination kits",
       basis:"ft",  rate:88,  lab:0.40, vs:"cbl" },
     { id:"el.gnd", n:"Grounding grid, lightning and surge protection",
       basis:"semi",rate:8500, lab:0.60 },
     { id:"el.rig", n:"Rigging, crane, offload and equipment setting",
       basis:"semi",rate:34000,lab:0.80 },
     { id:"el.wir", n:"Field wiring, terminations, torque and continuity testing",
       basis:"semi",rate:31000,lab:0.90 }
   ]},
  
   { id:"en", name:"Engineering & design", lines:[
     { id:"en.bod", n:"Basis of design, one-line, sizing and protection study",
       basis:"semi",rate:11000,lab:0.00 },
     { id:"en.dwg", n:"Stamped electrical design and construction drawings",
       basis:"semi",rate:19000,lab:0.00, vs:"eng" },
     { id:"en.civ", n:"Civil/structural design, geotechnical and boundary survey",
       basis:"semi",rate:15000,lab:0.30, soil:true },
     { id:"en.icx", n:"Interconnection application engineering and study support",
       basis:"semi",rate:9000, lab:0.00, vs:"eng" },
     { id:"en.fir", n:"NFPA 855 hazard mitigation analysis and UL 9540A review",
       basis:"semi",rate:6000, lab:0.00 }
   ]},
  
   { id:"pm", name:"Permitting, fees & site control", lines:[
     { id:"pm.bld", n:"Building, electrical and fire permits, plan review",
       basis:"semi",rate:10000,lab:0.00, ahj:true },
     { id:"pm.zon", n:"Zoning, special use or variance proceedings",
       basis:"semi",rate:7000, lab:0.00, ahj:true },
     { id:"pm.utl", n:"Utility interconnection application fees and study deposits",
       basis:"semi",rate:11000,lab:0.00, vs:"fee" },
     { id:"pm.env", n:"Environmental, stormwater and NPDES filings",
       basis:"semi",rate:3000, lab:0.00, ahj:true },
     { id:"pm.leg", n:"Legal, site control, easements and recording",
       basis:"semi",rate:4000, lab:0.00 }
   ]},
  
   { id:"cm", name:"Commissioning, testing & energisation", lines:[
     { id:"cm.fat", n:"Factory and site acceptance testing",
       basis:"semi",rate:9000, lab:0.50 },
     { id:"cm.wit", n:"Utility witness test, relay settings and permission to operate",
       basis:"semi",rate:7000, lab:0.40, vs:"fee" },
     { id:"cm.tel", n:"Telemetry, market registration and performance baseline",
       basis:"semi",rate:4000, lab:0.20 },
     { id:"cm.trn", n:"Operator training, as-builts and O&M manuals",
       basis:"semi",rate:3000, lab:0.20 }
   ]}
  ];

  var SPREAD = { eq:0.04, cv:0.18, el:0.15, en:0.12, pm:0.20, cm:0.10 };

  var MARKUP = [
    { id:"mk.cm",  n:"Construction management and site supervision", lo:0.030, base:0.030, hi:0.030 },
    { id:"mk.ohp", n:"EPC overhead and profit",                      lo:0.065, base:0.065, hi:0.065 },
    { id:"mk.ins", n:"Insurance, bonds and builder's risk",          lo:0.015, base:0.015, hi:0.015 },
    { id:"mk.ctg", n:"Contingency",                                  lo:0.060, base:0.080, hi:0.100 },
    { id:"mk.dev", n:"Developer fee",                                lo:0.030, base:0.030, hi:0.030 }
  ];

  var VOLT = {
    "480":  { label:"480 V secondary (behind the meter)",
              m:{ xfmr:0.00, swg:0.65, cbl:0.55, eng:0.75, fee:0.70 } },
    "4160": { label:"4.16 kV",
              m:{ xfmr:0.80, swg:0.88, cbl:0.85, eng:0.92, fee:0.88 } },
    "12470":{ label:"12 kV primary",
              m:{ xfmr:1.00, swg:1.00, cbl:1.00, eng:1.00, fee:1.00 } },
    "34500":{ label:"34.5 kV primary",
              m:{ xfmr:1.35, swg:1.30, cbl:1.25, eng:1.30, fee:1.35 } },
    "":     { label:"Not answered — priced as 12 kV",
              m:{ xfmr:1.00, swg:1.00, cbl:1.00, eng:1.00, fee:1.00 } }
  };

  var SOIL = { good:0.85, "":1.00, poor:1.40, rock:1.55 };

  var SOIL_LBL = { good:"Firm, drains, no import fill", "":"Not answered — priced as typical",
                   poor:"Soft, fill, or high water table", rock:"Rock or deep foundations" };

  var AHJ  = { fast:0.75, "":1.00, hard:1.45 };

  var AHJ_LBL = { fast:"Streamlined — over-the-counter permit", "":"Not answered — priced as typical",
                  hard:"Difficult — hearings, long review" };

  var LABOR = { open:1.00, "":1.00, pw:1.22, pla:1.30 };

  var LABOR_LBL = { open:"Open shop", "":"Not answered — priced as open shop",
                    pw:"Prevailing wage", pla:"Union / project labour agreement" };

  var UPGRADE = {
    none: { label:"None required — study complete", cost:0, wk:0 },
    "":   { label:"Unknown — study not returned",   cost:0, wk:0, exposure:[185000, 650000] },
    xfmr: { label:"Utility transformer replacement", cost:185000, wk:22 },
    swg:  { label:"Transformer plus switchgear or protection", cost:340000, wk:30 },
    line: { label:"Line reconductor or substation work", cost:650000, wk:44 }
  };

  var NAMES = ["MODEL", "SPREAD", "MARKUP", "VOLT", "SOIL", "SOIL_LBL", "AHJ", "AHJ_LBL", "LABOR", "LABOR_LBL", "UPGRADE"];

  /* Explicit, not eval(): a Content-Security-Policy that forbids eval is a
     reasonable policy for a page that renders customer money. */
  /* ══════════════════════════════════════════════════════════════════════
     WHERE EVERY NUMBER CAME FROM

     A lender's independent engineer does not ask what the total is. They ask
     where each number came from, and an estimate that cannot answer that is
     not bankable no matter how carefully it was built.

     Until now this file could not answer it at all: thirty-two rates, not one
     of them carrying a citation. They are honest planning rates — but nothing
     in the tool SAID they were planning rates, and a defensible-looking table
     of undefended numbers is worse than an obviously rough one, because it
     invites a reader to trust it.

     So every rate now declares its tier, and the default is the weakest one.
     A line that names no source IS a planning rate; it cannot quietly pass
     for something better by omission, and a rate added next year inherits the
     honest default rather than the flattering one.

     The tiers are ordered by what an IE will accept:

       actual     a booked cost from a job this company completed. The only
                  tier that is evidence rather than an opinion about the
                  future. Needs the project it came off.
       quote      a written price from a supplier or an EPC, with a document
                  reference and a date. Bankable for the scope it covers, and
                  for exactly as long as the quote is good for.
       published  a citable figure that is NOT a committed price for this
                  site: a named report, table and edition, or a supplier's
                  budgetary/ROM or list price. Defensible as a market
                  reference, never as the price this project will pay. The
                  axis that separates this tier from `quote` is committed
                  versus indicative, which is the distinction a lender cares
                  about — an expired quote lands here too, because a price
                  nobody is still bound by is a reference, not an offer.
       planning   an internal figure carrying nobody's signature. Fine for a
                  screen. It is not evidence, and this tool must never let it
                  be mistaken for evidence.

     Coverage is measured in DOLLARS, not in lines. Sourcing twenty small
     civil lines and leaving the battery on a planning rate is not 80%
     backed — it is the one number that matters left unbacked, and a
     line-count percentage would hide precisely that.
     ══════════════════════════════════════════════════════════════════════ */
  var TIERS = {
    actual:    { rank:4, label:"Booked project actual",  short:"actual"    },
    quote:     { rank:3, label:"Written quote",          short:"quote"     },
    published: { rank:2, label:"Published benchmark",    short:"published" },
    planning:  { rank:1, label:"Internal planning rate", short:"planning"  }
  };
  /* A quote or an actual is evidence about a real transaction. A published
     benchmark is a market reference and a planning rate is an opinion, and
     an IE treats those two groups differently — so the tool does too. */
  function tierIsEvidence(t){ return t === "actual" || t === "quote"; }

  /* THE HONEST DEFAULT, applied once at load. Nothing here changes a rate;
     it only stops a rate from implying a provenance it does not have. */
  (function stampDefaults(){
    var d, i, L;
    for (d = 0; d < MODEL.length; d++) {
      for (i = 0; i < MODEL[d].lines.length; i++) {
        L = MODEL[d].lines[i];
        if (!L.src) L.src = "planning";
        if (!L.ref) L.ref = "";
        if (!L.asOf) L.asOf = "";
      }
    }
  })();

  /* ── AN ORG'S OWN NUMBERS REPLACE ANY LINE ─────────────────────────────
     input.rates is a map of line id -> { rate, src, ref, asOf, name }. It is
     how a company makes this model theirs: the battery off a supplier quote,
     the trenching off what the last three jobs actually cost, the switchgear
     off a distributor's written price. Each override carries its own
     provenance, so replacing a rate RAISES the audited coverage instead of
     quietly changing the answer.

     Anything the override does not state stays as the model had it, and an
     override with no tier is treated as a quote only if it names a
     reference — otherwise it is somebody typing a number, which is a
     planning rate no matter who typed it. */
  function rateFor(L, input) {
    var over = input && input.rates ? input.rates[L.id] : null;
    if (!over || typeof over.rate !== "number" || !(over.rate > 0)) {
      return { rate:L.rate, src:L.src || "planning", ref:L.ref || "",
               asOf:L.asOf || "", from:"" };
    }
    var tier = over.src && TIERS[over.src] ? over.src
             : (over.ref ? "quote" : "planning");
    return { rate:over.rate, src:tier, ref:over.ref || "",
             asOf:over.asOf || "", from:over.name || "",
             supplier: over.supplier || over.name || "",
             /* The unit the supplier actually SELLS, when the quote names
                one. See the granularity note in the pricing loop. */
             blockKwh: (typeof over.blockKwh === "number" && over.blockKwh > 0)
                         ? over.blockKwh : null,
             /* Whether the price is at the supplier's gate. Freight is then
                a real cost that is NOT in this rate. */
             atGate: !!over.atGate, gateTerm: over.gateTerm || "" };
  }

  /* ── YOU CANNOT BUY A THIRD OF A CONTAINER ────────────────────────────
     Quotes for battery hardware are written per kWh against a PRODUCT, and
     the product is a block of a fixed size — Gotion quote a 5 MWh DC block.
     Price a 1.77 MWh site at the per-kWh rate and the arithmetic is clean
     and the commercial reality is not: you buy blocks.

     The tool does NOT silently bill whole blocks. The quote this was built
     against was itself issued for a 12.5 MWh demand, which is two and a half
     blocks, so per-kWh is a defensible reading of that document and picking
     the other one for the customer would be substituting our assumption for
     their supplier's terms.

     What it does instead is what this file already does with an unknown
     utility upgrade: report the difference as an EXPOSURE, separately, with
     the stranded capacity named. Burying it in the total is how a budget
     becomes a surprise; hiding it entirely is how a small site gets quoted
     at a third of what it will cost to buy. */
  function granularity(kwh, blockKwh, rate) {
    if (!blockKwh || !(blockKwh > 0) || kwh == null || !(kwh > 0)) return null;
    var exact = kwh / blockKwh;
    var whole = Math.ceil(exact - 1e-9);
    var billedKwh = whole * blockKwh;
    var stranded = billedKwh - kwh;
    return {
      blockKwh: blockKwh,
      blocksNeeded: exact,
      blocksBought: whole,
      billedKwh: billedKwh,
      strandedKwh: stranded,
      /* What it costs if the supplier bills whole blocks rather than the
         kWh on the drawing. Zero when the site lands on a block boundary. */
      exposureUsd: stranded * rate,
      belowOneBlock: exact < 1
    };
  }

  /* ── A SUPPLIER RECORD BECOMES PRICED LINES, IN ONE PLACE ─────────────
     This lived in clearsky-cost-estimator.html, which meant the site finder
     priced sites WITHOUT the supplier pricing the organisation had entered:
     the same site, through two doors, gave two different numbers and only
     one of them knew about the quote. That is the identical failure this
     file was created to end, reappearing one level up — not in the
     arithmetic this time, but in what the arithmetic was fed.

     So the translation from "a supplier record" to "priced lines carrying
     provenance" lives here, beside the loop that consumes it. The estimator
     calls it. The site finder calls it. A quote entered once is the same
     number wherever a site is priced.

     Pure and DOM-free on purpose: it runs in a page, in a Vercel function,
     and in a test. */
  var QUOTE_STALE_DAYS = 180;

  function quoteAgeDays(v){
    if (!v || !v.date) return null;
    var t = Date.parse(v.date);
    if (isNaN(t)) return null;
    return Math.floor((Date.now() - t) / 86400000);
  }
  /* A quote that names its own expiry is stale on that date. The 180-day
     rule of thumb only covers quotes that do not say — a supplier's own
     terms outrank ours. */
  function quoteExpired(v){
    if (!v || !v.expires) return false;
    var t = Date.parse(v.expires);
    if (isNaN(t)) return false;
    return Date.now() > t;
  }
  function quoteStale(v){
    if (quoteExpired(v)) return true;
    var d = quoteAgeDays(v);
    return d != null && d > QUOTE_STALE_DAYS;
  }
  /* EXW / FCA is a price at the supplier's gate. Freight to site is real
     money and is NOT in that number, so the tool says so rather than let a
     factory-gate price read as a delivered one. It does not guess a freight
     figure: an invented allowance is an invented price. */
  function atGate(v){
    return !!(v && v.incoterm && /^\s*(EXW|FCA|EX\s*WORKS)/i.test(v.incoterm));
  }
  /* THE TIER IS NOT WHAT THE SUPPLIER CALLS IT. A firm, in-date written
     quote is a committed price and counts as evidence. Budgetary or ROM
     numbers, list prices, and quotes past their own expiry are indicative —
     real figures worth having, but nobody is bound by them. Something
     remembered from a call is a planning rate whoever said it. */
  function vendorTier(v){
    if (!v || !v.basis) return "planning";
    if (v.basis === "verbal") return "planning";
    if (v.basis === "quote") return quoteStale(v) ? "published" : "quote";
    return "published";
  }
  function hasPrice(v){
    return !!(v && typeof v.dcPerKwh === "number" && v.dcPerKwh > 0);
  }
  /* Freight, when somebody has actually got a haul quote. It is expressed
     per kWh so it scales with the hardware it is hauling, and it is ADDED
     to the gate price rather than replacing it — the two are different
     facts from different documents, and folding them into one number would
     lose which is which. With no freight recorded the gate price stands
     alone and the exposure is reported instead. */
  function freightPerKwhOf(v){
    var f = v && v.freightPerKwh;
    return (typeof f === "number" && f > 0) ? f : null;
  }

  function ratesFromVendor(v){
    if (!hasPrice(v)) return null;
    var ref = [v.model, v.ref, v.incoterm,
               (v.expires ? (quoteExpired(v) ? "EXPIRED " : "valid to ") + v.expires : ""),
               (v.excludes ? "excludes " + v.excludes : ""),
               (v.indexTo ? "indexed: " + v.indexTo : "")]
                .filter(function (x){ return !!x; }).join(" \u00b7 ");
    var frtNow = freightPerKwhOf(v);
    var label = (v.name || "supplier")
              + (atGate(v)
                  ? (frtNow ? " \u2014 " + v.incoterm + " + $" + frtNow + "/kWh freight"
                            : " \u2014 " + v.incoterm + ", freight not included")
                  : "")
              + (quoteExpired(v) ? " \u2014 quote expired" : "");
    var tier = vendorTier(v);
    var frt = freightPerKwhOf(v);
    var out = { "eq.dc": { rate:v.dcPerKwh + (frt || 0), src:tier, ref:ref,
                           asOf:v.date || "", name:label,
                           /* Both are commercial terms off the quote letter,
                              not modelling choices, so they travel with the
                              rate rather than being re-derived downstream. */
                           blockKwh: (typeof v.blockMwh === "number" && v.blockMwh > 0)
                                       ? v.blockMwh * 1000 : null,
                           /* At-gate stops being an EXPOSURE once freight is
                              priced in; the term is still reported, because
                              the reader should see what was added and why. */
                           atGate: atGate(v) && !frt, gateTerm: v.incoterm || "",
                           freightPerKwh: frt,
                           /* The plain name, for sentences. `name` carries
                              the warnings and reads badly mid-sentence. */
                           supplier: v.name || "" } };
    /* Only when the supplier actually prices it. A PCS the quote is silent
       on stays on the model's rate and stays honestly marked unsourced. */
    if (frt) {
      /* The blended rate is only as good as its weakest half. A firm battery
         quote plus a freight figure nobody sourced is not a firm price for
         the pair, and saying so is cheaper than finding out later. */
      out["eq.dc"].ref = ref + " \u00b7 plus $" + frt + "/kWh freight" +
        (v.freightRef ? " (" + v.freightRef + ")" : " (no freight reference on file)");
      if (!v.freightRef) out["eq.dc"].src = "published";
    }
    if (typeof v.pcsPerKw === "number" && v.pcsPerKw > 0) {
      out["eq.pcs"] = { rate:v.pcsPerKw, src:tier, ref:ref,
                        asOf:v.date || "", name:label };
    }
    return out;
  }

  /* ══════════════════════════════════════════════════════════════════════
     AN INSTALLER'S QUOTE REPLACES A WHOLE DIVISION

     A supplier quotes a rate. An EPC quotes a JOB: one figure for all the
     electrical, one for all the civil. That cannot be pushed into a line
     rate — splitting "$306,083.93 of electrical" across trenching, cable,
     terminations and gear would be inventing a breakdown the contractor
     never gave, and a made-up split reads exactly like a real one.

     So an installer override replaces the DIVISION TOTAL and says so. Every
     line inside it is then reported as covered by that quote rather than
     priced, because that is the truth: the contractor priced the scope, not
     the schedule of rates.

     IT SCALES PER kWh BECAUSE THAT IS THE SIZE WE WERE GIVEN. A lump sum is
     for one project; using it on another means scaling it, and scaling is an
     assumption whichever way it is done. Per-kWh is used because the quote
     was issued against a stated system size in kWh. kW is the better driver
     for electrical work — conductors and gear follow power, not energy — so
     a record that states projectKw uses that instead, and the basis is
     printed either way rather than left for a reader to guess. */
  function installerDivisions(v) {
    if (!v) return null;
    var base = null, unit = "";
    if (typeof v.projectKw === "number" && v.projectKw > 0) { base = v.projectKw; unit = "kW"; }
    else if (typeof v.projectKwh === "number" && v.projectKwh > 0) { base = v.projectKwh; unit = "kWh"; }
    if (!base) return null;            /* a lump sum with no size cannot scale */

    var d = v.divisions || {}, out = null, k;
    for (k in d) {
      if (!d.hasOwnProperty(k)) continue;
      var amt = d[k];
      if (typeof amt !== "number" || !(amt > 0)) continue;
      out = out || {};
      out[k] = {
        per: amt / base, unit: unit,
        quotedUsd: amt, quotedFor: base,
        src: v.basis === "quote" ? "quote" : v.basis === "verbal" ? "planning" : "published",
        name: v.name || "installer",
        ref: [v.ref, v.date, v.project].filter(Boolean).join(" \u00b7 "),
        qualifier: v.qualifier || "",
        /* Headroom the contractor themselves flagged — copper where aluminium
           would serve, and the like. Reported, never deducted: a saving
           nobody has priced is not a saving. */
        savingPct: (typeof v.savingPct === "number" && v.savingPct > 0) ? v.savingPct : null,
        savingWhy: v.savingWhy || ""
      };
    }
    return out;
  }

  M.installerDivisions = installerDivisions;
  M.TIERS = TIERS;
  M.tierIsEvidence = tierIsEvidence;
  M.QUOTE_STALE_DAYS = QUOTE_STALE_DAYS;
  M.quoteAgeDays = quoteAgeDays;
  M.quoteExpired = quoteExpired;
  M.quoteStale = quoteStale;
  M.atGate = atGate;
  M.vendorTier = vendorTier;
  M.vendorHasPrice = hasPrice;
  M.ratesFromVendor = ratesFromVendor;
  M.MODEL = MODEL;
  M.SPREAD = SPREAD;
  M.MARKUP = MARKUP;
  M.VOLT = VOLT;
  M.SOIL = SOIL;
  M.SOIL_LBL = SOIL_LBL;
  M.AHJ = AHJ;
  M.AHJ_LBL = AHJ_LBL;
  M.LABOR = LABOR;
  M.LABOR_LBL = LABOR_LBL;
  M.UPGRADE = UPGRADE;

  /* ── HELPERS, as pure functions of the input ──────────────────────────
     The estimator reads these off its own state object. Here they take an
     explicit input, because a Vercel function has no S and a shared model
     that reaches for global state is not shared, it is coupled. */
  function num(v){ var n = typeof v === "number" ? v : parseFloat(v); return isFinite(n) ? n : null; }
  /* Never mutate a caller's input object. A shared model that edits what it
     was handed produces bugs that only appear on the second call. */
  function shallow(o){ var c = {}, k; for (k in o) if (o.hasOwnProperty(k)) c[k] = o[k]; return c; }
  /* FOUR HOURS IS THE DEFAULT DURATION.

     Two was a conservative screening figure and it made every comparison
     awkward: the US fleet EIA reports averages about three hours, NREL's
     utility-scale benchmark is written at four, and most C&I revenue cases
     that pay for themselves are four. A two-hour default meant this tool's
     $/kWh read high against every published figure for a reason that had
     nothing to do with the site — the power-side hardware was being spread
     over half the energy.

     It is a DEFAULT, not a cap. Duration is an equipment choice; an eight
     hour system at the same kW still draws the same kW, and the circuit
     does not care. */
  var DEFAULT_HOURS = 4;
  /* Exported HERE, next to the declaration. It was assigned onto M further
     up the file, where `var` had hoisted the name but not the value, so
     M.DEFAULT_HOURS was undefined and every caller reading it silently fell
     back to its own literal — which is precisely the drift between pages
     this file exists to stop. */
  M.DEFAULT_HOURS = DEFAULT_HOURS;
  function hoursOf(i){ var h = num(i.hours); return h && h > 0 ? h : DEFAULT_HOURS; }
  function kwhOf(i){ var k = num(i.kw); return k == null ? null : k * hoursOf(i); }
  /* 0.8 sq ft per kWh plus 800 for clearances, fire access and the PCS pad.
     NFPA 855 separation is inside that number, not on top of it. */
  function padOf(i){
    var p = num(i.padArea); if (p && p > 0) return p;
    var e = kwhOf(i); return e == null ? null : Math.round(0.8 * e + 800);
  }
  function poiOf(i){ var f = num(i.poiFt); return f != null && f >= 0 ? f : 250; }
  function voltOf(i){ return M.VOLT[i.volt] ? i.volt : ""; }
  function sizeFOf(i){ var k = num(i.kw); return k == null ? 1 : Math.pow(Math.max(k, 25) / 1000, 0.75); }
  function quoteAgeMonths(i){
    if (!i.quoteDate) return null;
    var d = new Date(i.quoteDate + "T12:00:00Z");
    if (isNaN(d.getTime())) return null;
    return (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
  }
  /* Cell and inverter pricing moves quarterly. Past one quarter a quote
     escalates; past two it is not a quote any more. */
  function escalationOf(i){
    var m = quoteAgeMonths(i);
    if (m == null) return 1.015;
    if (m <= 3) return 1.0;
    return 1 + 0.006 * ((m - 3) / 3);
  }


  /* ── THE PRICING LOOP ─────────────────────────────────────────────────
     Ported from compute() in clearsky-cost-estimator.html so the site finder
     can price a site in place, and /api/ can price one with nobody watching,
     WITHOUT either of them owning a second version of this arithmetic.

     The order of operations is the substance, not the tables. Voltage regime,
     then ground conditions, then the AHJ, then the labour basis on the labour
     FRACTION only, then equipment escalation on equipment only. Change that
     order and every number moves; it is written out here in the same sequence
     as the original for exactly that reason.

     Takes an explicit input instead of reading a page's state object, because
     a serverless function has no S — and a "shared" model that reaches for
     globals is not shared, it is coupled.

     Verified against the estimator's own compute() by parity test, not by
     reading. Same input, same total, to the cent. */
  function price(input) {
    input = input || {};
    var K = num(input.kw), E = kwhOf(input);
    if (K == null || !(K > 0)) return null;

    var V = M.VOLT[voltOf(input)], vm = V.m;
    var soilM = M.SOIL[input.soil || ""] || 1.00;
    var ahjM  = M.AHJ[input.ahj || ""] || 1.00;
    var labM  = M.LABOR[input.labor || ""] || 1.00;
    var escM  = escalationOf(input);
    var F = sizeFOf(input), P = padOf(input), FT = poiOf(input);
    var ven = input.vendor || null;

    /* The old vendor hook is now one case of the general rates override, so
       there is a single path from "somebody has a real price" to the total.
       Kept as a shim rather than deleted: /api/ and the site finder both
       still pass input.vendor, and a silent behaviour change in a shared
       pricing file is exactly what this file exists to prevent. */
    if (ven && typeof ven.dcPerKwh === "number" && ven.dcPerKwh > 0) {
      var rr = {}, kk;
      if (input.rates) for (kk in input.rates) if (input.rates.hasOwnProperty(kk)) rr[kk] = input.rates[kk];
      if (!rr["eq.dc"]) {
        rr["eq.dc"] = { rate:ven.dcPerKwh, src:ven.src || "quote",
                        ref:ven.ref || "", asOf:ven.date || "",
                        name:ven.name || "supplier" };
      }
      input = shallow(input); input.rates = rr;
    }

    var srcRows = [], grans = [], gates = [], quoted = [];
    var idivs = installerDivisions(input.installer);

    function n0(v){ return Math.round(v).toLocaleString(); }

    var divs = [], subLo = 0, subBase = 0, subHi = 0, d, i;

    for (d = 0; d < M.MODEL.length; d++) {
      var D = M.MODEL[d], lines = [], dTot = 0;
      for (i = 0; i < D.lines.length; i++) {
        var L = D.lines[i], qty, unit = "", raw;

        /* THE RATE AND ITS PROVENANCE ARRIVE TOGETHER. One lookup answers
           both "what is this line priced at" and "who says so", so a number
           can never reach the total having shed its source on the way. */
        var R = rateFor(L, input);
        var vNote = R.from || "";
        if (L.id === "eq.dc" && ven && ven.stale && vNote) vNote += " — quote is stale";

        if (L.basis === "kwh")      { qty = E;  unit = "$" + R.rate + " / kWh" + (vNote ? " · " + vNote : ""); }
        else if (L.basis === "kw")  { qty = K;  unit = "$" + R.rate + " / kW"; }
        else if (L.basis === "ft")  { qty = FT; unit = "$" + R.rate + " / ft × " + n0(FT) + " ft"; }
        else if (L.basis === "pad") { qty = P;  unit = "$" + R.rate + " / sq ft × " + n0(P) + " sq ft"; }
        else                        { qty = F;  unit = "flat, scaled ×" + F.toFixed(2) + " for size"; }
        raw = R.rate * (qty == null ? 0 : qty);

        var mods = [];
        if (L.vs && vm[L.vs] !== 1) { raw *= vm[L.vs]; mods.push(V.label.split(" (")[0] + " ×" + vm[L.vs].toFixed(2)); }
        if (L.soil && soilM !== 1)  { raw *= soilM;    mods.push("ground ×" + soilM.toFixed(2)); }
        if (L.ahj  && ahjM  !== 1)  { raw *= ahjM;     mods.push("AHJ ×" + ahjM.toFixed(2)); }
        if (L.lab > 0 && labM !== 1){
          raw = raw * (1 - L.lab) + raw * L.lab * labM;
          mods.push("labour ×" + labM.toFixed(2) + " on " + Math.round(L.lab * 100) + "%");
        }
        if (D.id === "eq" && escM !== 1) { raw *= escM; mods.push("escalation ×" + escM.toFixed(3)); }

        /* Only a kWh-basis line can have a block size; a $/kW rate is not
           sold in containers. */
        var gran = (L.basis === "kwh") ? granularity(E, R.blockKwh, R.rate) : null;
        if (gran) {
          mods.push(gran.belowOneBlock
            ? "below one " + (gran.blockKwh / 1000) + " MWh block"
            : n0(gran.blocksBought) + " \u00d7 " + (gran.blockKwh / 1000) + " MWh blocks");
        }
        if (R.atGate) mods.push(R.gateTerm + ", freight not included");

        lines.push({ id:L.id, n:L.n, basis:unit, mods:mods, cost:raw,
                     src:R.src, ref:R.ref, asOf:R.asOf, ratedBy:R.from,
                     granularity:gran, atGate:!!R.atGate, gateTerm:R.gateTerm || "" });
        if (gran) grans.push({ id:L.id, n:L.n, g:gran, ratedBy:R.supplier });
        if (R.atGate) gates.push({ id:L.id, n:L.n, term:R.gateTerm, ratedBy:R.from });
        srcRows.push({ id:L.id, n:L.n, src:R.src, ref:R.ref, asOf:R.asOf,
                       ratedBy:R.from, cost:raw });
        dTot += raw;
      }
      /* ── AN INSTALLER'S PRICE FOR THIS WHOLE DIVISION ────────────────
         Replaces the modelled total outright. The lines stay on screen
         because a reader still needs to see what the scope covers, but
         they are marked as covered by the quote rather than priced, and
         they no longer add up to the number beside them — the contractor's
         figure does. Saying that plainly beats silently rescaling each
         line to fit, which would manufacture a breakdown nobody quoted. */
      var iv = idivs && idivs[D.id];
      if (iv) {
        var qty2 = iv.unit === "kW" ? K : E;
        if (qty2 != null && qty2 > 0) {
          dTot = iv.per * qty2;
          for (var li = 0; li < lines.length; li++) {
            lines[li].coveredBy = iv.name;
            lines[li].src = iv.src;
            lines[li].ref = iv.ref;
            lines[li].ratedBy = iv.name;
          }
          srcRows = srcRows.filter(function (row) {
            return String(row.id).indexOf(D.id + ".") !== 0;
          });
          srcRows.push({ id:"div." + D.id, n:D.name + " \u2014 quoted by " + iv.name,
                         src:iv.src, ref:iv.ref, asOf:"", ratedBy:iv.name, cost:dTot });
          quoted.push({ div:D.id, name:D.name, iv:iv, usd:dTot });
        }
      }

      var sp = M.SPREAD[D.id];
      divs.push({ id:D.id, name:D.name, lines:lines,
                  quotedBy: iv ? iv.name : "",
                  /* The division carries its own provenance, not just its
                     lines: it is the thing that was quoted. */
                  src: iv ? iv.src : "planning",
                  ref: iv ? iv.ref : "",
                  qualifier: iv ? iv.qualifier : "",
                  lo:dTot*(1-sp), base:dTot, hi:dTot*(1+sp), spread:sp });
      subLo += dTot*(1-sp); subBase += dTot; subHi += dTot*(1+sp);
    }

    /* An unknown utility upgrade is an EXPOSURE, reported separately. Burying
       it in the total is how a budget becomes a surprise. */
    var up = M.UPGRADE[input.utilityUpgrade || ""] || M.UPGRADE[""];
    var upCost = 0, upLine = null;
    if (up.cost > 0 || (input.carryUpgrade && up.exposure)) {
      upCost = up.cost > 0 ? up.cost : up.exposure[0];
      upLine = { name:"Utility-side upgrade — " + up.label, cost:upCost,
                 carried: up.cost === 0 };
      subLo += upCost*0.8; subBase += upCost; subHi += upCost*1.35;
    }

    var runLo = subLo, runBase = subBase, runHi = subHi, marks = [], m;
    for (m = 0; m < M.MARKUP.length; m++) {
      var K2 = M.MARKUP[m];
      var aLo = runLo*K2.lo, aBase = runBase*K2.base, aHi = runHi*K2.hi;
      marks.push({ id:K2.id, n:K2.n, rate:K2.base, lo:aLo, base:aBase, hi:aHi });
      runLo += aLo; runBase += aBase; runHi += aHi;
    }

    /* ── THE AUDIT ────────────────────────────────────────────────────
       Everything that made it into the total gets a row, not just the
       direct lines. A contingency percentage and an EPC margin are numbers
       an IE will ask about too, and leaving them out of the audit would put
       a flattering denominator under the coverage figure. They are internal
       planning assumptions until somebody replaces them with a real one, so
       that is what they are recorded as. */
    if (upLine) {
      srcRows.push({ id:"util.upgrade", n:upLine.name, src:"planning",
                     ref:"", asOf:"", ratedBy:"", cost:upCost });
    }
    for (m = 0; m < marks.length; m++) {
      srcRows.push({ id:"markup." + marks[m].id, n:marks[m].n, src:"planning",
                     ref:"", asOf:"", ratedBy:"", cost:marks[m].base });
    }

    var byTier = { actual:0, quote:0, published:0, planning:0 }, sTot = 0, si;
    for (si = 0; si < srcRows.length; si++) {
      var t = TIERS[srcRows[si].src] ? srcRows[si].src : "planning";
      byTier[t] += srcRows[si].cost; sTot += srcRows[si].cost;
    }
    function share(v){ return sTot > 0 ? v / sTot : 0; }
    /* Biggest unbacked money first. "38% is unsourced" tells a reader to
       worry; "the battery, $335k, is unsourced" tells them what to go and
       get, which is the only version that changes anything. */
    var gaps = srcRows.filter(function (r){ return !tierIsEvidence(r.src); })
                      .sort(function (a, b){ return b.cost - a.cost; })
                      .slice(0, 8);

    /* ── EXPOSURES ────────────────────────────────────────────────────
       Costs that are real, not in the total, and known by name. The
       utility upgrade has been handled this way since the beginning and
       the reasoning generalises: a number somebody can act on beats a
       contingency percentage that quietly absorbs it.

       Each one says what it is, what it would cost if it lands, and what
       closes it. An exposure with no closing action is just worrying. */
    var exposures = [], gi;
    for (gi = 0; gi < grans.length; gi++) {
      var G = grans[gi].g;
      if (G.strandedKwh <= 0) continue;         /* lands on a block boundary */
      exposures.push({
        id: "granularity." + grans[gi].id,
        name: (grans[gi].ratedBy || "The supplier") + " sells in " +
              (G.blockKwh / 1000) + " MWh blocks",
        usd: G.exposureUsd,
        why: G.belowOneBlock
          ? "This site needs " + n0(E) + " kWh, which is less than one block. " +
            "Priced here at the per-kWh rate on the quote; if the supplier bills " +
            "a whole block, " + n0(G.strandedKwh) + " kWh of it is stranded."
          : "This site needs " + n0(E) + " kWh. " + n0(G.blocksBought) +
            " blocks is " + n0(G.billedKwh) + " kWh, leaving " + n0(G.strandedKwh) +
            " kWh stranded if the supplier bills whole blocks rather than the " +
            "kWh on the drawing.",
        closes: "Ask the supplier whether they will bill the exact kWh, or size " +
                "the system to a whole number of blocks."
      });
    }
    for (gi = 0; gi < gates.length; gi++) {
      exposures.push({
        id: "freight." + gates[gi].id,
        name: "Freight to site \u2014 " + gates[gi].term,
        /* Deliberately null. An invented allowance is an invented price,
           and a made-up freight number is the kind of thing that reads as
           diligence right up until somebody checks it. */
        usd: null,
        why: "This line is priced at the supplier's gate, so delivery to site " +
             "is not in it. The amount is not known here and is not guessed.",
        closes: "Get a haul quote for the route and enter it as its own line."
      });
    }
    for (gi = 0; gi < quoted.length; gi++) {
      var Q = quoted[gi];
      if (!Q.iv.savingPct) continue;
      exposures.push({
        id: "ve." + Q.div,
        name: Q.name + " \u2014 value engineering not taken",
        /* NEGATIVE, and deliberately so: this is money that might come OUT,
           not a cheque to write. It is reported rather than deducted
           because a saving nobody has priced is not a saving, and an
           estimate that quietly banks one is an estimate that misses. */
        usd: -(Q.usd * Q.iv.savingPct),
        why: Q.iv.savingWhy || ("The " + Q.name + " price carries options a "
             + "redesign could cheapen."),
        closes: "Ask " + Q.iv.name + " to re-price the alternative, or put the "
              + "scope out to the other installers."
      });
    }
    if (upLine && upLine.carried) {
      exposures.push({
        id: "utility.upgrade",
        name: "Utility-side upgrade \u2014 " + up.label,
        usd: upCost,
        why: "Carried as an allowance because the interconnection study has not " +
             "returned. It can exceed the cost of the battery.",
        closes: "The facilities study prices it."
      });
    }

    var per  = function (t){ return E ? t/E : null; };
    var perK = function (t){ return K ? t/K : null; };

    return {
      kw:K, kwh:E, hours:hoursOf(input), pad:P, poiFt:FT,
      voltage:voltOf(input), voltLabel:V.label,
      divisions:divs, markups:marks, upgrade:up, upgradeLine:upLine,
      subtotal:{ lo:subLo, base:subBase, hi:subHi },
      total:{ lo:runLo, base:runBase, hi:runHi },
      perKwh:{ lo:per(runLo), base:per(runBase), hi:per(runHi) },
      perKw:{ lo:perK(runLo), base:perK(runBase), hi:perK(runHi) },
      escalation:escM, quoteAgeMonths:quoteAgeMonths(input),
      exposures: exposures,
      sourcing: {
        rows: srcRows,
        usdByTier: byTier,
        shareByTier: { actual:share(byTier.actual), quote:share(byTier.quote),
                       published:share(byTier.published),
                       planning:share(byTier.planning) },
        /* Two different questions, deliberately reported separately. A bank
           asks what is EVIDENCE — a quote or a booked cost. A market study
           asks what is CITED, which a published benchmark satisfies and a
           planning rate does not. Collapsing them into one "backed" number
           would let a national average stand in for a price on this site. */
        evidenceShare: share(byTier.actual + byTier.quote),
        citedShare:    share(byTier.actual + byTier.quote + byTier.published),
        auditedUsd:    sTot,
        biggestGaps:   gaps
      }
    };
  }
  M.price = price;

  M.helpers = { num:num, hours:hoursOf, kwh:kwhOf, pad:padOf, poi:poiOf,
                volt:voltOf, sizeF:sizeFOf, escalation:escalationOf,
                quoteAgeMonths:quoteAgeMonths };

  /* In the browser the estimator refers to these by bare name, exactly as it
     did when they were declared inline — so lifting them out here changes the
     tables' home without changing a line of the code that reads them. */
  if (typeof window !== "undefined") {
    for (var _n = 0; _n < NAMES.length; _n++) {
      if (typeof window[NAMES[_n]] === "undefined") window[NAMES[_n]] = M[NAMES[_n]];
    }
  }

  root.OmegaCostModel = M;
  if (typeof module !== "undefined" && module.exports) module.exports = M;
})(typeof window !== "undefined" ? window : this);
