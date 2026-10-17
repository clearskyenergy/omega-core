/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * omega-editor-v2-app.js — the Site Plan preview.
 *
 * Drawing state lives in omega-editor-v2-doc.js. This file is the page:
 * the canvas, the command line, save-on-this-computer, and the customer
 * dialog. It does not open Firebase and it does not write a workspace.
 */
(function (root) {
  'use strict';

  var G, D, A, B, X, R;
  var state, tool = 'select', equipKey = null, mapOn = true, dirty = false, savedOnce = false, saving = false;
  var editSeq = 0;
  var snaps = { grid: true, endpoint: true, midpoint: true, edge: true, angle: false };
  var view = { cx: 200, cy: 140, pxPerFt: 1.5 };
  var draft = null, drag = null, box = null, pan = null, space = false;
  var clipboard = null, pasteN = 0, lastSnap = null, cursor = null;
  var raf = 0, cssW = 1, cssH = 1, dpr = 1, propSig = '';
  var tiles = {}, mapNote = '', recoverTimer = 0;
  var PROJECTS = 'omega.editorV2.projects';

  var POINT_TOOL = {
    line: 1, polyline: 1, rect: 1, circle: 1, dim: 1, dist: 1, text: 1, callout: 1,
    obstruction: 1, fence: 1, conduit: 1, equip: 1, move: 1
  };
  var COMMAND = {
    L: 'line', LINE: 'line', PL: 'polyline', PLINE: 'polyline', POLYLINE: 'polyline',
    REC: 'rect', RECT: 'rect', RECTANGLE: 'rect', C: 'circle', CIRCLE: 'circle',
    DIM: 'dim', DIST: 'dist', DI: 'dist', TEXT: 'text', T: 'text',
    OFFSET: 'offset', FENCE: 'fence', CONDUIT: 'conduit', PAN: 'pan',
    SELECT: 'select', V: 'select', MOVE: 'move', M: 'move',
    ERASE: 'erase', E: 'erase', U: 'undo', UNDO: 'undo', REDO: 'redo',
    ARRAY: 'array', FIT: 'zoom-ext', Z: 'zoom-ext', HELP: 'help', NEW: 'new'
  };

  var PROMPT = {
    select: 'Select an object. Drag left to right to enclose, right to left to cross.',
    pan: 'Drag to pan. The wheel zooms at the cursor.',
    line: 'Line: click the first point, or type 10,20.',
    polyline: 'Polyline: click points. Enter finishes, C closes.',
    rect: 'Rectangle: click two opposite corners.',
    circle: 'Circle: click the center, then the radius, or type the radius.',
    dim: 'Dimension: click the two points to measure.',
    dist: 'Measure: click two points. Nothing is added to the drawing.',
    text: 'Text: click where the note goes, then type it and press Enter.',
    callout: 'Callout: click the point, click the label, then type the words.',
    offset: 'Setback: select a closed shape, then type the distance in feet.',
    obstruction: 'Obstruction: click the corners. Enter closes the shape.',
    fence: 'Fence: click points. Enter finishes.',
    conduit: 'Conduit: click points. Enter finishes.',
    equip: 'Click to place the equipment.',
    move: 'Move: click a base point, then a destination.'
  };

  function $(id) { return document.getElementById(id); }
  function boot() {
    G = root.OmegaEditorV2Geom;
    D = root.OmegaEditorV2Doc;
    A = root.OmegaEditorV2Assign;
    B = root.OmegaEditorV2Bridge;
    X = root.OmegaEditorV2Export;
    R = root.OmegaEditorV2Recovery;
    if (!G || !D || !A || !B || !X || !R) {
      setStatus('The drawing libraries did not load.', true);
      return;
    }
    state = D.createState(sample());
    bind();
    resize();
    fit(false);
    refresh();
    if (!offerRecovery(null, null)) {
      setStatus('Sample site loaded. New starts a blank project. Help lists the commands.');
    }
    $('cmd').focus();
  }

  function sample() {
    var doc = D.create({
      name: 'Sample industrial site',
      address: 'Sample parcel',
      anchor: { lat: 33.306, lng: -112.074 },
      assignment: {
        customerName: 'Sample customer',
        stakeholders: [
          { role: 'contact', name: 'Site contact', company: 'Sample customer' },
          { role: 'sales', name: 'Sales', company: 'ClearSky' },
          { role: 'installer', company: 'Sample installer' }
        ]
      }
    });
    var parcel = { id: D.uid('e'), type: 'polygon', layer: 'site', closed: true, pts: [
      { x: 0, y: 0 }, { x: 420, y: 0 }, { x: 420, y: 280 }, { x: 0, y: 280 }
    ]};
    doc.entities.push(parcel);
    doc.entities.push({
      id: D.uid('e'), type: 'array', layer: 'array', boundaryId: parcel.id,
      mount: 'fixed-ground', setbackFt: 15
    });
    doc.entities.push({
      id: D.uid('e'), type: 'obstruction', layer: 'obstruction', closed: true,
      pts: [{ x: 300, y: 170 }, { x: 390, y: 170 }, { x: 390, y: 245 }, { x: 300, y: 245 }]
    });
    doc.entities.push({ id: D.uid('e'), type: 'equip', layer: 'equipment', key: 'bess', label: 'BESS', x: 48, y: 36, w: 28, h: 10, rot: 0, kw: 500, kwh: 1000 });
    doc.entities.push({ id: D.uid('e'), type: 'equip', layer: 'equipment', key: 'pcs', label: 'PCS', x: 78, y: 36, w: 8, h: 4, rot: 0, kw: 250, kwh: 0 });
    doc.entities.push({ id: D.uid('e'), type: 'equip', layer: 'equipment', key: 'transformer', label: 'Transformer', x: 36, y: 18, w: 8, h: 6, rot: 0 });
    doc.entities.push({ id: D.uid('e'), type: 'equip', layer: 'equipment', key: 'meter', label: 'Meter', x: 22, y: 16, w: 3, h: 2, rot: 0 });
    doc.entities.push({ id: D.uid('e'), type: 'equip', layer: 'equipment', key: 'poi', label: 'POI', x: 12, y: 12, w: 4, h: 4, rot: 0 });
    doc.entities.push({
      id: D.uid('e'), type: 'conduit', layer: 'conduit', spec: 'RMC',
      pts: [{ x: 12, y: 12 }, { x: 12, y: 36 }, { x: 48, y: 36 }]
    });
    doc.entities.push({ id: D.uid('e'), type: 'dim', layer: 'dimension', a: { x: 0, y: 0 }, b: { x: 420, y: 0 }, offset: -14 });
    doc.entities.push({
      id: D.uid('e'), type: 'callout', layer: 'annotation',
      target: { x: 345, y: 200 }, anchor: { x: 250, y: 255 }, text: 'Existing building'
    });
    return doc;
  }

  function bind() {
    window.addEventListener('resize', function () { resize(); requestDraw(); });
    document.addEventListener('keydown', onKey);
    document.addEventListener('keyup', function (ev) { if (ev.key === ' ') space = false; });
    $('cmd').addEventListener('keydown', onCommandKey);
    $('project-name').addEventListener('change', function () {
      D.setMeta(state, { name: this.value.trim() || 'Untitled site' });
      afterChange();
    });
    $('btn-save').addEventListener('click', saveLocal);
    $('btn-open').addEventListener('click', openDialog);
    $('btn-new').addEventListener('click', function () { confirmDirty(blank); });
    $('btn-help').addEventListener('click', function () { $('dlg-help').showModal(); });
    $('help-close').addEventListener('click', function () { $('dlg-help').close(); });
    $('open-close').addEventListener('click', function () { $('dlg-open').close(); });
    $('btn-dismiss').addEventListener('click', function () { $('banner').style.display = 'none'; resize(); });
    $('btn-side').addEventListener('click', function () {
      var side = $('side'), open = side.classList.toggle('open');
      this.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    $('customer-btn').addEventListener('click', openCustomer);
    $('btn-add-party').addEventListener('click', function () { addPartyRow({ role: 'contact' }); });
    $('cust-cancel').addEventListener('click', function () { $('dlg-customer').close(); });
    $('cust-form').addEventListener('submit', saveCustomer);
    $('file-import').addEventListener('change', onImport);
    var buttons = document.querySelectorAll('[data-tool],[data-act],[data-equip]');
    for (var i = 0; i < buttons.length; i++) buttons[i].addEventListener('click', onButton);
    var cv = $('cv');
    cv.addEventListener('pointerdown', onDown);
    cv.addEventListener('pointermove', onMove);
    cv.addEventListener('pointerup', onUp);
    cv.addEventListener('pointerleave', function () { cursor = null; requestDraw(); });
    cv.addEventListener('wheel', onWheel, { passive: false });
    cv.addEventListener('contextmenu', function (ev) {
      ev.preventDefault();
      if (draft && (draft.mode === 'polyline' || draft.mode === 'fence' || draft.mode === 'conduit' || draft.mode === 'obstruction')) finishChain(false);
    });
    $('dlg-confirm').addEventListener('close', onConfirmClose);
    $('recover-restore').addEventListener('click', restoreDraft);
    $('recover-discard').addEventListener('click', discardDraft);
    window.addEventListener('beforeunload', function (ev) {
      if (!R.shouldWarnOnClose(dirty, saving)) return;
      ev.preventDefault();
      ev.returnValue = '';
    });
  }

  var confirmNext = null;
  function confirmDirty(next) {
    if (!dirty) { next(); return; }
    confirmNext = next;
    $('confirm-copy').textContent = '“' + (state.doc.name || 'This project') + '” has unsaved changes on this computer.';
    $('dlg-confirm').showModal();
  }
  function onConfirmClose() {
    var v = $('dlg-confirm').returnValue, next = confirmNext;
    confirmNext = null;
    if (!next) return;
    if (v === 'save') { saveLocal(); next(); }
    else if (v === 'discard') { R.drop(localStorage); next(); }
  }

  function onButton(ev) {
    var b = ev.currentTarget;
    var act = b.getAttribute('data-act');
    var eq = b.getAttribute('data-equip');
    var tl = b.getAttribute('data-tool');
    if (tl) setTool(tl);
    else if (eq) setEquip(eq);
    else if (act) runAct(act);
  }

  function setTool(name) {
    tool = name;
    equipKey = null;
    draft = name === 'offset' ? { mode: 'offset', pts: [] } : null;
    paintTools();
    setStatus(PROMPT[name] || PROMPT.select);
    requestDraw();
    $('cmd').focus();
  }
  function setEquip(key) {
    tool = 'equip';
    equipKey = key;
    draft = null;
    paintTools();
    var spec = D.EQUIP[key] || { label: key };
    setStatus('Click to place a ' + spec.label + '. Press Esc when you are done.');
    $('cmd').focus();
  }
  function paintTools() {
    var nodes = document.querySelectorAll('[data-tool]');
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].setAttribute('aria-pressed', nodes[i].getAttribute('data-tool') === tool ? 'true' : 'false');
    }
    $('cv').className = 'tool-' + tool + (pan ? ' is-panning' : '');
  }

  function runAct(act) {
    if (act === 'undo') { if (D.undo(state)) afterChange(); else setStatus('Nothing to undo.'); }
    else if (act === 'redo') { if (D.redo(state)) afterChange(); else setStatus('Nothing to redo.'); }
    else if (act === 'erase') erase();
    else if (act === 'array') fillArray();
    else if (act === 'group') doGroup();
    else if (act === 'ungroup') { D.ungroup(state, state.selection); afterChange(); }
    else if (act.indexOf('align-') === 0) {
      var mode = act.slice(6);
      if (mode === 'top') mode = 'top';
      D.align(state, state.selection, mode === 'left' ? 'left' : mode === 'right' ? 'right' : mode === 'top' ? 'top' : 'bottom');
      afterChange();
    } else if (act === 'dist-x') { D.distribute(state, state.selection, 'x'); afterChange(); }
    else if (act === 'zoom-ext') fit(true);
    else if (act === 'map') { mapOn = !mapOn; pressed('map', mapOn); requestDraw(); layoutMap(); }
    else if (act === 'snap-grid') { snaps.grid = !snaps.grid; pressed('snap-grid', snaps.grid); }
    else if (act === 'snap-end') { toggleOsnap(); }
    else if (act === 'ortho') { snaps.angle = !snaps.angle; pressed('ortho', snaps.angle); setStatus(snaps.angle ? 'Ortho on.' : 'Ortho off.'); }
    else if (act === 'png') exportPng();
    else if (act === 'pdf') exportPdf();
    else if (act === 'dxf') exportDxf();
    else if (act === 'json') exportJson();
    else if (act === 'import') $('file-import').click();
    else if (act === 'copy') copySel();
    else if (act === 'paste') paste();
  }
  function pressed(act, on) {
    var nodes = document.querySelectorAll('[data-act="' + act + '"]');
    for (var i = 0; i < nodes.length; i++) nodes[i].setAttribute('aria-pressed', on ? 'true' : 'false');
  }
  function toggleOsnap() {
    var on = !(snaps.endpoint && snaps.midpoint && snaps.edge);
    snaps.endpoint = snaps.midpoint = snaps.edge = on;
    pressed('snap-end', on);
    setStatus(on ? 'Endpoint, midpoint and edge snaps are on.' : 'Object snaps are off.');
  }

  function onKey(ev) {
    if (ev.key === ' ') {
      var tag = ev.target && ev.target.tagName;
      if (tag !== 'INPUT' && tag !== 'TEXTAREA') { space = true; ev.preventDefault(); }
    }
    if (fieldTyping(ev) && ev.target.id !== 'cmd') return;
    var meta = ev.ctrlKey || ev.metaKey;
    if (meta && (ev.key === 'z' || ev.key === 'Z') && !ev.shiftKey) {
      if (ev.target.id === 'cmd' && $('cmd').value) return;
      ev.preventDefault(); runAct('undo');
    } else if (meta && (ev.key === 'y' || ev.key === 'Y' || (ev.shiftKey && (ev.key === 'z' || ev.key === 'Z')))) {
      ev.preventDefault(); runAct('redo');
    } else if (meta && (ev.key === 's' || ev.key === 'S')) { ev.preventDefault(); saveLocal(); }
    else if (meta && (ev.key === 'c' || ev.key === 'C') && ev.target.id !== 'cmd') { copySel(); }
    else if (meta && (ev.key === 'v' || ev.key === 'V') && ev.target.id !== 'cmd') { ev.preventDefault(); paste(); }
    else if (meta && (ev.key === 'd' || ev.key === 'D')) { ev.preventDefault(); D.duplicate(state, state.selection, 10, 10); afterChange(); }
    else if (meta && (ev.key === 'g' || ev.key === 'G')) {
      ev.preventDefault();
      if (ev.shiftKey) runAct('ungroup'); else doGroup();
    } else if (meta && (ev.key === 'a' || ev.key === 'A') && ev.target.id !== 'cmd') {
      ev.preventDefault();
      state.selection = state.doc.entities.map(function (e) { return e.id; });
      refresh();
    } else if (ev.key === 'Escape') cancel();
    else if ((ev.key === 'Delete' || ev.key === 'Backspace') && ev.target.id !== 'cmd' && !fieldTyping(ev)) {
      ev.preventDefault(); erase();
    } else if (ev.key === 'F3') { ev.preventDefault(); toggleOsnap(); }
    else if (ev.key === 'F7') { ev.preventDefault(); runAct('snap-grid'); }
    else if (ev.key === 'F8') { ev.preventDefault(); runAct('ortho'); }
    else if (ev.key === '?' && ev.target.id !== 'cmd') $('dlg-help').showModal();
    else if (ev.key === 'Enter' && ev.target.id !== 'cmd') finishChain(false);
  }
  function fieldTyping(ev) {
    var t = ev.target;
    if (!t || !t.tagName) return false;
    return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT';
  }
  function onCommandKey(ev) {
    if (ev.key === 'Enter') { ev.preventDefault(); submit($('cmd').value); $('cmd').value = ''; }
    else if (ev.key === 'Escape') { ev.preventDefault(); cancel(); }
  }
  function submit(raw) {
    var s = String(raw || '').trim();
    if (draft && draft.wait === 'text') { commitText(s); return; }
    if ((tool === 'offset' || (draft && draft.mode === 'offset')) && isFinite(parseFloat(s)) && s.indexOf(',') < 0 && s.indexOf('<') < 0) {
      doOffset(parseFloat(s));
      return;
    }
    if (draft && draft.pts && draft.pts.length && s.toUpperCase() === 'C' && (draft.mode === 'polyline' || draft.mode === 'fence' || draft.mode === 'conduit')) {
      finishChain(true); return;
    }
    // A point is accepted on the first keystroke. The tool does not have to
    // be waiting on a click before 10,20, 25<45 or @5,0 means a coordinate.
    var pointTool = POINT_TOOL[tool] || (draft && draft.mode && POINT_TOOL[draft.mode]);
    if (pointTool && s) {
      var base = draft && draft.pts && draft.pts.length ? draft.pts[draft.pts.length - 1] : null;
      var parsed = G.parseEntry(s, base, cursor);
      if (!parsed.error) { acceptPoint(parsed.point); return; }
      if (draft && draft.pts && draft.pts.length && !COMMAND[s.toUpperCase()]) {
        setStatus(parsed.error, true);
        return;
      }
    }
    if (!s) { finishChain(false); return; }
    var word = s.toUpperCase();
    var map = COMMAND;
    if (map[word] === 'undo' || map[word] === 'redo' || map[word] === 'erase' || map[word] === 'array' || map[word] === 'zoom-ext') runAct(map[word] === 'zoom-ext' ? 'zoom-ext' : map[word]);
    else if (map[word] === 'help') $('dlg-help').showModal();
    else if (map[word] === 'new') confirmDirty(blank);
    else if (map[word]) setTool(map[word]);
    else setStatus('Unknown command “' + s + '”. Type HELP for the list.', true);
  }

  function cancel() {
    draft = null;
    box = null;
    drag = null;
    if (tool !== 'select' && tool !== 'pan') setTool('select');
    else { state.selection = []; setStatus(PROMPT.select); refresh(); }
  }

  function acceptPoint(p) {
    if (tool === 'equip' && equipKey) { placeEquip(p); return; }
    if (!draft || draft.mode === 'offset') {
      if (tool === 'select') return;
      draft = { mode: tool, pts: [], wait: null };
    }
    var mode = draft.mode;
    if (mode === 'line') {
      draft.pts.push(p);
      if (draft.pts.length === 1) { setStatus('Next point, or type a length.'); requestDraw(); return; }
      var from = draft.pts[0];
      D.add(state, { type: 'line', layer: 'site', a: from, b: p });
      afterChange();
      draft = { mode: 'line', pts: [p] };
      setStatus('Next point, or Enter to stop. Last segment ' + G.formatFeet(G.dist(from, p)) + '.');
      return;
    }
    if (mode === 'polyline' || mode === 'fence' || mode === 'conduit' || mode === 'obstruction') {
      draft.pts.push(p);
      setStatus('Next point. Enter finishes' + (mode === 'obstruction' ? ' and closes.' : ', C closes.'));
      requestDraw();
      return;
    }
    if (mode === 'rect' || mode === 'circle' || mode === 'dim' || mode === 'dist' || mode === 'move') {
      draft.pts.push(p);
      if (draft.pts.length < 2) { setStatus('Second point.'); requestDraw(); return; }
      finishTwo(mode, draft.pts[0], draft.pts[1]);
      return;
    }
    if (mode === 'text') {
      draft.pts = [p];
      draft.wait = 'text';
      setStatus('Type the note and press Enter.');
      return;
    }
    if (mode === 'callout') {
      draft.pts.push(p);
      if (draft.pts.length < 2) { setStatus('Click where the words should sit.'); requestDraw(); return; }
      draft.wait = 'text';
      setStatus('Type the callout and press Enter.');
      return;
    }
  }

  function finishTwo(mode, a, b) {
    if (mode === 'rect') {
      var w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y);
      if (w < 0.5 || h < 0.5) { setStatus('That rectangle is too small.', true); draft = { mode: 'rect', pts: [] }; return; }
      D.add(state, { type: 'rect', layer: 'site', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, w: w, h: h, rot: 0 });
    } else if (mode === 'circle') {
      var r = G.dist(a, b);
      if (r < 0.25) { setStatus('Type a radius, or click farther out.', true); draft = { mode: 'circle', pts: [a] }; return; }
      D.add(state, { type: 'circle', layer: 'site', x: a.x, y: a.y, r: r });
    } else if (mode === 'dim') {
      D.add(state, { type: 'dim', layer: 'dimension', a: a, b: b, offset: 8 });
      setStatus(G.formatFeet(G.dist(a, b)) + '.');
    } else if (mode === 'dist') {
      setStatus('Distance ' + G.formatFeet(G.dist(a, b)) + ' · ' + G.dist(a, b).toFixed(2) + ' ft · angle ' + angleOf(a, b).toFixed(1) + '°.');
      draft = null;
      requestDraw();
      return;
    } else if (mode === 'move') {
      if (!state.selection.length) { setStatus('Select objects before Move.', true); draft = null; return; }
      D.move(state, state.selection, b.x - a.x, b.y - a.y);
    }
    draft = null;
    afterChange();
  }
  function angleOf(a, b) {
    var d = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
    return d < 0 ? d + 360 : d;
  }
  function finishChain(close) {
    if (!draft || !draft.pts) return;
    var mode = draft.mode, pts = draft.pts.slice();
    if (mode === 'line') { draft = null; setTool('select'); return; }
    if (mode !== 'polyline' && mode !== 'fence' && mode !== 'conduit' && mode !== 'obstruction') return;
    if (mode === 'obstruction') close = true;
    if (pts.length < (close ? 3 : 2)) { setStatus('Need more points.', true); return; }
    var type = mode === 'polyline' ? 'polyline' : mode;
    var layer = mode === 'obstruction' ? 'obstruction' : mode === 'conduit' ? 'conduit' : 'site';
    D.add(state, { type: type, layer: layer, pts: pts, closed: !!close, spec: mode === 'conduit' ? 'RMC' : undefined });
    draft = null;
    afterChange();
    setStatus(close ? 'Closed.' : 'Finished.');
  }
  function commitText(s) {
    if (!s) { setStatus('The note was empty.', true); return; }
    if (draft.mode === 'text') {
      D.add(state, { type: 'text', layer: 'annotation', x: draft.pts[0].x, y: draft.pts[0].y, text: s, h: 2 });
    } else if (draft.mode === 'callout') {
      D.add(state, { type: 'callout', layer: 'annotation', target: draft.pts[0], anchor: draft.pts[1], text: s });
    }
    draft = null;
    afterChange();
  }
  function placeEquip(p) {
    var spec = D.EQUIP[equipKey];
    if (!spec) return;
    D.add(state, {
      type: 'equip', layer: 'equipment', key: equipKey, label: spec.label,
      x: p.x, y: p.y, w: spec.w, h: spec.h, rot: 0, kw: spec.kw, kwh: spec.kwh
    });
    afterChange();
    setStatus(spec.label + ' placed. Click to place another, or Esc to stop.');
  }

  function doOffset(distFt) {
    var e = D.find(state.doc, state.selection[0]);
    var ring = e && G.ringOf(e);
    if (!ring) { setStatus('Select a closed shape first.', true); return; }
    var res = G.offsetPolygon(ring, distFt);
    if (!res.ok) { setStatus(res.reason, true); return; }
    D.add(state, { type: 'setback', layer: 'setback', closed: true, pts: res.pts, distance: distFt, sourceId: e.id });
    afterChange();
    setStatus('Setback of ' + distFt + ' ft added.');
  }
  function fillArray() {
    var e = D.find(state.doc, state.selection[0]);
    var ring = e && G.ringOf(e);
    if (!ring) { setStatus('Select a closed boundary, then Fill array.', true); return; }
    if (e.type === 'array') { setStatus('That is already an array. Select the boundary around it.', true); return; }
    var id, i, existing;
    for (i = 0; i < state.doc.entities.length; i++) {
      existing = state.doc.entities[i];
      if (existing.type === 'array' && existing.boundaryId === e.id) {
        setStatus('This boundary already has an array. Select the array to change its mount or setback.', true);
        return;
      }
    }
    id = D.add(state, { type: 'array', layer: 'array', boundaryId: e.id, mount: 'fixed-ground' });
    var lay = D.arrayLayout(state.doc, D.find(state.doc, id));
    afterChange();
    if (!lay.ok) setStatus(lay.reason, true);
    else if (!lay.tableCount) setStatus('No tables fit. Reduce the setback or enlarge the boundary.', true);
    else setStatus(lay.tableCount + ' tables · ' + lay.moduleCount + ' modules · ' + lay.kw + ' kW-DC.');
  }
  function erase() {
    if (!state.selection.length) { setStatus('Nothing selected.', true); return; }
    D.remove(state, D.groupIds(state.doc, state.selection));
    afterChange();
    setStatus('Erased.');
  }
  function doGroup() {
    if (state.selection.length < 2) { setStatus('Select at least two objects to group.', true); return; }
    D.group(state, state.selection);
    afterChange();
  }
  function copySel() {
    var ids = D.groupIds(state.doc, state.selection), want = {}, i;
    for (i = 0; i < ids.length; i++) want[ids[i]] = true;
    clipboard = [];
    for (i = 0; i < state.doc.entities.length; i++) if (want[state.doc.entities[i].id]) clipboard.push(D.clone(state.doc.entities[i]));
    pasteN = 0;
    setStatus(clipboard.length ? clipboard.length + ' copied.' : 'Nothing selected.', !clipboard.length);
  }
  function paste() {
    if (!clipboard || !clipboard.length) { setStatus('Nothing copied.', true); return; }
    pasteN++;
    var gmap = {}, copies = [], i, c, id;
    for (i = 0; i < clipboard.length; i++) {
      c = G.moveEntity(clipboard[i], 10 * pasteN, 10 * pasteN);
      c.id = D.uid('e');
      if (c.groupId) {
        if (!gmap[c.groupId]) gmap[c.groupId] = D.uid('g');
        c.groupId = gmap[c.groupId];
      }
      copies.push(c);
    }
    var doc = D.clone(state.doc);
    doc.entities = doc.entities.concat(copies);
    D.commit(state, doc, copies.map(function (ent) { return ent.id; }));
    afterChange();
  }

  function blank() {
    state = D.createState(D.create({ name: 'Untitled site', anchor: state.doc.anchor }));
    dirty = false;
    savedOnce = false;
    draft = null;
    tool = 'select';
    fit(false);
    refresh();
    setStatus('New project. Nothing is saved until you press Save.');
  }

  /* ── pointer ───────────────────────────────────────────────────────── */
  function resize() {
    var stage = $('stage');
    cssW = stage.clientWidth || 1;
    cssH = stage.clientHeight || 1;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    var cv = $('cv');
    cv.width = Math.round(cssW * dpr);
    cv.height = Math.round(cssH * dpr);
    layoutMap();
  }
  function screenToWorld(sx, sy) {
    return {
      x: view.cx + (sx - cssW / 2) / view.pxPerFt,
      y: view.cy + (cssH / 2 - sy) / view.pxPerFt
    };
  }
  function worldToScreen(p) {
    return {
      x: cssW / 2 + (p.x - view.cx) * view.pxPerFt,
      y: cssH / 2 - (p.y - view.cy) * view.pxPerFt
    };
  }
  function eventPoint(ev) {
    var r = $('cv').getBoundingClientRect();
    return screenToWorld(ev.clientX - r.left, ev.clientY - r.top);
  }
  function snapOf(p, ev) {
    var flags = {
      grid: snaps.grid, endpoint: snaps.endpoint, midpoint: snaps.midpoint,
      edge: snaps.edge, angle: snaps.angle
    };
    if (ev && ev.shiftKey) flags.angle = !flags.angle;
    var base = draft && draft.pts && draft.pts.length ? draft.pts[draft.pts.length - 1] : null;
    if (!base) flags.angle = false;
    var segs = [], i, e, layer, parts, k;
    for (i = 0; i < state.doc.entities.length; i++) {
      e = state.doc.entities[i];
      if (e.type === 'array') continue;
      layer = D.layerById(state.doc, e.layer);
      if (layer && (layer.visible === false || layer.locked)) continue;
      parts = G.entitySegments(e);
      for (k = 0; k < parts.length; k++) segs.push(parts[k]);
    }
    if (!G.finitePoint(p)) return { point: { x: p && p.x, y: p && p.y }, kind: 'free' };
    var cadHit = G.snapCad(root.CAD, p, segs, {
      endpoint: flags.endpoint, midpoint: flags.midpoint, edge: flags.edge, intersection: true,
      gridFt: state.doc.gridFt || 5, pxPerFt: view.pxPerFt, tolPx: 12, base: base
    });
    if (cadHit && cadHit.kind !== 'free') return cadHit;
    return G.snap(p, {
      flags: flags, segments: segs, gridFt: state.doc.gridFt || 5,
      pxPerFt: view.pxPerFt, tolPx: 12, base: base, angleStep: flags.angle && snaps.angle === false ? 90 : (state.doc.angleStep || 90)
    });
  }

  function onDown(ev) {
    if (ev.button === 1 || space || tool === 'pan') {
      pan = { x: ev.clientX, y: ev.clientY, cx: view.cx, cy: view.cy };
      $('cv').setPointerCapture(ev.pointerId);
      paintTools();
      return;
    }
    if (ev.button !== 0) return;
    var raw = eventPoint(ev);
    var sn = snapOf(raw, ev);
    lastSnap = sn;
    var p = sn.point;
    $('cv').setPointerCapture(ev.pointerId);
    if (tool === 'select' && !ev.altKey) {
      var hit = hitAt(p);
      if (hit) {
        var ids = ev.shiftKey ? toggleSel(hit.id) : (state.selection.indexOf(hit.id) >= 0 ? state.selection.slice() : D.groupIds(state.doc, [hit.id]));
        if (!ev.shiftKey && state.selection.indexOf(hit.id) < 0) state.selection = ids;
        else if (ev.shiftKey) state.selection = ids;
        drag = { ids: state.selection.slice(), snapshot: D.clone(state.doc), start: p, moved: false };
        refresh();
        return;
      }
      if (!ev.shiftKey) state.selection = [];
      box = { a: p, b: p, shift: !!ev.shiftKey, base: state.selection.slice() };
      refresh();
      return;
    }
    acceptPoint(p);
  }
  function toggleSel(id) {
    var ids = D.groupIds(state.doc, [id]), sel = state.selection.slice(), i, at;
    for (i = 0; i < ids.length; i++) {
      at = sel.indexOf(ids[i]);
      if (at >= 0) sel.splice(at, 1); else sel.push(ids[i]);
    }
    return sel;
  }
  function hitAt(p) {
    var tol = 8 / view.pxPerFt, i, e, layer, lay, t;
    for (i = state.doc.entities.length - 1; i >= 0; i--) {
      e = state.doc.entities[i];
      layer = D.layerById(state.doc, e.layer);
      if (layer && layer.visible === false) continue;
      if (e.type === 'array') {
        lay = D.arrayLayout(state.doc, e);
        if (lay.ok) {
          for (t = 0; t < lay.tables.length; t++) {
            if (p.x >= lay.tables[t].x && p.x <= lay.tables[t].x + lay.tables[t].w &&
                p.y >= lay.tables[t].y && p.y <= lay.tables[t].y + lay.tables[t].h) return e;
          }
        }
        continue;
      }
      if (G.hitEntity(e, p, tol)) return e;
    }
    return null;
  }
  function onMove(ev) {
    var raw = eventPoint(ev);
    cursor = raw;
    if (pan) {
      view.cx = pan.cx - (ev.clientX - pan.x) / view.pxPerFt;
      view.cy = pan.cy + (ev.clientY - pan.y) / view.pxPerFt;
      layoutMap();
      requestDraw();
      writeCoords(raw, null);
      return;
    }
    var sn = snapOf(raw, ev);
    lastSnap = sn;
    writeCoords(sn.point, sn.kind);
    if (drag) {
      var dx = sn.point.x - drag.start.x, dy = sn.point.y - drag.start.y;
      if (Math.abs(dx) + Math.abs(dy) > 0.05) drag.moved = true;
      applyDrag(dx, dy);
      requestDraw();
      return;
    }
    if (box) { box.b = sn.point; requestDraw(); return; }
    requestDraw();
  }
  function applyDrag(dx, dy) {
    var want = {}, i;
    for (i = 0; i < drag.ids.length; i++) want[drag.ids[i]] = true;
    state.doc.entities = drag.snapshot.entities.map(function (e) {
      if (!want[e.id]) return D.clone(e);
      var layer = D.layerById(state.doc, e.layer);
      if (layer && layer.locked) return D.clone(e);
      return G.moveEntity(e, dx, dy);
    });
  }
  function onUp(ev) {
    if (pan) { pan = null; paintTools(); layoutMap(); return; }
    if (drag) {
      if (drag.moved) {
        state.past.push(drag.snapshot);
        if (state.past.length > 80) state.past.shift();
        state.future = [];
        editSeq++;
        dirty = true;
        scheduleRecovery();
        saveLabel();
      } else {
        state.doc.entities = drag.snapshot.entities;
      }
      drag = null;
      refresh();
      return;
    }
    if (box) {
      var crossing = box.b.x < box.a.x;
      var ids = G.boxSelect(state.doc.entities, box.a, box.b, crossing);
      state.selection = box.shift ? unique(box.base.concat(ids)) : ids;
      box = null;
      refresh();
    }
  }
  function unique(list) {
    var seen = {}, out = [], i;
    for (i = 0; i < list.length; i++) if (!seen[list[i]]) { seen[list[i]] = true; out.push(list[i]); }
    return out;
  }
  function onWheel(ev) {
    ev.preventDefault();
    var r = $('cv').getBoundingClientRect();
    var sx = ev.clientX - r.left, sy = ev.clientY - r.top;
    var before = screenToWorld(sx, sy);
    var factor = ev.deltaY < 0 ? 1.12 : 1 / 1.12;
    view.pxPerFt = Math.max(0.02, Math.min(80, view.pxPerFt * factor));
    var after = screenToWorld(sx, sy);
    view.cx += before.x - after.x;
    view.cy += before.y - after.y;
    layoutMap();
    requestDraw();
  }
  function fit(announce) {
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, i, b, any = false;
    for (i = 0; i < state.doc.entities.length; i++) {
      b = G.boundsOf(state.doc.entities[i]);
      if (!isFinite(b.minX)) continue;
      any = true;
      if (b.minX < minX) minX = b.minX;
      if (b.minY < minY) minY = b.minY;
      if (b.maxX > maxX) maxX = b.maxX;
      if (b.maxY > maxY) maxY = b.maxY;
    }
    if (!any) { minX = -20; minY = -20; maxX = 200; maxY = 120; }
    var pad = 30;
    minX -= pad; minY -= pad; maxX += pad; maxY += pad;
    view.cx = (minX + maxX) / 2;
    view.cy = (minY + maxY) / 2;
    view.pxPerFt = Math.max(0.02, Math.min(cssW / (maxX - minX || 1), cssH / (maxY - minY || 1)));
    layoutMap();
    requestDraw();
    if (announce) setStatus('Zoomed to the drawing.');
  }

  /* ── paint ─────────────────────────────────────────────────────────── */
  function requestDraw() {
    if (raf) return;
    raf = requestAnimationFrame(function () { raf = 0; draw(); });
  }
  function draw() {
    var cv = $('cv'), ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    if (!mapOn) { ctx.fillStyle = '#E4E1D8'; ctx.fillRect(0, 0, cssW, cssH); }
    drawGrid(ctx);
    drawEntities(ctx, false);
    drawDraft(ctx);
    drawSelection(ctx);
    drawSnap(ctx);
    drawChrome(ctx);
  }
  function drawGrid(ctx) {
    var g = state.doc.gridFt || 5;
    var stepPx = g * view.pxPerFt;
    if (stepPx < 8) return;
    var a = screenToWorld(0, cssH), b = screenToWorld(cssW, 0);
    var x0 = Math.floor(Math.min(a.x, b.x) / g) * g;
    var y0 = Math.floor(Math.min(a.y, b.y) / g) * g;
    var x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(22,32,43,.12)';
    ctx.lineWidth = 1;
    var x, y, s;
    for (x = x0; x <= x1; x += g) {
      if (Math.round(x / g) % 5 === 0) continue;
      s = worldToScreen({ x: x, y: 0 });
      ctx.moveTo(s.x, 0); ctx.lineTo(s.x, cssH);
    }
    for (y = y0; y <= y1; y += g) {
      if (Math.round(y / g) % 5 === 0) continue;
      s = worldToScreen({ x: 0, y: y });
      ctx.moveTo(0, s.y); ctx.lineTo(cssW, s.y);
    }
    ctx.stroke();
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(22,32,43,.28)';
    for (x = x0; x <= x1; x += g) {
      if (Math.round(x / g) % 5 !== 0) continue;
      s = worldToScreen({ x: x, y: 0 });
      ctx.moveTo(s.x, 0); ctx.lineTo(s.x, cssH);
    }
    for (y = y0; y <= y1; y += g) {
      if (Math.round(y / g) % 5 !== 0) continue;
      s = worldToScreen({ x: 0, y: y });
      ctx.moveTo(0, s.y); ctx.lineTo(cssW, s.y);
    }
    ctx.stroke();
  }
  function layerColor(e) {
    var l = D.layerById(state.doc, e.layer);
    return (l && l.color) || '#16202B';
  }
  function visible(e) {
    var l = D.layerById(state.doc, e.layer);
    return !l || l.visible !== false;
  }
  function drawEntities(ctx, exporting) {
    var i;
    for (i = 0; i < state.doc.entities.length; i++) {
      if (!visible(state.doc.entities[i])) continue;
      drawOne(ctx, state.doc.entities[i], exporting);
    }
  }
  function poly(ctx, pts, close) {
    if (!pts || !pts.length) return;
    var s = worldToScreen(pts[0]), i;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    for (i = 1; i < pts.length; i++) { s = worldToScreen(pts[i]); ctx.lineTo(s.x, s.y); }
    if (close) ctx.closePath();
  }
  function drawOne(ctx, e) {
    ctx.save();
    ctx.lineWidth = e.type === 'dim' ? 1 : 1.4;
    ctx.strokeStyle = layerColor(e);
    ctx.fillStyle = layerColor(e);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (e.type === 'line') {
      poly(ctx, [e.a, e.b], false); ctx.stroke();
    } else if (e.type === 'dim') drawDim(ctx, e);
    else if (e.type === 'circle') {
      var c = worldToScreen({ x: e.x, y: e.y });
      ctx.beginPath(); ctx.arc(c.x, c.y, e.r * view.pxPerFt, 0, Math.PI * 2); ctx.stroke();
    } else if (e.type === 'rect' || e.type === 'equip' || e.type === 'parking') {
      poly(ctx, G.rectCorners(e), true);
      ctx.globalAlpha = e.type === 'equip' ? 0.14 : 0.04;
      ctx.fill(); ctx.globalAlpha = 1; ctx.stroke();
      if (e.label) label(ctx, { x: e.x, y: e.y }, e.label);
    } else if (e.type === 'text') label(ctx, { x: e.x, y: e.y }, e.text || '');
    else if (e.type === 'callout') {
      poly(ctx, [e.target, e.anchor], false); ctx.stroke();
      var tip = worldToScreen(e.target);
      ctx.beginPath(); ctx.arc(tip.x, tip.y, 3, 0, Math.PI * 2); ctx.fill();
      label(ctx, e.anchor, e.text || '');
    } else if (e.type === 'obstruction') {
      poly(ctx, e.pts, true);
      ctx.save(); ctx.clip();
      ctx.globalAlpha = 0.18; ctx.fill();
      ctx.globalAlpha = 0.45; hatch(ctx); ctx.restore();
      ctx.setLineDash([5, 4]); ctx.stroke();
    } else if (e.type === 'setback') {
      poly(ctx, e.pts, true); ctx.setLineDash([8, 5]); ctx.stroke();
    } else if (e.type === 'array') drawArray(ctx, e);
    else if (e.pts && e.pts.length) {
      poly(ctx, e.pts, !!(e.closed || e.type === 'polygon')); ctx.stroke();
    }
    ctx.restore();
  }
  function hatch(ctx) {
    ctx.beginPath();
    var s;
    for (s = -cssH; s < cssW + cssH; s += 8) { ctx.moveTo(s, 0); ctx.lineTo(s - cssH, cssH); }
    ctx.stroke();
  }
  function label(ctx, p, text) {
    var s = worldToScreen(p);
    ctx.save();
    ctx.font = '12px ' + getComputedStyle(document.body).fontFamily;
    ctx.fillStyle = '#16202B';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var w = ctx.measureText(text).width;
    ctx.fillStyle = 'rgba(255,255,255,.88)';
    ctx.fillRect(s.x - w / 2 - 4, s.y - 8, w + 8, 16);
    ctx.fillStyle = '#16202B';
    ctx.fillText(text, s.x, s.y);
    ctx.restore();
  }
  function drawDim(ctx, e) {
    var dx = e.b.x - e.a.x, dy = e.b.y - e.a.y, L = Math.sqrt(dx * dx + dy * dy) || 1;
    var off = e.offset || 8, nx = -dy / L * off, ny = dx / L * off;
    var a2 = { x: e.a.x + nx, y: e.a.y + ny }, b2 = { x: e.b.x + nx, y: e.b.y + ny };
    ctx.strokeStyle = '#0F172A';
    poly(ctx, [e.a, a2], false); ctx.stroke();
    poly(ctx, [e.b, b2], false); ctx.stroke();
    poly(ctx, [a2, b2], false); ctx.stroke();
    label(ctx, { x: (a2.x + b2.x) / 2, y: (a2.y + b2.y) / 2 }, G.formatFeet(G.dist(e.a, e.b)));
  }
  function drawArray(ctx, e) {
    var lay = D.arrayLayout(state.doc, e);
    var host = D.find(state.doc, e.boundaryId);
    var ring = G.ringOf(host || e);
    if (!lay.ok) return;
    ctx.save();
    ctx.strokeStyle = '#1D4ED8';
    ctx.fillStyle = 'rgba(37,99,235,.28)';
    ctx.lineWidth = 1;
    if (lay.densityOnly) {
      if (ring) { poly(ctx, ring, true); ctx.globalAlpha = 0.25; ctx.fill(); ctx.globalAlpha = 1; }
    } else {
      var i, t, pts;
      for (i = 0; i < lay.tables.length; i++) {
        t = lay.tables[i];
        pts = [{ x: t.x, y: t.y }, { x: t.x + t.w, y: t.y }, { x: t.x + t.w, y: t.y + t.h }, { x: t.x, y: t.y + t.h }];
        poly(ctx, pts, true); ctx.fill(); ctx.stroke();
      }
    }
    if (ring) {
      var bb = G.bbox(ring);
      label(ctx, { x: bb.cx, y: bb.cy }, lay.kw + ' kW-DC · ' + lay.tableCount + ' tables');
    }
    ctx.restore();
  }
  function drawDraft(ctx) {
    if (!draft || !draft.pts || !draft.pts.length || !cursor) return;
    var sn = lastSnap ? lastSnap.point : cursor;
    var pts = draft.pts.concat([sn]);
    ctx.save();
    ctx.strokeStyle = '#2B5FA8';
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1.25;
    if (draft.mode === 'rect' && draft.pts.length === 1) {
      var a = draft.pts[0];
      poly(ctx, [{ x: a.x, y: a.y }, { x: sn.x, y: a.y }, { x: sn.x, y: sn.y }, { x: a.x, y: sn.y }], true);
      ctx.stroke();
    } else if (draft.mode === 'circle' && draft.pts.length === 1) {
      var c = worldToScreen(draft.pts[0]), r = G.dist(draft.pts[0], sn) * view.pxPerFt;
      ctx.beginPath(); ctx.arc(c.x, c.y, r, 0, Math.PI * 2); ctx.stroke();
    } else {
      poly(ctx, pts, false); ctx.stroke();
    }
    ctx.restore();
  }
  function drawSelection(ctx) {
    var i, e, b, a, c;
    ctx.save();
    ctx.strokeStyle = '#2B5FA8';
    ctx.fillStyle = '#2B5FA8';
    ctx.lineWidth = 1.5;
    for (i = 0; i < state.selection.length; i++) {
      e = D.find(state.doc, state.selection[i]);
      if (!e) continue;
      b = G.boundsOf(e);
      a = worldToScreen({ x: b.minX, y: b.maxY });
      c = worldToScreen({ x: b.maxX, y: b.minY });
      ctx.strokeRect(a.x - 3, a.y - 3, c.x - a.x + 6, c.y - a.y + 6);
    }
    if (box) {
      a = worldToScreen(box.a); c = worldToScreen(box.b);
      ctx.setLineDash(box.b.x < box.a.x ? [4, 3] : []);
      ctx.strokeStyle = '#1F4E79';
      ctx.strokeRect(Math.min(a.x, c.x), Math.min(a.y, c.y), Math.abs(c.x - a.x), Math.abs(c.y - a.y));
    }
    ctx.restore();
  }
  function drawSnap(ctx) {
    if (!lastSnap || !cursor || lastSnap.kind === 'free' || lastSnap.kind === 'grid') return;
    var s = worldToScreen(lastSnap.point);
    ctx.save();
    ctx.strokeStyle = '#B45309';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(s.x - 5, s.y - 5, 10, 10);
    ctx.restore();
  }
  function drawChrome(ctx) {
    var px = 120, ft = px / view.pxPerFt, nice = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000], i, use = 10;
    for (i = 0; i < nice.length; i++) if (Math.abs(nice[i] - ft) < Math.abs(use - ft)) use = nice[i];
    var w = use * view.pxPerFt;
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    ctx.fillRect(12, cssH - 36, w + 16, 24);
    ctx.strokeStyle = '#16202B';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(20, cssH - 22); ctx.lineTo(20 + w, cssH - 22);
    ctx.moveTo(20, cssH - 26); ctx.lineTo(20, cssH - 18);
    ctx.moveTo(20 + w, cssH - 26); ctx.lineTo(20 + w, cssH - 18);
    ctx.stroke();
    ctx.fillStyle = '#16202B';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(G.formatFeet(use), 20 + w / 2, cssH - 28);
    ctx.textAlign = 'left';
    var nx = cssW - 36, ny = 36;
    ctx.beginPath();
    ctx.moveTo(nx, ny - 16); ctx.lineTo(nx - 6, ny + 8); ctx.lineTo(nx + 6, ny + 8); ctx.closePath();
    ctx.fill();
    ctx.fillText('N', nx - 4, ny + 20);
    if (mapNote) ctx.fillText(mapNote, 16, 18);
    ctx.restore();
  }
  function setLive(text) {
    var el = $('status');
    if (el.getAttribute('data-sticky') === '1') return;
    el.textContent = text;
  }

  /* ── map ───────────────────────────────────────────────────────────── */
  function layoutMap() {
    var host = $('map');
    if (!mapOn) { host.style.display = 'none'; mapNote = ''; return; }
    host.style.display = 'block';
    var z = Math.round(G.zoomForScale(state.doc.anchor.lat, view.pxPerFt));
    if (z < 14) z = 14;
    if (z > 19) z = 19;
    var corners = [screenToWorld(0, 0), screenToWorld(cssW, 0), screenToWorld(0, cssH), screenToWorld(cssW, cssH)];
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, i, ll, t, key;
    for (i = 0; i < corners.length; i++) {
      ll = G.ftToLatLng(corners[i].x, corners[i].y, state.doc.anchor);
      t = latLngToTile(ll.lat, ll.lng, z);
      if (t.x < minX) minX = t.x;
      if (t.x > maxX) maxX = t.x;
      if (t.y < minY) minY = t.y;
      if (t.y > maxY) maxY = t.y;
    }
    var need = {}, count = 0, x, y;
    for (x = minX - 1; x <= maxX + 1; x++) {
      for (y = minY - 1; y <= maxY + 1; y++) {
        key = z + '/' + y + '/' + x;
        need[key] = { z: z, x: x, y: y };
        count++;
      }
    }
    if (count > 24) {
      mapNote = 'Zoom in to load aerial imagery.';
      host.style.display = 'none';
      return;
    }
    mapNote = '';
    var k;
    for (k in tiles) if (tiles.hasOwnProperty(k) && !need[k]) {
      if (tiles[k].img.parentNode) tiles[k].img.parentNode.removeChild(tiles[k].img);
      delete tiles[k];
    }
    for (k in need) if (need.hasOwnProperty(k)) {
      if (!tiles[k]) tiles[k] = loadTile(need[k], k);
      placeTile(tiles[k]);
    }
  }
  function latLngToTile(lat, lng, z) {
    var n = Math.pow(2, z);
    var x = Math.floor((lng + 180) / 360 * n);
    var r = lat * Math.PI / 180;
    var y = Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n);
    return { x: x, y: y };
  }
  function tileNW(x, y, z) {
    var n = Math.pow(2, z);
    var lng = x / n * 360 - 180;
    var lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) * 180 / Math.PI;
    return { lat: lat, lng: lng };
  }
  function loadTile(spec, key) {
    var img = document.createElement('img');
    img.alt = '';
    img.crossOrigin = 'anonymous';
    img.draggable = false;
    var node = { img: img, spec: spec, ready: false, failed: false };
    img.onload = function () { node.ready = true; requestDraw(); };
    img.onerror = function () { node.failed = true; mapNote = 'Aerial imagery did not load. The drawing is still to scale.'; };
    img.src = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/' + spec.z + '/' + spec.y + '/' + spec.x;
    $('map').appendChild(img);
    return node;
  }
  function placeTile(node) {
    var nw = tileNW(node.spec.x, node.spec.y, node.spec.z);
    var se = tileNW(node.spec.x + 1, node.spec.y + 1, node.spec.z);
    var a = worldToScreen(G.latLngToFt(nw.lat, nw.lng, state.doc.anchor));
    var b = worldToScreen(G.latLngToFt(se.lat, se.lng, state.doc.anchor));
    node.img.style.left = Math.min(a.x, b.x) + 'px';
    node.img.style.top = Math.min(a.y, b.y) + 'px';
    node.img.style.width = Math.abs(b.x - a.x) + 'px';
    node.img.style.height = Math.abs(b.y - a.y) + 'px';
  }

  /* ── panels ────────────────────────────────────────────────────────── */
  function refresh() {
    refreshTakeoff();
    refreshCustomer();
    refreshLayers();
    refreshProps(false);
    saveLabel();
    $('project-name').value = state.doc.name || '';
    if (!cursor) {
      var scaled = view.pxPerFt > 0 && isFinite(view.pxPerFt);
      $('coords').textContent = 'E — ' + (scaled ? 'ft' : 'px') + '   N — ' + (scaled ? 'ft' : 'px');
    }
    requestDraw();
    layoutMap();
  }
  function afterChange() {
    editSeq++;
    dirty = true;
    refresh();
    scheduleRecovery();
  }
  function refreshTakeoff() {
    var s = D.summary(state.doc);
    $('kw-dc').innerHTML = '';
    $('kw-dc').appendChild(document.createTextNode(String(s.solarKwDc)));
    var unit = document.createElement('span');
    unit.textContent = 'kW-DC';
    $('kw-dc').appendChild(unit);
    var kv = $('takeoff-kv');
    kv.innerHTML = '';
    row(kv, 'kW-AC', s.solarKwAc);
    row(kv, 'Tables', s.tableCount);
    row(kv, 'Modules', s.moduleCount);
    row(kv, 'Storage', s.bessKw + ' kW / ' + s.bessKwh + ' kWh');
    row(kv, 'Chargers', s.chargerCount);
    $('cv').setAttribute('aria-label', 'Site drawing. ' + s.solarKwDc + ' kilowatts DC, ' + s.tableCount + ' tables, ' + s.bessKw + ' kilowatts of storage.');
  }
  function row(host, k, v) {
    var a = document.createElement('span'), b = document.createElement('b');
    a.textContent = k; b.textContent = String(v);
    host.appendChild(a); host.appendChild(b);
  }
  function refreshCustomer() {
    var s = A.summary(state.doc.assignment || A.empty());
    $('customer-label').textContent = s.label;
    $('customer-btn').title = s.linked ? 'Linked to customer ' + s.customerId : 'No CRM id yet';
    if (state.doc.clientDrift) setStatus('The project list still has a different customer name. Saving the customer here will make them match.', true);
  }
  function refreshLayers() {
    var host = $('layers');
    host.innerHTML = '';
    var i, layer, line, mark, name, eye, lock;
    for (i = 0; i < state.doc.layers.length; i++) {
      layer = state.doc.layers[i];
      line = document.createElement('div');
      line.className = 'layer';
      mark = document.createElement('i');
      mark.className = 'swatch';
      mark.style.background = layer.color;
      name = document.createElement('span');
      name.textContent = layer.name;
      eye = document.createElement('button');
      eye.type = 'button';
      eye.className = 'btn quiet';
      eye.textContent = layer.visible === false ? 'Show' : 'Hide';
      eye.setAttribute('aria-pressed', layer.visible === false ? 'false' : 'true');
      eye.setAttribute('data-layer', layer.id);
      eye.addEventListener('click', onLayerVis);
      lock = document.createElement('button');
      lock.type = 'button';
      lock.className = 'btn quiet';
      lock.textContent = layer.locked ? 'Unlock' : 'Lock';
      lock.setAttribute('data-layer', layer.id);
      lock.addEventListener('click', onLayerLock);
      line.appendChild(mark); line.appendChild(name); line.appendChild(eye); line.appendChild(lock);
      host.appendChild(line);
    }
  }
  function onLayerVis(ev) { toggleLayer(ev.currentTarget.getAttribute('data-layer'), 'visible'); }
  function onLayerLock(ev) { toggleLayer(ev.currentTarget.getAttribute('data-layer'), 'locked'); }
  function toggleLayer(id, key) {
    var doc = D.clone(state.doc), layer = D.layerById(doc, id);
    if (!layer) return;
    layer[key] = key === 'visible' ? layer.visible === false : !layer.locked;
    D.commit(state, doc, state.selection.slice());
    afterChange();
  }
  function refreshProps(force) {
    var sig = state.selection.join(',') + ':' + state.doc.entities.length + ':' + (state.doc.address || '');
    if (!force && sig === propSig) return;
    if (!force && $('props').contains(document.activeElement)) return;
    propSig = sig;
    var host = $('props');
    host.innerHTML = '';
    field(host, 'Address', state.doc.address || '', function (v) {
      D.setMeta(state, { address: v }); afterChange();
    });
    var find = document.createElement('button');
    find.type = 'button'; find.className = 'btn'; find.textContent = 'Find address';
    find.addEventListener('click', function () {
      var input = host.querySelector('input');
      locate(input ? input.value : '');
    });
    host.appendChild(find);
    field(host, 'Grid (ft)', String(state.doc.gridFt || 5), function (v) {
      var n = parseFloat(v);
      if (!(n > 0) || n > 500) { setStatus('Grid size must be between 0 and 500 ft.', true); return; }
      D.setMeta(state, { gridFt: n }); afterChange();
    });
    if (state.selection.length === 1) entityProps(host, D.find(state.doc, state.selection[0]));
    else if (state.selection.length > 1) {
      var p = document.createElement('p');
      p.textContent = state.selection.length + ' objects selected. Align and distribute use the edges of each one.';
      host.appendChild(p);
    }
  }
  function field(host, label, value, onchange) {
    var wrap = document.createElement('label');
    wrap.className = 'field';
    wrap.appendChild(document.createTextNode(label));
    var input = document.createElement('input');
    input.value = value;
    input.addEventListener('change', function () { onchange(input.value); });
    wrap.appendChild(input);
    host.appendChild(wrap);
    return input;
  }
  function entityProps(host, e) {
    if (!e) return;
    var title = document.createElement('p');
    title.textContent = e.type === 'equip' ? (e.label || e.key) : e.type;
    host.appendChild(title);
    if (e.type === 'equip') {
      numField(host, 'Width (ft)', e.w, function (n) { D.patch(state, e.id, { w: n }); afterChange(); });
      numField(host, 'Depth (ft)', e.h, function (n) { D.patch(state, e.id, { h: n }); afterChange(); });
      numField(host, 'Rotation (°)', e.rot || 0, function (n) { D.patch(state, e.id, { rot: n }); afterChange(); });
      if (e.key === 'bess' || e.key === 'charger' || e.key === 'pcs') {
        numField(host, 'kW', e.kw || 0, function (n) { D.patch(state, e.id, { kw: n }); afterChange(); });
      }
      if (e.key === 'bess') numField(host, 'kWh', e.kwh || 0, function (n) { D.patch(state, e.id, { kwh: n }); afterChange(); });
    }
    if (e.type === 'array') {
      var lay = D.arrayLayout(state.doc, e);
      var note = document.createElement('p');
      note.textContent = lay.ok
        ? (lay.tableCount + ' tables · ' + lay.moduleCount + ' modules · ' + lay.kw + ' kW-DC' + (lay.kwSource === 'entered' ? ' (entered)' : ''))
        : lay.reason;
      host.appendChild(note);
      var sel = document.createElement('select');
      var mounts = ['fixed-ground', 'tracker-1ax', 'rooftop', 'carport'], i, opt;
      for (i = 0; i < mounts.length; i++) {
        opt = document.createElement('option');
        opt.value = mounts[i];
        opt.textContent = G.PRESETS[mounts[i]].label;
        if ((e.mount || 'fixed-ground') === mounts[i]) opt.selected = true;
        sel.appendChild(opt);
      }
      sel.addEventListener('change', function () {
        D.patch(state, e.id, { mount: sel.value, setbackFt: null });
        afterChange();
      });
      host.appendChild(sel);
      numField(host, 'Setback (ft)', e.setbackFt == null ? (lay.setbackFt || 0) : e.setbackFt, function (n) {
        D.patch(state, e.id, { setbackFt: n }); afterChange();
      });
      numField(host, 'kW-DC, if you want to type it', e.kwOverride || '', function (n) {
        D.patch(state, e.id, { kwOverride: n > 0 ? n : null }); afterChange();
      }, true);
    }
    if (e.type === 'line' || e.type === 'dim') {
      var p = document.createElement('p');
      p.textContent = G.formatFeet(G.dist(e.a, e.b));
      host.appendChild(p);
    }
    if (e.type === 'polygon' || e.type === 'rect' || e.type === 'obstruction' || e.type === 'setback') {
      var ring = G.ringOf(e);
      if (ring) {
        var area = document.createElement('p');
        area.textContent = 'Area ' + Math.round(G.area(ring)).toLocaleString() + ' sq ft';
        host.appendChild(area);
      }
    }
  }
  function numField(host, label, value, onchange, allowBlank) {
    field(host, label, value === 0 ? '0' : String(value == null ? '' : value), function (v) {
      if (allowBlank && String(v).trim() === '') { onchange(0); return; }
      var n = parseFloat(v);
      if (!isFinite(n)) { setStatus(label + ' needs a number.', true); return; }
      onchange(n);
    });
  }

  function locate(q) {
    q = String(q || '').trim();
    var m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(q);
    if (m) { setAnchor(parseFloat(m[1]), parseFloat(m[2]), q); return; }
    if (!q) { setStatus('Type an address, or latitude, longitude.', true); return; }
    setStatus('Looking up that address…');
    fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(q))
      .then(function (r) { if (!r.ok) throw new Error('search failed'); return r.json(); })
      .then(function (rows) {
        if (!rows || !rows.length) { setStatus('No match. Type latitude, longitude instead.', true); return; }
        setAnchor(parseFloat(rows[0].lat), parseFloat(rows[0].lon), q);
      })
      .catch(function () {
        setStatus('Address search did not answer. Type latitude, longitude, for example 33.45, -112.07.', true);
      });
  }
  function setAnchor(lat, lng, address) {
    if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      setStatus('That is not a latitude and longitude.', true); return;
    }
    D.setMeta(state, { anchor: { lat: lat, lng: lng }, address: address || state.doc.address });
    afterChange();
    setStatus('Anchor set. The aerial photo is scaled to this latitude.');
  }

  function writeCoords(p, kind) {
    var scaled = view.pxPerFt > 0 && isFinite(view.pxPerFt);
    var text = G.coordReadout(p, scaled);
    if (kind && kind !== 'free' && text !== '—') text += '   ' + kind;
    $('coords').textContent = text;
  }
  function setStatus(text, isError) {
    var el = $('status');
    el.textContent = text;
    el.className = isError ? 'is-err' : '';
    el.setAttribute('data-sticky', '1');
  }
  function saveLabel() {
    var el = $('save-state');
    el.textContent = dirty ? 'Unsaved' : (savedOnce ? 'Saved here' : 'Not saved');
    el.className = !dirty && savedOnce ? 'is-ok' : '';
  }

  /* ── persistence and export. This browser only. ────────────────────── */
  function scheduleRecovery() {
    if (recoverTimer) clearTimeout(recoverTimer);
    recoverTimer = setTimeout(writeRecovery, 400);
  }
  function writeRecovery() {
    if (!dirty) { R.drop(localStorage); return; }
    var packed = R.write(localStorage, state.doc);
    if (!packed.ok) {
      setStatus('This drawing is too large to keep a recovery copy. Save a project file before you close the tab.', true);
    }
  }
  function saveLocal() {
    var record, savedAt;
    try { record = B.project(state.doc); }
    catch (err) { setStatus(err.message || 'Could not build the project record.', true); return; }
    saving = true;
    try {
      var all = JSON.parse(localStorage.getItem(PROJECTS) || '{}');
      savedAt = Date.now();
      all[state.doc.projectId] = { savedAt: savedAt, name: state.doc.name, client: record.client, record: record };
      localStorage.setItem(PROJECTS, JSON.stringify(all));
      R.drop(localStorage);
      dirty = false;
      savedOnce = true;
      saveLabel();
      setStatus('Saved on this computer as project ' + state.doc.projectId + '.');
    } catch (err) {
      setStatus('Could not save in this browser. Download the project file instead.', true);
      exportJson();
    }
    saving = false;
  }
  function openDialog() {
    var list = $('open-list'), all, ids, i, li, btn;
    list.innerHTML = '';
    try { all = JSON.parse(localStorage.getItem(PROJECTS) || '{}'); } catch (e) { all = {}; }
    ids = Object.keys(all);
    if (!ids.length) {
      li = document.createElement('li');
      li.textContent = 'No projects saved on this computer yet.';
      list.appendChild(li);
    }
    for (i = 0; i < ids.length; i++) {
      li = document.createElement('li');
      btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = (all[ids[i]].name || 'Untitled') + (all[ids[i]].client ? ' · ' + all[ids[i]].client : '');
      btn.setAttribute('data-id', ids[i]);
      btn.addEventListener('click', function (ev) {
        var id = ev.currentTarget.getAttribute('data-id');
        $('dlg-open').close();
        confirmDirty(function () { openRecord(all[id].record, all[id].savedAt); });
      });
      li.appendChild(btn);
      list.appendChild(li);
    }
    $('dlg-open').showModal();
  }
  function openRecord(record, savedAt) {
    var seq = editSeq;
    try {
      var doc = B.fromRecord(record);
      state = D.createState(doc);
      /* An edit that landed while this open was in flight stays unsaved.
         The open itself, with no such edit, is the saved copy. */
      dirty = R.loadKeepsDirty(editSeq !== seq);
      savedOnce = !dirty;
      draft = null;
      fit(false);
      refresh();
      if (!dirty && offerRecovery(doc.projectId, savedAt)) return;
      setStatus(dirty
        ? 'Opened “' + (doc.name || 'project') + '”. Edits made while it was opening are still unsaved.'
        : 'Opened “' + (doc.name || 'project') + '”.');
    } catch (err) {
      setStatus(err.message || 'That file could not be opened.', true);
    }
  }

  var pendingDraft = null;
  function savedAtOf(id) {
    try {
      var all = JSON.parse(localStorage.getItem(PROJECTS) || '{}');
      return all[id] && all[id].savedAt != null ? all[id].savedAt : null;
    } catch (e) { return null; }
  }
  function offerRecovery(projectId, savedAt) {
    var draftRec = R.read(localStorage);
    if (!draftRec) return false;
    var ctx = { now: Date.now() };
    if (projectId) {
      ctx.projectId = projectId;
      ctx.savedAt = savedAt == null ? null : savedAt;
    } else {
      ctx.projectId = draftRec.projectId;
      ctx.savedAt = savedAtOf(draftRec.projectId);
    }
    var decision = R.offer(draftRec, ctx);
    if (!decision.offer) return false;
    pendingDraft = draftRec;
    $('recover-copy').textContent = '“' + (draftRec.name || 'A drawing') + '” was still unsaved on this computer. Restore puts it back. Discard leaves what is on screen.';
    $('dlg-recover').showModal();
    return true;
  }
  function restoreDraft() {
    var draftRec = pendingDraft;
    pendingDraft = null;
    $('dlg-recover').close();
    if (!draftRec) return;
    var seq = editSeq;
    try {
      state = D.createState(D.restore(draftRec.doc));
      dirty = true;
      if (R.loadKeepsDirty(editSeq !== seq)) dirty = true;
      savedOnce = false;
      draft = null;
      fit(false);
      refresh();
      setStatus('Restored unsaved work. It is not saved until you press Save.');
    } catch (err) {
      setStatus(err.message || 'That recovery copy could not be opened.', true);
    }
  }
  function discardDraft() {
    pendingDraft = null;
    R.drop(localStorage);
    $('dlg-recover').close();
    setStatus('Discarded the unsaved copy on this computer.');
  }

  function download(name, mime, data) {
    var blob = data instanceof Blob ? data : new Blob([data], { type: mime });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.parentNode.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
  }
  function fileBase() {
    return (state.doc.name || 'site-plan').replace(/[^\w.-]+/g, '-').replace(/^-|-$/g, '') || 'site-plan';
  }
  function exportJson() {
    try { download(fileBase() + '.json', 'application/json', JSON.stringify(B.project(state.doc), null, 2)); }
    catch (err) { setStatus(err.message, true); }
  }
  function exportDxf() { download(fileBase() + '.dxf', 'application/dxf', X.toDxf(state.doc)); }
  function exportPdf() { download(fileBase() + '.pdf', 'application/pdf', X.toPdf(state.doc, D.summary(state.doc))); }
  function exportPng() {
    var cv = document.createElement('canvas');
    cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr);
    var ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#E4E1D8';
    ctx.fillRect(0, 0, cssW, cssH);
    var failed = false, k, node, a, b, nw, se;
    if (mapOn) {
      for (k in tiles) if (tiles.hasOwnProperty(k)) {
        node = tiles[k];
        if (!node.ready || node.failed) continue;
        try {
          nw = tileNW(node.spec.x, node.spec.y, node.spec.z);
          se = tileNW(node.spec.x + 1, node.spec.y + 1, node.spec.z);
          a = worldToScreen(G.latLngToFt(nw.lat, nw.lng, state.doc.anchor));
          b = worldToScreen(G.latLngToFt(se.lat, se.lng, state.doc.anchor));
          ctx.drawImage(node.img, Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
        } catch (err) { failed = true; }
      }
    }
    drawGrid(ctx);
    drawEntities(ctx, true);
    drawChrome(ctx);
    if (failed) setStatus('The aerial photo could not be included. The PNG is the linework.', true);
    cv.toBlob(function (blob) {
      if (!blob) { setStatus('Could not build the PNG.', true); return; }
      download(fileBase() + '.png', 'image/png', blob);
    }, 'image/png');
  }
  function onImport(ev) {
    var file = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if (!file) return;
    var reader = new FileReader();
    reader.onerror = function () { setStatus('Could not read that file.', true); };
    reader.onload = function () {
      var text = String(reader.result || '');
      if (/\.dxf$/i.test(file.name) || text.indexOf('SECTION') >= 0 && text.indexOf('EOF') >= 0 && text.indexOf('{') !== 0) {
        importDxf(text); return;
      }
      try {
        var json = JSON.parse(text);
        if (json.editorV2 || json.schema === 'omega.project/1') openRecord(json.schema ? json : { editorV2: json.editorV2, assignment: json.assignment, client: json.client });
        else if (json.schema === D.SCHEMA) {
          state = D.createState(D.restore(json));
          dirty = true; fit(false); refresh();
          setStatus('Opened the drawing.');
        } else setStatus('That JSON is not a Site Plan or a project record.', true);
      } catch (err) { setStatus('Could not read that file. Use a project JSON or a DXF.', true); }
    };
    reader.readAsText(file);
  }
  function importDxf(text) {
    var parsed = X.fromDxf(text);
    if (!parsed.entities.length) { setStatus('No lines or polylines were found in that DXF.', true); return; }
    var doc = D.clone(state.doc);
    doc.entities = doc.entities.concat(parsed.entities);
    D.commit(state, doc, parsed.entities.map(function (e) { return e.id; }));
    afterChange();
    fit(false);
    setStatus('Imported ' + parsed.entities.length + ' objects from DXF.');
  }

  /* ── customer dialog ───────────────────────────────────────────────── */
  function openCustomer() {
    var a = state.doc.assignment || A.empty();
    $('cust-name').value = a.customerName || '';
    $('cust-id').value = a.customerId || '';
    $('cust-error').textContent = '';
    var list = $('party-list');
    list.innerHTML = '';
    var rows = a.stakeholders && a.stakeholders.length ? a.stakeholders : [{ role: 'contact' }];
    for (var i = 0; i < rows.length; i++) addPartyRow(rows[i]);
    $('dlg-customer').showModal();
    $('cust-name').focus();
  }
  function addPartyRow(row) {
    row = row || { role: 'contact' };
    var line = document.createElement('div');
    line.className = 'party';
    var role = document.createElement('select');
    var roles = A.ROLES, i, opt;
    for (i = 0; i < roles.length; i++) {
      opt = document.createElement('option');
      opt.value = roles[i];
      opt.textContent = A.ROLE_LABEL[roles[i]];
      if (row.role === roles[i]) opt.selected = true;
      role.appendChild(opt);
    }
    var name = document.createElement('input');
    name.placeholder = 'Name';
    name.value = row.name || '';
    name.maxLength = 120;
    var company = document.createElement('input');
    company.placeholder = 'Company';
    company.value = row.company || '';
    company.maxLength = 120;
    var email = document.createElement('input');
    email.className = 'email';
    email.placeholder = 'Email';
    email.value = row.email || '';
    email.maxLength = 254;
    var drop = document.createElement('button');
    drop.type = 'button'; drop.className = 'btn quiet'; drop.textContent = '×';
    drop.setAttribute('aria-label', 'Remove');
    drop.addEventListener('click', function () { line.parentNode.removeChild(line); });
    line.appendChild(role); line.appendChild(name); line.appendChild(company); line.appendChild(drop);
    line.appendChild(email);
    line._fields = { role: role, name: name, company: company, email: email, partyId: row.partyId || '' };
    $('party-list').appendChild(line);
  }
  function saveCustomer(ev) {
    ev.preventDefault();
    var rows = $('party-list').children, stakeholders = [], i, f;
    for (i = 0; i < rows.length; i++) {
      f = rows[i]._fields;
      if (!f) continue;
      stakeholders.push({ role: f.role.value, name: f.name.value, company: f.company.value, email: f.email.value, partyId: f.partyId });
    }
    try {
      var assignment = A.normalize({
        customerId: $('cust-id').value,
        customerName: $('cust-name').value,
        stakeholders: stakeholders
      });
      D.setMeta(state, { assignment: assignment, clientDrift: false });
      $('cust-error').textContent = '';
      $('dlg-customer').close();
      afterChange();
      var s = A.summary(assignment);
      setStatus(s.customerName ? ('Customer set to ' + s.customerName + (s.linked ? '' : '. No CRM id yet.') ) : 'Customer cleared.');
    } catch (err) {
      $('cust-error').textContent = err.message || 'Check the customer and try again.';
    }
  }

  root.OmegaEditorV2App = { boot: boot, VERSION: 'editor-v2-app/1' };
})(typeof window !== 'undefined' ? window : global);
