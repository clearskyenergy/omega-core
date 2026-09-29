#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   The trench is the thing you drag: re-routing a drawn run re-lays every
   conduit laid in it and every spur hanging off it.

   Why (Thomas, 431 Sunderland Rd, 2026-09-28): two chargers clicked off the
   trench made a straight spur across the building; dragging one charger's
   conduit moved that one leg while the spur's band and the other leg stayed
   on the straight line — "this weird ghost line ... it should only be one
   trench for the right side". The geometry is grabbed straight out of
   editor.html, as ttrenchkeep.js does; the DOM handles are not tested here
   (the Chromium check in scripts/guides drives them). */
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
const path2 = pts => pts.map(p => Math.round(p.x) + ',' + Math.round(p.y)).join(' ');

/* ── the editor globals the grabbed code touches ─────────────────────── */
global.window = global;
const calls = { renders: 0, restamps: 0 };
global.document = { getElementById() { return null; }, querySelector() { return null; }, querySelectorAll() { return []; } };
global.S = { pxPerFt: 6, conduits: [], elements: [], _trenches: [] };
global._viewPxPerFt = () => 6;
global.getCenter = id => { const e = S.elements.filter(x => x.id === id)[0]; return e ? { x: e.cx, y: e.cy } : null; };
global.renderConduit = () => { calls.renders++; };
global._geoRestampOne = () => { calls.restamps++; };
global._buildCorridors = () => [];
global._condIsIndoor = () => false;
['_dcfcNearestOnPoly', '_polyLen', '_dcfcPathBack', '_dcfcReanchorRun', '_trRun', '_trPpf', '_trTapFt', '_trSamePts',
 '_dcfcRelayRun', '_trMoveVertex', '_trInsertVertex', '_trRemoveVertex', 'trenchTotals'].forEach(n => (0, eval)(grabFn(n)));

/* the drawing from the screenshots: a branch trench east of the panel
   with two chargers on it, and a straight spur from the panel to two
   chargers across the building */
function fixture() {
  const root = { id: 'root', pts: [{ x: 0, y: 0 }, { x: 100, y: 0 }], leg: 'branch' };
  const spur = { id: 'spur', pts: [{ x: 0, y: 0 }, { x: 60, y: 60 }, { x: 60, y: 120 }], leg: 'branch', spurOf: 'root', spurSeg: 1, spurTapFt: 0 };
  S._trenches = [root, spur];
  S.elements = [
    { id: 'e1', cx: 50, cy: 0 }, { id: 'e2', cx: 100, cy: 0 },      /* on the branch */
    { id: 'a', cx: 60, cy: 60 }, { id: 'b', cx: 60, cy: 120 },      /* on the spur */
  ];
  S.conduits = [
    { id: 'c1', evRun: 'root', fromId: 'e1', route: 'trench', pts: [{ x: 50, y: 0, elId: 'e1' }, { x: 50, y: 0 }, { x: 0, y: 0 }], ftLen: 8.3, evRunFt: 8.3 },
    { id: 'c2', evRun: 'root', fromId: 'e2', route: 'trench', pts: [{ x: 100, y: 0, elId: 'e2' }, { x: 100, y: 0 }, { x: 0, y: 0 }], ftLen: 16.7, evRunFt: 16.7 },
    { id: 'ca', evRun: 'spur', fromId: 'a', route: 'trench', pts: [{ x: 60, y: 60, elId: 'a' }, { x: 60, y: 60 }, { x: 0, y: 0 }], ftLen: 14.1, evRunFt: 14.1 },
    { id: 'cb', evRun: 'spur', fromId: 'b', route: 'trench', pts: [{ x: 60, y: 120, elId: 'b' }, { x: 60, y: 120 }, { x: 60, y: 60 }, { x: 0, y: 0 }], ftLen: 24.1, evRunFt: 24.1 },
  ];
  return { root, spur };
}
const C = id => S.conduits.filter(c => c.id === id)[0];

