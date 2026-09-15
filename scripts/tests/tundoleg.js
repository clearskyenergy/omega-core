/* A guided-build leg is ONE undo entry, undo repaints the trench runs, and a
   charger that lost its branch can be reconnected along the run it was built on.

   Why: placing an EVSE in the Level 2 build wrote three history entries
   (charger / nothing for the conduit / bollard), so one Cmd+Z left the
   charger standing with no trench and no bollard — "the blue trench
   disappeared" (30 Mass Ave, 2026-09-15). No extraction step needed: the
   functions are grabbed straight out of editor.html here. */
'use strict';
const fs = require('fs'), path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'editor.html'), 'utf8');

function grab(name) {
  const needle = 'function ' + name + '(';
  const hits = [];
  for (let k = SRC.indexOf(needle); k >= 0; k = SRC.indexOf(needle, k + 1)) hits.push(k);
  if (hits.length !== 1) throw new Error(name + ' appears ' + hits.length + ' times');
  let k = SRC.indexOf('{', hits[0]), d = 0;
  for (;; k++) { if (SRC[k] === '{') d++; else if (SRC[k] === '}') { d--; if (!d) break; } }
  return SRC.slice(hits[0], k + 1);
}
function block(id) {
  const m = new RegExp('<script id="' + id + '">([\\s\\S]*?)</script>').exec(SRC);
  if (!m) throw new Error('script block not found: ' + id);
  return m[1];
}

