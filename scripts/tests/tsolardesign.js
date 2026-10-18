/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Solar design engine against the published PVWatts / Perez / CEC checks.
 * The annual figure is the clear-sky year in solar-weather.js. NSRDB was
 * not reachable from this run, so the tolerance is a physical band, not
 * a station-matched PVWatts download.
 */
'use strict';
var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '../..');

var Sun = require(path.join(ROOT, 'api/_lib/solar-sun.js'));
var Energy = require(path.join(ROOT, 'api/_lib/solar-energy.js'));
var Layout = require(path.join(ROOT, 'api/_lib/solar-layout.js'));
var Shade = require(path.join(ROOT, 'api/_lib/solar-shade.js'));
var Stringing = require(path.join(ROOT, 'api/_lib/solar-string.js'));
var CEC = require(path.join(ROOT, 'api/_lib/solar-cec.js'));
var Weather = require(path.join(ROOT, 'api/_lib/solar-weather.js'));
var Price = require(path.join(ROOT, 'api/_lib/solar-price.js'));
var Design = require(path.join(ROOT, 'api/_lib/solar-design.js'));
var G = require(path.join(ROOT, 'omega-editor-v2-geom.js'));

var failed = 0;
function check(cond, msg) {
  if (!cond) { failed++; console.error('FAIL ' + msg); }
  else console.log('ok   ' + msg);
}

/* June 21 declination and solar-noon altitudes. NOAA/Meeus, ±0.5°. */
var dec = Sun.declinationOn(2021, 6, 21);
check(Math.abs(dec - 23.44) < 0.5, 'June 21 declination ' + dec.toFixed(3) + '° is within 0.5° of 23.44°');
var noonEq = Sun.at(0, 0, 2021, 6, 21, 12, 0);
check(Math.abs(noonEq.altitude - 66.56) < 0.5, 'equator June 21 solar noon altitude ' + noonEq.altitude.toFixed(2) + '°');
var noonPhx = Sun.at(33.45, -112.07, 2021, 12, 21, 12, -7);
check(Math.abs(noonPhx.altitude - 33.11) < 0.5, 'Phoenix Dec 21 solar noon altitude ' + noonPhx.altitude.toFixed(2) + '°');

/* NREL SPA sample, 2003-10-17 12:30:30 MST. NOAA will not hit 0.00001°. */
var spa = Sun.at(39.742476, -105.1786, 2003, 10, 17, 12 + 30 / 60 + 30 / 3600, -7);
var spaZen = Math.abs(spa.zenith - 50.11162);
var spaAz = Math.abs(spa.azimuth - 194.34024);
check(spaZen < 1 && spaAz < 1, 'SPA sample within 1° (zenith Δ ' + spaZen.toFixed(3) + '°, azimuth Δ ' + spaAz.toFixed(3) + '°)');
console.log('     SPA zenith ' + spa.zenith.toFixed(3) + ' azimuth ' + spa.azimuth.toFixed(3));

/* Horizontal closure. */
var flat = Sun.poa({ dni: 800, dhi: 200, zenith: 0, azimuth: 180, tilt: 0, surfaceAzimuth: 180, dayOfYear: 172 });
check(Math.abs(flat.poa - 1000) < 0.5, 'tilt 0, zenith 0, POA is DNI + DHI (' + flat.poa.toFixed(2) + ')');

/* Independent Perez 1990 transcription (pvlib all-sites composite). */
var PEREZ = [
  [-0.008, 0.588, -0.062, -0.060, 0.072, -0.022],
  [0.130, 0.683, -0.151, -0.019, 0.066, -0.029],
  [0.330, 0.487, -0.221, 0.055, -0.064, -0.026],
  [0.568, 0.187, -0.295, 0.109, -0.152, -0.014],
  [0.873, -0.392, -0.362, 0.226, -0.462, 0.001],
  [1.132, -1.237, -0.412, 0.288, -0.823, 0.056],
  [1.060, -1.600, -0.359, 0.264, -1.127, 0.131],
  [0.678, -0.327, -0.250, 0.156, -1.377, 0.251]
];
var EPS = [1.065, 1.230, 1.500, 1.950, 2.800, 4.500, 6.200];
function indepPoa(dni, dhi, zenith, sunAz, tilt, surfAz, doy) {
  var r = Math.PI / 180;
  var z = zenith * r, beta = tilt * r;
  var cosAoi = Math.cos(z) * Math.cos(beta) + Math.sin(z) * Math.sin(beta) * Math.cos((sunAz - surfAz) * r);
  var beam = dni * Math.max(0, cosAoi);
  var ghi = dni * Math.max(0, Math.cos(z)) + dhi;
  var ground = ghi * 0.2 * (1 - Math.cos(beta)) / 2;
  var extra = Sun.dniExtra(doy);
  var am = Sun.airmass(zenith);
  var kappa = 1.041;
  var eps = ((dhi + dni) / dhi + kappa * z * z * z) / (1 + kappa * z * z * z);
  var delta = dhi * am / extra;
  var bin = 0, i;
  for (i = 0; i < EPS.length; i++) if (eps > EPS[i]) bin = i + 1;
  if (bin > 7) bin = 7;
  var c = PEREZ[bin];
  var F1 = Math.max(0, c[0] + c[1] * delta + c[2] * z);
  var F2 = c[3] + c[4] * delta + c[5] * z;
  var A = Math.max(0, cosAoi);
  var B = Math.max(Math.cos(85 * r), Math.cos(z));
  var sky = dhi * ((1 - F1) * (1 + Math.cos(beta)) / 2 + F1 * A / B + F2 * Math.sin(beta));
  if (sky < 0) sky = 0;
  return beam + sky + ground;
}
var eng = Sun.poa({ dni: 700, dhi: 180, zenith: 40, azimuth: 160, tilt: 25, surfaceAzimuth: 180, dayOfYear: 172 });
var own = indepPoa(700, 180, 40, 160, 25, 180, 172);
check(Math.abs(eng.poa - own) / own < 0.005, 'Perez hour matches an independent transcription within 0.5% (' + eng.poa.toFixed(1) + ' vs ' + own.toFixed(1) + ')');

