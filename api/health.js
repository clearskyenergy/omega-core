/* ═══════════════════════════════════════════════════════════════════════════════
   POST /api/health  —  which server-side configuration is actually present
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   WHY THIS EXISTS. "missing bearer token" comes back from every endpoint
   whether or not Firestore is reachable: a Firebase ID token verifies against
   Google's public keys with nothing but a project id, so an unauthenticated
   probe proves identity works and says nothing about the database. That is
   how this codebase once ran for weeks with FIREBASE_SERVICE_ACCOUNT unset
   and every Admin-backed function returning 500 — and how, more recently, a
   provisioning button failed with no way to tell a permission problem from a
   missing credential.

   NAMES AND BOOLEANS ONLY. Never a value, never a prefix, never a length —
   a key's length is a fingerprint and there is no version of "a little bit of
   the secret" that belongs in an HTTP response. Staff only on top of that.
   ═══════════════════════════════════════════════════════════════════════════════ */
'use strict';
var A = require('./_lib/admin');

/* Everything a function in this repo reads out of the environment. Listing a
   variable here is the whole registration — a missing one then reports as
   missing instead of surfacing later as a 500 nobody can place. */
var EXPECTED = {
  FIREBASE_SERVICE_ACCOUNT: 'every Admin-backed function: tenant signup and approval, provisioning, offers, deal rooms, invites',
  RESEND_API_KEY:           'every email the server sends: invites, password set-up links, deal-room referrals, validation reports',
  GEMINI_API_KEY:           'stencil generation (api/stencil)',
  REGRID_TOKEN:             'parcel lookup outside the county feeds (api/parcel falls back to county GIS)',
  STRIPE_SECRET_KEY:        'billing: checkout, customer portal, subscriptions',
  STRIPE_WEBHOOK_SECRET:    'billing events from Stripe (paid, cancelled) — the webhook rejects every event without it'
};
/* Read with a default that is right for production; listed so the dialog can
   say "using default" instead of "missing". Only GOOGLE_MAPS_API_KEY used to
   be listed and is read by no function — the Maps key is a browser key. */
var DEFAULTED = {
  FIREBASE_PROJECT_ID: 'clearsky-portal',
  FINANCE_PORTAL_URL:  'https://silmarillion.clearskyomega.com/finance'
};

module.exports = A.handler(function (req) {
  if (req.method !== 'POST' && req.method !== 'GET') throw A.httpError(405, 'GET or POST');
  return A.authenticate(req).then(function (caller) {
    if (!caller.staff) throw A.httpError(403, 'ClearSky staff only');

    var set = function (k) { return !!(process.env[k] && String(process.env[k]).trim()); };
    var env = {}, missing = [], defaulted = [];
    Object.keys(EXPECTED).forEach(function (k) {
      env[k] = set(k);
      if (!env[k]) missing.push({ name: k, blocks: EXPECTED[k] });
    });
    Object.keys(DEFAULTED).forEach(function (k) {
      env[k] = true;                       /* never "missing": it has a value either way */
      if (!set(k)) defaulted.push({ name: k, value: DEFAULTED[k] });
    });

    var degraded = typeof A.isDegraded === 'function' ? A.isDegraded() : null;

    /* Prove Firestore rather than infer it: a credential that parses but has
       no access looks identical to a healthy one until something reads. */
    var probe = Promise.resolve({ firestore: 'unknown', error: null });
    try {
      probe = A.db().collection('omega_orgs').limit(1).get()
        .then(function () { return { firestore: 'ok', error: null }; })
        .catch(function (e) { return { firestore: 'error', error: (e && e.message) || 'read failed' }; });
    } catch (e) {
      probe = Promise.resolve({ firestore: 'unavailable', error: (e && e.message) || 'db() threw' });
    }

    return probe.then(function (fs) {
      return {
        env: env,
        missing: missing,       /* [{name, blocks}] — what each absent key stops */
        defaulted: defaulted,   /* [{name, value}]  — unset, running on the built-in value */
        degraded: degraded,
        firestore: fs.firestore,
        firestoreError: fs.error,
        /* The one sentence somebody can act on. */
        summary: fs.firestore === 'ok'
          ? 'Firestore is reachable. Anything failing is not a credential.'
          : (env.FIREBASE_SERVICE_ACCOUNT
              ? 'FIREBASE_SERVICE_ACCOUNT is set but Firestore did not answer: ' + (fs.error || 'unknown')
              : 'FIREBASE_SERVICE_ACCOUNT is NOT set. Tokens verify, Firestore does not. '
                + 'Set it in the Vercel project environment and redeploy.'),
        checkedBy: caller.email || null
      };
    });
  });
});
