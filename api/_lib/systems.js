/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/systems.js — what ClearSky runs for one tenant, and how it is doing
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   PURE. No Firestore, no network, no clock it does not receive. The endpoint
   gathers counts; this decides what the manifest says. Testable without
   standing up a tenant — see scripts/test-systems-manifest.js.

   ── WHY A MANIFEST AND NOT A DASHBOARD ───────────────────────────────────
   A panel only a human can read is a panel somebody has to remember to open.
   This is served as JSON as well as rendered, so an agent can report on the
   whole estate — "Clean Cell's storefront is at 58 of 60 orders today" —
   without scraping a page or being taught each surface separately.

   ── IT IS BUILT KEY BY KEY, AND THAT IS LOAD-BEARING ─────────────────────
   The documents this reads are NOT safe to forward. omega_orgs/{org} carries
   the whiteLabel block; the storefront config carries capexPerKwh and
   capexPerKw — THE TENANT'S COST BASIS, which CLAUDE.md says must never be in
   the repo and is certainly not going in a status feed. So nothing here
   spreads a document. Every field is named, the same discipline
   api/embed-config.js is built on, and the test asserts the cost basis is
   absent from the output rather than trusting the author to remember.

   ── HEALTH IS A WORD, NOT A COLOUR ───────────────────────────────────────
   Each surface reports `state` as 'ok' | 'warn' | 'down' | 'off' AND a `say`
   sentence. Colour alone does not survive being read aloud by an agent, and
   'off' is not 'down': a tenant who never bought the plant floor is not a
   tenant whose plant floor is broken.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

function num(v) { var n = Number(v); return isFinite(n) && n >= 0 ? n : 0; }
function str(v, max) { return String(v == null ? '' : v).slice(0, max || 200); }

/* A capped resource: how close is it to the ceiling somebody set? */
function capState(used, cap) {
  if (!cap) return { state: 'ok', pct: null };
  var pct = Math.round((num(used) / cap) * 100);
  return { state: pct >= 100 ? 'down' : pct >= 80 ? 'warn' : 'ok', pct: pct };
}

/* ── the six surfaces ────────────────────────────────────────────────────── */

function storefront(i) {
  if (!i.embedKeyActive) {
    return { key: 'storefront', label: 'Storefront embed', state: 'off',
             say: 'No active publishable key — the storefront is not installed anywhere.',
             where: null, metrics: {} };
  }
  var c = capState(i.ordersToday, i.dailyOrderCap);
  return {
    key: 'storefront', label: 'Storefront embed', state: c.state,
    where: i.origins && i.origins.length ? str(i.origins[0], 120) : null,
    say: c.state === 'down'
      ? 'Daily order cap reached — further orders are refused until midnight UTC.'
      : c.state === 'warn'
        ? 'At ' + c.pct + '% of today’s order cap.'
        : 'Live on ' + num(i.originCount) + ' allowed origin' + (num(i.originCount) === 1 ? '' : 's') + '.',
    metrics: { ordersToday: num(i.ordersToday), dailyOrderCap: num(i.dailyOrderCap),
               origins: num(i.originCount), pctOfCap: c.pct }
  };
}

/* The one public call that COSTS MONEY — api/parcel.js reaches metered
   Regrid. Its cap is the spend control, so it is reported on its own rather
   than folded into the storefront. */
function siteStudy(i) {
  if (!i.siteStudyOn) {
    return { key: 'sitestudy', label: 'Site study', state: 'off',
             say: 'Not enabled for this tenant.', where: null, metrics: {} };
  }
  var c = capState(i.parcelToday, i.dailyParcelCap);
  return {
    key: 'sitestudy', label: 'Site study', state: c.state, where: null,
    say: c.state === 'down'
      ? 'Daily parcel allowance spent — visitors get a size, not a drawing.'
      : 'Spent ' + num(i.parcelToday) + ' of ' + num(i.dailyParcelCap) + ' metered parcel lookups today.',
    metrics: { parcelToday: num(i.parcelToday), dailyParcelCap: num(i.dailyParcelCap), pctOfCap: c.pct }
  };
}

