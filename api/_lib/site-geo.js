/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   site-geo.js — the map pins on a pasted site list, in ONE place for both
   doors (api/my-sites.js and api/logic-custody.js, action sites-preview).

   New rows only (custody.toLocate), US Census only (api/_lib/geocode.js
   many, censusOnly: Nominatim's policy is one request a second), at most
   PER_CALL lookups a preview, four at a time — and inside a DAILY
   ALLOWANCE claimed in a Firestore transaction BEFORE any lookup leaves
   the box, the site study's pattern (api/embed-layout.js claimLookup). A
   cache hit is free and never spends it (geocode.peek).

   Why a count: sites-preview is reachable by any verified email (a new
   sign-in on the customer side gets an active self account), and without
   one it was an open, unmetered geocoding proxy — forty Census calls a
   request, as many requests as a script cares to send, from the egress IP
   the storefront's own geocoding shares.

   Scopes, one record each per UTC day (Admin SDK only, like the CRM's
   upload allowance):
     omega_orgs/{org}/geocode_usage/{scope__YYYY-MM-DD}  { count, limit }
   a customer's preview spends its ACCOUNT's allowance and the workspace's
   CUSTOMERS allowance; the office's spends the workspace's OFFICE
   allowance — so strangers cannot spend the office's pins. A claim is
   all-or-part across its scopes and is not refunded (it bounds attempts,
   not successes). Spent, the rows come back without a pin and the answer
   says geoLimited: a pin is a convenience, the site is created either way
   and a preview is never refused for it. */
'use strict';
var C = require('./custody'), G = require('./geocode');

var PER_CALL = 40;
/* per UTC day; exported so a test can lower them */
var LIMITS = { account: 200, customers: 1000, office: 1000 };

function scopesFor(side, accountId) {
  if (side === 'office') return [{ key: 'office', limit: LIMITS.office }];
  return [{ key: 'acct_' + String(accountId || '').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 100), limit: LIMITS.account }, { key: 'customers', limit: LIMITS.customers }];
}
function usageRef(db, org, key, day) { return db.collection('omega_orgs').doc(org).collection('geocode_usage').doc(key + '__' + day); }

/* claim up to `want` lookups from every scope at once: what is granted is
   the least any scope has left; every scope is charged the same */
async function claim(db, org, scopes, want, now) {
  if (!(want > 0)) return 0;
  var day = String(now).slice(0, 10);
  return db.runTransaction(async function (tx) {
    var refs = scopes.map(function (s) { return usageRef(db, org, s.key, day); }), snaps = [];
    for (var i = 0; i < refs.length; i++) snaps.push(await tx.get(refs[i]));
    var used = snaps.map(function (s) { return s.exists ? Number((s.data() || {}).count) || 0 : 0; }), grant = want;
    scopes.forEach(function (s, j) { grant = Math.min(grant, Math.max(0, s.limit - used[j])); });
    if (grant > 0) refs.forEach(function (r, j) {
      var doc = { orgId: org, scope: scopes[j].key, day: day, count: used[j] + grant, limit: scopes[j].limit, lastAt: now };
      if (snaps[j].exists) tx.update(r, doc); else tx.create(r, doc);
    });
    return grant;
  });
}

/* lay pins on a preview's rows (custody.withGeo); side 'customer' | 'office' */
async function locate(db, org, rows, side, accountId, now) {
  now = now || new Date().toISOString();
  var want = C.toLocate(rows), addrs = want.map(function (t) { return t.address; }), hits = new Array(addrs.length), need = [];
  addrs.forEach(function (a, i) { var c = G.peek(a, { censusOnly: true }); if (c !== undefined) hits[i] = c; else need.push(i); });
  var ask = Math.min(need.length, PER_CALL), grant = ask ? await claim(db, org, scopesFor(side, accountId), ask, now) : 0;
  if (grant) {
    var got = await G.many(need.slice(0, grant).map(function (i) { return addrs[i]; }), { censusOnly: true, max: grant, concurrency: 4, budgetMs: 15000, timeoutMs: 6000 });
    got.forEach(function (h, k) { if (h !== undefined) hits[need[k]] = h; });
  }
  C.withGeo(rows, want, hits);
  return { geoLimited: grant < ask, lookedUp: grant, fromCache: addrs.length - need.length };
}

module.exports = { locate: locate, claim: claim, scopesFor: scopesFor, LIMITS: LIMITS, PER_CALL: PER_CALL };
