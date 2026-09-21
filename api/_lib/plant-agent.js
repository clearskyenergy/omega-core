/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/plant-agent.js — explainable factory-operation priorities
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   This is deliberately a deterministic agent, not a language model with a
   database credential. Scans, test results and human quality decisions are
   the evidence; this module turns that evidence into the next safe work for a
   supervisor. It never changes a traveller, releases an order, clears a hold
   or marks anything shipped. Those actions remain at their audited endpoints.

   Keeping the prioritisation pure makes it testable and makes it safe for
   Jarvis to call: a bad interpretation can produce a bad suggestion, never a
   bad factory record.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

var P = require('./plant');

function text(v, max) { return String(v == null ? '' : v).trim().slice(0, max || 160); }
function iso(v) {
  if (!v) return null;
  if (typeof v.toDate === 'function') v = v.toDate();
  var d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}
function time(v) {
  var x = iso(v);
  return x ? new Date(x).getTime() : null;
}
function routingOf(works) {
  try { return P.routingOf(works || {}); }
  catch (e) { return P.DEFAULT_ROUTING; }
}
function stageOf(unit, routing) {
  var at = text(unit && unit.at, 40);
  if (!at) return routing[0] || null;
  var i = P.indexOf(routing, at);
  return i < 0 ? null : (routing[i + 1] || null);
}
function action(key, priority, title, detail, data) {
  return {
    key: key, priority: priority, title: text(title, 120), detail: text(detail, 240),
    data: data || null
  };
}
function number(v) { v = Number(v); return isFinite(v) ? v : 0; }

/* Returns an ordered, bounded queue. `orders`, `works` and `units` are
   already scoped by the API; this module never decides what a caller can see. */
