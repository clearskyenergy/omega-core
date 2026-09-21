/* ═══════════════════════════════════════════════════════════════════════════
   POST /api/jarvis-operations — CleanCell's factory capability for Jarvis
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Jarvis calls this for a tenant-scoped operations question. It has a narrow,
   evidence-only remit: build an explainable queue from orders, work orders
   and serialized travellers. No generative model is allowed to mutate the
   plant, and this endpoint provides no command that can release, ship, or
   clear a quality hold. The existing audited endpoints own those transitions.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

var A = require('./_lib/admin');
var Agent = require('./_lib/plant-agent');

var MAX_ORDERS = 250;
var MAX_WORKS = 250;
var MAX_UNITS = 1200;

function clean(v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max || 800); }
function mapped(snap) {
  var out = [];
  (snap.docs || []).forEach(function (d) {
    var x = d.data() || {};
    x.id = d.id;
    out.push(x);
  });
  return out;
}
function spokenReply(advice, question) {
  var reply = Agent.replyFor(advice, question);
  var next = (advice.actions || []).slice(0, 3).map(function (item) { return item.title + ': ' + item.detail; });
  if (next.length) reply += '\n\nNext:\n• ' + next.join('\n• ');
  if (advice.truncated) reply += '\n\nThis is a bounded view; ask the operations team for the full export before acting on a large backlog.';
  return reply;
}

module.exports = A.handler(function (req) {
  if (req.method !== 'POST') throw A.httpError(405, 'POST only');
  var body = req.body || {};
  var question = clean(body.message, 800);
  if (!question) throw A.httpError(400, 'Ask Jarvis an operations question.');

  return A.authenticate(req).then(function (caller) {
    var org = A.safeOrg(body.org || caller.orgId || '');
    if (!org) throw A.httpError(400, 'A valid tenant org is required.');
    return A.isTenantAdmin(caller, org).then(function (may) {
      if (!may) throw A.httpError(403, 'You are not an administrator of that tenant.');
      var db = A.db();
      return Promise.all([
        db.collection('orders').where('orgId', '==', org).limit(MAX_ORDERS + 1).get(),
        db.collection('plant_works_orders').where('orgId', '==', org).limit(MAX_WORKS + 1).get(),
        db.collection('plant_units').where('orgId', '==', org).limit(MAX_UNITS + 1).get()
      ]).then(function (rows) {
        var orderTooMany = rows[0].size > MAX_ORDERS;
        var workTooMany = rows[1].size > MAX_WORKS;
        var unitTooMany = rows[2].size > MAX_UNITS;
        var advice = Agent.advise({
          now: new Date().toISOString(), question: question,
          orders: mapped(rows[0]).slice(0, MAX_ORDERS),
          works: mapped(rows[1]).slice(0, MAX_WORKS),
          units: mapped(rows[2]).slice(0, MAX_UNITS),
          truncated: orderTooMany || workTooMany || unitTooMany
        });
        return {
          ok: true, capability: 'factory_operations', orgId: org,
          reply: spokenReply(advice, question), advice: advice
        };
      });
    });
  });
});
