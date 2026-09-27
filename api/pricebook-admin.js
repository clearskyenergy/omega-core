/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * GET  /api/pricebook-admin                         status of the current book
 * POST /api/pricebook-admin {action:'bind'}         bind QuickBooks items by name
 * POST /api/pricebook-admin {action:'enable', expectedHash}
 * ClearSky staff only (a VERIFIED clearsky-usa.com token: caller.staff).
 * The rule is api/_lib/pricebook-enable.js, the same one the script runs:
 * this endpoint only lets staff run it with the deployment's own Firebase
 * and QuickBooks credentials, so turning the book on needs no key on a
 * laptop. Every action is written to admin_audit under ClearSky's org. */
'use strict';
var A = require('./_lib/admin'), E = require('./_lib/pricebook-enable');
module.exports = A.handler(async function (req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET' && req.method !== 'POST') throw A.httpError(405, 'GET or POST required');
  var caller = await A.authenticate(req);
  if (!caller.staff) throw A.httpError(403, 'ClearSky staff only');
  var db = A.db();
  if (req.method === 'GET') return E.status(db);
  var body = req.body || {};
  if (Object.keys(body).some(function (k) { return ['action', 'expectedHash'].indexOf(k) < 0; })) throw A.httpError(400, 'Unsupported field');
  var result;
  try {
    if (body.action === 'bind') result = await E.bind(db);
    else if (body.action === 'enable') result = await E.enable(db, true, String(body.expectedHash || ''));
    else throw A.httpError(400, 'action must be bind or enable');
  } catch (e) { if (!e.status || e.status >= 500) e.status = 409; throw e; }
  await db.collection('omega_orgs').doc('clearsky-usa.com').collection('admin_audit').add({
    action: 'pricebook-' + body.action, version: result.version, by: caller.email || caller.uid, at: Date.now(),
    now: body.action === 'enable' ? { enabled: true } : { items: Object.keys(result.items || {}).length } });
  return Object.assign({ ok: true }, result);
});
