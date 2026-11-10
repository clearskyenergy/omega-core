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
var CM = require('../omega-compute-model'), CC = require('../compute-contract'), D = require('./diligence');

var VERSION = 1, CONFIG_KEY = 'portfolioAssessment', CONTINUOUS = 0.8;
/* the modular shelf, by IT load. The 75 kW unit is the Omega-Core skid as the
   platform records it; the larger ones are whole nodes of the chosen chip in
   that IT budget, priced at the engine's chipset-scaled midpoint. */
var MODULARS = [
  { key: 'm75', itKw: 75, label: '75 kW', skid: true },
  { key: 'm350', itKw: 350, label: '350 kW' },
  { key: 'm1000', itKw: 1000, label: '1 MW' },
  { key: 'm1770', itKw: 1770, label: '1.77 MW' }
];
var COMPUTE_TERM_MONTHS = 72;

function num(v) { return v == null || v === '' || !isFinite(Number(v)) ? null : Number(v); }
function r2(v) { return v == null ? null : Math.round(v * 100) / 100; }
function fmt(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
function obj(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
function hash(s) { var h = 0x811c9dc5; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0; } return ('0000000' + h.toString(16)).slice(-8); }
function stateOf(site) { var a = site.address && typeof site.address === 'object' ? site.address : {}; return String(a.state || site.state || '').toUpperCase().trim().slice(0, 2) || null; }

/* the workspace's own settings (billing/current.portfolioAssessment): read
   leniently — a wrong shape is no setting */
function configOf(billing) {
  var raw = obj(billing && billing[CONFIG_KEY]), c = obj(raw.compute);
  return { bess: obj(raw.bess), supercharger: { assumptions: obj(obj(raw.supercharger).assumptions), sizing: obj(obj(raw.supercharger).sizing) },
    compute: { chipset: typeof c.chipset === 'string' ? c.chipset : null, pue: num(c.pue) > 1 && num(c.pue) < 2.5 ? num(c.pue) : null,
      partnerName: typeof c.partnerName === 'string' ? c.partnerName.slice(0, 80) : null, partnerFeePct: num(c.partnerFeePct) >= 0 && num(c.partnerFeePct) <= 50 ? num(c.partnerFeePct) : null,
      termMonths: num(c.termMonths) >= 12 && num(c.termMonths) <= 240 ? Math.floor(num(c.termMonths)) : null } };
}

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

/* ── compute: the shelf on the free power, and the chosen unit's return ── */
var econCache = {};
function unitFor(m, chip, pue) {
  var I = CM.readInputs({ chipset: chip.key }), overhead = I.reservedOverhead;
  var nodes = Math.floor(m.itKw * (1 - overhead) / chip.nodeKw + 1e-9), gpus = nodes * chip.gpusPerNode, installed = nodes * chip.nodeKw;
  return { label: m.label + ' modular', word: 'modular', kw: r2(installed * pue), itKw: r2(installed), gpus: gpus, costUsd: CM.dynamicCapex(chip, gpus).mid };
}
function computeEconomics(m, units, cfg, site) {
  var chip = CM.chipset(cfg.compute.chipset || CM.DEFAULTS.chipset) || CM.chipset(CM.DEFAULTS.chipset), pue = cfg.compute.pue || CM.DEFAULTS.pue;
  var elec = num(site && site.powerPricePerKwh), term = cfg.compute.termMonths || COMPUTE_TERM_MONTHS;
  var key = [m.key, units, chip.key, pue, elec, term, cfg.compute.partnerFeePct, cfg.compute.partnerName].join('|');
  if (econCache[key]) return econCache[key];
  var input = { chipset: chip.key, units: units, contract: { termMonths: term, partner: cfg.compute.partnerFeePct != null ? { name: cfg.compute.partnerName || 'the offtake partner', feePct: cfg.compute.partnerFeePct } : false }, site: { route: 'own' }, operating: {} };
  if (cfg.compute.pue) input.operating.pue = cfg.compute.pue;
  if (elec != null && elec > 0) input.operating.electricity = elec;
  if (!m.skid) input.unit = unitFor(m, chip, pue);
  var out; try { out = CC.contractCase(input, {}); } catch (e) { out = null; }
  if (!out || out.ok === false) return { ok: false, reason: 'The compute engine could not price this unit' };
  var e = D.economicsFromCase(out, input, null), at = e.irrAt, notes = [];
  notes.push(m.skid ? 'The 75 kW unit is the Omega-Core skid at its recorded system cost.' : 'Capital is the engine’s chipset-scaled midpoint for ' + fmt(e.gpus) + ' ' + chip.name + ' GPUs, an estimate, not a quote.');
  notes.push(at ? 'Priced at the chip’s public ' + at.basis + ' reference ($' + at.price + ' a GPU-hour): no contract price is set, so this is a screening figure.' : 'The chip has no public reference price, so no return is shown until a contract price is set.');
  notes.push('No site rent, purchase or host share is in the case' + (cfg.compute.partnerFeePct != null ? '; the offtake partner’s ' + cfg.compute.partnerFeePct + '% fee is.' : ', and no partner fee.'));
  var res = { ok: true, chipset: { key: chip.key, name: chip.name }, gpus: e.gpus, itKw: e.computeKw, capexUsd: e.capexUsd, termMonths: term,
    irrPct: at ? at.pct : null, irrBasis: at ? 'project IRR at the public ' + at.basis + ' reference, $' + at.price + ' a GPU-hour' : null, pricePerGpuHour: at ? at.price : null, priceBasis: at ? at.basis : null,
    paybackMonths: at ? at.paybackMonths : null, notes: notes };
  if (Object.keys(econCache).length > 400) econCache = {};   /* a site's own power price is in the key */
  econCache[key] = res;
  return res;
}
function computeOf(power, cfg, site) {
  var pue = cfg.compute.pue || CM.DEFAULTS.pue, kw = power.availableKw;
  var shelf = MODULARS.map(function (m) { var need = Math.round(m.itKw * pue); return { key: m.key, label: m.label, itKw: m.itKw, meterKw: need, fits: kw != null && kw >= need, units: kw != null ? Math.floor(kw / need + 1e-9) : 0 }; });
  var out = { pue: pue, shelf: shelf, chosen: null, fits: false, basis: power.basis, words: null };
  if (kw == null) { out.words = 'No power figure to size compute on'; return out; }
  var pick = null; shelf.forEach(function (s) { if (s.fits) pick = s; });
  if (!pick) { out.words = fmt(kw) + ' kW does not carry the smallest unit (' + shelf[0].label + ' of IT needs ' + fmt(shelf[0].meterKw) + ' kW at the meter)'; out.needKw = shelf[0].meterKw; return out; }
  var m = MODULARS.filter(function (x) { return x.key === pick.key; })[0], units = pick.units;
  out.fits = true;
  out.chosen = { key: pick.key, label: pick.label, units: units, itKw: pick.itKw * units, meterKw: pick.meterKw * units, leftKw: r2(kw - pick.meterKw * units) };
  out.words = (units > 1 ? units + ' × ' : '') + pick.label + ' of IT (' + fmt(out.chosen.meterKw) + ' kW at the meter at PUE ' + pue + ') on ' + fmt(kw) + ' kW' + (power.basis === 'ceiling' ? ', a ceiling' : ' free');
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
  if (key === 'power-interconnection' && p.hosting) return scr('The utility publishes ' + fmt(p.hosting.loadKw) + ' kW of load hosting' + (p.hosting.circuit ? ' on circuit ' + p.hosting.circuit : '') + '; no application is on file', p.hosting.source || 'Utility hosting capacity');
  if (key === 'power-net' && p.transformerKva) return scr(fmt(p.transformerKva) + ' kVA × ' + CONTINUOUS + ' continuous = ' + fmt(p.transformerKva * CONTINUOUS) + ' kW, before the site’s own load', 'Site record');
  if (key === 'power-evidence' && p.substation && p.substation.name) return scr('Nearest substation: ' + p.substation.name + (p.substation.kv ? ', ' + p.substation.kv + ' kV' : '') + (p.substation.distanceMi != null ? ', ' + p.substation.distanceMi + ' mi' : '') + (p.utility ? ' · ' + p.utility : '') + '; a will-serve letter is the evidence', 'Grid Atlas');
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

/* the facts the answer rests on: a change in any of them makes it stale */
function inputHashOf(site, screen, parcel, cfg) {
  site = site || {};
  return hash(JSON.stringify([VERSION, B.VERSION, T.VERSION, num(site.transformerKva), num(site.serviceCapacityKw), num(site.existingPeakKw), num(site.reportedPeakKw), site.peakUnresolved === true,
    num(site.availablePowerMw), stateOf(site), num(site.powerPricePerKwh), num(site.termYearsRemaining), screen ? screen.at || null : null, parcel ? parcel.at || null : null, cfg || null]));
}

/* site: the flat record (site-bridge flatten). ctx: { screen, parcel, marks, config, now } */
function assess(site, ctx) {
  site = site || {}; ctx = ctx || {};
  var cfg = ctx.config || configOf(null), screen = ctx.screen || null, parcel = ctx.parcel || null, st = stateOf(site);
  var power = powerOf(site, screen), compute = computeOf(power, cfg, site);
  var bess = power.availableKw > 0 ? B.bessCase({ powerKw: power.availableKw, state: st, utility: power.utility || site.utility || null, assumptions: cfg.bess }) : { ok: false, reason: power.availableKw === 0 ? 'Nothing is free on the limit and peak on file' : 'No power figure to size a battery on' };
  var year = ctx.now ? Number(String(ctx.now).slice(0, 4)) + 1 : null;
  var sup = power.availableKw != null ? T.superchargerCase({ state: st, availableKw: power.availableKw, startYear: year, assumptions: cfg.supercharger.assumptions, sizing: cfg.supercharger.sizing }) : { ok: false, reason: 'No power figure to size posts on' };
  var c = { site: site, power: power, compute: compute, screen: screen, parcel: parcel };
  var readiness = readinessOf(c, ctx.marks), verify = verificationsOf(c, readiness);
  var grade = { A: 'Sized on a limit and a peak on file', B: 'Sized on a figure entered by hand', C: 'Sized on a ceiling: the site’s peak is not on file', D: 'Not sized: no power figure on file' }[power.grade];
  return { v: VERSION, at: ctx.now || null, inputHash: inputHashOf(site, screen, parcel, cfg),
    power: power, compute: compute, bess: bess, supercharger: sup, recommend: recommendOf(compute, bess, sup), readiness: readiness, verify: verify,
    confidence: { grade: power.grade, words: grade, screened: !!(screen && screen.complete), parcel: !!(parcel && parcel.ok) },
    note: 'Compute, the battery and fast charging are each sized on the whole free capacity by itself: they are alternatives, not a stack.' };
}

/* the register's row: the answer without its yearly tables or the full checklist */
function listView(a, site, ctx) {
  if (!a || typeof a !== 'object') return null;
  if (!a.result) return a.decision && a.decision.status === 'approved' ? { notRun: true, decision: { status: 'approved', uses: a.decision.uses || [], label: a.decision.label || null, by: a.decision.by || null, at: a.decision.at || null, note: a.decision.note || null } } : null;
  var r = JSON.parse(JSON.stringify(a.result)), cfg = ctx && ctx.config || configOf(null);
  if (r.bess) delete r.bess.projections;
  if (r.supercharger) delete r.supercharger.projections;
  if (r.readiness) r.readiness.sections = r.readiness.sections.map(function (s) { return { key: s.key, label: s.label, done: s.done, of: s.of }; });
  r.stale = r.inputHash !== inputHashOf(site, a.screen || null, a.parcel || null, cfg);
  r.decision = a.decision && a.decision.status === 'approved' ? { status: 'approved', uses: a.decision.uses || [], label: a.decision.label || null, by: a.decision.by || null, at: a.decision.at || null, note: a.decision.note || null } : null;
  r.screenAt = a.screen && a.screen.at || null; r.parcelAt = a.parcel && a.parcel.at || null; r.by = a.by || null;
  r.located = a.screen && a.screen.located ? { precision: a.screen.located.precision || null, approximate: a.screen.located.approximate === true } : null;
  r.screenErrors = a.screen && Array.isArray(a.screen.errors) ? a.screen.errors.map(function (e) { return e.source; }) : [];
  return r;
}

module.exports = { VERSION: VERSION, CONFIG_KEY: CONFIG_KEY, CONTINUOUS: CONTINUOUS, MODULARS: MODULARS, CHECKLIST: CHECKLIST, ITEM_KEYS: ITEM_KEYS, CHECK_STATES: CHECK_STATES,
  USES: USES, PREDEV_STATUS: PREDEV_STATUS, recommendOf: recommendOf, decisionOf: decisionOf,
  configOf: configOf, powerOf: powerOf, computeOf: computeOf, readinessOf: readinessOf, verificationsOf: verificationsOf, inputHashOf: inputHashOf, assess: assess, listView: listView, stateOf: stateOf };
