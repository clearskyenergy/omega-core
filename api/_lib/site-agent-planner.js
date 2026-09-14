/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   Concept geometry only. Distances are supplied constraints, never code defaults.
   Coordinates: local feet, +x east, +y north, tied to a confirmed WGS84 origin. */
'use strict';
const EPS=1e-7;
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const point=p=>p&&finite(p.x)&&finite(p.y);
const rect=r=>r&&['x','y','w','h'].every(k=>finite(r[k]))&&r.w>0&&r.h>0;
const corners=r=>[{x:r.x,y:r.y},{x:r.x+r.w,y:r.y},{x:r.x+r.w,y:r.y+r.h},{x:r.x,y:r.y+r.h}];
const grow=(r,d)=>({x:r.x-d,y:r.y-d,w:r.w+2*d,h:r.h+2*d});
const overlap=(a,b)=>a.x<b.x+b.w-EPS&&a.x+a.w>b.x+EPS&&a.y<b.y+b.h-EPS&&a.y+a.h>b.y+EPS;
function distance(p,a,b){let dx=b.x-a.x,dy=b.y-a.y,t=((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1);t=Math.max(0,Math.min(1,t));return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);}
function inside(p,poly){let yes=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){
 const a=poly[i],b=poly[j];if(distance(p,a,b)<EPS)return true;
 if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)yes=!yes;
}return yes;}
function cross(a,b,c){return (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);}
function intersects(a,b,c,d){
 if(Math.max(a.x,b.x)<Math.min(c.x,d.x)-EPS||Math.max(c.x,d.x)<Math.min(a.x,b.x)-EPS||Math.max(a.y,b.y)<Math.min(c.y,d.y)-EPS||Math.max(c.y,d.y)<Math.min(a.y,b.y)-EPS)return false;
 return cross(a,b,c)*cross(a,b,d)<=EPS&&cross(c,d,a)*cross(c,d,b)<=EPS;
}
function segmentDistance(a,b,c,d){return intersects(a,b,c,d)?0:Math.min(distance(a,c,d),distance(b,c,d),distance(c,a,b),distance(d,a,b));}
function parcelSegment(a,b,poly,margin){
 if(!inside(a,poly)||!inside(b,poly)||!inside({x:(a.x+b.x)/2,y:(a.y+b.y)/2},poly))return false;
 return poly.every((p,i)=>segmentDistance(a,b,p,poly[(i+1)%poly.length])+EPS>=margin);
}
function fits(r,poly,margin){const q=corners(r);return q.every((a,i)=>parcelSegment(a,q[(i+1)%4],poly,margin));}
function blockedSegment(a,b,r){
 // Liang-Barsky interval intersection, including grazing an obstacle.
 let lo=0,hi=1;for(const [p,q] of [[-(b.x-a.x),a.x-r.x],[b.x-a.x,r.x+r.w-a.x],[-(b.y-a.y),a.y-r.y],[b.y-a.y,r.y+r.h-a.y]]){
  if(Math.abs(p)<EPS){if(q<0)return false;}else {const t=q/p;if(p<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);if(lo>hi)return false;}
 }return true;
}
function simplify(path){return path.filter((p,i)=>!i||i===path.length-1||Math.abs(cross(path[i-1],p,path[i+1]))>EPS);}
function route(start,end,poly,obstacles,step,margin){
 const xs=poly.map(p=>p.x),ys=poly.map(p=>p.y),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
 const axis=(min,max,a,b)=>Array.from(new Set([a,b,...Array.from({length:Math.floor((max-min)/step)+1},(_,i)=>min+i*step)])).sort((a,b)=>a-b);
 const X=axis(minX,maxX,start.x,end.x),Y=axis(minY,maxY,start.y,end.y);
 if(X.length*Y.length>12000)throw Error('Routing grid too large; reduce the study area or increase gridFt.');
 const key=(x,y)=>x+','+y,coords=k=>{const [x,y]=k.split(',').map(Number);return {x:X[x],y:Y[y]};};
 const first=key(X.indexOf(start.x),Y.indexOf(start.y)),last=key(X.indexOf(end.x),Y.indexOf(end.y));
 const cost=new Map([[first,0]]),parent=new Map(),queue=[{key:first,score:0}],closed=new Set();
 while(queue.length){queue.sort((a,b)=>b.score-a.score);const current=queue.pop().key;if(closed.has(current))continue;if(current===last){const path=[];let k=last;while(k){path.push(coords(k));k=parent.get(k);}return simplify(path.reverse());}closed.add(current);
  const [x,y]=current.split(',').map(Number),a=coords(current);
  for(const [i,j] of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]]){
   if(i<0||j<0||i>=X.length||j>=Y.length)continue;const k=key(i,j),b=coords(k);
   if(closed.has(k)||!parcelSegment(a,b,poly,margin)||obstacles.some(r=>blockedSegment(a,b,r)))continue;
   const d=cost.get(current)+Math.hypot(b.x-a.x,b.y-a.y);if(d>=(cost.get(k)??Infinity))continue;
   cost.set(k,d);parent.set(k,current);queue.push({key:k,score:d+Math.abs(b.x-end.x)+Math.abs(b.y-end.y)});
  }
 }return null;
}
function requirements(s){
 const missing=[];
 if(!s||typeof s.geometrySource!=='string'||!s.geometrySource.trim())missing.push('source for the reviewed geometry');
 if(!s||typeof s.equipmentSource!=='string'||!s.equipmentSource.trim())missing.push('source for the selected equipment dimensions and cable entry');
 if(!s||!s.origin||!finite(s.origin.lat)||!finite(s.origin.lng)||Math.abs(s.origin.lat)>80||Math.abs(s.origin.lng)>180)missing.push('confirmed local WGS84 origin (latitude within ±80°)');
 if(!s||!Array.isArray(s.parcel)||s.parcel.length<3||s.parcel.length>100||!s.parcel.every(point))missing.push('surveyed parcel polygon in local feet');
 if(!s||!rect(s.building))missing.push('confirmed building bounding rectangle');
 if(!s||!s.service||s.service.confirmed!==true||!s.service.source||!['north','south','east','west'].includes(s.service.wall)||!finite(s.service.offsetFt))missing.push('confirmed service wall, source and distance along it');
 if(!s||!s.battery||!['widthFt','depthFt','kw','kwh'].every(k=>finite(s.battery[k])&&s.battery[k]>0)||!s.battery.model)missing.push('selected battery model, physical footprint and kW/kWh');
 if(!s||!s.battery||!['east','north','west','south'].includes(s.battery.connectionSide))missing.push('battery cable-entry side in the unrotated local frame');
 if(!s||!s.switchgear||!['widthFt','depthFt'].every(k=>finite(s.switchgear[k])&&s.switchgear[k]>0)||!s.switchgear.model)missing.push('selected switchgear model and footprint');
 if(!s||!s.switchgear||!['wall-mounted','ground-adjacent'].includes(s.switchgear.mounting))missing.push('confirmed switchgear mounting arrangement');
 if(!s||!s.constraints||!['batteryClearanceFt','parcelSetbackFt','workingClearanceFt','routeWidthFt','gridFt'].every(k=>finite(s.constraints[k])&&s.constraints[k]>0)||!s.constraints.basis)missing.push('positive clearances, route width, grid spacing and their documented basis');
 if(!s||s.obstaclesReviewed!==true||!Array.isArray(s.obstacles)||!s.obstacles.every(rect))missing.push('reviewed obstruction rectangles (doors, access, drainage, easements, utilities and other equipment)');
 return missing;
}
function plan(s){
 const missing=requirements(s);if(missing.length)return {status:'needs_input',missing};
 const p=s.parcel,c=s.constraints,b=s.building,w=s.switchgear.widthFt,d=s.switchgear.depthFt,o=s.service.offsetFt,wall=s.service.wall;
 for(let i=0;i<p.length;i++)for(let j=i+1;j<p.length;j++){
  if(j===i+1||(i===0&&j===p.length-1))continue;
  if(intersects(p[i],p[(i+1)%p.length],p[j],p[(j+1)%p.length]))throw Error('Parcel polygon must be simple and open (do not repeat its first point).');
 }
 if(!fits(b,p,0.001))throw Error('Building rectangle must lie within the parcel for this planner.');
 const horizontal=wall==='north'||wall==='south',span=horizontal?b.w:b.h;
 if(o<w/2||o>span-w/2)throw Error('Service location leaves insufficient wall length for the switchgear.');
 const sg=horizontal?{x:b.x+o-w/2,y:wall==='north'?b.y+b.h:b.y-d,w,h:d}:{x:wall==='east'?b.x+b.w:b.x-d,y:b.y+o-w/2,w:d,h:w};
 const face={x:sg.x+sg.w/2,y:sg.y+sg.h/2},normal={x:wall==='east'?1:wall==='west'?-1:0,y:wall==='north'?1:wall==='south'?-1:0};
 face.x+=normal.x*sg.w/2;face.y+=normal.y*sg.h/2;
 const work=horizontal?{x:sg.x,y:normal.y>0?sg.y+sg.h:sg.y-c.workingClearanceFt,w:sg.w,h:c.workingClearanceFt}:{x:normal.x>0?sg.x+sg.w:sg.x-c.workingClearanceFt,y:sg.y,w:c.workingClearanceFt,h:sg.h};
 if(!fits(sg,p,c.parcelSetbackFt)||!fits(work,p,c.parcelSetbackFt)||s.obstacles.some(r=>overlap(r,sg)||overlap(r,work)))return {status:'blocked',reason:'Switchgear or its working area conflicts with the parcel or a reviewed obstruction.'};
 const xs=p.map(v=>v.x),ys=p.map(v=>v.y),step=c.gridFt;
 const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
 if((maxX-minX)*(maxY-minY)/(step*step)>10000)throw Error('Study area exceeds the bounded search grid.');
 const candidates=[];
 for(let x=minX;x<=maxX;x+=step)for(let y=minY;y<=maxY;y+=step)for(const turn of [false,true]){
  const r={x,y,w:turn?s.battery.depthFt:s.battery.widthFt,h:turn?s.battery.widthFt:s.battery.depthFt};
  if(!fits(grow(r,c.batteryClearanceFt),p,c.parcelSetbackFt)||[b,sg,work,...s.obstacles].some(v=>overlap(grow(r,c.batteryClearanceFt),v)))continue;
  candidates.push({rect:r,rotation:turn?90:0,distance:Math.hypot(x+r.w/2-face.x,y+r.h/2-face.y)});
 }
 candidates.sort((a,b)=>a.distance-b.distance);
 const radius=c.routeWidthFt/2+0.01,goal={x:face.x+normal.x*radius,y:face.y+normal.y*radius},found=[];
 for(const candidate of candidates.slice(0,24)){
  const r=candidate.rect;
  const sides=['east','north','west','south'];
  for(const side of [sides[(sides.indexOf(s.battery.connectionSide)+candidate.rotation/90)%4]]){
   const n={x:side==='east'?1:side==='west'?-1:0,y:side==='north'?1:side==='south'?-1:0};
   const terminal={x:r.x+r.w/2+n.x*r.w/2,y:r.y+r.h/2+n.y*r.h/2},start={x:terminal.x+n.x*radius,y:terminal.y+n.y*radius};
   const obstacles=[b,sg,r,...s.obstacles].map(v=>grow(v,c.routeWidthFt/2));
   const path=route(start,goal,p,obstacles,step,c.parcelSetbackFt+c.routeWidthFt/2);if(!path)continue;
   const pts=simplify([terminal,...path,face]);
   const length=pts.slice(1).reduce((sum,v,i)=>sum+Math.hypot(v.x-pts[i].x,v.y-pts[i].y),0);
   found.push({battery:candidate,switchgear:sg,workingArea:work,route:pts,routeLengthFt:length});break;
  }
 }
 if(!found.length)return {status:'blocked',reason:'No route found among the bounded placement candidates. Refine geometry or grid; no objects were placed.'};
 found.sort((a,b)=>a.routeLengthFt-b.routeLengthFt);
 return {status:'concept_ready',version:1,origin:s.origin,input:s,layout:found[0],alternatives:found.slice(1,3),checks:{parcel:true,obstacles:true,workingArea:true,routeContinuity:true},unverified:['manufacturer installation review','electrical conductor and protection sizing','utility approval','field utility locate and trench construction details']};
}
module.exports={plan,requirements,route,inside,fits,overlap,blockedSegment};
