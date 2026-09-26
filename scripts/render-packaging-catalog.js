#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Read-only quote evidence, NOT a second product menu or the admin panel.
 * All values are computed in /api/ before Chromium receives the document.
 */
'use strict';
var fs = require('fs'), path = require('path'), http = require('http');
var M = require('../api/_lib/modules'), B = require('../api/_lib/pricebook'), P = require('../api/_lib/subscription-pricing');
var chromium = require(process.env.PLAYWRIGHT || 'playwright').chromium;
var dir = path.join(__dirname, '../docs/screenshots/packaging-phase-1');
var quotes = { lite: P.quote(['lite'], B.proposed()), field: P.quote(M.starters().ev, B.proposed()) };
function escape(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); }
function page(key, theme) {
  var q = quotes[key];
  return '<!doctype html><html lang="en"><meta charset="utf-8"><title>OMEGA · server quote evidence</title>' +
    '<style>body{margin:0;padding:48px;background:' + (theme === 'dark' ? '#111b27;color:#e5edf5' : '#edf2f7;color:#182635') + ';font:16px system-ui}main{max-width:950px;margin:auto}small{opacity:.7}h1{font-size:32px}h2{font-size:36px;color:' + (theme === 'dark' ? '#80c5ff' : '#195ba4') + '}table{border-collapse:collapse;width:100%;margin:30px 0}td,th{text-align:left;padding:18px 0;border-bottom:1px solid #8795a344}td:last-child,th:last-child{text-align:right}aside{padding:22px;border:1px solid #8795a344;border-radius:12px;line-height:1.7}</style>' +
    '<main><small>OMEGA · PHASE 1 VERIFICATION FIXTURE · ' + escape(q.pricebookVersion) + '</small><h1>' + (key === 'lite' ? 'Lite' : 'Field · EV installer') + '</h1><h2>' + escape(q.display.monthly) + '</h2>' +
    '<p>' + q.modules.map(function (k) { return escape(M.get(k).name); }).join(' · ') + '</p><table><thead><tr><th>Server invoice preview</th><th>Monthly amount</th></tr></thead><tbody>' +
    q.lines.map(function (l) { return '<tr><td>' + escape(l.name) + '</td><td>' + escape(P.money(l.amountCents)) + '</td></tr>'; }).join('') +
    '</tbody></table><aside>Annual service fee: ' + escape(q.display.serviceFee) + '<br>Annual prepay: ' + escape(q.display.annualBeforeCredit) +
    '<br>QuickBooks: sandbox only · no invoice created</aside><p><small>This is server quote evidence, not the customer menu. Editor access gates and the admin panel ship in later phases. No live account data is used.</small></p></main></html>';
}
var server = http.createServer(function (req, res) {
  var m = /^\/(lite|field)\/(light|dark)$/.exec(req.url);
  if (!m) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(page(m[1], m[2]));
});
async function main() {
  fs.mkdirSync(dir, { recursive: true });
  await new Promise(function (resolve) { server.listen(0, '127.0.0.1', resolve); });
  var base = 'http://127.0.0.1:' + server.address().port;
  var browser = await chromium.launch({ executablePath: process.env.CHROME || chromium.executablePath() });
  try {
    for (var key of ['lite', 'field']) for (var theme of ['light', 'dark']) {
      var p = await browser.newPage({ viewport: { width: 1280, height: 900 }, colorScheme: theme });
      await p.route('**/*', function (route) { return route.request().url().indexOf(base + '/') === 0 ? route.continue() : route.abort(); });
      await p.goto(base + '/' + key + '/' + theme);
      if (await p.locator('h2').textContent() !== quotes[key].display.monthly) throw new Error('Server quote did not render');
      await p.screenshot({ path: path.join(dir, key + '-' + theme + '-quote.png'), fullPage: true }); await p.close();
    }
    console.log('Packaging server quotes: 4 captures passed (Lite/Field, light/dark). Not editor acceptance.');
  } finally { await browser.close(); }
}
main().catch(function (e) { console.error(e); process.exitCode = 1; }).finally(function () { server.close(); });
