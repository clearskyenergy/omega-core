#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * Fiber confirmation (omega-fiber-confirm.js): who has fiber at an address,
 * the telecom facts of record, who to ask and what must come back.
 * Holds, with no network:
 *   1. the FCC rows become the right facts — fiber is technology 50 with
 *      locations, one row per provider; the ~1.5 km ring adds providers
 *      across hexes; the incumbent wears its parent's name;
 *   2. the ladder never merges kinds of evidence and never climbs past
 *      "Reported" on public data — Quoted and Confirmed stay a human's;
 *      a lookup that failed or was not run is unknown, not "none";
 *   3. the carrier list is ordered by the strength of the evidence, says
 *      WHY for each, and names one company once;
 *   4. the verification package: three public facts, six carrier documents,
 *      and no carrier document is ever marked in hand by the platform;
 *   5. the RFI and the brief carry the address, the block and the offtake
 *      bandwidth, and wear no platform or tenant name;
 *   6. the page: the national FCC layer (the Utah-only one is gone), the
 *      block on the pin analysis, the DD rows, and a profile that survives
 *      a manual layer toggle. */
'use strict';
var assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '../..');
var C = require(path.join(ROOT, 'omega-fiber-confirm.js'));
var DD = require(path.join(ROOT, 'grid-atlas-dd.js'));
var n = 0;
function ok(c, m) { assert.ok(c, m); n++; }
function eq(a, b, m) { assert.deepEqual(a, b, m); n++; }

/* ── fixtures: the shape the FCC layers answer in ──────────────────────── */
var BLOCK = { GEOID: '400819617004056', TotalBSLs: 12, ServedBSLsFiber: 12 };
var HEX = { GEOID: '8826ea51ddfffff', TotalBSLs: 364, ServedBSLsFiber: 220 };
var ROWS = [
  { ProviderName: 'Vyve Broadband', Technology: 40, TotalBSLs: 12, ServedBSLs: 12 },
  { ProviderName: 'Central Cellular LLC /dba COTC Connections', Technology: 50, TotalBSLs: 12, ServedBSLs: 12 },
  { ProviderName: 'Central Cellular LLC /dba COTC Connections', Technology: 50, TotalBSLs: 12, ServedBSLs: 0 },   /* a second speed tier */
  { ProviderName: 'AT&T', Technology: 10, TotalBSLs: 5, ServedBSLs: 0 },
  { ProviderName: 'Starlink', Technology: 61, TotalBSLs: 12, ServedBSLs: 12 },
  { ProviderName: 'Ghost Fiber', Technology: 50, TotalBSLs: 0, ServedBSLs: 0 }                                    /* a row with no locations */
];
var ILEC = { SAC: '435215', CO_NAME: 'SOUTHWESTERN BELL-OK', HOCO: 'AT&T Inc.', REGTYPE: 'PC', STATE: 'OK', OCN: '9533' };
var RING = [
  { GEOID: 'a', ProviderName: 'Centranet, LLC', Technology: 50, TotalBSLs: 4 },
  { GEOID: 'b', ProviderName: 'Centranet, LLC', Technology: 50, TotalBSLs: 6 },
  { GEOID: 'b', ProviderName: 'Central Cellular LLC /dba COTC Connections', Technology: 50, TotalBSLs: 900 }
];
var full = C.normalize(BLOCK, ROWS, HEX, ROWS, ILEC, RING, 2);

/* ── 1 · facts ─────────────────────────────────────────────────────────── */
eq(full.block.fiber.map(function (p) { return p.name; }), ['Central Cellular LLC /dba COTC Connections'], 'fiber = technology 50 with locations, one row per provider');
eq(full.block.providers.length, 6, 'every provider row is kept for the telecom table');
eq(full.nearby.fiber.map(function (p) { return p.name + ':' + p.totalBsls; }), ['Central Cellular LLC /dba COTC Connections:900', 'Centranet, LLC:10'], 'the ring sums a provider across hexes, largest first');
eq(full.ilec.label, 'AT&T Inc. (Southwestern Bell-OK)', 'the incumbent wears its parent’s name with the operating company beside it');
eq(full.ilec.regulation, 'price-cap carrier', 'regulation type is spelled out');
eq(C.normalize(null, [], null, [], { SAC: '432016', CO_NAME: 'PANHANDLE TELEPHONE COOPERATIVE INC.', HOCO: 'Panhandle Telephone Cooperative, Inc.', REGTYPE: 'ROR' }).ilec.label,
   'Panhandle Telephone Cooperative Inc.', 'a parent that IS the operating company is named once');
