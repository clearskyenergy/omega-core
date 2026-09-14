/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   Fixed editor commands used by the local MCP server; no arbitrary model JS. */
'use strict';
async function command(arg){
  if(typeof S==='undefined'||typeof _serializeCanvas!=='function')throw Error('Open the complete OMEGA editor first.');
  var user=typeof firebase!=='undefined'&&firebase.auth().currentUser;
  if(!user)throw Error('Sign in to the editor in the browser first.');
  var map=typeof _g3map==='function'?_g3map():window._gmap;
  function state(){return {canvas:_serializeCanvas(),project:typeof _projectId!=='undefined'?_projectId:null,tab:typeof _activeDocTab!=='undefined'?_activeDocTab:null,map:_liveMapState(),gis:window.OmegaGIS?OmegaGIS.layers().map(function(l){return {id:l.id,features:l.features};}):[]};}
  async function revision(){var text=JSON.stringify(state()),bytes=new TextEncoder().encode(text);var digest=await crypto.subtle.digest('SHA-256',bytes);if(text!==JSON.stringify(state()))throw Error('Canvas changed while reading it. Retry.');return Array.from(new Uint8Array(digest)).map(function(n){return n.toString(16).padStart(2,'0');}).join('');}
  if(arg.op==='context')return {revision:await revision(),project:state().project,tab:state().tab,map:state().map,objects:{elements:S.elements,shapes:S.shapes,conduits:S.conduits,trenches:S._trenches||[]},parcel:window._SITE_DATA||{},bill:S.billImport||null};
  if(arg.op==='bill'){
    if(typeof parseUtilityBill!=='function')throw Error('Bill parser unavailable.');
    return parseUtilityBill(String(arg.text||'').slice(0,100000));
  }
  if(arg.op==='address'){
    if(S.elements.length||S.shapes.length||S.conduits.length)throw Error('Use a new empty editor canvas before changing sites.');
    var field=document.getElementById('addr-in');if(!field||typeof fetchMap!=='function')throw Error('Address tool unavailable.');
    field.value=arg.address;fetchMap();return {status:'loading',address:arg.address};
  }
  if(arg.op==='geocode'){
    if(typeof google==='undefined'||!google.maps||!google.maps.Geocoder)throw Error('Map is still loading.');
    return new Promise(function(resolve,reject){new google.maps.Geocoder().geocode({address:arg.address},function(results,status){if(status!=='OK'||!results.length)return reject(Error('Address could not be verified.'));var g=results[0];resolve({lat:g.geometry.location.lat(),lng:g.geometry.location.lng(),formattedAddress:g.formatted_address,partial:!!g.partial_match});});});
  }
  if(arg.op==='parcel'){
    if(!window.OmegaAutopilot)throw Error('Parcel tool unavailable.');
    return OmegaAutopilot.parcel(arg.lat,arg.lng);
  }
  if(arg.op==='site-context'){
    if(!window.OmegaAutopilot||!window.OmegaGIS)throw Error('Site context tools unavailable.');
    var context=await OmegaAutopilot.roads(arg.lat,arg.lng,300);
    return {source:'OpenStreetMap — unverified context',roads:context.roads,buildings:context.buildings,
      layers:OmegaGIS.layers().map(function(layer){return {name:layer.name,features:layer.features};}),
      verified:false};
  }
  if(arg.op==='apply'){
    if(await revision()!==arg.revision)throw Error('Canvas changed after planning. Read context and plan again.');
    if(!map||map.getTilt()>0||Math.abs(map.getHeading()||0)>0.1||!(S.pxPerFt>0))throw Error('Use a north-up, flat, calibrated map before applying.');
    if(typeof _evAdd!=='function'||typeof _geoStampAll!=='function'||typeof _dcfcRenderTrenches!=='function')throw Error('Required editor placement tools are missing.');
    var spec=arg.plan.input,L=arg.plan.layout,origin=arg.plan.origin,ppf=S.pxPerFt;
    function geo(p){return {lat:origin.lat+p.y*0.3048/6378137*180/Math.PI,lng:origin.lng+p.x*0.3048/(6378137*Math.cos(origin.lat*Math.PI/180))*180/Math.PI};}
    function px(p){var g=geo(p),sz=_getCanvasSize(),v=_latLngToPx(g.lat,g.lng,_liveMapState(),sz.w,sz.h);if(!v||!Number.isFinite(v.x)||!Number.isFinite(v.y))throw Error('Cannot project plan onto this map.');return v;}
    function center(r){return {x:r.x+r.w/2,y:r.y+r.h/2};}
    var batteryCenter=center(L.battery.rect),gearCenter=center(L.switchgear),points=L.route.map(px),conduitPoints=[px(batteryCenter)].concat(points,[px(gearCenter)]);
    var backup=_serializeCanvas(),history=S.history.slice(),ids=[];
    try{
      var parcelPts=spec.parcel.map(px);parcelPts.push(Object.assign({},parcelPts[0]));
      var parcelShape={id:uid(),kind:'polyline',pts:parcelPts,label:'Reviewed parcel — agent concept',isSiteBoundary:true,agentRun:arg.id};
      S.shapes.push(parcelShape);renderShape(parcelShape);
      var b=spec.building,buildingPts=[{x:b.x,y:b.y},{x:b.x+b.w,y:b.y},{x:b.x+b.w,y:b.y+b.h},{x:b.x,y:b.y+b.h},{x:b.x,y:b.y}].map(px);
      var buildingShape={id:uid(),kind:'polyline',pts:buildingPts,label:'Reviewed building envelope',agentRun:arg.id};
      S.shapes.push(buildingShape);renderShape(buildingShape);
      function add(kind,r,label){var p=px(center(r)),g=geo(center(r)),e=_evAdd(kind,p.x,p.y,label,'CONCEPT — electrical design pending',null,{lf:r.w,wf:r.h});
        e.w=r.w*ppf;e.h=r.h*ppf;e.x=p.x-e.w/2;e.y=p.y-e.h/2;e.aspect=e.h/e.w;e._geoWFt=r.w;e._geoHFt=r.h;e._geoLat=g.lat;e._geoLng=g.lng;e.agentRun=arg.id;e.engineeringStatus='concept';e.rot=0;renderEl(e);ids.push(e.id);return e;}
      var battery=add('bess',L.battery.rect,spec.battery.model);battery.bessKw=spec.battery.kw;battery.bessKwh=spec.battery.kwh;battery.bessModel=spec.battery.model;battery.bgbRole='bess';
      var gear=add('panel',L.switchgear,spec.switchgear.model);gear.bgbRole='panel';gear.serviceWall=spec.service.wall;gear.mounting=spec.switchgear.mounting;
      var run={id:uid(),pts:points,in:spec.surface,leg:'feeder',agentRun:arg.id,engineeringStatus:'concept',widthFt:spec.constraints.routeWidthFt};
      S._trenches=S._trenches||[];S._trenches.push(run);
      conduitPoints[0].elId=battery.id;conduitPoints[conduitPoints.length-1].elId=gear.id;
      var length=conduitPoints.slice(1).reduce(function(n,p,i){return n+Math.hypot(p.x-conduitPoints[i].x,p.y-conduitPoints[i].y);},0);
      var conduit={id:uid(),pts:conduitPoints,fromId:battery.id,toId:gear.id,condType:'PVC-UG',route:'trench',trenchIn:spec.surface,evRun:run.id,pxLen:length,ftLen:length/ppf,label:'CONCEPT — conductor/protection sizing pending',agentRun:arg.id};
      S.conduits.push(conduit);_geoStampAll();renderConduit(conduit);_dcfcRenderTrenches();
      pushHist();window._workDirty=true;if(typeof _setSaved==='function')_setSaved('unsaved');
      return {status:'applied_unsaved',runId:arg.id,batteryId:battery.id,switchgearId:gear.id,conduitId:conduit.id,trenchId:run.id,revision:await revision()};
    }catch(e){_restoreCanvas(backup);S.history=history;throw Error('Placement rolled back: '+e.message);}
  }
  if(arg.op==='save'){
    if(await revision()!==arg.revision)throw Error('Canvas changed since verification. Verify again before saving.');
    await saveProject();var label=document.getElementById('pn-saved');
    if(!label||!/^(OK )?Saved$/.test(label.textContent.trim()))throw Error('Editor did not confirm a successful save.');
    return {status:'saved',project:state().project};
  }
  throw Error('Unknown editor operation.');
}
module.exports=command;
