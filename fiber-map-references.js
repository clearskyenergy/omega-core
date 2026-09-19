/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
(function(){
 'use strict';
 var state=document.getElementById('usaFiberState'),host=document.querySelector('.fiber-controls');
 if(!state||!host)return;
 function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
 function url(v){return /^https:\/\//.test(v||'')?esc(v):'#';}
 var panel=document.createElement('details'),data=null;
 panel.id='fiberMapReferences';
 panel.innerHTML='<summary style="cursor:pointer;color:#64dcd0">Publisher maps &amp; images</summary><p style="color:#ffcd79">Visual references only — not surveyed geometry, not counted or used for distance/site scoring.</p><div id="fiberMapReferenceList">Loading references…</div>';
 host.appendChild(panel);
 var list=document.getElementById('fiberMapReferenceList');
 function render(){
  if(!data)return;
  var maps=data.maps.filter(function(r){return !state.value||r.states.indexOf(state.value)>=0;});
  list.innerHTML=maps.map(function(r){return '<article style="border-top:1px solid #344458;padding:12px 0"><a href="'+url(r.sourceUrl)+'" target="_blank" rel="noopener">'+esc(r.title)+' ↗</a><div><small>'+esc(r.publisher)+' · '+esc(r.kind)+'</small></div>'+
   (r.imageUrl?'<a href="'+url(r.imageUrl)+'" target="_blank" rel="noopener" aria-label="Open '+esc(r.title)+' full-size image"><img loading="lazy" referrerpolicy="no-referrer" src="'+url(r.imageUrl)+'" alt="'+esc(r.title)+' — visual reference, not georeferenced" style="display:block;width:100%;height:auto;max-height:190px;object-fit:contain;background:white;margin:8px 0;border-radius:4px"></a>':'')+
   '<small>'+esc(r.vintage)+'</small><p style="margin:6px 0">'+esc(r.note)+'</p></article>';}).join('')||'<p>No reviewed image is catalogued for this state yet. See the research register for follow-up sources.</p>';
 }
 state.addEventListener('change',render);
 // The atlas applies its deep-link state after asynchronous data loading.
 panel.addEventListener('toggle',function(){if(panel.open)render();});
 fetch('data/usa-fiber/map-references.json').then(function(r){if(!r.ok)throw new Error('Unavailable');return r.json();}).then(function(r){data=r;render();}).catch(function(){list.textContent='Image references unavailable. Route geometry remains usable.';});
})();
