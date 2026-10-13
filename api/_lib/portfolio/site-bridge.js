/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/portfolio/site-bridge.js — ONE site record, two readers
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   The portfolio register (api/_lib/portfolio/register.js, folded in from the
   asset-manager draft) keeps a site as FACTS with cell-level provenance,
   flags, a revision and a lifecycle; the site CRM (api/site-crm.js, the
   register page and the site record) reads the same document as FLAT fields
   (installedKw, reportedPeakKw, meterOwned, termYearsRemaining, city…).
   Both live on omega_orgs/{org}/sites/{id}. This is the one bridge:

     normalize(id, data)  → the document as the register reads it (facts,
                            address, revision, lifecycleStatus, links filled
                            from the flat fields when the record has none)
     flatten(doc)         → the document as the CRM reads it (the flat
                            fields derived from the facts, archived from the
                            lifecycle, projectId from the links), on top of
                            the register's own fields

   Rules: a fact is never invented — a flat field that is null makes no fact,
   a missing fact leaves the flat field alone; the reported peak from the
   intake stays flagged unresolved; a blank meter stays unknown.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

/* fact key ↔ flat field; a boolean fact keeps its tri-state */
var MAP = [
  ['installedChargerKw', 'installedKw', 'kW'],
  ['reportedPowerKw', 'reportedPeakKw', 'kW'],
  ['evcsOwnsMeter', 'meterOwned', null],
  ['shaRemainingYears', 'termYearsRemaining', 'years'],
  ['utility', 'utility', null],
  ['rateSchedule', 'rateSchedule', null],
  ['monthlyRentUsd', null, 'USD/month'],
  ['revShare', null, 'fraction'],
  ['revSharePerKwh', null, 'USD/kWh']
];
function num(v) { if (v === null || v === undefined || v === '') return null; var n = Number(v); return isFinite(n) ? n : null; }
function has(v) { return v !== null && v !== undefined && v !== ''; }

function normalize(id, data) {
  data = data || {};
  var d = JSON.parse(JSON.stringify(data));
  d.siteId = d.siteId || id;
  d.name = d.name || '';
  d.revision = d.revision || 1;
  d.lifecycleStatus = d.lifecycleStatus || (d.archived === true ? 'archived' : 'active');
  d.flags = Array.isArray(d.flags) ? d.flags : [];
  d.externalSiteIds = d.externalSiteIds || {};
  d.portfolioIds = Array.isArray(d.portfolioIds) ? d.portfolioIds : [];
  /* the CRM's site-save keeps the street as a string beside city/state/zip; the register keeps one object */
  if (!d.address || typeof d.address !== 'object') d.address = { street: typeof d.address === 'string' && d.address ? d.address : null, city: d.city || null, state: d.state || null, zip: d.zip || null };
  else { if (!d.address.city && d.city) d.address.city = d.city; if (!d.address.state && d.state) d.address.state = d.state; if (!d.address.zip && d.zip) d.address.zip = d.zip; }
  if (!d.facts || typeof d.facts !== 'object') {
    d.facts = {};
    MAP.forEach(function (m) {
      if (!m[1]) return;
      var v = d[m[1]];
      if (!has(v)) return;
      d.facts[m[0]] = { value: m[0] === 'evcsOwnsMeter' ? v === true : (typeof v === 'number' || /Kw|Years/.test(m[1]) ? num(v) : v), unit: m[2], kind: d.source === 'site-import' || d.source === 'EVCS_investor_work/data.json' ? 'supplied' : 'manual', raw: String(v), source: { profile: 'site-crm', field: m[1] }, importedAt: d.createdAt || null, reviewStatus: 'unreviewed' };
      if (m[0] === 'reportedPowerKw' && d.peakUnresolved) d.facts[m[0]].reviewStatus = 'needs_definition_review';
    });
    var cm = d.commercial || {};
    if (has(cm.rentMonthly)) d.facts.monthlyRentUsd = { value: num(cm.rentMonthly), unit: 'USD/month', kind: 'supplied', raw: String(cm.rentMonthly), source: { profile: 'site-crm', field: 'commercial.rentMonthly' }, reviewStatus: 'unreviewed' };
    if (has(cm.revenueShare)) d.facts.revShare = { value: num(cm.revenueShare), unit: 'fraction', kind: 'supplied', raw: String(cm.revenueShare), source: { profile: 'site-crm', field: 'commercial.revenueShare' }, reviewStatus: 'unreviewed' };
    if (has(cm.kwhShare)) d.facts.revSharePerKwh = { value: num(cm.kwhShare), unit: 'USD/kWh', kind: 'supplied', raw: String(cm.kwhShare), source: { profile: 'site-crm', field: 'commercial.kwhShare' }, reviewStatus: 'unreviewed' };
    if (d.screening && d.screening.pods != null && !d.opportunity) d.opportunity = { legacyProxy: { scenario: d.screening.label || 'EVCS legacy proxy v1', kind: 'proxied', status: 'screened', pods: num(d.screening.pods), screenKw: num(d.screening.screenKw), reserveKw: num(d.screening.reserveKw), itKw: num(d.screening.pods) == null ? null : num(d.screening.pods) * 75, facilityKw: num(d.screening.pods) == null ? null : num(d.screening.pods) * 90, legacyHistoricalPods: num(d.screening.pods), caveat: d.screening.note || null } };
  }
  d.links = d.links && typeof d.links === 'object' ? d.links : {};
  if (!d.links.projectId && d.projectId) d.links.projectId = d.projectId;
  return d;
}

