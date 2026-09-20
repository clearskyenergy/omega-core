/* ═══════════════════════════════════════════════════════════════════════════
   GET  /api/my-account?org=<orgId>     — who am I here, and what are my terms
   POST /api/my-account { org, name, phone, company, address }  — edit my own
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   ── THE BUYER CREATES THEIR OWN RECORD; THE TENANT ENRICHES IT ───────────
   Decided 2026-09-20. The tenant pre-provisioning customers would contradict
   the funnel this repo already ships: the storefront's premise is "no account
   needed, order anyway", so a portal that required a salesperson to create
   somebody before they could see their own order is not self-serve, and it
   gates sign-in on a human being awake.

   So: a stranger orders with no account; they sign in later; THIS endpoint
   creates their record from the verified token and claims every order
   matching that email; they type their own company and address; and the
   tenant sets terms afterwards on a record that already exists. Terms are an
   OVERLAY, never a prerequisite — a customer with none gets the tenant's
   defaults and nothing about their first order waits on anybody.

   ── THE FIELD SPLIT IS ENFORCED HERE, NOT IN RULES ───────────────────────
       the customer  name, phone, company, address
       the tenant    terms{}, agreements[], plan, status
       the system    uid, source, customerId, createdAt, hasOrders

   A customer who could write terms.discountPct is a customer who sets their
   own price, so a POST is rebuilt key by key from an allowlist and the keys
   a customer may not set are DROPPED rather than refused — a client that
   sends too much should not break, it should simply not be obeyed.

   Firestore rules grant this collection to the tenant and to staff only. The
   customer's own view exists solely because this endpoint projects it.

   ── WHAT IT NEVER RETURNS ────────────────────────────────────────────────
   creditLimit and the tenant's internal notes. Net days and a discount are
   things a customer negotiated and may see; a credit ceiling somebody set
   about them is a judgement, not an agreement.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var A = require('./_lib/admin.js');

function lower(v) { return String(v == null ? '' : v).trim().toLowerCase(); }
function clean(v, n) { return String(v == null ? '' : v).trim().slice(0, n || 200); }

function requireVerified(caller) {
  var v = caller && caller.claims && caller.claims.email_verified;
  if (!v && !(caller && caller.staff)) {
    throw A.httpError(403, 'Please confirm your email address, then sign in again.');
  }
  if (!caller.email) throw A.httpError(403, 'This account has no email address on it.');
  return lower(caller.email);
}

/* The customer's own view of their account. Key by key: `terms` here is a
   narrowed copy, not the stored object. */
function project(customerId, c, userDoc, orderCount) {
  var t = (c && c.terms) || {};
  return {
    customerId: customerId,
    company: clean(c && c.name, 160) || clean(c && c.company, 160),
    plan: clean(c && c.plan, 40) || 'free',
    status: clean(c && c.status, 40) || 'active',
    you: {
      email: clean(userDoc && userDoc.email, 160),
      name: clean(userDoc && userDoc.name, 120),
      phone: clean(userDoc && userDoc.phone, 40),
      role: clean(userDoc && userDoc.role, 20) || 'user'
    },
    address: (c && c.address) ? {
      line1: clean(c.address.line1, 200), city: clean(c.address.city, 100),
      state: clean(c.address.state, 40), zip: clean(c.address.zip, 20)
    } : null,
    /* Net days and a discount are terms they agreed. creditLimit and the
       tenant's notes are judgements about them and stay internal. */
    terms: {
      netDays: (t.netDays === 0 || t.netDays) ? Number(t.netDays) : null,
      discountPct: (t.discountPct === 0 || t.discountPct) ? Number(t.discountPct) : null,
      poRequired: t.poRequired === true
    },
    agreements: Array.isArray(c && c.agreements) ? c.agreements.slice(0, 20).map(function (a) {
      return { kind: clean(a && a.kind, 60), ref: clean(a && a.ref, 80),
               signedAt: clean(a && a.signedAt, 40) };
    }) : [],
    orders: orderCount
  };
}

/* One account per (tenant, email), found through a POINTER DOCUMENT:

       omega_orgs/{org}/customer_index/{emailLower} -> { customerId }

   The first version used db.collectionGroup('users').where('email','==',...)
   and it was wrong twice over:

   1. A collection-group query needs a COLLECTION_GROUP-scoped index, and
      Firestore only auto-creates COLLECTION-scoped ones. The query would have
      thrown FAILED_PRECONDITION on the very first customer sign-in — and the
      lookup's own .catch() swallowed that into "no account found", so the
      endpoint would have walked into the CREATE branch and made a second
      account on every single request.

   2. It scanned every tenant's users and filtered by path prefix afterwards,
      which is both wasteful and one string-comparison bug away from reading
      across a tenant boundary.

   A pointer is a direct get(): no index, no cross-tenant scan, no prefix
   test. And create() on it is ATOMIC — two sign-ins racing on the same
   address cannot both win, so the duplicate-account race closes with it. */
