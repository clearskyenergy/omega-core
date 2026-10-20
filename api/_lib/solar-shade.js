/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * Near shading from the rows in front and from drawn obstructions.
 * One point per row, one fraction of the beam. Diffuse stays.
 *
 * A horizon list ({az, alt} degrees) is the hook a 3D terrain view fills.
 * Nothing here reads a mesh. When the list is empty, far shading is the
 * separate loss the caller set, not a guessed hill.
 */
'use strict';

var Sun = require('./solar-sun');
var G = require('../../omega-editor-v2-geom.js');

function rowShadeFraction(pitchFt, chordFt, tilt, profileDeg) {
  if (!(profileDeg > 1) || !(pitchFt > 0)) return 1;
  var tiltR = tilt * Math.PI / 180;
  var psi = profileDeg * Math.PI / 180;
  var rise = chordFt * Math.sin(tiltR);
  var ground = chordFt * Math.cos(tiltR);
  var gap = pitchFt - ground;
  var shadow = rise / Math.tan(psi);
  if (!(ground > 0.1)) return 0;
  var frac = (shadow - gap) / ground;
  if (frac < 0) frac = 0;
  if (frac > 1) frac = 1;
  return frac;
}

/* Landscape silicon: the first sixth of the module takes out a third of
   the beam, the way HelioScope describes a bypassed cell string. Portrait
   stays linear in the shaded fraction. */
function diodeBeam(frac, orientation) {
  if (!(frac > 0)) return 0;
  if (orientation !== 'landscape') return frac;
  if (frac <= 1 / 6) return 1 / 3;
  if (frac <= 0.5) return 2 / 3;
  return 1;
}

function horizonAlt(horizon, azimuth) {
  if (!horizon || !horizon.length) return 0;
  var best = null, bestD = 999, i, d, a;
  for (i = 0; i < horizon.length; i++) {
    a = +horizon[i].az;
    d = Math.abs(((a - azimuth + 540) % 360) - 180);
    if (d < bestD) { bestD = d; best = horizon[i]; }
  }
  if (!best || bestD > 15) return 0;
  return +best.alt || 0;
}

function shadowHits(rowPoint, sunAz, sunAlt, obs, moduleHeight) {
  var h = (+obs.heightFt || 0) - (moduleHeight || 0);
  if (!(h > 0) || !(sunAlt > 1)) return false;
  var reach = h / Math.tan(sunAlt * Math.PI / 180);
  if (!(reach > 0)) return false;
  /* The shadow falls opposite the sun, from the obstruction toward the row. */
  var az = (sunAz + 180) * Math.PI / 180;
  var sx = Math.sin(az), sy = Math.cos(az);
  var ring = obs.pts || obs;
  if (!ring || ring.length < 3) return false;
  /* Sample the shadow segment. A hit means the row point lies in the shadow. */
  var steps = 8, i, x, y, dist;
  for (i = 1; i <= steps; i++) {
    dist = reach * (i / steps);
    x = rowPoint.x - sx * dist;
    y = rowPoint.y - sy * dist;
    /* Walk from the row back toward the sun and see if we enter the obstruction. */
  }
  /* Direct test: is the row inside the obstruction's shadow polygon,
     approximated by translating the ring along the shadow vector and
     asking whether the row is inside either the object or that shift
     is unnecessary. Point-to-ring: the row is shaded when the ray from
     the row toward the sun meets the obstruction within `reach`. */
  var toward = sunAz * Math.PI / 180;
  var tx = Math.sin(toward), ty = Math.cos(toward);
  for (i = 1; i <= 12; i++) {
    dist = reach * (i / 12);
    x = rowPoint.x + tx * dist;
    y = rowPoint.y + ty * dist;
    if (G.pointInPoly(x, y, ring)) return true;
  }
  return false;
}

function rowPoints(row) {
  if (row.samples && row.samples.length) return row.samples;
  if (row.point) return [row.point];
  return [{ x: row.x, y: row.y }];
}

