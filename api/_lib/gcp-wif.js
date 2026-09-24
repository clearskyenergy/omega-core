/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/gcp-wif.js — a Google Cloud access token from Vercel, WITHOUT a key
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   clearsky-portal refuses service-account keys (org policy
   constraints/iam.disableServiceAccountKeyCreation — see verify-token.js),
   and a long-lived key in a deploy environment is the thing that leaks
   anyway. So: Workload Identity Federation.

     1. Vercel signs a short-lived OIDC token for this deployment
        (x-vercel-oidc-token header at runtime; VERCEL_OIDC_TOKEN in env).
     2. Google STS trades it for a federated access token, against the
        pool/provider named in GCP_WIF_AUDIENCE.
     3. If GCP_WIF_SERVICE_ACCOUNT is set, that token impersonates the
        service account (iamcredentials generateAccessToken). If not, the
        federated principal is used directly — grant it roles/pubsub.publisher
        on the one topic and nothing else.

   Nothing here is a secret: the audience and the account name are
   identifiers. The trust lives in the pool provider's attribute condition,
   which must pin the Vercel team AND project (docs/EVENT-LAYER.md).
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

var STS = 'https://sts.googleapis.com/v1/token';
var SCOPE = 'https://www.googleapis.com/auth/cloud-platform';

var _tok = null, _exp = 0;

function httpError(status, message) { var e = new Error(message); e.status = status; return e; }

function configured() {
  return !!process.env.GCP_WIF_AUDIENCE;
}

function oidcFrom(req) {
  var h = (req && req.headers) || {};
  return h['x-vercel-oidc-token'] || process.env.VERCEL_OIDC_TOKEN || '';
}

function accessToken(req) {
  if (_tok && Date.now() < _exp - 60000) return Promise.resolve(_tok);
  if (!configured()) return Promise.reject(httpError(503, 'event layer: GCP_WIF_AUDIENCE is not set on this deployment'));
  var subject = oidcFrom(req);
  if (!subject) return Promise.reject(httpError(503, 'event layer: no Vercel OIDC token (enable OIDC federation on the project)'));
  return fetch(STS, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grantType: 'urn:ietf:params:oauth:grant-type:token-exchange',
      audience: process.env.GCP_WIF_AUDIENCE,
      scope: SCOPE,
      requestedTokenType: 'urn:ietf:params:oauth:token-type:access_token',
      subjectToken: subject,
      subjectTokenType: 'urn:ietf:params:oauth:token-type:jwt'
    })
  }).then(function (r) {
    return r.json().then(function (j) {
      if (!r.ok || !j.access_token) throw httpError(502, 'STS refused the Vercel token: ' + ((j && (j.error_description || j.error)) || r.status));
      return j;
    });
  }).then(function (fed) {
    var sa = process.env.GCP_WIF_SERVICE_ACCOUNT;
    if (!sa) return { token: fed.access_token, ttl: (fed.expires_in || 3600) * 1000 };
    return fetch('https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/' +
                 encodeURIComponent(sa) + ':generateAccessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + fed.access_token },
      body: JSON.stringify({ scope: [SCOPE], lifetime: '3600s' })
    }).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok || !j.accessToken) throw httpError(502, 'impersonation refused: ' + ((j && j.error && j.error.message) || r.status));
        return { token: j.accessToken, ttl: Date.parse(j.expireTime) - Date.now() };
      });
    });
  }).then(function (t) {
    _tok = t.token; _exp = Date.now() + (t.ttl > 0 ? t.ttl : 3000000);
    return _tok;
  });
}

/* Publish JSON messages to one topic. Resolves the message ids. */
function publish(req, topic, messages) {
  if (!messages.length) return Promise.resolve([]);
  return accessToken(req).then(function (tok) {
    return fetch('https://pubsub.googleapis.com/v1/' + topic + ':publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok },
      body: JSON.stringify({ messages: messages.map(function (m) {
        return { data: Buffer.from(JSON.stringify(m.data), 'utf8').toString('base64'),
                 attributes: m.attributes || {} };
      }) })
    });
  }).then(function (r) {
    return r.json().then(function (j) {
      if (!r.ok) {
        if (r.status === 401) { _tok = null; _exp = 0; }
        throw httpError(502, 'Pub/Sub publish failed: ' + ((j && j.error && j.error.message) || r.status));
      }
      return j.messageIds || [];
    });
  });
}

module.exports = { configured: configured, accessToken: accessToken, publish: publish };
