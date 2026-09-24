#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   scripts/test-accounting.js — the accounting page's rules and writes,
   end to end offline
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Why this exists: the live Amperage Capital order (PO CCUS-3V3I-0926) was
   run through the intake script with the template's placeholder payment
   still in it; the placeholder was recorded as USD 1,349,099.10 received and
   released the order to the plant. Only the PO had arrived. These tests pin
   the fix: a payment is VOIDED (never deleted) and the invoice is recomputed
   from what is not voided; a released order keeps building on its PO or is
   held; a placeholder can never be recorded again; release on PO, invoice
   edits and the receivables ledger; the per-workspace QuickBooks / Stripe
   sync through a stubbed api/_lib/ledger-sync.js.

   api/_lib/receivables.js (pure), api/_lib/office-stage.js,
   api/_lib/logic-workflow.js, api/logic-office.js and api/logic-accounting.js
   over the in-memory Firestore double. No network.
     node scripts/test-accounting.js
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var assert = require('node:assert/strict'), Module = require('module'), path = require('path');
var FD = require('./_lib/firestore-double'), DB = FD.DB, mock = FD.mock;

/* ── the Firestore double, refusing `undefined` the way the Admin SDK does ─ */
function noUndefined(v, where) {
  if (v === undefined) throw new Error('undefined written at ' + where);
  if (v && typeof v === 'object') Object.keys(v).forEach(function (k) { noUndefined(v[k], where + '.' + k); });
}
var realTx = DB.prototype.runTransaction;
DB.prototype.runTransaction = function (fn) {
  return realTx.call(this, function (tx) {
    return fn({ get: tx.get,
      create: function (r, v) { noUndefined(v, r.path); return tx.create(r, v); },
      set: function (r, v, o) { noUndefined(v, r.path); return tx.set(r, v, o); },
      update: function (r, v) { noUndefined(v, r.path); return tx.update(r, v); } });
  });
};
['set', 'update', 'create'].forEach(function (m) {
  var real = FD.Ref.prototype[m];
  FD.Ref.prototype[m] = function (v, o) { noUndefined(v, this.path); return real.call(this, v, o); };
});

var db;
var A = { db: function () { return db; }, safeOrg: function (v) { return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(v || '') ? v : ''; },
  httpError: function (s, m) { var e = new Error(m); e.status = s; return e; },
  authenticate: async function (req) { return req.caller; }, handler: function (fn) { return fn; },
  canActInOrg: async function (c, org) { return c.orgId === org || !!c.staff; },
  isTenantAdmin: async function (c, org) { return !!c.staff || c.orgId === org; },
  FieldValue: function () { return { serverTimestamp: function () { return '2026-09-24T12:00:00Z'; }, arrayUnion: function () { return { union: Array.from(arguments) }; } }; } };
mock('../api/_lib/admin', A);
/* ClearSky's QuickBooks is never reached for a tenant-billed order */
mock('../api/_lib/qbo-sales', { invoice: async function () { throw new Error('ClearSky QuickBooks called for a tenant-billed order'); },
  reconcile: async function () { throw new Error('ClearSky QuickBooks called for a tenant-billed order'); } });
mock('../api/_lib/qbo', { load: async function () { return { realmId: '123' }; } });

/* ── api/_lib/ledger-sync.js, stubbed (the hook wins whether or not the
   real module is in the tree) ──────────────────────────────────────────── */
var LS_CALLS = [], LS = { ready: true, pull: [], pushFail: null, pullFail: null, seq: 0 };
function provider(name) {
  function result(view, id) {
    return { provider: name, invoiceId: id, number: name === 'stripe' ? 'CCUS-' + id : view.invoice.number, customerId: name === 'stripe' ? 'cus_AMP' : '58',
      company: name === 'stripe' ? 'acct_1WORKSPACE' : '9130', hostedUrl: name === 'stripe' ? 'https://invoice.stripe.com/i/acct_1WORKSPACE/' + id : null,
      totalCents: view.invoice.amountCents, warning: LS.pushWarning || null };
  }
  return {
    missing: function () { return []; },
    ready: async function () { return LS.ready; },
    status: async function () { return { configured: true, missing: [], connected: LS.ready }; },
    connectUrl: async function (org, caller) { LS_CALLS.push({ fn: 'connect', provider: name, org: org, by: caller.email }); return { url: 'https://connect.example/' + name + '?state=f00d', setCookie: 'omega_ledger_state=f00d; Path=/api/ledger-connect; HttpOnly; Secure; SameSite=Lax; Max-Age=600' }; },
    disconnect: async function (org, caller) { LS_CALLS.push({ fn: 'disconnect', provider: name, org: org, by: caller.email }); return { ok: true }; },
    pushInvoice: async function (org, view, stage) {
      LS_CALLS.push({ fn: 'push', provider: name, org: org, view: view, stage: stage });
      if (LS.pushFail) { var e = new Error(LS.pushFail); e.status = 502; throw e; }
      return result(view, name === 'stripe' ? 'in_' + (++LS.seq) : String(140 + (++LS.seq)));
    },
    linkInvoice: async function (org, view, stage, id) { LS_CALLS.push({ fn: 'link', provider: name, org: org, view: view, stage: stage, id: id }); return result(view, id); },
    pullPayments: async function (org, view, stage) {
      LS_CALLS.push({ fn: 'pull', provider: name, org: org, view: view, stage: stage });
      if (LS.pullFail) { var e = new Error(LS.pullFail); e.status = 409; throw e; }
      return (typeof LS.pull === 'function' ? LS.pull(view, stage) : LS.pull).slice();
    }
  };
}
var LS_STUB = { PROVIDERS: ['quickbooks', 'stripe'], providers: { quickbooks: provider('quickbooks'), stripe: provider('stripe') },
  status: async function () {
    return { quickbooks: { configured: false, missing: ['QBO_CLIENT_ID', 'QBO_CLIENT_SECRET', 'QBO_WORKSPACE_REDIRECT_URI'], env: 'production', connectHost: null, connected: false, realmId: null, companyName: null, connectedAt: null, connectedBy: null, refreshExpiresAt: null, lastError: null },
      stripe: { configured: true, missing: [], connectHost: null, connected: LS.ready, accountId: 'acct_1WORKSPACE', livemode: false, connectedAt: null, connectedBy: null, webhook: true, lastError: null } };
  },
  finishConnect: async function () { throw new Error('not used here'); }, STATE_COOKIE: 'omega_ledger_state' };
var realResolve = Module._resolveFilename, LS_PATH = path.join(__dirname, '../api/_lib/ledger-sync.js');
Module._resolveFilename = function (request) { if (/(^|\/)ledger-sync(\.js)?$/.test(request)) return LS_PATH; return realResolve.apply(this, arguments); };
require.cache[LS_PATH] = { id: LS_PATH, filename: LS_PATH, loaded: true, exports: LS_STUB };

var R = require('../api/_lib/receivables'), S = require('../api/_lib/office-stage'), W = require('../api/_lib/logic-workflow');
var office = require('../api/logic-office'), accounting = require('../api/logic-accounting');

var ORG = 'cleancell.us', O = 'omega_orgs/' + ORG, DEP = 134909910, TOTAL = 149899900, BAL = TOTAL - DEP;
var PLACEHOLDER = 'REPLACE WITH THE BANK REFERENCE, or delete this payment if not yet received';
function person(email, extra) { return Object.assign({ uid: email.split('@')[0], email: email, orgId: email.split('@')[1], staff: false, claims: { email_verified: true } }, extra || {}); }
var OWNER = person('tom@clearsky-usa.com', { uid: 'tom', staff: true });
var ADMIN = person('office@cleancell.us'), MEMBER = person('floor@cleancell.us'), STRANGER = person('buyer@elsewhere.com');
var res = { headers: {}, setHeader: function (k, v) { this.headers[k] = v; } };
function call(api, method, body, caller) {
  res.headers = {};
  return api({ method: method, body: method === 'POST' ? Object.assign({ org: ORG }, body) : undefined,
    query: method === 'GET' ? Object.assign({ org: ORG }, body || {}) : {}, caller: caller || ADMIN }, res);
}
function post(api, body, caller) { return call(api, 'POST', body, caller); }
async function rejects(p, status, re) {
  try { await p; } catch (e) { assert.equal(e.status, status, e.message); if (re) assert.match(e.message, re); return e; }
  throw new Error('expected a ' + status + (re ? ' ' + re : ''));
}
function throwsStatus(fn, status, re) { try { fn(); } catch (e) { assert.equal(e.status, status, e.message); if (re) assert.match(e.message, re); return e; } throw new Error('expected a ' + status); }
function order(id) { return db.data.get('orders/' + (id || 'amp')); }
function dep(id) { return order(id).logic.invoices.deposit; }
function keys(prefix) { return Array.from(db.data.keys()).filter(function (k) { return k.indexOf(prefix) === 0; }); }
function events(id) { return keys('orders/' + (id || 'amp') + '/events/').map(function (k) { return db.data.get(k).what; }); }
function audits(action) { return keys('omega_audit/').map(function (k) { return db.data.get(k); }).filter(function (r) { return !action || r.action === action; }); }
var count = 0; async function test(name, fn) { await fn(); count++; console.log('PASS ' + name); }

