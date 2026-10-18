#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   audit-logic-walk.js — walk every Omega Logic surface against the ONE
   sample tenant (scripts/_lib/logic-fixtures.js). Nothing here talks to
   production, Firebase, or a customer record.

     node scripts/audit-logic-walk.js                 # prints a JSON line per page
     node scripts/audit-logic-walk.js --out DIR       # also writes JPEG shots

   Chromium is $CHROME, else Google Chrome on this machine, else Playwright's
   own. If neither Playwright nor a browser is installed the walk is skipped
   (exit 0), the same way scripts/render-logic-pages.js skips. The page list
   and the collection list are exported for scripts/tests/tlogiccleanup.js,
   which does not need a browser. */
'use strict';
var fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
var ROOT = path.join(__dirname, '..');

/* Every office, plant, customer and ClearSky surface the product ships.
   file is the static page (clean URLs drop .html). persona is who the
   sample signs in as: tenant (Clean Cell admin), member (read-only),
   staff (ClearSky owner). Customer pages are the buyer's view of the
   same sample and are walked once. */
var PAGES = [
  { id: 'office-today', persona: 'tenant', path: '/omega-logic?org=cleancell.us', file: 'omega-logic.html', area: 'Sales' },
  { id: 'office-orders', persona: 'tenant', path: '/omega-logic?org=cleancell.us#orders', file: 'omega-logic.html', area: 'Sales' },
  { id: 'office-order', persona: 'tenant', path: '/omega-logic?org=cleancell.us&order=o3', file: 'omega-logic.html', area: 'Sales' },
  { id: 'office-member', persona: 'member', path: '/omega-logic?org=cleancell.us#orders', file: 'omega-logic.html', area: 'Sales' },
  { id: 'po-inbox', persona: 'tenant', path: '/po-inbox?office=1&org=cleancell.us', file: 'po-inbox.html', area: 'Sales' },
  { id: 'customer-po', persona: 'tenant', path: '/customer-po?office=1&org=cleancell.us', file: 'customer-po.html', area: 'Sales' },
  { id: 'customers', persona: 'tenant', path: '/portals/customer/admin.html?org=cleancell.us', file: 'portals/customer/admin.html', area: 'Customers' },
  { id: 'work-orders', persona: 'tenant', path: '/plant/work-orders.html?org=cleancell.us', file: 'plant/work-orders.html', area: 'Plant' },
  { id: 'serials', persona: 'tenant', path: '/plant/?org=cleancell.us', file: 'plant/index.html', area: 'Plant' },
  { id: 'plant-board', persona: 'tenant', path: '/plant/manager.html?org=cleancell.us', file: 'plant/manager.html', area: 'Plant' },
  { id: 'plant-quality', persona: 'tenant', path: '/plant/manager.html?org=cleancell.us#quality', file: 'plant/manager.html', area: 'Plant' },
  { id: 'plant-stations', persona: 'tenant', path: '/plant/manager.html?org=cleancell.us#stations', file: 'plant/manager.html', area: 'Plant' },
  { id: 'plant-flow', persona: 'staff', path: '/plant/manager.html?org=cleancell.us#flow', file: 'plant/manager.html', area: 'Plant' },
  { id: 'bench-unpaired', persona: 'tenant', path: '/plant/station.html', file: 'plant/station.html', area: 'Plant' },
  { id: 'bench', persona: 'tenant', path: '/plant/station.html', file: 'plant/station.html', area: 'Plant', pair: true },
  { id: 'plant-app', persona: 'tenant', path: '/plant/app?org=cleancell.us', file: 'plant/app.html', area: 'Plant', phone: true },
  { id: 'office-app', persona: 'tenant', path: '/office/app?org=cleancell.us', file: 'office/app.html', area: 'Sales', phone: true },
  { id: 'office-app-menu', persona: 'tenant', path: '/office/app?org=cleancell.us', file: 'office/app.html', area: 'Setup', phone: true, click: '[data-tab="menu"]' },
  { id: 'logistics', persona: 'tenant', path: '/logic-logistics.html?org=cleancell.us', file: 'logic-logistics.html', area: 'Deliver' },
  { id: 'freight', persona: 'tenant', path: '/logic-logistics.html?org=cleancell.us&order=o7#freight', file: 'logic-logistics.html', area: 'Deliver' },
  { id: 'custody', persona: 'tenant', path: '/logic-custody.html?org=cleancell.us', file: 'logic-custody.html', area: 'Deliver' },
  { id: 'register', persona: 'tenant', path: '/logic-register.html?org=cleancell.us', file: 'logic-register.html', area: 'Deliver' },
  { id: 'inventory', persona: 'tenant', path: '/logic-inventory.html?org=cleancell.us', file: 'logic-inventory.html', area: 'Stock' },
  { id: 'materials', persona: 'tenant', path: '/logic-materials.html?org=cleancell.us', file: 'logic-materials.html', area: 'Stock' },
  { id: 'purchasing', persona: 'tenant', path: '/logic-materials.html?org=cleancell.us#po', file: 'logic-materials.html', area: 'Stock' },
  { id: 'suppliers', persona: 'tenant', path: '/logic-materials.html?org=cleancell.us#suppliers', file: 'logic-materials.html', area: 'Stock' },
  { id: 'catalog', persona: 'tenant', path: '/logic-catalog.html?org=cleancell.us', file: 'logic-catalog.html', area: 'Setup' },
  { id: 'cash', persona: 'tenant', path: '/omega-logic?org=cleancell.us#cash', file: 'omega-logic.html', area: 'Money' },
  { id: 'accounting', persona: 'tenant', path: '/logic-accounting.html?org=cleancell.us', file: 'logic-accounting.html', area: 'Money' },
  { id: 'settings', persona: 'tenant', path: '/logic-settings.html?org=cleancell.us', file: 'logic-settings.html', area: 'Setup' },
  { id: 'team', persona: 'tenant', path: '/logic-team.html?org=cleancell.us', file: 'logic-team.html', area: 'Setup' },
  { id: 'customer-portal', persona: 'tenant', path: '/portals/customer/?org=cleancell.us', file: 'portals/customer/index.html', area: 'Customers' },
  { id: 'customer-app', persona: 'tenant', path: '/portals/customer/app?org=cleancell.us', file: 'portals/customer/app.html', area: 'Customers', phone: true },
  { id: 'customer-start', persona: 'tenant', path: '/customer-start.html?org=cleancell.us', file: 'customer-start.html', area: 'Customers' },
  { id: 'directory', persona: 'staff', path: '/omega-logic', file: 'omega-logic.html', area: 'Setup' },
  { id: 'clearsky', persona: 'staff', path: '/omega-logic?org=cleancell.us#clearsky', file: 'omega-logic.html', area: 'Setup' },
  { id: 'admin', persona: 'staff', path: '/logic-admin.html', file: 'logic-admin.html', area: 'Setup' },
  { id: 'admin-one', persona: 'staff', path: '/logic-admin.html?org=cleancell.us', file: 'logic-admin.html', area: 'Setup' },
  { id: 'kit', persona: 'staff', path: '/logic-kit.html?org=cleancell.us', file: 'logic-kit.html', area: 'Setup' },
  { id: 'urls', persona: 'staff', path: '/logic-urls.html?org=cleancell.us', file: 'logic-urls.html', area: 'Setup' },
  { id: 'whitelabel', persona: 'staff', path: '/whitelabel-setup.html?org=cleancell.us', file: 'whitelabel-setup.html', area: 'Setup' },
  { id: 'sandbox-office', persona: 'tenant', path: '/app-sandbox/office', file: 'app-sandbox/office.html', area: 'Sales', phone: true }
];

