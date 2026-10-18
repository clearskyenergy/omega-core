#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   tprimetransfer.js — "Open in Site Map" carries over EXACTLY what was drawn
   in Omega Prime (Tommy, 2026-10-17; DESIGN contract C4).

   omega-prime-handoff.js builds prime.layout (C2, omega-prime-project.js)
   into the editor's real drawing when editor.html's doRender says the
   project is on the canvas. This test runs it in a VM against the EDITOR'S
   OWN functions, cut out of editor.html (autoWireConduit, _evAdd/_evPx,
   _applyRouteToConduit, _groundPolyFt, _latLngToPx, addEl, pushHist,
   omegaHistBatch, _bessIntegrates, _ppCollectFleet, omegaCostQuantities,
   BESS_CATALOG, GOTION_CATALOG_DIMS, EV_FOOTPRINT, CTYPES) with only the DOM
   painters and the map stubbed, and holds:
     1  a v2 layout builds the area, the unit, the transformer, the
        disconnect, the service point and three conduits, at Prime's
        centres and true footprints, with their roles, in ONE undo step,
        then saves through saveProject with S.primeBuild set; a unit
        with no released footprint is a marked symbol, never a container;
     2  the R60 (it integrates its transformer) builds no transformer, and
        the Run prices it by its catalog key ($24,000), not $85/kWh;
     3  a v1 layout (unit point only) is upgraded with Prime's own rule;
     4  never twice, never over a drawing, never when builtAt is set, never
        without a live map, never on a read-only plan (a loading one waits);
     5  the Guided Build opens only as the fallback, once, with from=prime;
     6  rebuild() draws into an emptied drawing only;
     7  every editor dependency can be injected through one env object;
     8  editor.html carries the hooks (and the save hook adds ONLY
        prime.builtAt / prime.builtHash) and loads the scripts in order. */
'use strict';
var assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm');
var ROOT = path.join(__dirname, '..', '..'), count = 0;
function read(f) { return fs.readFileSync(path.join(ROOT, f), 'utf8'); }
var ED = read('editor.html');
var HANDOFF = read('omega-prime-handoff.js');
var PROJECT = read('omega-prime-project.js');
var PP = require(path.join(ROOT, 'omega-prime-project.js'));
var CC = require(path.join(ROOT, 'omega-cleancell-catalog.js'));
var EC = require(path.join(ROOT, 'api/_lib/editor-cost.js'));

function eq(a, b, m) { assert.equal(a, b, m); count++; }
/* through JSON: objects made in the VM have another realm's prototypes */
function plain(v) { return v === undefined ? v : JSON.parse(JSON.stringify(v)); }
function deq(a, b, m) { assert.deepEqual(plain(a), plain(b), m); count++; }
function ok(c, m) { assert.ok(c, m); count++; }
function near(a, b, tol, m) { assert.ok(Math.abs(a - b) <= tol, m + ' (' + a + ' vs ' + b + ')'); count++; }

/* One balanced block of editor.html from a needle that occurs exactly once,
   skipping strings and comments. */
function block(needle, open, close) {
  var at = ED.indexOf(needle);
  if (at < 0) throw new Error('not in editor.html: ' + needle);
  if (ED.indexOf(needle, at + 1) >= 0) throw new Error('more than one in editor.html: ' + needle);
  var i = ED.indexOf(open || '{', at), d = 0, q = null;
  for (; i < ED.length; i++) {
    var ch = ED[i];
    if (q) { if (ch === '\\') { i++; continue; } if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { q = ch; continue; }
    if (ch === '/' && ED[i + 1] === '*') { i = ED.indexOf('*/', i + 2) + 1; continue; }
    if (ch === '/' && ED[i + 1] === '/') { i = ED.indexOf('\n', i); continue; }
    if (ch === (open || '{')) d++;
    else if (ch === (close || '}')) { d--; if (!d) return ED.slice(at, i + 1); }
  }
  throw new Error('unbalanced: ' + needle);
}
var EDITOR_CODE = [
  block('const CTYPES=[', '[', ']') + ';',
  block('var EV_FOOTPRINT = {') + ';',
  block('const BESS_CATALOG = {') + ';',
  block('const GOTION_CATALOG_DIMS = {') + ';',
  'var _omHistHold=0;',
  ['function pushHist(', 'function omegaHistBatch(', 'function addEl(', 'function autoWireConduit(', 'function _applyRouteToConduit(',
    'function _groundPolyFt(', 'function _mapMetersPerPx(', 'function _latLngToPx(', 'function _evPx(', 'function _evAdd(',
    'function _bessIntegrates(', 'function _ppCollectFleet(', 'function omegaCostQuantities(',
    /* the zoom rescale the editor runs after every reprojection, and the
       removers a rebuild over Prime's own build uses */
    'function _elRenderSize(', 'function _elRenderCenter(', 'function _elFootprintFt(', 'function omegaRescaleElements(',
    'function removeEl(id){', 'function removeConduit(id){'].map(function (n) { return block(n); }).join('\n')
].join('\n');

/* the painters, the map and the save: stubs that count */
var STUBS = [
  "var __n = 0, __map = null, __calls = { renderEl: 0, renderConduit: 0, renderShape: 0, reRenderEl: 0, reproject: 0, save: 0, guided: 0, renderBessList: 0, setSaved: [], banner: [] };",
  "var _wizMode = 'BTM', _projectId = 'p1', _workDirty = false;",
  "function uid(){ return 'u' + (++__n); }",
  "function renderEl(el){ __calls.renderEl++; } function renderConduit(c){ __calls.renderConduit++; } function renderShape(sh){ __calls.renderShape++; }",
  "function _reRenderEl(id){ __calls.reRenderEl++; } function renderBessList(){ __calls.renderBessList++; }",
  "function updCount(){} function updShapeCount(){} function updCondStat(){} function renderLegend(){} function updateRightPanel(){}",
  "function _updateConduitSchedule(){} function _warnIfMapUnlocked(){} function _costSheetValues(){ return {}; } function _evQuantities(){ return { items: [] }; }",
  "function _liveMapState(){ return __map ? { lat: __map.lat, lng: __map.lng, zoom: __map.zoom } : null; }",
  "function _getCanvasSize(){ return { w: 1200, h: 800 }; }",
  /* the reprojection's element pass, as editor.html _geoReprojectAll does it */
  "function _geoReprojectAll(){ __calls.reproject++; var ms=_liveMapState(), sz=_getCanvasSize(); if(!ms) return;" +
  "  S.elements.forEach(function(el){ if(el._geoLat==null) return; var p=_latLngToPx(el._geoLat, el._geoLng, ms, sz.w, sz.h); el.x=p.x-el.w/2; el.y=p.y-el.h/2; }); }",
  "function saveProject(){ __calls.save++; __calls.saved = JSON.parse(JSON.stringify({ primeBuild: S.primeBuild })); return Promise.resolve(); }",
  "function _setSaved(s){ __calls.setSaved.push(s); } function showBanner(t, m){ __calls.banner.push(m); } function openBessGuidedBuild(){ __calls.guided++; }",
  "function showProps(){} function _clearShapeSel(){ __calls.clearShapeSel = (__calls.clearShapeSel || 0) + 1; }"
].join('\n');

/* A fresh editor in a VM: the document, the address, a timer queue. */
function editor(opts) {
  opts = opts || {};
  var queue = [], listeners = {}, logs = [];
  var sel = { value: '' };
  /* #omega-prime-nav, the title-bar mount: what was painted, and the one
     button it may hold */
  var btn = { onclick: null };
  var nav = { hidden: true, innerHTML: '',
    querySelector: function (s) { return s === '[data-prime="rebuild"]' && /data-prime="rebuild"/.test(this.innerHTML) ? btn : null; } };
  var doc = {
    readyState: 'complete',
    addEventListener: function (t, f) { (listeners[t] = listeners[t] || []).push(f); },
    dispatchEvent: function (ev) { (listeners[ev.type] || []).forEach(function (f) { f(ev); }); return true; },
    getElementById: function (id) { return id === 'bm-catalog' ? sel : (id === 'omega-prime-nav' && opts.nav !== false ? nav : null); },
    querySelector: function () { return null; }
  };
  var href = 'https://acme.test/editor.html?id=p1' + (opts.from === false ? '' : '&from=prime');
  var sb = {
    console: { info: function (m) { logs.push(['info', m]); }, warn: function (m) { logs.push(['warn', m]); }, log: function () {}, error: function (m) { logs.push(['error', m]); } },
    URL: URL, Promise: Promise, JSON: JSON, Math: Math, Date: Date,
    setTimeout: function (f) { queue.push(f); return queue.length; },
    CustomEvent: function (type, init) { this.type = type; this.detail = init && init.detail; },
    document: doc,
    history: { state: null, replaceState: function (s, t, u) { href = 'https://acme.test' + u; sb.location.href = href; sb.location.search = new URL(href).search; } },
    location: { href: href, search: new URL(href).search }
  };
  sb.window = sb;
  var ctx = vm.createContext(sb);
  vm.runInContext('var S = { elements: [], conduits: [], shapes: [], history: [], bessList: [], pxPerFt: 0 };', ctx);
  vm.runInContext(EDITOR_CODE, ctx, { filename: 'editor.html (cut)' });
  vm.runInContext(STUBS, ctx);
  vm.runInContext(PROJECT, ctx, { filename: 'omega-prime-project.js' });
  vm.runInContext(HANDOFF, ctx, { filename: 'omega-prime-handoff.js' });
  var E = {
    ctx: ctx, sb: sb, sel: sel, logs: logs, queue: queue, nav: nav, btn: btn, listeners: listeners,
    run: function (code) { return vm.runInContext(code, ctx); },
    get S() { return vm.runInContext('S', ctx); },
    get calls() { return vm.runInContext('__calls', ctx); },
    get H() { return sb.OmegaPrimeHandoff; },
    flush: function () { var n = 0; while (queue.length && n++ < 1000) queue.shift()(); return n; },
    map: function (lat, lng, zoom) {
      vm.runInContext('__map = ' + (lat == null ? 'null' : JSON.stringify({ lat: lat, lng: lng, zoom: zoom })) + ';', ctx);
      /* _gmapAutoScale's own formula */
      if (lat != null) vm.runInContext('S.pxPerFt = 1 / (156543.03392 * Math.cos(' + lat + ' * Math.PI / 180) / Math.pow(2, ' + zoom + ') * 3.28084);', ctx);
    },
    /* the map to another zoom about the same centre, as the editor settles
       it: the anchors (_geoReprojectAll), then the wrapper's real
       omegaRescaleElements() */
    zoom: function (z) {
      var m = vm.runInContext('__map', ctx);
      E.map(m.lat, m.lng, z);
      vm.runInContext('_geoReprojectAll(); omegaRescaleElements();', ctx);
    },
    /* a key or the pointer let go: the hand-off repaints the Omega Prime link a beat later */
    key: function () { doc.dispatchEvent({ type: 'keyup' }); },
    /* what _loadProject sets before doRender, then the doRender hook itself */
    load: function (d) {
      sb.__d = d;
      vm.runInContext('var d = __d; S.bessList = d.bessList || []; S.elements.length = 0; S.conduits.length = 0; S.shapes = []; S.history.length = 0;', ctx);
      vm.runInContext(LOAD_HOOK, ctx);
      /* the saved drawing, as doRender redraws it */
      (d.elements || []).forEach(function (el) { vm.runInContext('S.elements.push(' + JSON.stringify(el) + ');', ctx); });
      (d.conduits || []).forEach(function (c) { vm.runInContext('S.conduits.push(' + JSON.stringify(c) + ');', ctx); });
      (d.shapes || []).forEach(function (sh) { vm.runInContext('S.shapes.push(' + JSON.stringify(sh) + ');', ctx); });
    },
    render: function (id) { sb.__id = id || 'p1'; return vm.runInContext('var id = __id; ' + RENDER_HOOK, ctx); },
    px: function (p) { return vm.runInContext('_latLngToPx(' + p.lat + ', ' + p.lng + ', _liveMapState(), 1200, 800)', ctx); }
  };
  E.map(41.8781, -87.6298, 20);
  return E;
}

/* ── the editor.html hooks (8) — cut out once, run in each editor ───── */
var loadBody = block('async function _loadProject(');
var LOAD_HOOK = (function () {
  var m = /\n(\s*S\.prime\s+= \(d\.prime\s+&& typeof d\.prime==='object'\)\s+\? d\.prime\s+: null;\s*\n\s*S\.primeBuild\s+= null;)/.exec(loadBody);
  ok(m, '_loadProject keeps S.prime = d.prime (read only) and resets S.primeBuild');
  return m[1];
})();
var RENDER_HOOK = (function () {
  var m = /_watchRecord\(id\);\s*\/\*[^]*?\*\/\s*(try\{ document\.dispatchEvent\(new CustomEvent\('omega:project-rendered',\{detail:\{id:id, doc:d\}\}\)\); \}catch\(e\)\{\})\s*\};/.exec(loadBody);
  ok(m, 'doRender ends by dispatching omega:project-rendered {id, doc}, after _loadReady and _watchRecord');
  ok(loadBody.indexOf('_loadReady = true;') < loadBody.indexOf("CustomEvent('omega:project-rendered'"), 'the event follows _loadReady = true (saves are safe)');
  return m[1];
})();
eq((ED.match(/omega:project-rendered/g) || []).length, 1, 'the event is dispatched in one place');

