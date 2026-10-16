/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
/* ==========================================================================
   omega-grid-verdict.js  ·  the ONE browser client of POST /api/grid-verdict
   --------------------------------------------------------------------------
   Site Map's Grid panel (omega-grid-panel.js) and Omega Prime
   (omega-prime.html) ask the same question — does the circuit under this
   parcel have room for this unit? — and must never answer it two ways. Both
   build the request here, send it here, and write the answer onto a project
   here, in one shape: grid.substation, grid.circuit, grid.verdict
   (docs/GUIDED-SITE-FLOW.md). The verdict itself is the server's
   (api/_lib/grid-verdict.js); nothing in this file judges anything.

   ES5. No dependencies beyond fetch and, for ask(), the Firebase compat
   auth already on the page.
   ========================================================================== */
(function (root) {
  'use strict';

  /* One row of OmegaComEdLayers.probePoint's answer → the request's circuit. */
  function circuitBody(probe, i, utility) {
    var row = probe && probe.rows ? probe.rows[i || 0] : null;
    if (!row) return null;
    return { utility: utility || probe.utility || '', id: row.feeder || '', substation: row.sub || '',
             publishedKw: row.bess == null || isNaN(row.bess) ? null : row.bess, queuedKw: row.queue || 0,
             addressResolved: !!probe.addressResolved, grain: probe.grain || '' };
  }

  function token() {
    try {
      var u = root.firebase && root.firebase.auth && root.firebase.auth().currentUser;
      if (u) return u.getIdToken();
    } catch (e) {}
    return Promise.reject(new Error('Sign in to check the grid.'));
  }

  /* body: { unit:{kw,kwh,name}, substation:{name,kv,km}, circuit } */
  function ask(body) {
    return token().then(function (t) {
      return root.fetch('/api/grid-verdict', { method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t }, body: JSON.stringify(body) });
    }).then(function (res) {
      return res.json()['catch'](function () { return {}; }).then(function (j) {
        if (!res.ok) throw new Error(j.error || ('The grid verdict returned ' + res.status));
        return j;
      });
    });
  }

  /* The answer → what goes on the project record. `probe` and `i` name the
     source row so the record says where the figures came from. */
  function fields(a, probe, i, at) {
    if (!a || !a.verdict) return null;
    at = at || new Date().toISOString();
    var s = a.substation, c = a.circuit || {}, row = probe && probe.rows ? probe.rows[i || 0] : null;
    return {
      substation: s ? { name: s.name, kv: s.kv, miles: s.miles, km: s.km, chip: s.chip, state: s.state, source: 'grid-atlas-service' } : null,
      circuit: (c.publishedKw != null || c.id) ? {
        utility: c.utility || '', id: c.id || '', substation: c.substation || '',
        publishedKw: c.publishedKw, queuedKw: c.queuedKw, netKw: c.netKw, headroomKw: c.headroomKw,
        addressResolved: !!c.addressResolved, grain: c.grain || '', at: at,
        source: probe && probe.layerId != null ? ('comed-hosting-capacity layer ' + probe.layerId + (row && row.refreshed ? ' · queue ' + row.refreshed : '')) : ''
      } : null,
      verdict: { key: a.verdict.key, label: a.verdict.label, say: a.verdict.say,
                 unitKw: a.unit && a.unit.kw, unitName: a.unit && a.unit.name, version: a.version, at: at }
    };
  }

  root.OmegaGridVerdict = { circuitBody: circuitBody, ask: ask, fields: fields };
})(typeof window !== 'undefined' ? window : this);
