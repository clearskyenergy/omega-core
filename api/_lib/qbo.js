/* api/_lib/qbo.js — QuickBooks Online plumbing shared by the endpoints.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   The original read-only policy was superseded by the owner's explicit
   QuickBooks invoice/payment-link workflow on 2026-09-20. Authorized
   customer + installment invoice writes live in qbo-sales.js. The accounting
   OAuth scope is read/write; the API authorization and immutable per-order
   commercial snapshot constrain its use. This module owns credentials,
   refresh serialization and queries only. No bank transfer API is called.

   ── WHERE TOKENS LIVE ──
   integrations/quickbooks, written only by the Admin SDK, which bypasses
   rules. The refresh token ROTATES on every use: Intuit returns a new one
   and invalidates the old, so whatever stores it must be the single writer.
   A browser copy would go stale the first time the server refreshed, and two
   writers racing a rotating credential is how an integration dies quietly at
   3am. The client never sees either token.

   ── TWO KINDS OF COMPANY (2026-09-24) ──
   Called WITHOUT an org, every export is exactly what it always was:
   ClearSky's ONE company, integrations/quickbooks, QBO_REDIRECT_URI and the
   original messages (logic-connect.js, qbo-sales.js, logic-office.js and
   scripts/intake-order.js depend on that).
   Called WITH an org, the same code serves a WORKSPACE's own QuickBooks
   company — a tenant-billed OEM that keeps its own books and asked Omega
   Logic to keep them in step (api/_lib/ledger-sync.js). Its tokens live at
   integrations/quickbooks_workspaces/orgs/{org} (Admin SDK only, like the
   ClearSky document), its OAuth redirect is QBO_WORKSPACE_REDIRECT_URI
   (api/ledger-connect.js) and its refresh lease is on its own document, so
   one workspace refreshing never serialises against another or against
   ClearSky. The two are never mixed: a workspace call cannot reach
   integrations/quickbooks, and ledger-connect refuses ClearSky's realm. */
'use strict';
var A = require('./admin');

var ENV = (process.env.QBO_ENV || 'production').toLowerCase();
var IS_SANDBOX = ENV === 'sandbox';

/* Intuit uses different hosts per environment and they are not interchangeable
   — a sandbox token against the production host authenticates and returns
   nothing, which reads as "no invoices" rather than as a misconfiguration. */
var API_BASE = IS_SANDBOX
  ? 'https://sandbox-quickbooks.api.intuit.com'
  : 'https://quickbooks.api.intuit.com';
var AUTH_URL  = 'https://appcenter.intuit.com/connect/oauth2';
var TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
var REVOKE_URL = 'https://developer.api.intuit.com/v2/oauth2/tokens/revoke';
var SCOPE     = 'com.intuit.quickbooks.accounting';
var DOC       = 'integrations/quickbooks';
var WS_ROOT   = 'integrations/quickbooks_workspaces/orgs';

/* A workspace document path. The org goes through A.safeOrg because .doc()
   takes multi-segment paths: an unvalidated org is a path-injection
   primitive, not merely a bad lookup (admin.js says why). */
function safe(org) {
  var s = A.safeOrg(org);
  if (!s) throw A.httpError(400, 'Valid org required');
  return s;
}
function docPath(org) { return org ? WS_ROOT + '/' + safe(org) : DOC; }

function cfg(org) {
  var id = process.env.QBO_CLIENT_ID, secret = process.env.QBO_CLIENT_SECRET;
  if (!id || !secret) {
    throw A.httpError(500, 'QBO_CLIENT_ID / QBO_CLIENT_SECRET are not set on this deployment');
  }
  return { id: id, secret: secret,
    redirect: org ? (process.env.QBO_WORKSPACE_REDIRECT_URI || '') : (process.env.QBO_REDIRECT_URI || '') };
}

function ref(org) { return A.db().doc(docPath(org)); }

function load(org) {
  return ref(org).get().then(function (s) { return s.exists ? s.data() : null; });
}

