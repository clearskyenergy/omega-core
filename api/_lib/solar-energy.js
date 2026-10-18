/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * Hourly PV energy. Perez transposition and the cover IAM live in
 * solar-sun.js. This file is the temperature model, the loss tree, the
 * inverter, and P50/P90.
 *
 * Cell temperature is the Sandia Array Performance Model (King), the
 * model HelioScope calls Sandia. PVWatts V5 uses Fuentes instead; the
 * DC equation, the inverter curve, and the loss product are the V5
 * equations (Dobos, NREL/TP-6A20-62641).
 *
 * The inverter named "pvwatts" is Eqn. 10–11 of that manual
 * (ηref = 0.9637, from the CEC inverters newer than 2010). A named
 * inverter uses the Sandia grid-tie equation on its CEC coefficients.
 */
'use strict';

var Sun = require('./solar-sun');

var LOSS = {
  soiling: 0.02,
  shading: 0.03,
  snow: 0,
  mismatch: 0.02,
  wiring: 0.02,
  connections: 0.005,
  lid: 0.015,
  nameplate: 0.01,
  age: 0,
  availability: 0.03
};

/* Sandia module temperature coefficients, pvlib temperature.sapm_cell. */
var SAPM = {
  open: { a: -3.56, b: -0.0750, deltaT: 3, label: 'open rack, glass/polymer' },
  roof: { a: -2.81, b: -0.0455, deltaT: 0, label: 'insulated back, glass/polymer' },
  close: { a: -2.98, b: -0.0471, deltaT: 1, label: 'close mount, glass/glass' }
};

var Z90 = 1.2815515655446004;
var Z95 = 1.6448536269514722;
var Z99 = 2.3263478740408408;

function sapmCell(poa, tamb, wind, coeff) {
  var e = Math.max(0, +poa || 0);
  var ws = Math.max(0, +wind || 0);
  var tmod = e * Math.exp(coeff.a + coeff.b * ws) + (+tamb || 0);
  return tmod + (e / 1000) * coeff.deltaT;
}

/* PVsyst-style cell temperature, for a condition set that asks for it.
   Uc / Uv are W/m²K. Free-standing defaults are 29 and 0? No:
   PVsyst free-standing is Uc=29, Uv=0 is wrong. The usual free-standing
   pair is Uc = 25, Uv = 1.2; insulated is Uc = 15, Uv = 0.
   eta is the electrical efficiency subtracted from the absorbed fraction. */
function pvsystCell(poa, tamb, wind, uc, uv, absorptance, eta) {
  var u = (uc || 25) + (uv == null ? 1.2 : uv) * Math.max(0, +wind || 0);
  var alpha = absorptance == null ? 0.9 : absorptance;
  var eff = eta == null ? 0.18 : eta;
  if (!(u > 0)) return tamb;
  return (+tamb || 0) + Math.max(0, +poa || 0) * alpha * (1 - eff) / u;
}

function lossProduct(L) {
  L = L || LOSS;
  var keys = ['soiling', 'shading', 'snow', 'mismatch', 'wiring', 'connections', 'lid', 'nameplate', 'age', 'availability'];
  var p = 1, i, v;
  for (i = 0; i < keys.length; i++) {
    v = +L[keys[i]] || 0;
    if (v < 0) v = 0;
    if (v > 0.95) v = 0.95;
    p *= (1 - v);
  }
  return 1 - p;
}

/* PVWatts V5 inverter. pdc and pac0 are the same unit (W).
   pdc0 = pac0 / etaNom. Output clips at pac0. */
function pvwattsAc(pdc, pac0, etaNom) {
  etaNom = etaNom == null ? 0.96 : etaNom;
  var etaRef = 0.9637;
  if (!(pdc > 0) || !(pac0 > 0)) return 0;
  var pdc0 = pac0 / etaNom;
  if (pdc >= pdc0) return pac0;
  var zeta = pdc / pdc0;
  var eta = (etaNom / etaRef) * (-0.0162 * zeta - 0.0059 / zeta + 0.9858);
  if (eta < 0) eta = 0;
  var pac = eta * pdc;
  if (pac > pac0) pac = pac0;
  if (pac < 0) pac = 0;
  return pac;
}