function findOrCreate(db, org, email, caller) {
  var orgRef = db.collection('omega_orgs').doc(org);
  var ptrRef = orgRef.collection('customer_index').doc(email);

  return ptrRef.get().then(function (ptr) {
    if (!ptr.exists) return null;
    var cid = String((ptr.data() || {}).customerId || '');
    if (!cid) return null;
    var cRef = orgRef.collection('customers').doc(cid);
    return Promise.all([cRef.get(), cRef.collection('users').doc(email).get()])
      .then(function (r) {
        if (!r[0].exists) return null;          /* pointer to a deleted account */
        return { id: cid, data: r[0].data() || {},
                 user: r[1].exists ? (r[1].data() || {}) : {}, created: false };
      });
  }).then(function (found) {
    if (found) return found;

    /* First sign-in. Seed the company name from an order they already placed,
       so the account does not open empty for somebody who has been a customer
       for a month. */
    return db.collection('orders').where('orgId', '==', org)
      .where('customer.email', '==', email).limit(1).get()
      .then(function (s) { return s.empty ? null : (s.docs[0].data() || {}).customer || null; },
            function () { return null; })
      .then(function (fromOrder) {
        var cid = orgRef.collection('customers').doc().id;
        var now = new Date().toISOString();
        var cdoc = {
          orgId: org,
          name: clean(fromOrder && fromOrder.company, 160)
                || clean(fromOrder && fromOrder.name, 160) || email.split('@')[1],
          plan: 'free', status: 'active', source: 'self',
          terms: {}, agreements: [], hasOrders: !!fromOrder,
          createdAt: now
        };
        var udoc = {
          email: email, name: clean(fromOrder && fromOrder.name, 120),
          phone: clean(fromOrder && fromOrder.phone, 40),
          role: 'owner', uid: caller.uid, createdAt: now, lastSeenAt: now
        };

        /* create() — NOT set(). If a concurrent request got here first this
           rejects with ALREADY_EXISTS, and we re-read their pointer instead
           of writing a second account over the top of it. */
        return ptrRef.create({ customerId: cid, email: email, createdAt: now })
          .then(function () {
            return orgRef.collection('customers').doc(cid).set(cdoc)
              .then(function () {
                return orgRef.collection('customers').doc(cid)
                  .collection('users').doc(email).set(udoc);
              })
              .then(function () { return { id: cid, data: cdoc, user: udoc, created: true }; });
          }, function () {
            /* Lost the race. The winner's account is the real one. */
            return findOrCreate(db, org, email, caller);
          });
      });
  });
}

function countOrders(db, org, email) {
  return db.collection('orders').where('orgId', '==', org)
    .where('customer.email', '==', email).limit(50).get()
    .then(function (s) { return s.size; }, function () { return 0; });
}

module.exports = A.handler(function (req) {
  var method = req.method;
  if (method !== 'GET' && method !== 'POST') throw A.httpError(405, 'GET or POST only');

  return A.authenticate(req).then(function (caller) {
    var email = requireVerified(caller);
    var body = (method === 'POST' ? (req.body || {}) : {});
    /* SHAPE-CHECKED — see api/_lib/admin.js safeOrg(). This one matters
       most: an unvalidated org here reaches .doc() on a WRITE path. */
    var org = A.safeOrg((req.query && req.query.org) || body.org || '');
    if (!org) throw A.httpError(400, 'a valid org is required');

    /* Guarded so the 503 says something a customer can act on, rather than
       naming our environment variables. */
    if (typeof A.isDegraded === 'function' && A.isDegraded()) {
      throw A.httpError(503, 'Your account are temporarily unavailable. Please try again shortly.');
    }
    var db = A.db();
    var orgRef = db.collection('omega_orgs').doc(org);

    return findOrCreate(db, org, email, caller).then(function (acct) {
      if (method === 'GET') {
        /* Touch lastSeenAt; a failure here must never fail the read. */
        orgRef.collection('customers').doc(acct.id).collection('users').doc(email)
          .set({ lastSeenAt: new Date().toISOString(), uid: caller.uid }, { merge: true })
          ['catch'](function () {});
        return countOrders(db, org, email).then(function (n) {
          var out = project(acct.id, acct.data, acct.user, n);
          out.createdNow = acct.created;
          return out;
        });
      }

      /* POST — the customer editing their own details. Rebuilt from an
         allowlist: terms, plan, status, uid, source and customerId are not
         in it, so a client that sends them is simply not obeyed. */
      var cpatch = {}, upatch = {};
      /* ACCOUNT-LEVEL identity belongs to the account OWNER — that is what
         docs/CUSTOMER-PORTAL.md §2 says, and the first version did not
         enforce it: any colleague on a shared account could rename the
         company and move the delivery address. Dropped rather than refused,
         so the rest of a well-meant PATCH still applies. */
      var isOwner = String((acct.user && acct.user.role) || 'user') === 'owner' || caller.staff;
      if (isOwner) {
        if (body.company !== undefined) cpatch.name = clean(body.company, 160);
        if (body.address && typeof body.address === 'object') {
          cpatch.address = {
            line1: clean(body.address.line1, 200), city: clean(body.address.city, 100),
            state: clean(body.address.state, 40), zip: clean(body.address.zip, 20)
          };
        }
      }
      if (body.name !== undefined) upatch.name = clean(body.name, 120);
      if (body.phone !== undefined) upatch.phone = clean(body.phone, 40);

      if (!Object.keys(cpatch).length && !Object.keys(upatch).length) {
        throw A.httpError(400, 'Nothing to change.');
      }
      cpatch.updatedAt = new Date().toISOString();
      upatch.updatedAt = cpatch.updatedAt;

      var cref = orgRef.collection('customers').doc(acct.id);
      return cref.set(cpatch, { merge: true })
        .then(function () { return cref.collection('users').doc(email).set(upatch, { merge: true }); })
        .then(function () { return cref.get(); })
        .then(function (c) { return cref.collection('users').doc(email).get()
          .then(function (u) {
            return countOrders(db, org, email).then(function (n) {
              return project(acct.id, c.exists ? c.data() : {}, u.exists ? u.data() : {}, n);
            });
          }); });
    });
  })['catch'](function (e) {
    if (e && e.status) throw e;
    console.error('[my-account]', e);
    throw A.httpError(500, 'Something went wrong on our side. Please try again.');
  });
});
