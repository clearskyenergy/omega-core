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
     · the EVCS intake is imported by the register (scripts/tests/
       tportfolioassets.js); the one mapping lives there
     · the pro forma reproduces the workbook case (tolerance 1e-7), reports
       "Not defined" when there is no IRR root (never 0%), and stores each
       run as an immutable scenario
     · every write is audited (action sitecrm-*)
   node scripts/test-site-crm.js
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
var FD = require('./_lib/firestore-double'), DB = FD.DB, mock = FD.mock;
var db, store = {}, failSave = false;
var A = { db: function () { return db; }, safeOrg: function (v) { return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(v || '') ? v : ''; }, httpError: function (s, m) { var e = new Error(m); e.status = s; return e; },
  authenticate: async function (r) { return r.caller; }, handler: function (f) { return f; },
  canActInOrg: async function (c, o) { return c.staff === true || c.orgId === o; }, isDegraded: function () { return false; },
  init: function () { throw new Error('the Admin SDK must not be reached in a test'); },
  FieldValue: function () { return { serverTimestamp: function () { return '2026-09-24T12:00:00Z'; } }; } };
mock('../api/_lib/admin', A);
/* no mailbox is reached: every send is recorded here */
var MAILS = [], MAIL_FAIL = false;
mock('../api/_lib/mail', { send: async function (to, subject, html, text, opts) { if (MAIL_FAIL) throw new Error('smtp down'); MAILS.push({ to: to, subject: subject, html: html, opts: opts }); return { ok: true }; }, esc: function (s) { return String(s == null ? '' : s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }, layout: function (t, b) { return '<title>' + t + '</title>' + b; }, row: function (k, v) { return '<tr><td>' + k + '</td><td>' + (v == null ? '\u2014' : v) + '</td></tr>'; } });
/* Nothing in the site CRM deletes a document: a delete fails the test. */
FD.Ref.prototype.delete = async function () { throw new Error('deleted ' + this.path); };
var bucket = { file: function (p) { return {
  save: async function (bytes, opts) { if (failSave) throw new Error('storage down'); assert.equal(opts.contentType, 'application/octet-stream'); store[p] = Buffer.from(bytes); },
  download: async function () { if (!store[p]) throw new Error('no such object ' + p); return [store[p]]; } }; } };
var I = require('../api/_lib/po-intake'); I.bucket = function () { return bucket; };
var PF = require('../api/_lib/proforma');
var siteCrm = require('../api/site-crm');

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

  console.log('\nthe register\u2019s actions: hand-offs, exports, archive');
  await test('the register says what the caller may do and carries each site\u2019s hand-offs and latest figures', async function () {
    var pm = await call('GET', {}, PM), vw = await call('GET', {}, VIEWER), bo = await call('GET', {}, BOSS);
    assert.equal(pm.canEdit, true); assert.equal(pm.canArchive, false);
    assert.equal(vw.canEdit, false); assert.equal(bo.canArchive, true);
    var s = pm.sites[0];
    assert.equal(s.projectId, null); assert.equal(s.finProjectId, null); assert.equal(s.archived, false); assert.equal(s.latestProforma, null);
    var run = await call('POST', { site: SITE, action: 'proforma-run', pods: 1, label: 'one' }, PM);
    assert.equal(run.latestProforma.investorCapital, 2111375);
    assert.equal(run.latestProforma.paybackMonth, 59);
    assert.equal(run.latestProforma.projectIrrDefined, true);
    var after = await call('GET', {}, PM);
    assert.equal(after.sites[0].latestProforma.scenarioId, run.scenario.scenarioId);
    assert.equal(after.sites[0].latestProforma.itKw, 75);
  });
  await test('send-to-editor makes ONE Site Map project per site, in the shape the editor reads, and never a second', async function () {
    await rejects(call('POST', { action: 'send-to-editor', ids: [SITE] }, VIEWER), 403);
    await rejects(call('POST', { action: 'send-to-editor', ids: [] }, PM), 400, /No sites/);
    await rejects(call('POST', { action: 'send-to-editor', ids: ['nope'] }, PM), 404, /register/);
    var one = await call('POST', { action: 'send-to-editor', ids: [SITE] }, PM);
    assert.equal(one.created, 1);
    var pid = one.projects[0].projectId, proj = db.data.get('projects/' + pid);
    assert.equal(proj.orgId, ORG); assert.equal(proj.uid, 'pm'); assert.equal(proj.ownerEmail, 'pm@evcs.com');
    assert.equal(proj.name, 'The Elysian Apartments'); assert.equal(proj.siteId, SITE); assert.equal(proj.stage, 'candidate');
    assert.deepEqual(proj.siteScopes, ['l2']); assert.equal(proj.type, 'l2');
    assert.deepEqual(proj.elements, []); assert.ok(proj.createdAt);
    assert.equal(db.data.get(O + '/sites/' + SITE).projectId, pid);
    var again = await call('POST', { action: 'send-to-editor', ids: [SITE, SITE] }, PM);
    assert.equal(again.created, 0); assert.equal(again.projects[0].projectId, pid);
    assert.equal(Array.from(db.data.keys()).filter(function (k) { return k.indexOf('projects/') === 0; }).length, 1);
    /* a site sized for pods opens the compute build too */
    await call('POST', { site: SITE, action: 'proforma-run', pods: 2 }, PM);
    var sized = await call('POST', { action: 'site-save', name: 'Sized', serviceCapacityKw: 500, existingPeakKw: 200, tags: ['dcfc'] }, PM);
    await call('POST', { site: sized.id, action: 'proforma-run', sizeFromPower: true }, PM);
    var two = await call('POST', { action: 'send-to-editor', ids: [sized.id] }, PM);
    assert.deepEqual(db.data.get('projects/' + two.projects[0].projectId).siteScopes, ['dcfc', 'compute']);
    assert.equal(audits('sitecrm-send-to-editor').length, 2);
  });
  await test('send-to-finance lists a sized site OPEN with the investor capital as the ask, drafts an unsized one, and never twice', async function () {
    var draft = await call('POST', { action: 'send-to-finance', ids: [SITE] }, PM);
    assert.equal(draft.drafted, 1); assert.equal(draft.opened, 0);
    var d = db.data.get('fin_projects/' + draft.deals[0].finProjectId);
    assert.equal(d.status, 'draft'); assert.equal(d.ask, null); assert.equal(d.developerUid, 'pm'); assert.equal(d.developerOrg, 'EVCS');
    assert.equal(d.orgId, ORG); assert.equal(d.siteId, SITE); assert.equal(d.type, 'compute'); assert.equal(d.submitterRole, 'developer');
    assert.equal(db.data.get(O + '/sites/' + SITE).finProjectStatus, 'draft');
    var sized = await call('POST', { action: 'site-save', name: 'Sized', availablePowerMw: 0.5 }, PM);
    await call('POST', { site: sized.id, action: 'proforma-run', sizeFromPower: true }, PM);
    var open = await call('POST', { action: 'send-to-finance', ids: [sized.id, SITE] }, PM);
    assert.equal(open.opened, 1); assert.equal(open.drafted, 0);
    var o = db.data.get('fin_projects/' + open.deals[0].finProjectId);
    assert.equal(o.status, 'open'); assert.equal(o.ask, 5 * 2111375); assert.equal(o.mw, 0.45); assert.equal(o.capacityKw, 375);
    assert.match(o.proformaSummary, /5 pod\(s\)/); assert.match(o.proformaSummary, /not a return promise/);
    assert.equal(open.deals[1].created, false);
    assert.equal(Array.from(db.data.keys()).filter(function (k) { return k.indexOf('fin_projects/') === 0; }).length, 2);
    await rejects(call('POST', { action: 'send-to-finance', ids: [SITE] }, VIEWER), 403);
  });
  await test('proforma-bulk sizes every selected site and names the one it cannot', async function () {
    var a = await call('POST', { action: 'site-save', name: 'A', availablePowerMw: 0.18 }, PM);
    var b = await call('POST', { action: 'site-save', name: 'B' }, PM);
    var r = await call('POST', { action: 'proforma-bulk', ids: [a.id, b.id], sizeFromPower: true, label: 'bulk' }, PM);
    assert.equal(r.ran.length, 1); assert.equal(r.ran[0].latestProforma.pods, 2);
    assert.equal(r.failed.length, 1); assert.equal(r.failed[0].siteId, b.id); assert.match(r.failed[0].error, /no usable available power/);
    assert.match(r.note, /1 scenario\(s\) saved; 1 site\(s\) could not be sized: B/);
    var fixed = await call('POST', { action: 'proforma-bulk', ids: [a.id, b.id], pods: 3 }, PM);
    assert.equal(fixed.ran.length, 2);
    assert.equal((await call('GET', { site: b.id }, PM)).site.latestProforma.pods, 3);
  });
  await test('archive hides, restore returns, tags add and remove, delete is an administrator\u2019s; nothing is guessed', async function () {
    var x = await call('POST', { action: 'site-save', name: 'X', tags: ['keep'] }, PM);
    await call('POST', { action: 'site-tag', ids: [x.id], add: 'funding, keep', remove: ['nothing'] }, PM);
    assert.deepEqual(db.data.get(O + '/sites/' + x.id).tags, ['keep', 'funding']);
    await call('POST', { action: 'site-tag', ids: [x.id], remove: ['keep'] }, PM);
    assert.deepEqual(db.data.get(O + '/sites/' + x.id).tags, ['funding']);
    await rejects(call('POST', { action: 'site-tag', ids: [x.id] }, PM), 400, /Name a tag/);
    var arch = await call('POST', { action: 'site-archive', ids: [x.id] }, PM);
    assert.equal(arch.count, 1);
    assert.equal((await call('GET', {}, PM)).sites.some(function (s) { return s.id === x.id; }), false);
    var withA = await call('GET', { archived: '1' }, PM);
    assert.equal(withA.sites.filter(function (s) { return s.id === x.id; })[0].archived, true);
    await call('POST', { action: 'site-restore', ids: [x.id] }, PM);
    assert.equal((await call('GET', {}, PM)).sites.some(function (s) { return s.id === x.id; }), true);
    await rejects(call('POST', { action: 'site-delete', ids: [x.id] }, PM), 403, /administrator/);
    FD.Ref.prototype.delete = async function () { db.data.delete(this.path); };
    try { var del = await call('POST', { action: 'site-delete', ids: [x.id] }, BOSS); assert.equal(del.count, 1); assert.equal(db.data.has(O + '/sites/' + x.id), false); }
    finally { FD.Ref.prototype.delete = async function () { throw new Error('deleted ' + this.path); }; }
    assert.equal(audits('sitecrm-site-delete')[0].was.name, 'X');
    ['sitecrm-site-tag', 'sitecrm-site-archive', 'sitecrm-site-restore'].forEach(function (k) { assert.ok(audits(k).length, k); });
  });
  await test('the SPV term sheet is a PDF composed from the record and the latest scenario, a draft that invents nothing', async function () {
    var G = require('../api/_lib/site-agreement');
    var bare = G.compose({ site: { id: 's', name: 'Bare Site' }, scenario: null, org: ORG, workspaceName: 'EVCS', now: '2026-10-11T12:00:00Z' });
    assert.equal(bare.ready, false);
    var proj = bare.sections.filter(function (x) { return /The project/.test(x.heading); })[0];
    assert.equal(proj.rows.filter(function (r) { return r[0] === 'Investor capital'; })[0][1], 'Not provided');
    assert.ok(bare.conditions.some(function (c) { return /No pro forma scenario is on file/.test(c); }));
    assert.ok(bare.conditions.some(function (c) { return /Meter ownership .* unknown/.test(c); }));
    assert.equal(bare.fileName, 'SPV-term-sheet-Bare-Site-2026-10-11.pdf');
    assert.ok(!/\d%|\$\d/.test(JSON.stringify(proj)), 'no figure is invented for an unsized site');
    var run = await call('POST', { site: SITE, action: 'proforma-run', pods: 1, label: 'for the sheet' }, PM);
    var sheet = G.compose({ site: Object.assign({ id: SITE }, db.data.get(O + '/sites/' + SITE)), scenario: db.data.get(O + '/sites/' + SITE + '/proforma/' + run.scenario.scenarioId), org: ORG, workspaceName: 'EVCS' });
    assert.equal(sheet.ready, true);
    var rows = sheet.sections[2].rows;
    assert.equal(rows.filter(function (r) { return r[0] === 'Investor capital'; })[0][1], '$2,111,375');
    assert.equal(rows.filter(function (r) { return r[0] === 'Capital recovered'; })[0][1], 'month 59');
    assert.equal(rows.filter(function (r) { return r[0] === 'Assumption set'; })[0][1], 'omega-compute-v1');
    assert.ok(sheet.conditions.some(function (c) { return /unresolved workbook statistic/.test(c); }));
    var r = res(); await call('GET', { site: SITE, agreement: '1' }, PM, r);
    assert.equal(r.headers['Content-Type'], 'application/pdf');
    assert.match(r.headers['Content-Disposition'], /SPV-term-sheet-The-Elysian-Apartments-/);
    assert.equal(r.headers['X-Omega-Agreement'], 'ready');
    assert.equal(Buffer.from(r.body.slice(0, 5)).toString(), '%PDF-');
    assert.ok(r.body.length > 3000);
    assert.equal(audits('sitecrm-agreement-export').length, 1);
    await rejects(call('GET', { site: SITE, agreement: '1' }, RIVAL), 403);
  });

  console.log('\nthe compute model, the capital request and the funding');
  await test('the site is mapped to the Compute Site Pro Forma by one rule: what is missing is named, nothing is defaulted', async function () {
    var SM = require('../api/_lib/site-model');
    var bare = SM.inputFor({ name: 'Bare' }, {}, {});
    assert.equal(bare.ok, false); assert.equal(bare.missing.length, 3);
    assert.match(bare.missing[0], /ZIP/); assert.match(bare.missing[1], /service capacity/); assert.match(bare.missing[2], /pod count/);
    var ok = SM.inputFor({ name: 'Riverside', city: 'Oakland', zip: '94607', serviceCapacityKw: 400, installedKw: 120, annualUsageKwh: 410000, powerPricePerKwh: 0.17, latestProforma: { pods: 3 }, commercial: { rentMonthly: 1000 } }, {}, { orgName: 'EVCS' });
    assert.equal(ok.ok, true);
    assert.deepEqual(ok.input.service, { kw: 400 }); assert.deepEqual(ok.input.compute, { pods: 3, gpuClass: 'h200' });
    assert.deepEqual(ok.input.ev, { ports: 10, kwPerPort: 11.5, existing: true, pattern: 'overnight' });
    assert.deepEqual(ok.input.tariff, { onPeakRate: 0.17, offPeakRate: 0.17 }); assert.equal(ok.input.deal.rentPerYear, 12000);
    assert.equal(ok.input.site.sponsor, 'EVCS'); assert.equal(ok.basis.pods, 'pod pro forma');
    var avail = SM.inputFor({ zip: '94607', availablePowerMw: 0.3, existingPeakKw: 150, screening: { pods: 2 }, tags: ['dcfc'], installedKw: 300 }, { structure: 'infra', gpuClass: 'b300' }, {});
    assert.equal(avail.input.service.kw, 450); assert.equal(avail.input.service.loadingPct, 100); assert.equal(avail.input.ev.kwPerPort, 150); assert.equal(avail.input.ev.ports, 2);
    assert.equal(avail.input.deal.structure, 'infra'); assert.equal(avail.input.compute.gpuClass, 'b300'); assert.equal(avail.basis.pods, 'screening proxy');
    assert.equal(SM.askOf({}), null);
    assert.equal(SM.askOf({ latestProforma: { investorCapital: 100, pods: 1 } }).source, 'pod-proforma');
    assert.equal(SM.askOf({ latestProforma: { investorCapital: 100 }, latestModel: { totalProjectCost: 500 } }).amount, 500);
  });
  await test('site-model runs the one finance engine on the site, stores the answer whole and its figures on the site, and asks the compute gate', async function () {
    await rejects(call('POST', { site: SITE, action: 'site-model' }, PM), 400, /ZIP code.*service capacity.*pod count/);
    await rejects(call('POST', { site: SITE, action: 'site-model', zip: '90012', pods: 2 }, PM), 400, /service capacity/);
    await call('POST', { action: 'site-save', id: SITE, name: 'The Elysian Apartments', city: 'Los Angeles', state: 'CA', serviceCapacityKw: 400, installedKw: 100, annualUsageKwh: 380000, powerPricePerKwh: 0.19 }, PM);
    await rejects(call('POST', { site: SITE, action: 'site-model', zip: '90012', pods: 2 }, VIEWER), 403);
    var run = await call('POST', { site: SITE, action: 'site-model', zip: '90012', pods: 2, label: 'two pods' }, PM);
    assert.equal(run.ok, true); assert.ok(/^m_/.test(run.modelId));
    var lm = run.latestModel;
    assert.equal(lm.pods, 2); assert.equal(lm.structure, 'own'); assert.equal(lm.gpuClass, 'h200');
    assert.ok(lm.totalProjectCost > 4000000, 'total project cost ' + lm.totalProjectCost); assert.equal(typeof lm.irr, 'number');
    assert.equal(lm.equity, lm.totalProjectCost); assert.equal(lm.debt, 0); assert.equal(lm.termYears, 10);
    assert.ok(lm.verdict.label); assert.ok(lm.deals.infra && lm.deals.lease); assert.equal(lm.zip, '90012');
    assert.equal(run.result.proforma.metrics.afterTaxIrr, lm.irr); assert.ok(run.brand);
    var site = db.data.get(O + '/sites/' + SITE);
    assert.equal(site.zip, '90012'); assert.equal(site.latestModel.modelId, run.modelId);
    var stored = db.data.get(O + '/sites/' + SITE + '/models/' + run.modelId);
    assert.equal(stored.input.compute.pods, 2); assert.equal(stored.result.proforma.sourcesUses.totalUses, lm.totalProjectCost); assert.equal(stored.basis.service, 'service capacity on record');
    var got = await call('GET', { site: SITE, model: '1' }, PM);
    assert.equal(got.model.id, run.modelId); assert.equal(got.model.result.structure.key, 'own'); assert.ok(got.brand && got.brand.name !== undefined);
    assert.equal((await call('GET', {}, PM)).sites[0].latestModel.totalProjectCost, lm.totalProjectCost);
    /* a lease structure invests no capital: no IRR, said by null, never 0 */
    var lease = await call('POST', { site: SITE, action: 'site-model', structure: 'lease', pods: 2 }, PM);
    assert.equal(lease.latestModel.irr, null); assert.equal(lease.latestModel.structure, 'lease');
    assert.ok(audits('sitecrm-site-model').length >= 2);
    /* the gate: a packaged workspace without Omega Compute is refused */
    db.seed(O + '/billing/current', { packaged: true, packagingState: 'paid', accessUntil: Date.now() + 86400000, modules: ['lite'] });
    await rejects(call('POST', { site: SITE, action: 'site-model', pods: 2 }, PM), 403, /not in your package/);
    var ok2 = await call('POST', { site: SITE, action: 'site-model', pods: 2 }, STAFF);
    assert.equal(ok2.ok, true);
  });
  await test('the capital request is the total project cost, sent as the ask; an accepted deal reads Funded on the register', async function () {
    await call('POST', { action: 'site-save', id: SITE, name: 'The Elysian Apartments', serviceCapacityKw: 400, installedKw: 100, zip: '90012' }, PM);
    await call('POST', { site: SITE, action: 'proforma-run', pods: 1 }, PM);
    var run = await call('POST', { site: SITE, action: 'site-model', pods: 2 }, PM), cost = run.latestModel.totalProjectCost;
    var sent = await call('POST', { action: 'send-to-finance', ids: [SITE] }, PM);
    assert.equal(sent.opened, 1);
    var d = db.data.get('fin_projects/' + sent.deals[0].finProjectId);
    assert.equal(d.ask, cost); assert.equal(d.costBasis, cost); assert.equal(d.status, 'open');
    assert.equal(d.capitalRequest.source, 'compute-model'); assert.equal(d.capitalRequest.amount, cost); assert.equal(d.capitalRequest.structure, 'own'); assert.equal(d.sourceModelId, run.modelId);
    assert.match(d.proformaSummary, /total project cost \$/); assert.match(d.proformaSummary, /after-tax IRR/);
    var reg = await call('GET', {}, PM), row = reg.sites.filter(function (s) { return s.id === SITE; })[0];
    assert.equal(row.capital.status, 'open'); assert.equal(row.capital.funded, false); assert.equal(row.capital.ask, cost); assert.equal(row.capital.request.source, 'compute-model');
    db.data.set('fin_projects/' + sent.deals[0].finProjectId, Object.assign({}, d, { status: 'awarded', awardedTo: 'partner-uid', awardedToOrg: 'Ridgeline Capital', offerCount: 2, awardedAt: '2026-10-12T00:00:00Z' }));
    var reg2 = await call('GET', {}, PM), row2 = reg2.sites.filter(function (s) { return s.id === SITE; })[0];
    assert.equal(row2.capital.funded, true); assert.equal(row2.capital.awardedToOrg, 'Ridgeline Capital'); assert.equal(row2.capital.offerCount, 2);
    var one = await call('GET', { site: SITE }, PM);
    assert.equal(one.site.capital.funded, true);
    db.data.delete('fin_projects/' + sent.deals[0].finProjectId);
    assert.equal((await call('GET', {}, PM)).sites.filter(function (s) { return s.id === SITE; })[0].capital.status, 'missing');
  });
  await test('site-model-bulk runs ten at most and names the site it cannot model', async function () {
    var a = await call('POST', { action: 'site-save', name: 'A', zip: '60601', serviceCapacityKw: 500, screening: { pods: 1 } }, PM);
    var b = await call('POST', { action: 'site-save', name: 'B' }, PM);
    var r = await call('POST', { action: 'site-model-bulk', ids: [a.id, b.id], pods: 1 }, PM);
    assert.equal(r.ran.length, 1); assert.equal(r.failed.length, 1); assert.equal(r.failed[0].name, 'B'); assert.match(r.failed[0].error, /ZIP/);
    assert.match(r.note, /1 compute model\(s\) run; 1 site\(s\) could not be modelled: B/);
    var many = []; for (var i = 0; i < 11; i++) many.push((await call('POST', { action: 'site-save', name: 'S' + i }, PM)).id);
    await rejects(call('POST', { action: 'site-model-bulk', ids: many, pods: 1 }, PM), 400, /at most 10/);
  });

  console.log('\nthe solar partner');
  await test('send-to-partner mails Terra Energy the site facts and figures, records it on the site, caps the day, and refuses with no address', async function () {
    var P = require('../api/_lib/partners');
    assert.deepEqual(P.recipients('terra', {}, {}), { to: [], source: null });
    assert.deepEqual(P.recipients('terra', { TERRA_ENERGY_EMAIL: 'solar@terra.example, ops@terra.example' }, {}), { to: ['solar@terra.example', 'ops@terra.example'], source: 'TERRA_ENERGY_EMAIL' });
    assert.deepEqual(P.recipients('terra', {}, { orgs: { terra: ['pkg@terra.example'] } }).to, ['pkg@terra.example']);
    MAILS = [];
    await rejects(call('POST', { action: 'send-to-partner', ids: [SITE], partner: 'nobody' }, PM), 400, /Which partner/);
    await rejects(call('POST', { action: 'send-to-partner', ids: [SITE], partner: 'terra' }, PM), 409, /no address/);
    assert.equal(MAILS.length, 0, 'nothing mailed without an address');
    db.seed('fin_settings/dealroom', { orgs: { terra: ['solar@terra.example'] } });
    await call('POST', { action: 'site-save', id: SITE, name: 'The Elysian Apartments', city: 'Los Angeles', state: 'CA', serviceCapacityKw: 400, installedKw: 100, zip: '90012', powerPricePerKwh: 0.19 }, PM);
    await call('POST', { site: SITE, action: 'site-model', pods: 2 }, PM);
    await rejects(call('POST', { action: 'send-to-partner', ids: [SITE], partner: 'terra' }, VIEWER), 403);
    var r = await call('POST', { action: 'send-to-partner', ids: [SITE], partner: 'terra', note: 'Roof is 40,000 sq ft, south facing.' }, PM);
    assert.equal(r.sent.length, 1); assert.equal(r.sent[0].status, 'sent'); assert.deepEqual(r.to, ['solar@terra.example']); assert.match(r.note, /sent to Terra Energy/);
    assert.equal(MAILS.length, 1); assert.equal(MAILS[0].to, 'solar@terra.example'); assert.equal(MAILS[0].opts.cc, 'pm@evcs.com'); assert.equal(MAILS[0].opts.replyTo, 'pm@evcs.com');
    assert.match(MAILS[0].subject, /\[EVCS\] Terra Energy: The Elysian Apartments, Los Angeles, CA/);
    assert.match(MAILS[0].html, /Roof is 40,000 sq ft/); assert.match(MAILS[0].html, /400 kW/); assert.match(MAILS[0].html, /Total project cost/); assert.match(MAILS[0].html, /Not provided/); assert.ok(!/undefined|NaN/.test(MAILS[0].html));
    assert.match(MAILS[0].html, /site-crm\.html\?site=/);
    var site = db.data.get(O + '/sites/' + SITE);
    assert.equal(site.partners.terra.status, 'sent'); assert.deepEqual(site.partners.terra.to, ['solar@terra.example']);
    var reqs = []; db.data.forEach(function (v, k) { if (k.indexOf(O + '/partner_requests/') === 0 && v.partner) reqs.push(v); });
    assert.equal(reqs.length, 1); assert.equal(reqs[0].packet.compute.pods, 2); assert.equal(reqs[0].packet.power.serviceCapacityKw, 400);
    assert.equal((await call('GET', {}, PM)).sites[0].partners.terra.status, 'sent');
    assert.equal(audits('sitecrm-send-to-partner').length, 1);
    var today = new Date().toISOString().slice(0, 10);
    db.seed(O + '/partner_requests/count_' + today, { count: 25 });
    await rejects(call('POST', { action: 'send-to-partner', ids: [SITE], partner: 'terra' }, PM), 429, /25 sites a day/);
    db.seed(O + '/partner_requests/count_' + today, { count: 0 });
    MAIL_FAIL = true;
    await rejects(call('POST', { action: 'send-to-partner', ids: [SITE], partner: 'terra' }, PM), 502, /could not be sent/);
    MAIL_FAIL = false;
  });


  console.log('\nproject type');
  await test('a site declares what KIND of project it is: the Site Map scope keys, judged by the one type table, carried onto the project it makes', async function () {
    var made = await call('POST', { action: 'site-save', name: 'Sunnyside', siteScopes: ['der', 'bess'] }, PM);
    assert.deepEqual(made.site.siteScopes, ['der', 'bess']);
    await rejects(call('POST', { action: 'site-save', name: 'X', siteScopes: ['warehouse'] }, PM), 400, /not one the platform knows/);
    await rejects(call('POST', { action: 'site-save', name: 'X', siteScopes: ['l2', 'dcfc', 'bess', 'der', 'compute', 'microgrid', 'building', 'solar'] }, PM), 400, /At most/);
    var kept = await call('POST', { action: 'site-save', id: made.id, name: 'Sunnyside', city: 'Torrance' }, PM);
    assert.deepEqual(kept.site.siteScopes, ['der', 'bess'], 'a save that does not mention the type leaves it alone');
    assert.equal(kept.site.city, 'Torrance');
    var more = await call('POST', { action: 'site-save', id: made.id, name: 'Sunnyside', siteScopes: 'solar, BESS, l2, bess' }, PM);
    assert.deepEqual(more.site.siteScopes, ['solar', 'bess', 'l2'], 'a comma list, lower-cased, unique; an alias the table knows is kept as typed');
    var cleared = await call('POST', { action: 'site-save', id: made.id, name: 'Sunnyside', siteScopes: [] }, PM);
    assert.deepEqual(cleared.site.siteScopes, []);
    assert.deepEqual((await call('GET', { site: made.id }, PM)).site.siteScopes, []);
    /* the project the site makes opens on what was declared */
    await call('POST', { action: 'site-save', id: made.id, name: 'Sunnyside', siteScopes: ['der', 'bess'] }, PM);
    var sent = await call('POST', { action: 'send-to-editor', ids: [made.id] }, PM);
    var proj = db.data.get('projects/' + sent.projects[0].projectId);
    assert.deepEqual(proj.siteScopes, ['der', 'bess']); assert.equal(proj.type, 'solar');
    /* a site registered before the picker still derives its scopes from its facts */
    var old = await call('POST', { action: 'send-to-editor', ids: [SITE] }, PM);
    assert.ok(db.data.get('projects/' + old.projects[0].projectId).siteScopes.length >= 1);
    /* an import sheet may carry it; a row without the column stores nothing for it */
    await call('POST', { action: 'site-import', rows: [{ name: 'Imp A', siteScopes: ['l2'] }, { name: 'Imp B' }] }, PM);
    var byName = {}; db.data.forEach(function (v, k) { if (k.indexOf(O + '/sites/') === 0 && k.split('/').length === 4) byName[v.name] = v; });
    assert.deepEqual(byName['Imp A'].siteScopes, ['l2']); assert.equal('siteScopes' in byName['Imp B'], false);
  });
  await test('the pages carry the picker: Register site is a dialog with the type cards, the register filters and labels by type, the site page shows it and edits it', async function () {
    var pf = fs.readFileSync(path.join(__dirname, '..', 'portfolio.html'), 'utf8'), sc = fs.readFileSync(path.join(__dirname, '..', 'site-crm.html'), 'utf8');
    assert.match(pf, /<script src="\/omega-newproject\.js">/, 'the cards are the New project dialog’s own list');
    assert.match(pf, /OmegaNewProject\.SCOPES/); assert.ok(!/window\.prompt\('Site name/.test(pf), 'no prompt');
    assert.match(pf, /id="reg-overlay"|reg-overlay'/); assert.match(pf, /class="reg-kind"/); assert.match(pf, /siteScopes: picked/);
    assert.match(pf, /id="f-kind"/); assert.match(pf, /kindLabels\(s\)\.join/);
    assert.match(sc, /<script src="\/omega-newproject\.js">/); assert.match(sc, /ef-kind-/); assert.match(sc, /siteScopes: kindsChecked\(\)/); assert.match(sc, /Project type/);
    new Function(pf.split('<script>').pop().split('</script>')[0]); new Function(sc.split('<script>').pop().split('</script>')[0]);
  });

  console.log('\nthe Site Map design');
  await test('what Site Map drew and ran is read onto the site when it opens, once per change, and both IRRs run on it', async function () {
    var DR = require('../api/_lib/portfolio/design-read');
    assert.equal(DR.designOf({ name: 'empty' }, 'p0'), null, 'a project with no drawing and no run is no design');
    var PRJ = { orgId: ORG, name: 'Sunnyside', capex: 1840000, incentive: 120000, annualRevenue: 310000, capexAt: '2026-10-12T15:00:00Z', capexSource: 'site-map', bessKw: 250, bessKwh: 1000,
      omegaCore: { verdict: 'qualified', units: 1, at: '2026-10-12T15:10:00Z' },
      shapes: [
        { kind: 'derdc', kw: 75 }, { kind: 'derdc', kw: 75 }, { kind: 'derdc', kw: 75 }, { kind: 'derdc', kw: 75 }, { kind: 'derdc', kw: 75, omegaCore: true, bessKw: 60, bessKwh: 61 },
        { kind: 'evl2', kw: 11.5, ports: 2 }, { kind: 'evl2', kw: 11.5, ports: 2 }, { kind: 'evpost', kw: 150, ports: 2 }, { kind: 'evl2', kw: 11.5, ports: 2, evFuture: true },
        { kind: 'dersolar', kw: 350 }, { kind: 'bespad', kw: 250, kwh: 1000 }
      ],
      elements: [{ type: 'evgear', evKind: 'charger', evLevel: 'L2', units: 2, kw: 11.5, ports: 2 }, { type: 'evgear', evKind: 'charger', kw: 150, ports: 2, label: 'FUTURE phase 2' }] };
    db.seed('projects/p_design', PRJ);
    db.seed('projects/p_other', Object.assign({}, PRJ, { orgId: 'joules.example' }));
    var d = DR.designOf(PRJ, 'p_design');
    assert.equal(d.compute.units, 5); assert.equal(d.compute.kwIt, 375); assert.equal(d.compute.omegaCoreUnits, 1); assert.equal(d.compute.omegaCoreBessKwh, 61);
    assert.equal(d.chargers.l2Units, 4); assert.equal(d.chargers.dcfcUnits, 1); assert.equal(d.chargers.installedKw, 196); assert.equal(d.chargers.ports, 8, 'two L2 shapes, one DCFC, a dual L2 pedestal');
    assert.equal(d.chargers.futureUnits, 2, 'a future-flagged stall and a FUTURE-labelled charger are counted apart');
    assert.deepEqual(d.bess, { kw: 250, kwh: 1000, basis: 'run rollup' }); assert.equal(d.solar.kwDc, 350);
    assert.equal(d.capex, 1840000); assert.equal(d.capexSource, 'site-map'); assert.equal(d.omegaCore.verdict, 'qualified');
    assert.equal(DR.designOf({ shapes: [{ kind: 'derdc', kw: 75 }] }, 'p').capex, null, 'a project nobody ran has no capex, not 0');
    assert.equal(DR.designOf({ shapes: [{ kind: 'bespad', kw: 100, kwh: 200 }] }, 'p').bess.basis, 'pads drawn');
    assert.match(DR.line(d), /5 compute units .*196 kW of chargers.*1000 kWh battery.*350 kW-dc solar.*cost run \$1,840,000/);
    /* the site opens: the design is read once and kept */
    await call('POST', { action: 'site-save', id: SITE, name: 'The Elysian Apartments', siteScopes: ['compute', 'bess'] }, PM);
    db.data.get(O + '/sites/' + SITE).projectId = 'p_design';
    var page = await call('GET', { site: SITE }, PM);
    assert.equal(page.site.latestDesign.compute.units, 5); assert.equal(page.site.latestDesign.capex, 1840000); assert.ok(page.site.latestDesign.syncedAt);
    var hash1 = db.data.get(O + '/sites/' + SITE).latestDesign.hash, synced1 = db.data.get(O + '/sites/' + SITE).latestDesign.syncedAt;
    await call('GET', { site: SITE }, PM);
    assert.equal(db.data.get(O + '/sites/' + SITE).latestDesign.syncedAt, synced1, 'an unchanged drawing is not rewritten');
    db.data.get('projects/p_design').capex = 1900000;
    var again = await call('GET', { site: SITE }, PM);
    assert.equal(again.site.latestDesign.capex, 1900000); assert.notEqual(again.site.latestDesign.hash, hash1);
    /* another workspace's project is never read */
    var other = await call('POST', { action: 'site-save', name: 'Other', siteScopes: ['compute'] }, PM);
    db.data.get(O + '/sites/' + other.id).projectId = 'p_other';
    assert.equal((await call('GET', { site: other.id }, PM)).site.latestDesign, null);
    /* the pod pro forma runs on the units placed and the cost run, unless told otherwise */
    var run = await call('POST', { site: SITE, action: 'proforma-run' }, PM);
    /* the skid is ClearSky's and the cost run never counts it: its capital is the skid as recorded ($764,000), the host's cost run stands for the four pods beside it */
    assert.equal(run.scenario.results.pods, 5); assert.equal(run.scenario.results.investorCapital, 1900000 + 764000); assert.equal(run.scenario.results.capexBasis, '1 Omega-Core skid as recorded ($764,000 each) + Site Map cost run of 2026-10-12');
    assert.equal(run.latestProforma.capexBasis, '1 Omega-Core skid as recorded ($764,000 each) + Site Map cost run of 2026-10-12'); assert.equal(run.latestProforma.investorCapital, 2664000);
    assert.equal(run.scenario.inputs.designHash, db.data.get(O + '/sites/' + SITE).latestDesign.hash);
    var typed = await call('POST', { site: SITE, action: 'proforma-run', pods: 2 }, PM);
    assert.equal(typed.scenario.results.pods, 2); assert.equal(typed.scenario.results.capexBasis, 'assumption set');
    var units = await call('POST', { site: SITE, action: 'proforma-run', fromDesign: true, useDesignCapex: false }, PM);
    assert.equal(units.scenario.results.pods, 5); assert.equal(units.scenario.results.capexBasis, 'assumption set');
    await call('POST', { action: 'site-save', id: SITE, name: 'The Elysian Apartments', serviceCapacityKw: 900, existingPeakKw: 100 }, PM);
    var sized = await call('POST', { site: SITE, action: 'proforma-run', sizeFromPower: true }, PM);
    assert.equal(sized.scenario.results.sizing.basis, 'service-minus-peak', 'sizing from power still sizes from power');
    db.data.get('projects/p_design').capex = null;
    var noRun = await call('GET', { site: SITE }, PM);
    assert.equal(noRun.site.latestDesign.capex, null);
    var unpriced = await call('POST', { site: SITE, action: 'proforma-run' }, PM);
    assert.equal(unpriced.scenario.results.pods, 5); assert.equal(unpriced.scenario.results.capexBasis, '1 Omega-Core skid as recorded ($764,000 each)', 'the skid keeps its recorded price when nobody ran the cost; the pods beside it have none');
    assert.equal(unpriced.scenario.results.investorCapital, 764000);
    db.data.get('projects/p_design').shapes = db.data.get('projects/p_design').shapes.filter(function (x) { return !x.omegaCore; });
    await call('GET', { site: SITE }, PM);
    var noSkid = await call('POST', { site: SITE, action: 'proforma-run' }, PM);
    assert.equal(noSkid.scenario.results.pods, 4); assert.equal(noSkid.scenario.results.capexBasis, 'assumption set', 'units from the drawing, capex from the set when nobody ran the cost and no skid is on it');
    db.data.get('projects/p_design').shapes = PRJ.shapes;
    /* the compute model takes the chargers, the battery, the solar and the cost from the design */
    var SM = require('../api/_lib/site-model');
    var mapped = SM.inputFor({ zip: '94607', serviceCapacityKw: 900, latestDesign: Object.assign({}, d, { capex: 1840000 }) }, {}, {});
    /* the host's case: its four pods on its service; the skid on the design is on its own meter and said so */
    assert.equal(mapped.ok, true); assert.equal(mapped.input.compute.pods, 4); assert.match(mapped.basis.pods, /^Site Map design \(its 1 Omega-Core skid on its own meter/); assert.match(mapped.basis.skids, /1 Omega-Core skid on the design is on its own meter/);
    assert.deepEqual(mapped.input.battery, { kw: 250, kwh: 1000 }); assert.deepEqual(mapped.input.solar, { kwdc: 350 });
    assert.equal(mapped.input.ev.ports, 8); assert.equal(mapped.input.ev.kwPerPort, 24.5); assert.match(mapped.basis.chargers, /as drawn in Site Map/);
    assert.equal(mapped.input.capex.total, 1840000); assert.match(mapped.input.capex.basis, /Site Map cost run of 2026-10-12/);
    var alone = SM.inputFor({ zip: '94607', serviceCapacityKw: 900, installedKw: 100, screening: { pods: 2 }, latestDesign: d }, { useDesign: false }, {});
    assert.equal(alone.input.compute.pods, 2); assert.equal(alone.input.capex, undefined); assert.deepEqual(alone.input.battery, { kw: 0, kwh: 0 });
    var typedPods = SM.inputFor({ zip: '94607', serviceCapacityKw: 900, latestDesign: d }, { pods: 3 }, {});
    assert.equal(typedPods.input.compute.pods, 3); assert.equal(typedPods.basis.pods, 'entered');
    db.data.get('projects/p_design').capex = 1840000;
    await call('POST', { action: 'site-save', id: SITE, name: 'The Elysian Apartments', zip: '90012', serviceCapacityKw: 900, existingPeakKw: 100 }, PM);
    await call('GET', { site: SITE }, PM);
    var model = await call('POST', { site: SITE, action: 'site-model', label: 'on the design' }, PM);
    assert.equal(model.latestModel.pods, 4); assert.equal(model.latestModel.capex, 1840000, 'the model’s capex is the cost run');
    assert.equal(model.basis.capex, 'Site Map cost run of 2026-10-12'); assert.match(model.basis.design, /Site Map design/);
    assert.ok(model.result.proforma.capexScale && model.result.proforma.capexScale.to === 1840000);
    assert.equal(model.latestModel.designHash, db.data.get(O + '/sites/' + SITE).latestDesign.hash, 'the run records the design it stood on'); assert.equal(model.latestModel.auto, false);
    var catalog = await call('POST', { site: SITE, action: 'site-model', useDesign: false, pods: 2 }, PM);
    assert.equal(catalog.latestModel.pods, 2); assert.notEqual(catalog.latestModel.capex, 1840000);
    /* the register's bulk sync, and a site with no project */
    var bulk = await call('POST', { action: 'design-sync', ids: [SITE, other.id] }, PM);
    assert.equal(bulk.synced, 2); assert.equal(bulk.noProject, 0); assert.equal(audits('sitecrm-design-sync').length, 2);
    var fresh = await call('POST', { action: 'site-save', name: 'Fresh' }, PM);
    var none = await call('POST', { action: 'design-sync', ids: [fresh.id] }, PM);
    assert.equal(none.noProject, 1); assert.match(none.note, /not designed yet/);
    await rejects(call('POST', { action: 'design-sync', ids: [SITE] }, VIEWER), 403);
  });
  await test('an Omega-Core skid on the design runs the compute model by itself: the ZIP off the address, the skid on its own meter and its own numbers, once per design', async function () {
    var OC = require('../api/_lib/omega-core');
    var SKID = { orgId: ORG, name: 'Topanga Terrace', address: '22125 Roscoe Blvd, Canoga Park, CA 91304', capex: 918000, incentive: 0, annualRevenue: 61000, capexAt: '2026-10-13T19:35:00Z', capexSource: 'site-map', bessKw: 500, bessKwh: 2000,
      shapes: [{ kind: 'derdc', kw: 75, omegaCore: true, bessKw: 60, bessKwh: 61.44 }, { kind: 'dersolar', kw: 368 }, { kind: 'bespad', kw: 500, kwh: 2000 }], elements: [] };
    db.seed('projects/p_skid', SKID);
    var made = await call('POST', { action: 'site-save', name: 'Topanga Terrace', city: 'Canoga Park', state: 'CA', address: '22125 Roscoe Blvd, Canoga Park, CA 91304', siteScopes: ['der', 'bess'] }, PM);
    db.data.get(O + '/sites/' + made.id).projectId = 'p_skid';
    /* a viewer's open sets it off too: it is the system reading the design, not the viewer writing */
    var page = await call('GET', { site: made.id }, VIEWER), s = page.site, lm = s.latestModel;
    assert.ok(lm, 'the model ran on the open'); assert.equal(page.autoModel.modelId, lm.modelId); assert.equal(lm.auto, true); assert.equal(lm.designHash, s.latestDesign.hash); assert.equal(lm.label, 'Site Map design');
    assert.equal(lm.pods, 1); assert.equal(lm.skid.units, 1); assert.equal(lm.skid.chipset, 'h100'); assert.equal(lm.skid.gpus, 48); assert.equal(lm.skid.systemCostUsd, OC.PRODUCT.systemCostUsd); assert.equal(lm.skid.priceBasis, 'spot');
    assert.match(lm.gpuName, /^Omega-Core skid/); assert.equal(lm.zip, '91304', 'the ZIP read off the address'); assert.equal(s.zip, '91304', 'and kept on the site');
    /* THE WHOLE PROJECT (2026-10-14): the skid as recorded with the model's own
       site costs, PLUS the host's own solar and storage as the Site Map run
       priced them; the host's system earns the run's revenue until a PPA is on
       record, and the IRR is of the whole */
    assert.ok(lm.computeCapex > 900000 && lm.computeCapex < 1100000, 'the skid as recorded plus the model\u2019s own site costs: ' + lm.computeCapex);
    assert.equal(lm.host.capex, 918000, 'the host\u2019s system at the Site Map run\u2019s price'); assert.equal(lm.host.solarKwDc, 368); assert.equal(lm.host.bessKwh, 2000);
    /* the whole project carries the standard debt (2026-10-14), so the sources and uses add the financing fee and the debt service reserve to the capital */
    assert.ok(lm.totalProjectCost >= lm.computeCapex + 918000 && lm.totalProjectCost < (lm.computeCapex + 918000) * 1.15, 'the capital request is the whole (the capital, then the engine\u2019s own reserves and the debt\u2019s fee and reserve): ' + lm.totalProjectCost);
    assert.equal(lm.host.revenuePerYear, 61000); assert.equal(lm.host.ppa, null); assert.equal(lm.host.noRevenue, false);
    /* THE HOST'S BATTERY EARNS on the dispatch (2026-10-15): the summary carries the year-one figure, its parts, the streams and the load it ran on; the stored input asked for it; the basis names it */
    var hsR = lm.host.storage, mdoc = db.data.get(O + '/sites/' + made.id + '/models/' + lm.modelId);
    assert.ok(hsR && hsR.year1 > 0 && hsR.fee === Math.round(hsR.billSavings * 0.8) && hsR.year1 === hsR.fee + hsR.grid, 'the battery\u2019s dispatch revenue is summarised: ' + JSON.stringify(hsR));
    assert.ok(hsR.streams.some(function (x) { return x.id === 'bill.demand' && x.tier === 'computed'; }), 'the streams ride the summary with their tiers');
    assert.equal(hsR.loadAssumed, true, 'no usage on record: the typical load, said so'); assert.equal(hsR.load.source, 'profile');
    assert.deepEqual(mdoc.input.host.storage, { dispatch: true, annualKwh: 0 }, 'the stored input asked for the dispatch with no usage on record');
    assert.match(mdoc.basis.hostStorage, /dispatched on the host\u2019s meter/); assert.match(mdoc.basis.hostStorage, /no usage on record/);
    /* a site with no PPA on record: the stored model carries no undefined anywhere (2026-10-14: Firestore refused `input.host.ppa` and every automatic run on such a site failed) */
    (function walk(v, path) { if (v === undefined) throw new Error('undefined stored at ' + path); if (v && typeof v === 'object') Object.keys(v).forEach(function (k) { walk(v[k], path + '.' + k); }); })(db.data.get(O + '/sites/' + made.id + '/models/' + lm.modelId), 'model');
    assert.equal('ppa' in db.data.get(O + '/sites/' + made.id + '/models/' + lm.modelId).input.host, false, 'no PPA on record: the host block has no ppa key at all');
    assert.ok(lm.irr > 0.02 && lm.irr < 0.6, 'an after-tax IRR of the whole project, not the pod case\u2019s half a percent: ' + lm.irr);
    /* the pod pro forma followed the design too: the skid as recorded, once per design, its convention said */
    var lpA = s.latestProforma;
    assert.ok(lpA && lpA.designHash === s.latestDesign.hash, 'the pod pro forma ran on the design by itself'); assert.equal(lpA.investorCapital, OC.PRODUCT.systemCostUsd); assert.equal(lpA.pods, 1);
    assert.match(lpA.convention, /60 operating months, pre-tax, unlevered/); assert.equal(page.autoProforma.scenarioId, lpA.scenarioId);
    assert.ok(lpA.investorIrrAnnual > 0.2, 'on the skid\u2019s own capital the pod case is no longer half a percent: ' + lpA.investorIrrAnnual);
    assert.equal(page.skid.systemCostUsd, OC.PRODUCT.systemCostUsd); assert.ok(page.skid.chipsets.length >= 8 && page.skid.chipsets.filter(function (c) { return c.pricePerGpuHour; }).length >= 8);
    assert.equal(s.designModel.modelId, lm.modelId); assert.equal(s.designModel.hash, s.latestDesign.hash);
    assert.match(s.latestDesign.address, /Roscoe/); assert.equal(s.latestDesign.zip, '91304');
    var stored = db.data.get(O + '/sites/' + made.id + '/models/' + lm.modelId), inp = stored.input;
    assert.equal(inp.service.kw, OC.PRODUCT.meter.peakKw); assert.equal(inp.service.own, true); assert.equal(inp.service.loadingPct, 100); assert.equal(inp.load.none, true); assert.equal(inp.ev.ports, 0);
    assert.equal(inp.compute.gpuClass, 'custom'); assert.equal(inp.compute.gpusPerPod, 48); assert.equal(inp.compute.kwPerGpu, 1.275); assert.equal(inp.compute.pue, 1.2);
    assert.equal(inp.compute.capexPerGpu, OC.PRODUCT.skidPriceUsd / 48); assert.equal(inp.compute.podInfraPerPod, OC.PRODUCT.systemCostUsd - OC.PRODUCT.skidPriceUsd);
    assert.equal(inp.compute.tiers.spot.sharePct, 100); assert.equal(inp.compute.tiers.spot.utilPct, 85); assert.equal(inp.compute.tiers.spot.price, 2.46); assert.equal(inp.compute.availabilityPct, 98); assert.equal(inp.compute.priceDeclinePct, 8); assert.equal(inp.compute.platformFeePct, 8); assert.equal(inp.compute.podOmPerYear, 60000);
    assert.deepEqual(inp.battery, { kw: 60, kwh: 61, capexPerKwh: 0 }); assert.equal(inp.solar, undefined); assert.equal(inp.capex, undefined);
    assert.equal(inp.host.solarKwDc, 368); assert.equal(inp.host.bessKwh, 2000); assert.equal(inp.host.capexLines[0].amount, 918000); assert.equal(inp.host.capexLines[0].asset, 'blended', 'a record with no lines: the whole run as blended energy property');
    assert.match(stored.basis.hostRevenue, /year-one revenue/); assert.match(stored.basis.host, /IN this case as money/);
    assert.ok(stored.result.proforma.assumptions.some(function (a) { return /host\u2019s own system beside the compute/.test(a) && /\$918,000/.test(a); }));
    assert.equal(inp.deal.rentPerYear, OC.RATE_CARD.monthlyPerSkid.base * 12); assert.equal(inp.deal.rentEscPct, OC.RATE_CARD.escalatorPct.base);
    assert.match(stored.basis.host, /500 kW \/ 2000 kWh battery/); assert.match(stored.basis.host, /368 kW-dc solar/); assert.match(stored.basis.host, /\$918,000/); assert.match(stored.basis.rent, /market reference/); assert.match(stored.basis.zip, /read from the site’s address/);
    assert.match(stored.basis.capex, /\$639,000 a skid, plus the NextNRG Microgrid Controller built into it, \$125,000/); assert.match(stored.basis.gpuClass, /48 × NVIDIA HGX H100 .* public spot market reference, \$2\.46 a GPU-hour/);
    assert.ok(!/iQGen|IQGEN|CMDC/i.test(JSON.stringify([stored.basis, stored.summary, page.skid, stored.result.story, stored.result.proforma.assumptions])), 'nothing a tenant reads names the source workbook or the cost reference');
    assert.ok(!stored.result.proforma.warnings.some(function (w) { return w.code === 'LOAD_ASSUMED'; }), 'no building is assumed behind a skid on its own meter');
    assert.ok(stored.result.story.flow.some(function (f) { return f[1] === 'Own service'; }));
    var autos = audits('sitecrm-site-model').filter(function (a) { return a.auto === true; });
    assert.equal(autos.length, 1); assert.equal(autos[0].designHash, s.latestDesign.hash);
    /* the same design is not run again by another open */
    var n1 = audits('sitecrm-site-model').length;
    await call('GET', { site: made.id }, PM); await call('GET', { site: made.id }, VIEWER);
    assert.equal(audits('sitecrm-site-model').length, n1, 'an unchanged design is not modelled twice');
    /* the design changes (a second skid): it runs again, on two skids on their own 270 kW of service */
    db.data.get('projects/p_skid').shapes.push({ kind: 'derdc', kw: 75, omegaCore: true, bessKw: 60, bessKwh: 61.44 });
    var again = await call('GET', { site: made.id }, PM), lm2 = again.site.latestModel;
    assert.equal(lm2.pods, 2); assert.equal(lm2.skid.units, 2); assert.notEqual(lm2.modelId, lm.modelId); assert.equal(again.autoModel.modelId, lm2.modelId);
    assert.equal(db.data.get(O + '/sites/' + made.id + '/models/' + lm2.modelId).input.service.kw, OC.PRODUCT.meter.peakKw * 2);
    assert.equal((await call('GET', {}, PM)).sites.filter(function (x) { return x.id === made.id; })[0].latestModel.skid.units, 2, 'the register reads the skid\u2019s run');
    /* rent on record replaces the market reference; a chipset chosen by hand comes from the skid\u2019s own library; a hand run is not auto */
    db.data.get(O + '/sites/' + made.id).commercial = { rentMonthly: 1500 };
    var chosen = await call('POST', { site: made.id, action: 'site-model', gpuClass: 'h200', pods: 1 }, PM);
    assert.equal(chosen.latestModel.skid.chipset, 'h200'); assert.equal(chosen.latestModel.pods, 1); assert.equal(chosen.latestModel.auto, false); assert.equal(chosen.latestModel.designHash, again.site.latestDesign.hash);
    var st2 = db.data.get(O + '/sites/' + made.id + '/models/' + chosen.modelId);
    assert.equal(st2.input.deal.rentPerYear, 18000); assert.match(st2.basis.rent, /on record/); assert.equal(st2.input.compute.tiers.spot.price, 2.62);
    await rejects(call('POST', { site: made.id, action: 'site-model', gpuClass: 'gb300' }, PM), 400, /public GPU-hour price/);
    /* the PPA on record (NextNRG's executed Topanga PPA: $0.2250/kWh, 2.5% a year, 28 years) prices the host's solar; the run's lines put the NextNRG system on its asset class */
    /* the Run total carries the skid at its recorded price since 2026-10-14 (its omegaCore line); the host's case takes it back out, so the whole project counts the skid once */
    db.data.get('projects/p_skid').capex = 2300000 + 764000; db.data.get('projects/p_skid').capexLines = { solar: 0, bess: 0, nextnrgSystem: 2208000, ev: 0, controller: 0, compute: 0, dc: 0, gen: 0, envelope: 0, site: 48000, indirect: 0, contingency: 44000, omegaCore: 764000 };
    await call('POST', { action: 'site-save', id: made.id, name: 'Topanga Terrace', ppaRatePerKwh: 0.225, ppaEscalatorPct: 2.5, ppaTermYears: 28 }, PM);
    var withPpa = await call('GET', { site: made.id }, PM), lm3 = withPpa.site.latestModel;
    assert.equal(withPpa.site.ppaRatePerKwh, 0.225); assert.equal(withPpa.site.ppaTermYears, 28);
    assert.notEqual(lm3.modelId, lm2.modelId, 'a changed design and changed facts run the model again'); assert.deepEqual(lm3.host.ppa, { ratePerKwh: 0.225, schedule: null, escPct: 2.5, escAssumed: false, termYears: 28, year1Kwh: 0 });
    assert.ok(lm3.irrExTerminal != null && lm3.irrExTerminal < lm3.irr && lm3.terminalValue && lm3.terminalValue.year === 10 && lm3.terminalValue.yearsLeft === 18, 'the term\u2019s own IRR rides beside the headline: ' + JSON.stringify([lm3.irr, lm3.irrExTerminal, lm3.terminalValue]));
    assert.ok(db.data.get(O + '/sites/' + made.id + '/models/' + lm3.modelId).result.proforma.warnings.some(function (w) { return w.code === 'PPA_TABLE_MISSING'; }), 'a rate without the contract\u2019s table is told so');
    /* THE CONTRACT AS WRITTEN (2026-10-15, Tommy: "very accurate … able to be verified by the bank"): the executed Topanga PPA's own 28-row price table (it compounds 2.0% a year, not the one-pager's 2.5%) and its expected first-year production, pasted as the contract prints them, price each year as written */
    var tbl = []; for (var ty = 0; ty < 28; ty++) tbl.push((0.225 * Math.pow(1.02, ty)).toFixed(4));
    await call('POST', { action: 'site-save', id: made.id, name: 'Topanga Terrace', ppaPriceSchedule: tbl.map(function (p, i) { return (i + 1) + ' ' + p; }).join('\n'), ppaYear1Kwh: 540000 }, PM);
    var withTbl = await call('GET', { site: made.id }, PM), lm3b = withTbl.site.latestModel;
    assert.equal(withTbl.site.ppaPriceSchedule.length, 28); assert.equal(withTbl.site.ppaPriceSchedule[0], 0.225); assert.equal(withTbl.site.ppaPriceSchedule[27], 0.384); assert.equal(withTbl.site.ppaYear1Kwh, 540000);
    assert.notEqual(lm3b.modelId, lm3.modelId, 'the table is a changed fact: the model runs again');
    assert.equal(lm3b.host.ppa.schedule.length, 28); assert.equal(lm3b.host.ppa.year1Kwh, 540000); assert.ok(lm3b.irr < lm3.irr, 'the 2.0% table returns less than the 2.5% rate: ' + lm3b.irr + ' < ' + lm3.irr);
    var st3b = db.data.get(O + '/sites/' + made.id + '/models/' + lm3b.modelId);
    assert.equal(st3b.result.proforma.inputs.solar.kwh1, 540000, 'the contract\u2019s expected production is what the solar generates'); assert.equal(st3b.result.proforma.inputs.revenue.ppa.schedule.length, 28);
    assert.ok(!st3b.result.proforma.warnings.some(function (w) { return w.code === 'PPA_TABLE_MISSING' || w.code === 'PPA_PRODUCTION_ASSUMED'; }), 'nothing assumed about the contract');
    await rejects(call('POST', { action: 'site-save', id: made.id, name: 'Topanga Terrace', ppaPriceSchedule: '0.2, 7' }, PM), 400, /PPA prices/);
    /* the §48E adders on record build the statutory rate in the ONE finance engine (the one-pagers claim an energy community): 30 + 10 points, never a typed percentage */
    assert.equal(st3b.result.proforma.tax.itc.byAsset.blended.ratePct, 30, 'the base rate with no adder on record');
    await call('POST', { action: 'site-save', id: made.id, name: 'Topanga Terrace', itcEnergyCommunity: true }, PM);
    var withEc = await call('GET', { site: made.id }, PM), lmEc = withEc.site.latestModel, stEc = db.data.get(O + '/sites/' + made.id + '/models/' + lmEc.modelId);
    assert.equal(withEc.site.itcEnergyCommunity, true); assert.notEqual(lmEc.modelId, lm3b.modelId, 'an adder is a changed fact');
    assert.equal(withEc.site.ppaPriceSchedule.length, 28, 'a save that does not send the table leaves it as stored (2026-10-15: a partial save once wiped it)'); assert.equal(withEc.site.ppaYear1Kwh, 540000); assert.equal(withEc.site.ppaRatePerKwh, 0.225);
    assert.equal(stEc.result.proforma.tax.itc.byAsset.blended.ratePct, 40); assert.ok(lmEc.irr > lm3b.irr, 'the adder raises the IRR: ' + lmEc.irr + ' > ' + lm3b.irr); assert.match(stEc.basis.itc, /energy community/);
    await call('POST', { action: 'site-save', id: made.id, name: 'Topanga Terrace', ppaPriceSchedule: [] }, PM);
    assert.equal((await call('GET', { site: made.id }, PM)).site.ppaPriceSchedule, null, 'an empty table clears it'); assert.equal(lm3.host.revenueBasis, 'PPA'); assert.equal(lm3.host.capex, 2300000, 'the host\u2019s capex is the Run total less the skid\u2019s own line');
    var st3 = db.data.get(O + '/sites/' + made.id + '/models/' + lm3.modelId);
    assert.deepEqual(st3.input.host.capexLines.map(function (l) { return [l.id, l.amount, l.asset]; }), [['nextnrg', 2208000, 'blended'], ['balance', 92000, 'blended']]);
    assert.equal(st3.result.proforma.inputs.revenue.ppa.rate1, 0.225); assert.ok(st3.result.proforma.rows[0].ppaRevenue > 100000, 'the PPA earns on the solar the engine generates: ' + st3.result.proforma.rows[0].ppaRevenue);
    assert.ok(lm3.totalProjectCost >= lm3.computeCapex + 2300000 && lm3.totalProjectCost < (lm3.computeCapex + 2300000) * 1.15, "the whole with the standard debt's fee and reserve: " + lm3.totalProjectCost); assert.ok(lm3.irr > 0.02, 'the whole project\u2019s IRR with the PPA: ' + lm3.irr);
    assert.equal(require('../api/_lib/site-model').askOf(withPpa.site).amount, lm3.totalProjectCost, 'the capital request is the whole project');
    /* what the skid adds (2026-10-14): the host alone, the skid alone, the whole, from the same engine on the same facts */
    assert.ok(lm3.uplift && lm3.uplift.hostAlone && lm3.uplift.skidAlone && lm3.uplift.whole, 'the summary carries the three cases: ' + JSON.stringify(lm3.uplift));
    assert.ok(lm3.uplift.hostAlone.irr < lm3.uplift.whole.irr && lm3.uplift.whole.irr < lm3.uplift.skidAlone.irr, 'the whole sits between the host alone and the skid alone: ' + JSON.stringify(lm3.uplift));
    assert.equal(lm3.uplift.whole.irr, lm3.irr, 'the whole is the headline'); assert.ok(lm3.uplift.hostAlone.capital < lm3.totalProjectCost && lm3.uplift.skidAlone.capital < lm3.totalProjectCost);
    /* the whole project is levered by the engine's standard debt (2026-10-14, "do what is standard"): the headline is the equity IRR, the unlevered twin beside it, the skid alone still 100% equity */
    assert.equal(lm3.levered, false, 'the whole project is 100% equity: the partner funds all of it (2026-10-14)'); assert.ok(!(lm3.debt > 0) && Math.abs(lm3.equity - lm3.totalProjectCost) < 1, 'the ask is the whole project: ' + JSON.stringify([lm3.equity, lm3.totalProjectCost]));
    assert.equal(lm3.debtTerms, null); assert.ok(lm3.uplift.levered && lm3.uplift.levered.irr > lm3.irr, 'the standard-debt case rides beside it as a side figure: ' + JSON.stringify(lm3.uplift.levered));
    var regRow = (await call('GET', {}, PM)).sites.filter(function (x) { return x.id === made.id; })[0];
    assert.equal(regRow.latestModel.totalProjectCost, lm3.totalProjectCost); assert.equal(regRow.latestModel.host.capex, 2300000);
    var n2 = audits('sitecrm-site-model').length; await call('GET', { site: made.id }, PM);
    assert.equal(audits('sitecrm-site-model').length, n2, 'a hand run on the current design satisfies the automatic one');
    /* the pod pro forma on this design prices the skid as recorded */
    var pf = await call('POST', { site: made.id, action: 'proforma-run' }, PM);
    assert.equal(pf.scenario.results.pods, 2); assert.equal(pf.scenario.results.investorCapital, OC.PRODUCT.systemCostUsd * 2); assert.match(pf.scenario.results.capexBasis, /^2 Omega-Core skids as recorded \(\$764,000 each\)$/);
    assert.ok(pf.scenario.results.investorIrr.annual > 0.3, 'the pod case on the skid\u2019s price is no longer half a percent: ' + pf.scenario.results.investorIrr.annual);
    /* the register\u2019s sync (the editor\u2019s save goes through it too) runs the model on a fresh site and says so */
    var two = await call('POST', { action: 'site-save', name: 'Second', address: '1 Main St, Burbank, CA 91502' }, PM);
    db.seed('projects/p_skid2', Object.assign({}, SKID, { address: '1 Main St, Burbank, CA 91502' })); db.data.get(O + '/sites/' + two.id).projectId = 'p_skid2';
    var sync = await call('POST', { action: 'design-sync', ids: [two.id], source: 'editor' }, PM);
    assert.equal(sync.modelled.length, 1); assert.match(sync.note, /the compute model ran on 1/); assert.equal(sync.designs[0].model.auto, true);
    var last = audits('sitecrm-design-sync').slice(-1)[0]; assert.equal(last.source, 'editor'); assert.equal(last.modelId, sync.modelled[0].modelId);
    /* what stops it is kept and said, and the same facts are not tried twice; a fact added runs it */
    var three = await call('POST', { action: 'site-save', name: 'Third', address: '1 Main St' }, PM);
    db.seed('projects/p_skid3', Object.assign({}, SKID, { address: '1 Main St' })); db.data.get(O + '/sites/' + three.id).projectId = 'p_skid3';
    var p3 = await call('GET', { site: three.id }, PM);
    assert.equal(p3.site.latestModel, null); assert.match(p3.site.designModel.missing[0], /ZIP/); assert.equal(p3.autoModel, null);
    var n3 = audits('sitecrm-site-model').length; await call('GET', { site: three.id }, PM); assert.equal(audits('sitecrm-site-model').length, n3, 'the same facts are not tried twice');
    await call('POST', { action: 'site-save', id: three.id, name: 'Third', zip: '91502' }, PM);
    var p3b = await call('GET', { site: three.id }, PM); assert.ok(p3b.site.latestModel, 'a fact added runs it'); assert.equal(p3b.site.latestModel.zip, '91502');
    /* a workspace without Omega Compute is simply not modelled: no error, no record; the design is still read */
    db.seed(O + '/billing/current', { packaged: true, packagingState: 'paid', accessUntil: Date.now() + 86400000, modules: ['lite'] });
    var four = await call('POST', { action: 'site-save', name: 'Fourth', address: '1 Main St, Burbank, CA 91502' }, PM);
    db.seed('projects/p_skid4', Object.assign({}, SKID, { address: '1 Main St, Burbank, CA 91502' })); db.data.get(O + '/sites/' + four.id).projectId = 'p_skid4';
    var p4 = await call('GET', { site: four.id }, PM);
    assert.ok(p4.site.latestDesign); assert.equal(p4.site.latestModel, null); assert.equal(p4.site.designModel, null); assert.equal(p4.autoModel, null);
    var p4s = await call('POST', { action: 'design-sync', ids: [four.id] }, PM); assert.equal(p4s.modelled.length, 0); assert.equal(p4s.stopped.length, 0);
  });
  await test('the pages carry the design: the site card and its pro forma button, the register’s sync and drawer', async function () {
    var pf = fs.readFileSync(path.join(__dirname, '..', 'portfolio.html'), 'utf8'), sc = fs.readFileSync(path.join(__dirname, '..', 'site-crm.html'), 'utf8');
    assert.match(pf, /id="ba-design"/); assert.match(pf, /act\('design-sync'/); assert.match(pf, /Site Map design/); assert.match(pf, /id="c-editor-n"/);
    assert.match(sc, /id="design-card"/); assert.match(sc, /pf-design/); assert.match(sc, /fromDesign: true/); assert.match(sc, /design-sync/); assert.match(sc, /ds-proforma/);
    /* the automatic run, the skid and what it ran on, in the pages; the editor tells the site after a save */
    assert.match(sc, /runs on this design by itself/); assert.match(sc, /j\.autoModel/); assert.match(sc, /DATA\.skid/); assert.match(sc, /sk\.chipsets\.filter/); assert.match(sc, /id="model-basis"/); assert.match(sc, /designModel\.missing/); assert.match(sc, /Omega-Core skid/);
    assert.ok(!/iQGen|IQGEN/i.test(sc) && !/iQGen|IQGEN/i.test(pf), 'the pages never name the source workbook');
    assert.match(pf, /run the compute model on it by itself/);
    var ed = fs.readFileSync(path.join(__dirname, '..', 'editor.html'), 'utf8');
    assert.match(ed, /function omegaSiteDesignPush\(\)/); assert.match(ed, /action:'design-sync', ids:\[S\.siteId\], source:'editor'/); assert.match(ed, /S\.siteId\s*=\s*\(typeof d\.siteId==='string'/); assert.match(ed, /omegaSiteDesignPush\(\); \}catch\(_e\)\{\}/);
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
