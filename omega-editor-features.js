/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   omega-editor-features.js — Settings › Features, and the slim Analyze,
   View and Output ribbons.

   Thomas's rule (2026-10): a tool that is not working, not needed on the
   main bar, a duplicate, unverified, or still SOON comes off the ribbon.
   Nothing is deleted. A feature turns back on from Settings › Features and
   returns to the tab and group it came from. A SOON tool stays locked.
   The plan still gates on top of that (OmegaCaps / data-package-hidden):
   turning a feature on never grants a module the workspace did not buy.

   This reuses RibbonGating's list and its .omega-gated-hidden class.
   OmegaGating.released asks isOn() here before it hides a tool, so the
   two do not fight. Per-person choices live in localStorage. A workspace
   owner or admin can also set a default on
   omega_orgs/{org}/layouts/editor-features, which only an owner, admin
   or ClearSky staff can write.
*/
(function (root) {
  'use strict';

  var USER_KEY = 'omega.features.user';

  /* Chip text matches the Settings › Features mock. locked: the toggle
     stays off until the tool is finished. home: page|caption, or fly:id
     when the control lives inside a dropdown. */
  var FEATURES = [
    { id: 'viability', match: /openViabilityWorkflow/, label: 'Viability Workflow', blurb: 'Phase-by-phase go / no-go', group: 'Screening', returns: 'Returns to Analyze', chip: 'HIDDEN AT REQUEST', home: 'analyze|Screen' },
    { id: 'rb-screen', label: 'Site Pre-Screen', blurb: 'ZIP-level utility, rates, solar', group: 'Screening', returns: 'Returns to Analyze', chip: 'SOON', locked: true, home: 'analyze|Screen' },
    { id: 'prequal', match: /openSitePreQual/, label: 'Site Pre-Qualification', blurb: 'Phase 0 viability score (being rebuilt)', group: 'Screening', returns: 'Returns to Analyze', chip: 'SOON', locked: true, home: 'analyze|Screen' },
    { id: 'rb-parcel-screen', label: 'Parcel Screen', blurb: 'Rank a folder of KMZ parcels (portfolio)', group: 'Screening', returns: 'Returns to Analyze', chip: 'NOT NEEDED HERE', home: 'analyze|Screen' },
    { id: 'decks', match: /openPriceDecks/, label: 'Price Decks', blurb: 'Nodal price-deck import', group: 'Screening', returns: 'Returns to Analyze', chip: 'SOON', locked: true, home: 'analyze|Value' },
    { id: 'rb-circuit', label: 'Circuit Analysis', blurb: 'Panel schedules, voltage drop, fault current', group: 'Engineering', returns: 'Returns to Analyze', chip: 'NEW · UNVERIFIED', home: 'analyze|Engineering' },
    { id: 'rb-noise-model', label: 'Noise Modeling', blurb: 'ISO 9613-2 acoustic screen', group: 'Engineering', returns: 'Returns to Analyze', chip: 'NEW · UNVERIFIED', home: 'analyze|Engineering' },
    { id: 'rb-optimizer', label: 'Design Optimizer', blurb: 'Row pitch vs shade, clipping, collectors', group: 'Engineering', returns: 'Returns to Analyze', chip: 'NEW · UNVERIFIED', home: 'analyze|Engineering' },
    { id: 'permit-pack', ids: ['rb-sheet-mgr', 'rb-permit-sheet', 'omega-btn-riser', 'omega-btn-permit-matrix'], label: 'Sheet Manager · Permit Sheet · Riser Diagram · Permitting Matrix', blurb: 'Extra sheet producers next to Plan Set', group: 'Permitting & 3D', returns: 'Returns to Output', chip: 'NEW · UNVERIFIED', home: 'output|Sheets' },
    { id: 'permit', match: /omegaPermitBeta|sendToPermitCreator/, label: 'Permit Creator', blurb: 'Today shows “contact your account rep”', group: 'Permitting & 3D', returns: 'Returns to Output', chip: 'NOT WORKING', home: 'output|Sheets' },
    { id: 'ov-ribbon-btn', label: '3D Site Visualizer', blurb: 'Second 3D view, beside View › 3D Review', group: 'Permitting & 3D', returns: 'Returns to Output', chip: 'DUPLICATE', home: 'output|Reports' },
    { id: 'ov-model-checks', label: '2D / 3D Model Checks', blurb: 'Checks report in a browser alert', group: 'Permitting & 3D', returns: 'Returns to Output', chip: 'NOT WORKING', home: 'output|Review' },
    { id: 'monday', match: /exportToMonday/, label: 'Export to Monday', blurb: 'Project tasks as a Monday.com CSV', group: 'Integrations', returns: 'Returns to Settings', chip: 'NOT NEEDED HERE', home: 'settings|Integrations' },
    { id: 'rb-native', label: 'Native Layer', blurb: 'Draw as native Google Maps objects', group: 'Workspace', returns: 'Returns to Settings', chip: 'NOT NEEDED HERE', home: 'settings|Workspace' },
    { id: 'rb-dock-left', label: 'Dock Left', blurb: 'Dock the tool panel on the left', group: 'Workspace', returns: 'Returns to Settings', chip: 'NOT NEEDED HERE', home: 'settings|Workspace' },
    { id: 'diagnose', match: /toggleDiagPanel/, label: 'Diagnose', blurb: 'Why equipment is or is not locked to the ground', group: 'Workspace', returns: 'Returns to Settings', chip: 'NOT NEEDED HERE', home: 'settings|Workspace' },
    { id: 'reanchor', match: /_geoRepairAndReport/, label: 'Re-anchor Drawing to Map', blurb: 'Repair geo anchoring', group: 'Workspace', returns: 'Returns to Draw', chip: 'NOT NEEDED HERE', home: 'fly:fly-cond' },
    { id: 'btn-dtwin', label: 'Digital Twin', blurb: 'Banner only', group: 'Other', returns: 'Returns to Analyze', chip: 'SOON', locked: true, home: 'analyze|Operations' },
    { id: 'bess-config', match: /openBessModal/, label: 'BESS Config (old)', blurb: 'Replaced by BESS Guided Build / Sizer', group: 'Other', returns: 'Returns to Build', chip: 'LEAVING SOON', locked: true, home: 'home|3 · Size & Configure' },
    { id: 'design-pack', ids: ['rb-bldg-designer', 'rb-gis-layers', 'rb-siteplan', 'rb-takeoff-budget'], match: /openMarketplacePush/, label: 'Building Designer · Site Plan Styles · GIS Layers · Takeoff & Budget · Push to Marketplace', blurb: 'Newer tools not yet confirmed working end to end', group: 'Other', returns: 'Returns to Build / Draw / Estimate / Finance', chip: 'NEW · UNVERIFIED' },
    { id: 'nextnrg', match: /omegaNextnrgSolarCustom/, label: 'NextNRG Solar — Custom', blurb: 'One tenant’s tool', group: 'Other', returns: 'Returns to Draw', chip: 'TENANT-SPECIFIC', home: 'fly:fly-der' },
    { id: 'build-stamp', label: 'Build tag', blurb: 'Patch count in the title bar (debug)', group: 'Other', returns: 'Returns to the title bar', chip: 'DEBUG' }
  ];

  /* Injected or relocated controls. role bar = a button on the group,
     primary = the split button, menu = a row in its dropdown.
     hide: the stand-in button, once the real one has arrived. */
  var ADOPT = [
    { id: 'rb-grid-panel', slot: 'grid', role: 'primary', label: 'Grid<br>Check', hide: 'rb-grid-check' },
    { id: 'rb-gridatlas', slot: 'grid', role: 'menu', label: 'Grid Atlas score' },
    { id: 'omega-btn-bill-analysis', slot: 'load', role: 'menu', label: 'Bill analysis workbook' },
    { id: 'oy-ribbon-btn', slot: 'energy', role: 'primary', label: 'Generation', hide: 'rb-generation' },
    { id: 'rb-valuestack', slot: 'value', role: 'primary', label: 'Value<br>Stack', hide: 'rb-value' },
    { id: 'openDerAnalysis', match: /openDerAnalysis/, slot: 'value', role: 'menu', label: 'Revenue waterfall' },
    { id: 'omega-btn-sldcheck', slot: 'review', role: 'primary', label: 'Check', hide: 'rb-check' },
    { id: 'omega-btn-drc', slot: 'review', role: 'menu', label: 'Drawing review' },
    { id: 'rb-geo-export', slot: 'export', role: 'menu', label: 'Geo export' },
    { id: 'rb-labels', slot: 'show', role: 'bar', before: 'rb-parcels' },
    { id: 'rb-evselbl', slot: 'display', role: 'menu', label: 'Charger pads' },
    { id: 'rb-ladder-toggle', slot: 'panels', role: 'menu' },
    { id: 'rb-fom', slot: 'ownership', role: 'primary', label: 'Fleet<br>O&amp;M' },
    { id: 'rb-omlife', slot: 'ownership', role: 'menu', label: 'Battery lifecycle' },
    { id: 'rb-site', slot: 'show', role: 'bar', label: 'Live<br>takeoff', before: 'rb-parcels' },
    { id: 'rb-cluster', page: 'draw', cap: 'Arrange', label: 'Cluster<br>Tools' },
    { id: 'rb-cad-schem', fly: 'fly-cond', label: 'Schematic editor' }
  ];

  var GROUPS = ['Screening', 'Engineering', 'Permitting & 3D', 'Workspace', 'Integrations', 'Other'];

  var orgOn = {};
  var isAdmin = false;
  var orgId = '';
  var busy = false;

  function doc() {
    return root.document || (typeof document !== 'undefined' ? document : null);
  }
  function storage() {
    try { if (root.localStorage && root.localStorage.getItem) return root.localStorage; } catch (e) {}
    return null;
  }
  function userMap() {
    var ls = storage();
    if (!ls) return {};
    try { var v = JSON.parse(ls.getItem(USER_KEY) || '{}'); return v && typeof v === 'object' ? v : {}; } catch (e) { return {}; }
  }
  function writeUser(map) {
    var ls = storage();
    if (!ls) return;
    try { ls.setItem(USER_KEY, JSON.stringify(map || {})); } catch (e) {}
  }
  function decide(spec, user, org) {
    if (!spec || spec.locked) return false;
    user = user || {};
    org = org || {};
    if (Object.prototype.hasOwnProperty.call(user, spec.id)) return !!user[spec.id];
    if (Object.prototype.hasOwnProperty.call(org, spec.id)) return !!org[spec.id];
    return false;
  }
  function specById(id) {
    var i;
    for (i = 0; i < FEATURES.length; i++) if (FEATURES[i].id === id) return FEATURES[i];
    return null;
  }
  function isOn(id) {
    var spec = typeof id === 'string' ? specById(id) : id;
    return decide(spec, userMap(), orgOn);
  }
  function onclickOf(btn) {
    return (btn && (btn.getAttribute && (btn.getAttribute('onclick') || btn.getAttribute('data-omega-onclick')))) || '';
  }
  function featureFor(btn) {
    if (!btn) return null;
    var id = btn.id || '', oc = onclickOf(btn), i, f, n;
    for (i = 0; i < FEATURES.length; i++) {
      f = FEATURES[i];
      if (f.ids) {
        for (n = 0; n < f.ids.length; n++) if (f.ids[n] === id) return f;
      }
      if (f.id && id === f.id) return f;
      if (f.match && f.match.test(oc)) return f;
      if (f.match && f.match.test(id)) return f;
    }
    return null;
  }
  function released(btn) {
    var spec = featureFor(btn);
    return !!(spec && decide(spec, userMap(), orgOn));
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function norm(s) {
    return String(s || '').replace(/\s+/g, ' ').replace(/^\s|\s$/g, '');
  }

  function $(sel, scope) {
    var d = scope || doc();
    return d && d.querySelector ? d.querySelector(sel) : null;
  }
  function $all(sel, scope) {
    var d = scope || doc();
    if (!d || !d.querySelectorAll) return [];
    return d.querySelectorAll(sel);
  }

  function relabel(btn, html) {
    if (!btn || !html) return;
    if (btn.getAttribute('data-omega-label') === html) return;
    var lbl = btn.querySelector && btn.querySelector('.rb-lbl');
    if (!lbl) return;
    lbl.innerHTML = html;
    btn.setAttribute('data-omega-label', html);
  }
  function closest(btn, sel) {
    if (!btn) return null;
    if (btn.closest) return btn.closest(sel);
    return null;
  }

  function ensurePanel(page, caption) {
    var d = doc();
    if (!d) return null;
    var pageEl = $( '#ribbon .ribbon-page[data-page="' + page + '"]');
    if (!pageEl) return null;
    var caps = pageEl.querySelectorAll('.rpanel-cap'), i, body, panel, cap;
    for (i = 0; i < caps.length; i++) {
      if (norm(caps[i].textContent || caps[i].innerHTML) === norm(caption)) {
        body = caps[i].parentNode.querySelector('.rpanel-body');
        if (body) return body;
      }
    }
    panel = d.createElement('div');
    panel.className = 'rpanel';
    panel.setAttribute('data-shelf', '1');
    panel.setAttribute('data-omega-made', '1');
    body = d.createElement('div');
    body.className = 'rpanel-body';
    cap = d.createElement('div');
    cap.className = 'rpanel-cap';
    cap.textContent = caption;
    panel.appendChild(body);
    panel.appendChild(cap);
    pageEl.appendChild(panel);
    return body;
  }

  function slotPanel(slot) {
    return $('#ribbon .rpanel[data-omega-slot="' + slot + '"]');
  }
  function slotBody(slot) {
    var p = slotPanel(slot);
    return p ? p.querySelector('.rpanel-body') : null;
  }
  function slotFly(slot) {
    var p = slotPanel(slot);
    return p ? p.querySelector('.rb-flyout') : null;
  }
  function slotWrap(slot) {
    var p = slotPanel(slot);
    return p ? p.querySelector('.rbtn-wrap') : null;
  }

  function placePrimary(btn, slot) {
    var wrap = slotWrap(slot);
    if (!wrap || !btn) return;
    if (btn.parentNode !== wrap || wrap.firstChild !== btn) wrap.insertBefore(btn, wrap.firstChild);
  }
  function placeMenu(btn, slot) {
    var fly = slotFly(slot);
    if (!fly || !btn) return;
    if (btn.parentNode !== fly) fly.appendChild(btn);
  }
  function placeBar(btn, slot, beforeId) {
    var body = slotBody(slot);
    if (!body || !btn) return;
    var before = beforeId && doc().getElementById(beforeId);
    if (before && before.parentNode === body) {
      if (btn.nextSibling !== before) body.insertBefore(btn, before);
      return;
    }
    if (btn.parentNode !== body) body.appendChild(btn);
  }

  function hideEl(el) {
    if (!el) return;
    if (el.classList) el.classList.add('omega-gated-hidden');
    el.setAttribute('data-omega-fallback', '1');
  }

  function adoptOne(spec) {
    var d = doc();
    if (!d) return;
    var btn = null, all, i;
    if (spec.id && d.getElementById(spec.id)) btn = d.getElementById(spec.id);
    else if (spec.match) {
      all = $all('#ribbon button');
      for (i = 0; i < all.length; i++) {
        if (spec.match.test(onclickOf(all[i])) && !all[i].getAttribute('data-omega-fallback')) { btn = all[i]; break; }
      }
    }
    if (!btn) return;
    if (featureFor(btn) && !isOn(featureFor(btn))) return;
    relabel(btn, spec.label);
    if (spec.role === 'primary') placePrimary(btn, spec.slot);
    else if (spec.role === 'menu') placeMenu(btn, spec.slot);
    else if (spec.role === 'bar') placeBar(btn, spec.slot, spec.before);
    else if (spec.fly) {
      var fly = d.getElementById(spec.fly);
      if (fly && btn.parentNode !== fly) fly.appendChild(btn);
    } else if (spec.page && spec.cap) {
      var body = ensurePanel(spec.page, spec.cap);
      if (body && btn.parentNode !== body) body.appendChild(btn);
      if (body && body.parentNode) body.parentNode.style.display = '';
    }
    if (spec.hide) hideEl(d.getElementById(spec.hide));
  }

  function remember(btn, spec) {
    if (btn.getAttribute('data-omega-home')) return;
    if (spec && spec.home) { btn.setAttribute('data-omega-home', spec.home); return; }
    var page = closest(btn, '.ribbon-page');
    var panel = closest(btn, '.rpanel');
    var cap = panel && panel.querySelector('.rpanel-cap');
    if (page && cap) btn.setAttribute('data-omega-home', page.getAttribute('data-page') + '|' + norm(cap.textContent || ''));
  }

  /* Modal and list buttons reuse some of the same handlers (Edit calls
     openBessModal). Only the ribbon, the File menu, the park and the
     build tag are managed here. */
  function managed(btn) {
    if (!btn) return false;
    if (btn.id === 'omega-build-stamp') return true;
    if (closest(btn, '#omega-merged-park')) return true;
    if (closest(btn, '#ribbon') || closest(btn, '#app-menu')) return true;
    return false;
  }

  function applyFeature(btn, spec) {
    if (!btn || !managed(btn) || btn.getAttribute('data-omega-dupe') || btn.getAttribute('data-omega-fallback')) return;
    remember(btn, spec);
    btn.setAttribute('data-omega-feature', spec.id);
    var on = decide(spec, userMap(), orgOn);
    if (!on) {
      if (btn.classList) btn.classList.add('omega-gated-hidden');
      btn.hidden = true;
      return;
    }
    if (btn.classList) btn.classList.remove('omega-gated-hidden');
    btn.hidden = false;
    btn.removeAttribute('aria-hidden');
    /* Shelf retires Viability with the packaging attribute. Turning the
       feature on is the owner's request to see it again. */
    if (spec.id === 'viability') btn.removeAttribute('data-packaging-retired');
    var home = btn.getAttribute('data-omega-home') || '';
    var d = doc();
    if (home.indexOf('fly:') === 0) {
      var fly = d.getElementById(home.slice(4));
      if (fly && btn.parentNode !== fly) fly.appendChild(btn);
      return;
    }
    var parts = home.split('|');
    if (parts.length === 2 && parts[0] && parts[1]) {
      var body = ensurePanel(parts[0], parts[1]);
      if (body && btn.parentNode !== body) body.appendChild(btn);
      if (body && body.parentNode) body.parentNode.style.display = '';
    }
  }

  function eachFeatureButton(fn) {
    var d = doc();
    if (!d) return;
    var all = $all('button, .rb-fly-item, .menu-item, #omega-build-stamp');
    var i, spec;
    for (i = 0; i < all.length; i++) {
      spec = featureFor(all[i]);
      if (spec && managed(all[i])) fn(all[i], spec);
    }
  }

  function applyDupes() {
    var all = $all('[data-omega-dupe="1"]'), i;
    for (i = 0; i < all.length; i++) {
      if (all[i].classList) all[i].classList.add('omega-gated-hidden');
    }
  }

  function applyStamp() {
    var el = doc() && doc().getElementById('omega-build-stamp');
    if (!el) return;
    var on = isOn('build-stamp');
    el.hidden = !on;
    if (el.classList) el.classList.toggle('omega-gated-hidden', !on);
    el.setAttribute('data-omega-feature', 'build-stamp');
    if (el.style) el.style.display = on ? '' : 'none';
  }

  function layout() {
    if (busy || !doc() || !doc().getElementById) return;
    var ribbon = doc().getElementById('ribbon');
    if (!ribbon) return;
    busy = true;
    try {
      var i;
      for (i = 0; i < ADOPT.length; i++) adoptOne(ADOPT[i]);
      eachFeatureButton(applyFeature);
      applyDupes();
      applyStamp();
      paint();
    } catch (e) {
      if (root.console && console.warn) console.warn('[Features]', e && e.message);
    }
    busy = false;
  }

  function setUser(id, on) {
    var spec = specById(id);
    if (!spec || spec.locked) return false;
    var map = userMap();
    map[id] = !!on;
    writeUser(map);
    layout();
    return true;
  }
  function resetUser() {
    writeUser({});
    layout();
    return true;
  }
  function setOrg(id, on) {
    var spec = specById(id);
    if (!spec || spec.locked || !isAdmin) return false;
    orgOn[id] = !!on;
    saveOrg();
    layout();
    return true;
  }

  function saveOrg() {
    var db, user;
    try { db = root.firebase && root.firebase.firestore && root.firebase.firestore(); } catch (e) {}
    try { user = root.firebase && root.firebase.auth && root.firebase.auth().currentUser; } catch (e2) {}
    if (!db || !orgId || !isAdmin) return;
    var payload = { on: orgOn, updatedAt: new Date().toISOString(), updatedBy: user && user.email ? user.email : '' };
    db.collection('omega_orgs').doc(orgId).collection('layouts').doc('editor-features').set(payload).catch(function () {});
  }

  function loadOrg() {
    var db, user;
    try { db = root.firebase && root.firebase.firestore && root.firebase.firestore(); } catch (e) {}
    try { user = root.firebase && root.firebase.auth && root.firebase.auth().currentUser; } catch (e2) {}
    if (!db || !user) return;
    try { orgId = (typeof root._projOrgId === 'function' && root._projOrgId()) || ''; } catch (e3) { orgId = ''; }
    if (!orgId && user.email) orgId = String(user.email).toLowerCase().split('@')[1] || '';
    if (!orgId) return;
    db.collection('omega_orgs').doc(orgId).collection('members').doc(user.uid).get().then(function (s) {
      var role = s && s.exists && s.data() ? s.data().role : '';
      isAdmin = role === 'owner' || role === 'admin';
      paint();
    }).catch(function () {});
    db.collection('omega_orgs').doc(orgId).collection('layouts').doc('editor-features').get().then(function (s) {
      orgOn = (s && s.exists && s.data() && s.data().on) || {};
      layout();
    }).catch(function () {});
  }

  function rowHtml(spec, query) {
    var hay = (spec.label + ' ' + spec.blurb + ' ' + spec.group).toLowerCase();
    if (query && hay.indexOf(query) < 0) return '';
    var on = decide(spec, userMap(), orgOn);
    var userHas = Object.prototype.hasOwnProperty.call(userMap(), spec.id);
    var dis = spec.locked ? ' disabled' : '';
    var checked = on ? ' checked' : '';
    var admin = '';
    if (isAdmin && !spec.locked) {
      var orgChecked = orgOn[spec.id] ? ' checked' : '';
      admin = '<label class="of-ws"><input type="checkbox" data-omega-ws="' + esc(spec.id) + '"' + orgChecked + '> Workspace</label>';
    }
    return '<div class="of-row" data-feature="' + esc(spec.id) + '">' +
      '<div class="of-main"><div class="of-name">' + esc(spec.label) + '</div>' +
      '<div class="of-blurb">' + esc(spec.blurb) + '</div></div>' +
      '<span class="of-chip of-' + esc(spec.chip).toLowerCase().replace(/[^a-z0-9]+/g, '-') + '">' + esc(spec.chip) + '</span>' +
      admin +
      '<label class="of-sw"><input type="checkbox" data-omega-ft="' + esc(spec.id) + '"' + checked + dis + '>' +
      '<span></span></label>' +
      (userHas && !spec.locked ? '<span class="of-you">You</span>' : '') +
      '</div>';
  }

  function markup(query) {
    query = String(query || '').toLowerCase().replace(/^\s+|\s+$/g, '');
    var html = '', g, i, n, chunk;
    for (g = 0; g < GROUPS.length; g++) {
      chunk = '';
      n = 0;
      for (i = 0; i < FEATURES.length; i++) {
        if (FEATURES[i].group !== GROUPS[g]) continue;
        n++;
        chunk += rowHtml(FEATURES[i], query);
      }
      if (!chunk) continue;
      html += '<section class="of-group"><header><span>' + esc(GROUPS[g]).toUpperCase() +
        (GROUPS[g] === 'Screening' ? ' · RETURNS TO ANALYZE' : '') +
        (GROUPS[g] === 'Engineering' ? ' · RETURNS TO ANALYZE' : '') +
        (GROUPS[g] === 'Permitting & 3D' ? ' · RETURNS TO OUTPUT' : '') +
        '</span><b>' + n + '</b></header>' + chunk + '</section>';
    }
    return html;
  }

  function paint() {
    var box = doc() && doc().getElementById('omega-features-list');
    if (!box) return;
    var q = doc().getElementById('omega-features-q');
    box.innerHTML = markup(q ? q.value : '');
  }

  function injectCss() {
    var d = doc();
    if (!d || d.getElementById('omega-features-css')) return;
    var s = d.createElement('style');
    s.id = 'omega-features-css';
    s.textContent = [
      '.rb-flyout .rbtn{flex-direction:row;align-items:center;justify-content:flex-start;width:100%;max-height:none;height:auto;min-height:0;padding:6px 8px;gap:8px;border:0;background:transparent;}',
      '.rb-flyout .rbtn .rb-lbl{font-size:11.5px;line-height:1.25;text-align:left;white-space:normal;}',
      '.rb-flyout .rbtn .rb-ico{width:18px;height:auto;font-size:13px;}',
      '.rb-flyout .rbtn .omega-new-tag,.rb-flyout .rbtn .omega-soon-tag{display:none;}',
      '#omega-features{position:fixed;inset:0;z-index:100080;background:rgba(6,10,16,.72);display:none;align-items:stretch;justify-content:center;}',
      '#omega-features.on{display:flex;}',
      '#omega-features .of-card{margin:24px auto;width:min(980px,96vw);background:#161b22;color:#e7edf4;border:1px solid #2a3340;border-radius:12px;display:flex;min-height:0;max-height:calc(100vh - 48px);overflow:hidden;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;}',
      '#omega-features .of-nav{width:180px;flex:0 0 180px;background:#12161c;border-right:1px solid #2a3340;padding:18px 10px;display:flex;flex-direction:column;gap:4px;}',
      '#omega-features .of-nav button{text-align:left;background:transparent;border:0;color:#9aa8b8;padding:8px 10px;border-radius:8px;cursor:pointer;font:inherit;font-size:13px;}',
      '#omega-features .of-nav button.on{background:#243044;color:#e7edf4;}',
      '#omega-features .of-body{flex:1;display:flex;flex-direction:column;min-width:0;}',
      '#omega-features .of-head{padding:16px 18px 8px;}',
      '#omega-features .of-head h2{margin:0 0 4px;font-size:18px;}',
      '#omega-features .of-head p{margin:0;color:#9aa8b8;font-size:12px;line-height:1.45;}',
      '#omega-features .of-tools{display:flex;gap:8px;padding:10px 18px;}',
      '#omega-features .of-tools input{flex:1;background:#0f141b;border:1px solid #2a3340;color:inherit;border-radius:8px;padding:8px 10px;font:inherit;}',
      '#omega-features .of-tools button{background:#1c2430;color:inherit;border:1px solid #2a3340;border-radius:8px;padding:8px 10px;cursor:pointer;font:inherit;font-size:12px;}',
      '#omega-features-list{overflow:auto;padding:0 18px 18px;}',
      '#omega-features .of-group{border:1px solid #2a3340;border-radius:10px;margin:0 0 12px;overflow:hidden;}',
      '#omega-features .of-group header{display:flex;justify-content:space-between;padding:8px 12px;color:#8ea0b5;font-size:10px;letter-spacing:.06em;}',
      '#omega-features .of-row{display:flex;align-items:center;gap:10px;padding:10px 12px;border-top:1px solid #2a3340;}',
      '#omega-features .of-main{flex:1;min-width:0;}',
      '#omega-features .of-name{font-size:13px;font-weight:650;}',
      '#omega-features .of-blurb{font-size:11px;color:#9aa8b8;margin-top:2px;}',
      '#omega-features .of-chip{font-size:9px;font-weight:700;letter-spacing:.04em;border-radius:999px;padding:3px 7px;white-space:nowrap;}',
      '#omega-features .of-soon,#omega-features .of-leaving-soon{background:#3a3420;color:#e6c36a;}',
      '#omega-features .of-hidden-at-request{background:#3a2a2a;color:#e09a9a;}',
      '#omega-features .of-not-needed-here,#omega-features .of-duplicate,#omega-features .of-tenant-specific,#omega-features .of-debug{background:#2a3140;color:#b7c4d6;}',
      '#omega-features .of-new-unverified{background:#3a3420;color:#e6c36a;}',
      '#omega-features .of-not-working{background:#3a2428;color:#f0a0a8;}',
      '#omega-features .of-sw{position:relative;width:36px;height:20px;flex:0 0 auto;}',
      '#omega-features .of-sw input{opacity:0;width:0;height:0;}',
      '#omega-features .of-sw span{position:absolute;inset:0;background:#3a4454;border-radius:999px;cursor:pointer;}',
      '#omega-features .of-sw span:before{content:"";position:absolute;width:16px;height:16px;left:2px;top:2px;background:#fff;border-radius:50%;transition:transform .12s;}',
      '#omega-features .of-sw input:checked+span{background:#3d8bfd;}',
      '#omega-features .of-sw input:checked+span:before{transform:translateX(16px);}',
      '#omega-features .of-sw input:disabled+span{opacity:.45;cursor:not-allowed;}',
      '#omega-features .of-ws{font-size:10px;color:#9aa8b8;display:flex;align-items:center;gap:4px;white-space:nowrap;}',
      '#omega-features .of-you{font-size:9px;color:#7fdbb6;}',
      '#omega-features .of-foot{padding:0 18px 14px;color:#8ea0b5;font-size:11px;line-height:1.45;}'
    ].join('');
    (d.head || d.documentElement).appendChild(s);
  }

  function open() {
    var d = doc();
    if (!d) return;
    injectCss();
    var host = d.getElementById('omega-features');
    if (!host) {
      host = d.createElement('div');
      host.id = 'omega-features';
      host.innerHTML =
        '<div class="of-card" role="dialog" aria-label="Features">' +
        '<nav class="of-nav">' +
        '<button type="button" data-omega-nav="maps">API keys</button>' +
        '<button type="button" data-omega-nav="crm">Integrations</button>' +
        '<button type="button" data-omega-nav="ai">AI tokens</button>' +
        '<button type="button" data-omega-nav="look">Appearance</button>' +
        '<button type="button" class="on" data-omega-nav="features">Features</button>' +
        '</nav>' +
        '<div class="of-body">' +
        '<div class="of-head"><h2>Features</h2>' +
        '<p>Tools taken off the ribbon. Turn one on and it returns to its tab for you. Off by default. A tool your plan doesn’t include stays locked.</p></div>' +
        '<div class="of-tools"><input id="omega-features-q" type="search" placeholder="Search features…" aria-label="Search features">' +
        '<button type="button" id="omega-features-all">Show: All</button>' +
        '<button type="button" id="omega-features-reset">Reset to defaults</button></div>' +
        '<div id="omega-features-list"></div>' +
        '<div class="of-foot">SOON items stay locked until they are finished. Workspace holds Native Layer, Dock Left, Diagnose and Re-anchor. Integrations holds the Monday CSV.</div>' +
        '</div></div>';
      d.body.appendChild(host);
      host.addEventListener('click', onOverlay);
      host.addEventListener('change', onChange);
      host.addEventListener('input', function (e) {
        if (e.target && e.target.id === 'omega-features-q') paint();
      });
    }
    host.className = 'on';
    paint();
  }
  function close() {
    var host = doc() && doc().getElementById('omega-features');
    if (host) host.className = '';
  }
  function onOverlay(e) {
    var t = e.target;
    if (!t) return;
    if (t.id === 'omega-features') { close(); return; }
    if (t.id === 'omega-features-reset') { resetUser(); return; }
    if (t.id === 'omega-features-all') {
      var q = doc().getElementById('omega-features-q');
      if (q) q.value = '';
      paint();
      return;
    }
    var nav = t.getAttribute && t.getAttribute('data-omega-nav');
    if (!nav || nav === 'features') return;
    close();
    try {
      if (nav === 'maps' && root.openMapsKey) root.openMapsKey();
      else if (nav === 'crm' && root.openCrmSettings) root.openCrmSettings();
      else if (nav === 'ai' && root.openAiKeys) root.openAiKeys();
      else if (nav === 'look' && root.rbTab) root.rbTab('settings');
    } catch (err) {}
  }
  function onChange(e) {
    var t = e.target;
    if (!t || !t.getAttribute) return;
    var id = t.getAttribute('data-omega-ft');
    if (id) { setUser(id, !!t.checked); return; }
    id = t.getAttribute('data-omega-ws');
    if (id) setOrg(id, !!t.checked);
  }

  function boot() {
    injectCss();
    layout();
    loadOrg();
    var n = 0, iv = setInterval(function () {
      layout();
      if (++n > 40) clearInterval(iv);
    }, 500);
    var d = doc();
    if (d && root.MutationObserver && d.getElementById('ribbon')) {
      var wait = false;
      new root.MutationObserver(function () {
        if (wait || busy) return;
        wait = true;
        setTimeout(function () { wait = false; layout(); }, 60);
      }).observe(d.getElementById('ribbon'), { childList: true, subtree: true });
    }
    if (d) d.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
  }

  root.OmegaEditorFeatures = {
    FEATURES: FEATURES,
    ADOPT: ADOPT,
    GROUPS: GROUPS,
    decide: decide,
    isOn: isOn,
    released: released,
    featureFor: featureFor,
    setUser: setUser,
    setOrg: setOrg,
    reset: resetUser,
    layout: layout,
    open: open,
    close: close,
    markup: markup,
    /* tests set the workspace map and the admin bit without Firestore */
    _test: function (opts) {
      opts = opts || {};
      if (opts.org) orgOn = opts.org;
      if (opts.admin != null) isAdmin = !!opts.admin;
      if (opts.orgId) orgId = opts.orgId;
    }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = root.OmegaEditorFeatures;

  if (root.OMEGA_FEATURES_NO_BOOT) return;
  var d = doc();
  if (!d) return;
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', boot);
  else boot();
  try {
    if (root.firebase && root.firebase.auth) root.firebase.auth().onAuthStateChanged(function () { loadOrg(); });
  } catch (e) {}
})(typeof window !== 'undefined' ? window : globalThis);
