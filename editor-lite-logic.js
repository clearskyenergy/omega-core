/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   A small shell over ONE canonical editor. No forked engine or simulated outputs.
   Module presentation is a commercial control; Firestore remains the project
   data boundary. The server rechecks subscription/modules for guided requests. */
(function () {
  'use strict';
  var cfg = window.CLEARSKY_CONFIG || {}, params = new URLSearchParams(location.search);
  if (!firebase.apps.length) firebase.initializeApp(cfg.firebase || cfg);
  var auth = firebase.auth(), context = null, engine = null, busy = false, timer = null;
  var labels = { bess: 'BESS', compute: 'Compute', ev: 'EV charging', solar: 'Solar' };
  function $(id) { return document.getElementById(id); }
  function say(text, bad) { $('message').textContent = text; $('message').className = bad ? 'error' : ''; }
  function request(body) {
    if (!auth.currentUser) return Promise.reject(new Error('Sign in to use Editor Lite.'));
    var org = context ? context.org : params.get('org') || '';
    return auth.currentUser.getIdToken().then(function (token) {
      return fetch('/api/editor-lite' + (body ? '' : '?org=' + encodeURIComponent(org)), {
        method: body ? 'POST' : 'GET', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(Object.assign({ org: org }, body)) : undefined
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
    $('module').value = module; $('hoursRow').hidden = module !== 'bess';
    $('build').textContent = module === 'bess' ? 'Place them' : 'Start guided build';
    Array.prototype.forEach.call($('moduleList').children, function (b) { b.classList.toggle('active', b.getAttribute('data-module') === module); });
    say(module === 'bess' ? 'Set a target, then place the system step by step on the canvas.' : 'The guided build will confirm the equipment and layout before placement.');
  }
  function engineStyle(doc) {
    var s = doc.createElement('style'); s.id = 'omega-lite-chrome';
    s.textContent = 'html,body{width:100%!important;height:100%!important;overflow:hidden!important;margin:0!important;background:#f1f9fc!important}' +
      '#portal-nav,#tb,#ribbon-tabs,#ribbon,#doc-tabs,#tabs,#lp,#rp,#o2-tb,#statusbar,#scorep,#d4,#d4-scrim,#e5-terrain,.op-panel,#o2-coords,#rr-mapbadge{display:none!important}' +
      '#ws{position:fixed!important;inset:0!important;width:100%!important;height:100%!important;min-height:0!important}' +
      '#cw{background:#f1f9fc!important;min-width:0!important}#cw-grid{background-image:radial-gradient(circle,#dcecf1 1px,transparent 1px)!important}' +
      '#sld-toolbar button{display:none!important}#sld-toolbar button:first-of-type,#sld-toolbar button:last-of-type{display:inline-block!important}' +
      '#sld-sheet{min-width:0!important}#zc{bottom:12px!important}#banner{max-width:calc(100% - 24px)!important}' +
      '#bgb-modal,#cgb-modal,#derb-modal,#dcfc-modal{padding:12px!important}' +
      '#bgb-modal>div,#cgb-modal>div,#derb-modal>div,#dcfc-modal>div{max-height:95vh!important;overflow:auto!important}';
    doc.head.appendChild(s);
  }
  function mountEngine() {
    var frame = $('engine'), q = new URLSearchParams();
    // White-label preview paints a brand only. The canonical editor retains
    // the signed-in user's org for every project save and restore.
    if (context.preview) q.set('wlpreview', context.org);
    var project = params.get('project') || params.get('id');
    if (project) q.set('project', project);
    frame.onload = function () {
      try {
        engine = frame.contentWindow; engineStyle(engine.document);
        if (typeof engine.setMode !== 'function' || typeof engine._bgbState !== 'function') throw new Error('The design engine did not finish loading. Reload to retry.');
        frame.style.visibility = 'visible'; $('curtain').hidden = true;
        $('build').disabled = !context.modules.length; $('configure').disabled = !context.modules.length;
        engine.dispatchEvent(new Event('resize'));
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
  function guide(onlyConfigure) {
    if (busy || !engine) return;
    var module = selected();
    if (!permitted(module)) { say('This module is not included in this account.', true); return; }
    busy = true; $('build').disabled = true;
    request({ module: module, kw: $('kw').value, hours: $('hours').value }).then(function (sizing) {
      call('switchTab', ['site']);
      if (module === 'bess') {
        if (onlyConfigure) { call('openBessGuidedBuild'); call('_bgbOpenConfig'); return; }
        var state = call('_bgbState'), s = engine.S;
        if (s && s.bessList && s.bessList.length) {
          call('openBessGuidedBuild');
          say('Review the configured equipment and quantity. Existing equipment settings take precedence over a new concept target.');
          return;
        }
        state.kw = sizing.kw; state.kwh = sizing.kwh; state.cfg = call('_bgbGenericCfg', [sizing.kw, sizing.kwh]);
        state.sizeLocked = true; state.mode = 'BTM';
        call('_bgbStartPlacing');
        say('Click the canvas to begin guided placement. This is a generic capacity concept—not a selected CleanCell product or an order.');
      } else if (module === 'compute') {
        if (!engine.OmegaCGB) throw new Error('Compute guided build is unavailable.');
        engine.OmegaCGB.state().computeMw = sizing.kw / 1000; engine.OmegaCGB.open();
      } else if (module === 'ev') { call('openDcfcBuild'); say('Select the charger model and count in the guide; the target is a planning input, not a product quote.'); }
      else {
        call('openDerBuild');
        var source = engine.document.getElementById('derb-src');
        Array.prototype.slice.call(source.options).forEach(function (o) { if (o.value !== 'pv') o.remove(); });
        source.value = 'pv'; engine.document.getElementById('derb-mw').value = sizing.kw / 1000;
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
      else if (name === 'sld') { call('sldFromSite'); call('switchTab', ['sld']); }
      else if (name === 'bom') call('openBomSourcing');
      else if (name === 'proposal') call('openProposalExport');
      else if (name === 'drawings') call('openPermitSetModal');
      if (button) { var group = ['plot','sld','bom','proposal','drawings'].indexOf(name) >= 0;
        document.querySelectorAll('[data-command]').forEach(function (b) { if ((['plot','sld','bom','proposal','drawings'].indexOf(b.getAttribute('data-command')) >= 0) === group) b.classList.toggle('active', b === button); }); }
    } catch (e) { say(e.message, true); }
  }
  document.querySelectorAll('[data-command]').forEach(function (b) { b.onclick = function () { command(b.getAttribute('data-command'), b); }; });
  $('module').onchange = function () { setModule(selected()); };
  $('build').onclick = function () { guide(false); }; $('configure').onclick = function () { guide(true); };
  $('title').oninput = function () { if (!engine) return; var n = engine.document.getElementById('pname'); if (n) { n.value = $('title').value; n.dispatchEvent(new Event('input', { bubbles: true })); } };
  $('save').onclick = function () { try { Promise.resolve(call('saveProject')).catch(function (e) { say(e.message, true); }); } catch (e) { say(e.message, true); } };
  auth.onAuthStateChanged(function (user) {
    clearInterval(timer); engine = null; $('engine').style.visibility = 'hidden'; $('gate').hidden = false;
    if (!user) { $('gateMessage').textContent = 'Sign in with your licensed company account to open Editor Lite.'; return; }
    request().then(function (data) {
      context = data; $('brandName').textContent = data.name;
      if (data.logoUrl && (/^https:\/\//.test(data.logoUrl) || /^\/(?!\/)/.test(data.logoUrl))) { $('logo').src = data.logoUrl; $('logo').hidden = false; $('logo').onerror = function () { this.hidden = true; }; }
      $('module').textContent = ''; $('moduleList').textContent = '';
      Object.keys(labels).forEach(function (m) {
        var b = document.createElement('button'); b.textContent = labels[m] + (permitted(m) ? '' : ' · not in plan'); b.disabled = !permitted(m); b.setAttribute('data-module', m); b.onclick = function () { setModule(m); }; $('moduleList').appendChild(b);
        if (permitted(m)) { var o = document.createElement('option'); o.value = m; o.textContent = labels[m]; $('module').appendChild(o); }
      });
      document.querySelector('[data-command="storage"]').disabled = !permitted('bess');
      $('scope').textContent = data.preview ? 'Brand preview. Projects save to your own ' + data.projectOrg + ' workspace—not this customer’s account.' : data.note;
      $('scope').className = data.preview ? 'note preview' : 'note';
      if (data.modules.length) setModule(data.modules[0]); else say('No design modules enabled. Ask your account administrator.', true);
      $('gate').hidden = true; mountEngine();
    }).catch(function (e) { $('gateMessage').textContent = e.message; });
  });
}());
