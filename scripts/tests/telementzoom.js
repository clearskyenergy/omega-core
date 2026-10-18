#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Placed equipment keeps its true footprint through a zoom (found by the
   Omega Prime transfer, clearskyenergy/omega-core#354: the rescale "was
   called 0 times"). omegaRescaleElements (editor.html, ELEMENT ZOOM SCALING)
   was a wrapper on window._geoReprojectAll, and the anchor engine's
   standDown() replaces that chain at boot, so it never ran; OmegaGeo sized
   gear instead, from a ground size it read off the pixels, on a 22 px floor.

   Held here, from the editor's own code:
     1 · the size is the footprint in feet x pxPerFt, about the centre, on
         the floor the unit was placed with: _evAdd's (28 x 20, 14 x 12),
         Omega Prime's 4 px, Insert's 22 x 10 (OmegaInsert.floorPx), else
         10 x 8; a selected unit keeps its outline when redrawn
     2 · equipment with no footprint, and anything not equipment, is not
         this rescale's; omegaElementFootprint, which OmegaGeo asks, gives
         the same answer as the rescale's own test, element for element
     3 · once per animation frame (omegaRescaleElementsOnce); a document
         that is not painting runs it at most every 250 ms
     4 · the wiring: the anchor engine's run() is the one caller, no
         wrapper on the reprojection chain carries it, OmegaGeo leaves owned
         equipment to it, and a width typed in the properties panel is
         recorded in feet as the drag-resize path records it

   The same, in Chromium, through real zooms of the real editor:
   scripts/render-element-zoom.js (npm run check:element-zoom).

     node scripts/tests/telementzoom.js */
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var ROOT = path.join(__dirname, '..', '..');
var ED = fs.readFileSync(path.join(ROOT, 'editor.html'), 'utf8');
var pass = 0, fail = 0;
function ok(c, l, x) { if (c) pass++; else { fail++; console.error('  FAIL  ' + l + (x != null ? '\n        ' + x : '')); } }
function eq(got, want, l) { ok(got === want, l, 'got ' + JSON.stringify(got) + ', want ' + JSON.stringify(want)); }

/* One balanced block from a needle that occurs exactly once, skipping
   strings and comments. */
