/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/my-orders?org=<orgId>[&orderNo=<ref>]
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   The first CUSTOMER-FACING read path in this codebase. Everything else in
   /api/ answers to a tenant member or to staff; this answers to the person
   who bought the battery.

   ── WHY THE RULES CANNOT HELP HERE ───────────────────────────────────────
   firestore.rules scopes `orders` by orgId — the SELLING TENANT. That is
   exactly the party whose commercial information we are keeping from their
   own customer, so there is no read rule that would work: `allow create,
   update: if false` already means every write goes through an endpoint, and
   now every customer read does too.

   ── THE TWO AXES, AND WHICH ONE IS THE CONTROL ───────────────────────────
   Every query is scoped by orgId AND by the caller's VERIFIED email — which
   picks the customer ACCOUNT the person is on (customer_index), and the
   account's orders are what every active person on it sees.

   The email is the control. `org` merely says which tenant's portal the
   customer is looking at — a caller who changes it sees their own orders
   with a different tenant, which they are entitled to, so it buys nothing.
   What cannot be varied is whose email is on the order, because that comes
   from a Firebase token Google signed.

   ── email_verified IS THE WHOLE SECURITY MODEL ───────────────────────────
   Without it, anybody registers bob@bigcustomer.com with a password account
   and reads Bob's orders. It is not a first-class field on the caller, but
   authenticate() keeps the whole decoded token on `claims`, so it is
   available today with no change to api/_lib/admin.js.

   ── THIS ENDPOINT SCRUBS ITS OWN 500s ────────────────────────────────────
   A.handler() sends `err.message` to the client on any status. That is fine
   for a signed-in colleague and wrong here: a stray TypeError would reach a
   battery customer as a stack-shaped string naming our fields. So every
   throw below is a deliberate httpError, and the outermost catch converts
   anything else into a flat 500. api/_lib/embed.js does the same and its
   header explains why.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var A = require('./_lib/admin.js');
var P = require('./_lib/portal.js');
var B = require('./_lib/buyer-accounts');

var MAX_ORDERS = 50;
/* A works order bigger than this is not a roster we page through on a
   customer-facing read; see unitsFor(). */
var UNIT_CAP = 400;

function lower(v) { return String(v == null ? '' : v).trim().toLowerCase(); }

/* Every reader proves the address. Support-account trust is provisioned
   explicitly in Auth, never inferred from an email prefix or staff domain. */
function requireVerified(caller) {
  var v = caller && caller.claims && caller.claims.email_verified;
  if (v !== true) {
    throw A.httpError(403, 'Please confirm your email address, then sign in again.');
  }
  if (!caller.email) throw A.httpError(403, 'This account has no email address on it.');
  return lower(caller.email);
}

/* Units for one order, via the works order the release step raises.
   api/_lib/logic-workflow.js release() writes plant_works_orders/wo_<orderId>
   with this order's `orderNo` once the deposit invoice reconciles as paid
   (api/logic-worker.js runs it every five minutes), and stamps `woId` on
   every unit it allocates or that the floor registers against it. Both
   composite indexes are in firestore.indexes.json. Before that moment —
   which is most of an order's early life, and every order not under Omega
   Logic — there is no plant record, so this returns [] rather than
   throwing, and milestoneOf() falls back to the order's own status. */
function unitsFor(db, orgId, orderNo) {
  if (!orderNo) return Promise.resolve([]);   /* no works order yet: normal */
  return db.collection('plant_works_orders')
    .where('orgId', '==', orgId).where('orderNo', '==', orderNo).limit(5).get()
    .then(function (wos) {
      if (!wos || wos.empty) return [];       /* not released yet: normal */
      var ids = [];
      wos.forEach(function (d) { ids.push(d.id); });
      return Promise.all(ids.map(function (id) {
        /* ONE MORE THAN THE CAP. milestoneOf() computes a WORST-OF across
           this list, so a silently clipped roster does not produce a slightly
           stale answer — it produces a confidently WRONG one, reporting the
           order at whichever milestone the units that happened to fit are at.
           Asking for CAP+1 lets us detect the clip instead of guessing. */
        return db.collection('plant_units')
          .where('orgId', '==', orgId).where('woId', '==', id).limit(UNIT_CAP + 1).get()
          .then(function (s) {
            var out = [];
            s.forEach(function (d) { var v = d.data() || {}; out.push({ at: v.at, hold: v.hold }); });
            return out;
          }, function () { return null; });     /* null = unknown, not empty */
      })).then(function (lists) {
        /* A failed read or a clipped roster means we do not know where this
           order is. Returning [] would claim the floor had nothing to say and
           fall back to the order status, which reads as progress. Returning
           null makes milestoneOf() use the order's own status too — but
           honestly, because the caller knows it was a fallback. */
        for (var i = 0; i < lists.length; i++) {
          if (lists[i] === null) return null;
          if (lists[i].length > UNIT_CAP) return null;
        }
        return lists.reduce(function (a, b) { return a.concat(b); }, []);
      });
    }, function () { return null; });        /* unknown, not empty */
}

