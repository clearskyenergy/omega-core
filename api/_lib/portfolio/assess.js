/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/portfolio/assess.js — the SITE ASSESSMENT: what a site's free
   power can carry, what each use returns, and how close the site is to
   shovel ready
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   (2026-11-09, Tommy: "when i upload a portfolio it then would run all these
   numbers … size pods to capability … a bess IRR and projections … a tesla
   supercharger ROI … the power column [says] how much power is available on
   that site, what is the kVA size of the transformer"; "i should be able to
   select run … a metric that identifies if it needs certain verifications
   … based on the site readiness checklist; the goal is to get sites shovel
   ready".)

   PURE, ES5, no Firestore, no clock (the caller hands `now`). The door
   (assess-door.js, on api/site-crm.js) reads the site, the screens already
   on it and the workspace's settings, calls assess(), and stores the answer
   on the site as `assessment`. Nothing here is computed in a browser.

   ONE ANSWER, FIVE PARTS
     power         the limit on file (transformer kVA × 0.8 continuous, the
                   service, or a figure entered), the site's own peak, and
                   what is FREE — with its basis said: measured (limit less
                   a peak on file), entered, or a CEILING (no peak on file:
                   the whole limit, never called free capacity)
     compute       the modular shelf — 75 kW, 350 kW, 1 MW and 1.77 MW of IT
                   — sized on the free power at the meter (IT × PUE), the
                   largest unit that fits, and its return from the ONE
                   contract engine (compute-contract.js) at the chip's
                   public reference price, marked as such
     bess          a grid-participation battery on the same free power
                   (assess-bess.js): size, capital, ten years, IRR and NPV
     supercharger  fast-charging posts on the same free power
                   (assess-supercharger.js): posts, capital, fifteen years
     readiness     the compute site-readiness checklist (eight sections),
                   each item Open, Screened (public data or an imported
                   fact: not yet evidence) or Done (a person recorded the
                   evidence), the shovel-ready score, and the verifications
                   that would move the answer most

   THE THREE USES ARE ALTERNATIVES. Each is sized on the WHOLE free
   capacity by itself; they are never added together.

   NO FALSE RESULTS. A size on a ceiling says "ceiling" in its basis and
   carries the verification that would firm it. A use that does not fit is
   answered with what it needs, never sized down to nothing. A figure priced
   at a reference (the chip's public price, the battery set's market) says
   so. Unknown stays unknown: no peak is never a zero peak.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var B = require('./assess-bess'), T = require('./assess-supercharger');
var CM = require('../omega-compute-model'), CC = require('../compute-contract'), D = require('./diligence'), UR = require('../utility-rates');

var VERSION = 1, CONFIG_KEY = 'portfolioAssessment', CONTINUOUS = 0.8;
/* the modular shelf, by IT load. The 75 kW unit is the Omega-Core skid as the
   platform records it; the larger ones are whole nodes of the chosen chip in
   that IT budget, priced at the engine's chipset-scaled midpoint.
   ONE POD A SITE, RIGHT-SIZED (2026-11-09, Tommy: "i dont want to do a model
   of putting more 75 pods on their i want it to be sized by 75, 150, 350,
   500, 750, and 1mW primairly this is because of spacing and we need to
   alo account for chillers"): the largest single unit the power carries is
   the answer, never a row of small ones — every pod brings its own chiller
   and service clearances, so four 75s are four pads where one 350 is one.
   Only the 1 MW Micro pod repeats, in whole megawatts, on a site that
   carries more than one. The chiller's power is inside the PUE: what is
   checked against the free power is IT × PUE at the meter, and the answer
   says how much of that is cooling. The pad itself (the pod, its chiller,
   the clearances) is the maker's figure and is not on file: said, never
   guessed. */
var MODULARS = [
  { key: 'm75', itKw: 75, label: '75 kW', skid: true },
  { key: 'm150', itKw: 150, label: '150 kW' },
  { key: 'm350', itKw: 350, label: '350 kW' },
  { key: 'm500', itKw: 500, label: '500 kW' },
  { key: 'm750', itKw: 750, label: '750 kW' },
  { key: 'm1000', itKw: 1000, label: '1 MW', repeats: true }
];
var COMPUTE_TERM_MONTHS = 72;
/* NANO AND MICRO (2026-11-09, Tommy: "we have Nano Pods which are anything
   sub 1mW and then 1mW and up are micro"): the class is the unit's IT load,
   nothing else. */
var MICRO_FROM_KW = 1000;
function klassOf(itKw) { return itKw < MICRO_FROM_KW ? { key: 'nano', label: 'Nano pod' } : { key: 'micro', label: 'Micro pod' }; }

function num(v) { return v == null || v === '' || !isFinite(Number(v)) ? null : Number(v); }
function r2(v) { return v == null ? null : Math.round(v * 100) / 100; }
function fmt(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
function obj(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
function hash(s) { var h = 0x811c9dc5; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0; } return ('0000000' + h.toString(16)).slice(-8); }
function stateOf(site) { var a = site.address && typeof site.address === 'object' ? site.address : {}; return String(a.state || site.state || '').toUpperCase().trim().slice(0, 2) || null; }

/* the workspace's own settings (billing/current.portfolioAssessment): read
   leniently — a wrong shape is no setting */
function configOf(billing) {
  var raw = obj(billing && billing[CONFIG_KEY]), c = obj(raw.compute), ref = obj(c.reference), fu = obj(raw.funding);
  function within(v, lo, hi) { var n = num(v); return n != null && n >= lo && n <= hi ? n : null; }
  /* the people a workspace names: each by the address they sign in on, once */
  function people(list) {
    var out = [];
    (Array.isArray(list) ? list : []).slice(0, 20).forEach(function (m) {
      m = obj(m); var email = String(m.email || '').toLowerCase().trim();
      if (!/^[^@\s<>"']+@[^@\s<>"']+\.[a-z]{2,}$/.test(email) || out.some(function (x) { return x.email === email; })) return;
      out.push({ name: clean(m.name, 80) || email.split('@')[0], email: email });
    });
    return out;
  }
  /* the funding list: a workspace that funds its own sites names who decides */
  var members = people(fu.members);
  /* the workspace's own gates (its operating rules, never core's) and who sits on its review */
  var ga = obj(raw.gates), rv = obj(raw.review), reviewers = people(rv.members);
  var gates = { minKva: within(ga.minKva, 1, 1000000), minLeaseYears: within(ga.minLeaseYears, 0.1, 99), irrHurdlePct: within(ga.irrHurdlePct, 0, 500) };
  /* what must be true before a site is the workspace's own: bought, the host agreement assigned, a lease of the length it needs */
  var cl = obj(raw.closing), closeYears = within(cl.minLeaseYears, 1, 99);
  return { bess: obj(raw.bess), supercharger: { assumptions: obj(obj(raw.supercharger).assumptions), sizing: obj(obj(raw.supercharger).sizing) },
    compute: { chipset: typeof c.chipset === 'string' ? c.chipset : null, pue: num(c.pue) > 1 && num(c.pue) < 2.5 ? num(c.pue) : null,
      partnerName: typeof c.partnerName === 'string' ? c.partnerName.slice(0, 80) : null, partnerFeePct: num(c.partnerFeePct) >= 0 && num(c.partnerFeePct) <= 50 ? num(c.partnerFeePct) : null,
      termMonths: num(c.termMonths) >= 12 && num(c.termMonths) <= 240 ? Math.floor(num(c.termMonths)) : null,
      /* 'partner': a Nano or Micro pod is priced on the offtake partner's stated per-megawatt figures (compute-contract.js PARTNER.reference), each replaceable here */
      basis: c.basis === 'partner' ? 'partner' : null,
      reference: { capexUsdPerMw: within(ref.capexUsdPerMw, 1e5, 5e8), revenueUsdPerMwYear: within(ref.revenueUsdPerMwYear, 1e4, 5e8), utilityUsdPerMwYear: within(ref.utilityUsdPerMwYear, 0, 5e8),
        gpusPerMw: within(ref.gpusPerMw, 1, 1e5), racksPerMw: within(ref.racksPerMw, 1, 1000), chipset: typeof ref.chipset === 'string' && CM.chipset(ref.chipset) ? ref.chipset : null } },
    funding: fu.mode === 'committee' && members.length ? { mode: 'committee', name: clean(fu.name, 60) || 'Finance committee', members: members } : null,
    gates: gates.minKva != null || gates.minLeaseYears != null || gates.irrHurdlePct != null ? gates : null,
    review: reviewers.length ? { name: clean(rv.name, 60) || 'Executive Review', members: reviewers } : null,
    closing: closeYears != null ? { minLeaseYears: closeYears, agreement: clean(cl.agreement, 60) || 'site host agreement' } : null };
}
function clean(v, n) { return typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n) || null : null; }

/* ── power: the limit, the peak, what is free ──────────────────────────── */
function powerOf(site, screen) {
  site = site || {}; screen = screen || null;
  var kva = num(site.transformerKva), svc = num(site.serviceCapacityKw), entered = num(site.availablePowerMw);
  var limits = [], flags = [], verify = [];
  if (kva > 0) limits.push({ key: 'transformer', kw: Math.round(kva * CONTINUOUS), label: fmt(kva) + ' kVA transformer × ' + CONTINUOUS + ' continuous' });
  if (svc > 0) limits.push({ key: 'service', kw: svc, label: fmt(svc) + ' kW service' });
  var limit = null; limits.forEach(function (l) { if (!limit || l.kw < limit.kw) limit = l; });
  var peak = null, peakBasis = null;
  if (num(site.existingPeakKw) != null) { peak = num(site.existingPeakKw); peakBasis = 'the existing peak on record'; }
  else if (num(site.reportedPeakKw) != null && site.peakUnresolved !== true) { peak = num(site.reportedPeakKw); peakBasis = 'the reported peak'; }
  else if (num(site.reportedPeakKw) != null) flags.push('A reported peak of ' + fmt(num(site.reportedPeakKw)) + ' kW is on file but its definition is unresolved, so it is not subtracted.');
  var out = { transformerKva: kva > 0 ? kva : null, serviceCapacityKw: svc > 0 ? svc : null, limitKw: limit ? limit.kw : null, limitLabel: limit ? limit.label : null, limits: limits,
    peakKw: peak, peakBasis: peakBasis, availableKw: null, basis: null, words: null, grade: 'D', flags: flags, verify: verify };
  if (entered != null) {
    out.availableKw = r2(entered * 1000); out.basis = 'entered'; out.grade = 'B';
    out.words = fmt(out.availableKw) + ' kW free, as entered on the site';
    if (limit && out.availableKw > limit.kw) flags.push('The available power entered (' + fmt(out.availableKw) + ' kW) is more than the limit on file (' + limit.label + ').');
    verify.push({ key: 'power-source', label: 'Record where the available-power figure comes from (a will-serve letter, a load study or 12 months of bills)' });
  } else if (limit && peak != null) {
    var raw = limit.kw - peak; out.availableKw = Math.max(0, r2(raw)); out.basis = 'measured'; out.grade = 'A';
    out.words = limit.label + ', ' + fmt(peak) + ' kW peak, so ' + fmt(out.availableKw) + ' kW free';
    if (raw < 0) flags.push('The peak on file is above the limit on file: nothing is free, and the two figures should be checked.');
  } else if (limit) {
    out.availableKw = limit.kw; out.basis = 'ceiling'; out.grade = 'C';
    out.words = 'Up to ' + fmt(limit.kw) + ' kW (' + limit.label + '): the site’s own peak is not on file, so this is a ceiling, not free capacity';
    verify.push({ key: 'power-peak', label: 'Get the site’s measured peak (12 months of bills or interval data): every size here is a ceiling until then' });
  } else {
    out.words = 'No service, transformer or available-power figure on file';
    verify.push({ key: 'power-limit', label: 'Record the service size or the transformer’s kVA (a nameplate photo, the one-line or the utility’s record)' });
  }
  if (!(kva > 0)) verify.push({ key: 'power-kva', label: 'Confirm the transformer’s kVA (nameplate photo or the utility’s record): it is not on file' });
  var h = screen && screen.hosting;
  if (h && h.coverage === 'read' && num(h.loadKw) != null) {
    out.hosting = { loadKw: num(h.loadKw), circuit: h.circuit || null, source: h.source || null };
    if (out.availableKw != null && out.availableKw > num(h.loadKw)) flags.push('The circuit’s published load hosting figure (' + fmt(num(h.loadKw)) + ' kW' + (h.circuit ? ', ' + h.circuit : '') + ') is below the ' + fmt(out.availableKw) + ' kW sized here: the utility may limit the load.');
  }
  var sub = screen && screen.power;
  if (sub) out.substation = { name: sub.substation || null, kv: num(sub.kv), distanceMi: num(sub.distanceMi) };
  if (screen && screen.utility) out.utility = screen.utility.name || null;
  return out;
}

/* ── what electricity costs HERE (2026-11-09, Tommy: "that utility cost is
   different for every zip code"): the site's own price where one is on
   file, else the rate book's planning figures for its ZIP (else its state)
   on a flat load — energy plus the demand charge spread over every hour.
   null where nothing places the site: the engine's own default is then
   used and said. ── */
function zipOf(site) { var a = site && site.address && typeof site.address === 'object' ? site.address : {}, z = String(a.zip || (site && site.zip) || '').trim(); return /^\d{5}/.test(z) ? z.slice(0, 5) : null; }
function rateOf(site) {
  var own = num(site && site.powerPricePerKwh);
  if (own != null && own > 0) return { perKwh: own, source: 'site', utility: null, words: 'the site’s own power price, $' + own + ' a kWh' };
  var zip = zipOf(site), st = stateOf(site), rec = null, by = null;
  try { if (zip) { rec = UR.lookup(zip); by = 'zip'; } if (!rec && st) { rec = UR.fromState(st); by = 'state'; } } catch (e) { rec = null; }
  var energy = rec ? num(rec.energyRate) : null, demand = rec ? num(rec.demandRate) || 0 : 0;
  if (!(energy > 0)) return null;
  var per = Math.round((energy + demand * 12 / 8760) * 10000) / 10000;
  return { perKwh: per, source: by, utility: rec.name || null, energyRate: energy, demandRate: demand,
    words: (rec.name || 'The serving utility') + '’s planning rates for ' + (by === 'zip' ? 'ZIP ' + zip : st) + ': $' + energy + ' a kWh plus $' + demand + ' a kW-month of demand, $' + per + ' a kWh on a flat load. A planning figure, not the site’s tariff' };
}

/* ── compute: the shelf on the free power, and the chosen unit's return ── */
var econCache = {};
function unitFor(m, chip, pue) {
  var I = CM.readInputs({ chipset: chip.key }), overhead = I.reservedOverhead;
  var nodes = Math.floor(m.itKw * (1 - overhead) / chip.nodeKw + 1e-9), gpus = nodes * chip.gpusPerNode, installed = nodes * chip.nodeKw;
  return { label: m.label + ' modular', word: 'modular', kw: r2(installed * pue), itKw: r2(installed), gpus: gpus, costUsd: CM.dynamicCapex(chip, gpus).mid };
}
/* the offtake partner's reference, per megawatt of IT: the stated figures, each replaceable by the workspace's own */
function referenceOf(cfg) {
  var P = CC.PARTNER, b = P.reference.perMw, o = cfg.compute.reference || {};
  return { name: cfg.compute.partnerName || P.name, feePct: cfg.compute.partnerFeePct != null ? cfg.compute.partnerFeePct : P.feePct, verified: false,
    capexUsdPerMw: o.capexUsdPerMw || b.capexUsd, revenueUsdPerMwYear: o.revenueUsdPerMwYear || b.revenueUsdYear, utilityUsdPerMwYear: o.utilityUsdPerMwYear != null ? o.utilityUsdPerMwYear : b.utilityUsdYear,
    gpusPerMw: o.gpusPerMw || b.gpus, racksPerMw: o.racksPerMw || (o.gpusPerMw ? null : b.racks), chipset: o.chipset || b.chipset,
    own: ['capexUsdPerMw', 'revenueUsdPerMwYear', 'utilityUsdPerMwYear', 'gpusPerMw'].filter(function (k) { return o[k] != null; }) };
}
function musd(n) { return '$' + (Math.round(n / 1e4) / 100) + 'M'; }
/* A COMPUTE PRO FORMA ON WHAT THE OFFTAKE PARTNER SHOWED (2026-11-09, Tommy:
   "a compute pro forma that goes off of what lightsmith energy showed us …
   for 1mW of compute its a 35m investement and … about 26m a year and cost
   4m in utility … but that utility cost is diffeernt for every zip code and
   we need to understand what the offtake is"). The unit is that reference
   scaled by its IT load; the revenue is the stated figure as a take-or-pay
   price a GPU-hour, so the ONE contract engine runs it (its monthly cash,
   its partner fee, its other operating lines, its IRR). It runs twice: on
   this site's electricity, and on the partner's own utility figure, and
   both are answered. Nothing here is a contract or a quote. */
function partnerCase(m, units, cfg, REF, rate, term) {
  var chip = CM.chipset(REF.chipset) || CM.chipset(CM.DEFAULTS.chipset), pue = cfg.compute.pue || CM.DEFAULTS.pue, up = CM.readInputs({ chipset: chip.key }).uptime;
  var mw = m.itKw / 1000, k = klassOf(m.itKw), gpus = Math.floor(REF.gpusPerMw * mw + 1e-9), kw = r2(m.itKw * pue), cost = Math.round(REF.capexUsdPerMw * mw), revenue = REF.revenueUsdPerMwYear * mw;
  if (!(gpus >= 1) || !(cost > 0) || !(revenue > 0)) return { ok: false, reason: 'The partner reference does not size a ' + m.label + ' unit' };
  var unit = { label: m.label + ' ' + k.label, word: 'pod', kw: kw, itKw: m.itKw, gpus: gpus, costUsd: cost }, racks = REF.racksPerMw ? REF.racksPerMw * mw : null;
  if (racks && Math.abs(racks - Math.round(racks)) < 1e-9) { unit.racks = Math.round(racks); unit.rackCostUsd = cost / unit.racks; }
  var kwhYear = kw * 8760 * up, price = revenue / (gpus * 8760 * up), statedElec = REF.utilityUsdPerMwYear * mw / kwhYear;
  function run(elec) {
    var input = { chipset: chip.key, units: units, unit: unit, contract: { termMonths: term, pricePerGpuHour: price, partner: REF.feePct > 0 ? { name: REF.name, feePct: REF.feePct } : false }, site: { route: 'own' }, operating: { electricity: elec } };
    var out; try { out = CC.contractCase(input, {}); } catch (e) { out = null; }
    return out && out.ok !== false && out.priced && out.returns && out.lines && out.lines.length ? out : null;
  }
  var here = rate ? run(rate.perKwh) : null, stated = run(statedElec), main = here || stated;
  if (!main) return { ok: false, reason: 'The compute engine could not price this unit on the partner’s figures' };
  var y1 = main.lines[0], sy = stated ? stated.lines[0] : null, notes = [];
  notes.push(REF.name + '’s figures are as stated and unverified: ' + musd(REF.capexUsdPerMw) + ' of capital and about ' + musd(REF.revenueUsdPerMwYear) + ' of revenue a year for 1 MW of compute, with about ' + musd(REF.utilityUsdPerMwYear) + ' a year of utility' +
    (REF.own.length ? ' (' + REF.own.length + ' of those figures are this workspace’s own).' : '.'));
  if (mw !== 1) notes.push('This ' + m.label + ' ' + k.label + ' is that 1 MW reference scaled by its IT load (× ' + mw + '): ' + musd(cost) + ' of capital' + (unit.racks ? '' : ', not whole racks') + '. Its own price is not on file.');
  notes.push('Revenue is the stated figure, not a contract: the offtake (who buys, at what price, for how long) is not confirmed. It is the same as $' + price.toFixed(2) + ' a GPU-hour, take-or-pay, on ' + fmt(gpus * units) + ' ' + chip.name + ' GPUs.');
  notes.push(here ? 'Utility is this site’s own: ' + fmt(kwhYear * units) + ' kWh a year at $' + rate.perKwh + ' a kWh (' + rate.words + '), rising 3% a year. ' + REF.name + '’s ' + musd(REF.utilityUsdPerMwYear * mw * units) + ' would be $' + statedElec.toFixed(3) + ' a kWh on the same energy: either a dearer market or more than energy. Ask what it covers.'
    : 'Utility is ' + REF.name + '’s stated figure (' + musd(REF.utilityUsdPerMwYear * mw * units) + ' a year, $' + statedElec.toFixed(3) + ' a kWh on this unit’s energy): no ZIP, state or power price is on file to price this site’s own.');
  notes.push('Beyond the stated figures the engine counts network and storage, other variable costs, fixed operating costs and a maintenance reserve (' + musd(y1.opex) + ' in year one)' + (REF.feePct > 0 ? ', and ' + REF.name + '’s ' + REF.feePct + '% of compute revenue (' + musd(y1.partnerFee) + ' a year).' : '.'));
  notes.push('The return is the project IRR on monthly cash over the ' + term + '-month term, annualised, before tax and without debt. No site rent, purchase or host share is in the case.');
  return { ok: true, basis: 'partner', chipset: { key: chip.key, name: chip.name }, gpus: main.sizing.gpus, itKw: main.sizing.itKw, capexUsd: main.totals.capital, termMonths: term,
    irrPct: main.returns.projectIrrPct, irrBasis: 'project IRR over ' + term + ' months on ' + REF.name + '’s stated figures' + (here ? ', electricity at this site’s rate' : ', utility as stated'),
    pricePerGpuHour: Math.round(price * 10000) / 10000, priceBasis: 'partner ref', paybackMonths: main.returns.paybackMonths,
    proforma: { partner: REF.name, verified: false, reference: { capexUsdPerMw: REF.capexUsdPerMw, revenueUsdPerMwYear: REF.revenueUsdPerMwYear, utilityUsdPerMwYear: REF.utilityUsdPerMwYear, feePct: REF.feePct },
      capexUsd: main.totals.capital, revenuePerYear: y1.revenue, partnerFeePerYear: y1.partnerFee, utilityPerYear: y1.power, utilityBasis: here ? 'site' : 'stated', kwhPerYear: Math.round(kwhYear * units),
      otherOperatingPerYear: y1.opex, ebitdaPerYear: y1.ebitda, irrWithoutFeePct: main.returns.irrWithoutFeePct,
      asStated: stated ? { utilityPerYear: sy.power, electricityPerKwh: Math.round(statedElec * 10000) / 10000, ebitdaPerYear: sy.ebitda, irrPct: stated.returns.projectIrrPct, paybackMonths: stated.returns.paybackMonths } : null },
    notes: notes };
}
function computeEconomics(m, units, cfg, site) {
  var rate = rateOf(site), term = cfg.compute.termMonths || COMPUTE_TERM_MONTHS, partner = cfg.compute.basis === 'partner' && !m.skid, REF = partner ? referenceOf(cfg) : null;
  var chip = CM.chipset(cfg.compute.chipset || CM.DEFAULTS.chipset) || CM.chipset(CM.DEFAULTS.chipset), pue = cfg.compute.pue || CM.DEFAULTS.pue;
  var key = [m.key, units, chip.key, pue, rate ? rate.perKwh + rate.words : null, term, cfg.compute.partnerFeePct, cfg.compute.partnerName, REF ? JSON.stringify(REF) : ''].join('|');
  if (econCache[key]) return econCache[key];
  var res;
  if (partner) res = partnerCase(m, units, cfg, REF, rate, term);
  else {
    var input = { chipset: chip.key, units: units, contract: { termMonths: term, partner: cfg.compute.partnerFeePct != null ? { name: cfg.compute.partnerName || 'the offtake partner', feePct: cfg.compute.partnerFeePct } : false }, site: { route: 'own' }, operating: {} };
    if (cfg.compute.pue) input.operating.pue = cfg.compute.pue;
    if (rate) input.operating.electricity = rate.perKwh;
    if (!m.skid) input.unit = unitFor(m, chip, pue);
    var out; try { out = CC.contractCase(input, {}); } catch (e) { out = null; }
    if (!out || out.ok === false) return { ok: false, reason: 'The compute engine could not price this unit' };
    var e = D.economicsFromCase(out, input, null), at = e.irrAt, notes = [];
    notes.push(m.skid ? 'The 75 kW unit is the Omega-Core skid at its recorded system cost.' : 'Capital is the engine’s chipset-scaled midpoint for ' + fmt(e.gpus) + ' ' + chip.name + ' GPUs, an estimate, not a quote.');
    notes.push(at ? 'Priced at the chip’s public ' + at.basis + ' reference ($' + at.price + ' a GPU-hour): no contract price is set, so this is a screening figure.' : 'The chip has no public reference price, so no return is shown until a contract price is set.');
    notes.push(rate ? 'Electricity: ' + rate.words + '.' : 'Electricity is the engine’s default ($' + CM.DEFAULTS.electricity + ' a kWh): no ZIP, state or power price is on file for this site.');
    notes.push('The return is the project IRR on monthly cash over the ' + term + '-month term, annualised, before tax and without debt.');
    notes.push('No site rent, purchase or host share is in the case' + (cfg.compute.partnerFeePct != null ? '; the offtake partner’s ' + cfg.compute.partnerFeePct + '% fee is.' : ', and no partner fee.'));
    res = { ok: true, basis: 'spot', chipset: { key: chip.key, name: chip.name }, gpus: e.gpus, itKw: e.computeKw, capexUsd: e.capexUsd, termMonths: term,
      irrPct: at ? at.pct : null, irrBasis: at ? 'project IRR at the public ' + at.basis + ' reference, $' + at.price + ' a GPU-hour' : null, pricePerGpuHour: at ? at.price : null, priceBasis: at ? at.basis : null,
      paybackMonths: at ? at.paybackMonths : null, notes: notes };
  }
  if (res.ok) res.electricity = rate ? { perKwh: rate.perKwh, source: rate.source, utility: rate.utility } : { perKwh: null, source: 'default', utility: null };
  if (Object.keys(econCache).length > 400) econCache = {};   /* a site's own power price is in the key */
  econCache[key] = res;
  return res;
}
function computeOf(power, cfg, site) {
  var pue = cfg.compute.pue || CM.DEFAULTS.pue, kw = power.availableKw;
  var shelf = MODULARS.map(function (m) { var need = Math.round(m.itKw * pue), k = klassOf(m.itKw), n = kw != null ? Math.floor(kw / need + 1e-9) : 0; return { key: m.key, label: m.label, klass: k.key, klassLabel: k.label, itKw: m.itKw, meterKw: need, coolingKw: need - m.itKw, fits: kw != null && kw >= need, units: m.repeats ? n : Math.min(n, 1) }; });
  var out = { pue: pue, shelf: shelf, chosen: null, fits: false, basis: power.basis, words: null };
  if (kw == null) { out.words = 'No power figure to size compute on'; return out; }
  var pick = null; shelf.forEach(function (s) { if (s.fits) pick = s; });
  if (!pick) { out.words = fmt(kw) + ' kW does not carry the smallest unit (' + shelf[0].label + ' of IT needs ' + fmt(shelf[0].meterKw) + ' kW at the meter)'; out.needKw = shelf[0].meterKw; return out; }
  var m = MODULARS.filter(function (x) { return x.key === pick.key; })[0], units = pick.units;
  out.fits = true;
  out.chosen = { key: pick.key, label: pick.label, klass: pick.klass, klassLabel: pick.klassLabel, units: units, itKw: pick.itKw * units, meterKw: pick.meterKw * units, coolingKw: pick.coolingKw * units, leftKw: r2(kw - pick.meterKw * units) };
  out.words = (units > 1 ? units + ' × ' : '') + pick.label + ' of IT (' + fmt(out.chosen.meterKw) + ' kW at the meter at PUE ' + pue + ') on ' + fmt(kw) + ' kW' + (power.basis === 'ceiling' ? ', a ceiling' : power.basis === 'upgrade' ? ' after the upgrade' : ' free');
  /* the chiller, in power and in space */
  out.cooling = { kw: out.chosen.coolingKw, words: fmt(out.chosen.coolingKw) + ' kW of the ' + fmt(out.chosen.meterKw) + ' kW at the meter is the chiller, pumps and losses (PUE ' + pue + '); ' + fmt(out.chosen.itKw) + ' kW reaches the IT' };
  out.space = { pods: units, words: (units > 1 ? units + ' pods, each with its own chiller' : 'One pod and its chiller') + ' on the site: the pad (the pod, the chiller and the service clearances) is the maker’s figure and is not on file. Confirm it fits before the site is approved' };
  out.economics = computeEconomics(m, units, cfg, site);
  return out;
}

/* ── the compute site-readiness checklist ──────────────────────────────── */
var CHECKLIST = [
  { key: 'control', label: 'Site control & legal', items: [
    ['control-evidence', 'Evidence of ownership, long-term lease, option or other site control sufficient for the operating term'],
    ['control-title', 'Current title report or commitment with ALTA/NSPS survey'],
    ['control-easements', 'All easements, encumbrances, covenants and restrictions affecting the site identified'],
    ['control-authority', 'Authority to develop and operate a modular compute container confirmed'],
    ['control-consents', 'Required consents from landowners, lenders or other stakeholders'] ] },
  { key: 'zoning', label: 'Zoning & land use', items: [
    ['zoning-designation', 'Current zoning designation and confirmation of permitted uses'],
    ['zoning-use', 'Modular data center, industrial or compute use allowed by right or by special permit'],
    ['zoning-variances', 'Status of any required variances, conditional use permits or rezoning'],
    ['zoning-setbacks', 'Setback, height, lot coverage and impervious surface compliance for the container and its support equipment'],
    ['zoning-overlays', 'Overlay districts or special regulations (floodplain, historic)'] ] },
  { key: 'permitting', label: 'Permitting', items: [
    ['permit-building', 'Building and structural permits for the container foundation or pad'],
    ['permit-electrical', 'Electrical permits for the unit’s power distribution'],
    ['permit-mechanical', 'Mechanical and plumbing permits for the liquid cooling systems'],
    ['permit-environmental', 'Environmental permits (air, water, stormwater, noise) as applicable'],
    ['permit-summary', 'Local, county, state and federal permit status summary'],
    ['permit-timeline', 'Anticipated timeline to obtain the remaining permits'] ] },
  { key: 'power', label: 'Power, generation & interconnection', items: [
    ['power-capacity', 'Available or planned utility capacity sufficient for the unit’s total facility load'],
    ['power-interconnection', 'Interconnection application filed; status of studies, queue position and timelines'],
    ['power-generation', 'On-site generation plan (if applicable), with redundancy appropriate to the offtake'],
    ['power-net', 'Continuous net capacity confirmed, accounting for derating, site conditions and auxiliary loads'],
    ['power-oneline', 'Electrical one-line concept for distribution to the container, including redundancy'],
    ['power-protection', 'Metering, switchgear and protection requirements identified'],
    ['power-strategy', 'Power source strategy: grid, on-site generation or hybrid'],
    ['power-evidence', 'Evidence of generation or utility capacity for diligence'] ] },
  { key: 'physical', label: 'Physical site characteristics', items: [
    ['physical-area', 'Adequate level area for the container and its support equipment'],
    ['physical-geotech', 'Geotechnical report supporting the foundation or pad design'],
    ['physical-access', 'Site access suitable for delivery of a large container (road widths, turning radii, crane staging)'],
    ['physical-drainage', 'Drainage and stormwater plan that accommodates the pad and equipment'],
    ['physical-cooling', 'Liquid cooling infrastructure: water supply, discharge or closed-loop plan, treatment needs'],
    ['physical-security', 'Security perimeter, fencing, lighting and access control concepts'],
    ['physical-fire', 'Separation distances and fire protection for the container and any generators'],
    ['physical-expansion', 'Expansion space, if future growth is contemplated'] ] },
  { key: 'connectivity', label: 'Connectivity', items: [
    ['conn-fiber', 'Dedicated symmetrical fiber available to the site'],
    ['conn-bandwidth', 'Bandwidth appropriate to the offtake (target against the preferred 5–10 Gbps)'],
    ['conn-providers', 'Fiber providers and route options identified'],
    ['conn-diversity', 'Route diversity or redundancy options, if the offtake requires them'],
    ['conn-latency', 'Estimated latency and any special routing requirements for the offtaker'],
    ['conn-cost', 'Responsibility and cost allocation for the fiber build-out documented'] ] },
  { key: 'environmental', label: 'Environmental & other diligence', items: [
    ['env-phase1', 'Phase I Environmental Site Assessment completed'],
    ['env-flood', 'Flood zone determination (FEMA) and any elevation requirements'],
    ['env-wetlands', 'Wetlands, endangered species and cultural resources screening'],
    ['env-air', 'Air quality permitting needs for any on-site generators'],
    ['env-noise', 'Noise study or assessment, if local ordinances require one'],
    ['env-other', 'Other site-specific risks (contamination, seismic, wildfire)'] ] },
  { key: 'package', label: 'Readiness package for diligence', items: [
    ['package-evidence', 'Compiled package of evidence for site control, zoning, permitting, capacity, interconnection and readiness'],
    ['package-open', 'Summary of open items and mitigation plans'],
    ['package-alignment', 'Alignment with the unit’s power budget and planning quantity'],
    ['package-liquid', 'Confirmation the site supports liquid-cooled containerized systems to specification'],
    ['package-review', 'Ready for joint review toward the definitive agreement'] ] }
];
var ITEM_KEYS = []; CHECKLIST.forEach(function (s) { s.items.forEach(function (i) { ITEM_KEYS.push(i[0]); }); });
var CHECK_STATES = ['open', 'done', 'na'];

/* what the screens and the record already say about an item: Screened (it
   is not yet evidence), or a hint on an item still open */
function evidenceFor(key, c) {
  var p = c.power, sc = c.screen || {}, pa = c.parcel || {}, f = sc.fiber || null, site = c.site;
  function scr(words, source) { return { state: 'screened', words: words, source: source }; }
  function hint(words) { return { state: 'open', words: words, source: null }; }
  if (key === 'control-evidence') { var t = num(site.termYearsRemaining); if (t != null) return scr(t + ' years left on the host agreement, as recorded; the agreement itself is not on file', 'Site record'); if (pa.owner) return hint('Parcel owner on the public record: ' + pa.owner); }
  if (key === 'zoning-designation' && pa.zoning) return scr('Zoned ' + pa.zoning + ' on the parcel record' + (pa.county ? ' (' + pa.county + ')' : '') + '; the permitted uses are not confirmed', 'Parcel record');
  if (key === 'power-capacity') {
    if (c.compute.fits && (p.basis === 'measured' || p.basis === 'entered')) return scr(p.words + ': carries ' + c.compute.words, 'Site record');
    if (c.compute.fits && p.basis === 'ceiling') return hint('A ceiling only: ' + p.words);
    if (p.availableKw != null) return hint(c.compute.words);
    return hint(p.words);
  }
  if (key === 'power-interconnection' && c.upgrade && c.upgrade.status === 'requested') return scr('A utility-side upgrade to ' + fmt(c.upgrade.targetKw) + ' kW is requested' + (c.upgrade.askedBy ? ' through ' + c.upgrade.askedBy : '') + '; the utility’s answer is not on file', 'Site record');
  if (key === 'power-interconnection' && p.hosting) return scr('The utility publishes ' + fmt(p.hosting.loadKw) + ' kW of load hosting' + (p.hosting.circuit ? ' on circuit ' + p.hosting.circuit : '') + '; no application is on file', p.hosting.source || 'Utility hosting capacity');
  if (key === 'power-net' && p.transformerKva) return scr(fmt(p.transformerKva) + ' kVA × ' + CONTINUOUS + ' continuous = ' + fmt(p.transformerKva * CONTINUOUS) + ' kW, before the site’s own load', 'Site record');
  if (key === 'power-evidence' && p.substation && p.substation.name) return scr('Nearest substation: ' + p.substation.name + (p.substation.kv ? ', ' + p.substation.kv + ' kV' : '') + (p.substation.distanceMi != null ? ', ' + p.substation.distanceMi + ' mi' : '') + (p.utility ? ' · ' + p.utility : '') + '; a will-serve letter is the evidence', 'Grid Atlas');
  if (key === 'physical-area' && num(pa.acres) == null && c.compute.fits && c.compute.space) return hint(c.compute.space.words);
  if (key === 'physical-area' && num(pa.acres) != null) return scr('Parcel of ' + r2(num(pa.acres)) + ' acres on the parcel record; a level pad is not confirmed', 'Parcel record');
  if (f) {
    if (key === 'conn-fiber') { if (f.carriersRead && f.carriers && f.carriers.length) return scr(f.carriers.length + ' carrier' + (f.carriers.length === 1 ? '' : 's') + ' at the address' + (f.symmetric1g === true ? ', 1 Gbps symmetric offered' : f.symmetric1g === false ? ', no 1 Gbps symmetric service read' : ''), 'FCC broadband data'); if (f.carriersNote) return hint('Fiber not read: ' + f.carriersNote + (f.lateralMi != null ? ' · lateral estimate ' + f.lateralMi + ' mi' : '')); }
    if (key === 'conn-bandwidth' && f.symmetric1g === true) return scr('1 Gbps symmetric is offered at the address; the 5–10 Gbps target needs a carrier quote', 'FCC broadband data');
    if (key === 'conn-providers' && f.carriersRead && f.carriers && f.carriers.length) return scr(f.carriers.slice(0, 4).join(', ') + (f.carriers.length > 4 ? ' and ' + (f.carriers.length - 4) + ' more' : ''), 'FCC broadband data');
    if (key === 'conn-latency' && f.carrierHotel) return scr('Nearest carrier hotel: ' + f.carrierHotel + (f.carrierHotelMi != null ? ', ' + f.carrierHotelMi + ' mi' : ''), 'PeeringDB');
  }
  if (key === 'package-alignment' && c.compute.fits) return scr('Sized: ' + c.compute.words, 'This assessment');
  return null;
}
function readinessOf(c, marks) {
  marks = obj(marks);
  var total = 0, done = 0, screened = 0, na = 0, sections = CHECKLIST.map(function (s) {
    var items = s.items.map(function (it) {
      var m = obj(marks[it[0]]), ev = evidenceFor(it[0], c), state = m.state === 'done' || m.state === 'na' ? m.state : ev && ev.state === 'screened' ? 'screened' : 'open';
      total++; if (state === 'done') done++; else if (state === 'screened') screened++; else if (state === 'na') na++;
      return { key: it[0], label: it[1], state: state, words: ev ? ev.words : null, source: ev ? ev.source : null, note: m.note || null, by: m.by || null, at: m.at || null };
    });
    var d = items.filter(function (i) { return i.state === 'done'; }).length, n = items.filter(function (i) { return i.state === 'na'; }).length;
    return { key: s.key, label: s.label, items: items, done: d, of: items.length - n };
  });
  var of = total - na;
  return { sections: sections, total: total, applicable: of, done: done, screened: screened, open: of - done - screened,
    pct: of ? Math.round(done / of * 100) : 0, screenedPct: of ? Math.round((done + screened) / of * 100) : 0,
    label: of && done === of ? 'Shovel ready' : done ? 'In diligence' : screened ? 'Screened' : 'Not started' };
}

/* the verifications that would move the answer most, power first */
function verificationsOf(c, readiness) {
  var out = c.power.verify.slice(), sc = c.screen || null, pa = c.parcel || null, f = sc && sc.fiber;
  if (c.upgrade && c.upgrade.status === 'requested') out.unshift({ key: 'upgrade', label: 'Follow the utility-side upgrade request (' + fmt(c.upgrade.targetKw) + ' kW' + (c.upgrade.askedBy ? ', asked for by ' + c.upgrade.askedBy : '') + '): get the utility’s written answer, its cost and its schedule' });
  if (c.upgrade && c.upgrade.status === 'granted') out.unshift({ key: 'upgrade-record', label: 'The upgrade to ' + fmt(c.upgrade.targetKw) + ' kW is marked granted: record the new service or transformer on the site so every size follows' });
  function open(key) { var hit = null; readiness.sections.forEach(function (s) { s.items.forEach(function (i) { if (i.key === key) hit = i; }); }); return hit && hit.state !== 'done' && hit.state !== 'na'; }
  if (sc && sc.located && sc.located.approximate) out.push({ key: 'address', label: 'Confirm the address: it matched only approximately, so nothing was screened on it' });
  if (open('power-evidence')) out.push({ key: 'will-serve', label: 'Ask the utility for a will-serve letter for the load' + (c.power.utility ? ' (' + c.power.utility + ')' : '') });
  if (open('control-evidence')) out.push({ key: 'control', label: 'Put the site-control document on file (deed, lease, option or the host agreement and its amendment)' });
  if (open('zoning-use')) out.push({ key: 'zoning', label: 'Confirm with the jurisdiction that compute is a permitted use' + (pa && pa.zoning ? ' in ' + pa.zoning : '') });
  if (open('conn-fiber') && !(f && f.carriersRead && f.carriers && f.carriers.length)) out.push({ key: 'fiber', label: 'Get a carrier’s quote for dedicated symmetrical fiber to the site' });
  if (!sc) out.push({ key: 'screen', label: 'Run the Grid Atlas and parcel screens: the substation, the utility, fiber and zoning are not read yet' });
  return out.slice(0, 8);
}

/* ── what the site is good for, and the call a person makes on it ──────── */
var USES = [
  { key: 'compute', label: 'Compute', scope: 'compute' },
  { key: 'bess', label: 'Battery storage', scope: 'bess' },
  { key: 'supercharger', label: 'Fast charging', scope: 'dcfc' }
];
var PREDEV_STATUS = 'Pre-development';
/* the uses that fit, each with its screening return, and the highest: the
   returns are on different bases (said), so this ranks a screen, not a deal */
function recommendOf(compute, bess, sup) {
  var fits = [];
  if (compute && compute.fits) fits.push({ use: 'compute', label: 'Compute', size: compute.chosen ? (compute.chosen.units > 1 ? compute.chosen.units + ' × ' : '') + compute.chosen.label : null, irrPct: compute.economics && compute.economics.ok ? compute.economics.irrPct : null });
  if (bess && bess.ok) fits.push({ use: 'bess', label: 'Battery storage', size: fmt(bess.sizing.kw) + ' kW / ' + fmt(bess.sizing.kwh) + ' kWh', irrPct: bess.returns.irrPct, noNetInvestment: bess.returns.noNetInvestment === true });
  if (sup && sup.ok) fits.push({ use: 'supercharger', label: 'Fast charging', size: sup.sizing.posts + ' posts', irrPct: sup.returns.irrPct });
  var best = null; fits.forEach(function (f) { if (f.irrPct != null && (!best || f.irrPct > best.irrPct)) best = f; });
  return { fits: fits, best: best ? best.use : null,
    words: !fits.length ? 'Nothing fits the power on file' : best ? best.label + ' shows the highest screening return (' + best.irrPct + '%); the three are on different bases, so compare them in the detail' : fits.map(function (f) { return f.label; }).join(', ') + ' fit' };
}
/* a person's approval for pre-development: the uses named, or withdrawn */
function decisionOf(input, ctx) {
  input = input || {}; ctx = ctx || {};
  var keys = USES.map(function (u) { return u.key; }), raw = Array.isArray(input.uses) ? input.uses : (input.uses == null || input.uses === '' ? [] : String(input.uses).split(','));
  var uses = []; raw.forEach(function (u) { u = String(u).trim().toLowerCase(); if (!u) return; if (keys.indexOf(u) < 0) { var e = new Error('"' + u + '" is not compute, bess or supercharger'); e.status = 400; throw e; } if (uses.indexOf(u) < 0) uses.push(u); });
  uses.sort(function (a, b) { return keys.indexOf(a) - keys.indexOf(b); });
  var note = typeof input.note === 'string' ? input.note.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 500) : null;
  if (!uses.length) return { status: 'withdrawn', uses: [], label: null, scopes: [], by: ctx.by || null, at: ctx.now || null, note: note || null };
  var picked = USES.filter(function (u) { return uses.indexOf(u.key) >= 0; });
  return { status: 'approved', uses: uses, hybrid: uses.length > 1, label: picked.map(function (u) { return u.label; }).join(' + '), scopes: picked.map(function (u) { return u.scope; }),
    by: ctx.by || null, at: ctx.now || null, note: note || null };
}

/* ── A UTILITY-SIDE UPGRADE REQUEST (2026-11-09, Tommy: "a way to mark the
   site that we are requesting a utiltiy side upgrade to support the larger
   compute offtake. meaning that we are going to have our partner ask for
   more power"). A mark a person makes: the power asked for at the meter,
   who is asking, and where it stands (requested, granted, declined). It
   never changes what is sized today: the free power stays the fact on
   file, and the compute the upgrade WOULD carry rides beside it, said as
   such. Granted is still a mark: the new service is recorded on the site,
   and the sizes follow from that fact. ── */
var UPGRADE_STATES = ['requested', 'granted', 'declined', 'withdrawn'];
function fail(status, message) { var e = new Error(message); e.status = status; return e; }
/* cur: the stored record or null. input: { status?, targetKw?, unit?, askedBy?, note? }. ctx: { by, now, limitKw, partner, pue } */
function upgradeOf(cur, input, ctx) {
  input = input || {}; ctx = ctx || {}; cur = cur && typeof cur === 'object' ? cur : null;
  var status = String(input.status || 'requested').toLowerCase().trim();
  if (UPGRADE_STATES.indexOf(status) < 0) throw fail(400, 'An upgrade request is requested, granted, declined or withdrawn');
  var live = cur && cur.status !== 'withdrawn' ? cur : null, target = null, unit = null;
  if (status !== 'requested' && !live) throw fail(409, 'There is no upgrade request on this site to mark ' + status);
  if (status === 'requested') {
    if (input.unit != null && input.unit !== '') {
      var m = MODULARS.filter(function (x) { return x.key === String(input.unit); })[0];
      if (!m) throw fail(400, 'That is not a unit on the compute shelf');
      var need = Math.round(m.itKw * (ctx.pue || CM.DEFAULTS.pue));
      /* the unit needs `need` kW FREE: where the site's own load already takes part of the limit, the ask is the limit plus what is short */
      target = ctx.limitKw != null && ctx.availableKw != null ? Math.max(need, Math.round(ctx.limitKw + Math.max(0, need - ctx.availableKw))) : need; unit = m.key;
    } else target = num(input.targetKw);
    if (target == null && live) { target = live.targetKw; unit = live.unit || null; }
    if (!(target >= 1 && target <= 200000)) throw fail(400, 'Say how much power is being asked for at the meter (kW), or pick the unit it is for');
    if (ctx.limitKw != null && target <= ctx.limitKw) throw fail(400, 'The site already has ' + fmt(ctx.limitKw) + ' kW on file: an upgrade asks for more than that');
  } else { target = live.targetKw; unit = live.unit || null; }
  var note = clean(input.note, 500), askedBy = clean(input.askedBy, 80) || (live && live.askedBy) || clean(ctx.partner, 80) || null;
  var history = (cur && Array.isArray(cur.history) ? cur.history : []).concat([{ status: status, targetKw: target, by: ctx.by || null, at: ctx.now || null, note: note }]).slice(-20);
  return { status: status, targetKw: target, unit: unit, askedBy: askedBy, note: note || (status === 'requested' && live ? live.note || null : null),
    requestedBy: status === 'requested' && !live ? ctx.by || null : (live && live.requestedBy) || ctx.by || null, requestedAt: status === 'requested' && !live ? ctx.now || null : (live && live.requestedAt) || ctx.now || null,
    by: ctx.by || null, at: ctx.now || null, history: history };
}
/* what the answer says of it: the request, and the compute it would carry */
function upgradeView(u, power, cfg, site) {
  if (!u || typeof u !== 'object' || u.status === 'withdrawn' || !(num(u.targetKw) > 0)) return null;
  var target = num(u.targetKw), from = power.limitKw, add = from != null ? Math.max(0, r2(target - from)) : null;
  /* what it would carry is judged on what would be FREE: the new service less the load the site already puts on it */
  var used = from != null && power.availableKw != null ? Math.max(0, from - power.availableKw) : 0;
  var c = computeOf({ availableKw: Math.max(0, r2(target - used)), basis: 'upgrade' }, cfg, site), e = c.economics || {};
  var ask = 'a utility-side upgrade to ' + fmt(target) + ' kW' + (add != null ? ' (' + fmt(add) + ' kW more than the ' + fmt(from) + ' kW limit on file)' : ''), who = u.askedBy ? ', asked for by ' + u.askedBy : '';
  var words = u.status === 'requested' ? 'Requested: ' + ask + who + '. Nothing is sized on it until the utility grants it.'
    : u.status === 'granted' ? 'Granted: ' + ask + who + '. Record the new service on the site so every size follows from it.'
    : 'Declined: ' + ask + who + '. The site stays on the power it has.';
  return { status: u.status, targetKw: target, fromKw: from, addKw: add, unit: u.unit || null, askedBy: u.askedBy || null, note: u.note || null, requestedBy: u.requestedBy || null, requestedAt: u.requestedAt || null, by: u.by || null, at: u.at || null, words: words,
    compute: c.fits && c.chosen ? { label: (c.chosen.units > 1 ? c.chosen.units + ' × ' : '') + c.chosen.label, klass: c.chosen.klass, klassLabel: c.chosen.klassLabel, meterKw: c.chosen.meterKw, words: c.words,
      irrPct: e.ok ? e.irrPct : null, priceBasis: e.ok ? e.priceBasis : null, capexUsd: e.ok ? e.capexUsd : null } : null };
}

/* BESIDE THE POD: A BATTERY ON WHAT IT LEAVES (2026-11-09, Tommy, of a
   400 kW site that had read four 75 kW skids: "it should just be a 150kW
   compute and then allow us to maybe put a bess on their or request for
   more xfrmr power"). One right-sized pod seldom uses the whole free power;
   the same battery engine answers a battery of the kW left, so the pod and
   that battery together are a pair that fits, where the three whole-capacity
   uses stay alternatives. Under PAIR_MIN_KW there is nothing worth a pad. */
var PAIR_MIN_KW = 50;
function pairingOf(compute, site, st, power, cfg) {
  var ch = compute && compute.fits ? compute.chosen : null;
  if (!ch || !(ch.leftKw >= PAIR_MIN_KW)) return null;
  var b = B.bessCase({ powerKw: ch.leftKw, state: st, utility: power.utility || site.utility || null, assumptions: cfg.bess });
  if (!b.ok) return null;
  var pod = (ch.units > 1 ? ch.units + ' × ' : '') + ch.label + ' ' + ch.klassLabel, ret = b.returns.noNetInvestment ? 'no net capital' : b.returns.irrPct != null ? b.returns.irrPct + '%' : 'no return shown';
  return { leftKw: ch.leftKw, pod: pod,
    bess: { kw: b.sizing.kw, kwh: b.sizing.kwh, capexUsd: b.capex.total, netCapexUsd: b.capex.net, irrPct: b.returns.irrPct, noNetInvestment: b.returns.noNetInvestment === true, irrBasis: b.returns.irrBasis, npv: b.returns.npv, marketFit: b.market.fit },
    words: 'Beside the ' + pod + ', the ' + fmt(ch.leftKw) + ' kW it leaves carries a ' + fmt(b.sizing.kw) + ' kW / ' + fmt(b.sizing.kwh) + ' kWh battery (' + ret + (b.market.fit !== 'zone' ? ', at reference rates' : '') + '). The pod and this battery together fit the free power; the battery above is sized on all of it by itself.' };
}

/* THE UPGRADE TO ASK FOR (2026-11-09, Tommy: "we should also be requesting
   for anything not 1mW for a utility upgrade"): a site that is sized and
   does not carry the 1 MW Micro pod says what the utility would have to add
   for it, and what the next size up needs, with the compute that would
   follow. It is advice, DERIVED, never a mark: nothing has been asked of
   anybody until a person marks the request (assess-upgrade), one site or
   the whole selection at once. A site with no power figure has none: it
   needs its power on file first. */
function upgradeAdviceOf(power, compute, cfg, site, mark) {
  if (mark || power.availableKw == null) return null;
  var goal = MODULARS[MODULARS.length - 1], chosen = compute.chosen || null;
  if (chosen && chosen.key === goal.key) return null;
  var shelf = compute.shelf || [], g = shelf.filter(function (u) { return u.key === goal.key; })[0]; if (!g) return null;
  var free = power.availableKw, short = Math.max(0, r2(g.meterKw - free)), target = power.limitKw != null ? Math.round(power.limitKw + short) : g.meterKw;
  var next = shelf.filter(function (u) { return !u.fits && u.key !== goal.key; })[0] || null, nextShort = next ? Math.max(0, r2(next.meterKw - free)) : null;
  var c = computeOf({ availableKw: g.meterKw, basis: 'upgrade' }, cfg, site), e = c.economics || {};
  var has = chosen ? 'carries a ' + chosen.label + ' ' + chosen.klassLabel + ' today' : 'carries no pod today';
  return { unit: goal.key, label: goal.label + ' ' + g.klassLabel, needKw: g.meterKw, shortKw: short, targetKw: target,
    next: next && nextShort > 0 ? { unit: next.key, label: next.label + ' ' + next.klassLabel, needKw: next.meterKw, shortKw: nextShort } : null,
    compute: e.ok ? { irrPct: e.irrPct, priceBasis: e.priceBasis, capexUsd: e.capexUsd } : null,
    words: 'To request: ' + fmt(free) + ' kW ' + has + '. A ' + goal.label + ' ' + g.klassLabel + ' needs ' + fmt(g.meterKw) + ' kW free at the meter, ' + fmt(short) + ' kW more' + (power.limitKw != null ? ' (a ' + fmt(target) + ' kW service)' : '') +
      (next && nextShort > 0 ? '; ' + fmt(nextShort) + ' kW more would already carry a ' + next.label + ' ' + next.klassLabel : '') + '. Nothing has been asked of the utility yet.' };
}

/* ── THE FUNDING LIST (2026-11-09, Tommy: "we dont need to send to the
   marketplace we are funding these sites so we essentially need to send
   this to a list that we can approve for funding or not and it needs to be
   screened first then approved by our finance committe"). A workspace that
   funds its own sites names its committee in its settings
   (portfolioAssessment.funding); there the finance marketplace stands down
   and a site goes: screened → submitted → approved or declined by a member
   of the committee. Pure: the door reads the record and the settings and
   enforces who may do what. ── */
var FUND_STATES = ['submitted', 'approved', 'declined', 'withdrawn'];
function committeeMember(cfg, email) {
  var f = cfg && cfg.funding, e = String(email || '').toLowerCase().trim();
  if (!f || !e) return null;
  return f.members.filter(function (m) { return m.email === e; })[0] || null;
}
function committeeWords(cfg) { var f = cfg && cfg.funding; return f ? f.name + ' (' + f.members.map(function (m) { return m.name; }).join(', ') + ')' : 'the finance committee'; }
/* what is asked for: the uses named, each with its size, capital and screening return off the assessment */
function fundingRequest(result, usesIn) {
  var keys = USES.map(function (u) { return u.key; }), raw = Array.isArray(usesIn) ? usesIn : (usesIn == null || usesIn === '' ? [] : String(usesIn).split(',')), uses = [];
  raw.forEach(function (u) { u = String(u).trim().toLowerCase(); if (!u) return; if (keys.indexOf(u) < 0) throw fail(400, '"' + u + '" is not compute, bess or supercharger'); if (uses.indexOf(u) < 0) uses.push(u); });
  if (!uses.length) throw fail(400, 'Say what the funding is for: compute, a battery, fast charging, or more than one');
  uses.sort(function (a, b) { return keys.indexOf(a) - keys.indexOf(b); });
  var r = result || {}, c = r.compute || {}, ce = c.economics || {}, b = r.bess || {}, s = r.supercharger || {}, lines = [];
  /* compute with a battery, and nothing else: the pod and the battery on what it leaves, a pair that fits and so has one amount */
  var pair = uses.length === 2 && uses[0] === 'compute' && uses[1] === 'bess' && r.pairing ? r.pairing : null;
  uses.forEach(function (u) {
    if (u === 'compute') { if (!(c.fits && c.chosen && ce.ok)) throw fail(400, 'Compute does not fit this site on the power on file, so there is no figure to fund'); lines.push({ use: u, label: 'Compute', size: (c.chosen.units > 1 ? c.chosen.units + ' × ' : '') + c.chosen.label + ' ' + (c.chosen.klassLabel || ''), capexUsd: ce.capexUsd, irrPct: ce.irrPct, irrBasis: ce.irrBasis || null }); }
    if (u === 'bess' && pair) { lines.push({ use: u, label: 'Battery storage', size: fmt(pair.bess.kw) + ' kW / ' + fmt(pair.bess.kwh) + ' kWh on the ' + fmt(pair.leftKw) + ' kW the pod leaves', capexUsd: pair.bess.capexUsd, irrPct: pair.bess.irrPct, irrBasis: pair.bess.irrBasis || null }); return; }
    if (u === 'bess') { if (!b.ok) throw fail(400, 'A battery does not fit this site on the power on file, so there is no figure to fund'); lines.push({ use: u, label: 'Battery storage', size: fmt(b.sizing.kw) + ' kW / ' + fmt(b.sizing.kwh) + ' kWh', capexUsd: b.capex.total, irrPct: b.returns.irrPct, irrBasis: b.returns.irrBasis || null }); }
    if (u === 'supercharger') { if (!s.ok) throw fail(400, 'Fast charging does not fit this site on the power on file, so there is no figure to fund'); lines.push({ use: u, label: 'Fast charging', size: s.sizing.posts + ' posts', capexUsd: s.capex.total, irrPct: s.returns.irrPct, irrBasis: s.returns.irrBasis || null }); }
  });
  var one = lines.length === 1;
  return { uses: uses, hybrid: !one, paired: !!pair, label: lines.map(function (l) { return l.label; }).join(' + '), lines: lines, amountUsd: one ? lines[0].capexUsd : pair ? Math.round(lines[0].capexUsd + lines[1].capexUsd) : null,
    words: one ? null : pair ? 'The pod, and a battery on the ' + fmt(pair.leftKw) + ' kW it leaves: the two fit the free power together, so this is one amount.' : 'Each use is sized on the whole free capacity by itself, so a hybrid has no single amount: the committee sees each line.' };
}
/* action: submit | decide | withdraw. ctx: { by, now, config, result, screened, canEdit } */
function fundingChange(cur, action, input, ctx) {
  input = input || {}; ctx = ctx || {}; cur = cur && typeof cur === 'object' ? cur : null;
  var cfg = ctx.config, f = cfg && cfg.funding, status = cur ? cur.status : null, note = clean(input.note, 500);
  if (!f) throw fail(409, 'This workspace has no funding list: it sends a site’s capital request to the finance marketplace');
  function hist(st) { return (cur && Array.isArray(cur.history) ? cur.history : []).concat([{ status: st, by: ctx.by || null, at: ctx.now || null, note: note }]).slice(-30); }
  if (action === 'submit') {
    if (ctx.canEdit === false) throw fail(403, 'Your role in this workspace can read the funding list but not submit to it');
    if (!ctx.result) throw fail(409, 'Run the assessment first: there is nothing to put in front of ' + f.name.toLowerCase());
    if (!ctx.screened) throw fail(409, 'Screen the site first: the Grid Atlas and parcel screens have not finished on it, and ' + f.name.toLowerCase() + ' sees screened sites only');
    if (status === 'approved') throw fail(409, 'Funding is already approved on this site; ' + f.name.toLowerCase() + ' changes its own decision');
    var req = fundingRequest(ctx.result, input.uses);
    return { status: 'submitted', uses: req.uses, hybrid: req.hybrid, label: req.label, lines: req.lines, amountUsd: req.amountUsd, words: req.words, note: note,
      submittedBy: ctx.by || null, submittedAt: ctx.now || null, decision: null, history: hist('submitted') };
  }
  if (action === 'withdraw') {
    if (ctx.canEdit === false) throw fail(403, 'Your role in this workspace can read the funding list but not change it');
    if (status !== 'submitted') throw fail(409, status === 'approved' || status === 'declined' ? 'The committee has decided on this site; only ' + committeeWords(cfg) + ' changes that' : 'This site is not on the funding list');
    return Object.assign({}, cur, { status: 'withdrawn', decision: null, history: hist('withdrawn') });
  }
  if (action === 'decide') {
    var member = committeeMember(cfg, ctx.by);
    if (!member) throw fail(403, 'Funding is decided by ' + committeeWords(cfg) + '. You can submit a site; you cannot approve or decline it');
    var d = String(input.decision || '').toLowerCase().trim();
    if (d !== 'approved' && d !== 'declined') throw fail(400, 'A decision is approved or declined');
    if (status !== 'submitted' && status !== 'approved' && status !== 'declined') throw fail(409, 'This site has not been submitted for funding');
    if (d === 'declined' && !(note && note.length >= 3)) throw fail(400, 'Say why it is declined: the person who submitted it reads the reason');
    return Object.assign({}, cur, { status: d, decision: { status: d, by: ctx.by || null, name: member.name, at: ctx.now || null, note: note }, history: hist(d) });
  }
  throw fail(400, 'Unknown funding action');
}
/* the row's and the card's view of it */
function fundingView(fd) {
  if (!fd || typeof fd !== 'object' || FUND_STATES.indexOf(fd.status) < 0 || fd.status === 'withdrawn') return null;
  var d = fd.decision && typeof fd.decision === 'object' ? fd.decision : null;
  return { status: fd.status, uses: fd.uses || [], label: fd.label || null, lines: Array.isArray(fd.lines) ? fd.lines : [], amountUsd: fd.amountUsd == null ? null : fd.amountUsd, words: fd.words || null, note: fd.note || null,
    submittedBy: fd.submittedBy || null, submittedAt: fd.submittedAt || null, decision: d ? { status: d.status, by: d.by || null, name: d.name || null, at: d.at || null, note: d.note || null } : null };
}
/* what the pages may know of the list: the committee's names, never an address */
function fundingInfo(cfg, email) {
  var f = cfg && cfg.funding;
  return f ? { mode: f.mode, name: f.name, members: f.members.map(function (m) { return m.name; }), canDecide: !!committeeMember(cfg, email) } : null;
}

/* ── CLOSING A SITE (2026-11-09, Tommy: "we buy the sites from francis and
   they have to then go get the SHA signed over to us and there needs to be
   a 15 or 20 year lease on the site"). Three things a person records on a
   site, each with who and when: it is PURCHASED from the partner, its host
   agreement is ASSIGNED to the workspace, and a LEASE of the length the
   workspace needs is in place (the years typed; shorter is recorded and
   said, never rounded up). Only where the workspace's settings carry the
   length (portfolioAssessment.closing.minLeaseYears). Site control is
   closed when all three stand. Nothing here buys, assigns or signs
   anything: it is the record of what was done. ── */
var CLOSING_STEPS = ['purchase', 'assignment', 'lease'];
/* input: { step, done: true|false, years?, note? }. ctx: { by, now, config, canEdit } */
function closingChange(cur, input, ctx) {
  input = input || {}; ctx = ctx || {}; cur = cur && typeof cur === 'object' ? cur : {};
  var cfg = ctx.config, C = cfg && cfg.closing;
  if (!C) throw fail(409, 'This workspace has no closing steps in its settings');
  if (ctx.canEdit === false) throw fail(403, 'Your role in this workspace can read the closing steps but not mark them');
  var step = String(input.step || '').toLowerCase().trim(), done = input.done !== false && input.done !== 'false', note = clean(input.note, 500);
  if (CLOSING_STEPS.indexOf(step) < 0) throw fail(400, 'A closing step is purchase, assignment or lease');
  var out = { purchase: cur.purchase || null, assignment: cur.assignment || null, lease: cur.lease || null, history: Array.isArray(cur.history) ? cur.history.slice() : [] }, years = null;
  if (!done) out[step] = null;
  else {
    if (step === 'lease') { years = num(input.years); if (!(years >= 1 && years <= 99)) throw fail(400, 'Say how many years the lease runs (the workspace needs ' + C.minLeaseYears + ' or more)'); }
    out[step] = step === 'lease' ? { years: years, by: ctx.by || null, at: ctx.now || null, note: note } : { by: ctx.by || null, at: ctx.now || null, note: note };
  }
  out.history = out.history.concat([{ step: step, done: done, years: years, by: ctx.by || null, at: ctx.now || null, note: note }]).slice(-40);
  return out;
}
function closingView(cl, cfg, site) {
  var C = cfg && cfg.closing; if (!C) return null;
  cl = cl && typeof cl === 'object' ? cl : {};
  var partner = clean(site && site.portfolioPartner, 80), le = cl.lease && num(cl.lease.years) != null ? cl.lease : null, leaseOk = !!le && le.years >= C.minLeaseYears, cur = num(site && site.termYearsRemaining);
  function st(x) { return x ? { done: true, by: x.by || null, at: x.at || null, note: x.note || null } : { done: false }; }
  var steps = [
    Object.assign({ key: 'purchase', label: 'Purchased' + (partner ? ' from ' + partner : ''), words: cl.purchase ? 'Recorded' : 'Not recorded' }, st(cl.purchase)),
    Object.assign({ key: 'assignment', label: 'The ' + C.agreement + ' assigned to us', words: cl.assignment ? 'Recorded' : 'Not on file' + (partner ? ': ' + partner + ' has to get it signed over' : '') }, st(cl.assignment)),
    Object.assign({ key: 'lease', label: 'A lease of ' + C.minLeaseYears + ' years or more', years: le ? le.years : null, short: !!le && !leaseOk,
      words: le ? le.years + ' years' + (leaseOk ? '' : ': under the ' + C.minLeaseYears + ' needed') : 'Not in place' + (cur != null ? ' (' + cur + ' years are left on the agreement on file)' : '') }, st(le), { done: leaseOk })
  ];
  var open = steps.filter(function (x) { return !x.done; }).map(function (x) { return x.key; });
  return { steps: steps, done: steps.length - open.length, of: steps.length, complete: !open.length, waiting: open, minLeaseYears: C.minLeaseYears, leaseYears: le ? le.years : null,
    words: !open.length ? 'Closed: purchased, the ' + C.agreement + ' assigned, a ' + le.years + '-year lease in place' : (steps.length - open.length) + ' of ' + steps.length + ' closing steps done; waiting on ' + open.map(function (k) { return { purchase: 'the purchase', assignment: 'the ' + C.agreement + ' being assigned', lease: le ? 'a longer lease (' + le.years + ' of ' + C.minLeaseYears + ' years)' : 'the ' + C.minLeaseYears + '-year lease' }[k]; }).join(', ') };
}

/* ── THE GATES AND THE REVIEW (2026-11-09, Tommy, of his company's operating
   system: "this is our company how we work see that this is supported by
   what we are doing here"). A workspace's own pipeline, read off what is
   already on the site, in its own order:
     G0 intake and site control   G1 power (a transformer of at least the
     size it prefers)   G2 lease (the years it wants left)   G3 the pathway
     picked   G4 the return (its hurdle, and its committee's approval)
     G5 shovel ready (the checklist)   G6 the review's decision
   Each is pass, fail or OPEN: open means not known or not done yet, never
   failed. The thresholds and the people are the workspace's settings
   (portfolioAssessment.gates and .review); core carries none, and a
   workspace with neither has no gates. DERIVED at read time from the
   record: nothing here is stored but a reviewer's own vote. ── */
var REVIEW_VOTES = ['own', 'flip'], VOTE_WORD = { own: 'Own and operate', flip: 'Portfolio / flip' };
function reviewer(cfg, email) {
  var r = cfg && cfg.review, e = String(email || '').toLowerCase().trim();
  return r && e ? r.members.filter(function (m) { return m.email === e; })[0] || null : null;
}
/* the review as the pages read it: who has voted, who has not, and the decision when EVERY member has voted the same way */
function reviewView(rv, cfg) {
  var r = cfg && cfg.review; if (!r) return null;
  var votes = rv && rv.votes && typeof rv.votes === 'object' ? rv.votes : {};
  var rows = r.members.map(function (m) { var v = votes[m.email.replace(/\./g, '_')] || null; return { name: m.name, vote: v && REVIEW_VOTES.indexOf(v.vote) >= 0 ? v.vote : null, at: v ? v.at || null : null, note: v ? v.note || null : null }; });
  var cast = rows.filter(function (x) { return x.vote; }), waiting = rows.filter(function (x) { return !x.vote; }).map(function (x) { return x.name; });
  var same = cast.length > 0 && cast.every(function (x) { return x.vote === cast[0].vote; }), outcome = same && !waiting.length ? cast[0].vote : null, split = cast.length > 1 && !same;
  var last = cast.map(function (x) { return x.at || ''; }).sort().pop() || null;
  return { name: r.name, votes: rows, cast: cast.length, of: rows.length, waiting: waiting, split: split, outcome: outcome, outcomeLabel: outcome ? VOTE_WORD[outcome] : null, decidedAt: outcome ? last : null,
    words: outcome ? r.name + ': ' + VOTE_WORD[outcome] + ', all ' + rows.length + ' agreed' : split ? r.name + ' is split: ' + cast.map(function (x) { return x.name + ' ' + VOTE_WORD[x.vote].toLowerCase(); }).join(', ') + (waiting.length ? '; waiting on ' + waiting.join(', ') : '')
      : cast.length ? cast.length + ' of ' + rows.length + ' for ' + VOTE_WORD[cast[0].vote].toLowerCase() + '; waiting on ' + waiting.join(', ') : 'Not reviewed: waiting on ' + waiting.join(', ') };
}
/* one reviewer's vote, or its withdrawal. ctx: { by, now, config } */
function reviewChange(cur, input, ctx) {
  input = input || {}; ctx = ctx || {}; cur = cur && typeof cur === 'object' ? cur : {};
  var cfg = ctx.config, r = cfg && cfg.review;
  if (!r) throw fail(409, 'This workspace has no review board in its settings');
  var m = reviewer(cfg, ctx.by);
  if (!m) throw fail(403, r.name + ' is ' + r.members.map(function (x) { return x.name; }).join(', ') + '. Only they vote');
  var vote = String(input.vote || '').toLowerCase().trim(), note = clean(input.note, 500);
  if (vote !== 'clear' && REVIEW_VOTES.indexOf(vote) < 0) throw fail(400, 'A vote is own (own and operate) or flip (portfolio / flip); clear withdraws it');
  var votes = Object.assign({}, cur.votes && typeof cur.votes === 'object' ? cur.votes : {}), key = m.email.replace(/\./g, '_');   /* a dot in a map key is a path to Firestore */
  if (vote === 'clear') delete votes[key]; else votes[key] = { vote: vote, name: m.name, by: m.email, at: ctx.now || null, note: note };
  return { votes: votes, history: (Array.isArray(cur.history) ? cur.history : []).concat([{ vote: vote, by: m.email, name: m.name, at: ctx.now || null, note: note }]).slice(-40) };
}
/* site: the flat record. res: the assessment's answer. a: the stored assessment (decision, funding, review) */
function gatesOf(site, res, cfg, a) {
  cfg = cfg || {}; var G = cfg.gates, R = cfg.review; if (!G && !R && !cfg.closing) return null;
  site = site || {}; res = res || {}; a = a || {}; G = G || {};
  var out = [], rd = res.readiness || {}, p = res.power || {};
  function item(key) { var hit = null; (rd.sections || []).forEach(function (s) { (s.items || []).forEach(function (i) { if (i.key === key) hit = i; }); }); return hit; }
  function add(key, label, state, words) { out.push({ key: key, label: label, state: state, words: words }); }
  /* G0 */
  var ctl = item('control-evidence'), ctlSec = (rd.sections || []).filter(function (s) { return s.key === 'control'; })[0];
  var ctlDone = ctl ? ctl.state === 'done' : !!(ctlSec && ctlSec.done > 0);
  var clv = closingView(a.closing, cfg, site);
  if (clv) add('G0', 'Intake & site control', clv.complete ? 'pass' : 'open', clv.words);
  else add('G0', 'Intake & site control', ctlDone ? 'pass' : 'open', ctlDone ? 'On the register, with site-control evidence on file' : 'On the register; the site-control document is not on file');
  /* G1: the transformer, else the service as its kVA at the continuous rating */
  if (G.minKva != null) {
    var kva = num(p.transformerKva), svc = num(p.serviceCapacityKw), eq = kva != null ? kva : svc != null ? svc / CONTINUOUS : null;
    add('G1', 'Power', eq == null ? 'open' : eq >= G.minKva ? 'pass' : 'fail', eq == null ? 'No transformer or service size on file to judge against the ' + fmt(G.minKva) + ' kVA preferred'
      : (kva != null ? fmt(kva) + ' kVA' : fmt(svc) + ' kW of service (about ' + fmt(eq) + ' kVA)') + (eq >= G.minKva ? ': at or over the ' + fmt(G.minKva) + ' kVA preferred' : ': under the ' + fmt(G.minKva) + ' kVA preferred'));
  }
  /* G2 */
  if (G.minLeaseYears != null) {
    /* the new lease, once one is recorded at closing, is the lease; until then the term left on the agreement on file */
    var nl = clv && clv.leaseYears != null ? clv.leaseYears : null, t = nl != null ? nl : num(site.termYearsRemaining);
    add('G2', 'Lease', t == null ? 'open' : t >= G.minLeaseYears ? 'pass' : 'fail', t == null ? 'No lease term on file to judge against the ' + G.minLeaseYears + ' years wanted' : t + (nl != null ? '-year lease recorded at closing: ' : ' years left: ') + (t >= G.minLeaseYears ? 'at or over' : 'under') + ' the ' + G.minLeaseYears + ' years wanted');
  }
  /* G3: the pathway a person picked */
  var dec = a.decision && a.decision.status === 'approved' ? a.decision : null, fd = a.funding && FUND_STATES.indexOf(a.funding.status) >= 0 && a.funding.status !== 'withdrawn' ? a.funding : null;
  var picked = dec ? dec.uses || [] : fd ? fd.uses || [] : [], pickLabel = dec ? dec.label : fd ? fd.label : null, rec = res.recommend || {};
  add('G3', 'Pathway', picked.length ? 'pass' : 'open', picked.length ? pickLabel + (dec ? ', approved for pre-development' : ', submitted for funding') : rec.best ? 'No pathway picked yet; ' + (rec.fits.filter(function (f) { return f.use === rec.best; })[0] || {}).label + ' shows the highest screening return' : 'No pathway picked; nothing fits the power on file');
  /* G4: the hurdle on the pathway (the best use until one is picked), and the committee's approval where there is one */
  var irrOf = { compute: res.compute && res.compute.economics && res.compute.economics.ok ? res.compute.economics.irrPct : null, bess: res.bess && res.bess.ok ? res.bess.returns.irrPct : null, supercharger: res.supercharger && res.supercharger.ok ? res.supercharger.returns.irrPct : null };
  var judged = picked.length ? picked : rec.best ? [rec.best] : [], irrs = judged.map(function (u) { return irrOf[u]; }), known = irrs.filter(function (x) { return x != null; });
  var low = known.length ? Math.min.apply(null, known) : null, hasFund = !!cfg.funding, approved = fd && fd.status === 'approved', declined = fd && fd.status === 'declined';
  if (G.irrHurdlePct != null || hasFund) {
    var hs = G.irrHurdlePct == null ? null : low == null || known.length < irrs.length ? 'open' : low >= G.irrHurdlePct ? 'pass' : 'fail';
    var hw = G.irrHurdlePct == null ? 'No hurdle rate is set' : low == null ? 'No return to judge against the ' + G.irrHurdlePct + '% hurdle' : (judged.length > 1 ? 'the lowest of the pathway’s returns, ' : '') + low + '% ' + (low >= G.irrHurdlePct ? 'clears' : 'is under') + ' the ' + G.irrHurdlePct + '% hurdle' + (picked.length ? '' : ' (on the highest-returning use; no pathway is picked)');
    var st = declined || hs === 'fail' ? 'fail' : (hs === 'pass' || hs == null) && (!hasFund || approved) && (hs != null || hasFund) ? 'pass' : 'open';
    add('G4', 'Return', st, hw.charAt(0).toUpperCase() + hw.slice(1) + (hasFund ? '; ' + (approved ? 'approved by ' + (fd.decision && fd.decision.name || cfg.funding.name) : declined ? 'declined by ' + (fd.decision && fd.decision.name || cfg.funding.name) : fd ? 'with ' + cfg.funding.name.toLowerCase() : 'not yet submitted to ' + cfg.funding.name.toLowerCase()) : '') + '. A screening return, not the investment model');
  }
  /* G5 */
  add('G5', 'Shovel ready', rd.applicable && rd.done === rd.applicable ? 'pass' : 'open', (rd.done || 0) + ' of ' + (rd.applicable || 0) + ' checklist items with evidence on file');
  /* G6 */
  if (R) { var rv = reviewView(a.review, cfg); add('G6', R.name, rv.outcome ? 'pass' : 'open', rv.words); }
  var screen = out.filter(function (g) { return g.key === 'G1' || g.key === 'G2'; });
  return { list: out, passed: out.filter(function (g) { return g.state === 'pass'; }).length, failed: out.filter(function (g) { return g.state === 'fail'; }).map(function (g) { return g.key; }), of: out.length,
    screen: !screen.length ? null : screen.some(function (g) { return g.state === 'fail'; }) ? 'fail' : screen.every(function (g) { return g.state === 'pass'; }) ? 'pass' : 'open',
    rules: { minKva: G.minKva == null ? null : G.minKva, minLeaseYears: G.minLeaseYears == null ? null : G.minLeaseYears, irrHurdlePct: G.irrHurdlePct == null ? null : G.irrHurdlePct } };
}
/* what the pages may know of the review: its name, its members' names and whether this caller votes */
function reviewInfo(cfg, email) { var r = cfg && cfg.review; return r ? { name: r.name, members: r.members.map(function (m) { return m.name; }), canVote: !!reviewer(cfg, email), me: (reviewer(cfg, email) || {}).name || null } : null; }

/* the facts the answer rests on: a change in any of them makes it stale */
function inputHashOf(site, screen, parcel, cfg, upgrade) {
  site = site || {};
  var up = upgrade && typeof upgrade === 'object' && upgrade.status !== 'withdrawn' ? [upgrade.status, num(upgrade.targetKw), upgrade.askedBy || null] : null;
  return hash(JSON.stringify([VERSION, B.VERSION, T.VERSION, num(site.transformerKva), num(site.serviceCapacityKw), num(site.existingPeakKw), num(site.reportedPeakKw), site.peakUnresolved === true,
    num(site.availablePowerMw), stateOf(site), zipOf(site), num(site.powerPricePerKwh), num(site.termYearsRemaining), screen ? screen.at || null : null, parcel ? parcel.at || null : null, cfg || null, up]));
}

/* site: the flat record (site-bridge flatten). ctx: { screen, parcel, marks, config, now, upgrade } */
function assess(site, ctx) {
  site = site || {}; ctx = ctx || {};
  var cfg = ctx.config || configOf(null), screen = ctx.screen || null, parcel = ctx.parcel || null, st = stateOf(site);
  var power = powerOf(site, screen), compute = computeOf(power, cfg, site);
  var bess = power.availableKw > 0 ? B.bessCase({ powerKw: power.availableKw, state: st, utility: power.utility || site.utility || null, assumptions: cfg.bess }) : { ok: false, reason: power.availableKw === 0 ? 'Nothing is free on the limit and peak on file' : 'No power figure to size a battery on' };
  var year = ctx.now ? Number(String(ctx.now).slice(0, 4)) + 1 : null;
  var sup = power.availableKw != null ? T.superchargerCase({ state: st, availableKw: power.availableKw, startYear: year, assumptions: cfg.supercharger.assumptions, sizing: cfg.supercharger.sizing }) : { ok: false, reason: 'No power figure to size posts on' };
  var upgrade = upgradeView(ctx.upgrade, power, cfg, site), upgradeAdvice = upgradeAdviceOf(power, compute, cfg, site, upgrade);
  var pairing = pairingOf(compute, site, st, power, cfg);
  var c = { site: site, power: power, compute: compute, screen: screen, parcel: parcel, upgrade: upgrade };
  var readiness = readinessOf(c, ctx.marks), verify = verificationsOf(c, readiness);
  var grade = { A: 'Sized on a limit and a peak on file', B: 'Sized on a figure entered by hand', C: 'Sized on a ceiling: the site’s peak is not on file', D: 'Not sized: no power figure on file' }[power.grade];
  return { v: VERSION, at: ctx.now || null, inputHash: inputHashOf(site, screen, parcel, cfg, ctx.upgrade),
    power: power, compute: compute, pairing: pairing, upgrade: upgrade, upgradeAdvice: upgradeAdvice, bess: bess, supercharger: sup, recommend: recommendOf(compute, bess, sup), readiness: readiness, verify: verify,
    confidence: { grade: power.grade, words: grade, screened: !!(screen && screen.complete), parcel: !!(parcel && parcel.ok) },
    note: 'Compute, the battery and fast charging are each sized on the whole free capacity by itself: they are alternatives, not a stack.' };
}

/* the register's row: the answer without its yearly tables or the full checklist */
function listView(a, site, ctx) {
  if (!a || typeof a !== 'object') return null;
  if (!a.result) return a.decision && a.decision.status === 'approved' ? { notRun: true, decision: { status: 'approved', uses: a.decision.uses || [], label: a.decision.label || null, by: a.decision.by || null, at: a.decision.at || null, note: a.decision.note || null } } : null;
  var r = JSON.parse(JSON.stringify(a.result)), cfg = ctx && ctx.config || configOf(null);
  /* only what the row and the card draw: the notes, the streams, the loan, the shelf and the limits ride on the one-site view */
  if (r.bess) { delete r.bess.projections; delete r.bess.notes; delete r.bess.revenue; delete r.bess.debt; delete r.bess.energyAtEnd; }
  if (r.supercharger) { delete r.supercharger.projections; delete r.supercharger.notes; }
  if (r.compute) { r.compute.shelf = (r.compute.shelf || []).map(function (u) { return { key: u.key, label: u.label, klassLabel: u.klassLabel, meterKw: u.meterKw, fits: u.fits }; }); if (r.compute.economics) delete r.compute.economics.notes; if (r.compute.space) delete r.compute.space; }
  if (r.upgrade && r.upgrade.compute) delete r.upgrade.compute.words;
  if (r.power) { delete r.power.limits; delete r.power.verify; }
  if (r.readiness) r.readiness.sections = r.readiness.sections.map(function (s) { return { key: s.key, label: s.label, done: s.done, of: s.of }; });
  r.stale = r.inputHash !== inputHashOf(site, a.screen || null, a.parcel || null, cfg, a.upgrade || null);
  r.funding = fundingView(a.funding);
  /* the gates read the STORED answer whole (the checklist's items), not the thinned row */
  r.gates = gatesOf(site, a.result, cfg, a); r.review = reviewView(a.review, cfg); r.closing = closingView(a.closing, cfg, site);
  r.decision = a.decision && a.decision.status === 'approved' ? { status: 'approved', uses: a.decision.uses || [], label: a.decision.label || null, by: a.decision.by || null, at: a.decision.at || null, note: a.decision.note || null } : null;
  r.screenAt = a.screen && a.screen.at || null; r.parcelAt = a.parcel && a.parcel.at || null; r.by = a.by || null;
  r.located = a.screen && a.screen.located ? { precision: a.screen.located.precision || null, approximate: a.screen.located.approximate === true } : null;
  r.screenErrors = a.screen && Array.isArray(a.screen.errors) ? a.screen.errors.map(function (e) { return e.source; }) : [];
  return r;
}

module.exports = { VERSION: VERSION, CONFIG_KEY: CONFIG_KEY, CONTINUOUS: CONTINUOUS, MODULARS: MODULARS, CHECKLIST: CHECKLIST, ITEM_KEYS: ITEM_KEYS, CHECK_STATES: CHECK_STATES,
  USES: USES, PREDEV_STATUS: PREDEV_STATUS, recommendOf: recommendOf, decisionOf: decisionOf, klassOf: klassOf, rateOf: rateOf, referenceOf: referenceOf,
  PAIR_MIN_KW: PAIR_MIN_KW, pairingOf: pairingOf, UPGRADE_STATES: UPGRADE_STATES, upgradeOf: upgradeOf, upgradeView: upgradeView, upgradeAdviceOf: upgradeAdviceOf,
  CLOSING_STEPS: CLOSING_STEPS, closingChange: closingChange, closingView: closingView,
  REVIEW_VOTES: REVIEW_VOTES, reviewer: reviewer, reviewView: reviewView, reviewChange: reviewChange, reviewInfo: reviewInfo, gatesOf: gatesOf,
  FUND_STATES: FUND_STATES, committeeMember: committeeMember, fundingRequest: fundingRequest, fundingChange: fundingChange, fundingView: fundingView, fundingInfo: fundingInfo,
  configOf: configOf, powerOf: powerOf, computeOf: computeOf, readinessOf: readinessOf, verificationsOf: verificationsOf, inputHashOf: inputHashOf, assess: assess, listView: listView, stateOf: stateOf };
