#!/usr/bin/env node
/* ===========================================================================
   scripts/steward/client.js - how the steward holds credentials and calls
   /api/, and what it refuses to do with them.
   (c) 2025-2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   "GIVE IT ACCESS TO ALL OUR APIS" IS A DESIGN DECISION, NOT A SETTING

   The obvious reading is a service-account key with admin rights. That is the
   wrong shape here for three separate reasons, and the repo already knows all
   three:

     1. api/_lib/verify-token.js exists precisely because creating a
        service-account key on clearsky-portal is refused by the org policy
        constraints/iam.disableServiceAccountKeyCreation. Weakening that policy
        so a bot can run nightly is a bad trade.

     2. An admin credential bypasses firestore.rules entirely. CLAUDE.md says
        the rules ARE the security boundary. A steward that runs outside the
        boundary it exists to protect cannot be reasoned about, and its mistakes
        are unbounded.

     3. A daily agent needs to read almost everything and write almost nothing.
        Those are very different grants.

   SO: the steward signs in as an ordinary Firebase user.

   It is a real, revocable account in a staff domain (csebuilders.com or
   clearsky-usa.com, so isStaffEmail() is true). It gets an ID token from the
   Firebase Auth REST API with an email and password held in the environment.
   Every /api/ call carries that token, so every endpoint applies exactly the
   checks it applies to a person, and every Firestore read it can reach goes
   through the same rules a person's would. Revoking it is disabling one user.

   THE RAILS, which are the actual answer to "access to all the APIs":

     - Only endpoints marked stewardSafe in api-registry.js are callable on a
       schedule. That list is hand-reviewed, read-only, and short. Everything
       else refuses here, before the network, and says so.
     - Writes need OMEGA_STEWARD_ALLOW_WRITES=1 AND an explicit endpoint
       argument. A cron job never sets that.
     - A call budget per run, so a loop cannot turn into a bill.
     - The token is never logged, never written to a file, and responses are
       scrubbed of anything key-shaped before they are printed or stored.
     - No credential at all is a supported state. The probe still runs: its
       most valuable check - does every endpoint refuse an anonymous caller -
       needs no identity by definition.

   ENVIRONMENT (set in GitHub Actions secrets or a local shell; never committed)

     OMEGA_API_BASE            https://silmarillion.clearskyomega.com
     FIREBASE_WEB_API_KEY      the public web API key (public by design)
     OMEGA_STEWARD_EMAIL       steward@csebuilders.com
     OMEGA_STEWARD_PASSWORD    that account's password
     OMEGA_STEWARD_ID_TOKEN    alternative: a token for one run, no password
     OMEGA_STEWARD_ALLOW_WRITES  '1' to permit a non-safe endpoint, by hand
     OMEGA_STEWARD_MAX_CALLS   default 60

     node scripts/steward/client.js --whoami
     node scripts/steward/client.js --call health
     node scripts/steward/client.js --call network-proximity --body '{"lat":41.8,"lng":-87.6}'
   =========================================================================== */
'use strict';

var reg = require('./api-registry');

var BASE = (process.env.OMEGA_API_BASE || 'https://silmarillion.clearskyomega.com').replace(/\/+$/, '');
var MAX_CALLS = parseInt(process.env.OMEGA_STEWARD_MAX_CALLS || '60', 10);
var TIMEOUT_MS = 25000;

var calls = 0;
var cachedToken = null;

/* -- scrubbing ---------------------------------------------------------------
   Everything this file prints or hands to the report goes through here first.
   An endpoint that echoes its own configuration back on error is a normal
   thing to write and a bad thing to paste into a GitHub issue. */
