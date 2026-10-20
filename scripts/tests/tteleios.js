#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   The Omega Teleios ladder (api/_lib/teleios.js): one customer quote from
   "saved" to complete, derived at read time from the quote, the order in
   the SELLER's own Omega Logic (prime-order.js), its units and the
   product's coverage. Every stage is walked here with the records each
   step reads; the ladder never names the office's price or terms; an order
   is where its least-advanced unit is; exceptions and cancellations sit off
   the ladder; an order made in a manufacturer's workspace before
   2026-10-17 names that office. Pure. */
'use strict';
var assert = require('node:assert/strict'), path = require('path');
var ROOT = path.join(__dirname, '..', '..');
/* firebase-admin is intercepted at load, as tclientadmin.js and thomeclaim.js
   do: CI runs this with no npm install (tests.yml), and api/_lib/admin.js
   requires it at load. Nothing here reaches Firestore or Auth; the stand-in
   only lets the modules load, the same in CI as on a laptop with
   node_modules. */
var Module = require('module'), _load = Module._load;
function noFirebase() { throw new Error('firebase-admin is a stand-in in this test'); }
var FAKE_ADMIN = { apps: [], initializeApp: function () { FAKE_ADMIN.apps.push({}); }, credential: { cert: function (k) { return k; } }, firestore: noFirebase, auth: noFirebase };
Module._load = function (request) { return request === 'firebase-admin' ? FAKE_ADMIN : _load.apply(this, arguments); };
try { require(path.join(ROOT, 'api/_lib/admin.js')); } finally { Module._load = _load; }
var T = require(path.join(ROOT, 'api', '_lib', 'teleios.js'));
var count = 0;
function ok(c, m) { assert.ok(c, m); count++; }
function eq(a, b, m) { assert.deepEqual(a, b, m); count++; }

var NOW = '2027-03-01T12:00:00Z', SENT = Date.parse('2026-10-17T15:00:00Z');
var PRODUCTS = [{ sku: 'CC-SM-1000', warrantyYears: 10 }];
var SELLER = 'sunwave.energy';
function q(status, acc, extra) { return Object.assign({ id: 'qt-1', orgId: SELLER, status: status, createdAt: SENT - 86400000, unit: { mfr: 'CleanCell US' }, acceptance: acc || null }, extra || {}); }
var SENTQ = { sentAt: SENT, sentTo: 'dana@riverside.co', validUntil: SENT + 30 * 86400000 };
var VIEWED = Object.assign({}, SENTQ, { viewedAt: SENT + 3600000, viewCount: 2 });
var APPROVED = Object.assign({}, VIEWED, { approvedAt: SENT + 7200000 });
function order(extra) { return Object.assign({ orgId: SELLER, status: 'new', createdAt: '2026-10-17T17:00:00Z', items: [{ sku: 'CC-SM-1000', kind: 'product', qty: 1 }], delivery: { destinations: [{ id: 'd1' }], legs: [] } }, extra || {}); }
var LOGIC = { createdAt: '2026-10-20T00:00:00Z', commercial: { baseCents: 98765400, totalCents: 98765400, depositCents: 29629620 }, invoices: { deposit: { amountCents: 29629620, paidCents: 0 } } };
function logic(extra) { return Object.assign({}, LOGIC, extra || {}); }
function unit(serial, at, custody) { return { serial: serial, sku: 'CC-SM-1000', shipUnit: true, at: at || 'ready', custody: custody || {} }; }
function L(o) { return T.ladder(Object.assign({ products: PRODUCTS, now: NOW, office: 'Sunwave Energy', manufacturer: 'CleanCell US' }, o)); }
function state(l, key) { return l.steps.filter(function (s) { return s.key === key; })[0]; }
function doneUpTo(l, key) { var i = T.KEYS.indexOf(key); return l.steps.every(function (s, k) { return k <= i ? s.state === 'done' : true; }); }

