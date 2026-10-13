/* ═══════════════════════════════════════════════════════════════════════════
   api/site-crm.js — the site CRM: one energy SITE, and what the workspace
   keeps about it
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   GET  /api/site-crm?org=&site=             { site, contacts[], activity[],
                                              followUps[], files[],
                                              proforma[] }
   GET  /api/site-crm?org=                   { sites[] }  (the register)
   GET  /api/site-crm?org=&site=&file=<id>   the document, as an attachment
   GET  /api/site-crm?org=&followUps=1       open follow-ups across every site
   POST /api/site-crm { org, site, action, … }
     site-save       { id?, name, city, state, address, installedKw,
                       reportedPeakKw, meterOwned, termYearsRemaining,
                       availablePowerMw, serviceCapacityKw, existingPeakKw,
                       powerPricePerKwh, annualUsageKwh, monthlyUsageKwh[12],
                       usageNotes, externalSiteIds, status, tags, notes }
     site-import     { rows: [ site-save-shaped, … ] }  bulk register,
                       at most 500 rows; all-or-nothing validation
     contact-save    { id?, name, title, email, phone, notes, primary }
     contact-archive { id }                               workspace admin
     log             { type, subject, body, at?, contactId?, followUpAt? }
     done            { id }                               a follow-up completed
     file-upload     { file: { name, base64 }, category, note, shared }
     file-share      { id, shared }
     file-archive    { id }                               workspace admin
     proforma-run    { pods | sizeFromPower:true, discountRateAnnual?,
                       overrides?, label?, assumptionVersion? }
                       sizeFromPower sizes pods from the site's available
                       power (entered MW, else service-minus-peak) via
                       proforma.sizePodsFromPower; the derivation is stored
                       on the scenario. assumptionVersion defaults to
                       omega-compute-v1 (evcs-compute-v1 stays available).
     proforma-get    { scenarioId? }  (latest when omitted)
   GET  /api/site-crm?org=&site=&agreement=1 the site's SPV term sheet (PDF,
                       DRAFT; api/_lib/site-agreement.js) as an attachment
   GET  /api/site-crm?org=&archived=1        the register WITH archived sites
   THE REGISTER (api/_lib/portfolio/register.js, folded in from the asset-
   manager draft, on this same collection) answers through this door:
     GET  ?view=|?viewId=|?export=csv|?views=1|?imports=1|?analyses=1|
          ?portfolios=1|?shortlist=|?handoff=|?bills=1|?results=|
          ?assumptionSets=1|?packages=1|?job=|?performance=1|?widget=1|
          ?pipeline=1|?crm=
     POST import-preview / import-commit / import-undo (a workbook or CSV:
          the EVCS intake by its header signature, the EVCS model package,
          or the generic site list; a field-level diff, conflicts on
          reviewed facts, undo), field-review, agreement-upsert,
          equipment-upsert, task-upsert, file-attach, view-save,
          view-delete, portfolio-save, site-archive {siteId,
          expectedRevision}, shortlist-create-projects, power-evidence,
          interval-upload, envelope-save, allocation-reserve, bess-check,
          handoff, handoff-result, map-sync, bill-save, bill-review,
          assumption-set-import, scenario-run, portfolio-irr,
          package-prepare, package-submit, crm-link, activity-log,
          job-start, job-step, job-cancel

   Bulk actions take { ids: [siteId, …] } (at most 200) and answer per site:
     site-archive / site-restore    hide from, or return to, the register
     site-delete                    permanent; workspace admin
     site-set-status { status }     the stage word on each site
     site-tag { add[], remove[] }   tags added and taken off
     send-to-editor                 ONE Site Map project per site
                                    (projects/{id}, siteId on it, projectId
                                    on the site), idempotent: a site that
                                    already has one gets the same one back
     send-to-finance                ONE finance-marketplace deal per site
                                    (fin_projects/{id}, the sponsor is the
                                    caller, the ask is the latest pro forma's
                                    investor capital): `open` to capital
                                    partners when a pro forma is on file,
                                    else a `draft` the sponsor finishes in
                                    the portal; idempotent the same way
     site-model (one site) { pods?, gpuClass?, structure?, zip?, hostType?,
                       label? }     the Compute Site Pro Forma on THIS site
                       (api/_lib/site-model.js maps the record to
                       api/_lib/compute-site.js; the one finance engine's
                       answer is stored under models/{id}, its figures on
                       the site as latestModel). The gate is the compute
                       pro forma's (Omega Compute / the tier).
                       IT ALSO RUNS BY ITSELF (2026-10-13): whenever the
                       Site Map design is read onto the site (a GET of the
                       site, the register's Sync Site Map, the editor's own
                       save) and the design is new or changed, the model
                       runs on it with no one typing — the ZIP off the
                       address, an Omega-Core skid on its own meter and
                       its own numbers — once per design and per change of
                       the site's facts; what stopped it is kept on the
                       site as designModel. See designModel() below.
     site-model-bulk { ids, …the same }  at most 10 a call
     send-to-partner { ids, partner: 'terra', note? }
                       the site's facts, figures and links mailed to a
                       development partner (api/_lib/partners.js: Terra
                       Energy's solar package); recorded on the site
                       (partners.<key>) and in partner_requests; 25 a
                       workspace a day; no address configured → refused,
                       nothing mailed
   GET  /api/site-crm?org=&site=&model=1   the latest model's full answer
                       (the deck's input) with the workspace's deck brand
     proforma-bulk { sizeFromPower:true | pods, discountRateAnnual?,
                     assumptionVersion?, label? }
                                    proforma-run on each site; a site that
                                    cannot be sized is named, not fatal

   Where: omega_orgs/{org}/sites/{siteId}, subcollections contacts|activity|
   files|proforma, and the follow-up index omega_orgs/{org}/sitecrm_followups
   — all Admin SDK only in the rules. A document's bytes are in PRIVATE
   Storage at sitecrm/{org}/{siteId}/{fileId}, never behind a URL.

   Who: a member of the workspace reads; owner/admin/member (not viewer)
   logs, uploads, sizes and keeps contacts; archiving is an administrator's.
   ClearSky staff may act in any workspace. The org is resolved from the
   verified identity (A.canActInOrg), never trusted from the request body.

   Nothing is deleted: a contact or document is archived, a follow-up is
   done, a pro forma scenario is immutable (a re-run is a new scenario).
   Every write lands in omega_audit (action sitecrm-*).
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var A = require('./_lib/admin'), C = require('./_lib/crm'), PF = require('./_lib/proforma');
var I = require('./_lib/po-intake'), G = require('./_lib/site-agreement'), K = require('./_lib/site-kinds'), DR = require('./_lib/portfolio/design-read');
var SM = require('./_lib/site-model'), CS = require('./_lib/compute-site'), PA = require('./_lib/package-access'), CP = require('./compute-proforma'), DECK = require('./_lib/deck-brand');
/* the Omega-Core skid's product record: its recorded price is what the pod
   pro forma charges for a skid on the design (the Site Map cost run never
   counts the skid: it is ClearSky's, on its own meter) */
var OC = require('./_lib/omega-core');
var REG = require('./_lib/portfolio/register'), BR = require('./_lib/portfolio/site-bridge');
var PARTNERS = require('./_lib/partners'), mail = require('./_lib/mail');
var PARTNER_DAILY_CAP = 25;

var EDITORS = ['owner', 'admin', 'member'], ADMINS = ['owner', 'admin'];
var LIST_CAP = 200, FOLLOW_SCAN = 2000, FOLLOW_CAP = 200, SCAN = 500;
var PROFORMA_CAP = 25, BULK_CAP = 200;
var BULK_ACTIONS = ['site-archive', 'site-restore', 'site-delete', 'site-set-status', 'site-tag', 'send-to-editor', 'send-to-finance', 'send-to-partner', 'proforma-bulk', 'site-model-bulk', 'design-sync'];
var MODEL_BULK_CAP = 10, PLATFORM = 'ClearSky-OMEGA';

/* level: 'read' | 'write' | 'admin'. The caller's org comes from the verified
   identity; staff pass everywhere. */
async function access(caller, org, level) {
  if (!(await A.canActInOrg(caller, org))) throw A.httpError(403, 'Not your workspace');
  if (caller.staff) return { edit: true, admin: true };
  var m = await A.db().collection('omega_orgs').doc(org).collection('members').doc(caller.uid).get();
  var role = m.exists ? (m.data() || {}).role : '';
  var who = { edit: EDITORS.indexOf(role) >= 0, admin: ADMINS.indexOf(role) >= 0 };
  if (level === 'write' && !who.edit) throw A.httpError(403, 'Your role in this workspace can read the site CRM but not change it');
  if (level === 'admin' && !who.admin) throw A.httpError(403, 'Only a workspace administrator can do that');
  return who;
}
function audit(tx, db, action, org, siteId, by, at, extra) {
  tx.create(db.collection('omega_audit').doc(), Object.assign({ action: action, orgId: org, siteId: siteId, by: by, at: at }, extra || {}));
}

/* ── site facts ───────────────────────────────────────────────────────────
   Unknown stays unknown: meterOwned is true|false|null and a missing peak
   or term is null, never 0. installedKw is charger nameplate, never
   approved service capacity. */
function optNum(v, label, min, max) {
  if (v === undefined || v === null || v === '') return null;
  var n = Number(v);
  if (!isFinite(n) || n < min || n > max) throw C.fail(400, label + ' must be a number between ' + min + ' and ' + max);
  return n;
}
function optBool(v) {
  if (v === undefined || v === null || v === '') return null;
  if (v === true || v === 'true' || v === 1 || v === '1') return true;
  if (v === false || v === 'false' || v === 0 || v === '0') return false;
  throw C.fail(400, 'Meter ownership must be true, false, or left unknown');
}
/* Twelve monthly kWh figures (Jan..Dec), blanks stay null. Accepts an array
   or a comma-separated string. All-blank collapses to null (unknown). */
