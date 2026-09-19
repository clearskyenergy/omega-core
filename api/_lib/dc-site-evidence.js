/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var fiber=require('./fiber-evidence'),scorer=require('./dc-site-score');
var SOURCES={
 substations:'https://services5.arcgis.com/HDRa0B57OVrv2E1q/ArcGIS/rest/services/Electric_Substations/FeatureServer/0',
 transmission:'https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/US_Electric_Power_Transmission_Lines/FeatureServer/0',
 flood:'https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28',
 market:'https://www.peeringdb.com/api/fac'
};
function parse(input){
 input=input||{};var q=fiber.parseRequest({lat:input.lat,lon:input.lon,radius_km:25,limit:10,requested_capacity_gbps:input.requested_capacity_gbps});
 var profile=input.profile===undefined?'general':input.profile;
 if(['general','ai','edge'].indexOf(profile)<0)throw new Error('Invalid site profile');
 var mw=input.requested_mw;
 if(mw!==undefined&&(mw===null||typeof mw==='boolean'||Array.isArray(mw)||!['number','string'].includes(typeof mw)||String(mw).trim()===''||!isFinite(Number(mw))||Number(mw)<=0||Number(mw)>10000))throw new Error('Invalid requested_mw (0–10000, exclusive of zero)');
 return {lat:q.lat,lon:q.lon,profile:profile,requested_mw:mw===undefined?null:Number(mw),requested_capacity_gbps:q.requested_capacity_gbps};
}
function get(url,params,fetcher){
 var controller=new AbortController(),timeout=setTimeout(function(){controller.abort();},10000);
 return (fetcher||fetch)(url+'?'+new URLSearchParams(params),{signal:controller.signal,headers:{Accept:'application/json','User-Agent':'OMEGA-Grid-Atlas-Screen/1.0'}})
  .then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json();})
  .then(function(j){if(j.error)throw new Error(j.error.message||'Source error');return j;})
  .finally(function(){clearTimeout(timeout);});
}
function attempt(fn){return Promise.resolve().then(fn).catch(function(e){return {status:'failed',error:String(e.message||e).slice(0,160)};});}
function sourceDate(value){if(typeof value==='number'&&value>0&&isFinite(value)){var d=new Date(value);return isFinite(d.getTime())?d.toISOString().slice(0,10):null;}return typeof value==='string'&&value.trim()?value:null;}
function coordsOK(g){
 if(!g)return false;var lines=g.type==='Point'?[[g.coordinates]]:g.type==='LineString'?[g.coordinates]:g.type==='MultiLineString'?g.coordinates:[];
 return lines.length>0&&lines.every(function(line){return line.length>=(g.type==='Point'?1:2)&&line.every(function(c){return Array.isArray(c)&&c.length>=2&&typeof c[0]==='number'&&typeof c[1]==='number'&&isFinite(c[0])&&isFinite(c[1])&&Math.abs(c[0])<=180&&Math.abs(c[1])<=90;});});
}
function power(kind,q,fetcher){
 var box=fiber.boxAround(q.lat,q.lon,25),point=[q.lon,q.lat],url=SOURCES[kind];
 return get(url+'/query',{f:'json',where:'1=1',geometry:JSON.stringify({xmin:box[0],ymin:box[1],xmax:box[2],ymax:box[3],spatialReference:{wkid:4326}}),geometryType:'esriGeometryEnvelope',inSR:4326,outSR:4326,spatialRel:'esriSpatialRelIntersects',returnGeometry:true,outFields:kind==='substations'?'OBJECTID,NAME,STATUS,MAX_VOLT,SOURCEDATE':'OBJECTID,OWNER,STATUS,VOLTAGE,SOURCEDATE',resultRecordCount:1500},fetcher).then(function(j){
  if(!Array.isArray(j.features))throw new Error('Missing feature collection');
  var rows=[],invalid=0;
  j.features.forEach(function(f){var p=f.attributes||{},geom=f.geometry||{},g=kind==='substations'?{type:'Point',coordinates:[geom.x,geom.y]}:{type:'MultiLineString',coordinates:geom.paths||[]};
   if(!coordsOK(g)){invalid++;return;}if(/propos|abandon|retir|out.of.service|under.construction/i.test(p.STATUS||''))return;
   var km=fiber.geometryDistance(point,g)/1000;if(km>25)return;
   var voltage=kind==='substations'?p.MAX_VOLT:p.VOLTAGE;
   rows.push({id:p.OBJECTID,name:p.NAME||p.OWNER||kind,distance_km:Math.round(km*1000)/1000,voltage_kv:typeof voltage==='number'&&voltage>0?voltage:null,reported_status:p.STATUS||'Not stated',source_date:sourceDate(p.SOURCEDATE),source_url:url,retrieved_at:new Date().toISOString()});
  });
  rows.sort(function(a,b){return a.distance_km-b.distance_km;});
  return {status:j.exceededTransferLimit||invalid?'partial':rows.length?'ok':'empty',nearest:rows[0]||null,records_in_radius:rows.length,invalid_geometries:invalid,truncated:!!j.exceededTransferLimit,source_url:url};
 });
}
function floodAt(q,fetcher){return get(SOURCES.flood+'/query',{f:'json',where:'1=1',geometry:q.lon+','+q.lat,geometryType:'esriGeometryPoint',inSR:4326,spatialRel:'esriSpatialRelIntersects',returnGeometry:false,outFields:'FLD_ZONE,ZONE_SUBTY,SFHA_TF,SOURCE_CIT',resultRecordCount:30},fetcher).then(function(j){
 if(!Array.isArray(j.features))throw new Error('Missing flood feature collection');
 var zones=j.features.map(function(f){var a=f.attributes||{};return {zone:String(a.FLD_ZONE||'').toUpperCase(),subtype:a.ZONE_SUBTY||'',sfha:a.SFHA_TF||'',source_citation:a.SOURCE_CIT||null,source_url:SOURCES.flood,retrieved_at:new Date().toISOString()};});
 return {status:j.exceededTransferLimit?'partial':zones.length?'ok':'empty',zones:zones,source_url:SOURCES.flood};
});}
function marketAt(q,fetcher){var b=fiber.boxAround(q.lat,q.lon,100);return get(SOURCES.market,{latitude__gte:b[1],latitude__lte:b[3],longitude__gte:b[0],longitude__lte:b[2],fields:'id,name,latitude,longitude,net_count',limit:1000},fetcher).then(function(j){
 if(!Array.isArray(j.data))throw new Error('Missing facility collection');
 var rows=[];j.data.forEach(function(r){if(r.latitude==null||r.longitude==null||String(r.latitude).trim()===''||String(r.longitude).trim()==='')return;var g={type:'Point',coordinates:[Number(r.longitude),Number(r.latitude)]};if(!coordsOK(g)||!isFinite(Number(r.net_count))||Number(r.net_count)<10)return;var km=fiber.geometryDistance([q.lon,q.lat],g)/1000;if(km<=100)rows.push({id:r.id,name:r.name,distance_km:Math.round(km*100)/100,reported_networks:Number(r.net_count),source_url:'https://www.peeringdb.com/fac/'+encodeURIComponent(r.id),retrieved_at:new Date().toISOString()});});rows.sort(function(a,b){return a.distance_km-b.distance_km;});
 return {status:j.data.length>=1000?'partial':rows.length?'ok':'empty',nearest:rows[0]||null,facilities_in_radius:rows.length};
});}
function collect(input,options){var q=parse(input),fetcher=options&&options.fetch;return Promise.all([
 attempt(function(){var opts={lat:q.lat,lon:q.lon,radius_km:25,limit:10};if(q.requested_capacity_gbps!=null)opts.requested_capacity_gbps=q.requested_capacity_gbps;var out=(options&&options.fiberScreen||fiber.screen)(opts);out.status='ok';return out;}),
 attempt(function(){return power('substations',q,fetcher);}),attempt(function(){return power('transmission',q,fetcher);}),
 attempt(function(){return floodAt(q,fetcher);}),attempt(function(){return marketAt(q,fetcher);})
 ]).then(function(r){var evidence={request:q,fiber:r[0],power:{substations:r[1],transmission:r[2]},flood:r[3],market:r[4]};var out=scorer.build(evidence);out.source_details={substations:r[1],transmission:r[2],fema:r[3],peeringdb:r[4]};return out;});}
module.exports={parse:parse,collect:collect,sources:SOURCES};
