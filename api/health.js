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
var EXPECTED = [
  'FIREBASE_SERVICE_ACCOUNT', 'FIREBASE_PROJECT_ID',
  'RESEND_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_MAPS_API_KEY',
  'REGRID_TOKEN', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET',
  'FINANCE_PORTAL_URL'
];

module.exports = A.handler(function (req) {
  if (req.method !== 'POST' && req.method !== 'GET') throw A.httpError(405, 'GET or POST');
  return A.authenticate(req).then(function (caller) {
    if (!caller.staff) throw A.httpError(403, 'ClearSky staff only');

    var env = {};
    EXPECTED.forEach(function (k) { env[k] = !!(process.env[k] && String(process.env[k]).trim()); });

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