function optMonthlyUsage(v) {
  if (v === undefined || v === null || v === '') return null;
  var arr = Array.isArray(v) ? v : String(v).split(',');
  if (arr.length !== 12) throw C.fail(400, 'Monthly usage must be 12 comma-separated kWh values, Jan through Dec');
  var out = arr.map(function (x, i) {
    if (x === undefined || x === null || String(x).trim() === '') return null;
    var n = Number(String(x).replace(/\s/g, ''));
    if (!isFinite(n) || n < 0 || n > 1e12) throw C.fail(400, 'Monthly usage values must be kWh numbers of 0 or more');
    return n;
  });
  if (out.every(function (x) { return x == null; })) return null;
  return out;
}
function siteInput(b) {
  b = b || {};
  var ext = b.externalSiteIds && typeof b.externalSiteIds === 'object' ? b.externalSiteIds : {};
  var ids = {};
  Object.keys(ext).slice(0, 10).forEach(function (k) {
    var key = C.text(k, 40, 'External ID source'), val = C.text(ext[k], 120, 'External ID');
    if (key && val) ids[key] = val;
  });
  var tags = Array.isArray(b.tags) ? b.tags.map(function (t) { return C.text(t, 40, 'Tag'); }).filter(Boolean).slice(0, 20) : [];
  return {
    name: C.text(b.name, 200, 'Site name', { required: true }),
    city: C.text(b.city, 120, 'City'),
    state: C.text(b.state, 10, 'State'),
    address: C.text(b.address, 300, 'Address'),
    installedKw: optNum(b.installedKw, 'Installed charger kW', 0, 1000000),
    reportedPeakKw: optNum(b.reportedPeakKw, 'Reported peak kW', 0, 1000000),
    peakDefinition: C.text(b.peakDefinition, 300, 'Peak definition'),
    meterOwned: optBool(b.meterOwned),
    termYearsRemaining: optNum(b.termYearsRemaining, 'Remaining term (years)', 0, 99),
    availablePowerMw: optNum(b.availablePowerMw, 'Available power (MW)', 0, 100000),
    serviceCapacityKw: optNum(b.serviceCapacityKw, 'Service capacity (kW)', 0, 100000000),
    existingPeakKw: optNum(b.existingPeakKw, 'Existing peak kW', 0, 100000000),
    powerPricePerKwh: optNum(b.powerPricePerKwh, 'Power price ($/kWh)', 0, 10),
    annualUsageKwh: optNum(b.annualUsageKwh, 'Annual usage (kWh)', 0, 1e15),
    monthlyUsageKwh: optMonthlyUsage(b.monthlyUsageKwh),
    usageNotes: C.text(b.usageNotes, 2000, 'Usage notes', { multiline: true }),
    zip: optZip(b.zip),
    hostType: optEnum(b.hostType, SM.HOST_TYPES, 'Host type'),
    meters: tagList(b.meters),
    status: C.text(b.status, 60, 'Status'),
    notes: C.text(b.notes, 4000, 'Notes', { multiline: true }),
    externalSiteIds: ids,
    tags: tags,
    /* what KIND of project the site is: the Site Map project's own scope keys
       (api/_lib/site-kinds.js). Absent from the body = unchanged; [] clears. */
    siteScopes: K.scopesInput(b.siteScopes)
  };
}
/* A field the caller did not send is not a field set to null: strip it, so a
   save from an older form or an import sheet leaves the stored value alone
   (Firestore refuses undefined outright). */
function sentFields(input) {
  Object.keys(input).forEach(function (k) { if (input[k] === undefined) delete input[k]; });
  return input;
}
function siteView(id, s) {
  s = s || {};
  return {
    id: id, name: s.name || '', city: s.city || '', state: s.state || '', address: BR.addressLine(s),
    installedKw: s.installedKw == null ? null : Number(s.installedKw),
    reportedPeakKw: s.reportedPeakKw == null ? null : Number(s.reportedPeakKw),
    peakDefinition: s.peakDefinition || null,
    peakUnresolved: s.peakUnresolved === true,
    meterOwned: s.meterOwned == null ? null : s.meterOwned === true,
    termYearsRemaining: s.termYearsRemaining == null ? null : Number(s.termYearsRemaining),
    availablePowerMw: s.availablePowerMw == null ? null : Number(s.availablePowerMw),
    serviceCapacityKw: s.serviceCapacityKw == null ? null : Number(s.serviceCapacityKw),
    existingPeakKw: s.existingPeakKw == null ? null : Number(s.existingPeakKw),
    powerPricePerKwh: s.powerPricePerKwh == null ? null : Number(s.powerPricePerKwh),
    annualUsageKwh: s.annualUsageKwh == null ? null : Number(s.annualUsageKwh),
    monthlyUsageKwh: Array.isArray(s.monthlyUsageKwh) ? s.monthlyUsageKwh : null,
    usageNotes: s.usageNotes || null,
    screening: s.screening || null,
    status: s.status || '', notes: s.notes || '',
    latestProforma: s.latestProforma || null,
    zip: s.zip || null, hostType: s.hostType || null, meters: Array.isArray(s.meters) ? s.meters : [],
    latestModel: s.latestModel || null,
    projectId: s.projectId || null, projectAt: C.iso(s.projectAt),
    finProjectId: s.finProjectId || null, finProjectAt: C.iso(s.finProjectAt), finProjectStatus: s.finProjectStatus || null,
    archived: s.archived === true, archivedAt: C.iso(s.archivedAt),
    partners: s.partners || null, revision: s.revision || 1,
    externalSiteIds: s.externalSiteIds || {}, tags: s.tags || [],
    siteScopes: Array.isArray(s.siteScopes) ? s.siteScopes : [],
    latestDesign: s.latestDesign && typeof s.latestDesign === 'object' ? s.latestDesign : null,
    /* what the automatic compute model did with the design last: ran (modelId), or what stopped it */
    designModel: s.designModel && typeof s.designModel === 'object' ? s.designModel : null,
    createdAt: C.iso(s.createdAt), createdBy: s.createdBy || null,
    updatedAt: C.iso(s.updatedAt), updatedBy: s.updatedBy || null,
    source: s.source || null
  };
}

/* ── documents: the one writer and one reader of the bytes ───────────────
   Same shape as api/crm.js's store(), but under sitecrm/{org}/{siteId}/ so
   site files never share a namespace with account files. */
async function store(db, org, site, file, meta) {
  var files = site.ref.collection('files'), ref = files.doc(C.newId('f_')), path = 'sitecrm/' + org + '/' + site.id + '/' + ref.id;
  var now = new Date().toISOString();
  var reserved = await db.runTransaction(async function (tx) {
    var fresh = await tx.get(site.ref), same = await tx.get(files.where('sha256', '==', file.sha256).limit(10));
    if (!fresh.exists) throw A.httpError(404, 'Site not found');
    var dup = same.docs.filter(function (d) { var v = d.data() || {}; return v.uploadState === 'stored' && v.archived !== true && v.name === file.name; })[0];
    if (dup) return { duplicate: true, id: dup.id, record: dup.data() };
    var record = { orgId: org, siteId: site.id, name: file.name, type: file.type, size: file.size, sha256: file.sha256, path: path,
      category: meta.category, note: meta.note, shared: meta.shared === true, from: 'office',
      uploadedBy: meta.by, uploadedAt: now, archived: false, uploadState: 'pending' };
    tx.create(ref, record);
    return { duplicate: false, id: ref.id, record: record };
  });
  if (reserved.duplicate) return { ok: true, duplicate: true, id: reserved.id, file: C.fileView(reserved.id, reserved.record, 'office') };
  try {
    await I.bucket().file(path).save(file.bytes, { resumable: false, contentType: 'application/octet-stream', metadata: { cacheControl: 'private, no-store', contentDisposition: 'attachment' } });
  } catch (e) {
    console.error('[site-crm store]', e);
    try { await ref.update({ uploadState: 'failed', failedAt: new Date().toISOString() }); } catch (x) { console.error('[site-crm store mark]', x); }
    throw A.httpError(502, 'The document could not be stored. Nothing was saved; please try again.');
  }
  var stored = new Date().toISOString(), r = reserved.record;
  await db.runTransaction(async function (tx) {
    tx.update(ref, { uploadState: 'stored', storedAt: stored });
    audit(tx, db, 'sitecrm-file-upload', org, site.id, meta.by, stored, { fileId: ref.id, name: r.name, type: r.type, size: r.size, sha256: r.sha256, shared: r.shared, category: r.category });
  });
  reserved.record.uploadState = 'stored';
  return { ok: true, duplicate: false, id: ref.id, file: C.fileView(reserved.id, reserved.record, 'office') };
}
async function stream(res, org, siteId, f) {
  if (!f || f.uploadState !== 'stored' || String(f.path || '').indexOf('sitecrm/' + org + '/' + siteId + '/') !== 0) throw A.httpError(404, 'Document not found');
  var contents = await I.bucket().file(f.path).download();
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Disposition', C.disposition(f.name));
  res.end(contents[0]);
}