/* Intuit wants HTTP Basic with the app credentials on every token call. */
function basicAuth() {
  var c = cfg();
  return 'Basic ' + Buffer.from(c.id + ':' + c.secret).toString('base64');
}

function form(obj) {
  return Object.keys(obj).map(function (k) {
    return encodeURIComponent(k) + '=' + encodeURIComponent(obj[k]);
  }).join('&');
}

function tokenCall(body) {
  return fetch(TOKEN_URL, {
    method: 'POST',
    signal: AbortSignal.timeout(15000),
    headers: {
      'Authorization': basicAuth(),
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json'
    },
    body: form(body)
  }).then(function (r) {
    return r.json().then(function (j) {
      if (!r.ok) {
        throw A.httpError(r.status, 'Intuit token exchange failed: ' +
          (j.error_description || j.error || r.statusText));
      }
      return j;
    });
  });
}

/* Persists whatever Intuit just returned. expiresAt is absolute so a caller
   never has to remember when it was fetched, and refreshExpiresAt is kept
   because a refresh token that has not been used for 100 days is dead and the
   only cure is reconnecting — worth surfacing before somebody discovers it
   during a month-end close. A workspace document also carries its orgId, so
   the record says whose company it is without its path. */
function save(tok, realmId, extra, org) {
  var now = Date.now();
  var patch = {
    accessToken: tok.access_token,
    expiresAt: now + ((tok.expires_in || 3600) * 1000),
    tokenType: tok.token_type || 'bearer',
    env: ENV,
    updatedAt: now
  };
  if (tok.refresh_token) {
    patch.refreshToken = tok.refresh_token;
    patch.refreshExpiresAt = now + ((tok.x_refresh_token_expires_in || 8726400) * 1000);
  }
  if (realmId) patch.realmId = String(realmId);
  if (org) patch.orgId = safe(org);
  Object.keys(extra || {}).forEach(function (k) { patch[k] = extra[k]; });
  return ref(org).set(patch, { merge: true }).then(function () { return patch; });
}

/* Returns a usable access token, refreshing when it is close to expiry.
   Sixty seconds of slack, because a token that expires mid-request fails in a
   way that looks like a permissions problem. The refresh lease lives on the
   same document as the token it guards — ClearSky's or the workspace's. */
function accessToken(org) {
  var lease = require('crypto').randomBytes(16).toString('hex');
  return load(org).then(function (t) {
    if (!t || !t.refreshToken) throw A.httpError(409, org ? 'QuickBooks is not connected for this workspace' : 'QuickBooks is not connected');
    if (t.env !== ENV) throw A.httpError(409, 'QuickBooks environment mismatch; reconnect');
    if (t.refreshExpiresAt && Date.now() > t.refreshExpiresAt) {
      throw A.httpError(409, org ? 'QuickBooks refresh token expired — reconnect from the accounting page'
        : 'QuickBooks refresh token expired — reconnect from the admin console');
    }
    if (t.accessToken && t.expiresAt && Date.now() < (t.expiresAt - 60000)) {
      return { token: t.accessToken, realmId: t.realmId };
    }
    return A.db().runTransaction(async function (tx) {
      var snap = await tx.get(ref(org)), current = snap.data();
      if (current.expiresAt > Date.now() + 60000) return current;
      if (current.refreshLeaseUntil > Date.now()) throw A.httpError(503, 'QuickBooks token refresh in progress; retry');
      tx.update(ref(org), { refreshLease: lease, refreshLeaseUntil: Date.now() + 60000 });
      return current;
    }).then(function (current) {
      if (current.expiresAt > Date.now() + 60000) return { token: current.accessToken, realmId: current.realmId };
      return tokenCall({ grant_type: 'refresh_token', refresh_token: current.refreshToken })
      .then(function (fresh) {
        return save(fresh, current.realmId, { refreshLeaseUntil: 0 }, org).then(function (saved) {
          return { token: saved.accessToken, realmId: saved.realmId };
        });
      });
    });
  });
}

