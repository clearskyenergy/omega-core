/* ═══════════════════════════════════════════════════════════════════════════════
   /config.js — JOULES AI (JoulesAI)
   ClearSky-OMEGA EnergyOS · client deployment

   This is the ONLY file that differs between tenants. index.html,
   marketplace.html, projects.html, editor.html, omega-brand.js, omega-terms.js,
   omega-assets.js, omega-delivery.js and omega-fleet.js are shared across every
   deployment — do not edit them here.
   ═══════════════════════════════════════════════════════════════════════════════ */
window.CLEARSKY_CONFIG = {

  /* ── Firebase ──────────────────────────────────────────────────────────────
     Project: clearsky-portal — the same project the demo and the other tenants
     use, so JoulesAI is a tenant inside it rather than a separate instance. The
     Firestore rules scope by email domain via userOrg(), which resolves
     @joulesai.com to the orgId below with no rules change needed.

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
    /* 'developer' is the base dashboard shape. JoulesAI is not a developer —
       they are a controls vendor — but the fleet block below is what carries
       the tenant-specific reporting, and the stock project/stage surface is
       still where an editor drawing lands. Leave this as-is unless the
       kickoff call establishes they will never draw a site. */
    type:          'developer',
    orgId:         'joulesai.com',           // hard tenant lock — scopes ALL Firestore reads
    clientName:    'Joules AI',
    allowedDomain: 'joulesai.com',           // primary sign-in domain

    /* ONE domain, deliberately, unlike the CIR deployment.

       Every published JoulesAI address sits on joulesai.com — info@ on the
       site footer, partnerships@ throughout the product and case-study PDFs.
       No second mail domain has been observed, and the company is small
       enough that inventing one would be a wider door than the trial needs.

       If the trial team includes anyone outside the company — an advisor, a
       design partner, a pilot customer's engineer — put the individual
       address in `allowedEmails` below rather than opening their employer's
       whole domain. Several of the named advisors sit at large institutions
       (a university, a rideshare company); opening any of those domains
       would admit thousands of unrelated accounts to this workspace.        */
    allowedDomains: [],

    /* Individual outside accounts, if the kickoff call turns any up.
       allowedEmails: ['someone@example.edu'],                              */

    logo:          '/joulesai-logo.png',

    /* ── TRIAL ────────────────────────────────────────────────────────────────
       The gate in omega-tools.js is:
           unlocked = requiredTools.has(key)
                   || unlockedTools.has(key)
                   || tierLevel >= (tool.tier ?? 1)

       Tool tiers run ALL=0, STANDARD=1, DELUXE=2, ENTERPRISE=3. tierLevel -1
       sits below TIER.ALL, so no tool passes on tier and access comes ONLY
       from the explicit lists below. The catalog still renders in full;
       everything unlisted shows an "Upgrade" badge.                        */
    accountTier:   'Trial',
    tierLevel:     -1,

    /* 30 days from Mon Sep 7, 2026.
         Day 1        Mon Sep 7, 2026
         Last full day Tue Oct 6, 2026
         Expires      Wed Oct 7, 2026, 00:00 local

       Banner: blue before Sep 7, amber Sep 7 – Sep 29, red for the last
       seven days (Sep 30 – Oct 6), grey from Oct 7.

       Today is Sep 1, so this ships PRE-START and the banner reads "30 days
       left in your 30-day trial · starts Sep 7, 2026". That is correct, not
       a bug — notStarted reports the full allotment rather than the calendar
       distance to the end.

       ⚠ SIGN-IN IS NOT BLOCKED BEFORE THE START DATE. There is no config
       flag for "not yet open". Hand over the URL this week and they are in
       immediately with the clock still not running. On a 30-day trial that
       is six days of unmetered access, which is a fifth of the window — if
       the start date is meant to mean something, don't send the link until
       Monday.                                                              */
    trial: {
      startsAt:     '2026-09-07',   // Monday Sep 7, 2026 — local midnight
      days:         30,             // runs through end of Tue Oct 6, 2026
      lockOnExpiry: false           // see README before flipping this to true
    },

    /* ── PINNED DASHBOARD TILES ───────────────────────────────────────────
       requiredTools are placed on "My Applications" first, always, and can't
       be removed by the user. All three trial tools are pinned, so the whole
       trial surface is on the dashboard the moment they sign in.

       Order here is the render order and it is the intended walkthrough:
       rank the pipeline they already have, read the grid around a site,
       size the battery. It ends where their own product begins.          */
    requiredTools: ['sitediscovery', 'gridatlas', 'editor'],

    /* ── WHAT THIS ACCOUNT CAN USE ────────────────────────────────────────
       Everything else in the catalog still renders, badged "Upgrade".

       ⚠ NOT `sitefinder`, unlike the CIR deployment. Site Finder shades C&I
       property against ComEd's published hosting-capacity map — northern
       Illinois only, bounded by data rather than licence. JoulesAI's
       published footprint is the Southeast plus scattered C&I, and their
       first instinct would be to search their own sites and get an empty
       map. `sitediscovery` ranks a pipeline the tenant already assembled and
       has no utility-data dependency, which is the right third tool for a
       company whose fleet register IS the pipeline. See the README.

       Removing a key from this list locks the tool even if it is still in
       requiredTools above; keep the two lists in sync.                    */
    unlockedTools: [
      'editor',         // Site Editor    (design,          tier 1)
      'gridatlas',      // Grid Atlas       (interconnection, tier 0)
      'sitediscovery'   // Site Discovery   (siting,          tier 2)
    ],

    /* ── ASSET OWNER COMMAND CENTER — OFF ─────────────────────────────────
       omega-assets.js ships so index.html stays comparable across tenants,
       but the block is disabled. It answers an owner's questions — what do
       we own, what is it worth, who is bidding on it. JoulesAI owns none of
       the assets it operates; the batteries, arrays and generators belong to
       the customers whose facilities they sit in. A portfolio P&L and an
       offer funnel would be empty forever.

       The fleet block below is the deliberate replacement: same "what do we
       have and what is it doing" question, asked by an operator rather than
       an owner.                                                           */
    assets: {
      enabled:      false,
      sampleData:   false
    },

    /* ── SERVICE DELIVERY CONSOLE — OFF ───────────────────────────────────
       omega-delivery.js ships because index.html loads it by <script> tag
       and a missing file is a 404 on every page load, but the block is
       disabled. It is built for a services firm taking referrals in from
       customers and handing packages back. JoulesAI sells a product on a
       subscription, not project work by the job.

       /intake.html and /queue.html are NOT in this repo, because nothing
       links to them while this is false. If a reason appears to turn the
       delivery console on — a professional-services line, or paid
       integration work billed by the job — copy both pages across from the
       CIR deployment at the same time as flipping this flag, or the block
       renders with two dead buttons.                                     */
    delivery: {
      enabled:     false,
      sampleData:  false
    },

    /* ── MANAGED FLEET CONSOLE ────────────────────────────────────────────
       Drives the dashboard block added by /omega-fleet.js, plus the two
       pages it links to: /commission.html (add a site) and /fleet.html (the
       full register).

       This is the block that makes the account JoulesAI-shaped, and it is
       the answer to the brief: how much capacity is under management, where
       it sits, and how many units have been sold.

       ⚠ THIS IS NOT A REPLACEMENT FOR THEIR OWN OPERATIONS PRODUCT.
       JoulesAI ships Optima — a live operations dashboard with five views
       covering facility overview, AI insights, performance analysis, energy
       analysis and system status, at sub-second dispatch latency. This block
       must not grow into a worse copy of it, and the demo must not be framed
       as one. Their own published thesis is "Our Energy Grid Needs AI
       Agents, Not Dashboards"; walking in with a dashboard that duplicates
       theirs invites exactly the comparison it would lose.

       What this block does that Optima does not: Optima answers "how is THIS
       facility doing right now". This answers "what does the whole book look
       like" — capacity, geography, units, the commissioning backlog, and the
       split between metered and modelled savings. One is operations, the
       other is the business. Set `opsUrlBase` and the two connect.       */
    fleet: {
      enabled:     true,
      collection:  'managedSites',   // must match firestore-fleet.rules
      insertAfter: 'apps',           // sits directly under My Applications
      sampleData:  true,             // see the note at the end of this block

      title:    'Managed Fleet',
      subtitle: 'Capacity under management, where it sits, and what has shipped.',

      addHref:      '/commission.html',
      registerHref: '/fleet.html',

      /* JoulesEdge is the on-premise controller — an industrial fanless PC
         with 24 VDC UPS backup and 15-channel revenue-grade metering. It is
         the countable thing that ships, so it is the unit the board counts.
         If the commercial model moves to per-site licensing with no
         hardware, change this label and keep counting sites instead.      */
      unitLabel:    'JoulesEdge units',
      unitLabelOne: 'unit',

      /* Deep link out to their real operations product, per site. Left null
         until somebody confirms the URL shape — a guessed pattern that 404s
         is worse than no link, because it teaches people the button is
         broken and they stop trying it. Once known:

           opsUrlBase: 'https://optima.joulesai.com/site/'

         and the register appends the site's own `optimaUrl`, or this base
         plus the document id, in that order.                             */
      opsUrlBase:  null,
      opsName:     'Optima',

      /* ── FACILITY TYPES ─────────────────────────────────────────────────
         Taken from the six facility types in their own published case
         studies (industrial, commercial, airport, manufacturing, university,
         microgrid) plus the use cases named in the JoulesOS spec sheet that
         have no case study yet (data centres, government and military,
         municipal, EV charging hubs).

         Industrial and manufacturing are ONE key here, not two. Their case
         studies separate them, but the split is a tariff distinction —
         demand-charge TOU versus CBL+RTP — not a facility distinction, and
         tariff is already its own field. Two keys that differ only by a
         field that exists elsewhere produce two half-populated rows that
         somebody eventually asks to merge.

         KEYS ARE WRITTEN ONTO EVERY SITE RECORD. Renaming one orphans every
         record that used it — the block flags orphans in an amber note under
         "By facility type" rather than hiding them, but it is still a
         migration. Change labels freely; change keys deliberately.

         Confirm this list in the kickoff call. A vendor's own segmentation
         is the first thing they will notice getting it wrong, and the
         segments they actually SELL by may differ from the ones they have
         case studies for.                                               */
      segments: [
        { key:'industrial',  label:'Industrial & manufacturing' },
        { key:'commercial',  label:'Commercial & retail' },
        { key:'datacenter',  label:'Data centre' },
        { key:'campus',      label:'University & campus' },
        { key:'transport',   label:'Airport & transport' },
        { key:'evhub',       label:'EV charging hub' },
        { key:'microgrid',   label:'Microgrid' },
        { key:'government',  label:'Government & military' },
        { key:'municipal',   label:'Municipal' }
      ],

      /* sampleData fills the block and the register with an illustrative
         fleet ONLY while the collection is empty for this org, and paints a
         "Sample" ribbon while it does.

         The sample is shaped on their own published case studies, so the
         magnitudes are theirs rather than invented: MW-scale inverters,
         single-digit MWh of storage per site, C&I peaks of 1–10 MW. It is
         deliberately imperfect — one site sold in April and still not
         commissioned, one with control paused, one dispatching with no
         metered saving yet, one virtual pilot whose modelled result must not
         be added to real money, and one carrying a facility type that is not
         in the list above. A board where everything is green teaches nobody
         how to read it.

         TURN THIS OFF the moment the account carries a real site. It
         self-destructs on the first one, but do not rely on that if a demo
         is being screenshotted.                                          */
      sampleData_note: 'see sampleData above'
    },

    /* Branding for customer-facing exports (proposals, PDFs). */
    exportBrand: {
      logo:              '/joulesai-logo.png',
      name:              'Joules AI',
      poweredBy:         'Powered by ClearSky-OMEGA',
      platformCopyright: '\u00A9 2026 ClearSky Energy Solutions LLC \u00B7 ClearSky-OMEGA platform'
    }
  },

  /* ── ClearSky staff who may preview this deployment ───────────────────────
     These domains keep access even after the trial expires, so you can always
     get in to demo or troubleshoot.                                          */
  adminDomains: ['csebuilders.com', 'clearsky-usa.com'],

  platformName: 'ClearSky-OMEGA',

  /* JoulesAI's own public address — shown to their users for help with the
     product itself. info@ is the address on their site footer;
     partnerships@ appears throughout the product and case-study PDFs and is
     the better bet for a commercial trial. Swap for the trial sponsor's
     direct address once you know who that is: on a 30-day window a shared
     inbox can burn a week before anyone answers. */
  supportEmail: 'partnerships@joulesai.com',

  /* ClearSky's address. Everything commercial routes here: the trial banner's
     Upgrade link, locked-tool "Upgrade to unlock" buttons, and the expired-
     trial message. Kept separate from supportEmail so upgrade requests reach
     you rather than the customer's own inbox. */
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
