/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
/* ==========================================================================
   omega-prime-handoff.js  ·  Omega Prime → Site Map, EXACTLY as drawn
   --------------------------------------------------------------------------
   Omega Prime (omega-prime.html) screens a site and sets it up as a real
   project (omega-prime-project.js): the unit, the BESS area, the unit's
   transformer and disconnect in a row east of it, the service point and the
   L-shaped service run, all as lat/lng in `prime.layout` (contract C2).
   Tommy, 2026-10-17: "Open in Site Map" must carry over EXACTLY what was
   drawn in Prime, and match.

   So when editor.html has finished drawing a loaded project (doRender
   dispatches `omega:project-rendered`, after saves are safe — anything
   built earlier would be cleared by doRender's own reset), this file
   builds that layout into the editor's real drawing with the editor's OWN
   functions (contract C4):

     the BESS area        a `zonebox` shape on Prime's corners
     the unit             evgear 'bess' at Prime's centre, its true footprint
     transformer, disco   evgear 'xfmr' / 'disco' (omitted where the unit
                          integrates them: the R60 draws no transformer)
     the service point    evgear 'service' (the one the BOM and one-line read)
     the conduit          autoWireConduit legs unit → transformer → disco,
                          and the service run PVC-UG, trench in ground,
                          on Prime's own L-shaped vertices

   all in ONE undo step (omegaHistBatch), every object marked
   `fromPrime: true` with its `primeRole`, anchored on Prime's coordinates
   (the editor's _geoLat/_geoLng and _geoPts), then reprojected, then saved
   by saveProject() — so the write carries savedBy (firestore.rules
   drawingWriteAllowed) and, through S.primeBuild, `prime.builtAt` /
   `prime.builtHash` on the same write. Gear is drawn at TRUE scale
   (minW/minH 4 px): the symbol floor would draw an 8 ft transformer two to
   three times its size at zoom 19–20.

   THE UNIT is OmegaPrimeProject.unitFor's (through restore(), as Prime's
   page and the quote server run it), asked with the list this workspace is
   offered, made by PP.units() from this page's catalog: so a v1 sketch (a
   unit point only, replayed through arrange()) draws the same here as in
   Prime and in the proposal's Run (review, 2026-10-17: a v1 FENECON XXL
   record was a 20 ft container here and a point in Prime). A unit whose
   maker released no footprint (the LG JP-2, the Smart Module) is a small
   MARKER, MARK_FT across (never over 3 ft where it is built), inside the
   5 ft clear gap Prime left — never the editor's 10 x 5 ft symbol on its
   28 x 20 px floor.

   Never twice (prime.builtAt, or a build already on this canvas), never
   over a drawing (elements, shapes, conduits, trench runs, a second
   document tab), never without a live map (retried briefly, then a
   console note), never on a read-only plan (it could not be saved; a plan
   still loading is waited for, as omegaRunSave waits). A v1 layout (unit point only) is upgraded with
   OmegaPrimeProject.upgrade, replaying Prime's own arrangement. Where Prime
   placed no unit, `?from=prime` falls back to what this file did before:
   the battery entry filled from the editor's catalog and the BESS Guided
   Build opened, once. `from=prime` is dropped from the address either way.

   THE OMEGA PRIME LINK (Tommy, 2026-10-17: "when I open a project and it
   was made in Prime, I should be able to access what I had made in
   Prime"). A project made in Prime (S.prime) carries a small, persistent
   link in Site Map's title bar — #omega-prime-nav, the mount editor.html
   gives it beside the plan chip — to /omega-prime?id=, the proposal's
   status when there is one (to its Track step), and, only when it can do
   something, "Rebuild from Omega Prime", which calls rebuild(): the
   drawing is empty, or holds nothing but Prime's own build and part of it
   is gone or Prime's layout changed since it was drawn. rebuild() takes
   Prime's own earlier build away and draws it again in ONE undo step; it
   never touches a drawing the rep made. Never painted for a project not
   made in Prime. Every editor function and value is read through ONE
   env object (configure({ env })), so scripts/tests/tprimetransfer.js
   asserts the exact objects built.

   ES5. Needs omega-prime-project.js loaded first.
   ========================================================================== */
