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
/* the page reads the billing record from Firestore (OmegaTenant.refreshBilling):
   put the fixture's record, with the requests the stub below recorded on it
   (a legacy plan's optIns / optOuts), into the browser's double, as a reload
   would read it */
async function mirrorBilling(p) {
  var fx = CURRENT_FX, at = 'omega_orgs/' + fx.org + '/billing/current', lb = fx.docs[at] || {};
  function merged(field) { var o = {}; Object.keys(lb[field] || {}).forEach(function (k) { o[k] = lb[field][k]; }); Object.keys(STORE[field]).forEach(function (k) { o[k] = STORE[field][k]; }); return o; }
  var doc = Object.assign({}, lb, { optIns: merged('optIns'), optOuts: merged('optOuts') });
  await p.evaluate(function (a) { window.__firebaseDouble.store.put(a.path, a.doc); }, { path: at, doc: JSON.parse(JSON.stringify(doc)) });
}
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
/* STORE.pkg is what the packaged workspace holds (Omega Design alone unless
   a scenario says otherwise); optIns / optOuts are a legacy plan's recorded
   requests, as billing/current keeps them. The monthly figure is the price
   book's own quote (Lite is $500/month), never a number typed here. A reply
   carrying __status is answered with that status. */
var STORE = { posts: [], pending: [], pkg: null, optIns: {}, optOuts: {}, failSummary: false, legacyInvoices: [] };
function pkgDefault() { return { modules: ['lite'], subscription: ['lite'], removals: [] }; }
STORE.pkg = pkgDefault();
/* the rail the packaged stub bills through: null is QuickBooks (the fixtures), 'stripe' the rail Tommy chose on 2026-09-27 */
var STUB_PROVIDER = null;
function storeRoute(u, method, body) {
  var B = require('../api/_lib/pricebook'), P = require('../api/_lib/subscription-pricing'), book = B.proposed();
  function names(list) { return (list || []).map(function (k) { return M.get(k) ? M.get(k).name : k; }); }
  function quote(keys) { try { return P.quote(M.normalize(keys), book, { plan: 'auto' }).display; } catch (e) { return { monthly: null, plan: null }; } }
  function keysOf(list, field) { if (!Array.isArray(list) || !list.length) return { __status: 400, error: field + ' must list modules' }; if (list.indexOf('lite') >= 0) return { __status: 400, error: M.get('lite').name + ' is always included' }; return null; }
  var who = (CURRENT_FX && CURRENT_FX.user && CURRENT_FX.user.email) || 'kim@litelabs.example', at = '2026-09-27T12:00:00.000Z';
  var lb = CURRENT_FX ? (CURRENT_FX.docs['omega_orgs/' + CURRENT_FX.org + '/billing/current'] || {}) : {};
  function legacyIns() { var o = {}; Object.keys(lb.optIns || {}).forEach(function (k) { o[k] = lb.optIns[k]; }); Object.keys(STORE.optIns).forEach(function (k) { o[k] = STORE.optIns[k]; }); return o; }
  function legacyOuts() { var o = {}; Object.keys(lb.optOuts || {}).forEach(function (k) { o[k] = lb.optOuts[k]; }); Object.keys(STORE.optOuts).forEach(function (k) { o[k] = STORE.optOuts[k]; }); return o; }
  if (u === '/api/package-catalog') return { orgId: 'litelabs.example', pricebookVersion: book.version, modules: P.catalog(book), starters: M.starters(), canManage: true };
  if (method === 'GET' && STORE.failSummary) return { __status: 500, error: 'Price book not seeded' };
  if (method === 'GET' && !PACKAGE_VIEW && CURRENT_FX) { return { orgId: CURRENT_FX.org, packaged: false, packagingState: null, plan: null, planDisplay: null, modules: ['lite'], subscription: ['lite'], moduleNames: [M.get('lite').name], subscriptionNames: [M.get('lite').name], interval: 'monthly', billingDay: null, nextInvoiceOn: null, monthlyDisplay: null, accessUntil: null, paidThrough: null, amountDue: lb.amountDue == null ? null : lb.amountDue, paymentLink: null, invoices: STORE.legacyInvoices.slice(), gate: { canApply: false, reason: 'This workspace is not on a subscription package.' }, pending: [], removalRequests: [], recent: [], optIns: legacyIns(), optOuts: legacyOuts(), nextReviewOn: null, addOns: addOnView(lb) }; }
  if (method === 'GET') { var q = quote(STORE.pkg.subscription); return { orgId: 'litelabs.example', packaged: true, packagingState: 'paid', plan: 'lite', planDisplay: q.plan, modules: STORE.pkg.modules, subscription: STORE.pkg.subscription, moduleNames: names(STORE.pkg.modules), subscriptionNames: names(STORE.pkg.subscription), paidThrough: '2026-10-20', accessUntil: null, amountDue: null,
    provider: STUB_PROVIDER || 'quickbooks', payWith: STUB_PROVIDER === 'stripe' ? 'Stripe' : 'QuickBooks',
    invoices: (STUB_PROVIDER === 'stripe' ? [{ id: '2026-10-20', kind: 'subscription', state: 'unpaid', date: '2026-10-20', period: { start: '2026-10-20', end: '2026-11-20' }, totalCents: 50000, display: '$500', paymentLink: 'https://invoice.stripe.com/i/acct_fixture/in_fixture', payWith: 'Stripe', names: null, paidAt: null }] : []).concat([{ id: '2026-09-20', kind: 'subscription', state: 'paid', date: '2026-09-20', period: { start: '2026-09-20', end: '2026-10-20' }, totalCents: 50000, display: '$500', paymentLink: null, names: null, paidAt: '2026-09-21' }]).concat(STORE.pending.map(function (x) { return { id: x.id, kind: 'change', state: 'unpaid', date: '2026-09-27', period: null, totalCents: 20000, display: x.display, paymentLink: x.paymentLink, names: names(x.add), paidAt: null }; })),
    interval: 'monthly', billingDay: 20, nextInvoiceOn: '2026-10-20', monthlyDisplay: q.monthly, gate: { canApply: true }, pending: STORE.pending, removalRequests: STORE.pkg.removals, recent: [], optIns: {}, optOuts: {}, nextReviewOn: '2026-12-20' }; }
  STORE.posts.push(body);
  /* a legacy plan's card add-ons (api/_lib/addons.js): the real quote, a purchase, its cancel, a stop at the end of the paid month and its withdrawal */
  if (/^(withdraw-)?addon-/.test(body.action || '') || (body.action === 'reconcile-now' && !PACKAGE_VIEW)) return addOnRoute(body);
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
  /* a withdrawal takes back what the library's ONE rule says goes with it
     (api/_lib/plan-change.js withdrawSet: cancelling an opt-in takes back
     what needs it; keeping a module keeps what it needs) */
  function withdrawn(map, list, dependents) { try { return { keys: require('../api/_lib/plan-change').withdrawSet(map, list || [], dependents) }; } catch (e) { return { error: { __status: e.status || 409, error: e.message } }; } }
  if (body.action === 'withdraw-opt-in') {
    var ins = legacyIns(), wi = withdrawn(ins, body.add, true); if (wi.error) return wi.error;
    var wk = wi.keys;
    if (body.dryRun === true) return { dryRun: true, withdrawn: wk, names: names(wk), note: 'Nothing about your bill changes.' };
    wk.forEach(function (k) { STORE.optIns[k] = Object.assign({}, ins[k], { status: 'withdrawn', withdrawnAt: at, withdrawnBy: who }); });
    return { ok: true, withdrawn: wk, names: names(wk), optIns: legacyIns() };
  }
  /* a legacy plan's opt-out: a recorded request under the agreement, never a change to the tier */
  if (body.action === 'opt-out') {
    if (PACKAGE_VIEW) return { __status: 409, error: 'This workspace is on a subscription package: opt out through the menu, which queues it for the quarterly review.' };
    var bad2 = keysOf(body.remove, 'remove'); if (bad2) return bad2;
    var reqd = legacyIns(), stale = body.remove.filter(function (k) { return reqd[k] && reqd[k].status === 'requested'; });
    var remove = body.remove.slice(); if (remove.indexOf('logic-office') >= 0 && (lb.addons || []).indexOf('omega-logic') >= 0) M.catalog().forEach(function (m) { if (m.shelf === 'platform' && remove.indexOf(m.key) < 0) remove.push(m.key); });
    var note = 'Your plan\'s price is set by your agreement, so nothing changes today. ClearSky confirms the effective date and any new price with you in writing; you keep access until then. Omega Design stays.';
    /* the preview guard (#197): the dry run's id, and an apply that names another is refused */
    var outPreview = 'o'.repeat(48);
    if (body.dryRun === true) return { dryRun: true, previewId: outPreview, remove: remove, names: names(remove), closes: names(stale), note: note };
    if (body.previewId != null && body.previewId !== outPreview) return { __status: 409, error: 'Your plan changed; review the opt-out request again' };
    remove.forEach(function (k) { STORE.optOuts[k] = { key: k, name: M.get(k).name, requestedBy: who, requestedAt: at, status: 'requested', reason: body.reason || '' }; });
    stale.forEach(function (k) { STORE.optIns[k] = Object.assign({}, reqd[k], { status: 'withdrawn', withdrawnAt: at, withdrawnBy: who, withdrawnFor: 'opt-out' }); });
    return Object.assign({ ok: true, requested: true, remove: remove, names: names(remove), closes: names(stale), optOuts: legacyOuts(), requestedAt: at, note: note }, stale.length ? { optIns: legacyIns() } : {});
  }
  if (body.action === 'withdraw-opt-out') {
    var outs = legacyOuts(), wo = withdrawn(outs, body.remove, false); if (wo.error) return wo.error;
    var ok2 = wo.keys;
    if (body.dryRun === true) return { dryRun: true, withdrawn: ok2, names: names(ok2), note: 'Nothing about your bill changes.' };
    ok2.forEach(function (k) { STORE.optOuts[k] = Object.assign({}, outs[k], { status: 'withdrawn', withdrawnAt: at, withdrawnBy: who }); });
    return { ok: true, withdrawn: ok2, names: names(ok2), optOuts: legacyOuts() };
  }
  /* a packaged opt-out queues for the quarterly review: the dry run names the fee before and after and the review date */
  if (body.action === 'request-removal' || body.action === 'withdraw-removal') {
    var withdraw = body.action === 'withdraw-removal', owned = STORE.pkg.subscription, sel = (body.remove || []).slice();
    if (!sel.length || sel.indexOf('lite') >= 0) return { __status: 400, error: M.get('lite').name + ' is always included' };
    if (!withdraw) owned.forEach(function (k) { if (sel.indexOf(k) < 0 && (M.get(k).requires || []).some(function (r) { return sel.indexOf(r) >= 0; })) sel.push(k); });
    var previewId = (withdraw ? 'w' : 'r').repeat(48);
    /* as the real removal(): "after" takes out everything already queued for that review too, and names it */
    var queuedR = STORE.pkg.removals.map(function (r) { return r.module; }), leavingR = sel.concat(queuedR.filter(function (k) { return sel.indexOf(k) < 0; }));
    if (body.dryRun === true) { var before = quote(owned), after = quote(owned.filter(function (k) { return leavingR.indexOf(k) < 0; })); return { previewId: previewId, modules: sel, names: names(sel), withdraw: withdraw, beforeDisplay: withdraw ? null : before.monthly, afterDisplay: withdraw ? null : after.monthly, reviewOn: '2026-12-20', alsoLeaving: withdraw ? [] : names(queuedR.filter(function (k) { return sel.indexOf(k) < 0 && owned.indexOf(k) >= 0; })),
      note: withdraw ? 'Confirming will withdraw the opt-out request for these modules. Access and billing will stay unchanged.' : 'Confirming queues these modules for the quarterly review with ClearSky. Access and charges stay unchanged until that review; this does not issue a refund.' }; }
    if (body.previewId !== previewId) return { __status: 400, error: 'Your package changed; review the opt-out request again' };
    sel.forEach(function (k) { var i = -1; STORE.pkg.removals.forEach(function (r, n) { if (r.module === k) i = n; }); if (withdraw) { if (i >= 0) STORE.pkg.removals.splice(i, 1); } else if (i < 0) STORE.pkg.removals.push({ module: k, requestedAt: Date.parse(at), by: who, reason: '' }); });
    return { ok: true, removalRequests: STORE.pkg.removals, modules: sel, names: names(sel), note: withdraw ? 'The opt-out request is withdrawn for these modules. Access and billing are unchanged.' : 'Queued for the quarterly review with ClearSky. Access and charges stay unchanged until that review; this does not issue a refund.' };
  }
  if (body.action === 'reconcile-now') return { orgId: 'litelabs.example', packaged: true, packagingState: 'paid', paid: true, provider: STUB_PROVIDER || 'quickbooks', payWith: STUB_PROVIDER === 'stripe' ? 'Stripe' : 'QuickBooks', checkedAt: Date.now() };
  if (body.action === 'quote') return { orgId: 'litelabs.example', previewId: 'a'.repeat(48), effectiveAt: Date.now(), add: body.add, addNames: body.add.map(function (k) { return M.get(k).name; }), modules: ['lite'].concat(body.add), plan: 'lite', included: false, canApply: true, reason: null, pending: [], steer: null, serviceFeeNote: null,
    display: { today: 'Pay $200 today (prorated to Oct 20)', then: 'Then $250/month more from Oct 20', activation: 'Switches on when the payment clears' } };
  if (body.action === 'apply') { var rec = { id: 'change-' + body.previewId, add: body.add, display: '$200', expiresOn: '2026-10-03', paymentLink: 'https://pay.example/inv-1', state: 'unpaid' }; STORE.pending = [rec]; return { state: 'unpaid', changeId: rec.id, display: rec.display, expiresOn: rec.expiresOn, paymentLink: rec.paymentLink }; }
  if (body.action === 'cancel') { STORE.pending = []; return { state: 'cancelled', changeId: body.changeId }; }
  return { error: 'render-workspace does not answer ' + body.action };
}
/* A legacy plan's card add-ons (api/_lib/addons.js): the REAL quote on the
   scenario's own billing record, so the words and the price on the page are
   the server's; buying records one invoice waiting for payment (the page
   must send the quote's own id), "I've paid" answers paid once the scenario
   says the payment landed, addon-cancel with an id cancels that purchase,
   and addon-cancel / withdraw-addon-cancel with modules stop a paid add-on
   at the end of the month paid for and keep it again, in the shapes
   AO.stop returns (the dry run states the money first). The GET summary's
   addOns is AO.view's shape (addOnView). */
