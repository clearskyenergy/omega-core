#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   scripts/tests/tappsandbox.js — the phone sandboxes are current, and the
   sample answers a trial the way the endpoints would.
   node scripts/tests/tappsandbox.js */
'use strict';
var fs = require('fs'), path = require('path'), os = require('os');
var ROOT = path.join(__dirname, '../..');
var ADMIN = path.join(ROOT, 'api/_lib/admin.js');
require.cache[ADMIN] = { id: ADMIN, filename: ADMIN, loaded: true, exports: { httpError: function (s, m) { var e = new Error(m); e.status = s; return e; }, handler: function (f) { return f; }, db: function () { throw new Error('no db'); }, safeOrg: function (x) { return x; } } };
var pass = 0, fail = 0;
function ok(label, yes, detail) { console.log('  ' + (yes ? 'PASS' : 'FAIL') + '  ' + label + (detail !== undefined && !yes ? '  got: ' + JSON.stringify(detail) : '')); if (yes) pass++; else fail++; }

console.log('\nthe committed sandbox is what a rebuild produces');
var B = require('../build-app-sandbox'), files = B.build(null), dir = path.join(ROOT, 'app-sandbox');
var stale = Object.keys(files).filter(function (f) { var p = path.join(dir, f); return !fs.existsSync(p) || fs.readFileSync(p, 'utf8') !== files[f]; });
var extra = fs.existsSync(dir) ? fs.readdirSync(dir).filter(function (f) { return !files[f]; }) : [];
ok('every generated file matches app-sandbox/ (else: npm run build:sandbox)', stale.length === 0, stale);
ok('nothing in app-sandbox/ is unaccounted for', extra.length === 0, extra);
ok('the bundle carries the real libraries, not copies', /defs\['api\/_lib\/plant-board\.js'\]/.test(files['sandbox.js']) && /defs\['api\/_lib\/materials\.js'\]/.test(files['sandbox.js']) && /defs\['scripts\/_lib\/logic-fixtures\.js'\]/.test(files['sandbox.js']));
ok('  and nothing that needs node', !/require\('crypto'\)|require\('fs'\)|firebase-admin/.test(files['sandbox.js']));
ok('no page loads Firebase, config.js or the workspace runtime', ['plant.html', 'office.html', 'customer.html', 'bench.html'].every(function (f) { return !/<script src="[^"]*(gstatic\.com|\/config\.js|omega-tenant\.js|omega-brand\.js)/.test(files[f]) && /<script src="\/app-sandbox\/sandbox\.js">/.test(files[f]); }));
ok('  and no page links to the real bench or registers the real worker', ['plant.html', 'office.html', 'customer.html'].every(function (f) { return !/\/plant\/station\.html|app-sw\.js/.test(files[f]) && /app-sandbox\/sw\.js/.test(files[f]); }));
ok('three manifests, three ids, one scope', ['plant', 'office', 'customer'].every(function (a) { var m = JSON.parse(files[a + '.webmanifest']); return m.id === '/app-sandbox/' + a && m.start_url === '/app-sandbox/' + a && m.scope === '/app-sandbox/'; }));
ok('  plant and office are Omega Logic, ClearSky\'s product, with its icons', ['plant', 'office'].every(function (a) { var m = JSON.parse(files[a + '.webmanifest']); return /^Omega Logic/.test(m.name) && /\/icons\/omega-logic-192/.test(m.icons[0].src); }));
ok('  the customer app carries the tenant\'s name and icons', (function () { var m = JSON.parse(files['customer.webmanifest']); return !/Omega Logic/.test(m.name) && /cleancell\/icons\/customer-192/.test(m.icons[0].src); })());

