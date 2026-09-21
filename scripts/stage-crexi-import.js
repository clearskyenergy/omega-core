/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Local, append-only intake for listing batches reviewed in the browser.
 * No credentials, remote fetches or database writes. Originals remain intact.
 */
'use strict';
var http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
var cache = path.join(__dirname, '.cache');
fs.mkdirSync(cache, {recursive:true});
var dir = fs.mkdtempSync(path.join(cache, 'omega-crexi-import-'));
var gate = crypto.randomBytes(24).toString('hex');
var port = 0, origin = '';
var server = http.createServer(function (req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.headers.host !== '127.0.0.1:' + port || req.url !== '/' + gate) { res.writeHead(404); return res.end(); }
  if (req.method === 'GET') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.end('<!doctype html><title>OMEGA listing intake</title><h1>Cook County listing staging — chileasing.com</h1><p>Append-only source backup. This does not publish or change starred sites.</p><label for="payload">Listing batch JSON</label><textarea id="payload" rows="12" style="width:95%"></textarea><button id="save">Save batch</button><pre id="result"></pre><script>document.getElementById("save").onclick=function(){fetch(location.pathname,{method:"POST",headers:{"Content-Type":"application/json"},body:document.getElementById("payload").value}).then(function(r){return r.text();}).then(function(t){document.getElementById("result").textContent=t;});};</script>');
  }
  if (req.method !== 'POST' || req.headers.origin !== origin) { res.writeHead(403); return res.end('Origin rejected'); }
  var chunks = [], bytes = 0;
  req.on('data', function (b) { bytes += b.length; if (bytes > 8e6) return req.destroy(); chunks.push(b); });
  req.on('end', function () {
    try {
      var raw = Buffer.concat(chunks), batch = JSON.parse(raw.toString('utf8'));
      if (batch.orgId !== 'chileasing.com' || !Array.isArray(batch.pages) || !batch.pages.length) throw new Error('Invalid batch');
      var count = 0;
      batch.pages.forEach(function (p) {
        if (!Number.isInteger(p.page) || p.page < 1 || p.page > 1000 || !Array.isArray(p.rows)) throw new Error('Invalid page');
        p.rows.forEach(function (r) {
          if (!r.url || !/^\/properties\/\d+\//.test(r.url) || typeof r.address !== 'string' || typeof r.text !== 'string') throw new Error('Invalid listing');
        });
        count += p.rows.length;
      });
      var file = path.join(dir, Date.now() + '-' + crypto.randomBytes(4).toString('hex') + '.json');
      fs.writeFileSync(file, raw, {flag:'wx',mode:384});
      res.end('Staged ' + count + ' listing rows across ' + batch.pages.length + ' pages. Source file: ' + file);
    } catch (e) { res.writeHead(400); res.end(e.message); }
  });
});
server.listen(port, '127.0.0.1', function () {
  port = server.address().port; origin = 'http://127.0.0.1:' + port;
  console.log(JSON.stringify({url:origin+'/'+gate,directory:dir}));
});