var ADDON = { paid: false, entry: null, bought: [], ending: {} };
function addOnReset() { ADDON = { paid: false, entry: null, bought: [], ending: {} }; }
var PAY_URL = 'https://connect.intuit.com/portal/app/CommerceNetwork/view/scs-render-test';
function addOnEnding() { return Object.keys(ADDON.ending).filter(function (k) { return ADDON.ending[k].status === 'requested'; }); }
function addOnView(lb) {
  var a = (lb && lb.addOns) || null, waiting = ADDON.entry && !ADDON.paid ? [Object.assign({ payWith: 'QuickBooks' }, ADDON.entry)] : [];
  if (!a && !waiting.length && !ADDON.paid) return null;
  a = a || {};
  var mods = ADDON.paid ? ADDON.bought.slice() : (a.modules || []), live = ADDON.paid ? ADDON.bought.slice() : (a.live || []);
  function nm(keys) { return keys.map(function (k) { return M.get(k).name; }); }
  return { modules: mods, names: nm(mods), live: live, liveNames: nm(live), state: ADDON.paid ? 'paid' : waiting.length ? 'awaiting_payment' : (a.state || 'none'),
    monthlyCents: a.monthlyCents || 0, monthlyDisplay: a.monthlyDisplay || (ADDON.paid ? '$1,500/month' : null), billingDay: a.billingDay || (ADDON.paid ? 27 : null), nextInvoiceOn: a.nextInvoiceOn || (ADDON.paid ? '2026-10-27' : null),
    paidThrough: a.paidThrough || null, accessUntil: a.accessUntil == null ? null : a.accessUntil, pending: waiting.length ? waiting : (a.pending || []),
    ending: addOnEnding().map(function (k) { return { key: k, name: M.get(k).name, endsOn: ADDON.ending[k].endsOn, requestedAt: ADDON.ending[k].requestedAt }; }), payWith: 'QuickBooks' };
}
function addOnRoute(body) {
  var AO = require('../api/_lib/addons'), B = require('../api/_lib/pricebook'), book = B.proposed(); book.enabled = true;
  var fx = CURRENT_FX, bill = fx.docs['omega_orgs/' + fx.org + '/billing/current'] || {}, now = Date.now();
  var c = { root: { id: fx.org }, org: Object.assign({}, fx.docs['omega_orgs/' + fx.org], { packagingSandbox: true }), billing: bill, billingExists: true, profile: { legalName: fx.name || fx.org }, book: book };
  var env = { b: process.env.PACKAGING_BILLING_ENABLED, q: process.env.QBO_ENV };
  process.env.PACKAGING_BILLING_ENABLED = 'true'; process.env.QBO_ENV = 'sandbox';
  function fail(status, message) { var e = new Error(message); e.status = status; throw e; }
  try {
    if (body.action === 'reconcile-now') return { orgId: fx.org, packaged: false, checkedAt: now, addOns: ADDON.paid ? { live: ADDON.bought.slice(), pending: [], state: 'paid', nextInvoiceOn: '2026-10-27' } : { live: [], pending: ADDON.entry ? [Object.assign({ payWith: 'QuickBooks' }, ADDON.entry)] : [] } };
    if (body.action === 'addon-cancel' && body.addOnId != null && body.remove != null) fail(400, 'Name a purchase or modules, not both');
    if (body.action === 'addon-cancel' && body.remove == null) { ADDON.entry = null; return { ok: true, addOnId: body.addOnId, state: 'cancelled' }; }
    if (body.action === 'addon-cancel' || body.action === 'withdraw-addon-cancel') {
      /* the stop of a PAID add-on (AO.stop): on until the month paid for ends, never renewed; the withdrawal keeps it */
      var withdraw = body.action === 'withdraw-addon-cancel', want = (body.remove || []).slice(), ending = addOnEnding(), have = ADDON.paid ? ADDON.bought : [];
      want.forEach(function (k) { if (have.indexOf(k) < 0) fail(409, M.get(k).name + ' is not an add-on on your plan.'); if (withdraw ? ending.indexOf(k) < 0 : ending.indexOf(k) >= 0) fail(409, withdraw ? 'No request to withdraw' : 'Already requested'); });
      var keys = want.slice();
      if (!withdraw) have.forEach(function (o) { if (keys.indexOf(o) < 0 && ending.indexOf(o) < 0 && (M.get(o).requires || []).some(function (r) { return keys.indexOf(r) >= 0; })) keys.push(o); });
      var endsOn = '2026-10-27', names = keys.map(function (k) { return M.get(k).name; }), list = names.length < 2 ? names.join('') : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
      var note = withdraw ? list + (keys.length > 1 ? ' stay' : ' stays') + ' on and renew' + (keys.length > 1 ? '' : 's') + ' on ' + endsOn + ': your add-ons stay $1,500/month.'
        : list + (keys.length > 1 ? ' stay' : ' stays') + ' on until ' + endsOn + ', the end of the month you paid for, and ' + (keys.length > 1 ? 'are' : 'is') + ' not renewed. Nothing is billed for add-ons after that. No refund for time already paid. Your plan and its billing stay exactly as they are.';
      if (body.dryRun === true) return { dryRun: true, remove: keys, names: names, endsOn: endsOn, beforeDisplay: '$1,500/month', afterDisplay: withdraw ? '$1,500/month' : '$0/month', withdraw: withdraw, note: note };
      var at = new Date(now).toISOString();
      keys.forEach(function (k) { ADDON.ending[k] = withdraw ? Object.assign({}, ADDON.ending[k], { status: 'withdrawn', withdrawnAt: at }) : { key: k, name: M.get(k).name, endsOn: endsOn, requestedAt: at, status: 'requested' }; });
      return { ok: true, withdrawn: withdraw, remove: keys, names: names, endsOn: endsOn, afterDisplay: withdraw ? '$1,500/month' : '$0/month', ending: JSON.parse(JSON.stringify(ADDON.ending)), note: note };
    }
    var q = AO.quote(c, [], { add: body.add }, now, false);
    if (body.action === 'addon-quote') return q;
    if (body.previewId !== q.previewId) fail(409, 'The price changed; review it again before paying');
    ADDON.bought = q.add.slice();
    ADDON.entry = { id: 'addon-' + q.previewId, purpose: 'purchase', add: q.add, names: q.addNames, totalCents: q.todayCents, display: q.display.amount, paymentLink: PAY_URL, date: q.cycle.start, expiresOn: q.cycle.end };
    return { ok: true, addOnId: ADDON.entry.id, state: 'awaiting_payment', add: q.add, addNames: q.addNames, todayCents: q.todayCents, display: q.display.amount, paymentLink: PAY_URL, payLinkMissing: false, payWith: 'QuickBooks', expiresOn: q.cycle.end, monthlyDisplay: q.monthlyDisplay, live: [] };
  } finally { process.env.PACKAGING_BILLING_ENABLED = env.b; process.env.QBO_ENV = env.q; if (env.b === undefined) delete process.env.PACKAGING_BILLING_ENABLED; if (env.q === undefined) delete process.env.QBO_ENV; }
}
/* Plan & billing's card through Stripe (api/stripe-customer.js), answered
   in the real endpoint's shapes from the scenario's own billing record (the
   endpoint itself is scripts/test-stripe-customer.js's). The pages it hands
   back are Stripe's; a check catches the tab going there. */
