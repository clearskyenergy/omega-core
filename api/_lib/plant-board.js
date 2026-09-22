/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/plant-board.js — the work-order board: progress, stage and activity
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   PURE. No Firestore, no clock it does not receive. Everything the board
   shows — "6 of 15 steps done · 40%", "2 of 3 shipping units ready", the
   bottleneck operation, the late flag, the activity feed — is derived here
   from works orders and units the API already scoped. The browser only
   renders. A percentage the office may quote to a customer is computed in
   one place, next to the scan engine that produced the evidence, and it is
   testable without a plant (scripts/test-plant-board.js).

   ── WHAT COUNTS AS PROGRESS ──────────────────────────────────────────────
   A unit at station i of an n-step routing has completed i+1 steps. Summed
   over every unit on the works order, that is `done` out of `total`. It is
   deliberately per UNIT, not per shipping root: a cabinet whose cells are
   still at Kitting is not 90% built because the cabinet shell reached
   Electrical.

   ── WHAT COUNTS AS READY ─────────────────────────────────────────────────
   Only a shipping root at `ready` and not on hold. The expected count comes
   from the works order's requirements (the sale), falling back to what was
   registered for legacy releases. A works order whose serials have not been
   registered yet is "awaiting serials", never "0% in progress".

   ── THE ACTIVITY FEED IS DERIVED, NOT STORED TWICE ───────────────────────
   Every scan leaves `done[station] = when` on the unit and every machine
   result and hold leaves its timestamps. The feed is those facts, sorted.
   plant_scans remains the immutable ledger; this reads the units the caller
   already loaded rather than adding a second indexed query per detail view.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

var P = require('./plant');

var STAGES = {
  awaiting_serials: 'Awaiting serials',
  not_started: 'Not started',
  in_progress: 'In progress',
  on_hold: 'On hold',
  ready: 'Ready to ship',
  complete: 'Complete'
};
var PRIORITY_RANK = { urgent: 0, normal: 1, low: 2 };
/* Units read per board chunk. Registration caps a batch at 400, so ten works
   orders can never legitimately exceed this; hitting it means a partial
   count, and the board says so rather than showing a wrong percentage. */
var UNIT_CAP = 4000;

function text(v, max) { return String(v == null ? '' : v).trim().slice(0, max || 160); }
function iso(v) {
  if (!v) return null;
  if (typeof v.toDate === 'function') v = v.toDate();
  else if (typeof v === 'object' && typeof v._seconds === 'number') v = new Date(v._seconds * 1000);
  var d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}
function routingOf(w) { try { return P.routingOf(w || {}); } catch (e) { return P.DEFAULT_ROUTING; } }

/* The date the floor works to: the manager's target date wins, then the
   promised ship date carried from the order. Always a YYYY-MM-DD string. */
