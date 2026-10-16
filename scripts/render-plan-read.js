#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Build › Read Plans in the FULL canonical editor.html, signed in on an
 * offline Firebase stand-in, a packaged Omega Design workspace, on a desktop
 * (dark and light) and a 390px phone.
 *
 * The sample plan set (scripts/_lib/plan-fixture.js) is dropped on the
 * dialog as a PDF; pdf.js renders each sheet and pulls its text layer, the
 * page posts each one to /api/plan-read, and the route answers with the
 * REAL library (api/_lib/plan-read.js normalize and check) on the reader's
 * canned answer for that page. Only the model call is stood in for.
 *
 * Holds: the button is on Build › 1 · Site; each sheet goes as a JPEG of at
 * most 2,400 px with its own text layer (the schedule's words reach the
 * server); the review shows the 1,200 vs 1,290 kWh disagreement, crops of
 * the sheet, the low-confidence box unticked and solar listed only; Place
 * puts exactly the ticked units on the drawing as ONE undo step (eight
 * elements, eight Level 2 and two DC fast charger shapes), the Run's own
 * quantities then carry them (the battery's rating, the chargers by kind,
 * the gear counts), and S.planRead rides on the project. What changed since
 * the plans: as placed, every item reads as read; after a battery is
 * re-rated, a charger deleted and a meter dropped by hand, those three
 * rows (and the stated charger count) differ, in the dialog, the CSV, sheet E0.1 and the plot plan export
 * (which offers E0.1 only once a read is on the project). Fails on a page
 * error, a modal wider than the phone, or an /api/ call nobody answers.
 *
 * pdf.js is the editor's own cdnjs build, fetched once into a cache (curl);
 * with no network the PDF steps are skipped and a sheet is dropped as an
 * image instead, so the check still runs.
 *   node scripts/render-plan-read.js [--shots DIR]
 */
'use strict';
var fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), assert = require('assert'), cp = require('child_process');
var F = require('./_lib/firestore-double');
F.mock('../api/_lib/admin', { handler: function (fn) { return fn; }, db: function () { return null; }, httpError: function (s, m) { var e = new Error(m); e.status = s; return e; } });
var X = require('../api/_lib/package-access'), EC = require('../api/_lib/editor-cost'), ES = require('../api/_lib/editor-score');
var P = require('../api/_lib/plan-read'), FX = require('./_lib/plan-fixture');
var ROOT = path.join(__dirname, '..');
var argShots = process.argv.indexOf('--shots'), output = argShots > 0 ? path.resolve(process.argv[argShots + 1]) : (process.env.PLAN_READ_SHOTS || path.join(os.tmpdir(), 'omega-plan-read'));
var chromium = require(process.env.PLAYWRIGHT || 'playwright').chromium, count = 0;
function ok(value, label) { assert(value, label); count++; }

var PDFJS = { 'pdf.min.js': 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', 'pdf.worker.min.js': 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js' };
function pdfjsCache() {
  var dir = path.join(os.tmpdir(), 'omega-pdfjs-3.11.174'), have = {};
  try { fs.mkdirSync(dir, { recursive: true }); } catch (e) {}
  Object.keys(PDFJS).forEach(function (f) {
    var file = path.join(dir, f);
    if (!fs.existsSync(file) || fs.statSync(file).size < 10000) { try { cp.execFileSync('curl', ['-sSfL', '--max-time', '60', '-o', file, PDFJS[f]], { stdio: 'ignore' }); } catch (e) {} }
    if (fs.existsSync(file) && fs.statSync(file).size > 10000) have[f] = fs.readFileSync(file);
  });
  return have['pdf.min.js'] && have['pdf.worker.min.js'] ? have : null;
}

var server = http.createServer(function (req, res) {
  var pathname = new URL(req.url, 'http://localhost').pathname, file = path.resolve(ROOT, '.' + pathname);
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  var mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
  res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream'); res.end(fs.readFileSync(file));
});

/* the Firebase compat surface the editor touches, offline (the shape
   render-editor-plan.js uses); a packaged Omega Design workspace */
