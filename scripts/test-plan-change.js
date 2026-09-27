/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Phase 5: paid opt-in. Library and endpoint against the Firestore double
 * with QuickBooks mocked. No network, no live writes.
 */
'use strict';
var assert = require('assert'), F = require('./_lib/firestore-double');
var B = require('../api/_lib/pricebook'), M = require('../api/_lib/modules'), S = require('../api/_lib/package-billing');
var Q = require('../api/_lib/qbo-billing'), R = require('../api/_lib/proration');
var count = 0, calls = 0, receipts = {}, db, failures = {}, originalDriver = Q.driver;
var orgId = 'plan.example', root = 'omega_orgs/' + orgId, ev = M.starters().ev;
var staff = { staff: true, uid: 'staff', email: 'staff@clearsky-usa.com', claims: { email_verified: true } };
var owner = { staff: false, uid: 'owner', email: 'owner@' + orgId, orgId: orgId, role: 'owner', claims: { email_verified: true } };
var member = Object.assign({}, owner, { uid: 'm1', role: 'member' });
var profile = { legalName: 'Plan Example', contactName: 'Pat Example', email: 'ap@plan.example', phone: '555-0100',
  address: { line1: '1 Example', city: 'Chicago', state: 'IL', postalCode: '60601', country: 'US' }, vertical: 'developer', teamSize: 3 };
F.mock('../api/_lib/admin', { handler: function (fn) { return fn; }, authenticate: async function (req) { return req.caller; }, db: function () { return db; },
  httpError: function (status, text) { var e = new Error(text); e.status = status; return e; }, safeOrg: function (s) { return /^[a-z0-9.-]+\.[a-z]+$/.test(s || '') ? s : null; },
  isTenantAdmin: async function (c, o) { return c.staff || (c.orgId === o && ['owner', 'admin'].indexOf(c.role) >= 0); },
  billingOf: async function (o) { var r = await db.doc('omega_orgs/' + o + '/billing/current').get(); return r.exists ? r.data() : {}; },
  FieldValue: function () { return { serverTimestamp: function () { return Date.now(); } }; } });
