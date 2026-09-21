/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/logic-summary[?limit=N] — the feed behind OMEGA LOGIC
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   ClearSky staff only, and cross-tenant on purpose: this is the Command
   Center's view of every order in the estate, where its units physically
   are, what is stuck, and what money is owed against it.

   The arranging is all in api/_lib/logic.js, which is pure and tested. This
   file authenticates, reads, and hands over — the same split as
   api/mes-scan.js over api/_lib/plant.js.

   ── WHY THIS IS AN ENDPOINT WHEN orders.html READS FIRESTORE DIRECTLY ────
   api/orders.js says reads are not there, because orders.html queries
   Firestore and the rules decide. That is right for a page scoped to one
   tenant. It is wrong here:

     1. This is a JOIN across three collections — orders,
        plant_works_orders, plant_units — and the join key (orderNo) is not
        something a rule can follow. A browser doing it would make one query
        per order and hold the whole estate open on a listener.
     2. Staff read everything, so there is no scoping work left for the rules
        to do. The only question is whether the caller is staff, and that is
        one check in one place.

   ── THE FLOOR JOIN IS BOUNDED BY STATUS, NOT BY A CAP ────────────────────
   An order that is 'new', 'quoted' or 'cancelled' cannot have units; the
   works order is raised at release. Joining only the orders that could be on
   the floor keeps this to a handful of reads on a dashboard that polls, and
   the bound tightens rather than loosens as old orders complete.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

var A = require('./_lib/admin');
var L = require('./_lib/logic');

var MAX_ORDERS = 120;
var DEFAULT_ORDERS = 60;

/* ONE MORE THAN WE WILL ACCEPT. The roll-up computes a worst-of across the
   roster, so a silently clipped list does not produce a slightly stale
   answer — it produces a confidently WRONG one, reporting the order at
   whichever milestone the units that happened to fit are at. Asking for
   CAP+1 lets us detect the clip instead of guessing. Same argument, same
   number, as api/my-orders.js. */
var UNIT_CAP = 400;

function norm(v) { return String(v == null ? '' : v).trim(); }
function lower(v) { return norm(v).toLowerCase(); }
function clip(v, n) { return v == null ? null : String(v).slice(0, n || 200); }

/* works order by (orgId, orderNo) → units by (orgId, woId).

   Both composites are in firestore.indexes.json as of 2026-09-20. They were
   listed in docs/firestore.rules.plant.addendum and never added, so the first
   works order to exist would have thrown FAILED_PRECONDITION here and in
   api/my-orders.js.

   Returns known:false rather than an empty roster when a read fails or the
   roster is clipped, because [] claims the floor had nothing to say. */
function floorOf(db, orgId, orderNo) {
  if (!orgId || !orderNo) return Promise.resolve({ units: [], known: true, released: false });

  return db.collection('plant_works_orders')
    .where('orgId', '==', orgId).where('orderNo', '==', orderNo).limit(5).get()
    .then(function (wos) {
      if (!wos || wos.empty) return { units: [], known: true, released: false };

      var ids = [];
      wos.forEach(function (d) { ids.push(d.id); });

      return Promise.all(ids.map(function (id) {
        return db.collection('plant_units')
          .where('orgId', '==', orgId).where('woId', '==', id).limit(UNIT_CAP + 1).get()
          .then(function (s) {
            var out = [];
            s.forEach(function (d) {
              var v = d.data() || {};
              out.push({
                serial: clip(v.serial || d.id, 80),
                at: norm(v.at),
                hold: v.hold ? clip(v.hold, 200) : null,
                ncr: v.ncr ? clip(v.ncr, 60) : null
              });
            });
            return out.length > UNIT_CAP ? null : out;    /* clipped: unknown */
          }, function () { return null; });               /* read failed: unknown */
      })).then(function (lists) {
        var all = [];
        for (var i = 0; i < lists.length; i++) {
          if (lists[i] === null) return { units: [], known: false, released: true };
          all = all.concat(lists[i]);
        }
        return { units: all, known: true, released: true };
      });
    }, function () { return { units: [], known: false, released: null }; });
}

module.exports = A.handler(function (req) {
  if (req.method !== 'GET') throw A.httpError(405, 'GET only');

  return A.authenticate(req).then(function (caller) {
    /* There is no org axis here on purpose. A tenant asking for a
       cross-tenant roll-up is exactly what this refuses, and it refuses by
       being staff-only rather than by filtering — a filter is a thing
       somebody can forget to apply. */
    if (!caller.staff) throw A.httpError(403, 'ClearSky staff only');

    if (typeof A.isDegraded === 'function' && A.isDegraded()) {
      throw A.httpError(503, 'Omega Logic is temporarily unavailable: ' +
        (typeof A.degradedReason === 'function' ? A.degradedReason() : 'the datastore is not reachable'));
    }

    var db = A.db();
    var want = Number((req.query && req.query.limit) || DEFAULT_ORDERS);
    var limit = Math.max(1, Math.min(MAX_ORDERS, isFinite(want) ? want : DEFAULT_ORDERS));

    /* orderBy on a single field needs no composite. createdAt is a Timestamp,
       so this cannot be done in JavaScript afterwards — every row
       stringifies identically and the comparator returns 0 throughout. */
    var query = db.collection('orders');
    if (req.query && req.query.org) {
      var org = A.safeOrg(req.query.org);
      if (!org) throw A.httpError(400, 'Invalid OEM account');
      query = query.where('orgId', '==', org);
    }
    return query.orderBy('createdAt', 'desc').limit(limit).get()
      .then(function (snap) {
        var orders = [];
        snap.forEach(function (d) { var v = d.data() || {}; v._id = d.id; orders.push(v); });

        return Promise.all(orders.map(function (o) {
          if (!L.needsFloor(o)) return Promise.resolve({ units: [], known: true, released: false });
          return floorOf(db, lower(o.orgId), norm(o.orderNo));
        })).then(function (floors) {
          return L.rollup(orders, floors, new Date().toISOString());
        });
      });
  });
});