console.log('\nthe sample answers a trial');
var F = require('../_lib/logic-fixtures'), s = F.initialState(), V = F.views(s);
ok('the office sees three orders, one to price, one request open', V.officeJson().orders.length === 3 && V.officeJson().totals.byStage.quote === 1 && V.officeJson().orders[0].requests[0].status === 'open');
var r = F.post(s, '/api/logic-office', '', { action: 'request-resolve', orderId: 'o1', requestId: 'r1', answer: '' }, 'pm@cleancell.us');
ok('an answer needs words', r.status === 400, r);
r = F.post(s, '/api/logic-office', '', { action: 'request-resolve', orderId: 'o1', requestId: 'r1', answer: 'Re-routed.' }, 'pm@cleancell.us');
ok('  then the request is resolved and the customer reads the answer', r.ok && V.myOrdersJson('ops@riverside.example').orders[0].requests[0].answer === 'Re-routed.', V.myOrdersJson().orders[0].requests[0]);
r = F.post(s, '/api/logic-plant', '', { action: 'allocate', serial: 'CC418-26-44194', orderId: 'o1' });
ok('a held unit cannot be assigned', r.status === 409, r);
r = F.post(s, '/api/logic-plant', '', { action: 'allocate', serial: 'CC418-26-44190', orderId: 'o1' });
ok('  an available one is: the order builds one fewer', r.ok && r.stillToBuild === 3 && s.units[0].orderId === 'o1' && V.plantJson('page=units').rows[0].inventoryStatus === 'allocated', r);
r = F.post(s, '/api/logic-plant', '', { action: 'allocate', serial: 'CC418-26-44190', orderId: 'o1' });
ok('  and not twice', r.status === 409, r);
r = F.post(s, '/api/po-intake', '', { action: 'submit-many', pos: [{ number: 'INC-1', lines: [{ sku: 'CC-C215', qty: 2 }], destination: { city: 'Fresno' } }, { number: 'RCC-2211', lines: [{ sku: 'CC-C215', qty: 1 }], destination: {} }, { number: 'INC-2', lines: [{ sku: 'CC-MOD-52', qty: 1 }], destination: {} }] }, 'ops@riverside.example');
ok('a customer\'s stack of POs: one entered, the existing number and the component named', r.created.length === 1 && /already exists/.test(r.skipped[0].error) && /published/.test(r.skipped[1].error), r);
ok('  and the office sees it as an order to price for that company', V.officeJson().totals.byStage.quote === 2 && V.officeJson().orders[0].customer.company === 'Riverside Cold Chain' && V.officeJson().orders[0].customerId === 'company_riverside' && V.intakeJson('', 'ops@riverside.example').orders[0].poNumber === 'INC-1');
r = F.post(s, '/api/po-intake', '', { action: 'submit-many', office: true, customerId: 'company_incharge', email: 'nobody@incharge.example', pos: [{ number: 'INC-3', lines: [{ sku: 'CC-C215', qty: 1 }], destination: {} }] }, 'pm@cleancell.us');
ok('the office must name a billing contact on the company', r.status === 400, r);
r = F.post(s, '/api/my-orders', 'org=cleancell.us', { orderNo: 'CC-26-4419', kind: 'warranty', message: 'Cabinet two shows a BMS fault.' }, 'ops@riverside.example');
ok('a customer asks on an order and the office sees it open', r.ok && V.officeJson().orders.filter(function (o) { return o.id === 'o1'; })[0].requests.filter(function (q) { return q.status === 'open'; }).length === 1);
r = F.post(s, '/api/plant-control', '', { action: 'hold', serial: 'CC418-26-44193', reason: 'Loose busbar' });
ok('a hold placed from the phone shows on the unit and the board', r.ok && V.plantJson('serial=CC418-26-44193').unit.hold === 'Loose busbar' && V.plantJson('page=board').rows[0].progress.held === 2);
r = F.post(s, '/api/buyers', '', { action: 'terms', email: 'ops@riverside.example', terms: { depositPct: 25, dueDays: 15 } });
ok('terms set in the office reach the customer\'s account', r.ok && V.accountJson().terms.depositPct === 25 && V.buyersJson('email=ops%40riverside.example').terms.dueDays === 15);
var bench = V.benchJson({ action: 'issue', code: 'CC-MOD-52' });
ok('the bench issues a part off the sample bill', /Issued 2 ea/.test(bench.say) && bench.work.steps[0].done);
var size = V.designPost({ action: 'size', module: 'bess', kw: 400, hours: 2, sku: 'CC-C215' });
ok('quick size runs the catalog selection', size.qty === 4 && size.selectedKwh === 860, size);
ok('state survives JSON: what localStorage keeps is enough to rebuild every view', F.views(JSON.parse(JSON.stringify(s))).officeJson().orders.length === 4);
console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
