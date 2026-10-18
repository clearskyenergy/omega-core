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

/* ── the path (2026-10-17): one bar of seven steps, the verdict and the ONE
   next action with whose it is; the desktop, the app and Today read it ── */
console.log('\nthe path');
/* custody.js loads admin.js (firebase-admin), which the unit job does not install: a stub stands in, as the other pure tests do */
require.cache[require.resolve('../api/_lib/admin')] = { id: 'admin', filename: 'admin', loaded: true, exports: { httpError: function (st, m) { var e = new Error(m); e.status = st; return e; } } };
var C = require('../api/_lib/custody');
var admin = S.access(false, { role: 'admin', status: 'active' }, true), member = S.access(false, { role: 'member', status: 'active' }, true), clearsky = S.access(true, null, true);
function P(o, who, billing, units) { return S.path(o, who || admin, billing || 'tenant', units); }
function nx(p) { return p.next ? [p.next.who, p.next.control].join(':') : 'none'; }
ok('seven steps, in the order an order walks them', S.PATH.map(function (x) { return x.key; }).join('>') === 'price>deposit>build>final>ship>deliver>site' && S.PATH[6].label === 'On site');
ok('the custody lists path() reads are custody\'s own statuses', ['delivered', 'received', 'assigned', 'installed', 'commissioned', 'in_service'].every(function (k) { return C.STATUSES.indexOf(k) >= 0; }));
var pq = P({ status: 'new' });
ok('a new order is on Price; an admin of a self-billed workspace approves it', pq.step === 'price' && pq.at === 0 && pq.of === 7 && pq.say === 'Not priced yet.' && nx(pq) === 'you:price');
ok('D1 unchanged: a member is told an admin prices it; a QuickBooks-billed order waits on ClearSky; ClearSky prices it', nx(P({ status: 'new' }, member)) === 'admin:price' && nx(P({ status: 'new' }, admin, 'quickbooks')) === 'clearsky:price' && nx(P({ status: 'new' }, clearsky, 'quickbooks')) === 'you:price');
var pp = P({ status: 'quoted', logic: { accounting: 'tenant', commercial: { totalCents: 4000000 }, invoices: {} } });
ok('priced, not accepted: still Price, the next action is Accept', pp.step === 'price' && pp.say === 'Priced at $40,000.00, not accepted yet.' && nx(pp) === 'you:accept');
var pdi = P({ status: 'accepted', logic: { accounting: 'tenant', acceptedAt: 1, invoices: { deposit: { amountCents: 1200000, status: 'to_issue' } } } });
ok('a self-billed deposit not issued yet says so and asks the office to issue it', pdi.step === 'deposit' && /not invoiced yet/.test(pdi.say) && nx(pdi) === 'you:issue-deposit' && pdi.next.text === 'Issue the deposit invoice');
ok('…and a member is told it is an admin\'s step', nx(P({ status: 'accepted', logic: { accounting: 'tenant', acceptedAt: 1, invoices: { deposit: { amountCents: 1200000, status: 'to_issue' } } } }, member)) === 'admin:issue-deposit');
var pdw = P({ status: 'accepted', logic: { accounting: 'tenant', acceptedAt: 1, invoices: { deposit: { id: 'INV-1', amountCents: 1200000, paidCents: 300000 } } } });
ok('an issued deposit waits on the customer, and says how much is in', pdw.say === 'Awaiting the deposit: $3,000.00 of $12,000.00 received.' && nx(pdw) === 'customer:record-deposit');
ok('a QuickBooks-billed deposit names no control: QuickBooks records it', nx(P({ status: 'accepted', logic: { acceptedAt: 1, invoices: { deposit: { id: '1', amountCents: 1200000 } } } }, admin, 'quickbooks')) === 'customer:');
ok('a recorded deposit is Build, released by Omega Logic itself', nx(P({ status: 'accepted', logic: { acceptedAt: 1, invoices: { deposit: { satisfied: true, amountCents: 1 } } } })) === 'auto:' && P({ status: 'accepted', logic: { acceptedAt: 1, invoices: { deposit: { satisfied: true, amountCents: 1 } } } }).step === 'build');
ok('in production the plant has it', nx(P(released)) === 'plant:work-order' && P(released).step === 'build');
ok('released on PO with the deposit open: Build, and the deposit is still to issue, then to record', P(onPo({ accounting: 'tenant' })).step === 'build' && nx(P(onPo({ accounting: 'tenant' }))) === 'you:issue-deposit'
  && nx(P(onPo({ accounting: 'tenant' }, { deposit: { id: 'INV-9', amountCents: 30000, paidCents: 0 } }))) === 'customer:record-deposit');
