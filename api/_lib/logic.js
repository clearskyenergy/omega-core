/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/logic.js — OMEGA LOGIC: the tracking and fulfilment roll-up
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   PURE. No Firestore, no network, no clock it does not receive. Given the
   orders and the units already read, it produces the whole Command Center
   payload — so what the view reports can be tested without standing up a
   plant, a tenant or a payment. See scripts/test-logic.js.

   The two DECISION engines stay where they are. Nothing here re-implements
   a rule owned by api/_lib/plant.js (where a unit may move) or
   api/_lib/portal.js (what milestone an order is at). This file arranges
   their answers; it does not second-guess them, and a routing or ladder
   change must not need an edit here.

   ── IT REPORTS GAPS RATHER THAN FILLING THEM ─────────────────────────────
   Payment collection, per-unit product data and shipment are designed and
   not built. Every field they would own comes back as null with the stage
   named in `pending`, never as a zero. A dashboard that renders an uncollected
   deposit as $0 and a never-shipped order as "not yet shipped" is
   indistinguishable from one reporting live facts, and the difference only
   surfaces when somebody acts on it. api/tenant-systems.js makes the same
   argument for `off` rather than `down`.

   ── A BOOLEAN IS NOT A PAYMENT ───────────────────────────────────────────
   The Clean Cell demo carried `deposit: true` as a stand-in for the real
   record, and that boolean will exist on seeded and hand-worked orders. Only
   an object with a paid timestamp counts as money here. Treating the boolean
   as evidence would make the first real collected-cash number in the estate
   include every order where somebody once pressed a button.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

var P = require('./plant');
var Q = require('./portal');

/* Statuses that cannot have a works order behind them: the works order is
   raised at release, which is downstream of all three. Anything NOT listed
   gets the floor join, so a status added later joins by default and is
   merely slower, never wrong. */
var NO_FLOOR = { 'new': true, 'quoted': true, 'cancelled': true };

/* The pipeline, and which links actually carry traffic. Named once here so
   the view captions the gaps instead of each row explaining itself.

   THREE STATES, NOT TWO. `partial` exists because `unitdata` earned it: the
   release package records each unit's lot, firmware, capacity and component
   parentage, so the data is being captured — but nothing reads it back, so
   there is no warranty lookup and no performance history. Calling that
   `live` would promise a warranty surface that does not exist; calling it
   `off` would tell somebody to go and build a capture path that is already
   there and already validated. Both are wrong in a way that costs work. */
var STAGES = [
  { key: 'intake',     label: 'Order intake',    state: 'live',    by: 'api/embed-order.js' },
  { key: 'payment',    label: 'Deposit',         state: 'partial', by: 'QuickBooks installments + verified payments; requires connected company and worker' },
  /* Built and idempotent, but a person presses it. api/plant-release.js's own
     header says the payment provider should call it "while payment automation
     is being connected" — so this stage is live and its TRIGGER is the gap. */
  { key: 'release',    label: 'Works order',     state: 'partial', by: 'Omega Logic: accepted + deposit recorded → stock allocation / manufacture; enable per OEM' },
  { key: 'production', label: 'Production line', state: 'live',    by: 'api/mes-scan.js + api/mes-test-result.js' },
  { key: 'unitdata',   label: 'Unit record',     state: 'live', by: '/plant — identity, genealogy, machine measurements and scan history' },
  { key: 'shipment',   label: 'Shipment',        state: 'partial', by: 'Office records carrier/tracking after passed serials + final payment; no carrier booking integration' },
  { key: 'finalpay',   label: 'Final payment',   state: 'partial', by: 'Ready release queues balance invoice; bank wires require clearance evidence and bank confirmation' }
];

function norm(v) { return String(v == null ? '' : v).trim(); }
function lower(v) { return norm(v).toLowerCase(); }
function numOrNull(v) { var n = Number(v); return isFinite(n) ? n : null; }
function clip(v, n) { return v == null ? null : String(v).slice(0, n || 200); }

/* Firestore hands back a Timestamp object and String()-ing one yields
   "[object Object]" — the bug api/_lib/portal.js documents at length. Reuse
   its converter rather than writing a second one that will disagree. */
var when = Q.when;

function needsFloor(order) {
  var s = lower(order && order.status) || 'new';
  return !Object.prototype.hasOwnProperty.call(NO_FLOOR, s);
}

/* Units bucketed by the station they are AT, in routing order, so the view
   draws a line rather than a legend it has to sort. */
