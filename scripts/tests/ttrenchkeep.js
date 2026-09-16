/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Trench runs survive the things that used to erase them, and a row of
   chargers draws one trench instead of a fan.

   Why (Thomas, 30 Mass Ave, 2026-09-15): chargers clicked past the end of a
   short branch run all landed on its last vertex, and dragging them apart
   drew four diagonals from the panel; starting a second guided build emptied
   S._trenches, so every trench band on the map vanished while the conduits
   stayed; Esc removed the whole trench layer; and the legend billed one drawn
   run once per charger laid in it. The functions are grabbed straight out of
   editor.html, the same way tundoleg.js does it. */
'use strict';
const fs = require('fs'), path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'editor.html'), 'utf8');

function bodyFrom(needle) {
  const hits = [];
  for (let k = SRC.indexOf(needle); k >= 0; k = SRC.indexOf(needle, k + 1)) hits.push(k);
  if (hits.length !== 1) throw new Error(needle + ' appears ' + hits.length + ' times');
  let k = SRC.indexOf('{', hits[0]), d = 0;
  for (;; k++) { if (SRC[k] === '{') d++; else if (SRC[k] === '}') { d--; if (!d) break; } }
  return SRC.slice(hits[0], k + 1);
}
const grabFn = name => bodyFrom('function ' + name + '(');
const grabAssign = name => bodyFrom(name + '=function(');

