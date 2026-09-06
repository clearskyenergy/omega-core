/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/verify-token.js — authenticate a caller WITHOUT a service account
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   WHY THIS EXISTS ALONGSIDE _lib/admin.js.

   admin.js is the right helper and every control-plane function uses it. It
   needs FIREBASE_SERVICE_ACCOUNT, and creating a service-account key on
   clearsky-portal is refused by the org policy
   constraints/iam.disableServiceAccountKeyCreation. Weakening that policy to
   ship one feature is the wrong trade, so this takes the other road.

   HOW IT WORKS, and why it is not a weaker check:

     1. A Firebase ID token is a normal RS256 JWT signed by Google. Its
        signing certificates are PUBLIC. Verifying the signature and the
        claims needs no secret of ours — a service account is for ACTING AS
        the project, not for reading what Google already published.

     2. Authorisation then goes through the Firestore REST API using THE
        CALLER'S OWN token, so firestore.rules decides what they may read.
        That is strictly better than an admin read: an admin credential
        bypasses every rule in the file, and this cannot. If the rules say a
        member may read their own billing record, that is exactly what
        happens and nothing more.

   WHAT IT DELIBERATELY CANNOT DO: write anything, read anything the caller
   could not read themselves, or mint a token. It answers "who is this, and
   what does their own billing record say" — which is all a gating function
   needs and the least authority that answers it.

   ⚠ THE PUBLIC KEYS ROTATE. They are cached until the max-age Google sends
   and re-fetched after that. A token whose kid is unknown is refused rather
   than trusted.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var crypto = require('crypto');

var PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'clearsky-portal';
var CERT_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

var ORG_ALIAS = { 'fenecon.de': 'fenecon.com', 'fenecon.us': 'fenecon.com' };
var STAFF_DOMAINS = ['clearsky-usa.com', 'csebuilders.com'];

function orgOf(email) {
  var d = String(email || '').toLowerCase().split('@')[1] || '';
  return ORG_ALIAS[d] || d;
}
function isStaffEmail(email) { return STAFF_DOMAINS.indexOf(orgOf(email)) >= 0; }

function httpError(status, message) {
  var e = new Error(message); e.status = status; return e;
}

var _certs = null, _certsExpire = 0;
function certs() {
  if (_certs && Date.now() < _certsExpire) return Promise.resolve(_certs);
  return fetch(CERT_URL).then(function (r) {
    if (!r.ok) throw httpError(503, 'could not fetch Google signing keys');
    /* Honour Google's own cache header rather than picking a number. */
    var cc = r.headers.get('cache-control') || '';
    var m = /max-age=(\d+)/.exec(cc);
    var ttl = m ? parseInt(m[1], 10) * 1000 : 3600000;
    return r.json().then(function (j) {
      _certs = j; _certsExpire = Date.now() + ttl;
      return j;
    });
  });
}

function b64urlToBuf(s) {
  return Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}
function b64urlToJson(s) {
  try { return JSON.parse(b64urlToBuf(s).toString('utf8')); } catch (e) { return null; }
}

/* Verify a Firebase ID token. Resolves { uid, email, orgId, staff, claims }. */
function verifyIdToken(token) {
  return Promise.resolve().then(function () {
    var parts = String(token || '').split('.');
    if (parts.length !== 3) throw httpError(401, 'malformed token');

    var head = b64urlToJson(parts[0]);
    var body = b64urlToJson(parts[1]);
    if (!head || !body) throw httpError(401, 'malformed token');
    if (head.alg !== 'RS256') throw httpError(401, 'unexpected token algorithm');
    if (!head.kid) throw httpError(401, 'token has no key id');

    return certs().then(function (keys) {
      var pem = keys[head.kid];
      /* An unknown kid is a refusal, never a pass. It means the token was not
         signed by a key Google is currently publishing. */
      if (!pem) throw httpError(401, 'token signed by an unknown key');

      var ok = crypto.createVerify('RSA-SHA256')
        .update(parts[0] + '.' + parts[1])
        .verify(pem, b64urlToBuf(parts[2]));
      if (!ok) throw httpError(401, 'token signature does not verify');

      /* Claims are checked AFTER the signature, so nothing in an unsigned
         payload can influence the decision. */
      var now = Math.floor(Date.now() / 1000);
      var skew = 60;
      if (body.aud !== PROJECT_ID) throw httpError(401, 'token is for another project');
      if (body.iss !== 'https://securetoken.google.com/' + PROJECT_ID)
        throw httpError(401, 'token has the wrong issuer');
      if (!body.sub) throw httpError(401, 'token has no subject');
      if (!(body.exp > now - skew)) throw httpError(401, 'token has expired');
      if (!(body.iat < now + skew)) throw httpError(401, 'token is not yet valid');

      var email = body.email || '';
      return {
        uid: body.sub,
        email: email,
        emailVerified: body.email_verified !== false,
        orgId: orgOf(email),
        staff: isStaffEmail(email),
        claims: body
      };
    });
  });
}

/* Read one Firestore document AS THE CALLER. The rules apply, so this can
   never return something they could not have read in the browser.
   Resolves the decoded fields, or null when the document does not exist. */
function readAsCaller(token, path) {
  var url = 'https://firestore.googleapis.com/v1/projects/' + PROJECT_ID +
            '/databases/(default)/documents/' + path;
  return fetch(url, { headers: { Authorization: 'Bearer ' + token } })
    .then(function (r) {
      if (r.status === 404) return null;
      if (r.status === 403) throw httpError(403, 'the rules refused that read');
      if (!r.ok) throw httpError(502, 'Firestore returned ' + r.status);
      return r.json().then(function (doc) { return decodeFields(doc && doc.fields); });
    });
}

/* Firestore REST wraps every value in a type tag. Only the types a billing
   record actually uses are handled; anything else comes back as null rather
   than a guess. */
function decodeValue(v) {
  if (!v || typeof v !== 'object') return null;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return ((v.arrayValue || {}).values || []).map(decodeValue);
  if ('mapValue' in v) return decodeFields((v.mapValue || {}).fields);
  return null;
}
function decodeFields(f) {
  if (!f) return {};
  var out = {};
  Object.keys(f).forEach(function (k) { out[k] = decodeValue(f[k]); });
  return out;
}

/* Authenticate, then read the caller's own billing record.
   Resolves { caller, tier, billing }. Tier falls back to 'trial' — a read
   that fails must not hand out a paid capability. */
function authenticateWithTier(req) {
  var h = (req.headers && req.headers.authorization) || '';
  var m = /^Bearer (.+)$/.exec(h);
  if (!m) return Promise.reject(httpError(401, 'missing bearer token'));
  var token = m[1];
  return verifyIdToken(token).then(function (caller) {
    if (!caller.orgId) throw httpError(403, 'that account has no organisation');
    return readAsCaller(token,
      'omega_orgs/' + encodeURIComponent(caller.orgId) + '/billing/current')
      .then(function (b) {
        return { caller: caller, billing: b || {}, tier: (b && b.tier) || 'trial' };
      })
      .catch(function () {
        return { caller: caller, billing: {}, tier: 'trial' };
      });
  });
}

module.exports = {
  PROJECT_ID: PROJECT_ID,
  orgOf: orgOf, isStaffEmail: isStaffEmail, httpError: httpError,
  verifyIdToken: verifyIdToken, readAsCaller: readAsCaller,
  authenticateWithTier: authenticateWithTier
};
