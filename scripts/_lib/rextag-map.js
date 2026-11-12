/* ═══════════════════════════════════════════════════════════════════════════
   scripts/_lib/rextag-map.js — the Rextag telecom delivery, normalized
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   The ONE attribute mapping from a licensed Rextag GIS delivery (Fiber
   Optic Network lines, Data Center points) to the shapes Grid Atlas reads.
   Pure functions, no I/O — scripts/ingest-rextag.js does the files, this
   does the meaning, and scripts/tests/trextagmap.js holds it.

   Rextag separates Operator from Owner, and both are kept: who runs a
   route and who owns it are different phone calls. `Type` becomes `class`
   by the table below; a type the table does not know is `unknown`, never
   promoted. Nothing here invents a value: a column the delivery does not
   carry is null, and `confidence` is "high" because this is the licensed,
   surveyed product — the one dataset in the stack that does not need the
   aggregator caveats.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

/* Rextag `Type` → normalized class. Case-insensitive, punctuation-loose.
   Observed values from the live viewer: "Longhaul Backbone",
   "Regional Backbone", "Metro Backbone", "Metro". */
var CLASS_MAP = [
  [/long\s*-?\s*haul/i, 'longhaul'],
  [/regional/i, 'regional'],
  [/metro/i, 'metro']
];

function classOf(type) {
  var s = type == null ? '' : String(type);
  for (var i = 0; i < CLASS_MAP.length; i++) {
    if (CLASS_MAP[i][0].test(s)) return CLASS_MAP[i][1];
  }
  return 'unknown';
}

/* Property names as the delivery prints them, read case-insensitively so a
   shapefile's 10-character DBF upper-casing (NAME, OPERATOR) still lands. */
function prop(props, name) {
  if (!props) return null;
  if (props[name] != null) return props[name];
  var lower = name.toLowerCase();
  for (var k in props) {
    if (Object.prototype.hasOwnProperty.call(props, k) && k.toLowerCase() === lower && props[k] != null) return props[k];
  }
  return null;
}

function str(v) { v = v == null ? '' : String(v).trim(); return v ? v : null; }
function num(v) { var n = parseFloat(v); return isFinite(n) ? n : null; }

/* One delivered fiber feature → the normalized route feature.
   Geometry passes through untouched — reprojection to EPSG:4326 is
   ogr2ogr's job in the ingest script, never arithmetic here. */
function fiberFeature(f, asOf) {
  if (!f || !f.geometry) return null;
  var t = f.geometry.type;
  if (t !== 'LineString' && t !== 'MultiLineString') return null;
  var p = f.properties || {};
  return {
    type: 'Feature',
    geometry: f.geometry,
    properties: {
      source: 'rextag',
      name: str(prop(p, 'Name')),
      operator: str(prop(p, 'Operator')),
      owner: str(prop(p, 'Owner')),
      class: classOf(prop(p, 'Type')),
      miles: num(prop(p, 'Miles')),
      confidence: 'high',
      attribution: 'Rextag (licensed)',
      updated: str(prop(p, 'Updated')) || asOf || null
    }
  };
}

/* One delivered data-center feature → the normalized point the
   dc_licensed layer reads (name, operator, owner, power_mw, tier). */
function dcFeature(f, asOf) {
  if (!f || !f.geometry || f.geometry.type !== 'Point') return null;
  var p = f.properties || {};
  var c = f.geometry.coordinates;
  if (!c || typeof c[0] !== 'number' || typeof c[1] !== 'number' ||
      Math.abs(c[0]) > 180 || Math.abs(c[1]) > 90) return null;
  return {
    type: 'Feature',
    geometry: f.geometry,
    properties: {
      source: 'rextag',
      name: str(prop(p, 'Name')),
      operator: str(prop(p, 'Operator')),
      owner: str(prop(p, 'Owner')),
      address: str(prop(p, 'Address')),
      city: str(prop(p, 'City')),
      state: str(prop(p, 'State')),
      power_mw: num(prop(p, 'Power_MW')) != null ? num(prop(p, 'Power_MW')) : num(prop(p, 'PowerMW')),
      tier: str(prop(p, 'Tier')),
      attribution: 'Rextag (licensed)',
      updated: str(prop(p, 'Updated')) || asOf || null
    }
  };
}

module.exports = { classOf: classOf, fiberFeature: fiberFeature, dcFeature: dcFeature, prop: prop };
