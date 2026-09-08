const m=require('./pv.js');
const D=a=>(a*180/Math.PI);
// a parcel running 35deg off east, like the user's
function parcel(deg,w=1000,h=500){
  const r=deg*Math.PI/180,c=Math.cos(r),s=Math.sin(r);
  return [[0,0],[w,0],[w,h],[0,h]].map(([x,y])=>({x:x*c-y*s,y:x*s+y*c}));
}
const bnd=parcel(35);
const raw=m.candidateAngles(bnd);
console.log('candidates the old search scored, in order:');
console.log('  ', raw.slice(0,6).map(a=>D(a).toFixed(0)+'°').join(' '));
console.log('  (it kept whichever packed most — typically the 35° parcel edge)');
const kept=m._pvPreferSun(raw,{});
console.log('\nwith the sun preference (±20° window), tried in this order:');
console.log('  ', kept.map(a=>D(a).toFixed(0)+'° (dev '+D(m._pvSunDev(a)).toFixed(0)+'°)').join('  '));
console.log('\nevery candidate is within 20° of due-optimal:',
  kept.every(a=>D(m._pvSunDev(a))<=20.0001));
console.log('most-optimal is tried first:', D(m._pvSunDev(kept[0])).toFixed(1)+'°');
// explicit override still honoured
console.log('\nfreeAngle:true returns the unfiltered list:',
  m._pvPreferSun(raw,{freeAngle:true}).length===raw.length);
console.log('wider window (45°) admits more:', m._pvPreferSun(raw,{azWindowDeg:45}).length,
            'vs', kept.length);