/* the shape */
eq(T.KEYS, ['saved', 'sent', 'viewed', 'approved', 'ordered', 'priced', 'accepted', 'released', 'building', 'ready', 'shipped', 'delivered', 'received', 'onsite', 'teleios'], 'fifteen steps, in order');
eq(T.STEPS.map(function (s) { return s.phase; }).filter(function (p, i, a) { return a.indexOf(p) === i; }), ['proposal', 'logic', 'delivery', 'teleios'], 'four phases');
var l = L({ quote: q('draft') });
ok(l.steps.length === 15 && l.steps.every(function (s) { return ['key', 'label', 'phase', 'state', 'at', 'note'].every(function (k) { return k in s; }); }), 'every step carries key, label, phase, state, at, note');
ok(l.current === 'sent' && state(l, 'saved').state === 'done' && state(l, 'sent').state === 'current' && state(l, 'sent').note === 'Not sent yet' && state(l, 'viewed').state === 'todo', 'a draft: saved, and sending is next');
ok(l.complete === false && l.off === null, 'not complete, not off');

/* the proposal */
l = L({ quote: q('sent', SENTQ) });
ok(l.current === 'viewed' && /Sent 2026-10-17 to dana@riverside\.co; not opened yet/.test(state(l, 'viewed').note) && state(l, 'sent').at === new Date(SENT).toISOString(), 'sent: waiting to be opened, with when and to whom');
l = L({ quote: q('viewed', VIEWED) });
ok(l.current === 'approved' && /Opened 2 times/.test(state(l, 'approved').note), 'viewed: waiting for the decision, the opens counted');
l = L({ quote: q('approved', Object.assign({}, SENTQ, { approvedAt: SENT + 1 })) });
ok(l.current === 'ordered' && state(l, 'viewed').state === 'done', 'approved without a recorded view: the view is implied done');
l = L({ quote: q('approved', APPROVED, { handoff: { error: 'CleanCell US has not published CC-SM-1000 in its Omega Logic catalog yet.' } }) });
ok(l.current === 'ordered' && /has not published/.test(state(l, 'ordered').note), 'approved, the hand-off refused: the reason is on the order step');
l = L({ quote: q('approved', APPROVED) });
ok(state(l, 'ordered').note === 'Sending the order to your Omega Logic', 'approved, the hand-off running: to the seller’s own Omega Logic, said so');

/* Omega Logic */
l = L({ quote: q('approved', APPROVED), order: order() });
ok(l.current === 'priced' && state(l, 'ordered').state === 'done' && state(l, 'ordered').at === '2026-10-17T17:00:00.000Z' && state(l, 'priced').note === 'With your office to price', 'ordered: with the seller’s own office to price');
ok(!/CleanCell|Clean Cell/.test(JSON.stringify(l.steps)), 'the maker of a bought-in battery is never named as the office');
var legacy = L({ quote: q('approved', APPROVED), order: order({ orgId: 'cleancell.us' }), office: null, manufacturer: 'Clean Cell' });
ok(state(legacy, 'priced').note === 'With Clean Cell’s office to price', 'an order made in the manufacturer’s workspace before 2026-10-17 names that office');
var legacyEx = L({ quote: q('approved', APPROVED), order: order({ orgId: 'cleancell.us', cancelRequested: true, logic: logic({ acceptedAt: '2026-10-21T00:00:00Z' }) }), office: null, manufacturer: 'Clean Cell' });
eq([legacyEx.off.key, legacyEx.off.note], ['exception', 'Clean Cell’s office is resolving it'], 'and its exception note names that office');
var ownEx = L({ quote: q('approved', APPROVED), order: order({ cancelRequested: true, logic: logic({ acceptedAt: '2026-10-21T00:00:00Z' }) }) });
eq([ownEx.off.key, ownEx.off.note], ['exception', 'Your office is resolving it'], 'the seller’s own order: its own office is resolving it');
l = L({ quote: q('approved', APPROVED), order: order({ status: 'quoted', logic: logic() }) });
ok(l.current === 'accepted' && doneUpTo(l, 'priced'), 'priced: waiting for acceptance');
l = L({ quote: q('approved', APPROVED), order: order({ status: 'accepted', logic: logic({ acceptedAt: '2026-10-21T00:00:00Z' }) }) });
ok(l.current === 'released' && state(l, 'accepted').at === '2026-10-21T00:00:00.000Z', 'accepted: waiting for release');
var released = logic({ acceptedAt: '2026-10-21T00:00:00Z', releasedAt: '2026-10-25T00:00:00Z' });
l = L({ quote: q('approved', APPROVED), order: order({ status: 'in_fulfilment', logic: released }), units: [unit('S1', 'elec'), unit('S2', 'kit')] });
ok(l.current === 'building' && state(l, 'building').note === 'In production', 'released: in production');
l = L({ quote: q('approved', APPROVED), order: order({ status: 'in_fulfilment', logic: released }), units: [unit('S1', 'eol'), unit('S2', 'qa')] });
eq(state(l, 'building').note, 'Inspection & test', 'every unit at test: inspection & test');
l = L({ quote: q('approved', APPROVED), order: order({ status: 'in_fulfilment', logic: released }), units: [unit('S1', 'eol'), unit('S2', 'elec')] });
eq(state(l, 'building').note, 'In production', 'the least-advanced unit decides');
var ready = Object.assign({}, released, { readyAt: '2026-12-01T00:00:00Z' });
l = L({ quote: q('approved', APPROVED), order: order({ status: 'in_fulfilment', logic: ready }), units: [unit('S1'), unit('S2')] });
ok(l.current === 'shipped' && state(l, 'ready').state === 'done' && state(l, 'building').state === 'done' && state(l, 'shipped').note === 'Ready; waiting for pickup', 'ready: waiting for pickup');

