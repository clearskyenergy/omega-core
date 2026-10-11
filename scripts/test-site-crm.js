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
var assert = require('node:assert/strict');
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

  console.log('\naudit');
  await test('every write is audited', async function () {
    await call('POST', { site: SITE, action: 'log', type: 'note', subject: 'n' }, PM);
    await call('POST', { site: SITE, action: 'proforma-run', pods: 1 }, PM);
    var acts = audits().map(function (a) { return a.action; });
    ['sitecrm-log', 'sitecrm-proforma-run'].forEach(function (x) { assert.ok(acts.indexOf(x) >= 0, 'missing audit ' + x); });
  });

  console.log('\n' + count + ' tests passed.');
})().catch(function (e) { console.error('FAIL', e); process.exit(1); });