/* Firestore paths Omega Logic reads or writes. Root names are matched in
   firestore.rules; sub paths are omega_orgs children. The test only checks
   that the name is present, not that the rule is correct. */
var COLLECTIONS = [
  'orders', 'plant_works_orders', 'plant_units', 'plant_scans', 'plant_stations',
  'embed_keys', 'tenant_public',
  'billing', 'members', 'fulfillment', 'storefront', 'customers', 'customer_index', 'sites', 'purchase_orders',
  'freight_quotes', 'custody_imports', 'custody_mappings', 'kit_sends', 'crm_followups',
  'crm_upload_usage', 'reps', 'admin_audit', 'custody_events'
];
/* omega_audit is written by the Admin SDK and is not named in firestore.rules.
   It is closed only by the default deny. A tightening change should name it
   with allow read, write: if false. stripe_customers and stripe_events are
   the same shape. The walk does not treat an unnamed collection as present. */

var EMAIL = { tenant: 'demo@cleancell.us', member: 'member@cleancell.us', staff: 'tom@clearsky-usa.com' };

function outDir() {
  var i = process.argv.indexOf('--out');
  return i >= 0 ? path.resolve(process.argv[i + 1] || os.tmpdir()) : null;
}

function fileOf(page) {
  var rel = page.file;
  var f = path.join(ROOT, rel);
  if (fs.existsSync(f)) return f;
  if (fs.existsSync(f + '.html')) return f + '.html';
  return null;
}