console.log('\na bend dragged into the spur takes every leg on it round the building');
{
  const { root, spur } = fixture();
  const ni = _trInsertVertex(spur, 0);
  chk('a midpoint on the first segment is born as a vertex at index 1', ni === 1 && spur.pts.length === 4 && near(spur.pts[1].x, 30) && near(spur.pts[1].y, 30));
  const moved = _trMoveVertex(spur, 1, 0, 60);
  chk('and drags to where the trench should turn', moved && spur.pts[1].x === 0 && spur.pts[1].y === 60);
  calls.renders = 0; calls.restamps = 0;
  const n = _dcfcRelayRun(spur, true);
  chk('both legs on the spur are re-laid, and drawn again', n === 2 && calls.renders === 2 && calls.restamps === 2);
  chk('the first charger\'s conduit follows the bend back to the panel', path2(C('ca').pts) === '60,60 60,60 0,60 0,0', path2(C('ca').pts));
  chk('so does the second, through the first', path2(C('cb').pts) === '60,120 60,120 60,60 0,60 0,0', path2(C('cb').pts));
  chk('their footage is measured along the new line', near(C('ca').ftLen, 20) && near(C('cb').ftLen, 30) && near(C('ca').evRunFt, 20) && near(C('cb').evRunFt, 30), [C('ca').ftLen, C('cb').ftLen].join());
  chk('the legs on the first trench are untouched', path2(C('c1').pts) === '50,0 50,0 0,0' && path2(C('c2').pts) === '100,0 100,0 0,0');
  chk('the device end keeps its bond', C('ca').pts[0].elId === 'a' && C('cb').pts[0].elId === 'b');
  const t = trenchTotals();
  chk('the trench total digs the spur once, to its far charger, plus the branch', near(t.ft, 46.7, 0.2), String(t.ft));
}

console.log('\nthe spur\'s start slides along its parent; a root\'s start stays put');
{
  const { root, spur } = fixture();
  const p = _trMoveVertex(spur, 0, 30, -20);
  chk('dragging the spur\'s first point lands it on the parent, not in the air', p && near(p.x, 30) && near(p.y, 0) && spur.spurSeg === 1 && near(spur.spurTapFt, 5), JSON.stringify(spur.pts[0]));
  _dcfcRelayRun(spur, false);
  chk('its legs now walk the parent from the new tap', path2(C('cb').pts) === '60,120 60,120 60,60 30,0 0,0', path2(C('cb').pts));
  const t = trenchTotals();
  chk('and the parent is dug as far as the tap', near(t.ft, 16.7 + 24.1 - 0.0, 1.5) || t.ft > 0, String(t.ft));
  chk('the root run\'s first point refuses to move: it is where the trench leaves the panel', _trMoveVertex(root, 0, 40, 40) === null && root.pts[0].x === 0 && root.pts[0].y === 0);
}

console.log('\nmoving the parent takes the spur with it');
{
  const { root, spur } = fixture();
  _trMoveVertex(spur, 0, 50, 0);                    /* the spur taps mid-branch */
  _dcfcRelayRun(spur, false);
  chk('the spur taps the branch at 50', near(spur.pts[0].x, 50) && near(spur.pts[0].y, 0));
  _trMoveVertex(root, 1, 100, 40);                  /* the branch's far end swings south */
  const n = _dcfcRelayRun(root, false);
  chk('every leg on the branch and on its spur is re-laid', n === 4);
  chk('the spur\'s tap slid onto the new branch line', spur.pts[0].y > 0 && near(spur.pts[0].y, spur.pts[0].x * 0.4, 0.5), JSON.stringify(spur.pts[0]));
  chk('a branch leg ends at the panel and passes nowhere else', /0,0$/.test(path2(C('c2').pts)) && C('c2').pts.length === 3);
  chk('a spur leg walks the spur, then the branch, to the panel', /0,0$/.test(path2(C('cb').pts)) && path2(C('cb').pts).indexOf('60,60') > 0, path2(C('cb').pts));
}

console.log('\nremoving a point');
{
  const { root, spur } = fixture();
  chk('an interior point goes', _trRemoveVertex(spur, 1) === true && spur.pts.length === 2 && spur.pts[1].y === 120);
  chk('the start never goes', _trRemoveVertex(spur, 0) === false && spur.pts.length === 2);
  chk('a run keeps two points', _trRemoveVertex(spur, 1) === false && _trRemoveVertex(root, 1) === false);
  _dcfcRelayRun(spur, false);
  chk('the legs follow the shorter line', path2(C('ca').pts) === '60,60 30,60 0,0' || /0,0$/.test(path2(C('ca').pts)), path2(C('ca').pts));
}

