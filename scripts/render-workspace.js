#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   scripts/render-workspace.js — Omega Workspace (workspace.html), rendered and checked
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Boots the REAL workspace.html in Chromium, signed in, with the Firebase
   compat SDK replaced by scripts/_lib/firebase-double.js and the tenant
   seeded from scripts/_lib/dashboard-fixtures.js — the same four tenants the
   dashboard is checked as (a new trial behind the terms modal, a paying
   Standard tenant with data and a locked tool, a workspace awaiting
   approval, a PACKAGED tenant on Lite alone), on a desktop and a 390px
   phone. Nothing leaves the machine.

     node scripts/render-workspace.js              # a JSON line per scenario
     node scripts/render-workspace.js --shots DIR  # plus screenshots
     node scripts/render-workspace.js --only sweep # scenarios whose name matches
     npm run check:workspace

   It fails on an uncaught error, a console error, a call to an /api/ route
   it does not answer, a request that would have left the machine, sideways
   scroll, a stray write, and on each product assertion: the hub has Today
   and a ring made only of areas this tenant may open, the greeting, the
   company in the switcher, the locks (a Standard tenant's Enterprise tool
   locked, a Lite tenant's tools outside Lite locked, everything locked while
   approval is pending), the side panel opening from a hub cell, Customize
   saving only to the person's own layout record, the phone rail; and the
   FLOW: the projects and marketplace pages wearing the workspace rail and
   the dashboard sending a workspace-home visit on; + New project as a
   panel over the page (never at its foot); and EVERY CLICK: every control
   on every view, as four tenants on a desktop and a phone, through
   scripts/_lib/click-sweep.js. Not on the npm test chain: needs the
   pre-installed Chromium, and the sweeps take a few minutes.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var fs = require('fs'), path = require('path'), http = require('http'), os = require('os');
var ROOT = path.join(__dirname, '..');
var PW = process.env.PLAYWRIGHT || (function () { try { return require.resolve('playwright'); } catch (e) { return '/opt/node22/lib/node_modules/playwright'; } })();
var chromium; try { chromium = require(PW).chromium; } catch (e) { console.log('render-workspace: Playwright not found (' + PW + '); skipped'); process.exit(0); }
var SANDBOX_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
var CHROME = process.env.CHROME || (fs.existsSync(SANDBOX_CHROME) ? SANDBOX_CHROME : chromium.executablePath());
if (!fs.existsSync(CHROME)) { console.log('render-workspace: Chromium not found (' + CHROME + '); skipped'); process.exit(0); }
var shotsAt = (function () { var i = process.argv.indexOf('--shots'); return i >= 0 ? (process.argv[i + 1] || os.tmpdir()) : null; })();
/* --only <regex>: run the scenarios whose name matches (the sweeps take a while) */
var ONLY = (function () { var i = process.argv.indexOf('--only'); return i >= 0 && process.argv[i + 1] ? new RegExp(process.argv[i + 1]) : null; })();
if (shotsAt && !fs.existsSync(shotsAt)) fs.mkdirSync(shotsAt, { recursive: true });

var FD = require('./_lib/firebase-double'), FX = require('./_lib/dashboard-fixtures'), HUB = require('../omega-workspace-hub'), M = require('../api/_lib/modules');
/* the public price list is served by api/offerings.view on the proposed
   book; the endpoint's admin library is stood in for (no firebase-admin
   here), as the packaging render checks do */
require('./_lib/firestore-double').mock('../api/_lib/admin', { handler: function (fn) { return fn; }, httpError: function (s, m) { var e = new Error(m); e.status = s; return e; }, db: function () { return null; } });
var OFFERINGS = require('../api/offerings'), BOOK = require('../api/_lib/pricebook');
var DOUBLE_SRC = FD.source();
var HOST = '127.0.0.1';
var TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.pdf': 'application/pdf' };
var apiCalls = [], missing = [], external = [], PACKAGE_VIEW = null, CURRENT_FX = null;
/* THE PACKAGE STORE'S ROUTES. The price list is the real one
   (api/_lib/subscription-pricing on the proposed book, as the packaging
   render checks answer it). plan-change is answered in the SHAPES the real
   api/_lib/plan-change.js returns (preview, apply, summary), with the
   bodies the page posts recorded, so the check can assert what was asked
   for; the real endpoint's money is covered by render-packaging-billing.js. */
var STORE = { posts: [], pending: [] };
/* the rail the packaged stub bills through: null is QuickBooks (the fixtures), 'stripe' the rail Tommy chose on 2026-09-27 */
var STUB_PROVIDER = null;
function storeRoute(u, method, body) {
  var B = require('../api/_lib/pricebook'), P = require('../api/_lib/subscription-pricing'), book = B.proposed();
  if (u === '/api/package-catalog') return { orgId: 'litelabs.example', pricebookVersion: book.version, modules: P.catalog(book), starters: M.starters(), canManage: true };
  if (method === 'GET' && !PACKAGE_VIEW && CURRENT_FX) { var lb = (CURRENT_FX.docs['omega_orgs/' + CURRENT_FX.org + '/billing/current'] || {}); return { orgId: CURRENT_FX.org, packaged: false, packagingState: null, plan: null, planDisplay: null, modules: ['lite'], subscription: ['lite'], moduleNames: [M.get('lite').name], subscriptionNames: [M.get('lite').name], interval: 'monthly', billingDay: null, nextInvoiceOn: null, monthlyDisplay: null, accessUntil: null, paidThrough: null, amountDue: lb.amountDue == null ? null : lb.amountDue, paymentLink: null, invoices: [], gate: { canApply: false, reason: 'This workspace is not on a subscription package.' }, pending: [], removalRequests: [], recent: [] }; }
  if (method === 'GET') return { orgId: 'litelabs.example', packaged: true, packagingState: 'paid', plan: 'lite', planDisplay: 'Lite', modules: ['lite'], subscription: ['lite'], moduleNames: [M.get('lite').name], subscriptionNames: [M.get('lite').name], paidThrough: '2026-10-20', accessUntil: null, amountDue: null,
    provider: STUB_PROVIDER || 'quickbooks', payWith: STUB_PROVIDER === 'stripe' ? 'Stripe' : 'QuickBooks',
    invoices: (STUB_PROVIDER === 'stripe' ? [{ id: '2026-10-20', kind: 'subscription', state: 'unpaid', date: '2026-10-20', period: { start: '2026-10-20', end: '2026-11-20' }, totalCents: 14900, display: '$149', paymentLink: 'https://invoice.stripe.com/i/acct_fixture/in_fixture', payWith: 'Stripe', names: null, paidAt: null }] : []).concat([{ id: '2026-09-20', kind: 'subscription', state: 'paid', date: '2026-09-20', period: { start: '2026-09-20', end: '2026-10-20' }, totalCents: 50000, display: '$500', paymentLink: null, names: null, paidAt: '2026-09-21' }]).concat(STORE.pending.map(function (x) { return { id: x.id, kind: 'change', state: 'unpaid', date: '2026-09-27', period: null, totalCents: 20000, display: x.display, paymentLink: x.paymentLink, names: (x.add || []).map(function (k) { return M.get(k).name; }), paidAt: null }; })),
    interval: 'monthly', billingDay: 20, nextInvoiceOn: '2026-10-20', monthlyDisplay: '$149/month', gate: { canApply: true }, pending: STORE.pending, removalRequests: [], recent: [] };
  STORE.posts.push(body);
  if (/^addon-/.test(body.action || '') || (body.action === 'reconcile-now' && !PACKAGE_VIEW)) return addOnRoute(body);
  /* the recorded request (plan-change opt-in): the module with its book price, nothing charged */
  if (body.action === 'opt-in') return { ok: true, requested: true, add: body.add, names: body.add.map(function (k) { return M.get(k).name; }), display: P.money(body.add.reduce(function (n, k) { return n + book.modules[k].priceCents; }, 0)) + '/month' };
  if (body.action === 'quote') return { orgId: 'litelabs.example', previewId: 'a'.repeat(48), effectiveAt: Date.now(), add: body.add, addNames: body.add.map(function (k) { return M.get(k).name; }), modules: ['lite'].concat(body.add), plan: 'lite', included: false, canApply: true, reason: null, pending: [], steer: null, serviceFeeNote: null,
    display: { today: 'Pay $200 today (prorated to Oct 20)', then: 'Then $250/month more from Oct 20', activation: 'Switches on when the payment clears' } };
  if (body.action === 'apply') { var rec = { id: 'change-' + body.previewId, add: body.add, display: '$200', expiresOn: '2026-10-03', paymentLink: 'https://pay.example/inv-1', state: 'unpaid' }; STORE.pending = [rec]; return { state: 'unpaid', changeId: rec.id, display: rec.display, expiresOn: rec.expiresOn, paymentLink: rec.paymentLink }; }
  if (body.action === 'cancel') { STORE.pending = []; return { state: 'cancelled', changeId: body.changeId }; }
  if (body.action === 'reconcile-now') return { orgId: 'litelabs.example', packaged: true, paid: false, provider: STUB_PROVIDER || 'quickbooks', payWith: STUB_PROVIDER === 'stripe' ? 'Stripe' : 'QuickBooks', checkedAt: Date.now() };
  return { error: 'render-workspace does not answer ' + body.action };
}
/* Add to plan on a plan billed outside the engine: the REAL quote
   (api/_lib/addons.js) on the scenario's own billing record, so the words
   and the price on the page are the server's; buying records one invoice
   waiting for payment (the page must send the quote's own id), and "I've
   paid" answers paid once the scenario says the payment landed. */
