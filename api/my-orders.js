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
   Every query is scoped by orgId AND by the caller's VERIFIED email.

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

var MAX_ORDERS = 50;

function lower(v) { return String(v == null ? '' : v).trim().toLowerCase(); }

/* The customer must have PROVEN the address. Staff are exempt so a rep can
   look at the portal as themselves while supporting somebody. */
function requireVerified(caller) {
  var v = caller && caller.claims && caller.claims.email_verified;
  if (!v && !(caller && caller.staff)) {
    throw A.httpError(403, 'Please confirm your email address, then sign in again.');
  }
  if (!caller.email) throw A.httpError(403, 'This account has no email address on it.');
  return lower(caller.email);
}

/* Units for one order, via the works order the release step raises.
   TODAY THIS IS USUALLY EMPTY: the release handler (deposit → works order)
   is designed and not built, so most orders have no plant record at all.
   That is why it returns [] rather than throwing — an order with no units
   is a normal order early in its life, and milestoneOf() falls back to the
   order's own status for exactly this case. */
function unitsFor(db, orgId, orderNo) {
  if (!orderNo) return Promise.resolve([]);
  return db.collection('plant_works_orders')
    .where('orgId', '==', orgId).where('orderNo', '==', orderNo).limit(5).get()
    .then(function (wos) {
      if (!wos || wos.empty) return [];
      var ids = [];
      wos.forEach(function (d) { ids.push(d.id); });
      return Promise.all(ids.map(function (id) {
        return db.collection('plant_units')
          .where('orgId', '==', orgId).where('woId', '==', id).limit(200).get()
          .then(function (s) {
            var out = [];
            s.forEach(function (d) { var v = d.data() || {}; out.push({ at: v.at, hold: v.hold }); });
            return out;
          }, function () { return []; });
      })).then(function (lists) {
        return lists.reduce(function (a, b) { return a.concat(b); }, []);
      });
    }, function () { return []; });
}

/* The tenant may rename the public ladder without a deploy. Presentation
   only — a typo here cannot invent a milestone, see api/_lib/portal.js. */
function milestoneMapOf(db, orgId) {
  return db.collection('omega_orgs').doc(orgId).collection('storefront').doc('config').get()
    .then(function (d) {
      var c = (d && d.exists ? d.data() : {}) || {};
      return { map: c.milestoneMap || null, showPrice: c.showCustomerPrice === true };
    }, function () { return { map: null, showPrice: false }; });
}

module.exports = A.handler(function (req) {
  if (req.method !== 'GET') throw A.httpError(405, 'GET only');

  return A.authenticate(req).then(function (caller) {
    var email = requireVerified(caller);
    /* SHAPE-CHECKED, not merely lowercased. Firestore's .doc() accepts
       multi-segment paths, so an org of 'cleancell.us/customers/x' resolves
       to a valid four-segment DOCUMENT — a path-injection primitive rather
       than a failed lookup. A.safeOrg() is the one definition of the shape. */
    var org = A.safeOrg((req.query && req.query.org) || '');
    if (!org) throw A.httpError(400, 'a valid org is required');

    var db = A.db();
    var wanted = String((req.query && req.query.orderNo) || '').trim().slice(0, 120);

    /* BOTH AXES. Without the orgId clause a customer who also bought from
       another OMEGA tenant would see that order on this tenant's branded
       portal. */
    var q = db.collection('orders')
      .where('orgId', '==', org)
      .where('customer.email', '==', email);
    /* Narrow in the QUERY, not after the limit. Filtering a 50-row page in
       JavaScript meant a customer with more than fifty orders could ask for
       one by reference and be told it did not exist, because it fell outside
       the page the query happened to return. */
    if (wanted) q = q.where('orderNo', '==', wanted);

    return Promise.all([q.limit(MAX_ORDERS).get(), milestoneMapOf(db, org)])
      .then(function (r) {
        var snap = r[0], cfg = r[1];
        var rows = [];
        snap.forEach(function (d) {
          var v = d.data() || {};
          v.id = d.id;
          rows.push(v);
        });
        /* Newest first, sorted here rather than in the query so this needs
           one composite index instead of two. 50 rows is nothing.

           Sorted through P.when() because createdAt is a Firestore Timestamp,
           not a string: String()-ing it gives "[object Object]" for EVERY
           row, so the comparator returned 0 throughout and the list came back
           in whatever order Firestore happened to yield. */
        rows.sort(function (a, b) {
          return String(P.when(b.createdAt) || '').localeCompare(String(P.when(a.createdAt) || ''));
        });

        return Promise.all(rows.map(function (o) {
          return unitsFor(db, org, o.orderNo).then(function (units) {
            return P.publicOrder(o, { units: units, milestoneMap: cfg.map, showPrice: cfg.showPrice });
          });
        })).then(function (orders) {
          /* Reported off the rows actually returned, so a single-order
             lookup never claims the list was cut short. */
          return { orders: orders, count: orders.length,
                   truncated: !wanted && rows.length >= MAX_ORDERS };
        });
      });
  })['catch'](function (e) {
    /* A deliberate httpError passes through; anything else becomes flat. */
    if (e && e.status) throw e;
    console.error('[my-orders]', e);
    throw A.httpError(500, 'Something went wrong on our side. Please try again.');
  });
});
