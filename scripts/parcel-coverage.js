#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * How much of the country Parcel Lines draws, in the order it is being built
 * (scripts/_lib/parcel-priority.js: ACEEE's scorecard, battery markets
 * pulled up). For each state, each of its sample cities: is there a layer in
 * omega-parcel-sources.js whose box holds it, and (with --live) does that
 * layer actually draw lines there? Ends with the next state to work on.
 *
 *   node scripts/parcel-coverage.js           boxes only, offline
 *   node scripts/parcel-coverage.js --live    asks each layer for the tile
 *   node scripts/parcel-coverage.js --live --json
 *
 * A box is a cheap pre-test, not coverage: New York's statewide layer has
 * a box over Nassau County and draws nothing there. --live is the answer. */
'use strict';
var PS = require('../omega-parcel-sources.js');
var R = require('./_lib/parcel-priority.js');
var live = process.argv.indexOf('--live') > 0, asJson = process.argv.indexOf('--json') > 0;

var D = require('./_lib/parcel-draw.js');

function city(c) {
  var boxed = PS.at(c[1], c[2]);
  var out = { name: c[0], at: [c[1], c[2]], boxed: boxed.map(function (s) { return s.id; }), drawn: null };
  if (!live) return Promise.resolve(out);
  return Promise.all(boxed.map(function (s) { return D.draws(s, c[1], c[2]).then(function (d) { return d.drew ? s.id : null; }); }))
    .then(function (ids) { out.drawn = ids.filter(Boolean); return out; });
}

Promise.all(R.RANKED.map(function (s) {
  return Promise.all(s.cities.map(city)).then(function (cities) {
    var ok = cities.filter(function (c) { return (live ? c.drawn : c.boxed).length; }).length;
    return { st: s.st, name: s.name, aceee: s.aceee, storage: !!s.storage, cities: cities,
             status: ok === cities.length ? 'mapped' : ok ? 'partial' : 'none' };
  });
})).then(function (rows) {
  var next = rows.filter(function (r) { return r.status !== 'mapped'; })[0];
  if (asJson) { console.log(JSON.stringify({ source: R.SOURCE, live: live, states: rows, next: next ? next.st : null }, null, 1)); return; }
  console.log('Parcel Lines coverage, in build order (' + R.SOURCE + '; battery markets pulled up)' + (live ? ', drawn live' : ', by box only (--live to draw)') + '\n');
  rows.forEach(function (r, i) {
    var miss = r.cities.filter(function (c) { return !(live ? c.drawn : c.boxed).length; }).map(function (c) { return c.name; });
    console.log(String(i + 1).padStart(2) + '. ' + (r.st + '  ' + r.name).padEnd(26) + ('ACEEE ' + (r.aceee || '—')).padEnd(10) +
      ({ mapped: 'mapped ', partial: 'PARTIAL', none: 'NONE   ' })[r.status] + (miss.length ? '  missing: ' + miss.join(', ') : ''));
  });
  var n = function (st) { return rows.filter(function (r) { return r.status === st; }).length; };
  console.log('\n' + n('mapped') + ' mapped, ' + n('partial') + ' partial, ' + n('none') + ' with nothing, of ' + rows.length + '.');
  if (next) console.log('Next: ' + next.name + '.');
});
