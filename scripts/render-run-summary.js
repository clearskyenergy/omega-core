#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * The Run pinned to Site Map's status bar (omega-run-summary.js) in the FULL
 * canonical editor.html, signed in on an offline Firebase stand-in, on a
 * desktop and a 390px phone, the cost answered by the REAL roll-up.
 *
 * The render checks' sample site (scripts/_lib/editor-sample-site.js) is
 * placed with the editor's own tools. The save is a stand-in that does what
 * a successful saveProject does to the page (Saved, clean, a new record
 * time), because the fixture refuses writes.
 *
 * Holds: before any Run the segment shows the live total and that this
 * drawing waits for the Run button; clicking it runs; current, it reads the
 * Run total and the rail's own $/W, and the rail's IRR once revenue is
 * modelled; a piece placed shows the new total at once, never the old $/W
 * or IRR beside it; the save of the changed drawing re-runs it by itself a
 * moment later, exactly once, its own save never re-arming it; a read-only
 * plan waits for the Run button; clicking a current summary opens the
 * rail's financial figures; it fits a phone. Fails on a page error after
 * boot, or an /api/ call nobody answers.
 *   node scripts/render-run-summary.js [--shots DIR]
 */
'use strict';
var fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), assert = require('assert');
var F = require('./_lib/firestore-double');
F.mock('../api/_lib/admin', { handler: function (fn) { return fn; }, db: function () { return null; }, httpError: function (s, m) { var e = new Error(m); e.status = s; return e; } });
var X = require('../api/_lib/package-access'), EC = require('../api/_lib/editor-cost'), ES = require('../api/_lib/editor-score');
var SITE = require('./_lib/editor-sample-site');
var ROOT = path.join(__dirname, '..');
var argShots = process.argv.indexOf('--shots'), output = argShots > 0 ? path.resolve(process.argv[argShots + 1]) : (process.env.RUN_SUMMARY_SHOTS || path.join(os.tmpdir(), 'omega-run-summary'));
var chromium = require(process.env.PLAYWRIGHT || 'playwright').chromium, count = 0;
function ok(value, label) { assert(value, label); count++; }
function eq(a, b, label) { assert.deepStrictEqual(a, b, label); count++; }

var server = http.createServer(function (req, res) {
  var pathname = new URL(req.url, 'http://localhost').pathname, file = path.resolve(ROOT, '.' + pathname);
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  var mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
  res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream'); res.end(fs.readFileSync(file));
});

