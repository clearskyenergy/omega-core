/* ═══════════════════════════════════════════════════════════════════════════
   api/crm.js — the supplier's CRM: one customer ACCOUNT, and what the office
   keeps about it
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   GET  /api/crm?org=&customerId=             { customerId, company, contacts[],
                                                activity[], followUps[], files[],
                                                timeline[] }
   GET  /api/crm?org=&customerId=&file=<id>   the document, as an attachment
   GET  /api/crm?org=&followUps=1             open follow-ups across every
                                              account (the Today hub)
   POST /api/crm { org, customerId, action, … }
     contact-save    { id?, name, title, email, phone, notes, primary }
     contact-archive { id }                               workspace admin
     log             { type, subject, body, at?, contactId?, orderId?, followUpAt? }
     done            { id }                               a follow-up completed
     file-upload     { file: { name, base64 }, category, note, shared }
     file-share      { id, shared }
     file-archive    { id }                               workspace admin

   docs/OMEGA-LOGIC-ECOSYSTEM.md is the contract. Who: a member of the
   workspace (logic-access authorize) reads, and one whose role may edit
   (owner, admin, member — not viewer) logs, uploads and keeps contacts;
   archiving is an administrator's. ClearSky's owner may open a workspace
   that is not switched on yet, while commissioning it, as api/buyers.js
   allows.

   Where: omega_orgs/{org}/customers/{id}/contacts|activity|files, the
   follow-up index omega_orgs/{org}/crm_followups and the customer's daily
   upload count omega_orgs/{org}/crm_upload_usage/{customerId__day} — all
   Admin SDK only in the rules. The count is NOT a field on the customer
   record: a tenant admin may update that record from a browser, and could
   then reset their customer's allowance. A document's bytes are in PRIVATE Storage at
   crm/{org}/{customerId}/{fileId}, never behind a URL: the path is not in
   any response, and the bytes come back only through this endpoint (or
   api/my-files.js for the customer), as an attachment with nosniff.

   Nothing is deleted: a contact or a document is archived, a follow-up is
   done. Every write lands in omega_audit (action crm-*).
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var A = require('./_lib/admin'), X = require('./_lib/logic-access'), B = require('./_lib/buyer-accounts'), C = require('./_lib/crm'), I = require('./_lib/po-intake');

var EDITORS = ['owner', 'admin', 'member'], ADMINS = ['owner', 'admin'];
var LIST_CAP = 200, FOLLOW_SCAN = 2000, FOLLOW_CAP = 200, SCAN = 500, UNIT_ORDERS = 100;
/* The design tool's history on one account: every row is read (a monthly
   subscriber writes about fifteen a year) and the newest EDITOR_SHOWN of
   each kind go to the timeline. */
var EDITOR_SCAN = 500, EDITOR_SHOWN = 50;

/* level: 'read' | 'write' | 'admin'. authorize() already refuses a lapsed
   subscription to everyone but ClearSky's owner; the role decides the rest. */
async function access(caller, org, level) {
  var ctx = await X.authorize(caller, org, level === 'admin');
  if (X.owner(caller)) return { ctx: ctx, edit: true, admin: true };
  if (!X.subscribed(ctx)) throw A.httpError(403, 'Omega Logic subscription is not active');
  var m = await A.db().collection('omega_orgs').doc(ctx.orgId).collection('members').doc(caller.uid).get(), role = m.exists ? (m.data() || {}).role : '';
  var who = { ctx: ctx, edit: EDITORS.indexOf(role) >= 0, admin: ADMINS.indexOf(role) >= 0 };
  if (level === 'write' && !who.edit) throw A.httpError(403, 'Your role in this workspace can read the CRM but not change it');
  return who;
}
function audit(tx, db, action, org, customerId, by, at, extra) {
  tx.create(db.collection('omega_audit').doc(), Object.assign({ action: action, orgId: org, customerId: customerId, by: by, at: at }, extra || {}));
}