/* Read-only by construction: this helper only ever issues the query endpoint,
   which cannot mutate. Adding a POST path here is the change to argue about.
   (The workspace's writes go through request() below, and only ledger-sync
   calls it.) */
function query(sql, org) {
  return accessToken(org).then(function (a) {
    if (!a.realmId) throw A.httpError(409, 'No QuickBooks company (realmId) stored — reconnect');
    var url = API_BASE + '/v3/company/' + encodeURIComponent(a.realmId) +
              '/query?minorversion=70&query=' + encodeURIComponent(sql);
    return fetch(url, {
      headers: { 'Authorization': 'Bearer ' + a.token, 'Accept': 'application/json' }
    }).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) {
          var f = (j.Fault && j.Fault.Error && j.Fault.Error[0]) || {};
          throw A.httpError(r.status, 'QuickBooks: ' + (f.Message || f.Detail || r.statusText));
        }
        return j.QueryResponse || {};
      });
    });
  });
}

function authorizeUrl(state, org) {
  var c = cfg(org);
  return AUTH_URL + '?' + form({
    client_id: c.id,
    response_type: 'code',
    scope: SCOPE,
    redirect_uri: c.redirect,
    state: state
  });
}

/* A call against a WORKSPACE's own company — the only way ledger-sync
   reaches QuickBooks. The org is required: this helper never falls back to
   ClearSky's company (qbo-sales.js has its own request, pinned to ClearSky's
   realm, and stays that way). requestId is Intuit's idempotency key on a
   POST: the same id twice returns the first result instead of a second
   invoice. The Fault's first error code is kept on the error (6240 is
   "duplicate name"), so a caller can recover from the one it understands;
   the message never echoes Intuit's text, which can quote the customer. */
async function request(org, path, body, requestId) {
  if (!org) throw A.httpError(400, 'Valid org required');
  safe(org);
  var auth = await accessToken(org);
  if (!auth.realmId) throw A.httpError(409, 'No QuickBooks company (realmId) stored — reconnect');
  var url = API_BASE + '/v3/company/' + encodeURIComponent(auth.realmId) + '/' + path;
  url += (url.indexOf('?') < 0 ? '?' : '&') + 'minorversion=75';
  if (requestId) url += '&requestid=' + encodeURIComponent(requestId);
  var r = await fetch(url, { method: body ? 'POST' : 'GET', signal: AbortSignal.timeout(15000),
    headers: { Authorization: 'Bearer ' + auth.token, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined });
  var j = await r.json().catch(function () { return {}; });
  if (!r.ok || j.Fault) {
    var e = A.httpError(502, 'QuickBooks request failed (' + r.status + '); review the integration and retry');
    var f = j.Fault && j.Fault.Error && j.Fault.Error[0];
    if (f && f.code != null) e.code = String(f.code);
    throw e;
  }
  j.realmId = String(auth.realmId);
  return j;
}

/* Best-effort revocation of a WORKSPACE's refresh token when it disconnects.
   Never throws: disconnecting must always succeed on our side, and a token
   Intuit did not revoke dies unused in 100 days anyway. Without an org it
   does nothing — ClearSky's company is disconnected by a person, not by
   this helper. */
async function revoke(org) {
  try {
    if (!org) return false;
    var t = await load(org);
    if (!t || !t.refreshToken) return false;
    var r = await fetch(REVOKE_URL, { method: 'POST', signal: AbortSignal.timeout(15000),
      headers: { 'Authorization': basicAuth(), 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: t.refreshToken }) });
    return !!r.ok;
  } catch (e) { return false; }
}

module.exports = {
  ENV: ENV, IS_SANDBOX: IS_SANDBOX, DOC: DOC, WS_ROOT: WS_ROOT,
  cfg: cfg, load: load, save: save, tokenCall: tokenCall, docPath: docPath,
  accessToken: accessToken, query: query, authorizeUrl: authorizeUrl, API_BASE: API_BASE,
  request: request, revoke: revoke
};
