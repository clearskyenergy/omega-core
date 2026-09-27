/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   Licensed GeoJSON adapter. Vendor URL/parameter contract must be confirmed
   against the purchased API; no national coverage is implied by this proxy. */
'use strict';
var auth=require('./_lib/verify-token');
module.exports=function(req,res){
 res.setHeader('Cache-Control','private, no-store');
 if(req.method!=='GET')return res.status(405).json({error:'GET required'});
 return auth.authenticateWithTier(req).then(function (ctx) { return require('./_lib/package-access').withToken(req, ctx, "gridatlas"); }).then(async function(a){
  if(!a.caller.staff && !a.packageAccess && (a.billing.toolOverrides||{}).gridatlas===false)throw auth.httpError(403,'Grid Atlas access required.');
  var key=process.env.FIBER_VENDOR_KEY,base=process.env.FIBER_VENDOR_BASE;
  if(!key||!base)throw auth.httpError(503,'Licensed fiber source is not connected.');
  var bbox=String((req.query||{}).bbox||'').split(',').map(Number);
  if(bbox.length!==4||bbox.some(function(v){return !isFinite(v);})||bbox[0]<-180||bbox[2]>180||bbox[1]<-90||bbox[3]>90||bbox[0]>=bbox[2]||bbox[1]>=bbox[3]||bbox[2]-bbox[0]>10||bbox[3]-bbox[1]>10)throw auth.httpError(400,'Choose a valid map extent smaller than 10 degrees.');
  var url=new URL(base);if(url.protocol!=='https:')throw auth.httpError(503,'Fiber source requires HTTPS.');
  url.searchParams.set('bbox',bbox.join(','));url.searchParams.set('layer','fiber');url.searchParams.set('format','geojson');
  var controller=new AbortController(),timer=setTimeout(function(){controller.abort();},20000);
  try{
   var r=await fetch(url.toString(),{headers:{Authorization:'Bearer '+key},signal:controller.signal,redirect:'error'});
   if(!r.ok)throw auth.httpError(502,'Licensed fiber source request failed.');
   var data=await r.json();
   if(data.type!=='FeatureCollection'||!Array.isArray(data.features))throw auth.httpError(502,'Licensed source did not return GeoJSON routes.');
   return res.status(200).json(data);
  }finally{clearTimeout(timer);}
 }).catch(function(e){res.status(e.status||502).json({error:e.status?e.message:'Fiber source unavailable.'});});
};
