/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
(function(){
'use strict';
var A=window.GA_FIBER;if(!A)return;
var root='data/usa-fiber/',manifest=null,overview=null,overviewPromise=null,cache={},cacheOrder=[],generation=0,sourcesById={};
var group=A.L.layerGroup().addTo(A.map);
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function get(path){var version=manifest&&/\.geojson$/.test(path)?'?v='+encodeURIComponent(manifest.builtAt):'';return fetch(root+path+version,{cache:path==='manifest.json'?'no-store':'default'}).then(function(r){if(!r.ok)throw new Error('Dataset unavailable ('+r.status+')');return r.json();});}
var host=document.getElementById('fiberUSAHost')||document.getElementById('presets');
var panel=document.createElement('section');panel.className='fiber-controls';panel.style.cssText='padding:12px;font-size:13px;line-height:1.5;border-bottom:1px solid #456';
panel.innerHTML='<strong>USA fiber route inventory</strong><p id="usaFiberSummary" role="status">Loading published routes…</p><label><input id="usaFiberVisible" type="checkbox" checked> Show published routes</label><label for="usaFiberState">Route coverage by state</label><select id="usaFiberState"><option value="">United States</option></select><label for="usaFiberCategory">Route status</label><select id="usaFiberCategory"><option value="all">All published routes</option><option value="existing">Reported existing / complete</option><option value="unknown">Status not established</option><option value="planned">Plans / permits / awards</option><option value="inactive">Inactive / abandoned</option></select><p><span style="color:#00bba9">━</span> Existing / complete · <span style="color:#7788ee">━</span> Status unknown<br><span style="color:#edaa3b">┄</span> Planned / awarded · <span style="color:#999">┄</span> Inactive</p><p id="usaFiberCoverage">Coverage is partial. Missing lines do not mean no fiber.</p><small>Zoom in for detailed geometry. Click a line for provenance. Proximity does not confirm building service.</small><p><a href="data/usa-fiber/manifest.json" target="_blank" rel="noopener">Sources and coverage</a> · <a href="usa-fiber-map.html">Full-screen fiber map</a></p>';
if(host)host.insertAdjacentElement('afterend',panel);else document.body.appendChild(panel);
var stateEl=document.getElementById('usaFiberState'),catEl=document.getElementById('usaFiberCategory'),visible=document.getElementById('usaFiberVisible'),summary=document.getElementById('usaFiberSummary'),coverage=document.getElementById('usaFiberCoverage');
var referenceOption=document.createElement('option');referenceOption.value='reference';referenceOption.textContent='Illustrative references — scoring excluded';catEl.appendChild(referenceOption);
var sourceLabel=document.createElement('label');sourceLabel.htmlFor='usaFiberSource';sourceLabel.textContent='Source / carrier';
var sourceEl=document.createElement('select');sourceEl.id='usaFiberSource';sourceEl.innerHTML='<option value="all">All published sources</option><option value="latest">Latest additions · September 19</option>';
stateEl.insertAdjacentElement('afterend',sourceLabel);sourceLabel.insertAdjacentElement('afterend',sourceEl);
function sourceMatches(p){return sourceEl.value==='all'||(sourceEl.value==='latest'?/^20260919(?:-|$)/.test(p.importBatch||''):p.sourceId===sourceEl.value);}
function intersects(b,c){return b[0]<=c[2]&&b[2]>=c[0]&&b[1]<=c[3]&&b[3]>=c[1];}
function viewport(){var b=A.map.getBounds();return [b.getWest(),b.getSouth(),b.getEast(),b.getNorth()];}
function draw(features,detailed){
 group.clearLayers();var seen={};
 var b=viewport();
 var fs=features.filter(function(f){var p=f.properties;if(seen[p.id])return false;seen[p.id]=true;return intersects(f.bbox,b)&&(!stateEl.value||p.states.indexOf(stateEl.value)>=0)&&sourceMatches(p)&&(catEl.value==='all'||(catEl.value==='reference'?p.proximityEligible===false:p.proximityEligible!==false&&p.category===catEl.value));});
 if(visible.checked)A.L.geoJSON({type:'FeatureCollection',features:fs},{renderer:A.L.canvas({padding:.2}),style:function(f){var c=f.properties.category;if(f.properties.proximityEligible===false)return {color:'#94a3b8',weight:2,opacity:.7,dashArray:'2,4'};return {color:{existing:'#00bba9',unknown:'#7788ee',planned:'#edaa3b',inactive:'#999'}[c],weight:detailed?3:2,opacity:.9,dashArray:c==='planned'||c==='inactive'?'6,5':null};},onEachFeature:function(f,l){var p=f.properties,s=sourcesById[p.sourceId]||{};l.bindPopup('<strong>'+esc(p.name||s.name)+'</strong><br>'+esc(p.routeStatus)+'<br>'+esc(p.carrier||'Carrier not published')+'<br>'+esc(p.networkType||'Published fiber route')+'<br><a href="'+esc(p.sourceUrl||s.url)+'" target="_blank" rel="noopener">Published source</a><br>Retrieved: '+esc((p.retrievedAt||s.retrievedAt||'Unknown').slice(0,10))+'<br>Metadata updated: '+esc((p.metadataModified||s.itemModified||'Unknown').slice(0,10))+'<br>'+(detailed?'Published geometry; accuracy unverified':'Simplified overview — zoom in for detail')+(p.publishedLineParts?'<br>'+esc(p.publishedLineParts)+' published line parts in this record':'')+(p.proximityEligible===false?'<br><b>Illustrative reference only — excluded from scoring.</b>':'')+'<br>Source vintage: '+esc(p.dataDate||s.sourceVintage||'Not established')+'<br>Carrier names as published; current ownership may differ. Building service and available capacity unconfirmed.');}}).addTo(group);
 summary.textContent=manifest.uniqueSegments.toLocaleString()+' source-derived map records · '+manifest.statesWithData+' state/DC areas with some route data. '+fs.length.toLocaleString()+' records in this '+(detailed?'detailed view.':'overview.')+' Counts are not unique physical cables.';
}
function refresh(){
 if(!manifest)return;var run=++generation,b=viewport();
 var row=manifest.states.filter(function(s){return s.code===stateEl.value;})[0];
 coverage.textContent=row?row.name+': '+row.segments.toLocaleString()+' map records'+(row.publishedLineParts?' / '+row.publishedLineParts.toLocaleString()+' line parts':'')+'. '+row.coverage+'.':'Partial US inventory. States without mapped data remain unknown.';
 if(!visible.checked){group.clearLayers();summary.textContent='Published route layer hidden. Parcel inspection still uses the full inventory.';return;}
 if(A.map.getZoom()<8){
  if(overview){draw(overview.features,false);return;}
  summary.textContent='Loading national overview…';
  if(!overviewPromise)overviewPromise=get('overview.geojson').then(function(j){overview=j;return j;}).catch(function(e){overviewPromise=null;throw e;});
  overviewPromise.then(function(j){if(run===generation)draw(j.features,false);}).catch(function(e){if(run===generation)summary.textContent=e.message;});return;
 }
 var rows=manifest.states.filter(function(s){return s.segments&&intersects(s.bbox,b);});
 summary.textContent='Loading detailed route geometry…';
 Promise.all(rows.map(function(s){if(!cache[s.code]){cache[s.code]=get(s.code+'.geojson').catch(function(e){delete cache[s.code];throw e;});cacheOrder.push(s.code);while(cacheOrder.length>6)delete cache[cacheOrder.shift()];}return cache[s.code];})).then(function(all){if(run!==generation)return;var fs=[];all.forEach(function(fc){fs=fs.concat(fc.features.filter(function(f){return intersects(f.bbox,b);}));});draw(fs,true);}).catch(function(e){if(run!==generation)return;group.clearLayers();summary.textContent=e.message+'. Detailed view could not load; pan or zoom to retry.';});
}
stateEl.onchange=function(){var row=manifest.states.filter(function(s){return s.code===stateEl.value;})[0];if(row){var b=row.bbox;if(row.code==='AK')A.map.setView([64,-152],4);else A.map.fitBounds([[b[1],b[0]],[b[3],b[2]]]);}else A.map.setView([39,-98],4);refresh();};
catEl.onchange=refresh;sourceEl.onchange=refresh;visible.onchange=refresh;A.map.on('moveend',refresh);
var researchLink=document.createElement('p');researchLink.innerHTML='<a href="fiber-research.html">State-by-state research and remaining gaps</a>';panel.appendChild(researchLink);
get('manifest.json').then(function(m){m.sources.filter(function(s){return s.includedFeatures>0;}).sort(function(a,b){return a.name.localeCompare(b.name);}).forEach(function(s){var o=document.createElement('option');o.value=s.id;o.textContent=s.name;sourceEl.appendChild(o);});}).catch(function(){sourceEl.disabled=true;});
get('manifest.json').then(function(m){manifest=m;manifest.sources.forEach(function(s){sourcesById[s.id]=s;});var priority=['TX','GA','IL','CT','OH','FL','SC','CA'];manifest.states.slice().sort(function(a,b){var x=priority.indexOf(a.code),y=priority.indexOf(b.code);return (x<0?99:x)-(y<0?99:y)||a.name.localeCompare(b.name);}).forEach(function(s){var o=document.createElement('option');o.value=s.code;o.textContent=s.name+' · '+s.segments.toLocaleString();stateEl.appendChild(o);});var query=(window.location&&window.location.search||'').match(/[?&]state=([A-Z]{2})(?:&|$)/);if(query&&manifest.states.some(function(s){return s.code===query[1];})){stateEl.value=query[1];if(!A.initialCoordinate)stateEl.onchange();else refresh();}else refresh();}).catch(function(e){summary.textContent=e.message;});
})();
