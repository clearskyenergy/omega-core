/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
(function(w){
 'use strict';
 function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
 function link(url,label){return /^https:\/\//.test(url||'')?'<a href="'+esc(url)+'" target="_blank" rel="noopener">'+esc(label||'Source')+' ↗</a>':'';}
 function render(r){
  var h='<div class="dc-metric"><strong>'+(r.score==null?'—':esc(r.score))+'</strong><span>/ 100 · '+esc(r.score_label)+'</span></div>';
  h+='<p><b>'+esc(r.measured_weight_pct)+'% of scoring weight measured</b> · '+esc(r.unmeasured_weight_pct)+'% unknown.</p><p class="dc-caution">'+esc(r.verdict)+'. This is not a readiness approval.</p>';
  h+='<p>Site '+esc(r.request.lat)+', '+esc(r.request.lon)+' · '+esc(r.profile)+' profile. Required power: '+(r.request.requested_mw==null?'not specified':esc(r.request.requested_mw)+' MW')+'; bandwidth: '+(r.request.requested_capacity_gbps==null?'not specified':esc(r.request.requested_capacity_gbps)+' Gbps')+'. Profile and requirements are recorded for diligence; this initial model uses the same mapped-signal weights for all profiles.</p>';
  r.attributes.forEach(function(a){h+='<div class="dc-attribute"><b>'+esc(a.label)+'</b><span>'+(a.score==null?'Unknown':esc(a.score)+'/100')+' · weight '+esc(a.weight)+'%</span><p>'+esc(a.basis)+'</p>';
   a.sources.slice(0,2).forEach(function(s){var facts=[];if(s.mapped_distance_m!=null)facts.push(s.mapped_distance_m+' m to geometry');else if(s.distance_km!=null)facts.push(s.distance_km+' km to geometry');if(s.voltage_kv!=null)facts.push(s.voltage_kv+' kV reported');if(s.reported_networks!=null)facts.push(s.reported_networks+' networks reported');if(s.geometry_quality)facts.push(s.geometry_quality.replace(/_/g,' '));if(s.operational_status||s.reported_status)facts.push(s.operational_status||s.reported_status);h+='<small>'+esc(s.operator||s.name||s.zone||'Published evidence')+' '+link(s.source_url)+'<br>'+esc(facts.join(' · '))+'<br>Source date: '+esc(s.source_vintage||s.source_date||'not established')+(s.source_last_edited?' · metadata edited '+esc(String(s.source_last_edited).slice(0,10)):'')+' · fetched '+esc((s.retrieved_at||'').slice(0,10))+'</small>';});h+='</div>';});
  h+='<details><summary>Required diligence ('+r.requirements.length+')</summary>';r.requirements.forEach(function(g){h+='<p><b>'+esc(g.label)+' — '+esc(g.status.replace(/_/g,' '))+'</b><br>'+esc(g.needed)+'</p>';});h+='</details>';
  h+='<details><summary>Sources, methodology and limitations</summary><p>Model '+esc(r.model)+' · '+esc(r.generated_at)+'</p>';
  Object.keys(r.sources).forEach(function(k){h+='<div>'+esc(k)+': '+esc(r.sources[k])+'</div>';});r.limitations.forEach(function(t){h+='<p>'+esc(t)+'</p>';});
  return h+'<p>'+link('https://www.energy.gov/indianenergy/articles/data-centers-tribal-economic-development-frequently-asked-questions','DOE siting considerations')+'</p></details>';
 }
 function token(){
  if(w.OmegaTenant&&w.OmegaTenant.refused)return Promise.reject(new Error('This hostname is not approved for the current Omega workspace.'));
  if(!w.firebase||!w.firebase.apps||!w.firebase.apps.length)return Promise.reject(new Error('Omega sign-in is not ready. Open your Omega workspace, sign in, then retry.'));
  return new Promise(function(resolve,reject){var done=false,off=null,timer=setTimeout(function(){finish(null);},6000);
   function finish(user){if(done)return;done=true;clearTimeout(timer);if(off)off();if(!user){reject(new Error('Sign in to Omega on this host, then retry. The map remains available without signing in.'));return;}user.getIdToken().then(resolve,reject);}
   var user=w.firebase.auth().currentUser;if(user)finish(user);else off=w.firebase.auth().onAuthStateChanged(finish,reject);
  });
 }
 var mainMount=null;
 function mount(el,initial){
  if(!el)return;var key=initial?initial.lat.toFixed(6)+','+initial.lng.toFixed(6):null;
  // Map-layer refreshes redraw Site Analysis. Preserve this independent
  // scorecard while the selected coordinate has not changed.
  if(el.id==='dcSiteScreen'&&mainMount&&mainMount.key===key){el.parentNode.replaceChild(mainMount.el,el);return mainMount.control;}
  var generation=0,lastResult=null;
  el.className='dc-site-screen';
  el.innerHTML='<h3>Data-center site screening</h3><p>Choose a site to score public evidence. Map layer visibility does not change the result.</p><form><div class="dc-grid"><label>Latitude<input name="lat" aria-label="Site latitude" type="number" min="-90" max="90" step="any" required></label><label>Longitude<input name="lon" aria-label="Site longitude" type="number" min="-180" max="180" step="any" required></label></div><label>Site profile<select name="profile"><option value="general">General-purpose data center</option><option value="ai">AI / high-density campus</option><option value="edge">Edge / smaller facility</option></select></label><div class="dc-grid"><label>Required power (MW)<input name="mw" type="number" min="0.001" max="10000" step="any" placeholder="Unknown"></label><label>Required bandwidth (Gbps)<input name="gbps" type="number" min="0.001" max="100000" step="any" placeholder="Unknown"></label></div><button type="submit">Score selected site</button> <button type="button" class="dc-export" disabled>Export scorecard</button></form><div class="dc-result" aria-live="polite">Select a map point or enter coordinates. Power and fiber capacity remain unknown until confirmed.</div><p class="dc-signin"><a href="/" target="_blank" rel="noopener">Open Omega sign-in ↗</a></p>';
  var form=el.querySelector('form'),out=el.querySelector('.dc-result'),save=el.querySelector('.dc-export'),submit=el.querySelector('button[type=submit]');
  function invalidate(){generation++;lastResult=null;save.disabled=true;submit.disabled=false;out.textContent='Inputs changed — run a fresh site screen.';}
  form.addEventListener('input',invalidate);form.addEventListener('change',invalidate);
  function select(ll){invalidate();form.elements.lat.value=ll.lat.toFixed(6);form.elements.lon.value=ll.lng.toFixed(6);out.textContent='Site selected. Score to query the full route inventory and live power / flood / carrier sources.';}
  if(initial)select(initial);
  form.onsubmit=function(e){e.preventDefault();if(!form.reportValidity())return;var id=++generation,payload={lat:form.elements.lat.value,lon:form.elements.lon.value,profile:form.elements.profile.value};
   if(form.elements.mw.value!=='')payload.requested_mw=form.elements.mw.value;if(form.elements.gbps.value!=='')payload.requested_capacity_gbps=form.elements.gbps.value;
   lastResult=null;save.disabled=true;submit.disabled=true;out.textContent='Collecting public evidence and scoring on the server…';
   token().then(function(t){return fetch('/api/dc-site-screen',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+t},body:JSON.stringify(payload)});}).then(function(r){
    if(!(r.headers.get('content-type')||'').match(/json/i))throw new Error('The scoring API is not running on this static preview. Open the deployed Omega app to score with your signed-in session.');
    return r.json().then(function(j){if(!r.ok)throw new Error(j.error||'Site screen failed');return j;});
   }).then(function(r){if(id!==generation||!el.isConnected)return;lastResult=r;out.innerHTML=render(r);save.disabled=false;}).catch(function(e){if(id===generation&&el.isConnected)out.textContent=e.message;}).then(function(){if(id===generation)submit.disabled=false;});
  };
  save.onclick=function(){if(!lastResult)return;var blob=new Blob([JSON.stringify(lastResult,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='data-center-site-scorecard.json';a.click();setTimeout(function(){URL.revokeObjectURL(url);},1000);};
  var control={select:select};if(el.id==='dcSiteScreen')mainMount={key:key,el:el,control:control};return control;
 }
 var style=document.createElement('style');style.textContent='.dc-site-screen{font:12px/1.5 system-ui,sans-serif;color:#dbe8f5;border:1px solid #355169;border-radius:8px;background:#102437;padding:12px;margin:8px 0}.dc-site-screen h3{font-size:16px;margin:0 0 6px}.dc-site-screen label{display:block;margin:7px 0}.dc-site-screen input,.dc-site-screen select{box-sizing:border-box;width:100%;padding:7px;background:#182f43;color:#edf7ff;border:1px solid #526b82;border-radius:4px;font:inherit}.dc-site-screen button{font:inherit;padding:8px;border:1px solid #69b4b0;background:#173e49;color:#fff;border-radius:5px;cursor:pointer;margin:5px 0}.dc-site-screen button:disabled{opacity:.5;cursor:default}.dc-site-screen a{color:#76dbd2}.dc-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.dc-result{margin-top:10px;overflow-wrap:anywhere}.dc-metric{display:flex;align-items:baseline;gap:7px}.dc-metric strong{font-size:34px}.dc-metric span{font-size:11px}.dc-caution{border-left:3px solid #e9b664;padding:7px;color:#f4d398;background:#332c24}.dc-attribute{border-top:1px solid #355169;padding:9px 0}.dc-attribute>span{display:block;color:#a9ccd6}.dc-attribute p{margin:5px 0}.dc-attribute small{display:block}.dc-site-screen details{border-top:1px solid #355169;padding:8px 0}.dc-site-screen summary{cursor:pointer}.dc-signin{font-size:11px;margin-bottom:0}';document.head.appendChild(style);
 w.OmegaDCScreen={mount:mount,render:render,token:token};
 if(w.GA_FIBER){var aside=document.querySelector('aside'),wrapper=document.createElement('details'),heading=document.createElement('summary'),panel=document.createElement('section');heading.textContent='Data-center point screening';wrapper.style.cssText='padding:10px;border-bottom:1px solid #456';wrapper.appendChild(heading);wrapper.appendChild(panel);aside.insertBefore(wrapper,aside.firstChild);var control=mount(panel),marker=null;
  function pick(e){if(w.GA_FIBER.parcelDrawing)return;control.select(e.latlng);if(marker)marker.remove();marker=w.GA_FIBER.L.marker(e.latlng).addTo(w.GA_FIBER.map).bindPopup('Selected screening point — not parcel-wide confirmation');}
  w.GA_FIBER.map.on('click',pick);w.GA_FIBER.map.on('parcel-selected',pick);
 }
})(window);
