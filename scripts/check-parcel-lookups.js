#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Does every public parcel source still answer a POINT with a lot? The
 * portfolio's space reading and the editor's parcel lookup both ask
 * api/parcel.js, and a layer that moves or renames a field answers nothing
 * rather than failing loudly. This runs the REAL lookup chain (no licensed
 * key, the nearest-lot rule on, as the portfolio screen asks) at each
 * source's own `test` point and says which answered, from which source, and
 * how long it took.
 *
 *   node scripts/check-parcel-lookups.js            every lookup source
 *   node scripts/check-parcel-lookups.js nc,okmaps  some of them
 *
 * NETWORK: it reaches every state's and county's server, so it is not in npm
 * test. Behind a proxy run it with NODE_USE_ENV_PROXY=1. Exit 1 when any
 * source gave no lot. A test point can sit on a road, which is why the
 * nearest-lot rule is on: "nearest, 40 ft" is a pass. */
'use strict';
var PS = require('../omega-parcel-sources.js');
var P = require('../api/parcel.js')._helpers;
var only = (process.argv[2] || '').split(',').filter(Boolean);
var say = console.log; console.log = function () {};             /* the lookup logs each call */

var rows = PS.LOOKUP_ORDER.map(function (id) { var s = PS.byId(id); return { id: id, lat: s.test[0], lng: s.test[1] }; })
  .concat(PS.WMS_LOOKUPS.map(function (w) { return { id: w.id, lat: w.test[0], lng: w.test[1] }; }))
  .filter(function (r) { return !only.length || only.indexOf(r.id) >= 0; });

(async function () {
  var bad = [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i], t0 = Date.now(), out;
    try { out = await P.lookup({ orgId: 'check' }, { regrid: false }, r.lat, r.lng, { near: true }); } catch (e) { out = { ok: false, tried: [], note: String(e && e.message || e) }; }
    var mine = out.ok && out.source === r.id;
    if (!out.ok) bad.push(r.id);
    say((out.ok ? (mine ? 'ok  ' : 'ok* ') : 'MISS') + ' ' + r.id + (out.ok ? '  ' + out.source + '  ' + (out.apn || 'no id') + '  ' + (out.county || '') + '  ' + out.acres + ' ac' + (out.nearest ? '  nearest, ' + out.nearestFt + ' ft' : '') : '  ' + (out.note || 'nothing under or near the point')) + '  ' + (Date.now() - t0) + ' ms');
  }
  say('\n' + (rows.length - bad.length) + ' of ' + rows.length + ' answered' + (bad.length ? '; no lot from: ' + bad.join(', ') : '') + '. (ok* = answered by another source whose box holds the point)');
  process.exit(bad.length ? 1 : 0);
})();
