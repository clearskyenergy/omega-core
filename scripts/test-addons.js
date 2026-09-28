/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Add to plan on a workspace billed OUTSIDE the package engine
 * (api/_lib/addons.js): the quote, the QuickBooks invoice paid by card, the
 * switch-on when QuickBooks shows it paid, the monthly renewal, the lapse,
 * only what the plan can switch on exactly (the recorded request instead),
 * the grants written on the legacy record and taken back, Omega Logic by
 * department, the endpoint's gates, the runner. Firestore double, QuickBooks
 * mocked; no network. Every write is checked for an undefined value, which
 * the Admin SDK refuses and the double would silently drop.
 */
'use strict';
var assert = require('assert'), fs = require('fs'), path = require('path'), crypto = require('crypto'), vm = require('vm');
var F = require('./_lib/firestore-double');
var B = require('../api/_lib/pricebook'), M = require('../api/_lib/modules'), Q = require('../api/_lib/qbo-billing'), R = require('../api/_lib/proration');
var db, count = 0;
var ORG = 'legacy.example', ROOT = 'omega_orgs/' + ORG, CUR = ROOT + '/billing/current';
var owner = { staff: false, uid: 'owner', email: 'owner@' + ORG, orgId: ORG, role: 'owner', claims: { email_verified: true } };
var member = Object.assign({}, owner, { uid: 'm1', email: 'm1@' + ORG, role: 'member' });
var staff = { staff: true, uid: 'staff', email: 'tom@clearsky-usa.com', orgId: 'clearsky-usa.com', claims: { email_verified: true } };
var PROFILE = { legalName: 'Legacy Example LLC', contactName: 'Pat Legacy', email: 'ap@legacy.example', phone: '555-0100',
  address: { line1: '1 Example', city: 'Chicago', state: 'IL', postalCode: '60601', country: 'US' }, vertical: 'developer', teamSize: 12 };

/* ── the Admin SDK refuses undefined anywhere in a write: so does this ── */
function defined(v, at) {
  if (v === undefined) throw new Error('undefined written at ' + at);
  if (v && typeof v === 'object') Object.keys(v).forEach(function (k) { defined(v[k], at + '.' + k); });
}
var runOne = F.DB.prototype.runOne;
F.DB.prototype.runOne = function (fn) {
  return runOne.call(this, function (tx) {
    return fn({ get: tx.get, create: function (r, v) { defined(v, r.path); return tx.create(r, v); }, set: function (r, v, o) { defined(v, r.path); return tx.set(r, v, o); }, update: function (r, v) { defined(v, r.path); return tx.update(r, v); } });
  });
};
['set', 'update', 'create'].forEach(function (k) { var orig = F.Ref.prototype[k]; F.Ref.prototype[k] = function (v, o) { defined(v, this.path); return orig.call(this, v, o); }; });

F.mock('../api/_lib/admin', { handler: function (fn) { return fn; }, authenticate: async function (req) { return req.caller; }, db: function () { return db; },
  httpError: function (status, text) { var e = new Error(text); e.status = status; return e; }, safeOrg: function (s) { return /^[a-z0-9.-]+\.[a-z]+$/.test(s || '') ? s : ''; },
  isTenantAdmin: async function (c, o) { return c.staff || (c.orgId === o && ['owner', 'admin'].indexOf(c.role) >= 0); },
  /* admin.clientAdmin's meaning on this double (the real one: scripts/tests/tclientadmin.js) */
  clientAdmin: async function (c, o) { if (c.staff) return true; if (c.orgId !== o || ['owner', 'admin'].indexOf(c.role) < 0) return false; var s = await db.doc('omega_orgs/' + o).get(); return s.exists && s.data().status === 'active'; },
  canActInOrg: async function (c, o) { return c.staff || c.orgId === o; },
  billingOf: async function (o) { var r = await db.doc('omega_orgs/' + o + '/billing/current').get(); return r.exists ? r.data() : {}; },
  FieldValue: function () { return { serverTimestamp: function () { return Date.now(); }, arrayUnion: function () { return []; } }; } });
var AO = require('../api/_lib/addons'), S = require('../api/_lib/package-billing'), X = require('../api/_lib/logic-access');
var Runner = require('../api/_lib/package-billing-runner'), api = require('../api/plan-change');

/* QuickBooks, mocked: one customer, invoices numbered by their marker, a
   receipt per invoice the test decides */
var calls = { customer: 0, invoice: 0 }, issued = [], receipts = {};
function invoiceId(plan) { return 'I-' + crypto.createHash('sha1').update(plan.marker).digest('hex').slice(0, 10); }
Q.driver = function () {
  return { customer: async function () { calls.customer++; return 'C7'; },
    invoice: async function (plan) { calls.invoice++; issued.push(plan); var id = invoiceId(plan); return { id: id, totalCents: plan.subtotalCents, payUrl: 'https://connect.intuit.com/pay/' + id }; },
    reconcile: async function (record) { return receipts[record.qboInvoiceId] || { satisfied: false, reversed: false, paidCents: 0, payUrl: 'https://connect.intuit.com/pay/' + record.qboInvoiceId }; } };
};
function paid(record) { receipts[record.qboInvoiceId] = { satisfied: true, reversed: false, paidCents: record.totalCents, payUrl: null }; }
function reversed(record) { receipts[record.qboInvoiceId] = { satisfied: false, reversed: true, paidCents: 0, payUrl: null }; }

