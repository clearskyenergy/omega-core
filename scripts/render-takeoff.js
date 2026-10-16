#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Cost › Trades, the takeoff by trade, in the FULL canonical editor.html,
 * signed in on an offline Firebase stand-in, a packaged workspace holding
 * Omega Design, Omega Estimate and Omega Plans, on a desktop and a 390px
 * phone.
 *
 * The render checks' sample site (scripts/_lib/editor-sample-site.js) is
 * placed with the editor's own tools, the Run prices it through the REAL
 * roll-up, and /api/takeoff is answered by the REAL library on the REAL
 * roll-up, exactly as api/takeoff.js does past its gate (the gate is held
 * by scripts/tests/ttakeoff.js).
 *
 * Holds: the Trades sub-tab sits in the Cost tab; the page sends the Run's
 * own quantities and nothing priced; the trades add up to the Run total to
 * the cent and say so; a line marks exactly what the Run counted on the map
 * (the pads, the Level 2 chargers and not the DC one, the array, the
 * underground conduit), the marks survive the editor redrawing a piece, and
 * clicking again clears them; selecting a piece on the map names its line,
 * and a piece no line counts says so; in the 3D Site Visualizer a marked
 * line is boxed in the model with a card, a piece picked in the model shows
 * its own line, and closing the card or the visualizer takes it all away;
 * the CSV carries every line to the cent; a scope of work carries the
 * quantities and never a price; a package without Omega Estimate shows no
 * Trades; the pane fits a phone. Fails on a page error after boot, or an
 * /api/ call nobody answers.
 *   node scripts/render-takeoff.js [--shots DIR]
 */
'use strict';
var fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), assert = require('assert');
var F = require('./_lib/firestore-double');
F.mock('../api/_lib/admin', { handler: function (fn) { return fn; }, db: function () { return null; }, httpError: function (s, m) { var e = new Error(m); e.status = s; return e; } });
var X = require('../api/_lib/package-access'), EC = require('../api/_lib/editor-cost'), ES = require('../api/_lib/editor-score'), TK = require('../api/_lib/takeoff'), BS = require('../api/_lib/build-sequence');
var SITE = require('./_lib/editor-sample-site');
var ROOT = path.join(__dirname, '..'), THREE_JS = path.join(ROOT, 'assets/vendor/three-r128/three.min.js');
var argShots = process.argv.indexOf('--shots'), output = argShots > 0 ? path.resolve(process.argv[argShots + 1]) : (process.env.TAKEOFF_SHOTS || path.join(os.tmpdir(), 'omega-takeoff'));
var chromium = require(process.env.PLAYWRIGHT || 'playwright').chromium, count = 0;
function ok(value, label) { assert(value, label); count++; }
function eq(a, b, label) { assert.deepStrictEqual(a, b, label); count++; }

var server = http.createServer(function (req, res) {
  var pathname = new URL(req.url, 'http://localhost').pathname, file = path.resolve(ROOT, '.' + pathname);
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  var mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
  res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream'); res.end(fs.readFileSync(file));
});

var MODULES = ['lite', 'estimate', 'plansets'];