/* delivery: the least-advanced unit */
function U(c1, c2) { return [unit('S1', 'ready', c1), unit('S2', 'ready', c2)]; }
var shipped = { status: 'in_transit', shippedAt: '2027-02-20' };
l = L({ quote: q('approved', APPROVED), order: order({ status: 'in_fulfilment', logic: ready }), units: U(shipped, {}) });
ok(l.current === 'shipped' && state(l, 'shipped').note === '1 of 2 units shipped', 'one of two shipped: still “shipped” next, and said');
l = L({ quote: q('approved', APPROVED), order: order({ status: 'in_fulfilment', logic: ready }), units: U(shipped, { status: 'in_transit', shippedAt: '2027-02-21' }) });
ok(l.current === 'delivered' && state(l, 'shipped').at === '2027-02-21T00:00:00.000Z' && state(l, 'delivered').note === 'In transit', 'both shipped: in transit, dated by the last');
var deliv = { status: 'delivered', shippedAt: '2027-02-20', deliveredAt: '2027-02-24' };
l = L({ quote: q('approved', APPROVED), order: order({ status: 'in_fulfilment', logic: ready }), units: U(deliv, shipped) });
ok(l.current === 'delivered' && state(l, 'delivered').note === '1 of 2 units delivered', 'one delivered, one on the road');
l = L({ quote: q('approved', APPROVED), order: order({ status: 'in_fulfilment', logic: ready }), units: U(deliv, deliv) });
ok(l.current === 'received' && /receiving inspection/.test(state(l, 'received').note), 'both delivered: waiting for the receiving inspection');
var recv = { status: 'received', shippedAt: '2027-02-20', deliveredAt: '2027-02-24', receivedAt: '2027-02-25' };
l = L({ quote: q('approved', APPROVED), order: order({ status: 'in_fulfilment', logic: ready }), units: U(recv, recv) });
ok(l.current === 'onsite' && /waiting to be assigned/.test(state(l, 'onsite').note), 'received, no site: waiting to be assigned');
var bound = Object.assign({}, recv, { siteId: 'site_a', siteName: 'Lake St' });
l = L({ quote: q('approved', APPROVED), order: order({ status: 'in_fulfilment', logic: ready }), units: U(bound, recv) });
ok(l.current === 'onsite' && state(l, 'onsite').note === '1 of 2 units bound to the site', 'one bound: said');
/* on site, the warranty waiting on commissioning */
var COMM = [{ sku: 'CC-SM-1000', coverage: [{ id: 'warranty', type: 'warranty', provider: 'oem', termMonths: 120, trigger: 'commissioning' }] }];
l = T.ladder({ quote: q('approved', APPROVED), order: order({ status: 'in_fulfilment', logic: ready }), units: U(bound, bound), products: COMM, now: NOW });
ok(l.current === 'teleios' && !l.complete && state(l, 'onsite').state === 'done' && /waiting for commissioning/.test(state(l, 'teleios').note), 'on site, the warranty waiting for commissioning: not yet Teleios');
var comm = Object.assign({}, bound, { status: 'commissioned', commissionedAt: '2027-02-27' });
l = T.ladder({ quote: q('approved', APPROVED), order: order({ status: 'in_fulfilment', logic: ready }), units: U(comm, comm), products: COMM, now: NOW });
ok(l.complete && l.current === 'teleios' && l.steps.every(function (s) { return s.state === 'done'; }) && state(l, 'teleios').at === '2027-02-27T00:00:00.000Z', 'commissioned: every warranty live — Omega Teleios, dated by its start');
eq(state(l, 'teleios').note, 'Delivered, on site and under warranty', 'the complete step says what complete means');
/* the default warranty (warrantyYears, trigger ship) */
l = L({ quote: q('approved', APPROVED), order: order({ status: 'in_fulfilment', logic: ready }), units: U(bound, bound) });
ok(l.complete === true, 'warrantyYears: on site after shipping is complete');
l = L({ quote: q('approved', APPROVED), order: order({ status: 'in_fulfilment', logic: ready }), units: U(bound, bound), now: '2027-02-10T00:00:00Z' });
ok(!l.complete && /starts 2027-02-20/.test(state(l, 'teleios').note), 'the warranty not started yet (a clock before the ship date): not complete, said');
/* components and voided serials are not shipping units */
l = L({ quote: q('approved', APPROVED), order: order({ status: 'in_fulfilment', logic: ready }), units: U(bound, bound).concat([{ serial: 'C1', sku: 'CELL', shipUnit: false, custody: {} }, { serial: 'V1', sku: 'CC-SM-1000', shipUnit: true, inventoryStatus: 'void', custody: {} }]) });
ok(l.complete, 'a component and a voided serial do not hold the order back');

