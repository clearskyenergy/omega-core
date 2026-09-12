/* ═══════════════════════════════════════════════════════════════════════════════
   POST /api/parcel   —  the parcel under a point, as a ring the editor can draw
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Body:   { lat, lng }                       finite numbers, WGS84
   200:    { ok:true, ring:[[lat,lng],...], apn, owner, acres, zoning, county,
             source:'regrid'|'cook'|'dupage'|'lake' }
           { ok:false, reason:'no parcel record here', tried:[...], note? }
   401:    bad or missing Firebase ID token
   400:    lat/lng missing, non-numeric or out of range
   405:    anything but POST

   WHY THIS IS A FUNCTION AND NOT A FETCH FROM THE PAGE. Regrid is a paid,
   per-lookup key: in a page it is in the source, the network tab and every
   tenant's cache. The county ArcGIS layers are free but most send no CORS
   headers, which is why clearsky-sitefinder goes through the Cloudflare worker
   for attributes. The editor needs the polygon, and this is the one place a
   key can live, so both sources sit behind the same token-checked door.

   LOOKUP ORDER. Regrid first when REGRID_TOKEN is set (every county, one
   schema), then whichever county layer's extent contains the point, then an
   honest "no parcel record here". A source that fails — timeout, 5xx, a moved
   layer — is skipped, not reported as "no parcel": the reason stays the same
   and `note` says who did not answer, so the HUD can tell a rural point from
   a county whose GIS is down.

   THE RING IS OPEN. The last vertex is NOT a repeat of the first (ArcGIS and
   GeoJSON both close their rings; that duplicate is stripped here). The caller
   closes it — finishPolyline in the editor repeats the first point itself.

   NOTHING UPSTREAM IS ECHOED. Not the Regrid token (it is only ever inside a
   URL that is never logged), not an upstream error body (a county error page
   or a Regrid 401 text is theirs, not ours), not the URL that was asked.
   ═══════════════════════════════════════════════════════════════════════════════ */
'use strict';
var A = require('./_lib/admin');

var TIMEOUT_MS = 8000;

/* County layers, copied from workers/comed-proxy-worker-v10.js PARCELS. The
   worker is not changed: it is a browser proxy for attributes, this is the
   server asking the same layers for geometry. Keep the two in step when a
   county moves its layer (Cook did in 2026). `owner: null` means the public
   layer carries no owner name at all — Cook's lives on the Assessor feed and
   is not fetched here. No layer is known to carry an acreage field, so acres
   are measured from the ring unless a field turns up (see acresFromAttrs).

   bbox is [south, west, north, east] in degrees, rounded OUTWARD to 0.01 from
   the county extents in the Census TIGER county boundary file. They are a
   cheap pre-test — "could this point be in that county" — not the county line:
   Cook's box contains all of DuPage's and overlaps Lake's southern edge, so a
   point is asked of the tighter boxes first and Cook last, and an empty answer
   from one moves on to the next. Verify a box against the layer's own
   fullExtent (<url>?f=json) before trusting it after a layer move. */
var PARCELS = {
  dupage: {
    url: 'https://gis.dupageco.org/arcgis/rest/services/DuPage_County_IL/ParcelsWithRealEstateCC/MapServer/0',
    idField: 'PIN', owner: 'BILLNAME', label: 'DuPage County',
    bbox: [41.63, -88.27, 42.02, -87.90]
  },
  lake: {
    url: 'https://maps.lakecountyil.gov/arcgis/rest/services/GISMapping/WABParcels/MapServer/12',
    idField: 'pin', owner: 'taxpayer_name', label: 'Lake County',
    bbox: [42.15, -88.20, 42.50, -87.75]
  },
  cook: {
    url: 'https://gis12.cookcountyil.gov/traditional/rest/services/CookViewer3Parcels/MapServer/0',
    idField: 'PIN14_dash', owner: null, label: 'Cook County',
    bbox: [41.46, -88.27, 42.16, -87.52]
  }
};
/* Asked in this order: tightest box first, Cook last (its box holds DuPage). */
var COUNTY_ORDER = ['dupage', 'lake', 'cook'];

