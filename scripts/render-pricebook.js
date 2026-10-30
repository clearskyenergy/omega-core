#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   scripts/render-pricebook.js — the staff price book page, Seed then Enable.

   Boots the REAL admin/pricebook.html in Chromium with the Firebase compat
   SDK replaced by scripts/_lib/firebase-double.js (a signed-in, verified
   clearsky-usa.com address) and /api/pricebook-admin answered in its own
   shapes (api/_lib/pricebook-enable.js status / seed / enable). It holds
   that the page asks ON THE PAGE before it writes: on 2026-10-20 the page
   asked with window.confirm, the Claude app's browser pane answered that
   "no" without showing it, and Seed did nothing and said nothing. So:
     1. Seed asks on the page; Cancel writes nothing and says so;
     2. Seed it posts seed with the dry run's hash, and the page moves on to
        the stored book, Enable open on the Stripe rail;
     3. Enable asks; Turn it on posts enable with the book's hash, and the
        page says the book is on;
     4. no browser dialog is raised at any point, and no page error.

     node scripts/render-pricebook.js
     npm run check:pages */
'use strict';
var http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
var ROOT = path.join(__dirname, '..');
var PW = process.env.PLAYWRIGHT || (function () { try { return require.resolve('playwright'); } catch (e) { return '/opt/node22/lib/node_modules/playwright'; } })();
var chromium; try { chromium = require(PW).chromium; } catch (e) { console.log('render-pricebook: Playwright not found (' + PW + '); skipped'); process.exit(0); }
var SANDBOX_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
var CHROME = process.env.CHROME || (fs.existsSync(SANDBOX_CHROME) ? SANDBOX_CHROME : chromium.executablePath());
if (!fs.existsSync(CHROME)) { console.log('render-pricebook: Chromium not found (' + CHROME + '); skipped'); process.exit(0); }
var DOUBLE = fs.readFileSync(path.join(ROOT, 'scripts/_lib/firebase-double.js'), 'utf8');

var srv = http.createServer(function (req, res) {
  var file = path.resolve(ROOT, '.' + new URL(req.url, 'http://localhost').pathname);
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' })[path.extname(file)] || 'application/octet-stream');
  res.end(fs.readFileSync(file));
});

/* the server's answers, in pricebook-enable.js's shapes */
var stored = null, enabled = false, posts = [];
function status() {
  if (!stored) return { version: '2026-11', seeded: false, enabled: false, provider: 'stripe', mode: 'live', connection: null,
    seed: { dryRun: true, version: '2026-11', from: '2026-10', qboEnv: 'production', qboRealm: '9130000000000000', added: ['maximus'], repriced: [], expectedHash: 'hash-of-the-dry-run' } };
  return { version: '2026-11', seeded: true, enabled: enabled, frozen: false, used: false, provider: 'stripe', mode: 'live', bookEnv: 'production', bookRealm: '9130000000000000',
    connection: null, items: { total: 0, bound: 0, missing: [] }, expectedHash: 'hash-of-the-stored-book' };
}

var n = 0;
function check(cond, msg) { assert.ok(cond, msg); n++; }