function fixture() {
  window.__billing = { packaged: true, packagingState: 'paid', modules: ['lite'] };
  var user = { uid: 'plan-reader', email: 'designer@sunrise.example', emailVerified: true, displayName: 'Plan Reader', getIdToken: function () { return Promise.resolve('offline-fixture'); } };
  function snapshot(p) {
    var data = /billing\/current$/.test(p) ? window.__billing : /^omega_orgs\/[^/]+$/.test(p) ? { name: 'Sunrise Solar', status: 'active', domains: [location.hostname] } : /members\//.test(p) ? { role: 'owner', status: 'active' } : null;
    return { exists: !!data, id: p.split('/').pop(), data: function () { return data; }, docs: [], empty: true, forEach: function () {} };
  }
  function ref(p) {
    return { collection: function (n) { return ref(p + '/' + n); }, doc: function (n) { return ref(p + '/' + n); },
      get: function () { return Promise.resolve(snapshot(p)); }, onSnapshot: function (fn) { setTimeout(function () { fn(snapshot(p)); }, 0); return function () {}; },
      where: function () { return this; }, orderBy: function () { return this; }, limit: function () { return this; },
      set: function () { throw new Error('Unexpected fixture write: ' + p); }, update: function () { throw new Error('Unexpected fixture update: ' + p); },
      add: function () { return Promise.resolve({ id: 'fixture-created' }); } };
  }
  var db = { collection: function (n) { return ref(n); }, settings: function () {}, enablePersistence: function () { return Promise.resolve(); } };
  window.__user = user; window.__listeners = [];
  var auth = { currentUser: null, onAuthStateChanged: function (fn) { window.__listeners.push(fn); return function () {}; }, getRedirectResult: function () { return Promise.resolve({}); }, setPersistence: function () { return Promise.resolve(); }, signOut: function () { return Promise.resolve(); } };
  function firestore() { return db; }
  firestore.FieldValue = { serverTimestamp: function () { return 'fixture-time'; } };
  function authentication() { return auth; }
  authentication.Auth = { Persistence: { LOCAL: 'local' } };
  authentication.GoogleAuthProvider = function () { this.setCustomParameters = function () {}; };
  var app = { firestore: firestore, auth: authentication };
  window.firebase = { apps: [app], initializeApp: function () { return app; }, app: function () { return app; }, firestore: firestore, auth: authentication };
  window.CLEARSKY_CONFIG = { firebase: {}, adminDomains: ['clearsky-usa.com'], tenant: { orgId: 'sunrise.example', name: 'Sunrise Solar', status: 'active' } };
  window.alert = function () {};
  window.confirm = function () { return true; };
}


/* Run one export in the page, then undo exactly what it opened: elements it
   added to the body are removed, dialogs it showed are hidden again. Never
   a sweep by id: the editor keeps hidden dialogs it expects to find (the
   Viability Workflow's Escape handler reads #viability-modal). */
function runExport(fn, wait) {
  function visible() { return Array.prototype.filter.call(document.querySelectorAll('.modal-bg,.modal,[role=dialog],[id$=-modal]'), function (m) { var r = m.getBoundingClientRect(); return getComputedStyle(m).display !== 'none' && getComputedStyle(m).visibility !== 'hidden' && r.width > 0 && r.height > 0; }); }
  var n0 = document.body.children.length, shown0 = visible(), thrown = null;
  try { window[fn](); } catch (e) { thrown = e.message; }
  return new Promise(function (res) { setTimeout(function () {
    var added = Array.prototype.slice.call(document.body.children, n0), text = added.map(function (n) { return n.innerText || ''; }).join('\n');
    visible().forEach(function (m) { if (shown0.indexOf(m) < 0 && added.indexOf(m) < 0) { text += '\n' + (m.innerText || ''); m.style.display = 'none'; } });
    added.forEach(function (n) { if (n.id !== 'omega-editor-gate') try { n.remove(); } catch (e) {} });
    res({ text: text, thrown: thrown });
  }, wait || 2500); });
}

