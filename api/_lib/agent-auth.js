/* ═══════════════════════════════════════════════════════════════════════════════
   api/_lib/agent-auth.js — who is this machine, and whose sites may it touch
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   WHY A SECOND CREDENTIAL EXISTS. Every /api function authenticates a PERSON
   with a Firebase ID token (see admin.js). A ChatGPT Action, a Zapier step or
   a partner's script has no person at the keyboard and no way to run the
   Google sign-in flow, so it needs a credential a machine can hold: a long
   random key, sent as `Authorization: Bearer omega_ak_…`.

   WHAT A KEY IS. A row in agent_keys/{sha256(key)}:
     orgId       the org the key acts AS — the same string firestore.rules
                 compares in orgsInvolved[] (ogisolar.com, not "OGI")
     label       who holds it ("CFA/OGI JV GPT"), for the audit line
     scopes      ['sites:read', 'sites:write']  — read is listing and KMZ;
                 write is creating and updating site records
     admin       true only for a ClearSky-held key; sees every deal
     active      false revokes it without deleting the audit trail
     expiresAt   ISO, optional
     createdBy, createdAt, lastUsedAt

   THE PLAINTEXT IS NEVER STORED. The document id is the SHA-256 of the key,
   so a Firestore export leaks nothing usable, and there is no "show key"
   button anywhere because there is nothing to show. Lost key → mint a new
   one with scripts/agent-key.js and revoke the old.

   NO BROWSER EVER READS agent_keys. firestore.rules denies the collection to
   every client; only the Admin SDK here can see it.

   SIGNED LINKS. A person reading a ChatGPT answer clicks a KMZ link with no
   header on it, so the link itself has to be the credential: an HMAC over
   (dealId, orgId, expiry) that /api/agent/kmz checks. The signing key is
   OMEGA_AGENT_LINK_SECRET, or — so this works the day it is deployed — a
   digest of the service account's private key, which is a secret Vercel
   already holds. Never the private key itself, never anything a client sees.
   ═══════════════════════════════════════════════════════════════════════════════ */
'use strict';
var crypto = require('crypto');
var A = require('./admin');

var KEY_PREFIX = 'omega_ak_';
var KEY_RE = /^omega_ak_[0-9a-f]{48}$/;
var SCOPES = ['sites:read', 'sites:write'];
var LINK_TTL_MS = 7 * 86400000;

function sha256hex(s) { return crypto.createHash('sha256').update(String(s)).digest('hex'); }

/* A new key: 24 random bytes, hex, behind a fixed prefix so a leaked one is
   recognisable in a log and secret scanners can be taught the shape. */
function mintKey() { return KEY_PREFIX + crypto.randomBytes(24).toString('hex'); }
function keyIdOf(key) { return sha256hex(key); }
function looksLikeKey(s) { return KEY_RE.test(String(s || '')); }

function normScopes(list) {
  return (Array.isArray(list) ? list : []).map(String).filter(function (s) { return SCOPES.indexOf(s) >= 0; });
}

/* Read the bearer key off the request; resolve it to a caller.
   Resolves { keyId, orgId, label, scopes, admin }. Rejects 401/403. */
function authenticate(req) {
  var h = (req.headers && req.headers.authorization) || '';
  var m = /^Bearer\s+(.+)$/i.exec(h.trim());
  if (!m) return Promise.reject(A.httpError(401, 'missing bearer key'));
  var key = m[1].trim();
  if (!looksLikeKey(key)) return Promise.reject(A.httpError(401, 'not an agent key'));
  var id = keyIdOf(key), db = A.db();
  return db.collection('agent_keys').doc(id).get().then(function (s) {
    if (!s.exists) throw A.httpError(401, 'unknown agent key');
    var d = s.data() || {};
    if (d.active === false) throw A.httpError(403, 'this agent key was revoked');
    if (d.expiresAt && Date.parse(d.expiresAt) < Date.now()) throw A.httpError(403, 'this agent key has expired');
    var orgId = String(d.orgId || '').toLowerCase();
    if (!orgId) throw A.httpError(403, 'this agent key names no org');
    var caller = { keyId: id, orgId: orgId, label: d.label || '', scopes: normScopes(d.scopes), admin: d.admin === true };
    /* A tenant that ClearSky suspended takes its agents with it. An org with
       no omega_orgs record (a JV member firm such as ogisolar.com, which
       signs in through the OSA workspace) is not suspended, it is simply not
       a tenant of its own — the key was minted by staff and that decides. */
    return db.collection('omega_orgs').doc(orgId).get().then(function (o) {
      if (o.exists) {
        var st = (o.data() || {}).status || 'active';
        if (st !== 'active') throw A.httpError(403, 'the tenant ' + orgId + ' is ' + st);
      }
      touch(db, id, d.lastUsedAt);
      return caller;
    });
  });
}

