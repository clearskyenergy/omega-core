/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * omega-grid-layers.js — the ONE browser registry for the Grid Atlas
 * substation and transmission layers, and the two basemaps Prime draws.
 *
 * These URLs are the layer list in grid-atlas.html (LAYERS.substations and
 * LAYERS.transmission) and the same mirrors grid-atlas-national.js names
 * SRC.subs and SRC.lines. api/grid-atlas.js reads the same substation pair
 * as SUB_SOURCES. Editor v2 loads this file. Do not paste a second list
 * into a page.
 *
 * This file does not score a site and does not fetch. Scoring stays in
 * /api/grid-atlas, asked through omega-grid-atlas-client.js. Hosting
 * capacity is a different question and is not answered here.
 *
 * The verified date is when the layer list was last checked, not the
 * vintage of a feature. A feature rarely carries its own date; the page
 * stamps when it asked.
 *
 * ES5. No build step.
 */
(function (root) {
  'use strict';

  var VERIFIED = '2026-09-17';

  var SUBSTATIONS = {
    id: 'substations',
    label: 'EIA U.S. Energy Atlas substations (HIFLD mirrors, the Grid Atlas layer list)',
    color: '#c98a2b',
    verified: VERIFIED,
    urls: [
      'https://services5.arcgis.com/HDRa0B57OVrv2E1q/ArcGIS/rest/services/Electric_Substations/FeatureServer/0',
      'https://services.arcgis.com/G4S1dGvn7PIgYd6Y/ArcGIS/rest/services/HIFLD_electric_power_substations/FeatureServer/0',
      'https://disasters.geoplatform.gov/arcgis/rest/services/IEM_Support/r00_energy/MapServer/2'
    ]
  };

  var TRANSMISSION = {
    id: 'transmission',
    label: 'EIA U.S. Energy Atlas transmission lines (the Grid Atlas layer list)',
    color: '#e0533d',
    verified: VERIFIED,
    urls: [
      'https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/US_Electric_Power_Transmission_Lines/FeatureServer/0',
      'https://services5.arcgis.com/HDRa0B57OVrv2E1q/ArcGIS/rest/services/Electric_Power_Transmission_Lines/FeatureServer/0',
      'https://services.arcgis.com/G4S1dGvn7PIgYd6Y/ArcGIS/rest/services/Electric_Power_Transmission_Lines/FeatureServer/0'
    ]
  };

  var BASEMAPS = {
    dark: {
      id: 'dark',
      label: 'Esri Dark Gray Canvas',
      tiles: [
        { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', maxZoom: 16, attribution: '© Esri' },
        { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', maxZoom: 16, attribution: '© Esri' }
      ]
    },
    satellite: {
      id: 'satellite',
      label: 'Esri World Imagery',
      tiles: [
        { url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', maxZoom: 21, maxNativeZoom: 19, attribution: 'Imagery © Esri' }
      ]
    }
  };

  function layer(id) {
    if (id === 'substations') return SUBSTATIONS;
    if (id === 'transmission') return TRANSMISSION;
    return null;
  }

  function num(v) {
    var n = +v;
    return isFinite(n) ? n : null;
  }

  /* HIFLD writes "unknown" as a large negative. A blank stays blank. */
  function kv(v) {
    var n = num(v);
    return n != null && n > 0 && n < 1000 ? n : null;
  }

  function envelope(lat, lng, deg) {
    var d = deg == null ? 0.12 : +deg;
    return JSON.stringify({
      xmin: lng - d, ymin: lat - d * 0.75, xmax: lng + d, ymax: lat + d * 0.75,
      spatialReference: { wkid: 4326 }
    });
  }

  /* One query URL per mirror, in the order Grid Atlas tries them. */
  function queryUrls(id, lat, lng, deg) {
    var src = layer(id);
    var geom = encodeURIComponent(envelope(lat, lng, deg));
    var q = '/query?f=json&where=1%3D1&outFields=*&returnGeometry=true&outSR=4326'
      + '&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects'
      + '&resultRecordCount=400&geometry=' + geom;
    if (!src) return [];
    return src.urls.map(function (u) { return u + q; });
  }

  function pointOf(g) {
    if (!g) return null;
    if (g.y != null && g.x != null && isFinite(+g.y) && isFinite(+g.x)) return { lat: +g.y, lng: +g.x };
    return null;
  }

  function pathsOf(g) {
    if (!g || !g.paths) return [];
    var out = [], i, j, p, line;
    for (i = 0; i < g.paths.length; i++) {
      p = g.paths[i];
      line = [];
      for (j = 0; j < p.length; j++) {
        if (p[j] && p[j].length >= 2 && isFinite(+p[j][0]) && isFinite(+p[j][1])) line.push([+p[j][1], +p[j][0]]);
      }
      if (line.length > 1) out.push(line);
    }
    return out;
  }

  function substationOf(feature, src) {
    var a = (feature && feature.attributes) || {};
    var p = pointOf(feature && feature.geometry);
    if (!p) return null;
    src = src || SUBSTATIONS;
    return {
      name: a.NAME || a.name || a.SUBSTATION || 'Substation',
      kv: kv(a.MAX_VOLT) || kv(a.VOLTAGE) || kv(a.max_volt),
      minkv: kv(a.MIN_VOLT),
      lines: a.LINES == null || a.LINES === '' ? null : a.LINES,
      status: a.STATUS || '',
      owner: a.OWNER || a.UTILITY || '',
      lat: p.lat,
      lng: p.lng,
      source: src.label,
      sourceId: src.id,
      registryVerified: src.verified
    };
  }

  function substationsOf(json, src) {
    var features = json && json.features;
    var out = [], i, row;
    if (!features) return out;
    for (i = 0; i < features.length; i++) {
      row = substationOf(features[i], src);
      if (row) out.push(row);
    }
    return out;
  }

  function transmissionOf(json) {
    var features = json && json.features;
    var out = [], i, paths;
    if (!features) return out;
    for (i = 0; i < features.length; i++) {
      paths = pathsOf(features[i] && features[i].geometry);
      if (paths.length) out.push({ paths: paths, source: TRANSMISSION.label, sourceId: TRANSMISSION.id, registryVerified: TRANSMISSION.verified });
    }
    return out;
  }

  /* Grid Atlas treats 69 kV and above as transmission and a published
     voltage under that as distribution (grid-atlas.html, the available-
     power band). A blank voltage stays a line: it is not labeled either. */
  function lineKind(voltage) {
    if (voltage == null) return 'line';
    if (voltage >= 69) return 'transmission';
    return 'distribution';
  }

  function lineOf(feature) {
    var a = (feature && feature.attributes) || {};
    var paths = pathsOf(feature && feature.geometry);
    var voltage, id;
    if (!paths.length) return null;
    voltage = kv(a.VOLTAGE) || kv(a.VOLT_CLASS) || kv(a.MAX_VOLT);
    id = a.ID || a.OBJECTID || a.objectid;
    return {
      paths: paths,
      kv: voltage,
      kind: lineKind(voltage),
      owner: a.OWNER || a.SUB_1 || '',
      name: a.OWNER || a.SUB_1 || (lineKind(voltage) === 'distribution' ? 'Distribution line' : (lineKind(voltage) === 'transmission' ? 'Transmission line' : 'Line')),
      id: id == null || id === '' ? '' : String(id),
      source: TRANSMISSION.label,
      sourceId: TRANSMISSION.id,
      registryVerified: TRANSMISSION.verified
    };
  }

  function linesOf(json) {
    var features = json && json.features;
    var out = [], i, row;
    if (!features) return out;
    for (i = 0; i < features.length; i++) {
      row = lineOf(features[i]);
      if (row) out.push(row);
    }
    return out;
  }

  var api = {
    VERIFIED: VERIFIED,
    SUBSTATIONS: SUBSTATIONS,
    TRANSMISSION: TRANSMISSION,
    BASEMAPS: BASEMAPS,
    layer: layer,
    basemap: function (id) { return BASEMAPS[id] || null; },
    queryUrls: queryUrls,
    substationOf: substationOf,
    substationsOf: substationsOf,
    transmissionOf: transmissionOf,
    lineKind: lineKind,
    lineOf: lineOf,
    linesOf: linesOf,
    VERSION: 'omega-grid-layers/1'
  };
  root.OmegaGridLayers = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : global);
