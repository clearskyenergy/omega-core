#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Are the published hosting capacity maps still there, and do they still
 * mean what api/_lib/hosting-sources.js says they mean? Utilities move
 * their services (ComEd renames its service monthly; ACE puts a date in its
 * name; Eversource retired its ArcGIS map for a vendor navigator) and a
 * moved or renamed field does not fail loudly: it reads as "no circuit".
 *
 * For every verified entry (and its fallback) this asks the entry's own
 * test point exactly as POST /api/hosting-capacity does, and reports:
 *   - the outcome, the number of features and circuits, and the time, and
 *     whether the door's reading was partial (a layer, join or season that
 *     did not answer inside its 8 s budget: said, and never cached);
 *   - the fields each layer returned against the fields the registry asks
 *     for (a missing one is a renamed field);
 *   - a units sanity check on the kW it produced (a figure over 100 MW on a
 *     distribution circuit means a unit read twice; every figure under 10
 *     from an MW source means a unit not converted).
 * Then each territory layer at a point in its state.
 *
 *   node scripts/check-hosting-sources.js              every source
 *   node scripts/check-hosting-sources.js comed,ace    some of them
 *   node scripts/check-hosting-sources.js --no-territory
 *
 * NETWORK: it reaches every utility's server, so it is not in npm test.
 * Exit 1 when a verified source returns nothing at its own test point or a
 * field it reads is gone. */
'use strict';
var path = require('path');
var ROOT = path.join(__dirname, '..');
var HS = require(path.join(ROOT, 'api/_lib/hosting-sources'));
var UT = require(path.join(ROOT, 'api/_lib/utility-territory'));
var H = require(path.join(ROOT, 'api/hosting-capacity'))._helpers;
var args = process.argv.slice(2), only = (args.filter(function (a) { return a[0] !== '-'; })[0] || '').split(',').filter(Boolean);
var noTerritory = args.indexOf('--no-territory') >= 0;
var failures = 0;

function deps() { return { fetchJson: H.liveFetchJson, now: Date.now, db: function () { return null; }, log: function () {} }; }
function pad(s, n) { s = String(s); return s.length >= n ? s : s + new Array(n - s.length + 1).join(' '); }

