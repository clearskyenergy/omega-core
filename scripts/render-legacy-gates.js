/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * What a LEGACY plan really opens inside the editor, module by module, read
 * off the real editor and held to api/_lib/modules.js `legacyGates`.
 *
 * The store, the workspace's Modules page and the master console say "On
 * your plan", "Partly" or "Ask ClearSky" for a legacy workspace
 * (OmegaWorkspaceHub.moduleState). They used to judge a module by its
 * standalone tools alone, so a Performance tenant producing plot plans in
 * the editor was told to buy Plan Sets. The editor gates a legacy tier with
 * data-cap on a command or on the tab it sits on (Analyze and Estimate need
 * `engineering`, Compute needs `compute`); every other command is open at
 * every tier. `legacyGates` is that fact per module: the caps that gate its
 * commands, '' for the ones nothing gates.
 *
 * Boots the full editor on a legacy billing record (no package, so nothing
 * is moved between tabs), per tier, with offline adapters, and fails when:
 *   - a module's commands sit behind a gate the table does not list, or the
 *     table lists one the editor no longer has (drift either way);
 *   - for any tier, the table and OmegaCaps.canWith predict a command to be
 *     open or closed and the editor disagrees;
 *   - Omega Design's drawing tools (Trace Boundary, Fence & Tie, Move
 *     System) are not on Draw, shown and runnable, on every plan;
 *   - Search tools (Ctrl+K) or Ask Jarvis lists or runs a command on a tab
 *     the plan hides, or Jarvis is told of or opens such a tab. They run a
 *     command by clicking it, so they reached what the ribbon did not show;
 *   - a tab the plan opens nothing on is not an Opt in (Tommy, 2026-09-27:
 *     "it shouldn't be blank on the panel. It should say opt in"): in the
 *     strip and the phone's tab menu alike it names the modules whose
 *     commands sit on it, opening it shows them with Opt in and never a
 *     command, and a shut tab with nothing for sale is in neither;
 *   - a module bought as an add-on (the server's legacy answer, served here
 *     from package-access.legacy()) does not open exactly its own commands:
 *     Core with Omega Compute gets Compute's commands, and Intel's and
 *     Engineer's on the same tab stay shut, in the ribbon and by name;
 *   - on a 390px phone, Compute from the tab menu is not the Opt in with
 *     its button on screen, or Opt in does not reach plan-change's
 *     addon-quote (and a member is told who to ask).
 * `node scripts/render-legacy-gates.js --print` prints the table to paste.
 */