/* PVWatts inverter at the clip, at zero, and just under the clip. */
var pac0 = 1000, eta = 0.96, pdc0 = pac0 / eta;
check(Energy.pvwattsAc(0, pac0, eta) === 0, 'PVWatts AC is 0 when DC is 0');
check(Energy.pvwattsAc(pdc0, pac0, eta) === pac0, 'PVWatts AC clips at Pac0 when zeta is 1');
check(Energy.pvwattsAc(pdc0 * 1.4, pac0, eta) === pac0, 'PVWatts AC stays at Pac0 above the clip');
var just = Energy.pvwattsAc(pdc0 * 0.999, pac0, eta);
check(Math.abs(just - pac0 * 0.999) / pac0 < 0.01, 'just under the clip, efficiency is the nominal (' + just.toFixed(1) + ' W)');

var loss = Energy.lossProduct(Energy.LOSS);
check(Math.round(loss * 100) === 14, 'default loss product rounds to the PVWatts 14% (' + (loss * 100).toFixed(2) + '%)');

/* Tracker noon is flat, and backtracking shrinks the angle. */
check(Math.abs(Energy.trackerRotation(180, 60, 60, 0.35, true)) < 0.5, 'a south sun at altitude 60° holds a north-south tracker near 0°');
var ideal = Energy.trackerRotation(90, 20, 60, 0.35, false);
var back = Energy.trackerRotation(90, 20, 60, 0.35, true);
check(Math.abs(back) < Math.abs(ideal) && Math.abs(ideal) > 1, 'backtracking reduces rotation (' + back.toFixed(1) + '° vs ' + ideal.toFixed(1) + '°)');

/* Layout. */
var mod = CEC.moduleByKey('jinko-jkm640');
check(mod.voc === 49.88 && mod.vmp === 41.3 && mod.ptc === 603.7, 'Jinko 640 W carries the CEC Voc, Vmp, and PTC');
var cat = CEC.publicCatalog();
check(!JSON.stringify(cat).match(/c0|f11|betaVoc/), 'the public catalog has nameplates, not Sandia or Perez coefficients');

var field = [{ x: 0, y: 0 }, { x: 160, y: 0 }, { x: 160, y: 100 }, { x: 0, y: 100 }];
var lay = Layout.layout({ boundary: field, mount: 'fixed-ground', module: mod, lat: 33.45, lon: -112, tilt: 25, azimuth: 180, setbackFt: 10 });
check(lay.ok && lay.modules > 0, 'a field fills with ' + lay.modules + ' modules');
var inset = G.offsetPolygon(field, 10);
var inside = lay.rows.every(function (row) { return G.pointInPoly(row.point.x, row.point.y, inset.pts); });
check(inside, 'row centers sit inside the setback');
var hole = [{ x: 60, y: 40 }, { x: 100, y: 40 }, { x: 100, y: 70 }, { x: 60, y: 70 }];
var kept = Layout.layout({ boundary: field, exclusions: [hole], mount: 'fixed-ground', module: mod, lat: 33.45, lon: -112, tilt: 25, azimuth: 180, setbackFt: 10 });
check(kept.modules < lay.modules, 'a keepout removes modules (' + kept.modules + ' vs ' + lay.modules + ')');

