/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Read-only, authenticated listing snapshots in existing tenant toolData.
 */
'use strict';
var A=require('./_lib/admin'),access=require('./site-score')._helpers.entitle,importer=require('./_lib/site-catalog');
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
  if(b.action&&b.action!=='search')throw A.httpError(400,'Invalid action');
  return select(await catalog(A.db(),org),b);
});
module.exports._helpers={select:select,catalog:catalog};
