/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var A = require('./_lib/admin'), X = require('./_lib/logic-access'), Q = require('./_lib/qbo'), crypto = require('crypto');
module.exports = A.handler(async function (req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET' && req.query.code) {
    var state = String(req.query.state || ''), cookie = /(?:^|;\s*)omega_qbo_state=([^;]+)/.exec(req.headers.cookie || '');
    if (!/^[a-f0-9]{64}$/.test(state) || !cookie || cookie[1] !== state) throw A.httpError(403, 'OAuth state mismatch; start from Omega Logic');
    var ref = A.db().doc('integrations/quickbooks/oauth/' + state);
    await A.db().runTransaction(async function (tx) {
      var s = await tx.get(ref);
      if (!s.exists || s.data().used || s.data().expiresAt < Date.now()) throw A.httpError(403, 'OAuth request expired or already used');
      tx.update(ref, { used: true });
    });
    var realm = String(req.query.realmId || '');
    if (!/^\d+$/.test(realm)) throw A.httpError(400, 'Invalid QuickBooks company');
    var old = await Q.load();
    if (old && old.realmId && old.realmId !== realm) throw A.httpError(409, 'Different QuickBooks company. A controlled accounting migration is required; existing orders are pinned to ClearSky’s company.');
    var tok = await Q.tokenCall({ grant_type: 'authorization_code', code: req.query.code, redirect_uri: Q.cfg().redirect });
    await Q.save(tok, realm, { connectedAt: Date.now(), refreshLeaseUntil: 0 });
    res.setHeader('Set-Cookie', 'omega_qbo_state=; Path=/api/logic-connect; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
    res.setHeader('Location', '/omega-logic?connected=1'); res.status(303).end(); return;
  }
  var c = await A.authenticate(req); X.requireOwner(c);
  if (req.method === 'GET') {
    var data = await Q.load(); return { connected: !!(data && data.refreshToken), realmId: data && data.realmId || null, env: Q.ENV };
  }
  if (req.method !== 'POST') throw A.httpError(405, 'GET or POST only');
  if (!Q.cfg().redirect) throw A.httpError(503, 'Set QBO_REDIRECT_URI to this deployment’s /api/logic-connect');
  var state = crypto.randomBytes(32).toString('hex');
  await A.db().doc('integrations/quickbooks/oauth/' + state).create({ owner: c.uid, expiresAt: Date.now() + 600000, used: false });
  res.setHeader('Set-Cookie', 'omega_qbo_state=' + state + '; Path=/api/logic-connect; HttpOnly; Secure; SameSite=Lax; Max-Age=600');
  return { url: Q.authorizeUrl(state) };
});