/* lastUsedAt, written at most once an hour so a chatty agent is not a
   write per call. Fire-and-forget: a failed timestamp is not a failed request. */
function touch(db, id, last) {
  var t = last ? Date.parse(last) : 0;
  if (t && Date.now() - t < 3600000) return;
  db.collection('agent_keys').doc(id).update({ lastUsedAt: new Date().toISOString() })
    .catch(function (e) { console.error('[agent-auth] lastUsedAt', e && e.message); });
}

function requireScope(caller, scope) {
  if (caller.scopes.indexOf(scope) < 0) throw A.httpError(403, 'this agent key lacks the ' + scope + ' scope');
  return caller;
}

/* ── signed download links ──────────────────────────────────────────────── */
var _linkSecret = null;
function linkSecret() {
  if (_linkSecret !== null) return _linkSecret;
  var s = process.env.OMEGA_AGENT_LINK_SECRET;
  if (s && String(s).trim()) { _linkSecret = String(s).trim(); return _linkSecret; }
  try {
    var sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '');
    if (sa && sa.private_key) { _linkSecret = sha256hex('omega-agent-link:' + sa.private_key); return _linkSecret; }
  } catch (e) { /* not JSON, or unset: no link secret */ }
  _linkSecret = '';
  return _linkSecret;
}
function sig(dealId, orgId, exp) {
  return crypto.createHmac('sha256', linkSecret()).update(dealId + '|' + orgId + '|' + exp).digest('hex').slice(0, 40);
}
/* { exp, sig } for a link, or null when no secret is configured. */
function signLink(dealId, orgId, ttlMs) {
  if (!linkSecret()) return null;
  var exp = Date.now() + (ttlMs || LINK_TTL_MS);
  return { exp: exp, sig: sig(String(dealId), String(orgId), exp) };
}
function verifyLink(dealId, orgId, exp, s) {
  if (!linkSecret()) return false;
  var n = Number(exp);
  if (!isFinite(n) || n < Date.now()) return false;
  var want = sig(String(dealId), String(orgId), n), got = String(s || '');
  if (want.length !== got.length) return false;
  return crypto.timingSafeEqual(Buffer.from(want), Buffer.from(got));
}

/* The host the caller reached, for absolute links in responses. Vercel puts
   the public host in x-forwarded-host; a bare `host` is the fallback. */
function baseUrl(req) {
  var h = (req.headers && (req.headers['x-forwarded-host'] || req.headers.host)) || 'silmarillion.clearskyomega.com';
  var proto = (req.headers && req.headers['x-forwarded-proto']) || 'https';
  return proto + '://' + String(h).split(',')[0].trim();
}

module.exports = {
  KEY_PREFIX: KEY_PREFIX, SCOPES: SCOPES, LINK_TTL_MS: LINK_TTL_MS,
  mintKey: mintKey, keyIdOf: keyIdOf, looksLikeKey: looksLikeKey, normScopes: normScopes,
  authenticate: authenticate, requireScope: requireScope,
  signLink: signLink, verifyLink: verifyLink, linkSecret: linkSecret, baseUrl: baseUrl,
  _setLinkSecretForTests: function (s) { _linkSecret = s; }
};
