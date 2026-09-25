#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   scripts/test-office-chrome.js — the office chrome and the office counts
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   omega-logic-theme.js is loaded the way a browser loads it, in a fresh
   context with a small fake page, for each case:

   · OFF-04  a link that names a section (#orders, #po) or an order
             (?order=) opens AT it after the page's first render, once, and
             never after the person scrolled on their own.
   · OFF-07  Sign out and a page opened signed out both lead to Omega
             Logic's front door, which comes back to the page (?next=) — only
             an office page of this site, for the company just opened.
   · OFF-13  "Quality" goes to the plant board's real Quality view.
   · D2      Team is in the chrome for an owner or administrator (and
             ClearSky), remembered per workspace, never for a member.
   · OFF-14 + D1  ONE hub count for the desktop and the app: a price or an
             acceptance counts only for whoever may take it, waiting on
             somebody else is listed and never counted, and every badge's
             caption says what the number is.
   · OFF-03  "company POs to review" says whose; one PO opens itself.
   · OFF-02  the money tiles are the receivables ledger's own totals (the
             real api/_lib/receivables.js), To issue its own tile.
   · OFF-11 / DOC-m2  plain words, dates, counts and a dropped connection.

     node scripts/test-office-chrome.js
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm');
/* values made inside the page's own context: compared as plain data */
function plain(v) { return JSON.parse(JSON.stringify(v)); }
var SRC = fs.readFileSync(path.join(__dirname, '..', 'omega-logic-theme.js'), 'utf8');
var count = 0;
function test(name, fn) { fn(); count++; console.log('  ok   ' + name); }

/* ── a small page: enough DOM for chrome(), land() and the sign-in link ── */
function page(opts) {
  opts = opts || {};
  var timers = [], store = {}, els = {}, listeners = [], appended = [];
  var loc = { pathname: opts.path || '/logic-materials.html', search: opts.search || '', hash: opts.hash || '', href: '' };
  function el(id) { var e = { id: id, hidden: false, scrolled: 0, top: 500, scrollIntoView: function () { e.scrolled++; win.pageYOffset = e.top; e.top = 0; }, getBoundingClientRect: function () { return { top: e.top }; }, closest: function () { return null; } }; return e; }
  var header = { className: '', _html: '', children: appended,
    set innerHTML(v) { this._html = v; appended.length = 0; if (/id="signout"/.test(v)) els.signout = { onclick: null, disabled: false }; },
    get innerHTML() { return this._html; },
    appendChild: function (c) { appended.push(c); c.parentNode = header; els[c.id] = c; } };
  header.removeChild = function (c) { var i = appended.indexOf(c); if (i >= 0) appended.splice(i, 1); delete els[c.id]; };
  var nav = { _html: '', set innerHTML(v) { this._html = v; }, get innerHTML() { return this._html; } };
  var doc = {
    readyState: 'complete', head: null,
    body: { classList: { add: function () {} } },
    documentElement: { style: { setProperty: function () {}, removeProperty: function () {} }, scrollTop: 0 },
    addEventListener: function () {},
    createElement: function (t) { return { tagName: t }; },
    querySelector: function (q) { return q === 'header' ? header : q === '.logic-nav' ? nav : q === '.logic-shell' ? {} : q === 'main' ? {} : null; },
    querySelectorAll: function () { return []; },
    getElementById: function (id) { return els[id] || null; }
  };
  var win = { location: loc, pageYOffset: 0, setTimeout: function (fn) { timers.push(fn); } };
  var fb = { apps: [1], auth: function () { return { onAuthStateChanged: function (fn) { listeners.push(fn); }, signOut: function () { return { then: function (a) { a(); } }; } }; } };
  var ctx = { window: win, document: doc, location: loc, setTimeout: win.setTimeout, URLSearchParams: URLSearchParams, navigator: { onLine: opts.offline ? false : true },
    sessionStorage: { getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; }, setItem: function (k, v) { store[k] = String(v); }, removeItem: function (k) { delete store[k]; } } };
  if (opts.firebase !== false) { win.firebase = fb; ctx.firebase = fb; }
  vm.runInNewContext(SRC, ctx);
  return { T: win.OmegaLogicTheme, win: win, loc: loc, els: els, el: el, nav: nav, header: header, store: store,
    tick: function (n) { for (var i = 0; i < (n || 1); i++) { var run = timers.splice(0); run.forEach(function (f) { f(); }); } },
    signIn: function (u) { listeners.forEach(function (f) { f(u); }); } };
}
function links(nav) { var out = [], re = /<a href="([^"]*)"[^>]*>([^<]*)<\/a>/g, m; while ((m = re.exec(nav._html))) out.push([m[2].replace(/&amp;/g, '&'), m[1].replace(/&amp;/g, '&')]); return out; }

