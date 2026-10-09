/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var crypto=require('crypto');
var SOURCES={
 projects:{fields:['orgId','address','mapState.address','createdAt','updatedAt'],time:['updatedAt','createdAt']},
 fin_projects:{fields:['orgId','packagedByOrg','mw','ask','status','outcome','sizePending','createdAt','updatedAt'],time:['updatedAt','createdAt']},
 deals:{fields:['orgId','projectId','finProjectId','createdAt','updatedAt'],time:['updatedAt','createdAt']},
 omega_orgs:{fields:['status','updatedAt','createdAt'],time:['updatedAt','createdAt']},
 twin_sources:{fields:['source','parsed','receivedAt','isPrimary','analyzeAttempts','givenUp','lastAnalyzeError'],time:['receivedAt']},
 twin_meetings:{fields:['sourceIds','date','analyzedAt'],time:['analyzedAt']},
 twin_events:{fields:['name','at','staff','tool','props.ok','props.durationMs'],time:['at']},
 sales_activity:{fields:['kind','at'],time:['at']},
 orders:{fields:['orgId','status','createdAt','updatedAt','worksOrderId'],time:['updatedAt','createdAt']},
 plant_units:{fields:['orgId','woId','updatedAt','createdAt'],time:['updatedAt','createdAt']}
};
var CAP=1000;
function notetaker(d){return d.parsed===false&&['readai','otter','fireflies','live'].includes(d.source)&&d.isPrimary!==false;}
function failureKind(d){var e=String(d.lastAnalyzeError||'').toLowerCase();return /credit balance|insufficient_quota|billing/.test(e)?'provider billing':/auth|api.key|401|403|permission/.test(e)?'provider access':/model.*not|not.*model|404/.test(e)?'model availability':/parse|json|schema/.test(e)?'response format':e?'other recorded error':'no recorded error';}
function iso(v){if(v&&typeof v.toDate==='function')v=v.toDate();var n=v instanceof Date?v.getTime():typeof v==='string'?Date.parse(v):NaN;return Number.isFinite(n)?new Date(n).toISOString():null;}
function domain(v){var n=String(v||'').trim().toLowerCase();return {'fenecon.de':'fenecon.com','fenecon.us':'fenecon.com'}[n]||n;}
function positive(v){return (typeof v==='number'||(typeof v==='string'&&v.trim()!==''))&&Number.isFinite(Number(v))&&Number(v)>0;}
function analyze(data,health,at){
 var findings=[], checks=[];var by={};health.forEach(function(s){by[s.source]=s;});
 function known(c){return by[c]&&by[c].status!=='unavailable';}
 function complete(c){return known(c)&&!by[c].truncated;}
 function rows(c){return data[c]||[];}
 function add(id,source,title,desk,predicate,next,metric){
  var available=known(source),hits=available?rows(source).filter(predicate):[];
  checks.push({id:id,source:source,status:available?(by[source].truncated?'partial':'checked'):'unavailable',matched:available?hits.length:null});
  if(!available||!hits.length)return;
  findings.push({id:id,title:title,desk:desk,count:hits.length,countScope:by[source].truncated?'observed subset':'scanned records',baselineMetric:metric,next:next,
    evidence:hits.slice(0,20).map(function(d){return {ref:source+'/'+d.id,observedAt:at};}),evidenceLimited:hits.length>20});
 }
 add('project-org-missing','projects','Projects lack an owning organization','software',d=>!domain(d.orgId),'Reconcile ownership with the source owner; never guess or auto-assign a tenant.','projects missing orgId');
 add('project-address-missing','projects','Projects lack a usable site address','support',d=>!String(d.address||(d.mapState||{}).address||'').trim(),'Request an address through the existing project workflow.','projects missing address');
 if(complete('omega_orgs')){
  var orgs=new Set(rows('omega_orgs').map(d=>domain(d.id)).concat(['clearsky-usa.com']));
  add('project-org-unresolved','projects','Project ownership does not resolve to the tenant registry','software',d=>domain(d.orgId)&&!orgs.has(domain(d.orgId)),'Review aliases and tenant provenance before proposing a repair.','unresolved project organizations');
 }
 add('finance-size-missing','fin_projects','Financing records lack positive MW','billing',d=>!positive(d.mw),'Verify engineering size and its dated source; request missing evidence.','financing records without valid MW');
 add('finance-size-pending','fin_projects','Financing size remains unsettled','billing',d=>d.sizePending===true,'Resolve the sizing decision before making underwriting claims.','financing records with pending size');
 add('finance-ask-missing','fin_projects','Active financing records lack a positive funding ask','billing',d=>d.outcome==='active'&&!positive(d.ask),'Reconcile the funding ask to a costed, versioned financial model.','active financing records without valid ask');
 add('finance-draft','fin_projects','Financing packages remain drafts','sales',d=>d.status==='draft','Check actual blocker and obtain required evidence before submission.','draft financing packages');
 ['projects','fin_projects'].forEach(function(target){var field=target==='projects'?'projectId':'finProjectId';
  if(complete(target)){var ids=new Set(rows(target).map(d=>d.id));add('deal-link-'+target,'deals','Deal links do not resolve to '+target,'software',d=>d[field]&&!ids.has(d[field]),'Reconcile the exact linked ID. Similar names are not proof of identity.','unresolved '+field+' links');}
  else checks.push({id:'deal-link-'+target,source:target,status:'unavailable',matched:null});
 });
 add('meeting-source-link','twin_meetings','Meetings have no source reference','admin',d=>!Array.isArray(d.sourceIds)||!d.sourceIds.length,'Verify the meeting writer and capture a canonical source reference.','meetings without sourceIds');
 if(complete('twin_sources')){var srcIds=new Set(rows('twin_sources').map(d=>d.id));add('meeting-source-unresolved','twin_meetings','Meeting source references do not resolve','admin',d=>Array.isArray(d.sourceIds)&&d.sourceIds.some(id=>!srcIds.has(id)),'Check canonical source IDs and retention before treating this as data loss.','unresolved meeting sourceIds links');}
 add('meeting-ingest-pending','twin_sources','Primary notetaker sources await analysis','admin',d=>notetaker(d)&&(Number(d.analyzeAttempts)||0)<3,'Inspect the existing analysis queue and its errors. Do not create a second ingest queue.','eligible unparsed primary notetaker sources');
 add('meeting-ingest-exhausted','twin_sources','Primary notetaker sources reached the retry limit','admin',d=>notetaker(d)&&(Number(d.analyzeAttempts)||0)>=3,'Verify the provider and error before proposing a bounded retry through the twin. Do not reset attempts automatically.','exhausted primary notetaker sources');
 add('platform-recorded-errors','twin_events','Customer sessions recorded errors or failed tool runs','software',d=>!d.staff&&(d.name==='tool.error'||(d.name==='tool.run'&&(d.props||{}).ok===false)),'Retrieve the cited event in the authorized diagnostic workflow, reproduce it, then propose a tested fix.','observed error events in scanned window');
 add('platform-slow-runs','twin_events','Customer tool runs exceeded ten seconds','software',d=>!d.staff&&d.name==='tool.run'&&Number((d.props||{}).durationMs)>10000,'Measure the affected workflow before and after a performance change.','observed tool runs over 10 seconds');
 var revisions=health.map(s=>[s.source,s.total,s.scanned,s.latest,s.status]);
 return {ok:true,status:health.some(s=>s.status==='unavailable'||s.truncated)?'partial':'read_complete',version:1,asOf:at,packetId:crypto.createHash('sha256').update(JSON.stringify([revisions,findings])).digest('hex').slice(0,20),
  purpose:'Internal operational improvement; evidence-backed proposals, not autonomous customer changes.',sources:health,checks:checks,findings:findings,
  connections:[{from:'deals.projectId',to:'projects document ID',method:'exact ID',checked:complete('deals')&&complete('projects')},{from:'deals.finProjectId',to:'fin_projects document ID',method:'exact ID',checked:complete('deals')&&complete('fin_projects')},{from:'twin_meetings.sourceIds[]',to:'twin_sources document ID',method:'exact ID',checked:complete('twin_meetings')&&complete('twin_sources')}],
  ingest:{primaryUnparsed:rows('twin_sources').filter(notetaker).length,secondaryUnparsed:rows('twin_sources').filter(d=>d.parsed===false&&d.isPrimary===false).length,failures:rows('twin_sources').filter(d=>notetaker(d)&&Number(d.analyzeAttempts)>=3).reduce((a,d)=>{var k=failureKind(d);a[k]=(a[k]||0)+1;return a;},{})},
  bankability:{status:'not_assessed',meaning:'This checks recorded data and link integrity, not lender acceptance or investment quality.',requiredEvidence:['Site control and executed rights','Utility capacity and interconnection evidence','Engineering, equipment performance and warranties','Permits and environmental review','Contracted or independently supported revenues','Versioned capex, opex, financing assumptions and sensitivities','Counterparty, insurance and legal review','Operating results and repayment evidence'],source:'https://www.energy.gov/edf/application-process'},
  improvementContract:{required:['finding ID and source references','baseline metric and observation window','proposed change and expected benefit','test or independent review','approval and release reference','measured outcome using a comparable window'],status:'proposal_only',warning:'Cross-tenant observations can inform internal product fixes, never another customer’s price or terms. Do not publish these records or use them for model training without separate authorization.'},
  gaps:['Drive, attachments, phone history and local vault are not scanned by this reader.','Availability of a collection does not prove its producer is healthy. Latest observed time is not a successful-ingest heartbeat.','Missing dates remain unknown; a capped scan cannot prove absence.','No outcomes are claimed until a change and its effect have been measured.']};
}
async function collect(read,now){var at=(now||new Date()).toISOString(),data={},health=[];await Promise.all(Object.keys(SOURCES).map(async function(name){
 try{var r=await read(name,SOURCES[name].fields,CAP);if(!Array.isArray(r.rows)||!Number.isSafeInteger(r.total))throw Error('invalid read');var rows=r.rows.slice(0,CAP);data[name]=rows;
 var dates=rows.flatMap(d=>SOURCES[name].time.map(k=>iso(d[k])).filter(Boolean)).sort();var latest=dates.length?dates[dates.length-1]:null;
 health.push({source:name,status:rows.length?'read':'empty',scanned:rows.length,total:r.total,truncated:r.total>rows.length,latest:latest,ageHours:latest?Math.round((Date.parse(at)-Date.parse(latest))/3600000):null,missingTimestamp:rows.filter(d=>!SOURCES[name].time.some(k=>iso(d[k]))).length});
 }catch(e){data[name]=[];health.push({source:name,status:'unavailable',scanned:null,total:null,truncated:true,latest:null,ageHours:null,missingTimestamp:null});}
}));return analyze(data,health.sort((a,b)=>a.source.localeCompare(b.source)),at);}
function forDesk(packet,desk){if(!['admin','software','support','sales','billing','legal','marketing','plan','incentive','linkedin'].includes(desk))throw Error('Unknown desk');
 var allow=desk==='admin'||desk==='plan'?null:desk==='support'?['support','software']:desk==='legal'?['billing']:desk==='marketing'||desk==='linkedin'||desk==='incentive'?[]:[desk];
 var p=Object.assign({},packet,{desk:desk,findings:packet.findings.filter(f=>!allow||allow.includes(f.desk))});
 // Departments receive record references and fixed diagnostic labels, never private message content or customer economics.
 return p;
}
module.exports={collect:collect,analyze:analyze,forDesk:forDesk,sources:SOURCES};