/* Sandia grid-tie inverter at the CEC reference DC voltage. */
function sandiaAc(pdc, inv) {
  if (!(pdc > inv.pso)) return 0;
  var A = inv.pdco;
  var B = inv.pso;
  var C = inv.c0;
  var denom = A - B;
  if (!(Math.abs(denom) > 1e-6)) return 0;
  var pac = ((inv.paco / denom) - C * denom) * (pdc - B) + C * (pdc - B) * (pdc - B);
  if (pac > inv.paco) pac = inv.paco;
  if (pac < 0) pac = 0;
  return pac;
}

function tempCoeff(mount) {
  if (mount === 'rooftop' || mount === 'flush' || mount === 'east-west') return SAPM.roof;
  if (mount === 'carport') return SAPM.close;
  return SAPM.open;
}

function orientation(sys, sun) {
  if (sys.mount === 'tracker-1ax') {
    var rot = trackerRotation(sun.azimuth, sun.altitude, sys.maxRotation || 60, sys.gcr, sys.backtrack !== false);
    var tilt = Math.abs(rot);
    var az = rot < 0 ? 90 : (rot > 0 ? 270 : 180);
    return { tilt: tilt, azimuth: az, rotation: rot };
  }
  return { tilt: sys.tilt, azimuth: sys.azimuth, rotation: 0 };
}

/* Horizontal N-S axis. Negative rotation faces east. Backtracking is the
   flat-ground reduction: the magnitude shrinks, the sign stays, noon stays 0. */
function trackerRotation(sunAz, sunAlt, maxRot, gcr, backtrack) {
  if (!(sunAlt > 0)) return 0;
  var fromSouth = (sunAz - 180) * Math.PI / 180;
  var rot = Math.atan2(Math.sin(fromSouth), Math.tan(sunAlt * Math.PI / 180));
  if (backtrack && gcr > 0.05 && gcr < 0.98) {
    var denom = (1 / gcr) - Math.cos(rot);
    if (denom > 0.05) rot = Math.atan2(Math.sin(rot), denom);
  }
  var max = (maxRot || 60) * Math.PI / 180;
  if (rot > max) rot = max;
  if (rot < -max) rot = -max;
  return rot * 180 / Math.PI;
}

function blankAcc() {
  return {
    poa: 0, beam: 0, shadedBeam: 0, afterIam: 0, afterSoiling: 0,
    dcStc: 0, dcTemp: 0, dcDerate: 0, acPreClip: 0, ac: 0, hours: 0
  };
}

/* One hour. shadeBeam is the fraction of beam removed (0–1).
   sys: { lat, lon, tz, tilt, azimuth, mount, gcr, pdcW, pacW, gamma, losses,
          temp, albedo, etaNom, inverter, backtrack }
   w: { year, month, day, hour, dni, dhi, temp, wind, albedo? } */
function oneHour(sys, w, shadeBeam) {
  var sun = Sun.at(sys.lat, sys.lon, w.year, w.month, w.day, w.hour, sys.tz);
  var face = orientation(sys, sun);
  var tr = Sun.poa({
    dni: w.dni, dhi: w.dhi, zenith: sun.zenith, azimuth: sun.azimuth,
    tilt: face.tilt, surfaceAzimuth: face.azimuth,
    albedo: w.albedo == null ? sys.albedo : w.albedo,
    dayOfYear: Sun.dayOfYear(w.year, w.month, w.day)
  });
  var shade = shadeBeam;
  if (shade == null) shade = 0;
  if (shade < 0) shade = 0;
  if (shade > 1) shade = 1;
  var beamLeft = tr.beam * (1 - shade);
  var iamB = Sun.iam(tr.aoi);
  var iamD = Sun.iam(60);
  var eff = beamLeft * iamB + tr.sky * iamD + tr.ground * iamD;
  var L = sys.losses;
  var soiling = L.soiling || 0;
  var afterSoil = eff * (1 - soiling);
  var tcell = sys.temperatureModel === 'pvsyst'
    ? pvsystCell(afterSoil, w.temp, w.wind, sys.uc, sys.uv, 0.9, Math.abs(sys.gamma) > 0 ? 0.2 : 0.18)
    : sapmCell(afterSoil, w.temp, w.wind, sys.tempCoeff);
  var fTemp = 1 + sys.gamma * (tcell - 25);
  if (fTemp < 0) fTemp = 0;
  var pdcTemp = sys.pdcW * (afterSoil / 1000) * fTemp;
  var derate = (1 - (L.mismatch || 0)) * (1 - (L.lid || 0)) * (1 - (L.nameplate || 0)) *
    (1 - (L.connections || 0)) * (1 - (L.wiring || 0)) * (1 - (L.snow || 0)) * (1 - (L.age || 0));
  if (sys.useLumpedShade) derate *= (1 - (L.shading || 0));
  var pdc = pdcTemp * derate;
  if (pdc < 0) pdc = 0;
  var pacRaw;
  if (sys.inverter && sys.inverter.paco) pacRaw = sandiaAc(pdc, sys.inverter);
  else pacRaw = pvwattsAc(pdc, sys.pacW, sys.etaNom);
  var pac = pacRaw * (1 - (L.availability || 0));
  return {
    sun: sun, face: face, tr: tr, tcell: tcell,
    beamLeft: beamLeft, eff: eff, afterSoil: afterSoil,
    pdcTemp: pdcTemp, pdc: pdc, pacRaw: pacRaw, pac: pac
  };
}

