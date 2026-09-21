/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var A=require('./_lib/admin'),D=require('./_lib/buyer-design'),X=require('./_lib/logic-access');
module.exports=A.handler(async function(req,res){
  res.setHeader('Cache-Control','no-store');if(req.method!=='POST')throw A.httpError(405,'POST only');
  var b=req.body||{},caller=await A.authenticate(req),org=A.safeOrg(b.org);
  if(b.customer===true)D.requireEditor(await D.access(caller,org));
  else {var ctx=await X.authorize(caller,org,false);if(!X.subscribed(ctx)||!(ctx.billing.editorLite||{}).enabled)throw A.httpError(403,'Editor Lite access required');}
  if(typeof b.lat!=='number'||typeof b.lng!=='number'||!isFinite(b.lat)||!isFinite(b.lng)||Math.abs(b.lat)>90||Math.abs(b.lng)>180)throw A.httpError(400,'Load a valid site location first');
  var size=Number(b.sizeMw);if(!isFinite(size)||size<=0||size>10000)throw A.httpError(400,'Valid project capacity required');
  // Reuse the existing server-side engine; do not ship or duplicate scoring.
  var result,status=200;await require('./grid-atlas')({method:'POST',headers:{authorization:'Bearer '+(process.env.GRID_ATLAS_KEY||'')},body:{lat:b.lat,lng:b.lng,sizeMw:size,radiusKm:25}},
    {setHeader:function(){},status:function(s){status=s;return this;},json:function(d){result=d;return this;}});
  if(status!==200)throw A.httpError(status,result&&result.error||'Grid Atlas unavailable');return result;
});
