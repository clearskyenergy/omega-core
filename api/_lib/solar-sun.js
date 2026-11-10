/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * Sun position, Perez 1990 plane-of-array irradiance, and cover IAM.
 * Azimuth is degrees clockwise from north (180 is south), the convention
 * PVWatts and HelioScope use. Hour angle is zero at solar noon.
 *
 * Sun position is the NOAA / Meeus set (public-domain equations).
 * Transposition is Perez 1990, all-sites composite, with the PVWatts V5
 * change that treats the sky as isotropic from zenith 87.5° to 90°
 * (Dobos, PVWatts Version 5 Manual, NREL/TP-6A20-62641).
 */
'use strict';

var PEREZ = [
  { f11: -0.008, f12: 0.588, f13: -0.062, f21: -0.060, f22: 0.072, f23: -0.022 },
  { f11: 0.130, f12: 0.683, f13: -0.151, f21: -0.019, f22: 0.066, f23: -0.029 },
  { f11: 0.330, f12: 0.487, f13: -0.221, f21: 0.055, f22: -0.064, f23: -0.026 },
  { f11: 0.568, f12: 0.187, f13: -0.295, f21: 0.109, f22: -0.152, f23: -0.014 },
  { f11: 0.873, f12: -0.392, f13: -0.362, f21: 0.226, f22: -0.462, f23: 0.001 },
  { f11: 1.132, f12: -1.237, f13: -0.412, f21: 0.288, f22: -0.823, f23: 0.056 },
  { f11: 1.060, f12: -1.600, f13: -0.359, f21: 0.264, f22: -1.127, f23: 0.131 },
  { f11: 0.678, f12: -0.327, f13: -0.250, f21: 0.156, f22: -1.377, f23: 0.251 }
];
var EPS_BIN = [1.065, 1.230, 1.500, 1.950, 2.800, 4.500, 6.200];
var GLASS_N = 1.526;

function rad(d) { return d * Math.PI / 180; }
function deg(r) { return r * 180 / Math.PI; }
function clamp(n, a, b) { return n < a ? a : (n > b ? b : n); }
function wrap360(d) { d = d % 360; if (d < 0) d += 360; return d; }

function julianDay(year, month, day, hour) {
  var y = year, m = month;
  if (m <= 2) { y -= 1; m += 12; }
  var A = Math.floor(y / 100);
  var B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + day + (hour || 0) / 24 + B - 1524.5;
}
function century(jd) { return (jd - 2451545.0) / 36525.0; }

function geomMeanLong(t) {
  return wrap360(280.46646 + t * (36000.76983 + 0.0003032 * t));
}
function geomMeanAnomaly(t) {
  return 357.52911 + t * (35999.05029 - 0.0001537 * t);
}
function eccentricity(t) {
  return 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
}
function eqOfCenter(t) {
  var m = rad(geomMeanAnomaly(t));
  return Math.sin(m) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(2 * m) * (0.019993 - 0.000101 * t) + Math.sin(3 * m) * 0.000289;
}
function obliquity(t) {
  var sec = 21.448 - t * (46.8150 + t * (0.00059 - t * 0.001813));
  var e0 = 23 + (26 + sec / 60) / 60;
  var omega = 125.04 - 1934.136 * t;
  return e0 + 0.00256 * Math.cos(rad(omega));
}
function apparentLong(t) {
  var omega = 125.04 - 1934.136 * t;
  return geomMeanLong(t) + eqOfCenter(t) - 0.00569 - 0.00478 * Math.sin(rad(omega));
}
function declination(t) {
  return deg(Math.asin(Math.sin(rad(obliquity(t))) * Math.sin(rad(apparentLong(t)))));
}
function equationOfTime(t) {
  var eps = rad(obliquity(t));
  var l0 = rad(geomMeanLong(t));
  var e = eccentricity(t);
  var m = rad(geomMeanAnomaly(t));
  var y = Math.tan(eps / 2); y *= y;
  var et = y * Math.sin(2 * l0) - 2 * e * Math.sin(m) + 4 * e * y * Math.sin(m) * Math.cos(2 * l0) -
    0.5 * y * y * Math.sin(4 * l0) - 1.25 * e * e * Math.sin(2 * m);
  return deg(et) * 4;
}

function declinationOn(year, month, day) {
  return declination(century(julianDay(year, month, day, 12)));
}

/* lat, declination, hour angle (degrees, afternoon positive). */
function angles(lat, dec, hourAngle) {
  var latR = rad(lat), decR = rad(dec), haR = rad(hourAngle);
  var cosZ = Math.sin(latR) * Math.sin(decR) + Math.cos(latR) * Math.cos(decR) * Math.cos(haR);
  cosZ = clamp(cosZ, -1, 1);
  var zenith = deg(Math.acos(cosZ));
  var altitude = 90 - zenith;
  var azimuth = 180;
  if (zenith > 0.001 && zenith < 179) {
    var cosAz = (Math.sin(decR) - Math.cos(rad(zenith)) * Math.sin(latR)) / (Math.sin(rad(zenith)) * Math.cos(latR));
    cosAz = clamp(cosAz, -1, 1);
    azimuth = deg(Math.acos(cosAz));
    if (hourAngle > 0) azimuth = 360 - azimuth;
  }
  return { zenith: zenith, altitude: altitude, azimuth: azimuth, hourAngle: hourAngle };
}

/* Local standard time. tzHours is hours west of UTC as a negative offset
   in the POSIX sense: US Mountain is -7. PVWatts uses the midpoint of the
   hour; pass hour as 0.5, 1.5, … when that is what you want. */
