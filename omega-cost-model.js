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
  function hoursOf(i){ var h = num(i.hours); return h && h > 0 ? h : 2; }
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

    function n0(v){ return Math.round(v).toLocaleString(); }

    var divs = [], subLo = 0, subBase = 0, subHi = 0, d, i;

    for (d = 0; d < M.MODEL.length; d++) {
      var D = M.MODEL[d], lines = [], dTot = 0;
      for (i = 0; i < D.lines.length; i++) {
        var L = D.lines[i], qty, unit = "", raw;

        /* A supplier's own number beats the generic rate, and says so. */
        var vRate = null, vNote = "";
        if (L.id === "eq.dc" && ven && typeof ven.dcPerKwh === "number" && ven.dcPerKwh > 0) {
          vRate = ven.dcPerKwh;
          vNote = (ven.name || "supplier") + (ven.stale ? " — quote is stale" : "");
        }
        if (vRate != null) {
          L = { id:L.id, n:L.n, basis:L.basis, rate:vRate, lab:L.lab,
                vs:L.vs, soil:L.soil, ahj:L.ahj };
        }

        if (L.basis === "kwh")      { qty = E;  unit = "$" + L.rate + " / kWh" + (vNote ? " · " + vNote : ""); }
        else if (L.basis === "kw")  { qty = K;  unit = "$" + L.rate + " / kW"; }
        else if (L.basis === "ft")  { qty = FT; unit = "$" + L.rate + " / ft × " + n0(FT) + " ft"; }
        else if (L.basis === "pad") { qty = P;  unit = "$" + L.rate + " / sq ft × " + n0(P) + " sq ft"; }
        else                        { qty = F;  unit = "flat, scaled ×" + F.toFixed(2) + " for size"; }
        raw = L.rate * (qty == null ? 0 : qty);

        var mods = [];
        if (L.vs && vm[L.vs] !== 1) { raw *= vm[L.vs]; mods.push(V.label.split(" (")[0] + " ×" + vm[L.vs].toFixed(2)); }
        if (L.soil && soilM !== 1)  { raw *= soilM;    mods.push("ground ×" + soilM.toFixed(2)); }
        if (L.ahj  && ahjM  !== 1)  { raw *= ahjM;     mods.push("AHJ ×" + ahjM.toFixed(2)); }
        if (L.lab > 0 && labM !== 1){
          raw = raw * (1 - L.lab) + raw * L.lab * labM;
          mods.push("labour ×" + labM.toFixed(2) + " on " + Math.round(L.lab * 100) + "%");
        }
        if (D.id === "eq" && escM !== 1) { raw *= escM; mods.push("escalation ×" + escM.toFixed(3)); }

        lines.push({ id:L.id, n:L.n, basis:unit, mods:mods, cost:raw });
        dTot += raw;
      }
      var sp = M.SPREAD[D.id];
      divs.push({ id:D.id, name:D.name, lines:lines,
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
      escalation:escM, quoteAgeMonths:quoteAgeMonths(input)
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
