/* ═══════════════════════════════════════════════════════════════════════════════
   /api/compute-lease.js — the compute site gate set, the tranche, and the offer
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   ─────────────────────────────────────────────────────────────────────────────
   WHAT THIS ANSWERS
   ─────────────────────────────────────────────────────────────────────────────
   A rep types an address. This says three things back:

     1 · Does the site clear the four gates — power, fiber, zoning, site control
     2 · Which tranche the host belongs in (1 simple lease / 2 engaged /
         3 passive owner selling the meter), or exactly which questions are
         still missing before it can be said
     3 · What the rep may offer that host as a land lease — a range, per month
         and per year, over a 15-year term

   ─────────────────────────────────────────────────────────────────────────────
   WHY IT IS A FUNCTION AND NOT PART OF THE PAGE
   ─────────────────────────────────────────────────────────────────────────────
   CLAUDE.md, "IP protection — where logic lives": pricing, scoring and
   eligibility run in /api/. The RATE_CARD below is the commercial position of
   the business — what ClearSky is willing to pay a site host per kW and per
   acre. Shipped in a single-file tool it would be readable by every tenant,
   by every host the rep sends a proposal to, and by anybody who opens the
   network tab. It lives here, the page collects inputs and renders the answer,
   and a caller with no entitlement gets a 403 rather than a hidden button.

   ─────────────────────────────────────────────────────────────────────────────
   WHY THE BROWSER FANS OUT AND THIS ONLY SCORES
   ─────────────────────────────────────────────────────────────────────────────
   The obvious shape is for this function to call /api/grid-atlas,
   /api/network-proximity and /api/parcel itself. It deliberately does not.

   network-proximity is time-boxed at 55 s against six external sources, under
   the 60 s serverless ceiling. Nesting that inside another function puts two
   timeouts in series under one ceiling: the outer one dies first and the rep
   is told nothing rather than told about the two gates that did answer. So the
   page calls the three evidence services in parallel — each shows its own gate
   filling in, which is better to watch anyway — and posts the EVIDENCE here.
   The model, the weights, the rate card and the tranche rule are here; the
   lookups stay where they already work.

   The evidence is therefore caller-supplied, which is fine and is the same
   trust boundary /api/score.js already documents: the tenant's own rep is not
   an adversary, and the thing worth protecting is the rate card, not the
   distance to a substation that anyone can measure on a public map.

   ─────────────────────────────────────────────────────────────────────────────
   ⚠ THE RATE CARD IS A SEED, NOT A COMP SET
   ─────────────────────────────────────────────────────────────────────────────
   The bands below are a defensible build-up, not verified market comparables.
   They are in one block, at the top, versioned, and echoed in every response
   under `offer.rateCard` so a proposal can always be traced to the numbers
   that produced it. Replace them with real comps before they are quoted as
   ClearSky's position, and bump RATE_CARD.version when you do — a proposal in
   somebody's inbox has to be attributable to a version.

   ENVIRONMENT VARIABLES — none. This function does no network I/O.
   ═══════════════════════════════════════════════════════════════════════════════ */
'use strict';

var auth = require('./_lib/verify-token');

/* Bumped whenever this file changes. Stamped into every response including
   errors, for the same reason grid-atlas.js carries one: the last round of
   confusion was entirely "which version of this is actually running". */
var BUILD = '2026-09-18.compute-lease-v2.capture';

/* ═══════════════════════════════════════════════════════════════════════════
   THE RATE CARD  ⚠ seed values — see the header
   ═══════════════════════════════════════════════════════════════════════════

   The lease is built from two components because a site host recognises two
   different things, and pricing on only one of them loses the argument:

     PAD RENT       what a landowner already understands. Ground rent on the
                    fenced area, priced as a commercial/industrial pad site
                    rather than as farmland, because that is the zoning the
                    gate set requires. It floors the deal: a 20-ft container
                    is a tiny footprint and an acreage-only price on it comes
                    out at a number no host would sign.

     CAPACITY RENT  what the host is actually selling. The scarce thing is not
                    the dirt, it is an energised service the utility will serve
                    at ≥ 1 MW with a meter behind it. Priced per kW-year of
                    contracted load, which is also the unit the host's own
                    utility bill is in, so the conversation stays in familiar
                    units.

   Both are bands. low / base / high become the offer range the rep carries
   into the room: open at base, hold at low, go to high only for a site that
   earns it.
*/
var RATE_CARD = {
  version: 'compute-lease-rate-card-v1',
  asOf: '2026-09-18',

  /* $ per kW-year of contracted load. At the 1 MW gate that is $30k–$90k/yr
     before adjustments. Build-up: a ground lease that eats more than a few
     percent of gross project revenue does not finance, and the energy stack
     these sites lean on is cited internally at $30/kW-summer for PJM capacity
     alone — the host's slice sits above that floor and below the point where
     the compute SPE's PPA stops clearing. */
  capacityPerKwYear: { low: 30, base: 55, high: 90 },

  /* $ per acre-year of leased ground, commercial/industrial pad. Above
     utility-solar farmland rent ($500–$2,000/acre-yr) because this is a
     serviced commercial parcel and a small carve-out, which always prices
     higher per acre than a 200-acre block. */
  padPerAcreYear: { low: 3000, base: 5000, high: 8000 },

  /* Nobody leases 0.02 acres. A single 20-ft container needs its pad, its
     clearances, a transformer pad and an access path, and the carve-out on
     the survey is what gets leased. Half an acre is the smallest parcel this
     model will price. */
  minLeasedAcres: 0.5,

  /* Below this a lease is not worth the host's signature, our legal cost or
     the title work. A site that prices under the floor is priced AT the floor
     and flagged, not quietly rounded up. */
  floorMonthly: 750,

  /* The host gives more as the tranche rises, so the host gets more.
       1 · space + power + fiber, minimal education. Plain ground lease.
       2 · engaged host, open to canopies / solar / storage on their asset.
       3 · passive owner handing over the meter and operational control. */
  tranchePremium: { 1: 1.00, 2: 1.15, 3: 1.35 },

  /* Annual escalator offered on the lease. Under typical utility escalation
     on purpose — the host's upside is the term and the improvements, not an
     escalator that outruns the project. */
  escalatorPct: { low: 2.0, base: 2.5, high: 3.0 },

  termYears: 15,

  /* Fiber lateral construction, $/mile. Identical band to the one
     /api/network-proximity already reports, deliberately: two numbers for one
     trench is how a proposal and a screen come to disagree. */
  lateralPerMile: { low: 45000, high: 250000 },

  /* A lateral is project capex. Amortised straight-line over the term it
     comes out of what is left for rent — but it is capped, because a site
     whose lateral eats the whole lease is a site that fails the fiber gate,
     not a site with a rent of zero. */
  lateralMaxShareOfRent: 0.35,

  /* Site quality moves the offer inside a deliberately narrow band. The gates
     decide whether there is a deal at all; quality decides where in the range
     it opens. A multiplier wide enough to swing the answer would be the model
     pretending to a precision it does not have. */
  qualityAdj: { min: 0.80, max: 1.15 }
};

