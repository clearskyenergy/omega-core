// ── simulate a framed Design Site build end to end ─────────────────────
global.window = global;
global.S = { pxPerFt: 6, shapes: [], conduits: [], elements: [] };
let rendered = { shapes: 0, conduits: 0, elements: 0 };
global.renderShape    = () => { rendered.shapes++; };
global.renderConduit  = () => { rendered.conduits++; };
global._reRenderEl    = () => { rendered.elements++; };
global._geoRestampOne = () => {};
global._shapeCenter = sh => { const p=sh.pts; let x1=1e9,y1=1e9,x2=-1e9,y2=-1e9;
  p.forEach(q=>{x1=Math.min(x1,q.x);y1=Math.min(y1,q.y);x2=Math.max(x2,q.x);y2=Math.max(y2,q.y);});
  return {x:(x1+x2)/2,y:(y1+y2)/2}; };
let boundaryShape = null;
global._siteBoundaryShape = () => boundaryShape;

const m = require('./sweep.js');
Object.assign(global, m);

const DEG = 22, P = 6;
// parcel: a rect drawn then turned 22°
boundaryShape = { isSiteBoundary:true, kind:'poly', rot:DEG, closed:true,
  pts:[{x:400,y:400},{x:1400,y:400},{x:1400,y:1000},{x:400,y:1000}] };
S.shapes.push(boundaryShape);

// something the user drew BEFORE the build — must not move
const preExisting = { id:'old1', kind:'rect', pts:[{x:50,y:50},{x:120,y:90}] };
S.shapes.push(preExisting);
const beforeXY = JSON.stringify(preExisting.pts);

const fr = m._omegaFrame();
console.log('frame:', fr ? `deg ${fr.deg.toFixed(2)}  pivot ${fr.cx.toFixed(1)},${fr.cy.toFixed(1)}` : 'NULL');
if (!fr) { console.log('FAIL: no frame'); process.exit(1); }

// snapshot ids the way run() does
const seenS={}, seenC={}, seenE={};
S.shapes.forEach(x=>seenS[x.id]=1); S.conduits.forEach(x=>seenC[x.id]=1);
S.elements.forEach(x=>seenE[x.id]=1);

// the build adds, in FRAME coords
const pad   = { id:'p1', kind:'bespad', lf:60, wf:30, pts:[{x:900,y:700}] };
const fence = { id:'f1', kind:'rect',  pts:[{x:850,y:650},{x:1250,y:900}] };
const road  = { id:'r1', kind:'polyline', pts:[{x:800,y:960},{x:1300,y:640}] };
const solar = { id:'s1', kind:'dersolar', omegaSolarZone:true, pts:[{x:600,y:800},{x:700,y:800},{x:700,y:900}] };
const duct  = { id:'c1', pts:[{x:900,y:700},{x:1100,y:700},{x:1100,y:850}] };
const ems   = { id:'e1', x:1000, y:760, w:40, h:24 };
S.shapes.push(pad, fence, road, solar); S.conduits.push(duct); S.elements.push(ems);

const padCentreFrame  = { x: pad.pts[0].x + 60*P/2, y: pad.pts[0].y + 30*P/2 };
const roadEndsFrame   = JSON.parse(JSON.stringify(road.pts));
const solarPtsBefore  = JSON.stringify(solar.pts);
const ductPtsFrame    = JSON.parse(JSON.stringify(duct.pts));
const emsCentreFrame  = { x: ems.x + ems.w/2, y: ems.y + ems.h/2 };

const n = m._sweepFrameToWorld(fr, seenS, seenC, seenE);
console.log('swept:', n, 'objects   rendered:', JSON.stringify(rendered));

function near(a,b,t=1e-6){ return Math.abs(a-b)<t; }
function chk(label, ok, extra=''){ console.log(`  ${ok?'PASS':'FAIL'}  ${label}${extra?'  '+extra:''}`); return ok; }
let all = true;

// 1. pad centre lands where the frame predicts, and carries the rotation
const pc = m._frameFrom(fr, padCentreFrame.x, padCentreFrame.y);
const gotPad = { x: pad.pts[0].x + 60*P/2, y: pad.pts[0].y + 30*P/2 };
all &= chk('pad centre', near(gotPad.x,pc.x,1e-6)&&near(gotPad.y,pc.y,1e-6),
  `got ${gotPad.x.toFixed(2)},${gotPad.y.toFixed(2)} want ${pc.x.toFixed(2)},${pc.y.toFixed(2)}`);
all &= chk('pad rot', near(pad.rot, DEG, 0.05), `rot=${pad.rot}`);

// 2. rect fence rotates about its own centre
all &= chk('fence rot', near(fence.rot, DEG, 0.05), `rot=${fence.rot}`);

// 3. polyline keeps endpoint ORDER and gets no rot
const e0=m._frameFrom(fr,roadEndsFrame[0].x,roadEndsFrame[0].y);
const e1=m._frameFrom(fr,roadEndsFrame[1].x,roadEndsFrame[1].y);
all &= chk('road endpoints in order',
  near(road.pts[0].x,e0.x)&&near(road.pts[1].x,e1.x));
all &= chk('road not given a rot', road.rot === undefined, `rot=${road.rot}`);

// 4. solar zone untouched — it was laid out in world already
all &= chk('solar zone skipped', JSON.stringify(solar.pts)===solarPtsBefore);

// 5. conduit points all mapped
const dOK = duct.pts.every((p,i)=>{ const q=m._frameFrom(fr,ductPtsFrame[i].x,ductPtsFrame[i].y);
  return near(p.x,q.x)&&near(p.y,q.y); });
all &= chk('conduit mapped', dOK);

// 6. element centre mapped + rot
const ec=m._frameFrom(fr,emsCentreFrame.x,emsCentreFrame.y);
all &= chk('element centre', near(ems.x+ems.w/2,ec.x,1e-6)&&near(ems.y+ems.h/2,ec.y,1e-6));
all &= chk('element rot', near(ems.rot,DEG,0.05), `rot=${ems.rot}`);

// 7. pre-existing work untouched
all &= chk('pre-existing shape untouched', JSON.stringify(preExisting.pts)===beforeXY);
// 8. the parcel itself untouched
all &= chk('site boundary untouched', boundaryShape.rot===DEG && boundaryShape.pts[0].x===400);

// 9. everything the build made now sits INSIDE the real parcel
const world = m._shapeWorldPts(boundaryShape);
const inside = [pad,fence].every(sh=>{
  const c = sh.pts.length===1
    ? {x:sh.pts[0].x+60*P/2, y:sh.pts[0].y+30*P/2}
    : {x:(sh.pts[0].x+sh.pts[1].x)/2, y:(sh.pts[0].y+sh.pts[1].y)/2};
  return m._ptInPoly(c.x,c.y,world);
});
all &= chk('placed blocks land inside the real parcel', inside);

console.log(all ? '\nALL PASS' : '\nFAILURES ABOVE');
