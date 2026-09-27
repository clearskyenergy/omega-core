/* ═══════════════════════════════════════════════════════════════════════════
   scripts/_lib/sales-client.js — talk to /api/sales and /api/growth with
   ClearSky's machine key, from a terminal
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Shared by scripts/sales-cli.js (the sales agent's and JARVIS's hands) and
   scripts/harvest-prospects.js. No dependencies: Node's own https.

   THE KEY is an agent key (api/_lib/agent-auth.js) minted by staff with
     node scripts/agent-key.js --org clearsky-usa.com --admin \
       --label "sales agent" --scopes growth:read,sales:read,sales:write --apply
   and kept OUT of every repository. Looked for, in order:
     $OMEGA_SALES_KEY
     $OMEGA_SALES_KEY_FILE
     ~/.config/omega/sales.key
     ~/jarvis/.jarvis/sales.key      (JARVIS keeps its secrets in .jarvis/, gitignored)
   It is never printed, logged or put in an error message.

   THE HOST is $OMEGA_HOST, else https://silmarillion.clearskyomega.com. A
   Vercel preview URL works the same way (every OMEGA host serves /api/).
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var fs = require('fs'), os = require('os'), path = require('path'), https = require('https'), http = require('http');

var HOST = (process.env.OMEGA_HOST || 'https://silmarillion.clearskyomega.com').replace(/\/+$/, '');
var KEY_FILES = [process.env.OMEGA_SALES_KEY_FILE, path.join(os.homedir(), '.config', 'omega', 'sales.key'), path.join(os.homedir(), 'jarvis', '.jarvis', 'sales.key')];

function key() {
  if (process.env.OMEGA_SALES_KEY) return process.env.OMEGA_SALES_KEY.trim();
  for (var i = 0; i < KEY_FILES.length; i++) {
    var f = KEY_FILES[i];
    if (!f) continue;
    try { var k = fs.readFileSync(f, 'utf8').trim(); if (k) return k; } catch (e) { /* next */ }
  }
  return '';
}
function where() { return KEY_FILES.filter(Boolean).join(', '); }

/* JSON in, JSON out; rejects with { status, message } on anything but 2xx */
function request(method, p, body) {
  var k = key();
  if (!k) return Promise.reject(Object.assign(new Error('no sales key: set OMEGA_SALES_KEY or put the key in one of ' + where()), { status: 0 }));
  var u = new URL(HOST + p), data = body == null ? null : Buffer.from(JSON.stringify(body));
  var lib = u.protocol === 'http:' ? http : https;
  return new Promise(function (resolve, reject) {
    var req = lib.request(u, { method: method, headers: Object.assign({ Authorization: 'Bearer ' + k, Accept: 'application/json' },
      data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {}), timeout: 60000 }, function (res) {
      var chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        var text = Buffer.concat(chunks).toString('utf8'), json = null;
        try { json = text ? JSON.parse(text) : null; } catch (e) { /* not JSON */ }
        if (res.statusCode >= 200 && res.statusCode < 300) return resolve(json);
        var msg = (json && json.error) || text.slice(0, 300) || ('HTTP ' + res.statusCode);
        reject(Object.assign(new Error(method + ' ' + p + ' → ' + res.statusCode + ': ' + msg), { status: res.statusCode }));
      });
    });
    req.on('timeout', function () { req.destroy(new Error('timed out after 60s: ' + method + ' ' + p)); });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}
function qs(o) {
  var parts = [];
  Object.keys(o || {}).forEach(function (k) { if (o[k] != null && o[k] !== '') parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(o[k])); });
  return parts.length ? '?' + parts.join('&') : '';
}
function chunks(list, n) { var out = []; for (var i = 0; i < list.length; i += n) out.push(list.slice(i, i + n)); return out; }

module.exports = {
  HOST: HOST, key: key, where: where, request: request, qs: qs, chunks: chunks,
  get: function (p, q) { return request('GET', p + qs(q)); },
  post: function (body) { return request('POST', '/api/sales', body); }
};
