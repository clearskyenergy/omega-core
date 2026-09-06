/* ═══════════════════════════════════════════════════════════════════════════════
   /config.js — WALTERS WHOLESALE ELECTRIC
   ClearSky-OMEGA EnergyOS · client deployment

   This is the ONLY file that differs between tenants. index.html,
   marketplace.html, projects.html, editor.html, omega-brand.js, omega-terms.js
   and omega-assets.js are shared verbatim across every deployment — do not edit
   them here.
   ═══════════════════════════════════════════════════════════════════════════════ */
window.CLEARSKY_CONFIG = {

  /* ── Firebase ──────────────────────────────────────────────────────────────
     Project: clearsky-portal — the same project the demo and the other tenants
     use, so Walters is a tenant inside it rather than a separate instance. The
     Firestore rules scope by email domain via userOrg(), which resolves
     @walterswholesale.com to the orgId below with no rules change needed.

     These are web-app credentials, public by design (they ship in every page
     load). The security boundary is the Firestore rules, not this key.       */
  firebase: {
    apiKey:            'AIzaSyABoM1lgOYUnd5ZadaoTMhYmA9cHa8Tyo0',
    authDomain:        'clearsky-portal.firebaseapp.com',
    projectId:         'clearsky-portal',
    storageBucket:     'clearsky-portal.firebasestorage.app',
    messagingSenderId: '742134484347',
    appId:             '1:742134484347:web:ab0f95fd221536158481de',
    measurementId:     'G-8D92GNW555'
  },

  /* ── The tenant ───────────────────────────────────────────────────────────── */
  tenant: {
    type:          'developer',
    orgId:         'walterswholesale.com',   // hard tenant lock — scopes ALL Firestore reads
    clientName:    'Walters Wholesale Electric',
    allowedDomain: 'walterswholesale.com',   // primary sign-in domain

    /* Walters is a division of U.S. Electrical Services (USESI), and Desert
       Electric Supply and Pomona Wholesale trade under their own names after
       the 2024 acquisitions. Their web presence all sits on walterswholesale.com
       and published staff addresses are @walterswholesale.com, so the trial
       opens ONE domain. If a USESI corporate sponsor or a Desert Electric
       address turns up in the trial team, add the domain here — an unused
       domain in this list is a wider door than the trial needs:

         allowedDomains: ['usesi.com'],
         allowedDomains: ['desertelectricsupply.com'],

       All three would land in the SAME workspace: orgId above is fixed at
       walterswholesale.com regardless of the address signing in.             */
    allowedDomains: [],

    logo:          '/walters-logo.png',

    /* ── TRIAL ────────────────────────────────────────────────────────────────
       The gate in omega-tools.js is:
           unlocked = requiredTools.has(key)
                   || unlockedTools.has(key)
                   || tierLevel >= (tool.tier ?? 1)

       Tool tiers run ALL=0, STANDARD=1, DELUXE=2, ENTERPRISE=3. tierLevel 1
       would unlock every tier-0 and tier-1 tool — far more than the two asked
       for. -1 sits below TIER.ALL, so no tool passes on tier and access comes
       ONLY from the explicit lists below. The catalog still renders in full;
       everything unlisted shows an "Upgrade" badge.                          */
    accountTier:   'Trial',
    tierLevel:     -1,

    trial: {
      startsAt:     '2026-08-24',   // Monday Aug 24, 2026 — local midnight
      days:         30,             // runs through end of Tue Sep 22, 2026
      lockOnExpiry: false           // see README before flipping this to true
    },

    /* ── PINNED DASHBOARD TILES ───────────────────────────────────────────
       requiredTools are placed on "My Applications" first, always, and can't
       be removed by the user. Both of the trial's tools are pinned, so the
       Finance Marketplace is on the dashboard the moment they sign in —
       no visit to the marketplace, no "+ Add to dashboard" click.          */
    requiredTools: ['editor', 'financing'],

    /* ── WHAT THIS ACCOUNT CAN USE ────────────────────────────────────────
       Everything else in the catalog still renders, badged "Upgrade". */
    unlockedTools: [
      'editor',      // BESS Site Map          (design,      tier 1)
      'financing'    // Financing Partners     (marketplace, tier 0)
    ],

    /* ── ASSET OWNER COMMAND CENTER ───────────────────────────────────────
       Drives the dashboard block added by /omega-assets.js: finance-
       marketplace offers, assets on the books, IRR/ROI, active projects and
       the portfolio P&L. Reads `projects` and `financeOffers`, both scoped
       to orgId. Writes nothing.

       sampleData fills the block with an illustrative Southern California
       C&I storage portfolio ONLY while both collections are empty for this
       org, and paints a "Sample" ribbon while it does. One real project or
       one real offer and the sample is gone for good. TURN THIS OFF before
       the account carries live numbers.                                    */
    assets: {
      enabled:      true,
      sampleData:   true,
      insertAfter:  'apps',        // sits directly under My Applications
      termYears:    20,            // default asset life for IRR / ROI
      offersCollection: 'financeOffers',
      offersLabel:  'Offers received',
      marketplaceKey: 'financing'  // which catalog tool the block links to
    },

    /* Branding for customer-facing exports (proposals, PDFs). */
    exportBrand: {
      logo:              '/walters-logo-full.png',
      name:              'Walters Wholesale Electric',
      poweredBy:         'Powered by ClearSky-OMEGA',
      platformCopyright: '© 2026 ClearSky Energy Solutions LLC · ClearSky-OMEGA platform'
    }
  },

  /* ── ClearSky staff who may preview this deployment ───────────────────────
     These domains keep access even after the trial expires, so you can always
     get in to demo or troubleshoot.                                          */
  adminDomains: ['csebuilders.com', 'clearsky-usa.com'],

  platformName: 'ClearSky-OMEGA',

  /* Walters' own public address — shown to their users for help with the
     product itself. Swap for the trial sponsor's direct address once you know
     who that is; a shared corporate inbox is a slow route for a 30-day trial. */
  supportEmail: 'corporate@walterswholesale.com',

  /* ClearSky's address. Everything commercial routes here: the trial banner's
     Upgrade link, locked-tool "Upgrade to unlock" buttons, and the expired-
     trial message. Kept separate from supportEmail so upgrade requests reach
     you rather than the customer's own help desk. */
  upgradeEmail: 'dev@clearsky-usa.com'
};


