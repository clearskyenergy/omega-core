/* ═══════════════════════════════════════════════════════════════════════════
   omega-grid-atlas-client.js — one client for /api/grid-atlas
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   WHY THIS FILE EXISTS.

   api/grid-atlas.js already says the important thing: two copies of one
   scoring model disagree within a month, and the disagreement surfaces as
   two different numbers for one site with nobody able to say which is
   right. That argument was taken seriously for the MODEL — it lives in the
   service and the editor calls it rather than reimplementing it.

   It was not taken seriously for the CLIENT. Working out which host answers,
   remembering the one that did, and shaping the request is about forty lines
   that were embedded in editor.html, and the site finder needed exactly the
   same forty. This is them, once.

   ── WHICH ENDPOINT ─────────────────────────────────────────────────────
   Same origin first, which removes the problem rather than working around
   it: no CORS step, no preflight, no origin allowlist to keep in step as
   hosts are added. If api/grid-atlas.js is deployed beside the page, that is
   the endpoint and nothing needs configuring. The cross-origin hosts stay as
   fallbacks for pages that do not carry their own copy, and whichever
   answers is remembered so the wasted attempt happens once.

   ── WHAT THIS IS NOT ───────────────────────────────────────────────────
   It is NOT a circuit lookup and must never be shown as one. Grid Atlas
   answers "what transmission and substations are near this point" from
   national data. A hosting-capacity layer answers "how many kW can this
   feeder still take", which is a utility's own number for one wire. Both
   matter, neither substitutes, and presenting the first as the second is how
   a site gets sized against a transmission line it is not connected to.

   Console: OmegaGridAtlas.run({lat, lng, address})
            OmegaGridAtlas.network({lat, lng})   → /api/network-proximity
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  if (root.OmegaGridAtlas) return;

  var LS_WORKED = 'omega.gridatlas.worked';
  var LS_FORCED = 'omega.gridatlas.service';

  function lsGet(k) { try { return root.localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function lsSet(k, v) { try { root.localStorage.setItem(k, v); } catch (e) {} }

  function cfgUrl() {
    try { return (((root.CLEARSKY_CONFIG || {}).portfolio || {}).gridAtlas || {}).serviceUrl || ''; }
    catch (e) { return ''; }
  }

  /* Cheapest first, then the hosts the function is actually deployed on. */
  function candidates() {
    var forced = lsGet(LS_FORCED);
    if (forced) return [forced];
    var out = [], worked = lsGet(LS_WORKED);
    if (worked) out.push(worked);
  /* omega-core serves /api/grid-atlas itself (verified 2026-09-14), so the
     same-origin candidate answers and nothing below it is ever reached. The
     old fallback hosts are kept OUT deliberately: tools.csebuilders.com and
     clearsky-portal.vercel.app both 404 this route, and osa.clearskyomega.com
     answers it from the legacy Vercel project — a silent cross-origin call
     into a build that is not this one. A dead list that looks like resilience
     is worse than no list. */
    ['/api/grid-atlas',
     cfgUrl()
    ].forEach(function (u) { if (u && out.indexOf(u) < 0) out.push(u); });
    return out;
  }

  /* Resolves the service's JSON, or rejects with a message worth showing.
     A caller that already has coordinates should send them: the service's
     geocoding step is most of its complexity and the source of its
     "location is approximate" findings, and a point off a map does not
     need it. */
  function run(site, opts) {
    opts = opts || {};
    var body = {
      lat: site && site.lat != null ? +site.lat : null,
      lng: site && site.lng != null ? +site.lng : null,
      address: (site && site.address) || '',
      sizeMw: site && site.sizeMw != null ? +site.sizeMw : 0
    };
    if (body.lat == null && !body.address)
      return Promise.reject(new Error('No coordinates and no address — nothing to look up.'));

    var list = candidates(), i = 0, lastErr = null;

    function attempt() {
      if (i >= list.length) {
        return Promise.reject(new Error(
          'Grid Atlas did not answer on any known host' +
          (lastErr ? ' (' + lastErr + ')' : '') +
          '. If api/grid-atlas.js is deployed here it should have been the first try.'));
      }
      var url = list[i++];
      var ctl = null, timer = null;
      try {
        ctl = new AbortController();
        timer = setTimeout(function () { try { ctl.abort(); } catch (e) {} },
                           opts.timeoutMs || 25000);
      } catch (e) {}
      return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctl ? ctl.signal : undefined
      }).then(function (r) {
        if (timer) clearTimeout(timer);
        if (!r.ok) { lastErr = url + ' returned ' + r.status; return attempt(); }
        return r.json().then(function (j) {
          /* A 200 carrying no score is a degraded answer, not a working one.
             Treated as a failure of THIS host so the next is tried, rather
             than returned as an empty result the caller has to re-check. */
          if (!j || (j.score == null && !(j.substations || []).length)) {
            lastErr = url + ' answered with nothing usable';
            return attempt();
          }
          lsSet(LS_WORKED, url);
          j._endpoint = url;
          return j;
        });
      })['catch'](function (e) {
        if (timer) clearTimeout(timer);
        lastErr = url + ' ' + ((e && e.name === 'AbortError') ? 'timed out'
                               : ((e && e.message) || 'failed'));
        return attempt();
      });
    }
    return attempt();
  }

  /* Nearest substation and the highest voltage seen, which is what a screen
     actually reads off this. Returns nulls rather than guesses. */
  function summarise(res) {
    if (!res) return null;
    var subs = res.substations || [], lines = res.lines || [];
    function kvOf(o) {
      var v = o && (o.voltageKv != null ? o.voltageKv
                  : o.MAX_VOLT != null ? o.MAX_VOLT
                  : o.VOLTAGE != null ? o.VOLTAGE : null);
      v = +v;
      return isFinite(v) && v > 0 ? v : null;
    }
    var nearest = null;
    subs.forEach(function (s) {
      if (s && s.distanceKm != null && (!nearest || s.distanceKm < nearest.distanceKm)) nearest = s;
    });
    var maxKv = null;
    subs.concat(lines).forEach(function (o) {
      var v = kvOf(o); if (v != null && (maxKv == null || v > maxKv)) maxKv = v;
    });
    return {
      score: res.score == null ? null : res.score,
      nearestSubKm: nearest && nearest.distanceKm != null ? nearest.distanceKm : null,
      nearestSubName: nearest ? (nearest.name || nearest.NAME || '') : '',
      maxKv: maxKv,
      substations: subs.length,
      lines: lines.length,
      findings: res.findings || [],
      endpoint: res._endpoint || ''
    };
  }

  /* ── NETWORK PROXIMITY — the fiber half of the same question ──────────
     /api/network-proximity is the sibling of /api/grid-atlas: same shape of
     request, same-origin, and it is where the fiber score, the verdict and
     the lateral estimate are computed. It REQUIRES the signed-in user's ID
     token — PeeringDB, the FCC key and the ArcGIS harvest all run behind
     it — so this reads the token off whatever Firebase session the page
     has and refuses cleanly when there is none, instead of a 401 nobody
     can interpret.

     The editor used to answer this from a static PeeringDB snapshot pasted
     into editor.html and a constant that lived inside a wrapped block; the
     button died on "PDB_ROUTE_FACTOR is not defined". Route factor and
     µs/km now come back IN the response, so the page prints what the
     service used rather than what it remembers. */
  function idToken() {
    var u = null;
    try { u = root._currentUser || (root.firebase && root.firebase.auth && root.firebase.auth().currentUser); } catch (e) {}
    if (!u || typeof u.getIdToken !== 'function') return Promise.resolve(null);
    return u.getIdToken().then(null, function () { return null; });
  }
  function network(site, opts) {
    opts = opts || {};
    var body = { lat: site && site.lat != null ? +site.lat : null,
                 lng: site && site.lng != null ? +site.lng : (site && site.lon != null ? +site.lon : null) };
    /* Optional site boundary. When the editor can anchor the parcel to the
       world it sends the ring, and the service measures fiber from the site
       EDGE instead of its centre — on a 200-acre parcel those differ by half
       a mile, and the edge is the one a lateral is built to. When it cannot,
       it sends nothing and the response says the measurement was from the
       point. It is never silently substituted. */
    if (site && site.boundary) body.boundary = site.boundary;
    if (opts.requestedCapacityGbps != null && isFinite(+opts.requestedCapacityGbps))
      body.requestedCapacityGbps = +opts.requestedCapacityGbps;
    if (body.lat == null || body.lng == null || !isFinite(body.lat) || !isFinite(body.lng))
      return Promise.reject(new Error('No coordinates \u2014 place or lock the satellite view first.'));
    return idToken().then(function (tok) {
      if (!tok) throw new Error('Sign in to run Network Proximity \u2014 the fiber sources are behind your account.');
      var ctl = null, timer = null;
      try {
        ctl = new AbortController();
        timer = setTimeout(function () { try { ctl.abort(); } catch (e) {} }, opts.timeoutMs || 55000);
      } catch (e) {}
      return fetch(opts.url || '/api/network-proximity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok },
        body: JSON.stringify(body),
        signal: ctl ? ctl.signal : undefined
      }).then(function (r) {
        if (timer) clearTimeout(timer);
        return r.json().then(null, function () { return {}; }).then(function (j) {
          if (!r.ok) throw new Error((j && (j.error || j.detail)) || ('Network Proximity returned ' + r.status));
          if (!j || !j.fiber) throw new Error('Network Proximity answered with nothing usable.');
          return j;
        });
      })['catch'](function (e) {
        if (timer) clearTimeout(timer);
        if (e && e.name === 'AbortError') throw new Error('Network Proximity timed out \u2014 the sources took longer than ' + Math.round((opts.timeoutMs || 55000) / 1000) + ' s.');
        throw e;
      });
    });
  }

  root.OmegaGridAtlas = {
    run: run,
    network: network,
    summarise: summarise,
    candidates: candidates,
    setService: function (u) { lsSet(LS_FORCED, u || ''); return u; },
    VERSION: 'grid-atlas-client/1.1'
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.OmegaGridAtlas;
})(typeof window !== 'undefined' ? window : globalThis);
