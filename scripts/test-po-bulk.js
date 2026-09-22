#!/usr/bin/env node
/* scripts/test-po-bulk.js — the one bulk-PO parser
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   node scripts/test-po-bulk.js */
'use strict';
var B = require('../omega-po-bulk');
var pass = 0, fail = 0;
function ok(label, yes, detail) { console.log('  ' + (yes ? 'PASS' : 'FAIL') + '  ' + label + (detail !== undefined && !yes ? '  got: ' + JSON.stringify(detail) : '')); if (yes) pass++; else fail++; }
console.log('\nmany purchase orders from lines');
var r = B.parse('INC-4471, CC-C215, 4, InCharge Bakersfield, 1200 Depot Rd, Bakersfield, CA, 93307, 2026-11-15, dock B\nINC-4471, CC-C418, 1, ignored, ignored, ignored, XX, 00000\n\nINC-4472, CC-C215, 2, InCharge Fresno, 88 Rail Ave, Fresno, CA, 93706, 2026-11-22,\nINC-4472, CC-C215, 3, InCharge Fresno, 88 Rail Ave, Fresno, CA, 93706');
ok('lines with one PO number are one PO to one place, the first line\'s', r.pos.length === 2 && r.pos[0].lines.length === 2 && r.pos[0].destination.city === 'Bakersfield' && r.pos[0].requestedDate === '2026-11-15' && r.pos[0].notes === 'dock B', r.pos[0]);
ok('the same SKU twice on one PO adds up', r.pos[1].lines.length === 1 && r.pos[1].lines[0].qty === 5, r.pos[1]);
ok('blank lines are skipped and nothing is a problem', r.problems.length === 0 && B.ready(r), r.problems);
ok('the summary counts POs and lines', B.summary(r) === '2 purchase orders, 3 lines', B.summary(r));
var bad = B.parse('INC-1, CC-C215, 4, Name, Addr, City\nINC-2, CC-C215, 0, Name, Addr, City, CA, 93307\nINC-3, CC-C215, 1.5, Name, Addr, City, CA, 93307\nINC-4, CC-C215, 1, Name, Addr, City, CA, 93307, 15/11/2026\n, CC-C215, 1, Name, Addr, City, CA, 93307\nINC-6, , 1, Name, Addr, City, CA, 93307');
ok('a short line, a zero, a fraction, a bad date, no PO number and no SKU are each named by line', bad.problems.length === 6 && /line 1: needs/.test(bad.problems[0]) && /line 2: qty/.test(bad.problems[1]) && /line 3: qty/.test(bad.problems[2]) && /line 4: requested date/.test(bad.problems[3]) && /line 5: no PO/.test(bad.problems[4]) && /line 6: no SKU/.test(bad.problems[5]), bad.problems);
ok('  and nothing with a problem is sent', bad.pos.length === 0 && !B.ready(bad));
var many = []; for (var i = 0; i < 51; i++) many.push('PO-' + i + ', CC-C215, 1, N, A, C, CA, 93307');
ok('fifty-one POs is one too many', /at most 50/.test(B.parse(many.join('\n')).problems[0]));
ok('an empty sheet is not ready and says so', !B.ready(B.parse('')) && /Paste or type/.test(B.summary(B.parse(''))));
console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
