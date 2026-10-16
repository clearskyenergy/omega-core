#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Output › Financing › Finance It (omega-finance-path.js) in the FULL
 * canonical editor.html, signed in on an offline Firebase stand-in, a
 * packaged workspace holding Omega Design, Storage, Estimate, Plans, Capital
 * and Compute, on a desktop and a 390px phone.
 *
 * The render checks' sample site (scripts/_lib/editor-sample-site.js) and an
 * Omega-Core skid are placed with the editor's own tools, and the Run
 * prices them through the REAL roll-up.
 *
 * Holds:
 * - The button sits first in the Financing group (Output, or Omega Capital's
 *   own tab under a package) and Omega Capital opens it.
 *   A package without Omega Capital does not show it.
 * - Before anything is done, the steps say save and run, and the hand-offs
 *   are shut.
 * - The panel's own Run prices the drawing, and the step reads the Run's
 *   own total.
 * - After a save the hand-offs open. The returns are the Results rail's own
 *   figures, or the Value Stack when no revenue is modelled.
 * - The skid asks to be qualified, and reads as qualified in the
 *   qualifier's own words once S.omegaCore says so.
 * - A drawing changed after the Run shuts the hand-offs again.
 * - A read of the customer's plans brings the plans check with the server's
 *   own count (api/_lib/plan-read.js changes), and What changed opens Read
 *   Plans' view.
 * - Each hand-off clicks the ribbon's own command (Helios intake, the
 *   marketplace) and the Omega-Core step opens the qualifier.
 * - The panel fits a phone.
 *
 * Fails on a page error after boot, or a plan-read call nobody answers.
 *   node scripts/render-finance-path.js [--shots DIR]
 */
'use strict';
var fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), assert = require('assert');
var F = require('./_lib/firestore-double');
F.mock('../api/_lib/admin', { handler: function (fn) { return fn; }, db: function () { return null; }, httpError: function (s, m) { var e = new Error(m); e.status = s; return e; } });
var X = require('../api/_lib/package-access'), EC = require('../api/_lib/editor-cost'), ES = require('../api/_lib/editor-score'), P = require('../api/_lib/plan-read');
var SITE = require('./_lib/editor-sample-site');
var ROOT = path.join(__dirname, '..');
var argShots = process.argv.indexOf('--shots'), output = argShots > 0 ? path.resolve(process.argv[argShots + 1]) : (process.env.FINANCE_PATH_SHOTS || path.join(os.tmpdir(), 'omega-finance-path'));
var chromium = require(process.env.PLAYWRIGHT || 'playwright').chromium, count = 0;
function ok(value, label) { assert(value, label); count++; }
function eq(a, b, label) { assert.deepStrictEqual(a, b, label); count++; }

var server = http.createServer(function (req, res) {
  var pathname = new URL(req.url, 'http://localhost').pathname, file = path.resolve(ROOT, '.' + pathname);
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  var mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
  res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream'); res.end(fs.readFileSync(file));
});

var MODULES = ['lite', 'storage', 'estimate', 'plansets', 'finance', 'compute'];