console.log('the office chrome');
test('OFF-13: Quality goes to the plant board\'s own Quality view, never the registration page', function () {
  var p = page(), g = p.T.groups('cleancell.us', false), all = [];
  g.forEach(function (x) { x[1].forEach(function (l) { all.push(l); }); });
  var q = all.filter(function (l) { return l[0] === 'quality'; })[0];
  assert.equal(q[1], 'Quality & holds'); assert.equal(q[2], '/plant/manager.html?org=cleancell.us#quality');
  assert.ok(!all.some(function (l) { return /serial records/i.test(l[1]); }), 'no "Quality & serial records" link to the registration page');
});
test('D2: Team is under Setup for an owner or administrator, remembered for that workspace only; never for a member', function () {
  var p = page();
  p.T.chrome({ org: 'cleancell.us', current: 'dashboard', team: true, who: 'boss@cleancell.us' });
  var l = links(p.nav).filter(function (x) { return x[0] === 'Team'; });
  assert.deepEqual(plain(l), [['Team', '/logic-team.html?org=cleancell.us']]);
  /* another office page that does not say: remembered for this workspace */
  p.T.chrome({ org: 'cleancell.us', current: 'inventory' });
  assert.ok(links(p.nav).some(function (x) { return x[0] === 'Team'; }));
  /* …and not for another workspace */
  p.T.chrome({ org: 'other.example', current: 'inventory' });
  assert.ok(!links(p.nav).some(function (x) { return x[0] === 'Team'; }));
  /* the office endpoint said no: gone */
  p.T.chrome({ org: 'cleancell.us', current: 'dashboard', team: false });
  assert.ok(!links(p.nav).some(function (x) { return x[0] === 'Team'; }));
  var m = page(); m.T.chrome({ org: 'cleancell.us', current: 'dashboard', team: false });
  assert.ok(!links(m.nav).some(function (x) { return x[0] === 'Team'; }), 'a member sees no Team link');
  var cs = page(); cs.T.chrome({ org: 'cleancell.us', current: 'dashboard', owner: true });
  assert.ok(links(cs.nav).some(function (x) { return x[0] === 'Team'; }), 'ClearSky sees Team on any workspace');
  var t = page(); t.T.chrome({ org: 'x.example', team: true });
  var order = links(t.nav).map(function (x) { return x[0]; });
  assert.ok(order.indexOf('Products & bills') < order.indexOf('Team') && order.indexOf('Team') < order.indexOf('Settings'));
});
test('OFF-07: Sign out on an office page goes to the Omega Logic sign-in, which comes back to that page', function () {
  var p = page({ path: '/logic-materials.html', search: '?org=cleancell.us', hash: '#po' });
  p.T.chrome({ org: 'cleancell.us', current: 'purchasing' });
  p.els.signout.onclick();
  assert.equal(p.loc.href, '/omega-logic?next=' + encodeURIComponent('/logic-materials.html?org=cleancell.us#po'));
  var d = page({ path: '/omega-logic', search: '?org=cleancell.us' });
  d.T.chrome({ org: 'cleancell.us', current: 'dashboard' }); d.els.signout.onclick();
  assert.equal(d.loc.href, '/omega-logic?org=cleancell.us', 'the dashboard is already the front door');
  var a = page({ path: '/plant/', search: '?org=cleancell.us' }); a.T.chrome({ org: 'cleancell.us', afterSignOut: '/somewhere' }); a.els.signout.onclick();
  assert.equal(a.loc.href, '/somewhere', 'a page that names its own place keeps it');
});
test('OFF-07: the front door returns only to an office page of this site, for the company just opened', function () {
  var T = page().T, n = function (v) { return '?next=' + encodeURIComponent(v); };
  assert.equal(T.nextFor('cleancell.us', false, n('/logic-materials.html?org=cleancell.us#po')), '/logic-materials.html?org=cleancell.us#po');
  assert.equal(T.nextFor('CleanCell.us', false, n('/plant/manager.html?org=cleancell.us#quality')), '/plant/manager.html?org=cleancell.us#quality');
  assert.equal(T.nextFor('cleancell.us', false, n('/po-inbox?office=1&org=cleancell.us')), '/po-inbox?office=1&org=cleancell.us');
  assert.equal(T.nextFor('cleancell.us', false, n('/logic-materials.html?org=other.example')), '', 'another company: the dashboard instead');
  assert.equal(T.nextFor('cleancell.us', false, n('/logic-materials.html')), '', 'no company named: the dashboard');
  ['//evil.example/logic-x.html?org=cleancell.us', 'https://evil.example/?org=cleancell.us', 'javascript:alert(1)//?org=cleancell.us', '/portals/customer/app?org=cleancell.us', '/editor?org=cleancell.us',
    '/logic-x.html?org=cleancell.us"><script>', '/logic-x.html?org=cleancell.us#a b'].forEach(function (bad) { assert.equal(T.nextFor('cleancell.us', false, n(bad)), '', bad); });
  assert.equal(T.nextFor('', true, n('/logic-accounting.html?org=cleancell.us')), '/logic-accounting.html?org=cleancell.us', 'ClearSky: any workspace');
  assert.equal(T.nextFor('cleancell.us', false, ''), '');
});
test('OFF-07: an office page opened signed out offers the Omega Logic sign-in in its header; signing in takes it away', function () {
  var p = page({ path: '/logic-inventory.html', search: '?org=cleancell.us' });
  p.tick(); p.signIn(null);
  var a = p.els['logic-signin'];
  assert.ok(a, 'the link is there'); assert.equal(a.href, '/omega-logic?next=' + encodeURIComponent('/logic-inventory.html?org=cleancell.us')); assert.match(a.textContent, /Sign in to Omega Logic/);
  p.signIn(null); assert.equal(p.header.children.length, 1, 'painted once');
  p.signIn({ uid: 'u' }); assert.equal(p.els['logic-signin'], undefined);
  /* only office pages: never the customer's own pages */
  ['/portals/customer/app', '/portals/customer/', '/po-inbox', '/embed/storefront.html'].forEach(function (path) {
    var c = page({ path: path, search: '?org=cleancell.us' }); c.tick(); c.signIn(null); assert.equal(c.els['logic-signin'], undefined, path);
  });
  var o = page({ path: '/po-inbox', search: '?office=1&org=cleancell.us' }); o.tick(); o.signIn(null); assert.ok(o.els['logic-signin'], 'the office\'s own PO inbox');
  var n = page({ path: '/logic-inventory.html', firebase: false }); n.tick(); assert.equal(n.els['logic-signin'], undefined, 'no Firebase on the page: nothing to watch, nothing breaks');
});