ok(C.sameCo('Panhandle Telephone', 'PANHANDLE TELEPHONE COOPERATIVE INC.'), 'two spellings of one company match');
ok(!C.sameCo('United Fiber', 'Unite Private Networks'), 'different companies do not');
var bt = C.byTech(full);
eq(bt.map(function (g) { return g.techName; }), ['Fiber', 'Cable', 'Copper'], 'telecom table: fiber, cable, copper — satellite and empty rows left out');
eq(C.normalize(BLOCK, ROWS, HEX, ROWS, ILEC, null, 0).nearby, null, 'an unanswered ring is null, not an empty ring');

/* ── 2 · the ladder ────────────────────────────────────────────────────── */
var L = C.ladder({ mappedMeasured: true, mappedKm: null, bdc: full });
eq(L.rungs.map(function (r) { return r.key + ':' + r.status; }), ['mapped:no', 'reported:yes', 'quoted:open', 'confirmed:open'], 'block fiber → Reported; the carrier rungs stay open');
eq(L.reached, 2, 'public data reaches rung 2 and never further');
ok(/not evidence of absence/.test(L.rungs[0].detail), 'no mapped route is said to be not evidence of absence');
var hexOnly = C.normalize({ GEOID: 'x', TotalBSLs: 3, ServedBSLsFiber: 0 }, [], HEX, ROWS, ILEC, [], 0);
eq(C.ladder({ bdc: hexOnly }).rungs[1].status, 'near', 'fiber in the hex but not the block reads nearby');
var ringOnly = C.normalize({ GEOID: 'x', TotalBSLs: 0, ServedBSLsFiber: 0 }, [], null, [], ILEC, RING, 2);
var LR = C.ladder({ bdc: ringOnly });
eq(LR.rungs[1].status, 'near', 'fiber only in the ring still reads nearby');
ok(/no serviceable location/.test(LR.rungs[1].detail) && /Within ~1\.5 km/.test(LR.rungs[1].detail), 'a silent (unaddressed) block is said to be silent, with the ring’s providers');
var none = C.normalize({ GEOID: 'x', TotalBSLs: 2, ServedBSLsFiber: 0 }, [], null, [], ILEC, [], 0);
var LN = C.ladder({ mappedMeasured: true, bdc: none });
eq(LN.rungs[1].status, 'no', 'looked and found none is a reading');
ok(/Expect a build/.test(LN.rungs[1].detail) && /AT&T/.test(LN.rungs[1].detail), 'none reported points at the incumbent, never at "no fiber"');
eq(LN.reached, 0, 'nothing found reaches no rung');
eq(C.ladder({}).rungs[1].status, 'unknown', 'a lookup not run is unknown');
var failed = C.ladder({ bdcError: 'timeout' });
ok(failed.rungs[1].status === 'unknown' && /Not a reading/.test(failed.rungs[1].detail), 'a failed lookup is not a reading');
eq(C.ladder({ mappedKm: 3.2 }).reached, 1, 'a published route within 8 km is Mapped');
eq(C.ladder({ mappedKm: 30, mappedMeasured: true }).rungs[0].status, 'no', 'a route 30 km away is not "nearby"');
eq(C.ladder({ mappedKm: 3.2, bdc: full }).reached, 2, 'Reported outranks Mapped');

/* ── 3 · who to ask ────────────────────────────────────────────────────── */
var list = C.carriers(full, [{ operator: 'Not published', km: 1 }, { operator: 'Cox Com', km: 4.26 }, { operator: 'AT&T', km: 9 }]);
eq(list.map(function (c) { return c.name; }), ['Central Cellular LLC /dba COTC Connections', 'Centranet, LLC', 'AT&T Inc. (Southwestern Bell-OK)', 'Vyve Broadband', 'Cox Com'],
   'block fiber, ring fiber, incumbent, cable, route operators — a company once, an unpublished operator never');
eq(list.map(function (c) { return c.kind; }), ['fiber', 'fiber', 'incumbent', 'cable', 'route'], 'each carrier carries the kind of evidence behind it');
ok(list.every(function (c) { return c.basis.length > 20; }), 'every carrier says why it is on the list');
ok(/12 of 12 locations/.test(list[0].basis) && /December 2025/.test(list[0].basis), 'the basis quotes the FCC counts and their date');
ok(/4\.3 km/.test(list[4].basis), 'a route operator carries its distance');
eq(C.carriers(null, []), [], 'no evidence, no invented carrier');

/* ── 4 · the verification package ──────────────────────────────────────── */
var pk = C.pack({ mappedMeasured: true, mappedKm: 2, bdc: full, routes: [{ operator: 'Cox Com', km: 2 }] });
eq(pk.length, 9, 'nine items');
eq(pk.filter(function (p) { return p.who === 'public data'; }).map(function (p) { return p.key; }), ['providers', 'incumbent', 'routes'], 'three are read from public data');
ok(pk.slice(0, 3).every(function (p) { return p.done; }), 'the public facts are in hand when found');
ok(pk.slice(3).every(function (p) { return !p.done; }), 'no carrier document is ever marked in hand by the platform');
ok(pk.some(function (p) { return /Two carrier names do not prove two paths/.test(p.detail); }), 'diversity is not inferred from names');
ok(!C.pack({}).some(function (p) { return p.done; }), 'nothing looked up, nothing in hand');

