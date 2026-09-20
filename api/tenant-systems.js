/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/tenant-systems?org=<orgId>
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   "What does ClearSky run for this tenant, and how is each piece doing?"

   Answers for a ClearSky operator OR that tenant's own admin, in one shape,
   so the admin console renders it and an agent reads it without either of
   them learning six surfaces separately.

   ── WHO MAY ASK ──────────────────────────────────────────────────────────
   isTenantAdmin(caller, org) — which A.isTenantAdmin already means "staff, or
   an owner/admin member of that org". A member who is not an admin gets a
   403: this manifest names caps, order counts and seat counts, which is
   commercial information about the tenant, not about the user.

   ── WHAT IT MAY NOT SAY ──────────────────────────────────────────────────
   The tenant's storefront config carries capexPerKwh / capexPerKw — THE COST
   BASIS. api/_lib/systems.js builds its output key by key and never receives
   those fields; this file never reads them. scripts/test-systems-manifest.js
   asserts they are absent from the output on a deliberately poisoned input,
   because "the author remembered" is not a control.

   ── COUNTS ARE COUNTS, NOT DOCUMENTS ─────────────────────────────────────
   Every gather below is an aggregate. Nothing returns a customer, an order or
   a unit, so a widened manifest cannot become a data export by accident.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var A = require('./_lib/admin.js');
var S = require('./_lib/systems.js');

function dayStartISO(now) {
  var d = new Date(now || Date.now());
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString();
}

/* A count that refuses to take the whole endpoint down. A tenant with no
   plant floor has no plant_units collection and no composite index for it;
   one missing index must not blank the other five surfaces. */
function countOf(q) {
  return q.get().then(function (s) { return s.size; }, function () { return 0; });
}

module.exports = A.handler(function (req) {
  if (req.method !== 'GET') throw A.httpError(405, 'GET only');

  return A.authenticate(req).then(function (caller) {
    /* SHAPE-CHECKED — see api/_lib/admin.js safeOrg(). Lower-casing alone
       let a multi-segment path through to .doc(). */
    var org = A.safeOrg((req.query && req.query.org) || caller.orgId || '');
    if (!org) throw A.httpError(400, 'a valid org is required');

    return A.isTenantAdmin(caller, org).then(function (may) {
      if (!may) throw A.httpError(403, 'not an admin of this organisation');

      var db = A.db();
      var since = dayStartISO();
      var orgRef = db.collection('omega_orgs').doc(org);

      return Promise.all([
        orgRef.get(),
        orgRef.collection('billing').doc('current').get().catch(function () { return null; }),
        orgRef.collection('storefront').doc('config').get().catch(function () { return null; }),
        db.collection('embed_keys').where('orgId', '==', org).where('active', '==', true).get()
          .catch(function () { return { empty: true, docs: [] }; }),
        countOf(db.collection('orders').where('orgId', '==', org).where('status', '==', 'new')),
        countOf(db.collection('orders').where('orgId', '==', org).where('status', '==', 'confirmed')),
        countOf(db.collection('orders').where('orgId', '==', org).where('status', '==', 'quoted')),
        countOf(db.collection('orders').where('orgId', '==', org).where('status', '==', 'in_fulfilment')),
        countOf(db.collection('orders').where('orgId', '==', org).where('status', '==', 'shipped')),
        countOf(db.collection('orders').where('orgId', '==', org).where('createdAt', '>=', since)),
        countOf(db.collection('plant_stations').where('orgId', '==', org)),
        countOf(db.collection('plant_stations').where('orgId', '==', org).where('active', '==', true)),
        countOf(db.collection('plant_units').where('orgId', '==', org).where('hold', '==', null)),
        countOf(db.collection('plant_units').where('orgId', '==', org).where('hold', '!=', null)),
        countOf(db.collection('plant_scans').where('orgId', '==', org).where('createdAt', '>=', since)),
        countOf(orgRef.collection('customers')),
        countOf(orgRef.collection('customers').where('plan', '==', 'designer'))
      ]).then(function (r) {
        var o = (r[0] && r[0].exists ? r[0].data() : {}) || {};
        var bill = (r[1] && r[1].exists ? r[1].data() : {}) || {};
        var sf = (r[2] && r[2].exists ? r[2].data() : {}) || {};
        var keys = r[3] || { docs: [] };

        /* Origins are counted and the FIRST is echoed as a label. The rest
           are not: an allowlist is hygiene, and a full copy of it in a status
           feed is a list of a partner's domains for no operational gain. */
        var origins = [];
        (keys.docs || []).forEach(function (d) {
          var v = (d.data() || {}).origins;
          if (Array.isArray(v)) origins = origins.concat(v);
        });

        var wl = o.whiteLabel || {};

        /* Named, one at a time. Nothing below is a spread, and `sf` is read
           for exactly three booleans and one cap — never for capexPerKwh. */
        return S.buildManifest({
          orgId: org,
          name: o.name,
          status: o.status,
          tier: bill.tier,
          platformName: wl.platformName,
          editorMode: o.editorMode,
          toolAccess: bill.toolAccess,

          embedKeyActive: !!(keys.docs && keys.docs.length),
          origins: origins,
          originCount: origins.length,
          ordersToday: r[9],
          dailyOrderCap: sf.dailyOrderCap,

          siteStudyOn: sf.siteStudy === true,
          parcelToday: 0,                 /* the ledger is per-org per-day; see below */
          dailyParcelCap: sf.dailyParcelCap,

          ordersNew: r[4], ordersConfirmed: r[5], ordersQuoted: r[6],
          ordersInFulfilment: r[7], ordersShipped: r[8],

          benches: r[10], benchesActive: r[11],
          unitsInFlight: r[12], unitsOnHold: r[13],
          scansToday: r[14], refusalsToday: 0,

          customers: r[15], portalUsers: 0, signInsThisWeek: 0, customersWithOrders: 0,
          designerSeats: r[16]
        }, new Date().toISOString());
      });
    });
  });
});

/* ── KNOWN-PARTIAL, stated rather than implied ──────────────────────────────
   parcelToday, refusalsToday, portalUsers, signInsThisWeek and
   customersWithOrders are reported as 0 until the counters they need exist:
   the parcel allowance lives in a per-org daily counter document the site
   study writes, the portal's users are a collection-group query that needs
   its own index, and refusals need plant_scans filtered on ok == false. Each
   is a small addition; none of them should be guessed at in the meantime,
   because a status feed that invents a number is worse than one that admits
   a gap. They read 0 with the surface still reporting its real state.
   ────────────────────────────────────────────────────────────────────────── */
