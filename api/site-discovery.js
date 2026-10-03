/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var authorize=require('./_lib/screening-auth'),engine=require('./_lib/site-discovery');
module.exports=async function(req,res){
  res.setHeader('Cache-Control','private, no-store');
  if(req.method!=='POST')return res.status(405).json({error:'POST required.'});
  try{
    var body=typeof req.body==='string'?JSON.parse(req.body):req.body;
    if(!body||Buffer.byteLength(JSON.stringify(body))>500000)return res.status(400).json({error:'Supply a portfolio smaller than 500 KB.'});
    var access=await authorize(req,'discovery');
    var result=engine.rank(body.sites,body.weights);result.orgId=access.caller.orgId;
    return res.status(200).json(result);
  }catch(e){return res.status(e.status||400).json({error:e.message||'Could not rank sites.'});}
};