/* ═══════════════════════════════════════════════════════════════════════════════
   SETUP GUARD
   Catches the two things that break a fresh deployment and says so in plain
   language, instead of leaving a raw Firebase SDK string on the sign-in card.
   Safe to delete once this deployment is live.
   ═══════════════════════════════════════════════════════════════════════════════ */
(function (cfg) {
  var problems = [];

  var fb = cfg.firebase || {};
  var placeholder = false;
  for (var k in fb) {
    if (fb.hasOwnProperty(k) && String(fb[k]).indexOf('REPLACE_ME') >= 0) placeholder = true;
  }
  if (placeholder) {
    problems.push('/config.js still has placeholder Firebase credentials. '
      + 'Copy the firebase block from a working deployment, or from '
      + 'Firebase Console \u2192 Project settings \u2192 Your apps \u2192 Web app.');
  }

  /* Firebase Auth only permits an insecure origin on localhost. */
  var host = location.hostname;
  var localish = (host === 'localhost' || host === '127.0.0.1' || host === '[::1]');
  if (location.protocol === 'http:' && !localish) {
    problems.push('This page is served over HTTP. Firebase Auth requires HTTPS '
      + 'outside localhost \u2014 Google sign-in will fail and passwords are sent '
      + 'in cleartext. Install a certificate for ' + host + '.');
  }

  if (!problems.length) return;

  var MSG = 'Deployment not finished: ' + problems.join(' \u00B7 ');

  if (window.console && console.error) {
    for (var i = 0; i < problems.length; i++) {
      console.error('[ClearSky-OMEGA setup] ' + problems[i]);
    }
  }

  /* Don't just paint the message — hold it. Firebase's own error fires later,
     when the user clicks Create account, and would otherwise overwrite this
     with the raw SDK string that sent you looking in the wrong place. */
  function apply() {
    var el = document.getElementById('auth-err');
    if (!el) { return setTimeout(apply, 200); }

    el.textContent = MSG;
    el.style.display = 'block';

    /* Any later auth error re-shows the setup message instead. */
    if (typeof window.showAuthErr === 'function' && !window.showAuthErr.__omegaSetup) {
      var wrapped = function () {
        el.textContent = MSG;
        el.style.display = 'block';
      };
      wrapped.__omegaSetup = true;
      window.showAuthErr = wrapped;
    }

    /* Sign-in cannot succeed in this state, so make that visible rather than
       letting it fail confusingly on click. */
    var ids = ['email-auth-btn', 'google-signin-btn'];
    for (var j = 0; j < ids.length; j++) {
      var b = document.getElementById(ids[j]);
      if (b) {
        b.disabled = true;
        b.style.opacity = '0.5';
        b.style.cursor = 'not-allowed';
        b.title = MSG;
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply);
  } else {
    apply();
  }
})(window.CLEARSKY_CONFIG);