async function boot(browser, base, modules, mode) {
  var posted = [], unanswered = [];
  var view = X.project({ emailVerified: true }, { packaged: true, packagingState: 'paid', accessUntil: Date.now() + 30 * 86400000, modules: modules }, { status: 'active' }, { role: 'owner', status: 'active' });
  var context = await browser.newContext({ viewport: { width: mode.w, height: mode.h }, colorScheme: 'dark', deviceScaleFactor: mode.name === 'phone' ? 2 : 1, acceptDownloads: true });
  await context.addInitScript(SITE.fixture, { modules: modules });
  await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(function () {});
  await context.route('**/*', function (route) {
    var req = route.request(), url = new URL(req.url());
    function json(status, body) { return route.fulfill({ status: status, contentType: 'application/json', body: JSON.stringify(body) }); }
    if (url.hostname === 'cdnjs.cloudflare.com' && /three\.js\/r128\/three\.min\.js$/.test(url.pathname)) return route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(THREE_JS) });
    if (url.origin !== base) return route.fulfill({ status: 200, body: '' });
    if (url.pathname === '/api/package-access') return json(200, view);
    if (url.pathname === '/api/package-catalog') return json(403, { error: 'Pricing is not enabled' });
    if (url.pathname === '/api/plan-change') return json(503, { error: 'Price book not seeded' });
    if (url.pathname === '/api/cost-rollup') { var cq = req.postDataJSON(); cq.vendorOrg = 'sunrise.example'; return json(200, EC.rollup(cq)); }
    if (url.pathname === '/api/editor-score') { var sb = req.postDataJSON(); return json(200, sb.action === 'prequal' ? ES.prequal(sb) : ES.interconnect(sb)); }
    if (url.pathname === '/api/build-sequence') { var bb = req.postDataJSON(), bq = bb.q || {}; bq.vendorOrg = 'sunrise.example'; return json(200, BS.sequence(EC.rollup(bq), bq, bb.build)); }
    if (url.pathname === '/api/takeoff') {
      /* exactly what api/takeoff.js does past its gate */
      var b = req.postDataJSON(), q = b.q || {};
      posted.push(JSON.parse(JSON.stringify(b)));
      q.vendorOrg = 'sunrise.example';
      return new Promise(function (r) { setTimeout(r, 200); }).then(function () { return json(200, TK.takeoff(EC.rollup(q), q, b.extra)); });
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
  var bootErrors = errors.length;
  await page.evaluate(SITE.placeSite);
  await page.waitForTimeout(300);
  await page.evaluate(function () { omegaRunDesign(); });
  await page.waitForFunction(function () { return !S.running; }, null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  var run = await page.evaluate(function () { return { total: window._COST_TOTAL, q: JSON.parse(JSON.stringify(omegaCostQuantities())) }; });
  return { context: context, page: page, errors: errors, bootErrors: bootErrors, posted: posted, unanswered: unanswered, run: run };
}

/* the pane as a person reads it */
function readPane() {
  var p = document.getElementById('cst-takeoff'), s = OmegaTakeoff._state();
  return { shown: p.style.display !== 'none' && !!p.offsetParent, total: (document.getElementById('tk-total') || {}).textContent, busy: s.busy, err: s.err,
    trades: Array.prototype.map.call(p.querySelectorAll('.tk-trade'), function (t) { return { key: t.getAttribute('data-trade'), open: t.classList.contains('open'), amt: t.querySelector('.tk-amt').firstChild.textContent }; }),
    hint: Array.prototype.map.call(p.querySelectorAll('.tk-hint'), function (h) { return h.textContent; }).join(' | '),
    marked: Array.prototype.map.call(document.querySelectorAll('.tk-hl'), function (n) { return n.getAttribute('data-elid') || n.getAttribute('data-shid') || n.getAttribute('data-cid') || ('#' + n.id); }),
    on: Array.prototype.map.call(p.querySelectorAll('.tk-line.on'), function (n) { return n.getAttribute('data-k'); }),
    fromSel: Array.prototype.map.call(p.querySelectorAll('.tk-line.from-sel'), function (n) { return n.getAttribute('data-k'); }) };
}

async function run() {
  fs.mkdirSync(output, { recursive: true });
  await new Promise(function (resolve) { server.listen(0, '127.0.0.1', resolve); });
  var base = 'http://127.0.0.1:' + server.address().port;
  var browser = await chromium.launch({ executablePath: process.env.CHROME || chromium.executablePath() });
  try {
    for (var mode of [{ name: 'desktop', w: 1440, h: 960 }, { name: 'phone', w: 390, h: 844 }]) {
      var b0 = await boot(browser, base, MODULES, mode), page = b0.page, errors = b0.errors, run = b0.run, M = mode.name;
      ok(run.total > 0, M + ': the Run priced the site ($' + Math.round(run.total).toLocaleString('en-US') + ')');
      var cents = Math.round(run.total * 100);

      /* the Trades sub-tab, in the Cost tab */
      await page.evaluate(function () { openRpPanel('cost'); });
      await page.waitForTimeout(300);
      var tab = await page.evaluate(function () {
        var b = document.getElementById('ct-takeoff'), r = b.getBoundingClientRect(), strip = b.parentNode.getBoundingClientRect();
        return { inCost: !!b.closest('#rp-cost'), module: b.closest('[data-module]').getAttribute('data-module'), visible: r.width > 0 && r.height > 0, inside: r.right <= strip.right + 0.5 && r.left >= strip.left - 0.5, label: b.textContent.trim() };
      });
      ok(tab.inCost && tab.module === 'estimate' && tab.visible && tab.inside && /Trades/.test(tab.label), M + ': Trades is a sub-tab of the Cost tab, owned by Omega Estimate, on screen ' + JSON.stringify(tab));
      await page.click('#ct-takeoff');
      await page.waitForFunction(function () { var s = OmegaTakeoff._state(); return s.ans && !s.busy; }, null, { timeout: 20000 });
      await page.waitForTimeout(200);

      /* what went to the server: the Run's quantities, nothing priced */
      ok(b0.posted.length === 1, M + ': one request');
      var sent = b0.posted[0];
      eq(sent.q, run.q, M + ': the body carries exactly the Run’s quantities (omegaCostQuantities)');
      ok(!('total' in sent) && !('cents' in sent) && !/"(price|amount|total|cents)"\s*:/.test(JSON.stringify(sent.extra)), M + ': no price or total travels from the page');

      var ans = await page.evaluate(function () { return OmegaTakeoff._state().ans; });
      ok(ans.cents === cents, M + ': the takeoff’s total is the Run total to the cent (' + ans.cents + ')');
      ok(ans.trades.reduce(function (s, t) { return s + t.cents; }, 0) === cents, M + ': the trades add up to it');
      var pane = await page.evaluate(readPane);
      ok(pane.shown && pane.total === '$' + Math.round(run.total).toLocaleString('en-US'), M + ': the pane reads the Run total (' + pane.total + ')');
      var keys = pane.trades.map(function (t) { return t.key; });
      ['concrete', 'electrical', 'storage', 'solar', 'ev', 'utility'].forEach(function (k) { ok(keys.indexOf(k) >= 0, M + ': ' + k + ' is a trade of this site'); });
      eq(keys, ans.trades.map(function (t) { return t.key; }), M + ': every trade the server answered, in its order');
      ok(pane.trades.every(function (t, i) { return t.amt === (ans.trades[i].cents || !(ans.trades[i].info || []).length ? '$' + Math.round(ans.trades[i].cents / 100).toLocaleString('en-US') : '—'); }), M + ': each trade reads its own amount');
      var util = ans.trades.filter(function (t) { return t.key === 'utility'; })[0];
      ok(util.cents === 0 && /not in the Run/.test(util.info[0].note), M + ': the utility’s charges are named, not priced');
      if (M === 'desktop') await page.locator('#rp').screenshot({ path: path.join(output, '01-trades.png') });

      /* a line marks exactly what the Run counted */
      await page.click('.tk-trade[data-trade="concrete"] .tk-th');
      await page.click('.tk-line[data-k="L:site.pad"]');
      await page.waitForTimeout(150);
      var pads = await page.evaluate(function () { return S.elements.filter(function (e) { return e.eqId === 'pad'; }).map(function (e) { return e.id; }); });
      var p1 = await page.evaluate(readPane);
      eq(p1.marked.slice().sort(), pads.slice().sort(), M + ': Equipment pads marks the two pads, and nothing else');
      ok(p1.on[0] === 'L:site.pad' && /2 of 2 marked on the map/.test(p1.hint), M + ': the line is lit and says what it marked: ' + p1.hint);
      /* the editor redraws a pad: the mark comes back */
      await page.evaluate(function (id) { renderEl(S.elements.filter(function (e) { return e.id === id; })[0]); }, pads[0]);
      await page.waitForTimeout(600);
      var p1b = await page.evaluate(readPane);
      ok(p1b.marked.indexOf(pads[0]) >= 0 && p1b.marked.length === 2, M + ': a redrawn pad is marked again');
      if (M === 'desktop') await page.screenshot({ path: path.join(output, '02-pads-marked.png') });
      await page.click('.tk-line[data-k="L:site.pad"]');
      await page.waitForTimeout(100);
      var p1c = await page.evaluate(readPane);
      ok(!p1c.marked.length && !p1c.on.length, M + ': clicking it again clears the marks');

      /* the Level 2 row marks the two Level 2 chargers, not the DC one */
      await page.click('.tk-trade[data-trade="ev"] .tk-th');
      var evRows = await page.evaluate(function () {
        var l = OmegaTakeoff._state().ans.trades.filter(function (t) { return t.key === 'ev'; })[0].lines[0];
        return l.rows.map(function (r, i) { return { k: 'R:ev:' + i, label: r.label, n: r.qty.qty }; });
      });
      var l2 = evRows.filter(function (r) { return r.n === 2; })[0];
      ok(!!l2 && /AC Elite/.test(l2.label) && evRows.length === 2, M + ': the chargers by model: the two Level 2 on one row ' + JSON.stringify(evRows));
      await page.click('.tk-line[data-k="' + l2.k + '"]');
      await page.waitForTimeout(150);
      var shapesBy = await page.evaluate(function () { return { l2: S.shapes.filter(function (s) { return s.kind === 'evl2'; }).map(function (s) { return s.id; }), dc: S.shapes.filter(function (s) { return s.kind === 'evunit'; }).map(function (s) { return s.id; }), solar: S.shapes.filter(function (s) { return s.kind === 'dersolar'; }).map(function (s) { return s.id; }) }; });
      var p2 = await page.evaluate(readPane);
      eq(p2.marked.slice().sort(), shapesBy.l2.slice().sort(), M + ': that row marks the two Level 2 chargers and not the DC one');
      /* the solar line marks the array */
      /* the solar line marks the array (drawn with the default module,
         NextNRG's EAGLE G7B, so it is NextNRG's solar at its own rate) */
      await page.click('.tk-trade[data-trade="solar"] .tk-th');
      var solarKeys = ans.trades.filter(function (t) { return t.key === 'solar'; })[0].lines.map(function (l) { return l.key; });
      eq(solarKeys, ['nextnrg.solar'], M + ': the array is NextNRG’s solar, its own line');
      await page.click('.tk-line[data-k="L:nextnrg.solar"]');
      await page.waitForTimeout(150);
      eq((await page.evaluate(readPane)).marked, shapesBy.solar, M + ': the solar line marks the array');
      /* the underground conduit, on the BOM */
      await page.click('.tk-trade[data-trade="electrical"] .tk-th');
      var ug = await page.evaluate(function () { return S.conduits.filter(function (c) { return c.condType === 'PVC-UG'; }).map(function (c) { return c.id; }); });
      await page.click('.tk-line[data-k="I:conduit:PVC-UG"]');
      await page.waitForTimeout(150);
      eq((await page.evaluate(readPane)).marked, ug, M + ': the underground conduit row marks the run');
      await page.click('.tk-line[data-k="I:conduit:PVC-UG"]');

      /* selecting a piece names its line */
      var panel = await page.evaluate(function () { return S.elements.filter(function (e) { return e.eqId === 'panel'; })[0].id; });
      await page.evaluate(function (id) { selEl(id); }, panel);
      await page.waitForTimeout(700);
      var p3 = await page.evaluate(readPane);
      ok(p3.fromSel[0] === 'L:site.panel' && /Selected on the map: Electrical › Panelboards/.test(p3.hint), M + ': a selected panelboard names its line ' + JSON.stringify(p3.fromSel) + ' ' + p3.hint);
      await page.evaluate(function (id) { selEl(null); selectShape(id); }, shapesBy.dc[0]);
      await page.waitForTimeout(700);
      var p4 = await page.evaluate(readPane);
      ok(/^R:ev:/.test(p4.fromSel[0]) && /EV charging › EV chargers, equipment \+ install › /.test(p4.hint), M + ': a selected DC charger names its row: ' + p4.hint);
      var pole = await page.evaluate(function () { return S.elements.filter(function (e) { return e.eqId === 'pole'; })[0].id; });
      await page.evaluate(function (id) { try { _clearShapeSel(); } catch (e) {} selEl(id); }, pole);
      await page.waitForTimeout(700);
      ok(/not counted by any line of the Run/.test((await page.evaluate(readPane)).hint), M + ': a utility pole is not counted by any line, and says so');
      await page.evaluate(function () { selEl(null); });
      if (M === 'desktop') await page.locator('#rp').screenshot({ path: path.join(output, '03-selection.png') });

      /* the CSV: every line, to the cent */
      var dl = page.waitForEvent('download', { timeout: 5000 }).catch(function () { return null; });
      await page.click('#cst-takeoff [data-tk="csv"]');
      var download = await dl, csv = await page.evaluate(function () { return OmegaTakeoff._state().lastCsv; });
      var rows = csv.split('\n'), total = rows[rows.length - 1];
      var nLines = 0, nRows = 0, nInfo = 0, sumLines = 0;
      ans.trades.forEach(function (t) { t.lines.forEach(function (l) { nLines++; sumLines += l.cents; nRows += (l.rows || []).length; }); nInfo += (t.info || []).length; });
      ok(rows.length === 1 + nLines + nRows + nInfo + 1 && /^Total,/.test(total) && total.indexOf((cents / 100).toFixed(2)) > 0 && sumLines === cents, M + ': the CSV has every line, row and quantity, and the total to the cent');
      ok(!!download && /takeoff-by-trade\.csv$/.test(download.suggestedFilename()), M + ': CSV saves a file');

      /* a trade's scope of work: quantities, never a price */
      await page.click('.tk-trade[data-trade="electrical"] [data-tk="scope"]');
      await page.waitForTimeout(150);
      var scope = await page.evaluate(function () { return { text: OmegaTakeoff._state().lastScope, btn: document.querySelector('.tk-trade[data-trade="electrical"] [data-tk="scope"]').textContent }; });
      ok(/^Scope of work: Electrical \(CSI Division 26\)/.test(scope.text) && /Panelboards: 1 EA/.test(scope.text) && /Underground conduit \(2" PVC Sch40\): \d/.test(scope.text), M + ': the electrical scope lists its lines and the conduit');
      ok(!/\$/.test(scope.text) && /utility/.test(scope.text) && /Scope copied/.test(scope.btn), M + ': and carries no price, says what is not in it, and says it was copied');

      /* a calibrated map: the fence and the pads' area, measured as the 3D
         model measures them (the editor's Calibrate Scale sets pxPerFt) */
      if (M === 'desktop') {
        var before = await page.evaluate(function () { return OmegaTakeoff._state().ans; });
        ok(!JSON.stringify(before).match(/"fence"|\d SF/), M + ': on an uncalibrated map no fence feet or pad area are given');
        await page.evaluate(function () { S.pxPerFt = 6; updateCostEst(); });
        await page.waitForFunction(function () { var s = OmegaTakeoff._state(); return s.ans && !s.busy && /"key":"fence"/.test(JSON.stringify(s.ans)); }, null, { timeout: 20000 });
        var cal = await page.evaluate(function () {
          var site = OmegaSiteVis.read(), sf = 0, ft = 0, fenceIds = [];
          site.items.forEach(function (it) { if (it.src === 'element' && it.ref.eqId === 'pad') sf += it.wf * it.lf; if (it.arch === 'fence' && !it.hidden) { ft += OmegaSiteVis.fenceFt(it); fenceIds.push(it.id); } });
          var a = OmegaTakeoff._state().ans, civil = a.trades.filter(function (t) { return t.key === 'civil'; })[0], conc = a.trades.filter(function (t) { return t.key === 'concrete'; })[0];
          return { sf: Math.round(sf), ft: Math.round(ft), fenceIds: fenceIds, padText: conc.lines[0].qty.text, fence: civil.info.filter(function (i) { return i.key === 'fence'; })[0] };
        });
        ok(cal.sf > 0 && cal.padText === '2 EA · ' + cal.sf.toLocaleString('en-US') + ' SF', M + ': the pads read their area off the map: ' + cal.padText);
        ok(cal.fence && cal.fence.qty.qty === cal.ft && /not priced in the Run/.test(cal.fence.note), M + ': the fence reads its feet, unpriced: ' + JSON.stringify(cal.fence && cal.fence.qty));
        await page.click('.tk-trade[data-trade="civil"] .tk-th');
        await page.click('.tk-line[data-k="I:fence"]');
        await page.waitForTimeout(150);
        eq((await page.evaluate(readPane)).marked, cal.fenceIds, M + ': the fence row marks the fence');
        await page.click('.tk-line[data-k="I:fence"]');
        await page.locator('#rp').screenshot({ path: path.join(output, '03b-calibrated.png') });
      }

      /* the phone: the pane fits */
      var fit = await page.evaluate(function () { var p = document.getElementById('cst-takeoff'); return { sw: p.scrollWidth, cw: p.clientWidth, sx: document.documentElement.scrollWidth, vw: innerWidth }; });
      ok(fit.sw <= fit.cw + 1 && fit.sx <= fit.vw + 1, M + ': the pane never scrolls sideways ' + JSON.stringify(fit));
      if (M === 'phone') await page.screenshot({ path: path.join(output, '06-phone-trades.png') });

      /* the 3D Site Visualizer: a marked line is boxed in the model */
      await page.click('.tk-line[data-k="L:site.pad"]');
      await page.evaluate(function () { OmegaSiteVis.open(); });
      await page.waitForFunction(function () { var V = OmegaSiteVis._V(); return V && V.site && V.layers && document.getElementById('ov-load').style.display === 'none'; }, null, { timeout: 30000 });
      var t0 = await page.evaluate(function () { return OmegaTakeoff._state().ticks; });
      await page.waitForFunction(function () { return Object.keys(OmegaTakeoff._state().helpers).length > 0; }, null, { timeout: 15000 }).catch(function () {});
      var t1 = await page.evaluate(function () { return OmegaTakeoff._state().ticks; });
      console.log('  (' + M + ': ' + (t1 - t0) + ' ticks while the model came up)');
      var v1 = await page.evaluate(function () {
        var s = OmegaTakeoff._state(), c = document.getElementById('tk-card'), V = OmegaSiteVis._V(), found = [];
        if (V && V.root) V.root.traverse(function (o) { if (o.userData && o.userData.itemId && s.marked.indexOf(o.userData.itemId) >= 0) found.push(o.userData.itemId + ':' + o.visible); });
        return { boxes: Object.keys(s.helpers).sort(), card: c ? c.innerText : '', inVis: !!(c && c.closest('#ovis')), dbg: { active: s.active, marked: s.marked, found: found, on: document.getElementById('ovis').className } };
      });
      if (!v1.boxes.length) v1.dbg.manual = await page.evaluate(function () {
        var s = OmegaTakeoff._state(), thrown = '';
        try { OmegaTakeoff.tick(); } catch (e) { thrown = e.message + ' ' + (e.stack || '').split('\n').slice(0, 4).join(' / '); }
        return { thrown: thrown, after: Object.keys(s.helpers), timer: !!s.timer };
      });
      eq(v1.boxes, pads.slice().sort(), M + ': the pads are boxed in the model ' + JSON.stringify(v1.dbg));
      ok(v1.inVis && /Concrete/i.test(v1.card) && /Equipment pads/.test(v1.card) && /2 marked in the model/.test(v1.card), M + ': with a card naming the line: ' + JSON.stringify(v1.card) + JSON.stringify(v1.dbg));
      if (M === 'desktop') await page.screenshot({ path: path.join(output, '04-3d-pads.png') });
      /* a piece picked in the model shows its own line */
      await page.evaluate(function (id) { OmegaSiteVis._V().selectedModel = id; }, shapesBy.dc[0]);
      await page.waitForTimeout(700);
      var v2 = await page.evaluate(function () { var s = OmegaTakeoff._state(), c = document.getElementById('tk-card'); return { boxes: Object.keys(s.helpers), card: c ? c.innerText : '', active: s.active }; });
      eq(v2.boxes, shapesBy.dc, M + ': picking the DC charger in the model boxes its row');
      ok(/EV charging/i.test(v2.card) && /^R:ev:/.test(v2.active), M + ': and the card names it: ' + JSON.stringify(v2.card));
      if (M === 'desktop') await page.screenshot({ path: path.join(output, '05-3d-picked.png') });
      await page.evaluate(function (id) { OmegaSiteVis._V().selectedModel = id; }, pole);
      await page.waitForTimeout(700);
      var v3 = await page.evaluate(function () { var s = OmegaTakeoff._state(), c = document.getElementById('tk-card'); return { boxes: Object.keys(s.helpers).length, card: c ? c.innerText : '' }; });
      ok(v3.boxes === 0 && /Not a line of the Run/.test(v3.card), M + ': a pole picked in the model is not a line of the Run, and says so');
      await page.click('#tk-card [data-tk="x"]');
      await page.waitForTimeout(500);
      var v4 = await page.evaluate(function () { return { card: !!document.getElementById('tk-card'), boxes: Object.keys(OmegaTakeoff._state().helpers).length, marks: document.querySelectorAll('.tk-hl').length }; });
      ok(!v4.card && !v4.boxes && !v4.marks, M + ': closing the card takes the boxes and the marks away');
      /* closing the visualizer takes the boxes with it */
      await page.evaluate(function (id) { OmegaTakeoff._state().quiet = false; OmegaSiteVis._V().selectedModel = id; }, pads[1]);
      await page.waitForTimeout(700);
      ok((await page.evaluate(function () { return Object.keys(OmegaTakeoff._state().helpers).length; })) === 2, M + ': a pad picked in the model boxes both pads');
      await page.click('#ov-close');
      await page.waitForTimeout(700);
      var v5 = await page.evaluate(function () { return { boxes: Object.keys(OmegaTakeoff._state().helpers).length, card: !!document.getElementById('tk-card'), marks: document.querySelectorAll('.tk-hl').length }; });
      ok(!v5.boxes && !v5.card && v5.marks === 2, M + ': closing the visualizer removes the boxes; the map keeps its marks');

      /* another Cost sub-tab clears the marks */
      await page.evaluate(function () { setCostTab('costs'); });
      await page.waitForTimeout(500);
      ok(!(await page.evaluate(function () { return document.querySelectorAll('.tk-hl').length; })), M + ': leaving Trades clears the marks');

      var late = errors.slice(b0.bootErrors);
      ok(!late.length, M + ': no page error after boot' + (late.length ? ': ' + late.join(' | ') : ''));
      ok(b0.unanswered.indexOf('/api/takeoff') < 0, M + ': /api/takeoff was answered');
      if (b0.unanswered.length) console.log('  (' + M + ': offline producers the editor asked for: ' + b0.unanswered.filter(function (u, i) { return b0.unanswered.indexOf(u) === i; }).join(', ') + ')');
      await b0.context.close();
    }

    /* a package without Omega Estimate: no Cost tab, so no Trades */
    var c0 = await boot(browser, base, ['lite', 'plansets'], { name: 'no-estimate', w: 1440, h: 960 });
    var hidden = await c0.page.evaluate(function () { var t = document.getElementById('ct-takeoff'), c = document.getElementById('rp-tab-cost'); return { tab: !!(t && t.offsetParent), cost: !!(c && c.offsetParent) }; });
    ok(!hidden.tab && !hidden.cost, 'no Omega Estimate: neither the Cost tab nor Trades shows ' + JSON.stringify(hidden));
    ok(!(c0.errors.slice(c0.bootErrors).length), 'no Omega Estimate: no page error after boot');
    await c0.context.close();
  } finally { await browser.close(); server.close(); }
  console.log('Takeoff render: ' + count + ' checks passed; screenshots in ' + output);
}
run().catch(function (e) { console.error(e); process.exit(1); });