/* ── fixtures: Prime's own layouts ───────────────────────────────────── */
var SITE = { lat: 41.8781, lng: -87.6298 };
function off(p, eastFt, northFt) {
  var d = PP.ftToDeg(p.lat, 1);
  return { lat: +(p.lat + northFt * d.dLat).toFixed(7), lng: +(p.lng + eastFt * d.dLng).toFixed(7) };
}
function box(c, wFt, hFt) {
  var a = off(c, -wFt / 2, -hFt / 2), b = off(c, wFt / 2, hFt / 2);
  return { s: a.lat, w: a.lng, n: b.lat, e: b.lng };
}
var WHO = { uid: 'u1', email: 'rep@acme.test', name: 'Rep', orgId: 'acme.test' };
function primeDoc(unit, st) {
  st = st || {};
  var s = { addr: '1 Main St, Chicago, IL 60601', lat: SITE.lat, lng: SITE.lng, step: 'map', unit: unit,
    area: st.area === undefined ? box(SITE, 60, 30) : st.area, unitAt: st.unitAt === undefined ? SITE : st.unitAt,
    poi: st.poi === undefined ? off(SITE, 70, -45) : st.poi, conduit: st.conduit === undefined ? true : st.conduit };
  return JSON.parse(JSON.stringify(PP.projectDoc(s, WHO, null)));
}
var CCK = 'CLEANCELL-CC290-125-REV-H';
var CC290_REF = PP.units(null, CC.entries()).filter(function (u) { return u.key === CCK; })[0];
/* its brochure footprint is the cabinet alone, not RELEASED (main, #337), so
   the rep types the submittal's L × W: the same unit, drawn at that size */
ok(CC290_REF && CC290_REF.footprint === 'none' && CC290_REF.incXfmr === false && CC290_REF.incDisco === false, 'the CC290 has no released footprint and needs a transformer and a disconnect');
var CC290 = PP.repFootprint(CC290_REF, 4.36, 3.94);
ok(CC290.footprint === 'rep' && CC290.lFt === 4.36 && CC290.wFt === 3.94, 'the rep\'s submittal footprint');
var R60 = PP.snapshot(PP.R60);