var roof = [{ x: 0, y: 0 }, { x: 320, y: 0 }, { x: 320, y: 80 }, { x: 0, y: 80 }];
var withFire = Layout.layout({ boundary: roof, mount: 'rooftop', module: mod, lat: 33.45, lon: -112, tilt: 10, azimuth: 180, firePaths: true });
var noFire = Layout.layout({ boundary: roof, mount: 'rooftop', module: mod, lat: 33.45, lon: -112, tilt: 10, azimuth: 180, firePaths: false });
check(withFire.firePathFt === 6 && withFire.modules < noFire.modules, 'a wide roof cuts a 6 ft fire path (' + withFire.modules + ' vs ' + noFire.modules + ')');

var sol = Layout.solsticeGcr(33.45, 25, 180, {});
check(sol.gcr > 0.15 && sol.gcr < 0.98 && sol.gcr <= sol.noonGcr + 1e-9, 'solstice GCR ' + sol.gcr + ' is inside the window and at or below the noon GCR ' + sol.noonGcr);
var trk = Layout.layout({ boundary: field, mount: 'tracker-1ax', module: mod, lat: 33.45, lon: -112, azimuth: 180 });
check(trk.ok && trk.gcr >= 0.28 && trk.gcr <= 0.45, 'tracker GCR ' + trk.gcr + ' stays in 0.28–0.45');
var car = Layout.layout({ boundary: field, mount: 'carport', module: mod, lat: 33.45, lon: -112, tilt: 7, azimuth: 180 });
check(car.ok && car.modules > 0, 'a carport fills');

/* Strings. Phoenix design temperatures from the weather year. */
var inv = CEC.inverterByKey('cps-125');
var temps = Weather.extremes(Weather.year(33.45, -112.07).hours);
var wires = Stringing.design({ module: mod, inverter: inv, layout: lay, temps: { tMin: temps.tMin, tCellHot: temps.tMax + 25 } });
check(wires.ok && wires.modulesPerString >= wires.limits.nMin && wires.modulesPerString <= wires.limits.nMax, 'string length ' + wires.modulesPerString + ' is inside ' + wires.limits.nMin + '–' + wires.limits.nMax + ' at ' + temps.tMin + '°C');
var refused = Stringing.design({ module: mod, inverter: inv, layout: lay, temps: { tMin: -10, tCellHot: 70 } });
check(refused.ok === false && refused.reason.indexOf('string length') >= 0, 'an extreme cold and hot pair refuses a string that would break 690.7');
check(wires.string.conductor.ok && wires.string.conductor.dropPct <= 2, 'string drop ' + wires.string.conductor.dropPct + '% is within 2%');
check(wires.oneLine.indexOf('combiner') >= 0, 'the one-line names the combiner');

/* Shade: a tall object south of a row shades that row at noon. */
var noon = [{ year: 2021, month: 12, day: 21, hour: 12.5, dni: 600 }];
var rows = [
  { index: 0, point: { x: 20, y: 30 }, count: 8 },
  { index: 1, point: { x: 20, y: 70 }, count: 8 }
];
var open = Shade.analyze({ lat: 33.45, lon: -112, tz: -7, rows: rows, hours: noon, tilt: 25, azimuth: 180, pitchFt: 20, chordFt: 7.8, mount: 'fixed-ground', heightFt: 3, obstructions: [] });
var blocked = Shade.analyze({
  lat: 33.45, lon: -112, tz: -7, rows: rows, hours: noon, tilt: 25, azimuth: 180, pitchFt: 20, chordFt: 7.8, mount: 'fixed-ground', heightFt: 3,
  obstructions: [{ pts: [{ x: 5, y: 0 }, { x: 35, y: 0 }, { x: 35, y: 12 }, { x: 5, y: 12 }], heightFt: 40 }]
});
check(blocked.rows[0].shadePct > open.rows[0].shadePct, 'a tall obstruction south of the front row raises its shade (' + blocked.rows[0].shadePct + '% vs ' + open.rows[0].shadePct + '%)');
check(Shade.diodeBeam(0.1, 'landscape') === 1 / 3, 'landscape shade of the first sixth takes a third of the beam');

/* P50 / P90 order. */
var px = Energy.exceedance(1000, Energy.sigmaOf({}));
check(px.p99 < px.p95 && px.p95 < px.p90 && px.p90 < px.p50, 'P99 < P95 < P90 < P50');

