/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   omega-editor-recovery.js — a local draft of the Site Map drawing.

   Firestore is the record. This file is the copy that survives a crashed
   tab, a failed save, or a close before anyone has signed in. It never
   writes the project. A draft is offered, never applied on its own, and
   only when it belongs to the same project and is newer than the copy
   this tab loaded.

   ES5 on purpose: the editor runs in the browsers a field laptop still has.
*/
(function (root) {
  'use strict';

  var PREFIX = 'cs_editor_draft_v1_';
  var MAX_BYTES = 1500000;
  var MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
  var DEBOUNCE_MS = 1200;

  function projectKey(id) {
    id = (id == null) ? '' : String(id);
    if (!id || id === '__new__') return '__new__';
    return id;
  }

  function storageKey(id) { return PREFIX + projectKey(id); }

  function clone(v) {
    if (v == null) return null;
    return JSON.parse(JSON.stringify(v));
  }

  /* Per-table PV geometry rebuilds from the array. It is the usual reason a
     drawing crosses the localStorage quota, and dropping it does not drop
     the array the person drew. */
  function shedShape(sh) {
    if (!sh || typeof sh !== 'object' || !sh.tables) return sh;
    var c = {}, k;
    for (k in sh) {
      if (Object.prototype.hasOwnProperty.call(sh, k) && k !== 'tables') c[k] = sh[k];
    }
    c.tables = null;
    c._tablesShed = true;
    return c;
  }

  function counts(d) {
    d = d || {};
    return ((d.elements && d.elements.length) || 0)
      + ((d.conduits && d.conduits.length) || 0)
      + ((d.shapes && d.shapes.length) || 0)
      + ((d.trenches && d.trenches.length) || 0)
      + (d.trench ? 1 : 0);
  }

  function pack(state, meta) {
    state = state || {};
    meta = meta || {};
    var shapes = [];
    var src = state.shapes || [];
    var i;
    for (i = 0; i < src.length; i++) shapes.push(shedShape(src[i]));
    var draft = {
      v: 1,
      projectId: projectKey(meta.projectId),
      name: meta.name || '',
      address: meta.address || '',
      at: (typeof meta.at === 'number') ? meta.at : Date.now(),
      elements: state.elements || [],
      conduits: state.conduits || [],
      shapes: shapes,
      trench: (state._trench != null) ? state._trench : (state.trench || null),
      trenches: state._trenches || state.trenches || [],
      pxPerFt: state.pxPerFt || null,
      unitLabel: state.unitLabel || 'ft',
      bessList: state.bessList || []
    };
    var json;
    try { json = JSON.stringify(draft); }
    catch (e) { return { ok: false, reason: 'serialize' }; }
    if (json.length > MAX_BYTES) {
      draft.bessList = [];
      draft.shapes = [];
      for (i = 0; i < shapes.length; i++) {
        var sh = shapes[i];
        if (sh && sh.pts && sh.pts.length > 400) {
          var c = {}, k;
          for (k in sh) if (Object.prototype.hasOwnProperty.call(sh, k)) c[k] = sh[k];
          c.pts = sh.pts.slice(0, 400);
          c._ptsTrimmed = sh.pts.length;
          sh = c;
        }
        draft.shapes.push(sh);
      }
      try { json = JSON.stringify(draft); }
      catch (e2) { return { ok: false, reason: 'serialize' }; }
      if (json.length > MAX_BYTES) return { ok: false, reason: 'size', bytes: json.length };
    }
    return { ok: true, draft: draft, json: json, bytes: json.length };
  }

  /* Offer a restore only for this project, only while the draft is recent,
     and only when the server copy this tab loaded is older (or there is
     no server copy). A draft from another project must never be proposed. */
  function offer(draft, ctx) {
    ctx = ctx || {};
    if (!draft || draft.v !== 1) return { offer: false, reason: 'none' };
    if (!counts(draft)) return { offer: false, reason: 'empty' };
    var now = ctx.now || Date.now();
    if (!draft.at || (now - draft.at) > MAX_AGE_MS || draft.at > now + 60000) {
      return { offer: false, reason: 'stale' };
    }
    if (projectKey(draft.projectId) !== projectKey(ctx.projectId)) {
      return { offer: false, reason: 'other-project' };
    }
    if (ctx.loadedUpdatedAt != null && draft.at <= (+ctx.loadedUpdatedAt) + 1000) {
      return { offer: false, reason: 'server-newer' };
    }
    return { offer: true, reason: 'newer' };
  }

  function sameDrawing(a, b) {
    try {
      return JSON.stringify(a && a.elements) === JSON.stringify(b && b.elements)
        && JSON.stringify(a && a.conduits) === JSON.stringify(b && b.conduits)
        && JSON.stringify(a && a.shapes) === JSON.stringify(b && b.shapes)
        && JSON.stringify(a && a.trenches) === JSON.stringify(b && b.trenches)
        && JSON.stringify(a && a.trench) === JSON.stringify(b && b.trench);
    } catch (e) { return false; }
  }

  function write(store, state, meta) {
    var packed = pack(state, meta);
    if (!packed.ok) return packed;
    if (!counts(packed.draft)) return { ok: false, reason: 'empty' };
    try { store.setItem(storageKey(meta && meta.projectId), packed.json); }
    catch (e) { return { ok: false, reason: 'quota' }; }
    return packed;
  }

  function read(store, projectId) {
    var raw = null;
    try { raw = store.getItem(storageKey(projectId)); }
    catch (e) { return null; }
    if (!raw) return null;
    try { return JSON.parse(raw); }
    catch (e2) { return null; }
  }

  function forget(store, projectId) {
    try { store.removeItem(storageKey(projectId)); } catch (e) {}
  }

  function applyTo(S, draft) {
    if (!S || !draft) return false;
    S.elements = clone(draft.elements || []);
    S.conduits = clone(draft.conduits || []);
    S.shapes = clone(draft.shapes || []);
    S._trench = draft.trench ? clone(draft.trench) : null;
    S._trenches = clone(draft.trenches || []);
    if (draft.bessList) S.bessList = clone(draft.bessList);
    var owns = false;
    try { owns = (typeof _viewOwnsScale === 'function') && _viewOwnsScale(); }
    catch (e) { owns = false; }
    if (!owns) {
      if (draft.pxPerFt) S.pxPerFt = draft.pxPerFt;
      if (draft.unitLabel) S.unitLabel = draft.unitLabel;
    }
    return true;
  }

  var R = {
    PREFIX: PREFIX,
    MAX_BYTES: MAX_BYTES,
    MAX_AGE_MS: MAX_AGE_MS,
    projectKey: projectKey,
    storageKey: storageKey,
    pack: pack,
    counts: counts,
    offer: offer,
    sameDrawing: sameDrawing,
    write: write,
    read: read,
    forget: forget,
    applyTo: applyTo
  };

  function store() {
    try { return root.localStorage; }
    catch (e) { return null; }
  }

  function metaNow() {
    var name = '', address = '';
    try {
      var n = document.getElementById('pname');
      if (n && n.value) name = n.value;
    } catch (e) {}
    try {
      var a = document.getElementById('addr-in');
      if (a && a.value) address = a.value;
    } catch (e2) {}
    return {
      projectId: root._projectId || '',
      name: name,
      address: address,
      at: Date.now()
    };
  }

  function flush() {
    var st = store();
    if (!st || !root.S) return { ok: false, reason: 'unavailable' };
    if (!root._workDirty && !root._saveInFlight) return { ok: false, reason: 'clean' };
    var result = write(st, root.S, metaNow());
    if (!result.ok && result.reason !== 'empty' && result.reason !== 'clean' && !root.__omegaRecoveryWarned) {
      root.__omegaRecoveryWarned = true;
      try {
        if (typeof showBanner === 'function') {
          showBanner('wiz', 'This drawing is too large to keep a recovery copy in this browser. Save it before you close the tab.');
        }
      } catch (e) {}
    }
    return result;
  }

  var pending = null;
  function schedule() {
    if (pending) clearTimeout(pending);
    pending = setTimeout(function () { pending = null; try { flush(); } catch (e) {} }, DEBOUNCE_MS);
  }

  function hideBar() {
    var bar = document.getElementById('omega-recovery-bar');
    if (bar) bar.style.display = 'none';
  }

  function repaint() {
    var S = root.S;
    if (!S) return;
    try {
      var els = document.getElementById('els'); if (els) els.innerHTML = '';
      var csvg = document.getElementById('csvg'); if (csvg) csvg.innerHTML = '';
    } catch (e) {}
    try { if (typeof _ensureDimArrows === 'function') _ensureDimArrows(); } catch (e1) {}
    var i;
    var elements = S.elements || [];
    for (i = 0; i < elements.length; i++) { try { renderEl(elements[i]); } catch (e2) {} }
    var conduits = S.conduits || [];
    for (i = 0; i < conduits.length; i++) { try { renderConduit(conduits[i]); } catch (e3) {} }
    if (typeof renderShape === 'function') {
      var shapes = S.shapes || [];
      for (i = 0; i < shapes.length; i++) { try { renderShape(shapes[i]); } catch (e4) {} }
    }
    try { if (S._trench && typeof renderTrenchSpine === 'function') renderTrenchSpine(); } catch (e5) {}
    try {
      if (S._trenches && S._trenches.length && typeof _dcfcRenderTrenches === 'function') _dcfcRenderTrenches();
    } catch (e6) {}
    try { if (typeof updCount === 'function') updCount(); } catch (e7) {}
    try { if (typeof updCondStat === 'function') updCondStat(); } catch (e8) {}
    try { if (typeof renderLegend === 'function') renderLegend(); } catch (e9) {}
    try { if (typeof updShapeCount === 'function') updShapeCount(); } catch (e10) {}
    try { if (typeof renderBessList === 'function') renderBessList(); } catch (e11) {}
  }

  var shown = null;

  function restore() {
    var S = root.S;
    if (!shown || !S) return false;
    try {
      if (!S.history || !S.history.length) {
        if (typeof root.pushHist === 'function') root.pushHist();
      }
    } catch (e) {}
    applyTo(S, shown);
    try {
      var n = document.getElementById('pname');
      if (n && shown.name) n.value = shown.name;
      var a = document.getElementById('addr-in');
      if (a && shown.address) a.value = shown.address;
    } catch (e2) {}
    repaint();
    try { if (typeof root.pushHist === 'function') root.pushHist(); } catch (e3) {}
    try { if (typeof root._setSaved === 'function') root._setSaved('unsaved'); } catch (e4) {}
    root._workDirty = true;
    hideBar();
    try {
      if (typeof showBanner === 'function') showBanner('cal', 'Restored the drawing saved in this browser. It is not on the server until you save.');
    } catch (e5) {}
    return true;
  }

  function discard() {
    var st = store();
    if (st) forget(st, root._projectId || (shown && shown.projectId) || '');
    shown = null;
    hideBar();
  }

  function show(draft) {
    shown = draft;
    var bar = document.getElementById('omega-recovery-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'omega-recovery-bar';
      bar.setAttribute('role', 'status');
      bar.style.cssText = 'position:absolute;left:12px;right:12px;top:12px;z-index:80;display:none;'
        + 'background:#0E1B33;color:#E8EEF8;border:1px solid #C5A55A;border-radius:8px;'
        + 'padding:10px 12px;font:13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;'
        + 'box-shadow:0 8px 24px rgba(0,0,0,.28)';
      var host = document.getElementById('sc') || document.body;
      if (host && root.getComputedStyle && root.getComputedStyle(host).position === 'static') {
        host.style.position = 'relative';
      }
      host.appendChild(bar);
      bar.innerHTML = '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">'
        + '<span id="omega-recovery-msg" style="flex:1;min-width:220px"></span>'
        + '<button type="button" id="omega-recovery-restore" style="background:#2B5FA8;color:#fff;border:0;border-radius:6px;padding:6px 12px;font:600 13px/1 inherit;cursor:pointer">Restore</button>'
        + '<button type="button" id="omega-recovery-discard" style="background:transparent;color:#E8EEF8;border:1px solid #8FA4C4;border-radius:6px;padding:6px 12px;font:600 13px/1 inherit;cursor:pointer">Discard</button>'
        + '</div>';
      document.getElementById('omega-recovery-restore').onclick = function () { try { restore(); } catch (e) {} };
      document.getElementById('omega-recovery-discard').onclick = function () { try { discard(); } catch (e) {} };
    }
    var when = '';
    try { when = new Date(draft.at).toLocaleString([], { hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric' }); }
    catch (e) { when = ''; }
    var n = counts(draft);
    var msg = document.getElementById('omega-recovery-msg');
    if (msg) {
      msg.textContent = 'This browser has a drawing' + (when ? (' from ' + when) : '')
        + ' (' + n + (n === 1 ? ' item' : ' items') + ') that was not saved'
        + (draft.name ? (' — ' + draft.name) : '') + '.';
    }
    bar.style.display = 'block';
  }

  function consider() {
    var st = store();
    if (!st || !root.S) return { offer: false, reason: 'unavailable' };
    var id = root._projectId || '';
    var draft = read(st, id);
    var decision = offer(draft, {
      projectId: id,
      loadedUpdatedAt: (root._loadedUpdatedAt != null) ? root._loadedUpdatedAt : null,
      now: Date.now()
    });
    if (!decision.offer) return decision;
    var current = pack(root.S, { projectId: id, at: draft.at });
    if (current.ok && sameDrawing(current.draft, draft)) return { offer: false, reason: 'already' };
    show(draft);
    return decision;
  }

  function hookHistory() {
    if (typeof root.pushHist !== 'function' || root.pushHist.__omegaRecovery) return;
    var orig = root.pushHist;
    var wrapped = function () {
      var r = orig.apply(this, arguments);
      try { schedule(); } catch (e) {}
      return r;
    };
    wrapped.__omegaRecovery = true;
    root.pushHist = wrapped;
  }

  function hookSaved() {
    if (typeof root._setSaved !== 'function' || root._setSaved.__omegaRecovery) return;
    var orig = root._setSaved;
    var wrapped = function (s) {
      var r = orig.apply(this, arguments);
      try {
        if (s === 'saved') {
          var st = store();
          if (st) forget(st, root._projectId || '');
        } else if (s === 'err' || s === 'stale') flush();
      } catch (e) {}
      return r;
    };
    wrapped.__omegaRecovery = true;
    root._setSaved = wrapped;
  }

  function wantsProject() {
    try { return /[?&]project=/.test(root.location && root.location.search || ''); }
    catch (e) { return false; }
  }

  function install() {
    if (root.__omegaRecoveryInstalled) return;
    root.__omegaRecoveryInstalled = true;
    hookHistory();
    hookSaved();
    root.addEventListener('beforeunload', function () { try { flush(); } catch (e) {} });
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      hookHistory();
      hookSaved();
      var waiting = wantsProject() && (!root._projectId || !root._loadReady);
      if (waiting && tries < 40) return;
      if (!wantsProject() && tries < 6) return;
      clearInterval(iv);
      try { consider(); } catch (e) {}
    }, 200);
  }

  R.flush = flush;
  R.consider = consider;
  R.restore = restore;
  R.discard = discard;
  R.install = install;

  root.OmegaEditorRecovery = R;
  if (typeof module !== 'undefined' && module.exports) module.exports = R;

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
    else install();
  }
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
