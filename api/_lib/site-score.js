/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   Server-only Site Finder energy model, sizing and scoring. EUI/EUI_LF,
   weights and scoring math live here; providers return raw building facts.
   Unknown inputs leave the denominator. Rank on absolute points, not score/outOf.
   Metered zero stays zero. All other estimated load retains its provenance.
   Caller-supplied circuits are screening inputs, never a capacity reservation.
   Auth, billing and tenant checks belong to api/site-score.js. */
'use strict';

/* The sizing duration is not ours to choose twice. omega-cost-model.js already
   owns DEFAULT_HOURS and the estimator, the editor and the Site Finder all read
   it from there; a second 4 in this file is a future disagreement between the
   kWh on the card and the kWh in the quote. Required rather than copied, the
   same way api/offer.js requires ../omega-fees.js. If the module is missing this
   throws at load, which is the correct volume for a missing dependency. */
var COST = require('./cost-model.js');

/* ── CONSTANTS ──────────────────────────────────────────────────────────────
   Each one is a decision, so each one is named and carries its reason. */

/* kBtu → kWh. Physical conversion, not a judgement. It was living inside
   modelKwh() in omega-comed-listings.js; it comes along with the model. */
var KBTU_PER_KWH = 3.412;
var HOURS_PER_YEAR = 8760;

/* HOW MUCH OF A PEAK IS WORTH SHAVING.
   15% of peak at the default duration is the standard opening screen for a C&I
   demand-charge deal. Going deeper needs interval data we do not have — this is
   a screening figure, and the moment real interval data exists for a site the
   caller should pass loadKw directly rather than let this guess.
   Other copies of this number exist in editor.html (shaveFrac when the load
   factor is unknown) and comed-capacity.html (recKw). They are not reachable
   from a serverless function and are not silently kept in step with this one;
   pointing them here is a client change, listed in the report. */
var SHAVABLE_FRACTION = 0.15;

/* Load factor of last resort, for a type that is not in the table at all. 0.5
   is the table's own centre of mass, and a type we have never seen is far more
   likely to be an ordinary building than a data centre. */
var FALLBACK_LOAD_FACTOR = 0.5;

/* Server-only screening tables, moved from omega-listings-source.js.
   CBECS/ENERGY STAR order-of-magnitude figures; never metered evidence.
   Providers collect raw building facts. Only this module models their load. */
var EUI = { 'Warehouse': 22, 'Industrial': 48, 'Manufacturing': 68,
  'Cold Storage': 96, 'Flex': 38, 'Office': 62, 'Retail': 54,
  'Data Center': 220, 'Institutional': 58, 'Multifamily': 44,
  'Vacant Land': 0, 'Other': 45 };
var EUI_LF = { 'Warehouse': 0.38, 'Industrial': 0.55, 'Manufacturing': 0.60,
  'Cold Storage': 0.72, 'Flex': 0.50, 'Retail': 0.45,
  'Office': 0.50, 'Data Center': 0.85, 'Institutional': 0.42,
  'Multifamily': 0.55, 'Vacant Land': 0, 'Other': 0.50 };

/* ── THE WEIGHT TABLE ───────────────────────────────────────────────────────
   Points out of 100. `cap` is the value at which a component earns full marks —
   1,200 kW deliverable scores the whole 45 by default. Raising a cap makes the
   score harsher; lowering it makes more sites look good. That is a commercial
   judgement, not a technical one, which is why it is configurable.

   WHAT CHANGED IN MOVING IT: it used to be configurable in localStorage, per
   browser, which is not configuration — it is divergence. Weights now arrive
   from the caller (an org-level record) and these are the fallback. This file
   cannot read localStorage and must never grow a way to.

   TWO SCORES, DELIBERATELY NOT MERGED. Demand-charge storage and a large-load /
   data-centre siting play want opposite things. The battery deal wants a big
   peak to shave and only needs a few hundred kW of headroom. The large load
   wants raw megawatts available and does not care about the existing peak at
   all — an empty industrial parcel scores near zero as a battery deal and near
   the top as a site to build on. Collapsing them into one number hides whichever
   the rep is not currently looking for. */
var WEIGHT_DEFAULTS = {
  battery: {
    deliverable:  { pts: 45, cap: 1200, label: "Deliverable kW now",
                    note: "After ComEd's queue and your team's claims." },
    peak:         { pts: 20, cap: 2000, label: "Customer's peak load",
                    note: "What there is to shave. Needs a building." },
    headroom:     { pts: 15, cap: 4000, label: "Room left on the circuit",
                    note: "Space to grow, or to sell a second site." },
    notCapped:    { pts: 10, cap: 0,    label: "Load binds, not the wire",
                    note: "Awarded when the circuit is not the constraint." },
    useType:      { pts: 10, cap: 0,    label: "Industrial use class",
                    note: "Warehouse, industrial, manufacturing, cold storage, flex." }
  },
  load: {
    headroom:     { pts: 55, cap: 10000, label: "Raw headroom on the circuit",
                    note: "A large load only draws. Megawatts are the point." },
    land:         { pts: 20, cap: 20,    label: "Lot acreage",
                    note: "Room to build. The existing building may be demolished." },
    useType:      { pts: 15, cap: 0,     label: "Industrial or vacant land",
                    note: "Zoning that will accept a large load." },
    service:      { pts: 10, cap: 0,     label: "Existing large service",
                    note: "1 MVA or more already at the site." }
  },
  /* A modelled load is a guess and a metered one is a measurement. Scoring them
     identically is how an estimate gets quoted as a reading. */
  modelledPenalty: 0.85
};