var REGRID_POINT = 'https://app.regrid.com/api/v2/parcels/point';
var ACRE_M2 = 4046.8564224;
var EARTH_R = 6371008.8;

/* ── pure helpers (exported below for scripts/tests/tparcel.js) ─────────── */

/* A number, or NaN. Number(null) and Number('') are 0, which would put a
   missing coordinate in the Gulf of Guinea rather than in a 400. */
function num(v) {
  if (typeof v === 'number') return isFinite(v) ? v : NaN;
  if (typeof v === 'string' && /^\s*-?\d+(\.\d+)?\s*$/.test(v)) return Number(v);
  return NaN;
}

function inBox(lat, lng, b) {
  return lat >= b[0] && lat <= b[2] && lng >= b[1] && lng <= b[3];
}

/* Which county layers to ask, in order. Empty means no layer covers the point. */
function countiesAt(lat, lng) {
  var out = [];
  for (var i = 0; i < COUNTY_ORDER.length; i++) {
    if (inBox(lat, lng, PARCELS[COUNTY_ORDER[i]].bbox)) out.push(COUNTY_ORDER[i]);
  }
  return out;
}

/* Validate a ring of [lat,lng], drop the closing duplicate. null if it is not
   a polygon the editor could draw: fewer than three distinct vertices, or any
   vertex that is not a finite coordinate. A partial ring drawn as a boundary
   is worse than no boundary. */
function cleanRing(pts) {
  if (!Array.isArray(pts)) return null;
  var out = [];
  for (var i = 0; i < pts.length; i++) {
    var p = pts[i];
    if (!Array.isArray(p) || p.length < 2) return null;
    var la = num(p[0]), ln = num(p[1]);
    if (!(la >= -90 && la <= 90 && ln >= -180 && ln <= 180)) return null;
    out.push([la, ln]);
  }
  if (out.length > 1) {
    var f = out[0], l = out[out.length - 1];
    if (f[0] === l[0] && f[1] === l[1]) out.pop();
  }
  return out.length >= 3 ? out : null;
}

/* ArcGIS polygon {rings:[[[x,y],...],...]} with outSR=4326 → [[lat,lng],...].
   First ring only: ArcGIS puts the outer ring first and holes after it. A
   multipart parcel (two lots under one PIN) loses its second part here. */
function ringFromEsri(geom) {
  var rings = geom && geom.rings;
  if (!Array.isArray(rings) || !Array.isArray(rings[0])) return null;
  return cleanRing(rings[0].map(function (p) { return Array.isArray(p) ? [p[1], p[0]] : null; }));
}

/* GeoJSON Polygon / MultiPolygon → [[lat,lng],...]. Same first-ring rule. */
function ringFromGeoJson(geom) {
  if (!geom || !geom.coordinates) return null;
  var ring = null;
  if (geom.type === 'Polygon') ring = geom.coordinates[0];
  else if (geom.type === 'MultiPolygon') ring = geom.coordinates[0] && geom.coordinates[0][0];
  if (!Array.isArray(ring)) return null;
  return cleanRing(ring.map(function (p) { return Array.isArray(p) ? [p[1], p[0]] : null; }));
}

/* Shoelace on an equirectangular projection centred on the ring: metres east
   scaled by cos(mean latitude), metres north straight from latitude. Exact
   enough for a parcel — the error is second order in the ring's extent and a
   parcel is a few hundred metres across. Orientation does not matter. */
