/* ═══════════════════════════════════════════════════════════════════════════
   api/ring.js — the only thing that is allowed to hold a Ring credential
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   WHY A PROXY AT ALL.

   Browser code is public. A Ring access token in a page is a token anyone
   who opens the page can lift, and it does not merely read data — it opens a
   live video session into a house. So the token lives here, in an environment
   variable, and the browser never sees one. The page asks this function for a
   path; this function decides whether to ask Ring.

   WHAT IT CHECKS, IN ORDER.

     1. The caller is a real signed-in Firebase user (RS256 signature against
        Google's published certs — see _lib/verify-token.js).
     2. That user is on the allowlist. These are ONE PERSON'S cameras, not a
        tenant feature, so the default is deny: a signed-in customer of the
        platform must not be able to reach them by guessing a URL.
     3. The path is one of ours. An open `?url=` proxy is an SSRF hole; this
        takes a PATH, forces the host, and refuses anything outside /v1/.

   THE TOKEN.

   Ring's OAuth access tokens last about four hours and are minted from a
   refresh token (POST https://oauth.ring.com/oauth/token). Two ways to
   configure it:

     RING_ACCESS_TOKEN     a token pasted from the developer playground.
                           Expires in 30 minutes. Good for proving the wiring
                           end to end, useless for anything unattended.

     RING_CLIENT_ID        the real path. A refresh token is exchanged for an
     RING_CLIENT_SECRET    access token, and the access token is cached in
     RING_REFRESH_TOKEN    module memory until shortly before it expires.

   ⚠ ONE HONEST LIMITATION. Ring may hand back a NEW refresh token on each
   exchange. This function keeps the new one in module memory, which survives
   for as long as the lambda stays warm and no longer. If Ring does rotate,
   a cold start after rotation will fail with 'refresh rejected' and the env
   var has to be updated. Fixing that properly needs somewhere durable to
   write the rotated token, which is a deliberate next step and not something
   to fake here — a credential store that silently loses the credential is
   worse than one that says so.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

var V = require('./_lib/verify-token.js');

var RING_HOST = 'https://api.amazonvision.com';
var OAUTH_URL = 'https://oauth.ring.com/oauth/token';

/* Staff by default. RING_ALLOWED_EMAILS widens it to named addresses — his
   personal Google account is not on a ClearSky domain, so without this the
   owner of the cameras cannot see his own cameras. */
function allowed(email) {
  var e = String(email || '').toLowerCase();
  if (!e) return false;
  var list = String(process.env.RING_ALLOWED_EMAILS || '')
    .toLowerCase().split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  if (list.indexOf(e) >= 0) return true;
  return list.length === 0 ? V.isStaffEmail(e) : false;
}

/* ── the access token ───────────────────────────────────────────────────── */
var _tok = null, _exp = 0, _refresh = null;

function accessToken() {
  var pasted = process.env.RING_ACCESS_TOKEN;
  if (pasted) return Promise.resolve(pasted);

  if (_tok && Date.now() < _exp) return Promise.resolve(_tok);

  var id = process.env.RING_CLIENT_ID,
      secret = process.env.RING_CLIENT_SECRET,
      refresh = _refresh || process.env.RING_REFRESH_TOKEN;
  if (!id || !secret || !refresh) {
    return Promise.reject(V.httpError(501,
      'Ring is not configured — set RING_ACCESS_TOKEN, or RING_CLIENT_ID + ' +
      'RING_CLIENT_SECRET + RING_REFRESH_TOKEN'));
  }

  var body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refresh,
    client_id: id,
    client_secret: secret
  }).toString();

  return fetch(OAUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body
  }).then(function (r) {
    return r.text().then(function (t) {
      if (!r.ok) throw V.httpError(502, 'refresh rejected (' + r.status + ') ' + t.slice(0, 200));
      var j = {};
      try { j = JSON.parse(t); } catch (_) { throw V.httpError(502, 'refresh returned non-JSON'); }
      if (!j.access_token) throw V.httpError(502, 'refresh returned no access_token');
      _tok = j.access_token;
      /* 60s of headroom: a token that expires mid-request is a failed request. */
      _exp = Date.now() + (Number(j.expires_in || 14400) - 60) * 1000;
      if (j.refresh_token) _refresh = j.refresh_token;   /* see the note up top */
      return _tok;
    });
  });
}

/* ── the path allowlist ─────────────────────────────────────────────────── */
/* A proxy that forwards an arbitrary URL is an SSRF hole with extra steps, so
   this takes a path, forces the host itself, and refuses anything that is not
   a Ring v1 read or an action we deliberately expose. */
