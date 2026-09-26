/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Read-only signed-in projection. Uses caller-scoped REST reads, no Admin key.
 */
'use strict';
var V = require('./_lib/verify-token'), X = require('./_lib/package-access'), M = require('./_lib/modules');
module.exports = async function (req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'GET or POST required' });
  try {
    var ctx = await V.authenticateWithTier(req), caller = ctx.caller;
    if (req.query && req.query.orgId && req.query.orgId !== caller.orgId) throw V.httpError(403, 'Own organization required');
    if (req.method === 'POST') {
      if (!caller.staff) throw V.httpError(403, 'Staff preview only');
      var body = req.body || {};
      if (Object.keys(body).some(function (k) { return k !== 'previewModules'; })) throw V.httpError(400, 'Only previewModules is accepted');
      var modules = M.normalize(body.previewModules);
      var preview = X.project({ emailVerified: true }, { packaged: true, packagingState: 'paid', modules: modules }, { status: 'active' }, { role: 'owner' }, Date.now());
      preview.canPreview = true; preview.preview = true; preview.starters = M.starters();
      return res.status(200).json(preview);
    }
    if (!ctx.billing || ctx.billing.packaged !== true) return res.status(200).json({ packaged: false });
    var token = String(req.headers.authorization || '').replace(/^Bearer /, '');
    var root = 'omega_orgs/' + encodeURIComponent(caller.orgId);
    var rows = await Promise.all([V.readAsCaller(token, root), V.readAsCaller(token, root + '/members/' + encodeURIComponent(caller.uid))]);
    return res.status(200).json(X.project(caller, ctx.billing, rows[0], rows[1], Date.now()));
  } catch (e) { return res.status(e.status || 503).json({ error: e.status ? e.message : 'Package access is unavailable' }); }
};