function addHour(acc, h, w) {
  acc.poa += h.tr.poa;
  acc.beam += h.tr.beam;
  acc.shadedBeam += h.beamLeft;
  acc.afterIam += h.eff;
  acc.afterSoiling += h.afterSoil;
  acc.dcStc += (w.dni || w.dhi) ? h.tr.poa : 0;
  acc.dcTemp += h.pdcTemp;
  acc.dcDerate += h.pdc;
  acc.acPreClip += h.pacRaw;
  acc.ac += h.pac;
  acc.hours++;
}

/* weather is an array of hours. shadeAt(w, index) returns a beam fraction
   or a number. Returns monthly AC kWh and the loss tree in kWh. */
function simulate(sys, weather, shadeAt) {
  var monthly = [];
  var i, m;
  for (m = 0; m < 12; m++) monthly.push({ month: m + 1, acKwh: 0, poaWh: 0, hours: 0 });
  var acc = blankAcc();
  var clipWh = 0;
  for (i = 0; i < weather.length; i++) {
    var w = weather[i];
    var shade = 0;
    if (typeof shadeAt === 'function') shade = shadeAt(w, i) || 0;
    else if (typeof shadeAt === 'number') shade = shadeAt;
    var h = oneHour(sys, w, shade);
    addHour(acc, h, w);
    var unclipped = unclippedAc(h.pdc, sys);
    if (unclipped > h.pacRaw + 0.5) clipWh += (unclipped - h.pacRaw);
    monthly[w.month - 1].acKwh += h.pac / 1000;
    monthly[w.month - 1].poaWh += h.tr.poa;
    monthly[w.month - 1].hours++;
  }
  var n = weather.length || 1;
  function kwhFromWm2(wm2) { return sys.pdcW > 0 ? (wm2 / 1000) * (sys.pdcW / 1000) : 0; }
  /* Loss tree in AC-equivalent kWh, each step the energy that step removed
     relative to a lossless nameplate on the same POA. Reported as kWh of
     the running total so a designer can read it the way a HelioScope
     report reads. */
  var poaKwh = kwhFromWm2(acc.poa);
  /* Sky and ground stay. The shaded term is the beam that was removed. */
  var shadeKwh = kwhFromWm2(acc.beam - acc.shadedBeam);
  var iamKwh = kwhFromWm2(acc.shadedBeam + (acc.poa - acc.beam) - acc.afterIam);
  var soilKwh = kwhFromWm2(acc.afterIam - acc.afterSoiling);
  var dcNameKwh = kwhFromWm2(acc.afterSoiling);
  var tempKwh = dcNameKwh - acc.dcTemp / 1000;
  var derateKwh = acc.dcTemp / 1000 - acc.dcDerate / 1000;
  var invKwh = acc.dcDerate / 1000 - acc.acPreClip / 1000;
  var availKwh = acc.acPreClip / 1000 - acc.ac / 1000;
  var tree = [
    step('Plane-of-array irradiance', poaKwh, null),
    step('Near shading, beam', poaKwh - shadeKwh, shadeKwh),
    step('Incidence angle (glass n=1.526)', poaKwh - shadeKwh - iamKwh, iamKwh),
    step('Soiling', poaKwh - shadeKwh - iamKwh - soilKwh, soilKwh),
    step('Module temperature', acc.dcTemp / 1000, tempKwh),
    step('Mismatch, LID, nameplate, connections, wiring', acc.dcDerate / 1000, derateKwh),
    step('Inverter efficiency and clipping', acc.acPreClip / 1000, invKwh),
    step('Availability', acc.ac / 1000, availKwh)
  ];
  var acKwh = acc.ac / 1000;
  return {
    acKwh: round1(acKwh),
    poaKwhM2: round1(acc.poa / 1000),
    specificYield: sys.pdcW > 0 ? round1(acKwh / (sys.pdcW / 1000)) : 0,
    monthly: monthly.map(function (row) {
      return { month: row.month, acKwh: round1(row.acKwh), poaKwhM2: round1(row.poaWh / 1000) };
    }),
    lossTree: tree,
    clipKwh: round1(clipWh / 1000),
    hours: acc.hours
  };
}

