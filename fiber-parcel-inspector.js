/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
(function(w){
'use strict';
var A=w.GA_FIBER;if(!A)return;
var L=A.L,map=A.map,registry=[],selected=null,mode='navigate',vertices=[],version=0,parcelVersion=0,lastResult=null,timer;
map.createPane('parcelContext');map.getPane('parcelContext').style.zIndex=410;
map.createPane('parcelBoundary');map.getPane('parcelBoundary').style.zIndex=450;
map.getPane('parcelBoundary').style.pointerEvents='none';
var parcels=L.layerGroup().addTo(map),boundaryLayer=L.layerGroup().addTo(map),evidenceLayer=L.layerGroup().addTo(map);
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function link(url,label){return /^https:\/\//.test(url||'')?'<a href="'+esc(url)+'" target="_blank" rel="noopener">'+esc(label)+'</a>':'';}
var panel=document.createElement('section');panel.className='fp-panel';panel.id='fiberParcelInspector';
panel.innerHTML='<h2>Parcel + fiber inspection</h2><p>View published routes against a parcel boundary. No line here is a utility locate or a service guarantee.</p><form id="fpLocate"><div class="fp-grid"><label>Latitude<input name="lat" aria-label="Parcel latitude" type="number" min="-85" max="85" step="any" required></label><label>Longitude<input name="lon" aria-label="Parcel longitude" type="number" min="-180" max="180" step="any" required></label></div><button>Go to coordinates</button></form><label for="fpBasemap">Basemap</label><select id="fpBasemap"><option value="street">Street map</option><option value="aerial">Aerial imagery (date varies)</option></select><label for="fpCounty">Public parcel boundaries</label><select id="fpCounty"><option value="">Off — draw or import anywhere</option></select><button id="fpCountyGo" type="button">Go to selected county</button><p id="fpParcelStatus" role="status">Loading county source list…</p><div class="fp-actions"><button id="fpDraw" type="button">Draw boundary</button><button id="fpUndo" type="button" disabled>Undo point</button><button id="fpFinish" type="button" disabled>Finish boundary</button><button id="fpClear" type="button">Clear selection</button></div><details><summary>Import a parcel boundary</summary><label for="fpGeoJSON">Paste WGS84 GeoJSON Polygon / MultiPolygon</label><textarea id="fpGeoJSON" rows="4" placeholder="GeoJSON geometry, Feature, or a single-feature collection"></textarea><button id="fpImport" type="button">Use GeoJSON boundary</button><small>All parts and holes are retained. Pasted attributes are discarded. The geometry stays in this browser until you request server inspection.</small></details><p id="fpSelection" role="status">Select a county parcel, draw a boundary, or import GeoJSON.</p><div class="fp-grid"><label>Search radius<select id="fpRadius"><option value="0.25">250 m</option><option value="1" selected>1 km</option><option value="5">5 km</option></select></label><div><button id="fpInspect" type="button" disabled>Inspect parcel fiber</button></div></div><div class="fp-actions"><button id="fpBoundaryExport" type="button" disabled>Export boundary</button><button id="fpResultExport" type="button" disabled>Export evidence</button></div><div id="fpResult" aria-live="polite"></div><p class="fp-note">Public county coverage is partial. Boundaries are tax-map geometry, not surveys. Drawing/import works nationwide. Authenticated inspection uses the complete bundled inventory regardless of map filters; no nationwide completeness or survey accuracy is claimed.</p>';
var aside=document.querySelector('aside');aside.insertBefore(panel,aside.firstChild);
function el(id){return document.getElementById(id);}
var locate=el('fpLocate'),county=el('fpCounty'),status=el('fpParcelStatus'),selection=el('fpSelection'),out=el('fpResult'),inspect=el('fpInspect'),radius=el('fpRadius');
if(A.initialCoordinate){locate.elements.lat.value=A.initialCoordinate.lat;locate.elements.lon.value=A.initialCoordinate.lng;}
var street=A.streetLayer,aerial=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,attribution:'Imagery © Esri, Maxar, Earthstar Geographics and the GIS User Community'});
el('fpBasemap').onchange=function(){if(this.value==='aerial'){if(street)map.removeLayer(street);aerial.addTo(map);}else{map.removeLayer(aerial);if(street)street.addTo(map);}};
function download(data,name){var url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:/\.geojson$/.test(name)?'application/geo+json':'application/json'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(function(){URL.revokeObjectURL(url);},1000);}
function invalidate(){version++;lastResult=null;evidenceLayer.clearLayers();el('fpResultExport').disabled=true;inspect.disabled=!selected;out.textContent='';}
function setMode(next){mode=next;A.parcelDrawing=next==='draw';el('fpDraw').textContent=next==='draw'?'Drawing — click corners':'Draw boundary';el('fpUndo').disabled=next!=='draw'||!vertices.length;el('fpFinish').disabled=next!=='draw'||vertices.length<3;}
function clear(){selected=null;vertices=[];setMode('navigate');boundaryLayer.clearLayers();invalidate();el('fpBoundaryExport').disabled=true;selection.textContent='Select a county parcel, draw a boundary, or import GeoJSON.';}
function geometry(value){
 var g=value;if(g&&g.type==='FeatureCollection'){if(!Array.isArray(g.features)||g.features.length!==1)throw new Error('Import one parcel feature at a time; use MultiPolygon for multiple parts.');g=g.features[0];}
 if(g&&g.type==='Feature')g=g.geometry;
 if(!g||['Polygon','MultiPolygon'].indexOf(g.type)<0)throw new Error('Use a WGS84 Polygon or MultiPolygon.');
 var polys=g.type==='Polygon'?[g.coordinates]:g.coordinates,count=0;
 if(!Array.isArray(polys)||!polys.length||polys.length>20)throw new Error('Use 1–20 polygon parts.');
 polys.forEach(function(p){if(!Array.isArray(p)||!p.length||p.length>20)throw new Error('Invalid polygon rings.');p.forEach(function(r){if(!Array.isArray(r)||r.length<4)throw new Error('Every ring needs three corners and a closing coordinate.');count+=r.length;r.forEach(function(c){if(!Array.isArray(c)||c.length<2||typeof c[0]!=='number'||typeof c[1]!=='number'||!isFinite(c[0])||!isFinite(c[1])||Math.abs(c[0])>180||Math.abs(c[1])>85)throw new Error('Invalid WGS84 coordinates.');});if(r[0][0]!==r[r.length-1][0]||r[0][1]!==r[r.length-1][1])throw new Error('Close every GeoJSON ring.');});});
 if(count>1000)throw new Error('Use no more than 1,000 boundary vertices.');
 return {type:g.type,coordinates:JSON.parse(JSON.stringify(g.coordinates))};
}
function choose(g,origin,fit){
 g=geometry(g);selected={type:'Feature',geometry:g,properties:{boundary_source:origin,accuracy:'Unverified; not a survey',selected_at:new Date().toISOString()}};
 setMode('navigate');invalidate();boundaryLayer.clearLayers();var layer=L.geoJSON(selected,{pane:'parcelBoundary',style:{color:'#ffe278',weight:3,fillOpacity:.07},interactive:false}).addTo(boundaryLayer);
 el('fpBoundaryExport').disabled=false;selection.textContent=origin+'. Yellow outline = selected boundary. Route crossings remain unverified.';
 if(fit)map.fitBounds(layer.getBounds().pad(.6),{maxZoom:18});
 var c=layer.getBounds().getCenter();locate.elements.lat.value=c.lat.toFixed(6);locate.elements.lon.value=c.lng.toFixed(6);
 map.fire('parcel-selected',{latlng:c});
}
function draw(){boundaryLayer.clearLayers();if(vertices.length)L.polyline(vertices,{pane:'parcelBoundary',color:'#ffe278',weight:3,interactive:false}).addTo(boundaryLayer);vertices.forEach(function(p){L.circleMarker(p,{pane:'parcelBoundary',radius:4,color:'#ffe278',interactive:false}).addTo(boundaryLayer);});setMode('draw');selection.textContent=vertices.length+' corners. Click more corners, then Finish boundary. A drawn outline is not a legal parcel.';}
el('fpDraw').onclick=function(){clear();setMode('draw');selection.textContent='Click the parcel corners on the map, then Finish boundary.';};
el('fpUndo').onclick=function(){vertices.pop();draw();};
el('fpFinish').onclick=function(){if(vertices.length<3)return;var ring=vertices.map(function(p){return [p.lng,p.lat];});ring.push(ring[0].slice());try{choose({type:'Polygon',coordinates:[ring]},'User-drawn boundary (unverified)',false);}catch(e){selection.textContent=e.message;}};
el('fpClear').onclick=clear;
el('fpImport').onclick=function(){try{choose(JSON.parse(el('fpGeoJSON').value),'User-imported geometry (unverified)',true);}catch(e){selection.textContent=e.message;}};
el('fpBoundaryExport').onclick=function(){if(selected)download(selected,'parcel-boundary.geojson');};
el('fpResultExport').onclick=function(){if(lastResult)download(lastResult,'parcel-fiber-evidence.json');};
radius.onchange=invalidate;
map.on('click',function(e){if(mode==='draw'){vertices.push(e.latlng);draw();}});
locate.onsubmit=function(e){e.preventDefault();if(!locate.reportValidity())return;clear();var state=el('usaFiberState');if(state)state.value='';map.setView([Number(locate.elements.lat.value),Number(locate.elements.lon.value)],17);};
locate.addEventListener('input',clear);
function currentSource(){return registry.filter(function(s){return s.id===county.value;})[0];}
county.onchange=function(){parcelVersion++;parcels.clearLayers();clear();loadParcels();};
el('fpCountyGo').onclick=function(){var s=currentSource();if(!s){status.textContent='Choose a county first.';return;}clear();locate.elements.lat.value=s.center[0];locate.elements.lon.value=s.center[1];var state=el('usaFiberState');if(state)state.value=s.state;map.setView(s.center,17);};
function loadParcels(){
 var run=++parcelVersion,s=currentSource();parcels.clearLayers();
 if(!s){status.textContent='County overlay off. Draw/import is available in any state.';return;}
 if(map.getZoom()<16){status.textContent='Zoom to level 16+ or use Go to selected county to load parcel outlines.';return;}
 var b=map.getBounds(),v=[b.getWest(),b.getSouth(),b.getEast(),b.getNorth()];
 if(v[0]>s.bbox[2]||v[2]<s.bbox[0]||v[1]>s.bbox[3]||v[3]<s.bbox[1]){status.textContent='Outside '+s.name+'. Choose the correct county or draw/import a boundary.';return;}
 if(v[2]-v[0]>.06||v[3]-v[1]>.06){status.textContent='Zoom closer to limit the county parcel request.';return;}
 status.textContent='Loading '+s.name+' parcel geometry…';
 var params={f:'geojson',where:'1=1',geometry:JSON.stringify({xmin:v[0],ymin:v[1],xmax:v[2],ymax:v[3],spatialReference:{wkid:4326}}),geometryType:'esriGeometryEnvelope',spatialRel:'esriSpatialRelIntersects',inSR:4326,outSR:4326,returnGeometry:true,outFields:s.idField,resultRecordCount:401};
 var url=s.url+'/query?'+Object.keys(params).map(function(k){return encodeURIComponent(k)+'='+encodeURIComponent(params[k]);}).join('&'),controller=new AbortController(),timeout=setTimeout(function(){controller.abort();},15000);
 fetch(url,{signal:controller.signal}).then(function(r){if(!r.ok)throw new Error('County service HTTP '+r.status);return r.json();}).then(function(j){
  if(run!==parcelVersion)return;if(j.error||j.type!=='FeatureCollection'||!Array.isArray(j.features))throw new Error('County parcel service did not return usable geometry.');
  var fs=j.features.slice(0,400).filter(function(f){return f.geometry&&['Polygon','MultiPolygon'].indexOf(f.geometry.type)>=0;});
  L.geoJSON({type:'FeatureCollection',features:fs},{pane:'parcelContext',renderer:L.svg({pane:'parcelContext'}),style:{color:'#e5e1ba',weight:1,fillOpacity:.025},onEachFeature:function(f,l){l.on('click',function(e){if(mode==='draw')return;L.DomEvent.stopPropagation(e);try{choose(f.geometry,s.name+' · parcel '+String((f.properties||{})[s.idField]||'ID not supplied'),false);}catch(err){selection.textContent=err.message;}});}}).addTo(parcels);
  status.innerHTML=fs.length+' parcel outlines from '+link(s.url,s.name)+'. Click a parcel to select.'+(j.features.length>400||j.exceededTransferLimit||j.properties&&j.properties.exceededTransferLimit?' Partial response — zoom closer for other parcels.':'')+(fs.length?'':' No parcel geometry returned here; this does not mean no parcel exists.');
 }).catch(function(e){if(run===parcelVersion)status.textContent='County parcel lookup unavailable: '+e.message+'. You can still draw/import a boundary.';}).then(function(){clearTimeout(timeout);});
}
map.on('moveend',function(){clearTimeout(timer);timer=setTimeout(loadParcels,250);});
function render(r){
 out.innerHTML='<p><b>'+r.counts.mapped_routes+' mapped route records within '+esc(r.radius_km)+' km</b><br>'+r.counts.planning_reference_or_unknown_medium+' planning / reference / unknown-medium records, separate from route evidence.</p><p class="fp-caution">Distances are to published geometry. A mapped intersection does not confirm fiber on the legal parcel, service, spare strands, or an entrance.</p>';
 function rows(items,context){items.forEach(function(item){var card=document.createElement('div');card.className='fp-route';card.innerHTML='<b>'+esc(item.operator)+'</b><br>'+esc(item.intersects_boundary_or_interior?'Mapped intersection — unverified':item.mapped_distance_m<1?'Less than 1 m to mapped geometry':item.mapped_distance_m+' m to mapped geometry')+'<br><small>'+esc(item.operational_status||'Status not established')+' · '+esc(String(item.geometry_quality||'unknown').replace(/_/g,' '))+'<br>Positional accuracy: '+esc(item.positional_accuracy_m==null?'unverified':item.positional_accuracy_m+' m reported')+'<br>Source vintage: '+esc(item.source_vintage||'unknown')+' · metadata edited '+esc((item.source_last_edited||'unknown').slice(0,10))+' · fetched '+esc((item.retrieved_at||'').slice(0,10))+'</small><br>'+link(item.source_url,'Publisher source')+(context?'<br><b>Context only — excluded from qualifying fiber evidence</b>':'')+(item.display_geometry_truncated?'<br>Route display truncated; use publisher source.':'');
  var layer=L.geoJSON({type:'Feature',geometry:item.geometry,properties:{}},{style:{color:context?'#edaa3b':'#ff76ce',weight:5,opacity:.9,dashArray:context?'6,5':null}}).bindPopup(card.innerHTML).addTo(evidenceLayer);
  var button=document.createElement('button');button.type='button';button.textContent='Highlight this record';button.onclick=function(){evidenceLayer.eachLayer(function(x){if(x.setStyle)x.setStyle({opacity:.2,weight:3});});layer.setStyle({opacity:1,weight:7});layer.bringToFront();};card.appendChild(button);out.appendChild(card);
 });}
 rows(r.routes,false);if(r.context_routes.length){var heading=document.createElement('h3');heading.textContent='Plans and reference-only context';out.appendChild(heading);rows(r.context_routes,true);}
 if(r.results_truncated){var note=document.createElement('p');note.textContent='Showing the nearest 25 records in each group. Narrow the search radius to inspect others.';out.appendChild(note);}
 r.limitations.forEach(function(t){var p=document.createElement('p');p.className='fp-note';p.textContent=t;out.appendChild(p);});
}
inspect.onclick=function(){
 if(!selected)return;var run=++version,payload={boundary:selected.geometry,radius_km:Number(radius.value)},origin=selected.properties.boundary_source;lastResult=null;el('fpResultExport').disabled=true;evidenceLayer.clearLayers();inspect.disabled=true;out.textContent='Inspecting parcel against detailed routes on the server…';
 w.OmegaDCScreen.token().then(function(t){return fetch('/api/fiber-screen',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+t},body:JSON.stringify(payload)});}).then(function(r){if(!(r.headers.get('content-type')||'').match(/json/i))throw new Error('This static preview does not run the protected inspection API. Use the deployed Omega app while signed in. Parcel outlines and published routes remain visible here.');return r.json().then(function(j){if(!r.ok)throw new Error(j.error||'Inspection failed');return j;});}).then(function(r){if(run!==version)return;r.boundary_source=origin;lastResult=r;render(r);el('fpResultExport').disabled=false;}).catch(function(e){if(run===version)out.textContent=e.message;}).then(function(){if(run===version)inspect.disabled=!selected;});
};
fetch('data/usa-fiber/parcel-sources.json').then(function(r){if(!r.ok)throw new Error('Parcel source list unavailable');return r.json();}).then(function(j){registry=j.sources;registry.forEach(function(s){var o=document.createElement('option');o.value=s.id;o.textContent=s.name;county.appendChild(o);});status.textContent='Five public county sources verified '+j.verifiedAt+'. Choose one and zoom in.';}).catch(function(e){status.textContent=e.message;});
var style=document.createElement('style');style.textContent='.fp-panel{padding:12px;margin:6px 0;border:1px solid #536b80;border-radius:8px;background:#132b3a;font:12px/1.5 system-ui,sans-serif}.fp-panel h2{font-size:17px;margin:0 0 5px}.fp-panel h3{font-size:14px}.fp-panel p{margin:8px 0}.fp-panel input,.fp-panel select,.fp-panel textarea{width:100%;box-sizing:border-box;padding:7px;background:#203147;color:#fff;border:1px solid #688096;border-radius:4px;font:inherit}.fp-panel button{padding:7px 9px;margin:4px 4px 4px 0;background:#235361;border:1px solid #76c2bd;color:white;border-radius:4px;cursor:pointer;font:inherit}.fp-panel button:disabled{opacity:.45;cursor:default}.fp-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;align-items:end}.fp-panel details{border-top:1px solid #456;padding:8px 0}.fp-panel summary{cursor:pointer}.fp-note{font-size:11px;color:#bacbd8}.fp-caution{color:#ffdea0;border-left:3px solid #e4b867;padding-left:8px}.fp-route{border-top:1px solid #536b80;padding:9px 0;overflow-wrap:anywhere}';document.head.appendChild(style);
w.OmegaFiberParcel={choose:choose,clear:clear,render:render};
})(window);
