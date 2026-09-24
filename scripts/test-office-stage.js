/* One derivation of "where is this order and what happens next", pinned.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var S = require('../api/_lib/office-stage');
var pass = 0, fail = 0;
function ok(label, yes, detail) { console.log('  ' + (yes ? 'PASS' : 'FAIL') + '  ' + label + (detail ? '  ' + detail : '')); if (yes) pass++; else fail++; }
function s(o) { return S.stageOf(o); }
var priced = { status: 'new', logic: { commercial: { totalCents: 100250 }, invoices: {} } };
var accepted = { status: 'accepted', logic: { acceptedAt: '2026-09-21', invoices: { deposit: { amountCents: 30000, paidCents: 10000, satisfied: false } } } };
var released = { status: 'in_fulfilment', logic: { acceptedAt: 1, releasedAt: 1, invoices: { deposit: { amountCents: 30000, paidCents: 30000, satisfied: true } } } };

console.log('\noffice stage');
ok('a new request waits on ClearSky to price it', s({ status: 'new' }).key === 'quote' && s({ status: 'new' }).owner === true);
ok('priced but not accepted waits on acceptance', s(priced).key === 'priced' && /Accept/.test(s(priced).next));
ok('accepted with a partial deposit says how much is recorded', s(accepted).key === 'deposit' && s(accepted).next === 'Awaiting deposit · $100.00 of $300.00 recorded' && s(accepted).owner === false);
ok('a satisfied deposit that has not released yet is releasing, not building', s({ status: 'accepted', logic: { acceptedAt: 1, invoices: { deposit: { satisfied: true } } } }).key === 'release');
ok('released work is in production until a balance invoice exists', s(released).key === 'production');
var balance = { status: 'in_fulfilment', logic: { acceptedAt: 1, releasedAt: 1, invoices: { deposit: { satisfied: true }, balance: { amountCents: 70000, paidCents: 0, satisfied: false } } } };
ok('a queued balance invoice means every unit is ready and payment is awaited', s(balance).key === 'balance' && /\$0\.00 of \$700\.00/.test(s(balance).next));
balance.logic.invoices.balance.satisfied = true;
ok('paid in full is ready to ship and waits on ClearSky to record the shipment', s(balance).key === 'ship' && s(balance).owner === true);
ok('a payment exception outranks every other stage', s(Object.assign({}, released, { logic: Object.assign({}, released.logic, { paymentException: 'Payment reversed' }) })).key === 'exception');
ok('a cancellation request is an exception with its own label', s(Object.assign({}, released, { cancelRequested: true })).label === 'Cancellation requested');
ok('shipped with proceeds ready to wire names the amount', s({ status: 'shipped', logic: { payout: { pendingCents: 65000 } } }).next === 'Record the completed wire · $650.00 ready');
ok('shipped and settled is settled', s({ status: 'shipped', logic: { payout: { status: 'wire_recorded', pendingCents: 0 } } }).next === 'Settled');
ok('complete and cancelled are terminal', s({ status: 'complete' }).key === 'complete' && s({ status: 'cancelled' }).key === 'cancelled');
var t = S.totals([{ status: 'new' }, accepted, released, Object.assign({}, released, { logic: Object.assign({}, released.logic, { lastError: 'x' }) })]);
ok('totals count stages, attention and recorded payments across shown orders', t.orders === 4 && t.byStage.quote === 1 && t.byStage.deposit === 1 && t.byStage.production === 1 && t.attention === 1 && t.paidCents === 70000, JSON.stringify(t.byStage));
ok('totals accept orders already carrying a projected stage', S.totals([{ stage: { key: 'ship' } }]).byStage.ship === 1);

var finOrders = [
  { status: 'new' },
  { status: 'accepted', logic: { acceptedAt: 1, commercial: { totalCents: 100000, depositCents: 30000 }, invoices: { deposit: { amountCents: 30000, paidCents: 10000, satisfied: false } } } },
  { status: 'in_fulfilment', logic: { acceptedAt: 1, releasedAt: 1, commercial: { totalCents: 100000, depositCents: 30000 }, invoices: { deposit: { amountCents: 30000, paidCents: 30000, satisfied: true } } } },
  { status: 'in_fulfilment', logic: { acceptedAt: 1, releasedAt: 1, commercial: { totalCents: 100000, depositCents: 30000 }, invoices: { deposit: { amountCents: 30000, paidCents: 30000, satisfied: true }, balance: { amountCents: 70000, paidCents: 20000, satisfied: false } } } },
  { status: 'shipped', logic: { commercial: { totalCents: 50000 }, invoices: { deposit: { amountCents: 15000, paidCents: 15000, satisfied: true }, balance: { amountCents: 35000, paidCents: 35000, satisfied: true } }, payout: { eligibleCents: 40000, sentCents: 10000, pendingCents: 30000 } } }
];
var fin = S.finance(finOrders, true);
ok('finance: invoiced and recorded are sums of issued invoices; receivable is what is still open on them', fin.invoicedCents === 210000 && fin.recordedCents === 140000 && fin.receivableCents === 70000, JSON.stringify([fin.invoicedCents, fin.recordedCents, fin.receivableCents]));
ok('finance: expected deposit is the unpaid part of a deposit; expected balance covers work in production and open balance invoices', fin.expectedDepositCents === 20000 && fin.expectedBalanceCents === 120000, fin.expectedBalanceCents);
ok('finance: open value excludes quotes and shipped; shipped value is separate', fin.openValueCents === 300000 && fin.shippedValueCents === 50000);
ok('finance: pipeline by stage carries counts and value; wire ledger is owner-only', fin.byStage.balance.count === 1 && fin.byStage.shipped.totalCents === 50000 && fin.wire.pendingCents === 30000 && S.finance(finOrders, false).wire === null);
/* released on PO (logic.creditRelease): the stage moves on, the deposit is still owed */
function onPo(extra, invoices) {
  return { status: 'in_fulfilment', logic: Object.assign({ acceptedAt: 1, releasedAt: 1, creditRelease: { by: 'office@x.co', poNumber: 'PO-1', basis: 'po' }, commercial: { totalCents: 100000, depositCents: 30000 },
    invoices: Object.assign({ deposit: { amountCents: 30000, paidCents: 0, satisfied: false } }, invoices || {}) }, extra || {}) };
}
var fp = S.finance([onPo()]);
ok('finance: an order released on PO still expects its open deposit, and its balance, and no more', s(onPo()).key === 'production' && fp.expectedDepositCents === 30000 && fp.expectedBalanceCents === 70000, JSON.stringify([fp.expectedDepositCents, fp.expectedBalanceCents]));
var fb = S.finance([onPo({}, { balance: { amountCents: 70000, paidCents: 70000, satisfied: true } })]);
ok('finance: balance paid with the deposit still open on PO expects the deposit', s(onPo({}, { balance: { amountCents: 70000, paidCents: 70000, satisfied: true } })).key === 'balance' && fb.expectedDepositCents === 30000 && fb.expectedBalanceCents === 0, JSON.stringify([fb.expectedDepositCents, fb.expectedBalanceCents]));
var notYet = onPo({ releasedAt: null }); notYet.status = 'accepted';
var fr = S.finance([notYet]);
ok('finance: released on PO but not yet in the plant expects the deposit too', s(notYet).key === 'release' && fr.expectedDepositCents === 30000, fr.expectedDepositCents);
var fpaid = S.finance([onPo({}, { deposit: { amountCents: 30000, paidCents: 30000, satisfied: true } })]);
ok('finance: once the deposit is recorded a credit release adds nothing', fpaid.expectedDepositCents === 0, fpaid.expectedDepositCents);
console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
