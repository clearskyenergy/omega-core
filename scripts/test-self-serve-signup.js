#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   scripts/test-self-serve-signup.js — sign up, pay in QuickBooks, activate
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   One system (Tommy, 2026-09-26): a company signs up, its details make the
   QuickBooks customer, it chooses its package, and it pays its first
   invoice by card on QuickBooks' page; the workspace opens the moment the
   payment reconciles, with nobody's approval. On the Firestore double with
   a QuickBooks driver double: the public price list, signup's pay-now path
   (the engine's own activation, marked self-serve and audited), the pay
   step's "I've paid" (plan-change reconcile-now, throttled), the fallback to
   the approval path when the invoice cannot be issued, the trial request
   unchanged, the engine's LIVE mode, and the pages that carry it.

     node scripts/test-self-serve-signup.js
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
var F = require('./_lib/firestore-double'), DB = F.DB, mock = F.mock, H = require('./_lib/packaging-billing-fixture');
var ROOT = path.join(__dirname, '..');
function read(f) { return fs.readFileSync(path.join(ROOT, f), 'utf8'); }
var db, caller, claims = [], mails = [];
mock('../api/_lib/admin', {
  handler: function (f) { return f; }, authenticate: async function () { return caller; }, db: function () { return db; },
  orgOf: function (email) { return String(email).toLowerCase().split('@')[1]; }, safeOrg: function (v) { return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(v || '') ? v : ''; },
  httpError: function (s, m) { var e = new Error(m); e.status = s; return e; }, FieldValue: function () { return { serverTimestamp: function () { return new Date().toISOString(); } }; },
  init: function () { return { auth: function () { return { setCustomUserClaims: async function (uid, c) { claims.push([uid, c]); } }; } }; },
  isTenantAdmin: async function (c, org) { var m = await db.doc('omega_orgs/' + org + '/members/' + c.uid).get(); return m.exists && ['owner', 'admin'].indexOf(m.data().role) >= 0; },
  canActInOrg: async function (c, org) { return c.orgId === org; } });
mock('../api/_lib/mail', { templates: { signupReceived: async function (o) { mails.push(['received', o]); }, signupAlert: async function (o) { mails.push(['alert', o]); }, packageInvoice: async function (o) { mails.push(['invoice', o]); }, approved: async function (o) { mails.push(['approved', o]); } } });
/* the QuickBooks driver: a customer, an invoice with its card-payment page, and a reconciliation the test controls */
var qbo = { paid: false, failCustomer: false, invoices: [] };
require('../api/_lib/qbo-billing').driver = function () {
  return { customer: async function (orgId) { if (qbo.failCustomer) { var e = new Error('QuickBooks is down'); e.status = 503; throw e; } return 'C-' + orgId; },
    invoice: async function (plan) { qbo.invoices.push(plan); return { id: 'INV-' + qbo.invoices.length, totalCents: plan.subtotalCents, payUrl: 'https://connect.intuit.com/pay/inv-' + qbo.invoices.length }; },
    reconcile: async function (record) { return { satisfied: qbo.paid, reversed: false, paidCents: qbo.paid ? record.totalCents : 0, payUrl: record.paymentLink }; } };
};
var ENV = { PACKAGING_SIGNUP_ENABLED: 'true', PACKAGING_BILLING_ENABLED: 'true', QBO_ENV: 'sandbox', TRIAL_DAYS: '14', PACKAGING_LIVE: '' };
Object.keys(ENV).forEach(function (k) { process.env[k] = ENV[k]; });
var signup = require('../api/tenant-signup'), offerings = require('../api/offerings'), planChange = require('../api/plan-change'), S = require('../api/_lib/package-billing'), X = require('../api/_lib/package-access');
var RES = { setHeader: function () {} };
function who(email, extra) { return Object.assign({ uid: 'u-' + email.split('@')[0], email: email, orgId: email.split('@')[1], staff: false, claims: { email_verified: true, name: 'Kim Sato' } }, extra || {}); }
function profile(org) { return H.profile(org, 'Newco Energy LLC'); }
function body(extra) { return Object.assign({ companyName: 'Newco Energy', vertical: 'oem', slug: 'newco', billingProfile: profile('newco.example'), modules: ['lite', 'gridatlas'], interval: 'monthly' }, extra || {}); }
function seed() { db = new DB(); qbo.paid = false; qbo.failCustomer = false; qbo.invoices = []; mails = []; claims = []; db.seed('pricebook/' + H.enabledBook().version, H.enabledBook()); caller = who('kim@newco.example'); }
async function refused(p, status, re) { try { await p; } catch (e) { assert.equal(e.status, status, e.message); if (re) assert.match(e.message, re); return e; } assert.fail('expected a ' + status); }
var count = 0; async function test(n, f) { await f(); count++; console.log('PASS ' + n); }

(async function () {
  console.log('\nthe price list (GET /api/offerings, public)');
  await test('the offerings are the book\'s, formatted by the server, and say whether signup pays at the end; nothing confidential is in them', async function () {
    seed(); var o = await offerings({ method: 'GET' }, RES);
    assert.equal(o.source, 'seeded'); assert.equal(o.floorDisplay, '$500/month'); assert.equal(o.lite.monthlyDisplay, '$500/month');
    assert.deepEqual(o.plans.map(function (p) { return p.name + ' ' + p.monthlyDisplay; }), ['Field $1,299/month', 'Pro $2,499/month']);
    assert.ok(o.modules.length >= 19 && o.modules.every(function (m) { return /^\$[\d,]+\/month$/.test(m.monthlyDisplay) && Array.isArray(m.features); }));
    assert.ok(o.starters.ev && o.starterLabels.ev); assert.equal(o.trial.days, 14); assert.equal(o.signup.packaged, true); assert.equal(o.signup.payNow, true); assert.equal(o.signup.start, '/start.html');
    var text = JSON.stringify(o); assert.ok(!/realmId|items|qbo|token|secret/.test(text), 'no realm, item ids or secrets in the public list');
    db = new DB(); var p = await offerings({ method: 'GET' }, RES); assert.equal(p.source, 'proposed', 'unseeded: the repo\'s proposed book, and it says so');
    await refused(offerings({ method: 'POST' }, RES), 405);
  });

  console.log('\nsign up and pay at the end');
  await test('pay now: the company and billing details make the QuickBooks customer, the first invoice carries the card-payment page, the workspace is active but read-only until it is paid, and it is all audited as self-serve', async function () {
    seed();
    var opts = await signup({ method: 'GET', query: {} }, RES); assert.equal(opts.payNow, true);
    var r = await signup({ method: 'POST', body: body({ payNow: true }) }, RES);
    assert.equal(r.created, true); assert.equal(r.payNow, true); assert.equal(r.status, 'active'); assert.equal(r.packagingState, 'awaiting_payment');
    assert.equal(r.paymentLink, 'https://connect.intuit.com/pay/inv-1'); assert.match(r.amountDueDisplay, /^\$[\d,]+/); assert.equal(r.host, 'newco.clearskyomega.com');
    var org = db.data.get('omega_orgs/newco.example'), bill = db.data.get('omega_orgs/newco.example/billing/current'), pub = db.data.get('tenant_public/newco.clearskyomega.com');
    assert.equal(org.status, 'active'); assert.equal(org.approvedBy, 'self-serve'); assert.equal(org.selfServe, true); assert.equal(pub.status, 'active');
    assert.equal(bill.packaged, true); assert.equal(bill.packagingState, 'awaiting_payment'); assert.equal(bill.qboCustomerId, 'C-newco.example'); assert.equal(bill.qboEnv, 'sandbox');
    assert.deepEqual(bill.subscription.modules, ['lite', 'gridatlas'], 'what they bought'); assert.deepEqual(bill.modules, ['lite'], 'switched on: Lite until the invoice is paid');
    assert.equal(bill.paymentLink, r.paymentLink); assert.ok(bill.amountDue > 0);
    assert.equal(qbo.invoices.length, 1); assert.ok(qbo.invoices[0].lines.some(function (l) { return l.itemKey === 'service-fee'; }), 'the first invoice carries the first year\'s service fee');
    var inv = db.data.get('omega_orgs/newco.example/billing/current/invoices/' + qbo.invoices[0].date); assert.equal(inv.state, 'unpaid'); assert.equal(inv.qboInvoiceId, 'INV-1');
    var hist = Array.from(db.data.keys()).filter(function (k) { return /billing\/current\/history\//.test(k); }).map(function (k) { return db.data.get(k); });
    assert.equal(hist.length, 1); assert.equal(hist[0].action, 'package-activate'); assert.equal(hist[0].selfServe, true); assert.equal(hist[0].by, 'kim@newco.example');
    assert.ok(Array.from(db.data.keys()).some(function (k) { return /admin_audit\//.test(k); }), 'and the audit row');
    var view = X.project({ staff: false, claims: { email_verified: true } }, bill, org, { role: 'owner' }, Date.now());
    assert.equal(view.readOnly, true); assert.match(view.billingNotice.text, /read-only/); assert.equal(view.billingNotice.payUrl, r.paymentLink, 'the workspace shows the pay link until it is paid');
    assert.deepEqual(claims[0], ['u-kim', { orgId: 'newco.example', role: 'owner' }]);
    var received = mails.filter(function (m) { return m[0] === 'received'; })[0][1]; assert.equal(received.payNow, true); assert.equal(received.paymentLink, r.paymentLink);
    assert.equal(mails.filter(function (m) { return m[0] === 'alert'; })[0][1].payNow, true);
  });
  await test('"I\'ve paid" looks at QuickBooks now: unpaid says so; paid opens the workspace with the package bought; a second look inside eight seconds is throttled', async function () {
    seed(); await signup({ method: 'POST', body: body({ payNow: true }) }, RES);
    var again = await signup({ method: 'POST', body: body() }, RES);
    assert.equal(again.exists, true); assert.equal(again.payNow, true); assert.equal(again.packagingState, 'awaiting_payment'); assert.match(again.paymentLink, /inv-1/);
    var c1 = await signup({ method: 'POST', body: { action: 'check-payment' } }, RES);
    assert.equal(c1.paid, false); assert.equal(c1.packagingState, 'awaiting_payment'); assert.equal(c1.host, 'newco.clearskyomega.com');
    var c2 = await signup({ method: 'POST', body: { action: 'check-payment' } }, RES); assert.equal(c2.throttled, true);
    db.seed('omega_orgs/newco.example/billing/current', Object.assign({}, db.data.get('omega_orgs/newco.example/billing/current'), { paymentCheckedAt: Date.now() - 9000 }));
    qbo.paid = true;
    var c3 = await signup({ method: 'POST', body: { action: 'check-payment' } }, RES);
    assert.equal(c3.paid, true); assert.equal(c3.packagingState, 'paid'); assert.ok(c3.accessUntil > Date.now()); assert.equal(c3.host, 'newco.clearskyomega.com');
    var bill = db.data.get('omega_orgs/newco.example/billing/current');
    assert.deepEqual(bill.modules, ['lite', 'gridatlas'], 'paid: the package bought is switched on'); assert.equal(bill.amountDue, 0);
    var view = X.project({ staff: false, claims: { email_verified: true } }, bill, db.data.get('omega_orgs/newco.example'), { role: 'owner' }, Date.now());
    assert.equal(view.readOnly, false); assert.ok(view.toolAccess.indexOf('gridatlas') >= 0);
    await refused(signup({ method: 'POST', body: { action: 'check-payment' } }, Object.assign({}, RES)).then(function () { caller = who('pat@newco.example'); return signup({ method: 'POST', body: { action: 'check-payment' } }, RES); }), 403, /owner/);
    caller = who('kim@newco.example');
  });
  await test('the same look is on the workspace\'s billing bar and in settings: plan-change reconcile-now, for the owner or an administrator', async function () {
    seed(); await signup({ method: 'POST', body: body({ payNow: true }) }, RES);
    db.seed('omega_orgs/newco.example/billing/current', Object.assign({}, db.data.get('omega_orgs/newco.example/billing/current'), { paymentCheckedAt: 0 }));
    var r1 = await planChange({ method: 'POST', body: { action: 'reconcile-now' } }, RES); assert.equal(r1.paid, false); assert.match(r1.amountDueDisplay, /^\$/);
    db.seed('omega_orgs/newco.example/billing/current', Object.assign({}, db.data.get('omega_orgs/newco.example/billing/current'), { paymentCheckedAt: 0 }));
    qbo.paid = true; var r2 = await planChange({ method: 'POST', body: { action: 'reconcile-now' } }, RES); assert.equal(r2.paid, true); assert.equal(r2.packagingState, 'paid');
    db.seed('omega_orgs/newco.example/members/u-pat', { email: 'pat@newco.example', role: 'member', status: 'active' }); caller = who('pat@newco.example');
    await refused(planChange({ method: 'POST', body: { action: 'reconcile-now' } }, RES), 403, /administrator/);
    caller = who('kim@newco.example');
  });
  await test('when the first invoice cannot be issued, the request falls back to approval and says so; nothing is half-opened', async function () {
    seed(); qbo.failCustomer = true;
    var r = await signup({ method: 'POST', body: body({ payNow: true }) }, RES);
    assert.equal(r.created, true); assert.equal(r.payNow, false); assert.match(r.payNowError, /could not be issued|QuickBooks/); assert.equal(r.paymentLink, undefined);
    var org = db.data.get('omega_orgs/newco.example'); assert.equal(org.status, 'pending'); assert.equal(org.approvedBy, null); assert.match(org.payNowError, /QuickBooks/);
    assert.equal(db.data.get('tenant_public/newco.clearskyomega.com').status, 'pending');
    var bill = db.data.get('omega_orgs/newco.example/billing/current'); assert.equal(bill.packagingState, 'pending'); assert.equal(bill.paymentLink, undefined);
    assert.equal(mails.filter(function (m) { return m[0] === 'received'; })[0][1].payNow, false);
  });
  await test('a trial request is unchanged: pending, no invoice, approval starts the trial', async function () {
    seed(); var r = await signup({ method: 'POST', body: body() }, RES);
    assert.equal(r.created, true); assert.equal(r.status, 'pending'); assert.equal(r.payNow, undefined); assert.equal(qbo.invoices.length, 0);
    assert.equal(db.data.get('omega_orgs/newco.example/billing/current').packagingState, 'pending');
    assert.equal(mails.filter(function (m) { return m[0] === 'received'; })[0][1].payNow, false);
  });
  await test('a plan named by the offerings page rides along; an unknown one is ignored', async function () {
    seed(); var r = await signup({ method: 'POST', body: body({ payNow: true, modules: ['lite', 'gridatlas', 'storage', 'estimate'], plan: 'field' }) }, RES);
    assert.equal(r.payNow, true); var bill = db.data.get('omega_orgs/newco.example/billing/current'); assert.equal(bill.subscription.plan, 'field');
    seed(); await signup({ method: 'POST', body: body({ payNow: true, plan: 'platinum' }) }, RES); assert.notEqual(db.data.get('omega_orgs/newco.example/billing/current').subscription.plan, 'platinum');
  });
  await test('pay now is not offered when the billing flag is off, and a request then is a trial request', async function () {
    seed(); process.env.PACKAGING_BILLING_ENABLED = 'false';
    var opts = await signup({ method: 'GET', query: {} }, RES); assert.equal(opts.payNow, false);
    var o = await offerings({ method: 'GET' }, RES); assert.equal(o.signup.payNow, false); assert.equal(o.signup.packaged, true);
    var r = await signup({ method: 'POST', body: body({ payNow: true }) }, RES); assert.equal(r.payNow, false); assert.equal(db.data.get('omega_orgs/newco.example').status, 'pending');
    process.env.PACKAGING_BILLING_ENABLED = 'true';
  });

  console.log('\nthe engine\'s two modes');
  await test('LIVE needs the switch, the production realm and a book under a release version; sandbox stays as it was', async function () {
    seed();
    var book = H.enabledBook(); function ctx(b, org) { return { org: org || { packagingSandbox: true }, billing: {}, profile: null, book: b, root: db.doc('omega_orgs/x.example') }; }
    assert.equal(S.canApply(ctx(book)), true, 'sandbox: marked tenant, sandbox book');
    assert.equal(S.canApply(ctx(book, { packagingSandbox: false })), false, 'sandbox: an unmarked tenant is refused');
    process.env.QBO_ENV = 'production'; assert.equal(S.canApply(ctx(book)), false, 'a production realm without the live switch is refused');
    process.env.PACKAGING_LIVE = 'true'; assert.equal(S.live(), true);
    assert.equal(S.canApply(ctx(book)), false, 'live with a sandbox book is refused');
    var prod = H.enabledBook(); prod.qbo.env = 'production'; prod.qbo.realmId = '9130000000000000';
    assert.equal(S.canApply(ctx(prod, { packagingSandbox: false })), true, 'live: any tenant may buy on the production book');
    var noRealm = H.enabledBook(); noRealm.qbo.env = 'production'; noRealm.qbo.realmId = null; assert.equal(S.canApply(ctx(noRealm)), false, 'live: the book must name the production realm');
    process.env.QBO_ENV = ''; assert.equal(S.live(), false, 'QBO_ENV unset is not production here: both settings are literal');
    process.env.PACKAGING_LIVE = ''; process.env.QBO_ENV = 'sandbox';
    assert.equal(S.canApply(ctx(book)), true);
    /* the book's own validation: a "-proposed" version is never the production company's, and a production book names its realm */
    var PB = require('../api/_lib/pricebook');
    assert.throws(function () { var b = H.enabledBook(); b.qbo.env = 'production'; b.qbo.realmId = '9130000000000000'; PB.validate(b); }, /sign the values off/);
    assert.throws(function () { var b = H.enabledBook(); b.version = '2026-10'; b.qbo.env = 'production'; b.qbo.realmId = null; PB.validate(b); }, /names the production realm/);
    assert.throws(function () { var b = H.enabledBook(); b.qbo.env = 'staging'; PB.validate(b); }, /sandbox or production/);
  });
  await test('LIVE end to end: under a release version, signup makes the production customer and invoice, the record is not a sandbox tenant, and the daily runner finds and reconciles it by its packaged mark', async function () {
    var PB = require('../api/_lib/pricebook'), I = require('../api/_lib/qbo-items'), Runner = require('../api/_lib/package-billing-runner'), savedVersion = PB.VERSION;
    PB.VERSION = '2026-10'; process.env.PACKAGING_LIVE = 'true'; process.env.QBO_ENV = 'production';
    try {
      db = new DB(); qbo.paid = false; qbo.failCustomer = false; qbo.invoices = []; mails = []; claims = []; caller = who('kim@newco.example');
      var prod = H.enabledBook(); prod.version = '2026-10'; prod.qbo.env = 'production'; prod.qbo.realmId = '9130000000000000'; PB.validate(prod); db.seed('pricebook/2026-10', prod);
      var opts = await signup({ method: 'GET', query: {} }, RES); assert.equal(opts.payNow, true); assert.equal(opts.pricebookVersion, '2026-10');
      var r = await signup({ method: 'POST', body: body({ payNow: true }) }, RES);
      assert.equal(r.payNow, true); assert.equal(r.packagingState, 'awaiting_payment'); assert.match(r.paymentLink, /inv-1/);
      var org = db.data.get('omega_orgs/newco.example'), bill = db.data.get('omega_orgs/newco.example/billing/current');
      assert.equal(org.packagingSandbox, false, 'a live signup is not a sandbox tenant'); assert.equal(org.packaged, true, 'and is marked packaged for the runner');
      assert.equal(bill.qboEnv, 'production'); assert.equal(bill.qboRealmId, '9130000000000000'); assert.equal(bill.pricebookVersion, '2026-10');
      /* a sandbox-marked tenant from a preview is not the live runner's */
      db.seed('omega_orgs/old-preview.example', { status: 'active', packagingSandbox: true, domains: ['old.example'] });
      db.seed('omega_orgs/old-preview.example/billing/current', { packaged: true, packagingState: 'paid', modules: ['lite'], pricebookVersion: '2026-10' });
      qbo.paid = true; var tick = await Runner.tick(db, Date.now(), { limit: 5 });
      assert.equal(tick.disabled, undefined, 'the runner runs in live mode'); assert.deepEqual(tick.results.map(function (x) { return x.orgId; }), ['newco.example']);
      assert.equal(tick.results[0].reviewRequired, undefined, tick.results[0].error);
      bill = db.data.get('omega_orgs/newco.example/billing/current'); assert.equal(bill.packagingState, 'paid'); assert.deepEqual(bill.modules, ['lite', 'gridatlas']);
      /* the QuickBooks guard every write passes: the production host, book and connection agree, or nothing is sent */
      var depsProd = { Q: { ENV: 'production', IS_SANDBOX: false, API_BASE: 'https://quickbooks.api.intuit.com', load: async function () { return { env: 'production', realmId: '9130000000000000' }; } } };
      var depsSand = { Q: { ENV: 'sandbox', IS_SANDBOX: true, API_BASE: 'https://sandbox-quickbooks.api.intuit.com', load: async function () { return { env: 'sandbox', realmId: '123' }; } } };
      await I.guard(prod, '9130000000000000', depsProd);
      await assert.rejects(I.guard(prod, '9130000000000000', depsSand), /production host/, 'live, but the process points at the sandbox host');
      await assert.rejects(I.guard(prod, '9130000000000001', depsProd), /realm mismatch/);
      var stale = { Q: Object.assign({}, depsProd.Q, { load: async function () { return { env: 'production', realmId: '777' }; } }) };
      await assert.rejects(I.guard(prod, '9130000000000000', stale), /not the requested production/);
      process.env.PACKAGING_LIVE = '';
      await assert.rejects(I.guard(prod, '9130000000000000', depsProd), /sandbox-only/, 'the switch off: the production book is refused');
      assert.equal((await Runner.tick(db, Date.now(), { limit: 5 })).reason, 'sandbox-required', 'and the runner stops');
      await refused(signup({ method: 'GET', query: {} }, RES), 409, /sandbox-only/);
    } finally { PB.VERSION = savedVersion; process.env.PACKAGING_LIVE = ''; process.env.QBO_ENV = 'sandbox'; }
  });
  await test('the two scripts refuse a half-set live run before touching anything', async function () {
    var cp = require('child_process');
    function run(args, env) { var r = cp.spawnSync(process.execPath, args, { cwd: ROOT, env: Object.assign({}, process.env, env || {}), encoding: 'utf8' }); return { code: r.status, out: r.stdout + r.stderr }; }
    var a = run(['scripts/seed-pricebook.js', '--live']); assert.equal(a.code, 1); assert.match(a.out, /--live needs --realm/);
    var b = run(['scripts/seed-pricebook.js', '--realm=9130000000000000']); assert.equal(b.code, 1); assert.match(b.out, /--realm goes with --live/);
    var c = run(['scripts/seed-pricebook.js', '--live', '--realm=9130000000000000']); assert.equal(c.code, 1); assert.match(c.out, /sign the values off/, 'the proposed version cannot be seeded for production');
    var d = run(['scripts/seed-pricebook.js']); assert.equal(d.code, 0); assert.match(d.out, /"dryRun": true/); assert.match(d.out, /"live": false/);
    var e = run(['scripts/qbo-sync-items.js', '--live'], { PACKAGING_LIVE: '', QBO_ENV: 'sandbox' }); assert.equal(e.code, 1); assert.match(e.out, /--live needs PACKAGING_LIVE=true/);
    var f = run(['scripts/qbo-sync-items.js', '--apply', '--realm=1', '--income-account=1', '--taxable'], { PACKAGING_LIVE: 'true', QBO_ENV: 'production' }); assert.equal(f.code, 1); assert.match(f.out, /say --live/);
    var g = run(['scripts/qbo-sync-items.js'], { PACKAGING_LIVE: 'true', QBO_ENV: 'production' }); assert.equal(g.code, 0); assert.match(g.out, /"dryRun": true/, 'a dry run needs no confirmation');
  });

  console.log('\nthe pages');
  await test('signup, login and the workspace carry the path: pay and start, the pay step, the offerings link, "I\'ve paid"', async function () {
    var st = read('start.html'), lg = read('login.html'), of = read('offerings.html'), ot = read('omega-tenant.js');
    assert.match(st, /id="billing-pay" onclick="submitWorkspace\(true, false, true\)">Pay and start now</); assert.match(st, /id="billing-submit" onclick="submitWorkspace\(true\)">Request a 14-day trial instead</);
    assert.match(st, /<div id="step-pay" class="hide">/); assert.match(st, /id="pay-link" target="_blank" rel="noopener">Pay now in QuickBooks</); assert.match(st, /onclick="checkPayment\(true\)">I've paid — open my workspace</);
    assert.match(st, /action: 'check-payment'/); assert.match(st, /if \(j\.payNow\) \{ showPay\(j, name\); return; \}/); assert.match(st, /function wantedModules\(\)/); assert.match(st, /if \(payNow\) payload\.payNow = true;/);
    assert.match(lg, /id="suPackaged"/); assert.match(lg, /fetch\('\/api\/offerings'/); assert.match(lg, /href="\/offerings\.html"/);
    assert.match(of, /XMLHttpRequest\(\); x\.open\('GET', '\/api\/offerings'\)/); assert.ok(!/firebase|omega-tenant\.js/.test(of), 'the price list is a public page: no sign-in, no tenant runtime');
    assert.ok(!/=>|\blet\s|\bconst\s|`/.test(of.replace(/<!--[\s\S]*?-->/g, '')), 'ES5');
    assert.match(ot, /action: 'reconcile-now'/); assert.match(ot, /paid\.textContent = "I've paid"/);
  });
  console.log('\n' + count + ' self-serve signup checks passed. No network calls.\n');
})().catch(function (e) { console.error(e); process.exit(1); });