function at(lat, lon, year, month, day, hourLocal, tzHours) {
  var jd = julianDay(year, month, day, hourLocal - (tzHours || 0));
  var t = century(jd);
  var dec = declination(t);
  var eot = equationOfTime(t);
  var timeOffset = eot + 4 * lon - 60 * (tzHours || 0);
  var trueSolarMin = hourLocal * 60 + timeOffset;
  var ha = trueSolarMin / 4 - 180;
  var ang = angles(lat, dec, ha);
  ang.declination = dec;
  ang.equationOfTime = eot;
  return ang;
}

function airmass(zenith) {
  if (zenith >= 90) return 40;
  var c = Math.cos(rad(zenith));
  return 1 / (c + 0.50572 * Math.pow(Math.max(0.1, 96.07995 - zenith), -1.6364));
}
function dayOfYear(year, month, day) {
  var md = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  var leap = (month > 2 && ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0)) ? 1 : 0;
  return md[month - 1] + day + (month > 2 ? leap : 0);
}
function dniExtra(doy) {
  var b = 2 * Math.PI * (doy - 1) / 365;
  return 1367 * (1.00011 + 0.034221 * Math.cos(b) + 0.00128 * Math.sin(b) +
    0.000719 * Math.cos(2 * b) + 0.000077 * Math.sin(2 * b));
}

function aoiCos(zenith, sunAz, tilt, surfAz) {
  var z = rad(zenith), t = rad(tilt);
  return Math.cos(z) * Math.cos(t) + Math.sin(z) * Math.sin(t) * Math.cos(rad(sunAz - surfAz));
}

function poa(opts) {
  opts = opts || {};
  var dni = +opts.dni || 0, dhi = +opts.dhi || 0;
  var zenith = +opts.zenith, tilt = +opts.tilt || 0;
  var sunAz = +opts.azimuth, surfAz = opts.surfaceAzimuth == null ? 180 : +opts.surfaceAzimuth;
  var albedo = opts.albedo == null ? 0.2 : +opts.albedo;
  var z = rad(zenith), beta = rad(tilt);
  var cosAoi = aoiCos(zenith, sunAz, tilt, surfAz);
  var aoi = deg(Math.acos(clamp(cosAoi, -1, 1)));
  var beam = dni * Math.max(0, cosAoi);
  var ghi = dni * Math.max(0, Math.cos(z)) + dhi;
  var ground = ghi * albedo * (1 - Math.cos(beta)) / 2;
  var sky = 0;
  if (dhi > 0 && zenith < 90) {
    if (zenith >= 87.5) {
      sky = dhi * (1 + Math.cos(beta)) / 2;
    } else {
      var doy = opts.dayOfYear || 180;
      var extra = opts.dniExtra > 0 ? opts.dniExtra : dniExtra(doy);
      var am = opts.airmass > 0 ? opts.airmass : airmass(zenith);
      var kappa = 1.041;
      var zr = z;
      var eps = ((dhi + dni) / dhi + kappa * zr * zr * zr) / (1 + kappa * zr * zr * zr);
      var delta = dhi * am / extra;
      var bin = 0, i;
      for (i = 0; i < EPS_BIN.length; i++) if (eps > EPS_BIN[i]) bin = i + 1;
      if (bin > 7) bin = 7;
      var c = PEREZ[bin];
      var F1 = Math.max(0, c.f11 + c.f12 * delta + c.f13 * zr);
      var F2 = c.f21 + c.f22 * delta + c.f23 * zr;
      var A = Math.max(0, cosAoi);
      var B = Math.max(Math.cos(rad(85)), Math.cos(z));
      sky = dhi * ((1 - F1) * (1 + Math.cos(beta)) / 2 + F1 * A / B + F2 * Math.sin(beta));
      if (sky < 0) sky = 0;
    }
  }
  return {
    beam: beam, sky: sky, ground: ground, poa: beam + sky + ground,
    aoi: aoi, ghi: ghi, albedo: albedo
  };
}

/* Single-slab glass, n = 1.526, normalized so IAM(0) = 1.
   PVWatts V5 standard and thin-film cover (Dobos 2014, §8). */
function transmittance(aoiDeg, n) {
  if (aoiDeg >= 90) return 0;
  if (aoiDeg <= 0.001) {
    var r = (n - 1) / (n + 1);
    return 1 - r * r;
  }
  var t1 = rad(aoiDeg);
  var t2 = Math.asin(clamp(Math.sin(t1) / n, -1, 1));
  var rs = Math.sin(t2 - t1) / Math.sin(t2 + t1);
  var rp = Math.tan(t2 - t1) / Math.tan(t2 + t1);
  return 1 - 0.5 * (rs * rs + rp * rp);
}
function iam(aoiDeg, n) {
  n = n || GLASS_N;
  var t0 = transmittance(0, n);
  if (!(t0 > 0)) return 0;
  return Math.max(0, transmittance(aoiDeg, n) / t0);
}

/* Profile angle of the sun in the plane perpendicular to the rows.
   rowAzimuth is the direction the modules face. */
function profileAngle(altitude, sunAzimuth, rowAzimuth) {
  var dAz = rad(wrap360(sunAzimuth - rowAzimuth + 540) - 180);
  var c = Math.cos(dAz);
  if (altitude <= 0 || c <= 0.02) return 0;
  return deg(Math.atan(Math.tan(rad(altitude)) / c));
}

module.exports = {
  PEREZ: PEREZ,
  GLASS_N: GLASS_N,
  julianDay: julianDay,
  declinationOn: declinationOn,
  angles: angles,
  at: at,
  airmass: airmass,
  dayOfYear: dayOfYear,
  dniExtra: dniExtra,
  aoiCos: aoiCos,
  poa: poa,
  iam: iam,
  transmittance: transmittance,
  profileAngle: profileAngle,
  VERSION: 'solar-sun/1'
};
