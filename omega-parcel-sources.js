/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * omega-parcel-sources.js — the ONE list of public parcel layers.
 *
 * Google's Maps JavaScript API publishes no parcel layer: the property lines
 * in the consumer Maps app are not offered to developers. Lines come from the
 * people who keep them, county and state assessors, and most publish an
 * ArcGIS MapServer. This file names the ones verified to answer, and is read
 * by both of their users:
 *
 *   editor.html      View › Parcel Lines draws each layer's lines on the live
 *                    Google map as an ImageMapType (the browser asks the
 *                    county for a picture of a tile; no key, nothing
 *                    confidential, Google owns tiling and panning).
 *   api/parcel.js    the server's point lookup asks a `lookup` layer for the
 *                    one parcel under a point (geometry and owner), after
 *                    Regrid when the tenant's plan carries it.
 *
 * Cook County moved its layer in 2026. Two copies of a URL drift and the
 * stale one is the one somebody is looking at, so a county that moves is
 * fixed HERE. workers/comed-proxy-worker-v10.js keeps its own attribute copy
 * for the browser proxy (Cloudflare cannot require this file); keep it in
 * step when a layer moves.
 *
 * Before adding a layer: ask `<service>?f=json` for the layer id and its
 * minScale, then `<service>/export?...` for one tile where parcels are known
 * to be (scripts/tests/tparcellines.js checks the shape; it cannot check the
 * network). A layer drawn below its minScale comes back as an empty picture,
 * which is why each one carries the zoom it starts drawing at.
 *
 * bbox is [south, west, north, east] in degrees, rounded OUTWARD. It is a
 * cheap pre-test, "could this tile or point be in that county", not the
 * county line: boxes overlap (Cook's holds all of DuPage's), and a tile in
 * two boxes is asked of both; the one it is not in answers transparent.
 *
 * Reference only: an assessor's line is a tax map, not a survey. Every
 * screen that draws one says so.
 *
 * ES5, no dependencies; UMD so api/ and the tests can require it. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OmegaParcelSources = factory();
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  /* Verified 2026-10-02: each service answered ?f=json and drew lines on an
     export tile at a known parcel. `lineLayer` is the layer drawn on the map;
     `restyle` means the service accepts dynamicLayers, so it is drawn in the
     one line style below with its labels off (Cook's own style is dark blue
     with a PIN on every lot, unreadable on satellite). Lake County does not
     accept dynamicLayers and its own line layer (11, "Tax Parcel Lines") is a
     bright cyan that reads on imagery as it is.
     `lookup` is what api/parcel.js asks for the parcel under a point: the
     polygon layer, its id and owner fields (owner null: the public layer
     carries none), and the county name the answer reports. */
  var SOURCES = [
    { id: 'dupage', label: 'DuPage County, IL',
      service: 'https://gis.dupageco.org/arcgis/rest/services/DuPage_County_IL/ParcelsWithRealEstateCC/MapServer',
      lineLayer: 0, restyle: true, minZoom: 15,
      bbox: [41.63, -88.27, 42.02, -87.90],
      lookup: { layer: 0, idField: 'PIN', owner: 'BILLNAME', county: 'DuPage County' } },
    { id: 'lake', label: 'Lake County, IL',
      service: 'https://maps.lakecountyil.gov/arcgis/rest/services/GISMapping/WABParcels/MapServer',
      lineLayer: 11, restyle: false, minZoom: 15,
      bbox: [42.15, -88.20, 42.50, -87.75],
      lookup: { layer: 12, idField: 'pin', owner: 'taxpayer_name', county: 'Lake County' } },
    { id: 'cook', label: 'Cook County, IL',
      service: 'https://gis12.cookcountyil.gov/traditional/rest/services/CookViewer3Parcels/MapServer',
      lineLayer: 0, restyle: true, minZoom: 16,
      bbox: [41.46, -88.27, 42.16, -87.52],
      lookup: { layer: 0, idField: 'PIN14_dash', owner: null, county: 'Cook County' } },
    /* Ameren territory. Added 2026-10-03 for a customer's site at 107 Cass
       St, Peoria: "Parcels" in the county's Cadastral service (minScale
       10000, so from z16), PIN and owner_name on each lot. */
    { id: 'peoria', label: 'Peoria County, IL',
      service: 'https://gis.peoriacounty.gov/arcgis/rest/services/DP/Cadastral/MapServer',
      lineLayer: 1, restyle: true, minZoom: 16,
      bbox: [40.54, -90.00, 41.02, -89.44],
      lookup: { layer: 1, idField: 'PIN', owner: 'owner_name', county: 'Peoria County' } },
    /* "Parcels_LY": the county's published basemap parcels. */
    { id: 'will', label: 'Will County, IL',
      service: 'https://gis.willcountyillinois.com/hosting/rest/services/Basemap/Parcels_LY_DV/MapServer',
      lineLayer: 1, restyle: true, minZoom: 15,
      bbox: [41.19, -88.27, 41.73, -87.52] },
    { id: 'nc', label: 'North Carolina (statewide)',
      service: 'https://services.nconemap.gov/secure/rest/services/NC1Map_Parcels/MapServer',
      lineLayer: 1, restyle: true, minZoom: 14,
      bbox: [33.84, -84.33, 36.59, -75.45] },
    { id: 'nj', label: 'New Jersey (statewide)',
      service: 'https://maps.nj.gov/arcgis/rest/services/Framework/Cadastral/MapServer',
      lineLayer: 0, restyle: true, minZoom: 14,
      bbox: [38.92, -75.57, 41.36, -73.88] },
    /* The state publishes only the counties that agreed to share: Erie,
       Onondaga, Albany and Tompkins draw; Monroe and Saratoga do not. */
    { id: 'ny', label: 'New York (participating counties)',
      service: 'https://gisservices.its.ny.gov/arcgis/rest/services/NYS_Tax_Parcels_Public/MapServer',
      lineLayer: 1, restyle: true, minZoom: 14,
      bbox: [40.49, -79.77, 45.02, -71.79] },
    { id: 'de', label: 'Delaware (statewide)',
      service: 'https://enterprise.firstmap.delaware.gov/arcgis/rest/services/PlanningCadastre/DE_StateParcels/MapServer',
      lineLayer: 0, restyle: true, minZoom: 15,
      bbox: [38.45, -75.79, 39.84, -75.04] }
  ];

  /* The server asks these for the parcel under a point, in this order:
     tightest box first, Cook last (its box holds DuPage's). */
  var LOOKUP_ORDER = ['dupage', 'lake', 'peoria', 'cook'];

  /* One line style for every layer that takes one: a warm yellow that reads
     on satellite and on the light basemap, never an editor colour. */
  var LINE_RGBA = [255, 214, 10, 255];
  var LINE_WIDTH = 1.5;

  var MERC = 20037508.342789244;

  function byId(id) {
    for (var i = 0; i < SOURCES.length; i++) if (SOURCES[i].id === id) return SOURCES[i];
    return null;
  }

  /* An XYZ tile → its EPSG:3857 box [minX, minY, maxX, maxY], which is what
     ArcGIS export wants. */
  function tileBbox(x, y, z) {
    var span = (2 * MERC) / Math.pow(2, z);
    var minX = -MERC + x * span, maxY = MERC - y * span;
    return [minX, maxY - span, minX + span, maxY];
  }

  function latOfY(y) { return (2 * Math.atan(Math.exp(y / 6378137)) - Math.PI / 2) * 180 / Math.PI; }
  function lngOfX(x) { return x / 6378137 * 180 / Math.PI; }

  /* The same tile as [south, west, north, east] in degrees. */
  function tileBox(x, y, z) {
    var b = tileBbox(x, y, z);
    return [latOfY(b[1]), lngOfX(b[0]), latOfY(b[3]), lngOfX(b[2])];
  }

  function overlaps(a, b) {
    return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
  }

  function contains(b, lat, lng) {
    return lat >= b[0] && lat <= b[2] && lng >= b[1] && lng <= b[3];
  }

  /* The layers whose box holds a point. */
  function at(lat, lng) {
    var out = [];
    for (var i = 0; i < SOURCES.length; i++) if (contains(SOURCES[i].bbox, lat, lng)) out.push(SOURCES[i]);
    return out;
  }

  /* The layers whose box touches a view [south, west, north, east]. */
  function within(box) {
    var out = [];
    for (var i = 0; i < SOURCES.length; i++) if (overlaps(SOURCES[i].bbox, box)) out.push(SOURCES[i]);
    return out;
  }

  /* dynamicLayers: the source's own line layer, outline only, labels off. */
  function lineStyle(layerId) {
    return JSON.stringify([{
      id: layerId,
      source: { type: 'mapLayer', mapLayerId: layerId },
      drawingInfo: {
        showLabels: false,
        renderer: { type: 'simple', symbol: {
          type: 'esriSFS', style: 'esriSFSNull',
          outline: { type: 'esriSLS', style: 'esriSLSSolid', color: LINE_RGBA, width: LINE_WIDTH } } }
      }
    }]);
  }

  /* The picture of one tile of one layer, or null when there is nothing to
     ask for: a row off the world, a zoom the layer does not draw at, or a
     tile outside the layer's box. Google asks for tiles past the date line at
     low zoom, so x is wrapped. */
  function tileUrl(src, x, y, z) {
    if (!src || !(z >= 0)) return null;
    var n = Math.pow(2, z);
    if (y < 0 || y >= n) return null;
    if (z < (src.minZoom || 0)) return null;
    x = ((x % n) + n) % n;
    if (!overlaps(src.bbox, tileBox(x, y, z))) return null;
    var bb = tileBbox(x, y, z);
    var which = src.restyle
      ? 'dynamicLayers=' + encodeURIComponent(lineStyle(src.lineLayer))
      : 'layers=' + encodeURIComponent('show:' + src.lineLayer);
    return src.service + '/export'
      + '?bbox=' + bb.join('%2C')
      + '&bboxSR=3857&imageSR=3857&size=256%2C256'
      + '&' + which
      + '&format=png32&transparent=true&f=image';
  }

  /* What api/parcel.js reads as its PARCELS: key → { url, idField, owner,
     label, bbox }, url being the polygon layer it queries. */
  function lookupLayers() {
    var out = {};
    for (var i = 0; i < LOOKUP_ORDER.length; i++) {
      var s = byId(LOOKUP_ORDER[i]);
      out[s.id] = { url: s.service + '/' + s.lookup.layer, idField: s.lookup.idField,
                    owner: s.lookup.owner, label: s.lookup.county, bbox: s.bbox.slice() };
    }
    return out;
  }

  /* A point inside a ring of [lat, lng]: even-odd ray casting. */
  function inRing(ring, lat, lng) {
    if (!ring || ring.length < 3) return false;
    var inside = false;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      var yi = ring[i][0], xi = ring[i][1], yj = ring[j][0], xj = ring[j][1];
      if ((yi > lat) !== (yj > lat) && lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  return {
    SOURCES: SOURCES, LOOKUP_ORDER: LOOKUP_ORDER, LINE_RGBA: LINE_RGBA, LINE_WIDTH: LINE_WIDTH,
    byId: byId, at: at, within: within, tileBbox: tileBbox, tileBox: tileBox,
    tileUrl: tileUrl, lineStyle: lineStyle, lookupLayers: lookupLayers, inRing: inRing
  };
});