/* AC before the nameplate cap, so clipping is a difference and not a
   second efficiency. The PVWatts curve is only defined up to Pdc0; above
   that the unclipped estimate continues at the nominal efficiency. */
function unclippedAc(pdc, sys) {
  if (!(pdc > 0)) return 0;
  if (sys.inverter && sys.inverter.paco) {
    var inv = sys.inverter;
    if (!(pdc > inv.pso)) return 0;
    var A = inv.pdco, B = inv.pso, C = inv.c0;
    var denom = A - B;
    if (!(Math.abs(denom) > 1e-6)) return 0;
    var pac = ((inv.paco / denom) - C * denom) * (pdc - B) + C * (pdc - B) * (pdc - B);
    return pac > 0 ? pac : 0;
  }
  var etaNom = sys.etaNom || 0.96;
  var pac0 = sys.pacW;
  if (!(pac0 > 0)) return 0;
  var pdc0 = pac0 / etaNom;
  var zeta = pdc / pdc0;
  if (!(zeta > 0)) return 0;
  if (zeta >= 1) return etaNom * pdc;
  var etaRef = 0.9637;
  var eta = (etaNom / etaRef) * (-0.0162 * zeta - 0.0059 / zeta + 0.9858);
  if (eta < 0) eta = 0;
  return eta * pdc;
}

function step(name, kwhAfter, removed) {
  return {
    name: name,
    kwh: round1(Math.max(0, kwhAfter || 0)),
    removedKwh: round1(Math.max(0, removed || 0))
  };
}
function round1(n) { return Math.round(n * 10) / 10; }

function exceedance(p50, sigma) {
  sigma = +sigma || 0;
  if (sigma < 0) sigma = 0;
  return {
    p50: round1(p50),
    p90: round1(p50 * (1 - Z90 * sigma)),
    p95: round1(p50 * (1 - Z95 * sigma)),
    p99: round1(Math.max(0, p50 * (1 - Z99 * sigma))),
    sigma: sigma,
    method: 'Normal distribution around the TMY year, the way HelioScope builds P90 from a variability sigma. This sigma is a screening value, not a multi-year weather file.'
  };
}

function sigmaOf(parts) {
  parts = parts || {};
  var w = parts.weather == null ? 0.04 : parts.weather;
  var m = parts.model == null ? 0.03 : parts.model;
  var s = parts.soiling == null ? 0.01 : parts.soiling;
  return Math.sqrt(w * w + m * m + s * s);
}

module.exports = {
  LOSS: LOSS,
  SAPM: SAPM,
  lossProduct: lossProduct,
  sapmCell: sapmCell,
  pvsystCell: pvsystCell,
  pvwattsAc: pvwattsAc,
  sandiaAc: sandiaAc,
  tempCoeff: tempCoeff,
  trackerRotation: trackerRotation,
  oneHour: oneHour,
  simulate: simulate,
  exceedance: exceedance,
  sigmaOf: sigmaOf,
  VERSION: 'solar-energy/1'
};