var CARD = { posts: [], dueOpen: null, paid: false, invoices: null };
function cardRoute(body) {
  CARD.posts.push(body.action);
  var fx = CURRENT_FX, bl = (fx && fx.docs['omega_orgs/' + fx.org + '/billing/current']) || {}, packaged = bl.packaged === true, linked = !!bl.stripeCustomerId, owe = Number(bl.amountDue) || 0;
  var due = !packaged && owe > 0 ? { cents: Math.round(owe * 100), display: '$' + owe.toLocaleString('en-US'), date: bl.subscriptionDue ? String(bl.subscriptionDue).slice(0, 10) : null, open: CARD.dueOpen } : null;
  if (body.action === 'view') return { orgId: fx.org, rail: 'stripe', packaged: packaged, linked: linked, mode: 'live', card: linked ? { type: 'card', brand: 'visa', last4: '4242', label: 'Visa ending 4242', expires: '12/2030' } : null, canLink: true, reason: null, due: due, canPay: !!due && !bl.paymentLink, payReason: due ? null : 'Nothing is owed right now.' };
  if (body.action === 'card') return { url: 'https://billing.stripe.com/p/session/test_card' };
  if (body.action === 'portal') return { url: 'https://billing.stripe.com/p/session/test_portal' };
  if (body.action === 'pay') { CARD.dueOpen = { invoiceId: 'in_due', url: 'https://invoice.stripe.com/i/acct_fixture/in_due', number: 'CS-0001' }; return { state: 'open', url: CARD.dueOpen.url, invoiceId: 'in_due', display: due ? due.display : '' }; }
  if (body.action === 'check') return CARD.paid ? { state: 'paid', invoiceId: 'in_due', recorded: true, due: null } : { state: 'open', invoiceId: 'in_due', recorded: false, due: due };
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
    if (u === '/api/stripe-invoices' && post) return json({ connected: true, orgId: CURRENT_FX && CURRENT_FX.org, invoices: CARD.invoices || [
      { id: 'in_2', number: 'NS-0002', status: 'paid', amountDue: 1250, created: Date.now() - 10 * 86400e3, hostedUrl: 'https://invoice.stripe.com/i/test_2', pdfUrl: null },
      { id: 'in_1', number: 'NS-0001', status: 'paid', amountDue: 1250, created: Date.now() - 40 * 86400e3, hostedUrl: 'https://invoice.stripe.com/i/test_1', pdfUrl: null } ] });
    if (u === '/api/stripe-portal' && post) return json({ url: 'https://billing.stripe.com/p/session/test_northstar' });
    if (u === '/api/stripe-customer' && post) { var cb = []; req.on('data', function (c) { cb.push(c); }); req.on('end', function () { var body = {}; try { body = JSON.parse(Buffer.concat(cb).toString()); } catch (e) {} json(cardRoute(body)); }); return; }
    if (u === '/api/package-catalog' || u === '/api/plan-change') {
      var chunks = []; req.on('data', function (c) { chunks.push(c); }); req.on('end', function () { var body = {}; try { body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {}; } catch (e) {}
        Promise.resolve().then(function () { return storeRoute(u, req.method, body); }).then(function (r) { var st = r && r.__status; if (st) delete r.__status; json(r, st || 200); }, function (e) { json({ error: e.message }, e.status || 500); }); }); return;
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
    var errs = [], muted = false, ctx = await browser.newContext({ viewport: opts.phone ? { width: 390, height: 844 } : { width: 1366, height: 900 }, hasTouch: !!opts.phone, isMobile: !!opts.phone, timezoneId: opts.tz || undefined });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, function (r) {
      var url = r.request().url();
      if (/gstatic\.com\/firebasejs/.test(url)) return r.fulfill({ status: 200, contentType: 'text/javascript', body: '/* firebase is scripts/_lib/firebase-double.js here */' });
      if (/fonts\.(googleapis|gstatic)\.com/.test(url)) return r.fulfill({ status: 200, contentType: 'text/css', body: '' });
      external.push(name + ': ' + url.slice(0, 120)); return r.abort();
    });
    await ctx.addInitScript(DOUBLE_SRC);
    await ctx.addInitScript(function (cfg) { window.FirebaseDouble.install(window, cfg); }, { user: fx.user, docs: fx.docs, latency: 8, authDomain: HOST });
    /* a scenario's own clock or shim, before any page script runs */
    if (opts.init) await ctx.addInitScript(opts.init);
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
    function isMine(h) { return h === '1' || h === 'bought' || h === 'removing'; }
    var mine = order.held.filter(isMine).length;
    ok(name + ': Your modules come first, then the rest to add', order.heads[0] === (mine ? 'Your modules' : 'Every module') && order.held.slice(0, mine).every(isMine) && (order.heads.length === 1 || order.heads[1] === 'Add to your plan'), { heads: order.heads, held: order.held });
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
    await newProjectPanel(p, 'newco');
    /* Customize: a toggle saves to the person's own layout record only (Customize is the home board's: Team and Feed are pages) */
    await p.evaluate(function () { window.location.hash = ''; }); await wait(150);
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
    await modulesFit(p, 'northstar');
    var live = legacyMods.rows.filter(function (r) { return r.state === 'live'; }), part = legacyMods.rows.filter(function (r) { return r.state === 'part'; }), avail = legacyMods.rows.filter(function (r) { return r.state === 'available'; });
    var PILLS = ['● Live', '● Live · always included', 'Opting out', 'Waiting for payment', 'Bought · not on yet', 'Opt-in requested', 'Partly included', 'Not on your plan'];
    ok('northstar: a legacy plan\'s Modules page lists every module, each with one contract pill and at most one action', legacyMods.cards === M.catalog().length && legacyMods.rows.every(function (r) { return PILLS.indexOf(r.pill) >= 0 && r.acts.length <= 1; }) && /holds \d+ of \d+ modules/.test(legacyMods.sub) && !/Subscribe|Keep module|\bAsk\b/.test(legacyMods.text), legacyMods.rows.filter(function (r) { return PILLS.indexOf(r.pill) < 0 || r.acts.length > 1; }));
    /* the legacy tier wears the price book's word: standard reads Field (Tommy, 2026-09-28) */
    ok('northstar: Omega Design is always included with no action; every other Live module offers Opt out and reads Included in Field', byK.lite.state === 'included' && !byK.lite.acts.length && live.length > 0 && live.every(function (r) { return r.acts[0] === 'remove:Opt out' && r.price === 'Included in Field'; }), live);
    ok('northstar: a partly included module says how much and offers Opt in for the rest, never Opt out', part.length > 0 && part.every(function (r) { return /^add:Opt in/.test(r.acts[0]) && /adds the rest/.test(r.note); }), part);
    ok('northstar: a module not on the plan is priced and offers Opt in with that price, and says the billing is shown before anything is charged', avail.length > 0 && avail.every(function (r) { return /\$\d/.test(r.price) && r.acts[0] === 'add:Opt in' && r.note.indexOf(r.price) >= 0 && /Opting in shows how it is billed before anything is charged/.test(r.note); }), avail.slice(0, 3));
    /* the ONE legacy rule on Standard (the editor's gates, read off the real editor): Omega Design, Omega EV and Omega Permits are held; nine are partly on */
    ok('northstar: Standard holds Omega Design, Omega EV and Omega Permits and is partly on nine modules, as Site Map opens them', legacyMods.rows.filter(function (r) { return r.held === '1'; }).map(function (r) { return r.key; }).sort().join() === 'evrebates,lite,permitting' && part.length === 9, legacyMods.rows.map(function (r) { return r.key + ':' + r.state; }));
    ok('northstar: the Modules page agrees with Site Map: Plan Sets is not held on Standard although no tool of its is locked', byK.plansets && byK.plansets.state !== 'live', byK.plansets);
    await p.evaluate(function () { window.location.hash = '#plans'; }); await wait(400);
    var lplans = await p.evaluate(function () { var sh = document.getElementById('modules-plans'); return { n: sh.querySelectorAll('.planc').length, on: sh.querySelectorAll('.planc.on').length, note: (sh.querySelector('.plans-note') || {}).textContent || '' }; });
    ok('northstar: a legacy plan\'s plans shelf says its price is the agreement\'s and marks no book plan as its own', lplans.n === 4 && lplans.on === 0 && /Northstar Development/.test(lplans.note) && /Field plan, priced by your agreement/.test(lplans.note), lplans);
    /* Enterprise is a contract (2026-09-27: "contact for pricing"): no figure, a way to reach ClearSky */
    var ent = await p.evaluate(function () { var c = document.querySelector('#modules-plans .planc[data-plan-card="enterprise"]'), a = c && c.querySelector('a[href^="mailto:"]'); return c ? { text: c.textContent.replace(/\s+/g, ' '), contact: a ? a.getAttribute('href') : '' } : null; });
    ok('northstar: Enterprise on the plans shelf reads Contact for pricing, names no figure and offers Contact ClearSky', !!ent && /Contact for pricing/.test(ent.text) && !/\$/.test(ent.text) && /^mailto:/.test(ent.contact) && /Contact ClearSky/.test(ent.text), ent);
    await p.evaluate(function () { window.location.hash = '#modules'; }); await wait(250);
    /* OPT OUT → the one menu on that module, straight to its step, the money said, a recorded request (never an email) */
    var outKey = live[0].key, posts0 = STORE.posts.length;
    await p.click('#modules-body .mod[data-module="' + outKey + '"] [data-mod-act="remove"]');
    await p.locator('#omega-package-menu').getByRole('button', { name: 'Send opt-out request' }).waitFor({ timeout: 4000 });
    var outPanel = await p.evaluate(function () { var m = document.getElementById('omega-package-menu'); return { text: m.textContent, cards: m.querySelectorAll('section').length }; });
    ok('northstar: Opt out opens the one menu on that module alone, straight to the opt-out, saying nothing changes today and access stays', outPanel.cards === 1 && /nothing changes today/.test(outPanel.text) && /you keep access until then/.test(outPanel.text) && /Omega Design stays/.test(outPanel.text), outPanel);
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
    /* OPT IN → the server says first whether the plan can switch it on by
       itself (plan-change addon-quote, api/_lib/addons.js exact()): on
       the storefront never is (ClearSky sets it up), so the menu says why in the server's words and records the
       request with its price, never a price to pay now; the card reads
       Opt-in requested */
    var inKey = 'whitelabel', posts1 = STORE.posts.length;
    await p.click('#modules-body .mod[data-module="' + inKey + '"] [data-mod-act="add"]');
    await p.locator('#omega-package-menu').getByRole('button', { name: 'Request opt-in' }).waitFor({ timeout: 4000 });
    var inPanel = await p.locator('#omega-package-menu').textContent();
    ok('northstar: Opt in states the monthly price and that nothing is charged before the first invoice is approved', /Opt in to .* for \$[\d,]+\/month\?/.test(inPanel) && /Nothing is charged/.test(inPanel), inPanel.slice(0, 400));
    ok('northstar: ...and why it is a request: the server\'s own reason, never "Pay $… now", "Add to plan" or "Ask ClearSky"', /cannot be added .*on its own/.test(inPanel) && /ClearSky can include it by moving the workspace onto a package/.test(inPanel) && !/Pay \$|Opt in and pay|Add to plan|Ask ClearSky/.test(inPanel), inPanel.slice(0, 500));
    if (shotsAt) await p.screenshot({ path: path.join(shotsAt, 'legacy-not-exact.png') });
    await p.locator('#omega-package-menu').getByRole('button', { name: 'Request opt-in' }).click(); await wait(400);
    await p.keyboard.press('Escape'); await wait(300);
    var afterIn = (await modsNow()).rows.filter(function (r) { return r.key === inKey; })[0];
    ok('northstar: the opt-in is recorded once and the card reads Opt-in requested with Cancel request', STORE.posts.slice(posts1).map(function (b) { return b.action + (b.dryRun ? '?' : ''); }).join() === 'addon-quote,opt-in?,opt-in' && afterIn.state === 'requested' && afterIn.acts[0] === 'cancel:Cancel request', afterIn);
    /* ...and read back as the page does after a reload: what the server recorded is on the billing record */
    await mirrorBilling(p);
    await p.evaluate(function () { return window.OmegaTenant.refreshBilling(); }); await wait(400);
    var reread = (await modsNow()).rows.filter(function (r) { return r.key === inKey; })[0];
    ok('northstar: read again from the billing record, the recorded opt-in still reads Opt-in requested with Cancel request', reread.state === 'requested' && reread.pill === 'Opt-in requested' && reread.acts[0] === 'cancel:Cancel request', reread);
    await p.click('#modules-body .mod[data-module="' + inKey + '"] [data-mod-act="cancel"]');
    await p.locator('#omega-package-menu .opm-primary', { hasText: 'Cancel request' }).click(); await wait(400);
    await p.keyboard.press('Escape'); await wait(300);
    var inBack = (await modsNow()).rows.filter(function (r) { return r.key === inKey; })[0];
    ok('northstar: a cancelled opt-in is simply on offer again', inBack.state === 'available' && /^add:Opt in/.test(inBack.acts[0]) && STORE.posts[STORE.posts.length - 1].action === 'withdraw-opt-in', inBack);
    await p.keyboard.press('Escape');
    /* an editor module the plan can switch on exactly (the editor opens a
       live add-on's own commands, never the whole tab) is a card purchase:
       the server's price today and Opt in and pay, never the request */
    await p.click('#modules-body .mod[data-module="storage"] [data-mod-act="add"]');
    await p.locator('#omega-package-menu').getByRole('button', { name: 'Opt in and pay' }).waitFor({ timeout: 4000 });
    var buyPanel = (await p.locator('#omega-package-menu').textContent()).replace(/\s+/g, ' ');
    ok('northstar: Opt in on Storage, which Standard switches on exactly as an add-on, is a card purchase: the server\'s price and Opt in and pay, never a request', /\$[\d,]+/.test(buyPanel) && !/Request opt-in/.test(buyPanel), buyPanel.slice(0, 400));
    await p.keyboard.press('Escape'); await wait(300);
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
    ok('northstar: the numbers are the board\'s (4 in flight, the candidate included, 3 new this week), the capex people entered with the unpriced candidate counted, and 1 quote back of 2 sent', kpi[0] === '4' && labels[0] === 'Projects in flight=4 (+3 this week)' && labels[2] === 'Pipeline capex=$11M (1 project not priced yet)' && labels[3] === 'Quotes back=1 (of 2 sent)', labels);
    var needs = await p.$$eval('#today .next .row', function (r) { return r.map(function (x) { return x.getAttribute('data-key').split(':')[0] + ':' + x.querySelector('b').textContent; }); });
    ok('northstar: Needs you leads with the vendor who answered Riverside (a decision waiting), then Ann\'s to-do due in three days, then the projects with a next action, then the deal in review at ClearSky for nine days', /^quotes:1 vendor answered your Riverside BESS request/.test(needs[0]) && /^todo:Send the Riverside one-line/.test(needs[1]) && needs.slice(2, 5).every(function (n) { return /^next:/.test(n); }) && /^review:Maple Yard Storage has been in review for 9 days/.test(needs[5]), needs);
    var rowAct = await p.evaluate(function () { var r = document.querySelector('#today .next .row[data-key^="review:"]'); return { cursor: getComputedStyle(r).cursor, pill: r.querySelector('a.ows-pill, button.ows-pill') ? getComputedStyle(r.querySelector('a.ows-pill, button.ows-pill')).backgroundColor : '' }; });
    ok('northstar: a Needs-you row is a target (pointer) and its pill is painted', rowAct.cursor === 'pointer' && rowAct.pill !== 'rgba(0, 0, 0, 0)', rowAct);
    out.needs = needs;
    var people = await p.evaluate(function () { var panels = document.querySelectorAll('#around .panel'); for (var i = 0; i < panels.length; i++) { var h = panels[i].querySelector('h3'); if (h && h.textContent === 'People') return panels[i].querySelectorAll('.people .pr').length; } return 0; });
    var feed = await p.$eval('#feed', function (e) { return e.textContent; });
    ok('northstar: People lists both teammates and the feed carries Raj\'s message', people === 2 && /interconnection study came back clean/.test(feed), { people: people });
    /* the feed and People agree (Tommy, 2026-09-27: "last login versus when
       they did"): a project save records when, not who, so it is the
       project's line and never its owner "moving" it; Raj was last seen when
       he posted, not at his older visit */
    var agree = await p.evaluate(function () {
      var evs = Array.prototype.map.call(document.querySelectorAll('#feed .ev'), function (e) { return { av: e.querySelector('.av').className, b: e.querySelector('b') ? e.querySelector('b').textContent : '', t: e.querySelector('.t').textContent }; });
      var raj = Array.prototype.filter.call(document.querySelectorAll('.people .pr'), function (r) { return /Raj/.test(r.textContent); })[0];
      return { evs: evs, raj: raj ? raj.querySelector('small').textContent.trim() : '' };
    });
    var projEv = agree.evs.filter(function (e) { return /Riverside BESS/.test(e.t) && !/study/.test(e.t); })[0];
    ok('northstar: a project save is the project\'s own line (was saved · stage), credited to nobody', projEv && /proj/.test(projEv.av) && !projEv.b && /^Riverside BESS was saved · /.test(projEv.t) && !agree.evs.some(function (e) { return /^moved /.test(e.t); }), agree.evs);
    ok('northstar: People dates Raj by his message this morning, not his visit two days ago', /^(Seen \d+h ago|In the workspace)/.test(agree.raj), agree.raj);
    ok('northstar: the Assign just made is in the feed, credited to the person who made it', agree.evs.some(function (e) { return e.b === 'You' && e.t === 'assigned Quarry Road to Raj Patel'; }), agree.evs);
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
    ok('northstar: a locked tile says which plan and module carry it and offers to opt in to that module here, never the Marketplace', /Enterprise/.test(why) && why.indexOf('Opt in to ' + M.get('finance').name) >= 0 && !/Marketplace/.test(why), why.slice(0, 200));
    var seeIt = await p.$eval('.ows-drawer a.ows-row[data-row="see"]', function (a) { return a.getAttribute('href'); }).catch(function () { return null; });
    ok('northstar: the locked tile links the module\'s own card on Modules', seeIt === '/workspace#module-finance', seeIt);
    await p.keyboard.press('Escape'); await wait(150);
    /* Plan & billing from the rail: a page with the subscription, what is owed and when, the card, the history */
    await p.click('#side-nav .sn-item[data-key="billing"]'); await wait(600);
    await p.waitForFunction(function () { return /NS-0001/.test((document.getElementById('billing-body') || {}).textContent || ''); }, null, { timeout: 4000 }).catch(function () {});
    var bill = await p.evaluate(function () { var v = document.getElementById('content').getAttribute('data-view'), t = document.getElementById('billing-body').textContent.replace(/\s+/g, ' '); return { view: v, text: t, cards: Array.prototype.map.call(document.querySelectorAll('#billing-body .bcard h3'), function (h) { return h.firstChild.textContent; }), portal: !!document.getElementById('bill-portal'), stripeLinks: document.querySelectorAll('#bill-hist a[href^="https://invoice.stripe.com/"]').length, cardInputs: document.querySelectorAll('#billing-body input').length }; });
    ok('northstar: Plan & billing is a page: the subscription, what you owe, the payment method and the history', bill.view === 'billing' && bill.cards.join('|') === 'Your subscription|What you owe|Payment method|Billing history', bill.cards);
    ok('northstar: a Stripe-billed plan says the card lives with Stripe, offers the portal, and says nothing is owed with the next payment date', bill.portal && /Stripe/.test(bill.text) && /nothing is owed/.test(bill.text) && /Next invoice/.test(bill.text) && /Field/.test(bill.text), bill.text.slice(0, 300));
    ok('northstar: the billing history lists what Stripe billed, each with its invoice page', /NS-0002/.test(bill.text) && /NS-0001/.test(bill.text) && bill.stripeLinks === 2, { links: bill.stripeLinks, text: bill.text.slice(-200) });
    var hist = await p.evaluate(function () { return { paid: document.querySelectorAll('#bill-hist .spill.paid').length, statusButtons: Array.prototype.filter.call(document.querySelectorAll('#bill-hist a.ows-pill'), function (a) { return /^paid$/i.test(a.textContent.trim()); }).length, times: Array.prototype.map.call(document.querySelectorAll('#bill-hist time'), function (t) { return t.textContent; }), pm: (document.querySelector('#bill-card .pmc') || {}).className, members: /An owner or administrator sees the invoices/.test(document.getElementById('billing-body').textContent), stale: /Marketplace|Plans and the store/.test(document.getElementById('billing-body').textContent) }; });
    ok('northstar: each invoice carries one status pill (Paid), never a button that says paid, dated in the one style, the card drawn as Stripe\'s, and no link to the store', hist.paid === 2 && hist.statusButtons === 0 && hist.times.every(function (t) { return /^[A-Z][a-z]{2} \d{1,2}, \d{4}$/.test(t); }) && /\bstripe\b/.test(hist.pm) && !hist.stale, hist);
    await billingPhone(p, 'northstar');
    /* the card on file, read back from Stripe (api/stripe-customer.js); the
       portal is Stripe's own page, opened in THIS tab (a window opened after
       the server's answer is a pop-up a phone blocks) and it comes back to
       Plan & billing; no card field is ever on this page */
    await p.waitForFunction(function () { return /Visa ending 4242/.test((document.getElementById('bill-card') || {}).textContent || ''); }, null, { timeout: 4000 }).catch(function () {});
    var cardTxt = await p.$eval('#bill-card', function (e) { return e.textContent.replace(/\s+/g, ' '); });
    ok('northstar: the card on file is read back from Stripe (brand, last four, expiry), with Change card and Invoices and receipts', /Card on file\s*Visa ending 4242/.test(cardTxt) && /Expires\s*12\/2030/.test(cardTxt) && /Change card/.test(cardTxt) && /Invoices and receipts/.test(cardTxt) && !/QuickBooks/.test(cardTxt), cardTxt);
    var went = []; await p.route(/^https:\/\/billing\.stripe\.com\//, function (r) { went.push(r.request().url()); return r.abort('aborted'); });
    await p.click('#bill-portal'); await wait(600);
    await p.evaluate(function () { if (window.OmegaSplash) window.OmegaSplash.done(); });
    ok('northstar: Invoices and receipts opens the Stripe portal (Stripe\'s own page) in this tab, and the page itself has no card field', went.length === 1 && /^https:\/\/billing\.stripe\.com\//.test(went[0]) && CARD.posts.indexOf('portal') >= 0 && bill.cardInputs === 0, { went: went, posts: CARD.posts, inputs: bill.cardInputs });
    await p.evaluate(function () { window.location.hash = ''; }); await wait(200);
    /* TEAM AND FEED ARE TWO PAGES (2026-09-27, Tommy: "feed and team do nothing": both opened the same Around you, feed first, and Feed lit Team) */
    function aroundView() { function vis(e) { return !!e && getComputedStyle(e).display !== 'none'; } return { view: document.getElementById('content').getAttribute('data-view'), title: document.getElementById('around-title').textContent, heads: Array.prototype.filter.call(document.querySelectorAll('#around .panel'), vis).map(function (x) { return x.querySelector('h3').textContent; }), rail: (document.querySelector('#side-nav .sn-item.active') || { getAttribute: function () { return ''; } }).getAttribute('data-key'), customize: vis(document.getElementById('customize')) }; }
    await p.click('#side-nav .sn-item[data-key="team"]'); await wait(200);
    var teamView = await p.evaluate(aroundView);
    ok('northstar: the rail\'s Team opens the Team page: the people and the partners on your projects, Team marked', teamView.view === 'team' && teamView.title === 'Team' && teamView.heads.join('|') === 'People|Partners on your projects' && teamView.rail === 'team' && !teamView.customize, teamView);
    await p.click('#side-nav .sn-item[data-key="feed"]'); await wait(200);
    var feedView = await p.evaluate(aroundView);
    ok('northstar: the rail\'s Feed opens the Feed page: what changed and the pulse, Feed marked (not Team)', feedView.view === 'feed' && feedView.title === 'Feed' && feedView.heads.join('|') === 'Workspace feed|Omega pulse' && feedView.rail === 'feed', feedView);
    await p.click('#side-nav .sn-item[data-key="home"]'); await wait(200);
    var boardView = await p.evaluate(aroundView);
    ok('northstar: the home board keeps Around you with what Customize keeps on', boardView.view === 'home' && boardView.title === 'Around you' && boardView.heads.join('|') === 'Workspace feed|People|Omega pulse|Partners on your projects' && boardView.customize, boardView);
    /* post a message, from the Feed page */
    await p.evaluate(function () { window.location.hash = '#feed'; }); await wait(150);
    ok('northstar: #feed opens the Feed page', await p.evaluate(function () { return document.getElementById('content').getAttribute('data-view') === 'feed' && getComputedStyle(document.getElementById('team')).display !== 'none' && getComputedStyle(document.getElementById('feed')).display !== 'none'; }));
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
    var vm = await p.evaluate(function () { return { cards: document.querySelectorAll('#modules-body .mod').length, acts: document.querySelectorAll('#modules-body [data-mod-act]').length, live: document.querySelectorAll('#modules-body .mod[data-held="1"]').length, off: document.querySelectorAll('#modules-body .mod[data-state="available"]').length }; });
    ok('viewas: the Modules page shows the customer\'s view (Lite Live, the rest not on the plan) and a staff preview offers no button that changes it', vm.cards === M.catalog().length && vm.live === 1 && vm.off === vm.cards - 1 && vm.acts === 0, vm);
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
    /* review #9: a workspace awaiting approval changes no module, not even
       one on its plan, and a trial is not Enterprise: White Label (nothing
       to count) is not Live on a trial, as Site Map does not run it there */
    await p.evaluate(function () { window.location.hash = '#modules'; });
    await p.waitForFunction(function () { return document.querySelectorAll('#modules-body .mod').length > 5; }, null, { timeout: 5000 }).catch(function () {});
    var pm = await p.evaluate(function () { function st(sel) { return Array.prototype.map.call(document.querySelectorAll(sel), function (m) { return m.getAttribute('data-module') + ':' + m.getAttribute('data-state'); }); } return { page: st('#modules-body .mod'), acts: document.querySelectorAll('#modules-body [data-mod-act]').length, wl: (document.querySelector('#modules-body .mod[data-module="whitelabel"] .cv .st') || {}).textContent || '' }; });
    ok('pending: no module card offers any action while approval is pending', pm.page.length === M.catalog().length && pm.acts === 0, pm);
    ok('pending: Omega Storefront reads Not on your plan on a trial, never Live', pm.page.indexOf('whitelabel:available') >= 0 && pm.wl === 'Not on your plan', { wl: pm.wl, page: pm.page });
    await p.evaluate(function () { window.location.hash = ''; }); await wait(200);
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
    /* the same package on the Stripe rail (PACKAGING_PROVIDER=stripe): "I've paid" re-asks the engine, which now says Stripe */
    STUB_PROVIDER = 'stripe';
    await p.click('#bill-paid');
    await p.waitForFunction(function () { return /Stripe/.test((document.getElementById('bill-card') || {}).textContent || ''); }, null, { timeout: 5000 }).catch(function () {});
    var sb = await p.evaluate(function () { var t = function (id) { var e = document.getElementById(id); return e ? e.textContent.replace(/\s+/g, ' ') : ''; }; var a = document.querySelector('#bill-owe a[href*="invoice.stripe.com"]'); return { card: t('bill-card'), owe: t('bill-owe'), pay: a ? a.getAttribute('href') : '', portal: (document.getElementById('bill-portal') || {}).textContent || '', inputs: document.querySelectorAll('#billing-body input').length }; });
    ok('lite on Stripe: Plan & billing names Stripe as the rail, the card on Stripe\'s own page, the open invoice paid on invoice.stripe.com, never a card field and never QuickBooks', /Stripe’s secure invoice page/.test(sb.card) && /Manage card and invoices/.test(sb.portal) && /pay link to Stripe’s secure page/.test(sb.owe) && /Check with Stripe/.test(sb.owe) && /^https:\/\/invoice\.stripe\.com\//.test(sb.pay) && !/QuickBooks/.test(sb.card + sb.owe) && sb.inputs === 0, sb);
    if (shotsAt) await p.screenshot({ path: path.join(shotsAt, 'lite-billing-stripe-1366.png'), fullPage: true });
    /* back on QuickBooks: the next look at the engine says so again */
    STUB_PROVIDER = null;
    await p.click('#bill-paid');
    await p.waitForFunction(function () { return /QuickBooks Payments/.test((document.getElementById('bill-card') || {}).textContent || ''); }, null, { timeout: 5000 }).catch(function () {});
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
    ok('lite: a locked tile names the module that carries it', /Omega Grid/.test(why) && /part of/.test(why), why.slice(0, 160));
    await p.keyboard.press('Escape');
    /* the Modules page (2026-09-27): the Ladder as a page of the workspace */
    await p.evaluate(function () { window.location.hash = '#modules'; }); await wait(400);
    var mods = await p.evaluate(function () { return { view: document.getElementById('content').getAttribute('data-view'), cards: Array.prototype.map.call(document.querySelectorAll('#modules-body .mod'), function (c) { return { key: c.getAttribute('data-module'), held: c.getAttribute('data-held'), price: (c.querySelector('.price') || {}).textContent || '', add: !!c.querySelector('[data-mod-act="add"]') }; }), change: (document.querySelector('#plan a.ows-pill') || {}).getAttribute && document.querySelector('#plan a.ows-pill').getAttribute('href') }; });
    ok('lite: #modules is its own page with one card per catalog module', mods.view === 'modules' && mods.cards.length === M.catalog().length, { view: mods.view, n: mods.cards.length });
    ok('lite: Omega Design is Live and Omega Grid carries the server\'s price and Opt in', mods.cards.some(function (c) { return c.key === 'lite' && c.held === '1' && !c.add; }) && mods.cards.some(function (c) { return c.key === 'gridatlas' && c.held === '0' && /\$\d/.test(c.price) && c.add; }), mods.cards.filter(function (c) { return c.key === 'lite' || c.key === 'gridatlas'; }));
    await modulesFit(p, 'lite');
    ok('lite: Change plan on the plan strip opens the Modules page', mods.change === '/workspace#modules', mods.change);
    /* #module-<key>: every link to one module lands on its card, marked and in view */
    await p.evaluate(function () { window.scrollTo(0, 0); window.location.hash = '#module-storage'; }); await wait(500);
    var focus = await p.evaluate(function () { var c = document.querySelector('#modules-body .mod[data-selected]'), r = c && c.getBoundingClientRect(); return { view: document.getElementById('content').getAttribute('data-view'), key: c && c.getAttribute('data-module'), marked: document.querySelectorAll('#modules-body .mod[data-selected]').length, onScreen: !!(r && r.top >= 0 && r.bottom <= window.innerHeight + 2), rail: (document.querySelector('#side-nav .sn-item.active') || {}).getAttribute && document.querySelector('#side-nav .sn-item.active').getAttribute('data-key') }; });
    ok('lite: #module-storage opens Modules with the Storage card marked and on screen', focus.view === 'modules' && focus.key === 'storage' && focus.marked === 1 && focus.onScreen && focus.rail === 'modules', focus);
    /* #plans: the plans shelf, moved here from the marketplace, with this workspace's plan marked */
    await p.evaluate(function () { window.scrollTo(0, 0); window.location.hash = '#plans'; }); await wait(500);
    var plans = await p.evaluate(function () { var sh = document.getElementById('modules-plans'), r = sh.getBoundingClientRect(); return { view: document.getElementById('content').getAttribute('data-view'), cards: Array.prototype.map.call(sh.querySelectorAll('.planc'), function (c) { return c.getAttribute('data-plan-card') + '=' + c.querySelector('.pr').textContent; }), mine: Array.prototype.map.call(sh.querySelectorAll('.planc.on'), function (c) { return c.getAttribute('data-plan-card'); }), top: Math.round(r.top), marked: document.querySelectorAll('#modules-body .mod[data-selected]').length, stripPlans: !!document.querySelector('#modules-plan a[href="/workspace#plans"]'), store: !!document.querySelector('#modules a[href^="/marketplace"]') }; });
    ok('lite: #plans opens Modules scrolled to the plans shelf: Lite, Field, Pro at the book\'s prices and Enterprise as Contact for pricing, Lite marked as this workspace\'s, and nothing on the page sends a module to the Marketplace', plans.view === 'modules' && plans.cards.join() === 'lite=$500/month,field=$1,299/month,pro=$2,499/month,enterprise=Contact for pricing' && plans.mine.join() === 'lite' && plans.top >= 0 && plans.top < 300 && plans.marked === 0 && plans.stripPlans && !plans.store, plans);
    var inside = await p.evaluate(function () { function line(k) { var c = document.querySelector('#modules-body .mod[data-module="' + k + '"] .inside'); return c ? c.textContent : ''; } return { whitelabel: line('whitelabel'), plant: line('logic-plant'), plansets: line('plansets'), gridatlas: line('gridatlas') }; });
    ok('lite: a module that lives outside Site Map says where it lives, and one inside says so', /^Lives in your own website/.test(inside.whitelabel) && /^Lives in Omega Logic/.test(inside.plant) && /^Inside Site Map, the editor/.test(inside.plansets) && /^Inside Site Map, the editor$/.test(inside.gridatlas) && !/capabilities of Site Map/.test(inside.whitelabel + inside.plant), inside);
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

  /* ══ 5b. LITE LABS, CHANGES IN PROGRESS — Omega Grid queued to leave at
     the quarterly review, Omega Storage chosen and waiting for its invoice. Plan
     & billing lists both with their steps, the review date, a Pay link and
     Cancel request, which opens the one menu on that module; the chips on
     the subscription say the same. ══ */
  var lc = FX.lite(HOST), lcb = lc.docs['omega_orgs/' + lc.org + '/billing/current'];
  lcb.modules = ['lite', 'gridatlas']; lcb.subscription.modules = ['lite', 'gridatlas']; lcb.removalRequests = [{ module: 'gridatlas', requestedAt: Date.now() - 86400e3, by: lc.user.email, reason: '' }];
  lc.packageView = require('../api/_lib/package-access').project({ staff: false, claims: { email_verified: true } }, lcb, lc.docs['omega_orgs/' + lc.org], lc.docs['omega_orgs/' + lc.org + '/members/uid-lite-owner'], Date.now());
  STORE.pkg = { modules: ['lite', 'gridatlas'], subscription: ['lite', 'gridatlas'], removals: lcb.removalRequests.slice() };
  STORE.pending = [{ id: 'change-storage', add: ['storage'], names: [M.get('storage').name], display: '$200', expiresOn: '2026-10-20', paymentLink: 'https://pay.example/inv-1', state: 'unpaid' }];
  await scenario('lite-changes', lc, { url: '/workspace#billing', tz: 'America/Chicago', steps: async function (p) {
    await p.waitForFunction(function () { return document.querySelectorAll('#bill-req .chg-row').length === 2; }, null, { timeout: 5000 }).catch(function () {});
    var ch = await p.evaluate(function () {
      var rows = Array.prototype.map.call(document.querySelectorAll('#bill-req .chg-row'), function (r) { return { key: r.getAttribute('data-change'), pill: (r.querySelector('.bpill') || {}).textContent, line: (r.querySelector('small') || {}).textContent, steps: Array.prototype.map.call(r.querySelectorAll('.steps li'), function (li) { return li.textContent + (li.className ? '(' + li.className + ')' : ''); }).join('|'), pay: (r.querySelector('a.ows-pill') || {}).href || null, cancel: (r.querySelector('[data-cancel]') || {}).textContent || null }; });
      return { rows: rows, cards: Array.prototype.map.call(document.querySelectorAll('#billing-body .bcard h3'), function (h) { return h.firstChild.textContent; }).join('|'), leaving: Array.prototype.map.call(document.querySelectorAll('#bill-sub .bh-mod.leaving'), function (a) { return a.getAttribute('href') + ' ' + a.textContent; }), soon: Array.prototype.map.call(document.querySelectorAll('#bill-sub .bh-mod.soon'), function (a) { return a.getAttribute('href') + ' ' + a.textContent; }), pay: (document.getElementById('bill-pay') || {}).href || null, owe: document.getElementById('bill-owe').textContent.replace(/\s+/g, ' '), open: document.querySelectorAll('#bill-hist .spill.open').length, price: (document.querySelector('#bill-sub .bh-price b') || {}).textContent };
    });
    var st = ch.rows.filter(function (r) { return r.key === 'storage'; })[0] || {}, ga = ch.rows.filter(function (r) { return r.key === 'gridatlas'; })[0] || {};
    ok('lite-changes: Changes in progress sits between the payment method and the history', ch.cards === 'Your subscription|What you owe|Payment method|Changes in progress|Billing history', ch.cards);
    ok('lite-changes: Storage waits for payment with its invoice, the day it expires unpaid and a Pay link, then Cancel request', st.pill === 'Waiting for payment' && /\$200 invoice · switches on when paid · expires unpaid on Oct 20, 2026/.test(st.line) && st.steps === 'Chosen(done)|Pay before Oct 20, 2026(now)|On' && st.pay === 'https://pay.example/inv-1' && st.cancel === 'Cancel request', st);
    ok('lite-changes: Omega Grid is opting out: on, and billed, until the review on Dec 20, no refund, with Cancel request', ga.pill === 'Opting out' && /Stays on, and billed, until your review on Dec 20, 2026\. No refund/.test(ga.line) && /\|Review on Dec 20, 2026\(now\)\|Off$/.test(ga.steps) && ga.cancel === 'Cancel request' && !ga.pay, ga);
    ok('lite-changes: the subscription\'s chips say the same (Omega Grid opting out, Omega Storage waiting for payment), the price is the book\'s for what was bought, and what is owed is the $200 with its pay button', ch.leaving.length === 1 && ch.leaving[0].indexOf('#module-gridatlas ' + M.get('gridatlas').name + ' Opting out') >= 0 && ch.soon.length === 1 && /#module-storage .*Waiting for payment/.test(ch.soon[0]) && ch.price === '$750' && ch.pay === 'https://pay.example/inv-1' && /\$200/.test(ch.owe) && /Pay \$200 now/.test(ch.owe) && ch.open === 1, ch);
    await p.click('#bill-req [data-cancel="gridatlas"]'); await wait(500);
    var menu = await p.evaluate(function () { var d = document.getElementById('omega-package-menu'); return { open: !!d, text: d ? d.textContent.replace(/\s+/g, ' ') : '' }; });
    ok('lite-changes: Cancel request opens the one package menu on that module', menu.open && menu.text.indexOf(M.get('gridatlas').name) >= 0, { open: menu.open, text: menu.text.slice(0, 200) });
    await p.keyboard.press('Escape'); await wait(200);
    /* review #11: one count everywhere. Omega Grid is opting out but stays
       on, and billed, until the review, so it is Live on the Modules page's
       strip and Plan & billing alike */
    var counts = await p.evaluate(function () { var f = Array.prototype.filter.call(document.querySelectorAll('#bill-sub .bh-fact'), function (x) { return x.querySelector('.l').textContent === 'Modules'; })[0]; return { hero: f ? f.querySelector('.v').textContent : '', strip: (document.getElementById('modules-plan') || {}).textContent || '' }; });
    var liveOf = '2 of ' + M.catalog().length;
    ok('lite-changes: the Modules strip and Plan & billing count the same modules Live (Omega Design and Omega Grid, which stays on until the review)', counts.hero === liveOf + ' Live' && counts.strip.indexOf(liveOf + ' modules Live') >= 0, counts);
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

  STORE.optIns = {}; STORE.optOuts = {};
  await scenario('legacy-enterprise-opt-out', FX.legacyEnterprise(HOST), { url: '/workspace#modules', steps: async function (p) {
    await p.waitForFunction(function () { return document.querySelectorAll('#modules-body [data-mod-act="remove"]').length > 5; });
    await modulesFit(p, 'legacy Enterprise');
    var entMods = await p.evaluate(function () { return Array.prototype.map.call(document.querySelectorAll('#modules-body .mod'), function (m) { var a = m.querySelector('.row [data-mod-act]'); return m.getAttribute('data-module') + ':' + m.getAttribute('data-state') + ':' + (a ? a.getAttribute('data-mod-act') : ''); }); });
    ok('legacy Enterprise: every Live module offers Opt out, a partly included one Opt in, and Lite nothing; Enterprise holds all but what its tools only partly open', entMods.every(function (x) { var q = x.split(':'); return q[0] === 'lite' ? q[1] === 'included' && !q[2] : q[1] === 'live' ? q[2] === 'remove' : (q[1] === 'part' || (q[0] === 'whitelabel' && q[1] === 'available')) && q[2] === 'add'; }) && entMods.filter(function (x) { return /:live:/.test(x); }).length >= M.catalog().length - 3, entMods);
    var postsE = STORE.posts.length;
    await p.locator('#modules-body [data-mod-act="remove"][data-module="logic-office"]').click();
    await p.locator('#omega-package-menu').getByRole('button', { name: 'Send opt-out request' }).waitFor({ timeout: 4000 });
    var draft = (await p.locator('#omega-package-menu').textContent()).replace(/\s+/g, ' ');
    ok('legacy Enterprise: opting out of Office names every department that needs it and keeps the agreement: nothing changes today, access stays, Omega Design stays', M.catalog().filter(function (m) { return m.shelf === 'platform' && m.key !== 'logic-office'; }).every(function (m) { return draft.indexOf(m.name) >= 0; }) && /nothing changes today/.test(draft) && /Omega Design stays/.test(draft), draft.slice(0, 400));
    await p.keyboard.press('Escape'); await wait(200);
    ok('legacy Enterprise: the request can be dismissed without sending (only the price-free dry run was asked)', await p.locator('#omega-package-menu').count() === 0 && STORE.posts.slice(postsE).every(function (b) { return b.dryRun === true; }) && STORE.posts.length > postsE);
    /* Plan & billing for a plan invoiced by ClearSky and paid by ACH or check */
    await p.evaluate(function () { window.location.hash = '#billing'; }); await wait(600);
    var eb = await p.evaluate(function () { var t = function (id) { var e = document.getElementById(id); return e ? e.textContent.replace(/\s+/g, ' ') : ''; }; return { card: t('bill-card'), hist: t('bill-hist'), sub: t('bill-sub'), pm: (document.querySelector('#bill-card .pmc') || {}).className, paid: document.querySelectorAll('#bill-hist .spill.paid').length }; });
    ok('legacy Enterprise: the payment method is ClearSky\'s invoice paid by ACH or check under the agreement, never "no billing account", beside the $150,000 paid', /\bmanual\b/.test(eb.pm) && /Invoiced by ClearSky/.test(eb.card) && /ACH or check/.test(eb.card) && !/No billing account|No payment method/.test(eb.card) && /\$150,000/.test(eb.hist) && eb.paid === 1 && /Enterprise plan/.test(eb.sub) && /Priced by your agreement/.test(eb.sub), eb);
    await billingPhone(p, 'legacy-enterprise');
    /* sent, then one department kept from Plan & billing (#197): the payment
       method is Stripe's door, Changes in progress lists the five opt-outs,
       and Cancel request on Plant keeps Plant and the Office it needs */
    await p.evaluate(function () { window.location.hash = '#modules'; });
    await p.waitForFunction(function () { return document.querySelectorAll('#modules-body [data-mod-act="remove"]').length > 5; }, null, { timeout: 4000 }).catch(function () {});
    await p.locator('#modules-body [data-mod-act="remove"][data-module="logic-office"]').click();
    await p.locator('#omega-package-menu').getByRole('button', { name: 'Send opt-out request' }).click();
    await p.waitForFunction(function () { var d = document.getElementById('omega-package-menu'); return !!d && /Sent\./.test(d.textContent); }, null, { timeout: 4000 }).catch(function () {});
    await p.keyboard.press('Escape'); await wait(150);
    await p.evaluate(function () { window.location.hash = '#billing'; });
    await p.waitForFunction(function () { return document.querySelectorAll('#bill-req .chg-row').length === 5; }, null, { timeout: 4000 }).catch(function () {});
    var lb = await p.evaluate(function () { var t = function (id) { var e = document.getElementById(id); return e ? e.textContent.replace(/\s+/g, ' ') : ''; }; return { card: t('bill-card'), req: t('bill-req'), rows: Array.prototype.map.call(document.querySelectorAll('#bill-req .chg-row'), function (r) { return { key: r.getAttribute('data-change'), pill: (r.querySelector('.bpill') || {}).textContent, cancel: !!r.querySelector('[data-cancel]') }; }) }; });
    ok('legacy Enterprise: the payment method is Stripe\'s, never "No billing account yet" (Concord, 2026-09-27)', /Stripe/.test(lb.card) && !/No billing account/.test(lb.card), lb.card);
    ok('legacy Enterprise: Changes in progress lists the five opt-outs, each Opting out with Cancel request', lb.rows.length === 5 && lb.rows.every(function (r) { return r.pill === 'Opting out' && r.cancel; }) && /Logic Office/.test(lb.req), lb);
    await p.click('#bill-req [data-cancel="logic-plant"]');
    await p.locator('#omega-package-menu .opm-primary', { hasText: 'Cancel request' }).waitFor({ timeout: 4000 });
    var keepText = (await p.locator('#omega-package-menu').textContent()).replace(/\s+/g, ' ');
    ok('legacy Enterprise: Cancel request on Plant says it also keeps the Office Plant needs, and that nothing about the bill changes', /also keeps Logic Office/.test(keepText) && /Nothing about your bill changes/.test(keepText), keepText.slice(0, 300));
    await p.locator('#omega-package-menu .opm-primary', { hasText: 'Cancel request' }).click(); await wait(500);
    await p.keyboard.press('Escape');
    await p.waitForFunction(function () { return document.querySelectorAll('#bill-req [data-cancel]').length === 3; }, null, { timeout: 4000 }).catch(function () {});
    var left = await p.$$eval('#bill-req [data-cancel]', function (r) { return r.map(function (b) { return b.getAttribute('data-cancel'); }); });
    ok('legacy Enterprise: Cancel request on Plant keeps Plant and the Office it needs; the other three stay requested', left.join() === 'logic-materials,logic-logistics,logic-customer' && STORE.posts[STORE.posts.length - 1].action === 'withdraw-opt-out', left);
    if (shotsAt) await p.screenshot({ path: path.join(shotsAt, 'legacy-billing-requests-1366.png'), fullPage: true });
    await p.setViewportSize({ width: 390, height: 844 }); await wait(250);
    ok('legacy Enterprise: Plan & billing with requests fits a 390px phone (no sideways scroll)', await p.evaluate(function () { return document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1; }));
    if (shotsAt) await p.screenshot({ path: path.join(shotsAt, 'legacy-billing-requests-390.png'), fullPage: true });
    return {};
  } });

  /* ══ 5c′. OPT IN BY CARD — a legacy Enterprise plan without Omega Logic
     opts in to Office (Tommy, 2026-09-27: "buy them immediately and not
     email clearsky … add to plan and then charge their credit card or saved
     payment method"). Its card says Opt in; the one menu asks the server
     first (addon-quote: every Logic department switches on exactly), states
     the money, and Opt in and pay opens QuickBooks' page on the click; the
     card then waits for payment with Pay and Cancel request, "I've paid"
     turns it Live with Omega Logic on the rail, and Opt out stops it at the
     end of the month paid for (never the recorded opt-out), which Cancel
     request takes back. Never a mail to ClearSky, never "Add to plan". The
     server's own writes to billing/current are stood in for on the page's
     Firebase double where a real endpoint would make them. ══ */
  var la = FX.legacyEnterprise(HOST), laBill = 'omega_orgs/' + la.org + '/billing/current';
  la.docs[laBill].addons = []; addOnReset(); STORE.posts = [];
  await scenario('legacy-add', la, { url: '/workspace#modules', steps: async function (p) {
    await p.waitForFunction(function () { return document.querySelectorAll('#modules-body .mod[data-module^="logic-"] [data-mod-act="add"]').length === 5; }, null, { timeout: 5000 }).catch(function () {});
    var logic = await p.evaluate(function () { return { buttons: Array.prototype.map.call(document.querySelectorAll('#modules-body .mod[data-module^="logic-"] [data-mod-act]'), function (a) { return a.textContent.trim(); }), mail: document.querySelectorAll('#modules-body a[href^="mailto:"]').length, text: document.getElementById('modules-body').textContent }; });
    ok('legacy add: every Omega Logic department reads Opt in, and nothing on the Modules page mails ClearSky or says Add to plan', logic.buttons.length === 5 && logic.buttons.every(function (t) { return t === 'Opt in'; }) && logic.mail === 0 && !/Add to plan|Ask ClearSky|\bSubscribe\b/.test(logic.text), logic.buttons);
    await p.evaluate(function () { window.__opened = []; window.open = function (u) { var rec = { url: u || '', replaced: null, closed: false }; window.__opened.push(rec); return { opener: 1, document: { title: '', body: {} }, location: { replace: function (x) { rec.replaced = x; } }, close: function () { rec.closed = true; } }; }; });
    /* the page's Firebase double takes the server's writes to billing/current (a stop, its withdrawal), as the real endpoint makes them */
    await p.evaluate(function (path) {
      var f = window.fetch;
      window.fetch = function (u, o) {
        return f.apply(this, arguments).then(function (r) {
          var b = o && typeof o.body === 'string' ? o.body : '';
          if (!/\/api\/plan-change$/.test(String(u)) || !/"action":"(withdraw-)?addon-cancel"/.test(b) || /"dryRun":true/.test(b) || !/"remove"/.test(b)) return r;
          return r.clone().json().then(function (j) { if (j && j.ending) { var s = window.__firebaseDouble.store, cur = JSON.parse(JSON.stringify(s.docs[path])); cur.addOns = Object.assign({}, cur.addOns, { ending: j.ending }); s.put(path, cur); } return r; });
        });
      };
    }, laBill);
    await p.click('#modules-body [data-mod-act="add"][data-module="logic-office"]');
    await p.locator('#omega-package-menu').getByRole('button', { name: 'Opt in and pay' }).waitFor({ timeout: 5000 }).catch(function () {});
    var q = await p.evaluate(function () { var m = document.getElementById('omega-package-menu'); return m ? { text: m.textContent.replace(/\s+/g, ' '), cards: m.querySelectorAll('.opm-card').length, mail: m.querySelectorAll('a[href^="mailto:"]').length } : null; });
    ok('legacy add: Opt in opens the one menu on Office alone with the server\'s quote: $1,500 today, then $1,500/month beside the plan on its own invoice, paid on QuickBooks\' page, the plan untouched', !!q && q.cards === 1 && /\$1,500 today/.test(q.text) && /then \$1,500\/month on the \d+(st|nd|rd|th), on its own invoice beside your plan/.test(q.text) && /QuickBooks/.test(q.text) && /stay exactly as they are/.test(q.text) && q.mail === 0 && !/Add to plan|Pay \$1,500 now|Ask ClearSky/.test(q.text), q);
    if (shotsAt) await p.screenshot({ path: path.join(shotsAt, 'legacy-add-quote.png') });
    await p.locator('#omega-package-menu').getByRole('button', { name: 'Opt in and pay' }).click(); await wait(600);
    var w = await p.evaluate(function () { var m = document.getElementById('omega-package-menu'), a = m && m.querySelector('[data-module-card="logic-office"] a.opm-paylink'); return { opened: window.__opened, text: m ? m.textContent.replace(/\s+/g, ' ') : '', link: a ? a.href : null, label: a ? a.textContent : '', target: a ? a.target : null }; });
    ok('legacy add: Opt in and pay opens QuickBooks\' payment page in a new tab on the click, and Office waits for payment with its pay link, I\'ve paid and Cancel request', w.opened.length === 1 && w.opened[0].replaced === PAY_URL && /Waiting for payment · \$1,500/.test(w.text) && w.link === PAY_URL && w.target === '_blank' && /in QuickBooks$/.test(w.label) && /I've paid/.test(w.text) && /Cancel request/.test(w.text), w);
    var posted = STORE.posts.map(function (x) { return x.action; });
    ok('legacy add: the page asked for the quote, then bought with the quote\'s own id; nothing else was posted', posted.join() === 'addon-quote,addon-buy', posted);
    await wait(400);
    var waitCard = await p.evaluate(function () { var c = document.querySelector('#modules-body .mod[data-module="logic-office"]'); return c ? { state: c.getAttribute('data-state'), pill: (c.querySelector('.cv .st') || {}).textContent, pay: (c.querySelector('[data-mod-act="pay"]') || {}).href || null, cancel: (c.querySelector('.sub-row [data-mod-act="cancel"]') || {}).textContent || '', note: (c.querySelector('.row .note') || {}).textContent || '' } : null; });
    ok('legacy add: the Modules card behind the menu agrees: Waiting for payment, Pay on its QuickBooks invoice and Cancel request', !!waitCard && waitCard.state === 'awaiting' && waitCard.pill === 'Waiting for payment' && waitCard.pay === PAY_URL && waitCard.cancel === 'Cancel request' && /\$1,500 invoice · switches on when paid/.test(waitCard.note), waitCard);
    if (shotsAt) await p.screenshot({ path: path.join(shotsAt, 'legacy-add-waiting.png') });
    /* the payment lands: QuickBooks says paid and the server's record says Office is on */
    ADDON.paid = true;
    await p.evaluate(function (a) { var s = window.__firebaseDouble.store, cur = JSON.parse(JSON.stringify(s.docs[a.path])); cur.addOns = { modules: ['logic-office'], live: ['logic-office'], state: 'paid', accessUntil: a.until, billingDay: 27, nextInvoiceOn: '2026-10-27', paidThrough: '2026-10-27', monthlyCents: 150000, monthlyDisplay: '$1,500/month', pending: [] }; s.put(a.path, cur); }, { path: laBill, until: Date.now() + 30 * 86400e3 });
    await p.locator('#omega-package-menu').getByRole('button', { name: 'I\'ve paid' }).click(); await wait(900);
    var paidText = await p.evaluate(function () { var m = document.querySelector('#omega-package-menu [data-module-card="logic-office"]'); return m ? m.textContent.replace(/\s+/g, ' ') : ''; });
    await p.keyboard.press('Escape'); await wait(500);
    var after = await p.evaluate(function () { var card = document.querySelector('#modules-body .mod[data-module="logic-office"]'); return { state: card ? card.getAttribute('data-state') : null, held: card ? card.getAttribute('data-held') : null, note: card ? (card.querySelector('.row .note') || {}).textContent : '', act: card ? (card.querySelector('.row [data-mod-act]') || {}).textContent : '', rail: Array.prototype.map.call(document.querySelectorAll('#side-nav .sn-item'), function (a) { return a.textContent.trim(); }), plant: (document.querySelector('#modules-body .mod[data-module="logic-plant"] [data-mod-act]') || {}).textContent || '' }; });
    ok('legacy add: I\'ve paid checks QuickBooks; paid, the menu says Office is on by card, the card is Live as an add-on with Opt out, Omega Logic joins the rail, and Plant still reads Opt in', /Added to your plan by card/.test(paidText) && after.state === 'live' && after.held === '1' && /^Add-on · paid by card, renews on Oct 27\.$/.test(after.note) && after.act === 'Opt out' && after.rail.some(function (t) { return /Orders/.test(t); }) && after.plant.trim() === 'Opt in', { menu: paidText.slice(0, 200), card: after });
    /* OPT OUT of a card add-on: it stops at the end of the month paid for (addon-cancel with the module), the dry run first; never the recorded opt-out */
    var posts2 = STORE.posts.length;
    await p.click('#modules-body [data-mod-act="remove"][data-module="logic-office"]');
    await p.locator('#omega-package-menu .opm-primary', { hasText: 'Opt out' }).waitFor({ timeout: 5000 }).catch(function () {});
    var stopText = await p.evaluate(function () { var m = document.getElementById('omega-package-menu'); return m ? m.textContent.replace(/\s+/g, ' ') : ''; });
    ok('legacy add: Opt out of Office says it stays on until the end of the month paid for and is not renewed, no refund, the plan untouched', /stays on until 2026-10-27, the end of the month you paid for, and is not renewed/.test(stopText) && /No refund for time already paid/.test(stopText) && !/Send opt-out request/.test(stopText), stopText.slice(0, 400));
    await p.locator('#omega-package-menu .opm-primary', { hasText: 'Opt out' }).click(); await wait(500);
    await p.keyboard.press('Escape'); await wait(700);
    var stopPosts = STORE.posts.slice(posts2).map(function (b) { return b.action + (b.dryRun ? '?' : '') + ':' + (b.remove || []).join(','); });
    var leaving = await p.evaluate(function () { var c = document.querySelector('#modules-body .mod[data-module="logic-office"]'); return c ? { state: c.getAttribute('data-state'), pill: (c.querySelector('.cv .st') || {}).textContent, note: (c.querySelector('.row .note') || {}).textContent, act: (c.querySelector('.row [data-mod-act]') || {}).textContent } : null; });
    ok('legacy add: the stop is priced first and then recorded once; the card reads Opting out, on until Oct 27, with Cancel request', stopPosts.join('|') === 'addon-cancel?:logic-office|addon-cancel:logic-office' && !!leaving && leaving.state === 'removing' && leaving.pill === 'Opting out' && /^Stays on until Oct 27, the end of the month you paid for, and is not renewed\.$/.test(leaving.note) && leaving.act === 'Cancel request', { posts: stopPosts, card: leaving });
    /* CANCEL REQUEST: Office stays on and renews (withdraw-addon-cancel), the dry run first */
    await p.click('#modules-body .mod[data-module="logic-office"] [data-mod-act="cancel"]');
    await p.locator('#omega-package-menu .opm-primary', { hasText: 'Cancel request' }).click(); await wait(500);
    await p.keyboard.press('Escape'); await wait(700);
    var kept = await p.evaluate(function () { var c = document.querySelector('#modules-body .mod[data-module="logic-office"]'); return c ? { state: c.getAttribute('data-state'), act: (c.querySelector('.row [data-mod-act]') || {}).textContent } : null; });
    ok('legacy add: Cancel request keeps Office on and renewing (withdraw-addon-cancel), Live with Opt out again', !!kept && kept.state === 'live' && kept.act === 'Opt out' && STORE.posts[STORE.posts.length - 1].action === 'withdraw-addon-cancel', { card: kept, last: STORE.posts[STORE.posts.length - 1] });
    await p.evaluate(function () { window.location.hash = '#billing'; }); await wait(700);
    var bill = await p.evaluate(function () { var c = document.getElementById('bill-addons'); return c ? c.textContent.replace(/\s+/g, ' ') : null; });
    ok('legacy add: Plan & billing lists what was added by card, what it costs a month, that it is on, and that it is invoiced in QuickBooks', !!bill && /Added to your plan by card/.test(bill) && /\$1,500/.test(bill) && /Logic Office/.test(bill) && /Active/.test(bill) && /QuickBooks/.test(bill), bill);
    return {};
  } });
  addOnReset(); STORE.optIns = {}; STORE.optOuts = {};
  /* ══ 5b'. CONCORD — a legacy plan ClearSky billed by hand, $1,299 past due
     and no billing account yet (Tommy, 2026-09-27, on this card: "This
     payment method should be linked to the stripe payment system we built
     with quickbooks. Stripe collects and takes the payment"). Payment
     method offers Add a card with Stripe and What you owe offers Pay $1,299
     with Stripe, each Stripe's own page in THIS tab; back from Stripe the
     open invoice has its page and I've paid, and paid it reads nothing owed
     with the payment in the history. Never "No billing account yet", never a
     mail to ClearSky, never a card field; a member is told who pays. ══ */
  function concordFx(role) {
    var fx = FX.legacyEnterprise(HOST), orgPath = 'omega_orgs/' + fx.org, dayMs = 86400e3;
    fx.docs[orgPath] = Object.assign({}, fx.docs[orgPath], { name: 'Concord Energy', tierLevel: 1 });
    fx.billPath = orgPath + '/billing/current';
    fx.docs[fx.billPath] = { tier: 'standard', addons: [], toolOverrides: {}, paymentProvider: 'manual', trialEndsAt: null, subscriptionDue: new Date(Date.now() - 25 * dayMs).toISOString().slice(0, 10),
      amountDue: 1299, amountPaid: 1299, lastPaidAt: new Date(Date.now() - 56 * dayMs).toISOString().slice(0, 10), createdAt: fx.docs[fx.billPath].createdAt };
    if (role) fx.docs[orgPath + '/members/' + fx.user.uid].role = role;
    CARD.posts = []; CARD.dueOpen = null; CARD.paid = false; CARD.invoices = null; STORE.legacyInvoices = [];
    return fx;
  }
  function billText(p) {
    return p.evaluate(function () {
      var g = function (id) { var e = document.getElementById(id); return e ? e.textContent.replace(/\s+/g, ' ') : ''; };
      return { owe: g('bill-owe'), card: g('bill-card'), sub: g('bill-sub'), hist: g('bill-hist'), add: g('bill-card-add'), pay: g('bill-stripe-pay'), check: !!document.getElementById('bill-stripe-check'),
        mail: document.querySelectorAll('#bill-card a[href^="mailto:"], #bill-owe a[href^="mailto:"]').length, inputs: document.querySelectorAll('#billing-body input').length };
    });
  }
  var cc = concordFx();
  await scenario('concord-billing', cc, { url: '/workspace#billing', steps: async function (p) {
    await p.waitForSelector('#bill-stripe-pay', { timeout: 6000 }).catch(function () {});
    var a = await billText(p);
    ok('concord: the Payment method card is linked to Stripe: Add a card with Stripe, no card on file yet; never "No billing account yet", never a mail to ClearSky, never a card field', /Pay by card with Stripe/.test(a.card) && /Card on file\s*None yet/.test(a.card) && a.add === 'Add a card with Stripe' && !/No billing account yet|Ask ClearSky/.test(a.card) && a.mail === 0 && a.inputs === 0, a);
    ok('concord: What you owe is ClearSky\'s $1,299, with Pay $1,299 with Stripe', /\$1,299/.test(a.owe) && a.pay === 'Pay $1,299 with Stripe' && !a.check, a.owe);
    ok('concord: the plan still reads as ClearSky billed it, and the last payment stands in the history', /Invoiced by ClearSky/.test(a.sub) && /Last payment/.test(a.hist) && /\$1,299/.test(a.hist), { sub: a.sub, hist: a.hist });
    if (shotsAt) await p.screenshot({ path: path.join(shotsAt, 'concord-billing-stripe.png'), fullPage: true });
    var went = []; await p.route(/^https:\/\/(billing|invoice)\.stripe\.com\//, function (r) { went.push(r.request().url()); return r.abort('aborted'); });
    await p.click('#bill-card-add'); await wait(600);
    await p.evaluate(function () { if (window.OmegaSplash) window.OmegaSplash.done(); });
    ok('concord: Add a card with Stripe asks the server for Stripe\'s add-a-card page and goes there in this tab', CARD.posts.indexOf('card') >= 0 && went.length === 1 && /^https:\/\/billing\.stripe\.com\//.test(went[0]), { posts: CARD.posts, went: went });
    await p.click('#bill-stripe-pay'); await wait(600);
    await p.evaluate(function () { if (window.OmegaSplash) window.OmegaSplash.done(); });
    ok('concord: Pay $1,299 with Stripe goes to Stripe\'s invoice page in this tab', CARD.posts.indexOf('pay') >= 0 && went.length === 2 && /^https:\/\/invoice\.stripe\.com\//.test(went[1]), { posts: CARD.posts, went: went });
    /* back from Stripe by the browser's Back: the page asks again */
    await p.evaluate(function () { window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })); });
    await p.waitForSelector('#bill-stripe-check', { timeout: 5000 }).catch(function () {});
    var b = await p.evaluate(function () { var x = document.querySelector('#bill-owe a[href^="https://invoice.stripe.com/"]'); return { link: x ? x.getAttribute('href') : null, target: x ? x.target : null, check: !!document.getElementById('bill-stripe-check'), pay: !!document.getElementById('bill-stripe-pay') }; });
    ok('concord: back from Stripe, the open invoice has its page (a new tab) and I\'ve paid, and never a second Pay with Stripe', b.link === 'https://invoice.stripe.com/i/acct_fixture/in_due' && b.target === '_blank' && b.check && !b.pay, b);
    await p.click('#bill-stripe-check'); await wait(500);
    var notYet = await p.$eval('#ows-toast', function (e) { return e.textContent; }).catch(function () { return ''; });
    ok('concord: I\'ve paid before Stripe has the payment says so', /does not show the payment yet/.test(notYet), notYet);
    /* the payment lands: the server's record reads paid (what api/_lib/stripe-customer.js settle writes) */
    var paidRec = Object.assign({}, cc.docs[cc.billPath], { amountDue: 0, amountPaid: 2598, lastPaidAt: new Date().toISOString(), paymentFailedAt: null, paymentProvider: 'stripe', stripeCustomerId: 'cus_concord_fixture', stripeLivemode: true,
      stripeDue: { invoiceId: 'in_due', marker: cc.org + '/x/129900', amountCents: 129900, dueDate: null, number: 'CS-0001', hostedUrl: 'https://invoice.stripe.com/i/acct_fixture/in_due', state: 'paid', issuedAt: Date.now(), issuedBy: cc.user.email } });
    cc.docs[cc.billPath] = paidRec; CARD.paid = true; CARD.dueOpen = null;
    CARD.invoices = [{ id: 'in_due', number: 'CS-0001', status: 'paid', amountDue: 1299, created: Date.now(), hostedUrl: 'https://invoice.stripe.com/i/acct_fixture/in_due', pdfUrl: null }];
    await p.evaluate(function (a) { window.__firebaseDouble.store.put(a.path, a.rec); }, { path: cc.billPath, rec: paidRec });
    await p.click('#bill-stripe-check'); await wait(300);
    await p.waitForFunction(function () { return /nothing is owed/.test((document.getElementById('bill-owe') || {}).textContent || ''); }, null, { timeout: 5000 }).catch(function () {});
    await p.waitForFunction(function () { return /Visa ending 4242/.test((document.getElementById('bill-card') || {}).textContent || ''); }, null, { timeout: 5000 }).catch(function () {});
    var c = await billText(p);
    ok('concord: paid: nothing is owed and the past due date is gone, the plan pays by card through Stripe, the card is on file, and Stripe\'s invoice is in the history', /nothing is owed/.test(c.owe) && !/Next invoice/.test(c.owe) && /By card through Stripe/.test(c.sub) && /Visa ending 4242/.test(c.card) && /Invoices and receipts/.test(c.card) && /CS-0001/.test(c.hist) && !c.check && !c.pay, c);
    if (shotsAt) await p.screenshot({ path: path.join(shotsAt, 'concord-billing-paid.png'), fullPage: true });
    return { posts: CARD.posts.slice() };
  } });
  await scenario('concord-billing-phone', concordFx(), { phone: true, url: '/workspace#billing', steps: async function (p) {
    await p.waitForSelector('#bill-stripe-pay', { timeout: 6000 }).catch(function () {});
    var a = await billText(p), fit = await p.evaluate(function () {
      return ['bill-card-add', 'bill-stripe-pay'].map(function (id) { var e = document.getElementById(id), r = e ? e.getBoundingClientRect() : null; return !!r && r.width > 0 && r.left >= 0 && r.right <= window.innerWidth; });
    });
    ok('concord on a phone: Add a card with Stripe and Pay $1,299 with Stripe are on the screen, whole', a.add === 'Add a card with Stripe' && a.pay === 'Pay $1,299 with Stripe' && fit.every(Boolean), { a: a, fit: fit });
    if (shotsAt) await p.screenshot({ path: path.join(shotsAt, 'concord-billing-phone.png'), fullPage: true });
    return {};
  } });
  var ccm = concordFx('member');
  await scenario('concord-member', ccm, { url: '/workspace#billing', steps: async function (p) {
    await p.waitForFunction(function () { return /\$1,299/.test((document.getElementById('bill-owe') || {}).textContent || ''); }, null, { timeout: 6000 }).catch(function () {});
    await wait(400);
    var m = await billText(p);
    ok('concord member: sees what is owed and that an owner or administrator pays it and adds the card through Stripe; no buttons, and the page never asks the server for the card', /\$1,299/.test(m.owe) && /pays it by card through Stripe/.test(m.owe) && /adds the card/.test(m.card) && !m.add && !m.pay && !m.check && CARD.posts.length === 0 && m.inputs === 0, { m: m, posts: CARD.posts });
    return {};
  } });
  /* ══ 5c‴. A TEST OPT-IN, WITHDRAWN, NEVER STANDS IN FOR THE TIER (Concord,
     2026-09-28: a $500 Omega Compute opt-in, cancelled, its Stripe invoice
     still open, was read as what was owed and the $1,299 plan vanished; then
     "just remove these, they were tests"). The engine's record says reversed
     and nothing was paid; Stripe's list still carries the invoice. What is
     owed is the tier's own figure; the withdrawn purchase is neither owed,
     offered nor history; an opt-in paid and reversed later stays, as Void;
     the plan's own Stripe invoice stays. Each from its own record: some
     customers owe only the modules they opted into, some legacy accounts a
     tier, and a tier can be sold to any account (Tommy, 2026-09-28). ══ */
  var cs = concordFx(), csDay = 86400e3, csToday = new Date().toISOString().slice(0, 10), csEnd = new Date(Date.now() + 30 * csDay).toISOString().slice(0, 10), csAgo = new Date(Date.now() - 20 * csDay).toISOString();
  cs.docs[cs.billPath] = Object.assign({}, cs.docs[cs.billPath], { paymentProvider: 'stripe', stripeCustomerId: 'cus_concord_fixture', stripeLivemode: true });
  STORE.legacyInvoices = [
    { id: 'addon-test', kind: 'addon', purpose: 'purchase', state: 'reversed', date: csToday, period: { start: csToday, end: csEnd }, totalCents: 50000, display: '$500', paymentLink: null, payWith: 'Stripe', names: [M.get('compute').name], paidAt: null },
    { id: 'addon-refunded', kind: 'addon', purpose: 'purchase', state: 'reversed', date: csAgo.slice(0, 10), period: { start: csAgo.slice(0, 10), end: csEnd }, totalCents: 25000, display: '$250', paymentLink: null, payWith: 'Stripe', names: ['Omega Plans'], paidAt: csAgo } ];
  CARD.invoices = [
    { id: 'in_test', number: 'CS-0007', status: 'open', amountDue: 500, created: Date.now(), hostedUrl: 'https://invoice.stripe.com/i/acct_fixture/in_test', pdfUrl: null, omega: 'addon' },
    { id: 'in_aug', number: 'CS-0006', status: 'paid', amountDue: 1299, created: Date.now() - 56 * csDay, hostedUrl: 'https://invoice.stripe.com/i/acct_fixture/in_aug', pdfUrl: null, omega: null } ];
  await scenario('concord-test-optin', cs, { url: '/workspace#billing', steps: async function (p) {
    await p.waitForSelector('#bill-stripe-pay', { timeout: 6000 }).catch(function () {});
    await p.waitForFunction(function () { return /CS-0006/.test((document.getElementById('bill-hist') || {}).textContent || ''); }, null, { timeout: 6000 }).catch(function () {});
    var a = await billText(p), h = await p.evaluate(function () { return { test: document.querySelectorAll('a[href*="in_test"]').length, rows: Array.prototype.map.call(document.querySelectorAll('#bill-hist .irow[data-state]'), function (r) { return r.querySelector('.ds b').textContent + ':' + r.getAttribute('data-state'); }) }; });
    ok('concord test opt-in: What you owe is the tier\'s $1,299, due, with Pay $1,299 with Stripe; the $500 invoice Stripe still holds open is neither owed nor offered', /\$1,299\s*Due\b/.test(a.owe) && !/\$500|invoice open/.test(a.owe) && a.pay === 'Pay $1,299 with Stripe' && h.test === 0, { owe: a.owe, pay: a.pay, h: h });
    ok('concord test opt-in: the history keeps the plan\'s own Stripe invoice and the opt-in that was paid and reversed (Void), and drops the withdrawn one and Stripe\'s copy of it', h.rows.join(',') === 'Opt in: Omega Plans:void,CS-0006:paid', h.rows);
    ok('concord test opt-in: the last payment is the plan\'s $1,299', /Last payment\s*\$1,299/.test(a.owe), a.owe);
    if (shotsAt) await p.screenshot({ path: path.join(shotsAt, 'concord-billing-test-optin.png'), fullPage: true });
    return {};
  } });
  STORE.legacyInvoices = []; CARD.invoices = null;
  /* ══ 5c⁗. MORE THAN FIFTEEN DAYS PAST DUE SAYS SO (Tommy, 2026-09-28: "if
     someone is over 15 days past due it says that on the dashboard to pay
     their account"), and the plan's invoice is dated the day it was DUE ("it
     was issued sept 3rd not 28th"). Concord's record: $1,299 due 25 days
     ago, unpaid, with the invoice Pay with Stripe made for it open on Stripe
     today. The home carries the notice with the figure and the invoice to
     pay, Today lists it first, the runtime's bar says it on the page, and
     Plan & billing dates the invoice to the due date. Ten days past due says
     nothing yet. OmegaTenant.pastDue is the one rule (tpastdue.js). ══ */
  var cpd = concordFx(), cpdDue = cpd.docs[cpd.billPath].subscriptionDue, cpdUrl = 'https://invoice.stripe.com/i/acct_fixture/in_due25';
  cpd.docs[cpd.billPath] = Object.assign({}, cpd.docs[cpd.billPath], { paymentProvider: 'stripe', stripeCustomerId: 'cus_concord_fixture', stripeLivemode: true,
    stripeDue: { invoiceId: 'in_due25', marker: cpd.org + '/' + cpdDue + '/129900', amountCents: 129900, dueDate: cpdDue, number: 'CS-0002', hostedUrl: cpdUrl, state: 'open', issuedAt: Date.now(), issuedBy: cpd.user.email } });
  CARD.dueOpen = { invoiceId: 'in_due25', url: cpdUrl, number: 'CS-0002' };
  CARD.invoices = [{ id: 'in_due25', number: 'CS-0002', status: 'open', amountDue: 1299, created: Date.now(), hostedUrl: cpdUrl, pdfUrl: null, omega: 'due', dueOn: cpdDue }];
  await scenario('concord-past-due', cpd, { url: '/workspace', steps: async function (p) {
    await p.waitForFunction(function () { return !!document.querySelector('#ows-notice [data-past-due]') && !!document.getElementById('omega-billing-status'); }, null, { timeout: 6000 }).catch(function () {});
    var d = await p.evaluate(function () {
      var n = document.querySelector('#ows-notice [data-past-due]'), bar = document.getElementById('omega-billing-status'), row = document.querySelector('#today .row[data-row="0"]'), chip = document.querySelector('.ows-chip.on');
      return { notice: n ? n.textContent.replace(/\s+/g, ' ') : '', days: n ? n.getAttribute('data-past-due') : null, pay: n && n.querySelector('a') ? n.querySelector('a').getAttribute('href') : null,
        bar: bar ? bar.textContent.replace(/\s+/g, ' ') : '', barDays: bar ? bar.getAttribute('data-past-due') : null, barPay: bar && bar.querySelector('a') ? bar.querySelector('a').getAttribute('href') : null,
        first: row ? { key: row.getAttribute('data-key'), cls: row.className, t: row.textContent.replace(/\s+/g, ' '), href: row.querySelector('a') ? row.querySelector('a').getAttribute('href') : null } : null, plan: chip ? chip.textContent.trim() : null };
    }).catch(function (e) { return { error: String(e) }; });
    ok('concord past due: the home says 25 days past due, names the $1,299 and pays on the Stripe invoice', d.days === '25' && /25 days past due/.test(d.notice) && /\$1,299/.test(d.notice) && d.pay === cpdUrl, d);
    ok('concord past due: Today lists it first, hot, paying on the same invoice', !!d.first && d.first.key === 'pastdue' && /\bhot\b/.test(d.first.cls) && /25 days past due/.test(d.first.t) && d.first.href === cpdUrl, d.first);
    ok('concord past due: the runtime\'s bar says it on the page with the same Pay', d.barDays === '25' && /25 days past due/.test(d.bar) && /\$1,299/.test(d.bar) && d.barPay === cpdUrl, d);
    ok('concord: the $1,299 tier wears the price book\'s word, Field, never Standard (Tommy, 2026-09-28)', d.plan === 'Field', d.plan);
    if (shotsAt) await p.screenshot({ path: path.join(shotsAt, 'concord-past-due-home.png'), fullPage: true });
    await p.evaluate(function () { location.hash = '#billing'; }); await wait(600);
    await p.waitForFunction(function (due) { return !!document.querySelector('#bill-hist time[datetime="' + due + '"]'); }, cpdDue, { timeout: 6000 }).catch(function () {});
    var b = await p.evaluate(function () { var g = function (id) { var e = document.getElementById(id); return e ? e.textContent.replace(/\s+/g, ' ') : ''; }; var t = document.querySelector('#bill-hist .irow[data-state] time'); return { owe: g('bill-owe'), when: t ? t.getAttribute('datetime') : null, rows: document.querySelectorAll('#bill-hist .irow[data-state]').length, hist: g('bill-hist'), sub: g('bill-sub') }; });
    ok('concord past due: Plan & billing dates the plan\'s invoice to the day it was due, never the day Stripe made it', b.when === cpdDue && /1 invoice open · due /.test(b.owe) && !/issued/.test(b.owe) && b.rows === 1 && /Your plan/.test(b.hist) && /CS-0002/.test(b.hist), b);
    ok('concord: Plan & billing names the Field plan', /Field plan/.test(b.sub) && !/Standard/.test(b.sub), b.sub);
    /* the payment owed is the due date's own invoice, so the NEXT invoice is the following month's, never the same date again */
    var nxd = new Date(+cpdDue.slice(0, 4), +cpdDue.slice(5, 7), +cpdDue.slice(8, 10)), nxs = nxd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }), dus = new Date(+cpdDue.slice(0, 4), +cpdDue.slice(5, 7) - 1, +cpdDue.slice(8, 10)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    ok('concord past due: Next invoice is the month after the payment owed (' + nxs + '), on the owe card and the subscription card alike', new RegExp('Next invoice\\s*' + nxs.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(b.owe) && new RegExp('Next invoice\\s*' + nxs.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(b.sub) && new RegExp('due ' + dus.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(b.owe), { owe: b.owe, sub: b.sub, want: nxs });
    return {};
  } });
  CARD.dueOpen = null; CARD.invoices = null;
  var cten = concordFx();
  cten.docs[cten.billPath] = Object.assign({}, cten.docs[cten.billPath], { subscriptionDue: new Date(Date.now() - 10 * 86400e3).toISOString().slice(0, 10) });
  await scenario('concord-ten-days', cten, { url: '/workspace', steps: async function (p) {
    await wait(800);
    var q = await p.evaluate(function () { var first = typeof needs === 'function' ? needs()[0] : null; return { notice: !!document.querySelector('#ows-notice [data-past-due]'), bar: !!document.getElementById('omega-billing-status'), first: first ? first.key : null }; }).catch(function (e) { return { error: String(e) }; });
    ok('ten days past due says nothing yet: no notice, no bar, nothing on Today', !q.notice && !q.bar && q.first !== 'pastdue', q);
    return {};
  } });
  /* ══ 5c″. EVERY CLICK (Tommy, 2026-09-27: "we need to make sure every click
     every link doesnt bug") ══
     scripts/_lib/click-sweep.js clicks every visible control on every view
     of the workspace (the home, All tools with every fold open, Modules, In
     flight, Team, Feed, Plan & billing) and in the chrome around it (rail,
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
  var SWEEP_VIEWS = ['home', 'tools', 'modules', 'flight', 'team', 'feed', 'billing'].map(function (v) {
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
  await scenario('sweep concord', concordFx(), { steps: async function (p) { return sweepAll(p, 'sweep concord'); } });
  CARD.posts = []; CARD.dueOpen = null; CARD.paid = false; CARD.invoices = null;

  /* the same sweep on the two pages the workspace sends people to that
     wear its chrome: Projects and the tools catalogue (Marketplace), as a Standard
     tenant on a desktop and a phone and a packaged Lite tenant */
  async function sweepPage(page, fx, name, phone, lagPageAuth) {
    if (ONLY && !ONLY.test(name)) return;
    PACKAGE_VIEW = fx.packageView || null; CURRENT_FX = fx;
    var errs = [], ctx = await browser.newContext({ viewport: phone ? { width: 390, height: 844 } : { width: 1366, height: 900 }, hasTouch: !!phone, isMobile: !!phone });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, function (r) {
      var url = r.request().url();
      if (/gstatic\.com\/firebasejs/.test(url)) return r.fulfill({ status: 200, contentType: 'text/javascript', body: '' });
      if (/Chart\.js/.test(url)) return r.fulfill({ status: 200, contentType: 'text/javascript', body: 'window.Chart=function(){};window.Chart.register=function(){};' });
      if (/fonts\.(googleapis|gstatic)\.com/.test(url)) return r.fulfill({ status: 200, contentType: 'text/css', body: '' });
      external.push(name + ': ' + url.slice(0, 120)); return r.abort();
    });
    await ctx.addInitScript(DOUBLE_SRC);
    await ctx.addInitScript(function (cfg) { window.FirebaseDouble.install(window, cfg); }, { user: fx.user, docs: fx.docs, latency: 8, authDomain: HOST });
    /* THE RACE, forced: the page's own sign-in answer (registered from the
       page, not from the runtime) arrives well after the entitlements */
    if (lagPageAuth) await ctx.addInitScript(function (lag) {
      var iv = setInterval(function () {
        if (!window.firebase || !firebase.auth) return; clearInterval(iv);
        var a = firebase.auth(), orig = a.onAuthStateChanged.bind(a);
        a.onAuthStateChanged = function (cb) { var fromPage = /\.html/.test(String(new Error().stack).split('\n').slice(2, 3).join('')); return orig(fromPage ? function (u) { setTimeout(function () { cb(u); }, lag); } : cb); };
      }, 1);
    }, lagPageAuth);
    var p = await ctx.newPage();
    p.on('pageerror', function (e) { if (!/duplicate-app/.test(e.message)) errs.push(e.message); });
    p.on('console', function (m) { var t = m.text(); if (m.type() === 'error' && !/^Failed to load resource|duplicate-app/.test(t)) errs.push('console: ' + t.slice(0, 240)); });
    await p.goto(base + page + '?home=workspace', { waitUntil: 'domcontentloaded' }); await wait(2500);
    /* the store paints in two answers (the price list, then the plan): sweep what a person sees once both are in */
    /* the catalogue paints in two answers (the tools, then the module each locked one belongs to): sweep what a person sees once both are in */
    if (page === '/marketplace.html') await p.waitForFunction(function () { return document.querySelectorAll('#market-grid .mkt-card').length > 10 && !!document.querySelector('#market-grid .mkt-in'); }, null, { timeout: 8000 }).catch(function () {});
    await wait(600);
    if (page === '/marketplace.html' && !fx.packageView) {
      var judged = await p.evaluate(function () { var w = window.OMEGA_WORKSPACE || {}; return { tier: w.tierLevel, named: document.querySelectorAll('#market-grid .mkt-in').length }; });
      ok(name + ': the catalogue judges every tool against the workspace\'s plan (the bound workspace, never the email stand-in) and names the module that carries a locked tool', typeof judged.tier === 'number' && judged.named > 0, judged);
    }
    ok(name + ': the page is up (its loading screen gone) and carries the workspace rail', await p.evaluate(function () { var b = document.getElementById('omega-boot'); return (!b || b.classList.contains('hide')) && !!document.querySelector('#side-nav a[data-sn="dashboard"][href="/workspace"]'); }));
    /* the catalogue's category bar narrows the grid (that is its job), so
       it is swept on its own first: each filter shows its own tools and the
       count it names, and All brings every card back; the cards are then
       swept whole */
    if (page === '/marketplace.html') {
      var chips = await p.$$eval('#mkt-filters button', function (b) { return b.map(function (x) { return x.textContent; }); });
      var filt = [];
      for (var ci = 1; ci < chips.length; ci++) {
        await p.click('#mkt-filters button >> nth=' + ci); await wait(120);
        filt.push(await p.evaluate(function (i) { var b = document.querySelectorAll('#mkt-filters button')[i], want = +((b.querySelector('.cnt') || {}).textContent || -1); return { chip: b.textContent, on: b.classList.contains('on'), sections: document.querySelectorAll('#market-grid .mkt-section').length, cards: document.querySelectorAll('#market-grid .mkt-card').length, want: want }; }, ci));
      }
      await p.click('#mkt-filters button >> nth=0'); await wait(150);
      var all = await p.evaluate(function () { return { cards: document.querySelectorAll('#market-grid .mkt-card').length, want: +((document.querySelector('#mkt-filters button .cnt') || {}).textContent || -1) }; });
      ok(name + ': each category filter shows exactly its own tools, and All brings every card back', chips.length > 2 && filt.every(function (f) { return f.on && f.sections === 1 && f.cards === f.want; }) && all.cards === all.want, { filt: filt.filter(function (f) { return !(f.on && f.sections === 1 && f.cards === f.want); }), all: all });
    }
    var r = await SWEEP.run(p, {
      views: [{ name: page.replace(/^\/|\.html$/g, ''), enter: async function (pg) { await pg.evaluate(function () { window.scrollTo(0, 0); }); } }],
      scope: '#main', chrome: '#side-nav, #topbar, .ows-tabs',
      skip: '#ows-signout, [onclick*="signOut"], #mkt-filters button', inner: '.ows-row',
      overlays: '#ows-overlay, #new-proj-modal.on, #ows-menu, #omega-package-menu, #ot-modal, #upgrade-modal, .tb-nav.open, body.ows-rail-open',
      reveal: phone ? [{ within: '#side-nav', open: async function (pg) { if (!(await pg.evaluate(function () { return document.body.classList.contains('ows-rail-open'); }))) await pg.click('#ows-burger'); } }] : [],
      forceClose: function (pg) { return pg.evaluate(function () { ['ows-overlay', 'ows-menu', 'omega-package-menu', 'upgrade-modal'].forEach(function (id) { var e = document.getElementById(id); if (e) e.remove(); }); var m = document.getElementById('new-proj-modal'); if (m) m.classList.remove('on'); var n = document.querySelector('.tb-nav'); if (n) n.classList.remove('open'); document.documentElement.classList.remove('omega-np-open'); document.body.classList.remove('ows-rail-open'); }); },
      served: SERVED
    });
    var gone = r.hidden.length + r.skipped.length;
    ok(name + ': every control still on the page when its turn came was clicked or read (' + r.clicks + ' clicked, ' + r.read.length + ' read, ' + gone + ' taken away by an earlier click, of ' + r.controls + ')', r.controls > 8 && r.clicks + r.read.length + gone >= r.controls && gone <= Math.max(6, Math.ceil(r.controls / 5)), r.hidden.concat(r.skipped));
    var kinds = {}; r.problems.forEach(function (x) { (kinds[x.kind] = kinds[x.kind] || []).push(x.control + ' — ' + x.detail); });
    ['error', 'flow', 'offscreen', 'sideways', 'reload', 'escape', 'link', 'click'].forEach(function (k) { ok(name + ': no ' + k + ' problem from any click', !kinds[k], (kinds[k] || []).slice(0, 10)); });
    ok(name + ': no uncaught or console errors', !errs.length, errs.slice(0, 6));
    console.log(JSON.stringify({ scenario: name, controls: r.controls, clicked: r.clicks, read: r.read.length, leaves: r.held.length, tabs: r.tabs.length, problems: r.problems.length, changedByAnEarlierClick: r.hidden.concat(r.skipped) }));
    await ctx.close();
  }
  await sweepPage('/projects.html', FX.northstar(HOST), 'sweep projects northstar');
  await sweepPage('/projects.html', FX.northstar(HOST), 'sweep projects northstar-phone', true);
  await sweepPage('/marketplace.html', FX.northstar(HOST), 'sweep marketplace northstar');
  await sweepPage('/marketplace.html', FX.northstar(HOST), 'sweep marketplace northstar-phone', true);
  await sweepPage('/marketplace.html', FX.lite(HOST), 'sweep marketplace lite');
  await sweepPage('/marketplace.html', FX.northstar(HOST), 'sweep marketplace northstar (sign-in answers after the entitlements)', false, 1500);
  PACKAGE_VIEW = null;


  /* ══ 5d. LITE LABS HOLDING FIVE MODULES, ON A PHONE (review #8) — the
     money column beside a module's name is the bare price, so a long name
     and a four-figure price (Office, $1,500/month) stay inside the card at
     390px and on a desktop, on the Modules page. ══ */
  var HELD = ['lite', 'estimate', 'engineering', 'siteintel', 'logic-office', 'storage'];
  var lh = FX.lite(HOST), lhb = lh.docs['omega_orgs/' + lh.org + '/billing/current'];
  lhb.modules = HELD.slice(); lhb.subscription.modules = HELD.slice();
  lh.packageView = require('../api/_lib/package-access').project({ staff: false, claims: { email_verified: true } }, lhb, lh.docs['omega_orgs/' + lh.org], lh.docs['omega_orgs/' + lh.org + '/members/uid-lite-owner'], Date.now());
  STORE.pkg = { modules: HELD.slice(), subscription: HELD.slice(), removals: [] };
  /* every visible card: the price inside the card's content box, the name on at most two lines */
  function pricesFit(p) { return p.evaluate(function () {
    var bad = [], n = 0;
    Array.prototype.forEach.call(document.querySelectorAll('#modules-body .mod'), function (c) {
      var bd = c.querySelector('.bd'), pr = c.querySelector('.nm .price'), nm = c.querySelector('.nm b');
      if (!bd || !pr || !nm || !bd.getBoundingClientRect().width || !pr.textContent) return;
      n++;
      var edge = bd.getBoundingClientRect().right - parseFloat(getComputedStyle(bd).paddingRight), over = Math.round(pr.getBoundingClientRect().right - edge), tall = nm.getBoundingClientRect().height > 2.8 * parseFloat(getComputedStyle(nm).fontSize);
      if (over > 1 || tall) bad.push(c.getAttribute('data-module') + ' "' + pr.textContent + '" ' + (over > 1 ? 'past the edge by ' + over + 'px' : '') + (tall ? ' name on three lines or more' : ''));
    });
    return { cards: n, bad: bad };
  }); }
  await scenario('lite-held', lh, { url: '/workspace#modules', steps: async function (p) {
    await p.waitForFunction(function () { return document.querySelectorAll('#modules-body .mod[data-state="live"]').length >= 5; }, null, { timeout: 6000 }).catch(function () {});
    var cols = await p.evaluate(function () { return Array.prototype.map.call(document.querySelectorAll('#modules-body .mod[data-state="live"]'), function (m) { return m.getAttribute('data-module') + '=' + m.querySelector('.price').textContent + '|' + m.querySelector('.row .note').textContent; }); });
    ok('lite-held: a Live module\'s money column is its bare price and the note says it is in the monthly fee', cols.length === HELD.length - 1 && cols.every(function (x) { return /=\$[\d,]+\/month\|On your plan · in your monthly fee\.$/.test(x); }), cols);
    var out = {}, views = [['modules', '#modules']];
    for (var vi = 0; vi < views.length; vi++) {
      await p.evaluate(function (h) { window.location.hash = h; }, views[vi][1]); await wait(300);
      for (var w of [390, 1366, 1024]) {
        await p.setViewportSize({ width: w, height: 844 }); await wait(200);
        var fit = await pricesFit(p);
        ok('lite-held: on ' + views[vi][0] + ' at ' + w + 'px every card keeps its price inside the card and its name on two lines at most', fit.cards >= 5 && !fit.bad.length, fit);
        out[views[vi][0] + '@' + w] = fit.cards;
      }
    }
    await p.setViewportSize({ width: 390, height: 844 }); await wait(200);
    return out;
  } });
  STORE.pkg = pkgDefault();

  /* ══ 5e. NEWPAY, AWAITING ITS FIRST PAYMENT (reviews #7, #23) — read-only
     with its deadline passed, so omega-tenant.js's deadline repaint runs
     (its 60 s timer cut to 1.5 s here). The workspace loads OmegaCaps as a
     library only: the repaint drives the ribbon on a page that has one, so
     no module card is hidden and every card's action still reaches the
     page: Opt in opens the one menu and Pay now reaches QuickBooks. ══ */
  var awx = FX.awaiting(HOST);
  STORE.pkg = { modules: ['lite'], subscription: ['lite', 'gridatlas'], removals: [] };
  await scenario('awaiting', awx, { url: '/workspace#modules', init: function () {
    var st = window.setTimeout;
    window.setTimeout = function (fn, ms) { var a = Array.prototype.slice.call(arguments); if (ms === 60000) a[1] = 1500; return st.apply(window, a); };
    window.__hiddenMods = 0;
    document.addEventListener('DOMContentLoaded', function () {
      new MutationObserver(function (list) { list.forEach(function (m) { if (m.target.classList && m.target.classList.contains('mod') && m.target.hasAttribute('data-package-hidden')) window.__hiddenMods++; }); }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-package-hidden', 'style'] });
    });
  }, steps: async function (p) {
    await p.waitForFunction(function () { return document.querySelectorAll('#modules-body .mod').length > 5; }, null, { timeout: 6000 }).catch(function () {});
    function repaints() { return apiCalls.filter(function (c) { return c === 'GET /api/package-access'; }).length; }
    var n0 = repaints(), t0 = Date.now();
    while (repaints() < n0 + 2 && Date.now() - t0 < 12000) await wait(250);
    await wait(500);
    var seen = await p.evaluate(function () {
      function cards(sel) { return Array.prototype.map.call(document.querySelectorAll(sel), function (m) { return { key: m.getAttribute('data-module'), hidden: m.hasAttribute('data-package-hidden') || getComputedStyle(m).display === 'none' }; }); }
      var pa = window.OMEGA_WORKSPACE && window.OMEGA_WORKSPACE.packageAccess;
      return { page: cards('#modules-body .mod'), everHidden: window.__hiddenMods, readOnly: !!(pa && pa.readOnly), ribbonDriven: !!(window.OmegaCaps && OmegaCaps.packageAccess && OmegaCaps.packageAccess()) };
    });
    ok('awaiting: the deadline repaint ran on a read-only workspace', repaints() - n0 >= 2 && seen.readOnly, { repaints: repaints() - n0, readOnly: seen.readOnly });
    ok('awaiting: no module card on the Modules page was ever hidden, and OmegaCaps was never handed the package here', seen.page.length === M.catalog().length && !seen.page.some(function (c) { return c.hidden; }) && !seen.everHidden && !seen.ribbonDriven, { everHidden: seen.everHidden, ribbonDriven: seen.ribbonDriven, hidden: seen.page.filter(function (c) { return c.hidden; }).map(function (c) { return c.key; }) });
    /* Pay now on the bought module reaches the page (a listener on the document hears it; it is stopped there so nothing leaves the machine) */
    var pay = await p.evaluate(function () {
      var a = document.querySelector('#modules-body .mod[data-module="gridatlas"] a[data-mod-act="pay"]'); if (!a) return null;
      var reached = false, h = function (e) { reached = true; e.preventDefault(); };
      document.addEventListener('click', h);
      var ev = new MouseEvent('click', { bubbles: true, cancelable: true, view: window }); a.dispatchEvent(ev);
      document.removeEventListener('click', h);
      return { href: a.getAttribute('href'), label: a.textContent, reached: reached };
    });
    ok('awaiting: Grid Atlas, bought and not on yet, offers Pay now and the click reaches the page (QuickBooks\' own page)', !!pay && pay.reached && /connect\.intuit\.com/.test(pay.href) && pay.label === 'Pay now', pay);
    /* Opt in still opens the one menu on that module */
    var sel = '#modules-body .mod[data-module="storage"] [data-mod-act="add"]';
    await p.$eval(sel, function (b) { b.scrollIntoView({ block: 'center' }); }).catch(function () {});
    await p.click(sel).catch(function () {});
    var menu = await p.waitForSelector('#omega-package-menu [data-module-card="storage"]', { timeout: 4000 }).then(function () { return true; }, function () { return false; });
    ok('awaiting: Opt in on a card still opens the one menu on that module after the deadline repaint', menu);
    await p.keyboard.press('Escape'); await wait(200);
    return {};
  } });
  STORE.pkg = pkgDefault(); STORE.posts = [];

  /* ══ 5f. NORTHSTAR WITH REQUESTS THE PLAN HAS ALREADY ANSWERED (reviews
     #10, #12) — a legacy Standard plan invoiced by ClearSky with $5,000 due
     on Nov 21. Omega EV was asked for and the plan now holds it; Omega
     Operate was asked to go and the plan no longer holds it: neither is in
     flight anywhere. Omega Capital (partly on) is asked for and Omega Grid
     (partly on) asked to go: both are, on the cards, the chips and Changes
     in progress alike. What is owed says when it is DUE, never that it was
     issued then. ══ */
  var nsx = FX.northstar(HOST), nxb = nsx.docs['omega_orgs/' + nsx.org + '/billing/current'];
  nxb.paymentProvider = 'manual'; nxb.amountDue = 5000; nxb.subscriptionDue = '2026-11-21';
  nxb.optIns = { evrebates: { key: 'evrebates', name: M.get('evrebates').name, status: 'requested', requestedAt: '2026-09-01', display: '$250/month' }, finance: { key: 'finance', name: M.get('finance').name, status: 'requested', requestedAt: '2026-09-20', display: '$500/month' } };
  nxb.optOuts = { ops: { key: 'ops', name: M.get('ops').name, status: 'requested', requestedAt: '2026-09-01' }, gridatlas: { key: 'gridatlas', name: M.get('gridatlas').name, status: 'requested', requestedAt: '2026-09-20' } };
  STORE.optIns = {}; STORE.optOuts = {};
  await scenario('northstar-stale', nsx, { url: '/workspace#modules', steps: async function (p) {
    await p.waitForFunction(function () { return document.querySelectorAll('#modules-body .mod').length > 5; }, null, { timeout: 6000 }).catch(function () {});
    var st = await p.evaluate(function () { function map(sel) { var o = {}; Array.prototype.forEach.call(document.querySelectorAll(sel), function (m) { o[m.getAttribute('data-module')] = m.getAttribute('data-state'); }); return o; } return { page: map('#modules-body .mod') }; });
    ok('northstar-stale: the Modules page reads each request by the one precedence (Omega EV Live, Omega Operate on offer, Omega Capital requested, Omega Grid opting out)', st.page.evrebates === 'live' && st.page.ops === 'available' && st.page.finance === 'requested' && st.page.gridatlas === 'removing', st.page);
    await p.evaluate(function () { window.location.hash = '#billing'; });
    await p.waitForFunction(function () { return !!document.getElementById('bill-owe'); }, null, { timeout: 5000 }).catch(function () {});
    await wait(400);
    var b = await p.evaluate(function () {
      function txt(e) { return e ? e.textContent.replace(/\s+/g, ' ').trim() : ''; }
      var f = Array.prototype.filter.call(document.querySelectorAll('#bill-sub .bh-fact'), function (x) { return x.querySelector('.l').textContent === 'Modules'; })[0];
      return { rows: Array.prototype.map.call(document.querySelectorAll('#bill-req .chg-row'), function (r) { return r.getAttribute('data-change') + ':' + txt(r.querySelector('.bpill')); }),
        soon: Array.prototype.map.call(document.querySelectorAll('#bill-sub .bh-mod.soon'), function (a) { return a.getAttribute('href'); }), leaving: Array.prototype.map.call(document.querySelectorAll('#bill-sub .bh-mod.leaving'), function (a) { return a.getAttribute('href'); }),
        storageChip: txt(document.querySelector('#bill-sub a.bh-mod[href="/workspace#module-evrebates"]')), fact: f ? txt(f.querySelector('.v')) : '', strip: txt(document.getElementById('modules-plan')), owe: txt(document.getElementById('bill-owe').querySelector('.owe-amt')) };
    });
    ok('northstar-stale: Changes in progress lists only what is in flight (Omega Capital requested, Omega Grid opting out), never the answered requests', b.rows.join('|') === 'finance:Opt-in requested|gridatlas:Opting out', b.rows);
    ok('northstar-stale: the subscription\'s chips agree: Omega EV is a plain Live chip, only Omega Capital is on its way in and only Omega Grid on its way out', b.soon.join() === '/workspace#module-finance' && b.leaving.join() === '/workspace#module-gridatlas' && !/requested/.test(b.storageChip) && b.storageChip.indexOf(M.get('evrebates').name) >= 0, b);
    var heldN = Object.keys(st.page).filter(function (k) { return ['included', 'live', 'removing'].indexOf(st.page[k]) >= 0; }).length;
    ok('northstar-stale: Plan & billing counts the modules Live as the Modules page does', b.fact === heldN + ' of ' + M.catalog().length + ' Live' && b.strip.indexOf(heldN + ' of ' + M.catalog().length + ' modules Live') >= 0, { fact: b.fact, strip: b.strip, heldN: heldN });
    ok('northstar-stale: a legacy plan\'s amount due says when it is due (Nov 21, 2026), never "issued"', /\$5,000/.test(b.owe) && /Due Nov 21, 2026/.test(b.owe) && !/issued/.test(b.owe), b.owe);
    return {};
  } });
  STORE.optIns = {}; STORE.optOuts = {};

  /* ══ 5g. CLEARSKY'S OWN WORKSPACE (review #13) — a verified
     @clearsky-usa.com address with no billing record runs Site Map as
     'internal' (OmegaCaps.resolve), so the Modules page says so too: the
     editor's capability modules read Live, not "Not on your plan". ══ */
  var cso = FX.northstar(HOST); Object.keys(cso.docs).forEach(function (k) { if (/^(omega_orgs|tenant_public)\//.test(k)) delete cso.docs[k]; });
  cso.user = { uid: cso.user.uid, email: 'tommy@clearsky-usa.com', displayName: 'Tommy G', emailVerified: true };
  await scenario('clearsky-own', cso, { url: '/workspace#modules', steps: async function (p) {
    await p.waitForFunction(function () { return document.querySelectorAll('#modules-body .mod').length > 5; }, null, { timeout: 8000 }).catch(function () {});
    var own = await p.evaluate(function () { var o = {}; Array.prototype.forEach.call(document.querySelectorAll('#modules-body .mod'), function (m) { o[m.getAttribute('data-module')] = m.getAttribute('data-state'); }); return { org: window.OMEGA_WORKSPACE && window.OMEGA_WORKSPACE.orgId, states: o }; });
    ok('clearsky-own: a verified ClearSky address with no billing record sees Plan Sets, Site Intelligence, Permitting and Engineering Live, as Site Map runs them; the storefront is on only where its own gate opens it', own.org === 'clearsky-usa.com' && ['plansets', 'siteintel', 'permitting', 'engineering'].every(function (k) { return own.states[k] === 'live'; }) && own.states.whitelabel === 'available' && own.states['logic-office'] !== 'live', own);
    return {};
  } });

  /* ══ 5h. #launch-<tool> (review #14) — a page that cannot start a tool's
     flow itself (the marketplace's Open on Site Map) links here: the home,
     then the tool as its tile opens it, the hash dropped; a locked tool
     explains. ══ */
  await scenario('launch', FX.northstar(HOST), { url: '/workspace#launch-editor', steps: async function (p) {
    var np = await p.waitForFunction(function () { var e = document.getElementById('np-name'); return !!(e && (e.offsetWidth || e.offsetHeight)); }, null, { timeout: 6000 }).then(function () { return true; }, function () { return false; });
    var at = await p.evaluate(function () { return { view: document.getElementById('content').getAttribute('data-view'), hash: window.location.hash }; });
    ok('launch: /workspace#launch-editor opens the home and starts Site Map\'s New Project flow, and drops the hash', np && at.view === 'home' && at.hash === '', at);
    await p.click('.mb-cancel').catch(function () {}); await wait(200);
    await p.evaluate(function () { window.location.hash = '#launch-investment'; }); await wait(500);
    var why = await p.$eval('.ows-drawer', function (e) { return e.textContent.replace(/\s+/g, ' '); }).catch(function () { return ''; });
    ok('launch: #launch-<a locked tool> explains in its drawer instead of opening', why.indexOf('Opt in to ' + M.get('finance').name) >= 0, why.slice(0, 160));
    await p.keyboard.press('Escape'); await wait(150);
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
    var has = function (k) { return Object.prototype.hasOwnProperty.call(page.open, k); }, out = {};
    var tools = { byKey: function (k) { return has(k) ? { key: k } : null; }, isUnlocked: function (t) { return page.open[t.key] === true; }, isVisible: function (t) { return page.visible[t.key] === true; } };
    var c = HUB.legacyCtx({ tools: tools, ws: { orgId: who && who.orgId, tierLevel: page.tierLevel, addons: (billing && billing.addons) || [], addOns: page.addOns || [] }, billing: billing, caps: CAPS_BOX.OmegaCaps, who: who });
    page.modules.forEach(function (m) { out[m.key] = HUB.moduleState(m, c); });
    return out;
  }
  var LEGACY_PAGE = function () {
    var open = {}, visible = {}; OMEGATools.all().forEach(function (t) { open[t.key] = isUnlockedHere(t); visible[t.key] = !OMEGATools.isVisible || OMEGATools.isVisible(t, WORKSPACE); });
    return { states: moduleStates(), open: open, visible: visible, tierLevel: WORKSPACE.tierLevel, addOns: WORKSPACE.addOns || [], modules: CAT.modules.map(function (m) { return { key: m.key, tools: m.tools || [], caps: m.caps || [], legacyGates: m.legacyGates || [] }; }) };
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
  if (!ONLY || ONLY.test('marketplace')) await (async function () {
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
    ok('marketplace: Grid Atlas reads In Grid Atlas · See module › and links /workspace#module-gridatlas', ga.pill === M.get('gridatlas').name && ga.inLine === 'In ' + M.get('gridatlas').name && ga.act === 'See module ›' && ga.href === '/workspace#module-gridatlas', ga);
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
    ok('marketplace (classic home): the catalogue keeps its own chrome; a locked tool names its module and See module is a button, never a link to the workspace; Site Map\'s Open is the dashboard\'s "/", where it always started', settledC && !classic.worn && classic.act === 'BUTTON See module ›' && classic.inLine === 'In ' + M.get('gridatlas').name && !classic.links && classic.editorHref === '/', classic);
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
    ok('marketplace (classic home, legacy Standard): the plan the menu is told is the Modules page\'s and Site Map\'s (the one legacy rule): Omega Compute, Omega Plans and Omega Intel only partly on (their commands sit on tabs Standard keeps shut), Omega Operate not on the plan', settledL && lp.modules.length > 10 && !lDiff.length && lp.states.compute === 'part' && lp.states.plansets === 'part' && lp.states.siteintel === 'part' && lp.states.ops === 'ask', { settled: settledL, diff: lDiff, compute: lp.states.compute });
    var opened = await seeModule(p, 'investment');
    menu = await p.evaluate(MENU_CARD, 'finance');
    ok('marketplace (classic home, legacy plan): See module on Site Investment Analysis opens the one menu on Omega Capital', opened && menu.open && menu.card, menu);
    await p.click('#opm-every').catch(function () {}); await p.waitForSelector('#omega-package-menu [data-module-card="compute"]', { timeout: 3000 }).catch(function () {});
    var comp = await p.evaluate(MENU_CARD, 'compute');
    ok('marketplace (classic home, legacy Standard): See every module shows Compute Partly included with Opt in, never On your plan with Opt out', comp.card && comp.state === 'part' && comp.badge === 'Partly included' && comp.buttons.indexOf('Opt out') < 0 && comp.buttons.indexOf('Opt in') >= 0, comp);
    /* Omega Capital switches on EXACTLY on Standard (the editor opens a live
       add-on's own commands): its Opt in is the card purchase, Opt in and
       pay at the server's price, never the recorded request */
    await p.keyboard.press('Escape'); await p.waitForSelector('#omega-package-menu', { state: 'detached', timeout: 2000 }).catch(function () {});
    await seeModule(p, 'investment');
    var capOpt = await menuPress(p, 'finance', 'Opt in');
    var capBuy = await p.locator('#omega-package-menu [data-module-card="finance"] button', { hasText: 'Opt in and pay' }).waitFor({ timeout: 4000 }).then(function () { return true; }, function () { return false; });
    var capText = (await p.evaluate(MENU_CARD, 'finance')).text;
    ok('marketplace (classic home, legacy plan): Opt in on Omega Capital, which Standard switches on exactly, is the card purchase at the server\'s price (Opt in and pay), never a request', capOpt && capBuy && /\$[\d,]+/.test(capText) && !/Request opt-in/.test(capText), capText.slice(0, 300));
    /* the storefront is ALWAYS a request (ClearSky sets it up): Request opt-in
       makes it the page's plan from then on (See every module and the next
       open read Opt-in requested with Cancel request), and a withdrawal reads
       Opt in again */
    await p.click('#opm-every').catch(function () {}); await p.waitForSelector('#omega-package-menu [data-module-card="whitelabel"]', { timeout: 3000 }).catch(function () {});
    var wl0 = await p.evaluate(MENU_CARD, 'whitelabel');
    STORE.posts = [];
    var asked = (await menuPress(p, 'whitelabel', 'Opt in')) && (await menuPress(p, 'whitelabel', 'Request opt-in'));
    await p.waitForFunction(function () { var c = document.querySelector('#omega-package-menu [data-module-card="whitelabel"]'); return !!c && c.getAttribute('data-state') === 'requested'; }, null, { timeout: 4000 }).catch(function () {});
    var wl1 = await p.evaluate(MENU_CARD, 'whitelabel');
    await p.keyboard.press('Escape'); await p.waitForSelector('#omega-package-menu', { state: 'detached', timeout: 2000 }).catch(function () {});
    await seeModule(p, 'investment');
    await p.click('#opm-every').catch(function () {}); await p.waitForSelector('#omega-package-menu [data-module-card="whitelabel"]', { timeout: 3000 }).catch(function () {});
    var wlAgain = await p.evaluate(MENU_CARD, 'whitelabel');
    ok('marketplace (classic home, legacy plan): after Request opt-in, Omega Storefront reads Opt-in requested with Cancel request in the menu and on the next open', asked && wl1.state === 'requested' && wlAgain.state === 'requested' && wlAgain.badge === 'Opt-in requested' && wlAgain.buttons.indexOf('Cancel request') >= 0, { before: wl0, now: wl1, again: wlAgain });
    var withdrawn = (await menuPress(p, 'whitelabel', 'Cancel request')) && (await menuPress(p, 'whitelabel', 'Cancel request'));
    await p.waitForFunction(function (st) { var c = document.querySelector('#omega-package-menu [data-module-card="whitelabel"]'); return !!c && c.getAttribute('data-state') === st; }, wl0.state, { timeout: 4000 }).catch(function () {});
    var wlAfter = await p.evaluate(MENU_CARD, 'whitelabel'), legacyPosts = STORE.posts.map(function (b) { return b.action + (b.dryRun ? ' (dry run)' : ''); });
    ok('marketplace (classic home, legacy plan): Cancel request withdraws it and the card offers Opt in again as before; the page asked the server exactly addon-quote (the storefront is never sold by card: the recorded request), opt-in (dry run), opt-in, withdraw-opt-in (dry run), withdraw-opt-in', withdrawn && wlAfter.state === wl0.state && wlAfter.buttons.indexOf('Opt in') >= 0 && legacyPosts.join('|') === 'addon-quote|opt-in (dry run)|opt-in|withdraw-opt-in (dry run)|withdraw-opt-in', { withdrawn: withdrawn, after: wlAfter, posts: legacyPosts });
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
    ok('marketplace (classic home, legacy Deluxe): Omega Plans is On your plan and Omega Intel and Omega Compute are Partly included, as the Modules page and Site Map say', settledD && !dDiff.length && dp.states.plansets === 'held' && dp.states.siteintel === 'part' && dp.states.compute === 'part' && dm.plansets === 'on' && dm.siteintel === 'part' && dm.compute === 'part', { settled: settledD, diff: dDiff, menu: dm });
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
    if (ONLY && !ONLY.test('flow')) return;
    if (page === '/marketplace.html') { CURRENT_FX = ns; PACKAGE_VIEW = null; STORE.posts = []; }
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
  if (!ONLY || ONLY.test('flow')) await (async function () {
    var ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, function (r) { var url = r.request().url(); if (/gstatic\.com\/firebasejs/.test(url)) return r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }); if (/Chart\.js/.test(url)) return r.fulfill({ status: 200, contentType: 'text/javascript', body: 'window.Chart=function(){};window.Chart.register=function(){};' }); return r.fulfill({ status: 200, contentType: 'text/css', body: '' }); });
    await ctx.addInitScript(DOUBLE_SRC);
    await ctx.addInitScript(function (cfg) { window.FirebaseDouble.install(window, cfg); }, { user: ns.user, docs: ns.docs, latency: 8, authDomain: HOST });
    var p = await ctx.newPage();
    await p.goto(base + '/workspace?home=classic', { waitUntil: 'domcontentloaded' }); await wait(3500);
    var where = await p.evaluate(function () { return { path: location.pathname, app: !!document.getElementById('app') && getComputedStyle(document.getElementById('app')).display !== 'none' }; });
    ok('classic choice: /workspace?home=classic lands on the classic dashboard and stays', where.path === '/' && where.app, where);
    /* review #27: Site Map's plan chip and the editor gate link
       /workspace#billing, #modules and #module-<key>; a classic home keeps
       the place: the Account panel at Billing & plan, and the one menu on
       the module (a legacy plan opens it on the marketplace, where the
       classic home keeps it) */
    var acctErrs = []; p.on('pageerror', function (e) { if (!/duplicate-app/.test(e.message)) acctErrs.push(e.message); });
    await p.goto(base + '/workspace#billing', { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(function () { var o = document.getElementById('acct-overlay'); return location.pathname === '/' && !!o && o.classList.contains('show'); }, null, { timeout: 8000 }).catch(function () {});
    var acct = await p.evaluate(function () { var o = document.getElementById('acct-overlay'), t = Array.prototype.filter.call(document.querySelectorAll('#acct-overlay .acct-sec-title'), function (e) { return /^Billing/.test(e.textContent); })[0], r = t && t.getBoundingClientRect(); return { path: location.pathname, hash: location.hash, open: !!o && o.classList.contains('show'), billingInView: !!(r && r.height > 0 && r.top >= 0 && r.top < window.innerHeight) }; });
    ok('classic choice: /workspace#billing on a classic home lands on the dashboard with the Account panel open at Billing & plan', acct.path === '/' && acct.hash === '#billing' && acct.open && acct.billingInView, acct);
    await p.goto(base + '/workspace#module-gridatlas', { waitUntil: 'domcontentloaded' });
    var mod = await p.waitForFunction(function () { return location.pathname === '/marketplace.html' && !!document.querySelector('#omega-package-menu [data-module-card="gridatlas"]'); }, null, { timeout: 10000 }).then(function () { return true; }, function () { return false; });
    var modAt = await p.evaluate(function () { return location.pathname + location.hash; });
    ok('classic choice: /workspace#module-gridatlas on a classic home (a legacy plan) opens the one menu on Grid Atlas where the classic home keeps it', mod && modAt === '/marketplace.html#gridatlas', modAt);
    ok('classic choice: no uncaught errors on the way', !acctErrs.length, acctErrs);
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
