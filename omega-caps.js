/* omega-caps.js — what each plan may DO inside a tool.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   omega-tools.js decides which TOOLS a tenant sees. This decides what they may
   do once inside one — the editor has a compute campus, schematics, riser
   diagrams and permit-set exports behind a single tool entry, and those are
   not all the same product.

   ── THE LADDER, AS SPECIFIED ──
     trial       the designer only. Draw, place, annotate. No deliverables.
     standard    + plot plan and one-line diagram exports. Nothing else.
     deluxe      + schematics, riser diagrams, engineering, parcel screening.
     enterprise  everything, including the compute campus and the permitting
                 matrix.

   ── THE JV CARVE-OUT ──
   The compute campus sits at enterprise, and the three OSA joint-venture
   organisations hold it regardless of what tier they are on. They co-develop
   the compute product; gating them out of it would lock the people building
   it out of the thing they are building.

   It is a GRANT BY ORGANISATION, not a tier promotion. Their billing record
   is untouched and every other capability still follows their tier, so the
   carve-out cannot quietly become a free enterprise licence.

   Each tier INCLUDES the ones below it, so a capability is added in one place
   and never listed twice — the bug that list-per-tier invites is a capability
   granted at tier 3 and forgotten at tier 4.

   ⚠ THIS IS PRODUCT GATING, NOT SECURITY. Everything here runs in a browser
   the customer controls, so a determined user can re-enable a button. What
   stops them getting the DATA is firestore.rules and the api/ functions;
   CLAUDE.md is explicit that pricing and eligibility logic belongs server
   side. Treat this as the shape of the product, and never as the thing
   keeping anyone out.

   ⚠ TIER STRINGS ARE billing/current.tier — trial | standard | deluxe |
   enterprise. NOT the roster's tier1/2/3. "Tier 2" in conversation is
   Performance, which is DELUXE here; TIER.DELUXE === 2 in omega-tools.js. */