var ADDON = { paid: false, entry: null, bought: [] };
var PAY_URL = 'https://connect.intuit.com/portal/app/CommerceNetwork/view/scs-render-test';
function addOnRoute(body) {
  var AO = require('../api/_lib/addons'), B = require('../api/_lib/pricebook'), book = B.proposed(); book.enabled = true;
  var fx = CURRENT_FX, bill = fx.docs['omega_orgs/' + fx.org + '/billing/current'] || {}, now = Date.now();
  var c = { root: { id: fx.org }, org: Object.assign({}, fx.docs['omega_orgs/' + fx.org], { packagingSandbox: true }), billing: bill, billingExists: true, profile: { legalName: fx.name || fx.org }, book: book };
  var env = { b: process.env.PACKAGING_BILLING_ENABLED, q: process.env.QBO_ENV };
  process.env.PACKAGING_BILLING_ENABLED = 'true'; process.env.QBO_ENV = 'sandbox';
  try {
    if (body.action === 'reconcile-now') return { orgId: fx.org, packaged: false, checkedAt: now, addOns: ADDON.paid ? { live: ADDON.bought.slice(), pending: [] } : { live: [], pending: ADDON.entry ? [ADDON.entry] : [] } };
    if (body.action === 'addon-cancel') { ADDON.entry = null; return { ok: true, addOnId: body.addOnId, state: 'cancelled' }; }
    var q = AO.quote(c, [], { add: body.add }, now, false);
    if (body.action === 'addon-quote') return q;
    if (body.previewId !== q.previewId) { var e = new Error('The price changed; review it again before paying'); e.status = 409; throw e; }
    ADDON.bought = q.add.slice();
    ADDON.entry = { id: 'addon-' + q.previewId, purpose: 'purchase', add: q.add, names: q.addNames, totalCents: q.todayCents, display: q.display.amount, paymentLink: PAY_URL, date: q.cycle.start, expiresOn: q.cycle.end };
    return { ok: true, addOnId: ADDON.entry.id, state: 'awaiting_payment', add: q.add, addNames: q.addNames, todayCents: q.todayCents, display: q.display.amount, paymentLink: PAY_URL, payLinkMissing: false, expiresOn: q.cycle.end, monthlyDisplay: q.monthlyDisplay, live: [] };
  } finally { process.env.PACKAGING_BILLING_ENABLED = env.b; process.env.QBO_ENV = env.q; if (env.b === undefined) delete process.env.PACKAGING_BILLING_ENABLED; if (env.q === undefined) delete process.env.QBO_ENV; }
}
var STAFF_CALLER = false;
var srv = http.createServer(function (req, res) {
  var u = req.url.split('?')[0], post = req.method === 'POST';
  function json(o, status) { res.writeHead(status || 200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); }
  if (u.indexOf('/api/') === 0) {
    apiCalls.push(req.method + ' ' + u);
    if (u === '/api/events') return post ? json({ accepted: 0 }, 202) : json({ enabled: false, sampleRate: 0, termsOk: true, excluded: false });
    if (u === '/api/package-access' && !post) return json(PACKAGE_VIEW || { packaged: false });
    if (u === '/api/offerings' && !post) return json(OFFERINGS.view(BOOK.proposed(), 'proposed'));
    if (u === '/api/pulse' && !post) { var PL = require('../api/_lib/pulse'), nowP = Date.now(); return json(PL.build({ projects: [{ updatedAt: nowP - 3600e3, stage: 'candidate', bessKwh: 2000, bessKw: 1000, orgId: 'a' }, { updatedAt: nowP - 86400e3, stage: 'finance', bessKwh: 4000, bessKw: 1000, orgId: 'b' }, { updatedAt: nowP - 9 * 86400e3, stage: 'online', orgId: 'a' }], rfqs: [{ createdAt: nowP - 7200e3 }], members: [{ lastSeen: nowP - 60e3 }, { lastSeen: nowP - 40 * 86400e3 }] }, nowP, { projects: 500, rfqs: 500, members: 500 })); }
    if (u === '/api/package-access' && post) {
      /* the staff preview, as api/package-access.js projects it (the real projection, staff only) */
      var pc = []; req.on('data', function (c) { pc.push(c); }); req.on('end', function () {
        var pb = {}; try { pb = JSON.parse(Buffer.concat(pc).toString()); } catch (e) {}
        if (!STAFF_CALLER) return json({ error: 'Staff preview only' }, 403);
        var X = require('../api/_lib/package-access'), mods = M.normalize(pb.previewModules);
        var pv = X.project({ emailVerified: true }, { packaged: true, packagingState: 'paid', accessUntil: Date.now() + 86400000, modules: mods }, { status: 'active' }, { role: 'owner' }, Date.now());
        pv.canPreview = true; pv.preview = true; pv.starters = M.starters(); json(pv);
      }); return;
    }
    if (u === '/api/stripe-invoices' && post) return json({ connected: true, orgId: CURRENT_FX && CURRENT_FX.org, invoices: [
      { id: 'in_2', number: 'NS-0002', status: 'paid', amountDue: 1250, created: Date.now() - 10 * 86400e3, hostedUrl: 'https://invoice.stripe.com/i/test_2', pdfUrl: null },
      { id: 'in_1', number: 'NS-0001', status: 'paid', amountDue: 1250, created: Date.now() - 40 * 86400e3, hostedUrl: 'https://invoice.stripe.com/i/test_1', pdfUrl: null } ] });
    if (u === '/api/stripe-portal' && post) return json({ url: 'https://billing.stripe.com/p/session/test_northstar' });
    if (u === '/api/package-catalog' || u === '/api/plan-change') {
      var chunks = []; req.on('data', function (c) { chunks.push(c); }); req.on('end', function () { var body = {}; try { body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {}; } catch (e) {} try { json(storeRoute(u, req.method, body)); } catch (e) { json({ error: e.message }, e.status || 500); } }); return;
    }
    missing.push(req.method + ' ' + u); return json({ error: 'render-workspace does not answer ' + u }, 404);
  }
  var f = path.join(ROOT, u === '/' ? 'index.html' : u);
  if (!fs.existsSync(f) && fs.existsSync(f + '.html')) f = f + '.html';
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
});
var fails = 0;
function ok(name, cond, detail) { if (!cond) { fails++; console.log('FAIL ' + name + (detail !== undefined ? ' ' + JSON.stringify(detail) : '')); } }
function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
var STRAY = /\b(NaN|undefined|null|\[object Object\])\b/;

