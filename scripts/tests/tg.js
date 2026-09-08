const {_hullOf,_polyDist}=require('./geo.js');
const PPF=6;
// two 200x100 ft compounds, both turned 35°, sitting 60 ft apart along that axis
function rect(cx,cy,wFt,hFt,deg){
  const w=wFt*PPF/2,h=hFt*PPF/2,r=deg*Math.PI/180,c=Math.cos(r),s=Math.sin(r);
  return [[-w,-h],[w,-h],[w,h],[-w,h]].map(([x,y])=>({x:cx+x*c-y*s, y:cy+x*s+y*c}));
}
function aabbGapFt(A,B){
  const bb=p=>({x1:Math.min(...p.map(q=>q.x)),y1:Math.min(...p.map(q=>q.y)),
                x2:Math.max(...p.map(q=>q.x)),y2:Math.max(...p.map(q=>q.y))});
  const a=bb(A),b=bb(B);
  const dx=Math.max(0,Math.max(a.x1-b.x2,b.x1-a.x2)), dy=Math.max(0,Math.max(a.y1-b.y2,b.y1-a.y2));
  return ((dx>0&&dy>0)?Math.hypot(dx,dy):Math.max(dx,dy))/PPF;
}
const deg=35, r=deg*Math.PI/180;
// B is offset 260 ft along the compound's own axis => 60 ft clear edge to edge
const off=260*PPF;
const A=rect(600,600,200,100,deg);
const B=rect(600+off*Math.cos(r), 600+off*Math.sin(r), 200,100,deg);
console.log('two 200x100 ft yards, both at 35°, 60 ft clear along their axis');
console.log('  AABB box-to-box gap :', aabbGapFt(A,B).toFixed(1),'ft   <- what it measured');
console.log('  true hull distance  :', (_polyDist(_hullOf(A),_hullOf(B))/PPF).toFixed(1),'ft   <- what it measures now');
console.log('  required            : 30 ft');
console.log();
// sanity: genuinely overlapping
const C=rect(660,640,200,100,deg);
console.log('genuinely overlapping pair ->', (_polyDist(_hullOf(A),_hullOf(C))/PPF).toFixed(1),'ft (expect 0)');
// sanity: axis-aligned, 40 ft apart horizontally
const D=rect(600,600,200,100,0), E=rect(600+240*PPF,600,200,100,0);
console.log('axis-aligned 40 ft apart ->', (_polyDist(_hullOf(D),_hullOf(E))/PPF).toFixed(1),'ft (expect 40)');