var handler = A.handler(async function (req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'POST') throw A.httpError(405, 'GET or POST only');
  var caller = await A.authenticate(req), b = (req.method === 'GET' ? req.query : req.body) || {}, org = A.safeOrg(b.org);
  if (!org) throw A.httpError(400, 'Valid org required');
  if (!(await A.canActInOrg(caller, org))) throw A.httpError(403, 'Not your workspace');
  var db = A.db(), root = db.collection('omega_orgs').doc(org), by = caller.email, now = new Date().toISOString();

  /* ── Today: every open follow-up across the portfolio ───────────────── */
  if (req.method === 'GET' && (b.followUps === '1' || b.followUps === 'true' || b.followUps === true)) {
    await access(caller, org, 'read');
    var open = await root.collection('sitecrm_followups').where('open', '==', true).limit(FOLLOW_SCAN).get();
    var rows = open.docs.map(function (d) { return d.data() || {}; }).filter(function (d) { return d.activityId && d.siteId; }).sort(C.byDue);
    var shown = rows.slice(0, FOLLOW_CAP), ids = [];
    shown.forEach(function (d) { if (ids.indexOf(d.siteId) < 0) ids.push(d.siteId); });
    var names = {};
    (await Promise.all(ids.map(function (id) { return root.collection('sites').doc(id).get(); }))).forEach(function (s) { if (s.exists) names[s.id] = (s.data() || {}).name || ''; });
    return { followUps: shown.map(function (d) { return siteFollowUpView(d, names[d.siteId] != null ? names[d.siteId] : null); }),
      limited: open.size >= FOLLOW_SCAN || rows.length > FOLLOW_CAP };
  }

  /* ── the register ───────────────────────────────────────────────────── */
  if (req.method === 'GET' && !b.site) {
    var reader = await access(caller, org, 'read');
    var q = root.collection('sites').orderBy('__name__').limit(LIST_CAP + 1);
    if (b.startAfter) q = root.collection('sites').orderBy('__name__').startAfter(b.startAfter).limit(LIST_CAP + 1);
    var snap = await q.get(), withArchived = b.archived === '1' || b.archived === 'true' || b.archived === true;
    var sites = snap.docs.filter(function (d) { return withArchived || (d.data() || {}).archived !== true; })
      .slice(0, LIST_CAP).map(function (d) { return siteView(d.id, d.data()); });
    await capitalJoin(db, sites);
    return { org: org, sites: sites, archivedIncluded: withArchived, canEdit: reader.edit, canArchive: reader.admin,
      next: snap.docs.length > LIST_CAP ? snap.docs[LIST_CAP - 1].id : null,
      limited: snap.docs.length > LIST_CAP };
  }

  var action = String(b.action || 'read');
  var adminOnly = action === 'file-archive' || action === 'contact-archive';
  var who = await access(caller, org, adminOnly ? 'admin' : req.method === 'POST' ? 'write' : 'read');
  var BULK = BULK_ACTIONS.indexOf(action) >= 0;
  if (!b.site && action !== 'site-save' && action !== 'site-import' && !BULK) throw A.httpError(400, 'Which site?');
  var sid = b.site ? C.recordId(b.site, 'Site') : null;
  var siteRef = sid ? root.collection('sites').doc(sid) : null;
  var siteSnap = siteRef ? await siteRef.get() : null;
  if (siteRef && !siteSnap.exists && action !== 'site-save') throw A.httpError(404, 'Site not found');
  var site = siteRef ? { id: sid, data: siteSnap.exists ? siteSnap.data() || {} : null, ref: siteRef } : null;
  var contactsCol = siteRef ? siteRef.collection('contacts') : null, activityCol = siteRef ? siteRef.collection('activity') : null,
      filesCol = siteRef ? siteRef.collection('files') : null, proformaCol = siteRef ? siteRef.collection('proforma') : null,
      followCol = root.collection('sitecrm_followups');

  if (req.method === 'GET' && b.file) {
    var fs = await filesCol.doc(C.recordId(b.file, 'Document')).get(), f = fs.exists ? fs.data() || {} : null;
    if (!f || f.archived === true) throw A.httpError(404, 'Document not found');
    return stream(res, org, sid, f);
  }

  /* ── the SPV term sheet: composed from the record and the latest scenario,
     rendered on the way out, never stored as a fact. A DRAFT every time. */
  if (req.method === 'GET' && (b.agreement === '1' || b.agreement === 'true')) {
    var latestQ = await proformaCol.orderBy('createdAt', 'desc').limit(1).get();
    var latest = latestQ.docs.length ? latestQ.docs[0].data() : null;
    var orgDoc = await root.get(), orgName = orgDoc.exists ? ((orgDoc.data() || {}).name || org) : org;
    var primary = await contactsCol.where('archived', '==', false).where('primary', '==', true).limit(1).get();
    var host = primary.docs.length ? ((primary.docs[0].data() || {}).name || null) : null;
    var sheet = G.compose({ site: Object.assign({ id: sid }, site.data), scenario: latest, org: org, workspaceName: orgName, hostName: host, by: by, now: now });
    var bytes = await G.render(sheet);
    await db.collection('omega_audit').add({ action: 'sitecrm-agreement-export', orgId: org, siteId: sid, by: by, at: now, scenarioId: sheet.meta.scenarioId, ready: sheet.ready, fileName: sheet.fileName });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Disposition', C.disposition(sheet.fileName));
    res.setHeader('X-Omega-Agreement', sheet.ready ? 'ready' : 'no-proforma');
    return res.end(Buffer.from(bytes));
  }

  if (req.method === 'GET' && (b.model === '1' || b.model === 'true')) {
    var mq = b.modelId ? [await siteRef.collection('models').doc(C.recordId(b.modelId, 'Model')).get()] : (await siteRef.collection('models').orderBy('createdAt', 'desc').limit(1).get()).docs;
    var md = mq[0] && mq[0].exists ? mq[0].data() : null;
    if (!md) return { model: null, note: 'No compute model has run on this site yet.' };
    var orgDocM = await root.get();
    return { model: { id: mq[0].id, input: md.input, basis: md.basis || null, result: md.result, summary: md.summary || null, label: md.label || '', createdAt: md.createdAt, createdBy: md.createdBy || null },
      brand: DECK.brandOf(orgDocM.exists ? orgDocM.data() : null, org, PLATFORM) };
  }

  if (req.method === 'GET' && action === 'proforma-get') {
    var pq = proformaCol.orderBy('createdAt', 'desc').limit(PROFORMA_CAP);
    var ps = await pq.get();
    var list = ps.docs.map(function (d) { return proformaView(d.id, d.data() || {}); });
    if (b.scenarioId) {
      var one = list.filter(function (x) { return x.scenarioId === b.scenarioId; })[0];
      if (!one) throw A.httpError(404, 'Scenario not found');
      return { scenario: one };
    }
    return { scenarios: list };
  }

  if (req.method === 'GET') {
    var got = await Promise.all([
      contactsCol.where('archived', '==', false).limit(LIST_CAP + 1).get(),
      activityCol.orderBy('at', 'desc').limit(LIST_CAP).get(),
      filesCol.where('archived', '==', false).limit(SCAN).get(),
      followCol.where('siteId', '==', sid).where('open', '==', true).limit(FOLLOW_CAP).get(),
      filesCol.orderBy('uploadedAt', 'desc').limit(LIST_CAP).get(),
      proformaCol.orderBy('createdAt', 'desc').limit(5).get()
    ]);
    var contactNames = {}, contacts = [];
    got[0].docs.forEach(function (d) { var v = d.data() || {}; contactNames[d.id] = v.name || v.email || ''; if (v.archived !== true) contacts.push(C.contactView(d.id, v)); });
    contacts.sort(function (x, y) { return (y.primary ? 1 : 0) - (x.primary ? 1 : 0) || String(x.name).toLowerCase().localeCompare(String(y.name).toLowerCase()); });
    contacts = contacts.slice(0, LIST_CAP);
    var activityRaw = got[1].docs.map(function (d) { return Object.assign({}, d.data() || {}, { id: d.id }); });
    var live = got[2].docs.map(function (d) { return Object.assign({}, d.data() || {}, { id: d.id }); }).filter(function (x) { return x.uploadState === 'stored'; })
      .sort(function (x, y) { return C.millis(y.uploadedAt) - C.millis(x.uploadedAt); });
    /* the design first: what Site Map drew and ran, read off the linked
       project so the page, the pro forma and the compute model see it —
       and the compute model on it, by itself, when the design is new */
    var auto = null;
    try { await syncDesign(db, org, site, now); auto = await designModel(db, org, site, { caller: caller, root: root, by: by }, now); }
    catch (e) { console.error('[site-crm] design sync', e && e.message); }
    var siteOut = siteView(sid, site.data); await capitalJoin(db, [siteOut]);
    var dsgOut = siteOut.latestDesign;
    return {
      site: siteOut,
      /* the Omega-Core skid's facts for a page whose design carries one: the product record's, never a page's own */
      skid: dsgOut && dsgOut.compute && dsgOut.compute.omegaCoreUnits > 0 ? SM.skidFacts() : null,
      autoModel: auto && auto.ran ? { modelId: auto.ran.modelId, latestModel: auto.ran.summary } : null,
      contacts: contacts,
      activity: activityRaw.map(function (a) { return siteActivityView(a.id, a, contactNames); }),
      followUps: got[3].docs.map(function (d) { return siteFollowUpView(d.data() || {}, site.data.name || '', contactNames); }).sort(C.byDue),
      files: live.slice(0, LIST_CAP).map(function (x) { return C.fileView(x.id, x, 'office'); }),
      proforma: got[5].docs.map(function (d) { return proformaView(d.id, d.data() || {}); }),
      canEdit: who.edit, canArchive: who.admin,
      limited: got[0].size > LIST_CAP || got[1].size >= LIST_CAP || got[2].size >= SCAN
    };
  }

  /* ── site facts ─────────────────────────────────────────────────────── */
  if (action === 'site-save') {
    var input = sentFields(siteInput(b)), id = b.id ? C.recordId(b.id, 'Site') : null, cref = id ? root.collection('sites').doc(id) : root.collection('sites').doc();
    return db.runTransaction(async function (tx) {
      var cur = id ? await tx.get(cref) : null;
      if (id && !cur.exists) throw A.httpError(404, 'That site is not in this workspace');
      var doc;
      if (id) {
        var curD = cur.data() || {}, patchD = Object.assign({}, input, { updatedAt: now, updatedBy: by });
        if (curD.address && typeof curD.address === 'object') patchD.address = Object.assign({}, curD.address, { street: input.address || null, city: input.city || curD.address.city || null, state: input.state || curD.address.state || null, zip: input.zip || curD.address.zip || null });
        doc = Object.assign({}, curD, patchD); tx.update(cref, patchD);
      }
      else { doc = Object.assign({ orgId: org }, input, { archived: false, createdAt: now, createdBy: by }); tx.create(cref, doc); }
      audit(tx, db, 'sitecrm-site-save', org, cref.id, by, now, { created: !id, site: input });
      return { ok: true, id: cref.id, site: siteView(cref.id, doc), note: id ? 'Site saved.' : 'Site added.' };
    });
  }

  /* ── bulk register: every org uploads its own sites ───────────────────
     rows[] are site-save-shaped objects. Every row is validated first;
     if any row fails, nothing is written. Writes are batched (2 writes
     per site: the site plus its audit entry). */
  if (action === 'site-import') {
    var rows = b.rows;
    if (!Array.isArray(rows) || !rows.length) throw A.httpError(400, 'No rows to import');
    if (rows.length > 500) throw A.httpError(400, 'At most 500 rows per import; split the file and retry');
    var prepared = [], importErrors = [];
    rows.forEach(function (r, i) {
      try { prepared.push(sentFields(siteInput(r || {}))); }
      catch (e) { importErrors.push({ row: i + 1, error: e.message }); }
    });
    if (importErrors.length)
      return { ok: false, imported: 0, errorCount: importErrors.length, errors: importErrors.slice(0, 25),
        note: 'Fix the flagged rows and re-import. Nothing was written.' };
    var ids = [], batch = db.batch(), wn = 0;
    async function flush() { await batch.commit(); batch = db.batch(); wn = 0; }
    for (var bi = 0; bi < prepared.length; bi++) {
      var bref = root.collection('sites').doc();
      var bdoc = Object.assign({ orgId: org }, prepared[bi],
        { archived: false, createdAt: now, createdBy: by, source: 'site-import' });
      batch.create(bref, bdoc);
      batch.create(db.collection('omega_audit').doc(),
        { action: 'sitecrm-import', orgId: org, siteId: bref.id, by: by, at: now, source: 'site-import', name: prepared[bi].name });
      ids.push(bref.id); wn += 2;
      if (wn >= 400) await flush();
    }
    await batch.commit();
    return { ok: true, imported: prepared.length, ids: ids,
      note: prepared.length + ' site(s) imported into this workspace.' };
  }

  /* ── bulk site actions ──────────────────────────────────────────────────
     ids: [siteId, …] (max 200), the register's selection. Archive hides a
     site from the register and restore returns it; delete is permanent and
     an administrator's; set-status is the stage word; tag adds and removes.
     Every id is checked against THIS workspace's register first, so a
     selection from another tab cannot touch a site that moved. */
  if (BULK) {
    var ids = Array.isArray(b.ids) ? b.ids.map(function (x) { return C.recordId(x, 'Site'); }).filter(Boolean) : [];
    if (!ids.length) throw A.httpError(400, 'No sites selected');
    if (ids.length > BULK_CAP) throw A.httpError(400, 'At most ' + BULK_CAP + ' sites per action');
    ids = ids.filter(function (x, i) { return ids.indexOf(x) === i; });
    if (action === 'site-delete' && !who.admin)
      throw A.httpError(403, 'Only an administrator can permanently delete sites');
    var picked = await Promise.all(ids.map(function (id) { return root.collection('sites').doc(id).get(); }));
    var missing = picked.filter(function (s) { return !s.exists; }).map(function (s) { return s.id; });
    if (missing.length) throw A.httpError(404, 'Not in this workspace’s register: ' + missing.slice(0, 5).join(', '));
    var rows = picked.map(function (s) { return { id: s.id, ref: s.ref, data: s.data() || {} }; });

    if (action === 'site-archive' || action === 'site-restore' || action === 'site-delete' || action === 'site-set-status' || action === 'site-tag') {
      var st = action === 'site-set-status' ? C.text(b.status, 60, 'Status', { required: true }) : null;
      var addTags = action === 'site-tag' ? tagList(b.add) : [], dropTags = action === 'site-tag' ? tagList(b.remove) : [];
      if (action === 'site-tag' && !addTags.length && !dropTags.length) throw A.httpError(400, 'Name a tag to add or remove');
      var batch2 = db.batch();
      rows.forEach(function (rw) {
        var patch = null;
        if (action === 'site-delete') batch2.delete(rw.ref);
        else if (action === 'site-archive') patch = { archived: true, archivedAt: now, archivedBy: by };
        else if (action === 'site-restore') patch = { archived: false, restoredAt: now, restoredBy: by };
        else if (action === 'site-set-status') patch = { status: st };
        else {
          var tags = (Array.isArray(rw.data.tags) ? rw.data.tags : []).filter(function (t) { return dropTags.indexOf(t) < 0; });
          addTags.forEach(function (t) { if (tags.indexOf(t) < 0) tags.push(t); });
          patch = { tags: tags.slice(0, 20) };
        }
        if (patch) batch2.update(rw.ref, Object.assign(patch, { updatedAt: now, updatedBy: by }));
        batch2.create(db.collection('omega_audit').doc(),
          { action: 'sitecrm-' + action, orgId: org, siteId: rw.id, by: by, at: now, status: st, add: addTags, remove: dropTags, was: action === 'site-delete' ? rw.data : null });
      });
      await batch2.commit();
      var n2 = rows.length;
      var note2 = action === 'site-delete' ? n2 + ' site(s) permanently deleted.'
        : action === 'site-archive' ? n2 + ' site(s) archived. They are kept on record; Show archived lists them.'
        : action === 'site-restore' ? n2 + ' site(s) back on the register.'
        : action === 'site-set-status' ? n2 + ' site(s) moved to "' + st + '".'
        : n2 + ' site(s) tagged.';
      return { ok: true, count: n2, ids: rows.map(function (rw) { return rw.id; }), note: note2 };
    }

    /* ── send to the editor: one Site Map project per site ──────────────
       The project is the shape omega-newproject.js writes (the editor and
       the dashboard read it), with the site named on it and the project
       named on the site. A site that already has a project that still
       exists gets the same one back: pressing the button twice never makes
       two drawings of one site. */
    /* ── read the Site Map design onto each site ───────────────────────── */
    if (action === 'design-sync') {
      var syncedD = [], noProject = [], batchD = db.batch(), modelled = [], stopped = [], ctxD = { caller: caller, root: root, by: by }, srcD = b.source === 'editor' ? 'editor' : 'register';
      for (var di = 0; di < rows.length; di++) {
        if (!rows[di].data.projectId) { noProject.push(rows[di].id); continue; }
        var dsg = await syncDesign(db, org, rows[di], now);
        /* the compute model on the design, by itself: a year of hourly
           dispatch and a finance run each, so at most MODEL_BULK_CAP a call;
           the rest run on their next open or the next sync */
        var dmr = modelled.length < MODEL_BULK_CAP ? await designModel(db, org, rows[di], ctxD, now) : null;
        if (dmr && dmr.ran) modelled.push({ siteId: rows[di].id, modelId: dmr.ran.modelId, latestModel: dmr.ran.summary });
        else if (dmr && dmr.skipped && dmr.skipped !== 'no-access') stopped.push({ siteId: rows[di].id, name: rows[di].data.name || '', why: dmr.missing ? dmr.missing.join('; ') : dmr.error || dmr.skipped });
        syncedD.push({ siteId: rows[di].id, design: dsg, model: dmr && dmr.ran ? dmr.ran.summary : null });
        batchD.create(db.collection('omega_audit').doc(), { action: 'sitecrm-design-sync', orgId: org, siteId: rows[di].id, by: by, at: now, projectId: rows[di].data.projectId, hash: dsg ? dsg.hash : null, source: srcD, modelId: dmr && dmr.ran ? dmr.ran.modelId : null });
      }
      if (syncedD.length) await batchD.commit();
      return { ok: true, synced: syncedD.length, noProject: noProject.length, designs: syncedD, modelled: modelled, stopped: stopped,
        note: syncedD.length + ' site(s) read from Site Map' + (modelled.length ? '; the compute model ran on ' + modelled.length : '') +
          (stopped.length ? '; ' + stopped.length + ' could not be modelled: ' + stopped.slice(0, 3).map(function (f) { return (f.name || f.siteId) + ' (' + f.why + ')'; }).join('; ') : '') +
          (noProject.length ? '; ' + noProject.length + ' not designed yet' : '') + '.' };
    }

    if (action === 'send-to-editor') {
      var ownerName = (caller.claims && (caller.claims.name || caller.claims.displayName)) || String(by || '').split('@')[0];
      var madeP = [], FVp = A.FieldValue();
      for (var pi = 0; pi < rows.length; pi++) {
        var rw = rows[pi], existingP = rw.data.projectId ? await db.collection('projects').doc(rw.data.projectId).get() : null;
        if (existingP && existingP.exists) { madeP.push({ siteId: rw.id, projectId: existingP.id, created: false }); continue; }
        var scopes = siteScopes(rw.data), pref = db.collection('projects').doc();
        var proj = { uid: caller.uid, orgId: org, ownerEmail: String(by || '').toLowerCase(), ownerName: ownerName,
          name: rw.data.name || 'Site', address: [rw.data.address, rw.data.city, rw.data.state].filter(Boolean).join(', '),
          type: scopes[0] === 'der' ? 'solar' : scopes[0], client: '', siteScopes: scopes, stage: 'candidate',
          siteId: rw.id, siteOrgId: org, source: 'portfolio',
          createdAt: FVp.serverTimestamp(), updatedAt: FVp.serverTimestamp(),
          elements: [], conduits: [], bessList: [], annotations: [] };
        var batchP = db.batch();
        batchP.set(pref, proj);
        batchP.update(rw.ref, { projectId: pref.id, projectAt: now, updatedAt: now, updatedBy: by });
        batchP.create(db.collection('omega_audit').doc(), { action: 'sitecrm-send-to-editor', orgId: org, siteId: rw.id, by: by, at: now, projectId: pref.id, siteScopes: scopes });
        await batchP.commit();
        madeP.push({ siteId: rw.id, projectId: pref.id, created: true });
      }
      var newP = madeP.filter(function (m) { return m.created; }).length;
      return { ok: true, projects: madeP, created: newP,
        note: newP + ' project(s) created in Site Map' + (madeP.length > newP ? '; ' + (madeP.length - newP) + ' already had one' : '') + '.' };
    }

    /* ── send to the finance marketplace: one deal per site ───────────────
       The deal is the shape the financing portal's own form writes
       (portals/finance/app.js), the sponsor is the caller, and the ask is
       the latest pro forma's investor capital. With a pro forma on file the
       deal is OPEN to approved capital partners at once; without one it is a
       DRAFT only the sponsor sees, finished in the portal. Idempotent as
       the editor hand-off is. */
    if (action === 'send-to-finance') {
      var orgRec = await root.get(), orgNm = orgRec.exists ? ((orgRec.data() || {}).name || org) : org;
      var madeF = [], FVf = A.FieldValue();
      for (var fi = 0; fi < rows.length; fi++) {
        var rf = rows[fi], existingF = rf.data.finProjectId ? await db.collection('fin_projects').doc(rf.data.finProjectId).get() : null;
        if (existingF && existingF.exists) { madeF.push({ siteId: rf.id, finProjectId: existingF.id, status: (existingF.data() || {}).status || null, created: false }); continue; }
        var ask = SM.askOf(rf.data), lp = rf.data.latestProforma || null, lm = rf.data.latestModel || null, ready = !!ask, fref = db.collection('fin_projects').doc();
        var deal = { name: rf.data.name || 'Site', type: 'compute', location: [rf.data.city, rf.data.state].filter(Boolean).join(', '),
          capacityKw: lm && lm.serviceKw != null ? lm.serviceKw : lp && lp.itKw != null ? lp.itKw : (rf.data.installedKw == null ? null : Number(rf.data.installedKw)),
          costBasis: ready ? ask.amount : null, ask: ready ? ask.amount : null,
          mw: lm && lm.serviceKw > 0 ? Math.round(lm.serviceKw / 1000 * 1000) / 1000 : lp && lp.facilityKw > 0 ? Math.round(lp.facilityKw / 1000 * 1000) / 1000 : null,
          proformaSummary: ready ? (ask.source === 'compute-model' ? modelLine(lm) : proformaLine(lp)) : '',
          capitalRequest: ready ? Object.assign({ sentAt: now, sentBy: by }, ask) : null, notes: 'From the ' + orgNm + ' portfolio register (site ' + rf.id + ').',
          developerUid: caller.uid, developerOrg: orgNm, developerName: ownerOf(caller, by), submitterRole: 'developer', submitterEmail: String(by || '').toLowerCase(),
          status: ready ? 'open' : 'draft', offerCount: 0, awardedTo: null, awardedToOrg: null, docs: {}, links: [],
          orgId: org, siteId: rf.id, siteOrgId: org, source: 'portfolio', sourceScenarioId: ask && ask.scenarioId || null, sourceModelId: ask && ask.modelId || null,
          createdAt: FVf.serverTimestamp(), updatedAt: FVf.serverTimestamp() };
        var batchF = db.batch();
        batchF.set(fref, deal);
        batchF.update(rf.ref, { finProjectId: fref.id, finProjectAt: now, finProjectStatus: deal.status, updatedAt: now, updatedBy: by });
        batchF.create(db.collection('omega_audit').doc(), { action: 'sitecrm-send-to-finance', orgId: org, siteId: rf.id, by: by, at: now, finProjectId: fref.id, status: deal.status, ask: deal.ask });
        await batchF.commit();
        madeF.push({ siteId: rf.id, finProjectId: fref.id, status: deal.status, created: true });
      }
      var opened = madeF.filter(function (m) { return m.created && m.status === 'open'; }).length, drafted = madeF.filter(function (m) { return m.created && m.status === 'draft'; }).length;
      return { ok: true, deals: madeF, opened: opened, drafted: drafted,
        note: (opened ? opened + ' deal(s) open to capital partners' : '') + (opened && drafted ? '; ' : '') + (drafted ? drafted + ' saved as draft(s): run a pro forma to list them with an ask' : '') + (madeF.length > opened + drafted ? (opened || drafted ? '; ' : '') + (madeF.length - opened - drafted) + ' already on the marketplace' : '') + '.' };
    }

    /* ── send to a development partner (Terra Energy: the solar package) ──
       The partner's address is read from the environment or the deal
       room's settings, never a constant; with none configured nothing is
       mailed and the page says so. One record per site per send, the
       day's count held on a counter no rule opens, the sender in copy. */
    if (action === 'send-to-partner') {
      var partner = PARTNERS.get(String(b.partner || ''));
      if (!partner) throw A.httpError(400, 'Which partner? ' + PARTNERS.list().map(function (p) { return p.key + ' (' + p.name + ')'; }).join(', '));
      var settingsDoc = await db.collection('fin_settings').doc('dealroom').get(), rcpt = PARTNERS.recipients(partner, process.env, settingsDoc.exists ? settingsDoc.data() : null);
      if (!rcpt.to.length) throw A.httpError(409, partner.name + ' has no address on this deployment (' + partner.env + ', or fin_settings/dealroom.orgs.' + partner.settings + '). Nothing was sent.');
      var orgRecP = await root.get(), orgNmP = orgRecP.exists ? ((orgRecP.data() || {}).name || org) : org, day = now.slice(0, 10), noteP = C.text(b.note, 1000, 'Note', { multiline: true });
      var counterRef = root.collection('partner_requests').doc('count_' + day);
      await db.runTransaction(async function (tx) {
        var cnt = await tx.get(counterRef), n = cnt.exists ? (cnt.data().count || 0) : 0;
        if (n + rows.length > PARTNER_DAILY_CAP) throw A.httpError(429, 'At most ' + PARTNER_DAILY_CAP + ' sites a day can be sent to a partner from this workspace (' + n + ' sent today).');
        tx.set(counterRef, { count: n + rows.length, day: day, updatedAt: now }, { merge: true });
      });
      var sentP = [], host = String((req.headers && req.headers.host) || '').replace(/[^A-Za-z0-9.:-]/g, '');
      for (var pi2 = 0; pi2 < rows.length; pi2++) {
        var rp = rows[pi2], packet = partnerPacket(rp.id, rp.data, orgNmP, host), reqRef = root.collection('partner_requests').doc();
        var subject = '[' + orgNmP + '] ' + partner.name + ': ' + packet.title;
        var html = partnerMail(packet, partner, orgNmP, by, noteP);
        var sentMail;
        try { sentMail = await mail.send(rcpt.to.join(', '), subject, html, null, { replyTo: by, cc: by }); }
        catch (e) { throw A.httpError(502, 'The mail to ' + partner.name + ' could not be sent: ' + e.message); }
        var rec = { orgId: org, siteId: rp.id, partner: partner.key, partnerName: partner.name, to: rcpt.to, source: rcpt.source, by: by, at: now, note: noteP || null, status: sentMail && sentMail.skipped ? 'not-sent' : 'sent', packet: packet };
        var batchP2 = db.batch(), onSite = {}; onSite['partners.' + partner.key] = { sentAt: now, by: by, to: rcpt.to, status: rec.status, requestId: reqRef.id };
        batchP2.set(reqRef, rec); batchP2.update(rp.ref, Object.assign(onSite, { updatedAt: now, updatedBy: by }));
        batchP2.create(db.collection('omega_audit').doc(), { action: 'sitecrm-send-to-partner', orgId: org, siteId: rp.id, by: by, at: now, partner: partner.key, to: rcpt.to, requestId: reqRef.id, status: rec.status });
        await batchP2.commit();
        sentP.push({ siteId: rp.id, requestId: reqRef.id, status: rec.status });
      }
      var skipped = sentP.filter(function (x) { return x.status === 'not-sent'; }).length;
      return { ok: true, partner: { key: partner.key, name: partner.name }, to: rcpt.to, sent: sentP,
        note: skipped ? 'No mailbox is configured on this server, so nothing was mailed; the request is recorded for ' + skipped + ' site(s).' : sentP.length + ' site(s) sent to ' + partner.name + ' (' + rcpt.to.join(', ') + ') with you in copy.' };
    }

    /* ── pro forma on every selected site ───────────────────────────────── */
    if (action === 'proforma-bulk') {
      var ran = [], failed = [];
      for (var ri = 0; ri < rows.length; ri++) {
        try {
          var out = await runScenario(db, org, rows[ri], b, by, now);
          ran.push({ siteId: rows[ri].id, scenarioId: out.scenario.scenarioId, latestProforma: out.latestProforma });
        } catch (e) { failed.push({ siteId: rows[ri].id, name: rows[ri].data.name || '', error: e.message }); }
      }
      return { ok: true, ran: ran, failed: failed,
        note: ran.length + ' scenario(s) saved' + (failed.length ? '; ' + failed.length + ' site(s) could not be sized: ' + failed.slice(0, 3).map(function (f) { return (f.name || f.siteId) + ' (' + f.error + ')'; }).join('; ') : '') + '.' };
    }

    /* ── the compute model on every selected site: a year of hourly dispatch
       and a finance run each, so ten a call ─────────────────────────────── */
    if (action === 'site-model-bulk') {
      if (rows.length > MODEL_BULK_CAP) throw A.httpError(400, 'Run the compute model on at most ' + MODEL_BULK_CAP + ' sites at a time');
      await computeAccess(caller, org, root);
      var orgDocB = await root.get(), orgNameB = orgDocB.exists ? ((orgDocB.data() || {}).name || org) : org, ranM = [], failedM = [];
      for (var mi = 0; mi < rows.length; mi++) {
        try { var one = await runModel(db, org, rows[mi], b, by, now, orgNameB); ranM.push({ siteId: rows[mi].id, modelId: one.modelId, latestModel: one.summary }); }
        catch (e) { failedM.push({ siteId: rows[mi].id, name: rows[mi].data.name || '', error: e.message }); }
      }
      return { ok: true, ran: ranM, failed: failedM,
        note: ranM.length + ' compute model(s) run' + (failedM.length ? '; ' + failedM.length + ' site(s) could not be modelled: ' + failedM.slice(0, 3).map(function (f) { return (f.name || f.siteId) + ' (' + f.error + ')'; }).join('; ') : '') + '.' };
    }
  }

  /* ── contacts ───────────────────────────────────────────────────────── */
  if (action === 'contact-save') {
    var cinput = C.contactInput(b), cid2 = b.id ? C.recordId(b.id, 'Contact') : null, cref2 = cid2 ? contactsCol.doc(cid2) : contactsCol.doc();
    return db.runTransaction(async function (tx) {
      var all = await tx.get(contactsCol.where('archived', '==', false).limit(LIST_CAP + 1)), cur2 = cid2 ? await tx.get(cref2) : null;
      if (cid2 && !cur2.exists) throw A.httpError(404, 'That contact is not on this site');
      if (cid2 && (cur2.data() || {}).archived === true) throw A.httpError(409, 'That contact is archived');
      var live2 = all.docs.filter(function (d) { return (d.data() || {}).archived !== true; });
      if (!cid2 && live2.length >= LIST_CAP) throw A.httpError(409, 'This site has ' + LIST_CAP + ' contacts; archive some before adding more');
      if (cinput.email && live2.some(function (d) { return d.id !== cref2.id && String((d.data() || {}).email || '').toLowerCase() === cinput.email; })) throw A.httpError(409, cinput.email + ' is already a contact on this site');
      if (cinput.primary) live2.forEach(function (d) { if (d.id !== cref2.id && (d.data() || {}).primary === true) tx.update(d.ref, { primary: false, updatedAt: now, updatedBy: by }); });
      var doc2;
      if (cid2) { doc2 = Object.assign({}, cur2.data(), cinput, { updatedAt: now, updatedBy: by }); tx.update(cref2, Object.assign({}, cinput, { updatedAt: now, updatedBy: by })); }
      else { doc2 = Object.assign({ orgId: org, siteId: sid }, cinput, { archived: false, createdAt: now, createdBy: by }); tx.create(cref2, doc2); }
      audit(tx, db, 'sitecrm-contact-save', org, sid, by, now, { contactId: cref2.id, created: !cid2, contact: cinput });
      return { ok: true, id: cref2.id, contact: C.contactView(cref2.id, doc2), note: cid2 ? 'Contact saved.' : 'Contact added.' };
    });
  }
  if (action === 'contact-archive') {
    var aid = C.recordId(b.id, 'Contact'), aref = contactsCol.doc(aid);
    return db.runTransaction(async function (tx) {
      var s = await tx.get(aref);
      if (!s.exists) throw A.httpError(404, 'That contact is not on this site');
      if ((s.data() || {}).archived === true) return { ok: true, duplicate: true, note: 'Already archived.' };
      tx.update(aref, { archived: true, primary: false, archivedAt: now, archivedBy: by });
      audit(tx, db, 'sitecrm-contact-archive', org, sid, by, now, { contactId: aid, was: s.data() });
      return { ok: true, note: 'Contact archived. Logged activity with them keeps their name.' };
    });
  }

  /* ── activity ───────────────────────────────────────────────────────── */
  if (action === 'log') {
    var entry = C.activityInput(b, now), contactName = null;
    if (entry.contactId) {
      var cs = await contactsCol.doc(entry.contactId).get();
      if (!cs.exists) throw A.httpError(400, 'That contact is not on this site');
      if ((cs.data() || {}).archived === true) throw A.httpError(400, 'That contact is archived');
      contactName = (cs.data() || {}).name || (cs.data() || {}).email || null;
    }
    var lref = activityCol.doc();
    return db.runTransaction(async function (tx) {
      var rec = Object.assign({ orgId: org, siteId: sid }, entry, { contactName: contactName, by: by, loggedAt: now, done: false, doneAt: null, doneBy: null });
      delete rec.orderId;
      tx.create(lref, rec);
      if (C.isOpen(rec)) tx.create(followCol.doc(sid + '__' + lref.id), { orgId: org, siteId: sid, siteName: site.data.name || '', activityId: lref.id, type: entry.type, subject: entry.subject,
        followUpAt: entry.followUpAt, contactId: entry.contactId, contactName: contactName, by: by, at: entry.at, open: true, createdAt: now });
      audit(tx, db, 'sitecrm-log', org, sid, by, now, { activityId: lref.id, type: entry.type, subject: entry.subject, followUpAt: entry.followUpAt, contactId: entry.contactId });
      var names = {}; if (entry.contactId) names[entry.contactId] = contactName;
      return { ok: true, id: lref.id, activity: siteActivityView(lref.id, rec, names),
        note: C.TYPE_LABEL[entry.type] + ' logged' + (entry.followUpAt ? '; follow up ' + entry.followUpAt + ' is on Today.' : entry.type === 'task' ? '; it is on Today until done.' : '.') };
    });
  }
  if (action === 'done') {
    var did = C.recordId(b.id, 'Activity'), dref = activityCol.doc(did), iref = followCol.doc(sid + '__' + did);
    return db.runTransaction(async function (tx) {
      var s = await tx.get(dref), ix = await tx.get(iref);
      if (!s.exists) throw A.httpError(404, 'That entry is not on this site');
      var a = s.data() || {};
      if (!a.followUpAt && a.type !== 'task') throw A.httpError(400, 'Only a follow-up or a task can be marked done');
      if (a.done === true) return { ok: true, duplicate: true, note: 'Already done.' };
      tx.update(dref, { done: true, doneAt: now, doneBy: by });
      if (ix.exists) tx.update(iref, { open: false, doneAt: now, doneBy: by });
      audit(tx, db, 'sitecrm-done', org, sid, by, now, { activityId: did, followUpAt: a.followUpAt || null });
      return { ok: true, note: 'Done. It is off Today.' };
    });
  }

  /* ── documents ──────────────────────────────────────────────────────── */
  if (action === 'file-upload') {
    var file = C.fileInput(b.file), meta = { shared: C.bool(b.shared), category: C.category(b.category), note: C.text(b.note, 500, 'Note', { multiline: true }), by: by };
    var up = await store(db, org, site, file, meta);
    up.note = up.duplicate ? 'That document is already on the site.' : 'Uploaded. ' + (up.file.shared ? 'Shared.' : 'Only the workspace sees it until you share it.');
    return up;
  }
  if (action === 'file-share' || action === 'file-archive') {
    var fid = C.recordId(b.id, 'Document'), fref = filesCol.doc(fid), share = null;
    if (action === 'file-share') {
      if (b.shared === true || b.shared === 'true') share = true; else if (b.shared === false || b.shared === 'false') share = false;
      else throw A.httpError(400, 'Say whether to share it: shared true or false');
    }
    return db.runTransaction(async function (tx) {
      var s = await tx.get(fref), v = s.exists ? s.data() || {} : null;
      if (!v || v.uploadState !== 'stored') throw A.httpError(404, 'Document not found');
      if (action === 'file-archive') {
        if (v.archived === true) return { ok: true, duplicate: true, note: 'Already archived.' };
        tx.update(fref, { archived: true, archivedAt: now, archivedBy: by });
        audit(tx, db, 'sitecrm-file-archive', org, sid, by, now, { fileId: fid, name: v.name, wasShared: v.shared === true });
        return { ok: true, note: 'Archived. It is kept on record and is no longer listed.' };
      }
      if (v.archived === true) throw A.httpError(404, 'Document not found');
      if ((v.shared === true) === share) return { ok: true, duplicate: true, shared: share, note: share ? 'Already shared.' : 'Already workspace only.' };
      tx.update(fref, { shared: share, sharedAt: now, sharedBy: by });
      audit(tx, db, 'sitecrm-file-share', org, sid, by, now, { fileId: fid, name: v.name, shared: share });
      return { ok: true, shared: share, note: share ? 'Shared.' : 'No longer shared.' };
    });
  }

  /* ── pro forma ────────────────────────────────────────────────────────
     A run is immutable: it is stored under its scenarioId and never
     updated. A re-run is a new scenario. The math lives in
     api/_lib/proforma.js and is versioned (omega-compute-v1 default;
     evcs-compute-v1 stays available for the workbook case). */
  if (action === 'site-model') {
    await computeAccess(caller, org, root);
    var orgDoc1 = await root.get(), orgName1 = orgDoc1.exists ? ((orgDoc1.data() || {}).name || org) : org;
    var ranOne = await runModel(db, org, site, b, by, now, orgName1);
    return { ok: true, modelId: ranOne.modelId, latestModel: ranOne.summary, result: ranOne.result, basis: ranOne.basis,
      brand: DECK.brandOf(orgDoc1.exists ? orgDoc1.data() : null, org, PLATFORM),
      note: 'Compute model saved: ' + (ranOne.summary.title || ranOne.summary.pods + ' pod(s)') + '.' };
  }

  if (action === 'proforma-run') {
    var ran1 = await runScenario(db, org, site, b, by, now);
    return { ok: true, scenario: proformaView(ran1.scenario.scenarioId, ran1.scenario), latestProforma: ran1.latestProforma, note: 'Scenario saved. A re-run creates a new scenario; this one never changes.' };
  }

  throw A.httpError(400, 'Unknown site-CRM action');
});