(async function () {
  await new Promise(function (r) { srv.listen(0, HOST, r); });
  var base = 'http://' + HOST + ':' + srv.address().port;
  var browser = await chromium.launch({ executablePath: CHROME });

  async function scenario(name, fx, opts) {
    if (ONLY && !ONLY.test(name)) return {};
    opts = opts || {}; PACKAGE_VIEW = fx.packageView || null; CURRENT_FX = fx;
    var errs = [], muted = false, ctx = await browser.newContext({ viewport: opts.phone ? { width: 390, height: 844 } : { width: 1366, height: 900 }, hasTouch: !!opts.phone, isMobile: !!opts.phone });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, function (r) {
      var url = r.request().url();
      if (/gstatic\.com\/firebasejs/.test(url)) return r.fulfill({ status: 200, contentType: 'text/javascript', body: '/* firebase is scripts/_lib/firebase-double.js here */' });
      if (/fonts\.(googleapis|gstatic)\.com/.test(url)) return r.fulfill({ status: 200, contentType: 'text/css', body: '' });
      external.push(name + ': ' + url.slice(0, 120)); return r.abort();
    });
    await ctx.addInitScript(DOUBLE_SRC);
    await ctx.addInitScript(function (cfg) { window.FirebaseDouble.install(window, cfg); }, { user: fx.user, docs: fx.docs, latency: 8, authDomain: HOST });
    var p = await ctx.newPage();
    p.on('pageerror', function (e) { if (!muted) errs.push(name + ': ' + e.message); });
    p.on('console', function (m) { if (muted) return; var t = m.text(); if (m.type() === 'error' && !/^Failed to load resource/.test(t)) errs.push(name + ' console: ' + t.slice(0, 240)); });
    var t0 = Date.now();
    /* the fixtures say shell: 'classic' (the classic dashboard's own check), so the workspace is asked for by name: ?home=workspace, kept ahead of any hash */
    var target = opts.url || '/workspace', hashAt = target.indexOf('#'), pathPart = hashAt >= 0 ? target.slice(0, hashAt) : target, hashPart = hashAt >= 0 ? target.slice(hashAt) : '';
    await p.goto(base + pathPart + (pathPart.indexOf('?') >= 0 ? '&' : '?') + 'home=workspace' + hashPart, { waitUntil: 'domcontentloaded' });
    var ready = await p.waitForFunction(function () { return document.body.classList.contains('ready') || !!document.getElementById('ot-modal'); }, null, { timeout: 8000 }).then(function () { return true; }, function () { return false; });
    var out = { scenario: name, tenant: fx.org, readyMs: Date.now() - t0 };
    ok(name + ': the page answered within 8s', ready, out.readyMs);
    await wait(1500);
    Object.assign(out, await (opts.steps || function () { return {}; })(p, ctx));
    var text = await p.evaluate(function () { var m = document.getElementById('main'); return m ? m.innerText : document.body.innerText; });
    var stray = STRAY.exec(text);
    ok(name + ': the page prints no NaN / undefined / null / [object Object]', !stray, stray && text.slice(Math.max(0, stray.index - 60), stray.index + 40));
    var widths = opts.phone ? [390] : [1366, 390];
    for (var wi = 0; wi < widths.length; wi++) {
      var w = widths[wi]; await p.setViewportSize({ width: w, height: 844 }); await wait(250);
      var hs = await p.evaluate(function () { return document.documentElement.scrollWidth > document.documentElement.clientWidth + 1; });
      if (hs) out['widest@' + w] = await p.evaluate(function (vw) { var worst = null; Array.prototype.forEach.call(document.querySelectorAll('body *'), function (e) { var r = e.getBoundingClientRect(); if (r.width && r.right > vw + 2 && (!worst || r.right > worst.right)) worst = { right: Math.round(r.right), tag: e.tagName, cls: String(e.className).slice(0, 50), id: e.id }; }); return worst; }, w);
      ok(name + ': no horizontal scroll at ' + w + 'px', !hs, out['widest@' + w]);
      if (shotsAt) await p.screenshot({ path: path.join(shotsAt, name + '-' + w + '.png'), fullPage: w === 1366 });
    }
    if (opts.after) { await p.setViewportSize(opts.phone ? { width: 390, height: 844 } : { width: 1366, height: 900 }); await wait(250); Object.assign(out, await opts.after(p, ctx, function () { muted = true; })); }
    out.writes = await p.evaluate(function () { return (window.__firebaseDouble ? window.__firebaseDouble.store.log : []).map(function (w) { return w.op + ' ' + w.path; }); }).catch(function () { return ['(page navigated away)']; });
    var strayW = out.writes.filter(function (x) { return !/^(set|update|add) (team_members\/|termsAcceptances\/|dashboard_layouts\/|team_messages\/|projects\/|omega_orgs\/[^/]+\/members\/)/.test(x) && x !== '(page navigated away)'; });
    ok(name + ': a visit writes only presence, acceptance, the person\'s own layout, a posted message, an assignment or self-registration', !strayW.length, strayW);
    ok(name + ': no uncaught or console errors', !errs.length, errs);
    console.log(JSON.stringify(out));
    await ctx.close();
    return out;
  }

  /* every word on a module card fits inside its card (Tommy, 2026-09-27:
     "make sure all the words fit in their space"): at desktop, tablet and
     phone widths no name, price, feature, chip, note or button runs past
     its card or is clipped in its own box, and the page never scrolls
     sideways. Your modules come first, then the rest to add. */
  async function modulesFit(p, name) {
    var vp0 = p.viewportSize(), widths = [1366, 1180, 1024, 820, 390, 360], bad = [], order = null;
    for (var wi = 0; wi < widths.length; wi++) {
      await p.setViewportSize({ width: widths[wi], height: 900 }); await wait(200);
      var r = await p.evaluate(function () {
        var out = [], cards = document.querySelectorAll('#modules-body .mod');
        Array.prototype.forEach.call(cards, function (c) {
          var k = c.getAttribute('data-module'), cr = c.getBoundingClientRect();
          if (c.scrollWidth > c.clientWidth + 1) out.push(k + ': the card is wider than its box');
          Array.prototype.forEach.call(c.querySelectorAll('.ltr,.st,.nm b,.price,.feat li,.ows-chip,.note,.ows-pill'), function (e) {
            var er = e.getBoundingClientRect(); if (!er.width) return;
            if (er.left < cr.left - 0.5 || er.right > cr.right + 0.5) out.push(k + ': "' + e.textContent.trim() + '" runs outside the card');
            else if (e.scrollWidth > e.clientWidth + 1) out.push(k + ': "' + e.textContent.trim() + '" is clipped in its box');
          });
        });
        return { out: out, n: cards.length, sideways: document.documentElement.scrollWidth > window.innerWidth + 1, heads: Array.prototype.map.call(document.querySelectorAll('#modules-body h3'), function (h) { return h.firstChild.textContent; }), held: Array.prototype.map.call(cards, function (c) { return c.getAttribute('data-held'); }) };
      });
      if (shotsAt && (widths[wi] === 1366 || widths[wi] === 390)) await p.screenshot({ path: path.join(shotsAt, name.replace(/\W+/g, '-').toLowerCase() + '-modules-' + widths[wi] + '.png'), fullPage: true });
      if (!r.n) bad.push(widths[wi] + 'px: no cards');
      if (r.sideways) bad.push(widths[wi] + 'px: the page scrolls sideways');
      r.out.forEach(function (o) { bad.push(widths[wi] + 'px ' + o); });
      if (!order) order = r;
    }
    await p.setViewportSize(vp0); await wait(150);
    ok(name + ': every word on every module card fits inside its card, desktop to phone', !bad.length, bad.slice(0, 8));
    var mine = order.held.filter(function (h) { return h === '1' || h === 'bought'; }).length;
    ok(name + ': Your modules come first, then the rest to add', order.heads[0] === (mine ? 'Your modules' : 'Every module') && order.held.slice(0, mine).every(function (h) { return h === '1' || h === 'bought'; }) && (order.heads.length === 1 || order.heads[1] === 'Add to your plan'), { heads: order.heads, held: order.held });
  }
  /* + NEW PROJECT IS A PANEL OVER THE PAGE (Tommy, 2026-09-27: "when i
     click new project it does this and break the page"; "this should be a
     pannel that pops up"). The old check asked only whether the name field
     was visible, and it was: at the foot of the page, where the workspace
     had appended the dialog in flow because the overlay rule lived on the
     old dashboard. So: fixed, covering the screen, the panel inside it, the
     page behind neither moving nor growing, focus inside; the backdrop,
     Escape and Cancel each close it and hand the page back. From In flight,
     where the button is. */
  async function newProjectPanel(p, name) {
    await p.evaluate(function () { window.location.hash = '#flight'; }); await wait(200);
    var before = await p.evaluate(function () { return { y: Math.round(window.scrollY), h: document.documentElement.scrollHeight, kids: document.body.children.length }; });
    async function openIt() { await p.click('#new-project'); await wait(350); }
    function state() {
      return p.evaluate(function () {
        var bg = document.getElementById('new-proj-modal'), box = bg && bg.querySelector('.modal'), vw = window.innerWidth, vh = window.innerHeight;
        if (!bg) return { missing: true };
        var cs = getComputedStyle(bg), b = bg.getBoundingClientRect(), r = box.getBoundingClientRect();
        return { position: cs.position, display: cs.display, covers: b.left <= 0 && b.top <= 0 && b.width >= vw - 1 && b.height >= vh - 1, panel: [r.left, r.top, r.right, r.bottom].map(Math.round), inView: r.left >= 0 && r.top >= 0 && r.right <= vw + 0.5 && r.bottom <= vh + 0.5, overChrome: document.elementFromPoint(vw - 4, 4) === bg,
          y: Math.round(window.scrollY), h: document.documentElement.scrollHeight, focusIn: bg.contains(document.activeElement), held: document.documentElement.classList.contains('omega-np-open'), on: bg.classList.contains('on') };
      });
    }
    await openIt();
    var s = await state();
    ok(name + ': + New project opens a panel over the page (fixed, covering the screen, the panel inside it and over the chrome), not at the foot of the page', s.position === 'fixed' && s.display === 'flex' && s.covers && s.inView && s.overChrome, s);
    ok(name + ': opening it neither scrolls nor grows the page behind', s.y === before.y && s.h === before.h, { before: before, after: { y: s.y, h: s.h } });
    ok(name + ': focus is in the panel and the page behind is held still', s.focusIn && s.held, s);
    if (shotsAt) await p.screenshot({ path: path.join(shotsAt, name + '-new-project-' + p.viewportSize().width + '.png') });
    var vp = p.viewportSize();
    await p.mouse.click(vp.width - 4, 4); await wait(200);
    var a = await state();
    ok(name + ': a click on the backdrop closes it', !a.on && a.display === 'none', a);
    await openIt(); await p.keyboard.press('Escape'); await wait(200);
    var e = await state();
    ok(name + ': Escape closes it', !e.on && e.display === 'none', e);
    await openIt(); await p.click('#new-proj-modal .mb-cancel'); await wait(200);
    var c = await state();
    ok(name + ': Cancel closes it and hands the page back where it was', !c.on && !c.held && c.y === before.y && c.h === before.h, { before: before, after: c });
  }
  /* every signed-in visit, whichever tenant */
  async function common(p, fx, name) {
    var out = {};
    var shown = await p.evaluate(function () { return { ready: document.body.classList.contains('ready'), refused: document.body.classList.contains('refused'), boot: getComputedStyle(document.getElementById('boot')).display, terms: !!document.getElementById('ot-modal') }; });
    ok(name + ': the workspace is shown and the splash is gone', shown.ready && !shown.refused && shown.boot === 'none' && !shown.terms, shown);
    var greet = await p.$eval('#ows-greet', function (e) { return e.textContent; }).catch(function () { return ''; });
    ok(name + ': the greeting uses the person\'s first name', greet.indexOf(fx.user.displayName.split(' ')[0]) >= 0, greet);
    var co = await p.$eval('#ows-co-name', function (e) { return e.textContent; }).catch(function () { return ''; });
    ok(name + ': the switcher names the company, not its domain', co === fx.name, co);
    var product = await p.$eval('#ows-product', function (e) { return e.textContent; }).catch(function () { return ''; });
    ok(name + ': the rail wears the product name', product === 'Omega Workspace', product);
    var rail = await p.$$eval('#side-nav .sn-item', function (r) { return r.filter(function (a) { return getComputedStyle(a).display !== 'none'; }).map(function (a) { return a.querySelector('span').textContent.trim(); }); });
    ok(name + ': the rail is Home · Projects · All tools · Modules · Marketplace · Quote Desk · Team · Feed · Plan & billing · Settings', rail.join('|') === 'Home|Projects|All tools|Modules|Marketplace|Quote Desk|Team|Feed|Plan & billing|Settings', rail);
    var board = await p.evaluate(function () { function shown(id) { var e = document.getElementById(id); return !!e && getComputedStyle(e).display !== 'none'; } return { flight: shown('flight'), team: shown('team'), tools: shown('tools'), pulse: !!document.querySelector('#pulse .stats .stat'), stats: document.querySelectorAll('#pulse .stats .stat').length, spark: !!document.querySelector('#pulse .spark path'), insight: (document.querySelector('#pulse .insight') || {}).textContent || '', homeMods: Array.prototype.filter.call(document.querySelectorAll('.mod'), function (e) { return e.getClientRects().length > 0; }).length, mymods: !!document.getElementById('mymods') }; });
    ok(name + ': the module cards live on the Modules page, never on the home', board.homeMods === 0 && !board.mymods, board);
    if (shotsAt) await p.screenshot({ path: path.join(shotsAt, name + '-home-' + p.viewportSize().width + '.png'), fullPage: true });
    ok(name + ': the home shows the board (In flight and Around you with the hub) and All tools stays its own page', board.flight && board.team && !board.tools, board);
    ok(name + ': the Omega pulse draws four counts, the eight-week line and the insight from /api/pulse', board.pulse && board.stats === 4 && board.spark && /hour duration|Not enough/.test(board.insight), board);
    var hub = await p.$$eval('#hub .hx', function (r) { return r.map(function (g) { return g.getAttribute('data-hub'); }); });
    ok(name + ': the hub has Today in the centre and a ring of at most six', hub[0] === 'today' && hub.length >= 3 && hub.length <= 7, hub);
    out.hub = hub;
    var tiles = await p.$$eval('#tools-body .tool', function (r) { return r.map(function (x) { return { tool: x.getAttribute('data-tool'), locked: x.classList.contains('locked'), soon: x.classList.contains('soon') }; }); });
    ok(name + ': the tools grid is painted from the catalog', tiles.length > 30, tiles.length);
    out.tiles = tiles.length; out.locked = tiles.filter(function (t) { return t.locked; }).length;
    var plan = await p.$eval('#plan', function (e) { return e.textContent.replace(/\s+/g, ' ').trim(); }).catch(function () { return ''; });
    ok(name + ': the plan strip says how many tools are open', /\d+ of \d+ tools open/.test(plan), plan);
    /* one view at a time (2026-09-27): the home is the hub and Today; All tools is its own page */
    var views = await p.evaluate(function () { var v = function (id) { return getComputedStyle(document.getElementById(id)).display !== 'none'; }; return { view: document.getElementById('content').getAttribute('data-view'), hub: getComputedStyle(document.querySelector('#content .hero')).display !== 'none', tools: v('tools'), flight: v('flight'), team: v('team') }; });
    ok(name + ': the home is the hub and Today with the board (In flight, Around you) and never the catalog pages', views.view === 'home' && views.hub && !views.tools && views.flight && views.team, views);
    await p.evaluate(function () { window.location.hash = '#tools'; }); await wait(200);
    views = await p.evaluate(function () { var v = function (id) { return getComputedStyle(document.getElementById(id)).display !== 'none'; }; return { view: document.getElementById('content').getAttribute('data-view'), hub: getComputedStyle(document.querySelector('#content .hero')).display !== 'none', tools: v('tools'), flight: v('flight'), rail: (document.querySelector('#side-nav .sn-item.active') || {}).getAttribute && document.querySelector('#side-nav .sn-item.active').getAttribute('data-key') }; });
    ok(name + ': #tools opens All tools as its own page and marks it on the rail', views.view === 'tools' && views.tools && !views.hub && !views.flight && views.rail === 'tools', views);
    /* condensed on a phone (2026-09-27): a tool is one short row, the catalog fits in a few screens */
    var vp0 = p.viewportSize(); await p.setViewportSize({ width: 390, height: 844 }); await wait(200);
    var row = await p.$eval('#tools-body .tool', function (e) { var r = e.getBoundingClientRect(); return { h: r.height, w: r.width, desc: getComputedStyle(e.querySelector('.d')).display, dir: getComputedStyle(e).flexDirection }; });
    ok(name + ': on a phone a tool is one compact row', row.h < 64 && row.w > 300 && row.desc === 'none' && row.dir === 'row', row);
    await p.setViewportSize(vp0); await wait(150);
    await p.click('#tools .back'); await wait(150);
    var back = await p.evaluate(function () { return { view: document.getElementById('content').getAttribute('data-view'), hash: window.location.hash }; });
    ok(name + ': Home brings the hub back and clears the hash', back.view === 'home' && back.hash === '', back);
    out.plan = plan.slice(0, 80);
    return out;
  }
  function expectedRing(ws, extra) {
    var TOOLS = require('../omega-tools.js');
    var c = { canOpen: function (k) { var t = TOOLS.byKey(k); return !!t && !ws.pendingApproval && TOOLS.isUnlocked(t, ws); }, tool: function (k) { return TOOLS.byKey(k); }, modules: ws.modules || [], addons: ws.addons || [], hideMarketplace: false };
    return ['today'].concat(HUB.compose(c).ring.map(function (a) { return a.key; }));
  }

  /* ══ 1. NEWCO — first visit, terms first ══ */
  var newco = FX.newco(HOST);
  await scenario('newco', newco, { steps: async function (p) {
    var out = {};
    var terms = await p.waitForFunction(function () { return !!document.getElementById('ot-modal'); }, null, { timeout: 4000 }).then(function () { return true; }, function () { return false; });
    ok('newco: a first visit is met by the terms modal', terms);
    if (terms) {
      await p.$eval('#ot-body', function (b) { b.scrollTop = b.scrollHeight; }).catch(function () {}); await wait(150);
      await p.click('#ot-accept').catch(function () {}); await wait(900);
      var rec = await p.evaluate(function () { return window.__firebaseDouble.store.log.filter(function (w) { return /^termsAcceptances\//.test(w.path); }).map(function (w) { return w.data.version; }); });
      ok('newco: accepting records the current version once', rec.length === 1 && rec[0] === FX.TERMS_VERSION, rec);
    }
    await wait(800);
    Object.assign(out, await common(p, newco, 'newco'));
    ok('newco: nothing is locked on a trial', out.locked === 0, out.locked);
    var empty = await p.$eval('#flight-body', function (e) { return e.textContent; });
    ok('newco: an empty workspace says so in In flight', /No projects yet/.test(empty), empty.slice(0, 60));
    /* + New project opens the one dialog and closes again (In flight is its own page) */
    await p.evaluate(function () { window.location.hash = '#flight'; }); await wait(150);
    ok('newco: #flight opens In flight as its own page', await p.evaluate(function () { return document.getElementById('content').getAttribute('data-view') === 'flight'; }));
    await newProjectPanel(p, 'newco');
    /* Customize: a toggle saves to the person's own layout record only */
    await p.evaluate(function () { window.location.hash = '#team'; }); await wait(150);
    await p.click('#customize'); await wait(250);
    await p.click('.tg[data-opt="guides"]'); await wait(900);
    var saved = await p.evaluate(function () { return window.__firebaseDouble.store.log.filter(function (w) { return /^dashboard_layouts\//.test(w.path); }).map(function (w) { return { path: w.path, guides: w.data.workspace && w.data.workspace.guides }; }); });
    ok('newco: a Customize toggle writes dashboard_layouts/{org}__{uid}.workspace', saved.length === 1 && saved[0].path === 'dashboard_layouts/' + newco.org + '__' + newco.user.uid && saved[0].guides === true, saved);
    var guides = await p.evaluate(function () { return document.body.innerText.indexOf('Guides') >= 0; });
    ok('newco: the Guides panel appears when switched on', guides);
    await p.keyboard.press('Escape'); await wait(200);
    return out;
  } });

  /* ══ 2. NORTHSTAR — Standard, data, a locked Enterprise tool ══ */
  var ns = FX.northstar(HOST);
  await scenario('northstar', ns, { steps: async function (p) {
    var out = await common(p, ns, 'northstar');
    var wsNow = await p.evaluate(function () { var w = window.OMEGA_WORKSPACE; return { tierLevel: w.tierLevel, toolAccess: w.toolAccess || null, modules: w.modules || null, addons: w.addons || null, packaged: !!w.packaged, pendingApproval: !!w.pendingApproval, toolOverrides: w.toolOverrides || null, unlockedTools: w.unlockedTools || null, requiredTools: w.requiredTools || null }; });
    var want = expectedRing(wsNow);
    ok('northstar: the ring is exactly what omega-workspace-hub composes for this workspace', out.hub.join() === want.join(), { got: out.hub, want: want });
    ok('northstar: Site Investment Analysis (Enterprise) is locked on Standard', await p.$('#tools-body .tool.locked[data-tool="investment"]') !== null);
    ok('northstar: Site Map is live', await p.$('#tools-body .tool.live[data-tool="editor"]') !== null);
    await p.evaluate(function () { window.location.hash = '#modules'; }); await wait(200);
    await p.waitForFunction(function () { return document.querySelectorAll('#modules-body .mod').length > 5; }, null, { timeout: 4000 }).catch(function () {});
    var legacyMods = await p.evaluate(function () { return { cards: document.querySelectorAll('#modules-body .mod').length, live: document.querySelectorAll('#modules-body .mod[data-held="1"]').length, part: document.querySelectorAll('#modules-body .mod[data-held="part"]').length, ask: Array.prototype.map.call(document.querySelectorAll('#modules-body [data-ask-module]'), function (a) { return a.textContent.trim(); }), add: document.querySelectorAll('#modules-body [data-add-module]').length, priced: Array.prototype.filter.call(document.querySelectorAll('#modules-body .mod.off .price'), function (e) { return /\$\d/.test(e.textContent); }).length, sub: document.getElementById('modules-sub').textContent }; });
    ok('northstar: a legacy plan\'s Modules page lists every module, Live where the tier holds it, priced with Add to plan where it does not, and never the packaged + Add', legacyMods.cards === M.catalog().length && legacyMods.live > 0 && legacyMods.live < legacyMods.cards && legacyMods.add === 0 && legacyMods.ask.length === legacyMods.cards - legacyMods.live && legacyMods.ask.every(function (t) { return t === 'Add to plan'; }) && legacyMods.priced === legacyMods.cards - legacyMods.live && /holds \d+ of \d+ modules/.test(legacyMods.sub), legacyMods);
    await modulesFit(p, 'northstar');
    ok('northstar: Lite has no opt-out, optional held modules do', await p.locator('#modules-body [data-remove-module="lite"]').count() === 0 && await p.locator('#modules-body [data-remove-module]').count() === legacyMods.live + legacyMods.part - 1);
    await p.locator('#modules-body [data-remove-module]').first().click();
    await p.locator('#omega-package-menu').getByRole('button', { name: 'Opt out', exact: true }).click();
    var legacyOut = await p.locator('#omega-package-menu').textContent();
    ok('northstar: legacy opt-out discloses existing billing and makes an email request without pretending to cancel', /billed outside the package engine/.test(legacyOut) && /does not change access, cancel charges or issue a refund/.test(legacyOut) && /^mailto:/.test(await p.locator('#omega-package-menu a').getAttribute('href')));
    await p.keyboard.press('Escape');
    /* Add to plan on Storage: sold on Standard now, exactly (the editor opens
       its own Analyze and Estimate commands, never the whole tab: omega-caps
       addOnOpens), so the server's price and Pay, never the request */
    STORE.posts = [];
    await p.click('#modules-body [data-ask-module="storage"]'); await wait(300);
    await p.locator('.ows-drawer [data-addon="storage"] button', { hasText: 'Add to plan' }).click(); await wait(500);
    var exactly = await p.evaluate(function () { var h = document.querySelector('.ows-drawer [data-addon="storage"]'); return { text: h ? h.textContent.replace(/\s+/g, ' ') : '', buttons: h ? Array.prototype.map.call(h.querySelectorAll('button'), function (b) { return b.textContent.trim(); }) : [] }; });
    ok('northstar: Add to plan on Storage is the server\'s price and Pay, on Standard too (its Site Map commands open with it, exactly)', /^\$[\d,]+ today/.test(exactly.text) && /^Pay \$[\d,]+ now$/.test(exactly.buttons[0] || '') && exactly.buttons.indexOf('Ask ClearSky to include it') < 0, exactly);
    await p.locator('.ows-drawer [data-addon="storage"] button', { hasText: 'Cancel' }).click(); await wait(200);
    await p.keyboard.press('Escape'); await wait(200);
    /* what still cannot be switched on beside the plan (the storefront, set up
       with ClearSky): the server's reason and the recorded request, never a price */
    await p.click('#modules-body [data-ask-module="whitelabel"]'); await wait(300);
    await p.locator('.ows-drawer [data-addon="whitelabel"] button', { hasText: 'Add to plan' }).click(); await wait(500);
    var notExact = await p.evaluate(function () { var h = document.querySelector('.ows-drawer [data-addon="whitelabel"]'); return { text: h ? h.textContent.replace(/\s+/g, ' ') : '', buttons: h ? Array.prototype.map.call(h.querySelectorAll('button'), function (b) { return b.textContent.trim(); }) : [] }; });
    ok('northstar: Add to plan on the storefront says in the server\'s words why it cannot be added alone, and offers the recorded request, never a price to pay', /^Omega Storefront is set up with ClearSky, so it cannot be added here on its own\./.test(notExact.text) && !/Pay \$/.test(notExact.text) && notExact.buttons.join() === 'Ask ClearSky to include it,Close', notExact);
    if (shotsAt) await p.screenshot({ path: path.join(shotsAt, 'legacy-not-exact.png') });
    await p.locator('.ows-drawer [data-addon="whitelabel"] button', { hasText: 'Ask ClearSky to include it' }).click(); await wait(400);
    var asked = await p.$eval('.ows-drawer [data-addon="whitelabel"]', function (e) { return e.textContent.replace(/\s+/g, ' '); });
    ok('northstar: the request goes on record with its price and nothing is charged', /^Requested: Omega Storefront at \$[\d,]+\/month\. ClearSky has it; nothing is charged\./.test(asked) && STORE.posts.map(function (x) { return x.action; }).join() === 'addon-quote,addon-quote,opt-in', { asked: asked, posts: STORE.posts.map(function (x) { return x.action; }) });
    await p.keyboard.press('Escape'); await wait(200);
    await p.evaluate(function () { window.location.hash = ''; }); await wait(250);
    var cards = await p.$$eval('#flight-body .pc', function (r) { return r.map(function (x) { return x.querySelector('b').textContent + '|' + (x.querySelector('.why') ? x.querySelector('.why').textContent : '') + '|' + (x.querySelector('.who .nm') ? x.querySelector('.who .nm').textContent : '') + '|' + (x.querySelector('.fin') ? x.querySelector('.fin').textContent : ''); }); });
    ok('northstar: In flight is the board: the three projects with a next action (Maple carrying its deal in review at ClearSky), then Quarry Road untouched and unassigned; Old Mill, online, is off it',
      cards.length === 4 && cards.slice(0, 3).every(function (c) { return /\|Next: Review\|/.test(c) || /in review for 9 days\|/.test(c); }) && /^Maple Yard Storage\|.*\|Finance marketplace · In review at ClearSky$/.test(cards.filter(function (c) { return /^Maple/.test(c); })[0]) && /^Quarry Road\|No battery size yet\|Unassigned\|$/.test(cards[3]), cards);
    var cardFace = await p.evaluate(function () { var c = document.querySelector('#flight-body .pc'), cs = getComputedStyle(c), pill = document.querySelector('#flight-body .pc[data-proj="p-quarry"] .who .ows-pill'), ps = getComputedStyle(pill); return { bg: cs.backgroundColor, border: cs.borderTopWidth, pillBg: ps.backgroundColor, pillBorder: ps.borderTopWidth, pillText: pill.textContent }; });
    ok('northstar: a project card has a ground and a border, and its Assign pill is a visible button (the shell reset no longer strips them)', cardFace.bg !== 'rgba(0, 0, 0, 0)' && cardFace.border !== '0px' && cardFace.pillBg !== 'rgba(0, 0, 0, 0)' && cardFace.pillBorder !== '0px', cardFace);
    /* Assign: Quarry Road to Raj, one merge on the project, the card follows */
    await p.click('#flight-body .pc[data-proj="p-quarry"] [data-assign]'); await wait(250);
    var assignRows = await p.$$eval('.ows-drawer .ows-row', function (r) { return r.map(function (x) { return x.querySelector('b').textContent; }); });
    ok('northstar: Assign lists the workspace\'s people', assignRows.length === 2 && /Ann Lee \(you\)/.test(assignRows.join('|')) && /Raj Patel/.test(assignRows.join('|')), assignRows);
    await p.click('.ows-drawer .ows-row[data-row="to:raj@northstar.example"]'); await wait(400);
    var assigned = await p.evaluate(function () { var w = window.__firebaseDouble.store.log.filter(function (x) { return /^projects\//.test(x.path); }); var c = document.querySelector('#flight-body .pc[data-proj="p-quarry"] .who .nm'); return { writes: w.map(function (x) { return x.op + ' ' + x.path + ' ' + Object.keys(x.data).sort().join(','); }), card: c ? c.textContent : '' }; });
    ok('northstar: assigning writes one merge of the owner fields onto the project and the card names Raj', assigned.writes.length === 1 && /^set projects\/p-quarry assignedAt,assignedBy,ownerEmail,ownerName,updatedAt$/.test(assigned.writes[0]) && assigned.card === 'Raj Patel', assigned);
    var kpi = await p.$$eval('#today .kpi .v', function (r) { return r.map(function (x) { return x.textContent; }); });
    var labels = await p.$$eval('#today .kpi', function (r) { return r.map(function (x) { return x.querySelector('.l').textContent + '=' + x.querySelector('.v').textContent + (x.querySelector('.d') ? ' (' + x.querySelector('.d').textContent + ')' : ''); }); });
    ok('northstar: the numbers are 3 in flight (package through construction), the pipeline capex with the online site apart, and 1 quote back of 2 sent', kpi[0] === '3' && /\$\d/.test(kpi[2]) && /online/.test(labels[2]) && labels[3] === 'Quotes back=1 (of 2 sent)', labels);
    var needs = await p.$$eval('#today .next .row', function (r) { return r.map(function (x) { return x.getAttribute('data-key').split(':')[0] + ':' + x.querySelector('b').textContent; }); });
    ok('northstar: Needs you leads with the vendor who answered Riverside (a decision waiting), then Ann\'s to-do due in three days, then the projects with a next action, then the deal in review at ClearSky for nine days', /^quotes:1 vendor answered your Riverside BESS request/.test(needs[0]) && /^todo:Send the Riverside one-line/.test(needs[1]) && needs.slice(2, 5).every(function (n) { return /^next:/.test(n); }) && /^review:Maple Yard Storage has been in review for 9 days/.test(needs[5]), needs);
    var rowAct = await p.evaluate(function () { var r = document.querySelector('#today .next .row[data-key^="review:"]'); return { cursor: getComputedStyle(r).cursor, pill: r.querySelector('a.ows-pill, button.ows-pill') ? getComputedStyle(r.querySelector('a.ows-pill, button.ows-pill')).backgroundColor : '' }; });
    ok('northstar: a Needs-you row is a target (pointer) and its pill is painted', rowAct.cursor === 'pointer' && rowAct.pill !== 'rgba(0, 0, 0, 0)', rowAct);
    out.needs = needs;
    var people = await p.evaluate(function () { var panels = document.querySelectorAll('#around .panel'); for (var i = 0; i < panels.length; i++) { var h = panels[i].querySelector('h3'); if (h && h.textContent === 'People') return panels[i].querySelectorAll('.people .pr').length; } return 0; });
    var feed = await p.$eval('#feed', function (e) { return e.textContent; });
    ok('northstar: People lists both teammates and the feed carries Raj\'s message', people === 2 && /interconnection study came back clean/.test(feed), { people: people });
    /* the side panel from a hub cell */
    await p.evaluate(function () { window.location.hash = ''; }); await wait(150);
    await p.click('#hub .hx[data-hub="design"]'); await wait(300);
    var drawer = await p.$eval('.ows-drawer', function (e) { return { title: e.querySelector('h2').textContent, rows: e.querySelectorAll('.ows-row').length, locked: e.querySelectorAll('.ows-row.locked').length }; }).catch(function () { return null; });
    ok('northstar: a hub cell opens the side panel with the area\'s tools, Deluxe ones locked', drawer && /Design/.test(drawer.title) && drawer.rows >= 4 && drawer.locked >= 1, drawer);
    await p.keyboard.press('Escape'); await wait(200);
    ok('northstar: Escape closes it', (await p.$('.ows-drawer')) === null);
    /* every hex opens the side panel, never a spot on the page (2026-09-27) */
    for (var hx of [['today', /Today/], ['projects', /Projects/], ['team', /Team/]]) {
      await p.click('#hub .hx[data-hub="' + hx[0] + '"]'); await wait(300);
      var hd = await p.evaluate(function () { var d = document.querySelector('.ows-drawer'); return { title: d ? d.querySelector('h2').textContent : '', view: document.getElementById('content').getAttribute('data-view') }; });
      ok('northstar: the ' + hx[0] + ' hex opens the side panel and stays on the home', hx[1].test(hd.title) && hd.view === 'home', hd);
      await p.keyboard.press('Escape'); await wait(150);
    }
    /* a locked tile explains instead of opening (locked tiles fold under a per-category line) */
    await p.evaluate(function () { window.location.hash = '#tools'; }); await wait(150);
    await p.$$eval('#tools-body details', function (d) { d.forEach(function (x) { x.open = true; }); }); await wait(100);
    await p.click('#tools-body .tool.locked[data-tool="investment"]'); await wait(250);
    var why = await p.$eval('.ows-drawer', function (e) { return e.textContent.replace(/\s+/g, ' '); }).catch(function () { return ''; });
    ok('northstar: a locked tile says which plan carries it and offers the Marketplace', /Enterprise/.test(why) && /Marketplace/.test(why), why.slice(0, 160));
    await p.keyboard.press('Escape'); await wait(150);
    /* Plan & billing from the rail: a page with the subscription, what is owed and when, the card, the history */
    await p.click('#side-nav .sn-item[data-key="billing"]'); await wait(600);
    await p.waitForFunction(function () { return /NS-0001/.test((document.getElementById('billing-body') || {}).textContent || ''); }, null, { timeout: 4000 }).catch(function () {});
    var bill = await p.evaluate(function () { var v = document.getElementById('content').getAttribute('data-view'), t = document.getElementById('billing-body').textContent.replace(/\s+/g, ' '); return { view: v, text: t, cards: Array.prototype.map.call(document.querySelectorAll('#billing-body .bcard h3'), function (h) { return h.firstChild.textContent; }), portal: !!document.getElementById('bill-portal'), stripeLinks: document.querySelectorAll('#bill-hist a[href^="https://invoice.stripe.com/"]').length, cardInputs: document.querySelectorAll('#billing-body input').length }; });
    ok('northstar: Plan & billing is a page: the subscription, what you owe, the payment method and the history', bill.view === 'billing' && bill.cards.join('|') === 'Your subscription|What you owe|Payment method|Billing history', bill.cards);
    ok('northstar: a Stripe-billed plan says the card lives with Stripe, offers the portal, and says nothing is owed with the next payment date', bill.portal && /Stripe/.test(bill.text) && /nothing is owed/.test(bill.text) && /Next invoice/.test(bill.text) && /Standard/.test(bill.text), bill.text.slice(0, 300));
    ok('northstar: the billing history lists what Stripe billed, each with its invoice page', /NS-0002/.test(bill.text) && /NS-0001/.test(bill.text) && bill.stripeLinks === 2, { links: bill.stripeLinks, text: bill.text.slice(-200) });
    /* the portal: an owner opens Stripe's own page in a new tab; no card field is ever on this page */
    await p.evaluate(function () { window.__opened = []; window.open = function (u) { window.__opened.push(String(u)); return null; }; });
    await p.click('#bill-portal'); await wait(400);
    var opened = await p.evaluate(function () { return window.__opened; });
    ok('northstar: Manage card and autopay opens the Stripe portal (Stripe\'s own page) in a new tab, and the page itself has no card field', opened.length === 1 && /^https:\/\/billing\.stripe\.com\//.test(opened[0]) && bill.cardInputs === 0, { opened: opened, inputs: bill.cardInputs });
    await p.evaluate(function () { window.location.hash = ''; }); await wait(200);
    /* post a message */
    await p.evaluate(function () { window.location.hash = '#team'; }); await wait(150);
    ok('northstar: #team opens Around you as its own page', await p.evaluate(function () { return document.getElementById('content').getAttribute('data-view') === 'team' && getComputedStyle(document.getElementById('team')).display !== 'none'; }));
    await p.fill('#post-text', 'Geotech booked for Maple Yard'); await p.click('#post button[type="submit"]'); await wait(500);
    var posted = await p.evaluate(function () { return window.__firebaseDouble.store.log.filter(function (w) { return /^team_messages\//.test(w.path); }).map(function (w) { return w.data.authorEmail + ':' + w.data.text; }); });
    ok('northstar: a post writes one team_messages document as the signed-in person', posted.length === 1 && posted[0] === ns.user.email + ':Geotech booked for Maple Yard', posted);
    return out;
  }, after: async function (p, ctx, mute) {
    var nav = p.waitForNavigation({ timeout: 4000 }).then(function () { return p.url(); }, function () { return p.url(); });
    await p.click('#ows-signout'); var url = await nav; mute();
    ok('northstar: Sign out ends the session and goes to /login.html', /\/login\.html$/.test(url), url);
    return { afterSignOut: url.replace(/^https?:\/\/[^/]+/, '') };
  } });

  /* ══ 3. NORTHSTAR ON A PHONE ══ */
  await scenario('northstar-phone', FX.northstar(HOST), { phone: true, steps: async function (p) {
    var out = await common(p, ns, 'northstar-phone');
    var burger = await p.$eval('#ows-burger', function (b) { var r = b.getBoundingClientRect(); return r.width > 0 && getComputedStyle(b).display !== 'none'; }).catch(function () { return false; });
    ok('northstar-phone: the topbar has a menu button', burger);
    await p.tap('#ows-burger').catch(function () { return p.click('#ows-burger'); }); await wait(350);
    var open = await p.evaluate(function () { var r = document.getElementById('side-nav').getBoundingClientRect(); return { open: document.body.classList.contains('ows-rail-open'), onScreen: r.left >= -1 && r.width > 200 }; });
    ok('northstar-phone: the rail slides in as a drawer', open.open && open.onScreen, open);
    if (shotsAt) await p.screenshot({ path: path.join(shotsAt, 'northstar-phone-rail.png') });
    await p.keyboard.press('Escape'); await wait(250);
    ok('northstar-phone: Escape closes it', !(await p.evaluate(function () { return document.body.classList.contains('ows-rail-open'); })));
    var tabs = await p.$$eval('.ows-tabs a', function (r) { return r.filter(function (a) { return a.getBoundingClientRect().height > 0; }).map(function (a) { var t = ''; Array.prototype.forEach.call(a.childNodes, function (n) { if (n.nodeType === 3) t += n.textContent; }); return t.trim(); }); });
    ok('northstar-phone: the tab bar is Home · Projects · Tools · Team · Me', tabs.join('|') === 'Home|Projects|Tools|Team|Me', tabs);
    var hubW = await p.$eval('#hub svg', function (s) { var r = s.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; });
    ok('northstar-phone: the hub draws at phone width', hubW.w > 280 && hubW.h > 200, hubW);
    await newProjectPanel(p, 'northstar-phone');
    await p.click('#new-project'); await wait(350);
    var sheet = await p.evaluate(function () { var r = document.querySelector('#new-proj-modal .modal').getBoundingClientRect(), inp = getComputedStyle(document.getElementById('np-name')); return { bottom: Math.round(r.bottom), vh: window.innerHeight, width: Math.round(r.width), vw: window.innerWidth, font: parseFloat(inp.fontSize) }; });
    ok('northstar-phone: on a phone the panel is a bottom sheet, full width, with 16px inputs (smaller ones make iOS zoom the page)', Math.abs(sheet.bottom - sheet.vh) <= 1 && sheet.width === sheet.vw && sheet.font >= 16, sheet);
    await p.keyboard.press('Escape'); await wait(200);
    return out;
  } });

  /* ══ 3b. VIEW AS A CUSTOMER — a staff member paints the workspace as a Lite customer ══ */
  STAFF_CALLER = true;
  await scenario('viewas', ns, { url: '/workspace?viewas=lite', steps: async function (p) {
    await p.waitForFunction(function () { return window.OMEGA_WORKSPACE && window.OMEGA_WORKSPACE.viewAs; }, null, { timeout: 6000 }).catch(function () {});
    var va = await p.evaluate(function () { var w = window.OMEGA_WORKSPACE; return { viewAs: w.viewAs, packaged: w.packaged, modules: w.modules, orgId: w.orgId, notice: (document.getElementById('ows-notice') || {}).textContent || '', plan: document.getElementById('plan').textContent.replace(/\s+/g, ' ') }; });
    ok('viewas: the workspace paints as a packaged Lite customer, scope unchanged', va.viewAs === 'lite' && va.packaged && va.modules.join() === 'lite' && va.orgId === ns.org, va);
    ok('viewas: a banner says it is a staff preview with an Exit', /Viewing as a customer/.test(va.notice) && /Exit/.test(va.notice), va.notice.slice(0, 80));
    ok('viewas: the plan strip reads Lite with fewer tools open', /Lite/.test(va.plan) && /\d+ of \d+ tools open/.test(va.plan), va.plan);
    ok('viewas: Site Investment Analysis is locked as it is for a Lite customer', await p.$('#tools-body .tool.locked[data-tool="investment"]') !== null);
    await p.evaluate(function () { window.location.hash = '#modules'; }); await wait(400);
    var vm = await p.evaluate(function () { return { cards: document.querySelectorAll('#modules-body .mod').length, add: document.querySelectorAll('#modules-body [data-add-module]').length, live: document.querySelectorAll('#modules-body .mod[data-held="1"]').length }; });
    ok('viewas: the Modules page shows the customer\'s view: Lite Live, the rest to add', vm.cards === M.catalog().length && vm.live === 1 && vm.add === vm.cards - 1, vm);
    ok('viewas: nothing was written', !(await p.evaluate(function () { return window.__firebaseDouble.store.log.some(function (w) { return /^omega_orgs\//.test(w.path); }); })));
    return {};
  }, after: async function (p, ctx, mute) {
    /* Exit really leaves: /workspace#view links change the view in place, but this one must drop ?viewas= */
    var nav = p.waitForNavigation({ timeout: 4000 }).then(function () { return p.url(); }, function () { return p.url(); });
    await p.click('#ows-notice a[data-leave]'); var url = await nav; mute();
    ok('viewas: Exit leaves the preview (a real visit, without ?viewas=)', !/viewas=/.test(url), url);
    return { afterExit: url.replace(/^https?:\/\/[^/]+/, '') };
  } });
  STAFF_CALLER = false;

  /* ══ 4. PENDING — not yet approved ══ */
  var pend = FX.pending(HOST);
  await scenario('pending', pend, { steps: async function (p) {
    var out = await common(p, pend, 'pending');
    var notice = await p.$eval('#ows-notice', function (e) { return e.hidden ? '' : e.textContent; });
    ok('pending: the awaiting-approval notice is shown and names the workspace', /Awaiting approval/.test(notice) && /Pendingco/.test(notice), notice.slice(0, 120));
    ok('pending: every tool is locked until approval', out.locked === out.tiles - (await p.$$eval('#tools-body .tool.soon', function (r) { return r.length; })), { locked: out.locked, tiles: out.tiles });
    ok('pending: the ring holds only the always-on areas', out.hub.join() === 'today,projects,market,team', out.hub);
    var needs = await p.$eval('#today .next', function (e) { return e.textContent; });
    ok('pending: Needs you leads with approval', /awaiting approval/.test(needs), needs.slice(0, 80));
    return out;
  } });

  /* ══ 5. LITE LABS — packaged, Lite alone ══ */
  var lt = FX.lite(HOST);
  await scenario('lite', lt, { steps: async function (p) {
    await p.evaluate(function () { window.location.hash = '#billing'; });
    await p.waitForFunction(function () { return /2026-09-20/.test((document.getElementById('bill-hist') || {}).textContent || ''); }, null, { timeout: 5000 }).catch(function () {});
    var lb = await p.evaluate(function () { var t = function (id) { var e = document.getElementById(id); return e ? e.textContent.replace(/\s+/g, ' ') : ''; }; return { sub: t('bill-sub'), owe: t('bill-owe'), card: t('bill-card'), hist: t('bill-hist'), inputs: document.querySelectorAll('#billing-body input').length, paid: !!document.getElementById('bill-paid') }; });
    ok('lite: Plan & billing shows the package (Lite, $149 a month, billed on the 20th), nothing owed with the next invoice, the card on QuickBooks\' own page, the paid invoice, and no card field', /Lite/.test(lb.sub) && /\$149/.test(lb.sub) && /20th/.test(lb.sub) && /nothing is owed/.test(lb.owe) && /Next invoice/.test(lb.owe) && lb.paid && /QuickBooks Payments/.test(lb.card) && /Save this card/.test(lb.card) && /2026-09-20/.test(lb.hist) && /\$500/.test(lb.hist) && lb.inputs === 0, lb);
    /* the same package on the Stripe rail (PACKAGING_PROVIDER=stripe): "I've paid" re-asks the engine, which now says Stripe */
    STUB_PROVIDER = 'stripe';
    await p.click('#bill-paid');
    await p.waitForFunction(function () { return /Stripe/.test((document.getElementById('bill-card') || {}).textContent || ''); }, null, { timeout: 5000 }).catch(function () {});
    var sb = await p.evaluate(function () { var t = function (id) { var e = document.getElementById(id); return e ? e.textContent.replace(/\s+/g, ' ') : ''; }; var a = document.querySelector('#bill-owe a[href*="invoice.stripe.com"]'); return { card: t('bill-card'), owe: t('bill-owe'), pay: a ? a.getAttribute('href') : '', portal: (document.getElementById('bill-portal') || {}).textContent || '', inputs: document.querySelectorAll('#billing-body input').length }; });
    ok('lite on Stripe: Plan & billing names Stripe as the rail, the card on Stripe\'s own page, the open invoice paid on invoice.stripe.com, never a card field and never QuickBooks', /Stripe’s secure invoice page/.test(sb.card) && /Manage card and invoices/.test(sb.portal) && /pay it by card on Stripe/.test(sb.owe) && /^https:\/\/invoice\.stripe\.com\//.test(sb.pay) && !/QuickBooks/.test(sb.card + sb.owe) && sb.inputs === 0, sb);
    if (shotsAt) await p.screenshot({ path: path.join(shotsAt, 'lite-billing-stripe-1366.png'), fullPage: true });
    STUB_PROVIDER = null;
    await p.evaluate(function () { window.location.hash = ''; }); await wait(300);
    var out = await common(p, lt, 'lite');
    var tiles = await p.$$eval('#tools-body .tool', function (r) { return r.map(function (x) { return { tool: x.getAttribute('data-tool'), locked: x.classList.contains('locked'), soon: x.classList.contains('soon') }; }); });
    var wrong = tiles.filter(function (t) { return !t.soon && (lt.liteTools.indexOf(t.tool) >= 0) === t.locked; });
    ok('lite: every tool outside Lite is locked and every Lite tool is open (' + tiles.length + ' tiles)', tiles.length > 0 && !wrong.length, wrong);
    var wsNow = await p.evaluate(function () { var w = window.OMEGA_WORKSPACE; return { packaged: !!w.packaged, packageAccess: w.packageAccess, modules: w.modules, toolAccess: w.toolAccess, orgId: w.orgId }; });
    ok('lite: the ring is composed from Lite\'s tools alone', out.hub.join() === expectedRing(wsNow).join(), { got: out.hub, want: expectedRing(wsNow) });
    ok('lite: the plan strip names Lite', /Lite/.test(out.plan), out.plan);
    var folded = await p.$$eval('#tools-body details', function (d) { return { n: d.length, closed: d.filter(function (x) { return !x.open; }).length }; });
    ok('lite: locked tools fold under a per-category line and stay out of the way', folded.n >= 5 && folded.closed >= 4, folded);
    var co = await p.$eval('#ows-co-sub', function (e) { return e.textContent; });
    ok('lite: the switcher says Lite, the same word as the plan strip', /Lite/.test(co), co);
    await p.evaluate(function () { window.location.hash = '#tools'; }); await wait(150);
    await p.$$eval('#tools-body details', function (d) { d.forEach(function (x) { x.open = true; }); }); await wait(100);
    await p.click('#tools-body .tool.locked[data-tool="gridatlas"]'); await wait(250);
    var why = await p.$eval('.ows-drawer', function (e) { return e.textContent.replace(/\s+/g, ' '); }).catch(function () { return ''; });
    ok('lite: a locked tile names the module that carries it', /Omega Grid/.test(why) && /part of/.test(why), why.slice(0, 160));
    await p.keyboard.press('Escape');
    /* the Modules page (2026-09-27): the Ladder as a page of the workspace */
    await p.evaluate(function () { window.location.hash = '#modules'; }); await wait(400);
    var mods = await p.evaluate(function () { return { view: document.getElementById('content').getAttribute('data-view'), cards: Array.prototype.map.call(document.querySelectorAll('#modules-body .mod'), function (c) { return { key: c.getAttribute('data-module'), held: c.getAttribute('data-held'), price: (c.querySelector('.price') || {}).textContent || '', add: !!c.querySelector('[data-add-module]') }; }), change: (document.querySelector('#plan a.ows-pill') || {}).getAttribute && document.querySelector('#plan a.ows-pill').getAttribute('href') }; });
    ok('lite: #modules is its own page with one card per catalog module', mods.view === 'modules' && mods.cards.length === M.catalog().length, { view: mods.view, n: mods.cards.length });
    ok('lite: Lite is Live and Grid Atlas carries the server\'s price and + Add', mods.cards.some(function (c) { return c.key === 'lite' && c.held === '1' && !c.add; }) && mods.cards.some(function (c) { return c.key === 'gridatlas' && c.held === '0' && /\$\d/.test(c.price) && c.add; }), mods.cards.filter(function (c) { return c.key === 'lite' || c.key === 'gridatlas'; }));
    await modulesFit(p, 'lite');
    ok('lite: Change plan on the plan strip opens the Modules page', mods.change === '/workspace#modules', mods.change);
    if (shotsAt) { var vpm = p.viewportSize(); await p.setViewportSize({ width: 390, height: 844 }); await wait(200); await p.screenshot({ path: path.join(shotsAt, 'lite-modules-390.png') }); await p.setViewportSize(vpm); await wait(150); }
    await p.click('#modules-body [data-add-module="gridatlas"]'); await wait(400);
    var menu = await p.evaluate(function () { var d = document.getElementById('omega-package-menu'); return { open: !!d, focus: d ? (d.querySelector('[data-module-card][data-selected]') || {}).getAttribute && d.querySelector('[data-module-card][data-selected]').getAttribute('data-module-card') : null }; });
    ok('lite: + Add opens the one package menu on that module', menu.open && menu.focus === 'gridatlas', menu);
    await p.keyboard.press('Escape'); await wait(150);
    ok('lite: the page asked /api/package-access and nothing it does not answer', apiCalls.some(function (c) { return /package-access/.test(c); }) && !missing.length, { calls: apiCalls, missing: missing });
    return out;
  } });

  await scenario('legacy-enterprise-opt-out', FX.legacyEnterprise(HOST), { url: '/workspace#modules', steps: async function (p) {
    await p.waitForFunction(function () { return document.querySelectorAll('#modules-body [data-remove-module]').length > 5; });
    await modulesFit(p, 'legacy Enterprise');
    /* every module it holds, bar Lite; Omega Storefront is not among them:
       the public storefront opens only where the tenant record or the add-on
       switches it on (api/_lib/embed.js), never on the tier, and this
       tenant has neither */
    ok('legacy Enterprise: every optional module it holds has an opt-out, Lite never does', await p.locator('#modules-body [data-remove-module]').count() === M.catalog().length - 2 && await p.locator('#modules-body [data-remove-module="lite"]').count() === 0 && await p.locator('#modules-body [data-remove-module="whitelabel"]').count() === 0);
    await p.locator('#modules-body [data-remove-module="logic-office"]').click();
    await p.locator('#omega-package-menu').getByRole('button', { name: 'Opt out', exact: true }).click();
    var link = p.locator('#omega-package-menu a'), draft = decodeURIComponent(await link.getAttribute('href'));
    ok('legacy Enterprise: Office request names every dependent department and preserves the existing agreement', M.catalog().filter(function (m) { return m.shelf === 'platform'; }).every(function (m) { return draft.indexOf(m.name) >= 0; }) && /existing agreement/.test(draft) && /Omega Design remains included/.test(draft));
    await p.keyboard.press('Escape');
    ok('legacy Enterprise: the request can be dismissed without sending', await p.locator('#omega-package-menu').count() === 0);
    return {};
  } });

  /* ══ 5b. ADD TO PLAN — a legacy Enterprise plan without Omega Logic buys
     Office (Tommy, 2026-09-27: "buy them immediately and not email clearsky
     … add to plan and then charge their credit card or saved payment
     method"). The server's quote, QuickBooks' page opened on the click, the
     control waiting with the pay link and I've paid, then Office Live and
     Omega Logic on the rail; never a mail to ClearSky. ══ */
  var la = FX.legacyEnterprise(HOST), laBill = 'omega_orgs/' + la.org + '/billing/current';
  la.docs[laBill].addons = []; ADDON.paid = false; ADDON.entry = null; STORE.posts = [];
  await scenario('legacy-add', la, { url: '/workspace#modules', steps: async function (p) {
    await p.waitForFunction(function () { return document.querySelectorAll('#modules-body .mod[data-module^="logic-"] [data-ask-module]').length === 5; }, null, { timeout: 5000 }).catch(function () {});
    var logic = await p.evaluate(function () { return { buttons: Array.prototype.map.call(document.querySelectorAll('#modules-body .mod[data-module^="logic-"] [data-ask-module]'), function (a) { return a.textContent.trim(); }), mail: document.querySelectorAll('#modules-body a[href^="mailto:"]').length }; });
    ok('legacy add: every Omega Logic department reads Add to plan and nothing on the Modules page mails ClearSky', logic.buttons.length === 5 && logic.buttons.every(function (t) { return t === 'Add to plan'; }) && logic.mail === 0, logic);
    await p.evaluate(function () { window.__opened = []; window.open = function (u) { var rec = { url: u || '', replaced: null, closed: false }; window.__opened.push(rec); return { opener: 1, document: { title: '', body: {} }, location: { replace: function (x) { rec.replaced = x; } }, close: function () { rec.closed = true; } }; }; });
    await p.click('#modules-body [data-ask-module="logic-office"]'); await wait(300);
    var dr = await p.evaluate(function () { var d = document.querySelector('.ows-drawer'); return d ? { text: d.textContent.replace(/\s+/g, ' '), rows: Array.prototype.map.call(d.querySelectorAll('.ows-row'), function (r) { return r.getAttribute('data-row'); }), mail: d.querySelectorAll('a[href^="mailto:"]').length, control: !!d.querySelector('[data-addon="logic-office"]') } : null; });
    ok('legacy add: Add to plan opens the drawer on the control with the price, and no email to ClearSky', !!dr && dr.control && /\$1,500\/month/.test(dr.text) && dr.mail === 0 && dr.rows.indexOf('mail') < 0 && !/Email ClearSky/.test(dr.text), dr);
    await p.locator('.ows-drawer [data-addon="logic-office"] button', { hasText: 'Add to plan' }).click(); await wait(400);
    var q = await p.$eval('.ows-drawer [data-addon="logic-office"]', function (e) { return e.textContent.replace(/\s+/g, ' '); });
    ok('legacy add: the server\'s quote: $1,500 today, then $1,500/month beside the plan, paid by card on QuickBooks\' page, the plan untouched', /\$1,500 today/.test(q) && /then \$1,500\/month on the \d+(st|nd|rd|th), on its own invoice beside your plan/.test(q) && /QuickBooks/.test(q) && /stay exactly as they are/.test(q) && /Pay \$1,500 now/.test(q), q);
    if (shotsAt) await p.screenshot({ path: path.join(shotsAt, 'legacy-add-quote.png') });
    await p.locator('.ows-drawer [data-addon="logic-office"] button', { hasText: 'Pay $1,500 now' }).click(); await wait(500);
    var w = await p.evaluate(function () { var a = document.querySelector('.ows-drawer [data-addon="logic-office"] a.opm-paylink'); return { opened: window.__opened, text: document.querySelector('.ows-drawer [data-addon="logic-office"]').textContent.replace(/\s+/g, ' '), link: a ? a.href : null, target: a ? a.target : null }; });
    ok('legacy add: Pay opens QuickBooks\' payment page in a new tab on the click, and the control waits with the pay link and I\'ve paid', w.opened.length === 1 && w.opened[0].replaced === PAY_URL && /Waiting for payment · \$1,500/.test(w.text) && w.link === PAY_URL && w.target === '_blank' && /I've paid/.test(w.text), w);
    var posted = STORE.posts.map(function (x) { return x.action; });
    ok('legacy add: the page asked for the quote, then bought with the quote\'s own id; nothing else was posted', posted.join() === 'addon-quote,addon-quote,addon-buy' || posted.join() === 'addon-quote,addon-buy', posted);
    if (shotsAt) await p.screenshot({ path: path.join(shotsAt, 'legacy-add-waiting.png') });
    /* the payment lands: QuickBooks says paid and the server's record says Office is on */
    ADDON.paid = true;
    await p.evaluate(function (a) { var s = window.__firebaseDouble.store, cur = JSON.parse(JSON.stringify(s.docs[a.path])); cur.addOns = { modules: ['logic-office'], live: ['logic-office'], state: 'paid', accessUntil: a.until, billingDay: 27, nextInvoiceOn: '2026-10-27', monthlyCents: 150000, monthlyDisplay: '$1,500/month', pending: [] }; s.put(a.path, cur); }, { path: laBill, until: Date.now() + 30 * 86400e3 });
    await p.locator('.ows-drawer [data-addon="logic-office"] button', { hasText: 'I\'ve paid' }).click(); await wait(900);
    var after = await p.evaluate(function () { var c = document.querySelector('.ows-drawer [data-addon="logic-office"]'), card = document.querySelector('#modules-body .mod[data-module="logic-office"]'); return { text: c ? c.textContent : '', held: card ? card.getAttribute('data-held') : null, rail: Array.prototype.map.call(document.querySelectorAll('#side-nav .sn-item'), function (a) { return a.textContent.trim(); }), plant: (document.querySelector('#modules-body .mod[data-module="logic-plant"] [data-ask-module]') || {}).textContent || '' }; });
    ok('legacy add: I\'ve paid checks QuickBooks; paid, Office is Live on the Modules page, Omega Logic joins the rail, and Plant still reads Add to plan', /Logic Office is on/.test(after.text) && after.held === '1' && after.rail.some(function (t) { return /Orders/.test(t); }) && after.plant.trim() === 'Add to plan', after);
    await p.keyboard.press('Escape');
    await p.evaluate(function () { window.location.hash = '#billing'; }); await wait(500);
    var bill = await p.evaluate(function () { var c = document.getElementById('bill-addons'); return c ? c.textContent.replace(/\s+/g, ' ') : null; });
    ok('legacy add: Plan & billing lists what was added to the plan, what it costs a month and that it is on', !!bill && /Added to your plan/.test(bill) && /\$1,500/.test(bill) && /Office/.test(bill) && /Active/.test(bill), bill);
    return {};
  } });
  /* ══ 5c. EVERY CLICK (Tommy, 2026-09-27: "we need to make sure every click
     every link doesnt bug") ══
     scripts/_lib/click-sweep.js clicks every visible control on every view
     of the workspace (the home, All tools with every fold open, Modules, In
     flight, Around you, Plan & billing) and in the chrome around it (rail,
     topbar, switcher, the phone's tab bar and its rail drawer), one at a
     time, as four tenants on a desktop and a phone. A click that would leave
     is held at the door and its address checked against what the site
     serves; a new tab or a mail link is read. It fails on an error, anything
     put into the page flow instead of over it, a panel off the screen,
     sideways scroll, a reload in disguise (the loading screen, or the
     address changing, for a click that stayed), an overlay Escape leaves
     open, a link to an address the site does not serve, and a control that
     cannot be clicked. The address carries a query (?home=workspace, as
     ?tenant=…&via=… does on a real host), which is what turned every
     /workspace#view link into a full reload. */
  var SWEEP = require('./_lib/click-sweep'), SERVED = SWEEP.servedBy(ROOT);
  var SWEEP_VIEWS = ['home', 'tools', 'modules', 'flight', 'team', 'billing'].map(function (v) {
    return { name: v, enter: async function (p) {
      /* back to the view (and nothing else) only when a click moved it: billing paints itself on entry */
      var moved = await p.evaluate(function (v) {
        var here = document.getElementById('content').getAttribute('data-view'), hash = (window.location.hash || '').slice(1);
        if (here === v && (v === 'home' ? !hash : hash === v)) { window.scrollTo(0, 0); return false; }
        if (v === 'home') { if (window.location.hash) history.replaceState(null, '', window.location.pathname + window.location.search); window.dispatchEvent(new HashChangeEvent('hashchange')); }
        else if (hash !== v) window.location.hash = '#' + v;
        else window.dispatchEvent(new HashChangeEvent('hashchange'));
        return true;
      }, v);
      if (moved) await wait(120);
      await p.evaluate(function () { Array.prototype.forEach.call(document.querySelectorAll('#content details'), function (d) { d.open = true; }); window.scrollTo(0, 0); });
    } };
  });
  async function sweepAll(p, name, phone) {
    var r = await SWEEP.run(p, {
      views: SWEEP_VIEWS, scope: '#content', chrome: '#side-nav, #topbar, .ows-tabs',
      clickable: '.next .row[data-row], [data-need], [data-opt]',
      skip: '#ows-signout', inner: '.ows-row',
      overlays: '#ows-overlay, #new-proj-modal.on, #ows-menu, #omega-package-menu, #ot-modal, body.ows-rail-open',
      reveal: phone ? [{ within: '#side-nav', open: async function (pg) { if (!(await pg.evaluate(function () { return document.body.classList.contains('ows-rail-open'); }))) await pg.click('#ows-burger'); } }] : [],
      forceClose: function (pg) { return pg.evaluate(function () { ['ows-overlay', 'ows-menu', 'omega-package-menu'].forEach(function (id) { var e = document.getElementById(id); if (e) e.remove(); }); var m = document.getElementById('new-proj-modal'); if (m) m.classList.remove('on'); document.documentElement.classList.remove('omega-np-open'); document.body.classList.remove('ows-rail-open'); }); },
      served: SERVED
    });
    ok(name + ': every control on every view was clicked or read (' + r.clicks + ' clicked, ' + r.read.length + ' read, of ' + r.controls + ')', r.controls > 30 && r.clicks + r.read.length >= r.controls - r.problems.filter(function (x) { return x.kind === 'click'; }).length && !r.skipped.length, r.skipped.slice(0, 8));
    var kinds = {}; r.problems.forEach(function (x) { (kinds[x.kind] = kinds[x.kind] || []).push(x.control + ' — ' + x.detail); });
    ['error', 'flow', 'offscreen', 'sideways', 'reload', 'escape', 'link', 'click'].forEach(function (k) {
      var what = { error: 'no click throws or logs an error', flow: 'no click puts anything into the page flow (a dialog, a panel) instead of over it', offscreen: 'every panel a click opens is inside the screen', sideways: 'no click makes the page scroll sideways', reload: 'a click that stays on the page never reloads it or raises the loading screen', escape: 'Escape closes whatever a click opened', link: 'every link and every page a click goes to is one the site serves', click: 'every control can be clicked (nothing covers it)' }[k];
      ok(name + ': ' + what, !kinds[k], (kinds[k] || []).slice(0, 8));
    });
    return { controls: r.controls, clicked: r.clicks, read: r.read.length, leaves: r.held.length, problems: r.problems.length, innerChanged: r.innerSkipped.length };
  }
  await scenario('sweep northstar', FX.northstar(HOST), { steps: async function (p) { return sweepAll(p, 'sweep northstar'); } });
  await scenario('sweep northstar-phone', FX.northstar(HOST), { phone: true, steps: async function (p) { return sweepAll(p, 'sweep northstar-phone', true); } });
  await scenario('sweep lite', FX.lite(HOST), { steps: async function (p) { return sweepAll(p, 'sweep lite'); } });
  await scenario('sweep pending', FX.pending(HOST), { steps: async function (p) { return sweepAll(p, 'sweep pending'); } });

  /* ══ 6. THE PACKAGE STORE — Lite Labs on the marketplace ══
     A packaged workspace sees its plan and every module on its shelf with
     the server's price; Lite is Included; Grid Atlas can be subscribed:
     quote, then apply, then an invoice waiting for payment — the page posts
     exactly what plan-change expects and grants nothing itself. A locked
     tool card points at the module that carries it. */
  PACKAGE_VIEW = lt.packageView; STORE.posts = []; STORE.pending = [];
  if (!ONLY || ONLY.test('store')) await (async function () {
    var errs = [], ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, function (r) { var url = r.request().url(); if (/gstatic\.com\/firebasejs/.test(url)) return r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }); return r.fulfill({ status: 200, contentType: 'text/css', body: '' }); });
    await ctx.addInitScript(DOUBLE_SRC);
    await ctx.addInitScript(function (cfg) { window.FirebaseDouble.install(window, cfg); }, { user: lt.user, docs: lt.docs, latency: 8, authDomain: HOST });
    var p = await ctx.newPage(); p.on('pageerror', function (e) { if (!/duplicate-app/.test(e.message)) errs.push(e.message); });
    await p.goto(base + '/marketplace.html?home=workspace', { waitUntil: 'domcontentloaded' });
    var shown = await p.waitForFunction(function () { var s = document.getElementById('mkt-store'); return s && !s.hidden && document.querySelectorAll('#mkt-shelves .mkt-mod').length > 5 && document.querySelector('.mkt-mod[data-module-card="gridatlas"] .opm-act button'); }, null, { timeout: 8000 }).then(function () { return true; }, function () { return false; });
    ok('store: a packaged workspace sees the package store with its modules and a Subscribe control', shown);
    /* the billing summary (monthly, next invoice) lands after the price list */
    await p.waitForFunction(function () { return /\/month/.test(document.getElementById('mkt-plan').textContent); }, null, { timeout: 4000 }).catch(function () {});
    await p.waitForFunction(function () { return document.querySelectorAll('.mkt-planc').length >= 3; }, null, { timeout: 4000 }).catch(function () {});
    var st = await p.evaluate(function () {
      var cards = Array.prototype.map.call(document.querySelectorAll('#mkt-shelves .mkt-mod'), function (c) { return { key: c.getAttribute('data-module-card'), owned: c.classList.contains('owned'), price: (c.querySelector('.mkt-card-cat b') || {}).textContent, act: c.querySelector('.mkt-actions').textContent.trim().slice(0, 30) }; });
      var ga = document.querySelector('.mkt-card:not(.mkt-mod) .mkt-act.primary[onclick*="gridatlas"]');
      return { h1: document.querySelector('.mkt-banner h1').textContent, plan: document.getElementById('mkt-plan').textContent.replace(/\s+/g, ' '), cards: cards, gaTool: ga ? ga.textContent : null, worn: document.body.classList.contains('ows-worn') && !!document.querySelector('#topbar.ows-top') && !!document.querySelector('#side-nav.ows-rail'), tabs: !!document.querySelector('.ows-tabs'), plans: document.querySelectorAll('.mkt-planc').length, yourPlan: document.querySelector('.mkt-planc.on') ? document.querySelector('.mkt-planc.on').getAttribute('data-plan-card') : null, catalogHidden: getComputedStyle(document.getElementById('market-grid')).display === 'none', shelves: document.querySelectorAll('#mkt-shelves .mkt-shelf').length };
    });
    ok('store: the head reads Marketplace and the strip names Lite, the monthly price and the modules held', st.h1 === 'Marketplace' && /Lite/.test(st.plan) && /\$149\/month/.test(st.plan) && /1 of \d+ modules/.test(st.plan), st.plan);
    ok('store: every catalog module is a card with the server\'s price, on its shelf', st.cards.length === M.catalog().length && st.cards.every(function (c) { return /\$\d/.test(c.price); }) && st.shelves >= 5, { n: st.cards.length, shelves: st.shelves });
    ok('store: Lite is in the plan and every other module offers Subscribe', st.cards.filter(function (c) { return c.owned; }).map(function (c) { return c.key; }).join() === 'lite' && st.cards.filter(function (c) { return !c.owned; }).every(function (c) { return /Subscribe/.test(c.act); }), st.cards.slice(0, 4));
    ok('store: the page wears the workspace chrome with the phone tab bar, the Plans shelf is the price list\'s with Lite marked as this workspace\'s, and the tool catalogue is folded away', st.worn && st.tabs && st.plans >= 4 && st.yourPlan === 'lite' && st.catalogHidden, { worn: st.worn, tabs: st.tabs, plans: st.plans, yourPlan: st.yourPlan, catalogHidden: st.catalogHidden });
    /* subscribe: quote, then apply */
    await p.click('.mkt-mod[data-module-card="gridatlas"] .opm-act button'); await wait(400);
    var quote = await p.$eval('.mkt-mod[data-module-card="gridatlas"] .opm-act', function (e) { return e.textContent.replace(/\s+/g, ' '); });
    ok('store: Subscribe asks the server for a quote and shows today, then, and activation with a Subscribe and pay button', STORE.posts.length === 1 && STORE.posts[0].action === 'quote' && STORE.posts[0].add.join() === 'gridatlas' && /Pay \$200 today/.test(quote) && /Subscribe and pay/.test(quote), { posts: STORE.posts, quote: quote.slice(0, 120) });
    await p.click('.mkt-mod[data-module-card="gridatlas"] .opm-act .opm-primary'); await wait(600);
    var applied = await p.$eval('.mkt-mod[data-module-card="gridatlas"] .opm-act', function (e) { return { text: e.textContent.replace(/\s+/g, ' '), pay: (e.querySelector('a') || {}).href }; });
    var ap = STORE.posts[1] || {};
    ok('store: Subscribe and pay applies the quote by its previewId and shows the invoice with the payment link', ap.action === 'apply' && ap.previewId === 'a'.repeat(48) && ap.add.join() === 'gridatlas' && /(Invoice created: \$200|Waiting for payment · \$200)/.test(applied.text) && applied.pay === 'https://pay.example/inv-1', { post: ap, applied: applied });
    await wait(600);
    var after = await p.evaluate(function () { return { badge: (document.querySelector('.mkt-mod[data-module-card="gridatlas"] .mkt-pill') || {}).textContent, strip: document.getElementById('mkt-plan').textContent, cancel: !!document.querySelector('.mkt-mod[data-module-card="gridatlas"] .opm-act button') }; });
    ok('store: the card now waits for payment, the strip counts the pending change, and the request can be cancelled', after.badge === 'Waiting for payment' && /1 waiting for payment/.test(after.strip) && after.cancel, after);
    /* a locked tile on the workspace links /marketplace.html#<module>: the page lands on that module */
    await p.goto(base + '/marketplace.html?home=workspace#storage', { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(function () { return !!document.querySelector('.mkt-mod[data-selected]'); }, null, { timeout: 6000 }).catch(function () {});
    var focused = await p.evaluate(function () { var c = document.querySelector('.mkt-mod[data-selected]'); var r = c && c.getBoundingClientRect(); return { key: c && c.getAttribute('data-module-card'), onScreen: !!(r && r.top >= 0 && r.bottom <= window.innerHeight + 2) }; });
    ok('store: /marketplace.html#storage lands on and marks the Storage module', focused.key === 'storage' && focused.onScreen, focused);
    ok('store: no uncaught errors and nothing the page granted itself', !errs.length && !missing.length, errs.concat(missing));
    console.log(JSON.stringify({ scenario: 'store', modules: st.cards.length, posts: STORE.posts.map(function (b) { return b.action; }) }));
    if (shotsAt) await p.screenshot({ path: path.join(shotsAt, 'store-1366.png'), fullPage: true });
    await ctx.close();
  })();
  PACKAGE_VIEW = null;

  /* ══ 7. THE FLOW — Projects and Marketplace with the workspace as home ══
     The legacy pages keep their own topbar and CSS, but their rail becomes
     the workspace rail (adopt), Dashboard points at /workspace, the ground
     is the same grid; and a dashboard visit is sent on to /workspace. */
  async function flow(page, current, opts) {
    opts = opts || {};
    if (ONLY && !ONLY.test('flow')) return;
    var errs = [], ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, function (r) { var url = r.request().url(); if (/gstatic\.com\/firebasejs/.test(url)) return r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }); if (/Chart\.js/.test(url)) return r.fulfill({ status: 200, contentType: 'text/javascript', body: 'window.Chart=function(){};window.Chart.register=function(){};' }); return r.fulfill({ status: 200, contentType: 'text/css', body: '' }); });
    await ctx.addInitScript(DOUBLE_SRC);
    await ctx.addInitScript(function (cfg) { window.FirebaseDouble.install(window, cfg); }, { user: opts.user || ns.user, docs: opts.docs || ns.docs, latency: 8, authDomain: HOST });
    /* THE RACE the default home has to survive: the dashboard's own auth
       handler resolves the workspace late (a real host waits for its pin),
       so it publishes window.OMEGA_WORKSPACE and reaches the redirect AFTER
       the entitlements fired. It must ask the runtime, not listen for an
       event that has passed. */
    if (opts.lagMs) await ctx.addInitScript(function (lag) {
      var t0 = Date.now(), iv = setInterval(function () {
        if (!window.OmegaBrand || !window.OmegaBrand._tenantWrapped) return;
        clearInterval(iv); var orig = window.OmegaBrand.resolve;
        window.OmegaBrand.resolve = function (email, reg) { return Date.now() - t0 < lag ? null : orig(email, reg); };
      }, 5);
    }, opts.lagMs);
    var p = await ctx.newPage(); p.on('pageerror', function (e) { if (!/duplicate-app/.test(e.message)) errs.push(e.message); });
    await p.goto(base + page + (opts.query !== undefined ? opts.query : '?home=workspace'), { waitUntil: 'domcontentloaded' }); await wait(opts.lagMs ? 4000 : 2500);
    if (page === '/marketplace.html') await p.waitForFunction(function () { return document.querySelectorAll('#mkt-shelves .mkt-mod').length > 5 && document.querySelectorAll('.mkt-planc').length >= 3; }, null, { timeout: 5000 }).catch(function () {});
    var out = await p.evaluate(function () {
      var items = Array.prototype.filter.call(document.querySelectorAll('#side-nav .sn-item'), function (a) { return getComputedStyle(a).display !== 'none'; }).map(function (a) { return (a.querySelector('span') || a).textContent.trim() + (a.classList.contains('active') ? '*' : ''); });
      var home = document.querySelector('a[data-sn="dashboard"]');
      var store = document.getElementById('mkt-store');
      return { url: location.pathname, items: items, home: home && home.getAttribute('href'), theme: document.body.classList.contains('ows-theme'), grid: /linear-gradient/.test(getComputedStyle(document.body).backgroundImage), store: store ? !store.hidden : null, worn: document.body.classList.contains('ows-worn') && !!document.querySelector('#topbar.ows-top') && !!document.querySelector('#side-nav.ows-rail'), h1: (document.querySelector('.mkt-banner h1') || {}).textContent || '', mods: Array.prototype.map.call(document.querySelectorAll('#mkt-shelves .mkt-mod'), function (c) { return { key: c.getAttribute('data-module-card'), state: c.getAttribute('data-state'), price: (c.querySelector('.mkt-card-cat b') || {}).textContent || '' }; }), plans: document.querySelectorAll('.mkt-planc').length, catalogHidden: store ? getComputedStyle(document.getElementById('market-grid')).display === 'none' : null };
    });
    var name = 'flow ' + page;
    if (page === '/') ok(name + (opts.label || '') + ': a dashboard visit with the workspace as home lands on /workspace', /\/workspace$/.test(out.url), out.url);
    else {
      ok(name + ': the rail is the workspace rail with this page current', out.items.join('|') === 'Home|Projects|All tools|Modules|Marketplace|Quote Desk|Team|Feed|Plan & billing|Settings'.replace(current, current + '*'), out.items);
      ok(name + ': Dashboard points at /workspace and the ground is the blueprint grid', out.home === '/workspace' && out.theme && out.grid, out);
      if (page === '/marketplace.html') {
        /* a legacy (unpackaged) tenant on the workspace home: the store from the public price list, every module priced and judged against the tier (On your plan · Partly · Ask ClearSky), the plans first, no tool catalogue, the whole chrome */
        var held = out.mods.filter(function (m) { return m.state === 'held'; }).length, ask = out.mods.filter(function (m) { return m.state === 'ask' || m.state === 'part'; }).length;
        ok(name + ': a legacy tenant sees the store: every catalog module priced from the price list, some on its plan and some to ask for', out.store === true && out.mods.length === M.catalog().length && out.mods.every(function (m) { return /\$\d/.test(m.price); }) && held > 0 && ask > 0, { store: out.store, n: out.mods.length, held: held, ask: ask });
        ok(name + ': the head reads Marketplace, the Plans shelf is first and the tool catalogue is folded away', out.h1 === 'Marketplace' && out.plans >= 4 && out.catalogHidden === true, { h1: out.h1, plans: out.plans, catalogHidden: out.catalogHidden });
        var buys = await p.evaluate(function () { return { controls: document.querySelectorAll('#mkt-shelves [data-addon]').length, buttons: Array.prototype.map.call(document.querySelectorAll('#mkt-shelves [data-addon] button'), function (b) { return b.textContent.trim(); }), mail: document.querySelectorAll('#mkt-shelves a[href^="mailto:"]').length }; });
        ok(name + ': every module the plan does not hold carries Add to plan (the one control), and no card mails ClearSky', buys.controls === ask && buys.buttons.length === ask && buys.buttons.every(function (t) { return t === 'Add to plan'; }) && buys.mail === 0, buys);
        ok(name + ': the page wears the whole workspace chrome', out.worn, out.worn);
        await p.setViewportSize({ width: 390, height: 844 }); await wait(300);
        var phone = await p.evaluate(function () { var tabs = document.querySelector('.ows-tabs'), burger = document.getElementById('ows-burger'); return { scroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1, tabs: !!tabs && getComputedStyle(tabs).display === 'grid', burger: !!burger && getComputedStyle(burger).display !== 'none', railHidden: getComputedStyle(document.getElementById('side-nav')).transform !== 'none' }; });
        ok(name + ': on a phone the tab bar and the burger show, the rail is off-canvas and nothing scrolls sideways', !phone.scroll && phone.tabs && phone.burger && phone.railHidden, phone);
        if (shotsAt) { await p.screenshot({ path: path.join(shotsAt, 'marketplace-390.png'), fullPage: true }); await p.setViewportSize({ width: 1366, height: 900 }); await wait(200); await p.screenshot({ path: path.join(shotsAt, 'marketplace-1366.png'), fullPage: true }); }
      }
      ok(name + ': no uncaught errors', !errs.length, errs);
    }
    console.log(JSON.stringify({ scenario: name + (opts.label || ''), rail: out.items, url: out.url }));
    await ctx.close();
  }
  await flow('/projects.html', 'Projects'); await flow('/marketplace.html', 'Marketplace'); await flow('/', '');
  /* the classic choice: a browser that asked for the classic dashboard is sent there from /workspace, and index keeps it (the same rule on both pages, so no loop) */
  if (!ONLY || ONLY.test('flow')) await (async function () {
    var ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, function (r) { var url = r.request().url(); if (/gstatic\.com\/firebasejs/.test(url)) return r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }); if (/Chart\.js/.test(url)) return r.fulfill({ status: 200, contentType: 'text/javascript', body: 'window.Chart=function(){};window.Chart.register=function(){};' }); return r.fulfill({ status: 200, contentType: 'text/css', body: '' }); });
    await ctx.addInitScript(DOUBLE_SRC);
    await ctx.addInitScript(function (cfg) { window.FirebaseDouble.install(window, cfg); }, { user: ns.user, docs: ns.docs, latency: 8, authDomain: HOST });
    var p = await ctx.newPage();
    await p.goto(base + '/workspace?home=classic', { waitUntil: 'domcontentloaded' }); await wait(3500);
    var where = await p.evaluate(function () { return { path: location.pathname, app: !!document.getElementById('app') && getComputedStyle(document.getElementById('app')).display !== 'none' }; });
    ok('classic choice: /workspace?home=classic lands on the classic dashboard and stays', where.path === '/' && where.app, where);
    await ctx.close();
  })();
  /* The DEFAULT, with nothing asked for in the address: a tenant whose record
     does not say classic, and a DERIVED workspace (no org record, no public
     pin: ClearSky's own on the open host) with the handler lagging behind
     the entitlements. Neither has ?home=; both must land on /workspace. */
  var noShell = FX.northstar(HOST); Object.keys(noShell.docs).forEach(function (k) { if (/^(omega_orgs|tenant_public)\//.test(k)) delete noShell.docs[k].shell; });
  await flow('/', '', { label: ' (no shell on the record, no ?home=)', query: '', docs: noShell.docs, user: noShell.user });
  var derived = FX.northstar(HOST); Object.keys(derived.docs).forEach(function (k) { if (/^(omega_orgs|tenant_public)\//.test(k)) delete derived.docs[k]; });
  derived.user = { uid: derived.user.uid, email: 'tommy@clearsky-usa.example', displayName: 'Tommy G', emailVerified: true };
  await flow('/', '', { label: ' (derived workspace, handler lags)', query: '', docs: derived.docs, user: derived.user, lagMs: 1200 });

  await browser.close(); srv.close();
  ok('no request would have left the machine', !external.length, external.slice(0, 5));
  ok('no /api/ route was called that this check does not answer', !missing.length, missing);
  console.log(fails ? 'render-workspace: ' + fails + ' FAILED' : 'render-workspace: ok');
  process.exit(fails ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });
