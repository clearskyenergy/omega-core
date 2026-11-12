#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * The ISO market record (omega-iso-market.js) and where it lands: the
 * screen, the assessment, the battery case's words and the DD report.
 * Holds, with no network:
 *   1. membership beats geography: the serving utility resolves the market
 *      wherever the table knows it, the state default stands behind it,
 *      and a split state is SAID, never guessed over;
 *   2. the same name in two markets resolves by state (National Grid,
 *      Xcel's three operating companies, CenterPoint, Duke);
 *   3. the rules never invent a market structure: SPP and ERCOT have no
 *      capacity auction, ERCOT is not FERC-jurisdictional, the no-market
 *      record says the value stack does not transfer — and every market
 *      carries sources and a reviewed date;
 *   4. the battery case names the site's ACTUAL market in its reference
 *      words, with what its structure pays a battery;
 *   5. the screen and the assessment carry the resolution (stored), while
 *      the rules are derived at read time so they never age in a record. */
'use strict';
var assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '../..');
var ISO = require(path.join(ROOT, 'omega-iso-market.js'));
var B = require(path.join(ROOT, 'api/_lib/portfolio/assess-bess.js'));
var AS = require(path.join(ROOT, 'api/_lib/portfolio/assess.js'));
var G = require(path.join(ROOT, 'api/_lib/portfolio/grid-screen.js'));
var n = 0;
function ok(c, m) { assert.ok(c, m); n++; }
function eq(a, b, m) { assert.deepEqual(a, b, m); n++; }

/* 1 ── membership first, state second, splits said */
eq(ISO.resolve({ state: 'IL', utility: 'Commonwealth Edison Co' }).iso, 'pjm', 'ComEd is PJM by membership');
eq(ISO.resolve({ state: 'IL', utility: 'Ameren Illinois' }).iso, 'miso', 'Ameren is MISO — same state, other market');
var il = ISO.resolve({ state: 'IL' });
ok(il.basis === 'state' && il.split && il.split.length === 2 && /split between/.test(il.words) && /utility decides/.test(il.words),
  'state-only Illinois says the split and that the utility decides');
eq(ISO.resolve({ state: 'OK', utility: 'Oklahoma Gas and Electric' }).iso, 'spp', 'OG&E is SPP');
eq(ISO.resolve({ state: 'OK' }).iso, 'spp', 'Oklahoma defaults SPP, no split');
eq(ISO.resolve({ state: 'OK' }).split, null, 'and says none');
eq(ISO.resolve({}).iso, null, 'nothing on file is honestly unknown');
ok(/no state on file/.test(ISO.resolve({}).words), 'and says why');

/* 2 ── one name, two markets: the state decides */
eq(ISO.resolve({ state: 'TX', utility: 'Oncor Electric Delivery' }).iso, 'ercot', 'Oncor is ERCOT');
eq(ISO.resolve({ state: 'TX', utility: 'Entergy Texas, Inc.' }).iso, 'miso', 'Entergy Texas is MISO inside Texas');
eq(ISO.resolve({ state: 'TX', utility: 'El Paso Electric Co' }).iso, 'none', 'El Paso is outside the organized markets');
eq(ISO.resolve({ state: 'TX', utility: 'Southwestern Public Service (SPS)' }).iso, 'spp', 'the Panhandle (SPS) is SPP');
eq(ISO.resolve({ state: 'MN', utility: 'Xcel Energy' }).iso, 'miso', 'Xcel in Minnesota is MISO (NSP)');
eq(ISO.resolve({ state: 'CO', utility: 'Xcel Energy' }).iso, 'none', 'Xcel in Colorado is outside (PSCo)');
eq(ISO.resolve({ state: 'NY', utility: 'National Grid' }).iso, 'nyiso', 'National Grid in New York is NYISO');
eq(ISO.resolve({ state: 'MA', utility: 'National Grid' }).iso, 'isone', 'National Grid in Massachusetts is ISO-NE');
eq(ISO.resolve({ state: 'TX', utility: 'CenterPoint Energy Houston Electric' }).iso, 'ercot', 'CenterPoint in Texas is ERCOT');
eq(ISO.resolve({ state: 'IN', utility: 'CenterPoint Energy Indiana South' }).iso, 'miso', 'CenterPoint in Indiana is MISO');
eq(ISO.resolve({ state: 'NC', utility: 'Duke Energy Carolinas' }).iso, 'none', 'Duke Carolinas is outside the RTOs');
eq(ISO.resolve({ state: 'OH', utility: 'Duke Energy Ohio' }).iso, 'pjm', 'Duke Ohio is PJM');

