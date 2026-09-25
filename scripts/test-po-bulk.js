#!/usr/bin/env node
/* scripts/test-po-bulk.js — the one bulk-PO parser (omega-po-bulk.js): the
   office PO inbox, the office phone app and the customer phone app all read
   the sheet through it. Every name and address here is fictional.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   node scripts/test-po-bulk.js */
'use strict';
var B = require('../omega-po-bulk');
var pass = 0, fail = 0;
function ok(label, yes, detail) { console.log('  ' + (yes ? 'PASS' : 'FAIL') + '  ' + label + (detail !== undefined && !yes ? '  got: ' + JSON.stringify(detail) : '')); if (yes) pass++; else fail++; }
function has(r, re) { return r.problems.some(function (p) { return re.test(p); }); }

console.log('\nmany purchase orders from lines');
var r = B.parse('NW-4471, CC-C215, 4, Northwind Bakersfield, 1200 Depot Rd, Bakersfield, CA, 93307, 2026-11-15, dock B\nNW-4471, CC-C418, 1, , , , , \n\nNW-4472, CC-C215, 2, Northwind Fresno, 88 Rail Ave, Fresno, CA, 93706, 2026-11-22,\nNW-4472, CC-C215, 3, Northwind Fresno, 88 Rail Ave, Fresno, CA, 93706');
ok('lines with one PO number are one PO to one place; a later line may leave the ship-to blank ("same place")', r.pos.length === 2 && r.pos[0].lines.length === 2 && r.pos[0].destination.city === 'Bakersfield' && r.pos[0].requestedDate === '2026-11-15' && r.pos[0].notes === 'dock B', r.pos[0]);
ok('the same SKU twice on one PO adds up', r.pos[1].lines.length === 1 && r.pos[1].lines[0].qty === 5, r.pos[1]);
ok('blank lines are skipped and nothing is a problem', r.problems.length === 0 && B.ready(r), r.problems);
ok('the summary counts POs and lines', B.summary(r) === '2 purchase orders, 3 lines', B.summary(r));
var bad = B.parse('NW-1, CC-C215, 4, Name, Addr, City\nNW-2, CC-C215, 0, Name, Addr, City, CA, 93307\nNW-3, CC-C215, 1.5, Name, Addr, City, CA, 93307\nNW-4, CC-C215, 1, Name, Addr, City, CA, 93307, 15/11/2026\n, CC-C215, 1, Name, Addr, City, CA, 93307\nNW-6, , 1, Name, Addr, City, CA, 93307');
ok('a short line, a zero, a fraction, a bad date, no PO number and no SKU are each named by line', bad.problems.length === 6 && /line 1: 6 columns/.test(bad.problems[0]) && /line 2: qty/.test(bad.problems[1]) && /line 3: qty/.test(bad.problems[2]) && /line 4: requested date/.test(bad.problems[3]) && /line 5: no PO/.test(bad.problems[4]) && /line 6: no SKU/.test(bad.problems[5]), bad.problems);
ok('  and nothing with a problem is sent', bad.pos.length === 0 && !B.ready(bad));
var many = []; for (var i = 0; i < 51; i++) many.push('PO-' + i + ', CC-C215, 1, N, A, C, CA, 93307');
ok('fifty-one POs is one too many', /at most 50/.test(B.parse(many.join('\n')).problems[0]));
ok('an empty sheet is not ready and says so', !B.ready(B.parse('')) && /Paste or type/.test(B.summary(B.parse(''))));

console.log('\none PO number, one place (CUST-02)');
/* sixteen stores on one PO: before, they merged silently into one delivery
   to the first address */
