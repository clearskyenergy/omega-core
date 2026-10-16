/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   Cost › Trades — the takeoff by trade (Blueprint to Build, Phase 3;
   docs/BLUEPRINT-TO-BUILD.md; 2026-10-16, Tommy: "Push it and continue with
   the builds", after a Perplexity ad whose right rail lists each system of
   the job with its quantity and its amount).

   POST /api/takeoff answers the Run's own money by trade
   (api/_lib/takeoff.js): every line with its quantity and the parts of the
   drawing it counts, adding up to the Run total to the cent. This file only
   draws that answer, marks a line's parts on the map and in the 3D Site
   Visualizer, finds the line of whatever is selected, and writes the CSV and
   each trade's scope of work. No price, rate or grouping is worked out here
   (CLAUDE.md, IP protection). Each line and row also says where its price
   comes from, as the server read it (a quote for this job, a book on file,
   a benchmark), and the head shows how much of the total rests on each.

   A line's parts are keys (pad, bess:<model>, ev#3, solar:roof, conduit:
   PVC-UG…) that omegaCostQuantities(rec) fills with drawing ids by the SAME
   tests that count the Run's quantities, so the map marks what the Run
   counted, never a second guess at it. The trench, the fence and the pads'
   area are measured the way the Build player and the 3D model measure them
   (_trenchDugFtAll, OmegaSiteVis.fenceFt, the visualizer's own reading of
   the drawing), and only on a calibrated map. Nothing is saved. ES5, no
   build step. */