var pbi = P({ status: 'in_fulfilment', logic: { accounting: 'tenant', acceptedAt: 1, releasedAt: 1, invoices: { deposit: { satisfied: true, amountCents: 1 }, balance: { amountCents: 2800000, status: 'to_issue' } } } });
ok('every unit passed on a self-billed order: issue the final invoice', pbi.step === 'final' && nx(pbi) === 'you:issue-balance');
var p0 = P({ status: 'in_fulfilment', logic: { accounting: 'tenant', acceptedAt: 1, releasedAt: 1, invoices: { deposit: { satisfied: true, amountCents: 1 }, balance: { amountCents: 0, status: 'not_required' } } } });
ok('a $0 balance is paid: the order goes on to Ship (it used to sit at "$0.00 of $0.00")', p0.step === 'ship' && S.stageOf({ status: 'in_fulfilment', logic: { acceptedAt: 1, releasedAt: 1, invoices: { deposit: { satisfied: true }, balance: { amountCents: 0 } } } }).key === 'balance');
var paid = { status: 'in_fulfilment', logic: { acceptedAt: 1, releasedAt: 1, invoices: { deposit: { satisfied: true, amountCents: 1 }, balance: { satisfied: true, amountCents: 1 } } } };
ok('paid in full: one shipment is ClearSky\'s to record; a delivery plan is the office\'s freight and pickup', nx(P(paid)) === 'clearsky:ship' && nx(P(Object.assign({ delivery: { legs: [] } }, paid))) === 'you:freight');
var shipped = { status: 'shipped', shipment: { carrier: 'XPO' }, logic: { acceptedAt: 1, releasedAt: 1, invoices: { deposit: { satisfied: true }, balance: { satisfied: true } } } };
ok('shipped with no unit read: Deliver, pointed at Sites & custody, counted for nobody', P(shipped).step === 'deliver' && P(shipped).say === 'Shipped with XPO.' && nx(P(shipped)) === ':site');
function U(units, left, arrived, received, bound, declared) { return { units: units, left: left, arrived: arrived, received: received, bound: bound, declared: declared || 0 }; }
ok('on the road: the carrier has it', nx(P(shipped, admin, 'tenant', U(5, 5, 0, 0, 0))) === 'carrier:deliver' && P(shipped, admin, 'tenant', U(5, 5, 0, 0, 0)).say === '5 of 5 units on the way.');
ok('delivered, not received: record the inspection', nx(P(shipped, admin, 'tenant', U(5, 5, 5, 2, 0))) === 'you:deliver');
ok('part of the order still at the plant: the pickup for the rest', /2 still at the plant/.test(P(Object.assign({ delivery: { legs: [{ status: 'accepted' }] } }, paid), admin, 'tenant', U(5, 3, 3, 3, 0)).next.text));
var ps = P(shipped, admin, 'tenant', U(5, 5, 5, 5, 3));
ok('received, not every unit on a site: On site, the customer names the rest', ps.step === 'site' && ps.at === 6 && ps.say === '3 of 5 units on a site.' && nx(ps) === 'customer:site');
ok('a site the customer named is the office\'s to confirm', nx(P(shipped, admin, 'tenant', U(5, 5, 5, 5, 4, 2))) === 'you:confirm');
var pc = P(shipped, admin, 'tenant', U(5, 5, 5, 5, 5));
ok('every unit on its site is Complete, past the last step', pc.state === 'complete' && pc.at === 7 && pc.label === 'Complete' && pc.next === null);
ok('…and a confirmation still open never holds Complete back', P(shipped, admin, 'tenant', U(5, 5, 5, 5, 5, 1)).state === 'complete' && nx(P(shipped, admin, 'tenant', U(5, 5, 5, 5, 5, 1))) === 'you:confirm');
ok('a delivery-plan order no longer reads Ready to ship while its loads move', P(Object.assign({ delivery: { legs: [{ status: 'in_transit' }] } }, paid), admin, 'tenant', U(2, 2, 0, 0, 0)).step === 'deliver');
ok('an inspection exception turns Deliver red', P(Object.assign({ delivery: { legs: [{ status: 'exception' }] } }, paid)).state === 'attention');
var pe = P(Object.assign({}, released, { cancelRequested: true }));
ok('an exception stays on its step, red, and is ClearSky\'s to resolve', pe.step === 'build' && pe.state === 'attention' && pe.say === 'Cancellation requested — refund and stock disposition need ClearSky review.' && nx(pe) === 'clearsky:fix');
var ph = P({ status: 'in_fulfilment', logic: { accounting: 'tenant', acceptedAt: 1, releasedAt: 1, paymentHold: { stage: 'deposit' }, paymentException: 'Deposit reversed', invoices: {} } });
ok('a hold the workspace put on its own order is lifted by recording the payment again', ph.state === 'attention' && nx(ph) === 'you:record-deposit');
ok('cancelled is off the bar; complete is past it', P({ status: 'cancelled' }).state === 'cancelled' && P({ status: 'cancelled' }).at === null && P({ status: 'complete' }).at === 7);
var cc = S.custodyCounts([{ shipUnit: true, custody: { status: 'in_transit' } }, { shipUnit: true, custody: { status: 'received', siteId: 's1', confirmedAt: '2026-10-01' } }, { shipUnit: true, custody: { status: 'assigned', siteId: 's2' } }, { shipUnit: false, custody: { status: 'received' } }, { shipUnit: true }]);
ok('custodyCounts: shipping units only, by how far each has gone', JSON.stringify(cc) === JSON.stringify({ units: 4, left: 3, arrived: 2, received: 2, bound: 2, declared: 1 }), JSON.stringify(cc));
var pl = S.pipeline([{ path: pq }, { path: pdi }, { path: pe }, { path: pc }, { path: P({ status: 'cancelled' }) }, {}]);
ok('pipeline: counts per step, attention beside its step, complete and cancelled apart', pl.price === 1 && pl.deposit === 1 && pl.build === 1 && pl.attention === 1 && pl.complete === 1 && pl.cancelled === 1, JSON.stringify(pl));
console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
