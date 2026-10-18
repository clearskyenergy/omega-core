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
  }

  function ask(builder, input) {
    var headers = { 'Content-Type': 'application/json' };
    var user = root.firebase && root.firebase.auth && root.firebase.auth().currentUser;
    var tokenP = user ? user.getIdToken() : Promise.resolve('');
    return tokenP.then(function (token) {
      if (token) headers.Authorization = 'Bearer ' + token;
      return fetch('/api/guided-build', {
        method: 'POST', headers: headers,
        body: JSON.stringify({ builder: builder, input: input })
      });
    }).then(function (res) {
      return res.json().then(function (body) {
        if (!res.ok) return { ok: false, reason: (body && (body.reason || body.error)) || 'The build did not run.' };
        return body;
      }, function () { return { ok: false, reason: 'The build did not run.' }; });
    }, function () { return { ok: false, reason: 'The build service is not reachable. Sign in on the workspace and try again.' }; });
  }

  var drawing = null;
  function prefill() {
    if (!drawing || typeof document === 'undefined') return;
    D = D || root.OmegaEditorV2Doc;
    var s = D.summary(drawing);
    var kw = document.querySelector('#dlg-build [data-field="kw"]');
    var hours = document.querySelector('#dlg-build [data-field="hours"]');
    if (kw && s.bessKw > 0) kw.value = String(s.bessKw);
    if (hours && s.bessKw > 0 && s.bessKwh > 0) {
      var h = Math.round((s.bessKwh / s.bessKw) * 10) / 10;
      if (h >= 0.5 && h <= 8) hours.value = String(h);
    }
  }

  function selectedBuilder() {
    var on = document.querySelector('#build-choices input:checked');
    return on ? on.value : 'bess';
  }

  function open(state, ctx) {
    Form = Form || root.OmegaGuidedBuildForm;
    if (typeof document === 'undefined') return;
    drawing = state.doc;
    var dlg = document.getElementById('dlg-build');
    var choices = document.getElementById('build-choices');
    choices.innerHTML = '';
    var list = Form.builders(), i, label, radio, prefer = (ctx && ctx.preferred) || suggest(state.doc);
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
    var placeBtn = document.getElementById('build-place');
    placeBtn.onclick = function (ev) {
      ev.preventDefault();
      var id = selectedBuilder();
      var input = readFields(document.getElementById('dlg-build'));
      var site = contextOf(state.doc, ctx && ctx.pxPerFt);
      input.origin = site.origin;
      input.pxPerFt = site.pxPerFt;
      if (id === 'autolayout' || id === 'bess') {
        input.boundary = site.boundary;
        input.boundaryId = site.boundaryId;
        input.exclusions = site.exclusions;
      }
      placeBtn.disabled = true;
      document.getElementById('build-error').textContent = '';
      ask(id, input).then(function (plan) {
        placeBtn.disabled = false;
        if (!plan || !plan.ok) {
          document.getElementById('build-error').textContent = (plan && plan.reason) || 'The build did not run.';
          return;
        }
        var placed = place(state, plan);
        if (!placed.ok) {
          document.getElementById('build-error').textContent = placed.reason;
          return;
        }
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

  var api = { place: place, contextOf: contextOf, open: open, suggest: suggest, VERSION: 'editor-v2-build/1' };
  root.OmegaEditorV2Build = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : global);