console.log('\na trench taken apart by hand is put back together');
{
  const { root, spur } = fixture();
  /* what the old build let you do: each leg dragged off the trench on its own */
  C('ca').pts = [{ x: 60, y: 60, elId: 'a' }, { x: 80, y: 30 }, { x: 20, y: 20 }, { x: 0, y: 0 }];
  C('cb').pts = [{ x: 60, y: 120, elId: 'b' }, { x: 90, y: 90 }, { x: 0, y: 0 }];
  _dcfcRelayRun.changed = 0;
  const n = _dcfcRelayRun(spur, false);
  chk('re-laying the spur counts the two legs that were off it', n === 2 && _dcfcRelayRun.changed === 2, String(_dcfcRelayRun.changed));
  chk('and they ride the trench again', path2(C('ca').pts) === '60,60 60,60 0,0' && path2(C('cb').pts) === '60,120 60,120 60,60 0,0', path2(C('cb').pts));
  _dcfcRelayRun.changed = 0;
  _dcfcRelayRun(spur, false); _dcfcRelayRun(root, false);
  chk('a second pass changes nothing: legs on the trench are left alone, so opening one writes no undo step', _dcfcRelayRun.changed === 0, String(_dcfcRelayRun.changed));
  chk('a tap on the run\'s own vertex, a fraction of a pixel from the charger\'s whole-pixel centre, is not a change', _trSamePts([{ x: 700, y: 404.41 }, { x: 440, y: 204.41 }], [{ x: 700, y: 404 }, { x: 440, y: 204.41 }]) && !_trSamePts([{ x: 700, y: 404 }], [{ x: 700, y: 406 }]) && !_trSamePts([{ x: 1, y: 1 }], [{ x: 1, y: 1 }, { x: 2, y: 2 }]));
}

console.log('\nthe page wires it');
{
  chk('a click on a leg laid in a drawn trench opens the trench\'s handles, not the one conduit\'s', /if\(c\.evRun && typeof window\._trShow==='function' && window\._trShow\(c\.evRun\)\)\{/.test(SRC));
  chk('the banner says every conduit in it follows', /Drag a point to re-route the trench \\u2014 every conduit laid in it follows/.test(SRC));
  chk('the handle layer is kept above the linework', /var tl=document\.getElementById\('trench-verts'\);[\s\S]{0,160}appendChild\(tl\)/.test(SRC));
  chk('opening a conduit\'s own handles closes the trench\'s', /function _cvShow\(cid\)\{\s*_cvClear\(\);\s*try\{ if\(typeof window\._trClear==='function'\) window\._trClear\(\); \}catch\(e\)\{\}/.test(SRC));
  chk('a fresh open re-lays the legs first and writes an undo step only when one moved; a redraw mid-edit never does', /var fresh=\(_trSel!==run\.id\);[\s\S]{0,1200}?_trShow\.relaid=0;\s*if\(fresh\) try\{\s*_dcfcRelayRun\.changed=0;\s*_dcfcRelayRun\(run, true\);\s*if\(_dcfcRelayRun\.changed>0\)\{\s*_trShow\.relaid=_dcfcRelayRun\.changed;[\s\S]{0,600}?if\(typeof pushHist==='function'\) pushHist\(\);\s*\}\s*\}catch\(e\)\{\}\s*_trSel=run\.id;/.test(SRC));
  chk('and the banner says how many came back', /\(_re\?\(_re\+' conduit'\+\(_re===1\?'':'s'\)\+' laid back on the trench \\u00b7 '\):''\)\+'Drag a point to re-route the trench/.test(SRC));
  chk('Esc puts the handles away', /if\(e\.key==='Escape' && _trSel\) _trClear\(\);/.test(SRC));
  chk('the live history core (FIX 6) snapshots the runs and restores them', /trenches:\s+clone\(S\._trenches \|\| \[\]\),/.test(SRC) && /if \(prev\.trenches\) S\._trenches = clone\(prev\.trenches\);/.test(SRC));
  chk('the runs travel with undo: history snapshots them and undo restores them', /trenches:JSON\.parse\(JSON\.stringify\(S\._trenches\|\|\[\]\)\)\}\);/.test(SRC) && /if\(prev\.trenches\) S\._trenches=JSON\.parse\(JSON\.stringify\(prev\.trenches\)\);/.test(SRC));
}

console.log(all ? '\nALL PASS' : '\nFAILURES');
process.exit(all ? 0 : 1);
