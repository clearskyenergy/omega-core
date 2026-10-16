/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
/* ==========================================================================
   omega-prime-handoff.js  ·  Omega Prime → Site Map
   --------------------------------------------------------------------------
   Omega Prime screens a site and sets it up as a real project
   (omega-prime-project.js): the site point, the unit configured, the grid
   answer and the load. Its "Open in Site Map" is

       /editor.html?id=<project>&from=prime

   and this file is what that `from=prime` does once the project has
   loaded: it fills the configured unit in from the editor's OWN catalog
   entry (BESS_CATALOG[catalogKey], the tenant's products merged in by
   omega-bess-products.js) — the integration flags, inverter, controller and
   interconnect voltage the one-line needs — and opens the BESS Guided
   Build, the editor's own placement. Like the storefront hand-off, it never
   forges elements on the canvas: a second placement engine would drift
   from the real one. The parameter is dropped from the address so a reload
   does not open the build again.

   ES5. Inert without the parameter. Reads the editor's globals (S,
   BESS_CATALOG, openBessGuidedBuild, _setSaved) through typeof guards.
   ========================================================================== */
(function (root) {
  'use strict';

  var TAG = '[Omega Prime]';
  var FIELDS = ['mfr', 'model', 'chem', 'kwh', 'usable', 'kw', 'dur', 'dcv', 'inv', 'ikva', 'xfmr', 'disco'];

  function fromPrime(search) { return /[?&]from=prime(?:&|$)/.test(search || ''); }
  function S0() { return (typeof S !== 'undefined' && S) ? S : (root.S || null); }
  function catalog() { return (typeof BESS_CATALOG !== 'undefined' && BESS_CATALOG) ? BESS_CATALOG : (root.BESS_CATALOG || null); }

  /* The battery list entry Prime wrote, filled in from the catalog entry
     the same way saveBess() fills one from the BESS Config form. */
  function fill(b, cat) {
    if (!b || !cat) return b;
    FIELDS.forEach(function (k) { if (cat[k] != null && cat[k] !== '') b[k] = typeof cat[k] === 'number' ? String(cat[k]) : cat[k]; });
    b._greenfield = !!cat.greenfield;
    b._gridForming = !!cat.gridForming;
    b._gridConnectV = cat.gridConnectV || '';
    b._controller = cat.controller || '';
    ['_incPCS', '_incXfmr', '_incDisco'].forEach(function (k) { if (typeof cat[k] === 'boolean') b[k] = cat[k]; });
    return b;
  }

  function dropParam() {
    try {
      var u = new URL(root.location.href);
      u.searchParams['delete']('from');
      root.history.replaceState(root.history.state, '', u.pathname + (u.search || '') + u.hash);
    } catch (e) {}
  }

  /* Waits for the project (its battery entry carries _fromPrime), the
     canvas and, for a tenant's own product, the merged catalog entry. */
  function run(opts) {
    opts = opts || {};
    if (!fromPrime(opts.search != null ? opts.search : (root.location && root.location.search))) return false;
    var tries = 0, max = opts.max || 75, wait = opts.wait || 400;
    (function tick() {
      var st = S0(), b = st && st.bessList && st.bessList[0], cat = catalog();
      var ready = b && b._fromPrime && typeof root.openBessGuidedBuild === 'function' && root.document.getElementById('addr-in');
      var entry = ready && cat ? cat[b.catalogKey] : null;
      if (!ready || (!entry && tries < 25)) {
        if (++tries > max) { if (root.console) console.warn(TAG + ' the project did not load in time; open BESS Guided Build from Build.'); return; }
        root.setTimeout(tick, wait);
        return;
      }
      fill(b, entry);
      try { var sel = root.document.getElementById('bm-catalog'); if (sel && entry) sel.value = b.catalogKey; } catch (e) {}
      try { if (typeof _setSaved === 'function') _setSaved('unsaved'); } catch (e) {}
      dropParam();
      try { root.openBessGuidedBuild(); } catch (e) {}
      if (root.console) console.info(TAG + ' ' + (b.mfr || '') + ' ' + (b.model || b.catalogKey) + ' configured; BESS Guided Build open');
    })();
    return true;
  }

  root.OmegaPrimeHandoff = { run: run, fill: fill, fromPrime: fromPrime };
  if (root.document && !root.__omegaPrimeHandoffNoAuto) {
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', function () { run(); });
    else run();
  }
})(typeof window !== 'undefined' ? window : this);
