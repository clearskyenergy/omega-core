/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
/* Adapts the Site Map's provider evidence; the grid and network engines
   retain their own scores. Connectivity is a separate pursuit gate. */
function num(v) { return typeof v === 'number' && isFinite(v) && v >= 0 ? v : null; }
function txt(v) { return typeof v === 'string' ? v.slice(0,1200) : ''; }
function list(v) { return Array.isArray(v) ? v.slice(0,20).map(txt).filter(Boolean) : []; }
function choice(v,values) { return values.indexOf(v)>=0 ? v : null; }
function network(raw) {
  raw=raw||{};
  var f=raw.fiber||{},c=raw.capacity||{},d=raw.datacenter||{},l=f.lateral||{};
  return {
    verdict:choice(f.verdict,['likely','plausible','uncertain','unlikely'])||'Verify',
    summary:txt(raw.summary),reasons:list(f.reasons),notes:list(c.notes),
    connectivityClass:txt(c['class'])||'Verify',routeDiversity:txt(c.routeDiversity)||'Verify',
    independentPaths:num(c.independentPaths),litService:txt(c.litService)||'Verify',
    lateralMi:num(l.mi),lateralBasis:txt(l.basis),
    datacenterVerdict:choice(d.verdict,['strong','workable','marginal','poor'])||'Verify',
    datacenterScore:num(d.score)!=null&&d.score<=100?d.score:null,
    nearbyDatacenters:num(d.within50),scope:'Connectivity only; power, water, land and tax are separate.',
    checkedAt:txt(raw.checkedAt),build:txt(raw.build),sources:raw.sources&&typeof raw.sources==='object'?Object.keys(raw.sources).slice(0,20).map(function(k){var s=raw.sources[k];return txt(k)+': '+txt(typeof s==='string'?s:s&&s.status); }):[]
  };
}
function gate(n,powerDecision) {
  if(n.verdict==='unlikely'||n.datacenterVerdict==='poor')return 'Hold / Needs Review';
  if(n.verdict==='Verify'||n.verdict==='uncertain'||n.datacenterVerdict==='Verify'||n.datacenterScore==null||n.routeDiversity==='Verify')return 'Verify';
  if(powerDecision==='Priority Go'&&(n.verdict==='plausible'||n.datacenterVerdict==='marginal'||n.routeDiversity==='single-threaded'||n.routeDiversity==='none mapped'))return 'Conditional Go';
  return powerDecision;
}
/* Same scalar inputs the Site Map's mergeAtlas gives OmegaSiteIntel. No
   circuit, pipe size or distance is inferred from an absent provider field. */
function mergeGrid(s,g) {
  var lines=(Array.isArray(g.lines)?g.lines:[]).filter(Boolean).slice(0,50),subs=(Array.isArray(g.substations)?g.substations:[]).filter(Boolean).slice(0,50),pipes=(Array.isArray(g.pipelines)?g.pipelines:[]).filter(Boolean).slice(0,50);
  var volts=lines.concat(subs).map(function(v){return num(v.voltageKv);}).filter(function(v){return v>0&&v<=1500;});
  if(volts.length)s.maxKv=Math.max(s.maxKv||0,Math.max.apply(null,volts));
  function nearest(rows){var a=rows.map(function(v){return num(v.distanceKm);}).filter(function(v){return v!=null&&v<=500;});return a.length?Math.min.apply(null,a)*1000:null;}
  var sm=nearest(subs),lm=nearest(lines);
  if(sm!=null){s.nearestSubM=s.nearestSubM==null?sm:Math.min(s.nearestSubM,sm);if(!s.substations.length)s.substations=subs.map(function(v){return {name:txt(v.name),attrs:{kv:num(v.voltageKv),kvUnknown:!num(v.voltageKv)}};});}
  if(lm!=null)s.nearestLineM=s.nearestLineM==null?lm:Math.min(s.nearestLineM,lm);
  var circuits=0;
  lines.forEach(function(v){if(num(v.circuits)>0&&v.circuits<=100&&v.circuits%1===0&&num(v.voltageKv)>0&&Math.abs(v.voltageKv-(s.maxKv||0))<1)circuits+=v.circuits;});
  if(circuits&&!(s.circuitsAtMaxKv>0))s.circuitsAtMaxKv=circuits;
  var gas=pipes.filter(function(p){return p.gas===true&&!p.gathering&&num(p.diameterIn)>0;});
  if(gas.length){if(!s.maxGasDiameterIn)s.maxGasDiameterIn=Math.max.apply(null,gas.map(function(p){return p.diameterIn;}));if(s.nearestGasM==null)s.nearestGasM=nearest(gas);}
  var haz=pipes.filter(function(p){return p.hazardousLiquid===true&&num(p.distanceKm)!=null;});
  if(haz.length&&!(s.hazardOnParcel||s.hazardAdjacent)){
    s.hazardOnParcel=haz.filter(function(p){return p.distanceKm*3280.84<=200;}).length;
    s.hazardAdjacent=haz.filter(function(p){var ft=p.distanceKm*3280.84;return ft>200&&ft<=1320;}).length;
    if(s.hazardOnParcel||s.hazardAdjacent)s.flags.push({level:'warn',code:'hazard_from_atlas',msg:'Mapped hazardous-liquid pipeline within a quarter mile of the site point. Verify the boundary, recorded easement and setback before layout.'});
  }
  if(volts.length||sm!=null||lm!=null)s.flags=s.flags.filter(function(f){return f.code!=='no_grid';});
  s.evidence='uploaded_or_lookup_grid_context';
}
module.exports={network:network,gate:gate,mergeGrid:mergeGrid};
