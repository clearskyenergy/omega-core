/* ═══════════════════════════════════════════════════════════════════════════════
   /config.js — PER-DEPLOYMENT configuration
   ═══════════════════════════════════════════════════════════════════════════════
   This is the ONLY file that differs between tenants. index.html, marketplace.html,
   projects.html and omega-brand.js ship byte-identical everywhere.

   Copy this into each tenant repo and edit the `tenant` block.
   ═══════════════════════════════════════════════════════════════════════════════ */
window.CLEARSKY_CONFIG = {

  /* ── Firebase (unchanged from your existing config.js) ────────────────────── */
  firebase: {
    apiKey:            'REPLACE_ME',
    authDomain:        'REPLACE_ME.firebaseapp.com',
    projectId:         'REPLACE_ME',
    storageBucket:     'REPLACE_ME.appspot.com',
    messagingSenderId: 'REPLACE_ME',
    appId:             'REPLACE_ME'
  },

  /* ── THE TENANT ───────────────────────────────────────────────────────────────
     Defining `tenant` locks this deployment to one customer: every session runs
     as this workspace no matter which recognised admin signs in, so a ClearSky
     engineer previewing the site still sees the customer's branding and data —
     never another tenant's.                                                     */
  tenant: {
    type:          'developer',            // 'developer' | 'partner'
    orgId:         'spatco.com',           // hard tenant lock — scopes ALL Firestore reads
    clientName:    'SPATCO Energy Solutions',
    accountTier:   'Enterprise',
    tierLevel:     3,                      // 3 = Enterprise, every tool unlocked
    allowedDomain: 'spatco.com',           // primary sign-in domain
    requiredTools: ['editor', 'spatco_ev'],// pinned, non-removable dashboard tiles
    logo:          '/spatco-logo.jpg',

    /* OPTIONAL — additional whole domains this tenant accepts. */
    // allowedDomains: ['spatco-contractors.com'],

    /* OPTIONAL — individual accounts allowed in alongside the domains above.
       Use this to admit one Gmail/personal address WITHOUT opening all of
       gmail.com. When set, the Google account-chooser domain hint is
       suppressed so the allowlisted account is actually selectable. */
    // allowedEmails: ['jane.doe@gmail.com'],

    /* Bespoke tools not in the shared OMEGATools catalog. Any key listed here
       that also appears in requiredTools gets a dashboard tile. This is how the
       old hardcoded SPATCO EV tile is expressed now. */
    customTools: [
      {
        key:      'spatco_ev',
        name:     'EV / Project Estimate',
        desc:     'SPATCO-format EV charger & project install estimates with AI scope.',
        category: 'sales',
        href:     '/spatco-ev-estimate.html'
        // icon:  optional SVG path; defaults to a lightning bolt
      }
    ],

    /* Branding applied to customer-facing exports (PDFs, proposals). */
    exportBrand: {
      logo:              '/spatco-logo.jpg',
      name:              'SPATCO Energy Solutions',
      poweredBy:         'Powered by ClearSky-OMEGA',
      platformCopyright: '© 2025 ClearSky Energy Solutions LLC · ClearSky-OMEGA platform'
    }
  },

  /* ── Domains that may preview this deployment in addition to the tenant's ──── */
  adminDomains: ['csebuilders.com'],

  /* ── Shown in auth copy and "request access" links ─────────────────────────── */
  platformName: 'ClearSky-OMEGA',
  supportEmail: 'dev@clearsky-usa.com'

  /* ── ALTERNATIVE: multi-tenant hub ───────────────────────────────────────────
     Omit `tenant` entirely and supply a domain-keyed map instead. Users then
     resolve by email domain, as the old built-in registry did:

     workspaces: {
       'spatco.com': { type:'developer', orgId:'spatco.com', clientName:'SPATCO Energy Solutions',
                       accountTier:'Enterprise', tierLevel:3, allowedDomain:'spatco.com',
                       requiredTools:['editor'], logo:'/spatco-logo.jpg' },
       'voltus.co':  { type:'partner', orgId:'voltus.co', clientName:'Voltus',
                       accountTier:'Partner', allowedDomain:'voltus.co',
                       portfolioOrgs:['nextnrg.com'] }
     }
     ─────────────────────────────────────────────────────────────────────────── */
};