/* ═══ 1 · a v2 layout, built exactly ════════════════════════════════ */
(function () {
  var E = editor(), d = primeDoc(CC290), L = d.prime.layout;
  eq(L.v, 2, 'the fixture is a v2 layout');
  ok(L.unit && L.xfmr && L.disco && L.poi && L.conduit && L.area, 'it has every piece');
  E.load(d);
  deq(JSON.parse(JSON.stringify(E.S.prime)), d.prime, 'S.prime is the record\u2019s prime, as read');
  eq(E.S.primeBuild, null, 'no build pending on load');
  E.render('p1');
  eq(E.queue.length, 1, 'the hand-off heard doRender\u2019s event and scheduled the build');
  eq(E.S.elements.length, 0, 'nothing built inside doRender: it waits a beat'); eq(E.calls.save, 0);
  /* the Clean Cell reference catalog merges in after the first attempt, as
     its async script does in the editor */
  ok(!E.run('BESS_CATALOG["' + CCK + '"]'), 'the CC290 is not in the page catalog yet');
  E.queue.push(function () { E.sb.__CC = CC; E.run('__CC.mergeInto(BESS_CATALOG);'); });
  E.flush();
  ok(E.run('!!BESS_CATALOG["' + CCK + '"]'), 'the reference catalog merged in');
  var S = E.S, ppf = S.pxPerFt;
  ok(ppf > 2.7 && ppf < 2.8, 'zoom 20 at Chicago: ~2.74 px/ft');
  var b = S.bessList[0];
  eq(b.mfr, 'CleanCell US', 'the battery entry is filled from the catalog entry once it arrives');
  eq(b.kw, '125'); eq(b.kwh, '289.3');
  eq(E.sel.value, CCK, 'the BESS Config picker shows the unit');

  var els = S.elements, byRole = {};
  els.forEach(function (el) { byRole[el.primeRole] = el; });
  eq(els.length, 4, 'four pieces of gear: unit, transformer, disconnect, service');
  function gear(role, kind, g, lFt, wFt, label) {
    var el = byRole[role];
    ok(el, role + ' built');
    eq(el.type, 'evgear'); eq(el.evKind, kind, role + ' is evgear ' + kind);
    eq(el.label, label);
    eq(el.fromPrime, true); eq(el.bgbRole, role); eq(el.evRole, role);
    eq(el._geoLat, g.lat, role + ' anchored on Prime\u2019s latitude exactly'); eq(el._geoLng, g.lng, role + ' anchored on Prime\u2019s longitude exactly');
    eq(el.lf, lFt, role + ' true length'); eq(el.wf, wFt, role + ' true width');
    eq(el.w, Math.max(4, Math.round(lFt * ppf)), role + ' drawn at true scale (w)'); eq(el.h, Math.max(4, Math.round(wFt * ppf)), role + ' drawn at true scale (h)');
    eq(el.minW, 4); eq(el.minH, 4);
    var c = E.px(g);
    near(el.x + el.w / 2, c.x, 1e-9, role + ' centred on Prime\u2019s point (x)'); near(el.y + el.h / 2, c.y, 1e-9, role + ' centred on Prime\u2019s point (y)');
    eq(el.rot, 0, role + ' long axis east\u2013west');
    return el;
  }
  var u = gear('bess', 'bess', L.unit.c, L.unit.lFt, L.unit.wFt, 'BESS Assembly');
  var x = gear('xfmr', 'xfmr', L.xfmr.c, 8, 8, 'Step-Up Transformer');
  var di = gear('disco', 'disco', L.disco.c, 3, 4, 'AC Disconnect');
  var sv = gear('service', 'service', L.poi, 3, 2.5, 'Utility POI');
  ok(x.w < 28 && di.w < 14, 'the 8 ft transformer and the 3 ft disconnect are not inflated to the symbol floor');
  eq(u.bgbKw, 125); eq(u.bgbKwh, 289.3); eq(u.bessKw, 125); eq(u.bessKwh, 289.3);
  eq(u.bessUnits, 1); eq(u.bessUnitCount, 1);
  eq(u.bgbIncXfmr, false); eq(u.bgbIncDisco, false); eq(u.bgbIncPcs, false, 'the CC290\u2019s PCS is separate');
  eq(u.bessId, 'prime-1', 'linked to the battery entry (the BOM\u2019s _bCfgOf)'); eq(u.bessCfgId, 'prime-1');
  eq(u.catalogKey, CCK); eq(u.bessMfr, 'CleanCell US');
  eq(u.bessModel, 'CleanCell US CC290/125 - 125 kW / 290 kWh class');
  eq(u.spec, '0.29 MWh / 0.13 MW \u00b7 BTM \u00b7 incl. PCS/inverter');
  eq(x.spec, '150 kVA pad-mount \u00b7 480V\u2192MV step-up', 'the transformer sized as the Guided Build sizes it');
  eq(di.spec, 'Service-rated AC disconnect \u00b7 198A / 480V \u00b7 NEMA 3R');

  var area = S.shapes.filter(function (s) { return s.primeRole === 'area'; });
  eq(area.length, 1, 'one BESS area'); eq(S.shapes.length, 1, 'and no other shape');
  var z = area[0];
  eq(z.kind, 'zonebox'); eq(z.fromPrime, true); eq(z.border, 'dashed');
  deq(z._geoPts, [{ lat: L.area.n, lng: L.area.w }, { lat: L.area.s, lng: L.area.e }], 'the area anchored on Prime\u2019s corners');
  var nw = E.px({ lat: L.area.n, lng: L.area.w }), se = E.px({ lat: L.area.s, lng: L.area.e });
  deq(JSON.parse(JSON.stringify(z.pts)), [{ x: nw.x, y: nw.y }, { x: se.x, y: se.y }], 'drawn on those corners');
  eq(z.label, 'BESS area \u00b7 ' + L.area.wFt + ' \u00d7 ' + L.area.hFt + ' ft');

  var C = S.conduits;
  eq(C.length, 3, 'three conduits: unit \u2192 transformer \u2192 disconnect \u2192 service');
  function run(c, from, to, type, role, pts, label) {
    eq(c.condType, type, label + ' type'); eq(c.primeRole, role); eq(c.fromPrime, true);
    eq(c.fromId, from.id); eq(c.toId, to.id); eq(c.fromElId, from.id); eq(c.toElId, to.id);
    eq(c.pts[0].elId, from.id); eq(c.pts[c.pts.length - 1].elId, to.id);
    deq(JSON.parse(JSON.stringify(c._geoPts)), pts, label + ' anchored on Prime\u2019s vertices');
    eq(c.ftLen, +PP.pathFt(pts).toFixed(1), label + ' length measured on the ground, the editor\u2019s formula');
    eq(c._baseLabel, label);
    ok(new RegExp(' \u2014 ' + Math.round(PP.pathFt(pts)) + ' LF\\)$').test(c.label), label + ' labelled with its ground length: ' + c.label);
  }
  run(C[0], u, x, 'RMC-AC', 'pad-leg', [L.unit.c, L.xfmr.c], 'BESS\u2192XFMR (AC)');
  run(C[1], x, di, 'RMC-AC', 'pad-leg', [L.xfmr.c, L.disco.c], 'XFMR\u2192Disco (AC)');
  run(C[2], di, sv, 'PVC-UG', 'poi-run', L.conduit.pts, 'Disco\u2192POI (service)');
  eq(C[0].route, 'surface', 'pad legs on the surface (the editor\u2019s default)');
  eq(C[2].route, 'trench'); eq(C[2].trenchIn, 'ground', 'the service run is trenched in ground');
  eq(C[2].pts.length, 3, 'the service run keeps Prime\u2019s L');
  near(C[2].ftLen, L.conduit.ft, 0.051, 'the service run is Prime\u2019s conduit length');

  eq(S.history.length, 1, 'the whole build is ONE undo step (omegaHistBatch)');
  eq(E.calls.reproject, 1, 'reprojected onto the anchors');
  near(u.x + u.w / 2, E.px(L.unit.c).x, 1e-9, 'and still on Prime\u2019s point after it');
  eq(E.calls.save, 1, 'saved through saveProject (savedBy rides that write)');
  deq(E.calls.saved, { primeBuild: { at: S.primeBuild.at, hash: L.hash } }, 'S.primeBuild { at, hash } is set before the save');
  ok(typeof S.primeBuild.at === 'number' && S.primeBuild.at > 0, 'builtAt is a time');
  ok(E.calls.setSaved.indexOf('unsaved') >= 0 && E.run('_workDirty') === true, 'marked unsaved and dirty');
  eq(E.calls.guided, 0, 'no Guided Build after a transfer');
  ok(/^Built from Omega Prime: CleanCell US CC290\/125, BESS area, transformer, disconnect, service point and 3 conduit runs, as drawn\.$/.test(E.calls.banner[E.calls.banner.length - 1]), 'the banner says what was built');
  eq(E.sb.location.href, 'https://acme.test/editor.html?id=p1', 'from=prime is dropped, the id kept');

  /* the Run reads the unit by its catalog key and make */
  var f = E.run('_ppCollectFleet()'), k = Object.keys(f.byModel);
  eq(f.units, 1); eq(k.length, 1);
  eq(f.byModel[k[0]].catalogKey, CCK, '_ppCollectFleet carries the catalog key'); eq(f.byModel[k[0]].mfr, 'CleanCell US', 'and the make');
  ok(f.elIds.indexOf(u.id) >= 0, 'the built unit is claimed by the fleet');
})();

/* ═══ 1b · a unit whose maker released no footprint: a small marker ═
   The LG JP-2 (Prime's first unit) and the Smart Module have no released
   footprint; Prime places each as a point with its transformer 5 ft clear.
   Site Map draws a 2 ft marker at true scale with the gear's floor, never
   the editor's 10 x 5 ft symbol on its 28 x 20 px floor (which overlapped
   the transformer by 5.2 ft at zoom 19), and the editor's own zoom rescale
   (_geoReprojectAll, then omegaRescaleElements → _elFootprintFt) keeps it
   so at every zoom (review prime-editor:2). */
