/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var authorize=require('./_lib/screening-auth');
var engine=require('./_lib/portfolio-screening');
module.exports=async function(req,res){
  res.setHeader('Cache-Control','private, no-store');
  if(req.method!=='POST')return res.status(405).json({error:'POST required.'});
  try{
    var body=req.body;
    if(typeof body==='string')body=JSON.parse(body);
    if(!body||['parcel','bess'].indexOf(body.mode)<0||!Array.isArray(body.sites)||!body.sites.length||body.sites.length>500) return res.status(400).json({error:'Choose a screening tool and supply 1–500 sites.'});
    if(Buffer.byteLength(JSON.stringify(body))>3500000)return res.status(413).json({error:'Portfolio is too large. Split the workbook or simplify GIS geometry.'});
    await authorize(req,body.mode);
    return res.status(200).json(engine.screen(body.mode,body.sites));
  }catch(e){return res.status(e.status||400).json({error:e.status?e.message:'Could not screen this portfolio. Check the inputs and retry.'});}
};