(function (root) {
  'use strict';
  var doc = root.document;
  if (!doc) return;

  var TICK_MS = 400;
  var st = { ans: null, key: '', rec: {}, fence: [], err: '', busy: false, want: false, cost: undefined,
    open: {}, active: '', marked: [], sel: '', pick: '', quiet: false, timer: null, helpers: {}, site: null,
    lastCsv: '', lastScope: '', scoped: '' };

  function el(id) { return doc.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function usd(cents) { return '$' + Math.round((+cents || 0) / 100).toLocaleString('en-US'); }
  function pane() { return el('cst-takeoff'); }
  function shown() { var p = pane(); return !!(p && p.style.display !== 'none' && p.offsetParent !== null); }
  function vis() { var O = root.OmegaSiteVis; try { return O && O._V ? O._V() : null; } catch (e) { return null; } }
  function visOpen() { var d = el('ovis'); return !!(d && d.classList.contains('on')); }
  /* what changes the measured extras without changing the Run: the map's
     scale, and pieces added or taken away */
  function sig() { try { return [S.pxPerFt || 0, (S.shapes || []).length, (S.elements || []).length, (S.conduits || []).length, (S._trenches || []).length].join('|'); } catch (e) { return ''; } }
  function project() {
    var name = '', addr = '';
    try { name = ((el('proj-name-inp') || {}).value || '').trim() || ((doc.querySelector('.proj-name') || {}).textContent || '').trim(); } catch (e) {}
    try { addr = ((el('addr-in') || {}).value || '').trim(); } catch (e) {}
    return { name: name, addr: addr };
  }

  /* ── styles ───────────────────────────────────────────────────────── */
  var HL = '#F59E0B';
  var CSS = ''
  + '#cst-takeoff .tk-head{display:flex;justify-content:space-between;align-items:flex-start;gap:8px}'
  + '#cst-takeoff .tk-head b{display:block;font-size:12px;color:var(--text)}'
  + '#cst-takeoff .tk-head span{display:block;font-size:9.5px;color:var(--sub);margin-top:2px;line-height:1.35}'
  + '#cst-takeoff .tk-total{font:700 15px "IBM Plex Mono",monospace;color:var(--green);white-space:nowrap}'
  + '#cst-takeoff .tk-tools{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}'
  + '#cst-takeoff .tk-btn{font:600 10px "IBM Plex Sans",sans-serif;padding:4px 9px;border-radius:5px;border:1px solid var(--border);background:var(--inset);color:var(--text);cursor:pointer}'
  + '#cst-takeoff .tk-btn:hover{border-color:var(--accent)}'
  + '#cst-takeoff .tk-msg{font-size:10px;color:var(--sub);line-height:1.45;margin:6px 0}'
  + '#cst-takeoff .tk-msg.warn{color:var(--amber)}'
  + '#cst-takeoff .tk-hint{font-size:10px;line-height:1.4;margin:0 0 8px;padding:5px 8px;border-radius:5px;background:rgba(245,158,11,.10);border:1px solid rgba(245,158,11,.35);color:var(--text)}'
  + '#cst-takeoff .tk-hint.sel{background:rgba(74,143,216,.10);border-color:rgba(74,143,216,.4)}'
  + '#cst-takeoff .tk-hint a{color:var(--accent);cursor:pointer;margin-left:6px}'
  + '#cst-takeoff .tk-trade{border:1px solid var(--border);border-radius:6px;margin-bottom:6px;overflow:hidden;background:var(--inset)}'
  + '#cst-takeoff .tk-th{display:grid;grid-template-columns:10px minmax(0,1fr) auto;gap:6px;align-items:center;padding:7px 8px;cursor:pointer;user-select:none}'
  + '#cst-takeoff .tk-th .tk-car{font-size:8px;color:var(--sub);transition:transform .15s}'
  + '#cst-takeoff .tk-trade.open .tk-car{transform:rotate(90deg)}'
  + '#cst-takeoff .tk-name{font-size:11px;font-weight:700;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
  + '#cst-takeoff .tk-div{font:600 8.5px "IBM Plex Mono",monospace;color:var(--sub);margin-left:5px}'
  + '#cst-takeoff .tk-q{display:block;font-size:9.5px;font-weight:400;color:var(--sub);margin-top:1px}'
  + '#cst-takeoff .tk-amt{font:700 11px "IBM Plex Mono",monospace;color:var(--text);text-align:right;white-space:nowrap}'
  + '#cst-takeoff .tk-pct{display:block;font-size:9px;font-weight:400;color:var(--sub)}'
  + '#cst-takeoff .tk-bar{height:2px;background:var(--hairline)}'
  + '#cst-takeoff .tk-bar i{display:block;height:2px;background:var(--accent)}'
  + '#cst-takeoff .tk-body{display:none;border-top:1px solid var(--hairline);padding:3px 0 6px}'
  + '#cst-takeoff .tk-trade.open .tk-body{display:block}'
  + '#cst-takeoff .tk-line{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:4px 8px;align-items:baseline;padding:4px 8px 4px 20px;font-size:10.5px;color:var(--text)}'
  + '#cst-takeoff .tk-line[data-k]{cursor:pointer}'
  + '#cst-takeoff .tk-line[data-k]:hover{background:rgba(245,158,11,.08)}'
  + '#cst-takeoff .tk-line.on{background:rgba(245,158,11,.16);box-shadow:inset 3px 0 0 ' + HL + '}'
  + '#cst-takeoff .tk-line.from-sel{background:rgba(74,143,216,.14);box-shadow:inset 3px 0 0 #4A8FD8}'
  + '#cst-takeoff .tk-line .q{font:10px "IBM Plex Mono",monospace;color:var(--sub);white-space:nowrap}'
  + '#cst-takeoff .tk-line .a{font:600 10.5px "IBM Plex Mono",monospace;text-align:right;white-space:nowrap;min-width:58px}'
  + '#cst-takeoff .tk-line .n{grid-column:1/-1;font-size:9px;color:var(--sub);line-height:1.35}'
  + '#cst-takeoff .tk-line.sub{padding-left:32px;font-size:10px;color:var(--sub)}'
  + '#cst-takeoff .tk-line.info{color:var(--sub)}'
  + '#cst-takeoff .tk-line.info .a{font-weight:400}'
  + '#cst-takeoff .tk-c{color:var(--sub);font-weight:400}'
  + '#cst-takeoff .tk-scope{margin:4px 8px 2px 20px}'
  + '#cst-takeoff .tk-foot{font-size:9px;color:var(--sub);line-height:1.5;margin-top:8px}'
  /* where a price comes from */
  + '#cst-takeoff .tk-src{display:inline-block;font:700 7.5px "IBM Plex Mono",monospace;letter-spacing:.4px;padding:1px 4px;border-radius:3px;margin-right:5px;vertical-align:1px;border:1px solid}'
  + '#cst-takeoff .tk-src.quote{color:#1DB954;border-color:rgba(29,185,84,.5);background:rgba(29,185,84,.10)}'
  + '#cst-takeoff .tk-src.book{color:#4A8FD8;border-color:rgba(74,143,216,.5);background:rgba(74,143,216,.10)}'
  + '#cst-takeoff .tk-src.benchmark{color:#D8A23E;border-color:rgba(216,162,62,.55);background:rgba(216,162,62,.10)}'
  + '#cst-takeoff .tk-src.mixed{color:var(--sub);border-color:var(--border)}'
  + '#cst-takeoff .tk-kinds{margin:0 0 8px}'
  + '#cst-takeoff .tk-kbar{display:flex;height:6px;border-radius:3px;overflow:hidden;background:var(--hairline)}'
  + '#cst-takeoff .tk-kbar i{display:block;height:6px}'
  + '#cst-takeoff .tk-kbar i.quote{background:#1DB954}#cst-takeoff .tk-kbar i.book{background:#4A8FD8}#cst-takeoff .tk-kbar i.benchmark{background:#D8A23E}'
  + '#cst-takeoff .tk-klegend{display:flex;flex-wrap:wrap;gap:4px 10px;font-size:9.5px;color:var(--sub);margin-top:4px}'
  + '#cst-takeoff .tk-klegend b{color:var(--text);font-weight:600}'
  /* the map marks: what a line counts */
  + '#els .cel.tk-hl{outline:2px solid ' + HL + '!important;outline-offset:3px}'
  + '#csvg g.tk-hl{filter:drop-shadow(0 0 3px ' + HL + ') drop-shadow(0 0 1px ' + HL + ')}'
  /* the 3D card */
  + '#ovis .tk-card{position:absolute;left:12px;top:56px;z-index:7;max-width:min(340px,calc(100% - 24px));box-sizing:border-box;'
  +   'background:rgba(16,18,22,.93);border:1px solid #30404F;border-left:3px solid ' + HL + ';border-radius:8px;padding:8px 30px 8px 10px;'
  +   'color:#E0E0E0;font:11px "IBM Plex Sans",sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.45)}'
  + '#ovis .tk-card i{display:block;font-style:normal;font-size:9.5px;letter-spacing:.4px;text-transform:uppercase;color:#7F8C99}'
  + '#ovis .tk-card b{display:block;font-size:12px;margin-top:2px;line-height:1.3}'
  + '#ovis .tk-card span{display:block;color:#9FB0C0;font-size:10.5px;margin-top:3px;font-family:"IBM Plex Mono",monospace}'
  + '#ovis .tk-card button{position:absolute;top:4px;right:6px;background:none;border:none;color:#9FB0C0;font-size:15px;line-height:1;cursor:pointer;padding:2px 4px}';
  function styles() { if (el('tk-css')) return; var s = doc.createElement('style'); s.id = 'tk-css'; s.textContent = CSS; (doc.head || doc.documentElement).appendChild(s); }

  /* ── the request ──────────────────────────────────────────────────── */
  /* What the drawing measures that the Run does not price: feet of trench
     dug, feet of fence, the pads' area, all in feet off a calibrated map. */
  function extras(rec) {
    var x = {}, fence = [];
    try { var t = typeof root._trenchDugFtAll === 'function' ? +root._trenchDugFtAll() || 0 : 0; if (t > 0) x.trenchFt = Math.round(t); } catch (e) {}
    try {
      var O = root.OmegaSiteVis, site = O && O.read ? O.read() : null;
      if (site && site.calibrated) {
        var padSf = 0, pads = 0, ft = 0;
        site.items.forEach(function (it) {
          if (!it) return;
          if (it.src === 'element' && it.ref && it.ref.eqId === 'pad') { pads++; padSf += (+it.wf || 0) * (+it.lf || 0); }
          if (it.arch === 'fence' && !it.hidden && O.fenceFt) { var f = +O.fenceFt(it) || 0; if (f > 0) { ft += f; fence.push(it.id); } }
        });
        /* the area only when it is the area of the very pads the Run counts */
        if (padSf > 0 && pads === ((rec && rec.pad) || []).length) x.padSf = Math.round(padSf);
        if (ft > 0) x.fenceFt = Math.round(ft);
      }
    } catch (e) {}
    st.fence = fence;
    return x;
  }

  function request(body) {
    var fb = root.firebase, u = fb && fb.auth && fb.auth().currentUser;
    if (!u) return Promise.reject(new Error('Sign in to see the takeoff.'));
    return u.getIdToken().then(function (t) {
      return root.fetch('/api/takeoff', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t }, body: body });
    }).then(function (r) {
      return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'The takeoff service is unavailable; try again in a minute.'); return j; },
        function () { throw new Error('The takeoff service is unavailable; try again in a minute.'); });
    });
  }

  /* Read the drawing, and ask the server when it changed. */
  function refresh(force) {
    if (typeof root.omegaCostQuantities !== 'function') { st.err = 'The Run is not available on this page.'; paint(); return Promise.resolve(null); }
    var rec = {}, q, x, body;
    try { q = root.omegaCostQuantities(rec); x = extras(rec); body = JSON.stringify({ q: q, extra: x }); }
    catch (e) { st.err = 'Could not read the drawing: ' + (e && e.message || e); paint(); return Promise.resolve(null); }
    st.rec = rec; st.cost = root._COST_SERVER; st.sig = sig();
    if (!force && body === st.key && st.ans) { remark(); paint(); return Promise.resolve(st.ans); }
    st.key = body; st.busy = true; st.err = ''; paint();
    return request(body).then(function (ans) {
      if (st.key !== body) return st.ans;           /* a newer drawing is on its way */
      st.ans = ans; st.busy = false; remark(); paint(); return ans;
    }, function (err) {
      if (st.key !== body) return st.ans;
      st.busy = false; st.err = (err && err.message) || String(err); st.key = ''; paint(); return null;
    });
  }

  /* ── what each line counts, and back ──────────────────────────────── */
  function ids(parts) {
    var out = [], seen = {};
    (parts || []).forEach(function (p) {
      var list = p === 'fence' ? st.fence : p === 'trench' ? ['#trench-corridors', '#trench-spine'] : (st.rec[p] || []);
      list.forEach(function (id) { if (!seen[id]) { seen[id] = 1; out.push(id); } });
    });
    return out;
  }
  /* every entry of the answer that points at something, by its data-k */
  function entries() {
    var out = [];
    ((st.ans && st.ans.trades) || []).forEach(function (t) {
      t.lines.forEach(function (l) {
        if (l.parts && l.parts.length) out.push({ k: 'L:' + l.key, trade: t, label: l.label, qty: l.qty, cents: l.cents, parts: l.parts, line: l });
        (l.rows || []).forEach(function (r, i) { if (r.parts && r.parts.length) out.push({ k: 'R:' + l.key + ':' + i, trade: t, label: l.label + ' › ' + r.label, qty: r.qty, cents: r.cents, parts: r.parts, line: l, sub: true }); });
      });
      (t.info || []).forEach(function (i) { if (i.parts && i.parts.length) out.push({ k: 'I:' + i.key, trade: t, label: i.label, qty: i.qty, cents: null, parts: i.parts, info: i }); });
    });
    return out;
  }
  function entry(k) { var e = entries().filter(function (x) { return x.k === k; }); return e[0] || null; }
  /* the entries a drawing id is counted by: the most specific first */
  function linesOf(id) {
    var hit = entries().filter(function (e) { return ids(e.parts).indexOf(id) >= 0; });
    hit.sort(function (a, b) { return (b.sub ? 1 : 0) - (a.sub ? 1 : 0); });
    return hit;
  }

  /* ── marks on the map ─────────────────────────────────────────────── */
  function nodes(id) {
    if (id.charAt(0) === '#') { var n = el(id.slice(1)); return n ? [n] : []; }
    var v = String(id).replace(/["\\]/g, '\\$&');
    return Array.prototype.slice.call(doc.querySelectorAll('[data-elid="' + v + '"],[data-shid="' + v + '"],[data-cid="' + v + '"]'));
  }
  function unmark() {
    Array.prototype.forEach.call(doc.querySelectorAll('.tk-hl'), function (n) { n.classList.remove('tk-hl'); });
    st.marked = [];
    unmark3d();
  }
  function remark() {
    var e = st.active ? entry(st.active) : null;
    if (st.active && !e) { st.active = ''; unmark(); return; }
    st.marked = e ? ids(e.parts) : [];
    apply();
  }
  /* the marks put back on whatever the editor redrew */
  function apply() {
    st.marked.forEach(function (id) { nodes(id).forEach(function (n) { if (!n.classList.contains('tk-hl')) n.classList.add('tk-hl'); }); });
    Array.prototype.forEach.call(doc.querySelectorAll('.tk-hl'), function (n) {
      var id = n.getAttribute('data-elid') || n.getAttribute('data-shid') || n.getAttribute('data-cid') || ('#' + n.id);
      if (st.marked.indexOf(id) < 0) n.classList.remove('tk-hl');
    });
    mark3d();
  }
  function activate(k) {
    st.active = st.active === k ? '' : k;
    if (!st.active) unmark(); else remark();
    paint();
  }

  /* ── marks in the 3D model ────────────────────────────────────────── */
  function unmark3d() {
    var V = vis(), any = false;
    Object.keys(st.helpers).forEach(function (id) {
      var h = st.helpers[id];
      try { if (h.parent) h.parent.remove(h); if (h.geometry) h.geometry.dispose(); if (h.material) h.material.dispose(); } catch (e) {}
      any = true;
    });
    st.helpers = {};
    if (any && V) V.needsRender = true;
    card();
  }
  function mark3d() {
    var V = vis(), T = root.OmegaSiteVis && root.OmegaSiteVis._THREE ? root.OmegaSiteVis._THREE() : null;
    if (!V || !V.root || !V.scene || !T || !visOpen()) { if (Object.keys(st.helpers).length) unmark3d(); else card(); return; }
    var want = {}, byId = {}, changed = false;
    st.marked.forEach(function (id) { want[id] = 1; });
    if (st.marked.length) V.root.traverse(function (o) { var id = o.userData && o.userData.itemId; if (id && want[id] && !byId[id]) byId[id] = o; });
    Object.keys(st.helpers).forEach(function (id) {
      var o = byId[id];
      if (!o || !o.visible || st.site !== V.site) { var h = st.helpers[id]; try { if (h.parent) h.parent.remove(h); h.geometry.dispose(); h.material.dispose(); } catch (e) {} delete st.helpers[id]; changed = true; }
    });
    Object.keys(byId).forEach(function (id) {
      var o = byId[id]; if (!o.visible) return;
      if (st.helpers[id]) { st.helpers[id].setFromObject(o); return; }
      /* drawn over the model, so a box behind a container still shows */
      var h = new T.BoxHelper(o, 0xF59E0B); h.material.depthTest = false; h.material.transparent = true; h.renderOrder = 999;
      V.scene.add(h); st.helpers[id] = h; changed = true;
    });
    st.site = V.site;
    if (changed || st.marked.length) V.needsRender = true;
    card();
  }
  /* the line of what is marked or picked, inside the visualizer */
  function card() {
    var d = el('ovis'), c = el('tk-card');
    var e = st.active ? entry(st.active) : null, show = !!(d && visOpen() && st.ans && !st.quiet && (e || st.pick));
    if (!show) { if (c && c.parentNode) c.parentNode.removeChild(c); return; }
    if (!c) {
      c = doc.createElement('div'); c.id = 'tk-card'; c.className = 'tk-card'; d.appendChild(c);
      c.addEventListener('click', function (ev) { if (ev.target && ev.target.getAttribute('data-tk') === 'x') { st.quiet = true; st.pick = ''; st.active = ''; unmark(); paint(); } });
    }
    var html;
    if (e) {
      var n = st.marked.length, in3d = Object.keys(st.helpers).length;
      html = '<i>Takeoff · ' + esc(e.trade.label) + '</i><b>' + esc(e.label) + '</b><span>' + esc(e.qty ? e.qty.text : '') + (e.cents != null ? (e.qty ? ' · ' : '') + usd(e.cents) : ' · not in the Run total') + '</span>'
        + '<span>' + (in3d ? in3d + ' marked in the model' : 'Nothing of this line is drawn in the model') + (n > in3d && in3d ? ' · ' + (n - in3d) + ' only on the map' : '') + '</span>';
    } else html = '<i>Takeoff</i><b>' + esc(st.pickLabel || 'This piece') + '</b><span>Not a line of the Run: nothing priced counts it.</span>';
    c.innerHTML = html + '<button type="button" data-tk="x" title="Close the takeoff card" aria-label="Close the takeoff card">×</button>';
  }

  /* ── the pane ─────────────────────────────────────────────────────── */
  function qtyText(q) { return q ? esc(q.text) : ''; }
  var KIND = { quote: 'QUOTE', book: 'BOOK', benchmark: 'BENCH', mixed: 'MIXED' };
  var KIND_WORD = { quote: 'Quote', book: 'Book', benchmark: 'Benchmark' };
  function tag(sv) { return sv && KIND[sv.kind] ? '<span class="tk-src ' + esc(sv.kind) + '" data-src="' + esc(sv.kind) + '" title="' + esc(sv.basis || '') + '">' + KIND[sv.kind] + '</span>' : ''; }
  /* how much of the total rests on each kind of price */
  function kindsHtml(a) {
    var ks = a.sources || []; if (!ks.length) return '';
    var h = '<div class="tk-kinds" id="tk-kinds"><div class="tk-kbar">';
    ks.forEach(function (k) { h += '<i class="' + esc(k.kind) + '" style="width:' + Math.max(0, Math.min(100, +k.pct || 0)) + '%"></i>'; });
    h += '</div><div class="tk-klegend">';
    ks.forEach(function (k) { h += '<span data-kind="' + esc(k.kind) + '">' + KIND_WORD[k.kind] + ' <b>' + (+k.pct || 0) + '%</b></span>'; });
    var bench = ks.filter(function (k) { return k.kind === 'benchmark'; })[0];
    if (bench && bench.pct >= 50) h += '<span>· Most of this total rests on benchmarks: get quotes before it goes to a customer.</span>';
    return h + '</div></div>';
  }
  function lineHtml(t, l) {
    var k = 'L:' + l.key, click = l.parts && l.parts.length;
    var h = '<div class="tk-line' + (st.active === k ? ' on' : '') + (st.sel === k ? ' from-sel' : '') + '"' + (click ? ' data-k="' + esc(k) + '" title="Mark on the map"' : '') + '>'
      + '<span>' + tag(l.source) + esc(l.label) + (l.contingency ? '<span class="tk-c"> *</span>' : '') + '</span><span class="q">' + qtyText(l.qty) + '</span><span class="a">' + usd(l.cents) + '</span>'
      + (l.note ? '<span class="n">' + esc(l.note) + '</span>' : '') + '</div>';
    (l.rows || []).forEach(function (r, i) {
      var rk = 'R:' + l.key + ':' + i, rc = r.parts && r.parts.length;
      if (l.rows.length === 1 && !rc) return;
      h += '<div class="tk-line sub' + (st.active === rk ? ' on' : '') + (st.sel === rk ? ' from-sel' : '') + '"' + (rc ? ' data-k="' + esc(rk) + '" title="Mark on the map"' : '') + '>'
        + '<span>' + (l.source && l.source.kind !== r.source.kind || (l.source && l.source.basis === 'See each row') ? tag(r.source) : '') + esc(r.label) + '</span><span class="q">' + qtyText(r.qty) + '</span><span class="a">' + usd(r.cents) + '</span></div>';
    });
    return h;
  }
  function infoHtml(i) {
    var k = 'I:' + i.key, click = i.parts && i.parts.length;
    return '<div class="tk-line info' + (st.active === k ? ' on' : '') + (st.sel === k ? ' from-sel' : '') + '"' + (click ? ' data-k="' + esc(k) + '" title="Mark on the map"' : '') + '>'
      + '<span>' + esc(i.label) + '</span><span class="q">' + qtyText(i.qty) + '</span><span class="a">' + (i.bomCents != null ? 'BOM ' + usd(i.bomCents) : '—') + '</span>'
      + (i.note ? '<span class="n">' + esc(i.note) + '</span>' : '') + '</div>';
  }
  function paint() {
    var p = pane(); if (!p) return;
    styles();
    var a = st.ans, h = '';
    h += '<div class="tk-head"><div><b>Takeoff by trade</b><span>The Run’s money by trade, each line with its quantity. Click a line to mark what it counts.</span></div>'
      + '<div class="tk-total" id="tk-total">' + (a ? usd(a.cents) : '$--') + '</div></div>';
    h += '<div class="tk-tools"><button type="button" class="tk-btn" data-tk="csv"' + (a ? '' : ' disabled') + '>⬇ CSV</button>'
      + '<button type="button" class="tk-btn" data-tk="refresh" title="Read the drawing again">↻ Refresh</button></div>';
    if (st.busy) h += '<div class="tk-msg">Reading the drawing…</div>';
    if (st.err) h += '<div class="tk-msg warn">' + esc(st.err) + ' <a data-tk="refresh" style="color:var(--accent);cursor:pointer">Try again</a></div>';
    if (a) {
      h += kindsHtml(a);
      (a.notes || []).forEach(function (n) { h += '<div class="tk-msg warn">' + esc(n) + '</div>'; });
      var e = st.active ? entry(st.active) : null;
      if (e) {
        var n = st.marked.length, seen = st.marked.filter(function (id) { return nodes(id).length > 0; }).length;
        h += '<div class="tk-hint"><b>' + esc(e.label) + '</b>: ' + (n ? (seen + ' of ' + n + ' marked on the map') : 'nothing on the drawing to mark') + (Object.keys(st.helpers).length ? ' and in the 3D model' : '') + '<a data-tk="clear">Clear</a></div>';
      }
      if (st.selId) {
        var hits = linesOf(st.selId);
        h += '<div class="tk-hint sel">Selected on the map: ' + (hits.length ? esc(hits[0].trade.label) + ' › ' + esc(hits[0].label) : 'not counted by any line of the Run') + '</div>';
      }
      a.trades.forEach(function (t) {
        var open = !!st.open[t.key];
        h += '<div class="tk-trade' + (open ? ' open' : '') + '" data-trade="' + esc(t.key) + '">'
          + '<div class="tk-th" data-tk="toggle" data-trade="' + esc(t.key) + '"><span class="tk-car">▶</span>'
          + '<span style="min-width:0"><span class="tk-name">' + esc(t.label) + (t.div ? '<span class="tk-div">Div ' + esc(t.div) + '</span>' : '') + '</span>'
          + (t.qty ? '<span class="tk-q">' + esc(t.qty.text) + '</span>' : '') + '</span>'
          + '<span class="tk-amt">' + (t.cents || !(t.info && t.info.length) ? usd(t.cents) : '—') + '<span class="tk-pct">' + (t.cents ? t.pct + '%' : 'not in the Run') + '</span></span></div>'
          + '<div class="tk-bar"><i style="width:' + Math.max(0, Math.min(100, +t.pct || 0)) + '%"></i></div>'
          + '<div class="tk-body">';
        t.lines.forEach(function (l) { h += lineHtml(t, l); });
        (t.info || []).forEach(function (i) { h += infoHtml(i); });
        (t.notes || []).forEach(function (n) { h += '<div class="tk-line info"><span class="n">' + esc(n) + '</span></div>'; });
        if (t.key !== 'utility' && t.key !== 'contracted') h += '<div class="tk-scope"><button type="button" class="tk-btn" data-tk="scope" data-trade="' + esc(t.key) + '">' + (st.scoped === t.key ? '✓ Scope copied' : '⧉ Copy scope of work') + '</button></div>';
        h += '</div></div>';
      });
      if (!a.trades.length && !(a.notes || []).length) h += '<div class="tk-msg">Nothing is placed yet.</div>';
      h += '<div class="tk-foot">' + (a.contPct > 0 ? '* Carries the Run’s ' + Math.round(a.contPct * 1000) / 10 + '% contingency. ' : '')
        + 'The trades add up to the Run total. Quantities are what the drawing counts; feet and areas need a calibrated map. '
        + 'QUOTE is a price entered for this job, BOOK a price on file for the product, BENCH a screening benchmark: hover a tag for its source. '
        + 'Marked parts show in the 3D Site Visualizer too. The CSV carries the cents; a scope of work carries quantities, never prices.</div>';
    } else if (!st.busy && !st.err) h += '<div class="tk-msg">Reading the drawing…</div>';
    p.innerHTML = h;
  }

  /* ── the CSV and the scope of work ────────────────────────────────── */
  var PER = { EA: 1, kWh: 1, kW: 1, 'kW-DC': 1, LF: 1, SF: 1 };
  function cell(v) { if (typeof root._csvCell === 'function') return root._csvCell(v); v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function money(c) { return c == null ? '' : ((+c || 0) / 100).toFixed(2); }
  function each(cents, q) { return q && PER[q.unit] && q.qty > 0 && cents != null ? (cents / 100 / q.qty).toFixed(2) : ''; }
  function csv() {
    var a = st.ans; if (!a) return '';
    var rows = [['Trade', 'CSI division', 'Line', 'Item', 'Quantity', 'Unit', 'Amount (USD)', 'All-in per unit (USD)', 'In the Run total', 'Price source', 'Source basis', 'Note']];
    function sk(sv) { return sv ? (KIND_WORD[sv.kind] || 'Mixed') : ''; }
    a.trades.forEach(function (t) {
      t.lines.forEach(function (l) {
        rows.push([t.label, t.div || '', l.label, '', l.qty ? l.qty.qty : '', l.qty ? l.qty.unit : '', money(l.cents), each(l.cents, l.qty), l.contingency ? 'yes, with contingency' : 'yes', sk(l.source), l.source ? l.source.basis : '', l.note || '']);
        (l.rows || []).forEach(function (r) { rows.push([t.label, t.div || '', l.label, r.label, r.qty ? r.qty.qty : '', r.qty ? r.qty.unit : '', money(r.cents), each(r.cents, r.qty), 'in the line above', sk(r.source), r.source ? r.source.basis : '', '']); });
      });
      (t.info || []).forEach(function (i) {
        rows.push([t.label, t.div || '', i.label, '', i.qty ? i.qty.qty : '', i.qty ? i.qty.unit : '', '', '', 'no', '', '',
          (i.bomCents != null ? 'On the BOM at $' + money(i.bomCents) + '. ' : '') + (i.note || '')]);
      });
    });
    rows.push(['Total', '', '', '', '', '', money(a.cents), '', '', (a.sources || []).map(function (k) { return KIND_WORD[k.kind] + ' ' + k.pct + '%'; }).join(', '), '', (a.notes || []).join(' ')]);
    var text = rows.map(function (r) { return r.map(cell).join(','); }).join('\n');
    var pr = project(), name = (pr.name ? pr.name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) + '-' : '') + 'takeoff-by-trade';
    try {
      var url = root.URL.createObjectURL(new root.Blob([text], { type: 'text/csv' })), link = doc.createElement('a');
      link.href = url; link.download = name + '.csv'; doc.body.appendChild(link); link.click(); doc.body.removeChild(link);
      setTimeout(function () { root.URL.revokeObjectURL(url); }, 2000);
    } catch (e) {}
    st.lastCsv = text;
    return text;
  }
  /* A trade's scope of work, to send for a bid: what to build and how
     much, never what the Run priced it at. */
  function scopeText(key) {
    var a = st.ans, t = a && a.trades.filter(function (x) { return x.key === key; })[0]; if (!t) return '';
    var pr = project(), out = [];
    out.push('Scope of work: ' + t.label + (t.div ? ' (CSI Division ' + t.div + ')' : ''));
    if (pr.name || pr.addr) out.push([pr.name, pr.addr].filter(Boolean).join(' · '));
    out.push('From the Site Map design of ' + new Date().toISOString().slice(0, 10) + '. Quantities as drawn; confirm on site.');
    out.push('');
    t.lines.forEach(function (l) {
      if (l.rows && l.rows.length > 1) { out.push('• ' + l.label + (l.qty ? ': ' + l.qty.text : '')); l.rows.forEach(function (r) { out.push('    – ' + r.label + (r.qty ? ': ' + r.qty.text : '')); }); }
      else if (l.rows && l.rows.length === 1) out.push('• ' + l.label + ' (' + l.rows[0].label + ')' + (l.qty ? ': ' + l.qty.text : ''));
      else out.push('• ' + l.label + (l.qty && l.qty.unit !== 'LS' ? ': ' + l.qty.text : ''));
    });
    var inf = (t.info || []).filter(function (i) { return i.qty; });
    if (inf.length) { out.push(''); out.push('Also on the drawing:'); inf.forEach(function (i) { out.push('• ' + i.label + ': ' + i.qty.text); }); }
    out.push('');
    out.push('Not in this scope: the utility’s own interconnection work and charges.');
    return out.join('\n');
  }
  function copyScope(key) {
    var text = scopeText(key); if (!text) return;
    st.lastScope = text; st.scoped = key; paint();
    setTimeout(function () { if (st.scoped === key) { st.scoped = ''; paint(); } }, 2500);
    function fallback() {
      try { var ta = doc.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; doc.body.appendChild(ta); ta.select(); doc.execCommand('copy'); doc.body.removeChild(ta); } catch (e) {}
    }
    try { if (root.navigator && root.navigator.clipboard && root.navigator.clipboard.writeText) root.navigator.clipboard.writeText(text).then(null, fallback); else fallback(); } catch (e) { fallback(); }
  }

  /* ── the clock: selection, picks, the Run's answer, redrawn marks ──── */
  function selected() { try { var s = typeof root._o2SoleSelection === 'function' ? root._o2SoleSelection() : null; return s && s.id ? String(s.id) : ''; } catch (e) { return ''; } }
  function tick() {
    st.ticks = (st.ticks || 0) + 1;
    var on = shown(), v3 = visOpen() && !!st.ans;
    if (!on && !v3 && !st.marked.length) return;
    if (on) {
      if (!st.busy && (st.cost !== root._COST_SERVER || st.sig !== sig())) refresh(false);
      var sid = selected();
      if (sid !== (st.selId || '')) {
        st.selId = sid;
        var hits = sid ? linesOf(sid) : [];
        st.sel = hits.length ? hits[0].k : '';
        if (hits.length) st.open[hits[0].trade.key] = true;
        paint();
        if (st.sel) { var n = pane().querySelector('.tk-line.from-sel'); if (n && n.scrollIntoView) n.scrollIntoView({ block: 'nearest' }); }
      }
    }
    if (v3) {
      var V = vis(), pk = V && V.selectedModel ? String(V.selectedModel) : '';
      if (pk && pk !== st.pick && !st.quiet) {
        var hits3 = linesOf(pk);
        st.pick = pk; st.pickLabel = '';
        try { var it = (V.site && V.site.items || []).filter(function (x) { return x.id === pk; })[0]; st.pickLabel = it ? (it.label || (root.OmegaSiteVis.ARCH[it.arch] || {}).label || '') : ''; } catch (e) {}
        if (hits3.length) { st.active = hits3[0].k; st.open[hits3[0].trade.key] = true; remark(); paint(); }
        else { st.active = ''; unmark(); }
      } else if (!pk) st.pick = '';
    } else if (st.pick) st.pick = '';
    if (st.marked.length) apply(); else if (v3) card();
  }

  /* ── wiring ───────────────────────────────────────────────────────── */
  function wire() {
    var p = pane(); if (!p || p.getAttribute('data-tk-wired')) return;
    p.setAttribute('data-tk-wired', '1');
    p.addEventListener('click', function (ev) {
      var t = ev.target, a = t && t.closest ? t.closest('[data-tk],[data-k]') : null; if (!a) return;
      var what = a.getAttribute('data-tk');
      if (what === 'toggle') { var k = a.getAttribute('data-trade'); st.open[k] = !st.open[k]; paint(); return; }
      if (what === 'csv') { csv(); return; }
      if (what === 'refresh') { refresh(true); return; }
      if (what === 'clear') { st.active = ''; unmark(); paint(); return; }
      if (what === 'scope') { copyScope(a.getAttribute('data-trade')); return; }
      var key = a.getAttribute('data-k'); if (key) activate(key);
    });
  }
  function show() {
    styles(); wire(); st.quiet = false;
    if (!st.timer) st.timer = setInterval(tick, TICK_MS);
    paint();
    return refresh(false);
  }
  function hide() { if (st.active) { st.active = ''; unmark(); } st.sel = ''; st.selId = ''; }

  root.OmegaTakeoff = { show: show, hide: hide, refresh: refresh, csv: csv, scope: scopeText, tick: tick, _state: function () { return st; } };
})(window);