var stores = []; for (var s = 0; s < 16; s++) stores.push('NW-9000, CC-R60K, ' + (s < 8 ? 4 : 3) + ', Store ' + (s + 1) + ', ' + (100 + s) + ' Main St, Fresno, CA, 937' + (10 + s));
var sp = B.parse(stores.join('\n'));
ok('a PO number with sixteen ship-to addresses is a problem, not a merge', !B.ready(sp) && sp.problems.length === 1 && /^PO NW-9000 has 16 ship-to addresses \(lines 1, 2, 3/.test(sp.problems[0]), sp.problems);
ok('  the problem points at the several-sites route, and several() says so for the entry screens', /“One PO to several sites”/.test(sp.problems[0]) && B.several(sp) === true && B.several(r) === false, sp.problems[0]);
ok('  the route name can be the entry screen\'s own', /“Several sites”/.test(B.parse(stores.join('\n'), { severalSites: 'Several sites' }).problems[0]));
var caseOnly = B.parse('NW-1, CC-C215, 1, Yard, 1200 Depot Rd, Bakersfield, CA, 93307\nNW-1, CC-C418, 1, Yard gate B, 1200  depot rd, BAKERSFIELD, ca, 93307');
ok('the same address typed twice (case, spacing, another name for the place) is one place', B.ready(caseOnly) && caseOnly.pos[0].destination.name === 'Yard', caseOnly.problems);
var twoDates = B.parse('NW-1, CC-C215, 1, Yard, 1 A St, Aurora, CO, 80010, 2026-11-15\nNW-1, CC-C418, 1, , , , , , 2026-12-01');
ok('two requested dates on one PO are a problem too, not the first one silently', !B.ready(twoDates) && has(twoDates, /PO NW-1 asks for 2 requested dates \(2026-11-15, 2026-12-01\)/), twoDates.problems);
var noPlace = B.parse('NW-1, CC-C215, 1, , , , , ');
ok('the first line of a PO carries its ship-to', !B.ready(noPlace) && has(noPlace, /line 1: PO NW-1 needs its ship-to name, address, city, state and ZIP on its first line/), noPlace.problems);
var notes2 = B.parse('NW-1, CC-C215, 1, Yard, 1 A St, Aurora, CO, 80010, , gate code 4411\nNW-1, CC-C418, 1, , , , , , , call on arrival');
ok('notes on a later line of the same PO are kept, not dropped', notes2.pos[0].notes === 'gate code 4411; call on arrival', notes2.pos[0].notes);

console.log('\nrows from a spreadsheet, a header, quotes and commas (CUST-03 / OFF-09)');
var tsv = B.parse('PO number\tSKU\tQty\tShip-to name\tAddress\tCity\tState\tZIP\tRequested date\tNotes\nNW-5001\tCC-C215\t2\tHarbor Depot\t500 Pier Rd, Unit 4\tOakland\tCA\t94607\t11/15/2026\tdock 2, north side\nNW-5002\tCC-C418\t1,000\tInland Yard\t9 Rail Way\tStockton\tCA\t95202\t\t');
ok('tab-separated rows (Excel, Sheets) are read; a comma inside a cell is just a comma', B.ready(tsv) && tsv.pos.length === 2 && tsv.pos[0].destination.line1 === '500 Pier Rd, Unit 4' && tsv.pos[0].notes === 'dock 2, north side', tsv);
ok('  the header row is skipped and the summary says so', tsv.header === true && B.summary(tsv) === '2 purchase orders, 2 lines (header row skipped)' && tsv.separator === 'tab', B.summary(tsv));
ok('  a US spreadsheet date and a thousands separator in qty are read', tsv.pos[0].requestedDate === '2026-11-15' && tsv.pos[1].lines[0].qty === 1000, tsv.pos);
var quoted = B.parse('NW-6001, CC-C215, 1, "Harbor Depot, East", "500 Pier Rd, Unit 4", Oakland, CA, 94607, 2026-11-15, "gate ""B"", ask for Sam"');
ok('quoted CSV cells keep their commas, and "" is a quote', B.ready(quoted) && quoted.pos[0].destination.name === 'Harbor Depot, East' && quoted.pos[0].destination.line1 === '500 Pier Rd, Unit 4' && quoted.pos[0].notes === 'gate "B", ask for Sam', quoted);
var noteCommas = B.parse('NW-6002, CC-C215, 1, Yard, 1 A St, Aurora, CO, 80010, 2026-11-15, deliver weekdays, 8 to 4, call first');
ok('a comma in the notes no longer cuts them short: the notes are the rest of the line', B.ready(noteCommas) && noteCommas.pos[0].notes === 'deliver weekdays, 8 to 4, call first', noteCommas.pos[0].notes);
var shifted = B.parse('NW-6003, CC-C215, 1, Yard, 1200 Depot Rd, Suite 4, Bakersfield, CA, 93307');
ok('an unquoted comma in an address is caught at the ZIP, with how to fix it, never sent shifted', !B.ready(shifted) && has(shifted, /^line 1: the ZIP \(8th column, split on commas\) reads "CA", not a US ZIP code\. A name or address with a comma in it needs double quotes/), shifted.problems);
var shortTab = B.parse('NW-7001\tCC-C215\t2\tHarbor Depot\t500 Pier Rd');
ok('a short row names its column count and the separator it was split on (tabs)', has(shortTab, /^line 1: 5 columns \(split on tabs\); a line needs at least 8: PO number, SKU, qty, ship-to name, address, city, state, ZIP$/), shortTab.problems);
var semi = B.parse('NW-7002; CC-C215; 2; Harbor Depot; 500 Pier Rd; Oakland; CA; 94607');
ok('  and on commas, with a word about semicolons when that is what was used', has(semi, /^line 1: 1 column \(split on commas\); a line needs at least 8: .*Separate them with commas/), semi.problems);
var open = B.parse('NW-7003, CC-C215, 2, "Harbor Depot, 500 Pier Rd, Oakland, CA, 94607');
ok('a quote that never closes is named', has(open, /line 1: a double quote \(\"\) opens a cell and is never closed/), open.problems);
var multi = B.parse('NW-7004, CC-C215, 2, Harbor Depot, 500 Pier Rd, Oakland, CA, 94607, , "two lines\nof notes"\nNW-7005, CC-C215, 1, Yard, 1 A St, Aurora, CO, 80010');
ok('a quoted cell may run over a line break (a note from a spreadsheet cell); the next line is still numbered right', B.ready(multi) && multi.pos.length === 2 && multi.pos[0].notes === 'two lines\nof notes' && B.parse('NW-7004, CC-C215, 2, H, 5 P Rd, Oakland, CA, 94607, , "a\nb"\nNW-7005, CC-C215, 0, Y, 1 A St, Aurora, CO, 80010').problems[0].indexOf('line 3: qty') === 0, multi);
var mixed = B.parse('NW-8001\tCC-C215\t2\tHarbor Depot\t500 Pier Rd\tOakland\tCA\t94607\nNW-8002, CC-C215, 1, Yard, 1 A St, Aurora, CO, 80010');
ok('a pasted sheet row and a typed comma row can sit in one paste', B.ready(mixed) && mixed.pos.length === 2 && mixed.separator === 'mixed', mixed);
var notHeader = B.parse('PO-1, CC-C215, four, Yard, 1 A St, Aurora, CO, 80010');
ok('a first data row with a mistyped qty is refused by line, never skipped as a header', notHeader.header === false && has(notHeader, /^line 1: qty must be a whole number above zero \(the 3rd column reads "four"\)/), notHeader);
var prefill = B.parse('PO-20260924, CC-C215, 4, ship-to name, address, city, state, ZIP, , sized 400 kW for 2 h');
ok('the sized template ("send as a PO") still counts as one PO, and says the ZIP is still to fill in', /^1 purchase order, 1 line · line 1: the ZIP/.test(B.summary(prefill)) && !B.ready(prefill), B.summary(prefill));

console.log('\na later line of the same PO (F5)');
var named = B.parse('A1, SKU-A, 2, Acme Yard, 1 Main St, Fresno, CA, 93722\nA1, SKU-B, 1, Acme Yard, , , , ');
ok('a later line that repeats the ship-to name and leaves the address blank is the same place, and the PO is ready', B.ready(named) && !B.several(named) && named.pos[0].lines.length === 2, named.problems);
var partSame = B.parse('A1, SKU-A, 2, Acme Yard, 1 Main St, Fresno, CA, 93722\nA1, SKU-B, 1, , , fresno, , ');
ok('  one that fills only some of the address, agreeing with it, is the same place too', B.ready(partSame), partSame.problems);
var partOther = B.parse('A1, SKU-A, 2, Acme Yard, 1 Main St, Fresno, CA, 93722\nA1, SKU-B, 1, , , Visalia, , ');
ok('  one whose address differs is another place, and blocks sending', !B.ready(partOther) && B.several(partOther) && has(partOther, /^PO A1 has 2 ship-to addresses \(lines 1, 2\)/), partOther.problems);

console.log('\na ZIP a spreadsheet read as a number (R3)');
var boston = B.parse('PO-1,SKU-A,2,Acme Yard,1 Main St,Boston,MA,2134');
ok('a Massachusetts ZIP that lost its leading zero gets it back, and the line is ready', B.ready(boston) && boston.pos[0].destination.zip === '02134', boston.problems);
var tabbed = B.parse('PO-1\tSKU-A\t2\tAcme Yard\t1 Main St\tBoston\tMA\t2134');
ok('  pasted as tab-separated rows too', B.ready(tabbed) && tabbed.pos[0].destination.zip === '02134', tabbed.problems);
var sanJuan = B.parse('PO-2,SKU-A,1,Harbor,1 Calle Luna,San Juan,Puerto Rico,901');
ok('  two lost zeros in Puerto Rico, the state written out', B.ready(sanJuan) && sanJuan.pos[0].destination.zip === '00901', sanJuan.problems);
var shortCa = B.parse('PO-3,SKU-A,1,Yard,1 A St,Fresno,CA,9372');
ok('a short ZIP elsewhere is refused with what a ZIP is, not the comma-and-quotes advice', !B.ready(shortCa) && has(shortCa, /^line 1: the ZIP \(8th column\) reads "9372", and a US ZIP code has five digits/) && !has(shortCa, /double quotes/), shortCa.problems);

console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
