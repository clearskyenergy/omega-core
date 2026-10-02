/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/omega-core.js — the Omega-Core program: the skid, the site gates,
   the host's land lease and the end-of-term terms
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   ─────────────────────────────────────────────────────────────────────────────
   WHAT OMEGA-CORE IS
   ─────────────────────────────────────────────────────────────────────────────
   One transportable skid (336 x 87 in, 8 in base, 82.75 in overall) carrying a
   Solela Edge Compute cabinet (75 kW of compute) and a CleanCell R60 battery
   (61.44 kWh LFP, 60 kW Sol-Ark 60K PCS, 277/480 V three-phase). ClearSky
   owns it and sets it on an EV CHARGING SITE on ITS OWN UTILITY METER, and
   pays the site host a land lease. That rent is the point: it is income the
   charging site did not have, so the site pencils better. The host buys
   nothing, powers nothing and their bill does not change.

   The contract is a 5-year minimum. At the end ClearSky removes the skid and
   has the meter turned off, or the host buys the skid at fair market value.
   System cost: $450,000 per skid (Tommy, 2026-10-02).

   ─────────────────────────────────────────────────────────────────────────────
   WHAT THIS ANSWERS, FROM THE EDITOR'S OUTPUT TAB
   ─────────────────────────────────────────────────────────────────────────────
     1 · Can this site take Omega-Core skids — and how many — on three gates:
           POWER    is there room for a new 480 V service for the skids
           LOCATION is it a charging site, zoned for it, on the map
           FIBER    1 Gbps bidirectional — THE HARD GATE (compute-lease's own)
     2 · What the host is offered: rent per skid per month, over the term
     3 · What that does to the charging site the Run priced: payback before
         and after, the uplift on year-one revenue
     4 · The terms: own meter, 5-year minimum, removal or fair-market buyout

   ─────────────────────────────────────────────────────────────────────────────
   ONE RULE EACH, NOT A SECOND COPY
   ─────────────────────────────────────────────────────────────────────────────
   The fiber gate and the zoning classifier ARE api/compute-lease.js's — the
   same hard gate a compute site has always had to clear ("a site without 1
   Gbps bidirectional is not a compute site, however good the power is"). Its
   `_model` export exists for exactly this. The brand on a document is the
   same `brandOf`. Change those there.

   The browser fans out for the evidence (Grid Atlas, Network Proximity, the
   parcel — OmegaComputeLease.evidence), the same reason compute-lease gives:
   a 55 s fiber lookup nested inside this function would put two timeouts in
   series under one ceiling. The evidence is caller-supplied; the thing worth
   protecting is the rate card, not a distance anyone can measure on a map.

   Unanswered is UNCONFIRMED, never zero, and the Run's numbers are the Run's:
   this file reads them, it never re-prices the host's site.

   ─────────────────────────────────────────────────────────────────────────────
   ⚠ THE LEASE CARD AND THE BUYOUT BAND ARE SEEDS, NOT COMPS
   ─────────────────────────────────────────────────────────────────────────────
   Same warning compute-lease carries. Versioned, echoed on every answer, and
   the build-up is staff-only. Replace with signed comparables and bump
   RATE_CARD.version before quoting either as ClearSky's position.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

var CL = require('../compute-lease')._model;

var BUILD = '2026-10-02.omega-core-v1';

/* ═══════════════════════════════════════════════════════════════════════════
   THE PRODUCT — facts a host may be told
   ═══════════════════════════════════════════════════════════════════════════
   The battery is read off the Clean Cell US R60 Product Data Sheet, Rev A
   (September 2026). The skid dimensions, the 75 kW of compute and the price
   are ClearSky's. Nothing below is a planning estimate except where it says
   so (`meter`, which is how the skid is served, not a datasheet line). */
var PRODUCT = {
  key: 'omega-core',
  name: 'Omega-Core',
  catalogId: 'dc_omegacore',
  systemCostUsd: 450000,
  compute: { make: 'Solela', model: 'Solela Edge Compute', kw: 75 },
  battery: {
    make: 'Clean Cell US', model: 'CleanCell R60', catalogKey: 'CC-R60',
    chemistry: 'LFP (LiFePO4)', kwh: 61.44, kw: 60, dcV: 614.4, ah: 100,
    pcs: 'Sol-Ark 60K three-phase hybrid', acV: '277/480 VAC 4-wire Wye or 480 VAC 3-wire Delta',
    maxAcA: 72.3, peakKva: '90 kVA for 10 s off grid',
    efficiency: '97.5% max PCS · 96.5% CEC · 96.0% grid-to-battery',
    certs: 'UL 9540:2023 (reported), UL 9540A (reported tested), UL 1973 (reported); PCS UL 1741 SB, IEEE 1547',
    source: 'Clean Cell US R60 Product Data Sheet Rev A (Sep 2026)'
  },
  skid: { lengthIn: 336, depthIn: 87, heightIn: 82.75, baseIn: 8, lengthFt: 28, depthFt: 7.25 },
  /* HOW THE SKID IS SERVED. Its own 480 V three-phase service and meter.
     Firm draw is the compute; the peak adds the battery recharging at its
     full 60 kW while the compute runs — what the service must carry unless
     the controller caps the recharge to fit a smaller one. Amps are planning
     figures (0.95 power factor, 125% continuous), rounded up to a standard
     service; the utility and the engineer of record set the real one. */
  meter: { firmKw: 75, peakKw: 135, volts: 480, phases: 3, powerFactor: 0.95 },
  /* The battery carries up to 60 of the 75 kW (the PCS limit) — about an
     hour at 60 kW from 61.44 kWh. Said, so nobody sells it as a full UPS. */
  rideThrough: 'The battery carries up to 60 kW of the 75 kW compute load (the Sol-Ark 60K limit), '
             + 'about one hour at 60 kW from 61.44 kWh.'
};

/* ═══════════════════════════════════════════════════════════════════════════
   THE TERMS
   ═══════════════════════════════════════════════════════════════════════════ */
var TERMS = {
  minTermYears: 5,
  maxTermYears: 15,
  ownership: 'ClearSky owns, operates, insures and maintains the skid. The host owns nothing on it.',
  meter: 'The skid is served by its own utility service and meter in ClearSky\'s name. The host\'s '
       + 'meter, bill and demand charges do not change.',
  remove: 'At the end of the term ClearSky removes the skid, restores the pad and has the utility turn '
        + 'the meter off, at ClearSky\'s cost.',
  buyout: 'Or the host may buy the skid at fair market value, set by an independent appraisal at the end '
        + 'of the term.',
  renewal: 'Renewal by mutual agreement.'
};

/* ═══════════════════════════════════════════════════════════════════════════
   THE LEASE CARD  ⚠ seed values — see the header
   ═══════════════════════════════════════════════════════════════════════════
   Rent per skid per month, because a charging-site host thinks in "what does
   this pay me a month", and a skid is a unit, not an acre.

     LOW  $750   compute-lease's floorMonthly: below it a lease is not worth
                 the host's signature, our legal cost or the title work.
     BASE $1,000 75 kW at compute-lease's high capacity band ($90/kW-yr ≈
                 $560/mo) plus about three parking stalls of ground the skid
                 and its clearances take (~$150/stall-mo ≈ $450).
     HIGH $1,500 for a site that clears every gate on evidence.

   Open at base. Hold at low. Go to high only on evidence. */
var RATE_CARD = {
  version: 'omega-core-lease-v1',
  asOf: '2026-10-02',
  monthlyPerSkid: { low: 750, base: 1000, high: 1500 },
  escalatorPct: { low: 2.0, base: 2.5, high: 3.0 },
  buildUp: {
    low: 'compute-lease floorMonthly ($750/mo)',
    base: '75 kW at $90/kW-yr capacity rent (~$560/mo) + ~3 parking stalls at ~$150/stall-mo (~$450/mo)',
    high: 'a site that clears power, location and fiber on evidence'
  },
  /* FAIR MARKET VALUE — indicative only. The contract says FMV by
     independent appraisal; this band only lets a host see the order of
     magnitude. Share of the system cost left at year 5, declining
     geometrically for longer terms (r5^(years/5)), never under the floor. */
  fmvAtYear5: { low: 0.20, base: 0.30, high: 0.40 },
  fmvFloor: 0.05,
  /* Fiber lateral $/mile — compute-lease's band, so a screen and an offer
     can never disagree about one trench. */
  lateralPerMile: CL.RATE_CARD.lateralPerMile
};

/* ── small helpers (compute-lease's, by value) ───────────────────────────── */
function num(v) { var n = Number(v); return (v === '' || v == null || !isFinite(n)) ? null : n; }
function str(v) { return v == null ? '' : String(v).trim(); }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function round(v, d) { var m = Math.pow(10, d || 0); return Math.round(v * m) / m; }
function fmt(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
function obj(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }

var STD_SERVICES = [100, 125, 150, 175, 200, 225, 250, 300, 350, 400, 450, 500, 600, 800, 1000, 1200, 1600, 2000, 2500, 3000, 4000];

/* Planning service size for a load at 480 V three-phase: amps at the power
   factor, 125% for a continuous load, rounded UP to a standard size. */
function serviceAmps(kw, volts, pf) {
  volts = volts || 480; pf = pf || 0.95;
  if (!(kw > 0)) return null;
  var a = kw * 1000 / (Math.sqrt(3) * volts * pf) * 1.25;
  for (var i = 0; i < STD_SERVICES.length; i++) if (STD_SERVICES[i] >= a) return STD_SERVICES[i];
  return Math.ceil(a / 100) * 100;
}

/* An existing service's continuous capacity, kW: three-phase unless the
   caller says single, 80% continuous loading, 0.95 pf. */
function serviceKw(amps, volts, phases) {
  amps = num(amps); volts = num(volts);
  if (!(amps > 0) || !(volts > 0)) return null;
  var ph = num(phases) === 1 ? 1 : 3;
  var va = ph === 3 ? Math.sqrt(3) * volts * amps : volts * amps;
  return va * 0.8 * 0.95 / 1000;
}

/* Sum of an escalating annuity: compute-lease's, so both agree to the cent. */
var escalatedTotal = CL.escalatedTotal;

/* ═══════════════════════════════════════════════════════════════════════════
   HOW MANY SKIDS — and what the drawing says the site carries today
   ═══════════════════════════════════════════════════════════════════════════ */
function hostPeakKw(d) {
  /* What the host's own site draws at peak, from the drawing: chargers,
     the host's own compute, the host's battery recharging. Omega-Core is on
     its own meter and is never in it. */
  var ch = obj(d.chargers);
  var parts = [num(ch.dcfcKw), num(ch.l2Kw), num(d.dcLoadKw), num(d.buildingKw)];
  var t = 0, any = false;
  parts.forEach(function (p) { if (p != null && p > 0) { t += p; any = true; } });
  return any ? t : null;
}

function unitsWanted(rep, d) {
  var r = num(rep.units), placed = num(d.units);
  var n = r != null && r >= 1 ? r : (placed != null && placed >= 1 ? placed : 1);
  return clamp(Math.round(n), 1, 20);
}

/* ═══════════════════════════════════════════════════════════════════════════
   GATE 1 · POWER — room for the skids' own service
   ═══════════════════════════════════════════════════════════════════════════
   Each skid is a NEW 480 V service. Two things can say there is room:

     · what the UTILITY said — available kW at this location and the
       will-serve for the new meter. Authoritative; a letter beats a drawing.
     · what the DRAWING shows — the utility transformer's kVA against the
       host's drawn peak. A new meter is usually set off the same pad-mount
       transformer, so its headroom is the best on-site signal there is. It
       is a SIGNAL: it can make a site conditional, never pass it, the same
       way Grid Atlas never turns an unconfirmed will-serve into a confirmed
       one in compute-lease.

   The host's existing service is reported for scale and never used as the
   skids' supply: they are not on it. */
function gatePower(rep, d, ev, n) {
  var basis = [], asks = [], status = 'unconfirmed';
  var M = PRODUCT.meter;
  var needPeak = n * M.peakKw, needFirm = n * M.firmKw;
  var avail = num(rep.availableKw);
  var willServe = str(rep.willServe) || 'unknown';   /* confirmed|requested|none|unknown */
  var xfmr = num(d.xfmrKva);
  var peak = hostPeakKw(d);
  var svc = obj(d.service);
  var svcKw = serviceKw(svc.amps, svc.volts, svc.phases);
  var supported = null, headroom = null, source = null;

  basis.push(n + ' skid' + (n > 1 ? 's need ' : ' needs ') + fmt(needFirm) + ' kW firm (compute) and up to '
    + fmt(needPeak) + ' kW at peak (battery recharging at 60 kW) — about '
    + serviceAmps(M.peakKw, M.volts, M.powerFactor) + ' A at 480 V three-phase each, on '
    + (n > 1 ? 'their own meters' : 'its own meter') + '.');

  if (svcKw != null) {
    basis.push('Host service on the drawing: ' + fmt(svc.amps) + ' A at ' + fmt(svc.volts) + ' V ≈ '
      + fmt(svcKw) + ' kW continuous' + (peak != null ? ', ' + fmt(peak) + ' kW drawn at peak' : '')
      + '. The skids are not on it — reported for scale.');
  } else if (peak != null) {
    basis.push('Host load drawn at peak: ' + fmt(peak) + ' kW (chargers' + (num(d.dcLoadKw) ? ', compute' : '')
      + (num(d.buildingKw) ? ', building' : '') + ').');
  }

  /* The drawing's half: transformer headroom. */
  if (xfmr != null && xfmr > 0) {
    headroom = xfmr * M.powerFactor - (peak || 0);
    basis.push('Utility transformer on the drawing: ' + fmt(xfmr) + ' kVA'
      + (peak != null ? ' against ' + fmt(peak) + ' kW of host load — ' + fmt(Math.max(0, headroom)) + ' kW headroom.'
                      : ' — no host load drawn, so the whole rating reads as headroom.'));
    source = 'drawing';
  }

  /* The utility's half wins when it is there. */
  if (avail != null) { headroom = avail; source = 'utility'; }

  if (headroom != null) {
    supported = Math.max(0, Math.floor(headroom / M.firmKw));
    var atPeak = Math.max(0, Math.floor(headroom / M.peakKw));
    if (source === 'utility') {
      basis.push('Utility says ' + fmt(avail) + ' kW is available here; will-serve '
        + (willServe === 'confirmed' ? 'confirmed' : willServe === 'requested' ? 'requested, pending'
          : willServe === 'none' ? 'declined' : 'not yet requested') + '.');
    }
    if (willServe === 'none') {
      status = 'fail';
      basis.push('The utility has declined a new service here.');
    } else if (headroom < M.firmKw) {
      status = source === 'utility' ? 'fail' : 'unconfirmed';
      basis.push(fmt(Math.max(0, headroom)) + ' kW is under one skid\'s ' + M.firmKw + ' kW firm draw.');
      if (source === 'drawing') asks.push('The drawn transformer looks full. Ask the utility whether a new 480 V '
        + 'service for ' + fmt(needPeak) + ' kW can be set here — a transformer upgrade is their call and their cost to quote.');
      else asks.push('Ask whether ' + fmt(avail) + ' kW is the ceiling or today\'s spare, and what an upgrade to '
        + fmt(needFirm) + ' kW takes.');
    } else if (headroom >= needPeak) {
      status = (source === 'utility' && willServe === 'confirmed') ? 'pass' : 'conditional';
      basis.push('Room for ' + n + ' at full peak (' + fmt(needPeak) + ' kW).');
    } else if (headroom >= needFirm) {
      status = 'conditional';
      basis.push('Room for ' + n + ' at the compute load, not at full peak: the controller caps the battery recharge '
        + 'to ' + fmt(Math.max(0, headroom - needFirm)) + ' kW across the skids.');
    } else {
      status = 'conditional';
      basis.push('Room for ' + supported + ' of the ' + n + ' at the compute load (' + atPeak + ' at full peak).');
      asks.push('Size the offer to ' + supported + ' skid' + (supported === 1 ? '' : 's') + ', or ask the utility what '
        + fmt(needFirm) + ' kW takes.');
    }
    if (source === 'drawing' && status !== 'fail') {
      asks.push('Confirm with the utility: a new 480 V three-phase service and meter for ' + fmt(needPeak) + ' kW. '
        + 'The drawing shows room; only the utility can say it will serve.');
    } else if (source === 'utility' && willServe !== 'confirmed' && status !== 'fail') {
      asks.push('Get the will-serve for the new meter in writing — it is free and it is the long pole.');
    }
  } else {
    basis.push('Neither the utility\'s figure nor a transformer rating is on the project.');
    asks.push('Get the available kW for a new 480 V three-phase service at this location ('
      + fmt(needPeak) + ' kW at peak), and open a will-serve request for the new meter.');
    if (willServe === 'none') { status = 'fail'; basis.push('The utility has declined a new service here.'); }
  }

  /* Grid Atlas: proximity, never capacity — reported and lightly weighted. */
  var ga = ev.gridAtlas || null;
  var subKm = ga && num(ga.nearestSubKm);
  if (subKm != null) basis.push('Nearest substation ' + round(subKm, 1) + ' km'
    + (ga.maxKv ? ' · ' + ga.maxKv + ' kV in range' : '') + ' (proximity, not hosting capacity).');

  var served = willServe === 'confirmed' ? 100 : willServe === 'requested' ? 60 : willServe === 'none' ? 0 : 40;
  var sized = headroom == null ? 40 : headroom >= needPeak ? 100 : headroom >= needFirm ? 80
            : headroom >= M.firmKw ? 60 : 10;
  if (source === 'drawing') sized = Math.min(sized, 75);
  var prox = ga && ga.score != null ? clamp(num(ga.score), 0, 100) : null;
  var score = prox == null ? Math.round(served * 0.5 + sized * 0.5)
                           : Math.round(served * 0.45 + sized * 0.4 + prox * 0.15);

  return { key: 'power', label: 'Power', status: status, score: score,
    headline: status === 'pass' ? 'Will-serve confirmed for ' + n + ' skid' + (n > 1 ? 's' : '')
            : status === 'fail' ? (willServe === 'none' ? 'Utility declined a new service' : 'Under one skid\'s draw')
            : status === 'conditional' ? (supported != null && supported < n ? 'Room for ' + supported + ' of ' + n
                                          : 'Room shown — utility to confirm')
            : 'Available power not confirmed',
    needKw: { firm: needFirm, peak: needPeak }, headroomKw: headroom == null ? null : Math.round(headroom),
    headroomSource: source, unitsSupported: supported,
    serviceAmpsPerSkid: serviceAmps(M.peakKw, M.volts, M.powerFactor),
    basis: basis, asks: asks,
    measured: 'Only the utility can say a feeder will take a new service. The drawing\'s transformer headroom '
            + 'is the best on-site signal and is never treated as the answer.' };
}

/* ═══════════════════════════════════════════════════════════════════════════
   GATE 2 · LOCATION — a charging site, zoned for it, on the map
   ═══════════════════════════════════════════════════════════════════════════
   Omega-Core's purpose is to make a CHARGING site pay better, so the
   chargers on the drawing are the first fact. Zoning uses compute-lease's
   classifier. Where it sits is a fact once it is placed on the drawing. */
function gateLocation(rep, d, ev, site) {
  var basis = [], asks = [], status = 'unconfirmed', parts = [];
  var ch = obj(d.chargers);
  var dcfc = num(ch.dcfcUnits) || 0, l2 = num(ch.l2Units) || 0, ports = num(ch.ports) || 0;
  var located = site.lat != null && site.lng != null;

  /* Where */
  if (located) basis.push('Located at ' + round(site.lat, 5) + ', ' + round(site.lng, 5)
    + (site.address ? ' — ' + site.address : '') + '.');
  else { basis.push('The site has no coordinates.'); asks.push('Set the site\'s address or map pin so the site can be screened.'); }

  /* A charging site */
  var charging;
  if (dcfc + l2 > 0) {
    charging = 'pass';
    basis.push('Charging site: ' + (dcfc ? dcfc + ' DC fast' : '') + (dcfc && l2 ? ' + ' : '') + (l2 ? l2 + ' Level 2' : '')
      + (ports ? ' (' + ports + ' ports)' : '') + ' on the drawing.');
  } else if (str(rep.chargingSite) === 'yes') {
    charging = 'conditional';
    basis.push('Rep says this is a charging site; no chargers are on the drawing yet.');
    asks.push('Draw the chargers so the site\'s own economics come from the Run.');
  } else {
    charging = 'conditional';
    basis.push('No chargers on the drawing. Omega-Core is offered on charging sites, where the lease raises the site\'s return.');
    asks.push('Place the site\'s EV chargers (Draw › EV Catalog) and run the site, or confirm it is a charging site.');
  }
  parts.push(charging);

  /* Zoning — compute-lease's classifier, the rep's value first */
  var parcel = ev.parcel && ev.parcel.ok !== false ? ev.parcel : null;
  var code = str(rep.zoningCode) || (parcel && str(parcel.zoning)) || '';
  var cls = str(rep.zoningClass) || CL.classifyZoning(code);
  var zoning;
  if (cls === 'industrial' || cls === 'commercial') { zoning = 'pass'; basis.push(cls.charAt(0).toUpperCase() + cls.slice(1) + ' zoning' + (code ? ' (' + code + ')' : '') + '.'); }
  else if (cls === 'mixed' || cls === 'agricultural') {
    zoning = 'conditional';
    basis.push((cls === 'mixed' ? 'Mixed-use / planned development' : 'Agricultural') + ' zoning' + (code ? ' (' + code + ')' : '') + ' — workable, read against the code.');
    asks.push('Confirm with the jurisdiction that an equipment skid beside EV chargers is a permitted or accessory use here.');
  } else if (cls === 'residential') {
    zoning = 'fail';
    basis.push('Residential zoning' + (code ? ' (' + code + ')' : '') + ' — a commercial equipment skid is not a permitted use.');
  } else {
    zoning = 'unconfirmed';
    basis.push(code ? 'Zoning "' + code + '" is not a code this model recognises.' : 'Zoning not captured.');
    asks.push('Get the zoning where the skid would sit — commercial or industrial is the gate case.');
  }
  parts.push(zoning);
  if (parcel && parcel.owner) basis.push('Owner of record: ' + parcel.owner + (parcel.apn ? ' · APN ' + parcel.apn : '') + '.');

  /* The footprint */
  var placed = num(d.units) || 0;
  if (placed > 0) basis.push(placed + ' skid' + (placed > 1 ? 's' : '') + ' placed on the drawing (28 × 7.25 ft each) — the footprint fits where drawn.');
  else asks.push('Place the skid on the drawing (Draw › Data Ctr › Omega-Core Skid, 28 × 7.25 ft) to show where it goes.');

  if (!located) parts.push('unconfirmed');
  if (parts.indexOf('fail') >= 0) status = 'fail';
  else if (parts.indexOf('unconfirmed') >= 0) status = 'unconfirmed';
  else if (parts.indexOf('conditional') >= 0) status = 'conditional';
  else status = 'pass';

  var cs = charging === 'pass' ? 100 : 55;
  var zs = zoning === 'pass' ? (cls === 'industrial' ? 100 : 95) : zoning === 'conditional' ? 60 : zoning === 'fail' ? 5 : 40;
  var ls = located ? 100 : 20;
  var score = Math.round(cs * 0.4 + zs * 0.4 + ls * 0.2);

  return { key: 'location', label: 'Location', status: status, score: score,
    headline: status === 'pass' ? 'Charging site, ' + cls + ' zoning'
            : status === 'fail' ? 'Residential zoning'
            : charging !== 'pass' ? 'No chargers on the drawing' : 'Zoning not confirmed',
    zoningClass: cls || null, zoningCode: code || null,
    chargers: { dcfcUnits: dcfc, l2Units: l2, ports: ports },
    basis: basis, asks: asks,
    measured: 'Chargers come from the drawing; zoning from the county parcel layer where it publishes one. '
            + 'The jurisdiction\'s answer for the exact spot controls.' };
}

/* ═══════════════════════════════════════════════════════════════════════════
   GATE 3 · FIBER — compute-lease's hard gate, unchanged
   ═══════════════════════════════════════════════════════════════════════════
   The fiber the Network Proximity panel already found on this project
   (S.omegaFiber) is reported beside it; it informs, it never moves the
   gate — the verdict is the one rule. */
function gateFiber(rep, ev) {
  var g = CL.gateFiber(rep, ev);
  var f = ev.fiberOnFile || null;
  if (f) {
    var nr = f.nearestRoute || {};
    var mi = num(nr.distanceM) != null ? num(nr.distanceM) / 1609.344 : null;
    var line = 'On this project already: ';
    var bits = [];
    if (mi != null) bits.push('nearest published route ' + round(mi, 2) + ' mi' + (nr.operator ? ' (' + nr.operator + ')' : ''));
    /* The panel stores both as words, 'unconfirmed' until a carrier says
       otherwise; an unconfirmed word is not a fact worth printing. */
    var sv = typeof f.serviceability === 'string' ? f.serviceability
           : (f.serviceability && (f.serviceability.label || f.serviceability.verdict)) || '';
    if (sv && sv !== 'unconfirmed') bits.push('serviceability ' + sv);
    var rd = f.routeDiversity;
    if (typeof rd === 'string' && rd && rd !== 'unconfirmed') bits.push('route diversity ' + rd);
    else if (num(rd) != null) bits.push(rd + ' route' + (rd === 1 ? '' : 's'));
    if (bits.length) g.basis.push(line + bits.join(' · ') + '.');
  }
  return g;
}

/* ═══════════════════════════════════════════════════════════════════════════
   THE VERDICT — fiber does not average
   ═══════════════════════════════════════════════════════════════════════════ */
var ORDER = ['power', 'location', 'fiber'];
function verdictOf(gates) {
  var fails = ORDER.filter(function (k) { return gates[k].status === 'fail'; });
  var open = ORDER.filter(function (k) { return gates[k].status === 'unconfirmed'; });
  var cond = ORDER.filter(function (k) { return gates[k].status === 'conditional'; });
  function names(ks) { return ks.map(function (k) { return gates[k].label.toLowerCase(); }); }
  if (gates.fiber.status === 'fail')
    return { verdict: 'disqualified', offerable: false,
      reason: 'Fiber is the hard gate and this site fails it. No lease is priced: a site that cannot show '
            + '1 Gbps bidirectional is not an Omega-Core site, however good the power is.' };
  if (fails.length)
    return { verdict: 'disqualified', offerable: false,
      reason: 'Fails on ' + names(fails).join(' and ') + '. No lease is priced.' };
  if (open.length)
    return { verdict: 'incomplete', offerable: true,
      reason: 'Indicative only — ' + names(open).join(', ') + ' ' + (open.length > 1 ? 'are' : 'is')
            + ' not confirmed. Do not present this as a firm offer until the open gates are closed.' };
  if (cond.length)
    return { verdict: 'conditional', offerable: true,
      reason: 'Every gate is answered, with conditions on ' + names(cond).join(' and ')
            + '. Offerable, with the conditions written into the LOI.' };
  return { verdict: 'qualified', offerable: true, reason: 'Power, location and fiber clear on evidence. Offerable.' };
}

/* ═══════════════════════════════════════════════════════════════════════════
   THE OFFER, THE HOST'S SITE, THE PROGRAM, THE END OF TERM
   ═══════════════════════════════════════════════════════════════════════════ */
function termOf(rep) {
  var t = num(rep.termYears);
  return t == null ? TERMS.minTermYears : clamp(Math.round(t), TERMS.minTermYears, TERMS.maxTermYears);
}

function fmvShare(band, years) {
  var r5 = RATE_CARD.fmvAtYear5[band];
  return Math.max(RATE_CARD.fmvFloor, Math.pow(r5, years / 5));
}

function buildOffer(n, term) {
  var bands = ['low', 'base', 'high'], perSkid = {}, monthly = {}, annual = {}, termTotal = {};
  bands.forEach(function (b) {
    var m = RATE_CARD.monthlyPerSkid[b];
    perSkid[b] = m;
    monthly[b] = m * n;
    annual[b] = m * 12 * n;
    termTotal[b] = Math.round(escalatedTotal(m * 12 * n, RATE_CARD.escalatorPct[b] / 100, term));
  });
  return {
    units: n, termYears: term,
    monthlyPerSkid: perSkid, monthly: monthly, annual: annual, termTotal: termTotal,
    escalatorPct: { low: RATE_CARD.escalatorPct.low, base: RATE_CARD.escalatorPct.base, high: RATE_CARD.escalatorPct.high },
    basis: '$' + fmt(perSkid.base) + ' per skid per month at base, ' + n + ' skid' + (n > 1 ? 's' : '')
         + ', escalating ' + RATE_CARD.escalatorPct.base + '%/yr over ' + term + ' years.',
    howToUse: 'Open at base. Hold at low. Go to high only for a site that clears every gate on evidence. '
            + 'The range is room to negotiate, not three opinions about the site.'
  };
}

/* What the lease does to the charging site the Run priced. Reads the Run;
   never re-prices the site. A Run that is stale or missing is said so, and
   the before/after is left out rather than computed off old numbers. */
function hostEconomics(run, offer) {
  run = obj(run);
  var capex = num(run.capex), inc = num(run.incentive), rev = num(run.annualRevenue);
  var net = num(run.netCost);
  if (net == null && capex != null) net = capex - (inc || 0);
  var out = {
    run: { capex: capex, incentive: inc, netCost: net, annualRevenue: rev,
           low: num(run.low), high: num(run.high), at: str(run.at) || null, stale: run.stale === true },
    leaseAnnual: offer ? offer.annual.base : null,
    leaseTermTotal: offer ? offer.termTotal.base : null,
    paybackYearsBefore: null, paybackYearsAfter: null, revenueUpliftPct: null, leaseCoversPctOfNet: null,
    notes: []
  };
  if (!offer) return out;
  if (capex == null) {
    out.notes.push('Run the site (Site Map › Run) so the charging site\'s cost and revenue sit beside the lease.');
    return out;
  }
  if (run.stale === true) out.notes.push('The drawing changed after the last Run — re-run for current figures.');
  if (net != null && net > 0 && out.leaseTermTotal) out.leaseCoversPctOfNet = round(out.leaseTermTotal / net * 100, 1);
  if (rev != null && rev > 0) {
    out.revenueUpliftPct = round(offer.annual.base / rev * 100, 1);
    if (net != null && net > 0) {
      out.paybackYearsBefore = round(net / rev, 1);
      out.paybackYearsAfter = round(net / (rev + offer.annual.base), 1);
    }
  } else {
    out.notes.push('The Run priced no revenue for this site, so payback is not shown; the lease is the income.');
    if (net != null && net > 0) out.paybackYearsAfter = round(net / offer.annual.base, 1);
  }
  out.notes.push('Omega-Core is on its own meter: the host\'s utility bill and demand charges do not change.');
  return out;
}

function programOf(n, term, offer, gates) {
  var sys = PRODUCT.systemCostUsd * n;
  var lat = gates.fiber.lateral || null;
  var lateralMi = lat && num(lat.mi) != null ? num(lat.mi) : null;
  var lateralMid = (gates.fiber.status !== 'pass' && lateralMi != null)
    ? Math.round(lateralMi * (RATE_CARD.lateralPerMile.low + RATE_CARD.lateralPerMile.high) / 2) : 0;
  var fmvPer = {}, fmvAll = {};
  ['low', 'base', 'high'].forEach(function (b) {
    fmvPer[b] = Math.round(PRODUCT.systemCostUsd * fmvShare(b, term) / 1000) * 1000;
    fmvAll[b] = fmvPer[b] * n;
  });
  return {
    systemCostPerSkid: PRODUCT.systemCostUsd,
    systemCost: sys,
    /* no lateral to build when the service is already on site */
    fiberLateral: (lateralMi == null || gates.fiber.status === 'pass') ? null : { mi: round(lateralMi, 2), capexMid: lateralMid },
    leaseTermTotal: offer ? offer.termTotal.base : null,
    outlay: sys + lateralMid + (offer ? offer.termTotal.base : 0),
    fmvAtEndPerSkid: fmvPer,
    fmvAtEnd: fmvAll,
    fmvNote: 'Indicative only: ' + Math.round(RATE_CARD.fmvAtYear5.low * 100) + '–'
           + Math.round(RATE_CARD.fmvAtYear5.high * 100) + '% of the system cost at year 5, lower for a longer term. '
           + 'The contract sets fair market value by independent appraisal at the end of the term.'
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   EVALUATE — the whole answer, with no network and no Firebase
   ═══════════════════════════════════════════════════════════════════════════ */
function evaluate(body, opts) {
  opts = opts || {};
  body = obj(body);
  var rep = obj(body.rep), d = obj(body.drawing), ev = obj(body.evidence), run = obj(body.run);
  var s = obj(body.site);
  var parcel = ev.parcel && ev.parcel.ok !== false ? ev.parcel : null;
  var site = {
    name: str(s.name) || null,
    address: str(s.address) || (ev.gridAtlas && str(ev.gridAtlas.resolvedAddress)) || '',
    lat: num(s.lat) != null ? num(s.lat) : (ev.site && num(ev.site.lat)),
    lng: num(s.lng) != null ? num(s.lng) : (ev.site && num(ev.site.lng)),
    county: (parcel && str(parcel.county)) || null,
    apn: (parcel && str(parcel.apn)) || null,
    owner: (parcel && str(parcel.owner)) || null
  };
  if (site.lat == null) site.lat = null;
  if (site.lng == null) site.lng = null;

  var n = unitsWanted(rep, d);
  var term = termOf(rep);
  var gates = {
    power: gatePower(rep, d, ev, n),
    location: gateLocation(rep, d, ev, site),
    fiber: gateFiber(rep, ev)
  };
  var v = verdictOf(gates);

  /* Offer the skids the power can carry: fewer, never more. */
  var proposed = n;
  if (gates.power.unitsSupported != null && gates.power.unitsSupported >= 1 && gates.power.unitsSupported < n)
    proposed = gates.power.unitsSupported;
  var offer = v.offerable ? buildOffer(proposed, term) : null;
  var host = hostEconomics(run, offer);
  var program = programOf(proposed, term, offer, gates);

  var asks = [], seen = {};
  ORDER.forEach(function (k) {
    gates[k].asks.forEach(function (a) {
      if (seen[a]) return; seen[a] = 1;
      asks.push({ gate: gates[k].label, ask: a });
    });
  });
  var hostTerm = num(rep.termYears);
  if (str(rep.hostWilling) !== 'yes')
    asks.push({ gate: 'Host', ask: 'Ask the host directly: will they sign a ' + TERMS.minTermYears
      + '-year minimum land lease for the skid, with ClearSky\'s own meter on the site?' });
  if (hostTerm != null && hostTerm < TERMS.minTermYears)
    asks.push({ gate: 'Host', ask: 'The host offered ' + hostTerm + ' years; the program minimum is '
      + TERMS.minTermYears + '. The skid is not placed on less.' });

  var findings = [];
  if (!ev.gridAtlas) findings.push({ severity: 'note', text: 'Grid Atlas did not run — substation proximity is not in the power gate.' });
  if (!ev.network) findings.push({ severity: 'note', text: 'Network Proximity did not run — the fiber gate rests on the rep\'s answers alone.' });
  if (!parcel) findings.push({ severity: 'note', text: 'No parcel record for this point — zoning and owner are unverified.' });
  if (proposed < n) findings.push({ severity: 'risk', text: 'Power supports ' + proposed + ' of the ' + n
    + ' skids asked for; the lease is priced on ' + proposed + '.' });
  if (v.verdict === 'incomplete') findings.push({ severity: 'risk', text: v.reason });
  if (gates.fiber.status === 'conditional') findings.push({ severity: 'risk',
    text: 'Fiber is reachable but not on site. The lateral is ClearSky\'s cost in the program outlay — do not promise the host a separate fiber payment.' });
  if (host.run.stale) findings.push({ severity: 'note', text: 'The Run is older than the drawing — the host figures are from the last Run.' });

  var hostWilling = str(rep.hostWilling) || 'unknown';
  var endPref = str(rep.endOfTerm) || 'undecided';   /* remove|buyout|undecided */
  var terms = {
    minTermYears: TERMS.minTermYears, termYears: term,
    ownership: TERMS.ownership, meter: TERMS.meter, renewal: TERMS.renewal,
    endOfTerm: {
      preference: ['remove', 'buyout', 'undecided'].indexOf(endPref) >= 0 ? endPref : 'undecided',
      remove: TERMS.remove,
      buyout: TERMS.buyout,
      fmvIndicativePerSkid: program.fmvAtEndPerSkid,
      year: term
    },
    host: { willing: ['yes', 'exploring', 'no', 'unknown'].indexOf(hostWilling) >= 0 ? hostWilling : 'unknown' }
  };
  if (hostWilling === 'no') findings.push({ severity: 'risk', text: 'The host has said no to the lease. The site may qualify; the deal does not.' });

  var out = {
    build: BUILD,
    model: 'omega-core-v1',
    rateCardVersion: RATE_CARD.version,
    product: PRODUCT,
    site: site,
    units: { requested: n, placed: num(d.units) || 0, supported: gates.power.unitsSupported, proposed: proposed,
             perSkid: { computeKw: PRODUCT.compute.kw, bessKw: PRODUCT.battery.kw, bessKwh: PRODUCT.battery.kwh,
                        meterFirmKw: PRODUCT.meter.firmKw, meterPeakKw: PRODUCT.meter.peakKw,
                        serviceAmps: serviceAmps(PRODUCT.meter.peakKw, PRODUCT.meter.volts, PRODUCT.meter.powerFactor),
                        footprintFt: PRODUCT.skid.lengthFt + ' × ' + PRODUCT.skid.depthFt } },
    gates: gates, gateOrder: ORDER.slice(),
    verdict: v.verdict, offerable: v.offerable, verdictReason: v.reason,
    offer: offer,
    host: host,
    program: program,
    terms: terms,
    asks: asks,
    findings: findings,
    brand: opts.brand || CL.brandOf(null),
    disclaimer: 'Indicative only. The lease range comes from the Omega-Core lease card (' + RATE_CARD.version
      + ') against the evidence supplied and is not a binding offer. Rent, term and conditions are subject to a '
      + 'signed LOI, a utility will-serve for the skid\'s own meter, a carrier commitment for 1 Gbps bidirectional '
      + 'service, and site diligence. Fair market value at the end of the term is set by independent appraisal.'
  };
  /* WHO SEES THE CARD: the offer range goes to every entitled caller — a rep
     cannot negotiate without it. How it was built is ClearSky's position and
     is staff-only, as compute-lease does. */
  out.rateCard = opts.disclose
    ? RATE_CARD
    : { version: RATE_CARD.version, asOf: RATE_CARD.asOf, disclosed: false };
  return out;
}

module.exports = {
  evaluate: evaluate, PRODUCT: PRODUCT, TERMS: TERMS, RATE_CARD: RATE_CARD, BUILD: BUILD,
  gatePower: gatePower, gateLocation: gateLocation, gateFiber: gateFiber, verdictOf: verdictOf,
  buildOffer: buildOffer, hostEconomics: hostEconomics, programOf: programOf,
  serviceAmps: serviceAmps, serviceKw: serviceKw, fmvShare: fmvShare, hostPeakKw: hostPeakKw
};
