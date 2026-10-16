/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   Build — the 3D Site Visualizer's build sequence player (Blueprint to
   Build, Phase 2; docs/BLUEPRINT-TO-BUILD.md; 2026-10-16, Tommy: "And then
   do phase 2", after a Perplexity ad whose model assembles step by step
   while "In place $441,944" counts up).

   A Build button on the visualizer's bar asks POST /api/build-sequence for
   the steps of the job: each with its share of the Run's own money, what it
   puts in place and how long it takes. This file only shows and hides the
   model step by step and prints what the server answered: no price, rate or
   duration is worked out here (CLAUDE.md, IP protection). "In place" after
   the last step is the Run total, to the cent.

   The model is the visualizer's own (OmegaSiteVis._V()): every piece is a
   wrapper carrying userData.itemId, and its archetype says which step
   places it (the server's `reveal`). Nothing is rebuilt and nothing is
   saved; closing the player puts every piece back exactly as it was. ES5,
   no build step. */
(function (root) {
  'use strict';
  var doc = root.document;
  if (!doc) return;

  var SPEEDS = [0.5, 1, 2, 4];
  var STEP_MS = 2800, GAP_MS = 500, DROP_FT = 24, EXPLODE_FT = 8;
  /* how a piece arrives: set from above (equipment), or rise in place */
  var DROP = { 'bess-container': 1, 'bess-assembly': 1, 'bess-cabinet': 1, pcs: 1, ems: 1, 'compute-pod': 1, xfmr: 1, switchgear: 1,
    meter: 1, panel: 1, disco: 1, jbox: 1, genset: 1, ups: 1, charger: 1 };
  var FLAT = { pad: 1, road: 1, compound: 1 };
  /* the order pieces of one step arrive in: the gear the rest ties into first */
  var RANK = { xfmr: 0, switchgear: 0, pcs: 1, ems: 1, ups: 1, 'bess-container': 2, 'bess-assembly': 2, 'bess-cabinet': 2, 'compute-pod': 2, genset: 2,
    panel: 3, disco: 3, meter: 3, jbox: 3, fence: 0, bollard: 1, camera: 2 };

  var st = null;          /* the player while it is open */
  var speed = 1;
  /* a person who asked their system for less motion: pieces appear, they do not fly in */
  var CALM = false;
  try { CALM = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) {}
  try { var sv = +root.localStorage.getItem('omega.build.speed'); if (SPEEDS.indexOf(sv) >= 0) speed = sv; } catch (e) {}

  function el(id) { return doc.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function usd(x) { return '$' + Math.round(+x || 0).toLocaleString('en-US'); }
  function usdCents(c) { return '$' + ((+c || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function vis() { var O = root.OmegaSiteVis; try { return O && O._V ? O._V() : null; } catch (e) { return null; } }
  function ease(s) { s = s < 0 ? 0 : s > 1 ? 1 : s; return 1 - Math.pow(1 - s, 3); }
  function now() { return (root.performance && root.performance.now) ? root.performance.now() : Date.now(); }

  /* ── styles, scoped to the visualizer ─────────────────────────────── */
  var CSS = ''
  + '#ovis .ov-bs{position:absolute;left:12px;right:12px;bottom:12px;z-index:6;background:rgba(16,18,22,.92);border:1px solid #30404F;'
  +   'border-radius:8px;padding:8px 10px 9px;color:#E0E0E0;font-family:"IBM Plex Sans",sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.45)}'
  + '#ovis .ov-bs .bs-strip{display:flex;gap:4px;overflow-x:auto;padding-bottom:6px;scrollbar-width:thin}'
  + '#ovis .ov-bs .bs-chip{flex:0 0 auto;display:flex;flex-direction:column;align-items:flex-start;gap:1px;min-width:92px;max-width:150px;'
  +   'background:#1E262E;border:1px solid #30404F;border-radius:5px;padding:4px 7px;cursor:pointer;color:#9FB0C0;font:inherit;text-align:left}'
  + '#ovis .ov-bs .bs-chip b{font-size:10.5px;font-weight:600;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}'
  + '#ovis .ov-bs .bs-chip i{font-style:normal;font-size:9.5px;font-family:"IBM Plex Mono",monospace;color:#7F8C99}'
  + '#ovis .ov-bs .bs-chip.done{background:#1B2B22;border-color:#2F5A3E;color:#BFE8CC}'
  + '#ovis .ov-bs .bs-chip.done i{color:#7FC79A}'
  + '#ovis .ov-bs .bs-chip.now{background:#4A8FD8;border-color:#4A8FD8;color:#0d0d0d}'
  + '#ovis .ov-bs .bs-chip.now i{color:#0d1a2a}'
  + '#ovis .ov-bs .bs-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}'
  + '#ovis .ov-bs .bs-btn{background:#22303D;border:1px solid #30404F;color:#E0E0E0;border-radius:4px;padding:5px 9px;font:inherit;font-size:11px;'
  +   'cursor:pointer;white-space:nowrap;min-height:30px}'
  + '#ovis .ov-bs .bs-btn:hover{background:#2A3A49}'
  + '#ovis .ov-bs .bs-btn.pri{background:#4A8FD8;border-color:#4A8FD8;color:#0d0d0d;font-weight:700;min-width:78px}'
  + '#ovis .ov-bs .bs-btn.on{background:#2F4A66;border-color:#4A8FD8;color:#CFE0F5}'
  + '#ovis .ov-bs .bs-btn[disabled]{opacity:.45;cursor:default}'
  + '#ovis .ov-bs .bs-speed{display:flex;border:1px solid #30404F;border-radius:4px;overflow:hidden}'
  + '#ovis .ov-bs .bs-speed button{background:#1E262E;border:0;border-right:1px solid #30404F;color:#9FB0C0;font:inherit;font-size:10.5px;'
  +   'padding:5px 7px;cursor:pointer;min-height:30px;font-family:"IBM Plex Mono",monospace}'
  + '#ovis .ov-bs .bs-speed button:last-child{border-right:0}'
  + '#ovis .ov-bs .bs-speed button.on{background:#4A8FD8;color:#0d0d0d;font-weight:700}'
  + '#ovis .ov-bs .bs-status{flex:1;min-width:170px;font-size:11px;line-height:1.35;color:#CFCFCF}'
  + '#ovis .ov-bs .bs-status b{color:#F2F2F2}'
  + '#ovis .ov-bs .bs-status span{color:#8A99A8;font-family:"IBM Plex Mono",monospace;font-size:10.5px}'
  + '#ovis .ov-bs .bs-money{text-align:right;line-height:1.2}'
  + '#ovis .ov-bs .bs-money .bs-ip{display:block;font-size:17px;font-weight:700;font-family:"IBM Plex Mono",monospace;color:#7FDE9A}'
  + '#ovis .ov-bs .bs-money .bs-of{font-size:9.5px;color:#8A99A8;letter-spacing:.3px;text-transform:uppercase}'
  + '#ovis .ov-bs .bs-msg{font-size:11.5px;color:#CFCFCF;padding:4px 2px;flex:1}'
  + '#ovis .ov-bs .bs-msg.err{color:#F0A0A0}'
  + '#ovis .ov-bs .bs-x{font-size:15px;line-height:1;padding:4px 9px}'
  + '#ovis .ov-bsp{position:absolute;right:12px;z-index:7;width:min(620px,calc(100% - 24px));max-height:calc(100% - 170px);overflow:auto;'
  +   'background:rgba(18,20,24,.97);border:1px solid #30404F;border-radius:8px;padding:11px 12px;color:#E0E0E0;font-size:11px;'
  +   'box-shadow:0 14px 40px rgba(0,0,0,.5);font-family:"IBM Plex Sans",sans-serif}'
  + '#ovis .ov-bsp h3{margin:0 0 2px;font-size:13px;color:#F2F2F2}'
  + '#ovis .ov-bsp .bsp-sub{color:#9AA7B4;margin-bottom:9px;line-height:1.45}'
  + '#ovis .ov-bsp .bsp-head{display:flex;align-items:flex-start;gap:8px}'
  + '#ovis .ov-bsp .bsp-head > div{flex:1}'
  + '#ovis .ov-bsp table{width:100%;border-collapse:collapse;table-layout:fixed}'
  + '#ovis .ov-bsp td,#ovis .ov-bsp th{padding:4px 4px;border-bottom:1px solid #262E36;vertical-align:middle}'
  + '#ovis .ov-bsp th{font-size:9px;letter-spacing:.6px;text-transform:uppercase;color:#7F8C99;font-weight:700;text-align:left}'
  + '#ovis .ov-bsp tr.row{cursor:pointer}'
  + '#ovis .ov-bsp tr.row:hover td{background:#1C232B}'
  + '#ovis .ov-bsp tr.sel td{background:#1F2E3D}'
  + '#ovis .ov-bsp .num{text-align:right;font-family:"IBM Plex Mono",monospace;white-space:nowrap}'
  + '#ovis .ov-bsp .lane{position:relative;height:12px;background:#151B21;border-radius:3px}'
  + '#ovis .ov-bsp .bar{position:absolute;top:1px;bottom:1px;border-radius:2px;background:#4A8FD8;min-width:3px}'
  + '#ovis .ov-bsp .bar.open{background:repeating-linear-gradient(135deg,#5A6B7C 0 4px,#2A3440 4px 8px)}'
  + '#ovis .ov-bsp .bar.mile{background:#7FDE9A;width:9px;min-width:9px;transform:rotate(45deg);top:1px;bottom:auto;height:9px;border-radius:1px}'
  + '#ovis .ov-bsp .det{margin-top:10px;border-top:1px solid #30404F;padding-top:8px}'
  + '#ovis .ov-bsp .det h4{margin:0 0 5px;font-size:11.5px;color:#F2F2F2}'
  + '#ovis .ov-bsp .det ul{margin:3px 0 7px 16px;padding:0;line-height:1.5;color:#CFCFCF}'
  + '#ovis .ov-bsp .det .k{font-size:9px;letter-spacing:.6px;text-transform:uppercase;color:#7F8C99;font-weight:700;margin-top:6px}'
  + '#ovis .ov-bsp .foot{margin-top:9px;color:#8A99A8;line-height:1.5}'
  + '@media(max-width:620px){#ovis .ov-bs{left:6px;right:6px;bottom:6px;padding:6px 7px}'
  +   '#ovis .ov-bs .bs-chip{min-width:76px}#ovis .ov-bs .bs-status{min-width:0;flex-basis:100%;order:5}'
  +   '#ovis .ov-bs .bs-money .bs-ip{font-size:15px}#ovis .ov-bsp{right:6px;width:calc(100% - 12px);max-height:calc(100% - 150px)}'
  +   '#ovis .ov-bs .bs-btn{padding:5px 8px}}'
  + '@media(max-width:900px){#ovis #ov-build .bs-ico{display:none}}';

  function ensureCss() {
    if (el('omega-bs-css')) return;
    var s = doc.createElement('style'); s.id = 'omega-bs-css'; s.textContent = CSS; doc.head.appendChild(s);
  }

  /* ── the button on the visualizer's bar ───────────────────────────── */
  function inject() {
    var bar = doc.querySelector('#ovis .ov-bar');
    if (!bar || el('ov-build')) return !!bar;
    ensureCss();
    var b = doc.createElement('button');
    b.className = 'ov-b'; b.id = 'ov-build'; b.setAttribute('data-module', 'plansets');
    b.title = 'Build: watch this site go up step by step, with what each step costs (the Run’s own lines) and how long it takes';
    b.innerHTML = '<span class="bs-ico">▶ </span>Build';
    b.onclick = function () { if (st) close(); else open(); };
    var ref = el('ov-refresh');
    bar.insertBefore(b, ref || null);
    /* the visualizer closing ends the player; its next open draws a new model */
    var ov = el('ovis');
    if (ov && root.MutationObserver) new root.MutationObserver(function () { if (st && !ov.classList.contains('on')) close(); })
      .observe(ov, { attributes: true, attributeFilter: ['class'] });
    return true;
  }
  /* The visualizer builds its overlay on first open, as a child of <body>:
     watch <body>'s own children (never the drawing's churn below them). */
  function watch() {
    if (inject() || !root.MutationObserver || !doc.body) return;
    var mo = new root.MutationObserver(function () { if (inject()) mo.disconnect(); });
    mo.observe(doc.body, { childList: true, subtree: false });
  }
  if (doc.body) watch(); else doc.addEventListener('DOMContentLoaded', watch);

  /* ── what the 3D model draws, sent beside the Run's quantities ────── */
  /* The open model's own pieces; with the view closed (fetch(), for Jarvis),
     the visualizer's own reading of the drawing (OmegaSiteVis.read), which
     is what it would draw, so the steps are the same either way. */
  function extras() {
    var d = el('ovis'), open = !!(d && d.classList.contains('on')), V = open ? vis() : null, site = V && V.site && V.site.items ? V.site : null, items = {}, ft = 0;
    if (!site) { try { site = root.OmegaSiteVis && root.OmegaSiteVis.read ? root.OmegaSiteVis.read() : null; } catch (e) { site = null; } }
    if (site && site.items) site.items.forEach(function (it) {
      if (!it || it.hidden || !it.arch || it.arch === 'ignore') return;
      items[it.arch] = (items[it.arch] || 0) + 1;
    });
    try { ft = typeof root._trenchDugFtAll === 'function' ? +root._trenchDugFtAll() || 0 : 0; } catch (e) {}
    var cond = V && V.layers && V.layers.conduit;
    return { trenchFt: Math.round(ft), items: items, conduit: cond ? !!(cond.children && cond.children.length) : !!(site && site.conduits && site.conduits.length) };
  }

  function request() {
    var fb = root.firebase, u = fb && fb.auth && fb.auth().currentUser;
    if (!u) return Promise.reject(new Error('Sign in to work out the build.'));
    if (typeof root.omegaCostQuantities !== 'function') return Promise.reject(new Error('The Run is not available on this page.'));
    var body;
    try { body = JSON.stringify({ q: root.omegaCostQuantities(), build: extras() }); }
    catch (e) { return Promise.reject(new Error('Could not read the drawing: ' + (e && e.message || e))); }
    return u.getIdToken().then(function (t) {
      return root.fetch('/api/build-sequence', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t }, body: body });
    }).then(function (r) {
      return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'The build service is unavailable; try again in a minute.'); return j; },
        function () { throw new Error('The build service is unavailable; try again in a minute.'); });
    });
  }

  /* ── the model, by step ───────────────────────────────────────────── */
  function index(seq) {
    var V = vis(); if (!V || !V.root || !V.site) return null;
    var byId = {}, order = {}, items = [], conduit = [];
    (V.site.items || []).forEach(function (it) { if (it) byId[it.id] = it; });
    seq.phases.forEach(function (p, i) { order[p.key] = i; });
    var layers = V.layers || {};
    Object.keys(layers).forEach(function (g) {
      var grp = layers[g]; if (!grp || !grp.children) return;
      if (g === 'conduit') {
        var k = order[seq.conduitPhase];
        if (k == null) return;
        grp.children.forEach(function (m, i) { conduit.push({ obj: m, phase: k, i: i, vis: m.visible }); });
        return;
      }
      grp.children.forEach(function (w) {
        var it = byId[w && w.userData && w.userData.itemId]; if (!it) return;
        var ph = seq.reveal && seq.reveal[it.arch], k = ph ? order[ph] : null;
        if (k == null) return;                 /* existing, or a step this drawing has none of: left as it is */
        items.push({ obj: w, phase: k, arch: it.arch, drop: !!DROP[it.arch], flat: !!FLAT[it.arch], x: w.position.x, z: w.position.z,
          y: w.position.y, sx: w.scale.x, sy: w.scale.y, sz: w.scale.z, vis: w.visible });
      });
    });
    /* within a step: the gear the rest ties into first, then across the site */
    var per = {};
    items.sort(function (a, b) { return (a.phase - b.phase) || ((RANK[a.arch] || 0) - (RANK[b.arch] || 0)) || ((a.x + a.z) - (b.x + b.z)); });
    items.forEach(function (it) { (per[it.phase] = per[it.phase] || []).push(it); });
    Object.keys(per).forEach(function (k) { var list = per[k], n = list.length; list.forEach(function (it, i) { it.t0 = n > 1 ? (i / n) * 0.62 : 0; it.len = n > 1 ? 0.38 : 0.9; }); });
    var cn = conduit.length;
    conduit.forEach(function (c) { c.at = cn ? (c.i + 1) / cn * 0.92 : 0; });
    return { V: V, site: V.site, items: items, conduit: conduit };
  }

  /* Show the model as it stands with steps 0..done finished and step `k`
     at progress p (0..1; k < 0 when nothing is moving). */
  function paint() {
    if (!st || !st.model) return;
    var done = st.done, k = st.anim ? st.anim.k : -1, p = st.anim ? st.anim.p : 0, lift = EXPLODE_FT * st.explodeT;
    st.model.items.forEach(function (it) {
      var o = it.obj, s = it.phase <= done ? 1 : it.phase === k ? (CALM ? 1 : ease((p - it.t0) / it.len)) : 0;
      o.visible = it.vis && s > 0;
      if (!(s > 0)) return;
      if (it.drop) { o.position.y = it.y + DROP_FT * (1 - s) + lift; o.scale.set(it.sx, it.sy, it.sz); }
      else if (it.flat) { var f = 0.85 + 0.15 * s; o.position.y = it.y; o.scale.set(it.sx * f, it.sy * Math.max(0.02, s), it.sz * f); }
      else { o.position.y = it.y; o.scale.set(it.sx, it.sy * Math.max(0.02, s), it.sz); }
    });
    st.model.conduit.forEach(function (c) { c.obj.visible = c.vis && (c.phase <= done || (c.phase === k && p >= c.at)); });
    st.model.V.needsRender = true;
  }

  /* Put every piece back exactly as the visualizer drew it. */
  function restore() {
    if (!st || !st.model) return;
    st.model.items.forEach(function (it) { var o = it.obj; o.visible = it.vis; o.position.y = it.y; o.scale.set(it.sx, it.sy, it.sz); });
    st.model.conduit.forEach(function (c) { c.obj.visible = c.vis; });
    st.model.V.needsRender = true;
  }

  /* ── the clock ────────────────────────────────────────────────────── */
  function loop() {
    if (!st || !st.model) return;
    st.raf = null;
    var V = vis(), d = el('ovis');
    if (!d || !d.classList.contains('on')) return;                           /* closed: picked up again on the next press */
    if (!V || V.site !== st.model.site) { stale(); return; }                 /* the model was rebuilt under us (Refresh re-reads the site into the same scene) */
    var t = now(), more = false;
    if (st.explodeGoal !== st.explodeT) {
      var dt = (t - (st.explodeAt || t)) / 450;
      st.explodeT = st.explodeGoal ? Math.min(1, st.explodeFrom + dt) : Math.max(0, st.explodeFrom - dt);
      if (st.explodeT !== st.explodeGoal) more = true;
    }
    if (st.anim && !st.anim.held) {
      st.anim.p = Math.min(1, (t - st.anim.t0) / (STEP_MS / speed));
      if (st.anim.p >= 1) { st.done = st.anim.k; st.anim = null; st.waitUntil = st.playing ? t + GAP_MS / speed : 0; }
      more = true;
    } else if (st.playing && !st.anim) {
      if (st.done >= st.seq.phases.length - 1) { st.playing = false; }
      else if (!st.waitUntil || t >= st.waitUntil) { start(st.done + 1); }
      more = more || st.playing;
    }
    paint(); status();
    if (more || st.playing) st.raf = root.requestAnimationFrame(loop);
  }
  function moving() { return !!st && (st.playing || !!(st.anim && !st.anim.held)); }
  function kick() { if (st && !st.raf) st.raf = root.requestAnimationFrame(loop); }
  /* the model the player indexed is still the one on screen */
  function fresh() {
    if (!st || !st.seq || !st.model) return false;
    var V = vis();
    if (!V || V.site !== st.model.site) { stale(); return false; }
    return true;
  }
  function start(k) { st.anim = { k: k, p: 0, t0: now() }; st.waitUntil = 0; }

  /* ── the controls ─────────────────────────────────────────────────── */
  function go(k) {                    /* jump: steps 0..k finished, nothing moving */
    if (!fresh()) return;
    k = Math.max(-1, Math.min(st.seq.phases.length - 1, +k));
    st.anim = null; st.playing = false; st.done = k; st.waitUntil = 0;
    paint(); status(); schedulePaint();
  }
  function play() {
    if (!fresh()) return;
    if (st.anim && st.anim.held) { st.anim.held = false; st.anim.t0 = now() - st.anim.p * (STEP_MS / speed); }   /* resume where it froze */
    else if (st.done >= st.seq.phases.length - 1 && !st.anim) { st.done = -1; paint(); }
    st.playing = true; st.waitUntil = 0; status(); kick();
  }
  /* Pause holds the model where it is, part way through a step included */
  function pause() { if (!st) return; st.playing = false; if (st.anim) st.anim.held = true; status(); }
  function next() {
    if (!fresh()) return;
    if (st.anim) { st.done = st.anim.k; st.anim = null; paint(); status(); return; }
    if (st.done < st.seq.phases.length - 1) { st.playing = false; start(st.done + 1); status(); kick(); }
  }
  function prev() {
    if (!fresh()) return;
    if (st.anim) { go(st.anim.k - 1); return; }
    go(st.done - 1);
  }
  function setSpeed(x) {
    if (SPEEDS.indexOf(x) < 0) return;
    if (st && st.anim) { var p = st.anim.p; speed = x; st.anim.t0 = now() - p * (STEP_MS / speed); }
    speed = x;
    try { root.localStorage.setItem('omega.build.speed', String(x)); } catch (e) {}
    status();
  }
  function explode() {
    if (!fresh()) return;
    st.explodeGoal = st.explodeGoal ? 0 : 1; st.explodeFrom = st.explodeT; st.explodeAt = now();
    var b = el('bs-explode'); if (b) { b.classList.toggle('on', !!st.explodeGoal); b.setAttribute('aria-pressed', st.explodeGoal ? 'true' : 'false'); }
    kick();
  }

  /* ── the bar ──────────────────────────────────────────────────────── */
  function bar() {
    var stage = el('ov-stage'); if (!stage) return null;
    var b = el('ov-bs');
    if (!b) { b = doc.createElement('div'); b.id = 'ov-bs'; b.className = 'ov-bs'; b.setAttribute('role', 'region'); b.setAttribute('aria-label', 'Build sequence'); stage.appendChild(b); }
    return b;
  }
  function message(text, err, retry) {
    var b = bar(); if (!b) return;
    b.innerHTML = '<div class="bs-row"><div class="bs-msg' + (err ? ' err' : '') + '">' + esc(text) + '</div>'
      + (retry ? '<button class="bs-btn" id="bs-retry">Try again</button>' : '')
      + '<button class="bs-btn bs-x" id="bs-close" title="Close the build player" aria-label="Close the build player">×</button></div>';
    var r = el('bs-retry'); if (r) r.onclick = function () { open(); };
    el('bs-close').onclick = close;
  }
  function chips() {
    return st.seq.phases.map(function (p, i) {
      return '<button class="bs-chip" data-i="' + i + '" title="' + esc(p.label) + '"><b>' + (i + 1) + ' · ' + esc(p.label) + '</b><i>'
        + (p.cents ? usd(p.amount) : (p.known === false ? 'not on file' : '—')) + '</i></button>';
    }).join('');
  }
  function draw() {
    var b = bar(); if (!b || !st || !st.seq) return;
    b.innerHTML = '<div class="bs-strip" role="group" aria-label="Steps">' + chips() + '</div>'
      + '<div class="bs-row">'
      + '<button class="bs-btn" id="bs-restart" title="Back to the start" aria-label="Back to the start">⏮</button>'
      + '<button class="bs-btn" id="bs-prev" title="Previous step" aria-label="Previous step">◀</button>'
      + '<button class="bs-btn pri" id="bs-play">▶ Play</button>'
      + '<button class="bs-btn" id="bs-next" title="Next step" aria-label="Next step">▶❙</button>'
      + '<div class="bs-speed" role="group" aria-label="Speed">' + SPEEDS.map(function (x) { return '<button data-x="' + x + '" aria-label="' + x + ' times speed">' + (x === 0.5 ? '½' : x) + '×</button>'; }).join('') + '</div>'
      + '<div class="bs-status" id="bs-status" aria-live="polite"></div>'
      + '<div class="bs-money"><span class="bs-ip" id="bs-inplace" data-cents="0">$0</span><span class="bs-of" id="bs-of">in place of ' + usd(st.seq.total) + '</span></div>'
      + '<button class="bs-btn" id="bs-explode" aria-pressed="false" title="Lift the equipment off its pads to show what is under it">Explode</button>'
      + '<button class="bs-btn" id="bs-sched" aria-pressed="false" title="Every step: days, money and how each was worked out">Schedule</button>'
      + '<button class="bs-btn bs-x" id="bs-close" title="Close the build player and show the whole site" aria-label="Close the build player">×</button>'
      + '</div>';
    Array.prototype.forEach.call(b.querySelectorAll('.bs-chip'), function (c) { c.onclick = function () { go(+c.getAttribute('data-i')); }; });
    Array.prototype.forEach.call(b.querySelectorAll('.bs-speed button'), function (c) { c.onclick = function () { setSpeed(+c.getAttribute('data-x')); }; });
    el('bs-restart').onclick = function () { go(-1); };
    el('bs-prev').onclick = prev; el('bs-next').onclick = next;
    el('bs-play').onclick = function () { if (moving()) pause(); else play(); };
    el('bs-explode').onclick = explode;
    el('bs-sched').onclick = toggleSchedule;
    el('bs-close').onclick = close;
    if (st.explodeGoal) { el('bs-explode').classList.add('on'); el('bs-explode').setAttribute('aria-pressed', 'true'); }
    status();
  }
  function dayText(p) {
    if (!p) return '';
    if (p.known === false) return p.key === 'design' ? 'before day 0 · not on file' : 'from day ' + (p.start || 0) + ' · not on file';
    if (p.key === 'energize') return 'day ' + p.start + (p.waitsOn && p.waitsOn.length ? ' + the utility’s time' : '');
    return 'days ' + p.start + '–' + p.finish + (p.crews > 1 ? ' · ' + p.crews + ' crews' : '');
  }
  function status() {
    if (!st || !st.seq || !el('bs-status')) return;
    var ph = st.seq.phases, n = ph.length, k = st.anim ? st.anim.k : st.done, cur = ph[k];
    var cents = st.done >= 0 ? ph[st.done].inPlaceCents : 0;
    if (st.anim) { var a = ph[st.anim.k], before = st.anim.k > 0 ? ph[st.anim.k - 1].inPlaceCents : 0; cents = Math.round(before + (a.inPlaceCents - before) * ease(st.anim.p)); }
    var ip = el('bs-inplace');
    ip.textContent = usd(cents / 100); ip.setAttribute('data-cents', String(st.anim ? -1 : cents));
    ip.title = usdCents(cents) + ' in place';
    var s = el('bs-status');
    if (k < 0) s.innerHTML = '<b>Ready to build</b> · ' + n + ' steps<br><span>' + st.seq.schedule.workingDays + ' working days'
      + (st.seq.schedule.plus ? ' ' + esc(st.seq.schedule.plus) : '') + '</span>';
    else s.innerHTML = '<b>Step ' + (k + 1) + ' of ' + n + ' · ' + esc(cur.label) + '</b><br><span>' + esc(dayText(cur))
      + ' · of ' + st.seq.schedule.workingDays + ' working days</span>';
    var play = el('bs-play');
    if (play) play.textContent = moving() ? '❚❚ Pause' : (st.done >= n - 1 && !st.anim ? '↻ Replay' : '▶ Play');
    if (play) play.setAttribute('aria-pressed', moving() ? 'true' : 'false');
    Array.prototype.forEach.call(doc.querySelectorAll('#ov-bs .bs-chip'), function (c) {
      var i = +c.getAttribute('data-i');
      c.classList.toggle('done', i <= st.done && !(st.anim && i === st.anim.k));
      c.classList.toggle('now', st.anim ? i === st.anim.k : i === st.done);
      if (st.anim ? i === st.anim.k : i === st.done) { c.setAttribute('aria-current', 'step'); try { if (st.lastChip !== i) { st.lastChip = i; c.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } } catch (e) {} }
      else c.removeAttribute('aria-current');
    });
    Array.prototype.forEach.call(doc.querySelectorAll('#ov-bs .bs-speed button'), function (c) { c.classList.toggle('on', +c.getAttribute('data-x') === speed); });
    var pr = el('bs-prev'), nx = el('bs-next');
    if (pr) pr.disabled = st.done < 0 && !st.anim;
    if (nx) nx.disabled = st.done >= n - 1 && !st.anim;
    if (st.schedOpen && st.schedFollow && st.schedFor !== k) schedulePaint();
  }

  /* ── the schedule: every step, its days, its money and its working ── */
  function toggleSchedule() {
    if (!st) return;
    var p = el('ov-bsp');
    if (p) { p.parentNode.removeChild(p); st.schedOpen = false; }
    else { st.schedOpen = true; st.schedFollow = true; schedulePaint(); }
    var b = el('bs-sched'); if (b) { b.classList.toggle('on', !!st.schedOpen); b.setAttribute('aria-pressed', st.schedOpen ? 'true' : 'false'); }
  }
  function schedulePaint() {
    if (!st || !st.seq || !st.schedOpen) return;
    var stage = el('ov-stage'), p = el('ov-bsp'); if (!stage) return;
    if (!p) { p = doc.createElement('div'); p.id = 'ov-bsp'; p.className = 'ov-bsp'; p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', 'Build schedule'); stage.appendChild(p); }
    var bs = el('ov-bs'); p.style.bottom = ((bs ? bs.offsetHeight : 90) + 18) + 'px';
    var seq = st.seq, D = Math.max(1, seq.schedule.workingDays), cur = st.anim ? st.anim.k : st.done;
    var sel = st.schedFollow ? Math.max(0, cur) : st.schedSel;
    st.schedFor = cur;
    var rows = seq.phases.map(function (ph, i) {
      var lane;
      if (ph.key === 'design') lane = '<div class="bar open" style="left:0;width:6%" title="before day 0"></div>';
      else if (ph.key === 'energize') lane = '<div class="bar mile" style="left:calc(' + (ph.start / D * 100) + '% - 5px)"></div>';
      else if (ph.known === false) lane = '<div class="bar open" style="left:' + (ph.start / D * 100) + '%;right:0"></div>';
      else lane = '<div class="bar" style="left:' + (ph.start / D * 100) + '%;width:' + (ph.days / D * 100) + '%"></div>';
      return '<tr class="row' + (i === sel ? ' sel' : '') + '" data-i="' + i + '"><td style="width:31%">' + (i + 1) + '. ' + esc(ph.label) + '</td>'
        + '<td><div class="lane">' + lane + '</div></td>'
        + '<td class="num" style="width:17%">' + esc(ph.known === false ? 'not on file' : ph.key === 'energize' ? 'day ' + ph.start : ph.days + (ph.days === 1 ? ' day' : ' days')) + '</td>'
        + '<td class="num" style="width:17%">' + (ph.cents ? usd(ph.amount) : '—') + '</td></tr>';
    }).join('');
    var s = seq.phases[sel] || seq.phases[0], det = '';
    if (s) {
      det = '<div class="det"><h4>' + (s.index + 1) + '. ' + esc(s.label) + ' · ' + esc(dayText(s)) + '</h4>';
      if (s.lines.length) det += '<div class="k">Money (the Run’s lines)</div><ul>' + s.lines.map(function (l) {
        return '<li>' + esc(l.label) + ': <b>' + usd(l.amount) + '</b>' + (l.contingency ? ' <span style="color:#8A99A8">incl. the Run’s ' + Math.round(seq.contPct * 100) + '% contingency</span>' : '') + '</li>';
      }).join('') + '</ul>';
      if (s.conduitBom) det += '<div class="k">On the BOM, not in the total</div><ul><li>Conduit: ' + usd(s.conduitBom) + '</li></ul>';
      if (s.basis.length) det += '<div class="k">How long, and why</div><ul>' + s.basis.map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('') + '</ul>';
      if (s.notes.length) det += '<div class="k">Notes</div><ul>' + s.notes.map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('') + '</ul>';
      det += '<div style="color:#8A99A8">In place after this step: <b style="color:#7FDE9A">' + usd(s.inPlace) + '</b> of ' + usd(seq.total) + '</div></div>';
    }
    p.innerHTML = '<div class="bsp-head"><div><h3>Schedule &amp; money</h3><div class="bsp-sub">' + seq.schedule.workingDays + ' working days'
      + (seq.schedule.plus ? ', ' + esc(seq.schedule.plus) : '') + '. In place at the end: <b>' + usd(seq.total) + '</b>, the Run total.</div></div>'
      + '<button class="bs-btn" id="bsp-csv" style="background:#22303D;border:1px solid #30404F;color:#E0E0E0;border-radius:4px;padding:5px 9px;cursor:pointer;font:inherit;font-size:11px">Download CSV</button>'
      + '<button class="bs-btn" id="bsp-close" aria-label="Close the schedule" style="background:#22303D;border:1px solid #30404F;color:#E0E0E0;border-radius:4px;padding:4px 9px;cursor:pointer;font-size:14px;line-height:1">×</button></div>'
      + '<table><thead><tr><th style="width:31%">Step</th><th>Working days</th><th class="num" style="width:17%">Takes</th><th class="num" style="width:17%">Money</th></tr></thead><tbody>' + rows + '</tbody></table>'
      + det
      + '<div class="foot">' + esc(seq.schedule.basis) + (seq.notes || []).map(function (n) { return ' ' + esc(n); }).join('')
      + (seq.contracted ? '' : ' Money is the Run’s, by line, with its contingency where the Run applies it.') + '</div>';
    Array.prototype.forEach.call(p.querySelectorAll('tr.row'), function (r) { r.onclick = function () { st.schedFollow = false; st.schedSel = +r.getAttribute('data-i'); schedulePaint(); }; });
    el('bsp-close').onclick = toggleSchedule;
    el('bsp-csv').onclick = csv;
  }
  function csv() {
    if (!st || !st.seq) return;
    var cell = typeof root._csvCell === 'function' ? root._csvCell : function (v) { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var rows = [['Step', 'Start (working day)', 'Finish (working day)', 'Working days', 'Crew-days', 'Crews', 'Money', 'In place after', 'How long, and why', 'Notes']];
    st.seq.phases.forEach(function (p, i) {
      rows.push([(i + 1) + '. ' + p.label, p.start == null ? 'before day 0' : p.start, p.finish == null ? 'not on file' : p.finish,
        p.days == null ? 'not on file' : p.days, p.crewDays == null ? '' : p.crewDays, p.crews || '', (p.cents / 100).toFixed(2), (p.inPlaceCents / 100).toFixed(2),
        p.basis.join('; '), p.notes.join(' ')]);
    });
    rows.push(['Total', '', '', st.seq.schedule.workingDays, '', '', (st.seq.cents / 100).toFixed(2), (st.seq.cents / 100).toFixed(2), st.seq.schedule.basis + (st.seq.schedule.plus ? ' (' + st.seq.schedule.plus + ')' : ''), (st.seq.notes || []).join(' ')]);
    var text = rows.map(function (r) { return r.map(cell).join(','); }).join('\n');
    var name = 'build-sequence';
    try { var t = (root.S && (root.S.projectName || root.S.name)) || ''; if (t) name = String(t).replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) + '-build-sequence'; } catch (e) {}
    try {
      var url = root.URL.createObjectURL(new root.Blob([text], { type: 'text/csv' })), a = doc.createElement('a');
      a.href = url; a.download = name + '.csv'; doc.body.appendChild(a); a.click(); doc.body.removeChild(a);
      setTimeout(function () { root.URL.revokeObjectURL(url); }, 2000);
    } catch (e) {}
    st.lastCsv = text;
  }

  /* ── open and close ───────────────────────────────────────────────── */
  function open() {
    var d = el('ovis'); if (!d || !d.classList.contains('on')) { if (root.OmegaSiteVis && root.OmegaSiteVis.open) root.OmegaSiteVis.open(); }
    if (st) { restore(); teardown(); }
    var V = vis();
    if (!V || !V.root || !V.site) { st = { seq: null }; message('The 3D model is still loading; press Build again in a moment.', false, false); return Promise.resolve(null); }
    st = { seq: null, done: -1, playing: false, anim: null, explodeT: 0, explodeGoal: 0, explodeFrom: 0, schedOpen: false, schedFollow: true };
    var b = el('ov-build'); if (b) b.classList.add('on');
    message('Working out the build from the Run…', false, false);
    var mine = st;
    return request().then(function (seq) {
      if (st !== mine) return null;
      var model = index(seq);
      if (!model) { message('The 3D model was closed or rebuilt; press Build again.', false, false); return null; }
      st.seq = seq; st.model = model;
      draw(); paint();
      if (CALM) go(seq.phases.length - 1); else play();
      return seq;
    }, function (err) {
      if (st !== mine) return null;
      message(err && err.message ? err.message : String(err), true, true);
      return null;
    });
  }
  function teardown() {
    if (st && st.raf) { try { root.cancelAnimationFrame(st.raf); } catch (e) {} }
    var b = el('ov-bs'); if (b) b.parentNode.removeChild(b);
    var p = el('ov-bsp'); if (p) p.parentNode.removeChild(p);
    var btn = el('ov-build'); if (btn) btn.classList.remove('on');
    st = null;
  }
  function close() { restore(); teardown(); }
  function stale() {
    teardown();
    st = { seq: null };
    message('The 3D model was rebuilt (Refresh or an edit); press Build to start again.', false, false);
  }

  root.OmegaBuildSequence = {
    open: open, close: close, play: play, pause: pause, next: next, prev: prev, go: go, speed: setSpeed, explode: explode,
    schedule: toggleSchedule, csv: csv,
    /* the server's steps for the drawing as it stands, without the player
       (the site agent's omega_build_sequence reads them) */
    fetch: request,
    state: function () {
      if (!st || !st.seq) return st ? { open: true, seq: null } : null;
      return { open: true, done: st.done, playing: st.playing, animating: !!st.anim, held: !!(st.anim && st.anim.held), progress: st.anim ? st.anim.p : null, speed: speed, explode: !!st.explodeGoal,
        steps: st.seq.phases.length, total: st.seq.total, cents: st.seq.cents,
        inPlaceCents: st.done >= 0 ? st.seq.phases[st.done].inPlaceCents : 0, seq: st.seq,
        pieces: st.model ? st.model.items.length : 0, conduit: st.model ? st.model.conduit.length : 0, lastCsv: st.lastCsv || null };
    }
  };
})(typeof window !== 'undefined' ? window : this);
