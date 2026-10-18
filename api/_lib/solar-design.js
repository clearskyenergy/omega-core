/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * One solar design from a drawn boundary: layout, shade, strings,
 * hourly energy, price, and the report. The browser sends geometry.
 */
'use strict';

var CEC = require('./solar-cec');
var Layout = require('./solar-layout');
var Shade = require('./solar-shade');
var Stringing = require('./solar-string');
var Energy = require('./solar-energy');
var Weather = require('./solar-weather');
var Price = require('./solar-price');
var Report = require('./solar-report');

var VERSION = 'solar-design/2';

function num(v, d) { var n = +v; return isFinite(n) ? n : d; }

function mountKey(m) {
  if (Layout.MOUNTS[m]) return m;
  if (m === 'roof' || m === 'rooftop') return 'rooftop';
  if (m === 'ground') return 'fixed-ground';
  if (m === 'tracker') return 'tracker-1ax';
  return 'fixed-ground';
}

function segmentOf(mount) {
  if (mount === 'rooftop' || mount === 'flush' || mount === 'east-west') return 'roof';
  if (mount === 'carport') return 'carport';
  if (mount === 'tracker-1ax') return 'tracker';
  return 'ground';
}

function lossesFor(wiringLoss, geometricShade) {
  var L = {};
  var k;
  for (k in Energy.LOSS) L[k] = Energy.LOSS[k];
  if (geometricShade) L.shading = 0;
  if (wiringLoss != null) L.wiring = wiringLoss;
  return L;
}

function runEnergy(sys, hours, shadeFrac) {
  return Energy.simulate(sys, hours, function (w, i) {
    if (!shadeFrac) return 0;
    return shadeFrac[i] || 0;
  });
}

