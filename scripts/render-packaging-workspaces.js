/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Full canonical editor HTML, scripts and observers. External auth/database,
 * Maps and producing APIs use offline adapters; no live reads/writes/charges.
 */
'use strict';
var fs = require('fs'), path = require('path'), http = require('http'), assert = require('assert');
var M = require('../api/_lib/modules'), X = require('../api/_lib/package-access');
var F = require('./_lib/firestore-double'), H = require('./_lib/packaging-billing-fixture');
var ROOT = path.join(__dirname, '..'), output = process.env.WORKSPACE_SHOTS || path.join(ROOT, 'docs/screenshots/packaging-phase-3');
var output5 = process.env.WORKSPACE_SHOTS || path.join(ROOT, 'docs/screenshots/packaging-phase-5');
/* Phase 5: while `live` is set, /api/package-access and /api/plan-change are
 * the REAL handlers over an in-memory Firestore seeded with a paid tenant;
 * QuickBooks is a stand-in that counts invoices. The mock must be installed
 * before the handler is required. */
var LIVE_ORG = 'packaging.example', db = null, caller = null, live = false, sandboxInvoices = 0;
H.mockAdmin(function () { return db; }, function () { return caller; }); H.mockQbo(function () { sandboxInvoices++; });
process.env.PACKAGING_BILLING_ENABLED = 'true'; process.env.QBO_ENV = 'sandbox';
var planChange = require('../api/plan-change');
async function liveProjection() { var snap = await db.doc('omega_orgs/' + LIVE_ORG + '/billing/current').get(); return X.project({ emailVerified: true }, snap.data(), { status: 'active' }, { role: 'owner' }); }
function json(route, status, body) { return route.fulfill({ status: status, contentType: 'application/json', body: JSON.stringify(body) }); }
async function liveChange(route) {
  var req = route.request(), url = new URL(req.url()), body = req.method() === 'POST' ? req.postDataJSON() : {};
  try { return json(route, 200, await planChange({ method: req.method(), headers: {}, query: Object.fromEntries(url.searchParams), body: body }, { setHeader: function () {} })); }
  catch (e) { return json(route, e.status || 500, { error: e.message }); }
}
var chromium = require(process.env.PLAYWRIGHT || 'playwright').chromium, count = 0;
function ok(value, label) { assert(value, label); count++; }
var server = http.createServer(function (req, res) {
  var pathname = new URL(req.url, 'http://localhost').pathname, file = path.resolve(ROOT, '.' + pathname);
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  var mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
  res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream'); res.end(fs.readFileSync(file));
});
function fixture(tier) {
  window.__fixtureWrites = []; window.__fixtureReads = 0;
  var user = { uid:'fixture-user', email:'designer@packaging.example', emailVerified:true, displayName:'Fixture Designer', getIdToken:function () { return Promise.resolve('offline-fixture'); } };
  function snapshot(p) {
    var data = /billing\/current$/.test(p) ? { packaged:true, packagingState:'paid', modules:['lite'] } :
      /^omega_orgs\/[^/]+$/.test(p) ? { name:'Packaging preview', status:'active', domains:[location.hostname] } :
      /members\//.test(p) ? { role:'owner', status:'active' } : null;
    return { exists:!!data, id:p.split('/').pop(), data:function () { return data; }, docs:[], empty:true, forEach:function () {} };
  }
  function ref(p) {
    return { collection:function (n) { return ref(p + '/' + n); }, doc:function (n) { return ref(p + '/' + n); },
      get:function () { window.__fixtureReads++; return Promise.resolve(snapshot(p)); },
      onSnapshot:function (fn) { setTimeout(function () { fn(snapshot(p)); }, 0); return function () {}; },
      where:function () { return this; }, orderBy:function () { return this; }, limit:function () { return this; },
      set:function () { throw new Error('Unexpected fixture write: ' + p); },
      update:function () { throw new Error('Unexpected fixture update: ' + p); },
      add:function (data) { window.__fixtureWrites.push({ path:p, data:data }); return Promise.resolve({ id:'fixture-created' }); }
    };
  }
  var db = { collection:function (n) { return ref(n); }, settings:function () {}, enablePersistence:function () { return Promise.resolve(); } };
  window.__fixtureUser=user; window.__fixtureListeners=[]; var auth = { currentUser:null, onAuthStateChanged:function (fn) { window.__fixtureListeners.push(fn); return function () {}; }, getRedirectResult:function () { return Promise.resolve({}); }, setPersistence:function () { return Promise.resolve(); }, signOut:function () { return Promise.resolve(); } };
  function firestore() { return db; }
  firestore.FieldValue = { serverTimestamp:function () { return 'fixture-time'; } };
  function authentication() { return auth; }
  authentication.Auth = { Persistence:{ LOCAL:'local' } };
  authentication.GoogleAuthProvider = function () { this.setCustomParameters = function () {}; };
  var app = { firestore:firestore, auth:authentication };
  window.firebase = { apps:[app], initializeApp:function () { return app; }, app:function () { return app; }, firestore:firestore, auth:authentication };
  window.CLEARSKY_CONFIG = { firebase:{}, adminDomains:['clearsky-usa.com'], tenant:{ orgId:'packaging.example', name:'Packaging preview', tier:tier, status:'active' } };
  window.alert = function (message) { window.__fixtureAlert = message; };
  
}

