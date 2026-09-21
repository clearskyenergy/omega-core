/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   The event is a hint, never payment evidence. The worker rereads Intuit. */
'use strict';
var A = require('./_lib/admin'), crypto = require('crypto');
module.exports = A.handler(async function (req) {
  if (req.method !== 'POST') throw A.httpError(405, 'POST only');
  var secret = process.env.QBO_WEBHOOK_VERIFIER_TOKEN;
  if (!secret) throw A.httpError(503, 'QuickBooks webhook is not configured');
  var chunks = [], size = 0;
  for await (var chunk of req) { size += chunk.length; if (size > 1048576) throw A.httpError(413, 'Payload too large'); chunks.push(chunk); }
  var raw = Buffer.concat(chunks), expected = crypto.createHmac('sha256', secret).update(raw).digest();
  var received = Buffer.from(String(req.headers['intuit-signature'] || ''), 'base64');
  if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) throw A.httpError(401, 'Invalid Intuit signature');
  var data; try { data = JSON.parse(raw.toString('utf8')); } catch (e) { throw A.httpError(400, 'Invalid JSON'); }
  var root = A.db().doc('integrations/quickbooks'), s = await root.get(), realm = s.exists && s.data().realmId;
  var events = (data.eventNotifications || []).filter(function (e) { return String(e.realmId) === String(realm); });
  if (!events.length) return { ok: true, ignored: true };
  var hash = crypto.createHash('sha256').update(raw).digest('hex');
  await A.db().runTransaction(async function (tx) {
    var ref = root.collection('events').doc(hash), old = await tx.get(ref);
    if (old.exists) return;
    tx.create(ref, { receivedAt: Date.now(), realmId: realm, entities: events.map(function (e) { return (e.dataChangeEvent || {}).entities || []; }).flat() });
    tx.update(root, { webhookAt: Date.now() });
  });
  return { ok: true };
});
module.exports.config = { api: { bodyParser: false } };
