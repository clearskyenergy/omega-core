/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * omega-editor-v2-buildings.js — the buildings already on the lot.
 *
 * Tommy, 2026-10-21: "Can the software you're building generate on the
 * parcel for the address the building? That would be useful especially for
 * the 3d." A lot set from the county's parcel gets its buildings from the
 * public footprints: FEMA's USA Structures first (every US structure over
 * about 450 sq ft, its use and, from imagery or LiDAR, its height), else
 * OpenStreetMap's buildings. Each becomes an Obstruction carrying what the
 * source said (`building{ heightFt, use, areaSqFt, source, year, id }`), so
 * a guided build keeps off it and 3D raises it to its height. Read, never
 * invented: a footprint with no height says so, and 3D shows it at the
 * default it always used.
 *
 * parseFema / parseOsm / onLot / toEntities are pure, for the checks; find()
 * asks the two services, FEMA first, with a time limit on each.
 */
(function (root) {
  'use strict';
  var FEMA = 'https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/USA_Structures_View/FeatureServer/0/query';
  var OSM = 'https://overpass-api.de/api/interpreter';
  var FT_PER_M = 3.280839895, MAX = 200;
  var G = null;
  function geom() { return G || (G = root.OmegaEditorV2Geom || (typeof require === 'function' ? require('./omega-editor-v2-geom.js') : null)); }

  function round1(x) { return Math.round(x * 10) / 10; }
  /* the box around a ring of [lat, lng], padded a little */
  function bboxOf(ring) {
    var b = { s: Infinity, w: Infinity, n: -Infinity, e: -Infinity }, i;
    for (i = 0; i < ring.length; i++) {
      if (ring[i][0] < b.s) b.s = ring[i][0]; if (ring[i][0] > b.n) b.n = ring[i][0];
      if (ring[i][1] < b.w) b.w = ring[i][1]; if (ring[i][1] > b.e) b.e = ring[i][1];
    }
    var pad = 0.00005;
    return { s: b.s - pad, w: b.w - pad, n: b.n + pad, e: b.e + pad };
  }
  function centroid(ring) {
    var x = 0, y = 0, i, n = ring.length;
    if (n > 1 && ring[0][0] === ring[n - 1][0] && ring[0][1] === ring[n - 1][1]) n--;
    for (i = 0; i < n; i++) { x += ring[i][1]; y += ring[i][0]; }
    return { lat: y / n, lng: x / n };
  }
  function inRing(lat, lng, ring) {
    var inside = false, i, j;
    for (i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      var yi = ring[i][0], xi = ring[i][1], yj = ring[j][0], xj = ring[j][1];
      if ((yi > lat) !== (yj > lat) && lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  /* FEMA USA Structures, as its query answers (outSR 4326: rings of [lng, lat]) */
  function parseFema(json) {
    var out = [], f = (json && json.features) || [], i, a, g, r, ring, j, year;
    for (i = 0; i < f.length && out.length < MAX; i++) {
      a = f[i].attributes || {}; g = f[i].geometry || {}; r = g.rings && g.rings[0];
      if (!r || r.length < 4) continue;
      ring = [];
      for (j = 0; j < r.length; j++) ring.push([+r[j][1], +r[j][0]]);
      year = a.IMAGE_DATE ? new Date(+a.IMAGE_DATE).getUTCFullYear() : a.PROD_DATE ? new Date(+a.PROD_DATE).getUTCFullYear() : null;
      out.push({
        id: 'fema:' + (a.BUILD_ID || a.OBJECTID || i),
        ring: ring,
        heightFt: +a.HEIGHT > 0 ? round1(+a.HEIGHT * FT_PER_M) : null,
        use: [a.OCC_CLS, a.PRIM_OCC].filter(function (x) { return x && x !== 'Unclassified'; }).join(' · ') || null,
        areaSqFt: +a.SQFEET > 0 ? Math.round(+a.SQFEET) : null,
        source: 'FEMA USA Structures' + (a.SOURCE ? ' (' + a.SOURCE + ')' : ''),
        year: isFinite(year) ? year : null
      });
    }
    return out;
  }
  /* OpenStreetMap's buildings, as Overpass answers `out geom` */
  function parseOsm(json) {
    var out = [], els = (json && json.elements) || [], i, el, t, ring, j, m;
    for (i = 0; i < els.length && out.length < MAX; i++) {
      el = els[i];
      if (!el.geometry || el.geometry.length < 4) continue;
      ring = [];
      for (j = 0; j < el.geometry.length; j++) ring.push([+el.geometry[j].lat, +el.geometry[j].lon]);
      t = el.tags || {};
      m = parseFloat(t.height);
      if (!(m > 0) && parseFloat(t['building:levels']) > 0) m = parseFloat(t['building:levels']) * 3.2;
      out.push({
        id: 'osm:' + el.id, ring: ring,
        heightFt: m > 0 ? round1(m * FT_PER_M) : null,
        use: t.building && t.building !== 'yes' ? t.building : null,
        areaSqFt: null, source: 'OpenStreetMap', year: null,
        heightFrom: t.height ? 'height' : (t['building:levels'] ? 'levels' : null)
      });
    }
    return out;
  }
  /* the buildings whose middle is on the lot */
  function onLot(list, lotRing) {
    if (!lotRing || lotRing.length < 3) return list.slice();
    return list.filter(function (b) { var c = centroid(b.ring); return inRing(c.lat, c.lng, lotRing); });
  }
  /* Obstructions for the drawing, in feet from the site point; none twice */
  function toEntities(list, anchor, existing) {
    var Gm = geom(), seen = {}, out = [], i, j, e, b, pts, c, q, dupe;
    (existing || []).forEach(function (x) { if (x && x.building && x.building.id) seen[x.building.id] = 1; });
    for (i = 0; i < list.length; i++) {
      b = list[i];
      if (seen[b.id]) continue;
      pts = [];
      for (j = 0; j < b.ring.length; j++) { q = Gm.latLngToFt(b.ring[j][0], b.ring[j][1], anchor); pts.push({ x: Math.round(q.x * 100) / 100, y: Math.round(q.y * 100) / 100 }); }
      if (pts.length > 3 && pts[0].x === pts[pts.length - 1].x && pts[0].y === pts[pts.length - 1].y) pts.pop();
      /* an obstruction already drawn over it stands for it */
      c = Gm.latLngToFt(centroid(b.ring).lat, centroid(b.ring).lng, anchor); dupe = false;
      for (j = 0; j < (existing || []).length; j++) {
        e = existing[j];
        if (e && e.type === 'obstruction' && e.pts && Gm.pointInPoly(c.x, c.y, e.pts.map(function (p) { return p; }))) dupe = true;
      }
      if (dupe) continue;
      seen[b.id] = 1;
      out.push({
        type: 'obstruction', layer: 'obstruction', closed: true, pts: pts, label: 'Building',
        building: { id: b.id, heightFt: b.heightFt, use: b.use, areaSqFt: b.areaSqFt, source: b.source, year: b.year }
      });
    }
    return out;
  }
  /* what the status bar says about them */
  function describe(list, source) {
    if (!list.length) return 'No building footprints on this lot in FEMA’s or OpenStreetMap’s data. Draw one with Obstruction.';
    var tall = list.filter(function (b) { return b.heightFt > 0; });
    var first = list[0], bits = [];
    if (first.use) bits.push(first.use.toLowerCase());
    if (first.heightFt > 0) bits.push(Math.round(first.heightFt) + ' ft tall');
    return 'Found ' + list.length + ' building' + (list.length === 1 ? '' : 's') + ' on the lot (' + source + (first.year ? ', ' + first.year : '') + ')' +
      (list.length === 1 && bits.length ? ': ' + bits.join(', ') : '') +
      (tall.length < list.length ? '; ' + (list.length - tall.length) + ' without a height, shown at the default in 3D' : '') +
      '. ' + (list.length === 1 ? 'It is an obstruction' : 'They are obstructions') + ' now: guided builds keep off ' + (list.length === 1 ? 'it' : 'them') + ', and 3D raises ' + (list.length === 1 ? 'it' : 'them') + ' to height.';
  }

  function timed(p, ms) {
    return new Promise(function (resolve, reject) {
      var t = setTimeout(function () { reject(new Error('timeout')); }, ms);
      p.then(function (v) { clearTimeout(t); resolve(v); }, function (e) { clearTimeout(t); reject(e); });
    });
  }
  function femaUrl(bb) {
    var q = { where: '1=1', geometry: [bb.w, bb.s, bb.e, bb.n].join(','), geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects',
      outFields: 'BUILD_ID,OBJECTID,OCC_CLS,PRIM_OCC,HEIGHT,SQFEET,SOURCE,IMAGE_DATE,PROD_DATE', returnGeometry: 'true', outSR: '4326', resultRecordCount: String(MAX), f: 'json' };
    return FEMA + '?' + Object.keys(q).map(function (k) { return k + '=' + encodeURIComponent(q[k]); }).join('&');
  }
  /* The buildings on a lot (a ring of [lat, lng]): FEMA first, else OSM.
     Resolves { buildings, source } or { buildings: [], source: null, reason } */
  function find(lotRing) {
    if (!lotRing || lotRing.length < 3 || typeof fetch !== 'function') return Promise.resolve({ buildings: [], source: null, reason: 'No lot line to look on.' });
    var bb = bboxOf(lotRing);
    return timed(fetch(femaUrl(bb)).then(function (r) { if (!r.ok) throw new Error('fema ' + r.status); return r.json(); }), 20000)
      .then(function (j) { if (j && j.error) throw new Error('fema'); return onLot(parseFema(j), lotRing); })
      .catch(function () { return null; })
      .then(function (fema) {
        if (fema && fema.length) return { buildings: fema, source: 'FEMA USA Structures' };
        var q = '[out:json][timeout:15];way["building"](' + bb.s + ',' + bb.w + ',' + bb.n + ',' + bb.e + ');out geom;';
        return timed(fetch(OSM, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q) })
          .then(function (r) { if (!r.ok) throw new Error('osm ' + r.status); return r.json(); }), 20000)
          .then(function (j) { var l = onLot(parseOsm(j), lotRing); return { buildings: l, source: l.length ? 'OpenStreetMap' : null, reason: l.length ? '' : (fema ? 'none' : 'FEMA did not answer') }; },
            function () { return { buildings: [], source: null, reason: fema ? 'none' : 'Neither FEMA nor OpenStreetMap answered.' }; });
      });
  }

  root.OmegaEditorV2Buildings = { find: find, parseFema: parseFema, parseOsm: parseOsm, onLot: onLot, toEntities: toEntities, describe: describe, femaUrl: femaUrl, VERSION: 'editor-v2-buildings/1' };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.OmegaEditorV2Buildings;
})(typeof window !== 'undefined' ? window : global);
