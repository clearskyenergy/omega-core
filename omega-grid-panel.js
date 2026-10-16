/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
/* ==========================================================================
   omega-grid-panel.js  ·  Site Map's Grid panel
   --------------------------------------------------------------------------
   Grid Atlas built into the editor (docs/GUIDED-SITE-FLOW.md, 2026-10-16,
   Tommy: "that's how the Grid Atlas should work, and we should have the
   Grid Atlas built into the editor"). For THIS site, in one side panel over
   the map the drawing is on:

     1. the site point (the map the project is on) and the unit chosen in
        the BESS Guided Build — nothing typed;
     2. the nearest substation as ONE card with a verdict chip, from the
        Grid Atlas SERVICE the Analyze tab's pre-screen already calls
        (OmegaGridPrescreen, /api/grid-atlas) — never a second lookup;
     3. the circuit at the parcel from the utility's own hosting map,
        through omega-comed-layers.js probePoint (the module the Site Finder
        and the ComEd map draw from), stated NET of the queued DER first;
     4. the verdict — Fits / Fits only smaller / Needs a study — from
        POST /api/grid-verdict: eligibility logic stays on the server;
     5. grid.substation, grid.circuit and grid.verdict written onto S.grid,
        which saveProject() carries in its allowlist with savedBy.

   This file holds no threshold, curve or voltage class: it sends figures
   and draws the answer. The standalone grid-atlas.html and the Site Finder
   stay for prospecting many sites at once.

   ES5 only. Depends on the editor's globals (S, omegaGeo, BESS_CATALOG,
   saveProject, _setSaved) through typeof guards, OmegaGridPrescreen, and
   OmegaComEdLayers (no Leaflet needed: probePoint draws nothing).
   ========================================================================== */