function chk(l, ok, x = '') { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`); return ok; }
let all = true;

/* ── a small DOM and the editor globals the grabbed code touches ───────── */
const nodes = {};
function fakeNode(id) {
  return { id, innerHTML: '', style: {}, className: '', children: [], textContent: '',
           appendChild(c) { this.children.push(c); }, removeChild(c) { this.children = this.children.filter(x => x !== c); },
           querySelector() { return null; }, querySelectorAll() { return []; }, classList: { add() {}, remove() {}, toggle() {} } };
}
global.window = global;
global.document = {
  getElementById(id) { return nodes[id] || (nodes[id] = fakeNode(id)); },
  querySelector() { return null; }, querySelectorAll() { return []; },
  createElement(t) { const n = fakeNode(t); n.setAttribute = () => {}; n.addEventListener = () => {}; return n; },
  createElementNS(ns, t) { const n = fakeNode(t); n.setAttribute = () => {}; n.dataset = {}; return n; },
  addEventListener() {}
};
global.setInterval = () => 0;   /* the reconnect module polls for project loads */
global.S = { elements: [], conduits: [], shapes: [], history: [], pxPerFt: 6, _trenches: [] };
global.omegaSetStale = () => {};
global.renderEl = () => {}; global.renderConduit = () => {}; global.renderShape = () => {};
global.showProps = () => {}; global.updCount = () => {}; global.updCondStat = () => {}; global.renderLegend = () => {};
global.updShapeCount = () => {};
let banners = [];
global.showBanner = (t, m) => { banners.push({ t, m }); };
let dimArrows = 0, trenchPaints = 0;
global._ensureDimArrows = () => { dimArrows++; };
global._dcfcRenderTrenches = () => { trenchPaints++; };
global.uid = () => Math.random().toString(36).slice(2, 11);
global._polyLen = (pts) => { let d = 0; for (let i = 1; i < pts.length; i++) d += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); return d; };
global._elBox = (el) => { const w = +el.w || 60, h = +el.h || w; return { cx: el.x + w / 2, cy: el.y + h / 2, hw: w / 2, hh: h / 2 }; };
global.addEl = (opts) => { const el = Object.assign({ id: uid() }, opts); S.elements.push(el); pushHist(); return el; };

/* the code under test */
/* pushHist and omegaHistBatch share the hold counter through one script-block
   scope in editor.html, so they have to be evaluated in ONE scope here too. */
/* a top-level var in the page IS window._omHistHold, which the FIX 6 core reads */
eval('global._omHistHold=0;\n' + grab('pushHist') + '\n' + grab('omegaHistBatch') + '\n' +
     grab('omegaBuildUndoPoint') + '\n' + grab('undoLast') + '\n' +
     'global.pushHist=pushHist; global.omegaHistBatch=omegaHistBatch; ' +
     'global.omegaBuildUndoPoint=omegaBuildUndoPoint; global.undoLast=undoLast; ' +
     'global._holdNow=function(){ return _omHistHold; };');
/* The FIX 6 module replaces window.pushHist / window.undoLast wholesale at
   load, so THOSE are what the page runs. Install them the way the page does. */
global.TAG = '[test]'; global.log = () => {};
eval(grab('replaceHistoryCore') + '\nreplaceHistoryCore();');
all &= chk('FIX 6 history core installed', /_omHistHold/.test(global.pushHist.toString()) && /_dcfcRenderTrenches/.test(global.undoLast.toString()));

eval(grab('_dcfcNearestOnPoly') + '\nglobal._dcfcNearestOnPoly=_dcfcNearestOnPoly;');
eval(grab('_dcfcConduitAlongRun') + '\nglobal._dcfcConduitAlongRun=_dcfcConduitAlongRun;');
eval(grab('_l2Bollards') + '\nglobal._l2Bollards=_l2Bollards;');
eval(block('omega-ev-reconnect-js'));

/* ── 1. the leg is one entry, and one undo removes the whole leg ───────── */
console.log('\nundo granularity');
pushHist();                                       /* the drawing before the leg */
const before = S.history.length;
omegaHistBatch(function () {
  const ch = addEl({ type: 'evgear', evKind: 'charger', evLevel: 'L2', label: 'EVSE 1 · Autel AC Elite', x: 100, y: 100, w: 20, h: 16 });
  S.conduits.push({ id: uid(), condType: 'L2-TRENCH', fromId: ch.id, toId: null, pts: [{ x: 110, y: 108 }, { x: 10, y: 10 }] });
  _l2Bollards(ch, 1);
});
all &= chk('one history entry for charger + conduit + bollard', S.history.length === before + 1, `+${S.history.length - before}`);
all &= chk('leg is on the drawing', S.elements.length === 2 && S.conduits.length === 1);
undoLast();
all &= chk('one undo removes charger, conduit AND bollard', S.elements.length === 0 && S.conduits.length === 0,
  `elements=${S.elements.length} conduits=${S.conduits.length}`);
all &= chk('undo repainted the trench-run layer', trenchPaints === 0 || S._trenches.length === 0, 'no runs yet, nothing to paint');
S._trenches.push({ id: 'r1', leg: 'branch', pts: [{ x: 0, y: 0 }, { x: 50, y: 50 }] });
pushHist(); pushHist(); undoLast();
all &= chk('undo repaints drawn trench runs when there are any', trenchPaints === 1, `paints=${trenchPaints}`);
all &= chk('undo restores the marker defs', dimArrows >= 1);

/* nested batches push once, at the outermost close */
const n0 = S.history.length;
omegaHistBatch(function () { omegaHistBatch(function () { addEl({ type: 'eq', x: 0, y: 0 }); }); addEl({ type: 'eq', x: 0, y: 0 }); });
all &= chk('nested batches push exactly once', S.history.length === n0 + 1, `+${S.history.length - n0}`);
all &= chk('hold counter returns to zero', global._holdNow() === 0);

/* ── 2. Cmd+Z during a build undoes a point, never a leg ───────────────── */
console.log('\nCmd+Z during a build');
all &= chk('no build running: not handled', omegaBuildUndoPoint() === false);
/* the build state is reached through the accessors the wrapped block exports */
let DCFC = { active: true, phase: 'drawtrench' }, DRAW = { pts: [{ x: 1, y: 1 }, { x: 2, y: 2 }] };
global._dcfcState = () => DCFC; global._dcfcDrawState = () => DRAW;
let undonePts = 0; global._dcfcDrawUndoPt = () => { undonePts++; DRAW.pts.pop(); };
all &= chk('drawing: handled, last point removed', omegaBuildUndoPoint() === true && undonePts === 1 && DRAW.pts.length === 1);
DRAW = null; banners = [];
all &= chk('between runs: handled, with a banner instead of an undo', omegaBuildUndoPoint() === true && banners.length === 1 && /Backspace/.test(banners[0].m));
DCFC = { active: false };
global._cgcState = () => ({ active: true }); DRAW = { pts: [{ x: 1, y: 1 }] };
let cgcUndone = 0; global._cgcDrawUndoPt = () => { cgcUndone++; };
all &= chk('compute build: handled through its accessor', omegaBuildUndoPoint() === true && cgcUndone === 1);
global._cgcState = () => ({ active: false }); DRAW = null;

/* ── 3. reconnect a charger that lost its branch ───────────────────────── */
console.log('\nreconnect');
S.elements = []; S.conduits = []; S.history = []; S._trenches = [];
const panel = { id: 'panel', type: 'evgear', evKind: 'panel', label: 'Outdoor Panel / Disconnect', x: 0, y: 0, w: 24, h: 9 };
const meter = { id: 'meter', type: 'evgear', evKind: 'service', label: 'New Meter Bank', x: -60, y: 0, w: 12, h: 12 };
const evse  = { id: 'evse1', type: 'evgear', evKind: 'charger', evLevel: 'L2', label: 'EVSE 1 · Autel AC Elite', x: 290, y: 190, w: 20, h: 16 };
S.elements.push(meter, panel, evse);
S.conduits.push({ id: 'feed', condType: 'L2-INT', fromId: 'panel', toId: 'meter', pts: [{ x: 12, y: 4 }, { x: -54, y: 6 }] });
/* the branch run the user drew, panel end first, passing through the charger */
S._trenches.push({ id: 'run-branch', leg: 'branch', in: 'soil', pts: [{ x: 12, y: 4 }, { x: 150, y: 100 }, { x: 300, y: 198 }, { x: 420, y: 260 }] });
S._trenches.push({ id: 'run-feed', leg: 'feeder', in: 'soil', pts: [{ x: -54, y: 6 }, { x: 12, y: 4 }] });

const orphansBefore = OmegaEvReconnect.orphans();
all &= chk('EVSE 1 is reported as having no branch', orphansBefore.length === 1 && orphansBefore[0].charger.id === 'evse1' && orphansBefore[0].panel.id === 'panel');

const res = OmegaEvReconnect.reconnectAll();
const branch = S.conduits.filter(c => c.condType === 'L2-TRENCH')[0];
all &= chk('one charger reconnected', res.count === 1);
all &= chk('a Level 2 branch conduit now exists', !!branch);
all &= chk('it was laid along the drawn branch run, not straight', res.items[0].along === true);
all &= chk('it starts at the charger and leaves the far end unbonded, as the build does',
  branch && branch.fromId === 'evse1' && branch.fromElId === 'evse1' && branch.toId == null && branch.pts[0].elId === 'evse1' && !branch.pts[branch.pts.length - 1].elId);
all &= chk('it follows the run back to the panel end', branch && Math.abs(branch.pts[branch.pts.length - 1].x - 12) < 1 && branch.pts.length >= 3, branch ? `${branch.pts.length} pts` : '');
all &= chk('it is labelled as the build labels it', branch && /panel→EVSE 1/.test(branch.label), branch && branch.label);
all &= chk('the odd pedestal got its bollard back', S.elements.filter(e => e.eqId === 'bollard').length === 1 && res.items[0].bollard === true);
all &= chk('the reconnect is one undo entry', S.history.length === 1, `history=${S.history.length}`);
all &= chk('nothing left to reconnect', OmegaEvReconnect.orphans().length === 0);
all &= chk('running it again is a no-op with a message', OmegaEvReconnect.reconnectAll().count === 0 && S.conduits.length === 2);

/* even-numbered pedestal: no bollard; and no drawn run: a straight, welded trench */
S.elements = [panel]; S.conduits = []; S._trenches = []; S.history = [];
const evse2 = { id: 'evse2', type: 'evgear', evKind: 'charger', evLevel: 'L2', label: 'EVSE 2 · Autel AC Elite', x: 290, y: 190, w: 20, h: 16 };
S.elements.push(evse2);
const r2 = OmegaEvReconnect.reconnectAll();
const b2 = S.conduits[0];
all &= chk('no drawn run: straight trench, said so', r2.count === 1 && r2.items[0].along === false && b2 && b2.pts.length === 2);
all &= chk('straight trench is welded at both ends', b2 && b2.fromId === 'evse2' && b2.toId === 'panel' && b2.pts[0].elId === 'evse2' && b2.pts[1].elId === 'panel');
all &= chk('even pedestal gets no bollard', S.elements.filter(e => e.eqId === 'bollard').length === 0);
all &= chk('a hand-placed charger with no panel is left alone', (function () {
  S.elements = [{ id: 'x', type: 'evgear', evKind: 'charger', x: 0, y: 0 }]; S.conduits = [];
  return OmegaEvReconnect.orphans().length === 0 && OmegaEvReconnect.reconnectAll().count === 0;
})());

/* ── 4. the wiring in editor.html itself ───────────────────────────────── */
console.log('\nwiring');
all &= chk('EV build placeon leg is batched', /var kind=_dcfcCurKind\(\);\n/.test(SRC) && SRC.indexOf('omegaHistBatch(function(){\n    var kind=_dcfcCurKind();') > 0);
all &= chk('BESS build placeon leg is batched', SRC.indexOf('omegaHistBatch(function(){\n    var kind=_bgbCurKind();') > 0);
all &= chk('compute build commit is batched', SRC.indexOf('omegaHistBatch(_cgcFinishRun)') > 0);
all &= chk('Cmd+Z asks the build first', SRC.indexOf("omegaBuildUndoPoint()) return;\n    undoLast();") > 0);
all &= chk('Search tools knows the reconnect command', SRC.indexOf("name: 'Reconnect chargers to the panel'") > 0);
all &= chk('omegaHistBatch is defined exactly once', (SRC.match(/function omegaHistBatch\(/g) || []).length === 1);
all &= chk('wrapped build block exports its state and trench helpers',
  SRC.indexOf('window._dcfcState=function(){ return DCFC; };') > 0 && SRC.indexOf('window._dcfcConduitAlongRun=_dcfcConduitAlongRun;') > 0 &&
  SRC.indexOf('window._cgcState=function(){ return CGC; };') > 0);
all &= chk('FIX 6 pushHist honours the hold in the file', SRC.indexOf("if ((window._omHistHold | 0) > 0) {") > 0);

console.log(all ? '\nALL PASS' : '\nFAILURES ABOVE');
process.exit(all ? 0 : 1);
