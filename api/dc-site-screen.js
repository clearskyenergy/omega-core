/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var access=require('./_lib/grid-atlas-access'),engine=require('./_lib/dc-site-evidence');
module.exports=function(req,res){
 res.setHeader('Cache-Control','private, no-store');
 if(req.method!=='POST')return res.status(405).json({error:'POST required'});
 return access(req).then(function(){
  var body=req.body;
  if(!body||typeof body!=='object'||Array.isArray(body)){var e=new Error('JSON object required');e.status=400;throw e;}
  try{engine.parse(body);}catch(e){e.status=400;throw e;}
  return engine.collect(body).then(function(result){return res.status(200).json(result);});
 }).catch(function(e){return res.status(e.status||503).json({error:e.status?e.message:'Site evidence could not be collected. No site conclusion is available.'});});
};