var ALLOW = [
  /^\/v1\/devices(\?.*)?$/,
  /^\/v1\/devices\/[^/?]+(\?.*)?$/,
  /^\/v1\/devices\/[^/?]+\/(status|capabilities|location|configurations)(\?.*)?$/,
  /^\/v1\/devices\/[^/?]+\/media\/image\/download$/,
  /^\/v1\/devices\/[^/?]+\/media\/streaming\/whep\/sessions(\?.*)?$/,
  /^\/v1\/devices\/[^/?]+\/media\/streaming\/whep\/sessions\/[^/?]+$/,
  /^\/v1\/history\/devices\/[^/?]+\/events(\?.*)?$/,
  /^\/v1\/users\/me$/
];
function pathOk(p) {
  if (!p || p.charAt(0) !== '/' || p.indexOf('//') === 0) return false;
  if (p.indexOf('..') >= 0) return false;
  for (var i = 0; i < ALLOW.length; i++) if (ALLOW[i].test(p)) return true;
  return false;
}

function send(res, status, obj) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json(obj);
}

module.exports = async function handler(req, res) {
  try {
    /* ---- who ---------------------------------------------------------- */
    var h = (req.headers && req.headers.authorization) || '';
    var m = /^Bearer (.+)$/.exec(h);
    if (!m) return send(res, 401, { error: 'missing bearer token' });

    var caller;
    try { caller = await V.verifyIdToken(m[1]); }
    catch (e) { return send(res, e.status || 401, { error: e.message }); }

    if (!allowed(caller.email)) {
      /* Deliberately the same shape as any other refusal. Telling a stranger
         that the cameras exist and they are merely not on the list is more
         than they need to know. */
      return send(res, 403, { error: 'not authorised for this resource' });
    }

    /* ---- what --------------------------------------------------------- */
    var path = req.query && req.query.path;
    if (Array.isArray(path)) path = path[0];
    if (!pathOk(path)) return send(res, 400, { error: 'path not allowed' });

    var method = String(req.method || 'GET').toUpperCase();
    if (['GET', 'POST', 'DELETE'].indexOf(method) < 0) {
      return send(res, 405, { error: 'method not allowed' });
    }

    var token;
    try { token = await accessToken(); }
    catch (e) { return send(res, e.status || 500, { error: e.message }); }

    /* ---- the call ------------------------------------------------------ */
    var headers = { 'Authorization': 'Bearer ' + token, 'Accept': 'application/json' };
    var body;

    /* WHEP speaks SDP, not JSON. The browser sends us {sdp} as ordinary JSON
       — Vercel does not parse an application/sdp body, and a half-parsed body
       is a bug you find at 2am — and the conversion happens here. */
    var isWhep = /\/whep\/sessions(\?|$)/.test(path) && method === 'POST';
    if (isWhep) {
      var offer = req.body && (req.body.sdp || req.body.offer);
      if (!offer) return send(res, 400, { error: 'no sdp offer' });
      headers['Content-Type'] = 'application/sdp';
      headers['Accept'] = 'application/sdp';
      body = String(offer);
    } else if (method === 'POST') {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(req.body || {});
    }

    var r = await fetch(RING_HOST + path, { method: method, headers: headers, body: body });
    var ctype = r.headers.get('content-type') || '';

    /* WHEP answer: hand back the SDP AND the session URL from the Location
       header. Without the Location the page can open a stream it can never
       close, and a live view nobody closed is a camera left on. */
    if (isWhep) {
      var answer = await r.text();
      if (!r.ok) return send(res, r.status, { error: 'ring ' + r.status, detail: answer.slice(0, 300) });
      return send(res, 200, { sdp: answer, location: r.headers.get('location') || null });
    }

    /* A snapshot comes back as image bytes, not JSON. */
    if (/^image\//.test(ctype)) {
      var buf = Buffer.from(await r.arrayBuffer());
      if (!r.ok) return send(res, r.status, { error: 'ring ' + r.status });
      res.setHeader('Content-Type', ctype);
      res.setHeader('Cache-Control', 'private, max-age=20');
      return res.status(200).send(buf);
    }

    var text = await r.text();
    if (!r.ok) {
      return send(res, r.status, { error: 'ring ' + r.status, detail: text.slice(0, 400) });
    }
    if (!text) return send(res, 200, {});
    try { return send(res, 200, JSON.parse(text)); }
    catch (_) { return send(res, 200, { raw: text.slice(0, 4000) }); }

  } catch (e) {
    return send(res, 500, { error: 'proxy error' });
  }
};
