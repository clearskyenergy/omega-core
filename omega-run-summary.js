/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   The Run, pinned to Site Map: the money while you draw (Blueprint to Build,
   Phase 4; docs/BLUEPRINT-TO-BUILD.md; 2026-10-16, Tommy: "Push it and
   continue with the builds", after a Perplexity ad whose total never left
   the screen).

   A slim readout beside the Run button (#rr-sum) shows the Run total as the
   server prices the drawing (window._COST_TOTAL, which updateCostEst keeps
   current as pieces go down) and, once a Run has priced THIS drawing, the
   Results rail's own $/W and 10-year IRR (window._RR_FIN, published by
   omegaRenderResults). Nothing is worked out here: every figure is the
   server's or the rail's, and the IRR shows only once revenue is modelled
   (the rail's own rule).

   After a save of a drawing that changed in this tab, the Run re-runs by
   itself once the drawing has sat saved for a moment (DEBOUNCE_MS): the
   same omegaRunDesign the Run button presses, which ends with omegaRunSave,
   the existing save of a priced run. Read-only and unchecked plans wait for
   the Run button, as they do today (omegaRunMayWrite, the gate omegaRunSave
   asks). A project only opened, never changed, is never re-run or written.
   The rules are decide() below, pure, held by scripts/tests/trunsummary.js.
   ES5, no build step. */
(function (root) {
  'use strict';
  var doc = root.document;

  var TICK_MS = 600, DEBOUNCE_MS = 2500, PRESSED_WAIT_MS = 1000;

  /* ── the rules ────────────────────────────────────────────────────── */
  /* o: what the page shows this tick — stale (the drawing changed since the
     last Run), running, mayWrite (omegaRunMayWrite), dirty (unsaved work),
     stamp (the time of the last save, window._loadedUpdatedAt), pressed (a
     pointer is down), now. st: what this keeps between ticks. Returns the
     next st and what to do: 'run' or null.
     A change counts only when the results go from current to stale in this
     tab (after a Run, or after a loaded project's history is re-seeded):
     a new drawing never Run, or a project only opened, is never re-run. */
  function decide(st, o) {
    st = st || {};
    var n = { seen: st.seen, stamp: st.stamp, fresh: !!st.fresh, touched: !!st.touched, due: st.due == null ? null : st.due }, act = null;
    if (!n.seen) { n.seen = true; n.stamp = o.stamp; }           /* the load's own save is not a save of this tab's work */
    if (!o.stale) n.fresh = true;
    else if (n.fresh) { n.touched = true; n.fresh = false; }     /* someone changed the drawing here since it was current */
    if (o.stamp !== n.stamp) {                                   /* a save just finished */
      n.stamp = o.stamp;
      if (n.touched && o.stale && !o.dirty) { n.due = o.now + DEBOUNCE_MS; n.touched = false; }
    }
    if (n.due != null) {
      if (!o.stale || !o.mayWrite) n.due = null;                 /* run by hand, or a plan that waits */
      else if (o.dirty) { n.due = null; n.touched = true; }      /* still drawing: the next save re-arms it */
      else if (o.now >= n.due) {
        if (o.running) n.due = o.now + PRESSED_WAIT_MS;
        else if (o.pressed) n.due = o.now + PRESSED_WAIT_MS;     /* never under a drag */
        else { n.due = null; act = 'run'; }
      }
    }
    return { st: n, action: act };
  }

  /* What the segment says, from what the page shows. */
  function view(o) {
    var total = +o.total || 0, fin = o.fin || null, out = { show: total > 0 || !!fin, state: 'current', total: total, perW: null, irr: null, note: '' };
    if (o.running) { out.state = 'running'; out.note = 'running…'; }
    else if (o.stale) {
      out.state = 'stale';
      out.note = o.due ? 'updating…' : !o.mayWrite ? 'press Run' : 'updates when saved';
    } else if (fin) {
      out.perW = fin.perW != null && isFinite(fin.perW) ? fin.perW : null;
      out.irr = fin.irr != null && isFinite(fin.irr) ? fin.irr : null;
    }
    if (o.pending && out.state !== 'running') out.pending = true;
    return out;
  }

  var api = { decide: decide, view: view, DEBOUNCE_MS: DEBOUNCE_MS };
  if (!doc) { if (typeof module === 'object' && module.exports) module.exports = api; return; }

  /* ── the page ─────────────────────────────────────────────────────── */
  var st = { rules: {}, pressed: false, sig: '', runs: 0, timer: null };
  function el(id) { return doc.getElementById(id); }
  function money(x) { return '$' + Math.round(+x || 0).toLocaleString('en-US'); }
  function S_() { try { return root.S || null; } catch (e) { return null; } }
  function observe() {
    var S = S_() || {};
    var may = false; try { may = typeof root.omegaRunMayWrite === 'function' && !!root.omegaRunMayWrite(); } catch (e) {}
    return { stale: !!S.resultsStale, running: !!S.running, mayWrite: may, dirty: !!root._workDirty, stamp: root._loadedUpdatedAt || null,
      pressed: st.pressed, now: Date.now(), total: root._COST_TOTAL, pending: !!root._COST_PENDING, fin: S.lastRunAt ? root._RR_FIN || null : null };
  }

  var CSS = ''
  + '#rr-sum{display:none;align-items:center;gap:5px;height:26px;padding:0 9px;margin:0 8px 0 -2px;border-radius:var(--radius-md,6px);border:1px solid transparent;'
  +   'cursor:pointer;user-select:none;-webkit-user-select:none;white-space:nowrap;min-width:0;overflow:hidden;flex-shrink:1;'
  +   'font:500 10.5px var(--font-mono,"IBM Plex Mono",monospace);color:var(--sub)}'
  + '#rr-sum.on{display:flex}'
  + '#rr-sum:hover{border-color:var(--border);color:var(--text)}'
  + '#rr-sum .rs-dot{width:6px;height:6px;border-radius:50%;background:var(--green,#1DB954);flex-shrink:0}'
  + '#rr-sum.stale .rs-dot,#rr-sum.running .rs-dot{background:#D8A23E}'
  + '#rr-sum.running .rs-dot{animation:rsPulse 1s ease-in-out infinite}'
  + '#rr-sum b{color:var(--text);font-weight:600}'
  + '#rr-sum .rs-n{color:#D8A23E}'
  + '@keyframes rsPulse{50%{opacity:.35}}'
  + '@media (prefers-reduced-motion:reduce){#rr-sum.running .rs-dot{animation:none}}'
  + '@media (max-width:768px){#rr-sum .rs-w{display:none}}';
  function styles() { if (el('rs-css')) return; var s = doc.createElement('style'); s.id = 'rs-css'; s.textContent = CSS; (doc.head || doc.documentElement).appendChild(s); }

  function paint(o, due) {
    var seg = el('rr-sum'); if (!seg) return;
    var v = view({ total: o.total, fin: o.fin, running: o.running, stale: o.stale, mayWrite: o.mayWrite, due: due, pending: o.pending });
    var sig = JSON.stringify(v); if (sig === st.sig) return; st.sig = sig;
    if (!v.show) { seg.className = ''; seg.innerHTML = ''; seg.removeAttribute('data-state'); return; }
    var h = '<span class="rs-dot"></span><b>' + money(v.total) + (v.pending ? '…' : '') + '</b>';
    if (v.state === 'current') {
      if (v.perW != null) h += '<span class="rs-w">·</span><b class="rs-w">$' + v.perW.toFixed(2) + '/W</b>';
      if (v.irr != null) h += '<span>·</span><span>IRR</span><b>' + v.irr.toFixed(1) + '%</b>';
    } else h += '<span>·</span><span class="rs-n">' + v.note + '</span>';
    seg.innerHTML = h;
    seg.className = 'on ' + v.state;
    seg.setAttribute('data-state', v.state);
    seg.title = v.state === 'current'
      ? 'The Run total' + (v.perW != null ? ', its $/W' : '') + (v.irr != null ? ' and its 10-year IRR' : '') + ', as the Results rail has them. The IRR shows once revenue is modelled (Cost › Revenue, or Analyze › Value Stack). Click to open the Results rail.'
      : v.state === 'running' ? 'Running the design.'
      : v.note === 'press Run' ? 'The total follows the drawing as it is priced. This plan waits for the Run button to update the results. Click to run now.'
      : 'The total follows the drawing as it is priced; the results update by themselves shortly after the drawing is saved. Click to run now.';
  }

  function tick() {
    var o = observe(), r = decide(st.rules, o);
    st.rules = r.st;
    if (r.action === 'run' && typeof root.omegaRunDesign === 'function') { st.runs++; try { root.omegaRunDesign(); } catch (e) {} }
    paint(o, st.rules.due != null);
  }

  function click() {
    var S = S_() || {};
    if (S.running) return;
    if (S.resultsStale) { if (typeof root.omegaRunDesign === 'function') root.omegaRunDesign(); return; }
    var rr = el('rr');
    if (rr && rr.classList.contains('rr-collapsed') && typeof root.omegaRailToggle === 'function') root.omegaRailToggle();
    var g = el('rr-g-fin');
    if (g && g.classList.contains('rr-shut') && typeof root.omegaGrpToggle === 'function') root.omegaGrpToggle('rr-g-fin');
    if (g && g.scrollIntoView) try { g.scrollIntoView({ block: 'nearest' }); } catch (e) {}
  }

  function boot() {
    styles();
    var seg = el('rr-sum'); if (seg && !seg.getAttribute('data-wired')) { seg.setAttribute('data-wired', '1'); seg.addEventListener('click', click); }
    /* a pointer held down is a drag in progress: the re-run waits for it */
    doc.addEventListener('pointerdown', function () { st.pressed = true; }, true);
    doc.addEventListener('pointerup', function () { st.pressed = false; }, true);
    doc.addEventListener('pointercancel', function () { st.pressed = false; }, true);
    if (!st.timer) st.timer = setInterval(tick, TICK_MS);
    tick();
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot); else boot();

  root.OmegaRunSummary = { decide: decide, view: view, tick: tick, _state: function () { return st; } };
})(typeof window !== 'undefined' ? window : this);
