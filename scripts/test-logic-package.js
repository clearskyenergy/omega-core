#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   scripts/test-logic-package.js — Omega Logic follows the package (Phase 8)
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   A PACKAGED workspace (billing/current.packaged, Phases 1–7) is judged by
   its package alone: Office (logic-office) in modules[] and the grant live
   — paid, or a trial inside its dates, and before accessUntil
   (package-access.live, the one rule the editor projection follows too).
   The PARTS are the modules bought: Plant (logic-plant), Materials &
   Purchasing (logic-materials), Logistics & Warranty (logic-logistics),
   Customer App (logic-customer). logic-access.authorize(caller, org,
   write, part) refuses a part not held with a plain sentence; a legacy
   subscription (addons: omega-logic) is unchanged and holds every part;
   the ClearSky owner sees all.

   What the pages get: the office endpoint's access.parts, the front door's
   parts per workspace; the chrome (omega-logic-theme.js), the desktop
   dashboard and the Omega Logic app draw only the groups, hub cells, tabs,
   rows and shortcuts of the parts held — and never call an endpoint of a
   part not held. Showing a link is never access.

     node scripts/test-logic-package.js
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm');
var FD = require('./_lib/firestore-double'), DB = FD.DB, mock = FD.mock, db;
var ROOT = path.join(__dirname, '..');
function read(f) { return fs.readFileSync(path.join(ROOT, f), 'utf8'); }
var A = { db: function () { return db; }, safeOrg: function (v) { return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(v || '') ? v : ''; },
  httpError: function (s, m) { var e = new Error(m); e.status = s; return e; }, authenticate: async function (r) { return r.caller; }, handler: function (f) { return f; },
  FieldValue: function () { return { serverTimestamp: function () { return new Date().toISOString(); }, increment: function (n) { return n; }, arrayUnion: function () { return Array.prototype.slice.call(arguments); } }; },
  /* the same rule as api/_lib/admin.js canActInOrg */
  canActInOrg: async function (c, org) { if (c.staff) return true; if (c.orgId === org) return true; var s = await db.collection('org_members').doc(String(c.email).toLowerCase()).get(); return s.exists && s.data().active !== false && s.data().orgId === org; },
  isTenantAdmin: async function (c, org) { var m = await db.doc('omega_orgs/' + org + '/members/' + c.uid).get(); return m.exists && ['owner', 'admin'].indexOf(m.data().role) >= 0; } };
mock('../api/_lib/admin', A);
var X = require('../api/_lib/logic-access'), B = require('../api/_lib/buyer-accounts'), PA = require('../api/_lib/package-access');
var workspaces = require('../api/logic-workspaces'), office = require('../api/logic-office');

var DAY = 86400000, NOW = Date.now(), count = 0;
async function test(n, f) { await f(); count++; console.log('PASS ' + n); }
function iso(ms) { return new Date(ms).toISOString(); }
function who(email, extra) { return Object.assign({ uid: email.split('@')[0], email: email, orgId: email.split('@')[1], staff: false, claims: { email_verified: true } }, extra || {}); }
async function refused(p, status, re, reason) {
  try { await p; } catch (e) { assert.equal(e.status, status, e.message); if (re) assert.match(e.message, re); if (reason) assert.equal(e.reason, reason); return e; }
  assert.fail('expected a ' + status);
}
/* a packaged workspace: paid, next invoice on the 20th, access to the 25th */
function packaged(org, modules, billing, config) {
  db.seed('omega_orgs/' + org, { name: org.split('.')[0].toUpperCase(), status: 'active', omegaLogic: true, vertical: 'oem' });
  db.seed('omega_orgs/' + org + '/billing/current', Object.assign({ packaged: true, modules: modules, packagingState: 'paid', paidThrough: iso(NOW + 24 * DAY).slice(0, 10), accessUntil: iso(NOW + 29 * DAY), billingDay: 20 }, billing || {}));
  db.seed('omega_orgs/' + org + '/fulfillment/config', Object.assign({ enabled: true, accounting: 'tenant', terms: { depositPct: 30, dueDays: 0 }, fee: { percent: 0, fixed: 0 } }, config || {}));
  db.seed('omega_orgs/' + org + '/members/ops', { email: 'ops@' + org, role: 'admin', status: 'active' });
  db.seed('omega_orgs/' + org + '/members/pat', { email: 'pat@' + org, role: 'member', status: 'active' });
}
function legacy(org, billing) {
  db.seed('omega_orgs/' + org, { name: 'Old Co', status: 'active', omegaLogic: true });
  db.seed('omega_orgs/' + org + '/billing/current', Object.assign({ addons: ['omega-logic'], status: 'active' }, billing || {}));
  db.seed('omega_orgs/' + org + '/fulfillment/config', { enabled: true, accounting: 'tenant' });
  db.seed('omega_orgs/' + org + '/members/ops', { email: 'ops@' + org, role: 'admin', status: 'active' });
}
var FULL = ['lite', 'logic-office', 'logic-plant', 'logic-materials', 'logic-logistics', 'logic-customer'];
function seed() {
  db = new DB();
  packaged('acme.example', ['lite', 'logic-office', 'logic-plant', 'logic-materials']);
  packaged('full.example', FULL);
  packaged('nooffice.example', ['lite', 'gridatlas', 'logic-plant'].slice(0, 2), { addons: ['omega-logic'], omegaLogic: true });
  legacy('oldco.example');
}

