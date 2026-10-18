/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * GET /api/editor-v2-3d-tiles?u= — same-origin proxy for Google Photorealistic
 * 3D Tiles. The key stays in GOOGLE_MAP_TILES_API_KEY. Anything that is not
 * https://tile.googleapis.com is refused. A redirect is refused rather than
 * followed, because Location can carry the key.
 */
'use strict';
var https = require('https');
var T = require('./_lib/editor-v2-3d-tiles');

var MAX_JSON = 8 * 1024 * 1024;

function fail(res, code, text) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  res.end(text);
}

module.exports = function (req, res) {
  if (req.method !== 'GET') { fail(res, 405, 'GET only'); return; }
  var key = process.env.GOOGLE_MAP_TILES_API_KEY;
  key = key && String(key).trim();
  if (!key) { fail(res, 404, 'Photorealistic tiles are not configured.'); return; }
  var target = T.targetOf(req.url || '');
  if (!target) { fail(res, 400, 'That address is not a photorealistic tile.'); return; }
  var u = new URL(target);
  u.searchParams.set('key', key);
  var upstream = https.request({
    method: 'GET',
    hostname: u.hostname,
    path: u.pathname + u.search,
    headers: { 'User-Agent': 'omega-editor-v2-3d' }
  }, function (up) {
    if (T.isRedirect(up.statusCode)) {
      up.resume();
      fail(res, 502, 'The tile service redirected. The request was not followed.');
      return;
    }
    var type = String(up.headers['content-type'] || '');
    var json = /json/i.test(type) || /\.json$/i.test(u.pathname);
    if (!json) {
      res.statusCode = up.statusCode || 200;
      if (type) res.setHeader('Content-Type', type);
      res.setHeader('Cache-Control', 'private, max-age=300');
      up.pipe(res);
      return;
    }
    var chunks = [], size = 0, overflow = false;
    up.on('data', function (c) {
      size += c.length;
      if (size > MAX_JSON) { overflow = true; up.destroy(); return; }
      chunks.push(c);
    });
    up.on('end', function () {
      if (overflow) { fail(res, 502, 'The tileset was larger than this proxy accepts.'); return; }
      var text = Buffer.concat(chunks).toString('utf8');
      var out = T.rewrite(text, target, key);
      res.statusCode = up.statusCode || 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'private, max-age=60');
      res.end(out);
    });
  });
  upstream.on('error', function () {
    if (res.writableEnded || res.headersSent) return;
    fail(res, 502, 'The tile service did not answer.');
  });
  upstream.end();
};

module.exports.lib = T;
