#!/usr/bin/env node
/* Open the funding marketplace v2 preview and walk the two journeys.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   Serves the page and POST /api/funding-v2 from the real modules, on
   127.0.0.1 only. Nothing is written to fin_projects. */
'use strict';
var fs = require('fs'), path = require('path'), http = require('http');
var ROOT = path.join(__dirname, '..');
var D = require('./_lib/firestore-double');
D.mock('../api/_lib/admin', {
  httpError: function (s, m) { var e = new Error(m); e.status = s; return e; },
  handler: function (fn) { return fn; },
  authenticate: function () { return Promise.reject(new Error('missing bearer token')); },
  db: function () { throw new Error('no'); }
});
var handle = require('../api/funding-v2').handle;
var PW = process.env.PLAYWRIGHT || (function () { try { return require.resolve('playwright'); } catch (e) { return '/opt/node22/lib/node_modules/playwright'; } })();
var chromium; try { chromium = require(PW).chromium; } catch (e) { console.log('render-funding-v2: Playwright not found; skipped'); process.exit(0); }
var SANDBOX_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
var CHROME = process.env.CHROME || (fs.existsSync(SANDBOX_CHROME) ? SANDBOX_CHROME : chromium.executablePath());
var outDir = process.env.FUNDING_V2_SHOTS || path.join(ROOT, 'docs/screenshots/funding-v2');
fs.mkdirSync(outDir, { recursive: true });

var TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
var caller = { uid: 'preview', email: 'preview@clearsky-usa.com', staff: true };

function readBody(req) {
  return new Promise(function (resolve) {
    var buf = '';
    req.on('data', function (c) { buf += c; });
    req.on('end', function () { resolve(buf); });
  });
}
var server = http.createServer(function (req, res) {
  var url = req.url.split('?')[0];
  if (req.method === 'POST' && url === '/api/funding-v2') {
    return readBody(req).then(function (raw) {
      var body = {};
      try { body = JSON.parse(raw || '{}'); } catch (e) { res.writeHead(400); return res.end('{"error":"bad json"}'); }
      Promise.resolve(handle(body, caller, {}, {})).then(function (out) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(out));
      }, function (err) {
        res.writeHead(err.status || 500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message || 'error' }));
      });
    });
  }
  var rel = (url === '/' || url === '/funding-v2') ? '/funding-v2.html' : url;
  if (rel.indexOf('..') >= 0) { res.writeHead(400); return res.end(); }
  var file = path.join(ROOT, rel.replace(/^\//, ''));
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

function shot(page, name) {
  return page.screenshot({ path: path.join(outDir, name), fullPage: true });
}

(async function () {
  await new Promise(function (resolve) { server.listen(0, '127.0.0.1', resolve); });
  var base = 'http://127.0.0.1:' + server.address().port;
  var browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  var errors = [];
  try {
    var page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on('pageerror', function (e) { errors.push(String(e)); });
    await page.goto(base + '/funding-v2', { waitUntil: 'networkidle' });
    await page.waitForSelector('.bk-num');
    var banner = await page.locator('.banner').innerText();
    if (!/preview/i.test(banner) || !/live marketplace/i.test(banner)) throw new Error('banner: ' + banner);
    await page.getByRole('button', { name: 'missing the design' }).click();
    await page.waitForFunction(function () { return /Financiers cannot see this yet/.test(document.body.innerText) && /one-line/.test(document.body.innerText); });
    await shot(page, '01-developer-blocked.png');
    await page.getByRole('tab', { name: 'Reviewing' }).click();
    await page.waitForSelector('.deal');
    var names = await page.locator('.deal b').allInnerTexts();
    if (names.length !== 2) throw new Error('expected 2 listed deals, got ' + JSON.stringify(names));
    if (names.some(function (n) { return /not listed yet|missing the design/.test(n); })) throw new Error('a blocked package is on the financier list: ' + names.join(' | '));
    await shot(page, '02-financier-list.png');
    await page.locator('.deal').first().click();
    await page.waitForFunction(function () { return /value stack/i.test(document.body.innerText) && /risks on the record/i.test(document.body.innerText); });
    await shot(page, '03-deal-summary.png');
    var boxes = page.locator('#deal-list input[type="checkbox"]');
    await boxes.nth(0).check();
    await boxes.nth(1).check();
    await page.getByRole('button', { name: 'Compare selected' }).click();
    await page.waitForSelector('.bk-compare');
    var headers = await page.locator('.bk-compare tbody th').allInnerTexts();
    ['ROM', 'IRR', 'NPV', 'Payback', 'Readiness'].forEach(function (h) {
      if (headers.indexOf(h) < 0) throw new Error('compare is missing ' + h + ': ' + headers.join(','));
    });
    await shot(page, '04-compare.png');
    await page.getByRole('button', { name: 'Express interest' }).click();
    await page.waitForFunction(function () { return /live marketplace/.test(document.getElementById('action-note').textContent); });
    await page.locator('#ask-note').fill('Please send the executed interconnection agreement.');
    await page.getByRole('button', { name: 'Request info' }).click();
    await page.waitForFunction(function () { return /live marketplace/.test(document.getElementById('action-note').textContent); });
    await page.locator('#minIrr').fill('11');
    await page.locator('#minIrr').dispatchEvent('change');
    await page.waitForFunction(function () {
      var nodes = document.querySelectorAll('.deal b');
      return nodes.length === 1 && /complete package/.test(nodes[0].textContent);
    });
    await shot(page, '05-filtered.png');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('tab', { name: 'Submitting' }).click();
    await page.getByRole('button', { name: 'not listed yet' }).click();
    await page.waitForFunction(function () { return /The score is 74/.test(document.body.innerText); });
    await shot(page, '06-phone.png');
    if (errors.length) throw new Error(errors.join('\n'));
    console.log('render-funding-v2: walked both journeys, shots in ' + outDir);
  } finally {
    await browser.close();
    server.close();
  }
})().catch(function (err) { console.error(err); process.exit(1); });