(function () {
  var list = PP.units(null, CC.entries());
  ['CLEANCELL-LGJP2-1000-REV-H', 'CLEANCELL-SM-1000-REV-H'].forEach(function (key) {
    var unit = list.filter(function (u) { return u.key === key; })[0];
    eq(unit.footprint, 'none', key + ' has no released footprint');
    var E = editor();
    E.map(SITE.lat, SITE.lng, 19);                 /* the zoom a Prime record opens at */
    var d = primeDoc(unit), L = d.prime.layout;
    eq(d.mapState.zoom, 19, 'projectDoc opens Site Map at zoom 19');
    eq(L.unit.lFt, null, 'Prime kept it unknown'); eq(L.unit.footprint, 'none');
    E.sb.__CC = CC; E.run('__CC.mergeInto(BESS_CATALOG);');
    E.load(d); E.render('p1'); E.flush();
    var S = E.S, u = S.elements.filter(function (e) { return e.primeRole === 'bess'; })[0];
    var x = S.elements.filter(function (e) { return e.primeRole === 'xfmr'; })[0];
    eq(u.primeFootprint, 'none', 'marked: a symbol, not a footprint (the flag readers use)');
    eq(u.primeMarkFt, 2, 'a 2 ft marker'); eq(E.H.MARK_FT, 2);
    ok(!('lf' in u) && !('wf' in u), 'no lf/wf on it: nothing a reader could take for the unit\u2019s footprint, never the 10 x 5 ft symbol');
    eq(u.minW, 4); eq(u.minH, 4, 'the gear\u2019s 4 px floor, never the 28 x 20 px symbol floor');
    eq(u._geoLat, L.unit.c.lat); eq(u._geoLng, L.unit.c.lng, 'still on Prime\u2019s point');
    deq(E.run('_elFootprintFt(S.elements.filter(function (e) { return e.primeRole === "bess"; })[0])'), { lf: 2, wf: 2 },
      'the zoom rescale reads the marker\u2019s own size (editor.html _elFootprintFt)');
    /* open at 19, zoom in to 20 and 21, settle twice, back out to 19 */
    [19, 20, 21, 21, 19].forEach(function (z) {
      E.zoom(z);
      var ppf = E.S.pxPerFt, tag = key.slice(10, 15) + ' zoom ' + z;
      /* omegaRescaleElements leaves a size within 1 px of what it wants */
      ok(Math.abs(u.w - Math.max(4, Math.round(2 * ppf))) <= 1, tag + ': 2 ft across at true scale, or the 4 px floor (' + u.w + ' px)');
      eq(u.h, u.w, tag + ': square');
      ok(u.w / ppf <= 3, tag + ': at most 3 ft on the ground (' + (u.w / ppf).toFixed(2) + ' ft)');
      near(u.x + u.w / 2, E.px(L.unit.c).x, 1e-6, tag + ': centred on Prime\u2019s point');
      ok(Math.abs(x.w - Math.max(4, Math.round(8 * ppf))) <= 1, tag + ': the transformer at its true 8 ft (' + x.w + ' px)');
      ok(u.x + u.w < x.x, tag + ': clear of the transformer, inside the 5 ft gap Prime left (' + ((x.x - u.x - u.w) / ppf).toFixed(2) + ' ft between them)');
      ok(!('lf' in u) && u.primeFootprint === 'none', tag + ': and still no footprint of its own');
    });
    ok(x && S.conduits.length === 3, 'the gear row and the runs as Prime drew them');
    ok(/has not released this unit\u2019s footprint/.test(E.calls.banner[E.calls.banner.length - 1]), 'and the banner says so');
    eq(u.bgbIncPcs, unit.incPcs, 'the unit\u2019s own PCS flag');
  });
  /* 29 W Main St, Mesa AZ: at zoom 19 the 4 px floor would be 3.2 ft, so the
     marker's floor is 3 px there — never over 3 ft where it is built */
  var MESA = { lat: 33.4152, lng: -111.8315 }, LGM = list[0];
  var E = editor();
  E.map(MESA.lat, MESA.lng, 19);
  var dm = JSON.parse(JSON.stringify(PP.projectDoc({ addr: '29 W Main St, Mesa, AZ 85201', lat: MESA.lat, lng: MESA.lng, step: 'map', unit: LGM,
    area: box(MESA, 60, 30), unitAt: MESA, poi: off(MESA, 70, -45), conduit: true }, WHO, null)));
  E.sb.__CC = CC; E.run('__CC.mergeInto(BESS_CATALOG);');
  E.load(dm); E.render('p1'); E.flush();
  var mu = E.S.elements.filter(function (e) { return e.primeRole === 'bess'; })[0], mx = E.S.elements.filter(function (e) { return e.primeRole === 'xfmr'; })[0];
  ok(4 / E.S.pxPerFt > 3, 'Mesa, zoom 19: 4 px is ' + (4 / E.S.pxPerFt).toFixed(2) + ' ft');
  eq(mu.minW, 3); eq(mu.w, 3); ok(mu.w / E.S.pxPerFt <= 3, 'the marker is ' + (mu.w / E.S.pxPerFt).toFixed(2) + ' ft');
  ok(mu.x + mu.w < mx.x, 'clear of the transformer');
  E.zoom(21);
  ok(Math.abs(mu.w - Math.round(2 * E.S.pxPerFt)) <= 1 && mu.x + mu.w < mx.x, 'and at zoom 21, 2 ft across, still clear');
})();

/* ═══ 2 · the R60: no transformer; priced by its key ═══════════════ */
(function () {
  var E = editor(), d = primeDoc(R60), L = d.prime.layout;
  eq(L.xfmr, null, 'Prime draws no transformer for the R60'); ok(L.disco, 'but a disconnect');
  E.load(d); E.render('p1'); E.flush();
  var S = E.S, roles = S.elements.map(function (e) { return e.primeRole; });
  deq(roles, ['bess', 'disco', 'service'], 'unit, disconnect, service; no transformer');
  ok(!S.elements.some(function (e) { return e.evKind === 'xfmr'; }), 'no xfmr element');
  eq(S.conduits.length, 2, 'two conduits');
  eq(S.conduits[0]._baseLabel, 'BESS\u2192Disco (AC)'); eq(S.conduits[0].primeRole, 'pad-leg');
  eq(S.conduits[1]._baseLabel, 'Disco\u2192POI (service)'); eq(S.conduits[1].primeRole, 'poi-run');
  var u = S.elements[0];
  eq(u.lf, 28); eq(u.wf, 7.25, 'the skid\u2019s 336 x 87 in');
  eq(u.bgbIncXfmr, true, 'the R60 integrates its transformer'); eq(u.bgbIncPcs, true);
  eq(u.catalogKey, 'CC-R60'); eq(u.bessMfr, 'Clean Cell');
  eq(u.bgbKw, 60); eq(u.bgbKwh, 61.44);
  eq(S.bessList[0].ikva, '60', 'the entry filled from BESS_CATALOG[CC-R60]');
  /* the Run: _ppCollectFleet → omegaCostQuantities → api/_lib/editor-cost.js */
  var q = E.run('omegaCostQuantities()'), k = Object.keys(q.fleet.byModel);
  eq(k.length, 1);
  eq(q.fleet.byModel[k[0]].catalogKey, 'CC-R60', 'the Run sends the catalog key, not the model name');
  eq(q.fleet.byModel[k[0]].nextnrg, false);
  var r = EC.rollup(JSON.parse(JSON.stringify(q)));
  eq(r.lines.bess.rows[0].perUnit, 24000, 'the R60 prices at its catalog price');
  eq(r.lines.bess.rows[0].catalog, true);
  /* a Guided Build element (no catalog key) keeps its old keying */
  E.run("S.elements.length = 0; S.elements.push({ id: 'g1', type: 'evgear', evKind: 'bess', bgbRole: 'bess', bgbKw: 1000, bgbKwh: 2000, bessModel: 'Acme Box' });");
  var f = E.run('_ppCollectFleet()');
  eq(f.byModel['Acme Box'].catalogKey, null, 'a Guided Build element has no catalog key'); eq(f.byModel['Acme Box'].mfr, '');
  var q2 = E.run('omegaCostQuantities()');
  eq(q2.fleet.byModel['Acme Box'].catalogKey, 'Acme Box', 'so the Run keys it by its model as before'); eq(q2.fleet.byModel['Acme Box'].nextnrg, false);
  eq(EC.rollup(JSON.parse(JSON.stringify(q2))).lines.bess.rows[0].catalog, false, 'priced at the container rate as before');
})();

/* ═══ 3 · a v1 layout is upgraded with Prime's own rule ═════════════ */
(function () {
  var E = editor();
  var poi = off(SITE, 60, -40), area = box(SITE, 50, 25);
  var v1 = { area: { s: area.s, w: area.w, n: area.n, e: area.e, wFt: 50, hFt: 25, sqft: 1250 }, unit: { lat: SITE.lat, lng: SITE.lng }, poi: poi, conduitFt: 75 };
  var d = { name: '1 Main St', address: '1 Main St', type: 'bess', elements: [], conduits: [], annotations: [],
    bessList: [PP.bessEntry(R60)], mapState: { lat: SITE.lat, lng: SITE.lng, zoom: 19 },
    prime: { v: 1, unitKey: 'CC-R60', geocode: 'census', layout: v1 } };
  var want = PP.upgrade(v1, R60);
  eq(want.v, 2); ok(want.disco && !want.xfmr && want.conduit, 'the upgrade replays arrange(): disconnect, no transformer, the L');
  E.load(d); E.render('p1'); E.flush();
  var S = E.S, by = {};
  S.elements.forEach(function (e) { by[e.primeRole] = e; });
  eq(by.bess._geoLat, want.unit.c.lat); eq(by.bess._geoLng, want.unit.c.lng);
  eq(by.bess.lf, 28, 'the R60 footprint, from Prime\u2019s own constant');
  eq(by.disco._geoLat, want.disco.c.lat); eq(by.disco._geoLng, want.disco.c.lng, 'the disconnect where Prime\u2019s rule puts it');
  eq(by.service._geoLat, poi.lat); eq(by.service._geoLng, poi.lng);
  deq(JSON.parse(JSON.stringify(S.conduits[1]._geoPts)), want.conduit.pts, 'the service run on the upgraded L');
  eq(S.primeBuild.hash, want.hash, 'builtHash is the upgraded layout\u2019s hash');
  eq(S.shapes[0].label, 'BESS area \u00b7 50 \u00d7 25 ft');
})();

/* ═══ 3b · a v1 record on the XXL: ONE unit rule, one layout ════════
   v1 kept no unit snapshot and gave every workspace without products of its
   own the FENECON XXL. PP.unitFor knows the XXL by its key, so Prime's
   resume, the quote server's Run input and this build replay the sketch
   with its 20 x 8 ft footprint in any workspace (review prime-editor:1:
   Prime and the quote drew a point, Site Map a container, and Prime then
   said "changed in Prime" over a layout nobody changed). */
