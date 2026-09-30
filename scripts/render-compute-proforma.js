#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * The Compute Site Pro Forma (compute-proforma.html) in Chromium, against
 * the REAL endpoint (api/compute-proforma.js → api/_lib/compute-site.js →
 * api/_lib/proforma-engine.js) with verify-token replaced by a stub that
 * answers from an in-memory set of records. The browser's Firebase is a
 * stand-in that reports one signed-in person and a toolData store.
 *
 * It walks the whole tool as a person would — run the example from the
 * empty results (and put back what was typed), read the load balance, run
 * the sizing sweep and use its best size, compare the three deals, read the
 * results and the deck, save and reload a scenario — on a desktop and a
 * 390 px phone, and checks that a packaged workspace without Omega Compute
 * is refused with the way to it. Fails on a page error, a figure that reads
 * NaN/undefined or -0.0%, sideways scroll on the phone, a step that does not
 * render, a switch drawn without its track (the knob over its words), a
 * month field that is not a month and a year, a chart drawn at another
 * width than its card (its text scaled down) or a control that wraps.
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
/* every visible switch in the step: its track drawn, its words beside it (not under the knob) */
function switchesDrawn(step) {
  return [].map.call(document.querySelectorAll('section.step[data-step="' + step + '"] label.sw'), function (l) {
    if (!l.offsetParent) return null;
    var t = l.querySelector('.tr').getBoundingClientRect(), x = l.lastElementChild.getBoundingClientRect();
    return { w: Math.round(t.width), h: Math.round(t.height), gap: Math.round(x.left - t.right) };
  }).filter(function (v) { return v; });
}
/* charts whose axis labels run into each other: labels on one line with under 4 px between them */
function axisClash() {
  var bad = [];
  [].forEach.call(document.querySelectorAll('.chart svg'), function (sv) {
    if (!sv.getBoundingClientRect().width) return;
    var rows = {};
    [].forEach.call(sv.querySelectorAll('text.ax'), function (t) { var r = t.getBoundingClientRect(); if (r.width) (rows[Math.round(r.top)] = rows[Math.round(r.top)] || []).push(r); });
    Object.keys(rows).forEach(function (k) {
      var a = rows[k].sort(function (p, q) { return p.left - q.left; });
      for (var i = 1; i < a.length; i++) if (a[i].left - a[i - 1].right < 4) { bad.push(sv.parentNode.id + ' (' + Math.round(a[i].left - a[i - 1].right) + ' px apart)'); return; }
    });
  });
  return bad;
}
function drawnOk(list) { return list.length > 0 && list.every(function (r) { return r.w >= 36 && r.h >= 20 && r.gap >= 6; }); }

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
    var guide = await page.locator('#hdr-guide').getAttribute('href');
    ok(/^\/guides\//.test(guide) && fs.existsSync(path.join(root, guide)), 'the header links the guide, and the site serves it: ' + guide);
    ok(await page.locator('#i-mkt').evaluate(function (el) { return el.clientWidth; }) >= 160, 'the market list is wide enough to read "From the ZIP"');
    await page.locator('#stepper [data-step="3"]').click();
    var sw3 = await page.evaluate(switchesDrawn, 3);
    ok(sw3.length === 2 && drawnOk(sw3), 'the charging step\'s switches draw their tracks beside their words: ' + JSON.stringify(sw3));

    /* nothing has run: the results offer the example and step 1 */
    await page.locator('#stepper [data-step="7"]').click();
    ok(await page.locator('#res-body [data-act="example"]').count() === 1 && await page.locator('#res-body [data-go="1"]').count() === 1 &&
       await page.locator('#rail .rail-ex').count() === 1, 'the empty results and the live summary offer the example and step 1');
    /* what was typed can be put back */
    await page.locator('#stepper [data-step="1"]').click();
    await page.fill('#i-zip', '60601');
    var sts1 = await page.locator('#sts1').textContent();
    await page.locator('#rail .rail-ex').click();
    await page.locator('#toast [data-act="undo-example"]').waitFor();
    ok(/Example/.test(await page.inputValue('#i-name')), 'the example fills the form');
    await page.waitForFunction(function () { var h = document.querySelector('#rail .hero'); return h && /%/.test(h.textContent); }, null, { timeout: 30000 });
    await page.locator('#toast [data-act="undo-example"]').click();
    ok(await page.inputValue('#i-zip') === '60601' && await page.inputValue('#i-name') === '', 'Put mine back restores what was typed');
    ok(await page.locator('#sts1').textContent() === sts1 && await page.locator('[data-deal="infra"]').textContent() === '' &&
       !/%/.test(await page.locator('#rail .hero').textContent()), 'and nothing from the example\'s result stays up: the step list, the deal cards, the summary');
    await page.locator('#stepper [data-step="7"]').click();
    await page.locator('#res-body [data-act="example"]').waitFor();
    ok(true, 'and the results go back to the way in');
    /* run the example from the results: they fill in place */
    await page.locator('#res-body [data-act="example"]').click();
    await page.waitForFunction(function () { return /Headline returns/.test(document.getElementById('res-body').textContent); }, null, { timeout: 30000 });
    ok(await page.locator('#stepper [aria-current="step"]').getAttribute('data-step') === '7', 'Run the example fills the results where the person is');
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
    var off = await page.evaluate(function () {
      return ['ch-day', 'ch-month', 'ch-dur'].map(function (k) {
        var b = document.getElementById(k), v = b.querySelector('svg').getAttribute('viewBox').split(' ');
        return Math.abs(Number(v[2]) - Math.max(300, b.clientWidth));
      });
    });
    ok(off.every(function (d) { return d <= 1; }), 'each chart is drawn at its card\'s width, so its text is full size (' + off.join(', ') + ' px off), though the model ran on another step');
    var clash5 = await page.evaluate(axisClash);
    ok(clash5.length === 0, 'no chart\'s axis labels run into each other: ' + clash5.join(', '));
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
    var sw6 = await page.evaluate(switchesDrawn, 6);
    ok(sw6.length === 5 && drawnOk(sw6), 'the deal step\'s switches draw their tracks beside their words: ' + JSON.stringify(sw6));
    var s6 = await page.evaluate(function () {
      var mp = [].map.call(document.querySelectorAll('.mp[data-mp]'), function (m) { var q = m.querySelectorAll('select'); return q.length === 2 && !!q[0].value && !!q[1].value; });
      var seg = document.querySelectorAll('[data-seg="finance.tax.appetite"] button');
      return { mp: mp, oneLine: seg.length === 2 && seg[0].offsetTop === seg[1].offsetTop, negZero: /[-\u2212]0\.0+%/.test(document.querySelector('section.step[data-step="6"]').textContent) };
    });
    ok(s6.mp.length === 2 && s6.mp.every(Boolean), 'construction and service are a month and a year each, filled by the example');
    ok(s6.oneLine, 'the tax appetite reads on one line');
    ok(!s6.negZero, 'no rate reads -0.0%');
    var yNow = await page.inputValue('.mp[data-mp="site.pisMonth"] [data-part=y]');
    await page.selectOption('.mp[data-mp="site.pisMonth"] [data-part=y]', '2020');
    await page.waitForFunction(function () { var e = document.querySelector('[data-err="finance.project.pisMonth"]'); return e && e.textContent.length > 5; }, null, { timeout: 30000 });
    ok(true, 'service before construction is refused under the In service field');
    await page.selectOption('.mp[data-mp="site.pisMonth"] [data-part=y]', yNow);
    await page.waitForFunction(function () { var f = document.querySelector('#rail .rail-foot'); return f && /Up to date/.test(f.textContent); }, null, { timeout: 30000 });
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
    ok((await page.evaluate(axisClash)).length === 0, 'the cash-flow chart\'s labels stand apart');
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
    for (var cs of [5, 7]) {
      await p2.evaluate(function (k) { document.querySelector('#stepper [data-step="' + k + '"]').click(); }, cs);
      await p2.waitForTimeout(200);
      var cl = await p2.evaluate(axisClash);
      ok(cl.length === 0, 'on a phone, step ' + cs + '\'s chart labels stand apart: ' + cl.join(', '));
    }
    await p2.evaluate(function () { document.querySelector('#stepper [data-step="3"]').click(); });
    var swp = await p2.evaluate(switchesDrawn, 3);
    ok(swp.length === 2 && drawnOk(swp), 'the switches draw their tracks on a phone too: ' + JSON.stringify(swp));
    await p2.goto(base + '/compute-proforma.html?example=1');
    await p2.waitForFunction(function () { return /IRR/.test(document.getElementById('mstrip').textContent); }, null, { timeout: 30000 });
    ok(/Example/.test(await p2.inputValue('#i-name')), 'a link with ?example=1 opens on the example, run');
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
