/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * Hourly weather for the energy model when the caller does not bring a
 * TMY. This is a clear-sky year scaled by a latitude-band monthly
 * clearness index, free of any paid weather file and of the NSRDB key.
 *
 * It is not NSRDB and it is not a TMY3. The report says so. A caller that
 * has its own 8,760 (DNI, DHI, temperature, wind) passes that instead,
 * and the same energy model runs.
 *
 * Clear-sky beam is a Kasten-airmass exponential. The monthly kt values
 * are a coarse public climatology (dry subtropics, humid subtropics,
 * marine, continental) so a Phoenix year lands near the published
 * PVWatts specific-yield band and a Seattle year does not.
 */
'use strict';

var Sun = require('./solar-sun');

var MD = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/* Monthly clearness index, January to December. Screening climatology,
   not a station record. */
var KT = {
  desert:    [0.62, 0.66, 0.70, 0.74, 0.76, 0.78, 0.74, 0.72, 0.74, 0.70, 0.64, 0.60],
  continental: [0.46, 0.50, 0.52, 0.52, 0.54, 0.56, 0.56, 0.54, 0.52, 0.50, 0.44, 0.42],
  marine:    [0.38, 0.42, 0.48, 0.52, 0.54, 0.56, 0.58, 0.56, 0.52, 0.46, 0.38, 0.34],
  tropical:  [0.52, 0.54, 0.54, 0.52, 0.50, 0.48, 0.50, 0.52, 0.52, 0.52, 0.50, 0.50]
};

function climateOf(lat, lon) {
  var a = Math.abs(lat);
  if (a < 23) return 'tropical';
  /* The desert Southwest, roughly. */
  if (lat > 31 && lat < 42 && lon < -109 && lon > -125) return 'desert';
  if (lat > 25 && lat < 35 && lon < -100 && lon > -115) return 'desert';
  if (lon < -123 && lat > 40 && lat < 50) return 'marine';
  if (lon > -80 && lat > 25 && lat < 32) return 'marine';
  return 'continental';
}

function tzOf(lon) {
  var z = Math.round(lon / 15);
  if (z > 12) z = 12;
  if (z < -12) z = -12;
  return z;
}

function tMonthly(lat, month) {
  var annual = 27 - 0.55 * Math.abs(lat);
  var phase = (month - 7) * Math.PI / 6;
  if (lat < 0) phase = (month - 1) * Math.PI / 6;
  return annual + 11 * Math.cos(phase);
}

/* One year, non-leap, hour at the middle of the clock hour (PVWatts). */
function year(lat, lon, opt) {
  opt = opt || {};
  var climate = opt.climate || climateOf(lat, lon);
  var kt = KT[climate] || KT.continental;
  var tz = opt.tz == null ? tzOf(lon) : opt.tz;
  var yearN = opt.year || 2021;
  var wind = opt.wind == null ? 3 : opt.wind;
  var out = [], month, day, hour, doy = 0;
  for (month = 1; month <= 12; month++) {
    for (day = 1; day <= MD[month - 1]; day++) {
      doy++;
      for (hour = 0; hour < 24; hour++) {
        var h = hour + 0.5;
        var sun = Sun.at(lat, lon, yearN, month, day, h, tz);
        var dni = 0, dhi = 0, ghi = 0;
        if (sun.altitude > 0) {
          var am = Sun.airmass(sun.zenith);
          var dniClear = 980 * Math.exp(-0.16 * Math.pow(am, 0.72));
          var cosz = Math.max(0, Math.cos(sun.zenith * Math.PI / 180));
          var ghiClear = dniClear * cosz * 0.85 + 140 * Math.pow(cosz, 0.6);
          var scale = kt[month - 1] / 0.72;
          if (scale > 1.15) scale = 1.15;
          dni = dniClear * scale;
          ghi = ghiClear * scale;
          dhi = Math.max(0, ghi - dni * cosz);
        }
        var swing = 7 + 3 * Math.max(0, Math.sin(sun.altitude * Math.PI / 180));
        var temp = tMonthly(lat, month) + swing * Math.cos((h - 15) * Math.PI / 12);
        out.push({
          year: yearN, month: month, day: day, hour: h, doy: doy,
          dni: dni, dhi: dhi, temp: temp, wind: wind
        });
      }
    }
  }
  return { hours: out, climate: climate, tz: tz, kt: kt, kind: 'clear-sky scaled by a latitude-band clearness index' };
}

function extremes(hours) {
  var tMin = Infinity, tMax = -Infinity, i, t;
  for (i = 0; i < hours.length; i++) {
    t = hours[i].temp;
    if (t < tMin) tMin = t;
    if (t > tMax) tMax = t;
  }
  if (!isFinite(tMin)) { tMin = 0; tMax = 35; }
  return { tMin: Math.round(tMin * 10) / 10, tMax: Math.round(tMax * 10) / 10 };
}

module.exports = {
  KT: KT,
  climateOf: climateOf,
  tzOf: tzOf,
  year: year,
  extremes: extremes,
  VERSION: 'solar-weather/1'
};
