/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/portfolio/structures.js — the building footprints on a lot, for
   the site assessment's space analysis
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   FEMA's USA Structures (every US structure over about 450 sq ft, a public
   service), asked for the lot's own box, keeping the buildings whose middle
   is on the lot. The same service and the same query Omega Maximus asks from
   the browser (omega-editor-v2-buildings.js): NO paging parameter, which the
   service has not answered since 2026-11. Read, never invented: a service
   that does not answer is said ({ ok:false, reason }), never "no buildings".
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var FEMA = 'https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/USA_Structures_View/FeatureServer/0/query';
var WAIT_MS = 12000, MAX = 200;

function boxOf(ring) {
  var b = { s: Infinity, w: Infinity, n: -Infinity, e: -Infinity };
  ring.forEach(function (p) { if (p[0] < b.s) b.s = p[0]; if (p[0] > b.n) b.n = p[0]; if (p[1] < b.w) b.w = p[1]; if (p[1] > b.e) b.e = p[1]; });
  var pad = 0.00005; return { s: b.s - pad, w: b.w - pad, n: b.n + pad, e: b.e + pad };
}
function centroid(ring) { var x = 0, y = 0; ring.forEach(function (p) { y += p[0]; x += p[1]; }); return { lat: y / ring.length, lng: x / ring.length }; }
function inRing(lat, lng, ring) {
  var inside = false;
  for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    var yi = ring[i][0], xi = ring[i][1], yj = ring[j][0], xj = ring[j][1];
    if ((yi > lat) !== (yj > lat) && lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function url(bb) {
  var q = { where: '1=1', geometry: [bb.w, bb.s, bb.e, bb.n].join(','), geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects',
    outFields: 'BUILD_ID,OBJECTID,SQFEET', returnGeometry: 'true', outSR: '4326', f: 'json' };
  return FEMA + '?' + Object.keys(q).map(function (k) { return k + '=' + encodeURIComponent(q[k]); }).join('&');
}
/* the service's answer → the buildings on the lot, each a ring of [lat, lng] */
function parse(json, lot) {
  var out = [], f = (json && json.features) || [];
  for (var i = 0; i < f.length && out.length < MAX; i++) {
    var g = f[i].geometry || {}, r = g.rings && g.rings[0], a = f[i].attributes || {};
    if (!r || r.length < 4) continue;
    var ring = r.map(function (p) { return [+p[1], +p[0]]; });
    if (ring.some(function (p) { return !isFinite(p[0]) || !isFinite(p[1]); })) continue;
    var c = centroid(ring); if (!inRing(c.lat, c.lng, lot)) continue;
    out.push({ ring: ring, sqFt: +a.SQFEET > 0 ? Math.round(+a.SQFEET) : null });
  }
  return out;
}
/* lot: [[lat,lng],…]. fetchFn: the deployment's fetch (a test hands its own). */
function find(lot, fetchFn) {
  if (!Array.isArray(lot) || lot.length < 3) return Promise.resolve({ ok: false, reason: 'no lot outline to look under' });
  var f = fetchFn || (typeof fetch === 'function' ? fetch : null);
  if (!f) return Promise.resolve({ ok: false, reason: 'no network in this runtime' });
  var ctl = typeof AbortController === 'function' ? new AbortController() : null, timer = null;
  var wait = new Promise(function (_, reject) { timer = setTimeout(function () { if (ctl) ctl.abort(); reject(new Error('timeout')); }, WAIT_MS); });
  return Promise.race([f(url(boxOf(lot)), ctl ? { signal: ctl.signal } : undefined).then(function (r) { if (!r.ok) throw new Error('status ' + r.status); return r.json(); }), wait])
    .then(function (j) { if (j && j.error) throw new Error('the service refused the query'); return { ok: true, list: parse(j, lot), source: 'FEMA USA Structures' }; })
    .catch(function (e) { return { ok: false, reason: 'FEMA USA Structures did not answer (' + String(e && e.message || e).slice(0, 60) + ')' }; })
    .then(function (v) { clearTimeout(timer); return v; });
}

module.exports = { find: find, parse: parse, url: url, boxOf: boxOf, WAIT_MS: WAIT_MS };
