/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/portfolio/power.js — power evidence, headroom contract, shared
   allocations, interval coverage and BESS energy accounting (spec §7)
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   PURE. Planning software only: nothing here issues a control command.
   Three evidence levels (§7.2): proxy → interval → reviewed. A level is
   earned by evidence, never by a field being non-empty.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var LEVELS = ['none', 'proxy', 'interval', 'reviewed'];
var LIMIT_KINDS = ['approvedImport', 'transformer', 'service', 'busFeeder', 'contractual', 'operating'];

/* §7.2 classification of a site's power evidence. */
function classify(site) {
  var f = site.facts || {}, pe = site.powerEvidence || {}, missing = [];
  var lim = pe.limits || {}, known = LIMIT_KINDS.filter(function (k) { return lim[k] && lim[k].kw != null; });
  if (pe.review && pe.review.signedBy && pe.review.validUntil && known.length && pe.baseline && pe.baseline.kw != null)
    return { level: 'reviewed', label: 'Reviewed planning capacity', conditions: pe.review.conditions || [], validUntil: pe.review.validUntil, missing: [] };
  if (pe.interval && pe.interval.coverage && pe.interval.coverage.completeYear && known.length && pe.topologyConfirmed)
    return { level: 'interval', label: 'Interval-supported analysis', missing: ['Engineering review and signature'] };
  if (!(f.installedChargerKw && f.installedChargerKw.value > 0)) missing.push('Installed charger nameplate');
  if (!(f.reportedPowerKw && f.reportedPowerKw.value != null)) missing.push('Reported peak demand');
  if (!known.length) missing.push('Approved import / service limit (utility letter or one-line)');
  if (!(pe.interval && pe.interval.coverage)) missing.push('Interval load data for the meter');
  if (!pe.topologyConfirmed) missing.push('Confirmed service / meter / transformer path');
  if (missing.length && f.installedChargerKw && f.installedChargerKw.value > 0) return { level: 'proxy', label: 'Preliminary proxy — not approved power', missing: missing };
  return { level: 'none', label: 'No usable power evidence', missing: missing };
}

/* §7.3 headroom contract. input:
   { required: [kind...], limits: {kind:{kw}}, baselineKw, baselineIncludes:[commitmentId],
     commitments:[{id,kw}], reserveKw }
   A required limit that is unknown → verified null with a reason (T11).
   Commitments already in the baseline are NOT subtracted again (T14). */
function headroom(input) {
  var req = input.required && input.required.length ? input.required : ['approvedImport'], lim = input.limits || {};
  var unknown = req.filter(function (k) { return !lim[k] || lim[k].kw == null || !isFinite(lim[k].kw); });
  if (unknown.length) return { verifiedKw: null, reason: 'UNKNOWN_LIMIT', unknown: unknown, note: 'Unknown limits are not dropped: nameplate is never treated as an approval.' };
  if (input.baselineKw == null) return { verifiedKw: null, reason: 'UNKNOWN_BASELINE', unknown: ['baseline'] };
  var cLimit = Math.min.apply(null, req.map(function (k) { return lim[k].kw; })), inBase = input.baselineIncludes || [], subtracted = [], skipped = [];
  var extra = (input.commitments || []).reduce(function (a, c) { if (inBase.indexOf(c.id) >= 0) { skipped.push(c.id); return a; } subtracted.push(c.id); return a + c.kw; }, 0);
  var raw = cLimit - input.baselineKw - extra - (input.reserveKw || 0);
  return { cLimitKw: cLimit, bindingLimit: req.filter(function (k) { return lim[k].kw === cLimit; })[0], rawKw: raw, availableKw: Math.max(0, raw), overload: raw < 0, subtractedCommitments: subtracted, alreadyInBaseline: skipped, verifiedKw: Math.max(0, raw) };
}

/* §7.3 compute fit — PUE applied once (T13). */
function computeFit(availableFacilityKw, cfg) {
  cfg = cfg || {}; var itPod = cfg.podItKw || 75, pue = cfg.pue || 1.2, podFac = itPod * pue;
  if (availableFacilityKw == null) return { pods: null, reason: 'No verified headroom' };
  var pods = Math.floor(availableFacilityKw / podFac + 1e-9);
  return { pods: pods, itKw: pods * itPod, facilityKw: pods * podFac, itHeadroomKw: availableFacilityKw / pue, pue: pue, podFacilityKw: podFac };
}

/* §7.4 allocation ledger check over a shared envelope (T15). */
function checkAllocation(envelope, ledger, request) {
  var active = (ledger || []).filter(function (a) { return a.envelopeId === envelope.id && (a.status === 'approved' || a.status === 'reserved') && !(a.expiresAt && a.expiresAt < (request.now || Date.now())); });
  var dup = active.filter(function (a) { return a.idempotencyKey && a.idempotencyKey === request.idempotencyKey; })[0];
  if (dup) return { ok: true, duplicate: true, allocation: dup };
  var used = active.reduce(function (s, a) { return s + a.kw; }, 0), left = envelope.kw - used;
  if (!(request.kw > 0)) return { ok: false, code: 'INVALID_AMOUNT' };
  if (request.kw > left + 1e-9) return { ok: false, code: 'ENVELOPE_EXCEEDED', envelopeKw: envelope.kw, allocatedKw: used, remainingKw: left };
  return { ok: true, remainingAfterKw: left - request.kw };
}