function flatten(doc) {
  var d = doc, f = d.facts || {}, a = d.address || {};
  function fv(k) { var x = f[k]; return x && x.value !== undefined ? x.value : undefined; }
  var out = Object.assign({}, d);
  if (fv('installedChargerKw') !== undefined) out.installedKw = fv('installedChargerKw');
  if (fv('reportedPowerKw') !== undefined) { out.reportedPeakKw = fv('reportedPowerKw'); if (f.reportedPowerKw.reviewStatus === 'needs_definition_review') { out.peakUnresolved = true; out.peakDefinition = f.reportedPowerKw.note || out.peakDefinition || null; } else if (f.reportedPowerKw.reviewStatus === 'reviewed') out.peakUnresolved = false; }
  if (f.evcsOwnsMeter) out.meterOwned = fv('evcsOwnsMeter') === true ? true : fv('evcsOwnsMeter') === false ? false : null;
  if (fv('shaRemainingYears') !== undefined) out.termYearsRemaining = fv('shaRemainingYears');
  if (fv('utility') !== undefined) out.utility = fv('utility');
  if (typeof a === 'object' && a) { if (a.city) out.city = a.city; if (a.state) out.state = a.state; if (a.zip) out.zip = String(a.zip); }
  var cm = Object.assign({}, d.commercial || {});
  if (fv('monthlyRentUsd') !== undefined) cm.rentMonthly = fv('monthlyRentUsd');
  if (fv('revShare') !== undefined) cm.revenueShare = fv('revShare');
  if (fv('revSharePerKwh') !== undefined) cm.kwhShare = fv('revSharePerKwh');
  if (Object.keys(cm).length) out.commercial = cm;
  var lp = d.opportunity && d.opportunity.legacyProxy;
  if (lp) out.screening = { label: lp.scenario || 'EVCS legacy proxy v1', screenKw: lp.screenKw == null ? null : lp.screenKw, pods: lp.pods == null ? null : lp.pods, reserveKw: lp.reserveKw == null ? null : lp.reserveKw, note: lp.caveat || null, status: lp.status || null };
  out.archived = d.lifecycleStatus === 'archived';
  if (d.links && d.links.projectId) out.projectId = d.links.projectId;
  out.flags = Array.isArray(d.flags) ? d.flags : [];
  return out;
}

/* the street line, whichever shape the record holds */
function addressLine(site) { var a = site && site.address; return typeof a === 'string' ? a : (a && a.street) || ''; }
module.exports = { normalize: normalize, flatten: flatten, addressLine: addressLine, MAP: MAP };
