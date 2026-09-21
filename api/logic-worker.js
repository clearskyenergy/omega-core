/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var A = require('./_lib/admin'), W = require('./_lib/logic-workflow'), crypto = require('crypto');
module.exports = A.handler(async function (req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') throw A.httpError(405, 'GET only');
  var secret = process.env.CRON_SECRET;
  var wanted = Buffer.from('Bearer ' + (secret || '')), got = Buffer.from(req.headers.authorization || '');
  if (!secret || got.length !== wanted.length || !crypto.timingSafeEqual(got, wanted)) throw A.httpError(401, 'Worker authorization required');
  var rows = await A.db().collection('orders').where('logic.nextRunAt', '<=', Date.now()).orderBy('logic.nextRunAt').limit(3).get();
  var results = await Promise.all(rows.docs.map(async function (s) { return { orderId: s.id, result: await W.processOrder(s.id) }; }));
  return { ok: true, results: results };
});