/* staff mail is recorded, never sent: which alert, and what it carried */
var sentMail = [];
F.mock('../api/_lib/mail', { templates: ['optInAlert', 'optOutAlert', 'removalAlert'].reduce(function (t, name) { t[name] = async function (o) { sentMail.push({ name: name, o: o }); return { ok: true }; }; return t; }, {}) });
var C = require('../api/_lib/plan-change'), api = require('../api/plan-change'), res = { setHeader: function () {} };
var P = require('../api/_lib/subscription-pricing');
function equal(a, b, text) { assert.deepStrictEqual(a, b, text); count++; }
function ok(v, text) { assert(v, text); count++; }
async function refused(fn, re) { await assert.rejects(fn, re); count++; }
function bill() { return db.data.get(root + '/billing/current'); }
function mods() { return bill().modules.slice().sort(); }
var evSorted = ev.slice().sort();
function req(method, body, caller) { return api({ method: method, query: body, body: body, caller: caller || owner, headers: {} }, res); }
/* A tenant whose current cycle is already paid in the sandbox. */
function seed(modules, plan, extra, on, day) {
  db = new F.DB(); db.serial = true; receipts = {};
  var book = B.proposed(); book.enabled = true; book.qbo.realmId = '123'; db.seed('pricebook/' + book.version, book);
  on = on || '2026-09-20'; day = day || 20;
  var cycle = R.cycle(on, day), grants = M.resolve(modules);
  db.seed(root, { name: 'Plan Example', status: 'active', packagingSandbox: true, domains: ['plan.example'], signedUpAt: '2026-08-20T12:00:00Z' });
  db.seed(root + '/billing/current', Object.assign({ packaged: true, packagingState: 'paid', modules: modules, plan: plan, billingDay: day, interval: 'monthly',
    qboCustomerId: 'C1', qboRealmId: '123', pricebookVersion: book.version, billingProvider: 'quickbooks', subscriptionStartedAt: Date.parse('2026-08-20T12:00:00Z'),
    firstInvoiceOn: '2026-08-20', nextInvoiceOn: cycle.end, serviceFeeNextOn: '2027-08-20', paidThrough: cycle.end, accessUntil: Date.parse(cycle.end + 'T00:00:00Z') + 20 * R.DAY,
    monthlyCents: 0, builders: 3, viewers: 10, subscription: { modules: modules, plan: plan, interval: 'monthly', builders: 3, viewers: 10, since: Date.parse('2026-08-20T12:00:00Z') } }, grants, extra || {}));
  db.seed(root + '/billing/current/invoices/' + on, { date: on, period: { start: on, end: cycle.end }, modules: modules, plan: plan, lines: [], subtotalCents: 1, totalCents: 1,
    state: 'paid', paidCents: 1, qboInvoiceId: 'I-' + on, qboCustomerId: 'C1', marker: 'OMEGA subscription ' + orgId + ' / ' + on, pricebookVersion: book.version });
  db.seed(root + '/billing/profile', profile);
  db.seed(root + '/members/owner', { role: 'owner', status: 'active' });
}
async function quote(add, caller, plan) { var body = { action: 'quote', add: add, orgId: orgId }; if (plan) body.plan = plan; return req('POST', body, caller); }
async function apply(add, caller, plan) {
  var q = await quote(add, caller, plan), body = { action: 'apply', add: add, orgId: orgId, previewId: q.previewId, effectiveAt: q.effectiveAt }; if (plan) body.plan = plan;
  return req('POST', body, caller);
}
async function removal(remove, withdraw, caller) {
  var body = { action: withdraw ? 'withdraw-removal' : 'request-removal', remove: remove };
  var q = await req('POST', Object.assign({}, body, { dryRun: true }), caller);
  return req('POST', Object.assign({}, body, { previewId: q.previewId }), caller);
}
async function run() {
  process.env.PACKAGING_BILLING_ENABLED = 'true'; process.env.QBO_ENV = 'sandbox';
  var now = Date.parse('2026-09-26T12:00:00Z'), realNow = Date.now; Date.now = function () { return now; };
  Q.driver = function () { return { customer: async function () { calls++; return 'C1'; },
    invoice: async function (plan) { calls++; var id = plan.kind === 'change' ? 'I-' + plan.marker.slice(-12) : 'I-' + plan.date; return { id: id, totalCents: plan.subtotalCents, payUrl: 'https://connect.intuit.com/pay/' + id }; },
    reconcile: async function (record) { if (failures[record.qboInvoiceId]) { var e = new Error('QuickBooks request failed (503)'); e.status = failures[record.qboInvoiceId]; throw e; } return receipts[record.qboInvoiceId] || (record.state === 'paid' ? { satisfied: true, reversed: false, paidCents: record.totalCents, payUrl: null } : { satisfied: false, reversed: false, paidCents: 0, payUrl: 'https://connect.intuit.com/pay/x' }); } }; };

  /* ── Money math ─────────────────────────────────────────────────── */
  seed(ev, 'field');
  var q = await quote(['siteintel']);
  equal(q.plan, 'alacarte'); equal(q.todayCents, 76080); equal(q.included, false); equal(q.activation, 'on-payment');
  equal(q.lines.map(function (l) { return l.itemKey + ':' + l.amountCents; }), ['module:siteintel:40000', 'plan:field:36080'], 'leaving Field books the remainder on the Field item');
  equal(q.lines.reduce(function (n, l) { return n + l.amountCents; }, 0), q.todayCents, 'lines sum to the charge');
  equal(q.cycle, { start: '2026-09-20', end: '2026-10-20', days: 30, remainingDays: 24 });
  ok(/\$760\.80 today \(24 of 30 days/.test(q.display.today), q.display.today);
  ok(/then \$2,250\/month on the 20th \(up from \$1,299\/month\)/.test(q.display.then), q.display.then);
  ok(/\$1,500\/year/.test(q.serviceFeeNote), 'service fee change is disclosed');
  equal(q.canApply, true); equal(q.pending, []);
  var q2 = await quote(['siteintel'], owner, 'pro');
  equal(q2.plan, 'pro'); equal(q2.lines.map(function (l) { return l.itemKey + ':' + l.amountCents; }), ['plan:pro:96000']);
  seed(['lite', 'storage', 'estimate', 'evrebates'], 'alacarte');
  var q3 = await quote(['gridatlas']);
  equal(q3.plan, 'alacarte', 'the plan stays what the tenant chose'); equal(q3.todayCents, 20000);
  equal(q3.steer, { plan: 'field', savingsCents: 20100, display: 'Switch to Field and save $201/month.' }, 'a cheaper tier is offered');
  var q4 = await quote(['gridatlas'], owner, 'field');
  equal(q4.plan, 'field'); equal(q4.todayCents, 3920); equal(q4.monthlyDeltaCents, 4900);
  seed(['lite', 'logic-office', 'logic-plant', 'logic-materials', 'logic-logistics'], 'alacarte');
  var q5 = await quote(['logic-customer']);
  equal(q5.included, true, 'the fifth Logic part completes the bundle and lowers the price'); equal(q5.monthlyDeltaCents, -75000);
  seed(['lite'], 'alacarte');
  var q6 = await quote(['logic-plant']);
  equal(q6.add, ['logic-office', 'logic-plant'], 'dependencies are added, not guessed away');
  equal((await quote(['storage', 'storage'])).add, ['storage'], 'a repeated module is counted once');
  await refused(function () { return quote(['lite']); }, /always included/);
  await refused(function () { return quote(['nonsense']); }, /Unknown module/);
  seed(['lite', 'storage'], 'alacarte', { credit: { pct: 40, startsAt: '2026-09-01T00:00:00Z', endsAt: '2026-11-30T00:00:00Z' } });
  var q7 = await quote(['engineering']);
  equal(q7.lines.map(function (l) { return l.itemKey + ':' + l.amountCents; }), ['module:engineering:40000', 'credit:-20000'], 'the credit applies to the addition as a discount line');
  equal(q7.todayCents, 20000);

  /* ── Billing-day edges ──────────────────────────────────────────── */
  seed(['lite', 'storage'], 'alacarte', null, '2026-01-31', 31); now = Date.parse('2026-02-15T12:00:00Z');
  var e1 = await quote(['engineering']); equal(e1.cycle, { start: '2026-01-31', end: '2026-02-28', days: 28, remainingDays: 13 }); equal(e1.todayCents, Math.round(50000 * 13 / 28));
  seed(['lite', 'storage'], 'alacarte', null, '2024-01-31', 31); now = Date.parse('2024-02-15T12:00:00Z');
  var e2 = await quote(['engineering']); equal(e2.cycle, { start: '2024-01-31', end: '2024-02-29', days: 29, remainingDays: 14 }); equal(e2.todayCents, Math.round(50000 * 14 / 29));
  seed(['lite', 'storage'], 'alacarte', null, '2026-09-20', 20); now = Date.parse('2026-09-20T12:00:00Z');
  var e3 = await quote(['engineering']); equal(e3.cycle.remainingDays, 30, 'the billing day itself is a full cycle'); equal(e3.todayCents, 50000);
  now = Date.parse('2026-09-26T12:00:00Z');

  /* ── Gates ──────────────────────────────────────────────────────── */
  seed(ev, 'field', { packagingState: 'trial' });
  var g1 = await quote(['siteintel']); equal(g1.canApply, false); ok(/trial/.test(g1.reason)); await refused(function () { return apply(['siteintel']); }, /trial/);
  seed(ev, 'field', { packagingState: 'awaiting_payment' }); var g2 = await quote(['siteintel']); ok(/Pay your current invoice/.test(g2.reason)); await refused(function () { return apply(['siteintel']); }, /Pay your current invoice/);
  seed(ev, 'field', { interval: 'annual' }); var g3 = await quote(['siteintel']); ok(/annual prepay/i.test(g3.reason));
  seed(ev, 'field'); db.data.get(root).status = 'suspended'; var g4 = await quote(['siteintel']); ok(/not active/.test(g4.reason));
  seed(ev, 'field');
  await refused(function () { return quote(['siteintel'], member); }, /workspace administrator/);
  await refused(function () { return quote(['siteintel'], Object.assign({}, owner, { claims: { email_verified: 'true' } })); }, /Verified email/);
  await refused(function () { return req('POST', { action: 'quote', add: ['siteintel'], orgId: 'other.example' }); }, /Own organization/);
  await refused(function () { return req('POST', { action: 'quote', add: ['siteintel'], monthlyCents: 1 }); }, /Unsupported field/);
  await refused(function () { return req('POST', { action: 'nope' }); }, /Action must be/);
  await refused(function () { return req('DELETE', {}); }, /GET or POST/);
  ok((await quote(['siteintel'], staff)).canApply, 'staff may act for a tenant');
  var summary = await req('GET', { orgId: orgId }); equal(summary.packagingState, 'paid'); equal(summary.pending, []); equal(summary.gate.canApply, true);
  /* Phase 10B: the Account panel reads the invoices and the names off the same summary */
  equal(summary.invoices.length, 1); equal(summary.invoices[0].kind, 'subscription'); equal(summary.invoices[0].state, 'paid'); equal(summary.invoices[0].paymentLink, null); equal(typeof summary.invoices[0].display, 'string');
  equal(summary.moduleNames.indexOf('Lite') >= 0 && summary.subscriptionNames.length === summary.subscription.length, true); equal(summary.paidThrough, summary.nextInvoiceOn); equal(summary.amountDue, null);

  /* ── Pay first, then the modules ────────────────────────────────── */
  seed(ev, 'field'); var before = calls;
  await refused(function () { return req('POST', { action: 'apply', add: ['siteintel'], previewId: 'x'.repeat(48), effectiveAt: now }); }, /Preview changed/);
  var q8 = await quote(['siteintel']);
  await refused(function () { return req('POST', { action: 'apply', add: ['siteintel'], previewId: q8.previewId, effectiveAt: now - 11 * 60000 }); }, /Refresh the quote/);
  equal(calls, before, 'no QuickBooks call before a valid apply');
  var r1 = await apply(['siteintel']);
  equal(r1.state, 'awaiting_payment'); equal(r1.todayCents, 76080); ok(/^https:\/\/connect\.intuit\.com\//.test(r1.paymentLink)); equal(r1.expiresOn, '2026-10-20');
  equal(calls, before + 1, 'exactly one invoice');
  equal(mods(), evSorted, 'nothing switches on before payment'); equal(bill().plan, 'field');
  equal(bill().amountDue, 760.8); equal(bill().paymentLink, r1.paymentLink, 'the change invoice is the pay link while nothing else is owed');
  var change = db.data.get(root + '/billing/current/invoices/' + r1.changeId);
  equal(change.kind, 'change'); equal(change.state, 'unpaid'); equal(change.add, ['siteintel']); equal(change.cycle, { start: '2026-09-20', end: '2026-10-20' });
  ok(db.data.has(root + '/billing/current/history/' + r1.changeId) && db.data.has(root + '/admin_audit/' + r1.changeId), 'history and audit rows');
  ok(db.data.get(root + '/notifications/package-change-' + r1.changeId).packageMail === 'packageInvoice', 'invoice mail queued');
  var again = await req('POST', { action: 'apply', add: ['siteintel'], previewId: q8.previewId, effectiveAt: q8.effectiveAt });
  equal(again, r1, 'a retry returns the same result'); equal(calls, before + 1);
  var q9 = await quote(['engineering']); equal(q9.canApply, false); ok(/waiting for payment/.test(q9.reason), 'one open change at a time');
  await refused(function () { return apply(['engineering']); }, /waiting for payment/);
  receipts[change.qboInvoiceId] = { satisfied: true, reversed: false, paidCents: 76080, payUrl: null };
  await S.reconcile(db, orgId, now + 60000, {});
  equal(mods(), evSorted.concat(['siteintel']).sort(), 'paid: the module joins the package'); equal(bill().plan, 'alacarte');
  equal(bill().subscription.modules.slice().sort(), evSorted.concat(['siteintel']).sort(), 'what they bought is recorded separately from what is on'); equal(bill().subscription.plan, 'alacarte');
  equal(bill().packagingState, 'paid'); equal(bill().monthlyDisplay, '$2,250/month'); equal(bill().amountDue, 0);
  equal(db.data.get(root + '/billing/current/invoices/' + r1.changeId).state, 'paid');
  var recurring = await S.issue(db, orgId, Date.parse('2026-10-20T09:00:00Z'), {});
  equal(recurring.date, '2026-10-20'); var next = db.data.get(root + '/billing/current/invoices/2026-10-20');
  equal(next.modules.slice().sort(), ev.concat(['siteintel']).sort(), 'the next recurring invoice carries the module at full price'); equal(next.plan, 'alacarte');
  equal(next.lines.filter(function (l) { return l.itemKey.indexOf('module:') === 0; }).reduce(function (n, l) { return n + l.amountCents; }, 0), 225000);
  await S.reconcile(db, orgId, Date.parse('2026-10-21T09:00:00Z'), {});
  equal(bill().modules.indexOf('siteintel') >= 0, true, 'still layered while the next invoice is unpaid and inside grace');
  receipts['I-2026-10-20'] = { satisfied: true, reversed: false, paidCents: 225000, payUrl: null };
  await S.reconcile(db, orgId, Date.parse('2026-10-22T09:00:00Z'), {});
  equal(bill().modules.indexOf('siteintel') >= 0, true, 'and part of the base once that invoice is paid');
  receipts[change.qboInvoiceId] = { satisfied: false, reversed: true, paidCents: 0, payUrl: null };
  await S.reconcile(db, orgId, Date.parse('2026-10-23T09:00:00Z'), {});
  equal(bill().packagingState, 'paid', 'a reversed change never closes the subscription');
  equal(bill().modules.indexOf('siteintel') >= 0, true, 'the base already carried it');

  /* ── Reversal inside the cycle removes only its modules ─────────── */
  seed(ev, 'field'); var r2 = await apply(['siteintel']);
  receipts['I-' + db.data.get(root + '/billing/current/invoices/' + r2.changeId).marker.slice(-12)] = { satisfied: true, reversed: false, paidCents: 76080, payUrl: null };
  await S.reconcile(db, orgId, now + 60000, {}); equal(bill().modules.indexOf('siteintel') >= 0, true);
  receipts['I-' + db.data.get(root + '/billing/current/invoices/' + r2.changeId).marker.slice(-12)] = { satisfied: false, reversed: true, paidCents: 0, payUrl: null };
  await S.reconcile(db, orgId, now + 120000, {});
  equal(mods(), evSorted, 'reversed: its module comes off'); equal(bill().packagingState, 'paid'); equal(bill().plan, 'field');

  /* ── $0 inside an already-paid tier activates now (option 1) ───── */
  seed(['lite', 'evrebates', 'estimate'], 'field'); before = calls;
  var q10 = await quote(['storage']); equal(q10.included, true); equal(q10.todayCents, 0); equal(q10.activation, 'immediate'); ok(/no charge today/.test(q10.display.today));
  var r3 = await apply(['storage']);
  equal(r3.state, 'active'); equal(calls, before, 'no QuickBooks invoice for an included addition');
  equal(bill().modules.slice().sort(), ['estimate', 'evrebates', 'lite', 'storage'], 'switched on immediately'); equal(bill().plan, 'field');
  ok(bill().toolAccess.indexOf('batterysizer') >= 0, 'grants follow'); equal(bill().packagingState, 'paid');
  equal(db.data.get(root + '/billing/current/invoices/' + r3.changeId).totalCents, 0);
  await S.reconcile(db, orgId, now + 60000, {});
  equal(bill().modules.indexOf('storage') >= 0, true, 'reconciliation keeps it');
  seed(['lite', 'evrebates', 'estimate'], 'field', { packagingState: 'trial' });
  var q11 = await quote(['storage']); equal(q11.included, true); equal(q11.canApply, false, 'never during a trial, even at $0');

  /* ── Late payment after the cycle rolled is flagged, not granted ── */
  seed(ev, 'field'); var r4 = await apply(['siteintel']); var late = db.data.get(root + '/billing/current/invoices/' + r4.changeId);
  await S.issue(db, orgId, Date.parse('2026-10-20T09:00:00Z'), {});
  equal(db.data.get(root + '/billing/current/invoices/2026-10-20').modules.slice().sort(), evSorted, 'the recurring invoice did not include the unpaid change');
  await S.reconcile(db, orgId, Date.parse('2026-10-20T10:00:00Z'), {});
  equal(db.data.get(root + '/billing/current/invoices/' + r4.changeId).state, 'expired', 'unpaid past the cycle expires');
  equal((await quote(['engineering'])).canApply, true, 'an expired change no longer blocks');
  receipts[late.qboInvoiceId] = { satisfied: true, reversed: false, paidCents: 76080, payUrl: null };
  var late4 = await S.reconcile(db, orgId, Date.parse('2026-10-20T11:00:00Z'), {});
  equal(db.data.get(root + '/billing/current/invoices/' + r4.changeId).state, 'paid', 'a payment is always honoured');
  equal(late4.invoices.filter(function (i) { return i.invoiceId === late.qboInvoiceId; })[0].reviewRequired, true, 'and a person reviews money paid after the cycle rolled');
  equal(bill().subscription.modules.indexOf('siteintel') >= 0, true, 'the module is theirs from now on');
  ok(db.data.get(root + '/billing/current/invoices/2026-10-20').modules.indexOf('siteintel') < 0, 'the recurring invoice already issued is not rewritten');

  /* ── Cancel a pending change ───────────────────────────────────── */
  seed(ev, 'field'); var r6 = await apply(['siteintel']);
  await refused(function () { return req('POST', { action: 'cancel', changeId: 'change-zzz' }); }, /Invalid change id/);
  await refused(function () { return req('POST', { action: 'cancel', changeId: r6.changeId }, member); }, /workspace administrator/);
  var c1 = await req('POST', { action: 'cancel', changeId: r6.changeId }); equal(c1.state, 'cancelled');
  equal(bill().amountDue, 0); equal(bill().paymentLink, null);
  await refused(function () { return req('POST', { action: 'cancel', changeId: r6.changeId }); }, /waiting for payment/);
  ok((await quote(['engineering'])).canApply, 'a cancelled change no longer blocks');
  receipts[db.data.get(root + '/billing/current/invoices/' + r6.changeId).qboInvoiceId] = { satisfied: true, reversed: false, paidCents: 76080, payUrl: null };
  var paidCancelled = await S.reconcile(db, orgId, now + 60000, {});
  equal(db.data.get(root + '/billing/current/invoices/' + r6.changeId).state, 'paid', 'paying a cancelled change is honoured');
  equal(paidCancelled.invoices[paidCancelled.invoices.length - 1].reviewRequired, true, 'and flagged for a person'); equal(bill().modules.indexOf('siteintel') >= 0, true);

  /* ── Concurrency and stale previews ────────────────────────────── */
  seed(ev, 'field'); before = calls; var q12 = await quote(['siteintel']);
  var body = { action: 'apply', add: ['siteintel'], previewId: q12.previewId, effectiveAt: q12.effectiveAt };
  var both = await Promise.allSettled([req('POST', body), req('POST', body)]);
  equal(both.filter(function (r) { return r.status === 'fulfilled'; }).length, 1, 'concurrent applies: one invoice'); equal(calls, before + 1);
  seed(ev, 'field'); var q13 = await quote(['siteintel']); db.data.get(root + '/billing/current').subscription.modules = ['lite', 'storage', 'estimate', 'evrebates', 'gridatlas'];
  await refused(function () { return req('POST', { action: 'apply', add: ['siteintel'], previewId: q13.previewId, effectiveAt: q13.effectiveAt }); }, /Preview changed|package changed/);
  seed(ev, 'field'); var q14 = await quote(['siteintel']); db.data.get('pricebook/' + B.VERSION).enabled = false;
  await refused(function () { return req('POST', { action: 'apply', add: ['siteintel'], previewId: q14.previewId, effectiveAt: q14.effectiveAt }); }, /enabled/);
  seed(ev, 'field'); var q15 = await quote(['siteintel']); db.data.get(root).packagingSandbox = false;
  await refused(function () { return req('POST', { action: 'apply', add: ['siteintel'], previewId: q15.previewId, effectiveAt: q15.effectiveAt }); }, /sandbox tenant/);

  /* ── A webhook body or a client field never grants ─────────────── */
  seed(ev, 'field'); var r7 = await apply(['siteintel']);
  await S.reconcile(db, orgId, now + 60000, {}); equal(mods(), evSorted, 'an unpaid change grants nothing however often it is polled');
  await refused(function () { return req('POST', { action: 'apply', add: ['engineering'], previewId: r7.changeId.slice(7), effectiveAt: now, state: 'paid' }); }, /Unsupported field/);

  /* ── Phase 4 fixes found in review ─────────────────────────────── */
  // A late payer drops to Lite but never loses the package they bought.
  seed(ev, 'field'); await S.issue(db, orgId, Date.parse('2026-10-20T09:00:00Z'), {});
  await S.reconcile(db, orgId, Date.parse('2026-11-06T12:00:00Z'), {});
  equal(bill().packagingState, 'past_due_lite'); equal(bill().modules, ['lite']); equal(bill().plan, 'field');
  equal(bill().subscription.modules.slice().sort(), evSorted, 'the subscription survives the Lite fallback');
  await S.issue(db, orgId, Date.parse('2026-11-20T09:00:00Z'), {});
  equal(db.data.get(root + '/billing/current/invoices/2026-11-20').modules.slice().sort(), evSorted, 'the next invoice bills the package, not Lite');
  receipts['I-2026-10-20'] = { satisfied: true, reversed: false, paidCents: 129900, payUrl: null }; receipts['I-2026-11-20'] = { satisfied: true, reversed: false, paidCents: 129900, payUrl: null };
  await S.reconcile(db, orgId, Date.parse('2026-11-21T12:00:00Z'), {});
  equal(mods(), evSorted, 'paying restores the whole package'); equal(bill().packagingState, 'paid');
  // A transient QuickBooks failure never closes a paying tenant's access.
  seed(ev, 'field'); failures['I-2026-09-20'] = 503;
  await S.reconcile(db, orgId, now, {}); equal(bill().packagingState, 'paid', 'one failed poll changes nothing'); equal(db.data.get(root + '/billing/current/invoices/2026-09-20').reconcileRetries, 1);
  await S.reconcile(db, orgId, now, {}); await S.reconcile(db, orgId, now, {});
  equal(bill().packagingState, 'paid', 'three in a row is a person\'s problem, never the tenant\'s: access stays as last read'); equal(bill().reconciliationRequired, true, 'and it is flagged for the console');
  equal(db.data.get('omega_orgs/clearsky-usa.com/notifications/billing-review-' + orgId + '-I-2026-09-20').staffMail, 'billingAlert', 'ClearSky hears about it');
  delete failures['I-2026-09-20']; receipts['I-2026-09-20'] = { satisfied: true, reversed: false, paidCents: 1, payUrl: null };
  await S.reconcile(db, orgId, now, {}); equal(bill().packagingState, 'paid', 'and a good read clears it'); equal(db.data.get(root + '/billing/current/invoices/2026-09-20').reconcileRetries, 0); equal(bill().reconciliationRequired, false);
  seed(ev, 'field'); failures['I-2026-09-20'] = 409; await S.reconcile(db, orgId, now, {});
  equal(bill().packagingState, 'paid', 'a validation failure is reviewed at once, access unchanged'); equal(bill().reconciliationRequired, true); delete failures['I-2026-09-20'];
  // QuickBooks refusing OUR connection (401/403/429) is ClearSky's problem: retried, never the tenant's review, never a lock.
  seed(ev, 'field'); failures['I-2026-09-20'] = 403; await S.reconcile(db, orgId, now, {});
  equal(bill().packagingState, 'paid'); equal(bill().reconciliationRequired, false, 'a 403 is retried like a 5xx'); equal(db.data.get(root + '/billing/current/invoices/2026-09-20').reconcileRetries, 1); delete failures['I-2026-09-20'];
  // Line validation does not depend on the order QuickBooks returns lines in.
  var bookQ = B.proposed(); bookQ.qbo.realmId = '123'; bookQ.qbo.items = { 'module:storage': '11', credit: '12', 'service-fee': '13' };
  var deps = { Q: { ENV: 'sandbox', IS_SANDBOX: true, API_BASE: 'https://sandbox-quickbooks.api.intuit.com', load: async function () { return { env: 'sandbox', realmId: '123' }; } },
    request: async function (path) {
      if (path.indexOf('invoice/') === 0) return { Invoice: { Id: 'X', CustomerRef: { value: 'C1' }, PrivateNote: 'm', TotalAmt: 4.5, Balance: 0, LinkedTxn: [], Line: [
        { DetailType: 'SalesItemLineDetail', Amount: 2.5, SalesItemLineDetail: { ItemRef: { value: '11' } } }, { DetailType: 'SubTotalLineDetail', Amount: 2.5 },
        { DetailType: 'DiscountLineDetail', Amount: 1 }, { DetailType: 'SalesItemLineDetail', Amount: 3, SalesItemLineDetail: { ItemRef: { value: '13' } } }] } };
      return {};
    } };
  var recordQ = { qboInvoiceId: 'X', qboCustomerId: 'C1', marker: 'm', totalCents: 450, lines: [{ itemKey: 'module:storage', amountCents: 250 }, { itemKey: 'credit', amountCents: -100 }, { itemKey: 'service-fee', amountCents: 300 }] };
  var okReceipt = await originalDriver(bookQ, deps).reconcile(recordQ); equal(okReceipt.satisfied, false, 're-sequenced lines validate; no allocated payment means unpaid');
  await refused(function () { return originalDriver(bookQ, deps).reconcile(Object.assign({}, recordQ, { lines: [{ itemKey: 'module:storage', amountCents: 250 }, { itemKey: 'service-fee', amountCents: 300 }] })); }, /lines changed/);
  // The credit window starts when paying starts, not during the trial.
  var Policy = require('../api/_lib/package-billing-policy'), bookP = B.proposed();
  var terms = Policy.terms({ modules: ['lite', 'storage'], credit: true }, bookP, now);
  var approved = Policy.approve({ status: 'pending', signedUpAt: '2026-09-01T00:00:00Z' }, {}, terms, bookP, now);
  equal(approved.credit.startsAt, new Date(approved.trialEndsAt).toISOString(), 'credit starts at trial end');
  equal(Date.parse(approved.credit.endsAt) - Date.parse(approved.credit.startsAt), bookP.credit.days * R.DAY); equal(approved.subscription.modules, ['lite', 'storage']);
  // Tenant admins see their plan, never staff-internal notes.
  seed(ev, 'field', { serviceFee: { mode: 'waived', reason: 'Launch partner', display: 'Waived' }, qboRealmId: '123' });
  db.seed(root + '/billing/current/history/h1', { at: now, by: 'staff@clearsky-usa.com', action: 'package-approve', was: { secret: 1 }, changed: { modules: ev } });
  var tenantView = await require('../api/tenant-package')({ method: 'GET', query: { orgId: orgId }, caller: owner, headers: {} }, res);
  equal(tenantView.billing.serviceFee, { mode: 'waived', display: 'Waived', appliesTo: null }); equal(tenantView.billing.qboRealmId, undefined); equal(tenantView.history[0].changed.modules, ev); equal(tenantView.history[0].was, undefined); equal(tenantView.audit, []);
  var staffView = await require('../api/tenant-package')({ method: 'GET', query: { orgId: orgId }, caller: staff, headers: {} }, res);
  equal(staffView.billing.serviceFee.reason, 'Launch partner', 'staff still see the reason');

  /* ── Removals wait for the review ──────────────────────────────── */
  seed(ev, 'field');
  var beforeRemoval = B.stable(Array.from(db.data.entries())), qRemove = await req('POST', { action: 'request-removal', remove: ['plansets'], dryRun: true });
  equal(B.stable(Array.from(db.data.entries())), beforeRemoval, 'opt-out preview writes nothing');
  equal(qRemove.names, [M.get('plansets').name]); ok(/quarterly review/.test(qRemove.note) && /charges stay unchanged/.test(qRemove.note));
  /* the confirm panel states the money: the fee today, the fee after the
     review, and the review's date (since 2026-08-20 + 90 days) */
  equal(qRemove.beforeDisplay, '$1,299/month'); equal(qRemove.afterDisplay, '$1,299/month', 'the Field plan still covers what is left: the fee stays');
  equal(qRemove.reviewOn, '2026-11-18', 'the first review on or after today');
  equal(sentMail.length, 0, 'a dry run mails nobody');
  var rm = await req('POST', { action: 'request-removal', remove: ['plansets'], reason: 'Not using it', previewId: qRemove.previewId });
  equal(rm.removalRequests.map(function (r) { return r.module; }), ['plansets']); equal(mods(), evSorted, 'access unchanged');
  equal(sentMail.map(function (m) { return m.name; }), ['removalAlert'], 'ClearSky hears about a queued opt-out');
  equal([sentMail[0].o.names, sentMail[0].o.reviewOn, sentMail[0].o.beforeDisplay, sentMail[0].o.reason, sentMail[0].o.orgId], [[M.get('plansets').name], '2026-11-18', '$1,299/month', 'Not using it', orgId]);
  var sumReview = await req('GET', { orgId: orgId }); equal(sumReview.nextReviewOn, '2026-11-18'); equal(sumReview.optIns, {}); equal(sumReview.optOuts, {}); sentMail = [];
  await refused(function () { return req('POST', { action: 'request-removal', remove: ['lite'] }); }, /always included/);
  await refused(function () { return req('POST', { action: 'request-removal', remove: ['siteintel'] }); }, /not in your package/);
  await refused(function () { return req('POST', { action: 'request-removal', remove: ['plansets'] }, member); }, /workspace administrator/);
  var rm2 = await removal(['plansets', 'gridatlas']); equal(rm2.removalRequests.length, 2, 'no duplicates');
  var wd = await removal(['plansets'], true); equal(wd.removalRequests.map(function (r) { return r.module; }), ['gridatlas']);
  equal(sentMail.map(function (m) { return m.name; }), ['removalAlert'], 'the second request mails; a withdrawal does not'); sentMail = [];
  equal((await req('GET', { orgId: orgId })).removalRequests.length, 1);
  ok(Array.from(db.data.keys()).filter(function (p) { return p.indexOf('/admin_audit/removal-') >= 0; }).length === 3, 'every removal change is audited');
  await refused(function () { return req('POST', { action: 'request-removal', remove: ['plansets'] }); }, /review the opt-out/);
  await refused(function () { return removal(['lite'], true); }, /always included/);
  await refused(function () { return req('POST', { action: 'request-removal', orgId: 'another.example', remove: ['plansets'], dryRun: true }); }, /Own organization required/);
  var staffPreview = await req('POST', { action: 'request-removal', orgId: orgId, remove: ['plansets'], dryRun: true }, staff);
  var staffRemoval = await req('POST', { action: 'request-removal', orgId: orgId, remove: ['plansets'], previewId: staffPreview.previewId }, staff);
  ok(staffRemoval.removalRequests.some(function (r) { return r.module === 'plansets' && r.by === staff.email; }), 'staff removal targets the selected tenant');
  var logic = M.catalog().filter(function (m) { return m.key === 'lite' || m.shelf === 'platform'; }).map(function (m) { return m.key; });
  seed(logic, 'alacarte');
  var qOffice = await req('POST', { action: 'request-removal', remove: ['logic-office'], dryRun: true });
  equal(qOffice.modules, logic.filter(function (k) { return k !== 'lite'; }), 'Office preview names every dependent department');
  var qbCalls = calls, originalSub = B.stable(bill().subscription), originalGrant = mods();
  await removal(['logic-office']);
  equal(bill().removalRequests.map(function (r) { return r.module; }), qOffice.modules);
  equal(B.stable(bill().subscription), originalSub, 'request leaves the paid subscription unchanged'); equal(mods(), originalGrant); equal(calls, qbCalls, 'opt-out sends no invoice or refund');
  await removal(['logic-plant'], true);
  equal(bill().removalRequests.map(function (r) { return r.module; }), ['logic-materials', 'logic-logistics', 'logic-customer'], 'keeping Plant also withdraws the Office removal');
  seed(['lite', 'logic-office'], 'alacarte');
  var stale = await req('POST', { action: 'request-removal', remove: ['logic-office'], dryRun: true });
  bill().subscription.modules.push('logic-plant');
  await refused(function () { return req('POST', { action: 'request-removal', remove: ['logic-office'], previewId: stale.previewId }); }, /review the opt-out/, 'new dependencies require a new preview');
  bill().packaged = false;
  await refused(function () { return req('POST', { action: 'request-removal', remove: ['logic-office'], dryRun: true }); }, /not on a subscription package/);
  /* à la carte: the fee moves down by what is removed, priced by the book */
  seed(['lite', 'storage', 'estimate', 'evrebates'], 'alacarte');
  var qAla = await req('POST', { action: 'request-removal', remove: ['storage'], dryRun: true }), bookNow = B.proposed();
  equal([qAla.beforeDisplay, qAla.afterDisplay], [P.quote(['lite', 'storage', 'estimate', 'evrebates'], bookNow, { plan: 'alacarte', builders: 3, viewers: 10 }).display.monthly, P.quote(['lite', 'estimate', 'evrebates'], bookNow, { plan: 'alacarte', builders: 3, viewers: 10 }).display.monthly]);
  ok(qAla.beforeDisplay !== qAla.afterDisplay, 'the before and after differ when the module is paid for on its own');
  var qWd = await req('POST', { action: 'withdraw-removal', remove: ['storage'], dryRun: true }); equal(qWd.reviewOn, undefined, 'withdrawing prices nothing');
  delete bill().subscription.since; equal((await req('POST', { action: 'request-removal', remove: ['storage'], dryRun: true })).reviewOn, null, 'no start on record: no invented date');
  equal((await req('GET', { orgId: orgId })).nextReviewOn, null);
  /* the review date: whole periods from the start, on or after today */
  var day = function (s) { return Date.parse(s + 'T12:00:00Z'); }, sub = function (since) { return { subscription: { since: since } }; }, book30 = { policy: { reviewDays: 30 } };
  equal(C.reviewOn(sub(day('2026-09-26')), bookNow, day('2026-09-26')), '2026-12-25', 'started today: the first review is a period out, never today');
  equal(C.reviewOn(sub(day('2026-06-28')), bookNow, day('2026-09-26')), '2026-09-26', 'exactly one period ago: today');
  equal(C.reviewOn(sub(day('2026-06-27')), bookNow, day('2026-09-26')), '2026-12-24', 'one day past a review: the next one');
  equal(C.reviewOn(sub(day('2026-09-20')), book30, day('2026-12-01')), '2026-12-19', 'the book decides the period');
  equal(C.reviewOn(sub(day('2026-08-20')), null, day('2026-09-26')), '2026-11-18', 'no book: ninety days');
  equal(C.reviewOn(sub('2026-08-20T00:00:00Z'), bookNow, day('2026-09-26')), '2026-11-18', 'a stored date string reads the same');
  equal(C.reviewOn({}, bookNow, day('2026-09-26')), null); equal(C.reviewOn(sub(null), bookNow, day('2026-09-26')), null);


  /* ── Opt in on a plan billed outside the engine (2026-09-27) ────── */
  db = new F.DB(); db.serial = true;
  var legacyBook = B.proposed(); legacyBook.enabled = true; db.seed('pricebook/' + legacyBook.version, legacyBook);
  db.seed(root, { name: 'Plan Example', status: 'active', domains: ['plan.example'] });
  db.seed(root + '/billing/current', { tier: 'standard', addons: [], toolOverrides: {}, paymentProvider: 'stripe' });
  db.seed(root + '/members/owner', { role: 'owner', status: 'active' });
  var oi = await req('POST', { action: 'opt-in', add: ['siteintel'] });
  equal(oi.requested, true); equal(oi.add, ['siteintel']); equal(oi.display, '$500/month'); equal(oi.optIns.siteintel.status, 'requested'); equal(oi.optIns.siteintel.requestedBy, owner.email);
  equal(bill().optIns.siteintel.display, '$500/month'); equal(bill().tier, 'standard', 'the plan itself is untouched');
  ok(Array.from(db.data.keys()).filter(function (p) { return p.indexOf(root + '/billing/current/history/optin-') === 0; }).length === 1, 'one history row');
  ok(Array.from(db.data.keys()).filter(function (p) { return p.indexOf(root + '/admin_audit/optin-') === 0; }).length === 1, 'one audit row');
  await refused(function () { return req('POST', { action: 'opt-in', add: ['siteintel'] }); }, /Already requested/);
  var oi2 = await req('POST', { action: 'opt-in', add: ['logic-plant'] });
  equal(oi2.add.slice().sort(), ['logic-office', 'logic-plant'], 'a Logic part brings Office when the workspace holds no Omega Logic');
  equal(Object.keys(bill().optIns).sort(), ['logic-office', 'logic-plant', 'siteintel']);
  await refused(function () { return req('POST', { action: 'opt-in', add: ['siteintel'] }, member); }, /workspace administrator/);
  var memberSummary = await req('GET', { orgId: orgId }, member); equal(memberSummary.packaged, false, 'a member reads the summary');
  await refused(function () { return req('GET', { orgId: orgId }, Object.assign({}, member, { claims: { email_verified: false } })); }, /Verified email/);
  db.data.delete(root + '/billing/current');
  await refused(function () { return req('POST', { action: 'opt-in', add: ['estimate'] }); }, /Billing is not set up/);
  ok(!db.data.has(root + '/billing/current'), 'a request never creates a billing record');
  seed(ev, 'field');
  await refused(function () { return req('POST', { action: 'opt-in', add: ['siteintel'] }); }, /subscription package/);
  await refused(function () { return req('POST', { action: 'opt-in', add: ['siteintel'], dryRun: true }); }, /subscription package/, 'the dry run refuses what the write would');

  /* ── The confirm panel, the undo and the opt-out on a legacy plan ─── */
  function legacy(extra) {
    db = new F.DB(); db.serial = true; sentMail = [];
    var bk = B.proposed(); bk.enabled = true; db.seed('pricebook/' + bk.version, bk);
    db.seed(root, { name: 'Plan Example', status: 'active', domains: ['plan.example'] });
    db.seed(root + '/billing/current', Object.assign({ tier: 'standard', addons: [], toolOverrides: {}, paymentProvider: 'stripe', toolAccess: ['editor', 'gridatlas'] }, extra || {}));
    db.seed(root + '/members/owner', { role: 'owner', status: 'active' });
  }
  function snapshot() { return B.stable(Array.from(db.data.entries())); }
  function rows(prefix) { return Array.from(db.data.keys()).filter(function (p) { return p.indexOf(prefix) === 0; }); }
  legacy();
  var s0 = snapshot(), dry = await req('POST', { action: 'opt-in', add: ['logic-plant'], dryRun: true });
  equal(snapshot(), s0, 'an opt-in dry run writes nothing'); equal(sentMail, [], 'and mails nobody');
  equal([dry.dryRun, dry.add.slice().sort(), dry.names.length, dry.monthlyCents > 0, /\/month$/.test(dry.display)], [true, ['logic-office', 'logic-plant'], 2, true, true], 'it names what it needs and its price');
  ok(/Nothing is charged before you approve that invoice/.test(dry.note) && /Plan Example/.test(dry.note), dry.note);
  var applied = await req('POST', { action: 'opt-in', add: ['logic-plant'] });
  equal(applied.monthlyCents, dry.monthlyCents, 'the request records the price the panel showed'); equal(sentMail.map(function (m) { return m.name; }), ['optInAlert']);
  await req('POST', { action: 'opt-in', add: ['siteintel'] });
  await refused(function () { return req('POST', { action: 'opt-in', add: ['siteintel'], dryRun: true }); }, /Already requested/);
  /* Cancel request: Office takes Plant with it; Site Intelligence stays */
  await refused(function () { return req('POST', { action: 'withdraw-opt-in', add: ['logic-office'] }, member); }, /workspace administrator/);
  var w1 = await req('POST', { action: 'withdraw-opt-in', add: ['logic-office'] });
  equal(w1.ok, true); equal(w1.withdrawn.slice().sort(), ['logic-office', 'logic-plant'], 'a request that needs it goes with it');
  equal([bill().optIns['logic-office'].status, bill().optIns['logic-plant'].status, bill().optIns.siteintel.status], ['withdrawn', 'withdrawn', 'requested']);
  equal([bill().optIns['logic-office'].withdrawnBy, bill().optIns['logic-office'].withdrawnAt], [owner.email, '2026-09-26']);
  equal(w1.optIns.siteintel.status, 'requested', 'the answer carries the whole map');
  equal([rows(root + '/billing/current/history/optin-withdrawn-').length, rows(root + '/admin_audit/optin-withdrawn-').length], [1, 1], 'history and audit');
  await refused(function () { return req('POST', { action: 'withdraw-opt-in', add: ['logic-office'] }); }, /No request to withdraw/);
  await refused(function () { return req('POST', { action: 'withdraw-opt-in', add: ['gridatlas'] }); }, /No request to withdraw/);
  await refused(function () { return req('POST', { action: 'withdraw-opt-in', add: ['lite'] }); }, /always included/);
  await refused(function () { return req('POST', { action: 'withdraw-opt-in', add: ['logic-plant', 'siteintel'] }); }, /No request to withdraw/, 'one closed request in the list refuses the whole call');
  equal(bill().optIns.siteintel.status, 'requested', 'and changes nothing');
  equal((await req('POST', { action: 'opt-in', add: ['logic-plant'] })).add.slice().sort(), ['logic-office', 'logic-plant'], 'a withdrawn request can be made again');
  equal(bill().tier, 'standard'); equal(bill().toolAccess, ['editor', 'gridatlas'], 'the plan itself is untouched throughout');

  /* Opt out: a request under the agreement, never a change to the plan */
  legacy({ addons: ['omega-logic'], optIns: { siteintel: { key: 'siteintel', status: 'requested', requestedAt: '2026-09-25' } } });
  var s1 = snapshot(), od = await req('POST', { action: 'opt-out', remove: ['plansets'], dryRun: true });
  equal(snapshot(), s1, 'an opt-out dry run writes nothing'); equal(sentMail, []);
  equal(od, { dryRun: true, remove: ['plansets'], names: [M.get('plansets').name],
    note: 'Your plan\'s price is set by your agreement, so nothing changes today. ClearSky confirms the effective date and any new price with you in writing; you keep access until then. Lite stays.' });
  var oc = await req('POST', { action: 'opt-out', remove: ['logic-office'], dryRun: true });
  equal(oc.remove, ['logic-office', 'logic-plant', 'logic-materials', 'logic-logistics', 'logic-customer'], 'Office takes every Omega Logic department with it');
  var oo = await req('POST', { action: 'opt-out', remove: ['plansets'], reason: '  Not using it  ' });
  equal([oo.ok, oo.requested, oo.remove, oo.names, oo.requestedAt, oo.note], [true, true, ['plansets'], [M.get('plansets').name], '2026-09-26', od.note]);
  equal(bill().optOuts.plansets, { key: 'plansets', name: M.get('plansets').name, requestedBy: owner.email, requestedAt: '2026-09-26', status: 'requested', reason: 'Not using it' });
  equal(oo.optOuts.plansets.status, 'requested');
  equal([bill().tier, bill().addons, bill().toolAccess, bill().optIns.siteintel.status], ['standard', ['omega-logic'], ['editor', 'gridatlas'], 'requested'], 'never touches tier, add-ons, the allowlist or an opt-in');
  equal([rows(root + '/billing/current/history/optout-').length, rows(root + '/admin_audit/optout-').length], [1, 1], 'history and audit');
  equal(sentMail.map(function (m) { return m.name; }), ['optOutAlert']); equal([sentMail[0].o.names, sentMail[0].o.reason, sentMail[0].o.tier], [[M.get('plansets').name], 'Not using it', 'standard']);
  await refused(function () { return req('POST', { action: 'opt-out', remove: ['plansets'] }); }, /Already requested/);
  await refused(function () { return req('POST', { action: 'opt-out', remove: ['lite'], dryRun: true }); }, /Lite is always included/);
  await refused(function () { return req('POST', { action: 'opt-out', remove: ['siteintel'], dryRun: true }); }, /That module is only requested: cancel the request instead\./);
  await refused(function () { return req('POST', { action: 'opt-out', remove: ['gridatlas'] }, member); }, /workspace administrator/);
  await req('POST', { action: 'opt-out', remove: ['logic-office'] });
  equal(Object.keys(bill().optOuts).sort(), ['logic-customer', 'logic-logistics', 'logic-materials', 'logic-office', 'logic-plant', 'plansets']);
  var summ = await req('GET', { orgId: orgId }, member);
  equal([Object.keys(summ.optOuts).length, summ.optIns.siteintel.status, summ.nextReviewOn], [6, 'requested', null], 'the summary carries both kinds of request; a legacy plan has no review date');
  /* Cancel request on an opt-out: keeping Plant keeps Office */
  await refused(function () { return req('POST', { action: 'withdraw-opt-out', remove: ['gridatlas'] }); }, /No request to withdraw/);
  var wo = await req('POST', { action: 'withdraw-opt-out', remove: ['logic-plant'] });
  equal(wo.withdrawn.slice().sort(), ['logic-office', 'logic-plant'], 'what it needs is kept too');
  equal(['logic-office', 'logic-plant', 'logic-materials', 'plansets'].map(function (k) { return wo.optOuts[k].status; }), ['withdrawn', 'withdrawn', 'requested', 'requested']);
  equal([rows(root + '/billing/current/history/optout-withdrawn-').length, rows(root + '/admin_audit/optout-withdrawn-').length], [1, 1]);
  /* no price book seeded yet: an opt-out prices nothing, so it still works,
     and so does the summary; an opt-in (which records a price) says why not */
  db.data.delete('pricebook/' + B.VERSION);
  equal((await req('POST', { action: 'opt-out', remove: ['gridatlas'] })).remove, ['gridatlas'], 'an opt-out needs no price book');
  equal((await req('GET', { orgId: orgId })).optOuts.gridatlas.status, 'requested', 'nor does the summary');
  equal((await req('POST', { action: 'withdraw-opt-out', remove: ['gridatlas'] })).withdrawn, ['gridatlas']);
  await refused(function () { return req('POST', { action: 'opt-in', add: ['estimate'], dryRun: true }); }, /Price book not seeded/);
  /* refusals that need their own record */
  legacy(); db.data.delete(root + '/billing/current');
  await refused(function () { return req('POST', { action: 'opt-out', remove: ['gridatlas'], dryRun: true }); }, /Billing is not set up for this workspace yet/);
  await refused(function () { return req('POST', { action: 'opt-in', add: ['estimate'], dryRun: true }); }, /Billing is not set up for this workspace yet/);
  await refused(function () { return req('POST', { action: 'withdraw-opt-in', add: ['estimate'] }); }, /No request to withdraw/);
  ok(!db.data.has(root + '/billing/current'), 'no request ever creates a billing record');
  seed(ev, 'field'); var s2 = snapshot();
  await refused(function () { return req('POST', { action: 'opt-out', remove: ['plansets'], dryRun: true }); }, /This workspace is on a subscription package: opt out through the menu, which queues it for the quarterly review\./);
  await refused(function () { return req('POST', { action: 'opt-out', remove: ['plansets'] }); }, /subscription package/);
  equal(snapshot(), s2, 'a packaged workspace is refused before anything is written');
  var packagedSummary = await req('GET', { orgId: orgId }); equal([packagedSummary.optIns, packagedSummary.optOuts], [{}, {}]);

  Date.now = realNow;
  console.log('Plan change: ' + count + ' passed; sandbox mock, no network.');
}
run().catch(function (e) { console.error(e); process.exitCode = 1; }).finally(function () { Q.driver = originalDriver; delete process.env.PACKAGING_BILLING_ENABLED; });