/* ═══════════════════════════════════════════════════════════════════════════
   GATE 1 · POWER
   ═══════════════════════════════════════════════════════════════════════════
   The requirement is ~1 MW of available power with a utility will-serve, or a
   clear path to one. Two very different things feed it:

     · what the REP was told — available MW and the will-serve state. This is
       authoritative. A utility letter beats any map.
     · what GRID ATLAS measured — distance to a substation and its voltage
       class. This is proximity, NOT hosting capacity, and the client file
       says so in as many words. It is scored as a secondary signal and can
       never turn an unconfirmed will-serve into a confirmed one.

   The distinction is the whole point. A 138 kV substation across the road
   tells you an upgrade is buildable; it does not tell you the feeder has a
   megawatt left on it. Only the utility knows that.
*/
var MIN_MW = 1;

function gatePower(rep, ev) {
  var basis = [], asks = [], score = null, status = 'unconfirmed';
  var mw = num(rep.availableMw);
  var willServe = str(rep.willServe) || 'unknown';   /* confirmed|requested|none|unknown */
  var ga = ev.gridAtlas || null;
  var utility = str(rep.utility);
  var territory = str(rep.serviceTerritory);
  var existingKw = num(rep.existingDemandKw);
  var xfmrKva = num(rep.transformerKva);

  /* The measured half, first, because it is true whatever the rep knows. */
  var subKm = ga && num(ga.nearestSubKm);
  var maxKv = ga && num(ga.maxKv);
  if (subKm != null) {
    basis.push('Nearest substation ' + round(subKm, 1) + ' km'
      + (maxKv ? ' · ' + maxKv + ' kV in range' : ' · voltage not published'));
  } else if (ga) {
    basis.push('Grid Atlas ran but found no substation in range — interconnection is a build, not a tap.');
  } else {
    basis.push('Grid Atlas has not run for this point.');
  }

  /* The told half. */
  if (willServe === 'confirmed' && mw != null && mw >= MIN_MW) {
    status = 'pass';
    basis.push('Utility will-serve confirmed at ' + round(mw, 2) + ' MW.');
  } else if (mw != null && mw < MIN_MW) {
    status = 'fail';
    basis.push('Host reports ' + round(mw, 2) + ' MW available — under the ' + MIN_MW + ' MW gate.');
    asks.push('Ask whether the ' + round(mw, 2) + ' MW is the meter today or the service size. '
            + 'An upgrade path to 1 MW keeps the site alive; a hard ceiling does not.');
  } else if (willServe === 'none') {
    status = 'fail';
    basis.push('Utility has declined to serve at this point.');
  } else {
    status = 'unconfirmed';
    if (mw != null) basis.push('Host reports ' + round(mw, 2) + ' MW available, will-serve '
      + (willServe === 'requested' ? 'requested and pending' : 'not yet requested') + '.');
    else basis.push('Available power not captured.');
    asks.push('Get the available load in kW or MW at the meter, and the will-serve status.');
    if (willServe !== 'requested') asks.push('Open a will-serve request with the utility — it is the long pole and it is free.');
  }

  /* The utility and the ISO/RTO. Not scored, because naming your utility does
     not make the feeder any emptier — but it is the field that decides which
     revenue stack the site gets underwritten against, so a site without it is
     a site nobody downstream can model. */
  if (utility || territory) {
    basis.push('Served by ' + (utility || 'an unnamed utility')
      + (territory ? ' in ' + territory : '') + '.');
  } else {
    asks.push('Get the utility and the service territory (PJM, CAISO/PG&E, FPL, ComEd, ERCOT). '
            + 'It drives the revenue stack, not just the interconnection.');
  }
  if (existingKw != null) basis.push('Existing demand at the meter ' + fmt(existingKw) + ' kW.');
  if (xfmrKva != null) basis.push('Transformer ' + fmt(xfmrKva) + ' kVA.');

  /* Score. Will-serve dominates because it is the only thing that settles the
     question; grid proximity is a fifth of the weight and never more. */
  var served = willServe === 'confirmed' ? 100 : willServe === 'requested' ? 55 : willServe === 'none' ? 0 : 35;
  var sized = mw == null ? 40 : mw >= 5 ? 100 : mw >= 2 ? 90 : mw >= MIN_MW ? 75 : Math.max(0, Math.round(mw / MIN_MW * 50));
  var prox = ga && ga.score != null ? clamp(num(ga.score), 0, 100) : null;
  score = prox == null
    ? Math.round(served * 0.6 + sized * 0.4)
    : Math.round(served * 0.5 + sized * 0.3 + prox * 0.2);

  return { key: 'power', label: 'Power', status: status, score: score,
    headline: status === 'pass' ? 'Will-serve confirmed at ' + round(mw, 2) + ' MW'
            : status === 'fail' ? 'Under the ' + MIN_MW + ' MW gate'
            : 'Available power not confirmed',
    basis: basis, asks: asks,
    measured: 'Grid Atlas measures proximity to substations and transmission. It does not '
            + 'measure hosting capacity — only the utility can answer how many kW the feeder has left.' };
}

/* ═══════════════════════════════════════════════════════════════════════════
   GATE 2 · FIBER  — THE HARD GATE
   ═══════════════════════════════════════════════════════════════════════════
   1 Gbps bidirectional. A site without it is not a compute site regardless of
   how good the power is; the five-acre Illinois site failed on exactly this
   and the gate set has held ever since.

   Two ways to clear it, and the rep's is better than ours:

     · SERVICE ON SITE TODAY at ≥ 1 Gbps symmetric, with a bill to prove it.
       That is the gate, cleared, and no map beats it.
     · NO SERVICE, but the public record says fiber is there to be reached.
       /api/network-proximity's verdict — likely / plausible / uncertain /
       unlikely — with its lateral estimate. This is a PATH to the gate, not
       the gate, and the rent carries the cost of the trench.
*/
var MIN_FIBER_MBPS = 1000;