console.log('landing on the section a link names (OFF-04)');
test('a #section drawn after the chrome is scrolled to once it exists, and again while the panels above push it down', function () {
  var p = page({ path: '/omega-logic', search: '?org=cleancell.us', hash: '#orders' });
  p.T.chrome({ org: 'cleancell.us', current: 'orders' });
  p.tick(2);
  var orders = p.el('orders'); p.els.orders = orders;       /* the page draws it now */
  p.tick(); assert.equal(orders.scrolled, 1);
  orders.top = 380; p.tick(); assert.equal(orders.scrolled, 2, 'a panel above filled in: back on the section');
  p.tick(6); assert.equal(orders.scrolled, 2, 'it stays put once it is there');
  p.T.chrome({ org: 'cleancell.us', current: 'orders' }); p.tick(4); assert.equal(orders.scrolled, 2, 'a later redraw of the chrome does not move the page');
});
test('an order deep link (?order=) lands on its detail; a hidden or missing target, or a page the person already scrolled, is left alone', function () {
  var p = page({ path: '/omega-logic', search: '?org=cleancell.us&order=o4' });
  var d = p.el('detail'); p.els.detail = d; p.T.chrome({ org: 'cleancell.us' }); p.tick(); assert.equal(d.scrolled, 1);
  var h = page({ path: '/plant/manager.html', search: '?org=x', hash: '#records' }); var r = h.el('records'); r.hidden = true; h.els.records = r; h.T.chrome({ org: 'x' }); h.tick(20); assert.equal(r.scrolled, 0, 'a hidden element is not a section');
  var s = page({ path: '/logic-materials.html', search: '?org=x', hash: '#po' }); s.T.chrome({ org: 'x' }); s.win.pageYOffset = 600; var po = s.el('po'); s.els.po = po; s.tick(3); assert.equal(po.scrolled, 0, 'they scrolled first');
  var n = page({ path: '/logic-materials.html', search: '?org=x' }); n.T.chrome({ org: 'x' }); n.tick(20);
  assert.equal(n.T.landTarget('#po', ''), 'po'); assert.equal(n.T.landTarget('', '?org=x&order=o1'), 'detail'); assert.equal(n.T.landTarget('#"><img', ''), ''); assert.equal(n.T.landTarget('', '?org=x'), '');
});

