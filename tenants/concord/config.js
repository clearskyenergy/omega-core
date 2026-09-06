/* ═══════════════════════════════════════════════════════════════════════════════
   /config.js — CONCORD ENERGY
   ClearSky-OMEGA EnergyOS · client deployment

   This is the ONLY file that differs between tenants. index.html,
   marketplace.html, projects.html, editor.html and omega-brand.js are shared
   verbatim across every deployment — do not edit them here.
   ═══════════════════════════════════════════════════════════════════════════════ */
(function () {


/* ╔═══════════════════════════════════════════════════════════════════════════╗
   ║  PLAN SWITCH — the one line you change to convert this account.           ║
   ║                                                                           ║
   ║      'trial'  →  14-day trial, 4 tools                                    ║
   ║      'tier1'  →  paid Standard, 16 tools, no countdown                    ║
   ║                                                                           ║
   ║  Change it, commit, redeploy. Nothing else in this file needs touching,   ║
   ║  and no shared file is involved. Takes effect on next page load.          ║
   ╚═══════════════════════════════════════════════════════════════════════════╝ */

var PLAN = 'tier1';


/* ── What each plan means ──────────────────────────────────────────────────
   Only three fields differ between them, so this is the whole difference
   between a trial and a paying Tier 1 account:

   trial   accountTier 'Trial'     tierLevel -1   countdown banner on
   tier1   accountTier 'Standard'  tierLevel  1   countdown gone

   tierLevel -1 sits BELOW TIER.ALL, so no tool unlocks on tier and access
   comes only from unlockedTools below — exactly 4 tools.

   tierLevel 1 unlocks every TIER.ALL and TIER.STANDARD tool in the catalog:
   16 unlocked, 17 still Upgrade-badged. See the README for the list of the
   12 that get added, since that's the commercial substance of the upgrade.

   Setting `trial: null` is what removes the countdown — omega-brand.js
   returns null from trial() when the block is absent and renders nothing.   */
var PLANS = {
  trial: {
    accountTier: 'Trial',
    tierLevel:   -1,
    trial: {
      startsAt:     '2026-08-03',   // Mon Aug 3, 2026 — local midnight
      days:         14,             // runs through end of Sun Aug 16, 2026
      lockOnExpiry: false           // banner only; see README to harden this
    }
  },
  tier1: {
    accountTier: 'Standard',
    tierLevel:   1,
    trial:       null
  }
};

/* Typo guard — a misspelled PLAN would otherwise silently produce a tenant
   with no tier and no tools at all, which looks like a data problem rather
   than a config one. */
var plan = PLANS[PLAN];
if (!plan) {
  if (window.console && console.error) {
    console.error('[ClearSky-OMEGA] Unknown PLAN "' + PLAN + '" in /config.js. '
      + 'Expected one of: ' + Object.keys(PLANS).join(', ') + '. Falling back to trial.');
  }
  plan = PLANS.trial;
}


window.CLEARSKY_CONFIG = {

  /* ── Firebase ──────────────────────────────────────────────────────────────
     Project: clearsky-portal — the same project the demo and the other tenants
     use, so Concord is a tenant inside it rather than a separate instance.

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
    clientName:    'Concord Energy',

    /* Note the domain: concordenergyUSA.com, NOT concordenergy.com — the
       latter is a live domain belonging to an unrelated Denver oil-and-gas
       trading firm. Don't "correct" this to the shorter form.

       orgId is the hard tenant lock that scopes ALL Firestore reads.
       allowedDomain is who may sign in. They must stay identical.            */
    orgId:         'concordenergyusa.com',
    allowedDomain: 'concordenergyusa.com',

    /* If Concord runs more than one mail domain, list the extras here — they
       all land in the same workspace, because orgId above is fixed regardless
       of which address signs in.                                             */
    // allowedDomains: [],

    /* Concord's concentric-C mark. Derived from the supplied screenshot:
       white background keyed out to transparent, trimmed to the mark, 5%
       margin added, output 218x264.

       Sized at 264px tall = 3x the 88px sign-in card render. The source mark
       was only 135x167px, so this is already a 1.5x upscale — pushing it
       larger would add blur, not detail. If it looks soft on a retina display,
       ask Concord for the vector (SVG/AI/EPS) and re-export; the file here is
       as good as a screenshot crop can get.

       Brand colours preserved: #BEC4C3 grey, #6F7D7A slate, #E5AB4B amber.
       The light grey is only ~106 units from white, so it survived the
       background key by a deliberately tight threshold — worth knowing before
       anyone re-processes this file with a naive white-removal.              */
    logo:          '/concord-logo.png',

    /* ── PLAN-DRIVEN — do not edit these three by hand.
           Change PLAN at the top of the file instead. ── */
    accountTier:   plan.accountTier,
    tierLevel:     plan.tierLevel,
    trial:         plan.trial,

    /* Pinned, non-removable dashboard tile. */
    requiredTools: ['editor'],

    /* ── The four tools ───────────────────────────────────────────────────
       Under 'trial' these are the ONLY unlocked tools. Under 'tier1' they're
       redundant (tier alone would unlock all four) but harmless — and worth
       keeping, because they survive any future retiering of a tool upstream
       in omega-tools.js. Everything else in the catalog stays visible with an
       "Upgrade" badge.                                                       */
    unlockedTools: [
      'editor',        // BESS Site Map            (design,      tier 1)
      'batterysizer',  // Battery Sizer            (finance,     tier 1)
      'sales',         // Sales Proposal Builder   (sales,       tier 1)
      'financing'      // Financing Partners       (marketplace, tier 0)
    ],

    /* Branding for customer-facing exports (proposals, PDFs). */
    exportBrand: {
      logo:              '/concord-logo.png',
      name:              'Concord Energy',
      poweredBy:         'Powered by ClearSky-OMEGA',
      platformCopyright: '© 2026 ClearSky Energy Solutions LLC · ClearSky-OMEGA platform'
    }
  },

  /* ── ClearSky staff who may preview this deployment ───────────────────────
     These domains keep access even after a trial expires, so you can always
     get in to demo or troubleshoot.                                          */
  adminDomains: ['csebuilders.com', 'clearsky-usa.com'],

  platformName: 'ClearSky-OMEGA',

  /* Concord's own contact address — shown to their users for help with the
     product itself. Left pointing at ClearSky until they give you an address
     to use: a new company may not have a staffed inbox yet, and a dead
     support link is worse than one that reaches you. */
  supportEmail: 'dev@clearsky-usa.com',

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

  /* Unedited tenant domain. This one matters more than it looks: allowedDomain
     decides who may sign in and orgId scopes every Firestore read, so shipping
     a placeholder — or worse, a plausible guess belonging to another company —
     is an access-control failure, not a cosmetic one. Refuse to load. */
  var t = cfg.tenant || {};
  if (String(t.orgId).indexOf('REPLACE_ME') >= 0
   || String(t.allowedDomain).indexOf('REPLACE_ME') >= 0) {
    problems.push('/config.js still has a placeholder tenant domain. Set both '
      + 'orgId and allowedDomain to Concord\u2019s real mail domain before '
      + 'deploying \u2014 until then nobody can sign in, which is the intended '
      + 'behaviour.');
  }

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

    if (typeof window.showAuthErr === 'function' && !window.showAuthErr.__omegaSetup) {
      var wrapped = function () {
        el.textContent = MSG;
        el.style.display = 'block';
      };
      wrapped.__omegaSetup = true;
      window.showAuthErr = wrapped;
    }

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


})();