function block(src, needle, open, close) {
  var at = src.indexOf(needle);
  if (at < 0) throw new Error('not in editor.html: ' + needle);
  if (src.indexOf(needle, at + 1) >= 0) throw new Error('more than one in editor.html: ' + needle);
  open = open || '{'; close = close || '}';
  var i = src.indexOf(open, at), d = 0, q = null;
  for (; i < src.length; i++) {
    var ch = src[i];
    if (q) { if (ch === '\\') { i++; continue; } if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'" || ch === '`') { q = ch; continue; }
    if (ch === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i + 2) + 1; continue; }
    if (ch === '/' && src[i + 1] === '/') { i = src.indexOf('\n', i); continue; }
    if (ch === open) d++;
    else if (ch === close) { d--; if (!d) return src.slice(at, i + 1); }
  }
  throw new Error('unbalanced: ' + needle);
}
var CODE = [
  block(ED, 'function _elRenderSize(el){'), block(ED, 'function _elRenderCenter(el){'),
  block(ED, 'function _elFootprintFt(el){'), block(ED, 'function omegaRescaleElements(){'),
  block(ED, 'function omegaElementFootprint(el){'),
  'var _elScaleFrame = { ran:false, at:0, armed:false };', block(ED, 'function omegaRescaleElementsOnce(){')
].join('\n') + '\nwindow.omegaRescaleElements = omegaRescaleElements;';
ok(ED.indexOf('var _elScaleFrame = { ran:false, at:0, armed:false };') >= 0, 'the frame record is in editor.html as cut here');

/* a fresh editor in a VM: S, the painter, the selection, a clock and an
   animation-frame queue the test runs by hand */
function editor(opts) {
  opts = opts || {};
  var frames = [], clock = { now: 0 }, rendered = [], nodes = {};
  var win = {
    performance: { now: function () { return clock.now; } },
    requestAnimationFrame: opts.noRaf ? undefined : function (f) { frames.push(f); return frames.length; },
    OmegaInsert: opts.insert === false ? undefined : { floorPx: { w: 22, h: 10 } }
  };
  var doc = { querySelector: function (s) { var m = /data-elid="([^"]+)"/.exec(s); return m ? (nodes[m[1]] || null) : null; } };
  var ctx = vm.createContext({ window: win, document: doc, S: { pxPerFt: opts.ppf || 2.742, elements: [], sel: null }, Math: Math, JSON: JSON,
    setTimeout: function (f) { frames.push(f); return frames.length; },
    renderEl: function (el) { rendered.push(el.id); var cl = {}; nodes[el.id] = { classList: { add: function (c) { cl[c] = 1; }, contains: function (c) { return !!cl[c]; } } }; } });
  vm.runInContext(CODE, ctx);
  return {
    S: ctx.S, rendered: rendered, nodes: nodes, clock: clock,
    frame: function () { var f = frames.splice(0); f.forEach(function (fn) { fn(); }); return f.length; },
    run: function (expr) { return vm.runInContext(expr, ctx); }
  };
}
function evgear(id, lf, wf, minW, minH, x, y) {
  return { id: id, type: 'evgear', evKind: 'xfmr', x: x || 0, y: y || 0, w: minW, h: minH, lf: lf, wf: wf, minW: minW, minH: minH };
}

/* ═══ 1 · footprint x scale, on the floor it was placed with ═════════ */
var E = editor({ ppf: 5.484 });                     /* zoom 21 at Chicago */
E.S.elements.push(evgear('bess', 8, 4, 28, 20, 100, 100));          /* _evAdd: 22 x 11 px at zoom 20, held at 28 x 20 */
E.S.elements.push(evgear('disco', 2, 1.4, 14, 12, 300, 100));       /* _evAdd's small floor */
E.S.elements.push(evgear('prime', 6, 4, 4, 4, 500, 100));           /* Prime: true scale on 4 px */
E.S.elements.push({ id: 'meter', type: 'eq', eqId: 'meter', x: 700, y: 100, w: 22, h: 10, lf: 2, wf: 1 });      /* Insert: no floor recorded */
E.S.elements.push({ id: 'pcs', type: 'eq', eqId: 'pcs', x: 800, y: 100, w: 33, h: 22, lf: 12, wf: 8 });          /* Insert, dropped at zoom 20 */
E.S.elements.push({ id: 'old', type: 'evgear', evKind: 'charger', x: 900, y: 100, w: 20, h: 20, lf: 2.9, wf: 3.1 }); /* no floor recorded */
var c0 = E.run('_elRenderCenter(S.elements[0])');
var n = E.run('omegaRescaleElements()');
var el = function (id) { return E.S.elements.filter(function (e) { return e.id === id; })[0]; };
eq(el('bess').w + 'x' + el('bess').h, '44x22', 'a BESS 8 x 4 ft at 5.484 px/ft is 44 x 22, above its 28 x 20 floor');
var c1 = E.run('_elRenderCenter(S.elements[0])');
ok(Math.abs(c1.x - c0.x) < 1e-9 && Math.abs(c1.y - c0.y) < 1e-9, 'grown about its centre: the ground point never moves', JSON.stringify([c0, c1]));
eq(el('disco').w + 'x' + el('disco').h, '14x12', 'a disconnect 2 x 1.4 ft is 11 x 8 at this scale, held at the 14 x 12 it was placed with');
eq(el('prime').w + 'x' + el('prime').h, '33x22', 'Prime’s transformer is its 6 x 4 ft, true scale');
eq(el('meter').w + 'x' + el('meter').h, '22x10', 'an Insert meter keeps the 22 x 10 px Insert dropped it at (OmegaInsert.floorPx)');
eq(el('pcs').w + 'x' + el('pcs').h, '66x44', 'an Insert PCS skid is its 12 x 8 ft, true scale');
eq(el('old').w + 'x' + el('old').h, '16x17', 'a unit with no recorded floor is its footprint (the 10 x 8 default is under it)');
eq(n, 4, 'four redrawn; the disconnect and the meter were already at their floors');
eq(E.rendered.join(','), 'bess,prime,pcs,old', 'each redrawn once');
eq(E.run('omegaRescaleElements()'), 0, 'a second pass at the same scale changes nothing');
E.S.pxPerFt = 0.6855;                                /* zoom 18 */
E.run('omegaRescaleElements()');
eq(el('bess').w + 'x' + el('bess').h, '28x20', 'zoomed out, the BESS is held at its placement floor');
eq(el('prime').w + 'x' + el('prime').h, '4x4', 'Prime’s transformer at its 4 px floor: never the 22 px OmegaGeo held gear at');
eq(el('old').w + 'x' + el('old').h, '10x8', 'the default floor is 10 x 8');
E.S.pxPerFt = 21.936;                                /* zoom 23: 2 ft is 44 px */
E.run('omegaRescaleElements()');
eq(el('meter').w + 'x' + el('meter').h, '44x22', 'an Insert meter is true to scale once its footprint clears the floor');
var F = editor({ ppf: 5.484, insert: false });
F.S.elements.push({ id: 'm', type: 'eq', eqId: 'meter', x: 0, y: 0, w: 22, h: 10, lf: 2, wf: 1 });
F.run('omegaRescaleElements()');
eq(F.S.elements[0].w + 'x' + F.S.elements[0].h, '11x8', 'without OmegaInsert an Insert item falls to the default floor');
/* the selected unit keeps its outline */
var Sel = editor({ ppf: 5.484 });
Sel.S.elements.push(evgear('x', 6, 4, 28, 20, 0, 0)); Sel.S.sel = 'x';
Sel.run('omegaRescaleElements()');
ok(Sel.nodes.x && Sel.nodes.x.classList.contains('sel'), 'the selected unit is redrawn with its outline (selEl’s class put back)');

/* ═══ 2 · only equipment with a footprint ════════════════════════════ */
var O = editor();
eq(O.run('omegaElementFootprint({ type:"text", w:100, lf:5 })'), null, 'a text note is not equipment');
eq(O.run('omegaElementFootprint({ type:"evgear", w:30 })'), null, 'a unit with no footprint stays OmegaGeo’s');
eq(O.run('omegaElementFootprint({ type:"bess-asm", w:400 })'), null, 'so does an assembly with none');
eq(JSON.stringify(O.run('omegaElementFootprint({ type:"evgear", lf:2.9, wf:3.1 })')), JSON.stringify({ lf: 2.9, wf: 3.1 }), 'a guided-build unit is');
eq(JSON.stringify(O.run('omegaElementFootprint({ type:"eq", eqId:"meter", lf:2, wf:1 })')), JSON.stringify({ lf: 2, wf: 1 }), 'an Insert item with its footprint is');
O.S.elements.push({ id: 't', type: 'text', x: 0, y: 0, w: 100, lf: 5, wf: 5 }, { id: 'n', type: 'evgear', x: 0, y: 0, w: 30, h: 22 });
eq(O.run('omegaRescaleElements()'), 0, 'neither is resized');
eq(O.S.elements[0].w + '/' + O.S.elements[1].w, '100/30', 'and both keep their pixels');
/* OmegaGeo's question and the rescale's own test: one answer for every kind */
var A = editor({ ppf: 5.484 }), kinds = [];
['eq', 'evgear', 'bess-asm', 'text', 'callout', 'logo', 'dimension', 'meter'].forEach(function (t, i) {
  [{ lf: 4, wf: 3 }, {}, { catalogId: 'nope' }].forEach(function (extra, j) {
    var e = { id: t + j, type: t, x: 0, y: 0, w: 999, h: 999, minW: 4, minH: 4 };
    Object.keys(extra).forEach(function (k) { e[k] = extra[k]; });
    A.S.elements.push(e); kinds.push(e.id);
  });
});
var claims = {}; kinds.forEach(function (id, i) { claims[id] = A.run('omegaElementFootprint(S.elements[' + i + ']) != null'); });
A.run('omegaRescaleElements()');
var disagree = kinds.filter(function (id, i) { return claims[id] !== (A.S.elements[i].w !== 999); });
eq(disagree.join(','), '', 'what omegaElementFootprint claims is exactly what the rescale resizes');
eq(kinds.filter(function (id) { return claims[id]; }).join(','), 'eq0,evgear0,bess-asm0', 'equipment with a footprint, and nothing else');

/* ═══ 3 · once per animation frame ═══════════════════════════════════ */
var R = editor({ ppf: 2.742 });
R.S.elements.push(evgear('a', 8, 4, 4, 4, 0, 0));
R.run('(function(){ var o = window.omegaRescaleElements; window.omegaRescaleElements = function(){ window.__runs = (window.__runs||0) + 1; return o.apply(this, arguments); }; })()');
function count() { return R.run('window.__runs || 0'); }
R.run('omegaRescaleElementsOnce(); omegaRescaleElementsOnce(); omegaRescaleElementsOnce();');
eq(count(), 1, 'three passes in one frame (an idle) run it once');
eq(R.frame(), 1, 'one frame callback armed, however many passes');
R.run('omegaRescaleElementsOnce()');
eq(count(), 2, 'the next frame runs it again');
R.S.pxPerFt = 1.371; R.run('omegaRescaleElementsOnce()');
eq(count(), 2, 'a new scale in the same frame waits for the next frame (the zoom’s bounds_changed pass, one frame on)');
R.frame(); R.run('omegaRescaleElementsOnce()');
eq(count(), 3, 'and is sized on it');
eq(R.S.elements[0].w + 'x' + R.S.elements[0].h, '11x5', 'at the new scale');
var Q = editor({ noRaf: true });
Q.S.elements.push(evgear('a', 8, 4, 4, 4, 0, 0));
Q.run('(function(){ var o = window.omegaRescaleElements; window.omegaRescaleElements = function(){ window.__runs = (window.__runs||0) + 1; return o.apply(this, arguments); }; })()');
Q.clock.now = 1000; Q.run('omegaRescaleElementsOnce()'); Q.clock.now = 1100; Q.run('omegaRescaleElementsOnce()');
eq(Q.run('window.__runs'), 1, 'a document that is not painting: once within 250 ms');
Q.clock.now = 1300; Q.run('omegaRescaleElementsOnce()');
eq(Q.run('window.__runs'), 2, 'and again after, never stuck');

/* ═══ 4 · the wiring ═════════════════════════════════════════════════ */
var anchorAt = ED.indexOf('<!-- ================= UNIFIED ANCHORING =================');
ok(anchorAt > 0, 'the unified anchoring block is in editor.html');
var anchor = ED.slice(anchorAt, ED.indexOf('</script>', anchorAt));
var run = block(anchor, '  function run(){');
eq((run.match(/omegaRescaleElementsOnce\(\)/g) || []).length, 1, 'the anchor engine’s run() sizes equipment, once');
ok(run.indexOf('omegaRescaleElementsOnce') > run.indexOf('_dcfcRenderTrenches') && run.indexOf('omegaRescaleElementsOnce') < run.indexOf('dedupeElements()'), 'after every element is on its anchor, before the dedupe');
var standDown = block(anchor, '  function standDown(){');
ok(/window\._geoReprojectAll=function\(\)\{ return run\(\); \};/.test(standDown), 'standDown still hands the chain to run(), which now sizes as well as places');
var callers = ED.split('\n').filter(function (l) { return /omegaRescaleElementsOnce\(\)/.test(l) && !/function omegaRescaleElementsOnce/.test(l) && !/typeof omegaRescaleElementsOnce/.test(l); });
eq(callers.length, 1, 'nothing else calls it: ' + callers.map(function (l) { return l.trim().slice(0, 80); }).join(' | '));
var direct = ED.split('\n').filter(function (l) { return /omegaRescaleElements\(\)/.test(l) && !/function omegaRescaleElements\(/.test(l); });
eq(direct.length, 1, 'and the rescale itself is called only through it: ' + direct.map(function (l) { return l.trim().slice(0, 80); }).join(' | '));
ok(ED.indexOf('__omegaElScale') < 0, 'no wrapper on the reprojection chain carries the rescale (standDown discarded the last one)');
var geoAt = ED.indexOf('<!-- ================= EAGER GEO-ANCHORING =================');
var geo = ED.slice(geoAt, ED.indexOf('</script>', geoAt));
['function stampSizes(){', 'function rescale(){', 'function syncDom(){'].forEach(function (f) {
  ok(/owned\(el\)/.test(block(geo, '  ' + f)), 'OmegaGeo’s ' + f.replace('function ', '').replace('{', '') + ' leaves owned equipment to the footprint');
});
ok(/window\.omegaElementFootprint\(el\)/.test(block(geo, '  function owned(el){')), 'by asking omegaElementFootprint, the one rule');
var stamp = block(geo, '  function stampSizes(){');
ok(/el\._geoWFt=fp\.lf; el\._geoHFt=fp\.wf;/.test(stamp), 'and stamps its footprint as its ground size (the takeoff and the GeoJSON export read it)');
var up = block(ED, 'function uP(k,v){');
ok(/el\.lf = el\.w\/S\.pxPerFt; el\.wf = _uh\/S\.pxPerFt;/.test(up), 'a width typed in the properties panel is recorded in feet, as the drag-resize path records it');
var insAt = ED.indexOf("  var TAG = '[omega/insert]';");
var ins = ED.slice(insAt, ED.indexOf('})();', insAt));
ok(/var MIN_W = 22, MIN_H = 10;/.test(ins) && /floorPx: \{ w: MIN_W, h: MIN_H \}/.test(ins), 'Insert says what it drops at: 22 x 10 px, OmegaInsert.floorPx');
ok(/Math\.max\(MIN_W, Math\.round\(f\.lf \* p\)\)/.test(block(ins, '  function hookDropW() {')), 'and drops at it');

console.log('telementzoom: ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
