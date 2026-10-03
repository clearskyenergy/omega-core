/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
const assert=require('assert');
const engine=require('../api/_lib/portfolio-screening');
const importer=require('../omega-screening-import');
const SI=require('../omega-site-intel');
let count=0;
function test(name,fn){fn();count++;console.log('PASS '+name);}
function site(extra){return Object.assign({address:'100 Example Street, Example, IL 60601',propertyAreaSf:8062.5,buildingAreaSf:3917,parkingSpaces:0,parcelCount:1,zoning:'RM-5',floodZone:'X'},extra||{});}
test('CSK full and half thresholds preserve the workbook rubric',()=>{
 [[0,45,45],[749,45,45],[750,45,65],[1499,45,65],[1500,65,85],[1999,65,85],[2000,65,100],[2999,65,100],[3000,85,100],[3999,85,100],[4000,100,100]].forEach(([area,f,h])=>{
  const r=engine.bess(site({propertyAreaSf:null,buildingAreaSf:null,openAreaSf:area}),0);
  assert.equal(r.full.score,f);assert.equal(r.half.score,h);
 });
});
test('Reference footprint selection retains full at 85 and chooses half when it improves fit',()=>{
 assert.equal(engine.bess(site(),0).sizing.physicalOption.kw,1000);
 assert.equal(engine.bess(site({buildingAreaSf:5062.5}),0).sizing.physicalOption.kw,1000);
 assert.equal(engine.bess(site({buildingAreaSf:6062.5}),0).sizing.physicalOption.kw,500);
 assert.equal(engine.bess(site({buildingAreaSf:7500}),0).sizing.physicalOption,null);
});
test('Missing input is not zero, a failed site, or a passing score',()=>{
 const r=engine.bess({address:'Only an address'},0);assert.equal(r.score,null);assert.equal(r.decision,'Verify');assert.equal(r.sizing.recommendedKw,null);assert.deepEqual(r.scoreRange,[0,100]);
 const zero=engine.bess(site({parkingSpaces:0}),0),blank=engine.bess(site({parkingSpaces:''}),0);assert.equal(zero.score,100);assert.equal(blank.score,null);assert.deepEqual(blank.scoreRange,[80,100]);
});
test('Invalid numbers and conflicting areas require verification',()=>{
 for(const value of ['0 - 500 kW',Infinity,'NaN',false,'-1'])assert.equal(engine.bess(site({parkingSpaces:value}),0).score,null);
 assert.equal(engine.bess(site({buildingAreaSf:10000}),0).score,null);
 assert.equal(engine.bess(site({openAreaSf:300}),0).score,null);
});
test('Parking, multi-parcel, zoning and flood points are separate',()=>{
 assert.equal(engine.bess(site({parkingSpaces:3}),0).score,92);
 assert.equal(engine.bess(site({parkingSpaces:4,parcelCount:2,floodZone:'AE'}),0).score,71);
 assert.equal(engine.bess(site({floodZone:''}),0).score,null);
});
test('A 0–500 hosting band cannot approve a 500 kW installation',()=>{
 const r=engine.bess(site({hostingBand:'0 - 500 kW'}),0);assert.equal(r.sizing.recommendedKw,null);assert.equal(r.sizing.maxKw,null);assert(r.verify.some(v=>v.includes('utility-approved')));
});
test('Known restrictions cannot retain Priority Go',()=>{
 assert.equal(engine.bess(site({siteControl:false}),0).decision,'Hold / Needs Review');
 assert.equal(engine.bess(site({utilityApprovedKw:0}),0).decision,'Hold / Needs Review');
 assert.equal(engine.bess(site({threePhase:false}),0).decision,'Conditional Go');
});
const documented={objective:'peak shaving',demandReductionKw:200,peakDurationHours:2,usableFraction:.8,dischargeEfficiency:.95,layoutVerified:true,layoutKw:500,layoutKwh:1750,interconnectionVerified:true,utilityApprovedKw:300,utilityApprovedKwh:1000,chargingVerified:true,economicsVerified:true,sizingSource:'Checked layout and utility confirmation, test fixture'};
test('Documented sizing uses power, duration and usable energy consistently',()=>{
 const r=engine.bess(site(documented),0);assert.equal(r.sizing.recommendedKw,200);assert.equal(r.sizing.recommendedKwh,527);assert.equal(r.sizing.maxKw,300);
 assert.equal(engine.bess(site(Object.assign({},documented,{utilityApprovedKw:199})),0).sizing.recommendedKw,null);
 assert.equal(engine.bess(site(Object.assign({},documented,{utilityApprovedKwh:526.5})),0).sizing.recommendedKwh,null);
 assert.equal(engine.bess(site(Object.assign({},documented,{chargingVerified:false})),0).sizing.recommendedKwh,null);
});
test('50 site portfolio retains failed and duplicated records without invented sizes',()=>{
 const rows=Array.from({length:50},(_,i)=>site({address:'Site '+i,id:'s'+i}));rows[10]={address:'Site 10',id:'s10'};rows[12].address=rows[11].address;rows[20].siteControl=false;
 const r=engine.screen('bess',rows);assert.equal(r.rows.length,50);assert.equal(r.rows.find(v=>v.id==='s10').decision,'Verify');assert.equal(r.rows.find(v=>v.id==='s12').decision,'Verify');assert.equal(r.rows[r.rows.length-1].id,'s20');assert(r.rows.every(v=>v.sizing.recommendedKw===null));
});
test('CSV correctly handles commas, quoted line breaks, UTF-8 BOM and formula injection',()=>{
 const r=importer.csv('\ufeffSite address,Notes\r\n"1 Example St, Chicago","First line\nSecond ""quoted"" line"\r\n');assert.equal(r[1][0],'1 Example St, Chicago');assert(r[1][1].includes('"quoted"'));
 assert(importer.toCsv([['=HYPERLINK("x")','+cmd','@test',12]]).includes("'=HYPERLINK"));
 const rows=importer.table(r,importer.detect(r).mapping,0,'test.csv');assert.equal(rows.length,1);
});
test('Manual mapping rejects ambiguous columns and 501 rows without truncating',()=>{
 assert.throws(()=>importer.table([['a','b'],['x','y']],['address','address'],0,'test'));
 assert.throws(()=>importer.table([['Site address']].concat(Array.from({length:501},()=>['Address'])),['address'],0,'test'));
});
test('Workbook units convert explicitly without confusing MW with kW or acres with sf',()=>{
 const rows=[['Site address','Property area (acres)','Target power (MW)','Target energy (MWh)'],['Example address',1,.5,1.75]];
 const mapped=importer.table(rows,importer.detect(rows).mapping,0,'test')[0];
 assert.equal(mapped.propertyAreaSf,43560);assert.equal(mapped.targetKw,500);assert.equal(mapped.targetKwh,1750);
 assert.equal(importer.convert(80,'usableFraction','percent'),.8);
 assert.throws(()=>importer.convert(1,'targetKw','acres'));
});
test('Parcel screening reuses the editor engine with real geometry',()=>{
 const features=[{type:'polygon',coords:[[-88,42],[-87.99,42],[-87.99,42.01],[-88,42.01],[-88,42]],props:{name:'Parcel boundary'}},{type:'line',coords:[[-88,42],[-88,42.01]],props:{name:'138 kV transmission'}}];
 const base=SI.gridScore(SI.intake(features,'Site')),r=engine.parcel({name:'Site',features},0);assert.equal(r.score,base.score);assert.equal(r.grid.kv,base.kv);
 assert.equal(engine.parcel({address:'No geometry yet'},0).score,null);
});
test('Compute uses the Site Map network verdict separately from the power score',()=>{
 const common={name:'Compute candidate',propertyAreaSf:43560*400,gridEvidence:{lines:[{voltageKv:345,distanceKm:.1,circuits:2}],substations:[{voltageKv:345,distanceKm:.1}],pipelines:[{gas:true,diameterIn:30,distanceKm:.1}]}};
 const network={fiber:{verdict:'likely',reasons:['Provider test evidence']},capacity:{class:'regional',routeDiversity:'diverse',independentPaths:2},datacenter:{verdict:'strong',score:80}};
 const good=engine.parcel({...common,networkEvidence:network},0),unknown=engine.parcel(common,0);
 assert.equal(good.decision,'Priority Go');assert.equal(unknown.decision,'Verify');assert.equal(good.score,unknown.score);
 assert.equal(good.connectivity.datacenterScore,80);assert.equal(good.approvedMw,null);assert(good.planningMw>0);
 assert.equal(engine.parcel({...common,networkEvidence:{...network,fiber:{verdict:'unlikely'}}},0).decision,'Hold / Needs Review');
 assert.equal(engine.parcel({...common,networkEvidence:{...network,capacity:{routeDiversity:'single-threaded'}}},0).decision,'Conditional Go');
 const invalid=engine.parcel({...common,networkEvidence:{datacenter:{verdict:'invented',score:999}}},0);assert.equal(invalid.connectivity.datacenterScore,null);assert.equal(invalid.decision,'Verify');
 assert.equal(good.grid.components.find(c=>c.key==='redundancy').points,15);
 assert(good.grid.components.find(c=>c.key==='gas').points>0);
 const noDistance=engine.parcel({...common,gridEvidence:{lines:[{voltageKv:345}],pipelines:[{hazardousLiquid:true,distanceKm:null}]}},0);assert.equal(noDistance.grid.hazardOnParcel,0);
 const hazardous=engine.parcel({...common,gridEvidence:{...common.gridEvidence,pipelines:[{hazardousLiquid:true,distanceKm:.02}]}},0);assert(hazardous.grid.hazardOnParcel>0);assert(hazardous.risks.some(x=>x.includes('easement')));
});
async function authTests(){
 const auth=require('../api/_lib/verify-token'),oldVerify=auth.verifyIdToken,oldRead=auth.readAsCaller;
 const gate=require('../api/_lib/screening-auth');
 let org={status:'active'},bill={tier:'deluxe'},member={status:'active'},outage=false;
 auth.verifyIdToken=async()=>({uid:'u',orgId:'example.com',emailVerified:true,staff:false});
 auth.readAsCaller=async(token,path)=>{if(outage)throw auth.httpError(503,'outage');return path.endsWith('/current')?bill:path.includes('/members/')?member:org;};
 try{
  const req={headers:{authorization:'Bearer test'}};
  await gate(req,'bess');count++;console.log('PASS active billing and membership');
  for(const type of ['disabled','tier','override','allowlist','outage','tenant']){
   org={status:'active'};bill={tier:'deluxe'};member={status:'active'};outage=false;
   if(type==='disabled')member.status='disabled';if(type==='tier')bill.tier='trial';if(type==='override')bill.toolOverrides={bessscreening:false};if(type==='allowlist')member.toolAccess=['parcelscreening'];if(type==='outage')outage=true;if(type==='tenant')org.status='suspended';
   await assert.rejects(gate(req,'bess'));count++;console.log('PASS authorization refuses '+type);
  }
  await assert.rejects(gate({headers:{}},'bess'));count++;console.log('PASS missing token refused');
  org={status:'active'};member={role:'member',status:'active'};outage=false;
  bill={packaged:true,packagingState:'paid',modules:['lite','storage'],accessUntil:Date.now()+86400000};
  await gate(req,'bess');count++;console.log('PASS paid Storage module opens BESS screening');
  await assert.rejects(gate(req,'parcel'));count++;console.log('PASS Storage alone does not grant Parcel screening');
  bill.modules=['lite','siteintel'];await gate(req,'parcel');count++;console.log('PASS paid Intel module opens Parcel screening');
  for(const type of ['viewer','expired','unpaid','member tools']){
   member={role:'member',status:'active'};bill={packaged:true,packagingState:'paid',modules:['lite','storage'],accessUntil:Date.now()+86400000};
   if(type==='viewer')member.role='viewer';if(type==='expired')bill.accessUntil=Date.now()-1;if(type==='unpaid')bill.packagingState='unpaid';if(type==='member tools')member.toolAccess=['editor'];
   await assert.rejects(gate(req,'bess'));count++;console.log('PASS packaged access refuses '+type);
  }
  member={role:'member',status:'active'};bill={tier:'deluxe',toolAccess:[]};
  await assert.rejects(gate(req,'bess'));count++;console.log('PASS empty workspace allowlist is authoritative');
  bill=null;await assert.rejects(gate(req,'bess'));count++;console.log('PASS missing billing is refused');
  bill={tier:'deluxe'};auth.verifyIdToken=async()=>({uid:'u',orgId:'example.com',staff:false});
  await assert.rejects(gate(req,'bess'));count++;console.log('PASS absent email verification is refused');
 }finally{auth.verifyIdToken=oldVerify;auth.readAsCaller=oldRead;}
}
authTests().then(()=>console.log('\n'+count+' screening checks passed.')).catch(e=>{console.error(e);process.exitCode=1;});
