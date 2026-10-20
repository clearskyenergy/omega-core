/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * 29 W Main St, Mesa, Arizona. One validation site: a flat-roof retail
 * plate on the street and a parking canopy behind it, with the neighbors
 * the city has already drawn.
 *
 * Geometry is local feet. +x east, +y north. The origin is the southwest
 * corner of Maricopa parcel 138-41-024. The ring is that parcel, read
 * 2026-10-18 from the county assessor (APN 13841024, owner DT MESA
 * HOLDCO LLC, land 20,367 sq ft). Building outlines are the City of Mesa
 * building-footprint layer (BaseMap_Public, layer 22), same day. That
 * layer has no footprint on this parcel: the bank that stood here was
 * demolished. The roof below is the 7,000 sq ft ground-floor retail
 * plate described for the site (East Valley Tribune, 26 July 2023),
 * set on the Main Street frontage. It is not a traced roof.
 *
 * Heights are not on the city layer (the Z values are 0). Storefronts
 * are taken as 18 ft to the parapet, one story, which is what a 20 ft
 * wide downtown bay is. Heritage Academy's newer annex is published as
 * one story; the main building's height is not published, so the shade
 * run uses 24 ft and a 40 ft sensitivity. Across Main Street the gap is
 * the right of way.
 */
'use strict';

var Design = require('./solar-design');
var Layout = require('./solar-layout');
var Weather = require('./solar-weather');

var VERSION = 'solar-site-main/2';

var ANCHOR = { lat: 33.414487773377665, lon: -111.83277233740486 };

var PARCEL = [
  { x: 131.08, y: 155.20 },
  { x: 130.00, y: 0 },
  { x: 0, y: 0.60 },
  { x: 0.69, y: 155.80 }
];

/* North 53.7 ft of the parcel. 130.4 ft of frontage × 53.7 ft ≈ 7,000 sq ft. */
var ROOF = [
  { x: 0.45, y: 102 },
  { x: 130.71, y: 102 },
  { x: 131.08, y: 155.20 },
  { x: 0.69, y: 155.80 }
];

/* South of a 24 ft drive aisle. */
var CANOPY = [
  { x: 0.34, y: 78 },
  { x: 130.54, y: 78 },
  { x: 130.00, y: 0 },
  { x: 0, y: 0.60 }
];

function box(name, x0, y0, x1, y1, heightFt) {
  return {
    name: name,
    heightFt: heightFt,
    pts: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]
  };
}

/* Bounding boxes of the city footprints that can throw a shadow onto the lot. */
var NEIGHBORS = [
  box('21 W Main St, store', 130.0, 54.0, 152.3, 153.1, 18),
  box('37 W Main St, store', -41.8, 17.3, -21.8, 155.9, 18),
  box('Heritage Academy, 32 S Center St', 185.7, -208.5, 325.5, -25.6, 24),
  box('30 W Main St, across the street', -0.9, 287.4, 78.8, 427.3, 18)
];

function neighbors(schoolFt) {
  return NEIGHBORS.map(function (n) {
    var h = n.heightFt;
    if (schoolFt && n.name.indexOf('Heritage') === 0) h = schoolFt;
    return { name: n.name, heightFt: h, pts: n.pts };
  });
}

function base(hours) {
  return {
    name: '29 W Main St, Mesa',
    lat: ANCHOR.lat,
    lon: ANCHOR.lon,
    moduleKey: 'jinko-jkm640',
    inverterKey: 'sungrow-60',
    azimuth: 180,
    state: 'AZ',
    zip: '85201',
    hours: hours
  };
}

function segment(hours, boundary, mount, opts) {
  var body = base(hours);
  body.boundary = boundary;
  body.mount = mount;
  body.tilt = opts.tilt;
  body.setbackFt = opts.setbackFt;
  body.heightFt = opts.heightFt;
  body.obstructions = opts.obstructions || [];
  if (opts.gcr > 0) body.gcr = opts.gcr;
  if (opts.skipShade) body.skipShade = true;
  var rep = Design.design(body);
  if (!rep.ok) return rep;
  return {
    ok: true,
    mount: rep.summary.mount,
    kwDc: rep.summary.kwDc,
    kwAc: rep.summary.kwAc,
    dcAc: rep.summary.dcAc,
    modules: rep.summary.modules,
    placed: rep.summary.placed,
    unstrung: rep.summary.unstrung,
    tilt: rep.summary.tilt,
    azimuth: rep.summary.azimuth,
    gcr: rep.summary.gcr,
    pitchFt: rep.summary.pitchFt,
    setbackFt: rep.summary.setbackFt,
    acKwh: rep.summary.acKwh,
    specificYield: rep.summary.specificYield,
    p50: rep.summary.p50,
    p90: rep.summary.p90,
    shadePct: rep.shading.annualPct,
    rows: (rep.shading.rows || []).map(function (r) {
      return { index: r.index, shadePct: r.shadePct };
    }),
    perWdc: rep.pricing.perWdc,
    modulesPerString: rep.wiring.modulesPerString,
    strings: rep.wiring.strings,
    nMin: rep.wiring.limits.nMin,
    nMax: rep.wiring.limits.nMax,
    dcAcTarget: 1.25,
    oneLine: rep.wiring.oneLine
  };
}

