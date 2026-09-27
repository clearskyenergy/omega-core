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
   the dashboard sending a workspace-home visit on. Not on the npm test
   chain: needs the pre-installed Chromium.
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
/* STORE.pkg is what the packaged workspace holds (Lite alone unless a
   scenario says otherwise); optIns / optOuts are a legacy plan's recorded
   requests, as billing/current keeps them. The monthly figure is the price
   book's own quote (Lite is $500/month), never a number typed here. A reply
   carrying __status is answered with that status. */
var STORE = { posts: [], pending: [], pkg: null, optIns: {}, optOuts: {}, failSummary: false };
function pkgDefault() { return { modules: ['lite'], subscription: ['lite'], removals: [] }; }
STORE.pkg = pkgDefault();
function storeRoute(u, method, body) {
  var B = require('../api/_lib/pricebook'), P = require('../api/_lib/subscription-pricing'), book = B.proposed();
  function names(list) { return (list || []).map(function (k) { return M.get(k) ? M.get(k).name : k; }); }
  function quote(keys) { try { return P.quote(M.normalize(keys), book, { plan: 'auto' }).display; } catch (e) { return { monthly: null, plan: null }; } }
  function keysOf(list, field) { if (!Array.isArray(list) || !list.length) return { __status: 400, error: field + ' must list modules' }; if (list.indexOf('lite') >= 0) return { __status: 400, error: 'Lite is always included' }; return null; }
  var who = (CURRENT_FX && CURRENT_FX.user && CURRENT_FX.user.email) || 'kim@litelabs.example', at = '2026-09-27T12:00:00.000Z';
  var lb = CURRENT_FX ? (CURRENT_FX.docs['omega_orgs/' + CURRENT_FX.org + '/billing/current'] || {}) : {};
  function legacyIns() { var o = {}; Object.keys(lb.optIns || {}).forEach(function (k) { o[k] = lb.optIns[k]; }); Object.keys(STORE.optIns).forEach(function (k) { o[k] = STORE.optIns[k]; }); return o; }
  function legacyOuts() { var o = {}; Object.keys(lb.optOuts || {}).forEach(function (k) { o[k] = lb.optOuts[k]; }); Object.keys(STORE.optOuts).forEach(function (k) { o[k] = STORE.optOuts[k]; }); return o; }
  if (u === '/api/package-catalog') return { orgId: 'litelabs.example', pricebookVersion: book.version, modules: P.catalog(book), starters: M.starters(), canManage: true };
  if (method === 'GET' && STORE.failSummary) return { __status: 500, error: 'Price book not seeded' };
  if (method === 'GET' && !PACKAGE_VIEW && CURRENT_FX) { return { orgId: CURRENT_FX.org, packaged: false, packagingState: null, plan: null, planDisplay: null, modules: ['lite'], subscription: ['lite'], moduleNames: ['Lite'], subscriptionNames: ['Lite'], interval: 'monthly', billingDay: null, nextInvoiceOn: null, monthlyDisplay: null, accessUntil: null, paidThrough: null, amountDue: lb.amountDue == null ? null : lb.amountDue, paymentLink: null, invoices: [], gate: { canApply: false, reason: 'This workspace is not on a subscription package.' }, pending: [], removalRequests: [], recent: [], optIns: legacyIns(), optOuts: legacyOuts(), nextReviewOn: null }; }
  if (method === 'GET') { var q = quote(STORE.pkg.subscription); return { orgId: 'litelabs.example', packaged: true, packagingState: 'paid', plan: 'lite', planDisplay: q.plan, modules: STORE.pkg.modules, subscription: STORE.pkg.subscription, moduleNames: names(STORE.pkg.modules), subscriptionNames: names(STORE.pkg.subscription), paidThrough: '2026-10-20', accessUntil: null, amountDue: null,
    invoices: [{ id: '2026-09-20', kind: 'subscription', state: 'paid', date: '2026-09-20', period: { start: '2026-09-20', end: '2026-10-20' }, totalCents: 50000, display: '$500', paymentLink: null, names: null, paidAt: '2026-09-21' }].concat(STORE.pending.map(function (x) { return { id: x.id, kind: 'change', state: 'unpaid', date: '2026-09-27', period: null, totalCents: 20000, display: x.display, paymentLink: x.paymentLink, names: names(x.add), paidAt: null }; })),
    interval: 'monthly', billingDay: 20, nextInvoiceOn: '2026-10-20', monthlyDisplay: q.monthly, gate: { canApply: true }, pending: STORE.pending, removalRequests: STORE.pkg.removals, recent: [], optIns: {}, optOuts: {}, nextReviewOn: '2026-12-20' }; }
  STORE.posts.push(body);
  /* a legacy plan's opt-in, priced from the book (dryRun writes nothing), and its withdrawal */
  if (body.action === 'opt-in') {
    if (PACKAGE_VIEW) return { __status: 409, error: 'This workspace is on a subscription package: add modules through the menu, which prices and invoices them.' };
    var bad = keysOf(body.add, 'add'); if (bad) return bad;
    var add = [], cents = 0; body.add.forEach(function (k) { (M.get(k).requires || []).concat([k]).forEach(function (x) { if (x !== 'lite' && add.indexOf(x) < 0) add.push(x); }); });
    add.forEach(function (k) { cents += book.modules[k].priceCents; });
    if (body.dryRun === true) return { dryRun: true, add: add, names: names(add), monthlyCents: cents, display: P.money(cents) + '/month', note: 'Recorded with its price; ClearSky moves the workspace onto a package. Nothing is charged before you approve the first invoice.' };
    var entries = {}; add.forEach(function (k) { entries[k] = STORE.optIns[k] = { key: k, name: M.get(k).name, monthlyCents: book.modules[k].priceCents, display: P.money(book.modules[k].priceCents) + '/month', requestedBy: who, requestedAt: at, status: 'requested' }; });
    return { ok: true, requested: true, add: add, names: names(add), monthlyCents: cents, display: P.money(cents) + '/month', optIns: entries, requestedAt: at };
  }
  if (body.action === 'withdraw-opt-in') {
    var ins = legacyIns(), wk = (body.add || []).filter(function (k) { return ins[k] && ins[k].status === 'requested'; });
    if (!wk.length) return { __status: 409, error: 'No request to withdraw' };
    wk.forEach(function (k) { STORE.optIns[k] = Object.assign({}, ins[k], { status: 'withdrawn', withdrawnAt: at, withdrawnBy: who }); });
    return { ok: true, withdrawn: wk, optIns: legacyIns() };
  }
  /* a legacy plan's opt-out: a recorded request under the agreement, never a change to the tier */
  if (body.action === 'opt-out') {
    if (PACKAGE_VIEW) return { __status: 409, error: 'This workspace is on a subscription package: opt out through the menu, which queues it for the quarterly review.' };
    var bad2 = keysOf(body.remove, 'remove'); if (bad2) return bad2;
    var reqd = legacyIns(); if (body.remove.some(function (k) { return reqd[k] && reqd[k].status === 'requested'; })) return { __status: 409, error: 'That module is only requested: cancel the request instead.' };
    var remove = body.remove.slice(); if (remove.indexOf('logic-office') >= 0 && (lb.addons || []).indexOf('omega-logic') >= 0) M.catalog().forEach(function (m) { if (m.shelf === 'platform' && remove.indexOf(m.key) < 0) remove.push(m.key); });
    var note = 'Your plan\'s price is set by your agreement, so nothing changes today. ClearSky confirms the effective date and any new price with you in writing; you keep access until then. Lite stays.';
    if (body.dryRun === true) return { dryRun: true, remove: remove, names: names(remove), note: note };
    remove.forEach(function (k) { STORE.optOuts[k] = { key: k, name: M.get(k).name, requestedBy: who, requestedAt: at, status: 'requested', reason: body.reason || '' }; });
    return { ok: true, requested: true, remove: remove, names: names(remove), optOuts: legacyOuts(), requestedAt: at, note: note };
  }
  if (body.action === 'withdraw-opt-out') {
    var outs = legacyOuts(), ok2 = (body.remove || []).filter(function (k) { return outs[k] && outs[k].status === 'requested'; });
    if (!ok2.length) return { __status: 409, error: 'No request to withdraw' };
    ok2.forEach(function (k) { STORE.optOuts[k] = Object.assign({}, outs[k], { status: 'withdrawn', withdrawnAt: at, withdrawnBy: who }); });
    return { ok: true, withdrawn: ok2, optOuts: legacyOuts() };
  }
  /* a packaged opt-out queues for the quarterly review: the dry run names the fee before and after and the review date */
  if (body.action === 'request-removal' || body.action === 'withdraw-removal') {
    var withdraw = body.action === 'withdraw-removal', owned = STORE.pkg.subscription, sel = (body.remove || []).slice();
    if (!sel.length || sel.indexOf('lite') >= 0) return { __status: 400, error: 'Lite is always included' };
    if (!withdraw) owned.forEach(function (k) { if (sel.indexOf(k) < 0 && (M.get(k).requires || []).some(function (r) { return sel.indexOf(r) >= 0; })) sel.push(k); });
    var previewId = (withdraw ? 'w' : 'r').repeat(48);
    if (body.dryRun === true) { var before = quote(owned), after = quote(owned.filter(function (k) { return sel.indexOf(k) < 0; })); return { previewId: previewId, modules: sel, names: names(sel), withdraw: withdraw, beforeDisplay: withdraw ? null : before.monthly, afterDisplay: withdraw ? null : after.monthly, reviewOn: '2026-12-20',
      note: withdraw ? 'Confirming will withdraw the opt-out request for these modules. Access and billing will stay unchanged.' : 'Confirming queues these modules for the quarterly review with ClearSky. Access and charges stay unchanged until that review; this does not issue a refund.' }; }
    if (body.previewId !== previewId) return { __status: 400, error: 'Your package changed; review the opt-out request again' };
    sel.forEach(function (k) { var i = -1; STORE.pkg.removals.forEach(function (r, n) { if (r.module === k) i = n; }); if (withdraw) { if (i >= 0) STORE.pkg.removals.splice(i, 1); } else if (i < 0) STORE.pkg.removals.push({ module: k, requestedAt: Date.parse(at), by: who, reason: '' }); });
    return { ok: true, removalRequests: STORE.pkg.removals, modules: sel, names: names(sel), note: withdraw ? 'The opt-out request is withdrawn for these modules. Access and billing are unchanged.' : 'Queued for the quarterly review with ClearSky. Access and charges stay unchanged until that review; this does not issue a refund.' };
  }
  if (body.action === 'reconcile-now') return { orgId: 'litelabs.example', packaged: true, packagingState: 'paid', paid: true };
  if (body.action === 'quote') return { orgId: 'litelabs.example', previewId: 'a'.repeat(48), effectiveAt: Date.now(), add: body.add, addNames: body.add.map(function (k) { return M.get(k).name; }), modules: ['lite'].concat(body.add), plan: 'lite', included: false, canApply: true, reason: null, pending: [], steer: null, serviceFeeNote: null,
    display: { today: 'Pay $200 today (prorated to Oct 20)', then: 'Then $250/month more from Oct 20', activation: 'Switches on when the payment clears' } };
  if (body.action === 'apply') { var rec = { id: 'change-' + body.previewId, add: body.add, display: '$200', expiresOn: '2026-10-03', paymentLink: 'https://pay.example/inv-1', state: 'unpaid' }; STORE.pending = [rec]; return { state: 'unpaid', changeId: rec.id, display: rec.display, expiresOn: rec.expiresOn, paymentLink: rec.paymentLink }; }
  if (body.action === 'cancel') { STORE.pending = []; return { state: 'cancelled', changeId: body.changeId }; }
  return { error: 'render-workspace does not answer ' + body.action };
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
      var chunks = []; req.on('data', function (c) { chunks.push(c); }); req.on('end', function () { var body = {}; try { body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {}; } catch (e) {} var r = storeRoute(u, req.method, body), st = r && r.__status; if (st) delete r.__status; json(r, st || 200); }); return;
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
    opts = opts || {}; PACKAGE_VIEW = fx.packageView || null; CURRENT_FX = fx;
    var errs = [], muted = false, ctx = await browser.newContext({ viewport: opts.phone ? { width: 390, height: 844 } : { width: 1366, height: 900 }, hasTouch: !!opts.phone, isMobile: !!opts.phone, timezoneId: opts.tz || undefined });
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
    var board = await p.evaluate(function () { function shown(id) { var e = document.getElementById(id); return !!e && getComputedStyle(e).display !== 'none'; } return { flight: shown('flight'), team: shown('team'), tools: shown('tools'), pulse: !!document.querySelector('#pulse .stats .stat'), stats: document.querySelectorAll('#pulse .stats .stat').length, spark: !!document.querySelector('#pulse .spark path'), insight: (document.querySelector('#pulse .insight') || {}).textContent || '', mymods: document.querySelectorAll('#mymods-body .mod').length, mymodsLive: document.querySelectorAll('#mymods-body .mod[data-held="1"]').length }; });
    ok(name + ': Your modules on the home: the held ones Live and a few to add, from the one catalogue', board.mymods > 0 && board.mymods <= board.mymodsLive + 3, board);
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
  /* PLAN & BILLING at a phone's width (the generic checks run only on the
     view a scenario ends on, which is never billing): no sideways scroll, no
     stray NaN / undefined / null, the night-sky subscription, the payment
     method drawn as a card no wider than the phone, and a screenshot. */
  async function billingPhone(p, name) {
    var vp = p.viewportSize(); await p.setViewportSize({ width: 390, height: 844 }); await wait(250);
    var r = await p.evaluate(function () {
      var b = document.getElementById('billing-body'), hero = document.getElementById('bill-sub'), card = document.querySelector('#bill-card .pmc');
      return { scroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1, text: b ? b.innerText : '', hero: !!hero && hero.classList.contains('bhero') && /gradient/.test(getComputedStyle(hero).backgroundImage), chips: document.querySelectorAll('#bill-sub .bh-mod').length, card: card ? Math.round(card.getBoundingClientRect().width) : 0, footer: /server’s|priced in the browser/.test(b ? b.textContent : '') };
    });
    var stray = STRAY.exec(r.text);
    ok(name + ': Plan & billing at 390px scrolls no sideways, prints no stray value, wears the night-sky subscription with its module chips and draws the payment method as a card within the phone', !r.scroll && !stray && r.hero && r.chips >= 1 && r.card > 0 && r.card <= 358 && !r.footer, { scroll: r.scroll, stray: stray && r.text.slice(Math.max(0, stray.index - 40), stray.index + 30), hero: r.hero, chips: r.chips, card: r.card, footer: r.footer });
    if (shotsAt) await p.screenshot({ path: path.join(shotsAt, name + '-billing-390.png'), fullPage: true });
    await p.setViewportSize(vp); await wait(200);
    if (shotsAt) await p.screenshot({ path: path.join(shotsAt, name + '-billing-1366.png'), fullPage: true });
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
    var trialHref = await p.$eval('#today .next .row[data-key="trial"] a.ows-pill', function (a) { return a.getAttribute('href'); }).catch(function () { return null; });
    ok('newco: the trial row\'s See plans opens the plans shelf on the workspace, not the Marketplace', trialHref === '/workspace#plans', trialHref);
    var empty = await p.$eval('#flight-body', function (e) { return e.textContent; });
    ok('newco: an empty workspace says so in In flight', /No projects yet/.test(empty), empty.slice(0, 60));
    /* + New project opens the one dialog and closes again (In flight is its own page) */
    await p.evaluate(function () { window.location.hash = '#flight'; }); await wait(150);
    ok('newco: #flight opens In flight as its own page', await p.evaluate(function () { return document.getElementById('content').getAttribute('data-view') === 'flight'; }));
    await p.click('#new-project'); await wait(300);
    var open = await p.$eval('#np-name', function (e) { return !!(e.offsetWidth || e.offsetHeight); }).catch(function () { return false; });
    ok('newco: + New project opens the New Project dialog', open);
    await p.click('.mb-cancel').catch(function () {}); await wait(200);
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
    /* ONE card per module from OmegaWorkspaceHub.moduleCard: one status in
       the contract's words and at most one action on its row */
    function modsNow() { return p.evaluate(function () {
      var mods = Array.prototype.slice.call(document.querySelectorAll('#modules-body .mod'));
      return { cards: mods.length, sub: document.getElementById('modules-sub').textContent, text: document.getElementById('modules-body').textContent,
        rows: mods.map(function (m) { var a = m.querySelectorAll('.row [data-mod-act]'); return { key: m.getAttribute('data-module'), held: m.getAttribute('data-held'), state: m.getAttribute('data-state'), pill: (m.querySelector('.cv .st') || {}).textContent || '', price: (m.querySelector('.price') || {}).textContent || '', acts: Array.prototype.map.call(a, function (b) { return b.getAttribute('data-mod-act') + ':' + b.textContent.trim(); }), note: (m.querySelector('.row .note') || {}).textContent || '' }; }) }; }); }
    if (shotsAt) { await p.screenshot({ path: path.join(shotsAt, 'northstar-modules-1366.png'), fullPage: true }); var vpn = p.viewportSize(); await p.setViewportSize({ width: 390, height: 844 }); await wait(250); await p.screenshot({ path: path.join(shotsAt, 'northstar-modules-390.png'), fullPage: true }); await p.setViewportSize(vpn); await wait(200); }
    var legacyMods = await modsNow(), byK = {}; legacyMods.rows.forEach(function (r) { byK[r.key] = r; });
    var live = legacyMods.rows.filter(function (r) { return r.state === 'live'; }), part = legacyMods.rows.filter(function (r) { return r.state === 'part'; }), avail = legacyMods.rows.filter(function (r) { return r.state === 'available'; });
    var PILLS = ['● Live', '● Live · always included', 'Opting out', 'Waiting for payment', 'Bought · not on yet', 'Opt-in requested', 'Partly included', 'Not on your plan'];
    ok('northstar: a legacy plan\'s Modules page lists every module, each with one contract pill and at most one action', legacyMods.cards === M.catalog().length && legacyMods.rows.every(function (r) { return PILLS.indexOf(r.pill) >= 0 && r.acts.length <= 1; }) && /holds \d+ of \d+ modules/.test(legacyMods.sub) && !/Subscribe|Keep module|\bAsk\b/.test(legacyMods.text), legacyMods.rows.filter(function (r) { return PILLS.indexOf(r.pill) < 0 || r.acts.length > 1; }));
    ok('northstar: Lite is always included with no action; every other Live module offers Opt out and reads Included in Standard', byK.lite.state === 'included' && !byK.lite.acts.length && live.length > 0 && live.every(function (r) { return r.acts[0] === 'remove:Opt out' && r.price === 'Included in Standard'; }), live);
    ok('northstar: a partly included module says how much and offers Opt in for the rest, never Opt out', part.length > 0 && part.every(function (r) { return /^add:Opt in/.test(r.acts[0]) && /adds the rest/.test(r.note); }), part);
    ok('northstar: a module not on the plan is priced and offers Opt in with that price, joining the monthly bill through ClearSky', avail.length > 0 && avail.every(function (r) { return /\$\d/.test(r.price) && r.acts[0] === 'add:Opt in' && r.note.indexOf(r.price) >= 0 && /once ClearSky moves you to monthly billing/.test(r.note); }), avail.slice(0, 3));
    ok('northstar: the Modules page agrees with Site Map: Plan Sets is not held on Standard although no tool of its is locked', byK.plansets && byK.plansets.state !== 'live', byK.plansets);
    await p.evaluate(function () { window.location.hash = '#plans'; }); await wait(400);
    var lplans = await p.evaluate(function () { var sh = document.getElementById('modules-plans'); return { n: sh.querySelectorAll('.planc').length, on: sh.querySelectorAll('.planc.on').length, note: (sh.querySelector('.plans-note') || {}).textContent || '' }; });
    ok('northstar: a legacy plan\'s plans shelf says its price is the agreement\'s and marks no book plan as its own', lplans.n === 4 && lplans.on === 0 && /Northstar Development/.test(lplans.note) && /Standard plan, priced by your agreement/.test(lplans.note), lplans);
    await p.evaluate(function () { window.location.hash = '#modules'; }); await wait(250);
    /* OPT OUT → the one menu on that module, straight to its step, the money said, a recorded request (never an email) */
    var outKey = live[0].key, posts0 = STORE.posts.length;
    await p.click('#modules-body .mod[data-module="' + outKey + '"] [data-mod-act="remove"]');
    await p.locator('#omega-package-menu').getByRole('button', { name: 'Send opt-out request' }).waitFor({ timeout: 4000 });
    var outPanel = await p.evaluate(function () { var m = document.getElementById('omega-package-menu'); return { text: m.textContent, cards: m.querySelectorAll('section').length }; });
    ok('northstar: Opt out opens the one menu on that module alone, straight to the opt-out, saying nothing changes today and access stays', outPanel.cards === 1 && /nothing changes today/.test(outPanel.text) && /you keep access until then/.test(outPanel.text) && /Lite stays/.test(outPanel.text), outPanel);
    await p.locator('#omega-package-menu').getByRole('button', { name: 'Send opt-out request' }).click(); await wait(400);
    var outPosts = STORE.posts.slice(posts0).map(function (b) { return b.action + (b.dryRun ? '?' : '') + ':' + (b.remove || b.add || []).join(','); });
    ok('northstar: the opt-out is priced first and then recorded as one request', outPosts.join('|') === 'opt-out?:' + outKey + '|opt-out:' + outKey, outPosts);
    await p.keyboard.press('Escape'); await wait(300);
    var afterOut = (await modsNow()).rows.filter(function (r) { return r.key === outKey; })[0];
    ok('northstar: the card now reads Opting out, access unchanged, with Cancel request', afterOut.state === 'removing' && afterOut.pill === 'Opting out' && afterOut.acts[0] === 'cancel:Cancel request' && /access is unchanged/.test(afterOut.note), afterOut);
    /* CANCEL REQUEST → nothing about the bill changes; the card is Live again */
    await p.click('#modules-body .mod[data-module="' + outKey + '"] [data-mod-act="cancel"]');
    await p.locator('#omega-package-menu').getByRole('button', { name: 'Cancel request' }).first().waitFor({ timeout: 4000 });
    ok('northstar: Cancel request says nothing about the bill changes', /Nothing about your bill changes/.test(await p.locator('#omega-package-menu').textContent()));
    await p.locator('#omega-package-menu .opm-primary', { hasText: 'Cancel request' }).click(); await wait(400);
    await p.keyboard.press('Escape'); await wait(300);
    var backLive = (await modsNow()).rows.filter(function (r) { return r.key === outKey; })[0];
    ok('northstar: after Cancel request the module is Live again with Opt out', backLive.state === 'live' && backLive.acts[0] === 'remove:Opt out' && STORE.posts[STORE.posts.length - 1].action === 'withdraw-opt-out', backLive);
    /* OPT IN → the price first, then one recorded request; the card reads Opt-in requested */
    var inKey = avail[0].key, posts1 = STORE.posts.length;
    await p.click('#modules-body .mod[data-module="' + inKey + '"] [data-mod-act="add"]');
    await p.locator('#omega-package-menu').getByRole('button', { name: 'Request opt-in' }).waitFor({ timeout: 4000 });
    var inPanel = await p.locator('#omega-package-menu').textContent();
    ok('northstar: Opt in states the monthly price and that nothing is charged before the first invoice is approved', /Opt in to .* for \$[\d,]+\/month\?/.test(inPanel) && /Nothing is charged/.test(inPanel), inPanel.slice(0, 400));
    await p.locator('#omega-package-menu').getByRole('button', { name: 'Request opt-in' }).click(); await wait(400);
    await p.keyboard.press('Escape'); await wait(300);
    var afterIn = (await modsNow()).rows.filter(function (r) { return r.key === inKey; })[0];
    ok('northstar: the opt-in is recorded once and the card reads Opt-in requested with Cancel request', STORE.posts.slice(posts1).map(function (b) { return b.action + (b.dryRun ? '?' : ''); }).join() === 'opt-in?,opt-in' && afterIn.state === 'requested' && afterIn.acts[0] === 'cancel:Cancel request', afterIn);
    await p.click('#modules-body .mod[data-module="' + inKey + '"] [data-mod-act="cancel"]');
    await p.locator('#omega-package-menu .opm-primary', { hasText: 'Cancel request' }).click(); await wait(400);
    await p.keyboard.press('Escape'); await wait(300);
    var inBack = (await modsNow()).rows.filter(function (r) { return r.key === inKey; })[0];
    ok('northstar: a cancelled opt-in is simply on offer again', inBack.state === 'available' && /^add:Opt in/.test(inBack.acts[0]) && STORE.posts[STORE.posts.length - 1].action === 'withdraw-opt-in', inBack);
    await p.keyboard.press('Escape');
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
    ok('northstar: a locked tile says which plan and module carry it and offers to opt in to that module here, never the Marketplace', /Enterprise/.test(why) && /Opt in to Investor & Finance/.test(why) && !/Marketplace/.test(why), why.slice(0, 200));
    var seeIt = await p.$eval('.ows-drawer a.ows-row[data-row="see"]', function (a) { return a.getAttribute('href'); }).catch(function () { return null; });
    ok('northstar: the locked tile links the module\'s own card on Modules', seeIt === '/workspace#module-finance', seeIt);
    await p.keyboard.press('Escape'); await wait(150);
    /* Plan & billing from the rail: a page with the subscription, what is owed and when, the card, the history */
    await p.click('#side-nav .sn-item[data-key="billing"]'); await wait(600);
    await p.waitForFunction(function () { return /NS-0001/.test((document.getElementById('billing-body') || {}).textContent || ''); }, null, { timeout: 4000 }).catch(function () {});
    var bill = await p.evaluate(function () { var v = document.getElementById('content').getAttribute('data-view'), t = document.getElementById('billing-body').textContent.replace(/\s+/g, ' '); return { view: v, text: t, cards: Array.prototype.map.call(document.querySelectorAll('#billing-body .bcard h3'), function (h) { return h.firstChild.textContent; }), portal: !!document.getElementById('bill-portal'), stripeLinks: document.querySelectorAll('#bill-hist a[href^="https://invoice.stripe.com/"]').length, cardInputs: document.querySelectorAll('#billing-body input').length }; });
    ok('northstar: Plan & billing is a page: the subscription, what you owe, the payment method and the history', bill.view === 'billing' && bill.cards.join('|') === 'Your subscription|What you owe|Payment method|Billing history', bill.cards);
    ok('northstar: a Stripe-billed plan says the card lives with Stripe, offers the portal, and says nothing is owed with the next payment date', bill.portal && /Stripe/.test(bill.text) && /nothing is owed/.test(bill.text) && /Next invoice/.test(bill.text) && /Standard/.test(bill.text), bill.text.slice(0, 300));
    ok('northstar: the billing history lists what Stripe billed, each with its invoice page', /NS-0002/.test(bill.text) && /NS-0001/.test(bill.text) && bill.stripeLinks === 2, { links: bill.stripeLinks, text: bill.text.slice(-200) });
    var hist = await p.evaluate(function () { return { paid: document.querySelectorAll('#bill-hist .spill.paid').length, statusButtons: Array.prototype.filter.call(document.querySelectorAll('#bill-hist a.ows-pill'), function (a) { return /^paid$/i.test(a.textContent.trim()); }).length, times: Array.prototype.map.call(document.querySelectorAll('#bill-hist time'), function (t) { return t.textContent; }), pm: (document.querySelector('#bill-card .pmc') || {}).className, members: /An owner or administrator sees the invoices/.test(document.getElementById('billing-body').textContent), stale: /Marketplace|Plans and the store/.test(document.getElementById('billing-body').textContent) }; });
    ok('northstar: each invoice carries one status pill (Paid), never a button that says paid, dated in the one style, the card drawn as Stripe\'s, and no link to the store', hist.paid === 2 && hist.statusButtons === 0 && hist.times.every(function (t) { return /^[A-Z][a-z]{2} \d{1,2}, \d{4}$/.test(t); }) && /\bstripe\b/.test(hist.pm) && !hist.stale, hist);
    await billingPhone(p, 'northstar');
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
    var vm = await p.evaluate(function () { return { cards: document.querySelectorAll('#modules-body .mod').length, acts: document.querySelectorAll('#modules-body [data-mod-act]').length, live: document.querySelectorAll('#modules-body .mod[data-held="1"]').length, off: document.querySelectorAll('#modules-body .mod[data-state="available"]').length }; });
    ok('viewas: the Modules page shows the customer\'s view (Lite Live, the rest not on the plan) and a staff preview offers no button that changes it', vm.cards === M.catalog().length && vm.live === 1 && vm.off === vm.cards - 1 && vm.acts === 0, vm);
    ok('viewas: nothing was written', !(await p.evaluate(function () { return window.__firebaseDouble.store.log.some(function (w) { return /^omega_orgs\//.test(w.path); }); })));
    return {};
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
  await scenario('lite', lt, { tz: 'America/Chicago', steps: async function (p) {
    await p.evaluate(function () { window.location.hash = '#billing'; });
    await p.waitForFunction(function () { return !!document.querySelector('#bill-hist time[datetime="2026-09-20"]'); }, null, { timeout: 5000 }).catch(function () {});
    var lb = await p.evaluate(function () { var t = function (id) { var e = document.getElementById(id); return e ? e.textContent.replace(/\s+/g, ' ') : ''; }; return { sub: t('bill-sub'), owe: t('bill-owe'), card: t('bill-card'), hist: t('bill-hist'), inputs: document.querySelectorAll('#billing-body input').length, paid: !!document.getElementById('bill-paid'), cards: Array.prototype.map.call(document.querySelectorAll('#billing-body .bcard h3'), function (h) { return h.firstChild.textContent; }).join('|'), time: (document.querySelector('#bill-hist time[datetime="2026-09-20"]') || {}).textContent || '' }; });
    ok('lite: Plan & billing shows the package at the book\'s price (Lite, $500 a month, billed on the 20th), nothing owed with the next invoice, the card on QuickBooks\' own page, the paid invoice, and no card field', /Lite/.test(lb.sub) && /\$500/.test(lb.sub) && !/\$149/.test(lb.sub) && /20th/.test(lb.sub) && /nothing is owed/.test(lb.owe) && /Next invoice/.test(lb.owe) && lb.paid && /QuickBooks Payments/.test(lb.card) && /Save this card/.test(lb.card) && lb.time === 'Sep 20, 2026' && /\$500/.test(lb.hist) && lb.inputs === 0 && lb.cards === 'Your subscription|What you owe|Payment method|Billing history', lb);
    ok('lite: a bare date is that calendar day in Chicago (the next invoice on Oct 20, paid Sep 21), never the day before', /Oct 20, 2026/.test(lb.owe) && !/Oct 19/.test(lb.owe + lb.sub) && /paid Sep 21, 2026/.test(lb.hist), { owe: lb.owe, hist: lb.hist });
    var hero = await p.evaluate(function () { var s = document.getElementById('bill-sub'); return { editor: !!s.querySelector('a[href="/editor"]'), lite: !!s.querySelector('a.bh-mod[href="/workspace#module-lite"]'), add: !!s.querySelector('a.bh-mod.add[href="/workspace#modules"]'), state: (s.querySelector('.bh-state') || {}).textContent, facts: Array.prototype.map.call(s.querySelectorAll('.bh-fact'), function (f) { return f.querySelector('.l').textContent + '=' + f.querySelector('.v').textContent; }) }; });
    ok('lite: the subscription says Active, carries its modules as chips that open their cards, the facts (billing day, next invoice, modules Live, role) and a link into Site Map, the editor', hero.editor && hero.lite && hero.add && hero.state === 'Active' && hero.facts.join('|') === 'Billing=Monthly, on the 20th|Next invoice=Oct 20, 2026|Modules=1 of ' + M.catalog().length + ' Live|Your role=Owner', hero);
    await billingPhone(p, 'lite');
    /* a chip is a place on this page: Lite's card on Modules, marked, without a reload */
    await p.click('#bill-sub a.bh-mod[href="/workspace#module-lite"]'); await wait(400);
    var chip = await p.evaluate(function () { return { view: document.getElementById('content').getAttribute('data-view'), hash: location.hash, search: location.search, marked: (document.querySelector('#modules-body .mod[data-selected]') || {}).getAttribute && document.querySelector('#modules-body .mod[data-selected]').getAttribute('data-module') }; });
    ok('lite: a module chip opens that module\'s card on Modules, marked, in the same page', chip.view === 'modules' && chip.hash === '#module-lite' && /home=workspace/.test(chip.search) && chip.marked === 'lite', chip);
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
    ok('lite: a locked tile names the module that carries it', /Grid Atlas/.test(why) && /part of/.test(why), why.slice(0, 160));
    await p.keyboard.press('Escape');
    /* the Modules page (2026-09-27): the Ladder as a page of the workspace */
    await p.evaluate(function () { window.location.hash = '#modules'; }); await wait(400);
    var mods = await p.evaluate(function () { return { view: document.getElementById('content').getAttribute('data-view'), cards: Array.prototype.map.call(document.querySelectorAll('#modules-body .mod'), function (c) { return { key: c.getAttribute('data-module'), held: c.getAttribute('data-held'), price: (c.querySelector('.price') || {}).textContent || '', add: !!c.querySelector('[data-mod-act="add"]') }; }), change: (document.querySelector('#plan a.ows-pill') || {}).getAttribute && document.querySelector('#plan a.ows-pill').getAttribute('href') }; });
    ok('lite: #modules is its own page with one card per catalog module', mods.view === 'modules' && mods.cards.length === M.catalog().length, { view: mods.view, n: mods.cards.length });
    ok('lite: Lite is Live and Grid Atlas carries the server\'s price and Opt in', mods.cards.some(function (c) { return c.key === 'lite' && c.held === '1' && !c.add; }) && mods.cards.some(function (c) { return c.key === 'gridatlas' && c.held === '0' && /\$\d/.test(c.price) && c.add; }), mods.cards.filter(function (c) { return c.key === 'lite' || c.key === 'gridatlas'; }));
    ok('lite: Change plan on the plan strip opens the Modules page', mods.change === '/workspace#modules', mods.change);
    /* #module-<key>: every link to one module lands on its card, marked and in view */
    await p.evaluate(function () { window.scrollTo(0, 0); window.location.hash = '#module-storage'; }); await wait(500);
    var focus = await p.evaluate(function () { var c = document.querySelector('#modules-body .mod[data-selected]'), r = c && c.getBoundingClientRect(); return { view: document.getElementById('content').getAttribute('data-view'), key: c && c.getAttribute('data-module'), marked: document.querySelectorAll('#modules-body .mod[data-selected]').length, onScreen: !!(r && r.top >= 0 && r.bottom <= window.innerHeight + 2), rail: (document.querySelector('#side-nav .sn-item.active') || {}).getAttribute && document.querySelector('#side-nav .sn-item.active').getAttribute('data-key') }; });
    ok('lite: #module-storage opens Modules with the Storage card marked and on screen', focus.view === 'modules' && focus.key === 'storage' && focus.marked === 1 && focus.onScreen && focus.rail === 'modules', focus);
    /* #plans: the plans shelf, moved here from the marketplace, with this workspace's plan marked */
    await p.evaluate(function () { window.scrollTo(0, 0); window.location.hash = '#plans'; }); await wait(500);
    var plans = await p.evaluate(function () { var sh = document.getElementById('modules-plans'), r = sh.getBoundingClientRect(); return { view: document.getElementById('content').getAttribute('data-view'), cards: Array.prototype.map.call(sh.querySelectorAll('.planc'), function (c) { return c.getAttribute('data-plan-card') + '=' + c.querySelector('.pr').textContent; }), mine: Array.prototype.map.call(sh.querySelectorAll('.planc.on'), function (c) { return c.getAttribute('data-plan-card'); }), top: Math.round(r.top), marked: document.querySelectorAll('#modules-body .mod[data-selected]').length, stripPlans: !!document.querySelector('#modules-plan a[href="/workspace#plans"]'), store: !!document.querySelector('#modules a[href^="/marketplace"]') }; });
    ok('lite: #plans opens Modules scrolled to the plans shelf: Lite, Field, Pro and Enterprise at the book\'s prices, Lite marked as this workspace\'s, and nothing on the page sends a module to the Marketplace', plans.view === 'modules' && plans.cards.join() === 'lite=$500/month,field=$1,299/month,pro=$2,499/month,enterprise=$150,000/year' && plans.mine.join() === 'lite' && plans.top >= 0 && plans.top < 300 && plans.marked === 0 && plans.stripPlans && !plans.store, plans);
    var inside = await p.evaluate(function () { function line(k) { var c = document.querySelector('#modules-body .mod[data-module="' + k + '"] .inside'); return c ? c.textContent : ''; } return { whitelabel: line('whitelabel'), plant: line('logic-plant'), plansets: line('plansets'), gridatlas: line('gridatlas') }; });
    ok('lite: a module that lives outside Site Map says where it lives, and one inside says so', /^Lives in your own website/.test(inside.whitelabel) && /^Lives in Omega Logic/.test(inside.plant) && /^Inside Site Map, the editor/.test(inside.plansets) && /^Inside Site Map, the editor · with Grid Atlas/.test(inside.gridatlas) && !/capabilities of Site Map/.test(inside.whitelabel + inside.plant), inside);
    await p.evaluate(function () { window.location.hash = '#modules'; }); await wait(200);
    if (shotsAt) { var vpm = p.viewportSize(); await p.setViewportSize({ width: 390, height: 844 }); await wait(200); await p.screenshot({ path: path.join(shotsAt, 'lite-modules-390.png') }); await p.setViewportSize(vpm); await wait(150); }
    await p.click('#modules-body [data-mod-act="add"][data-module="gridatlas"]');
    await p.locator('#omega-package-menu').getByRole('button', { name: 'Opt in and pay' }).waitFor({ timeout: 4000 }).catch(function () {});
    var menu = await p.evaluate(function () { var d = document.getElementById('omega-package-menu'); return { open: !!d, cards: d ? d.querySelectorAll('section').length : 0, text: d ? d.textContent.replace(/\s+/g, ' ') : '' }; });
    ok('lite: Opt in opens the one package menu on Grid Atlas alone, already priced: today\'s charge, the monthly price after, and Opt in and pay', menu.open && menu.cards === 1 && /Grid Atlas/.test(menu.text) && /Pay \$200 today/.test(menu.text) && /Then \$250\/month more/.test(menu.text) && /Opt in and pay/.test(menu.text), { cards: menu.cards, text: menu.text.slice(0, 300) });
    await p.keyboard.press('Escape'); await wait(150);
    ok('lite: the page asked /api/package-access and nothing it does not answer', apiCalls.some(function (c) { return /package-access/.test(c); }) && !missing.length, { calls: apiCalls, missing: missing });
    return out;
  } });

  /* ══ 5b. LITE LABS, CHANGES IN PROGRESS — Grid Atlas queued to leave at
     the quarterly review, Storage chosen and waiting for its invoice. Plan
     & billing lists both with their steps, the review date, a Pay link and
     Cancel request, which opens the one menu on that module; the chips on
     the subscription say the same. ══ */
  var lc = FX.lite(HOST), lcb = lc.docs['omega_orgs/' + lc.org + '/billing/current'];
  lcb.modules = ['lite', 'gridatlas']; lcb.subscription.modules = ['lite', 'gridatlas']; lcb.removalRequests = [{ module: 'gridatlas', requestedAt: Date.now() - 86400e3, by: lc.user.email, reason: '' }];
  lc.packageView = require('../api/_lib/package-access').project({ staff: false, claims: { email_verified: true } }, lcb, lc.docs['omega_orgs/' + lc.org], lc.docs['omega_orgs/' + lc.org + '/members/uid-lite-owner'], Date.now());
  STORE.pkg = { modules: ['lite', 'gridatlas'], subscription: ['lite', 'gridatlas'], removals: lcb.removalRequests.slice() };
  STORE.pending = [{ id: 'change-storage', add: ['storage'], names: ['Storage Sizing & Revenue'], display: '$200', expiresOn: '2026-10-20', paymentLink: 'https://pay.example/inv-1', state: 'unpaid' }];
  await scenario('lite-changes', lc, { url: '/workspace#billing', tz: 'America/Chicago', steps: async function (p) {
    await p.waitForFunction(function () { return document.querySelectorAll('#bill-req .chg-row').length === 2; }, null, { timeout: 5000 }).catch(function () {});
    var ch = await p.evaluate(function () {
      var rows = Array.prototype.map.call(document.querySelectorAll('#bill-req .chg-row'), function (r) { return { key: r.getAttribute('data-change'), pill: (r.querySelector('.bpill') || {}).textContent, line: (r.querySelector('small') || {}).textContent, steps: Array.prototype.map.call(r.querySelectorAll('.steps li'), function (li) { return li.textContent + (li.className ? '(' + li.className + ')' : ''); }).join('|'), pay: (r.querySelector('a.ows-pill') || {}).href || null, cancel: (r.querySelector('[data-cancel]') || {}).textContent || null }; });
      return { rows: rows, cards: Array.prototype.map.call(document.querySelectorAll('#billing-body .bcard h3'), function (h) { return h.firstChild.textContent; }).join('|'), leaving: Array.prototype.map.call(document.querySelectorAll('#bill-sub .bh-mod.leaving'), function (a) { return a.getAttribute('href') + ' ' + a.textContent; }), soon: Array.prototype.map.call(document.querySelectorAll('#bill-sub .bh-mod.soon'), function (a) { return a.getAttribute('href') + ' ' + a.textContent; }), pay: (document.getElementById('bill-pay') || {}).href || null, owe: document.getElementById('bill-owe').textContent.replace(/\s+/g, ' '), open: document.querySelectorAll('#bill-hist .spill.open').length, price: (document.querySelector('#bill-sub .bh-price b') || {}).textContent };
    });
    var st = ch.rows.filter(function (r) { return r.key === 'storage'; })[0] || {}, ga = ch.rows.filter(function (r) { return r.key === 'gridatlas'; })[0] || {};
    ok('lite-changes: Changes in progress sits between the payment method and the history', ch.cards === 'Your subscription|What you owe|Payment method|Changes in progress|Billing history', ch.cards);
    ok('lite-changes: Storage waits for payment with its invoice, the pay-by date and a Pay link, then Cancel request', st.pill === 'Waiting for payment' && /\$200 invoice · pay by Oct 20, 2026 · switches on when paid/.test(st.line) && st.steps === 'Chosen(done)|Pay by Oct 20, 2026(now)|On' && st.pay === 'https://pay.example/inv-1' && st.cancel === 'Cancel request', st);
    ok('lite-changes: Grid Atlas is opting out: on, and billed, until the review on Dec 20, no refund, with Cancel request', ga.pill === 'Opting out' && /Stays on, and billed, until your review on Dec 20, 2026\. No refund/.test(ga.line) && /\|Review on Dec 20, 2026\(now\)\|Off$/.test(ga.steps) && ga.cancel === 'Cancel request' && !ga.pay, ga);
    ok('lite-changes: the subscription\'s chips say the same (Grid Atlas opting out, Storage waiting for payment), the price is the book\'s for what was bought, and what is owed is the $200 with its pay button', ch.leaving.length === 1 && /#module-gridatlas Grid Atlas Opting out/.test(ch.leaving[0]) && ch.soon.length === 1 && /#module-storage .*Waiting for payment/.test(ch.soon[0]) && ch.price === '$750' && ch.pay === 'https://pay.example/inv-1' && /\$200/.test(ch.owe) && /Pay \$200 now/.test(ch.owe) && ch.open === 1, ch);
    await p.click('#bill-req [data-cancel="gridatlas"]'); await wait(500);
    var menu = await p.evaluate(function () { var d = document.getElementById('omega-package-menu'); return { open: !!d, text: d ? d.textContent.replace(/\s+/g, ' ') : '' }; });
    ok('lite-changes: Cancel request opens the one package menu on that module', menu.open && /Grid Atlas/.test(menu.text), { open: menu.open, text: menu.text.slice(0, 200) });
    await p.keyboard.press('Escape'); await wait(200);
    await billingPhone(p, 'lite-changes');
    if (shotsAt) { await p.evaluate(function () { window.location.hash = '#modules'; }); await wait(600); await p.screenshot({ path: path.join(shotsAt, 'lite-changes-modules-1366.png'), fullPage: true }); }
    return {};
  } });
  STORE.pkg = pkgDefault(); STORE.pending = [];

  /* ══ 5c. LITE LABS AS A MEMBER, WITH THE SUMMARY DOWN — a failed read says
     the invoices could not be loaded, with Retry, never "No invoices yet";
     once it answers, a member sees every invoice (GET /api/plan-change is
     readable by any verified member) and no control that changes the plan. ══ */
  var lm = FX.lite(HOST), lmm = lm.docs['omega_orgs/' + lm.org + '/members/uid-lite-owner'];
  lmm.role = 'member';
  lm.packageView = require('../api/_lib/package-access').project({ staff: false, claims: { email_verified: true } }, lm.docs['omega_orgs/' + lm.org + '/billing/current'], lm.docs['omega_orgs/' + lm.org], lmm, Date.now());
  STORE.failSummary = true;
  await scenario('lite-member', lm, { url: '/workspace#billing', steps: async function (p) {
    await p.waitForFunction(function () { return !!document.querySelector('#bill-hist .failed'); }, null, { timeout: 5000 }).catch(function () {});
    var down = await p.evaluate(function () { var t = function (id) { return (document.getElementById(id) || {}).textContent || ''; }; return { hist: t('bill-hist').replace(/\s+/g, ' '), retry: !!document.querySelector('#bill-hist [data-bill="retry"]'), sub: t('bill-sub').replace(/\s+/g, ' ') }; });
    ok('lite-member: a summary that did not load says the invoices could not be loaded, with Retry, never "No invoices yet"', /could not be loaded/.test(down.hist) && down.retry && !/No invoices yet/.test(down.hist) && /Price not available right now/.test(down.sub), down);
    STORE.failSummary = false;
    await p.click('#bill-hist [data-bill="retry"]');
    await p.waitForFunction(function () { return !!document.querySelector('#bill-hist time[datetime="2026-09-20"]'); }, null, { timeout: 5000 }).catch(function () {});
    var up = await p.evaluate(function () { var b = document.getElementById('billing-body'); return { rows: document.querySelectorAll('#bill-hist .irow:not(.head)').length, paid: !!document.getElementById('bill-paid'), cancel: document.querySelectorAll('[data-cancel]').length, stale: /An owner or administrator sees the invoices/.test(b.textContent), role: /Your role\s*Member/.test(document.getElementById('bill-sub').textContent), price: (document.querySelector('#bill-sub .bh-price b') || {}).textContent }; });
    ok('lite-member: after Retry a member sees the invoices and the price, and no control that changes the plan or checks with QuickBooks', up.rows === 1 && !up.paid && up.cancel === 0 && !up.stale && up.role && up.price === '$500', up);
    return {};
  } });
  STORE.failSummary = false;

  await scenario('legacy-enterprise-opt-out', FX.legacyEnterprise(HOST), { url: '/workspace#modules', steps: async function (p) {
    await p.waitForFunction(function () { return document.querySelectorAll('#modules-body [data-mod-act="remove"]').length > 5; });
    var entMods = await p.evaluate(function () { return Array.prototype.map.call(document.querySelectorAll('#modules-body .mod'), function (m) { var a = m.querySelector('.row [data-mod-act]'); return m.getAttribute('data-module') + ':' + m.getAttribute('data-state') + ':' + (a ? a.getAttribute('data-mod-act') : ''); }); });
    ok('legacy Enterprise: every Live module offers Opt out, a partly included one Opt in, and Lite nothing; Enterprise holds all but what its tools only partly open', entMods.every(function (x) { var q = x.split(':'); return q[0] === 'lite' ? q[1] === 'included' && !q[2] : q[1] === 'live' ? q[2] === 'remove' : q[1] === 'part' && q[2] === 'add'; }) && entMods.filter(function (x) { return /:live:/.test(x); }).length >= M.catalog().length - 3, entMods);
    var postsE = STORE.posts.length;
    await p.locator('#modules-body [data-mod-act="remove"][data-module="logic-office"]').click();
    await p.locator('#omega-package-menu').getByRole('button', { name: 'Send opt-out request' }).waitFor({ timeout: 4000 });
    var draft = (await p.locator('#omega-package-menu').textContent()).replace(/\s+/g, ' ');
    ok('legacy Enterprise: opting out of Office names every department that needs it and keeps the agreement: nothing changes today, access stays, Lite stays', M.catalog().filter(function (m) { return m.shelf === 'platform' && m.key !== 'logic-office'; }).every(function (m) { return draft.indexOf(m.name) >= 0; }) && /nothing changes today/.test(draft) && /Lite stays/.test(draft), draft.slice(0, 400));
    await p.keyboard.press('Escape'); await wait(200);
    ok('legacy Enterprise: the request can be dismissed without sending (only the price-free dry run was asked)', await p.locator('#omega-package-menu').count() === 0 && STORE.posts.slice(postsE).every(function (b) { return b.dryRun === true; }) && STORE.posts.length > postsE);
    /* Plan & billing for a plan invoiced by ClearSky and paid by ACH or check */
    await p.evaluate(function () { window.location.hash = '#billing'; }); await wait(600);
    var eb = await p.evaluate(function () { var t = function (id) { var e = document.getElementById(id); return e ? e.textContent.replace(/\s+/g, ' ') : ''; }; return { card: t('bill-card'), hist: t('bill-hist'), sub: t('bill-sub'), pm: (document.querySelector('#bill-card .pmc') || {}).className, paid: document.querySelectorAll('#bill-hist .spill.paid').length }; });
    ok('legacy Enterprise: the payment method is ClearSky\'s invoice paid by ACH or check under the agreement, never "no billing account", beside the $150,000 paid', /\bmanual\b/.test(eb.pm) && /Invoiced by ClearSky/.test(eb.card) && /ACH or check/.test(eb.card) && !/No billing account|No payment method/.test(eb.card) && /\$150,000/.test(eb.hist) && eb.paid === 1 && /Enterprise plan/.test(eb.sub) && /Priced by your agreement/.test(eb.sub), eb);
    await billingPhone(p, 'legacy-enterprise');
    return {};
  } });
  /* ══ 6. THE MARKETPLACE IS THE TOOLS — Lite Labs (packaged) ══
     Tommy, 2026-09-27: "the marketplace should be the old tools that we
     had ... but the modules are paid services tied directly to the
     editor". The page is the tool catalogue in the workspace's chrome:
     every tool, live or locked, and no store (no plans, no module
     shelves; nothing subscribes, opts in or posts). A locked tool names
     the module that carries it, the server's catalogue, and links to that
     module on the Modules page; an old store link (#<module>, #plans) is
     sent there. On the classic home, which has no Modules page, See module
     opens the one menu in place, told what a legacy plan holds by the ONE
     rule with Site Map's half (editorCtx), and a request made there is the
     page's plan until it is withdrawn. A lock that is not a module's
     (awaiting approval, a two-tool product) says why. Site Map's Open
     launches it on the workspace. And the cards are judged on the
     runtime's merged workspace even when it lands first. */
  PACKAGE_VIEW = lt.packageView; STORE.posts = []; STORE.pending = [];
  /* which module carries a tool: the first in catalogue order, the page's rule */
  var CARRIES = {}; M.catalog().forEach(function (m) { (m.tools || []).forEach(function (k) { if (!CARRIES[k]) CARRIES[k] = m; }); });
  var MARKET_CARDS = function () {
    return Array.prototype.map.call(document.querySelectorAll('#market-grid .mkt-card'), function (c) {
      var a = c.querySelector('.mkt-actions .mkt-act');
      return { tool: c.getAttribute('data-tool'), locked: c.classList.contains('locked'), module: c.getAttribute('data-module'), pill: ((c.querySelector('.mkt-cover-badge') || {}).textContent || '').trim(), inLine: ((c.querySelector('.mkt-card-meta.mkt-in') || {}).textContent || '').trim(), act: a ? a.textContent.trim() : '', tag: a ? a.tagName : '', href: (a && a.getAttribute('href')) || '' };
    });
  };
  function badLocked(cards) { return cards.filter(function (c) { var m = CARRIES[c.tool]; return c.locked && m && !(c.module === m.key && c.pill === m.name && c.inLine === 'In ' + m.name && c.href === '/workspace#module-' + m.key && c.act === 'See module ›'); }); }
  /* opts.lateMenu: serve /omega-package-menu.js that many ms late. It is a
     blocking script between omega-tenant.js's auth listener and the page's
     own, so the entitlements land on config's tenant BEFORE the page's
     onAuth runs: the race a slow network gives a pinned host. */
  async function marketContext(fx, opts) {
    var ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, function (r) { var url = r.request().url(); if (/gstatic\.com\/firebasejs/.test(url)) return r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }); return r.fulfill({ status: 200, contentType: 'text/css', body: '' }); });
    if (opts && opts.lateMenu) await ctx.route(/\/omega-package-menu\.js/, function (r) { setTimeout(function () { r.continue().catch(function () {}); }, opts.lateMenu); });
    await ctx.addInitScript(DOUBLE_SRC);
    await ctx.addInitScript(function (cfg) { window.FirebaseDouble.install(window, cfg); }, { user: fx.user, docs: fx.docs, latency: 8, authDomain: HOST });
    return ctx;
  }
  /* THE POST-ENTITLEMENT STATE. The cards are painted several times on the
     way in (the page's own workspace, the runtime's entitlements, the price
     list, the pins); only the last paint is the answer. Checks and clicks
     wait for it: the runtime's merged workspace IS the page's, the price
     list has landed and the pin store answered. A check that took the
     first matching card was flaky, and a race that left the page on an
     unmerged workspace looked like a slow page. */
  function marketSettled(p, ms) {
    return p.waitForFunction(function () {
      return !!(window.OmegaTenant && OmegaTenant.workspace && window.WORKSPACE === OmegaTenant.workspace && window.CAT && CAT.modules.length && CAT.pins && document.querySelectorAll('#market-grid .mkt-card').length > 10);
    }, null, { timeout: ms || 8000 }).then(function () { return true; }, function () { return false; });
  }
  /* Site Map's capability ladder, loaded as the page loads it (a library,
     nothing applied), for the legacy states the classic home's menu reads */
  var CAPS_BOX = { console: console }; require('vm').runInNewContext(fs.readFileSync(path.join(ROOT, 'omega-caps.js'), 'utf8'), CAPS_BOX);
  /* what the ONE rule says a legacy plan holds, from the page's own catalogue
     and tool locks and the editor's tier (OmegaWorkspaceHub.editorCtx): the
     marketplace must give the Modules page's and Site Map's answer */
  function legacyExpected(page, billing, who) {
    var e = HUB.editorCtx(CAPS_BOX.OmegaCaps, billing, who), out = {};
    var c = { packaged: false, modules: [], addons: (billing && billing.addons) || [], tierLevel: page.tierLevel, canOpen: function (k) { return page.open[k] === true; }, tool: function (k) { return Object.prototype.hasOwnProperty.call(page.open, k) ? { key: k } : null; } };
    Object.keys(e || {}).forEach(function (k) { c[k] = e[k]; });
    page.modules.forEach(function (m) { out[m.key] = HUB.moduleState(m, c); });
    return out;
  }
  var LEGACY_PAGE = function () {
    var open = {}; OMEGATools.all().forEach(function (t) { open[t.key] = isUnlockedHere(t); });
    return { states: moduleStates(), open: open, tierLevel: WORKSPACE.tierLevel, modules: CAT.modules.map(function (m) { return { key: m.key, tools: m.tools || [], caps: m.caps || [] }; }) };
  };
  /* the one menu's card for a module: its state (the badge follows it) and its buttons */
  var MENU_CARD = function (key) {
    var d = document.getElementById('omega-package-menu'), c = d && d.querySelector('[data-module-card="' + key + '"]');
    return { open: !!d, card: !!c, state: c ? c.getAttribute('data-state') : '', badge: c ? ((c.querySelector('.opm-badge') || {}).textContent || '') : '', buttons: c ? Array.prototype.map.call(c.querySelectorAll('.opm-act button'), function (b) { return b.textContent.trim(); }) : [], text: c ? c.innerText.replace(/\s+/g, ' ') : '' };
  };
  /* press a button on a module's card in the one menu, by its words */
  async function menuPress(p, key, words) {
    var h = await p.waitForFunction(function (a) { var c = document.querySelector('#omega-package-menu [data-module-card="' + a.key + '"]'); if (!c) return null; var b = Array.prototype.filter.call(c.querySelectorAll('.opm-act button'), function (x) { return x.textContent.trim() === a.words && !x.disabled; })[0]; return b || null; }, { key: key, words: words }, { timeout: 5000 }).catch(function () { return null; });
    if (!h) return false; var el = h.asElement(); if (!el) return false; await el.click(); return true;
  }
  /* See module on a tool's card, on the classic home, until the menu answers */
  async function seeModule(p, tool) {
    for (var tries = 0; tries < 3 && !(await p.$('#omega-package-menu')); tries++) { await p.click('#market-grid .mkt-card[data-tool="' + tool + '"] button.mkt-act').catch(function () {}); await p.waitForSelector('#omega-package-menu', { timeout: 1500 }).catch(function () {}); }
    return !!(await p.$('#omega-package-menu'));
  }
  await (async function () {
    var errs = [], navs = [], calls0 = apiCalls.length, ctx = await marketContext(lt);
    var p = await ctx.newPage(); p.on('pageerror', function (e) { if (!/duplicate-app/.test(e.message)) errs.push(e.message); });
    p.on('framenavigated', function (f) { if (f === p.mainFrame()) navs.push(f.url().slice(base.length)); });
    await p.goto(base + '/marketplace.html?home=workspace', { waitUntil: 'domcontentloaded' });
    var shown = (await marketSettled(p)) && !!(await p.$('#market-grid .mkt-card[data-tool="gridatlas"] a.mkt-act'));
    ok('marketplace: a packaged workspace on the workspace home sees the tool catalogue, locked Grid Atlas among it', shown);
    var st = await p.evaluate(function () {
      function vis(sel) { var e = document.querySelector(sel); if (!e) return false; var r = e.getBoundingClientRect(); return getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden' && r.height > 0; }
      var link = document.querySelector('#mkt-sub a');
      return { h1: (document.querySelector('.mkt-banner h1') || {}).textContent, store: !!document.getElementById('mkt-store'), shelves: document.querySelectorAll('.mkt-mod, .mkt-planc, .mkt-shelf, #mkt-shelves').length,
        worn: document.body.classList.contains('ows-worn') && !!document.querySelector('#topbar.ows-top') && !!document.querySelector('#side-nav.ows-rail'), tabs: !!document.querySelector('.ows-tabs'),
        grid: vis('#market-grid'), tabbar: vis('.mkt-tabbar'), chips: document.querySelectorAll('#mkt-filters .mkt-chip').length, modulesLink: link ? link.getAttribute('href') : null,
        text: document.getElementById('main').innerText, mailto: document.querySelectorAll('#main a[href^="mailto:"]').length };
    });
    st.cards = await p.evaluate(MARKET_CARDS);
    ok('marketplace: the head reads Marketplace and points at Modules; the page wears the workspace chrome with the phone tab bar; the category bar and the cards are on the page, not folded away', st.h1 === 'Marketplace' && st.modulesLink === '/workspace#modules' && st.worn && st.tabs && st.grid && st.tabbar && st.chips >= 5, { h1: st.h1, link: st.modulesLink, worn: st.worn, tabs: st.tabs, grid: st.grid, tabbar: st.tabbar, chips: st.chips });
    ok('marketplace: no store: no #mkt-store, no plan or module shelves, and nothing reads Subscribe or Ask ClearSky or mails anyone', !st.store && !st.shelves && !/\bSubscribe\b|Ask ClearSky/.test(st.text) && !st.mailto, { store: st.store, shelves: st.shelves, mailto: st.mailto, subscribe: /\bSubscribe\b/.test(st.text) });
    var real = st.cards.filter(function (c) { return c.act !== 'Coming soon'; }), wrongLock = real.filter(function (c) { return (lt.liteTools.indexOf(c.tool) >= 0) === c.locked; });
    ok('marketplace: Lite\'s tools are live and every other tool is listed, locked (' + st.cards.length + ' cards)', st.cards.length > 20 && !wrongLock.length, wrongLock.slice(0, 4));
    var lockedN = real.filter(function (c) { return c.locked; }).length, bad = badLocked(real);
    ok('marketplace: every locked tool names the module that carries it (pill and "In <module>") and See module links to it on the Modules page', lockedN > 10 && real.filter(function (c) { return c.locked && !CARRIES[c.tool]; }).length === 0 && !bad.length, bad.slice(0, 3));
    var ga = st.cards.filter(function (c) { return c.tool === 'gridatlas'; })[0] || {}, ed = st.cards.filter(function (c) { return c.tool === 'editor'; })[0] || {};
    ok('marketplace: Grid Atlas reads In Grid Atlas · See module › and links /workspace#module-gridatlas', ga.pill === 'Grid Atlas' && ga.inLine === 'In Grid Atlas' && ga.act === 'See module ›' && ga.href === '/workspace#module-gridatlas', ga);
    /* an action tool starts a new project, and on the workspace home that is the workspace's own launch, never "/" (which sends a workspace-home visit on to the hub and stops there) */
    var sb = st.cards.filter(function (c) { return c.tool === 'sandbox'; })[0] || {};
    ok('marketplace: Site Map, in Lite, offers Open, and Open launches it on the workspace (/workspace#launch-editor); so does the Sandbox', !ed.locked && ed.act === 'Open' && ed.tag === 'A' && ed.href === '/workspace#launch-editor' && !sb.locked && sb.href === '/workspace#launch-sandbox', { editor: ed, sandbox: sb });
    await p.evaluate(function () { window.scrollTo(0, 900); }); await wait(250);
    var stick = await p.$eval('.mkt-tabbar', function (e) { return Math.round(e.getBoundingClientRect().top); });
    ok('marketplace: the category bar sticks under the workspace\'s 56px topbar', stick === 56, stick);
    if (shotsAt) { await p.evaluate(function () { window.scrollTo(0, 0); }); await p.screenshot({ path: path.join(shotsAt, 'marketplace-packaged-1366.png'), fullPage: true }); }
    await p.setViewportSize({ width: 390, height: 844 }); await wait(300);
    await p.evaluate(function () { window.scrollTo(0, 900); }); await wait(250);
    var phone = await p.evaluate(function () {
      var lefts = {}; Array.prototype.forEach.call(document.querySelectorAll('#market-grid .mkt-card'), function (c) { lefts[Math.round(c.getBoundingClientRect().left)] = 1; });
      var tabs = document.querySelector('.ows-tabs');
      return { scroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1, columns: Object.keys(lefts).length, tabs: !!tabs && getComputedStyle(tabs).display === 'grid', stick: Math.round(document.querySelector('.mkt-tabbar').getBoundingClientRect().top) };
    });
    ok('marketplace: on a phone the cards are one column, the category bar sticks under the 54px topbar, the tab bar shows and nothing scrolls sideways', !phone.scroll && phone.columns === 1 && phone.stick === 54 && phone.tabs, phone);
    if (shotsAt) { await p.evaluate(function () { window.scrollTo(0, 0); }); await p.screenshot({ path: path.join(shotsAt, 'marketplace-packaged-390.png') }); }
    await p.setViewportSize({ width: 1366, height: 900 });
    ok('marketplace: the page asked for no quote, change or package catalogue and posted nothing', !STORE.posts.length && !apiCalls.slice(calls0).some(function (c) { return /package-catalog|plan-change/.test(c); }), apiCalls.slice(calls0));
    /* old store links: a module, then the plans, now live on the Modules page */
    navs = [];
    await p.goto(base + '/marketplace.html?home=workspace#storage', { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(function () { return location.pathname === '/workspace'; }, null, { timeout: 8000 }).catch(function () {});
    var fwd = navs.filter(function (u) { return /^\/workspace/.test(u); })[0] || '';
    ok('marketplace: an old store link /marketplace.html#storage is sent on to /workspace#module-storage', fwd === '/workspace?home=workspace#module-storage', navs);
    navs = [];
    await p.goto(base + '/marketplace.html?home=workspace#plans', { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(function () { return location.pathname === '/workspace'; }, null, { timeout: 8000 }).catch(function () {});
    fwd = navs.filter(function (u) { return /^\/workspace/.test(u); })[0] || '';
    ok('marketplace: /marketplace.html#plans is sent on to /workspace#plans', fwd === '/workspace?home=workspace#plans', navs);
    await ctx.close();
    /* the classic home has no Modules page: See module opens the one menu in place, and so does an old link */
    ctx = await marketContext(lt); p = await ctx.newPage(); p.on('pageerror', function (e) { if (!/duplicate-app/.test(e.message)) errs.push(e.message); });
    await p.goto(base + '/marketplace.html?home=classic', { waitUntil: 'domcontentloaded' });
    var settledC = await marketSettled(p);
    var classic = await p.evaluate(function () { var c = document.querySelector('#market-grid .mkt-card[data-tool="gridatlas"]'), b = c && c.querySelector('.mkt-actions .mkt-act'), ed = document.querySelector('#market-grid .mkt-card[data-tool="editor"] .mkt-actions a.mkt-act'); return { worn: document.body.classList.contains('ows-worn'), act: b ? b.tagName + ' ' + b.textContent.trim() : '', inLine: c ? ((c.querySelector('.mkt-in') || {}).textContent || '').trim() : '', links: document.querySelectorAll('#market-grid a[href^="/workspace"]').length, editorHref: ed ? ed.getAttribute('href') : '', caps: !!(window.OmegaCaps && OmegaCaps.editorCan), armed: !!(window.OmegaCaps && OmegaCaps.packageAccess()) }; });
    ok('marketplace (classic home): the catalogue keeps its own chrome; a locked tool names its module and See module is a button, never a link to the workspace; Site Map\'s Open is the dashboard\'s "/", where it always started', settledC && !classic.worn && classic.act === 'BUTTON See module ›' && classic.inLine === 'In Grid Atlas' && !classic.links && classic.editorHref === '/', classic);
    ok('marketplace: Site Map\'s capability ladder is on the page as a library and never armed (no package handed to OmegaCaps, so its ribbon guard cannot swallow See module)', classic.caps && !classic.armed, classic);
    await p.click('#market-grid .mkt-card[data-tool="gridatlas"] button.mkt-act'); await wait(500);
    var menu = await p.evaluate(function () { var d = document.getElementById('omega-package-menu'); return { open: !!d, card: !!(d && d.querySelector('[data-module-card="gridatlas"]')) }; });
    ok('marketplace (classic home): See module opens the one menu on Grid Atlas, in place', menu.open && menu.card, menu);
    await p.keyboard.press('Escape'); await wait(200);
    await p.goto(base + '/marketplace.html?home=classic#gridatlas', { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(function () { return !!document.getElementById('omega-package-menu'); }, null, { timeout: 8000 }).catch(function () {});
    menu = await p.evaluate(function () { var d = document.getElementById('omega-package-menu'); return { path: location.pathname, open: !!d, card: !!(d && d.querySelector('[data-module-card="gridatlas"]')) }; });
    ok('marketplace (classic home): an old link /marketplace.html#gridatlas stays and opens the menu on it', menu.path === '/marketplace.html' && menu.open && menu.card, menu);
    await ctx.close();
    /* THE RACE (2026-09-27 review): the entitlements land before the page's
       own sign-in handler. The page keeps the runtime's merged workspace, or
       every card is judged by no plan (every tool Open, no module named) on
       a page that still believes it is packaged. */
    ctx = await marketContext(lt, { lateMenu: 700 });
    await ctx.addInitScript(function () { var v; Object.defineProperty(window, 'OMEGA_WORKSPACE', { configurable: true, get: function () { return v; }, set: function (x) { if (window.__entFirst === undefined) window.__entFirst = !!(window.OmegaTenant && OmegaTenant.workspace); v = x; } }); });
    p = await ctx.newPage(); p.on('pageerror', function (e) { if (!/duplicate-app/.test(e.message)) errs.push(e.message); });
    await p.goto(base + '/marketplace.html?home=workspace', { waitUntil: 'domcontentloaded' });
    var raced = await marketSettled(p), rc = await p.evaluate(MARKET_CARDS), rs = await p.evaluate(function () { return { first: window.__entFirst, same: !!(window.OmegaTenant && window.WORKSPACE === OmegaTenant.workspace), packaged: CAT.packaged }; });
    var rga = rc.filter(function (c) { return c.tool === 'gridatlas'; })[0] || {}, rWrong = rc.filter(function (c) { return c.act !== 'Coming soon' && (lt.liteTools.indexOf(c.tool) >= 0) === c.locked; });
    ok('marketplace (entitlements before the page\'s own sign-in): the page keeps the runtime\'s merged workspace; Lite\'s tools open, Grid Atlas stays locked and names its module', rs.first === true && raced && rs.same && rs.packaged && !rWrong.length && rga.act === 'See module ›' && rga.href === '/workspace#module-gridatlas', { state: rs, settled: raced, gridatlas: rga, wrong: rWrong.slice(0, 3).map(function (c) { return c.tool + ':' + c.act; }) });
    await ctx.close();
    /* a legacy plan on the classic home: the same menu, in its legacy mode, on the module the public price list names */
    PACKAGE_VIEW = null; STORE.optIns = {}; STORE.optOuts = {}; STORE.posts = [];
    ctx = await marketContext(ns); p = await ctx.newPage(); p.on('pageerror', function (e) { if (!/duplicate-app/.test(e.message)) errs.push(e.message); });
    await p.goto(base + '/marketplace.html?home=classic', { waitUntil: 'domcontentloaded' });
    var settledL = await marketSettled(p);
    /* what the menu is told a legacy plan holds is the ONE rule's answer, Site Map's half included (OmegaWorkspaceHub.editorCtx) */
    var who = { email: ns.user.email, emailVerified: true, orgId: ns.org }, lp = await p.evaluate(LEGACY_PAGE), want = legacyExpected(lp, ns.docs['omega_orgs/' + ns.org + '/billing/current'], who);
    var lDiff = Object.keys(want).filter(function (k) { return lp.states[k] !== want[k]; }).map(function (k) { return k + ':' + lp.states[k] + '≠' + want[k]; });
    ok('marketplace (classic home, legacy Standard): the plan the menu is told is the Modules page\'s and Site Map\'s: Compute Partly included (Site Map shows compute only on Enterprise), Plan Sets and Site Intelligence not on the plan', settledL && lp.modules.length > 10 && !lDiff.length && lp.states.compute === 'part' && lp.states.plansets === 'ask' && lp.states.siteintel === 'ask', { settled: settledL, diff: lDiff, compute: lp.states.compute });
    var opened = await seeModule(p, 'investment');
    menu = await p.evaluate(MENU_CARD, 'finance');
    ok('marketplace (classic home, legacy plan): See module on Site Investment Analysis opens the one menu on Investor & Finance', opened && menu.open && menu.card, menu);
    await p.click('#opm-every').catch(function () {}); await p.waitForSelector('#omega-package-menu [data-module-card="compute"]', { timeout: 3000 }).catch(function () {});
    var comp = await p.evaluate(MENU_CARD, 'compute');
    ok('marketplace (classic home, legacy Standard): See every module shows Compute Partly included with Opt in, never On your plan with Opt out', comp.card && comp.state === 'part' && comp.badge === 'Partly included' && comp.buttons.indexOf('Opt out') < 0 && comp.buttons.indexOf('Opt in') >= 0, comp);
    /* a legacy request is the page's plan from then on: See every module and the next open read Opt-in requested with Cancel request, and a withdrawal reads Opt in again */
    await p.keyboard.press('Escape'); await p.waitForSelector('#omega-package-menu', { state: 'detached', timeout: 2000 }).catch(function () {});
    await seeModule(p, 'investment');
    var asked = (await menuPress(p, 'finance', 'Opt in')) && (await menuPress(p, 'finance', 'Request opt-in'));
    await p.waitForFunction(function () { var c = document.querySelector('#omega-package-menu [data-module-card="finance"]'); return !!c && c.getAttribute('data-state') === 'requested'; }, null, { timeout: 4000 }).catch(function () {});
    var fin = await p.evaluate(MENU_CARD, 'finance');
    await p.click('#opm-every').catch(function () {}); await p.waitForSelector('#omega-package-menu [data-module-card="compute"]', { timeout: 3000 }).catch(function () {});
    var finEvery = await p.evaluate(MENU_CARD, 'finance');
    await p.keyboard.press('Escape'); await p.waitForSelector('#omega-package-menu', { state: 'detached', timeout: 2000 }).catch(function () {});
    await seeModule(p, 'investment');
    var finAgain = await p.evaluate(MENU_CARD, 'finance');
    ok('marketplace (classic home, legacy plan): after Request opt-in, Investor & Finance reads Opt-in requested with Cancel request in the menu, on See every module and on the next open', asked && fin.state === 'requested' && finEvery.state === 'requested' && finAgain.state === 'requested' && finAgain.badge === 'Opt-in requested' && finAgain.buttons.join('|') === 'Cancel request', { asked: asked, now: fin.state, every: finEvery.state, again: finAgain });
    var withdrawn = (await menuPress(p, 'finance', 'Cancel request')) && (await menuPress(p, 'finance', 'Cancel request'));
    await p.waitForFunction(function () { var c = document.querySelector('#omega-package-menu [data-module-card="finance"]'); return !!c && c.getAttribute('data-state') === 'off'; }, null, { timeout: 4000 }).catch(function () {});
    await p.keyboard.press('Escape'); await p.waitForSelector('#omega-package-menu', { state: 'detached', timeout: 2000 }).catch(function () {});
    await seeModule(p, 'investment');
    var finAfter = await p.evaluate(MENU_CARD, 'finance'), legacyPosts = STORE.posts.map(function (b) { return b.action + (b.dryRun ? ' (dry run)' : ''); });
    ok('marketplace (classic home, legacy plan): Cancel request withdraws it, and the next open offers Opt in again; the page asked the server exactly opt-in (dry run), opt-in, withdraw-opt-in', withdrawn && finAfter.state === 'off' && finAfter.buttons.indexOf('Opt in') >= 0 && legacyPosts.join('|') === 'opt-in (dry run)|opt-in|withdraw-opt-in', { withdrawn: withdrawn, after: finAfter, posts: legacyPosts });
    await ctx.close();
    STORE.optIns = {}; STORE.optOuts = {}; STORE.posts = [];
    /* a legacy Deluxe plan: Site Map prints plan sets and screens parcels on Deluxe, so the menu must not offer Plan Sets or Site Intelligence as an opt-in */
    var dx = FX.northstar(HOST); Object.keys(dx.docs).forEach(function (k) { if (/^tenant_public\//.test(k) || k === 'omega_orgs/' + dx.org + '/billing/current') dx.docs[k].tier = 'deluxe'; });
    ctx = await marketContext(dx); p = await ctx.newPage(); p.on('pageerror', function (e) { if (!/duplicate-app/.test(e.message)) errs.push(e.message); });
    await p.goto(base + '/marketplace.html?home=classic', { waitUntil: 'domcontentloaded' });
    var settledD = await marketSettled(p), dp = await p.evaluate(LEGACY_PAGE), dWant = legacyExpected(dp, dx.docs['omega_orgs/' + dx.org + '/billing/current'], { email: dx.user.email, emailVerified: true, orgId: dx.org });
    var dDiff = Object.keys(dWant).filter(function (k) { return dp.states[k] !== dWant[k]; }).map(function (k) { return k + ':' + dp.states[k] + '≠' + dWant[k]; });
    await seeModule(p, 'investment'); await p.click('#opm-every').catch(function () {}); await p.waitForSelector('#omega-package-menu [data-module-card="plansets"]', { timeout: 3000 }).catch(function () {});
    var dm = await p.evaluate(function (keys) { var o = {}; keys.forEach(function (k) { var c = document.querySelector('#omega-package-menu [data-module-card="' + k + '"]'); o[k] = c ? c.getAttribute('data-state') : ''; }); return o; }, ['plansets', 'siteintel', 'compute']);
    ok('marketplace (classic home, legacy Deluxe): Plan Sets and Site Intelligence are On your plan and Compute is Partly included, as the Modules page and Site Map say', settledD && !dDiff.length && dp.states.plansets === 'held' && dp.states.siteintel === 'held' && dp.states.compute === 'part' && dm.plansets === 'on' && dm.siteintel === 'on' && dm.compute === 'part', { settled: settledD, diff: dDiff, menu: dm });
    await ctx.close();
    /* a lock that is not a module's says why, and never points at a module the Modules page calls Live */
    var pd = FX.pending(HOST); ctx = await marketContext(pd); p = await ctx.newPage(); p.on('pageerror', function (e) { if (!/duplicate-app/.test(e.message)) errs.push(e.message); });
    await p.goto(base + '/marketplace.html?home=workspace', { waitUntil: 'domcontentloaded' });
    var settledP = await marketSettled(p), pc = (await p.evaluate(MARKET_CARDS)).filter(function (c) { return c.act !== 'Coming soon'; });
    var pBad = pc.filter(function (c) { return !(c.locked && !c.module && c.pill === 'Awaiting approval' && c.act === 'Opens when ClearSky approves ' + pd.name); }), pLite = await p.evaluate(function () { return document.querySelectorAll('#market-grid a[href="/workspace#module-lite"], #market-grid [data-module="lite"]').length; });
    ok('marketplace (awaiting approval): every tool is locked and says it opens when ClearSky approves ' + pd.name + '; no card names a module, and none points at Lite', settledP && pc.length > 20 && !pBad.length && !pLite, { settled: settledP, bad: pBad.slice(0, 3), lite: pLite });
    await ctx.close();
    var cc = FX.northstar(HOST); cc.docs['omega_orgs/' + cc.org + '/billing/current'].toolAccess = ['editor', 'gridatlas'];
    ctx = await marketContext(cc); p = await ctx.newPage(); p.on('pageerror', function (e) { if (!/duplicate-app/.test(e.message)) errs.push(e.message); });
    await p.goto(base + '/marketplace.html?home=workspace', { waitUntil: 'domcontentloaded' });
    var settledA = await marketSettled(p), ac = await p.evaluate(MARKET_CARDS), aLite = await p.evaluate(function () { return document.querySelectorAll('#market-grid a[href="/workspace#module-lite"], #market-grid [data-module="lite"]').length; });
    function aCard(k) { return ac.filter(function (c) { return c.tool === k; })[0] || {}; }
    var aSb = aCard('sandbox'), aIc = aCard('interconnect');
    ok('marketplace (a two-tool product, billing toolAccess [editor, gridatlas]): Site Map and Grid Atlas open; a Lite tool outside the product says so instead of pointing at Lite; a Grid Atlas tool outside it names Grid Atlas', settledA && !aCard('editor').locked && !aCard('gridatlas').locked && aSb.locked && !aSb.module && aSb.pill === 'Not in your workspace' && aSb.act === 'Not part of this workspace\'s product' && !aLite && aIc.locked && aIc.module === 'gridatlas' && aIc.href === '/workspace#module-gridatlas', { settled: settledA, sandbox: aSb, interconnect: aIc, lite: aLite });
    ok('marketplace: no uncaught errors and no /api/ route this check does not answer', !errs.length && !missing.length, errs.concat(missing));
    console.log(JSON.stringify({ scenario: 'marketplace', cards: st.cards.length, locked: lockedN, posts: STORE.posts.length }));
    await ctx.close();
  })();
  PACKAGE_VIEW = null;

  /* ══ 7. THE FLOW — Projects and Marketplace with the workspace as home ══
     The legacy pages keep their own topbar and CSS, but their rail becomes
     the workspace rail (adopt), Dashboard points at /workspace, the ground
     is the same grid; and a dashboard visit is sent on to /workspace. */
  async function flow(page, current, opts) {
    opts = opts || {};
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
    var settledF = page === '/marketplace.html' ? await marketSettled(p, 5000) : true;
    var out = await p.evaluate(function () {
      var items = Array.prototype.filter.call(document.querySelectorAll('#side-nav .sn-item'), function (a) { return getComputedStyle(a).display !== 'none'; }).map(function (a) { return (a.querySelector('span') || a).textContent.trim() + (a.classList.contains('active') ? '*' : ''); });
      var home = document.querySelector('a[data-sn="dashboard"]');
      function vis(sel) { var e = document.querySelector(sel); return !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().height > 0; }
      return { url: location.pathname, items: items, home: home && home.getAttribute('href'), theme: document.body.classList.contains('ows-theme'), grid: /linear-gradient/.test(getComputedStyle(document.body).backgroundImage), worn: document.body.classList.contains('ows-worn') && !!document.querySelector('#topbar.ows-top') && !!document.querySelector('#side-nav.ows-rail'), h1: (document.querySelector('.mkt-banner h1') || {}).textContent || '',
        store: !!document.getElementById('mkt-store') || !!document.querySelector('.mkt-mod, .mkt-planc'), catalogue: vis('#market-grid') && vis('.mkt-tabbar'), text: (document.getElementById('main') || document.body).innerText, mailto: document.querySelectorAll('#main a[href^="mailto:"]').length };
    });
    if (page === '/marketplace.html') out.cards = await p.evaluate(MARKET_CARDS);
    var name = 'flow ' + page;
    if (page === '/') ok(name + (opts.label || '') + ': a dashboard visit with the workspace as home lands on /workspace', /\/workspace$/.test(out.url), out.url);
    else {
      ok(name + ': the rail is the workspace rail with this page current', out.items.join('|') === 'Home|Projects|All tools|Modules|Marketplace|Quote Desk|Team|Feed|Plan & billing|Settings'.replace(current, current + '*'), out.items);
      ok(name + ': Dashboard points at /workspace and the ground is the blueprint grid', out.home === '/workspace' && out.theme && out.grid, out);
      if (page === '/marketplace.html') {
        /* a legacy (unpackaged) Standard tenant on the workspace home: the tool catalogue in the workspace chrome, no store; a locked tool names the module that carries it (the public price list's) and links to it on the Modules page, a tool no module carries says the plan, a live one opens */
        var real = out.cards.filter(function (c) { return c.act !== 'Coming soon'; }), live = real.filter(function (c) { return !c.locked; }), locked = real.filter(function (c) { return c.locked; });
        var byPlan = locked.filter(function (c) { return !CARRIES[c.tool]; }), inv = out.cards.filter(function (c) { return c.tool === 'investment'; })[0] || {};
        ok(name + ': a legacy tenant sees the tool catalogue in the workspace chrome: no store, the category bar and every tool', settledF && !out.store && out.catalogue && out.worn && out.cards.length > 30 && !/\bSubscribe\b|Ask ClearSky/.test(out.text) && !out.mailto, { settled: settledF, store: out.store, catalogue: out.catalogue, worn: out.worn, cards: out.cards.length, mailto: out.mailto });
        var edF = out.cards.filter(function (c) { return c.tool === 'editor'; })[0] || {}, sbF = out.cards.filter(function (c) { return c.tool === 'sandbox'; })[0] || {};
        ok(name + ': Site Map\'s and the Sandbox\'s Open start them on the workspace (/workspace#launch-<tool>), not at "/", which only sends a workspace-home visit back to the hub', edF.act === 'Open' && edF.href === '/workspace#launch-editor' && sbF.act === 'Open' && sbF.href === '/workspace#launch-sandbox', { editor: edF, sandbox: sbF });
        ok(name + ': every locked tool names the module that carries it and links to it on the Modules page (Site Investment Analysis → /workspace#module-finance); a tool no module carries names its plan; the live ones open', locked.length > byPlan.length && !badLocked(real).length && inv.href === '/workspace#module-finance' && inv.inLine === 'In ' + M.get('finance').name && byPlan.every(function (c) { return /^Included with /.test(c.act); }) && live.length > 10 && live.every(function (c) { return c.act === 'Open'; }), { bad: badLocked(real).slice(0, 3), investment: inv, byPlan: byPlan.map(function (c) { return c.tool + ':' + c.act; }) });
        ok(name + ': the head reads Marketplace', out.h1 === 'Marketplace', out.h1);
        await p.setViewportSize({ width: 390, height: 844 }); await wait(300);
        await p.evaluate(function () { window.scrollTo(0, 1200); }); await wait(250);
        var phone = await p.evaluate(function () { var tabs = document.querySelector('.ows-tabs'), burger = document.getElementById('ows-burger'); return { scroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1, tabs: !!tabs && getComputedStyle(tabs).display === 'grid', burger: !!burger && getComputedStyle(burger).display !== 'none', railHidden: getComputedStyle(document.getElementById('side-nav')).transform !== 'none', stick: Math.round(document.querySelector('.mkt-tabbar').getBoundingClientRect().top) }; });
        ok(name + ': on a phone the tab bar and the burger show, the rail is off-canvas, the category bar sticks under the 54px topbar and nothing scrolls sideways', !phone.scroll && phone.tabs && phone.burger && phone.railHidden && phone.stick === 54, phone);
        if (shotsAt) { await p.evaluate(function () { window.scrollTo(0, 0); }); await p.screenshot({ path: path.join(shotsAt, 'marketplace-390.png'), fullPage: true }); await p.setViewportSize({ width: 1366, height: 900 }); await wait(200); await p.screenshot({ path: path.join(shotsAt, 'marketplace-1366.png'), fullPage: true }); }
      }
      ok(name + ': no uncaught errors', !errs.length, errs);
    }
    console.log(JSON.stringify({ scenario: name + (opts.label || ''), rail: out.items, url: out.url }));
    await ctx.close();
  }
  await flow('/projects.html', 'Projects'); await flow('/marketplace.html', 'Marketplace'); await flow('/', '');
  /* the classic choice: a browser that asked for the classic dashboard is sent there from /workspace, and index keeps it (the same rule on both pages, so no loop) */
  await (async function () {
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