var Q = require(path.join(ROOT, 'api/_lib/customer-quote.js'));
var FEN = JSON.parse(read('tenants/fenecon/tenant.json'));
/* a battery entry exactly as v1's bessEntry wrote it: no SKU, no integration flags */
function v1Entry(u) {
  return { id: 'prime-1', name: 'BESS-01', mfr: u.mfr || '', model: u.model || u.name, chem: u.chem || '', kwh: String(u.kwh),
    usable: u.usable == null ? '' : String(u.usable), kw: String(u.kw), dur: u.hours == null ? '' : String(u.hours), acv: '480',
    xfmr: u.xfmr || '', disco: u.disco || '', qty: '1', catalogKey: u.key, _fromPrime: true };
}
function v1Doc(entry, key) {
  var a = box(SITE, 80, 30);
  return { name: '1 Main St', address: '1 Main St', type: 'bess', siteScopes: ['bess'], stage: 'candidate', elements: [], conduits: [], annotations: [],
    bessList: [entry], mapState: { lat: SITE.lat, lng: SITE.lng, zoom: 19 },
    prime: { v: 1, unitKey: key, geocode: 'U.S. Census geocoder',
      layout: { area: { s: a.s, w: a.w, n: a.n, e: a.e, wFt: 80, hFt: 30, sqft: 2400 }, unit: { lat: SITE.lat, lng: SITE.lng }, poi: off(SITE, 60, -40), conduitFt: 81 } } };
}
(function () {
  var v1doc = v1Doc(v1Entry(PP.XXL), PP.XXL.key);
  ok(!v1doc.prime.unit && !v1doc.bessList[0].sku && !('_incXfmr' in v1doc.bessList[0]), 'a v1 record: no unit snapshot, a v1 battery entry');
  var want = PP.upgrade(v1doc.prime.layout, PP.XXL);
  eq(want.unit.lFt, 20); eq(want.unit.wFt, 8); eq(want.unit.footprint, 'catalog');
  near(PP.pathFt([want.unit.c, want.xfmr.c]), 10 + 5 + 4, 0.05, 'the transformer clears the 20 ft container by 5 ft');
  near(PP.pathFt([want.unit.c, want.disco.c]), 10 + 5 + 8 + 5 + 1.5, 0.05, 'and the disconnect the transformer');

  /* Prime's resume: omega-prime.html PP.restore(d, UNITS), a generic workspace's list (no XXL on it) */
  var UNITS = PP.units(null, CC.entries());
  ok(!UNITS.some(function (u) { return u.key === PP.XXL.key; }), 'the XXL is on no generic workspace’s list');
  var prime = PP.restore(JSON.parse(JSON.stringify(v1doc)), UNITS);
  deq(prime.unit, PP.snapshot(PP.XXL), 'Prime resumes it from the shipped constant, footprint and all');
  deq(prime.layout, want, 'and replays the sketch at the XXL’s size');
  /* the quote server: api/customer-quote.js priced() is PP.restore(project, Q.unitsFor(org, record, storefront)), then PP.runInput */
  var srv = {};
  [['acme.test', { name: 'Acme', vertical: 'developer' }], ['fenecon.com', FEN]].forEach(function (w) {
    var list = Q.unitsFor(w[0], w[1], {});
    var R = PP.restore(JSON.parse(JSON.stringify(v1doc)), list);
    deq(R.layout, want, w[0] + ': the server replays the same layout' + (list.some(function (u) { return u.key === PP.XXL.key; }) ? ' (its own XXL)' : ' (the shipped XXL)'));
    srv[w[0]] = PP.runInput(R.unit, R.layout);
  });
  ok(Q.unitsFor('fenecon.com', FEN, {}).some(function (u) { return u.key === PP.XXL.key; }), 'FENECON’s own list carries its XXL');
  deq(srv['acme.test'], srv['fenecon.com'], 'one Run input in every workspace');
  deq(srv['acme.test'], PP.runInput(prime.unit, prime.layout), 'and it is the one Prime’s Run sends');
  eq(srv['acme.test'].poiFt, Math.round(want.conduit.ft), 'priced on the service run Prime drew');

  /* Site Map: the real hand-off on the editor's own functions */
  var E = editor();
  deq(E.H.resolve(v1doc).unit, PP.unitFor(v1doc, E.H.units()), 'the hand-off asks PP.unitFor, on the list this page offers');
  deq(E.H.resolve(v1doc).layout, want, 'and resolves the same layout');
  E.load(JSON.parse(JSON.stringify(v1doc))); E.render('p1'); E.flush();
  var S = E.S, by = {};
  S.elements.forEach(function (e) { by[e.primeRole] = e; });
  eq(by.bess.lf, 20); eq(by.bess.wf, 8, 'the container at its true footprint');
  [['bess', want.unit.c], ['xfmr', want.xfmr.c], ['disco', want.disco.c], ['service', want.poi]].forEach(function (r) {
    eq(by[r[0]]._geoLat, r[1].lat); eq(by[r[0]]._geoLng, r[1].lng, r[0] + ': where Prime and the server put it');
  });
  var run = S.conduits.filter(function (c) { return c.primeRole === 'poi-run'; })[0];
  deq(run._geoPts, want.conduit.pts, 'the service run on the same L');
  eq(Math.round(run.ftLen), srv['acme.test'].poiFt, 'as long as the Run input the proposal is priced on');
  eq(S.primeBuild.hash, prime.layout.hash, 'builtHash is the hash Prime shows: no false "changed in Prime"');
})();

/* ═══ 3c · a v1 record on a workspace's own product: the same list ═══
   Site Map's list is PP.units() over the products omega-bess-products.js
   merged into its catalog: a product Prime offers is the same unit here,
   and one Prime drops (a PLACEHOLDER SPEC row) is dropped here too — the
   hand-off's own list once gave it the placeholder's made-up size. */
(function () {
  var PRODUCTS = [{ sku: 'AP-500', name: 'AP 500 cabinet', kw: 250, kwh: 500, widthFt: 10, depthFt: 8, heightFt: 8.5, chem: 'LFP', integrates: { pcs: true, xfmr: false, disco: true } },
    { sku: 'AP-PH', name: 'AP placeholder', kw: 500, kwh: 1000, widthFt: 12, depthFt: 9, notes: 'PLACEHOLDER SPEC - replace with the datasheet' }];
  var OG = { name: 'Acme Power', slug: 'acme', vertical: 'developer' };
  var t = Q.tenantCatalog('acmepower.com', OG, { products: PRODUCTS });
  deq(t.keys, ['ACME-AP-500', 'ACME-AP-PH']);
  var UNITS = PP.units(t, CC.entries());                         /* what Prime's page offers this workspace */
  ok(UNITS.some(function (u) { return u.key === 'ACME-AP-500'; }) && !UNITS.some(function (u) { return u.key === 'ACME-AP-PH'; }), 'Prime offers the product and drops the placeholder');
  ['ACME-AP-500', 'ACME-AP-PH'].forEach(function (key) {
    var e = t.entries[key], doc = v1Doc(v1Entry({ key: key, mfr: e.mfr, model: e.model, chem: e.chem, kw: e.kw, kwh: e.kwh, hours: e.dur }), key);
    var prime = PP.restore(JSON.parse(JSON.stringify(doc)), UNITS);
    var server = PP.restore(JSON.parse(JSON.stringify(doc)), Q.unitsFor('acmepower.com', OG, { products: PRODUCTS }));
    deq(server.layout, prime.layout, key + ': the server replays Prime’s layout');
    var E = editor();
    /* omega-bess-products.js mergeInto: the workspace's entries join the catalog */
    E.sb.__T = t; E.run('Object.keys(__T.entries).forEach(function (k) { if (!BESS_CATALOG[k]) BESS_CATALOG[k] = __T.entries[k]; });');
    deq(E.H.resolve(doc).layout, prime.layout, key + ': and so does Site Map');
    E.load(JSON.parse(JSON.stringify(doc))); E.render('p1'); E.flush();
    var by = {};
    E.S.elements.forEach(function (x) { by[x.primeRole] = x; });
    eq(by.bess._geoLat, prime.layout.unit.c.lat); eq(by.xfmr._geoLng, prime.layout.xfmr.c.lng, key + ': the transformer where Prime put it');
    eq(!!by.disco, !!prime.layout.disco, key + ': a disconnect exactly where Prime draws one');
    eq(E.S.primeBuild.hash, prime.layout.hash);
    if (key === 'ACME-AP-500') { eq(by.bess.lf, 10); eq(by.bess.wf, 8); eq(prime.layout.disco, null, 'it integrates its disconnect'); }
    else { eq(prime.unit.footprint, 'none'); eq(by.bess.primeFootprint, 'none', 'the placeholder’s made-up size is not drawn: a marker, as in Prime'); }
  });
})();