function orderDesk(i) {
  var open = num(i.ordersNew) + num(i.ordersConfirmed) + num(i.ordersQuoted);
  return {
    key: 'orders', label: 'Order desk', state: num(i.ordersNew) > 0 ? 'warn' : 'ok',
    where: '/orders.html',
    say: num(i.ordersNew) > 0
      ? num(i.ordersNew) + ' new order' + (num(i.ordersNew) === 1 ? '' : 's') + ' waiting to be confirmed.'
      : 'Nothing waiting — ' + open + ' open order' + (open === 1 ? '' : 's') + ' in flight.',
    metrics: { new: num(i.ordersNew), confirmed: num(i.ordersConfirmed),
               quoted: num(i.ordersQuoted), inFulfilment: num(i.ordersInFulfilment),
               shipped: num(i.ordersShipped) }
  };
}

function plantFloor(i) {
  if (!num(i.benches)) {
    return { key: 'plant', label: 'Plant floor', state: 'off',
             say: 'No benches paired — the floor is not on the system yet.',
             where: '/plant/station.html', metrics: {} };
  }
  return {
    key: 'plant', label: 'Plant floor',
    state: num(i.unitsOnHold) > 0 ? 'warn' : 'ok',
    where: '/plant/station.html',
    say: num(i.unitsOnHold) > 0
      ? num(i.unitsOnHold) + ' unit' + (num(i.unitsOnHold) === 1 ? '' : 's') + ' on hold.'
      : num(i.unitsInFlight) + ' unit' + (num(i.unitsInFlight) === 1 ? '' : 's') +
        ' moving across ' + num(i.benches) + ' bench' + (num(i.benches) === 1 ? '' : 'es') + '.',
    metrics: { benches: num(i.benches), benchesActive: num(i.benchesActive),
               unitsInFlight: num(i.unitsInFlight), unitsOnHold: num(i.unitsOnHold),
               scansToday: num(i.scansToday), refusalsToday: num(i.refusalsToday) }
  };
}

function buyerPortal(i) {
  if (!num(i.customers)) {
    return { key: 'portal', label: 'Buyer portal', state: 'off',
             say: 'No customer accounts yet.', where: '/portals/customer/', metrics: {} };
  }
  return {
    key: 'portal', label: 'Buyer portal', state: 'ok', where: '/portals/customer/',
    say: num(i.customers) + ' customer account' + (num(i.customers) === 1 ? '' : 's') +
         ', ' + num(i.portalUsers) + ' user' + (num(i.portalUsers) === 1 ? '' : 's') + '.',
    metrics: { customers: num(i.customers), users: num(i.portalUsers),
               signInsThisWeek: num(i.signInsThisWeek), accountsWithOrders: num(i.customersWithOrders) }
  };
}

function designer(i) {
  var mode = str(i.editorMode || 'full', 40);
  if (!num(i.designerSeats)) {
    return { key: 'designer', label: 'Designer', state: 'off',
             say: 'Nobody is subscribed to the designer yet.',
             where: '/editor.html', metrics: { editorMode: mode } };
  }
  return {
    key: 'designer', label: 'Designer', state: 'ok', where: '/editor.html',
    say: num(i.designerSeats) + ' account' + (num(i.designerSeats) === 1 ? '' : 's') +
         ' on the designer, running ' + (mode === 'bess-lite' ? 'the BESS designer' : 'the full platform') + '.',
    metrics: { editorMode: mode, designerSeats: num(i.designerSeats),
               toolAccess: Array.isArray(i.toolAccess) ? i.toolAccess.slice(0, 50) : null }
  };
}

/* ── the manifest ────────────────────────────────────────────────────────── */

var BUILDERS = [storefront, siteStudy, orderDesk, plantFloor, buyerPortal, designer];
var RANK = { down: 3, warn: 2, ok: 1, off: 0 };

function buildManifest(input, at) {
  var i = input || {};
  var surfaces = BUILDERS.map(function (f) { return f(i); });

  var worst = 'ok', live = 0;
  surfaces.forEach(function (s) {
    if (s.state !== 'off') live++;
    if (RANK[s.state] > RANK[worst]) worst = s.state;
  });

  return {
    orgId: str(i.orgId, 120).toLowerCase(),
    name: str(i.name, 160),
    status: str(i.status || 'active', 40),
    tier: str(i.tier, 40),
    /* Presentation only. The whiteLabel block is NOT forwarded. */
    platformName: str(i.platformName, 160),
    editorMode: str(i.editorMode || 'full', 40),
    at: str(at || '', 40),
    overall: worst,
    liveSurfaces: live,
    surfaces: surfaces
  };
}

module.exports = {
  capState: capState,
  buildManifest: buildManifest,
  BUILDERS: BUILDERS
};
