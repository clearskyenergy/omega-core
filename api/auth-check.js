/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/auth-check — will Google sign somebody in through THIS host?
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   An Omega Logic app installed on an iPhone home screen signs in through its
   own host (config.js; vercel.json proxies /__/auth to firebaseapp.com).
   That works only once https://<host>/__/auth/handler is among the Google
   OAuth client's authorised redirect URIs — a Google Cloud Console setting,
   not code. Until then Google answers "Access blocked: redirect_uri_mismatch"
   and the person is stranded on Google's error page.

   So the sign-in page asks here first. This asks Firebase for the Google
   sign-in address for this host's handler, exactly as the handler itself
   would, and asks Google whether it accepts it: an error redirect means no.
   The page then offers email and password instead of Google's error, and
   Google comes back BY ITSELF the moment the redirect URI is registered —
   no second deploy.

   { google: true | false | null } and nothing else. null is "could not
   tell" (a timeout, Google down); the page treats it as "try Google", which
   is what it did before this existed. No input but the request's own host,
   which must be one of ours; the Google address is built here, never taken
   from the request. Cached per warm instance and at the edge, so a busy
   sign-in page does not become traffic to Google.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

/* the public Firebase web key from /config.js (public by design; the rules
   are the access control). scripts/test-auth-check.js keeps them equal. */
var WEB_KEY = 'AIzaSyABoM1lgOYUnd5ZadaoTMhYmA9cHa8Tyo0';
var OURS = /^([a-z0-9-]+\.)*(clearskyomega\.com|csebuilders\.com)$/;
var TTL = 5 * 60 * 1000, cache = {};

function hostOf(req) {
  var h = String((req.headers && (req.headers['x-forwarded-host'] || req.headers.host)) || '').toLowerCase().split(',')[0].trim().split(':')[0];
  return OURS.test(h) ? h : '';
}
function timed(ms) { var c = typeof AbortController === 'function' ? new AbortController() : null; if (c) setTimeout(function () { c.abort(); }, ms); return c ? c.signal : undefined; }

/* true: Google shows its sign-in; false: Google refuses this handler;
   null: could not tell */
async function googleAccepts(host, fetchFn) {
  var f = fetchFn || fetch, handler = 'https://' + host + '/__/auth/handler';
  try {
    var r = await f('https://identitytoolkit.googleapis.com/v1/accounts:createAuthUri?key=' + WEB_KEY, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Referer: 'https://' + host + '/' },
      body: JSON.stringify({ providerId: 'google.com', continueUri: handler }), signal: timed(4000) });
    var d = await r.json();
    if (!r.ok || !d || typeof d.authUri !== 'string') return /UNAUTHORIZED_DOMAIN|INVALID_CONTINUE_URI/.test(JSON.stringify(d && d.error || '')) ? false : null;
    if (d.authUri.indexOf('https://accounts.google.com/') !== 0) return null;
    var g = await f(d.authUri, { redirect: 'manual', signal: timed(4000) });
    var where = String((g.headers && g.headers.get && g.headers.get('location')) || '');
    if (/\/signin\/oauth\/error|redirect_uri_mismatch/.test(where)) return false;
    if (g.status >= 300 && g.status < 400 && where) return true;
    if (g.status === 200) { var body = String(await g.text()); return /redirect_uri_mismatch/.test(body) ? false : true; }
    return null;
  } catch (e) { return null; }
}

async function check(req, res, fetchFn, now) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method !== 'GET') { res.statusCode = 405; return res.end(JSON.stringify({ error: 'GET only' })); }
  var host = hostOf(req), t = now || Date.now(), out = { google: null };
  if (host) {
    var hit = cache[host];
    if (hit && t - hit.at < TTL) out.google = hit.google;
    else { out.google = await googleAccepts(host, fetchFn); if (out.google !== null) cache[host] = { at: t, google: out.google }; }
  }
  /* a "no" is re-asked soon, so Google returns within minutes of the
     console change; a "yes" can be kept longer */
  res.setHeader('Cache-Control', out.google === true ? 'public, max-age=60, s-maxage=600' : 'public, max-age=0, s-maxage=60');
  res.statusCode = 200; return res.end(JSON.stringify(out));
}

module.exports = function (req, res) { return check(req, res); };
module.exports.check = check;
module.exports.googleAccepts = googleAccepts;
module.exports.hostOf = hostOf;
module.exports.WEB_KEY = WEB_KEY;
module.exports._cache = cache;