/* without unit records: the legs, and the no-delivery path */
l = L({ quote: q('approved', APPROVED), order: order({ status: 'in_fulfilment', logic: ready, delivery: { destinations: [{ id: 'd1' }], legs: [{ id: 'L1', status: 'in_transit', pickedUpAt: '2026-12-05T10:00:00Z' }] } }) });
ok(l.current === 'delivered' && state(l, 'shipped').at === '2026-12-05T10:00:00.000Z', 'no unit rows: the legs say shipped');
l = L({ quote: q('approved', APPROVED), order: order({ status: 'in_fulfilment', logic: ready, delivery: { destinations: [{ id: 'd1' }], legs: [{ id: 'L1', status: 'accepted', inspectedAt: '2026-12-10T10:00:00Z' }] } }) });
ok(l.current === 'onsite', 'legs inspected: received');
l = L({ quote: q('approved', APPROVED), order: order({ status: 'shipped', logic: ready, shipment: { shippedAt: '2026-12-05T10:00:00Z' } }) });
ok(l.current === 'delivered' && state(l, 'shipped').state === 'done', 'the no-delivery path: shipped by status');
l = L({ quote: q('approved', APPROVED), order: order({ status: 'complete', logic: ready, items: [{ sku: 'SVC-ONM', kind: 'service', qty: 1 }], updatedAt: '2027-01-02T00:00:00Z' }) });
ok(l.complete, 'a services-only order is complete when the office completes it');

/* off the ladder */
l = L({ quote: q('declined', Object.assign({}, VIEWED, { declinedAt: SENT + 9, declineReason: 'Went with the incumbent.' })) });
eq(l.off, { key: 'declined', label: 'Declined by the customer', note: 'Went with the incumbent.' }, 'declined is off the ladder, with the customer’s reason');
ok(l.current === 'approved' && !l.complete, 'and the ladder stops where it was');
ok(L({ quote: q('expired', SENTQ) }).off.key === 'expired' && /2026-11-16/.test(L({ quote: q('expired', SENTQ) }).off.note), 'expired, with its date');
ok(L({ quote: q('withdrawn', null) }).off.key === 'withdrawn', 'withdrawn');
l = L({ quote: q('approved', APPROVED), order: order({ cancelRequested: true, logic: released }) });
eq([l.off.key, l.off.label], ['exception', 'Cancellation requested'], 'a cancellation request is off the ladder');
l = L({ quote: q('approved', APPROVED), order: order({ logic: logic({ acceptedAt: 'x', paymentException: 'Deposit reversed $296,296.20 on wire 4412' }) }) });
ok(l.off.key === 'exception' && l.off.label === 'Needs attention' && JSON.stringify(l).indexOf('296') < 0 && JSON.stringify(l).indexOf('wire') < 0, 'a payment exception: “needs attention”, never the office’s own words');
l = L({ quote: q('approved', APPROVED), order: order({ status: 'cancelled', logic: released }) });
eq(l.off.key, 'cancelled', 'cancelled');
l = L({ quote: q('approved', APPROVED), order: order({ status: 'in_fulfilment', logic: ready }), units: U({ status: 'in_transit', shippedAt: '2026-12-01' }, { status: 'in_transit', shippedAt: '2026-12-01' }) });
ok(/In transit for \d+ days/.test(state(l, 'delivered').note), 'a custody exception is said on the step it holds back');

