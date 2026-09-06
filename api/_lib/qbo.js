/* api/_lib/qbo.js — QuickBooks Online plumbing shared by the endpoints.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   ── PULL, NOT PUSH ──
   QuickBooks is the system of record. ClearSky already raises invoices and
   holds customer information there, so OMEGA reads status and never writes.
   That is a security decision before it is an architectural one: what OMEGA
   never stores, OMEGA cannot leak. No names, no addresses, no contact
   details — an invoice id, an amount, a status, a date, and a link back to
   QuickBooks for anything more.

   ⚠ INTUIT HAS NO READ-ONLY SCOPE. com.intuit.quickbooks.accounting is
   read/write and there is no narrower one to ask for. The protection is that
   nothing in this codebase calls a mutating endpoint — a discipline held
   here, not a guarantee from Intuit. Any future write path should be an
   argument, not a patch.

   ── WHERE TOKENS LIVE ──
   integrations/quickbooks, written only by the Admin SDK, which bypasses
   rules. The refresh token ROTATES on every use: Intuit returns a new one
   and invalidates the old, so whatever stores it must be the single writer.
   A browser copy would go stale the first time the server refreshed, and two
   writers racing a rotating credential is how an integration dies quietly at
   3am. The client never sees either token. */
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
var SCOPE     = 'com.intuit.quickbooks.accounting';
var DOC       = 'integrations/quickbooks';

function cfg() {
  var id = process.env.QBO_CLIENT_ID, secret = process.env.QBO_CLIENT_SECRET;
  if (!id || !secret) {
    throw A.httpError(500, 'QBO_CLIENT_ID / QBO_CLIENT_SECRET are not set on this deployment');
  }
  return { id: id, secret: secret, redirect: process.env.QBO_REDIRECT_URI || '' };
}

function ref() { return A.db().doc(DOC); }

function load() {
  return ref().get().then(function (s) { return s.exists ? s.data() : null; });
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
   during a month-end close. */
function save(tok, realmId, extra) {
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
  Object.keys(extra || {}).forEach(function (k) { patch[k] = extra[k]; });
  return ref().set(patch, { merge: true }).then(function () { return patch; });
}

/* Returns a usable access token, refreshing when it is close to expiry.
   Sixty seconds of slack, because a token that expires mid-request fails in a
   way that looks like a permissions problem. */
function accessToken() {
  return load().then(function (t) {
    if (!t || !t.refreshToken) throw A.httpError(409, 'QuickBooks is not connected');
    if (t.refreshExpiresAt && Date.now() > t.refreshExpiresAt) {
      throw A.httpError(409, 'QuickBooks refresh token expired — reconnect from the admin console');
    }
    if (t.accessToken && t.expiresAt && Date.now() < (t.expiresAt - 60000)) {
      return { token: t.accessToken, realmId: t.realmId };
    }
    return tokenCall({ grant_type: 'refresh_token', refresh_token: t.refreshToken })
      .then(function (fresh) {
        return save(fresh, t.realmId).then(function (saved) {
          return { token: saved.accessToken, realmId: saved.realmId };
        });
      });
  });
}

/* Read-only by construction: this helper only ever issues the query endpoint,
   which cannot mutate. Adding a POST path here is the change to argue about. */
function query(sql) {
  return accessToken().then(function (a) {
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

function authorizeUrl(state) {
  var c = cfg();
  return AUTH_URL + '?' + form({
    client_id: c.id,
    response_type: 'code',
    scope: SCOPE,
    redirect_uri: c.redirect,
    state: state
  });
}

module.exports = {
  ENV: ENV, IS_SANDBOX: IS_SANDBOX, DOC: DOC,
  cfg: cfg, load: load, save: save, tokenCall: tokenCall,
  accessToken: accessToken, query: query, authorizeUrl: authorizeUrl
};