'use strict';
var fs = require('fs'), path = require('path'), http = require('http'), assert = require('assert');
var M = require('../api/_lib/modules'), X = require('../api/_lib/package-access'), P = require('../api/_lib/subscription-pricing'), BOOK = require('../api/_lib/pricebook').proposed();
var ROOT = path.join(__dirname, '..');
var chromium = require(process.env.PLAYWRIGHT || 'playwright').chromium;
var PRINT = process.argv.indexOf('--print') >= 0;
var server = http.createServer(function (req, res) {
  var pathname = new URL(req.url, 'http://localhost').pathname, file = path.resolve(ROOT, '.' + pathname);
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  var mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
  res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream'); res.end(fs.readFileSync(file));
});
/* A legacy tenant: billing/current has a tier and no `packaged`. */
function fixture(plan) {
  var tier = plan.tier;
  /* the billing record, mutable so a scenario can record a payment */
  window.__fixtureBilling = plan;
  var user = { uid: 'legacy-user', email: 'designer@legacy.example', emailVerified: true, displayName: 'Legacy Designer', getIdToken: function () { return Promise.resolve('offline-fixture'); } };
  function snapshot(p) {
    var data = /billing\/current$/.test(p) ? window.__fixtureBilling :
      /^omega_orgs\/[^/]+$/.test(p) ? { name: 'Legacy preview', status: 'active', domains: [location.hostname] } :
      /members\//.test(p) ? { role: 'owner', status: 'active' } : null;
    return { exists: !!data, id: p.split('/').pop(), data: function () { return data; }, docs: [], empty: true, forEach: function () {} };
  }
  function ref(p) {
    return { collection: function (n) { return ref(p + '/' + n); }, doc: function (n) { return ref(p + '/' + n); },
      get: function () { return Promise.resolve(snapshot(p)); },
      onSnapshot: function (fn) { setTimeout(function () { fn(snapshot(p)); }, 0); return function () {}; },
      where: function () { return this; }, orderBy: function () { return this; }, limit: function () { return this; },
      set: function () { return Promise.resolve(); }, update: function () { return Promise.resolve(); }, add: function () { return Promise.resolve({ id: 'fixture' }); } };
  }
  var db = { collection: function (n) { return ref(n); }, settings: function () {}, enablePersistence: function () { return Promise.resolve(); } };
  window.__fixtureUser = user; window.__fixtureListeners = [];
  var auth = { currentUser: null, onAuthStateChanged: function (fn) { window.__fixtureListeners.push(fn); return function () {}; }, getRedirectResult: function () { return Promise.resolve({}); }, setPersistence: function () { return Promise.resolve(); }, signOut: function () { return Promise.resolve(); } };
  function firestore() { return db; }
  firestore.FieldValue = { serverTimestamp: function () { return 'fixture-time'; } };
  function authentication() { return auth; }
  authentication.Auth = { Persistence: { LOCAL: 'local' } };
  authentication.GoogleAuthProvider = function () { this.setCustomParameters = function () {}; };
  var app = { firestore: firestore, auth: authentication };
  window.firebase = { apps: [app], initializeApp: function () { return app; }, app: function () { return app; }, firestore: firestore, auth: authentication };
  window.CLEARSKY_CONFIG = { firebase: {}, adminDomains: ['clearsky-usa.com'], tenant: { orgId: 'legacy.example', name: 'Legacy preview', tier: tier, status: 'active' } };
  window.alert = function () {};
}
/* Every command the editor carries, where it sits and what gates it. */
function survey(catalogIds) {
  var seen = [], out = [];
  function take(el) {
    if (!el || seen.indexOf(el) >= 0) return; seen.push(el);
    if (el.hasAttribute('data-packaging-retired') || el.hasAttribute('data-omega-retired') || el.hasAttribute('data-shelf-dupe') ||
        el.classList.contains('omega-gated-hidden') || el.classList.contains('omega-soon')) return;
    /* every data-cap from the outermost container in to the command: a
       command on the Analyze page that also carries its own cap needs both */
    var chain = [], n = el, page = el.closest('.ribbon-page');
    for (; n && n.getAttribute; n = n.parentElement) { var c = n.getAttribute('data-cap'); if (c) chain.unshift(c); }
    out.push({ id: el.id || '', onclick: el.getAttribute('onclick') || '', gate: chain.join('+'),
      page: page ? page.getAttribute('data-page') : '', blocked: !!el.closest('[data-cap-blocked]'), fly: el.classList.contains('rb-fly-item'),
      open: OmegaCaps.allowedElement(el), addonHidden: el.hasAttribute('data-addon-hidden') });
  }
  var nodes = document.querySelectorAll('#ribbon .rbtn,#ribbon .rsbtn,.rb-fly-item,#app-menu .menu-item');
  for (var i = 0; i < nodes.length; i++) take(nodes[i]);
  catalogIds.forEach(function (id) { take(document.getElementById(id)); });
  return out;
}
var count = 0;
function ok(value, label) { assert(value, label); count++; }
/* who owns a command, by the editor's own rule (omega-caps.js owners): an
   exact #id claim wins over a handler match */
var OWNERS = M.catalog().concat(M.notSold());
function owners(id, handler) {
  var exact = id ? OWNERS.filter(function (m) { return m.ribbon.indexOf('#' + id) >= 0; }) : [];
  return (exact.length ? exact.map(function (m) { return m.key; }) : M.owners('', handler));
}
/* The server's answers the editor asks for, and nothing that produces: the
   legacy answer (the add-ons on and the catalog, package-access.legacy()),
   the public price list, and the billing summary and the add-on quote
   (plan-change); every producer is offline. `api` records what was posted. */
