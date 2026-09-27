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

  /* Packaged state is a server projection of the sole catalog. Never derive
     it from tiers, addons, query strings or a second browser module table. */
  var _package = null, _packageRequest = 0, MODULE_GRANTS = {}, _packageSignature = null, _tier = null;
  var COMMANDS = '.rbtn,.rsbtn,.rb-fly-item,#app-menu .menu-item,[data-module],[data-cap]';
  /* The locked projection: signed out, a read that failed, a 403, or (with
     `loading`) the moment between sign-in and the answer. Nothing else may
     read a pending view as "this workspace has a package". */
  function pendingPackage(loading) { return { packaged: true, pending: true, loading: loading === true, readOnly: true, modules: [], caps: [], toolAccess: [], catalog: [], notSold: [] }; }
  /* ── WHEN THE PLAN COULD NOT BE CHECKED ──────────────────────────────
     A billing read or a package fetch that FAILED is not a package with
     nothing in it. pendingPackage(true) is the short wait while the answer
     is on its way and withholds every command; left in place after a
     failure it emptied the whole ribbon, tabs and all, and the Ladder then
     said "your package includes every module". Nobody knows yet whether
     this workspace is legacy or packaged, so nothing that produces is shown
     (hide, don't grey: docs/PACKAGING-ROADMAP.md §3.1) — but opening,
     viewing and moving between projects stays, the same commands an unpaid
     packaged workspace keeps. It is still `pending` (never "this workspace
     has a package": the editor mode, the workspace presets and standing()
     read it as none) and not `loading`, so the menu's plan strip says the
     plan could not be checked and offers Try again. The list is the
     server's M.readOnlyRibbon(), which cannot be fetched when the fetching
     is what failed; scripts/tests/teditorplan.js fails if the two drift. */
  var UNVERIFIED_READ_ONLY = ['openProjectsModal', 'rbNav', 'rbTab', 'omegaThemePick', 'omegaLoadMap', 'toggleLayersPanel', 'toggleCompassPanel',
    'toggleSitePanel', 'toggleMeterPanel', 'toggleDockLeft', 'toggleDiagPanel', 'opToggleCoords', "openRpPanel('summary')", "rpTab('summary')"];
  function unverifiedPackage() {
    var v = pendingPackage(false);
    v.unverified = true; v.readOnlyRibbon = UNVERIFIED_READ_ONLY.slice();
    return v;
  }
  /* What a failed answer leaves on screen: a 403 is the server saying no to
     THIS person (unverified email, not a member yet, disabled), so locked
     and said as that, never as a connection problem or a bill to pay;
     anything else is a connection that did not answer, so the plan is
     unchecked. */
  function failedView(e) {
    if (e && e.status === 403) { var v = pendingPackage(); v.refused = e.reason || 'Your access to this workspace\'s tools was refused.'; return v; }
    return unverifiedPackage();
  }
  function setPackage(view) {
    var previous = _package;
    _package = view && view.packaged === true ? view : null;
    if (_package && (!Array.isArray(view.modules) || !Array.isArray(view.caps) || !Array.isArray(view.catalog) || !Array.isArray(view.toolAccess))) _package = pendingPackage();
    Object.keys(MODULE_GRANTS).forEach(function (k) { delete MODULE_GRANTS[k]; });
    if (_package) _package.catalog.forEach(function (m) { MODULE_GRANTS[m.key] = m; });
    if (previous && !_package && global.document && global.document.querySelectorAll) {
      var old = global.document.querySelectorAll('[data-package-hidden],[data-package-empty],[data-workspace-hidden]');
      for (var n = 0; n < old.length; n++) {
        if (old[n].hasAttribute('data-package-hidden')) old[n].style.display = old[n].getAttribute('data-package-display') || '';
        old[n].removeAttribute('data-package-hidden'); old[n].removeAttribute('data-package-display');
        old[n].removeAttribute('data-package-empty'); old[n].removeAttribute('data-workspace-hidden');
      }
      if (global.document.body && global.document.body.removeAttribute) global.document.body.removeAttribute('data-packaged-editor');
      if (global.OmegaWorkspaces && global.OmegaWorkspaces.reset) global.OmegaWorkspaces.reset();
      ['omega-workspace-controls', 'omega-package-tab', 'omega-plan-notice'].forEach(function (id) { var el = global.document.getElementById && global.document.getElementById(id); if (el) el.remove(); });
      if (global.OmegaPackageMenu) global.OmegaPackageMenu.close();
      _packageSignature = null;
    }
    return _package;
  }
  function matches(selector, id, handler) {
    if (selector.charAt(0) === '#') return selector.slice(1) === id;
    var compact = String(handler || '').replace(/\s/g, '').replace(/"/g, "'");
    if (selector.indexOf('(') >= 0) return compact.indexOf(selector) >= 0;
    return new RegExp('(^|[^a-zA-Z0-9_$])' + selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=[^a-zA-Z0-9_$]|$)').test(compact);
  }
  function owners(id, handler) {
    if (!_package) return [];
    var rows = (_package.catalog || []).concat(_package.notSold || []), exact = [], out = [];
    rows.forEach(function (m) { (m.ribbon || []).forEach(function (s) {
      if (matches(s, id, handler)) {
        if (s.charAt(0) === '#') { if (exact.indexOf(m.key) < 0) exact.push(m.key); }
        else if (out.indexOf(m.key) < 0) out.push(m.key);
      }
    }); });
    return exact.length ? exact : out;
  }
  function allowedCommand(id, handler) {
    if (!_package || _package.staff) return true;
    if (_package.unverified) return (_package.readOnlyRibbon || []).some(function (s) { return matches(s, id, handler); });
    if (_package.toolAccess.indexOf('editor') < 0) return false;
    var own = owners(id, handler);
    if (!own.some(function (k) { return _package.modules.indexOf(k) >= 0; })) return false;
    if (!_package.readOnly) return true;
    return (_package.readOnlyRibbon || []).some(function (s) { return matches(s, id, handler); });
  }
  function isTab(el) { return !!(el.classList && (el.classList.contains('rtab') || el.classList.contains('ribbon-page'))); }
  /* a tab (or its page) stays while one of its buttons is allowed */
  function tabHolds(el) {
    var page = el.classList.contains('ribbon-page') ? el : global.document.querySelector('.ribbon-page[data-page="' + el.getAttribute('data-page') + '"]');
    var children = page ? page.querySelectorAll('.rbtn,.rsbtn') : [];
    for (var c = 0; c < children.length; c++) if (allowedElement(children[c])) return true;
    return false;
  }
  function allowedElement(el) {
    if (!_package || _package.staff) return true;
    if (!el || !el.getAttribute) return false;
    /* unchecked plan: judged by what the command does, never by a module
       mark an earlier package left on the button */
    if (_package.unverified) return isTab(el) ? tabHolds(el) : allowedCommand(el.id || '', el.getAttribute('onclick') || '');
    var module = el.getAttribute('data-module'), cap = el.getAttribute('data-cap');
    if (module && !_package.modules.some(function (k) { return module.split(/\s+/).indexOf(k) >= 0; })) return false;
    var handler = el.getAttribute('onclick') || '', own = owners(el.id || '', handler);
    if (own.length) return allowedCommand(el.id || '', handler);
    if (module) return !_package.readOnly;
    if (cap && isTab(el)) return tabHolds(el);
    if (cap) {
      if (_package.readOnly && cap !== 'view') return false;
      /* Container caps may group specific owned exports. Ownership of one
         child must not grant its siblings; each command is checked below. */
      return _package.caps.some(function (k) { return k === cap || k.indexOf(cap + '.') === 0; });
    }
    if (module) return !_package.readOnly;
    return false; // An unclassified command never inherits a tier grant.
  }
  function applyPackage(scope) {
    if (!_package || !scope || !scope.querySelectorAll) return 0;
    guardLaunchers();
    var nodes = scope.querySelectorAll(COMMANDS), removed = 0;
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i], own = owners(el.id || '', el.getAttribute('onclick') || '');
      if (own.length === 1 && el.matches('.rbtn,.rsbtn,.rb-fly-item,#app-menu .menu-item')) el.setAttribute('data-module', own[0]);
      var allowed = allowedElement(el);
      if (!allowed) {
        if (!el.hasAttribute('data-package-hidden')) el.setAttribute('data-package-display', el.style.display || '');
        el.setAttribute('data-package-hidden', '1'); el.style.setProperty('display', 'none', 'important'); removed++;
      } else if (el.hasAttribute('data-package-hidden')) {
        el.style.display = el.getAttribute('data-package-display') || '';
        el.removeAttribute('data-package-hidden'); el.removeAttribute('data-package-display');
      }
    }
    return removed;
  }
  function commandPage(el, destination) {
    if (!_package || !el || !global.document) return destination;
    var target = global.document.querySelector('.ribbon-page[data-page="' + destination + '"]');
    var owner = target && target.getAttribute('data-module');
    var keys = owners(el.id || '', el.getAttribute('onclick') || '');
    var module = keys.length === 1 && MODULE_GRANTS[keys[0]];
    return owner && module && module.key !== owner && module.editorPage ? module.editorPage : destination;
  }
  function rehome(scope) {
    var nodes = scope.querySelectorAll('#ribbon .ribbon-page[data-module] .rbtn,#ribbon .ribbon-page[data-module] .rsbtn');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i], page = el.closest('.ribbon-page'), from = page.getAttribute('data-page');
      var destination = commandPage(el, from);
      if (destination === from) continue;
      var target = global.document.querySelector('.ribbon-page[data-page="' + destination + '"] .rpanel-body');
      var node = el.closest('.rbtn-wrap') || el;
      if (target && node.parentNode !== target) target.appendChild(node);
    }
  }
  function layout(scope) {
    if (!_package || !scope || !scope.querySelectorAll || !global.document) return;
    var doc = global.document;
    if (!doc.getElementById('omega-package-layout-style')) {
      var style = doc.createElement('style'); style.id = 'omega-package-layout-style';
      style.textContent =
        'body[data-packaged-editor="1"][data-packaged-editor] #tb{height:auto;min-height:32px;flex-wrap:wrap}' +
        'body[data-packaged-editor="1"][data-packaged-editor] #ribbon .ribbon-page{max-width:100%;width:100%;flex-wrap:wrap;height:auto;overflow:visible;align-items:stretch}' +
        'body[data-packaged-editor="1"][data-packaged-editor] #ribbon .rpanel{min-width:0;max-width:100%;min-height:78px;flex-direction:column}' +
        'body[data-packaged-editor="1"][data-packaged-editor] #ribbon .rpanel-body{min-height:56px;flex:1 0 auto;order:0;flex-wrap:wrap}' +
        'body[data-packaged-editor="1"][data-packaged-editor] #ribbon .rpanel-cap{order:1}' +
        'body[data-packaged-editor="1"][data-packaged-editor] #ribbon{height:auto;max-height:42vh;overflow:auto}' +
        'body[data-packaged-editor="1"][data-packaged-editor] #ribbon-tabs{min-width:0;flex-wrap:wrap;flex:1 0 100%;height:32px;min-height:32px}' +
        'body[data-packaged-editor="1"][data-packaged-editor] #ribbon-tabs .rtab{padding:0 9px;font-size:11px;height:32px}' +
        'body[data-packaged-editor="1"][data-packaged-editor] #ribbon .rbtn:not([data-package-hidden]):not([data-omega-retired]):not([data-packaging-retired]):not([data-shelf-dupe]):not(.omega-gated-hidden),' +
        'body[data-packaged-editor="1"][data-packaged-editor] #ribbon .rsbtn:not([data-package-hidden]):not([data-omega-retired]):not([data-packaging-retired]):not([data-shelf-dupe]):not(.omega-gated-hidden){display:flex!important}' +
        'body[data-packaged-editor="1"][data-packaged-editor] #ribbon .rbtn-wrap:not([data-package-empty]),body[data-packaged-editor="1"][data-packaged-editor] #ribbon .rpanel:not([data-package-empty]){display:flex!important}' +
        'body[data-packaged-editor="1"][data-packaged-editor] #ribbon-tabs .rtab:not([data-package-empty]):not([data-package-hidden]){display:flex!important}' +
        'body[data-packaged-editor="1"][data-packaged-editor] #ribbon [data-package-empty],body[data-packaged-editor="1"][data-packaged-editor] #ribbon-tabs [data-package-empty],body[data-packaged-editor="1"][data-packaged-editor] #ribbon-tab-menu [data-package-empty],body[data-packaged-editor="1"][data-packaged-editor] [data-package-hidden]{display:none!important}' +
        'body[data-packaged-editor="1"][data-packaged-editor] #omega-package-tab{order:999}' +
        '#omega-workspace-controls{display:flex;align-items:center;gap:8px;padding:4px 12px;font:11px system-ui;color:var(--sub);background:var(--navy)}' +
        '#omega-workspace-controls button{font:inherit;color:var(--text);border:1px solid var(--border);background:transparent;border-radius:4px;padding:4px 8px;cursor:pointer}';
      (doc.head || doc.body).appendChild(style);
    }
    function usable(el) {
      return !el.hasAttribute('data-package-hidden') && !el.hasAttribute('data-omega-retired') && !el.hasAttribute('data-packaging-retired') && !el.classList.contains('omega-gated-hidden') && !el.hasAttribute('data-shelf-dupe');
    }
    function hasControls(el) {
      var controls = el.querySelectorAll('.rbtn,.rsbtn,input,select,.home-recent-item');
      for (var i = 0; i < controls.length; i++) if (usable(controls[i])) return true;
      return false;
    }
    var wraps = scope.querySelectorAll('#ribbon .rbtn-wrap');
    for (var w = 0; w < wraps.length; w++) wraps[w].toggleAttribute('data-package-empty', !hasControls(wraps[w]));
    var pages = scope.querySelectorAll('#ribbon .ribbon-page');
    for (var p = 0; p < pages.length; p++) {
      var groups = pages[p].querySelectorAll('.rpanel'), number = 0, any = false;
      for (var g = 0; g < groups.length; g++) {
        var present = hasControls(groups[g]);
        groups[g].toggleAttribute('data-package-empty', !present);
        if (!present) continue;
        any = true;
        var cap = groups[g].querySelector('.rpanel-cap');
        if (cap && /^\s*\d+\s*[·.]/.test(cap.textContent)) {
          var title = cap.textContent.replace(/^\s*\d+\s*[·.]\s*/, '');
          var text = (++number) + ' · ' + title;
          if (cap.textContent !== text) cap.textContent = text;
        }
      }
      if (!groups.length) any = hasControls(pages[p]);
      var key = pages[p].getAttribute('data-page'), tab = doc.querySelector('#ribbon-tabs .rtab[data-page="' + key + '"]');
      pages[p].toggleAttribute('data-package-empty', !any);
      if (tab) tab.toggleAttribute('data-package-empty', !any);
      var mobile = doc.querySelector('#ribbon-tab-menu [onclick="rbHamburgerPick(\'' + key + '\')"]');
      if (mobile) mobile.toggleAttribute('data-package-empty', !any);
    }
    var active = doc.querySelector('#ribbon-tabs .rtab.active');
    if (active && (active.hasAttribute('data-package-empty') || active.hasAttribute('data-package-hidden'))) {
      var next = doc.querySelector('#ribbon-tabs .rtab:not([data-package-empty]):not([data-package-hidden]):not([data-page="__file"])');
      if (next && typeof global.rbTab === 'function') global.rbTab(next.getAttribute('data-page'));
    }
    /* The bar above the ribbon used to carry the project's name and an "All
       tools" toggle for what the project type had hidden. The project type
       now hides nothing (omega-workspaces.js), so the bar is only the staff
       "Viewing as" preview, and a customer's ribbon starts one row higher. */
    var controls = doc.getElementById('omega-workspace-controls');
    if (!_package.canPreview && controls) controls.remove();
    else if (_package.canPreview && !controls) {
      var ribbon = doc.getElementById('ribbon');
      if (ribbon && ribbon.parentNode) {
        var bar = doc.createElement('div'); bar.id = 'omega-workspace-controls';
        ribbon.parentNode.insertBefore(bar, ribbon);
      }
    }
    if (global.OmegaPackageMenu) { global.OmegaPackageMenu.tab(); global.OmegaPackageMenu.staffPreview(); if (global.OmegaPackageMenu.notice) global.OmegaPackageMenu.notice(); ladderTab(doc); }
  }
  /* An unchecked plan has no catalog, so the Ladder would open on "your
     package includes every module", which is false. While the plan is
     unchecked the tab opens the plan chip's panel instead, which says the
     plan and its pricing could not be loaded and offers Retry
     (omega-editor-plan.js); once a real answer lands the menu comes back. */
  function ladderTab(doc) {
    var tab = doc.getElementById('omega-package-tab');
    if (!tab) return;
    if (!tab.hasOwnProperty('_omegaMenu')) { tab._omegaMenu = tab.onclick; tab._omegaTitle = tab.title; }
    if (_package && _package.unverified) {
      tab.onclick = function () { if (global.OmegaEditorPlan && global.OmegaEditorPlan.open) global.OmegaEditorPlan.open(); };
      tab.title = 'Module pricing could not be loaded: your plan could not be checked. Open to retry.';
      tab.setAttribute('data-plan-unverified', '1');
    } else {
      tab.onclick = tab._omegaMenu; tab.title = tab._omegaTitle;
      tab.removeAttribute('data-plan-unverified');
    }
  }
  function guardLaunchers() {
    if (!_package) return;
    (_package.catalog || []).concat(_package.notSold || []).forEach(function (m) {
      (m.ribbon || []).forEach(function (selector) {
        if (selector.charAt(0) === '#') return;
        var name = selector.split('(')[0], parts = name.split('.'), host = global;
        for (var i = 0; i < parts.length - 1; i++) { host = host && host[parts[i]]; }
        var key = parts[parts.length - 1], original = host && host[key];
        if (typeof original !== 'function' || original._omegaPackageGuard) return;
        var wrapped = function () {
          var args = Array.prototype.slice.call(arguments), encoded;
          try { encoded = args.map(function (a) { return JSON.stringify(a); }).join(','); } catch (e) { encoded = ''; }
          if (!allowedCommand('', name + '(' + encoded + ')')) return false;
          return original.apply(this, arguments);
        };
        wrapped._omegaPackageGuard = true;
        host[key] = wrapped;
      });
    });
  }
  /* The server's projection for this user, read without touching what is on
     screen. A refusal carries its status: 403 is the server saying no (the
     workspace or the membership lost access), anything else is a connection
     that did not answer. */
  function projection(user) {
    if (!user || !user.getIdToken || !global.fetch) return Promise.reject(new Error('Package access unavailable'));
    return user.getIdToken().then(function (token) {
      return global.fetch('/api/package-access', { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store' });
    }).then(function (r) {
      if (r.ok) return r.json();
      /* the server's own reason travels with a refusal: "Verified email
         required", "Active organization membership required", ... */
      return r.json().then(function (j) { return j && j.error; }, function () { return null; }).then(function (why) {
        var e = new Error(why || 'Package access unavailable'); e.status = r.status; if (why) e.reason = why; throw e;
      });
    })
      .then(function (v) { if (global.firebase && global.firebase.auth().currentUser !== user) throw new Error('Account changed'); if (!v || v.packaged !== true) throw new Error('Package access changed; reload'); return v; });
  }
  function fetchPackage(user) {
    var request = ++_packageRequest;
    var waiting = setPackage(pendingPackage());
    /* a fetch that fails leaves the plan UNCHECKED (or refused, on a 403),
       not empty (see failedView); only while this is still the latest
       request and nothing else has answered in the meantime */
    return projection(user).then(function (v) { if (request !== _packageRequest) throw new Error('Account changed'); setPackage(v); return v; },
      function (e) { if (request === _packageRequest && _package === waiting) setPackage(failedView(e)); throw e; });
  }
  /* Capture covers keyboard-generated clicks and programmatic .click() on
     a hidden button. The API still checks every producing request. */
  if (global.document && global.document.addEventListener) global.document.addEventListener('click', function (e) {
    if (!_package || !e.target || !e.target.closest) return;
    var el = e.target.closest(COMMANDS);
    if (el && !allowedElement(el)) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);

  /* ── WHAT A LEGACY PLAN GRANTS, AS A PURE FUNCTION ─────────────────────
     setFor() answers for the signed-in account (module state set by
     resolve()); grants() answers for any workspace a page names, so the
     store, the Modules page and the master console can say what a legacy
     plan opens in the editor by asking this ladder instead of keeping a
     second one. options: { addons: [], org: 'domain', capTier: 'tier' }.
     The same widening rules: the tier (under its capTier), then the JV
     carve-out, then add-ons, which only ever add. */
  function grants(tier, options) {
    options = options || {};
    var t = options.capTier ? effectiveTier(tier, options.capTier) : normalise(tier), out = {}, i, j, g;
    if (UNGATED[t]) { out.all = 1; return out; }
    var top = LADDER.indexOf(t);
    for (i = 0; i <= top; i++) {
      g = GRANTS[LADDER[i]] || [];
      for (j = 0; j < g.length; j++) out[g[j]] = 1;
    }
    /* Added last and never removing anything, so a carve-out or a purchased
       add-on can only ever widen what a tier already grants. */
    g = JV_ORGS.indexOf(orgOf('x@' + (options.org || ''))) >= 0 ? JV_GRANTS : [];
    for (j = 0; j < g.length; j++) out[g[j]] = 1;
    (options.addons || []).forEach(function (a) { (ADDON_GRANTS[addonKey(a)] || []).forEach(function (k) { out[k] = 1; }); });
    return out;
  }
  function capIn(s, cap) {
    if (s.all || s[cap]) return true;
    /* A dotted capability falls back to its parent, so data-cap="export.dxf"
       is covered by the deluxe "export" grant without listing every format —
       and standard's two named exports stay exactly two. */
    var dot = String(cap || '').indexOf('.');
    return dot > 0 ? !!s[String(cap).slice(0, dot)] : false;
  }
  function canWith(tier, cap, options) { return capIn(grants(tier, options), cap); }

  function setFor(tier) {
    var out = {};
    if (_package) {
      (_package.readOnly ? ['view'] : _package.caps).forEach(function (k) { out[k] = 1; });
      return out;
    }
    return grants(tier, { org: _org, addons: _addons });
  }

  /* Does the LEGACY tier ladder decide this capability at all? A package's
     module capabilities ('storage', 'estimate', 'gridatlas' …) are not on the
     ladder, so a legacy editor never checks them; the ladder's own words
     (design, view, export.*, schematic, riser, engineering, parcelscreen,
     compute, permitting) are. The workspace Modules page asks this so that
     "what you hold" there is what Site Map opens (2026-09-27). */
  var GOVERNED = null;
  function governs(cap) {
    if (!GOVERNED) {
      GOVERNED = {};
      var k, i;
      for (k in GRANTS) if (Object.prototype.hasOwnProperty.call(GRANTS, k)) for (i = 0; i < GRANTS[k].length; i++) GOVERNED[GRANTS[k][i]] = 1;
      for (k in ADDON_GRANTS) if (Object.prototype.hasOwnProperty.call(ADDON_GRANTS, k)) for (i = 0; i < ADDON_GRANTS[k].length; i++) GOVERNED[ADDON_GRANTS[k][i]] = 1;
      for (i = 0; i < JV_GRANTS.length; i++) GOVERNED[JV_GRANTS[i]] = 1;
      delete GOVERNED.all;
    }
    var c = String(cap || ''), dot = c.indexOf('.');
    return !!(GOVERNED[c] || (dot > 0 && GOVERNED[c.slice(0, dot)]));
  }
  /* true/false for a capability the ladder decides, null for one it does not.
     Judged on the ladder alone (canWith, with the account's JV org and
     add-ons), never on a live package: a legacy question has a legacy
     answer whatever the editor on screen holds. */
  function editorCan(tier, cap) { return governs(cap) ? canWith(tier, cap, { org: _org, addons: _addons }) : null; }

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
  /* ── A HIDDEN BUTTON COMES BACK WHEN THE PLAN SAYS SO ─────────────────
     The legacy pass only ever hid: a button removed on one answer stayed
     removed after a wider one, so a plan upgraded while the editor was open,
     an account switched in the same tab, or a workspace ClearSky moved onto
     a package (the legacy opt-in path) kept a ribbon narrower than what was
     bought. Each block records the display it replaced and gives it back. */
  function unblock(el) {
    if (!el.hasAttribute('data-cap-blocked')) return;
    el.style.display = el.getAttribute('data-cap-display') || '';
    el.removeAttribute('data-cap-blocked'); el.removeAttribute('data-cap-display');
  }
  function apply(tier, root) {
    var scope = root || global.document;
    _tier = normalise(tier);
    if (!scope || !scope.querySelectorAll) return { tier: normalise(tier), removed: 0 };
    if (_package) {
      /* Legacy tier blocks mean nothing under a package; the projection
         decides every command, so none of them may linger. */
      var stale = scope.querySelectorAll('[data-cap-blocked]');
      for (var s = 0; s < stale.length; s++) unblock(stale[s]);
      if (global.OmegaComputeTab && global.OmegaComputeTab.place) global.OmegaComputeTab.place();
      rehome(scope);
      var hidden = applyPackage(scope);
      if (global.document && global.document.body) {
        global.document.body.setAttribute('data-packaged-editor', '1');
        var signature = JSON.stringify([_package.modules, _package.staff, _package.readOnly, !!_package.unverified]);
        if (_packageSignature !== signature) {
          _packageSignature = signature;
          try { global.document.dispatchEvent(new global.CustomEvent('omega:package', { detail: _package })); } catch (e) {}
        }
      }
      if (global.OmegaWorkspaces) global.OmegaWorkspaces.apply(scope);
      layout(scope);
      return { tier: normalise(tier), packaged: true, removed: hidden };
    }
    var nodes = scope.querySelectorAll('[data-cap]'), removed = 0, i, el, cap;
    for (i = 0; i < nodes.length; i++) {
      el = nodes[i];
      cap = el.getAttribute('data-cap');
      if (can(tier, cap)) { unblock(el); continue; }
      if (!el.hasAttribute('data-cap-blocked')) el.setAttribute('data-cap-display', el.style.display || '');
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

     Only a verified Firebase email at ClearSky's current staff domain may
     use this presentation fallback. Server authorization still uses caller.staff. 'internal' is already in
     UNGATED, so it grants everything without inventing a new tier.

     A BILLING RECORD STILL WINS IF ONE EXISTS. This is a fallback for the
     absent-record case, not an override — so if ClearSky is ever given a
     real billing doc for testing, that is what applies. */
  var INTERNAL_DOMAINS = ['clearsky-usa.com'];

  /* ── ONE READ OF THE PLAN, TWO CALLERS ──────────────────────────────────
     read() answers "what may this account do in the editor" and changes
     nothing: { tier, addons, view } where view is the package projection or
     null for a legacy record. resolve() (sign-in) and refresh() (the plan
     changed while the editor was open) both ask it, so there is one set of
     rules for both and a re-check can never reach a different answer than
     signing in again would.

     They differ only in what a failure means. At sign-in every failure is
     the locked answer: a read that fails must not hand out the engineering
     suite (and must not lock ClearSky out either: internal stays internal).
     A failure leaves the plan UNCHECKED (unverifiedPackage): viewing stays,
     producing waits, and Retry (retry(), the plan chip) or Try again
     (refresh(), the plan strip) asks again without a reload. A refresh that
     cannot reach the server keeps what is on screen (`transient`), because
     a dropped connection is not a lapsed payment and the server still
     refuses every producing request on its own. A 403 from the projection
     is the server saying no, and it locks either way (failedView). */
  function read(db, email, emailVerified, refreshing) {
    var d = orgOf(email), internal = emailVerified === true && INTERNAL_DOMAINS.indexOf(d) >= 0;
    function locked() { return { tier: internal ? 'internal' : 'trial', addons: [], view: internal ? null : unverifiedPackage() }; }
    if (internal && !db) return Promise.resolve({ tier: 'internal', addons: [], view: null });
    if (!d || !db) return Promise.resolve({ tier: 'trial', addons: [], view: null });
    return db.collection('omega_orgs').doc(d).collection('billing').doc('current').get().then(function (s) {
      var b = s.exists ? (s.data() || {}) : {};
      if (!s.exists && internal) return { tier: 'internal', addons: [], view: null };
      if (b.packaged === true) {
        var user = global.firebase && global.firebase.auth().currentUser;
        if (!user || user.email !== email) return { tier: 'trial', addons: [], view: pendingPackage() };
        return projection(user).then(function (view) { return { tier: view.tier || 'standard', addons: [], view: view }; }, function (e) {
          if (refreshing && e.status !== 403) return { transient: true };
          /* a 403 locks, said as a refusal; anything else leaves the plan
             unchecked: viewing stays, producing waits (failedView) */
          return { tier: 'trial', addons: [], view: failedView(e) };
        });
      }
      var eff = effectiveTier(b.tier || 'trial', b.capTier);
      if (!refreshing && b.capTier && eff !== normalise(b.tier || 'trial') && global.console) {
        console.info('[caps] billed ' + b.tier + ', editor capped to ' + eff +
                     ' by capTier on billing/current');
      }
      return { tier: eff, addons: b.addons || [], view: null };
    }, function () { return refreshing ? { transient: true } : locked(); });
  }
  function commit(plan) { setAddons(plan.addons || []); setPackage(plan.view); }

  function resolve(db, email, emailVerified) {
    return new Promise(function (done) {
      try {
        setOrg(email);
        setAddons([]);
        var resolution = ++_packageRequest;
        /* LOCKED while the answer is on its way, never open: the previous
           account's package must not linger, and a packaged workspace must
           not be clickable while /api/package-access loads. commit() opens
           what the answer says. */
        setPackage(pendingPackage(true));
        read(db, email, emailVerified, false).then(function (plan) {
          if (resolution !== _packageRequest) return done('trial');
          commit(plan); done(plan.tier);
        }, function () { done('trial'); });
      } catch (e) { done('trial'); }
    });
  }

  /* ── THE PLAN CAN CHANGE WHILE THE EDITOR IS OPEN ──────────────────────
     Somebody opens The Ladder, subscribes, pays in QuickBooks in another tab
     and comes back: the module switched on at the server and the editor,
     which only asked at sign-in, still hid it until a reload. The reverse
     too: a trial that ended or a payment that lapsed while the editor was
     open left every tool on screen. refresh() asks the same question again
     and puts the answer on screen when it differs.

     IT NEVER PASSES THROUGH THE LOCKED STATE. fetchPackage() empties the
     view while it waits, which is right at sign-in and wrong here: a
     ribbon that blinks empty every time the window regains focus is worse
     than the bug. The old answer stays until the new one has arrived.

     `omega:plan-changed` says what moved ({ added, removed, readOnly,
     wasReadOnly, packaged }), only when something did and only after the
     first answer, so the page can say "Plan Sets is on — it's on Output"
     instead of rearranging the ribbon silently. A staff session and a staff
     preview are never refreshed: staff are not billed, and a re-check would
     throw away the package somebody chose to preview. */
  function standing() {
    if (_package) {
      var editor = _package.staff || (_package.toolAccess || []).indexOf('editor') >= 0;
      return { packaged: true, pending: _package.pending === true, refused: _package.refused || null, staff: _package.staff === true, readOnly: _package.readOnly === true, editor: editor, modules: editor ? (_package.modules || []).slice() : [] };
    }
    return { packaged: false, tier: _tier || 'trial', caps: Object.keys(setFor(_tier || 'trial')).sort() };
  }
  var _refreshing = null, _watch = null;
  function refresh(db, user) {
    /* a read already on its way may have started before the purchase that
       asked for this one: ask again once it lands, never ride on it */
    if (_refreshing) return _refreshing.then(function () { return refresh(db, user); });
    if (_package && (_package.staff || _package.preview)) return Promise.resolve({ changed: false, skipped: 'staff' });
    db = db || (_watch && _watch.db && _watch.db());
    user = user || (global.firebase && global.firebase.auth && global.firebase.auth().currentUser);
    if (!user || !user.email) return Promise.resolve({ changed: false, skipped: 'signed out' });
    var request = _packageRequest, before = standing();
    _refreshing = Promise.resolve().then(function () { return read(db, user.email, user.emailVerified, true); }).then(function (plan) {
      _refreshing = null;
      if (request !== _packageRequest || (global.firebase && global.firebase.auth().currentUser !== user)) return { changed: false, skipped: 'account changed' };
      if (plan.transient) return { changed: false, unavailable: true };
      commit(plan); apply(plan.tier);
      schedule();
      return settle(before);
    }, function () { _refreshing = null; return { changed: false, unavailable: true }; });
    return _refreshing;
  }
  /* What moved between two answers, announced when anything did. A first
     load that failed and has now come through is `recovered`, not a list of
     new purchases: those modules were always the workspace's. */
  function settle(before) {
    var after = standing(), diff = { changed: JSON.stringify(before) !== JSON.stringify(after), packaged: after.packaged, wasPackaged: before.packaged, recovered: before.pending === true && !after.pending, refused: after.refused || null,
      readOnly: after.packaged ? after.readOnly || !after.editor : false, wasReadOnly: before.packaged ? before.readOnly || !before.editor : false, added: [], removed: [] };
    if (after.packaged && !diff.recovered) {
      var was = before.packaged ? before.modules : [];
      diff.added = after.modules.filter(function (k) { return was.indexOf(k) < 0; });
      diff.removed = was.filter(function (k) { return after.modules.indexOf(k) < 0; });
    } else if (!after.packaged && !before.packaged) {
      diff.added = after.caps.filter(function (k) { return before.caps.indexOf(k) < 0; });
      diff.removed = before.caps.filter(function (k) { return after.caps.indexOf(k) < 0; });
    }
    if (diff.changed && global.document && global.document.dispatchEvent) {
      try { global.document.dispatchEvent(new global.CustomEvent('omega:plan-changed', { detail: diff })); } catch (e) {}
    }
    return diff;
  }

  /* ── WHEN TO ASK AGAIN ─────────────────────────────────────────────────
     When the window comes back (the person was paying in QuickBooks, or
     away long enough for something to change), every ten minutes while it
     is in front of them, and at the recorded access deadline. At the
     deadline the server decides (its clock is the one that counts) and the
     editor closes on its own clock only when the server cannot be reached;
     the API and the rules enforce the deadline on their own either way. */
  var FOCUS_GAP = 15000, EVERY = 600000, _lastAsk = 0, _deadline = null;
  function ask(force) {
    var now = Date.now();
    if (!force && now - _lastAsk < FOCUS_GAP) return Promise.resolve({ changed: false, skipped: 'recent' });
    _lastAsk = now; return refresh();
  }
  function schedule() {
    if (_deadline) { clearTimeout(_deadline); _deadline = null; }
    if (!_watch || !_package || _package.staff || _package.preview || _package.readOnly || !_package.accessUntil) return;
    var wait = _package.accessUntil - Date.now();
    if (!(wait < 2147483647)) return;
    /* this clock is already past the deadline and the server still says
       open (a clock ahead of the server's): the server decides, asked each
       minute, instead of a lock that the next answer lifts every second */
    if (wait <= 0) { _deadline = setTimeout(function () { _deadline = null; ask(true); }, 60000); return; }
    /* At the deadline the server is asked first: a clock that runs ahead of
       the server's would otherwise close the tools, hear "open" and open
       them again (and close them a minute later). Only when the server
       cannot answer does the editor close on its own clock. */
    _deadline = setTimeout(function () {
      _deadline = null;
      if (!_package || _package.staff || _package.preview) return;
      ask(true).then(function (r) {
        if (!r || !r.unavailable || !_package || _package.staff || _package.preview || _package.readOnly) return;
        if (!_package.accessUntil || Date.now() < _package.accessUntil) return;
        var before = standing(), locked = {}, k;
        for (k in _package) if (Object.prototype.hasOwnProperty.call(_package, k)) locked[k] = _package[k];
        locked.readOnly = true;
        setPackage(locked); apply(_tier || 'standard'); settle(before);
      });
    }, Math.max(0, wait) + 1000);
  }
  function watchPlan(getDb) {
    if (_watch) { _watch.db = getDb; schedule(); return; }
    _watch = { db: getDb }; _lastAsk = Date.now(); schedule();
    if (!global.document || !global.addEventListener) return;
    global.addEventListener('focus', function () { ask(false); });
    global.document.addEventListener('visibilitychange', function () { if (global.document.visibilityState === 'visible') ask(false); });
    setInterval(function () { if (global.document.visibilityState !== 'hidden') ask(true); }, EVERY);
  }

  /* ── RETRY WITHOUT A RELOAD ────────────────────────────────────────────
     The plan chip's Retry after an unchecked plan: ask again for the same
     person and apply the answer, so a drawing on screen is never lost to a
     page reload. It is read() as a re-check (the same rules as signing in):
     while the read is out the unchecked plan stays exactly as it was, so
     Retry never shows a producing command before the answer does, and a
     connection that still does not answer leaves it unchecked. The editor's
     gating block re-applies OmegaCaps.tier() — the tier last applied, which
     is this answer once it lands — so the next injected button cannot take
     the plan away again. A new resolve() (another sign-in) supersedes it.
     Resolves to the tier applied ('trial' while still unchecked). */
  function retry(db, email, emailVerified) {
    if (_package && (_package.staff || _package.preview)) return Promise.resolve(_tier || 'standard');
    var request = _packageRequest, before = standing();
    return read(db, email, emailVerified, true).then(function (plan) {
      if (request !== _packageRequest) return _tier || 'trial';
      if (plan.transient) return 'trial';
      commit(plan); apply(plan.tier); schedule(); settle(before);
      return plan.tier;
    }, function () { return 'trial'; });
  }

  global.OmegaCaps = {
    /* Exported so a caller that never goes through resolve() — a preview, a
       test, the master console showing what an add-on would unlock — can be
       explicit rather than relying on module state it cannot see. */
    ADDON_GRANTS: ADDON_GRANTS, setAddons: setAddons, addons: function () { return _addons.slice(); },
    LADDER: LADDER, GRANTS: GRANTS,
    JV_ORGS: JV_ORGS, JV_GRANTS: JV_GRANTS, INTERNAL_DOMAINS: INTERNAL_DOMAINS,
    normalise: normalise, setFor: setFor, can: can, governs: governs, editorCan: editorCan, apply: apply, resolve: resolve, retry: retry,
    unverifiedPackage: unverifiedPackage, unchecked: function () { return !!(_package && _package.unverified); },
    setOrg: setOrg, orgOf: orgOf, org: function () { return _org; },
    effectiveTier: effectiveTier, setPackage: setPackage, packageAccess: function () { return _package; },
    MODULE_GRANTS: MODULE_GRANTS, owners: owners, commandPage: commandPage, layout: layout,
    guardLaunchers: guardLaunchers, pendingPackage: pendingPackage, fetchPackage: fetchPackage, allowedElement: allowedElement, allowedCommand: allowedCommand, commandSelector: COMMANDS,
    refresh: refresh, watchPlan: watchPlan, tier: function () { return _tier; }, grants: grants, canWith: canWith
  };
})(typeof window !== 'undefined' ? window : this);