function equal(a, b, text) { assert.deepStrictEqual(a, b, text); count++; }
function ok(v, text) { assert(v, text); count++; }
async function refused(fn, re, status) { var e = await fn().then(function () { return null; }, function (x) { return x; }); assert(e, 'expected a refusal: ' + re); assert(re.test(e.message), e.message + ' !~ ' + re); if (status) assert.strictEqual(e.status, status, e.message); count++; }
function bill() { return db.data.get(CUR); }
function record(id) { return db.data.get(CUR + '/invoices/' + id); }
function docs(prefix) { var out = []; db.data.forEach(function (v, k) { if (k.indexOf(prefix) === 0) out.push({ path: k, data: v }); }); return out; }
function req(method, body, caller) { return api({ method: method, query: body, body: body, caller: caller || owner, headers: {} }, { setHeader: function () {} }); }
async function quote(add, caller) { return req('POST', { action: 'addon-quote', add: add, orgId: ORG }, caller); }
async function buy(add, caller) { var q = await quote(add, caller); return req('POST', { action: 'addon-buy', add: add, orgId: ORG, previewId: q.previewId, effectiveAt: q.effectiveAt }, caller); }
async function reconcile(at) { return S.reconcile(db, ORG, at); }
function seed(billing, extra) {
  db = new F.DB(); db.serial = true; receipts = {}; calls = { customer: 0, invoice: 0 }; issued = [];
  var book = B.proposed(); book.enabled = true; book.qbo.realmId = '123'; db.seed('pricebook/' + book.version, book);
  extra = extra || {};
  if (!extra.noOrg) db.seed(ROOT, Object.assign({ name: 'Legacy Example', status: 'active', packagingSandbox: true, domains: ['legacy.example'] }, extra.org || {}));
  if (billing) db.seed(CUR, billing);
  if (!extra.noProfile) db.seed(ROOT + '/billing/profile', PROFILE);
  db.seed(ROOT + '/members/owner', { role: 'owner', status: 'active' });
  db.seed(ROOT + '/members/m1', { role: 'member', status: 'active' });
}
var ENTERPRISE = { tier: 'enterprise', addons: [], toolOverrides: {}, paymentProvider: 'manual', amountDue: 0, paymentLink: 'https://legacy.example/pay-the-contract', subscriptionDue: '2027-01-01' };
function at(iso) { return Date.parse(iso); }
function untilOf(through) { return R.date(R.addDays(R.businessDays(through, 10), 1)); }