var PAY_URL = 'https://connect.intuit.com/portal/app/CommerceNetwork/view/render-legacy-gates';
function answer(route, status, body) { return route.fulfill({ status: status, contentType: 'application/json', body: JSON.stringify(body) }); }
function serve(context, base, billing, api) {
  return context.route('**/*', function (route) {
    var url = new URL(route.request().url()), req = route.request();
    if (url.origin !== base) return route.fulfill({ status: 200, body: '' });
    if (url.pathname === '/api/package-access') return answer(route, 200, X.legacy(billing, Date.now()));
    if (url.pathname === '/api/offerings') return answer(route, 200, { modules: P.catalog(BOOK) });
    if (url.pathname === '/api/plan-change' && req.method() === 'GET') return answer(route, 200, { orgId: 'legacy.example', packaged: false, canManage: api.canManage, addOns: null, pending: [] });
    if (url.pathname === '/api/plan-change') {
      var body = JSON.parse(req.postData() || '{}'); api.posts.push(body);
      /* the purchase: an invoice waiting on QuickBooks' page; "I've paid" finds it paid once the scenario says so */
      if (body.action === 'addon-buy') return answer(route, 200, { ok: true, addOnId: 'addon-' + new Array(49).join('a'), state: 'awaiting_payment', add: body.add, addNames: body.add.map(function (k) { return M.get(k).name; }),
        todayCents: 50000, display: '$500.00', paymentLink: PAY_URL, payLinkMissing: false, expiresOn: '2026-10-26', live: [] });
      if (body.action === 'reconcile-now') return answer(route, 200, { orgId: 'legacy.example', packaged: false, checkedAt: Date.now(), addOns: { live: api.paid ? billing.addOns.live.slice() : [], pending: [] } });
      if (body.action !== 'addon-quote') return answer(route, 503, { error: 'Offline producer' });
      return answer(route, 200, { orgId: 'legacy.example', previewId: new Array(49).join('a'), effectiveAt: Date.now(), add: body.add, addNames: body.add.map(function (k) { return M.get(k).name; }),
        canBuy: true, request: false, included: false, needsProfile: false, todayCents: 50000, display: { amount: '$500.00', today: '$500.00 today, for 2026-09-27 to 2026-10-26',
          then: 'then $500/month on the 27th, on its own invoice beside your plan', activation: 'Pay by card on QuickBooks\' secure page. It switches on the moment the payment clears.', plan: 'Your plan and its billing stay exactly as they are.' } });
    }
    if (url.pathname.indexOf('/api/') === 0) return answer(route, 503, { error: 'Offline producer' });
    return route.continue();
  });
}
function billingOf(tier, addons, live) {
  var b = { tier: tier, addons: addons || [] };
  if (live) b.addOns = { modules: live, live: live, accessUntil: Date.now() + 20 * 86400000 };
  return b;
}
async function boot(browser, base, tier, addons, live) {
  var context = await browser.newContext({ viewport: { width: 1440, height: 900 } }), billing = billingOf(tier, addons, live);
  await context.addInitScript(fixture, billing);
  await serve(context, base, billing, { canManage: true, posts: [] });
  var page = await context.newPage(), errors = [];
  page.on('pageerror', function (e) { errors.push(e.message); });
  await page.goto(base + '/editor.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(function () { firebase.auth().currentUser = window.__fixtureUser; window.__fixtureListeners.forEach(function (fn) { fn(window.__fixtureUser); }); });
  await page.waitForFunction(function (t) { return window.OmegaCaps && !OmegaCaps.packageAccess() && document.body.getAttribute('data-tier') === t; }, tier);
  // the ribbon injectors run on timers; let every one of them land
  await page.waitForTimeout(4000);
  await page.evaluate(function () { OmegaCaps.apply(OmegaCaps.tier()); });
  var ids = [];
  M.catalog().forEach(function (m) { m.ribbon.forEach(function (s) { if (s.charAt(0) === '#') ids.push(s.slice(1)); }); });
  var rows = await page.evaluate(survey, ids);
  /* a blocked tab is really gone, not just flagged */
  var shownBlockedTabs = await page.evaluate(function () {
    return Array.prototype.filter.call(document.querySelectorAll('#ribbon-tabs .rtab[data-cap-blocked]'), function (t) { return getComputedStyle(t).display !== 'none'; }).map(function (t) { return t.getAttribute('data-page'); });
  });
  /* Run by name: Search tools (Ctrl+K) and Ask Jarvis click a command, so
     they reach what the ribbon hides. Nothing on a tab the plan hides may
     be listed or run, and Jarvis may not name or open such a tab. */
  rows.byName = await page.evaluate(function () {
    function label(el) {
      var lbl = el.querySelector('.rb-lbl'), d = document.createElement('div');
      d.innerHTML = (lbl ? lbl.innerHTML.replace(/<br\s*\/?>/gi, ' ') : el.innerHTML).replace(/<span class="rb-ico"[\s\S]*?<\/span>/i, '');
      return (d.textContent || '').replace(/\s+/g, ' ').trim();
    }
    var hidden = [], open = [], nodes = document.querySelectorAll('#ribbon .ribbon-page .rbtn,#ribbon .ribbon-page .rsbtn,#app-menu .menu-item,.rb-fly-item');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i], name = label(el);
      if (!name || el.hasAttribute('data-omega-retired') || el.hasAttribute('data-packaging-retired')) continue;
      (el.closest('[data-cap-blocked]') || el.hasAttribute('data-addon-hidden') ? hidden : open).push(name);
    }
    var listed = OmegaCommands.list().map(function (c) { return c.name; });
    var leaked = hidden.filter(function (n, k) { return hidden.indexOf(n) === k && open.indexOf(n) < 0 && listed.indexOf(n) >= 0; });
    var blockedTabs = Array.prototype.map.call(document.querySelectorAll('#ribbon-tabs .rtab[data-cap-blocked]'), function (t) { return t.getAttribute('data-page'); });
    var jarvisTabs = OmegaJarvisHelp.situation().page.tabs.map(function (t) { return t.id; });
    return { leaked: leaked, listed: listed.length, blockedTabs: blockedTabs, jarvisTabs: jarvisTabs, named: hidden.length };
  });
  rows.ran = {};
  for (var id of ['rb-valuestack', 'rb-compute-cost', 'rb-trace-boundary']) {
    var before = await page.evaluate(function (id) {
      var el = document.getElementById(id); if (!el) return null;
      window.__ran = false; el.addEventListener('click', function () { window.__ran = true; }, { capture: true, once: true });
      var lbl = el.querySelector('.rb-lbl'), d = document.createElement('div');
      d.innerHTML = (lbl ? lbl.innerHTML.replace(/<br\s*\/?>/gi, ' ') : el.textContent); var name = (d.textContent || '').replace(/\s+/g, ' ').trim();
      OmegaCommands.run(name);
      return name;
    }, id);
    await page.waitForTimeout(250);
    rows.ran[id] = before == null ? null : await page.evaluate(function () { return window.__ran; });
  }
  rows.jarvisTab = {};
  for (var tab of ['analyze', 'compute']) {
    rows.jarvisTab[tab] = await page.evaluate(function (tab) {
      window.rbTab('home');
      var opened = OmegaJarvisHelp.apply({ kind: 'tab', page: tab });
      var active = document.querySelector('#ribbon-tabs .rtab.active');
      return { opened: opened, active: active ? active.getAttribute('data-page') : null };
    }, tab);
  }
  /* Opt in where the plan stops: every tab the plan opens nothing on, in
     Pro (Designer curates tabs of its own), opened one by one */
  rows.optin = await page.evaluate(async function () {
    if (window.OmegaMode) OmegaMode.set('pro');
    var out = { tabs: [], shut: [] }, tabs = document.querySelectorAll('#ribbon-tabs .rtab[data-page]');
    /* the panel follows the tab by an observer: a microtask, before the next paint */
    function settle() { return new Promise(function (r) { setTimeout(r, 30); }); }
    for (var i = 0; i < tabs.length; i++) {
      var t = tabs[i], key = t.getAttribute('data-page'); if (key === '__file') continue;
      var menu = document.querySelector('#ribbon-tab-menu [onclick="rbHamburgerPick(\'' + key + '\')"]');
      if (!t.hasAttribute('data-cap-blocked')) { if (t.hasAttribute('data-optin') || (menu && (menu.hasAttribute('data-optin') || menu.hasAttribute('data-tab-shut')))) out.shut.push('open tab marked: ' + key); continue; }
      window.rbTab(key); await settle();
      var panel = document.getElementById('omega-optin'), pg = document.querySelector('#ribbon .ribbon-page[data-page="' + key + '"]');
      out.tabs.push({ page: key, optin: t.getAttribute('data-optin'), menu: menu ? menu.getAttribute('data-optin') : 'missing', menuShut: !!(menu && menu.hasAttribute('data-tab-shut')),
        shown: getComputedStyle(t).display !== 'none', panel: !!(panel && panel.offsetParent), label: panel ? (panel.querySelector('.oin-lead b') || {}).textContent : null,
        offered: panel ? Array.prototype.map.call(panel.querySelectorAll('[data-optin-module]'), function (m) { return m.getAttribute('data-optin-module'); }) : [],
        buttons: panel ? panel.querySelectorAll('[data-optin-module] .oin-go').length : 0, primary: pg.getAttribute('data-module'),
        commands: Array.prototype.filter.call(pg.querySelectorAll('.rbtn,.rsbtn'), function (b) { return !!b.offsetParent; }).length, open: OmegaCaps.tabOpen(key) });
    }
    window.rbTab('home'); await settle();
    var after = document.getElementById('omega-optin');
    out.closed = !after || !after.offsetParent;
    return out;
  });
  /* Omega Design's drawing tools live on Draw on every plan, where a
     package puts them, not on the Compute tab a legacy tier below
     Enterprise hides. Draw is a Pro tab, so Pro is where they are seen. */
  rows.lite = await page.evaluate(function () {
    if (window.OmegaMode) OmegaMode.set('pro');
    window.rbTab('draw');
    var names = OmegaCommands.list().map(function (c) { return c.name; });
    return ['rb-trace-boundary', 'rb-fence-tie', 'rb-move-system'].map(function (id) {
      var el = document.getElementById(id), page = el && el.closest('.ribbon-page'), lbl = el && el.querySelector('.rb-lbl');
      var name = lbl ? lbl.innerHTML.replace(/<br\s*\/?>/gi, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim() : '';
      return { id: id, page: page ? page.getAttribute('data-page') : null, shown: !!(el && el.offsetParent && el.getBoundingClientRect().width > 0),
        open: !!el && OmegaCaps.allowedElement(el), listed: names.indexOf(name) >= 0 };
    });
  });
  await context.close();
  rows.shownBlockedTabs = shownBlockedTabs;
  return { rows: rows, errors: errors };
}
/* The screenshot's case: a Core plan on a 390px phone picks Compute from the
   tab menu. It must say Opt in with its button on screen, and Opt in must
   reach plan-change's addon-quote (a member is told who to ask). */
