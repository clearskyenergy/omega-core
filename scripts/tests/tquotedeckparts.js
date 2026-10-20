#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * The three parts a rep sends from Omega Prime (Tommy, 2026-10-17: "they
 * should be able to send a site map and a proposal"): omega-quote-deck.js
 * draws ONE customer view as the PROPOSAL (all of it, the default), the
 * QUOTE (the priced summary, no plan) or the SITE MAP (the drawn plan on its
 * own page, larger, with what is on it). Holds:
 *   - PARTS names the three, and an unknown part is the proposal;
 *   - the quote carries the price, the scope, the terms and the acceptance,
 *     and no plan;
 *   - the site map carries the plan and its schedule (area, unit, the gear
 *     the unit does not integrate, the service point, the conduit with its
 *     length and where it runs from), and no money at all;
 *   - a unit with no released footprint is said so, never sized;
 *   - nothing drawn says so; every string is escaped;
 *   - the printed document's title names the part. */
'use strict';
var assert = require('node:assert/strict'), path = require('path');
var D = require(path.join(__dirname, '../../omega-quote-deck.js')), count = 0;
function ok(c, m) { assert.ok(c, m); count++; }

function view(over) {
  var v = { quoteNo: 'SUNWAV-Q-20261017-89ABC', rev: 2, status: 'sent', issuedAt: '2026-10-17T15:00:00Z', validUntil: '2026-11-16',
    seller: { name: 'Sunwave Energy', accent: '#0A7A5A', company: { legalName: 'Sunwave Energy LLC', address: { line1: '1 Solar Way', city: 'Chicago', state: 'IL', postalCode: '60601' } }, rep: { name: 'Riley Rep', email: 'riley@sunwave.example' }, attribution: 'Prepared with ClearSky-OMEGA' },
    customer: { name: 'Pat Kim', company: 'Lake Street Cold Storage', email: 'pat@lakest.example' },
    site: { address: '1200 W Lake St, Chicago, IL 60607', utility: 'ComEd', circuit: 'Feeder 1234 · Lakeview TSS' },
    system: { unit: { mfr: 'CleanCell US', short: 'CC290/125', model: 'CC290/125 - 125 kW / 290 kWh class', kw: 125, kwh: 289.3, chem: 'LFP', footprint: 'catalog' },
      layout: { v: 2, area: { s: 41.88510, w: -87.66010, n: 41.88540, e: -87.65970, wFt: 110, hFt: 109, sqft: 11990 },
        unit: { c: { lat: 41.88525, lng: -87.66000 }, lFt: 4.36, wFt: 3.94, rotDeg: 0, footprint: 'catalog' },
        xfmr: { c: { lat: 41.88525, lng: -87.65992 }, lFt: 8, wFt: 8, rotDeg: 0 }, disco: { c: { lat: 41.88525, lng: -87.65985 }, lFt: 3, wFt: 4, rotDeg: 0 },
        poi: { lat: 41.88580, lng: -87.65960 }, conduit: { pts: [{ lat: 41.88525, lng: -87.65985 }, { lat: 41.88525, lng: -87.65960 }, { lat: 41.88580, lng: -87.65960 }], ft: 183.4, type: 'PVC-UG' }, conduitFt: 183.4 },
      conduitFt: 183.4, areaSqft: 11990 },
    scope: [{ name: 'CleanCell US CC290/125 battery energy storage system', amount: 'Quoted by CleanCell US' }, { name: 'Installation', amount: '$153,400' }],
    price: { total: '$418,900', note: 'Installed price for the scope above.' }, terms: { validDays: 30, paymentTerms: '30% at signing' }, decision: {} };
  return Object.assign(v, over || {});
}
function kicker(h) { var m = /class="oqd-kicker">([^<]+)</.exec(h); return m && m[1]; }

/* the three parts */
assert.deepEqual(D.PARTS.map(function (p) { return p.key; }), ['proposal', 'quote', 'sitemap']); count++;
assert.deepEqual(D.PARTS.map(function (p) { return p.label; }), ['Proposal', 'Quote', 'Site map']); count++;
var v = view();
ok(D.body(v) === D.body(v, { part: 'proposal' }), 'the proposal is the default');
ok(D.body(v, { part: 'nonsense' }) === D.body(v), 'an unknown part is the proposal');
ok(kicker(D.body(v)) === 'Proposal' && kicker(D.body(v, { part: 'quote' })) === 'Quote' && kicker(D.body(v, { part: 'sitemap' })) === 'Site map', 'each part names itself on the letterhead');

/* the proposal still carries everything */
var all = D.body(v);
ok(/<svg/.test(all) && /\$418,900/.test(all) && /Scope of work/.test(all) && /Acceptance/.test(all), 'the proposal: plan, price, scope, acceptance');

