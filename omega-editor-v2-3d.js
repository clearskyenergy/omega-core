/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * omega-editor-v2-3d.js — one-click 3D of a Site Plan.
 *
 * The plan stays a plan. This file does not draw on the 2D canvas, and it
 * does not keep a second copy of the design. Open and sync both read the
 * document the editor just drew: arrays, equipment, conduit, trenches and
 * lines. The page adds one button and the 3D command; everything else lives
 * here and is removed when the view closes.
 *
 * STACK. The picture is ours: a small WebGL scene, USGS 3DEP elevation
 * (no key), Esri World Imagery draped on that mesh, and OpenStreetMap
 * buildings. Equipment is true-scale and sits on the sampled ground.
 * Vertical scale is 1: one foot of USGS relief is one foot on the plan.
 * Exaggeration is a slider that starts off and never changes the slope
 * percents.
 * Cesium, deck.gl and MapLibre were the other candidates. Cesium World
 * Terrain and Google's photorealistic tiles are the prettier mesh, and
 * both need a paid key before they show anything; deck.gl and MapLibre
 * want a bundler this repo does not have. The free scene is the view a
 * rep gets. Google's tiles are an optional upgrade behind
 * GOOGLE_MAP_TILES_API_KEY, proxied so the key never ships in the page.
 * A Cesium ion token is not required. USGS 3DEP is the elevation.
 *
 * CIVIL. civilOf() is the screening the Run CIVIL section reads: level-pad
 * cut and fill about the mean, and trench length over the terrain. It is
 * a screen, not a grading plan. Dollars on a component card use the same
 * server cost engine (solar band, storage split) and are labelled screening.
 *
 * If WebGL or the elevation service is missing, the same scene draws as
 * hillshade and extruded models. Nothing here invents an elevation.
 */