function design(input) {
  input = input || {};
  var lat = num(input.lat, null);
  var lon = num(input.lon, null);
  if (lat == null || lon == null) return { ok: false, reason: 'The design needs a latitude and a longitude. Set the site anchor first.' };
  if (Math.abs(lat) > 66) return { ok: false, reason: 'This model stops at 66° latitude. The clear-sky year is not a polar resource.' };
  var mount = mountKey(input.mount);
  var mod = CEC.moduleByKey(input.moduleKey || 'jinko-jkm640');
  var inv = CEC.inverterByKey(input.inverterKey || 'cps-125');
  var boundary = input.boundary;
  if (!boundary || boundary.length < 3) return { ok: false, reason: 'Draw a closed boundary, then run the solar design.' };

  var tilt = input.tilt === '' || input.tilt == null ? null : num(input.tilt, null);
  var azimuth = input.azimuth === '' || input.azimuth == null ? null : num(input.azimuth, null);
  var optimized = null;
  if ((tilt == null || azimuth == null) && (mount === 'fixed-ground')) {
    optimized = Layout.optimize({ lat: lat, lon: lon });
    if (tilt == null) tilt = optimized.tilt;
    if (azimuth == null) azimuth = optimized.azimuth;
  }

  var lay = Layout.layout({
    boundary: boundary,
    exclusions: (input.exclusions || []).map(function (e) { return e.pts || e; }),
    mount: mount,
    module: mod,
    lat: lat,
    lon: lon,
    tilt: tilt,
    azimuth: azimuth,
    setbackFt: input.setbackFt,
    gcr: input.gcr,
    firePaths: input.firePaths !== false,
    firePathFt: input.firePathFt,
    keepoutSetbackFt: input.keepoutSetbackFt,
    orientation: input.orientation,
    heightFt: input.heightFt
  });
  if (!lay.ok) return lay;
  if (!lay.modules) return { ok: false, reason: 'No modules fit. Reduce the setback or enlarge the boundary.', layout: lay };

  var met = input.hours && input.hours.length >= 24 ? { hours: input.hours, tz: num(input.tz, Weather.tzOf(lon)), climate: 'caller', kind: 'Caller-supplied hourly weather.' } : Weather.year(lat, lon);
  var temps = Weather.extremes(met.hours);
  var tCellHot = temps.tMax + (mount === 'rooftop' || mount === 'flush' ? 30 : 25);

  var wires = Stringing.design({
    module: mod,
    inverter: inv,
    layout: lay,
    temps: { tMin: temps.tMin, tCellHot: tCellHot },
    dcAc: input.dcAc,
    homeRunFt: input.homeRunFt,
    combinerPoles: input.combinerPoles
  });
  if (!wires.ok) return wires;

  var shade = null;
  var shadeFrac = null;
  if (input.skipShade !== true) {
    shade = Shade.analyze({
      lat: lat, lon: lon, tz: met.tz,
      rows: lay.rows, hours: met.hours,
      tilt: lay.tilt, azimuth: lay.azimuth, pitchFt: lay.pitchFt, chordFt: lay.chordFt,
      mount: lay.mount, orientation: lay.orientation, heightFt: lay.heightFt,
      obstructions: (input.exclusions || []).concat(input.obstructions || []),
      horizon: input.horizon || [],
      backtrack: input.backtrack !== false
    });
    shadeFrac = shade.hourBeamLoss;
  }

  var L = lossesFor(wires.wiringLoss, !!shadeFrac);
  var sys = {
    lat: lat, lon: lon, tz: met.tz,
    tilt: lay.tilt, azimuth: lay.azimuth, mount: lay.mount, gcr: lay.gcr,
    pdcW: wires.watts,
    pacW: wires.kwAc * 1000,
    inverterCount: wires.inverters,
    gamma: mod.gammaPmp,
    losses: L,
    tempCoeff: Energy.tempCoeff(lay.mount),
    albedo: input.albedo == null ? 0.2 : +input.albedo,
    etaNom: 0.96,
    inverter: input.inverterModel === 'pvwatts' ? null : inv,
    backtrack: input.backtrack !== false,
    temperatureModel: input.temperatureModel || 'sapm'
  };

  var energy;
  if (mount === 'east-west') {
    var east = runEnergy(Object.assign({}, sys, { azimuth: 90, tilt: lay.tilt, pdcW: lay.watts / 2, pacW: sys.pacW / 2 }), met.hours, shadeFrac);
    var west = runEnergy(Object.assign({}, sys, { azimuth: 270, tilt: lay.tilt, pdcW: lay.watts / 2, pacW: sys.pacW / 2 }), met.hours, shadeFrac);
    energy = east;
    energy.acKwh = Math.round((east.acKwh + west.acKwh) * 10) / 10;
    energy.specificYield = lay.watts > 0 ? Math.round(energy.acKwh / (lay.watts / 1000) * 10) / 10 : 0;
    var mi;
    for (mi = 0; mi < energy.monthly.length; mi++) {
      energy.monthly[mi].acKwh = Math.round((east.monthly[mi].acKwh + west.monthly[mi].acKwh) * 10) / 10;
    }
  } else {
    energy = runEnergy(sys, met.hours, shadeFrac);
  }

  var sigma = Energy.sigmaOf(input.variability || {});
  var prob = Energy.exceedance(energy.acKwh, sigma);

  var seg = segmentOf(mount);
  var byMount = {};
  byMount[seg] = wires.kwDc;
  var priced = Price.quote({
    kwDc: wires.kwDc,
    mount: seg,
    byMount: byMount,
    state: input.state || null,
    zip: input.zip || null
  });

  var perW = priced.totals && priced.totals.perWdc != null ? priced.totals.perWdc : null;
  var priceSummary = perW != null
    ? ('$' + perW.toFixed(2) + '/Wdc national, ' + (priced.totals.usd != null ? ('$' + Math.round(priced.totals.usd).toLocaleString()) : '—') + '. Labor index is not applied to this all-in price.')
    : 'No published $/Wdc for this segment. The line is left blank.';
  if (priced.region && priced.region.factor) priceSummary += ' Labor factor ' + priced.region.factor + ' (' + (priced.region.name || priced.region.geography) + ') applies to labor lines only.';

  var bom = [
    { item: mod.manufacturer + ' ' + mod.name, qty: wires.strung, unit: 'module', note: mod.watts + ' W, CEC' + (wires.unstrung ? ('; ' + wires.unstrung + ' placed module' + (wires.unstrung === 1 ? '' : 's') + ' left unstrung') : '') },
    { item: inv.name, qty: wires.inverters, unit: 'inverter', note: inv.kwAc + ' kW AC, CEC' },
    { item: 'DC combiner, ' + wires.poles + '-pole', qty: wires.combiners, unit: 'combiner', note: '' },
    { item: 'String conductor ' + wires.string.conductor.awg + ' Cu', qty: wires.strings, unit: 'string', note: wires.string.ft + ' ft each' },
    { item: 'Home-run conductor ' + wires.homeRun.conductor.awg + ' Cu', qty: wires.combiners, unit: 'run', note: wires.homeRun.ft + ' ft' }
  ];

  var assumptions = [
    'Weather: ' + met.kind + (met.climate && met.climate !== 'caller' ? (' (' + met.climate + ')') : '') + '.',
    'Transposition is Perez 1990. Cover IAM is a single glass slab, n = 1.526, normalized at normal incidence.',
    'Cell temperature is the Sandia model (' + sys.tempCoeff.label + '). It is not the Fuentes model PVWatts V5 uses.',
    'Cold design temperature is the coldest hour of this weather year (' + temps.tMin + '°C), not an ASHRAE station.',
    'Hot cell temperature for the power-point check is ' + tCellHot + '°C.',
    'P90 uses a normal distribution. Weather variability 4%, model 3%, soiling 1%, combined sigma ' + (Math.round(sigma * 1000) / 10) + '%. This is not a DNV comparison to PVsyst.',
    'Year-1 energy includes the default light-induced degradation. The long-term degradation rate is 0.4%/year and is not taken out of year 1 again.',
    priced.via === 'pricing.quote'
      ? 'Price came from api/_lib/pricing.js quote().'
      : 'Price uses the DOE Q1 2025 Table 2 figures the shared library cites. quote() is used when api/_lib/pricing.js is present.'
  ];
  if (optimized) assumptions.push(optimized.note + ' Chosen tilt ' + optimized.tilt + '°, azimuth ' + optimized.azimuth + '°.');
  if (lay.spacing && lay.spacing.window) assumptions.push('Row pitch is the winter-solstice window ' + lay.spacing.window + ' (GCR ' + lay.gcr + ').');
  if (lay.spacing && lay.spacing.note) assumptions.push(lay.spacing.note);

  var summary = {
    name: input.name || '',
    mount: mount,
    mountLabel: lay.mountLabel,
    kwDc: wires.kwDc,
    kwAc: wires.kwAc,
    dcAc: wires.dcAc,
    modules: wires.strung,
    placed: wires.placed,
    unstrung: wires.unstrung,
    moduleName: mod.manufacturer + ' ' + mod.name,
    moduleKey: mod.key,
    inverters: wires.inverters,
    inverterName: inv.name,
    inverterKey: inv.key,
    tilt: lay.tilt,
    azimuth: lay.azimuth,
    gcr: lay.gcr,
    pitchFt: lay.pitchFt,
    setbackFt: lay.setbackFt,
    firePathFt: lay.firePathFt,
    acKwh: energy.acKwh,
    specificYield: energy.specificYield,
    p50: prob.p50,
    p90: prob.p90,
    p95: prob.p95,
    p99: prob.p99,
    weather: met.kind
  };

  var shadingOut = shade ? {
    annualPct: shade.annualPct,
    rows: shade.rows,
    near: shade.near,
    horizon: shade.horizon
  } : { annualPct: null, rows: [], near: 'Shading was not run.', horizon: '' };

  var report = {
    ok: true,
    version: VERSION,
    summary: summary,
    lossTree: energy.lossTree,
    monthly: energy.monthly,
    shading: shadingOut,
    bom: bom,
    wiring: {
      oneLine: wires.oneLine,
      limits: wires.limits,
      modulesPerString: wires.modulesPerString,
      strings: wires.strings,
      string: wires.string,
      homeRun: wires.homeRun,
      dcAc: wires.dcAc
    },
    pricing: {
      via: priced.via || 'pricing.quote',
      perWdc: perW,
      usd: priced.totals ? priced.totals.usd : null,
      region: priced.region || null,
      lines: priced.lines || [],
      summary: priceSummary
    },
    layout: {
      modules: lay.modules,
      rowCount: lay.rowCount,
      gcr: lay.gcr,
      pitchFt: lay.pitchFt,
      tilt: lay.tilt,
      azimuth: lay.azimuth,
      setbackFt: lay.setbackFt,
      firePathFt: lay.firePathFt,
      capped: lay.capped
    },
    assumptions: assumptions,
    optimized: optimized
  };
  report.text = Report.text(report);
  return report;
}

module.exports = {
  VERSION: VERSION,
  design: design,
  catalog: CEC.publicCatalog,
  VERSION_SUN: null
};
