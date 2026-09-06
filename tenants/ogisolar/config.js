/* ═══════════════════════════════════════════════════════════════════════════════
   /config.js — OGI SOLAR
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
      /* ⚠ Defaulted to today because no start date was given. A trial that
         begins the day you deploy is a safe default, but set this to the
         actual kickoff date so the countdown matches what OGI was told. */
      startsAt:     '2026-08-08',   // Sat Aug 8, 2026 — local midnight
      days:         30,             // runs through end of Sun Sep 6, 2026
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
     use, so OGI Solar is a tenant inside it rather than a separate instance.

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
    clientName:    'OGI Solar',

    /* Taken from the wordmark in their own logo, which reads "ogisolar.com",
       and the domain resolves. Still worth a one-line confirmation that staff
       mail is @ogisolar.com and not a separate corporate domain — this decides
       who can sign in.

       orgId is the hard tenant lock that scopes ALL Firestore reads.
       allowedDomain is who may sign in. They must stay identical.            */
    orgId:         'ogisolar.com',
    allowedDomain: 'ogisolar.com',

    /* If OGI Solar runs more than one mail domain, list the extras here — they
       all land in the same workspace, because orgId above is fixed regardless
       of which address signs in.                                             */
    // allowedDomains: [],

    /* HORIZONTAL lockup (648x264, aspect 2.45), not the stacked original.
       This matters: the supplied artwork stacks the sun above the wordmark at
       aspect 1.23, and the topbar chip renders the logo at 22px TALL. Stacked,
       "ogisolar.com" would come out around 8px and be unreadable. Rebuilt
       side-by-side it sits at 2.45 — near-identical to FENECON's 2.36, which
       is the ratio known to work in that chip.

       The stacked original is kept in this repo as ogi-logo-stacked.png if you
       ever need it, and if OGI has an official horizontal lockup theirs should
       replace this one.

       Background was keyed by flood-fill from the image border, NOT by a
       global white removal — the white ring around the sun ball and the
       highlight on it are part of the mark and a global key would erase both. */
    logo:          '/ogi-logo.png',

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
      'editor',        // Site Editor            (design,         tier 1)
      'batterysizer',  // Battery Sizer            (finance,        tier 1)
      'sales',         // Sales Proposal Builder   (sales,          tier 1)
      'financing',     // Financing Partners       (marketplace,    tier 0)
      'gridatlas'      // Grid Atlas               (interconnection, tier 0)

      /* ── PROJECT INTAKE — key not confirmed, deliberately left out ──────
         There is no intake tool in the static registry (omega-tools.js seeds
         34 tools and none of them is an intake). The live catalog is hydrated
         from the Firestore 'tools' collection at portal boot and overrides
         that seed, so the intake entry exists live but its key can't be read
         from the file.

         Get the real key — paste into the browser console on any portal page
         that has finished loading:

             OMEGATools.all()
               .filter(function(t){ return /intake/i.test(t.key + t.name); })
               .map(function(t){ return t.key + '  =  ' + t.name; })

         Then add it above as another quoted string.

         ⚠ Read the NAME before you unlock the key. If what comes back is the
         master intake QUEUE (the ClearSky-side admin console that lists every
         tenant's submissions), do NOT put it here — that would let OGI see
         other tenants' intakes. A tenant needs the tool that SUBMITS an
         intake, not the one that reviews the queue. If both exist, unlock the
         submit-side one only.                                              */
    ],

    /* Branding for customer-facing exports (proposals, PDFs). */
    exportBrand: {
      logo:              '/ogi-logo.png',
      name:              'OGI Solar',
      poweredBy:         'Powered by ClearSky-OMEGA',
      platformCopyright: '© 2026 ClearSky Energy Solutions LLC · ClearSky-OMEGA platform'
    }
  },

  /* ── ClearSky staff who may preview this deployment ───────────────────────
     These domains keep access even after a trial expires, so you can always
     get in to demo or troubleshoot.                                          */
  adminDomains: ['csebuilders.com', 'clearsky-usa.com'],

  platformName: 'ClearSky-OMEGA',

  /* OGI Solar's own contact address — shown to their users for help with the
     product itself. Left pointing at ClearSky until OGI give you an address
     to use — a dead support link is worse than one that reaches you. */
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
      + 'orgId and allowedDomain to the client\u2019s real mail domain before '
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
