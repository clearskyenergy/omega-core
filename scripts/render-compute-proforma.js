#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * The Compute Site Pro Forma (compute-proforma.html) in Chromium, against
 * the REAL endpoint (api/compute-proforma.js → api/_lib/compute-site.js →
 * api/_lib/proforma-engine.js) with verify-token replaced by a stub that
 * answers from an in-memory set of records. The browser's Firebase is a
 * stand-in that reports one signed-in person and a toolData store.
 *
 * It walks the whole tool as a person would — load the example, read the
 * load balance, run the sizing sweep and use its best size, compare the
 * three deals, read the results and the deck, save and reload a scenario —
 * on a desktop and a 390 px phone, and checks that a packaged workspace
 * without Omega Compute is refused with the way to it. Fails on a page
 * error, a figure that reads NaN/undefined, sideways scroll on the phone or
 * a step that does not render.
 *
 * A plain run writes nothing into the repo; --shots DIR keeps screenshots.
 * Run: node scripts/render-compute-proforma.js   (needs Playwright + Chromium)
 */
'use strict';
var fs = require('fs'), path = require('path'), http = require('http'), assert = require('assert');
var root = path.join(__dirname, '..');
var shotsAt = (function () { var i = process.argv.indexOf('--shots'); return i > 0 ? process.argv[i + 1] : null; })();

/* ── the sign-in stand-in: verify-token answers from these records ───── */
var CALLER = null, RECORDS = {};
var vtPath = require.resolve(path.join(root, 'api/_lib/verify-token'));
require.cache[vtPath] = { id: vtPath, filename: vtPath, loaded: true, exports: {
  httpError: function (status, message) { var e = new Error(message); e.status = status; return e; },
  verifyIdToken: function () { return CALLER ? Promise.resolve(CALLER) : Promise.reject(Object.assign(new Error('Sign in.'), { status: 401 })); },
  readAsCaller: function (token, p) { return Promise.resolve(Object.prototype.hasOwnProperty.call(RECORDS, p) ? JSON.parse(JSON.stringify(RECORDS[p])) : null); }
} };
var handler = require(path.join(root, 'api/compute-proforma'));

var LEGACY = { uid: 'u1', email: 'pat@northstar.example', orgId: 'northstar.example', staff: false, emailVerified: true, claims: { email_verified: true } };
function legacyRecords() {
  RECORDS = {};
  RECORDS['omega_orgs/northstar.example'] = { status: 'active', name: 'Northstar Edge' };
  RECORDS['omega_orgs/northstar.example/billing/current'] = { tier: 'standard' };
  RECORDS['omega_orgs/northstar.example/members/u1'] = { role: 'owner', status: 'active' };
}
function liteOnlyRecords() {
  RECORDS = {};
  RECORDS['omega_orgs/northstar.example'] = { status: 'active', name: 'Northstar Edge' };
  RECORDS['omega_orgs/northstar.example/billing/current'] = { packaged: true, modules: ['lite'], packagingState: 'active', accessUntil: Date.now() + 30 * 86400000, toolAccess: ['editor'] };
  RECORDS['omega_orgs/northstar.example/members/u1'] = { role: 'owner', status: 'active' };
}

var STATIC = { '/compute-proforma.html': 'text/html', '/proforma-logic.js': 'text/javascript', '/omega-tools.js': 'text/javascript', '/omega-splash.js': 'text/javascript' };
var server = http.createServer(function (req, res) {
  var url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/compute-proforma') {
    var chunks = [];
    req.on('data', function (c) { chunks.push(c); });
    req.on('end', function () {
      var body = chunks.length ? Buffer.concat(chunks).toString('utf8') : '';
      var code = 200, vres = {
        setHeader: function (k, v) { res.setHeader(k, v); },
        status: function (c) { code = c; return vres; },
        json: function (o) { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); return vres; }
      };
      var parsed = null; try { parsed = body ? JSON.parse(body) : null; } catch (e) { parsed = body; }
      handler({ method: req.method, headers: req.headers, body: parsed }, vres);
    });
    return;
  }
  if (url.pathname === '/config.js') { res.setHeader('Content-Type', 'text/javascript'); return res.end('window.CLEARSKY_CONFIG={firebase:{}};'); }
  if (['/omega-brand.js', '/omega-tenant.js', '/omega-whitelabel.js'].indexOf(url.pathname) >= 0) { res.setHeader('Content-Type', 'text/javascript'); return res.end(''); }
  if (!STATIC[url.pathname]) { res.statusCode = 404; return res.end(); }
  res.setHeader('Content-Type', STATIC[url.pathname]);
  res.end(fs.readFileSync(path.join(root, url.pathname)));
});

