/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   May 2025 OEWS mean hourly wages and employment. The numbers live in
   the accepted BLS snapshot the collector writes; this file only turns
   them into a labor factor. A later collect does not replace the
   snapshot. Davis-Bacon is not blended in. A national benefit load
   would cancel in the ratio. */
'use strict';

var SNAP = require('../../data/pricing-snapshots/bls-oews/accepted.json');
var REC = SNAP.records;

var SOC = REC.soc;
var PUBLISHED = SNAP.published;
var READ = SNAP.read;
var SOURCE = SNAP.citation;
var URL = SNAP.url;
var NATIONAL = REC.national;
var STATES = REC.states;
var METROS = REC.metros;

function composite(hourly, employment) {
  var n = 0, d = 0, i;
  for (i = 0; i < hourly.length; i++) {
    n += hourly[i] * employment[i];
    d += employment[i];
  }
  return d ? n / d : null;
}

var NATIONAL_COMPOSITE = composite(NATIONAL.hourly, NATIONAL.employment);

function round4(x) {
  return Math.round(x * 10000) / 10000;
}

function pack(rec, geography, name, code) {
  var c = composite(rec.hourly, rec.employment);
  return {
    geography: geography,
    name: name,
    code: code,
    composite: round4(c),
    factor: round4(c / NATIONAL_COMPOSITE),
    electricianHourly: rec.hourly[0],
    electricianFactor: round4(rec.hourly[0] / NATIONAL.hourly[0]),
    hourly: rec.hourly,
    employment: rec.employment
  };
}

function zip3Of(zip) {
  var z = zip == null ? '' : String(zip).replace(/\D/g, '');
  return z.length >= 3 ? z.slice(0, 3) : null;
}

function metroForZip3(zip3) {
  var id, m;
  for (id in METROS) {
    if (!Object.prototype.hasOwnProperty.call(METROS, id)) continue;
    m = METROS[id];
    if (m.zip3.indexOf(zip3) >= 0) return { id: id, metro: m };
  }
  return null;
}

function lookup(state, zip) {
  var z3 = zip3Of(zip);
  var st = state ? String(state).toUpperCase() : null;
  var hit, packed;
  if (z3) {
    hit = metroForZip3(z3);
    if (hit) {
      packed = pack(hit.metro, 'metro', hit.metro.name, hit.id);
      packed.zip3 = z3;
      packed.state = st;
      return packed;
    }
  }
  if (st && STATES[st]) {
    packed = pack(STATES[st], 'state', st, st);
    packed.zip3 = z3;
    packed.state = st;
    return packed;
  }
  return {
    geography: st || z3 ? 'unmapped' : 'national',
    name: st || z3 ? null : 'United States',
    code: st || null,
    zip3: z3,
    state: st,
    composite: st || z3 ? null : round4(NATIONAL_COMPOSITE),
    factor: st || z3 ? null : 1,
    electricianHourly: NATIONAL.hourly[0],
    electricianFactor: st || z3 ? null : 1,
    hourly: NATIONAL.hourly,
    employment: NATIONAL.employment
  };
}

module.exports = {
  SOC: SOC,
  PUBLISHED: PUBLISHED,
  READ: READ,
  SOURCE: SOURCE,
  URL: URL,
  NATIONAL: NATIONAL,
  NATIONAL_COMPOSITE: NATIONAL_COMPOSITE,
  STATES: STATES,
  METROS: METROS,
  composite: composite,
  lookup: lookup,
  zip3Of: zip3Of
};