/* Use classes that earn the full use-type award, per play. A record with a class
   that is not on its list still earns a consolation share (below) — it is the
   wrong shape of building, not a disqualification. A record with NO class at all
   earns nothing and is not scored, because unknown is not a small yes. */
var BATTERY_USE = /Warehouse|Industrial|Manufacturing|Cold Storage|Flex/;
var LOAD_USE = /Industrial|Manufacturing|Vacant Land|Flex/;
/* Kept as the two different literals they have always been rather than rounded
   into one: 3 points of 10 and 4 points of 15. Merging them would quietly
   re-rank every site on both boards to save a constant. */
var BATTERY_USE_CONSOLATION = 0.3;
var LOAD_USE_CONSOLATION = 0.27;

/* Existing service that counts as "already large". 1 MVA is the line at which
   the service stops being the first thing to fix in the conversation. */
var LARGE_SERVICE_KVA = 1000;

/* ── HELPERS ────────────────────────────────────────────────────────────────*/

function num(v) {
  if ((typeof v !== 'number' && typeof v !== 'string') || String(v).trim() === '') return null;
  var n = Number(v);
  return isFinite(n) ? n : null;
}

function nonNegative(v) {
  var n = num(v);
  return n === null ? null : (n < 0 ? 0 : n);
}

function clone(o) { return JSON.parse(JSON.stringify(o)); }

/* Thousands separators WITHOUT toLocaleString. A serverless function's ICU
   locale is whatever the runtime happens to carry, so toLocaleString makes the
   explanation text non-deterministic and unequal to what the rep's browser
   printed. Fixed formatting, on purpose. */
