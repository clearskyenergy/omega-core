/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
(function(w){
  'use strict';
  var loaded=false, colors={fiber_route:'#24d6bb',telecom_route_unknown:'#8292a6',telecom_facility:'#be9aff',network_design:'#f3b650'};
  function text(v){return String(v==null?'Unknown':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function json(url,headers){return fetch(url,{headers:headers||{}}).then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json();});}
  function init(host){
    if(loaded || !host || !host.map || !host.L)return;
    loaded=true;
    var map=host.map,L=host.L,control=L.control({position:'topright'}),layers={},last=null,requestId=0,manifest;
    var base=(w.CLEARSKY_CONFIG||{}).fiberDataBase||'/data/fiber/';
    control.onAdd=function(){
      var el=L.DomUtil.create('div','omega-fiber-panel');
      el.style.cssText='background:#101b2c;color:#e5ecf5;border:1px solid #344458;border-radius:10px;padding:14px;width:300px;max-width:75vw;max-height:55vh;overflow:auto;font:12px/1.5 Arial,sans-serif;box-shadow:0 10px 30px #0006';
      el.innerHTML='<b style="font-size:16px">Fiber evidence</b><div style="color:#b5c1d1">Public records · partial coverage</div><div class="of-counts">Loading source snapshots…</div><div class="of-layers" style="margin:8px 0"></div><label>Required capacity <input class="of-cap" type="number" min="0.001" step="any" placeholder="Gbps" style="width:76px"></label><div style="margin:8px 0"><button class="of-screen" type="button">Check map center</button> <button class="of-export" type="button" disabled>Export result</button></div><div class="of-result">Click a site on the map, then check its fiber evidence.</div><a href="/fiber-data-review.html" target="_blank" rel="noopener" style="color:#6ee7d0">Data coverage &amp; source maps ↗</a>';
      L.DomEvent.disableClickPropagation(el);L.DomEvent.disableScrollPropagation(el);
      return el;
    };
    control.addTo(map);
    var el=control.getContainer(),resultEl=el.querySelector('.of-result'),button=el.querySelector('.of-screen'),exportButton=el.querySelector('.of-export');
    map.on('click',function(e){last=e.latlng;button.textContent='Check selected site';});
    function popup(feature){
      var p=feature.properties,s=p.fiber_strands_reported;
      return '<b>'+text(p.name)+'</b><br>'+text(p.operator)+'<br>'+text(p.feature_kind.replace(/_/g,' '))+'<br>'+text(p.operational_status)+
        '<br>Fiber strands: '+(s===null?'unknown':text(s)+' (reported)')+'<br>Available bandwidth: unknown<br><a href="'+text(p.source_url)+'" target="_blank" rel="noopener">Source record ↗</a>';
    }
    function addLayer(name,file,on){
      var label=document.createElement('label');label.style.cssText='display:block;padding:3px 0';
      var check=document.createElement('input');check.type='checkbox';check.checked=on;label.appendChild(check);
      var span=document.createElement('span');span.textContent=' '+name+' — loading';label.appendChild(span);el.querySelector('.of-layers').appendChild(label);
      return json(base+file).then(function(data){
        var layer=L.geoJSON(data,{style:function(f){var p=f.properties;return {color:colors[p.feature_kind]||'#8292a6',weight:2,opacity:0.85,dashArray:p.feature_kind==='network_design'?'6 5':null};},
          pointToLayer:function(f,ll){return L.circleMarker(ll,{radius:3,color:colors.telecom_facility,weight:1,fillOpacity:0.65});},
          onEachFeature:function(f,l){l.bindPopup(popup(f));}});
        layers[file]=layer;span.textContent=' '+name+' ('+data.features.length.toLocaleString()+')';
        if(check.checked)layer.addTo(map);
        check.onchange=function(){if(check.checked)layer.addTo(map);else map.removeLayer(layer);};
        if(data.features[0])span.style.color=colors[data.features[0].properties.feature_kind];
      }).catch(function(e){span.textContent=' '+name+' — unavailable';check.disabled=true;check.checked=false;console.error('Fiber layer failed',file,e);});
    }
    json(base+'manifest.json').then(function(m){
      manifest=m;el.querySelector('.of-counts').textContent='Snapshot: '+m.built_at.slice(0,10)+' · availability and capacity unconfirmed';
      /* OMEGA CHANGE: default OFF, configurable. Upstream shipped these two
         ON, which cost every Grid Atlas visitor ~5.8 MB of GeoJSON and ~6,200
         features before touching anything — against a page whose own
         convention is that every layer starts off and loads in the viewport.
         Set CLEARSKY_CONFIG.fiberLayersOn = true to restore upstream. */
      var fibOn=!!(w.CLEARSKY_CONFIG||{}).fiberLayersOn;
      addLayer('Mapped fiber routes','osm-fiber-routes.geojson',fibOn);
      addLayer('Telecom facilities','osm-telecom-facilities.geojson',fibOn);
      addLayer('California network design','ca-middle-mile-design.geojson',false);
      var u=m.datasets.filter(function(d){return d.file==='osm-telecom-routes-unknown.geojson';})[0];
      if(u && u.count)addLayer('Telecom routes · medium unknown',u.file,false);
    }).catch(function(){el.querySelector('.of-counts').textContent='Data unavailable — no site conclusion can be drawn.';});
    function token(){
      var user=w.firebase && w.firebase.auth && w.firebase.auth().currentUser;
      if(!user) return Promise.reject(new Error('Sign in to Omega to check a site.'));
      return user.getIdToken();
    }
    button.onclick=function(){
      var ll=last||map.getCenter(),capacity=el.querySelector('.of-cap').value,id=++requestId;
      if(capacity && (!isFinite(Number(capacity)) || Number(capacity)<=0)){resultEl.textContent='Enter a positive capacity in Gbps.';return;}
      resultEl.textContent='Checking loaded evidence…';exportButton.disabled=true;
      token().then(function(t){
        var url='/api/fiber-screen?lat='+encodeURIComponent(ll.lat)+'&lon='+encodeURIComponent(ll.lng)+'&radius_km=25';
        if(capacity)url+='&requested_capacity_gbps='+encodeURIComponent(capacity);
        return fetch(url,{headers:{Authorization:'Bearer '+t}}).then(function(r){return r.json().then(function(d){if(!r.ok)throw new Error(d.error||'Fiber check failed');return d;});});
      }).then(function(data){
        if(id!==requestId)return;
        var h='<div style="border-top:1px solid #344458;padding-top:9px"><b>Serviceability: unconfirmed</b><br>Available capacity: unknown<br>'+text(data.query.lat.toFixed(5))+', '+text(data.query.lon.toFixed(5))+'</div>';
        h+='<p>'+data.counts_in_radius.routes+' mapped fiber route record(s) within 25 km. '+data.counts_in_radius.facilities+' telecom facility record(s).</p>';
        data.routes.slice(0,3).forEach(function(r){h+='<div style="margin:6px 0"><b>'+text(r.operator||r.name)+'</b><br>'+(r.mapped_distance_m/1000).toFixed(2)+' km to published route geometry<br><a style="color:#6ee7d0" href="'+text(r.source_url)+'" target="_blank" rel="noopener">Source ↗</a></div>';});
        if(!data.routes.length)h+='<p>No mapped fiber route in these sources within the radius. Fiber may still be present.</p>';
        h+='<p style="color:#f3c47c">Confirm bandwidth, splice access, a constructible lateral and physically diverse paths with the carrier.</p>';
        resultEl.innerHTML=h;exportButton.disabled=false;
        exportButton.onclick=function(){var blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='fiber-evidence.json';a.click();setTimeout(function(){URL.revokeObjectURL(url);},1000);};
      }).catch(function(e){if(id===requestId)resultEl.textContent=e.message;});
    };
  }
  w.OmegaFiberAtlas={init:init};
  if(w.OmegaFiberAtlasHost)init(w.OmegaFiberAtlasHost);
})(window);
