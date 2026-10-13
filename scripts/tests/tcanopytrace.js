/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Solar — Canopy (Custom Shape) and Solar — Custom Area trace a NEW outline
   on every press, and build on that outline and nothing else.

   Why (Tommy, 2026-10-13: "when i do the custom solar canopy and i go to do
   it again it keeps generating on what we have and doesnt let me do another
   solar spot"): both tools went straight to building when any closed shape
   was already on the canvas, and picked the LARGEST — a traced building, the
   parcel, a compound fence. So once anything was drawn the second press
   never let a new spot be traced: it rebuilt over the building. The two
   script blocks are cut straight out of editor.html and run on a stand-in
   drawing. */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const SRC = fs.readFileSync(process.env.EDITOR_SRC || path.join(__dirname, '..', '..', 'editor.html'), 'utf8');

function block(marker) {
  const hits = [];
  for (let k = SRC.indexOf(marker); k >= 0; k = SRC.indexOf(marker, k + 1)) hits.push(k);
  if (hits.length !== 1) throw new Error(marker + ' appears ' + hits.length + ' times');
  const a = SRC.indexOf('<script>', hits[0]) + '<script>'.length, b = SRC.indexOf('</script>', a);
  return SRC.slice(a, b);
}
const CANOPY = block('<!-- ================= CANOPY FROM A TRACED SHAPE');
const AREA = block('<!-- ================= SOLAR: CUSTOM AREA');
function fn(name) {
  const k = SRC.indexOf('function ' + name + '('); if (k < 0) throw new Error(name);
  let i = SRC.indexOf('{', k), d = 0;
  for (;; i++) { if (SRC[i] === '{') d++; else if (SRC[i] === '}') { d--; if (!d) break; } }
  return SRC.slice(k, i + 1);
}
const AL_GENERATE = fn('alGenerate'), SHAPE_BBOX = fn('_shapeBBox');
/* the field lock's rule and its capture-phase guard, cut out of their closure */
function braces(needle) {
  const k = SRC.indexOf(needle); if (k < 0) throw new Error(needle);
  let i = SRC.indexOf('{', k), d = 0;
  for (;; i++) { if (SRC[i] === '{') d++; else if (SRC[i] === '}') { d--; if (!d) break; } }
  return SRC.slice(k, i + 1);
}
const IS_PLACED = braces('function isPlaced(sh)'), GUARD = braces('var guard = function (e)');
/* the one line of openAutoLayout that takes a handed outline */
const OPEN_AL = SRC.indexOf('function openAutoLayout(boundaryPts){') >= 0
  ? SRC.slice(SRC.indexOf('function openAutoLayout(boundaryPts){'), SRC.indexOf('var host=document.getElementById(\'autolayout-modal\');'))
  : 'function openAutoLayout(){ var boundary=_alFindBoundary(); ';   /* the editor before it took an outline */

let all = true;
function chk(l, ok, x = '') { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`); if (!ok) all = false; return ok; }
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ── a stand-in drawing ──────────────────────────────────────────────── */
function world() {
  let n = 0;
  const S = { shapes: [], mode: 'select', shapeDrawing: false, pxPerFt: 10 };
  const log = { modes: [], built: [], banners: [], layouts: [] };
  const ctx = {
    S, window: null, console,
    document: { querySelector() { return null; }, getElementById() { return null; } },
    setInterval, clearInterval, setTimeout,
    setMode(m) { log.modes.push(m); S.mode = m; },
    selectShape(id) { log.selected = id; },
    showBanner(k, t) { log.banners.push(t); },
    _alPolyAreaPx(pts) { let a = 0; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j].x + pts[i].x) * (pts[j].y - pts[i].y); return a / 2; },
    _derScaled() { return true; },
    computeGroundLayout(o) { return { tableCount: 4, kw: 40, boundary: o.boundary }; },
    applyGroundLayout(boundary, layout) {
      const sh = { id: 'arr' + (++n), kind: 'dersolar', pts: boundary.slice(), mount: 'ground' };
      S.shapes.push(sh); log.built.push(boundary);
      return sh;   /* as the editor's does */
    },
    renderShape() {}, updShapeCount() {}, pushHist() {},
    _alFindBoundary() { log.layouts.push('guessed'); return null; },
    uid() { return 'sh' + (++n); },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  /* the editor's own openAutoLayout up to where it starts drawing a modal */
  vm.runInContext(OPEN_AL + ' window._alBoundary=boundary; log.layouts.push(boundary); }', Object.assign(ctx, { log }));
  vm.runInContext(CANOPY, ctx);
  vm.runInContext(AREA, ctx);
  vm.runInContext(AL_GENERATE + '\n' + SHAPE_BBOX, ctx);
  /* finishPolyline as the editor does it: the traced points become a shape */
  ctx.trace = pts => { S.shapeDrawing = true; S.shapeDrawing = false; const sh = { id: ctx.uid(), kind: 'polyline', pts }; S.shapes.push(sh); return sh; };
  return { S, ctx, log };
}
const sq = (x, y, w) => [{ x, y }, { x: x + w, y }, { x: x + w, y: y + w }, { x, y: y + w }];

(async () => {
  console.log('tcanopytrace');

  /* 1. a building already traced: the press traces, never builds on it */
  {
    const { S, ctx, log } = world();
    S.shapes.push({ id: 'bldg', kind: 'polyline', pts: sq(0, 0, 500), _visArch: 'building' });
    S.shapes.push({ id: 'parcel', kind: 'polyline', pts: sq(-100, -100, 900), omegaRole: 'boundary' });
    S.shapes.push({ id: 'fence', kind: 'polyline', pts: sq(600, 0, 200), omegaFence: true, omegaCampus: 'bess' });
    ctx.omegaCanopyCustom();
    chk('canopy: the press arms the polyline', log.modes[0] === 'polyline' && log.built.length === 0);
    await sleep(450);
    chk('canopy: nothing is built on the building, the parcel or a fence', log.built.length === 0);
    const first = ctx.trace(sq(1000, 1000, 100));
    await sleep(700);
    chk('canopy: the traced outline is the canopy', log.built.length === 1 && log.built[0][0].x === 1000);
    chk('canopy: the outline is consumed, the building stays', S.shapes.indexOf(first) < 0 && S.shapes.some(s => s.id === 'bldg'));
    const made = S.shapes.filter(s => s.kind === 'dersolar')[0];
    chk('canopy: mount adjacent, canopy flag', made && made.mount === 'adjacent' && made.canopy === true);
    chk('canopy: built, the page is back in Select with the canopy selected', S.mode === 'select' && log.selected === made.id, 'mode=' + S.mode + ' selected=' + log.selected + ' made=' + (made && made.id));

    /* 2. the second press: a second spot, not the first again */
    ctx.omegaCanopyCustom();
    await sleep(450);
    chk('canopy: a second press builds nothing until a new outline lands', log.built.length === 1);
    ctx.trace(sq(2000, 2000, 100));
    await sleep(700);
    chk('canopy: the second outline is a second canopy', log.built.length === 2 && log.built[1][0].x === 2000);
    chk('canopy: both canopies stay', S.shapes.filter(s => s.kind === 'dersolar').length === 2);
  }

  /* 3. ESC ends the watch: a polyline traced later for something else is not a canopy */
  {
    const { S, ctx, log } = world();
    ctx.omegaCanopyCustom();
    S.mode = 'select';
    await sleep(450);
    ctx.trace(sq(0, 0, 100));
    await sleep(700);
    chk('canopy: a cancelled trace builds nothing later', log.built.length === 0);
  }

  /* 4. fromShape with no shape: the largest PLAIN outline, never a structure */
  {
    const { S, ctx, log } = world();
    S.shapes.push({ id: 'bldg', kind: 'polyline', pts: sq(0, 0, 500), _visArch: 'building' });
    chk('fromShape: no plain outline → nothing built', ctx.omegaCanopyFromShape() === null && log.built.length === 0);
    S.shapes.push({ id: 'p', kind: 'polyline', pts: sq(900, 900, 50) });
    chk('fromShape: the plain outline, not the bigger building', !!ctx.omegaCanopyFromShape() && log.built[0][0].x === 900);
  }

  /* 5. Solar — Custom Area: the same rule, laid out through Auto Layout on THAT outline */
  {
    const { S, ctx, log } = world();
    S.shapes.push({ id: 'bldg', kind: 'polyline', pts: sq(0, 0, 500), _visArch: 'building' });
    ctx.omegaSolarCustomArea();
    chk('area: the press arms the polyline, opens no layout', log.modes[0] === 'polyline' && log.layouts.length === 0);
    await sleep(450);
    chk('area: nothing opens on the building', log.layouts.length === 0);
    ctx.trace(sq(3000, 3000, 100));
    await sleep(700);
    chk('area: Auto Layout opens on the traced outline, not the largest', log.layouts.length === 1 && Array.isArray(log.layouts[0]) && log.layouts[0][0].x === 3000);
    ctx.omegaSolarCustomArea();
    ctx.trace(sq(4000, 4000, 100));
    await sleep(700);
    chk('area: a second press lays out the second outline', log.layouts.length === 2 && log.layouts[1][0].x === 4000);
  }

  /* 6. Custom Area's Generate lands the array selected, in Select mode */
  {
    const { S, ctx, log } = world();
    S.mode = 'polyline';
    ctx._alBoundary = sq(0, 0, 400); ctx._alLayout = { tableCount: 4, kw: 40 }; ctx._alExclusions = [];
    ctx.alGenerate();
    const arr = S.shapes.filter(s => s.kind === 'dersolar')[0];
    chk('area: Generate builds one array, back in Select, selected', !!arr && S.mode === 'select' && log.selected === arr.id);
  }
  /* 7. a selected array frames its real box (it used to be a 1x1 box at the corner) */
  {
    const { ctx } = world();
    ctx._derScale = () => 10;
    const b = ctx._shapeBBox({ kind: 'dersolar', autoLayout: true, pts: [{ x: 10, y: 20 }], wPx: 300, hPx: 200 });
    chk('bbox: an auto-layout array is its wPx x hPx box from pts[0]', b.x === 10 && b.y === 20 && b.w === 300 && b.h === 200);
    const d = ctx._shapeBBox({ kind: 'derdc', pts: [{ x: 100, y: 100 }], lf: 20, wf: 8 });
    chk('bbox: a compute unit is centred on its point at lf x wf feet', d.x === 0 && d.y === 60 && d.w === 200 && d.h === 80);
  }

  /* 8. the field lock: a locked canopy still SELECTS on a press (so its delete X
        comes up), the drag never starts, and nothing else changes */
  {
    const S = { mode: 'select', shapes: [{ id: 'c1', kind: 'dersolar', autoLayout: true }, { id: 'p1', kind: 'polyline' }, { id: 'u1', kind: 'derdc', omegaCompute: true }] };
    const log = { selected: [], stopped: 0 };
    const ctx = { S, Date, selectShape(id) { log.selected.push(id); }, console };
    vm.createContext(ctx);
    vm.runInContext(IS_PLACED + '\nvar locked = true; var lastSelect = { id: null, at: 0 };\n' + GUARD + ';', ctx);
    const press = (id, type) => ctx.guard({ type, target: { closest: () => ({ getAttribute: () => id }) }, stopPropagation() { log.stopped++; }, preventDefault() {} });
    ['pointerdown', 'mousedown', 'touchstart'].forEach(t => press('c1', t));
    chk('lock: a press on a locked canopy is swallowed (no drag) and selects it once', log.stopped === 3 && log.selected.join(',') === 'c1');
    press('u1', 'mousedown');
    chk('lock: a locked compute unit selects the same way', log.selected.join(',') === 'c1,u1');
    log.stopped = 0; press('p1', 'mousedown');
    chk('lock: a plain traced outline is not the lock\'s business', log.stopped === 0 && log.selected.length === 2);
    S.mode = 'polyline'; log.stopped = 0; press('c1', 'mousedown');
    chk('lock: outside Select mode the press is swallowed and nothing is selected', log.stopped === 1 && log.selected.length === 2);
  }

  console.log(all ? 'tcanopytrace: all passed' : 'tcanopytrace: FAILED');
  process.exit(all ? 0 : 1);
})();
