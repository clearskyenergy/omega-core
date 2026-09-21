#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
// Southern Tier Central Regional Planning agency's public STN/Nichols layer.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=path.resolve(__dirname,'../data/usa-fiber');
const url='https://services2.arcgis.com/qO6xd1V1VbSyViir/arcgis/rest/services/Fiber_Route/FeatureServer/0';
const sid='ny-stn-nichols-public';
async function get(endpoint,params){const r=await fetch(endpoint+'?'+new URLSearchParams({f:'json',...params}),{signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error(r.status);const j=await r.json();if(j.error)throw Error(JSON.stringify(j.error));return j;}
(async function(){
  const meta=await get(url,{});if(meta.geometryType!=='esriGeometryPolyline')throw Error('Not a route layer');
  const oid=meta.objectIdField||meta.fields.find(f=>f.type==='esriFieldTypeOID').name;
  const ids=(await get(url+'/query',{where:'1=1',returnIdsOnly:'true'})).objectIds;
  if(!Array.isArray(ids)||!ids.length)throw Error('Missing source records');
  const now=new Date().toISOString(),features=[];
  for(let i=0;i<ids.length;i+=100){
    const j=await get(url+'/query',{objectIds:ids.slice(i,i+100).join(','),outFields:oid,outSR:'4326',returnZ:'false',returnM:'false',returnGeometry:'true'});
    if(j.exceededTransferLimit)throw Error('Incomplete source batch');
    for(const f of j.features){
      const lines=f.geometry.paths,coords=lines.flat();
      if(!lines.length||lines.some(l=>l.length<2)||coords.some(q=>!Number.isFinite(q[0])||!Number.isFinite(q[1])||q[0]<-76.5||q[0]>-76.2||q[1]<41.99||q[1]>42.1))throw Error('Unexpected Nichols geometry');
      const bbox=[Math.min(...coords.map(q=>q[0])),Math.min(...coords.map(q=>q[1])),Math.max(...coords.map(q=>q[0])),Math.max(...coords.map(q=>q[1]))];
      features.push({type:'Feature',bbox,geometry:{type:'MultiLineString',coordinates:lines},properties:{id:sid+'-'+f.attributes[oid],sourceId:sid,sourceUrl:url,source:'Southern Tier Central Regional Planning',name:'STN Nichols FTTH route',carrier:'STN (as published)',category:'unknown',routeStatus:'Published FTTH route; operational status not established',states:['NY'],evidence:'publisher_route',retrievedAt:now,dataDate:null,metadataModified:'2022-08-31T15:56:40.000Z',publishedLineParts:lines.length,networkType:'Local FTTH, not a national backbone',serviceability:'Unconfirmed',routeDiversity:'Unconfirmed'}});
    }
  }
  if(features.length!==ids.length)throw Error('Incomplete download');
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json')));
  manifest.sources=manifest.sources.filter(s=>s.id!==sid).concat([{id:sid,name:'STN Nichols FTTH routes',publisher:'Southern Tier Central Regional Planning and Development Board',url,retrievedAt:now,count:features.length,includedFeatures:features.length,license:'Public agency route layer; attribution retained. No explicit license stated.',sourceItem:'https://www.arcgis.com/home/item.html?id=3037b92988f8450db8ce87f828c579f3',status:'Operational status unverified',rawSha256:crypto.createHash('sha256').update(JSON.stringify(features)).digest('hex')}]);
  manifest.builtAt=now;
  for(const name of ['NY.geojson','overview.geojson']){const file=path.join(root,name),fc=JSON.parse(fs.readFileSync(file));fc.features=fc.features.filter(f=>f.properties.sourceId!==sid).concat(features);fs.writeFileSync(file,JSON.stringify(fc));}
  fs.writeFileSync(path.join(root,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  console.log('New York: '+features.length+' Nichols published route records');
})().catch(e=>{console.error(e);process.exitCode=1;});
