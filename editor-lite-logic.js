/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   A small shell over ONE canonical editor. No forked engine or simulated outputs.
   Module presentation is a commercial control; Firestore remains the project
   data boundary. The server rechecks subscription/modules for guided requests. */
(function () {
  'use strict';
  var cfg = window.CLEARSKY_CONFIG || {}, params = new URLSearchParams(location.search);
  if (!firebase.apps.length) firebase.initializeApp(cfg.firebase || cfg);
  var auth = firebase.auth(), context = null, engine = null, busy = false, timer = null;
  var customer = params.get('customer') === '1', revision = 0, projectId = params.get('project'), savedSnapshot = '', saveBusy = false, loaded = false, authVersion = 0;
  var siteAddress=params.get('address')||'',mapReady=false,atlasItems=[];
  var catalogBox=document.createElement('div');catalogBox.id='catalog-box';catalogBox.innerHTML='<label for="bess-sku">Supplier BESS catalog</label><select id="bess-sku"></select><p id="catalog-note" class="note"></p>';$('hoursRow').after(catalogBox);
  // One map workspace. Output documents are actions, not competing views.
  var left=document.querySelector('aside.left'),exportGroup=document.createElement('details');
  exportGroup.innerHTML='<summary>Exports</summary>';
  ['storage','transformer','measure'].forEach(function(name){var e=document.querySelector('[data-command="'+name+'"]');if(e)e.remove();});
  ['sld','bom','proposal','drawings'].forEach(function(name){exportGroup.appendChild(document.querySelector('[data-command="'+name+'"]'));});
  document.querySelector('[data-command="plot"]').textContent='Site';
  var atlasButton=document.createElement('button');atlasButton.textContent='Grid Atlas';atlasButton.setAttribute('data-command','atlas');
  document.querySelector('[data-command="plot"]').after(atlasButton);left.appendChild(exportGroup);
  $('moduleList').hidden=true;var moduleLabel=$('moduleList').previousElementSibling;if(moduleLabel)moduleLabel.hidden=true;
  var siteBar=document.createElement('form');siteBar.id='site-address-form';siteBar.innerHTML='<label for="site-address">Site address</label><input id="site-address" placeholder="Enter your site address" required><button type="submit">Load site</button><span id="map-status" role="status"></span>';
  document.querySelector('header').after(siteBar);$('site-address').value=siteAddress;
  var style=document.createElement('style');style.textContent='#site-address-form{display:flex;gap:10px;align-items:center;padding:8px 32px;flex-wrap:wrap}#site-address{flex:1;min-width:200px}#map-status{font-size:12px}.workspace{height:calc(100dvh - 242px)}aside.left details{margin-top:24px}#atlas-panel{position:absolute;z-index:8;right:12px;top:12px;max-width:330px;max-height:80%;overflow:auto;background:white;padding:18px;border:1px solid #dcecf1;border-radius:12px;font-size:12px}';document.head.appendChild(style);
  var atlasPanel=document.createElement('section');atlasPanel.id='atlas-panel';atlasPanel.hidden=true;document.querySelector('.canvas').appendChild(atlasPanel);
  if (customer) {
    var back = '/portals/customer/?org=' + encodeURIComponent(params.get('org') || '') + '#design';
    $('close').href = back; document.querySelector('#gate a').href = back;
    document.querySelector('#gate a').textContent = 'Back to your customer account';
    window.OmegaBuyerEngine = { authorized: false };
  }
  var labels = { bess: 'BESS', compute: 'Compute', ev: 'EV charging', solar: 'Solar' };
  function $(id) { return document.getElementById(id); }
  function say(text, bad) { $('message').textContent = text; $('message').className = bad ? 'error' : ''; }
  function request(body) {
    if (!auth.currentUser) return Promise.reject(new Error('Sign in to use Editor Lite.'));
    var org = context ? context.org : params.get('org') || '';
    return auth.currentUser.getIdToken().then(function (token) {
      return fetch((customer ? '/api/customer-design' : '/api/editor-lite') + (body ? '' : '?org=' + encodeURIComponent(org)), {
        method: body ? 'POST' : 'GET', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(Object.assign({ org: org, action: 'size' }, body)) : undefined
      }).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'Editor access refused'); return j; }); });
    });
  }
  function call(name, args) {
    if (!engine || typeof engine[name] !== 'function') throw new Error('The ' + name + ' engine is not ready. Please reload the canvas.');
    return engine[name].apply(engine, args || []);
  }
  function selected() { return $('module').value; }
  function permitted(module) { return context && context.modules.indexOf(module) >= 0; }
  function setModule(module) {
    if (!permitted(module)) return;
    if (engine && typeof engine._bgbCancel === 'function') engine._bgbCancel();
    if (engine) {
      if (engine.OmegaCGB && engine.OmegaCGB.state().active) engine.OmegaCGB.cancel();
      if (typeof engine._dcfcState === 'function' && engine._dcfcState().active) engine._dcfcCancel();
      ['bgb-modal','cgb-modal','derb-modal','dcfc-modal'].forEach(function (id) { var modal=engine.document.getElementById(id);if(modal)modal.remove(); });
      if (typeof engine.setMode === 'function') engine.setMode('select');
    }
    $('module').value = module; $('hoursRow').hidden = module !== 'bess';
    catalogBox.hidden=module!=='bess';$('configure').hidden=module==='bess';
    $('build').textContent = module === 'bess' ? 'Place them' : 'Start guided build';
    Array.prototype.forEach.call($('moduleList').children, function (b) { b.classList.toggle('active', b.getAttribute('data-module') === module); });
    say(module === 'bess' ? 'Set a target, then place the system step by step on the canvas.' : 'The guided build will confirm the equipment and layout before placement.');
  }
  function engineStyle(doc) {
    var s = doc.createElement('style'); s.id = 'omega-lite-chrome';
    s.textContent = 'html,body{width:100%!important;height:100%!important;overflow:hidden!important;margin:0!important;background:#f1f9fc!important}' +
      '#portal-nav,#tb,#ribbon-tabs,#ribbon,#doc-tabs,#tabs,#lp,#rp,#rr,#omg-firstrun,#omega-compass,#o2-tb,#statusbar,#scorep,#d4,#d4-scrim,#e5-terrain,.op-panel,#o2-coords,#rr-mapbadge{display:none!important}' +
      '#ws{position:fixed!important;inset:0!important;width:100%!important;height:100%!important;min-height:0!important}' +
      '#cw{background:#f1f9fc!important;min-width:0!important}#cw-grid{background-image:radial-gradient(circle,#dcecf1 1px,transparent 1px)!important}' +
      '#sld-toolbar button{display:none!important}#sld-toolbar button:first-of-type,#sld-toolbar button:last-of-type{display:inline-block!important}' +
      '#sld-sheet{min-width:0!important}#zc{bottom:12px!important}#banner{max-width:calc(100% - 24px)!important}' +
      '#bgb-modal,#cgb-modal,#derb-modal,#dcfc-modal{padding:12px!important}' +
      '#bgb-modal>div,#cgb-modal>div,#derb-modal>div,#dcfc-modal>div{max-height:95vh!important;overflow:auto!important}';
    // Retain the canonical guide's controls, with the same light presentation
    // and tenant accent as the outer shell. No duplicate sizing engine.
    var brand=getComputedStyle(document.documentElement).getPropertyValue('--brand').trim()||'#3fafc6';
    ['bgb-modal','cgb-modal','derb-modal','dcfc-modal'].forEach(function(id){
      var p='#'+id;
      s.textContent+=p+'>div,'+p+'>div div{background:#fff!important;color:#14303c!important}'+
        p+' label,'+p+' p,'+p+' strong{color:#3f5d68!important}'+
        p+' input,'+p+' select{background:#f1fafc!important;color:#14303c!important;border:1px solid #dcecf1!important;border-radius:9px!important}'+
        p+' button{background:'+brand+'!important;background-image:none!important;color:white!important;border-radius:999px!important;box-shadow:none!important}';
    });
    if (customer) s.textContent += '#bom-rfq{display:none!important}#bom-modal>div{background:white!important;border-color:#dcecf1!important}#bom-modal td,#bom-modal th,#bom-modal span,#bom-modal label{color:#14303c!important}#bom-modal button{border-radius:999px!important}';
    s.textContent+='#dcfc-guide,#dcfc-guide div{background:#fff!important;color:#14303c!important;border-color:#dcecf1!important}#dcfc-guide{max-width:270px!important;max-height:75vh!important;overflow:auto!important;border-radius:14px!important}#dcfc-guide span{color:#3f5d68!important}#dcfc-guide button{background:'+brand+'!important;color:white!important;border-radius:999px!important}';
    doc.head.appendChild(s);
  }
  function mountEngine() {
    var frame = $('engine'), q = new URLSearchParams(), version = authVersion;
    // White-label preview paints a brand only. The canonical editor retains
    // the signed-in user's org for every project save and restore.
    if (customer) q.set('customerEngine', '1');
    else if (context.preview) q.set('wlpreview', context.org);
    var project = params.get('project') || params.get('id');
    if (project && !customer) q.set('project', project);
    frame.onload = function () {
      if(version !== authVersion)return;
      try {
        engine = frame.contentWindow; engineStyle(engine.document);
        // The Lite entry point never exposes the platform-wide BESS picker.
        engine._bgbOpenConfig=function(){var modal=engine.document.getElementById('bgb-modal');if(modal)modal.remove();$('bess-sku').focus();say('Choose equipment from your supplier catalog in this panel.');};
        if (typeof engine.setMode !== 'function' || typeof engine._bgbState !== 'function') throw new Error('The design engine did not finish loading. Reload to retry.');
        if (customer) {
          // Branding only; this does not initialize a tenant or change identity.
          var ec=engine.CLEARSKY_CONFIG||(engine.CLEARSKY_CONFIG={});
          ec.tenant={orgId:context.org,name:context.name,logo:context.logoUrl,whiteLabel:{enabled:true,platformName:context.name,shortName:context.name,markUrl:context.logoUrl,attribution:'none'}};
          if(engine.OmegaWhiteLabel)engine.OmegaWhiteLabel.apply();
          engine.saveProject = saveCustomer;
          loadCustomer().then(function () {
            if(version !== authVersion)return;
            loaded = true; frame.style.visibility = 'visible'; $('curtain').hidden = true;
            $('build').disabled = !context.modules.length; $('configure').disabled = !context.modules.length;
            engine.dispatchEvent(new Event('resize'));
            if(siteAddress)loadSite();else $('map-status').textContent='Enter a site address to begin.';
            timer = setInterval(function () {
              if (Date.parse(context.expiresAt) <= Date.now()) { $('gate').hidden = false; $('gateMessage').textContent = 'Your Editor Lite access has expired. Your saved projects are retained.'; return; }
              saveCustomer(true);
            }, 20000);
          }).catch(function (e) { if(version === authVersion)$('curtain').textContent = e.message; });
          return;
        }
        frame.style.visibility = 'visible'; $('curtain').hidden = true;
        $('build').disabled = !context.modules.length; $('configure').disabled = !context.modules.length;
        engine.dispatchEvent(new Event('resize'));
        siteAddress=siteAddress||engine._lastAddr||'';$('site-address').value=siteAddress;if(siteAddress)loadSite();
        timer = setInterval(function () {
          var name = engine.document.getElementById('pname'), saved = engine.document.getElementById('pn-saved');
          if (name && document.activeElement !== $('title')) $('title').value = name.value;
          $('status').textContent = 'Site Map · concept design' + (saved && saved.textContent ? ' · ' + saved.textContent : ' · not yet saved');
          // Preserve the project id in the shell after first canonical save.
          var id = new URLSearchParams(engine.location.search).get('project');
          if (id && params.get('project') !== id) { params.set('project', id); history.replaceState(null, '', '?' + params.toString()); }
        }, 1000);
      } catch (e) { $('curtain').textContent = e.message; }
    };
    frame.src = '/editor.html?' + q.toString();
  }
  function projectRequest(id) {
    return auth.currentUser.getIdToken().then(function (t) { return fetch('/api/customer-design?org=' + encodeURIComponent(context.org) + '&project=' + encodeURIComponent(id), {headers:{Authorization:'Bearer '+t}}); }).then(function (r) { return r.json().then(function (d) { if(!r.ok)throw new Error(d.error||'Could not open this project.');return d.project; }); });
  }
  function snapshot() { return JSON.stringify({ name: $('title').value.trim() || 'Untitled site plan', module: selected(), kw: $('kw').value, hours: $('hours').value,sku:$('bess-sku').value,siteAddress:siteAddress, canvas: call('_serializeCanvas') }); }
  function loadCustomer() {
    var version=authVersion;
    if (!projectId) {
      var bytes = new Uint8Array(16); crypto.getRandomValues(bytes);
      projectId = 'design_' + Array.prototype.map.call(bytes, function (n) { return ('0' + n.toString(16)).slice(-2); }).join('');
      $('title').value = 'Untitled site plan'; $('status').textContent = 'Site Map · concept design · not yet saved';
      savedSnapshot = snapshot(); return Promise.resolve();
    }
    return projectRequest(projectId).then(function (p) {
      if(version !== authVersion)throw new Error('Your sign-in changed. Reopen this project.');
      if (!permitted(p.module)) throw new Error('This project uses a module that is no longer enabled. Contact your supplier.');
      revision = p.revision; $('title').value = p.name; setModule(p.module);
      siteAddress=p.siteAddress||siteAddress;$('site-address').value=siteAddress;
      $('kw').value = p.target.kw; $('hours').value = p.target.hours || 2;
      if(p.target.product&&Array.prototype.some.call($('bess-sku').options,function(o){return o.value===p.target.product.sku;}))$('bess-sku').value=p.target.product.sku;
      call('_restoreCanvas', [p.canvas]);
      var name = engine.document.getElementById('pname'); if (name) name.value = p.name;
      savedSnapshot = snapshot(); $('status').textContent = 'Site Map · saved ' + new Date(p.updatedAt).toLocaleString();
    });
  }
  function saveCustomer(automatic) {
    if (!loaded || saveBusy || !engine) return Promise.resolve();
    var state,version=authVersion;
    try { state = snapshot(); } catch (e) { say('Could not capture this canvas: ' + e.message, true); return Promise.resolve(); }
    if (automatic && state === savedSnapshot && revision > 0) return Promise.resolve({id:projectId,revision:revision});
    if (automatic && state === savedSnapshot && revision === 0) return Promise.resolve();
    saveBusy = true; $('save').disabled = true; $('status').textContent = 'Saving your customer project…';
    var data = JSON.parse(state); data.action = 'save'; data.projectId = projectId; data.revision = revision;
    return request(data).then(function (r) {
      if(version !== authVersion)return null;
      revision = r.revision; savedSnapshot = state;
      params.set('project', r.id); history.replaceState(null, '', '?' + params.toString());
      $('status').textContent = 'Site Map · saved ' + new Date(r.updatedAt).toLocaleTimeString();
      say('Saved to your customer account. This design is a concept, not an order.');
      return r;
    }).catch(function (e) { $('status').textContent = 'Not saved · keep this window open'; say(e.message, true); return null; })
      .then(function (r) { saveBusy = false; $('save').disabled = false; return r; });
  }
  function quoteControls(products) {
    if ($('quote-controls')) $('quote-controls').remove();
    var section=document.createElement('details');section.id='quote-controls';
    section.innerHTML='<summary>Request equipment quote</summary><p class="note">Choose published equipment for the supplier to review alongside your saved concept. No order is accepted or payment taken here.</p><label for="quote-sku">Equipment</label><select id="quote-sku"></select><label for="quote-qty">Units</label><input id="quote-qty" type="number" min="1" max="9999" step="1" value="1"><button id="quote-send">Save &amp; request quote</button><p id="quote-result" class="note" role="status"></p>';
    document.querySelector('aside.right').appendChild(section);
    (products||[]).forEach(function(p){var o=document.createElement('option');o.value=p.sku;o.textContent=p.name+' · '+p.sku;$('quote-sku').appendChild(o);});
    $('quote-send').disabled=!(products||[]).length;
    if(!(products||[]).length)$('quote-result').textContent='Your supplier has not published an equipment catalog yet. Your design can still be saved.';
    $('quote-send').onclick=function(){
      var qty=Number($('quote-qty').value),sku=$('quote-sku').value;
      if(!isFinite(qty)||qty!==Math.floor(qty)||qty<1||qty>9999){say('Enter a whole number from 1 to 9999 units.',true);return;}
      if(!confirm('Send a quote request for '+qty+' × '+sku+' with this saved design? This does not accept a price or take payment.'))return;
      $('quote-send').disabled=true;
      saveCustomer(revision>0).then(function(saved){if(!saved)throw new Error('Save the design successfully before requesting a quote.');return request({action:'quote',projectId:projectId,revision:saved.revision,sku:sku,qty:qty});}).then(function(r){
        $('quote-result').textContent=(r.duplicate?'Existing request ':'Quote requested · ')+r.orderNo+'. Follow it in your customer account.';
      }).catch(function(e){$('quote-result').textContent=e.message;}).then(function(){$('quote-send').disabled=false;});
    };
  }
  window.addEventListener('beforeunload', function (e) { if (customer && loaded && engine && snapshot() !== savedSnapshot) { e.preventDefault(); e.returnValue = ''; } });
  function guide(onlyConfigure) {
    if (busy || !engine) return;
    if(!mapReady){say('Load your site address before starting a guided build.',true);return;}
    var module = selected();
    if (!permitted(module)) { say('This module is not included in this account.', true); return; }
    busy = true; $('build').disabled = true;
    request({ module: module, kw: $('kw').value, hours: $('hours').value,sku:$('bess-sku').value }).then(function (sizing) {
      call('switchTab', ['site']);
      if (module === 'bess') {
        var state=call('_bgbState'),product=sizing.product;
        if(!product)throw new Error('Reload to obtain the supplier catalog before placing BESS.');
        state.kw=sizing.selectedKw;state.kwh=sizing.selectedKwh;state.cfg=call('_bgbGenericCfg',[state.kw,state.kwh]);
        if(!product.placeholder){state.cfg.id=product.sku;state.cfg.model=String(product.name||'').replace(/[<>&"']/g,function(c){return {'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c];});state.cfg.placeholder=false;state.cfg.kw=product.kw;state.cfg.kwh=product.kwh;state.cfg.qty=sizing.qty;state.cfg.chem=String(product.chemistry||'TBD').replace(/[<>]/g,'');state.cfg.notes='Supplier catalog concept; equipment clearances and engineering require review.';state.cfg.usable=null;state.cfg.inv='TBD';}
        state.units=sizing.qty;state.unitKw=product.kw||state.kw;state.unitKwh=product.kwh||state.kwh;
        state.incPcs=product.placeholder?true:!!product.integrates.pcs;state.incXfmr=product.placeholder?false:!!product.integrates.xfmr;state.incDisco=product.placeholder?false:!!product.integrates.disco;
        state.sizeLocked = true; state.mode = 'BTM';
        engine.__omegaForceMode='BTM';call('setMapInteractive',[false]);
        call('_bgbStartPlacing');
        say(product.placeholder?'Click the canvas to begin. Generic design placeholder—not a specified product or an order.':sizing.qty+' × '+product.name+' · '+sizing.selectedKw+' kW / '+sizing.selectedKwh+' kWh. Click the canvas to begin the concept layout.');
      } else if (module === 'compute') {
        if (!engine.OmegaCGB) throw new Error('Compute guided build is unavailable.');
        // The canonical guide applies its format defaults while opening.
        // Set the customer's target after that reset, then recompute its plan.
        engine.OmegaCGB.open();
        engine.document.getElementById('cgb-itmw').value = sizing.kw / 1000;
        engine.OmegaCGB.sync();
      } else if (module === 'ev') { call('openDcfcBuild'); say('Select the charger model and count in the guide; the target is a planning input, not a product quote.'); }
      else {
        call('openDerBuild');
        var source = engine.document.getElementById('derb-src');
        Array.prototype.slice.call(source.options).forEach(function (o) { if (o.value !== 'pv') o.remove(); });
        source.value = 'pv';
        var solarTarget = engine.document.getElementById('derb-mw');
        solarTarget.value = sizing.kw / 1000;
        solarTarget.dispatchEvent(new engine.Event('input', { bubbles: true }));
      }
    }).catch(function (e) { say(e.message, true); }).then(function () { busy = false; $('build').disabled = false; });
  }
  function command(name, button) {
    try {
      if (!engine) throw new Error('Wait for the canvas to finish loading.');
      if (name === 'storage') { if (!permitted('bess')) throw new Error('BESS is not enabled.'); setModule('bess'); guide(false); }
      else if (name === 'select' || name === 'pan') { call('setMode', ['select']); if (typeof engine.setMapInteractive === 'function') engine.setMapInteractive(name === 'pan'); }
      else if (name === 'transformer') { if (!context.modules.length) throw new Error('Enable a design module first.'); call('rbInsert', ['xfmr']); }
      else if (name === 'measure') call('setMode', ['dimension']);
      else if (name === 'plot') call('switchTab', ['site']);
      else if (name === 'atlas') { showAtlas();return; }
      else if (name === 'sld') { call('sldFromSite'); call('switchTab', ['sld']); }
      else if (name === 'bom') {
        call('openBomSourcing');
        if(customer){
          var modal=engine.document.getElementById('bom-modal');
          if(modal){var heading=modal.firstElementChild&&modal.firstElementChild.firstElementChild&&modal.firstElementChild.firstElementChild.firstElementChild;if(heading&&heading.children.length>=2){heading.children[0].textContent='Estimated bill of materials';heading.children[0].style.color='#14303c';heading.children[1].textContent='Concept quantities from the drawing. Review equipment and field runs before purchase.';}
            var foot=modal.querySelector('#bom-rfq');if(foot&&foot.nextElementSibling)foot.nextElementSibling.textContent='For supplier pricing, use Request equipment quote in the guided-build panel. This takeoff is not an approved order or engineering certification.';
          }
        }
      }
      else if (name === 'proposal') call('openProposalExport');
      else if (name === 'drawings') call('openPermitSetModal');
      if (button && ['plot','select','pan'].indexOf(name)>=0) {var group=name==='plot'?['plot','atlas']:['select','pan'];document.querySelectorAll('[data-command]').forEach(function(b){if(group.indexOf(b.getAttribute('data-command'))>=0)b.classList.toggle('active',b===button);});}
    } catch (e) { say(e.message, true); }
  }
  document.querySelectorAll('[data-command]').forEach(function (b) { b.onclick = function () { command(b.getAttribute('data-command'), b); }; });
  document.querySelector('[data-command="plot"]').addEventListener('click',function(){atlasPanel.hidden=true;atlasItems.forEach(function(m){m.setMap(null);});atlasItems=[];});
  function loadSite(){
    var address=$('site-address').value.trim();if(!engine||!address)return;
    if(mapReady&&siteAddress!==address&&call('_serializeCanvas').elements.length&&!confirm('Change the map location? Existing equipment stays in this project. Verify every placement at the new site.'))return;
    siteAddress=address;mapReady=false;$('map-status').textContent='Loading Google Maps…';
    engine.document.getElementById('addr-in').value=address;
    engine.document.getElementById('gmap-status').textContent='Loading';
    try{call('fetchMap');}catch(e){$('map-status').textContent=e.message;return;}
    var attempt=0,version=authVersion;var poll=setInterval(function(){
      if(version!==authVersion||!engine){clearInterval(poll);return;}
      var status=engine.document.getElementById('gmap-status').textContent;
      if(engine._gmap&&/Satellite loaded/i.test(status)){clearInterval(poll);mapReady=true;call('setMapInteractive',[true]);$('map-status').textContent='Site loaded · pan to review, then start a guided build.';}
      else if(++attempt>=60||/not found|failed|blocked/i.test(status)){clearInterval(poll);$('map-status').textContent='Map could not load. Check the address and the Google Maps configuration.';}
    },500);
  }
  siteBar.onsubmit=function(e){e.preventDefault();loadSite();};
  function showAtlas(){
    if(!mapReady){say('Load your site address first.',true);return;}
    call('switchTab',['site']);atlasPanel.hidden=false;atlasPanel.textContent='Checking Grid Atlas…';var center=engine._gmap.getCenter();
    auth.currentUser.getIdToken().then(function(t){return fetch('/api/lite-atlas',{method:'POST',headers:{Authorization:'Bearer '+t,'Content-Type':'application/json'},body:JSON.stringify({org:context.org,customer:customer,lat:center.lat(),lng:center.lng(),sizeMw:Number($('kw').value)/1000})});}).then(function(r){return r.json().then(function(d){if(!r.ok)throw new Error(d.error||'Grid Atlas unavailable');return d;});}).then(function(d){
      atlasPanel.textContent='';var h=document.createElement('h3');h.textContent='Grid Atlas';atlasPanel.appendChild(h);
      [d.summary,'Nearby infrastructure is not proof of available utility capacity.'].concat((d.findings||[]).map(function(f){return f.text;})).forEach(function(text){var p=document.createElement('p');p.textContent=text;atlasPanel.appendChild(p);});
      atlasItems.forEach(function(m){m.setMap(null);});atlasItems=[];
      (d.substations||[]).slice(0,50).forEach(function(s){if(!isFinite(Number(s.lat))||!isFinite(Number(s.lng)))return;atlasItems.push(new engine.google.maps.Marker({position:{lat:Number(s.lat),lng:Number(s.lng)},map:engine._gmap,title:String(s.name||'Substation')}));});
      var sources=document.createElement('p');sources.textContent='Sources: '+JSON.stringify(d.sources||{});atlasPanel.appendChild(sources);
    }).catch(function(e){atlasPanel.textContent=e.message;});
  }
  $('module').onchange = function () { setModule(selected()); };
  $('build').onclick = function () { guide(false); }; $('configure').onclick = function () { guide(true); };
  $('title').oninput = function () { if (!engine) return; var n = engine.document.getElementById('pname'); if (n) { n.value = $('title').value; n.dispatchEvent(new Event('input', { bubbles: true })); } };
  $('save').onclick = function () { try { Promise.resolve(call('saveProject')).catch(function (e) { say(e.message, true); }); } catch (e) { say(e.message, true); } };
  auth.onAuthStateChanged(function (user) {
    var version=++authVersion;
    clearInterval(timer); loaded = false;mapReady=false;atlasPanel.hidden=true;engine = null; $('engine').src = 'about:blank'; $('engine').style.visibility = 'hidden'; $('gate').hidden = false;
    if (customer) window.OmegaBuyerEngine.authorized = false;
    if (!user) { $('gateMessage').textContent = 'Sign in with your licensed company account to open Editor Lite.'; return; }
    request().then(function (data) {
      if(version !== authVersion)return;
      $('bess-sku').textContent='';(data.designProducts||[]).forEach(function(p){var o=document.createElement('option');o.value=p.sku;o.textContent=p.name+(p.placeholder?'':' · '+p.kw+' kW / '+p.kwh+' kWh');$('bess-sku').appendChild(o);});
      $('catalog-note').textContent=(data.designProducts||[]).some(function(p){return p.placeholder;})?'Generic design template only. Your supplier has not published a dimensioned BESS product yet.':'Only this supplier’s enabled BESS products appear here.';
      if (customer) {
        if (!data.access.active) throw new Error('Editor Lite requires an active customer subscription or an approved trial. Your free customer account remains available.');
        quoteControls(data.products);
        data = { org: data.org, name: data.brand.name, logoUrl: data.brand.logoUrl, brand: data.brand,
          modules: data.access.modules, expiresAt: data.access.expiresAt, note: 'Customer design workspace · ' + data.access.status + ' access. Designs remain separate from supplier staff projects.' };
        window.OmegaBuyerEngine.authorized = true;
      }
      context = data; $('brandName').textContent = data.name;
      if (data.brand) OmegaLogicTheme.apply(data.brand);
      if (data.logoUrl && (/^https:\/\//.test(data.logoUrl) || /^\/(?!\/)/.test(data.logoUrl))) { $('logo').src = data.logoUrl; $('logo').hidden = false; $('logo').onerror = function () { this.hidden = true; }; }
      $('module').textContent = ''; $('moduleList').textContent = '';
      Object.keys(labels).forEach(function (m) {
        var b = document.createElement('button'); b.textContent = labels[m] + (permitted(m) ? '' : ' · not in plan'); b.disabled = !permitted(m); b.setAttribute('data-module', m); b.onclick = function () { setModule(m); }; $('moduleList').appendChild(b);
        if (permitted(m)) { var o = document.createElement('option'); o.value = m; o.textContent = labels[m]; $('module').appendChild(o); }
      });
      $('scope').textContent = data.preview ? 'Brand preview. Projects save to your own ' + data.projectOrg + ' workspace—not this customer’s account.' : data.note;
      $('scope').className = data.preview ? 'note preview' : 'note';
      if (data.modules.length) setModule(data.modules[0]); else say('No design modules enabled. Ask your account administrator.', true);
      $('gate').hidden = true; mountEngine();
    }).catch(function (e) { $('gateMessage').textContent = e.message; });
  });
}());