/* One pro forma run on one site: sized from the site's power when asked,
   stored immutable under its scenarioId, and summarised onto the site as
   latestProforma \u2014 the figures the register, the side panel and the
   finance hand-off read without opening the scenario. */
async function runScenario(db, org, site, b, by, now) {
  var scen;
  try {
    var runInput = { pods: b.pods, discountRateAnnual: b.discountRateAnnual, overrides: b.overrides,
      label: b.label, assumptionVersion: b.assumptionVersion };
    /* THE DESIGN (2026-10-13): a site designed in Site Map runs on what was
       drawn and costed — the units placed and the Run's total — unless the
       caller sizes from power or names a pod count. fromDesign asks for it
       outright; useDesignCapex:false keeps the units but prices them on the
       assumption set. */
    var dsn = site.data && site.data.latestDesign, sizing = b.sizeFromPower === true || b.sizeFromPower === 'true';
    var fromDesign = b.fromDesign === true || (!sizing && !(Number(b.pods) > 0) && !!(dsn && dsn.compute && dsn.compute.units > 0));
    if (fromDesign) {
      if (!(dsn && dsn.compute && dsn.compute.units > 0)) throw A.httpError(400, 'No compute units on the Site Map design yet: place the pods or skids in Site Map, save, and come back.');
      runInput.pods = dsn.compute.units; sizing = false;
      var skids = dsn.compute.omegaCoreUnits > 0 ? dsn.compute.omegaCoreUnits : 0, plainPods = dsn.compute.units - skids;
      var ranCost = dsn.capex > 0 && dsn.capexSource === 'site-map' ? dsn.capex : 0, costRunLabel = 'Site Map cost run' + (dsn.capexAt ? ' of ' + String(dsn.capexAt).slice(0, 10) : '');
      if (b.useDesignCapex !== false && skids) {
        /* THE SKID'S PRICE (2026-10-13): an Omega-Core skid is ClearSky's, on
           its own meter, and the Site Map cost run never counts it
           (api/_lib/editor-cost.js), so its capital is the skid as recorded;
           the host's cost run stands only for the plain pods beside it. */
        runInput.capexTotal = skids * OC.PRODUCT.systemCostUsd + (plainPods > 0 ? ranCost : 0);
        runInput.capexBasis = skids + ' Omega-Core skid' + (skids === 1 ? '' : 's') + ' as recorded ($' + OC.PRODUCT.systemCostUsd.toLocaleString('en-US') + ' each)' + (plainPods > 0 && ranCost ? ' + ' + costRunLabel : '');
      } else if (b.useDesignCapex !== false && ranCost) { runInput.capexTotal = ranCost; runInput.capexBasis = costRunLabel; }
      runInput.designAt = dsn.at || null; runInput.designHash = dsn.hash || null;
    }
    if (sizing) {
      var avail = PF.deriveAvailableKw(site.data || {});
      if (avail.kw == null || !(avail.kw > 0))
        throw A.httpError(400, 'This site has no usable available power. Enter available MW \u2014 or service capacity and existing peak \u2014 on the Overview tab first.');
      runInput.sizeFromPowerKw = avail.kw;
      runInput.sizeBasis = avail.basis;
    }
    scen = PF.runProforma(runInput);
  } catch (e) { throw A.httpError(e.status || 400, e.message); }
  scen.orgId = org; scen.siteId = site.id; scen.createdBy = by;
  if (runInput.designAt || runInput.designHash) { scen.inputs = Object.assign({}, scen.inputs, { designAt: runInput.designAt, designHash: runInput.designHash }); }
  var sref = site.ref.collection('proforma').doc(scen.scenarioId), lp = latestOf(scen);
  await db.runTransaction(async function (tx) {
    tx.create(sref, scen);
    tx.update(site.ref, { latestProforma: lp, updatedAt: now, updatedBy: by });
    audit(tx, db, 'sitecrm-proforma-run', org, site.id, by, now, { scenarioId: scen.scenarioId, pods: scen.inputs.pods, assumptionVersion: scen.assumptionVersion });
  });
  return { scenario: scen, latestProforma: lp };
}
function latestOf(scen) {
  var r = scen.results || {};
  return { scenarioId: scen.scenarioId, pods: r.pods, itKw: r.itKw == null ? null : r.itKw, facilityKw: r.facilityKw == null ? null : r.facilityKw,
    investorIrrAnnual: r.investorIrr && r.investorIrr.defined ? r.investorIrr.annual : null,
    investorIrrDefined: !!(r.investorIrr && r.investorIrr.defined === true),
    projectIrrAnnual: r.projectIrr && r.projectIrr.defined ? r.projectIrr.annual : null,
    projectIrrDefined: !!(r.projectIrr && r.projectIrr.defined === true),
    npv: r.npv == null ? null : r.npv, discountRateAnnual: r.discountRateAnnual == null ? null : r.discountRateAnnual,
    paybackMonth: r.paybackMonth == null ? null : r.paybackMonth, investorCapital: r.investorCapital == null ? null : r.investorCapital,
    year1Revenue: r.year1Revenue == null ? null : r.year1Revenue, months: r.months || null,
    assumptionVersion: scen.assumptionVersion, label: scen.inputs && scen.inputs.label || '', at: scen.createdAt,
    capexBasis: r.capexBasis || null, designAt: scen.inputs && scen.inputs.designAt || null };
}