/* the raw first feature of each layer at the test point, to compare fields */
function rawFields(entry, spec, lat, lng) {
  var layers = (spec.layers || []), r = (spec.radii || entry.radii || [150]).slice(-1)[0];
  return Promise.all(layers.map(function (L) {
    return Promise.all(L.ids.map(function (id) {
      var url = L.comed ? HS.comedQuery(L, lat, lng) : HS.arcgisQuery(L, id, lat, lng, r, spec.geometry || entry.geometry);
      var t0 = Date.now();
      return H.liveFetchJson(url, { timeoutMs: 30000, headers: L.comed ? HS.comedHeaders() : null }).then(function (j) {
        if (j && j.error) return { layer: L, id: id, ms: Date.now() - t0, error: 'service error ' + (j.error.code || '') };
        var f = (j.features || [])[0], seen = f ? Object.keys(f.attributes || {}) : [];
        return { layer: L, id: id, ms: Date.now() - t0, n: (j.features || []).length, missing: f ? L.outFields.filter(function (k) { return seen.indexOf(k) < 0; }) : null };
      }, function (e) { return { layer: L, id: id, ms: Date.now() - t0, error: e && e.blocked ? 'blocked (not JSON)' : (e && e.name === 'AbortError' ? 'timeout' : (e && e.message) || 'error') }; });
    }));
  })).then(function (a) { return [].concat.apply([], a); });
}
function envelioFields(spec, lat, lng) {
  var t0 = Date.now();
  return H.liveFetchJson(HS.envelioParcel(spec.envelio.host, lat, lng), { timeoutMs: 30000 }).then(function (j) {
    var d = j && j.data;
    if (!d || d.parcel_id == null) return [{ id: 'parcel', ms: Date.now() - t0, n: 0, missing: null }];
    return H.liveFetchJson(HS.envelioSidebar(spec.envelio.host, d.parcel_id, 'gen', 'SUMMER'), { timeoutMs: 30000 }).then(function (s) {
      var x = (s && s.data) || {}, cv = x.customer_values || {};
      var want = ['hosting_capacity', 'line_voltage_in_kv', 'phase', 'distance_in_meters'], wantCv = ['feeder_name', 'primary_station_name', 'primary_station_hc_in_kw', 'generators_in_queue_in_kw', 'date_last_updated'];
      return [{ id: 'parcel ' + d.parcel_id + ' sidebar', ms: Date.now() - t0, n: 1,
        missing: want.filter(function (k) { return !(k in x); }).concat(wantCv.filter(function (k) { return !(k in cv); }).map(function (k) { return 'customer_values.' + k; })) }];
    });
  }, function (e) { return [{ id: 'parcel', ms: Date.now() - t0, error: (e && e.message) || 'error' }]; });
}
function sanity(entry, circuits) {
  var notes = [], vals = [];
  circuits.forEach(function (c) { ['genKw', 'loadKw', 'storageKw'].forEach(function (k) { if (c[k] != null) vals.push(c[k]); }); });
  if (vals.some(function (v) { return v > 100000; })) notes.push('a figure over 100 MW on a distribution circuit: a unit read twice?');
  if (/MW/.test(entry.units || '') && vals.length && vals.every(function (v) { return v > 0 && v < 10; })) notes.push('every figure under 10 kW from an MW source: a unit not converted?');
  return notes;
}
function checkEntry(entry) {
  var lat = entry.test[0], lng = entry.test[1], specs = [{ spec: entry, fb: false }].concat(entry.fallback ? [{ spec: entry.fallback, fb: true }] : []);
  return specs.reduce(function (p, s) {
    return p.then(function () {
      var spec = s.spec, kind = spec.kind || entry.kind, t0 = Date.now(), tried = [];
      var budget = { until: Date.now() + 30000 };
      var run = s.fb ? H.probeFallback(entry, { outcome: 'empty', circuits: [] }, lat, lng, 'storage', deps(), Date.now() + 30000, tried)
                     : H.probe(entry, lat, lng, 'storage', deps(), Date.now() + 30000, tried);
      return Promise.all([run, kind === 'envelio' ? envelioFields(spec, lat, lng) : rawFields(entry, spec, lat, lng)]).then(function (out) {
        var r = out[0], raw = out[1], ms = Date.now() - t0, c = (r.circuits || [])[0];
        var bad = r.outcome !== 'features' && !r.pendingFallback;
        if (r.pendingFallback) bad = false;
        var label = pad((s.fb ? entry.key + ' (fallback)' : entry.key), 28);
        console.log(label + ' ' + pad(r.outcome + (r.partial ? ' (partial)' : '') + (r.pendingFallback ? ' → fallback' : ''), 22) + ' circuits ' + pad((r.circuits || []).length, 3) + ' ' + pad(ms + ' ms', 9) +
          (c ? ' first: ' + (c.id || '(no id)') + ' ' + c.basis + ' ' + c.publishedKw + ' kW (gen ' + c.genKw + ', load ' + c.loadKw + ', storage ' + c.storageKw + ')' + (c.refreshed ? ' · ' + c.refreshed : '') : ''));
        /* a layer, join or season that did not answer inside the door's own
           8 s budget: the door says so and never caches it (not a failure
           here: the raw read below, with 30 s, says whether the layer works) */
        if (r.partial) console.log('    PARTIAL: part of the map did not answer inside the door\'s ' + (H.SOURCE_MS / 1000) + ' s budget; the door says so and does not cache it');
        raw.forEach(function (x) {
          var miss = x.missing && x.missing.length ? ' MISSING ' + x.missing.join(',') : '';
          console.log('    layer ' + pad(x.id, 22) + (x.error ? 'ERROR ' + x.error : 'features ' + x.n + (x.missing == null ? ' (none at the point)' : ' fields ok' + (miss ? '' : ''))) + miss + ' · ' + x.ms + ' ms');
          if (x.missing && x.missing.length) bad = true;
        });
        sanity(entry, r.circuits || []).forEach(function (n) { console.log('    UNITS? ' + n); bad = true; });
        if (bad && !s.fb) failures++;
        if (bad && s.fb) console.log('    (fallback only: not counted as a failure)');
      });
    });
  }, Promise.resolve());
}
var TERRITORY_POINTS = [
  { layer: UT.NATIONAL[0], at: [41.8819, -87.6278] }, { layer: UT.NATIONAL[1], at: [42.2711, -89.094] }, { layer: UT.NATIONAL[2], at: [33.749, -84.388] },
  { layer: UT.STATE_LAYERS[0], at: [40.7357, -74.1724] }, { layer: UT.STATE_LAYERS[1], at: [34.0655, -117.6505] }, { layer: UT.STATE_LAYERS[2], at: [39.8105, -120.4694] },
  { layer: UT.STATE_LAYERS[3], at: [34.2238, -84.17047] }, { layer: UT.STATE_LAYERS[4], at: [42.2626, -71.8023] }, { layer: UT.STATE_LAYERS[5], at: [30.1588, -85.6602] },
  { layer: UT.STATE_LAYERS[6], at: [26.5629, -81.9495] }, { layer: UT.PLACES, at: [41.7731, -88.1477] }];
function checkTerritory() {
  console.log('\nterritory layers');
  return TERRITORY_POINTS.reduce(function (p, t) {
    return p.then(function () {
      var t0 = Date.now();
      return H.liveFetchJson(UT._t.pointUrl(t.layer, t.at[0], t.at[1]), { timeoutMs: 30000 }).then(function (j) {
        var f = (j && j.features) || [];
        var seen = f[0] ? Object.keys(f[0].attributes || {}) : [];
        var miss = t.layer.outFields[0] === '*' || !f[0] ? [] : t.layer.outFields.filter(function (k) { return seen.indexOf(k) < 0; });
        console.log('  ' + pad(t.layer.key, 26) + (j && j.error ? 'ERROR service error' : 'features ' + f.length) + (miss.length ? ' MISSING ' + miss.join(',') : '') + ' · ' + (Date.now() - t0) + ' ms');
        if ((j && j.error) || !f.length || miss.length) failures++;
      }, function (e) { console.log('  ' + pad(t.layer.key, 26) + 'ERROR ' + (e && e.blocked ? 'blocked' : (e && e.name === 'AbortError' ? 'timeout' : e && e.message))); failures++; });
    });
  }, Promise.resolve());
}

var list = HS.ENTRIES.filter(function (e) { return e.status === 'verified' && (!only.length || only.indexOf(e.key) >= 0); });
console.log('hosting sources ' + HS.VERSION + ' · ' + list.length + ' verified entries at their test points\n');
list.reduce(function (p, e) { return p.then(function () { return checkEntry(e); }); }, Promise.resolve())
  .then(function () { return noTerritory || only.length ? null : checkTerritory(); })
  .then(function () {
    console.log('\n' + (failures ? failures + ' source(s) need a look' : 'every source answered at its test point with the fields it reads'));
    process.exit(failures ? 1 : 0);
  }, function (e) { console.error(e); process.exit(1); });
