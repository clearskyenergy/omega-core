/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * omega-editor-v2-grid.js — Grid Atlas as one layer on the Site Plan map.
 *
 * The layer list and the line reading live in omega-grid-layers.js. The
 * circuit verdict is POST /api/grid-verdict, asked through
 * omega-grid-verdict.js. ComEd at the parcel is omega-comed-layers.js.
 * Any other state is POST /api/hosting-capacity. This file does not carry
 * a service URL, and it does not decide whether a unit fits.
 *
 * The layer is off until it is switched on. Nothing it reads is written
 * onto the drawing.
 */
(function (root) {
  'use strict';

  var COLORS = { distribution: '#1F4E79', transmission: '#e0533d', substation: '#c98a2b', line: '#5C6B7A' };
  var STATES = {
    AL: 1, AK: 1, AZ: 1, AR: 1, CA: 1, CO: 1, CT: 1, DE: 1, FL: 1, GA: 1,
    HI: 1, ID: 1, IL: 1, IN: 1, IA: 1, KS: 1, KY: 1, LA: 1, ME: 1, MD: 1,
    MA: 1, MI: 1, MN: 1, MS: 1, MO: 1, MT: 1, NE: 1, NV: 1, NH: 1, NJ: 1,
    NM: 1, NY: 1, NC: 1, ND: 1, OH: 1, OK: 1, OR: 1, PA: 1, RI: 1, SC: 1,
    SD: 1, TN: 1, TX: 1, UT: 1, VT: 1, VA: 1, WA: 1, WV: 1, WI: 1, WY: 1, DC: 1
  };

  var enabled = false;
  var scene = null;
  var answer = null;
  var note = '';
  var picked = null;
  var cardOpen = false;
  var loadedKey = '';
  var seq = 0;
  var listeners = [];

  function geom() { return root.OmegaEditorV2Geom; }
  function layers() { return root.OmegaGridLayers; }
  function verdict() { return root.OmegaGridVerdict; }

  function num(v) { var n = +v; return isFinite(n) ? n : null; }

  function stateOf(address) {
    var s = String(address || '').toUpperCase();
    var m = s.match(/\b([A-Z]{2})\s+\d{5}(?:-\d{4})?\b/);
    if (m && STATES[m[1]]) return m[1];
    m = s.match(/,\s*([A-Z]{2})\s*$/);
    if (m && STATES[m[1]]) return m[1];
    return null;
  }

  function comedAt(lat, lng) {
    var C = root.OmegaComEdLayers;
    var t = C && C.territoryAt ? C.territoryAt(lat, lng) : null;
    return !!(t && t.hasMap && (t.key === 'comed' || /comed/i.test(String(t.name || ''))));
  }

  /* comed: the parcel probe. hosting: the other-state route.
     none: no state on the address, or Illinois outside the ComEd map.
     Illinois is not sent to the hosting route. */
  function routeOf(lat, lng, address) {
    if (comedAt(lat, lng)) return 'comed';
    var st = stateOf(address);
    if (!st || st === 'IL') return 'none';
    return 'hosting';
  }

  function unitOf(summary) {
    summary = summary || {};
    var kw = num(summary.bessKw);
    var kwh = num(summary.bessKwh);
    return {
      kw: kw != null && kw > 0 ? kw : null,
      kwh: kwh != null && kwh > 0 ? kwh : null,
      name: kw != null && kw > 0 ? 'BESS' : ''
    };
  }

  function place(lat, lng, anchor) {
    var G = geom();
    var p = G.latLngToFt(lat, lng, anchor || { lat: 0, lng: 0 });
    var ft = Math.sqrt(p.x * p.x + p.y * p.y);
    var miles = Math.round(ft / 5280 * 100) / 100;
    return { x: p.x, y: p.y, miles: miles, km: Math.round(miles * 1.609344 * 100) / 100 };
  }

  function pathFeet(latLngs, anchor) {
    var G = geom();
    var out = [], i, p;
    for (i = 0; i < latLngs.length; i++) {
      p = G.latLngToFt(latLngs[i][0], latLngs[i][1], anchor);
      out.push({ x: p.x, y: p.y });
    }
    return out;
  }

  function sceneFrom(subsJson, linesJson, anchor) {
    var GL = layers();
    var subs = GL ? GL.substationsOf(subsJson, GL.SUBSTATIONS) : [];
    var rawLines = GL ? GL.linesOf(linesJson) : [];
    var outSubs = [], outLines = [], i, j, s, row, paths, at, best;
    anchor = anchor || { lat: 0, lng: 0 };
    for (i = 0; i < subs.length; i++) {
      s = subs[i];
      at = place(s.lat, s.lng, anchor);
      outSubs.push({
        feature: 'substation',
        name: s.name,
        kv: s.kv,
        minkv: s.minkv,
        lat: s.lat,
        lng: s.lng,
        x: at.x,
        y: at.y,
        miles: at.miles,
        km: at.km,
        lines: s.lines,
        status: s.status || '',
        owner: s.owner || '',
        source: s.source,
        sourceId: s.sourceId,
        registryVerified: s.registryVerified,
        feeding: false
      });
    }
    best = null;
    for (i = 0; i < outSubs.length; i++) {
      if (!best || outSubs[i].miles < best.miles) best = outSubs[i];
    }
    if (best) best.feeding = true;
    for (i = 0; i < rawLines.length; i++) {
      row = rawLines[i];
      paths = [];
      for (j = 0; j < row.paths.length; j++) paths.push(pathFeet(row.paths[j], anchor));
      outLines.push({
        feature: 'line',
        kind: row.kind,
        kv: row.kv,
        name: row.name,
        owner: row.owner || '',
        id: row.id,
        paths: paths,
        source: row.source,
        sourceId: row.sourceId,
        registryVerified: row.registryVerified
      });
    }
    return { lines: outLines, substations: outSubs, feeding: best };
  }

  function segDist(p, a, b) {
    var dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy, t, x, y;
    if (l2 === 0) return Math.sqrt((p.x - a.x) * (p.x - a.x) + (p.y - a.y) * (p.y - a.y));
    t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
    if (t < 0) t = 0;
    if (t > 1) t = 1;
    x = a.x + t * dx;
    y = a.y + t * dy;
    return Math.sqrt((p.x - x) * (p.x - x) + (p.y - y) * (p.y - y));
  }

  function hit(view, p, tol) {
    if (!view || !p) return null;
    var best = null, bestD = tol, i, d, dx, dy;
    var subs = view.substations || [];
    for (i = 0; i < subs.length; i++) {
      dx = p.x - subs[i].x;
      dy = p.y - subs[i].y;
      d = Math.sqrt(dx * dx + dy * dy);
      if (d <= bestD) { best = subs[i]; bestD = d; }
    }
    if (best) return best;
    var lines = view.lines || [], j, path;
    bestD = tol;
    for (i = 0; i < lines.length; i++) {
      for (j = 0; j < lines[i].paths.length; j++) {
        path = lines[i].paths[j];
        for (var k = 1; k < path.length; k++) {
          d = segDist(p, path[k - 1], path[k]);
          if (d <= bestD) { best = lines[i]; bestD = d; }
        }
      }
    }
    return best;
  }

  function colorOf(kind) {
    return COLORS[kind] || COLORS.line;
  }

  function verdictBody(unit, sub, circuit) {
    return {
      unit: unit || { kw: null, kwh: null, name: '' },
      substation: sub ? { name: sub.name, kv: sub.kv, km: sub.km } : null,
      circuit: circuit || null
    };
  }

  function sourceLine(kind, server, probe, hosting) {
    var GV = verdict();
    if (kind === 'comed' && GV && GV.circuitSourceLine) return GV.circuitSourceLine(server, probe);
    if (kind === 'hosting' && GV && GV.hostingSourceLine) return GV.hostingSourceLine(hosting, server);
    var line = 'No hosting map answered at this parcel.';
    if (server && server.version) line += ' Verdict: OMEGA grid verdict (' + server.version + ').';
    return line;
  }

  function applyAnswer(server, kind, probe, hosting) {
    if (!server || !server.verdict) return null;
    var GV = verdict();
    var at = new Date().toISOString();
    var fields = GV && GV.fields ? GV.fields(server, probe, 0, at) : null;
    var rec = fields || {
      substation: server.substation || null,
      circuit: server.circuit || null,
      verdict: {
        key: server.verdict.key, label: server.verdict.label, say: server.verdict.say,
        unitKw: server.unit && server.unit.kw, unitName: server.unit && server.unit.name,
        version: server.version, at: at
      }
    };
    if (rec.verdict && !rec.verdict.at) rec.verdict.at = at;
    rec.sourceLine = sourceLine(kind, server, kind === 'comed' ? probe : null, kind === 'hosting' ? hosting : null);
    rec.kind = kind || 'none';
    return rec;
  }

  function summaryLines(view, rec, status) {
    var lines = [];
    var sub = view && view.feeding;
    if (!view) {
      lines.push({ text: status || 'Reading the public substation and transmission layers…' });
      return lines;
    }
    if (sub) {
      lines.push({ text: sub.name + ' · ' + (sub.kv ? sub.kv + ' kV' : 'voltage not published') + ' · ' + sub.miles.toFixed(2) + ' mi' });
      if (sub.owner) lines.push({ text: sub.owner });
      if (sub.source) lines.push({ text: 'Source: ' + sub.source + (sub.registryVerified ? '. Layer list verified ' + sub.registryVerified + '.' : '.'), source: true });
    } else lines.push({ text: 'No substation came back from the public layer.' });
    if (view.lines) lines.push({ text: view.lines.length + ' lines from the public layer.' });
    var c = rec && rec.circuit;
    if (c && (c.id || c.netKw != null || c.publishedKw != null)) {
      var bits = [];
      if (c.id) bits.push('Circuit ' + c.id);
      if (c.publishedKw != null) bits.push(c.publishedKw + ' kW published');
      if (c.queuedKw != null) bits.push(c.queuedKw + ' kW queued');
      if (c.netKw != null) bits.push(c.netKw + ' kW net of the queue');
      if (bits.length) lines.push({ text: bits.join(' · ') });
    }
    if (rec && rec.verdict && rec.verdict.label) {
      lines.push({ text: rec.verdict.label + (rec.verdict.say ? '. ' + rec.verdict.say : '') });
    }
    if (rec && rec.sourceLine) lines.push({ text: rec.sourceLine, source: true });
    else if (status) lines.push({ text: status, source: true });
    return lines;
  }

  function featureLines(feature) {
    var lines = [], kind;
    if (!feature) return lines;
    if (feature.feature === 'line') {
      kind = feature.kind === 'distribution' ? 'Distribution' : (feature.kind === 'transmission' ? 'Transmission' : 'Line');
      lines.push({ text: kind + (feature.kv ? ' · ' + feature.kv + ' kV' : ' · voltage not published') });
      if (feature.owner) lines.push({ text: feature.owner });
    } else {
      lines.push({ text: (feature.feeding ? 'Feeding substation' : 'Substation') });
      lines.push({ text: feature.kv ? (feature.kv + ' kV') : 'Voltage not published' });
      if (feature.miles != null) lines.push({ text: feature.miles.toFixed(2) + ' mi from the site' });
      if (feature.lines != null && feature.lines !== '') lines.push({ text: 'Lines in: ' + feature.lines });
      if (feature.status) lines.push({ text: feature.status });
      if (feature.owner) lines.push({ text: feature.owner });
    }
    if (feature.source) lines.push({ text: 'Source: ' + feature.source + (feature.registryVerified ? '. Layer list verified ' + feature.registryVerified + '.' : '.'), source: true });
    return lines;
  }

  function notify() {
    var i;
    for (i = 0; i < listeners.length; i++) {
      try { listeners[i](); } catch (err) { /* a listener's error does not stop the map */ }
    }
  }

  function keyOf(doc) {
    var a = doc && doc.anchor;
    if (!a) return '';
    return String(a.lat) + ',' + String(a.lng);
  }

  function token() {
    try {
      var u = root.firebase && root.firebase.auth && root.firebase.auth().currentUser;
      if (u) return u.getIdToken();
    } catch (e) {}
    return Promise.reject(new Error('Sign in to check the grid.'));
  }

  function firstJson(urls, cb) {
    function next(i) {
      if (!urls || i >= urls.length) { cb(null); return; }
      var req;
      try { req = root.fetch(urls[i]); }
      catch (e) { next(i + 1); return; }
      req.then(function (r) { return r && r.ok ? r.json() : null; }).then(function (j) {
        if (j && j.features && j.features.length) cb(j);
        else next(i + 1);
      }, function () { next(i + 1); });
    }
    next(0);
  }

  function postHosting(lat, lng, st, cb) {
    token().then(function (tok) {
      return root.fetch('/api/hosting-capacity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok },
        body: JSON.stringify({ lat: lat, lng: lng, state: st })
      });
    }).then(function (r) {
      return r.json()['catch'](function () { return {}; }).then(function (j) {
        if (!r.ok) throw new Error((j && j.error) || ('Hosting answered ' + r.status));
        cb(null, j);
      });
    }, function (e) { cb(e); });
  }

  function readCircuit(doc, cb) {
    var anchor = doc.anchor || {};
    var lat = num(anchor.lat), lng = num(anchor.lng);
    var route = routeOf(lat, lng, doc.address);
    if (route === 'comed') {
      var C = root.OmegaComEdLayers;
      if (!C || !C.probePoint) { cb('comed', null, null, 'The ComEd map is not loaded.'); return; }
      C.probePoint(lat, lng, function (err, res) {
        if (err || !res || !res.rows || !res.rows.length) {
          cb('comed', null, res || null, err ? (err.message || 'ComEd did not answer.') : 'ComEd publishes no hosting-capacity circuit at this point.');
          return;
        }
        var GV = verdict();
        cb('comed', GV && GV.circuitBody ? GV.circuitBody(res, 0, 'ComEd') : null, res, '');
      });
      return;
    }
    if (route === 'hosting') {
      postHosting(lat, lng, stateOf(doc.address), function (err, j) {
        if (err) { cb('hosting', null, null, err.message || 'The hosting service did not answer.'); return; }
        if (!j || !j.covered || j.empty || !j.circuit) {
          cb('hosting', null, j, (j && j.say) || 'No open hosting layer for this state.');
          return;
        }
        cb('hosting', j.circuit, j, '');
      });
      return;
    }
    cb('none', null, null, '');
  }

  function askVerdict(ticket, doc, summary, kind, circuit, probe, status) {
    var GV = verdict();
    if (!GV || !GV.ask) {
      if (ticket !== seq) return;
      note = status || 'The grid verdict client did not load.';
      notify();
      return;
    }
    var body = verdictBody(unitOf(summary), scene && scene.feeding, circuit);
    GV.ask(body).then(function (server) {
      if (ticket !== seq) return;
      answer = applyAnswer(server, kind, probe, kind === 'hosting' ? probe : null);
      note = status || '';
      notify();
    }, function (err) {
      if (ticket !== seq) return;
      answer = null;
      note = (err && err.message) || status || 'The grid verdict did not answer.';
      notify();
    });
  }

  function load(doc, summary) {
    var ticket = ++seq;
    var GL = layers();
    var anchor = (doc && doc.anchor) || { lat: 0, lng: 0 };
    loadedKey = keyOf(doc);
    scene = null;
    answer = null;
    picked = null;
    note = 'Reading the public substation and transmission layers…';
    notify();
    if (!GL || !GL.queryUrls) {
      note = 'The grid layer list is not loaded.';
      notify();
      return;
    }
    var left = 2, subsJson = null, linesJson = null;
    function done() {
      if (--left) return;
      if (ticket !== seq) return;
      scene = sceneFrom(subsJson, linesJson, anchor);
      note = (scene.substations.length || scene.lines.length) ? '' : 'The public substation services did not answer. Try again in a minute.';
      notify();
      readCircuit(doc, function (kind, circuit, probe, status) {
        if (ticket !== seq) return;
        askVerdict(ticket, doc, summary, kind, circuit, probe, status);
      });
    }
    firstJson(GL.queryUrls('substations', anchor.lat, anchor.lng, 0.12), function (j) { subsJson = j; done(); });
    firstJson(GL.queryUrls('transmission', anchor.lat, anchor.lng, 0.12), function (j) { linesJson = j; done(); });
  }

  function setEnabled(v, doc, summary) {
    enabled = !!v;
    if (!enabled) {
      picked = null;
      cardOpen = false;
      notify();
      return;
    }
    cardOpen = true;
    picked = null;
    if (!doc) { notify(); return; }
    if (loadedKey !== keyOf(doc) || !scene) load(doc, summary);
    else notify();
  }

  function reload(doc, summary) {
    if (!enabled) return;
    load(doc, summary);
  }

  function card() {
    if (!enabled || !cardOpen) return { visible: false, title: '', lines: [], back: false };
    if (picked) return { visible: true, title: picked.name || 'Grid', lines: featureLines(picked), back: true };
    return { visible: true, title: 'Grid Atlas', lines: summaryLines(scene, answer, note), back: false };
  }

  function draw(ctx, toScreen) {
    if (!enabled || !scene || !ctx || !toScreen) return;
    var i, j, k, path, s, f;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.25;
    for (i = 0; i < scene.lines.length; i++) {
      f = scene.lines[i];
      ctx.strokeStyle = colorOf(f.kind);
      ctx.globalAlpha = f.kind === 'line' ? 0.55 : 0.9;
      for (j = 0; j < f.paths.length; j++) {
        path = f.paths[j];
        if (path.length < 2) continue;
        ctx.beginPath();
        s = toScreen(path[0]);
        ctx.moveTo(s.x, s.y);
        for (k = 1; k < path.length; k++) { s = toScreen(path[k]); ctx.lineTo(s.x, s.y); }
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    for (i = 0; i < scene.substations.length; i++) {
      f = scene.substations[i];
      s = toScreen(f);
      ctx.beginPath();
      ctx.fillStyle = COLORS.substation;
      ctx.strokeStyle = COLORS.substation;
      ctx.lineWidth = 1.5;
      ctx.arc(s.x, s.y, f.feeding ? 7 : 4, 0, Math.PI * 2);
      ctx.fill();
      if (f.feeding) {
        ctx.stroke();
        if (f.name) {
          ctx.font = '12px sans-serif';
          ctx.textBaseline = 'bottom';
          var w = ctx.measureText(f.name).width;
          ctx.fillStyle = 'rgba(255,255,255,.92)';
          ctx.fillRect(s.x + 10, s.y - 20, w + 8, 16);
          ctx.fillStyle = '#16202B';
          ctx.fillText(f.name, s.x + 14, s.y - 6);
        }
      }
    }
    ctx.restore();
  }

  var api = {
    COLORS: COLORS,
    colorOf: colorOf,
    stateOf: stateOf,
    routeOf: routeOf,
    unitOf: unitOf,
    sceneFrom: sceneFrom,
    hit: hit,
    verdictBody: verdictBody,
    applyAnswer: applyAnswer,
    summaryLines: summaryLines,
    featureLines: featureLines,
    enabled: function () { return enabled; },
    setEnabled: setEnabled,
    reload: reload,
    record: function () { return answer; },
    card: card,
    hideCard: function () { cardOpen = false; notify(); },
    clearPick: function () { picked = null; if (enabled) cardOpen = true; notify(); },
    pick: function (feature) { picked = feature || null; cardOpen = !!feature; notify(); },
    hitAt: function (p, tol) { return enabled ? hit(scene, p, tol) : null; },
    focus: function () {
      if (!enabled || !scene || !scene.feeding) return null;
      return { x: scene.feeding.x, y: scene.feeding.y, name: scene.feeding.name };
    },
    draw: draw,
    onChange: function (fn) { if (typeof fn === 'function') listeners.push(fn); },
    reset: function () {
      seq++;
      enabled = false;
      scene = null;
      answer = null;
      note = '';
      picked = null;
      cardOpen = false;
      loadedKey = '';
    },
    VERSION: 'editor-v2-grid/1'
  };
  root.OmegaEditorV2Grid = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : global);