/* §7.3 interval coverage on the COMPLETE applicable interval set (T17).
   values may contain null for missing intervals; activeOnly marks a feed
   that only reports while charging. */
function intervalCoverage(values, opts) {
  opts = opts || {}; var step = opts.intervalMin || 15, perYear = 365 * 24 * 60 / step, present = values.filter(function (v) { return v != null && isFinite(v); });
  var cov = present.length / perYear, warnings = [];
  if (opts.activeOnly) warnings.push('ACTIVE_ONLY_SERIES: idle intervals are absent; no annual energy or firm-capacity claim');
  if (cov < 0.98) warnings.push('PARTIAL_COVERAGE: ' + (cov * 100).toFixed(1) + '% of a year');
  var claimable = !opts.activeOnly && cov >= 0.98;
  var sorted = present.slice().sort(function (a, b) { return a - b; });
  return { coverage: +cov.toFixed(4), completeYear: claimable, intervals: present.length, peakKw: sorted.length ? sorted[sorted.length - 1] : null,
    annualKwh: claimable ? present.reduce(function (a, v) { return a + v * step / 60; }, 0) : null, firmCapacityKw: null, warnings: warnings };
}
/* Headroom distribution over intervals (interval-ready interface). */
function headroomSeries(limitKw, loadKw, step) {
  var h = loadKw.map(function (l) { return l == null ? null : limitKw - l; }), ok = h.filter(function (x) { return x != null; }).sort(function (a, b) { return a - b; });
  function pct(p) { return ok.length ? ok[Math.floor((1 - p) * (ok.length - 1))] : null; }
  return { p95Kw: pct(0.95), minObservedKw: ok.length ? ok[0] : null, availableKwh: ok.reduce(function (a, x) { return a + Math.max(0, x) * (step || 15) / 60; }, 0), note: 'Observed minimum is not guaranteed future firm capacity.' };
}

/* §7.5 BESS energy accounting (T18): one usable-energy budget; charging
   energy and losses count against the grid limit; claims cannot overlap. */
function bessPlan(b, claims, gridHeadroomKw) {
  var usable = b.usableKwh, reserve = b.backupReserveKwh || 0, rte = b.roundTripEff || 0.88, avail = usable - reserve, errors = [], used = 0;
  (claims || []).forEach(function (c) { used += c.kwh; if (c.kw > b.maxKw) errors.push({ code: 'POWER_EXCEEDED', service: c.service }); });
  if (used > avail + 1e-9) errors.push({ code: 'ENERGY_DOUBLE_SOLD', claimedKwh: used, availableKwh: avail });
  var rechargeKwh = used / rte, rechargeKw = Math.min(b.maxKw, rechargeKwh / (b.rechargeHours || 4));
  if (gridHeadroomKw != null && rechargeKw > gridHeadroomKw) errors.push({ code: 'RECHARGE_EXCEEDS_HEADROOM', rechargeKw: rechargeKw, headroomKw: gridHeadroomKw });
  return { ok: !errors.length, errors: errors, durationHoursAtMax: usable / b.maxKw, rechargeKwh: rechargeKwh, lossesKwh: rechargeKwh - used, rechargeKw: rechargeKw, note: 'BESS shifts energy; it does not create utility capacity.' };
}

/* §7.4 / T35 fleet physical totals: each site / constraint once. */
function fleetPhysical(memberships, sites) {
  var seen = {}, env = {}, t = { sites: 0, installedKw: 0, verifiedHeadroomKw: 0, envelopes: 0 };
  memberships.forEach(function (m) { (m.siteIds || []).forEach(function (id) { if (seen[id] || !sites[id]) return; seen[id] = 1; var s = sites[id]; t.sites++;
    t.installedKw += s.facts && s.facts.installedChargerKw ? s.facts.installedChargerKw.value || 0 : 0;
    var e = s.powerEvidence && s.powerEvidence.envelopeId; if (e) { if (!env[e]) { env[e] = 1; t.envelopes++; t.verifiedHeadroomKw += s.powerEvidence.envelopeHeadroomKw || 0; } } else t.verifiedHeadroomKw += s.powerEvidence && s.powerEvidence.verifiedKw || 0; }); });
  return t;
}
module.exports = { LEVELS: LEVELS, LIMIT_KINDS: LIMIT_KINDS, classify: classify, headroom: headroom, computeFit: computeFit, checkAllocation: checkAllocation, intervalCoverage: intervalCoverage, headroomSeries: headroomSeries, bessPlan: bessPlan, fleetPhysical: fleetPhysical };