/* ═══ 4 · never twice, never over a drawing, never when built ═══════ */
(function () {
  var E = editor(), d = primeDoc(R60);
  E.load(d);
  E.render('p1');
  eq(E.H.onRendered({ detail: { id: 'p1', doc: d } }), 'busy', 'a second render before the build: not scheduled again');
  E.flush();
  eq(E.S.elements.length, 3);
  eq(E.H.onRendered({ detail: { id: 'p1', doc: d } }), 'built-here', 'a render after the build: the build is on the canvas');
  E.flush();
  eq(E.S.elements.length, 3, 'never built twice'); eq(E.calls.save, 1, 'saved once');
})();
(function () {
  var E = editor(), d = primeDoc(R60);
  d.prime.builtAt = 1760000000000; d.prime.builtHash = d.prime.layout.hash;
  E.load(d);
  eq(E.H.onRendered({ detail: { id: 'p1', doc: d } }), 'built', 'builtAt set: never again');
  E.flush();
  eq(E.S.elements.length, 0); eq(E.calls.save, 0);
  eq(E.sb.location.search, '?id=p1', 'from=prime dropped anyway');
})();
(function () {
  var E = editor(), d = primeDoc(R60);
  d.elements = [{ id: 'mine', type: 'eq', eqId: 'pad', x: 1, y: 2 }];
  E.load(d);
  eq(E.H.onRendered({ detail: { id: 'p1', doc: d } }), 'drawing', 'a drawing on the record: never over it');
  E.flush();
  eq(E.S.elements.length, 1); eq(E.S.elements[0].id, 'mine'); eq(E.calls.save, 0);
  ok(/already has a drawing/.test(E.calls.banner.join(' ')), 'said, since the rep came from Prime');
  var d2 = primeDoc(R60); d2.docTabs = [{ id: 't0' }, { id: 't1' }];
  var E2 = editor(); E2.load(d2);
  eq(E2.H.onRendered({ detail: { id: 'p1', doc: d2 } }), 'drawing', 'a second document tab counts as a drawing');
  var E3 = editor(), d3 = primeDoc(R60); E3.load(d3);
  E3.render('p1');
  E3.run("S.shapes.push({ id: 'hand', kind: 'zonebox', pts: [] });");    /* the rep starts drawing during the wait */
  E3.flush();
  eq(E3.S.elements.length, 0, 'a drawing begun during the wait stops the build'); eq(E3.calls.save, 0);
})();
(function () {
  var E = editor(), d = primeDoc(R60);
  E.H.configure({ tries: 3 });
  E.map(null);
  E.load(d); E.render('p1');
  var n = E.flush();
  eq(E.S.elements.length, 0, 'no live map: nothing built'); eq(E.calls.save, 0);
  eq(n, 4, 'tried briefly (the first attempt and three retries)');
  ok(E.logs.some(function (l) { return l[0] === 'warn' && /satellite map is not live/.test(l[1]); }), 'then gave up with a console note');
  E.map(41.8781, -87.6298, 20);
  E.load(d); E.render('p1'); E.flush();
  eq(E.S.elements.length, 3, 'the next render with a live map builds');
})();

(function () {
  /* the plan, read as omegaRunSave reads it: a package still loading is
     waited for; a read-only one is left alone (the drawing could not be saved) */
  var E = editor(), d = primeDoc(R60);
  E.run("var __pk = { packaged: true, pending: true, readOnly: true }; var OmegaCaps = { packageAccess: function () { return __pk; } };");
  E.load(d); E.render('p1');
  E.flush();
  eq(E.S.elements.length, 0, 'a package that never finished loading: nothing built');
  ok(E.logs.some(function (l) { return /plan could not be read/.test(l[1]); }), 'and a console note');
  var E2 = editor(), d2 = primeDoc(R60);
  E2.run("var __pk = { packaged: true, pending: true, readOnly: true }; var OmegaCaps = { packageAccess: function () { return __pk; } };");
  E2.load(d2); E2.render('p1');
  E2.queue.shift()(); E2.queue.shift()();                      /* two attempts while it loads */
  E2.run("__pk = { packaged: true, readOnly: false, modules: ['lite'] };");
  E2.flush();
  eq(E2.S.elements.length, 3, 'the package arrives: the layout is built'); eq(E2.calls.save, 1);
  var E4 = editor(), d4 = primeDoc(R60);
  E4.run('_latLngToPx = function () { return null; };');           /* a map that cannot place a point */
  E4.load(d4); E4.render('p1'); E4.flush();
  eq(E4.S.elements.length + E4.S.shapes.length + E4.S.conduits.length, 0, 'a point that will not project: nothing half-drawn');
  eq(E4.S.history.length, 0); eq(E4.calls.save, 0);
  var E3 = editor(), d3 = primeDoc(R60);
  E3.run("var OmegaCaps = { packageAccess: function () { return { packaged: true, readOnly: true }; } };");
  E3.load(d3); E3.render('p1'); E3.flush();
  eq(E3.S.elements.length, 0, 'a read-only plan: nothing built'); eq(E3.calls.save, 0);
  ok(/read-only/.test(E3.calls.banner.join(' ')), 'and said');
  eq(E3.sb.location.search, '?id=p1');
})();

/* ═══ 5 · the Guided Build: the fallback, once, with from=prime ═════ */
(function () {
  var E = editor(), d = primeDoc(R60, { unitAt: null });
  ok(d.prime.layout && !d.prime.layout.unit, 'Prime placed no unit');
  E.load(d);
  eq(E.H.onRendered({ detail: { id: 'p1', doc: d } }), 'guided', 'no unit placed + from=prime: the Guided Build');
  E.flush();
  eq(E.calls.guided, 1, 'opened once');
  eq(E.S.bessList[0].ikva, '60', 'the battery entry filled from the catalog first'); eq(E.sel.value, 'CC-R60');
  eq(E.S.elements.length, 0, 'nothing forged');
  eq(E.sb.location.search, '?id=p1', 'from=prime dropped');
  eq(E.H.onRendered({ detail: { id: 'p1', doc: d } }), 'no-unit'); E.flush();
  eq(E.calls.guided, 1, 'never a second time');
  var E2 = editor({ from: false }); E2.load(d);
  eq(E2.H.onRendered({ detail: { id: 'p1', doc: d } }), 'no-unit', 'opened from the Projects list: no Guided Build');
  E2.flush();
  eq(E2.calls.guided, 0);
  var E3 = editor({ from: false }), d3 = primeDoc(R60); E3.load(d3); E3.render('p1'); E3.flush();
  eq(E3.S.elements.length, 3, 'a placed unit transfers without from=prime too (the record decides)');
  var E4 = editor();
  E4.load({ name: 'x', elements: [], bessList: [{ id: 'b', kw: '1', kwh: '2' }] });
  eq(E4.H.onRendered({ detail: { id: 'p1', doc: { name: 'x', elements: [] } } }), 'not-prime', 'not a Prime project: nothing');
  E4.flush(); eq(E4.calls.guided, 0);
})();

/* ═══ 6 · Rebuild from Omega Prime ══════════════════════════════════
   rebuild() draws Prime's layout again where nothing the rep drew is on the
   canvas: an emptied drawing, Prime's own build with a piece gone, or Prime's
   own build of a layout Prime has since changed (review prime-editor:5). */
(function () {
  var E = editor(), d = primeDoc(R60);
  E.load(d); E.render('p1'); E.flush();
  eq(E.S.elements.length, 3);
  eq(E.H.rebuild(), 'current', 'Prime’s build is on the canvas as Prime has it: nothing to draw again');
  ok(/already drawn here/.test(E.calls.banner[E.calls.banner.length - 1]));
  E.run("S.elements.push({ id: 'mine', type: 'eq', eqId: 'pad', x: 1, y: 2, w: 10, h: 10 });");
  eq(E.H.rebuild(), 'drawing', 'never over a drawing the rep made');
  ok(/Clear the drawing first/.test(E.calls.banner[E.calls.banner.length - 1]));
  eq(E.S.elements.length, 4, 'and nothing was touched');
  E.run("S.elements = S.elements.filter(function (e) { return e.id !== 'mine'; });");
  /* one Cmd+Z took the build back, the autosave kept the empty drawing and builtAt */
  E.run('S.elements.length = 0; S.conduits.length = 0; S.shapes.length = 0; S.primeBuild = null; S.prime.builtAt = 1760000000000;');
  eq(E.H.rebuild(), 'scheduled', 'an emptied drawing: draw Prime’s layout again');
  E.flush();
  eq(E.S.elements.length, 3); eq(E.S.conduits.length, 2); eq(E.S.shapes.length, 1);
  eq(E.S.prime.builtAt, null, 'builtAt cleared locally');
  ok(E.S.primeBuild && E.S.primeBuild.hash === d.prime.layout.hash, 'the save sets builtAt again');
  eq(E.calls.save, 2);

  /* the rep deletes Prime's disconnect (removeEl takes its two runs with it):
     only Prime's objects are left, and part of the build is gone */
  E.run("removeEl(S.elements.filter(function (e) { return e.primeRole === 'disco'; })[0].id);");
  eq(E.S.elements.length, 2); eq(E.S.conduits.length, 0, 'its runs went with it');
  var before = E.S.history.length, ids = E.S.elements.map(function (e) { return e.id; });
  eq(E.H.rebuild(), 'scheduled', 'part of Prime’s build is gone: draw it again');
  E.flush();
  var S = E.S;
  deq(S.elements.map(function (e) { return e.primeRole; }), ['bess', 'disco', 'service'], 'the whole layout, once');
  ok(S.elements.every(function (e) { return ids.indexOf(e.id) < 0; }), 'Prime’s leftovers were taken away first (removeEl), never drawn twice');
  eq(S.conduits.length, 2); eq(S.shapes.length, 1, 'one BESS area, not two');
  ok(S.elements.concat(S.conduits, S.shapes).every(function (o) { return o.fromPrime === true; }));
  eq(S.history.length, before + 1, 'taking the leftovers away and drawing again is ONE undo step');
  eq(S.history[S.history.length - 2].els.length, 2, 'and one undo puts the canvas back as the rep left it');
  eq(E.calls.save, 3);
})();
(function () {
  /* Prime moved the service point after the transfer: the record's layout is
     new, its builtHash the old one, and the canvas (saved) the old build */
  var E = editor(), d = primeDoc(R60);
  E.load(d); E.render('p1'); E.flush();
  var saved = JSON.parse(JSON.stringify({ elements: E.S.elements, conduits: E.S.conduits, shapes: E.S.shapes }));
  var d2 = primeDoc(R60, { poi: off(SITE, 85, -55) });
  ok(d2.prime.layout.hash !== d.prime.layout.hash, 'a new layout in Prime');
  d2.prime.builtAt = 1760000000000; d2.prime.builtHash = d.prime.layout.hash;
  d2.elements = saved.elements; d2.conduits = saved.conduits; d2.shapes = saved.shapes;
  var E2 = editor({ from: false });
  E2.load(d2);
  eq(E2.H.onRendered({ detail: { id: 'p1', doc: d2 } }), 'built', 'reloaded: Site Map keeps what it built');
  eq(E2.H.nav().rebuild, 'changed', 'changed in Prime since it was drawn here: Rebuild is offered');
  eq(E2.H.rebuild(), 'scheduled');
  E2.flush();
  var svc = E2.S.elements.filter(function (e) { return e.primeRole === 'service'; });
  eq(svc.length, 1, 'one service point');
  eq(svc[0]._geoLat, d2.prime.layout.poi.lat); eq(svc[0]._geoLng, d2.prime.layout.poi.lng, 'where Prime has it now');
  eq(E2.S.primeBuild.hash, d2.prime.layout.hash, 'and the save records the new layout');
  eq(E2.H.nav().rebuild, null, 'drawn to match: nothing more to offer'); eq(E2.H.nav().why, 'current');
})();

/* ═══ 7 · one env object ════════════════════════════════════════════ */
(function () {
  var calls = [], S = { elements: [], conduits: [], shapes: [], bessList: [PP.bessEntry(R60)], pxPerFt: 2 }, n = 0, q = [];
  var later = function (f) { q.push(f); };
  var env = {
    S: S, catalog: {}, dims: null, mode: 'BTM', PP: PP, doc: null, console: null,
    search: function () { return '?id=p9'; }, later: later, now: function () { return 42; },
    evAdd: function (kind, x, y, label, spec, img, fp) { calls.push(['evAdd', kind, label, fp]); var el = { id: 'e' + (++n), type: 'evgear', evKind: kind, x: x, y: y, w: 1, h: 1 }; S.elements.push(el); return el; },
    autoWire: function (pts, type, label, a, z) { calls.push(['autoWire', type, label, a, z, pts.length]); var c = { id: 'c' + (++n), pts: pts, condType: type, fromId: a, toId: z }; S.conduits.push(c); return c; },
    applyRoute: function (c, m) { calls.push(['route', c.id, m]); },
    renderShape: function () {}, renderConduit: function () {}, reRenderEl: function () {},
    histBatch: function (f) { calls.push(['batch']); return f(); }, reproject: function () { calls.push(['reproject']); },
    liveMapState: function () { return { lat: SITE.lat, lng: SITE.lng, zoom: 20 }; }, canvasSize: function () { return { w: 100, h: 100 }; },
    latLngToPx: function (lat, lng) { return { x: (lng - SITE.lng) * 1e5, y: (SITE.lat - lat) * 1e5 }; },
    groundFt: function (g) { return PP.pathFt(g); }, uid: function () { return 'z' + (++n); },
    integrates: null, save: function () { calls.push(['save']); }, setSaved: function () {}, banner: function () {},
    openGuidedBuild: function () { calls.push(['guided']); }, markDirty: function () {}, replaceUrl: function () {}, href: function () { return 'https://x.test/?id=p9'; },
    projectId: function () { return 'p9'; }
  };
  var ctx = vm.createContext({ console: console, URL: URL, Date: Date, Math: Math, JSON: JSON });
  ctx.window = ctx;
  vm.runInContext(PROJECT, ctx); vm.runInContext(HANDOFF, ctx);
  var H = ctx.OmegaPrimeHandoff;
  H.configure({ env: env });
  var d = primeDoc(R60);
  eq(H.maybeBuild('p9', d), 'scheduled');
  while (q.length) q.shift()();
  deq(calls.map(function (c) { return c[0]; }), ['batch', 'evAdd', 'evAdd', 'evAdd', 'autoWire', 'autoWire', 'route', 'reproject', 'save'],
    'the env is the only way in: one batch, three gear, two runs, the route, reproject, save');
  deq(calls[1], ['evAdd', 'bess', 'BESS Assembly', { lf: 28, wf: 7.25 }], 'the unit with its true footprint');
  deq(calls[3], ['evAdd', 'service', 'Utility POI', { lf: 3, wf: 2.5 }]);
  deq(calls[5].slice(0, 6), ['autoWire', 'PVC-UG', 'Disco\u2192POI (service)', 'e3', 'e4', 3], 'the service run on three vertices');
  deq(calls[6].slice(2), ['trench-ground']);
  deq(S.primeBuild, { at: 42, hash: d.prime.layout.hash });
  eq(S.elements[0].bgbIncXfmr, true, 'without _bessIntegrates the entry\u2019s own flags decide');
})();

var E0NAV = editor().H.NAV_ID;
/* ═══ 8 · editor.html: the hooks and the scripts ════════════════════ */
(function () {
  /* saveProject: the two prime fields, in the UPDATE branch only, before the
     transaction write; cleared once the save lands */
  var save = block('async function saveProject(');
  var created = save.indexOf("const ref = await _db.collection('projects').add(payload);");
  var upd = save.indexOf('delete payload.orgId;'), hook = save.indexOf("payload['prime.builtAt']"), tx = save.indexOf('tx.update(_ref, payload)');
  ok(created > 0 && upd > created && hook > upd && tx > hook, 'the build marks ride the update branch, before the transaction write');
  var lit = save.slice(save.indexOf('const payload = {'), save.indexOf('_stripUndefinedInPlace(payload);'));
  ok(lit.length > 0 && !/\bprime\s*:/.test(lit) && !/S\.prime\b/.test(lit), 'the payload literal carries no prime map: prime.* is Prime\u2019s');
  deq((ED.match(/payload\['prime\.[A-Za-z]+'\]/g) || []).sort(), ["payload['prime.builtAt']", "payload['prime.builtHash']"], 'the editor writes exactly prime.builtAt and prime.builtHash, nowhere else');
  ok(/_setSaved\('saved'\);\s*\/\*[^*]*\*\/\s*if\(_primeBuild && S\.primeBuild===_primeBuild\) S\.primeBuild=null;/.test(save), 'S.primeBuild cleared after the save lands (only the build it carried)');
  var m = /(var _primeBuild=\(S\.primeBuild&&S\.primeBuild\.at\)\?S\.primeBuild:null; if\(_primeBuild\)\{[^}]*\})/.exec(save);
  ok(m, 'the save hook is one statement');
  function runHook(primeBuild) {
    var c = vm.createContext({ S: { primeBuild: primeBuild }, payload: { elements: [], savedBy: { tab: 't', at: 1 } }, String: String });
    vm.runInContext(m[1], c);
    return c.payload;
  }
  deq(Object.keys(runHook({ at: 7, hash: 'abc' })).sort(), ['elements', 'prime.builtAt', 'prime.builtHash', 'savedBy'], 'with a build pending: exactly the two fields added');
  deq(runHook({ at: 7, hash: 'abc' })['prime.builtAt'], 7); eq(runHook({ at: 7, hash: 'abc' })['prime.builtHash'], 'abc');
  deq(Object.keys(runHook(null)).sort(), ['elements', 'savedBy'], 'none pending: nothing added');
  deq(Object.keys(runHook({ hash: 'x' })).sort(), ['elements', 'savedBy'], 'a mark without a time: nothing added');
  ok(!/S\.prime\s*=/.test(save) && !/prime\.(?!builtAt|builtHash)\w+'\]/.test(save), 'the save never writes S.prime back');

  /* the title-bar mount the Omega Prime link is painted into: once, in
     #portal-nav beside the plan chip, hidden until painted */
  var pn = ED.slice(ED.indexOf('<div id="portal-nav">'), ED.indexOf('<!-- ============ TIER 1'));
  ok(pn.length > 0 && /<span id="omega-plan" hidden><\/span>\s*<!--[^]*?-->\s*<span id="omega-prime-nav" hidden><\/span>/.test(pn), 'the Omega Prime link\u2019s mount sits in the title bar beside the plan chip, hidden');
  eq((ED.match(/id="omega-prime-nav"/g) || []).length, 1, 'once');
  eq(E0NAV, 'omega-prime-nav', 'the id the hand-off paints');
  /* the zoom rescale sizes a unit with no released footprint from its marker, and reads nothing else of Prime's */
  var fpf = block('function _elFootprintFt(');
  ok(/if\(!\(lf>0\) && el\.primeFootprint==='none' && \+el\.primeMarkFt>0\)\{ lf=\+el\.primeMarkFt; wf=\+el\.primeMarkFt; \}/.test(fpf), '_elFootprintFt sizes a no-footprint unit from its marker, only where it has no lf');
  ok(fpf.indexOf('primeMarkFt') < fpf.indexOf('EVC_L2'), 'before any catalog fallback could give it a footprint');
  eq((ED.match(/primeMarkFt/g) || []).length, 3, 'the only place the editor reads it');

  /* _ppCollectFleet: the element path carries the key and the make */
  var fleet = block('function _ppCollectFleet(');
  ok(/var gCk=el\.catalogKey\|\|null;/.test(fleet) && /catalogKey:gCk, mfr:gMfr \}/.test(fleet), '_ppCollectFleet\u2019s element path carries catalogKey and mfr');

  /* the scripts, in order: the products, Prime's pure half, the hand-off */
  var at = function (f) { return ED.indexOf('<script src="' + f + '"></script>'); };
  var bp = at('/omega-bess-products.js'), pj = at('/omega-prime-project.js'), ho = at('/omega-prime-handoff.js');
  ok(bp > 0 && pj > bp && ho > pj, 'omega-bess-products.js, then omega-prime-project.js, then omega-prime-handoff.js');
  ok(/<script src="\/omega-prime-project\.js"><\/script>\s*<script src="\/omega-prime-handoff\.js"><\/script>/.test(ED), 'Prime\u2019s pure half loads right before the hand-off');
  eq((ED.match(/<script src="\/omega-prime-(?:project|handoff)\.js"><\/script>/g) || []).length, 2, 'each once');
  ok(ED.indexOf('<script src="/omega-prime-handoff.js"></script>') < ED.indexOf('async function _loadProject('), 'the listener is attached before any project loads');

  /* the hand-off itself: ES5, the notice, no price */
  var code = HANDOFF.replace(/\/\*[\s\S]*?\*\//g, '').replace(/'(?:\\.|[^'\\])*'/g, "''");
  ok(!/=>|`|\bconst\s|\blet\s|\bclass\s|\basync\s/.test(code), 'omega-prime-handoff.js is ES5');
  ok(/^\/\* © 2025–2026 ClearSky Energy Solutions LLC\. Proprietary and Confidential\. \*\//.test(HANDOFF), 'the notice');
  ok(!/eqcost|priceUsd|\$\s?\d/.test(code), 'no price in the hand-off');
  ok(!/setTimeout\(|\bS\.elements\.push|openBessGuidedBuild\(\)/.test(code.replace(/root\.setTimeout\(f, ms\)/, '')), 'every editor call goes through the env');
})();

/* ═══ 9 · the Omega Prime link in Site Map's title bar ══════════════
   Tommy, 2026-10-17: "when I open a project and it was made in Prime, I
   should be able to access what I had made in Prime". #omega-prime-nav
   carries the way back, the proposal's status, and Rebuild only while it
   can do something; never for a project not made in Prime. */
(function () {
  var E = editor(), d = primeDoc(R60);
  E.load(d); E.render('p1');
  ok(!E.nav.hidden && /Omega Prime/.test(E.nav.innerHTML), 'painted as soon as the project renders');
  eq(E.H.nav().why, 'busy'); ok(!/data-prime="rebuild"/.test(E.nav.innerHTML), 'no Rebuild while the build is on its way');
  E.flush();
  var n = E.H.nav();
  eq(n.prime, true); eq(n.href, '/omega-prime?id=p1'); eq(n.quote, null, 'no proposal yet: no status'); eq(n.rebuild, null); eq(n.why, 'current');
  ok(/^<a class="pn-back" data-prime="open" href="\/omega-prime\?id=p1" target="_blank" rel="noopener"[^>]*>Omega Prime<\/a>$/.test(E.nav.innerHTML),
    'the link back to what was made in Prime, in a new tab (the drawing on screen is never lost), and nothing else: ' + E.nav.innerHTML);
  /* one Cmd+Z empties the drawing: the key is let go, the link repaints with Rebuild */
  E.run('S.elements.length = 0; S.conduits.length = 0; S.shapes.length = 0;');
  E.key(); eq(E.queue.length, 1, 'repainted a beat after the key'); E.key(); eq(E.queue.length, 1, 'once');
  E.flush();
  eq(E.H.nav().rebuild, 'empty');
  ok(/<button type="button" class="pn-back" data-prime="rebuild" title="[^"]+">Rebuild from Omega Prime<\/button>$/.test(E.nav.innerHTML), 'Rebuild from Omega Prime is shown');
  ok(typeof E.btn.onclick === 'function', 'and wired to the hand-off');
  E.btn.onclick({ preventDefault: function () {} });
  ok(!/data-prime="rebuild"/.test(E.nav.innerHTML), 'pressed: it goes at once (no second build)');
  E.flush();
  eq(E.S.elements.length, 3, 'pressing it draws Prime’s layout again'); eq(E.calls.save, 2);
  ok(!/data-prime="rebuild"/.test(E.nav.innerHTML) && /Omega Prime/.test(E.nav.innerHTML), 'the build is back: the link stays, Rebuild does not');
  /* never over a drawing the rep made, a second tab, or a read-only plan */
  E.run("S.elements.length = 0; S.conduits.length = 0; S.shapes.length = 0; S.elements.push({ id: 'mine', type: 'eq', eqId: 'pad', x: 1, y: 2, w: 9, h: 9 });");
  eq(E.H.nav().why, 'drawing'); eq(E.H.nav().rebuild, null, 'the rep’s own drawing: never offered');
  E.run('S.elements.length = 0;');
  eq(E.H.nav().rebuild, 'empty');
  E.run('var _docTabs = [{}, {}];'); eq(E.H.nav().rebuild, null, 'nor with a second document tab'); E.run('_docTabs = [{}];');
  E.run("var OmegaCaps = { packageAccess: function () { return { packaged: true, readOnly: true }; } };");
  eq(E.H.nav().why, 'read-only'); eq(E.H.nav().rebuild, null, 'nor on a read-only plan: it could not be saved');
  E.run('OmegaCaps = undefined;');
  /* the proposal's status, to its Track step */
  E.run("S.prime.quote = { id: 'qt-1', quoteNo: 'ACME-Q-1', status: 'sent', rev: 1 };");
  E.H.paintNav();
  deq(E.H.nav().quote, { status: 'sent', label: 'Proposal sent', quoteNo: 'ACME-Q-1', href: '/omega-prime?id=p1&step=track&quote=qt-1' });
  ok(/<a class="pn-back" data-prime="proposal" href="\/omega-prime\?id=p1&amp;step=track&amp;quote=qt-1" target="_blank" rel="noopener" title="Proposal ACME-Q-1: where it and its order are, in Omega Prime">Proposal sent<\/a>/.test(E.nav.innerHTML),
    'Proposal sent, to Prime\u2019s Track step on that quote (the link projects.html and workspace.html give it)');
  E.run("S.prime.quote.id = 'qt/<x>';");
  eq(E.H.nav().quote.href, '/omega-prime?id=p1&step=track', 'a quote id that is not one is never put in the address');
  E.run("S.prime.quote.id = 'qt-1';");
  [['viewed', 'Proposal viewed'], ['approved', 'Proposal approved'], ['declined', 'Proposal declined'], ['withdrawn', 'Proposal withdrawn']].forEach(function (w) {
    E.run("S.prime.quote.status = '" + w[0] + "';"); eq(E.H.nav().quote.label, w[1]);
  });
})();
(function () {
  /* the build gave up (the satellite map never came live): the link offers
     Rebuild at once, so the rep can draw it once the map is there */
  var E = editor(), d = primeDoc(R60);
  E.H.configure({ tries: 2 });
  E.map(null);
  E.load(d); E.render('p1'); E.flush();
  eq(E.S.elements.length, 0, 'no live map: nothing built');
  eq(E.H.nav().why, 'empty'); ok(/data-prime="rebuild"/.test(E.nav.innerHTML), 'and Rebuild is painted as the attempt gives up, no key needed');
  E.map(SITE.lat, SITE.lng, 20);
  E.btn.onclick({}); E.flush();
  eq(E.S.elements.length, 3, 'with the map live, Rebuild draws it'); eq(E.calls.save, 1);
  ok(!/data-prime="rebuild"/.test(E.nav.innerHTML));
  E.H.configure({ tries: 24 });
})();
(function () {
  /* Prime placed no unit: the link, never Rebuild */
  var E = editor(), d = primeDoc(R60, { unitAt: null });
  E.load(d); E.render('p1'); E.flush();
  eq(E.H.nav().prime, true); eq(E.H.nav().why, 'no-unit'); eq(E.H.nav().rebuild, null, 'Prime placed no unit: nothing to rebuild');
  ok(/Omega Prime/.test(E.nav.innerHTML) && !/data-prime="rebuild"/.test(E.nav.innerHTML));
  /* a project not made in Prime: nothing painted, nothing scheduled */
  var E2 = editor({ from: false });
  E2.load({ name: 'x', elements: [], bessList: [] }); E2.render('p1'); E2.flush();
  eq(E2.H.nav().prime, false); eq(E2.nav.hidden, true); eq(E2.nav.innerHTML, '', 'never for a project not made in Prime');
  E2.key(); eq(E2.queue.length, 0, 'and no repaint is even scheduled');
  /* this tab opens a Prime project, then a plain one: the link goes with it */
  var E3 = editor();
  E3.load(primeDoc(R60)); E3.render('p1'); E3.flush();
  ok(!E3.nav.hidden);
  E3.load({ name: 'plain', elements: [], bessList: [] }); E3.render('p1');
  eq(E3.nav.hidden, true, 'S.prime resets on every load, and the link with it'); eq(E3.nav.innerHTML, '');
})();

console.log('tprimetransfer: ' + count + ' assertions passed');