(function (root) {
  'use strict';

  var TAG = '[Grid panel]';
  var ST = { busy: false, sub: null, probe: null, pick: 0, answer: null, err: '', site: null, unit: null };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function kw(n) { return n == null ? '—' : Math.round(n).toLocaleString('en-US') + ' kW'; }
  function S0() { return (typeof S !== 'undefined' && S) ? S : (root.S || null); }

  /* ── what the project already knows ─────────────────────────────── */
  function site() {
    var s = null;
    try { if (root.OmegaGridPrescreen && OmegaGridPrescreen.site) s = OmegaGridPrescreen.site(); } catch (e) {}
    if (!s || s.lat == null) {
      try { var g = root.omegaGeo ? root.omegaGeo() : null; if (g && isFinite(+g.lat) && +g.lat !== 0) s = { lat: +g.lat, lng: +g.lng, address: '' }; } catch (e) {}
    }
    return s && s.lat != null ? { lat: +s.lat, lng: +s.lng, address: s.address || '' } : null;
  }

  /* The battery the Guided Build placed (S.bessList, kW × quantity), else
     the model picked in the BESS Config list. Its own name, never typed. */
  function unit() {
    var st = S0(), list = (st && Array.isArray(st.bessList)) ? st.bessList : [], kwSum = 0, kwhSum = 0, names = [], i, b, q;
    for (i = 0; i < list.length; i++) {
      b = list[i] || {}; q = +b.qty || 1;
      if (+b.kw > 0) kwSum += +b.kw * q;
      if (+b.kwh > 0) kwhSum += +b.kwh * q;
      var nm = [b.mfr, b.model].filter(Boolean).join(' ') || b.name || '';
      if (nm && names.indexOf(nm) < 0) names.push(nm + (q > 1 ? ' ×' + q : ''));
    }
    if (kwSum > 0) return { kw: kwSum, kwh: kwhSum || null, name: names.join(', '), from: 'placed' };
    try {
      var sel = document.getElementById('bm-catalog'), key = sel && sel.value;
      var cat = key && root.BESS_CATALOG ? root.BESS_CATALOG[key] : (key && typeof BESS_CATALOG !== 'undefined' ? BESS_CATALOG[key] : null);
      if (cat && +cat.kw > 0) return { kw: +cat.kw, kwh: +cat.kwh || null, name: [cat.mfr, cat.model].filter(Boolean).join(' ') || key, from: 'chosen' };
    } catch (e) {}
    return null;
  }

  /* ── the substation: the Grid Atlas service's nearest ───────────── */
  function samePoint(g, s) { return g && s && g.lat != null && Math.abs(+g.lat - s.lat) < 1e-5 && Math.abs(+g.lng - s.lng) < 1e-5; }
  function subFrom(g) {
    var x = g && g.substations && g.substations[0];
    if (!x) return null;
    return { name: x.name || 'Substation', kv: x.voltageKv == null ? null : +x.voltageKv,
             km: x.distanceKm == null ? null : +x.distanceKm, owner: x.owner || '', source: 'grid-atlas-service' };
  }
  function substation(s, cb) {
    var st = S0();
    if (st && st.grid && samePoint(st.grid, s) && st.grid.substations) return cb(subFrom(st.grid));
    var P = root.OmegaGridPrescreen;
    if (!P || !P.run) return cb(null, 'The Grid Atlas service did not load.');
    P.run(function (j, err) {
      if (!j) return cb(null, err || 'Grid Atlas did not answer.');
      try { P.saveToProject(j); P.feedSiteScore(j); } catch (e) {}
      cb(subFrom(j));
    });
  }

  /* ── the circuit: the utility's own map at the parcel ───────────── */
  function circuit(s, cb) {
    var C = root.OmegaComEdLayers;
    if (!C || !C.probePoint) return cb({ none: 'The hosting-capacity module did not load.' });
    var t = C.territoryAt ? C.territoryAt(s.lat, s.lng) : null;
    if (!t || !t.hasMap) return cb({ none: 'No utility hosting map is read for this location yet (ComEd today).' });
    C.probePoint(s.lat, s.lng, function (err, r) {
      if (err || !r) return cb({ none: 'The hosting map did not answer: ' + ((err && err.message) || 'no reply') });
      if (r.blocked) return cb({ none: 'The utility’s map refused the request (its monthly service name may have rotated).', r: r });
      if (!r.rows || !r.rows.length) return cb({ none: r.serviceFailed ? 'The hosting map could not be reached.' : 'No circuit is published at this point.', r: r });
      r.utility = t.name || 'ComEd';
      cb(r);
    });
  }
  function circuitBody(r, i) {
    var row = r && r.rows ? r.rows[i || 0] : null;
    if (!row) return null;
    return { utility: r.utility, id: row.feeder || '', substation: row.sub || '',
             publishedKw: row.bess, queuedKw: row.queue || 0,
             addressResolved: !!r.addressResolved, grain: r.grain || '' };
  }

  /* ── the verdict: on the server ─────────────────────────────────── */
  function token() {
    try { var u = root.firebase && firebase.auth && firebase.auth().currentUser; if (u) return u.getIdToken(); } catch (e) {}
    return Promise.reject(new Error('Sign in to check the grid.'));
  }
  function verdict(body) {
    return token().then(function (t) {
      return fetch('/api/grid-verdict', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t }, body: JSON.stringify(body) });
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (j) {
        if (!res.ok) throw new Error(j.error || ('The grid verdict returned ' + res.status));
        return j;
      });
    });
  }

  /* ── onto the project (saveProject's allowlist carries S.grid) ──── */
  function stamp() { return new Date().toISOString(); }
  function record(a) {
    var st = S0(); if (!st || !a) return;
    var at = stamp(), s = ST.site;
    st.grid = st.grid && samePoint(st.grid, s) ? st.grid : { lat: s.lat, lng: s.lng };
    if (st.grid.lat == null) { st.grid.lat = s.lat; st.grid.lng = s.lng; }
    st.grid.substation = a.substation ? { name: a.substation.name, kv: a.substation.kv, miles: a.substation.miles, km: a.substation.km,
      chip: a.substation.chip, state: a.substation.state, source: 'grid-atlas-service' } : null;
    var c = a.circuit || {}, r = ST.probe && ST.probe.rows ? ST.probe : null;
    st.grid.circuit = c.publishedKw != null || c.id ? { utility: c.utility || '', id: c.id || '', substation: c.substation || '',
      publishedKw: c.publishedKw, queuedKw: c.queuedKw, netKw: c.netKw, headroomKw: c.headroomKw,
      addressResolved: !!c.addressResolved, grain: c.grain || '', at: at,
      source: r ? ('comed-hosting-capacity layer ' + r.layerId + (r.rows[ST.pick] && r.rows[ST.pick].refreshed ? ' · queue ' + r.rows[ST.pick].refreshed : '')) : '' } : null;
    st.grid.verdict = { key: a.verdict.key, label: a.verdict.label, say: a.verdict.say, unitKw: a.unit && a.unit.kw, unitName: a.unit && a.unit.name,
      version: a.version, at: at };
    try { if (typeof root._setSaved === 'function') root._setSaved('unsaved'); else if (typeof _setSaved === 'function') _setSaved('unsaved'); } catch (e) {}
  }

  /* ── the panel ──────────────────────────────────────────────────── */
  var COL = { good: '#16A34A', ok: '#D97706', risk: '#DC2626', fits: '#16A34A', smaller: '#D97706', study: '#DC2626', unsized: '#64748B' };
  function chip(state, text) {
    var c = COL[state] || '#64748B';
    return '<span style="display:inline-block;padding:3px 9px;border-radius:999px;font-size:11px;font-weight:700;color:#fff;background:' + c + '">' + esc(text) + '</span>';
  }
  function row(k, v, sub) {
    return '<div style="display:flex;justify-content:space-between;gap:10px;padding:5px 0;border-top:1px solid var(--border,#e5e7eb);font-size:12px">' +
      '<span style="color:var(--sub,#64748B)">' + esc(k) + '</span><span style="text-align:right;color:var(--text,#111);font-weight:600">' + v +
      (sub ? '<br><span style="font-weight:400;color:var(--sub,#64748B);font-size:10.5px">' + esc(sub) + '</span>' : '') + '</span></div>';
  }
  function card(title, inner) {
    return '<div style="border:1px solid var(--border,#e5e7eb);border-radius:10px;padding:12px;margin:10px 0;background:var(--surface,#fff)">' +
      '<div style="font-size:10px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;color:var(--amber,#B45309);margin-bottom:6px">' + esc(title) + '</div>' + inner + '</div>';
  }
  function host() {
    var el = document.getElementById('omega-grid-panel');
    if (el) return el;
    el = document.createElement('aside');
    el.id = 'omega-grid-panel';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Grid');
    el.style.cssText = 'position:fixed;top:96px;right:12px;width:min(380px,calc(100vw - 32px));max-height:calc(100vh - 120px);overflow:auto;' +
      'z-index:9500;background:var(--bg,#f8fafc);color:var(--text,#111);border:1px solid var(--border,#e5e7eb);border-radius:12px;' +
      'box-shadow:0 12px 40px rgba(0,0,0,.25);padding:14px 16px;font-family:inherit';
    document.body.appendChild(el);
    el.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
    return el;
  }
  function close() { var el = document.getElementById('omega-grid-panel'); if (el) el.remove(); }

  function paint() {
    var el = host(), h = '', a = ST.answer;
    h += '<div style="display:flex;justify-content:space-between;align-items:center">' +
      '<div><div style="font-size:10px;font-weight:800;letter-spacing:1.6px;color:var(--amber,#B45309);text-transform:uppercase">Grid</div>' +
      '<div style="font-size:15px;font-weight:700">Is the grid here for this unit?</div></div>' +
      '<button type="button" data-gp="close" aria-label="Close" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--sub,#64748B)">×</button></div>';
    h += '<div style="font-size:11px;color:var(--sub,#64748B);margin-top:4px">' +
      (ST.site ? esc(ST.site.address || (ST.site.lat.toFixed(5) + ', ' + ST.site.lng.toFixed(5))) : 'No site point yet') + ' · ' +
      (ST.unit ? esc(ST.unit.name || 'Battery') + ' · ' + kw(ST.unit.kw) : 'no unit chosen in the BESS Guided Build') + '</div>';
    if (ST.err) h += '<div style="margin-top:10px;padding:10px;border-radius:8px;background:rgba(220,38,38,.08);color:#B91C1C;font-size:12px">' + esc(ST.err) + '</div>';
    if (ST.busy) h += '<div style="padding:22px 0;text-align:center;color:var(--sub,#64748B);font-size:12px">Reading the substation and the circuit…</div>';

    if (a) {
      h += '<div style="margin-top:12px;padding:12px;border-radius:10px;background:' + (COL[a.verdict.key] || '#64748B') + '14;border:1px solid ' + (COL[a.verdict.key] || '#64748B') + '55">' +
        chip(a.verdict.key, a.verdict.label) + '<div style="font-size:12.5px;line-height:1.55;margin-top:8px">' + esc(a.verdict.say) + '</div></div>';
      var sb = a.substation;
      h += card('Nearest substation', sb
        ? '<div style="font-size:14px;font-weight:700">' + esc(sb.name) + '</div><div style="margin:6px 0">' + chip(sb.state, sb.chip) + '</div>' +
          row('Voltage', sb.kv == null ? 'not on record' : esc(sb.kv) + ' kV') +
          row('Distance', sb.miles == null ? '—' : esc(sb.miles) + ' mi', sb.km == null ? '' : sb.km + ' km, straight line') +
          '<div style="font-size:11px;color:var(--sub,#64748B);margin-top:6px">' + esc(sb.why) + '</div>'
        : '<div style="font-size:12px;color:var(--sub,#64748B)">' + esc(ST.subErr || 'Grid Atlas found no substation near this point.') + '</div>');
      var c = a.circuit || {};
      var circInner = '';
      if (c.publishedKw != null) {
        circInner += '<div style="font-size:14px;font-weight:700">' + esc(c.utility || '') + ' ' + esc(c.id ? 'circuit ' + c.id : 'circuit') + '</div>' +
          (c.substation ? '<div style="font-size:11px;color:var(--sub,#64748B)">out of ' + esc(c.substation) + '</div>' : '') +
          '<div style="font-size:26px;font-weight:800;margin:8px 0 2px">' + kw(c.netKw) + '</div>' +
          '<div style="font-size:11px;color:var(--sub,#64748B);margin-bottom:6px">room left after the queue (net)</div>' +
          row('Published hosting', kw(c.publishedKw), 'the utility’s headline, gross of the queue') +
          row('Queued DER on the feeder', '− ' + kw(c.queuedKw), 'subtracted here; the utility does not') +
          row('Room left', kw(c.netKw)) +
          row('Headroom after this unit', c.headroomKw == null ? '—' : (c.headroomKw < 0 ? '− ' + kw(-c.headroomKw) : kw(c.headroomKw)));
        var r = ST.probe;
        if (r && r.rows && r.rows.length > 1) {
          circInner += '<label style="display:block;font-size:11px;color:var(--sub,#64748B);margin-top:8px">' + r.rows.length + ' circuits at this point' +
            '<select data-gp="pick" style="display:block;width:100%;margin-top:4px;padding:5px;font-size:12px">' +
            r.rows.map(function (x, i) { return '<option value="' + i + '"' + (i === ST.pick ? ' selected' : '') + '>' + esc((x.feeder || 'circuit ' + (i + 1)) + ' · ' + kw(isNaN(x.bess) || x.bess == null ? null : Math.max(0, x.bess - (x.queue || 0))) + ' net') + '</option>'; }).join('') +
            '</select></label>';
        }
        if (r) {
          circInner += '<details style="margin-top:8px;font-size:11px;color:var(--sub,#64748B)"><summary style="cursor:pointer">Where this came from</summary>' +
            '<div style="margin-top:4px;line-height:1.6">Layer ' + esc(r.layerId) + ' · ' + esc(r.grain || '') + (r.addressResolved ? ' (resolved at the address)' : ' (best circuit in the block)') +
            '<br>Queue: the feeder’s DER in queue (Feeder_Q)' + (r.rows[ST.pick] && r.rows[ST.pick].refreshed ? ', refreshed ' + esc(r.rows[ST.pick].refreshed) : '') +
            '<br><span style="font-family:monospace;font-size:10px;word-break:break-all">' + esc(((root.OmegaComEdLayers && OmegaComEdLayers.diag ? OmegaComEdLayers.diag() : []).slice(-8)).join('\n')) + '</span></div></details>';
        }
      } else {
        circInner = '<div style="font-size:12px;color:var(--sub,#64748B)">' + esc(ST.circErr || c.say || 'No circuit answered at this point.') + '</div>';
      }
      h += card('Circuit at the parcel', circInner);
      h += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">' +
        '<button type="button" data-gp="save" style="flex:1;background:#B45309;color:#FFF7E6;border:none;border-radius:8px;padding:9px 12px;font-weight:700;cursor:pointer">Save to project</button>' +
        '<button type="button" data-gp="rerun" style="background:var(--surface,#fff);color:var(--text,#111);border:1px solid var(--border,#e5e7eb);border-radius:8px;padding:9px 12px;cursor:pointer">Check again</button>' +
        '<a data-gp="atlas" href="' + esc(atlasHref()) + '" target="_blank" rel="noopener" style="align-self:center;font-size:11.5px;color:var(--amber,#B45309)">Open Grid Atlas</a></div>' +
        (ST.saved ? '<div style="font-size:11px;color:#16A34A;margin-top:6px">' + esc(ST.saved) + '</div>' : '');
    } else if (!ST.busy && !ST.err) {
      h += '<div style="padding:16px 0;font-size:12px;color:var(--sub,#64748B)">Place the site on the map, then check again.</div>';
    }
    el.innerHTML = h;
    wire(el);
  }
  function atlasHref() {
    var s = ST.site, q = s ? ('?q=' + encodeURIComponent(s.address || '') + '&at=' + s.lat.toFixed(5) + ',' + s.lng.toFixed(5)) : '';
    return '/grid-atlas.html' + q;
  }
  function wire(el) {
    var b = el.querySelector('[data-gp="close"]'); if (b) b.onclick = close;
    b = el.querySelector('[data-gp="rerun"]'); if (b) b.onclick = function () { run(true); };
    b = el.querySelector('[data-gp="pick"]'); if (b) b.onchange = function () { ST.pick = +this.value || 0; judge(); };
    b = el.querySelector('[data-gp="save"]'); if (b) b.onclick = save;
  }
  function save() {
    record(ST.answer);
    var fn = root.saveProject || (typeof saveProject === 'function' ? saveProject : null);
    if (!fn) { ST.saved = 'Recorded on the project; save it to keep it.'; paint(); return; }
    ST.saved = 'Saving…'; paint();
    Promise.resolve().then(function () { return fn(); }).then(function () { ST.saved = 'Saved onto the project.'; paint(); },
      function (e) { ST.saved = ''; ST.err = 'The save did not go through: ' + ((e && e.message) || e); paint(); });
  }

  function judge() {
    var body = { unit: ST.unit ? { kw: ST.unit.kw, kwh: ST.unit.kwh, name: ST.unit.name } : null,
                 substation: ST.sub, circuit: ST.probe && ST.probe.rows ? circuitBody(ST.probe, ST.pick) : null };
    ST.busy = true; paint();
    return verdict(body).then(function (a) {
      ST.busy = false; ST.answer = a; ST.err = '';
      record(a);
      paint();
      return a;
    }, function (e) { ST.busy = false; ST.err = (e && e.message) || String(e); paint(); });
  }

  function run(force) {
    if (ST.busy) return;
    ST.site = site(); ST.unit = unit(); ST.err = ''; ST.saved = ''; ST.answer = null; ST.pick = 0;
    ST.subErr = ''; ST.circErr = '';
    if (!ST.site) { ST.err = 'This project has no site point yet. Find the address or lock the map first.'; paint(); return; }
    if (force) { var st = S0(); if (st && st.grid && samePoint(st.grid, ST.site)) { try { delete st.grid.substations; } catch (e) {} } }
    ST.busy = true; paint();
    var left = 2;
    function done() { if (--left) return; ST.busy = false; judge(); }
    substation(ST.site, function (s, err) { ST.sub = s; ST.subErr = err || ''; done(); });
    circuit(ST.site, function (r) { ST.probe = r && r.rows ? r : null; ST.circErr = r && r.none ? r.none : ''; done(); });
  }

  function open() { host(); run(false); }

  /* ── the ribbon button: beside Grid Atlas, so it rides that button's
     group and cap (api/_lib/modules.js IDS.gridatlas names it). ─────── */
  function inject() {
    if (document.getElementById('rb-grid-panel')) return true;
    var ga = document.getElementById('rb-gridatlas');
    if (!ga || !ga.parentNode) return false;
    var b = document.createElement('button');
    b.className = ga.className || 'rbtn';
    b.id = 'rb-grid-panel';
    b.setAttribute('onclick', 'OmegaGridPanel.open()');
    b.title = 'Grid — the nearest substation and the circuit at the parcel, stated against the unit chosen in the BESS Guided Build: Fits, Fits only smaller or Needs a study';
    b.innerHTML = '<span class="rb-ico">⚡</span><span class="rb-lbl">Grid<br>Check</span>';
    ga.parentNode.insertBefore(b, ga.nextSibling);
    return true;
  }
  function boot() {
    var n = 0, iv = setInterval(function () { if (inject() || ++n > 80) clearInterval(iv); }, 250);
  }

  root.OmegaGridPanel = { open: open, close: close, run: run, site: site, unit: unit, last: function () { return ST.answer; },
                          _t: { circuitBody: circuitBody, record: record, ST: ST } };
  if (typeof document === 'undefined') return;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  if (root.console && console.info) console.info(TAG + ' ready — Analyze › Grid Check, or OmegaGridPanel.open()');
})(typeof window !== 'undefined' ? window : this);