async function run() {
  fs.mkdirSync(output, { recursive: true }); fs.mkdirSync(output5, { recursive: true });
  await new Promise(function (resolve) { server.listen(0, '127.0.0.1', resolve); });
  var base = 'http://127.0.0.1:' + server.address().port;
  var browser = await chromium.launch({ executablePath: process.env.CHROME || chromium.executablePath() });
  var packages = { lite: ['lite'], ev: M.starters().ev, developer: M.starters().developer, epc: M.starters().epc, everything: M.catalog().map(function (m) { return m.key; }) };
  try {
    for (var theme of ['light', 'dark']) {
      var view, context = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: theme });
      await context.addInitScript(fixture, 'standard');
      await context.route('**/*', function (route) {
        var url = new URL(route.request().url());
        if (url.origin !== base) return route.fulfill({ status: 200, body: '' });
        if (url.pathname === '/api/plan-change') return live ? liveChange(route) : json(route, 503, { error: 'Offline producer' });
        if (url.pathname === '/api/package-access') {
          if (live) return liveProjection().then(function (p) { return json(route, 200, p); });
          var projection = view;
          if (route.request().method() === 'POST' && view.staff) {
            projection = X.project({ emailVerified: true }, { packaged: true, packagingState: 'paid', accessUntil: Date.now() + 86400000, modules: route.request().postDataJSON().previewModules }, { status: 'active' }, { role: 'owner' });
            projection.canPreview = true; projection.preview = true; projection.starters = M.starters();
          }
          return route.fulfill({ contentType: 'application/json', body: JSON.stringify(projection) });
        }
        if (url.pathname === '/api/package-catalog') {
          var B = require('../api/_lib/pricebook'), P = require('../api/_lib/subscription-pricing'), book = B.proposed();
          return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ canManage: live, modules: M.catalog().map(function (m) { m.priceDisplay = P.money(book.modules[m.key].priceCents) + '/month'; return m; }) }) });
        }
        if (url.pathname.indexOf('/api/') === 0) return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Offline producer"}' });
        return route.continue();
      });
      view = X.project({ emailVerified: true }, { packaged: true, packagingState: 'paid', accessUntil: Date.now() + 86400000, modules: packages.lite }, { status: 'active' }, { role: 'owner' });
      var page = await context.newPage(), errors = [];
      page.on('pageerror', function (e) { errors.push(e.message); });
      await page.goto(base + '/editor.html', { waitUntil: 'domcontentloaded' });
      await page.evaluate(function () { firebase.auth().currentUser = window.__fixtureUser; window.__fixtureListeners.forEach(function (fn) { fn(window.__fixtureUser); }); });
      await page.waitForFunction(function () { return window.OmegaMode && window.OmegaProjectTypes && window.OmegaCaps && OmegaCaps.packageAccess() && OmegaCaps.packageAccess().modules.length && !document.getElementById('omega-editor-gate'); });
      // Let the actual delayed ribbon injectors and shelf initialize.
      await page.waitForTimeout(3000);
      ok(await page.evaluate(function () { return window.__fixtureReads < 100; }), 'empty recent-project result settles');
      for (var name of Object.keys(packages)) {
        view = X.project({ emailVerified: true }, { packaged: true, packagingState: 'paid', accessUntil: Date.now() + 86400000, modules: packages[name] }, { status: 'active' }, { role: 'owner' });
        await page.evaluate(function (v) { OmegaCaps.setPackage(v); OmegaCaps.apply('standard'); }, view);
        for (var workspace of ['l2', 'dcfc', 'bess', 'solarstorage', 'microgrid', 'compute', 'building']) {
          await page.evaluate(function (key) { OmegaWorkspaces.setAll(false); OmegaWorkspaces.setProject(key, null, true); }, workspace);
          if (name === 'lite') ok(await page.evaluate(function () {
            return ['analyze','estimate','compute'].every(function (key) { return getComputedStyle(document.querySelector('#ribbon-tabs [data-page="' + key + '"]')).display === 'none'; });
          }), 'Lite omits paid-only tabs');
          var state = await page.evaluate(function () {
            var C = OmegaCaps, tabs = document.querySelectorAll('#ribbon-tabs .rtab[data-page]'), failures = [];
            function visible(el) { return getComputedStyle(el).display !== 'none' && !el.hidden; }
            for (var i = 0; i < tabs.length; i++) {
              var key = tabs[i].getAttribute('data-page'); if (key === '__file' || !visible(tabs[i])) continue;
              rbTab(key); C.apply('standard');
              var pg = document.querySelector('#ribbon .ribbon-page[data-page="' + key + '"]');
              if (!pg || !visible(pg)) { failures.push('empty tab ' + key); continue; }
              if (pg.scrollWidth > document.getElementById('ribbon').clientWidth + 2) failures.push('overflow ' + key + ':' + pg.scrollWidth);
              var panels = pg.querySelectorAll('.rpanel'), number = 0, groups = 0;
              for (var j = 0; j < panels.length; j++) {
                if (!visible(panels[j])) continue; groups++;
                var controls = Array.from(panels[j].querySelectorAll('.rbtn,.rsbtn,input,select,.home-recent-item')).filter(visible);
                if (!controls.length) failures.push('empty group ' + key + '/' + j);
                var cap = panels[j].querySelector('.rpanel-cap'), n = cap && /^\s*(\d+)\s*[·.]/.exec(cap.textContent);
                if (n && +n[1] !== ++number) failures.push('caption gap ' + key + '/' + cap.textContent);
                controls.forEach(function (el) { if (el.matches('.rbtn,.rsbtn') && !C.allowedElement(el)) failures.push('unowned ' + el.id + ':' + el.textContent.trim()); });
              }
              if (!groups) failures.push('no groups ' + key + ' ' + Array.from(panels).map(function (p) { return [p.className,p.getAttribute('data-package-empty'),p.getAttribute('data-package-hidden'),p.style.display,getComputedStyle(p).display,p.textContent.slice(-60)]; }));
            }
            rbTab('draw'); C.apply('standard');
            ['rb-line', 'rb-polyline', 'rb-rect', 'rb-circle', 'rb-select2'].forEach(function (id) { var el = document.getElementById(id); if (!el || !visible(el)) failures.push('core missing ' + id); });
            return failures;
          });
          if (state.length) await page.screenshot({path:'/tmp/omega-phase-3-matrix-failure.png'});
          ok(!state.length, name + '/' + workspace + '/' + theme + ': ' + state.join('; '));
          await page.evaluate(function () { OmegaWorkspaces.setAll(true); rbTab('home'); });
          var unreachable = await page.evaluate(function () {
            var failures = [];
            if (document.querySelectorAll('#ribbon [data-workspace-hidden]').length) failures.push('workspace hidden');
            var buttons = document.querySelectorAll('#ribbon .rbtn,#ribbon .rsbtn');
            for (var b = 0; b < buttons.length; b++) {
              var el = buttons[b];
              if (!OmegaCaps.allowedElement(el) || el.hasAttribute('data-packaging-retired') || el.hasAttribute('data-shelf-dupe') || el.classList.contains('omega-gated-hidden') || el.hidden) continue;
              if (getComputedStyle(el).display === 'none') failures.push('button ' + el.id + ':' + el.textContent.trim());
              var page = el.closest('.ribbon-page'), tab = page && document.querySelector('#ribbon-tabs [data-page="' + page.getAttribute('data-page') + '"]');
              if (tab && getComputedStyle(tab).display === 'none') failures.push('tab ' + page.getAttribute('data-page') + ' for ' + el.id + ':' + el.textContent.trim());
            }
            return failures;
          });
          ok(!unreachable.length, name + '/' + workspace + ': All tools: ' + unreachable.join('; '));
          await page.evaluate(function () { OmegaWorkspaces.setAll(false); rbTab('home'); OmegaCaps.apply('standard'); });
          await page.screenshot({ path: path.join(output, name + '-' + workspace + '-' + theme + '.png') });
        }
      }
      // Tablet landscape: inspect every owned tab, not just the opening Build page.
      await page.setViewportSize({ width: 1024, height: 768 });
      for (var tabletName of Object.keys(packages)) {
        view = X.project({ emailVerified: true }, { packaged: true, packagingState: 'paid', accessUntil: Date.now() + 86400000, modules: packages[tabletName] }, { status: 'active' }, { role: 'owner' });
        await page.evaluate(function (v) { OmegaCaps.setPackage(v); OmegaWorkspaces.setProject('l2', null, true); OmegaWorkspaces.setAll(true); }, view);
        var tabletFit = await page.evaluate(function () {
          var failures = [], tabs = document.querySelectorAll('#ribbon-tabs .rtab[data-page]');
          for (var t = 0; t < tabs.length; t++) {
            var key = tabs[t].getAttribute('data-page');
            if (key === '__file' || getComputedStyle(tabs[t]).display === 'none') continue;
            rbTab(key); OmegaCaps.apply('standard');
            var pg = document.querySelector('#ribbon .ribbon-page[data-page="' + key + '"]');
            if (pg && pg.scrollWidth > document.getElementById('ribbon').clientWidth + 2) failures.push(key);
          }
          var bar = document.getElementById('omega-workspace-controls');
          if (bar.scrollWidth > window.innerWidth + 2) failures.push('workspace header');
          rbTab('home'); OmegaWorkspaces.setAll(false);
          return failures;
        });
        ok(!tabletFit.length, tabletName + '/' + theme + ' tablet fit: ' + tabletFit.join(', '));
        await page.screenshot({ path: path.join(output, tabletName + '-tablet-' + theme + '.png') });
      }
      await page.setViewportSize({ width: 1280, height: 900 });
      view = X.project({ emailVerified: true }, { packaged: true, packagingState: 'paid', accessUntil: Date.now() + 86400000, modules: ['lite'] }, { status: 'active' }, { role: 'owner' });
      await page.evaluate(function (v) { OmegaCaps.setPackage(v); OmegaCaps.apply('standard'); }, view);
      await page.locator('#omega-package-tab').click();
      await page.waitForFunction(function () { return document.querySelector('#omega-package-menu .opm-price').textContent.indexOf('/month') >= 0; });
      ok(await page.locator('[data-module-card]').count() === M.catalog().length - 1, 'one unowned card per catalog module');
      ok(await page.locator('[data-module-card="plansets"]').textContent().then(function (t) { return t.indexOf('AI Render') >= 0; }), 'AI Render belongs only to Plan Sets');
      await page.screenshot({ path: path.join(output, 'lite-modules-' + theme + '.png') });
      await page.locator('#omega-package-menu').getByRole('button', { name: 'Close', exact: true }).click();
      await page.evaluate(function () { var item = OmegaCommands.list().filter(function (it) { return it.module === 'plansets' && /plot/i.test(it.name); })[0]; if (!item) throw new Error('Missing Plan Sets discovery'); OmegaCommands.run(item.name); });
      ok(await page.locator('[data-module-card="plansets"]').count() === 1, 'Ctrl+K/Jarvis unowned command opens module card');
      await page.evaluate(function () { OmegaPackageMenu.close(); });
      ok(await page.evaluate(function () { return OmegaCaps.packageAccess().modules.join() === 'lite'; }), 'discovery never grants access');
      // Phase 5: the workspace OWNER on a paid Field package subscribes from the
      // gallery. Pay first (a sandbox change invoice, nothing switched on), cancel,
      // then a $0 addition inside the tier that switches on at once and shows
      // its tools. The browser only displays what the server returned.
      db = new F.DB(); db.serial = true; H.seedPaidTenant(db, { org: LIVE_ORG, name: 'Packaging preview', keys: M.starters().ev, plan: 'field', profile: H.profile(LIVE_ORG, 'Packaging preview'), member: 'fixture-user' });
      caller = { uid: 'fixture-user', staff: false, email: 'designer@' + LIVE_ORG, orgId: LIVE_ORG, role: 'owner', claims: { email_verified: true } }; live = true; sandboxInvoices = 0;
      var owned = M.normalize(M.starters().ev), storageAllowed = function () { var el = document.getElementById('rb-valuestack'); return !!el && OmegaCaps.allowedElement(el) && !el.classList.contains('omega-gated-hidden'); };
      await page.evaluate(function (v) { OmegaCaps.setPackage(v); OmegaCaps.apply('standard'); }, await liveProjection());
      ok(await page.evaluate(storageAllowed) === false, 'Storage tools are gated before it is bought');
      await page.locator('#omega-package-tab').click();
      var siteintel = page.locator('[data-subscribe="siteintel"]'), storage = page.locator('[data-subscribe="storage"]');
      await siteintel.getByRole('button', { name: 'Subscribe', exact: true }).waitFor();
      ok(await page.locator('[data-subscribe] .opm-primary').count() === M.catalog().length - owned.length, 'an owner sees Subscribe on every unowned card');
      await siteintel.getByRole('button', { name: 'Subscribe', exact: true }).click();
      await siteintel.locator('.opm-quote').waitFor();
      ok(/^\$[\d,]+\.\d{2} today \(\d+ of \d+ days left until your billing date, \d{4}-\d{2}-\d{2}\)$/.test(await siteintel.locator('.opm-quote').textContent()), 'the quote is server-priced and prorated to the billing date');
      await page.screenshot({ path: path.join(output5, 'editor-subscribe-quote-' + theme + '.png') });
      await siteintel.getByRole('button', { name: 'Subscribe and pay' }).click();
      await siteintel.getByRole('button', { name: 'Cancel request' }).waitFor();
      ok(sandboxInvoices === 1, 'one sandbox change invoice is issued');
      ok(await page.evaluate(function () { return OmegaCaps.packageAccess().modules.indexOf('siteintel') < 0; }), 'nothing switches on before the payment clears');
      ok((await siteintel.textContent()).indexOf('Waiting for payment') >= 0 && await siteintel.getByRole('link', { name: 'Pay in QuickBooks' }).count() === 1, 'the card waits for payment with the QuickBooks pay link');
      await page.screenshot({ path: path.join(output5, 'editor-subscribe-waiting-' + theme + '.png') });
      await siteintel.getByRole('button', { name: 'Cancel request' }).click();
      await siteintel.getByRole('button', { name: 'Subscribe', exact: true }).waitFor();
      var changes = (await db.collection('omega_orgs').doc(LIVE_ORG).collection('billing').doc('current').collection('invoices').get()).docs.map(function (d) { return d.data(); }).filter(function (r) { return r.kind === 'change'; });
      ok(changes.length === 1 && changes[0].state === 'cancelled', 'a cancelled change stays on record, marked cancelled');
      await page.locator('#omega-package-menu').getByRole('button', { name: 'Close', exact: true }).first().click();
      // A smaller Field package with room under its cap: the next addition is
      // included in what they already pay for.
      db = new F.DB(); db.serial = true; H.seedPaidTenant(db, { org: LIVE_ORG, name: 'Packaging preview', keys: ['lite', 'evrebates', 'estimate'], plan: 'field', profile: H.profile(LIVE_ORG, 'Packaging preview'), member: 'fixture-user' });
      await page.evaluate(function (v) { OmegaCaps.setPackage(v); OmegaCaps.apply('standard'); }, await liveProjection());
      ok(await page.evaluate(storageAllowed) === false, 'Storage tools are still gated on the smaller package');
      await page.locator('#omega-package-tab').click();
      await storage.getByRole('button', { name: 'Subscribe', exact: true }).waitFor();
      await storage.getByRole('button', { name: 'Subscribe', exact: true }).click();
      await storage.locator('.opm-quote').waitFor();
      ok((await storage.locator('.opm-quote').textContent()).indexOf('no charge today') >= 0, 'a module inside the paid tier costs nothing today');
      await storage.getByRole('button', { name: 'Turn it on' }).click();
      await page.waitForFunction(function () { return OmegaCaps.packageAccess().modules.indexOf('storage') >= 0; });
      await page.locator('[data-module-card="storage"]').waitFor({ state: 'detached' });
      ok(sandboxInvoices === 1, 'nothing is invoiced for an included module');
      ok(await page.evaluate(storageAllowed) === true, 'Storage tools appear without staff');
      await page.screenshot({ path: path.join(output5, 'editor-subscribe-added-' + theme + '.png') });
      await page.locator('#omega-package-menu').getByRole('button', { name: 'Close', exact: true }).first().click();
      await page.evaluate(function () { rbTab('analyze'); });
      await page.screenshot({ path: path.join(output5, 'editor-after-subscribe-' + theme + '.png') });
      await page.evaluate(function () { rbTab('home'); });
      live = false; db = null; caller = null;
      view = X.project({ staff: true }, { packaged: true }, null, null);
      await page.evaluate(function (v) { OmegaCaps.setPackage(v); OmegaCaps.apply('standard'); }, view);
      await page.getByLabel('Viewing as package').selectOption('lite');
      await page.waitForFunction(function () { return OmegaCaps.packageAccess().preview === true; });
      ok(await page.evaluate(function () { return !OmegaCaps.packageAccess().staff && OmegaCaps.packageAccess().modules.join() === 'lite'; }), 'staff preview is customer-shaped');
      await page.screenshot({ path: path.join(output, 'staff-preview-lite-' + theme + '.png') });
      await page.getByLabel('Viewing as package').selectOption('staff');
      await page.waitForFunction(function () { return OmegaCaps.packageAccess().staff === true; });
      ok(await page.evaluate(function () { return firebase.auth().currentUser.uid === 'fixture-user'; }), 'preview never changes caller identity');
      ok(!errors.length, 'no full-editor JS errors: ' + errors.join('; '));
      await context.close();
    }
    console.log('Full editor workspaces: ' + count + ' passed; 84 screenshots at 1280px and 1024px; offline service adapters. Phase 5 subscribe: 8 captures, real /api/plan-change over an in-memory Firestore, QuickBooks stand-in.');
  } finally { await browser.close(); server.close(); }
}
run().catch(function (e) { console.error(e); server.close(); process.exitCode = 1; });