async function run() {
  fs.mkdirSync(output, { recursive: true });
  var built = await FX.build(), answers = FX.answers(built.marks), pdfPath = path.join(output, 'sample-plan-set.pdf');
  fs.writeFileSync(pdfPath, built.bytes);
  var pdfjs = pdfjsCache();
  if (!pdfjs) console.log('  (pdf.js not reachable: the PDF steps are skipped; one sheet is dropped as an image)');
  await new Promise(function (resolve) { server.listen(0, '127.0.0.1', resolve); });
  var base = 'http://127.0.0.1:' + server.address().port;
  var browser = await chromium.launch({ executablePath: process.env.CHROME || chromium.executablePath() });
  var view = X.project({ emailVerified: true }, { packaged: true, packagingState: 'paid', accessUntil: Date.now() + 30 * 86400000, modules: ['lite'] }, { status: 'active' }, { role: 'owner', status: 'active' });
  var staffView = X.project({ staff: true }, { packaged: true }, null, null, Date.now());
  try {
    for (var mode of [{ name: 'desktop-dark', w: 1440, h: 960, scheme: 'dark' }, { name: 'desktop-light', w: 1440, h: 960, scheme: 'light' }, { name: 'phone', w: 390, h: 844, scheme: 'dark' }]) {
      var posted = [], unanswered = [], used = 0, lastQ = null, lastRollup = null, baselineErrors = {}, changesPosts = [];
      var context = await browser.newContext({ viewport: { width: mode.w, height: mode.h }, colorScheme: mode.scheme, deviceScaleFactor: mode.name === 'phone' ? 2 : 1 });
      await context.addInitScript(fixture);
      await context.route('**/*', function (route) {
        var req = route.request(), url = new URL(req.url());
        function json(status, body) { return route.fulfill({ status: status, contentType: 'application/json', body: JSON.stringify(body) }); }
        if (url.hostname === 'cdnjs.cloudflare.com' && /pdf\.js\/3\.11\.174\//.test(url.pathname) && pdfjs) return route.fulfill({ status: 200, contentType: 'text/javascript', body: pdfjs[path.basename(url.pathname)] });
        if (url.origin !== base) return route.fulfill({ status: 200, body: '' });
        if (url.pathname === '/api/package-access') return json(200, view);
        if (url.pathname === '/api/package-catalog') return json(403, { error: 'Pricing is not enabled' });
        if (url.pathname === '/api/plan-change') return json(503, { error: 'Price book not seeded' });
        if (url.pathname === '/api/cost-rollup') { lastQ = req.postDataJSON(); lastRollup = EC.rollup(lastQ); return json(200, lastRollup); }
        if (url.pathname === '/api/editor-score') { var sb = req.postDataJSON(); return json(200, sb.action === 'prequal' ? ES.prequal(sb) : ES.interconnect(sb)); }
        if (url.pathname === '/api/plan-read') {
          var b = req.postDataJSON();
          if (b.action === 'check') return json(200, { ok: true, result: P.check(b.sheets.map(P.revive)) });
          if (b.action === 'changes') { changesPosts.push(b); return json(200, { ok: true, result: P.changes(b.read, b.now) }); }
          posted.push({ page: b.sheet.page, of: b.sheet.of, text: b.sheet.text, imageBytes: Buffer.from(b.sheet.image.split(',')[1], 'base64'), fileName: b.fileName });
          var page = ((b.sheet.page - 1) % 3) + 1;
          return new Promise(function (r) { setTimeout(r, 450); }).then(function () { used++; return json(200, { ok: true, cached: false, sheet: P.normalize(answers[page], { page: b.sheet.page }), today: { used: used, of: 80 } }); });
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
      if (mode.name === 'desktop-dark') {
        /* the exports on an EMPTY drawing, every module open: the errors the
           offline page already raises, which the downstream step allows */
        await page.evaluate(function (v) { OmegaCaps.setPackage(v); OmegaCaps.apply('standard'); }, staffView);
        for (var bfn of ['openBomSourcing', 'openOneLineExport', 'openBlueprintExport', 'openProposalExport', 'exportSpecSheet']) {
          var b0 = errors.length;
          await page.evaluate(runExport, bfn);
          await page.waitForTimeout(300);
          baselineErrors[bfn] = errors.slice(b0); errors.length = b0;
        }
        /* no read on the project yet: the plot plan export and the bundle
           offer no E0.1 */
        var noRead = await page.evaluate(async function () {
          S.resultsStale = false;   /* an empty drawing: nothing to run before an export */
          await openPlotPlanExport();   /* the map capture runs first; the dialog opens after it */
          var row = document.getElementById('pp-e01-row'), cb = document.getElementById('pp-e01'), d4 = d4BuildRows().filter(function (r) { return r.id === 'sheet:E0.1'; })[0];
          var out = { row: getComputedStyle(row).display, checked: cb.checked, d4: d4 && { ok: d4.ok, why: d4.why } };
          _ppClose(); return out;
        });
        eq(noRead, { row: 'none', checked: false, d4: { ok: false, why: 'read the customer\u2019s plan set first (Build \u203a Read Plans)' } }, 'no read yet: no E0.1 in the plot plan export, and the bundle says why');
        await page.evaluate(function (v) { OmegaCaps.setPackage(v); OmegaCaps.apply('standard'); }, view);
        await page.waitForTimeout(300);
      }

      /* the button, on Build › 1 · Site, open on Omega Design */
      var btn = page.locator('#rb-plan-read');
      if (mode.name !== 'phone') {
        ok(await btn.isVisible(), mode.name + ': Read Plans is on Build');
        ok(await page.evaluate(function () { var b = document.getElementById('rb-plan-read'); return /1\s*·\s*Site/.test(b.closest('.rpanel').querySelector('.rpanel-cap').textContent) && OmegaCaps.allowedElement(b); }), mode.name + ': in 1 · Site, and Omega Design opens it');
        if (mode.name === 'desktop-dark') await page.locator('#ribbon').screenshot({ path: path.join(output, '01-ribbon-read-plans.png') });
      }
      await page.evaluate(function () { openPlanRead(); });
      await page.waitForSelector('#plan-read-modal #pr-drop');
      if (mode.name === 'desktop-dark') await page.screenshot({ path: path.join(output, '02-drop-a-plan-set.png') });

      var sheetsExpected = 3;
      if (pdfjs) {
        await page.setInputFiles('#pr-file', pdfPath);
        await page.waitForSelector('#plan-read-modal .pr-page');
        await page.waitForFunction(function () { return document.querySelectorAll('#plan-read-modal .pr-page canvas').length === 3; }, null, { timeout: 30000 });
        ok(await page.locator('#pr-read').textContent() === 'Read 3 sheets', mode.name + ': three sheets ticked to read');
        if (mode.name === 'desktop-dark') await page.screenshot({ path: path.join(output, '03-sheets.png') });
      } else {
        sheetsExpected = 1;
        var png = path.join(output, 'sheet-3.png');
        cp.execFileSync('pdftoppm', ['-r', '60', '-f', '3', '-l', '3', '-png', '-singlefile', pdfPath, png.replace(/\.png$/, '')]);
        await page.setInputFiles('#pr-file', png);
        await page.waitForSelector('#plan-read-modal .pr-page');
      }
      await page.click('#pr-read');
      if (mode.name === 'desktop-dark') { await page.waitForSelector('#plan-read-modal .pr-st span'); await page.waitForTimeout(150); await page.screenshot({ path: path.join(output, '04-reading.png') }); }
      await page.waitForSelector('#pr-place', { timeout: 60000 });
      await page.waitForTimeout(400);

      /* what the page sent: one JPEG per sheet, at most 2,400 px, with its own words */
      ok(posted.length === sheetsExpected, mode.name + ': one read per sheet (' + posted.length + ')');
      posted.forEach(function (p) {
        ok(p.imageBytes[0] === 0xff && p.imageBytes[1] === 0xd8 && p.imageBytes.length < 3400000, mode.name + ': page ' + p.page + ' went as a JPEG under the cap (' + Math.round(p.imageBytes.length / 1024) + ' KB)');
        var m = /\xff\xc0..([\s\S])([\s\S]{2})([\s\S]{2})/.exec(p.imageBytes.toString('latin1'));
        if (m) { var h = (m[2].charCodeAt(0) << 8) | m[2].charCodeAt(1), w = (m[3].charCodeAt(0) << 8) | m[3].charCodeAt(1); ok(Math.max(w, h) <= 2400 && Math.max(w, h) >= (pdfjs ? 2300 : 100), mode.name + ': page ' + p.page + ' is ' + w + '×' + h); }
      });
      if (pdfjs) {
        var p3 = posted.filter(function (p) { return p.page === 3; })[0];
        ok(p3 && /EQUIPMENT SCHEDULE/.test(p3.text) && /XS-1290/.test(p3.text) && /300 kW \/ 1,290 kWh/.test(p3.text), mode.name + ': the schedule’s own words went with E-601');
        ok(posted.every(function (p) { return p.fileName === 'sample-plan-set.pdf' && p.of === 3; }), mode.name + ': each read names the file and the sheet count');
      }

      /* the review */
      var review = await page.evaluate(function () {
        var b = document.getElementById('pr-body');
        return { text: b.textContent, crops: b.querySelectorAll('canvas[data-crop]').length, warn: b.querySelectorAll('.pr-warn').length,
          unticked: Array.prototype.filter.call(b.querySelectorAll('input[data-item]'), function (i) { return !i.checked && !i.disabled; }).length,
          listed: b.querySelectorAll('input[data-item]:disabled').length, place: document.getElementById('pr-place').textContent,
          wide: document.querySelector('#plan-read-modal .pr-card').getBoundingClientRect().width, vw: innerWidth };
      });
      if (pdfjs) {
        ok(/1,200 kWh on E-001/.test(review.text) && /1,290 kWh on E-601/.test(review.text), mode.name + ': the disagreement is shown with both sheets');
        ok(review.warn === 1 && review.unticked === 1 && review.listed >= 3, mode.name + ': one warning, the low-confidence box unticked, solar and runs listed only');
        ok(review.crops >= 20, mode.name + ': every read carries its crop of the sheet (' + review.crops + ')');
        ok(review.place === 'Place 18 on the drawing', mode.name + ': 18 units will be placed (' + review.place + ')');
      }
      ok(review.wide <= review.vw + 0.5, mode.name + ': the dialog fits the screen');
      if (mode.name === 'desktop-dark') {
        await page.screenshot({ path: path.join(output, '05-review.png') });
        await page.evaluate(function () { var t = document.querySelector('#pr-body table'); if (t) t.scrollIntoView(); });
        await page.waitForTimeout(150);
        await page.screenshot({ path: path.join(output, '06-review-equipment.png') });
        await page.evaluate(function () { var s = document.querySelectorAll('#pr-body .pr-sec'); s[s.length - 1].scrollIntoView(); });
        await page.waitForTimeout(150);
        await page.screenshot({ path: path.join(output, '07-review-facts.png') });
        await page.locator('#pr-body canvas[data-crop]').first().click();
        await page.waitForSelector('#pr-zoom canvas');
        await page.waitForTimeout(150);
        await page.screenshot({ path: path.join(output, '08-where-it-was-read.png') });
        await page.keyboard.press('Escape');
        ok(!(await page.locator('#pr-zoom').count()) && (await page.locator('#plan-read-modal').count()) === 1, 'Escape closes the sheet view, not the dialog');
      }
      if (mode.name === 'desktop-light') await page.screenshot({ path: path.join(output, '09-review-light.png') });
      if (mode.name === 'phone') {
        await page.screenshot({ path: path.join(output, '10-review-phone.png') });
        ok(await page.evaluate(function () { var c = document.querySelector('#plan-read-modal .pr-body'); return c.scrollWidth <= c.clientWidth + 1 || getComputedStyle(c).overflowX !== 'visible'; }), 'phone: the review scrolls inside itself, never the page sideways');
      }

      /* place: exactly the ticked units, one undo step, priced by the Run */
      var before = await page.evaluate(function () { return { els: S.elements.length, shapes: (S.shapes || []).length, hist: S.history.length }; });
      await page.click('#pr-place');
      await page.waitForTimeout(500);
      var after = await page.evaluate(function () {
        var mine = function (o) { return o && o.planRead; };
        var els = S.elements.filter(mine), shapes = (S.shapes || []).filter(mine), q = omegaCostQuantities();
        return { els: S.elements.length, shapes: S.shapes.length, hist: S.history.length, kinds: els.map(function (e) { return e.eqId; }).sort(),
          shapeKinds: shapes.map(function (s) { return s.kind; }).sort(), labels: shapes.map(function (s) { return s.tag; }).filter(function (t) { return /^EV-\d$/.test(t); }).length,
          bess: els.filter(function (e) { return e.eqId === 'bess'; }).map(function (e) { return [e.bessKw, e.bessKwh, e.bessModel]; })[0],
          q: { ev: q.ev.items.map(function (i) { return i.kind + ':' + i.kw; }).sort(), fleet: q.fleet, counts: q.counts },
          planRead: S.planRead, prov: els[0] && els[0].planRead,
          cfg: (function () { var b = S.bessList || [], e = els.filter(function (x) { return x.eqId === 'bess'; })[0]; return b.length ? { n: b.length, kw: b[0].kw, kwh: b[0].kwh, qty: b[0].qty, model: b[0].model, mfr: b[0].mfr, linked: !!e && e.bessCfgId === b[0].id } : null; })() };
      });
      if (pdfjs) {
        eq(after.els - before.els, 8, mode.name + ': eight elements placed');
        eq(after.kinds, ['bess', 'disco', 'fence', 'meter', 'panel', 'pcs', 'pcs', 'xfmr'], mode.name + ': battery, disconnect, fence, meter, switchboard, two inverters, transformer');
        eq(after.shapes - before.shapes, 10, mode.name + ': ten charger shapes');
        eq(after.shapeKinds, ['evl2', 'evl2', 'evl2', 'evl2', 'evl2', 'evl2', 'evl2', 'evl2', 'evunit', 'evunit'], mode.name + ': eight Level 2 and two DC fast');
        eq(after.labels, 8, mode.name + ': EV-1 THRU EV-8 became EV-1 … EV-8');
        eq(after.hist - before.hist, 1, mode.name + ': one undo step');
        eq(after.bess, [300, 1290, 'XS-1290'], mode.name + ': the battery carries the schedule’s rating and model');
        ok(after.q.fleet.units >= 1 && Object.keys(after.q.fleet.byModel).some(function (k) { var b = after.q.fleet.byModel[k]; return b.kwh === 1290 && b.kw === 300; }), mode.name + ': the Run’s fleet carries the 300 kW / 1,290 kWh battery ' + JSON.stringify(after.q.fleet));
        eq(after.q.ev.filter(function (k) { return /^evl2:19\.2$/.test(k); }).length, 8, mode.name + ': the Run prices eight Level 2 at 19.2 kW');
        eq(after.q.ev.filter(function (k) { return /^evunit:180$/.test(k); }).length, 2, mode.name + ': and two DC fast at 180 kW');
        ok(after.q.counts.disco === 1 && after.q.counts.meter === 1 && after.q.counts.panel === 1 && after.q.counts.hasXfmr === true, mode.name + ': the gear counts the Run prices');
        ok(after.planRead && after.planRead.fileName === 'sample-plan-set.pdf' && after.planRead.placed === 18 && after.planRead.issues.length === 1 && after.planRead.sheets.length === 3, mode.name + ': S.planRead rides on the project');
        ok(after.planRead.listed.some(function (l) { return l.kind === 'solar_array' && l.kw === 315; }) && after.planRead.listed.some(function (l) { return l.kind === 'conduit_run' && l.lengthFt === 240; }), mode.name + ': what was listed, not drawn, is kept with it');
        ok(after.prov && after.prov.sheet && after.prov.quote, mode.name + ': every placed unit says where it was read');
        eq(after.cfg, { n: 1, kw: '300', kwh: '1290', qty: '1', model: 'XS-1290', mfr: 'Example Storage Co', linked: true }, mode.name + ': the battery is a configured system with the schedule\u2019s make, model and rating, and the placed unit points at it');
      }
      ok((await page.locator('#pr-place').textContent()) === '✓ Placed', mode.name + ': the button says it is done');
      if (pdfjs && mode.name === 'desktop-light') {
        /* Undo takes the placed units back in one step, and the battery's
           configuration with them; Redo brings both back */
        var undone = await page.evaluate(function () {
          undoLast();
          return { els: S.elements.filter(function (e) { return e.planRead; }).length, shapes: (S.shapes || []).filter(function (e) { return e.planRead; }).length,
            cfg: (S.bessList || []).filter(function (b) { return b.planRead; }).length, bomKwh: buildBOM().kwh, redoMarker: !!undoLast.__omeWrapped };
        });
        eq([undone.els, undone.shapes, undone.cfg, undone.bomKwh], [0, 0, 0, 0], mode.name + ': one Undo takes every placed unit and the battery\u2019s configuration back');
        var redone = await page.evaluate(function () {
          document.getElementById('rb-redo').click();
          return { els: S.elements.filter(function (e) { return e.planRead; }).length, cfg: (S.bessList || []).filter(function (b) { return b.planRead; }).length, bomKwh: buildBOM().kwh };
        });
        eq([redone.els, redone.cfg, redone.bomKwh], [8, 1, 1290], mode.name + ': Redo brings the units and the configuration back');
        ok(undone.redoMarker, mode.name + ': the redo module\u2019s marker survives the plan reader\u2019s Undo hook (no second wrap)');
      }
      if (mode.name === 'desktop-dark') {
        await page.screenshot({ path: path.join(output, '11-placed.png') });
        await page.click('#pr-done');
        await page.waitForTimeout(300);
        await page.screenshot({ path: path.join(output, '12-on-the-drawing.png') });

        /* DOWNSTREAM: what was placed from the plan goes through the Run and
           the exports like anything placed by hand. Every module open (a staff
           view), so no export is locked; each export's page errors are
           compared with the same export on an empty drawing in this session,
           so only a NEW failure fails (the offline page lacks some of the
           live page's elements and a few exports already trip on that). */
        await page.evaluate(function (v) { OmegaCaps.setPackage(v); OmegaCaps.apply('standard'); }, staffView);
        await page.evaluate(function () { omegaRunDesign(); });
        await page.waitForFunction(function () { return !S.running; }, null, { timeout: 30000 });
        await page.waitForTimeout(1500);
        var run = lastRollup;
        ok(run && run.lines.ev.units === 10 && run.lines.ev.byModel['L2-192'].qty === 8 && run.lines.ev.byModel['DC-180'].qty === 2, 'downstream: the Run prices the ten chargers by model');
        var l2 = run.lines.ev.byModel['L2-192'], dc = run.lines.ev.byModel['DC-180'];
        ok(l2.eq / l2.qty < 5000 && dc.eq / dc.qty > 20000, 'downstream: Level 2 at a Level 2 price, DC fast at a DC fast price ($' + Math.round(l2.eq / l2.qty) + ' vs $' + Math.round(dc.eq / dc.qty) + ' equipment each)');
        ok(Object.keys(lastQ.fleet.byModel).some(function (k) { return lastQ.fleet.byModel[k].kwh === 1290; }) && run.lines.bess && run.lines.bess.total > 0, 'downstream: the battery is in the Run at its 1,290 kWh');
        ok(await page.evaluate(function () { return window._COST_TOTAL > 0; }), 'downstream: the Run has a total');
        var exportsOut = {};
        for (var fn of ['openBomSourcing', 'openOneLineExport', 'openBlueprintExport', 'openProposalExport', 'exportSpecSheet']) {
          var e0 = errors.length;
          var text = await page.evaluate(runExport, fn);
          await page.waitForTimeout(300);
          exportsOut[fn] = { text: text.text || '', thrown: text.thrown || null, errors: errors.slice(e0) };
          errors.length = e0;   /* judged below against the empty-drawing baseline */
        }
        fs.writeFileSync(path.join(output, 'downstream-exports.json'), JSON.stringify(exportsOut, null, 1));
        Object.keys(exportsOut).forEach(function (fn) {
          var fresh = exportsOut[fn].errors.filter(function (m) { return (baselineErrors[fn] || []).indexOf(m) < 0; });
          ok(!exportsOut[fn].thrown && !fresh.length, 'downstream: ' + fn + ' raises nothing an empty drawing does not ' + JSON.stringify(fresh));
        });
        var bom = exportsOut.openBomSourcing.text;
        ok(/L2-192/.test(bom) && /DC-180/.test(bom), 'downstream: the BOM lists both chargers by the models the schedule printed');
        ok(/1\.29 MWh \/ 0\.30 MW/.test(bom), 'downstream: the BOM carries the battery\u2019s 1.29 MWh / 0.30 MW (a configured system, as the guided build makes one)');
        /* The one-line's "Detected" line counts a configured battery twice
           (its unit's rating plus its configuration: _olInventory), for the
           guided build on main as much as here, so its kW is not asserted;
           the Run, the fleet and the BOM above carry the true 300 kW. */
        ok(/Detected: BOTH — BESS /.test(exportsOut.openOneLineExport.text) && /EV 10 chargers \/ 514 kW/.test(exportsOut.openOneLineExport.text), 'downstream: the one-line detects the battery and the ten chargers at 514 kW');
        ok(lastQ.configured.length === 1 && EC.rollup(Object.assign({}, lastQ, { configured: [] })).lines.bess.total === run.lines.bess.total, 'downstream: the configured entry is shown, never priced twice');
        /* reopening comes back to the read */
        await page.evaluate(function () { openPlanRead(); });
        await page.waitForSelector('#pr-place');
        ok(true, 'reopening returns to the review');
      }
      if (pdfjs) await whatChanged(page, mode, changesPosts);
      ok(!errors.length, mode.name + ': no page errors ' + JSON.stringify(errors));
      ok(!unanswered.filter(function (p) { return /plan-read/.test(p); }).length, mode.name + ': every plan-read call was answered');
      await context.close();
    }
  } finally { await browser.close(); server.close(); }
  console.log('render-plan-read: ' + count + ' checks passed; shots in ' + output);
}
function eq(a, b, m) { assert.deepEqual(a, b, m); count++; }

/* WHAT CHANGED SINCE THE PLANS (Blueprint to Build, Phase 5): the read
   against the drawing as Place left it, then after a designer's edits, as
   the dialog, the CSV, sheet E0.1 and the plot plan export show it. The
   comparison is the REAL library (api/_lib/plan-read.js changes); the page
   only says what the drawing holds. */
async function whatChanged(page, mode, changesPosts) {
  var M = mode.name;
  var pr = await page.evaluate(function () { return S.planRead; });
  ok(pr.v === 2 && pr.items.length === 10 && pr.items.reduce(function (t, it) { return t + it.placed; }, 0) === 18 && pr.items.filter(function (it) { return !it.placed; }).map(function (it) { return it.kind; }).join() === 'junction_box',
    M + ': the read keeps every placeable item with how many were placed (18; the unticked box none)');
  changesPosts.length = 0;
  await page.locator('#pr-changes-btn').click();
  await page.waitForSelector('#plan-read-modal table.pr-ch');
  function grab() {
    return page.evaluate(function () {
      var c = OmegaPlanRead._lastChanges().result, card = document.querySelector('#plan-read-modal .pr-card');
      return { rows: c.rows.map(function (r) { return [r.section, r.label, r.status, r.plans, r.drawing]; }), differ: c.differ, text: document.getElementById('pr-body').textContent,
        wide: card.getBoundingClientRect().width, vw: innerWidth, chips: document.querySelectorAll('#plan-read-modal table.pr-ch .pr-chip').length };
    });
  }
  function st(ch, label, section) { var r = ch.rows.filter(function (x) { return x[1] === label && (!section || x[0] === section); })[0]; return r && r[2]; }
  var ch = await grab(), sent = changesPosts[0];
  ok(sent && sent.now.fromRead.length === 18 && sent.now.counts.charger === 10 && sent.now.counts.bess === 1 && sent.now.counts['eq:pcs'] === 2 && sent.now.totals.bessKwh === 1290,
    M + ': the page sent the drawing as the Run counts it: 18 pieces carrying the read, ten chargers, one battery at 1,290 kWh, two inverters ' + JSON.stringify(sent && sent.now.counts));
  ok(!('issues' in sent.read) && sent.read.items.length === 10 && sent.read.id === pr.id, M + ': and the read, trimmed to what the comparison uses');
  eq(['ESS-1', 'EV-1 THRU EV-8', 'DC-1, DC-2', 'INV-1, INV-2', 'T-1', 'MSB', 'DISC-1', 'M-1', 'Fence'].map(function (l) { return st(ch, l, 'placed'); }),
    ['as-read', 'as-read', 'as-read', 'as-read', 'as-read', 'as-read', 'as-read', 'as-read', 'as-read'], M + ': everything placed reads as read');
  eq(st(ch, 'Junction box', 'placed'), 'not-placed', M + ': the low-confidence box left unticked is not placed');
  ok(ch.rows.some(function (r) { return r[1] === 'Fence' && r[3] === '1 × Fence · 160 ft' && r[4] === '1 × Fence'; }), M + ': a length the plans print for a placed item is shown beside it');
  eq([st(ch, 'Battery power'), st(ch, 'Battery energy'), st(ch, 'Solar (DC)'), st(ch, 'EV chargers', 'stated')], ['as-read', 'differs', 'not-drawn', 'as-read'],
    M + ': the stated totals: the cover’s 1,200 kWh differs from the 1,290 kWh drawn, no solar is drawn');
  ok(/disagree/.test(ch.text) && /not to scale/.test(ch.text), M + ': the plans’ own disagreement is named, and an uncalibrated drawing’s lengths are not compared');
  eq(ch.rows.filter(function (r) { return r[0] === 'added'; }), [], M + ': nothing on the drawing beyond the plans');
  ok(ch.wide <= ch.vw + 0.5 && ch.chips === ch.rows.length, M + ': every row has its status, and the view fits the screen');
  if (M === 'desktop-dark') await page.screenshot({ path: path.join(output, '13-what-changed.png') });
  if (M === 'phone') await page.screenshot({ path: path.join(output, '16-what-changed-phone.png') });

  /* a designer's edits: the battery re-rated, a charger deleted, a meter
     dropped from Insert by hand */
  await page.evaluate(function () {
    var b = S.elements.filter(function (e) { return e.planRead && e.eqId === 'bess'; })[0];
    b.bessKwh = 1500; b.bgbKwh = 1500;
    var c = S.shapes.filter(function (s) { return s.planRead && s.kind === 'evl2'; })[0];
    S.shapes.splice(S.shapes.indexOf(c), 1);
    addEl({ type: 'eq', eqId: 'meter', label: 'M-2', x: 120, y: 120, w: 40, rot: 0 });
    return OmegaPlanRead.whatChanged();
  });
  await page.waitForSelector('#plan-read-modal table.pr-ch');
  var ch2 = await grab();
  eq([st(ch2, 'ESS-1', 'placed'), st(ch2, 'EV-1 THRU EV-8', 'placed'), st(ch2, 'EV chargers', 'stated'), st(ch2, 'Battery energy')], ['changed', 'fewer', 'differs', 'differs'], M + ': re-rated, one fewer, and the stated totals follow');
  ok(ch2.rows.some(function (r) { return r[0] === 'placed' && r[1] === 'ESS-1' && r[4] === '1 × XS-1290 · 300 kW / 1,500 kWh'; }), M + ': the battery’s row shows what the drawing carries now');
  ok(ch2.rows.some(function (r) { return r[0] === 'added' && r[1] === 'Meter' && r[4] === '1 on the drawing'; }), M + ': the meter dropped by hand is on the drawing, not from the plans');
  ok(ch2.differ === ch.differ + 4, M + ': four more rows differ: the battery, the chargers, the stated charger count, the meter (' + ch.differ + ' → ' + ch2.differ + ')');
  var csv = await page.evaluate(function () { return OmegaPlanRead.changesCsv(); });
  ok(/^Section,Item,Sheet,Customer\u2019s plans,Drawing now,Status,Note\n/.test(csv) && csv.split('\n').length === ch2.rows.length + 2 && /Placed from the plans,ESS-1,/.test(csv), M + ': the CSV carries every row and the basis');
  if (M === 'desktop-dark') {
    await page.screenshot({ path: path.join(output, '14-what-changed-edited.png') });
    await page.locator('#pr-foot button', { hasText: 'Preview sheet E0.1' }).click();
    await page.waitForSelector('#pr-zoom svg');
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(output, '15-sheet-e01.png') });
    var sheet = await page.evaluate(function () { return document.querySelector('#pr-zoom svg').textContent; });
    ok(/CHANGES FROM THE CUSTOMER/.test(sheet) && /E0\.1/.test(sheet) && /\u0394 CHANGED/.test(sheet) && /ESS-1/.test(sheet) && /SHEET NOTES/.test(sheet) && !/more rows? in the full comparison/.test(sheet),
      M + ': sheet E0.1 carries every row, the changes marked, in the plan set’s frame');
    await page.keyboard.press('Escape');
    ok(!(await page.locator('#pr-zoom').count()) && (await page.locator('#plan-read-modal').count()) === 1, M + ': Escape closes the sheet, not the dialog');

    /* plan set out: the plot plan export offers E0.1, ticked, and draws it
       from the comparison it asks for */
    changesPosts.length = 0;
    await page.evaluate(function () { OmegaPlanRead.close(); });
    var pp = await page.evaluate(async function () {
      await omegaRunAndWait();   /* an export waits on a Run of the edited drawing, as a person's would */
      await openPlotPlanExport();
      await new Promise(function (r) { setTimeout(r, 400); });   /* the project type ticks its own sheets 60 ms after the dialog opens */
      var row = document.getElementById('pp-e01-row'), cb = document.getElementById('pp-e01'), shown = { row: getComputedStyle(row).display, checked: cb.checked };
      /* E0.1 alone, so the export is quick and shows it is there by itself */
      Array.prototype.forEach.call(document.querySelectorAll('#pp-modal input[type=checkbox]'), function (c) { if (/^pp-[es]\d/.test(c.id) && c.id !== 'pp-e01') c.checked = false; });
      var radios = document.getElementsByName('pp-fmt'); for (var i = 0; i < radios.length; i++) radios[i].checked = radios[i].value === 'pdf';
      var got = null, orig = window._ppExportPDF, warned = [], w0 = console.warn, a0 = window.alert;
      window._ppExportPDF = function (sheets) { got = sheets.map(function (x) { return { no: x.no, svg: x.svg }; }); };
      console.warn = function () { warned.push(Array.prototype.join.call(arguments, ' ')); }; window.alert = function (m) { warned.push('alert: ' + m); };
      try { await _ppExport(); } finally { window._ppExportPDF = orig; console.warn = w0; window.alert = a0; }
      var d4 = d4BuildRows().filter(function (r) { return r.id === 'sheet:E0.1'; })[0];
      return { shown: shown, sheets: got && got.map(function (g) { return g.no; }), svg: got && got[0] && got[0].svg, d4: d4 && { ok: d4.ok, why: d4.why }, warned: warned };
    });
    eq(pp.shown, { row: 'flex', checked: true }, M + ': the plot plan export offers E0.1, ticked, on a project with a read');
    eq(pp.sheets, ['E0.1'], M + ': and exports it ' + JSON.stringify(pp.sheets) + ' ' + JSON.stringify(pp.warned));
    ok(/CHANGES FROM THE CUSTOMER/.test(pp.svg) && /M-2|Meter/.test(pp.svg) && changesPosts.length === 1, M + ': drawn from the comparison the export asked the server for, edits included');
    eq(pp.d4, { ok: true, why: '' }, M + ': the deliverables bundle offers E0.1 too');
    /* a project reopened later starts from its saved read */
    await page.evaluate(function () { OmegaPlanRead.restart(); });
    await page.waitForSelector('#pr-changes-start');
    ok(/sample-plan-set\.pdf/.test(await page.locator('#pr-body').textContent()), M + ': the start screen offers what changed since the saved read');
    await page.evaluate(function () { OmegaPlanRead.close(); });
  }
}
run().catch(function (e) { console.error(e); server.close(); process.exit(1); });
