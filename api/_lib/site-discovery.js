/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var KEYS=['grid','incentive','offtake','interconnect','land','size'];
var DEFAULTS={grid:25,incentive:20,offtake:20,interconnect:20,land:10,size:5};
function number(v,max){
  if(typeof v!=='number'&&typeof v!=='string')return null;
  if(typeof v==='string'&&!v.trim())return null;
  var n=Number(v);return isFinite(n)&&n>=0&&(max==null||n<=max)?n:null;
}
function rank(sites,weights){
  if(!Array.isArray(sites)||!sites.length||sites.length>500)throw new Error('Supply 1–500 candidate sites.');
  weights=weights==null?DEFAULTS:weights;
  var w={},total=0;
  KEYS.forEach(function(k){var n=number(weights[k],50);if(n==null)throw new Error('Each weight must be between 0 and 50.');w[k]=n;total+=n;});
  if(!total)throw new Error('Choose at least one positive scoring weight.');
  var rows=sites.map(function(raw,index){
    var s=raw&&typeof raw==='object'?raw:{},load=number(s.load_kw),dist=number(s.grid_dist_mi);
    var parts={grid:dist==null?null:Math.max(0,100-dist*20),size:load==null?null:Math.min(100,load/20)};
    ['incentive','land','offtake','interconnect'].forEach(function(k){parts[k]=number(s[k+'_score'],100);});
    var low=0,missing=0,verify=[];
    KEYS.forEach(function(k){if(parts[k]==null){if(w[k]>0){missing+=w[k];verify.push(k);}}else low+=parts[k]*w[k];});
    var name=String(s.name||'').trim().slice(0,300),identity=!!name;
    if(!identity)verify.push('site name');
    return {name:name||'Unidentified row '+(index+1),originalIndex:index,load_kw:load,grid_dist_mi:dist,parts:parts,
      score:missing||!identity?null:low/total,scoreRange:[low/total,(low+missing*100)/total],
      coverage:100*(total-missing)/total,verify:verify,status:verify.length?'Verify':'Scored'};
  });
  rows.sort(function(a,b){return (a.score==null)-(b.score==null)||(b.score==null?b.scoreRange[0]:b.score)-(a.score==null?a.scoreRange[0]:a.score)||a.originalIndex-b.originalIndex;});
  rows.forEach(function(s,i){s.rank=i+1;});
  return {rows:rows,weights:w,methodology:'Weighted preliminary rank, not feasibility approval. Blank or invalid active factors require Verify; ranges retain their full weight. Grid distance is proximity only, not utility capacity. Load preference uses a 2 MW reference and is not a recommended BESS size. Subjective scores require supporting evidence.'};
}
module.exports={rank:rank};
