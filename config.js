/* ═══════════════════════════════════════════════════════════════════════════════
   ClearSky-OMEGA · platform config (omega-core)
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   ONE config for every hostname. There is deliberately NO `tenant` block
   here: the tenant is resolved by omega-tenant.js from tenant_public/{host}.
   The legacy per-repo config.js files are kept under tenants/<slug>/ only as
   a reference for seeding; they are not served.

   Firebase web config is public by design — Firestore/Storage rules are the
   access control, not this file.
   ═══════════════════════════════════════════════════════════════════════════════ */
window.CLEARSKY_CONFIG = {
  firebase: {
    apiKey:            'AIzaSyABoM1lgOYUnd5ZadaoTMhYmA9cHa8Tyo0',
    authDomain:        'clearsky-portal.firebaseapp.com',
    projectId:         'clearsky-portal',
    storageBucket:     'clearsky-portal.firebasestorage.app',
    messagingSenderId: '742134484347',
    appId:             '1:742134484347:web:ab0f95fd221536158481de',
    measurementId:     'G-8D92GNW555'
  },
  /* Domains allowed to preview ANY tenant's portal (staff). */
  adminDomains: ['csebuilders.com', 'clearsky-usa.com'],
  /* Zero-config auto-tenant is OFF on real hosts: every workspace must
     exist in omega_orgs (self-serve via /start.html, or seeded). Preview
     hosts still allow it for development. */
  autoTenant: false,
  platformName: 'ClearSky-OMEGA',
  upgradeEmail: 'sales@csebuilders.com',
  supportEmail: 'support@csebuilders.com',
  hub: 'https://app.clearskyomega.com'
};

/* An Omega Logic app installed on an iPhone home screen signs in THROUGH
   THIS HOST. There, Google's pop-up cannot report back, so sign-in goes by
   redirect, and a redirect through clearsky-portal.firebaseapp.com loses
   its result to Safari's storage partitioning: Google says yes, the app
   comes back signed out, and the person lands on the sign-in page again.
   vercel.json serves /__/auth and /__/firebase from the project's
   firebaseapp.com, so the redirect stays on this host.

   It is decided HERE, before any script loads, because the first script to
   start Firebase fixes the auth domain for the page — omega-tenant.js starts
   it as soon as it loads, before the page's own start-up runs. Needs
   https://<this host>/__/auth/handler among the Google OAuth client's
   authorised redirect URIs; until then api/auth-check says Google is not
   available here and omega-logic-signin.js offers email and password
   instead of Google's error page. */
(function (c) {
  try {
    var app = /^\/(office\/app|plant\/app|portals\/customer\/app|omega-logic)(\/|\.html)?$/.test(location.pathname);
    /* On a host whose handler IS registered with Google (below), every
       Omega Logic sign-in goes through this host, installed or not: the
       pop-up and the redirect are then same-site everywhere, including an
       app's built-in browser, where a helper on another site loses the
       result. Elsewhere, only the installed app (api/auth-check guards it). */
    var registered = ['silmarillion.clearskyomega.com'].indexOf(location.host) >= 0;
    if (app && (registered || navigator.standalone === true) && c.firebase && c.firebase.authDomain) c.firebase.authDomain = location.host;
  } catch (e) {}
})(window.CLEARSKY_CONFIG);