function board(units, routing) {
  routing = routing && routing.length ? routing : P.DEFAULT_ROUTING;
  var cols = routing.map(function (s) {
    return { key: s.key, label: s.label, count: 0, held: 0 };
  });
  var unstarted = 0, held = 0, offRouting = 0;
  units = units || [];
  for (var i = 0; i < units.length; i++) {
    var u = units[i] || {};
    if (u.hold) held++;
    var at = norm(u.at);
    if (!at) { unstarted++; continue; }
    var ix = P.indexOf(routing, at);
    /* A station this routing does not know. Counted rather than dropped:
       silently discarding it would make the columns sum to less than the
       total and the view would report a smaller floor than exists — the same
       over-reporting api/_lib/portal.js's stationMilestone() guards against
       from the other direction. */
    if (ix < 0) { offRouting++; continue; }
    cols[ix].count++;
    if (u.hold) cols[ix].held++;
  }
  return { columns: cols, unstarted: unstarted, offRouting: offRouting,
           held: held, total: units.length };
}

/* Named key by key. Staff-only surface, so this is the one place in the
   estate where ClearSky's number may sit next to the tenant's. */
function moneyOf(order) {
  var o = order || {};
  if (o.logic && o.logic.commercial) {
    var l = o.logic, depInvoice = l.invoices.deposit || {}, finalInvoice = l.invoices.balance || {};
    return { currency: 'USD', clearskyTotal: null, tenantTotal: l.commercial.totalCents / 100, cost: null,
      depositPaidAt: depInvoice.satisfied ? depInvoice.checkedAt : null, depositAmount: (depInvoice.paidCents || 0) / 100,
      finalPaidAt: finalInvoice.satisfied ? finalInvoice.checkedAt : null, invoiceRef: depInvoice.id || null,
      recorded: ((depInvoice.paidCents || 0) + (finalInvoice.paidCents || 0)) / 100, legacyDepositFlag: false,
      pending: [!depInvoice.satisfied && depInvoice.amountCents ? 'deposit' : null, !finalInvoice.satisfied && l.commercial.balanceCents ? 'final' : null].filter(Boolean),
      error: l.paymentException || l.lastError || null };
  }
  var tp = o.tenantPricing || {};
  var pr = o.pricing || {};
  var pending = [];

  var dep = o.deposit;
  var depObj = dep && typeof dep === 'object' ? dep : null;
  var depositPaidAt = depObj ? when(depObj.paidAt) : null;
  if (!depositPaidAt) pending.push('deposit');

  var finalPaidAt = when(o.finalPaidAt);
  if (!finalPaidAt) pending.push('final');

  return {
    currency: clip(tp.currency || pr.currency || 'USD', 8),
    clearskyTotal: numOrNull(pr.total),
    tenantTotal: numOrNull(tp.total),
    cost: numOrNull(o.cost),
    depositPaidAt: depositPaidAt,
    depositAmount: depObj ? numOrNull(depObj.amount) : null,
    finalPaidAt: finalPaidAt,
    invoiceRef: clip(o.qboInvoiceId || null, 60),
    /* The stand-in, reported as exactly what it is. A view that showed this
       as paid would be repeating a button press back as a bank fact. */
    legacyDepositFlag: dep === true,
    pending: pending
  };
}

function shipmentOf(order) {
  var s = (order || {}).shipment || null;
  if (!s) return { pending: true, carrier: null, tracking: null, bol: null, shippedAt: null };
  return {
    pending: false,
    carrier: clip(s.carrier, 80),
    tracking: clip(s.tracking, 120),
    bol: clip(s.bol, 120),
    shippedAt: when(s.shippedAt)
  };
}

/* One order + the floor read for it → the row the view draws. `floor` is
   { units, known, released } as api/logic-summary.js assembles it;
   known:false means a read failed or the roster was clipped. */