/* The tenant may rename the public ladder without a deploy. Presentation
   only — a typo here cannot invent a milestone, see api/_lib/portal.js. */
function milestoneMapOf(db, orgId) {
  return db.collection('omega_orgs').doc(orgId).collection('storefront').doc('config').get()
    .then(function (d) {
      var c = (d && d.exists ? d.data() : {}) || {}, by = {};
      /* Only the two fields the warranty needs cross into the portal read;
         the rest of the product list (cost, bills, suppliers) stays here. */
      (c.products || []).forEach(function (p) { if (p && p.sku && ['__proto__', 'constructor', 'prototype'].indexOf(String(p.sku)) < 0) by[p.sku] = { warrantyYears: Number(p.warrantyYears) || 0 }; });
      return { map: c.milestoneMap || null, showPrice: c.showCustomerPrice === true, by: by };
    }, function () { return { map: null, showPrice: false, by: {} }; });
}

/* ── POST: the customer asks for something on their order ──────────────
   Body: { org, orderNo, kind, message, address? }
   kind: shipping (a new delivery address or date) · information (a
   question) · change (change the order) · warranty (a claim).

   It is a REQUEST. Nothing on the order changes here: not the address,
   not the lines, not the status. The office reads it on the order, acts
   through its own controls (logistics, pricing, cancellation) and answers;
   the answer comes back to the customer on this same record. Same email
   proof as the read, same scrubbed 500s. */
var REQUEST_KINDS = { shipping: true, information: true, change: true, warranty: true };
var MAX_REQUESTS = 50, MAX_OPEN = 10;
function requestChange(req) {
  var b = req.body || {};
  return A.authenticate(req).then(async function (caller) {
    var email = requireVerified(caller);
    var org = A.safeOrg(b.org || '');
    if (!org) throw A.httpError(400, 'a valid org is required');
    var orderNo = String(b.orderNo || '').trim().slice(0, 120);
    if (!orderNo) throw A.httpError(400, 'Which order is this about?');
    var kind = String(b.kind || '').trim().toLowerCase();
    if (!REQUEST_KINDS[kind]) throw A.httpError(400, 'Choose what the request is about.');
    var message = String(b.message || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, 2000);
    if (message.length < 5) throw A.httpError(400, 'Tell us what you need, in a few words at least.');
    var address = null;
    if (kind === 'shipping' && b.address && typeof b.address === 'object') {
      var a = b.address; address = { line1: String(a.line1 || '').trim().slice(0, 200), city: String(a.city || '').trim().slice(0, 100), state: String(a.state || '').trim().slice(0, 40), zip: String(a.zip || '').trim().slice(0, 20) };
      if (!address.line1 && !address.city) address = null;
    }
    var db = A.db();
    /* Same gate and same scope as the read: a suspended account, a disabled
       or pending person, or a lapsed portal asks nothing; a colleague on the
       account may ask about any of the ACCOUNT's orders. */
    await B.context(org);
    var account = await B.lookup(db, org, email);
    if (account) B.active(account);
    var hit = await B.accountOrders(db, org, email, account, { orderNo: orderNo, limit: 5 });
    if (!hit.docs.length) throw A.httpError(404, 'We could not find that order on your account.');
    var ref = hit.docs[0].ref, now = new Date().toISOString();
    var id = 'rq_' + require('crypto').randomBytes(6).toString('hex');
    var entry = await db.runTransaction(async function (tx) {
      var s = await tx.get(ref), o = s.data() || {};
      var list = Array.isArray(o.requests) ? o.requests : [], open = list.filter(function (r) { return r && r.status === 'open'; }).length;
      if (open >= MAX_OPEN) throw A.httpError(429, 'You already have ' + MAX_OPEN + ' open requests on this order; we will answer those first.');
      if (list.length >= MAX_REQUESTS) throw A.httpError(429, 'This order has reached its request limit. Please call us.');
      var e = { id: id, kind: kind, message: message, address: address, by: email, at: now, status: 'open', answer: null };
      tx.update(ref, { requests: list.concat([e]), openRequests: open + 1, updatedAt: A.FieldValue().serverTimestamp() });
      tx.create(ref.collection('events').doc(), { at: now, by: email, what: 'Customer request (' + kind + '): ' + message.slice(0, 200) });
      return e;
    });
    return { ok: true, request: { id: entry.id, kind: entry.kind, message: entry.message, status: entry.status, at: entry.at, answer: null, address: entry.address } };
  })['catch'](function (e) {
    if (e && e.status && e.status < 500) throw e;
    console.error('[my-orders request]', e);
    throw A.httpError(500, 'Something went wrong on our side. Please try again.');
  });
}