function ringAcres(ring) {
  if (!Array.isArray(ring) || ring.length < 3) return null;
  var sum = 0, i;
  for (i = 0; i < ring.length; i++) sum += ring[i][0];
  var k = Math.cos((sum / ring.length) * Math.PI / 180);
  var xy = ring.map(function (p) {
    return [EARTH_R * (p[1] * Math.PI / 180) * k, EARTH_R * (p[0] * Math.PI / 180)];
  });
  var a = 0;
  for (i = 0; i < xy.length; i++) {
    var p = xy[i], q = xy[(i + 1) % xy.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  var acres = Math.abs(a) / 2 / ACRE_M2;
  return Math.round(acres * 1000) / 1000;
}

/* First attribute whose NAME matches one of the patterns, in pattern order,
   so an exact name beats a loose one. Layers disagree on schema and none is
   documented; this reads what is there rather than asserting a field. */
function fieldMatching(attrs, patterns) {
  if (!attrs || typeof attrs !== 'object') return undefined;
  var keys = Object.keys(attrs);
  for (var i = 0; i < patterns.length; i++) {
    for (var j = 0; j < keys.length; j++) {
      if (patterns[i].test(keys[j])) return attrs[keys[j]];
    }
  }
  return undefined;
}
function acresFromAttrs(attrs) {
  var v = num(fieldMatching(attrs, [/^(gis_?|ll_gis|calc_?|deed_?)?acres?$/i, /acre/i]));
  return v > 0 ? Math.round(v * 1000) / 1000 : null;
}
function zoningFromAttrs(attrs) {
  var v = fieldMatching(attrs, [/^zoning$/i, /^zone_?(class|code|dist|type)/i, /^zoning_?(code|class|desc)/i]);
  return str(v);
}
function str(v) {
  if (v == null) return null;
  var s = String(v).trim();
  return s ? s : null;
}

/* ArcGIS /query answer → the contract, or null when the layer has no parcel
   under the point. An ArcGIS error travels as 200 {error:{...}}; that is a
   miss here, and the caller's note says the layer did not answer. */
function fromEsri(j, key) {
  var cfg = PARCELS[key];
  if (!cfg || !j || typeof j !== 'object' || j.error) return null;
  var f = Array.isArray(j.features) ? j.features[0] : null;
  if (!f) return null;
  var attrs = f.attributes || {};
  var ring = ringFromEsri(f.geometry);
  if (!ring) return null;
  var fieldAcres = acresFromAttrs(attrs);
  return {
    ok: true,
    ring: ring,
    apn: str(attrs[cfg.idField]),
    owner: cfg.owner ? str(attrs[cfg.owner]) : null,
    acres: fieldAcres != null ? fieldAcres : ringAcres(ring),
    zoning: zoningFromAttrs(attrs),
    county: cfg.label,
    source: key
  };
}

/* Regrid v2 point lookup → the contract. UNVERIFIED AGAINST A LIVE KEY: this
   is written to the documented v2 shape,
     { parcels: { type:'FeatureCollection', features:[ { geometry,
         properties: { fields: { parcelnumb, owner, gisacre, ll_gisacre,
                                 zoning, county, ... } } } ] } }
   and has only been exercised on that fixture. When a key exists, the first
   thing to do is hit the endpoint once and compare. */
function fromRegrid(j) {
  var fc = j && j.parcels;
  var f = fc && Array.isArray(fc.features) ? fc.features[0] : null;
  if (!f) return null;
  var flds = (f.properties && f.properties.fields) || {};
  var ring = ringFromGeoJson(f.geometry);
  if (!ring) return null;
  var acres = num(flds.gisacre) > 0 ? num(flds.gisacre)
            : num(flds.ll_gisacre) > 0 ? num(flds.ll_gisacre) : ringAcres(ring);
  return {
    ok: true,
    ring: ring,
    apn: str(flds.parcelnumb),
    owner: str(flds.owner),
    acres: Math.round(acres * 1000) / 1000,
    zoning: str(flds.zoning),
    county: str(flds.county),
    source: 'regrid'
  };
}

function countyUrl(key, lat, lng) {
  /* lat/lng are validated numbers by the time they get here, so string
     concatenation cannot carry anything but digits. */
  return PARCELS[key].url + '/query?' + [
    'geometry=' + lng + ',' + lat,
    'geometryType=esriGeometryPoint',
    'inSR=4326',
    'spatialRel=esriSpatialRelIntersects',
    'outFields=*',
    'returnGeometry=true',
    'outSR=4326',
    'f=json'
  ].join('&');
}
function regridUrl(lat, lng, token) {
  return REGRID_POINT + '?lat=' + lat + '&lon=' + lng + '&return_geometry=true'
       + '&token=' + encodeURIComponent(token);
}

/* ── upstream ───────────────────────────────────────────────────────────── */

/* One JSON GET with a hard ceiling. The error carries a status or 'timeout'
   and nothing else — the body is never read on a failure, so it cannot be
   passed on by accident. */
function getJson(url, ms) {
  var ctl = new AbortController();
  var timer = setTimeout(function () { ctl.abort(); }, ms);
  return fetch(url, {
    method: 'GET',
    signal: ctl.signal,
    headers: { 'Accept': 'application/json',
               'User-Agent': 'ClearSky-OMEGA parcel (https://clearskyomega.com)' }
  }).then(function (r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }).then(function (j) { clearTimeout(timer); return j; },
          function (err) { clearTimeout(timer); throw err; });
}

/* ── handler ────────────────────────────────────────────────────────────── */

module.exports = A.handler(function (req) {
  if (req.method !== 'POST') throw A.httpError(405, 'POST only');

  return A.authenticate(req).then(function (caller) {
    var b = req.body && typeof req.body === 'object' ? req.body : {};
    var lat = num(b.lat), lng = num(b.lng);
    if (!(lat >= -90 && lat <= 90) || !(lng >= -180 && lng <= 180))
      throw A.httpError(400, 'lat and lng are required as finite numbers (lat -90..90, lng -180..180)');

    var tried = [], notes = [];
    function attempt(name, fn) {
      tried.push(name);
      return fn().catch(function (err) {
        /* The name of the source and whether it timed out — never its body,
           never the URL (the Regrid one has the token in it). */
        var why = err && err.name === 'AbortError' ? 'timed out' : 'did not answer';
        notes.push(name + ' ' + why);
        return null;
      });
    }

    var chain = Promise.resolve(null);
    var token = process.env.REGRID_TOKEN;
    if (token) {
      chain = chain.then(function () {
        return attempt('regrid', function () {
          return getJson(regridUrl(lat, lng, token), TIMEOUT_MS).then(fromRegrid);
        });
      });
    }
    countiesAt(lat, lng).forEach(function (key) {
      chain = chain.then(function (hit) {
        if (hit) return hit;
        return attempt(key, function () {
          return getJson(countyUrl(key, lat, lng), TIMEOUT_MS).then(function (j) { return fromEsri(j, key); });
        });
      });
    });

    return chain.then(function (hit) {
      console.log('[parcel]', caller.orgId, hit ? hit.source : 'none',
                  'at', lat.toFixed(4), lng.toFixed(4), 'tried', tried.join(',') || '-',
                  notes.length ? '(' + notes.join('; ') + ')' : '');
      if (hit) return hit;
      var out = { ok: false, reason: 'no parcel record here', tried: tried };
      if (notes.length) out.note = notes.join('; ');
      return out;
    });
  });
});

/* For scripts/tests/tparcel.js — the pure parts, runnable with no network. */
module.exports._helpers = {
  num: num, countiesAt: countiesAt, cleanRing: cleanRing,
  ringFromEsri: ringFromEsri, ringFromGeoJson: ringFromGeoJson, ringAcres: ringAcres,
  fieldMatching: fieldMatching, acresFromAttrs: acresFromAttrs, zoningFromAttrs: zoningFromAttrs,
  fromEsri: fromEsri, fromRegrid: fromRegrid, countyUrl: countyUrl,
  PARCELS: PARCELS, COUNTY_ORDER: COUNTY_ORDER, TIMEOUT_MS: TIMEOUT_MS
};
