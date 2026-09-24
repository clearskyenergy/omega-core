/* ═══════════════════════════════════════════════════════════════════════════
   api/my-files.js — the customer's documents, on the supplier's customer app
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   GET  /api/my-files?org=                 what the supplier shared with the
                                           account + the account's own uploads
   GET  /api/my-files?org=&file=<id>       one of those, as an attachment
   POST /api/my-files { org, action: 'upload', file: { name, base64 },
                        category, note }

   The other door onto the CRM's documents (api/crm.js is the office's). The
   records are the same records — omega_orgs/{org}/customers/{id}/files — so
   what the customer uploads is on the account in the supplier's CRM the
   moment it is stored, and what the office shares appears here. Nothing is
   typed twice and there is no second copy to drift.

   WHO. The same proof api/my-orders.js asks for: a VERIFIED email, the
   account that email is on (customer_index), and an ACTIVE person on an
   active account — a pending colleague, a turned-off one or a suspended
   account sees nothing and uploads nothing. The account comes from the
   token, never from the request: a caller cannot name another company.

   WHAT. A document the office marked shared, or one somebody on the account
   uploaded — never an office-only document, never an archived one, never
   another account's (a file id from elsewhere is simply not found here).
   The storage path and the office's own names never leave: the office's
   uploads say "shared by" the supplier.

   HOW MUCH. 2 MB a file, the types api/_lib/crm.js fileInput() decides by
   the bytes, and 20 uploads a day per ACCOUNT (not per person — a company
   with five logins does not get a hundred), counted on the account in the
   same transaction that reserves the record.

   Scrubs its own 500s, like api/my-orders.js and for the same reason: a
   helper's message must never reach a battery customer's screen.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var A = require('./_lib/admin'), B = require('./_lib/buyer-accounts'), C = require('./_lib/crm'), CRM = require('./crm');

var DAILY_UPLOADS = 20, LIST_CAP = 200;

/* Every reader proves the address (api/my-orders.js). */
function requireVerified(caller) {
  if (!caller || !caller.claims || caller.claims.email_verified !== true) throw A.httpError(403, 'Please confirm your email address, then sign in again.');
  if (!caller.email) throw A.httpError(403, 'This account has no email address on it.');
  return String(caller.email).trim().toLowerCase();
}

module.exports = A.handler(function (req, res) {
  res.setHeader('Cache-Control', 'no-store');
  return (async function () {
    if (req.method !== 'GET' && req.method !== 'POST') throw A.httpError(405, 'GET or POST only');
    var caller = await A.authenticate(req), address = requireVerified(caller);
    var b = (req.method === 'GET' ? req.query : req.body) || {}, org = A.safeOrg(b.org || '');
    if (!org) throw A.httpError(400, 'a valid org is required');
    if (typeof A.isDegraded === 'function' && A.isDegraded()) throw A.httpError(503, 'Your documents are temporarily unavailable. Please try again shortly.');
    var db = A.db();
    await B.context(org);
    var found = B.active(await B.lookup(db, org, address));
    var account = { id: found.id, data: found.data || {}, ref: db.collection('omega_orgs').doc(org).collection('customers').doc(found.id) };
    var files = account.ref.collection('files');

    if (req.method === 'GET' && b.file) {
      var s = await files.doc(C.recordId(b.file, 'Document')).get(), f = s.exists ? s.data() || {} : null;
      if (!C.customerMaySee(f)) throw A.httpError(404, 'We could not find that document on your account.');
      return CRM.stream(res, org, account.id, f);
    }
    if (req.method === 'GET') {
      var rows = await files.orderBy('uploadedAt', 'desc').limit(LIST_CAP).get();
      return { company: account.data.name || '', dailyUploads: DAILY_UPLOADS,
        files: rows.docs.filter(function (d) { return C.customerMaySee(d.data()); }).map(function (d) { return C.fileView(d.id, d.data() || {}, 'customer'); }),
        limited: rows.size >= LIST_CAP };
    }
    if (b.action !== 'upload') throw A.httpError(400, 'Unknown documents action');
    var file = C.fileInput(b.file);
    var out = await CRM.store(db, org, account, file, { from: 'customer', shared: true, category: C.category(b.category), note: C.text(b.note, 500, 'Note', { multiline: true }),
      by: address, customerEmail: address, dailyLimit: DAILY_UPLOADS, audience: 'customer' });
    out.note = out.duplicate ? 'That document is already on your account.' : 'Uploaded. Your supplier sees it on your account.';
    return out;
  })()['catch'](function (e) {
    /* Keyed on authorship, as in api/my-orders.js: every error this file
       means to say is a 4xx; anything 5xx is reworded. */
    if (e && e.status && e.status < 500) throw e;
    console.error('[my-files]', e);
    throw A.httpError(500, 'Something went wrong on our side. Please try again.');
  });
});
