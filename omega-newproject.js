/* ═══════════════════════════════════════════════════════════════════════════════
   omega-newproject.js — one New Project dialog, for every page that has one
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   THERE WERE TWO, AND THEY DISAGREED ABOUT WHAT A PROJECT IS.

   index.html asked "pick everything this site includes" and wrote siteScopes.
   projects.html asked for ONE project type from a <select> and wrote none. Both
   used the same element ids and the same function names, so which dialog you
   got depended on which page you happened to be standing on — and a project
   created from /projects opened in the editor without the build its scopes
   would have selected. Same button, same title, different product.

   Copying the good one across would have made a third copy to keep in step.
   This is the one, and both pages call it.

   ── WHAT IT WRITES, AND WHY IT IS TWO FIELDS ─────────────────────────────
     type        ONE legacy string — 'bess' | 'solar' | 'dcfc' | 'compute' | …
                 Every existing project has it and the dashboard's "Projects
                 by Type" doughnut still rolls up on it. Derived, not asked
                 for: the first scope in SCOPES order wins, so a solar +
                 storage + charging site reads 'solar' — the same answer the
                 old dropdown gave for the same site, which is what keeps the
                 historical chart comparable.
     siteScopes  the FULL array of what the site contains.

   siteScopes, NOT `scopes`. `scopes` on a project already means the
   DELIVERABLES asked for on an intake — the ops console and omega-delivery.js
   both write it that way. Two vocabularies in one field would have made every
   screening panel read site hardware as requested packages.

   ── WHAT THE HOST PAGE STILL OWNS ────────────────────────────────────────
   The tenant tag and the owner label are resolved differently on each page
   (window.OMEGA_WORKSPACE on one, a WS object on the other), and getting
   orgId wrong writes a project into another tenant. So the module never
   guesses: OmegaNewProject.configure() takes them, and refuses to write
   without an orgId rather than defaulting to something plausible.

   ES5. No build step.

   PUBLIC API — window.OmegaNewProject
     .configure({ db, auth, orgId(), ownerName(), afterCreate(id), scopes })
     .open(seedType)      seedType is optional: 'bess', 'solar', 'sandbox'…
     .close()
     .create()            wired to the dialog's own button
     .SCOPES              the scope table, for anything that needs the labels
   ═══════════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';
  if (global.OmegaNewProject) return;

  var doc = global.document;

  /* SITE SCOPES — what a project can contain. Order here is the render order
     and, deliberately, also the precedence order used by primaryType(): the
     thing that most defines a site sits first.

     `key` is written into siteScopes and is permanent once projects carry it.
     `legacy` is what that scope collapses to in the old single `type` field.
     DER/Solar maps to 'solar' because that is the value already in every
     existing solar project and in the doughnut's colour map — changing it
     would orphan the chart, not improve it.

     `opens` is the phrase used in the "Opens with …" line. It describes the
     EDITOR, so if the editor's tooling changes these are the strings to fix. */
  var SCOPES = [
    { key: 'der',       legacy: 'solar',     label: 'DER / Solar',
      desc: 'PV, wind, generation on site',          opens: 'solar & DER layout' },
    { key: 'bess',      legacy: 'bess',      label: 'Storage / BESS',
      desc: 'Batteries, PCS, EMS',                   opens: 'BESS build + sizer' },
    { key: 'compute',   legacy: 'compute',   label: 'Data centre / Compute',
      desc: 'Compute blocks, load profile',          opens: 'compute blocks + load profile' },
    { key: 'dcfc',      legacy: 'dcfc',      label: 'DCFC',
      desc: '480V 3Ø fast charging',            opens: 'DC fast-charging layout' },
    { key: 'l2',        legacy: 'l2',        label: 'Level 2 EV',
      desc: '240V 1Ø off an existing service',  opens: 'Level 2 charging layout' },
    { key: 'microgrid', legacy: 'microgrid', label: 'Microgrid',
      desc: 'Islanding, transfer, critical loads',   opens: 'DER build' },
    { key: 'building', legacy: 'building', label: 'Building / Net-Zero',
      desc: 'Building, rooftop solar and loads', opens: 'building design' }
  ];

  /* Presentation presets expand to the EXISTING siteScopes vocabulary.
     This is not a module/price catalog or an entitlement grant. */
  var CARDS = [
    { key:'l2', label:'Level 2 EV', desc:'Everyday charging at work and home.', scopes:['l2'], icon:'M8 21V5h8v16M6 21h12M10 8h4v5h-4zM16 7h3l2 3v7a2 2 0 0 1-4 0v-2' },
    { key:'dcfc', label:'DCFC', desc:'Fast charging with utility coordination.', scopes:['dcfc'], icon:'M4 21V4h12v17M2 21h16M10 7l-3 5h4l-2 5M16 6h3l3 4v7h-3' },
    { key:'bess', label:'BESS', desc:'Behind or in front of the meter.', scopes:['bess'], icon:'M3 5h8v16H3zM13 5h8v16h-8zM5 2h4M15 2h4M5 9h4M15 9h4M5 13h4M15 13h4M5 17h4M15 17h4' },
    { key:'solarstorage', label:'Solar + Storage', desc:'Generate on site. Store for later.', scopes:['der','bess'], icon:'M2 5h12l2 10H1zM6 5l-1 10M10 5l1 10M2 10h13M8 15v5M4 20h8M18 9h5v12h-5zM19 6h3' },
    { key:'microgrid', label:'DER / Microgrid', desc:'Connect generation and critical loads.', scopes:['microgrid'], icon:'M10 9h4v6h-4zM2 2h5v5H2zM17 2h5v5h-5zM2 17h5v5H2zM17 17h5v5h-5zM7 7l3 3M14 10l3-3M7 17l3-3M14 14l3 3' },
    { key:'compute', label:'Compute campus', desc:'Plan power for a growing campus.', scopes:['compute'], icon:'M3 3h18v6H3zM3 10h18v6H3zM3 17h18v5H3zM6 6h1M6 13h1M6 20h1M12 6h6M12 13h6M12 20h6' },
    { key:'building', label:'Building / Net-Zero', desc:'Buildings, loads and rooftop energy.', scopes:['building'], icon:'M3 22V7l9-5 9 5v15M1 22h22M7 9h2M15 9h2M7 13h2M15 13h2M10 22v-5h4v5' }
  ];
  function cards() { return CFG.scopes || CARDS; }
  function cardScopes(card) { return card.scopes || [card.key]; }
  function illustration(card) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="' + esc(card.icon || CARDS[2].icon) + '"/></svg>';
  }

  var CFG = {
    db: null, auth: null,
    orgId: function () { return ''; },
    ownerName: function () { return ''; },
    afterCreate: null,
    scopes: null
  };
  function scopes() { return CFG.scopes || SCOPES; }

  var picked = {};

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function $(id) { return doc.getElementById(id); }

  /* ── styles ──────────────────────────────────────────────────────────
     Injected rather than asked of each page, because the two pages had
     drifted on this too: only one carried the scope-grid rules, so the
     other would have rendered the cards as unstyled buttons. Every rule is
     scoped to the dialog. */
  function css() {
    if ($('omega-np-css')) return;
    var s = doc.createElement('style');
    s.id = 'omega-np-css';
    s.textContent = [
      '#new-proj-modal{--np-bg:#F5F4F0;--np-card:#fff;--np-ink:#16202B;--np-sub:#526273;--np-line:#D7DFE6;--np-blue:#2B5FA8;--np-on:#EAF0F8}',
      '#new-proj-modal,#new-proj-modal *{box-sizing:border-box}',
      '#new-proj-modal .modal{width:940px;max-width:94vw;max-height:92vh;overflow:auto;background:var(--np-bg);color:var(--np-ink);padding:28px;border:1px solid var(--np-line);border-radius:16px}',
      '#new-proj-modal h3{font-size:26px;margin:0 0 6px;letter-spacing:-.6px;color:var(--np-ink)}',
      '#new-proj-modal .np-intro{color:var(--np-sub);margin:0 0 22px;font-size:14px}',
      '#new-proj-modal .np-eyebrow{color:var(--np-blue);font:600 11px/1.5 ui-monospace,monospace;letter-spacing:.12em;margin-bottom:8px}',
      '#new-proj-modal .np-types{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}',
      '#new-proj-modal .np-type{position:relative;min-height:154px;border:1px solid var(--np-line);border-radius:10px;padding:16px;text-align:left;font-family:inherit;cursor:pointer;background:var(--np-card);color:var(--np-ink)}',
      '#new-proj-modal .np-type:hover{border-color:var(--np-blue)}',
      '#new-proj-modal .np-type.on{border:2px solid var(--np-blue);padding:15px;background:var(--np-on)}',
      '#new-proj-modal .np-type.on:after{content:"✓";position:absolute;right:12px;top:10px;color:var(--np-blue);font-weight:700}',
      '#new-proj-modal .np-type svg{display:block;width:36px;height:36px;margin-bottom:14px;fill:none;stroke:var(--np-blue);stroke-width:1.4;stroke-linecap:round;stroke-linejoin:round}',
      '#new-proj-modal .np-type b{display:block;font-size:14px;line-height:1.4}',
      '#new-proj-modal .np-type span{display:block;color:var(--np-sub);font-size:12px;line-height:1.5;margin-top:5px}',
      '#new-proj-modal :focus-visible{outline:3px solid var(--np-blue);outline-offset:3px}',
      '#new-proj-modal .np-opens{font-size:12px;color:var(--np-sub);min-height:20px;margin:12px 0 20px;line-height:1.5}',
      '#new-proj-modal .np-details{display:grid;grid-template-columns:1fr 1fr;gap:12px 16px}',
      '#new-proj-modal .np-details .mrow{margin:0}#new-proj-modal .np-address{grid-column:1/-1}',
      '#new-proj-modal label{display:block;color:var(--np-sub);font-size:12px;margin-bottom:6px}',
      '#new-proj-modal input{box-sizing:border-box;width:100%;min-height:42px;background:var(--np-card);color:var(--np-ink);border:1px solid var(--np-line);border-radius:6px;padding:10px;font:inherit;font-size:14px}',
      '#new-proj-modal .mbtns{display:flex;justify-content:flex-end;gap:10px;margin-top:24px}',
      '#new-proj-modal .mbtns button{min-height:42px;border-radius:6px;padding:10px 16px;font:600 13px system-ui;cursor:pointer}',
      '#new-proj-modal .mb-cancel{background:var(--np-card);color:var(--np-ink);border:1px solid var(--np-line)}',
      '#new-proj-modal .mb-create{background:var(--np-blue);color:#fff;border:1px solid var(--np-blue)}',
      '@media(max-width:800px){#new-proj-modal .np-types{grid-template-columns:repeat(3,minmax(0,1fr))}#new-proj-modal .modal{padding:20px}}',
      '@media(max-width:600px){#new-proj-modal .np-types{grid-template-columns:repeat(2,minmax(0,1fr))}}',
      '@media(max-width:480px){#new-proj-modal .np-details{grid-template-columns:1fr}#new-proj-modal .np-type{padding:12px;min-height:150px}#new-proj-modal .np-type.on{padding:11px}}',
      '[data-theme="dark"] #new-proj-modal,body.dark #new-proj-modal{--np-bg:#10161D;--np-card:#172029;--np-ink:#E6EBF0;--np-sub:#A6B3C0;--np-line:#344452;--np-blue:#6E9BE0;--np-on:#1A2A40}',
      '@media(prefers-color-scheme:dark){html:not([data-theme="light"]) #new-proj-modal{--np-bg:#10161D;--np-card:#172029;--np-ink:#E6EBF0;--np-sub:#A6B3C0;--np-line:#344452;--np-blue:#6E9BE0;--np-on:#1A2A40}}'
    ].join('');
    (doc.head || doc.documentElement).appendChild(s);
  }

  /* ── markup ──────────────────────────────────────────────────────────
     Built here if the page has not got one. A page that already carries the
     modal in its own HTML keeps it — the ids are the contract. */
  function ensure() {
    css();
    if ($('new-proj-modal')) return $('new-proj-modal');
    var m = doc.createElement('div');
    m.className = 'modal-bg';
    m.id = 'new-proj-modal';
    m.innerHTML =
      '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="np-title">' +
        '<div class="np-eyebrow">NEW PROJECT</div><h3 id="np-title">What are you building?</h3>' +
        '<p class="np-intro">Choose a starting point. Select more than one for a mixed site.</p>' +
        '<div class="np-types" id="np-types" role="group" aria-label="Project types"></div>' +
        '<div class="np-opens" id="np-opens" role="status"></div>' +
        '<div class="np-details"><div class="mrow"><label for="np-name">Project / Site Name</label>' +
          '<input id="np-name" placeholder="e.g. Riverside energy project" required></div>' +
        '<div class="mrow"><label for="np-client">Client / Customer</label>' +
          '<input id="np-client" placeholder="e.g. City of Clinton"></div>' +
        '<div class="mrow np-address"><label for="np-addr">Site Address</label>' +
          '<input id="np-addr" placeholder="Street address, city and state"></div></div>' +
        '<div class="mbtns"><button class="mb-cancel" type="button" data-np="cancel">Cancel</button>' +
          '<button class="mb-create" type="button" data-np="create">Create &amp; Open Editor →</button></div>' +
      '</div>';
    doc.body.appendChild(m);
    m.addEventListener('click', function (e) { if (e.target === m) close(); });
    m.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      if (e.key !== 'Tab') return;
      var focusable = m.querySelectorAll('button:not([disabled]),input:not([disabled])');
      var first = focusable[0], last = focusable[focusable.length - 1];
      if (e.shiftKey && doc.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    return m;
  }

  /* ── the scope grid ──────────────────────────────────────────────────── */
  function primaryType() {
    var selected = selectedKeys(), L = scopes();
    for (var i = 0; i < L.length; i++) if (selected.indexOf(L[i].key) >= 0) return L[i].legacy;
    return 'other';
  }
  function selectedKeys() {
    var L = cards(), wanted = {}, out = [];
    for (var i = 0; i < L.length; i++) if (picked[L[i].key]) {
      cardScopes(L[i]).forEach(function (key) { wanted[key] = true; });
    }
    scopes().forEach(function (scope) { if (wanted[scope.key]) out.push(scope.key); });
    return out;
  }
  function paintOpens() {
    var el = $('np-opens'); if (!el) return;
    var L = cards(), parts = [];
    for (var i = 0; i < L.length; i++) if (picked[L[i].key]) parts.push(L[i].label);
    if (!parts.length) {
      el.className = 'np-opens none';
      el.textContent = 'Pick at least one, so the editor knows which tools to open with.';
      return;
    }
    el.className = 'np-opens';
    el.textContent = 'Project includes ' + (parts.length === 1 ? parts[0]
      : parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1]) + '.';
  }
  function toggle(key) {
    picked[key] = !picked[key];
    var b = doc.querySelector('.np-type[data-k="' + key + '"]');
    if (b) {
      b.classList.toggle('on', !!picked[key]);
      b.setAttribute('aria-pressed', picked[key] ? 'true' : 'false');
    }
    paintOpens();
  }
  function renderTypes() {
    var host = $('np-types'); if (!host) return;
    if (host.getAttribute('data-built')) return;
    var L = cards(), html = '';
    for (var i = 0; i < L.length; i++) {
      html += '<button type="button" class="np-type" data-k="' + esc(L[i].key) + '" aria-pressed="false">'
            + illustration(L[i]) + '<b>' + esc(L[i].label) + '</b><span>' + esc(L[i].desc) + '</span></button>';
    }
    host.innerHTML = html;
    var btns = host.querySelectorAll('.np-type');
    for (var j = 0; j < btns.length; j++) {
      (function (b) { b.onclick = function () { toggle(b.getAttribute('data-k')); }; })(btns[j]);
    }
    host.setAttribute('data-built', '1');
  }

  /* ── open / close ────────────────────────────────────────────────────── */
  function open(seed) {
    returnFocus = doc.activeElement;
    var m = ensure();
    renderTypes();
    wire(m);

    /* Callers still pass a single seed type — a quick link passes 'bess', the
       tool registry passes 'bess' or 'sandbox'. Seed the matching card and
       let the person add to it. 'sandbox' matches nothing, which is correct:
       a sandbox is deliberately undecided, and the "pick at least one" line
       asks rather than assuming a battery. */
    picked = {};
    var L = cards(), i;
    var aliases = { solar:'solarstorage', der:'microgrid', ev:'dcfc', evl2:'l2', level2:'l2', datacenter:'compute', netzero:'building' };
    seed = aliases[seed] || seed;
    for (i = 0; i < L.length; i++) if (L[i].key === seed || L[i].legacy === seed) picked[L[i].key] = true;
    var btns = doc.querySelectorAll('#np-types .np-type');
    for (i = 0; i < btns.length; i++) {
      var on = !!picked[btns[i].getAttribute('data-k')];
      btns[i].classList.toggle('on', on);
      btns[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    paintOpens();

    m.classList.add('on');
    global.setTimeout(function () { var n = m.querySelector('.np-type.on') || m.querySelector('.np-type'); if (n) n.focus(); }, 100);
  }
  var returnFocus = null;
  function close() {
    if (returnFocus && returnFocus.focus) returnFocus.focus();
    var m = $('new-proj-modal'); if (m) m.classList.remove('on');
  }

  function wire(m) {
    if (m.getAttribute('data-np-wired')) return;
    var c = m.querySelector('[data-np="cancel"]'), k = m.querySelector('[data-np="create"]');
    if (c) c.onclick = close;
    if (k) k.onclick = create;
    m.setAttribute('data-np-wired', '1');
  }

  /* ── write ───────────────────────────────────────────────────────────── */
  function create() {
    var name = (($('np-name') || {}).value || '').trim();
    var addr = (($('np-addr') || {}).value || '').trim();
    var client = (($('np-client') || {}).value || '').trim();
    var siteScopes = selectedKeys();

    if (!name) { global.alert('Please enter a project name.'); return; }
    if (!siteScopes.length) {
      global.alert('Pick at least one project type, so the editor knows which tools to open with.');
      return;
    }

    /* ── WHY THIS TAKES A GETTER AND NOT A HANDLE ──────────────────────
       Both host pages declare their Firestore handle with `let db` / `const
       db` at script top level. Those are LEXICAL bindings: unlike `var`,
       they never become properties of window. So `configure({ db: window.db })`
       handed this module `undefined`, `global.db` was `undefined` too, and
       every Create & Open Editor ended at "Not connected." — a page that was
       fully signed in and perfectly able to write, reporting no connection.

       Reading it through a function also fixes the ORDERING half of the same
       bug: configure() ran on a 150 ms retry that only waited for this module
       to exist, not for firebase.firestore() to have been called, so even a
       `var` handle could have been captured before it was assigned. A getter
       is resolved at click time, when the answer is knowable. */
    var db = pick(CFG.db) || global.db;
    var auth = pick(CFG.auth) || global.auth;
    var user = (auth && auth.currentUser) || null;
    if (!db) { global.alert('Not connected.'); return; }
    if (!user) { global.alert('You need to be signed in.'); return; }

    /* ORG IS NOT GUESSED. Writing a project under the wrong orgId puts it in
       another tenant's list, and Firestore rules would happily accept it
       because the writer really is signed in. The host page resolves this. */
    var orgId = '';
    try { orgId = String(CFG.orgId() || '').toLowerCase(); } catch (e) {}
    if (!orgId) { global.alert('Your workspace has not finished loading. Try again in a moment.'); return; }

    var owner = '';
    try { owner = CFG.ownerName() || ''; } catch (e) {}
    if (!owner) owner = user.displayName || String(user.email || '').split('@')[0];

    var FV = global.firebase.firestore.FieldValue;
    db.collection('projects').add({
      uid: user.uid,
      orgId: orgId,
      ownerEmail: String(user.email || '').toLowerCase(),
      ownerName: owner,
      name: name, address: addr, type: primaryType(), client: client,
      siteScopes: siteScopes,
      stage: 'candidate',
      createdAt: FV.serverTimestamp(),
      updatedAt: FV.serverTimestamp(),
      elements: [], conduits: [], bessList: [], annotations: []
    }).then(function (ref) {
      try { if (global.OmegaEvents) global.OmegaEvents.emit('project.created', { projectId: ref.id, vertical: String(primaryType() || '').toLowerCase() || null, source: 'new-project' }); } catch (e) {}
      close();
      if (typeof CFG.afterCreate === 'function') CFG.afterCreate(ref.id);
      else global.location.href = '/editor.html?id=' + encodeURIComponent(ref.id);
    })['catch'](function (e) {
      global.alert('Error creating project: ' + ((e && e.message) || e));
    });
  }

  /* A configured value may be the thing itself or a function returning it.
     Anything that throws is treated as not ready rather than taking the
     page down. */
  function pick(v) {
    if (typeof v !== 'function') return v;
    try { return v(); } catch (e) { return null; }
  }

  function configure(o) {
    o = o || {};
    if (o.db) CFG.db = o.db;
    if (o.auth) CFG.auth = o.auth;
    if (typeof o.orgId === 'function') CFG.orgId = o.orgId;
    if (typeof o.ownerName === 'function') CFG.ownerName = o.ownerName;
    if (typeof o.afterCreate === 'function') CFG.afterCreate = o.afterCreate;
    if (o.scopes && o.scopes.length) CFG.scopes = o.scopes;
    return CFG;
  }

  global.OmegaNewProject = {
    configure: configure, open: open, close: close, create: create,
    SCOPES: SCOPES, CARDS: CARDS, selected: selectedKeys, primaryType: primaryType,
    VERSION: 'newproject/1.0'
  };

  /* The old global names, kept so existing onclick="" attributes and any
     console habit keep working. Assigned rather than aliased so a page that
     defines its own AFTER this file loads still wins — which is what lets a
     page opt out without editing this one. */
  if (typeof global.openNewProjectModal !== 'function') global.openNewProjectModal = open;
  if (typeof global.closeNewProjectModal !== 'function') global.closeNewProjectModal = close;
  if (typeof global.createProject !== 'function') global.createProject = create;

})(typeof window !== 'undefined' ? window : globalThis);