async function boot(browser, base, modules, mode) {
  var changesPosts = [], unanswered = [];
  var view = X.project({ emailVerified: true }, { packaged: true, packagingState: 'paid', accessUntil: Date.now() + 30 * 86400000, modules: modules }, { status: 'active' }, { role: 'owner', status: 'active' });
  var context = await browser.newContext({ viewport: { width: mode.w, height: mode.h }, colorScheme: 'dark', deviceScaleFactor: mode.name === 'phone' ? 2 : 1 });
  await context.addInitScript(SITE.fixture, { modules: modules });
  await context.route('**/*', function (route) {
    var req = route.request(), url = new URL(req.url());
    function json(status, body) { return route.fulfill({ status: status, contentType: 'application/json', body: JSON.stringify(body) }); }
    if (url.origin !== base) return route.fulfill({ status: 200, body: '' });
    if (url.pathname === '/api/package-access') return json(200, view);
    if (url.pathname === '/api/package-catalog') return json(403, { error: 'Pricing is not enabled' });
    if (url.pathname === '/api/plan-change') return json(503, { error: 'Price book not seeded' });
    if (url.pathname === '/api/cost-rollup') { var cq = req.postDataJSON(); cq.vendorOrg = 'sunrise.example'; return json(200, EC.rollup(cq)); }
    if (url.pathname === '/api/editor-score') { var sb = req.postDataJSON(); return json(200, sb.action === 'prequal' ? ES.prequal(sb) : ES.interconnect(sb)); }
    if (url.pathname === '/api/plan-read') {
      var b = req.postDataJSON();
      if (b.action === 'changes') { changesPosts.push(b); return json(200, { ok: true, result: P.changes(b.read, b.now) }); }
      unanswered.push(url.pathname); return json(400, { error: 'not in this check' });
    }
    if (url.pathname.indexOf('/api/') === 0) { unanswered.push(url.pathname); return json(503, { error: 'Offline producer' }); }
    return route.continue();
  });
  var page = await context.newPage(), errors = [];
  page.on('pageerror', function (e) { errors.push(e.message); });
  await page.goto(base + '/editor.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(function () { firebase.auth().currentUser = window.__user; window.__listeners.forEach(function (fn) { fn(window.__user); }); });
  await page.waitForFunction(function () { return window.OmegaCaps && OmegaCaps.packageAccess() && OmegaCaps.packageAccess().modules.length && !document.getElementById('omega-editor-gate'); });
  await page.waitForTimeout(2000);
  await page.evaluate(function () { try { rbTab('home'); } catch (e) {} });
  return { context: context, page: page, errors: errors, bootErrors: errors.length, changesPosts: changesPosts, unanswered: unanswered };
}

/* the panel as a person reads it */
function readPanel() {
  var h = document.getElementById('finance-path-modal');
  if (!h) return null;
  var card = h.querySelector('.fp-card');
  return { top: (h.querySelector('.fp-top') || {}).textContent || '', wide: card ? card.getBoundingClientRect().width : 0, vw: innerWidth,
    steps: Array.prototype.map.call(h.querySelectorAll('li[data-step]'), function (li) {
      var b = li.querySelector('[data-act]');
      return { key: li.getAttribute('data-step'), status: li.getAttribute('data-status'), text: li.querySelector('.fp-sub').textContent,
        act: b ? b.getAttribute('data-act') : null, disabled: b ? b.disabled : null, locked: !!li.querySelector('.fp-lock') };
    }) };
}
function stepOf(panel, key) { return panel.steps.filter(function (s) { return s.key === key; })[0]; }

async function run() {
  fs.mkdirSync(output, { recursive: true });
  await new Promise(function (resolve) { server.listen(0, '127.0.0.1', resolve); });
  var base = 'http://127.0.0.1:' + server.address().port;
  var browser = await chromium.launch({ executablePath: process.env.CHROME || chromium.executablePath() });
  try {
    for (var mode of [{ name: 'desktop', w: 1440, h: 960 }, { name: 'phone', w: 390, h: 844 }]) {
      var b0 = await boot(browser, base, MODULES, mode), page = b0.page, errors = b0.errors, M = mode.name;
      async function panel() { await page.waitForTimeout(900); return page.evaluate(readPanel); }

      /* the button, with the financing commands, open on Omega Capital */
      var btn = await page.evaluate(function () {
        var b = document.getElementById('rb-finance-path'), cap = b && b.closest('.rpanel').querySelector('.rpanel-cap');
        return b ? { allowed: OmegaCaps.allowedElement(b), group: cap ? cap.textContent.trim() : '', tab: b.closest('.ribbon-page').getAttribute('data-page'), next: (b.nextElementSibling || {}).getAttribute ? (b.nextElementSibling.getAttribute('onclick') || '') : '' } : null;
      });
      /* Output › Financing on the page; a package moves the group to Omega Capital's own tab (OmegaCaps.layout) */
      ok(btn && btn.allowed && btn.group === 'Financing' && (btn.tab === 'output' || btn.tab === 'finance') && /openFinancingApply/.test(btn.next), M + ': Finance It sits first in the Financing group, open on Omega Capital ' + JSON.stringify(btn));

      /* the sample site and an Omega-Core skid, placed with the editor's own tools */
      await page.evaluate(SITE.placeSite);
      await page.evaluate(function () {
        var sc = document.getElementById('sc'), r = sc.getBoundingClientRect();
        derSetDc('dc_omegacore'); _derPlaceDcPad(_plotUnproject({ x: r.width / 2 + 330, y: r.height / 2 - 60 }));
        try { setMode('select'); } catch (e) {}
      });
      await page.waitForTimeout(300);

      /* before anything: save and run first, the hand-offs shut */
      if (M === 'desktop') { await page.evaluate(function (t) { rbTab(t); }, btn.tab); await page.click('#rb-finance-path'); }
      else await page.evaluate(function () { openFinancePath(); });
      await page.waitForSelector('#finance-path-modal li[data-step]');
      var p0 = await panel();
      eq(p0.steps.map(function (s) { return [s.key, s.status]; }), [['save', 'todo'], ['run', 'todo'], ['returns', 'wait'], ['compute', 'todo'], ['helios', 'wait'], ['market', 'wait'], ['financing', 'wait']],
        M + ': save and run first; the skid asks to be qualified; the hand-offs wait');
      ok(['helios', 'market', 'financing'].every(function (k) { return stepOf(p0, k).disabled === true; }), M + ': the hand-offs are shut until the drawing is saved and priced');
      ok(p0.wide <= p0.vw + 0.5, M + ': the panel fits the screen');
      if (M === 'desktop') await page.screenshot({ path: path.join(output, '01-finance-it-start.png') });

      /* the panel's own Run */
      await page.click('#finance-path-modal [data-act="run"]');
      await page.waitForFunction(function () { return S.lastRunAt && !S.running; }, null, { timeout: 30000 });
      await page.waitForTimeout(1500);
      var priced = await page.evaluate(function () { return { total: window._COST_TOTAL, fin: window._RR_FIN }; });
      var p1 = await panel();
      ok(stepOf(p1, 'run').status === 'done' && stepOf(p1, 'run').text.indexOf('$' + Math.round(priced.total).toLocaleString('en-US')) >= 0, M + ': the Run step reads the Run’s own total (' + stepOf(p1, 'run').text + ')');
      ok(stepOf(p1, 'helios').disabled === true, M + ': priced but not saved: the hand-offs still wait');

      /* a save (stood in for: the fixture refuses writes): the hand-offs open */
      await page.evaluate(function () { window.saveProject = function () { window._projectId = 'p-fixture'; window._workDirty = false; }; });
      await page.click('#finance-path-modal [data-act="save"]');
      var p2 = await panel();
      ok(stepOf(p2, 'save').status === 'done' && ['helios', 'market', 'financing'].every(function (k) { return stepOf(p2, k).status === 'go' && stepOf(p2, k).disabled === false; }), M + ': saved and priced: the hand-offs open');
      var ret = stepOf(p2, 'returns'), irr = priced.fin && priced.fin.irr != null && isFinite(priced.fin.irr);
      ok(irr ? ret.status === 'done' && ret.text.indexOf(priced.fin.irr.toFixed(1) + '%') >= 0 && ret.act === 'rail'
        : ret.status === 'todo' && ret.act === 'valueStack' && /No revenue is modelled/.test(ret.text), M + ': the returns are the rail’s own (' + ret.text + ')');
      /* the skid, qualified as the qualifier records it */
      await page.evaluate(function () { S.omegaCore = { verdict: 'conditional', at: '2026-10-16T12:00:00.000Z' }; });
      var p3 = await panel();
      ok(stepOf(p3, 'compute').status === 'done' && /qualified with conditions \(Oct 16, 2026\)/.test(stepOf(p3, 'compute').text), M + ': the skid reads as qualified, in the qualifier’s own words');
      if (M === 'desktop') await page.screenshot({ path: path.join(output, '02-finance-it-ready.png') });
      if (M === 'phone') await page.screenshot({ path: path.join(output, '06-finance-it-phone.png') });

      /* a drawing changed after the Run shuts the hand-offs again */
      await page.evaluate(function () { S.resultsStale = true; });
      var p4 = await panel();
      ok(stepOf(p4, 'run').status === 'todo' && /changed since the last Run/.test(stepOf(p4, 'run').text) && stepOf(p4, 'helios').disabled === true && stepOf(p4, 'returns').status === 'wait',
        M + ': changed since the Run: run again; what goes out is never a stale model');
      await page.evaluate(function () { S.resultsStale = false; });
      await page.waitForTimeout(900);

      /* a read of the customer's plans: the plans check, with the server's own count */
      b0.changesPosts.length = 0;
      await page.evaluate(function () {
        OmegaFinancePath.close();
        S.planRead = { v: 2, id: 'pr-check', fileName: 'Customer plans.pdf', readAt: '2026-10-16T10:00:00.000Z', sheets: [{ page: 1, number: 'E-101' }],
          facts: [{ key: 'bess_kwh', number: 999, sheet: 'E-101', agree: true }], listed: [],
          items: [{ id: 'p1-i1', kind: 'transformer', tag: 'T-9', kva: 750, quantity: 1, placed: 1, sheet: 'E-101' }] };
        openFinancePath();
      });
      await page.waitForFunction(function () { var li = document.querySelector('#finance-path-modal li[data-step="plans"]'); return li && li.getAttribute('data-status') !== 'todo'; }, null, { timeout: 15000 });
      var p5 = await page.evaluate(readPanel), plans = stepOf(p5, 'plans'), lc = await page.evaluate(function () { return OmegaPlanRead._lastChanges().result.differ; });
      ok(b0.changesPosts.length === 1 && plans.status === 'review' && plans.text.indexOf(lc + ' rows differ from Customer plans.pdf') === 0, M + ': the plans check carries the server’s own count (' + plans.text + ')');
      ok(stepOf(p5, 'helios').status === 'go', M + ': rows to review do not shut the hand-offs; the head names them');
      ok(/checked against the customer’s plans/.test(p5.top), M + ': the head names the open step (' + p5.top + ')');
      if (M === 'desktop') {
        await page.click('#finance-path-modal [data-act="whatChanged"]');
        await page.waitForSelector('#plan-read-modal table.pr-ch');
        ok(!(await page.locator('#finance-path-modal').count()), M + ': What changed opens Read Plans’ own view, and the panel steps aside');
        await page.screenshot({ path: path.join(output, '03-what-changed-from-finance-it.png') });
        await page.evaluate(function () { OmegaPlanRead.close(); });

        /* each hand-off is the ribbon's own command */
        await page.evaluate(function () { openFinancePath(); });
        await page.waitForSelector('#finance-path-modal [data-act="helios"]');
        await page.waitForTimeout(800);
        await page.click('#finance-path-modal [data-act="helios"]');
        await page.waitForSelector('#helios-modal', { timeout: 15000 });
        ok(!(await page.locator('#finance-path-modal').count()), M + ': Helios intake opens its own dialog');
        await page.screenshot({ path: path.join(output, '04-helios-from-finance-it.png') });
        await page.evaluate(function () { if (window.OmegaHeliosIntake) OmegaHeliosIntake.close(); var h = document.getElementById('helios-modal'); if (h) h.remove(); });
        await page.evaluate(function () { openFinancePath(); });
        await page.waitForSelector('#finance-path-modal [data-act="market"]');
        await page.waitForTimeout(800);
        await page.click('#finance-path-modal [data-act="market"]');
        await page.waitForSelector('#mkt-modal', { timeout: 15000 });
        ok(true, M + ': Push to Marketplace opens its own panel');
        await page.evaluate(function () { var h = document.getElementById('mkt-modal'); if (h) h.remove(); });
        await page.evaluate(function () { openFinancePath(); });
        await page.waitForSelector('#finance-path-modal [data-act="omegaCore"]');
        await page.waitForTimeout(800);
        await page.click('#finance-path-modal [data-act="omegaCore"]');
        await page.waitForSelector('#omega-core-modal', { timeout: 15000 });
        ok(true, M + ': the compute step opens the Omega-Core qualifier');
        await page.screenshot({ path: path.join(output, '05-omega-core-from-finance-it.png') });
        await page.evaluate(function () { if (window.OmegaCoreQualify && OmegaCoreQualify.close) OmegaCoreQualify.close(); var h = document.getElementById('omega-core-modal'); if (h) h.remove(); });
        /* a caller cannot take a shut hand-off past its step */
        await page.evaluate(function () { S.resultsStale = true; OmegaFinancePath.run('market'); });
        await page.waitForTimeout(400);
        ok(!(await page.locator('#mkt-modal').count()), M + ': run() refuses a hand-off the panel shows shut');
        await page.evaluate(function () { S.resultsStale = false; });
      }
      await page.evaluate(function () { OmegaFinancePath.close(); });

      var late = errors.slice(b0.bootErrors);
      ok(!late.length, M + ': no page errors after boot ' + JSON.stringify(late));
      ok(b0.unanswered.indexOf('/api/plan-read') < 0, M + ': every plan-read call was answered');
      if (b0.unanswered.length) console.log('  (' + M + ': offline producers the editor asked for: ' + b0.unanswered.filter(function (u, i) { return b0.unanswered.indexOf(u) === i; }).join(', ') + ')');
      await b0.context.close();
    }

    /* a package without Omega Capital: no Finance It */
    var c0 = await boot(browser, base, ['lite', 'storage', 'estimate'], { name: 'desktop', w: 1440, h: 960 });
    var none = await c0.page.evaluate(function () { var b = document.getElementById('rb-finance-path'); return { allowed: OmegaCaps.allowedElement(b), shown: !!b.offsetParent || getComputedStyle(b).display !== 'none' }; });
    ok(!none.allowed, 'without Omega Capital, the plan does not open Finance It');
    ok(!(c0.errors.slice(c0.bootErrors).length), 'without Omega Capital: no page error after boot');
    await c0.context.close();
  } finally { await browser.close(); server.close(); }
  console.log('Finance It render: ' + count + ' checks passed; screenshots in ' + output);
}
run().catch(function (e) { console.error(e); server.close(); process.exit(1); });
