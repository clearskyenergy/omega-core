/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Refer & earn (api/_lib/refer.js, api/refer.js): the codes, who sent whom
 * at signup, the $500 reward on the referred workspace's first payment, a
 * code applied to the bill (QuickBooks invoice, Stripe balance, by hand),
 * the credit drawn onto the next invoice as the invoice's ONE discount line,
 * invitations, and ClearSky's controls. The Firestore double, QuickBooks,
 * Stripe and mail stood in for; no network.
 */
'use strict';
var assert = require('assert'), F = require('./_lib/firestore-double');
var B = require('../api/_lib/pricebook'), M = require('../api/_lib/modules'), R = require('../api/_lib/proration');
var db, count = 0, mails = [];
function mail(name) { return async function (o) { mails.push({ name: name, o: o }); return { ok: true }; }; }
var MAIL = { templates: {} };
['referInvite', 'referEarned', 'referAlert', 'signupReceived', 'signupAlert', 'billingAlert'].forEach(function (n) { MAIL.templates[n] = mail(n); });
F.mock('../api/_lib/mail', MAIL);
function safeOrg(v) { var s = String(v == null ? '' : v).trim().toLowerCase(); return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(s) ? s : ''; }
F.mock('../api/_lib/admin', { handler: function (fn) { return fn; }, authenticate: async function (req) { return req.caller; }, db: function () { return db; },
  httpError: function (status, text) { var e = new Error(text); e.status = status; return e; }, safeOrg: safeOrg, orgOf: function (e) { return String(e).toLowerCase().split('@')[1]; },
  isTenantAdmin: async function (c, o) { return c.staff || (c.orgId === o && ['owner', 'admin'].indexOf(c.role) >= 0); },
  init: function () { return { auth: function () { return { setCustomUserClaims: async function () {} }; } }; },
  FieldValue: function () { return { serverTimestamp: function () { return Date.now(); } }; } });
var Refer = require('../api/_lib/refer'), S = require('../api/_lib/package-billing'), Q = require('../api/_lib/qbo-billing'), api = require('../api/refer');
var originalDriver = Q.driver, res = { setHeader: function () {} };
var SENDER = 'sender.example', NEWCO = 'newco.example', DAY = 86400000;
var staff = { staff: true, uid: 'staff', email: 'staff@clearsky-usa.com', orgId: 'clearsky-usa.com', claims: { email_verified: true } };
var owner = { staff: false, uid: 'owner', email: 'owner@' + SENDER, orgId: SENDER, role: 'owner', claims: { email_verified: true, name: 'Olive Owner' } };
var member = Object.assign({}, owner, { uid: 'm1', email: 'mo@' + SENDER, role: 'member' });
var profile = { legalName: 'Sender Example', contactName: 'Olive Owner', email: 'ap@' + SENDER, phone: '555-0100',
  address: { line1: '1 Example', city: 'Chicago', state: 'IL', postalCode: '60601', country: 'US' }, vertical: 'developer', teamSize: 3 };
function equal(a, b, text) { assert.deepStrictEqual(a, b, text); count++; }
function ok(v, text) { assert(v, text); count++; }
async function refused(fn, re) { await assert.rejects(fn, re); count++; }
async function status(fn, code) { await assert.rejects(fn, function (e) { return e.status === code; }); count++; }
function doc(p) { return db.data.get(p); }
function paths(prefix) { return Array.from(db.data.keys()).filter(function (p) { return p.indexOf(prefix) === 0; }); }
function call(method, body, caller) { return api({ method: method, query: body, body: body, caller: caller || owner, headers: {} }, res); }
function book() { var b = B.proposed(); b.enabled = true; b.qbo.realmId = '123'; return b; }
/* a packaged sandbox workspace whose current cycle is paid (the plan-change test's shape) */
function packaged(orgId, modules, plan, extra) {
  var on = '2026-09-20', cycle = R.cycle(on, 20), grants = M.resolve(modules);
  db.seed('omega_orgs/' + orgId, { name: orgId === SENDER ? 'Sender Example' : 'Newco', status: 'active', packagingSandbox: true, domains: [orgId], signedUpAt: '2026-08-20T12:00:00Z' });
  db.seed('omega_orgs/' + orgId + '/billing/current', Object.assign({ packaged: true, packagingState: 'paid', modules: modules, plan: plan, billingDay: 20, interval: 'monthly',
    qboCustomerId: 'C1', qboRealmId: '123', pricebookVersion: B.VERSION, billingProvider: 'quickbooks', subscriptionStartedAt: Date.parse('2026-08-20T12:00:00Z'),
    firstInvoiceOn: '2026-08-20', nextInvoiceOn: cycle.end, serviceFeeNextOn: '2027-08-20', paidThrough: cycle.end, accessUntil: Date.parse(cycle.end + 'T00:00:00Z') + 20 * DAY,
    builders: 3, viewers: 10, subscription: { modules: modules, plan: plan, interval: 'monthly', builders: 3, viewers: 10, since: Date.parse('2026-08-20T12:00:00Z') } }, grants, extra || {}));
  db.seed('omega_orgs/' + orgId + '/billing/profile', Object.assign({}, profile, { email: 'ap@' + orgId }));
  db.seed('omega_orgs/' + orgId + '/members/owner', { email: 'owner@' + orgId, role: 'owner', status: 'active' });
}
function fresh() { db = new F.DB(); db.serial = true; mails = []; db.seed('pricebook/' + B.VERSION, book()); }
function credit(code, orgId, extra) { db.seed('refer_credits/' + code, Object.assign({ code: code, orgId: orgId, amountCents: 50000, remainingCents: 50000, state: 'issued', referredOrgId: 'x.example', referredName: 'X Co', issuedAt: Date.now(), expiresAt: Date.now() + 365 * DAY }, extra || {})); }