function gateFiber(rep, ev) {
  var basis = [], asks = [], status = 'unconfirmed', score = null;
  var onSite = str(rep.fiberOnSite) || 'unknown';     /* yes|no|unknown */
  var down = num(rep.fiberDownMbps), up = num(rep.fiberUpMbps);
  var monthly = num(rep.fiberMonthlyCost);
  var provider = str(rep.fiberProvider);
  var lateralQuote = num(rep.fiberLateralQuote);
  var np = ev.network || null;
  var verdict = np && np.verdict ? String(np.verdict) : null;
  var lateral = np && np.lateral ? np.lateral : null;
  var symmetricGig = down != null && up != null && down >= MIN_FIBER_MBPS && up >= MIN_FIBER_MBPS;

  if (onSite === 'yes' && symmetricGig) {
    status = 'pass';
    basis.push('Service on site: ' + down + ' / ' + up + ' Mbps symmetric — clears the 1 Gbps bidirectional gate.');
    if (monthly != null) basis.push('Host pays $' + fmt(monthly) + '/mo today.');
    else asks.push('Get the current monthly data cost, or a budgetary quote to bring service to the pad.');
  } else if (onSite === 'yes' && (down != null || up != null)) {
    status = 'unconfirmed';
    basis.push('Service on site but ' + (down || '?') + ' / ' + (up || '?') + ' Mbps — short of 1 Gbps bidirectional.');
    asks.push('Ask the incumbent what an upgrade to 1 Gbps symmetric costs at this address. '
            + 'On an existing lit building it is usually a port change, not a build.');
  } else if (onSite === 'yes') {
    status = 'unconfirmed';
    basis.push('Host says fiber is on site but the speeds are not captured.');
    asks.push('Get the provider, the down/up speed and the monthly cost — a photo of the bill is enough.');
  } else if (onSite === 'no') {
    basis.push('No service on site today.');
  }

  /* The carrier's name. "There is fiber here" is not a carrier commitment and
     cannot be chased by anybody who was not in the room. */
  if (provider) basis.push('Provider: ' + provider + '.');
  else if (onSite === 'yes') asks.push('Get the carrier\'s name. "There is fiber" is not something '
    + 'a second person can follow up on.');

  /* A budgetary quote beats our per-mile estimate and the offer uses it
     directly — see buildOffer. Without one, the trench in the rent is a guess
     at our own cost. */
  if (lateralQuote != null) {
    basis.push('Budgetary quote to bring service in: $' + fmt(lateralQuote) + '.');
  } else if (onSite === 'no') {
    asks.push('Get a budgetary quote to bring service to the pad. The lease carries the amortised '
            + 'lateral, so an estimate here is an estimate in the rent.');
  }

  /* The public record, always reported, whether or not the rep answered. */
  if (verdict) {
    var lat = lateral && lateral.mi != null
      ? ' Nearest hard evidence ' + round(lateral.mi, 2) + ' mi'
        + (lateral.costLow != null ? ' — lateral $' + fmt(lateral.costLow) + '–$' + fmt(lateral.costHigh) + '.' : '.')
      : '';
    basis.push('Network Proximity: fiber ' + verdict + '.' + lat);
    if (status === 'unconfirmed' || onSite !== 'yes') {
      if (verdict === 'likely')       status = onSite === 'no' ? 'conditional' : status;
      else if (verdict === 'unlikely' && onSite === 'no') status = 'fail';
      else if (verdict === 'plausible' && onSite === 'no') status = 'conditional';
    }
    if (np.reasons && np.reasons.length) basis.push(np.reasons.slice(0, 2).join('; ') + '.');
  } else {
    basis.push('Network Proximity has not run for this point.');
  }

  if (status !== 'pass') {
    asks.push('Confirm 1 Gbps bidirectional in writing from a carrier before this site is referred. '
            + 'This is the hard gate — power does not compensate for it.');
  }

  /* Score. A bill on the table is worth more than any verdict. */
  if (status === 'pass') score = 100;
  else {
    var vs = verdict === 'likely' ? 80 : verdict === 'plausible' ? 60
           : verdict === 'uncertain' ? 35 : verdict === 'unlikely' ? 10 : null;
    var os = onSite === 'yes' ? 70 : onSite === 'no' ? 15 : 35;
    score = vs == null ? os : Math.round(vs * 0.6 + os * 0.4);
  }

  return { key: 'fiber', label: 'Fiber', status: status, score: score, hardGate: true,
    headline: status === 'pass' ? '1 Gbps symmetric on site'
            : status === 'fail' ? 'Fiber unlikely and none on site'
            : status === 'conditional' ? 'Reachable — a lateral, not a build'
            : 'Fiber not confirmed',
    basis: basis, asks: asks,
    lateral: lateral || null,
    lateralQuote: lateralQuote,
    provider: provider || null,
    measured: 'Fiber is the hard gate. A site that cannot show 1 Gbps bidirectional is not a '
            + 'compute site, however good the power is.' };
}

/* ═══════════════════════════════════════════════════════════════════════════
   GATE 3 · ZONING
   ═══════════════════════════════════════════════════════════════════════════
   Commercial or industrial on the exact area where the containers would sit —
   not the parcel's headline zoning, and not the neighbour's. /api/parcel
   returns whatever code the county publishes; the codes are local and there
   are thousands of them, so this classifies on the prefix conventions that
   hold nearly everywhere and says "unrecognised" rather than guessing when
   they do not.
*/
var ZONE_PATTERNS = [
  { cls: 'industrial',  re: /\b([IM]-?\d|IND|INDUS|MANUF|LIGHT\s*IND|HEAVY\s*IND|IL|IH|IG|MU?-?I)\b/i },
  { cls: 'commercial',  re: /\b(C-?\d|COM|COMM|COMMERC|B-?\d|BUS|BUSINESS|RETAIL|CBD|GC|HC|NC|PB|OFFICE|O-?\d)\b/i },
  { cls: 'mixed',       re: /\b(MU|MIXED|PUD|PD|PLANNED|TOD)\b/i },
  { cls: 'agricultural',re: /\b(A-?\d|AG|AGR|AGRI|RURAL|FARM)\b/i },
  { cls: 'residential', re: /\b(R-?\d|RES|RESID|SFR|MFR|RM|RS|RR)\b/i }
];

function classifyZoning(code) {
  var s = str(code);
  if (!s) return null;
  for (var i = 0; i < ZONE_PATTERNS.length; i++) if (ZONE_PATTERNS[i].re.test(s)) return ZONE_PATTERNS[i].cls;
  return 'unrecognised';
}

