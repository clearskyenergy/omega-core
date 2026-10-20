/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * Module layout: setback, keepouts, fire pathways, racking, row pitch
 * from the winter-solstice shade window, and a tilt/azimuth search.
 * Feet. East is +x, north is +y. Azimuth is degrees clockwise from north.
 *
 * Polygon inset and point-in-polygon are the drawing's geometry helpers.
 * The spacing rule, the fire path, and the optimizer live here.
 */
'use strict';

var G = require('../../omega-editor-v2-geom.js');
var Sun = require('./solar-sun');

var MOUNTS = {
  'fixed-ground': { label: 'Fixed-tilt ground', setbackFt: 10, tilt: null, gcrCap: 0.55, heightFt: 3, fire: false },
  'tracker-1ax': { label: 'Single-axis tracker', setbackFt: 15, tilt: 0, gcrCap: 0.45, heightFt: 5, fire: false, gcrFloor: 0.28 },
  rooftop: { label: 'Flush roof', setbackFt: 4, tilt: 10, gcrCap: 0.92, heightFt: 0.5, fire: true },
  flush: { label: 'Flush roof', setbackFt: 4, tilt: 10, gcrCap: 0.92, heightFt: 0.5, fire: true },
  carport: { label: 'Carport', setbackFt: 5, tilt: 7, gcrCap: 0.9, heightFt: 14, fire: false },
  'east-west': { label: 'East-west roof', setbackFt: 4, tilt: 10, gcrCap: 0.88, heightFt: 0.5, fire: true }
};

function num(v, d) { var n = +v; return isFinite(n) ? n : d; }

/* Shade-free ground coverage at one sun position.
   GCR = chord / pitch, pitch = chord*cos(tilt) + chord*sin(tilt)/tan(psi). */
function gcrAt(tiltDeg, profileDeg) {
  var tilt = tiltDeg * Math.PI / 180;
  var psi = profileDeg * Math.PI / 180;
  if (!(psi > 0.02)) return 0.15;
  var tanP = Math.tan(psi);
  if (tanP < 0.05) return 0.15;
  var ratio = Math.cos(tilt) + Math.sin(tilt) / tanP;
  if (!(ratio > 0.05)) return 0.95;
  var g = 1 / ratio;
  if (g < 0.15) g = 0.15;
  if (g > 0.98) g = 0.98;
  return g;
}

/* Tightest GCR that stays unshaded from startHour to endHour local solar
   time on the winter solstice. Northern winter is 21 December. */
function solsticeGcr(lat, tilt, azimuth, opt) {
  opt = opt || {};
  var southern = lat < 0;
  var month = southern ? 6 : 12;
  var day = 21;
  var year = opt.year || 2021;
  var start = opt.startHour == null ? 10 : opt.startHour;
  var end = opt.endHour == null ? 14 : opt.endHour;
  var dec = Sun.declinationOn(year, month, day);
  var worst = 0.98, noon = 0.98, hour, ha, ang, psi, g;
  var tz = 0;
  /* Hour angle is (solarTime - 12) * 15. Walk clock hours as solar hours
     by passing hour angle directly. */
  for (hour = start; hour <= end; hour += 0.5) {
    ha = (hour - 12) * 15;
    ang = Sun.angles(lat, dec, ha);
    psi = Sun.profileAngle(ang.altitude, ang.azimuth, azimuth);
    g = gcrAt(tilt, psi);
    if (g < worst) worst = g;
    if (Math.abs(hour - 12) < 0.01) noon = g;
  }
  return {
    gcr: Math.round(worst * 1000) / 1000,
    noonGcr: Math.round(noon * 1000) / 1000,
    month: month,
    day: day,
    window: start + ':00–' + end + ':00 solar',
    southern: southern
  };
}

function trackerGcr(lat) {
  /* At the rotation limit the collector is steep. Size the pitch for a
     60° face on the solstice window, then keep it inside 0.28–0.45. */
  var s = solsticeGcr(lat, 60, 180, { startHour: 9, endHour: 15 });
  var g = s.gcr;
  if (g < 0.28) g = 0.28;
  if (g > 0.45) g = 0.45;
  return { gcr: Math.round(g * 1000) / 1000, basis: s };
}

function dot(a, b) { return a.x * b.x + a.y * b.y; }
function facing(azimuth) {
  var a = azimuth * Math.PI / 180;
  return {
    back: { x: -Math.sin(a), y: -Math.cos(a) },
    along: { x: Math.cos(a), y: -Math.sin(a) }
  };
}

