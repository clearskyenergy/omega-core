/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/plant-ops.js — how the floor is performing, what it needs to build
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   PURE. The office's Production, Inventory and Fulfillment views read this.
   Inputs are the immutable scan ledger, the finished-stock units and the
   work-order board rows the API already scoped; outputs are counts a plant
   manager can check against the floor.

   Throughput is counted from plant_scans, which records every arrival,
   machine result, refusal and hold — so a day with many refusals reads as a
   day with many refusals, not as a quiet one. Build demand is the works
   orders' requirements less what has been registered; a component bill of
   materials and supplier purchasing are NOT modelled, and the office says
   so rather than inventing a parts list.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

var B = require('./plant-board');

function text(v, max) { return String(v == null ? '' : v).trim().slice(0, max || 160); }
function dayOf(v) { var t = B.iso(v); return t ? t.slice(0, 10) : null; }

/* Daily buckets for the last `days` days ending today. */
function floor(scans, now, days) {
  days = days || 14;
  var end = new Date((B.iso(now) || new Date().toISOString()).slice(0, 10) + 'T00:00:00Z'), keys = [], buckets = {};
  for (var i = days - 1; i >= 0; i--) { var d = new Date(end.getTime() - i * 864e5).toISOString().slice(0, 10); keys.push(d); buckets[d] = { day: d, advances: 0, ready: 0, refusals: 0, tests: 0, testFails: 0, holds: 0, releases: 0 }; }
  var stations = {}, last = null, totals = { advances: 0, ready: 0, refusals: 0, tests: 0, testFails: 0, holds: 0, releases: 0 };
  (Array.isArray(scans) ? scans : []).forEach(function (s) {
    s = s || {};
    var at = B.iso(s.at) || B.iso(s.createdAt), d = at ? at.slice(0, 10) : null, b = d && buckets[d];
    if (at && (!last || at > last)) last = at;
    if (s.stationId) stations[s.stationId] = true;
    if (!b) return;
    var v = s.verdict || {};
    if (s.control) { if (s.control.action === 'hold') b.holds++; else b.releases++; }
    else if (s.machine || s.test) { b.tests++; if (s.test && s.test.result === 'fail') b.testFails++; if (s.ok && v.action === 'advance') { b.advances++; if (v.to === 'ready') b.ready++; } }
    else if (s.ok && v.action === 'advance') { b.advances++; if (v.to === 'ready') b.ready++; }
    else if (!s.ok) b.refusals++;
  });
  keys.forEach(function (k) { Object.keys(totals).forEach(function (m) { totals[m] += buckets[k][m]; }); });
  return { days: keys.map(function (k) { return buckets[k]; }), totals: totals, activeStations: Object.keys(stations).length, lastScanAt: last };
}

/* Units currently at each operation across the open works orders — the
   floor's queues, i.e. where the work is waiting. */
function queues(rows) {
  var by = {}, order = [];
  (Array.isArray(rows) ? rows : []).forEach(function (r) {
    if (!r || r.stage === 'complete') return;
    (r.progress && r.progress.queues || []).forEach(function (q) {
      if (!by[q.key]) { by[q.key] = { key: q.key, label: q.label, machine: !!q.machine, count: 0, held: 0, workOrders: 0 }; order.push(q.key); }
      by[q.key].count += q.count; by[q.key].held += q.held; if (q.count) by[q.key].workOrders++;
    });
  });
  return order.map(function (k) { return by[k]; });
}

/* Build demand by SKU: what the open works orders require, what has been
   registered against them, and what is still to be started. */
