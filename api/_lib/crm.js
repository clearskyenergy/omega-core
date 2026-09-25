/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/crm.js — the supplier's CRM, pure: what may be written and what
   the timeline says
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   The Customer hub of Omega Logic opens an ACCOUNT (a buyer company), not a
   person. Under it the office keeps three things no other record held:

     omega_orgs/{org}/customers/{customerId}/contacts/{id}   people who never log in
     omega_orgs/{org}/customers/{customerId}/activity/{id}   calls, emails, meetings,
                                                             notes, tasks; follow-ups
     omega_orgs/{org}/customers/{customerId}/files/{id}      documents, both ways
     omega_orgs/{org}/crm_followups/{customerId__activityId} the open follow-ups
                                                             across every account

   The follow-up index exists for the same reason customer_index does: the
   alternative is a collectionGroup('activity') query, whose index Firestore
   does not auto-create, and a query that fails on a missing index is the
   one that gets swallowed into "nothing due today". It is written in the
   SAME transaction as the activity and closed (open:false), never deleted.

   This file has no Firestore and no Admin SDK in it: validation of what the
   office and the customer send (contacts, activity, the file bytes) and the
   TIMELINE — the account's history merged from the records that already
   exist (orders, requests, PO intake, people, documents, activity, the
   custody of the units it bought, its sites, its designs and the design
   tool's trial or subscription). Nothing
   on the timeline is stored twice; it is derived on every read, so it cannot
   drift from the orders it describes. api/crm.js and api/my-files.js read and
   write; this decides.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var crypto = require('crypto');

var TYPES = ['call', 'email', 'meeting', 'note', 'task'];
var TYPE_LABEL = { call: 'Call', email: 'Email', meeting: 'Meeting', note: 'Note', task: 'Task' };
/* What a document is. Both apps offer a subset; 'po' is the office app's
   older key for the same thing and is stored as 'purchase-order'. */
var CATEGORIES = ['contract', 'drawing', 'datasheet', 'site-survey', 'purchase-order', 'invoice', 'photo', 'utility-bill', 'warranty', 'other'];
var CATEGORY_ALIAS = { po: 'purchase-order' };
var MAX_BYTES = 2 * 1024 * 1024;
var MAX_BASE64 = 2800000;            /* 2 MB of bytes is 2,796,204 characters of base64 */
var TIMELINE_CAP = 200;
var MIME = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  csv: 'text/csv', txt: 'text/plain'
};
var ACCEPTED = 'PDF, PNG, JPEG, XLSX, DOCX, CSV or TXT';

/* The same shape A.httpError makes, without requiring the Admin SDK here. */
function fail(status, message) { var e = new Error(message); e.status = status; return e; }

/* ── text ────────────────────────────────────────────────────────────────
   Control characters are stripped (a pasted email carries them and they
   are never meaningful); a value longer than its field is REFUSED with the
   field's name rather than silently cut — the office would not know the
   end of their call note was lost. */
function text(v, max, label, opts) {
  opts = opts || {};
  if (v == null) v = '';
  if (typeof v !== 'string' && typeof v !== 'number') throw fail(400, label + ' must be text');
  var s = String(v).replace(opts.multiline ? /\r\n?/g : /[\r\n\t]+/g, opts.multiline ? '\n' : ' ')
    .replace(opts.multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g : /[\u0000-\u001f\u007f]/g, '').trim();
  if (s.length > max) throw fail(400, label + ' is limited to ' + max + ' characters');
  if (opts.required && !s) throw fail(400, label + ' is required');
  return s;
}
function email(v, label) {
  var s = text(v, 254, label || 'Email').toLowerCase();
  if (s && !/^[^@\s/]+@[^@\s/]+\.[^@\s/]+$/.test(s)) throw fail(400, (label || 'Email') + ' is not a valid address');
  return s;
}
function bool(v) { return v === true || v === 'true' || v === 1 || v === '1'; }
function recordId(v, label) {
  var s = String(v == null ? '' : v);
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(s)) throw fail(400, (label || 'Record') + ' id is not valid');
  return s;
}

/* ── time ────────────────────────────────────────────────────────────────
   A DATE is YYYY-MM-DD and must be a real one: Date.parse('2026-02-30')
   quietly rolls over to 2 March, so every date round-trips before it is
   accepted. */
