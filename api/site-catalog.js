/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Read-only, authenticated listing snapshots in existing tenant toolData.
 */
'use strict';
var A=require('./_lib/admin'),access=require('./site-score')._helpers.entitle,importer=require('./_lib/site-catalog'),geo=require('./_lib/geocode-listings');
/* One staff call finishes as much of the unplaced remainder as fits in the function's
   60 s ceiling (vercel.json) and publishes; the page calls again until `done`. */
var GEOCODE_BUDGET_MS=38000;
var CACHE=Object.create(null);
async function catalog(db,org){
  var root=db.collection('toolData').doc(org).collection('tools'),snap=await root.doc('sitefinderCatalog').get();
  if(!snap.exists)return {manifest:null,rows:[]};var m=snap.data();
  if(m.kind!=='sitefinder-catalog'||m.orgId!==org||! /^[a-f0-9]{20}$/.test(m.version)||!Number.isInteger(m.pages)||m.pages<1||m.pages>100)throw A.httpError(503,'Invalid listing catalog');
  var c=CACHE[org];if(c&&c.manifest.version===m.version&&Date.now()-c.at<60000)return c;
  var rows=[];
  for(var i=0;i<m.pages;i++){var d=await root.doc('sitefinderCatalog_'+m.version+'_'+i).get();if(!d.exists||!Array.isArray(d.data().rows))throw A.httpError(503,'Listing catalog incomplete');rows=rows.concat(d.data().rows);}
  if(rows.length!==m.count)throw A.httpError(503,'Listing catalog count mismatch');
  if(Object.keys(CACHE).length>20)CACHE=Object.create(null);
  return CACHE[org]={manifest:m,rows:rows,at:Date.now()};
}
function select(data,b){
  var q=String(b.q||'').trim().toLowerCase().slice(0,200),page=Number(b.page||0),limit=100;
  if(!Number.isInteger(page)||page<0||page>1000)throw A.httpError(400,'Invalid page');
  var rows=data.rows.filter(function(r){return !q||[r.fullAddress,r.type,r.subtype].join(' ').toLowerCase().indexOf(q)>=0;});
  if(b.bbox){var box=b.bbox;if(!['n','s','e','w'].every(function(k){return typeof box[k]==='number'&&isFinite(box[k]);})||box.n<=box.s||box.e<=box.w)throw A.httpError(400,'Invalid bounds');rows=rows.filter(function(r){return r.lat!=null&&r.lon!=null&&r.lat>=box.s&&r.lat<=box.n&&r.lon>=box.w&&r.lon<=box.e;});limit=250;}
  return {manifest:data.manifest,total:rows.length,page:page,limit:limit,rows:rows.slice(page*limit,(page+1)*limit),hasMore:(page+1)*limit<rows.length};
}
module.exports=A.handler(async function(req,res){
  res.setHeader('Cache-Control','private, no-store');if(req.method!=='POST')throw A.httpError(405,'POST required');
  var caller=await A.authenticate(req),b=req.body||{},org=A.safeOrg(b.orgId||caller.orgId);
  if(!org)throw A.httpError(400,'Invalid workspace');if(!await A.canActInOrg(caller,org))throw A.httpError(403,'Not your workspace');
  await access(caller,org);
  if(b.action==='import'){
    if(!caller.staff)throw A.httpError(403,'ClearSky staff import required');
    try{importer.validate(b.catalog,org);}catch(e){throw A.httpError(400,e.message);}
    var result=await importer.publish(A.db(),org,b.catalog);delete CACHE[org];return result;
  }
  if(b.action==='geocode'){
    if(!caller.staff)throw A.httpError(403,'ClearSky staff required');
    return finishMatching(A.db(),org,b);
  }
  if(b.action&&b.action!=='search')throw A.httpError(400,'Invalid action');
  return select(await catalog(A.db(),org),b);
});
/* Match the remaining listings to the map. Pass 1 runs the Census geocoder over rows it
   has not tried yet (a time budget, not a row count, bounds one call); once every row
   has been tried, the leftovers take an area centre derived from their matched
   neighbours. Each call publishes a new catalogue version so nothing is lost if the
   browser closes. `reset:true` clears the "attempted" marks and starts over. */
async function finishMatching(db,org,b){
  var data=await catalog(db,org);if(!data.manifest)throw A.httpError(404,'No listing snapshot imported for this workspace');
  var rows=data.rows.map(function(r){return JSON.parse(JSON.stringify(r));});
  if(b.reset)rows.forEach(function(r){if(r.lat==null)r.geocode={status:'unmatched',source:'US Census',accuracy:'unknown'};});
  var pass=await geo.geocodeRows(rows,b._fetchJson||geo.fetchJson,{budgetMs:GEOCODE_BUDGET_MS,concurrency:6});
  var approximate=0;
  if(pass.remaining===0&&!pass.transportError)approximate=geo.areaFallback(rows);
  var changed=pass.matched+approximate>0;
  var result=changed?await importer.publish(db,org,{manifest:{orgId:org,source:data.manifest.source},rows:rows}):null;
  if(changed)delete CACHE[org];
  var m=result?result.manifest:data.manifest,unmatched=rows.filter(function(r){return r.lat==null;}).length;
  return {attempted:pass.attempted,matched:pass.matched,approximate:approximate,transportError:pass.transportError,
    count:m.count,located:m.located,unmatched:unmatched,remainingToTry:pass.remaining,done:pass.remaining===0&&!pass.transportError,version:m.version||null};
}
module.exports._helpers={select:select,catalog:catalog,finishMatching:finishMatching};