/* the quote: the priced summary, no plan */
var q = D.body(v, { part: 'quote' });
ok(!/<svg/.test(q) && !/Site plan/.test(q), 'the quote has no plan');
ok(/\$418,900/.test(q) && /Scope of work/.test(q) && /Terms/.test(q) && /Acceptance/.test(q) && /The system/.test(q), 'the quote: system, scope, price, terms, acceptance');
ok(/Lake Street Cold Storage/.test(q) && /Sunwave Energy LLC/.test(q), 'who it is for, and who it is from');

/* the site map: the plan larger, its schedule, no money */
var s = D.body(v, { part: 'sitemap' });
ok(/<svg[^>]*viewBox="0 0 720 560"/.test(s), 'the plan on its own page, larger (720 × 560)');
ok(/<h1 class="oqd-h1">Site map<\/h1>/.test(s) && /Prepared for Lake Street Cold Storage · 1200 W Lake St, Chicago, IL 60607/.test(s), 'titled, for whom and where');
ok(/Utility: ComEd · Circuit: Feeder 1234 · Lakeview TSS/.test(s), 'the utility and the circuit');
['Battery area', 'Battery unit', 'Transformer', 'Disconnect', 'Service / point of interconnection', 'Service conduit'].forEach(function (k) { ok(s.indexOf('<td class="k">' + k + '</td>') > 0, 'the schedule names ' + k); });
ok(/110 × 109 ft · 11,990 sq ft/.test(s), 'the area, its sides and its square feet');
ok(/4\.4 × 3\.9 ft/.test(s) && /CleanCell US CC290\/125 · 125 kW \/ 289\.3 kWh · at 41\.88525, -87\.66/.test(s), 'the unit at its footprint, what it is and where');
ok(/<td class="k">Service conduit<\/td><td>183 ft<\/td><td><span>Underground, from the disconnect to the point of interconnection<\/span>/.test(s), 'the conduit, its length and where it runs from');
ok(s.indexOf('$') < 0 && !/Total price/.test(s) && !/Scope of work/.test(s), 'no money on the site map');
ok(/Imagery © Esri/.test(s) && /Not a survey or a construction drawing/.test(s), 'its credit and what it is not');
ok(/Prepared with ClearSky-OMEGA/.test(s), 'the footer is the same seller attribution');

/* the R60 integrates its transformer: none on the schedule, the run from the disconnect */
var r60 = view(); r60.system = JSON.parse(JSON.stringify(r60.system)); r60.system.layout.xfmr = null;
var sr = D.body(r60, { part: 'sitemap' });
ok(sr.indexOf('<td class="k">Transformer</td>') < 0 && /from the disconnect to the point/.test(sr), 'a transformer the unit integrates is not on the schedule');
var bare = view(); bare.system = JSON.parse(JSON.stringify(bare.system)); bare.system.layout.xfmr = null; bare.system.layout.disco = null;
ok(/from the unit to the point/.test(D.body(bare, { part: 'sitemap' })), 'no gear: the run leaves the unit');

/* no released footprint: said, never sized */
var none = view(); none.system = JSON.parse(JSON.stringify(none.system)); none.system.layout.unit.footprint = 'none'; none.system.layout.unit.lFt = null; none.system.layout.unit.wFt = null;
ok(/Footprint not yet released; placed as a marked point/.test(D.body(none, { part: 'sitemap' })), 'a unit with no released footprint is never given one');

/* nothing drawn */
var empty = view(); empty.system = { unit: v.system.unit, layout: {} };
var se = D.body(empty, { part: 'sitemap' });
ok(/No site map has been drawn for this proposal yet\./.test(se) && !/<svg/.test(se), 'nothing drawn says so');

/* escaping */
var bad = view(); bad.system = JSON.parse(JSON.stringify(bad.system)); bad.system.unit.short = '<script>x</script>'; bad.site = { address: '<img src=x onerror=1>', utility: '"><b id=pwn>', circuit: '' };
var sb = D.body(bad, { part: 'sitemap' });
ok(sb.indexOf('<script>') < 0 && sb.indexOf('<img src=x') < 0 && sb.indexOf('<b id=pwn>') < 0 && sb.indexOf('&lt;b id=pwn&gt;') > 0, 'every string escaped on the site map');

/* the printed document names the part */
ok(/<title>Site map SUNWAV-Q-20261017-89ABC · Lake Street Cold Storage · Sunwave Energy<\/title>/.test(D.document(v, { part: 'sitemap' })), 'the site map document is titled as one');
ok(/<title>Quote SUNWAV-Q-20261017-89ABC/.test(D.document(v, { part: 'quote' })) && /<title>Proposal SUNWAV-Q-20261017-89ABC/.test(D.document(v)), 'and the quote and the proposal');
ok(D.titleOf(v) === 'Proposal SUNWAV-Q-20261017-89ABC · Lake Street Cold Storage · Sunwave Energy', 'titleOf with no part is the proposal');

console.log('tquotedeckparts: ' + count + ' assertions passed');
