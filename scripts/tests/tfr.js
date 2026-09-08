global.window = global;
global.S = { pxPerFt: 6, shapes: [], conduits: [], elements: [], siteAzimuth: null };
global._shapeCenter = sh => { const p=sh.pts; let x1=1e9,y1=1e9,x2=-1e9,y2=-1e9;
  p.forEach(q=>{x1=Math.min(x1,q.x);y1=Math.min(y1,q.y);x2=Math.max(x2,q.x);y2=Math.max(y2,q.y);});
  return {x:(x1+x2)/2,y:(y1+y2)/2}; };
let bshape = null;
global._siteBoundaryShape = () => bshape;
const m = require('./sweep.js'); Object.assign(global, m);

function turned(deg,pts,cx,cy){ const r=deg*Math.PI/180,c=Math.cos(r),s=Math.sin(r);
  return pts.map(p=>({x:cx+(p.x-cx)*c-(p.y-cy)*s, y:cy+(p.x-cx)*s+(p.y-cy)*c})); }

// THE CASE THAT WAS BROKEN: the planner's parcel (omegaRole) is at 35°,
// while some OTHER shape carries isSiteBoundary at 5°.
const planned = turned(35,[{x:0,y:0},{x:1000,y:0},{x:1000,y:600},{x:0,y:600}],500,300);
bshape = { isSiteBoundary:true, kind:'poly', rot:5, closed:true,
           pts:[{x:3000,y:3000},{x:3400,y:3000},{x:3400,y:3200},{x:3000,y:3200}] };
S.shapes.push(bshape);

const fr = m._omegaFrame(planned);
const cx = planned.reduce((a,p)=>a+p.x,0)/4, cy = planned.reduce((a,p)=>a+p.y,0)/4;
console.log('frame from the PLANNED polygon:');
console.log(`  deg   ${fr.deg.toFixed(2)}   (expect 35.00)`);
console.log(`  pivot ${fr.cx.toFixed(1)},${fr.cy.toFixed(1)}   (expect ${cx.toFixed(1)},${cy.toFixed(1)})`);
console.log(`  PASS: ${Math.abs(fr.deg-35)<0.01 && Math.abs(fr.cx-cx)<0.01 && Math.abs(fr.cy-cy)<0.01}`);

// and the frame really does square the parcel
const inFrame = m._framePoly(fr, planned);
const xs=inFrame.map(p=>p.x), ys=inFrame.map(p=>p.y);
const edges=[]; for(let i=0;i<4;i++){const a=inFrame[i],b=inFrame[(i+1)%4];
  edges.push(Math.abs(Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI)%180);}
console.log('\nparcel edges once inside the frame (deg):', edges.map(e=>e.toFixed(1)).join(', '));
console.log('  square to the grid:', edges.every(e=>e<0.01||Math.abs(e-90)<0.01||Math.abs(e-180)<0.01));

// explicit compass choice still overrides the measurement
S.siteAzimuth = 90;
const fr2 = m._omegaFrame(planned);
console.log('\nexplicit N-S override:', fr2.deg.toFixed(1), '(expect 90.0)  pivot still from the parcel:',
  Math.abs(fr2.cx-cx)<0.01);
// a square parcel disengages entirely
S.siteAzimuth = null;
const sq = [{x:0,y:0},{x:900,y:0},{x:900,y:500},{x:0,y:500}];
console.log('square parcel ->', m._omegaFrame(sq), '(expect null: feature off)');
