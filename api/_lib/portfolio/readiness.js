/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/portfolio/readiness.js — bills, map status, stale propagation and
   the non-waivable submission gates (spec §6.3, §8.3, §9.2, §11.3)
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   PURE. The server calls gates() at prepare AND again inside the submission
   transaction. Codes are stable strings the UI explains and links.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var BILL_STATES = ['uploaded', 'matched', 'entered', 'reviewed', 'accepted', 'rejected'];
var BILL_FIELDS = ['periodStart', 'periodEnd', 'meterId', 'kwh', 'totalUsd'];
var MAP_STATES = ['not-started', 'draft-saved', 'review-needed', 'reviewed'];

/* A bill entry (manual or extracted) → its queue state and problems (T22).
   An attachment alone stays 'uploaded'; extraction lands in 'entered' and
   always needs a human review. */
function billState(bill, site) {
  var problems = [], meters = (site.meters || []).map(String), e = bill.entered || {};
  if (!bill.fileId && !bill.manual) problems.push('NO_EVIDENCE');
  var missing = BILL_FIELDS.filter(function (k) { return e[k] == null || e[k] === ''; });
  if (missing.length) problems.push('FIELDS_MISSING:' + missing.join(','));
  if (e.meterId != null && meters.length && meters.indexOf(String(e.meterId)) < 0) problems.push('BILL_METER_MISMATCH');
  if (e.estimatedRead) problems.push('ESTIMATED_READ');
  if (e.periodStart && e.periodEnd && e.periodEnd <= e.periodStart) problems.push('PERIOD_INVALID');
  if (e.lineItems && e.totalUsd != null) { var s = e.lineItems.reduce(function (a, l) { return a + (+l.amount || 0); }, 0); if (Math.abs(s - e.totalUsd) > 0.02) problems.push('CHARGES_DO_NOT_RECONCILE'); }
  var state = bill.reviewedBy && !problems.length ? (bill.accepted ? 'accepted' : 'reviewed') : (Object.keys(e).length ? 'entered' : (bill.siteId ? 'matched' : 'uploaded'));
  return { state: state, problems: problems, extraction: bill.extraction || null };
}
function overlaps(bills) { var b = bills.slice().sort(function (x, y) { return x.entered.periodStart < y.entered.periodStart ? -1 : 1; }), o = []; for (var i = 1; i < b.length; i++) if (b[i].entered.periodStart < b[i - 1].entered.periodEnd && b[i].entered.meterId === b[i - 1].entered.meterId) o.push([b[i - 1].id, b[i].id]); return o; }

/* Map status (§8.3): a placeholder or empty project is NOT a map. */
function mapStatus(link) {
  if (!link || !link.editorProjectId) return { state: 'not-started', ok: false };
  if (!(link.revision > 0) || !(link.featureCount > 0)) return { state: 'draft-saved', ok: false, reason: 'Linked editor project is empty' };
  return { state: link.reviewedRevision === link.revision ? 'reviewed' : 'review-needed', ok: true, revision: link.revision };
}

/* §11.3 dependency graph: what each change invalidates (T25). */
var DEPENDS = {
  bill: ['load', 'cost', 'value-stack', 'finance', 'package'],
  tariff: ['cost', 'value-stack', 'finance', 'package'],
  map: ['design', 'package'],
  equipment: ['design', 'power', 'finance', 'package'],
  agreement: ['term', 'readiness', 'finance', 'package'],
  power: ['power', 'value-stack', 'finance', 'package'],
  assumptions: ['finance', 'package']
};
function invalidates(change) { return DEPENDS[change] || []; }
/* Mark analyses and packages stale; never re-run or re-publish them. */
function propagate(change, analyses, at) {
  var hit = invalidates(change), out = [];
  analyses.forEach(function (a) { if (hit.indexOf(a.kind) >= 0 && a.status !== 'stale') out.push({ id: a.id, kind: a.kind, status: 'stale', staleReason: change, staleAt: at }); });
  return out;
}

/* §9.2 gates. ctx: { site, project, scenario, mapLink, bills, analyses,
   canPublish, siteControlReviewed, powerClass } */
function gates(ctx) {
  var codes = [], m = mapStatus(ctx.mapLink);
  if (!m.ok) codes.push({ code: 'MAP_MISSING_OR_EMPTY', fix: 'Open Site Map and save a non-empty design for this project' });
  else if (ctx.mapLink.packageRevision != null && ctx.mapLink.packageRevision !== ctx.mapLink.revision) codes.push({ code: 'MAP_REVISION_STALE', fix: 'Refresh the package against the current map revision' });
  var bills = ctx.bills || [], accepted = bills.filter(function (b) { var s = billState(b, ctx.site); return s.state === 'accepted'; });
  if (bills.some(function (b) { return billState(b, ctx.site).problems.indexOf('BILL_METER_MISMATCH') >= 0; })) codes.push({ code: 'BILL_METER_MISMATCH', fix: 'Correct the meter on the bill or link it to the right site' });
  if (!accepted.length) codes.push({ code: 'BILLS_NOT_REVIEWED', fix: 'Enter and review at least one actual energy bill for this site' });
  if (!ctx.siteControlReviewed) codes.push({ code: 'SITE_CONTROL_REVIEW_REQUIRED', fix: 'Review the host agreement scope for compute use' });
  if (!ctx.powerClass || ctx.powerClass === 'none') codes.push({ code: 'POWER_CLASSIFICATION_MISSING', fix: 'Classify the power evidence for this site' });
  var fin = (ctx.analyses || []).filter(function (a) { return a.kind === 'finance' && a.scenarioId === (ctx.scenario && ctx.scenario.id); })[0];
  if (!fin || fin.status !== 'current') codes.push({ code: 'FINANCIAL_SCENARIO_STALE', fix: 'Run the finance scenario on current inputs' });
  if (!ctx.canPublish) codes.push({ code: 'PUBLISH_PERMISSION_REQUIRED', fix: 'An owner or admin must authorize submission' });
  return { ok: !codes.length, codes: codes, partialHistory: accepted.length < 12 ? 'Fewer than 12 months of reviewed bills: package is labelled partial' : null };
}
module.exports = { BILL_STATES: BILL_STATES, BILL_FIELDS: BILL_FIELDS, MAP_STATES: MAP_STATES, billState: billState, overlaps: overlaps, mapStatus: mapStatus, invalidates: invalidates, propagate: propagate, gates: gates, DEPENDS: DEPENDS };