function sumYield(parts) {
  var w = 0, k = 0, i;
  for (i = 0; i < parts.length; i++) {
    w += parts[i].kwDc;
    k += parts[i].acKwh;
  }
  return {
    kwDc: Math.round(w * 10) / 10,
    acKwh: Math.round(k),
    specificYield: w > 0 ? Math.round(k / w) : 0
  };
}

/* The design HelioScope's commercial guide would draw, on this parcel,
   plus the same arrays with the neighbors turned off. Energy is this
   engine's clear-sky year. HelioScope would swap in a TMY. */
function run() {
  var met = Weather.year(ANCHOR.lat, ANCHOR.lon);
  var hours = met.hours;
  var obs = neighbors(24);
  /* 10° south, December 21, 10:00–14:00. The ground-mount cap (0.55) is
     tighter than this and is not what the commercial guide draws. */
  var roofGcr = Layout.solsticeGcr(ANCHOR.lat, 10, 180, {}).gcr;
  var roofOpts = { tilt: 10, setbackFt: 4, heightFt: 16, gcr: roofGcr };
  var canopyOpts = { tilt: 7, setbackFt: 5, heightFt: 14 };
  var roof = segment(hours, ROOF, 'fixed-ground', Object.assign({ obstructions: obs }, roofOpts));
  var canopy = segment(hours, CANOPY, 'carport', Object.assign({ obstructions: obs }, canopyOpts));
  var roofOpen = segment(hours, ROOF, 'fixed-ground', Object.assign({ obstructions: [] }, roofOpts));
  var canopyOpen = segment(hours, CANOPY, 'carport', Object.assign({ obstructions: [] }, canopyOpts));
  var canopyTall = segment(hours, CANOPY, 'carport', Object.assign({ obstructions: neighbors(40) }, canopyOpts));
  var traced = segment(hours, PARCEL, 'carport', Object.assign({ obstructions: obs }, canopyOpts));
  if (!roof.ok || !canopy.ok || !roofOpen.ok || !canopyOpen.ok || !canopyTall.ok || !traced.ok) {
    return { ok: false, roof: roof, canopy: canopy, traced: traced };
  }
  var both = sumYield([roof, canopy]);
  return {
    ok: true,
    version: VERSION,
    address: '29 W Main St, Mesa, AZ 85201',
    apn: '138-41-024',
    climate: met.climate,
    weather: met.kind,
    roof: roof,
    canopy: canopy,
    combined: both,
    open: {
      roofShade: roofOpen.shadePct, canopyShade: canopyOpen.shadePct,
      roofKwh: roofOpen.acKwh, canopyKwh: canopyOpen.acKwh,
      roofModules: roofOpen.modules, canopyModules: canopyOpen.modules
    },
    schoolAt40: { shadePct: canopyTall.shadePct, acKwh: canopyTall.acKwh },
    tracedCanopy: { kwDc: traced.kwDc, modules: traced.modules, shadePct: traced.shadePct, specificYield: traced.specificYield, acKwh: traced.acKwh },
    notes: [
      'The county parcel is the boundary. The city building layer has no footprint on it.',
      'The roof is the published 7,000 sq ft retail plate on the Main Street side, tilted 10° south with a 4 ft setback. That is the commercial flat-roof recipe in HelioScope\'s own guide (low tilt, winter-solstice spacing, 4 or 6 ft perimeter).',
      'The canopy is the parking south of a 24 ft drive, 7° south, 5 ft setback, 14 ft clear. HelioScope models a carport as its own racking type.',
      'A canopy on the whole open lot is what a designer would trace from today\'s imagery, because there is no roof to trace.',
      'Neighbor shade uses the city footprints. Storefronts are 18 ft. Heritage Academy is 24 ft, with a 40 ft rerun because that height is not published.',
      'Year-1 energy is the clear-sky desert year, not a Mesa TMY. HelioScope would run a TMY and, on Pro, a multi-year P90. The layout and the shade delta are the comparison that does not depend on that file.'
    ]
  };
}

module.exports = {
  VERSION: VERSION,
  ANCHOR: ANCHOR,
  PARCEL: PARCEL,
  ROOF: ROOF,
  CANOPY: CANOPY,
  NEIGHBORS: NEIGHBORS,
  run: run
};