/* ── the design: what the linked Site Map project says, kept on the site ──
   Read off projects/{projectId} (api/_lib/portfolio/design-read.js) and
   written as latestDesign only when it changed (the hash), so an unchanged
   drawing never rewrites the record. A project of another workspace, or
   one that is gone, leaves what the site has. Never bumps updatedBy: this
   is the system reading, not a person editing. */
async function syncDesign(db, org, site, now) {
  var pid = site.data && site.data.projectId; if (!pid) return null;
  var ps = await db.collection('projects').doc(pid).get(), cur = site.data.latestDesign || null;
  if (!ps.exists) return cur;
  var p = ps.data() || {};
  if (String(p.orgId || '').toLowerCase() !== org) return cur;
  var d = DR.designOf(p, pid);
  if (!d) return cur;
  if (cur && cur.hash === d.hash) return cur;
  d.syncedAt = now;
  await site.ref.update({ latestDesign: d });
  site.data.latestDesign = d;
  return d;
}
/* ── THE MODEL FOLLOWS THE DESIGN (2026-10-13) ─────────────────────────────
   Tommy: "all the data based on the site zipcode, the map that we made,
   those details should auto input into the compute site pro forma and that
   should produce an accurate IRR; I don't want to have to open up the site
   and input the details … as much as actually possible is done for the
   user from the drawing and our tools". After the design is read, the
   compute model runs on it BY ITSELF: once per design (its hash) and per
   change of the site's facts, when the record maps (api/_lib/site-model.js:
   the ZIP read off the address; an Omega-Core skid on its own meter needs
   nothing more) and the workspace holds Omega Compute (the model's own
   gate; a workspace without it is simply not modelled: no error, no
   record). What stopped it is kept on the site as designModel (the facts
   missing, or the engine's refusal) so the page can say so and the same
   open does not try again; a changed fact or a changed design does. The
   run is the system reading the design, recorded as such (auto: true)
   under the person whose open or sync set it off. */
