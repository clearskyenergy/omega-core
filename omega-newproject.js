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
      desc: 'Islanding, transfer, critical loads',   opens: 'microgrid one-line' }
  ];

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
      '#new-proj-modal .modal{width:560px;max-width:94vw}',
      '.np-hint-lbl{font-weight:500;color:#9AA8B4;letter-spacing:.3px}',
      '.np-types{display:grid;grid-template-columns:1fr 1fr;gap:9px}',
      '@media(max-width:560px){.np-types{grid-template-columns:1fr}}',
      '.np-type{border:1.5px solid var(--cs-border,#E1E6EC);border-radius:10px;padding:11px 13px;',
        'cursor:pointer;background:#fff;text-align:left;font-family:inherit;',
        'transition:border-color .12s,background .12s}',
      '.np-type:hover{border-color:#BFD4E8}',
      '.np-type.on{border-color:var(--cs-sky,#2E7DD1);background:#F4F9FF}',
      '.np-type b{display:block;font-size:13px;font-weight:700;color:var(--cs-text,#12212F);letter-spacing:-.1px}',
      '.np-type span{display:block;font-size:11.5px;color:var(--cs-sub,#6B7A88);margin-top:2px;line-height:1.4}',
      '.np-type:focus-visible{outline:2px solid var(--cs-sky,#2E7DD1);outline-offset:2px}',
      /* Not decoration: the selection changes which tools the editor starts
         on, and somebody who ticks four boxes should see that before they
         commit to it. */
      '.np-opens{font-size:12px;color:var(--cs-sub,#6B7A88);margin-top:10px;line-height:1.5}',
      '.np-opens.none{color:#B3261E}'
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
      '<div class="modal">' +
        '<h3>New Project</h3>' +
        '<div class="mrow"><label>Project / Site Name</label>' +
          '<input id="np-name" placeholder="e.g. Riverside BESS 5MWh"></div>' +
        '<div class="mrow"><label>Site Address</label>' +
          '<input id="np-addr" placeholder="e.g. 1234 Main St, Clinton, IA 52732"></div>' +
        '<div class="mrow"><label>Project Type ' +
          '<span class="np-hint-lbl">&mdash; pick everything this site includes</span></label>' +
          '<div class="np-types" id="np-types"></div>' +
          '<div class="np-opens" id="np-opens"></div></div>' +
        '<div class="mrow"><label>Client / Customer</label>' +
          '<input id="np-client" placeholder="e.g. City of Clinton"></div>' +
        '<div class="mbtns">' +
          '<button class="mb-cancel" type="button" data-np="cancel">Cancel</button>' +
          '<button class="mb-create" type="button" data-np="create">Create &amp; Open Editor →</button>' +
        '</div>' +
      '</div>';
    doc.body.appendChild(m);
    m.addEventListener('click', function (e) { if (e.target === m) close(); });
    return m;
  }

  /* ── the scope grid ──────────────────────────────────────────────────── */
  function primaryType() {
    var L = scopes();
    for (var i = 0; i < L.length; i++) if (picked[L[i].key]) return L[i].legacy;
    return 'other';
  }
  function selectedKeys() {
    var L = scopes(), out = [];
    for (var i = 0; i < L.length; i++) if (picked[L[i].key]) out.push(L[i].key);
    return out;
  }
  function paintOpens() {
    var el = $('np-opens'); if (!el) return;
    var L = scopes(), parts = [];
    for (var i = 0; i < L.length; i++) if (picked[L[i].key]) parts.push(L[i].opens);
    if (!parts.length) {
      el.className = 'np-opens none';
      el.textContent = 'Pick at least one, so the editor knows which tools to open with.';
      return;
    }
    el.className = 'np-opens';
    el.textContent = 'Opens with ' + (parts.length === 1 ? parts[0]
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
    var L = scopes(), html = '';
    for (var i = 0; i < L.length; i++) {
      html += '<button type="button" class="np-type" data-k="' + esc(L[i].key) + '" aria-pressed="false">'
            + '<b>' + esc(L[i].label) + '</b><span>' + esc(L[i].desc) + '</span></button>';
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
    var m = ensure();
    renderTypes();
    wire(m);

    /* Callers still pass a single seed type — a quick link passes 'bess', the
       tool registry passes 'bess' or 'sandbox'. Seed the matching card and
       let the person add to it. 'sandbox' matches nothing, which is correct:
       a sandbox is deliberately undecided, and the "pick at least one" line
       asks rather than assuming a battery. */
    picked = {};
    var L = scopes(), i;
    for (i = 0; i < L.length; i++) if (L[i].key === seed || L[i].legacy === seed) picked[L[i].key] = true;
    var btns = doc.querySelectorAll('#np-types .np-type');
    for (i = 0; i < btns.length; i++) {
      var on = !!picked[btns[i].getAttribute('data-k')];
      btns[i].classList.toggle('on', on);
      btns[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    paintOpens();

    m.classList.add('on');
    global.setTimeout(function () { var n = $('np-name'); if (n) n.focus(); }, 100);
  }
  function close() {
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

    var db = CFG.db || global.db;
    var auth = CFG.auth || global.auth;
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
      close();
      if (typeof CFG.afterCreate === 'function') CFG.afterCreate(ref.id);
      else global.location.href = '/editor.html?id=' + encodeURIComponent(ref.id);
    })['catch'](function (e) {
      global.alert('Error creating project: ' + ((e && e.message) || e));
    });
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
    SCOPES: SCOPES, selected: selectedKeys, primaryType: primaryType,
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
