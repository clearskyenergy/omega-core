/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * omega-editor-v2-app.js — Omega Maximus ("editor maximum"; Site Plan while it
 * was built), the editor beside Site Map at /editor-v2.
 *
 * Drawing state lives in omega-editor-v2-doc.js. This file is the page:
 * the canvas, the command line, save-on-this-computer, and the customer
 * dialog. Sections are Site, Design, Analyze, Outputs, and Funding.
 * Sign-in is omega-editor-v2-auth.js: the same Firebase project and
 * persisted session as Site Map. This file does not write a workspace.
 */
(function (root) {
  'use strict';

  var G, D, A, B, X, R;
  var state, tool = 'select', equipKey = null, mapOn = true, dirty = false, savedOnce = false, saving = false, lastSaveLocation = 'local';
  var editSeq = 0, runEdit = -1;
  var snaps = { grid: true, endpoint: true, midpoint: true, edge: true, angle: false };
  var view = { cx: 200, cy: 140, pxPerFt: 1.5 };
  var gridView = null, gridFit = false;
  var draft = null, drag = null, box = null, pan = null, space = false;
  var clipboard = null, pasteN = 0, lastSnap = null, cursor = null;
  var raf = 0, cssW = 1, cssH = 1, dpr = 1, propSig = '';
  var tiles = {}, mapNote = '', mapAt = null, recoverTimer = 0, section = 'design';
  /* Parcel lines: their own tiles over the photo, the point the card is
     about (the site point, or the map centre when asked), the source the
     tiles were built from, and the anchor last looked up. */
  var ptiles = {}, parcelSrc = '', parcelAt = null, parcelCard = true, parcelKey = '';
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
    ARRAY: 'array', FIT: 'zoom-ext', Z: 'zoom-ext', HELP: 'help', NEW: 'new',
    '3D': 'view3d', VIEW3D: 'view3d', '2D': 'view2d', PLAN: 'view2d'
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
    if (root.OmegaEditorV2Solar && root.OmegaEditorV2Solar.attach) {
      root.OmegaEditorV2Solar.attach({
        getDoc: function () { return state.doc; },
        setMeta: function (meta) { D.setMeta(state, meta); afterChange(); },
        setStatus: setStatus
      });
    }
    bind();
    resize();
    fit(false);
    refresh();
    var recovering = offerRecovery(null, null);
    if (root.OmegaEditorV2Hooks) {
      root.OmegaEditorV2Hooks.register('permit', function (ctx) {
        if (ctx && ctx.reason === 'build') return true;
        openOutputs('permit');
        return true;
      });
      root.OmegaEditorV2Hooks.register('sld', function (ctx) {
        if (ctx && ctx.reason === 'build') return true;
        openOutputs('sld');
        return true;
      });
    }
    if (!recovering) setStatus('Sample site loaded.');
    checkAccess();
    if (root.OmegaEditorV2Auth && root.OmegaEditorV2Auth.onSignIn) root.OmegaEditorV2Auth.onSignIn(function () { checkAccess(); });
    /* Parcel lines are a view setting this browser remembers. */
    if (root.OmegaEditorV2Parcels && root.OmegaEditorV2Parcels.remembered()) setParcels(true);
    /* Icons too; and Google's satellite starts under the drawing */
    setIcons(rememberedIcons());
    if (root.OmegaEditorV2Satellite) root.OmegaEditorV2Satellite.start($('gsat'), function () { layoutMap(); requestDraw(); });
    var projectParam = /[?&]id=([A-Za-z0-9_-]+)/.exec(location.search);
    if (projectParam && !recovering) loadWorkspace(projectParam[1]);
    if (root.OmegaEditorV2Hooks) root.OmegaEditorV2Hooks.register('funding', function () { pushMarketplace(); return true; });
    var Bld = root.OmegaEditorV2Build;
    if (Bld && Bld.resume) {
      if (recovering) {
        $('dlg-recover').addEventListener('close', function once() {
          $('dlg-recover').removeEventListener('close', once);
          Bld.resume(state, placedCtx());
        });
      } else Bld.resume(state, placedCtx());
    }
    $('cmd').focus();
    if (root.OmegaEditorV2Hooks && root.OmegaEditorV2View3D) {
      root.OmegaEditorV2Hooks.register('view3d', function (ctx) {
        if (ctx && ctx.reason === 'build') return true;
        open3d();
        return true;
      });
    }
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
    $('btn-save').addEventListener('click', saveWorkspace);
    $('btn-local-save').addEventListener('click', saveLocal);
    $('btn-feedback').addEventListener('click', sendFeedback);
    $('btn-open').addEventListener('click', openDialog);
    $('btn-new').addEventListener('click', function () { confirmDirty(blank); });
    $('btn-help').addEventListener('click', function () { $('dlg-help').showModal(); });
    $('help-close').addEventListener('click', function () { $('dlg-help').close(); });
    $('open-close').addEventListener('click', function () { $('dlg-open').close(); });
    var stages = document.querySelectorAll('#stages button');
    for (var s = 0; s < stages.length; s++) stages[s].addEventListener('click', function () { setSection(this.getAttribute('data-stage')); });
    $('next-action').addEventListener('click', function () { nextStep().run(); });
    $('site-yes').addEventListener('click', siteYes);
    /* the site address, the first thing on the Site tab: Enter or the button
       (kept from taking the field's focus, so its first click lands) */
    $('site-address-go').addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); locate(this.value); } });
    $('site-address-find').addEventListener('mousedown', function (ev) { ev.preventDefault(); });
    $('site-address-find').addEventListener('click', function () { locate($('site-address-go').value); });
    $('site-parcels').addEventListener('click', function () { var P = root.OmegaEditorV2Parcels; if (P) setParcels(!P.enabled()); });
    $('dlg-market').addEventListener('close', onMarketClose);
    $('site-no').addEventListener('click', function () { $('site-no-box').hidden = false; $('site-reason').focus(); });
    $('site-reason-save').addEventListener('click', siteNoSave);
    $('build-cancel').addEventListener('click', function () {
      if (root.OmegaEditorV2Build && root.OmegaEditorV2Build.clearDraft) root.OmegaEditorV2Build.clearDraft();
      $('dlg-build').close();
    });
    $('side').addEventListener('change', onSideChange);
    $('btn-side').addEventListener('click', function () {
      var side = $('side'), open = side.classList.toggle('open');
      this.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    $('customer-btn').addEventListener('click', openCustomer);
    $('btn-add-party').addEventListener('click', function () { addPartyRow({ role: 'contact' }); });
    $('cust-cancel').addEventListener('click', function () { $('dlg-customer').close(); });
    $('cust-form').addEventListener('submit', saveCustomer);
    $('file-import').addEventListener('change', onImport);
    var buttons = document.querySelectorAll('[data-tool],[data-act],[data-equip],[data-hook],[data-build],[data-output]');
    for (var i = 0; i < buttons.length; i++) buttons[i].addEventListener('click', onButton);
    $('analyze-close').addEventListener('click', function () { setSection('design'); });
    $('outputs-close').addEventListener('click', function () { setSection('design'); });
    $('parcel-detail-close').addEventListener('click', function () { parcelCard = false; paintParcelCard(); });
    $('parcel-use').addEventListener('click', useParcel);
    $('parcel-here').addEventListener('click', parcelHere);
    if (root.OmegaEditorV2Parcels) root.OmegaEditorV2Parcels.onChange(function () { layoutMap(); paintParcelCard(); requestDraw(); });
    if ($('grid-detail-close') && root.OmegaEditorV2Grid) {
      $('grid-detail-close').addEventListener('click', function () { root.OmegaEditorV2Grid.hideCard(); paintGridCard(); });
    }
    if ($('grid-detail-back') && root.OmegaEditorV2Grid) {
      $('grid-detail-back').addEventListener('click', function () { root.OmegaEditorV2Grid.clearPick(); paintGridCard(); });
    }
    if (root.OmegaEditorV2Grid) {
      root.OmegaEditorV2Grid.onChange(function () {
        var Grid = root.OmegaEditorV2Grid;
        if (Grid.enabled()) {
          var focus = Grid.focus();
          if (focus && !gridFit) {
            if (!gridView) gridView = { cx: view.cx, cy: view.cy, pxPerFt: view.pxPerFt };
            gridFit = true;
            fitGridFocus(focus);
          }
        } else if (gridView) {
          view.cx = gridView.cx;
          view.cy = gridView.cy;
          view.pxPerFt = gridView.pxPerFt;
          gridView = null;
          gridFit = false;
          layoutMap();
        }
        refreshLayers();
        paintGridCard();
        requestDraw();
        if (section === 'analyze' && root.OmegaEditorV2Analyze) root.OmegaEditorV2Analyze.show(state);
      });
    }
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
    if (v === 'save') { saveWorkspace().then(function (ok) { if (ok) next(); }); }
    else if (v === 'discard') { R.drop(localStorage); next(); }
  }

  function onButton(ev) {
    var b = ev.currentTarget;
    var act = b.getAttribute('data-act');
    var eq = b.getAttribute('data-equip');
    var tl = b.getAttribute('data-tool');
    var hook = b.getAttribute('data-hook');
    var buildId = b.getAttribute('data-build');
    var output = b.getAttribute('data-output');
    if (output) { previewOutput(output); return; }
    if (buildId) { openBuild(buildId); return; }
    if (hook) { invokeHook(hook); return; }
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
    else if (act === 'icons') { setIcons(!iconsOn); setStatus(iconsOn ? 'Icons on: each piece is drawn as what it is.' : 'Icons off: each piece is its outline.'); }
    else if (act === 'png') exportPng();
    else if (act === 'pdf') exportPdf();
    else if (act === 'dxf') exportDxf();
    else if (act === 'json') exportJson();
    else if (act === 'import') $('file-import').click();
    else if (act === 'copy') copySel();
    else if (act === 'paste') paste();
    else if (act === 'outputs') setSection(section === 'outputs' ? 'design' : 'outputs');
    else if (act === 'run') runNumbers();
    else if (act === 'quote') setSection('funding');
    else if (act === 'view3d') open3d();
    else if (act === 'view2d' && view3dOpen()) root.OmegaEditorV2View3D.close();
  }
  function view3dOpen() {
    var V = root.OmegaEditorV2View3D;
    return !!(V && V.isOpen && V.isOpen());
  }
  function mark3d(on) {
    var b = $('btn-3d');
    if (b) b.setAttribute('aria-pressed', on ? 'true' : 'false');
    pressed('view3d', on);
  }
  function open3d() {
    var V = root.OmegaEditorV2View3D;
    if (!V) { setStatus('The 3D view did not load.', true); return; }
    if (V.isOpen()) { V.close(); return; }
    var opened = V.open({
      doc: state.doc,
      selection: state.selection.slice(),
      summary: D.summary(state.doc),
      host: $('workspace'),
      onSelection: function (ids) { state.selection = (ids || []).slice(); },
      onClose: function (ids, civil) {
        mark3d(false);
        if (ids) state.selection = ids.slice();
        if (civil && civil.source === 'usgs-3dep') state.doc.civil3d = civil;
        refresh();
        setStatus('Back on the plan.');
      }
    });
    if (!opened || opened.ok === false) {
      mark3d(false);
      setStatus('The 3D view did not open.', true);
      return;
    }
    mark3d(true);
    setStatus('3D. Drag to look around the site. Type 2D to return to the plan.');
  }
  /* Icons: a view setting this browser remembers */
  var iconsOn = false, ICONS_PREF = 'omegaMaximusIcons';
  function rememberedIcons() { try { return root.localStorage.getItem(ICONS_PREF) === '1'; } catch (e) { return false; } }
  function setIcons(on) {
    iconsOn = !!on;
    try { root.localStorage.setItem(ICONS_PREF, iconsOn ? '1' : '0'); } catch (e) { /* this visit only */ }
    pressed('icons', iconsOn);
    requestDraw();
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
    } else if (meta && (ev.key === 's' || ev.key === 'S')) { ev.preventDefault(); saveWorkspace(); }
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
    } else if (ev.key === 'Escape') {
      if (view3dOpen() || (ev.target && ev.target.id === 'cmd')) return;
      cancel();
    } else if ((ev.key === 'Delete' || ev.key === 'Backspace') && ev.target.id !== 'cmd' && !fieldTyping(ev)) {
      if (view3dOpen()) return;
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
    else if (ev.key === 'Escape') {
      ev.preventDefault();
      if (view3dOpen()) { root.OmegaEditorV2View3D.close(); return; }
      cancel();
    }
  }
  function submit(raw) {
    var s = String(raw || '').trim();
    if (view3dOpen()) {
      var back = s.toUpperCase();
      if (back === '2D' || back === 'PLAN' || back === 'CLOSE') { root.OmegaEditorV2View3D.close(); return; }
      if (back === '3D' || back === 'VIEW3D') return;
      if (back === 'HELP') { $('dlg-help').showModal(); return; }
      if (!s) return;
      setStatus('Type 2D to return to the plan.', true);
      return;
    }
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
    if (map[word] === 'view3d') { open3d(); return; }
    if (map[word] === 'view2d') return;
    if (map[word] === 'undo' || map[word] === 'redo' || map[word] === 'erase' || map[word] === 'array' || map[word] === 'zoom-ext') runAct(map[word] === 'zoom-ext' ? 'zoom-ext' : map[word]);
    else if (map[word] === 'help') $('dlg-help').showModal();
    else if (map[word] === 'new') confirmDirty(blank);
    else if (word === 'BUILD') openBuild();
    else if (word === 'RUN') runNumbers();
    else if (word === 'SITE') setSection('site');
    else if (map[word]) setTool(map[word]);
    else setStatus('Unknown command “' + s + '”. Type HELP for the list.', true);
  }

  function cancel() {
    if ($('grid-detail') && !$('grid-detail').hidden && root.OmegaEditorV2Grid) {
      root.OmegaEditorV2Grid.hideCard();
      paintGridCard();
      return;
    }
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
    /* a new project starts where a site starts: its address */
    setSection('site');
    if ($('site-address-go')) $('site-address-go').focus();
    setStatus('New project. Type the site address, then Find on the map. Nothing is saved until you press Save.');
  }

  /* ── pointer ───────────────────────────────────────────────────────── */
  function resize() {
    var stage = $('stage');
    cssW = stage.clientWidth || 1;
    cssH = stage.clientHeight || 1;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    var cv = $('cv'), w = Math.round(cssW * dpr), h = Math.round(cssH * dpr);
    layoutMap();
    /* Setting a canvas size clears it, even to the same size. A section
       change or a closed dialog used to clear the drawing here and leave the
       repaint to a later frame, so it read as gone (handoff A1). Resize only
       when the size changes, and repaint at once when it does. */
    if (cv.width !== w || cv.height !== h) {
      cv.width = w;
      cv.height = h;
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      draw();
    } else requestDraw();
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
      var ghit = !hit && root.OmegaEditorV2Grid ? root.OmegaEditorV2Grid.hitAt(p, 12 / (view.pxPerFt || 1)) : null;
      if (ghit) { root.OmegaEditorV2Grid.pick(ghit); return; }
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
  function boundsOfDrawing() {
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
    return { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
  }
  function fitGridFocus(p) {
    var b = boundsOfDrawing();
    if (p.x < b.minX) b.minX = p.x;
    if (p.y < b.minY) b.minY = p.y;
    if (p.x > b.maxX) b.maxX = p.x;
    if (p.y > b.maxY) b.maxY = p.y;
    var padX = (b.maxX - b.minX) * 0.08 + 40;
    var padY = (b.maxY - b.minY) * 0.08 + 40;
    b.minX -= padX; b.minY -= padY; b.maxX += padX; b.maxY += padY;
    view.cx = (b.minX + b.maxX) / 2;
    view.cy = (b.minY + b.maxY) / 2;
    view.pxPerFt = Math.max(0.02, Math.min(cssW / (b.maxX - b.minX || 1), cssH / (b.maxY - b.minY || 1)));
    layoutMap();
    requestDraw();
  }
  /* Zoom to some entities with room around them: a placed build gets three
     quarters of its size on each side, a lot line (padRatio) a little. */
  function fitTo(ids, padRatio) {
    var want = {}, i, b, minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, any = false;
    for (i = 0; i < (ids || []).length; i++) want[ids[i]] = 1;
    for (i = 0; i < state.doc.entities.length; i++) {
      if (!want[state.doc.entities[i].id]) continue;
      b = G.boundsOf(state.doc.entities[i]);
      if (!isFinite(b.minX) || !isFinite(b.maxY)) continue;
      any = true;
      if (b.minX < minX) minX = b.minX;
      if (b.minY < minY) minY = b.minY;
      if (b.maxX > maxX) maxX = b.maxX;
      if (b.maxY > maxY) maxY = b.maxY;
    }
    if (!any) { fit(false); return; }
    var pad = Math.max(40, Math.max(maxX - minX, maxY - minY) * (padRatio == null ? 0.75 : padRatio));
    minX -= pad; minY -= pad; maxX += pad; maxY += pad;
    view.cx = (minX + maxX) / 2;
    view.cy = (minY + maxY) / 2;
    view.pxPerFt = Math.max(0.02, Math.min(cssW / (maxX - minX || 1), cssH / (maxY - minY || 1)));
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
    if (root.OmegaEditorV2Grid) root.OmegaEditorV2Grid.draw(ctx, worldToScreen);
    if (root.OmegaEditorV2Parcels) root.OmegaEditorV2Parcels.draw(ctx, worldToScreen, state.doc.anchor);
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
    names = { fixed: [], boxes: [] };
    try {
      for (i = 0; i < state.doc.entities.length; i++) {
        if (!visible(state.doc.entities[i])) continue;
        drawOne(ctx, state.doc.entities[i], exporting);
      }
      drawNames(ctx, names);
    } finally { names = null; }
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
      if (e.type === 'equip' && iconsOn && root.OmegaEditorV2Icons && root.OmegaEditorV2Icons.draw(ctx, e, worldToScreen({ x: e.x, y: e.y }), view.pxPerFt)) {
        /* the icon, then the outline in the layer's colour */
        poly(ctx, G.rectCorners(e), true);
        ctx.lineWidth = 1.4;
        ctx.stroke();
      } else {
        poly(ctx, G.rectCorners(e), true);
        /* gear reads on the photo: a firmer fill and line than a lot or a stall */
        ctx.globalAlpha = e.type === 'equip' ? 0.32 : 0.04;
        ctx.fill(); ctx.globalAlpha = 1;
        if (e.type === 'equip') ctx.lineWidth = 1.8;
        ctx.stroke();
      }
      if (e.label) nameBox(ctx, e);
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
      /* Canvas paths are not saved/restored: hatch replaced the polygon. */
      poly(ctx, e.pts, true);
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
  /* ── names, painted after every shape and never on one another ──────
     A guided build's gear stands a few feet apart, and each name used to
     be painted on its own box in drawing order, so the next one covered
     the last ("B Step-u AC Utility point…"; Tommy, 2026-10-20: "clean up
     how you show the guided build"). Text, callouts, dimensions and array
     notes stay where they belong; a box's name goes inside it when it
     fits, else just above, below or beside it, in full or in short (XFMR,
     SWGR, POI), clear of the other names and gear; else it is left off at
     this zoom (zoom in, or select it: the Properties panel names it). The
     selected and the biggest are named first. */
  var names = null;
  var SHORT_NAMES = {
    'utility point of interconnection': 'POI', 'point of interconnection': 'POI', 'point of connection': 'POC',
    'step-up transformer': 'XFMR', 'step-down transformer': 'XFMR', 'service transformer': 'XFMR', 'utility transformer': 'XFMR',
    'utility service transformer': 'XFMR', 'transformer': 'XFMR', 'solid-state transformer': 'SST',
    'switchgear': 'SWGR', 'main switchgear': 'SWGR', 'mv switchgear': 'MV SWGR', 'ac disconnect': 'DISC',
    'static transfer switch': 'STS', 'standby generator': 'GEN', 'revenue meter': 'M', 'meter': 'M', 'panelboard': 'PNL',
    'pcs / inverter skid': 'PCS', 'solar inverter': 'INV', 'pv inverter': 'INV', 'ems cabinet': 'EMS', 'bess container': 'BESS',
    'bess ac block': 'BESS', 'battery': 'BESS', 'cooling plant': 'COOL', 'compute racks': 'RACKS', 'der collector': 'COLL', 'grid substation': 'SUB'
  };
  function shortName(text) {
    var t = String(text || '').trim(), m = /^(.*?)\s+([A-Z]|\d+)$/.exec(t), base = m ? m[1] : t, tail = m ? m[2] : '';
    var k = SHORT_NAMES[base.toLowerCase()];
    if (k) return k + (tail ? ' ' + tail : '');
    if (/^dcfc$/i.test(base) && tail) return 'D' + tail;
    if (/^level 2$/i.test(base) && tail) return 'L' + tail;
    return t.length > 10 ? t.slice(0, 8) + '\u2026' : '';
  }
  function nameBox(ctx, e) {
    if (!names) { label(ctx, { x: e.x, y: e.y }, e.label); return; }
    names.boxes.push(e);
  }
  function tagAt(ctx, cx, cy, text) {
    var w = ctx.measureText(text).width + 8;
    return { x0: cx - w / 2, y0: cy - 8, x1: cx + w / 2, y1: cy + 8, cx: cx, cy: cy, text: text };
  }
  function paintTag(ctx, r) {
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    ctx.fillRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
    ctx.fillStyle = '#16202B';
    ctx.fillText(r.text, r.cx, r.cy);
  }
  function overlaps(r, list, skip) {
    for (var i = 0; i < list.length; i++) {
      if (list[i] === skip) continue;
      if (r.x0 < list[i].x1 && r.x1 > list[i].x0 && r.y0 < list[i].y1 && r.y1 > list[i].y0) return true;
    }
    return false;
  }
  function drawNames(ctx, q) {
    var taken = [], boxes = [], sel = {}, i, k, e, c, s, b, r;
    for (i = 0; i < state.selection.length; i++) sel[state.selection[i]] = 1;
    ctx.save();
    ctx.font = '12px ' + getComputedStyle(document.body).fontFamily;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (i = 0; i < q.fixed.length; i++) {
      s = worldToScreen(q.fixed[i].p);
      r = tagAt(ctx, s.x, s.y, q.fixed[i].text);
      paintTag(ctx, r);
      taken.push(r);
    }
    for (i = 0; i < q.boxes.length; i++) {
      e = q.boxes[i];
      c = G.rectCorners(e);
      b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity, e: e };
      for (k = 0; k < c.length; k++) {
        s = worldToScreen(c[k]);
        if (s.x < b.x0) b.x0 = s.x; if (s.x > b.x1) b.x1 = s.x;
        if (s.y < b.y0) b.y0 = s.y; if (s.y > b.y1) b.y1 = s.y;
      }
      if (b.x1 < -60 || b.x0 > cssW + 60 || b.y1 < -20 || b.y0 > cssH + 20) continue;
      if (b.x1 - b.x0 < 3 && b.y1 - b.y0 < 3) continue;
      b.pri = (sel[e.id] ? 1e9 : 0) + (b.x1 - b.x0) * (b.y1 - b.y0);
      boxes.push(b);
    }
    boxes.sort(function (a, z) { return z.pri - a.pri; });
    /* the gear the names keep off: small boxes, not a lot drawn as a rectangle */
    var gear = boxes.filter(function (g) { return g.e.type === 'equip' && g.x1 - g.x0 < 240 && g.y1 - g.y0 < 240; });
    for (i = 0; i < boxes.length; i++) placeName(ctx, boxes[i], taken, gear);
    ctx.restore();
  }
  function placeName(ctx, b, taken, gear) {
    var full = String(b.e.label).trim(), short = shortName(full), tries = [], i, j, w, spots, r;
    var cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    tries.push([full, true]);
    if (short && short !== full) tries.push([short, true]);
    tries.push([full, false]);
    if (short && short !== full) tries.push([short, false]);
    for (i = 0; i < tries.length; i++) {
      w = ctx.measureText(tries[i][0]).width + 8;
      spots = [];
      if (b.x1 - b.x0 >= w && b.y1 - b.y0 >= 16) spots.push([cx, cy, true]);
      spots.push([cx, b.y0 - 11, false], [cx, b.y1 + 11, false], [b.x1 + 4 + w / 2, cy, false], [b.x0 - 4 - w / 2, cy, false]);
      for (j = 0; j < spots.length; j++) {
        r = tagAt(ctx, spots[j][0], spots[j][1], tries[i][0]);
        if (overlaps(r, taken)) continue;
        if (tries[i][1] && !spots[j][2] && overlaps(r, gear, b)) continue;
        paintTag(ctx, r);
        taken.push(r);
        return true;
      }
    }
    return false;
  }
  function label(ctx, p, text) {
    if (names) { if (text) names.fixed.push({ p: p, text: text }); return; }
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
    /* above Google's logo when its photo is under the drawing */
    var b = cssH - (mapAt && mapAt.source === 'google' ? 30 : 0);
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    ctx.fillRect(12, b - 36, w + 16, 24);
    ctx.strokeStyle = '#16202B';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(20, b - 22); ctx.lineTo(20 + w, b - 22);
    ctx.moveTo(20, b - 26); ctx.lineTo(20, b - 18);
    ctx.moveTo(20 + w, b - 26); ctx.lineTo(20 + w, b - 18);
    ctx.stroke();
    ctx.fillStyle = '#16202B';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(G.formatFeet(use), 20 + w / 2, b - 28);
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
  /* The tiles a view needs at zoom z, with a tile's margin all round. */
  function tilesFor(z) {
    var corners = [screenToWorld(0, 0), screenToWorld(cssW, 0), screenToWorld(0, cssH), screenToWorld(cssW, cssH)];
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, i, ll, t, x, y;
    for (i = 0; i < corners.length; i++) {
      ll = G.ftToLatLng(corners[i].x, corners[i].y, state.doc.anchor);
      t = latLngToTile(ll.lat, ll.lng, z);
      if (t.x < minX) minX = t.x;
      if (t.x > maxX) maxX = t.x;
      if (t.y < minY) minY = t.y;
      if (t.y > maxY) maxY = t.y;
    }
    var need = {}, count = 0;
    for (x = minX - 1; x <= maxX + 1; x++) {
      for (y = minY - 1; y <= maxY + 1; y++) {
        need[z + '/' + y + '/' + x] = { z: z, x: x, y: y };
        count++;
      }
    }
    return { need: need, count: count };
  }
  /* The photo at the scale drawn, at the screen's own pixels (a Retina
     screen gets the next zoom level, so the photo is sharp). Zoomed out past
     what the screen holds in tiles at their own size, it steps one level
     coarser at a time (each level halves the tiles across), down to county
     scale, so a whole lot keeps its photo: it used to go blank past 24
     tiles, and a 12-acre lot read "Zoom in to load aerial imagery" (Tommy,
     2026-10-20: "i cant see the map if im zoomed out"). */
  var PHOTO_MIN_Z = 12, PHOTO_MAX_Z = 19;
  function layoutMap() {
    var host = $('map'), Sat = root.OmegaEditorV2Satellite;
    if (!mapOn) { host.style.display = 'none'; if (Sat) Sat.hide(); mapNote = ''; mapAt = null; layoutParcels(null); return; }
    /* Google's satellite where it can (sharp to the deepest level it has),
       Esri's tiles under it for the PNG export and wherever Google cannot */
    var google = !!(Sat && Sat.frame(G.ftToLatLng(view.cx, view.cy, state.doc.anchor), view.pxPerFt, cssW, cssH, state.doc.anchor));
    host.style.display = 'block';
    host.style.visibility = google ? 'hidden' : 'visible';
    var z = Math.round(G.zoomForScale(state.doc.anchor.lat, view.pxPerFt * dpr));
    if (z < PHOTO_MIN_Z) z = PHOTO_MIN_Z;
    if (z > PHOTO_MAX_Z) z = PHOTO_MAX_Z;
    var most = (Math.ceil(cssW * dpr / 256) + 3) * (Math.ceil(cssH * dpr / 256) + 3), set = tilesFor(z);
    while (set.count > most && z > PHOTO_MIN_Z) { z--; set = tilesFor(z); }
    if (set.count > most) {
      mapNote = google ? '' : 'Zoom in to load aerial imagery.';
      mapAt = { z: z, tiles: 0, source: google ? 'google' : 'esri' };
      host.style.display = 'none';
      layoutParcels(null);
      return;
    }
    mapNote = '';
    mapAt = { z: z, tiles: set.count, source: google ? 'google' : 'esri' };
    var need = set.need, k;
    for (k in tiles) if (tiles.hasOwnProperty(k) && !need[k]) {
      if (tiles[k].img.parentNode) tiles[k].img.parentNode.removeChild(tiles[k].img);
      delete tiles[k];
    }
    for (k in need) if (need.hasOwnProperty(k)) {
      if (!tiles[k]) tiles[k] = loadTile(need[k], k);
      placeTile(tiles[k]);
    }
    layoutParcels(need);
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
    img.onerror = function () { node.failed = true; img.style.visibility = 'hidden'; mapNote = 'Aerial imagery did not load. The drawing is still to scale.'; };
    img.src = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/' + spec.z + '/' + spec.y + '/' + spec.x;
    $('map').appendChild(img);
    return node;
  }
  function placeTile(node) { placeBox(node.img, node.spec); }
  /* One web-mercator tile's box on the screen, for the photo and the
     parcel lines alike. */
  function placeBox(el, spec) {
    var nw = tileNW(spec.x, spec.y, spec.z);
    var se = tileNW(spec.x + 1, spec.y + 1, spec.z);
    var a = worldToScreen(G.latLngToFt(nw.lat, nw.lng, state.doc.anchor));
    var b = worldToScreen(G.latLngToFt(se.lat, se.lng, state.doc.anchor));
    el.style.left = Math.min(a.x, b.x) + 'px';
    el.style.top = Math.min(a.y, b.y) + 'px';
    el.style.width = Math.abs(b.x - a.x) + 'px';
    el.style.height = Math.abs(b.y - a.y) + 'px';
  }

  /* ── panels ────────────────────────────────────────────────────────── */
  function refresh() {
    followParcelAnchor();
    var siteAddr = $('site-address-go');
    if (siteAddr && document.activeElement !== siteAddr) siteAddr.value = /^sample parcel$/i.test(state.doc.address || '') ? '' : (state.doc.address || '');
    refreshTakeoff();
    refreshCustomer();
    refreshLayers();
    refreshProps(false);
    paintGridCard();
    paintParcelCard();
    paintSiteParcels();
    saveLabel();
    $('project-name').value = state.doc.name || '';
    paintNext();
    if (!cursor) {
      var scaled = view.pxPerFt > 0 && isFinite(view.pxPerFt);
      $('coords').textContent = 'E — ' + (scaled ? 'ft' : 'px') + '   N — ' + (scaled ? 'ft' : 'px');
    }
    requestDraw();
    layoutMap();
    paintBuildPrompt();
  }
  function afterChange() {
    editSeq++;
    dirty = true;
    refresh();
    scheduleRecovery();
    if (root.OmegaEditorV2Design) root.OmegaEditorV2Design.publish(root.OmegaEditorV2Design.fromDoc(state.doc));
    if (root.OmegaEditorV2Outputs) OmegaEditorV2Outputs.sync(state.doc);
    if (section === 'analyze' && root.OmegaEditorV2Analyze) root.OmegaEditorV2Analyze.show(state);
    if (section === 'funding' && root.OmegaEditorV2Analyze) root.OmegaEditorV2Analyze.showFunding(state);
    if (view3dOpen() && root.OmegaEditorV2View3D.sync) root.OmegaEditorV2View3D.sync(state.doc, D.summary(state.doc));
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
    row(kv, 'Chargers', s.chargerKw > 0 ? (s.chargerCount + ' · ' + s.chargerKw + ' kW') : String(s.chargerCount));
    if (s.derKw > 0) row(kv, 'Generation', Math.round(s.derKw) + ' kW');
    var built = $('takeoff-build');
    if (built) {
      var line = state.doc.build && state.doc.build.summary && state.doc.build.summary.line;
      built.hidden = !line;
      built.textContent = line || '';
    }
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
  /* Rebuilt only when something it shows changed: a rebuild between a
     button's press and its release drops the click (the blur of a field
     being saved refreshes the panels). */
  var layerSig = '';
  function refreshLayers() {
    var host = $('layers');
    var Grid = root.OmegaEditorV2Grid, Pc = root.OmegaEditorV2Parcels;
    var sig = JSON.stringify(state.doc.layers) + '|' + (Grid && Grid.enabled() ? 1 : 0) + '|' + (Pc && Pc.enabled() ? 1 : 0);
    if (sig === layerSig && host.firstChild) return;
    layerSig = sig;
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
    appendGridLayer(host);
    appendParcelLayer(host);
  }
  function appendParcelLayer(host) {
    var P = root.OmegaEditorV2Parcels;
    if (!P) return;
    var line = document.createElement('div');
    line.className = 'layer';
    line.id = 'layer-parcels';
    var mark = document.createElement('i');
    mark.className = 'swatch';
    mark.style.background = P.INK;
    var name = document.createElement('span');
    name.textContent = 'Parcel lines';
    var eye = document.createElement('button');
    eye.type = 'button';
    eye.className = 'btn quiet';
    eye.id = 'layer-parcels-toggle';
    eye.textContent = P.enabled() ? 'Hide' : 'Show';
    eye.setAttribute('aria-pressed', P.enabled() ? 'true' : 'false');
    eye.addEventListener('click', function () { setParcels(!P.enabled()); });
    line.appendChild(mark); line.appendChild(name); line.appendChild(eye);
    var grid = $('layer-grid-atlas');
    if (grid && grid.parentNode === host) host.insertBefore(line, grid.nextSibling);
    else if (host.firstChild) host.insertBefore(line, host.firstChild);
    else host.appendChild(line);
  }

  /* ── Omega Maximus is a module ─────────────────────────────────────────
     A signed-in workspace that has not bought it sees the price and Opt in
     instead of the editor. Every Maximus door on the server refuses it
     either way (package-access withModuleAnyPlan); this only says so up
     front. Signed out, nothing is asked: the server features ask for a
     sign-in themselves. */
  function checkAccess() {
    var Auth = root.OmegaEditorV2Auth;
    if (!Auth || typeof Auth.idToken !== 'function' || typeof root.fetch !== 'function') return;
    Auth.idToken().then(function (tok) {
      if (!tok) return null;
      return root.fetch('/api/maximus-access', { headers: { Authorization: 'Bearer ' + tok } }).then(function (r) {
        return r.ok ? r.json() : null;
      });
    }).then(function (a) {
      var el = $('maximus-lock');
      if (!el || !a) return;
      if (a.held !== false) { el.hidden = true; return; }
      $('maximus-lock-copy').textContent = a.reason || 'Omega Maximus is not on this workspace\'s plan.';
      $('maximus-lock-price').textContent = a.price ? 'Omega Maximus is ' + a.price + '.' : '';
      if (a.optIn && /^\/[A-Za-z0-9#/_-]*$/.test(a.optIn)) $('maximus-lock-optin').setAttribute('href', a.optIn);
      el.hidden = false;
    }, function () {});
  }

  /* ── parcel lines (omega-editor-v2-parcels.js) ─────────────────────── */
  function setParcels(on) {
    var P = root.OmegaEditorV2Parcels;
    if (!P) return;
    parcelCard = true;
    parcelAt = null;
    parcelKey = on ? anchorKey() : '';
    if (on && !mapOn) { mapOn = true; pressed('map', true); }
    P.setEnabled(on, state.doc.anchor);
    refreshLayers();
    layoutMap();
    paintParcelCard();
    paintSiteParcels();
    requestDraw();
  }
  /* The Site tab's own switch for the same layer, beside Find on the map. */
  function paintSiteParcels() {
    var b = $('site-parcels'), P = root.OmegaEditorV2Parcels;
    if (!b) return;
    b.hidden = !P;
    if (!P) return;
    var on = P.enabled();
    b.textContent = on ? 'Hide parcel lines' : 'Show parcel lines';
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
  function anchorKey() {
    var a = state.doc.anchor || {};
    return (+a.lat).toFixed(5) + ',' + (+a.lng).toFixed(5);
  }
  /* A new site point (an address found, a project opened) is looked up once. */
  function followParcelAnchor() {
    var P = root.OmegaEditorV2Parcels;
    if (!P || !P.enabled()) return;
    var k = anchorKey();
    if (k === parcelKey) return;
    parcelKey = k;
    parcelAt = null;
    parcelCard = true;
    P.lookup(state.doc.anchor.lat, state.doc.anchor.lng);
  }
  function parcelPoint() {
    return parcelAt || { lat: +state.doc.anchor.lat, lng: +state.doc.anchor.lng };
  }
  function paintParcelCard() {
    var el = $('parcel-detail'), P = root.OmegaEditorV2Parcels;
    if (!el || !P) return;
    var at = parcelPoint(), card = P.card(at.lat, at.lng);
    el.hidden = !(card.visible && parcelCard);
    if (el.hidden) return;
    $('parcel-detail-title').textContent = card.title;
    var body = $('parcel-detail-body'), i, p;
    body.innerHTML = '';
    if (parcelAt) { p = document.createElement('p'); p.className = 'src'; p.textContent = 'At the map centre.'; body.appendChild(p); }
    for (i = 0; i < card.lines.length; i++) {
      p = document.createElement('p');
      if (card.lines[i].source) p.className = 'src';
      p.textContent = card.lines[i].text;
      body.appendChild(p);
    }
    var use = $('parcel-use');
    use.hidden = !card.parcel || parcelUsed(card.parcel);
    $('parcel-here').disabled = !!card.busy;
  }
  function parcelUsed(rec) {
    var i, e;
    for (i = 0; i < state.doc.entities.length; i++) {
      e = state.doc.entities[i];
      if (e.parcel && rec && e.parcel.apn && e.parcel.apn === rec.apn && e.parcel.source === rec.source) return true;
    }
    return false;
  }
  function useParcel() {
    var P = root.OmegaEditorV2Parcels;
    if (!P) return;
    var at = parcelPoint(), rec = P.foundAt(at.lat, at.lng);
    var ent = rec ? P.toEntity(rec, state.doc.anchor) : null;
    if (!ent) { setStatus('Look up a parcel first.', true); return; }
    D.add(state, ent);
    afterChange();
    fitTo([ent.id], 0.08);
    paintParcelCard();
    setStatus('The parcel is the lot line now' + (rec.apn ? ' (APN ' + rec.apn + ')' : '') + '. It is a tax map, not a survey: confirm it before you design to it.');
  }
  function parcelHere() {
    var P = root.OmegaEditorV2Parcels;
    if (!P) return;
    var c = G.ftToLatLng(view.cx, view.cy, state.doc.anchor);
    parcelAt = { lat: c.lat, lng: c.lng };
    parcelCard = true;
    P.lookup(c.lat, c.lng);
    paintParcelCard();
  }
  function layoutParcels(need) {
    var host = $('map-parcels'), P = root.OmegaEditorV2Parcels, k, t;
    if (!host) return;
    if (!need || !P || !P.enabled()) { host.style.display = 'none'; return; }
    host.style.display = 'block';
    var src = P.source();
    if (src !== parcelSrc) {
      for (k in ptiles) if (ptiles.hasOwnProperty(k) && ptiles[k].el && ptiles[k].el.parentNode) ptiles[k].el.parentNode.removeChild(ptiles[k].el);
      ptiles = {};
      parcelSrc = src;
    }
    for (k in ptiles) if (ptiles.hasOwnProperty(k) && !need[k]) {
      if (ptiles[k].el && ptiles[k].el.parentNode) ptiles[k].el.parentNode.removeChild(ptiles[k].el);
      delete ptiles[k];
    }
    for (k in need) if (need.hasOwnProperty(k)) {
      if (!ptiles[k]) {
        t = P.tileNode(need[k]);
        ptiles[k] = { el: t, spec: need[k] };
        if (t) host.appendChild(t);
      }
      if (ptiles[k].el) placeBox(ptiles[k].el, need[k]);
    }
  }
  function appendGridLayer(host) {
    var Grid = root.OmegaEditorV2Grid;
    if (!Grid) return;
    var line = document.createElement('div');
    line.className = 'layer';
    line.id = 'layer-grid-atlas';
    var mark = document.createElement('i');
    mark.className = 'swatch';
    mark.style.background = Grid.COLORS.substation;
    var name = document.createElement('span');
    name.textContent = 'Grid Atlas';
    var eye = document.createElement('button');
    eye.type = 'button';
    eye.className = 'btn quiet';
    eye.id = 'layer-grid-atlas-toggle';
    eye.textContent = Grid.enabled() ? 'Hide' : 'Show';
    eye.setAttribute('aria-pressed', Grid.enabled() ? 'true' : 'false');
    eye.addEventListener('click', function () {
      Grid.setEnabled(!Grid.enabled(), state.doc, D.summary(state.doc));
    });
    line.appendChild(mark); line.appendChild(name); line.appendChild(eye);
    if (host.firstChild) host.insertBefore(line, host.firstChild);
    else host.appendChild(line);
  }
  function paintGridCard() {
    var el = $('grid-detail');
    var Grid = root.OmegaEditorV2Grid;
    if (!el || !Grid) return;
    var card = Grid.card();
    el.hidden = !card.visible;
    var back = $('grid-detail-back');
    if (back) back.hidden = !card.back;
    if (!card.visible) return;
    $('grid-detail-title').textContent = card.title || 'Grid Atlas';
    var body = $('grid-detail-body');
    body.innerHTML = '';
    var i, j, p, row, fold, sum;
    for (i = 0; i < card.lines.length; i++) {
      row = card.lines[i];
      /* the utilities the territory maps name that cannot be the point's:
         one fold, each with its reason (the grid layer's who-serves list) */
      if (row.fold) {
        fold = document.createElement('details');
        fold.className = 'who-fold';
        sum = document.createElement('summary');
        sum.textContent = row.text;
        fold.appendChild(sum);
        for (j = 0; j < row.fold.length; j++) {
          p = document.createElement('p');
          p.textContent = row.fold[j].text;
          fold.appendChild(p);
        }
        body.appendChild(fold);
        continue;
      }
      p = document.createElement('p');
      if (row.source) p.className = 'src';
      else if (row.who) p.className = 'who-' + row.who;
      /* the utility's own map, from the hosting answer: https only, new tab */
      if (row.href && /^https:\/\/[^\s"'<>]+$/i.test(String(row.href))) {
        var a = document.createElement('a'), words = String(row.text), cut = words.search(/\S+$/), tail = document.createElement('span');
        a.href = row.href;
        a.target = '_blank';
        a.rel = 'noopener';
        /* the last word stays beside the arrow, so a ↗ never starts a line */
        tail.style.whiteSpace = 'nowrap';
        tail.textContent = (cut < 0 ? '' : words.slice(cut)) + ' ↗';
        a.appendChild(document.createTextNode(cut < 0 ? words : words.slice(0, cut)));
        a.appendChild(tail);
        p.appendChild(a);
      } else if (row.bold && String(row.text).indexOf(row.bold) === 0) {
        var b = document.createElement('b');
        b.textContent = row.bold;
        p.appendChild(b);
        p.appendChild(document.createTextNode(String(row.text).slice(row.bold.length)));
      } else p.textContent = row.text;
      body.appendChild(p);
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
    var addr = field(host, 'Address', state.doc.address || '', function (v) {
      if (v === (state.doc.address || '')) return;
      D.setMeta(state, { address: v }); afterChange();
    });
    addr.id = 'site-address';
    addr.placeholder = 'Street, city, state ZIP — or latitude, longitude';
    /* Enter finds the site. Find address keeps the field focused on press:
       a blur saves the address, which rebuilt this panel and dropped the
       button before its click landed, so the first click found nothing. */
    addr.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); locate(addr.value); }
    });
    var find = document.createElement('button');
    find.type = 'button'; find.className = 'btn'; find.textContent = 'Find address';
    find.id = 'site-find';
    find.addEventListener('mousedown', function (ev) { ev.preventDefault(); });
    find.addEventListener('click', function () { locate(addr.value); });
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
    /* show where it landed: an empty drawing opens on the block around the
       point (it used to open on one roof, 280 ft across); a drawing that
       moved with it is shown whole over its new photo */
    if (!state.doc.entities.length) frameAround(0, 0, SITE_VIEW_FT);
    else fit(false);
    if (root.OmegaEditorV2Grid && root.OmegaEditorV2Grid.enabled()) {
      gridFit = false;
      root.OmegaEditorV2Grid.reload(state.doc, D.summary(state.doc));
    }
    setStatus('Anchor set. The aerial photo is scaled to this latitude.');
  }
  /* A view about `ft` feet across, centred on a point of the drawing. */
  var SITE_VIEW_FT = 700;
  function frameAround(x, y, ft) {
    view.cx = x;
    view.cy = y;
    view.pxPerFt = Math.max(0.02, Math.min(cssW / ft, cssH / (ft * 0.6)));
    layoutMap();
    requestDraw();
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
    el.textContent = dirty ? 'Unsaved' : (savedOnce ? (lastSaveLocation === 'workspace' ? 'Saved to workspace' : 'Saved here') : 'Not saved');
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
  function sendFeedback() {
    var message=window.prompt('What worked, or what should we improve in Omega Maximus?');
    if(!message || !message.trim()) return;
    saveWorkspace().then(function(ok){if(ok)return root.OmegaEditorV2Workspace.feedback(state.doc,message).then(function(){setStatus('Feedback saved with your project. Thank you.');});})
      .catch(function(e){setStatus(e.message,true);});
  }
  function quoteDialog() {
    var dlg=document.createElement('dialog'), form=document.createElement('form'), title=document.createElement('h2');
    title.textContent='Review the bill of materials';form.appendChild(title);
    var info=document.createElement('p');info.textContent='Enter the published SKU for each item you want quoted. Only checked lines are sent. Pricing and supplier routing happen in OMEGA.';form.appendChild(info);
    var rows=[];
    state.doc.entities.forEach(function(e){
      if(e.type!=='equip' && e.type!=='array')return;
      var row=document.createElement('p'), use=document.createElement('input'), sku=document.createElement('input'), qty=document.createElement('input');
      use.type='checkbox';use.checked=!!e.sku;sku.placeholder='Published SKU';sku.value=e.sku||'';sku.maxLength=120;
      qty.type='number';qty.min='1';qty.step='1';qty.value=e.type==='array'?D.arrayLayout(state.doc,e).moduleCount||1:1;qty.style.width='75px';
      row.appendChild(use);row.appendChild(document.createTextNode(' '+(e.label||e.key||'Solar modules')+' '));row.appendChild(sku);row.appendChild(qty);form.appendChild(row);
      rows.push({e:e,use:use,sku:sku,qty:qty});
    });
    var status=document.createElement('p'), send=document.createElement('button'), cancel=document.createElement('button');
    send.type='submit';send.textContent='Send quote request';cancel.type='button';cancel.textContent='Close';cancel.onclick=function(){dlg.close();};
    form.appendChild(status);form.appendChild(send);form.appendChild(cancel);dlg.appendChild(form);document.body.appendChild(dlg);
    dlg.addEventListener('close',function(){dlg.remove();});
    form.onsubmit=function(ev){ev.preventDefault();var bom=[];
      rows.forEach(function(r){if(r.use.checked)bom.push({sku:r.sku.value.trim(),description:r.e.label||r.e.key||'Solar modules',qty:+r.qty.value,unit:'ea',manufacturer:r.e.mfr||'',category:r.e.key||'solar'});});
      if(!bom.length || bom.some(function(r){return !r.sku || !(r.qty>0) || r.qty%1;})){status.textContent='Select at least one item with a SKU and whole quantity.';return;}
      send.disabled=true;
      saveWorkspace().then(function(ok){if(!ok)throw new Error('Save the project before sending the quote request.');return root.OmegaEditorV2Workspace.quote(state.doc,bom);})
        .then(function(j){
          status.textContent=(j.rfqId?'Quote request '+j.rfqId+' sent. ':'')+(j.orders&&j.orders.length?j.orders.length+' linked Logic order(s). ':'')+(j.unmatched&&j.unmatched.length?j.unmatched.length+' line(s) need catalog matching.':'');
          if(!j.rfqId && !(j.orders&&j.orders.length))status.textContent='No supplier or published catalog product matched. Check the SKUs before retrying.';
          (j.orders||[]).forEach(function(o){if(o.href){var a=document.createElement('a');a.href=o.href;a.textContent='Open order in Logic';form.appendChild(a);}});
        }).catch(function(e){status.textContent=e.message;send.disabled=false;});
    };dlg.showModal();
  }
  function saveWorkspace() {
    if (saving) return Promise.resolve(false);
    var doc = state.doc, seq = editSeq;
    saving = true; setStatus('Saving to your workspace…');
    return root.OmegaEditorV2Workspace.save(doc).then(function (result) {
      if (state.doc !== doc) return false;
      doc.remoteProjectId = result.id; doc.orgId = result.orgId; doc.workspaceRevision = result.revision;
      dirty = editSeq !== seq; savedOnce = true; lastSaveLocation = 'workspace';
      if (!dirty) R.drop(localStorage);
      saveLabel();
      history.replaceState(null, '', '/editor-v2?id=' + encodeURIComponent(result.id));
      setStatus(dirty ? 'Saved. Your newer edits still need saving.' : 'Saved to your workspace.');
      return !dirty;
    }).catch(function (e) { setStatus(e.message || 'Save failed. Your drawing is still here.', true); return false; })
      .then(function (ok) { saving = false; return ok; });
  }
  function loadWorkspace(id) {
    var seq = editSeq;
    setStatus('Opening workspace project…');
    return root.OmegaEditorV2Workspace.open(id).then(function (record) {
      if (seq !== editSeq) { setStatus('The project arrived after you edited. Save your draft, then open it again.', true); return; }
      openRecord(record, record.updatedAt);
    }).catch(function (e) { setStatus(e.message || 'Project could not be opened.', true); });
  }
  function handoff(target) {
    saveWorkspace().then(function (ok) { if (ok) location.href = root.OmegaEditorV2Workspace.href(state.doc, target); });
  }
  /* Asked on the page, never in a browser popup: an embedded browser (the
     Claude app's pane, a kiosk) answers window.confirm "no" without showing
     it, and the button did nothing. */
  function pushMarketplace() {
    var dlg = $('dlg-market');
    dlg.returnValue = '';
    dlg.showModal();
  }
  function onMarketClose() {
    if ($('dlg-market').returnValue === 'submit') submitMarketplace();
  }
  function submitMarketplace() {
    saveWorkspace().then(function (ok) {
      if (!ok) return;
      setStatus('Submitting to marketplace…');
      return root.OmegaEditorV2Workspace.marketplace(state.doc).then(function (id) {
        setStatus('Submitted to marketplace: ' + id + '.');
      });
    }).catch(function (e) { setStatus(e.message || 'Marketplace submission failed.', true); });
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
      savedOnce = true; lastSaveLocation = 'local';
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
    var cloud = document.createElement('button'); cloud.type='button'; cloud.textContent='Open from workspace';
    cloud.addEventListener('click', function () {
      cloud.disabled=true; cloud.textContent='Loading workspace…';
      root.OmegaEditorV2Workspace.list().then(function (items) {
        cloud.textContent=items.length ? 'Workspace projects' : 'No Omega Maximus projects in this workspace yet.';
        items.forEach(function (item) {
          var li=document.createElement('li'), b=document.createElement('button'); b.type='button'; b.textContent=item.name||item.id;
          b.onclick=function(){ $('dlg-open').close(); confirmDirty(function(){loadWorkspace(item.id);}); }; li.appendChild(b); list.prepend(li);
        });
      }).catch(function(e){cloud.disabled=false;cloud.textContent=e.message;});
    });
    list.prepend(cloud);
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
      savedOnce = !dirty; lastSaveLocation = doc.remoteProjectId ? 'workspace' : 'local';
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
    var blob, bytes, i;
    if (data instanceof Blob) blob = data;
    else if (typeof data === 'string' && /[\u0080-\u00ff]/.test(data)) {
      bytes = new Uint8Array(data.length);
      for (i = 0; i < data.length; i++) bytes[i] = data.charCodeAt(i) & 255;
      blob = new Blob([bytes], { type: mime });
    } else blob = new Blob([data], { type: mime });
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
        } else setStatus('That JSON is not an Omega Maximus drawing or a project record.', true);
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

  function setSection(name) {
    var allowed = { site: 1, design: 1, analyze: 1, outputs: 1, funding: 1 };
    if (!allowed[name]) return;
    section = name;
    $('app').setAttribute('data-section', name);
    var buttons = document.querySelectorAll('#stages button'), i;
    for (i = 0; i < buttons.length; i++) {
      buttons[i].setAttribute('aria-pressed', buttons[i].getAttribute('data-stage') === name ? 'true' : 'false');
    }
    $('side-draw').hidden = name !== 'design';
    $('side-site').hidden = name !== 'site';
    $('side-analyze').hidden = name !== 'analyze';
    $('side-outputs').hidden = name !== 'outputs';
    $('side-funding').hidden = name !== 'funding';
    if (name !== 'design') {
      var narrow = window.matchMedia && window.matchMedia('(max-width: 900px)').matches;
      if (narrow) {
        $('side').classList.add('open');
        $('btn-side').setAttribute('aria-expanded', 'true');
      }
    }
    if (name === 'analyze' && root.OmegaEditorV2Analyze) root.OmegaEditorV2Analyze.show(state);
    pressed('outputs', name === 'outputs');
    if (root.OmegaEditorV2Outputs) {
      if (name === 'outputs') root.OmegaEditorV2Outputs.panel(outputsApi());
      else root.OmegaEditorV2Outputs.hidePanel();
    }
    if (name === 'funding' && root.OmegaEditorV2Analyze) root.OmegaEditorV2Analyze.showFunding(state);
    paintNext();
    resize();
  }
  function drawnCount() {
    var s = D.summary(state.doc);
    return (s.bessCount || 0) + (s.arrayCount || 0) + (s.chargerCount || 0);
  }
  function nextStep() {
    var doc = state.doc;
    if (!doc.screen) return { id: 'site', label: 'Does this site work?', run: function () { setSection('site'); } };
    if (doc.screen.go === false) return { id: 'revise', label: 'Revise the site', run: function () { setSection('site'); } };
    if (!drawnCount()) return { id: 'build', label: 'Place a build', run: function () { openBuild(); } };
    if (runEdit !== editSeq) return { id: 'run', label: 'Run', run: runNumbers };
    return { id: 'quote', label: 'Quote', run: function () { setSection('funding'); } };
  }
  function paintNext() {
    var step = nextStep();
    var btn = $('next-action');
    if (!btn) return;
    btn.textContent = step.label;
    btn.setAttribute('data-next', step.id);
  }
  function siteYes() {
    D.setMeta(state, { screen: { go: true, at: new Date().toISOString() } });
    afterChange();
    openBuild();
  }
  function siteNoSave() {
    var reason = $('site-reason').value.trim();
    if (reason.length < 3) { setStatus('Say what is in the way, in a few words.', true); return; }
    D.setMeta(state, { screen: { go: false, reason: reason, at: new Date().toISOString() } });
    afterChange();
    setStatus('Recorded. The site stays as it is.');
  }
  function canvasBlank() {
    var list = state.doc.entities || [], i, e;
    for (i = 0; i < list.length; i++) {
      e = list[i];
      if (e.type === 'equip' || e.type === 'array' || e.type === 'conduit' || (e.type === 'rect' && e.key)) return false;
    }
    return true;
  }
  function paintBuildPrompt() {
    var el = $('build-prompt');
    if (el) el.hidden = !canvasBlank();
  }
  function placedCtx() {
    return {
      pxPerFt: view.pxPerFt,
      /* a build lands on the clear ground nearest the middle of the view */
      prefer: function () { return { x: view.cx, y: view.cy }; },
      onPlaced: function (res) {
        afterChange();
        /* the view goes to the build, which is selected, and says where it is */
        fitTo(res.ids);
        setStatus(((res.summary && res.summary.line) || 'Build placed.') +
          (res.onLot === false ? ' The lot had no clear ground for it, so it is just beside the lot: drag it into place.' : '') +
          ' It is selected: drag to move it.');
        notifyDrawn();
      }
    };
  }
  function openBuild(preferred) {
    var Bld = root.OmegaEditorV2Build;
    if (!Bld) { setStatus('Guided build is not loaded.', true); return; }
    setSection('design');
    var ctx = placedCtx();
    if (typeof preferred === 'string' && preferred) ctx.preferred = preferred;
    Bld.open(state, ctx);
  }
  function notifyDrawn() {
    var H = root.OmegaEditorV2Hooks;
    if (!H || !H.listeners) return;
    var names = ['view3d', 'permit', 'sld'], i;
    for (i = 0; i < names.length; i++) {
      if (H.listeners(names[i])) invokeHook(names[i], { reason: 'build' });
    }
  }
  function previewOutput(kind) {
    var An = root.OmegaEditorV2Analyze;
    var R = root.OmegaEditorV2Reports;
    var Design = root.OmegaEditorV2Design;
    var dlg = $('dlg-preview');
    var title = $('preview-title');
    var body = $('preview-body');
    var actions = $('preview-actions');
    if (!dlg || !An || !R) { setStatus('Outputs are not loaded.', true); return; }
    var facts = An.factsFrom(state.doc, D.summary(state.doc));
    var model = Design ? Design.fromDoc(state.doc) : null;
    actions.innerHTML = '';
    function addBtn(label, primary, fn) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = primary ? 'btn primary' : 'btn';
      b.textContent = label;
      b.addEventListener('click', fn);
      actions.appendChild(b);
    }
    function linesOf(built) {
      if (!built) return '';
      return built.lines.map(function (l) { return l.text || ''; }).join('\n');
    }
    function saveReport(id) {
      return function () { An.download(state, id); };
    }
    addBtn('Close', false, function () { dlg.close(); });
    if (kind === 'permit' || kind === 'sld') {
      if (dlg.open) dlg.close();
      openOutputs(kind);
      return;
    } else if (kind === 'drawing') {
      title.textContent = 'PNG / PDF / DXF';
      body.textContent = 'The drawing as it is now, in feet.\n\nPNG is the canvas. PDF and DXF are the same entities.';
      addBtn('Download PNG', true, function () { exportPng(); });
      addBtn('Download PDF', false, function () { exportPdf(); });
      addBtn('Download DXF', false, function () { exportDxf(); });
    } else if (kind === 'funding') {
      var gate = root.OmegaProjectIntelligence.fundingReadiness(facts);
      title.textContent = 'Push to Funding Marketplace';
      body.textContent = gate.decision + '\n' + gate.score + ' / 100 from the drawing.\n\n' + (gate.ready ? 'The score clears the pursue line.' : 'The score is not at the pursue line yet.') + '\n\nPush hands this drawing to the marketplace submission. Nothing is priced here.';
      addBtn('Push to Funding Marketplace', true, function () {
        dlg.close();
        invokeHook('funding');
        setSection('funding');
      });
    } else if (kind === 'bom') {
      title.textContent = 'BOM & cost estimate';
      body.textContent = linesOf(R.build('bom', facts, state.doc)) + '\n\n' + linesOf(R.build('cost', facts, state.doc));
      addBtn('Download bill of materials', true, saveReport('bom'));
      addBtn('Download cost estimate', false, saveReport('cost'));
    } else {
      var built = R.build(kind, facts, state.doc);
      title.textContent = built ? built.title : 'Report';
      body.textContent = linesOf(built) || 'Nothing on the drawing fills this report.';
      if (built) addBtn('Download PDF', true, saveReport(kind));
    }
    if (typeof dlg.showModal === 'function') dlg.showModal();
  }
  function designPreview(model, kind) {
    if (!model) return 'The drawing is the source. The design model is not loaded.';
    var gear = model.equipment.length, wires = model.conduits.length;
    var gaps = (model.gaps || []).join(', ');
    var head = kind === 'permit'
      ? 'Permit set and plot plan, from the drawing.'
      : 'One-line, from the placed chain.';
    return head + '\n\n' + gear + ' pieces of equipment. ' + wires + ' conduits.\n' +
      (model.build && model.build.summary && model.build.summary.line ? (model.build.summary.line + '\n') : '') +
      '\nOn the drawing: footprints, the chain, and the raceway family.\n' +
      'Not on the drawing: ' + (gaps || 'nothing listed') + '.\n\n' +
      'Open builds the sheet from this reading. A missing detail stays blank.';
  }
  /* Run asks the server for the cost, the value stack and the solar year
     (omega-editor-v2-run.js) and keeps the answers on the drawing. */
  var running = false;
  function runNumbers() {
    var An = root.OmegaEditorV2Analyze, Run = root.OmegaEditorV2Run;
    if (!An) { setStatus('Analyze is not loaded.', true); return; }
    setSection('analyze');
    if (!Run) { setStatus('Run did not load. Refresh the page.', true); return; }
    if (running) return;
    running = true;
    var btn = $('btn-run');
    if (btn) { btn.disabled = true; btn.textContent = 'Running…'; }
    if (An.running) An.running(true);
    setStatus('Running the cost, the value stack and the solar year on the server…');
    function finish() {
      running = false;
      if (btn) { btn.disabled = false; btn.textContent = 'Run'; }
      if (An.running) An.running(false);
    }
    Run.run(state.doc).then(function (out) {
      finish();
      var keys = Object.keys(out.fields || {}), k;
      /* The answers belong to this drawing: kept on it and saved with it
         (unsaved until then), never an undo step of their own. An edit
         after the run carries them in its snapshot; Analyze says when the
         drawing has moved on (OmegaEditorV2Run.isStale). */
      if (keys.length) {
        for (k = 0; k < keys.length; k++) state.doc[keys[k]] = out.fields[keys[k]];
        dirty = true;
        refresh();
        scheduleRecovery();
      }
      runEdit = editSeq;
      An.show(state);
      if (out.notes && out.notes.all) { setStatus(out.notes.all, !out.signedOut); return; }
      var pi = An.assess(state), vs = state.doc.valueStack, bits = [pi.decision + ' · ' + pi.score + ' / 100'];
      if (state.doc.costTotal > 0) bits.push('installed $' + Math.round(state.doc.costTotal).toLocaleString());
      if (vs && vs.irr != null) bits.push('IRR ' + (vs.irr * 100).toFixed(1) + '%');
      setStatus(bits.join(' · ') + '. Screening, not a quote.');
    }, function (err) {
      finish();
      setStatus((err && err.message) || 'Run did not finish. Try again.', true);
    });
  }
  function invokeHook(name, extra) {
    var H = root.OmegaEditorV2Hooks;
    var ctx = { doc: state.doc, summary: D.summary(state.doc), model: null };
    if (root.OmegaEditorV2Design) ctx.model = root.OmegaEditorV2Design.fromDoc(state.doc);
    if (extra && extra.reason) ctx.reason = extra.reason;
    if (H && H.invoke(name, ctx)) return;
    var note = {
      view3d: '3D site view is the next view of this drawing. Nothing is attached to this button yet.',
      permit: 'The permit plan set is built from this drawing. Nothing is attached to this button yet.',
      sld: 'The single-line is built from this drawing. Nothing is attached to this button yet.',
      funding: 'Funding uses the marketplace submission. Nothing is attached to this button yet.'
    };
    setStatus(note[name] || 'Nothing is attached to this yet.');
  }
  function onSideChange(ev) {
    var t = ev.target;
    if (!t || !t.id) return;
    if (t.id === 'bill-kwh') {
      D.setMeta(state, { billKwh: t.value === '' ? null : +t.value });
      afterChange();
    } else if (t.id === 'bill-file' && t.files && t.files[0]) {
      D.setMeta(state, { billName: t.files[0].name });
      afterChange();
    }
  }

  /* A guided build writes the design model. The permit set and the
     single-line are rebuilt from that document. */
  function applyGuidedBuild(build) {
    if (!root.OmegaEditorV2Guided) { setStatus('Guided build did not load.', true); return null; }
    var next = root.OmegaEditorV2Guided.apply(state.doc, build);
    D.commit(state, next, []);
    afterChange();
    setStatus('Drawings follow the guided build.');
    return next;
  }
  /* Outputs is the right-hand panel. Preview opens the sheet dialog. */
  function outputsApi() {
    return {
      doc: state.doc,
      download: download,
      updateMeta: function (patch) { D.setMeta(state, patch); afterChange(); },
      fileBase: fileBase,
      bom: function () { previewOutput('bom'); },
      quote: quoteDialog,
      handoff: handoff,
      funding: function () { setSection('funding'); },
      drawing: {
        png: exportPng,
        pdf: exportPdf,
        dxf: exportDxf,
        json: exportJson,
        importFile: function () { $('file-import').click(); }
      }
    };
  }
  /* openOutputs() is the panel; 'permit' or 'sld' also opens that preview. */
  function openOutputs(which) {
    if (!root.OmegaEditorV2Outputs) { setStatus('Outputs did not load.', true); return; }
    if (section !== 'outputs') setSection('outputs');
    if (which !== 'permit' && which !== 'sld') return;
    var api = outputsApi();
    api.which = which === 'sld' ? 'sld' : 'set';
    api.fromPanel = true;
    OmegaEditorV2Outputs.open(api);
  }

  /* What the checks read: the view and the photo's tiles. Read-only. */
  function debug() {
    var a = state.doc.anchor || {}, sel = [], i, e;
    for (i = 0; i < state.selection.length; i++) { e = D.find(state.doc, state.selection[i]); if (e && e.label) sel.push(String(e.label).trim()); }
    return { view: { cx: view.cx, cy: view.cy, pxPerFt: view.pxPerFt, w: cssW, h: cssH }, anchor: { lat: +a.lat, lng: +a.lng }, selected: sel, icons: iconsOn,
      map: mapAt ? { z: mapAt.z, tiles: mapAt.tiles, note: mapNote, source: mapAt.source || 'esri' } : null };
  }

  root.OmegaEditorV2App = { boot: boot, applyGuidedBuild: applyGuidedBuild, openOutputs: openOutputs, debug: debug, VERSION: 'editor-v2-app/5' };
})(typeof window !== 'undefined' ? window : global);
