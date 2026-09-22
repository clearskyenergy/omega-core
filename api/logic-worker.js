/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var A = require('./_lib/admin'), W = require('./_lib/logic-workflow'), crypto = require('crypto');
/* The listing catalogue finishes its own map here: one geocoding pass per tick for the
   first workspace whose catalogue still has rows without a location (api/site-catalog.js
   finishMatching, the same code the staff button runs). Bounded so the orders above keep
   their share of the function's 60 s. */
var SC = require('./site-catalog')._helpers;
module.exports = A.handler(async function (req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') throw A.httpError(405, 'GET only');
  var secret = process.env.CRON_SECRET;
  var wanted = Buffer.from('Bearer ' + (secret || '')), got = Buffer.from(req.headers.authorization || '');
  if (!secret || got.length !== wanted.length || !crypto.timingSafeEqual(got, wanted)) throw A.httpError(401, 'Worker authorization required');
  var rows = await A.db().collection('orders').where('logic.nextRunAt', '<=', Date.now()).orderBy('logic.nextRunAt').limit(3).get();
  var results = await Promise.all(rows.docs.map(async function (s) { return { orderId: s.id, result: await W.processOrder(s.id) }; }));
  var catalogue = null;
  try { catalogue = await SC.matchNextCatalogue(A.db(), 25000); }
  catch (e) { catalogue = { error: String(e && e.message || e) }; }
  return { ok: true, results: results, catalogue: catalogue };
});