/* never the manufacturer's price or terms */
var money = [L({ quote: q('approved', APPROVED), order: order({ status: 'quoted', logic: logic(), tenantPricing: { total: 987654 } }) }),
  L({ quote: q('approved', APPROVED), order: order({ status: 'accepted', logic: logic({ acceptedAt: '2026-10-21T00:00:00Z' }) }) }),
  L({ quote: q('approved', APPROVED), order: order({ status: 'in_fulfilment', logic: Object.assign({}, ready, { invoices: { deposit: { amountCents: 29629620, paidCents: 29629620, satisfied: true }, balance: { amountCents: 69135780, paidCents: 100 } } }) }) })];
money.forEach(function (x, i) {
  var j = JSON.stringify(x);
  ok(j.indexOf('$') < 0 && !/98765|29629|69135|987654|deposit|balance|invoice/i.test(j), 'ladder ' + (i + 1) + ' names no price, deposit, balance or invoice');
});

/* the row's one line: where it IS (the Desk, Today) */
eq(T.stage(L({ quote: q('draft') })), { key: 'saved', label: 'Quote saved' }, 'a row: a draft is saved');
eq(T.stage(L({ quote: q('sent', SENTQ) })), { key: 'sent', label: 'Sent · not opened yet' }, 'a row: sent');
eq(T.stage(L({ quote: q('viewed', VIEWED) })), { key: 'viewed', label: 'Viewed by the customer' }, 'a row: viewed');
eq(T.stage(L({ quote: q('approved', APPROVED) })), { key: 'approved', label: 'Approved' }, 'a row: approved, the order on its way');
eq(T.stage(L({ quote: q('approved', APPROVED, { handoff: { error: 'not published' } }) })), { key: 'approved', label: 'Approved · the order needs a retry' }, 'a row: approved, the hand-off refused');
eq(T.stage(L({ quote: q('approved', APPROVED), order: order() })), { key: 'ordered', label: 'In Omega Logic · awaiting price' }, 'a row: in Omega Logic, awaiting the price');
eq(T.stage(L({ quote: q('approved', APPROVED), order: order({ status: 'quoted', logic: logic() }) })).key, 'priced', 'a row: priced');
eq(T.stage(L({ quote: q('approved', APPROVED), order: order({ status: 'in_fulfilment', logic: released }), units: [unit('S1', 'eol')] })), { key: 'building', label: 'Inspection & test' }, 'a row: released is in production (here, at test)');
eq(T.stage(L({ quote: q('approved', APPROVED), order: order({ status: 'in_fulfilment', logic: ready }), units: U({}, {}) })).key, 'ready', 'a row: ready');
eq(T.stage(L({ quote: q('approved', APPROVED), order: order({ status: 'in_fulfilment', logic: ready }), units: U(shipped, shipped) })).key, 'shipped', 'a row: shipped');
eq(T.stage(L({ quote: q('declined', VIEWED) })), { key: 'declined', label: 'Declined by the customer' }, 'a row: why it stopped');
eq(T.stage(L({ quote: q('approved', APPROVED), order: order({ status: 'in_fulfilment', logic: ready }), units: U(bound, bound) })), { key: 'teleios', label: 'Omega Teleios · complete' }, 'a row: complete');
eq(T.stage(null), { key: 'saved', label: 'Quote saved' }, 'no ladder: saved');
eq(T.ladder().current, 'sent', 'no input is a draft');

/* ── review, 2026-10-17: complete needs a warranty ON FILE for every unit ──
   An empty coverage list is not "every warranty live": a bought-in battery
   whose maker's warranty this workspace never recorded holds Teleios. */
