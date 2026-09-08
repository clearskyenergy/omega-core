/* Does a fence follow the equipment, or the screen? */
global.window = global;
const P_FT = 6;
global.S_ = () => S;
global.P  = () => P_FT;
global.GROUPS = [
  { key:'storage',    is: sh => sh.kind==='bespad' },
  { key:'compute',    is: sh => sh.kind==='derdc' },
  { key:'generation', is: sh => sh.kind==='deralt' },
  { key:'solar',      is: sh => sh.kind==='dersolar' },
  { key:'yard',       is: sh => !!sh.omegaYard || sh.kind==='utility' }
];
const sw = require('./sweep.js');
global._frameTo = sw._frameTo; global._frameFrom = sw._frameFrom;
global._framePoly = sw._framePoly; global._framePlace = sw._framePlace;
global.S = { pxPerFt: P_FT, shapes: [], conduits: [], elements: [] };
const f = require('./fence.js');

function pad(id, x, y, rot){ return { id, kind:'derdc', lf:60, wf:30, rot, pts:[{x,y}] }; }
function chk(l, ok, x=''){ console.log(`  ${ok?'PASS':'FAIL'}  ${l}${x?'  '+x:''}`); return ok; }
let all = true;

// ── 1. a built campus: eight pods all turned 22° ──────────────────────
S.shapes = [];
for (let i=0;i<8;i++) S.shapes.push(pad('p'+i, 800+ (i%4)*400, 700 + Math.floor(i/4)*260, 22));
let fr = f.equipFrame();
all &= chk('frame found on a turned campus', !!fr && Math.abs(fr.deg-22)<0.01,
           fr ? `deg ${fr.deg}` : 'null');

// the box of a pod, measured in that frame, must be axis-aligned and
// exactly the pod's own size — that is what makes the fence hug it
f.setFR(fr);
const b = f.boxOf(S.shapes[0]);
f.setFR(null);
all &= chk('pod box in frame is its true size',
  Math.abs((b.x2-b.x1) - 60*P_FT) < 1e-6 && Math.abs((b.y2-b.y1) - 30*P_FT) < 1e-6,
  `${((b.x2-b.x1)/P_FT).toFixed(1)} x ${((b.y2-b.y1)/P_FT).toFixed(1)} ft`);

// ── 2. the fence rect comes back out carrying the angle ───────────────
const fence = { id:'f1', kind:'rect', pts:[{x:b.x1-60, y:b.y1-60},{x:b.x2+60, y:b.y2+60}] };
sw._framePlace(fr, fence);
all &= chk('fence carries the equipment angle', Math.abs(fence.rot-22)<0.05, `rot=${fence.rot}`);

// ── 3. a hand-built site with mixed angles must NOT be turned ─────────
S.shapes = [ pad('a',800,700,0), pad('b',1200,700,37), pad('c',1600,700,12),
             pad('d',2000,700,0), pad('e',800,960,71) ];
all &= chk('mixed angles -> no frame (square fence is honest)', f.equipFrame() === null);

// ── 4. an already-square site behaves exactly as before ───────────────
S.shapes = [ pad('a',800,700,0), pad('b',1200,700,0), pad('c',1600,700,0) ];
all &= chk('square site -> no frame', f.equipFrame() === null);

// ── 5. a clear majority wins even with a stray ────────────────────────
S.shapes = [ pad('a',800,700,22), pad('b',1200,700,22), pad('c',1600,700,22),
             pad('d',2000,700,22), pad('e',800,960,0) ];
fr = f.equipFrame();
all &= chk('4 of 5 agree -> frame at 22', !!fr && Math.abs(fr.deg-22)<0.01,
           fr?`deg ${fr.deg}`:'null');

// ── 6. a bare majority below the threshold does not ───────────────────
S.shapes = [ pad('a',800,700,22), pad('b',1200,700,22),
             pad('c',1600,700,0), pad('d',2000,700,55), pad('e',800,960,71) ];
all &= chk('2 of 5 agree -> no frame', f.equipFrame() === null);

// ── 7. a tie routed orthogonally in frame comes out parallel to the fence
S.shapes = [];
for (let i=0;i<4;i++) S.shapes.push(pad('p'+i, 800+i*400, 700, 22));
fr = f.equipFrame();
const route = [{x:900,y:800},{x:1500,y:800},{x:1500,y:1200}];
const world = sw._framePoly(fr, route, true);
function segDeg(a,b){ return ((Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI)%180+180)%180; }
const d0 = segDeg(world[0],world[1]), d1 = segDeg(world[1],world[2]);
all &= chk('tie legs run parallel / perpendicular to the fence',
  Math.abs(d0-22)<0.01 && Math.abs(d1-112)<0.01, `${d0.toFixed(1)}° then ${d1.toFixed(1)}°`);

console.log(all ? '\nALL PASS' : '\nFAILURES ABOVE');
process.exit(all ? 0 : 1);
