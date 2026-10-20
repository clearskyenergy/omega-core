/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * Solar design report on the Site Plan. This file asks /api/solar-design
 * and shows the answer. It does not pack modules, size a string, or
 * compute an hour.
 */
(function (root) {
  'use strict';

  var catalog = null;

  function $(id) { return document.getElementById(id); }

  function payload(doc) {
    var G = root.OmegaEditorV2Geom;
    var list = (doc && doc.entities) || [];
    var array = null, boundaryEnt = null, i, e, b, area, bestA = -1;
    for (i = 0; i < list.length; i++) if (list[i].type === 'array') { array = list[i]; break; }
    if (array && array.boundaryId) {
      for (i = 0; i < list.length; i++) if (list[i].id === array.boundaryId) boundaryEnt = list[i];
    }
    if (!boundaryEnt) {
      for (i = 0; i < list.length; i++) {
        e = list[i];
        if (e.type !== 'polygon' && e.type !== 'rect') continue;
        b = G.boundsOf(e);
        area = Math.max(0, b.maxX - b.minX) * Math.max(0, b.maxY - b.minY);
        if (area > bestA) { bestA = area; boundaryEnt = e; }
      }
    }
    var exclusions = [], assumed = false, pts, h;
    for (i = 0; i < list.length; i++) {
      e = list[i];
      if (e.type !== 'obstruction') continue;
      pts = G.ringOf(e);
      if (!pts) continue;
      h = +e.heightFt;
      if (!(h > 0)) { h = 15; assumed = true; }
      exclusions.push({ pts: pts, heightFt: h });
    }
    var anchor = (doc && doc.anchor) || {};
    var horizon = [];
    if (doc && doc.solar && doc.solar.horizon) horizon = doc.solar.horizon;
    else if (doc && doc.horizon) horizon = doc.horizon;
    return {
      name: (doc && doc.name) || '',
      lat: anchor.lat,
      lon: anchor.lng != null ? anchor.lng : anchor.lon,
      boundary: boundaryEnt ? G.ringOf(boundaryEnt) : null,
      exclusions: exclusions,
      mount: array ? array.mount : null,
      setbackFt: array ? array.setbackFt : null,
      gcr: array && array.gcr > 0 ? array.gcr : null,
      horizon: horizon,
      assumedHeight: assumed
    };
  }

  function ensureDialog() {
    if ($('dlg-solar')) return;
    var dlg = document.createElement('dialog');
    dlg.id = 'dlg-solar';
    dlg.setAttribute('aria-labelledby', 'solar-title');
    dlg.style.width = 'min(640px, calc(100% - 24px))';
    dlg.innerHTML =
      '<form id="solar-form">' +
      '<h2 id="solar-title">Solar design report</h2>' +
      '<p id="solar-lead">The drawing is the design. Run it to fill the modules, the strings, and the year.</p>' +
      '<div id="solar-summary"></div>' +
      '<details id="solar-advanced"><summary>Module and inverter</summary><div id="solar-picks"></div></details>' +
      '<details id="solar-detail" hidden><summary>Loss tree, months, shading, bill, wiring</summary><pre id="solar-body"></pre></details>' +
      '<p id="solar-error" role="alert"></p>' +
      '<div class="row-actions">' +
      '<button type="button" class="btn" id="solar-close">Close</button>' +
      '<button type="button" class="btn primary" id="solar-run">Run the design</button>' +
      '</div></form>';
    document.body.appendChild(dlg);
    $('solar-close').addEventListener('click', function () { dlg.close(); });
    $('solar-form').addEventListener('submit', function (ev) { ev.preventDefault(); });
  }

  function fillPicks() {
    var host = $('solar-picks');
    if (!host || host.childNodes.length) return;
    host.innerHTML =
      '<label>Module <select data-solar="module"></select></label>' +
      '<label>Inverter <select data-solar="inverter"></select></label>';
    var mods = $('solar-picks').querySelector('[data-solar="module"]');
    var invs = $('solar-picks').querySelector('[data-solar="inverter"]');
    function add(sel, key, label) {
      var o = document.createElement('option');
      o.value = key;
      o.textContent = label;
      sel.appendChild(o);
    }
    if (!catalog) {
      add(mods, 'jinko-jkm640', 'Jinko 640 W');
      add(invs, 'cps-125', 'CPS 125 kW');
      return;
    }
    var i, m;
    for (i = 0; i < catalog.modules.length; i++) {
      m = catalog.modules[i];
      add(mods, m.key, m.manufacturer + ' ' + m.watts + ' W');
    }
    for (i = 0; i < catalog.inverters.length; i++) {
      m = catalog.inverters[i];
      add(invs, m.key, m.name);
    }
  }

  function loadCatalog() {
    if (catalog) return Promise.resolve(catalog);
    return fetch('/api/solar-design').then(function (res) {
      return res.json();
    }).then(function (body) {
      catalog = body && body.catalog;
      fillPicks();
    }, function () { fillPicks(); });
  }

  function ask(body) {
    var headers = { 'Content-Type': 'application/json' };
    var user = root.firebase && root.firebase.auth && root.firebase.auth().currentUser;
    var tokenP = user ? user.getIdToken() : Promise.resolve('');
    return tokenP.then(function (token) {
      if (token) headers.Authorization = 'Bearer ' + token;
      return fetch('/api/solar-design', { method: 'POST', headers: headers, body: JSON.stringify(body) });
    }).then(function (res) {
      return res.json().then(function (json) {
        return { status: res.status, ok: res.ok, body: json };
      }, function () { return { status: res.status, ok: false, body: null }; });
    }, function () { return { status: 0, ok: false, body: null }; });
  }

  function show(ctx) {
    ensureDialog();
    var lead = $('solar-lead');
    var sum = $('solar-summary');
    var err = $('solar-error');
    var detail = $('solar-detail');
    var run = $('solar-run');
    lead.textContent = 'The drawing is the design. Run it to fill the modules, the strings, and the year.';
    sum.textContent = '';
    err.textContent = '';
    detail.hidden = true;
    run.disabled = false;
    run.textContent = 'Run the design';
    loadCatalog();
    run.onclick = function () { go(ctx); };
    $('dlg-solar').showModal();
  }

  function go(ctx) {
    var doc = ctx.getDoc();
    var body = payload(doc);
    var err = $('solar-error');
    var run = $('solar-run');
    err.textContent = '';
    if (body.lat == null || body.lon == null) {
      err.textContent = 'Set the site anchor, then run the design.';
      return;
    }
    if (!body.boundary || body.boundary.length < 3) {
      err.textContent = 'Draw a closed boundary, then run the design.';
      return;
    }
    var picks = $('solar-picks');
    if (picks) {
      var mk = picks.querySelector('[data-solar="module"]');
      var ik = picks.querySelector('[data-solar="inverter"]');
      if (mk && mk.value) body.moduleKey = mk.value;
      if (ik && ik.value) body.inverterKey = ik.value;
    }
    var assumed = body.assumedHeight;
    delete body.assumedHeight;
    run.disabled = true;
    run.textContent = 'Running…';
    if (ctx.setStatus) ctx.setStatus('Running the solar design.');
    ask(body).then(function (res) {
      run.disabled = false;
      run.textContent = 'Run the design';
      if (!res.ok || !res.body || res.body.ok === false) {
        var msg = (res.body && (res.body.reason || res.body.error)) || 'The design did not run.';
        if (res.status === 401 || res.status === 403 || res.status === 0) msg = 'Sign in on the workspace, then run the design again.';
        err.textContent = msg;
        if (ctx.setStatus) ctx.setStatus(msg, true);
        return;
      }
      paint(ctx, res.body, assumed);
    });
  }

  function paint(ctx, rep, assumed) {
    var s = rep.summary || {};
    var price = rep.pricing && rep.pricing.perWdc != null ? ('$' + Number(rep.pricing.perWdc).toFixed(2) + '/W') : 'price not on file';
    var lines = [
      s.mountLabel + ' · ' + s.kwDc + ' kW-DC · ' + s.kwAc + ' kW-AC',
      Math.round(s.acKwh).toLocaleString() + ' kWh year 1 · ' + Math.round(s.specificYield) + ' kWh/kW',
      'P50 ' + Math.round(s.p50).toLocaleString() + ' kWh · P90 ' + Math.round(s.p90).toLocaleString() + ' kWh',
      price
    ];
    if (assumed) lines.push('An obstruction had no height. Shade used 15 ft.');
    $('solar-summary').textContent = lines.join('\n');
    $('solar-lead').textContent = 'Year 1 is on the drawing. The detail is the same report.';
    $('solar-body').textContent = rep.text || '';
    $('solar-detail').hidden = false;
    $('solar-run').textContent = 'Run again';
    if (ctx.setMeta) {
      ctx.setMeta({
        solarDesign: {
          version: rep.version,
          kwDc: s.kwDc,
          kwAc: s.kwAc,
          acKwh: s.acKwh,
          specificYield: s.specificYield,
          p50: s.p50,
          p90: s.p90,
          perWdc: rep.pricing ? rep.pricing.perWdc : null,
          at: new Date().toISOString()
        }
      });
    }
    if (ctx.setStatus) ctx.setStatus(s.kwDc + ' kW-DC · ' + Math.round(s.specificYield) + ' kWh/kW · P90 ' + Math.round(s.p90).toLocaleString() + ' kWh.');
  }

  function attach(ctx) {
    if (typeof document === 'undefined') return;
    var menu = (ctx && ctx.menu) || $('outputs-menu');
    if (!menu || menu.querySelector('[data-solar-report]')) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('role', 'menuitem');
    btn.setAttribute('data-solar-report', '1');
    btn.textContent = 'Solar design report';
    var bom = menu.querySelector('[data-output="bom"]');
    if (bom && bom.nextSibling) menu.insertBefore(btn, bom.nextSibling);
    else menu.appendChild(btn);
    btn.addEventListener('click', function () {
      var outputs = $('outputs-menu');
      if (outputs) outputs.hidden = true;
      var opener = $('btn-outputs');
      if (opener) opener.setAttribute('aria-expanded', 'false');
      show(ctx);
    });
    ensureDialog();
  }

  root.OmegaEditorV2Solar = { attach: attach, payload: payload, VERSION: 'editor-v2-solar/1' };
})(typeof window !== 'undefined' ? window : global);