async function run() {
  process.env.PACKAGING_BILLING_ENABLED = 'true'; process.env.QBO_ENV = 'sandbox';
  var now = Date.parse('2026-09-27T12:00:00Z'), realNow = Date.now; Date.now = function () { return now; };

  /* ── the codes ──────────────────────────────────────────────────── */
  equal(Refer.normalize(' cr-7k3pq-9xd2m '), 'CR7K3PQ9XD2M', 'case, spaces and dashes do not matter');
  ok(Refer.isCredit('CR7K3PQ9XD2M') && !Refer.isCredit('CR7K3PQ9XD2') && !Refer.isCredit('CR7K3PQ9XD2O'), 'a credit code is CR + ten of the 32 characters');
  ok(Refer.isShare('K7P3QX9D') && !Refer.isShare('K7P3QX90') && !Refer.isShare('CR7K3PQ9XD2M'), 'a share code is eight, never a 0 or an O');
  equal(Refer.pretty('CR7K3PQ9XD2M'), 'CR-7K3PQ-9XD2M');
  equal(Refer.REWARD_CENTS, 50000, 'the reward is $500');

  /* ── draw: a credit on an invoice plan, never below $0 ─────────── */
  var plan = { date: '2026-10-20', lines: [{ itemKey: 'plan:field', name: 'Field', amountCents: 129900 }, { itemKey: 'credit', name: 'Transformation credit', amountCents: -51960 }], subtotalCents: 77940, display: { subtotal: '$779.40' } };
  var d = Refer.draw(plan, [{ code: 'CRAAAAAAAAAA', state: 'applied', remainingCents: 50000, appliedAt: 2 }, { code: 'CRBBBBBBBBBB', state: 'applied', remainingCents: 50000, appliedAt: 1 },
    { code: 'CRCCCCCCCCCC', state: 'issued', remainingCents: 50000, appliedAt: 0 }, { code: 'CRDDDDDDDDDD', state: 'applied', remainingCents: 0, appliedAt: 0 }]);
  equal(d.used.map(function (u) { return u.code + ':' + u.cents + ':' + u.remainingCents; }), ['CRBBBBBBBBBB:50000:0', 'CRAAAAAAAAAA:27940:22060'], 'oldest applied first; the rest carries; an issued code is not drawn');
  equal(d.plan.subtotalCents, 0, 'never below $0'); equal(d.plan.display.subtotal, '$0');
  equal(d.plan.lines.slice(2).map(function (l) { return l.itemKey + ':' + l.kind + ':' + l.amountCents; }), ['credit:referral:-50000', 'credit:referral:-27940'], 'on the price book’s credit item');
  equal(d.plan.credits, [{ code: 'CRBBBBBBBBBB', cents: 50000 }, { code: 'CRAAAAAAAAAA', cents: 27940 }]);
  equal(d.used[1].draws, [{ date: '2026-10-20', cents: 27940 }]);
  equal(plan.lines.length, 2, 'the plan passed in is not changed'); equal(Refer.draw(plan, []).plan, plan, 'no credits, the same plan');

  /* ── QuickBooks: every credit is ONE discount line ─────────────── */
  var bookQ = book(); bookQ.qbo.items = { 'plan:field': '11', credit: '12' };
  var posted = null, qboInvoice = null;
  var deps = { Q: { ENV: 'sandbox', IS_SANDBOX: true, API_BASE: 'https://sandbox-quickbooks.api.intuit.com', load: async function () { return { env: 'sandbox', realmId: '123' }; } },
    request: async function (path, body) {
      if (path.indexOf('query?') === 0) return { QueryResponse: {} };
      if (path === 'preferences') return { Preferences: { SalesFormsPrefs: { CustomTxnNumbers: true } } };
      if (path.indexOf('item/') === 0) return { Item: { Id: path.slice(5), Active: true, Taxable: false } };
      if (path === 'invoice') {
        posted = body;
        qboInvoice = { Id: 'INV1', DocNumber: body.DocNumber, CustomerRef: body.CustomerRef, PrivateNote: body.PrivateNote, TotalAmt: 0,
          Line: body.Line.map(function (l) { return l.DetailType === 'SalesItemLineDetail' ? { DetailType: l.DetailType, Amount: l.Amount, SalesItemLineDetail: { ItemRef: l.SalesItemLineDetail.ItemRef } } : { DetailType: l.DetailType, Amount: l.Amount }; }) };
        qboInvoice.TotalAmt = Math.round(body.Line.reduce(function (n, l) { return n + (l.DetailType === 'DiscountLineDetail' ? -l.Amount : l.Amount); }, 0) * 100) / 100;
        qboInvoice.Balance = qboInvoice.TotalAmt; qboInvoice.LinkedTxn = [];
        return { Invoice: qboInvoice };
      }
      if (/^invoice\/INV1\?include/.test(path)) return { Invoice: Object.assign({}, qboInvoice, { InvoiceLink: 'https://connect.intuit.com/pay/INV1' }) };
      return {};
    } };
  var planQ = Object.assign({}, d.plan, { period: { start: '2026-10-20', end: '2026-11-20' }, marker: 'OMEGA subscription sender.example / 2026-10-20' });
  planQ.lines = [{ itemKey: 'plan:field', name: 'Field', amountCents: 129900 }, { itemKey: 'credit', name: 'Transformation credit', amountCents: -51960 }, { itemKey: 'credit', kind: 'referral', code: 'CRBBBBBBBBBB', name: 'Referral credit CR-BBBBB-BBBBB', amountCents: -50000 }];
  var issuedQ = await originalDriver(bookQ, deps).invoice(planQ, { email: 'ap@sender.example' }, 'C1');
  var discounts = posted.Line.filter(function (l) { return l.DetailType === 'DiscountLineDetail'; });
  equal(discounts.length, 1, 'QuickBooks gets one discount line');
  equal(discounts[0].Amount, 1019.6, 'the sum of the credits'); equal(discounts[0].Description, 'Transformation credit + Referral credit CR-BBBBB-BBBBB', 'naming each');
  equal(issuedQ.totalCents, 27940, 'and the invoice total is what is left');
  var okReceipt = await originalDriver(bookQ, deps).reconcile(Object.assign({}, planQ, { qboInvoiceId: 'INV1', qboCustomerId: 'C1', totalCents: 27940 }));
  equal(okReceipt.satisfied, false, 'the merged discount validates on reconcile');
  await refused(function () { return originalDriver(bookQ, deps).reconcile(Object.assign({}, planQ, { qboInvoiceId: 'INV1', qboCustomerId: 'C1', totalCents: 27940, lines: planQ.lines.slice(0, 2) })); }, /lines changed/, 'a missing credit is still caught');

  /* ── the share link ─────────────────────────────────────────────── */
  fresh(); packaged(SENDER, ['lite'], 'alacarte');
  var l1 = await Refer.link(db, SENDER, owner, now), l2 = await Refer.link(db, SENDER, owner, now);
  ok(Refer.isShare(l1.code), 'an eight-character code'); equal(l2.code, l1.code, 'made once');
  equal(l1.url, 'https://silmarillion.clearskyomega.com/start?ref=' + l1.code, 'the link starts on the open host’s signup');
  equal(paths('refer_links/').length, 1);

  /* ── who sent a new workspace ──────────────────────────────────── */
  var by = await Refer.attribution(db, l1.code.toLowerCase(), NEWCO, now);
  equal([by.referrerOrgId, by.via, by.code, by.referrerName], [SENDER, 'link', l1.code, 'Sender Example'], 'the code in the link');
  equal(await Refer.attribution(db, l1.code, SENDER, now), null, 'a workspace never refers itself');
  equal(await Refer.attribution(db, 'NOPE2345', NEWCO, now), null, 'an unknown code credits nobody');
  doc('refer_links/' + SENDER).active = false; equal(await Refer.attribution(db, l1.code, NEWCO, now), null, 'a paused link credits nobody'); doc('refer_links/' + SENDER).active = true;
  doc('omega_orgs/' + SENDER).status = 'cancelled'; equal(await Refer.attribution(db, l1.code, NEWCO, now), null, 'nor does a cancelled referrer'); doc('omega_orgs/' + SENDER).status = 'active';
  db.seed('omega_orgs/other.example', { name: 'Other', status: 'active' });
  db.seed('refer_invites/other.example__' + NEWCO, { orgId: 'other.example', domain: NEWCO, email: 'a@' + NEWCO, at: now - 10 * DAY, lastAt: now - 10 * DAY });
  db.seed('refer_invites/' + SENDER + '__' + NEWCO, { orgId: SENDER, domain: NEWCO, email: 'b@' + NEWCO, at: now - 5 * DAY, lastAt: now - 5 * DAY });
  equal((await Refer.attribution(db, '', NEWCO, now)).referrerOrgId, 'other.example', 'no code: the earliest live invitation to the domain');
  equal((await Refer.attribution(db, l1.code, NEWCO, now)).referrerOrgId, SENDER, 'a code beats an invitation');
  doc('refer_invites/other.example__' + NEWCO).lastAt = now - 91 * DAY;
  equal((await Refer.attribution(db, '', NEWCO, now)).referrerOrgId, SENDER, 'an invitation lapses after 90 days');

  /* ── signup writes it with the workspace, once (both paths) ────── */
  process.env.PACKAGING_SIGNUP_ENABLED = 'true';
  var signup = require('../api/tenant-signup');
  var newOwner = { uid: 'new-owner', email: 'nina@' + NEWCO, staff: false, claims: { email_verified: true, name: 'Nina New' } };
  var admin = require('../api/_lib/admin'); admin.authenticate = function () { return Promise.resolve(newOwner); };
  var body = { companyName: 'Newco', vertical: 'developer', billingProfile: Object.assign({}, profile, { legalName: 'Newco', email: newOwner.email }), modules: ['lite'], referralCode: l1.code };
  mails = []; var created = await signup({ method: 'POST', headers: {}, body: body });
  equal([created.created, created.referredBy], [true, 'Sender Example'], 'the page is told who referred it');
  var rec = doc('refer_signups/' + NEWCO);
  equal([rec.referrerOrgId, rec.referredOrgId, rec.referredName, rec.state, rec.via, rec.code], [SENDER, NEWCO, 'Newco', 'signed_up', 'link', l1.code]);
  ok(mails.some(function (m) { return m.name === 'referAlert' && /referred Newco/.test(m.o.text); }), 'ClearSky hears about a referred signup');
  var before = JSON.stringify(Array.from(db.data.entries())); await signup({ method: 'POST', headers: {}, body: Object.assign({}, body, { referralCode: 'ZZZZZZZZ' }) });
  equal(JSON.stringify(Array.from(db.data.entries())), before, 'a second visit changes nothing');
  delete process.env.PACKAGING_SIGNUP_ENABLED; delete require.cache[require.resolve('../api/tenant-signup')];
  var legacySignup = require('../api/tenant-signup'); newOwner = { uid: 'legacy-owner', email: 'lee@legacyco.example', staff: false, claims: { email_verified: true, name: 'Lee' } };
  var legacy = await legacySignup({ method: 'POST', headers: {}, body: { companyName: 'Legacy Co', vertical: 'installer', referralCode: l1.code } });
  equal([legacy.referredBy, doc('refer_signups/legacyco.example').referrerOrgId, doc('refer_signups/legacyco.example').state], ['Sender Example', SENDER, 'signed_up'], 'the legacy signup records it in the same batch');
  newOwner = { uid: 'plain-owner', email: 'pat@plain.example', staff: false, claims: { email_verified: true } };
  var plain = await legacySignup({ method: 'POST', headers: {}, body: { companyName: 'Plain Co', vertical: 'installer' } });
  equal([plain.created, plain.referredBy, db.data.has('refer_signups/plain.example')], [true, null, false], 'no code, no invitation: nobody is credited');
  admin.authenticate = async function (req) { return req.caller; };

  /* ── the reward: the referred workspace's first payment ─────────── */
  fresh(); packaged(SENDER, ['lite'], 'alacarte');
  packaged(NEWCO, ['lite'], 'alacarte', { packagingState: 'awaiting_payment', paidThrough: null });
  db.seed('omega_orgs/' + NEWCO + '/billing/current/invoices/2026-09-20', { date: '2026-09-20', period: { start: '2026-09-20', end: '2026-10-20' }, modules: ['lite'], plan: 'alacarte', lines: [], subtotalCents: 50000, totalCents: 50000,
    state: 'unpaid', qboInvoiceId: 'I-new', qboCustomerId: 'C1', marker: 'OMEGA subscription newco.example / 2026-09-20', pricebookVersion: B.VERSION });
  db.seed('refer_signups/' + NEWCO, Refer.signupRecord({ referrerOrgId: SENDER, referrerName: 'Sender Example', code: 'K7P3QX9D', via: 'link' }, NEWCO, 'Newco', 'nina@newco.example', now - DAY));
  var paid = false;
  Q.driver = function () { return { reconcile: async function (r) { return paid ? { satisfied: true, reversed: false, paidCents: r.totalCents, payUrl: null } : { satisfied: false, reversed: false, paidCents: 0, payUrl: 'https://connect.intuit.com/pay/x' }; } }; };
  mails = []; await S.reconcile(db, NEWCO, now, {});
  equal(paths('refer_credits/').length, 0, 'signed up and not paid: nothing yet');
  paid = true; await S.reconcile(db, NEWCO, now, {});
  var codes = paths('refer_credits/'); equal(codes.length, 1, 'paid: one code');
  var earned = doc(codes[0]);
  equal([earned.orgId, earned.amountCents, earned.remainingCents, earned.state, earned.referredOrgId, earned.source], [SENDER, 50000, 50000, 'issued', NEWCO, 'quickbooks'], 'issued to the workspace that sent it');
  equal(earned.expiresAt - earned.issuedAt, 365 * DAY, 'good for a year'); ok(Refer.isCredit(earned.code));
  equal([doc('refer_signups/' + NEWCO).state, doc('refer_signups/' + NEWCO).creditCode], ['rewarded', earned.code]);
  ok(/earned a \$500 credit: code CR-/.test(doc('omega_orgs/' + SENDER + '/notifications/refer-earned-' + NEWCO).text), 'the workspace is told in its inbox');
  ok(doc('omega_orgs/clearsky-usa.com/notifications/refer-earned-' + NEWCO), 'and ClearSky in its own'); ok(doc('omega_orgs/' + SENDER + '/admin_audit/refer-earned-' + NEWCO), 'audited');
  var earnedMail = mails.filter(function (m) { return m.name === 'referEarned'; });
  equal(earnedMail.map(function (m) { return m.o.email; }), ['owner@' + SENDER], 'the owners are mailed the code');
  equal([earnedMail[0].o.code, earnedMail[0].o.display, earnedMail[0].o.url], [Refer.pretty(earned.code), '$500', 'https://silmarillion.clearskyomega.com/workspace#refer']);
  await S.reconcile(db, NEWCO, now, {}); equal(paths('refer_credits/').length, 1, 'a second look issues nothing more');
  equal(await Refer.onPaid(db, 'plain.example', now, 'stripe'), null, 'a workspace nobody referred: nothing');

  /* ── applying the code: packaged, onto the next QuickBooks invoice ─ */
  var code = earned.code;
  await status(function () { return call('POST', { action: 'apply', code: code }, member); }, 403);
  await status(function () { return call('POST', { action: 'apply', code: code }, Object.assign({}, owner, { claims: { email_verified: false } })); }, 403);
  await status(function () { return call('POST', { action: 'apply', code: 'hello' }); }, 400);
  var outsider = { staff: false, uid: 'o2', email: 'owner@' + NEWCO, orgId: NEWCO, role: 'owner', claims: { email_verified: true } };
  await refused(function () { return call('POST', { action: 'apply', code: code }, outsider); }, /not one of this workspace/, 'another workspace cannot use it');
  await status(function () { return call('POST', { action: 'apply', code: 'CR2222222222' }); }, 404);
  var applied = await call('POST', { action: 'apply', code: Refer.pretty(code).toLowerCase() });
  equal([applied.route, applied.already], ['invoice', false]); ok(/comes off your next invoice/.test(applied.text), applied.text);
  equal([doc('refer_credits/' + code).state, doc('refer_credits/' + code).remainingCents, doc('refer_credits/' + code).appliedBy], ['applied', 50000, owner.email]);
  ok(doc('omega_orgs/' + SENDER + '/billing/current/history/refer-' + code) && doc('omega_orgs/' + SENDER + '/admin_audit/refer-apply-' + code), 'billing history and audit');
  equal((await call('POST', { action: 'apply', code: code })).already, true, 'applying twice is harmless');
  credit('CR3333333333', SENDER); db.seed('refer_credits/CR3333333333', Object.assign(doc('refer_credits/CR3333333333'), { state: 'applied', route: 'invoice', appliedAt: now + 1 }));
  /* the next invoice: Lite at $500, two $500 credits → this one is covered, the next takes the other */
  var issuedPlans = [];
  Q.driver = function () { return { invoice: async function (p) { issuedPlans.push(p); return { id: 'I-' + p.date, totalCents: p.subtotalCents, payUrl: p.subtotalCents ? 'https://connect.intuit.com/pay/' + p.date : null }; } }; };
  var at1 = Date.parse('2026-10-20T12:00:00Z');
  await S.issue(db, SENDER, at1, {});
  var inv1 = doc('omega_orgs/' + SENDER + '/billing/current/invoices/2026-10-20');
  equal(issuedPlans[0].lines.map(function (l) { return l.itemKey + ':' + l.amountCents; }), ['module:lite:50000', 'credit:-50000'], 'the invoice carries the credit');
  equal([inv1.totalCents, inv1.credits], [0, [{ code: code, cents: 50000 }]], 'the credit covered it');
  equal([doc('refer_credits/' + code).state, doc('refer_credits/' + code).remainingCents, doc('refer_credits/' + code).draws], ['used', 0, [{ date: '2026-10-20', cents: 50000 }]]);
  equal([doc('refer_credits/CR3333333333').state, doc('refer_credits/CR3333333333').remainingCents], ['applied', 50000], 'the second waits for the next invoice');
  var note1 = doc('omega_orgs/' + SENDER + '/notifications/package-invoice-2026-10-20');
  equal([note1.covered, note1.text], [true, 'Your referral credit covered this invoice ($500 off). Nothing to pay.']);
  await S.issue(db, SENDER, Date.parse('2026-11-20T12:00:00Z'), {});
  equal(doc('omega_orgs/' + SENDER + '/billing/current/invoices/2026-11-20').credits, [{ code: 'CR3333333333', cents: 50000 }], 'the carried credit is drawn next');
  equal(doc('refer_credits/CR3333333333').state, 'used');
  await S.issue(db, SENDER, Date.parse('2026-12-20T12:00:00Z'), {});
  var inv3 = doc('omega_orgs/' + SENDER + '/billing/current/invoices/2026-12-20');
  equal([inv3.totalCents, inv3.credits], [50000, undefined], 'no credit left: a normal invoice');
  equal(doc('omega_orgs/' + SENDER + '/notifications/package-invoice-2026-12-20').text, 'Your subscription invoice is ready: $500. Pay in QuickBooks to continue.');
  /* a bigger invoice keeps what the credit does not cover */
  fresh(); var ev = M.starters().ev; packaged(SENDER, ev, 'field'); credit('CR4444444444', SENDER, { state: 'applied', route: 'invoice', appliedAt: now });
  issuedPlans = []; await S.issue(db, SENDER, at1, {});
  var inv4 = doc('omega_orgs/' + SENDER + '/billing/current/invoices/2026-10-20');
  equal([inv4.subtotalCents, inv4.totalCents], [79900, 79900], 'Field at $1,299 less $500');
  equal(doc('omega_orgs/' + SENDER + '/notifications/package-invoice-2026-10-20').text, 'Your subscription invoice is ready: $799, after $500 of referral credit. Pay in QuickBooks to continue.');
  /* a retried invoice keeps its first draw and never draws twice */
  fresh(); packaged(SENDER, ['lite'], 'alacarte'); credit('CR5555555555', SENDER, { state: 'applied', route: 'invoice', appliedAt: now });
  Q.driver = function () { return { invoice: async function () { var e = new Error('QuickBooks request failed (503)'); e.status = 503; throw e; } }; };
  await refused(function () { return S.issue(db, SENDER, at1, {}); }, /503/);
  equal([doc('refer_credits/CR5555555555').remainingCents, doc('omega_orgs/' + SENDER + '/billing/current/invoices/2026-10-20').state], [0, 'prepared'], 'drawn with the prepared invoice');
  Q.driver = function () { return { invoice: async function (p) { issuedPlans.push(p); return { id: 'I-x', totalCents: p.subtotalCents, payUrl: null }; } }; };
  issuedPlans = []; await S.issue(db, SENDER, at1 + 60000, {});
  equal(issuedPlans[0].credits, [{ code: 'CR5555555555', cents: 50000 }], 'the retry issues the same draw'); equal(doc('refer_credits/CR5555555555').draws.length, 1, 'once');

  /* ── applying on a plan billed outside the engine ────────────────── */
  fresh(); db.seed('omega_orgs/stripe.example', { name: 'Stripe Co', status: 'active' }); db.seed('omega_orgs/stripe.example/billing/current', { tier: 'standard', stripeCustomerId: 'cus_1', paymentProvider: 'stripe' });
  credit('CR6666666666', 'stripe.example');
  var stripeCalls = [], stripe = { customers: { createBalanceTransaction: async function (cus, params, opts) { stripeCalls.push([cus, params, opts]); return { id: 'cbtxn_1' }; } } };
  var sOwner = Object.assign({}, owner, { email: 'o@stripe.example', orgId: 'stripe.example' });
  var st = await Refer.apply(db, 'stripe.example', 'CR-66666-66666', sOwner, now, { stripe: stripe, mail: MAIL });
  equal([st.route, stripeCalls.length], ['stripe', 1]); equal([stripeCalls[0][0], stripeCalls[0][1].amount, stripeCalls[0][1].currency, stripeCalls[0][2].idempotencyKey], ['cus_1', -50000, 'usd', 'omega-referral-credit-CR6666666666'], 'a Stripe customer credit, once per code');
  equal([doc('refer_credits/CR6666666666').state, doc('refer_credits/CR6666666666').remainingCents, doc('refer_credits/CR6666666666').stripeBalanceTxn], ['applied', 0, 'cbtxn_1'], 'Stripe holds it now');
  credit('CR7777777777', 'stripe.example'); mails = [];
  var down = await Refer.apply(db, 'stripe.example', 'CR7777777777', sOwner, now, { stripe: { customers: { createBalanceTransaction: async function () { throw new Error('No such customer'); } } }, mail: MAIL });
  equal([down.route, doc('refer_credits/CR7777777777').remainingCents, doc('refer_credits/CR7777777777').stripeError], ['manual', 50000, 'No such customer'], 'Stripe refusing: ClearSky takes it off by hand');
  ok(doc('omega_orgs/clearsky-usa.com/notifications/refer-apply-CR7777777777') && mails.some(function (m) { return m.name === 'referAlert' && /Stripe refused/.test(m.o.text); }), 'and is told');
  db.seed('omega_orgs/manual.example', { name: 'Manual Co', status: 'active' }); db.seed('omega_orgs/manual.example/billing/current', { tier: 'enterprise', paymentProvider: 'manual' });
  credit('CR8888888888', 'manual.example'); mails = [];
  var mOwner = Object.assign({}, owner, { email: 'o@manual.example', orgId: 'manual.example' });
  var man = await Refer.apply(db, 'manual.example', 'CR8888888888', mOwner, now, { mail: MAIL });
  equal(man.route, 'manual'); ok(/ClearSky takes it off your next invoice/.test(man.text));
  ok(/Take \$500 off/.test(doc('omega_orgs/clearsky-usa.com/notifications/refer-apply-CR8888888888').text) && mails.some(function (m) { return m.name === 'referAlert'; }), 'ClearSky is told to take it off');
  db.seed('omega_orgs/nobill.example', { name: 'No Bill', status: 'active' }); credit('CR9999999999', 'nobill.example');
  var nb = await Refer.apply(db, 'nobill.example', 'CR9999999999', Object.assign({}, owner, { orgId: 'nobill.example' }), now, { mail: MAIL });
  equal([nb.route, doc('refer_credits/CR9999999999').state], ['manual', 'applied'], 'a workspace ClearSky bills entirely by hand: the credit goes to ClearSky');
  equal(db.data.has('omega_orgs/nobill.example/billing/current'), false, 'and no billing record is ever made out of a code');
  credit('CRAAAAAAAAA2', 'manual.example', { expiresAt: now - 1 });
  await refused(function () { return Refer.apply(db, 'manual.example', 'CRAAAAAAAAA2', mOwner, now, {}); }, /expired/);
  doc('omega_orgs/manual.example').status = 'suspended'; credit('CRAAAAAAAAA3', 'manual.example');
  await refused(function () { return Refer.apply(db, 'manual.example', 'CRAAAAAAAAA3', mOwner, now, {}); }, /not active/); doc('omega_orgs/manual.example').status = 'active';

  /* ── ClearSky's controls ────────────────────────────────────────── */
  await status(function () { return call('POST', { action: 'settle', code: 'CR8888888888', note: 'Invoice 1042' }); }, 403);
  await refused(function () { return call('POST', { action: 'settle', code: 'CR8888888888', note: 'x' }, staff); }, /which invoice/);
  var settled = await call('POST', { action: 'settle', code: 'CR8888888888', note: 'Taken off invoice 1042' }, staff);
  equal([settled.state, doc('refer_credits/CR8888888888').remainingCents, doc('refer_credits/CR8888888888').settledBy], ['used', 0, staff.email]);
  await refused(function () { return call('POST', { action: 'settle', code: 'CR8888888888', note: 'Taken off invoice 1042' }, staff); }, /Only an applied credit/);
  await refused(function () { return call('POST', { action: 'void', code: 'CR6666666666', reason: 'Mistake here' }, staff); }, /Stripe balance/, 'a Stripe credit is reversed in Stripe');
  await refused(function () { return call('POST', { action: 'void', code: 'CR8888888888', reason: 'Mistake here' }, staff); }, /already taken off/);
  var voided = await call('POST', { action: 'void', code: 'CRAAAAAAAAA3', reason: 'Refunded first payment' }, staff);
  equal([voided.state, doc('refer_credits/CRAAAAAAAAA3').state], ['void', 'void']);
  await refused(function () { return Refer.apply(db, 'manual.example', 'CRAAAAAAAAA3', mOwner, now, {}); }, /withdrawn/);
  /* a referral made outside the link, recorded, then paid by hand */
  db.seed('omega_orgs/sender.example', { name: 'Sender Example', status: 'active' }); db.seed('omega_orgs/sender.example/members/owner', { email: 'owner@' + SENDER, role: 'owner', status: 'active' });
  await status(function () { return call('POST', { action: 'attribute', orgId: 'manual.example', referrerOrgId: SENDER }); }, 403);
  var att = await call('POST', { action: 'attribute', orgId: 'manual.example', referrerOrgId: SENDER }, staff);
  equal([att.state, doc('refer_signups/manual.example').via, doc('refer_signups/manual.example').recordedBy], ['signed_up', 'staff', staff.email]);
  await refused(function () { return call('POST', { action: 'attribute', orgId: 'manual.example', referrerOrgId: 'other.example' }, staff); }, /already recorded/);
  await refused(function () { return call('POST', { action: 'attribute', orgId: 'manual.example', referrerOrgId: 'manual.example' }, staff); }, /Name the workspace/);
  mails = []; var q = await call('POST', { action: 'qualify', orgId: 'manual.example' }, staff);
  ok(Refer.isCredit(Refer.normalize(q.pretty)) && q.referrerOrgId === SENDER, 'qualified by hand'); equal(doc('refer_credits/' + Refer.normalize(q.pretty)).source, 'staff:' + staff.email);
  ok(mails.some(function (m) { return m.name === 'referEarned' && m.o.email === 'owner@' + SENDER; }), 'the referrer is mailed');
  await refused(function () { return call('POST', { action: 'qualify', orgId: 'manual.example' }, staff); }, /No open referral/, 'once');
  db.seed('omega_orgs/twin.example', { name: 'Twin', status: 'active' });
  await call('POST', { action: 'attribute', orgId: 'twin.example', referrerOrgId: SENDER }, staff);
  await refused(function () { return call('POST', { action: 'decline', orgId: 'twin.example', reason: 'no' }, staff); }, /Say why/);
  equal((await call('POST', { action: 'decline', orgId: 'twin.example', reason: 'Same company as the referrer' }, staff)).state, 'declined');
  await refused(function () { return call('POST', { action: 'qualify', orgId: 'twin.example' }, staff); }, /No open referral/, 'a declined referral earns nothing');

  /* ── invitations ────────────────────────────────────────────────── */
  fresh(); packaged(SENDER, ['lite'], 'alacarte'); mails = [];
  await refused(function () { return call('POST', { action: 'invite', email: 'pat@gmail.com' }); }, /work address/);
  await refused(function () { return call('POST', { action: 'invite', email: 'mo2@' + SENDER }); }, /colleague/);
  await refused(function () { return call('POST', { action: 'invite', email: 'not-an-email' }); }, /work email/);
  await status(function () { return call('POST', { action: 'invite', email: 'pat@target.example', bcc: 'x' }); }, 400);
  var sentInvite = await Refer.invite(db, SENDER, { email: 'Pat@Target.example', name: 'Pat', company: 'Target Inc', note: 'You should see this' }, owner, now, { mail: MAIL });
  equal([sentInvite.sent, sentInvite.email], [true, 'pat@target.example']);
  var inv = doc('refer_invites/' + SENDER + '__target.example');
  equal([inv.orgId, inv.domain, inv.email, inv.by, inv.count], [SENDER, 'target.example', 'pat@target.example', owner.email, 1]);
  var im = mails.filter(function (m) { return m.name === 'referInvite'; })[0];
  equal([im.o.email, im.o.inviterName, im.o.inviterEmail, im.o.workspace, im.o.company], ['pat@target.example', 'Olive Owner', owner.email, 'Sender Example', 'Target Inc']);
  equal(im.o.url, 'https://silmarillion.clearskyomega.com/start?ref=' + doc('refer_links/' + SENDER).code, 'the invitation carries the link');
  await Refer.invite(db, SENDER, { email: 'pat@target.example' }, owner, now + 1000, { mail: MAIL });
  equal([doc('refer_invites/' + SENDER + '__target.example').count, doc('refer_invites/' + SENDER + '__target.example').at], [2, now], 'a reminder keeps the first date');
  doc('refer_links/' + SENDER).invites = { day: '2026-09-27', count: 20 };
  await status(function () { return Refer.invite(db, SENDER, { email: 'x@another.example' }, owner, now, { mail: MAIL }); }, 429);
  doc('omega_orgs/' + SENDER).status = 'pending';
  await refused(function () { return Refer.invite(db, SENDER, { email: 'x@another.example' }, owner, now + DAY, { mail: MAIL }); }, /once it is active/);
  await refused(function () { return call('POST', { action: 'link' }); }, /once it is active/);
  doc('omega_orgs/' + SENDER).status = 'active';

  /* ── what the page reads ────────────────────────────────────────── */
  credit('CRBBBBBBBBB2', SENDER); credit('CRBBBBBBBBB3', SENDER, { state: 'applied', route: 'invoice', remainingCents: 20000, appliedAt: now });
  db.seed('refer_signups/target.example', Refer.signupRecord({ referrerOrgId: SENDER, referrerName: 'Sender Example', via: 'invite', invitedBy: owner.email }, 'target.example', 'Target Inc', 'pat@target.example', now));
  var sum = await call('GET', {}, member);
  equal([sum.canRefer, sum.link.code, sum.reward.display, sum.waiting.count, sum.waiting.display, sum.onBill.display], [true, doc('refer_links/' + SENDER).code, '$500', 1, '$500', '$200']);
  equal(sum.referrals, [{ name: 'Target Inc', state: 'signed_up', via: 'invite', signedUpOn: '2026-09-27', rewardedOn: null }], 'a member sees whom the workspace referred, not their people');
  equal(sum.invites.map(function (i) { return i.email + ':' + i.joined; }), ['pat@target.example:true'], 'and which invitations joined');
  equal(sum.referredBy, undefined, 'the console’s fields are not in a member’s view');
  ok(!('referredOrgId' in sum.credits[0]), 'nor the referred domain');
  await status(function () { return call('GET', { orgId: 'other.example' }, member); }, 403);
  await status(function () { return call('GET', {}, Object.assign({}, member, { claims: { email_verified: false } })); }, 403);
  var staffView = await call('GET', { orgId: SENDER }, staff);
  equal(staffView.referrals[0].referredOrgId, 'target.example'); equal(staffView.referredBy, null);
  doc('omega_orgs/' + SENDER).status = 'pending';
  var pend = await call('GET', {}, member); equal([pend.canRefer, pend.reason], [false, 'Your workspace can refer companies once it is approved.']);

  Date.now = realNow;
  console.log('Refer & earn: ' + count + ' passed; QuickBooks, Stripe and mail stood in for, no network.');
}
run().catch(function (e) { console.error(e); process.exitCode = 1; }).finally(function () { Q.driver = originalDriver; delete process.env.PACKAGING_BILLING_ENABLED; delete process.env.QBO_ENV; delete process.env.PACKAGING_SIGNUP_ENABLED; });