async function init(context, base) {
  await context.route('**/*', function (r) { return r.request().url().indexOf(base) === 0 ? r.continue() : r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }); });
  await context.addInitScript(function () {
    var user = { uid: 'u1', email: 'pat@northstar.example', getIdToken: function () { return Promise.resolve('fixture'); } };
    var auth = { currentUser: user, onAuthStateChanged: function (fn) { setTimeout(function () { fn(user); }, 0); }, signOut: function () { return Promise.resolve(); } };
    function authentication() { return auth; }
    var docs = window.__toolData = {};
    function doc(p) {
      return { collection: function (c) { return coll(p + '/' + c); },
               get: function () { return Promise.resolve({ exists: !!docs[p], data: function () { return docs[p]; } }); },
               set: function (v) { docs[p] = JSON.parse(JSON.stringify(v, function (k, x) { return k === 'updatedAt' ? 'ts' : x; })); return Promise.resolve(); } };
    }
    function coll(p) { return { doc: function (id) { return doc(p + '/' + id); } }; }
    function firestore() { return { collection: coll }; }
    firestore.FieldValue = { serverTimestamp: function () { return 'ts'; } };
    window.firebase = { apps: [1], initializeApp: function () {}, auth: authentication, firestore: firestore };
  });
}

var checks = 0;
function ok(cond, label) { assert(cond, label); checks++; console.log('  ok   ' + label); }
var STRAY = /\b(NaN|undefined|Infinity|\[object Object\])\b/;