var YEAR_MS = 366 * 86400000;
function realDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  var t = Date.parse(s + 'T00:00:00Z');
  return isFinite(t) && new Date(t).toISOString().slice(0, 10) === s;
}
/* When a thing happened. A bare date stays a bare date — nobody said what
   time the meeting was, so none is invented; a date-time is normalised to
   ISO. Empty is now. Not before 2000, not more than a year ahead. */
function when(v, now, label) {
  label = label || 'Date';
  var s = text(v, 40, label);
  if (!s) return now;
  var t;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) { if (!realDate(s)) throw fail(400, label + ' is not a real date'); t = Date.parse(s + 'T00:00:00Z'); }
  else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s) && realDate(s.slice(0, 10))) { t = Date.parse(s); if (!isFinite(t)) throw fail(400, label + ' must be YYYY-MM-DD or an ISO date-time'); s = new Date(t).toISOString(); }
  else throw fail(400, label + ' must be YYYY-MM-DD or an ISO date-time');
  if (t < Date.UTC(2000, 0, 1) || t > Date.parse(now) + YEAR_MS) throw fail(400, label + ' is out of range');
  return s;
}
/* A follow-up is a DAY. An ISO date-time keeps the calendar date the person
   typed (its first ten characters), not its UTC date. Up to five years out. */
function followUpDay(v, now) {
  var s = text(v, 40, 'Follow-up date');
  if (!s) return null;
  var d = s.slice(0, 10);
  if (!realDate(d) || (s.length > 10 && !(/^T\d{2}:\d{2}/.test(s.slice(10)) && isFinite(Date.parse(s))))) throw fail(400, 'Follow-up date must be YYYY-MM-DD');
  var t = Date.parse(d + 'T00:00:00Z');
  if (t < Date.UTC(2000, 0, 1) || t > Date.parse(now) + 5 * YEAR_MS) throw fail(400, 'Follow-up date is out of range');
  return d;
}
function millis(v) {
  if (!v) return 0;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v.toDate === 'function') return v.toDate().getTime();
  if (typeof v === 'number') return v;
  if (typeof v === 'object' && typeof v._seconds === 'number') return v._seconds * 1000;
  if (typeof v === 'object' && typeof v.seconds === 'number') return v.seconds * 1000;
  var t = Date.parse(v); return isFinite(t) ? t : 0;
}
/* A time as the pages read it: a bare date stays a date; everything else
   becomes ISO; nothing parseable is null (and never invented). */
function iso(v) {
  if (typeof v === 'string' && realDate(v)) return v;
  var t = millis(v); return t ? new Date(t).toISOString() : null;
}

/* ── contacts ──────────────────────────────────────────────────────────── */
function contactInput(b) {
  b = b || {};
  var out = { name: text(b.name, 120, 'Name'), title: text(b.title, 120, 'Title'), email: email(b.email), phone: text(b.phone, 40, 'Phone'),
    notes: text(b.notes, 2000, 'Notes', { multiline: true }), primary: bool(b.primary) };
  if (!out.name && !out.email) throw fail(400, 'A contact needs a name or an email');
  if (!out.name) out.name = out.email;
  return out;
}

/* ── activity ──────────────────────────────────────────────────────────── */
function activityInput(b, now) {
  b = b || {};
  var type = String(b.type || '').trim().toLowerCase();
  if (TYPES.indexOf(type) < 0) throw fail(400, 'Choose call, email, meeting, note or task');
  var body = text(b.body, 4000, 'Details', { multiline: true }), subject = text(b.subject, 160, 'Subject');
  if (!subject && !body) throw fail(400, 'Say what the ' + TYPE_LABEL[type].toLowerCase() + ' was about');
  if (!subject) subject = body.split('\n')[0].slice(0, 160).trim();
  return { type: type, subject: subject, body: body, at: when(b.at, now, 'When'), followUpAt: followUpDay(b.followUpAt, now),
    contactId: b.contactId ? recordId(b.contactId, 'Contact') : null, orderId: b.orderId ? recordId(b.orderId, 'Order') : null };
}
function category(v) {
  var k = String(v == null ? '' : v).trim().toLowerCase();
  if (!k) return 'other';
  k = CATEGORY_ALIAS[k] || k;
  if (CATEGORIES.indexOf(k) < 0) throw fail(400, 'Choose a document category');
  return k;
}