function seed(opts) {
  opts = opts || {};
  db = new DB(); LS_CALLS.length = 0; LS.ready = true; LS.pull = []; LS.pushFail = null; LS.pullFail = null;
  db.seed(O, { name: 'Clean Cell', status: 'active', vertical: 'oem' });
  db.seed(O + '/billing/current', { addons: ['omega-logic'] });
  db.seed(O + '/fulfillment/config', Object.assign({ enabled: true, accounting: 'tenant', terms: { depositPct: 90, dueDays: 0 }, fee: { percent: 0.25, fixed: 0 } }, opts.config || {}));
  db.seed(O + '/members/office', { email: ADMIN.email, role: 'admin', status: 'active' });
  db.seed(O + '/members/floor', { email: MEMBER.email, role: 'member', status: 'active' });
  db.seed(O + '/customers/c1', { orgId: ORG, name: 'Amperage Capital', accountType: 'company', domain: 'amperagecapital.com', status: 'active', terms: { depositPct: 90, dueDays: opts.dueDays || 0 } });
  db.seed(O + '/customers/c1/users/shannon@amperagecapital.com', { email: 'shannon@amperagecapital.com', role: 'owner', status: 'active' });
  db.seed(O + '/customers/c1/users/ap@amperagecapital.com', { email: 'ap@amperagecapital.com', role: 'user', status: 'active' });
  db.seed(O + '/customer_index/shannon@amperagecapital.com', { customerId: 'c1' });
  db.seed(O + '/customer_index/ap@amperagecapital.com', { customerId: 'c1' });
  db.seed('orders/amp', { orgId: ORG, orderNo: 'CC-26-0926', status: 'new', createdAt: '2026-09-22T10:00:00Z', purchaseOrder: { number: 'CCUS-3V3I-0926' }, customerId: 'c1',
    customer: { name: 'Shannon Johnson', company: 'Amperage Capital', email: 'shannon@amperagecapital.com' }, items: [{ sku: 'R60', name: 'R60 skid', qty: opts.qty || 56 }] });
}
async function priced(id) { await post(office, { action: 'price', orderId: id || 'amp', total: 1498999, accept: true }, OWNER); }
async function issued(id, stage, number, date, extra) { return post(office, Object.assign({ action: 'invoice-issued', orderId: id || 'amp', stage: stage || 'deposit', number: number || 'CCUS-3V3I-0926-01 Rev B', date: date || '2026-09-23' }, extra || {})); }
async function paid(ref, amount, date, stage, id, extra) { return post(office, Object.assign({ action: 'payment-received', orderId: id || 'amp', stage: stage || 'deposit', amount: amount == null ? DEP / 100 : amount, date: date || '2026-10-02', bankReference: ref }, extra || {})); }
function readyUnits(n, id) {
  for (var i = 1; i <= n; i++) db.seed('plant_units/' + ORG + '__U' + i, { orgId: ORG, orderId: id || 'amp', woId: 'wo_' + (id || 'amp'), serial: 'U' + i, rootSerial: 'U' + i, sku: 'R60', unitType: 'cabinet', shipUnit: true, parentSerial: null, at: 'ready', test: { result: 'pass' }, hold: null, ncr: null });
}

/* a pure order for the plan tests */
function inv(extra) { return Object.assign({ amountCents: 100000, id: 'INV-1', issuedAt: '2026-09-01', date: '2026-09-01', payments: [] }, extra || {}); }
function pay(ref, cents, extra) { return Object.assign({ amountCents: cents, date: '2026-09-02', bankReference: ref, by: 'a@b.co', at: '2026-09-02T10:00:00Z' }, extra || {}); }
function tenantOrder(logic, extra) {
  return Object.assign({ orderNo: 'CC-1', status: 'accepted', purchaseOrder: { number: 'PO-77' }, customer: { name: 'Buyer', email: 'Buyer@Example.com', company: 'Buyer Co' },
    logic: Object.assign({ accounting: 'tenant', acceptedAt: '2026-08-30', commercial: { terms: { depositPct: 50, dueDays: 10 } }, invoices: { deposit: inv() } }, logic || {}) }, extra || {});
}
var AT = '2026-09-24T12:00:00Z', BY = 'office@cleancell.us';

