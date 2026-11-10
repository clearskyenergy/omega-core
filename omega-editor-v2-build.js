/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * Places a guided build on the drawing and asks /api/guided-build for it.
 * This file does not size a block, pack a table, or name a conduit.
 */
(function (root) {
  'use strict';

  var D = root.OmegaEditorV2Doc;
  var G = root.OmegaEditorV2Geom;
  var Form = root.OmegaGuidedBuildForm;

  function place(state, plan) {
    D = D || root.OmegaEditorV2Doc;
    if (!plan || !plan.ok) return { ok: false, reason: (plan && plan.reason) || 'Nothing to place.' };
    var doc = D.clone(state.doc);
    var gid = D.uid('g');
    var ids = [];
    function push(raw) {
      var e = D.clone(raw);
      if (!e.id) e.id = D.uid('e');
      e.groupId = gid;
      doc.entities.push(e);
      ids.push(e.id);
    }
    var i;
    for (i = 0; i < (plan.equipment || []).length; i++) push(plan.equipment[i]);
    for (i = 0; i < (plan.conduits || []).length; i++) push(plan.conduits[i]);
    for (i = 0; i < (plan.notes || []).length; i++) push(plan.notes[i]);
    doc.build = { id: plan.builder, summary: plan.summary || null, choices: plan.choices || [], at: new Date().toISOString() };
    D.commit(state, doc, ids);
    return { ok: true, ids: ids, summary: plan.summary || null };
  }

  /* ── Where a planned build goes ─────────────────────────────────────
     The planner lays a build out from one point; on a drawn site that point
     can sit under the arrays (the sample's lot is full of tables), so the
     build was placed but read as nothing. The plan is moved, whole, to the
     first clear spot on the lot that holds it: every array table, piece of
     equipment and obstruction already drawn stays clear by CLEAR ft, and
     the lot line holds it. With no such spot it goes just beside the lot,
     where it can be seen and dragged in. An array the plan lays (Auto
     layout) is its boundary's, so it never moves. */
  var CLEAR = 6;
  function shiftable(e) { return e && e.type !== 'array'; }
  function footprint(list) {
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, i, b;
    for (i = 0; i < list.length; i++) {
      if (!shiftable(list[i])) continue;
      b = G.boundsOf(list[i]);
      if (!isFinite(b.minX) || !isFinite(b.maxY)) continue;
      if (b.minX < minX) minX = b.minX;
      if (b.minY < minY) minY = b.minY;
      if (b.maxX > maxX) maxX = b.maxX;
      if (b.maxY > maxY) maxY = b.maxY;
    }
    return isFinite(minX) ? { minX: minX, minY: minY, maxX: maxX, maxY: maxY } : null;
  }
  /* What is already on the ground: array tables, equipment, obstructions,
     fences, conduit and blocks. The lot lines and the notes do not block. */
  function taken(doc, boundaryId) {
    var out = [], list = doc.entities || [], i, j, e, lay, b, host;
    for (i = 0; i < list.length; i++) {
      e = list[i];
      if (e.id === boundaryId || e.type === 'dim' || e.type === 'text' || e.type === 'callout') continue;
      if (e.type === 'array') {
        lay = D.arrayLayout(doc, e);
        if (lay && lay.ok && lay.tables && lay.tables.length && !lay.densityOnly) {
          for (j = 0; j < lay.tables.length; j++) out.push({ minX: lay.tables[j].x, minY: lay.tables[j].y, maxX: lay.tables[j].x + lay.tables[j].w, maxY: lay.tables[j].y + lay.tables[j].h });
        } else {
          host = e.boundaryId ? D.find(doc, e.boundaryId) : e;
          b = host ? G.boundsOf(host) : null;
          if (b && isFinite(b.minX)) out.push(b);
        }
        continue;
      }
      if ((e.type === 'polygon' || e.type === 'rect') && e.layer === 'site') continue;
      b = G.boundsOf(e);
      if (isFinite(b.minX) && isFinite(b.maxY)) out.push(b);
    }
    return out;
  }
  function spotFor(doc, size, site) {
    var occ = taken(doc, site.boundaryId), ring = site.boundary, k;
    if (!ring || ring.length < 3) return { x: site.origin.x, y: site.origin.y, onLot: false };
    var bb = G.bbox(ring), W = bb.maxX - bb.minX, H = bb.maxY - bb.minY;
    var cell = Math.max(4, Math.max(W, H) / 160);
    var nx = Math.max(1, Math.ceil(W / cell)), ny = Math.max(1, Math.ceil(H / cell));
    var cw = Math.ceil((size.w + 2 * CLEAR) / cell), ch = Math.ceil((size.h + 2 * CLEAR) / cell);
    if (cw <= nx && ch <= ny) {
      var busy = new Array(nx * ny), i, j, r, i0, i1, j0, j1;
      for (j = 0; j < ny; j++) for (i = 0; i < nx; i++) {
        busy[j * nx + i] = G.pointInPoly(bb.minX + (i + 0.5) * cell, bb.minY + (j + 0.5) * cell, ring) ? 0 : 1;
      }
      for (k = 0; k < occ.length; k++) {
        r = occ[k];
        i0 = Math.max(0, Math.floor((r.minX - CLEAR - bb.minX) / cell)); i1 = Math.min(nx - 1, Math.floor((r.maxX + CLEAR - bb.minX) / cell));
        j0 = Math.max(0, Math.floor((r.minY - CLEAR - bb.minY) / cell)); j1 = Math.min(ny - 1, Math.floor((r.maxY + CLEAR - bb.minY) / cell));
        for (j = j0; j <= j1; j++) for (i = i0; i <= i1; i++) busy[j * nx + i] = 1;
      }
      /* summed area: a window is clear when it holds no busy cell */
      var sum = new Array((nx + 1) * (ny + 1));
      for (i = 0; i <= nx; i++) sum[i] = 0;
      for (j = 1; j <= ny; j++) {
        sum[j * (nx + 1)] = 0;
        for (i = 1; i <= nx; i++) sum[j * (nx + 1) + i] = busy[(j - 1) * nx + (i - 1)] + sum[(j - 1) * (nx + 1) + i] + sum[j * (nx + 1) + i - 1] - sum[(j - 1) * (nx + 1) + i - 1];
      }
      /* the clear window nearest the middle of the view (site.prefer), so a
         build lands where the person is looking; with no view, the first
         clear window from the lot's south-west corner */
      var want = site.prefer && isFinite(site.prefer.x) && isFinite(site.prefer.y) ? site.prefer : null;
      var best = null, bestD = Infinity, n, dx, dy, d;
      for (j = 0; j + ch <= ny; j++) for (i = 0; i + cw <= nx; i++) {
        n = sum[(j + ch) * (nx + 1) + (i + cw)] - sum[j * (nx + 1) + (i + cw)] - sum[(j + ch) * (nx + 1) + i] + sum[j * (nx + 1) + i];
        if (n) continue;
        if (!want) return { x: bb.minX + i * cell + CLEAR, y: bb.minY + j * cell + CLEAR, onLot: true };
        dx = bb.minX + (i + cw / 2) * cell - want.x;
        dy = bb.minY + (j + ch / 2) * cell - want.y;
        d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = { x: bb.minX + i * cell + CLEAR, y: bb.minY + j * cell + CLEAR, onLot: true }; }
      }
      if (best) return best;
    }
    /* beside the lot, above anything already put there */
    var x = bb.maxX + 30, y = bb.minY, box, hit, tries;
    for (tries = 0; tries < 40; tries++) {
      box = { minX: x - CLEAR, minY: y - CLEAR, maxX: x + size.w + CLEAR, maxY: y + size.h + CLEAR };
      hit = null;
      for (k = 0; k < occ.length && !hit; k++) if (occ[k].minX < box.maxX && occ[k].maxX > box.minX && occ[k].minY < box.maxY && occ[k].maxY > box.minY) hit = occ[k];
      if (!hit) break;
      y = hit.maxY + CLEAR + 1;
    }
    return { x: x, y: y, onLot: false };
  }
  function shift(e, dx, dy) {
    function pt(p) { if (p && isFinite(p.x) && isFinite(p.y)) { p.x = Math.round((p.x + dx) * 10) / 10; p.y = Math.round((p.y + dy) * 10) / 10; } }
    var i;
    if (isFinite(e.x) && isFinite(e.y)) { e.x = Math.round((e.x + dx) * 10) / 10; e.y = Math.round((e.y + dy) * 10) / 10; }
    if (Array.isArray(e.pts)) for (i = 0; i < e.pts.length; i++) pt(e.pts[i]);
    pt(e.a); pt(e.b); pt(e.target); pt(e.anchor);
  }
  /* The plan moved, whole, to its spot. Returns where it went. */
  function situate(doc, plan, site) {
    G = G || root.OmegaEditorV2Geom;
    var all = [].concat(plan.equipment || [], plan.conduits || [], plan.notes || []);
    var fp = footprint(all);
    if (!fp) return { moved: false, onLot: true };
    var spot = spotFor(doc, { w: fp.maxX - fp.minX, h: fp.maxY - fp.minY }, site);
    var dx = spot.x - fp.minX, dy = spot.y - fp.minY, i;
    if (Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05) return { moved: false, onLot: spot.onLot };
    for (i = 0; i < all.length; i++) if (shiftable(all[i])) shift(all[i], dx, dy);
    return { moved: true, onLot: spot.onLot, dx: dx, dy: dy };
  }

  function contextOf(doc, pxPerFt) {
    G = G || root.OmegaEditorV2Geom;
    var best = null, bestA = -1, exclusions = [], i, e, b, ring, area;
    var list = doc.entities || [];
    for (i = 0; i < list.length; i++) {
      e = list[i];
      if (e.type === 'obstruction') {
        ring = G.ringOf(e);
        if (ring) exclusions.push(ring);
      }
      if (e.type === 'polygon' || e.type === 'rect') {
        b = G.boundsOf(e);
        area = Math.max(0, b.maxX - b.minX) * Math.max(0, b.maxY - b.minY);
        if (area > bestA) { bestA = area; best = e; }
      }
    }
    var origin = { x: 0, y: 0 }, boundary = null, boundaryId = null;
    if (best) {
      b = G.boundsOf(best);
      var right = b.minX, j, eq, edge;
      for (j = 0; j < list.length; j++) {
        eq = list[j];
        if (eq.type !== 'equip' || !isFinite(eq.x) || !(eq.w > 0)) continue;
        edge = eq.x + eq.w;
        if (edge > right) right = edge;
      }
      var x = Math.max(b.minX + 20, right + 12);
      if (x > b.maxX - 40) x = b.minX + 20;
      origin = { x: x, y: b.minY + 20 };
      boundary = G.ringOf(best);
      boundaryId = best.id;
    }
    return { origin: origin, boundary: boundary, boundaryId: boundaryId, exclusions: exclusions, pxPerFt: pxPerFt };
  }

  function readFields(host) {
    var inputs = host.querySelectorAll('[data-field]'), out = {}, i, el, v;
    for (i = 0; i < inputs.length; i++) {
      el = inputs[i];
      if (el.type === 'checkbox') v = el.checked;
      else v = el.value;
      out[el.getAttribute('data-field')] = v;
    }
    return out;
  }

  function fieldEl(f) {
    var wrap = document.createElement('label');
    wrap.className = 'field';
    wrap.textContent = f.label;
    var el;
    if (f.type === 'select') {
      el = document.createElement('select');
      var j, opt, pair;
      for (j = 0; j < (f.options || []).length; j++) {
        pair = f.options[j];
        opt = document.createElement('option');
        opt.value = pair[0];
        opt.textContent = pair[1];
        if (String(pair[0]) === String(f.value)) opt.selected = true;
        el.appendChild(opt);
      }
    } else if (f.type === 'check') {
      el = document.createElement('input');
      el.type = 'checkbox';
      el.checked = !!f.value;
    } else {
      el = document.createElement('input');
      el.type = 'number';
      if (f.value !== '' && f.value != null) el.value = f.value;
      if (f.min != null) el.min = f.min;
      if (f.max != null) el.max = f.max;
      if (f.step != null) el.step = f.step;
    }
    el.setAttribute('data-field', f.key);
    wrap.appendChild(el);
    return wrap;
  }

  function paintFields(id) {
    Form = Form || root.OmegaGuidedBuildForm;
    var fields = Form.fields(id);
    var main = document.getElementById('build-fields');
    var adv = document.getElementById('build-advanced');
    var details = document.getElementById('build-advanced-wrap');
    main.innerHTML = '';
    adv.innerHTML = '';
    var i, any = false;
    for (i = 0; i < fields.length; i++) {
      if (fields[i].advanced) { adv.appendChild(fieldEl(fields[i])); any = true; }
      else main.appendChild(fieldEl(fields[i]));
    }
    details.hidden = !any;
    prefill();
    var list = Form.builders(), b;
    for (i = 0; i < list.length; i++) if (list[i].id === id) b = list[i];
    document.getElementById('build-lead').textContent = b ? b.blurb : '';
    document.getElementById('build-error').textContent = '';
    hideNeedSignIn();
  }

  var DRAFT_KEY = 'omega.editorV2.buildDraft';
  var RETURN_KEY = 'omega.editorV2.buildReturn';

  function idToken() {
    var A = root.OmegaEditorV2Auth;
    if (A && typeof A.idToken === 'function') return A.idToken();
    return Promise.resolve('');
  }

  function bearerText(body) {
    return String((body && (body.reason || body.error)) || '');
  }

  function ask(builder, input) {
    return idToken().then(function (token) {
      if (!token) return { ok: false, needSignIn: true };
      return fetch('/api/guided-build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ builder: builder, input: input })
      }).then(function (res) {
        return res.json().then(function (body) {
          var text = bearerText(body);
          /* signed out asks for a sign-in; any other refusal says why (a
             plan without Omega Maximus, a build its package does not hold) */
          if (res.status === 401 || /bearer/i.test(text) || (res.status === 403 && (!text || /sign in/i.test(text)))) return { ok: false, needSignIn: true };
          if (!res.ok) return { ok: false, reason: text || 'The build did not run.' };
          return body;
        }, function () {
          if (res.status === 401) return { ok: false, needSignIn: true };
          return { ok: false, reason: res.status === 403 ? 'This workspace cannot place that build.' : 'The build did not run.' };
        });
      }, function () {
        return { ok: false, reason: 'The build service is not reachable. Try again in a moment.' };
      });
    });
  }

  function solarAcOf(summary) {
    var n = summary && +summary.solarKwAc;
    if (n > 0) return String(Math.round(n));
    return '';
  }

  var drawing = null;
  function prefill() {
    if (!drawing || typeof document === 'undefined') return;
    D = D || root.OmegaEditorV2Doc;
    var s = D.summary(drawing);
    var kw = document.querySelector('#dlg-build [data-field="kw"]');
    var hours = document.querySelector('#dlg-build [data-field="hours"]');
    var solar = document.querySelector('#dlg-build [data-field="solarKw"]');
    if (kw && s.bessKw > 0) kw.value = String(s.bessKw);
    if (hours && s.bessKw > 0 && s.bessKwh > 0) {
      var h = Math.round((s.bessKwh / s.bessKw) * 10) / 10;
      if (h >= 0.5 && h <= 8) hours.value = String(h);
    }
    if (solar) solar.value = solarAcOf(s);
  }

  function showNeedSignIn() {
    var err = document.getElementById('build-error');
    var box = document.getElementById('build-signin');
    var note = document.getElementById('build-signin-note');
    if (err) err.textContent = '';
    if (note) note.textContent = 'Sign in to place guided builds.';
    if (box) box.hidden = false;
  }
  function hideNeedSignIn() {
    var box = document.getElementById('build-signin');
    if (box) box.hidden = true;
  }

  function readStash() {
    try {
      var raw = sessionStorage.getItem(DRAFT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function clearDraft() {
    try {
      sessionStorage.removeItem(DRAFT_KEY);
      sessionStorage.removeItem(RETURN_KEY);
    } catch (e) {}
  }
  function stash() {
    try {
      var details = document.getElementById('build-advanced-wrap');
      var choices = document.getElementById('build-choices');
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({
        builder: selectedBuilder(),
        fields: readFields(document.getElementById('dlg-build')),
        advanced: !!(details && details.open),
        pinned: !!(choices && choices.hidden)
      }));
      sessionStorage.setItem(RETURN_KEY, '1');
    } catch (e) {}
  }
  function applyFields(fields) {
    if (!fields) return;
    var k, el;
    for (k in fields) {
      if (!Object.prototype.hasOwnProperty.call(fields, k)) continue;
      el = document.querySelector('#dlg-build [data-field="' + k + '"]');
      if (!el) continue;
      if (el.type === 'checkbox') el.checked = !!fields[k];
      else el.value = fields[k] == null ? '' : String(fields[k]);
    }
  }

  function selectedBuilder() {
    var on = document.querySelector('#build-choices input:checked');
    return on ? on.value : 'bess';
  }

  function bindSignIn() {
    var btn = document.getElementById('build-signin-btn');
    if (!btn) return;
    btn.onclick = function (ev) {
      ev.preventDefault();
      var A = root.OmegaEditorV2Auth;
      var note = document.getElementById('build-signin-note');
      if (!A || typeof A.signIn !== 'function') {
        if (note) note.textContent = 'Sign-in is unavailable. Check the connection and refresh.';
        return;
      }
      stash();
      btn.disabled = true;
      A.signIn().then(function () {
        btn.disabled = false;
        clearDraft();
        hideNeedSignIn();
        var err = document.getElementById('build-error');
        if (err) err.textContent = '';
      }, function (err) {
        btn.disabled = false;
        var msg = (err && err.message) || 'Sign-in did not finish.';
        if (/bearer/i.test(msg)) msg = 'Sign-in did not finish.';
        if (note) note.textContent = msg;
      });
    };
  }

  function open(state, ctx) {
    Form = Form || root.OmegaGuidedBuildForm;
    if (typeof document === 'undefined') return;
    drawing = state.doc;
    var dlg = document.getElementById('dlg-build');
    var choices = document.getElementById('build-choices');
    choices.innerHTML = '';
    var list = Form.builders(), i, label, radio;
    var prefer = (ctx && (ctx.preferred || ctx.builder)) || suggest(state.doc);
    for (i = 0; i < list.length; i++) {
      label = document.createElement('label');
      radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'builder';
      radio.value = list[i].id;
      if (list[i].id === prefer) radio.checked = true;
      radio.addEventListener('change', function () { paintFields(selectedBuilder()); });
      label.appendChild(radio);
      label.appendChild(document.createTextNode(' ' + list[i].label));
      choices.appendChild(label);
    }
    paintFields(prefer);
    if (ctx && ctx.draft && ctx.draft.fields) {
      applyFields(ctx.draft.fields);
      var adv = document.getElementById('build-advanced-wrap');
      if (adv && ctx.draft.advanced) adv.open = true;
    }
    bindSignIn();
    var pinned = !!(ctx && ctx.preferred);
    choices.hidden = pinned;
    var named = null;
    for (i = 0; i < list.length; i++) if (list[i].id === prefer) named = list[i];
    document.getElementById('build-title').textContent = pinned && named ? named.label : 'Guided build';
    var placeBtn = document.getElementById('build-place');
    placeBtn.onclick = function (ev) {
      ev.preventDefault();
      var id = selectedBuilder();
      var input = readFields(document.getElementById('dlg-build'));
      var site = contextOf(state.doc, ctx && ctx.pxPerFt);
      if (ctx && typeof ctx.prefer === 'function') site.prefer = ctx.prefer();
      input.origin = site.origin;
      input.pxPerFt = site.pxPerFt;
      if (id === 'autolayout' || id === 'bess') {
        input.boundary = site.boundary;
        input.boundaryId = site.boundaryId;
        input.exclusions = site.exclusions;
      }
      placeBtn.disabled = true;
      document.getElementById('build-error').textContent = '';
      hideNeedSignIn();
      ask(id, input).then(function (plan) {
        placeBtn.disabled = false;
        if (plan && plan.needSignIn) {
          showNeedSignIn();
          return;
        }
        if (!plan || !plan.ok) {
          var reason = (plan && plan.reason) || 'The build did not run.';
          if (/bearer/i.test(reason)) { showNeedSignIn(); return; }
          document.getElementById('build-error').textContent = reason;
          return;
        }
        clearDraft();
        var where = situate(state.doc, plan, site);
        var placed = place(state, plan);
        if (!placed.ok) {
          document.getElementById('build-error').textContent = placed.reason;
          return;
        }
        placed.onLot = where.onLot;
        dlg.close();
        if (ctx && ctx.onPlaced) ctx.onPlaced(placed);
      });
    };
    dlg.showModal();
  }

  function suggest(doc) {
    var s = (D || root.OmegaEditorV2Doc).summary(doc);
    if (s.chargerCount && !s.bessCount) return 'dcfc';
    if (s.arrayCount && !s.bessCount && !s.chargerCount) return 'autolayout';
    return 'bess';
  }

  function resume(state, ctx) {
    if (typeof document === 'undefined' || typeof sessionStorage === 'undefined') return;
    if (sessionStorage.getItem(RETURN_KEY) !== '1') return;
    var draft = readStash();
    sessionStorage.removeItem(RETURN_KEY);
    var next = {
      pxPerFt: ctx && ctx.pxPerFt,
      onPlaced: ctx && ctx.onPlaced,
      draft: draft,
      builder: draft && draft.builder
    };
    if (draft && draft.pinned && draft.builder) next.preferred = draft.builder;
    idToken().then(function (token) {
      open(state, next);
      if (!token) showNeedSignIn();
    });
  }

  var api = {
    place: place, contextOf: contextOf, situate: situate, spotFor: spotFor, open: open, suggest: suggest,
    ask: ask, solarAcOf: solarAcOf, clearDraft: clearDraft, resume: resume,
    VERSION: 'editor-v2-build/2'
  };
  root.OmegaEditorV2Build = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : global);