function row(order, floor) {
  var o = order || {};
  var f = floor || { units: [], known: true, released: false };
  var routing = P.routingOf(o.works || null);

  /* ONE ladder in the estate. milestoneOf() is the same function the customer
     portal reads through, so the word staff see and the word the buyer sees
     cannot drift. Staff additionally see the internal status; the customer
     never does.

     Units are passed as null when the floor is UNKNOWN rather than as [],
     because [] claims the floor had nothing to say and milestoneOf() would
     fall back to the order status — which reads as progress. */
  var ms = Q.milestoneOf(o, f.known ? f.units : null);
  var b = board(f.known ? f.units : [], routing);

  return {
    id: o._id || o.id || null,
    orderNo: clip(o.orderNo, 120),
    orgId: lower(o.orgId), orgName: clip(o.orgName, 120),
    status: lower(o.status) || 'new',
    milestone: ms,
    placedAt: when(o.createdAt),
    promisedShipAt: when(o.promisedShipAt),
    customer: o.customer ? {
      name: clip(o.customer.name, 120),
      company: clip(o.customer.company, 160),
      email: clip(lower(o.customer.email), 160)
    } : null,
    system: o.system ? { kw: numOrNull(o.system.kw), kwh: numOrNull(o.system.kwh) } : null,
    items: (Array.isArray(o.items) ? o.items : []).slice(0, 20).map(function (it) {
      it = it || {};
      return { sku: clip(it.sku, 80), name: clip(it.name, 160), qty: numOrNull(it.qty) };
    }),
    floor: { released: f.released, known: f.known !== false, board: b },
    money: moneyOf(o),
    shipment: shipmentOf(o),
    cancelRequested: !!o.cancelRequested
  };
}

/* The whole payload. `orders` and `floors` are parallel arrays; `asOf` is
   received, never read off a clock this file does not own. */
function rollup(orders, floors, asOf) {
  orders = orders || []; floors = floors || [];
  var rows = [], byMilestone = {}, byStation = {}, holds = [], tenants = {};
  var unitsTotal = 0, heldTotal = 0, unknownFloors = 0;

  for (var i = 0; i < orders.length; i++) {
    var o = orders[i] || {};
    var f = floors[i] || { units: [], known: true, released: false };
    var r = row(o, f);
    var b = r.floor.board;
    var routing = P.routingOf(o.works || null);

    if (!r.floor.known) unknownFloors++;

    if (r.orgId) {
      if (!tenants[r.orgId]) {
        tenants[r.orgId] = { orgId: r.orgId, orgName: r.orgName, orders: 0, units: 0, held: 0 };
      }
      tenants[r.orgId].orders++;
      tenants[r.orgId].units += b.total;
      tenants[r.orgId].held += b.held;
    }

    byMilestone[r.milestone.key] = (byMilestone[r.milestone.key] || 0) + 1;

    for (var c = 0; c < b.columns.length; c++) {
      var col = b.columns[c];
      if (!byStation[col.key]) byStation[col.key] = { key: col.key, label: col.label, count: 0, held: 0 };
      byStation[col.key].count += col.count;
      byStation[col.key].held += col.held;
    }
    unitsTotal += b.total;
    heldTotal += b.held;

    var us = (f.known !== false && f.units) ? f.units : [];
    for (var h = 0; h < us.length; h++) {
      if (!us[h] || !us[h].hold) continue;
      holds.push({
        orderNo: r.orderNo, orgId: r.orgId,
        serial: clip(us[h].serial, 80), at: norm(us[h].at),
        station: P.labelOf(routing, us[h].at),
        hold: clip(us[h].hold, 200), ncr: clip(us[h].ncr, 60)
      });
    }
    rows.push(r);
  }

  var tenantList = Object.keys(tenants).map(function (k) { return tenants[k]; });
  tenantList.sort(function (a, b2) { return b2.orders - a.orders; });

  var stationList = P.DEFAULT_ROUTING.map(function (s) {
    return byStation[s.key] || { key: s.key, label: s.label, count: 0, held: 0 };
  });

  return {
    ok: true,
    asOf: asOf || null,
    stages: STAGES.map(function (s) {
      return { key: s.key, label: s.label, state: s.state, by: s.by };
    }),
    totals: {
      orders: rows.length,
      units: unitsTotal,
      held: heldTotal,
      /* Rows whose floor could not be read. Surfaced so "nothing on the
         line" and "we could not see the line" are never the same number. */
      unknownFloors: unknownFloors,
      byMilestone: byMilestone,
      /* Absent, not zero: nothing in this codebase has collected a payment
         against an order yet. */
      collected: rows.some(function (r) { return r.money.recorded != null; }) ? rows.reduce(function (n, r) { return n + (r.money.recorded || 0); }, 0) : null
    },
    tenants: tenantList,
    stations: stationList,
    holds: holds,
    orders: rows
  };
}

module.exports = {
  STAGES: STAGES,
  NO_FLOOR: NO_FLOOR,
  needsFloor: needsFloor,
  board: board,
  moneyOf: moneyOf,
  shipmentOf: shipmentOf,
  row: row,
  rollup: rollup
};