async function main() {
  /* ───────────────────────── pure rules: api/_lib/receivables.js ───────── */
  await test('settle recomputes paid, balance, satisfied and status from payments that are not voided', function () {
    assert.deepEqual(R.settle(inv({ payments: [pay('ACH 1', 60000), pay('ACH 2', 40000, { voidedAt: AT, voidedBy: BY, voidReason: 'bounced', voidSource: 'office' })] })),
      { paidCents: 60000, balanceCents: 40000, satisfied: false, status: 'part_paid' });
    assert.equal(R.settle(inv({ payments: [pay('ACH 1', 100000)] })).status, 'paid');
    assert.equal(R.settle(inv({ payments: [pay('ACH 1', 100000, { voidedAt: AT })] })).status, 'awaiting_payment');
    assert.equal(R.settle(inv({ id: null, payments: [] })).status, 'to_issue');
    assert.deepEqual(R.settle({ amountCents: 0 }), { paidCents: 0, balanceCents: 0, satisfied: true, status: 'not_required' });
  });
  await test('refKey folds case and spacing; the Amperage placeholder is a placeholder; qbo: and stripe: are reserved', function () {
    assert.equal(R.refKey('  ach   4471 '), R.refKey('ACH 4471'));
    assert.equal(R.isPlaceholder(PLACEHOLDER), true);
    ['TBD', 'n/a', 'XXXX', '0000', 'pending wire', 'not yet received'].forEach(function (r) { assert.equal(R.isPlaceholder(r), true, r); });
    ['ACH 4471', 'ACH 9', 'FEDWIRE 20261002-8841', 'qbo:88'].forEach(function (r) { assert.equal(R.isPlaceholder(r), false, r); });
    assert.equal(R.reservedSource('qbo:88'), 'quickbooks'); assert.equal(R.reservedSource('STRIPE:ch_1'), 'stripe'); assert.equal(R.reservedSource('ACH 1'), null);
    assert.equal(R.poOf({ purchaseOrder: { number: 'A' }, poNumber: 'B' }), 'A'); assert.equal(R.poOf({ poIntake: { number: 'C' } }), 'C'); assert.equal(R.poOf({}), null);
    assert.equal(R.clean('  a\u0000b\u0007c  ', 2), 'ab');
    assert.equal(R.isDate('2026-09-24'), true); assert.equal(R.isDate('24/09/2026'), false); assert.equal(R.isDate(''), false);
  });
  await test('voidPlan: a released deposit needs a choice; keep building records a credit release; hold sets the exception', function () {
    var o = tenantOrder({ releasedAt: '2026-09-03', invoices: { deposit: inv({ payments: [pay('ACH 1', 100000)] }) } }, { status: 'in_fulfilment' });
    throwsStatus(function () { R.voidPlan(o, 'deposit', { bankReference: 'ach 1', reason: 'no', by: BY, at: AT, source: 'office' }); }, 400, /Say why this payment is being voided/);
    throwsStatus(function () { R.voidPlan(o, 'deposit', { bankReference: 'ach 1', reason: 'Bounced by the bank', by: BY, at: AT, source: 'office' }); }, 409, /keep building on the PO, or hold/);
    throwsStatus(function () { R.voidPlan(o, 'deposit', { bankReference: 'ACH 404', reason: 'Bounced by the bank', keepBuilding: true, by: BY, at: AT, source: 'office' }); }, 404, /No recorded payment with bank reference ACH 404/);
    var keep = R.voidPlan(o, 'deposit', { bankReference: 'ACH 1', reason: 'Bounced by the bank', keepBuilding: true, by: BY, at: AT, source: 'office' });
    assert.equal(keep.needsChoice, true); assert.equal(keep.hold, null);
    assert.deepEqual(keep.invoice.payments[0], Object.assign(pay('ACH 1', 100000), { voidedAt: AT, voidedBy: BY, voidReason: 'Bounced by the bank', voidSource: 'office' }));
    assert.equal(keep.invoice.status, 'awaiting_payment'); assert.equal(keep.invoice.paidCents, 0); assert.equal(keep.invoice.balanceCents, 100000); assert.equal(keep.invoice.satisfied, false);
    assert.deepEqual(keep.creditRelease, { by: BY, at: AT, reason: 'Bounced by the bank', poNumber: 'PO-77', basis: 'void', voidedReference: 'ACH 1', openCents: 100000 });
    assert.match(keep.event, /kept building on PO PO-77/);
    var hold = R.voidPlan(o, 'deposit', { bankReference: 'ACH 1', reason: 'Bounced by the bank', keepBuilding: false, by: BY, at: AT, source: 'office' });
    assert.equal(hold.creditRelease, null); assert.equal(hold.hold.stage, 'deposit'); assert.equal(hold.hold.reference, 'ACH 1'); assert.equal(hold.hold.source, 'office');
    assert.equal(hold.hold.message, 'Payment ACH 1 on the deposit invoice was voided (Bounced by the bank). Fulfilment is on hold until the payment is recorded or the order is released on its PO.');
    assert.match(hold.event, /order on hold/);
    /* not in the plant yet: no choice, nothing else changes; already voided: a duplicate */
    var early = R.voidPlan(tenantOrder({ invoices: { deposit: inv({ payments: [pay('ACH 1', 100000)] }) } }), 'deposit', { bankReference: 'ACH 1', reason: 'Bounced by the bank', by: BY, at: AT, source: 'office' });
    assert.equal(early.needsChoice, false); assert.equal(early.creditRelease, null); assert.equal(early.hold, null);
    assert.equal(R.voidPlan({ logic: Object.assign({}, o.logic, { invoices: { deposit: keep.invoice } }), status: 'in_fulfilment' }, 'deposit', { bankReference: 'ACH 1', reason: 'again and again', by: BY, at: AT, source: 'office' }).duplicate, true);
  });
  await test('voidPlan from a provider holds by default and never asks', function () {
    var o = tenantOrder({ releasedAt: '2026-09-03', invoices: { deposit: inv({ payments: [pay('qbo:88', 100000, { source: 'quickbooks' })] }) } }, { status: 'in_fulfilment' });
    var p = R.voidPlan(o, 'deposit', { bankReference: 'qbo:88', by: 'quickbooks-sync', at: AT, source: 'quickbooks' });
    assert.equal(p.creditRelease, null); assert.equal(p.hold.source, 'quickbooks'); assert.equal(p.voided.voidReason, 'Reversed in QuickBooks'); assert.equal(p.voided.voidSource, 'quickbooks');
    var s = R.voidPlan(o, 'deposit', { bankReference: 'qbo:88', by: 'stripe-sync', at: AT, source: 'stripe', keepBuilding: true });
    assert.equal(s.creditRelease, null, 'a provider cannot choose to keep building'); assert(s.hold); assert.equal(s.voided.voidReason, 'Refunded or lost dispute in Stripe');
    /* already released on PO: the provider's void neither asks nor holds */
    var onPo = R.voidPlan(tenantOrder({ releasedAt: '2026-09-03', creditRelease: { by: BY, at: AT, reason: 'on PO', basis: 'po' }, invoices: o.logic.invoices }, { status: 'in_fulfilment' }), 'deposit', { bankReference: 'qbo:88', by: 'quickbooks-sync', at: AT, source: 'quickbooks' });
    assert.equal(onPo.hold, null); assert.equal(onPo.needsChoice, false);
  });
  await test('recordPlan: a voided reference is refused unless reinstated with a reason; a placeholder is refused always', function () {
    var voided = pay('ACH 1', 100000, { voidedAt: '2026-09-05T10:00:00Z', voidedBy: BY, voidReason: 'Bounced by the bank', voidSource: 'office' });
    var o = tenantOrder({ invoices: { deposit: inv({ payments: [voided] }) } });
    var base = { amountCents: 100000, date: '2026-09-06', bankReference: 'ach  1', by: BY, at: AT, source: 'office' };
    throwsStatus(function () { R.recordPlan(o, 'deposit', base); }, 409, /Bank reference ach\s+1 was recorded 2026-09-02 and voided 2026-09-05 \(Bounced by the bank\)\. If that money has really landed, record it again with "reinstate" and say why\./);
    throwsStatus(function () { R.recordPlan(o, 'deposit', Object.assign({}, base, { reinstate: true, reason: 'ok' })); }, 400, /Say why a voided reference is being recorded again/);
    throwsStatus(function () { R.recordPlan(o, 'deposit', Object.assign({}, base, { bankReference: 'qbo:1', source: 'office' })); }, 400, /written by the ledger sync/);
    var back = R.recordPlan(o, 'deposit', Object.assign({}, base, { reinstate: true, reason: 'The bank re-presented it on the 6th' }));
    assert.equal(back.entry.reinstates, 0); assert.equal(back.entry.reinstateReason, 'The bank re-presented it on the 6th'); assert.equal(back.invoice.payments.length, 2);
    assert.equal(back.invoice.status, 'paid'); assert.match(back.event, /reinstated \(it was voided 2026-09-05\): The bank re-presented it on the 6th/);
    /* the sync never reinstates */
    var qo = tenantOrder({ invoices: { deposit: inv({ payments: [pay('qbo:88', 100000, { source: 'quickbooks', voidedAt: '2026-09-05T10:00:00Z', voidReason: 'Reversed in QuickBooks' })] }) } });
    throwsStatus(function () { R.recordPlan(qo, 'deposit', Object.assign({}, base, { bankReference: 'qbo:88', source: 'quickbooks', reinstate: true, reason: 'the sync says so' })); }, 409, /qbo:88 was voided in Omega Logic on 2026-09-05; not recorded again/);
    [PLACEHOLDER, 'TBD wire', 'XXXXXX'].forEach(function (ref) {
      throwsStatus(function () { R.recordPlan(tenantOrder(), 'deposit', Object.assign({}, base, { bankReference: ref, reinstate: true, reason: 'I promise it landed' })); }, 400, /is a placeholder/);
    });
    var dup = R.recordPlan(tenantOrder({ invoices: { deposit: inv({ payments: [pay('ACH 7', 1000)] }) } }), 'deposit', Object.assign({}, base, { bankReference: ' ach 7 ' }));
    assert.equal(dup.duplicate, true);
    throwsStatus(function () { R.recordPlan(tenantOrder({ paymentException: 'Cancellation requested' }), 'deposit', base); }, 409, /Resolve the order exception first/);
    var held = tenantOrder({ paymentException: 'Payment ACH 1 … on hold', paymentHold: { stage: 'deposit', reference: 'ACH 1' } });
    var lift = R.recordPlan(held, 'deposit', Object.assign({}, base, { bankReference: 'ACH 2' }));
    assert.equal(lift.liftHold, true); assert.match(lift.event, /; hold lifted$/);
    throwsStatus(function () { R.recordPlan(tenantOrder(), 'deposit', Object.assign({}, base, { bankReference: 'ACH 3', amountCents: 100001 })); }, 400, /exceed the invoice/);
    throwsStatus(function () { R.recordPlan(tenantOrder({ accounting: 'quickbooks' }), 'deposit', base); }, 409, /billed through QuickBooks; payments are reconciled there/);
  });
  await test('releasePlan: preconditions, duplicates, and the hold it lifts', function () {
    var v = { reason: 'PO received; credit approved', by: BY, at: AT };
    throwsStatus(function () { R.releasePlan(tenantOrder({ accounting: 'quickbooks' }), v); }, 409, /Release on PO is for orders the OEM invoices itself/);
    throwsStatus(function () { R.releasePlan(tenantOrder({ acceptedAt: null }), v); }, 409, /Accept the order first/);
    throwsStatus(function () { R.releasePlan(tenantOrder({}, { cancelRequested: true }), v); }, 409, /cancelled or has a cancellation request/);
    throwsStatus(function () { R.releasePlan(tenantOrder({ invoices: { deposit: { amountCents: 0 } } }), v); }, 409, /No deposit is due/);
    throwsStatus(function () { R.releasePlan(tenantOrder({ invoices: { deposit: inv({ payments: [pay('ACH 1', 100000)] }) } }), v); }, 409, /The deposit is recorded/);
    throwsStatus(function () { R.releasePlan(tenantOrder(), { reason: 'x', by: BY, at: AT }); }, 400, /Say why the plant may start/);
    var p = R.releasePlan(tenantOrder({ invoices: { deposit: inv({ payments: [pay('ACH 1', 30000)] }) } }), v);
    assert.deepEqual(p.creditRelease, { by: BY, at: AT, reason: 'PO received; credit approved', poNumber: 'PO-77', basis: 'po', openCents: 70000 });
    assert.equal(p.liftHold, false); assert.equal(p.event, 'Released on PO PO-77 before the deposit was received — PO received; credit approved');
    assert.equal(R.releasePlan(tenantOrder({ creditRelease: p.creditRelease }), v).duplicate, true);
    var held = R.releasePlan(tenantOrder({ releasedAt: '2026-09-03', paymentHold: { stage: 'deposit' }, paymentException: 'on hold' }), Object.assign({ poNumber: 'PO-78' }, v));
    assert.equal(held.creditRelease.basis, 'hold-lifted'); assert.equal(held.creditRelease.poNumber, 'PO-78'); assert.equal(held.liftHold, true); assert.match(held.event, /; hold lifted$/);
    throwsStatus(function () { R.releasePlan(tenantOrder({ paymentException: 'Cancellation requested' }), v); }, 409, /Resolve the order exception first/);
  });
  await test('editPlan: history of what changed, derived due date, provider-linked invoices refuse', function () {
    var o = tenantOrder({ invoices: { deposit: inv(), balance: inv({ id: 'INV-2' }) } });
    var v = { reason: 'Customer agreed net 30', by: BY, at: AT };
    var p = R.editPlan(o, 'deposit', Object.assign({ dueAt: '2026-10-01' }, v));
    assert.deepEqual(p.edit, { at: AT, by: BY, reason: 'Customer agreed net 30', was: { dueAt: null }, now: { dueAt: '2026-10-01' } });
    assert.equal(p.invoice.dueAt, '2026-10-01'); assert.equal(p.invoice.edits.length, 1); assert.equal(p.invoice.status, o.logic.invoices.deposit.status);
    assert.equal(p.event, 'deposit invoice edited: due terms (2026-09-11) → 2026-10-01 — Customer agreed net 30');
    var back = R.editPlan({ logic: Object.assign({}, o.logic, { invoices: { deposit: p.invoice } }) }, 'deposit', Object.assign({ dueAt: '' }, v));
    assert.equal(back.invoice.dueAt, null); assert.equal(R.dueDate(back.invoice, o.logic.commercial.terms), '2026-09-11'); assert.equal(back.invoice.edits.length, 2);
    var n = R.editPlan(o, 'deposit', Object.assign({ number: 'INV-1 Rev B', issuedAt: '2026-09-02' }, v));
    assert.deepEqual(n.edit.was, { number: 'INV-1', issuedAt: '2026-09-01' }); assert.equal(n.event, 'deposit invoice edited: number INV-1 → INV-1 Rev B; issued 2026-09-01 → 2026-09-02 — Customer agreed net 30');
    assert.equal(R.editPlan(o, 'deposit', Object.assign({ number: 'INV-1' }, v)).duplicate, true);
    throwsStatus(function () { R.editPlan(o, 'deposit', Object.assign({ number: 'INV-2' }, v)); }, 409, /Invoice INV-2 is already the balance invoice on this order/);
    throwsStatus(function () { R.editPlan(o, 'deposit', Object.assign({ dueAt: '2026-08-01' }, v)); }, 400, /cannot be before the invoice date/);
    throwsStatus(function () { R.editPlan(o, 'deposit', Object.assign({ issuedAt: '09/01/2026' }, v)); }, 400, /Invoice date must be YYYY-MM-DD/);
    throwsStatus(function () { R.editPlan(o, 'deposit', { dueAt: '2026-10-01', reason: 'no', by: BY, at: AT }); }, 400, /Say why the invoice is being changed/);
    throwsStatus(function () { R.editPlan(tenantOrder({ invoices: { deposit: inv({ ledger: { provider: 'stripe', invoiceId: 'in_1' } }) } }), 'deposit', Object.assign({ dueAt: '2026-10-01' }, v)); }, 409, /This invoice is in Stripe \(in_1\); change it there/);
    throwsStatus(function () { R.editPlan(tenantOrder({ invoices: { deposit: inv({ id: null }) } }), 'deposit', Object.assign({ dueAt: '2026-10-01' }, v)); }, 409, /Record the deposit invoice as issued first/);
    throwsStatus(function () { R.editPlan(tenantOrder({ accounting: 'quickbooks' }), 'deposit', v); }, 409, /edit the invoice there/);
  });
  await test('aging: days overdue and buckets from the explicit or derived due date', function () {
    assert.equal(R.daysBetween('2026-09-23', '2026-09-24'), 1); assert.equal(R.daysBetween('2026-09-24', '2026-09-23'), -1); assert.equal(R.daysBetween('2026-02-28', '2026-03-01'), 1);
    [[0, 'current'], [-5, 'current'], [1, '1-30'], [30, '1-30'], [31, '31-60'], [60, '31-60'], [61, '61-90'], [90, '61-90'], [91, '90+']].forEach(function (c) { assert.equal(R.bucket(c[0]), c[1], String(c[0])); });
    assert.equal(R.dueDate(inv(), { dueDays: 10 }), '2026-09-11'); assert.equal(R.dueDate(inv({ dueAt: '2026-12-01' }), { dueDays: 10 }), '2026-12-01');
    assert.equal(R.dueDate(inv({ issuedAt: null }), null), '2026-09-01'); assert.equal(R.dueDate(inv({ id: null, issuedAt: null }), { dueDays: 10 }), null);
    var rows = R.rows([{ id: 'x', order: tenantOrder({ invoices: { deposit: inv(), balance: inv({ id: 'INV-2', dueAt: '2026-12-01' }) } }), account: null }], '2026-10-15', { provider: 'none' });
    assert.equal(rows[0].dueAt, '2026-09-11'); assert.equal(rows[0].daysOverdue, 34); assert.equal(rows[0].bucket, '31-60'); assert.equal(rows[0].overdue, true); assert.equal(rows[0].dueAtSet, false);
    assert.equal(rows[1].overdue, false); assert.equal(rows[1].bucket, 'current'); assert.equal(rows[1].dueAtSet, true);
  });
  await test('ledger rows, filters and totals per bucket and per customer account; CSV header, escaping and formula neutralising', function () {
    var a = tenantOrder({ releasedAt: '2026-09-03', creditRelease: { by: BY, at: AT, reason: 'on PO', poNumber: 'PO-77', basis: 'void' },
      invoices: { deposit: inv({ payments: [pay('ACH 1', 100000, { voidedAt: AT, voidedBy: BY, voidReason: 'never arrived', voidSource: 'office' })] }) } }, { status: 'in_fulfilment' });
    var b = tenantOrder({ invoices: { deposit: inv({ id: 'INV-9', payments: [pay('ACH 9', 100000)] }), balance: inv({ id: null, amountCents: 50000, issuedAt: null }) } }, { orderNo: 'CC-2', customer: { name: 'Pat', email: 'Pat@Other.example', company: 'Other Co' } });
    var c = tenantOrder({}, { poIntake: { number: 'P' } });
    var entries = [{ id: 'a', order: a, account: { id: 'c1', name: 'Amperage Capital' } }, { id: 'b', order: b, account: null }, { id: 'c', order: c, account: null }];
    var all = R.rows(entries, '2026-10-15', { provider: 'stripe' });
    assert.deepEqual(all.map(function (r) { return r.key; }), ['a:deposit', 'b:deposit', 'b:balance']);
    var r0 = all[0];
    assert.deepEqual(r0.customer, { key: 'account:c1', customerId: 'c1', name: 'Amperage Capital', contact: 'Buyer', email: 'Buyer@Example.com' });
    assert.equal(r0.releasedOnPo, true); assert.equal(r0.receivedCents, 0); assert.equal(r0.payments[0].voided, true); assert.equal(r0.payments[0].source, 'office');
    assert.equal(r0.actions.void, false); assert.equal(r0.actions.record, true); assert.equal(r0.actions.push, true); assert.equal(r0.actions.pull, false); assert.equal(r0.actions.releaseOnPo, false);
    assert.equal(all[1].customer.key, 'email:pat@other.example'); assert.equal(all[1].customer.name, 'Other Co'); assert.equal(all[2].status, 'to_issue'); assert.equal(all[2].actions.issue, true);
    var t = R.totals(all);
    assert.equal(t.invoicedCents, 200000); assert.equal(t.receivedCents, 100000); assert.equal(t.outstandingCents, 100000); assert.equal(t.overdueCents, 100000); assert.equal(t.overdueCount, 1);
    assert.equal(t.toIssueCents, 50000); assert.equal(t.voidedCents, 100000); assert.equal(t.creditReleasedCents, 100000); assert.equal(t.aging['31-60'], 100000);
    assert.deepEqual(t.byCustomer.map(function (x) { return [x.key, x.outstandingCents]; }), [['account:c1', 100000], ['email:pat@other.example', 0]]);
    assert.equal(R.filter(all, { status: 'open' }).length, 1); assert.equal(R.filter(all, { status: 'paid' }).length, 1); assert.equal(R.filter(all, { status: 'to_issue' }).length, 1);
    assert.equal(R.filter(all, { customer: 'account:c1' }).length, 1); assert.equal(R.filter(all, { overdue: true }).length, 1);
    var led = R.ledger(entries, '2026-10-15', { status: 'all', customer: 'account:c1' }, { provider: 'stripe' });
    assert.equal(led.rows.length, 1); assert.equal(led.allCount, 3); assert.equal(led.filtered, true); assert.equal(led.customers.length, 2);
    var csv = R.csv(all), lines = csv.split('\r\n');
    assert.equal(lines[0], 'Order,PO,Customer,Customer key,Stage,Invoice,Issued,Due,Amount USD,Received USD,Balance USD,Status,Days overdue,Aging,Released on PO,Payments');
    assert.match(lines[1], /,1000\.00,0\.00,1000\.00,/); assert.match(lines[1], /2026-09-02 USD 1000\.00 ACH 1 \(VOIDED: never arrived\)/);
    var hostile = R.csv(R.rows([{ id: 'b', order: tenantOrder({}, { customer: { company: '=HYPERLINK("x"),Inc', email: 'a@b.co' } }), account: null }], '2026-10-15', {}));
    assert(hostile.indexOf('"\'=HYPERLINK(""x""),Inc"') >= 0, hostile);
  });

  /* ───────────────────────── the Amperage order, end to end ───────────── */
  var WO, UNITS;
  await test('THE AMPERAGE ORDER: the placeholder released the plant; void with keep-building puts received back to zero and keeps building', async function () {
    seed(); await priced();
    assert.equal(order().logic.commercial.depositCents, DEP);
    await issued();
    await rejects(paid(PLACEHOLDER, DEP / 100, '2026-09-24'), 400, /placeholder/);
    /* the production state exactly as the old code wrote it */
    var o = order(); o.logic.invoices.deposit = Object.assign({}, o.logic.invoices.deposit, { payments: [{ amountCents: DEP, date: '2026-09-24', bankReference: PLACEHOLDER, by: OWNER.email, at: '2026-09-24T15:00:00Z' }],
      paidCents: DEP, satisfied: true, balanceCents: 0, status: 'paid' }); db.seed('orders/amp', o);
    await W.processOrder('amp');
    assert.equal(order().status, 'in_fulfilment'); assert.equal(order().worksOrderId, 'wo_amp');
    for (var i = 1; i <= 56; i++) db.seed('plant_units/' + ORG + '__AMP-' + String(i).padStart(3, '0'), { orgId: ORG, woId: 'wo_amp', orderId: 'amp', orderNo: 'CC-26-0926', serial: 'AMP-' + String(i).padStart(3, '0'), sku: 'R60', shipUnit: true, at: 'assembly', test: null });
    WO = FD.clone(db.data.get('plant_works_orders/wo_amp')); UNITS = keys('plant_units/').map(function (k) { return FD.clone(db.data.get(k)); });
    var releasedAt = order().logic.releasedAt;
    var body = { action: 'payment-void', orderId: 'amp', stage: 'deposit', bankReference: PLACEHOLDER, reason: 'Recorded by the intake script from the template; the money has not been received — only the PO' };
    await rejects(post(office, body), 409, /keep building on the PO, or hold/);
    var out = await post(office, Object.assign({ keepBuilding: true, poNumber: 'CCUS-3V3I-0926' }, body));
    var d = dep();
    assert.equal(d.status, 'awaiting_payment'); assert.equal(d.paidCents, 0); assert.equal(d.balanceCents, DEP); assert.equal(d.satisfied, false);
    assert.equal(d.payments.length, 1); assert.equal(d.payments[0].bankReference, PLACEHOLDER);
    assert.equal(d.payments[0].voidedBy, ADMIN.email); assert.equal(d.payments[0].voidSource, 'office'); assert.match(d.payments[0].voidReason, /only the PO/); assert(d.payments[0].voidedAt);
    var cr = order().logic.creditRelease;
    assert.equal(cr.basis, 'void'); assert.equal(cr.poNumber, 'CCUS-3V3I-0926'); assert.equal(cr.openCents, DEP); assert.equal(cr.voidedReference, PLACEHOLDER); assert.equal(cr.by, ADMIN.email);
    assert.equal(order().status, 'in_fulfilment'); assert.equal(order().logic.releasedAt, releasedAt); assert.equal(order().worksOrderId, 'wo_amp');
    assert.deepEqual(db.data.get('plant_works_orders/wo_amp'), WO); assert.deepEqual(keys('plant_units/').map(function (k) { return db.data.get(k); }), UNITS);
    assert.equal(order().logic.paymentException || null, null); assert.equal(order().logic.paymentHold || null, null);
    assert.equal(out.order.creditRelease.basis, 'void'); assert.equal(out.order.status, 'in_fulfilment');
    assert(events().some(function (w) { return /voided by office@cleancell\.us — .*kept building on PO CCUS-3V3I-0926/.test(w); }));
    var a = audits('ledger-payment-void'); assert.equal(a.length, 1); assert.equal(a[0].orderId, 'amp'); assert.equal(a[0].before.paidCents, DEP); assert.equal(a[0].after.paidCents, 0); assert.equal(a[0].before.entry.voidedAt, undefined);
    /* the dashboard (omega-logic.html sums amountCents / paidCents) and the office header */
    var g = await call(office, 'GET', {}, ADMIN), invd = 0, rcvd = 0;
    g.orders.forEach(function (x) { Object.keys(x.logic.invoices).forEach(function (k) { invd += x.logic.invoices[k].amountCents || 0; rcvd += x.logic.invoices[k].paidCents || 0; }); });
    assert.equal(invd, DEP); assert.equal(rcvd, 0); assert.equal(invd - rcvd, DEP);
    assert.equal(g.totals.paidCents, 0); assert.equal(g.finance.recordedCents, 0);
    assert.equal(g.orders[0].stage.label, 'Released on PO'); assert.equal(g.orders[0].stage.credit, true);
    /* the accounting page */
    var acc = await call(accounting, 'GET', {}, ADMIN), row = acc.rows[0];
    assert.equal(acc.rows.length, 1); assert.equal(row.releasedOnPo, true); assert.equal(row.payments[0].voided, true); assert.equal(row.receivedCents, 0);
    assert.equal(row.customer.name, 'Amperage Capital'); assert.equal(row.customer.key, 'account:c1'); assert.equal(row.poNumber, 'CCUS-3V3I-0926');
    assert.equal(acc.totals.invoicedCents, DEP); assert.equal(acc.totals.receivedCents, 0); assert.equal(acc.totals.outstandingCents, DEP);
    assert.equal(acc.totals.creditReleasedCents, DEP); assert.equal(acc.totals.voidedCents, DEP);
    assert.equal(row.overdue, R.daysBetween('2026-09-23', acc.today) > 0); assert.equal(row.bucket, R.bucket(R.daysBetween('2026-09-23', acc.today)));
    assert.equal(row.actions.void, false); assert.equal(row.actions.record, true); assert.equal(row.actions.releaseOnPo, false);
  });
  await test('  then the real wire with a real reference pays the deposit, and the placeholder can never come back', async function () {
    var out = await paid('FEDWIRE 20261002-8841', 1349099.10, '2026-10-02');
    assert.equal(out.invoice.status, 'paid'); assert.equal(out.invoice.satisfied, true); assert.equal(dep().paidCents, DEP);
    assert.equal(keys('plant_works_orders/').length, 1); assert.equal(order().logic.lastError, null); assert.equal(order().logic.creditRelease.basis, 'void');
    assert.equal(S.stageOf(order()).credit, undefined); assert.equal(S.creditOpen(order()), 0);
    await rejects(paid(PLACEHOLDER, 1, '2026-10-03'), 400, /placeholder/);
    await rejects(paid(PLACEHOLDER, 1, '2026-10-03', 'deposit', 'amp', { reinstate: true, reason: 'It really did land this time' }), 400, /placeholder/);
    await post(office, { action: 'payment-void', orderId: 'amp', stage: 'deposit', bankReference: 'fedwire 20261002-8841', reason: 'Recalled by the sending bank' });
    assert.equal(dep().status, 'awaiting_payment'); assert.equal(order().logic.paymentHold || null, null, 'already on PO credit: no choice, no hold');
    await rejects(paid('FEDWIRE 20261002-8841'), 409, /voided/);
    await rejects(paid('FEDWIRE 20261002-8841', null, null, 'deposit', 'amp', { reinstate: true, reason: 'no' }), 400, /Say why/);
    var back = await paid('FEDWIRE 20261002-8841', null, '2026-10-05', 'deposit', 'amp', { reinstate: true, reason: 'The recall was withdrawn; funds confirmed by the bank' });
    assert.equal(back.invoice.status, 'paid'); assert.equal(dep().payments.length, 3); assert.equal(dep().payments[2].reinstates, 1);
    assert.equal(audits('ledger-payment-reinstated').length, 1);
  });
  await test('void with hold stops the plant; the real payment lifts the hold; release on PO lifts it too', async function () {
    seed(); await priced(); await issued(); await paid('ACH 4471');
    assert(order().logic.releasedAt);
    await post(office, { action: 'payment-void', orderId: 'amp', stage: 'deposit', bankReference: 'ACH 4471', reason: 'Returned by the bank (R01)', keepBuilding: false });
    var l = order().logic;
    assert.equal(l.paymentHold.stage, 'deposit'); assert.equal(l.paymentHold.reference, 'ACH 4471'); assert.equal(l.paymentException, l.paymentHold.message);
    assert.equal(l.creditRelease || null, null); assert.equal(S.stageOf(order()).key, 'exception');
    /* every plant scan refuses an order with a paymentException; so does the quality release */
    await rejects(W.finish('amp', OWNER), 409, /blocked/);
    var r = await paid('ACH 5001', null, '2026-10-03');
    assert.equal(r.invoice.status, 'paid'); assert.equal(order().logic.paymentHold, null); assert.equal(order().logic.paymentException, null);
    assert(events().some(function (w) { return /ACH 5001.*; hold lifted$/.test(w); }));
    await post(office, { action: 'payment-void', orderId: 'amp', stage: 'deposit', bankReference: 'ACH 5001', reason: 'Returned by the bank (R01)', keepBuilding: false });
    assert(order().logic.paymentHold);
    var rel = await post(office, { action: 'release-on-po', orderId: 'amp', reason: 'Credit approved by the CFO against the PO' });
    assert.equal(rel.creditRelease.basis, 'hold-lifted'); assert.equal(rel.creditRelease.poNumber, 'CCUS-3V3I-0926'); assert.equal(rel.creditRelease.openCents, DEP);
    assert.equal(order().logic.paymentHold, null); assert.equal(order().logic.paymentException, null); assert.equal(rel.order.status, 'in_fulfilment');
    assert.equal(S.stageOf(order()).label, 'Released on PO');
  });
  await test('release on PO before any payment releases the plant; shipment still needs the deposit and the balance', async function () {
    seed({ qty: 2 }); await priced();
    await rejects(post(office, { action: 'release-on-po', orderId: 'amp', reason: 'no' }), 400, /Say why/);
    var rel = await post(office, { action: 'release-on-po', orderId: 'amp', reason: 'PO received; Amperage is a credit-approved account', poNumber: '' });
    assert.equal(rel.creditRelease.basis, 'po'); assert.equal(rel.creditRelease.poNumber, 'CCUS-3V3I-0926'); assert.equal(rel.creditRelease.openCents, DEP);
    assert.equal(rel.order.status, 'in_fulfilment'); assert.equal(rel.order.worksOrderId, 'wo_amp'); assert(rel.order.releasedAt);
    assert(events().some(function (w) { return w.indexOf('Released on PO CCUS-3V3I-0926 (credit release by office@cleancell.us) before the deposit; 0 finished units reserved') === 0; }));
    assert.equal((await post(office, { action: 'release-on-po', orderId: 'amp', reason: 'again, twice over' })).duplicate, true);
    readyUnits(2);
    await rejects(post(office, { action: 'ship', orderId: 'amp', shipment: { carrier: 'Estes', tracking: 'BOL-1' } }, OWNER), 409, /deposit must be recorded before shipment/);
    assert.equal(order().logic.invoices.balance.status, 'to_issue', 'the quality release still queues the final invoice');
    await issued(); await paid('ACH 4471');
    assert.equal(S.creditOpen(order()), 0);
    await rejects(post(office, { action: 'ship', orderId: 'amp', shipment: { carrier: 'Estes', tracking: 'BOL-1' } }, OWNER), 409, /Final payment must be recorded before shipment/);
    await issued('amp', 'balance', 'CCUS-3V3I-0926-02', '2026-10-10'); await paid('ACH 4490', BAL / 100, '2026-10-12', 'balance');
    await post(office, { action: 'ship', orderId: 'amp', shipment: { carrier: 'Estes', tracking: 'BOL-1' } }, OWNER);
    assert.equal(order().status, 'shipped');
    /* the office stage for "balance recorded, deposit still open" is never "ready to ship" */
    var o = order(); o.status = 'in_fulfilment'; o.logic.invoices.deposit = Object.assign({}, o.logic.invoices.deposit, { payments: [], paidCents: 0, satisfied: false });
    assert.notEqual(S.stageOf(o).key, 'ship');
  });
  await test('invoice edit keeps its history and an event; the due date follows terms unless set; a duplicate number is refused', async function () {
    seed({ dueDays: 30 }); await priced();
    await rejects(issued('amp', 'deposit', 'D-1', '2026-09-23', { dueAt: '2026-09-01' }), 400, /cannot be before the invoice date/);
    await rejects(issued('amp', 'deposit', 'D-1', '2026-09-23', { dueAt: '23/10/2026' }), 400, /Due date must be YYYY-MM-DD/);
    await issued('amp', 'deposit', 'D-1', '2026-09-23');
    assert.equal(dep().dueAt, null); assert.equal(R.dueDate(dep(), order().logic.commercial.terms), '2026-10-23');
    var e = await post(office, { action: 'invoice-edit', orderId: 'amp', stage: 'deposit', dueAt: '2026-11-15', reason: 'Customer agreed net 53 on the PO' });
    assert.equal(e.invoice.dueAt, '2026-11-15'); assert.deepEqual(dep().edits[0].was, { dueAt: null }); assert.deepEqual(dep().edits[0].now, { dueAt: '2026-11-15' });
    assert(events().indexOf('deposit invoice edited: due terms (2026-10-23) → 2026-11-15 — Customer agreed net 53 on the PO') >= 0);
    var acc = await call(accounting, 'GET', {}, ADMIN); assert.equal(acc.rows[0].dueAt, '2026-11-15'); assert.equal(acc.rows[0].dueAtSet, true);
    assert.equal((await post(office, { action: 'invoice-edit', orderId: 'amp', stage: 'deposit', dueAt: '2026-11-15', reason: 'the same again' })).duplicate, true);
    await post(office, { action: 'invoice-edit', orderId: 'amp', stage: 'deposit', dueAt: '', reason: 'Back to the contract terms' });
    acc = await call(accounting, 'GET', {}, ADMIN); assert.equal(acc.rows[0].dueAt, '2026-10-23'); assert.equal(acc.rows[0].dueAtSet, false);
    await post(office, { action: 'invoice-edit', orderId: 'amp', stage: 'deposit', number: 'D-1 Rev B', issuedAt: '2026-09-24', reason: 'Reissued with the PO number on it' });
    assert.equal(dep().id, 'D-1 Rev B'); assert.equal(dep().issuedAt, '2026-09-24'); assert.equal(dep().edits.length, 3); assert.equal(dep().amountCents, DEP);
    assert.equal(audits('ledger-invoice-edit').length, 3);
    /* the balance invoice exists: its number cannot be the deposit's, either way */
    var o = order(); o.logic.invoices.balance = { amountCents: BAL, requestId: 'r', date: '2026-10-10', status: 'to_issue' }; db.seed('orders/amp', o);
    await rejects(issued('amp', 'balance', 'D-1 Rev B', '2026-10-10'), 409, /already the deposit invoice/);
    await issued('amp', 'balance', 'B-1', '2026-10-10');
    await rejects(post(office, { action: 'invoice-edit', orderId: 'amp', stage: 'deposit', number: 'B-1', reason: 'Typo in the number' }), 409, /Invoice B-1 is already the balance invoice on this order/);
    await rejects(post(office, { action: 'invoice-edit', orderId: 'amp', stage: 'deposit', number: 'D-2', reason: 'no' }), 400, /Say why the invoice is being changed/);
  });
  await test('ClearSky-billed orders refuse void, edit and release on PO', async function () {
    seed({ config: { accounting: 'quickbooks', realmId: '123', itemRef: '5', accountingApproved: true } });
    var o = order(); o.status = 'in_fulfilment';
    o.logic = { accounting: 'quickbooks', acceptedAt: '2026-09-22', releasedAt: '2026-09-23', commercial: { terms: { depositPct: 30, dueDays: 0 }, totalCents: 100000, depositCents: 30000, balanceCents: 70000 },
      invoices: { deposit: { amountCents: 30000, id: 'inv_0', date: '2026-09-22', paidCents: 30000, satisfied: true, status: 'paid', paymentIds: ['p1'] } } };
    db.seed('orders/amp', o);
    await rejects(post(office, { action: 'payment-void', orderId: 'amp', stage: 'deposit', bankReference: 'p1', reason: 'Bounced by the bank', keepBuilding: true }), 409, /billed through QuickBooks; payments are reconciled there/);
    await rejects(post(office, { action: 'invoice-edit', orderId: 'amp', stage: 'deposit', dueAt: '2026-10-01', reason: 'Customer asked' }), 409, /billed through QuickBooks; edit the invoice there/);
    await rejects(post(office, { action: 'release-on-po', orderId: 'amp', reason: 'Credit approved' }), 409, /Release on PO is for orders the OEM invoices itself/);
    await rejects(post(accounting, { action: 'sync-choose', provider: 'stripe' }), 409, /invoice on their own paper/);
    await rejects(post(accounting, { action: 'sync-pull' }), 409, /invoice on their own paper/);
    assert.equal((await post(accounting, { action: 'sync-choose', provider: 'none' })).ok, true);
    var acc = await call(accounting, 'GET', {}, ADMIN);
    assert.equal(acc.accounting, 'quickbooks'); assert.equal(acc.sync.eligible, false); assert.equal(acc.rows[0].billing, 'quickbooks'); assert.equal(acc.rows[0].status, 'paid');
    assert(Object.keys(acc.rows[0].actions).every(function (k) { return acc.rows[0].actions[k] === false; }));
  });
  await test('only workspace admins and the ClearSky owner reach the accounting page and its actions', async function () {
    seed(); await priced(); await issued(); await paid('ACH 4471');
    await rejects(call(accounting, 'GET', {}, MEMBER), 403, /administrator/);
    await rejects(call(accounting, 'GET', {}, STRANGER), 403, /Not your OEM workspace/);
    await rejects(call(accounting, 'GET', {}, Object.assign({}, ADMIN, { claims: { email_verified: false } })), 403);
    assert.equal((await call(accounting, 'GET', {}, ADMIN)).owner, false);
    assert.equal((await call(accounting, 'GET', {}, OWNER)).owner, true);
    await rejects(post(accounting, { action: 'sync-choose', provider: 'stripe' }, MEMBER), 403);
    await rejects(post(office, { action: 'payment-void', orderId: 'amp', stage: 'deposit', bankReference: 'ACH 4471', reason: 'Returned by the bank', keepBuilding: true }, MEMBER), 403);
    await rejects(post(office, { action: 'release-on-po', orderId: 'amp', reason: 'Credit approved' }, STRANGER), 403);
    await rejects(call(accounting, 'GET', { org: 'not an org' }, OWNER), 400, /Valid org required/);
    await rejects(post(accounting, { action: 'nope' }), 400, /Unknown action/);
    /* an order of another workspace is not reachable through this one */
    db.seed('orders/else', { orgId: 'joules.example', orderNo: 'J-1', status: 'new', items: [], customer: { email: 'x@y.co' } });
    await rejects(post(office, { action: 'payment-void', orderId: 'else', stage: 'deposit', bankReference: 'ACH 1', reason: 'Returned by the bank' }), 404, /not found in this workspace/);
    await rejects(post(accounting, { action: 'sync-push', orderId: 'else', stage: 'deposit' }), 404, /not found in this workspace/);
  });
  await test('accounting GET: the receivables ledger by customer account, filters, CSV, with voided payments shown and excluded', async function () {
    seed(); await priced(); await issued();
    await post(office, { action: 'release-on-po', orderId: 'amp', reason: 'PO received; credit approved' });
    /* a colleague's order on the same ACCOUNT, billed to them (pricing stamps it for the account) */
    db.seed('orders/amp2', { orgId: ORG, orderNo: 'CC-26-0930', status: 'new', createdAt: '2026-09-23T10:00:00Z', customer: { name: 'AP desk', company: 'Amperage', email: 'AP@amperagecapital.com' }, items: [{ sku: 'R60', qty: 1 }] });
    await priced('amp2'); await issued('amp2', 'deposit', 'D-2', '2026-09-23');
    await paid('ACH 1', 100, '2026-09-24', 'deposit', 'amp2');
    await post(office, { action: 'payment-void', orderId: 'amp2', stage: 'deposit', bankReference: 'ACH 1', reason: 'Entered against the wrong order', keepBuilding: false });
    /* a stranger's order, a PO still in review, an unpriced order */
    db.seed('orders/oth', { orgId: ORG, orderNo: 'CC-26-0931', status: 'new', createdAt: '2026-09-24T09:00:00Z', customer: { name: 'Lee', company: 'Other, "Power" Co', email: 'lee@other.example' }, items: [{ sku: 'R60', qty: 1 }] });
    await priced('oth');
    db.seed('orders/po1', { orgId: ORG, orderNo: 'PO-IN-1', status: 'po_review', createdAt: '2026-09-24T10:00:00Z', poIntake: { number: 'X' }, customer: { email: 'lee@other.example' }, items: [], logic: { invoices: { deposit: { amountCents: 5 } } } });
    db.seed('orders/raw', { orgId: ORG, orderNo: 'CC-26-0932', status: 'new', createdAt: '2026-09-24T11:00:00Z', customer: { email: 'z@z.example' }, items: [] });
    var acc = await call(accounting, 'GET', {}, ADMIN);
    assert.deepEqual(acc.rows.map(function (r) { return r.key; }), ['oth:deposit', 'amp2:deposit', 'amp:deposit']);
    assert.equal(acc.rows[1].customer.key, 'account:c1', 'the colleague is on the Amperage account'); assert.equal(acc.rows[1].customer.name, 'Amperage Capital');
    assert.equal(acc.rows[1].payments.length, 1); assert.equal(acc.rows[1].payments[0].voided, true); assert.equal(acc.rows[1].receivedCents, 0);
    assert.equal(acc.rows[0].customer.key, 'email:lee@other.example'); assert.equal(acc.rows[0].status, 'to_issue');
    assert.equal(acc.totals.voidedCents, 10000); assert.equal(acc.totals.receivedCents, 0);
    var amp = acc.totals.byCustomer.filter(function (c) { return c.key === 'account:c1'; })[0];
    assert.equal(amp.count, 2); assert.equal(amp.invoicedCents, DEP * 2); assert.equal(amp.outstandingCents, DEP * 2); assert.equal(acc.totals.byCustomer[0].key, 'account:c1');
    assert.deepEqual(acc.customers, [{ key: 'account:c1', name: 'Amperage Capital' }, { key: 'email:lee@other.example', name: 'Other, "Power" Co' }]);
    assert.equal(acc.allCount, 3); assert.equal(acc.filtered, false); assert.equal(acc.limited, false); assert.equal(acc.sync.available, true); assert.equal(acc.sync.provider, 'none');
    assert.equal(acc.brand.workspace, 'Clean Cell'); assert.equal(acc.accounting, 'tenant');
    var f = await call(accounting, 'GET', { customer: 'account:c1', status: 'open' }, ADMIN);
    assert.equal(f.rows.length, 2); assert.equal(f.filtered, true); assert.equal(f.allCount, 3); assert.equal(f.totals.count, 2);
    assert.equal((await call(accounting, 'GET', { status: 'to_issue' }, ADMIN)).rows.length, 1);
    assert.equal((await call(accounting, 'GET', { status: 'paid' }, ADMIN)).rows.length, 0);
    var od = await call(accounting, 'GET', { overdue: '1' }, ADMIN);
    assert.deepEqual(od.rows.map(function (r) { return r.key; }), ['amp2:deposit', 'amp:deposit']); assert.equal(od.totals.overdueCents, DEP * 2);
    var csv = await call(accounting, 'GET', { format: 'csv', customer: 'email:lee@other.example' }, ADMIN);
    assert.equal(csv.filename, 'receivables-cleancell.us-' + acc.today + '.csv');
    var lines = csv.csv.split('\r\n').filter(function (l) { return l !== ''; });
    assert.equal(lines[0], 'Order,PO,Customer,Customer key,Stage,Invoice,Issued,Due,Amount USD,Received USD,Balance USD,Status,Days overdue,Aging,Released on PO,Payments');
    assert.equal(lines.length, 2); assert(lines[1].indexOf('"Other, ""Power"" Co"') > 0, lines[1]);
    var all = (await call(accounting, 'GET', { format: 'csv' }, ADMIN)).csv;
    assert.match(all, /USD 100\.00 ACH 1 \(VOIDED: Entered against the wrong order\)/);
    var ampLine = all.split('\r\n').filter(function (l) { return l.indexOf('CC-26-0926,') === 0; })[0].split(',');
    assert.match(ampLine[11], /awaiting/); assert(ampLine[14], 'the Released on PO column is filled for an order on PO credit');
  });
  await test('every accounting write leaves an order event and an omega_audit row', async function () {
    seed(); await priced();
    var steps = [
      [function () { return issued(); }, 'ledger-invoice-issued'],
      [function () { return paid('ACH 1', 1000, '2026-09-24'); }, 'ledger-payment-recorded'],
      [function () { return post(office, { action: 'payment-void', orderId: 'amp', stage: 'deposit', bankReference: 'ACH 1', reason: 'Wrong order' }); }, 'ledger-payment-void'],
      [function () { return paid('ACH 1', 1000, '2026-09-25', 'deposit', 'amp', { reinstate: true, reason: 'It was the right order after all' }); }, 'ledger-payment-reinstated'],
      [function () { return post(office, { action: 'invoice-edit', orderId: 'amp', stage: 'deposit', dueAt: '2026-10-30', reason: 'Net 37 agreed' }); }, 'ledger-invoice-edit'],
      [function () { return post(office, { action: 'release-on-po', orderId: 'amp', reason: 'Credit approved on the PO' }); }, 'ledger-release-on-po']
    ];
    for (var i = 0; i < steps.length; i++) {
      var e = events().length, a = audits(steps[i][1]).length;
      await steps[i][0]();
      assert(events().length > e, steps[i][1] + ' wrote no event'); assert.equal(audits(steps[i][1]).length, a + 1, steps[i][1] + ' wrote no audit row');
      var row = audits(steps[i][1]).pop(); assert.equal(row.orgId, ORG); assert.equal(row.orderId, 'amp'); assert.equal(row.orderNo, 'CC-26-0926'); assert(row.by); assert(row.at);
    }
    /* the provider actions */
    await post(accounting, { action: 'sync-choose', provider: 'stripe' });
    assert.equal(audits('ledger-sync-choose').length, 1);
    var e2 = events().length; await post(accounting, { action: 'sync-push', orderId: 'amp', stage: 'deposit' });
    assert(events().length > e2); assert.equal(audits('ledger-invoice-push').length, 1);
  });

  /* ───────────────────────── the workspace's own books ─────────────────── */
  await test('a void that leaves the owner\'s confirmed cleared receipts above what is recorded is flagged for review, never rewritten', async function () {
    seed(); await priced(); await issued(); await paid('ACH 4471');
    var cl = await post(office, { action: 'cleared', orderId: 'amp', amount: DEP / 100, bankReference: 'CLEARED 4471' }, OWNER);
    assert.equal(cl.payout.clearedCents, DEP);
    var payout = FD.clone(order().logic.payout);
    await post(office, { action: 'payment-void', orderId: 'amp', stage: 'deposit', bankReference: 'ACH 4471', reason: 'The wire was recalled by the sender', keepBuilding: true });
    assert.deepEqual(order().logic.payout, payout, 'the owner\'s settlement ledger is not rewritten by a void');
    assert(events().some(function (e) { return /cleared receipts confirmed earlier \(USD 1349099\.10\) now exceed what is recorded \(USD 0\.00\); the owner reviews the wire settlement/.test(e); }), events());
    assert.deepEqual(audits('ledger-payment-void')[0].after.payoutReview, { clearedCents: DEP, recordedCents: 0 });
    /* nothing confirmed, nothing flagged */
    seed(); await priced(); await issued(); await paid('ACH 4471');
    await post(office, { action: 'payment-void', orderId: 'amp', stage: 'deposit', bankReference: 'ACH 4471', reason: 'The wire was recalled by the sender', keepBuilding: true });
    assert.equal(audits('ledger-payment-void')[0].after.payoutReview, null);
    assert(!events().some(function (e) { return /wire settlement/.test(e); }));
  });
  await test('sync actions go through ledger-sync and write only through the workflow', async function () {
    seed(); await priced(); await issued();
    await rejects(post(accounting, { action: 'sync-choose', provider: 'xero' }), 400, /provider must be none, quickbooks or stripe/);
    await rejects(post(accounting, { action: 'sync-choose', provider: 'quickbooks', quickbooks: { itemRef: 'abc', approved: true } }), 400, /QuickBooks item id must be digits/);
    await rejects(post(accounting, { action: 'sync-choose', provider: 'quickbooks', quickbooks: { itemRef: '5' } }), 409, /Confirm the QuickBooks item and tax treatment first/);
    await rejects(post(accounting, { action: 'sync-choose', provider: 'quickbooks', quickbooks: { itemRef: '5', taxCodeRef: 'VAT;', approved: true } }), 400);
    await rejects(post(accounting, { action: 'sync-choose', provider: 'stripe', stripe: { paymentMethods: [] } }), 400, /Choose at least one Stripe payment method/);
    await rejects(post(accounting, { action: 'sync-choose', provider: 'stripe', stripe: { paymentMethods: ['bitcoin'] } }), 400);
    await rejects(post(accounting, { action: 'sync-push', orderId: 'amp', stage: 'deposit' }), 409, /Choose QuickBooks or Stripe on the accounting page first/);
    var ch = await post(accounting, { action: 'sync-choose', provider: 'quickbooks', quickbooks: { itemRef: '5', approved: true } });
    var ls = db.data.get(O + '/fulfillment/config').ledgerSync;
    assert.equal(ls.provider, 'quickbooks'); assert.deepEqual([ls.quickbooks.itemRef, ls.quickbooks.taxCodeRef, ls.quickbooks.approved, ls.quickbooks.approvedBy], ['5', 'NON', true, ADMIN.email]);
    assert(ls.since); assert.equal(ls.chosenBy, ADMIN.email); assert.equal(ch.sync.provider, 'quickbooks'); assert.equal(ch.sync.quickbooks.itemRef, '5');
    assert.equal(db.data.get(O + '/fulfillment/config').accounting, 'tenant', 'the rest of the config is kept');
    /* connect: the URL comes back and the one-time state cookie is set on the response */
    var con = await post(accounting, { action: 'sync-connect', provider: 'quickbooks' });
    assert.equal(con.url, 'https://connect.example/quickbooks?state=f00d'); assert.match(res.headers['Set-Cookie'], /^omega_ledger_state=f00d; Path=\/api\/ledger-connect; HttpOnly; Secure/);
    assert.equal(audits('ledger-sync-connect-start').length, 1);
    /* push: the ledger is stamped, with the view the provider saw */
    var pu = await post(accounting, { action: 'sync-push', orderId: 'amp', stage: 'deposit' });
    assert.equal(pu.ledger.state, 'pushed'); assert.equal(pu.ledger.provider, 'quickbooks'); assert.equal(dep().ledger.invoiceId, pu.ledger.invoiceId);
    var seen = LS_CALLS.filter(function (c) { return c.fn === 'push'; })[0].view;
    assert.deepEqual(seen.account, { id: 'c1', key: 'account:c1', name: 'Amperage Capital' }); assert.equal(seen.poNumber, 'CCUS-3V3I-0926');
    assert.equal(seen.invoice.number, 'CCUS-3V3I-0926-01 Rev B'); assert.equal(seen.invoice.amountCents, DEP); assert.equal(seen.invoice.dueAt, '2026-09-23'); assert.equal(seen.orgId, ORG);
    assert.equal((await post(accounting, { action: 'sync-push', orderId: 'amp', stage: 'deposit' })).duplicate, true);
    await rejects(post(accounting, { action: 'sync-link', orderId: 'amp', stage: 'deposit', invoiceId: '999' }), 409, /already linked to QuickBooks invoice/);
    await rejects(post(accounting, { action: 'sync-link', orderId: 'amp', stage: 'deposit', invoiceId: '9/9' }), 400);
    await rejects(post(office, { action: 'invoice-edit', orderId: 'amp', stage: 'deposit', dueAt: '2026-10-30', reason: 'Net 37 agreed' }), 409, /This invoice is in QuickBooks/);
    /* pull: the payment QuickBooks linked is recorded as qbo:<id> and releases the order */
    var qref = 'qbo:88';
    LS.pull = [{ ref: qref, amountCents: DEP, date: '2026-10-01', reversed: false, external: { paymentId: '88' } }];
    var pl = await post(accounting, { action: 'sync-pull', orderId: 'amp' });
    assert.deepEqual(pl.results[0].stages.deposit.recorded, [qref]); assert.equal(pl.provider, 'quickbooks');
    assert.equal(dep().payments[0].source, 'quickbooks'); assert.deepEqual(dep().payments[0].external, { paymentId: '88' }); assert.equal(dep().payments[0].by, 'quickbooks-sync');
    assert.equal(dep().status, 'paid'); assert(order().logic.releasedAt, 'the pulled deposit released the order'); assert(dep().ledger.lastPullAt);
    /* the same pull again is a no-op */
    pl = await post(accounting, { action: 'sync-pull' });
    assert.equal(pl.results.length, 1); assert.deepEqual(pl.results[0].stages.deposit.recorded, []); assert.equal(dep().payments.length, 1);
    /* a reversal in QuickBooks voids it and HOLDS the order */
    LS.pull = [{ ref: qref, amountCents: DEP, date: '2026-10-01', reversed: true, external: { paymentId: '88' } }];
    pl = await post(accounting, { action: 'sync-pull', orderId: 'amp' });
    assert.deepEqual(pl.results[0].stages.deposit.voided, [qref]);
    assert.equal(dep().payments[0].voidSource, 'quickbooks'); assert.equal(dep().payments[0].voidReason, 'Reversed in QuickBooks'); assert.equal(dep().status, 'awaiting_payment');
    assert.equal(order().logic.paymentHold.source, 'quickbooks'); assert(order().logic.paymentException);
    /* a voided provider reference that reappears is a conflict, never re-recorded */
    LS.pull = [{ ref: qref, amountCents: DEP, date: '2026-10-01', reversed: false, external: { paymentId: '88' } }];
    pl = await post(accounting, { action: 'sync-pull', orderId: 'amp' });
    assert.match(pl.results[0].stages.deposit.conflicts[0], /qbo:88 was voided in Omega Logic on \d{4}-\d{2}-\d{2}; not recorded again/);
    assert.equal(dep().payments.length, 1); assert.match(dep().ledger.warning, /not recorded again/);
    /* a different amount on a recorded reference is reported, not changed */
    LS.pull = [{ ref: 'qbo:89', amountCents: 5000, date: '2026-10-02', reversed: false, external: { paymentId: '89' } }];
    await post(accounting, { action: 'sync-pull', orderId: 'amp' });
    LS.pull = [{ ref: 'qbo:89', amountCents: 6000, date: '2026-10-02', reversed: false, external: { paymentId: '89' } }];
    pl = await post(accounting, { action: 'sync-pull', orderId: 'amp' });
    assert.deepEqual(pl.results[0].stages.deposit.conflicts, ['qbo:89 now applies USD 60.00 in QuickBooks (recorded USD 50.00); void and re-record by hand']);
    assert.equal(dep().payments[1].amountCents, 5000);
    /* link on another order (issued while QuickBooks was not connected, so still pending); then disconnect */
    db.seed('orders/two', { orgId: ORG, orderNo: 'CC-26-0940', status: 'new', createdAt: '2026-09-25T10:00:00Z', customerId: 'c1', customer: { name: 'Shannon Johnson', email: 'shannon@amperagecapital.com' }, items: [{ sku: 'R60', qty: 1 }] });
    LS.ready = false; await priced('two'); await issued('two', 'deposit', 'D-TWO', '2026-09-25'); LS.ready = true;
    assert.equal(dep('two').ledger.state, 'pending');
    var ln = await post(accounting, { action: 'sync-link', orderId: 'two', stage: 'deposit', invoiceId: '145' });
    assert.equal(ln.ledger.state, 'linked'); assert.equal(ln.ledger.invoiceId, '145'); assert.equal(audits('ledger-invoice-link').length, 1);
    var dc = await post(accounting, { action: 'sync-disconnect', provider: 'quickbooks' });
    assert.equal(db.data.get(O + '/fulfillment/config').ledgerSync.provider, 'none'); assert.equal(dc.sync.provider, 'none');
    assert(LS_CALLS.some(function (c) { return c.fn === 'disconnect' && c.provider === 'quickbooks' && c.org === ORG; }));
    assert.equal(audits('ledger-sync-disconnect').length, 1);
    /* stripe: the hosted invoice page becomes the invoice's pay link */
    await post(accounting, { action: 'sync-choose', provider: 'stripe', stripe: { paymentMethods: ['us_bank_account'], sendEmail: true } });
    db.seed('orders/three', { orgId: ORG, orderNo: 'CC-26-0941', status: 'new', createdAt: '2026-09-26T10:00:00Z', customerId: 'c1', customer: { name: 'Shannon Johnson', email: 'shannon@amperagecapital.com' }, items: [{ sku: 'R60', qty: 1 }] });
    await priced('three'); await issued('three', 'deposit', 'D-THREE', '2026-09-26');
    var st = dep('three');
    assert.equal(st.ledger.provider, 'stripe'); assert.equal(st.ledger.state, 'pushed'); assert.match(st.payUrl, /^https:\/\/invoice\.stripe\.com\//); assert.equal(st.payUrl, st.ledger.hostedUrl);
    assert.deepEqual(db.data.get(O + '/fulfillment/config').ledgerSync.stripe, { paymentMethods: ['us_bank_account'], sendEmail: true });
  });
  await test('issuing an invoice while a provider is chosen marks it pending and pushes it; a push failure never blocks the issue', async function () {
    seed(); await priced();
    await post(accounting, { action: 'sync-choose', provider: 'stripe' });
    LS.ready = false;
    var out = await issued();
    assert.equal(out.invoice.id, 'CCUS-3V3I-0926-01 Rev B'); assert.equal(out.sync.skipped, 'not-connected'); assert.equal(dep().ledger.state, 'pending'); assert.equal(dep().ledger.by, ADMIN.email);
    assert.equal((await post(accounting, { action: 'sync-pull', orderId: 'amp' })).skipped, 'not-connected');
    /* once connected, the worker pushes what is pending */
    LS.ready = true;
    await W.processOrder('amp');
    assert.equal(dep().ledger.state, 'pushed'); assert.equal(dep().ledger.by, 'omega-logic'); assert(dep().payUrl);
    /* a failed push is stored on the invoice; the issue itself stands */
    seed(); await priced(); await post(accounting, { action: 'sync-choose', provider: 'stripe' });
    LS.pushFail = 'Stripe request failed (500): upstream';
    out = await issued();
    assert.equal(out.ok, true); assert.equal(dep().id, 'CCUS-3V3I-0926-01 Rev B'); assert.equal(dep().status, 'awaiting_payment');
    assert.equal(dep().ledger.state, 'error'); assert.equal(dep().ledger.error, 'Stripe request failed (500): upstream'); assert.equal(out.sync.stages.deposit.pushed, false);
    /* an 'error' is not retried behind anybody's back; the explicit push is */
    LS.pushFail = null; await W.processOrder('amp'); assert.equal(dep().ledger.state, 'error');
    var again = await post(accounting, { action: 'sync-push', orderId: 'amp', stage: 'deposit' });
    assert.equal(again.ledger.state, 'pushed'); assert.equal(again.ledger.error, null);
    /* an invoice issued before a provider was chosen is not pushed automatically */
    seed(); await priced(); await issued();
    await post(accounting, { action: 'sync-choose', provider: 'stripe' }); await W.processOrder('amp');
    assert.equal(dep().ledger || null, null); assert.equal(LS_CALLS.filter(function (c) { return c.fn === 'push'; }).length, 0);
    /* what the provider warned about when the invoice went in (Stripe's
       per-payment cap on a USD 1.35 M deposit) survives every later pull
       that has nothing to say; a pull's own conflict shows first */
    seed(); await priced(); await post(accounting, { action: 'sync-choose', provider: 'stripe' });
    LS.pushWarning = 'Above USD 999,999.99 Stripe may refuse a single card or bank payment unless the account has a raised limit'; LS.pull = [];
    out = await issued();
    assert.equal(dep().ledger.state, 'pushed'); assert.equal(dep().ledger.warning, LS.pushWarning, 'the pull right after the push keeps the push warning');
    assert(dep().ledger.lastPullAt, 'and it did pull');
    await W.processOrder('amp'); assert.equal(dep().ledger.warning, LS.pushWarning, 'and so does the worker');
    LS.pull = [{ ref: 'stripe:ch_9', amountCents: DEP, date: '2026-10-01', reversed: false, external: { invoiceId: 'in_x', chargeId: 'ch_9' }, warning: 'Disputed in Stripe; funds withheld until it is decided' }];
    await W.processOrder('amp'); assert.equal(dep().ledger.warning, 'Disputed in Stripe; funds withheld until it is decided');
    LS.pull = [{ ref: 'stripe:ch_9', amountCents: DEP, date: '2026-10-01', reversed: false, external: { invoiceId: 'in_x', chargeId: 'ch_9' } }];
    await post(accounting, { action: 'sync-pull', orderId: 'amp' }); assert.equal(dep().ledger.warning, LS.pushWarning);
    LS.pushWarning = null; LS.pull = [];
  });
  await test('processOrder syncs tenant orders, and a sync failure is logic.ledgerSyncError, never an order exception', async function () {
    seed(); await priced();
    await post(accounting, { action: 'sync-choose', provider: 'quickbooks', quickbooks: { itemRef: '5', approved: true } });
    await issued(); assert.equal(dep().ledger.state, 'pushed');
    LS.pull = [{ ref: 'qbo:91', amountCents: DEP, date: '2026-10-01', reversed: false, external: { paymentId: '91' } }];
    var run = await W.processOrder('amp');
    assert.equal(run.ok, true); assert.equal(dep().status, 'paid'); assert(order().logic.releasedAt, 'released in the same run'); assert.equal(order().worksOrderId, 'wo_amp');
    LS.pullFail = 'QuickBooks invoice changed; reconcile by hand';
    run = await W.processOrder('amp');
    assert.equal(run.ok, true); var err = order().logic.ledgerSyncError;
    assert.deepEqual([err.provider, err.message], ['quickbooks', 'QuickBooks invoice changed; reconcile by hand']);
    assert.equal(order().logic.lastError, null); assert.notEqual(S.stageOf(order()).key, 'exception');
    var at = err.at; await W.processOrder('amp'); assert.equal(order().logic.ledgerSyncError.at, at, 'written only when it changes');
    await rejects(post(accounting, { action: 'sync-pull', orderId: 'amp' }), 409, /reconcile by hand/);
    var bulk = await post(accounting, { action: 'sync-pull' }); assert.match(bulk.results[0].error, /reconcile by hand/);
    LS.pullFail = null; await W.processOrder('amp'); assert.equal(order().logic.ledgerSyncError, null);
    /* the worker's own sync is skipped when a caller already synced */
    var pulls = LS_CALLS.filter(function (c) { return c.fn === 'pull'; }).length;
    await W.processOrder('amp', { sync: false }); assert.equal(LS_CALLS.filter(function (c) { return c.fn === 'pull'; }).length, pulls);
  });
  await test('office-stage: released on PO is labelled and flagged; paid balance with an open deposit is not "ready to ship"', function () {
    var base = { status: 'in_fulfilment', logic: { accounting: 'tenant', acceptedAt: 'x', releasedAt: 'y', creditRelease: { by: BY, poNumber: 'PO-77', basis: 'po' },
      invoices: { deposit: { amountCents: 100000, paidCents: 0, satisfied: false } } } };
    var s = S.stageOf(base);
    assert.deepEqual([s.key, s.label, s.credit], ['production', 'Released on PO', true]); assert.match(s.next, /Released on PO PO-77 · deposit \$1,000\.00 not yet received/);
    assert.equal(S.creditOpen(base), 100000);
    var withBal = FD.clone(base); withBal.logic.invoices.balance = { amountCents: 50000, paidCents: 50000, satisfied: true };
    s = S.stageOf(withBal); assert.equal(s.key, 'balance'); assert.equal(s.label, 'Awaiting deposit · on PO'); assert.equal(s.credit, true); assert.match(s.next, /record it before shipment/);
    var open = FD.clone(base); open.logic.invoices.balance = { amountCents: 50000, paidCents: 0 };
    s = S.stageOf(open); assert.equal(s.key, 'balance'); assert.match(s.next, / · deposit \$1,000\.00 open \(released on PO\)$/);
    var notYet = FD.clone(base); delete notYet.logic.releasedAt; notYet.status = 'accepted';
    s = S.stageOf(notYet); assert.equal(s.key, 'release'); assert.equal(s.label, 'Releasing on PO');
    var held = FD.clone(base); held.logic.paymentException = 'on hold'; assert.equal(S.stageOf(held).key, 'exception');
    var plain = FD.clone(base); delete plain.logic.creditRelease; assert.equal('credit' in S.stageOf(plain), false, 'no credit key without a credit release');
    var settled = FD.clone(base); settled.logic.invoices.deposit = { amountCents: 100000, paidCents: 100000, satisfied: true };
    assert.equal(S.creditOpen(settled), 0); assert.equal('credit' in S.stageOf(settled), false);
  });
  await test('the office GET projects creditRelease, paymentHold and poNumber', async function () {
    seed(); await priced(); await issued(); await paid('ACH 4471');
    await post(office, { action: 'payment-void', orderId: 'amp', stage: 'deposit', bankReference: 'ACH 4471', reason: 'Returned by the bank', keepBuilding: false });
    var g = await call(office, 'GET', {}, ADMIN), x = g.orders[0];
    assert.equal(x.poNumber, 'CCUS-3V3I-0926'); assert.equal(x.logic.paymentHold.reference, 'ACH 4471'); assert.equal(x.logic.creditRelease, null);
    assert.equal(g.links.accounting, '/logic-accounting.html?org=cleancell.us');
    await post(office, { action: 'release-on-po', orderId: 'amp', reason: 'Credit approved on the PO' });
    x = (await call(office, 'GET', {}, ADMIN)).orders[0];
    assert.equal(x.logic.paymentHold, null); assert.equal(x.logic.creditRelease.basis, 'hold-lifted');
  });

  console.log('\n' + count + ' accounting tests passed. No network calls.');
}
main().catch(function (e) { console.error(e); process.exitCode = 1; });