function advise(input) {
  input = input || {};
  var now = time(input.now) || Date.now();
  var orders = Array.isArray(input.orders) ? input.orders : [];
  var works = Array.isArray(input.works) ? input.works : [];
  var units = Array.isArray(input.units) ? input.units : [];
  var workById = {}, workByOrder = {}, queue = {}, held = [], actionItems = [];
  var summary = { orders: orders.length, worksOrders: works.length, units: units.length,
    unstarted: 0, inProgress: 0, ready: 0, held: 0, dueSoon: 0, overdue: 0, offRouting: 0 };

  works.forEach(function (w) {
    w = w || {};
    var id = text(w.id || w.woId, 120);
    if (id) workById[id] = w;
    var orderId = text(w.orderId, 120);
    if (orderId) workByOrder[orderId] = w;
  });

  /* Accepted commercial orders without a work order are actionable, but this
     agent only names them. Releasing requires serials and genealogy, which an
     autonomous inference must never fabricate. */
  orders.forEach(function (o) {
    o = o || {};
    if (text(o.status, 40).toLowerCase() !== 'accepted') return;
    if (workByOrder[text(o.id, 120)] || text(o.worksOrderId, 120)) return;
    actionItems.push(action('release_work_order', 2, 'Release accepted order',
      (text(o.orderNo, 120) || 'Order') + ' is accepted but has no serialized work order.',
      { orderId: text(o.id, 120), orderNo: text(o.orderNo, 120) || null }));
  });

  units.forEach(function (u) {
    u = u || {};
    var work = workById[text(u.woId, 120)] || {};
    var routing = routingOf(work);
    var next = stageOf(u, routing);
    var at = text(u.at, 40);
    var heldNow = !!u.hold;
    var station = at || 'unstarted';
    if (!queue[station]) queue[station] = { key: station, label: at ? P.labelOf(routing, at) : 'Not started', count: 0, held: 0, next: next ? next.key : null };
    queue[station].count++;
    if (heldNow) queue[station].held++;

    if (!at) summary.unstarted++;
    else if (at === 'ready' && !heldNow) summary.ready++;
    else summary.inProgress++;
    if (heldNow) {
      summary.held++;
      held.push({ serial: text(u.serial, 100), workOrderId: text(u.woId, 120) || null,
        orderNo: text(u.orderNo || work.orderNo, 120) || null, at: at || null,
        station: at ? P.labelOf(routing, at) : 'Not started', hold: text(u.hold, 240),
        ncr: text(u.ncr, 80) || null, failedAt: iso(u.testFailedAt) });
    } else if (at && P.indexOf(routing, at) < 0) {
      summary.offRouting++;
    }
  });

  works.forEach(function (w) {
    w = w || {};
    var due = time(w.promisedShipAt);
    if (!due) return;
    var id = text(w.id || w.woId, 120);
    var hasReadyRoot = units.some(function (u) {
      return text(u && u.woId, 120) === id && !!(u && u.shipUnit) && text(u && u.at, 40) === 'ready' && !(u && u.hold);
    });
    if (due < now && !hasReadyRoot) {
      summary.overdue++;
      actionItems.push(action('protect_ship_date', 1, 'Protect an overdue work order',
        (text(w.orderNo, 120) || id || 'Work order') + ' is overdue and has no ready shipping unit.',
        { workOrderId: id || null, orderNo: text(w.orderNo, 120) || null, due: iso(w.promisedShipAt) }));
    } else if (due - now <= 3 * 86400000 && !hasReadyRoot) {
      summary.dueSoon++;
      actionItems.push(action('review_due_work_order', 3, 'Review a near-due work order',
        (text(w.orderNo, 120) || id || 'Work order') + ' is due within three days and has no ready shipping unit.',
        { workOrderId: id || null, orderNo: text(w.orderNo, 120) || null, due: iso(w.promisedShipAt) }));
    }
  });

  held.sort(function (a, b) { return (a.failedAt || '').localeCompare(b.failedAt || ''); });
  held.slice(0, 20).forEach(function (h) {
    actionItems.push(action('quality_hold', 0, 'Resolve a quality hold',
      (h.serial || 'Unit') + ' is held at ' + (h.station || 'the floor') + (h.ncr ? ' · ' + h.ncr : '') + '.', h));
  });
  if (summary.offRouting) {
    actionItems.push(action('routing_exception', 1, 'Investigate a routing exception',
      summary.offRouting + ' unit' + (summary.offRouting === 1 ? ' is' : 's are') + ' recorded at a station outside its work-order routing.',
      { count: summary.offRouting }));
  }

  actionItems.sort(function (a, b) { return a.priority - b.priority || a.title.localeCompare(b.title); });
  var queues = Object.keys(queue).map(function (key) { return queue[key]; });
  queues.sort(function (a, b) { return b.count - a.count || a.label.localeCompare(b.label); });

  return {
    asOf: new Date(now).toISOString(),
    summary: summary,
    queues: queues,
    holds: held.slice(0, 50),
    actions: actionItems.slice(0, 40),
    truncated: !!input.truncated
  };
}

function replyFor(advice, question) {
  var s = (advice && advice.summary) || {};
  var q = text(question, 500).toLowerCase();
  if (s.held) {
    return s.held + ' unit' + (s.held === 1 ? ' is' : 's are') + ' on quality hold. '
      + (s.overdue ? s.overdue + ' work order' + (s.overdue === 1 ? ' is' : 's are') + ' past due. ' : '')
      + 'The first priority is dispositioning the holds; Jarvis will not release them.';
  }
  if (/release|accepted|work.?order/.test(q) && advice.actions.some(function (a) { return a.key === 'release_work_order'; })) {
    return 'There are accepted orders waiting for serialized work-order release. I can identify them, but release still needs the real serials and component genealogy.';
  }
  if (s.overdue) return s.overdue + ' work order' + (s.overdue === 1 ? ' is' : 's are') + ' overdue without a ready shipping unit. Review the due-date cards first.';
  if (s.units === 0) return 'There are no released units on this factory floor yet. Accepted orders become traceable only after a serialized work order is released.';
  return s.units + ' serialized unit' + (s.units === 1 ? ' is' : 's are') + ' on the floor: '
    + s.inProgress + ' in progress, ' + s.ready + ' ready, and ' + s.unstarted + ' not started.';
}

module.exports = { advise: advise, replyFor: replyFor, stageOf: stageOf, iso: iso, number: number };
