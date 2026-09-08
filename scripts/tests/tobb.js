/* The fence is the minimum-area rectangle round what it encloses. */
global.window = global;
const P_FT = 6;
global.S_ = () => S; global.P = () => P_FT;
global.CFG = { clusterFt: 400, standoffFt: 20 };
const sw = require('./sweep.js');
global._frameTo=sw._frameTo; global._frameFrom=sw._frameFrom;
global._framePoly=sw._framePoly; global._framePlace=sw._framePlace;
global._shapeWorldPts=sw._shapeWorldPts;
global._shapeCenter = sh => { const p=sh.pts; let x1=1e9,y1=1e9,x2=-1e9,y2=-1e9;
  p.forEach(q=>{x1=Math.min(x1,q.x);y1=Math.min(y1,q.y);x2=Math.max(x2,q.x);y2=Math.max(y2,q.y);});
  return {x:(x1+x2)/2,y:(y1+y2)/2}; };
global.S = { pxPerFt:P_FT, shapes:[], conduits:[], elements:[] };
global.GROUPS = [{ key:'solar', label:'SOLAR', is: sh => sh.kind==='dersolar' }];
const f = require('./fence.js'); Object.assign(global, f);
function chk(l,ok,x=''){ console.log(`  ${ok?'PASS':'FAIL'}  ${l}${x?'  '+x:''}`); return ok; }
let all = true;

// THE FAILING CASE: solar written as a POLYGON already turned 27 deg, rot = 0
const DEG = 27, W = 900*P_FT, H = 600*P_FT, cx = 4000, cy = 3000;
const r = DEG*Math.PI/180, c = Math.cos(r), s = Math.sin(r);
const poly = [[-W/2,-H/2],[W/2,-H/2],[W/2,H/2],[-W/2,H/2]]
  .map(([x,y]) => ({ x: cx + x*c - y*s, y: cy + x*s + y*c }));
S.shapes = [{ id:'sol', kind:'dersolar', rot:0, pts:poly }];

const ob = f.minAreaBox(S.shapes);
all &= chk('angle measured from the polygon, not from rot',
  Math.abs(ob.deg - DEG) < 0.01 || Math.abs(ob.deg - (DEG+90)) < 0.01, `deg ${ob.deg.toFixed(2)}`);
all &= chk('box is the array, not an inflated AABB',
  Math.abs(Math.max(ob.hw,ob.hh)*2/P_FT - 900) < 0.5 &&
  Math.abs(Math.min(ob.hw,ob.hh)*2/P_FT - 600) < 0.5,
  `${(ob.hw*2/P_FT).toFixed(0)} x ${(ob.hh*2/P_FT).toFixed(0)} ft`);
all &= chk('centred on the array', Math.abs(ob.cx-cx)<0.01 && Math.abs(ob.cy-cy)<0.01);

// what the axis-aligned box would have been, for contrast
const xs = poly.map(p=>p.x), ys = poly.map(p=>p.y);
const aw = (Math.max(...xs)-Math.min(...xs))/P_FT, ah = (Math.max(...ys)-Math.min(...ys))/P_FT;
console.log(`\n  (axis-aligned it measures ${aw.toFixed(0)} x ${ah.toFixed(0)} ft — the loose fence)`);

// the compound carries that angle through
const comp = f.compounds()[0];
all &= chk('compound fence takes the measured angle',
  !!comp.fenceFr && Math.abs(comp.fenceFr.deg - ob.deg) < 0.01,
  comp.fenceFr ? `deg ${comp.fenceFr.deg.toFixed(2)}` : 'null');

// and placing it back is a pure rotation about its own centre
const fr = comp.fenceFr, fence = { kind:'rect', pts:[
  {x:comp.fenceR.x1,y:comp.fenceR.y1},{x:comp.fenceR.x2,y:comp.fenceR.y2}] };
sw._framePlace(fr, fence);
const fcx=(fence.pts[0].x+fence.pts[1].x)/2, fcy=(fence.pts[0].y+fence.pts[1].y)/2;
all &= chk('fence stays centred on the array after placement',
  Math.abs(fcx-cx)<0.01 && Math.abs(fcy-cy)<0.01);
const fw=Math.abs(fence.pts[1].x-fence.pts[0].x)/P_FT, fh=Math.abs(fence.pts[1].y-fence.pts[0].y)/P_FT;
all &= chk('fence is array + 20 ft stand-off both sides',
  Math.abs(Math.max(fw,fh)-940)<0.5 && Math.abs(Math.min(fw,fh)-640)<0.5,
  `${fw.toFixed(0)} x ${fh.toFixed(0)} ft`);

// a square yard must still come out square
S.shapes = [{ id:'y', kind:'dersolar', rot:0,
  pts:[{x:100,y:100},{x:700,y:100},{x:700,y:400},{x:100,y:400}] }];
all &= chk('a square block gets no rotation', f.compounds()[0].fenceFr === null);

console.log(all ? '\nALL PASS' : '\nFAILURES ABOVE');
process.exit(all?0:1);
