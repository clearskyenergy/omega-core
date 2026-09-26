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
  var _package = null, _packageRequest = 0, MODULE_GRANTS = {}, _packageSignature = null;
  var COMMANDS = '.rbtn,.rsbtn,.rb-fly-item,#app-menu .menu-item,[data-module],[data-cap]';
  function pendingPackage() { return { packaged: true, readOnly: true, modules: [], caps: [], toolAccess: [], catalog: [], notSold: [] }; }
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
      ['omega-workspace-controls', 'omega-package-tab'].forEach(function (id) { var el = global.document.getElementById && global.document.getElementById(id); if (el) el.remove(); });
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
    if (_package.toolAccess.indexOf('editor') < 0) return false;
    var own = owners(id, handler);
    if (!own.some(function (k) { return _package.modules.indexOf(k) >= 0; })) return false;
    if (!_package.readOnly) return true;
    return (_package.readOnlyRibbon || []).some(function (s) { return matches(s, id, handler); });
  }
  function allowedElement(el) {
    if (!_package || _package.staff) return true;
    if (!el || !el.getAttribute) return false;
    var module = el.getAttribute('data-module'), cap = el.getAttribute('data-cap');
    if (module && !_package.modules.some(function (k) { return module.split(/\s+/).indexOf(k) >= 0; })) return false;
    var handler = el.getAttribute('onclick') || '', own = owners(el.id || '', handler);
    if (own.length) return allowedCommand(el.id || '', handler);
    if (module) return !_package.readOnly;
    if (cap && el.classList && (el.classList.contains('rtab') || el.classList.contains('ribbon-page'))) {
      var page = el.classList.contains('ribbon-page') ? el : global.document.querySelector('.ribbon-page[data-page="' + el.getAttribute('data-page') + '"]');
      var children = page ? page.querySelectorAll('.rbtn,.rsbtn') : [];
      for (var c = 0; c < children.length; c++) if (allowedElement(children[c])) return true;
      return false;
    }
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
        'body[data-packaged-editor="1"][data-packaged-editor] #ribbon .rbtn:not([data-package-hidden]):not([data-workspace-hidden]):not([data-omega-retired]):not([data-packaging-retired]):not([data-shelf-dupe]):not(.omega-gated-hidden),' +
        'body[data-packaged-editor="1"][data-packaged-editor] #ribbon .rsbtn:not([data-package-hidden]):not([data-workspace-hidden]):not([data-omega-retired]):not([data-packaging-retired]):not([data-shelf-dupe]):not(.omega-gated-hidden){display:flex!important}' +
        'body[data-packaged-editor="1"][data-packaged-editor] #ribbon .rbtn-wrap:not([data-package-empty]),body[data-packaged-editor="1"][data-packaged-editor] #ribbon .rpanel:not([data-package-empty]){display:flex!important}' +
        'body[data-packaged-editor="1"][data-packaged-editor] #ribbon-tabs .rtab:not([data-package-empty]):not([data-package-hidden]){display:flex!important}' +
        'body[data-packaged-editor="1"][data-packaged-editor] #ribbon [data-workspace-hidden],body[data-packaged-editor="1"][data-packaged-editor] #ribbon [data-package-empty],body[data-packaged-editor="1"][data-packaged-editor] #ribbon-tabs [data-package-empty],body[data-packaged-editor="1"][data-packaged-editor] #ribbon-tab-menu [data-package-empty],body[data-packaged-editor="1"][data-packaged-editor] [data-package-hidden]{display:none!important}' +
        'body[data-packaged-editor="1"][data-packaged-editor] #omega-package-tab{order:999}' +
        '#omega-workspace-controls{display:flex;align-items:center;gap:8px;padding:4px 12px;font:11px system-ui;color:var(--sub);background:var(--navy)}' +
        '#omega-workspace-controls button{font:inherit;color:var(--text);border:1px solid var(--border);background:transparent;border-radius:4px;padding:4px 8px;cursor:pointer}';
      (doc.head || doc.body).appendChild(style);
    }
    function usable(el) {
      return !el.hasAttribute('data-package-hidden') && !el.hasAttribute('data-workspace-hidden') && !el.hasAttribute('data-omega-retired') && !el.hasAttribute('data-packaging-retired') && !el.classList.contains('omega-gated-hidden') && !el.hasAttribute('data-shelf-dupe');
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
    if (global.OmegaWorkspaces && !doc.getElementById('omega-workspace-controls')) {
      var ribbon = doc.getElementById('ribbon');
      if (ribbon && ribbon.parentNode) {
        var bar = doc.createElement('div'); bar.id = 'omega-workspace-controls';
        var label = doc.createElement('span'); label.id = 'omega-workspace-label'; bar.appendChild(label);
        var toggle = doc.createElement('button'); toggle.id = 'omega-workspace-all'; toggle.type = 'button';
        toggle.onclick = function () { global.OmegaWorkspaces.setAll(!global.OmegaWorkspaces.all()); };
        bar.appendChild(toggle); ribbon.parentNode.insertBefore(bar, ribbon);
        global.OmegaWorkspaces.apply(scope);
      }
    }
    if (global.OmegaPackageMenu) { global.OmegaPackageMenu.tab(); global.OmegaPackageMenu.staffPreview(); }
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
  function fetchPackage(user) {
    var request = ++_packageRequest;
    setPackage(pendingPackage());
    if (!user || !user.getIdToken || !global.fetch) return Promise.reject(new Error('Package access unavailable'));
    return user.getIdToken().then(function (token) {
      return global.fetch('/api/package-access', { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store' });
    }).then(function (r) { if (!r.ok) throw new Error('Package access unavailable'); return r.json(); })
      .then(function (v) { if (request !== _packageRequest || (global.firebase && global.firebase.auth().currentUser !== user)) throw new Error('Account changed'); if (!v || v.packaged !== true) throw new Error('Package access changed; reload'); setPackage(v); return v; });
  }
  /* Capture covers keyboard-generated clicks and programmatic .click() on
     a hidden button. The API still checks every producing request. */
  if (global.document && global.document.addEventListener) global.document.addEventListener('click', function (e) {
    if (!_package || !e.target || !e.target.closest) return;
    var el = e.target.closest(COMMANDS);
    if (el && !allowedElement(el)) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);

  function setFor(tier) {
    var t = normalise(tier), out = {}, i, j, g;
    if (_package) {
      (_package.readOnly ? ['view'] : _package.caps).forEach(function (k) { out[k] = 1; });
      return out;
    }
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
    if (_package) {
      if (global.OmegaComputeTab && global.OmegaComputeTab.place) global.OmegaComputeTab.place();
      rehome(scope);
      var hidden = applyPackage(scope);
      if (global.document && global.document.body) {
        global.document.body.setAttribute('data-packaged-editor', '1');
        var signature = JSON.stringify([_package.modules, _package.staff, _package.readOnly]);
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

     Only a verified Firebase email at ClearSky's current staff domain may
     use this presentation fallback. Server authorization still uses caller.staff. 'internal' is already in
     UNGATED, so it grants everything without inventing a new tier.

     A BILLING RECORD STILL WINS IF ONE EXISTS. This is a fallback for the
     absent-record case, not an override — so if ClearSky is ever given a
     real billing doc for testing, that is what applies. */
  var INTERNAL_DOMAINS = ['clearsky-usa.com'];

  function resolve(db, email, emailVerified) {
    return new Promise(function (done) {
      try {
        var d = setOrg(email);
        var internal = emailVerified === true && INTERNAL_DOMAINS.indexOf(d) >= 0;
        setAddons([]);
        var resolution = ++_packageRequest;
        setPackage(null);
        if (internal && !db) return done('internal');
        if (!d || !db) return done('trial');
        db.collection('omega_orgs').doc(d).collection('billing').doc('current').get()
          .then(function (s) {
            if (resolution !== _packageRequest) return done('trial');
            var b = s.exists ? (s.data() || {}) : {};
            if (!s.exists && internal) return done('internal');
            if (b.packaged === true) {
              setPackage(pendingPackage());
              var user = global.firebase && global.firebase.auth().currentUser;
              if (!user || user.email !== email) return done('trial');
              return fetchPackage(user).then(function (view) { done(view.tier || 'standard'); }, function () { done('trial'); });
            }
            setAddons(b.addons || []);
            var eff = effectiveTier(b.tier || 'trial', b.capTier);
            if (b.capTier && eff !== normalise(b.tier || 'trial') && global.console) {
              console.info('[caps] billed ' + b.tier + ', editor capped to ' + eff +
                           ' by capTier on billing/current');
            }
            done(eff);
          })
          .catch(function () {
            if (resolution !== _packageRequest) return done('trial');
            /* A failed read must not hand out the engineering suite to a
               customer — but it must not lock ClearSky out either. */
            if (!internal) setPackage(pendingPackage());
            done(internal ? 'internal' : 'trial');
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
    effectiveTier: effectiveTier, setPackage: setPackage, packageAccess: function () { return _package; },
    MODULE_GRANTS: MODULE_GRANTS, owners: owners, commandPage: commandPage, layout: layout,
    guardLaunchers: guardLaunchers, pendingPackage: pendingPackage, fetchPackage: fetchPackage, allowedElement: allowedElement, allowedCommand: allowedCommand, commandSelector: COMMANDS
  };
})(typeof window !== 'undefined' ? window : this);
