/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var crypto=require('crypto'),same=require('util').isDeepStrictEqual;
function validate(data,org){
  if(!data||!data.manifest||data.manifest.orgId!==org||!Array.isArray(data.rows)||!data.rows.length||data.rows.length>10000)throw Error('Invalid catalog or destination');
  var ids=new Set();
  var rows=data.rows.map(function(r){
    if(!r||!/^crexi:\d+$/.test(r.id)||ids.has(r.id)||!r.addr||!r.listed||!/^https:\/\/www\.crexi\.com\/properties\/\d+\//.test(r.listed.url))throw Error('Invalid or duplicate listing');
    ids.add(r.id);var placed=r.lat!==null&&r.lon!==null;
    if(r.id!=='crexi:'+r.listed.url.split('/')[4])throw Error('Listing identity does not match URL');
    if(placed&&(!(typeof r.lat==='number')||!(typeof r.lon==='number')||!isFinite(r.lat)||!isFinite(r.lon)||Math.abs(r.lat)>90||Math.abs(r.lon)>180))throw Error('Invalid coordinates');
    if(placed&&(!r.geocode||r.geocode.status!=='matched'))throw Error('Location evidence required');
    var out={};['id','listingId','addr','city','state','zip','fullAddress','type','subtype','sqft','lotAcres','observedAt','sourceText','geocode'].forEach(function(k){if(r[k]!==undefined)out[k]=r[k];});
    out.lat=placed?r.lat:null;out.lon=placed?r.lon:null;out.photos=[];out.owner={name:''};out.feederId='';out.annualKwh=null;out.src='crexi-import';
    out.listed={forSale:true,url:r.listed.url,askPrice:typeof r.listed.askPrice==='number'&&isFinite(r.listed.askPrice)?r.listed.askPrice:null,asOf:r.observedAt||''};
    if(Buffer.byteLength(JSON.stringify(out))>12000)throw Error('Listing too large');return out;
  });
  return {rows:rows,version:crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex').slice(0,20),
    manifest:{orgId:org,count:rows.length,located:rows.filter(function(r){return r.lat!==null;}).length,source:String(data.manifest.source||'Imported Crexi snapshot').slice(0,200),snapshot:true}};
}
async function publish(db,org,input){
  var data=validate(input,org),root=db.collection('toolData').doc(org).collection('tools'),ref=root.doc('sitefinderCatalog'),old=await ref.get();
  if(old.exists&&old.data().kind!=='sitefinder-catalog')throw Error('Existing unrelated document');
  var pages=Math.ceil(data.rows.length/100),batch=db.batch();
  for(var i=0;i<pages;i++){
    var pageRef=root.doc('sitefinderCatalog_'+data.version+'_'+i),existing=await pageRef.get();
    if(!existing.exists)batch.create(pageRef,{kind:'sitefinder-catalog-page',orgId:org,version:data.version,page:i,rows:data.rows.slice(i*100,(i+1)*100)});
    else if(!same(existing.data().rows,data.rows.slice(i*100,(i+1)*100)))throw Error('Existing version differs');
  }
  await batch.commit();
  var verified=0;for(var p=0;p<pages;p++){var s=await root.doc('sitefinderCatalog_'+data.version+'_'+p).get();verified+=s.data().rows.length;}
  if(verified!==data.rows.length)throw Error('Catalog read-back failed');
  var m=Object.assign({},data.manifest,{kind:'sitefinder-catalog',version:data.version,pages:pages,importedAt:new Date().toISOString(),previousVersion:old.exists?old.data().version:null});
  await db.runTransaction(async function(t){var now=await t.get(ref);if(now.exists!==old.exists||(now.exists&&now.updateTime.toMillis()!==old.updateTime.toMillis()))throw Error('Catalog changed; retry');t.set(ref,m);});
  return {imported:verified,manifest:m,starredSitesModified:false};
}
module.exports={validate:validate,publish:publish};