async function run() {
  process.env.PACKAGING_BILLING_ENABLED = 'true'; process.env.QBO_ENV = 'sandbox'; delete process.env.PACKAGING_LIVE;
  var realNow = Date.now, now = at('2026-09-27T15:00:00Z'); Date.now = function () { return now; };
  var N = function () { return now; };
  try {
    /* ══ 1. An Enterprise plan without Omega Logic buys Office ══ */
    seed(Object.assign({}, ENTERPRISE));
    var q = await quote(['logic-office']);
    equal(q.add, ['logic-office']); equal(q.todayCents, 150000); equal(q.fresh, true); equal(q.billingDay, 27); equal(q.canBuy, true); equal(q.needsProfile, false);
    equal(q.lines.map(function (l) { return l.itemKey + ':' + l.amountCents; }), ['module:logic-office:150000'], 'the module on its own synced item, at list');
    equal(q.cycle, { start: '2026-09-27', end: '2026-10-27', days: 30, remainingDays: 30 }, 'the first purchase starts the add-on cycle today');
    equal(q.display.amount, '$1,500');
    equal(q.display.then, 'then $1,500/month on the 27th, on its own invoice beside your plan');
    ok(/QuickBooks' secure page/.test(q.display.activation) && /saved there/.test(q.display.activation), 'the card, or the card saved there, on QuickBooks\' page');
    ok(/stay exactly as they are/.test(q.display.plan), 'the plan underneath is untouched');
    equal((await quote(['logic-plant'])).add, ['logic-office', 'logic-plant'], 'a part brings Office, which it needs');
    equal((await quote(['logic-office', 'logic-office'])).add, ['logic-office'], 'a repeated module is counted once');
    await refused(function () { return quote(['storage']); }, /Already on your plan/, 409);
    await refused(function () { return quote(['lite']); }, /Omega Design is always included/, 400);
    await refused(function () { return quote(['nonsense']); }, /Unknown module/, 400);
    await refused(function () { return quote([]); }, /Choose at least one module/, 400);

    /* ── the gates the endpoint keeps ── */
    await refused(function () { return quote(['logic-office'], member); }, /workspace administrator/, 403);
    /* an owner of an active client adds without a verified email (admin.clientAdmin: a Team
       invitation makes its account unverified); a member never, verified or not */
    var unverified = Object.assign({}, owner, { claims: { email_verified: false } });
    equal((await quote(['logic-office'], unverified)).canBuy, true, 'an unverified owner of an active client may add to the plan');
    await refused(function () { return quote(['logic-office'], Object.assign({}, member, { claims: { email_verified: false } })); }, /Verified email/, 403);
    db.data.get(ROOT).status = 'pending';
    await refused(function () { return quote(['logic-office'], unverified); }, /Verified email/, 403);
    db.data.get(ROOT).status = 'active';
    await refused(function () { return req('POST', { action: 'addon-quote', add: ['logic-office'], orgId: 'other.example' }); }, /Own organization/, 403);
    await refused(function () { return req('POST', { action: 'addon-quote', add: ['logic-office'], priceCents: 1 }); }, /Unsupported field/, 400);
    equal((await quote(['logic-office'], Object.assign({}, staff))).canBuy, true, 'verified ClearSky staff may act for a tenant');

    /* ── pay first ── */
    await refused(function () { return req('POST', { action: 'addon-buy', add: ['logic-office'], previewId: 'x'.repeat(48), effectiveAt: now }); }, /price changed/);
    await refused(function () { return req('POST', { action: 'addon-buy', add: ['logic-office'], previewId: q.previewId, effectiveAt: now - 11 * 60000 }); }, /Refresh the price/);
    equal(calls, { customer: 0, invoice: 0 }, 'nothing reaches QuickBooks before a valid purchase');
    var r1 = await req('POST', { action: 'addon-buy', add: ['logic-office'], previewId: q.previewId, effectiveAt: q.effectiveAt });
    equal(r1.state, 'awaiting_payment'); equal(r1.todayCents, 150000); equal(r1.display, '$1,500'); equal(r1.expiresOn, '2026-10-27'); equal(r1.live, []);
    ok(/^https:\/\/connect\.intuit\.com\//.test(r1.paymentLink), 'QuickBooks\' own payment page');
    equal(calls, { customer: 1, invoice: 1 }, 'one customer, one invoice');
    var buy1 = record(r1.addOnId);
    equal(buy1.kind, 'addon'); equal(buy1.purpose, 'purchase'); equal(buy1.state, 'unpaid'); equal(buy1.add, ['logic-office']); equal(buy1.fresh, true); equal(buy1.billingDay, 27);
    equal(buy1.period, { start: '2026-09-27', end: '2026-10-27' }); ok(/^OMEGA add-on legacy\.example \/ 2026-09-27 \//.test(buy1.marker), 'its own QuickBooks number');
    equal(bill().addOns.state, 'awaiting_payment'); equal(bill().addOns.live, []); equal(bill().addOns.modules, []);
    equal(bill().addOns.pending.map(function (p) { return p.add.join(); }), ['logic-office'], 'the purchase waits on the record the pages read');
    equal(bill().qboCustomerId, 'C7'); equal(bill().qboRealmId, '123');
    equal([bill().tier, bill().amountDue, bill().paymentLink, bill().subscriptionDue], ['enterprise', 0, 'https://legacy.example/pay-the-contract', '2027-01-01'], 'the plan\'s own billing fields are never touched');
    ok(db.data.has(CUR + '/history/' + r1.addOnId) && db.data.has(ROOT + '/admin_audit/' + r1.addOnId), 'history and audit rows');
    equal(db.data.get(ROOT + '/notifications/addon-invoice-' + r1.addOnId).packageMail, 'packageInvoice', 'the invoice mail is queued');
    equal(db.data.get(ROOT).packagedLive, undefined, 'the sandbox runner finds it by packagingSandbox; packagedLive is the live runner\'s');
    equal(await req('POST', { action: 'addon-buy', add: ['logic-office'], previewId: q.previewId, effectiveAt: q.effectiveAt }), r1, 'a retry returns the same result');
    equal(calls.invoice, 1, 'and issues nothing twice');
    var q2 = await quote(['logic-plant']); equal(q2.canBuy, false); ok(/waiting for payment/.test(q2.reason), 'one purchase waits at a time');
    await refused(function () { return buy(['logic-plant']); }, /waiting for payment/);

    var ctx = await X.context(ORG);
    equal([X.subscribed(ctx, now), X.parts(ctx, now)], [false, []], 'nothing is on before QuickBooks shows it paid');
    await reconcile(now); equal(record(r1.addOnId).state, 'unpaid'); equal(bill().addOns.live, []);

    /* ── QuickBooks shows it paid: Office is on ── */
    paid(buy1); now = at('2026-09-27T15:10:00Z');
    var rec = await reconcile(now);
    equal(rec.invoices.map(function (x) { return x.kind + ':' + x.state; }), ['addon:paid']);
    var a1 = bill().addOns;
    equal([a1.modules, a1.live, a1.state, a1.billingDay, a1.paidThrough, a1.nextInvoiceOn, a1.monthlyCents, a1.monthlyDisplay, a1.pending],
      [['logic-office'], ['logic-office'], 'paid', 27, '2026-10-27', '2026-10-27', 150000, '$1,500/month', []]);
    equal(a1.accessUntil, untilOf('2026-10-27'), 'on until the paid period and the book\'s grace');
    equal([bill().amountDue, bill().paymentLink, bill().lastPaidAt], [0, 'https://legacy.example/pay-the-contract', undefined], 'the plan\'s amount due, pay link and last payment stay the plan\'s');
    equal(db.data.get(ROOT + '/notifications/addon-paid-' + r1.addOnId).packageMail, 'paid', 'the tenant hears it is on');
    ok(/Logic Office is on/.test(db.data.get(ROOT + '/notifications/addon-paid-' + r1.addOnId).text), 'by name');
    equal(db.data.get('omega_orgs/clearsky-usa.com/notifications/billing-paid-' + ORG + '-' + buy1.qboInvoiceId).staffMail, 'paidAlert', 'ClearSky hears the money');
    ctx = await X.context(ORG);
    equal([X.subscribed(ctx, now), X.parts(ctx, now)], [true, []], 'Office on; no department bought yet');
    await refused(function () { return X.authorize(owner, ORG, false, 'plant'); }, /Plant is not in your Omega Logic package/, 403);
    ok(!!(await X.authorize(owner, ORG, false)), 'the office opens for its owner');
    equal(await X.requirePartIfPackaged(ORG, 'plant').then(function () { return 'open'; }, function (e) { return e.status; }), 403, 'the bench and rig doors follow the parts bought too');
    await reconcile(now); equal(docs(CUR + '/history/').length, 2, 'a look that changes nothing writes no history');

    /* ── the summary and "I've paid" read the add-ons ── */
    var sum = await req('GET', {});
    equal(sum.packaged, false); equal(sum.addOns.live, ['logic-office']); equal(sum.addOns.names, ['Logic Office']); equal(sum.addOns.monthlyDisplay, '$1,500/month');
    equal(sum.invoices.map(function (x) { return [x.kind, x.purpose, x.state, (x.names || []).join()]; }), [['addon', 'purchase', 'paid', 'Logic Office']]);
    now += 60000;
    var look = await req('POST', { action: 'reconcile-now' });
    equal([look.packaged, look.addOns.live], [false, ['logic-office']]);
    equal((await req('POST', { action: 'reconcile-now' })).throttled, true, 'one look per eight seconds');

    /* ── a department mid-cycle: prorated to the add-on billing day ── */
    now = at('2026-10-07T15:00:00Z');
    var q3 = await quote(['logic-plant']);
    equal(q3.fresh, false); equal(q3.cycle, { start: '2026-09-27', end: '2026-10-27', days: 30, remainingDays: 20 });
    equal(q3.lines.map(function (l) { return l.itemKey + ':' + l.amountCents; }), ['module:logic-plant:50000'], 'twenty of thirty days of $750');
    equal(q3.display.then, 'then $2,250/month on the 27th, on its own invoice beside your plan (add-ons were $1,500/month)');
    var r2 = await req('POST', { action: 'addon-buy', add: ['logic-plant'], previewId: q3.previewId, effectiveAt: q3.effectiveAt });
    paid(record(r2.addOnId)); now += 60000; await reconcile(now);
    equal(bill().addOns.modules, ['logic-office', 'logic-plant']); equal(bill().addOns.billingDay, 27, 'the billing day stays the first purchase\'s');
    equal(bill().addOns.monthlyCents, 225000); equal(bill().addOns.paidThrough, '2026-10-27');
    ctx = await X.context(ORG); equal(X.parts(ctx, now), ['plant'], 'Plant is on');

    /* ── the monthly renewal on the billing day ── */
    now = at('2026-10-26T12:00:00Z'); equal(await AO.issue(db, ORG, now), { skipped: true }, 'not before the billing day');
    now = at('2026-10-27T12:00:00Z');
    var ren = await AO.issue(db, ORG, now);
    equal([ren.issued, ren.date], [true, '2026-10-27']);
    var ren1 = record('addon-renewal-2026-10-27');
    equal([ren1.kind, ren1.purpose, ren1.state, ren1.modules, ren1.totalCents, ren1.period], ['addon', 'renewal', 'unpaid', ['logic-office', 'logic-plant'], 225000, { start: '2026-10-27', end: '2026-11-27' }]);
    equal(bill().addOns.state, 'past_due', 'a renewal is owed'); equal(bill().addOns.live, ['logic-office', 'logic-plant'], 'and the add-ons stay on through the grace');
    equal(bill().addOns.nextInvoiceOn, '2026-11-27');
    equal(await AO.issue(db, ORG, now), { skipped: true }, 'once');
    ok(/Autopay/.test(db.data.get(ROOT + '/notifications/addon-invoice-addon-renewal-2026-10-27').text), 'the renewal mail says Autopay charges the saved card');
    var q4 = await quote(['logic-materials']); equal(q4.canBuy, false); ok(/renewal is waiting for payment/.test(q4.reason), 'pay the renewal first');
    paid(ren1); now = at('2026-10-28T12:00:00Z'); await reconcile(now);
    equal([bill().addOns.state, bill().addOns.paidThrough, bill().addOns.accessUntil], ['paid', '2026-11-27', untilOf('2026-11-27')]);

    /* ── a renewal nobody pays: off after the grace, the plan untouched ── */
    now = at('2026-11-27T12:00:00Z'); await AO.issue(db, ORG, now);
    now = at('2026-12-11T12:00:00Z'); ctx = await X.context(ORG); equal(X.subscribed(ctx, now), true, 'still inside the grace');
    now = at('2026-12-12T00:00:01Z');
    ctx = await X.context(ORG); equal([X.subscribed(ctx, now), X.parts(ctx, now)], [false, []], 'past the grace the parts are off, even before the next look');
    await reconcile(now);
    equal([bill().addOns.state, bill().addOns.live, bill().addOns.modules], ['lapsed', [], ['logic-office', 'logic-plant']], 'off; what was bought is remembered');
    equal([bill().tier, bill().amountDue, bill().paymentLink], ['enterprise', 0, 'https://legacy.example/pay-the-contract'], 'the plan itself is never touched');
    equal(await AO.issue(db, ORG, at('2026-12-27T12:00:00Z')), { skipped: true }, 'no new renewal piles up on a lapsed one');
    paid(record('addon-renewal-2026-11-27')); now = at('2026-12-14T12:00:00Z'); await reconcile(now);
    equal([bill().addOns.state, bill().addOns.live, bill().addOns.paidThrough], ['paid', ['logic-office', 'logic-plant'], '2026-12-27'], 'paid late, it comes back on');

    /* ══ 2. Cancel, expiry and a payment after either ══ */
    now = at('2026-09-27T15:00:00Z'); seed(Object.assign({}, ENTERPRISE));
    var c1 = await buy(['logic-office']);
    await refused(function () { return req('POST', { action: 'addon-cancel', addOnId: 'addon-nope' }); }, /Invalid add-on id/, 400);
    equal((await req('POST', { action: 'addon-cancel', addOnId: c1.addOnId })).state, 'cancelled');
    equal(record(c1.addOnId).state, 'cancelled'); equal(bill().addOns.pending, []); equal(bill().addOns.state, 'none');
    await refused(function () { return req('POST', { action: 'addon-cancel', addOnId: c1.addOnId }); }, /Only a purchase waiting/);
    equal((await quote(['logic-office'])).canBuy, true, 'a cancelled purchase frees the way');
    paid(record(c1.addOnId)); now += 60000; await reconcile(now);
    equal(record(c1.addOnId).state, 'paid'); equal(record(c1.addOnId).reviewRequired, true, 'paid after a cancel: honoured, and a person looks');
    equal(bill().addOns.live, ['logic-office']);
    ok(db.data.has('omega_orgs/clearsky-usa.com/notifications/billing-review-' + ORG + '-' + record(c1.addOnId).qboInvoiceId), 'in ClearSky\'s inbox');
    seed(Object.assign({}, ENTERPRISE)); now = at('2026-09-27T15:00:00Z');
    var e1 = await buy(['logic-office']); now = at('2026-10-27T01:00:00Z'); await reconcile(now);
    equal(record(e1.addOnId).state, 'expired', 'unpaid past the period it would cover'); equal(bill().addOns.pending, []);
    equal((await quote(['logic-office'])).fresh, true, 'a new purchase starts a new cycle');

    /* ── a reversed payment takes the module back ── */
    seed(Object.assign({}, ENTERPRISE)); now = at('2026-09-27T15:00:00Z');
    var v1 = await buy(['logic-office']); paid(record(v1.addOnId)); now += 60000; await reconcile(now);
    equal(bill().addOns.live, ['logic-office']);
    reversed(record(v1.addOnId)); now += 60000; await reconcile(now);
    equal([record(v1.addOnId).state, bill().addOns.modules, bill().addOns.live], ['reversed', [], []], 'voided in QuickBooks: off');

    /* ══ 3. The fifth department completes the bundle ══ */
    seed(Object.assign({}, ENTERPRISE)); now = at('2026-09-27T15:00:00Z');
    var four = await buy(['logic-plant', 'logic-materials', 'logic-logistics']);
    equal(four.add, ['logic-office', 'logic-plant', 'logic-materials', 'logic-logistics']); equal(four.todayCents, 325000);
    paid(record(four.addOnId)); now = at('2026-10-07T15:00:00Z'); await reconcile(now);
    var q5 = await quote(['logic-customer']);
    equal([q5.included, q5.todayCents, q5.lines, q5.monthlyCents], [true, 0, [], 250000], 'the bundle costs less than four parts: nothing owed today');
    ok(/Nothing to pay today/.test(q5.display.today), q5.display.today);
    var before = calls.invoice, r5 = await req('POST', { action: 'addon-buy', add: ['logic-customer'], previewId: q5.previewId, effectiveAt: q5.effectiveAt });
    equal([r5.state, calls.invoice - before], ['active', 0], 'on at once, no invoice');
    equal(bill().addOns.modules.length, 5); equal(bill().addOns.monthlyCents, 250000);
    ctx = await X.context(ORG); equal(X.parts(ctx, now), ['plant', 'materials', 'logistics', 'customer']);
    now = at('2026-10-27T12:00:00Z'); await AO.issue(db, ORG, now);
    equal(record('addon-renewal-2026-10-27').lines.map(function (l) { return l.itemKey + ':' + l.amountCents; }), ['logic-bundle:250000'], 'the renewal bills the bundle');

    /* ══ 4. A Standard plan buys any editor module, EXACTLY ══
       (Tommy's decision, 2026-09-27: sold only where it switches on in full
       and nothing else comes on with it). A legacy editor opens Site Map a
       whole tab at a time, so a legacy key would open every module on the
       tab; the editor opens a live add-on's OWN commands instead (omega-caps,
       by the catalog's ribbon), the quote simulates exactly that on the
       pages' own rule, and the editor's Opt in is a purchase on every plan. */
    now = at('2026-09-27T15:00:00Z');
    seed({ tier: 'standard', addons: [], toolOverrides: { sitefinder: false, conductorsizing: true }, paymentProvider: 'manual' });
    ['gridatlas', 'storage', 'estimate', 'plansets', 'siteintel', 'engineering', 'finance', 'compute', 'ops'].forEach(function (k) {
      var x = AO.exact(ORG, bill(), [k], now);
      ok(x.exact && !x.partial.length && !x.spill.length, k + ' switches on exactly on Standard, nothing else with it: ' + JSON.stringify(x));
    });
    var cq = await quote(['compute']);
    equal([cq.canBuy, cq.request, cq.add], [true, false, ['compute']], 'Omega Compute is sold on Standard: Intel\'s and Engineer\'s commands on its tab stay shut');
    var wq = await quote(['whitelabel']);
    ok(!wq.canBuy && wq.request && /^Omega Storefront is set up with ClearSky, so it cannot be added here on its own\./.test(wq.reason), wq.reason);
    await refused(function () { return buy(['whitelabel']); }, /set up with ClearSky/);
    equal(issued.length, 0, 'nothing not exact is ever invoiced');
    equal(AO.exact(ORG, bill(), ['logic-office', 'logic-plant'], now).exact, true, 'an Omega Logic part is exact on every plan');
    /* the recorded request, for what is still not exact: priced, on record for ClearSky, nothing charged */
    var rq = await req('POST', { action: 'opt-in', add: ['whitelabel'], orgId: ORG });
    equal([rq.requested, bill().optIns.whitelabel.status, issued.length], [true, 'requested', 0], 'the request is recorded; nothing is invoiced');
    /* Omega Sites is its tools alone: exact, sold, its tools written and taken back */
    equal(AO.held(ORG, bill(), 'sitefinder', now), false);
    var sf = await quote(['sitefinder']); equal([sf.canBuy, sf.request], [true, false]);
    var sb = await buy(['sitefinder']); paid(record(sb.addOnId)); now += 60000; await reconcile(now);
    equal(bill().toolOverrides, { sitefinder: true, conductorsizing: true, sitediscovery: true }, 'the module\'s tools are switched on, as ClearSky did by hand');
    equal(bill().addOns.granted.toolOverrides, { sitefinder: false, sitediscovery: null }, 'what was there before is remembered; a staff grant is not ours');
    equal(bill().addons, [], 'no editor key: Omega Sites has no Site Map commands');
    equal(AO.held(ORG, bill(), 'sitefinder', now), true, 'held now, so never sold twice');
    now = at('2026-12-01T00:00:00Z'); await reconcile(now);
    equal(bill().addOns.live, []);
    equal(bill().toolOverrides, { sitefinder: false, conductorsizing: true }, 'switched off: exactly what was written is taken back');
    equal(bill().addOns.granted, { toolOverrides: {}, toolAccess: [], addons: [] });
    /* an add-on ClearSky set by hand changes what is exact: with the
       engineering key, Analyze is open, Storage is held and Operations comes
       on in full */
    seed({ tier: 'standard', addons: ['engineering'], paymentProvider: 'manual' });
    equal(AO.held(ORG, bill(), 'storage', now), true, 'the engineering key opens Analyze: Standard holds Storage');
    await refused(function () { return quote(['storage']); }, /Already on your plan/);
    equal((await quote(['ops'])).canBuy, true, 'Operations comes on in full where Analyze is open');
    /* the grants (grant() is the one writer): a module's tools, and a legacy
       key only where another reader honours it (the storefront); never an
       editor key, which would open a whole tab. A key an earlier grant wrote
       is taken back exactly, and a staff key is never ours. */
    var g1 = AO.grant({ addons: ['engineering'], toolOverrides: { conductorsizing: false } }, ['engineering', 'plansets']);
    equal(g1.addons, ['engineering'], 'no editor key is written: the editor opens the modules themselves');
    equal(g1.granted.addons, [], 'engineering was staff\'s already');
    equal(g1.granted.toolOverrides, { conductorsizing: false, powerflow: null, siteoptimizer: null });
    var g2 = AO.grant({ addons: g1.addons, toolOverrides: g1.toolOverrides, addOns: { granted: g1.granted } }, []);
    equal([g2.addons, g2.toolOverrides, g2.granted], [['engineering'], { conductorsizing: false }, { toolOverrides: {}, toolAccess: [], addons: [] }], 'switched off: exactly what was written is taken back');
    var g3 = AO.grant({ addons: ['schematics', 'exports'], addOns: { granted: { toolOverrides: {}, toolAccess: [], addons: ['schematics', 'exports'] } } }, ['plansets']);
    equal([g3.addons, g3.granted.addons], [[], []], 'a whole-tab key an earlier grant wrote is taken back: the module opens itself now');
    var g4 = AO.grant({ addons: [] }, ['whitelabel']);
    equal([g4.addons, g4.granted.addons], [['whitelabel'], ['whitelabel']], 'the storefront keeps the key its reader honours');

    /* ── Omega Storage bought on Standard: paid, on, its tools written and no
       editor key; the editor opens its own Analyze and Estimate commands,
       and Engineer, whose commands share the Analyze tab, stays for sale ── */
    now = at('2026-09-27T15:00:00Z');
    seed({ tier: 'standard', addons: [], toolOverrides: {}, paymentProvider: 'manual' });
    var stb = await buy(['storage']); equal(stb.state, 'awaiting_payment', 'an invoice, on when paid');
    paid(record(stb.addOnId)); now += 60000; await reconcile(now);
    equal(bill().addOns.live, ['storage']);
    equal(bill().addons, [], 'no legacy editor key: it would open every module on the Analyze tab');
    ok(M.get('storage').tools.every(function (t) { return bill().toolOverrides[t] === true; }), 'the module\'s tools are switched on');
    equal(AO.held(ORG, bill(), 'storage', now), true, 'held now, so never sold twice');
    equal([AO.held(ORG, bill(), 'engineering', now), AO.exact(ORG, bill(), ['engineering'], now).exact], [false, true], 'Engineer is not held, and is still sold exactly beside it');

    /* ── a product defined by an allowlist grows by what it buys ── */
    now = at('2026-09-27T15:00:00Z');
    seed({ tier: 'enterprise', addons: [], toolAccess: ['editor', 'gridatlas'], paymentProvider: 'manual' });
    equal(AO.held(ORG, bill(), 'estimate', now), false, 'an allowlist decides what the plan holds');
    var al = await buy(['estimate']); paid(record(al.addOnId)); now += 60000; await reconcile(now);
    equal(bill().toolAccess, ['editor', 'gridatlas', 'costestimator']); equal(bill().addOns.granted.toolAccess, ['costestimator']);
    now = at('2026-12-01T00:00:00Z'); await reconcile(now);
    equal(bill().toolAccess, ['editor', 'gridatlas'], 'and shrinks back when it lapses');

    /* ══ 5. What is never sold here ══ */
    now = at('2026-09-27T15:00:00Z');
    seed(Object.assign({}, ENTERPRISE, { addons: ['omega-logic'] }));
    await refused(function () { return quote(['logic-plant']); }, /Already on your plan/);
    ctx = await X.context(ORG); equal(X.parts(ctx, now), ['plant', 'materials', 'logistics', 'customer'], 'the omega-logic add-on still holds every part');
    equal(await X.requirePartIfPackaged(ORG, 'plant'), null, 'and its doors keep their own rule');
    seed({ packaged: true, packagingState: 'paid', modules: ['lite'] });
    await refused(function () { return quote(['gridatlas']); }, /subscription package: add modules on the Ladder/, 409);
    await refused(function () { return req('POST', { action: 'addon-buy', add: ['gridatlas'], orgId: ORG, previewId: 'a'.repeat(48), effectiveAt: now }); }, /subscription package/, 409);
    seed(null); var nq = await quote(['logic-office']); equal(nq.canBuy, false); ok(/no plan on record/.test(nq.reason), 'no billing record: nothing to add to');
    equal(nq.request, true, 'and Opt in falls back to the recorded request, which says billing is not set up');
    ok(!/Add to plan/.test(nq.reason), 'in the one card\'s words: ' + nq.reason);
    seed(Object.assign({}, ENTERPRISE), { noOrg: true });
    await refused(function () { return quote(['logic-office']); }, /no account record yet/, 404);
    seed(Object.assign({}, ENTERPRISE), { org: { status: 'suspended' } }); ok(/not active/.test((await quote(['logic-office'])).reason), 'a suspended workspace buys nothing');
    seed(Object.assign({}, ENTERPRISE), { noProfile: true });
    var pp = await quote(['logic-office']); equal([pp.canBuy, pp.needsProfile], [true, true], 'the billing contact comes first');
    var pe = await buy(['logic-office']).then(function () { return null; }, function (e) { return e; });
    equal([pe && pe.status, pe && pe.code, calls.customer + calls.invoice], [409, 'billing-profile', 0], 'refused before QuickBooks hears anything');
    seed(Object.assign({}, ENTERPRISE)); delete process.env.PACKAGING_BILLING_ENABLED;
    var gq = await quote(['logic-office']); equal([gq.canBuy, gq.reason, gq.detail], [false, 'Card payments are not open for this workspace yet.', undefined], 'the engine closed: said plainly, no engine words');
    ok(/disabled/.test((await quote(['logic-office'], Object.assign({}, staff))).detail), 'staff see why');
    await refused(function () { return buy(['logic-office']); }, /not open/);
    process.env.PACKAGING_BILLING_ENABLED = 'true';
    seed(Object.assign({}, ENTERPRISE), { org: { packagingSandbox: false } });
    equal((await quote(['logic-office'])).canBuy, false, 'in the sandbox only a marked sandbox tenant is billed');

    /* ══ 6. The hourly runner renews and reconciles add-ons ══ */
    now = at('2026-09-27T15:00:00Z'); seed(Object.assign({}, ENTERPRISE));
    var rn = await buy(['logic-office']); paid(record(rn.addOnId));
    db.seed('omega_orgs/other.example', { name: 'Other', status: 'active', packagingSandbox: true });
    db.seed('omega_orgs/other.example/billing/current', { tier: 'standard' });
    process.env.CRON_SECRET = 'x'; var mails = [];
    var mailer = { templates: new Proxy({}, { get: function (o, k) { return async function (payload) { mails.push(k + ':' + payload.email); return { ok: true }; }; } }) };
    now = at('2026-09-27T16:00:00Z'); var tick = await Runner.tick(db, now, { limit: 5, mail: mailer });
    var mine = tick.results.filter(function (x) { return x.orgId === ORG; })[0];
    equal([mine.addOns, mine.invoice, mine.payment.invoices.map(function (x) { return x.state; })], [true, { skipped: true }, ['paid']], 'the runner reconciles the purchase');
    ok(!tick.results.some(function (x) { return x.orgId === 'other.example'; }), 'a legacy plan without add-ons is not the runner\'s');
    equal(bill().addOns.live, ['logic-office']);
    ok(mails.indexOf('packageInvoice:ap@legacy.example') >= 0 && mails.indexOf('paid:ap@legacy.example') >= 0, 'the invoice and the receipt go to the billing contact');
    db.seed('integrations/packaging-billing', {});
    now = at('2026-10-27T13:00:00Z'); tick = await Runner.tick(db, now, { limit: 5, mail: mailer });
    equal(tick.results.filter(function (x) { return x.orgId === ORG; })[0].invoice.date, '2026-10-27', 'and issues the renewal on the billing day');

    /* ══ 6b. The rail: a legacy plan's add-ons are QuickBooks', whatever the
       package rail (billing-driver.providerOf would send a workspace with no
       QuickBooks customer to Stripe under PACKAGING_PROVIDER=stripe) ══ */
    process.env.PACKAGING_PROVIDER = 'stripe';
    try {
      now = at('2026-09-27T15:00:00Z'); seed(Object.assign({}, ENTERPRISE, { paymentProvider: 'stripe', stripeCustomerId: 'cus_legacy_plan' }));
      equal((await quote(['logic-office'])).canBuy, true, 'Stripe as the package rail does not move a legacy plan\'s add-ons: QuickBooks\' guard answers');
      var rs = await buy(['logic-office']);
      equal([record(rs.addOnId).provider, calls.invoice, !!record(rs.addOnId).qboInvoiceId], ['quickbooks', 1, true], 'invoiced in QuickBooks, and the record names its rail');
      equal([bill().stripeCustomerId, bill().paymentProvider], ['cus_legacy_plan', 'stripe'], 'the plan\'s own Stripe customer and payment provider are never touched');
      paid(record(rs.addOnId)); now += 60000; await reconcile(now);
      equal(bill().addOns.live, ['logic-office'], 'reconciled from QuickBooks, the rail it was issued on');
    } finally { delete process.env.PACKAGING_PROVIDER; }

    /* ══ 6c. Opt out of an add-on on by card (addon-cancel with `remove`):
       it stays on until the end of the month paid for and is not renewed;
       Cancel request (withdraw-addon-cancel) keeps it. Stopping a part
       stops what needs it; the renewal is priced without it and it goes
       off that day ══ */
    now = at('2026-09-27T15:00:00Z'); seed(Object.assign({}, ENTERPRISE));
    var st1 = await buy(['logic-plant']); equal(st1.add, ['logic-office', 'logic-plant']); paid(record(st1.addOnId)); now += 60000; await reconcile(now);
    equal(bill().addOns.live, ['logic-office', 'logic-plant']);
    var st0 = JSON.stringify(bill()), sd = await req('POST', { action: 'addon-cancel', remove: ['logic-office'], dryRun: true, orgId: ORG });
    equal(JSON.stringify(bill()), st0, 'the dry run writes nothing');
    equal([sd.dryRun, sd.remove, sd.endsOn], [true, ['logic-office', 'logic-plant'], bill().addOns.nextInvoiceOn], 'stopping Office stops Plant, which needs it, on the renewal day');
    ok(/stay on until \d{4}-\d{2}-\d{2}, the end of the month you paid for, and are not renewed\. /.test(sd.note) && /No refund for time already paid\./.test(sd.note), sd.note);
    await refused(function () { return req('POST', { action: 'addon-cancel', remove: ['logic-office'], addOnId: 'x', orgId: ORG }); }, /not both/);
    await refused(function () { return req('POST', { action: 'addon-cancel', remove: ['storage'], orgId: ORG }); }, /not an add-on on your plan/);
    await refused(function () { return req('POST', { action: 'addon-cancel', remove: ['logic-plant'], orgId: ORG }, member); }, /administrator/);
    await refused(function () { return req('POST', { action: 'withdraw-addon-cancel', remove: ['logic-plant'], orgId: ORG }); }, /No request to withdraw/);
    var st2 = await req('POST', { action: 'addon-cancel', remove: ['logic-plant'], orgId: ORG });
    equal([st2.ok, st2.remove, bill().addOns.ending['logic-plant'].status], [true, ['logic-plant'], 'requested'], 'Opt out records the stop on the add-on');
    equal(bill().addOns.live, ['logic-office', 'logic-plant'], 'and it stays on until then');
    ok(!bill().optOuts, 'never the recorded opt-out to ClearSky');
    var sv = (await req('GET', { orgId: ORG }, member)).addOns;
    equal([sv.ending.map(function (e) { return e.key; }), sv.payWith], [['logic-plant'], 'QuickBooks'], 'the summary names what is ending, and its rail');
    await refused(function () { return req('POST', { action: 'addon-cancel', remove: ['logic-plant'], orgId: ORG }); }, /Already requested/);
    var sw = await req('POST', { action: 'withdraw-addon-cancel', remove: ['logic-plant'], orgId: ORG });
    equal([sw.withdrawn, sw.remove, bill().addOns.ending['logic-plant'].status], [true, ['logic-plant'], 'withdrawn'], 'Cancel request keeps it');
    await req('POST', { action: 'addon-cancel', remove: ['logic-plant'], orgId: ORG });
    now = at('2026-10-27T12:00:00Z'); await AO.issue(db, ORG, now);
    equal(record('addon-renewal-2026-10-27').modules, ['logic-office'], 'the renewal is priced without what stopped');
    equal([bill().addOns.modules, bill().addOns.live, bill().addOns.ending['logic-plant'].status], [['logic-office'], ['logic-office'], 'done'], 'and it goes off on the renewal day');
    await refused(function () { return req('POST', { action: 'addon-cancel', remove: ['logic-office'], orgId: ORG }); }, /waiting for payment/);
    paid(record('addon-renewal-2026-10-27')); now += 60000; await reconcile(now);
    await req('POST', { action: 'addon-cancel', remove: ['logic-office'], orgId: ORG });
    now = at('2026-11-27T12:00:00Z'); await AO.issue(db, ORG, now);
    equal([bill().addOns.modules, bill().addOns.live, !!db.data.get(CUR + '/invoices/addon-renewal-2026-11-27')], [[], [], false], 'everything stopped: no renewal, nothing on');
    seed({ packaged: true, packagingState: 'paid', modules: ['lite'] });
    await refused(function () { return req('POST', { action: 'addon-cancel', remove: ['logic-office'], orgId: ORG }); }, /subscription package/);

    /* ══ 7. Pins: one rule, one map ══ */
    var tenantSrc = fs.readFileSync(path.join(__dirname, '..', 'omega-tenant.js'), 'utf8');
    equal(AO.TIER_LEVEL, JSON.parse(JSON.stringify(vm.runInNewContext('(' + /var TIER_LEVEL = (\{[^}]*\})/.exec(tenantSrc)[1] + ')'))), 'the tier levels are omega-tenant.js\'s');
    var caps = {}; vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'omega-caps.js'), 'utf8'), caps);
    var GRANTS = caps.OmegaCaps.ADDON_GRANTS, editor = fs.readFileSync(path.join(__dirname, '..', 'editor.html'), 'utf8'), gated = {};
    (editor.match(/data-cap="[a-z.]+"/g) || []).forEach(function (m) { gated[m.slice(10, -1)] = true; });
    ['schematic', 'riser', 'engineering', 'parcelscreen', 'export', 'compute', 'permitting'].forEach(function (k) { gated[k] = true; });
    Object.keys(AO.LEGACY).forEach(function (k) {
      ok(!!M.get(k) && M.get(k).shelf !== 'platform', k + ' is a sold module of tools or capabilities');
      /* 'whitelabel' opens the embed storefront (api/_lib/embed.js), not an editor capability */
      AO.LEGACY[k].forEach(function (x) { ok(x === 'whitelabel' && !(GRANTS[x] || []).length, x + ' is a key another reader honours, never one that opens the editor'); });
    });
    /* what the legacy editor gates of a module, the module itself opens (omega-caps
       addOnOpens): its commands by the catalog's ribbon, a side section by its caps */
    M.catalog().forEach(function (m) {
      if (m.key === 'lite' || m.shelf === 'platform') return;
      ok((AO.LEGACY[m.key] || []).every(function (x) { return !(GRANTS[x] || []).length; }), m.key + ': buying it writes no key that opens a whole Site Map tab');
      m.caps.filter(function (cap) { return gated[cap] || gated[cap.split('.')[0]]; }).forEach(function (cap) {
        ok(m.ribbon.length > 0 || cap === m.key, m.key + ': the legacy editor gates ' + cap + ', and the module owns the commands that open it');
      });
    });
    ok(/function addOnOpens\(el\)/.test(fs.readFileSync(path.join(__dirname, '..', 'omega-caps.js'), 'utf8')), 'the editor opens a live add-on by the module (omega-caps addOnOpens)');
    equal(AO.LOGIC, M.catalog().filter(function (m) { return m.shelf === 'platform'; }).map(function (m) { return m.key; }), 'the Omega Logic parts are the catalog\'s');
  } finally { Date.now = realNow; }
  console.log('Add to plan on a legacy workspace: ' + count + ' passed; QuickBooks mocked, no network.');
}
run().catch(function (e) { console.error(e); process.exit(1); });
