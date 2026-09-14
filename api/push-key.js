/* GET /api/push-key — the VAPID public key the browser subscribes with.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Public by design, the same class of thing as the Firebase web apiKey: it
   identifies the sender so the push service can verify our signature, and it
   can do nothing on its own. The PRIVATE half lives only in VAPID_PRIVATE_KEY
   and never leaves the server.

   Served rather than hardcoded in the page so the two halves cannot drift.
   A key baked into a static file keeps working until someone rotates the
   server's, and then every existing subscription fails at SEND time with a
   403 — long after the change, in a different system, to a user who did
   nothing wrong. One request removes that entire failure mode. */
'use strict';
var A = require('./_lib/admin');

module.exports = A.handler(function (req) {
  if (req.method !== 'GET') throw A.httpError(405, 'GET only');
  var key = process.env.VAPID_PUBLIC_KEY || '';
  if (!key) throw A.httpError(503, 'push is not configured on this deployment');
  return { key: key };
});