/* ── documents: the one writer and the one reader of the bytes ──────────
   Shared with api/my-files.js (the customer's side), so both doors store
   and serve a document the same way.

   store(db, org, account, file, meta)
     account  { id, data, ref }            the customer account
     file     C.fileInput(...)             bytes already decided
     meta     { from: 'office'|'customer', shared, category, note, by,
                customerEmail?, dailyLimit?, audience }
   Reserve the record, then write the bytes, then mark it stored and audit
   it in one write — so a failed write leaves a record that says so (and
   that no list shows), not bytes nobody can find, and the audit never says
   "uploaded" for bytes that are not there. The same bytes and name
   uploaded again from the same side (a retry on a phone) return the stored
   document instead of a second copy, and do not spend the allowance. A
   customer's person and account are re-checked inside the transaction, and
   the daily allowance is counted there (a failed store still spends it:
   the allowance bounds attempts, not successes). */
async function store(db, org, account, file, meta) {
  var files = account.ref.collection('files'), ref = files.doc(C.newId('f_')), path = 'crm/' + org + '/' + account.id + '/' + ref.id;
  var now = new Date().toISOString(), customer = meta.from === 'customer';
  var usageRef = meta.dailyLimit ? db.collection('omega_orgs').doc(org).collection('crm_upload_usage').doc(account.id + '__' + now.slice(0, 10)) : null;
  var reserved = await db.runTransaction(async function (tx) {
    var fresh = await tx.get(account.ref), same = await tx.get(files.where('sha256', '==', file.sha256).limit(10));
    var person = customer ? await tx.get(account.ref.collection('users').doc(meta.customerEmail)) : null;
    var usage = usageRef ? await tx.get(usageRef) : null;
    if (!fresh.exists) throw A.httpError(404, 'Customer not found');
    var acct = fresh.data() || {};
    if (customer) {
      if (['disabled', 'suspended', 'cancelled'].indexOf(acct.status) >= 0 || !person.exists || ['disabled', 'suspended', 'pending'].indexOf((person.data() || {}).status) >= 0) throw A.httpError(403, 'Customer access is disabled. Contact your supplier.');
    }
    var dup = same.docs.filter(function (d) { var v = d.data() || {}; return v.uploadState === 'stored' && v.archived !== true && (v.from === 'customer') === customer && v.name === file.name; })[0];
    if (dup) return { duplicate: true, id: dup.id, record: dup.data() };
    if (usageRef) {
      var count = usage.exists ? Number((usage.data() || {}).count) || 0 : 0;
      if (count >= meta.dailyLimit) throw A.httpError(429, 'Your account has uploaded ' + meta.dailyLimit + ' documents today. Please send the rest tomorrow.');
      if (usage.exists) tx.update(usageRef, { count: count + 1, lastAt: now });
      else tx.create(usageRef, { orgId: org, customerId: account.id, day: now.slice(0, 10), count: 1, lastAt: now });
    }
    var record = { orgId: org, customerId: account.id, name: file.name, type: file.type, size: file.size, sha256: file.sha256, path: path,
      category: meta.category, note: meta.note, shared: customer ? true : meta.shared === true, from: customer ? 'customer' : 'office',
      uploadedBy: meta.by, uploadedAt: now, archived: false, uploadState: 'pending' };
    tx.create(ref, record);
    return { duplicate: false, id: ref.id, record: record };
  });
  if (reserved.duplicate) return { ok: true, duplicate: true, id: reserved.id, file: C.fileView(reserved.id, reserved.record, meta.audience) };
  try {
    await I.bucket().file(path).save(file.bytes, { resumable: false, contentType: 'application/octet-stream', metadata: { cacheControl: 'private, no-store', contentDisposition: 'attachment' } });
  } catch (e) {
    console.error('[crm store]', e);
    try { await ref.update({ uploadState: 'failed', failedAt: new Date().toISOString() }); } catch (x) { console.error('[crm store mark]', x); }
    throw A.httpError(502, 'The document could not be stored. Nothing was saved; please try again.');
  }
  var stored = new Date().toISOString(), r = reserved.record;
  await db.runTransaction(async function (tx) {
    tx.update(ref, { uploadState: 'stored', storedAt: stored });
    audit(tx, db, 'crm-file-upload', org, account.id, meta.by, stored, { fileId: ref.id, name: r.name, type: r.type, size: r.size, sha256: r.sha256, from: r.from, shared: r.shared, category: r.category });
  });
  reserved.record.uploadState = 'stored';
  return { ok: true, duplicate: false, id: ref.id, file: C.fileView(ref.id, reserved.record, meta.audience) };
}
/* The bytes of a stored document, to whoever the caller already checked.
   A record whose path is not under its own account is refused rather than
   followed: the path is never taken from a request, but it is the one field
   that could point this door at somebody else's document. */
