/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * hosting-screen.js — one hosting-capacity feature, as a circuit a grid
 * verdict can judge.
 *
 * The registry and the query live in hosting-capacity.js. This file only
 * chooses which published figure is the screen (generation capacity when
 * the layer has it, otherwise PV) and says which one it used. A PV figure
 * is not a battery figure. ComEd is not handled here.
 *
 * Pure. ES5.
 */
'use strict';

var H = require('./hosting-capacity');

function fail(message) {
  var e = new Error(message);
  e.status = 400;
  return e;
}

function screen(source, feature) {
  var row, kind, published;
  try { row = H.normalize(source, feature); }
  catch (e) { throw fail(e.message || 'Unknown hosting source'); }
  if (row.genKw != null) { kind = 'generation'; published = row.genKw; }
  else if (row.pvKw != null) { kind = 'pv'; published = row.pvKw; }
  else { kind = null; published = null; }
  return {
    covered: true,
    sourceId: row.sourceId,
    utility: row.utility,
    grain: row.grain,
    verified: (typeof source === 'object' && source && source.verified) || null,
    asOf: row.asOf,
    note: row.note,
    publishedKind: kind,
    circuit: {
      utility: row.utility,
      id: row.feederId || row.name || '',
      substation: row.substation || '',
      publishedKw: published,
      queuedKw: row.queuedKw == null ? 0 : row.queuedKw,
      addressResolved: false,
      grain: row.grain
    }
  };
}

function coveredStates() {
  var out = [], i, j, s;
  for (i = 0; i < H.SOURCES.length; i++) {
    for (j = 0; j < H.SOURCES[i].states.length; j++) {
      s = H.SOURCES[i].states[j];
      if (out.indexOf(s) < 0) out.push(s);
    }
  }
  return out;
}

module.exports = { screen: screen, coveredStates: coveredStates };
