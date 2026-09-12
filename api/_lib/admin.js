/* ═══════════════════════════════════════════════════════════════════════════════
   ClearSky-OMEGA · shared server-side helpers for /api/*
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Every control-plane function does the same four things first:
     1. init firebase-admin once (Vercel keeps the module warm)
     2. verify the caller's Firebase ID token (Authorization: Bearer <token>)
     3. resolve the caller's orgId with the SAME alias fold the rules use
     4. decide whether the caller is ClearSky staff

   ENV (Vercel → Settings → Environment Variables; never committed):
     FIREBASE_SERVICE_ACCOUNT   JSON of the service account, as one line
     STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PORTAL_RETURN_URL
   ═══════════════════════════════════════════════════════════════════════════════ */
'use strict';
var admin = require('firebase-admin');

/* MUST match orgAlias() in firestore.rules and storage.rules. Three copies
   of one map is a known wart; core will expose one and the rules stay
   hand-mirrored because rules cannot import. */
var ORG_ALIAS = { 'fenecon.de': 'fenecon.com', 'fenecon.us': 'fenecon.com' };
var STAFF_DOMAINS = ['clearsky-usa.com', 'csebuilders.com'];

/* DEGRADED: no service account in the environment. A Firebase ID token can
   still be VERIFIED with nothing but the project id (the SDK checks it against
   Google's public keys), so identity holds; what is lost is Firestore, so
   db() refuses with a 503 that names the missing variable instead of every
   caller dying with a 500 "is not set". Measured 2026-09-11: production ran
   for weeks with the variable absent and every Admin-backed function was a
   500, discovered only when the site-map autopilot asked /api/parcel. */
var degraded = false;
function init() {
  if (admin.apps.length) return admin;
  var sa = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!sa) {
    degraded = true;
    console.error('[api] FIREBASE_SERVICE_ACCOUNT is not set — tokens verify, Firestore is unavailable');
    admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || 'clearsky-portal' });
    return admin;
  }
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(sa)) });
  return admin;
}
function isDegraded() { init(); return degraded; }
function db() {
  init();
  if (degraded) throw httpError(503, 'server has no Firestore credential (FIREBASE_SERVICE_ACCOUNT is not set)');
  return admin.firestore();
}

function orgOf(email) {
  var d = String(email || '').toLowerCase().split('@')[1] || '';
  return ORG_ALIAS[d] || d;
}
function isStaffEmail(email) { return STAFF_DOMAINS.indexOf(orgOf(email)) >= 0; }

/* Verify the bearer token; returns { uid, email, orgId, staff, claims }. */
function authenticate(req) {
  var h = req.headers.authorization || '';
  var m = /^Bearer (.+)$/.exec(h);
  if (!m) return Promise.reject(httpError(401, 'missing bearer token'));
  return init().auth().verifyIdToken(m[1]).then(function (dec) {
    var email = dec.email || '';
    return { uid: dec.uid, email: email, orgId: dec.orgId || orgOf(email), staff: isStaffEmail(email) || dec.role === 'staff', claims: dec };
  }).catch(function () { throw httpError(401, 'invalid token'); });
}

/* Is the caller entitled to act in `orgId`? Mirrors canActInOrg() in rules. */
function canActInOrg(caller, orgId) {
  if (caller.staff) return Promise.resolve(true);
  if (caller.orgId === orgId) return Promise.resolve(true);
  return db().collection('org_members').doc(String(caller.email).toLowerCase()).get().then(function (s) {
    return s.exists && s.data().active !== false && s.data().orgId === orgId;
  });
}

/* Tenant admin (owner/admin in omega_orgs/{org}/members) — or staff. */
function isTenantAdmin(caller, orgId) {
  if (caller.staff) return Promise.resolve(true);
  if (caller.orgId !== orgId) return Promise.resolve(false);
  return db().collection('omega_orgs').doc(orgId).collection('members').doc(caller.uid).get().then(function (s) {
    if (!s.exists) return false;
    var d = s.data();
    return d.status !== 'disabled' && (d.role === 'owner' || d.role === 'admin');
  });
}

/* Platform administrator — SkyFund's admin team. ClearSky's own domains and
   the 'staff' custom claim (as `caller.staff`), OR an active omega_staff
   record with role 'admin', so an administrator outside ClearSky's domains
   can be given the console without a deploy. Mirrors isOmegaAdmin() in the
   rules. Resolves a boolean; a missing Firestore credential resolves false
   rather than throwing, because a refusal is the safe answer. */
function isPlatformAdmin(caller) {
  if (caller.staff) return Promise.resolve(true);
  return Promise.resolve().then(function () {
    return db().collection('omega_staff').doc(caller.uid).get();
  }).then(function (s) {
    if (!s.exists) return false;
    var d = s.data();
    return d.active !== false && d.role === 'admin';
  }).catch(function () { return false; });
}

function billingOf(orgId) {
  return db().collection('omega_orgs').doc(orgId).collection('billing').doc('current').get()
    .then(function (s) { return s.exists ? s.data() : { tier: 'standard', addons: [], toolOverrides: {} }; });
}

function httpError(status, msg) { var e = new Error(msg); e.status = status; return e; }

/* Uniform handler wrapper: JSON in/out, CORS for the portal origins, errors → status. */
function handler(fn) {
  return function (req, res) {
    cors(req, res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    Promise.resolve().then(function () { return fn(req, res); })
      .then(function (out) { if (out !== undefined && !res.headersSent) res.status(200).json(out); })
      .catch(function (err) {
        var status = err.status || 500;
        if (status >= 500) console.error('[api]', err);
        if (!res.headersSent) res.status(status).json({ error: err.message || 'error' });
      });
  };
}
function cors(req, res) {
  var origin = req.headers.origin || '';
  if (/\.(clearskyomega|csebuilders)\.com$/.test(origin) || /localhost/.test(origin) || /\.vercel\.app$/.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Stripe-Signature');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
}

module.exports = { admin: admin, init: init, db: db, isDegraded: isDegraded, orgOf: orgOf, isStaffEmail: isStaffEmail, authenticate: authenticate,
  canActInOrg: canActInOrg, isTenantAdmin: isTenantAdmin, isPlatformAdmin: isPlatformAdmin, billingOf: billingOf, httpError: httpError, handler: handler,
  FieldValue: function () { return init().firestore.FieldValue; } };