/* Phoenix year, 1 kW, open rack, PVWatts inverter, no geometric shade. */
var met = Weather.year(33.45, -112.07);
check(met.hours.length === 8760 && met.climate === 'desert', 'Phoenix builds an 8,760 desert year');
var sys = {
  lat: 33.45, lon: -112.07, tz: met.tz, tilt: 33, azimuth: 180, mount: 'fixed-ground', gcr: 0.4,
  pdcW: 1000, pacW: 1000 / 1.2, gamma: -0.003, losses: Energy.LOSS, tempCoeff: Energy.tempCoeff('fixed-ground'),
  albedo: 0.2, etaNom: 0.96, inverter: null, temperatureModel: 'sapm'
};
var sim = Energy.simulate(sys, met.hours, 0);
console.log('     Phoenix 1 kW specific yield ' + sim.specificYield + ' kWh/kW, AC ' + sim.acKwh + ' kWh, clip ' + sim.clipKwh + ' kWh');
check(sim.specificYield > 1400 && sim.specificYield < 2200, 'Phoenix specific yield ' + sim.specificYield + ' kWh/kW is inside 1,400–2,200');
check(sim.monthly.length === 12 && sim.monthly[5].acKwh > sim.monthly[11].acKwh, 'June outproduces December');
check(sim.lossTree.length === 8 && sim.lossTree[0].name.indexOf('Plane-of-array') === 0, 'the loss tree starts at the plane of array');

/* Price. The shared library is absent on this branch; the fallback is Table 2. */
var q = Price.quote({ kwDc: 500, mount: 'roof', byMount: { roof: 500 }, state: 'AZ', zip: '85001' });
check(q.via === 'fallback' && Math.abs(q.totals.perWdc - 1.98) < 0.001, '500 kW roof is $1.98/Wdc');
check(q.requested.preview === true && q.requested.surface === 'editor-v2' && q.requested.solar.byMount.roof === 500, 'the request matches quote()');
check(q.region.factor == null, 'the labor index is not guessed when quote() is absent');
var canopy = Price.quote({ kwDc: 200, mount: 'carport', byMount: { carport: 200 } });
check(canopy.totals.perWdc == null && canopy.requested.solar.byMount.canopy === 200, 'a carport stays unpriced and is sent as a canopy');
var folded = Price.libMount({ ground: 100, tracker: 50, carport: 20 });
check(folded.ground === 150 && folded.canopy === 20, 'a tracker joins ground for the library call');
check(Price.sectorOf(10, 'roof') === 'residential' && Price.sectorOf(20000, 'ground') === 'utility', 'sector cuts match the library');

/* One design from a drawn boundary. */
var rep = Design.design({
  name: 'Golden field',
  lat: 33.45, lon: -112.07,
  mount: 'fixed-ground',
  tilt: 25, azimuth: 180,
  boundary: [{ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 80, y: 50 }, { x: 0, y: 50 }],
  exclusions: [{ pts: [{ x: 30, y: 10 }, { x: 50, y: 10 }, { x: 50, y: 25 }, { x: 30, y: 25 }], heightFt: 20 }],
  state: 'AZ'
});
check(rep.ok === true, 'a drawn field returns a design');
check(rep.text.indexOf('Solar design report') >= 0 && rep.text.indexOf('Loss tree') >= 0 && rep.text.indexOf('Monthly') >= 0 && rep.text.indexOf('Shading') >= 0 && rep.text.indexOf('Bill of materials') >= 0 && rep.text.indexOf('Wiring') >= 0, 'the report has the HelioScope sections');
check(rep.summary.p90 < rep.summary.p50 && rep.wiring.modulesPerString > 0 && rep.pricing.perWdc > 0, 'P90, strings, and a price are on the report');
check(!rep.hours && !(rep.layout && rep.layout.modules && rep.layout.corners), 'the answer does not ship the 8,760 or module corners');
console.log('     design ' + rep.summary.kwDc + ' kWdc, ' + rep.summary.specificYield + ' kWh/kW, P90 ' + rep.summary.p90 + ', $' + rep.pricing.perWdc + '/W, shade ' + rep.shading.annualPct + '%');

/* The page asks. It does not carry the engine. Site Map is untouched. */
var page = fs.readFileSync(path.join(ROOT, 'editor-v2.html'), 'utf8');
var client = fs.readFileSync(path.join(ROOT, 'omega-editor-v2-solar.js'), 'utf8');
var editor = fs.readFileSync(path.join(ROOT, 'editor.html'), 'utf8');
var route = fs.readFileSync(path.join(ROOT, 'api/solar-design.js'), 'utf8');
check(page.indexOf('omega-editor-v2-solar.js') >= 0 && page.indexOf('api/_lib/solar') < 0, 'the Site Plan loads the report and not the engine');
check(client.indexOf('f11') < 0 && client.indexOf('690.7') < 0 && client.indexOf('PEREZ') < 0, 'the browser file has no transposition table and no voltage rule');
check(editor.indexOf('omega-editor-v2-solar') < 0 && editor.indexOf('solar-design') < 0 && editor.indexOf('omega-editor-v2') < 0, 'Site Map is unchanged');
check(route.indexOf('authenticate') >= 0 && route.indexOf('publicCatalog') < 0, 'the route signs the caller in and returns the public catalog');

if (failed) {
  console.error(failed + ' failed');
  process.exit(1);
}
console.log('solar design ok');