function gateZoning(rep, ev) {
  var basis = [], asks = [], status = 'unconfirmed', score = null;
  var parcel = ev.parcel || null;
  var repClass = str(rep.zoningClass);                 /* commercial|industrial|mixed|agricultural|residential|other */
  var repCode = str(rep.zoningCode);
  var code = repCode || (parcel && str(parcel.zoning)) || '';
  var cls = repClass || classifyZoning(code);
  var useStatus = str(rep.zoningUseStatus);            /* permitted|conditional|prohibited */
  var ahj = str(rep.jurisdiction);

  if (parcel && parcel.zoning) basis.push('County record: ' + parcel.zoning
    + (parcel.county ? ' (' + parcel.county + ')' : '') + '.');
  else if (parcel) basis.push('Parcel found but the county layer publishes no zoning code'
    + (parcel.county ? ' (' + parcel.county + ')' : '') + '.');
  else basis.push('No parcel record returned for this point.');
  if (repCode && parcel && parcel.zoning && repCode.toUpperCase() !== String(parcel.zoning).toUpperCase())
    basis.push('Rep entered ' + repCode + ', which differs from the county record — the rep’s value is used.');

  if (cls === 'industrial' || cls === 'commercial') {
    status = 'pass';
    basis.push(cap(cls) + ' zoning — the gate case, no rezoning expected.');
    score = cls === 'industrial' ? 100 : 90;
  } else if (cls === 'mixed') {
    status = 'conditional';
    basis.push('Mixed-use or planned development — workable, but the use has to be read against the plan.');
    asks.push('Confirm with the jurisdiction that a containerised data load is a permitted or conditional use here.');
    score = 65;
  } else if (cls === 'agricultural') {
    status = 'conditional';
    basis.push('Agricultural — usually a special or conditional use, which is time, not a refusal.');
    asks.push('Ask the AHJ what a conditional use permit costs and how long it takes. Budget it into the schedule, not the rent.');
    score = 45;
  } else if (cls === 'residential') {
    status = 'fail';
    basis.push('Residential zoning — a commercial data load is not a permitted use and a rezoning is not a screening-stage risk.');
    score = 5;
  } else {
    status = 'unconfirmed';
    basis.push(code ? 'Zoning code "' + code + '" is not one this model recognises.' : 'Zoning not captured.');
    asks.push('Get the zoning of the exact area where the containers would sit — not the parcel headline, '
            + 'and not the neighbour\'s. Flag whether it is commercial or industrial.');
    score = 35;
  }

  /* What the jurisdiction actually said outranks what the code implies. The
     pattern table above reads a string; a planner reads the ordinance. So a
     written "prohibited" fails a parcel the table likes, and a written
     "permitted" retires the conditional-use schedule risk on a PUD or an ag
     parcel. Silence changes nothing — an unasked question is never a failure. */
  if (ahj) basis.push('Jurisdiction / AHJ: ' + ahj + '.');
  if (useStatus === 'prohibited') {
    status = 'fail';
    basis.push('The jurisdiction says a containerised data load is a prohibited use here. '
             + 'That outranks the zoning code.');
    score = 5;
  } else if (useStatus === 'permitted') {
    if (status === 'conditional') {
      status = 'pass';
      basis.push('The jurisdiction confirms the use is permitted — the conditional-use schedule risk is retired.');
      score = Math.max(score, 85);
    } else if (status === 'unconfirmed') {
      status = 'conditional';
      basis.push('The jurisdiction confirms the use is permitted, though the zoning class itself is unrecognised.');
      score = Math.max(score, 70);
    }
  } else if (useStatus === 'conditional') {
    if (status === 'pass') {
      status = 'conditional';
      basis.push('The code reads as the gate case, but the jurisdiction calls this a conditional use. '
               + 'That is schedule, not a refusal.');
      score = Math.min(score, 70);
    }
    asks.push('Ask the AHJ what the conditional use permit costs and how long it takes. '
            + 'Budget it into the schedule, not the rent.');
  } else if (status === 'pass' || status === 'conditional') {
    asks.push('Confirm with the jurisdiction, in writing, whether the use is permitted, conditional '
            + 'or prohibited for the exact area where the containers would sit.');
  }

  return { key: 'zoning', label: 'Zoning', status: status, score: score,
    headline: cls ? cap(cls) + (code ? ' · ' + code : '') : 'Zoning not captured',
    zoningClass: cls || null, zoningCode: code || null,
    useStatus: useStatus || null, jurisdiction: ahj || null,
    basis: basis, asks: asks,
    measured: 'Zoning is read from the county parcel layer where one publishes it. The controlling '
            + 'answer is the jurisdiction\'s, for the exact area where the equipment sits.' };
}

/* ═══════════════════════════════════════════════════════════════════════════
   GATE 4 · SITE CONTROL
   ═══════════════════════════════════════════════════════════════════════════
   Who owns or controls the site, and will they sign. This is the gate a map
   cannot answer: /api/parcel gives the name on the tax roll, and everything
   that matters after that is what the rep heard in the room.

   Term is scored against the 15-year contract this tool prices. A host who
   will sign five years is not a smaller version of the deal — the compute SPE
   cannot finance containers against it.
*/
function gateSiteControl(rep, ev) {
  var basis = [], asks = [], status = 'unconfirmed', score = null;
  var parcel = ev.parcel || null;
  var owner = str(rep.ownerName) || (parcel && str(parcel.owner)) || '';
  var control = str(rep.controlType);                  /* owner|tenant|optionholder|unknown */
  var willing = str(rep.willingToLease) || 'unknown';  /* yes|exploring|no|unknown */
  var term = num(rep.maxTermYears);
  var acres = num(rep.leasedAcres);
  var parcelAcres = parcel && num(parcel.acres);
  var encumbrances = str(rep.encumbrances);

  if (owner) basis.push('Owner of record: ' + owner + (parcel && parcel.apn ? ' · APN ' + parcel.apn : '') + '.');
  else basis.push('No owner name on the public record for this point.');
  if (parcelAcres != null) basis.push('Parcel is ' + round(parcelAcres, 2) + ' acres.');
  if (control) basis.push('Contact is the ' + control + '.');

  if (willing === 'no') {
    status = 'fail';
    basis.push('Host will not sign a land lease.');
  } else if (willing === 'yes' && owner && term != null && term >= RATE_CARD.termYears) {
    status = 'pass';
    basis.push('Willing to sign, term to ' + term + ' years — clears the ' + RATE_CARD.termYears + '-year contract.');
  } else if (willing === 'yes' && term != null && term < RATE_CARD.termYears) {
    status = 'conditional';
    basis.push('Willing to sign but only to ' + term + ' years — short of the ' + RATE_CARD.termYears + '-year term.');
    asks.push('Test a ' + RATE_CARD.termYears + '-year term with renewal options, or an initial term plus two five-year extensions. '
            + 'A short term is not a smaller deal — the containers cannot be financed against it.');
  } else {
    status = willing === 'yes' ? 'conditional' : 'unconfirmed';
    if (willing === 'exploring') basis.push('Host is open to the conversation but has not committed.');
    if (!owner) asks.push('Establish who owns or controls the site and get it in writing.');
    if (term == null) asks.push('Ask what lease term the host would consider. We are pricing ' + RATE_CARD.termYears + ' years.');
    if (willing === 'unknown') asks.push('Ask directly whether they would sign a land lease or space use agreement.');
  }
  if (acres == null) asks.push('Agree the leased area. We price a minimum of ' + RATE_CARD.minLeasedAcres + ' acres — pad, clearances, transformer and access.');

  /* What is already recorded against the parcel. Not scored — an encumbrance
     is rarely fatal — but a lender consent nobody asked about becomes a
     closing delay, and the time to find it is now. */
  if (encumbrances) basis.push('Encumbrances noted: ' + encumbrances + '.');
  else asks.push('Ask what is already recorded against the parcel — mortgage, easements, existing '
               + 'leases, mineral rights. A lender consent found late is a closing delay.');

  var w = willing === 'yes' ? 100 : willing === 'exploring' ? 55 : willing === 'no' ? 0 : 30;
  var t = term == null ? 40 : term >= RATE_CARD.termYears ? 100 : Math.round(term / RATE_CARD.termYears * 70);
  var o = owner ? 100 : 30;
  score = Math.round(w * 0.45 + t * 0.35 + o * 0.20);

  return { key: 'siteControl', label: 'Site control', status: status, score: score,
    headline: status === 'pass' ? 'Willing, ' + term + '-year term'
            : status === 'fail' ? 'Host will not lease'
            : owner ? 'Owner known, commitment open' : 'Control not established',
    owner: owner || null, termYears: term, leasedAcres: acres,
    encumbrances: encumbrances || null,
    basis: basis, asks: asks,
    measured: 'The parcel layer gives the name on the tax roll. Willingness and term come from the '
            + 'rep — there is no data source for whether somebody will sign.' };
}