async function run() {
  await new Promise(function (r) { server.listen(0, '127.0.0.1', r); });
  var base = 'http://127.0.0.1:' + server.address().port;
  var browser = await require(process.env.PLAYWRIGHT || 'playwright').chromium.launch({ executablePath: process.env.CHROME || undefined });
  if (shotsAt) fs.mkdirSync(shotsAt, { recursive: true });
  async function shot(page, name) { if (shotsAt) await page.screenshot({ path: path.join(shotsAt, name + '.png'), fullPage: true }); }
  try {
    /* ── desktop, a legacy Standard workspace ── */
    CALLER = LEGACY; legacyRecords();
    var ctx = await browser.newContext({ viewport: { width: 1320, height: 900 } }); await init(ctx, base);
    var page = await ctx.newPage(), errors = [];
    page.on('pageerror', function (e) { errors.push(e.message); });
    await page.goto(base + '/compute-proforma.html');
    await page.waitForFunction(function () { return document.querySelectorAll('#i-mkt option').length > 5; });
    ok(await page.locator('#stepper button').count() === 7, 'seven steps');
    await page.locator('[data-act="example"]').click();
    await page.waitForFunction(function () { var h = document.querySelector('#rail .hero'); return h && /%/.test(h.textContent); }, null, { timeout: 30000 });
    var rail = await page.locator('#rail').textContent();
    ok(/after-tax unlevered IRR/.test(rail) && /Peak at the meter/.test(rail) && !STRAY.test(rail), 'the live summary shows the IRR, the peak and the screen: ' + rail.replace(/\s+/g, ' ').slice(0, 120));
    await shot(page, 'cpf-1-site');

    await page.locator('#stepper [data-step="5"]').click();
    await page.locator('#screen-out .verdict').waitFor();
    var scr = await page.locator('#screen-out').textContent();
    ok(/ADVANCE|VERIFY|HOLD/.test(scr) && /Next:/.test(scr), 'the load balance says advance, verify or hold, and the next gate');
    ok(!STRAY.test(scr), 'the load balance prints no NaN or undefined');
    for (var id of ['ch-day', 'ch-month', 'ch-dur']) ok(await page.locator('#' + id + ' svg').count() === 1, id + ' is drawn');
    ok(await page.locator('#ch-day .hit').count() === 24, 'the day chart has a hover target for every hour');
    await page.locator('#ch-day .hit').nth(18).hover();
    ok(/At the meter/.test(await page.locator('#ch-day .tip').textContent()), 'hovering an hour names each load and the meter');
    await page.locator('[data-day="winter"]').click();
    ok(/Peak winter weekday/.test(await page.locator('#screen-out .card h3').nth(1).textContent()), 'the day tabs switch the day');
    await shot(page, 'cpf-5-balance');

    await page.locator('[data-act="optimize"]').click();
    await page.locator('#sweep-out table').waitFor({ timeout: 60000 });
    var cells = await page.locator('#sweep-out td.cell').count();
    ok(cells >= 8, 'the sizing sweep fills a grid of pods by battery (' + cells + ' cells)');
    ok(await page.locator('#sweep-out td.cell.best').count() === 1, 'one cell is marked the best');
    var sweepTxt = await page.locator('#sweep-out').textContent();
    ok(!STRAY.test(sweepTxt), 'the sweep prints no NaN or undefined');
    await page.locator('#sweep-out .banner [data-act="use-size"]').click();
    await page.waitForFunction(function () { return /Size applied/.test(document.getElementById('toast').textContent); });
    await page.waitForFunction(function () { var f = document.querySelector('#rail .rail-foot'); return f && /Up to date/.test(f.textContent); }, null, { timeout: 30000 });
    ok(true, 'Use this size applies the best size and the model re-runs');
    await shot(page, 'cpf-5-sweep');

    await page.locator('#stepper [data-step="6"]').click();
    var deals = await page.locator('#deals').textContent();
    ok(/IRR/.test(deals) && /No capital/.test(deals) && !STRAY.test(deals), 'the three structures are priced side by side');
    await page.locator('#deals [data-val="own"]').click();
    await page.waitForFunction(function () { var f = document.querySelector('#rail .rail-foot'); return f && /Up to date/.test(f.textContent); }, null, { timeout: 30000 });
    await page.locator('[data-debt="1"]').click();
    await page.waitForFunction(function () { var h = document.querySelector('#rail .hero-l'); return h && /equity IRR/.test(h.textContent); }, null, { timeout: 30000 });
    ok(true, 'project debt makes it a levered equity IRR');
    await shot(page, 'cpf-6-deal');

    await page.locator('#stepper [data-step="7"]').click();
    await page.locator('#ch-cash svg').waitFor();
    var resTxt = await page.locator('#res-body').textContent();
    ok(/Headline returns/.test(resTxt) && /IRR build, after tax/.test(resTxt) && /More metrics/.test(resTxt) && /Sensitivity/.test(resTxt), 'the results are the BESS Pro Forma\'s blocks');
    ok(/GPU-hour prices −20%/.test(resTxt) && /Electricity rates \+25%/.test(resTxt), 'the sensitivities include the compute cases');
    ok(!STRAY.test(resTxt), 'the results print no NaN or undefined');
    await page.waitForFunction(function () { return document.querySelectorAll('#deck-box .pf-slide').length >= 3; }, null, { timeout: 15000 });
    var deck = await page.locator('#deck-box').textContent();
    ok(/GPUs/.test(deck) && /EV ports/.test(deck) && !STRAY.test(deck), 'the investor deck presents the compute site');
    ok(await page.locator('#btn-print').isEnabled(), 'print is offered');
    await shot(page, 'cpf-7-results');

    await page.locator('[data-act="save"]').click();
    await page.waitForFunction(function () { return /Saved/.test(document.getElementById('savemsg').textContent); });
    ok(await page.locator('#scen option').count() === 2, 'a saved scenario is listed');
    ok(/Compare scenarios/.test(await page.locator('#compare-card').textContent()) && await page.locator('#compare tbody tr').count() === 1, 'and compared');
    ok(errors.length === 0, 'no page errors: ' + errors.join(' | '));
    await ctx.close();

    /* ── a 390 px phone ── */
    var ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); await init(ctx2, base);
    var p2 = await ctx2.newPage(), e2 = [];
    p2.on('pageerror', function (e) { e2.push(e.message); });
    await p2.goto(base + '/compute-proforma.html?zip=60601&amps=400&volts=480&ports=6&pods=1&name=Phone%20check&hostType=retail');
    await p2.waitForFunction(function () { return /IRR/.test(document.getElementById('mstrip').textContent); }, null, { timeout: 30000 });
    ok(true, 'a link with the site in it pre-fills and runs');
    for (var n = 1; n <= 7; n++) {
      await p2.evaluate(function (k) { document.querySelector('#stepper [data-step="' + k + '"]').click(); }, n);
      await p2.waitForTimeout(150);
      var wide = await p2.evaluate(function () { return document.scrollingElement.scrollWidth - window.innerWidth; });
      ok(wide <= 1, 'step ' + n + ' fits a 390 px phone (' + wide + ' px over)');
    }
    await shot(p2, 'cpf-phone-results');
    ok(e2.length === 0, 'no page errors on the phone: ' + e2.join(' | '));
    await ctx2.close();

    /* ── a packaged workspace without Omega Compute ── */
    liteOnlyRecords();
    var ctx3 = await browser.newContext({ viewport: { width: 1280, height: 800 } }); await init(ctx3, base);
    var p3 = await ctx3.newPage();
    await p3.goto(base + '/compute-proforma.html');
    await p3.locator('#notice .banner').waitFor();
    var refused = await p3.locator('#notice').textContent();
    ok(/not in your package/i.test(refused) && await p3.locator('#notice a[href="/workspace#module-compute"]').count() === 1, 'a workspace without Omega Compute is refused and pointed to the module');
    await ctx3.close();
  } finally {
    await browser.close();
    server.close();
  }
  console.log('\nrender-compute-proforma: ' + checks + ' checks passed');
}
run().catch(function (e) { console.error('FAIL', e && e.message || e); server.close(); process.exit(1); });
