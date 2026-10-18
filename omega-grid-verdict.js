/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
/* ==========================================================================
   omega-grid-verdict.js  ·  the ONE browser client of POST /api/grid-verdict
                             and POST /api/hosting-capacity
   --------------------------------------------------------------------------
   Site Map's Grid panel (omega-grid-panel.js) and Omega Prime
   (omega-prime.html) ask the same question — does the circuit under this
   parcel have room for this unit? — and must never answer it two ways. Both
   build the request here, send it here, and write the answer onto a project
   here, in one shape: grid.substation, grid.circuit, grid.verdict
   (docs/GUIDED-SITE-FLOW.md). The verdict itself is the server's
   (api/_lib/grid-verdict.js); nothing in this file judges anything. The
   national door (2026-10-17) answers utility, coverage and circuit
   together; fromHosting() turns that answer into the same record, with the
   source named from the answer rather than assumed to be ComEd's.

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

  /* ── the national door (DESIGN C6): POST /api/hosting-capacity ─────────
     The server identifies the serving utility at the point, reads its
     PUBLISHED hosting capacity where one exists, and judges it with the same
     engine; the page only renders `coverage`, `note`, `verify` and the
     judged answer. body: { lat, lng, unit:{kw,kwh,name},
     substation:{name,kv,km}, mode:'storage' } */
  function call(method, url, body) {
    return token().then(function (t) {
      var o = { method: method, headers: { Authorization: 'Bearer ' + t } };
      if (body) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(body); }
      return root.fetch(url, o);
    }).then(function (res) {
      return res.json()['catch'](function () { return {}; }).then(function (j) {
        if (!res.ok) throw new Error(j.error || ('The hosting capacity check returned ' + res.status));
        return j;
      });
    });
  }
  function hosting(body) { return call('POST', '/api/hosting-capacity', body); }
  function coverage() { return call('GET', '/api/hosting-capacity?coverage=1', null); }

  /* The door's answer → the same grid record fields() makes (substation,
     circuit, verdict), with the source named from the answer, not assumed. */
  function fromHosting(res, at) {
    if (!res || !res.verdict || !res.verdict.verdict) return null;
    at = at || new Date().toISOString();
    var a = res.verdict, s = a.substation, c = a.circuit || {}, src = res.source || null, u = res.utility || null;
    var best = res.circuits && res.best != null ? res.circuits[res.best] : null;
    var words = src ? [src.label, src.layer, src.refreshed ? 'refreshed ' + src.refreshed : ''].filter(function (x) { return !!x; }).join(' · ') : '';
    return {
      substation: s ? { name: s.name, kv: s.kv, miles: s.miles, km: s.km, chip: s.chip, state: s.state, source: 'grid-atlas-service' } : null,
      circuit: (c.publishedKw != null || c.id) ? {
        utility: c.utility || (u && u.display) || '', id: c.id || '', substation: c.substation || '',
        publishedKw: c.publishedKw, queuedKw: c.queuedKw == null ? null : c.queuedKw, netKw: c.netKw, headroomKw: c.headroomKw == null ? null : c.headroomKw,
        addressResolved: !!c.addressResolved, grain: c.grain || '', at: at, source: words,
        basis: c.basis || (best && best.basis) || null, queueNetted: !!c.queueNetted, band: c.band || null,
        utilityKey: (u && u.key) || null, eiaId: (u && u.eiaId) || null, coverage: res.coverage || null,
        ledgerId: (best && best.ledgerId) || null
      } : null,
      verdict: { key: a.verdict.key, label: a.verdict.label, say: a.verdict.say,
                 unitKw: a.unit && a.unit.kw, unitName: a.unit && a.unit.name, version: a.version, at: at }
    };
  }

  /* The C6 summary a project keeps beside its grid record (prime.hosting):
     who serves the point, what is published there, and where to verify. */
  function hostingSummary(res, at) {
    if (!res) return null;
    var best = res.circuits && res.best != null ? res.circuits[res.best] : null, up = (best && best.upstream) || {};
    return {
      utility: res.utility ? { key: res.utility.key || null, display: res.utility.display || '', eiaId: res.utility.eiaId || null } : null,
      coverage: res.coverage || null,
      source: res.source ? { key: res.source.key || null, label: res.source.label || '', grain: res.source.grain || '', refreshed: res.source.refreshed || null,
                             addressResolved: !!res.source.addressResolved, distanceM: res.source.distanceM == null ? null : res.source.distanceM } : null,
      circuit: best ? { id: best.id || '', name: best.name || '', substation: best.substation || '', kv: best.kv == null ? null : best.kv,
                        basis: best.basis || null, publishedKw: best.publishedKw == null ? null : best.publishedKw,
                        queuedKw: best.queuedKw == null ? null : best.queuedKw, queueNetted: !!best.queueNetted, band: best.band || null,
                        genKw: best.genKw == null ? null : best.genKw, loadKw: best.loadKw == null ? null : best.loadKw,
                        storageKw: best.storageKw == null ? null : best.storageKw,
                        upstream: { transformerKw: up.transformerKw == null ? null : up.transformerKw, bankKw: up.bankKw == null ? null : up.bankKw,
                                    substationKw: up.substationKw == null ? null : up.substationKw, pnode: up.pnode || null } } : null,
      verify: res.verify ? { viewerUrl: res.verify.viewerUrl || '', label: res.verify.label || '' } : null,
      note: res.note || '',
      at: at || new Date().toISOString()
    };
  }

  root.OmegaGridVerdict = { circuitBody: circuitBody, ask: ask, fields: fields,
    hosting: hosting, coverage: coverage, fromHosting: fromHosting, hostingSummary: hostingSummary };
})(typeof window !== 'undefined' ? window : this);