/* ═══════════════════════════════════════════════════════════════════════════
   THE TRANCHE
   ═══════════════════════════════════════════════════════════════════════════
   Three postures, and the classification is entirely about what the host is
   willing to give — not about how good the site is. A perfect site with a
   landlord who wants rent and nothing else is Tranche 1, and that is a good
   outcome, not a downgrade.

   When the answers are not there this returns tranche null and NAMES the
   questions. A tranche guessed from a good site is worse than no tranche: it
   sets the rep up to open on terms the host never agreed to consider.
*/
function classifyTranche(rep) {
  var openToEnergy = tri(rep.openToEnergyStructure);   /* true|false|null */
  var meter = str(rep.meterPosture);                   /* keep|share|transfer|unknown */
  var engagement = str(rep.hostEngagement);            /* passive|engaged|unknown */
  var missing = [];

  if (meter === 'transfer') {
    return { n: 3, label: 'Tranche 3 · Meter transfer',
      why: 'Host will hand over the meter and operational control. They carry the least and give the most, '
         + 'so they are paid the most — this is the premium position, not the fallback.',
      gives: ['Space', 'Power', 'Fiber', 'The meter', 'Operational control'],
      missing: [] };
  }
  if (openToEnergy === true || meter === 'share') {
    return { n: 2, label: 'Tranche 2 · Energy + compute',
      why: 'Host is engaged and open to a deeper structure — canopies, on-site generation or storage on their asset, '
         + 'or sharing the meter. The lease carries a premium and the improvements are the host\'s upside.',
      gives: ['Space', 'Power', 'Fiber', 'Rights to improve the asset'],
      missing: [] };
  }
  if (openToEnergy === false || engagement === 'passive' || meter === 'keep') {
    return { n: 1, label: 'Tranche 1 · Simple land lease',
      why: 'Host wants rent and nothing else. Space, power and fiber, minimal education, fastest to signature. '
         + 'This is the default and it is a good outcome.',
      gives: ['Space', 'Power', 'Fiber'],
      missing: [] };
  }

  /* Nothing to classify on. Name the three questions rather than guess. */
  missing.push({ field: 'meterPosture',
    ask: 'Would you keep the meter in your name, share it, or hand it over entirely?' });
  missing.push({ field: 'openToEnergyStructure',
    ask: 'Would you be open to us putting solar canopies, generation or storage on the property as part of this?' });
  missing.push({ field: 'hostEngagement',
    ask: 'Do you want to be involved in how the site is run, or do you want a cheque and no phone calls?' });
  return { n: null, label: 'Not yet classifiable',
    why: 'The tranche is about what the host will give, and none of the three questions that settle it have been asked.',
    gives: [], missing: missing };
}

/* ═══════════════════════════════════════════════════════════════════════════
   THE OFFER
   ═══════════════════════════════════════════════════════════════════════════ */