/* ── 5 · the RFI and the brief ─────────────────────────────────────────── */
var site = { address: '1812 E 1st St, Chandler, OK', lat: 35.70170, lng: -96.88090, use: 'a modular AI compute deployment' };
var rfi = C.rfi(site, list, { gbps: 10, minGbps: 5 }, full);
ok(rfi.indexOf(site.address) >= 0 && /35\.70170, -96\.88090/.test(rfi), 'the RFI names the address and the coordinates');
ok(/symmetrical 10 Gbps \(minimum 5 Gbps\)/.test(rfi), 'the RFI asks for the offtake bandwidth');
ok(/census block 400819617004056/.test(rfi), 'the RFI gives the carrier the census block');
ok(/Serviceability/.test(rfi) && /Construction/.test(rfi) && /Diversity/.test(rfi) && /Handoff/.test(rfi), 'the RFI asks for every package document');
ok(!/clearsky|omega|silmarillion/i.test(rfi), 'the RFI wears no platform name — the sender signs it');
var brief = C.brief(site, { mappedMeasured: true, mappedKm: null, bdc: full, routes: [] }, { gbps: 10, minGbps: 5 });
['FIBER VERIFICATION BRIEF', 'TELECOM FACTS', 'Incumbent telephone company: AT&T Inc.', 'Fiber within ~1.5 km', 'CARRIERS TO ASK', 'VERIFICATION PACKAGE', 'CARRIER RFI'].forEach(function (s) {
  ok(brief.indexOf(s) >= 0, 'the brief carries: ' + s);
});
ok(!/clearsky|omega|silmarillion/i.test(brief), 'the brief wears no platform name');
ok(/dedicated service is confirmed only by the carrier/.test(brief), 'the brief says what the public record cannot confirm');
ok(/vlat=35\.701700/.test(C.fccMapUrl(35.7017, -96.8809)), 'the FCC map link carries the point');

/* ── 6 · the page and the DD rows ──────────────────────────────────────── */
var html = fs.readFileSync(path.join(ROOT, 'grid-atlas.html'), 'utf8');
ok(/<script src="\/omega-fiber-confirm\.js"><\/script>/.test(html), 'the page loads the module');
ok(html.indexOf('all_record_hexes_dissolved') < 0, 'the Utah-only FCC layer is gone');
ok(/fcc_fiber:[\s\S]{0,400}FCC_Broadband_Data_Collection[\s\S]{0,200}where:"ServedBSLsFiber > 0"/.test(html), 'FCC Fiber Coverage is the national layer, filtered on a field it has');
ok(/bdcEnsure\(ll\)/.test(html) && /OmegaFiberConfirm\.ladder\(/.test(html) && /OmegaFiberConfirm\.pack\(/.test(html), 'the pin analysis asks the FCC data and draws the ladder and the package');
ok(/id="cfCopy"/.test(html) && /id="cfBrief"/.test(html), 'Copy carrier RFI and Copy verification brief are on the panel');
ok(/keepDd/.test(html), 'a due-diligence profile survives a manual layer toggle');
var ddc = DD.run('compute', { bdcMeasured: true, bdcBlockFiber: ['COTC Connections'], bdcHexFiber: [], bdcNearFiber: [], ilec: 'AT&T Inc. (Southwestern Bell-OK)' });
function item(r, id) { var hit = null; r.sections.forEach(function (s) { s.items.forEach(function (it) { if (it.id === id) hit = it; }); }); return hit; }
eq(item(ddc, 'cp-bdc').status, 'pass', 'DD: a provider in the block passes the FCC row');
ok(/carrier’s quote/.test(item(ddc, 'cp-bdc').note), 'DD: and still leaves the quote to the carrier');
eq(item(ddc, 'cp-ilec').status, 'pass', 'DD: the incumbent of record is named');
eq(item(DD.run('compute', { bdcMeasured: true, bdcBlockFiber: [], bdcHexFiber: [], bdcNearFiber: ['Panhandle Telephone'] }), 'cp-bdc').status, 'conditional', 'DD: fiber only within 1.5 km is conditional on a lateral');
eq(item(DD.run('compute', {}), 'cp-bdc').status, 'unknown', 'DD: no FCC answer is unknown');

/* the batch tool and the importer exist and parse */
['scripts/fiber-confirm-portfolio.js', 'scripts/import-state-fiber.js'].forEach(function (f) {
  new Function(fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/^#!.*\n/, '').replace(/\brequire\(/g, '__r('));
  n++;
});
console.log('tfiberconfirm: ' + n + ' checks passed');