var SECRET_SHAPES = [
  /sk-ant-[A-Za-z0-9_-]{20,}/g,
  /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}/g,
  /\bwhsec_[A-Za-z0-9]{16,}/g,
  /\bre_[A-Za-z0-9_]{16,}/g,
  /\bAIza[0-9A-Za-z_-]{30,}/g,
  /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g   /* any JWT */
];
function scrub(value) {
  var s = typeof value === 'string' ? value : JSON.stringify(value);
  if (s == null) return s;
  SECRET_SHAPES.forEach(function (re) { s = s.replace(re, '[redacted]'); });
  if (typeof value === 'string') return s;
  try { return JSON.parse(s); } catch (e) { return s; }
}

/* -- identity ---------------------------------------------------------------- */

function haveCredentials() {
  return !!(process.env.OMEGA_STEWARD_ID_TOKEN ||
    (process.env.FIREBASE_WEB_API_KEY && process.env.OMEGA_STEWARD_EMAIL && process.env.OMEGA_STEWARD_PASSWORD));
}

function token() {
  if (cachedToken) return Promise.resolve(cachedToken);
  if (process.env.OMEGA_STEWARD_ID_TOKEN) {
    cachedToken = String(process.env.OMEGA_STEWARD_ID_TOKEN).trim();
    return Promise.resolve(cachedToken);
  }
  var key = process.env.FIREBASE_WEB_API_KEY;
  var email = process.env.OMEGA_STEWARD_EMAIL;
  var pass = process.env.OMEGA_STEWARD_PASSWORD;
  if (!key || !email || !pass) {
    return Promise.reject(new Error(
      'no steward credential. Set OMEGA_STEWARD_EMAIL + OMEGA_STEWARD_PASSWORD + FIREBASE_WEB_API_KEY, ' +
      'or OMEGA_STEWARD_ID_TOKEN for a single run. See scripts/steward/README.md.'));
  }
  /* The Firebase Auth REST endpoint. Same exchange the browser does at
     sign-in; no service account, nothing minted, nothing elevated. */
  var url = 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=' + encodeURIComponent(key);
  return withTimeout(fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email, password: pass, returnSecureToken: true })
  })).then(function (r) {
    return r.json().then(function (j) {
      if (!r.ok || !j.idToken) {
        var why = (j && j.error && j.error.message) || ('HTTP ' + r.status);
        throw new Error('steward sign-in failed: ' + why);
      }
      cachedToken = j.idToken;
      return cachedToken;
    });
  });
}

function withTimeout(promise) {
  var timer;
  return Promise.race([
    promise,
    new Promise(function (_, reject) {
      timer = setTimeout(function () { reject(new Error('timed out after ' + TIMEOUT_MS + 'ms')); }, TIMEOUT_MS);
    })
  ]).then(function (v) { clearTimeout(timer); return v; },
    function (e) { clearTimeout(timer); throw e; });
}

/* -- calling ----------------------------------------------------------------- */

function endpoint(id) {
  var found = reg.registry().filter(function (e) { return e.id === id; })[0];
  if (!found) throw new Error('no such endpoint: ' + id);
  return found;
}

/* The gate. Everything about "which APIs may this agent use" is here, in one
   function, so it can be read in one sitting. */
function permitted(e, opts) {
  opts = opts || {};
  if (e.stewardSafe) return null;
  if (opts.allowWrites && process.env.OMEGA_STEWARD_ALLOW_WRITES === '1') return null;
  return e.path + ' is not on the steward-safe list in api-registry.js' +
    (e.writes ? ' (it writes, sends mail or moves money)' : '') +
    '. A scheduled run may not call it. To call it by hand, pass --allow-writes ' +
    'and set OMEGA_STEWARD_ALLOW_WRITES=1, having decided that is what you want.';
}

/* An anonymous call, on purpose: used by probe.js to prove an endpoint refuses
   a caller with no token. Never sends a credential, so it cannot leak one. */
