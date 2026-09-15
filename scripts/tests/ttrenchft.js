/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Trench and conduit lengths come from the ground, and the scale belongs to
   the map, not to the undo stack.

   Why (Menachem, 160 S Main St, 2026-09-15): site designs came back with
   trench runs near double what Google Earth measures on the same parking
   row. Drawn runs were measured as pixels / S.pxPerFt, and S.pxPerFt was
   rolled back by undo and by a tab switch to whatever zoom the snapshot was
   taken at — one zoom level between two undo points is exactly 2x on every
   length that followed. The runs carry ground anchors (_geoPts) that nothing
   read. The functions are grabbed straight out of editor.html, the same way
   ttrenchkeep.js does it. */
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

function chk(l, ok, x = '') { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`); if (!ok) all = false; return ok; }
let all = true;
const near = (a, b, tol = 0.05) => Math.abs(a - b) <= tol;

/* ── the map: Massachusetts, Web Mercator, the same constant the editor uses ── */
const LAT = 42.0, LNG = -71.0, R = 6378137, FT = 3.280839895;
const mpp  = z => 156543.03392 * Math.cos(LAT * Math.PI / 180) / Math.pow(2, z);   /* metres per px */
const ppf  = z => 1 / (mpp(z) * 3.28084);                                             /* px per ft */
const PPF18 = ppf(18), PPF19 = ppf(19);
/* longitude offset that is `ft` feet east at LAT */
const lngOff = ft => (ft / FT) / (R * Math.cos(LAT * Math.PI / 180)) * 180 / Math.PI;
/* a fake live projection at zoom 19: canvas px -> lat/lng */
const pxToGeo = (x, y) => ({ lat: LAT - (y * mpp(19)) / R * 180 / Math.PI,
                             lng: LNG + (x * mpp(19)) / (R * Math.cos(LAT * Math.PI / 180)) * 180 / Math.PI });

/* ── the editor globals the grabbed code touches ────────────────────────── */
global.window = global;
const nodes = {};
function fakeNode(id) {
  return { id, innerHTML: '', style: {}, textContent: '', children: [],
           appendChild(c) { this.children.push(c); }, removeChild(c) { this.children = this.children.filter(x => x !== c); },
           querySelector() { return null; }, querySelectorAll() { return []; }, classList: { add() {}, remove() {} } };
}
global.document = {
  getElementById(id) { return nodes[id] || (nodes[id] = fakeNode(id)); },
  querySelector() { return null; }, querySelectorAll() { return []; },
  createElement(t) { const n = fakeNode(t); n.setAttribute = () => {}; return n; },
  createElementNS(ns, t) { const n = fakeNode(t); n.setAttribute = () => {}; n.dataset = {}; return n; },
  addEventListener() {}
};
console.info = () => {}; console.warn = () => {};
global.S = { pxPerFt: null, unitLabel: 'ft', conduits: [], elements: [], shapes: [], _trenches: [], history: [] };
global.uid = (() => { let n = 0; return () => 'id' + (++n); })();
global.renderConduit = () => {}; global.updCondStat = () => {};
global._elBox = el => ({ cx: el.x, cy: el.y, hw: 1, hh: 1 });

(0, eval)(grabFn('_polyLen'));
(0, eval)(grabFn('_groundPolyFt'));
(0, eval)(grabFn('_viewOwnsScale'));
(0, eval)(grabFn('_viewPxPerFt'));
(0, eval)(grabFn('_trenchRunFt'));
(0, eval)(grabFn('_dcfcNearestOnPoly'));
(0, eval)(grabFn('_dcfcConduitAlongRun'));

console.log('\nground length from anchors');
{
  const g2 = [{ lat: LAT, lng: LNG }, { lat: LAT, lng: LNG + lngOff(86) }];
  chk('two anchors 86 ft apart measure 86 ft', near(_groundPolyFt(g2, 2), 86), String(_groundPolyFt(g2, 2)));
  const g3 = [{ lat: LAT, lng: LNG }, { lat: LAT, lng: LNG + lngOff(50) }, { lat: LAT, lng: LNG + lngOff(86) }];
  chk('a three-vertex run adds its legs', near(_groundPolyFt(g3, 3), 86));
  chk('a vertex count that does not match the pixels is no anchor', _groundPolyFt(g3, 4) === null);
  chk('a hole in the anchor is no anchor', _groundPolyFt([{ lat: LAT, lng: LNG }, null, { lat: LAT, lng: LNG + lngOff(86) }], 3) === null);
  chk('one point is not a length', _groundPolyFt([{ lat: LAT, lng: LNG }], 1) === null);
}

console.log('\na drawn run is measured from the ground, whatever the cache says');
{
  const run = { id: 'r1', pts: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
                _geoPts: [{ lat: LAT, lng: LNG }, { lat: LAT, lng: LNG + lngOff(86) }] };
  S.pxPerFt = PPF18;                    /* the stale cache that doubled everything */
  chk('anchored run reads 86 ft with the cache one zoom behind', near(_trenchRunFt(run), 86), String(_trenchRunFt(run)));
  chk('the pixel maths would have said double', near(_polyLen(run.pts) / PPF18, 145.6, 0.5), String((_polyLen(run.pts) / PPF18).toFixed(1)));
  S.pxPerFt = PPF19;
  chk('still 86 ft with the cache right', near(_trenchRunFt(run), 86));
  chk('the run caches its length for the exports', run.ftLen === 86 || near(run.ftLen, 86, 0.11), String(run.ftLen));
  S.pxPerFt = PPF18 / 3;
  chk('a wildly wrong cache changes nothing', near(_trenchRunFt(run), 86));
}

console.log('\nno anchor: pixels over the scale the LIVE MAP has now');
{
  const run = { id: 'r2', pts: [{ x: 0, y: 0 }, { x: 100, y: 0 }] };
  global._liveMapState = () => ({ lat: LAT, lng: LNG, zoom: 19 });
  S.pxPerFt = PPF18;                    /* stale: undo rolled it back a level */
  const ft = _trenchRunFt(run);
  chk('length uses the map\'s zoom, not the stale cache', near(ft, 100 / PPF19), ft.toFixed(2) + ' vs ' + (100 / PPF19).toFixed(2));
  chk('the stale cache is healed to the map', near(S.pxPerFt, PPF19, 1e-9), String(S.pxPerFt));
  let autos = 0;
  global._gmapAutoScale = () => { autos++; S.pxPerFt = PPF19; S.unitLabel = 'ft'; };
  S.pxPerFt = PPF18;
  _viewPxPerFt();
  chk('when the stock recalibration exists, it is what heals the cache', autos === 1 && near(S.pxPerFt, PPF19, 1e-9));
  _viewPxPerFt();
  chk('and it is not called when the cache already agrees', autos === 1);
  delete global._gmapAutoScale;

  const anchored = { id: 'r3', pts: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
                     _geoPts: [{ lat: LAT, lng: LNG }, { lat: LAT, lng: LNG + lngOff(86) }], _geoSig: 'old' };
  global.__omegaCondPxSig = () => 'moved';
  chk('pixels that moved since the anchor was cut win over the anchor', near(_trenchRunFt(anchored), 100 / PPF19));
  global.__omegaCondPxSig = () => 'old';
  chk('an anchor that still matches its pixels is trusted', near(_trenchRunFt(anchored), 86));
  delete global.__omegaCondPxSig;

  global._isUploadedPhoto = true; S.pxPerFt = 5;
  chk('an uploaded photo keeps its calibration', _viewPxPerFt() === 5);
  global._isUploadedPhoto = false;
  global._liveMapState = () => null;    /* frozen plot */
  S.pxPerFt = 3;
  chk('a frozen plot keeps the scale fixed at capture', _viewPxPerFt() === 3);
  S.pxPerFt = null;
  chk('no scale anywhere reports none, not a guess', _viewPxPerFt() === 0 && _trenchRunFt(run) === 0);
}

console.log('\nwho owns the scale');
{
  global.mapLockState = () => ({ hasPlot: false });
  global._liveMapState = () => null;
  chk('blank canvas: the drawing does', _viewOwnsScale() === false);
  global._liveMapState = () => ({ lat: LAT, lng: LNG, zoom: 19 });
  chk('live map: the view does', _viewOwnsScale() === true);
  global.mapLockState = () => ({ hasPlot: true });
  global._liveMapState = () => null;
  chk('committed plot: the view does', _viewOwnsScale() === true);
  global._isUploadedPhoto = true;
  chk('uploaded photo: the drawing does, even with a map around', _viewOwnsScale() === false);
  global._isUploadedPhoto = false;
}

console.log('\na charger leg laid along a run');
{
  global.mapLockState = () => ({ hasPlot: false });
  global._liveMapState = () => ({ lat: LAT, lng: LNG, zoom: 19 });
  global.OmegaAnchorCond = { stamp() { S.conduits.forEach(c => { if (!c._geoPts) c._geoPts = c.pts.map(p => pxToGeo(p.x, p.y)); }); return 1; } };
  const run = { id: 'run', in: 'soil', pts: [{ x: 0, y: 0 }, { x: 100, y: 0 }] };
  S.conduits = []; S.pxPerFt = PPF18;   /* stale by one zoom */
  const el = { id: 'evse1', x: 60, y: 0 };
  const snap = _dcfcNearestOnPoly(run.pts, { x: 60, y: 0 });
  const c = _dcfcConduitAlongRun(el, run, snap, 'L2-TRENCH', 'Branch');
  const truth = 60 / PPF19;
  chk('the leg is 60 px back to the panel', near(c.pxLen, 60));
  chk('its length is the ground length, not pixels over the stale cache', near(c.ftLen, truth, 0.11), c.ftLen + ' ft vs ' + truth.toFixed(1) + ' (stale maths: ' + (60 / PPF18).toFixed(1) + ')');
  chk('the cache was healed on the way', near(S.pxPerFt, PPF19, 1e-9));

  delete global.OmegaAnchorCond;        /* nothing to anchor with */
  S.pxPerFt = PPF18;
  const c2 = _dcfcConduitAlongRun(el, run, snap, 'L2-TRENCH', 'Branch');
  chk('unanchored on a live map: pixels over the map\'s scale, still right', near(c2.ftLen, truth, 0.11), String(c2.ftLen));

  global._liveMapState = () => null;    /* frozen plot: the cache is the record */
  S.pxPerFt = PPF19;
  const c3 = _dcfcConduitAlongRun(el, run, snap, 'L2-TRENCH', 'Branch');
  chk('frozen plot: pixels over the fixed scale', near(c3.ftLen, truth, 0.11));
}

console.log('\nundo does not roll a map\'s scale back');
{
  /* install the history core the page actually runs, the way tundoleg does */
  global._omHistHold = 0;
  global.omegaSetStale = () => {}; global.renderEl = () => {}; global.renderShape = () => {};
  global.showProps = () => {}; global.updCount = () => {}; global.renderLegend = () => {}; global.updShapeCount = () => {};
  global._ensureDimArrows = () => {}; global._dcfcRenderTrenches = () => {}; global.showBanner = () => {};
  global._geoStampAll = () => {};
  eval(grabFn('pushHist') + '\n' + grabFn('omegaHistBatch') + '\n' + grabFn('omegaBuildUndoPoint') + '\n' + grabFn('undoLast') + '\n' +
       'global.pushHist=pushHist; global.omegaHistBatch=omegaHistBatch; global.omegaBuildUndoPoint=omegaBuildUndoPoint; global.undoLast=undoLast;');
  global.TAG = '[test]'; global.log = () => {};
  eval(grabFn('replaceHistoryCore') + '\nreplaceHistoryCore();');
  chk('FIX 6 history core installed', /_histOwnsScale/.test(global.undoLast.toString()));

  S.elements = []; S.conduits = []; S.shapes = []; S.history = [];
  global.mapLockState = () => ({ hasPlot: false });
  global._liveMapState = () => ({ lat: LAT, lng: LNG, zoom: 18 });
  S.pxPerFt = PPF18; pushHist();                       /* drawn at zoom 18 */
  global._liveMapState = () => ({ lat: LAT, lng: LNG, zoom: 19 });
  S.pxPerFt = PPF19;                                   /* user zooms in one level */
  S.elements.push({ id: 'x', type: 'evgear', x: 0, y: 0 }); pushHist();
  undoLast();
  chk('after undo the scale is still the map\'s (zoom 19)', near(S.pxPerFt, PPF19, 1e-9), 'pxPerFt=' + S.pxPerFt + ' zoom18=' + PPF18.toFixed(4));
  chk('the element was undone', S.elements.length === 0);

  global.mapLockState = () => ({ hasPlot: true }); global._liveMapState = () => null;
  S.history = []; S.pxPerFt = 2; pushHist(); S.pxPerFt = 3; pushHist(); undoLast();
  chk('a committed plot keeps the scale it was captured at', S.pxPerFt === 3);

  global.mapLockState = () => ({ hasPlot: false }); global._isUploadedPhoto = true;
  S.history = []; S.pxPerFt = 5; pushHist(); S.pxPerFt = 7; pushHist(); undoLast();
  chk('an uploaded photo undoes its calibration', S.pxPerFt === 5);
  global._isUploadedPhoto = false;
}

console.log('\nswitching tabs re-derives a live map\'s scale');
{
  global.BG = { scale: 1, tx: 0, ty: 0, rot: 0 };
  global.renderBessList = () => {}; global._applyFrozenMap = () => {}; global._removeFrozenMap = () => {}; global.updateRightPanel = () => {};
  (0, eval)(grabFn('_clearCanvasDOM'));
  (0, eval)(grabFn('_restoreCanvas'));
  let autos = 0;
  global._gmapAutoScale = () => { autos++; S.pxPerFt = PPF19; };
  global._liveMapState = () => ({ lat: LAT, lng: LNG, zoom: 19 });
  _restoreCanvas({ elements: [], conduits: [], shapes: [], trenches: [], pxPerFt: PPF18, unitLabel: 'ft', isUpload: false });
  chk('live map: the tab\'s stale scale is replaced by the map\'s', autos === 1 && near(S.pxPerFt, PPF19, 1e-9));
  _restoreCanvas({ elements: [], conduits: [], shapes: [], trenches: [], pxPerFt: 5, unitLabel: 'ft', isUpload: true });
  chk('uploaded photo tab: its calibration is restored', autos === 1 && S.pxPerFt === 5);
  global._liveMapState = () => null;
  _restoreCanvas({ elements: [], conduits: [], shapes: [], trenches: [], pxPerFt: 3, unitLabel: 'ft', isUpload: false });
  chk('frozen tab: the snapshot is the record', autos === 1 && S.pxPerFt === 3);
  delete global._gmapAutoScale;
}

console.log('\ntrench once, cable many times');
{
  (0, eval)(grabFn('trenchTotals'));
  global.__groups = [];
  global._buildCorridors = () => global.__groups;
  /* the 160 S Main St sheet: one drawn run from the panel, six EVSEs in three
     side-by-side pairs at 10, 45 and 86 ft along it. Each pair's two legs
     coincide, so _buildCorridors reports three corridors. */
  const leg = (id, ft, px, x0) => ({ id, condType: 'L2-TRENCH', route: 'trench', evRun: 'run', ftLen: ft,
                                    pts: [{ x: x0, y: 0 }, { x: x0, y: 0 }, { x: 0, y: 0 }] });
  const a1 = leg('a1', 10, 14, 14), a2 = leg('a2', 10, 14, 14);
  const b1 = leg('b1', 45, 62, 62), b2 = leg('b2', 45, 62, 62);
  const c1 = leg('c1', 86, 118, 118), c2 = leg('c2', 86, 118, 118);
  S.conduits = [a1, a2, b1, b2, c1, c2];
  global.__groups = [{ pts: a1.pts, members: [a1, a2] }, { pts: b1.pts, members: [b1, b2] }, { pts: c1.pts, members: [c1, c2] }];
  let t = trenchTotals();
  chk('six legs in three pairs on one run dig one trench, the longest leg', near(t.ft, 86), String(t.ft) + ' (was 141: 10 + 45 + 86)');
  chk('reported as one shared corridor, not three', t.corridors === 1, String(t.corridors));
  const materials = S.conduits.reduce((s, c) => s + c.ftLen, 0);
  chk('the conduit and cable footage stays per run', near(materials, 282), String(materials));

  /* a charger dragged 6 ft off the run: its lateral is a real dig, added once */
  const d = leg('d', 92, 126, 118); d.pts[0] = { x: 118, y: 8.2 };   /* 8.2 px of 126 ≈ 6 ft */
  S.conduits = [a1, a2, b1, b2, c1, c2, d]; global.__groups = [{ pts: a1.pts, members: [a1, a2] }, { pts: b1.pts, members: [b1, b2] }, { pts: c1.pts, members: [c1, c2] }];
  t = trenchTotals();
  chk('a lateral out to a dragged device is added to the run once', near(t.ft, 86 + 6, 0.2), String(t.ft));

  /* centring noise is not a dig */
  const e = leg('e', 86, 118, 118); e.pts[0] = { x: 118, y: 0.6 };
  S.conduits = [e]; global.__groups = [];
  chk('a sub-foot offset from the run is ignored', near(trenchTotals().ft, 86), String(trenchTotals().ft));

  /* a free leg coinciding with a run's leg is in the same dig */
  const free = { id: 'f', route: 'trench', ftLen: 86, pts: c1.pts.slice() };
  S.conduits = [c1, free]; global.__groups = [{ pts: c1.pts, members: [c1, free] }];
  t = trenchTotals();
  chk('a hand-drawn conduit lying in a run\'s trench is not a second trench', near(t.ft, 86) && t.corridors === 0, String(t.ft) + '/' + t.corridors);

  /* hand-drawn corridors and solo legs behave as before */
  const h1 = { id: 'h1', route: 'trench', ftLen: 30, pts: [{ x: 0, y: 0 }, { x: 40, y: 0 }] };
  const h2 = { id: 'h2', route: 'trench', ftLen: 30, pts: [{ x: 0, y: 0 }, { x: 40, y: 0 }] };
  const solo = { id: 's', route: 'trench', ftLen: 7 };
  const surf = { id: 'x', route: 'surface', ftLen: 99 };
  S.conduits = [h1, h2, solo, surf]; global.__groups = [{ pts: h1.pts, members: [h1, h2] }];
  t = trenchTotals();
  chk('two coinciding hand-drawn runs are one corridor, a solo leg adds its own, surface adds nothing', near(t.ft, 37) && t.corridors === 1, String(t.ft) + '/' + t.corridors);
  chk('the corridor memo cache is not mutated', global.__groups.length === 1 && global.__groups[0].members.length === 2);
  S.conduits = []; delete global._buildCorridors;
}

console.log('\nwiring in editor.html');
{
  const uses = (SRC.match(/_trenchRunFt\(/g) || []).length;
  chk('the right panel, the BOM civil lines, the BOM summary and the permit sheet all measure runs through _trenchRunFt (4 + its definition)', uses === 5, String(uses));
  chk('no consumer divides a run\'s pixels by the cache any more', SRC.indexOf('_trFt+=_polyLen(t.pts)/S.pxPerFt') < 0 && SRC.indexOf('var _tft=(S.pxPerFt ? _tpx/S.pxPerFt : 0);') < 0);
  chk('a leg along a run asks the view for its scale', SRC.indexOf("var _ppfLeg=(typeof _viewPxPerFt==='function') ? _viewPxPerFt() : 0;") > 0);
  chk('the rubber band is unprojected like the clicks', SRC.indexOf("_dcfcDrawMove((typeof _plotUnproject==='function') ? _plotUnproject(_raw) : _raw);") > 0);
  chk('undo consults the view before touching the scale', SRC.indexOf('var _histOwnsScale = !(typeof _viewOwnsScale === \'function\' && _viewOwnsScale());') > 0);
  chk('each helper is defined once', ['_groundPolyFt', '_viewOwnsScale', '_viewPxPerFt', '_trenchRunFt'].every(n => (SRC.match(new RegExp('function ' + n + '\\(', 'g')) || []).length === 1));
}

console.log(all ? '\nALL PASS' : '\nFAILURES');
process.exit(all ? 0 : 1);
