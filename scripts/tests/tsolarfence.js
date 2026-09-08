/* A compound is fenced in its OWN angle. Solar sits at the sun's angle while
   the campus sits at the parcel's, so one global frame made its fence loose
   and skewed. */
global.window = global;
const P_FT = 6;
global.S_ = () => S; global.P = () => P_FT;
global.CFG = { clusterFt: 120, standoffFt: 20 };
const sw = require('./sweep.js');
global._frameTo=sw._frameTo; global._frameFrom=sw._frameFrom;
global._framePoly=sw._framePoly; global._framePlace=sw._framePlace;
global.S = { pxPerFt:P_FT, shapes:[], conduits:[], elements:[] };
global.GROUPS = [
  { key:'compute', label:'COMPUTE', is: sh => sh.kind==='derdc' },
  { key:'solar',   label:'SOLAR',   is: sh => sh.kind==='dersolar' }
];
const f = require('./fence.js'); Object.assign(global, f);
function chk(l,ok,x=''){ console.log(`  ${ok?'PASS':'FAIL'}  ${l}${x?'  '+x:''}`); return ok; }
let all = true;

const CAMPUS = 22, SUN = 0;
// campus pods at the parcel angle
for (let i=0;i<6;i++) S.shapes.push({ id:'p'+i, kind:'derdc', lf:60, wf:30,
  rot:CAMPUS, pts:[{x:2000+(i%3)*400, y:1200+Math.floor(i/3)*260}] });
// a solar array at the SUN's angle, well clear of the campus
const W=900*P_FT, H=600*P_FT, ox=2000, oy=2600;
S.shapes.push({ id:'sol', kind:'dersolar', rot:SUN,
  pts:[{x:ox,y:oy},{x:ox+W,y:oy},{x:ox+W,y:oy+H},{x:ox,y:oy+H}] });

const comps = f.compounds();
const sol = comps.filter(c=>c.key==='solar')[0];
const cmp = comps.filter(c=>c.key==='compute')[0];
all &= chk('both compounds found', !!sol && !!cmp);

// the solar fence must be measured in the ARRAY's angle, so it is only the
// array plus the stand-off — not the inflated box a 22-degree frame gives
const pad = CFG.standoffFt*P_FT*2;
const r = sol.fenceR || sol.r;
const wFt = (r.x2-r.x1)/P_FT, hFt = (r.y2-r.y1)/P_FT;
all &= chk('solar fence is the array plus stand-off, not an inflated box',
  Math.abs(wFt-(900+40))<1 && Math.abs(hFt-(600+40))<1,
  `${wFt.toFixed(0)} x ${hFt.toFixed(0)} ft (want 940 x 640)`);

// what one global frame would have produced, for contrast
const g = { deg:CAMPUS, cx:(r.x1+r.x2)/2, cy:(r.y1+r.y2)/2 };
const corners=[{x:ox,y:oy},{x:ox+W,y:oy},{x:ox+W,y:oy+H},{x:ox,y:oy+H}]
  .map(p=>sw._frameTo(g,p.x,p.y));
const iw=(Math.max(...corners.map(c=>c.x))-Math.min(...corners.map(c=>c.x)))/P_FT;
const ih=(Math.max(...corners.map(c=>c.y))-Math.min(...corners.map(c=>c.y)))/P_FT;
console.log(`\n  (in the campus frame the same array measures ${iw.toFixed(0)} x ${ih.toFixed(0)} ft` +
            ` — that was the loose fence)`);
all &= chk('the campus keeps the parcel angle',
  !!cmp.fenceFr && Math.abs(cmp.fenceFr.deg-CAMPUS)<0.01,
  cmp.fenceFr?`deg ${cmp.fenceFr.deg}`:'null');
all &= chk('solar does not inherit the campus angle',
  !sol.fenceFr || Math.abs(sol.fenceFr.deg-CAMPUS)>1,
  sol.fenceFr?`deg ${sol.fenceFr.deg}`:'square (deg 0)');

console.log(all ? '\nALL PASS' : '\nFAILURES ABOVE');
process.exit(all?0:1);