console.log('plain words (OFF-11, DOC-m2)');
test('codes, dates, counts and a dropped connection are said in words', function () {
  var T = page().T;
  assert.equal(T.words('in_transit'), 'in transit'); assert.equal(T.words('awaiting_serials'), 'awaiting serials'); assert.equal(T.words('po_needs_information'), 'needs information');
  assert.equal(T.words('in_fulfilment'), 'in production'); assert.equal(T.words('some_new_code'), 'some new code');
  assert.equal(T.source('customer-bulk'), 'sent by the customer on the PO sheet'); assert.equal(T.source('office'), 'entered by the office');
  assert.equal(T.count(1, 'unit'), '1 unit'); assert.equal(T.count(2, 'unit'), '2 units'); assert.equal(T.count(1, 'person', 'people'), '1 person');
  assert.equal(T.day('2026-09-24'), 'Sep 24, 2026'); assert.match(T.when('2026-09-24T14:05:00.000Z'), /^Sep 2[45], 2026, \d{1,2}:05\s?[AP]M$/);
  assert.match(T.day({ _seconds: 1790000000 }), /^[A-Z][a-z]{2} \d{1,2}, 2026$/); assert.equal(T.when(''), ''); assert.equal(T.day('not a date'), 'not a date');
  assert.ok(!/Failed to fetch/.test(T.plainError(new TypeError('Failed to fetch')))); assert.match(T.plainError(new TypeError('Failed to fetch')), /No connection/);
  assert.match(T.plainError(new Error('Load failed')), /No connection/); assert.equal(T.plainError(new Error('Order not found')), 'Order not found');
  assert.match(page({ offline: true }).T.plainError(new Error('Request failed (0)')), /No connection/, 'offline says offline whatever the browser called it');
});