/* ── the file ─────────────────────────────────────────────────────────────
   Decided by the BYTES, never by the name or a declared type: a PDF, PNG or
   JPEG by its signature; an XLSX or DOCX is a zip (PK) that must also carry
   the Office manifest and its own part folder and be named for what it is —
   a plain .zip, or a .docx that is really a spreadsheet, is refused; CSV and
   TXT have no signature, so they must be named so and contain no binary
   control bytes (an executable renamed .txt is full of NULs). The stored
   name gets the extension of what the bytes ARE. Served back only as an
   attachment with nosniff, so even a text file is never rendered. */
function extOf(name) { var m = /\.([A-Za-z0-9]{1,8})$/.exec(String(name || '').trim()); return m ? m[1].toLowerCase() : ''; }
function safeName(name, ext) {
  var base = String(name || '').split(/[\\/]/).pop().replace(/\.[^.]*$/, '').replace(/[^A-Za-z0-9._ -]/g, '_').replace(/^[.\s]+/, '').trim().slice(0, 120);
  return (base || 'document') + '.' + ext;
}
function isText(bytes) {
  for (var i = 0; i < bytes.length; i++) { var c = bytes[i]; if (c < 32 && c !== 9 && c !== 10 && c !== 12 && c !== 13) return false; }
  return true;
}
function fileInput(input) {
  if (!input || typeof input !== 'object') throw fail(400, 'Choose a file to upload');
  var name = text(input.name, 200, 'File name', { required: true });
  var b64 = typeof input.base64 === 'string' ? input.base64 : '';
  if (/^data:[^,]{0,120},/.test(b64)) b64 = b64.slice(b64.indexOf(',') + 1);
  if (!b64 || b64.length > MAX_BASE64 || !/^[A-Za-z0-9+/]*={0,2}$/.test(b64)) throw fail(400, 'The file must be ' + ACCEPTED + ', up to 2 MB');
  var bytes = Buffer.from(b64, 'base64');
  if (!bytes.length) throw fail(400, 'The file is empty');
  if (bytes.length > MAX_BYTES) throw fail(400, 'The file is larger than 2 MB');
  var ext = extOf(name), kind = '';
  if (bytes.length >= 5 && bytes.subarray(0, 5).toString('latin1') === '%PDF-') kind = 'pdf';
  else if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) kind = 'png';
  else if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) kind = 'jpg';
  else if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    /* Part names sit uncompressed in the zip's headers and directory. */
    var s = bytes.toString('latin1'), office = s.indexOf('[Content_Types].xml') >= 0;
    if (ext === 'xlsx' && office && s.indexOf('xl/') >= 0) kind = 'xlsx';
    else if (ext === 'docx' && office && s.indexOf('word/') >= 0) kind = 'docx';
    else throw fail(400, 'Only Excel (.xlsx) and Word (.docx) files are accepted from zip-based formats');
  } else if ((ext === 'csv' || ext === 'txt') && isText(bytes)) kind = ext;
  if (!kind) throw fail(400, 'Only ' + ACCEPTED + ' documents are accepted');
  return { bytes: bytes, ext: kind, type: MIME[kind], name: safeName(name, kind), size: bytes.length,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
}
/* The header value for a download: the stored name, quote- and
   newline-proof. */