/* Staff-only answers. Sample names only — the Clean Cell fixture, never a
   live tenant. */
function adminList() {
  return { owner: true, subscribers: [{ orgId: 'cleancell.us', name: 'Clean Cell', status: 'active', tier: 'standard', domains: ['cleancell.us'], subscribed: true, whiteLabel: true, platformName: 'Clean Cell', toolAccess: null, trialEndsAt: null, subscriptionDue: null }], total: 1,
    tiers: ['trial', 'standard', 'deluxe', 'enterprise', 'partner', 'internal'], verticals: ['oem', 'developer', 'epc', 'installer'], roles: ['owner', 'admin', 'member', 'viewer'] };
}
function adminOne() {
  var fields = { storefront: { text: ['headline', 'intro', 'disclaimer', 'thanks', 'cta', 'designerPitch', 'fulfilledBy'], num: ['dailyOrderCap'], cost: ['capexPerKwh', 'capexPerKw'], bool: ['requireAddress'] } };
  return { owner: true, orgId: 'cleancell.us', org: { name: 'Clean Cell', status: 'active', slug: 'cleancell', vertical: 'oem', domains: ['cleancell.us'], whiteLabel: { enabled: true, platformName: 'Clean Cell', attribution: 'powered-by' }, omegaLogic: true, colors: {}, exportBrand: {} },
    billing: { tier: 'standard', status: 'active', addons: ['omega-logic', 'whitelabel'], toolOverrides: {}, editorLite: { enabled: false } },
    config: { enabled: true, terms: { depositPct: 30, dueDays: 0 }, fee: { percent: 0.25 } },
    storefront: { products: [], headline: 'Size a system' }, summary: { subscribed: true },
    counts: { orders: 4, customers: 2, reps: 0, workOrders: 1, units: 3, stations: 1 },
    members: [{ email: 'demo@cleancell.us', name: 'Dana', role: 'admin', status: 'active' }],
    hosts: [{ host: 'cleancell.us', mirrored: true }], embedKeys: [], audit: [], roles: ['owner', 'admin', 'member', 'viewer'],
    tiers: adminList().tiers, verticals: adminList().verticals, fields: fields, exportSets: [{ name: 'orders', label: 'Orders' }],
    links: { office: '/omega-logic?org=cleancell.us', settings: '/logic-settings.html?org=cleancell.us', catalog: '/logic-catalog.html?org=cleancell.us', customers: '/portals/customer/admin.html?org=cleancell.us', setup: '/whitelabel-setup.html?org=cleancell.us', portal: '/portals/customer/?org=cleancell.us' } };
}
function urlRows() {
  var org = 'cleancell.us';
  return { brand: { name: 'Clean Cell', workspace: 'Clean Cell' }, org: org, rows: [
    { name: 'Customer walkthrough', url: '/customer-start.html?org=' + org, description: 'Recommended website button: sizing, accounts and design.' },
    { name: 'Customer login', url: '/portals/customer/?org=' + org, description: 'Existing customer login.' },
    { name: 'Company PO inbox', url: '/po-inbox?org=' + org, description: 'Verified company users upload POs.' },
    { name: 'Editor Lite / Design studio', url: '/editor-lite.html', description: 'Sign-in and subscription check before opening saved designs.' },
    { name: 'Battery sizer', url: '', embed: false, description: 'Public sizing tool. Its publishable key must allow the website origin.' }
  ] };
}

