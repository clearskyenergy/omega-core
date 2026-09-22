/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var crypto=require('crypto'),same=require('util').isDeepStrictEqual,detail=require('./listing-detail');
/* Rows per page document. Was 100; a row that carries a captured listing page
   (detailText, up to 3,000 chars) is several times the size of a search-card
   row, and a page document has to stay well inside Firestore's 1 MB. */
var PAGE_ROWS=50;
/* `opts.keepCircuits`: a server pass (circuit attribution, a re-publish after
   geocoding or a captured page) carries each row's attributed circuit through;
   a staff import never does, so an uploaded file cannot name a circuit. */
function validate(data,org,opts){
  if(!data||!data.manifest||data.manifest.orgId!==org||!Array.isArray(data.rows)||!data.rows.length||data.rows.length>10000)throw Error('Invalid catalog or destination');
  var ids=new Set();
  var rows=data.rows.map(function(r){
    if(!r||!/^crexi:\d+$/.test(r.id)||ids.has(r.id)||!r.addr||!r.listed||!/^https:\/\/www\.crexi\.com\/properties\/\d+\//.test(r.listed.url))throw Error('Invalid or duplicate listing');
    ids.add(r.id);var placed=r.lat!==null&&r.lon!==null;
    if(r.id!=='crexi:'+r.listed.url.split('/')[4])throw Error('Listing identity does not match URL');
    if(placed&&(!(typeof r.lat==='number')||!(typeof r.lon==='number')||!isFinite(r.lat)||!isFinite(r.lon)||Math.abs(r.lat)>90||Math.abs(r.lon)>180))throw Error('Invalid coordinates');
    /* A placed row carries its evidence: a Census match, or an area centre derived from
       matched neighbours (api/_lib/geocode-listings.js). Either way the card can say
       how good the pin is; a bare coordinate cannot. */
    if(placed&&(!r.geocode||(r.geocode.status!=='matched'&&!(r.geocode.status==='approximate'&&typeof r.geocode.accuracy==='string'))))throw Error('Location evidence required');
    var out={};['id','listingId','addr','city','state','zip','fullAddress','type','subtype','sqft','lotAcres','observedAt','sourceText','geocode'].forEach(function(k){if(r[k]!==undefined)out[k]=r[k];});
    /* A captured listing page: typed fields only, and the trimmed text they were read from. */
    if(r.detail&&typeof r.detail==='object'){out.detail=detail.sanitize(r.detail);if(typeof r.detailText==='string')out.detailText=detail.trimText(r.detailText);}
    out.lat=placed?r.lat:null;out.lon=placed?r.lon:null;out.photos=[];out.owner={name:''};out.feederId='';out.annualKwh=null;out.src='crexi-import';
    if(opts&&opts.keepCircuits&&placed&&r.circuit&&typeof r.circuit==='object'&&r.circuit.attempted===true){
      var c=r.circuit,st=c.status==='attributed'?'attributed':'none';
      out.circuit={attempted:true,status:st,at:String(c.at||'').slice(0,40),source:String(c.source||'').slice(0,120),service:String(c.service||'').slice(0,80)};
      if(st==='attributed'){
        if(typeof r.feederId!=='string'||!r.feederId.trim()||r.feederId.length>24||typeof r.nameplate!=='number'||!isFinite(r.nameplate)||r.nameplate<0)throw Error('Invalid circuit attribution');
        out.feederId=r.feederId.trim();out.sub=String(r.sub||'').slice(0,40);out.nameplate=r.nameplate;out.queue=typeof r.queue==='number'&&isFinite(r.queue)&&r.queue>0?r.queue:0;
      }
    }
    out.listed={forSale:true,url:r.listed.url,askPrice:typeof r.listed.askPrice==='number'&&isFinite(r.listed.askPrice)?r.listed.askPrice:null,asOf:r.observedAt||''};
    if(Buffer.byteLength(JSON.stringify(out))>20000)throw Error('Listing too large');return out;
  });
  return {rows:rows,version:crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex').slice(0,20),
    manifest:{orgId:org,count:rows.length,located:rows.filter(function(r){return r.lat!==null;}).length,
      approximate:rows.filter(function(r){return r.lat!==null&&r.geocode.status==='approximate';}).length,
      unmatched:rows.filter(function(r){return r.lat===null;}).length,
      circuits:rows.filter(function(r){return !!(r.circuit&&r.circuit.status==='attributed');}).length,
      circuitsTried:rows.filter(function(r){return !!(r.circuit&&r.circuit.attempted);}).length,
      source:String(data.manifest.source||'Imported Crexi snapshot').slice(0,200),snapshot:true}};
}
async function publish(db,org,input,opts){
  var data=validate(input,org,opts),root=db.collection('toolData').doc(org).collection('tools'),ref=root.doc('sitefinderCatalog'),old=await ref.get();
  if(old.exists&&old.data().kind!=='sitefinder-catalog')throw Error('Existing unrelated document');
  var pages=Math.ceil(data.rows.length/PAGE_ROWS),batch=db.batch();
  for(var i=0;i<pages;i++){
    var pageRef=root.doc('sitefinderCatalog_'+data.version+'_'+i),existing=await pageRef.get();
    if(!existing.exists)batch.create(pageRef,{kind:'sitefinder-catalog-page',orgId:org,version:data.version,page:i,rows:data.rows.slice(i*PAGE_ROWS,(i+1)*PAGE_ROWS)});
    else if(!same(existing.data().rows,data.rows.slice(i*PAGE_ROWS,(i+1)*PAGE_ROWS)))throw Error('Existing version differs');
  }
  await batch.commit();
  var verified=0;for(var p=0;p<pages;p++){var s=await root.doc('sitefinderCatalog_'+data.version+'_'+p).get();verified+=s.data().rows.length;}
  if(verified!==data.rows.length)throw Error('Catalog read-back failed');
  var m=Object.assign({},data.manifest,{kind:'sitefinder-catalog',version:data.version,pages:pages,detailed:data.rows.filter(function(r){return !!r.detail;}).length,importedAt:new Date().toISOString(),previousVersion:old.exists?old.data().version:null});
  await db.runTransaction(async function(t){var now=await t.get(ref);if(now.exists!==old.exists||(now.exists&&now.updateTime.toMillis()!==old.updateTime.toMillis()))throw Error('Catalog changed; retry');t.set(ref,m);});
  return {imported:verified,manifest:m,starredSitesModified:false};
}
/* Captured listing pages onto their rows. `captures` is what the bookmarklet
   downloads: [{listingId, url, text, capturedAt}]. A capture for a listing not
   in the catalogue is reported, never added — the catalogue is the verified
   search, and a stray page is not a listing in Cook County. Returns the rows
   (mutated copies) and the tally. Pure apart from the parser. */
function applyCaptures(rows,captures){
  if(!Array.isArray(captures)||!captures.length||captures.length>500)throw Error('Between 1 and 500 captures per import');
  var byId={};rows.forEach(function(r){byId[r.id]=r;});
  var applied=0,unknown=[],fields={};
  captures.forEach(function(c){
    if(!c||typeof c!=='object')throw Error('Invalid capture');
    var id=String(c.listingId||'').replace(/\D/g,'');
    if(!id||typeof c.text!=='string'||!c.text.trim()||c.text.length>60000)throw Error('Invalid capture');
    if(c.url&&!/^https:\/\/www\.crexi\.com\/properties\/\d+\//.test(String(c.url)))throw Error('Capture is not a Crexi listing page');
    if(c.url&&String(c.url).split('/')[4]!==id)throw Error('Capture identity does not match URL');
    var row=byId['crexi:'+id];if(!row){unknown.push(id);return;}
    var at=typeof c.capturedAt==='string'&&!isNaN(Date.parse(c.capturedAt))?new Date(c.capturedAt).toISOString():new Date().toISOString();
    var d=detail.sanitize(detail.parse(c.text,at));
    row.detail=d;row.detailText=detail.trimText(c.text);
    if(d.askPrice!=null&&row.listed)row.listed.askPrice=d.askPrice;
    if(d.sqft!=null&&row.sqft==null)row.sqft=d.sqft;
    if(d.lotAcres!=null&&row.lotAcres==null)row.lotAcres=d.lotAcres;
    Object.keys(d).forEach(function(k){if(k!=='src'&&k!=='capturedAt')fields[k]=(fields[k]||0)+1;});
    applied++;
  });
  return {rows:rows,applied:applied,unknown:unknown,fields:fields};
}
module.exports={validate:validate,publish:publish,applyCaptures:applyCaptures,PAGE_ROWS:PAGE_ROWS};
