/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   GET /comed-proxy/<layer>/query?... -> ComEd's hosting-capacity service,
   with the Referer their gateway insists on. Same job as the Cloudflare
   worker's /comed route, on this origin, so the map keeps drawing when the
   worker is behind a service rotation (api/_lib/comed-service.js names the
   current service). Public map data: no sign-in, edge-cached for an hour,
   rate-limited per address so nobody makes ComEd's map our bill. */
'use strict';
var S = require('./_lib/comed-service'), E = require('./_lib/embed');

module.exports = async function (req, res) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return res.status(405).json({ error: 'GET only' }); }
  var q = req.query || {}, path = S.safePath(q.path);
  if (path === null) return res.status(404).json({ error: 'use /comed-proxy/<layer>/query?f=json&...' });
  try {
    var ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
    E.rateLimit('comed-proxy:' + ip, 240);
  } catch (e) { return res.status(e.status || 429).json({ error: e.message }); }
  try {
    var target = S.url(path, q), data = await S.fetchJson(target, 25000);
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json(data);
  } catch (e) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({ error: 'ComEd did not answer: ' + (e && e.message || e) });
  }
};