async function designModel(db, org, site, ctx, now) {
  var d = site.data && site.data.latestDesign; if (!d || !d.hash) return null;
  var lm = site.data.latestModel, dm = site.data.designModel, factsAt = C.iso(site.data.updatedAt) || null;
  if (lm && lm.designHash === d.hash) return null;
  if (dm && dm.hash === d.hash && dm.factsAt === factsAt) return { skipped: dm.missing ? 'missing' : dm.error ? 'error' : 'done', missing: dm.missing || null, error: dm.error || null, repeat: true };
  try { await computeAccess(ctx.caller, org, ctx.root); } catch (e) { return { skipped: 'no-access' }; }
  var orgDoc = await ctx.root.get(), orgName = orgDoc.exists ? ((orgDoc.data() || {}).name || org) : org;
  var mapped = SM.inputFor(site.data || {}, {}, { orgName: orgName }), rec;
  if (!mapped.ok) {
    rec = { hash: d.hash, factsAt: factsAt, at: now, missing: mapped.missing };
    await site.ref.update({ designModel: rec }); site.data.designModel = rec;
    return { skipped: 'missing', missing: mapped.missing };
  }
  try {
    var ran = await runModel(db, org, site, { label: 'Site Map design', auto: true }, ctx.by, now, orgName);
    rec = { hash: d.hash, factsAt: factsAt, at: now, modelId: ran.modelId };
    await site.ref.update({ designModel: rec }); site.data.designModel = rec;
    return { ran: ran };
  } catch (e) {
    rec = { hash: d.hash, factsAt: factsAt, at: now, error: String(e && e.message || e).slice(0, 300) };
    await site.ref.update({ designModel: rec }); site.data.designModel = rec;
    return { skipped: 'error', error: rec.error };
  }
}
function proformaLine(lp) {
  var irr = lp.investorIrrDefined && lp.investorIrrAnnual != null ? (lp.investorIrrAnnual * 100).toFixed(2) + '%' : 'not defined';
  return lp.pods + ' pod(s), ' + (lp.itKw != null ? lp.itKw + ' kW IT, ' : '') + 'investor capital $' + Math.round(lp.investorCapital).toLocaleString('en-US') +
    ', investor IRR ' + irr + (lp.paybackMonth != null ? ', capital recovered month ' + lp.paybackMonth : '') + ' (' + lp.assumptionVersion + ', screening, not a return promise).';
}
/* The Compute Site Pro Forma's own gate, on the Admin SDK's reads: a
   packaged workspace needs Omega Compute (package-access), a legacy one the
   tool's tier and allowlists (compute-proforma's refusal); staff pass. */
