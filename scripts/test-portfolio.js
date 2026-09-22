/* ═══════════════════════════════════════════════════════════════════════════
   scripts/test-portfolio.js — the portfolio screener, offline
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   An in-memory Firestore double (same contract as scripts/test-logic-workflow.js:
   no reads after writes in a transaction, where/orderBy/limit, merge sets),
   a Storage stub that keeps bytes in a Map, and the real modules under
   api/_lib/portfolio and api/_lib/bess-engine. No network, no credentials.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var assert = require('node:assert/strict');
var FD = require('./_lib/firestore-double'), DB = FD.DB, mock = FD.mock;
var db, storage = new Map(), storageFails = false;
var A = { db: function () { return db; }, safeOrg: function (v) { return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(v || '') ? v : ''; }, httpError: function (s, m) { var e = new Error(m); e.status = s; return e; }, authenticate: async function (r) { return r.caller; }, handler: function (f) { return f; }, canActInOrg: async function (c, o) { return c.orgId === o; }, FieldValue: function () { return { serverTimestamp: function () { return Date.now(); } }; },
  init: function () {
    var bucket = { file: function (path) { return {
      save: async function (bytes) { if (storageFails) throw new Error('Storage test failure'); storage.set(path, Buffer.from(bytes)); },
      download: async function () { if (!storage.has(path)) throw new Error('missing ' + path); return [storage.get(path)]; } }; } };
    return { storage: function () { return { bucket: function () { return bucket; } }; } };
  } };
mock('../api/_lib/admin', A);
var api = require('../api/customer-portfolio'), zip = require('../api/_lib/portfolio/zip'), xlsx = require('../api/_lib/portfolio/xlsx'), csv = require('../api/_lib/portfolio/csv'), T = require('../api/_lib/portfolio/template'), R = require('../api/_lib/portfolio/report'), AG = require('../api/_lib/portfolio/aggregate');

var buyer = { uid: 'buyer', email: 'buyer@example.com', claims: { email_verified: true } }, other = { uid: 'other', email: 'other@example.com', claims: { email_verified: true } }, res = { setHeader: function () {}, end: function (b) { this.body = b; } };
var count = 0; async function test(name, fn) { await fn(); count++; console.log('PASS ' + name); }
function seed(opts) {
  opts = opts || {}; db = new DB(); storage = new Map();
  db.seed('omega_orgs/cleancell.us', { status: 'active', name: 'CleanCell' });
  db.seed('omega_orgs/cleancell.us/billing/current', { addons: ['omega-logic'], editorLite: opts.editor ? { enabled: true, modules: ['bess'] } : {} });
  db.seed('omega_orgs/cleancell.us/storefront/config', { capexPerKwh: opts.cost === false ? null : 400, capexPerKw: opts.cost === false ? null : 250, products: [
    { sku: 'C215', name: '215 kWh cabinet', kind: 'product', category: 'bess', kw: 100, kwh: 215, widthFt: 4.5, depthFt: 3.5, priceMode: 'quote', integrates: { pcs: true } },
    { sku: 'C418', name: '418 kWh cabinet', kind: 'product', category: 'bess', kw: 200, kwh: 418, widthFt: 7.5, depthFt: 4.5, priceMode: 'list', listPrice: 180000 },
    { sku: 'C1300', name: '1.3 MWh container', kind: 'product', category: 'bess', kw: 650, kwh: 1300, widthFt: 20, depthFt: 8, priceMode: 'quote' }] });
  ['buyer', 'other'].forEach(function (id) { db.seed('omega_orgs/cleancell.us/customer_index/' + id + '@example.com', { customerId: id }); db.seed('omega_orgs/cleancell.us/customers/' + id, { status: 'active', name: id === 'buyer' ? 'Buyer Co' : 'Other Co', editorLite: opts.editor ? { status: 'active', source: 'provider', expiresAt: '2099-01-01T00:00:00Z' } : {} }); db.seed('omega_orgs/cleancell.us/customers/' + id + '/users/' + id + '@example.com', { email: id + '@example.com', role: 'owner', status: 'active' }); });
}
function call(body, caller) { return api({ method: 'POST', body: Object.assign({ org: 'cleancell.us' }, body), caller: caller || buyer }, res); }
function getq(query, caller) { return api({ method: 'GET', query: Object.assign({ org: 'cleancell.us' }, query), caller: caller || buyer }, res); }
function b64(s) { return Buffer.from(s).toString('base64'); }

/* Fixtures: one complete site with an 8760, one with twelve bills, one address-only, one with a service limit. */
var HEAD = ['Site ID', 'Site name', 'Street address', 'City', 'State', 'ZIP code', 'Utility', 'Project objective', 'Demand charge ($/kW-month)', 'Energy rate ($/kWh)', 'Main service rating (A)', 'Service voltage (V)', 'Phase', 'Available installation area (sq ft)', 'Interconnection limit (kW)', 'Transformer capacity (kVA)'].concat(T.MONTHS.map(function (m) { return m + ' kW'; })).concat(T.MONTHS.map(function (m) { return m + ' kWh'; }));
function siteRow(id, name, extra) { var base = { 'Site ID': id, 'Site name': name, 'Street address': (100 + id.length) + ' ' + name + ' St', 'City': 'Chicago', 'State': 'IL', 'ZIP code': '60601' }; Object.assign(base, extra || {}); return HEAD.map(function (h) { return base[h] != null ? base[h] : ''; }); }
function months(peak, kwh) { var o = {}; T.MONTHS.forEach(function (m, i) { o[m + ' kW'] = peak + (i > 4 && i < 9 ? 120 : 0); o[m + ' kWh'] = kwh; }); return o; }
function interval8760() { var out = []; for (var i = 0; i < 8760; i++) { var h = i % 24; out.push((300 + (h >= 9 && h <= 17 ? 350 : 0) + 40 * Math.sin(i / 24 * Math.PI) + (h === 14 ? 120 : 0)).toFixed(1)); } return 'hour,kW\n' + out.map(function (v, i) { return i + ',' + v; }).join('\n') + '\n'; }
function sitesCsv() { return csv.stringify([HEAD,
  siteRow('S-001', 'North DC', Object.assign({ 'Project objective': 'Demand charge reduction', 'Demand charge ($/kW-month)': 18.5, 'Energy rate ($/kWh)': 0.11, 'Main service rating (A)': 1200, 'Service voltage (V)': 480, 'Phase': 3, 'Available installation area (sq ft)': 2000, 'Utility': 'ComEd' })),
  siteRow('S-002', 'South Store', Object.assign({ 'Project objective': 'Demand charges' }, months(600, 180000))),
  siteRow('S-003', 'Addr Only', {}),
  siteRow('S-004', 'Capped Plant', Object.assign({ 'Transformer capacity (kVA)': 300, 'Demand charge ($/kW-month)': 20, 'Energy rate ($/kWh)': 0.12 }, months(600, 180000)))]); }
