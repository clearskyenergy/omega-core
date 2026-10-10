#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   scripts/test-site-crm.js — the site CRM, end to end offline
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   api/site-crm.js over the in-memory Firestore double and an in-memory
   Storage bucket, api/_lib/proforma.js against the WB2 workbook reference
   values, and scripts/import-evcs-sites.js's mapping against the import
   traps. No network.

   What must hold:
     · a member reads and writes; a viewer reads but cannot write;
       archiving is an administrator's; another workspace is refused;
       ClearSky staff may act anywhere
     · unknown stays unknown: a blank meter is null (never false), a missing
       peak or term is null (never 0)
     · contacts are saved and archived, never deleted; the activity log keeps
       an archived contact's name
     · a follow-up (or a task) is on the portfolio Today hub until it is done
     · a document's bytes are decided by their content, capped at 2 MB, kept
       in private Storage under sitecrm/{org}/{siteId}/{fileId} and served
       only by the endpoint; the path is never taken from the request
     · the import is idempotent on externalSiteIds.evcs and never coerces a
       blank meter to false or a whole-percent share to a fraction of itself
     · the pro forma reproduces the workbook case (tolerance 1e-7), reports
       "Not defined" when there is no IRR root (never 0%), and stores each
       run as an immutable scenario
     · every write is audited (action sitecrm-*)
   node scripts/test-site-crm.js
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var assert = require('node:assert/strict');
var FD = require('./_lib/firestore-double'), DB = FD.DB, mock = FD.mock;
var db, store = {}, failSave = false;
var A = { db: function () { return db; }, safeOrg: function (v) { return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(v || '') ? v : ''; }, httpError: function (s, m) { var e = new Error(m); e.status = s; return e; },
  authenticate: async function (r) { return r.caller; }, handler: function (f) { return f; },
  canActInOrg: async function (c, o) { return c.staff === true || c.orgId === o; }, isDegraded: function () { return false; },
  init: function () { throw new Error('the Admin SDK must not be reached in a test'); },
  FieldValue: function () { return { serverTimestamp: function () { return '2026-09-24T12:00:00Z'; } }; } };
mock('../api/_lib/admin', A);
/* Nothing in the site CRM deletes a document: a delete fails the test. */
FD.Ref.prototype.delete = async function () { throw new Error('deleted ' + this.path); };
var bucket = { file: function (p) { return {
  save: async function (bytes, opts) { if (failSave) throw new Error('storage down'); assert.equal(opts.contentType, 'application/octet-stream'); store[p] = Buffer.from(bytes); },
  download: async function () { if (!store[p]) throw new Error('no such object ' + p); return [store[p]]; } }; } };
var I = require('../api/_lib/po-intake'); I.bucket = function () { return bucket; };
var PF = require('../api/_lib/proforma');
var siteCrm = require('../api/site-crm');
var imp = require('./import-evcs-sites');

var ORG = 'evcs.com', O = 'omega_orgs/' + ORG, SITE = 'evcs-335';
function who(uid, orgId, extra) { return Object.assign({ uid: uid, email: uid + '@' + orgId, orgId: orgId, claims: { email_verified: true } }, extra || {}); }
var PM = who('pm', ORG), BOSS = who('boss', ORG), VIEWER = who('viewer', ORG);
var RIVAL = who('r', 'joules.example');
var STAFF = who('tom', 'clearsky-usa.com', { staff: true });
function res() { return { headers: {}, setHeader: function (k, v) { this.headers[k] = v; }, end: function (b) { this.body = b; } }; }
function call(method, body, caller, r) { return siteCrm({ method: method, body: method === 'POST' ? Object.assign({ org: ORG }, body) : undefined, query: method === 'GET' ? Object.assign({ org: ORG }, body || {}) : {}, caller: caller }, r || res()); }
async function rejects(p, status, re) { try { await p; } catch (e) { assert.equal(e.status, status, e.message + ''); if (re) assert.match(e.message, re); return e; } throw new Error('expected a ' + status); }
function b64(s) { return Buffer.from(s).toString('base64'); }
var PDF = b64('%PDF-1.4\n1 0 obj << >> endobj\n%%EOF');
function audits(action) { var out = []; db.data.forEach(function (v, k) { if (k.indexOf('omega_audit/') === 0 && (!action || v.action === action)) out.push(v); }); return out; }
var count = 0; async function test(name, fn) { seed(); await fn(); count++; console.log('PASS ' + name); }
async function quietly(fn) { var was = console.error; console.error = function () {}; try { return await fn(); } finally { console.error = was; } }