function demand(rows) {
  var by = {}, list = [];
  (Array.isArray(rows) ? rows : []).forEach(function (r) {
    if (!r || r.stage === 'complete' || r.stage === 'awaiting_serials' && !r.requirements.length) return;
    var remaining = {};
    (r.requirements || []).forEach(function (q) {
      var reg = Number((r.registeredCounts || {})[q.sku]) || 0, rem = Math.max(0, q.qty - reg);
      if (!by[q.sku]) by[q.sku] = { sku: q.sku, name: q.name || null, required: 0, registered: 0, toRegister: 0, workOrders: 0 };
      by[q.sku].required += q.qty; by[q.sku].registered += Math.min(reg, q.qty); by[q.sku].toRegister += rem; by[q.sku].workOrders++;
      if (rem) remaining[q.sku] = rem;
    });
    list.push({ id: r.id, orderNo: r.orderNo, stage: r.stage, stageLabel: r.stageLabel, due: r.due, late: r.late, lineId: r.lineId,
      remaining: remaining, readyRoots: r.progress.readyRoots, expectedRoots: r.progress.expectedRoots, held: r.progress.held });
  });
  var skus = Object.keys(by).map(function (k) { return by[k]; });
  skus.sort(function (a, b) { return b.toRegister - a.toRegister || a.sku.localeCompare(b.sku); });
  list.sort(function (a, b) { return (b.late ? 1 : 0) - (a.late ? 1 : 0) || (a.due || '9999').localeCompare(b.due || '9999'); });
  return { skus: skus, workOrders: list };
}

/* Finished stock: shipping roots at Ready that belong to no order. */
function stock(units) {
  var by = {}, held = 0, total = 0;
  (Array.isArray(units) ? units : []).forEach(function (u) {
    u = u || {};
    if (!u.shipUnit || text(u.at, 40) !== 'ready') return;
    var sku = text(u.sku, 100);
    if (!by[sku]) by[sku] = { sku: sku, available: 0, held: 0, serials: [] };
    if (u.hold) { by[sku].held++; held++; } else { by[sku].available++; total++; }
    if (by[sku].serials.length < 50) by[sku].serials.push(text(u.serial, 100));
  });
  var skus = Object.keys(by).map(function (k) { return by[k]; });
  skus.sort(function (a, b) { return b.available - a.available || a.sku.localeCompare(b.sku); });
  return { skus: skus, available: total, held: held };
}

/* Every shipping unit by product, in one of three places: on the shelf
   (built for stock, at Ready, no hold — what the office can assign), on an
   order (assigned, whether built yet or shipped), or being built for stock.
   A held stock unit at Ready is counted apart. Voided serials (a typo that
   was corrected) are not units. The caller reads each inventoryStatus
   through its own index (api/logic-plant.js page=stock) so the counts are
   not "whatever the first page of documents happened to hold". */
function finished(units) {
  var by = {}, totals = { available: 0, held: 0, assigned: 0, building: 0 }, avail = [];
  (Array.isArray(units) ? units : []).forEach(function (u) {
    u = u || {};
    if (!u.shipUnit || u.inventoryStatus === 'void') return;
    var sku = text(u.sku, 100); if (!sku) return;
    var g = by[sku] || (by[sku] = { sku: sku, available: 0, held: 0, assigned: 0, building: 0 }), k;
    if (u.orderId) k = 'assigned';
    else if (u.inventoryStatus === 'available' && text(u.at, 40) === 'ready') k = u.hold ? 'held' : 'available';
    else k = 'building';
    g[k]++; totals[k]++;
    if (k === 'available' && avail.length < 500) avail.push({ serial: text(u.serial, 100), sku: sku, unitType: text(u.unitType, 40) || 'unit', test: u.test && u.test.result ? { result: text(u.test.result, 10) } : null });
  });
  var skus = Object.keys(by).sort().map(function (k) { return by[k]; });
  return { skus: skus, available: avail, totals: totals };
}

/* Completed units on orders: ready shipping units per works order, whether
   the order can ship, and what already left. */
function completed(rows) {
  var out = { readyOnOrders: 0, awaitingShipment: [], building: 0 };
  (Array.isArray(rows) ? rows : []).forEach(function (r) {
    if (!r || r.inventory) return;
    if (r.stage === 'complete') return;
    out.readyOnOrders += r.progress.readyRoots;
    if (r.stage === 'ready') out.awaitingShipment.push({ id: r.id, orderNo: r.orderNo, orderId: r.orderId, readyRoots: r.progress.readyRoots, due: r.due });
    else out.building += Math.max(0, r.progress.expectedRoots - r.progress.readyRoots);
  });
  return out;
}

module.exports = { floor: floor, queues: queues, demand: demand, stock: stock, finished: finished, completed: completed };