var RUN = order({ status: 'in_fulfilment', logic: ready });
[[[], 'no catalog at all'], [[{ sku: 'OTHER', warrantyYears: 10 }], 'another SKU only'], [[{ sku: 'CC-SM-1000' }], 'the product with no coverage and no warrantyYears'],
 [[{ sku: 'CC-SM-1000', coverage: [{ id: 'sla', type: 'sla', provider: 'oem', termMonths: 60, trigger: 'ship' }] }], 'an SLA but no warranty']].forEach(function (c) {
  var x = L({ quote: q('approved', APPROVED), order: RUN, units: U(bound, bound), products: c[0] });
  ok(!x.complete && x.current === 'teleios' && state(x, 'onsite').state === 'done' && state(x, 'teleios').note === 'No warranty on file for CC-SM-1000', 'no warranty on file (' + c[1] + '): on site, Teleios held and said');
  eq(T.stage(x), { key: 'onsite', label: 'On site' }, 'and its row reads On site, never Omega Teleios (' + c[1] + ')');
});
var BOUGHT = order({ status: 'in_fulfilment', logic: ready, items: [{ sku: 'CC-SM-1000', kind: 'product', qty: 1, reference: true, mfr: 'CleanCell US' }], procure: { mfr: 'CleanCell US', mfrOrgId: null, sku: 'CC-SM-1000', model: 'Smart Module' } });
l = L({ quote: q('approved', APPROVED), order: BOUGHT, units: U(bound, bound), products: [] });
ok(!l.complete && state(l, 'teleios').note === 'No warranty on file for CC-SM-1000: it is bought in from CleanCell US, and the maker’s warranty is not on file in this workspace', 'a bought-in reference battery: the maker’s warranty is not on file in this workspace, said so');
ok(L({ quote: q('approved', APPROVED), order: BOUGHT, units: U(bound, bound) }).complete, 'once the warranty is on file for that SKU, it is complete');
var R60 = Object.assign(unit('S2', 'ready', bound), { sku: 'CC-R60' });
l = L({ quote: q('approved', APPROVED), order: RUN, units: [unit('S1', 'ready', bound), R60] });
ok(!l.complete && state(l, 'teleios').note === 'No warranty on file for CC-R60', 'one unit covered and the other not: not complete, the uncovered SKU named');