/* A sample that sits inside the obstruction is not a module. */
function hitFraction(points, sunAz, sunAlt, obs, moduleHeight) {
  var n = 0, hit = 0, i, p;
  var ring = obs.pts || obs;
  for (i = 0; i < points.length; i++) {
    p = points[i];
    if (ring && ring.length >= 3 && G.pointInPoly(p.x, p.y, ring)) continue;
    n++;
    if (shadowHits(p, sunAz, sunAlt, obs, moduleHeight)) hit++;
  }
  if (!n) return 0;
  return hit / n;
}

/* Annual beam-shade fraction per row, and an hour callback.
   rows: layout.rows. obstructions: [{pts, heightFt}]. */
function analyze(opts) {
  opts = opts || {};
  var rows = opts.rows || [];
  var hours = opts.hours || [];
  var tilt = +opts.tilt || 0;
  var azimuth = opts.azimuth == null ? 180 : +opts.azimuth;
  var pitch = +opts.pitchFt || 0;
  var chord = +opts.chordFt || 0;
  var mount = opts.mount;
  var orientation = opts.orientation || 'portrait';
  var tracker = mount === 'tracker-1ax';
  var flush = mount === 'rooftop' || mount === 'flush' || mount === 'east-west';
  var obs = opts.obstructions || [];
  var horizon = opts.horizon || [];
  var height = +opts.heightFt || 0;
  var per = [];
  var r, i, w, sun, psi, frac, beam0, lost, total;
  for (r = 0; r < rows.length; r++) per.push({ index: rows[r].index, beam: 0, lost: 0, shadePct: 0 });
  var hourFrac = new Array(hours.length);
  for (i = 0; i < hours.length; i++) {
    w = hours[i];
    sun = Sun.at(opts.lat, opts.lon, w.year, w.month, w.day, w.hour, opts.tz);
    if (sun.altitude <= 0) { hourFrac[i] = 0; continue; }
    var hAlt = horizonAlt(horizon, sun.azimuth);
    if (sun.altitude < hAlt) { hourFrac[i] = 1; continue; }
    psi = Sun.profileAngle(sun.altitude, sun.azimuth, azimuth);
    var self = 0;
    if (!flush && !tracker) self = diodeBeam(rowShadeFraction(pitch, chord, tilt, psi), orientation);
    if (tracker && opts.backtrack === false) self = diodeBeam(rowShadeFraction(pitch, chord, Math.min(60, 90 - sun.altitude), psi), orientation);
    var lostRows = 0, openRows = 0;
    for (r = 0; r < rows.length; r++) {
      frac = (r === 0 && !flush) ? 0 : self;
      var o, cover;
      for (o = 0; o < obs.length; o++) {
        cover = hitFraction(rowPoints(rows[r]), sun.azimuth, sun.altitude, obs[o], height);
        if (cover > frac) frac = cover;
      }
      if (frac < 0) frac = 0;
      if (frac > 1) frac = 1;
      /* Weight by beam so a shaded sunrise does not count like noon. */
      var wgt = (w.dni > 0 ? w.dni : 300) * Math.max(0.02, Math.sin(sun.altitude * Math.PI / 180));
      per[r].beam += (1 - frac) * wgt;
      per[r].lost += frac * wgt;
      openRows++;
      lostRows += frac;
    }
    hourFrac[i] = openRows ? lostRows / openRows : 0;
  }
  var annual = 0, weight = 0;
  for (r = 0; r < per.length; r++) {
    total = per[r].beam + per[r].lost;
    per[r].shadePct = total ? Math.round(1000 * per[r].lost / total) / 10 : 0;
    annual += per[r].shadePct * (rows[r].count || 1);
    weight += (rows[r].count || 1);
    delete per[r].beam;
    delete per[r].lost;
  }
  return {
    rows: per,
    annualPct: weight ? Math.round(10 * annual / weight) / 10 : 0,
    hourBeamLoss: hourFrac,
    horizon: horizon.length ? 'A horizon profile was applied.' : 'No far horizon was passed in. Far shading is not invented.',
    near: 'Row-to-row beam shade from the profile angle, plus a shadow ray from each row to each obstruction. Diffuse is left on.'
  };
}

module.exports = {
  rowShadeFraction: rowShadeFraction,
  diodeBeam: diodeBeam,
  horizonAlt: horizonAlt,
  shadowHits: shadowHits,
  analyze: analyze,
  VERSION: 'solar-shade/1'
};