async function computeAccess(caller, org, root) {
  if (caller.staff) return;
  var got = await Promise.all([root.get(), root.collection('billing').doc('current').get(), root.collection('members').doc(caller.uid).get()]);
  var orgDoc = got[0].exists ? got[0].data() : null, billing = got[1].exists ? got[1].data() : null, member = got[2].exists ? got[2].data() : null;
  var projection;
  try { projection = PA.project(caller, billing, orgDoc, member, Date.now()); PA.requireModule(projection, CP._gate.MODULE, { tools: [CP._gate.TOOL_KEY] }); }
  catch (e) { throw A.httpError(e.status || 403, e.message); }
  var why = projection.packaged ? null : CP._gate.refusal(billing || {}, member);
  if (why) throw A.httpError(403, why);
}
/* One compute model on one site: the record mapped to the model's input
   (api/_lib/site-model.js), the ONE finance engine's answer stored whole
   under models/{id} and summarised onto the site as latestModel. A ZIP or
   host type given with the run is kept on the site, as facts. */
async function runModel(db, org, site, b, by, now, orgName) {
  var over = { pods: b.pods, gpuClass: b.gpuClass, structure: b.structure, zip: b.zip, hostType: b.hostType, useDesign: b.useDesign === false ? false : undefined };
  var mapped = SM.inputFor(site.data || {}, over, { orgName: orgName });
  if (!mapped.ok) throw A.httpError(400, 'The compute model needs ' + mapped.missing.join('; ') + '.');
  var result;
  try { result = CS.model(mapped.input); } catch (e) { throw A.httpError(500, 'The compute model could not run: ' + e.message); }
  if (!result || result.ok === false) throw A.httpError(400, 'The compute model refused the site: ' + (result && result.errors || []).map(function (x) { return x.message; }).join(' '));
  var label = C.text(b.label, 120, 'Label'), mref = site.ref.collection('models').doc(C.newId('m_'));
  /* the design this run stands on (its hash), so the automatic run knows a
     design it has already modelled; auto marks the system's own run */
  var dsnM = over.useDesign !== false && site.data && site.data.latestDesign && mapped.basis && mapped.basis.design ? site.data.latestDesign : null;
  var summary = SM.summaryOf(result, mapped.input, { modelId: mref.id, at: now, by: by, label: label, designHash: dsnM ? dsnM.hash : null, auto: b.auto === true });
  var facts = { latestModel: summary, updatedAt: now, updatedBy: by };
  if (over.zip && optZip(over.zip)) facts.zip = optZip(over.zip);
  /* a ZIP the run read off the address is kept as the site's, so nobody types what the address already said */
  else if (!(site.data && site.data.zip) && mapped.input.site && /^\d{5}$/.test(String(mapped.input.site.zip || ''))) facts.zip = mapped.input.site.zip;
  if (over.hostType && SM.HOST_TYPES.indexOf(over.hostType) >= 0) facts.hostType = over.hostType;
  /* the register's versioned result (site_results, kind finance, scenario sc_compute): what a finance package snapshots and what a later bill, map, agreement or power change marks stale */
  var resRef = db.collection('omega_orgs').doc(org).collection('site_results').doc('res_compute_' + site.id), prevRes = await resRef.get();
  var resRec = { id: resRef.id, siteId: site.id, kind: 'finance', scenarioId: 'sc_compute', modelId: mref.id, version: prevRes.exists ? ((prevRes.data() || {}).version || 1) + 1 : 1, status: 'current', model: 'Compute Site Pro Forma (' + (result.version || '') + ')', engineVersion: summary.financeVersion || null,
    projectIrr: summary.preTaxIrr == null ? null : { status: 'ok', annualized: summary.preTaxIrr }, investorIrr: summary.irr == null ? { status: 'not-defined', reason: 'No capital invested under this structure' } : { status: 'ok', annualized: summary.irr }, paybackMonths: summary.paybackYears == null ? null : Math.round(summary.paybackYears * 12),
    capital: summary.totalProjectCost, inputHash: require('crypto').createHash('sha256').update(JSON.stringify([mapped.input, site.data && site.data.revision])).digest('hex'), at: now, by: by };
  await db.runTransaction(async function (tx) {
    tx.create(mref, { orgId: org, siteId: site.id, input: mapped.input, basis: mapped.basis, result: result, summary: summary, label: label, createdAt: now, createdBy: by });
    tx.set(resRef, resRec);
    tx.update(site.ref, facts);
    audit(tx, db, 'sitecrm-site-model', org, site.id, by, now, { modelId: mref.id, pods: summary.pods, structure: summary.structure, irr: summary.irr, totalProjectCost: summary.totalProjectCost, auto: b.auto === true, designHash: summary.designHash });
  });
  /* the record in hand follows the write, so a page answered in the same request sees the run */
  if (site.data) Object.keys(facts).forEach(function (k) { site.data[k] = facts[k]; });
  return { modelId: mref.id, summary: summary, result: result, basis: mapped.basis };
}
function modelLine(lm) {
  var irr = lm.irr == null ? 'n/a (no capital invested)' : (lm.irr * 100).toFixed(2) + '%';
  function usd(n) { return '$' + Math.round(n || 0).toLocaleString('en-US'); }
  return (lm.title || lm.pods + ' pod(s)') + ': ' + (lm.structureLabel || lm.structure) + ', total project cost ' + usd(lm.totalProjectCost) +
    ' (equity ' + usd(lm.equity) + (lm.debt > 0 ? ', debt ' + usd(lm.debt) : '') + '), after-tax IRR ' + irr +
    ' over ' + (lm.termYears || 10) + ' years' + (lm.verdict && lm.verdict.label ? '; ' + lm.verdict.label : '') + ' (Compute Site Pro Forma, screening, not a return promise).';
}
/* What the finance marketplace says of each site's capital request, read
   LIVE off its deal: sent, open with offers, or funded (awarded). The
   site's own finProjectStatus is only the state at sending. */
async function capitalJoin(db, sites) {
  var withDeal = sites.filter(function (s) { return s.finProjectId; });
  if (!withDeal.length) return sites;
  var docs = await Promise.all(withDeal.map(function (s) { return db.collection('fin_projects').doc(s.finProjectId).get(); }));
  withDeal.forEach(function (s, i) {
    var d = docs[i].exists ? docs[i].data() || {} : null;
    if (!d) { s.capital = { status: 'missing', funded: false, note: 'The deal is no longer on the marketplace.' }; return; }
    var funded = d.status === 'awarded' || !!d.awardedTo;
    s.capital = { status: d.status || null, funded: funded, offerCount: Number(d.offerCount) || 0, ask: d.ask == null ? null : Number(d.ask),
      awardedTo: d.awardedTo || null, awardedToOrg: d.awardedToOrg || null, awardedAt: C.iso(d.awardedAt), request: d.capitalRequest || null, dealId: s.finProjectId, updatedAt: C.iso(d.updatedAt) };
  });
  return sites;
}
function optZip(v) {
  if (v === undefined || v === null || v === '') return null;
  var z = String(v).trim();
  if (!/^\d{5}(-\d{4})?$/.test(z)) throw C.fail(400, 'ZIP must be a five-digit US ZIP code');
  return z.slice(0, 5);
}
function optEnum(v, list, label) {
  if (v === undefined || v === null || v === '') return null;
  if (list.indexOf(v) < 0) throw C.fail(400, label + ' must be one of ' + list.join(', '));
  return v;
}
/* What a partner receives of a site: the facts on record, the figures the
   workspace has produced (read, never recomputed) and where to open the
   record. No bills, no contacts, no documents: those are shared by hand. */
