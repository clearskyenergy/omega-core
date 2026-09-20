/* ═══════════════════════════════════════════════════════════════════════════
   omega-editor-mode.js — which PRODUCT of the editor a tenant bought
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   ONE QUESTION: is this editor the full platform, or the cut-down BESS
   designer a white-label partner resells?

   ── WHY THIS IS NOT A SECOND editor.html ─────────────────────────────────
   The obvious build is a `cleancell-editor.html`. editor.html is 11.1 MB
   across 175,800 lines; a copy doubles the largest file in the repo and every
   fix to the drawing engine, the wizard or an exporter then has to be made
   twice by somebody who remembers both exist. CLAUDE.md forbids it outright:
   a tenant folder "may NOT contain copies of core files". So the lite product
   is a MODE of the one editor, and this file is the extension point.

   Everything the lite product needs — guided build, draw tools, plot plan,
   one-line, proposal, blueprints, electrical BOM, push to marketplace —
   already exists in editor.html. This is subtraction, not construction.

   ── IT FAILS OPEN, AND THAT IS THE WHOLE SAFETY ARGUMENT ─────────────────
   An unknown mode, a missing omega_orgs record, a Firestore read that threw:
   all of them resolve to 'full'. Same reasoning as omega-editor-gate.js and
   tenantActive() in firestore.rules — every tenant live today has no record
   until the seed runs, and a mode that failed closed would strip the ribbon
   for every paying customer on the first deploy. Only an EXPLICIT
   editorMode: 'bess-lite' subtracts anything.

   ── IT CURATES, IT DOES NOT DELETE ───────────────────────────────────────
   Hidden nodes are hidden, remembered, and put back by restore(). Nothing is
   recreated, so every handler, tooltip and gating hook travels with the node
   — the same discipline OMEGA PATCH 59 (Compute Mode) already uses inside
   editor.html, and for the same reason.

   ── IT IS NOT A SECURITY BOUNDARY ────────────────────────────────────────
   This decides what a tenant is SHOWN. What they may READ and WRITE is
   firestore.rules, scoped by orgId, and what tools they may open is
   billing/current.toolAccess, which api/ endpoints enforce on their own. A
   hidden ribbon page is a commercial control; a function that refuses is the
   gate.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var DEFAULT_MODE = 'full';

  /* The whole policy, as data, so scripts/test-editor-mode.js can assert it
     without standing up a browser. A mode names what it SUBTRACTS; anything
     unnamed stays, which is what keeps a new editor feature from silently
     vanishing out of the lite product the day it ships. */
  var POLICY = {
    full: {
      label: 'Full platform',
      hidePages: [],
      hideCats: [],
      denies: []
    },
    'bess-lite': {
      label: 'BESS designer',
      /* Ribbon pages. `compute` is the data-centre workspace and is the one
         thing the lite product is sold without. draw/insert/modify/annotate/
         view/analyze/estimate/output/validation all stay — they are how a
         plot plan, a one-line and a BOM get made. */
      hidePages: ['compute'],
      /* Equipment-browser categories. Solar stays: a BESS on a site with PV
         is a normal job, and the partner asked for it explicitly. */
      hideCats: ['datacenter', 'ev'],
      /* Named capabilities a caller can ask about before doing work. */
      denies: ['compute', 'datacenter', 'fiber', 'loadscreen']
    }
  };

  function norm(m) {
    var k = String(m == null ? '' : m).trim().toLowerCase();
    return Object.prototype.hasOwnProperty.call(POLICY, k) ? k : DEFAULT_MODE;
  }

  /* Pure: the three questions the policy answers. Exported for tests. */
  function policyOf(mode) { return POLICY[norm(mode)]; }
  function hiddenPages(mode) { return policyOf(mode).hidePages.slice(); }
  function hiddenCats(mode) { return policyOf(mode).hideCats.slice(); }
  function allows(mode, feature) {
    var f = String(feature == null ? '' : feature).trim().toLowerCase();
    if (!f) return true;
    return policyOf(mode).denies.indexOf(f) < 0;
  }

  /* ── Resolution ──────────────────────────────────────────────────────────
     omega-whitelabel.js hydrate() already fetches omega_orgs/{org} to paint
     the editor, so the mode rides that read rather than costing a second one.
     It lands on CLEARSKY_CONFIG.tenant.editorMode. */
  function resolve() {
    try {
      var c = global.CLEARSKY_CONFIG || {};
      var t = c.tenant || {};
      if (t.editorMode) return norm(t.editorMode);
      if (c.editorMode) return norm(c.editorMode);
    } catch (e) {}
    return DEFAULT_MODE;
  }

  /* ── The DOM half ────────────────────────────────────────────────────────
     Remembered, never removed. */
  var hidden = [];

  function hideNode(n) {
    if (!n || n.getAttribute('data-omega-mode-hidden') === '1') return;
    hidden.push({ node: n, display: n.style.display });
    n.style.display = 'none';
    n.setAttribute('data-omega-mode-hidden', '1');
    n.setAttribute('aria-hidden', 'true');
  }

  function restore() {
    for (var i = 0; i < hidden.length; i++) {
      var h = hidden[i];
      try {
        h.node.style.display = h.display || '';
        h.node.removeAttribute('data-omega-mode-hidden');
        h.node.removeAttribute('aria-hidden');
      } catch (e) {}
    }
    hidden = [];
  }

  function apply(mode) {
    var m = norm(mode || resolve());
    restore();
    if (m === DEFAULT_MODE) return m;

    var doc = global.document;
    if (!doc || !doc.querySelectorAll) return m;

    var pages = hiddenPages(m), i, j, list;

    for (i = 0; i < pages.length; i++) {
      /* The ribbon page itself, and the tab that opens it. A page hidden
         without its tab leaves a button that opens nothing, which reads as a
         bug rather than as a product boundary. */
      list = doc.querySelectorAll(
        '[data-page="' + pages[i] + '"], [data-tab="' + pages[i] + '"], ' +
        '[data-ribbon-tab="' + pages[i] + '"]'
      );
      for (j = 0; j < list.length; j++) hideNode(list[j]);
    }

    var cats = hiddenCats(m);
    for (i = 0; i < cats.length; i++) {
      list = doc.querySelectorAll('[data-cat="' + cats[i] + '"]');
      for (j = 0; j < list.length; j++) hideNode(list[j]);
    }

    try { doc.documentElement.setAttribute('data-omega-editor-mode', m); } catch (e) {}
    return m;
  }

  /* Re-apply after the ribbon rebuilds. The editor rebuilds pages on project
     load, so a one-shot apply() at boot would come undone the moment somebody
     opens a site. Cheap, idempotent, and stops on restore(). */
  function watch(everyMs) {
    var ms = everyMs > 0 ? everyMs : 1500;
    if (resolve() === DEFAULT_MODE) return null;
    return global.setInterval(function () { apply(); }, ms);
  }

  function boot() {
    var m = resolve();
    if (m === DEFAULT_MODE) return m;
    apply(m);
    watch();
    return m;
  }

  var API = {
    DEFAULT_MODE: DEFAULT_MODE,
    POLICY: POLICY,
    norm: norm,
    policyOf: policyOf,
    hiddenPages: hiddenPages,
    hiddenCats: hiddenCats,
    allows: allows,
    resolve: resolve,
    apply: apply,
    restore: restore,
    watch: watch,
    boot: boot,
    is: function (m) { return resolve() === norm(m); }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (global) global.OmegaEditorMode = API;
})(typeof window !== 'undefined' ? window : globalThis);