function seed() {
  db = new DB(); store = {}; failSave = false;
  db.seed(O, { name: 'EVCS', status: 'active' });
  db.seed(O + '/members/pm', { email: 'pm@evcs.com', role: 'member', status: 'active' });
  db.seed(O + '/members/boss', { email: 'boss@evcs.com', role: 'admin', status: 'active' });
  db.seed(O + '/members/viewer', { email: 'viewer@evcs.com', role: 'viewer', status: 'active' });
  db.seed(O + '/sites/' + SITE, { orgId: ORG, name: 'The Elysian Apartments', city: 'Los Angeles', state: 'CA',
    installedKw: 100, reportedPeakKw: 95, peakUnresolved: true, meterOwned: null, termYearsRemaining: 0,
    externalSiteIds: { evcs: '335' }, screening: { label: 'EVCS legacy proxy v1', pods: 0 },
    archived: false, createdAt: '2026-10-01T00:00:00Z' });
}

(async function () {
  console.log('\nwho may open the site CRM');
  await test('a member reads and writes, a viewer only reads, another workspace is refused', async function () {
    var list = await call('GET', {}, PM);
    assert.equal(list.sites.length, 1);
    await rejects(call('GET', {}, RIVAL), 403, /Not your workspace/);
    var w = await call('POST', { site: SITE, action: 'log', type: 'note', subject: 'walked the garage' }, PM);
    assert.equal(w.ok, true);
    await rejects(call('POST', { site: SITE, action: 'log', type: 'note', subject: 'x' }, VIEWER), 403, /read the site CRM/);
    var v = await call('GET', { site: SITE }, VIEWER);
    assert.equal(v.site.name, 'The Elysian Apartments');
    await rejects(call('GET', { site: SITE }, RIVAL), 403);
  });
  await test('archiving is an administrator\u2019s; staff may act in any workspace', async function () {
    var c = await call('POST', { site: SITE, action: 'contact-save', name: 'Dana', email: 'dana@evcs.com' }, PM);
    await rejects(call('POST', { site: SITE, action: 'contact-archive', id: c.id }, PM), 403, /administrator/);
    var a = await call('POST', { site: SITE, action: 'contact-archive', id: c.id }, BOSS);
    assert.equal(a.ok, true);
    var s = await call('POST', { site: SITE, action: 'log', type: 'note', subject: 'staff note' }, STAFF);
    assert.equal(s.ok, true);
  });

  console.log('\nunknown stays unknown');
  await test('a blank meter is null, never false; a missing peak or term is null, never 0', async function () {
    var created = await call('POST', { action: 'site-save', name: 'New Site', city: 'Portland', state: 'OR' }, PM);
    assert.equal(created.site.meterOwned, null);
    assert.equal(created.site.reportedPeakKw, null);
    assert.equal(created.site.termYearsRemaining, null);
    var again = await call('GET', { site: created.id }, PM);
    assert.equal(again.site.meterOwned, null);
    var seeded = await call('GET', { site: SITE }, PM);
    assert.equal(seeded.site.meterOwned, null);
    assert.equal(seeded.site.reportedPeakKw, 95);
    assert.equal(seeded.site.peakUnresolved, true);
  });
  await test('site-save requires a name and rejects nonsense', async function () {
    await rejects(call('POST', { action: 'site-save', name: '' }, PM), 400, /Site name/);
    await rejects(call('POST', { action: 'site-save', name: 'X', installedKw: 'lots' }, PM), 400, /Installed charger kW/);
    await rejects(call('POST', { action: 'site-save', name: 'X', meterOwned: 'maybe' }, PM), 400, /Meter ownership/);
  });

  console.log('\ncontacts and activity');
  await test('contacts save, dedupe by email, archive keeps the name on activity', async function () {
    var c = await call('POST', { site: SITE, action: 'contact-save', name: 'Dana', email: 'dana@evcs.com', primary: true }, PM);
    await rejects(call('POST', { site: SITE, action: 'contact-save', name: 'Dana 2', email: 'DANA@evcs.com' }, PM), 409, /already a contact/);
    var l = await call('POST', { site: SITE, action: 'log', type: 'call', subject: 'rate case', contactId: c.id }, PM);
    await call('POST', { site: SITE, action: 'contact-archive', id: c.id }, BOSS);
    var got = await call('GET', { site: SITE }, PM);
    assert.equal(got.contacts.length, 0);
    assert.equal(got.activity[0].contactName, 'Dana');
    await rejects(call('POST', { site: SITE, action: 'log', type: 'call', subject: 'x', contactId: c.id }, PM), 400, /archived/);
  });
  await test('a follow-up is on the portfolio Today hub until it is done', async function () {
    var l = await call('POST', { site: SITE, action: 'log', type: 'task', subject: 'get the single-line', followUpAt: '2026-10-20' }, PM);
    var hub = await call('GET', { followUps: '1' }, PM);
    assert.equal(hub.followUps.length, 1);
    assert.equal(hub.followUps[0].siteId, SITE);
    assert.equal(hub.followUps[0].subject, 'get the single-line');
    var d = await call('POST', { site: SITE, action: 'done', id: l.id }, PM);
    assert.equal(d.ok, true);
    var hub2 = await call('GET', { followUps: '1' }, PM);
    assert.equal(hub2.followUps.length, 0);
    var again = await call('POST', { site: SITE, action: 'done', id: l.id }, PM);
    assert.equal(again.duplicate, true);
  });
  await test('logging against another site\u2019s contact is refused', async function () {
    await call('POST', { action: 'site-save', id: SITE, name: 'The Elysian Apartments' }, PM);
    var other = await call('POST', { action: 'site-save', name: 'Other Site' }, PM);
    var c = await call('POST', { site: other.id, action: 'contact-save', name: 'Zed', email: 'zed@evcs.com' }, PM);
    await rejects(call('POST', { site: SITE, action: 'log', type: 'call', subject: 'x', contactId: c.id }, PM), 400, /not on this site/);
  });

  console.log('\ndocuments');
  await test('upload stores bytes under sitecrm/{org}/{siteId}/ and streams them back', async function () {
    var up = await call('POST', { site: SITE, action: 'file-upload', file: { name: 'rate.pdf', base64: PDF } }, PM);
    assert.equal(up.ok, true);
    var keys = Object.keys(store);
    assert.equal(keys.length, 1);
    assert.match(keys[0], new RegExp('^sitecrm/' + ORG + '/' + SITE + '/'));
    var r = res();
    await call('GET', { site: SITE, file: up.id }, PM, r);
    assert.ok(r.body.length > 0);
    assert.equal(r.headers['Content-Disposition'], 'attachment; filename="rate.pdf"');
    var dup = await call('POST', { site: SITE, action: 'file-upload', file: { name: 'rate.pdf', base64: PDF } }, PM);
    assert.equal(dup.duplicate, true);
    assert.equal(Object.keys(store).length, 1);
  });
  await test('a record pointing at another site\u2019s bytes is not served', async function () {
    var up = await call('POST', { site: SITE, action: 'file-upload', file: { name: 'x.pdf', base64: PDF } }, PM);
    db.seed(O + '/sites/' + SITE + '/files/evil', { orgId: ORG, siteId: SITE, name: 'evil.pdf', path: 'sitecrm/' + ORG + '/evcs-999/abc', uploadState: 'stored', archived: false });
    await rejects(quietly(async function () { await call('GET', { site: SITE, file: 'evil' }, PM, res()); }), 404);
    var gone = await call('POST', { site: SITE, action: 'file-archive', id: up.id }, BOSS);
    assert.equal(gone.ok, true);
    await rejects(call('GET', { site: SITE, file: up.id }, PM, res()), 404);
  });
  await test('malformed uploads are rejected before anything is stored', async function () {
    await rejects(quietly(async function () { await call('POST', { site: SITE, action: 'file-upload', file: { name: 'x.pdf', base64: '!!!' } }, PM); }), 400);
    await rejects(quietly(async function () { await call('POST', { site: SITE, action: 'file-upload', file: { name: 'x.exe', base64: b64('MZ fake binary') } }, PM); }), 400);
    assert.equal(Object.keys(store).length, 0);
  });

  console.log('\nimport mapping');
  await test('the import is idempotent on externalSiteIds.evcs', async function () {
    var a = imp.mapRow({ id: 335, name: 'A', city: 'LA', state: 'CA', term: 5, meter: true, installed: 100, peak: 95, rent: null, share: null, kwhshare: 0.05, reserve: 10, screen: 50, pods: 1 });
    var b = imp.mapRow({ id: 335, name: 'A', city: 'LA', state: 'CA', term: 5, meter: true, installed: 100, peak: 95, rent: null, share: null, kwhshare: 0.05, reserve: 10, screen: 50, pods: 1 });
    assert.equal(a.docId, b.docId);
    assert.deepEqual(a.externalSiteIds, { evcs: '335' });
    /* The seeded site already carries evcs:335, so a second run writes nothing. */
    var have = {};
    db.data.forEach(function (v, k) { var ids = (v.externalSiteIds || {}); if (ids.evcs) have[String(ids.evcs)] = true; });
    var fresh = [a, b].filter(function (m) { return !have[m.externalSiteIds.evcs]; });
    assert.equal(fresh.length, 0);
  });
  await test('import traps: blank meter stays unknown, whole-percent share becomes a fraction', async function () {
    var m = imp.mapRow({ id: 202, name: 'B', city: 'X', state: 'CA', term: null, meter: null, installed: 50, peak: null, rent: null, share: 6, kwhshare: null, reserve: 0, screen: 0, pods: 0 });
    assert.equal(m.meterOwned, null);
    assert.equal(m.flags.meterUnknown, true);
    assert.equal(m.commercial.revenueShare, 0.06);
    assert.equal(m.reportedPeakKw, null);
    assert.equal(m.peakUnresolved, false);
    assert.equal(m.termYearsRemaining, null);
    assert.equal(m.screening.label, 'EVCS legacy proxy v1');
    var over = imp.mapRow({ id: 9, name: 'C', city: 'X', state: 'CA', term: 1, meter: false, installed: 100, peak: 120, rent: null, share: null, kwhshare: null, reserve: 0, screen: 0, pods: 0 });
    assert.equal(over.flags.peakExceedsInstalled, true);
    assert.equal(over.reportedPeakKw, 120);
  });

  console.log('\npro forma');
  await test('the workbook case reproduces within 1e-7', async function () {
    var s = PF.runProforma({ pods: 1 }), r = s.results;
    assert.ok(Math.abs(r.projectIrr.annual - 0.00540787102343443) <= 1e-7, 'project IRR ' + r.projectIrr.annual);
    assert.ok(Math.abs(r.investorIrr.annual - 0.004339862118701632) <= 1e-7, 'investor IRR ' + r.investorIrr.annual);
    assert.equal(r.paybackMonth, 59);
    assert.equal(r.investorCapital, 2111375);
    assert.equal(s.assumptionVersion, 'omega-compute-v1');
    assert.equal(s.inputsHash.length, 64);
  });
  await test('no valid IRR root is Not defined, never 0%', async function () {
    var s = PF.runProforma({ pods: 1, overrides: { gpuPricePerHour: 0 } });
    assert.equal(s.results.investorIrr.defined, false);
    assert.equal(s.results.projectIrr.defined, false);
    var flows = PF.monthlyFlows(1, Object.assign({}, PF.ASSUMPTIONS, { gpuPricePerHour: 0 }));
    assert.equal(PF.irrMonthly(flows, 'investorCash'), null);
  });
  await test('a run is stored immutable; a re-run is a new scenario', async function () {
    var one = await call('POST', { site: SITE, action: 'proforma-run', pods: 2, label: 'first look' }, PM);
    assert.equal(one.ok, true);
    assert.equal(one.scenario.results.pods, 2);
    assert.equal(one.scenario.results.investorCapital, 4222750);
    var two = await call('POST', { site: SITE, action: 'proforma-run', pods: 2, label: 'first look' }, PM);
    assert.notEqual(two.scenario.scenarioId, one.scenario.scenarioId);
    assert.equal(two.scenario.inputsHash, one.scenario.inputsHash);
    var list = await call('GET', { site: SITE, action: 'proforma-get' }, PM);
    assert.equal(list.scenarios.length, 2);
    var get = await call('GET', { site: SITE }, PM);
    assert.equal(get.proforma.length, 2);
    assert.ok(audits('sitecrm-proforma-run').length >= 2);
  });
  await test('malformed pro forma input is rejected', async function () {
    await rejects(call('POST', { site: SITE, action: 'proforma-run', pods: 0 }, PM), 400, /Pods/);
    await rejects(call('POST', { site: SITE, action: 'proforma-run', pods: 'many' }, PM), 400, /Pods/);
    await rejects(call('POST', { site: SITE, action: 'proforma-run', pods: 1, discountRateAnnual: 5 }, PM), 400, /Discount rate/);
    await rejects(call('POST', { site: SITE, action: 'proforma-run', pods: 1, overrides: { billableUtilization: 2 } }, PM), 400);
    await rejects(call('POST', { site: SITE, action: 'proforma-run', pods: 1 }, VIEWER), 403);
  });
  await test('portfolio IRR aggregates dated cash flows, never averages', async function () {
    var a = PF.runProforma({ pods: 1 }), b = PF.runProforma({ pods: 3 });
    var agg = PF.portfolioIrr([a, b]);
    assert.equal(agg.defined, true);
    /* 1 pod + 3 pods of the same case = the 4-pod case, exactly. */
    var four = PF.runProforma({ pods: 4 });
    assert.ok(Math.abs(agg.annual - four.results.investorIrr.annual) < 1e-12);
    assert.equal(PF.portfolioIrr([]).defined, false);
  });

  console.log('\npower sizing and bulk import');
  await test('sizePodsFromPower fits whole pods at 90 kW each', async function () {
    var a = PF.assumptionSet('omega-compute-v1');
    assert.equal(a.version, 'omega-compute-v1');
    var sz = PF.sizePodsFromPower(1000, a);
    assert.equal(sz.pods, 11);
    assert.equal(sz.powerKwPerPod, 90);
    assert.equal(sz.powerKwUsed, 990);
    assert.equal(sz.headroomKw, 10);
    assert.equal(PF.sizePodsFromPower(89, a).pods, 0);
    assert.equal(PF.assumptionSet('evcs-compute-v1').version, 'evcs-compute-v1');
    assert.throws(function () { PF.assumptionSet('nope'); }, /Unknown assumption version/);
    assert.equal(PF.DEFAULT_ASSUMPTION_VERSION, 'omega-compute-v1');
  });
  await test('deriveAvailableKw prefers entered MW, else service-minus-peak', async function () {
    var d = PF.deriveAvailableKw({ availablePowerMw: 2 });
    assert.equal(d.kw, 2000);
    assert.equal(d.basis, 'direct');
    var d2 = PF.deriveAvailableKw({ serviceCapacityKw: 500, existingPeakKw: 120 });
    assert.equal(d2.kw, 380);
    assert.equal(d2.basis, 'service-minus-peak');
    assert.equal(PF.deriveAvailableKw({}).kw, null);
    assert.equal(PF.deriveAvailableKw({ serviceCapacityKw: 500 }).kw, null);
    assert.equal(PF.deriveAvailableKw({ availablePowerMw: 0, serviceCapacityKw: 500, existingPeakKw: 120 }).basis, 'service-minus-peak');
  });
  await test('proforma-run sizes pods from available power', async function () {
    await call('POST', { action: 'site-save', id: SITE, name: 'The Elysian Apartments', availablePowerMw: 1 }, PM);
    var r = await call('POST', { site: SITE, action: 'proforma-run', sizeFromPower: true, label: 'sized' }, PM);
    assert.equal(r.ok, true);
    assert.equal(r.scenario.results.pods, 11);
    assert.equal(r.scenario.results.sizing.powerKwAvailable, 1000);
    assert.equal(r.scenario.assumptionVersion, 'omega-compute-v1');
    var leg = await call('POST', { site: SITE, action: 'proforma-run', pods: 1, assumptionVersion: 'evcs-compute-v1' }, PM);
    assert.equal(leg.scenario.assumptionVersion, 'evcs-compute-v1');
    await rejects(call('POST', { site: SITE, action: 'proforma-run', sizeFromPower: true }, VIEWER), 403);
  });
  await test('proforma-run refuses sizeFromPower with no usable power', async function () {
    var other = await call('POST', { action: 'site-save', name: 'No Power Site' }, PM);
    await rejects(call('POST', { site: other.id, action: 'proforma-run', sizeFromPower: true }, PM), 400, /available power/);
  });
  await test('site-import validates every row before writing anything', async function () {
    var bad = await call('POST', { action: 'site-import', rows: [{ name: 'Good One', city: 'Austin', state: 'TX' }, { city: 'No Name' }] }, PM);
    assert.equal(bad.ok, false);
    assert.equal(bad.imported, 0);
    assert.equal(bad.errors[0].row, 2);
    var list = await call('GET', {}, PM);
    assert.equal(list.sites.length, 1);
    var good = await call('POST', { action: 'site-import', rows: [
      { name: 'Good One', city: 'Austin', state: 'TX', availablePowerMw: 2.5, meterOwned: 'true' },
      { name: 'Good Two', city: 'Dallas', state: 'TX', annualUsageKwh: 50000 }
    ] }, PM);
    assert.equal(good.ok, true);
    assert.equal(good.imported, 2);
    var list2 = await call('GET', {}, PM);
    assert.equal(list2.sites.length, 3);
    var one = list2.sites.filter(function (s) { return s.name === 'Good One'; })[0];
    assert.equal(one.availablePowerMw, 2.5);
    assert.equal(one.meterOwned, true);
    assert.ok(audits('sitecrm-import').length >= 2);
    await rejects(call('POST', { action: 'site-import', rows: [{ name: 'X' }] }, VIEWER), 403);
    await rejects(call('POST', { action: 'site-import', rows: [] }, PM), 400);
  });
  await test('the EVCS seed script refuses non-EVCS orgs', async function () {
    assert.equal(imp.checkSeedOrg('evcs.com', []), null);
    assert.match(imp.checkSeedOrg('acme.com', []), /Refusing/);
    assert.match(imp.checkSeedOrg('acme.com', ['--allow-other-org']), /WARNING/);
    assert.deepEqual(imp.EVCS_SEED_ORGS, ['evcs.com']);
  });

  console.log('\naudit');
  await test('every write is audited', async function () {
    await call('POST', { site: SITE, action: 'log', type: 'note', subject: 'n' }, PM);
    await call('POST', { site: SITE, action: 'proforma-run', pods: 1 }, PM);
    var acts = audits().map(function (a) { return a.action; });
    ['sitecrm-log', 'sitecrm-proforma-run'].forEach(function (x) { assert.ok(acts.indexOf(x) >= 0, 'missing audit ' + x); });
  });

  console.log('\n' + count + ' tests passed.');
})().catch(function (e) { console.error('FAIL', e); process.exit(1); });
