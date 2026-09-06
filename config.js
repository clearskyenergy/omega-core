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