function disposition(name) { return 'attachment; filename="' + String(name || 'document').replace(/["\\\r\n]/g, '_') + '"'; }

/* ── projections ─────────────────────────────────────────────────────────
   What leaves the endpoint. A file's storage path never does: the bytes are
   served by the endpoint that checked who is asking. */
function contactView(id, c) {
  return { id: id, name: c.name || '', title: c.title || '', email: c.email || '', phone: c.phone || '', notes: c.notes || '', primary: c.primary === true,
    archived: c.archived === true, createdAt: iso(c.createdAt), createdBy: c.createdBy || null, updatedAt: iso(c.updatedAt) };
}
function activityView(id, a, names, orderNos) {
  names = names || {}; orderNos = orderNos || {};
  return { id: id, type: a.type, subject: a.subject || '', body: a.body || '', at: iso(a.at), followUpAt: a.followUpAt || null,
    contactId: a.contactId || null, contactName: a.contactId ? names[a.contactId] || a.contactName || null : null,
    orderId: a.orderId || null, orderNo: a.orderId ? orderNos[a.orderId] || a.orderNo || null : null,
    by: a.by || null, loggedAt: iso(a.loggedAt), done: a.done === true, doneAt: iso(a.doneAt), doneBy: a.doneBy || null,
    open: isOpen(a) };
}
/* Owed: a follow-up date, or a task (which is owed whether or not anybody
   gave it a day). Open until marked done; this is what shows a Done button
   and what the follow-up index holds. */
function isOpen(a) { return !!a && a.done !== true && (!!a.followUpAt || a.type === 'task'); }
/* Earliest due first; a task with no day comes after every dated one. */
function byDue(x, y) {
  var a = x.followUpAt || '', b = y.followUpAt || '';
  if (a !== b) return !a ? 1 : !b ? -1 : a < b ? -1 : 1;
  return String(x.at || '').localeCompare(String(y.at || ''));
}
/* audience 'office' sees who uploaded; 'customer' sees a colleague's name on
   their own uploads and never a supplier employee's address. The office's
   NOTE on its own document never leaves the office either: it is typed next
   to "Share" as an internal remark ("floor is $410/kWh"), not a caption, and
   stays in the office like every other CRM note. A customer's own upload
   keeps its note — they wrote it. */
function fileView(id, f, audience) {
  var from = f.from === 'customer' ? 'customer' : 'office';
  var out = { id: id, name: f.name || 'document', type: f.type || '', size: Number(f.size) || 0, category: f.category || 'other', note: f.note || '',
    from: from, source: from, shared: from === 'customer' || f.shared === true, uploadedAt: iso(f.uploadedAt) };
  if (audience === 'office') { out.uploadedBy = f.uploadedBy || null; out.sha256 = f.sha256 || null; out.archived = f.archived === true; }
  else if (from === 'customer') out.uploadedBy = f.uploadedBy || null;
  else out.note = '';
  return out;
}
/* An open follow-up, from its index record (api/crm.js writes it with the
   activity). `id` is the ACTIVITY's id: it is what `done` takes. */
function followUpView(d, company, names) {
  names = names || {};
  return { id: d.activityId, activityId: d.activityId, customerId: d.customerId, company: company != null ? company : d.company || '',
    type: d.type, subject: d.subject || '', followUpAt: d.followUpAt || null, contactId: d.contactId || null,
    contactName: d.contactId ? names[d.contactId] || d.contactName || null : null, orderId: d.orderId || null, by: d.by || null, at: iso(d.at) };
}
/* May the customer see this record at all? */
function customerMaySee(f) { return !!f && f.uploadState === 'stored' && f.archived !== true && (f.from === 'customer' || f.shared === true); }

/* ── the timeline ────────────────────────────────────────────────────────
   Everything that happened on the account, newest first, capped. Each entry
   { at, kind, title, detail, by, orderId? }. An entry with no time on its
   record is left out rather than given one.

   input: { orders: [{ id, ...order }], people: [user records], files:
   [{ id, ...file }], activity: [{ id, ...activity }], contactNames: {id:name},
   units: [plant_units records], sites: [{ id, ...site }], designs: [{ id,
   ...project }], editorEvents: [omega_audit rows], editorLite: the account's
   current grant } */
function dollars(c) {
  var n = Math.round(Number(c) || 0), neg = n < 0; n = Math.abs(n);
  var whole = String(Math.floor(n / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ','), cents = String(n % 100);
  return (neg ? '-$' : '$') + whole + '.' + (cents.length < 2 ? '0' + cents : cents);
}
function items(o) {
  var list = (Array.isArray(o.items) ? o.items : []).filter(function (i) { return i && (i.sku || i.name); });
  var head = list.slice(0, 3).map(function (i) { return (Number(i.qty) || 0) + ' × ' + String(i.name || i.sku).slice(0, 60); }).join(', ');
  return head + (list.length > 3 ? ' and ' + (list.length - 3) + ' more' : '');
}
var STAGE = { deposit: 'Deposit', balance: 'Balance' };
function sourceSays(s) {
  s = String(s || '');
  if (/customer/.test(s)) return 'from the customer' + (/bulk/.test(s) ? ' in a batch' : '');
  if (/office/.test(s)) return 'entered by the office' + (/bulk/.test(s) ? ' in a batch' : '');
  return s ? 'via ' + s.slice(0, 40) : '';
}
function timeline(input, cap) {
  input = input || {}; cap = cap || TIMELINE_CAP;
  var out = [];
  function add(at, kind, title, detail, by, orderId) {
    var t = millis(at); if (!t) return;
    var e = { at: iso(at), kind: kind, title: String(title).slice(0, 200), detail: String(detail || '').slice(0, 300), by: by ? String(by).slice(0, 254) : null, _t: t };
    if (orderId) e.orderId = orderId;
    out.push(e);
  }
  (input.orders || []).forEach(function (o) {
    if (!o) return;
    var id = o.id, no = o.orderNo || id, po = (o.purchaseOrder || {}).number || '', pi = o.poIntake, l = o.logic || {}, c = o.customer || {};
    if (pi) {
      var num = pi.number || po || no, same = pi.convertedAt && pi.convertedAt === pi.createdAt;
      add(pi.createdAt, 'po-received', same ? 'PO ' + num + ' entered as order ' + no : 'PO ' + num + ' received',
        [sourceSays(pi.source), same ? items(o) : String(pi.notes || '').slice(0, 160), o.status === 'po_declined' ? 'declined' : ''].filter(Boolean).join(' · '), pi.submittedBy, id);
      if (pi.convertedAt && !same) add(pi.convertedAt, 'order-placed', 'PO ' + num + ' became order ' + no, items(o), null, id);
    } else {
      add(o.createdAt, 'order-placed', 'Order ' + no + ' placed' + (po ? ' · PO ' + po : ''), items(o), c.email || (o.purchaseOrder || {}).submittedBy, id);
    }
    /* Priced, then accepted: two moments, unless the acceptance came with
       the price (the office recording a signed quote), which is one. */
    if (l.commercial || l.acceptedAt) {
      var total = l.commercial && l.commercial.totalCents ? 'Total ' + dollars(l.commercial.totalCents) : '';
      var together = l.acceptedAt && (!l.createdAt || Math.abs(millis(l.acceptedAt) - millis(l.createdAt)) < 60000);
      if (together) add(l.acceptedAt, 'order-priced', 'Order ' + no + ' priced and accepted', total, null, id);
      else {
        add(l.createdAt, 'order-priced', 'Order ' + no + ' priced', total, null, id);
        if (l.acceptedAt) add(l.acceptedAt, 'order-accepted', 'Order ' + no + ' accepted', total, null, id);
      }
    }
    Object.keys(l.invoices || {}).forEach(function (stage) {
      var inv = l.invoices[stage] || {}, label = STAGE[stage] || stage;
      if (!inv.amountCents) return;
      var issued = inv.issuedAt || (inv.id ? inv.date : null);
      if (issued) add(issued, 'invoice-issued', label + ' invoice' + (inv.id ? ' ' + inv.id : '') + ' issued · order ' + no, dollars(inv.amountCents), inv.issuedBy, id);
      var pays = Array.isArray(inv.payments) ? inv.payments : [], running = 0;
      pays.forEach(function (p) {
        running += Number(p && p.amountCents) || 0;
        add(p && (p.date || p.at), 'invoice-paid', label + ' invoice' + (inv.id ? ' ' + inv.id : '') + (running >= inv.amountCents ? ' paid' : ' part paid') + ' · order ' + no,
          dollars(p && p.amountCents) + (running >= inv.amountCents ? ' · paid in full' : ' · ' + dollars(inv.amountCents - running) + ' outstanding'), null, id);
      });
      /* QuickBooks reconciles a paid invoice without a dated payment list:
         the time is when the reconciliation saw it paid. */
      if (!pays.length && inv.satisfied === true) add(inv.checkedAt || issued, 'invoice-paid', label + ' invoice' + (inv.id ? ' ' + inv.id : '') + ' paid · order ' + no, dollars(inv.paidCents || inv.amountCents), null, id);
    });
    if (o.shipment && o.shipment.shippedAt) add(o.shipment.shippedAt, 'order-shipped', 'Order ' + no + ' shipped', [o.shipment.carrier, o.shipment.tracking ? 'tracking ' + o.shipment.tracking : ''].filter(Boolean).join(' · '), null, id);
    (Array.isArray(o.requests) ? o.requests : []).forEach(function (r) {
      if (!r) return;
      add(r.at, 'request-asked', 'Asked about order ' + no + ' (' + (r.kind || 'request') + ')', String(r.message || '').slice(0, 200), r.by, id);
      if (r.answeredAt) add(r.answeredAt, 'request-answered', 'Answered the ' + (r.kind || '') + ' request on order ' + no, String(r.answer || '').slice(0, 200), r.answeredBy, id);
    });
  });
  (input.people || []).forEach(function (u) {
    if (!u) return;
    var who = u.name ? u.name + ' (' + u.email + ')' : u.email;
    if (u.requestedAt) {
      add(u.requestedAt, 'person-requested', who + ' asked to join the account', '', u.email);
      if (u.approvedAt) add(u.approvedAt, 'person-approved', who + ' was approved', '', u.approvedBy);
    } else add(u.createdAt, 'person-joined', who + (u.addedBy ? ' was added to the account' : ' joined the account'), u.role === 'owner' ? 'owner' : '', u.addedBy || u.email);
  });
  (input.files || []).forEach(function (f) {
    if (!f || f.uploadState !== 'stored') return;
    var theirs = f.from === 'customer';
    add(f.uploadedAt, 'file-uploaded', (f.name || 'A document') + ' uploaded' + (theirs ? ' by the customer' : ''),
      [f.category, f.note, !theirs && f.shared ? 'shared with the customer' : '', f.archived ? 'since archived' : ''].filter(Boolean).join(' · '), f.uploadedBy);
  });
  var names = input.contactNames || {};
  (input.activity || []).forEach(function (a) {
    if (!a) return;
    /* The live name, else the one stored at log time: an archived contact
       is not in contactNames, and the entry still says who (activityView). */
    var nm = a.contactId ? names[a.contactId] || a.contactName : null;
    var withWho = nm ? ' with ' + nm : '';
    add(a.at, 'activity-' + a.type, (TYPE_LABEL[a.type] || 'Note') + withWho + ': ' + (a.subject || ''), String(a.body || '').slice(0, 200), a.by, a.orderId);
    if (a.done && a.doneAt) add(a.doneAt, 'follow-up-done', 'Followed up: ' + (a.subject || TYPE_LABEL[a.type] || ''), '', a.doneBy, a.orderId);
  });
  custodyTimeline(input.units || [], add);
  (input.sites || []).forEach(function (st) {
    if (!st) return;
    var theirs = st.source === 'customer';
    add(st.createdAt, 'site-added', 'Site ' + (st.name || st.id) + ' added' + (theirs ? ' by the customer' : ''),
      [[(st.address || {}).city, (st.address || {}).state].filter(Boolean).join(', '), st.endCustomer ? 'for ' + st.endCustomer : '', st.status === 'inactive' ? 'since closed' : ''].filter(Boolean).join(' · '), st.createdBy);
  });
  (input.designs || []).forEach(function (p) {
    if (!p) return;
    var nm = String(p.name || 'A design').slice(0, 120);
    add(p.createdAt, 'design-started', 'Design ' + nm + ' started by the customer', '', null);
    if (Number(p.revision) > 1 && millis(p.updatedAt) > millis(p.createdAt)) add(p.updatedAt, 'design-saved', 'Design ' + nm + ' saved by the customer', 'revision ' + Number(p.revision), null);
  });
  editorTimeline(input.editorEvents || [], input.editorLite, add);
  out.sort(function (a, b) { return b._t - a._t; });
  return out.slice(0, cap).map(function (e) { delete e._t; return e; });
}

/* The units the account bought, past the plant: grouped by what happened,
   on which day, at which site, so fifty-six skids received together are one
   line, not fifty-six. Read off the unit record's custody{} (the one status
   machine in api/_lib/custody.js writes it); shipping is the ORDER's line. */
function custodyTimeline(units, add) {
  var groups = {}, order = [];
  function put(kind, at, site, title, extra, serial, orderId) {
    if (!at) return;
    var key = kind + '|' + String(at).slice(0, 10) + '|' + (site || '') + '|' + (extra || '');
    var g = groups[key];
    if (!g) { g = groups[key] = { kind: kind, at: at, site: site, title: title, extra: extra, serials: [], orderIds: [] }; order.push(key); }
    if (serial && g.serials.indexOf(serial) < 0) g.serials.push(serial);
    if (orderId && g.orderIds.indexOf(orderId) < 0) g.orderIds.push(orderId);
  }
  units.forEach(function (u) {
    if (!u || !u.custody) return;
    var c = u.custody, s = u.serial || '', site = c.siteName || c.siteId || '', theirs = c.declaredBy === 'customer';
    if (c.plannedAt && (c.plannedSiteName || c.plannedSiteId)) put('unit-destination', c.plannedAt, c.plannedSiteName || c.plannedSiteId, 'going to', c.plannedBy === 'customer' ? 'by the customer' : '', s, u.orderId);
    if (c.receivedAt) put('unit-received', c.receivedAt, '', 'received', c.state === 'damaged' ? 'damaged' : '', s, u.orderId);
    if (c.assignedAt && site) put('unit-assigned', c.assignedAt, site, 'assigned to', theirs ? 'by the customer' : '', s, u.orderId);
    if (c.commissionedAt) put('unit-commissioned', c.commissionedAt, site, 'commissioned', theirs ? 'declared by the customer' : '', s, u.orderId);
    if (theirs && c.confirmedAt && site) put('unit-confirmed', c.confirmedAt, site, 'confirmed at', 'by the office', s, u.orderId);
  });
  order.forEach(function (k) {
    var g = groups[k], n = g.serials.length || 1, what = n === 1 ? 'Unit ' + (g.serials[0] || '') : n + ' units';
    var title = what + ' ' + g.title + (g.site && /to$|at$/.test(g.title) ? ' ' + g.site : g.site ? ' at ' + g.site : '') + (g.extra ? ' ' + g.extra : '');
    add(g.at, g.kind, title.replace(/\s+/g, ' '), n > 1 ? g.serials.slice(0, 5).join(', ') + (n > 5 ? ' and ' + (n - 5) + ' more' : '') : '', null, g.orderIds.length === 1 ? g.orderIds[0] : null);
  });
}
/* The design tool on the account: every trial the supplier's owner granted
   or revoked and every subscription change, from the audit (history), and
   when there is none yet, the account's current grant. */
function editorTimeline(events, current, add) {
  var seen = 0;
  events.forEach(function (e) {
    if (!e) return;
    var g = e.grant || {};
    if (e.action === 'buyer-editor-trial') {
      seen++;
      add(e.at, 'design-trial', g.status === 'trial' ? 'Design tool trial granted' : 'Design tool trial ended by the supplier', g.status === 'trial' && g.expiresAt ? 'until ' + String(g.expiresAt).slice(0, 10) : '', e.by);
    } else if (e.action === 'customer-editor-lite') {
      seen++;
      add(e.at, 'design-subscription', 'Design tool subscription ' + (g.status === 'active' ? 'active' : g.status === 'past_due' ? 'payment overdue' : 'ended'),
        [g.plan === 'year' ? 'yearly' : g.plan === 'month' ? 'monthly' : '', g.expiresAt ? 'paid to ' + String(g.expiresAt).slice(0, 10) : ''].filter(Boolean).join(' · '), e.by);
    }
  });
  if (seen || !current || typeof current !== 'object') return;
  if (current.source === 'provider') add(current.updatedAt || current.grantedAt, 'design-subscription', 'Design tool subscription ' + (current.status === 'active' ? 'active' : current.status || 'recorded'), current.plan ? (current.plan === 'year' ? 'yearly' : 'monthly') : '', null);
  else if (current.grantedAt) add(current.grantedAt, 'design-trial', current.status === 'trial' ? 'Design tool trial granted' : 'Design tool trial ended by the supplier', current.status === 'trial' && current.expiresAt ? 'until ' + String(current.expiresAt).slice(0, 10) : '', current.grantedBy);
}

function newId(prefix) { return prefix + crypto.randomBytes(9).toString('hex'); }

module.exports = { TYPES: TYPES, TYPE_LABEL: TYPE_LABEL, CATEGORIES: CATEGORIES, MIME: MIME, MAX_BYTES: MAX_BYTES, TIMELINE_CAP: TIMELINE_CAP,
  fail: fail, text: text, email: email, bool: bool, recordId: recordId, realDate: realDate, when: when, followUpDay: followUpDay, millis: millis, iso: iso,
  contactInput: contactInput, activityInput: activityInput, category: category, fileInput: fileInput, safeName: safeName, disposition: disposition,
  contactView: contactView, activityView: activityView, fileView: fileView, followUpView: followUpView, customerMaySee: customerMaySee, timeline: timeline, dollars: dollars, newId: newId,
  isOpen: isOpen, byDue: byDue };
