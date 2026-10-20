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
     3. the serving utility and the circuit at the parcel from the national
        door Omega Prime asks (2026-10-17, Tommy: "it should not just run
        comed information if its outside of comed it needs to look via api
        for the utility details"): POST /api/hosting-capacity through
        omega-grid-verdict.js GV.hosting, with the site point, the unit and
        that substation. The server names the utility at the point, reads
        its PUBLISHED hosting capacity where one exists, nets the queue
        where the utility publishes one beside a gross figure, and where
        nothing is published says so in its own words and hands back the
        utility's own map. Every coverage case is drawn the way Omega
        Prime's circuit step draws it;
     4. the verdict — Fits / Fits only smaller / Needs a study, and the
        substation's chip — in the same answer, from the one engine
        (api/_lib/grid-verdict.js, which /api/grid-verdict runs too);
     5. grid.substation, grid.circuit and grid.verdict written onto S.grid
        through GV.fromHosting (the one record shape), which saveProject()
        carries in its allowlist with savedBy.

   This file holds no threshold, curve, voltage class, registry URL, field
   name or utility's name: it sends the point, the unit and the substation
   and draws the answer. The standalone grid-atlas.html and the Site Finder
   stay for prospecting many sites at once.

   ES5 only. Depends on the editor's globals (S, omegaGeo, BESS_CATALOG,
   saveProject, _setSaved) through typeof guards, OmegaGridPrescreen and
   OmegaGridVerdict.
   ========================================================================== */