async function boot(browser, base, bill, mode) {
  var unanswered = [];
  var view = X.project({ emailVerified: true }, bill, { status: 'active' }, { role: 'owner', status: 'active' });
  var context = await browser.newContext({ viewport: { width: mode.w, height: mode.h }, colorScheme: 'dark', deviceScaleFactor: mode.name === 'phone' ? 2 : 1 });
  await context.addInitScript(SITE.fixture, { modules: bill.modules });
  await context.route('**/*', function (route) {
    var req = route.request(), url = new URL(req.url());
    function json(status, body) { return route.fulfill({ status: status, contentType: 'application/json', body: JSON.stringify(body) }); }
    if (url.origin !== base) return route.fulfill({ status: 200, body: '' });
    if (url.pathname === '/api/package-access') return json(200, view);
    if (url.pathname === '/api/package-catalog') return json(403, { error: 'Pricing is not enabled' });
    if (url.pathname === '/api/plan-change') return json(503, { error: 'Price book not seeded' });
    if (url.pathname === '/api/cost-rollup') { var cq = req.postDataJSON(); cq.vendorOrg = 'sunrise.example'; return json(200, EC.rollup(cq)); }
    if (url.pathname === '/api/editor-score') { var sb = req.postDataJSON(); return json(200, sb.action === 'prequal' ? ES.prequal(sb) : ES.interconnect(sb)); }
    if (url.pathname.indexOf('/api/') === 0) { unanswered.push(url.pathname); return json(503, { error: 'Offline producer' }); }
    return route.continue();
  });
  var page = await context.newPage(), errors = [];
  page.on('pageerror', function (e) { errors.push(e.message); });
  await page.goto(base + '/editor.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(function () { firebase.auth().currentUser = window.__user; window.__listeners.forEach(function (fn) { fn(window.__user); }); });
  await page.waitForFunction(function () { return window.OmegaCaps && OmegaCaps.packageAccess() && !document.getElementById('omega-editor-gate'); });
  await page.waitForTimeout(2000);
  await page.evaluate(function () { try { rbTab('home'); } catch (e) {} });
  /* a project open, and a save that does to the page what a successful one does */
  await page.evaluate(function () {
    window._projectId = 'p-render'; window._currentUser = window.__user; window._loadReady = true;
    window.__saves = 0;
    window.saveProject = function () { window.__saves++; _setSaved('saved'); window._workDirty = false; window._loadedUpdatedAt = Date.now() + window.__saves; };
    window.__runs = 0; var run = window.omegaRunDesign; window.omegaRunDesign = function () { window.__runs++; return run.apply(this, arguments); };
  });
  var tbH = await page.evaluate(function () { return document.getElementById('tb').getBoundingClientRect().height; });
  return { context: context, page: page, errors: errors, bootErrors: errors.length, unanswered: unanswered, tbH: tbH };
}

function seg() {
  var s = document.getElementById('rr-sum'), r = s.getBoundingClientRect(), run = document.getElementById('rr-run').getBoundingClientRect(), tb = document.getElementById('tb').getBoundingClientRect();
  return { shown: s.classList.contains('on') && r.width > 0, state: s.getAttribute('data-state'), text: s.innerText.replace(/\s+/g, ' ').trim(), right: r.right, left: r.left, top: r.top, bottom: r.bottom,
    runTop: run.top, runBottom: run.bottom, runRight: run.right, tbH: tb.height, vw: innerWidth, sx: document.documentElement.scrollWidth };
}
function rail() {
  var get = function (k) { var rows = document.querySelectorAll('#rr-b-fin .rr-row'); for (var i = 0; i < rows.length; i++) { var kk = rows[i].querySelector('.rr-k'); if (kk && kk.textContent.trim().indexOf(k) === 0) return rows[i].querySelector('.rr-v').textContent.trim(); } return null; };
  return { total: get('Total install'), perW: get('$/W'), irr: get('IRR (10 yr)'), cost: window._COST_TOTAL, stale: S.resultsStale, runs: window.__runs, saves: window.__saves };
}
function usd(x) { return '$' + Math.round(x).toLocaleString('en-US'); }

async function run() {
  fs.mkdirSync(output, { recursive: true });
  await new Promise(function (resolve) { server.listen(0, '127.0.0.1', resolve); });
  var base = 'http://127.0.0.1:' + server.address().port;
  var browser = await chromium.launch({ executablePath: process.env.CHROME || chromium.executablePath() });
  var PAID = { packaged: true, packagingState: 'paid', accessUntil: Date.now() + 30 * 86400000, modules: ['lite', 'estimate'] };
  try {
    for (var mode of [{ name: 'desktop', w: 1440, h: 960 }, { name: 'phone', w: 390, h: 844 }]) {
      var b0 = await boot(browser, base, PAID, mode), page = b0.page, M = mode.name;
      ok(!(await page.evaluate(seg)).shown, M + ': nothing placed, nothing shown');

      /* a new drawing, never Run: the live total, and it waits for the Run button */
      await page.evaluate(SITE.placeSite);
      await page.waitForFunction(function () { return +window._COST_TOTAL > 0 && !window._COST_PENDING; }, null, { timeout: 20000 });
      await page.waitForTimeout(900);
      var s0 = await page.evaluate(seg), r0 = await page.evaluate(rail);
      ok(s0.shown && s0.state === 'stale' && s0.text.indexOf(usd(r0.cost)) >= 0, M + ': a drawing never Run shows the live total ' + JSON.stringify(s0.text));
      ok(/updates when saved|press Run/.test(s0.text) && !/IRR|\/W/.test(s0.text), M + ': and why it waits, never a $/W or IRR it has not run');
      await page.waitForTimeout(3500);
      eq((await page.evaluate(rail)).runs, 0, M + ': a drawing never Run is not run by itself');

      /* clicking it runs; current, it reads the Run and the rail */
      await page.click('#rr-sum');
      await page.waitForFunction(function () { return !S.running && !S.resultsStale; }, null, { timeout: 30000 });
      await page.waitForTimeout(900);
      var s1 = await page.evaluate(seg), r1 = await page.evaluate(rail);
      ok(r1.runs === 1 && s1.state === 'current', M + ': clicking it runs the design ' + JSON.stringify(s1));
      ok(s1.text.indexOf(r1.total) >= 0, M + ': it reads the Run total, as the rail prints it (' + r1.total + ')');
      if (M === 'desktop') ok(r1.perW && s1.text.indexOf(r1.perW + '/W') >= 0, M + ': and the rail’s own $/W (' + r1.perW + ')');
      ok(r1.irr === '—' || r1.irr === null ? !/IRR/.test(s1.text) : true, M + ': no IRR before revenue is modelled, as the rail');
      if (M === 'desktop') await page.locator('#tb').screenshot({ path: path.join(output, '01-current.png') });

      /* revenue modelled: the rail's IRR, on the summary */
      await page.evaluate(function () { _revStreams[0].enabled = true; _revUpdateVal(0, 160000); });
      await page.click('#rr-run');
      await page.waitForFunction(function () { return !S.running && !S.resultsStale; }, null, { timeout: 30000 });
      await page.waitForTimeout(900);
      var s2 = await page.evaluate(seg), r2 = await page.evaluate(rail);
      ok(r2.irr && /%/.test(r2.irr) && s2.text.indexOf('IRR ' + r2.irr.replace(/\s/g, '')) >= 0, M + ': with revenue modelled it reads the rail’s IRR (' + r2.irr + ') ' + JSON.stringify(s2.text));
      if (M === 'desktop') await page.screenshot({ path: path.join(output, '02-with-irr.png') });

      /* a piece placed: the new total at once, never the old $/W or IRR beside it */
      var before = await page.evaluate(rail);
      await page.evaluate(function () {
        var sc = document.getElementById('sc'), r = sc.getBoundingClientRect(), c = window._plotUnproject({ x: r.width / 2 - 160, y: r.height / 2 + 140 }), w = _eqDropW('panel');
        addEl({ type: 'eq', eqId: 'panel', label: 'Panelboard', x: c.x - w / 2, y: c.y - w / 2, w: w, rot: 0, spec: _eqSpec('panel') });
        pushHist();
      });
      await page.waitForFunction(function (t) { return +window._COST_TOTAL !== t && !window._COST_PENDING; }, before.cost, { timeout: 20000 });
      await page.waitForTimeout(900);
      var s3 = await page.evaluate(seg), r3 = await page.evaluate(rail);
      ok(r3.stale && s3.state === 'stale' && s3.text.indexOf(usd(r3.cost)) >= 0 && r3.cost > before.cost, M + ': a panel placed shows the new total at once (' + usd(r3.cost) + ')');
      ok(/updates when saved/.test(s3.text) && !/IRR|\/W/.test(s3.text), M + ': never the old $/W or IRR beside a changed drawing ' + JSON.stringify(s3.text));
      if (M === 'desktop') await page.locator('#tb').screenshot({ path: path.join(output, '03-changed.png') });

      /* the save of the changed drawing re-runs it, a moment later, once */
      await page.evaluate(function () { saveProject(); });
      await page.waitForTimeout(800);
      var s4 = await page.evaluate(seg);
      ok(s4.state === 'stale' && /updating/.test(s4.text), M + ': saved, it says it is updating ' + JSON.stringify(s4.text));
      if (M === 'desktop') await page.locator('#tb').screenshot({ path: path.join(output, '04-updating.png') });
      await page.waitForFunction(function () { return !S.running && !S.resultsStale; }, null, { timeout: 30000 });
      await page.waitForTimeout(6500);
      var s5 = await page.evaluate(seg), r5 = await page.evaluate(rail);
      ok(r5.runs === before.runs + 1, M + ': it re-ran by itself, exactly once (' + (r5.runs - before.runs) + ')');
      ok(r5.saves === before.saves + 2, M + ': the person’s save, then the Run’s own save of the priced run, and no more (' + (r5.saves - before.saves) + ')');
      ok(s5.state === 'current' && s5.text.indexOf(r5.total) >= 0 && (r5.irr && /%/.test(r5.irr) ? s5.text.indexOf('IRR ' + r5.irr.replace(/\s/g, '')) >= 0 : true), M + ': current again, on the new Run ' + JSON.stringify(s5.text));

      /* a current summary opens the rail's figures */
      await page.evaluate(function () { var rr = document.getElementById('rr'); if (!rr.classList.contains('rr-collapsed')) omegaRailToggle(); var g = document.getElementById('rr-g-fin'); if (!g.classList.contains('rr-shut')) omegaGrpToggle('rr-g-fin'); });
      await page.click('#rr-sum');
      await page.waitForTimeout(300);
      var opened = await page.evaluate(function () { return { rail: !document.getElementById('rr').classList.contains('rr-collapsed'), fin: !document.getElementById('rr-g-fin').classList.contains('rr-shut'), runs: window.__runs }; });
      ok(opened.rail && opened.fin && opened.runs === r5.runs, M + ': clicking a current summary opens the rail’s financial figures, and runs nothing');

      /* beside the Run button, on its line, never wrapping the ribbon, on screen */
      var fit = await page.evaluate(seg);
      ok(Math.abs((fit.top + fit.bottom) / 2 - (fit.runTop + fit.runBottom) / 2) < 3 && fit.left >= fit.runRight - 0.5, M + ': beside the Run button, on its line ' + JSON.stringify(fit));
      ok(fit.tbH === b0.tbH, M + ': the toolbar is no taller than it was (' + fit.tbH + ' vs ' + b0.tbH + ')');
      ok(fit.right <= fit.vw + 0.5 && fit.left >= 0 && fit.sx <= fit.vw + 1, M + ': on screen, nothing scrolls sideways');
      if (M === 'phone') await page.screenshot({ path: path.join(output, '05-phone.png') });

      var late = b0.errors.slice(b0.bootErrors);
      ok(!late.length, M + ': no page error after boot' + (late.length ? ': ' + late.join(' | ') : ''));
      if (b0.unanswered.length) console.log('  (' + M + ': offline producers the editor asked for: ' + b0.unanswered.filter(function (u, i) { return b0.unanswered.indexOf(u) === i; }).join(', ') + ')');
      await b0.context.close();
    }

    /* a read-only plan waits for the Run button */
    var c0 = await boot(browser, base, { packaged: true, packagingState: 'paid', accessUntil: Date.now() - 86400000, modules: ['lite', 'estimate'] }, { name: 'read-only', w: 1440, h: 960 }), cp = c0.page;
    ok(await cp.evaluate(function () { return OmegaCaps.packageAccess().readOnly === true && !omegaRunMayWrite(); }), 'read-only: the plan is read-only and the gate says wait');
    await cp.evaluate(SITE.placeSite);
    await cp.waitForFunction(function () { return +window._COST_TOTAL > 0 && !window._COST_PENDING; }, null, { timeout: 20000 });
    await cp.evaluate(function () { omegaRunDesign(); });
    await cp.waitForFunction(function () { return !S.running && !S.resultsStale; }, null, { timeout: 30000 });
    var ro0 = await cp.evaluate(rail);
    await cp.evaluate(function () { var c = window._plotUnproject({ x: 300, y: 300 }), w = _eqDropW('meter'); addEl({ type: 'eq', eqId: 'meter', label: 'Meter', x: c.x, y: c.y, w: w, rot: 0, spec: _eqSpec('meter') }); pushHist(); });
    await cp.waitForTimeout(1200);
    await cp.evaluate(function () { saveProject(); });
    await cp.waitForTimeout(6000);
    var ro = await cp.evaluate(seg), ro1 = await cp.evaluate(rail);
    ok(ro1.runs === ro0.runs && ro1.stale && ro.state === 'stale' && /press Run/.test(ro.text), 'read-only: a saved change waits for the Run button, and says so ' + JSON.stringify(ro.text));
    ok(!(c0.errors.slice(c0.bootErrors).length), 'read-only: no page error after boot');
    await c0.context.close();
  } finally { await browser.close(); server.close(); }
  console.log('Run summary render: ' + count + ' checks passed; screenshots in ' + output);
}
run().catch(function (e) { console.error(e); process.exit(1); });