async function stream(res, org, customerId, f) {
  if (!f || f.uploadState !== 'stored' || String(f.path || '').indexOf('crm/' + org + '/' + customerId + '/') !== 0) throw A.httpError(404, 'Document not found');
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
  var db = A.db(), root = db.collection('omega_orgs').doc(org), by = caller.email, now = new Date().toISOString();

  /* ── Today: every open follow-up in the workspace ─────────────────────
     The index, not a collectionGroup query (see api/_lib/crm.js). Earliest
     due first; each carries the account's CURRENT name.
     Earliest first is decided HERE, over every open follow-up: a query with
     no orderBy comes back in document-id order (customerId__activityId), so
     a short read keeps whichever ACCOUNTS sort first, not what is due first.
     The read is all of them up to FOLLOW_SCAN (a closed one is open:false
     and never read) and needs no composite index; past it, `limited` says
     so. */
  if (req.method === 'GET' && (b.followUps === '1' || b.followUps === 'true' || b.followUps === true)) {
    await access(caller, org, 'read');
    var open = await root.collection('crm_followups').where('open', '==', true).limit(FOLLOW_SCAN).get();
    var rows = open.docs.map(function (d) { return d.data() || {}; }).filter(function (d) { return d.activityId && d.customerId; }).sort(C.byDue);
    var shown = rows.slice(0, FOLLOW_CAP), ids = [];
    shown.forEach(function (d) { if (ids.indexOf(d.customerId) < 0) ids.push(d.customerId); });
    var names = {};
    (await Promise.all(ids.map(function (id) { return root.collection('customers').doc(id).get(); }))).forEach(function (s) { if (s.exists) names[s.id] = (s.data() || {}).name || ''; });
    return { followUps: shown.map(function (d) { return C.followUpView(d, names[d.customerId] != null ? names[d.customerId] : null); }),
      limited: open.size >= FOLLOW_SCAN || rows.length > FOLLOW_CAP };
  }

  var action = req.method === 'POST' ? String(b.action || '') : 'read';
  var who = await access(caller, org, action === 'file-archive' || action === 'contact-archive' ? 'admin' : req.method === 'POST' ? 'write' : 'read');
  if (!b.customerId) throw A.httpError(400, 'Which customer?');
  var cid = C.recordId(b.customerId, 'Customer'), acctRef = root.collection('customers').doc(cid), acctSnap = await acctRef.get();
  if (!acctSnap.exists) throw A.httpError(404, 'Customer not found');
  var acct = { id: cid, data: acctSnap.data() || {}, ref: acctRef };
  var contactsCol = acctRef.collection('contacts'), activityCol = acctRef.collection('activity'), filesCol = acctRef.collection('files'), followCol = root.collection('crm_followups');

  if (req.method === 'GET' && b.file) {
    var fs = await filesCol.doc(C.recordId(b.file, 'Document')).get(), f = fs.exists ? fs.data() || {} : null;
    if (!f || f.archived === true) throw A.httpError(404, 'Document not found');
    return stream(res, org, cid, f);
  }

  if (req.method === 'GET') {
    /* Lists are equality queries on `archived` (every record is written
       with it), so an archived row never takes a live one's place under the
       cap; the newest-first order is applied here. The timeline reads the
       newest documents INCLUDING archived ones — they were uploaded. */
    var audits = db.collection('omega_audit').where('orgId', '==', org).where('customerId', '==', cid);
    var got = await Promise.all([
      contactsCol.where('archived', '==', false).limit(LIST_CAP + 1).get(),
      activityCol.orderBy('at', 'desc').limit(LIST_CAP).get(),
      filesCol.where('archived', '==', false).limit(SCAN).get(),
      followCol.where('customerId', '==', cid).where('open', '==', true).limit(FOLLOW_CAP).get(),
      acctRef.collection('users').limit(100).get(),
      B.accountOrders(db, org, null, acct, { limit: LIST_CAP, includeIntake: true }),
      filesCol.orderBy('uploadedAt', 'desc').limit(LIST_CAP).get(),
      root.collection('sites').where('customerId', '==', cid).limit(LIST_CAP).get(),
      /* Only what the timeline reads: a design's canvasJson is up to 750 KB
         and fifty of them would be ~37 MB for four fields each. */
      acctRef.collection('projects').orderBy('updatedAt', 'desc').select('name', 'createdAt', 'updatedAt', 'revision').limit(50).get(),
      /* No orderBy (that needs a composite index on omega_audit, and a
         missing one fails this whole read): all of the account's rows, and
         the newest are chosen below. A cut in id order is a random one. */
      audits.where('action', '==', 'buyer-editor-trial').limit(EDITOR_SCAN).get(),
      audits.where('action', '==', 'customer-editor-lite').limit(EDITOR_SCAN).get()
    ]);
    var contactNames = {}, contacts = [];
    got[0].docs.forEach(function (d) { var v = d.data() || {}; contactNames[d.id] = v.name || v.email || ''; if (v.archived !== true) contacts.push(C.contactView(d.id, v)); });
    contacts.sort(function (x, y) { return (y.primary ? 1 : 0) - (x.primary ? 1 : 0) || x.name.toLowerCase().localeCompare(y.name.toLowerCase()); });
    contacts = contacts.slice(0, LIST_CAP);
    var orders = got[5].docs.map(function (d) { return Object.assign({}, d.data() || {}, { id: d.id }); }), orderNos = {};
    orders.forEach(function (o) { orderNos[o.id] = o.orderNo || o.id; });
    var activityRaw = got[1].docs.map(function (d) { return Object.assign({}, d.data() || {}, { id: d.id }); });
    var live = got[2].docs.map(function (d) { return Object.assign({}, d.data() || {}, { id: d.id }); }).filter(function (x) { return x.uploadState === 'stored'; })
      .sort(function (x, y) { return C.millis(y.uploadedAt) - C.millis(x.uploadedAt); });
    var filesRaw = got[6].docs.map(function (d) { return Object.assign({}, d.data() || {}, { id: d.id }); });
    /* The units bought on the account's newest orders (the same query
       api/my-sites.js makes), for the custody lines on the timeline. */
    var unitIds = orders.slice(0, UNIT_ORDERS).map(function (o) { return o.id; }), units = [];
    var chunks = []; for (var i = 0; i < unitIds.length; i += 10) chunks.push(unitIds.slice(i, i + 10));
    (await Promise.all(chunks.map(function (ids) { return db.collection('plant_units').where('orgId', '==', org).where('orderId', 'in', ids).limit(400).get(); })))
      .forEach(function (s) { s.docs.forEach(function (d) { var u = d.data() || {}; if (u.shipUnit && u.custody) units.push(u); }); });
    var newest = function (snap) {
      return snap.docs.map(function (d) { return d.data() || {}; }).sort(function (x, y) { return C.millis(y.at) - C.millis(x.at); }).slice(0, EDITOR_SHOWN);
    };
    var editorEvents = newest(got[9]).concat(newest(got[10]));
    return {
      customerId: cid, company: acct.data.name || '', status: acct.data.status || 'active',
      contacts: contacts,
      activity: activityRaw.map(function (a) { return C.activityView(a.id, a, contactNames, orderNos); }),
      followUps: got[3].docs.map(function (d) { return C.followUpView(d.data() || {}, acct.data.name || '', contactNames); }).sort(C.byDue),
      files: live.slice(0, LIST_CAP).map(function (x) { return C.fileView(x.id, x, 'office'); }),
      timeline: C.timeline({ orders: orders, people: got[4].docs.map(function (d) { var v = d.data() || {}; v.email = v.email || d.id; return v; }), files: filesRaw, activity: activityRaw, contactNames: contactNames,
        units: units, sites: got[7].docs.map(function (d) { return Object.assign({}, d.data() || {}, { id: d.id }); }), designs: got[8].docs.map(function (d) { return Object.assign({}, d.data() || {}, { id: d.id }); }),
        editorEvents: editorEvents, editorLite: acct.data.editorLite || null }),
      canEdit: who.edit, canArchive: who.admin,
      limited: got[0].size > LIST_CAP || got[1].size >= LIST_CAP || got[2].size >= SCAN || live.length > LIST_CAP || got[5].truncated === true
    };
  }

  /* ── contacts: people at the account who never log in ─────────────── */
  if (action === 'contact-save') {
    var input = C.contactInput(b), id = b.id ? C.recordId(b.id, 'Contact') : null, cref = id ? contactsCol.doc(id) : contactsCol.doc();
    return db.runTransaction(async function (tx) {
      var all = await tx.get(contactsCol.where('archived', '==', false).limit(LIST_CAP + 1)), cur = id ? await tx.get(cref) : null;
      if (id && !cur.exists) throw A.httpError(404, 'That contact is not on this account');
      if (id && (cur.data() || {}).archived === true) throw A.httpError(409, 'That contact is archived');
      var live = all.docs.filter(function (d) { return (d.data() || {}).archived !== true; });
      if (!id && live.length >= LIST_CAP) throw A.httpError(409, 'This account has ' + LIST_CAP + ' contacts; archive some before adding more');
      if (input.email && live.some(function (d) { return d.id !== cref.id && String((d.data() || {}).email || '').toLowerCase() === input.email; })) throw A.httpError(409, input.email + ' is already a contact on this account');
      if (input.primary) live.forEach(function (d) { if (d.id !== cref.id && (d.data() || {}).primary === true) tx.update(d.ref, { primary: false, updatedAt: now, updatedBy: by }); });
      var doc;
      if (id) { doc = Object.assign({}, cur.data(), input, { updatedAt: now, updatedBy: by }); tx.update(cref, Object.assign({}, input, { updatedAt: now, updatedBy: by })); }
      else { doc = Object.assign({ orgId: org, customerId: cid }, input, { archived: false, createdAt: now, createdBy: by }); tx.create(cref, doc); }
      audit(tx, db, 'crm-contact-save', org, cid, by, now, { contactId: cref.id, created: !id, was: id ? cur.data() : null, contact: input });
      return { ok: true, id: cref.id, contact: C.contactView(cref.id, doc), note: id ? 'Contact saved.' : 'Contact added.' };
    });
  }
  if (action === 'contact-archive') {
    var aid = C.recordId(b.id, 'Contact'), aref = contactsCol.doc(aid);
    return db.runTransaction(async function (tx) {
      var s = await tx.get(aref);
      if (!s.exists) throw A.httpError(404, 'That contact is not on this account');
      if ((s.data() || {}).archived === true) return { ok: true, duplicate: true, note: 'Already archived.' };
      tx.update(aref, { archived: true, primary: false, archivedAt: now, archivedBy: by });
      audit(tx, db, 'crm-contact-archive', org, cid, by, now, { contactId: aid, was: s.data() });
      return { ok: true, note: 'Contact archived. Logged activity with them keeps their name.' };
    });
  }

  /* ── activity: what happened with the account, and what is owed ────── */
  if (action === 'log') {
    var entry = C.activityInput(b, now), contactName = null, orderNo = null;
    if (entry.contactId) {
      var cs = await contactsCol.doc(entry.contactId).get();
      if (!cs.exists) throw A.httpError(400, 'That contact is not on this account');
      if ((cs.data() || {}).archived === true) throw A.httpError(400, 'That contact is archived');
      contactName = (cs.data() || {}).name || (cs.data() || {}).email || null;
    }
    if (entry.orderId) {
      /* The ACCOUNT's order: stamped for it, or billed to one of its people
         (B.accountOfOrder is the same rule the custody and billing use). */
      var os = await db.collection('orders').doc(entry.orderId).get(), o = os.exists ? os.data() || {} : null;
      if (!o || o.orgId !== org || (await B.accountOfOrder(db, org, o)) !== cid) throw A.httpError(400, 'That order is not on this account');
      orderNo = o.orderNo || entry.orderId;
    }
    var lref = activityCol.doc();
    return db.runTransaction(async function (tx) {
      /* The contact's name and the order number go on the record, so the
         entry still says who and which after the contact is archived. */
      var rec = Object.assign({ orgId: org, customerId: cid }, entry, { contactName: contactName, orderNo: orderNo, by: by, loggedAt: now, done: false, doneAt: null, doneBy: null });
      tx.create(lref, rec);
      if (C.isOpen(rec)) tx.create(followCol.doc(cid + '__' + lref.id), { orgId: org, customerId: cid, company: acct.data.name || '', activityId: lref.id, type: entry.type, subject: entry.subject,
        followUpAt: entry.followUpAt, contactId: entry.contactId, contactName: contactName, orderId: entry.orderId, by: by, at: entry.at, open: true, createdAt: now });
      audit(tx, db, 'crm-log', org, cid, by, now, { activityId: lref.id, type: entry.type, subject: entry.subject, followUpAt: entry.followUpAt, contactId: entry.contactId, orderId: entry.orderId });
      var names = {}, nos = {}; if (entry.contactId) names[entry.contactId] = contactName; if (entry.orderId) nos[entry.orderId] = orderNo;
      return { ok: true, id: lref.id, activity: C.activityView(lref.id, rec, names, nos),
        note: C.TYPE_LABEL[entry.type] + ' logged' + (entry.followUpAt ? '; follow up ' + entry.followUpAt + ' is on Today.' : entry.type === 'task' ? '; it is on Today until done.' : '.') };
    });
  }
  if (action === 'done') {
    var did = C.recordId(b.id, 'Activity'), dref = activityCol.doc(did), iref = followCol.doc(cid + '__' + did);
    return db.runTransaction(async function (tx) {
      var s = await tx.get(dref), ix = await tx.get(iref);
      if (!s.exists) throw A.httpError(404, 'That entry is not on this account');
      var a = s.data() || {};
      if (!a.followUpAt && a.type !== 'task') throw A.httpError(400, 'Only a follow-up or a task can be marked done');
      if (a.done === true) return { ok: true, duplicate: true, note: 'Already done.' };
      tx.update(dref, { done: true, doneAt: now, doneBy: by });
      if (ix.exists) tx.update(iref, { open: false, doneAt: now, doneBy: by });
      audit(tx, db, 'crm-done', org, cid, by, now, { activityId: did, followUpAt: a.followUpAt || null });
      return { ok: true, note: 'Done. It is off Today.' };
    });
  }

  /* ── documents ─────────────────────────────────────────────────────── */
  if (action === 'file-upload') {
    var file = C.fileInput(b.file), meta = { from: 'office', shared: C.bool(b.shared), category: C.category(b.category), note: C.text(b.note, 500, 'Note', { multiline: true }), by: by, audience: 'office' };
    var up = await store(db, org, acct, file, meta);
    up.note = up.duplicate ? 'That document is already on the account.' : 'Uploaded. ' + (up.file.shared ? 'The customer sees it in their app.' : 'Only the office sees it until you share it.');
    return up;
  }
  if (action === 'file-share' || action === 'file-archive') {
    var fid = C.recordId(b.id, 'Document'), fref = filesCol.doc(fid), share = null;
    if (action === 'file-share') {
      if (b.shared === true || b.shared === 'true') share = true; else if (b.shared === false || b.shared === 'false') share = false;
      else throw A.httpError(400, 'Say whether the customer sees it: shared true or false');
    }
    return db.runTransaction(async function (tx) {
      var s = await tx.get(fref), v = s.exists ? s.data() || {} : null;
      if (!v || v.uploadState !== 'stored') throw A.httpError(404, 'Document not found');
      if (action === 'file-archive') {
        if (v.archived === true) return { ok: true, duplicate: true, note: 'Already archived.' };
        tx.update(fref, { archived: true, archivedAt: now, archivedBy: by });
        audit(tx, db, 'crm-file-archive', org, cid, by, now, { fileId: fid, name: v.name, from: v.from, wasShared: v.shared === true });
        return { ok: true, note: 'Archived. It is kept on record and is no longer listed' + (v.from === 'customer' || v.shared === true ? ', here or in the customer\'s app.' : '.') };
      }
      if (v.archived === true) throw A.httpError(404, 'Document not found');
      if (v.from === 'customer') throw A.httpError(409, 'The customer uploaded this; it is already on their account');
      if ((v.shared === true) === share) return { ok: true, duplicate: true, shared: share, note: share ? 'Already shared.' : 'Already office only.' };
      tx.update(fref, { shared: share, sharedAt: now, sharedBy: by });
      audit(tx, db, 'crm-file-share', org, cid, by, now, { fileId: fid, name: v.name, shared: share });
      return { ok: true, shared: share, note: share ? 'Shared. The customer sees it in their app.' : 'No longer shared. The customer no longer sees it.' };
    });
  }
  throw A.httpError(400, 'Unknown CRM action');
});

module.exports = handler;
/* The documents' one writer and one reader, for api/my-files.js. */
module.exports.store = store;
module.exports.stream = stream;
