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
  ANTHROPIC_API_KEY:        'Jarvis in the editor and AI extraction, for every tenant without its own AI_KEY_<ORG>',
  REGRID_TOKEN:             'parcel lookup outside the county feeds (api/parcel falls back to county GIS)',
  STRIPE_SECRET_KEY:        'billing: checkout, customer portal, subscriptions',
  STRIPE_WEBHOOK_SECRET:    'billing events from Stripe (paid, cancelled) — the webhook rejects every event without it'
};
/* Read with a default that is right for production; listed so the dialog can
   say "using default" instead of "missing". Only GOOGLE_MAPS_API_KEY used to
   be listed and is read by no function — the Maps key is a browser key. */
/* A set key that cannot be right is reported as malformed — still a boolean,
   still never a value. This exists because a service-account variable once
   held the Vercel CLI's own banner text, pasted at the prompt. */
function shape(test, hint) { return { test: test, hint: hint }; }
var SHAPE = {
  FIREBASE_SERVICE_ACCOUNT: shape(function (v) {
    try { var j = JSON.parse(v); return !!(j && j.type === 'service_account' && j.private_key && j.client_email); } catch (e) { return false; }
  }, 'the JSON key file from Firebase › Project settings › Service accounts, as one line'),
  RESEND_API_KEY:        shape(function (v) { return /^re_[A-Za-z0-9_]+$/.test(v); }, 'a Resend key, which starts with re_'),
  GEMINI_API_KEY:        shape(function (v) { return /^AIza[0-9A-Za-z_-]{20,}$/.test(v); }, 'a Google AI key, which starts with AIza'),
  ANTHROPIC_API_KEY:     shape(function (v) { return /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(v); }, 'an Anthropic key, which starts with sk-ant-'),
  STRIPE_SECRET_KEY:     shape(function (v) { return /^(sk|rk)_(live|test)_[A-Za-z0-9]+$/.test(v); }, 'a Stripe secret key, which starts with sk_live_ or sk_test_'),
  STRIPE_WEBHOOK_SECRET: shape(function (v) { return /^whsec_[A-Za-z0-9]+$/.test(v); }, 'a Stripe webhook signing secret, which starts with whsec_')
};
var DEFAULTED = {
  FIREBASE_PROJECT_ID: 'clearsky-portal',
  FINANCE_PORTAL_URL:  'https://silmarillion.clearskyomega.com/finance'
};

module.exports = A.handler(function (req) {
  if (req.method !== 'POST' && req.method !== 'GET') throw A.httpError(405, 'GET or POST');
  return A.authenticate(req).then(function (caller) {
    if (!caller.staff) throw A.httpError(403, 'ClearSky staff only');

    var set = function (k) { return !!(process.env[k] && String(process.env[k]).trim()); };
    var env = {}, missing = [], defaulted = [], malformed = [];
    Object.keys(EXPECTED).forEach(function (k) {
      env[k] = set(k);
      if (!env[k]) missing.push({ name: k, blocks: EXPECTED[k] });
      else if (SHAPE[k] && !SHAPE[k].test(String(process.env[k]).trim())) malformed.push({ name: k, expects: SHAPE[k].hint });
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
        missing: missing,       /* [{name, blocks}]  — what each absent key stops */
        malformed: malformed,   /* [{name, expects}] — set, but cannot be the right thing */
        defaulted: defaulted,   /* [{name, value}]   — unset, running on the built-in value */
        degraded: degraded,
        degradedReason: typeof A.degradedReason === 'function' ? A.degradedReason() : null,
        firestore: fs.firestore,
        firestoreError: fs.error,
        /* The one sentence somebody can act on. */
        summary: fs.firestore === 'ok'
          ? 'Firestore is reachable. Anything failing is not a credential.'
          : (env.FIREBASE_SERVICE_ACCOUNT
              ? (degraded
                  ? 'FIREBASE_SERVICE_ACCOUNT is set but unusable: ' + (A.degradedReason ? A.degradedReason() : 'not a service-account key') + '. Replace it in Vercel and redeploy.'
                  : 'FIREBASE_SERVICE_ACCOUNT is set but Firestore did not answer: ' + (fs.error || 'unknown'))
              : 'FIREBASE_SERVICE_ACCOUNT is NOT set. Tokens verify, Firestore does not. '
                + 'Set it in the Vercel project environment and redeploy.'),
        checkedBy: caller.email || null
      };
    });
  });
});
