/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var E = require('./embed');
var ORIGIN = 'https://silmarillion.clearskyomega.com';
function paths(org) {
  var q = '?org=' + encodeURIComponent(org);
  return { start: ORIGIN + '/customer-start.html' + q,
    account: ORIGIN + '/portals/customer/' + q,
    design: ORIGIN + '/portals/customer/' + q + '#design' };
}
async function publicStorefront(db, org) {
  var keys = await db.collection('embed_keys').where('orgId', '==', org).get();
  // Only publish a storefront-scoped, active publishable key that actually
  // permits our hosted website entry. Never substitute an administrative key.
  var usable = keys.docs.filter(function (s) {
    var d = s.data();
    return /^omega_pk_[a-z0-9_]{8,96}$/.test(s.id) && d.active !== false &&
      Array.isArray(d.scopes) && d.scopes.indexOf('storefront') >= 0 &&
      E.originAllowed(d.origins || [], ORIGIN);
  }).sort(function (a, b) { return a.id.localeCompare(b.id); });
  return usable.length ? ORIGIN + '/embed/storefront.html?k=' + encodeURIComponent(usable[0].id) : null;
}
module.exports = { paths: paths, publicStorefront: publicStorefront };