async function phone(browser, base) {
  var context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  var billing = billingOf('standard'), api = { canManage: true, posts: [] }, out = { errors: [] };
  await context.addInitScript(fixture, billing);
  await serve(context, base, billing, api);
  var page = await context.newPage();
  page.on('pageerror', function (e) { out.errors.push(e.message); });
  await page.goto(base + '/editor.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(function () { firebase.auth().currentUser = window.__fixtureUser; window.__fixtureListeners.forEach(function (fn) { fn(window.__fixtureUser); }); });
  await page.waitForFunction(function () { return window.OmegaCaps && document.body.getAttribute('data-tier') === 'standard' && OmegaCaps.legacyView(); });
  await page.waitForTimeout(4000);
  await page.evaluate(function () { if (window.OmegaMode) OmegaMode.set('pro'); OmegaCaps.apply(OmegaCaps.tier()); });
  await page.click('#ribbon-hamburger');
  out.menu = await page.evaluate(function () {
    var item = document.querySelector('#ribbon-tab-menu .rtm-item[onclick*="\'compute\'"]');
    return { shown: !!(item && item.offsetParent), optin: item && item.getAttribute('data-optin'), says: item && getComputedStyle(item, '::after').content };
  });
  await page.click('#ribbon-tab-menu .rtm-item[onclick*="\'compute\'"]');
  await page.waitForTimeout(300);
  out.panel = await page.evaluate(function () {
    var p = document.getElementById('omega-optin'), go = p && p.querySelector('[data-optin-module="compute"] .oin-go'), r = go && go.getBoundingClientRect(), first = p && p.querySelector('[data-optin-module]');
    var lead = p && p.querySelector('.oin-lead b'), lr = lead && lead.getBoundingClientRect();
    return { label: document.getElementById('ribbon-hamburger-lbl').textContent, shown: !!(p && p.offsetParent), first: first ? first.getAttribute('data-optin-module') : null,
      inView: !!r && r.width > 0 && r.left >= 0 && r.right <= window.innerWidth, leadInView: !!lr && lr.width > 0 && lr.left >= 0 && lr.right <= window.innerWidth,
      said: lead ? lead.textContent : null, text: p ? p.textContent : '' };
  });
  await page.click('#omega-optin [data-optin-module="compute"] .oin-go');
  await page.waitForSelector('#omega-package-menu [data-addon="compute"] button');
  out.dialog = await page.evaluate(function () { return { title: document.getElementById('opm-title').textContent, button: document.querySelector('#omega-package-menu [data-addon="compute"] button').textContent }; });
  await page.click('#omega-package-menu [data-addon="compute"] button');
  await page.waitForSelector('#omega-package-menu [data-addon="compute"] .opm-quote');
  out.quote = await page.evaluate(function () { var b = document.querySelector('#omega-package-menu [data-addon="compute"] .opm-row .opm-primary'); return b ? b.textContent : null; });
  api.canManage = false;
  await page.evaluate(function () { OmegaPackageMenu.close(); });
  await page.click('#omega-optin [data-optin-module="compute"] .oin-go');
  await page.waitForSelector('#omega-package-menu [data-addon="compute"] .opm-note');
  out.member = await page.evaluate(function () { return document.querySelector('#omega-package-menu [data-addon="compute"]').textContent; });
  out.posted = api.posts.slice();
  /* the owner buys it: Pay opens QuickBooks' page, "I've paid" finds it paid,
     the plan is read again and the Compute tab opens with Compute's commands */
  api.canManage = true;
  await page.evaluate(function () { OmegaPackageMenu.close(); });
  await page.click('#omega-optin [data-optin-module="compute"] .oin-go');
  await page.locator('#omega-package-menu [data-addon="compute"] button', { hasText: 'Opt in' }).first().click();
  await page.locator('#omega-package-menu [data-addon="compute"] button', { hasText: 'Opt in and pay' }).click();
  await page.locator('#omega-package-menu [data-addon="compute"] button', { hasText: "I've paid" }).waitFor();
  out.waiting = await page.evaluate(function () { var h = document.querySelector('#omega-package-menu [data-addon="compute"]'), a = h.querySelector('a.opm-paylink'); return { text: h.textContent, pay: a ? a.getAttribute('href') : null }; });
  var live = { modules: ['compute'], live: ['compute'], accessUntil: Date.now() + 20 * 86400000 };
  billing.addOns = live; api.paid = true;
  await page.evaluate(function (a) { window.__fixtureBilling.addOns = a; }, live);
  await page.locator('#omega-package-menu [data-addon="compute"] button', { hasText: "I've paid" }).click();
  await page.waitForFunction(function () { return OmegaCaps.addOnsOn().indexOf('compute') >= 0 && !document.getElementById('omega-package-menu'); }, null, { timeout: 15000 });
  await page.waitForTimeout(400);
  out.after = await page.evaluate(function () {
    var pg = document.querySelector('#ribbon .ribbon-page[data-page="compute"]'), p = document.getElementById('omega-optin'), t = document.getElementById('omega-plan-toast');
    return { label: document.getElementById('ribbon-hamburger-lbl').textContent, shown: Array.prototype.filter.call(pg.querySelectorAll('.rbtn'), function (b) { return !!b.offsetParent && OmegaCaps.allowedElement(b); }).length,
      offer: !!(p && p.offsetParent), menu: document.querySelector('#ribbon-tab-menu .rtm-item[onclick*="\'compute\'"]').getAttribute('data-optin'), toast: t ? t.textContent : null, open: OmegaCaps.tabOpen('compute') };
  });
  out.actions = api.posts.map(function (b) { return b.action; });
  await context.close();
  return out;
}
function sameSet(a, b) { return a.slice().sort().join() === b.slice().sort().join(); }
async function run() {
  await new Promise(function (resolve) { server.listen(0, '127.0.0.1', resolve); });
  var base = 'http://127.0.0.1:' + server.address().port;
  var browser = await chromium.launch({ executablePath: process.env.CHROME || chromium.executablePath() });
  var catalog = M.catalog(), keys = catalog.map(function (m) { return m.key; });
  try {
    var tiers = ['enterprise', 'deluxe', 'standard', 'trial'], seen = {};
    for (var t = 0; t < tiers.length; t++) seen[tiers[t]] = await boot(browser, base, tiers[t]);
    /* a Core plan with the Compute add-on: parcelscreen without engineering, compute without enterprise */
    var ADDON = 'standard+compute'; seen[ADDON] = await boot(browser, base, 'standard', ['compute']);
    /* a Core plan that BOUGHT Omega Compute (Add to plan): live in the server's legacy answer, no key on the record */
    var BOUGHT = 'standard, Omega Compute bought'; seen[BOUGHT] = await boot(browser, base, 'standard', [], ['compute']);
    var onPhone = await phone(browser, base);
    var full = seen.enterprise;
    ok(!full.errors.length, 'no editor errors on a legacy boot: ' + full.errors.join('; '));
    /* the gates each module's commands sit behind, from the fullest ribbon */
    var gates = {};
    keys.forEach(function (k) { gates[k] = []; });
    full.rows.forEach(function (r) {
      owners(r.id, r.onclick).forEach(function (k) {
        if (!gates[k]) return;
        if (gates[k].indexOf(r.gate) < 0) gates[k].push(r.gate);
      });
    });
    keys.forEach(function (k) { gates[k].sort(); });
    if (PRINT) {
      console.log(JSON.stringify(gates));
      /* and which commands carry each gate, to read the table by */
      full.rows.forEach(function (r) { var own = owners(r.id, r.onclick).filter(function (k) { return gates[k]; }); if (own.length && r.gate) console.log('  ' + own.join('+') + ' · ' + r.gate + ' · ' + (r.page || '-') + ' · ' + (r.id || r.onclick.slice(0, 60))); });
      return;
    }
    catalog.forEach(function (m) {
      var listed = (m.legacyGates || []).slice().sort();
      ok(JSON.stringify(listed) === JSON.stringify(gates[m.key]), m.key + ': modules.js legacyGates ' + JSON.stringify(listed) + ' matches the editor ' + JSON.stringify(gates[m.key]));
    });
    /* and per tier, the gates predict what the editor really opens */
    global.window = global; global.document = { documentElement: {}, body: { setAttribute: function () {}, getAttribute: function () { return null; } }, querySelectorAll: function () { return []; }, addEventListener: function () {}, dispatchEvent: function () {} };
    require('../omega-caps.js');
    var C = global.OmegaCaps;
    tiers.concat([ADDON]).forEach(function (tier) {
      var wrong = [], plan = tier === ADDON ? { tier: 'standard', addons: ['compute'] } : { tier: tier, addons: [] };
      seen[tier].rows.forEach(function (r) {
        if (!owners(r.id, r.onclick).some(function (k) { return gates[k]; })) return;
        var predicted = !r.gate || r.gate.split('+').every(function (g) { return C.canWith(plan.tier, g, { addons: plan.addons }); });
        if (predicted === r.blocked) wrong.push((r.id || r.onclick.slice(0, 40)) + ' gate=' + r.gate + ' blocked=' + r.blocked);
      });
      ok(!wrong.length, tier + ': every module command is open exactly when its gate says so' + (wrong.length ? ': ' + wrong.slice(0, 8).join('; ') : ''));
      var missing = full.rows.filter(function (r) { return r.gate === '' && owners(r.id, r.onclick).length && !seen[tier].rows.some(function (x) { return x.id === r.id && x.onclick === r.onclick; }); });
      ok(!missing.length, tier + ': no ungated command is missing from this tier\'s editor' + (missing.length ? ': ' + missing.slice(0, 8).map(function (r) { return r.id || r.onclick.slice(0, 40); }).join('; ') : ''));
      /* Opt in where the plan stops (Tommy, 2026-09-27): shown only as that */
      ok(!seen[tier].rows.shownBlockedTabs.filter(function (k) { return !seen[tier].rows.optin.tabs.some(function (t) { return t.page === k && t.optin !== null; }); }).length,
         tier + ': a tab its plan does not open is shown only as an Opt in: ' + seen[tier].rows.shownBlockedTabs.join(', '));
      ok(!seen[tier].rows.optin.shut.length, tier + ': a tab the plan opens carries no Opt in: ' + seen[tier].rows.optin.shut.join('; '));
      seen[tier].rows.optin.tabs.forEach(function (t) {
        var want = []; full.rows.forEach(function (r) { if (r.page === t.page) owners(r.id, r.onclick).forEach(function (k) { if (k !== 'lite' && M.get(k) && want.indexOf(k) < 0) want.push(k); }); });
        ok(t.shown && t.optin !== null && t.optin === t.menu && !t.menuShut, tier + ': ' + t.page + ' is an Opt in in the strip and the phone\'s tab menu alike: ' + JSON.stringify(t));
        ok(sameSet(t.offered, want) && t.optin === t.offered.join(' ') && (!t.primary || t.offered[0] === t.primary),
           tier + ': ' + t.page + ' offers every module whose commands sit on it, its own first: ' + t.offered.join(',') + ' / ' + want.join(','));
        ok(t.panel && t.label === t.page.charAt(0).toUpperCase() + t.page.slice(1) + ' is not on your plan' && t.buttons === t.offered.length && t.commands === 0 && !t.open,
           tier + ': opening ' + t.page + ' shows Opt in for each, never one of its commands, and Jarvis still may not open it: ' + JSON.stringify(t));
      });
      ok(seen[tier].rows.optin.closed, tier + ': leaving an Opt in tab puts the ribbon back');
      /* run by name: Search tools (Ctrl+K) and Ask Jarvis */
      var b = seen[tier].rows.byName, ran = seen[tier].rows.ran, jt = seen[tier].rows.jarvisTab;
      ok(b.listed > 0 && !b.leaked.length, tier + ': Search tools lists nothing from a tab the plan hides (' + b.named + ' hidden)' + (b.leaked.length ? ': ' + b.leaked.slice(0, 8).join('; ') : ''));
      [['rb-valuestack', 'engineering'], ['rb-compute-cost', 'compute'], ['rb-trace-boundary', '']].forEach(function (c) {
        var open = !c[1] || C.canWith(plan.tier, c[1], { addons: plan.addons });
        ok(ran[c[0]] === open, tier + ': ' + c[0] + ' (behind ' + c[1] + ') ' + (open ? 'runs' : 'does not run') + ' by name (Search tools, Jarvis): ran=' + ran[c[0]]);
      });
      ok(!b.blockedTabs.some(function (t) { return b.jarvisTabs.indexOf(t) >= 0; }) && b.jarvisTabs.indexOf('home') >= 0,
         tier + ': Jarvis is told only the tabs the plan opens: ' + b.jarvisTabs.join(','));
      var misplaced = seen[tier].rows.lite.filter(function (l) { return !(l.page === 'draw' && l.shown && l.open && l.listed); });
      ok(!misplaced.length, tier + ': Trace Boundary, Fence & Tie and Move System sit on Draw, shown in Pro, open and in Search tools' + (misplaced.length ? ': ' + JSON.stringify(misplaced) : ''));
      ['analyze', 'compute'].forEach(function (tab) {
        var open = C.canWith(plan.tier, tab === 'compute' ? 'compute' : 'engineering', { addons: plan.addons });
        ok(jt[tab].opened === open && jt[tab].active === (open ? tab : 'home'),
           tier + ': Jarvis ' + (open ? 'opens' : 'refuses to open') + ' the ' + tab + ' tab (and leaves the ribbon where it was): ' + JSON.stringify(jt[tab]));
      });
    });
    /* Core that bought Omega Compute: exactly its commands, nothing of Intel's or Engineer's on its tab */
    var bought = seen[BOUGHT];
    ok(!bought.errors.length, 'no editor errors with an add-on: ' + bought.errors.join('; '));
    var mine = bought.rows.filter(function (r) { return r.page === 'compute' && owners(r.id, r.onclick).indexOf('compute') >= 0; });
    var theirs = bought.rows.filter(function (r) { var own = owners(r.id, r.onclick); return r.page === 'compute' && own.length && own.indexOf('compute') < 0; });
    ok(mine.length >= 10 && mine.every(function (r) { return r.open && !r.addonHidden; }), BOUGHT + ': every Omega Compute command on its tab is open (' + mine.length + ')');
    ok(theirs.length >= 4 && theirs.every(function (r) { return !r.open && r.addonHidden; }), BOUGHT + ': Intel\'s and Engineer\'s commands on the same tab stay shut: ' + theirs.map(function (r) { return r.id + ':' + r.open; }).join(', '));
    var drift = bought.rows.filter(function (r) {
      var own = owners(r.id, r.onclick); if (!own.some(function (k) { return gates[k]; })) return false;
      var predicted = own.indexOf('compute') >= 0 || !r.gate || r.gate.split('+').every(function (g) { return C.canWith('standard', g, {}); });
      return predicted !== r.open;
    });
    ok(!drift.length, BOUGHT + ': every module command is open exactly when it is Compute\'s or the tier opens it' + (drift.length ? ': ' + drift.slice(0, 8).map(function (r) { return r.id || r.onclick.slice(0, 40); }).join('; ') : ''));
    ok(!C.canWith('standard', 'compute', {}) && bought.rows.byName.jarvisTabs.indexOf('compute') >= 0 && bought.rows.jarvisTab.compute.opened === true, BOUGHT + ': Jarvis may open the Compute tab now; the tier is still Core');
    ok(bought.rows.ran['rb-compute-cost'] === true && bought.rows.ran['rb-valuestack'] === false, BOUGHT + ': by name, Compute Cost runs and Value Stack (Storage, on Analyze) does not');
    ok(!bought.rows.byName.leaked.length, BOUGHT + ': Search tools lists nothing that stays shut: ' + bought.rows.byName.leaked.join('; '));
    ok(bought.rows.optin.tabs.map(function (t) { return t.page; }).sort().join() === 'analyze,estimate', BOUGHT + ': Analyze and Estimate are still Opt in, Compute is not: ' + JSON.stringify(bought.rows.optin.tabs.map(function (t) { return t.page; })));
    /* the phone: Compute from the tab menu says Opt in, and Opt in is the purchase */
    ok(!onPhone.errors.length, 'no editor errors on a phone: ' + onPhone.errors.join('; '));
    ok(onPhone.menu.shown && /^compute\b/.test(onPhone.menu.optin || '') && onPhone.menu.says === '"Opt in"', 'phone: the tab menu lists Compute as an Opt in: ' + JSON.stringify(onPhone.menu));
    ok(onPhone.panel.label === 'Compute' && onPhone.panel.shown && onPhone.panel.first === 'compute' && onPhone.panel.inView && onPhone.panel.leadInView && onPhone.panel.said === 'Compute is not on your plan' && /Omega Compute/.test(onPhone.panel.text) && /\$[\d,]+\/month/.test(onPhone.panel.text),
       'phone: picking it shows Omega Compute with its price and Opt in on screen, not an empty ribbon: ' + JSON.stringify(onPhone.panel));
    ok(onPhone.dialog.title === 'Opt in: Omega Compute' && onPhone.dialog.button === 'Opt in', 'phone: Opt in opens the purchase for that module: ' + JSON.stringify(onPhone.dialog));
    ok(onPhone.quote === 'Opt in and pay' && onPhone.posted.some(function (b) { return b.action === 'addon-quote' && JSON.stringify(b.add) === '["compute"]'; }), 'phone: Opt in asks plan-change for the server\'s price and offers Opt in and pay: ' + onPhone.quote);
    ok(/Ask your workspace owner or an administrator to add it\./.test(onPhone.member) && onPhone.posted.filter(function (b) { return b.action === 'addon-quote'; }).length === 1, 'phone: a member is told who to ask, and nothing is priced for them');
    ok(/Waiting for payment · \$500\.00/.test(onPhone.waiting.text) && onPhone.waiting.pay === PAY_URL, 'phone: Pay issues the invoice and hands over QuickBooks\' page; it waits for the payment: ' + JSON.stringify(onPhone.waiting));
    ok(onPhone.after.label === 'Compute' && onPhone.after.shown >= 5 && !onPhone.after.offer && onPhone.after.menu === null && onPhone.after.open,
       'phone: paid, the plan is read again and the Compute tab opens with Omega Compute\'s commands, no Opt in left: ' + JSON.stringify(onPhone.after));
    ok(/Omega Compute is on\. Find it on the Compute tab\./.test(onPhone.after.toast || ''), 'phone: and the editor says what switched on and where: ' + onPhone.after.toast);
    ok(onPhone.actions.join() === 'addon-quote,addon-quote,addon-buy,reconcile-now', 'phone: quote, buy, then the payment check, and nothing else: ' + onPhone.actions.join());
    console.log('Legacy editor gates: ' + count + ' checks; ' + tiers.length + ' legacy tiers, Core with the Compute key, Core with Omega Compute bought and a Core phone booted in the full editor, offline.');
  } finally { await browser.close(); server.close(); }
}
run().catch(function (e) { console.error(e); server.close(); process.exitCode = 1; });
