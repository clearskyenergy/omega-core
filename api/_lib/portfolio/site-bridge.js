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
     factEdits(doc, flat) → what an edit of the flat fields (the site
                            record's Save) says of the facts, so the CRM
                            writes the fact with the field
     lifecycleOf(doc)     → whether the site is archived, the one reading
                            both doors use; archiveState(bool) is the pair an
                            archive or a restore writes

   Rules: a fact is never invented — a flat field that is null makes no fact,
   a missing fact leaves the flat field alone; the reported peak from the
   intake stays flagged unresolved; a blank meter stays unknown.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

/* fact key ↔ flat field (the lease terms: their key under the record's
   commercial block) ↔ unit; a boolean fact keeps its tri-state */
var MAP = [
  ['installedChargerKw', 'installedKw', 'kW'],
  ['reportedPowerKw', 'reportedPeakKw', 'kW'],
  ['evcsOwnsMeter', 'meterOwned', null],
  ['shaRemainingYears', 'termYearsRemaining', 'years'],
  ['utility', 'utility', null],
  ['rateSchedule', 'rateSchedule', null],
  ['monthlyRentUsd', null, 'USD/month', 'rentMonthly'],
  ['revShare', null, 'fraction', 'revenueShare'],
  ['revSharePerKwh', null, 'USD/kWh', 'kwhShare']
];
function num(v) { if (v === null || v === undefined || v === '') return null; var n = Number(v); return isFinite(n) ? n : null; }
function has(v) { return v !== null && v !== undefined && v !== ''; }

/* The CRM keeps `archived`, the register `lifecycleStatus`; an archive or a
   restore through either door writes both (archiveState). Where they
   disagree, the register page's bulk archive or restore moved `archived`
   alone (before 2026-10-25): that flag is the last thing a person did to
   the site, so it wins, and the register's next write carries it into both. */
function lifecycleOf(d) {
  d = d || {};
  if (d.archived === true) return 'archived';
  if (d.archived === false && d.lifecycleStatus === 'archived') return 'active';
  return d.lifecycleStatus || 'active';
}
function archiveState(archived) { return { archived: archived === true, lifecycleStatus: archived === true ? 'archived' : 'active' }; }

function normalize(id, data) {
  data = data || {};
  var d = JSON.parse(JSON.stringify(data));
  d.siteId = d.siteId || id;
  d.name = d.name || '';
  d.revision = d.revision || 1;
  d.lifecycleStatus = lifecycleOf(d);
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
    MAP.forEach(function (m) {
      if (m[3] && has(cm[m[3]])) d.facts[m[0]] = { value: num(cm[m[3]]), unit: m[2], kind: 'supplied', raw: String(cm[m[3]]), source: { profile: 'site-crm', field: 'commercial.' + m[3] }, reviewStatus: 'unreviewed' };
    });
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
  MAP.forEach(function (m) { if (m[3] && fv(m[0]) !== undefined) cm[m[3]] = fv(m[0]); });
  if (Object.keys(cm).length) out.commercial = cm;
  var lp = d.opportunity && d.opportunity.legacyProxy;
  if (lp) out.screening = { label: lp.scenario || 'EVCS legacy proxy v1', screenKw: lp.screenKw == null ? null : lp.screenKw, pods: lp.pods == null ? null : lp.pods, reserveKw: lp.reserveKw == null ? null : lp.reserveKw, note: lp.caveat || null, status: lp.status || null };
  /* a register write never undoes an archive: the lifecycle is read the one way and written with the flag */
  out.lifecycleStatus = lifecycleOf(d); out.archived = out.lifecycleStatus === 'archived';
  if (d.links && d.links.projectId) out.projectId = d.links.projectId;
  out.flags = Array.isArray(d.flags) ? d.flags : [];
  return out;
}

/* What an edit of the flat fields says of the facts (the site record's
   Save, api/site-crm.js site-save): one entry { fact, value, unit } for
   each mapped field the edit SENDS whose value is not the fact's. A field
   not sent says nothing; a blank where there is no fact makes none (unknown
   stays unknown); a blank over a fact is the person clearing it. */
function factEdits(doc, flat) {
  var f = (doc && doc.facts) || {}, cm = (flat && flat.commercial) || {}, out = [];
  flat = flat || {};
  MAP.forEach(function (m) {
    var v = m[1] ? flat[m[1]] : cm[m[3]];
    if (v === undefined) return;
    var value = m[0] === 'evcsOwnsMeter' ? (v === true ? true : v === false ? false : null) : !has(v) ? null : m[2] ? num(v) : String(v);
    var cur = f[m[0]], was = cur && cur.value !== undefined ? cur.value : null;
    if (cur ? sameValue(was, value) : value === null) return;
    out.push({ fact: m[0], value: value, unit: m[2] });
  });
  return out;
}
function sameValue(a, b) {
  if (a == null || b == null) return a == null && b == null;
  return typeof a === 'number' || typeof b === 'number' ? Number(a) === Number(b) : a === b;
}

/* the street line, whichever shape the record holds */
function addressLine(site) { var a = site && site.address; return typeof a === 'string' ? a : (a && a.street) || ''; }
/* The ZIP an address carries, read the one way (2026-10-13, Tommy: "all the
   data based on the site zipcode"): the object's own zip, else the five
   digits after a state code ("…, CA 91304"), else five digits closing the
   line. A street number ("22125 Roscoe Blvd") is never taken for one. */
function zipFromAddress(a) {
  if (a && typeof a === 'object') { var z = String(a.zip == null ? '' : a.zip).trim(); if (/^\d{5}(-\d{4})?$/.test(z)) return z.slice(0, 5); a = a.street; }
  var t = String(a == null ? '' : a);
  var m = /\b[A-Z]{2}\.?,?\s+(\d{5})(?:-\d{4})?\b/.exec(t);
  if (!m && !/\b(?:box|suite|ste|unit|apt|#)\s*\d{5}/i.test(t)) m = /(\d{5})(?:-\d{4})?\s*(?:,?\s*(?:USA|US|United States))?\s*$/i.exec(t);
  return m ? m[1] : null;
}
module.exports = { normalize: normalize, flatten: flatten, factEdits: factEdits, lifecycleOf: lifecycleOf, archiveState: archiveState, addressLine: addressLine, zipFromAddress: zipFromAddress, MAP: MAP };