(function (global) {
  'use strict';

  var LADDER = ['trial', 'standard', 'deluxe', 'enterprise'];

  /* Added at the tier that first grants them. Inherited upward. */
  var GRANTS = {
    trial: [
      'design',            // draw, place equipment, annotate — the designer
      'view'
    ],
    standard: [
      'export.plotplan',   // E0 / E1.1
      'export.oneline'     // E2.0
    ],
    deluxe: [
      'schematic',         // schematic editor / overlay
      'riser',             // riser diagrams
      'engineering',       // analyze + estimate
      'parcelscreen',      // parcel screening from a traced KMZ
      'export'             // the rest of the output page
    ],
    enterprise: [
      'compute',           // compute campus tab — see THE JV CARVE-OUT above
      'all'
    ]
  };

  /* ── JV CARVE-OUT ──────────────────────────────────────────────────────
     Capabilities held by organisation rather than by tier.

     THE SAME THREE DOMAINS AS index.html's OSA_ORGS, and that duplication is
     a known wart — CLAUDE.md already flags the org-alias map for the same
     reason. This is the narrower of the two lists to keep in step: adding a
     fourth JV partner means editing both, and a JV is not something that
     should be switchable from an admin console anyway.

     A literal list cannot leak. The previous JV nav gate honoured Firestore
     flags as well and showed the section to SPATCO, who have no JV
     relationship of any kind. */
  var JV_ORGS   = ['clearsky-usa.com', 'sunesol.com', 'ogisolar.com'];
  var JV_GRANTS = ['compute'];

  /* Set by resolve() from the signed-in address, so callers keep the same
     signatures they always had. One browser, one signed-in person — module
     state is the honest shape here, and setOrg() is exported so a caller who
     never goes through resolve() can still be explicit. */
  var _org = '';

  function orgOf(email) {
    var d = String(email || '').toLowerCase().split('@')[1] || '';
    return (d === 'fenecon.de' || d === 'fenecon.us') ? 'fenecon.com' : d;
  }
  function setOrg(email) { _org = orgOf(email); return _org; }
  function orgExtras() {
    return JV_ORGS.indexOf(_org) >= 0 ? JV_GRANTS : [];
  }

  /* partner and internal are not on the commercial ladder — they are how
     ClearSky and JV partners hold accounts, and gating them like a paying
     customer would lock the people who build the thing out of it. */
  var UNGATED = { enterprise: 1, internal: 1, partner: 1 };

  function normalise(tier) {
    var t = String(tier || '').toLowerCase().trim();
    /* An unknown or missing tier resolves to TRIAL, deliberately. The tool
       gate in omega-tools.js defaults an unknown string OPEN, which is right
       for a tool list and wrong here: an unpriced account should get the
       designer, not the engineering suite, until somebody prices it. */
    return LADDER.indexOf(t) >= 0 || UNGATED[t] ? t : 'trial';
  }

  function setFor(tier) {
    var t = normalise(tier), out = {}, i, j, g;
    if (UNGATED[t]) { out.all = 1; return out; }
    var top = LADDER.indexOf(t);
    for (i = 0; i <= top; i++) {
      g = GRANTS[LADDER[i]] || [];
      for (j = 0; j < g.length; j++) out[g[j]] = 1;
    }
    /* Added last and never removes anything, so the carve-out can only ever
       widen what a tier already grants. */
    g = orgExtras();
    for (j = 0; j < g.length; j++) out[g[j]] = 1;
    return out;
  }

  function can(tier, cap) {
    var s = setFor(tier);
    if (s.all) return true;
    if (s[cap]) return true;
    /* A dotted capability falls back to its parent, so data-cap="export.dxf"
       is covered by the deluxe "export" grant without listing every format —
       and standard's two named exports stay exactly two. */
    var dot = String(cap || '').indexOf('.');
    return dot > 0 ? !!s[String(cap).slice(0, dot)] : false;
  }

  /* Walks [data-cap] and removes what the tier does not include.
     REMOVED, NOT DISABLED, for anything the customer has not bought: a greyed
     tab that says "Compute" is an advert inside a tool they are working in,
     and it invites a support ticket every time. Upgrade lives on the account
     page, once, not scattered through the ribbon. */
  function apply(tier, root) {
    var scope = root || global.document;
    if (!scope || !scope.querySelectorAll) return { tier: normalise(tier), removed: 0 };
    var nodes = scope.querySelectorAll('[data-cap]'), removed = 0, i, el, cap;
    for (i = 0; i < nodes.length; i++) {
      el = nodes[i];
      cap = el.getAttribute('data-cap');
      if (can(tier, cap)) continue;
      el.setAttribute('data-cap-blocked', '1');
      el.style.display = 'none';
      removed++;
    }
    if (global.document && global.document.body) {
      global.document.body.setAttribute('data-tier', normalise(tier));
    }
    return { tier: normalise(tier), removed: removed };
  }

  /* Reads the tier the customer is actually on. billing/current is the record
     the tool gate and their own account page read, so this asks the same
     question they would. Resolves to 'trial' on any failure — a read that
     fails should not hand out the engineering suite. */
  function resolve(db, email) {
    return new Promise(function (done) {
      try {
        var d = setOrg(email);
        if (!d || !db) return done('trial');
        db.collection('omega_orgs').doc(d).collection('billing').doc('current').get()
          .then(function (s) { done(s.exists ? ((s.data() || {}).tier || 'trial') : 'trial'); })
          .catch(function () { done('trial'); });
      } catch (e) { done('trial'); }
    });
  }

  global.OmegaCaps = {
    LADDER: LADDER, GRANTS: GRANTS,
    JV_ORGS: JV_ORGS, JV_GRANTS: JV_GRANTS,
    normalise: normalise, setFor: setFor, can: can, apply: apply, resolve: resolve,
    setOrg: setOrg, orgOf: orgOf, org: function () { return _org; }
  };
})(typeof window !== 'undefined' ? window : this);