function startServer(F, STATE, V) {
  var ROLE = 'tenant';
  var TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml', '.pdf': 'application/pdf', '.json': 'application/json' };
  function stamp(o) {
    if (!o || typeof o !== 'object' || Array.isArray(o) || o.error) return o;
    if (ROLE === 'staff') {
      o.owner = true;
      if (o.access && typeof o.access === 'object') { o.access.team = true; o.access.prices = 'all'; o.access.role = 'clearsky'; }
    }
    return o;
  }
  var srv = http.createServer(function (req, res) {
    var u = req.url.split('?')[0], q = req.url.split('?')[1] || '';
    function json(o) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(stamp(o))); }
    function send(o) {
      if (o && o.download) { res.writeHead(200, { 'Content-Type': 'application/octet-stream' }); return res.end(o.download.body || ''); }
      if (o && o.error && o.status) { res.writeHead(o.status, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: o.error })); }
      json(o);
    }
    if (u === '/api/logic-office' && !/(^|&)org=/.test(q)) {
      if (ROLE !== 'staff') return send({ error: 'Omega Logic control is restricted to the verified ClearSky owner account', status: 403 });
      return json({ owner: true, tenants: [{ orgId: 'cleancell.us', name: 'Clean Cell', status: 'active', links: { office: '/omega-logic?org=cleancell.us' } }] });
    }
    if (u === '/api/logic-admin') {
      if (ROLE !== 'staff') return send({ error: 'Omega Logic control is restricted to the verified ClearSky owner account', status: 403 });
      return json(/org=/.test(q) ? adminOne() : adminList());
    }
    if (u === '/api/logic-urls') return json(urlRows());
    if (u === '/api/logic-kit') {
      if (ROLE !== 'staff') return send({ error: 'Omega Logic control is restricted to the verified ClearSky owner account', status: 403 });
      var Kit = require(path.join(ROOT, 'api/_lib/kit'));
      if (!/org=/.test(q)) return json({ owner: true, subscribers: [{ id: 'cleancell.us', name: 'Clean Cell', status: 'active', domains: [] }], guides: Kit.GUIDES, items: Kit.ITEMS });
      var kit = Kit.forOrg('cleancell.us', { name: 'Clean Cell' });
      return json({ owner: true, org: 'cleancell.us', name: 'Clean Cell', status: 'active', brand: F.brand, kit: kit, messages: { plant: Kit.message(kit, 'plant'), office: Kit.message(kit, 'office'), customer: Kit.message(kit, 'customer') }, sends: [] });
    }
    if (u.indexOf('/api/logic-plant') === 0) return json(V.plantJson(q, ROLE === 'member' ? 'member@cleancell.us' : 'demo@cleancell.us'));
    if (u.indexOf('/api/logic-materials') === 0) return json(/workOrder=/.test(q) ? V.soloJson() : V.materialsJson());
    if (u.indexOf('/api/logic-catalog') === 0) return json(V.catalogJson());
    if (u.indexOf('/api/logic-accounting') === 0) return json(/(^|&)format=csv(&|$)/.test(q) ? V.accountingCsv(q) : V.accountingJson(q));
    if (u.indexOf('/api/logic-office') === 0) return json(V.officeJson(ROLE === 'member' ? { role: 'member' } : { role: 'admin' }));
    if (u.indexOf('/api/buyers') === 0) return send(V.buyersJson(q));
    if (u.indexOf('/api/po-intake') === 0) return send(V.intakeJson(q, 'ops@riverside.example'));
    if (u.indexOf('/api/customer-portal') === 0) return json(V.portalJson);
    if (u.indexOf('/api/my-account') === 0) return json(V.accountJson());
    if (u.indexOf('/api/my-orders') === 0) return json(V.myOrdersJson());
    if (u.indexOf('/api/my-sites') === 0) return json(V.mySitesJson());
    if (u === '/api/crm') return send(V.crmJson(q));
    if (u === '/api/my-files') return send(V.myFilesJson(q));
    if (u === '/api/customer-subscribe') return send(V.subJson('ops@riverside.example'));
    if (u === '/api/customer-portfolio') return send(V.portfolioJson());
    if (u.indexOf('/api/logic-custody') === 0) return json(V.custodyJson(q));
    if (u.indexOf('/api/logic-logistics') === 0) return /(^|&)freight=/.test(q) ? send(V.freightJson(q)) : json(V.logisticsJson());
    if (u.indexOf('/api/logic-team') === 0) return send(V.teamJson(ROLE === 'member' ? 'member@cleancell.us' : 'demo@cleancell.us'));
    if (u.indexOf('/api/customer-design') === 0) return json(V.designJson());
    if (u.indexOf('/api/app-manifest') === 0) return json(V.manifest((/app=(\w+)/.exec(q) || [])[1] || 'office', require(path.join(ROOT, 'tenants/cleancell/tenant.json'))));
    if (u === '/api/logic-workspaces') return json(V.workspacesJson(EMAIL[ROLE] || EMAIL.tenant));
    if (u === '/api/auth-check') return json({ google: true });
    if (u === '/api/mes-scan' && req.method === 'POST') {
      var body = ''; req.on('data', function (c) { body += c; }); req.on('end', function () { var b = {}; try { b = JSON.parse(body); } catch (e) {} send(V.benchJson(b)); }); return;
    }
    if (u === '/config.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); return res.end('window.CLEARSKY_CONFIG={firebase:{},adminDomains:["clearsky-usa.com"]};'); }
    if (u === '/omega-brand.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); return res.end('window.OmegaBrand=window.OmegaBrand||{adminDomains:function(){return ["clearsky-usa.com"];},resolve:function(){return Promise.resolve(null);}};'); }
    if (u === '/omega-tenant.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); return res.end('/* sample walk: no live tenant lock */'); }
    var f = path.join(ROOT, u === '/' ? 'index.html' : decodeURIComponent(u));
    if (!fs.existsSync(f) && fs.existsSync(f + '.html')) f = f + '.html';
    if (fs.existsSync(f) && fs.statSync(f).isDirectory() && fs.existsSync(path.join(f, 'index.html'))) f = path.join(f, 'index.html');
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
    res.end(fs.readFileSync(f));
  });
  srv.setRole = function (r) { ROLE = r; };
  return srv;
}

