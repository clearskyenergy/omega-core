/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * omega-editor-v2-parcels.js — Parcel lines in Omega Maximus.
 *
 * The same two sources as Site Map's View › Parcel Lines, through the same
 * doors, never a second copy:
 *   1. THE LINES. Regrid's every-county tiles through /api/parcel-tiles
 *      (the token stays on the server; the page holds a monthly ticket)
 *      when the server has them, else every county and state layer in
 *      omega-parcel-sources.js (the ONE list) whose box a tile touches.
 *   2. THE PARCEL AT A POINT. POST /api/parcel: the ring, APN, acres,
 *      zoning, county and source (Regrid where the plan carries it, the
 *      county layers otherwise). Regrid is metered per lookup, so a point is
 *      asked once a page and a page asks at most LOOKUPS times; the server
 *      caches a parcel for everyone.
 *
 * A VIEW setting, remembered per browser, never saved with the drawing and
 * never a number, until somebody chooses Use as site boundary, which adds
 * the ring to the drawing as the lot line. Reference only: an assessor's
 * line is a tax map, not a survey, and the card says so. The owner's name
 * is not shown.
 */
(function (root) {
  'use strict';

  var PREF = 'omegaMaximusParcels';
  var LOOKUPS = 12;
  var INK = '#FFD60A';
  var INK_RGB = [255, 214, 10];

  var on = false;
  var rg = { ticket: null, minZoom: 15, reason: null, pending: null };
  var found = [];
  var asked = {};
  var lookups = 0;
  var busy = false;
  var last = '';
  var listeners = [];

  function S() { return root.OmegaParcelSources || null; }
  function G() { return root.OmegaEditorV2Geom; }
  function notify() { for (var i = 0; i < listeners.length; i++) { try { listeners[i](); } catch (e) {} } }
  function say(msg) { last = msg; notify(); }

  function prefRead() { try { return root.localStorage.getItem(PREF) === '1'; } catch (e) { return false; } }
  function prefWrite(v) { try { root.localStorage.setItem(PREF, v ? '1' : '0'); } catch (e) {} }

  function token() {
    var Auth = root.OmegaEditorV2Auth;
    if (Auth && typeof Auth.idToken === 'function') return Auth.idToken();
    try {
      var u = root.firebase && root.firebase.auth && root.firebase.auth().currentUser;
      if (u) return u.getIdToken();
    } catch (e) {}
    return Promise.resolve('');
  }

  /* Regrid's ticket, asked once a page. A definite no ('not-configured',
     'no-tile-access', 'switched-off') is kept; a network failure is asked
     again next time. */
  function regrid() {
    if (rg.ticket) return Promise.resolve(rg);
    if (rg.reason) return Promise.resolve(null);
    if (rg.pending) return rg.pending;
    rg.pending = token().then(function (tok) {
      if (!tok) return null;
      return root.fetch('/api/parcel-tiles', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: '{}'
      }).then(function (r) {
        return r.json()['catch'](function () { return null; }).then(function (j) {
          if (j && j.ok && j.ticket) { rg.ticket = j.ticket; rg.minZoom = j.minZoom || 15; return rg; }
          rg.reason = (j && (j.reason || j.error)) || ('HTTP ' + r.status);
          return null;
        });
      });
    }).then(function (x) { rg.pending = null; return x; }, function () { rg.pending = null; return null; });
    return rg.pending;
  }

  /* What draws at a point: Regrid everywhere when its ticket is held, else
     the public layers whose box holds the point. */
  function coverage(lat, lng) {
    if (rg.ticket) return [{ label: 'Regrid (every county)', minZoom: rg.minZoom }];
    var src = S();
    return src ? src.at(lat, lng) : [];
  }

  /* One tile's pictures, or null when nothing draws there. Regrid's PNGs
     come from this origin, so they are repainted in INK to read on the
     photo; a county layer that refuses a tile hides its picture rather
     than showing a broken one. */
  function tileNode(spec, doc) {
    doc = doc || root.document;
    var n = Math.pow(2, spec.z), x = ((spec.x % n) + n) % n;
    if (spec.y < 0 || spec.y >= n) return null;
    var box = doc.createElement('div');
    box.className = 'pt';
    if (rg.ticket) {
      if (spec.z < rg.minZoom) return null;
      var cv = doc.createElement('canvas');
      cv.width = 256; cv.height = 256;
      var img = new root.Image();
      img.onload = function () {
        try {
          var g = cv.getContext('2d');
          g.drawImage(img, 0, 0, 256, 256);
          var d = g.getImageData(0, 0, 256, 256), px = d.data, i;
          for (i = 0; i < px.length; i += 4) if (px[i + 3]) { px[i] = INK_RGB[0]; px[i + 1] = INK_RGB[1]; px[i + 2] = INK_RGB[2]; px[i + 3] = Math.min(255, px[i + 3] * 2); }
          g.putImageData(d, 0, 0);
        } catch (e) {}
      };
      img.src = '/api/parcel-tiles?z=' + spec.z + '&x=' + x + '&y=' + spec.y + '&t=' + encodeURIComponent(rg.ticket);
      cv.setAttribute('data-src', img.src);
      box.appendChild(cv);
      return box;
    }
    var src = S();
    if (!src) return null;
    var urls = [], i, u;
    for (i = 0; i < src.SOURCES.length; i++) { u = src.tileUrl(src.SOURCES[i], x, spec.y, spec.z); if (u) urls.push(u); }
    if (!urls.length) return null;
    for (i = 0; i < urls.length; i++) {
      var pic = doc.createElement('img');
      pic.alt = '';
      pic.draggable = false;
      pic.onerror = function () { this.style.display = 'none'; };
      pic.src = urls[i];
      box.appendChild(pic);
    }
    return box;
  }

  function foundAt(lat, lng) {
    var src = S();
    if (!src) return null;
    for (var i = 0; i < found.length; i++) if (src.inRing(found[i].ring, lat, lng)) return found[i];
    return null;
  }

  function describe(p) {
    var bits = [];
    if (p.apn) bits.push('APN ' + p.apn);
    if (p.acres != null && isFinite(+p.acres)) bits.push((+p.acres).toFixed(2) + ' ac');
    if (p.zoning) bits.push('zoned ' + p.zoning);
    if (p.county) bits.push(p.county);
    return (bits.join(' · ') || 'a parcel record') + (p.source ? ' (' + p.source + ')' : '');
  }

  /* The parcel under a point. Resolves the record or null, and never
     rejects; what happened is in status(). */
  function lookup(lat, lng) {
    lat = +lat; lng = +lng;
    if (!isFinite(lat) || !isFinite(lng)) return Promise.resolve(null);
    var have = foundAt(lat, lng);
    if (have) { say('Parcel: ' + describe(have) + '.'); return Promise.resolve(have); }
    var key = lat.toFixed(5) + ',' + lng.toFixed(5);
    if (asked[key]) return Promise.resolve(null);
    if (lookups >= LOOKUPS) { say('This page has used its ' + LOOKUPS + ' parcel lookups. Reload to look up more.'); return Promise.resolve(null); }
    asked[key] = 1;
    lookups++;
    busy = true;
    say('Looking up the parcel…');
    return token().then(function (tok) {
      if (!tok) { delete asked[key]; lookups--; busy = false; say('Sign in to look up the parcel.'); return null; }
      return root.fetch('/api/parcel', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok },
        body: JSON.stringify({ lat: lat, lng: lng })
      }).then(function (r) {
        return r.json()['catch'](function () { return null; }).then(function (j) {
          busy = false;
          if (r.status === 401) { delete asked[key]; lookups--; say('Sign in to look up the parcel.'); return null; }
          if (!r.ok) { delete asked[key]; say((j && j.error) || 'The parcel lookup did not answer. Try again.'); return null; }
          if (!j || !j.ok || !j.ring || j.ring.length < 3) { say('No parcel record at this point' + (j && j.note ? ' (' + j.note + ')' : '') + '.'); return null; }
          var rec = { ring: j.ring, apn: j.apn || null, acres: j.acres != null ? j.acres : null, zoning: j.zoning || null,
                      county: j.county || null, source: j.source || null, at: new Date().toISOString() };
          if (!foundAt(lat, lng)) found.push(rec);
          say('Parcel: ' + describe(rec) + '.');
          return rec;
        });
      });
    }).then(null, function () {
      delete asked[key];
      busy = false;
      say('The parcel lookup did not answer. Check the connection and try again.');
      return null;
    });
  }

  /* The lines come on: Regrid's ticket is asked, then the parcel under the
     site point. */
  function setEnabled(v, anchor) {
    on = !!v;
    prefWrite(on);
    if (!on) { say(''); return Promise.resolve(null); }
    say('Parcel lines on.');
    return regrid().then(function () {
      notify();
      if (anchor && isFinite(+anchor.lat) && isFinite(+anchor.lng)) return lookup(anchor.lat, anchor.lng);
      return null;
    });
  }

  /* Outlines of the parcels found, on the canvas, in feet from the anchor. */
  function draw(ctx, toScreen, anchor) {
    if (!on || !ctx || !toScreen || !anchor || !G()) return;
    var i, j, p, s;
    ctx.save();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.fillStyle = 'rgba(255,214,10,0.06)';
    for (i = 0; i < found.length; i++) {
      p = found[i].ring;
      ctx.beginPath();
      for (j = 0; j < p.length; j++) {
        s = toScreen(G().latLngToFt(+p[j][0], +p[j][1], anchor));
        if (j === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  /* The ring as the drawing's lot line: a closed polygon on the Site layer,
     in feet from the anchor, that names where it came from. */
  function toEntity(rec, anchor) {
    if (!rec || !rec.ring || rec.ring.length < 3 || !anchor || !G()) return null;
    var pts = [], i, q, ring = rec.ring.slice();
    var first = ring[0], lastPt = ring[ring.length - 1];
    if (+first[0] === +lastPt[0] && +first[1] === +lastPt[1]) ring.pop();
    for (i = 0; i < ring.length; i++) {
      q = G().latLngToFt(+ring[i][0], +ring[i][1], anchor);
      pts.push({ x: Math.round(q.x * 100) / 100, y: Math.round(q.y * 100) / 100 });
    }
    return {
      type: 'polygon', layer: 'site', closed: true, pts: pts,
      label: rec.apn ? 'Parcel ' + rec.apn : 'Parcel',
      parcel: { apn: rec.apn || null, acres: rec.acres != null ? rec.acres : null, county: rec.county || null, source: rec.source || null, at: rec.at || null }
    };
  }

  /* What the card says at a point (the site point, or the map centre). */
  function card(lat, lng) {
    if (!on) return { visible: false, lines: [], parcel: null };
    var lines = [], cov = coverage(lat, lng), p = foundAt(lat, lng);
    if (!S() && !rg.ticket) lines.push({ text: 'The public parcel list did not load.' });
    else if (cov.length) lines.push({ text: 'Lines from ' + cov.map(function (c) { return c.label; }).join(', ') + '.' });
    else lines.push({ text: 'No public parcel layer covers this area' + (rg.reason ? ', and Regrid is not on for this workspace.' : '.') });
    if (p) lines.push({ text: describe(p) + '.' });
    else if (last) lines.push({ text: last });
    lines.push({ text: 'Reference only: an assessor\'s line is a tax map, not a survey.', source: true });
    return { visible: true, title: 'Parcel lines', lines: lines, parcel: p, busy: busy };
  }

  var api = {
    enabled: function () { return on; },
    remembered: prefRead,
    setEnabled: setEnabled,
    lookup: lookup,
    foundAt: foundAt,
    tileNode: tileNode,
    coverage: coverage,
    draw: draw,
    card: card,
    toEntity: toEntity,
    describe: describe,
    status: function () { return last; },
    source: function () { return rg.ticket ? 'regrid' : 'county'; },
    onChange: function (fn) { if (typeof fn === 'function') listeners.push(fn); },
    reset: function () { on = false; found = []; asked = {}; lookups = 0; busy = false; last = ''; rg = { ticket: null, minZoom: 15, reason: null, pending: null }; },
    INK: INK,
    LOOKUPS: LOOKUPS,
    VERSION: 'editor-v2-parcels/1'
  };
  root.OmegaEditorV2Parcels = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : global);
