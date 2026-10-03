/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var authorize=require('./_lib/screening-auth');
var num=require('./_lib/portfolio-screening').number;
/* Reuse the editor's deployed providers. No user-controlled upstream URLs. */
function invoke(handler,req,timeout){
  return new Promise(function(resolve,reject){
    var settled=false,status=200,timer=setTimeout(function(){finish(null,{error:'Lookup timed out.'},504);},timeout);
    function finish(error,body,code){if(settled)return;settled=true;clearTimeout(timer);if(error)reject(error);else resolve({status:code||status,body:body||{}});}
    var res={headersSent:false,setHeader:function(){},status:function(n){status=n;return res;},json:function(body){res.headersSent=true;finish(null,body);return res;},end:function(){finish(null,{});}};
    try{Promise.resolve(handler(req,res)).catch(function(e){finish(e);});}catch(e){finish(e);}
  });
}
module.exports=async function(req,res){
  res.setHeader('Cache-Control','private, no-store');
  if(req.method!=='POST')return res.status(405).json({error:'POST required.'});
  try{
    var b=typeof req.body==='string'?JSON.parse(req.body):req.body;
    if(!b||['bess','parcel'].indexOf(b.mode)<0)return res.status(400).json({error:'Screening mode is required.'});
    await authorize(req,b.mode);
    var lat=num(b.latitude),lng=num(b.longitude),address=String(b.address||'').trim().slice(0,500);
    var validCoords=lat!=null&&lng!=null&&Math.abs(lat)<=90&&Math.abs(lng)<=180;
    if(!validCoords&&!address)return res.status(400).json({error:'Supply an address or valid coordinates.'});
    var notes=[],result={checkedAt:new Date().toISOString(),fields:{},features:[],notes:notes};
    var body=validCoords?{lat:lat,lng:lng,radiusKm:10}:{address:address,radiusKm:10};
    var atlas=await invoke(require('./grid-atlas'),{method:'POST',headers:req.headers,body:body},25000);
    if(atlas.status!==200){notes.push('Verify grid/location: lookup unavailable or address unmatched.');return res.status(200).json(result);}
    var a=atlas.body;
    result.gridEvidence={lines:(a.lines||[]).slice(0,50),substations:(a.substations||[]).slice(0,50),sources:a.sources||{},checkedAt:result.checkedAt};
    result.resolvedAddress=a.resolvedAddress;
    if(a.geocode&&a.geocode.precision!=='exact'){
      notes.push('Verify location: '+(a.geocode.note||'the address match is approximate')+'. No parcel was selected.');
      result.gridEvidence=null;return res.status(200).json(result);
    }
    result.fields.latitude=a.lat;result.fields.longitude=a.lng;
    var p;
    try{p=await invoke(require('./parcel'),{method:'POST',headers:req.headers,body:{lat:a.lat,lng:a.lng}},18000);}catch(e){p={status:502,body:{}};}
    if(p.status===200&&p.body.ok){
      var parcel=p.body;result.parcelSource=parcel.source;
      if(num(parcel.acres)>0)result.fields.propertyAreaSf=Math.round(num(parcel.acres)*43560);
      if(parcel.apn)result.fields.taxId=String(parcel.apn);
      if(parcel.zoning)result.fields.zoning=String(parcel.zoning);
      if(Array.isArray(parcel.ring)&&parcel.ring.length>=3){
        var ring=parcel.ring.map(function(v){return [v[1],v[0]];});ring.push(ring[0]);
        result.features=[{type:'polygon',coords:ring,props:{name:'Parcel boundary'}}];
      }
      notes.push('Verify the selected parcel against the address/PIN; mapped parcel area does not establish buildable area.');
    }else notes.push('Verify parcel: no parcel source returned a usable boundary.');
    notes.push('Verify building footprint, parking, flood zone, service capacity and site-specific utility approval; these are not established by nearby grid infrastructure.');
    return res.status(200).json(result);
  }catch(e){return res.status(e.status||502).json({error:e.status?e.message:'Site lookup is unavailable. Supplied workbook data can still be screened.'});}
};
