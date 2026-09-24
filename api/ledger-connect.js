/* GET /api/ledger-connect — the OAuth / Connect callback for a WORKSPACE's
   own QuickBooks company or Stripe account (api/_lib/ledger-sync.js).
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   The flow starts ONLY from POST /api/logic-accounting {action:'sync-connect'},
   which checks that the caller is the workspace's admin (or the ClearSky
   owner), writes a one-time state document and sets a host-scoped cookie.
   This callback is authenticated by that state document plus the cookie —
   exactly as logic-connect.js does for ClearSky's own company — and takes
   the provider and the org from the state document, never from the query.
   The cookie is scoped to the redirect URI's host, so connecting must start
   on that host (the accounting page shows connectHost and says so).

   Not ClearSky's QuickBooks: that is /api/logic-connect and it stays as is. */
'use strict';
var A = require('./_lib/admin');

module.exports = A.handler(async function (req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' || !req.query.state) throw A.httpError(400, 'Start from the accounting page');
  var out = await require('./_lib/ledger-sync').finishConnect(req);
  res.setHeader('Set-Cookie', 'omega_ledger_state=; Path=/api/ledger-connect; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
  res.setHeader('Location', out.location); res.status(303).end();
});
