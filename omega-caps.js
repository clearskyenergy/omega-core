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
      /* ── CORE PRINTS A BLUEPRINT, AND THAT IS ALL ────────────────────
         This used to be the plot plan and the one-line, which are the two
         drawings a customer takes to a utility or an AHJ — the deliverables
         Performance is sold on. Giving them away at Core left nothing above
         it to sell but the engineering suite.

         Blueprint is the right thing to give: it is the drawing you print to
         show someone the site, and it is worthless as a permit set. The plot
         plan and the one-line move up; deluxe's blanket `export` already
         covers them through the dotted fallback in can(). */
      'export.blueprint'
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

  /* ── ADD-ONS: A SERVICE SOLD SEPARATELY FROM THE PLAN ────────────────
     billing/current.addons has existed and been editable in the master
     console the whole time, and nothing in the EDITOR ever read it. It fed
     the tool list through omega-tenant.js and stopped there — so "NextNRG
     bought Compute" was a string in a field that unlocked nothing they could
     see. This is the map that makes it mean something.

     ONE ADD-ON MAY GRANT SEVERAL CAPABILITIES, because a customer buys a
     product and not a data-cap attribute. Compute is the campus surface AND
     the screening that feeds it: selling the tab without the screen would be
     selling half a workflow.

     THEY ONLY EVER WIDEN, and they are applied after the tier AND after
     capTier. capTier exists to scope what the PLAN grants inside the editor;
     an add-on is a separate purchase and a ceiling on the plan must not
     quietly cancel it.

     Keys are matched loosely — lowercased, and - _ and spaces folded —
     because this is typed into a text field by a human. 'osa-jv' and
     'grid-atlas' grant nothing here on purpose: they are handled by the JV
     roster and the tool list respectively, and inventing editor caps for
     them would be two places to change one answer. */
  var ADDON_GRANTS = {
    compute:        ['compute', 'parcelscreen'],
    parcelscreen:   ['parcelscreen'],
    sitescreening:  ['parcelscreen'],
    engineering:    ['engineering'],
    schematics:     ['schematic', 'riser'],
    schematic:      ['schematic', 'riser'],
    exports:        ['export'],
    permitting:     ['permitting'],
    osajv:          [],
    gridatlas:      []
  };

  function addonKey(a) {
    return String(a || '').toLowerCase().replace(/[\s_\-]+/g, '');
  }

  var _addons = [];
  function setAddons(list) {
    _addons = (list && list.length ? list : []).map(addonKey).filter(Boolean);
    return _addons.slice();
  }
  function addonExtras() {
    var out = [];
    for (var i = 0; i < _addons.length; i++) {
      var g = ADDON_GRANTS[_addons[i]];
      if (g) for (var j = 0; j < g.length; j++) if (out.indexOf(g[j]) < 0) out.push(g[j]);
    }
    return out;
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
    /* Added last and never removing anything, so a carve-out or a purchased
       add-on can only ever widen what a tier already grants. */
    g = orgExtras();
    for (j = 0; j < g.length; j++) out[g[j]] = 1;
    g = addonExtras();
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
      /* ── THE EVENT ANNOUNCES A CHANGE, NOT A PASS ────────────────────
         This fired on every call. apply() is re-run by a DOM observer in
         the editor, so in a page that is constantly adding nodes — map
         tiles, renders, the ribbon injectors — omega:tier was dispatched
         several times a second, forever.

         That storm is what drove the Designer/Pro flashing: the editor
         listens for this event to revisit which mode the tier implies, and
         an announcement that "the tier arrived" repeated indefinitely is an
         instruction to re-decide indefinitely. The event exists because
         billing/current lands late and the first guess has to be revisited
         ONCE. Only a real change is news. */
      var _prev = global.document.body.getAttribute('data-tier');
      var _next = normalise(tier);
      var _changed = (_prev !== _next);
      global.document.body.setAttribute('data-tier', _next);
      /* ── THE TIER LANDS LATE, SO SAY SO ──────────────────────────────
         resolve() reads billing/current over the network, so everything
         that boots synchronously — the editor's Designer/Pro default among
         them — runs before the answer exists and has to assume trial. That
         assumption is only safe if it can be revisited, which needs a
         signal rather than a poll. Listeners get body[data-tier] as well,
         so a late subscriber can read the current answer without waiting
         for an event that has already fired. */
      if (_changed) {
        try {
          global.document.dispatchEvent(new CustomEvent('omega:tier', {
            detail: { tier: _next, removed: removed }
          }));
        } catch (e) {}
      }
    }
    return { tier: normalise(tier), removed: removed };
  }

  /* Reads the tier the customer is actually on. billing/current is the record
     the tool gate and their own account page read, so this asks the same
     question they would. Resolves to 'trial' on any failure — a read that
     fails should not hand out the engineering suite. */
  /* ── A CEILING BELOW THE PAID TIER ─────────────────────────────────────
     capTier on billing/current caps what the EDITOR grants, without touching
     what the customer is billed. An account can sit on enterprise for tools,
     reporting and seats and still be scoped to the designer inside the
     editor — which is a real commercial arrangement and previously had no
     way to be expressed.

     IT IS A FIELD, NOT A LIST IN THIS FILE. CLAUDE.md is explicit that core
     files are never edited for one tenant; a hardcoded domain here would be
     exactly that, and it would also be invisible to the admin console. As a
     billing field it shows up next to the tier it caps, and changing it is a
     console action rather than a deploy.

     LOWER ALWAYS WINS, and it can only narrow. A capTier above the paid tier
     does nothing — nobody is upgraded by a typo in a field ClearSky
     writes. */
  function effectiveTier(tier, capTier) {
    var t = normalise(tier);
    if (!capTier) return t;
    var c = normalise(capTier);
    var ti = LADDER.indexOf(t), ci = LADDER.indexOf(c);
    /* OFF-LADDER tiers are not capped by a ladder position. That is partner
       and internal — how ClearSky and JV partners hold accounts — and NOT
       enterprise, which is both UNGATED (it grants everything) and the top
       rung. Testing UNGATED here instead of ladder membership made
       enterprise uncappable, which is the only tier anybody would ever want
       to cap. */
    if (ti < 0 || ci < 0) return t;
    return ci < ti ? c : t;
  }

  /* ── CLEARSKY IS NOT A CUSTOMER OF ITSELF ──────────────────────────────
     resolve() reads billing/current and falls back to 'trial' when there is
     no record — which is right for an unpriced tenant and wrong for the
     company that builds the thing. clearsky-usa.com has no omega_orgs
     document, so every ClearSky account was resolving to trial and the
     gating was stripping their own ribbon: Apply for Financing, the
     engineering suite, the export group, all removed from the people
     demoing them.

     These two domains are the same pair isAdmin() uses in firestore.rules
     and adminDomains uses in the tenant configs. 'internal' is already in
     UNGATED, so it grants everything without inventing a new tier.

     A BILLING RECORD STILL WINS IF ONE EXISTS. This is a fallback for the
     absent-record case, not an override — so if ClearSky is ever given a
     real billing doc for testing, that is what applies. */
  var INTERNAL_DOMAINS = ['clearsky-usa.com', 'csebuilders.com'];

  function resolve(db, email) {
    return new Promise(function (done) {
      try {
        var d = setOrg(email);
        if (INTERNAL_DOMAINS.indexOf(d) >= 0 && !db) return done('internal');
        if (!d || !db) return done('trial');
        db.collection('omega_orgs').doc(d).collection('billing').doc('current').get()
          .then(function (s) {
            var b = s.exists ? (s.data() || {}) : {};
            if (!s.exists && INTERNAL_DOMAINS.indexOf(d) >= 0) return done('internal');
            setAddons(b.addons || []);
            var eff = effectiveTier(b.tier || 'trial', b.capTier);
            if (b.capTier && eff !== normalise(b.tier || 'trial') && global.console) {
              console.info('[caps] billed ' + b.tier + ', editor capped to ' + eff +
                           ' by capTier on billing/current');
            }
            done(eff);
          })
          .catch(function () {
            /* A failed read must not hand out the engineering suite to a
               customer — but it must not lock ClearSky out either. */
            done(INTERNAL_DOMAINS.indexOf(d) >= 0 ? 'internal' : 'trial');
          });
      } catch (e) { done('trial'); }
    });
  }

  global.OmegaCaps = {
    /* Exported so a caller that never goes through resolve() — a preview, a
       test, the master console showing what an add-on would unlock — can be
       explicit rather than relying on module state it cannot see. */
    ADDON_GRANTS: ADDON_GRANTS, setAddons: setAddons, addons: function () { return _addons.slice(); },
    LADDER: LADDER, GRANTS: GRANTS,
    JV_ORGS: JV_ORGS, JV_GRANTS: JV_GRANTS, INTERNAL_DOMAINS: INTERNAL_DOMAINS,
    normalise: normalise, setFor: setFor, can: can, apply: apply, resolve: resolve,
    setOrg: setOrg, orgOf: orgOf, org: function () { return _org; },
    effectiveTier: effectiveTier
  };
})(typeof window !== 'undefined' ? window : this);