function partnerPacket(siteId, s, orgName, host) {
  var lm = s.latestModel || null, lp = s.latestProforma || null, cap = s.capital || null, av = SM.serviceOf(s), base = host ? 'https://' + host : '';
  function n(v) { return v == null || v === '' ? null : Number(v); }
  return {
    title: (s.name || 'Site') + (s.city ? ', ' + s.city + (s.state ? ', ' + s.state : '') : ''),
    site: { id: siteId, name: s.name || '', address: BR.addressLine(s), city: s.city || null, state: s.state || null, zip: s.zip || null, hostType: s.hostType || null, status: s.status || null, tags: s.tags || [] },
    power: { installedChargerKw: n(s.installedKw), reportedPeakKw: n(s.reportedPeakKw), peakUnresolved: s.peakUnresolved === true, serviceCapacityKw: n(s.serviceCapacityKw), existingPeakKw: n(s.existingPeakKw), availablePowerMw: n(s.availablePowerMw), serviceBasis: av ? av.basis : null, powerPricePerKwh: n(s.powerPricePerKwh), annualUsageKwh: n(s.annualUsageKwh), meterOwned: s.meterOwned == null ? null : s.meterOwned === true, termYearsRemaining: n(s.termYearsRemaining), evidence: s.powerEvidence && s.powerEvidence.classification ? s.powerEvidence.classification.level : null, verifiedHeadroomKw: s.powerEvidence && s.powerEvidence.verifiedKw != null ? s.powerEvidence.verifiedKw : null },
    compute: lm ? { pods: lm.pods, gpu: lm.gpuName, structure: lm.structureLabel, irr: lm.irr, totalProjectCost: lm.totalProjectCost, equity: lm.equity, verdict: lm.verdict && lm.verdict.label, at: lm.at } : null,
    pods: lp ? { pods: lp.pods, investorIrr: lp.investorIrrDefined ? lp.investorIrrAnnual : null, investorCapital: lp.investorCapital, at: lp.at } : null,
    capital: cap ? { status: cap.status, funded: cap.funded, ask: cap.ask, awardedToOrg: cap.awardedToOrg || null } : null,
    links: { record: base + '/site-crm.html?site=' + encodeURIComponent(siteId), deck: lm ? base + '/site-crm.html?site=' + encodeURIComponent(siteId) + '#deck' : null, editor: s.projectId ? base + '/editor.html?id=' + encodeURIComponent(s.projectId) : null },
    workspace: orgName
  };
}
function partnerMail(p, partner, orgName, by, note) {
  var E = mail.esc, R = mail.row || function (k, v) { return '<tr><td style="padding:4px 12px 4px 0;color:#6B7C8C">' + E(k) + '</td><td style="padding:4px 0"><b>' + E(v == null || v === '' ? '\u2014' : v) + '</b></td></tr>'; };
  function kw(v) { return v == null ? 'Not provided' : Number(v).toLocaleString('en-US') + ' kW'; }
  function usd(v) { return v == null ? 'Not provided' : '$' + Math.round(v).toLocaleString('en-US'); }
  function pct(v) { return v == null ? 'n/a' : (v * 100).toFixed(2) + '%'; }
  var pw = p.power, h = '<p>' + E(orgName) + ' is sending you <b>' + E(p.title) + '</b> for ' + E(partner.asks) + '.' + (note ? '</p><p>' + E(note).replace(/\n/g, '<br>') : '') + '</p>';
  h += '<h3 style="margin:16px 0 6px">The site</h3><table>' + R('Address', [p.site.address, p.site.city, p.site.state, p.site.zip].filter(Boolean).join(', ')) + R('Host type', p.site.hostType) + R('Installed chargers (nameplate)', kw(pw.installedChargerKw)) + R('Reported peak' + (pw.peakUnresolved ? ' (unresolved statistic)' : ''), kw(pw.reportedPeakKw)) + R('Service capacity', kw(pw.serviceCapacityKw)) + R('Existing peak', kw(pw.existingPeakKw)) + R('Available for new load', pw.availablePowerMw == null ? (pw.serviceBasis || 'Not provided') : (pw.availablePowerMw * 1000).toLocaleString('en-US') + ' kW (as entered)') + R('Verified headroom', pw.verifiedHeadroomKw == null ? 'None yet (' + (pw.evidence || 'no power evidence') + ')' : kw(pw.verifiedHeadroomKw)) + R('Power price', pw.powerPricePerKwh == null ? 'Not provided' : '$' + pw.powerPricePerKwh + '/kWh') + R('Annual usage', pw.annualUsageKwh == null ? 'Not provided' : pw.annualUsageKwh.toLocaleString('en-US') + ' kWh') + R('Meter', pw.meterOwned === true ? 'Owned by the host' : pw.meterOwned === false ? 'Not owned by the host' : 'Unknown') + R('Remaining term', pw.termYearsRemaining == null ? 'Not provided' : pw.termYearsRemaining + ' years (snapshot)') + '</table>';
  if (p.compute) h += '<h3 style="margin:16px 0 6px">The compute case on file</h3><table>' + R('Pods', p.compute.pods + ' \u00d7 ' + (p.compute.gpu || '')) + R('Structure', p.compute.structure) + R('After-tax IRR', pct(p.compute.irr)) + R('Total project cost', usd(p.compute.totalProjectCost)) + R('Verdict', p.compute.verdict) + '</table><p style="color:#6B7C8C;font-size:12px">Screening results from the Compute Site Pro Forma; not a return promise.</p>';
  if (p.capital) h += '<p>Capital request on the finance marketplace: <b>' + E(p.capital.funded ? 'Funded by ' + (p.capital.awardedToOrg || 'a capital partner') : p.capital.status || 'sent') + '</b>' + (p.capital.ask != null ? ' \u00b7 ask ' + usd(p.capital.ask) : '') + '.</p>';
  h += '<p><a href="' + E(p.links.record) + '">Open the site record</a>' + (p.links.deck ? ' \u00b7 <a href="' + E(p.links.deck) + '">Investor deck</a>' : '') + (p.links.editor ? ' \u00b7 <a href="' + E(p.links.editor) + '">Site Map</a>' : '') + '</p>';
  h += '<p style="color:#6B7C8C;font-size:12px">' + E(partner.funds) + ' Reply to ' + E(by) + '. Figures marked Not provided are not on the record; nothing here is invented.</p>';
  return typeof mail.layout === 'function' ? mail.layout(partner.name + ': ' + p.title, h) : h;
}
function ownerOf(caller, by) { return (caller.claims && (caller.claims.name || caller.claims.displayName)) || String(by || '').split('@')[0]; }
function tagList(v) {
  if (v == null || v === '') return [];
  var arr = Array.isArray(v) ? v : String(v).split(',');
  return arr.map(function (t) { return C.text(t, 40, 'Tag'); }).filter(Boolean).filter(function (t, i, a) { return a.indexOf(t) === i; }).slice(0, 20);
}
/* What a portfolio site contains, in omega-newproject.js's scope keys: the
   chargers it has (Level 2 unless a DC fast-charging tag or a large
   nameplate says otherwise), and compute when it has been screened or
   sized for pods. The editor opens the build those scopes select. */
function siteScopes(s) {
  /* declared on the record wins; the derivation below is for a site that
     was registered before the picker existed */
  if (Array.isArray(s.siteScopes) && s.siteScopes.length) return s.siteScopes.slice();
  var tags = (Array.isArray(s.tags) ? s.tags : []).map(function (t) { return String(t).toLowerCase(); });
  var scopes = [];
  if (tags.indexOf('dcfc') >= 0 || (Number(s.installedKw) >= 150 && tags.indexOf('l2') < 0)) scopes.push('dcfc'); else scopes.push('l2');
  var pods = s.latestProforma && s.latestProforma.pods, screened = s.screening && s.screening.pods;
  if ((pods != null && pods > 0) || (screened != null && screened > 0) || tags.indexOf('compute') >= 0) scopes.push('compute');
  if (tags.indexOf('bess') >= 0 || tags.indexOf('storage') >= 0) scopes.push('bess');
  return scopes;
}

function siteActivityView(id, a, names) {
  names = names || {};
  return { id: id, type: a.type, subject: a.subject || '', body: a.body || '', at: C.iso(a.at), followUpAt: a.followUpAt || null,
    contactId: a.contactId || null, contactName: a.contactId ? names[a.contactId] || a.contactName || null : null,
    by: a.by || null, loggedAt: C.iso(a.loggedAt), done: a.done === true, doneAt: C.iso(a.doneAt), doneBy: a.doneBy || null,
    open: C.isOpen(a) };
}
function siteFollowUpView(d, siteName, names) {
  names = names || {};
  return { id: d.activityId, activityId: d.activityId, siteId: d.siteId, siteName: siteName != null ? siteName : d.siteName || '',
    type: d.type, subject: d.subject || '', followUpAt: d.followUpAt || null, contactId: d.contactId || null,
    contactName: d.contactId ? names[d.contactId] || d.contactName || null : null, by: d.by || null, at: C.iso(d.at) };
}
/* The scenario as the page reads it: full monthly cash flows plus results.
   Cash-flow rows are rounded for transport; the stored record keeps full
   precision. */
function proformaView(id, s) {
  s = s || {};
  var r2 = function (n) { return Math.round(Number(n) * 100) / 100; };
  return {
    scenarioId: s.scenarioId || id, siteId: s.siteId || null,
    assumptionVersion: s.assumptionVersion || null, label: s.inputs && s.inputs.label || '',
    inputs: s.inputs || null, inputsHash: s.inputsHash || null,
    results: s.results || null,
    cashFlows: (s.cashFlows || []).map(function (f) {
      return { month: f.month, revenue: r2(f.revenue), powerCost: r2(f.powerCost), otherCost: r2(f.otherCost),
        spvCash: r2(f.spvCash), investorCash: r2(f.investorCash), newCoCash: r2(f.newCoCash),
        unrecovered: r2(f.unrecovered), cumulativeInvestor: r2(f.cumulativeInvestor), powerSpread: r2(f.powerSpread) };
    }),
    createdAt: C.iso(s.createdAt), createdBy: s.createdBy || null
  };
}

/* ONE DOOR. The portfolio register (api/_lib/portfolio/register.js: imports
   with diff, conflicts and undo; facts with provenance; views; power
   evidence; bills; scenarios; packages and the one private submission;
   the pipeline; the widget) answers the requests it owns, on the same
   collection; everything else is the site CRM's. */
module.exports = function (req, res) { return REG.owns(req) ? REG(req, res) : handler(req, res); };
module.exports.handler = handler;
module.exports.register = REG;
module.exports.store = store;
module.exports.stream = stream;
module.exports.siteInput = siteInput;
module.exports.siteView = siteView;

