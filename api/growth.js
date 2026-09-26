/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/growth — the sign-up → trial → paying board, for staff and the
   sales agent
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   GET /api/growth              every workspace, most urgent first, with a
                                summary and today's list
   GET /api/growth?org=<orgId>  one workspace, with the facts behind the call

   Staff only (a VERIFIED @clearsky-usa.com address: caller.staff, never the
   email alone). Read-only: this endpoint writes nothing, sends nothing and
   decides nothing about access or price. It assembles, per workspace, what
   the platform already records — the org record, billing/current, the
   member count, the last time anyone opened the dashboard (team_members
   .lastSeen), the project count and the newest project — and hands it to
   api/_lib/growth.js, which is the pure judgement and the tested part.

   Why an endpoint and not a console widget: the agent reads JSON. A page
   can read the same JSON later; the console is the packaging build's
   territory right now and is not touched here (docs/SALES-AGENT.md).

   Caps keep one call bounded on a large registry: 300 workspaces, and per
   workspace a count capped at 500 projects (the number a glance needs is
   "0, some, many", not an exact 1,204).
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var A = require('./_lib/admin');
var G = require('./_lib/growth');

var MAX_ORGS = 300, MAX_PROJECTS = 500, MAX_SEEN = 200, MAX_MEMBERS = 200;

function soft(p, fallback) { return p.then(function (s) { return s; }, function () { return fallback; }); }
function count(q) { return soft(q.select().limit(MAX_PROJECTS).get().then(function (s) { return s.size; }), 0); }

/* one workspace's record, from the documents a browser could not join */
function assemble(db, id, org, pendingRequests) {
  var ref = db.collection('omega_orgs').doc(id);
  return Promise.all([
    soft(ref.collection('billing').doc('current').get(), { exists: false }),
    soft(ref.collection('members').limit(MAX_MEMBERS).get(), { docs: [], size: 0, forEach: function () {} }),
    soft(db.collection('team_members').where('orgId', '==', id).limit(MAX_SEEN).get(), { docs: [], forEach: function () {} }),
    count(db.collection('projects').where('orgId', '==', id)),
    soft(db.collection('projects').where('orgId', '==', id).orderBy('createdAt', 'desc').limit(1).get(), { docs: [] })
  ]).then(function (r) {
    var billing = r[0].exists ? (r[0].data() || {}) : {};
    var members = [], owner = null;
    r[1].forEach(function (d) { var m = d.data() || {}; members.push(m); if (!owner && m.role === 'owner' && m.email) owner = m.email; });
    var lastSeen = null;
    r[2].forEach(function (d) { var ms = G.millis((d.data() || {}).lastSeen); if (ms != null && (lastSeen == null || ms > lastSeen)) lastSeen = ms; });
    var newest = r[4].docs && r[4].docs[0] ? G.millis((r[4].docs[0].data() || {}).createdAt) : null;
    var rq = pendingRequests[id] || null;
    return {
      orgId: id, name: org.name || id, vertical: org.vertical || null, status: org.status || 'active',
      createdAt: G.millis(org.createdAt), approvedAt: G.millis(org.approvedAt),
      who: (org.signup && org.signup.email) || owner || null,
      billing: { tier: billing.tier || null, trialEndsAt: G.millis(billing.trialEndsAt), lastPaidAt: G.millis(billing.lastPaidAt),
        subscriptionDue: G.millis(billing.subscriptionDue), amountDue: billing.amountDue == null ? null : Number(billing.amountDue),
        paymentProvider: billing.paymentProvider || null, status: billing.status || null, paymentFailedAt: G.millis(billing.paymentFailedAt) },
      members: members.length, lastSeenAt: lastSeen, projects: r[3], lastProjectAt: newest,
      accessRequestPending: !!rq, nudges: rq ? Number(rq.nudges || 0) : 0
    };
  });
}

module.exports = A.handler(function (req) {
  if (req.method !== 'GET') throw A.httpError(405, 'GET only');
  return A.authenticate(req).then(function (caller) {
    if (!caller.staff) throw A.httpError(403, 'staff only');
    var db = A.db();
    var asked = (req.query && req.query.org) || '';
    var only = A.safeOrg(asked);
    if (asked && !only) throw A.httpError(400, 'org must be a workspace domain');
    /* access requests still pending, by the requester's domain: a person who
       signed themselves up before a tenant record existed */
    return soft(db.collection('access_requests').where('status', '==', 'pending').limit(MAX_ORGS).get(), { forEach: function () {} }).then(function (rs) {
      var pending = {};
      rs.forEach(function (d) { var x = d.data() || {}; var dom = String(x.domain || (x.email || '').split('@')[1] || '').toLowerCase(); if (dom) pending[dom] = x; });
      var q = only ? db.collection('omega_orgs').doc(only).get().then(function (s) { if (!s.exists) throw A.httpError(404, 'no such workspace'); return [s]; })
                   : db.collection('omega_orgs').limit(MAX_ORGS).get().then(function (s) { return s.docs; });
      return q.then(function (docs) {
        return Promise.all(docs.map(function (d) { return assemble(db, d.id, d.data() || {}, pending); }));
      }).then(function (records) {
        if (only) { var one = G.judge(records[0]); one.facts = records[0]; return one; }
        var b = G.board(records);
        b.caps = { orgs: MAX_ORGS, projectsPerOrg: MAX_PROJECTS };
        return b;
      });
    });
  });
});