(function (root) {
  'use strict';

  var G, D;
  var FT_PER_M = 3.280839895;

  /* Screening slope limits, percent. Same idea as the Site Map grading
     check: a poured pad is tighter than a tracker row. Not a manufacturer limit. */
  var SLOPE_LIMIT = {
    bess: 2, pcs: 2, transformer: 2, meter: 2, poi: 2, switchgear: 2,
    charger: 5, array: 10, tracker: 15, building: 100, fence: 100, conduit: 100
  };

  /* Vertical size, feet. The plan's w/h is the footprint; this is the height. */
  var MODEL = {
    bess:        { h: 9.5, color: '#0F766E', cap: '#115E59', label: 'Battery' },
    pcs:         { h: 8.2, color: '#334155', cap: '#1E293B', label: 'PCS' },
    transformer: { h: 8.5, color: '#57534E', cap: '#44403C', label: 'Transformer' },
    meter:       { h: 6.0, color: '#E7E5E4', cap: '#A8A29E', label: 'Meter' },
    poi:         { h: 8.0, color: '#1F4E79', cap: '#163A5C', label: 'Point of interconnection' },
    switchgear:  { h: 9.0, color: '#1E3A5F', cap: '#0F2744', label: 'Switchgear' },
    charger:     { h: 7.2, color: '#1F2937', cap: '#D97706', label: 'EV charger' },
    bollard:     { h: 3.5, color: '#B45309', cap: '#B45309', label: 'Bollard' }
  };

  /* The first public mirror Grid Atlas and omega-grid-infra.js both try.
     Scoring stays in /api/grid-atlas. This only places what that service,
     or the same mirror, already publishes. */
  var SUB_LAYER = 'https://services5.arcgis.com/HDRa0B57OVrv2E1q/ArcGIS/rest/services/Electric_Substations/FeatureServer/0';
  var LINE_LAYER = 'https://services2.arcgis.com/FiaPA4ga0iQKduv3/arcgis/rest/services/US_Electric_Power_Transmission_Lines/FeatureServer/0';
  var ELEV_URL = 'https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/getSamples';
  var IMG_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/';
  var CESIUM_JS = 'https://cdn.jsdelivr.net/npm/cesium@1.114.0/Build/Cesium/Cesium.js';
  var CESIUM_CSS = 'https://cdn.jsdelivr.net/npm/cesium@1.114.0/Build/Cesium/Widgets/widgets.css';

  function libs() {
    if (!G) G = root.OmegaEditorV2Geom || (typeof require === 'function' ? require('./omega-editor-v2-geom.js') : null);
    if (!D) D = root.OmegaEditorV2Doc || (typeof require === 'function' ? require('./omega-editor-v2-doc.js') : null);
    return !!(G && D);
  }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function finite(n) { return typeof n === 'number' && isFinite(n); }
  function hex(h) {
    h = String(h || '#888888').replace('#', '');
    if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
    return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
  }
  function mix(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }
  function sub3(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }
  function len3(a) { return Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]); }
  function hypot(a, b) { return Math.sqrt(a * a + b * b); }
  function norm3(a) {
    var l = len3(a);
    if (l < 1e-8) return [0, 1, 0];
    return [a[0] / l, a[1] / l, a[2] / l];
  }
  function triNormal(a, b, c) { return norm3(cross(sub3(b, a), sub3(c, a))); }
  function dot3(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

  function cfOf(mount) {
    if (!libs() || !G.PRESETS) return 0.18;
    var p = G.PRESETS[mount] || G.PRESETS['fixed-ground'];
    return p && p.cf ? p.cf : 0.18;
  }
  function tiltDeg(mount, lat) {
    if (mount === 'rooftop') return 10;
    if (mount === 'carport') return 5;
    if (mount === 'tracker-1ax') return 0;
    return Math.round(clamp(Math.abs(+lat || 33) * 0.76, 10, 35));
  }
  function trackerTilt(sun) {
    if (!sun || !(sun.altitude > 0)) return 0;
    var az = sun.azimuth * Math.PI / 180;
    var alt = sun.altitude * Math.PI / 180;
    var deg = Math.atan2(Math.sin(az) * Math.cos(alt), Math.sin(alt)) * 180 / Math.PI;
    return clamp(deg, -55, 55);
  }

  /* NOAA-style solar position. Azimuth is degrees clockwise from north.
     Accurate enough for a shading check, not a survey. */
  function sunPosition(lat, lng, date) {
    var rad = Math.PI / 180;
    var when = date instanceof Date ? date : new Date(date || Date.now());
    var n = when.getTime() / 86400000 + 2440587.5 - 2451545.0;
    var L = (280.460 + 0.9856474 * n) % 360;
    var g = (357.528 + 0.9856003 * n) % 360;
    if (L < 0) L += 360;
    if (g < 0) g += 360;
    var lambda = L + 1.915 * Math.sin(g * rad) + 0.020 * Math.sin(2 * g * rad);
    var eps = 23.439 - 0.0000004 * n;
    var dec = Math.asin(Math.sin(eps * rad) * Math.sin(lambda * rad));
    var ra = Math.atan2(Math.cos(eps * rad) * Math.sin(lambda * rad), Math.cos(lambda * rad));
    var gmst = (280.46061837 + 360.98564736629 * n) % 360;
    if (gmst < 0) gmst += 360;
    var ha = ((gmst + lng) * rad) - ra;
    var latr = lat * rad;
    var alt = Math.asin(Math.sin(latr) * Math.sin(dec) + Math.cos(latr) * Math.cos(dec) * Math.cos(ha));
    var az = Math.atan2(-Math.sin(ha), Math.tan(dec) * Math.cos(latr) - Math.sin(latr) * Math.cos(ha));
    var azDeg = az / rad;
    if (azDeg < 0) azDeg += 360;
    return { altitude: alt / rad, azimuth: azDeg };
  }
  function sunVector(sun) {
    var alt = (sun && finite(sun.altitude) ? sun.altitude : 45) * Math.PI / 180;
    var az = (sun && finite(sun.azimuth) ? sun.azimuth : 180) * Math.PI / 180;
    var c = Math.cos(alt);
    if (sun && sun.altitude <= 0) return [0, 1, 0];
    return norm3([Math.sin(az) * c, Math.sin(alt), Math.cos(az) * c]);
  }
  function shadowOffset(above, sun) {
    if (!sun || !(sun.altitude > 2) || !(above > 0)) return { x: 0, z: 0 };
    var alt = sun.altitude * Math.PI / 180;
    var az = sun.azimuth * Math.PI / 180;
    var t = Math.tan(alt);
    if (t < 0.08) t = 0.08;
    return { x: -above * Math.sin(az) / t, z: -above * Math.cos(az) / t };
  }

  function layerOn(doc, id) {
    var layer = D.layerById(doc, id);
    return !layer || layer.visible !== false;
  }
  function ringBBox(ring) {
    var i, minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (i = 0; i < ring.length; i++) {
      if (ring[i].x < minX) minX = ring[i].x;
      if (ring[i].y < minY) minY = ring[i].y;
      if (ring[i].x > maxX) maxX = ring[i].x;
      if (ring[i].y > maxY) maxY = ring[i].y;
    }
    return { minX: minX, minY: minY, maxX: maxX, maxY: maxY, w: maxX - minX, h: maxY - minY,
      cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
  }

  function sceneOf(doc) {
    if (!libs()) throw new Error('The drawing libraries did not load.');
    doc = doc || D.create();
    var objects = [], tables = [], lines = [], prisms = [], i, e, lay, model, bb;
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    function grow(x, y) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    function growRing(ring) {
      var k;
      for (k = 0; k < ring.length; k++) grow(ring[k].x, ring[k].y);
    }
    for (i = 0; i < (doc.entities || []).length; i++) {
      e = doc.entities[i];
      if (!e || !layerOn(doc, e.layer)) continue;
      if (e.type === 'array') {
        lay = D.arrayLayout(doc, e);
        if (!lay || !lay.ok) continue;
        var mount = lay.presetKey || e.mount || 'fixed-ground';
        var arr = {
          id: e.id, kind: 'array', key: 'array', label: 'Array',
          mount: mount, tilt: tiltDeg(mount, doc.anchor && doc.anchor.lat),
          kw: lay.kw, kwh: 0, tables: lay.tableCount, modules: lay.moduleCount,
          rows: lay.rowCount, pitchFt: lay.pitchFt, gcr: lay.gcr,
          cf: cfOf(mount), color: '#2C5FA8'
        };
        var t, host = e.boundaryId ? D.find(doc, e.boundaryId) : null;
        var hostRing = host ? G.ringOf(host) : null;
        if (hostRing) {
          bb = ringBBox(hostRing);
          arr.x = bb.cx; arr.y = bb.cy; arr.w = bb.w; arr.d = bb.h;
          arr.ring = hostRing;
          growRing(hostRing);
        }
        objects.push(arr);
        if (!lay.densityOnly) {
          for (t = 0; t < lay.tables.length; t++) {
            tables.push({
              arrayId: e.id,
              x: lay.tables[t].x + lay.tables[t].w / 2,
              y: lay.tables[t].y + lay.tables[t].h / 2,
              w: lay.tables[t].w, d: lay.tables[t].h,
              mount: mount, tilt: arr.tilt
            });
          }
        }
      } else if (e.type === 'equip') {
        model = MODEL[e.key] || { h: 6, color: '#475569', cap: '#334155', label: e.label || e.key || 'Equipment' };
        objects.push({
          id: e.id, kind: 'equip', key: e.key || 'equip',
          label: e.label || model.label,
          x: +e.x || 0, y: +e.y || 0,
          w: e.w > 0 ? +e.w : 4, d: e.h > 0 ? +e.h : 4, h: model.h,
          rot: +e.rot || 0, kw: +e.kw || 0, kwh: +e.kwh || 0,
          color: model.color, cap: model.cap
        });
        grow((+e.x || 0) - (e.w || 4) / 2, (+e.y || 0) - (e.h || 4) / 2);
        grow((+e.x || 0) + (e.w || 4) / 2, (+e.y || 0) + (e.h || 4) / 2);
      } else if (e.type === 'obstruction' || e.type === 'polygon' || e.type === 'rect' || e.type === 'setback' || e.type === 'fence' || e.type === 'polyline' || e.type === 'conduit' || e.type === 'line') {
        var ring = G.ringOf(e);
        var pts = e.pts ? e.pts.slice() : (e.a && e.b ? [e.a, e.b] : null);
        if (e.type === 'obstruction' && ring) {
          bb = ringBBox(ring);
          var name = 'Obstruction', c;
          for (c = 0; c < doc.entities.length; c++) {
            var note = doc.entities[c];
            if (note.type === 'callout' && note.target && G.pointInPoly(note.target.x, note.target.y, ring) && note.text) name = note.text;
          }
          prisms.push({ id: e.id, kind: 'building', label: name, ring: ring, h: /building/i.test(name) ? 18 : 12, color: '#C4B49A' });
          growRing(ring);
        } else if ((e.type === 'polygon' || e.type === 'rect') && ring && e.layer === 'site') {
          lines.push({ id: e.id, kind: 'parcel', pts: ring.concat([ring[0]]), color: '#1F4E79' });
          growRing(ring);
        } else if (e.type === 'setback' && pts) {
          lines.push({ id: e.id, kind: 'setback', pts: e.closed ? pts.concat([pts[0]]) : pts, color: '#B45309' });
        } else if (e.type === 'fence' && pts) {
          lines.push({ id: e.id, kind: 'fence', pts: pts, color: '#57534E', h: 6 });
          objects.push({ id: e.id, kind: 'fence', key: 'fence', label: 'Fence', pts: pts, h: 6, color: '#57534E' });
        } else if ((e.type === 'conduit' || e.type === 'polyline' || e.type === 'line') && pts && pts.length > 1) {
          lines.push({ id: e.id, kind: e.type === 'conduit' ? 'conduit' : 'line', pts: pts, spec: e.spec || '', color: e.type === 'conduit' ? '#6D28D9' : '#1F4E79' });
          if (e.type === 'conduit') objects.push({ id: e.id, kind: 'conduit', key: 'conduit', label: 'Conduit', pts: pts, spec: e.spec || 'RMC', color: '#6D28D9' });
        }
      }
    }
    if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 100; maxY = 80; }
    var customer = doc.assignment && (doc.assignment.customerName || doc.assignment.customerId);
    return {
      name: doc.name || 'Site',
      address: doc.address || '',
      anchor: doc.anchor || { lat: 0, lng: 0 },
      hasCustomer: !!customer,
      bounds: { minX: minX, minY: minY, maxX: maxX, maxY: maxY, w: maxX - minX, h: maxY - minY,
        cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 },
      objects: objects,
      tables: tables,
      lines: lines,
      prisms: prisms
    };
  }

  function gridFrom(spec) {
    spec = spec || {};
    var n = spec.n > 1 ? spec.n : 2;
    var z = [], j, i, row;
    for (j = 0; j < n; j++) {
      row = [];
      for (i = 0; i < n; i++) row.push(+spec.z(i, j));
      z.push(row);
    }
    return {
      n: n, minX: spec.minX, minY: spec.minY, maxX: spec.maxX, maxY: spec.maxY,
      z: z, source: spec.source || 'usgs-3dep', datum: spec.datum
    };
  }
  function gridDatum(grid) {
    if (finite(grid.datum)) return grid.datum;
    var m = Infinity, j, i;
    for (j = 0; j < grid.n; j++) for (i = 0; i < grid.n; i++) if (finite(grid.z[j][i]) && grid.z[j][i] < m) m = grid.z[j][i];
    grid.datum = isFinite(m) ? m : 0;
    return grid.datum;
  }
  function elevAt(grid, x, y) {
    if (!grid || !grid.z) return 0;
    var n = grid.n;
    var tx = (x - grid.minX) / ((grid.maxX - grid.minX) || 1) * (n - 1);
    var ty = (y - grid.minY) / ((grid.maxY - grid.minY) || 1) * (n - 1);
    tx = clamp(tx, 0, n - 1);
    ty = clamp(ty, 0, n - 1);
    var i = Math.floor(tx), j = Math.floor(ty);
    var i2 = Math.min(i + 1, n - 1), j2 = Math.min(j + 1, n - 1);
    var fx = tx - i, fy = ty - j;
    var z00 = grid.z[j][i], z10 = grid.z[j][i2], z01 = grid.z[j2][i], z11 = grid.z[j2][i2];
    if (!finite(z00)) z00 = 0;
    if (!finite(z10)) z10 = z00;
    if (!finite(z01)) z01 = z00;
    if (!finite(z11)) z11 = z00;
    return z00 * (1 - fx) * (1 - fy) + z10 * fx * (1 - fy) + z01 * (1 - fx) * fy + z11 * fx * fy;
  }
  /* Height above the lowest sample, in feet. exag is the picture only:
     1 is the surveyed relief, and the slope math never reads it. */
  function relY(grid, abs, exag) {
    var scale = finite(exag) ? exag : 1;
    if (scale < 0) scale = 0;
    return (abs - gridDatum(grid)) * scale;
  }

  function gradePad(fp, zs) {
    var vals = [], i;
    for (i = 0; i < (zs || []).length; i++) if (finite(zs[i])) vals.push(zs[i]);
    if (vals.length < 3) return null;
    var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals), sum = 0;
    for (i = 0; i < vals.length; i++) sum += vals[i];
    var mean = sum / vals.length;
    var run = Math.sqrt(fp.w * fp.w + fp.d * fp.d);
    var cutFt = 0, fillFt = 0;
    for (i = 0; i < vals.length; i++) {
      if (vals[i] > mean) cutFt += vals[i] - mean;
      else fillFt += mean - vals[i];
    }
    cutFt /= vals.length;
    fillFt /= vals.length;
    var area = fp.w * fp.d;
    return {
      minFt: min, maxFt: max, meanFt: mean, reliefFt: max - min,
      slopePct: run > 0 ? ((max - min) / run) * 100 : 0,
      cutCy: (cutFt * area) / 27,
      fillCy: (fillFt * area) / 27
    };
  }
  function trenchLength(pts, at) {
    var plan = 0, terrain = 0, i, a, b, dx, dy, dz;
    pts = pts || [];
    for (i = 1; i < pts.length; i++) {
      a = pts[i - 1]; b = pts[i];
      dx = b.x - a.x; dy = b.y - a.y;
      plan += Math.sqrt(dx * dx + dy * dy);
      dz = at(b.x, b.y) - at(a.x, a.y);
      terrain += Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    return { planFt: plan, terrainFt: terrain, extraFt: terrain - plan };
  }

  function padZs(grid, fp) {
    var x = fp.x, y = fp.y, hw = fp.w / 2, hd = fp.d / 2;
    return [
      elevAt(grid, x - hw, y - hd), elevAt(grid, x + hw, y - hd),
      elevAt(grid, x + hw, y + hd), elevAt(grid, x - hw, y + hd),
      elevAt(grid, x, y)
    ];
  }
  function civilOf(scene, grid) {
    var note = 'Level-pad balance about the mean of the sampled corners. A screening number for the Run CIVIL section, not a grading plan.';
    var empty = {
      version: 'editor-v2-3d-civil/1', screening: true, source: grid && grid.source || 'unavailable',
      note: 'Elevation did not load, so cut and fill are not reported.',
      cutCy: null, fillCy: null, netCy: null,
      trenchPlanFt: 0, trenchTerrainFt: 0, trenchExtraFt: 0,
      pads: [], maxSlopePct: null, reliefFt: null, meanElevFt: null, overLimit: 0
    };
    if (!grid || grid.source !== 'usgs-3dep') return empty;
    var pads = [], cut = 0, fill = 0, maxSlope = 0, over = 0, i, o, fp, g, limit, trenchP = 0, trenchT = 0;
    function addPad(id, label, key, box) {
      g = gradePad(box, padZs(grid, box));
      if (!g) return;
      limit = SLOPE_LIMIT[key] == null ? 5 : SLOPE_LIMIT[key];
      if (key === 'array' && box.mount === 'tracker-1ax') limit = SLOPE_LIMIT.tracker;
      var row = {
        id: id, label: label, key: key, meanFt: g.meanFt, reliefFt: g.reliefFt,
        slopePct: g.slopePct, limitPct: limit, over: g.slopePct > limit + 1e-6,
        cutCy: g.cutCy, fillCy: g.fillCy
      };
      pads.push(row);
      cut += g.cutCy; fill += g.fillCy;
      if (g.slopePct > maxSlope) maxSlope = g.slopePct;
      if (row.over) over++;
    }
    scene = scene || { objects: [], lines: [], bounds: { cx: 0, cy: 0, w: 1, h: 1 } };
    for (i = 0; i < scene.objects.length; i++) {
      o = scene.objects[i];
      if (o.kind === 'equip') addPad(o.id, o.label, o.key, { x: o.x, y: o.y, w: o.w, d: o.d });
      else if (o.kind === 'array' && o.w > 0) addPad(o.id, 'Array field', 'array', { x: o.x, y: o.y, w: o.w, d: o.d, mount: o.mount });
    }
    for (i = 0; i < (scene.prisms || []).length; i++) {
      o = scene.prisms[i];
      var bb = ringBBox(o.ring);
      addPad(o.id, o.label, 'building', { x: bb.cx, y: bb.cy, w: bb.w, d: bb.h });
    }
    for (i = 0; i < (scene.lines || []).length; i++) {
      if (scene.lines[i].kind !== 'conduit') continue;
      var len = trenchLength(scene.lines[i].pts, function (x, y) { return elevAt(grid, x, y); });
      trenchP += len.planFt; trenchT += len.terrainFt;
    }
    var siteBox = { x: scene.bounds.cx, y: scene.bounds.cy, w: scene.bounds.w || 1, d: scene.bounds.h || 1 };
    var site = gradePad(siteBox, padZs(grid, siteBox));
    var mean = 0, n = 0, j, ii;
    for (j = 0; j < grid.n; j++) for (ii = 0; ii < grid.n; ii++) if (finite(grid.z[j][ii])) { mean += grid.z[j][ii]; n++; }
    return {
      version: 'editor-v2-3d-civil/1',
      screening: true,
      source: 'usgs-3dep',
      note: note,
      cutCy: cut, fillCy: fill, netCy: cut - fill,
      trenchPlanFt: trenchP, trenchTerrainFt: trenchT, trenchExtraFt: trenchT - trenchP,
      pads: pads,
      maxSlopePct: maxSlope,
      overLimit: over,
      reliefFt: site ? site.reliefFt : null,
      slopePct: site ? site.slopePct : null,
      meanElevFt: n ? mean / n : null
    };
  }

  function contours(grid, interval) {
    var segs = [], n = grid.n, j, i, level, min = Infinity, max = -Infinity;
    var dx = (grid.maxX - grid.minX) / (n - 1), dy = (grid.maxY - grid.minY) / (n - 1);
    for (j = 0; j < n; j++) for (i = 0; i < n; i++) {
      if (grid.z[j][i] < min) min = grid.z[j][i];
      if (grid.z[j][i] > max) max = grid.z[j][i];
    }
    var relief = max - min;
    if (!(interval > 0)) interval = relief > 40 ? 10 : (relief > 16 ? 5 : 2);
    if (!(interval > 0) || relief < interval) return { interval: interval, segments: segs };
    function edgePt(x0, y0, z0, x1, y1, z1, lv) {
      var t = z1 === z0 ? 0.5 : (lv - z0) / (z1 - z0);
      t = clamp(t, 0, 1);
      return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, lv];
    }
    var start = Math.ceil(min / interval) * interval;
    var produced = 0;
    for (level = start; level < max && produced < 16; level += interval, produced++) {
      for (j = 0; j < n - 1; j++) for (i = 0; i < n - 1; i++) {
        var x0 = grid.minX + i * dx, x1 = x0 + dx, y0 = grid.minY + j * dy, y1 = y0 + dy;
        var z00 = grid.z[j][i], z10 = grid.z[j][i + 1], z11 = grid.z[j + 1][i + 1], z01 = grid.z[j + 1][i];
        var hits = [];
        if ((z00 >= level) !== (z10 >= level)) hits.push(edgePt(x0, y0, z00, x1, y0, z10, level));
        if ((z10 >= level) !== (z11 >= level)) hits.push(edgePt(x1, y0, z10, x1, y1, z11, level));
        if ((z11 >= level) !== (z01 >= level)) hits.push(edgePt(x1, y1, z11, x0, y1, z01, level));
        if ((z01 >= level) !== (z00 >= level)) hits.push(edgePt(x0, y1, z01, x0, y0, z00, level));
        if (hits.length >= 2) segs.push([hits[0], hits[1]]);
        if (hits.length === 4) segs.push([hits[2], hits[3]]);
      }
    }
    return { interval: interval, segments: segs };
  }

  function readiness(scene, civil) {
    scene = scene || { objects: [], lines: [], prisms: [] };
    var has = {};
    var i, o, solar = 0, storage = 0, chargers = 0;
    for (i = 0; i < scene.objects.length; i++) {
      o = scene.objects[i];
      if (o.kind === 'array') solar += o.kw || 0;
      if (o.key) has[o.key] = true;
      if (o.key === 'bess') storage += o.kwh || 0;
      if (o.key === 'charger') chargers++;
    }
    var parcel = false, conduit = false;
    for (i = 0; i < (scene.lines || []).length; i++) {
      if (scene.lines[i].kind === 'parcel') parcel = true;
      if (scene.lines[i].kind === 'conduit') conduit = true;
    }
    if (!parcel && scene.bounds && scene.bounds.w > 1) parcel = true;
    var steps = [];
    function add(id, label, ok) { steps.push({ id: id, label: label, state: ok ? 'pass' : 'fail' }); }
    add('parcel', 'Site boundary', parcel);
    add('generation', 'Generation or storage sized', solar > 0 || storage > 0 || chargers > 0);
    add('poi', 'Point of interconnection', !!has.poi);
    add('meter', 'Meter', !!has.meter);
    add('transformer', 'Transformer', !!has.transformer || !!has.switchgear);
    var terrainState = 'pending';
    if (civil && civil.source === 'usgs-3dep') terrainState = 'pass';
    else if (civil && civil.source === 'unavailable') terrainState = 'fail';
    steps.push({ id: 'terrain', label: 'Terrain sampled', state: terrainState });
    var gradeState = 'pending';
    if (civil && civil.source === 'usgs-3dep') gradeState = civil.overLimit > 0 ? 'fail' : 'pass';
    steps.push({ id: 'grade', label: 'Pads within screening slope', state: gradeState });
    add('conduit', 'Conduit run', conduit);
    add('customer', 'Customer named', !!scene.hasCustomer);
    var applicable = 0, passed = 0;
    for (i = 0; i < steps.length; i++) {
      if (steps[i].state === 'pending') continue;
      applicable++;
      if (steps[i].state === 'pass') passed++;
    }
    return { score: applicable ? Math.round(100 * passed / applicable) : 0, steps: steps };
  }

  function tourStops(scene) {
    var stops = [{ id: 'overview', kind: 'overview', caption: 'The site on the terrain.' }];
    var order = ['poi', 'meter', 'transformer', 'switchgear', 'pcs', 'bess', 'array', 'charger', 'conduit', 'building', 'fence'];
    var bag = {}, i, o, list, k;
    function put(item) {
      var key = item.key || item.kind;
      if (!bag[key]) bag[key] = [];
      bag[key].push(item);
    }
    for (i = 0; i < scene.objects.length; i++) put(scene.objects[i]);
    for (i = 0; i < (scene.prisms || []).length; i++) put(scene.prisms[i]);
    for (i = 0; i < order.length; i++) {
      list = bag[order[i]];
      if (!list) continue;
      if (order[i] === 'charger' && list.length > 1) {
        stops.push({ id: list[0].id, kind: 'charger', caption: list.length + ' chargers on the plan.', x: list[0].x, y: list[0].y });
        continue;
      }
      o = list[0];
      stops.push({
        id: o.id, kind: o.kind || o.key, key: o.key,
        caption: (o.label || o.key || 'Component') + '.',
        x: o.x, y: o.y
      });
    }
    return stops;
  }

  function analyze(object, scene, summary, civil, gridInfo) {
    object = object || {};
    summary = summary || {};
    var solarKw = +summary.solarKwDc || 0;
    var i, o, solarMwh = 0, myKw = object.kw || 0, myKwh = object.kwh || 0;
    for (i = 0; i < (scene.objects || []).length; i++) {
      o = scene.objects[i];
      if (o.kind === 'array') solarMwh += (o.kw || 0) * 8.76 * (o.cf || 0.18);
    }
    var cost = null, costNote = 'Priced on Run.';
    var energy = null, energyShare = null;
    if (object.kind === 'array' && myKw > 0) {
      energy = myKw * 8.76 * (object.cf || cfOf(object.mount));
      energyShare = solarMwh > 0 ? energy / solarMwh : null;
    }
    var pad = null;
    if (civil && civil.pads) {
      for (i = 0; i < civil.pads.length; i++) if (civil.pads[i].id === object.id) pad = civil.pads[i];
    }
    var warnings = [];
    if (pad && pad.over) warnings.push('Slope ' + pad.slopePct.toFixed(1) + '% is over the ' + pad.limitPct + '% screening limit.');
    if (object.kind === 'array' && !(myKw > 0)) warnings.push('This array has no kilowatts yet.');
    var conn = [];
    var poi = null;
    for (i = 0; i < (scene.objects || []).length; i++) if (scene.objects[i].key === 'poi') poi = scene.objects[i];
    if (object.key !== 'poi' && poi) conn.push('On this plan it ties back to the point of interconnection.');
    if (object.key === 'poi') conn.push('This is the point of interconnection.');
    if (object.key === 'bess') conn.push('DC into the PCS, then the transformer and the meter.');
    if (object.key === 'pcs') conn.push('Between the battery and the transformer.');
    if (object.key === 'transformer') conn.push('Between the PCS and the meter.');
    if (object.key === 'meter') conn.push('Between the transformer and the utility.');
    if (object.key === 'charger') conn.push('A load on the site service.');
    if (object.kind === 'array') conn.push((object.rows || 0) + ' rows, ' + (object.pitchFt || 0) + ' ft pitch, tilt ' + (object.tilt || 0) + '°.');
    if (gridInfo && gridInfo.sub) {
      var sub = gridInfo.sub;
      var miles = sub.mi != null ? sub.mi.toFixed(2) + ' mi' : '';
      conn.push('Nearest published substation: ' + (sub.name || 'unnamed') + (sub.kv ? ', ' + Math.round(sub.kv) + ' kV' : '') + (miles ? ', ' + miles : '') + '. Straight-line, not a circuit path.');
    } else if (gridInfo && gridInfo.error) {
      conn.push('Grid Atlas did not answer: ' + gridInfo.error);
    }
    var kwShare = (object.kind === 'array' && solarKw > 0) ? myKw / solarKw : null;
    var kwhShare = null;
    if (object.key === 'bess' && summary.bessKwh > 0) kwhShare = myKwh / summary.bessKwh;
    return {
      id: object.id,
      label: object.label || object.key || 'Component',
      kind: object.kind,
      key: object.key,
      w: object.w, d: object.d, h: object.h,
      kw: myKw, kwh: myKwh,
      kwShare: kwShare, kwhShare: kwhShare,
      cost: cost, costNote: costNote,
      energyMwh: energy, energyShare: energyShare,
      pad: pad, warnings: warnings, connections: conn,
      status: warnings.length ? 'Needs a look' : 'On this plan',
      spec: object.spec || ''
    };
  }

  function providerPlan(cfg) {
    cfg = cfg || {};
    return {
      elevation: 'usgs-3dep',
      imagery: 'esri-world-imagery',
      buildings: 'osm',
      active: 'free',
      photorealisticAvailable: !!cfg.photorealistic,
      ionTerrain: false
    };
  }

  /* Camera. +X east, +Y up, +Z north. Yaw 0 looks from the south. */
  function cameraEye(cam) {
    var cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    var cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
    return {
      x: cam.target.x + cam.radius * cp * sy,
      y: cam.target.y + cam.radius * sp,
      z: cam.target.z - cam.radius * cp * cy
    };
  }
  function matLook(eye, center) {
    var zx = eye.x - center.x, zy = eye.y - center.y, zz = eye.z - center.z;
    var l = Math.sqrt(zx * zx + zy * zy + zz * zz) || 1;
    zx /= l; zy /= l; zz /= l;
    var ux = 0, uy = 1, uz = 0;
    if (Math.abs(zy) > 0.98) { ux = 0; uy = 0; uz = -1; }
    var xx = uy * zz - uz * zy, xy = uz * zx - ux * zz, xz = ux * zy - uy * zx;
    l = Math.sqrt(xx * xx + xy * xy + xz * xz) || 1;
    xx /= l; xy /= l; xz /= l;
    var yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    return [
      xx, yx, zx, 0,
      xy, yy, zy, 0,
      xz, yz, zz, 0,
      -(xx * eye.x + xy * eye.y + xz * eye.z),
      -(yx * eye.x + yy * eye.y + yz * eye.z),
      -(zx * eye.x + zy * eye.y + zz * eye.z),
      1
    ];
  }
  function matPersp(fovy, aspect, near, far) {
    var f = 1 / Math.tan(fovy / 2);
    var nf = 1 / (near - far);
    return [
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) * nf, -1,
      0, 0, 2 * far * near * nf, 0
    ];
  }
  function matMul(a, b) {
    var o = new Array(16), i, j;
    for (i = 0; i < 4; i++) {
      for (j = 0; j < 4; j++) {
        o[j * 4 + i] = a[i] * b[j * 4] + a[4 + i] * b[j * 4 + 1] + a[8 + i] * b[j * 4 + 2] + a[12 + i] * b[j * 4 + 3];
      }
    }
    return o;
  }
  function applyM(m, x, y, z) {
    var w = m[3] * x + m[7] * y + m[11] * z + m[15];
    if (w <= 1e-6) return null;
    return {
      x: (m[0] * x + m[4] * y + m[8] * z + m[12]) / w,
      y: (m[1] * x + m[5] * y + m[9] * z + m[13]) / w,
      z: (m[2] * x + m[6] * y + m[10] * z + m[14]) / w
    };
  }
  function mvpOf(cam, aspect) {
    var eye = cameraEye(cam);
    return matMul(matPersp(cam.fovy || Math.PI / 4, aspect, cam.near || 1, cam.far || 20000), matLook(eye, cam.target));
  }
  function projectPoint(cam, aspect, width, height, p) {
    var mvp = cam.mvp || mvpOf(cam, aspect);
    var ndc = applyM(mvp, p[0], p[1], p[2]);
    if (!ndc) return null;
    return {
      x: (ndc.x * 0.5 + 0.5) * width,
      y: (1 - (ndc.y * 0.5 + 0.5)) * height,
      depth: ndc.z
    };
  }
  function invert4(a) {
    var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
    var a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    var a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    var a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
    var b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10;
    var b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
    var b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30;
    var b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
    var det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (!det) return null;
    det = 1 / det;
    return [
      (a11 * b11 - a12 * b10 + a13 * b09) * det,
      (a02 * b10 - a01 * b11 - a03 * b09) * det,
      (a31 * b05 - a32 * b04 + a33 * b03) * det,
      (a22 * b04 - a21 * b05 - a23 * b03) * det,
      (a12 * b08 - a10 * b11 - a13 * b07) * det,
      (a00 * b11 - a02 * b08 + a03 * b07) * det,
      (a32 * b02 - a30 * b05 - a33 * b01) * det,
      (a20 * b05 - a22 * b02 + a23 * b01) * det,
      (a10 * b10 - a11 * b08 + a13 * b06) * det,
      (a01 * b08 - a00 * b10 - a03 * b06) * det,
      (a30 * b04 - a31 * b02 + a33 * b00) * det,
      (a21 * b02 - a20 * b04 - a23 * b00) * det,
      (a11 * b07 - a10 * b09 - a12 * b06) * det,
      (a00 * b09 - a01 * b07 + a02 * b06) * det,
      (a31 * b01 - a30 * b03 - a32 * b00) * det,
      (a20 * b03 - a21 * b01 + a22 * b00) * det
    ];
  }
  function transformPoint(m, x, y, z) {
    var w = m[3] * x + m[7] * y + m[11] * z + m[15];
    if (Math.abs(w) < 1e-8) return null;
    return [
      (m[0] * x + m[4] * y + m[8] * z + m[12]) / w,
      (m[1] * x + m[5] * y + m[9] * z + m[13]) / w,
      (m[2] * x + m[6] * y + m[10] * z + m[14]) / w
    ];
  }
  function rayFrom(cam, aspect, width, height, sx, sy) {
    var mvp = cam.mvp || mvpOf(cam, aspect);
    var inv = invert4(mvp);
    if (!inv || !(width > 0) || !(height > 0)) return null;
    var nx = (sx / width) * 2 - 1;
    var ny = 1 - (sy / height) * 2;
    var near = transformPoint(inv, nx, ny, -1);
    var far = transformPoint(inv, nx, ny, 1);
    if (!near || !far) return null;
    return { o: near, d: norm3(sub3(far, near)) };
  }
  function rayTriangle(orig, dir, a, b, c) {
    var e1 = sub3(b, a), e2 = sub3(c, a);
    var h = cross(dir, e2);
    var det = dot3(e1, h);
    if (det > -1e-8 && det < 1e-8) return null;
    var inv = 1 / det;
    var s = sub3(orig, a);
    var u = inv * dot3(s, h);
    if (u < 0 || u > 1) return null;
    var q = cross(s, e1);
    var v = inv * dot3(dir, q);
    if (v < 0 || u + v > 1) return null;
    var t = inv * dot3(e2, q);
    if (t < 1e-6) return null;
    return t;
  }
  function splitPick(raw) {
    if (!raw) return null;
    var h = raw.indexOf('#');
    return { id: h < 0 ? raw : raw.slice(0, h), part: raw };
  }
  /* The triangle under the cursor. Labels are a shortcut; the mesh is the hit. */
  function pickMesh(built, cam, aspect, width, height, sx, sy) {
    if (!built || !built.solid) return null;
    var ray = rayFrom(cam, aspect, width, height, sx, sy);
    if (!ray) return null;
    var bestT = Infinity, best = '', i, t, tri;
    for (i = 0; i < built.solid.length; i++) {
      tri = built.solid[i];
      if (!tri.id) continue;
      t = rayTriangle(ray.o, ray.d, tri.p[0], tri.p[1], tri.p[2]);
      if (t != null && t < bestT) { bestT = t; best = tri.id; }
    }
    return splitPick(best);
  }

  var meshId = '';
  function addTri(mesh, a, b, c, color, uvs) {
    var n = triNormal(a, b, c);
    mesh.tris.push({ p: [a, b, c], n: n, c: color, uv: uvs || [[0, 0], [0, 0], [0, 0]], id: meshId });
  }
  function addFace(mesh, q, color, up) {
    var n = triNormal(q[0], q[1], q[2]);
    if (up && n[1] < 0) q = [q[0], q[3], q[2], q[1]];
    addTri(mesh, q[0], q[1], q[2], color);
    addTri(mesh, q[0], q[2], q[3], color);
  }
  function addBox(mesh, cx, cy, cz, sx, sy, sz, rot, color) {
    var hx = sx / 2, hy = sy / 2, hz = sz / 2;
    var r = (rot || 0) * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
    var local = [
      [-hx, -hy, -hz], [hx, -hy, -hz], [hx, hy, -hz], [-hx, hy, -hz],
      [-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]
    ];
    var w = [], i, p, x, z;
    for (i = 0; i < local.length; i++) {
      p = local[i];
      x = p[0] * c - p[2] * s;
      z = p[0] * s + p[2] * c;
      w.push([cx + x, cy + p[1], cz + z]);
    }
    addFace(mesh, [w[3], w[2], w[6], w[7]], color, true);
    addFace(mesh, [w[0], w[1], w[2], w[3]], mix(color, 0.72));
    addFace(mesh, [w[1], w[5], w[6], w[2]], mix(color, 0.84));
    addFace(mesh, [w[4], w[0], w[3], w[7]], mix(color, 0.78));
    addFace(mesh, [w[4], w[7], w[6], w[5]], mix(color, 0.9));
    addFace(mesh, [w[0], w[4], w[5], w[1]], mix(color, 0.55));
  }
  function addPrism(mesh, ring, floor, roof, color) {
    if (!ring || ring.length < 3) return;
    var i, cx = 0, cz = 0, top = [], bot = [];
    for (i = 0; i < ring.length; i++) { cx += ring[i].x; cz += ring[i].y; }
    cx /= ring.length; cz /= ring.length;
    var cc = [cx, roof, cz];
    for (i = 0; i < ring.length; i++) {
      top.push([ring[i].x, roof, ring[i].y]);
      bot.push([ring[i].x, floor, ring[i].y]);
    }
    for (i = 0; i < ring.length; i++) {
      var j = (i + 1) % ring.length;
      addTri(mesh, cc, top[i], top[j], color);
      addFace(mesh, [bot[i], bot[j], top[j], top[i]], mix(color, 0.8));
    }
  }
  function panelCorners(cx, cz, w, d, rot, tilt, axis, floorY) {
    var hw = w / 2, hd = d / 2;
    var rise = Math.tan(clamp(tilt, -60, 60) * Math.PI / 180);
    var rr = (rot || 0) * Math.PI / 180, c = Math.cos(rr), s = Math.sin(rr);
    var locals = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
    var out = [], i, p, lift, x, z;
    for (i = 0; i < locals.length; i++) {
      p = locals[i];
      lift = axis === 'z' ? (hw - p[0]) * rise : (p[1] + hd) * rise;
      x = p[0] * c - p[1] * s;
      z = p[0] * s + p[1] * c;
      out.push([cx + x, floorY + 2 + Math.max(0, lift), cz + z]);
    }
    return out;
  }

  function compose(scene, grid, sun, opts) {
    opts = opts || {};
    if (!grid) {
      grid = gridFrom({
        n: 2, minX: scene.bounds.minX, minY: scene.bounds.minY, maxX: scene.bounds.maxX, maxY: scene.bounds.maxY,
        z: function () { return 0; }, source: 'pending', datum: 0
      });
    }
    var datum = gridDatum(grid);
    var terrain = { tris: [] }, solid = { tris: [] }, shadows = { tris: [] }, lines = [];
    var pick = [], n = grid.n, i, j, o, t;
    var dx = (grid.maxX - grid.minX) / (n - 1), dy = (grid.maxY - grid.minY) / (n - 1);
    var sunV = sunVector(sun);
    var desert = hex('#C6B296');
    meshId = '';
    function ground(x, north) { return relY(grid, elevAt(grid, x, north), opts.exag); }
    for (j = 0; j < n - 1; j++) for (i = 0; i < n - 1; i++) {
      var x0 = grid.minX + i * dx, x1 = x0 + dx, y0 = grid.minY + j * dy, y1 = y0 + dy;
      var p00 = [x0, ground(x0, y0), y0], p10 = [x1, ground(x1, y0), y0];
      var p11 = [x1, ground(x1, y1), y1], p01 = [x0, ground(x0, y1), y1];
      var nn = triNormal(p00, p01, p11);
      var hs = clamp(dot3(nn, sunV), 0, 1);
      var col;
      if (opts.slope) {
        var sx = (elevAt(grid, x1, y0) - elevAt(grid, x0, y0)) / (dx || 1);
        var sy = (elevAt(grid, x0, y1) - elevAt(grid, x0, y0)) / (dy || 1);
        var pct = Math.sqrt(sx * sx + sy * sy) * 100;
        col = pct < 2 ? hex('#3F7D4E') : pct < 5 ? hex('#C4A35A') : pct < 10 ? hex('#C47B3A') : hex('#A33B32');
      } else if (opts.textured) {
        var g = 0.55 + 0.55 * hs;
        col = [g, g, g];
      } else {
        col = mix(desert, 0.55 + 0.7 * hs);
      }
      var u0 = i / (n - 1), u1 = (i + 1) / (n - 1), v0 = j / (n - 1), v1 = (j + 1) / (n - 1);
      addTri(terrain, p00, p01, p11, col, [[u0, v0], [u0, v1], [u1, v1]]);
      addTri(terrain, p00, p11, p10, col, [[u0, v0], [u1, v1], [u1, v0]]);
    }
    function shadowOf(corners) {
      if (!sun || !(sun.altitude > 2) || opts.slope) return;
      var pts = [], k, p, above, off, x, z, gy;
      for (k = 0; k < corners.length; k++) {
        p = corners[k];
        gy = ground(p[0], p[2]);
        above = p[1] - gy;
        if (above < 0) above = 0;
        off = shadowOffset(above, sun);
        x = p[0] + off.x; z = p[2] + off.z;
        pts.push([x, ground(x, z) + 0.4, z]);
      }
      addTri(shadows, pts[0], pts[1], pts[2], [0.22, 0.18, 0.14]);
      addTri(shadows, pts[0], pts[2], pts[3], [0.22, 0.18, 0.14]);
    }
    for (i = 0; i < scene.tables.length; i++) {
      t = scene.tables[i];
      meshId = t.arrayId + '#' + i;
      var tilt = t.mount === 'tracker-1ax' ? trackerTilt(sun) : t.tilt;
      var axis = t.mount === 'tracker-1ax' ? 'z' : 'x';
      var base = ground(t.x, t.y);
      var corners = panelCorners(t.x, t.y, t.w, t.d, 0, tilt, axis, base);
      var glass = hex('#3B6FB6');
      addFace(solid, corners, glass, true);
      addFace(solid, [corners[0], corners[3], corners[2], corners[1]], mix(glass, 0.45));
      var leg = hex('#334155');
      var sMid = [(corners[0][0] + corners[1][0]) / 2, (corners[0][1] + corners[1][1]) / 2, (corners[0][2] + corners[1][2]) / 2];
      var nMid = [(corners[3][0] + corners[2][0]) / 2, (corners[3][1] + corners[2][1]) / 2, (corners[3][2] + corners[2][2]) / 2];
      addBox(solid, sMid[0], base + Math.max(0.3, sMid[1] - base) / 2, sMid[2], 0.4, Math.max(0.3, sMid[1] - base), 0.4, 0, leg);
      addBox(solid, nMid[0], base + Math.max(0.3, nMid[1] - base) / 2, nMid[2], 0.4, Math.max(0.3, nMid[1] - base), 0.4, 0, leg);
      shadowOf(corners);
      pick.push({ id: t.arrayId, kind: 'array', min: [t.x - t.w / 2, base, t.y - t.d / 2], max: [t.x + t.w / 2, base + 8, t.y + t.d / 2] });
    }
    for (i = 0; i < scene.prisms.length; i++) {
      o = scene.prisms[i];
      meshId = o.id;
      var pb = ringBBox(o.ring);
      var fl = ground(pb.cx, pb.cy);
      addPrism(solid, o.ring, fl, fl + o.h, hex(o.color));
      pick.push({ id: o.id, kind: 'building', min: [pb.minX, fl, pb.minY], max: [pb.maxX, fl + o.h, pb.maxY] });
    }
    for (i = 0; i < scene.objects.length; i++) {
      o = scene.objects[i];
      if (o.kind !== 'equip') continue;
      meshId = o.id;
      var gy = ground(o.x, o.y);
      addBox(solid, o.x, gy + o.h / 2 + 0.15, o.y, o.w, o.h, o.d, o.rot, hex(o.color));
      if (o.cap && o.key === 'bess') addBox(solid, o.x + (o.w / 2 - 0.35) * Math.cos((o.rot || 0) * Math.PI / 180), gy + o.h / 2 + 0.2, o.y, 0.45, o.h * 0.72, o.d * 0.82, o.rot, hex(o.cap));
      if (o.key === 'charger') addBox(solid, o.x, gy + o.h + 0.5, o.y, Math.min(o.w, 1.4), 1.1, Math.min(o.d, 1.2), o.rot, hex(o.cap));
      if (o.key === 'transformer') {
        addBox(solid, o.x - o.w * 0.18, gy + o.h + 0.7, o.y, 0.5, 1.3, 0.5, 0, hex('#94A3B8'));
        addBox(solid, o.x + o.w * 0.18, gy + o.h + 0.7, o.y, 0.5, 1.3, 0.5, 0, hex('#94A3B8'));
      }
      pick.push({ id: o.id, kind: o.key, min: [o.x - o.w / 2, gy, o.y - o.d / 2], max: [o.x + o.w / 2, gy + o.h + 2, o.y + o.d / 2] });
      shadowOf([
        [o.x - o.w / 2, gy + o.h, o.y - o.d / 2],
        [o.x + o.w / 2, gy + o.h, o.y - o.d / 2],
        [o.x + o.w / 2, gy + o.h, o.y + o.d / 2],
        [o.x - o.w / 2, gy + o.h, o.y + o.d / 2]
      ]);
    }
    for (i = 0; i < scene.lines.length; i++) {
      var ln = scene.lines[i];
      meshId = (ln.kind === 'conduit' || ln.kind === 'fence') ? ln.id : '';
      var col = hex(ln.color || '#1F4E79');
      var a, b, k;
      for (k = 1; k < ln.pts.length; k++) {
        a = ln.pts[k - 1]; b = ln.pts[k];
        var ya = ground(a.x, a.y), yb = ground(b.x, b.y);
        if (ln.kind === 'fence') {
          addBox(solid, (a.x + b.x) / 2, (ya + yb) / 2 + ln.h / 2, (a.y + b.y) / 2, Math.max(0.15, Math.abs(b.x - a.x)), 0.12, Math.max(0.15, Math.abs(b.y - a.y)), 0, col);
          lines.push([[a.x, ya + ln.h, a.y], [b.x, yb + ln.h, b.y], col]);
        } else if (ln.kind === 'conduit') {
          var mx = (b.x - a.x), mz = (b.y - a.y), ml = Math.sqrt(mx * mx + mz * mz) || 1;
          var px = -mz / ml * 1.6, pz = mx / ml * 1.6;
          var a1 = [a.x + px, ya + 0.35, a.y + pz], a2 = [a.x - px, ya + 0.35, a.y - pz];
          var b1 = [b.x + px, yb + 0.35, b.y + pz], b2 = [b.x - px, yb + 0.35, b.y - pz];
          addTri(solid, a1, b1, b2, col);
          addTri(solid, a1, b2, a2, col);
        } else {
          lines.push([[a.x, ya + 0.5, a.y], [b.x, yb + 0.5, b.y], col]);
        }
      }
      if (ln.kind === 'conduit' || ln.kind === 'fence') {
        var mid = ln.pts[Math.floor(ln.pts.length / 2)];
        pick.push({ id: ln.id, kind: ln.kind, min: [mid.x - 4, ground(mid.x, mid.y), mid.y - 4], max: [mid.x + 4, ground(mid.x, mid.y) + 6, mid.y + 4] });
      }
    }
    if (opts.contours) {
      var set = contours(grid, opts.contourFt);
      var ink = hex('#F8FAFC');
      for (i = 0; i < set.segments.length; i++) {
        a = set.segments[i][0]; b = set.segments[i][1];
        lines.push([[a[0], relY(grid, a[2], opts.exag) + 0.7, a[1]], [b[0], relY(grid, b[2], opts.exag) + 0.7, b[1]], ink]);
      }
    }
    meshId = '';
    if (opts.wires) {
      for (i = 0; i < opts.wires.length; i++) {
        meshId = 'grid-line-' + i;
        var w = opts.wires[i];
        var wc = hex(w.color || '#E8590C');
        for (k = 1; k < w.pts.length; k++) {
          a = w.pts[k - 1]; b = w.pts[k];
          var ya = ground(a.x, a.y) + 14, yb = ground(b.x, b.y) + 14;
          lines.push([[a.x, ya, a.y], [b.x, yb, b.y], wc]);
          var vx = b.x - a.x, vz = b.y - a.y, vl = Math.sqrt(vx * vx + vz * vz) || 1;
          var ox = -vz / vl * 1.2, oz = vx / vl * 1.2;
          addTri(solid, [a.x + ox, ya, a.y + oz], [b.x + ox, yb, b.y + oz], [b.x - ox, yb, b.y - oz], wc);
          addTri(solid, [a.x + ox, ya, a.y + oz], [b.x - ox, yb, b.y - oz], [a.x - ox, ya, a.y - oz], wc);
        }
      }
    }
    meshId = '';
    if (opts.yard) {
      var yd = opts.yard;
      meshId = 'grid-sub';
      var gyard = ground(yd.x, yd.y);
      addBox(solid, yd.x, gyard + 6, yd.y, 18, 12, 14, 0, hex('#7F1D1D'));
      addBox(solid, yd.x - 6, gyard + 16, yd.y, 1.2, 20, 1.2, 0, hex('#44403C'));
      addBox(solid, yd.x + 6, gyard + 16, yd.y, 1.2, 20, 1.2, 0, hex('#44403C'));
      pick.push({ id: 'grid-sub', kind: 'substation', min: [yd.x - 12, gyard, yd.y - 10], max: [yd.x + 12, gyard + 26, yd.y + 10] });
    }
    meshId = '';
    return {
      terrain: terrain.tris, solid: solid.tris, shadows: shadows.tris, lines: lines, pick: pick,
      triangles: terrain.tris.length + solid.tris.length + shadows.tris.length,
      datum: datum
    };
  }

  function findObject(scene, id) {
    var i, line;
    for (i = 0; i < scene.objects.length; i++) if (scene.objects[i].id === id) return scene.objects[i];
    for (i = 0; i < (scene.prisms || []).length; i++) if (scene.prisms[i].id === id) return scene.prisms[i];
    for (i = 0; i < (scene.lines || []).length; i++) if (scene.lines[i].id === id) {
      line = scene.lines[i];
      return { id: line.id, kind: line.kind, key: line.kind, label: line.kind === 'conduit' ? 'Conduit' : (line.kind === 'parcel' ? 'Boundary' : 'Line'), pts: line.pts, spec: line.spec || '' };
    }
    return null;
  }

  /* ── browser view ──────────────────────────────────────────────────── */
  var view = null;

  function css() {
    if (document.getElementById('v3d-css')) return;
    var s = document.createElement('style');
    s.id = 'v3d-css';
    s.textContent = [
      '.v3d{position:fixed;z-index:40;background:#9BB0C2;overflow:hidden;touch-action:none;font-family:inherit;color:#16202B;}',
      '.v3d canvas{display:block;width:100%;height:100%;}',
      '.v3d-top{position:absolute;top:12px;left:12px;display:flex;gap:8px;align-items:center;z-index:2;}',
      '.v3d-back{background:#1F4E79;color:#fff;border:0;border-radius:6px;padding:8px 14px;font-weight:700;cursor:pointer;}',
      '.v3d-back:focus-visible,.v3d-ring:focus-visible,.v3d-x:focus-visible,.v3d button:focus-visible{outline:2px solid #2B5FA8;outline-offset:2px;}',
      '.v3d-hint{position:absolute;left:12px;bottom:64px;color:#16202B;background:rgba(255,255,255,.88);border-radius:6px;padding:4px 8px;font-size:12px;z-index:2;}',
      '.v3d-ring{position:absolute;left:12px;bottom:12px;width:52px;height:52px;border:0;background:#fff;border-radius:50%;box-shadow:0 8px 20px rgba(22,32,43,.18);cursor:pointer;z-index:2;padding:0;}',
      '.v3d-credit{position:absolute;left:74px;right:12px;bottom:10px;font-size:11px;color:#334155;z-index:2;pointer-events:none;text-shadow:0 1px 0 rgba(255,255,255,.7);}',
      '.v3d-panel{position:absolute;top:12px;right:12px;width:min(320px,calc(100% - 24px));max-height:calc(100% - 24px);overflow:auto;background:#fff;border-radius:12px;box-shadow:0 10px 28px rgba(22,32,43,.16);z-index:3;padding:14px;}',
      '.v3d-panel h3{margin:0;font-size:16px;}',
      '.v3d-panel p,.v3d-note{margin:6px 0 0;color:#526273;font-size:12px;line-height:1.4;}',
      '.v3d-row{display:flex;justify-content:space-between;gap:10px;font-size:13px;padding:3px 0;}',
      '.v3d-row b{font-variant-numeric:tabular-nums;text-align:right;}',
      '.v3d-h{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#526273;margin:12px 0 4px;}',
      '.v3d-x{position:absolute;top:8px;right:8px;border:0;background:transparent;font-size:18px;cursor:pointer;color:#526273;}',
      '.v3d-panel button,.v3d-panel input{font:inherit;}',
      '.v3d-btn{border:1px solid #D5DDE6;background:#fff;border-radius:6px;padding:6px 10px;cursor:pointer;font-weight:600;}',
      '.v3d-btn[aria-pressed="true"]{background:#E6EEF7;border-color:#B7C9E2;color:#1F4E79;}',
      '.v3d-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;}',
      '.v3d-scale{display:flex;align-items:center;gap:8px;margin-top:12px;font-size:13px;}',
      '.v3d-scale input{flex:1;min-width:0;}',
      '.v3d-scale b{min-width:2.5em;text-align:right;}',
      '.v3d-step{display:flex;justify-content:space-between;gap:8px;font-size:13px;padding:2px 0;}',
      '.v3d-ok{color:#1F6B45;font-weight:700;}',
      '.v3d-no{color:#9F2D2D;font-weight:700;}',
      '.v3d-wait{color:#8A5A00;font-weight:700;}',
      '.v3d-caption{position:absolute;left:50%;bottom:36px;transform:translateX(-50%);background:rgba(22,32,43,.88);color:#fff;border-radius:8px;padding:8px 12px;font-size:13px;z-index:2;max-width:min(420px,80%);}',
      '.v3d-cesium{position:absolute;left:0;top:0;right:0;bottom:0;}',
      '.v3d-tag{position:absolute;transform:translate(-50%,-130%);background:rgba(255,255,255,.94);border:0;border-radius:999px;padding:2px 8px;font:700 11px/1.3 inherit;color:#16202B;cursor:pointer;z-index:2;box-shadow:0 1px 4px rgba(22,32,43,.28);white-space:nowrap;}',
      '.v3d-tag.on{background:#1F4E79;color:#fff;}',
      '@media (prefers-reduced-motion:reduce){.v3d-caption{transition:none;}}'
    ].join('');
    document.head.appendChild(s);
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function row(host, k, v) {
    var r = el('div', 'v3d-row');
    r.appendChild(el('span', '', k));
    r.appendChild(el('b', '', v));
    host.appendChild(r);
  }
  function money(n) {
    if (!(n > 0)) return '';
    return '$' + Math.round(n).toLocaleString('en-US');
  }
  function pct(n) {
    if (n == null || !isFinite(n)) return '';
    return Math.round(n * 100) + '%';
  }

  function isOpen() { return !!(view && view.open); }
  function lastCivil() { return view && view.civil ? view.civil : null; }
  function perf() {
    if (!view) return { firstFrameMs: null, fps: null, triangles: 0, mode: null };
    return {
      firstFrameMs: view.perf.firstFrameMs,
      fps: view.perf.fps,
      triangles: view.perf.triangles,
      mode: view.perf.mode,
      elevation: view.perf.elevation,
      imagery: view.perf.imagery
    };
  }
  function debug() {
    return {
      open: isOpen(),
      mode: view && view.perf.mode,
      firstFrameMs: view && view.perf.firstFrameMs,
      fps: view && view.perf.fps,
      triangles: view && view.perf.triangles,
      elevation: view && view.perf.elevation,
      imagery: !!(view && view.perf.imagery),
      buildings: view && view.perf.buildings || 0,
      lines: view && view.gridInfo && view.gridInfo.lineCount || 0,
      sub: view && view.gridInfo && view.gridInfo.sub ? view.gridInfo.sub.name : '',
      score: view && view.score,
      civil: view && view.civil,
      fallback: view && view.perf.fallback || null
    };
  }

  function open(opts) {
    if (typeof document === 'undefined') return { ok: false, reason: 'no document' };
    if (!libs()) return { ok: false, reason: 'libraries' };
    opts = opts || {};
    if (view && view.open) close();
    css();
    var host = opts.host || document.getElementById('workspace') || document.body;
    var scene = sceneOf(opts.doc);
    var summary = opts.summary || D.summary(opts.doc);
    var started = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    var overlay = el('div', 'v3d');
    overlay.setAttribute('role', 'region');
    overlay.setAttribute('aria-label', '3D view of the site');
    var canvas = document.createElement('canvas');
    overlay.appendChild(canvas);
    document.body.appendChild(overlay);
    var reduce = false;
    try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
    var span = Math.max(scene.bounds.w, scene.bounds.h, 80);
    var home = {
      target: { x: scene.bounds.cx, y: 0, z: scene.bounds.cy },
      yaw: 0.55, pitch: 0.62, radius: span * 1.05, fovy: Math.PI / 4
    };
    view = {
      open: true, opts: opts, scene: scene, summary: summary, host: host, overlay: overlay, canvas: canvas,
      gl: null, ctx2: null, program: null, texOn: false, slope: false, contoursOn: false,
      grid: null, sun: sunPosition(scene.anchor.lat, scene.anchor.lng, new Date()),
      when: new Date(), cam: { target: { x: home.target.x, y: 0, z: home.target.z }, yaw: 0.15, pitch: 1.35, radius: span * 0.85, fovy: home.fovy },
      home: home, userMoved: false, flying: !reduce, flyT: 0,
      exag: 1,
      selection: (opts.selection || []).slice(),
      panelMode: null, civil: null, score: 0, gridInfo: null, wires: [], yard: null,
      buildings: [], perf: { firstFrameMs: null, fps: null, triangles: 0, mode: null, elevation: 'pending', imagery: false, buildings: 0, frames: 0, fpsT: 0 },
      tour: null, cfg: null, cesium: null, disposed: false
    };
    place();
    var gl = null;
    try { gl = canvas.getContext('webgl', { antialias: true, preserveDrawingBuffer: true, alpha: false }); } catch (e) {}
    if (!gl) try { gl = canvas.getContext('experimental-webgl', { preserveDrawingBuffer: true, alpha: false }); } catch (e2) {}
    if (gl && !initGl(gl)) gl = null;
    view.gl = gl;
    if (!gl) {
      view.ctx2 = canvas.getContext('2d');
      view.perf.mode = '2.5d';
      view.perf.fallback = 'WebGL is not available. Showing hillshade and the models.';
    } else view.perf.mode = 'webgl';
    buildUi();
    draw();
    if (view.perf.firstFrameMs == null) view.perf.firstFrameMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - started;
    view.raf = requestAnimationFrame(frame);
    view.onResize = function () { place(); };
    window.addEventListener('resize', view.onResize);
    view.onKey = onKey;
    window.addEventListener('keydown', view.onKey, true);
    bindPointer();
    if (!reduce) view.flying = true;
    else {
      view.cam.yaw = home.yaw; view.cam.pitch = home.pitch; view.cam.radius = home.radius;
    }
    loadWorld();
    return { ok: true };
  }

  function place() {
    if (!view) return;
    var r = view.host.getBoundingClientRect();
    var o = view.overlay;
    o.style.left = r.left + 'px';
    o.style.top = r.top + 'px';
    o.style.width = Math.max(1, r.width) + 'px';
    o.style.height = Math.max(1, r.height) + 'px';
    sizeCanvas();
  }
  function sizeCanvas() {
    var c = view.canvas;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.max(1, c.clientWidth || view.overlay.clientWidth);
    var h = Math.max(1, c.clientHeight || view.overlay.clientHeight);
    view.cssW = w; view.cssH = h; view.dpr = dpr;
    if (c.width !== Math.floor(w * dpr) || c.height !== Math.floor(h * dpr)) {
      c.width = Math.floor(w * dpr);
      c.height = Math.floor(h * dpr);
    }
  }

  function initGl(gl) {
    var vs = compile(gl, gl.VERTEX_SHADER, [
      'attribute vec3 aPos;', 'attribute vec3 aNrm;', 'attribute vec3 aCol;', 'attribute vec2 aUv;',
      'uniform mat4 uMvp;', 'varying vec3 vCol;', 'varying vec3 vNrm;', 'varying vec2 vUv;',
      'void main(){ gl_Position = uMvp * vec4(aPos,1.0); vCol=aCol; vNrm=aNrm; vUv=aUv; }'
    ].join('\n'));
    var fs = compile(gl, gl.FRAGMENT_SHADER, [
      'precision mediump float;',
      'varying vec3 vCol; varying vec3 vNrm; varying vec2 vUv;',
      'uniform vec3 uSun; uniform float uAmbient; uniform float uLit; uniform float uTexOn; uniform sampler2D uTex;',
      'void main(){',
      '  vec3 base = vCol;',
      '  if (uTexOn > 0.5) base *= texture2D(uTex, vUv).rgb;',
      '  vec3 n = normalize(vNrm);',
      '  float ndl = max(0.0, dot(n, normalize(uSun)));',
      '  float light = mix(1.0, uAmbient + (1.0 - uAmbient) * ndl, uLit);',
      '  gl_FragColor = vec4(base * light, 1.0);',
      '}'
    ].join('\n'));
    if (!vs || !fs) return false;
    var p = gl.createProgram();
    gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) return false;
    view.program = p;
    view.loc = {
      mvp: gl.getUniformLocation(p, 'uMvp'),
      sun: gl.getUniformLocation(p, 'uSun'),
      amb: gl.getUniformLocation(p, 'uAmbient'),
      lit: gl.getUniformLocation(p, 'uLit'),
      texOn: gl.getUniformLocation(p, 'uTexOn'),
      pos: gl.getAttribLocation(p, 'aPos'),
      nrm: gl.getAttribLocation(p, 'aNrm'),
      col: gl.getAttribLocation(p, 'aCol'),
      uv: gl.getAttribLocation(p, 'aUv')
    };
    view.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, view.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([198, 178, 150, 255]));
    gl.enable(gl.DEPTH_TEST);
    return true;
  }
  function compile(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) return null;
    return s;
  }

  function rebuild() {
    if (!view) return;
    var grid = view.grid || flatGrid(view.scene);
    view.hoverPart = '';
    view.bufHover = null;
    view.built = compose(view.scene, grid, view.sun, {
      slope: view.slope, contours: view.contoursOn, textured: !!(view.gl && view.texOn && !view.slope),
      wires: view.wires, yard: view.yard, exag: view.exag == null ? 1 : view.exag
    });
    view.perf.triangles = view.built.triangles;
    if (view.gl) uploadAll();
  }
  function flatGrid(scene) {
    var b = scene.bounds, pad = 60;
    return gridFrom({
      n: 2, minX: b.minX - pad, minY: b.minY - pad, maxX: b.maxX + pad, maxY: b.maxY + pad,
      z: function () { return 0; }, source: 'pending', datum: 0
    });
  }
  function uploadAll() {
    view.bufT = uploadTris(view.built.terrain);
    view.bufS = uploadTris(view.built.solid);
    view.bufH = uploadTris(view.built.shadows);
    view.bufL = uploadLines(view.built.lines);
  }
  function uploadTris(tris) {
    var gl = view.gl;
    var buf = new Float32Array(tris.length * 3 * 11);
    var o = 0, i, k, t, p, uv;
    for (i = 0; i < tris.length; i++) {
      t = tris[i];
      for (k = 0; k < 3; k++) {
        p = t.p[k]; uv = t.uv[k];
        buf[o++] = p[0]; buf[o++] = p[1]; buf[o++] = p[2];
        buf[o++] = t.n[0]; buf[o++] = t.n[1]; buf[o++] = t.n[2];
        buf[o++] = t.c[0]; buf[o++] = t.c[1]; buf[o++] = t.c[2];
        buf[o++] = uv[0]; buf[o++] = uv[1];
      }
    }
    var b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, buf, gl.DYNAMIC_DRAW);
    return { buf: b, count: tris.length * 3 };
  }
  function uploadLines(lines) {
    var gl = view.gl;
    var buf = new Float32Array(lines.length * 2 * 11);
    var o = 0, i, k, p, c;
    for (i = 0; i < lines.length; i++) {
      for (k = 0; k < 2; k++) {
        p = lines[i][k]; c = lines[i][2];
        buf[o++] = p[0]; buf[o++] = p[1]; buf[o++] = p[2];
        buf[o++] = 0; buf[o++] = 1; buf[o++] = 0;
        buf[o++] = c[0]; buf[o++] = c[1]; buf[o++] = c[2];
        buf[o++] = 0; buf[o++] = 0;
      }
    }
    var b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, buf, gl.DYNAMIC_DRAW);
    return { buf: b, count: lines.length * 2 };
  }

  function frame(now) {
    if (!view || !view.open) return;
    if (view.flying) {
      view.flyT += 1 / 60;
      var u = clamp(view.flyT / 0.9, 0, 1);
      u = u * u * (3 - 2 * u);
      view.cam.pitch = 1.35 + (view.home.pitch - 1.35) * u;
      view.cam.yaw = 0.15 + (view.home.yaw - 0.15) * u;
      view.cam.radius = (view.span0 || view.home.radius) + (view.home.radius - (view.span0 || view.home.radius)) * u;
      if (view.flyT >= 0.9) view.flying = false;
    }
    if (view.tour && view.tour.playing && !view.userMoved) easeTour();
    draw();
    layoutMarkers();
    if (!view.perf.fpsT) view.perf.fpsT = now;
    view.perf.frames++;
    if (!view.perf.fps && now - view.perf.fpsT > 1000) {
      view.perf.fps = Math.round(view.perf.frames * 1000 / (now - view.perf.fpsT));
      paintPerf();
    }
    view.raf = requestAnimationFrame(frame);
  }
  function draw() {
    if (!view) return;
    sizeCanvas();
    if (!view.built) rebuild();
    view.cam.mvp = mvpOf(view.cam, view.cssW / Math.max(1, view.cssH));
    if (view.gl) drawGl();
    else if (view.ctx2) draw2d();
  }
  function drawGl() {
    var gl = view.gl;
    gl.viewport(0, 0, view.canvas.width, view.canvas.height);
    gl.clearColor(0.72, 0.80, 0.86, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(view.program);
    gl.uniformMatrix4fv(view.loc.mvp, false, new Float32Array(view.cam.mvp));
    var sv = sunVector(view.sun);
    gl.uniform3f(view.loc.sun, sv[0], sv[1], sv[2]);
    gl.uniform1f(view.loc.amb, view.sun.altitude > 2 ? 0.42 : 0.75);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, view.tex);
    gl.uniform1f(view.loc.lit, 0);
    gl.uniform1f(view.loc.texOn, view.texOn && !view.slope ? 1 : 0);
    drawBuf(view.bufT, gl.TRIANGLES);
    gl.uniform1f(view.loc.texOn, 0);
    drawBuf(view.bufH, gl.TRIANGLES);
    gl.uniform1f(view.loc.lit, 1);
    drawBuf(view.bufS, gl.TRIANGLES);
    if (view.bufHover && view.bufHover.count) {
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(-2, -2);
      gl.uniform1f(view.loc.lit, 0);
      drawBuf(view.bufHover, gl.TRIANGLES);
      gl.disable(gl.POLYGON_OFFSET_FILL);
    }
    gl.uniform1f(view.loc.lit, 0);
    drawBuf(view.bufL, gl.LINES);
  }
  function drawBuf(buf, mode) {
    if (!buf || !buf.count) return;
    var gl = view.gl, L = view.loc, stride = 44;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf.buf);
    gl.enableVertexAttribArray(L.pos); gl.vertexAttribPointer(L.pos, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(L.nrm); gl.vertexAttribPointer(L.nrm, 3, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(L.col); gl.vertexAttribPointer(L.col, 3, gl.FLOAT, false, stride, 24);
    gl.enableVertexAttribArray(L.uv); gl.vertexAttribPointer(L.uv, 2, gl.FLOAT, false, stride, 36);
    gl.drawArrays(mode, 0, buf.count);
  }
  function draw2d() {
    var ctx = view.ctx2, w = view.cssW, h = view.cssH;
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.fillStyle = '#B7C9D6';
    ctx.fillRect(0, 0, w, h);
    var tris = view.built.shadows.concat(view.built.terrain, view.built.solid);
    var bag = [], i, k, t, pts, depth, ok;
    for (i = 0; i < tris.length; i++) {
      t = tris[i]; pts = []; depth = 0; ok = true;
      for (k = 0; k < 3; k++) {
        var pr = projectPoint(view.cam, w / Math.max(1, h), w, h, t.p[k]);
        if (!pr) { ok = false; break; }
        pts.push(pr); depth += pr.depth;
      }
      if (ok) bag.push({ pts: pts, c: t.c, d: depth / 3, id: t.id });
    }
    bag.sort(function (a, b) { return b.d - a.d; });
    for (i = 0; i < bag.length; i++) {
      t = bag[i];
      ctx.beginPath();
      ctx.moveTo(t.pts[0].x, t.pts[0].y);
      ctx.lineTo(t.pts[1].x, t.pts[1].y);
      ctx.lineTo(t.pts[2].x, t.pts[2].y);
      ctx.closePath();
      var col = (view.hoverPart && t.id === view.hoverPart) ? [1, 0.82, 0.35] : t.c;
      ctx.fillStyle = 'rgb(' + Math.round(clamp(col[0], 0, 1) * 255) + ',' + Math.round(clamp(col[1], 0, 1) * 255) + ',' + Math.round(clamp(col[2], 0, 1) * 255) + ')';
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(22,32,43,.45)';
    ctx.lineWidth = 1;
    for (i = 0; i < view.built.lines.length; i++) {
      var a = projectPoint(view.cam, w / h, w, h, view.built.lines[i][0]);
      var b = projectPoint(view.cam, w / h, w, h, view.built.lines[i][1]);
      if (!a || !b) continue;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
  }

  function bindPointer() {
    var c = view.canvas, drag = null, pointers = {};
    c.addEventListener('contextmenu', function (ev) { ev.preventDefault(); });
    c.addEventListener('pointerdown', function (ev) {
      try { c.setPointerCapture(ev.pointerId); } catch (e) {}
      pointers[ev.pointerId] = { x: ev.clientX, y: ev.clientY };
      drag = { x: ev.clientX, y: ev.clientY, yaw: view.cam.yaw, pitch: view.cam.pitch, moved: false, button: ev.button,
        tx: view.cam.target.x, tz: view.cam.target.z };
      view.flying = false;
      if (view.tour) view.tour.playing = false;
    });
    c.addEventListener('pointermove', function (ev) {
      if (!drag || !pointers[ev.pointerId]) { hoverAt(ev); return; }
      pointers[ev.pointerId] = { x: ev.clientX, y: ev.clientY };
      var ids = Object.keys(pointers);
      if (ids.length >= 2) {
        var a = pointers[ids[0]], b = pointers[ids[1]];
        var dist = hypot(a.x - b.x, a.y - b.y);
        if (drag.pinch) view.cam.radius = clamp(drag.pinchR * drag.pinch / dist, 30, 8000);
        else { drag.pinch = dist; drag.pinchR = view.cam.radius; }
        return;
      }
      var dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
      if (dx * dx + dy * dy > 36) {
        drag.moved = true;
        view.userMoved = true;
        if (view.hint) view.hint.style.display = 'none';
      }
      if (ev.shiftKey || drag.button === 2) {
        var eye = cameraEye(view.cam);
        var scale = view.cam.radius / Math.max(200, view.cssH);
        view.cam.target.x = drag.tx - dx * scale;
        view.cam.target.z = drag.tz + dy * scale;
      } else {
        view.cam.yaw = drag.yaw - dx * 0.005;
        view.cam.pitch = clamp(drag.pitch - dy * 0.004, 0.12, 1.45);
      }
    });
    c.addEventListener('pointerup', function (ev) {
      delete pointers[ev.pointerId];
      if (drag && !drag.moved && ev.button === 0) pickClick(ev);
      if (Object.keys(pointers).length === 0) drag = null;
    });
    c.addEventListener('pointercancel', function (ev) { delete pointers[ev.pointerId]; drag = null; });
    c.addEventListener('pointerleave', function () { if (!drag) paintHover(''); });
    c.addEventListener('wheel', function (ev) {
      ev.preventDefault();
      view.userMoved = true;
      view.flying = false;
      view.cam.radius = clamp(view.cam.radius * (ev.deltaY > 0 ? 1.08 : 0.92), 30, 8000);
    }, { passive: false });
  }
  function pointerPx(ev) {
    var rect = view.canvas.getBoundingClientRect();
    var sx = (ev.clientX - rect.left) * (view.cssW / (rect.width || 1));
    var sy = (ev.clientY - rect.top) * (view.cssH / (rect.height || 1));
    return { x: sx, y: sy };
  }
  function hitAt(ev) {
    if (!view || !view.built) return null;
    var p = pointerPx(ev);
    return pickMesh(view.built, view.cam, view.cssW / Math.max(1, view.cssH), view.cssW, view.cssH, p.x, p.y);
  }
  function paintHover(part) {
    if (!view || !view.built) return;
    part = part || '';
    if (view.hoverPart === part) return;
    view.hoverPart = part;
    var tris = [], i, t, src = view.built.solid;
    if (part) {
      for (i = 0; i < src.length; i++) {
        t = src[i];
        if (t.id !== part) continue;
        tris.push({ p: t.p, n: t.n, c: [1, 0.82, 0.35], uv: t.uv, id: t.id });
      }
    }
    if (view.gl && view.bufHover && view.bufHover.buf) view.gl.deleteBuffer(view.bufHover.buf);
    if (view.gl) view.bufHover = tris.length ? uploadTris(tris) : null;
    if (view.canvas) view.canvas.style.cursor = part ? 'pointer' : '';
  }
  function hoverAt(ev) {
    var hit = hitAt(ev);
    paintHover(hit && hit.part);
  }
  function showHit(hit) {
    if (!hit) return;
    view.selection = [hit.id];
    if (hit.id.indexOf('grid-line-') === 0) {
      var idx = +hit.id.slice(10);
      var wire = view.wires && view.wires[idx];
      showCard({ id: hit.id, kind: 'grid', key: 'line', label: wire && wire.label || 'Transmission line', note: wire && wire.note || '' });
      return;
    }
    if (view.opts.onSelection && hit.id !== 'grid-sub') view.opts.onSelection(view.selection.slice());
    showCard(hit.id === 'grid-sub' ? gridObject(view.gridInfo && view.gridInfo.sub) : findObject(view.scene, hit.id));
  }
  function pickClick(ev) {
    showHit(hitAt(ev));
  }

  function markSelected() {
    if (!view || !view.markerEls) return;
    var id = view.selection && view.selection[0];
    var keys = Object.keys(view.markerEls), i, node;
    for (i = 0; i < keys.length; i++) {
      node = view.markerEls[keys[i]];
      if (keys[i] === id) node.className = 'v3d-tag on';
      else node.className = 'v3d-tag';
    }
  }
  function markerList() {
    var list = [], i, o, mid, scene = view.scene;
    function add(id, label, x, y) {
      if (!finite(x) || !finite(y)) return;
      list.push({ id: id, label: label, x: x, y: y });
    }
    for (i = 0; i < scene.objects.length; i++) {
      o = scene.objects[i];
      if (o.kind === 'equip' || o.kind === 'array') add(o.id, o.label || o.key, o.x, o.y);
      else if ((o.kind === 'conduit' || o.kind === 'fence') && o.pts && o.pts.length) {
        mid = o.pts[Math.floor(o.pts.length / 2)];
        add(o.id, o.label || o.kind, mid.x, mid.y);
      }
    }
    for (i = 0; i < (scene.prisms || []).length; i++) {
      o = scene.prisms[i];
      var bb = ringBBox(o.ring);
      add(o.id, o.label || 'Building', bb.cx, bb.cy);
    }
    for (i = 0; i < (scene.lines || []).length; i++) {
      o = scene.lines[i];
      if (o.kind !== 'line' || !o.pts || o.pts.length < 2) continue;
      mid = o.pts[Math.floor(o.pts.length / 2)];
      add(o.id, 'Line', mid.x, mid.y);
    }
    if (view.yard) add('grid-sub', view.yard.label, view.yard.x, view.yard.y);
    for (i = 0; i < (view.wires || []).length; i++) {
      if (!view.wires[i].label || !view.wires[i].pts || !view.wires[i].pts.length) continue;
      mid = view.wires[i].pts[Math.floor(view.wires[i].pts.length / 2)];
      add('grid-line-' + i, view.wires[i].label, mid.x, mid.y);
    }
    return list;
  }
  function layoutMarkers() {
    if (!view || !view.overlay) return;
    if (!view.markerEls) view.markerEls = {};
    var list = markerList(), want = {}, i, item, node, p, pos, placed = [];
    var aspect = view.cssW / Math.max(1, view.cssH);
    var grid = view.grid;
    function gy(x, y) {
      if (!grid) return 0;
      return relY(grid, elevAt(grid, x, y), view.exag);
    }
    for (i = 0; i < list.length; i++) {
      item = list[i];
      want[item.id] = true;
      node = view.markerEls[item.id];
      if (!node) {
        node = document.createElement('button');
        node.type = 'button';
        node.className = 'v3d-tag';
        node.addEventListener('click', markerClick);
        view.overlay.appendChild(node);
        view.markerEls[item.id] = node;
      }
      node.dataset.id = item.id;
      node.textContent = item.label;
      p = projectPoint(view.cam, aspect, view.cssW, view.cssH, [item.x, gy(item.x, item.y) + (item.id === 'grid-sub' ? 20 : 8), item.y]);
      if (!p || p.x < -20 || p.y < -20 || p.x > view.cssW + 20 || p.y > view.cssH + 20) {
        node.style.display = 'none';
        continue;
      }
      pos = nudgeTag(p.x, p.y, placed, view.cssW, view.cssH);
      node.style.display = 'block';
      node.style.left = pos.x + 'px';
      node.style.top = pos.y + 'px';
    }
    var keys = Object.keys(view.markerEls);
    for (i = 0; i < keys.length; i++) if (!want[keys[i]]) {
      if (view.markerEls[keys[i]].parentNode) view.markerEls[keys[i]].parentNode.removeChild(view.markerEls[keys[i]]);
      delete view.markerEls[keys[i]];
    }
    markSelected();
  }
  function nudgeTag(x, y, placed, w, h) {
    if (y < 52 && x < 90) y = 52;
    if (y > h - 64 && x < 160) y = h - 64;
    var guard = 0, i, hit;
    while (guard++ < 10) {
      hit = false;
      for (i = 0; i < placed.length; i++) {
        if (Math.abs(placed[i].x - x) < 42 && Math.abs(placed[i].y - y) < 18) { y -= 18; hit = true; break; }
      }
      if (!hit) break;
    }
    placed.push({ x: x, y: y });
    return { x: x, y: y };
  }
  function markerClick(ev) {
    ev.preventDefault();
    ev.stopPropagation();
    var id = ev.currentTarget.dataset.id;
    if (!id) return;
    if (id.indexOf('grid-line-') === 0) {
      var idx = +id.slice(10);
      var wire = view.wires && view.wires[idx];
      showCard({ id: id, kind: 'grid', key: 'line', label: wire && wire.label || 'Transmission line', note: wire && wire.note || '' });
      return;
    }
    view.selection = [id];
    if (id !== 'grid-sub' && view.opts.onSelection) view.opts.onSelection(view.selection.slice());
    showCard(id === 'grid-sub' ? gridObject(view.gridInfo && view.gridInfo.sub) : findObject(view.scene, id));
  }

  function paintCredit() {
    if (!view || !view.credit) return;
    var mult = view.exag == null ? 1 : view.exag;
    var elevation = view.perf.elevation === 'usgs-3dep' ? 'USGS 3DEP' : (view.perf.elevation === 'pending' ? 'Elevation loading' : 'Elevation unavailable · flat ground');
    view.credit.textContent = elevation + (view.perf.imagery ? ' · Esri World Imagery' : '') + ' · ' + (mult === 1 ? '1× scale' : (mult + '× relief'));
  }
  function buildUi() {
    var back = el('button', 'v3d-back', '2D');
    back.type = 'button';
    back.title = 'Back to the plan';
    back.addEventListener('click', function () { close(); });
    var top = el('div', 'v3d-top');
    top.appendChild(back);
    view.overlay.appendChild(top);
    view.hint = el('div', 'v3d-hint', 'Drag to look. Scroll to zoom.');
    view.overlay.appendChild(view.hint);
    view.ring = document.createElement('button');
    view.ring.type = 'button';
    view.ring.className = 'v3d-ring';
    view.ring.addEventListener('click', function () {
      if (view.panelMode === 'screen') hidePanel();
      else showScreen();
    });
    view.overlay.appendChild(view.ring);
    view.credit = el('div', 'v3d-credit', '');
    paintCredit();
    view.overlay.appendChild(view.credit);
    view.caption = el('div', 'v3d-caption', '');
    view.caption.style.display = 'none';
    view.caption.setAttribute('aria-live', 'polite');
    view.overlay.appendChild(view.caption);
    view.panel = el('aside', 'v3d-panel');
    view.panel.style.display = 'none';
    view.overlay.appendChild(view.panel);
    view.span0 = view.cam.radius;
    updateRing();
    if (view.perf.fallback) {
      view.hint.textContent = view.perf.fallback;
    }
  }
  function updateRing() {
    var ready = readiness(view.scene, view.civil);
    view.score = ready.score;
    view.steps = ready.steps;
    var c = 2 * Math.PI * 18;
    var dash = (ready.score / 100) * c;
    view.ring.innerHTML = '';
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 44 44');
    svg.setAttribute('width', '52');
    svg.setAttribute('height', '52');
    svg.setAttribute('aria-hidden', 'true');
    function circ(stroke, array) {
      var n = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      n.setAttribute('cx', '22'); n.setAttribute('cy', '22'); n.setAttribute('r', '18');
      n.setAttribute('fill', 'none'); n.setAttribute('stroke', stroke); n.setAttribute('stroke-width', '3.5');
      if (array) {
        n.setAttribute('stroke-dasharray', dash.toFixed(2) + ' ' + (c - dash).toFixed(2));
        n.setAttribute('stroke-linecap', 'round');
        n.setAttribute('transform', 'rotate(-90 22 22)');
      }
      svg.appendChild(n);
    }
    circ('#E6ECF2');
    circ(ready.score >= 80 ? '#1F6B45' : (ready.score >= 50 ? '#1F4E79' : '#9F2D2D'), true);
    view.ring.appendChild(svg);
    var num = el('span', '', String(ready.score));
    num.style.cssText = 'position:absolute;left:0;right:0;top:16px;text-align:center;font-size:13px;font-weight:700;pointer-events:none;';
    view.ring.appendChild(num);
    view.ring.setAttribute('aria-label', 'Bankability screen, ' + ready.score + ' of 100. Opens the site screen.');
    if (view.panelMode === 'screen') showScreen();
  }
  function hidePanel() {
    view.panelMode = null;
    view.panel.style.display = 'none';
    view.panel.innerHTML = '';
  }
  function panelShell(title) {
    view.panel.innerHTML = '';
    view.panel.style.display = 'block';
    var x = el('button', 'v3d-x', '×');
    x.type = 'button';
    x.setAttribute('aria-label', 'Close');
    x.addEventListener('click', hidePanel);
    view.panel.appendChild(x);
    view.panel.appendChild(el('h3', '', title));
    return view.panel;
  }
  function showCard(object) {
    if (!object) return;
    view.panelMode = 'card';
    if (object.key === 'substation') { showSubstation(object); return; }
    if (object.kind === 'grid' && object.key === 'line') { showGridLine(object); return; }
    var card = analyze(object, view.scene, view.summary, view.civil, view.gridInfo);
    var host = panelShell(card.label);
    host.appendChild(el('p', '', card.status));
    if (object.w) row(host, 'Footprint', Math.round(object.w) + ' × ' + Math.round(object.d || object.h || 0) + ' ft');
    if (object.h && object.kind === 'equip') row(host, 'Height', object.h.toFixed(1) + ' ft');
    if (card.kw) row(host, 'kW', String(Math.round(card.kw * 10) / 10));
    if (card.kwh) row(host, 'kWh', String(Math.round(card.kwh)));
    if (card.kwShare != null) row(host, 'Share of solar', pct(card.kwShare));
    if (card.kwhShare != null) row(host, 'Share of storage', pct(card.kwhShare));
    if (object.kind === 'array' || object.key === 'bess') {
      var price = el('p', 'v3d-note', 'Loading screening cost…');
      host.appendChild(price);
      var auth = root.OmegaEditorV2Auth;
      (auth ? auth.idToken() : Promise.resolve('')).then(function (token) {
        if (!token) throw new Error('Sign in to see screening cost.');
        return fetch('/api/editor-v2-component-cost', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
          body: JSON.stringify({ kind: object.kind, key: object.key, kw: card.kw, kwh: card.kwh,
            solarKw: view.summary.solarKwDc, mount: object.mount })
        }).then(function (r) { if (!r.ok) throw new Error('Screening cost is unavailable.'); return r.json(); });
      }).then(function (answer) {
        price.textContent = answer.cost == null ? 'Not priced.' : 'Screening cost: ' + money(answer.cost) + '. ' + answer.note;
      }).catch(function (e) { price.textContent = e.message || 'Screening cost is unavailable.'; });
    }
    if (card.energyMwh) row(host, 'Energy share', Math.round(card.energyMwh) + ' MWh/yr' + (card.energyShare != null ? ' · ' + pct(card.energyShare) : ''));
    if (card.pad) row(host, 'Slope', card.pad.slopePct.toFixed(1) + '% · limit ' + card.pad.limitPct + '%');
    if (object.kind === 'conduit' && view.civil) row(host, 'Over terrain', Math.round(view.civil.trenchTerrainFt) + ' ft');
    var i;
    if (card.warnings.length) {
      host.appendChild(el('div', 'v3d-h', 'Warnings'));
      for (i = 0; i < card.warnings.length; i++) host.appendChild(el('p', '', card.warnings[i]));
    }
    host.appendChild(el('div', 'v3d-h', 'Connections'));
    for (i = 0; i < card.connections.length; i++) host.appendChild(el('p', '', card.connections[i]));
    if (card.costNote && card.cost) host.appendChild(el('p', 'v3d-note', card.costNote));
    var siteBtn = el('button', 'v3d-btn', 'Site screen');
    siteBtn.type = 'button';
    siteBtn.style.marginTop = '10px';
    siteBtn.addEventListener('click', showScreen);
    host.appendChild(siteBtn);
    markSelected();
  }
  function gridObject(sub) {
    sub = sub || {};
    return {
      id: 'grid-sub', kind: 'grid', key: 'substation',
      label: sub.name || 'Substation',
      kv: sub.kv, mi: sub.mi
    };
  }
  function showSubstation(object) {
    var host = panelShell(object.label);
    host.appendChild(el('p', '', 'Published substation. Straight-line from this site, not a circuit path.'));
    if (object.kv) row(host, 'Voltage', Math.round(object.kv) + ' kV');
    if (object.mi != null) row(host, 'Distance', object.mi.toFixed(2) + ' mi');
    host.appendChild(el('p', 'v3d-note', 'Placed at the edge of the model because the station itself is off the parcel. Grid Atlas scoring stays on the server.'));
    markSelected();
  }
  function showGridLine(object) {
    var host = panelShell(object.label || 'Transmission line');
    host.appendChild(el('p', '', object.note || 'A published transmission line near this site. Not a circuit path and not a hosting-capacity figure.'));
    markSelected();
  }
  function showScreen() {
    view.panelMode = 'screen';
    var host = panelShell('Site screen');
    host.appendChild(el('p', '', 'A screen of what is on the plan. It is not a bank letter.'));
    var i, s, line, mark;
    for (i = 0; i < (view.steps || []).length; i++) {
      s = view.steps[i];
      line = el('div', 'v3d-step');
      line.appendChild(el('span', '', s.label));
      mark = el('span', s.state === 'pass' ? 'v3d-ok' : (s.state === 'fail' ? 'v3d-no' : 'v3d-wait'), s.state === 'pass' ? 'Yes' : (s.state === 'fail' ? 'No' : '…'));
      line.appendChild(mark);
      host.appendChild(line);
    }
    var actions = el('div', 'v3d-actions');
    var walk = el('button', 'v3d-btn', view.tour && view.tour.playing ? 'Stop the walk' : 'Walk the site');
    walk.type = 'button';
    walk.addEventListener('click', function () {
      if (view.tour && view.tour.playing) stopTour();
      else startTour();
      showScreen();
    });
    actions.appendChild(walk);
    function toggle(label, key) {
      var b = el('button', 'v3d-btn', label);
      b.type = 'button';
      b.setAttribute('aria-pressed', view[key] ? 'true' : 'false');
      b.addEventListener('click', function () {
        view[key] = !view[key];
        rebuild();
        showScreen();
      });
      actions.appendChild(b);
    }
    toggle('Contours', 'contoursOn');
    toggle('Slope', 'slope');
    var scale = el('div', 'v3d-scale');
    scale.appendChild(el('span', '', 'Vertical exaggeration'));
    var slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '1';
    slider.max = '3';
    slider.step = '0.25';
    slider.value = String(view.exag == null ? 1 : view.exag);
    slider.setAttribute('aria-label', 'Vertical exaggeration');
    var read = el('b', '', (view.exag == null || view.exag === 1) ? 'Off' : (view.exag + '×'));
    slider.addEventListener('input', function () {
      view.exag = +slider.value || 1;
      read.textContent = view.exag === 1 ? 'Off' : (view.exag + '×');
      if (view.grid && view.civil && view.civil.meanElevFt != null) {
        view.cam.target.y = relY(view.grid, view.civil.meanElevFt, view.exag);
        view.home.target.y = view.cam.target.y;
      }
      rebuild();
      paintCredit();
    });
    scale.appendChild(slider);
    scale.appendChild(read);
    host.appendChild(scale);
    host.appendChild(el('p', 'v3d-note', 'Off keeps the surveyed feet. Slope percents stay that rise over run.'));
    var shot = el('button', 'v3d-btn', 'Save image');
    shot.type = 'button';
    shot.addEventListener('click', snapshot);
    actions.appendChild(shot);
    if (view.cfg && view.cfg.photorealistic) {
      var photo = el('button', 'v3d-btn', 'Photorealistic');
      photo.type = 'button';
      photo.addEventListener('click', startPhotorealistic);
      actions.appendChild(photo);
    }
    host.appendChild(actions);
    host.appendChild(el('div', 'v3d-h', 'Sun'));
    var date = document.createElement('input');
    date.type = 'date';
    date.value = isoDate(view.when);
    var time = document.createElement('input');
    time.type = 'time';
    time.value = isoTime(view.when);
    function applyWhen() {
      var next = new Date(date.value + 'T' + (time.value || '12:00'));
      if (!isNaN(next.getTime())) {
        view.when = next;
        view.sun = sunPosition(view.scene.anchor.lat, view.scene.anchor.lng, next);
        rebuild();
      }
    }
    date.addEventListener('change', applyWhen);
    time.addEventListener('change', applyWhen);
    var sunRow = el('div', 'v3d-actions');
    sunRow.appendChild(date); sunRow.appendChild(time);
    host.appendChild(sunRow);
    host.appendChild(el('p', 'v3d-note', 'Sun altitude ' + Math.round(view.sun.altitude) + '°, azimuth ' + Math.round(view.sun.azimuth) + '°. Shading check, not a survey.'));
    if (view.civil) {
      host.appendChild(el('div', 'v3d-h', 'Civil'));
      if (view.civil.cutCy == null) host.appendChild(el('p', '', view.civil.note));
      else {
        if (view.civil.reliefFt != null) row(host, 'Parcel relief', Math.round(view.civil.reliefFt) + ' ft');
        if (view.civil.slopePct != null) row(host, 'Parcel slope', view.civil.slopePct.toFixed(1) + '%');
        row(host, 'Cut', Math.round(view.civil.cutCy) + ' cy');
        row(host, 'Fill', Math.round(view.civil.fillCy) + ' cy');
        row(host, 'Trench on grade', Math.round(view.civil.trenchPlanFt) + ' ft');
        row(host, 'Trench on terrain', Math.round(view.civil.trenchTerrainFt) + ' ft');
        host.appendChild(el('p', 'v3d-note', view.civil.note));
      }
    }
    if (view.gridInfo && view.gridInfo.sub) {
      host.appendChild(el('div', 'v3d-h', 'Grid'));
      host.appendChild(el('p', '', view.gridInfo.sub.name + (view.gridInfo.sub.kv ? ' · ' + Math.round(view.gridInfo.sub.kv) + ' kV' : '') + (view.gridInfo.sub.mi != null ? ' · ' + view.gridInfo.sub.mi.toFixed(2) + ' mi' : '')));
    }
    view.perfEl = el('p', 'v3d-note', '');
    host.appendChild(view.perfEl);
    paintPerf();
  }
  function paintPerf() {
    if (!view || !view.perfEl) return;
    var p = view.perf;
    view.perfEl.textContent = 'First frame ' + (p.firstFrameMs != null ? Math.round(p.firstFrameMs) + ' ms' : '…')
      + (p.fps ? ' · ' + p.fps + ' fps' : '')
      + ' · ' + (p.mode === '2.5d' ? '2.5D' : 'WebGL')
      + ' · ' + (p.triangles || 0) + ' triangles';
  }
  function isoDate(d) {
    var m = d.getMonth() + 1, day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
  }
  function isoTime(d) {
    var h = d.getHours(), min = d.getMinutes();
    return (h < 10 ? '0' : '') + h + ':' + (min < 10 ? '0' : '') + min;
  }

  function startTour() {
    var stops = tourStops(view.scene);
    view.tour = { playing: true, stops: stops, index: 0, t: 0, from: cloneCam(view.cam) };
    view.userMoved = false;
    showCaption(stops[0].caption);
  }
  function stopTour() {
    if (view.tour) view.tour.playing = false;
    view.caption.style.display = 'none';
  }
  function cloneCam(c) {
    return { yaw: c.yaw, pitch: c.pitch, radius: c.radius, tx: c.target.x, ty: c.target.y, tz: c.target.z };
  }
  function easeTour() {
    var tour = view.tour, stop = tour.stops[tour.index];
    if (!stop) { stopTour(); return; }
    tour.t += 1 / 60;
    var u = clamp(tour.t / 0.8, 0, 1);
    u = u * u * (3 - 2 * u);
    var dest = stopCamera(stop);
    view.cam.yaw = tour.from.yaw + (dest.yaw - tour.from.yaw) * u;
    view.cam.pitch = tour.from.pitch + (dest.pitch - tour.from.pitch) * u;
    view.cam.radius = tour.from.radius + (dest.radius - tour.from.radius) * u;
    view.cam.target.x = tour.from.tx + (dest.tx - tour.from.tx) * u;
    view.cam.target.z = tour.from.tz + (dest.tz - tour.from.tz) * u;
    if (tour.t > 3.2) {
      tour.index++;
      if (tour.index >= tour.stops.length) { stopTour(); return; }
      tour.t = 0;
      tour.from = cloneCam(view.cam);
      showCaption(tour.stops[tour.index].caption);
    }
  }
  function stopCamera(stop) {
    if (!stop || stop.kind === 'overview' || stop.x == null) {
      return { yaw: view.home.yaw, pitch: view.home.pitch, radius: view.home.radius, tx: view.home.target.x, tz: view.home.target.z };
    }
    return { yaw: view.home.yaw, pitch: 0.5, radius: Math.max(70, Math.min(view.home.radius * 0.45, 220)), tx: stop.x, tz: stop.y };
  }
  function showCaption(text) {
    view.caption.textContent = text;
    view.caption.style.display = 'block';
  }

  function snapshot() {
    draw();
    var src = view.canvas;
    var out = document.createElement('canvas');
    out.width = src.width; out.height = src.height;
    var ctx = out.getContext('2d');
    ctx.drawImage(src, 0, 0);
    var bar = Math.floor(28 * (view.dpr || 1));
    ctx.fillStyle = '#16202B';
    ctx.fillRect(0, out.height - bar, out.width, bar);
    ctx.fillStyle = '#F8FAFC';
    ctx.font = Math.floor(12 * (view.dpr || 1)) + 'px sans-serif';
    var stamp = (view.scene.name || 'Site') + ' · ' + isoDate(view.when) + ' · screening view · USGS 3DEP';
    ctx.fillText(stamp, 10 * (view.dpr || 1), out.height - 9 * (view.dpr || 1));
    var a = document.createElement('a');
    a.href = out.toDataURL('image/png');
    a.download = (view.scene.name || 'site').replace(/\s+/g, '-').toLowerCase() + '-3d.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function onKey(ev) {
    if (!view || !view.open) return;
    var t = ev.target;
    if (t && t.id === 'cmd') return;
    if (t && view.overlay.contains(t) && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
    if (ev.key === 'Escape') {
      ev.preventDefault();
      ev.stopPropagation();
      close();
      return;
    }
    ev.stopPropagation();
  }

  function close() {
    if (!view) return;
    var ids = (view.selection || []).slice();
    var opts = view.opts;
    view.open = false;
    if (view.raf) cancelAnimationFrame(view.raf);
    window.removeEventListener('resize', view.onResize);
    window.removeEventListener('keydown', view.onKey, true);
    if (view.cesium && view.cesium.destroy) { try { view.cesium.destroy(); } catch (e) {} }
    if (view.overlay && view.overlay.parentNode) view.overlay.parentNode.removeChild(view.overlay);
    var civil = view.civil;
    view = null;
    if (opts && opts.onClose) opts.onClose(ids, civil);
  }
  function toggle(opts) {
    if (isOpen()) { close(); return; }
    return open(opts);
  }
  function sync(doc, summary) {
    if (!isOpen() || !doc || !libs()) return false;
    var sel = (view.selection || []).slice();
    view.scene = sceneOf(doc);
    if (summary) view.summary = summary;
    if (view.grid) view.civil = civilOf(view.scene, view.grid);
    rebuild();
    updateRing();
    if (view.panelMode === 'card' && sel[0]) {
      var obj = sel[0] === 'grid-sub' ? gridObject(view.gridInfo && view.gridInfo.sub) : findObject(view.scene, sel[0]);
      if (obj) showCard(obj);
      else hidePanel();
    }
    return true;
  }

  function loadWorld() {
    var scene = view.scene;
    var b = scene.bounds, pad = 80;
    var minX = b.minX - pad, minY = b.minY - pad, maxX = b.maxX + pad, maxY = b.maxY + pad;
    var sw = G.ftToLatLng(minX, minY, scene.anchor);
    var ne = G.ftToLatLng(maxX, maxY, scene.anchor);
    var geo = { south: Math.min(sw.lat, ne.lat), north: Math.max(sw.lat, ne.lat), west: Math.min(sw.lng, ne.lng), east: Math.max(sw.lng, ne.lng) };
    view.geo = geo;
    view.gridBox = { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
    rebuild();
    loadElevation(geo, view.gridBox).then(function (grid) {
      if (!view) return;
      view.grid = grid;
      view.perf.elevation = grid.source;
      if (grid.source === 'usgs-3dep') {
        view.civil = civilOf(view.scene, grid);
        var mean = view.civil.meanElevFt != null ? relY(grid, view.civil.meanElevFt, view.exag) : 0;
        view.cam.target.y = mean;
        view.home.target.y = mean;
        var relief = view.civil.reliefFt || 0;
        view.home.radius = Math.max(view.home.radius, spanOf(view.scene) * 0.9 + relief * 0.8);
        if (!view.userMoved && !view.flying) view.cam.radius = view.home.radius;
      } else {
        view.civil = civilOf(view.scene, grid);
        if (view.hint) view.hint.textContent = 'Elevation did not load. The ground is flat, not a survey.';
      }
      rebuild();
      paintCredit();
      updateRing();
    }, function () {
      if (!view) return;
      view.perf.elevation = 'unavailable';
      if (view.hint) view.hint.textContent = 'Elevation did not load. The ground is flat, not a survey.';
      paintCredit();
      view.civil = civilOf(view.scene, { source: 'unavailable' });
      updateRing();
    });
    loadImagery(geo);
    loadBuildings(geo);
    loadGrid(scene.anchor);
    loadConfig();
  }
  function spanOf(scene) { return Math.max(scene.bounds.w, scene.bounds.h, 80); }

  function loadElevation(geo, box) {
    var n = 17, pts = [], j, i, lat, lng;
    for (j = 0; j < n; j++) for (i = 0; i < n; i++) {
      lng = geo.west + (geo.east - geo.west) * i / (n - 1);
      lat = geo.south + (geo.north - geo.south) * j / (n - 1);
      pts.push([lng, lat]);
    }
    var body = 'geometry=' + encodeURIComponent(JSON.stringify({ points: pts, spatialReference: { wkid: 4326 } }))
      + '&geometryType=esriGeometryMultipoint&returnFirstValueOnly=true&f=json';
    return withTimeout(fetch(ELEV_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body }).then(function (r) {
      if (!r.ok) throw new Error('elevation ' + r.status);
      return r.json();
    }), 14000).then(function (data) {
      var samples = data && data.samples || [];
      if (samples.length < n * n * 0.8) throw new Error('short elevation');
      var grid = samplesToGrid(samples, geo, box, n);
      fillHoles(grid.z);
      return grid;
    });
  }
  /* getSamples does not keep the order of the points we sent. Each
     sample carries its own location; index order built a false ridge. */
  function samplesToGrid(samples, geo, box, n) {
    var z = [], j, i, row;
    n = n > 1 ? n : 2;
    for (j = 0; j < n; j++) {
      row = [];
      for (i = 0; i < n; i++) row.push(NaN);
      z.push(row);
    }
    var spanLng = (geo.east - geo.west) || 1e-12;
    var spanLat = (geo.north - geo.south) || 1e-12;
    var k, s, lng, lat, v, ii, jj;
    samples = samples || [];
    for (k = 0; k < samples.length; k++) {
      s = samples[k] || {};
      lng = s.location ? +s.location.x : +s.lng;
      lat = s.location ? +s.location.y : +s.lat;
      v = s.value != null ? +s.value : +s.meters;
      if (!finite(lng) || !finite(lat) || !finite(v)) continue;
      ii = Math.round((lng - geo.west) / spanLng * (n - 1));
      jj = Math.round((lat - geo.south) / spanLat * (n - 1));
      if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue;
      z[jj][ii] = v * FT_PER_M;
    }
    return { n: n, minX: box.minX, minY: box.minY, maxX: box.maxX, maxY: box.maxY, z: z, source: 'usgs-3dep' };
  }
  function fillHoles(z) {
    var j, i, k, s, c;
    for (k = 0; k < 4; k++) for (j = 0; j < z.length; j++) for (i = 0; i < z[j].length; i++) {
      if (finite(z[j][i])) continue;
      s = 0; c = 0;
      if (i > 0 && finite(z[j][i - 1])) { s += z[j][i - 1]; c++; }
      if (i + 1 < z[j].length && finite(z[j][i + 1])) { s += z[j][i + 1]; c++; }
      if (j > 0 && finite(z[j - 1][i])) { s += z[j - 1][i]; c++; }
      if (j + 1 < z.length && finite(z[j + 1][i])) { s += z[j + 1][i]; c++; }
      if (c) z[j][i] = s / c;
    }
  }
  function withTimeout(promise, ms) {
    return new Promise(function (resolve, reject) {
      var t = setTimeout(function () { reject(new Error('timed out')); }, ms);
      promise.then(function (v) { clearTimeout(t); resolve(v); }, function (e) { clearTimeout(t); reject(e); });
    });
  }

  function loadImagery(geo) {
    var z = 18, guard = 0;
    function count(zLevel) {
      var a = llTile(geo.north, geo.west, zLevel), b = llTile(geo.south, geo.east, zLevel);
      return { a: a, b: b, n: (b.x - a.x + 1) * (b.y - a.y + 1) };
    }
    var spec = count(z);
    while (spec.n > 16 && z > 15 && guard++ < 8) { z--; spec = count(z); }
    var spanLng = (geo.east - geo.west) || 1e-9, spanLat = (geo.north - geo.south) || 1e-9;
    var tilesX = spec.b.x - spec.a.x + 1, tilesY = spec.b.y - spec.a.y + 1;
    var canvas = document.createElement('canvas');
    canvas.width = Math.max(2, tilesX * 256);
    canvas.height = Math.max(2, tilesY * 256);
    var ctx = canvas.getContext('2d');
    var left = 0, pending = spec.n, any = false;
    function done() {
      if (!view) return;
      if (any && view.gl) {
        var gl = view.gl;
        gl.bindTexture(gl.TEXTURE_2D, view.tex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
        view.texOn = true;
        view.perf.imagery = true;
        rebuild();
      }
    }
    var x, y, img;
    for (x = spec.a.x; x <= spec.b.x; x++) for (y = spec.a.y; y <= spec.b.y; y++) {
      img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = (function (im, tx, ty) {
        return function () {
          try {
            var b = tileBounds(tx, ty, z);
            var px = (b.west - geo.west) / spanLng * canvas.width;
            var py = (geo.north - b.north) / spanLat * canvas.height;
            var pw = (b.east - b.west) / spanLng * canvas.width;
            var ph = (b.north - b.south) / spanLat * canvas.height;
            ctx.drawImage(im, px, py, pw + 1, ph + 1);
            any = true;
          } catch (e) {}
          if (--pending <= 0) done();
        };
      })(img, x, y);
      img.onerror = function () { if (--pending <= 0) done(); };
      img.src = IMG_URL + z + '/' + y + '/' + x;
      left++;
    }
    if (!left) done();
  }
  function tileBounds(tx, ty, zLevel) {
    var n = Math.pow(2, zLevel);
    function lon(t) { return t / n * 360 - 180; }
    function lat(t) {
      var merc = Math.PI * (1 - 2 * t / n);
      return 180 / Math.PI * Math.atan((Math.exp(merc) - Math.exp(-merc)) / 2);
    }
    return { west: lon(tx), east: lon(tx + 1), north: lat(ty), south: lat(ty + 1) };
  }
  function llTile(lat, lng, z) {
    var n = Math.pow(2, z);
    var x = Math.floor((lng + 180) / 360 * n);
    var r = lat * Math.PI / 180;
    var y = Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n);
    return { x: x, y: y };
  }

  function loadBuildings(geo) {
    var q = '[out:json][timeout:12];way["building"](' + geo.south + ',' + geo.west + ',' + geo.north + ',' + geo.east + ');out geom;';
    withTimeout(fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'data=' + encodeURIComponent(q)
    }).then(function (r) { if (!r.ok) throw new Error('osm'); return r.json(); }), 12000).then(function (data) {
      if (!view) return;
      var els = data && data.elements || [], i, elx, ring, tags, ft, bb, skip, p;
      var added = 0;
      for (i = 0; i < els.length && added < 40; i++) {
        elx = els[i];
        if (!elx.geometry || elx.geometry.length < 3) continue;
        ring = [];
        for (p = 0; p < elx.geometry.length; p++) {
          var ftpt = G.latLngToFt(elx.geometry[p].lat, elx.geometry[p].lon, view.scene.anchor);
          ring.push(ftpt);
        }
        bb = ringBBox(ring);
        if (bb.cx < view.gridBox.minX || bb.cx > view.gridBox.maxX || bb.cy < view.gridBox.minY || bb.cy > view.gridBox.maxY) continue;
        skip = false;
        for (p = 0; p < view.scene.prisms.length; p++) {
          if (G.pointInPoly(bb.cx, bb.cy, view.scene.prisms[p].ring)) skip = true;
        }
        if (skip) continue;
        tags = elx.tags || {};
        ft = parseFloat(tags.height);
        if (!(ft > 0)) ft = (parseFloat(tags['building:levels']) || 1.4) * 3.2;
        view.scene.prisms.push({
          id: 'osm_' + (elx.id || added), kind: 'building', key: 'building',
          label: tags.name || 'Nearby building', ring: ring, h: ft * FT_PER_M, color: '#D6D3D1'
        });
        added++;
      }
      view.perf.buildings = added;
      if (added) paintCredit();
      rebuild();
    }, function () {});
  }

  function loadGrid(anchor) {
    var atlas = Promise.resolve(null);
    if (root.OmegaGridAtlas && root.OmegaGridAtlas.run) {
      atlas = root.OmegaGridAtlas.run({ lat: anchor.lat, lng: anchor.lng }).then(function (res) {
        return root.OmegaGridAtlas.summarise ? root.OmegaGridAtlas.summarise(res) : res;
      }, function () { return null; });
    }
    var pub = queryLayer(SUB_LAYER, anchor, 'NAME,MAX_VOLT,MIN_VOLT,CITY,STATE', true).then(function (features) {
      return features;
    }, function () { return []; });
    var lines = queryLayer(LINE_LAYER, anchor, 'VOLTAGE,OWNER,SUB_1,SUB_2', false).then(function (features) {
      return features;
    }, function () { return []; });
    Promise.all([atlas, pub, lines]).then(function (all) {
      if (!view) return;
      var subs = all[1] || [];
      var best = null, i, f, p, mi, dx, dy;
      for (i = 0; i < subs.length; i++) {
        f = subs[i];
        p = featurePoint(f.geometry);
        if (!p) continue;
        var kv = +(f.attributes && (f.attributes.MAX_VOLT || f.attributes.MIN_VOLT));
        if (!(kv > 0) || kv > 1000) kv = null;
        var local = G.latLngToFt(p.lat, p.lng, anchor);
        dx = local.x; dy = local.y;
        mi = Math.sqrt(dx * dx + dy * dy) / 5280;
        if (!best || mi < best.mi) best = { name: (f.attributes && f.attributes.NAME) || 'Substation', kv: kv, mi: mi, lat: p.lat, lng: p.lng, x: local.x, y: local.y };
      }
      var sum = all[0];
      if (sum && sum.nearestSubName) {
        best = best || {};
        best.name = sum.nearestSubName;
        if (sum.maxKv) best.kv = sum.maxKv;
        if (sum.nearestSubKm != null) best.mi = sum.nearestSubKm * 0.621371;
        best.fromAtlas = true;
      }
      var feats = all[2] || [];
      var placed = placeGrid(feats, best, view.scene, view.gridBox, anchor);
      view.wires = placed.wires;
      view.yard = placed.yard;
      view.gridInfo = {
        sub: best,
        lineCount: placed.wires.length,
        error: best ? '' : 'No substation in the public mirror near this point.'
      };
      rebuild();
      if (view.panelMode === 'card' && view.selection[0]) showCard(findObject(view.scene, view.selection[0]));
    }, function () {
      if (!view) return;
      view.gridInfo = { error: 'Grid Atlas did not answer.' };
    });
  }
  function outCode(x, y, box) {
    var c = 0;
    if (x < box.minX) c |= 1;
    if (x > box.maxX) c |= 2;
    if (y < box.minY) c |= 4;
    if (y > box.maxY) c |= 8;
    return c;
  }
  function clipSeg(a, b, box) {
    var x0 = a.x, y0 = a.y, x1 = b.x, y1 = b.y;
    var c0 = outCode(x0, y0, box), c1 = outCode(x1, y1, box), guard = 0, c, x, y;
    while (guard++ < 16) {
      if (!(c0 | c1)) return [{ x: x0, y: y0 }, { x: x1, y: y1 }];
      if (c0 & c1) return null;
      c = c0 ? c0 : c1;
      if (c & 8) { x = x0 + (x1 - x0) * (box.maxY - y0) / ((y1 - y0) || 1e-9); y = box.maxY; }
      else if (c & 4) { x = x0 + (x1 - x0) * (box.minY - y0) / ((y1 - y0) || 1e-9); y = box.minY; }
      else if (c & 2) { y = y0 + (y1 - y0) * (box.maxX - x0) / ((x1 - x0) || 1e-9); x = box.maxX; }
      else { y = y0 + (y1 - y0) * (box.minX - x0) / ((x1 - x0) || 1e-9); x = box.minX; }
      if (c === c0) { x0 = x; y0 = y; c0 = outCode(x0, y0, box); }
      else { x1 = x; y1 = y; c1 = outCode(x1, y1, box); }
    }
    return null;
  }
  function clipPath(pts, box) {
    var out = [], run = null, i, seg;
    pts = pts || [];
    for (i = 1; i < pts.length; i++) {
      seg = clipSeg(pts[i - 1], pts[i], box);
      if (!seg) { if (run && run.length > 1) out.push(run); run = null; continue; }
      if (!run) run = [seg[0], seg[1]];
      else {
        var prev = run[run.length - 1];
        if (Math.abs(prev.x - seg[0].x) > 0.05 || Math.abs(prev.y - seg[0].y) > 0.05) {
          if (run.length > 1) out.push(run);
          run = [seg[0], seg[1]];
        } else run.push(seg[1]);
      }
    }
    if (run && run.length > 1) out.push(run);
    return out;
  }
  function rimPoint(from, to, box) {
    var dx = to.x - from.x, dy = to.y - from.y, len = Math.sqrt(dx * dx + dy * dy) || 1;
    dx /= len; dy /= len;
    var t = 1e12;
    if (dx > 1e-8) t = Math.min(t, (box.maxX - from.x) / dx);
    if (dx < -1e-8) t = Math.min(t, (box.minX - from.x) / dx);
    if (dy > 1e-8) t = Math.min(t, (box.maxY - from.y) / dy);
    if (dy < -1e-8) t = Math.min(t, (box.minY - from.y) / dy);
    var pull = Math.max(16, Math.min(box.maxX - box.minX, box.maxY - box.minY) * 0.06);
    t = Math.max(8, t - pull);
    return { x: from.x + dx * t, y: from.y + dy * t };
  }
  function placeGrid(feats, sub, scene, box, anchor) {
    var wires = [], crossed = 0, i, k, path, pts, clipped, kv, color, ends, note, local, piece;
    scene = scene || { objects: [], bounds: { cx: 0, cy: 0 } };
    box = box || { minX: 0, minY: 0, maxX: 1, maxY: 1 };
    if (!libs()) return { wires: wires, yard: null };
    for (i = 0; i < (feats || []).length && wires.length < 6; i++) {
      path = featurePath(feats[i].geometry);
      if (path.length < 2) continue;
      pts = [];
      for (k = 0; k < path.length; k++) {
        local = G.latLngToFt(path[k].lat, path[k].lng, anchor);
        pts.push(local);
      }
      clipped = clipPath(pts, box);
      kv = feats[i].attributes && +feats[i].attributes.VOLTAGE;
      if (!(kv > 0)) kv = 0;
      color = kv >= 138 ? '#E8590C' : '#D9A404';
      ends = feats[i].attributes || {};
      note = (kv ? Math.round(kv) + ' kV' : 'Transmission') + (ends.SUB_1 ? ', ' + ends.SUB_1 + ' to ' + (ends.SUB_2 || 'the next station') : '') + '. The part of the published line that crosses this model.';
      for (k = 0; k < clipped.length && wires.length < 6; k++) {
        piece = clipped[k];
        if (piece.length < 2) continue;
        crossed++;
        wires.push({ pts: piece, color: color, label: kv ? Math.round(kv) + ' kV' : 'Line', note: note });
      }
    }
    if (!crossed) {
      var center = { x: scene.bounds.cx, y: scene.bounds.cy };
      var bestD = Infinity, bestPt = null, bestKv = 0, bestEnds = null;
      for (i = 0; i < (feats || []).length; i++) {
        path = featurePath(feats[i].geometry);
        pts = [];
        for (k = 0; k < path.length; k++) pts.push(G.latLngToFt(path[k].lat, path[k].lng, anchor));
        for (k = 1; k < pts.length; k++) {
          var a = pts[k - 1], b = pts[k];
          var dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
          var t = l2 < 1e-9 ? 0 : clamp(((center.x - a.x) * dx + (center.y - a.y) * dy) / l2, 0, 1);
          var x = a.x + t * dx, y = a.y + t * dy;
          var d = Math.sqrt((x - center.x) * (x - center.x) + (y - center.y) * (y - center.y));
          if (d < bestD) { bestD = d; bestPt = { x: x, y: y }; bestKv = feats[i].attributes && +feats[i].attributes.VOLTAGE || 0; bestEnds = feats[i].attributes; }
        }
      }
      if (bestPt && bestD < 3 * 5280) {
        var rim = rimPoint(center, bestPt, box);
        var ux = bestPt.x - center.x, uy = bestPt.y - center.y, ul = Math.sqrt(ux * ux + uy * uy) || 1;
        wires.push({
          pts: [rim, { x: rim.x + ux / ul * 36, y: rim.y + uy / ul * 36 }],
          color: bestKv >= 138 ? '#E8590C' : '#D9A404',
          label: (bestKv ? Math.round(bestKv) + ' kV' : 'Line'),
          note: 'Nearest published line, ' + (bestD / 5280).toFixed(2) + ' mi from the site' + (bestEnds && bestEnds.SUB_1 ? ', ' + bestEnds.SUB_1 + ' to ' + (bestEnds.SUB_2 || 'the next station') : '') + '. It does not cross this parcel.'
        });
      }
    }
    var yard = null;
    if (sub && finite(sub.x) && finite(sub.y)) {
      var inside = sub.x >= box.minX && sub.x <= box.maxX && sub.y >= box.minY && sub.y <= box.maxY;
      var at = inside ? { x: sub.x, y: sub.y } : rimPoint({ x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 }, sub, box);
      yard = { x: at.x, y: at.y, label: (sub.name || 'Substation') + (sub.kv ? ' ' + Math.round(sub.kv) + ' kV' : '') };
      var poi = null;
      for (i = 0; i < (scene.objects || []).length; i++) if (scene.objects[i].key === 'poi') poi = scene.objects[i];
      var origin = poi || { x: scene.bounds.cx, y: scene.bounds.cy };
      wires.push({ pts: [origin, at], color: '#B3261E', label: '', note: '' });
    }
    return { wires: wires, yard: yard };
  }

  function queryLayer(layer, anchor, fields, points) {
    var dLat = 8 / 69, dLng = dLat / (Math.cos(anchor.lat * Math.PI / 180) || 1);
    var env = (anchor.lng - dLng) + ',' + (anchor.lat - dLat) + ',' + (anchor.lng + dLng) + ',' + (anchor.lat + dLat);
    var url = layer + '/query?geometry=' + encodeURIComponent(env)
      + '&geometryType=esriGeometryEnvelope&inSR=4326&outSR=4326&spatialRel=esriSpatialRelIntersects&outFields='
      + encodeURIComponent(fields) + '&returnGeometry=true&f=json&resultRecordCount=30';
    return withTimeout(fetch(url).then(function (r) { if (!r.ok) throw new Error('grid'); return r.json(); }), 12000).then(function (data) {
      return data && data.features || [];
    });
  }
  function featurePoint(geom) {
    if (!geom) return null;
    if (finite(geom.x) && finite(geom.y)) return normalizeLL(geom.x, geom.y);
    if (geom.points && geom.points[0]) return normalizeLL(geom.points[0][0], geom.points[0][1]);
    return null;
  }
  function featurePath(geom) {
    var out = [], paths = geom && (geom.paths || geom.rings) || [], i, k, p;
    for (i = 0; i < paths.length; i++) for (k = 0; k < paths[i].length; k++) {
      p = normalizeLL(paths[i][k][0], paths[i][k][1]);
      if (p) out.push(p);
    }
    return out;
  }
  function normalizeLL(x, y) {
    if (!finite(x) || !finite(y)) return null;
    if (Math.abs(x) > 180 || Math.abs(y) > 90) {
      var lng = x / 20037508.34 * 180;
      var lat = y / 20037508.34 * 180;
      lat = 180 / Math.PI * (2 * Math.atan(Math.exp(lat * Math.PI / 180)) - Math.PI / 2);
      return { lng: lng, lat: lat };
    }
    return { lng: x, lat: y };
  }

  function loadConfig() {
    fetch('/api/editor-v2-3d-config').then(function (r) {
      if (!r.ok) return null;
      return r.json();
    }).then(function (cfg) {
      if (!view || !cfg) return;
      view.cfg = cfg;
    }, function () {});
  }

  function startPhotorealistic() {
    if (!view || !view.cfg || !view.cfg.photorealistic) return;
    loadCss(CESIUM_CSS);
    loadScript(CESIUM_JS).then(function () {
      if (!view || !root.Cesium) throw new Error('Cesium did not load');
      var box = el('div', 'v3d-cesium');
      view.overlay.insertBefore(box, view.canvas);
      view.canvas.style.display = 'none';
      var viewer = new root.Cesium.Viewer(box, {
        animation: false, timeline: false, baseLayerPicker: false, geocoder: false,
        homeButton: false, sceneModePicker: false, navigationHelpButton: false,
        infoBox: false, selectionIndicator: false,
        terrainProvider: new root.Cesium.EllipsoidTerrainProvider()
      });
      view.cesium = viewer;
      var rootUrl = '/api/editor-v2-3d-tiles?u=' + encodeURIComponent('https://tile.googleapis.com/v1/3dtiles/root.json');
      var tilesetPromise = root.Cesium.Cesium3DTileset.fromUrl ? root.Cesium.Cesium3DTileset.fromUrl(rootUrl) : null;
      if (!tilesetPromise) throw new Error('This Cesium build has no tileset loader');
      return tilesetPromise.then(function (tileset) {
        viewer.scene.primitives.add(tileset);
        var a = view.scene.anchor;
        viewer.camera.flyTo({ destination: root.Cesium.Cartesian3.fromDegrees(a.lng, a.lat, 450) });
        addCesiumDesign(viewer);
        if (view.credit) view.credit.textContent = 'Google Photorealistic 3D Tiles · the key stays on the server';
      });
    }, function (err) {
      if (view && view.hint) view.hint.textContent = 'Photorealistic tiles did not load. The aerial terrain view is unchanged.';
      if (view && view.canvas) view.canvas.style.display = 'block';
    });
  }
  function addCesiumDesign(viewer) {
    var C = root.Cesium, scene = view.scene, i, o, ll, href;
    href = C.HeightReference && (C.HeightReference.CLAMP_TO_3D_TILE || C.HeightReference.CLAMP_TO_GROUND);
    for (i = 0; i < scene.objects.length; i++) {
      o = scene.objects[i];
      if (o.kind !== 'equip' && o.kind !== 'array') continue;
      ll = G.ftToLatLng(o.x || scene.bounds.cx, o.y || scene.bounds.cy, scene.anchor);
      viewer.entities.add({
        name: o.label,
        position: C.Cartesian3.fromDegrees(ll.lng, ll.lat, 0),
        box: {
          dimensions: new C.Cartesian3((o.w || 20) * 0.3048, (o.d || o.h || 12) * 0.3048, (o.h || 4) * 0.3048),
          material: C.Color.fromCssColorString(o.color || '#1F4E79').withAlpha(0.9),
          heightReference: href
        }
      });
    }
  }
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (root.Cesium) { resolve(); return; }
      var s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('script')); };
      document.head.appendChild(s);
    });
  }
  function loadCss(href) {
    if (document.querySelector('link[href="' + href + '"]')) return;
    var l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = href;
    document.head.appendChild(l);
  }

  var api = {
    VERSION: 'editor-v2-3d/1',
    SLOPE_LIMIT: SLOPE_LIMIT,
    MODEL: MODEL,
    sceneOf: sceneOf,
    civilOf: civilOf,
    sunPosition: sunPosition,
    sunVector: sunVector,
    shadowOffset: shadowOffset,
    gradePad: gradePad,
    trenchLength: trenchLength,
    contours: contours,
    gridFrom: gridFrom,
    samplesToGrid: samplesToGrid,
    elevAt: elevAt,
    readiness: readiness,
    tourStops: tourStops,
    analyze: analyze,
    tiltDeg: tiltDeg,
    trackerTilt: trackerTilt,
    providerPlan: providerPlan,
    projectPoint: projectPoint,
    mvpOf: mvpOf,
    cameraEye: cameraEye,
    compose: compose,
    pickMesh: pickMesh,
    clipPath: clipPath,
    placeGrid: placeGrid,
    sync: sync,
    open: open,
    close: close,
    toggle: toggle,
    isOpen: isOpen,
    lastCivil: lastCivil,
    perf: perf,
    debug: debug
  };
  root.OmegaEditorV2View3D = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : global);