/* ── the hub: one count for the desktop and the app ── */
var TODAY = '2026-09-24';
function order(id, stage, extra) { var o = { id: id, orderNo: 'CC-' + id, stage: { key: stage, next: 'next step' }, customer: { company: 'Riverside Cold Chain', name: 'Purchasing', email: 'ap@riverside.example' }, items: [{ sku: 'CC-C215', qty: 2 }], requests: [] }; Object.keys(extra || {}).forEach(function (k) { o[k] = extra[k]; }); return o; }
console.log('the office hub (OFF-14, D1, OFF-03)');
test('D1: a price counts only for whoever may take it; waiting on ClearSky or an admin is listed, never counted', function () {
  var T = page().T, orders = [
    order('q1', 'quote', { can: { price: false, accept: false }, waitingOn: 'clearsky' }),
    order('q2', 'quote', { can: { price: false, accept: false }, waitingOn: 'admin' }),
    order('p1', 'priced', { can: { price: false, accept: true }, waitingOn: null })];
  var s = T.hub({ orders: orders, today: TODAY });
  assert.deepEqual(plain(s.toPrice.map(function (o) { return o.id; })), ['p1']);
  assert.deepEqual(plain(s.waiting.map(function (o) { return o.id; })), ['q1', 'q2']);
  assert.deepEqual(plain(s.needs.map(function (n) { return n.o.id + ':' + n.pill; })), ['p1:accept'], 'the one she may take, pill says accept');
  var sales = s.items[1]; assert.equal(sales.badge, '1'); assert.equal(sales.hint, '1 to price');
  var member = T.hub({ orders: orders.slice(0, 2), today: TODAY });
  assert.equal(member.items[1].badge, ''); assert.equal(member.items[1].hint, '2 waiting on an admin', 'nothing counted; the caption names whom it waits on');
  assert.equal(T.hub({ orders: [order('q', 'quote')], owner: true, today: TODAY }).toPrice.length, 1, 'a server from before D1 (no `can`): ClearSky only');
  assert.equal(T.hub({ orders: [order('q', 'quote')], owner: false, today: TODAY }).toPrice.length, 0);
});
test('OFF-14: every badge\'s caption says what its number is (one kind: that kind; several: how many need you)', function () {
  var T = page().T, orders = [order('a', 'priced', { can: { accept: true } }), order('b', 'production', { requests: [{ status: 'open' }] }), order('s', 'ship', { items: [{ qty: 3 }] })];
  var s = T.hub({ orders: orders, intake: { review: 1, needsInfo: 0 }, follow: [{ type: 'call', followUpAt: '2026-09-20' }, { type: 'task' }, { type: 'call', followUpAt: '2026-10-30' }],
    pending: 1, plantRows: [{ stage: 'production', late: true, progress: { held: 2 } }, { stage: 'complete', progress: { held: 5 } }], toConfirm: 2, inTransit: 4, short: 3, outstandingCents: 12345600, today: TODAY });
  var by = {}; s.items.forEach(function (it) { by[it.key] = it; });
  assert.equal(by.today.badge, '5', 'a request, an acceptance, a PO, two follow-ups due'); assert.equal(s.followLater, 1);
  assert.equal(by.sales.badge, '3'); assert.equal(by.sales.hint, '3 need you');
  assert.equal(by.customers.badge, '3', 'follow-ups due and people asking to join, as the guide says'); assert.equal(by.customers.hint, '3 need you');
  assert.equal(by.plant.badge, '2'); assert.equal(by.plant.hint, '2 on hold');
  assert.equal(by.deliver.badge, '5', 'units to ship and units to confirm'); assert.equal(by.deliver.hint, '5 need you');
  assert.equal(by.stock.badge, '3'); assert.equal(by.stock.hint, '3 parts short');
  var one = T.hub({ orders: [order('r', 'production', { requests: [{ status: 'open' }] })], follow: [], pending: 1, toConfirm: 0, inTransit: 4, short: 0, outstandingCents: 0, today: TODAY });
  var b1 = {}; one.items.forEach(function (it) { b1[it.key] = it; });
  assert.equal(b1.sales.hint, '1 request'); assert.equal(b1.customers.hint, '1 asking to join'); assert.equal(b1.deliver.hint, '4 in transit'); assert.equal(b1.deliver.badge, '');
  assert.equal(b1.stock.hint, 'nothing short'); assert.equal(b1.money.hint, 'nothing open');
  var none = T.hub({ orders: [], today: TODAY }), b0 = {}; none.items.forEach(function (it) { b0[it.key] = it; });
  assert.equal(b0.stock.badge, ''); assert.equal(b0.stock.hint, '', 'the plan has not arrived: no badge, no zero'); assert.equal(b0.customers.badge, ''); assert.equal(b0.money.hint, '');
});
test('OFF-14: the same data counts the same on the desktop and in the app (one function, and both pages call it)', function () {
  var desk = fs.readFileSync(path.join(__dirname, '..', 'omega-logic.html'), 'utf8'), app = fs.readFileSync(path.join(__dirname, '..', 'office', 'app.html'), 'utf8');
  assert.match(desk, /function hubSummary\(\)\{[^]*?OmegaLogicTheme\.hub\(/); assert.match(desk, /function hubItems\(s\)\{return s\.items;\}/);
  assert.match(app, /function summary\(\) \{[^]*?OmegaLogicTheme\.hub\(/); assert.match(app, /function hubItems\(s\) \{ return s\.items; \}/);
  ['pending:', 'toConfirm:', 'plantRows:', 'short:', 'outstandingCents:'].forEach(function (k) { assert.ok(desk.indexOf(k) >= 0 && app.indexOf(k) >= 0, k + ' fed on both'); });
  assert.ok(!/s\.invoiced\s*\+?=|invoiced\+=|depositsOpen/.test(desk + app), 'neither page sums invoices itself');
});
test('OFF-03: "company POs to review" names whose; a company with one PO opens that PO, several open the company\'s queue', function () {
  var T = page().T;
  var one = T.hub({ orders: [], intake: { review: 1, needsInfo: 0, waiting: [{ id: 'po_a', customerId: 'company_riverside', company: 'Riverside Cold Chain', poNumber: 'RCC-1', status: 'po_review', createdAt: '2026-09-22T10:00:00Z' }] }, today: TODAY });
  var l1 = T.reviewLinks('cleancell.us', one);
  assert.equal(l1.length, 1); assert.equal(l1[0].title, 'PO RCC-1 from Riverside Cold Chain'); assert.match(l1[0].sub, /under review · received Sep 22, 2026/);
  assert.equal(l1[0].href, '/customer-po?org=cleancell.us&office=1&customerId=company_riverside&intake=po_a');
  var many = T.hub({ orders: [], intake: { review: 2, needsInfo: 2, waiting: [
    { id: 'p1', customerId: 'c_a', company: 'Alpha Storage', poNumber: 'A-1', status: 'po_review' }, { id: 'p2', customerId: 'c_a', company: 'Alpha Storage', poNumber: 'A-2', status: 'po_needs_information' },
    { id: 'p3', customerId: 'c_b', company: 'Beta Fleet', poNumber: 'B-1', status: 'po_review' }] }, today: TODAY });
  var l2 = T.reviewLinks('cleancell.us', many);
  assert.deepEqual(plain(l2.map(function (x) { return x.title; })), ['2 company POs from Alpha Storage', 'PO B-1 from Beta Fleet', '1 more company PO to review']);
  assert.equal(l2[0].href, '/po-inbox?office=1&org=cleancell.us&customerId=c_a'); assert.equal(l2[1].href, '/customer-po?org=cleancell.us&office=1&customerId=c_b&intake=p3'); assert.equal(l2[2].href, '/po-inbox?office=1&org=cleancell.us');
  var old = T.reviewLinks('cleancell.us', T.hub({ orders: [], intake: { review: 2 }, today: TODAY }));
  assert.deepEqual(plain(old.map(function (x) { return x.title + ' → ' + x.href; })), ['2 company POs to review → /po-inbox?office=1&org=cleancell.us'], 'an older server without the list: the Company POs page, as before');
  assert.deepEqual(plain(T.reviewLinks('x', T.hub({ orders: [], today: TODAY }))), []);
});

console.log('money and stages (OFF-02, OFF-14)');
test('OFF-02: the money tiles are receivables.totals() itself, To issue its own tile; nothing summed on the page', function () {
  stubAdmin();
  var R = require('../api/_lib/receivables'), T = page().T;
  /* a deposit issued and part paid; a balance not yet issued (the supplier's paper); one billed through QuickBooks */
  var entries = [
    { id: 'o1', order: { orderNo: 'CC-1', customer: { email: 'a@x.example' }, status: 'in_fulfilment', logic: { accounting: 'tenant', releasedAt: '2026-09-01', commercial: { terms: { dueDays: 30 } }, invoices: {
      deposit: { id: 'INV-1', issuedAt: '2026-08-01', amountCents: 300000, payments: [{ amountCents: 100000, date: '2026-08-02', bankReference: 'ACH-77' }] },
      balance: { amountCents: 700000 } } } } },
    { id: 'o2', order: { orderNo: 'CC-2', customer: { email: 'b@x.example' }, status: 'accepted', logic: { accounting: 'quickbooks', invoices: { deposit: { id: '901', amountCents: 50000, paidCents: 50000, satisfied: true } } } } }];
  var t = R.totals(R.rows(entries, TODAY));
  var tiles = T.moneyTiles(t), by = {}; tiles.forEach(function (x) { by[x.k] = x; });
  assert.deepEqual(plain(tiles.map(function (x) { return x.k; })), ['invoiced', 'received', 'outstanding', 'overdue', 'toIssue']);
  assert.equal(by.invoiced.cents, t.invoicedCents); assert.equal(by.invoiced.cents, 350000, 'an invoice counts once it is issued: the unissued balance is not "invoiced"');
  assert.equal(by.received.cents, 150000); assert.equal(by.outstanding.cents, 200000); assert.equal(by.toIssue.cents, 700000, 'to issue, its own tile');
  assert.equal(by.overdue.cents, 200000); assert.equal(by.overdue.bad, true); assert.equal(by.overdue.note, '1 invoice');
  assert.match(T.tileHtml(by.toIssue), /^<div data-k="toIssue"><small>To issue<\/small><b>\$7,000\.00<\/b>/);
  assert.ok(T.moneyTiles(null).every(function (x) { return x.cents === null; }), 'no totals from the server: no figures');
  assert.match(T.tileHtml(T.moneyTiles(null)[0]), /<b>—<\/b><small>see Accounting<\/small>/);
});
test('OFF-14 / PLANT-09: the stage strip and the app\'s tiles are the server\'s stage counts, the same six on both', function () {
  stubAdmin();
  var S = require('../api/_lib/office-stage'), T = page().T;
  var orders = [{ status: 'new' }, { status: 'accepted', logic: { acceptedAt: 'x', invoices: { deposit: { amountCents: 1 } } } },
    { status: 'in_fulfilment', logic: { acceptedAt: 'x', releasedAt: 'y', invoices: { deposit: { amountCents: 1, satisfied: true }, balance: { amountCents: 1, satisfied: true } } } },
    { status: 'shipped', logic: { acceptedAt: 'x', releasedAt: 'y', payout: { status: 'wire_recorded' } } }, { status: 'new', cancelRequested: true }];
  var tiles = T.stageTiles(S.totals(orders).byStage), by = {}; tiles.forEach(function (x) { by[x.k] = x.n; });
  assert.deepEqual(plain(by), { quote: 1, deposit: 1, build: 0, ship: 1, shipped: 1, attention: 1 }, 'a paid-in-full hardware order is Ready to ship (it was always 0 counted by status)');
  var desk = fs.readFileSync(path.join(__dirname, '..', 'omega-logic.html'), 'utf8'), app = fs.readFileSync(path.join(__dirname, '..', 'office', 'app.html'), 'utf8');
  assert.match(desk, /OmegaLogicTheme\.stageTiles\(d\.totals&&d\.totals\.byStage\)/); assert.match(app, /OmegaLogicTheme\.stageTiles\(\(DATA\.totals \|\| \{\}\)\.byStage\)/);
  assert.match(desk, /OmegaLogicTheme\.moneyTiles\(d\.receivables\)/); assert.match(app, /OmegaLogicTheme\.moneyTiles\(DATA\.receivables\)/);
});

console.log('the theme stays a shared runtime file');
test('ES5 only, no network, and it still loads in a page with nothing but window and document', function () {
  var code = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/'(?:[^'\\\n]|\\.)*'/g, "''");
  assert.ok(!/=>|`|\blet\s|\bconst\s|\.includes\(|\.find\(|\.findIndex\(|Object\.assign|\bclass\s/.test(code), 'ES5');
  var ctx = { window: {}, document: { documentElement: { style: { setProperty: function () {} } }, body: { classList: { add: function () {} } }, querySelectorAll: function () { return []; } } };
  vm.runInNewContext(SRC, ctx); assert.equal(typeof ctx.window.OmegaLogicTheme.hub, 'function');
});

function stubAdmin() {
  var p = require.resolve('../api/_lib/admin');
  if (!require.cache[p]) require.cache[p] = { id: p, filename: p, loaded: true, exports: { httpError: function (s, m) { var e = new Error(m); e.status = s; return e; }, handler: function (f) { return f; } } };
}
console.log('\n' + count + ' office chrome checks passed. No network.');
