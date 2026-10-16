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
  /* Read-only: the editor's own Cost › Trades and Build player answers for
     the drawing as it stands (POST /api/takeoff, /api/build-sequence). They
     price through the server and write nothing; drawing ids stay in the page. */
  if(arg.op==='takeoff'){
    if(!window.OmegaTakeoff||typeof OmegaTakeoff.refresh!=='function')throw Error('Cost \u203a Trades is unavailable in this editor.');
    var ans=await OmegaTakeoff.refresh(true);
    if(!ans)throw Error(OmegaTakeoff._state().err||'The takeoff service did not answer.');
    var q=function(x){return x?x.text:null;};
    return {total:ans.total,contracted:ans.contracted,sources:ans.sources||[],notes:ans.notes||[],
      trades:ans.trades.map(function(t){return {trade:t.label,division:t.div,amount:t.amount,share:t.pct,quantity:q(t.qty),
        lines:t.lines.map(function(l){return {line:l.label,quantity:q(l.qty),amount:l.amount,contingency:!!l.contingency,source:l.source||null,
          rows:(l.rows||[]).map(function(r){return {item:r.label,quantity:q(r.qty),amount:r.amount,source:r.source||null};})};}),
        alsoOnTheDrawing:(t.info||[]).map(function(i){return {item:i.label,quantity:q(i.qty),note:i.note};})};})};
  }
  if(arg.op==='build-sequence'){
    if(!window.OmegaBuildSequence||typeof OmegaBuildSequence.fetch!=='function')throw Error('The build sequence is unavailable in this editor.');
    var seq=await OmegaBuildSequence.fetch();
    return {total:seq.total,schedule:seq.schedule,notes:seq.notes||[],
      steps:seq.phases.map(function(p){return {step:p.label,workingDays:p.days,start:p.start,finish:p.finish,crews:p.crews||null,amount:p.amount,inPlace:p.inPlace,
        lines:p.lines.map(function(l){return {line:l.label,amount:l.amount};}),working:p.basis,notes:p.notes};})};
  }
  /* Build › Read Plans, driven through its own dialog: opened fresh, the
     file handed to it by the MCP server (Playwright sets the dialog's own
     file input), read sheet by sheet through POST /api/plan-read, reviewed,
     placed only as the person approved, then compared with the drawing.
     What a read returns is the review's own words and figures; the sheet
     images and the boxes on them stay in the page. */
  var planRead=function(){
    if(!window.OmegaPlanRead||typeof OmegaPlanRead._state!=='function')throw Error('Read Plans is unavailable in this editor.');
    return OmegaPlanRead;
  };
  if(arg.op==='plans-open'){
    var PRo=planRead(),btn=document.getElementById('rb-plan-read'),cur=PRo._state();
    if(btn&&window.OmegaCaps&&typeof OmegaCaps.allowedElement==='function'&&!OmegaCaps.allowedElement(btn))throw Error('Reading a plan set is part of Omega Design, which this workspace’s plan does not open here.');
    if(cur&&cur.pages&&cur.pages.some(function(p){return p.status==='reading'||p.status==='queued';}))throw Error('Sheets are still being read in this editor. Wait for them to finish.');
    PRo.open();PRo.restart();
    if(!document.getElementById('pr-file'))throw Error('Read Plans did not open.');
    return {status:'open'};
  }
  if(arg.op==='plans-read'){
    var PRr=planRead(),sr=PRr._state();
    if(!sr||!sr.pages||!sr.pages.length)throw Error('No plan set is open in Read Plans.');
    PRr.read();return {status:'reading',sheets:sr.pages.filter(function(p){return p.selected&&p.status!=='done';}).length};
  }
  if(arg.op==='plans-review'){
    var PRv=planRead(),sv=PRv._state();
    if(!sv||!sv.pages||!sv.pages.some(function(p){return p.status==='done';}))throw Error('No sheet of this plan set was read.');
    if(!sv.result)PRv.review();
    return {status:sv.result?'reviewed':'checking'};
  }
  if(arg.op==='plans-state'){
    var ss=planRead()._state(),R=ss&&ss.result,pr=S.planRead||null;
    if(!ss)return {file:null,sheets:[],review:null,error:null};
    var warnEl=document.querySelector('#plan-read-modal .pr-warn[role=alert]');
    var sheetOf=function(page){var x=R&&(R.sheets||[]).filter(function(s){return s.page===page;})[0];return x&&x.number?x.number:'page '+page;};
    var rating=function(it){var r={};['kw','kwh','kva','amps','lengthFt'].forEach(function(k){if(it[k]!=null)r[k]=it[k];});if(it.voltage)r.voltage=it.voltage;return r;};
    return {file:ss.fileName||null,error:warnEl?warnEl.textContent:null,more:ss.cut||0,today:ss.today||null,
      sheets:(ss.pages||[]).map(function(p){var h=p.result&&p.result.sheet||{};return {page:p.page,status:p.status,error:p.error||null,number:h.number||null,title:h.title||null,
        items:p.result?p.result.items.length:null,facts:p.result?p.result.facts.length:null,readBefore:!!p.cached};}),
      review:R?{summary:R.summary,
        items:R.items.map(function(it,i){return {index:i,tag:it.tag||null,kind:it.kindLabel,description:it.description||null,manufacturer:it.manufacturer||null,model:it.model||null,rating:rating(it),
          quantity:it.quantity,sheets:it.pages.map(sheetOf),confidence:it.confidence,words:(it.reads[0]&&it.reads[0].quote)||null,placeable:!!it.place,ticked:!!(it.place&&it.selected),
          readDifferently:it.conflicts.length?it.conflicts:null,note:it.note||null};}),
        facts:R.facts.map(function(f){return {fact:f.label,value:f.unit?f.number:f.text,unit:f.unit||null,words:f.quote||null,sheet:sheetOf(f.page),confidence:f.confidence,
          sheetsAgree:f.agree,alsoReadAs:f.agree?null:f.values.slice(1).map(function(v){return {value:f.unit?v.number:v.text,sheets:v.pages.map(sheetOf)};})};}),
        toCheck:R.issues.map(function(i){return {level:i.level,text:i.text};})}:null,
      placed:!!(pr&&ss.placedId&&pr.id===ss.placedId)};
  }
  if(arg.op==='plans-place'){
    var PRp=planRead(),sp=PRp._state(),Rp=sp&&sp.result;
    if(!Rp)throw Error('Read a plan set first (omega_read_plans).');
    if(sp.placedId&&S.planRead&&S.planRead.id===sp.placedId)throw Error('This read is already on the drawing. Placing it again would put a second copy down; do that from the dialog if it is intended.');
    if(Array.isArray(arg.items)){
      var want={},bad=[];
      arg.items.forEach(function(i){if(!(i>=0&&i<Rp.items.length&&Math.floor(i)===i)||!Rp.items[i].place)bad.push(i);else want[i]=true;});
      if(bad.length)throw Error('Not items that can be placed: '+bad.join(', ')+'. Use the indexes omega_read_plans returned with placeable: true.');
      Rp.items.forEach(function(it,i){it.selected=!!(want[i]&&it.place);});
    }
    if(!Rp.items.some(function(it){return it.selected&&it.place;}))throw Error('Nothing is ticked to place.');
    var n=PRp.place();
    if(!n)throw Error('Nothing was placed.');
    var keep=S.planRead||{};
    return {status:'placed_unsaved',placed:n,configured:keep.configured||0,read:keep.id||null,
      items:(keep.items||[]).filter(function(it){return it.placed;}).map(function(it){return {tag:it.tag||null,kind:it.kind,placed:it.placed,ofPrinted:it.quantity};}),
      next:'Placed in a row at the centre of the view, one undo step, not saved. Drag each into place, then save.'};
  }
  if(arg.op==='plans-changed'){
    var res=await planRead().changes();
    return {file:res.read.fileName,readAt:res.read.readAt,sheets:res.read.sheets,differ:res.differ,summary:res.summary,
      rows:res.rows.map(function(r){return {section:r.sectionLabel,item:r.label,sheet:r.sheet||null,plans:r.plans,drawing:r.drawing,status:r.statusLabel,note:r.note||null};}),
      notes:res.notes,basis:res.basis};
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