(function (root) {
  'use strict';

  var TAG = '[Omega Prime]';
  var HAS = Object.prototype.hasOwnProperty;
  var FIELDS = ['mfr', 'model', 'chem', 'kwh', 'usable', 'kw', 'dur', 'dcv', 'inv', 'ikva', 'xfmr', 'disco'];
  var MIN_PX = 4;                               /* true scale: never the 28 x 20 symbol floor */
  var MARK_FT = 2, MARK_MAX_FT = 3;             /* a unit with no released footprint: a 2 ft marker, 3 ft at most */
  var POI_FT = { lFt: 3, wFt: 2.5 };            /* EV_FOOTPRINT.service, the editor's service pedestal */
  var NAME = { bess: 'BESS', xfmr: 'XFMR', disco: 'Disco' };
  var AREA_INK = '#ffd23f';
  var NAV_ID = 'omega-prime-nav';
  /* the states "Rebuild from Omega Prime" is offered in (rebuildWhy) */
  var OFFER = { empty: true, partial: true, changed: true };
  var REBUILD_TIP = {
    empty: 'Draw Omega Prime’s layout into this empty Site Map (one undo step).',
    partial: 'Part of Omega Prime’s layout was removed here: draw it again as Prime has it (one undo step).',
    changed: 'Changed in Omega Prime since it was drawn here: draw it again to match (one undo step).'
  };
  var QUOTE_WORDS = { draft: 'Proposal draft', sent: 'Proposal sent', viewed: 'Proposal viewed', approved: 'Proposal approved',
    declined: 'Proposal declined', expired: 'Proposal expired', withdrawn: 'Proposal withdrawn' };
  var T = { settle: 600, wait: 250, tries: 24, catalogTries: 16, repaint: 120 };
  var mem = { built: {}, busy: {}, hash: {}, fallback: false, last: null, painted: null, mount: null, soon: false };
  var override = null;

  /* ── small helpers ────────────────────────────────────────────────── */
  function num(v) { var n = Number(v); return v !== null && v !== '' && isFinite(n) && n > 0 ? n : null; }
  function fin(v) { var n = Number(v); return v !== null && v !== '' && v !== undefined && isFinite(n) ? n : null; }
  function ll(p) { return p && fin(p.lat) != null && fin(p.lng) != null ? { lat: +p.lat, lng: +p.lng } : null; }
  function len(a) { return Array.isArray(a) ? a.length : 0; }
  function fromPrime(search) { return /[?&]from=prime(?:&|$)/.test(search || ''); }
  function note(E, level, msg) { try { if (E.console && E.console[level]) E.console[level](TAG + ' ' + msg); } catch (e) {} }
  function call(f) { if (typeof f !== 'function') return undefined; try { return f.apply(null, Array.prototype.slice.call(arguments, 1)); } catch (e) { return undefined; } }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  /* ── the editor, through one object ──────────────────────────────────
     Every name below is a top-level function or binding of editor.html (or
     one its EV block puts on window). configure({ env }) replaces it. */
  function glob(name) { return typeof root[name] === 'function' ? root[name] : null; }
  function defaultEnv() {
    var st = null, cat = null, dims = null, mode = 'BTM';
    try { st = (typeof S !== 'undefined' && S) ? S : (root.S || null); } catch (e) { st = root.S || null; }
    try { cat = (typeof BESS_CATALOG !== 'undefined' && BESS_CATALOG) ? BESS_CATALOG : (root.BESS_CATALOG || null); } catch (e) { cat = root.BESS_CATALOG || null; }
    try { dims = (typeof GOTION_CATALOG_DIMS !== 'undefined' && GOTION_CATALOG_DIMS) ? GOTION_CATALOG_DIMS : null; } catch (e) { dims = null; }
    try { if (typeof _wizMode !== 'undefined' && _wizMode) mode = String(_wizMode); } catch (e) {}
    var doc = root.document || null;
    return {
      S: st, catalog: cat, dims: dims, mode: mode, PP: root.OmegaPrimeProject || null,
      doc: doc, console: root.console || null,
      search: function () { return root.location ? root.location.search : ''; },
      later: function (f, ms) { return root.setTimeout(f, ms); },
      now: function () { return Date.now(); },
      evAdd: glob('_evAdd'), reRenderEl: glob('_reRenderEl'),
      autoWire: glob('autoWireConduit'), applyRoute: glob('_applyRouteToConduit'),
      renderShape: glob('renderShape'), renderConduit: glob('renderConduit'),
      histBatch: glob('omegaHistBatch'), reproject: glob('_geoReprojectAll'),
      liveMapState: glob('_liveMapState'), canvasSize: glob('_getCanvasSize'), latLngToPx: glob('_latLngToPx'),
      groundFt: glob('_groundPolyFt'), uid: glob('uid'), integrates: glob('_bessIntegrates'),
      save: glob('saveProject'), setSaved: glob('_setSaved'), banner: glob('showBanner'),
      openGuidedBuild: glob('openBessGuidedBuild'), renderBessList: glob('renderBessList'),
      updCount: glob('updCount'), updShapeCount: glob('updShapeCount'), updCondStat: glob('updCondStat'),
      renderLegend: glob('renderLegend'), updateRightPanel: glob('updateRightPanel'),
      /* the editor's own removers, for a rebuild over Prime's own build */
      removeEl: glob('removeEl'), removeConduit: glob('removeConduit'), clearShapeSel: glob('_clearShapeSel'),
      markDirty: function () { try { root._workDirty = true; } catch (e) {} },
      replaceUrl: function (u) { try { root.history.replaceState(root.history.state, '', u); } catch (e) {} },
      href: function () { return root.location ? root.location.href : ''; },
      projectId: function () { try { return (typeof _projectId !== 'undefined' && _projectId) ? _projectId : null; } catch (e) { return null; } },
      /* how many document tabs the project has (a second one is a drawing) */
      tabs: function () { try { return (typeof _docTabs !== 'undefined' && _docTabs) ? _docTabs.length : 0; } catch (e) { return 0; } },
      /* the title-bar mount editor.html gives the Omega Prime link */
      navMount: function () { try { return doc && doc.getElementById ? doc.getElementById(NAV_ID) : null; } catch (e) { return null; } },
      /* the plan, as omegaRunSave reads it: null on a legacy plan */
      planAccess: function () { try { return root.OmegaCaps && typeof root.OmegaCaps.packageAccess === 'function' ? root.OmegaCaps.packageAccess() : null; } catch (e) { return null; } }
    };
  }
  function env() {
    var E = typeof override === 'function' ? override() : (override || defaultEnv());
    return E || defaultEnv();
  }

  /* ── the battery entry, filled from the editor's own catalog ─────────
     The same way saveBess() fills one from the BESS Config form. */
  function fill(b, cat) {
    if (!b || !cat) return b;
    FIELDS.forEach(function (k) { if (cat[k] != null && cat[k] !== '') b[k] = typeof cat[k] === 'number' ? String(cat[k]) : cat[k]; });
    b._greenfield = !!cat.greenfield;
    b._gridForming = !!cat.gridForming;
    b._gridConnectV = cat.gridConnectV || '';
    b._controller = cat.controller || '';
    ['_incPCS', '_incXfmr', '_incDisco'].forEach(function (k) { if (typeof cat[k] === 'boolean') b[k] = cat[k]; });
    return b;
  }
  function selectCatalog(E, key) {
    try { var sel = E.doc && E.doc.getElementById && E.doc.getElementById('bm-catalog'); if (sel && key) sel.value = key; } catch (e) {}
  }

  function dropParam(E) {
    try {
      if (!fromPrime(E.search())) return;
      var u = new URL(E.href());
      u.searchParams['delete']('from');
      E.replaceUrl(u.pathname + (u.search || '') + u.hash);
    } catch (e) {}
  }

  /* ── what is already here ─────────────────────────────────────────── */
  function trenchOn(st) { return len(st._trenches) > 0 || !!(st._trench && (st._trench.pts ? st._trench.pts.length : true)); }
  function drawingOn(st) {
    st = st || {};
    return len(st.elements) > 0 || len(st.shapes) > 0 || len(st.conduits) > 0 || trenchOn(st);
  }
  function drawingIn(d) {
    d = d || {};
    return len(d.elements) > 0 || len(d.shapes) > 0 || len(d.conduits) > 0 || len(d.annotations) > 0 ||
      !!d.trench || len(d.docTabs) > 1;
  }
  function builtHere(st) {
    function any(a) { for (var i = 0; i < len(a); i++) if (a[i] && a[i].fromPrime === true) return true; return false; }
    return !!st && (any(st.elements) || any(st.shapes) || any(st.conduits));
  }
  /* nothing on the canvas the rep drew: every object is Prime's own build
     (fromPrime), or there is nothing at all */
  function primeOnly(st) {
    function all(a) { for (var i = 0; i < len(a); i++) if (!a[i] || a[i].fromPrime !== true) return false; return true; }
    return !!st && all(st.elements) && all(st.shapes) && all(st.conduits) && !trenchOn(st);
  }
  function primeOf(d, st) {
    var p = d && d.prime && typeof d.prime === 'object' ? d.prime : null;
    if (!p && st && st.prime && typeof st.prime === 'object') p = st.prime;
    return p;
  }

  /* ── the unit: OmegaPrimeProject.unitFor, the ONE rule ───────────────
     Asked with the list this workspace is offered, made by PP.units() the
     way Prime's page and the quote server make theirs, from what this page
     holds: the workspace's own products as omega-bess-products.js merged
     them into the catalog (`_tenant`), and Clean Cell's reference units once
     their script has merged them (`_cleanCellRevH`). The R60 and the XXL
     need no entry: unitFor knows them by key. No footprint is added here
     that Prime's list does not carry. */
  function unitsHere(E) {
    var PP = E.PP, cat = E.catalog || {}, t = { keys: [], entries: {} }, refs = {}, k, e;
    if (!PP || typeof PP.units !== 'function') return [];
    for (k in cat) {
      if (!HAS.call(cat, k)) continue;
      e = cat[k];
      if (e && e._tenant === true) { t.keys.push(k); t.entries[k] = e; }
      else if (e && e._cleanCellRevH === true) refs[k] = e;
    }
    return PP.units(t, refs);
  }
  /* Prime's record → { unit, layout } with the layout at v2: PP.restore(),
     whose unit is PP.unitFor()'s — what Prime's page and the server run. */
  function resolve(E, d) {
    var PP = E.PP, p = primeOf(d, E.S);
    if (!PP || !p) return { unit: null, layout: null };
    var doc = d && d.prime ? d : { prime: p, bessList: E.S && E.S.bessList };
    var R = PP.restore(doc, unitsHere(E));
    return { unit: R.unit, layout: R.layout };
  }
  function placed(L) { return !!(L && L.unit && ll(L.unit.c)); }
  /* a charger, an array, a compute unit or a generator (main #348) is not a
     battery: Prime's layout here is a battery's, so none of it is drawn and
     the unit is sized in Site Map with its own tools */
  function battery(u) { return !u || !u.kind || u.kind === 'bess'; }
  var NOT_BATTERY = 'Omega Prime set this site up for a unit that is not a battery, so it is sized here in Site Map (quote required): place it with Site Map’s own tools.';

  /* ── the decision ─────────────────────────────────────────────────── */
  function maybeBuild(id, d, opts) {
    opts = opts || {};
    var E = env(), st = E.S, from = fromPrime(E.search());
    if (!st) return 'no-editor';
    var p = primeOf(d, st), b = st.bessList && st.bessList[0];
    if (!p && !(from && b && b._fromPrime)) return 'not-prime';
    if (id) mem.last = { id: id, doc: d };
    if (p && p.builtAt && !opts.rebuild) { dropParam(E); return 'built'; }
    /* a rebuild may draw over Prime's OWN earlier build (it is taken away
       first, in the same undo step); nothing else is ever drawn over */
    var over = !!opts.rebuild && primeOnly(st);
    if ((drawingOn(st) && !over) || (!opts.rebuild && drawingIn(d))) {
      if (id && mem.built[id] && builtHere(st)) { dropParam(E); return 'built-here'; }
      if (from) {
        note(E, 'info', 'this project already has a drawing in Site Map; Prime’s layout was not drawn over it.');
        call(E.banner, 'wiz', 'This project already has a drawing in Site Map, so Omega Prime’s layout was not drawn over it.');
      }
      dropParam(E);
      return 'drawing';
    }
    var R = resolve(E, d);
    if (!battery(R.unit)) {
      if (from) call(E.banner, 'wiz', NOT_BATTERY);
      dropParam(E);
      return 'not-battery';
    }
    if (!placed(R.layout)) {
      if (from && !mem.fallback && b) { mem.fallback = true; guided(E, b); return 'guided'; }
      dropParam(E);
      return 'no-unit';
    }
    if (id && mem.busy[id]) return 'busy';
    if (id) mem.busy[id] = true;
    E.later(function () { attempt(id, d, R, opts, 0, 0); }, T.settle);
    return 'scheduled';
  }

  /* The live map and the catalog entry, retried briefly. */
  function attempt(id, d, R, opts, n, c) {
    var E = env(), st = E.S, p = primeOf(d, st);
    /* finished, either way: the link says what it can do now (a build that
       gave up leaves an empty drawing that Rebuild can draw into) */
    function done(r) { if (id) mem.busy[id] = false; try { paintNav(); } catch (e) {} return r; }
    if (!st) return done('no-editor');
    var cur = call(E.projectId);
    if (id && cur && cur !== id) return done('moved');          /* another project is open now */
    if (p && p.builtAt && !opts.rebuild) { dropParam(E); return done('built'); }
    if (drawingOn(st) && !(opts.rebuild && primeOnly(st))) { dropParam(E); return done('drawing'); }
    var clear = !!opts.rebuild && drawingOn(st);                /* Prime's own earlier build goes first */
    var need = ['evAdd', 'autoWire', 'histBatch', 'latLngToPx', 'canvasSize', 'uid'].concat(clear ? ['removeEl', 'removeConduit'] : [])
      .filter(function (k) { return typeof E[k] !== 'function'; });
    if (need.length) { note(E, 'warn', 'Site Map is missing ' + need.join(', ') + '; Prime’s layout was not drawn.'); dropParam(E); return done('no-editor'); }
    /* a packaged plan still loading or unchecked waits, a read-only one is
       left alone: the drawing could not be saved (omegaRunSave's rule) */
    var pk = call(E.planAccess);
    if (pk && (pk.pending || pk.unverified)) {
      if (n < T.tries) { E.later(function () { attempt(id, d, R, opts, n + 1, c); }, T.wait); return 'waiting'; }
      note(E, 'warn', 'the plan could not be read, so Prime’s layout was not drawn. Reload the project to try again.');
      dropParam(E);
      return done('plan-unchecked');
    }
    if (pk && pk.readOnly) {
      note(E, 'info', 'this workspace is read-only; Prime’s layout was not drawn.');
      call(E.banner, 'wiz', 'This workspace is read-only, so Omega Prime’s layout was not drawn into Site Map.');
      dropParam(E);
      return done('read-only');
    }
    var ms = call(E.liveMapState);
    if (!ms || !(+st.pxPerFt > 0)) {
      if (n < T.tries) { E.later(function () { attempt(id, d, R, opts, n + 1, c); }, T.wait); return 'waiting'; }
      note(E, 'warn', 'the satellite map is not live, so Prime’s layout was not drawn. Reload the project to try again.');
      if (fromPrime(E.search())) call(E.banner, 'wiz', 'Omega Prime’s layout was not drawn: the satellite map did not load. Reload the project to try again.');
      dropParam(E);
      return done('no-map');
    }
    var b = st.bessList && st.bessList[0], key = b && b.catalogKey, entry = key && E.catalog ? E.catalog[key] : null;
    if (key && !entry && c < T.catalogTries) { E.later(function () { attempt(id, d, R, opts, n, c + 1); }, T.wait); return 'waiting'; }
    if (b && entry) { fill(b, entry); selectCatalog(E, key); call(E.renderBessList); }
    /* the unit again, now that this page's catalog has merged: a v1 sketch
       is replayed with exactly the unit Prime's list gives it */
    R = resolve(E, d);
    if (!battery(R.unit)) { dropParam(E); return done('not-battery'); }
    if (!placed(R.layout)) { dropParam(E); return done('no-unit'); }
    var M = build(E, R, id, clear);
    if (!M) { dropParam(E); return done('no-projection'); }
    if (id) mem.built[id] = true;
    done('built');
    return M;
  }

  /* Prime's own earlier build off the canvas, inside the rebuild's one undo
     step, with the editor's own removers (removeEl takes an element's runs
     with it). Only objects marked fromPrime: a rebuild is never offered,
     and never runs, over anything the rep drew (primeOnly). */
  function clearPrime(E, st) {
    function ids(a) { var o = [], i; for (i = 0; i < len(a); i++) if (a[i] && a[i].fromPrime === true) o.push(a[i].id); return o; }
    ids(st.conduits).forEach(function (cid) { E.removeConduit(cid); });
    ids(st.elements).forEach(function (eid) { E.removeEl(eid); });
    var gone = ids(st.shapes);
    if (!gone.length) return;
    call(E.clearShapeSel);
    st.shapes = (st.shapes || []).filter(function (s) { return !(s && s.fromPrime === true); });
    gone.forEach(function (sid) {
      try { var g = E.doc && E.doc.querySelector && E.doc.querySelector('[data-shid="' + sid + '"]'); if (g && g.parentNode) g.parentNode.removeChild(g); } catch (e) {}
    });
  }

  /* ── the build ────────────────────────────────────────────────────── */
  function build(E, R, id, clear) {
    var st = E.S, G = R.layout, u = R.unit || {};
    var b = (st.bessList && st.bessList[0]) || {};
    var ms = E.liveMapState(), sz = E.canvasSize(), ppf = +st.pxPerFt;
    function px(p) { return E.latLngToPx(+p.lat, +p.lng, ms, sz.w, sz.h); }
    var q = num(b.qty) || 1;
    var kw = (num(b.kw) || num(u.kw) || 0) * q, kwh = (num(b.kwh) || num(u.kwh) || 0) * q;
    var incX = E.integrates ? !!E.integrates('xfmr') : b._incXfmr === true;
    var incD = E.integrates ? !!E.integrates('disco') : b._incDisco === true;
    var incP = E.integrates ? !!E.integrates('pcs') : b._incPCS !== false;
    var kva = Math.round(kw / 0.95 / 50) * 50;
    var svcA = Math.round(kw * 1000 / (480 * 1.732) / 0.95 * 1.25);
    var model = ((b.mfr || u.mfr || '') + ' ' + (b.model || u.model || '')).replace(/^\s+|\s+$/g, '');
    var M = { area: null, bess: null, xfmr: null, disco: null, service: null, conduits: [], unknownFootprint: false };
    /* every point must land on the canvas before anything is drawn */
    var pts = [G.unit.c, G.xfmr && G.xfmr.c, G.disco && G.disco.c, G.poi].concat(G.area ? [{ lat: G.area.n, lng: G.area.w }, { lat: G.area.s, lng: G.area.e }] : [],
      G.conduit && G.conduit.pts ? G.conduit.pts : []).filter(Boolean);
    for (var pi = 0; pi < pts.length; pi++) {
      var pp = ll(pts[pi]) ? px(pts[pi]) : null;
      if (!pp || !isFinite(pp.x) || !isFinite(pp.y)) { note(E, 'warn', 'a point of Prime’s layout could not be placed on this map; nothing was drawn.'); return null; }
    }

    function gear(kind, g, label, spec, role) {
      var c = px(g.c);
      var known = !!(num(g.lFt) && num(g.wFt));
      var el = E.evAdd(kind, c.x, c.y, label, spec, null, known ? { lf: +g.lFt, wf: +g.wFt } : null);
      if (known) {
        var w = Math.max(MIN_PX, Math.round(g.lFt * ppf)), h = Math.max(MIN_PX, Math.round(g.wFt * ppf));
        el.w = w; el.h = h; el.aspect = h / w; el.x = c.x - w / 2; el.y = c.y - h / 2;
        el.lf = +g.lFt; el.wf = +g.wFt; el.minW = MIN_PX; el.minH = MIN_PX;
      } else {
        /* the maker released no footprint: a small MARKER, never a container.
           MARK_FT across at true scale, its floor the gear's 4 px or less (never
           over MARK_MAX_FT at this zoom), so it sits inside the 5 ft clear gap
           Prime left (arrange() gives it 0 ft of extent). No lf/wf for a reader
           to take as a footprint (_evAdd put the editor's 10 x 5 ft symbol
           there); editor.html _elFootprintFt sizes it from primeMarkFt when the
           zoom rescale runs. primeFootprint 'none' is the flag readers use. */
        var floor = Math.max(2, Math.min(MIN_PX, Math.floor(MARK_MAX_FT * ppf)));   /* never over 3 ft here, never under 2 px */
        var m = Math.max(floor, Math.round(MARK_FT * ppf));
        try { delete el.lf; delete el.wf; } catch (e) { el.lf = null; el.wf = null; }
        el.w = m; el.h = m; el.aspect = 1; el.x = c.x - m / 2; el.y = c.y - m / 2;
        el.minW = floor; el.minH = floor;
        el.primeFootprint = 'none'; el.primeMarkFt = MARK_FT;
      }
      el.rot = +g.rotDeg || 0;
      el._geoLat = +g.c.lat; el._geoLng = +g.c.lng;   /* Prime's coordinate exactly */
      el.bgbRole = role; el.evRole = role; el.primeRole = role; el.fromPrime = true;
      call(E.reRenderEl, el.id);
      return el;
    }
    function rerender(c) {
      try { var g = E.doc && E.doc.querySelector && E.doc.querySelector('[data-cid="' + c.id + '"]'); if (g && g.parentNode) g.parentNode.removeChild(g); } catch (e) {}
      call(E.renderConduit, c);
    }
    function wire(a, z, pts, type, label, role) {
      var c = E.autoWire(pts.map(px), type, label, a.id, z.id);
      if (!c) return null;
      if (role === 'poi-run') call(E.applyRoute, c, 'trench-ground');
      c._geoPts = pts.map(function (t) { return { lat: +t.lat, lng: +t.lng }; });
      var ft = E.groundFt ? E.groundFt(c._geoPts, c.pts.length) : null;
      if (ft != null && isFinite(ft)) {
        c.ftLen = +ft.toFixed(1);
        if (c._autoLabel) c.label = c._baseLabel + ' (' + c._condSize + (ft > 0 ? ' — ' + Math.round(ft) + ' LF' : '') + ')';
      }
      c.primeRole = role; c.fromPrime = true;
      rerender(c);
      M.conduits.push(c);
      return c;
    }
    function at(el) { return { lat: el._geoLat, lng: el._geoLng }; }

    E.histBatch(function () {
      if (clear) clearPrime(E, st);
      if (G.area) {
        var a = G.area, nw = px({ lat: a.n, lng: a.w }), se = px({ lat: a.s, lng: a.e });
        var z = { id: E.uid(), kind: 'zonebox', pts: [{ x: nw.x, y: nw.y }, { x: se.x, y: se.y }],
          style: 'dashed', color: AREA_INK, fill: AREA_INK, fillOpacity: 0.12, border: 'dashed',
          label: 'BESS area · ' + a.wFt + ' × ' + a.hFt + ' ft',
          primeRole: 'area', fromPrime: true,
          _geoPts: [{ lat: +a.n, lng: +a.w }, { lat: +a.s, lng: +a.e }] };
        if (!st.shapes) st.shapes = [];
        st.shapes.push(z);
        call(E.renderShape, z);
        M.area = z;
      }
      var incl = ['PCS/inverter'].concat(incX ? ['step-up XFMR'] : [], incD ? ['AC disconnect'] : []);
      var spec = (kwh / 1000).toFixed(2) + ' MWh / ' + (kw / 1000).toFixed(2) + ' MW · ' + (E.mode || 'BTM') + ' · incl. ' + incl.join(' + ');
      var e = gear('bess', G.unit, 'BESS Assembly', spec, 'bess');
      e.bgbKw = kw; e.bgbKwh = kwh; e.bessKw = kw; e.bessKwh = kwh;
      e.bessUnits = 1; e.bessUnitCount = q; e.bessUnitKw = kw / q; e.bessUnitKwh = kwh / q;
      e.bgbIncXfmr = incX; e.bgbIncDisco = incD; e.bgbIncPcs = incP;
      e.bessCfgId = b.id || null; e.bessId = b.id || null;
      e.bessModel = model; e.bessUnitModel = model; e.bessPlaceholder = false;
      e.catalogKey = b.catalogKey || u.key || null; e.bessMfr = b.mfr || u.mfr || '';
      if (e.primeFootprint === 'none') M.unknownFootprint = true;
      M.bess = e;
      if (G.xfmr) M.xfmr = gear('xfmr', G.xfmr, 'Step-Up Transformer', kva + ' kVA pad-mount · 480V→MV step-up', 'xfmr');
      if (G.disco) M.disco = gear('disco', G.disco, 'AC Disconnect', 'Service-rated AC disconnect · ' + svcA + 'A / 480V · NEMA 3R', 'disco');
      if (G.poi) M.service = gear('service', { c: G.poi, lFt: POI_FT.lFt, wFt: POI_FT.wFt, rotDeg: 0 }, 'Utility POI', 'Utility POI · ' + (E.mode || 'BTM') + ' interconnection', 'service');
      var chain = [M.bess, M.xfmr, M.disco].filter(Boolean), i;
      for (i = 1; i < chain.length; i++) {
        wire(chain[i - 1], chain[i], [at(chain[i - 1]), at(chain[i])], 'RMC-AC',
          NAME[chain[i - 1].primeRole] + '→' + NAME[chain[i].primeRole] + ' (AC)', 'pad-leg');
      }
      var feed = chain[chain.length - 1];
      if (M.service && G.conduit && len(G.conduit.pts) >= 2) {
        wire(feed, M.service, G.conduit.pts, 'PVC-UG', NAME[feed.primeRole] + '→POI (service)', 'poi-run');
      }
    });
    call(E.reproject);
    ['updCount', 'updShapeCount', 'updCondStat', 'renderLegend', 'updateRightPanel'].forEach(function (k) { call(E[k]); });

    st.primeBuild = { at: E.now(), hash: String(G.hash || '') };
    if (id) mem.hash[id] = String(G.hash || '');                /* what is on this canvas now, for the link */
    call(E.setSaved, 'unsaved');
    call(E.markDirty);
    try { var pr = E.save && E.save(); if (pr && typeof pr.then === 'function') pr.then(null, function () {}); } catch (e) {}

    var parts = [G.area ? 'BESS area' : '', M.xfmr ? 'transformer' : '', M.disco ? 'disconnect' : '', M.service ? 'service point' : ''].filter(Boolean);
    var name = (u.name || model || 'the unit');
    call(E.banner, 'wiz', 'Built from Omega Prime: ' + name + (parts.length ? ', ' + parts.join(', ') : '') +
      (M.conduits.length ? ' and ' + M.conduits.length + ' conduit run' + (M.conduits.length === 1 ? '' : 's') : '') + ', as drawn.' +
      (M.unknownFootprint ? ' The maker has not released this unit’s footprint, so it is a marked symbol; enter the submittal’s size.' : ''));
    note(E, 'info', 'built ' + name + ' from Prime’s layout ' + (G.hash || '') + '.');
    dropParam(E);
    return M;
  }

  /* Prime placed no unit: the battery entry filled from the catalog and
     the BESS Guided Build opened (what this file always did), once. */
  function guided(E, b) {
    var n = 0;
    (function tick() {
      var key = b.catalogKey, entry = key && E.catalog ? E.catalog[key] : null;
      if (key && !entry && n++ < T.catalogTries) { E.later(tick, T.wait); return; }
      if (entry) { fill(b, entry); selectCatalog(E, key); }
      call(E.setSaved, 'unsaved');
      dropParam(E);
      call(E.openGuidedBuild);
      note(E, 'info', (b.mfr || '') + ' ' + (b.model || b.catalogKey || '') + ' configured; BESS Guided Build open');
    })();
  }

  /* ── "Rebuild from Omega Prime" ──────────────────────────────────────
     Whether it can do something here, and why. Offered (OFFER) only when the
     canvas holds nothing the rep drew: it is empty ('empty': one undo after
     a transfer, a delete, Clear all, or a build that never happened), or it
     holds only Prime's own build and part of it is gone ('partial') or
     Prime's layout changed since it was drawn here ('changed', against
     builtHash). Never with a second document tab, while a build is on its
     way, on a read-only plan (it could not be saved) or where Prime placed
     no unit. */
  function pieces(G) {
    var gear = 1 + (G.xfmr ? 1 : 0) + (G.disco ? 1 : 0), svc = G.poi ? 1 : 0;
    return { elements: gear + svc, shapes: G.area ? 1 : 0,
      conduits: (gear - 1) + (svc && G.conduit && len(G.conduit.pts) >= 2 ? 1 : 0) };
  }
  function primeCount(a) { var n = 0; for (var i = 0; i < len(a); i++) if (a[i] && a[i].fromPrime === true) n++; return n; }
  function rebuildWhy(E, p, id) {
    var st = E.S;
    if (!st || !p) return 'not-prime';
    if (!primeOnly(st) || (+call(E.tabs) || 0) > 1) return 'drawing';
    if (id && mem.busy[id]) return 'busy';
    var pk = call(E.planAccess);
    if (pk && pk.readOnly) return 'read-only';
    var R = resolve(E, { prime: p, bessList: st.bessList });
    if (!battery(R.unit)) return 'not-battery';
    if (!placed(R.layout)) return 'no-unit';
    if (!drawingOn(st)) return 'empty';
    var want = pieces(R.layout);
    if (primeCount(st.elements) < want.elements || primeCount(st.shapes) < want.shapes || primeCount(st.conduits) < want.conduits) return 'partial';
    var bh = (id && mem.hash[id]) || String(p.builtHash || '');
    if (bh && R.layout.hash && bh !== R.layout.hash) return 'changed';
    return 'current';
  }

  /* Draw Prime's layout again: into an emptied drawing, or over Prime's own
     earlier build (taken away first, in the same undo step). The record's
     builtAt / builtHash are set again by the save. */
  function rebuild() {
    var E = env(), st = E.S, last = mem.last;
    var id = call(E.projectId) || (last && last.id) || null;
    var d = last && last.doc && (!id || !last.id || last.id === id) ? last.doc : null;
    if (!st) return 'no-editor';
    var p = primeOf(d, st);
    if (!p) return 'not-prime';
    var why = rebuildWhy(E, p, id);
    if (!OFFER[why]) {
      if (why === 'drawing') call(E.banner, 'wiz', 'Clear the drawing first: Omega Prime’s layout is only drawn into an empty Site Map, or over its own earlier build.');
      else if (why === 'current') call(E.banner, 'wiz', 'Omega Prime’s layout is already drawn here, as Prime has it.');
      else if (why === 'read-only') call(E.banner, 'wiz', 'This workspace is read-only, so Omega Prime’s layout was not drawn into Site Map.');
      else if (why === 'no-unit') call(E.banner, 'wiz', 'Omega Prime placed no unit on this site, so there is nothing to draw; place it in Prime first.');
      else if (why === 'not-battery') call(E.banner, 'wiz', NOT_BATTERY);
      return why;
    }
    if (st.prime && typeof st.prime === 'object') st.prime.builtAt = null;
    var copy = {}, k;
    for (k in (d || {})) if (HAS.call(d, k)) copy[k] = d[k];
    var pc = {};
    for (k in p) if (HAS.call(p, k)) pc[k] = p[k];
    pc.builtAt = null;
    copy.prime = pc;
    if (!copy.bessList && st.bessList) copy.bessList = st.bessList;
    if (id) { mem.built[id] = false; mem.busy[id] = false; }
    var r = maybeBuild(id, copy, { rebuild: true });
    try { paintNav(); } catch (e) {}
    return r;
  }

  /* ── the Omega Prime link in Site Map's title bar ────────────────────
     What to show for the project on the canvas: nothing unless it was made
     in Prime (S.prime, which _loadProject resets on every load); then the
     way back to Prime, the proposal's status when the server has mirrored
     one (prime.quote), and Rebuild where rebuildWhy offers it. */
  function navState(E) {
    var st = E.S, p = st && st.prime && typeof st.prime === 'object' ? st.prime : null;
    var id = call(E.projectId) || null;
    if (!p || !id || (mem.last && mem.last.id && mem.last.id !== id)) return { prime: false };
    var href = '/omega-prime?id=' + encodeURIComponent(id);
    /* the proposal: Prime's Track step on that quote (&step=track&quote=,
       the link projects.html and workspace.html give it too) */
    var q = p.quote && typeof p.quote === 'object' && (p.quote.id || p.quote.status) ? p.quote : null;
    var qid = q && /^[A-Za-z0-9_-]{4,64}$/.test(String(q.id || '')) ? String(q.id) : '';
    var why = rebuildWhy(E, p, id);
    return { prime: true, id: id, href: href,
      quote: q ? { status: String(q.status || ''), label: QUOTE_WORDS[q.status] || 'Proposal', quoteNo: String(q.quoteNo || ''),
        href: href + '&step=track' + (qid ? '&quote=' + encodeURIComponent(qid) : '') } : null,
      rebuild: OFFER[why] ? why : null, why: why };
  }
  function paintNav() {
    var E = env(), m = call(E.navMount);
    if (!m) return null;
    var n = navState(E), html = '';
    if (n.prime) {
      html = '<a class="pn-back" data-prime="open" href="' + esc(n.href) + '" target="_blank" rel="noopener" title="Open what was set up for this site in Omega Prime">Omega Prime</a>';
      if (n.quote) html += ' <a class="pn-back" data-prime="proposal" href="' + esc(n.quote.href) + '" target="_blank" rel="noopener" title="' +
        esc((n.quote.quoteNo ? 'Proposal ' + n.quote.quoteNo + ': where it' : 'Where the proposal') + ' and its order are, in Omega Prime') + '">' + esc(n.quote.label) + '</a>';
      if (n.rebuild) html += ' <button type="button" class="pn-back" data-prime="rebuild" title="' + esc(REBUILD_TIP[n.rebuild]) + '">Rebuild from Omega Prime</button>';
    }
    if (mem.painted !== html || mem.mount !== m) {
      mem.painted = html; mem.mount = m;
      try { m.innerHTML = html; m.hidden = !html; } catch (e) {}
      var btn = null;
      try { btn = m.querySelector ? m.querySelector('[data-prime="rebuild"]') : null; } catch (e) { btn = null; }
      if (btn) btn.onclick = function (ev) { try { if (ev && ev.preventDefault) ev.preventDefault(); } catch (e) {} rebuild(); };
    }
    return n;
  }
  /* The drawing changes under the rep's hand (an undo, a delete, Clear all):
     the link is painted again a beat after the key or the pointer is let
     go, so Rebuild shows exactly while it can do something. */
  function paintSoon() {
    if (mem.soon) return;
    var E = env();
    if (!(E.S && E.S.prime) && !mem.painted) return;           /* not a Prime project: nothing to paint */
    mem.soon = true;
    E.later(function () { mem.soon = false; try { paintNav(); } catch (e) {} }, T.repaint);
  }

  function onRendered(ev) {
    var dt = (ev && ev.detail) || {}, r;
    try { r = maybeBuild(dt.id || null, dt.doc || null); } catch (e) { note(env(), 'warn', 'hand-off failed: ' + (e && e.message)); r = 'error'; }
    try { paintNav(); } catch (e) {}
    return r;
  }

  function configure(o) {
    o = o || {};
    if ('env' in o) override = o.env || null;
    ['settle', 'wait', 'tries', 'catalogTries', 'repaint'].forEach(function (k) { if (o[k] != null && isFinite(+o[k])) T[k] = +o[k]; });
    return T;
  }
  function reset() { mem.built = {}; mem.busy = {}; mem.hash = {}; mem.fallback = false; mem.last = null; mem.painted = null; mem.mount = null; mem.soon = false; }

  root.OmegaPrimeHandoff = { onRendered: onRendered, maybeBuild: maybeBuild, rebuild: rebuild, fill: fill,
    fromPrime: fromPrime, resolve: function (d) { return resolve(env(), d); }, units: function () { return unitsHere(env()); },
    nav: function () { return navState(env()); }, paintNav: paintNav, configure: configure, _reset: reset,
    MIN_PX: MIN_PX, MARK_FT: MARK_FT, NAV_ID: NAV_ID, EVENT: 'omega:project-rendered' };
  if (root.document && root.document.addEventListener && !root.__omegaPrimeHandoffNoAuto) {
    root.document.addEventListener('omega:project-rendered', onRendered);
    root.document.addEventListener('keyup', paintSoon, true);
    root.document.addEventListener('pointerup', paintSoon, true);
  }
})(typeof window !== 'undefined' ? window : this);