/* 3 ── the rules never invent a structure, and every record is sourced */
ok(ISO.rules('spp').capacity.exists === false && /planning-reserve/i.test(ISO.rules('spp').capacity.words), 'SPP: no capacity auction, RA is a PRM obligation');
ok(ISO.rules('ercot').capacity.exists === false && /energy-only/i.test(ISO.rules('ercot').capacity.words), 'ERCOT is energy-only');
ok(ISO.rules('ercot').ferc === false && /not FERC-jurisdictional/i.test(ISO.rules('ercot').aggregation), 'ERCOT: 841/2222 do not apply');
ok(ISO.rules('pjm').capacity.exists === true && /RPM/.test(ISO.rules('pjm').capacity.name), 'PJM has RPM');
ok(ISO.rules('caiso').capacity.exists === false && /bilaterally/.test(ISO.rules('caiso').capacity.words), 'CAISO RA is bilateral, no central auction');
ok(/does not transfer/.test(ISO.rules('none').bess), 'outside a market, the stack does not transfer');
ok(/EDAM|Markets\+/.test(ISO.rules('none').aggregation), 'the West’s day-ahead motion is named, to be confirmed');
Object.keys(ISO.MARKETS).forEach(function (k) {
  var r = ISO.rules(k);
  ok(r.sources.length && r.sources.every(function (s) { return /^https:/.test(s.url); }) && r.reviewedAt === ISO.REVIEWED, k + ' carries https sources and the reviewed date');
  ok(/confirm/i.test(r.note), k + '’s note says to confirm with the operator');
});
ok(ISO.rules('nothere') === null, 'an unknown key is null, never a made-up market');

/* the polygon layer's names map to the same keys */
eq(ISO.fromName('PJM Interconnection, LLC'), 'pjm');
eq(ISO.fromName('SOUTHWEST POWER POOL'), 'spp');
eq(ISO.fromName('ELECTRIC RELIABILITY COUNCIL OF TEXAS, INC. (ERCOT)'), 'ercot');
eq(ISO.fromName('MIDCONTINENT INDEPENDENT TRANSMISSION SYSTEM OPERATOR, INC..'), 'miso');
eq(ISO.fromName('CALIFORNIA INDEPENDENT SYSTEM OPERATOR'), 'caiso');
eq(ISO.fromName('ISO NEW ENGLAND INC.'), 'isone');
eq(ISO.fromName('Totally New Grid Co'), null, 'an unknown polygon name maps to nothing');

/* 4 ── the battery case names the site's actual market */
var spp = B.bessCase({ powerKw: 1200, state: 'OK', utility: 'Oklahoma Gas & Electric',
  market: { iso: 'spp', label: ISO.MARKETS.spp.label, bess: ISO.rules('spp').bess } });
ok(spp.market.fit === 'reference' && spp.market.siteIso === 'spp', 'an SPP site is a reference read that knows where it is');
ok(/Southwest Power Pool/.test(spp.market.words) && /NO capacity-auction/.test(spp.market.words), 'the words name SPP and its missing capacity stream');
var noneM = B.bessCase({ powerKw: 500, state: 'AZ', market: { iso: 'none', label: ISO.MARKETS.none.label, bess: ISO.rules('none').bess } });
ok(/does not transfer/.test(noneM.market.words), 'outside a market, the words say the stack does not transfer');
var zone = B.bessCase({ powerKw: 800, state: 'IL', utility: 'Commonwealth Edison' });
eq(zone.market.fit, 'zone', 'ComEd stays the zone read');
var pjmSite = B.bessCase({ powerKw: 800, state: 'OH', utility: 'AEP Ohio', market: { iso: 'pjm', label: ISO.MARKETS.pjm.label } });
eq(pjmSite.market.fit, 'market', 'a PJM site outside ComEd is the market read');
var legacy = B.bessCase({ powerKw: 800, state: 'OK' });
eq(legacy.market.fit, 'reference', 'no resolution handed in: the old read still stands');

/* 5 ── the screen and the assessment carry the resolution */
var fin = G.finish({ phase: 'done', utility: { name: 'Oklahoma Gas and Electric', key: 'oge' } }, { address: { state: 'OK', zip: '74834' } });
ok(fin.market && fin.market.iso === 'spp' && fin.market.basis === 'utility', 'the screen stores the resolution');
var a = AS.assess({ name: 'Williams Food', state: 'OK', transformerKva: 1500, utility: 'Oklahoma Gas and Electric' }, { now: '2026-11-11T00:00:00Z' });
ok(a.market && a.market.iso === 'spp', 'the assessment carries the market even with no screen');
ok(a.bess.ok && /Southwest Power Pool/.test(a.bess.market.words), 'and the battery case speaks it');
/* the rules are NOT stored: derived at read time so they never age */
ok(!a.market.capacity && !a.market.sources, 'the stored resolution carries no rules facts');
/* a changed resolver version makes stored answers stale (ISO.VERSION in the hash) */
var h1 = AS.inputHashOf({ state: 'OK' }, null, null, null, null);
ok(typeof h1 === 'string' && h1.length, 'the hash stands');
var src = fs.readFileSync(path.join(ROOT, 'api/_lib/portfolio/assess.js'), 'utf8');
ok(/ISO\.VERSION/.test(src.split('function inputHashOf')[1].split('}')[0] + src.split('var facts = ')[1].split(';')[0]), 'ISO.VERSION is in the input hash, so a resolver change re-runs the answer');

/* the pages read the one module */
['portfolio.html', 'grid-atlas.html'].forEach(function (f) {
  ok(fs.readFileSync(path.join(ROOT, f), 'utf8').indexOf('omega-iso-market.js') > 0, f + ' loads the one market module');
});
var rep = fs.readFileSync(path.join(ROOT, 'omega-portfolio-assess.js'), 'utf8');
ok(rep.indexOf('Wholesale market') > 0 && rep.indexOf('OmegaIsoMarket.rules') > 0, 'the DD report prints the market and derives the rules live');

console.log('tisomarket: ' + n + ' checks passed');
