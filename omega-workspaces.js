/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Project focus only. Entitlements always come from OmegaCaps/server catalog.
 */
(function (global) {
  'use strict';
  var presets = {
    l2: { label: 'Level 2 EV', focus: ['ev', 'l2', 'estimate'], guide: "_guidedPick('l2')" },
    dcfc: { label: 'DCFC', focus: ['ev', 'dcfc', 'storage', 'grid', 'estimate'], guide: "_guidedPick('ev')" },
    bess: { label: 'BESS', focus: ['storage', 'grid', 'estimate'], guide: "_guidedPick('standard')" },
    solarstorage: { label: 'Solar + Storage', focus: ['solar', 'storage', 'grid', 'estimate'], guide: "homeStartWizard('FOM')" },
    microgrid: { label: 'DER / Microgrid', focus: ['solar', 'generation', 'storage', 'grid', 'engineering'], guide: "_guidedPick('der')" },
    compute: { label: 'Compute campus', focus: ['compute', 'grid', 'network'], guide: "_guidedPick('compute')" },
    building: { label: 'Building / Net-Zero', focus: ['building', 'solar', 'engineering'], guide: 'openBuildingDesigner()' }
  };
  var aliases = { evl2: 'l2', level2: 'l2', ev: 'dcfc', evdcfc: 'dcfc', storage: 'bess', battery: 'bess',
    solar: 'solarstorage', pv: 'solarstorage', solarbess: 'solarstorage', 'solar+storage': 'solarstorage',
    der: 'microgrid', datacenter: 'compute', netzero: 'building' };
  var selected = [], identity = '';
  function normalize(type, scopes) {
    var input = Array.isArray(scopes) && scopes.length ? scopes.slice() : [type], out = [];
    if (input.indexOf('der') >= 0 && input.indexOf('bess') >= 0) {
      input = input.filter(function (k) { return k !== 'der' && k !== 'bess'; }); input.unshift('solarstorage');
    }
    input.forEach(function (k) { k = String(k || '').toLowerCase(); k = aliases[k] || k;
      if (presets[k] && out.indexOf(k) < 0) out.push(k);
    });
    return out; // Unknown historical project types get all owned tools, never a guessed type.
  }
  function categories(handler, id) {
    var s = String(id || '') + ' ' + String(handler || ''), out = [];
    if (/_guidedPick\(['"]l2['"]/.test(s)) return ['l2'];
    if (/_guidedPick\(['"]ev['"]/.test(s)) return ['dcfc'];
    var patterns = {
      compute: /compute|datacenter|derSetDc|openDcCluster|rb-(sub-envelope|feas-csv|place-sub|gas-tie|fiber-tie|max-fit|site-build|max-load|load-screen|supply-link|intercon)/i,
      ev: /rbInsert\(['"]charger['"]|stampEV|stampADA|openEvCharger|evSet|markFutureEV|_guidedPick\(['"](?:l2|ev)['"]|evcost|evcloseout/i,
      storage: /rbInsert\(['"](?:bess|pcs|pad)['"]|rbMode\(['"]bespad['"]|openClusterDialog|openBessSizer|openSolarBessSizer|openBill|openNonExport|openValueStack|openEnergyBalance|_guidedPick\(['"]standard['"]|proforma/i,
      solar: /rbInsert\(['"]solar['"]|derSetSolar|openArrayProps|omegaCanopy|omegaSolar|openAutoLayout|homeStartWizard\(['"]FOM['"]|pvwatts/i,
      generation: /rbInsert\(['"]genset['"]|derSetWind|derSetAlt|derCustomKw|_guidedPick\(['"](?:der|deluxe)['"]|openDerAnalysis/i,
      building: /openBuilding|rb-bldg|netzero/i,
      network: /openNetworkProximity|rb-fiber|network/i,
      grid: /GridAtlas|gridatlas|openComedPreQual|OmegaSubstation/i,
      estimate: /openElectricalEstimate|openBomSourcing|openTakeoffBudget|exportBudgetCSV|exportEstimateCSV/i,
      engineering: /openValidation|_valSubmit|rb-optimizer|rb-optimise|rb-elec|rb-circuit/i
    };
    Object.keys(patterns).forEach(function (k) { if (patterns[k].test(s)) out.push(k); });
    return out;
  }
  function core(handler, id, page) {
    if (['modify', 'view', 'settings'].indexOf(page) >= 0) return true;
    return /(?:rbMode|setMode)\(['"](?:select|move|line|polyline|rect|circle|text|callout|dim|zone|conduit|trench)['"]|addTextBox|undoLast|rb-redo|startCal|clearScale|toggle3D|toggleLayersPanel|openConduitMenu|openMvCableDialog|setUtilityType|openSourceDialog/.test(String(handler || '') + ' ' + String(id || ''));
  }
  function relevance(handler, id, page, types) {
    if (core(handler, id, page)) return 0;
    var keys = types || selected, cats = categories(handler, id), focus = [];
    keys.forEach(function (k) { if (presets[k]) focus = focus.concat(presets[k].focus); });
    if (!keys.length || !cats.length) return 0;
    return cats.some(function (k) { return focus.indexOf(k) >= 0; }) ? 1 : -1;
  }
  function setIdentity(uid) {
    if (identity === String(uid || '')) return;
    identity = String(uid || ''); refresh();
  }
  function setProject(type, scopes, openBuild) {
    selected = normalize(type, scopes); refresh();
    if (openBuild && owned() && typeof global.rbTab === 'function') global.rbTab('home');
    results(); return selected.slice();
  }
  /* "All tools" is retired with the hiding it undid (see apply): every
     owned tool is always on the ribbon. Kept as an inert call so an older
     caller cannot break; it hides and remembers nothing. */
  function setAll() { refresh(); return true; }
  /* a real package, not the lock OmegaCaps holds while the plan loads: a
     legacy project opening during sign-in must not paint package chrome */
  function owned() { var v = global.OmegaCaps && global.OmegaCaps.packageAccess(); return !!(v && !v.pending); }
  function refresh() { if (owned()) global.OmegaCaps.apply('standard'); }
  function apply(scope) {
    if (!scope || !scope.querySelectorAll) return;
    var view = global.OmegaCaps && global.OmegaCaps.packageAccess();
    if (!view) return;
    /* ── WHAT THEY OWN IS WHAT THEY SEE (Tommy, 2026-09-27) ──────────────
       A project type used to HIDE the owned tools it judged irrelevant
       (data-workspace-hidden) behind an "All tools" toggle, so a module
       somebody had just paid for could be missing from the ribbon because
       the project was Level 2. Three filters stood between a purchase and
       its buttons: the package, Designer/Pro and this. Now the package is
       the only one: the project type puts its tools FIRST in each group and
       its guided build at the front, and hides nothing. */
    var nodes = scope.querySelectorAll('#ribbon .rbtn,#ribbon .rsbtn');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i], page = el.closest('.ribbon-page'), pg = page && page.getAttribute('data-page');
      var score = relevance(el.getAttribute('onclick'), el.id, pg);
      el.removeAttribute('data-workspace-hidden');
      el.setAttribute('data-workspace-priority', score > 0 ? '1' : '0');
      // Reorder within an existing group; never move a control to a new group.
      var holder = el.parentNode && el.parentNode.classList.contains('rbtn-wrap') ? el.parentNode : el;
      holder.style.order = score > 0 ? '-1' : '';
      if (selected.length && presets[selected[0]].guide === el.getAttribute('onclick')) holder.style.order = '-2';
    }
  }
  function results() {
    var view = global.OmegaCaps && global.OmegaCaps.packageAccess();
    if (!view || !global.document) return;
    var rail = global.document.querySelector('#rr .rr-body'); if (!rail) return;
    style();
    var stale = global.document.getElementById('rr-stale'); if (stale) stale.style.order = '-3';
    var emphasis = selected.indexOf('bess') >= 0 || selected.indexOf('solarstorage') >= 0;
    var groups = rail.querySelectorAll('.rr-grp');
    for (var i = 0; i < groups.length; i++) {
      groups[i].style.flexShrink = '0';
      groups[i].style.order = groups[i].id === 'rr-g-power' ? '-2' : emphasis && groups[i].id === 'rr-g-fin' ? '-1' : '';
    }
    var power = global.document.getElementById('rr-b-power');
    if (!power) return;
    var rows = power.querySelectorAll('.rr-row');
    var ev = selected.indexOf('l2') >= 0 || selected.indexOf('dcfc') >= 0;
    var compute = selected.indexOf('compute') >= 0, have = false;
    for (var r = 0; r < rows.length; r++) {
      var label = rows[r].querySelector('.rr-k'), text = label ? label.textContent : '';
      rows[r].style.order = ev && /EV/.test(text) || compute && /compute/i.test(text) || emphasis && /BESS/.test(text) ? '-1' : '';
      if (rows[r].querySelector('.rr-v:not(.rr-na)')) have = true;
    }
    var empty = global.document.getElementById('omega-workspace-empty');
    if (have || !selected.length || view.readOnly) { if (empty) empty.remove(); return; }
    if (!empty) {
      empty = global.document.createElement('div'); empty.id = 'omega-workspace-empty'; empty.className = 'rr-gate';
      empty.style.order = '-2'; power.appendChild(empty);
    }
    var primary = presets[selected[0]], candidates = global.document.querySelectorAll('#ribbon .rbtn');
    var guide = null;
    for (var c = 0; c < candidates.length; c++) if (candidates[c].getAttribute('onclick') === primary.guide && global.OmegaCaps.allowedElement(candidates[c])) guide = candidates[c];
    var message = 'Start the ' + primary.label + ' build, then run the design to see results.';
    if (!guide) message = 'Set up the site and place equipment, then run the design to see results.';
    if (empty.getAttribute('data-message') !== message) {
      empty.textContent = message + ' '; empty.setAttribute('data-message', message);
      var button = global.document.createElement('button'); button.type = 'button'; button.className = 'e3-btn';
      button.textContent = guide ? 'Start build' : 'Site setup';
      button.onclick = function () {
        if (guide && global.OmegaCaps.allowedElement(guide)) guide.click();
        else if (global.OmegaCaps.allowedCommand('', 'openSiteQuickBuild()') && global.openSiteQuickBuild) global.openSiteQuickBuild();
      };
      empty.appendChild(button);
    }
  }
  /* The rail's column layout (so `order` can put this project's numbers
     first) as a rule, never an inline display: an inline flex beat the
     rail's own collapse rules, so a packaged user could not close the
     Results rail or its POWER group. */
  function style() {
    if (global.document.getElementById('omega-workspaces-style')) return;
    var st = global.document.createElement('style'); st.id = 'omega-workspaces-style';
    st.textContent = 'body[data-packaged-editor="1"] #rr:not(.rr-collapsed) .rr-body{display:flex;flex-direction:column}' +
      'body[data-packaged-editor="1"] .rr-grp:not(.rr-shut) #rr-b-power{display:flex;flex-direction:column}';
    (global.document.head || global.document.body).appendChild(st);
  }
  /* A package that goes away takes its ordering with it (OmegaCaps.setPackage(null)). */
  function reset() {
    var d = global.document; if (!d || !d.querySelectorAll) return;
    var nodes = d.querySelectorAll('[data-workspace-priority],[data-workspace-hidden]');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i], holder = el.parentNode && el.parentNode.classList && el.parentNode.classList.contains('rbtn-wrap') ? el.parentNode : el;
      holder.style.order = ''; el.removeAttribute('data-workspace-priority'); el.removeAttribute('data-workspace-hidden');
    }
    var rows = d.querySelectorAll('#rr .rr-grp,#rr-b-power .rr-row,#rr-stale');
    for (var r = 0; r < rows.length; r++) rows[r].style.order = '';
    var empty = d.getElementById('omega-workspace-empty'); if (empty) empty.remove();
  }
  global.OmegaWorkspaces = { presets: presets, normalize: normalize, relevance: relevance, core: core,
    results: results, setProject: setProject, setIdentity: setIdentity, setAll: setAll, all: function () { return true; },
    selected: function () { return selected.slice(); }, apply: apply, reset: reset };
})(typeof window !== 'undefined' ? window : this);
