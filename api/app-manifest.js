/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/app-manifest?org=<orgId>[&app=plant|office|customer] — a phone
   app's web manifest, per tenant
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   A web manifest is a static file, and a static file cannot know which
   tenant's phone it is being installed on. This endpoint hands each of the
   three phone apps — the PLANT app for the builders, the OFFICE app for the
   people running the business, the CUSTOMER app for the buyer — the
   tenant's own name, colours and icon, so what lands on a home screen is
   the tenant's mark, not ours — the same rule as the login page and the
   storefront. Presentation only: no account, no keys, no terms, nothing a
   stranger could not already see on the tenant's pages. (The customer app
   is opened by people who are not tenant members, which is why this stays
   unauthenticated.)

   Icons come from omega_orgs/{org}.appIcon — { "192", "512", "180",
   "maskable" } as same-origin paths (a tenant folder, /tenants/<slug>/icons/)
   or https URLs — with an optional per-app override under appIcon.office /
   appIcon.customer of the same shape — and fall back to the OMEGA icons when
   none are set. A path is validated, never trusted: a manifest that points
   at a foreign script would be a phishing kit with our name on it.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var A = require('./_lib/admin'), brand = require('./_lib/logic-brand');

var FALLBACK = [
  { src: '/icons/omega-192.png', sizes: '192x192', type: 'image/png' },
  { src: '/icons/omega-512.png', sizes: '512x512', type: 'image/png' },
  { src: '/icons/omega-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
];

function iconPath(v) {
  var s = String(v || '').trim();
  if (!/\.(png|webp)$/i.test(s)) return '';
  if (/^\/(?!\/)[A-Za-z0-9._\/-]+$/.test(s)) return s;
  if (/^https:\/\/[A-Za-z0-9.-]+\/[A-Za-z0-9._\/-]+$/.test(s)) return s;
  return '';
}

/* The three apps. `suffix` is what follows the tenant's name; the customer
   app carries the platform name alone, because to the buyer that IS the
   product. `id` keeps the three installs distinct on one phone. */
var APPS = {
  plant: { suffix: ' · Plant', start: '/plant/app', scope: '/plant/',
    description: 'Work orders, the bench scanner, stock and quality for the people building the units.' },
  office: { suffix: ' · Office', start: '/office/app', scope: '/office/',
    description: 'Orders, purchase orders, customers and stock for the people running the business.' },
  customer: { suffix: '', start: '/portals/customer/app', scope: '/portals/customer/',
    description: 'Design your sites, place purchase orders and follow every order from your supplier.' }
};
function appKey(v) { return APPS.hasOwnProperty(String(v || '')) ? String(v) : 'plant'; }

function iconSet(ai) {
  var icons = [];
  if (iconPath(ai['192'])) icons.push({ src: iconPath(ai['192']), sizes: '192x192', type: 'image/png' });
  if (iconPath(ai['512'])) icons.push({ src: iconPath(ai['512']), sizes: '512x512', type: 'image/png' });
  if (iconPath(ai.maskable)) icons.push({ src: iconPath(ai.maskable), sizes: '512x512', type: 'image/png', purpose: 'maskable' });
  return icons;
}

/* Pure, so a test can hand it a record. */
function manifestFor(org, record, app) {
  record = record || {}; app = appKey(app);
  var A2 = APPS[app], b = brand(record), wl = record.whiteLabel || {}, base = record.appIcon && typeof record.appIcon === 'object' ? record.appIcon : {};
  /* A per-app set wins in full when it has any usable icon; otherwise the
     shared set, so one mark serves all three until a tenant draws more. */
  var own = base[app] && typeof base[app] === 'object' ? base[app] : null;
  var ai = own && iconSet(own).length ? own : base;
  var icons = iconSet(ai);
  var short = String(wl.shortName || record.name || 'Plant').slice(0, 12);
  var name = app === 'customer'
    ? (String(wl.platformName || wl.shortName || record.name || '').slice(0, 40) || short)
    : (String(wl.shortName || wl.platformName || record.name || '').slice(0, 40) || 'Plant') + A2.suffix;
  return {
    id: A2.start,
    name: name,
    short_name: short,
    description: A2.description,
    start_url: A2.start + '?org=' + encodeURIComponent(org),
    scope: A2.scope,
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: b.ink,
    icons: icons.length ? icons : FALLBACK,
    /* not part of the manifest spec; the app reads it for the iOS icon */
    apple_touch_icon: iconPath(ai['180']) || (icons.length ? icons[0].src : '/icons/omega-192.png')
  };
}

module.exports = A.handler(async function (req, res) {
  if (req.method !== 'GET') throw A.httpError(405, 'GET only');
  var org = A.safeOrg(req.query.org);
  if (!org) throw A.httpError(400, 'Valid org required');
  var snap = await A.db().collection('omega_orgs').doc(org).get();
  if (!snap.exists) throw A.httpError(404, 'Unknown workspace');
  res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  return manifestFor(org, snap.data(), req.query.app);
});
module.exports.manifestFor = manifestFor;
module.exports.APPS = APPS;
module.exports.iconPath = iconPath;