var FLAG = /coming soon|not yet|beta|unavailable|being configured|not built|on the desktop|open on the desktop|sample ledger|nothing here books|contact clearsky|ask clearsky|sign in/i;

async function walk() {
  var shots = outDir();
  if (shots) fs.mkdirSync(shots, { recursive: true });
  var PW = process.env.PLAYWRIGHT || (function () { try { return require.resolve('playwright-core'); } catch (e) { try { return require.resolve('playwright'); } catch (e2) { return ''; } } })();
  var chromium; try { chromium = require(PW).chromium; } catch (e) { console.log('audit-logic-walk: Playwright not found; skipped'); return 0; }
  var CHROME = process.env.CHROME || (fs.existsSync('/opt/google/chrome/chrome') ? '/opt/google/chrome/chrome' : (fs.existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : ''));
  if (!CHROME || !fs.existsSync(CHROME)) { try { CHROME = chromium.executablePath(); } catch (e) { CHROME = ''; } }
  if (!CHROME || !fs.existsSync(CHROME)) { console.log('audit-logic-walk: Chromium not found; skipped'); return 0; }
  var F = require('./_lib/logic-fixtures');
  var STATE = F.initialState(), V = F.views(STATE);
  var srv = startServer(F, STATE, V);
  await new Promise(function (r) { srv.listen(0, '127.0.0.1', r); });
  var base = 'http://127.0.0.1:' + srv.address().port;
  var browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  var fails = 0;
  var report = [];
  async function one(pageSpec) {
    srv.setRole(pageSpec.persona);
    var ctx = await browser.newContext({ viewport: pageSpec.phone ? { width: 390, height: 844 } : { width: 1440, height: 900 }, serviceWorkers: 'block' });
    await ctx.route('https://www.gstatic.com/**', function (r) { r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }); });
    await ctx.addInitScript(function (email) {
      var user = { uid: 'audit', email: email, emailVerified: true, getIdToken: function () { return Promise.resolve('audit'); } };
      window.firebase = { apps: [1], initializeApp: function () {}, auth: function () { return { currentUser: user, onAuthStateChanged: function (fn) { setTimeout(function () { fn(user); }, 0); }, signOut: function () { return Promise.resolve(); }, GoogleAuthProvider: function () {} }; }, firestore: function () {
        function empty() { var q = { get: function () { return Promise.resolve({ empty: true, exists: false, docs: [], forEach: function () {}, data: function () { return {}; } }); }, where: function () { return q; }, limit: function () { return q; }, orderBy: function () { return q; }, doc: function () { return q; }, collection: function () { return q; } }; return q; }
        return { collection: function () { return empty(); } };
      } };
      window.firebase.firestore.FieldValue = { serverTimestamp: function () { return null; } };
      window.OmegaBrand = { adminDomains: function () { return ['clearsky-usa.com']; }, resolve: function () { return Promise.resolve(null); } };
    }, EMAIL[pageSpec.persona] || EMAIL.tenant);
    var p = await ctx.newPage();
    var errors = [];
    p.on('pageerror', function (e) { errors.push(String(e.message || e).slice(0, 240)); });
    p.on('console', function (m) { if (m.type() === 'error' && !/Failed to load resource|favicon/.test(m.text())) errors.push(m.text().slice(0, 240)); });
    if (pageSpec.pair) {
      await p.addInitScript(function () { try { localStorage.setItem('omega_station_v1', JSON.stringify({ stationId: 'rack-01', token: 'sample-token', label: 'Bay 2 · Rack assembly' })); } catch (e) {} });
    }
    var status = 0;
    try {
      var res = await p.goto(base + pageSpec.path, { waitUntil: 'domcontentloaded', timeout: 20000 });
      status = res ? res.status() : 0;
      await p.waitForTimeout(1200);
      if (pageSpec.click) { var el = await p.$(pageSpec.click); if (el) { await el.click(); await p.waitForTimeout(600); } }
    } catch (e) { errors.push(String(e.message || e).slice(0, 240)); }
    var snap = { title: '', h1: [], nav: [], status: '', disabled: [], flags: [] };
    try {
      snap = await p.evaluate(function (reSrc) {
        var re = new RegExp(reSrc, 'i');
        function text(el) { return (el.innerText || '').replace(/\s+/g, ' ').trim(); }
        var body = text(document.body).slice(0, 6000);
        var flags = [];
        body.split(/\n/).forEach(function (line) { var t = line.trim(); if (t && re.test(t) && flags.length < 8 && flags.indexOf(t) < 0) flags.push(t.slice(0, 180)); });
        var disabled = [];
        Array.prototype.forEach.call(document.querySelectorAll('button[disabled],input[disabled],select[disabled]'), function (b) { var l = text(b) || b.getAttribute('aria-label') || b.id || ''; if (l && disabled.length < 12) disabled.push(l.slice(0, 80)); });
        return {
          title: document.title,
          h1: Array.prototype.map.call(document.querySelectorAll('h1'), text).filter(Boolean).slice(0, 4),
          h2: Array.prototype.map.call(document.querySelectorAll('h2'), text).filter(Boolean).slice(0, 12),
          nav: Array.prototype.map.call(document.querySelectorAll('.logic-nav a, .logic-nav button'), text).filter(Boolean).slice(0, 40),
          status: text(document.querySelector('.logic-status, #status, #message') || { innerText: '' }).slice(0, 240),
          disabled: disabled,
          flags: flags
        };
      }, FLAG.source);
    } catch (e) { errors.push('snapshot: ' + String(e.message || e).slice(0, 160)); }
    if (shots) {
      try { await p.screenshot({ path: path.join(shots, pageSpec.id + '.jpg'), type: 'jpeg', quality: 55 }); } catch (e) { errors.push('shot: ' + e.message); }
    }
    await ctx.close();
    var row = { id: pageSpec.id, area: pageSpec.area, persona: pageSpec.persona, path: pageSpec.path, http: status, errors: errors, title: snap.title, h1: snap.h1, h2: snap.h2 || [], nav: snap.nav, status: snap.status, disabled: snap.disabled, flags: snap.flags };
    if (status >= 400 || errors.length) fails++;
    report.push(row);
    console.log(JSON.stringify({ id: row.id, persona: row.persona, http: row.http, h1: row.h1, status: row.status, errors: row.errors.length, flags: row.flags.slice(0, 3) }));
  }
  for (var i = 0; i < PAGES.length; i++) await one(PAGES[i]);
  await browser.close();
  srv.close();
  if (shots) fs.writeFileSync(path.join(shots, 'report.json'), JSON.stringify(report, null, 2));
  console.log('audit-logic-walk: ' + report.length + ' pages, ' + fails + ' with an error or a failed load');
  return fails ? 1 : 0;
}

if (require.main === module) {
  walk().then(function (code) { process.exit(code); }, function (e) { console.error(e); process.exit(1); });
} else {
  module.exports = { PAGES: PAGES, COLLECTIONS: COLLECTIONS, fileOf: fileOf };
}
