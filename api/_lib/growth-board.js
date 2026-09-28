/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/growth-board.js — the facts the growth board is judged on, read
   from Firestore once for everyone who needs them
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Moved out of api/growth.js unchanged so the sales dashboard
   (api/sales.js) reads the SAME records the board does rather than a second
   join that would drift from it. api/_lib/growth.js stays the pure
   judgement; this is the Firestore half.

   Per workspace: the org record, billing/current, the member count, the
   newest lastSeen across the team, the project count (capped: the number a
   glance needs is "0, some, many"), the newest project, the billing profile
   and a pending access request for that domain. Read-only.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var G = require('./growth');

var MAX_ORGS = 300, MAX_PROJECTS = 500, MAX_SEEN = 200, MAX_MEMBERS = 200;

function soft(p, fallback) { return p.then(function (s) { return s; }, function () { return fallback; }); }
function count(q) { return soft(q.select().limit(MAX_PROJECTS).get().then(function (s) { return s.size; }), 0); }
function notFound(msg) { var e = new Error(msg); e.status = 404; return e; }

/* one workspace's record, from the documents a browser could not join */
function assemble(db, id, org, pendingRequests) {
  var ref = db.collection('omega_orgs').doc(id);
  return Promise.all([
    soft(ref.collection('billing').doc('current').get(), { exists: false }),
    soft(ref.collection('members').limit(MAX_MEMBERS).get(), { docs: [], size: 0, forEach: function () {} }),
    soft(db.collection('team_members').where('orgId', '==', id).limit(MAX_SEEN).get(), { docs: [], forEach: function () {} }),
    count(db.collection('projects').where('orgId', '==', id)),
    soft(db.collection('projects').where('orgId', '==', id).orderBy('createdAt', 'desc').limit(1).get(), { docs: [] }),
    /* the billing profile (packaging phase 4): the billing contact is who an
       invoice conversation goes to; the signup email or the owner otherwise */
    soft(ref.collection('billing').doc('profile').get(), { exists: false })
  ]).then(function (r) {
    var billing = r[0].exists ? (r[0].data() || {}) : {}, profile = r[5] && r[5].exists ? (r[5].data() || {}) : {};
    var members = [], owner = null;
    r[1].forEach(function (d) { var m = d.data() || {}; members.push(m); if (!owner && m.role === 'owner' && m.email) owner = m.email; });
    var lastSeen = null;
    r[2].forEach(function (d) { var ms = G.millis((d.data() || {}).lastSeen); if (ms != null && (lastSeen == null || ms > lastSeen)) lastSeen = ms; });
    var newest = r[4].docs && r[4].docs[0] ? G.millis((r[4].docs[0].data() || {}).createdAt) : null;
    var rq = pendingRequests[id] || null;
    return {
      orgId: id, name: org.name || id, vertical: org.vertical || null, status: org.status || 'active',
      createdAt: G.millis(org.createdAt), approvedAt: G.millis(org.approvedAt),
      /* a self-serve signup (start.html → api/tenant-signup) carries signup{};
         a seeded or staff-made workspace does not, and nobody waited on it */
      selfServe: !!(org.signup && org.signup.email),
      who: profile.email || (org.signup && org.signup.email) || owner || null,
      billing: { tier: billing.tier || null, trialEndsAt: G.millis(billing.trialEndsAt), lastPaidAt: G.millis(billing.lastPaidAt),
        subscriptionDue: G.millis(billing.subscriptionDue), amountDue: billing.amountDue == null ? null : Number(billing.amountDue),
        paymentProvider: billing.paymentProvider || null, status: billing.status || null, paymentFailedAt: G.millis(billing.paymentFailedAt),
        /* packaged (phases 1–4): the state machine's own word and the access deadline; no prices, no modules here */
        packaged: billing.packaged === true, packagingState: billing.packagingState || null, accessUntil: G.millis(billing.accessUntil) },
      members: members.length, lastSeenAt: lastSeen, projects: r[3], lastProjectAt: newest,
      accessRequestPending: !!rq, nudges: rq ? Number(rq.nudges || 0) : 0
    };
  });
}

/* Every workspace's record, or one (`only`, already a safe org id; 404 when
   there is no such workspace). */
function records(db, only) {
  /* access requests still pending, by the requester's domain: a person who
     signed themselves up before a tenant record existed */
  return soft(db.collection('access_requests').where('status', '==', 'pending').limit(MAX_ORGS).get(), { forEach: function () {} }).then(function (rs) {
    var pending = {};
    rs.forEach(function (d) { var x = d.data() || {}; var dom = String(x.domain || (x.email || '').split('@')[1] || '').toLowerCase(); if (dom) pending[dom] = x; });
    var q = only ? db.collection('omega_orgs').doc(only).get().then(function (s) { if (!s.exists) throw notFound('no such workspace'); return [s]; })
                 : db.collection('omega_orgs').limit(MAX_ORGS).get().then(function (s) { return s.docs; });
    return q.then(function (docs) {
      return Promise.all(docs.map(function (d) { return assemble(db, d.id, d.data() || {}, pending); }));
    });
  });
}

module.exports = { assemble: assemble, records: records, CAPS: { orgs: MAX_ORGS, projectsPerOrg: MAX_PROJECTS } };