function fmt(n) {
  if (n === null || n === undefined || !isFinite(n)) return "unknown";
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/* Same, for a quantity that is legitimately fractional. fmt() rounds, which is
   right for kW and kVA and wrong for acreage: a 0.4-acre parcel earned 0.4 of
   20 points and the line explaining it read "0 acres", an explanation that
   contradicted the score it was explaining. A term that cannot be read back is
   the defect this file was written to fix, so it must not reappear in the
   formatting. Fixed to one decimal below 10; no locale, for the same reason. */
function fmtFine(n) {
  if (n === null || n === undefined || !isFinite(n)) return "unknown";
  if (Math.abs(n) >= 10 || n === Math.round(n)) return fmt(n);
  return String(Math.round(n * 10) / 10);
}

/* Merge a caller's weights over the defaults so a weight added in a later build
   does not vanish for an org that saved settings against an older one. Ported
   from loadWeights() in the Site Finder, minus the localStorage.

   Values are coerced and clamped at zero. They are NOT rescaled to sum to 100:
   if an org's table adds up to 120, `outOf` reports 120 and the surface can show
   it. Rescaling would hide a misconfigured weight table, which is precisely the
   thing an org that edits weights needs to be able to see. */
function mergeWeights(w) {
  var out = clone(WEIGHT_DEFAULTS), g, k, src;
  if (!w || typeof w !== 'object') return out;
  for (g in out) {
    if (!Object.prototype.hasOwnProperty.call(out, g)) continue;
    if (g === 'modelledPenalty') {
      var p = num(w.modelledPenalty);
      if (p !== null && p >= 0) out.modelledPenalty = p;
      continue;
    }
    src = w[g];
    if (!src || typeof src !== 'object') continue;
    for (k in out[g]) {
      if (!Object.prototype.hasOwnProperty.call(out[g], k)) continue;
      if (!src[k] || typeof src[k] !== 'object') continue;
      var pts = nonNegative(src[k].pts);
      var cap = nonNegative(src[k].cap);
      if (pts !== null) out[g][k].pts = pts;
      if (cap !== null) out[g][k].cap = cap;
    }
  }
  return out;
}

/* ── GRAIN ──────────────────────────────────────────────────────────────────
   GRAIN ONCE CAPPED THE SCORE. ComEd publishes the same capacity at five grains
   and only layer 75 is the circuit serving a parcel; 71–74 report the best
   circuit anywhere in a block up to 36 square miles. A 900 kW figure read off a
   section block is not this site's 900 kW, so it could not produce a qualified
   score — without the cap a rep zoomed out to the metro saw a screen of high
   scores that were block maxima, called the top ten, and found the capacity
   belonged to a substation two miles away.

   Circuits are now attributed from layer 75 only, so a record either has a real
   feeder or has none, and the block-maximum case cannot arise. The factor is
   therefore 1 and the function stays — as the one place a future provider whose
   capacity IS coarse can reintroduce a cap, instead of it being reinvented at
   the call site. It multiplies the score, never the denominator: a coarse input
   is a discount on confidence, not a term that could not be assessed. */
function grainFactor(row, opts) {
  var g = opts ? num(opts.grainFactor) : null;
  if (g !== null && g > 0 && g <= 1) return g;
  return 1;
}

/* ── LOAD MODEL ─────────────────────────────────────────────────────────────
   annualKwh → peakKw → loadKw, with the provenance carried the whole way.

   Returns, always with the same keys:
     annualKwh { value, src }   src: metered | modelled | proxy | (record's own)
     peakKw                     estimated peak demand, kW
     loadKw                     the shavable slice — what a battery is sized to
     basis                      every input that produced the above
     reason                     null when it worked; a named failure when not

   A metered figure on the row always wins: applyBenchmark() in the Site Finder
   overwrites annualKwh with City of Chicago benchmarking data where a building
   matches, and re-modelling over the top of a measurement would be the exact
   inversion this codebase exists to prevent. */
function modelLoad(row, opts) {
  row = row || {};
  opts = opts || {};

  var out = {
    annualKwh: null,
    peakKw: null,
    loadKw: null,
    basis: null,
    reason: null
  };

  var type = row.type ? String(row.type) : '';
  var basis = {
    type: type || null,
    sqft: null, sqftSrc: null,
    eui: null, euiSrc: null,
    loadFactor: null, loadFactorSrc: null,
    shavableFraction: opts.shavableFraction != null
      ? num(opts.shavableFraction) : SHAVABLE_FRACTION
  };
  if (basis.shavableFraction === null || basis.shavableFraction <= 0) {
    basis.shavableFraction = SHAVABLE_FRACTION;
  }

  /* ---- annual kWh ------------------------------------------------------- */
  var given = row.annualKwh && typeof row.annualKwh === 'object'
    ? num(row.annualKwh.value) : null;

  /* A figure of ZERO on the row is a figure, not an absence. An earlier draft
     of this function tested `> 0` and fell through to modelling, which would
     have replaced a metered zero — a vacant or shut building, which is real and
     worth knowing — with an estimate off its floor area. Overwriting a
     measurement with a guess is the one thing this file exists to prevent. */
  if (given === 0) {
    basis.sqft = num(row.sqft);
    basis.sqftSrc = basis.sqft === null ? null : 'record';
    out.annualKwh = { value: 0, src: row.annualKwh.src ? String(row.annualKwh.src) : 'unstated' };
    out.peakKw = 0;
    out.loadKw = 0;
    out.basis = basis;
    out.reason = 'this record reports zero annual kWh (' + out.annualKwh.src +
      '), so there is no peak to shave';
    return out;
  }

  if (given !== null && given > 0) {
    /* A missing src is NOT metered. The penalty below treats anything that is
       not explicitly "metered" as an estimate, which is the conservative read
       and the only safe one when a provider forgot to stamp its own work. */
    out.annualKwh = {
      value: given,
      src: row.annualKwh.src ? String(row.annualKwh.src) : 'unstated'
    };
    basis.sqft = num(row.sqft);
    basis.sqftSrc = basis.sqft === null ? null : 'record';
  } else {
    /* Model it. sqft × EUI ÷ 3.412, ported from modelKwh() in
       omega-comed-listings.js. */
    var sqft = num(row.sqft);
    var sqftSrc = sqft === null ? null : 'record';

    /* FLOOR AREA FROM ACREAGE IS OPT-IN AND HAS NO DEFAULT HERE.
       omega-comed-listings.js ships estimateSqftFromAcres:false with coverage
       0.28, and the reasoning there is correct: coverage on industrial land runs
       12%–45%, so a derived floor area is a guess that reads as a measurement
       and it drives the load ceiling on the card. That decision — and that 0.28
       — lives in that file's CFG. This function will not invent one. A caller
       that has decided otherwise passes opts.lotCoverage explicitly, and what
       comes back is stamped "proxy" so it can never be mistaken for a reading. */
    var coverage = num(opts.lotCoverage);
    if (sqft === null && coverage !== null && coverage > 0) {
      var acres = num(row.lotAcres);
      if (acres !== null && acres > 0) {
        sqft = Math.round(acres * 43560 * coverage);
        sqftSrc = 'lot-coverage';
      }
    }

    basis.sqft = sqft;
    basis.sqftSrc = sqftSrc;

    if (sqft === null || sqft <= 0) {
      /* THE COMMON CASE IN COMED TERRITORY, and the whole of correctness fix 1.
         Parcels carry acreage, never building area. This is not a zero and the
         score must not treat it as one. */
      out.basis = basis;
      out.reason = 'no building area on this record, so annual kWh cannot be modelled';
      return out;
    }

    var eui = Object.prototype.hasOwnProperty.call(EUI, type) ? EUI[type] : null;
    basis.eui = eui === null ? EUI.Other : eui;
    basis.euiSrc = eui === null ? 'table-fallback:Other' : 'table:' + type;

    if (basis.eui <= 0) {
      /* Vacant Land. A real answer — there is no building — not a gap. */
      out.basis = basis;
      out.reason = 'use class "' + type + '" carries no building load';
      return out;
    }

    out.annualKwh = {
      value: Math.round(sqft * basis.eui / KBTU_PER_KWH),
      src: sqftSrc === 'lot-coverage' ? 'proxy' : 'modelled'
    };
  }

  /* ---- peak ------------------------------------------------------------- */
  /* row.loadFactor is an override with no producer today; if a measured load
     factor for a building is ever obtained it belongs on the row and it wins.
     The table is otherwise the authority for the type.

     The old client expression was `r.loadFactor || EUI_LF[r.type] || 0.5`, which
     reads a table value of 0 as absent and substitutes 0.5. Here a tabled zero
     is an answer — the type has no load — and it is reported as one. */
  var lf = num(row.loadFactor);
  if (lf !== null && lf > 0) {
    basis.loadFactor = lf;
    basis.loadFactorSrc = 'record';
  } else if (Object.prototype.hasOwnProperty.call(EUI_LF, type)) {
    basis.loadFactor = EUI_LF[type];
    basis.loadFactorSrc = 'table:' + type;
  } else {
    basis.loadFactor = FALLBACK_LOAD_FACTOR;
    basis.loadFactorSrc = 'fallback';
  }

  out.basis = basis;

  if (!(basis.loadFactor > 0)) {
    out.reason = 'use class "' + type + '" carries no load factor, so a peak cannot be estimated';
    return out;
  }

  out.peakKw = (out.annualKwh.value / HOURS_PER_YEAR) / basis.loadFactor;
  out.loadKw = out.peakKw * basis.shavableFraction;
  return out;
}

/* ── CIRCUIT CEILING ────────────────────────────────────────────────────────
   What the wire will accept AFTER everyone's claims.

   The preferred input is a feederState() object from omega-capacity-ledger.js —
   { known, sellable, nameplate, queue, … } — because only the ledger knows about
   our own firm and soft claims. Failing that, a row that carries ComEd's own
   published figures can stand in: nameplate − queue.

   CAPACITY WITHOUT AN IDENTITY IS NOT A CIRCUIT. The record fallback requires a
   feederId, and this rule is load-bearing. An earlier version of the Site Finder
   tested nameplate alone, which let a record with capacity but no feeder produce
   a complete-looking circuit state — headroom, queue, a suggested hold size —
   attached to a circuit nobody could name. The panel then said "No circuit is
   attributed to this site" and "100 kW is already held on this circuit" six
   lines apart, and the Hold button failed only after the rep had typed a note.
   Unnameable capacity cannot be claimed, compared against a colleague's hold, or
   quoted to ComEd, so it stays unknown. */
function circuitCeiling(row, circuit) {
  row = row || {};

  /* KNOWN MEANS A NUMBER. feederState() only ever sets sellable when it is
     known, so a genuine ledger state cannot reach here without one — but the
     header is explicit that this object may have travelled up from a browser,
     and a { known: true } with no usable sellable would otherwise be reported
     as a known circuit with a null ceiling. combine() would then find no
     circuit ceiling to compare against, call binds "load", and scoreBattery
     would award the full "load binds, not the wire" term — correctness fix 2
     reappearing through a malformed input instead of through an absent one.
     A claim of knowledge that carries no figure is not knowledge. */
  var fromLedger = circuit && circuit.known === true ? nonNegative(circuit.sellable) : null;
  if (fromLedger !== null) {
    return { kw: fromLedger, known: true, src: circuit.fromRecord ? 'record' : 'ledger',
      why: circuit.fromRecord ? 'from the supplied record; our holds are not netted' : null };
  }

  var np = num(row.nameplate);
  var feeder = row.feederId ? String(row.feederId) : '';
  if (np !== null && feeder) {
    var q = num(row.queue) || 0;
    return {
      kw: Math.max(0, np - q),
      known: true,
      /* Marked so a surface can say where it came from rather than implying the
         ledger confirmed it. It nets ComEd's queue only — it knows nothing about
         our own holds, so it can read HIGH. */
      src: 'record',
      why: 'from the record’s own published nameplate less queue; our holds are not netted'
    };
  }

  if (np !== null && !feeder) {
    return { kw: null, known: false, src: null,
      why: 'capacity is published for this point but no feeder is named, so it is not a circuit' };
  }

  if (circuit && circuit.known) {
    return { kw: null, known: false, src: null,
      why: 'a circuit state was supplied for this site but it carries no usable ' +
           'available-kW figure, so nothing about the wire is established' };
  }

  return { kw: null, known: false, src: null,
    why: 'no hosting-capacity record for this circuit' };
}

/* ── THE TWO CEILINGS ───────────────────────────────────────────────────────
   Two independent ceilings and they bind for different reasons:

     load ceiling    — what the customer's own peak justifies shaving
     circuit ceiling — what the wire will accept AFTER everyone's claims

   Reporting the smaller number alone is how a proposal ends up promising 900 kW
   on a circuit with 200 kW left. Report both and name which binds.

   THIS IS OmegaLedger.sizeAt() ARITHMETIC, MATCHED DELIBERATELY. Same branch
   order, same rounding, same derivation of kWh from the ROUNDED kW (rounding
   each independently publishes "267 kW / 535 kWh" off a raw 267.49 — two numbers
   side by side on a card that do not multiply, and a rep who checks 267 × 2 in
   their head stops trusting the card). It is matched rather than required
   because the ledger is a stateful browser module built on an allocation stream
   and an in-memory feeder registry, neither of which exists in a serverless
   function.

   THE LEDGER REMAINS AUTHORITATIVE FOR THE OVERSELL REFUSAL. This returns a
   ranking number. A hold is only legitimate through OmegaLedger.reserve(), which
   re-reads feederState() at the moment of writing and is the only thing that can
   refuse an oversell. If these two ever disagree, the ledger is right. */
function combine(row, circuit, opts) {
  row = row || {};
  opts = opts || {};

  /* THE ONE PLACE THIS DOES NOT COPY sizeAt(): the ledger still defaults hours
     to a literal 2, from before omega-cost-model.js owned DEFAULT_HOURS. Every
     caller of either passes hours explicitly, so the two agree in practice; a
     caller that omits it gets the cost model's answer here, because the kWh on
     the card and the kWh in the quote have to be the same number. Pointing the
     ledger at DEFAULT_HOURS too is a client change and is listed in the report. */
  var hours = num(opts.hours);
  if (hours === null || hours <= 0) hours = COST.DEFAULT_HOURS;

  var loadKw = num(opts.loadKw);
  var loadSrc = loadKw === null ? null : 'caller';
  var modelled = null;
  if (loadKw === null) {
    modelled = opts.load && typeof opts.load === 'object' ? opts.load : modelLoad(row, opts);
    loadKw = num(modelled.loadKw);
    loadSrc = loadKw === null ? null : 'modelled';
  }

  var circ = circuitCeiling(row, circuit);
  var circuitKw = circ.kw;

  var kw, binds, why;
  if (loadKw === null && circuitKw === null) {
    kw = null; binds = 'unknown';
    why = 'neither a customer load nor a circuit capacity is known for this site';
  } else if (loadKw === null) {
    kw = circuitKw; binds = 'circuit';
    why = 'sized to the circuit; the customer’s own load is not known';
  } else if (circuitKw === null) {
    kw = loadKw; binds = 'load';
    why = 'sized to the customer’s load; no circuit capacity is attributed';
  } else if (circuitKw < loadKw) {
    kw = circuitKw; binds = 'circuit';
    why = 'the circuit binds: ' + fmt(circuitKw) + ' kW left against ' + fmt(loadKw) + ' kW of shavable load';
  } else {
    kw = loadKw; binds = 'load';
    why = 'the load binds: ' + fmt(loadKw) + ' kW shavable against ' + fmt(circuitKw) + ' kW left on the circuit';
  }

  var kwOut = kw === null ? null : Math.max(0, Math.round(kw));

  return {
    kw: kwOut,
    kwh: kwOut === null ? null : kwOut * hours,
    hours: hours,
    loadCeiling: loadKw === null ? null : Math.round(loadKw),
    loadSrc: loadSrc,
    circuitCeiling: circuitKw === null ? null : Math.round(circuitKw),
    circuitSrc: circ.src,
    circuitKnown: circ.known,
    binds: binds,
    /* True when the circuit — not the customer — is the reason the system is
       small. That is a different sales conversation entirely. Note that it is
       false for "unknown" as well as for "load"; anything deciding whether the
       load binds must test binds === 'load', not !circuitLimited. That confusion
       is correctness fix 2. */
    circuitLimited: binds === 'circuit',
    /* circ.why is appended whether or not the circuit is known. When it IS
       known-from-the-record, the caveat it carries — our own holds are not
       netted out of that figure — is the most important thing on the line, and
       an earlier draft dropped it precisely when it applied. */
    why: why + (circ.why ? ' — ' + circ.why : '')
  };
}

/* ── SCORING ────────────────────────────────────────────────────────────────
   A term is { key, label, points, max, scored, why }.

     max      what this term is worth under the weights in force
     scored   false when the inputs to judge it do not exist. An unscored term
              contributes to neither the numerator nor the denominator.
     points   0 on an unscored term; 0 on a scored term that earned nothing.
              Those are different states and the card must be able to say which.
     why      one line, with the numbers, for the rep and for the customer. */

function scoredTerm(key, w, points, why) {
  return { key: key, label: w.label, note: w.note || '',
    points: Math.max(0, points), max: w.pts, scored: true, why: why };
}
function unscoredTerm(key, w, why) {
  return { key: key, label: w.label, note: w.note || '',
    points: 0, max: w.pts, scored: false, why: why };
}

/* Linear to a cap: full marks at `cap`, pro rata below it. A cap of 0 means the
   term is an award, not a ramp, and must not be run through here. */
function ramp(value, w) {
  if (!(w.cap > 0)) return 0;
  return Math.min(value / w.cap, 1) * w.pts;
}

function assemble(terms, penalty, penaltyWhy, grain) {
  var score = 0, outOf = 0, total = 0, unscored = [], i, t;
  for (i = 0; i < terms.length; i++) {
    t = terms[i];
    total += t.max;
    if (t.scored) { score += t.points; outOf += t.max; }
    else unscored.push(t.key);
  }

  /* The penalty discounts the SCORE and never the denominator: a modelled input
     is a confidence discount, not a term that could not be assessed. Same for
     the grain factor. */
  var raw = score;
  score = score * penalty * grain;

  var whys = [];
  if (unscored.length) {
    whys.push(fmt(total - outOf) + ' of ' + fmt(total) +
      ' points could not be assessed (' + unscored.join(', ') + ')');
  }
  if (penalty !== 1 && penaltyWhy) whys.push(penaltyWhy);
  if (grain !== 1) whys.push('capacity read at a coarse grain, discounted to ' + grain);

  return {
    score: Math.round(score),
    /* Display `score` against `outOf`. Do NOT rank on score/outOf — see the
       header. A site with one assessable term would top the board at 10/10. */
    outOf: Math.round(outOf),
    total: Math.round(total),
    rawScore: Math.round(raw),
    penalty: penalty,
    grain: grain,
    unscored: unscored,
    capped: unscored.length > 0 || penalty !== 1 || grain !== 1,
    cappedWhy: whys.length ? whys.join('; ') : null,
    terms: terms
  };
}

/* Provenance discount, shared by both plays' callers. Returns 1 when the load
   is measured or when there is no load figure at all.

   THE ASYMMETRY IS DELIBERATE AND IS NOT A BUG: a row with NO annual kWh takes
   no penalty, while a row with a modelled one takes 0.85. That looks backwards
   until you notice the row with no kWh has already lost the entire 20-point peak
   term from its numerator and had its denominator cut to match. Applying the
   penalty as well would charge the same missing fact twice. The row that knows
   nothing is punished by not scoring, not by a multiplier. */
function provenancePenalty(row, weights) {
  var a = row && row.annualKwh;
  if (!a || num(a.value) === null) return { p: 1, why: null };
  var src = a.src ? String(a.src) : 'unstated';
  if (src === 'metered') return { p: 1, why: null };
  var p = num(weights.modelledPenalty);
  if (p === null || p < 0 || p === 1) return { p: 1, why: null };
  return { p: p, why: 'load is ' + src + ', not metered — score discounted to ' +
    Math.round(p * 100) + '%' };
}

/* ── THE BATTERY PLAY ───────────────────────────────────────────────────────
   Weighted on what can actually be delivered and sold, not on how big the
   building is. A large load on a full circuit is not a deal, and neither is an
   empty circuit next to a small load.

   Reads, from an enriched row: row.sz (a combine() result), row.peakKw,
   row.circ (a circuit state), row.type, row.annualKwh. scoreRow() assembles all
   of those; this function is separate so a caller holding an already-enriched
   row can rescore it under different weights without re-deriving anything. */
function scoreBattery(row, weights, opts) {
  row = row || {};
  opts = opts || {};
  var W = mergeWeights(weights);
  var B = W.battery;
  var sz = row.sz || row.size || null;
  var circ = row.circ || row.circuit || null;
  var terms = [];

  /* 1 — deliverable kW */
  if (sz && sz.kw !== null && sz.kw !== undefined) {
    terms.push(scoredTerm('deliverable', B.deliverable, ramp(sz.kw, B.deliverable),
      fmt(sz.kw) + ' kW deliverable against a ' + fmt(B.deliverable.cap) +
      ' kW full-marks cap' + (sz.why ? ' — ' + sz.why : '')));
  } else {
    terms.push(unscoredTerm('deliverable', B.deliverable,
      'nothing can be delivered here that we can name: ' +
      ((sz && sz.why) || 'no load and no circuit')));
  }

  /* 2 — the customer's peak. CORRECTNESS FIX 1 lives here: in ComEd territory
     this is almost always unscorable, and the denominator has to say so. */
  var peak = num(row.peakKw);
  if (peak !== null && peak > 0) {
    terms.push(scoredTerm('peak', B.peak, ramp(peak, B.peak),
      fmt(peak) + ' kW estimated peak against a ' + fmt(B.peak.cap) + ' kW cap'));
  } else {
    terms.push(unscoredTerm('peak', B.peak,
      (row.loadReason || 'no building load could be established for this record') +
      ' — there is nothing to size a demand-charge deal against yet'));
  }

  /* 3 — room left on the circuit */
  var sellable = circ && circ.known ? nonNegative(circ.sellable) : null;
  if (sellable !== null) {
    terms.push(scoredTerm('headroom', B.headroom, ramp(sellable, B.headroom),
      fmt(sellable) + ' kW left on the circuit against a ' + fmt(B.headroom.cap) + ' kW cap'));
  } else {
    terms.push(unscoredTerm('headroom', B.headroom,
      'no hosting-capacity record for this circuit'));
  }

  /* 4 — CORRECTNESS FIX 2. The award is for a KNOWN load ceiling sitting below a
     KNOWN circuit ceiling. binds "circuit" earns nothing; binds "unknown" is not
     an answer and is not scored. The old code awarded the full 10 points to a
     site with neither fact, because circuitLimited is false for "unknown". */
  var binds = sz ? sz.binds : 'unknown';
  /* AND THE SECOND HALF OF THE SAME FIX. binds is "load" in two different
     situations: the load ceiling sits below a KNOWN circuit ceiling, and there
     is no circuit ceiling at all — sizeAt() reports "load" for both, because
     for a SIZING question the answer is the same number either way. For a
     SCORING question it is not: an award that says the wire is not the
     constraint, handed out for a site where nothing about the wire is known,
     is the same unknown-scored-as-a-fact that fix 2 was about. This is the
     common shape in ComEd territory — a listing with floor area that never
     joined to a circuit — so it was worth 10 free points on a large number of
     rows. The ceiling has to be known for the comparison to mean anything. */
  var ceilingKnown = !!(sz && sz.circuitCeiling !== null && sz.circuitCeiling !== undefined);
  if (binds === 'load' && ceilingKnown) {
    terms.push(scoredTerm('notCapped', B.notCapped, B.notCapped.pts,
      'the customer’s load is the constraint, not the wire — ' +
      fmt(sz.circuitCeiling) + ' kW is left on the circuit'));
  } else if (binds === 'load') {
    terms.push(unscoredTerm('notCapped', B.notCapped,
      'no circuit capacity is attributed to this site, so we cannot say the ' +
      'wire is not the constraint'));
  } else if (binds === 'circuit') {
    terms.push(scoredTerm('notCapped', B.notCapped, 0,
      'the circuit is the constraint — this site is capped by the wire'));
  } else {
    terms.push(unscoredTerm('notCapped', B.notCapped,
      'which ceiling binds is unknown, so neither can be credited'));
  }

  /* 5 — use class */
  var type = row.type ? String(row.type) : '';
  if (type) {
    var hit = BATTERY_USE.test(type);
    terms.push(scoredTerm('useType', B.useType,
      hit ? B.useType.pts : Math.round(B.useType.pts * BATTERY_USE_CONSOLATION),
      hit ? type + ' is the use class this play wants'
          : type + ' is not an industrial class — partial credit only'));
  } else {
    terms.push(unscoredTerm('useType', B.useType, 'no use class on this record'));
  }

  var pen = provenancePenalty(row, W);
  return assemble(terms, pen.p, pen.why, grainFactor(row, opts));
}

/* ── THE LARGE-LOAD PLAY ────────────────────────────────────────────────────
   A site to BUILD on. It wants raw megawatts and land, and it does not care
   about the existing peak at all — which is also why no provenance penalty
   applies here: nothing in this score is derived from a modelled building load.
   An empty industrial parcel scores near zero as a battery deal and near the top
   as a data-centre site, and that is the point of keeping the two separate. */
function scoreLoad(row, weights, opts) {
  row = row || {};
  opts = opts || {};
  var W = mergeWeights(weights);
  var L = W.load;
  var circ = row.circ || row.circuit || null;
  var terms = [];

  /* 1 — raw headroom */
  var sellable = circ && circ.known ? nonNegative(circ.sellable) : null;
  if (sellable !== null) {
    terms.push(scoredTerm('headroom', L.headroom, ramp(sellable, L.headroom),
      fmt(sellable) + ' kW available against a ' + fmt(L.headroom.cap) + ' kW cap'));
  } else {
    terms.push(unscoredTerm('headroom', L.headroom,
      'no hosting-capacity record for this circuit — the one number this play is about'));
  }

  /* 2 — land. UNKNOWN IS NOT ZERO: the old code read a null acreage as 0 acres
     and scored it out of the full denominator. A parcel with no recorded acreage
     is not a small parcel. */
  var acres = num(row.lotAcres);
  if (acres !== null && acres >= 0) {
    terms.push(scoredTerm('land', L.land, ramp(acres, L.land),
      fmtFine(acres) + ' acres against a ' + fmtFine(L.land.cap) + '-acre cap'));
  } else {
    terms.push(unscoredTerm('land', L.land, 'no lot acreage on this record'));
  }

  /* 3 — use class */
  var type = row.type ? String(row.type) : '';
  if (type) {
    var hit = LOAD_USE.test(type);
    terms.push(scoredTerm('useType', L.useType,
      hit ? L.useType.pts : Math.round(L.useType.pts * LOAD_USE_CONSOLATION),
      hit ? type + ' will accept a large load'
          : type + ' is not the zoning this play wants — partial credit only'));
  } else {
    terms.push(unscoredTerm('useType', L.useType, 'no use class on this record'));
  }

  /* 4 — existing service. UNKNOWN IS NOT ZERO, and here it matters commercially:
     only the EDC listing feed carries kVA. A harvested CS_CI parcel never does,
     so the old code docked ten points from every parcel in the territory for a
     fact nobody ever collected — scoring our own harvest, not the site. */
  var svc = row.service;
  var kva = svc && typeof svc === 'object' ? num(svc.kva) : null;
  if (kva !== null) {
    var big = kva >= LARGE_SERVICE_KVA;
    terms.push(scoredTerm('service', L.service, big ? L.service.pts : 0,
      fmt(kva) + ' kVA already at the site' +
      (big ? '' : ' — under the ' + fmt(LARGE_SERVICE_KVA) +
        ' kVA line, so a service upgrade comes first')));
  } else {
    terms.push(unscoredTerm('service', L.service,
      'no service record for this site — not collected, not absent'));
  }

  return assemble(terms, 1, null, grainFactor(row, opts));
}

/* ── HOST-LOAD CAPACITY BANDS ───────────────────────────────────────────────
   The filter the Site Finder has today is a free numeric minimum kW, defaulting
   to 250. That works for one rep who knows the number they want and is useless
   for targeting: "show me the megawatt sites" is not a number, it is a band, and
   a band is what a saved search, a chip in a filter bar and a count in a header
   can all be built on.

   THE BOUNDARIES ARE WHERE THE CONVERSATION CHANGES, not round numbers for their
   own sake:

     under 250 kW   below the tool's existing default minimum. Too small to carry
                    its own interconnection and soft costs as a standalone C&I
                    demand-charge deal; kept as a band rather than hidden because
                    a rep working a portfolio or a multi-site host still wants to
                    see them.
     250–500 kW     one cabinet-class system. A single demand-charge deal, one
                    signature, the simplest study ComEd runs.
     500 kW–1 MW    the core C&I band: a container or a small bank, and the range
                    the product ladder in api/_lib/product-fit.js is happiest in.
     1–2.5 MW       a dedicated interconnection study and a different customer —
                    the facilities director stops being the decision maker.
     2.5–5 MW       front-of-meter-scale on a distribution circuit. Land, a pad
                    and a real site plan, not a yard.
     5 MW and up    large-load / data-centre territory. This is where the second
                    score (scoreLoad) leads and the battery score stops being the
                    thing the rep is reading.

   `min` is inclusive, `max` exclusive, and `max: null` is the open top. kw === 0
   is a KNOWN zero — a taken circuit — and lands in the bottom band; kw === null
   is unknown and gets its own band, because a site we have not established is
   not a small site. */
var BANDS = [
  { key: 'unknown',     label: 'Capacity not established', min: null, max: null },
  { key: 'under_250kw', label: 'Under 250 kW',             min: 0,    max: 250 },
  { key: '250_500kw',   label: '250–500 kW',          min: 250,  max: 500 },
  { key: '500kw_1mw',   label: '500 kW – 1 MW',       min: 500,  max: 1000 },
  { key: '1_2_5mw',     label: '1 – 2.5 MW',          min: 1000, max: 2500 },
  { key: '2_5_5mw',     label: '2.5 – 5 MW',          min: 2500, max: 5000 },
  { key: '5mw_plus',    label: '5 MW and up',              min: 5000, max: null }
];

function band(kw) {
  var v = num(kw);
  if (v === null) return BANDS[0];
  var i, b;
  for (i = 1; i < BANDS.length; i++) {
    b = BANDS[i];
    if (v >= b.min && (b.max === null || v < b.max)) return b;
  }
  /* Negative kW cannot arrive from combine(), which clamps at zero, but a caller
     may band a raw number. An oversubscribed circuit is not an unknown one. */
  return BANDS[1];
}

/* ── ONE ROW, ASSEMBLED ─────────────────────────────────────────────────────
   The order matters and it is the order enrich() used: model the load, size
   against the circuit, then score what came out. Anything that failed upstream
   travels as a reason rather than as a zero.

   The returned object deliberately carries `score` and `loadScore` alongside the
   full breakdowns. Those are the two keys the Site Finder's sort table already
   uses, so the wiring pass swaps its local score() for this response without
   touching the sort. */
function scoreRow(row, circuit, weights, opts) {
  row = row || {};
  opts = opts || {};

  var load = modelLoad(row, opts);
  var size = combine(row, circuit, {
    hours: opts.hours,
    loadKw: opts.loadKw,
    load: load
  });

  /* The shape scoreBattery/scoreLoad read. Built here rather than mutating the
     caller's row: a scoring pass that edits its input is how a re-score under
     different weights silently reads last pass's numbers. */
  var enriched = {
    type: row.type,
    lotAcres: row.lotAcres,
    service: row.service,
    annualKwh: load.annualKwh,
    peakKw: load.peakKw,
    loadReason: load.reason,
    circ: circuit && circuit.known === true && num(circuit.sellable) !== null ? circuit
        : (size.circuitSrc === 'record'
            ? { known: true, sellable: size.circuitCeiling, feederId: row.feederId || null,
                fromRecord: true }
            : { known: false, sellable: null, feederId: row.feederId || null }),
    sz: size
  };

  var battery = scoreBattery(enriched, weights, opts);
  var largeLoad = scoreLoad(enriched, weights, opts);

  return {
    id: row.id != null ? row.id : null,
    addr: row.addr || '',
    feederId: row.feederId || null,
    load: load,
    size: size,
    band: band(size.kw),
    battery: battery,
    largeLoad: largeLoad,
    score: battery.score,
    loadScore: largeLoad.score
  };
}

module.exports = {
  WEIGHT_DEFAULTS: WEIGHT_DEFAULTS,
  EUI: EUI,
  EUI_LF: EUI_LF,
  BANDS: BANDS,
  modelLoad: modelLoad,
  combine: combine,
  circuitCeiling: circuitCeiling,
  scoreBattery: scoreBattery,
  scoreLoad: scoreLoad,
  band: band,
  scoreRow: scoreRow,
  /* Exported so a caller can normalise an org's stored weights once and reuse
     them across a page of rows, and so a test can assert the merge. */
  mergeWeights: mergeWeights,
  grainFactor: grainFactor,
  /* The constants the surfaces have to be able to quote. */
  SHAVABLE_FRACTION: SHAVABLE_FRACTION,
  KBTU_PER_KWH: KBTU_PER_KWH,
  LARGE_SERVICE_KVA: LARGE_SERVICE_KVA
};
