/* ═══════════════════════════════════════════════════════════════════════════════
   /config.js — TREMCO ROOFING & BUILDING MAINTENANCE
   ClearSky-OMEGA EnergyOS · client deployment

   This is the ONLY file that differs between tenants. index.html,
   marketplace.html, projects.html, editor.html and omega-brand.js are shared
   verbatim across every deployment — do not edit them here.

   ONE EXCEPTION, and it is not in the shared-file list above:
   sales-proposal.html carries a hard-coded LOGO_OVERRIDE near the top of its
   <script> block. It was pointing at the previous tenant's logo file and has
   been repointed here. See README → "The sales-proposal.html catch".
   ═══════════════════════════════════════════════════════════════════════════════ */
(function () {


/* ╔═══════════════════════════════════════════════════════════════════════════╗
   ║  PLAN SWITCH — the one line you change to convert this account.           ║
   ║                                                                           ║
   ║      'trial'  →  30-day trial, 4 tools                                    ║
   ║      'tier1'  →  paid Standard, 16 tools, no countdown                    ║
   ║                                                                           ║
   ║  Change it, commit, redeploy. Nothing else in this file needs touching,   ║
   ║  and no shared file is involved. Takes effect on next page load.          ║
   ╚═══════════════════════════════════════════════════════════════════════════╝ */

var PLAN = 'trial';


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
      /* 30 days from Thu Aug 13, 2026 — runs through end of Fri Sep 11,
         expired from Sat Sep 12, 2026 00:00 local.

         Set fresh for Tremco rather than carried over from another tenant.
         If their kickoff slips, move this date — a trial clock that starts
         before anyone has been onboarded burns days you can't get back. */
      startsAt:     '2026-08-13',
      days:         30,
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
     use, so Tremco is a tenant inside it rather than a separate instance.

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
    clientName:    'Tremco Roofing & Building Maintenance',

    /* ⚠ CONFIRM THIS BEFORE DEPLOYING — see README → "The domain decision".
       Tremco's staff mail domain is tremcoinc.com (tremcoroofing.com is the
       public web domain and the info@ inbox, not where employees receive
       mail). Both fields are set to the staff domain so real people can
       actually sign in.

       Two things make this worth a deliberate confirmation rather than a
       glance:

       1. tremcoinc.com is Tremco Incorporated — the whole company, well over
          a thousand people across divisions beyond Roofing & Building
          Maintenance. As written, ANY of them can self-serve into this
          workspace. That is a much wider gate than a small-tenant trial
          usually wants. To run a closed pilot instead, blank allowedDomain
          and list the pilot team under allowedEmails below.
       2. orgId is the hard tenant lock that scopes ALL Firestore reads, and
          allowedDomain is who may sign in. They must stay identical.        */
    orgId:         'tremcoinc.com',
    allowedDomain: 'tremcoinc.com',

    /* If Tremco runs more than one mail domain — a WTI or Tremco CPG address,
       say — list the extras here. They all land in the same workspace,
       because orgId above is fixed regardless of which address signs in.    */
    // allowedDomains: ['tremcoroofing.com'],

    /* Named individuals outside the allowed domain. This is also the right
       place to run a closed pilot: blank allowedDomain above and list only
       the people who should get in.                                         */
    // allowedEmails: [],

    /* Tremco's supplied wordmark, converted from the original .webp to PNG.
       No processing beyond the format change was needed — the source already
       carried a clean alpha channel, so none of the white-key work the
       previous tenant's screenshot-derived logo required applies here.

       Brand teal is #00AA91, sampled from the file.

       ONE THING TO WATCH: this is a wide wordmark (766x219, 3.5:1), where the
       previous tenant's mark was tall (0.83:1). The sign-in card renders the
       logo at height:88px, so this paints ~308px wide inside 324px of usable
       card width — it fits, with about 8px of air each side. If anyone adds
       padding to .auth-card in index.html, this is the first thing to break.
       Mobile (<=520px) drops it to 44px tall and is not tight.

       At 219px tall the source is ~2.5x the 88px render — crisp on most
       screens, marginally under 3x for a retina display. If it reads soft,
       ask Tremco for the vector original (SVG/AI/EPS) and re-export. Do not
       upscale this file; that adds blur, not detail.                        */
    logo:          '/tremco-logo.png',

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
      logo:              '/tremco-logo.png',
      name:              'Tremco Roofing & Building Maintenance',
      poweredBy:         'Powered by ClearSky-OMEGA',
      platformCopyright: '© 2026 ClearSky Energy Solutions LLC · ClearSky-OMEGA platform'
    }
  },

  /* ── ClearSky staff who may preview this deployment ───────────────────────
     These domains keep access even after a trial expires, so you can always
     get in to demo or troubleshoot.                                          */
  adminDomains: ['csebuilders.com', 'clearsky-usa.com'],

  platformName: 'ClearSky-OMEGA',

  /* Tremco's own contact address — shown to their users for help with the
     product itself. Left pointing at ClearSky until they nominate an internal
     owner for the pilot; a dead support link is worse than one that reaches
     you. */
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
      + 'orgId and allowedDomain to Tremco\u2019s real mail domain before '
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


/* ═══════════════════════════════════════════════════════════════════════════════
   TENANT MODULE LOADER
   Pulls in /tremco-netzero.js, which appends the Client & Asset Analysis panel
   to the dashboard.

   WHY IT LOADS FROM HERE. index.html is shared byte-identical across tenants,
   so it cannot carry a Tremco-only <script> tag. config.js is the tenant file
   and is already loaded by index.html, projects.html and marketplace.html — so
   injecting from here gets the module onto every page that needs it without
   forking anything shared.

   editor.html is the exception: it does NOT load config.js (it carries its own
   inline _CFG), so it cannot be reached this way. That is why persisting the
   editor's net-zero results needs a real upstream change rather than another
   injection. See README → "Wiring the editor's net-zero results".
   ═══════════════════════════════════════════════════════════════════════════════ */
(function () {
  /* Only the dashboard has the #kpi-grid anchor today, but loading it on the
     other tenant pages is harmless — the module mounts only where it finds one
     and gives up quietly otherwise. */
  var s = document.createElement('script');
  s.src = '/tremco-netzero.js';
  s.async = false;                 // preserve order relative to omega-brand.js
  s.onerror = function () {
    if (window.console && console.warn) {
      console.warn('[ClearSky-OMEGA] /tremco-netzero.js failed to load. The '
        + 'dashboard still works; the Client & Asset Analysis panel will be absent.');
    }
  };
  document.head.appendChild(s);

  /* ⚠ TEMPORARY. Corrects the Quick Access "Upgrade" badge escaping its tile
     and flickering on hover — a bug in the shared index.html that affects
     every tenant below Enterprise, not just this one.

     DELETE THIS BLOCK AND THE FILE once the upstream CSS fix ships, or Tremco
     silently diverges from the platform on something that should be fixed for
     everyone. See README → "The Upgrade badge flicker". */
  var p = document.createElement('script');
  p.src = '/tremco-patches.js';
  p.async = false;
  p.onerror = function () {
    if (window.console && console.warn) {
      console.warn('[ClearSky-OMEGA] /tremco-patches.js failed to load. '
        + 'Locked Quick Access tiles will show a misplaced Upgrade badge.');
    }
  };
  document.head.appendChild(p);
})();


})();
