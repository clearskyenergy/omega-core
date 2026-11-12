#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * The Oklahoma telecom register (data/fiber/ok-telecom-register.json,
 * built by scripts/build-ok-telecom-register.js) and the road join
 * (OmegaFiberConfirm.roads): every offering in the state, each with a
 * verified door or an honest null. Holds, with no network:
 *   1. the register is the complete FCC-filed census — well over 100
 *      providers, 90+ with fiber filings, 35+ incumbent study areas —
 *      with provenance, a build date and the FCC fallback page;
 *   2. a verified row carries an https door and its probe date; an
 *      unverified row carries null, never a guess, and no provider's
 *      footprint is invented (fiberBsls is a number from the filings);
 *   3. roads() joins the confirm ladder's ask-list to the register by
 *      company matching, attaches check/map/kind/footprint, and never
 *      reorders or drops a carrier;
 *   4. the pin panel loads the register only for an Oklahoma block,
 *      renders the provider's own links, and says when a door is the
 *      FCC fallback — links to publishers, never copied geometry. */
'use strict';
var assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '../..');
var C = require(path.join(ROOT, 'omega-fiber-confirm.js'));
var n = 0;
function ok(c, m) { assert.ok(c, m); n++; }
function eq(a, b, m) { assert.deepEqual(a, b, m); n++; }

var R = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/fiber/ok-telecom-register.json'), 'utf8'));

/* 1 ── the census is whole and sourced */
eq(R.state, 'OK');
ok(/^\d{4}-\d{2}-\d{2}$/.test(R.builtAt), 'a build date');
ok(R.providers.length >= 100, 'the full census (' + R.providers.length + ' providers)');
ok(R.counts.fiber >= 90, '90+ fiber filers (' + R.counts.fiber + ')');
ok(R.ilecs.length >= 35, 'the incumbents of record (' + R.ilecs.length + ')');
ok(R.sources.length >= 3 && R.sources.every(function (s) { return s.label && s.attribution; }), 'every source named with attribution');
ok(/FILING/.test(R.note) && /does not prove service/.test(R.note), 'the note says a filing is not service at an address');
ok(/^https:\/\/broadbandmap\.fcc\.gov\//.test(R.fccAddressLookup), 'the FCC per-address fallback');

/* 2 ── verified doors are https and dated; unverified rows are honest nulls */
var withRoad = 0, i, p;
for (i = 0; i < R.providers.length; i++) {
  p = R.providers[i];
  ok(typeof p.fiberBsls === 'number' && p.name, 'row ' + i + ' shaped');
  if (p.check) { withRoad++;
    ok(/^https:\/\//.test(p.check), p.name + ': door is https');
    ok(p.verified === R.providers.find(function (x) { return x.check; }).verified || /^\d{4}-\d{2}-\d{2}$/.test(p.verified), p.name + ': probe date recorded');
  } else { ok(p.map == null && p.verified == null, p.name + ': no door means no map and no date — nothing invented'); }
  if (p.map) ok(/^https:\/\//.test(p.map), p.name + ': map link is https');
}
ok(withRoad >= 55, withRoad + ' rows carry a verified door');
ok(withRoad === R.counts.withRoad, 'the count tells the truth');
['AT&T', 'Dobson Fiber', 'OEC Fiber', 'Central Cellular LLC /dba COTC Connections'].forEach(function (name) {
  var row = R.providers.find(function (x) { return x.name === name; });
  ok(row && row.check, name + ' carries its door');
});
var oec = R.providers.find(function (x) { return x.name === 'OEC Fiber'; });
ok(oec.map && oec.map.indexOf('okcoop.maps.arcgis.com') > 0, 'OEC’s own published coverage map is linked, not copied');
var hil = R.providers.find(function (x) { return x.name === 'Southern Plains Cable, LLC'; });
ok(hil && /hilliary/.test(hil.check), 'a holding company’s opco routes to the holding company’s door');

/* 3 ── the join: order kept, nothing dropped, the door attached */
var ask = [{ name: 'Central Cellular LLC /dba COTC Connections', basis: 'reports fiber in the block', rank: 1 },
           { name: 'Totally Unknown Carrier LLC', basis: 'mapped route nearby', rank: 3 }];
var joined = C.roads(ask, R);
eq(joined.length, 2, 'nothing dropped');
eq(joined[0].name, ask[0].name, 'order kept');
ok(/cotc\.net/.test(joined[0].check), 'COTC’s door attached');
ok(joined[0].fiberBsls > 1000, 'the FCC footprint rides along');
ok(joined[1].check === undefined && joined[1].map === undefined, 'an unknown carrier gains nothing invented');
eq(C.roads([], R), [], 'an empty list stays empty');
eq(C.roads(ask, null).length, 2, 'no register: the list passes through untouched');

/* 4 ── the pin panel wiring */
var atlas = fs.readFileSync(path.join(ROOT, 'grid-atlas.html'), 'utf8');
ok(atlas.indexOf("ajax('/data/fiber/ok-telecom-register.json'") > 0, 'the panel fetches the register');
ok(/cfInOK=!!\(bdc&&\(\(bdc\.block&&String\(bdc\.block\.geoid\)\.slice\(0,2\)==="40"\)/.test(atlas), 'only an Oklahoma block loads it');
ok(atlas.indexOf('OmegaFiberConfirm.roads(cfCar,okTelecomReg)') > 0, 'the panel joins through the ONE module');
ok(atlas.indexOf('their coverage map ↗') > 0 && atlas.indexOf('their site / availability ↗') > 0, 'the provider’s own links render');
ok(atlas.indexOf('the FCC per-address page answers for the rest') > 0, 'the fallback is said, never implied');

console.log('tokregister: ' + n + ' checks passed');
