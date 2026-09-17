/* Site spine — the pure half. Deterministic ids, nothing invented, and the
   projection strips what a partner must never see. Runs with no credential:
       node scripts/tests/tsitespine.js */
var SP = require('../../api/_lib/site-spine');
var fails = 0;
function ok(c, m) { if (!c) { fails++; console.log('  FAIL ' + m); } else console.log('  ok   ' + m); }

var ctx = { orgId: 'osa', portfolioId: 'osa-ev-midwest', source: 'csv', importId: 'imp1',
            uploadedBy: 'a@sunesol.com', uploadedAt: '2026-09-16T00:00:00Z', rowNumber: 2, vertical: 'ev' };

/* ── deterministic id ─────────────────────────────────────────────────── */
var a = SP.siteFromRow({ addr: '600 N. Union Avenue', zip: '21078', city: 'Havre de Grace', state: 'md' }, ctx);
var b = SP.siteFromRow({ addr: '600 north union ave', zip: '21078-1234' }, ctx);
ok(a.ok && b.ok, 'both rows key');
ok(a.siteId === b.siteId, 'address spelling variants dedupe to one siteId: ' + a.siteId);
ok(a.siteId.indexOf('osa:') === 0, 'siteId is namespaced by orgId');
var c = SP.siteFromRow({ addr: '601 N Union Ave', zip: '21078' }, ctx);
ok(c.siteId !== a.siteId, 'a different house number is a different site');
var d = SP.siteFromRow({ sourceKey: 'PROV/ROW 17', addr: 'x' }, ctx);
ok(d.siteId === 'osa:PROV_ROW_17', 'provider row id wins over the address hash and is made id-safe: ' + d.siteId);
var e = SP.siteFromRow({ city: 'Chicago' }, ctx);
ok(!e.ok, 'a row with no address and no id is refused, not given an auto-id');

/* ── nothing invented ─────────────────────────────────────────────────── */
ok(a.doc.state === 'MD', 'state upper-cased');
ok(a.doc.zip === '21078', 'zip kept');
ok(!('lat' in a.doc) && !('sqft' in a.doc) && !('ev' in a.doc), 'blank columns are ABSENT, not null or zero');
ok(a.doc.status === SP.DEFAULT_STATUS, 'status falls back to the dashboard default');
var f = SP.siteFromRow({ addr: '1 Main St', zip: '60601', chargers: '8', dcfcKw: '1,200 kW', l2Kw: '96' }, ctx);
ok(f.doc.ev.chargers === 8 && f.doc.ev.dcfcKw === 1200, 'numbers parsed from spreadsheet strings');
ok(f.doc.ev.totalKw === 1296 && f.doc.ev.totalKwSrc === 'derived', 'totalKw derived only from both halves, and marked derived');
var g = SP.siteFromRow({ addr: '1 Main St', zip: '60601', dcfcKw: '1200' }, ctx);
ok(g.doc.ev.totalKw === undefined, 'totalKw NOT derived when a half is missing');
var h = SP.siteFromRow({ addr: '1 Main St', zip: '60601', vertical: 'hydro' }, ctx);
ok(!h.ok, 'unknown vertical refused');
var bess = SP.siteFromRow({ addr: '1 Main St', zip: '60601', vertical: 'bess', chargers: 4 }, ctx);
ok(!('ev' in bess.doc), 'ev block only on vertical=ev');

/* ── confidential stays owner-facing ──────────────────────────────────── */
var s = SP.siteFromRow({ addr: '1 Main St', zip: '60601', ownerName: 'J Doe', ownerMailing: 'PO Box 1',
                          ownerPhone: '555', leaseUsdYr: '12000', revSharePct: '15', feederId: 'D5017',
                          lat: 41.88123, lon: -87.62987 }, ctx).doc;
s.review = { state: 'accepted' };
ok(s.confidential.owner.mailing === 'PO Box 1' && s.confidential.revSharePct === 15, 'owner-only fields land under confidential');
var p = SP.project(s, 'partner');
ok(!('confidential' in p) && !('provenance' in p) && !('notes' in p), 'partner projection has no confidential, provenance or notes');
ok(p.addr === '1 Main St' && p.feederId === 'D5017' && p.projection === 'partner', 'partner projection keeps address and feeder');
var pub = SP.project(s, 'public');
ok(!('addr' in pub) && !('feederId' in pub) && !('zip' in pub), 'public projection has no street address, zip or feeder');
ok(pub.lat === 41.88 && pub.lon === -87.63, 'public coordinates rounded to ~1 km');
JSON.stringify(p).indexOf('PO Box') < 0 || ok(false, 'mailing leaked');
ok(JSON.stringify(p).indexOf('PO Box') < 0 && JSON.stringify(pub).indexOf('PO Box') < 0, 'no mailing string anywhere in either projection');

/* ── review gate ──────────────────────────────────────────────────────── */
ok(SP.isShareable({ review: { state: 'accepted' } }), 'accepted is shareable');
ok(!SP.isShareable({ review: { state: 'pending' } }), 'pending is not shareable');
ok(SP.isShareable({}), 'a site with no review block (pre-spine, hand-entered) counts as accepted');

/* ── ev rollup ────────────────────────────────────────────────────────── */
var r = SP.rollupEv([f.doc, g.doc, a.doc]);
ok(r.sites === 3 && r.chargers === 8 && r.totalKw === 1296 && r.missingKw === 2, 'rollup sums what exists and counts what is missing');

console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed');
process.exit(fails ? 1 : 0);
