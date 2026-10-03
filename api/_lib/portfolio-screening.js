/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var parcelEngine = require('../../omega-site-intel');
var VERSION = 'screening/2026-10-02.1';
var NUMBERS = ['propertyAreaSf','buildingAreaSf','openAreaSf','parkingSpaces','parcelCount',
  'targetKw','targetKwh','demandReductionKw','peakDurationHours','usableFraction','dischargeEfficiency',
  'layoutKw','layoutKwh','utilityApprovedKw','utilityApprovedKwh','latitude','longitude'];
var LABELS = {propertyAreaSf:'Property area',buildingAreaSf:'Building footprint',openAreaSf:'Open area',
  parkingSpaces:'Parking spaces',parcelCount:'Parcel count',zoning:'Zoning',floodZone:'Flood zone'};
function text(v,max) { return v == null ? '' : String(v).trim().slice(0,max || 600); }
function number(v) {
  if (v == null || v === '' || typeof v === 'boolean') return null;
  if (typeof v === 'string') {
    v=v.trim().replace(/,/g,'');
    if (!/^[-+]?(?:\d+\.?\d*|\.\d+)$/.test(v)) return null;
  }
  return typeof v === 'number' || typeof v === 'string' ? (isFinite(Number(v)) ? Number(v) : null) : null;
}
function boolean(v) {
  if (v === true || v === false) return v;
  v=text(v).toLowerCase();
  if (['yes','y','true','confirmed','1'].indexOf(v)>=0) return true;
  if (['no','n','false','0'].indexOf(v)>=0) return false;
  return null;
}
function normalize(raw,index) {
  raw=raw||{};
  var s={id:text(raw.id || 'site-'+(index+1),120),name:text(raw.name,300),address:text(raw.address,500),
    taxId:text(raw.taxId,300),source:text(raw.source,600),sourceDate:text(raw.sourceDate,80),
    utility:text(raw.utility,200),zoning:text(raw.zoning,100),floodZone:text(raw.floodZone,100).toUpperCase(),
    hostingBand:text(raw.hostingBand,180),objective:text(raw.objective,100).toLowerCase(),
    sizingSource:text(raw.sizingSource,800),notes:text(raw.notes,2000),warnings:[],originalIndex:index};
  NUMBERS.forEach(function(k){
    s[k]=number(raw[k]);
    if(raw[k]!=null && text(raw[k])!=='' && s[k]===null) s.warnings.push('Verify '+(LABELS[k]||k)+': invalid numeric input.');
    if(s[k]!=null && k!=='latitude' && k!=='longitude' && s[k]<0){s[k]=null;s.warnings.push('Verify '+k+': negative value.');}
  });
  ['parkingSpaces','parcelCount'].forEach(function(k){if(s[k]!=null && (s[k]%1!==0 || (k==='parcelCount'&&s[k]<1))){s[k]=null;s.warnings.push('Verify '+k+': invalid count.');}});
  ['layoutVerified','interconnectionVerified','chargingVerified','economicsVerified','energyLimitNotApplicable','threePhase','siteControl','ahjAllowed','zoningSuitable'].forEach(function(k){s[k]=boolean(raw[k]);});
  if(s.latitude!=null && Math.abs(s.latitude)>90){s.latitude=null;s.warnings.push('Verify latitude.');}
  if(s.longitude!=null && Math.abs(s.longitude)>180){s.longitude=null;s.warnings.push('Verify longitude.');}
  ['usableFraction','dischargeEfficiency'].forEach(function(k){if(s[k]!=null && !(s[k]>0&&s[k]<=1)){s[k]=null;s.warnings.push('Verify '+k+': use a fraction above 0 and at most 1.');}});
  if(s.propertyAreaSf!=null && s.buildingAreaSf!=null){
    var computed=s.propertyAreaSf-s.buildingAreaSf;
    if(computed<0){s.openAreaSf=null;s.warnings.push('Verify areas: building footprint exceeds parcel area.');}
    else if(s.openAreaSf!=null && Math.abs(s.openAreaSf-computed)>Math.max(1,computed*.01)){
      s.openAreaSf=null;s.warnings.push('Verify areas: supplied open area conflicts with property minus building area.');
    }else s.openAreaSf=computed;
  }
  if(s.openAreaSf!=null && s.propertyAreaSf!=null && s.openAreaSf>s.propertyAreaSf){s.openAreaSf=null;s.warnings.push('Verify open area: exceeds parcel area.');}
  s.importWarnings=Array.isArray(raw.importWarnings)?raw.importWarnings.slice(0,30).map(function(v){return text(v,800);}):[];
  s.warnings=s.warnings.concat(s.importWarnings);
  s.lookupNotes=Array.isArray(raw.lookupNotes)?raw.lookupNotes.slice(0,30).map(function(v){return text(v,800);}):[];
  if(!s.address && !s.name) s.warnings.push('Verify the site address or site name.');
  return s;
}
function tier(score) { return score==null?'Verify':score>=85?'Priority Go':score>=65?'Conditional Go':'Hold / Needs Review'; }
function areaScore(area,half) {
  if(area==null)return null;
  var scale=half?.5:1;
  return area>=4000*scale?60:area>=3000*scale?45:area>=1500*scale?25:5;
}
function components(s,half) {
  var zoneKnown=!!s.zoning && !!s.floodZone;
  var zoningPoints=zoneKnown?((s.zoning.toUpperCase()==='RM-5'||s.zoningSuitable===true)&&s.floodZone==='X'?10:0):null;
  return [
    {key:'area',label:'Available open area',max:60,points:areaScore(s.openAreaSf,half)},
    {key:'parking',label:'Parking obstruction',max:20,points:s.parkingSpaces==null?null:s.parkingSpaces===0?20:s.parkingSpaces<=3?12:6},
    {key:'title',label:'Title / parcel complexity',max:10,points:s.parcelCount==null?null:s.parcelCount===1?10:5},
    {key:'zoningFlood',label:'Zoning and flood confirmation',max:10,points:zoningPoints}
  ];
}
function scenario(s,half) {
  var c=components(s,half),low=0,high=0,known=0;
  c.forEach(function(p){if(p.points!=null){low+=p.points;high+=p.points;known+=p.max;}else high+=p.max;});
  return {name:half?'Half reference system':'Full reference system',kw:half?500:1000,kwh:half?1750:3500,
    score:known===100?low:null,scoreRange:[low,high],evidenceCoverage:known,components:c,tier:tier(known===100?low:null)};
}
function sizing(s,physical) {
  var verify=[],kw=null,kwh=null,reason='Verify the project objective and supporting sizing data.';
  if(s.objective==='peak shaving'){
    if(s.demandReductionKw>0 && s.peakDurationHours>0 && s.usableFraction>0 && s.dischargeEfficiency>0){
      kw=s.demandReductionKw;kwh=kw*s.peakDurationHours/(s.usableFraction*s.dischargeEfficiency);
      reason='Demand reduction × peak duration ÷ usable fraction ÷ discharge efficiency; supplied assumptions.';
    }else verify.push('Verify interval-backed demand reduction, peak duration, usable fraction and discharge efficiency.');
  }else if(['dispatch target','backup','vpp'].indexOf(s.objective)>=0){
    if(s.targetKw>0&&s.targetKwh>0){kw=s.targetKw;kwh=s.targetKwh;reason='Supplied '+s.objective+' power and energy target.';}
    else verify.push('Verify target power (kW) and energy (kWh) for '+s.objective+'.');
  }else verify.push('Verify sizing objective: peak shaving, dispatch target, backup or VPP.');
  if(s.layoutVerified!==true || !s.sizingSource || !(s.layoutKw>0&&s.layoutKwh>0)) verify.push('Verify equipment layout, buildable pad, fire access and setbacks; record the checked layout kW/kWh and source.');
  if(s.interconnectionVerified!==true || !s.sizingSource || s.utilityApprovedKw==null || (s.utilityApprovedKwh==null&&s.energyLimitNotApplicable!==true)) verify.push('Verify utility-approved site power and any energy limit. A map band is not approval.');
  if(s.chargingVerified!==true) verify.push('Verify charging headroom, recharge schedule, service equipment and export controls.');
  if(s.economicsVerified!==true) verify.push('Verify the load/tariff or dispatch/business case before recommending an economic size.');
  var maxKw=s.layoutVerified===true&&s.interconnectionVerified===true&&s.sizingSource&&s.layoutKw!=null&&s.utilityApprovedKw!=null?Math.min(s.layoutKw,s.utilityApprovedKw):null;
  var maxKwh=s.layoutVerified===true&&s.interconnectionVerified===true&&s.sizingSource&&s.layoutKwh!=null&&(s.utilityApprovedKwh!=null||s.energyLimitNotApplicable===true)?Math.min(s.layoutKwh,s.utilityApprovedKwh==null?Infinity:s.utilityApprovedKwh):null;
  if(kwh!=null)kwh=Math.ceil(kwh);
  if(kw!=null&&maxKw!=null&&kw>maxKw)verify.push('Verify a smaller target or upgrades: requested power exceeds the supplied limit.');
  if(kwh!=null&&maxKwh!=null&&kwh>maxKwh)verify.push('Verify a smaller target or layout: requested energy exceeds the supplied limit.');
  if(s.siteControl===false||s.ahjAllowed===false)verify.push('Resolve the known site-control or permitting blocker.');
  if(s.warnings.length)verify.push('Resolve imported data warnings before confirming a size.');
  return {physicalOption:physical?{kw:physical.kw,kwh:physical.kwh,label:physical.name,status:'Preliminary footprint proxy'}:null,
    maxKw:maxKw,maxKwh:maxKwh,requestedKw:kw,requestedKwh:kwh==null?null:Math.ceil(kwh),
    recommendedKw:verify.length?null:kw,recommendedKwh:verify.length?null:Math.ceil(kwh),
    status:verify.length?'Verify':'Screening recommendation',reason:reason,verify:verify};
}
function bess(raw,index) {
  var s=normalize(raw,index),full=scenario(s,false),half=scenario(s,true),best=full.score==null||half.score==null?null:Math.max(full.score,half.score);
  var physical=null;
  if(full.score!=null){
    if(full.score>=85)physical=full;
    else if(half.score>full.score&&half.score>=65)physical=half;
    else if(full.score>=65)physical=full;
  }
  var verify=s.warnings.concat(s.lookupNotes),risks=[],reasons=[],decision=tier(best);
  if(s.openAreaSf==null)verify.push('Verify open area from a parcel survey and building footprint.');
  ['parkingSpaces','parcelCount'].forEach(function(k){if(s[k]==null)verify.push('Verify '+LABELS[k].toLowerCase()+'.');});
  if(!s.zoning||!s.floodZone)verify.push('Verify zoning and FEMA flood designation.');
  if(s.zoning&&s.zoning.toUpperCase()!=='RM-5'&&s.zoningSuitable!==true)verify.push('Verify local zoning suitability; the CSK reference zoning is Chicago RM-5 and is not a nationwide zoning rule.');
  if(s.floodZone && s.floodZone!=='X')risks.push('Flood designation '+s.floodZone+' needs a site-specific assessment.');
  if(s.threePhase===false)risks.push('No adjacent three-phase power reported; verify service extension or upgrades.');
  if(s.threePhase===null)verify.push('Verify adjacent three-phase power and the actual service/POI.');
  if(s.hostingBand)reasons.push('Hosting map: '+s.hostingBand+'; indicative band only, not a guaranteed kW limit.');
  else verify.push('Verify utility territory and published storage hosting data.');
  if(s.siteControl!==true)verify.push('Verify property-owner authorization and site control.');
  if(s.ahjAllowed!==true)verify.push('Verify the AHJ permitting pathway for this equipment and location.');
  if(s.siteControl===false||s.ahjAllowed===false||s.utilityApprovedKw===0){decision='Hold / Needs Review';risks.push('Known site-control, permitting or zero approved-power constraint.');}
  else if(decision==='Priority Go'&&(risks.length||s.warnings.length))decision='Conditional Go';
  if(s.openAreaSf!=null)reasons.unshift(Math.round(s.openAreaSf).toLocaleString('en-US')+' sf open-area proxy, before setbacks/easements.');
  if(physical)reasons.push(physical===half?'The smaller reference system improves physical fit.':'The full reference system meets the CSK physical-screen threshold.');
  if(best!=null&&best<65)reasons.push('Both reference options remain constrained; investigate a smaller equipment layout.');
  var size=sizing(s,physical);
  verify=Array.from(new Set(verify.concat(size.verify)));
  return {id:s.id,name:s.name,address:s.address,taxId:s.taxId,originalIndex:index,mode:'bess',decision:decision,
    score:best,scoreRange:[Math.max(full.scoreRange[0],half.scoreRange[0]),Math.max(full.scoreRange[1],half.scoreRange[1])],
    evidenceCoverage:full.evidenceCoverage,full:full,half:half,sizing:size,openAreaSf:s.openAreaSf,
    reasons:reasons,risks:risks,verify:verify,source:s.source,sourceDate:s.sourceDate,
    nextAction:risks[0]||verify[0]||'Advance the documented candidate to detailed design and utility review.',
    latitude:s.latitude,longitude:s.longitude};
}
function parcel(raw,index) {
  var s=normalize(raw,index),features=[],errors=[],grid=raw.gridEvidence;
  if(typeof raw.kml==='string'){
    if(raw.kml.length>1500000)throw new Error('KML exceeds 1.5 MB. Split the file.');
    var parsed=parcelEngine.parseKML(raw.kml);features=parsed.features;errors=parsed.errors||[];
  }else if(Array.isArray(raw.features))features=raw.features;
  if(features.length>2000)throw new Error('Too many geographic features in one site.');
  var points=0;
  features=features.filter(function(f){
    if(!f||['polygon','line','point'].indexOf(f.type)<0||!Array.isArray(f.coords))return false;
    points+=f.coords.length;
    return f.coords.length>0&&f.coords.every(function(p){return Array.isArray(p)&&typeof p[0]==='number'&&typeof p[1]==='number'&&isFinite(p[0])&&isFinite(p[1])&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90;});
  });
  if(points>10000)throw new Error('Too many geometry points. Simplify this site boundary.');
  var intake=parcelEngine.intake(features,s.name||s.address);
  if(s.propertyAreaSf>0&&!intake.grossAcres){intake.grossAcres=s.propertyAreaSf/43560;intake.buildableCeilingAcres=intake.grossAcres;intake.statedAcres=intake.grossAcres;}
  if(grid&&typeof grid==='object'){
    var lines=Array.isArray(grid.lines)?grid.lines:[],subs=Array.isArray(grid.substations)?grid.substations:[];
    var volts=lines.concat(subs).map(function(v){return number(v.voltageKv);}).filter(function(v){return v>0&&v<=1500;});
    if(volts.length)intake.maxKv=Math.max(intake.maxKv||0,Math.max.apply(null,volts));
    var near=function(arr){var d=arr.map(function(v){return number(v.distanceKm);}).filter(function(v){return v!=null&&v>=0&&v<=500;});return d.length?Math.min.apply(null,d)*1000:null;};
    var subM=near(subs),lineM=near(lines);
    if(subM!=null){intake.nearestSubM=subM;intake.substations=subs.slice(0,50).map(function(v){return {name:text(v.name),attrs:{kv:number(v.voltageKv),kvUnknown:!number(v.voltageKv)}};});}
    if(lineM!=null)intake.nearestLineM=lineM;
    intake.evidence='uploaded_or_lookup_grid_context';
  }
  var g=parcelEngine.gridScore(intake),hasEvidence=!!(intake.grossAcres||intake.maxKv||intake.nearestSubM!=null||intake.nearestLineM!=null);
  var score=hasEvidence?g.score:null,verify=s.warnings.concat(s.lookupNotes,errors.map(function(e){return 'Verify KML: '+text(e);}));
  (g.missing||[]).forEach(function(v){verify.push('Verify '+v+'.');});
  verify.push('Verify parcel boundaries, zoning, flood risk, access/easements and site control.');
  verify.push('Verify actual utility capacity, interconnection queue and upgrade scope. Mapped voltage is not capacity.');
  return {id:s.id,name:s.name,address:s.address,taxId:s.taxId,originalIndex:index,mode:'parcel',score:score,
    decision:score==null?'Verify':score>=70?'Priority Go':score>=50?'Conditional Go':'Hold / Needs Review',
    confidence:g.confidence,evidenceCoverage:null,acres:intake.grossAcres||null,grid:g,
    reasons:score==null?['No usable parcel or grid evidence yet.']:['Same screening engine as the editor Parcel Screening Register.',g.kv?g.kv+' kV mapped nearby; capacity unconfirmed.':'Grid voltage: Verify.'],
    risks:(intake.flags||[]).map(function(v){return v.msg;}).slice(0,30),verify:verify,
    nextAction:verify[0],source:s.source,sourceDate:s.sourceDate,latitude:s.latitude,longitude:s.longitude};
}
function rank(rows) {
  var order={'Priority Go':0,'Conditional Go':1,'Verify':2,'Hold / Needs Review':3};
  rows.sort(function(a,b){return order[a.decision]-order[b.decision] || (b.score==null?-1:b.score)-(a.score==null?-1:a.score) || ((b.scoreRange||[])[0]||0)-((a.scoreRange||[])[0]||0) || (b.evidenceCoverage||0)-(a.evidenceCoverage||0) || (b.openAreaSf||0)-(a.openAreaSf||0)||a.originalIndex-b.originalIndex;});
  rows.forEach(function(r,i){r.rank=i+1;});return rows;
}
function screen(mode,sites) {
  if(['bess','parcel'].indexOf(mode)<0)throw new Error('Unknown screening mode.');
  if(!Array.isArray(sites)||!sites.length||sites.length>500)throw new Error('Supply between 1 and 500 sites.');
  var identities={};
  var rows=sites.map(function(raw,i){
    try {
      if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Invalid site record.');
      var r=mode==='bess'?bess(raw,i):parcel(raw,i);
      var identity=text(raw.taxId||raw.address||raw.name).toLowerCase().replace(/[^a-z0-9]/g,'');
      if(identity&&identities[identity]){r.verify.unshift('Verify duplicate site identity; retained as a separate row.');r.decision='Verify';}
      if(identity)identities[identity]=true;
      return r;
    }catch(e){return {id:text(raw&&raw.id||'site-'+(i+1)),name:text(raw&&raw.name),address:text(raw&&raw.address),originalIndex:i,mode:mode,score:null,decision:'Verify',reasons:[],risks:[],verify:[text(e.message)],nextAction:text(e.message)};}
  });
  return {version:VERSION,mode:mode,checkedAt:new Date().toISOString(),rows:rank(rows),
    methodology:mode==='bess'?'CSK-ESS-001 physical screening: open area 60, parking 20, parcel complexity 10, zoning/flood 10. Full 1000 kW / 3500 kWh; half 500 kW / 1750 kWh. Scores 85+ Priority Go; 65–84 Conditional Go; below 65 Hold. Missing components produce a range, never a passing score.':'Editor Parcel Screening Register engine. Screening rank only; grid voltage is not approved capacity.',
    ranking:'Decision first, then known score, conservative score floor, evidence coverage, open area and source order. Verify rows have unresolved evidence; Hold rows have known constraints.'};
}
module.exports={screen:screen,rank:rank,bess:bess,parcel:parcel,normalize:normalize,number:number,VERSION:VERSION};