(async function () {
  console.log('\nthe gate: Office and the four parts follow modules[] (api/_lib/logic-access.js)');
  await test('a packaged workspace with Office holds exactly the parts it bought; a part not bought is refused in a sentence', async function () {
    seed(); var c = who('ops@acme.example');
    var ctx = await X.authorize(c, 'acme.example', false);
    assert.equal(X.subscribed(ctx), true); assert.deepEqual(X.parts(ctx), ['plant', 'materials']);
    assert.equal(ctx.member.role, 'admin');
    await X.authorize(c, 'acme.example', true, 'plant'); await X.authorize(c, 'acme.example', false, 'materials');
    var e = await refused(X.authorize(c, 'acme.example', false, 'logistics'), 403, /^Logistics & Warranty is not in your Omega Logic package$/, 'part');
    assert.equal(e.reason, 'part');
    await refused(X.authorize(c, 'acme.example', true, 'customer'), 403, /^Customer App is not in your Omega Logic package$/, 'part');
    await refused(X.authorize(who('pat@acme.example'), 'acme.example', false, 'logistics'), 403, /Logistics & Warranty/, 'part');
    await refused(X.authorize(who('pat@acme.example'), 'acme.example', true, 'plant'), 403, /administrator is required/, undefined);
    assert.throws(function () { X.requirePart(ctx, 'bench'); }, /Unknown Omega Logic part/, 'a part the code does not name is a bug, not a refusal');
    X.requirePart(ctx, null); X.requirePart(ctx, '');
  });
  await test('every part bought: every part held; the ClearSky owner sees any workspace whatever its package, and parts() still tells the truth', async function () {
    seed(); var c = who('ops@full.example');
    assert.deepEqual(X.parts(await X.authorize(c, 'full.example', false)), ['plant', 'materials', 'logistics', 'customer']);
    for (var p in X.LOGIC_PARTS) await X.authorize(c, 'full.example', true, p);
    var tom = who('tom@clearsky-usa.com');
    var ctx = await X.authorize(tom, 'acme.example', true, 'logistics');
    assert.equal(ctx.member, null); assert.deepEqual(X.parts(ctx), ['plant', 'materials'], 'the owner is let in; the workspace still holds what it bought');
    await refused(X.authorize(who('rep@clearsky-usa.com', { staff: true }), 'acme.example', false), 403, /Not your OEM workspace/); /* a staff flag alone is nobody's membership */
  });
  await test('a packaged workspace without Office has no Omega Logic, whatever legacy flags sit beside the package', async function () {
    seed(); var c = who('ops@nooffice.example');
    var ctx = await X.context('nooffice.example');
    assert.equal(ctx.billing.addons[0], 'omega-logic', 'the fixture carries the old addon on purpose');
    assert.equal(X.subscribed(ctx), false); assert.deepEqual(X.parts(ctx), []);
    await refused(X.authorize(c, 'nooffice.example', false), 403, /Omega Logic subscription is not active/, 'inactive');
    await refused(X.authorize(c, 'nooffice.example', false, 'plant'), 403, /subscription is not active/, 'inactive');
    /* an invalid package is closed too, never open by accident */
    db.seed('omega_orgs/nooffice.example/billing/current', { packaged: true, modules: ['logic-office'], packagingState: 'paid', accessUntil: iso(NOW + 9 * DAY) });
    assert.equal(X.subscribed(await X.context('nooffice.example')), false, 'a package without Lite does not normalize: closed');
    db.seed('omega_orgs/nooffice.example/billing/current', { packaged: true, modules: 'lite,logic-office', packagingState: 'paid', accessUntil: iso(NOW + 9 * DAY) });
    assert.equal(X.subscribed(await X.context('nooffice.example')), false, 'a string where a list belongs: closed');
  });
  await test('the grant must be live: paid before accessUntil, or a trial of at most 14 days inside its dates; Lite-only fallback never carries Office', async function () {
    seed();
    function grant(b) { db.seed('omega_orgs/acme.example/billing/current', Object.assign({ packaged: true, modules: ['lite', 'logic-office', 'logic-plant'] }, b)); return X.context('acme.example'); }
    var live = await grant({ packagingState: 'trial', trialStartedAt: iso(NOW - 3 * DAY), trialEndsAt: iso(NOW + 11 * DAY), accessUntil: iso(NOW + 11 * DAY) });
    assert.equal(X.subscribed(live), true); assert.deepEqual(X.parts(live), ['plant']);
    assert.equal(PA.live(live.billing, ['lite', 'logic-office', 'logic-plant'], NOW), true, 'the same answer the editor projection gives');
    assert.equal(X.subscribed(await grant({ packagingState: 'trial', trialStartedAt: iso(NOW - 20 * DAY), trialEndsAt: iso(NOW - 6 * DAY), accessUntil: iso(NOW + 30 * DAY) })), false, 'a trial that ended');
    assert.equal(X.subscribed(await grant({ packagingState: 'trial', trialStartedAt: iso(NOW - 3 * DAY), trialEndsAt: iso(NOW + 20 * DAY), accessUntil: iso(NOW + 20 * DAY) })), false, 'a trial written longer than 14 days is not honoured');
    assert.equal(X.subscribed(await grant({ packagingState: 'trial', trialStartedAt: iso(NOW + 1 * DAY), trialEndsAt: iso(NOW + 10 * DAY), accessUntil: iso(NOW + 10 * DAY) })), false, 'a trial that has not started');
    assert.equal(X.subscribed(await grant({ packagingState: 'paid', accessUntil: iso(NOW - 1) })), false, 'paid once, access lapsed');
    assert.equal(X.subscribed(await grant({ packagingState: 'paid' })), false, 'no accessUntil recorded: closed');
    assert.equal(X.subscribed(await grant({ packagingState: 'past_due_lite', paidThrough: '2026-08-20', accessUntil: iso(NOW + 5 * DAY) })), false, 'the renewal fallback is Lite alone; Office is not Lite');
    var e = await refused(X.authorize(who('ops@acme.example'), 'acme.example', false), 403, /subscription is not active/, 'inactive');
    assert.equal(e.reason, 'inactive', 'the front door says "not active", not "not on a workspace"');
    db.seed('omega_orgs/acme.example', { name: 'ACME', status: 'suspended', omegaLogic: true });
    assert.equal(X.subscribed(await grant({ packagingState: 'paid', accessUntil: iso(NOW + 9 * DAY) })), false, 'a suspended organization is closed whatever it bought');
  });
  await test('a legacy subscription is unchanged: every part held; past due, suspended or cancelled still closes it', async function () {
    seed(); var c = who('ops@oldco.example');
    var ctx = await X.authorize(c, 'oldco.example', true, 'customer');
    assert.equal(ctx.billing.packaged, undefined); assert.deepEqual(X.parts(ctx), ['plant', 'materials', 'logistics', 'customer']);
    for (var p in X.LOGIC_PARTS) await X.authorize(c, 'oldco.example', true, p);
    db.seed('omega_orgs/oldco.example/billing/current', { addons: ['omega-logic'], status: 'past_due' });
    await refused(X.authorize(c, 'oldco.example', false), 403, /subscription is not active/, 'inactive');
    db.seed('omega_orgs/oldco.example/billing/current', { omegaLogic: true, status: 'active' });
    assert.deepEqual(X.parts(await X.context('oldco.example')), ['plant', 'materials', 'logistics', 'customer'], 'the older omegaLogic flag holds everything too');
    db.seed('omega_orgs/oldco.example/billing/current', { addons: [], status: 'active' });
    assert.deepEqual(X.parts(await X.context('oldco.example')), [], 'no subscription: no parts');
  });

  console.log('\nthe endpoints: the part each one serves');
  await test('plant, materials, logistics and custody name their part; the office, team, catalog, accounting, CRM and PO doors are Office\'s', async function () {
    var byPart = { plant: ['api/logic-plant.js', 'api/mes-test-result.js'], materials: ['api/logic-materials.js'], logistics: ['api/logic-logistics.js', 'api/logic-custody.js'] };
    Object.keys(byPart).forEach(function (part) { byPart[part].forEach(function (f) { assert.match(read(f), new RegExp("authorize\\((?:[^)]*?), *'" + part + "'\\)"), f + ' names ' + part); }); });
    ['api/logic-office.js', 'api/logic-team.js', 'api/logic-catalog.js', 'api/logic-accounting.js', 'api/crm.js', 'api/buyers.js', 'api/po-intake.js', 'api/logic-workspaces.js'].forEach(function (f) {
      assert.ok(!/authorize\([^)]*'(plant|materials|logistics|customer)'\)/.test(read(f)), f + ' is the Office\'s: no part');
    });
    assert.match(read('api/_lib/buyer-accounts.js'), /X\.parts\(ctx\)\.indexOf\('customer'\) < 0\) throw A\.httpError\(403, 'This customer portal is not active'\)/, 'the customer portal and app are the Customer App part');
  });
  await test('the customer portal and app are the Customer App part: closed to a package without it, said as "not active"', async function () {
    seed();
    await refused(B.context('acme.example'), 403, /^This customer portal is not active$/);
    assert.equal((await B.context('full.example')).orgId, 'full.example');
    assert.equal((await B.context('oldco.example')).orgId, 'oldco.example', 'a legacy subscription keeps its portal');
    await refused(B.context('nooffice.example'), 403, /^This customer portal is not active$/);
  });
  await test('the office endpoint tells the page which parts the workspace holds (access.parts), every part for a legacy subscription', async function () {
    seed();
    function get(email, org) { return office({ method: 'GET', query: { org: org }, caller: who(email) }, { setHeader: function () {} }); }
    var d = await get('ops@acme.example', 'acme.example');
    assert.deepEqual(d.access, { role: 'admin', prices: 'workspace', team: true, parts: ['plant', 'materials'] });
    assert.deepEqual((await get('pat@acme.example', 'acme.example')).access, { role: 'member', prices: 'none', team: false, parts: ['plant', 'materials'] }, 'a member is told the same parts: it is the workspace\'s package, not theirs');
    assert.deepEqual((await get('ops@oldco.example', 'oldco.example')).access.parts, ['plant', 'materials', 'logistics', 'customer']);
    assert.deepEqual((await get('tom@clearsky-usa.com', 'acme.example')).access, { role: 'clearsky', prices: 'all', team: true, parts: ['plant', 'materials'] });
    await refused(get('ops@nooffice.example', 'nooffice.example'), 403, /subscription is not active/, 'inactive');
  });
  await test('the front door lists each workspace with its parts, and a package without Office reads "not active"', async function () {
    seed();
    function get(email) { return workspaces({ method: 'GET', query: {}, caller: who(email) }, { setHeader: function () {} }); }
    var d = await get('ops@acme.example');
    assert.deepEqual(d.workspaces.map(function (w) { return [w.orgId, w.role, w.parts]; }), [['acme.example', 'admin', ['plant', 'materials']]]);
    assert.deepEqual((await get('ops@oldco.example')).workspaces[0].parts, ['plant', 'materials', 'logistics', 'customer']);
    var closed = await get('ops@nooffice.example');
    assert.equal(closed.workspaces.length, 0); assert.equal(closed.reason, 'inactive'); assert.match(closed.note, /subscription is not active/);
    var tom = await get('tom@clearsky-usa.com');
    assert.equal(tom.owner, true); assert.ok(tom.workspaces.every(function (w) { return w.parts === undefined; }), 'the owner\'s directory is names only; the chrome shows ClearSky everything');
  });

  /* ── the chrome: omega-logic-theme.js in a small page ─────────────── */
  console.log('\nthe chrome: only the groups, cells, tabs and rows of the parts held');
  var SRC = read('omega-logic-theme.js');
  function page(opts) {
    opts = opts || {};
    var store = {}, els = {}, timers = [];
    var loc = { pathname: opts.path || '/logic-materials.html', search: opts.search || '', hash: '', href: '' };
    var header = { className: '', _html: '', set innerHTML(v) { this._html = v; if (/id="signout"/.test(v)) els.signout = { onclick: null, disabled: false }; }, get innerHTML() { return this._html; }, appendChild: function (c) { els[c.id] = c; } };
    var nav = { _html: '', set innerHTML(v) { this._html = v; }, get innerHTML() { return this._html; } };
    var doc = { readyState: 'complete', body: { classList: { add: function () {} } }, documentElement: { style: { setProperty: function () {}, removeProperty: function () {} }, scrollTop: 0 }, addEventListener: function () {},
      createElement: function (t) { return { tagName: t }; }, querySelector: function (q) { return q === 'header' ? header : q === '.logic-nav' ? nav : q === '.logic-shell' ? {} : q === 'main' ? {} : null; }, querySelectorAll: function () { return []; }, getElementById: function (id) { return els[id] || null; } };
    var win = { location: loc, pageYOffset: 0, setTimeout: function (fn) { timers.push(fn); } };
    var ctx = { window: win, document: doc, location: loc, setTimeout: win.setTimeout, URLSearchParams: URLSearchParams, navigator: { onLine: true },
      sessionStorage: { getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; }, setItem: function (k, v) { store[k] = String(v); }, removeItem: function (k) { delete store[k]; } } };
    vm.runInNewContext(SRC, ctx);
    return { T: win.OmegaLogicTheme, nav: nav, store: store };
  }
  function eyebrows(nav) { var out = [], re = /<p class="eyebrow">([^<]*)<\/p>/g, m; while ((m = re.exec(nav._html))) out.push(m[1].replace(/&amp;/g, '&')); return out; }
  function links(nav) { var out = [], re = /<a href="([^"]*)"[^>]*>([^<]*)<\/a>/g, m; while ((m = re.exec(nav._html))) out.push(m[2].replace(/&amp;/g, '&')); return out; }
  function plain(v) { return JSON.parse(JSON.stringify(v)); }
  await test('groups(): a link names the part whose endpoint serves it; a group with nothing left is not drawn; not said shows all', async function () {
    var T = page().T;
    function names(parts) { return plain(T.groups('acme.example', false, { parts: parts }).map(function (g) { return g[0] + ': ' + g[1].map(function (l) { return l[1]; }).join(', '); })); }
    assert.deepEqual(names(null), ['Run the business: Dashboard, Orders, Company POs, Customers, Office app', 'Build: Work order board, Work orders & registration, Plant board, Stations & tablets, Plant app',
      'Stock & supply: Inventory, Materials plan, Purchase orders, Vendors & prices', 'Deliver: Shipping & receiving, Sites & custody, Fleet register, Quality & holds', 'Money: Cash flow, Accounting', 'Setup: Products & bills, Settings']);
    assert.deepEqual(names(['plant']), ['Run the business: Dashboard, Orders, Company POs, Customers, Office app', 'Build: Work order board, Work orders & registration, Plant board, Stations & tablets, Plant app',
      'Stock & supply: Inventory', 'Deliver: Quality & holds', 'Money: Cash flow, Accounting', 'Setup: Products & bills, Settings'], 'Plant alone: the shelf (finished units) and Quality are the plant\'s; the plan, the POs and shipping are not');
    assert.deepEqual(names(['materials', 'logistics']), ['Run the business: Dashboard, Orders, Company POs, Customers, Office app', 'Stock & supply: Materials plan, Purchase orders, Vendors & prices',
      'Deliver: Shipping & receiving, Sites & custody, Fleet register', 'Money: Cash flow, Accounting', 'Setup: Products & bills, Settings']);
    assert.deepEqual(names([]), ['Run the business: Dashboard, Orders, Company POs, Customers, Office app', 'Money: Cash flow, Accounting', 'Setup: Products & bills, Settings'], 'Office alone runs the business, the money and the setup');
    assert.deepEqual(names(['customer']), names([]), 'the Customer App part adds nothing to the office menu: it is the customer\'s surface');
    assert.equal(T.groups('acme.example', true, { parts: [] }).length, 7, 'ClearSky sees every group, the ClearSky group included, whatever the workspace holds');
    var team = plain(T.groups('acme.example', false, { parts: [], team: true })); assert.match(team[2][1].map(function (l) { return l[1]; }).join(','), /Team/);
    assert.equal(T.holds(null, 'plant'), true); assert.equal(T.holds([], 'plant'), false); assert.equal(T.holds(['plant'], 'plant'), true); assert.equal(T.holds([], undefined), true, 'a link with no part is everyone\'s');
  });
  await test('chrome(): the office endpoint says the parts; other office pages remember them for THAT workspace only; a member and ClearSky differ', async function () {
    var p = page();
    p.T.chrome({ org: 'acme.example', current: 'dashboard', parts: ['plant', 'materials'], who: 'ops@acme.example' });
    assert.deepEqual(plain(eyebrows(p.nav)), ['Run the business', 'Build', 'Stock & supply', 'Deliver', 'Money', 'Setup']);
    assert.ok(links(p.nav).indexOf('Materials plan') >= 0 && links(p.nav).indexOf('Shipping & receiving') < 0 && links(p.nav).indexOf('Quality & holds') >= 0);
    p.T.chrome({ org: 'acme.example', current: 'materials' });
    assert.ok(links(p.nav).indexOf('Shipping & receiving') < 0, 'a page that did not say: remembered for this workspace');
    assert.equal(p.store.omega_logic_parts, 'acme.example|plant,materials');
    p.T.chrome({ org: 'other.example', current: 'materials' });
    assert.ok(links(p.nav).indexOf('Shipping & receiving') >= 0, 'another workspace: nothing remembered, everything shown');
    p.T.chrome({ org: 'acme.example', current: 'dashboard', parts: [] });
    assert.deepEqual(plain(eyebrows(p.nav)), ['Run the business', 'Money', 'Setup'], 'the endpoint said Office alone');
    assert.equal(p.store.omega_logic_parts, 'acme.example|', 'an empty list is remembered as empty, not forgotten');
    p.T.chrome({ org: 'acme.example', current: 'inventory' });
    assert.deepEqual(plain(eyebrows(p.nav)), ['Run the business', 'Money', 'Setup']);
    p.T.chrome({ org: 'acme.example', current: 'dashboard', parts: ['plant', 'bench', 'materials'] });
    assert.equal(p.store.omega_logic_parts, 'acme.example|plant,materials', 'a part the chrome does not know is dropped, never stored');
    var cs = page(); cs.T.chrome({ org: 'acme.example', current: 'dashboard', owner: true, parts: [] });
    assert.deepEqual(plain(eyebrows(cs.nav)), ['Run the business', 'Build', 'Stock & supply', 'Deliver', 'Money', 'Setup', 'ClearSky'], 'ClearSky sees everything on any workspace');
    var legacy = page(); legacy.T.chrome({ org: 'oldco.example', current: 'dashboard', team: true });
    assert.deepEqual(plain(eyebrows(legacy.nav)), ['Run the business', 'Build', 'Stock & supply', 'Deliver', 'Money', 'Setup'], 'a server from before the field, or a legacy subscription: as before');
  });
  await test('hub(): a ring cell whose part is not held is not drawn (Plant · plant, Deliver · logistics, Stock · materials); the counts are otherwise the same', async function () {
    var T = page().T, x = { orders: [], follow: [], pending: 1, plantRows: [{ stage: 'production', late: true, progress: { held: 2 } }], toConfirm: 2, inTransit: 4, short: 3, outstandingCents: 100, today: '2026-09-26' };
    function keys(parts) { return plain(T.hub(Object.assign({}, x, { parts: parts })).items.map(function (it) { return it.key; })); }
    assert.deepEqual(keys(undefined), ['today', 'sales', 'customers', 'plant', 'deliver', 'stock', 'money']);
    assert.deepEqual(keys(['plant']), ['today', 'sales', 'customers', 'plant', 'money']);
    assert.deepEqual(keys(['logistics', 'materials']), ['today', 'sales', 'customers', 'deliver', 'stock', 'money']);
    assert.deepEqual(keys([]), ['today', 'sales', 'customers', 'money']);
    var s = T.hub(Object.assign({}, x, { parts: ['plant'] })), by = {}; s.items.forEach(function (it) { by[it.key] = it; });
    assert.equal(by.plant.badge, '2'); assert.equal(by.plant.hint, '2 on hold'); assert.equal(by.customers.badge, '1'); assert.equal(by.today.badge, '', 'the same counting');
    assert.equal(s.heldUnits, 2);
  });

  /* ── the pages ─────────────────────────────────────────────────────── */
  console.log('\nthe pages: the dashboard and the Omega Logic app follow access.parts');
  var APP = read('office/app.html'), DESK = read('omega-logic.html');
  function lift(src, name) {
    var m = new RegExp('\\n\\s*function ' + name + '\\s*\\(').exec(src); assert.ok(m, 'office/app.html has a function ' + name);
    var start = m.index + 1, i = src.indexOf('{', start), depth = 0, q = null, c;
    for (; i < src.length; i++) { c = src.charAt(i); if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; } if (c === "'" || c === '"') q = c; else if (c === '{') depth++; else if (c === '}' && --depth === 0) return src.slice(start, i + 1); }
    throw new Error('no end to ' + name);
  }
  function menu(data) {
    var ctx = { DATA: data, ORG: 'acme.example', WS: null, encodeURIComponent: encodeURIComponent };
    vm.runInNewContext(lift(APP, 'access') + '\n' + lift(APP, 'mayPrice') + '\n' + lift(APP, 'has') + '\n' + lift(APP, 'menuPanels') + '\nvar OUT = menuPanels();', ctx);
    var out = {}; plain(ctx.OUT).forEach(function (p) { out[p.key] = p.rows.map(function (r) { return r[2]; }); }); return out;
  }
  await test('the app\'s Menu: a panel or a row of a part not held is not drawn; a legacy or older server shows all', async function () {
    var admin = { owner: false, billing: 'tenant', config: { accounting: 'tenant' } };
    var all = menu(Object.assign({ access: { role: 'admin', prices: 'workspace', team: true } }, admin));
    assert.deepEqual(Object.keys(all), ['sales', 'customers', 'plant', 'deliver', 'stock', 'money', 'setup', 'help']);
    assert.deepEqual(all.customers, ['Customers', 'Customer hub on the desktop', 'Customer app', 'Customer portal']);
    var plant = menu(Object.assign({ access: { role: 'admin', prices: 'workspace', team: true, parts: ['plant'] } }, admin));
    assert.deepEqual(Object.keys(plant), ['sales', 'customers', 'plant', 'stock', 'money', 'setup', 'help']);
    assert.deepEqual(plant.stock, ['Stock', 'Inventory'], 'finished units are the plant\'s; the plan and the POs are Materials & Purchasing\'s');
    assert.deepEqual(plant.customers, ['Customers', 'Customer hub on the desktop'], 'no Customer App part: the customer app and portal are not offered');
    assert.deepEqual(plant.help, ['Omega Logic app guide', 'Plant app guide']);
    var mat = menu(Object.assign({ access: { role: 'admin', prices: 'workspace', team: true, parts: ['materials', 'customer'] } }, admin));
    assert.deepEqual(Object.keys(mat), ['sales', 'customers', 'stock', 'money', 'setup', 'help']);
    assert.deepEqual(mat.stock, ['Materials plan', 'Purchase orders']); assert.deepEqual(mat.customers, ['Customers', 'Customer hub on the desktop', 'Customer app', 'Customer portal']);
    var none = menu(Object.assign({ access: { role: 'member', prices: 'none', team: false, parts: [] } }, admin));
    assert.deepEqual(Object.keys(none), ['sales', 'customers', 'money', 'setup', 'help']); assert.deepEqual(none.help, ['Omega Logic app guide']);
  });
  await test('the app: the Sites tab, the shortcuts, the Today blocks and the loaders follow the parts; an endpoint of a part not held is never called', async function () {
    assert.match(APP, /<button data-tab="sites" data-part="logistics">/); assert.match(APP, /function layoutTabs\(\) \{[^}]*b\.hidden = !has\(b\.getAttribute\('data-part'\)\)/);
    assert.match(APP, /\$\('nav'\)\.hidden = false; layoutTabs\(\);/);
    assert.match(APP, /has\('plant'\) \? api\('\/api\/logic-plant' \+ q \+ '&page=board'\)/, 'the plant board is fetched only with the Plant part');
    assert.match(APP, /if \(has\('materials'\)\) loadMaterials\(\)/); assert.match(APP, /if \(has\('logistics'\) && !CUSTODY && !HUB_TRIED\.custody\)/);
    assert.match(APP, /parts: access\(\)\.parts, accounting:/, 'the hub is fed the parts');
    assert.match(APP, /\['go', 'sites', '◎', 'Sites', 'logistics'\], \['go', 'stock', '▦', 'Stock', 'plant'\]/); assert.match(APP, /'Register', 'logistics'\], \[[^\]]*'Plant', 'plant'\]\]\.filter\(function \(x\) \{ return has\(x\[4\]\); \}\)/);
    assert.match(APP, /\(has\('materials'\) \? '<div id="kv-buy">/); assert.match(APP, /\(!has\('plant'\) \? '' : '<h2>Plant<\/h2>'/);
    assert.match(APP, /\(has\('plant'\) \? '<a href="\/plant\/app'/); assert.match(APP, /\(has\('logistics'\) \? '<a href="#" id="to-sites"/); assert.match(APP, /\(has\('customer'\) \? '<a href="\/portals\/customer\/app'/);
  });
  await test('the desktop dashboard: the menu, the hub and the floor, performance and deliveries panels follow the parts; nothing of a part not held is fetched', async function () {
    assert.match(DESK, /OmegaLogicTheme\.chrome\(\{org:ORG,[^}]*parts:d\.access&&d\.access\.parts/);
    assert.match(DESK, /function has\(part\)\{return OmegaLogicTheme\.holds\(DATA&&DATA\.access&&DATA\.access\.parts,part\);\}/);
    assert.match(DESK, /OmegaLogicTheme\.hub\(\{orders:DATA\.orders\|\|\[\],owner:DATA\.owner,parts:DATA\.access&&DATA\.access\.parts/);
    assert.match(DESK, /\(has\('plant'\)\?'<section class="panel" id="floor">/); assert.match(DESK, /\(has\('logistics'\)\?'<section class="panel" id="deliver">/);
    assert.match(DESK, /if\(has\('plant'\)\)\{floorTiles\(d\);perfTiles\(d\);\}if\(has\('logistics'\)\)deliverTiles\(d\);/);
    assert.match(DESK, /if\(!has\('materials'\)\)\{if\(\$\('kv-buy'\)\)\$\('kv-buy'\)\.hidden=true;return;\}/); assert.match(DESK, /if\(has\('logistics'\)\)api\('\/api\/logic-custody'/);
    assert.match(read('logic-settings.html'), /parts:d\.access&&d\.access\.parts/, 'Settings passes the parts on too');
  });
  await test('the theme stays ES5 and the new code names no tenant', async function () {
    var code = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/'(?:[^'\\\n]|\\.)*'/g, "''");
    assert.ok(!/=>|`|\blet\s|\bconst\s|\.includes\(|\.find\(|\.findIndex\(|Object\.assign|\bclass\s/.test(code));
    assert.ok(!/cleancell|fenecon/i.test(SRC.slice(SRC.indexOf('var PARTS'), SRC.indexOf('function groups'))));
  });
  console.log('\n' + count + ' Omega Logic package checks passed. No network calls.\n');
})().catch(function (e) { console.error(e); process.exit(1); });