function packageZip() { return zip.build([{ name: 'sites.csv', bytes: sitesCsv() }, { name: 'S-001/interval-2025.csv', bytes: interval8760() }, { name: 'S-001/bill-2025-01.pdf', bytes: '%PDF-1.4 bill' }, { name: 'docs/plan.pdf', bytes: '%PDF-1.4 which site?' }]); }
async function analyzeAll(pid, caller) { var out; do { out = await call({ action: 'analyze', portfolioId: pid, batch: 2 }, caller); } while (out.remaining > 0); return out; }

async function main() {
await test('1 · a complete site with an 8760 and its tariff receives a detailed size; 2 · monthly bills receive a labelled preliminary size; 3 · an address-only site is not given a size; 4 · missing data is an exact request', async function () {
  seed(); var c = await call({ action: 'create', name: 'Pilot', files: [{ name: 'portfolio.zip', base64: packageZip().toString('base64') }] });
  assert.equal(c.duplicate, false); assert.equal(c.ingest.sites, 4); assert.equal(c.ingest.review, 1);
  var fin = await analyzeAll(c.portfolioId), p = await getq({ portfolio: c.portfolioId }), by = {}; p.sites.forEach(function (s) { by[s.siteId] = s; });
  assert.equal(fin.status, 'report_ready'); assert.equal(by['S-001'].sizing.status, 'detailed'); assert.equal(by['S-001'].screening.disposition, 'pass'); assert(by['S-001'].sizing.kw > 0 && by['S-001'].sizing.config.qty >= 1);
  assert.equal(by['S-002'].sizing.status, 'preliminary'); assert.equal(by['S-002'].sizing.statusLabel, 'Preliminary Size Complete'); assert(by['S-002'].sizing.confidence.score < by['S-001'].sizing.confidence.score);
  var s2 = (await getq({ portfolio: c.portfolioId, site: 'S-002' })).site; assert(s2.sizing.assumptions.some(function (a) { return /assumed/i.test(a); })); assert(s2.quality.improve.some(function (m) { return m.key === 'interval'; }));
  assert.equal(by['S-003'].sizing.status, 'unable'); assert.equal(by['S-003'].sizing.kw, undefined); assert.equal(by['S-003'].screening.disposition, 'info'); assert.equal(by['S-003'].status, 'needs_information');
  var s3 = (await getq({ portfolio: c.portfolioId, site: 'S-003' })).site, keys = s3.quality.missing.map(function (m) { return m.key; });
  ['interval', 'bills12', 'peaks', 'tariff'].forEach(function (k) { assert(keys.indexOf(k) >= 0, 'asks for ' + k); }); assert(/Provide:/.test(s3.nextAction));
});
await test('5 · a mixed portfolio completes despite incomplete sites, and a per-site failure never stops the batch', async function () {
  seed(); var c = await call({ action: 'create', name: 'Mixed', files: [{ name: 'sites.csv', base64: b64(sitesCsv()) }] });
  db.seed('omega_orgs/cleancell.us/customers/buyer/portfolios/' + c.portfolioId + '/sites/S-004', Object.assign(db.data.get('omega_orgs/cleancell.us/customers/buyer/portfolios/' + c.portfolioId + '/sites/S-004'), { documents: [{ id: 'x', name: 'S-004/interval.csv', type: 'interval', path: 'missing/path' }] }));
  var fin = await analyzeAll(c.portfolioId), p = await getq({ portfolio: c.portfolioId }), by = {}; p.sites.forEach(function (s) { by[s.siteId] = s; });
  assert.equal(fin.status, 'report_ready'); assert.equal(by['S-004'].status, 'failed'); assert.match(by['S-004'].error, /missing/); assert.equal(by['S-002'].status, 'sized'); assert.equal(by['S-003'].status, 'needs_information');
  assert.equal(p.summary.failed, 1); assert.equal(p.summary.processed, 3); assert.equal(p.remaining, 0);
  var rr = await call({ action: 'rerun', portfolioId: c.portfolioId, siteId: 'S-004' }); assert.equal(rr.reprocessed[0].status, 'failed');
});
await test('6 · documents match the right site by ID and by address; 7 · an ambiguous document waits in the review queue and is assigned by the customer', async function () {
  seed(); var z = zip.build([{ name: 'sites.csv', bytes: sitesCsv() }, { name: 'S-001/bill-jan.pdf', bytes: '%PDF-1.4 a' }, { name: 'bills/105 South Store St 2025.pdf', bytes: '%PDF-1.4 b' }, { name: 'shared/one-line.pdf', bytes: '%PDF-1.4 c' }]);
  var c = await call({ action: 'create', name: 'Match', files: [{ name: 'p.zip', base64: z.toString('base64') }] }), p = await getq({ portfolio: c.portfolioId }), f = {}; p.files.forEach(function (x) { f[x.name] = x; });
  assert.equal(f['S-001/bill-jan.pdf'].siteId, 'S-001'); assert.equal(f['S-001/bill-jan.pdf'].matchedBy, 'siteId');
  assert.equal(f['bills/105 South Store St 2025.pdf'].siteId, 'S-002'); assert.equal(f['bills/105 South Store St 2025.pdf'].matchedBy, 'address');
  assert.equal(f['shared/one-line.pdf'].siteId, null); assert.equal(p.reviewQueue.length, 1); assert.equal(p.reviewQueue[0].name, 'shared/one-line.pdf');
  var nameOnly = require('../api/_lib/portfolio/match').matchFiles([{ id: 'n', name: 'North DC plan.pdf' }], [{ siteId: 'S-001', addressKey: '105 north dc st|chicago|il|60601', name: 'North DC' }])[0]; assert.equal(nameOnly.siteId, null); assert.deepEqual(nameOnly.candidates, ['S-001']); assert.equal(nameOnly.ambiguous, true);
  var s1 = (await getq({ portfolio: c.portfolioId, site: 'S-001' })).site; assert.equal(s1.documents.length, 1);
  var a = await call({ action: 'assign', portfolioId: c.portfolioId, fileId: p.reviewQueue[0].id, siteId: 'S-003' }); assert.equal(a.siteId, 'S-003');
  var p2 = await getq({ portfolio: c.portfolioId }); assert.equal(p2.reviewQueue.length, 0); assert.equal((await getq({ portfolio: c.portfolioId, site: 'S-003' })).site.documents[0].matchedBy, 'manual');
  await assert.rejects(call({ action: 'assign', portfolioId: c.portfolioId, fileId: p.reviewQueue[0].id, siteId: 'NOPE' }), /Site not found/);
});
await test('8 · uploading the same package again opens the existing portfolio and creates no second set of projects', async function () {
  seed({ editor: true }); var files = [{ name: 'portfolio.zip', base64: packageZip().toString('base64') }];
  var c1 = await call({ action: 'create', name: 'A', files: files }), c2 = await call({ action: 'create', name: 'B', files: files });
  assert.equal(c2.duplicate, true); assert.equal(c2.portfolioId, c1.portfolioId); assert.equal((await getq({})).portfolios.length, 1);
  await analyzeAll(c1.portfolioId);
  var a1 = await call({ action: 'add-to-projects', portfolioId: c1.portfolioId, siteId: 'S-001' }), a2 = await call({ action: 'add-to-projects', portfolioId: c1.portfolioId, siteId: 'S-001' });
  assert.equal(a1.duplicate, false); assert.equal(a2.duplicate, true); assert.equal(a1.projectId, a2.projectId); assert.match(a1.designLink, /editor-lite\.html\?customer=1&org=cleancell\.us&project=/);
  var project = db.data.get('omega_orgs/cleancell.us/customers/buyer/projects/' + a1.projectId); assert.equal(project.module, 'bess'); assert(project.target.kw > 0); assert.equal(project.target.product.sku, 'C418'); assert.equal(project.target.portfolio.siteId, 'S-001'); assert(project.target.portfolio.assumptions); assert.equal(project.siteAddress.indexOf('North DC'), 4);
  assert.equal(Array.from(db.data.keys()).filter(function (k) { return k.indexOf('/projects/') > 0; }).length, 1);
  await assert.rejects(call({ action: 'add-to-projects', portfolioId: c1.portfolioId, siteId: 'S-003' }), /no recommended size/);
});
await test('9 · a known electrical limit caps the recommendation and says so; an unknown limit is flagged for verification', async function () {
  seed(); var c = await call({ action: 'create', name: 'Caps', files: [{ name: 'sites.csv', base64: b64(sitesCsv()) }] }); await analyzeAll(c.portfolioId);
  var s4 = (await getq({ portfolio: c.portfolioId, site: 'S-004' })).site, s2 = (await getq({ portfolio: c.portfolioId, site: 'S-002' })).site;
  assert.deepEqual(s4.sizing.constraints.cappedBy, ['transformer']); assert.equal(s4.sizing.kw, 240); assert(s4.sizing.constraints.uncappedKw > 240); assert(s4.sizing.assumptions.some(function (a) { return /capped at 240 kW/.test(a); })); assert.equal(s4.sizing.constraints.verification, null);
  assert.equal(s2.sizing.constraints.cappedBy.length, 0); assert.match(s2.sizing.constraints.verification, /Subject to electrical and utility verification/); assert.equal(s2.screening.disposition, 'conditional');
  var csvText = (await getq({ portfolio: c.portfolioId, export: 'csv' }), res.body); assert(csvText.indexOf('transformer') > 0);
});
await test('10 · report totals equal the sum of the eligible site results, screening ranges stay out', async function () {
  seed(); var rows = [HEAD, siteRow('A', 'Alpha', Object.assign({ 'Demand charge ($/kW-month)': 18, 'Energy rate ($/kWh)': 0.1 }, months(500, 150000))), siteRow('B', 'Beta', months(800, 250000)), siteRow('C', 'Gamma', { 'Peak demand (kW)': 400 }), siteRow('D', 'Delta', {})];
  var head = rows[0].concat(['Peak demand (kW)']); rows = [head].concat(rows.slice(1).map(function (r, i) { return r.concat([i === 2 ? 400 : '']); }));
  var c = await call({ action: 'create', name: 'Totals', files: [{ name: 'sites.csv', base64: b64(csv.stringify(rows)) }] }); await analyzeAll(c.portfolioId);
  var p = await getq({ portfolio: c.portfolioId }), sized = p.sites.filter(function (s) { return s.sizing && ['detailed', 'preliminary'].indexOf(s.sizing.status) >= 0; });
  assert.equal(sized.length, 2); assert.equal(p.summary.sitesInTotal, 2);
  assert.equal(p.summary.totalKw, sized.reduce(function (t, s) { return t + s.sizing.kw; }, 0)); assert.equal(p.summary.totalKwh, sized.reduce(function (t, s) { return t + s.sizing.kwh; }, 0));
  var scr = p.sites.filter(function (s) { return s.siteId === 'C'; })[0]; assert.equal(scr.sizing.status, 'screening'); assert(scr.sizing.range.kwLow > 0); assert(p.summary.rangeKwHigh > 0);
  await getq({ portfolio: c.portfolioId, report: 'executive' }); var html = res.body; assert(html.indexOf('Sites with preliminary results') > 0 && html.indexOf('Sites requiring more information') > 0 && html.indexOf(String(p.summary.totalMwh.toFixed(2))) > 0 || html.indexOf('Recommended MWh') > 0);
  assert.equal(R.csvRows(p.sites.map(function (s) { return Object.assign({}, s, { fields: {} }); })).length, 5);
});
await test('11 · provenance and assumptions survive save, reload, export and rerun', async function () {
  seed(); var c = await call({ action: 'create', name: 'Prov', files: [{ name: 'sites.csv', base64: b64(sitesCsv()) }] }); await analyzeAll(c.portfolioId);
  var s = (await getq({ portfolio: c.portfolioId, site: 'S-002' })).site;
  assert.equal(s.fields.address.kind, 'supplied'); assert.equal(s.fields.address.source.file, 'sites.csv'); assert.equal(s.fields.address.source.field, 'Street address'); assert.equal(s.fields.address.source.row, 3); assert.equal(s.fields.address.confidence, 'high'); assert(s.fields.address.importedAt);
  assert.equal(s.months[0].source.field, 'Jan kW'); var assumptions = s.sizing.assumptions.slice(); assert(assumptions.length >= 2);
  await getq({ portfolio: c.portfolioId, export: 'csv' }); assert(res.body.indexOf(assumptions[0].slice(0, 20)) > 0);
  await getq({ portfolio: c.portfolioId, report: 'site', site: 'S-002' }); assert(res.body.indexOf('sites.csv') > 0 && res.body.indexOf('supplied') > 0);
  var again = await call({ action: 'rerun', portfolioId: c.portfolioId, siteId: 'S-002' }); assert.equal(again.reprocessed[0].status, 'sized');
  var s2 = (await getq({ portfolio: c.portfolioId, site: 'S-002' })).site; assert.deepEqual(s2.sizing.assumptions, assumptions); assert.equal(s2.fields.address.source.row, 3); assert(s2.history.length >= 3);
});
await test('12 · customers cannot see, change or process each other\'s portfolios; a bad org is refused', async function () {
  seed(); var c = await call({ action: 'create', name: 'Mine', files: [{ name: 'sites.csv', base64: b64(sitesCsv()) }] });
  assert.equal((await getq({}, other)).portfolios.length, 0);
  await assert.rejects(getq({ portfolio: c.portfolioId }, other), /not found/); await assert.rejects(call({ action: 'analyze', portfolioId: c.portfolioId }, other), /not found/);
  await assert.rejects(call({ action: 'assign', portfolioId: c.portfolioId, fileId: 'x', siteId: 'S-001' }, other), /not found/);
  await assert.rejects(api({ method: 'POST', body: { org: 'nope', action: 'create' }, caller: buyer }, res), /supplier/);
  await assert.rejects(call({ action: 'create', name: 'x', files: [{ name: 'sites.csv', base64: b64(sitesCsv()) }] }, { uid: 'nobody', email: 'nobody@example.com', claims: { email_verified: true } }), /customer account/);
});
await test('13 · provide missing information for one site reprocesses only that site; the single-site sizing engine contract is untouched', async function () {
  seed(); var c = await call({ action: 'create', name: 'One', files: [{ name: 'sites.csv', base64: b64(sitesCsv()) }] }); await analyzeAll(c.portfolioId);
  var before = await getq({ portfolio: c.portfolioId }), s1before = before.sites.filter(function (s) { return s.siteId === 'S-001'; })[0], s3before = before.sites.filter(function (s) { return s.siteId === 'S-003'; })[0];
  assert.equal(s3before.status, 'needs_information');
  var up = await call({ action: 'upload', portfolioId: c.portfolioId, siteId: 'S-003', files: [{ name: 'interval-2025.csv', base64: b64(interval8760()) }] });
  assert.equal(up.reprocessed.length, 1); assert.equal(up.reprocessed[0].siteId, 'S-003'); assert.equal(up.remaining, 0);
  var after = await getq({ portfolio: c.portfolioId }), s3 = after.sites.filter(function (s) { return s.siteId === 'S-003'; })[0], s1 = after.sites.filter(function (s) { return s.siteId === 'S-001'; })[0];
  assert.equal(s3.status, 'sized'); assert.equal(s3.sizing.status, 'preliminary'); assert.equal(s1.processedAt, s1before.processedAt);
  var E = require('../api/_lib/bess-engine'), r = E.sizeFromMonthly([{ demandKw: 1000, kwh: 200000 }], {}); assert(r.ok && E.summarize(r).kw > 0);
  await assert.rejects(call({ action: 'upload', portfolioId: c.portfolioId, siteId: 'NOPE', files: [{ name: 'x.csv', base64: b64('a,b') }] }), /Site not found/);
});
await test('templates download as CSV and XLSX and round-trip through the ingester; unsafe archives are refused', async function () {
  seed(); await getq({ template: 'csv' }); var rows = csv.parse(res.body); assert.equal(rows[0][0], 'Site ID'); assert(rows[0].length > 40);
  await getq({ template: 'xlsx' }); var x = xlsx.sheetRows(res.body); assert.equal(x[0][1], 'Site name'); assert.equal(x[1][0], 'S-001');
  var c = await call({ action: 'create', name: 'T', files: [{ name: 'template.xlsx', base64: res.body.toString('base64') }] }); assert.equal(c.ingest.sites, 1);
  var evil = zip.build([{ name: '../../etc/passwd', bytes: 'x' }]); var e = await call({ action: 'create', name: 'Evil', files: [{ name: 'evil.zip', base64: evil.toString('base64') }] }); assert.equal(e.ingest.sites, 0); assert.match((await getq({ portfolio: e.portfolioId })).portfolio.problems[0].error, /climbs out/);
  await assert.rejects(call({ action: 'create', name: 'Big', files: [{ name: 'big.csv', base64: Buffer.alloc(4.5 * 1024 * 1024).toString('base64') }] }), /exceeds 4 MB/);
  await assert.rejects(call({ action: 'create', name: 'Bad', files: [{ name: 'x.csv', base64: '!!!' }] }), /base64/);
  var exe = await call({ action: 'create', name: 'Exe', files: [{ name: 'run.exe', base64: b64('MZ') }] }); assert.match((await getq({ portfolio: exe.portfolioId })).portfolio.problems[0].error, /not accepted/);
});
console.log(count + ' portfolio checks passed');
}
main().catch(function (e) { console.error(e); process.exit(1); });