function buildOffer(gates, tranche, rep, ev) {
  var mw = num(rep.availableMw);
  var contractedKw = (mw != null ? mw : MIN_MW) * 1000;
  var acres = Math.max(num(rep.leasedAcres) != null ? num(rep.leasedAcres) : RATE_CARD.minLeasedAcres,
                       RATE_CARD.minLeasedAcres);
  var term = num(rep.termYears) != null ? clamp(num(rep.termYears), 5, 30) : RATE_CARD.termYears;

  /* Quality. The three non-hard gates move the offer inside a narrow band;
     fiber is excluded because it is already priced as the lateral below, and
     charging a site twice for one trench is double counting. */
  var qs = [gates.power.score, gates.zoning.score, gates.siteControl.score]
    .filter(function (v) { return v != null; });
  var qMean = qs.length ? qs.reduce(function (a, b) { return a + b; }, 0) / qs.length : 60;
  var qualityAdj = RATE_CARD.qualityAdj.min
    + (RATE_CARD.qualityAdj.max - RATE_CARD.qualityAdj.min) * (clamp(qMean, 0, 100) / 100);

  /* Tranche premium. Unclassified prices at Tranche 1 — the floor, never the
     premium, so an unasked question can only cost us the upside and never
     over-commit the rep in the room. */
  var trMult = RATE_CARD.tranchePremium[tranche.n] || RATE_CARD.tranchePremium[1];

  /* The lateral, amortised and capped. */
  var lat = gates.fiber.lateral;
  var lateralMi = lat && lat.mi != null ? num(lat.mi) : null;
  var onSiteFiber = gates.fiber.status === 'pass';
  /* A carrier's budgetary quote is used directly; the per-mile band is only
     what we fall back to when nobody has asked one. Quoting a $45k–$250k
     estimate over the top of a real number the host already has in an email
     is how a proposal loses an argument it had already won. */
  var quoted = num(gates.fiber.lateralQuote);
  var lateralCost = onSiteFiber ? 0
    : quoted != null ? quoted
    : lateralMi != null ? lateralMi * ((RATE_CARD.lateralPerMile.low + RATE_CARD.lateralPerMile.high) / 2)
    : 0;
  var lateralAnnualRaw = lateralCost / term;

  var bands = ['low', 'base', 'high'];
  var monthly = {}, annual = {}, termTotal = {}, components = {};
  var flooredBands = [];

  bands.forEach(function (b) {
    var padAnnual = acres * RATE_CARD.padPerAcreYear[b];
    var capAnnual = contractedKw * RATE_CARD.capacityPerKwYear[b];
    var gross = (padAnnual + capAnnual) * qualityAdj * trMult;
    var drag = Math.min(lateralAnnualRaw, gross * RATE_CARD.lateralMaxShareOfRent);
    var net = gross - drag;
    var floored = net < RATE_CARD.floorMonthly * 12;
    if (floored) { net = RATE_CARD.floorMonthly * 12; flooredBands.push(b); }

    annual[b] = Math.round(net);
    monthly[b] = Math.round(net / 12);
    termTotal[b] = Math.round(escalatedTotal(net, RATE_CARD.escalatorPct[b] / 100, term));
    components[b] = { padAnnual: Math.round(padAnnual), capacityAnnual: Math.round(capAnnual),
                      grossAnnual: Math.round(gross), lateralDragAnnual: Math.round(drag),
                      escalatorPct: RATE_CARD.escalatorPct[b] };
  });

  return {
    termYears: term,
    contractedKw: Math.round(contractedKw),
    leasedAcres: acres,
    monthly: monthly, annual: annual, termTotal: termTotal,
    perMwYear: {
      low:  Math.round(annual.low  / (contractedKw / 1000)),
      base: Math.round(annual.base / (contractedKw / 1000)),
      high: Math.round(annual.high / (contractedKw / 1000))
    },
    components: components,
    qualityAdj: Math.round(qualityAdj * 1000) / 1000,
    tranchePremium: trMult,
    lateral: (lateralMi == null && quoted == null) ? null : {
      mi: lateralMi == null ? null : round(lateralMi, 2),
      capexMid: Math.round(lateralCost),
      annualised: Math.round(lateralAnnualRaw),
      cappedAt: RATE_CARD.lateralMaxShareOfRent,
      source: quoted != null ? 'carrier budgetary quote' : 'per-mile estimate'
    },
    floored: flooredBands,
    rateCard: RATE_CARD,
    basis: 'Pad rent on ' + acres + ' acres plus capacity rent on ' + fmt(Math.round(contractedKw)) + ' kW, '
         + 'adjusted for site quality (' + Math.round(qualityAdj * 100) + '%) and tranche premium ('
         + Math.round(trMult * 100) + '%)'
         + (lateralCost ? ', less the amortised fiber lateral' : '')
         + '. Escalating ' + RATE_CARD.escalatorPct.base + '%/yr over ' + term + ' years at base.',
    howToUse: 'Open at base. Hold at low. Go to high only for a site that clears every gate on '
            + 'evidence rather than on a promise. The range is the rep\'s room to negotiate, not '
            + 'three different opinions about the site.'
  };
}

/* Sum of an escalating annuity: y1 + y1(1+e) + … over n years. */
function escalatedTotal(first, e, n) {
  if (!e) return first * n;
  return first * (Math.pow(1 + e, n) - 1) / e;
}

/* ═══════════════════════════════════════════════════════════════════════════
   THE CAPTURE BLOCK
   ═══════════════════════════════════════════════════════════════════════════
   docs/COMPUTE-SITE-QUALIFICATION.md §3 says "hard-code these as fields", and
   its list is deliberately larger than the set of answers that MOVE the
   verdict. Utility, ZIP, carrier, AHJ, pad description, encumbrances, who
   signs, by when, and who else is talking to them: none of these is a gate,
   and a site does not fail because nobody asked. But a screen that never asks
   produces a beautifully qualified site with no path to a signature, and the
   rep who has to make the next call is not always the rep who made the last
   one.

   So they are captured, echoed back on the response, and the empty ones land
   on the call list — the same treatment every other unanswered question gets.
   They are NOT scored, and nothing here can move a gate. The two fields that
   DO change the answer live on their gates instead, because they are answers
   rather than context: `zoningUseStatus` (the jurisdiction outranks the code)
   and `fiberLateralQuote` (a carrier's number outranks our estimate). */
