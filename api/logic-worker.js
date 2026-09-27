/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var A = require('./_lib/admin'), W = require('./_lib/logic-workflow'), crypto = require('crypto');
/* The listing catalogue finishes its own map here: one geocoding pass per tick for the
   first workspace whose catalogue still has rows without a location (api/site-catalog.js
   finishMatching, the same code the staff button runs); once nothing is left to place,
   one circuit-attribution pass, reading each matched listing's serving circuit and its
   hosting capacity off ComEd so the app can sort a county by available kW. Bounded so
   the orders above keep their share of the function's 60 s. */
var SC = require('./site-catalog')._helpers;
module.exports = A.handler(async function (req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') throw A.httpError(405, 'GET only');
  var secret = process.env.CRON_SECRET;
  var wanted = Buffer.from('Bearer ' + (secret || '')), got = Buffer.from(req.headers.authorization || '');
  if (!secret || got.length !== wanted.length || !crypto.timingSafeEqual(got, wanted)) throw A.httpError(401, 'Worker authorization required');
  var rows = await A.db().collection('orders').where('logic.nextRunAt', '<=', Date.now()).orderBy('logic.nextRunAt').limit(3).get();
  var results = await Promise.all(rows.docs.map(async function (s) { return { orderId: s.id, result: await W.processOrder(s.id) }; }));
  var packaging = await require('./_lib/package-billing-runner').tick(A.db(), Date.now());
  var catalogue = null;
  try { if (packaging.disabled || packaging.busy || !packaging.results || !packaging.results.length) catalogue = await SC.matchNextCatalogue(A.db(), 25000) || await SC.attributeNextCatalogue(A.db(), 25000); }
  catch (e) { catalogue = { error: String(e && e.message || e) }; }
  return { ok: true, results: results, catalogue: catalogue, packaging: packaging };
});