(async function () {
  await new Promise(function (r) { srv.listen(0, '127.0.0.1', r); });
  var base = 'http://127.0.0.1:' + srv.address().port;
  var browser = await chromium.launch({ executablePath: CHROME });
  try {
    var ctx = await browser.newContext({ viewport: { width: 900, height: 900 } });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, function (r) {
      if (/gstatic\.com\/firebasejs/.test(r.request().url())) return r.fulfill({ status: 200, contentType: 'text/javascript', body: '' });
      return r.fulfill({ status: 200, contentType: 'text/css', body: '' });
    });
    await ctx.route('**/api/pricebook-admin', function (r) {
      var req = r.request();
      if (req.method() === 'GET') return r.fulfill({ json: status() });
      var body = req.postDataJSON(); posts.push(body);
      if (body.action === 'seed') { if (body.expectedHash !== 'hash-of-the-dry-run') return r.fulfill({ status: 409, json: { error: 'Review the current dry run and supply its hash' } }); stored = true; return r.fulfill({ json: { ok: true, version: '2026-11', seeded: true } }); }
      if (body.action === 'enable') { if (body.expectedHash !== 'hash-of-the-stored-book') return r.fulfill({ status: 409, json: { error: 'Review the current dry run and supply its --expected-hash' } }); enabled = true; return r.fulfill({ json: { ok: true, version: '2026-11', enabled: true } }); }
      return r.fulfill({ status: 400, json: { error: 'action must be seed, bind or enable' } });
    });
    await ctx.addInitScript(DOUBLE);
    await ctx.addInitScript(function () {
      var d = window.FirebaseDouble.install(window, { user: { uid: 'u-staff', email: 'staff@clearsky-usa.com', displayName: 'Staff', emailVerified: true }, docs: {}, latency: 5 });
      if (d.auth.currentUser) d.auth.currentUser.getIdToken = function () { return Promise.resolve('tok-staff'); };
    });
    var p = await ctx.newPage(), errors = [], dialogs = [];
    p.on('pageerror', function (e) { errors.push(e.message); });
    p.on('dialog', function (d) { dialogs.push(d.type() + ': ' + d.message()); d.dismiss(); });
    await p.goto(base + '/admin/pricebook.html', { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(function () { var b = document.getElementById('seed'); return b && !b.disabled; }, null, { timeout: 15000 });
    /* the OMEGA mark holds the page until it is known (at most 4 s) */
    await p.waitForFunction(function () { return !document.documentElement.classList.contains('omega-loading'); }, null, { timeout: 10000 });
    check(/not stored yet/.test(await p.innerText('#state')) && /maximus/.test(await p.innerText('#state')), 'the page shows the book not stored yet, and what it adds');

    /* 1. Seed asks on the page; Cancel writes nothing */
    await p.click('#seed');
    await p.waitForSelector('#ask');
    check(/Seed price book 2026-11, switched off\? It adds: maximus\./.test(await p.innerText('#ask')), 'Seed asks on the page what it will write');
    await p.click('#ask-no');
    check(/Cancelled\. Nothing was written\./.test(await p.innerText('#msg')) && posts.length === 0, 'Cancel writes nothing and says so');

    /* 2. Seed it posts the dry run's hash; the page moves on to the stored book */
    await p.click('#seed');
    await p.click('#ask-yes');
    await p.waitForFunction(function () { var b = document.getElementById('enable'); return /Seeded\. Now enable it\./.test(document.getElementById('msg').innerText) && b && !b.disabled; }, null, { timeout: 10000 });
    check(posts.length === 1 && posts[0].action === 'seed' && posts[0].expectedHash === 'hash-of-the-dry-run', 'Seed it posts seed with the dry run\'s hash: ' + JSON.stringify(posts));
    check(await p.$eval('#seed', function (b) { return b.disabled; }), 'a stored book cannot be seeded again');

    /* 3. Enable asks; Turn it on posts enable with the book's hash */
    await p.click('#enable');
    await p.waitForSelector('#ask');
    check(/Turn on price book 2026-11\? Signup and billing will start charging from it\./.test(await p.innerText('#ask')), 'Enable asks on the page');
    await p.click('#ask-yes');
    await p.waitForFunction(function () { return /The price book is on/.test(document.getElementById('msg').innerText); }, null, { timeout: 10000 });
    check(posts.length === 2 && posts[1].action === 'enable' && posts[1].expectedHash === 'hash-of-the-stored-book', 'Turn it on posts enable with the stored book\'s hash: ' + JSON.stringify(posts));
    check(await p.$eval('#enable', function (b) { return b.disabled; }), 'an enabled book cannot be enabled again');

    /* 4. never a browser popup, never a page error */
    check(dialogs.length === 0, 'no browser dialog was raised: ' + dialogs.join(' | '));
    check(errors.length === 0, 'no page error: ' + errors.join(' | '));
    check(!/\b(confirm|alert|prompt)\s*\(/.test(fs.readFileSync(path.join(ROOT, 'admin/pricebook.html'), 'utf8')), 'the page source calls no confirm, alert or prompt');
    console.log('render-pricebook: ' + n + ' checks passed');
  } finally { await browser.close(); srv.close(); }
})().catch(function (e) { console.error(e && e.stack || e); process.exit(1); });
