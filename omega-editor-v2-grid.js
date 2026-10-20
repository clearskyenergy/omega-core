/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * omega-editor-v2-grid.js — Grid Atlas as one layer on the Site Plan map.
 *
 * The layer list and the line reading live in omega-grid-layers.js. The
 * serving utility, its published hosting capacity and the circuit verdict
 * are ONE question to the national door, POST /api/hosting-capacity, asked
 * through omega-grid-verdict.js GV.hosting: the door Omega Prime and Site
 * Map's Grid panel ask (2026-10-17, Tommy: "it should not just run comed
 * information if its outside of comed it needs to look via api for the
 * utility details"). The server decides whose wire it is, in every state,
 * ComEd included; this file routes nothing by state. It does not carry a
 * service URL, names no utility, and does not decide whether a unit fits.
 *
 * The layer is off until it is switched on. Nothing it reads is written
 * onto the drawing.
 */
(function (root) {
  'use strict';

  var COLORS = { distribution: '#1F4E79', transmission: '#e0533d', substation: '#c98a2b', line: '#5C6B7A' };
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

  /* The door's request: the site point, the battery on the drawing (no
     battery, no unit: the utility and its figures are still read) and the
     feeding substation, so its chip is judged in the same answer. */
  function hostingBody(anchor, unit, sub) {
    return {
      lat: num(anchor && anchor.lat),
      lng: num(anchor && anchor.lng),
      unit: unit && unit.kw ? { kw: unit.kw, kwh: unit.kwh, name: unit.name } : null,
      substation: sub ? { name: sub.name, kv: sub.kv, km: sub.km } : null,
      mode: 'storage'
    };
  }

  /* Where the answer came from, in the answer's own words: the source the
     server named, its layer and date, the territory layers that named the
     utility, and the verdict's version. Never one utility's field names. */
  function sourceLine(res, at) {
    var src = res && res.source, v = res && res.verdict, parts = [];
    if (src) {
      parts.push('Source: ' + [src.label, src.layer, src.refreshed ? 'refreshed ' + src.refreshed : ''].filter(function (x) { return !!x; }).join(' · ') +
        (src.addressResolved ? ', resolved at the parcel.' : ', the nearest published circuit, not resolved at the parcel.'));
    } else parts.push('No hosting map answered at this parcel.');
    if (res && res.territory && res.territory.source) parts.push('Utility named from ' + res.territory.source + '.');
    if (v && v.version) parts.push('Verdict: OMEGA grid verdict (' + v.version + ').');
    if (at) parts.push('Asked ' + at + '.');
    return parts.join(' ');
  }

  function safeHref(u) { return /^https:\/\/[^\s"'<>]+$/i.test(String(u || '')) ? String(u) : ''; }

  /* The door's answer → the record: the grid record Site Map and Prime
     write (GV.fromHosting: substation, circuit, verdict), plus what the card
     says about the utility, the territory, the circuit's power and the
     utility's own map. Read live; nothing here is written onto the drawing. */
  function applyAnswer(res) {
    var GV = verdict();
    if (!res || !res.verdict || !res.verdict.verdict || !GV || !GV.fromHosting) return null;
    var at = new Date().toISOString();
    var rec = GV.fromHosting(res, at);
    if (!rec) return null;
    var t = res.territory || {}, chosen = res.utility && res.utility.eiaId, href = res.verify && safeHref(res.verify.viewerUrl);
    var best = res.circuits && res.best != null ? res.circuits[res.best] || null : null, up = (best && best.upstream) || {};
    rec.kind = res.coverage || 'none';
    rec.coverage = res.coverage || null;
    rec.utility = res.utility ? { key: res.utility.key || null, display: res.utility.display || '', eiaId: res.utility.eiaId || null } : null;
    rec.note = res.note || '';
    rec.verify = href ? { viewerUrl: href, label: res.verify.label || '' } : null;
    rec.candidates = !t.confident && t.candidates && t.candidates.length > 1 ? t.candidates.map(function (c) {
      return { display: c.display || c.name || '', chosen: !!(c.eiaId && c.eiaId === chosen), weak: !!c.weak, why: c.why || '' };
    }) : null;
    rec.power = best ? { id: best.id || '', name: best.name || '', substation: best.substation || '', kv: best.kv == null ? null : best.kv,
      transformerKw: up.transformerKw == null ? null : up.transformerKw, bankKw: up.bankKw == null ? null : up.bankKw,
      substationKw: up.substationKw == null ? null : up.substationKw, pnode: up.pnode || null,
      feederQueuedKw: up.feederQueuedKw == null ? null : up.feederQueuedKw, distanceM: best.distanceM == null ? null : best.distanceM } : null;
    rec.circuitCount = res.circuits ? res.circuits.length : 0;
    rec.sourceLine = sourceLine(res, at);
    return rec;
  }

  function kwText(n) { return Math.round(n).toLocaleString('en-US') + ' kW'; }
  /* The queue and side words follow the answer, never one utility's habit:
     a queue published beside a gross figure is subtracted; one the utility
     already netted is shown, not subtracted twice; one not published is
     said so, never read as 0. A one-sided figure says which side it is. */
  function circuitText(c) {
    var bits = [], side = c.basis === 'gen' ? ' (generation only)' : (c.basis === 'load' ? ' (load only)' : '');
    if (c.id) bits.push('Circuit ' + c.id);
    if (c.band && c.band.text) bits.push('published as ' + c.band.text + side + ', judged at its low end');
    else if (c.publishedKw != null) bits.push(kwText(c.publishedKw) + ' published' + side);
    if (c.publishedKw != null) {
      if (c.queuedKw == null) bits.push('no queue published with this figure');
      else if (c.queueNetted) bits.push(kwText(c.queuedKw) + ' queued, already in the figure');
      else bits.push(kwText(c.queuedKw) + ' queued');
    }
    if (c.netKw != null) bits.push(kwText(c.netKw) + (c.queuedKw == null ? ' as published' : ' net of the queue'));
    return bits.join(' · ');
  }
  function powerText(p) {
    if (!p) return '';
    var bits = [];
    if (p.substation) bits.push('substation ' + p.substation);
    if (p.kv != null) bits.push(p.kv + ' kV');
    if (p.transformerKw != null) bits.push('upstream transformer ' + kwText(p.transformerKw));
    if (p.bankKw != null) bits.push('upstream bank ' + kwText(p.bankKw));
    if (p.substationKw != null) bits.push('substation room ' + kwText(p.substationKw));
    if (p.pnode) bits.push('pricing node ' + p.pnode);
    if (p.feederQueuedKw != null) bits.push(kwText(p.feederQueuedKw) + ' queued on the whole feeder');
    if (p.distanceM != null) bits.push(Math.round(p.distanceM).toLocaleString('en-US') + ' m from the point');
    return bits.length ? 'Where the power comes from: ' + bits.join(' · ') + '.' : '';
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
    if (rec && (rec.utility || rec.coverage)) {
      var GV = verdict(), words = (GV && GV.COVERAGE && GV.COVERAGE[rec.coverage]) || '';
      if (!rec.utility && rec.coverage === 'outside') words = '';
      lines.push({ text: 'Serving utility: ' + (rec.utility && rec.utility.display ? rec.utility.display : 'none on record') + (words ? ' · ' + words : '') });
    }
    if (rec && rec.candidates) {
      lines.push({ text: 'More than one utility is mapped at this point: ' + rec.candidates.map(function (x) {
        return x.display + (x.chosen ? ' (the one read here)' : '') + (x.weak && x.why ? ' (' + x.why + ')' : '');
      }).join(', ') + '. Confirm the utility with the customer’s bill.' });
    }
    var c = rec && rec.circuit;
    if (c && (c.id || c.netKw != null || c.publishedKw != null)) {
      var said = circuitText(c);
      if (said) lines.push({ text: said });
      if (rec.circuitCount > 1) lines.push({ text: rec.circuitCount + ' circuits answer at this point; the nearest with a published figure is judged.' });
    }
    if (rec && rec.note && rec.coverage !== 'read') lines.push({ text: rec.note });
    if (rec && rec.verdict && rec.verdict.label) {
      lines.push({ text: rec.verdict.label + (rec.verdict.say ? '. ' + rec.verdict.say : '') });
    }
    var power = rec && powerText(rec.power);
    if (power) lines.push({ text: power });
    if (rec && rec.verify) lines.push({ text: 'Check it on ' + (rec.verify.label || ((rec.utility && rec.utility.display) || 'the utility') + '’s map'), href: rec.verify.viewerUrl });
    if (rec && rec.sourceLine) lines.push({ text: rec.sourceLine + (rec.coverage === 'read' && rec.note ? ' ' + rec.note : ''), source: true });
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

  /* One question to the door; the answer is the record. A door that does
     not answer is said, and nothing is judged. */
  function askDoor(ticket, doc, summary) {
    var GV = verdict(), body = hostingBody(doc && doc.anchor, unitOf(summary), scene && scene.feeding);
    if (body.lat == null || body.lng == null || (body.lat === 0 && body.lng === 0)) {
      answer = null;
      note = 'This drawing has no site point yet, so no circuit was asked.';
      notify();
      return;
    }
    if (!GV || !GV.hosting) {
      note = 'The grid verdict client did not load.';
      notify();
      return;
    }
    GV.hosting(body).then(function (res) {
      if (ticket !== seq) return;
      answer = applyAnswer(res);
      note = answer ? '' : 'The hosting capacity check returned no verdict.';
      notify();
    }, function (err) {
      if (ticket !== seq) return;
      answer = null;
      note = 'The hosting capacity check did not answer: ' + ((err && err.message) || 'no reply');
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
      askDoor(ticket, doc, summary);
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
    unitOf: unitOf,
    sceneFrom: sceneFrom,
    hit: hit,
    hostingBody: hostingBody,
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
    VERSION: 'editor-v2-grid/2'
  };
  root.OmegaEditorV2Grid = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : global);
