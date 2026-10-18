/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * omega-prime-v2-page.js — the screen for /omega-prime-v2.
 *
 * Draws what the shared modules already decided. Grid layers come from
 * omega-grid-layers.js. The circuit verdict is omega-grid-verdict.js.
 * ComEd at the parcel is omega-comed-layers.js. Any other open layer is
 * POST /api/hosting-capacity. The pad is POST /api/prime-fit. The price is
 * POST /api/price-site. The project is omega-prime-v2.js, which calls the
 * live project writer, the editor-v2 assignment, and the CRM foundation.
 *
 * No service worker. The installed Prime app stays on /omega-prime.
 * ES5.
 */
(function () {
  'use strict';
  var V = window.OmegaPrimeV2;
  var PP = window.OmegaPrimeProject;
  var GL = window.OmegaGridLayers;
  var GV = window.OmegaGridVerdict;
  var LAY = window.OmegaComEdLayers;
  if (!V || !PP || !GL) return;

  var $ = function (s) { return document.querySelector(s); };
  var S = V.empty();
  var UNIT = PP.XXL;
  var UNITS = [UNIT];
  var reqLog = [];
  S.area = null; S.unitAt = null; S.poi = null; S.fit = null; S.saveErr = ''; S.circuit = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function fmt(n) { return Math.round(n).toLocaleString('en-US'); }
  function money(n) { return '$' + fmt(n); }
  function nowIso() { return new Date().toISOString(); }
  function toast(m) {
    var t = $('#toast');
    t.textContent = m;
    t.classList.add('on');
    clearTimeout(toast.h);
    toast.h = setTimeout(function () { t.classList.remove('on'); }, 2800);
  }
  function token() {
    try {
      var u = firebase.auth().currentUser;
      return u ? u.getIdToken() : Promise.resolve(null);
    } catch (e) { return Promise.resolve(null); }
  }

  function paintCustomer() {
    var label = 'No customer yet';
    var A = window.OmegaEditorV2Assign;
    if (S.assignment && S.assignment.customerName) {
      try { label = A ? A.summary(S.assignment).label : S.assignment.customerName; }
      catch (e) { label = S.assignment.customerName; }
    }
    $('#customer-label').textContent = label;
    if ($('#customer') && document.activeElement !== $('#customer')) $('#customer').value = S.assignment ? S.assignment.customerName : ($('#customer').value || '');
  }
  function readCustomer() {
    var name = ($('#customer') && $('#customer').value || '').trim();
    if (!name) { S.assignment = null; S.customerIdSource = ''; paintCustomer(); paintReady(); return null; }
    var keep = S.customerIdSource === 'crm' && S.assignment ? S.assignment.customerId : '';
    try {
      var held = V.attachCustomer(S, { customerName: name, customerId: keep, contactEmail: ($('#cust-email') && $('#cust-email').value) || '' });
      S.assignment = held.assignment;
      S.customerIdSource = held.customerIdSource;
      $('#cust-error').textContent = '';
      paintCustomer();
      paintReady();
      return held;
    } catch (e) {
      $('#cust-error').textContent = e.message;
      return null;
    }
  }

  function paintReady() {
    var r = V.readiness(S), i, h = '';
    $('#ready-score').textContent = String(r.score);
    $('#ready-btn').setAttribute('aria-valuenow', String(r.score));
    for (i = 0; i < r.items.length; i++) {
      h += '<li class="' + (r.items[i].on ? 'on' : '') + '"><b>' + r.items[i].points + '</b> ' + esc(r.items[i].label) + '</li>';
    }
    $('#ready-list').innerHTML = h;
    $('#ready-sum').textContent = r.label + ' from sourced figures. A study still counts. A missing bill does not.';
  }
  function paintSteps() {
    var nav = $('#steps'), i, b, s;
    nav.innerHTML = '';
    for (i = 0; i < V.STEPS.length; i++) {
      s = V.STEPS[i];
      b = document.createElement('button');
      b.type = 'button';
      b.textContent = (i + 1) + ' ' + s.label;
      b.setAttribute('data-step', s.id);
      if (S.step === s.id) b.className = 'on';
      else if (S.seen[s.id]) b.className = 'seen';
      else b.className = 'lock';
      b.disabled = !V.canOpen(S, s.id);
      b.onclick = (function (id) { return function () { show(id); }; })(s.id);
      nav.appendChild(b);
    }
    var n = V.stepIndex(S.step) + 1;
    $('#step-count').textContent = 'Step ' + n + ' of ' + V.STEPS.length;
    var act = V.nextAction(S.step, S);
    $('#next').textContent = act.label;
    $('#next').setAttribute('data-go', act.go);
  }
  function show(id) {
    if (!V.canOpen(S, id)) { toast('Follow the path. The next step opens from the button below.'); return; }
    S.step = id;
    S.seen[id] = true;
    [].forEach.call(document.querySelectorAll('.screen'), function (el) {
      el.classList.toggle('on', el.id === 's-' + id);
    });
    paintSteps();
    paintReady();
    setTimeout(function () { [gaMap, sfMap, edMap].forEach(function (m) { if (m) m.invalidateSize(); }); }, 40);
  }

  function drawUnits() {
    var sel = $('#unitSel');
    sel.innerHTML = '';
    UNITS.forEach(function (u, i) {
      var o = document.createElement('option');
      o.value = String(i);
      o.textContent = u.name + ' — ' + u.note;
      if (u === UNIT) o.selected = true;
      sel.appendChild(o);
    });
    $('#unitCard').innerHTML = '<b>' + esc(UNIT.name) + '</b>' + esc(UNIT.note)
      + (UNIT.lFt ? '' : '<div class="flag">No footprint on file. The pad check will say so.</div>');
    $('#unitSel2').textContent = UNIT.short + ' · ' + fmt(UNIT.kw) + ' kW';
  }
  function loadUnits() {
    var B = window.OmegaBessProducts;
    if (!B || !B.load) { drawUnits(); return; }
    B.load().then(function (t) { UNITS = PP.units(t); UNIT = UNITS[0]; drawUnits(); }, function () { drawUnits(); });
  }
  $('#unitSel').onchange = function () {
    if (this.disabled) return;
    UNIT = UNITS[+this.value] || PP.XXL;
    S.verdict = null; S.grid = null;
    drawUnits();
  };

  /* ── release hook ─────────────────────────────────────────────────── */
  (function () {
    var path = V.experienceRoute(window);
    var note = $('#banner-note');
    if (path === V.EXPERIENCE.on) note.textContent = 'The omega-experience switch is on. This is the Prime route. Live Prime stays at /omega-prime.';
    else if (path === V.EXPERIENCE.off) note.textContent = 'The omega-experience switch is off. Launchers send people to live Prime. This preview stays up.';
    else note.textContent = 'Preview. Live Prime at /omega-prime is unchanged. The shared switch omega-experience is not published yet; this page will follow OmegaExperience.route("prime") when it is.';
  })();

  function getJSON(url, cb) {
    var x = new XMLHttpRequest();
    x.open('GET', url);
    x.onreadystatechange = function () {
      if (x.readyState !== 4) return;
      var j = null;
      try { j = JSON.parse(x.responseText); } catch (e) {}
      cb(x.status >= 200 && x.status < 300 && j && !j.error ? null : new Error('no layer'), j);
    };
    x.onerror = function () { cb(new Error('no layer'), null); };
    x.send();
  }
  function geocode(q, cb) {
    getJSON('https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=' + encodeURIComponent(q) + '&benchmark=Public_AR_Current&format=json', function (e, j) {
      var m = j && j.result && j.result.addressMatches && j.result.addressMatches[0];
      if (m && m.coordinates) { cb({ lat: m.coordinates.y, lng: m.coordinates.x, label: m.matchedAddress, src: 'U.S. Census geocoder' }); return; }
      getJSON('https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=' + encodeURIComponent(q), function (e2, a) {
        if (a && a[0]) cb({ lat: +a[0].lat, lng: +a[0].lon, label: a[0].display_name, src: 'OpenStreetMap' });
        else cb(null);
      });
    });
  }

  (function () {
    var q = (location.search.match(/[?&](?:q|addr|address)=([^&#]*)/) || [])[1];
    if (q) { try { $('#addr').value = decodeURIComponent(q.replace(/\+/g, ' ')); } catch (e2) {} }
    var c = (location.search.match(/[?&]customer=([^&#]*)/) || [])[1];
    if (c) { try { $('#customer').value = decodeURIComponent(c.replace(/\+/g, ' ')); } catch (e3) {} }
  })();
  $('#addr').onkeydown = function (e) { if (e.key === 'Enter') $('#go').click(); };
  $('#customer').onchange = readCustomer;
  $('#go').onclick = function () {
    var q = $('#addr').value.trim(), b = this, er = $('#startErr');
    readCustomer();
    if (!q) { er.hidden = false; er.textContent = 'Type the site address first.'; return; }
    er.hidden = true;
    b.textContent = 'Finding the site…';
    b.disabled = true;
    geocode(q, function (hit) {
      b.textContent = 'Look at the grid';
      b.disabled = false;
      if (!hit) { er.hidden = false; er.textContent = 'That address did not resolve. Add the city, state and ZIP and try again.'; return; }
      S.addr = q; S.lat = hit.lat; S.lng = hit.lng; S.geoSrc = hit.src; S.geoLabel = hit.label || q; S.geoAt = nowIso();
      S.state = V.stateOf(hit.label || q) || V.stateOf(q);
      $('#unitSel').disabled = true;
      $('#project-name').value = q;
      $('#gaAddr').textContent = hit.label || q;
      show('atlas');
      openAtlas();
    });
  };

  /* ── Grid Atlas ───────────────────────────────────────────────────── */
  var gaMap = null, gaBase = {}, gaSubs = null, gaTx = null, subRows = [], txRows = [];
  function tiles(kind) {
    var spec = GL.basemap(kind);
    var layers = spec.tiles.map(function (t) {
      return L.tileLayer(t.url, { maxZoom: t.maxZoom, maxNativeZoom: t.maxNativeZoom, attribution: t.attribution });
    });
    return layers.length === 1 ? layers[0] : L.layerGroup(layers);
  }
  function siteIcon() {
    return L.divIcon({ className: '', html: '<div class="site-dot"></div>', iconSize: [16, 16], iconAnchor: [8, 8] });
  }
  function paintSubCard(s, nearest) {
    var kv = s.kv ? (s.kv + (s.minkv && s.minkv !== s.kv ? ' / ' + s.minkv : '') + ' kV') : 'not published';
    var asked = S.subAt ? S.subAt.slice(0, 10) : '';
    $('#gaInsp').innerHTML = '<h5>' + esc(s.name) + '</h5><div class="sub">'
      + (nearest ? 'Nearest substation' : 'Substation') + (s.owner ? ' · ' + esc(s.owner) : '') + '</div>'
      + '<dl class="kv"><dt>Voltage</dt><dd>' + esc(kv) + '</dd><dt>Distance</dt><dd>' + s.mi.toFixed(2) + ' mi</dd>'
      + '<dt>Lines in</dt><dd>' + (s.lines == null ? '—' : esc(s.lines)) + '</dd><dt>Status</dt><dd>' + esc(s.status || '—') + '</dd></dl>'
      + '<span class="chip">' + s.mi.toFixed(1) + ' mi · ' + esc(kv) + '</span>'
      + '<p class="src">Source: ' + esc(s.source) + '. Layer list verified ' + esc(s.registryVerified) + '. This view queried ' + esc(asked) + '.</p>'
      + '<p class="src" id="gaScore"></p>'
      + '<button type="button" class="btn primary" id="ga-go">Check the circuit</button>';
    $('#gaInsp').classList.add('on');
    $('#ga-go').onclick = function () { show('circuit'); openCircuit(); };
    paintAtlasScore();
  }
  function paintAtlasScore() {
    var el = $('#gaScore');
    if (!el) return;
    var j = S.atlasService;
    if (!j) { el.textContent = ''; return; }
    var sum = window.OmegaGridAtlas && OmegaGridAtlas.summarise ? OmegaGridAtlas.summarise(j) : null;
    var score = sum && sum.score != null ? sum.score : j.score;
    el.textContent = score == null ? '' : ('Grid Atlas score ' + score + ' from /api/grid-atlas, queried ' + (S.atlasServiceAt || '').slice(0, 10)
      + (sum && sum.nearestSubName ? '. Service nearest: ' + sum.nearestSubName + '.' : '.'));
  }
  function drawSubs() {
    gaSubs.clearLayers();
    subRows.forEach(function (s, k) {
      var m = L.marker([s.lat, s.lng], { icon: L.divIcon({ className: '', html: '<div class="subicon' + (k === 0 ? ' near' : '') + '"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }) });
      m.bindTooltip(esc(s.name), { permanent: k < 3, direction: 'right', className: 'lbl', offset: [10, 0] });
      m.on('click', function () { openSub(s, k === 0); });
      gaSubs.addLayer(m);
    });
    if ($('#ly-sub').classList.contains('on')) gaSubs.addTo(gaMap);
  }
  function drawTx() {
    gaTx.clearLayers();
    txRows.forEach(function (f) {
      f.paths.forEach(function (p) { gaTx.addLayer(L.polyline(p, { color: '#e0533d', weight: 2.5, opacity: 0.9 })); });
    });
    if ($('#ly-tx').classList.contains('on')) gaTx.addTo(gaMap);
  }
  function openSub(s, nearest) {
    if (openSub.line) gaMap.removeLayer(openSub.line);
    openSub.line = L.polyline([[S.lat, S.lng], [s.lat, s.lng]], { color: '#8A5A00', weight: 1.5, dashArray: '4 4' }).addTo(gaMap);
    paintSubCard(s, nearest);
    paintReady();
  }
  function openAtlas() {
    if (!gaMap) {
      gaMap = L.map('gaMap', { zoomControl: true }).setView([S.lat, S.lng], 14);
      gaSubs = L.layerGroup();
      gaTx = L.layerGroup();
      gaBase.dark = tiles('dark').addTo(gaMap);
      gaBase.satellite = tiles('satellite');
    } else gaMap.setView([S.lat, S.lng], 14);
    L.marker([S.lat, S.lng], { icon: siteIcon() }).addTo(gaMap);
    $('#gaStat').textContent = 'Loading substations and transmission…';
    S.subAt = nowIso();
    var subsP = firstLayer('substations').then(function (j) {
      subRows = GL.substationsOf(j, GL.SUBSTATIONS);
      V.nearest(subRows, S.lat, S.lng);
      subRows.sort(function (a, b) { return a.mi - b.mi; });
      S.sub = subRows[0] || null;
      $('#cSub').textContent = String(subRows.length);
      drawSubs();
      if (S.sub) {
        openSub(S.sub, true);
        gaMap.fitBounds(L.latLngBounds([[S.lat, S.lng], [S.sub.lat, S.sub.lng]]).pad(0.6));
      }
    });
    var txP = firstLayer('transmission').then(function (j) {
      txRows = GL.transmissionOf(j);
      $('#cTx').textContent = String(txRows.length);
      S.txCount = txRows.length;
      drawTx();
    });
    Promise.all([subsP, txP]).then(function () {
      $('#gaStat').textContent = subRows.length
        ? (subRows.length + ' substations in view. Transmission lines: ' + txRows.length + '.')
        : 'The public substation services did not answer. Try again in a minute.';
      paintReady();
    });
    if (window.OmegaGridAtlas && OmegaGridAtlas.run) {
      OmegaGridAtlas.run({ lat: S.lat, lng: S.lng, address: S.addr }).then(function (j) {
        S.atlasService = j;
        S.atlasServiceAt = nowIso();
        paintAtlasScore();
      }, function () {});
    }
  }
  function firstLayer(id) {
    var urls = GL.queryUrls(id, S.lat, S.lng, 0.12);
    function next(i) {
      if (i >= urls.length) return Promise.resolve(null);
      return new Promise(function (resolve) {
        getJSON(urls[i], function (err, j) { resolve(err || !j || !j.features ? null : j); });
      }).then(function (j) { return j || next(i + 1); });
    }
    return next(0);
  }
  $('#ly-sub').onclick = function () {
    var on = !this.classList.contains('on');
    this.classList.toggle('on', on);
    this.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (!gaMap) return;
    if (on) gaSubs.addTo(gaMap); else gaMap.removeLayer(gaSubs);
  };
  $('#ly-tx').onclick = function () {
    var on = !this.classList.contains('on');
    this.classList.toggle('on', on);
    this.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (!gaMap) return;
    if (on) gaTx.addTo(gaMap); else gaMap.removeLayer(gaTx);
  };
  [].forEach.call(document.querySelectorAll('.bms button'), function (b) {
    b.onclick = function () {
      [].forEach.call(document.querySelectorAll('.bms button'), function (x) { x.classList.toggle('on', x === b); });
      var kind = b.getAttribute('data-bm');
      gaMap.removeLayer(gaBase.dark); gaMap.removeLayer(gaBase.satellite);
      gaBase[kind].addTo(gaMap);
      if (kind === 'satellite') gaMap.setView([S.lat, S.lng], 17);
    };
  });
  $('#atlas-retry').onclick = function () { if (S.lat != null) openAtlas(); };

  /* ── Circuit ──────────────────────────────────────────────────────── */
  var sfMap = null;
  var VCLASS = { fits: 'ok', smaller: 'warn', study: 'bad', unsized: 'warn' };
  function territory() { try { return LAY && LAY.territoryAt ? LAY.territoryAt(S.lat, S.lng) : null; } catch (e) { return null; } }
  function openCircuit() {
    if (!sfMap) { sfMap = L.map('sfMap').setView([S.lat, S.lng], 17); tiles('satellite').addTo(sfMap); }
    else sfMap.setView([S.lat, S.lng], 17);
    L.marker([S.lat, S.lng], { icon: siteIcon() }).addTo(sfMap);
    if (S.verdict) { renderCircuit(); return; }
    var t = territory();
    if (t && t.hasMap && LAY && LAY.probePoint) { probeComed(t); return; }
    openHosting(t);
  }
  function probeComed(t) {
    var t0 = Date.now();
    $('#sfRes').innerHTML = '<div class="hd"><h5>Resolving the circuit…</h5><small>Asking ComEd at the parcel</small></div>';
    LAY.probePoint(S.lat, S.lng, function (err, res) {
      reqLog.push((err ? 'ERR ' : 'OK  ') + 'probePoint ' + (Date.now() - t0) + ' ms' + (res && res.layerId != null ? ' layer ' + res.layerId : ''));
      if (err || !res || !res.rows || !res.rows.length) {
        circuitFail(err ? ('ComEd did not answer (' + (err.message || err) + '). Try again in a minute.') : 'ComEd publishes no hosting-capacity circuit at this point.');
        return;
      }
      S.probe = res;
      S.circuitUtility = 'comed';
      S.hosting = null;
      judge({ unit: { kw: UNIT.kw, kwh: UNIT.kwh, name: UNIT.name },
        substation: S.sub ? { name: S.sub.name, kv: S.sub.kv, km: S.sub.mi * 1.609344 } : null,
        circuit: GV.circuitBody(res, 0, t.name || 'ComEd') });
    });
  }
  function openHosting(t) {
    if (!S.state) { circuitFail('No ZIP on the address, so the state could not be read. Add the ZIP on the site step. ComEd is the only parcel map.'); return; }
    $('#sfRes').innerHTML = '<div class="hd"><h5>Resolving the circuit…</h5><small>' + esc(S.state) + '</small></div>';
    token().then(function (tok) {
      if (!tok) throw new Error('Sign in to read hosting capacity.');
      return fetch('/api/hosting-capacity', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok },
        body: JSON.stringify({ lat: S.lat, lng: S.lng, state: S.state }) });
    }).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j && j.error || ('Hosting answered ' + r.status)); return j; }); })
      .then(function (j) {
        if (!j.covered || j.empty || !j.circuit) {
          circuitFail(j.say || ('No open hosting layer for ' + S.state + '. ComEd is read at the parcel; other states stay on the utility.'));
          return;
        }
        S.hosting = j;
        S.probe = null;
        S.circuitUtility = 'hosting';
        judge({ unit: { kw: UNIT.kw, kwh: UNIT.kwh, name: UNIT.name },
          substation: S.sub ? { name: S.sub.name, kv: S.sub.kv, km: S.sub.mi * 1.609344 } : null,
          circuit: j.circuit });
      }, function (e) { circuitFail(e.message || String(e)); });
  }
  function judge(body) {
    if (!GV) { circuitFail('The grid verdict client did not load. Reload the page.'); return; }
    $('#sfRes').innerHTML = '<div class="hd"><h5>Judging the circuit…</h5><small>Room against ' + esc(UNIT.short) + '</small></div>';
    GV.ask(body).then(function (a) {
      var fields = GV.fields(a, S.probe, 0);
      S.verdict = a;
      if (fields && fields.verdict) S.verdict.verdict.at = fields.verdict.at;
      S.grid = V.gridRecord(S.lat, S.lng, fields);
      renderCircuit();
      saveSoon();
    }, function (e) { circuitFail(e.message || String(e)); });
  }
  function circuitFail(msg) {
    $('#sfRes').innerHTML = '<div class="hd"><h5>No circuit answer</h5><small>' + esc(S.addr) + '</small></div><div class="bd"><div class="verdict warn">' + esc(msg) + '</div>'
      + '<button type="button" class="btn primary" id="sf-tomap">Next: the site’s load</button></div>';
    $('#sf-tomap').onclick = function () { show('load'); openLoad(); };
  }
  function renderCircuit() {
    var a = S.verdict, c = a.circuit || {}, net = c.netKw;
    var line = S.circuitUtility === 'hosting' ? V.hostingSourceLine(S.hosting, a) : V.circuitSourceLine(a, S.probe);
    S.circuit = { feeder: c.id || '(unnamed)', sub: c.substation || '', netKw: net };
    $('#utilPill').textContent = S.circuitUtility === 'hosting' ? ((S.hosting && S.hosting.utility) || 'Hosting') : 'ComEd · hosting capacity';
    $('#sfRes').innerHTML = '<div class="hd"><h5>Circuit ' + esc(c.id || '(unnamed)') + '</h5><small>'
      + (c.substation ? 'Substation ' + esc(c.substation) + ' · ' : '')
      + (c.addressResolved ? 'resolved at the parcel' : 'best circuit in the block') + '</small></div><div class="bd">'
      + '<div class="big"><div><span>Net hosting</span><b>' + (net == null ? '—' : fmt(net) + ' kW') + '</b></div>'
      + '<div><span>' + esc(UNIT.short) + '</span><b>' + fmt(UNIT.kw) + ' kW</b></div></div>'
      + '<dl class="lkv"><dt>Published</dt><dd>' + (c.publishedKw == null ? '—' : fmt(c.publishedKw) + ' kW') + '</dd>'
      + '<dt>Queued DER</dt><dd>− ' + fmt(c.queuedKw || 0) + ' kW</dd>'
      + '<dt class="tot">Room left</dt><dd class="tot">' + (net == null ? '—' : fmt(net) + ' kW') + '</dd>'
      + (c.headroomKw != null ? '<dt>Headroom after the unit</dt><dd>' + (c.headroomKw >= 0 ? '' : '− ') + fmt(Math.abs(c.headroomKw)) + ' kW</dd>' : '')
      + '</dl>'
      + '<div class="verdict ' + (VCLASS[a.verdict.key] || 'warn') + '"><b>' + esc(a.verdict.label) + '.</b> ' + esc(a.verdict.say) + '</div>'
      + '<p class="src">' + esc(line) + '</p>'
      + '<button type="button" class="btn primary" id="sf-tomap">Next: the site’s load</button></div>';
    $('#sf-tomap').onclick = function () { show('load'); openLoad(); };
    paintReady();
  }
  $('#sf-log').onclick = function () { toast(reqLog.length ? reqLog[reqLog.length - 1] : 'No request made yet.'); };

  /* ── Load ─────────────────────────────────────────────────────────── */
  function openLoad() {
    if (S.rates || S.ratesErr) { drawLoad(); return; }
    var zip = PP.zipOf(S.geoLabel) || PP.zipOf(S.addr);
    token().then(function (t) {
      if (!t) throw new Error('Sign in to read the utility’s rates.');
      if (!zip) throw new Error('No ZIP code in the address, so the utility could not be read. Add the ZIP on the first step.');
      return fetch('/api/utility-rates?zip=' + encodeURIComponent(zip), { headers: { Authorization: 'Bearer ' + t } })
        .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j && j.error || ('Rates answered ' + r.status)); return j; }); });
    }).then(function (j) { S.rates = j; S.zip = zip; S.ratesAt = nowIso(); drawLoad(); }, function (e) { S.ratesErr = e.message; drawLoad(); });
  }
  function peaksChanged() {
    var pk = PP.peaks($('#ld-peaks').value), r = S.rates, peak, sum = 0;
    if (!pk.length) {
      S.load = r ? V.loadRecord(r, S.zip, [], S.ratesAt || nowIso()) : null;
      $('#ldOut').textContent = 'No peaks entered. The project can still be designed. Readiness stays short of the bill.';
      paintReady();
      saveSoon();
      return;
    }
    peak = Math.max.apply(null, pk);
    pk.forEach(function (k) { sum += k; });
    S.load = V.loadRecord(r || {}, S.zip, pk, S.ratesAt || nowIso());
    $('#ldOut').innerHTML = '<b>' + pk.length + ' of 12 months</b> entered · peak ' + fmt(peak) + ' kW'
      + (r ? ' · demand charges on these months about <b>' + money(sum * r.demandRate) + '</b> at $' + (+r.demandRate).toFixed(2) + '/kW' : '')
      + '.<br>The ' + esc(UNIT.short) + ' is ' + fmt(UNIT.kw) + ' kW, ' + Math.round(UNIT.kw / peak * 100) + '% of that peak.'
      + '<span class="src">Source: ' + esc(S.load.source) + ' Read ' + esc((S.load.at || '').slice(0, 10)) + '. The rate book publishes no tariff effective date.</span>';
    paintReady();
    saveSoon();
  }
  function drawLoad() {
    var r = S.rates;
    $('#ldUtil').textContent = r ? r.name : 'Utility not read';
    $('#ldRates').innerHTML = r
      ? '<table class="spec"><tr><td>Utility</td><td>' + esc(r.name) + (S.zip ? ' · ZIP ' + esc(S.zip) : '') + '</td></tr>'
        + '<tr><td>Demand charge</td><td>$' + (+r.demandRate).toFixed(2) + ' per kW-month</td></tr>'
        + '<tr><td>Energy</td><td>$' + (+r.energyRate).toFixed(4) + ' per kWh</td></tr></table>'
        + '<p class="src">Source: OMEGA rate book, planning grade, not a tariff quote. Read ' + esc((S.ratesAt || '').slice(0, 10)) + '. No effective date is on the rate record. The bill decides.</p>'
      : '<div class="verdict warn">' + esc(S.ratesErr || 'The utility’s rates could not be read.') + '</div>';
    peaksChanged();
  }
  $('#ld-peaks').oninput = peaksChanged;

  /* ── Project ──────────────────────────────────────────────────────── */
  function who() {
    var u = null;
    try { u = firebase.auth().currentUser; } catch (e) {}
    if (!u) return Promise.resolve(null);
    return u.getIdTokenResult().then(function (r) {
      var claim = r && r.claims && r.claims.orgId;
      var B = window.OmegaBessProducts;
      return { uid: u.uid, email: u.email || '', name: u.displayName || String(u.email || '').split('@')[0],
        orgId: claim ? String(claim) : (B && B.orgOf ? B.orgOf(u.email) : '') };
    });
  }
  function docState() {
    var b = S.area && S.area.b;
    return {
      addr: S.addr, lat: S.lat, lng: S.lng, geoSrc: S.geoSrc, unit: UNIT,
      grid: S.grid || null, load: S.load || null,
      assignment: S.assignment, customerIdSource: S.customerIdSource, projectId: S.projectId,
      area: b ? { s: b.getSouth(), w: b.getWest(), n: b.getNorth(), e: b.getEast(), wFt: S.area.wFt, hFt: S.area.hFt, sqft: S.area.sqft } : null,
      unitAt: S.unitAt || null, poi: S.poi || null, conduitFt: S.conduitFt || null
    };
  }
  function editorHref() {
    return S.projectId ? '/editor.html?id=' + encodeURIComponent(S.projectId) + '&from=prime' : '/editor?addr=' + encodeURIComponent(S.addr || '');
  }
  var making = null;
  function ensureProject() {
    if (S.projectId) return Promise.resolve(S.projectId);
    if (making) return making;
    if (!readCustomer()) return Promise.reject(new Error('Name the customer before this project is saved.'));
    making = who().then(function (w) {
      if (!w || !w.orgId) throw new Error('Sign in to save this site as a project.');
      S.projectId = V.projectId();
      var doc = V.projectDoc(docState(), w, firebase.firestore.FieldValue.serverTimestamp());
      return firebase.firestore().collection('projects').doc(S.projectId).set(doc).then(function () {
        S.saveErr = '';
        try { if (window.OmegaEvents) OmegaEvents.emit('project.created', { projectId: S.projectId, vertical: 'bess', source: 'omega-prime-v2' }); } catch (e) {}
        return S.projectId;
      });
    })['catch'](function (e) { making = null; S.projectId = ''; S.saveErr = (e && e.message) || String(e); throw e; });
    return making;
  }
  var saveTimer = null;
  function saveSoon() {
    if (!S.projectId) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      var r = S.run;
      var patch = { 'prime.layout': PP.layout(docState()), updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
      if (S.grid) patch.grid = S.grid;
      if (S.load) patch.load = S.load;
      if (S.assignment) {
        patch.assignment = S.assignment;
        patch.client = S.assignment.customerName || '';
      }
      if (r && r.total) patch['prime.run'] = { totalUsd: r.total.base, loUsd: r.total.lo, hiUsd: r.total.hi, pricedBy: r.pricedBy || 'api/price-site', at: S.runAt || nowIso() };
      firebase.firestore().collection('projects').doc(S.projectId).update(patch).then(function () { S.saveErr = ''; paintSave(); },
        function (e) { S.saveErr = 'The project did not update: ' + ((e && e.message) || e); paintSave(); });
    }, 600);
  }
  function paintSave() {
    var el = $('#save-state');
    if (S.saveErr) { el.textContent = 'Not saved'; el.className = 'is-err'; }
    else if (S.projectId) { el.textContent = 'Saved'; el.className = 'is-ok'; }
    else { el.textContent = 'Not saved'; el.className = ''; }
  }
  function toMap() {
    var act = V.nextAction('load', S);
    if (act.needsCustomer && !readCustomer()) { $('#cust-dialog').showModal(); $('#cust-name').focus(); return; }
    var b = $('#ld-go');
    b.disabled = true;
    b.textContent = 'Setting up the project…';
    ensureProject().then(function () { $('#ldSave').textContent = ''; }, function (e) { $('#ldSave').textContent = e.message; })
      .then(function () { b.disabled = false; b.textContent = 'Design it'; show('map'); openMap(); paintSave(); });
  }
  $('#ld-go').onclick = toMap;

  /* ── Site map ─────────────────────────────────────────────────────── */
  var edMap = null, mode = null, L_area = null, L_unit = null, L_poi = null, L_cond = null, drag = null, eq = null;
  function openMap() {
    if (!edMap) {
      edMap = L.map('edMap', { maxZoom: 21 }).setView([S.lat, S.lng], 19);
      tiles('satellite').addTo(edMap);
      L_unit = L.layerGroup().addTo(edMap);
      L.control.scale({ imperial: true, metric: false }).addTo(edMap);
      edMap.on('mousedown', onDown);
      edMap.on('mousemove', onMove);
      edMap.on('mouseup', onUp);
      edMap.on('click', onClick);
    }
    side();
  }
  function arm(m, btn) {
    mode = m;
    [].forEach.call(document.querySelectorAll('.rb.armed'), function (b) { b.classList.remove('armed'); });
    if (btn) btn.classList.add('armed');
    if (edMap) {
      edMap.getContainer().style.cursor = m ? 'crosshair' : '';
      if (m === 'area') edMap.dragging.disable(); else edMap.dragging.enable();
    }
  }
  function onDown(e) {
    if (mode !== 'area') return;
    drag = e.latlng;
    L_unit.clearLayers();
    S.placed = false; S.run = null; S.fit = null;
    if (L_area) edMap.removeLayer(L_area);
    L_area = L.rectangle([drag, drag], { color: '#8A5A00', weight: 2, dashArray: '6 4', fillOpacity: 0.12 }).addTo(edMap);
  }
  function onMove(e) { if (mode === 'area' && drag && L_area) L_area.setBounds([drag, e.latlng]); }
  function onUp(e) {
    if (mode !== 'area' || !drag) return;
    var b = L.latLngBounds(drag, e.latlng);
    drag = null;
    var w = V.miles([b.getSouth(), b.getWest()], [b.getSouth(), b.getEast()]) * 5280;
    var h = V.miles([b.getSouth(), b.getWest()], [b.getNorth(), b.getWest()]) * 5280;
    token().then(function (t) {
      if (!t) throw new Error('Sign in to check the pad.');
      return fetch('/api/prime-fit', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t },
        body: JSON.stringify({ unit: { lFt: UNIT.lFt, wFt: UNIT.wFt, key: UNIT.key }, area: { wFt: w, hFt: h } }) });
    }).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j && j.error || 'The pad check did not answer'); return j; }); })
      .then(function (j) {
        if (!j.ok) {
          toast(j.say || 'That pad is too small.');
          if (L_area) edMap.removeLayer(L_area);
          L_area = null;
          return;
        }
        S.fit = j;
        S.area = { b: b, wFt: w, hFt: h, sqft: w * h };
        L.tooltip({ permanent: true, direction: 'top', className: 'lbl', offset: [0, -4] })
          .setLatLng([b.getNorth(), b.getCenter().lng])
          .setContent('BESS area · ' + fmt(w) + ' × ' + fmt(h) + ' ft').addTo(L_unit);
        edMap.fitBounds(b.pad(0.25), { maxZoom: 21 });
        arm(null);
        $('#ed-area').classList.add('done');
        $('#ed-place').classList.remove('dis');
        $('#ed-place').disabled = false;
        side();
        saveSoon();
      }, function (err) {
        toast(err.message || 'The pad check did not answer.');
        if (L_area) edMap.removeLayer(L_area);
        L_area = null;
      });
  }
  function ftToDeg(lat, ft) {
    var m = ft * 0.3048;
    return { dLat: m / 111320, dLng: m / (111320 * Math.cos(lat * Math.PI / 180)) };
  }
  function box(lat, lng, wFt, hFt) {
    var d = ftToDeg(lat, 1);
    return [[lat - hFt / 2 * d.dLat, lng - wFt / 2 * d.dLng], [lat + hFt / 2 * d.dLat, lng + wFt / 2 * d.dLng]];
  }
  function onClick(e) {
    if (mode === 'place') {
      if (!S.area || !S.area.b.contains(e.latlng)) { toast('Click inside the BESS area.'); return; }
      if (!S.fit || !S.fit.place) { toast('The pad check has not come back yet.'); return; }
      L_unit.eachLayer(function (l) { if (!(l instanceof L.Tooltip)) L_unit.removeLayer(l); });
      var c = e.latlng, d = ftToDeg(c.lat, 1), place = S.fit.place;
      var lF = S.fit.containerLongFt, wF = S.fit.containerShortFt;
      S.unitAt = { lat: c.lat, lng: c.lng };
      if (S.fit.footprintKnown) {
        var unit = box(c.lat, c.lng, lF, wF);
        L.rectangle(unit, { color: '#1F4E79', weight: 2, fillColor: '#F6F5F2', fillOpacity: 0.95 }).addTo(L_unit)
          .bindTooltip(esc(UNIT.short) + ' · ' + Math.round(lF) + '×' + Math.round(wF) + ' ft', { permanent: true, direction: 'bottom', className: 'lbl' });
      } else {
        L.circleMarker(c, { radius: 8, color: '#1F4E79', weight: 2, fillColor: '#F6F5F2', fillOpacity: 0.95 }).addTo(L_unit)
          .bindTooltip(esc(UNIT.short) + ' · footprint not on file', { permanent: true, direction: 'bottom', className: 'lbl' });
      }
      var xLng = c.lng + place.xfmrOffsetFt * d.dLng;
      var dLng2 = c.lng + place.discoOffsetFt * d.dLng;
      L.rectangle(box(c.lat, xLng, place.xfmrFt, place.xfmrFt), { color: '#1F4E79', weight: 2, fillColor: '#E6EEF7', fillOpacity: 0.95 }).addTo(L_unit)
        .bindTooltip('XFMR', { permanent: true, direction: 'top', className: 'lbl' });
      L.rectangle(box(c.lat, dLng2, place.discoLongFt, place.discoShortFt), { color: '#1F4E79', weight: 2, fillColor: '#fff', fillOpacity: 0.95 }).addTo(L_unit)
        .bindTooltip('DISC', { permanent: true, direction: 'bottom', className: 'lbl' });
      eq = { disco: L.latLng(c.lat, dLng2) };
      S.placed = true;
      arm(null);
      $('#ed-place').classList.add('done');
      $('#ed-poi').disabled = false;
      $('#ed-poi').classList.remove('dis');
      if (L_cond) { edMap.removeLayer(L_cond); L_cond = null; S.conduitFt = null; S.run = null; }
      side();
      paintReady();
      saveSoon();
      return;
    }
    if (mode === 'poi') {
      if (L_poi) edMap.removeLayer(L_poi);
      L_poi = L.marker(e.latlng, { icon: L.divIcon({ className: '', html: '<div class="poi"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }) }).addTo(edMap);
      S.poi = e.latlng;
      arm(null);
      $('#ed-poi').classList.add('done');
      $('#ed-conduit').disabled = false;
      $('#ed-conduit').classList.remove('dis');
      if (L_cond) { edMap.removeLayer(L_cond); L_cond = null; S.conduitFt = null; S.run = null; }
      side();
      saveSoon();
    }
  }
  $('#ed-area').onclick = function () { arm('area', this); toast('Drag a rectangle over the area the battery may use.'); };
  $('#ed-place').onclick = function () { if (this.disabled) return; arm('place', this); toast('Click inside the area to place the ' + UNIT.short + '.'); };
  $('#ed-poi').onclick = function () { if (this.disabled) return; arm('poi', this); toast('Click the utility service.'); };
  $('#ed-conduit').onclick = function () {
    if (this.disabled || !eq || !S.poi) return;
    var a = eq.disco, b = S.poi, mid = L.latLng(a.lat, b.lng);
    var ft = (V.miles([a.lat, a.lng], [mid.lat, mid.lng]) + V.miles([mid.lat, mid.lng], [b.lat, b.lng])) * 5280;
    if (L_cond) edMap.removeLayer(L_cond);
    L_cond = L.polyline([a, mid, b], { color: '#8A5A00', weight: 3, dashArray: '8 5' }).addTo(edMap);
    S.conduitFt = ft;
    S.run = null;
    this.classList.add('done');
    $('#ed-run').disabled = false;
    $('#ed-run').classList.remove('dis');
    side();
    saveSoon();
  };
  $('#ed-run').onclick = function () {
    if (this.disabled) return;
    var b = this;
    b.textContent = 'Running…';
    token().then(function (t) {
      if (!t) throw new Error('Sign in to run the price.');
      return fetch('/api/price-site', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t },
        body: JSON.stringify({ kw: UNIT.kw, hours: UNIT.hours || +(UNIT.kwh / UNIT.kw).toFixed(2), poiFt: Math.round(S.conduitFt), padArea: Math.round(S.area.sqft) }) });
    }).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j && (j.error || j.message) || ('Pricing answered ' + r.status)); return j; }); })
      .then(function (j) {
        S.run = j;
        S.runAt = nowIso();
        b.classList.add('done');
        b.textContent = 'Run';
        $('#ed-quote').disabled = false;
        $('#ed-quote').classList.remove('dis');
        side();
        paintReady();
        saveSoon();
        toast('Run complete. The install price is the OMEGA cost model.');
      }, function (e) { b.textContent = 'Run'; toast(e.message); S.runErr = e.message; side(); });
  };
  $('#ed-quote').onclick = function () { if (this.disabled) return; show('quote'); drawQuote(); };
  function side() {
    var h = '';
    if (S.projectId) h += '<div class="sec"><h6>Project</h6><a class="btn primary" href="' + editorHref() + '">Open the project in Site Map</a><p class="src">Saved as you go. Site Map opens the guided build.</p></div>';
    else if (S.saveErr) h += '<div class="sec"><div class="flag">' + esc(S.saveErr) + '</div></div>';
    h += '<div class="sec"><h6>Site</h6><table class="spec"><tr><td>Address</td><td>' + esc(S.addr) + '</td></tr>';
    if (S.assignment) h += '<tr><td>Customer</td><td>' + esc(S.assignment.customerName) + '</td></tr>';
    if (S.circuit) h += '<tr><td>Circuit</td><td>' + esc(S.circuit.feeder) + '</td></tr>';
    if (S.verdict) h += '<tr><td>Verdict</td><td>' + esc(S.verdict.verdict.label) + '</td></tr>';
    if (S.sub) h += '<tr><td>Substation</td><td>' + esc(S.sub.name) + ' · ' + S.sub.mi.toFixed(1) + ' mi</td></tr>';
    if (S.fit) h += '<tr><td>Pad</td><td>' + esc(S.fit.say) + '</td></tr>';
    h += '</table>';
    if (S.sub) h += '<p class="src">Substation: ' + esc(S.sub.source) + '. Queried ' + esc((S.subAt || '').slice(0, 10)) + '.</p>';
    h += '</div>';
    h += '<div class="sec"><h6>Battery</h6><table class="spec"><tr><td>Unit</td><td>' + esc(UNIT.name) + '</td></tr>'
      + '<tr><td>Power</td><td>' + fmt(UNIT.kw) + ' kW / ' + fmt(UNIT.kwh) + ' kWh</td></tr>'
      + '<tr><td>Price</td><td>Quote from ' + esc(UNIT.mfr || 'the manufacturer') + '</td></tr></table></div>';
    if (S.run && S.run.total) {
      h += '<div class="sec"><h6>Run</h6><p class="figure">' + money(S.run.total.base) + '</p>'
        + '<p class="src">Source: ' + esc(S.run.pricedBy || 'api/price-site') + '. Priced ' + esc((S.runAt || '').slice(0, 10)) + '.</p></div>';
    }
    $('#edSide').innerHTML = h;
  }

  function drawQuote() {
    var r = S.run || { divisions: [], total: { base: 0 }, pricedBy: '' };
    var mfr = esc(UNIT.mfr || 'Manufacturer');
    var rows = '<tr class="fen"><td>1</td><td>' + esc(UNIT.name) + '</td><td>1</td><td><span class="tag">' + mfr + '</span></td><td class="n">Quote required</td></tr>';
    (r.divisions || []).filter(function (d) { return d.base > 0; }).forEach(function (d, i) {
      rows += '<tr><td>' + (i + 2) + '</td><td>' + esc(d.name) + '</td><td>1</td><td><span class="tag">' + mfr + ' (full BOM)</span></td><td class="n">' + money(d.base) + '</td></tr>';
    });
    if (r.total) rows += '<tr><td></td><td><b>Installed total</b></td><td></td><td></td><td class="n"><b>' + money(r.total.base) + '</b></td></tr>';
    $('#qSub').textContent = S.addr;
    $('#bomBody').innerHTML = rows;
    $('#qNote').textContent = 'Priced by ' + (r.pricedBy || 'api/price-site') + (S.runAt ? ' on ' + S.runAt.slice(0, 10) : '') + '. The manufacturer quote replaces the battery line.';
    $('#q-editor').href = editorHref();
    $('#q-editor').textContent = S.projectId ? 'Open the project in Site Map' : 'Open in Site Map to file the RFQ';
  }
  $('#q-logic').onclick = function () { show('logic'); };
  $('#next').onclick = function () {
    var go = this.getAttribute('data-go');
    if (S.step === 'site') { $('#go').click(); return; }
    if (S.step === 'atlas') { if ($('#ga-go')) $('#ga-go').click(); else toast('The substation card is not up yet.'); return; }
    if (S.step === 'circuit') { if ($('#sf-tomap')) $('#sf-tomap').click(); return; }
    if (S.step === 'load') { toMap(); return; }
    if (S.step === 'map') { if (!$('#ed-quote').disabled) $('#ed-quote').click(); else toast('Run the price before the quote.'); return; }
    if (go) show(go);
  };

  $('#customer-btn').onclick = function () {
    $('#cust-name').value = S.assignment ? S.assignment.customerName : ($('#customer').value || '');
    $('#cust-dialog').showModal();
  };
  $('#cust-cancel').onclick = function () { $('#cust-dialog').close(); };
  $('#cust-save').onclick = function () {
    $('#customer').value = $('#cust-name').value;
    if (!readCustomer() && $('#cust-name').value.trim()) return;
    $('#cust-dialog').close();
    if (S.projectId) saveSoon();
  };
  $('#ready-btn').onclick = function () { paintReady(); $('#ready-dialog').showModal(); };
  $('#ready-close').onclick = function () { $('#ready-dialog').close(); };
  $('#btn-side').onclick = function () {
    var on = $('#edSide').classList.toggle('open');
    this.setAttribute('aria-expanded', on ? 'true' : 'false');
  };

  (function () {
    var cfg = window.CLEARSKY_CONFIG || {};
    try { if (window.firebase && firebase.initializeApp && !firebase.apps.length) firebase.initializeApp(cfg.firebase || cfg); } catch (e) {}
    try {
      firebase.auth().onAuthStateChanged(function (u) {
        if (u) loadUnits();
        if (window.OmegaSplash && OmegaSplash.done) OmegaSplash.done();
      });
    } catch (e2) {
      loadUnits();
      if (window.OmegaSplash && OmegaSplash.done) OmegaSplash.done();
    }
  })();
  paintSteps();
  paintReady();
  paintCustomer();
  show('site');
})();