module.exports = A.handler(function (req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'POST') return requestChange(req);
  if (req.method !== 'GET') throw A.httpError(405, 'GET or POST only');

  return A.authenticate(req).then(async function (caller) {
    var email = requireVerified(caller);
    /* SHAPE-CHECKED, not merely lowercased. Firestore's .doc() accepts
       multi-segment paths, so an org of 'cleancell.us/customers/x' resolves
       to a valid four-segment DOCUMENT — a path-injection primitive rather
       than a failed lookup. A.safeOrg() is the one definition of the shape. */
    var org = A.safeOrg((req.query && req.query.org) || '');
    if (!org) throw A.httpError(400, 'a valid org is required');

    /* Guarded so the 503 says something a customer can act on, rather than
       naming our environment variables. */
    if (typeof A.isDegraded === 'function' && A.isDegraded()) {
      throw A.httpError(503, 'Your orders are temporarily unavailable. Please try again shortly.');
    }
    var db = A.db();
    await B.context(org);
    var account = await B.lookup(db, org, email);
    if (account) B.active(account);
    var wanted = String((req.query && req.query.orderNo) || '').trim().slice(0, 120);

    /* THE ACCOUNT, NOT THE PERSON. A customer is a company with several people
       on it; every active one sees the account's orders (its customerId, or
       billed to one of them — B.accountOrders). With no account, the caller's
       own email. The orgId clause is inside the helper: without it a customer
       who also bought from another OMEGA tenant would see that order on this
       tenant's branded portal. Narrowed by orderNo IN THE QUERY, so a buyer
       with more than fifty orders can still open one by reference. */
    var found = B.accountOrders(db, org, email, account, wanted ? { orderNo: wanted, limit: 5 } : { limit: MAX_ORDERS });

    return Promise.all([found, milestoneMapOf(db, org)])
      .then(function (r) {
        var snap = r[0], cfg = r[1];
        var rows = [];
        snap.docs.forEach(function (d) {
          var v = d.data() || {};
          v.id = d.id;
          rows.push(v);
        });
        return Promise.all(rows.map(function (o) {
          return unitsFor(db, org, o.orderNo).then(function (units) {
            return P.publicOrder(o, { units: units, milestoneMap: cfg.map, showPrice: cfg.showPrice, catalogBy: cfg.by });
          });
        })).then(function (orders) {
          /* Reported off the rows actually returned, so a single-order
             lookup never claims the list was cut short. */
          return { orders: orders, count: orders.length,
                   truncated: !wanted && snap.truncated };
        });
      });
  })['catch'](function (e) {
    /* Keyed on AUTHORSHIP, not on a status existing. Every httpError this
       file raises is 4xx; a 5xx means a helper we did not write chose the
       wording — and A.db()'s degraded 503 quotes the FIREBASE_SERVICE_ACCOUNT
       variable name and the first characters of the credential blob. That is
       server configuration state, and it was about to be painted onto a
       battery customer's screen. */
    if (e && e.status && e.status < 500) throw e;
    console.error('[my-orders]', e);
    throw A.httpError(500, 'Something went wrong on our side. Please try again.');
  });
});