function callAnonymous(id, opts) {
  opts = opts || {};
  var e = endpoint(id);
  if (++calls > MAX_CALLS) return Promise.reject(new Error('call budget of ' + MAX_CALLS + ' exhausted'));
  var method = opts.method || (e.methods.indexOf('GET') >= 0 ? 'GET' : 'POST');
  var init = { method: method, headers: { 'Content-Type': 'application/json' } };
  if (method !== 'GET' && method !== 'HEAD') init.body = JSON.stringify(opts.body || {});
  return withTimeout(fetch(BASE + e.path, init))
    .then(function (r) {
      return r.text().then(function (t) {
        return { status: r.status, ok: r.ok, body: scrub(t).slice(0, 600) };
      });
    })
    .catch(function (err) { return { status: 0, ok: false, error: scrub(String(err.message || err)) }; });
}

function call(id, opts) {
  opts = opts || {};
  var e = endpoint(id);
  var refusal = permitted(e, opts);
  if (refusal) return Promise.reject(new Error(refusal));
  if (++calls > MAX_CALLS) return Promise.reject(new Error('call budget of ' + MAX_CALLS + ' exhausted'));

  return token().then(function (tok) {
    var method = opts.method || (e.methods.indexOf('GET') >= 0 ? 'GET' : 'POST');
    var url = BASE + e.path + (opts.query ? '?' + opts.query : '');
    var init = {
      method: method,
      headers: { 'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json' }
    };
    if (method !== 'GET' && method !== 'HEAD') init.body = JSON.stringify(opts.body || {});
    return withTimeout(fetch(url, init)).then(function (r) {
      return r.text().then(function (t) {
        var parsed; try { parsed = JSON.parse(t); } catch (x) { parsed = t; }
        return { status: r.status, ok: r.ok, body: scrub(parsed) };
      });
    });
  });
}

/* -- cli --------------------------------------------------------------------- */

function arg(name) {
  var i = process.argv.indexOf(name);
  return i >= 0 ? (process.argv[i + 1] || true) : null;
}

function main() {
  var whoami = process.argv.indexOf('--whoami') >= 0;
  var id = arg('--call');

  if (whoami) {
    if (!haveCredentials()) {
      console.log('steward identity: NONE configured.');
      console.log('  Anonymous checks still run. Set OMEGA_STEWARD_EMAIL, OMEGA_STEWARD_PASSWORD');
      console.log('  and FIREBASE_WEB_API_KEY to let it read /api/health and the scoring endpoints.');
      return 0;
    }
    return token().then(function (tok) {
      /* Decode the payload only - no verification here, the server does that.
         Printed fields are identity, never the token. */
      var body = {};
      try { body = JSON.parse(Buffer.from(tok.split('.')[1], 'base64').toString('utf8')); } catch (e) {}
      console.log('steward identity');
      console.log('  email     ' + (body.email || '(unknown)'));
      console.log('  uid       ' + (body.user_id || body.sub || '(unknown)'));
      console.log('  expires   ' + (body.exp ? new Date(body.exp * 1000).toISOString() : '(unknown)'));
      console.log('  base      ' + BASE);
      console.log('  may call  ' + Object.keys(reg.STEWARD_SAFE).join(', '));
      return 0;
    }).catch(function (e) { console.error('  ' + e.message); return 1; });
  }

  if (id) {
    var bodyArg = arg('--body');
    var opts = { allowWrites: process.argv.indexOf('--allow-writes') >= 0 };
    if (typeof bodyArg === 'string') { try { opts.body = JSON.parse(bodyArg); } catch (e) { console.error('--body is not JSON'); return 1; } }
    return call(id, opts).then(function (r) {
      console.log(r.status + (r.ok ? ' ok' : ' error'));
      console.log(typeof r.body === 'string' ? r.body : JSON.stringify(r.body, null, 2));
      return r.ok ? 0 : 1;
    }).catch(function (e) { console.error(e.message); return 1; });
  }

  console.log('usage: client.js --whoami | --call <endpoint> [--body JSON] [--allow-writes]');
  return 0;
}

if (require.main === module) {
  Promise.resolve(main()).then(function (code) { process.exit(code); });
}
module.exports = {
  call: call, callAnonymous: callAnonymous, token: token,
  haveCredentials: haveCredentials, scrub: scrub, base: function () { return BASE; }
};
