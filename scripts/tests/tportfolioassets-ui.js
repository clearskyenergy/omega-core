/* scripts/tests/tportfolioassets-ui.js — T33: Portfolio & Assets in a real
   browser at 320 / 390 / 768 / 1440 CSS px. © 2025–2026 ClearSky Energy
   Solutions LLC.

   Serves the repository statically, answers /api/portfolio-assets with the
   REAL gateway over the in-memory store (_portfolio-fakes.js) loaded with the
   synthetic WB1, and stubs only Firebase/SSO/splash (a signed-in owner) —
   so what is exercised is the page plus the real API logic, not a mock UI.
   Needs playwright-core and a Chrome; without them it prints SKIP:
     PLAYWRIGHT_CORE=/path/to/node_modules/playwright-core CHROME=/usr/bin/google-chrome \
     node scripts/tests/tportfolioassets-ui.js [screenshot-dir] */
'use strict';
var path = require('path'), fs = require('fs'), http = require('http'), assert = require('assert');
var pw; try { pw = require(process.env.PLAYWRIGHT_CORE || 'playwright-core'); } catch (e) { console.log('SKIP T33: playwright-core not installed (set PLAYWRIGHT_CORE)'); process.exit(0); }
var CHROME = process.env.CHROME || '/usr/bin/google-chrome';
if (!fs.existsSync(CHROME)) { console.log('SKIP T33: no Chrome at ' + CHROME); process.exit(0); }
var ROOT = path.join(__dirname, '..', '..'), SHOTS = process.argv[2] || null;
var H = require('./_portfolio-fakes'), F = require('../fixtures/evcs-wb1-synthetic');
var ORG = 'evcs-fixture.com';
var h = H.harness({ users: { owner: { uid: 'u1', email: 'owner@' + ORG, orgId: ORG, staff: false } }, members: { ['omega_orgs/' + ORG + '/members/u1']: { role: 'owner', status: 'active' } }, billing: { [ORG]: { toolOverrides: { 'portfolio-assets': true } } } });
var FIREBASE_STUB = 'window.firebase={initializeApp:function(){},apps:[1],firestore:function(){return{}},auth:function(){return{onAuthStateChanged:function(cb){setTimeout(function(){cb({email:"owner@' + ORG + '",getIdToken:function(){return Promise.resolve("owner")}})},0)}}}};';
var TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.css': 'text/css' };
var server = http.createServer(function (req, res) {
  var u = new URL(req.url, 'http://x'), p = decodeURIComponent(u.pathname);
  if (p === '/api/portfolio-assets') {
    var chunks = []; req.on('data', function (c) { chunks.push(c); }); req.on('end', function () {
      var tok = (req.headers.authorization || '').replace('Bearer ', ''), q = {}; u.searchParams.forEach(function (v, k) { q[k] = v; });
      var call = req.method === 'GET' ? h.get(tok, q) : h.post(tok, JSON.parse(Buffer.concat(chunks).toString() || '{}'));
      call.then(function (r) { Object.keys(r.headers).forEach(function (k) { res.setHeader(k, r.headers[k]); }); if (r.body !== null && r.raw === undefined) { res.setHeader('content-type', 'application/json'); res.statusCode = r.statusCode; res.end(JSON.stringify(r.body)); } else { res.statusCode = r.statusCode; res.end(r.raw); } });
    }); return;
  }
  if (/^\/(omega-sso|omega-tenant|omega-brand|omega-splash|config)\.js$/.test(p)) { res.setHeader('content-type', 'application/javascript'); res.end('/* stubbed for T33 */'); return; }
  var f = path.join(ROOT, p === '/' ? 'index.html' : p);
  if (f.indexOf(ROOT) !== 0 || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; res.end('nf'); return; }
  res.setHeader('content-type', TYPES[path.extname(f)] || 'application/octet-stream'); fs.createReadStream(f).pipe(res);
});
var passed = 0, failed = 0;
async function check(name, fn) { try { await fn(); passed++; console.log('PASS ' + name); } catch (e) { failed++; console.log('FAIL ' + name + ': ' + (e && e.message)); } }
(async function () {
  /* seed: the synthetic WB1, imported through the real gateway */
  var pv = await h.post('owner', { action: 'import-preview', fileName: 'COMPUTE_DC_intake_SYNTHETIC.xlsx', base64: F.build().buffer.toString('base64') });
  await h.post('owner', { action: 'import-commit', importId: pv.body.importId, planHash: pv.body.planHash });
  await new Promise(function (r) { server.listen(0, r); });
  var base = 'http://127.0.0.1:' + server.address().port + '/portfolio-assets.html';
  var browser = await pw.chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  for (var w of [320, 390, 768, 1440]) {
    var ctx = await browser.newContext({ viewport: { width: w, height: w < 700 ? 800 : 900 }, hasTouch: w < 700 });
    await ctx.route('https://www.gstatic.com/**', function (route) { route.fulfill({ status: 200, contentType: 'application/javascript', body: route.request().url().indexOf('firebase-app') > 0 ? FIREBASE_STUB : '' }); });
    var page = await ctx.newPage(), errors = [];
    page.on('pageerror', function (e) { errors.push(e.message); });
    await page.goto(base); await page.waitForSelector('#count:not(:empty)');
    await check(w + 'px list loads (292 synthetic sites + earlier UI imports), no page-level horizontal overflow, no script errors', async function () {
      var n = +(/(\d+) sites? match/.exec(await page.textContent('#count')) || [])[1]; assert(n >= 292, 'count ' + n);
      var ov = await page.evaluate(function () { return document.documentElement.scrollWidth - window.innerWidth; }); assert(ov <= 0, 'overflow ' + ov + 'px');
      assert.deepEqual(errors, []);
      var vis = await page.evaluate(function () { function shown(id) { var e = document.getElementById(id); return !!(e.offsetWidth || e.offsetHeight); } return { table: shown('rows'), cards: shown('cardlist') }; });
      if (w <= 700) assert(vis.cards && !vis.table, 'cards on small screens'); else assert(vis.table && !vis.cards, 'table on wide screens');
      assert(/Not provided/.test(await page.textContent('#cards')), 'unknown headroom says Not provided');
    });
    await check(w + 'px every form control has an accessible label; touch targets ≥ 40px', async function () {
      var bad = await page.evaluate(function () { return Array.prototype.filter.call(document.querySelectorAll('main input, main select, main button'), function (e) { if (e.type === 'radio') return !e.closest('label'); return !(e.getAttribute('aria-label') || e.closest('label') || (e.id && document.querySelector('label[for="' + e.id + '"]')) || (e.textContent || '').trim()); }).map(function (e) { return e.id || e.outerHTML.slice(0, 40); }); });
      assert.deepEqual(bad, []);
      var small = await page.evaluate(function () { return Array.prototype.filter.call(document.querySelectorAll('.toolbar button, .toolbar select, .toolbar input, .pager button'), function (e) { return e.offsetHeight && e.getBoundingClientRect().height < 40; }).length; });
      assert.equal(small, 0);
    });
    await check(w + 'px keyboard: open a site, switch section, close with Escape; status labels are text', async function () {
      var sel = w <= 700 ? '#cardlist [data-site]' : '#rows [data-site]';
      await page.focus(sel); await page.keyboard.press('Enter');
      await page.waitForSelector('#site[open]'); await page.waitForSelector('#tabs [data-tab]');
      var title = await page.textContent('#siteTitle'); assert(/Synthetic Site/.test(title));
      await page.click('#tabs [data-tab=power]'); assert(/Approved import limit: Not provided/.test(await page.textContent('#tabBody')));
      var dOv = await page.evaluate(function () { var d = document.getElementById('site'); return d.scrollWidth - d.clientWidth; }); assert(dOv <= 1, 'dialog overflow ' + dOv);
      assert(await page.$('#ctx button[disabled][title]'), 'disabled actions explain why');
      await page.keyboard.press('Escape'); await page.waitForFunction(function () { return !document.getElementById('site').open; });
    });
    await check(w + 'px selected site survives a reload', async function () {
      var id = await page.getAttribute(w <= 700 ? '#cardlist [data-site]' : '#rows [data-site]', 'data-site');
      await page.click(w <= 700 ? '#cardlist [data-site]' : '#rows [data-site]'); await page.waitForSelector('#site[open]');
      assert(page.url().indexOf('#site=' + id) > 0);
      await page.reload(); await page.waitForSelector('#site[open]'); await page.waitForSelector('#siteTitle');
      assert(/Synthetic Site/.test(await page.textContent('#siteTitle')));
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'portfolio-site-' + w + '.png') });
      await page.keyboard.press('Escape');
    });
    await check(w + 'px import: upload a CSV, review counts, confirm', async function () {
      await page.click('#importBtn'); await page.waitForSelector('#imp[open]');
      await page.setInputFiles('#impFile', { name: 'extra-' + w + '.csv', mimeType: 'text/csv', buffer: Buffer.from('Site ID,Site name,Street address,City,State,ZIP code\nUI-' + w + ',UI Site ' + w + ',1 Test St,Town,CA,90001\n') });
      await page.click('#impGo'); await page.waitForSelector('#impCommit');
      assert(/1<\/b> to create/.test(await page.innerHTML('#impBody')));
      var ov = await page.evaluate(function () { return document.documentElement.scrollWidth - window.innerWidth; }); assert(ov <= 0);
      await page.click('#impCommit'); await page.waitForFunction(function () { return /Imported: 1 site/.test(document.getElementById('impBody').textContent); });
      await page.click('#closeImp');
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'portfolio-list-' + w + '.png'), fullPage: false });
    });
    await ctx.close();
  }
  await browser.close(); server.close();
  console.log('portfolio assets UI (T33): ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });
