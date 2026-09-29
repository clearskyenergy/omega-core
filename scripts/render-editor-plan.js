#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * The plan chip in the FULL canonical editor.html (omega-editor-plan.js),
 * signed in on an offline Firebase stand-in, in light and dark, on a desktop
 * and a 390px phone. Real server projections (api/_lib/package-access.js)
 * and the real price list (api/offerings view) answer the page; the
 * plan-change summary is a fixed server shape, or a 503.
 *   packaged Lite     the chip names the plan, its panel lists Lite in Site
 *                     Map and links Plan & billing and Modules in a new tab;
 *                     a 503 summary leaves no figure and no error
 *   a mixed package   In Site Map and Elsewhere by the price list's flag, the
 *                     server's monthly figure and next invoice
 *   read-only         the server's notice, its QuickBooks link and I've
 *                     paid: reconcile-now, the package fetched again, the
 *                     ribbon back, no reload
 *   the deadline      a live package whose accessUntil passes closes and is
 *                     asked again
 *   staff             Staff · every module
 *   unchecked         a failed billing read keeps viewing (the ribbon is not
 *                     blank), the Ladder tab explains; a Retry whose read is
 *                     still out shows and runs nothing that produces; a
 *                     failed one says so; Retry lands the plan; the gate's
 *                     own Retry after the same blip lands it too
 *   legacy            Performance, its modules by the Modules page's rule,
 *                     only the requests its cards show in flight, no Ladder,
 *                     no package calls
 * Fails on a page error, a chip that overflows the title bar, a panel off
 * the screen, or text under 4.5:1 on the chip. No live reads or writes.
 */
'use strict';
var fs = require('fs'), os = require('os'), path = require('path'), http = require('http'), assert = require('assert');
var F = require('./_lib/firestore-double');
F.mock('../api/_lib/admin', { handler: function (fn) { return fn; }, db: function () { return null; }, httpError: function (s, m) { var e = new Error(m); e.status = s; return e; } });
var M = require('../api/_lib/modules'), X = require('../api/_lib/package-access'), B = require('../api/_lib/pricebook');
var OFFER = require('../api/offerings').view(B.proposed(), 'proposed');
var ROOT = path.join(__dirname, '..'), output = process.env.EDITOR_PLAN_SHOTS || path.join(os.tmpdir(), 'omega-editor-plan');
var chromium = require(process.env.PLAYWRIGHT || 'playwright').chromium, count = 0;
function ok(value, label) { assert(value, label); count++; }
var server = http.createServer(function (req, res) {
  var pathname = new URL(req.url, 'http://localhost').pathname, file = path.resolve(ROOT, '.' + pathname);
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  var mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
  res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream'); res.end(fs.readFileSync(file));
});
var DAY = 86400000, PAY = 'https://app.qbo.intuit.com/app/customer/pay/editor-plan';
function project(modules, bill, member) {
  return X.project({ emailVerified: true }, Object.assign({ packaged: true, packagingState: 'paid', accessUntil: Date.now() + 30 * DAY, modules: modules }, bill || {}),
    { status: 'active' }, member || { role: 'owner', status: 'active' });
}
var FIGS = { packaged: true, packagingState: 'paid', planDisplay: 'Lite + modules', monthlyDisplay: '$1,480.00/month', interval: 'monthly', nextInvoiceOn: '2026-10-01',
  amountDue: 0, modules: [], subscription: [], pending: [], removalRequests: [], invoices: [] };

/* the Firebase compat surface the editor touches, offline; billing is
   window.__billing, a read fails while window.__failBilling is set, and
   waits while window.__holdBilling is set until window.__release(fail) */
function fixture() {
  window.__billing = { packaged: true, packagingState: 'paid', modules: ['lite'] }; window.__failBilling = false; window.__reads = 0;
  window.__holdBilling = false; window.__held = [];
  window.__release = function (fail) { var held = window.__held; window.__held = []; held.forEach(function (settle) { settle(fail); }); };
  var user = { uid: 'plan-user', email: 'designer@packaging.example', emailVerified: true, displayName: 'Plan Fixture', getIdToken: function () { return Promise.resolve('offline-fixture'); } };
  function snapshot(p) {
    var data = /billing\/current$/.test(p) ? window.__billing :
      /^omega_orgs\/[^/]+$/.test(p) ? { name: 'Packaging preview', status: 'active', domains: [location.hostname] } :
      /members\//.test(p) ? { role: 'owner', status: 'active' } : null;
    return { exists: !!data, id: p.split('/').pop(), data: function () { return data; }, docs: [], empty: true, forEach: function () {} };
  }
  function ref(p) {
    return { collection: function (n) { return ref(p + '/' + n); }, doc: function (n) { return ref(p + '/' + n); },
      get: function () {
        window.__reads++;
        if (window.__holdBilling && /billing\/current$/.test(p)) return new Promise(function (resolve, reject) { window.__held.push(function (fail) { if (fail) reject(new Error('offline')); else resolve(snapshot(p)); }); });
        if (window.__failBilling && /billing\/current$/.test(p)) return Promise.reject(new Error('offline'));
        return Promise.resolve(snapshot(p));
      },
      onSnapshot: function (fn) { setTimeout(function () { fn(snapshot(p)); }, 0); return function () {}; },
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
  window.CLEARSKY_CONFIG = { firebase: {}, adminDomains: ['clearsky-usa.com'], tenant: { orgId: 'packaging.example', name: 'Packaging preview', status: 'active' } };
  window.alert = function () {};
}

/* WCAG contrast of the chip's own text on its own face */
function chipContrast() {
  function parse(c) { var m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(c || ''); return m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] } : null; }
  function lin(v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
  function lum(c) { return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b); }
  /* the colour actually painted behind the text: a translucent background
     (the chip's hover is rgba(…, .1)) is laid over its ancestors' paint,
     down to the first opaque one (white when none is) */
  function paint(el) {
    var layers = [];
    for (var n = el; n && n.nodeType === 1; n = n.parentElement) { var c = parse(getComputedStyle(n).backgroundColor); if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; } }
    var out = { r: 255, g: 255, b: 255 };
    for (var i = layers.length - 1; i >= 0; i--) { var l = layers[i]; out = { r: l.a * l.r + (1 - l.a) * out.r, g: l.a * l.g + (1 - l.a) * out.g, b: l.a * l.b + (1 - l.a) * out.b }; }
    return out;
  }
  var chip = document.getElementById('omega-plan-chip'), bg = paint(chip), worst = 99;
  ['.oep-v', '.oep-s', '.oep-k'].forEach(function (s) {
    var el = chip.querySelector(s); if (!el || !el.textContent.trim() || getComputedStyle(el).display === 'none') return;
    var fg = parse(getComputedStyle(el).color), a = lum(fg), b = lum(bg), c = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    if (c < worst) worst = c;
  });
  return worst;
}

async function run() {
  fs.mkdirSync(output, { recursive: true });
  await new Promise(function (resolve) { server.listen(0, '127.0.0.1', resolve); });
  var base = 'http://127.0.0.1:' + server.address().port;
  var browser = await chromium.launch({ executablePath: process.env.CHROME || chromium.executablePath() });
  try {
    for (var theme of ['light', 'dark']) {
      var view = project(['lite']), figures = null, paid = false, calls = { catalog: 0, access: 0, reconcile: [], summary: 0, offerings: 0 };
      var context = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: theme });
      await context.addInitScript(fixture);
      await context.route('**/*', function (route) {
        var req = route.request(), url = new URL(req.url());
        function json(status, body) { return route.fulfill({ status: status, contentType: 'application/json', body: JSON.stringify(body) }); }
        if (url.origin !== base) return route.fulfill({ status: 200, body: '' });
        if (url.pathname === '/api/package-access') { calls.access++; return json(200, view); }
        if (url.pathname === '/api/package-catalog') { calls.catalog++; return json(403, { error: 'Pricing is not enabled' }); }
        if (url.pathname === '/api/offerings') { calls.offerings++; return json(200, OFFER); }
        if (url.pathname === '/api/plan-change') {
          if (req.method() === 'POST') { var body = req.postDataJSON(); calls.reconcile.push(body.action); return json(200, { paid: paid, packagingState: paid ? 'paid' : 'trial' }); }
          calls.summary++;
          return figures ? json(200, figures) : json(503, { error: 'Price book not seeded' });
        }
        if (url.pathname.indexOf('/api/') === 0) return json(503, { error: 'Offline producer' });
        return route.continue();
      });
      var page = await context.newPage(), errors = [];
      page.on('pageerror', function (e) { errors.push(e.message); });
      await page.goto(base + '/editor.html', { waitUntil: 'domcontentloaded' });
      await page.evaluate(function () { firebase.auth().currentUser = window.__user; window.__listeners.forEach(function (fn) { fn(window.__user); }); });
      await page.waitForFunction(function () { return window.OmegaCaps && OmegaCaps.packageAccess() && OmegaCaps.packageAccess().modules.length && !document.getElementById('omega-editor-gate'); });
      await page.waitForTimeout(2500);
      var chip = page.locator('#portal-nav #omega-plan-chip'), pop = page.locator('#omega-plan-pop');
      async function applyView(v) { view = v; await page.evaluate(function (p) { OmegaCaps.setPackage(p); OmegaCaps.apply('standard'); }, v); await page.waitForTimeout(150); }
      async function openPanel() { if (!(await pop.count())) await chip.click(); await pop.waitFor(); await page.waitForTimeout(250); }
      async function closePanel() { if (await pop.count()) await page.keyboard.press('Escape'); await page.waitForTimeout(80); }

      /* packaged Lite, the summary refused (the book is not seeded) */
      await chip.waitFor();
      ok(await chip.isVisible(), theme + ': the chip is in the title bar');
      ok((await chip.locator('.oep-v').textContent()) === 'Lite' && (await chip.locator('.oep-s').textContent()) === '', theme + ': Lite, nothing wrong');
      await openPanel();
      ok((await pop.locator('.oep-insite .oep-mod').allTextContents()).join() === M.get('lite').name, theme + ': the plan\'s one module, ' + M.get('lite').name + ', is In Site Map');
      ok(await pop.locator('.oep-elsewhere').count() === 0, theme + ': nothing Elsewhere on Lite');
      var links = await pop.locator('.oep-links a').evaluateAll(function (as) { return as.map(function (a) { return [a.getAttribute('href'), a.target, a.textContent]; }); });
      ok(links.length === 2 && links[0][0] === '/workspace#billing' && links[1][0] === '/workspace#modules' && links.every(function (l) { return l[1] === '_blank'; }), theme + ': Plan & billing and Modules, in a new tab: ' + JSON.stringify(links));
      ok(calls.summary >= 1 && !/\$/.test(await pop.textContent()), theme + ': a 503 summary leaves no figure');
      ok(/more modules available/.test(await pop.textContent()), theme + ': what is not held is counted');
      await page.screenshot({ path: path.join(output, theme + '-desktop-lite.png') });
      await closePanel();

      /* a mixed package, the summary answering */
      figures = FIGS;
      await applyView(project(M.starters().ev.concat(['whitelabel', 'logic-office'])));
      await page.waitForFunction(function () { return /Lite \+ \d+ modules/.test(document.querySelector('#omega-plan-chip .oep-v').textContent); });
      await openPanel();
      await page.waitForFunction(function () { return /\$1,480\.00\/month/.test(document.getElementById('omega-plan-pop').textContent); });
      var inside = await pop.locator('.oep-insite .oep-mod').allTextContents(), outside = await pop.locator('.oep-elsewhere .oep-mod').allTextContents();
      ok(inside.join('|') === M.catalog().filter(function (m) { return M.starters().ev.indexOf(m.key) >= 0; }).map(function (m) { return m.name; }).join('|'), theme + ': the EV starter is In Site Map: ' + inside.join('|'));
      ok(outside.join('|') === M.get('whitelabel').name + '|' + M.get('logic-office').name, theme + ': the Storefront and Logic Office are Elsewhere: ' + outside.join('|'));
      ok(/Oct 1, 2026/.test(await pop.textContent()) && /Next invoice/.test(await pop.textContent()), theme + ': the next invoice, as the server dated it');
      ok(await pop.locator('.oep-mod[href="/workspace#module-gridatlas"][target="_blank"]').count() === 1, theme + ': a module opens its card on the Modules page');
      await page.screenshot({ path: path.join(output, theme + '-desktop-modules.png') });
      await closePanel();

      /* read-only: the trial ran out, the invoice is open */
      var expired = project(['lite', 'gridatlas'], { packagingState: 'trial', trialStartedAt: Date.now() - 20 * DAY, trialEndsAt: Date.now() - 6 * DAY, accessUntil: Date.now() - 6 * DAY, paymentLink: PAY });
      await applyView(expired);
      await page.waitForFunction(function () { return document.querySelector('#omega-plan-chip .oep-s').textContent === ' · Read-only'; });
      ok(await page.evaluate(function () { return Array.prototype.some.call(document.querySelectorAll('#ribbon-tabs .rtab[data-page]'), function (t) { return getComputedStyle(t).display !== 'none'; }); }), theme + ': read-only keeps the tabs that view');
      await openPanel();
      ok((await pop.locator('.oep-notice-text').textContent()) === expired.billingNotice.text, theme + ': the server\'s own notice');
      ok((await pop.locator('.oep-notice a.oep-pay-link').getAttribute('href')) === PAY && (await pop.locator('.oep-notice a.oep-pay-link').textContent()) === 'Pay in ' + expired.billingNotice.payWith, theme + ': its pay link, named for the rail the server names (' + expired.billingNotice.payWith + ')');
      paid = false;
      await pop.locator('#omega-plan-paid').click();
      await page.waitForFunction(function () { return /Not paid yet/.test(document.getElementById('omega-plan-pop').textContent); });
      ok(calls.reconcile.join() === 'reconcile-now', theme + ': I\'ve paid asks QuickBooks now (reconcile-now)');
      ok(await page.evaluate(function () { return OmegaCaps.packageAccess().readOnly === true; }), theme + ': not paid: still read-only');
      await page.screenshot({ path: path.join(output, theme + '-desktop-readonly.png') });
      paid = true; view = project(['lite', 'gridatlas']); var before = calls.access;
      await pop.locator('#omega-plan-paid').click();
      await page.waitForFunction(function () { return OmegaCaps.packageAccess().readOnly === false && document.querySelector('#omega-plan-chip .oep-s').textContent === ''; });
      ok(calls.access > before && calls.reconcile.length === 2, theme + ': paid: the package is fetched again');
      ok(await page.evaluate(function () { var el = document.getElementById('rb-line'); rbTab('draw'); return !!el && getComputedStyle(el).display !== 'none'; }), theme + ': and the drawing tools are back, with no reload');
      await page.evaluate(function () { rbTab('home'); });
      await closePanel();

      /* the deadline passes while the editor is open */
      var soon = project(['lite'], { accessUntil: Date.now() + 1500 });
      await applyView(soon);
      view = project(['lite'], { packagingState: 'trial', trialStartedAt: Date.now() - 20 * DAY, trialEndsAt: Date.now() - 6 * DAY, accessUntil: Date.now() - 1000, paymentLink: PAY });
      before = calls.access;
      await page.waitForFunction(function () { return OmegaCaps.packageAccess() && OmegaCaps.packageAccess().readOnly === true && /Read-only/.test(document.querySelector('#omega-plan-chip').textContent); }, null, { timeout: 8000 });
      ok(calls.access > before, theme + ': at accessUntil the package is asked again');

      /* staff */
      await applyView(X.project({ staff: true }, { packaged: true }, null, null));
      await page.waitForFunction(function () { return document.querySelector('#omega-plan-chip .oep-v').textContent === 'Staff · every module'; });
      ok(true, theme + ': staff see Staff · every module');

      /* unchecked: the billing read fails for this sign-in */
      await page.evaluate(function () { window.__failBilling = true; return OmegaCaps.resolve(firebase.firestore(), window.__user.email, true).then(function (t) { OmegaCaps.apply(t); }); });
      await page.waitForFunction(function () { return document.querySelector('#omega-plan-chip').getAttribute('data-state') === 'unchecked'; });
      var ribbon = await page.evaluate(function () {
        var tabs = Array.prototype.filter.call(document.querySelectorAll('#ribbon-tabs .rtab[data-page]'), function (t) { return t.getAttribute('data-page') !== '__file' && getComputedStyle(t).display !== 'none'; });
        var line = document.getElementById('rb-line');
        return { tabs: tabs.length, producing: !!line && getComputedStyle(line).display !== 'none', ladder: !!document.getElementById('omega-package-tab') };
      });
      ok(ribbon.tabs > 0 && !ribbon.producing, theme + ': an unchecked plan keeps the tabs that view and withholds drawing: ' + JSON.stringify(ribbon));
      if (ribbon.ladder) {
        await page.locator('#omega-package-tab').click();
        await pop.waitFor();
        ok(/pricing could not be loaded/i.test(await pop.textContent()) && await page.locator('#omega-package-menu').count() === 0, theme + ': the Ladder tab says pricing could not be loaded, never "every module"');
      } else ok(true, theme + ': (no Ladder tab while unchecked)');
      await openPanel();
      await page.screenshot({ path: path.join(output, theme + '-desktop-unchecked.png') });
      /* the plan behind the retries: a legacy Performance workspace with one
         opt-in still open (the Storefront, which Performance does not hold)
         and one ClearSky met by the tier (Storage, which Performance holds) */
      await page.evaluate(function () { window.__failBilling = false; window.__billing = { tier: 'deluxe', optIns: { whitelabel: { status: 'requested' }, storage: { status: 'requested' } } }; });
      var catalogBefore = calls.catalog;
      /* review #19: a Retry whose read is still out shows nothing that
         produces, and a click on a hidden producing button is swallowed */
      function withheld() {
        var sizers = Array.prototype.filter.call(document.querySelectorAll('[onclick*="openBessSizer"]'), function (el) { return getComputedStyle(el).display !== 'none'; });
        var hidden = document.querySelector('[data-package-hidden][onclick*="openBessSizer"]'), ran = 0, original = window.openBessSizer;
        window.openBessSizer = function () { ran++; };
        try { if (hidden) hidden.click(); } finally { window.openBessSizer = original; }
        var p = OmegaCaps.packageAccess(), line = document.getElementById('rb-line');
        return { unchecked: !!(p && p.unverified), line: line ? getComputedStyle(line).display : 'absent', sizers: sizers.length, hidden: !!hidden, ran: ran };
      }
      await page.evaluate(function () { window.__holdBilling = true; });
      await pop.locator('#omega-plan-retry').click();
      await page.waitForFunction(function () { return window.__held.length > 0; });
      await page.waitForTimeout(200);
      var mid = await page.evaluate(withheld);
      ok(mid.unchecked && mid.line === 'none' && mid.sizers === 0 && mid.hidden && mid.ran === 0, theme + ': a Retry in flight keeps the plan unchecked and shows nothing that produces ' + JSON.stringify(mid));
      await page.evaluate(function () { window.__holdBilling = false; window.__release(true); });
      await page.waitForFunction(function () { return /Still could not check your plan/.test((document.getElementById('omega-plan-pop') || {}).textContent || ''); });
      var after = await page.evaluate(withheld);
      ok(after.unchecked && after.line === 'none' && after.sizers === 0 && after.ran === 0, theme + ': a Retry that fails again leaves it unchecked and says so ' + JSON.stringify(after));
      /* Retry lands the plan */
      await pop.locator('#omega-plan-retry').click();
      await page.waitForFunction(function () { return document.querySelector('#omega-plan-chip .oep-v').textContent === 'Pro'; });
      ok(await page.evaluate(function () { return OmegaCaps.packageAccess() === null && document.body.getAttribute('data-tier') === 'deluxe'; }), theme + ': Retry resolves the legacy plan without a reload');
      await closePanel();
      /* review #21: the same blip refused the gate too. Its own Retry lets
         the person in AND checks the plan: no view-only Site Map behind a
         lifted gate, no second Retry on the chip */
      await page.evaluate(function () { window.__failBilling = true; return OmegaCaps.resolve(firebase.firestore(), window.__user.email, true).then(function (t) { OmegaCaps.apply(t); }); });
      await page.waitForFunction(function () { return document.querySelector('#omega-plan-chip').getAttribute('data-state') === 'unchecked'; });
      await page.evaluate(function () { return OmegaEditorGate.decide(firebase.auth().currentUser); });
      await page.locator('#omega-gate-retry').waitFor();
      ok(/could not check your access/i.test(await page.locator('#omega-editor-gate').textContent()), theme + ': the gate says the check could not run, with Retry');
      await page.evaluate(function () { window.__failBilling = false; });
      await page.locator('#omega-gate-retry').click();
      await page.waitForFunction(function () { return !document.getElementById('omega-editor-gate') && document.querySelector('#omega-plan-chip .oep-v').textContent === 'Pro'; }, null, { timeout: 8000 });
      ok(await page.evaluate(function () { return OmegaCaps.packageAccess() === null && !OmegaCaps.unchecked() && document.body.getAttribute('data-tier') === 'deluxe' && document.querySelector('#omega-plan-chip').getAttribute('data-state') === 'legacy'; }), theme + ': the gate\'s Retry lets them in and lands the plan with it');
      await openPanel();
      await page.waitForFunction(function () { return document.querySelectorAll('#omega-plan-pop .oep-insite .oep-mod').length > 1; });
      var legacyIn = await pop.locator('.oep-insite .oep-mod').allTextContents();
      ok(legacyIn.some(function (t) { return t === M.get('plansets').name; }), theme + ': Performance holds ' + M.get('plansets').name + ' in Site Map: ' + legacyIn.join('|'));
      ok(legacyIn.some(function (t) { return t.indexOf(M.get('compute').name) === 0 && /Partly included$/.test(t); }), theme + ': and ' + M.get('compute').name + ' only partly');
      var changing = await pop.locator('.oep-changing li').allTextContents();
      ok(changing.length === 1 && changing[0].indexOf(M.get('whitelabel').name) === 0 && /Opt-in requested/.test(changing[0]), theme + ': the opt-in still open is in progress: ' + JSON.stringify(changing));
      ok(!changing.some(function (t) { return t.indexOf(M.get('storage').name) === 0; }) && legacyIn.indexOf(M.get('storage').name) >= 0, theme + ': one the tier already met is Live, as on the Modules page, never also "Opt-in requested"');
      ok(await page.locator('#omega-package-tab').count() === 0 && calls.catalog === catalogBefore, theme + ': no Ladder and no package pricing for a legacy plan');
      await page.screenshot({ path: path.join(output, theme + '-desktop-legacy.png') });
      /* the retried plan survives an injected gated button (the gating block re-applies its stale fail-safe tier) */
      await page.evaluate(function () { var b = document.createElement('div'); b.setAttribute('data-cap', 'schematic'); b.id = 'plan-probe'; b.textContent = 'probe'; document.body.appendChild(b); });
      await page.waitForTimeout(300);
      ok(await page.evaluate(function () { return getComputedStyle(document.getElementById('plan-probe')).display !== 'none'; }), theme + ': a Performance capability stays after the retry');
      await closePanel();

      /* the phone: a read-only package, the tightest chip */
      await page.setViewportSize({ width: 390, height: 844 });
      await applyView(expired);
      await page.waitForFunction(function () { return document.querySelector('#omega-plan-chip .oep-s').textContent === ' · Read-only'; });
      var fit = await page.evaluate(function () {
        var nav = document.getElementById('portal-nav'), chip = document.getElementById('omega-plan-chip').getBoundingClientRect();
        return { nav: nav.scrollWidth - nav.clientWidth, chipRight: chip.right, width: window.innerWidth, page: document.documentElement.scrollWidth - window.innerWidth };
      });
      ok(fit.nav <= 1 && fit.chipRight <= fit.width && fit.page <= 1, theme + ': 390px: the chip fits the title bar, no sideways scroll ' + JSON.stringify(fit));
      await page.mouse.move(1, 843); await page.waitForTimeout(150);
      ok(await page.evaluate(chipContrast) >= 4.5, theme + ': chip text reads at 4.5:1 or better');
      await page.screenshot({ path: path.join(output, theme + '-phone-chip.png') });
      await openPanel();
      var box = await pop.boundingBox();
      ok(box.x >= 0 && box.x + box.width <= 390 && box.y >= 0, theme + ': 390px: the panel is on the screen ' + JSON.stringify(box));
      ok(await page.evaluate(function () { return document.documentElement.scrollWidth <= window.innerWidth + 1; }), theme + ': 390px: the open panel adds no sideways scroll');
      await page.screenshot({ path: path.join(output, theme + '-phone-panel.png') });
      await closePanel();
      await page.setViewportSize({ width: 1280, height: 900 });
      /* measured at rest and under the pointer on purpose: where the pointer
         was left after the phone steps is not the state under test */
      await page.mouse.move(1, 899); await page.waitForTimeout(150);
      ok(await page.evaluate(chipContrast) >= 4.5, theme + ': desktop chip text reads at 4.5:1 or better');
      await page.hover('#omega-plan-chip'); await page.waitForTimeout(150);
      ok(await page.evaluate(function () { return document.getElementById('omega-plan-chip').matches(':hover'); }) && await page.evaluate(chipContrast) >= 4.5, theme + ': desktop chip text reads at 4.5:1 or better under the pointer');
      await page.mouse.move(1, 899);

      ok(!errors.length, theme + ': no editor errors: ' + errors.join('; '));
      await context.close();
    }
    console.log('Editor plan chip: ' + count + ' checks passed; 14 screenshots in ' + output + '; full editor on an offline Firebase stand-in, real projections and price list, no live writes.');
  } finally { await browser.close(); server.close(); }
}
run().catch(function (e) { console.error(e); server.close(); process.exitCode = 1; });
