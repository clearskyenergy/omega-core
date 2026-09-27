/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Full canonical editor HTML, scripts and observers. External auth/database,
 * Maps and producing APIs use offline adapters; no live reads/writes/charges.
 */
'use strict';
process.env.PACKAGING_PROVIDER = 'quickbooks'; /* these checks drive the QuickBooks rail; the Stripe rail is scripts/test-stripe-billing.js */
var fs = require('fs'), path = require('path'), http = require('http'), assert = require('assert');
var M = require('../api/_lib/modules'), X = require('../api/_lib/package-access');
var F = require('./_lib/firestore-double'), H = require('./_lib/packaging-billing-fixture');
var ROOT = path.join(__dirname, '..'), output = process.env.WORKSPACE_SHOTS || path.join(ROOT, 'docs/screenshots/packaging-phase-3');
var output5 = process.env.WORKSPACE_SHOTS || path.join(ROOT, 'docs/screenshots/packaging-phase-5');
/* Phase 5: while `live` is set, /api/package-access and /api/plan-change are
 * the REAL handlers over an in-memory Firestore seeded with a paid tenant;
 * QuickBooks is a stand-in that counts invoices. The mock must be installed
 * before the handler is required. */
var LIVE_ORG = 'packaging.example', db = null, caller = null, live = false, sandboxInvoices = 0, qbo = { paid: false };
H.mockAdmin(function () { return db; }, function () { return caller; }); H.mockQbo(function () { sandboxInvoices++; }, qbo);
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
  try { localStorage.setItem('omega.ui.mode', 'designer'); } catch (e) {}
  
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
      /* bought = visible (2026-09-27): a package is in neither mode; a saved Designer choice from before hides nothing */
      ok(await page.evaluate(function () {
        var s = document.getElementById('omg-switch'), b = document.getElementById('rb-omega-mode');
        return OmegaMode.get() === 'pro' && !document.body.classList.contains('omg-designer') && (!s || getComputedStyle(s).display === 'none') && (!b || getComputedStyle(b).display === 'none');
      }), 'under a package the editor is the full owned ribbon: no Designer/Pro switch, a saved Designer choice not applied');
      ok(await page.evaluate(function () { OmegaMode.set('designer'); return OmegaMode.get() === 'pro' && localStorage.getItem('omega.ui.mode') === 'designer'; }), 'asking for Designer under a package keeps the full ribbon and writes nothing');
      ok(await page.evaluate(async function () {
        var v = OmegaCaps.packageAccess(), wait = function () { return new Promise(function (r) { setTimeout(r, 60); }); };
        OmegaCaps.setPackage(null); OmegaCaps.apply('standard'); await wait();
        var back = OmegaMode.get() === 'designer' && getComputedStyle(document.getElementById('omg-switch')).display !== 'none';
        OmegaCaps.setPackage(v); OmegaCaps.apply('standard'); await wait();
        var held = OmegaMode.get() === 'pro' && getComputedStyle(document.getElementById('omg-switch')).display === 'none';
        /* again, on the same tier: no omega:tier this time, only the body attribute says the package went */
        OmegaCaps.setPackage(null); OmegaCaps.apply('standard'); await wait();
        var again = OmegaMode.get() === 'designer';
        OmegaCaps.setPackage(v); OmegaCaps.apply('standard'); await wait();
        return back && held && again && OmegaMode.get() === 'pro';
      }), 'a package going away gives a legacy account its saved Designer choice and the switch back; the package taking over ends it again');
      ok(await page.evaluate(function () { return !document.getElementById('omega-workspace-controls'); }), 'a customer has no workspace bar above the ribbon (it only carried All tools)');
      ok(await page.evaluate(function () {
        var rr = document.getElementById('rr'), body = document.querySelector('#rr .rr-body'); if (!rr || !body) return true;
        OmegaWorkspaces.results(); rr.classList.add('rr-collapsed'); var shut = getComputedStyle(body).display === 'none';
        rr.classList.remove('rr-collapsed'); return shut;
      }), 'the Results rail still collapses under a package (its layout is a rule, not an inline display)');
      for (var name of Object.keys(packages)) {
        view = X.project({ emailVerified: true }, { packaged: true, packagingState: 'paid', accessUntil: Date.now() + 86400000, modules: packages[name] }, { status: 'active' }, { role: 'owner' });
        await page.evaluate(function (v) { OmegaCaps.setPackage(v); OmegaCaps.apply('standard'); }, view);
        for (var workspace of ['l2', 'dcfc', 'bess', 'solarstorage', 'microgrid', 'compute', 'building']) {
          await page.evaluate(function (key) { OmegaWorkspaces.setProject(key, null, true); }, workspace);
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
          /* no toggle: every owned tool shows whatever the project type, and the build leads */
          await page.evaluate(function () { rbTab('home'); });
          var unreachable = await page.evaluate(function (key) {
            var failures = [];
            if (document.querySelectorAll('#ribbon [data-workspace-hidden]').length) failures.push('workspace hidden');
            var guide = OmegaWorkspaces.presets[key].guide, lead = Array.prototype.filter.call(document.querySelectorAll('#ribbon .rbtn'), function (b) { return b.getAttribute('onclick') === guide && OmegaCaps.allowedElement(b); })[0];
            if (lead && (lead.parentNode.classList.contains('rbtn-wrap') ? lead.parentNode : lead).style.order !== '-2') failures.push('guided build not first');
            var buttons = document.querySelectorAll('#ribbon .rbtn,#ribbon .rsbtn');
            for (var b = 0; b < buttons.length; b++) {
              var el = buttons[b];
              if (!OmegaCaps.allowedElement(el) || el.hasAttribute('data-packaging-retired') || el.hasAttribute('data-shelf-dupe') || el.classList.contains('omega-gated-hidden') || el.hidden) continue;
              if (getComputedStyle(el).display === 'none') failures.push('button ' + el.id + ':' + el.textContent.trim());
              var page = el.closest('.ribbon-page'), tab = page && document.querySelector('#ribbon-tabs [data-page="' + page.getAttribute('data-page') + '"]');
              if (tab && getComputedStyle(tab).display === 'none') failures.push('tab ' + page.getAttribute('data-page') + ' for ' + el.id + ':' + el.textContent.trim());
            }
            return failures;
          }, workspace);
          ok(!unreachable.length, name + '/' + workspace + ': every owned tool shows, no toggle: ' + unreachable.join('; '));
          await page.evaluate(function () { rbTab('home'); OmegaCaps.apply('standard'); });
          await page.screenshot({ path: path.join(output, name + '-' + workspace + '-' + theme + '.png') });
        }
      }
      // Tablet landscape: inspect every owned tab, not just the opening Build page.
      await page.setViewportSize({ width: 1024, height: 768 });
      for (var tabletName of Object.keys(packages)) {
        view = X.project({ emailVerified: true }, { packaged: true, packagingState: 'paid', accessUntil: Date.now() + 86400000, modules: packages[tabletName] }, { status: 'active' }, { role: 'owner' });
        await page.evaluate(function (v) { OmegaCaps.setPackage(v); OmegaWorkspaces.setProject('l2', null, true); }, view);
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
          if (bar && bar.scrollWidth > window.innerWidth + 2) failures.push('workspace header');
          rbTab('home');
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
      ok(await page.locator('[data-module-card]').count() === M.catalog().length, 'one card per catalog module, including the mandatory baseline');
      ok(await page.locator('[data-module-card="lite"] button').count() === 0, 'Lite never offers opt-out');
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
      await storage.getByRole('button', { name: 'Opt out', exact: true }).waitFor();
      ok(sandboxInvoices === 1, 'nothing is invoiced for an included module');
      ok(await page.evaluate(storageAllowed) === true, 'Storage tools appear without staff');
      await storage.getByRole('button', { name: 'Opt out', exact: true }).click();
      await storage.getByRole('button', { name: 'Confirm opt-out request', exact: true }).waitFor();
      ok(/quarterly review/.test(await storage.textContent()) && /charges stay unchanged/.test(await storage.textContent()), 'opt-out confirms review timing before applying');
      ok(!(await db.doc('omega_orgs/' + LIVE_ORG + '/billing/current').get()).data().removalRequests, 'reviewing does not queue the request');
      await storage.getByRole('button', { name: 'Confirm opt-out request', exact: true }).click();
      await storage.getByRole('button', { name: 'Keep module', exact: true }).waitFor();
      var requested = (await db.doc('omega_orgs/' + LIVE_ORG + '/billing/current').get()).data();
      ok(requested.removalRequests.length === 1 && requested.removalRequests[0].module === 'storage', 'confirmed opt-out records the module');
      ok(await page.evaluate(storageAllowed) === true && sandboxInvoices === 1, 'review request changes neither access nor invoice count');
      await storage.getByRole('button', { name: 'Keep module', exact: true }).click();
      await storage.getByRole('button', { name: 'Confirm keep modules', exact: true }).click();
      await storage.getByRole('button', { name: 'Opt out', exact: true }).waitFor();
      ok((await db.doc('omega_orgs/' + LIVE_ORG + '/billing/current').get()).data().removalRequests.length === 0, 'the owner can withdraw the opt-out request');
      await page.screenshot({ path: path.join(output5, 'editor-subscribe-added-' + theme + '.png') });
      await page.locator('#omega-package-menu').getByRole('button', { name: 'Close', exact: true }).first().click();
      await page.evaluate(function () { rbTab('analyze'); });
      await page.screenshot({ path: path.join(output5, 'editor-after-subscribe-' + theme + '.png') });
      await page.evaluate(function () { rbTab('home'); });
      /* Opt in, pay, come back: the module switches on in the OPEN editor.
         QuickBooks is the stand-in; `qbo.paid` is the card payment landing.
         Nothing reloads the page between the purchase and the tools. */
      var BILLING = 'omega_orgs/' + LIVE_ORG + '/billing/current';
      async function billing(patch) { var cur = (await db.doc(BILLING).get()).data(); db.seed(BILLING, Object.assign({}, cur, patch)); }
      db = new F.DB(); db.serial = true; qbo.paid = false; sandboxInvoices = 0;
      H.seedPaidTenant(db, { org: LIVE_ORG, name: 'Packaging preview', keys: M.starters().ev, plan: 'field', profile: H.profile(LIVE_ORG, 'Packaging preview'), member: 'fixture-user' });
      await page.evaluate(function (v) { OmegaCaps.setPackage(v); OmegaCaps.apply('standard'); }, await liveProjection());
      var intelAllowed = function () { return OmegaCaps.allowedCommand('', 'openScorePanel()') && OmegaCaps.allowedCommand('rb-parcel-screen', ''); };
      ok(await page.evaluate(intelAllowed) === false, 'Site Intelligence is gated before it is paid for');
      await page.locator('#omega-package-tab').click();
      await siteintel.getByRole('button', { name: 'Subscribe', exact: true }).waitFor();
      await siteintel.getByRole('button', { name: 'Subscribe', exact: true }).click();
      await siteintel.getByRole('button', { name: 'Subscribe and pay' }).click();
      await siteintel.getByRole('button', { name: "I've paid", exact: true }).waitFor();
      await siteintel.getByRole('button', { name: "I've paid", exact: true }).click();
      await page.waitForFunction(function () { return /does not show this payment yet/.test(document.querySelector('[data-subscribe="siteintel"]').textContent); });
      ok(await page.evaluate(intelAllowed) === false, "\"I've paid\" before QuickBooks has the payment unlocks nothing");
      await siteintel.getByRole('button', { name: "I've paid", exact: true }).click();
      await page.waitForFunction(function () { return /Checked a moment ago/.test(document.querySelector('[data-subscribe="siteintel"]').textContent); });
      ok(true, 'asking again inside eight seconds is told so, not silently ignored');
      qbo.paid = true; await billing({ paymentCheckedAt: 0 });
      await siteintel.getByRole('button', { name: "I've paid", exact: true }).click();
      await page.waitForFunction(function () { return OmegaCaps.packageAccess().modules.indexOf('siteintel') >= 0; });
      var intelCard = page.locator('[data-module-card="siteintel"]');
      await intelCard.getByRole('button', { name: 'Show me', exact: true }).waitFor();
      ok(await page.evaluate(intelAllowed) === true, 'paid in QuickBooks, "I\'ve paid": Site Intelligence opens in the open editor, no reload');
      ok((await intelCard.textContent()).indexOf('On your plan') >= 0, 'the card says it is on');
      ok(await page.locator('#omega-plan-toast').count() === 0, 'no toast over The Ladder: the card says it');
      await page.screenshot({ path: path.join(output5, 'editor-paid-on-' + theme + '.png') });
      await intelCard.getByRole('button', { name: 'Show me', exact: true }).click();
      await page.waitForFunction(function () { return !document.getElementById('omega-package-menu') && document.querySelector('[data-opm-spot]'); });
      var shown = await page.evaluate(function () {
        var el = document.querySelector('[data-opm-spot]'), pg = el.closest('.ribbon-page').getAttribute('data-page'), tab = document.querySelector('#ribbon-tabs .rtab.active');
        return { page: pg, active: tab && tab.getAttribute('data-page'), visible: getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0, owners: OmegaCaps.owners(el.id || '', el.getAttribute('onclick') || '') };
      });
      ok(shown.page === 'analyze' && shown.active === 'analyze' && shown.visible && shown.owners.indexOf('siteintel') >= 0, 'Show me opens the tab and points at a Site Intelligence tool: ' + JSON.stringify(shown));
      await page.screenshot({ path: path.join(output5, 'editor-show-me-' + theme + '.png') });
      /* A change made elsewhere (an administrator on the dashboard) arrives
         when the window comes back into focus, and is said out loud. */
      var withStorage = M.normalize(M.starters().ev.concat(['siteintel', 'storage']));
      await billing(Object.assign({ subscription: Object.assign({}, (await db.doc(BILLING).get()).data().subscription, { modules: withStorage }) }, M.resolve(withStorage)));
      await page.evaluate(function () { rbTab('home'); window.dispatchEvent(new Event('focus')); });
      await page.waitForFunction(function () { var t = document.getElementById('omega-plan-toast'); return t && /Omega Storage is on/.test(t.textContent); });
      ok(await page.evaluate(storageAllowed) === true, 'a module added elsewhere opens when the editor window comes back');
      ok(/on the .+ tab/.test(await page.locator('#omega-plan-toast').textContent()), 'the toast says where it is');
      await page.screenshot({ path: path.join(output5, 'editor-focus-toast-' + theme + '.png') });
      await page.locator('#omega-plan-toast').getByRole('button', { name: 'Show me', exact: true }).click();
      ok(await page.evaluate(function () { var el = document.querySelector('[data-opm-spot]'); return !!el && OmegaCaps.owners(el.id || '', el.getAttribute('onclick') || '').indexOf('storage') >= 0 && !document.getElementById('omega-plan-toast'); }), 'the toast\'s Show me points at a Storage tool');
      ok(await page.evaluate(function () { var el = document.querySelector('[data-opm-spot]'); return !!el && document.activeElement === el; }), 'and keyboard focus lands on it');
      ok(await page.evaluate(function () { var live = document.getElementById('omega-plan-live'); return !!live && live.getAttribute('aria-live') === 'polite' && /Omega Storage is on/.test(live.textContent); }), 'the toast is announced through the one live region');
      await page.setViewportSize({ width: 390, height: 844 });
      var narrow = await page.evaluate(function () {
        document.dispatchEvent(new CustomEvent('omega:plan-changed', { detail: { changed: true, packaged: true, wasPackaged: true, added: ['storage'], removed: [], readOnly: false, wasReadOnly: false } }));
        var r = document.getElementById('omega-plan-toast').getBoundingClientRect(); document.getElementById('omega-plan-toast').remove();
        return { width: Math.round(r.width), left: Math.round(r.left), right: Math.round(r.right) };
      });
      await page.setViewportSize({ width: 1280, height: 900 });
      ok(narrow.width >= 340 && narrow.left >= 0 && narrow.right <= 390, 'on a 390px phone the toast spans the screen: ' + JSON.stringify(narrow));
      /* The access deadline passes with the editor open: the tools close on
         the clock, the strip says why and how to pay, and paying opens them. */
      await billing({ accessUntil: Date.now() + 2500, paymentLink: 'https://connect.intuit.com/pay/fixture' });
      await page.evaluate(function () { return OmegaCaps.refresh(); });
      ok(await page.evaluate(storageAllowed) === true, 'before the deadline the tools stay open');
      await page.waitForFunction(function () { return OmegaCaps.packageAccess().readOnly === true; }, null, { timeout: 8000 });
      await page.waitForFunction(function () { var n = document.getElementById('omega-plan-notice'); return n && /read-only/.test(n.textContent); });
      ok(await page.evaluate(storageAllowed) === false && await page.evaluate(intelAllowed) === false, 'at the deadline the open editor stops producing');
      ok(await page.locator('#omega-plan-notice').getByRole('link', { name: 'Pay in QuickBooks' }).count() === 1, 'the strip carries the QuickBooks pay link');
      ok(/read-only now/.test(await page.locator('#omega-plan-toast').textContent()), 'and the toast says the workspace went read-only');
      await page.screenshot({ path: path.join(output5, 'editor-read-only-' + theme + '.png') });
      await billing({ accessUntil: Date.now() + 30 * 86400000, paymentCheckedAt: 0 });
      await page.locator('#omega-plan-notice').getByRole('button', { name: "I've paid", exact: true }).click();
      await page.waitForFunction(function () { return OmegaCaps.packageAccess().readOnly === false && !document.getElementById('omega-plan-notice'); });
      ok(await page.evaluate(storageAllowed) === true, 'paid: the strip goes and the tools come back');
      ok(/open again/.test(await page.locator('#omega-plan-toast').textContent()), 'and the toast says so');
      await page.evaluate(function () { var t = document.getElementById('omega-plan-toast'); if (t) t.remove(); rbTab('home'); });
      live = false; db = null; caller = null;
      view = X.project({ staff: true }, { packaged: true }, null, null);
      await page.evaluate(function (v) { OmegaCaps.setPackage(v); OmegaCaps.apply('standard'); }, view);
      await page.getByLabel('Viewing as package').selectOption('lite');
      await page.waitForFunction(function () { return OmegaCaps.packageAccess().preview === true; });
      ok(await page.evaluate(function () { return !OmegaCaps.packageAccess().staff && OmegaCaps.packageAccess().modules.join() === 'lite'; }), 'staff preview is customer-shaped');
      ok(await page.evaluate(function () { return OmegaMode.get() === 'pro' && !!document.getElementById('omega-package-preview'); }), 'the preview shows the full owned ribbon and keeps the Viewing as bar');
      await page.screenshot({ path: path.join(output, 'staff-preview-lite-' + theme + '.png') });
      await page.getByLabel('Viewing as package').selectOption('staff');
      await page.waitForFunction(function () { return OmegaCaps.packageAccess().staff === true; });
      ok(await page.evaluate(function () { return firebase.auth().currentUser.uid === 'fixture-user'; }), 'preview never changes caller identity');
      ok(!errors.length, 'no full-editor JS errors: ' + errors.join('; '));
      await context.close();
    }
    console.log('Full editor workspaces: ' + count + ' passed; 84 screenshots at 1280px and 1024px; offline service adapters. Phase 5 subscribe: 8 captures, real /api/plan-change over an in-memory Firestore, QuickBooks stand-in; opt in, pay, unlock without a reload: 8 captures.');
  } finally { await browser.close(); server.close(); }
}
run().catch(function (e) { console.error(e); server.close(); process.exitCode = 1; });
