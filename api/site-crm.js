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
var I = require('./_lib/po-intake');

var EDITORS = ['owner', 'admin', 'member'], ADMINS = ['owner', 'admin'];
var LIST_CAP = 200, FOLLOW_SCAN = 2000, FOLLOW_CAP = 200, SCAN = 500;
var PROFORMA_CAP = 25;

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
    status: C.text(b.status, 60, 'Status'),
    notes: C.text(b.notes, 4000, 'Notes', { multiline: true }),
    externalSiteIds: ids,
    tags: tags
  };
}
function siteView(id, s) {
  s = s || {};
  return {
    id: id, name: s.name || '', city: s.city || '', state: s.state || '', address: s.address || '',
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
    externalSiteIds: s.externalSiteIds || {}, tags: s.tags || [],
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
    await access(caller, org, 'read');
    var q = root.collection('sites').orderBy('__name__').limit(LIST_CAP + 1);
    if (b.startAfter) q = root.collection('sites').orderBy('__name__').startAfter(b.startAfter).limit(LIST_CAP + 1);
    var snap = await q.get();
    var sites = snap.docs.slice(0, LIST_CAP).map(function (d) { return siteView(d.id, d.data()); });
    return { org: org, sites: sites,
      next: snap.docs.length > LIST_CAP ? snap.docs[LIST_CAP - 1].id : null,
      limited: snap.docs.length > LIST_CAP };
  }

  var action = String(b.action || 'read');
  var adminOnly = action === 'file-archive' || action === 'contact-archive';
  var who = await access(caller, org, adminOnly ? 'admin' : req.method === 'POST' ? 'write' : 'read');
  if (!b.site && action !== 'site-save' && action !== 'site-import') throw A.httpError(400, 'Which site?');
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
    return {
      site: siteView(sid, site.data),
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
    var input = siteInput(b), id = b.id ? C.recordId(b.id, 'Site') : null, cref = id ? root.collection('sites').doc(id) : root.collection('sites').doc();
    return db.runTransaction(async function (tx) {
      var cur = id ? await tx.get(cref) : null;
      if (id && !cur.exists) throw A.httpError(404, 'That site is not in this workspace');
      var doc;
      if (id) { doc = Object.assign({}, cur.data(), input, { updatedAt: now, updatedBy: by }); tx.update(cref, Object.assign({}, input, { updatedAt: now, updatedBy: by })); }
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
      try { prepared.push(siteInput(r || {})); }
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
  if (action === 'proforma-run') {
    var scen;
    try {
      var runInput = { pods: b.pods, discountRateAnnual: b.discountRateAnnual, overrides: b.overrides,
        label: b.label, assumptionVersion: b.assumptionVersion };
      if (b.sizeFromPower === true || b.sizeFromPower === 'true') {
        var avail = PF.deriveAvailableKw(site.data || {});
        if (avail.kw == null || !(avail.kw > 0))
          throw A.httpError(400, 'This site has no usable available power. Enter available MW \u2014 or service capacity and existing peak \u2014 on the Overview tab first.');
        runInput.sizeFromPowerKw = avail.kw;
        runInput.sizeBasis = avail.basis;
      }
      scen = PF.runProforma(runInput);
    } catch (e) { throw A.httpError(e.status || 400, e.message); }
    scen.orgId = org; scen.siteId = sid; scen.createdBy = by;
    var sref = proformaCol.doc(scen.scenarioId);
    await db.runTransaction(async function (tx) {
      tx.create(sref, scen);
      audit(tx, db, 'sitecrm-proforma-run', org, sid, by, now, { scenarioId: scen.scenarioId, pods: scen.inputs.pods, assumptionVersion: scen.assumptionVersion });
    });
    return { ok: true, scenario: proformaView(scen.scenarioId, scen), note: 'Scenario saved. A re-run creates a new scenario; this one never changes.' };
  }

  throw A.httpError(400, 'Unknown site-CRM action');
});

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

module.exports = handler;
module.exports.store = store;
module.exports.stream = stream;
module.exports.siteInput = siteInput;
module.exports.siteView = siteView;

