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
 *   - Search tools (Ctrl+K) or Ask Jarvis lists or runs a command on a tab
 *     the plan hides, or Jarvis is told of or opens such a tab. They run a
 *     command by clicking it, so they reached what the ribbon did not show.
 * `node scripts/render-legacy-gates.js --print` prints the table to paste.
 */
'use strict';
var fs = require('fs'), path = require('path'), http = require('http'), assert = require('assert');
var M = require('../api/_lib/modules');
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
  var tier = plan.tier, addons = plan.addons;
  var user = { uid: 'legacy-user', email: 'designer@legacy.example', emailVerified: true, displayName: 'Legacy Designer', getIdToken: function () { return Promise.resolve('offline-fixture'); } };
  function snapshot(p) {
    var data = /billing\/current$/.test(p) ? { tier: tier, addons: addons } :
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
      page: page ? page.getAttribute('data-page') : '', blocked: !!el.closest('[data-cap-blocked]'), fly: el.classList.contains('rb-fly-item') });
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
async function boot(browser, base, tier, addons) {
  var context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(fixture, { tier: tier, addons: addons || [] });
  await context.route('**/*', function (route) {
    var url = new URL(route.request().url());
    if (url.origin !== base) return route.fulfill({ status: 200, body: '' });
    if (url.pathname.indexOf('/api/') === 0) return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Offline producer"}' });
    return route.continue();
  });
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
      (el.closest('[data-cap-blocked]') ? hidden : open).push(name);
    }
    var listed = OmegaCommands.list().map(function (c) { return c.name; });
    var leaked = hidden.filter(function (n, k) { return hidden.indexOf(n) === k && open.indexOf(n) < 0 && listed.indexOf(n) >= 0; });
    var blockedTabs = Array.prototype.map.call(document.querySelectorAll('#ribbon-tabs .rtab[data-cap-blocked]'), function (t) { return t.getAttribute('data-page'); });
    var jarvisTabs = OmegaJarvisHelp.situation().page.tabs.map(function (t) { return t.id; });
    return { leaked: leaked, listed: listed.length, blockedTabs: blockedTabs, jarvisTabs: jarvisTabs, named: hidden.length };
  });
  rows.ran = {};
  for (var id of ['rb-valuestack', 'rb-compute-cost']) {
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
  await context.close();
  rows.shownBlockedTabs = shownBlockedTabs;
  return { rows: rows, errors: errors };
}
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
      ok(!seen[tier].rows.shownBlockedTabs.length, tier + ': a tab its plan does not open is not shown: ' + seen[tier].rows.shownBlockedTabs.join(', '));
      /* run by name: Search tools (Ctrl+K) and Ask Jarvis */
      var b = seen[tier].rows.byName, ran = seen[tier].rows.ran, jt = seen[tier].rows.jarvisTab;
      ok(b.listed > 0 && !b.leaked.length, tier + ': Search tools lists nothing from a tab the plan hides (' + b.named + ' hidden)' + (b.leaked.length ? ': ' + b.leaked.slice(0, 8).join('; ') : ''));
      [['rb-valuestack', 'engineering'], ['rb-compute-cost', 'compute']].forEach(function (c) {
        var open = C.canWith(plan.tier, c[1], { addons: plan.addons });
        ok(ran[c[0]] === open, tier + ': ' + c[0] + ' (behind ' + c[1] + ') ' + (open ? 'runs' : 'does not run') + ' by name (Search tools, Jarvis): ran=' + ran[c[0]]);
      });
      ok(!b.blockedTabs.some(function (t) { return b.jarvisTabs.indexOf(t) >= 0; }) && b.jarvisTabs.indexOf('home') >= 0,
         tier + ': Jarvis is told only the tabs the plan opens: ' + b.jarvisTabs.join(','));
      ['analyze', 'compute'].forEach(function (tab) {
        var open = C.canWith(plan.tier, tab === 'compute' ? 'compute' : 'engineering', { addons: plan.addons });
        ok(jt[tab].opened === open && jt[tab].active === (open ? tab : 'home'),
           tier + ': Jarvis ' + (open ? 'opens' : 'refuses to open') + ' the ' + tab + ' tab (and leaves the ribbon where it was): ' + JSON.stringify(jt[tab]));
      });
    });
    console.log('Legacy editor gates: ' + count + ' checks; ' + tiers.length + ' legacy tiers and Core with the Compute add-on booted in the full editor, offline.');
  } finally { await browser.close(); server.close(); }
}
run().catch(function (e) { console.error(e); server.close(); process.exitCode = 1; });