function chk(l, ok, x = '') { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`); if (!ok) all = false; return ok; }
let all = true;
const near = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;

/* ── the editor globals the grabbed code touches ─────────────────────── */
global.window = global;
const calls = { render: 0, guide: 0, prompt: 0, mode: null, conduitRenders: 0 };
global.document = {
  getElementById() { return null; },
  querySelector() { return null; },
  querySelectorAll() { return []; },
};
global.console.info = () => {};
global.S = { pxPerFt: null, conduits: [], elements: [], _trenches: [], _trench: null, mode: 'select' };
global.DCFC = { chargers: 2, active: false, placed: {}, chargerEls: [] };
global.uid = (() => { let n = 0; return () => 'id' + (++n); })();
global._dcfcSyncPorts = () => {};
global._dcfcGuideRender = () => { calls.guide++; };
global._dcfcPrompt = () => { calls.prompt++; };
global._dcfcGuideHide = () => {};
global._dcfcRenderTrenches = () => { calls.render++; };
global.setMode = m => { calls.mode = m; S.mode = m; };
global.showBanner = () => {};
global._geoStampAll = () => {};
global.pushHist = () => {};
global._geoRestampOne = () => {};
global.renderConduit = () => { calls.conduitRenders++; };
global.updCondStat = () => {};
global._evBanner = () => {};
global._buildCorridors = () => global.__groups;
global.__groups = [];
global._dcfcDraw = null;

/* load the functions under test */
(0, eval)(grabFn('_dcfcNearestOnPoly'));
(0, eval)(grabFn('_polyLen'));
(0, eval)(grabFn('_dcfcPathBack'));
(0, eval)(grabFn('_dcfcReanchorRun'));
(0, eval)(grabFn('_dcfcSnapOrExtend'));
(0, eval)(grabFn('trenchTotals'));
(0, eval)('var _dcfcStartPlacing; ' + grabAssign('_dcfcStartPlacing'));
(0, eval)('var _dcfcCancel; ' + grabAssign('_dcfcCancel'));
(0, eval)(grabFn('_dcfcFinishRun'));
(0, eval)(grabFn('updateAttached'));

console.log('\nsnap or extend');
{
  const run = { id: 'r', pts: [{ x: 0, y: 0 }, { x: 100, y: 0 }] };
  S._trenches = [run];
  const st = { _lastEnd: { x: 100, y: 0 }, _buildId: 'b1' };
  const beside = _dcfcSnapOrExtend(run, { x: 50, y: 8 }, st);
  chk('a click on the trench (within ~2 ft) snaps onto it', near(beside.x, 50) && near(beside.y, 0) && !beside.extended && !beside.spur && run.pts.length === 2);
  const nudge = _dcfcSnapOrExtend(run, { x: 104, y: 0 }, st);
  chk('a click a few px past the end still snaps to the end', near(nudge.x, 100) && !nudge.extended && run.pts.length === 2);
  const past = _dcfcSnapOrExtend(run, { x: 160, y: 30 }, st);
  chk('a click well past the end extends the run to the click', !!past.extended && run.pts.length === 3 && near(past.x, 160) && near(past.y, 30) && past.seg === 2, JSON.stringify(run.pts));
  chk('the build chains its next run from the new end', st._lastEnd.x === 160 && st._lastEnd.y === 30);
  chk('the trench layer was redrawn', calls.render > 0);
  /* off the trench: a spur from the nearest point, the device stays put */
  const off = _dcfcSnapOrExtend(run, { x: 50, y: 60 }, st);
  chk('a click off the trench starts a spur from the nearest point', !!off.spur && near(off.x, 50) && near(off.y, 60) && off.run && off.run.spurOf === 'r' && off.run.spurSeg === 1, JSON.stringify(off));
  chk('the spur is a run in its own right, tapping the parent at the right distance', S._trenches.length === 2 && near(off.run.pts[0].x, 50) && near(off.run.pts[0].y, 0) && near(off.run.spurTapFt, 50 / 6, 0.1));
  const back = _dcfcPathBack(off.run, 1).map(p => p.x + ',' + p.y).join(' ');
  chk('a leg on the spur walks the spur, then the parent, back to the start', back === '50,0 0,0', back);
  const onSpur = _dcfcSnapOrExtend(run, { x: 52, y: 30 }, st);
  chk('the next click near the spur lands on the spur, not the parent', !onSpur.spur && !onSpur.extended && onSpur.run === off.run && near(onSpur.x, 50), JSON.stringify(onSpur));
  const beyondSpur = _dcfcSnapOrExtend(run, { x: 50, y: 120 }, st);
  chk('a click past the spur\'s end extends the spur', !!beyondSpur.extended && beyondSpur.run === off.run && off.run.pts.length === 3 && st._lastEnd.x === 160, JSON.stringify(off.run.pts));
}

console.log('\ntrench totals');
{
  const shared = [];
  global.__groups = shared;
  S.conduits = [
    { id: 'a', route: 'trench', evRun: 'r1', ftLen: 10 },
    { id: 'b', route: 'trench', evRun: 'r1', ftLen: 30 },
    { id: 'c', route: 'trench', evRun: 'r1', ftLen: 50 },
    { id: 'd', route: 'trench', ftLen: 7 },
    { id: 'e', route: 'surface', ftLen: 99 },
  ];
  const t = trenchTotals();
  chk('legs sharing one drawn run count once, as the longest', near(t.ft, 57), String(t.ft));
  chk('a run carrying several legs is reported as a shared corridor', t.corridors === 1, String(t.corridors));
  chk('the corridor memo cache is not mutated', shared.length === 0);
  const t2 = trenchTotals();
  chk('a second call gives the same answer', near(t2.ft, 57) && t2.corridors === 1);
}

console.log('\nstarting a build keeps the runs already drawn');
{
  S._trenches = [
    { id: 'A', pts: [{ x: 0, y: 0 }, { x: 50, y: 0 }], build: 'old' },
    { id: 'B', pts: [{ x: 9, y: 9 }] },
  ];
  calls.render = 0;
  _dcfcStartPlacing();
  chk('the finished run stays, the one-point leftover goes', S._trenches.length === 1 && S._trenches[0].id === 'A');
  chk('the build gets its own id', typeof DCFC._buildId === 'string' && DCFC._buildId.length > 0);
  chk('the trench layer is redrawn rather than removed', calls.render === 1);
  chk('placement mode is armed', calls.mode === 'dcfcplace');
  const bid = DCFC._buildId;
  global._dcfcDraw = { pts: [{ x: 50, y: 0 }, { x: 120, y: 40 }], leg: 'branch' };
  DCFC._surface = 'soil';
  _dcfcFinishRun();
  chk('a run drawn by this build is tagged with its id', S._trenches.length === 2 && S._trenches[1].build === bid);
}

console.log('\ncancelling keeps what was placed');
{
  const bid = DCFC._buildId;
  S._trenches = [
    { id: 'A', pts: [{ x: 0, y: 0 }, { x: 50, y: 0 }], build: 'old' },
    { id: 'C', pts: [{ x: 50, y: 0 }, { x: 120, y: 40 }], build: bid },
    { id: 'D', pts: [{ x: 120, y: 40 }, { x: 200, y: 40 }], build: bid },
    { id: 'E', pts: [{ x: 0, y: 0 }, { x: 0, y: 90 }], build: 'other' },
  ];
  S.conduits = [{ id: 'k', evRun: 'C', route: 'trench', ftLen: 5 }];
  calls.render = 0;
  _dcfcCancel();
  const ids = S._trenches.map(t => t.id).join(',');
  chk('only this build\'s empty run is dropped', ids === 'A,C,E', ids);
  chk('the layer is redrawn from the model', calls.render === 1);
  chk('the build is off and the mode is select', DCFC.active === false && calls.mode === 'select');
}

console.log('\nmoving a charger leaves its trench where it was drawn');
{
  S._trenches = [{ id: 'r1', pts: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }] }];
  const c = { id: 'c1', evRun: 'r1', fromId: 'e1', route: 'trench', ftLen: 33.3, pxLen: 100,
              _geoPts: [{ lat: 1, lng: 1 }, { lat: 1, lng: 1 }, { lat: 1, lng: 1 }],
              pts: [{ x: 100, y: 0, elId: 'e1' }, { x: 100, y: 0 }, { x: 0, y: 0 }] };
  S.conduits = [c];
  global.getCenter = () => ({ x: 150, y: 40 });
  calls.conduitRenders = 0;
  updateAttached('e1');
  const p = c.pts.map(q => Math.round(q.x) + ',' + Math.round(q.y)).join(' ');
  chk('the leg does not follow the symbol: no lateral, no diagonal', p === '100,0 100,0 0,0', p);
  chk('its length is untouched', c.ftLen === 33.3 && c.pxLen === 100);
  chk('its ground anchor is untouched', c._geoPts.length === 3);
  chk('nothing was redrawn', calls.conduitRenders === 0);
  const plain = { id: 'c2', fromId: 'e2', pts: [{ x: 5, y: 5, elId: 'e2' }, { x: 9, y: 9 }] };
  S.conduits = [plain];
  global.getCenter = () => ({ x: 7, y: 7 });
  updateAttached('e2');
  chk('a run with no drawn trench still just follows its endpoint', plain.pts.length === 2 && plain.pts[0].x === 7);
}

console.log(all ? '\nALL PASS' : '\nFAILURES');
process.exit(all ? 0 : 1);
