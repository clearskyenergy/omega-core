/* The Omega pulse is counts only, from the week's rows, and says when there is no trend to call.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   node scripts/tests/tpulse.js */
'use strict';
var path = require('path'), P = require(path.join(__dirname, '..', '..', 'api', '_lib', 'pulse.js'));
var pass = 0, fail = 0;
function ok(m, c, got) { if (c) { pass++; return; } fail++; console.log('  FAIL ' + m + (got !== undefined ? '  got: ' + JSON.stringify(got) : '')); }
var NOW = Date.parse('2026-09-27T00:00:00Z'), D = 86400000;
function ago(days) { return NOW - days * D; }
var rows = {
  projects: [
    { updatedAt: ago(1), stage: 'candidate', bessKwh: 2000, bessKw: 1000, orgId: 'a.example' },
    { updatedAt: ago(2), stage: 'finance', bessKwh: 4000, bessKw: 1000, orgId: 'b.example' },
    { updatedAt: { toMillis: function () { return ago(3); } }, stage: 'online', bessKwh: 3000, bessKw: 1000, orgId: 'a.example' },
    { updatedAt: new Date(ago(9)).toISOString(), stage: 'candidate', orgId: 'c.example' },
    { updatedAt: ago(20), stage: 'candidate', orgId: 'c.example' },
    { updatedAt: null, stage: 'candidate', orgId: 'd.example' }
  ],
  rfqs: [{ createdAt: ago(0.5) }, { createdAt: ago(6.9) }, { createdAt: ago(8) }],
  members: [{ lastSeen: ago(0.1) }, { lastSeen: ago(30) }, { lastSeen: { seconds: Math.floor(ago(2) / 1000) } }]
};
var p = P.build(rows, NOW, { projects: 500, rfqs: 500, members: 500 });
ok('projects saved this week: three of six', p.stats.projects === 3, p.stats);
ok('rfqs sent this week: two of three', p.stats.rfqs === 2, p.stats);
ok('financed this week: finance and online, not the candidate', p.stats.financed === 2, p.stats);
ok('designers active: two of three, one by a seconds timestamp', p.stats.designers === 2, p.stats);
ok('companies building this week: two distinct', p.stats.companies === 2, p.stats);
ok('eight weekly buckets, newest last, this week 3, last week 1, three weeks ago 1', p.weeks.length === 8 && p.weeks[7] === 3 && p.weeks[6] === 1 && p.weeks[5] === 1, p.weeks);
ok('the median duration is 3 hours, in the 2 to 4 band, and the insight says so with the count', p.medianHours === 3 && p.band.join('-') === '2-4' && /2 to 4 hour/.test(p.insight) && /3 sized projects/.test(p.insight), p.insight);
ok('mine: a 2.5 hour design sits in the band, 6 above, 1 below', P.mine(p, 2.5) === 'in' && P.mine(p, 6) === 'above' && P.mine(p, 1) === 'below' && P.mine(p, 0) === null);
ok('nothing names a company, a person or a project', !/example|@/.test(JSON.stringify(p)));
var empty = P.build({}, NOW);
ok('an empty week is zeros and says there is no trend to call', empty.stats.projects === 0 && empty.medianHours === null && /Not enough/.test(empty.insight) && P.mine(empty, 2) === null, empty);
var fp = P.build({ deals: [
  { status: 'open', mw: 4, approvedAt: ago(1), name: 'Joliet BESS', orgKey: 'secret.example' },
  { status: 'open', sizeMw: 12.5, approvedAt: ago(10) },
  { status: 'open', mw: 'n/a', createdAt: { seconds: Math.floor(ago(3) / 1000) } },
  { status: 'exclusive', mw: 50, approvedAt: ago(1) }
], filed: [{ createdAt: ago(0.2) }, { createdAt: ago(5) }, { createdAt: ago(12) }] }, NOW, { deals: 500 });
ok('financing: three open (a held deal is not open), 16.5 MW, two opened this week, two filed', fp.finance.open === 3 && fp.finance.openMw === 16.5 && fp.finance.openedThisWeek === 2 && fp.finance.filedThisWeek === 2 && fp.caps.deals === 500, fp.finance);
ok('the financing counts name no deal, place or company', !/Joliet|secret|example/.test(JSON.stringify(fp)));
ok('an empty marketplace is zeros', empty.finance.open === 0 && empty.finance.openMw === 0 && empty.finance.openedThisWeek === 0 && empty.finance.filedThisWeek === 0, empty.finance);

console.log('tpulse: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