function project(pts, axis) {
  var i, v, min = Infinity, max = -Infinity;
  for (i = 0; i < pts.length; i++) {
    v = dot(pts[i], axis);
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { min: min, max: max };
}

function nearRing(x, y, ring, pad) {
  if (G.pointInPoly(x, y, ring)) return true;
  var i, n = ring.length, a, b, d;
  for (i = 0; i < n; i++) {
    a = ring[i];
    b = ring[(i + 1) % n];
    d = G.closestOnSegment({ x: x, y: y }, a, b).dist;
    if (d <= pad) return true;
  }
  return false;
}

function blocked(corners, exclusions, pad) {
  var e, c;
  for (e = 0; e < exclusions.length; e++) {
    for (c = 0; c < corners.length; c++) {
      if (nearRing(corners[c].x, corners[c].y, exclusions[e], pad)) return true;
    }
  }
  return false;
}

function insideAll(corners, ring) {
  var i;
  for (i = 0; i < corners.length; i++) {
    if (!G.pointInPoly(corners[i].x, corners[i].y, ring)) return false;
  }
  return true;
}

/* Roof pathways: IFC-style perimeter is the setback. An aisle of fireFt
   every 150 ft along the row matches the commercial walkway HelioScope's
   own guide draws on a large roof. */
function inAisle(s, minS, fireFt) {
  if (!(fireFt > 0)) return false;
  var rel = s - minS;
  if (rel < 0) return false;
  var period = 150 + fireFt;
  var m = rel % period;
  return m >= 150;
}

function layout(opts) {
  opts = opts || {};
  var mountKey = MOUNTS[opts.mount] ? opts.mount : 'fixed-ground';
  var preset = MOUNTS[mountKey];
  var ring = opts.boundary || [];
  if (ring.length < 3) return { ok: false, reason: 'A solar design needs a closed boundary.' };
  var mod = opts.module;
  if (!mod || !(mod.lengthFt > 0)) return { ok: false, reason: 'Pick a module from the library.' };
  var lat = num(opts.lat, 33);
  var azimuth = opts.azimuth == null ? (lat >= 0 ? 180 : 0) : num(opts.azimuth, 180);
  var tilt = opts.tilt == null ? (preset.tilt == null ? Math.max(10, Math.min(35, Math.abs(lat))) : preset.tilt) : num(opts.tilt, 25);
  var setback = opts.setbackFt == null ? preset.setbackFt : num(opts.setbackFt, preset.setbackFt);
  var portrait = opts.orientation !== 'landscape';
  var chord = portrait ? mod.lengthFt : mod.widthFt;
  var across = portrait ? mod.widthFt : mod.lengthFt;
  var spacing = null;
  var gcr;
  var explicit = opts.gcr > 0;
  if (explicit) {
    gcr = num(opts.gcr, 0.4);
    spacing = { gcr: gcr, note: 'Row pitch uses the ground-coverage ratio the design asked for.' };
  } else if (mountKey === 'tracker-1ax') {
    spacing = trackerGcr(lat);
    gcr = spacing.gcr;
  } else if (preset.fire && (mountKey === 'rooftop' || mountKey === 'flush' || mountKey === 'east-west')) {
    gcr = preset.gcrCap;
    spacing = { gcr: gcr, note: 'Flush and east-west rows sit in one plane, so the pitch is the frame gap. They do not use the solstice shade rule.' };
  } else {
    spacing = solsticeGcr(lat, tilt, azimuth, {});
    gcr = spacing.gcr;
  }
  if (!explicit && gcr > preset.gcrCap) gcr = preset.gcrCap;
  if (gcr > 0.98) gcr = 0.98;
  if (!explicit && preset.gcrFloor && gcr < preset.gcrFloor) gcr = preset.gcrFloor;
  var pitch = chord / gcr;
  var inset = G.offsetPolygon(ring, setback);
  if (!inset.ok) return inset;
  var field = inset.pts;
  var exclusions = opts.exclusions || [];
  var keepPad = opts.keepoutSetbackFt == null ? (preset.fire ? 2 : 2) : num(opts.keepoutSetbackFt, 2);
  var axes = facing(azimuth);
  var spanS = project(field, axes.along);
  var spanT = project(field, axes.back);
  var fireFt = 0;
  if (preset.fire && opts.firePaths !== false) {
    var wide = Math.max(spanS.max - spanS.min, spanT.max - spanT.min);
    fireFt = opts.firePathFt == null ? (wide > 250 ? 6 : 4) : num(opts.firePathFt, 4);
  }
  var gap = 0.08;
  var stepS = across + gap;
  var groundDepth = chord * Math.cos(tilt * Math.PI / 180);
  var halfS = across / 2;
  var halfT = Math.max(0.4, groundDepth / 2);
  var rows = [];
  var count = 0;
  var watts = 0;
  var cap = opts.maxModules || 80000;
  var capped = false;
  var t, s, row, center, corners, placed;
  for (t = spanT.min + halfT; t <= spanT.max - halfT + 1e-6; t += pitch) {
    row = { index: rows.length, count: 0, x: 0, y: 0, shade: null, samples: [] };
    placed = 0;
    var centers = [];
    for (s = spanS.min + halfS; s <= spanS.max - halfS + 1e-6; s += stepS) {
      if (inAisle(s, spanS.min, fireFt)) continue;
      center = { x: axes.along.x * s + axes.back.x * t, y: axes.along.y * s + axes.back.y * t };
      corners = [
        { x: center.x + axes.along.x * halfS + axes.back.x * halfT, y: center.y + axes.along.y * halfS + axes.back.y * halfT },
        { x: center.x - axes.along.x * halfS + axes.back.x * halfT, y: center.y - axes.along.y * halfS + axes.back.y * halfT },
        { x: center.x + axes.along.x * halfS - axes.back.x * halfT, y: center.y + axes.along.y * halfS - axes.back.y * halfT },
        { x: center.x - axes.along.x * halfS - axes.back.x * halfT, y: center.y - axes.along.y * halfS - axes.back.y * halfT }
      ];
      if (!insideAll(corners, field)) continue;
      if (blocked(corners, exclusions, keepPad)) continue;
      if (count >= cap) { capped = true; break; }
      count++;
      watts += mod.watts;
      placed++;
      row.x += center.x;
      row.y += center.y;
      centers.push({ x: center.x, y: center.y });
    }
    if (placed) {
      row.count = placed;
      row.x /= placed;
      row.y /= placed;
      var mid = centers[Math.floor(centers.length / 2)];
      row.point = { x: mid.x, y: mid.y };
      row.samples = [centers[0], mid, centers[centers.length - 1]];
      rows.push(row);
    }
    if (capped) break;
  }
  return {
    ok: true,
    mount: mountKey,
    mountLabel: preset.label,
    modules: count,
    rows: rows,
    rowCount: rows.length,
    kwDc: Math.round(watts / 100) / 10,
    watts: watts,
    gcr: Math.round(gcr * 1000) / 1000,
    pitchFt: Math.round(pitch * 10) / 10,
    tilt: tilt,
    azimuth: azimuth,
    setbackFt: setback,
    chordFt: Math.round(chord * 100) / 100,
    acrossFt: Math.round(across * 100) / 100,
    groundDepthFt: Math.round(groundDepth * 100) / 100,
    heightFt: opts.heightFt == null ? preset.heightFt : num(opts.heightFt, preset.heightFt),
    firePathFt: fireFt,
    spacing: spacing,
    orientation: portrait ? 'portrait' : 'landscape',
    capped: capped,
    moduleKey: mod.key
  };
}

/* Coarse search on twelve clear days. Maximizes plane-of-array, not AC,
   so the choice does not depend on an inverter. */
function optimize(opts) {
  opts = opts || {};
  var lat = num(opts.lat, 33);
  var south = lat >= 0;
  var tilts = opts.tilts || [10, 15, 20, 25, 30, 35, 40];
  var azs = opts.azimuths || (south ? [150, 165, 180, 195, 210] : [330, 345, 0, 15, 30]);
  var Weather = require('./solar-weather');
  var year = opts.weather || Weather.year(lat, opts.lon || (south ? -112 : 151), { climate: opts.climate }).hours;
  var sample = [];
  var i, seen = {};
  for (i = 0; i < year.length; i++) {
    if (year[i].day === 21 && year[i].hour === 10.5) sample.push(year[i]);
    else if (year[i].day === 21 && (year[i].hour % 2 === 0.5)) sample.push(year[i]);
  }
  if (!sample.length) sample = year;
  var best = null, t, a, score, h, sun, tr;
  for (t = 0; t < tilts.length; t++) {
    for (a = 0; a < azs.length; a++) {
      score = 0;
      for (h = 0; h < sample.length; h++) {
        sun = Sun.at(lat, opts.lon || 0, sample[h].year, sample[h].month, sample[h].day, sample[h].hour, opts.tz || Weather.tzOf(opts.lon || 0));
        if (sun.altitude <= 0) continue;
        tr = Sun.poa({
          dni: sample[h].dni, dhi: sample[h].dhi, zenith: sun.zenith, azimuth: sun.azimuth,
          tilt: tilts[t], surfaceAzimuth: azs[a], dayOfYear: sample[h].doy || Sun.dayOfYear(sample[h].year, sample[h].month, sample[h].day)
        });
        score += tr.poa;
      }
      if (!best || score > best.score) best = { tilt: tilts[t], azimuth: azs[a], score: score };
    }
  }
  best.score = Math.round(best.score);
  best.note = 'Tilt and azimuth chosen on the 21st of each month to maximize plane-of-array irradiance. A roof plane keeps the tilt and azimuth it was given.';
  return best;
}

module.exports = {
  MOUNTS: MOUNTS,
  gcrAt: gcrAt,
  solsticeGcr: solsticeGcr,
  trackerGcr: trackerGcr,
  layout: layout,
  optimize: optimize,
  VERSION: 'solar-layout/2'
};