function captureOf(rep) {
  return {
    zip: str(rep.zip) || null,
    utility: str(rep.utility) || null,
    serviceTerritory: str(rep.serviceTerritory) || null,
    existingDemandKw: num(rep.existingDemandKw),
    transformerKva: num(rep.transformerKva),
    fiberProvider: str(rep.fiberProvider) || null,
    fiberLateralQuote: num(rep.fiberLateralQuote),
    jurisdiction: str(rep.jurisdiction) || null,
    zoningUseStatus: str(rep.zoningUseStatus) || null,
    parkingPadSpace: str(rep.parkingPadSpace) || null,
    encumbrances: str(rep.encumbrances) || null,
    decisionMaker: str(rep.decisionMaker) || null,
    timeline: str(rep.timeline) || null,
    competingParties: str(rep.competingParties) || null
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   THE VERDICT
   ═══════════════════════════════════════════════════════════════════════════
   Fiber is a hard gate, so it does not average. A failed fiber gate
   disqualifies the site and suppresses the offer entirely — a number on the
   page is a number a rep will say out loud, and a rep should not be able to
   quote rent on a site that is not a compute site.
*/
function verdictOf(gates) {
  var order = ['power', 'fiber', 'zoning', 'siteControl'];
  var fails = order.filter(function (k) { return gates[k].status === 'fail'; });
  var open = order.filter(function (k) { return gates[k].status === 'unconfirmed'; });
  var cond = order.filter(function (k) { return gates[k].status === 'conditional'; });

  if (gates.fiber.status === 'fail')
    return { verdict: 'disqualified', offerable: false,
      reason: 'Fiber is the hard gate and this site fails it. No offer is priced: a site that cannot '
            + 'show 1 Gbps bidirectional is not a compute site, however good the power is.' };
  if (fails.length)
    return { verdict: 'disqualified', offerable: false,
      reason: 'Fails on ' + fails.map(function (k) { return gates[k].label.toLowerCase(); }).join(' and ')
            + '. No offer is priced.' };
  if (open.length)
    return { verdict: 'incomplete', offerable: true,
      reason: 'Indicative only — ' + open.map(function (k) { return gates[k].label.toLowerCase(); }).join(', ')
            + ' ' + (open.length > 1 ? 'are' : 'is') + ' not confirmed. Do not present this as a firm offer '
            + 'until the open gates are closed.' };
  if (cond.length)
    return { verdict: 'conditional', offerable: true,
      reason: 'Every gate is answered, with conditions on '
            + cond.map(function (k) { return gates[k].label.toLowerCase(); }).join(' and ')
            + '. Offerable, with the conditions written into the LOI.' };
  return { verdict: 'qualified', offerable: true,
    reason: 'All four gates clear on evidence. Offerable.' };
}

/* ═══════════════════════════════════════════════════════════════════════════
   THE TENANT'S BRAND, RESOLVED HERE
   ═══════════════════════════════════════════════════════════════════════════
   A proposal carries the name of the company sending it. On a multi-tenant
   platform that is NOT ClearSky — it is SunESol, or Concord, or whoever the
   signed-in rep works for. A host who receives a document branded with their
   vendor's vendor has been told something nobody meant to tell them.

   WHY THE FUNCTION AND NOT THE PAGE. Two surfaces already render this
   proposal — compute-proposal.html and the editor's compute panel — and
   there will be more. Each one resolving branding for itself means each one
   reading omega_orgs, each one deciding what to do with a blank field, and
   the two documents drifting apart inside a month. This function already
   authenticates the caller and already reads their org for the entitlement
   check; the brand comes off that same read, at no extra cost.

   It is also why this cannot simply be omega-brand.js: that file is not on
   editor.html's script list, and adding a sign-in-path module to the largest
   page in the repo to fetch four strings is the wrong trade.

   EMPTY IS EMPTY, not a guess. A tenant with no logo gets '' and the page
   falls back to its own wordmark. Deriving a name from the orgId would put
   "concordenergyusa.com" on a customer's desk. */
function brandOf(org) {
  org = org || {};
  var eb = org.exportBrand || {};
  var colors = org.colors || {};
  return {
    name: str(eb.name) || str(org.name) || '',
    logoUrl: str(eb.logo) || str(eb.logoUrl) || str(org.logoUrl) || '',
    accent: str(colors.accent) || str(eb.accent) || '',
    tagline: str(eb.tagline) || '',
    slug: str(org.slug) || '',
    /* So a surface can say "unbranded" out loud rather than printing a blank
       header and leaving somebody to wonder whether the lookup failed. */
    resolved: !!(str(eb.name) || str(org.name))
  };
}

/* ── small helpers ───────────────────────────────────────────────────────── */
function num(v) { var n = Number(v); return (v === '' || v == null || !isFinite(n)) ? null : n; }
function str(v) { return v == null ? '' : String(v).trim(); }
function tri(v) { return v === true || v === 'true' ? true : (v === false || v === 'false' ? false : null); }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function round(v, d) { var m = Math.pow(10, d || 0); return Math.round(v * m) / m; }
function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
function fmt(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

/* ═══════════════════════════════════════════════════════════════════════════
   THE MODEL, callable without a request — for scripts/test-compute-lease.js
   and for anything else that needs the answer without the auth round trip.
   ═══════════════════════════════════════════════════════════════════════════ */
function evaluate(body, opts) {
  opts = opts || {};
  var rep = (body && body.rep && typeof body.rep === 'object') ? body.rep : {};
  var ev = (body && body.evidence && typeof body.evidence === 'object') ? body.evidence : {};

  var gates = {
    power: gatePower(rep, ev),
    fiber: gateFiber(rep, ev),
    zoning: gateZoning(rep, ev),
    siteControl: gateSiteControl(rep, ev)
  };
  var v = verdictOf(gates);
  var tranche = classifyTranche(rep);
  var offer = v.offerable ? buildOffer(gates, tranche, rep, ev) : null;

  /* Everything the rep still has to go and get, in one list, deduplicated and
     in gate order. This is the call-list the sales playbook is built around —
     the tool's job is not only to score the site but to say what closes it. */
  var asks = [], seen = {};
  ['power', 'fiber', 'zoning', 'siteControl'].forEach(function (k) {
    gates[k].asks.forEach(function (a) {
      if (seen[a]) return; seen[a] = 1;
      asks.push({ gate: gates[k].label, ask: a });
    });
  });
  tranche.missing.forEach(function (m) {
    asks.push({ gate: 'Tranche', ask: m.ask, field: m.field });
  });

  /* The commercial and context questions. Last in the list on purpose: a gate
     that is failing outranks a question nobody has asked yet. */
  var capt = captureOf(rep);
  if (!capt.zip) asks.push({ gate: 'Site', field: 'zip',
    ask: 'Capture the ZIP. It is how this site joins the utility and tariff data downstream.' });
  if (!capt.parkingPadSpace) asks.push({ gate: 'Site control', field: 'parkingPadSpace',
    ask: 'Describe the parking or pad space available — where the containers, the transformer and '
       + 'the access path would actually sit, not just how many acres are on the deed.' });
  if (!capt.decisionMaker) asks.push({ gate: 'Commercial', field: 'decisionMaker',
    ask: 'Establish who signs, and whether our contact is that person.' });
  if (!capt.timeline) asks.push({ gate: 'Commercial', field: 'timeline',
    ask: 'Ask what their timeline is and what is driving it.' });
  if (!capt.competingParties) asks.push({ gate: 'Commercial', field: 'competingParties',
    ask: 'Ask who else is talking to them about this site.' });

  var findings = [];
  if (!ev.gridAtlas) findings.push({ severity: 'note', text: 'Grid Atlas did not run — the power gate rests on the rep\'s numbers alone.' });
  if (!ev.network) findings.push({ severity: 'note', text: 'Network Proximity did not run — the fiber gate rests on the rep\'s numbers alone.' });
  if (!ev.parcel || ev.parcel.ok === false) findings.push({ severity: 'note', text: 'No parcel record for this point — zoning, owner and acreage are unverified.' });
  if (offer && offer.floored.length) findings.push({ severity: 'risk',
    text: 'The ' + offer.floored.join(' and ') + ' band priced below the $' + RATE_CARD.floorMonthly
        + '/mo floor and was raised to it. A site at the floor is a site whose lateral or quality is eating the deal.' });
  if (v.verdict === 'incomplete') findings.push({ severity: 'risk', text: v.reason });
  if (gates.fiber.status === 'conditional') findings.push({ severity: 'risk',
    text: 'Fiber is reachable but not on site. The lease carries the amortised lateral — do not also promise the host we will pay for it separately.' });

  /* ── WHO SEES THE RATE CARD ───────────────────────────────────────────
     The offer range goes to every entitled caller: a rep cannot negotiate
     without it and that is the whole point of the tool. The BANDS BEHIND IT
     do not. $/kW-year and $/acre-year are ClearSky's commercial position, and
     `components` discloses them by division just as surely as the card does.

     So both are staff-only. A tenant rep gets the number to say in the room
     and the version that produced it, which is everything they need and
     nothing they could take to a competitor. Staff get the full build-up,
     because staff are the ones who have to defend it. */
  if (offer && !opts.disclose) {
    offer.rateCard = { version: RATE_CARD.version, asOf: RATE_CARD.asOf,
                       termYears: RATE_CARD.termYears, floorMonthly: RATE_CARD.floorMonthly,
                       disclosed: false };
    delete offer.components;
  }

  return {
    build: BUILD,
    model: 'compute-lease-v1',
    rateCardVersion: RATE_CARD.version,
    site: {
      address: str(rep.address) || (ev.gridAtlas && str(ev.gridAtlas.resolvedAddress)) || '',
      lat: num(rep.lat), lng: num(rep.lng),
      owner: gates.siteControl.owner, apn: (ev.parcel && str(ev.parcel.apn)) || null,
      county: (ev.parcel && str(ev.parcel.county)) || null
    },
    gates: gates,
    gateOrder: ['power', 'fiber', 'zoning', 'siteControl'],
    capture: capt,
    verdict: v.verdict, offerable: v.offerable, verdictReason: v.reason,
    tranche: tranche,
    offer: offer,
    asks: asks,
    findings: findings,
    /* The company whose name goes on the proposal. Resolved from the caller's
       omega_orgs record in the handler; empty when the model is run directly
       (tests, scripts), and every surface falls back to its own wordmark. */
    brand: opts.brand || brandOf(null),
    disclaimer: 'Indicative only. The lease range is produced from the rate card ('
      + RATE_CARD.version + ') against the evidence supplied and is not a binding offer. '
      + 'Rent, term and conditions are subject to a signed LOI, utility will-serve, a carrier '
      + 'commitment for 1 Gbps bidirectional service, and site diligence.'
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   HANDLER
   ═══════════════════════════════════════════════════════════════════════════
   Auth follows api/fiber-screen.js: the caller's Firebase ID token, their org
   must be active, their membership active, and the tool not switched off for
   them. No service-account credential, so this keeps working in the degraded
   mode admin.js documents.
   ═══════════════════════════════════════════════════════════════════════════ */
var TOOL_KEY = 'computelease';

module.exports = function (req, res) {
  res.setHeader('Cache-Control', 'private, no-store');

  /* GET is a health check — "is it deployed, and on which rate card" should be
     answerable from an address bar, not by finding a site and pressing a
     button. It does NOT return the bands; the version is enough to trace a
     proposal and the numbers are the thing being protected. */
  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true, build: BUILD, model: 'compute-lease-v1',
      rateCard: { version: RATE_CARD.version, asOf: RATE_CARD.asOf, termYears: RATE_CARD.termYears },
      gates: ['power', 'fiber (hard gate)', 'zoning', 'siteControl'],
      evidence: 'POST { rep:{...}, evidence:{ gridAtlas, network, parcel } }. The page calls '
              + '/api/grid-atlas, /api/network-proximity and /api/parcel itself and posts what they said.',
      brand: 'The response carries the CALLER\'s tenant brand (name, logoUrl, accent, tagline) read '
           + 'from their omega_orgs record, so every surface renders one proposal rather than each '
           + 'resolving branding for itself. Unset fields come back empty, never guessed.',
      note: 'An unanswered question is UNCONFIRMED, not a failure — it drops the site to indicative '
          + 'and is named in `asks`, rather than counting against it.'
    });
  }
  if (req.method !== 'POST') return res.status(405).json({ build: BUILD, error: 'GET or POST.' });

  return auth.authenticateWithTier(req).then(function (a) {
    if (!a.caller.staff && (a.billing.toolOverrides || {})[TOOL_KEY] === false)
      throw auth.httpError(403, 'Compute Lease access required.');
    var token = String(req.headers.authorization || '').replace(/^Bearer /, '');

    /* Staff skip the ENTITLEMENT checks, not the org read: a ClearSky rep's
       proposal carries ClearSky's brand by the same path a tenant's carries
       theirs, and a branding bug that only shows up for tenants is a branding
       bug nobody at ClearSky ever sees. The read is best-effort for staff —
       it must not be able to fail their request. */
    if (a.caller.staff) {
      return auth.readAsCaller(token, 'omega_orgs/' + encodeURIComponent(a.caller.orgId))
        .then(function (org) { a.org = org || null; return a; },
              function () { a.org = null; return a; });
    }

    return Promise.all([
      auth.readAsCaller(token, 'omega_orgs/' + encodeURIComponent(a.caller.orgId)),
      auth.readAsCaller(token, 'omega_orgs/' + encodeURIComponent(a.caller.orgId)
        + '/members/' + encodeURIComponent(a.caller.uid))
    ]).then(function (items) {
      var org = items[0], member = items[1];
      if (!org || ['active', 'pending'].indexOf(org.status) < 0)
        throw auth.httpError(403, 'An active Omega organisation is required.');
      if (!member || (member.status && member.status !== 'active'))
        throw auth.httpError(403, 'An active organisation membership is required.');
      if (Array.isArray(member.toolAccess) && member.toolAccess.indexOf(TOOL_KEY) < 0)
        throw auth.httpError(403, 'Compute Lease access required.');
      a.org = org;
      return a;
    });
  }).then(function (a) {
    var body = (req.body && typeof req.body === 'object') ? req.body : {};
    if (!body.rep || typeof body.rep !== 'object')
      throw auth.httpError(400, 'rep:{} is required — the answers the rep captured. '
        + 'Send {} for a site with nothing known and every gate comes back unconfirmed, which is the honest answer.');
    return res.status(200).json(evaluate(body, {
      disclose: !!(a && a.caller && a.caller.staff),
      brand: brandOf(a && a.org)
    }));
  }).catch(function (e) {
    return res.status(e.status || 500).json({
      build: BUILD,
      error: e.status ? e.message : 'Compute lease scoring failed.',
      detail: e.status ? undefined : String((e && e.message) || e).slice(0, 300)
    });
  });
};

/* For scripts/test-compute-lease.js — the pure model, runnable with no
   network and no Firebase. The handler is a thin auth wrapper around it. */
module.exports._model = {
  evaluate: evaluate, RATE_CARD: RATE_CARD, BUILD: BUILD,
  brandOf: brandOf,
  gatePower: gatePower, gateFiber: gateFiber, gateZoning: gateZoning,
  gateSiteControl: gateSiteControl, classifyZoning: classifyZoning,
  classifyTranche: classifyTranche, verdictOf: verdictOf,
  buildOffer: buildOffer, escalatedTotal: escalatedTotal
};