/* ── review, 2026-10-17: after-sales service is a note, never a rewind ── */
var INSVC = { status: 'in_service', shippedAt: '2027-02-20', deliveredAt: '2027-02-24', receivedAt: '2027-02-25', commissionedAt: '2027-02-27', inServiceAt: '2027-02-27', siteId: 'site_a', siteName: 'Lake St' };
function svc(extra) { return Object.assign({}, INSVC, extra); }
var DONE_ORDER = order({ status: 'complete', logic: ready });
l = L({ quote: q('approved', APPROVED), order: DONE_ORDER, units: [unit('S1', 'ready', INSVC)] });
ok(l.complete && l.current === 'teleios', 'in service: Omega Teleios');
var rma = L({ quote: q('approved', APPROVED), order: DONE_ORDER, units: [unit('S1', 'ready', svc({ status: 'rma_open', rma: { openedAt: '2027-02-28', reason: 'BMS fault', returnedAt: null } }))] });
ok(rma.complete && rma.current === 'teleios' && rma.off === null, 'an RMA opened on a completed project: still complete, not rewound to Shipped');
eq(state(rma, 'teleios').note, 'Delivered, on site and under warranty · RMA open on S1 since 2027-02-28', 'the open RMA is a note on the step');
eq(T.stage(rma), { key: 'teleios', label: 'Omega Teleios · complete' }, 'and the row still reads complete');
ok(JSON.stringify(rma).indexOf('BMS fault') < 0, 'the RMA reason (the customer’s claim) is not printed on the ladder');
var back = L({ quote: q('approved', APPROVED), order: DONE_ORDER, units: [unit('S1', 'ready', svc({ status: 'returned', rma: { openedAt: '2027-02-27', returnedAt: '2027-02-28' } }))] });
ok(back.complete && /S1 returned to the plant under RMA on 2027-02-28$/.test(state(back, 'teleios').note), 'returned under RMA: past delivery and receipt, said on the step');
var decom = L({ quote: q('approved', APPROVED), order: DONE_ORDER, units: [unit('S1', 'ready', svc({ status: 'decommissioned', decommissionedAt: '2027-02-28' }))] });
ok(decom.complete && /S1 decommissioned on 2027-02-28$/.test(state(decom, 'teleios').note), 'decommissioned: the ladder keeps what was done');
var pair = L({ quote: q('approved', APPROVED), order: DONE_ORDER, units: [unit('S1', 'ready', INSVC), unit('S2', 'ready', svc({ status: 'rma_open', rma: { openedAt: '2027-02-28' } }))] });
ok(pair.complete && state(pair, 'delivered').state === 'done' && /RMA open on S2/.test(state(pair, 'teleios').note), 'one unit in service, one under RMA: not “1 of 2 delivered”');
/* the Logistics path (the order's status never moves): no rewind either */
var LEGS = order({ status: 'in_fulfilment', logic: ready, delivery: { destinations: [{ id: 'd1' }], legs: [{ id: 'L1', status: 'accepted', inspectedAt: '2027-02-25T10:00:00Z' }] } });
l = L({ quote: q('approved', APPROVED), order: LEGS, units: [unit('S1', 'ready', svc({ status: 'rma_open', rma: { openedAt: '2027-02-28' } }))] });
ok(l.complete && state(l, 'shipped').state === 'done', 'an RMA on an order Logistics delivered: not rewound to Ready to ship');
/* replaced under RMA: read through the replacement (custody.js gives it the site and the remaining term) */
var S1R = unit('S1', 'ready', svc({ status: 'replaced', replacedBy: 'S9', replacedAt: '2027-02-28', rma: { openedAt: '2027-02-27' } }));
var S9 = { serial: 'S9', sku: 'CC-SM-1000', shipUnit: true, orderId: 'other-order', custody: { status: 'assigned', siteId: 'site_a', siteName: 'Lake St', replaces: 'S1', receivedAt: '2027-02-28', assignedAt: '2027-02-28',
  inheritedCoverage: [{ templateId: 'warranty', type: 'warranty', provider: 'oem', startDate: '2027-02-20', endDate: '2037-02-20', inheritedFrom: 'S1' }] } };
l = L({ quote: q('approved', APPROVED), order: DONE_ORDER, units: [S1R], replacements: [S9] });
ok(l.complete && state(l, 'teleios').at === '2027-02-20T00:00:00.000Z' && state(l, 'teleios').note === 'Delivered, on site and under warranty', 'replaced: on site and under warranty through the replacement, dated by the inherited start');
l = L({ quote: q('approved', APPROVED), order: DONE_ORDER, units: [S1R, S9] });
ok(l.complete, 'a replacement that is one of the order’s own units counts once (counted twice, the replaced unit’s transferred warranty would hold it)');
eq(T.standing([S1R, S9], []).map(function (u) { return u.serial; }), ['S9'], 'the units standing for the order: the replacement in place of the unit it replaced');
l = L({ quote: q('approved', APPROVED), order: DONE_ORDER, units: [S1R] });
ok(!l.complete && l.current === 'teleios' && state(l, 'onsite').state === 'done', 'replaced, the replacement not on file: delivery stands, Teleios held');
eq(state(l, 'teleios').note, 'On site; the warranty is with its replacement · S1 was replaced by S9, whose record is not on file', 'and it says why');
/* an RMA before Teleios: the note rides on the step the ladder is at */
var COMM2 = [{ sku: 'CC-SM-1000', coverage: [{ id: 'warranty', type: 'warranty', provider: 'oem', termMonths: 120, trigger: 'commissioning' }] }];
l = L({ quote: q('approved', APPROVED), order: RUN, units: [unit('S1', 'ready', Object.assign({}, bound, { status: 'rma_open', installedAt: '2027-02-26', rma: { openedAt: '2027-02-28' } }))], products: COMM2 });
ok(!l.complete && l.current === 'teleios' && /waiting for commissioning · RMA open on S1 since 2027-02-28$/.test(state(l, 'teleios').note), 'an RMA before commissioning: Teleios waits on the warranty, the RMA said beside it');

console.log('tteleios: ' + count + ' assertions passed');
