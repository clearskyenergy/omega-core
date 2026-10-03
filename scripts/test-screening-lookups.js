/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
const assert=require('assert');
function response(resolve){return {headersSent:false,setHeader(){},status(n){this.code=n;return this;},json(body){this.headersSent=true;resolve({status:this.code||200,body});return this;},end(){resolve({status:this.code||200});}};}
async function concurrency(){
 const auth=require('../api/_lib/verify-token'),oldAuthenticate=auth.authenticateWithTier;
 auth.authenticateWithTier=async()=>({caller:{staff:true},billing:{tier:'internal'}});
 const originalFetch=global.fetch,oldLayer=process.env.HIFLD_SUBSTATIONS,oldKey=process.env.GRID_ATLAS_KEY;
 process.env.HIFLD_SUBSTATIONS='Test_substations';delete process.env.GRID_ATLAS_KEY;
 global.fetch=async(url,opts)=>{
  if(!String(url).includes('overpass')){await new Promise(r=>setTimeout(r,35));return {ok:false,status:503};}
  const q=decodeURIComponent(String(opts.body).slice(5)),bbox=/\(([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+)\)/.exec(q);
  assert(bbox);const lat=(Number(bbox[1])+Number(bbox[3]))/2,lng=(Number(bbox[2])+Number(bbox[4]))/2;
  await new Promise(r=>setTimeout(r,10));return {ok:true,json:async()=>({elements:[{type:'node',id:Math.round(lat),lat,lon:lng,tags:{power:'substation',name:'Sub '+Math.round(lat),voltage:'138000'}}]})};
 };
 try{
  const handler=require('../api/grid-atlas');
  const call=lat=>new Promise((resolve,reject)=>Promise.resolve(handler({method:'POST',headers:{},body:{lat,lng:-88,radiusKm:10}},response(resolve))).catch(reject));
  const [a,b]=await Promise.all([call(40),call(42)]);
  assert.equal(a.status,200);assert.equal(b.status,200);assert.equal(a.body.substations[0].name,'Sub 40');assert.equal(b.body.substations[0].name,'Sub 42');
  console.log('PASS concurrent Grid Atlas requests keep separate site data');
 }finally{auth.authenticateWithTier=oldAuthenticate;global.fetch=originalFetch;if(oldLayer===undefined)delete process.env.HIFLD_SUBSTATIONS;else process.env.HIFLD_SUBSTATIONS=oldLayer;if(oldKey===undefined)delete process.env.GRID_ATLAS_KEY;else process.env.GRID_ATLAS_KEY=oldKey;}
}
async function approximate(){
 const gatePath=require.resolve('../api/_lib/screening-auth'),gridPath=require.resolve('../api/grid-atlas');
 require(gatePath);require(gridPath);const gate=require.cache[gatePath].exports,grid=require.cache[gridPath].exports;
 require.cache[gatePath].exports=async()=>({caller:{orgId:'test.invalid'}});
 require.cache[gridPath].exports=(req,res)=>{assert.equal(req.body.address,'Ambiguous address');assert.equal(req.body.lat,undefined);return res.status(200).json({lat:41,lng:-88,geocode:{precision:'area',note:'City centroid only'},lines:[{voltageKv:138,distanceKm:1}]});};
 try{
  delete require.cache[require.resolve('../api/portfolio-enrich')];const handler=require('../api/portfolio-enrich');
  const result=await new Promise((resolve,reject)=>Promise.resolve(handler({method:'POST',headers:{},body:{mode:'bess',address:'Ambiguous address',latitude:950,longitude:-88}},response(resolve))).catch(reject));
  assert.equal(result.status,200);assert.deepEqual(result.body.fields,{});assert.equal(result.body.gridEvidence,null);assert.equal(result.body.features.length,0);
  console.log('PASS approximate geocodes cannot become parcel coordinates or grid evidence');
 }finally{require.cache[gatePath].exports=gate;require.cache[gridPath].exports=grid;delete require.cache[require.resolve('../api/portfolio-enrich')];}
}
concurrency().then(approximate).catch(e=>{console.error(e);process.exitCode=1;});
