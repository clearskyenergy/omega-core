/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/ring-session.js — where a Ring refresh token is allowed to live
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   THE PROBLEM THIS SOLVES.

   Ring hands back a refresh token that is good for months and mints access
   tokens on demand. It has to be kept somewhere. The obvious places are all
   wrong here:

     An environment variable   Ring may rotate the refresh token on every
                               exchange. An env var cannot rewrite itself, so
                               the first rotation silently breaks the
                               integration until a human notices.
     Firestore                 Needs a service-account key to write from a
                               function, and creating one on clearsky-portal
                               is refused by org policy
                               constraints/iam.disableServiceAccountKeyCreation.
     localStorage              Readable by any script on the page. A Ring
                               token opens live video into a house.

   So: an AES-256-GCM sealed, httpOnly, Secure cookie. The browser stores it
   and cannot read it — httpOnly keeps it away from every script on the page,
   and the ciphertext is meaningless without RING_COOKIE_SECRET, which only
   the server has. Rotation stops being a problem because the server re-seals
   the cookie on the response every time Ring hands back a new token, so the
   store updates itself on the same request that invalidated it.

   It is also per-person by construction. There is no shared credential to
   leak, and signing out of Ring is one Set-Cookie with an expiry in the past.

   WHAT IT IS NOT. Not durable against a user clearing their cookies — that
   means logging in to Ring again, which is a button. That is the price of
   not having a server-side secret store, and it is the right price here.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

var crypto = require('crypto');

var COOKIE = 'ring_rt';       /* the sealed refresh token */
var TMP = 'ring_pkce';        /* state + verifier, alive only for the round trip */

/* Cookies cap out at about 4KB. A sealed value past this is refused loudly
   rather than being written truncated — a cookie that is silently cut in half
   fails later, somewhere else, as "refresh rejected". */
var MAX = 3800;

function key() {
  var s = process.env.RING_COOKIE_SECRET;
  if (!s || s.length < 16) {
    var e = new Error('RING_COOKIE_SECRET is not set (needs 16+ chars)');
    e.status = 501; throw e;
  }
  /* A passphrase is not a key. Hash it to exactly 32 bytes for AES-256. */
  return crypto.createHash('sha256').update(s).digest();
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64url(s) {
  return Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

/* ── seal / unseal ──────────────────────────────────────────────────────── */
function seal(obj) {
  var iv = crypto.randomBytes(12);
  var c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  var body = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  /* iv | tag | ciphertext — the tag is what makes this tamper-evident rather
     than merely unreadable. */
  return b64url(Buffer.concat([iv, c.getAuthTag(), body]));
}

function unseal(s) {
  try {
    var raw = unb64url(s);
    if (raw.length < 29) return null;
    var d = crypto.createDecipheriv('aes-256-gcm', key(), raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    var out = Buffer.concat([d.update(raw.subarray(28)), d.final()]);
    return JSON.parse(out.toString('utf8'));
  } catch (_) {
    /* A wrong key, a tampered cookie and an old cookie from before a secret
       rotation are indistinguishable here, and all three mean the same thing:
       there is no usable session. Log in again. */
    return null;
  }
}

/* ── cookies ────────────────────────────────────────────────────────────── */
function read(req, name) {
  var h = (req.headers && req.headers.cookie) || '';
  var parts = h.split(';');
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i].trim();
    var eq = p.indexOf('=');
    if (eq > 0 && p.slice(0, eq) === name) return decodeURIComponent(p.slice(eq + 1));
  }
  return null;
}

function write(res, name, value, maxAge) {
  var bits = [
    name + '=' + encodeURIComponent(value),
    'Path=/',
    'HttpOnly',
    'Secure',
    /* Lax, not Strict: the Ring callback arrives as a top-level redirect from
       account.ring.com, and Strict would withhold the PKCE cookie on exactly
       the request that needs it. Lax sends it on a top-level GET, which is
       what this is, and still withholds it from cross-site POSTs and frames. */
    'SameSite=Lax',
    'Max-Age=' + maxAge
  ];
  var prev = res.getHeader('Set-Cookie');
  var list = prev ? (Array.isArray(prev) ? prev.slice() : [prev]) : [];
  list.push(bits.join('; '));
  res.setHeader('Set-Cookie', list);
}

function clear(res, name) { write(res, name, '', 0); }

/* ── the two things stored ──────────────────────────────────────────────── */

/* The refresh token. One year, because that is a ceiling and not a promise —
   Ring decides when it actually stops working. */
function putRefresh(res, refreshToken) {
  var sealed = seal({ rt: refreshToken, at: Date.now() });
  if (sealed.length > MAX) {
    var e = new Error('sealed Ring session too large for a cookie');
    e.status = 500; throw e;
  }
  write(res, COOKIE, sealed, 60 * 60 * 24 * 365);
}
function getRefresh(req) {
  var v = read(req, COOKIE);
  if (!v) return null;
  var o = unseal(v);
  return (o && o.rt) || null;
}
function clearRefresh(res) { clear(res, COOKIE); }

/* PKCE verifier + CSRF state. Ten minutes is longer than any human takes to
   get through a Ring login and short enough that a stale one is worthless. */
function putPkce(res, state, verifier) {
  write(res, TMP, seal({ s: state, v: verifier }), 600);
}
function takePkce(req, res) {
  var v = read(req, TMP);
  clear(res, TMP);                 /* single use, whatever happens next */
  return v ? unseal(v) : null;
}

/* ── PKCE itself ────────────────────────────────────────────────────────── */
function verifier() { return b64url(crypto.randomBytes(32)); }
function challenge(v) { return b64url(crypto.createHash('sha256').update(v).digest()); }
function state() { return b64url(crypto.randomBytes(16)); }

module.exports = {
  putRefresh: putRefresh, getRefresh: getRefresh, clearRefresh: clearRefresh,
  putPkce: putPkce, takePkce: takePkce,
  verifier: verifier, challenge: challenge, state: state,
  b64url: b64url
};