function dueOf(w) {
  var d = text(w && w.dueDate, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  var p = iso(w && w.promisedShipAt);
  return p ? p.slice(0, 10) : null;
}

function expectedRoots(w, registeredRoots) {
  var req = Array.isArray(w && w.requirements) ? w.requirements : [];
  var n = 0;
  req.forEach(function (r) { var q = Math.floor(Number(r && r.qty) || 0); if (q > 0) n += q; });
  if (n) return n;
  return Number(w && w.shippingUnitCount) || registeredRoots || 0;
}

function progress(w, units) {
  units = Array.isArray(units) ? units : [];
  var routing = routingOf(w), steps = routing.length, byStation = {}, queues = [];
  routing.forEach(function (s) {
    byStation[s.key] = { key: s.key, label: s.label, count: 0, held: 0, machine: P.MACHINE_STATIONS.indexOf(s.key) >= 0 };
    queues.push(byStation[s.key]);
  });
  var out = { units: units.length, steps: steps, done: 0, total: 0, percent: 0, roots: 0, expectedRoots: 0,
    readyRoots: 0, held: 0, failed: 0, unstarted: 0, offRouting: 0, queues: queues, nextUp: null };
  units.forEach(function (u) {
    u = u || {};
    var at = text(u.at, 40), i = at ? P.indexOf(routing, at) : -1;
    out.total += steps;
    if (!at) out.unstarted++;
    else if (i < 0) out.offRouting++;
    else { out.done += i + 1; byStation[at].count++; if (u.hold) byStation[at].held++; }
    if (u.hold) out.held++;
    if (u.test && u.test.result === 'fail') out.failed++;
    if (u.shipUnit) { out.roots++; if (at === 'ready' && !u.hold) out.readyRoots++; }
  });
  out.expectedRoots = expectedRoots(w, out.roots);
  out.percent = out.total ? Math.round(100 * out.done / out.total) : 0;
  /* The bottleneck: the operation, short of Ready, holding the most units.
     What a supervisor walks to first. */
  queues.forEach(function (q) {
    if (q.key === 'ready' || !q.count) return;
    if (!out.nextUp || q.count > out.nextUp.count) out.nextUp = { key: q.key, label: q.label, count: q.count, held: q.held };
  });
  return out;
}

function stageOf(w, p) {
  var status = text(w && w.status, 40);
  if (status === 'complete' || status === 'shipped') return 'complete';
  if (!p.units) return 'awaiting_serials';
  if (p.held) return 'on_hold';
  if (p.done === p.total && p.roots >= p.expectedRoots) return 'ready';
  if (!p.done) return 'not_started';
  return 'in_progress';
}

function isLate(due, stage, now) {
  if (!due || stage === 'ready' || stage === 'complete') return false;
  var today = (iso(now) || new Date().toISOString()).slice(0, 10);
  return due < today;
}

/* One board row. `now` is injectable so "late" is testable. */
function row(w, units, now) {
  w = w || {};
  var p = progress(w, units), stage = stageOf(w, p), due = dueOf(w), routing = routingOf(w);
  var services = Array.isArray(w.serviceRequirements) ? w.serviceRequirements : [];
  return {
    id: text(w.id, 120), orderNo: text(w.orderNo, 120) || text(w.id, 120), orderId: text(w.orderId, 120) || null,
    inventory: !!w.inventory, lineId: text(w.lineId, 40), priority: PRIORITY_RANK.hasOwnProperty(w.priority) ? w.priority : 'normal',
    priorityRank: PRIORITY_RANK.hasOwnProperty(w.priority) ? PRIORITY_RANK[w.priority] : 1,
    due: due, late: isLate(due, stage, now), assignee: text(w.assignee, 120),
    status: text(w.status, 40), stage: stage, stageLabel: STAGES[stage], flowVersion: Number(w.flowVersion) || 0,
    routing: routing.map(function (s) { return { key: s.key, label: s.label, machine: P.MACHINE_STATIONS.indexOf(s.key) >= 0 }; }),
    requirements: (Array.isArray(w.requirements) ? w.requirements : []).map(function (r) {
      return { sku: text(r && r.sku, 100), qty: Math.floor(Number(r && r.qty) || 0), name: text(r && r.name, 160) || null }; }),
    registeredCounts: w.registeredCounts && typeof w.registeredCounts === 'object' ? w.registeredCounts : {},
    releasedUnits: Number(w.releasedUnits) || 0,
    managerNotes: text(w.managerNotes, 3000), managerRevision: Number(w.managerRevision) || 0,
    services: { required: services.map(function (s) { return { sku: text(s && s.sku, 100), name: text(s && s.name, 160) || null, qty: Math.floor(Number(s && s.qty) || 0) }; }),
      completion: w.serviceCompletion ? { by: text(w.serviceCompletion.by, 160), at: text(w.serviceCompletion.at, 40), evidence: text(w.serviceCompletion.evidence, 3000) } : null },
    createdAt: iso(w.createdAt), updatedAt: iso(w.updatedAt) || iso(w.createdAt),
    progress: p
  };
}

/* "Action taken": every dated fact the units carry, newest first. */
function activity(units, w, limit) {
  var routing = routingOf(w), out = [];
  (Array.isArray(units) ? units : []).forEach(function (u) {
    u = u || {};
    var serial = text(u.serial, 100), done = u.done && typeof u.done === 'object' ? u.done : {};
    Object.keys(done).forEach(function (k) {
      var t = iso(done[k]);
      if (t) out.push({ at: t, serial: serial, kind: 'scan', station: k, say: P.labelOf(routing, k) + ' completed' });
    });
    var arrived = iso(u.arrivedAt), at = text(u.at, 40);
    if (arrived && at) out.push({ at: arrived, serial: serial, kind: 'scan', station: at, say: 'Arrived at ' + P.labelOf(routing, at) });
    if (u.test && u.test.at) {
      var t2 = iso(u.test.at);
      if (t2) out.push({ at: t2, serial: serial, kind: 'test', station: text(u.test.station, 40),
        say: u.test.result === 'pass' ? 'Machine test passed' : 'Machine test FAILED' + (u.test.failureCode ? ' · ' + text(u.test.failureCode, 100) : '') });
    }
    if (u.hold && u.holdAt) {
      var t3 = iso(u.holdAt);
      if (t3) out.push({ at: t3, serial: serial, kind: 'hold', station: at, say: 'Hold placed — ' + text(u.hold, 240), by: text(u.holdBy, 160) || null, ncr: text(u.ncr, 80) || null });
    }
    if (u.holdReleasedAt) {
      var t4 = iso(u.holdReleasedAt);
      if (t4) out.push({ at: t4, serial: serial, kind: 'release', station: at, say: 'Hold released — ' + text(u.holdDisposition, 240), by: text(u.holdReleasedBy, 160) || null });
    }
  });
  out.sort(function (a, b) { return a.at < b.at ? 1 : a.at > b.at ? -1 : a.serial.localeCompare(b.serial); });
  return out.slice(0, limit || 40);
}

/* The default order of the board: what needs a supervisor first. */
function compare(a, b) {
  if (a.late !== b.late) return a.late ? -1 : 1;
  if (a.priorityRank !== b.priorityRank) return a.priorityRank - b.priorityRank;
  if ((a.due || '') !== (b.due || '')) { if (!a.due) return 1; if (!b.due) return -1; return a.due < b.due ? -1 : 1; }
  return (b.createdAt || '').localeCompare(a.createdAt || '');
}

module.exports = { STAGES: STAGES, UNIT_CAP: UNIT_CAP, progress: progress, stageOf: stageOf, dueOf: dueOf, expectedRoots: expectedRoots,
  row: row, activity: activity, compare: compare, iso: iso };