(function (root) {
  'use strict';

  var TAG = '[Grid panel]';
  var ST = { busy: false, site: null, unit: null, sub: null, subErr: '', res: null, answer: null, err: '', circErr: '', saved: '' };

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

  /* ── the utility and the circuit: the national door ─────────────────
     ONE question, through the ONE client Omega Prime asks with: whose wire
     is it at this point, what does that utility publish as the room on it,
     and does this unit fit? The substation rides along so its chip and its
     caution are judged in the same answer. */
  function V() { return root.OmegaGridVerdict; }
  function circuit(s, cb) {
    var G = V();
    if (!G || !G.hosting) return cb(null, 'The grid verdict client did not load. Reload the page.');
    var u = ST.unit, b = ST.sub;
    G.hosting({ lat: s.lat, lng: s.lng, unit: u ? { kw: u.kw, kwh: u.kwh, name: u.name } : null,
                substation: b ? { name: b.name, kv: b.kv, km: b.km } : null, mode: 'storage' })
      .then(function (res) {
        if (!res || !res.verdict || !res.verdict.verdict) return cb(null, 'The hosting capacity check returned no verdict.');
        cb(res);
      }, function (e) { cb(null, (e && e.message) || String(e)); });
  }

  /* ── onto the project (saveProject's allowlist carries S.grid) ──── */
  function record(res) {
    var st = S0(), G = V(), s = ST.site;
    if (!st || !res || !s || !G || !G.fromHosting) return;
    var f = G.fromHosting(res);
    if (!f) return;
    st.grid = st.grid && samePoint(st.grid, s) ? st.grid : { lat: s.lat, lng: s.lng };
    if (st.grid.lat == null) { st.grid.lat = s.lat; st.grid.lng = s.lng; }
    st.grid.substation = f.substation; st.grid.circuit = f.circuit; st.grid.verdict = f.verdict;
    try { if (typeof root._setSaved === 'function') root._setSaved('unsaved'); else if (typeof _setSaved === 'function') _setSaved('unsaved'); } catch (e) {}
  }

  /* ── the panel ──────────────────────────────────────────────────── */
  var COL = { good: '#16A34A', ok: '#D97706', risk: '#DC2626', fits: '#16A34A', smaller: '#D97706', study: '#DC2626', unsized: '#64748B' };
  var SUBTLE = 'font-size:11px;color:var(--sub,#64748B)';
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
  function line(text) { return '<div style="' + SUBTLE + ';margin-top:6px;line-height:1.5">' + esc(text) + '</div>'; }
  function heading(text) {
    return '<div style="font-size:10px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:var(--sub,#64748B);margin-top:10px">' + esc(text) + '</div>';
  }
  function safeHref(u) { return /^https:\/\/[^\s"'<>]+$/i.test(String(u || '')) ? String(u) : ''; }
  function who(res) { return res && res.utility && res.utility.display ? res.utility.display : 'The serving utility'; }
  function bestOf(res) { return res && res.circuits && res.best != null ? res.circuits[res.best] || null : null; }

  function verdictBox(a) {
    var c = COL[a.verdict.key] || '#64748B';
    return '<div style="margin-top:12px;padding:12px;border-radius:10px;background:' + c + '14;border:1px solid ' + c + '55">' +
      chip(a.verdict.key, a.verdict.label) + '<div style="font-size:12.5px;line-height:1.55;margin-top:8px">' + esc(a.verdict.say) + '</div></div>';
  }

  /* the server's judged substation (chip and why) when the door answered;
     the Grid Atlas measurement alone when it did not */
  function substationCard(sb) {
    var raw = !sb ? ST.sub : null, inner;
    if (sb) {
      inner = '<div style="font-size:14px;font-weight:700">' + esc(sb.name) + '</div><div style="margin:6px 0">' + chip(sb.state, sb.chip) + '</div>' +
        row('Voltage', sb.kv == null ? 'not on record' : esc(sb.kv) + ' kV') +
        row('Distance', sb.miles == null ? '—' : esc(sb.miles) + ' mi', sb.km == null ? '' : sb.km + ' km, straight line') +
        '<div style="' + SUBTLE + ';margin-top:6px">' + esc(sb.why) + '</div>';
    } else if (raw) {
      inner = '<div style="font-size:14px;font-weight:700">' + esc(raw.name) + '</div>' +
        row('Voltage', raw.kv == null ? 'not on record' : esc(raw.kv) + ' kV') +
        row('Distance', raw.km == null ? '—' : esc(raw.km) + ' km', 'straight line');
    } else {
      inner = '<div style="font-size:12px;color:var(--sub,#64748B)">' + esc(ST.subErr || 'Grid Atlas found no substation near this point.') + '</div>';
    }
    return card('Nearest substation', inner);
  }

  /* The serving utility, named from the answer. More than one utility on
     the territory maps: every one named, plainly, and the bill decides. */
  function candidates(res) {
    var t = res.territory;
    if (!t || t.confident || !t.candidates || t.candidates.length < 2) return '';
    var chosen = res.utility && res.utility.eiaId;
    return '<div style="margin-top:8px;font-size:11.5px;line-height:1.5;border:1px solid var(--border,#e5e7eb);border-radius:8px;padding:8px 10px">' +
      '<b>More than one utility is mapped at this point.</b><ul style="margin:4px 0 4px 18px;padding:0">' + t.candidates.map(function (c) {
        return '<li>' + esc(c.display || c.name) + (c.eiaId && c.eiaId === chosen ? ' — the one read here' : '') +
          (c.weak ? ' <span style="color:var(--sub,#64748B)">(' + esc(c.why || 'a weak match') + ')</span>' : '') + '</li>';
      }).join('') + '</ul>Confirm the utility with the customer’s bill.</div>';
  }
  function verifyLink(res) {
    var u = res.verify && safeHref(res.verify.viewerUrl);
    return u ? '<a data-gp="verify" href="' + esc(u) + '" target="_blank" rel="noopener" style="display:inline-block;margin-top:8px;font-size:11.5px;font-weight:600;color:var(--amber,#B45309)">Check it on ' +
      esc(res.verify.label || (who(res) + '’s map')) + ' ↗</a>' : '';
  }
  function utilityCard(res) {
    var m = V() && V().COVERAGE, words = (m && m[res.coverage]) || res.coverage || '';
    if (!res.utility && res.coverage === 'outside') words = '';
    return card('Serving utility', '<div style="font-size:14px;font-weight:700">' + esc(res.utility && res.utility.display ? res.utility.display : 'No utility on record') + '</div>' +
      (words ? '<div style="' + SUBTLE + '">' + esc(words) + '</div>' : '') + candidates(res) + verifyLink(res));
  }

  /* The queue words follow the answer, never one utility's habit: a queue
     published beside a gross figure is subtracted here; one the utility
     already netted out of its figure is shown and never subtracted twice;
     one not published with the figure is said so, never read as 0. */
  function queueWords(vc) {
    if (vc.queuedKw == null) return { net: 'room as published (no queue is published with it)', pub: 'the utility’s figure; no queue is published with it',
      q: 'not published', qSub: 'nothing subtracted', why: 'Queue: none is published with this figure, so nothing was subtracted.' };
    if (vc.queueNetted) return { net: 'room left, net of the queue as published', pub: 'the utility’s figure, already net of its queue',
      q: kw(vc.queuedKw), qSub: 'already in the published figure; not subtracted again',
      why: 'Queue: the utility publishes its figure net of the queue, so the queue is shown and not subtracted again.' };
    return { net: 'room left after the queue (net)', pub: 'the utility’s headline, gross of the queue',
      q: '− ' + kw(vc.queuedKw), qSub: 'subtracted here; the utility does not',
      why: 'Queue: the DER already queued on the feeder is subtracted here; the utility publishes its figure gross of it.' };
  }
  /* A one-sided figure for a battery says which side it is (the verdict's
     own sentence carries the server's words for it). */
  var SIDE = { gen: { label: ' (generation only)', sub: 'the export side only; not a storage figure' },
               load: { label: ' (load only)', sub: 'the charging side only; not a storage figure' } };

  /* where the power comes from: the circuit, its substation and voltage,
     and what the utility publishes upstream of it */
  function power(c) {
    if (!c) return '';
    var up = c.upstream || {}, out = '';
    function add(k, v) { if (v !== '' && v != null) out += row(k, esc(v)); }
    add('Circuit', [c.id, c.name && c.name !== c.id ? c.name : ''].filter(Boolean).join(' · '));
    add('Substation', c.substation || (ST.sub ? ST.sub.name + ' (nearest, Grid Atlas)' : ''));
    add('Voltage', c.kv != null ? c.kv + ' kV' : '');
    add('Upstream transformer', up.transformerKw != null ? kw(up.transformerKw) : '');
    add('Upstream bank', up.bankKw != null ? kw(up.bankKw) : '');
    add('Substation room', up.substationKw != null ? kw(up.substationKw) : '');
    add('Pricing node', up.pnode || '');
    add('Queued on the whole feeder', up.feederQueuedKw != null ? kw(up.feederQueuedKw) : '');
    add('From the point', c.distanceM != null ? Math.round(c.distanceM).toLocaleString('en-US') + ' m' : '');
    return out ? heading('Where the power comes from') + out : '';
  }

  /* where this came from: the source as the server names it, the grain,
     the queue rule, the circuits read, the territory layers and the
     door's own request log */
  function provenance(res, a, c) {
    var src = res.source || null, vc = (a && a.circuit) || {}, lines = [], log = res.tried || [];
    if (src) lines.push('Source: ' + [src.label, src.layer, src.refreshed ? 'refreshed ' + src.refreshed : ''].filter(Boolean).join(' · ') + '.');
    if (res.coverage === 'read' && vc.publishedKw != null) {
      if (vc.grain) lines.push('Grain: ' + vc.grain + (vc.addressResolved ? ', resolved at the parcel.' : ', the nearest published circuit, not confirmed for this parcel.'));
      lines.push(queueWords(vc).why);
    }
    if (res.coverage === 'read' && res.note) lines.push(res.note);
    if (c && c.notes && c.notes.length) lines.push('Notes: ' + c.notes.join('; ') + '.');
    if (res.circuits && res.circuits.length > 1) {
      lines.push('Circuits read here: ' + res.circuits.map(function (x) {
        return (x.id || 'unnamed') + ' · ' + (x.publishedKw == null ? 'no figure' : kw(x.publishedKw) + ' published') +
          (x.distanceM != null ? ' · ' + Math.round(x.distanceM).toLocaleString('en-US') + ' m' : '');
      }).join('; ') + '.');
    }
    if (res.territory && res.territory.source) lines.push('Utility named from: ' + res.territory.source + '.');
    if (a && a.version) lines.push('Verdict: OMEGA grid verdict (' + a.version + ').');
    if (!lines.length && !log.length) return '';
    return '<details style="margin-top:8px;font-size:11px;color:var(--sub,#64748B)"><summary style="cursor:pointer">Where this came from</summary>' +
      '<div style="margin-top:4px;line-height:1.6">' + lines.map(esc).join('<br>') + '</div>' +
      (log.length ? '<div data-gp="log" style="font-family:monospace;font-size:10px;word-break:break-all;margin-top:4px">' +
        log.map(function (x) { return esc(x.source + ' · ' + x.ms + ' ms · ' + x.outcome); }).join('<br>') + '</div>' : '') + '</details>';
  }

  function circuitCard(res, a) {
    var c = bestOf(res), vc = (a && a.circuit) || {}, h = '';
    if (res.coverage === 'read' && c && vc.publishedKw != null) {
      var q = queueWords(vc), side = SIDE[vc.basis] || null, band = vc.band || null;
      h += '<div style="font-size:14px;font-weight:700">' + esc(vc.utility || who(res)) + ' ' + esc(vc.id ? 'circuit ' + vc.id : 'circuit') + '</div>' +
        (vc.substation ? '<div style="' + SUBTLE + '">out of ' + esc(vc.substation) + '</div>' : '') +
        '<div style="font-size:26px;font-weight:800;margin:8px 0 2px">' + kw(vc.netKw) + '</div>' +
        '<div style="' + SUBTLE + ';margin-bottom:6px">' + esc(q.net) + '</div>' +
        row('Published hosting' + (side ? side.label : ''), band && band.text ? esc(band.text) : kw(vc.publishedKw),
            [band ? 'a published band, judged at its low end' : '', side ? side.sub : '', q.pub].filter(Boolean).join('; ')) +
        row('Queued DER on the feeder', esc(q.q), q.qSub) +
        row('Room left', kw(vc.netKw)) +
        row('Headroom after this unit', vc.headroomKw == null ? '—' : (vc.headroomKw < 0 ? '− ' + kw(-vc.headroomKw) : kw(vc.headroomKw)));
      if (res.circuits.length > 1) h += line(res.circuits.length + ' circuits answer at this point; the nearest with a published figure is judged.');
    } else if (res.coverage === 'read' && c) {
      h += '<div style="font-size:14px;font-weight:700">' + esc(who(res)) + ' ' + esc(c.id ? 'circuit ' + c.id : 'circuit') + '</div>' +
        line('No hosting figure is published for this circuit.');
    } else {
      h += '<div style="font-size:12px;line-height:1.55;color:var(--text,#111)">' + esc(res.note || 'Nothing is published at this point.') + '</div>';
    }
    return card('Circuit at the parcel', h + power(c) + provenance(res, a, c));
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

  function buttons(canSave) {
    return '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px">' +
      (canSave ? '<button type="button" data-gp="save" style="flex:1;background:#B45309;color:#FFF7E6;border:none;border-radius:8px;padding:9px 12px;font-weight:700;cursor:pointer">Save to project</button>' : '') +
      '<button type="button" data-gp="rerun" style="background:var(--surface,#fff);color:var(--text,#111);border:1px solid var(--border,#e5e7eb);border-radius:8px;padding:9px 12px;cursor:pointer">Check again</button>' +
      '<a data-gp="atlas" href="' + esc(atlasHref()) + '" target="_blank" rel="noopener" style="align-self:center;font-size:11.5px;color:var(--amber,#B45309)">Open Grid Atlas</a></div>' +
      (ST.saved ? '<div style="font-size:11px;color:#16A34A;margin-top:6px">' + esc(ST.saved) + '</div>' : '');
  }

  function paint() {
    var el = host(), h = '', res = ST.res, a = ST.answer;
    h += '<div style="display:flex;justify-content:space-between;align-items:center">' +
      '<div><div style="font-size:10px;font-weight:800;letter-spacing:1.6px;color:var(--amber,#B45309);text-transform:uppercase">Grid</div>' +
      '<div style="font-size:15px;font-weight:700">Is the grid here for this unit?</div></div>' +
      '<button type="button" data-gp="close" aria-label="Close" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--sub,#64748B)">×</button></div>';
    h += '<div style="font-size:11px;color:var(--sub,#64748B);margin-top:4px">' +
      (ST.site ? esc(ST.site.address || (ST.site.lat.toFixed(5) + ', ' + ST.site.lng.toFixed(5))) : 'No site point yet') + ' · ' +
      (ST.unit ? esc(ST.unit.name || 'Battery') + ' · ' + kw(ST.unit.kw) : 'no unit chosen in the BESS Guided Build') + '</div>';
    if (ST.err) h += '<div style="margin-top:10px;padding:10px;border-radius:8px;background:rgba(220,38,38,.08);color:#B91C1C;font-size:12px">' + esc(ST.err) + '</div>';
    if (ST.busy) h += '<div style="padding:22px 0;text-align:center;color:var(--sub,#64748B);font-size:12px">Reading the substation, then the serving utility and its published hosting…</div>';

    if (res && a) {
      h += verdictBox(a) + substationCard(a.substation) + utilityCard(res) + circuitCard(res, a) + buttons(true);
    } else if (!ST.busy && ST.circErr) {
      /* the door did not answer: said so, nothing judged, nothing recorded */
      h += substationCard(null) +
        card('Circuit at the parcel', '<div style="font-size:12px;color:var(--sub,#64748B)">' + esc('The hosting capacity check did not answer: ' + ST.circErr) + '</div>') +
        buttons(false);
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
    b = el.querySelector('[data-gp="save"]'); if (b) b.onclick = save;
  }
  function save() {
    record(ST.res);
    var fn = root.saveProject || (typeof saveProject === 'function' ? saveProject : null);
    if (!fn) { ST.saved = 'Recorded on the project; save it to keep it.'; paint(); return; }
    ST.saved = 'Saving…'; paint();
    Promise.resolve().then(function () { return fn(); }).then(function () { ST.saved = 'Saved onto the project.'; paint(); },
      function (e) { ST.saved = ''; ST.err = 'The save did not go through: ' + ((e && e.message) || e); paint(); });
  }

  function run(force) {
    if (ST.busy) return;
    ST.site = site(); ST.unit = unit(); ST.err = ''; ST.saved = ''; ST.res = null; ST.answer = null;
    ST.sub = null; ST.subErr = ''; ST.circErr = '';
    if (!ST.site) { ST.err = 'This project has no site point yet. Find the address or lock the map first.'; paint(); return; }
    if (force) { var st = S0(); if (st && st.grid && samePoint(st.grid, ST.site)) { try { delete st.grid.substations; } catch (e) {} } }
    ST.busy = true; paint();
    /* the substation first: the door judges the unit against it in the same answer */
    substation(ST.site, function (s, err) {
      ST.sub = s; ST.subErr = err || '';
      circuit(ST.site, function (res, why) {
        ST.busy = false;
        if (!res) { ST.circErr = why || 'no reply'; paint(); return; }
        ST.res = res; ST.answer = res.verdict;
        record(res);
        paint();
      });
    });
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

  root.OmegaGridPanel = { open: open, close: close, run: run, site: site, unit: unit,
                          last: function () { return ST.answer; }, hosting: function () { return ST.res; },
                          _t: { record: record, ST: ST } };
  if (typeof document === 'undefined') return;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  if (root.console && console.info) console.info(TAG + ' ready — Analyze › Grid Check, or OmegaGridPanel.open()');
})(typeof window !== 'undefined' ? window : this);
