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
var C = require('../api/_lib/plan-change'), api = require('../api/plan-change'), res = { setHeader: function () {} };
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
  equal(bill().packagingState, 'reconciliation_required', 'three in a row is a person\'s problem');
  delete failures['I-2026-09-20']; receipts['I-2026-09-20'] = { satisfied: true, reversed: false, paidCents: 1, payUrl: null };
  await S.reconcile(db, orgId, now, {}); equal(bill().packagingState, 'paid', 'and a good read clears it'); equal(db.data.get(root + '/billing/current/invoices/2026-09-20').reconcileRetries, 0);
  seed(ev, 'field'); failures['I-2026-09-20'] = 409; await S.reconcile(db, orgId, now, {});
  equal(bill().packagingState, 'reconciliation_required', 'a validation failure is reviewed at once'); delete failures['I-2026-09-20'];
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
  var rm = await req('POST', { action: 'request-removal', remove: ['plansets'], reason: 'Not using it' });
  equal(rm.removalRequests.map(function (r) { return r.module; }), ['plansets']); equal(mods(), evSorted, 'access unchanged');
  await refused(function () { return req('POST', { action: 'request-removal', remove: ['lite'] }); }, /always included/);
  await refused(function () { return req('POST', { action: 'request-removal', remove: ['siteintel'] }); }, /not in your package/);
  await refused(function () { return req('POST', { action: 'request-removal', remove: ['plansets'] }, member); }, /workspace administrator/);
  var rm2 = await req('POST', { action: 'request-removal', remove: ['plansets', 'gridatlas'] }); equal(rm2.removalRequests.length, 2, 'no duplicates');
  var wd = await req('POST', { action: 'withdraw-removal', remove: ['plansets'] }); equal(wd.removalRequests.map(function (r) { return r.module; }), ['gridatlas']);
  equal((await req('GET', { orgId: orgId })).removalRequests.length, 1);
  ok(Array.from(db.data.keys()).filter(function (p) { return p.indexOf('/admin_audit/removal-') >= 0; }).length === 3, 'every removal change is audited');

  Date.now = realNow;
  console.log('Plan change: ' + count + ' passed; sandbox mock, no network.');
}
run().catch(function (e) { console.error(e); process.exitCode = 1; }).finally(function () { Q.driver = originalDriver; delete process.env.PACKAGING_BILLING_ENABLED; });
