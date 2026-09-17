/* ═══════════════════════════════════════════════════════════════════════════════
   GET /api/sites-projection   —  what OTHER portals see of a shared site
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Other portals never read `sites` documents raw. Firestore rules do let a
   grantee org read the canonical document (so an in-app tool can subscribe),
   but anything that renders for a PARTNER or the PUBLIC goes through here so
   the confidential block is stripped on the server, once, by a whitelist.

   Modes:
     ?orgId=<mine>                     signed in. Sites SHARED TO my org
                                       (site_shares.toOrgId == mine), partner
                                       projection. Optional &portfolioId=,
                                       &fromOrgId= to narrow.
     ?orgId=<mine>&own=1               signed in. My own org's sites, FULL
                                       record (owner-facing page). Same access
                                       check as the rules: canActInOrg.
     ?public=1&portfolioId=<id>        no token needed. Sites the owner marked
                                       `public: true`, public projection only:
                                       no street address, coordinates rounded.

   Only ACCEPTED sites are ever returned to a non-owner. A pending import is
   not yet a fact the owner has vouched for.
   ═══════════════════════════════════════════════════════════════════════════════ */
'use strict';
var A = require('./_lib/admin');
var SP = require('./_lib/site-spine');

var LIMIT = 1000;

module.exports = A.handler(function (req) {
  if (req.method !== 'GET') throw A.httpError(405, 'GET only');
  var q = req.query || {};
  if (q['public'] === '1') return publicSites(q);
  return A.authenticate(req).then(function (caller) {
    var orgId = String(q.orgId || caller.orgId).toLowerCase();
    return A.canActInOrg(caller, orgId).then(function (ok) {
      if (!ok) throw A.httpError(403, 'you are not entitled to act in ' + orgId);
      return q.own === '1' ? ownSites(orgId, q) : sharedSites(orgId, q);
    });
  });
});

function ownSites(orgId, q) {
  var db = A.db();
  var ref = db.collection('sites').where('orgId', '==', orgId);
  if (q.portfolioId) ref = ref.where('portfolioId', '==', String(q.portfolioId));
  return ref.limit(LIMIT).get().then(function (snap) {
    var out = [];
    snap.forEach(function (d) { var s = d.data(); s.siteId = s.siteId || d.id; out.push(s); });
    return { orgId: orgId, mode: 'owner', count: out.length, sites: out };
  });
}

function sharedSites(orgId, q) {
  var db = A.db();
  var ref = db.collection('site_shares').where('toOrgId', '==', orgId);
  if (q.fromOrgId) ref = ref.where('fromOrgId', '==', String(q.fromOrgId).toLowerCase());
  return ref.limit(LIMIT).get().then(function (grants) {
    var ids = [];
    grants.forEach(function (g) { var d = g.data(); if (d.scope === 'read' && d.siteId) ids.push(d.siteId); });
    if (!ids.length) return { orgId: orgId, mode: 'partner', count: 0, sites: [] };
    var refs = ids.map(function (id) { return db.collection('sites').doc(id); });
    return db.getAll.apply(db, refs).then(function (snaps) {
      var out = [];
      snaps.forEach(function (s) {
        if (!s.exists) return;
        var d = s.data(); d.siteId = d.siteId || s.id;
        if (!SP.isShareable(d)) return;
        if (q.portfolioId && d.portfolioId !== String(q.portfolioId)) return;
        out.push(SP.project(d, 'partner'));
      });
      return { orgId: orgId, mode: 'partner', count: out.length, sites: out };
    });
  });
}

function publicSites(q) {
  var db = A.db();
  if (!q.portfolioId) throw A.httpError(400, 'portfolioId is required for the public projection');
  return db.collection('sites').where('portfolioId', '==', String(q.portfolioId)).where('public', '==', true)
    .limit(LIMIT).get().then(function (snap) {
      var out = [];
      snap.forEach(function (s) { var d = s.data(); d.siteId = d.siteId || s.id; if (SP.isShareable(d)) out.push(SP.project(d, 'public')); });
      return { mode: 'public', portfolioId: String(q.portfolioId), count: out.length, sites: out };
    });
}
