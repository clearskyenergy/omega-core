/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
(function(w){
  'use strict';
  var PRIORITY=['TX','GA','IL','NJ','NY','CT','FL','MA','SC','NC'];
  function esc(v){return String(v==null?'Unknown':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function safeUrl(v){return /^https?:\/\//i.test(v||'')?v:'';}
  function hit(a,b){return a&&b&&a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1];}
  function select(features,box,state,category,source){
    var seen={};
    return features.filter(function(f){
      var p=f.properties||{};
      if(seen[p.id]||!hit(f.bbox,box)||(state&&p.states.indexOf(state)<0)||(category!=='all'&&p.category!==category)||(source&&p.sourceId!==source))return false;
      seen[p.id]=true;return true;
    });
  }
  function style(f){var c=f.properties.category;return {color:{existing:'#2DD4BF',unknown:'#818CF8',planned:'#F59E0B',inactive:'#94A3B8'}[c]||'#818CF8',weight:2.5,opacity:.88,dashArray:c==='planned'?'7,5':c==='inactive'?'2,5':null};}
  function popup(f,s,detailed){
    var p=f.properties||{},url=safeUrl(p.sourceUrl||s.url);
    return '<b>'+esc(p.name||p.carrier||s.name)+'</b><br>'+esc(p.carrier||'Operator not published')+
      '<br>Status: '+esc(p.routeStatus||p.category)+'<br>Publisher: '+esc(s.publisher||s.name||p.sourceId)+
      '<br>Retrieved: '+esc((p.retrievedAt||s.retrievedAt||'Unknown').slice(0,10))+
      '<br>'+(detailed?'Published detailed geometry; positional accuracy unverified.':'Simplified display geometry. Zoom in for detail; do not measure from this overview.')+
      (p.publishedLineParts?'<br>'+esc(p.publishedLineParts)+' line parts grouped in this record.':'')+
      (url?'<br><a href="'+esc(url)+'" target="_blank" rel="noopener">Published source ↗</a>':'')+
      '<br>Carrier names as published. Building service, available bandwidth and physical diversity remain unconfirmed.';
  }
  function init(host){
    if(!host||!host.map||!host.element)return;
    var map=host.map,L=host.L,el=host.element,manifest=null,sources={},cache={},order=[],run=0,timer,shown=host.visible!==false;
    var group=L.layerGroup().addTo(map),renderer=L.canvas({padding:.2});
    el.innerHTML='<h3>Published fiber routes</h3><label for="fiberState">State / territory</label><select id="fiberState"><option value="">United States</option></select>'+
      '<div class="fiber-route-filters"><div><label for="fiberStatus">Published status</label><select id="fiberStatus"><option value="all">All statuses</option><option value="existing">Existing / complete</option><option value="unknown">Status unknown</option><option value="planned">Planned / awarded</option><option value="inactive">Inactive</option></select></div></div>'+
      '<label for="fiberSource">Network / publisher</label><select id="fiberSource"><option value="">All published networks</option></select>'+
      '<p class="fiber-route-legend"><span style="color:#2DD4BF">━ Existing</span> <span style="color:#818CF8">━ Unknown</span><br><span style="color:#F59E0B">┄ Planned</span> <span style="color:#94A3B8">┄ Inactive</span></p>'+
      '<p id="fiberRouteCount" role="status" aria-live="polite">Loading published inventory…</p><p id="fiberRouteCoverage"></p>'+
      '<small>Partial public coverage. Missing routes mean unknown. Map records are not unique cables. Nearby routes do not confirm building service or available bandwidth.</small>'+
      '<p><a href="/usa-fiber-map.html" id="fiberFullMap">Full-screen fiber map ↗</a> · <a href="/data/usa-fiber/manifest.json" target="_blank" rel="noopener">Sources</a></p>';
    var state=el.querySelector('#fiberState'),category=el.querySelector('#fiberStatus'),source=el.querySelector('#fiberSource'),summary=el.querySelector('#fiberRouteCount'),coverage=el.querySelector('#fiberRouteCoverage');
    function notify(fs,detail,error){if(host.onRender)host.onRender(fs,detail,error);}
    function get(file){
      if(cache[file])return cache[file];
      var promise=fetch('/data/usa-fiber/'+file).then(function(r){if(!r.ok)throw Error('Route data unavailable (HTTP '+r.status+')');return r.json();}).then(function(fc){
        if(!fc||fc.type!=='FeatureCollection'||!Array.isArray(fc.features))throw Error('Invalid route data');return fc;
      }).catch(function(e){delete cache[file];throw e;});
      cache[file]=promise;order.push(file);
      while(order.length>8){var key=order.shift();delete cache[key];}
      return promise;
    }
    function row(){return manifest&&manifest.states.filter(function(s){return s.code===state.value;})[0];}
    function syncSources(){
      var r=row(),allowed=r?r.sources:manifest.sources.map(function(s){return s.id;}),prev=source.value;
      source.innerHTML='<option value="">All published networks</option>';
      manifest.sources.filter(function(s){return allowed.indexOf(s.id)>=0;}).forEach(function(s){var o=document.createElement('option');o.value=s.id;o.textContent=s.name;source.appendChild(o);});
      source.value=allowed.indexOf(prev)>=0?prev:'';
    }
    function refresh(){
      if(!manifest)return;
      var id=++run,b=map.getBounds(),box=[b.getWest(),b.getSouth(),b.getEast(),b.getNorth()],r=row(),detail=map.getZoom()>=8;
      group.clearLayers();notify([],detail,null);
      coverage.textContent=r?r.name+': '+r.segments.toLocaleString()+' source map records / '+(r.publishedLineParts||0).toLocaleString()+' published line parts. '+r.coverage:manifest.uniqueSegments.toLocaleString()+' map records across '+manifest.statesWithData+' state/DC areas. Nationwide coverage remains partial.';
      if(!shown){summary.textContent='Published routes hidden. Enable them in Settings or choose the Fiber project profile.';return;}
      var rows=manifest.states.filter(function(s){return s.segments&&hit(s.bbox,box)&&(!state.value||s.code===state.value);});
      if(r&&!r.segments){summary.textContent='No published route geometry bundled for '+r.name+'. Fiber availability is unknown.';return;}
      summary.textContent=detail?'Loading detailed published routes…':'Loading route overview…';
      var files=detail?rows.map(function(s){return s.code+'.geojson';}):[state.value?state.value+'.overview.geojson':'overview.geojson'];
      Promise.all(files.map(get)).then(function(all){
        if(id!==run)return;
        var fs=[];all.forEach(function(fc){fs=fs.concat(fc.features);});fs=select(fs,box,state.value,category.value,source.value);
        // Draw batches so dense Georgia/Carolinas data does not freeze navigation.
        var offset=0;
        function batch(){
          if(id!==run)return;
          var slice=fs.slice(offset,offset+150);offset+=slice.length;
          L.geoJSON({type:'FeatureCollection',features:slice},{renderer:renderer,style:style,onEachFeature:function(f,l){l.on('click',function(e){if(e.originalEvent)L.DomEvent.stopPropagation(e.originalEvent);});l.bindPopup(function(){return popup(f,sources[f.properties.sourceId]||{},detail);});}}).addTo(group);
          if(offset<fs.length){setTimeout(batch,0);return;}
          summary.textContent=fs.length.toLocaleString()+' map records drawn · '+(detail?'detailed source geometry':'simplified overview; zoom in for detail')+(fs.length?'':'. No matching records in this view; coverage unknown.');
          notify(fs,detail,null);
        }
        batch();
      }).catch(function(e){if(id!==run)return;group.clearLayers();summary.textContent=e.message+'. Coverage unavailable; pan or change state to retry.';notify([],detail,e.message);});
    }
    function navigate(){
      if(!manifest)return;
      shown=true;if(host.onVisibilityChange)host.onVisibilityChange(true);
      syncSources();var s=row();
      map.stop();
      if(s){if(s.code==='AK')map.setView([64,-152],4,{animate:false});else map.fitBounds([[s.bbox[1],s.bbox[0]],[s.bbox[3],s.bbox[2]]],{padding:[12,12],animate:false});}
      else map.setView([39,-98],4,{animate:false});
      el.querySelector('#fiberFullMap').href='/usa-fiber-map.html'+(state.value?'?state='+state.value:'');
      // Preserve tenant/return query parameters while making state links shareable.
      if(w.history&&w.history.replaceState&&w.URL){var u=new URL(w.location.href);if(state.value)u.searchParams.set('state',state.value);else u.searchParams.delete('state');w.history.replaceState(null,'',u.toString());}
      refresh();
    }
    state.onchange=navigate;category.onchange=refresh;source.onchange=refresh;
    map.on('moveend',function(){clearTimeout(timer);timer=setTimeout(refresh,150);});
    host.controller={setVisible:function(on){if(shown===on)return;shown=on;refresh();},refresh:refresh};
    fetch('/data/usa-fiber/manifest.json').then(function(r){if(!r.ok)throw Error('Inventory manifest unavailable');return r.json();}).then(function(m){
      manifest=m;m.sources.forEach(function(s){sources[s.id]=s;});
      var priorities=document.createElement('optgroup');priorities.label='Priority states';state.appendChild(priorities);
      var rest=document.createElement('optgroup');rest.label='All remaining states / DC';state.appendChild(rest);
      m.states.slice().sort(function(a,b){var x=PRIORITY.indexOf(a.code),y=PRIORITY.indexOf(b.code);return (x<0?99:x)-(y<0?99:y)||a.name.localeCompare(b.name);}).forEach(function(s){
        var o=document.createElement('option');o.value=s.code;o.textContent=s.name+' · '+s.segments.toLocaleString()+' records';(PRIORITY.indexOf(s.code)>=0?priorities:rest).appendChild(o);
      });
      var match=(w.location.search||'').match(/[?&]state=([a-z]{2})(?:&|$)/i);
      if(match&&m.states.some(function(s){return s.code===match[1].toUpperCase();})){state.value=match[1].toUpperCase();navigate();}
      else{syncSources();refresh();}
    }).catch(function(e){summary.textContent=e.message+'. Coverage unknown.';notify([],false,e.message);});
    return host.controller;
  }
  var api={init:init,select:select,style:style,popup:popup,priority:PRIORITY};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else{w.OmegaPublishedFiber=api;if(w.OmegaPublishedFiberHost)init(w.OmegaPublishedFiberHost);}
})(typeof window!=='undefined'?window:{});
