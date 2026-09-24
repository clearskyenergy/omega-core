#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   scripts/test-crm.js — the supplier's CRM and the customer's documents,
   end to end offline
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   api/crm.js (the office's door), api/my-files.js (the customer's door) and
   api/_lib/crm.js (what may be written, what the timeline says) over the
   in-memory Firestore double and an in-memory Storage bucket. No network.

   What must hold (docs/OMEGA-LOGIC-ECOSYSTEM.md, "API contracts"):
     · workspace members read and write; viewers read; archiving is an
       administrator's; another workspace and a customer are refused
     · contacts are saved and archived, never deleted
     · a follow-up (or a task) is on Today until it is done
     · an order from another account cannot be logged against this one
     · a document's bytes are decided by their content, capped at 2 MB, kept
       in private Storage under crm/{org}/{customerId}/{fileId} and served
       only by the endpoint; the path is never taken from the request
     · the customer sees what was shared plus the account's own uploads,
       never an office-only document or another account's; a pending person
       sees nothing; 20 uploads a day per account, counted where no browser
       can reset it; a duplicate does not spend the allowance
     · every write is audited, and the audit never says "uploaded" for bytes
       that were not stored
     · the timeline is derived from what exists: orders priced and accepted
       as two moments, custody, sites, designs, the design-tool trial
     node scripts/test-crm.js
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var assert = require('node:assert/strict');
var FD = require('./_lib/firestore-double'), DB = FD.DB, mock = FD.mock;
var db, store = {}, failSave = false;
var A = { db: function () { return db; }, safeOrg: function (v) { return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(v || '') ? v : ''; }, httpError: function (s, m) { var e = new Error(m); e.status = s; return e; },
  authenticate: async function (r) { return r.caller; }, handler: function (f) { return f; }, canActInOrg: async function (c, o) { return c.orgId === o; }, isDegraded: function () { return false; },
  init: function () { throw new Error('the Admin SDK must not be reached in a test'); },
  FieldValue: function () { return { serverTimestamp: function () { return '2026-09-24T12:00:00Z'; } }; } };
mock('../api/_lib/admin', A);
/* Nothing in the CRM deletes a document: a delete fails the test. */
FD.Ref.prototype.delete = async function () { throw new Error('deleted ' + this.path); };
var bucket = { file: function (p) { return {
  save: async function (bytes, opts) { if (failSave) throw new Error('storage down'); assert.equal(opts.contentType, 'application/octet-stream'); store[p] = Buffer.from(bytes); },
  download: async function () { if (!store[p]) throw new Error('no such object ' + p); return [store[p]]; } }; } };
var I = require('../api/_lib/po-intake'); I.bucket = function () { return bucket; };
var C = require('../api/_lib/crm'), crm = require('../api/crm'), myFiles = require('../api/my-files');

var ORG = 'cleancell.us', O = 'omega_orgs/' + ORG, AMP = 'acct_amperage', OTH = 'acct_other';
function staff(uid, extra) { return Object.assign({ uid: uid, email: uid + '@cleancell.us', orgId: ORG, claims: { email_verified: true } }, extra || {}); }
function buyer(email, extra) { return Object.assign({ uid: email.split('@')[0], email: email, orgId: email.split('@')[1], claims: { email_verified: true } }, extra || {}); }
var PM = staff('pm'), ADMIN = staff('boss'), VIEWER = staff('viewer'), RIVAL = { uid: 'r', email: 'r@joules.example', orgId: 'joules.example', claims: { email_verified: true } };
var OWNER = { uid: 'tom', email: 'tom@clearsky-usa.com', orgId: 'clearsky-usa.com', claims: { email_verified: true } };
var SHANNON = buyer('shannon@amperagecapital.com'), CFO = buyer('cfo@amperagecapital.com'), NEWBIE = buyer('new@amperagecapital.com'), OTHER = buyer('buyer@elsewhere.com');
function res() { return { headers: {}, setHeader: function (k, v) { this.headers[k] = v; }, end: function (b) { this.body = b; } }; }
function call(api, method, body, caller, r) { return api({ method: method, body: method === 'POST' ? Object.assign({ org: ORG }, body) : undefined, query: method === 'GET' ? Object.assign({ org: ORG }, body || {}) : {}, caller: caller }, r || res()); }
async function rejects(p, status, re) { try { await p; } catch (e) { assert.equal(e.status, status, e.message); if (re) assert.match(e.message, re); return e; } throw new Error('expected a ' + status); }
function b64(s) { return Buffer.from(s).toString('base64'); }
var PDF = b64('%PDF-1.4\n1 0 obj << >> endobj\n%%EOF'), PNG = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.from('IHDR....')]).toString('base64');
function audits(action) { var out = []; db.data.forEach(function (v, k) { if (k.indexOf('omega_audit/') === 0 && (!action || v.action === action)) out.push(v); }); return out; }
function docsUnder(prefix) { var out = []; db.data.forEach(function (v, k) { if (k.indexOf(prefix) === 0 && k.slice(prefix.length).indexOf('/') < 0) out.push(Object.assign({ _id: k.slice(prefix.length) }, v)); }); return out; }
var count = 0; async function test(name, fn) { seed(); await fn(); count++; console.log('PASS ' + name); }
/* The endpoints log what they reword; in the failure tests that is expected noise. */
async function quietly(fn) { var was = console.error; console.error = function () {}; try { return await fn(); } finally { console.error = was; } }

function seed() {
  db = new DB(); store = {}; failSave = false;
  db.seed(O, { name: 'Clean Cell', status: 'active' });
  db.seed(O + '/billing/current', { addons: ['omega-logic'], status: 'active' }); db.seed(O + '/fulfillment/config', { enabled: true });
  db.seed(O + '/members/pm', { email: 'pm@cleancell.us', role: 'member', status: 'active' });
  db.seed(O + '/members/boss', { email: 'boss@cleancell.us', role: 'admin', status: 'active' });
  db.seed(O + '/members/viewer', { email: 'viewer@cleancell.us', role: 'viewer', status: 'active' });
  db.seed('omega_orgs/joules.example', { name: 'Joules', status: 'active' });
  db.seed('omega_orgs/joules.example/billing/current', { addons: ['omega-logic'], status: 'active' });
  db.seed('omega_orgs/joules.example/members/r', { role: 'admin', status: 'active' });
  db.seed(O + '/customers/' + AMP, { orgId: ORG, name: 'Amperage Capital', status: 'active', source: 'office', accountType: 'company', createdAt: '2026-09-01T00:00:00Z' });
  db.seed(O + '/customers/' + AMP + '/users/shannon@amperagecapital.com', { email: 'shannon@amperagecapital.com', name: 'Shannon Johnson', role: 'owner', status: 'active', createdAt: '2026-09-01T00:00:00Z' });
  db.seed(O + '/customers/' + AMP + '/users/cfo@amperagecapital.com', { email: 'cfo@amperagecapital.com', name: 'CFO', role: 'user', status: 'active', addedBy: 'shannon@amperagecapital.com', createdAt: '2026-09-05T00:00:00Z' });
  db.seed(O + '/customers/' + AMP + '/users/new@amperagecapital.com', { email: 'new@amperagecapital.com', role: 'user', status: 'pending', requestedAt: '2026-09-20T00:00:00Z' });
  db.seed(O + '/customer_index/shannon@amperagecapital.com', { customerId: AMP });
  db.seed(O + '/customer_index/cfo@amperagecapital.com', { customerId: AMP });
  db.seed(O + '/customer_index/new@amperagecapital.com', { customerId: AMP });
  db.seed(O + '/customers/' + OTH, { orgId: ORG, name: 'Other Co', status: 'active', source: 'self' });
  db.seed(O + '/customers/' + OTH + '/users/buyer@elsewhere.com', { email: 'buyer@elsewhere.com', role: 'owner', status: 'active' });
  db.seed(O + '/customer_index/buyer@elsewhere.com', { customerId: OTH });
  /* Amperage's orders: one stamped, one only billed to Shannon; one of Other Co's, one in another workspace */
  db.seed('orders/amp1', { orgId: ORG, orderNo: 'CC-1', customerId: AMP, status: 'accepted', createdAt: '2026-09-10T00:00:00Z', customer: { email: 'shannon@amperagecapital.com' }, items: [{ sku: 'R60', name: 'R60 skid', qty: 2 }],
    logic: { commercial: { totalCents: 12345600 }, createdAt: '2026-09-11T09:00:00Z', acceptedAt: '2026-09-14T15:00:00Z', invoices: { deposit: { id: 'INV-7', amountCents: 3703680, issuedAt: '2026-09-15T00:00:00Z', payments: [{ amountCents: 3703680, date: '2026-09-16' }] } } } });
  db.seed('orders/amp2', { orgId: ORG, orderNo: 'CC-2', status: 'accepted', createdAt: '2026-09-12T00:00:00Z', customer: { email: 'shannon@amperagecapital.com' }, items: [{ sku: 'R60', qty: 1 }],
    logic: { commercial: { totalCents: 500000 }, createdAt: '2026-09-12T10:00:00.000Z', acceptedAt: '2026-09-12T10:00:00.004Z' } });
  db.seed('orders/oth1', { orgId: ORG, orderNo: 'CC-OTH', customerId: OTH, createdAt: '2026-09-12T00:00:00Z', customer: { email: 'buyer@elsewhere.com' }, items: [] });
  db.seed('orders/cross', { orgId: ORG, orderNo: 'CC-X', customerId: OTH, createdAt: '2026-09-12T00:00:00Z', customer: { email: 'shannon@amperagecapital.com' }, items: [] });
  db.seed('orders/joules1', { orgId: 'joules.example', orderNo: 'J-1', customerId: AMP, createdAt: '2026-09-12T00:00:00Z', items: [] });
}
async function upload(caller, api, name, base64, extra) {
  return call(api, 'POST', Object.assign(api === crm ? { customerId: AMP, action: 'file-upload' } : { action: 'upload' }, { file: { name: name, base64: base64 } }, extra || {}), caller);
}

(async function () {
  console.log('\nwho may open the CRM');
  await test('a member reads and writes, a viewer only reads, another workspace and a customer are refused', async function () {
    var r = await call(crm, 'GET', { customerId: AMP }, PM);
    assert.equal(r.company, 'Amperage Capital'); assert.equal(r.canEdit, true); assert.equal(r.canArchive, false);
    var v = await call(crm, 'GET', { customerId: AMP }, VIEWER); assert.equal(v.canEdit, false);
    await rejects(call(crm, 'POST', { customerId: AMP, action: 'log', type: 'note', subject: 'Hi' }, VIEWER), 403, /read the CRM but not change it/);
    await rejects(call(crm, 'GET', { customerId: AMP }, RIVAL), 403);
    await rejects(call(crm, 'GET', { followUps: '1' }, RIVAL), 403);
    await rejects(call(crm, 'GET', { customerId: AMP }, SHANNON), 403, /Not your OEM workspace/);
    await rejects(call(crm, 'GET', { customerId: AMP }, Object.assign(staff('pm'), { claims: { email_verified: false } })), 403, /Verify/);
    await rejects(call(crm, 'GET', { customerId: 'acct_nobody' }, PM), 404);
    await rejects(call(crm, 'GET', { customerId: '../acct_other' }, PM), 400);
  });
  await test('a lapsed subscription closes the CRM to the workspace; ClearSky\'s owner may still open it while commissioning', async function () {
    db.seed(O + '/billing/current', { addons: [], status: 'active' });
    await rejects(call(crm, 'GET', { customerId: AMP }, ADMIN), 403, /subscription/);
    var r = await call(crm, 'GET', { customerId: AMP }, OWNER); assert.equal(r.canArchive, true);
  });

  console.log('\ncontacts');
  await test('a contact is saved, edited, made primary and archived by an administrator, never deleted', async function () {
    var a = await call(crm, 'POST', { customerId: AMP, action: 'contact-save', name: 'Bob Site', title: 'Site lead', email: 'Bob@AmperageCapital.com', phone: '555', primary: true }, PM);
    var b = await call(crm, 'POST', { customerId: AMP, action: 'contact-save', name: 'Ann Finance', email: 'ann@amperagecapital.com', primary: true }, PM);
    assert.equal(a.contact.email, 'bob@amperagecapital.com');
    var got = await call(crm, 'GET', { customerId: AMP }, PM);
    assert.deepEqual(got.contacts.map(function (c) { return [c.name, c.primary]; }), [['Ann Finance', true], ['Bob Site', false]], 'one primary; primary first');
    await rejects(call(crm, 'POST', { customerId: AMP, action: 'contact-save', name: 'Dup', email: 'bob@amperagecapital.com' }, PM), 409);
    await rejects(call(crm, 'POST', { customerId: AMP, action: 'contact-save', title: 'nobody' }, PM), 400, /name or an email/);
    await rejects(call(crm, 'POST', { customerId: AMP, action: 'contact-save', name: 'x'.repeat(121) }, PM), 400, /limited to 120/);
    var ed = await call(crm, 'POST', { customerId: AMP, action: 'contact-save', id: a.id, name: 'Bob Site', title: 'Construction manager', email: 'bob@amperagecapital.com' }, PM);
    assert.equal(ed.contact.title, 'Construction manager');
    await call(crm, 'POST', { customerId: AMP, action: 'log', type: 'call', subject: 'Walked the site', contactId: a.id }, PM);
    await rejects(call(crm, 'POST', { customerId: AMP, action: 'contact-archive', id: a.id }, PM), 403, /administrator/);
    var ar = await call(crm, 'POST', { customerId: AMP, action: 'contact-archive', id: a.id }, ADMIN); assert.equal(ar.ok, true);
    assert.equal((await call(crm, 'POST', { customerId: AMP, action: 'contact-archive', id: a.id }, ADMIN)).duplicate, true);
    got = await call(crm, 'GET', { customerId: AMP }, PM);
    assert.deepEqual(got.contacts.map(function (c) { return c.name; }), ['Ann Finance']);
    assert.equal(got.activity[0].contactName, 'Bob Site', 'logged activity keeps the archived contact\'s name');
    assert.equal(db.data.get(O + '/customers/' + AMP + '/contacts/' + a.id).archived, true, 'kept, flagged');
    await rejects(call(crm, 'POST', { customerId: AMP, action: 'contact-save', id: a.id, name: 'Back' }, PM), 409);
    await rejects(call(crm, 'POST', { customerId: AMP, action: 'log', type: 'call', subject: 'x', contactId: a.id }, PM), 400, /archived/);
    await rejects(call(crm, 'POST', { customerId: OTH, action: 'contact-save', id: b.id, name: 'Moved' }, PM), 404, /not on this account/);
    assert.equal(audits('crm-contact-save').length, 3); assert.equal(audits('crm-contact-archive').length, 1);
  });

  console.log('\nactivity and Today');
  await test('a call with a follow-up is on Today until it is done; a task with no day is owed too; a note is not', async function () {
    var l = await call(crm, 'POST', { customerId: AMP, action: 'log', type: 'call', subject: 'Deposit timing', body: 'CFO says wire Friday', followUpAt: '2026-09-30', orderId: 'amp1' }, PM);
    assert.match(l.note, /on Today/); assert.equal(l.activity.open, true); assert.equal(l.activity.orderNo, 'CC-1');
    var t = await call(crm, 'POST', { customerId: AMP, action: 'log', type: 'task', subject: 'Send the datasheet' }, PM);
    assert.equal(t.activity.open, true);
    var n = await call(crm, 'POST', { customerId: AMP, action: 'log', type: 'note', subject: 'Likes blue' }, PM);
    assert.equal(n.activity.open, false);
    await call(crm, 'POST', { customerId: OTH, action: 'log', type: 'email', subject: 'Intro', followUpAt: '2026-09-26' }, PM);
    var today = await call(crm, 'GET', { followUps: '1' }, VIEWER);
    assert.deepEqual(today.followUps.map(function (f) { return [f.company, f.subject, f.followUpAt]; }),
      [['Other Co', 'Intro', '2026-09-26'], ['Amperage Capital', 'Deposit timing', '2026-09-30'], ['Amperage Capital', 'Send the datasheet', null]], 'earliest first, an undated task last');
    await rejects(call(crm, 'POST', { customerId: AMP, action: 'done', id: n.id }, PM), 400, /follow-up or a task/);
    await rejects(call(crm, 'POST', { customerId: OTH, action: 'done', id: l.id }, PM), 404, /not on this account/);
    await rejects(call(crm, 'POST', { customerId: AMP, action: 'done', id: l.id }, VIEWER), 403);
    assert.match((await call(crm, 'POST', { customerId: AMP, action: 'done', id: l.id }, PM)).note, /off Today/);
    assert.equal((await call(crm, 'POST', { customerId: AMP, action: 'done', id: l.id }, PM)).duplicate, true);
    await call(crm, 'POST', { customerId: AMP, action: 'done', id: t.id }, PM);
    today = await call(crm, 'GET', { followUps: '1' }, PM);
    assert.deepEqual(today.followUps.map(function (f) { return f.subject; }), ['Intro']);
    var acct = await call(crm, 'GET', { customerId: AMP }, PM);
    assert.equal(acct.followUps.length, 0);
    var call1 = acct.activity.filter(function (a) { return a.id === l.id; })[0];
    assert.equal(call1.done, true); assert.equal(call1.open, false); assert.equal(call1.doneBy, 'pm@cleancell.us');
    assert.equal(db.data.get(O + '/crm_followups/' + AMP + '__' + l.id).open, false, 'the index is closed, not deleted');
    assert.ok(acct.timeline.some(function (e) { return e.kind === 'follow-up-done' && /Deposit timing/.test(e.title); }));
    assert.equal(audits('crm-log').length, 4); assert.equal(audits('crm-done').length, 2);
  });
  await test('an order is logged against the account only when it is the account\'s', async function () {
    var ok = await call(crm, 'POST', { customerId: AMP, action: 'log', type: 'email', subject: 'Billed to Shannon, never stamped', orderId: 'amp2' }, PM);
    assert.equal(ok.activity.orderNo, 'CC-2');
    await rejects(call(crm, 'POST', { customerId: AMP, action: 'log', type: 'email', subject: 'x', orderId: 'oth1' }, PM), 400, /not on this account/);
    await rejects(call(crm, 'POST', { customerId: AMP, action: 'log', type: 'email', subject: 'x', orderId: 'cross' }, PM), 400, /not on this account/, 'billed to Shannon but stamped for another account');
    await rejects(call(crm, 'POST', { customerId: AMP, action: 'log', type: 'email', subject: 'x', orderId: 'joules1' }, PM), 400, /not on this account/, 'another workspace\'s order');
    await rejects(call(crm, 'POST', { customerId: AMP, action: 'log', type: 'email', subject: 'x', orderId: 'nope' }, PM), 400);
    await rejects(call(crm, 'POST', { customerId: AMP, action: 'log', type: 'fax', subject: 'x' }, PM), 400, /Choose call/);
    await rejects(call(crm, 'POST', { customerId: AMP, action: 'log', type: 'call', subject: 'x', followUpAt: '2026-02-30' }, PM), 400, /YYYY-MM-DD/);
    await rejects(call(crm, 'POST', { customerId: AMP, action: 'log', type: 'call', subject: 'x', at: '2031-01-01' }, PM), 400, /out of range/);
    await rejects(call(crm, 'POST', { customerId: AMP, action: 'log', type: 'call' }, PM), 400, /what the call was about/);
  });

  console.log('\ndocuments, both ways');
  await test('the office uploads office-only, shares it, the customer sees it and downloads it; the customer\'s upload lands on the account', async function () {
    var up = await upload(PM, crm, 'Supply agreement.pdf', PDF, { category: 'contract', note: 'signed copy', shared: false });
    assert.equal(up.file.shared, false); assert.equal(up.file.type, 'application/pdf'); assert.equal(up.file.path, undefined, 'the storage path never leaves');
    var rec = db.data.get(O + '/customers/' + AMP + '/files/' + up.id);
    assert.equal(rec.path, 'crm/' + ORG + '/' + AMP + '/' + up.id); assert.equal(rec.uploadState, 'stored');
    assert.equal(String(store[rec.path]).slice(0, 5), '%PDF-');
    assert.equal((await call(myFiles, 'GET', {}, SHANNON)).files.length, 0, 'office-only is not the customer\'s');
    await rejects(call(myFiles, 'GET', { file: up.id }, SHANNON), 404);
    await rejects(call(crm, 'POST', { customerId: AMP, action: 'file-share', id: up.id, shared: true }, VIEWER), 403);
    await rejects(call(crm, 'POST', { customerId: AMP, action: 'file-share', id: up.id }, PM), 400, /shared true or false/);
    assert.match((await call(crm, 'POST', { customerId: AMP, action: 'file-share', id: up.id, shared: true }, PM)).note, /customer sees it/);
    var theirs = await call(myFiles, 'GET', {}, CFO);
    assert.deepEqual(theirs.files.map(function (f) { return [f.name, f.from]; }), [['Supply agreement.pdf', 'office']]);
    assert.equal(theirs.files[0].uploadedBy, undefined, 'a supplier employee\'s address is not shown to the customer');
    var r = res(); await call(myFiles, 'GET', { file: up.id }, CFO, r);
    assert.equal(r.headers['Content-Type'], 'application/octet-stream'); assert.equal(r.headers['X-Content-Type-Options'], 'nosniff');
    assert.equal(r.headers['Content-Disposition'], 'attachment; filename="Supply agreement.pdf"'); assert.equal(String(r.body).slice(0, 5), '%PDF-');
    var mine = await upload(SHANNON, myFiles, 'bill.csv', b64('month,kwh\nJan,1200\n'), { category: 'utility-bill', note: 'Jan' });
    assert.equal(mine.file.from, 'customer'); assert.equal(mine.file.uploadedBy, 'shannon@amperagecapital.com');
    var office = await call(crm, 'GET', { customerId: AMP }, PM);
    assert.deepEqual(office.files.map(function (f) { return [f.name, f.from, f.shared]; }).sort(), [['Supply agreement.pdf', 'office', true], ['bill.csv', 'customer', true]]);
    assert.ok(office.timeline.some(function (e) { return e.kind === 'file-uploaded' && e.title === 'bill.csv uploaded by the customer'; }));
    var r2 = res(); await call(crm, 'GET', { customerId: AMP, file: mine.id }, PM, r2); assert.match(String(r2.body), /Jan,1200/);
    await rejects(call(crm, 'POST', { customerId: AMP, action: 'file-share', id: mine.id, shared: false }, PM), 409, /customer uploaded this/);
    await call(crm, 'POST', { customerId: AMP, action: 'file-share', id: up.id, shared: false }, PM);
    assert.deepEqual((await call(myFiles, 'GET', {}, SHANNON)).files.map(function (f) { return f.name; }), ['bill.csv'], 'unshared: only their own');
    assert.equal(audits('crm-file-upload').length, 2); assert.equal(audits('crm-file-share').length, 2);
  });
  await test('archiving a document is an administrator\'s; it is kept and leaves both lists', async function () {
    var up = await upload(PM, crm, 'drawing.pdf', PDF, { category: 'drawing', shared: true });
    await rejects(call(crm, 'POST', { customerId: AMP, action: 'file-archive', id: up.id }, PM), 403);
    await call(crm, 'POST', { customerId: AMP, action: 'file-archive', id: up.id }, ADMIN);
    assert.equal((await call(crm, 'GET', { customerId: AMP }, PM)).files.length, 0);
    assert.equal((await call(myFiles, 'GET', {}, SHANNON)).files.length, 0);
    await rejects(call(myFiles, 'GET', { file: up.id }, SHANNON), 404);
    await rejects(call(crm, 'GET', { customerId: AMP, file: up.id }, PM), 404);
    assert.equal(db.data.get(O + '/customers/' + AMP + '/files/' + up.id).archived, true);
    assert.ok(store['crm/' + ORG + '/' + AMP + '/' + up.id], 'the bytes are kept');
    var tl = (await call(crm, 'GET', { customerId: AMP }, PM)).timeline.filter(function (e) { return e.kind === 'file-uploaded'; });
    assert.match(tl[0].detail, /since archived/);
  });
  await test('another account\'s customer, a pending colleague and an unverified address see nothing', async function () {
    var up = await upload(PM, crm, 'offer.pdf', PDF, { shared: true });
    var mine = await upload(SHANNON, myFiles, 'survey.png', PNG, { category: 'site-survey' });
    assert.equal((await call(myFiles, 'GET', {}, OTHER)).files.length, 0);
    await rejects(call(myFiles, 'GET', { file: up.id }, OTHER), 404);
    await rejects(call(myFiles, 'GET', { file: mine.id }, OTHER), 404);
    await rejects(call(myFiles, 'GET', {}, NEWBIE), 403, /waiting for approval/);
    await rejects(upload(NEWBIE, myFiles, 'x.pdf', PDF), 403, /waiting for approval/);
    await rejects(call(myFiles, 'GET', {}, Object.assign(buyer('shannon@amperagecapital.com'), { claims: { email_verified: false } })), 403, /confirm your email/);
    await rejects(call(myFiles, 'GET', {}, buyer('stranger@nowhere.example')), 403, /Open your customer account first/);
    /* the account a customer acts on comes from the token; naming another in the body does nothing */
    var named = await upload(OTHER, myFiles, 'theirs.pdf', b64('%PDF-1.7 other'), { customerId: AMP });
    assert.ok(db.data.get(O + '/customers/' + OTH + '/files/' + named.id)); assert.equal(db.data.get(O + '/customers/' + AMP + '/files/' + named.id), undefined);
    db.seed(O + '/customers/' + AMP + '/users/cfo@amperagecapital.com', { email: 'cfo@amperagecapital.com', role: 'user', status: 'disabled' });
    await rejects(call(myFiles, 'GET', {}, CFO), 403, /disabled/);
    db.seed(O + '/customers/' + AMP, { orgId: ORG, name: 'Amperage Capital', status: 'suspended' });
    await rejects(call(myFiles, 'GET', {}, SHANNON), 403, /disabled/);
  });

  console.log('\nwhat a document may be');
  await test('decided by the bytes: size, type, zip, disguised binaries, names and a spoofed path', async function () {
    var big = Buffer.alloc(2 * 1024 * 1024 + 1, 32); big.write('%PDF-', 0);
    await rejects(upload(PM, crm, 'big.pdf', big.toString('base64')), 400, /2 MB/);
    await rejects(upload(SHANNON, myFiles, 'big.pdf', big.toString('base64')), 400, /2 MB/);
    await rejects(upload(PM, crm, 'setup.pdf', Buffer.from([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0]).toString('base64')), 400, /Only PDF/);
    await rejects(upload(SHANNON, myFiles, 'notes.txt', Buffer.from([0x4d, 0x5a, 0, 0, 0x50]).toString('base64')), 400, /Only PDF/);
    await rejects(upload(SHANNON, myFiles, 'bundle.zip', Buffer.concat([Buffer.from([0x50, 0x4b, 3, 4]), Buffer.from('payload.exe')]).toString('base64')), 400, /Excel/);
    await rejects(upload(SHANNON, myFiles, 'fake.xlsx', Buffer.concat([Buffer.from([0x50, 0x4b, 3, 4]), Buffer.from('[Content_Types].xml word/document.xml')]).toString('base64')), 400, /Excel/);
    await rejects(upload(PM, crm, 'x.pdf', 'not base64!!'), 400);
    await rejects(upload(PM, crm, '', PDF), 400, /File name is required/);
    await rejects(call(crm, 'POST', { customerId: AMP, action: 'file-upload', category: 'contract' }, PM), 400, /Choose a file/);
    await rejects(upload(PM, crm, 'a.pdf', PDF, { category: 'secret-plans' }), 400, /category/);
    var png = await upload(PM, crm, '../../etc/Survey <photo>.pdf', PNG, { path: 'crm/' + ORG + '/' + OTH + '/stolen', category: 'po' });
    assert.equal(png.file.name, 'Survey _photo_.png', 'the directory is dropped, odd characters replaced, the extension is what the bytes are');
    assert.equal(png.file.type, 'image/png'); assert.equal(png.file.category, 'purchase-order');
    assert.equal(db.data.get(O + '/customers/' + AMP + '/files/' + png.id).path, 'crm/' + ORG + '/' + AMP + '/' + png.id, 'the path is the endpoint\'s, never the request\'s');
    assert.equal(store['crm/' + ORG + '/' + OTH + '/stolen'], undefined);
    var xlsx = await upload(SHANNON, myFiles, 'sites.xlsx', Buffer.concat([Buffer.from([0x50, 0x4b, 3, 4]), Buffer.from('[Content_Types].xml xl/workbook.xml')]).toString('base64'));
    assert.equal(xlsx.file.type, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    var dataUrl = await upload(SHANNON, myFiles, 'scan.pdf', 'data:application/pdf;base64,' + b64('%PDF-1.3 scan'));
    assert.equal(dataUrl.file.name, 'scan.pdf');
    assert.equal(C.disposition('a"b\r\nc.pdf'), 'attachment; filename="a_b__c.pdf"');
  });
  await test('a record whose path points at another account is refused rather than followed', async function () {
    store['crm/' + ORG + '/' + OTH + '/f_theirs'] = Buffer.from('%PDF-1.4 other co');
    db.seed(O + '/customers/' + AMP + '/files/f_bad', { orgId: ORG, customerId: AMP, name: 'x.pdf', from: 'office', shared: true, archived: false, uploadState: 'stored', uploadedAt: '2026-09-20T00:00:00Z', path: 'crm/' + ORG + '/' + OTH + '/f_theirs' });
    await rejects(call(crm, 'GET', { customerId: AMP, file: 'f_bad' }, PM), 404);
    await rejects(call(myFiles, 'GET', { file: 'f_bad' }, SHANNON), 404);
    await rejects(call(crm, 'GET', { customerId: AMP, file: '../f_bad' }, PM), 400);
  });
  await test('the same document twice is one document and spends no allowance; the 21st upload of the day is refused; the count is not on the customer record', async function () {
    var a = await upload(SHANNON, myFiles, 'po.pdf', PDF), b = await upload(CFO, myFiles, 'po.pdf', PDF);
    assert.equal(b.duplicate, true); assert.equal(b.id, a.id); assert.match(b.note, /already on your account/);
    var office = await upload(PM, crm, 'po.pdf', PDF);
    assert.equal(office.duplicate, false, 'the office\'s copy is its own document');
    for (var i = 1; i < 20; i++) await upload(i % 2 ? SHANNON : CFO, myFiles, 'page' + i + '.txt', b64('page ' + i + '\n'));
    await rejects(upload(SHANNON, myFiles, 'page20.txt', b64('page 20\n')), 429, /20 documents today/);
    var usage = docsUnder(O + '/crm_upload_usage/');
    assert.equal(usage.length, 1); assert.equal(usage[0].count, 20); assert.equal(usage[0].customerId, AMP); assert.match(usage[0]._id, /^acct_amperage__\d{4}-\d{2}-\d{2}$/);
    assert.equal(db.data.get(O + '/customers/' + AMP).crmUploadUsage, undefined);
    assert.equal((await upload(OTHER, myFiles, 'mine.txt', b64('hello\n'))).ok, true, 'the allowance is per account');
    assert.equal((await upload(PM, crm, 'office-more.txt', b64('office\n'))).ok, true, 'the office is not on the customer\'s allowance');
    var listed = await call(myFiles, 'GET', {}, SHANNON);
    assert.equal(listed.files.length, 20); assert.equal(listed.dailyUploads, 20);
    assert.ok(listed.files.every(function (f) { return f.from === 'customer'; }));
  });
  await test('a failed store says so: no audit of an upload, a 502, nothing listed', async function () {
    failSave = true;
    await quietly(function () { return rejects(upload(PM, crm, 'lost.pdf', PDF), 502, /could not be stored/); });
    var recs = docsUnder(O + '/customers/' + AMP + '/files/');
    assert.equal(recs.length, 1); assert.equal(recs[0].uploadState, 'failed');
    assert.equal(audits('crm-file-upload').length, 0);
    assert.equal((await call(crm, 'GET', { customerId: AMP }, PM)).files.length, 0);
  });
  await test('a customer never sees a helper\'s message: a failed store is reworded', async function () {
    failSave = true;
    var e = await quietly(function () { return rejects(upload(SHANNON, myFiles, 'boom.pdf', PDF), 500); });
    assert.equal(e.message, 'Something went wrong on our side. Please try again.');
  });

  console.log('\nthe timeline');
  await test('priced then accepted is two moments, together is one; custody, sites, designs and the design trial are on it; newest first', async function () {
    db.seed('plant_units/' + ORG + '__S1', { orgId: ORG, serial: 'S1', orderId: 'amp1', shipUnit: true, custody: { status: 'assigned', receivedAt: '2026-09-18', assignedAt: '2026-09-19', siteId: 'site_farm', siteName: 'Farm A', declaredBy: 'customer', confirmedAt: null } });
    db.seed('plant_units/' + ORG + '__S2', { orgId: ORG, serial: 'S2', orderId: 'amp1', shipUnit: true, custody: { status: 'assigned', receivedAt: '2026-09-18', assignedAt: '2026-09-19', siteId: 'site_farm', siteName: 'Farm A', declaredBy: 'customer' } });
    db.seed('plant_units/' + ORG + '__S9', { orgId: ORG, serial: 'S9', orderId: 'oth1', shipUnit: true, custody: { status: 'received', receivedAt: '2026-09-18' } });
    db.seed(O + '/sites/site_farm', { orgId: ORG, customerId: AMP, name: 'Farm A', address: { city: 'Joliet', state: 'IL' }, source: 'customer', createdAt: '2026-09-17T08:00:00Z', createdBy: 'shannon@amperagecapital.com' });
    db.seed(O + '/sites/site_other', { orgId: ORG, customerId: OTH, name: 'Not theirs', createdAt: '2026-09-17T08:00:00Z' });
    db.seed(O + '/customers/' + AMP + '/projects/p1', { name: 'Farm A layout', revision: 3, createdAt: '2026-09-16T00:00:00Z', updatedAt: '2026-09-18T12:00:00Z' });
    db.seed('omega_audit/t1', { action: 'buyer-editor-trial', orgId: ORG, customerId: AMP, by: 'tom@clearsky-usa.com', at: '2026-09-15T12:00:00Z', grant: { status: 'trial', expiresAt: '2026-09-29T12:00:00Z' } });
    db.seed('omega_audit/t2', { action: 'buyer-editor-trial', orgId: ORG, customerId: OTH, by: 'tom@clearsky-usa.com', at: '2026-09-15T12:00:00Z', grant: { status: 'trial' } });
    var tl = (await call(crm, 'GET', { customerId: AMP }, PM)).timeline, titles = tl.map(function (e) { return e.title; });
    function has(t) { assert.ok(titles.indexOf(t) >= 0, 'missing: ' + t + '\n' + titles.join('\n')); }
    has('Order CC-1 priced'); has('Order CC-1 accepted'); has('Order CC-2 priced and accepted');
    assert.ok(titles.indexOf('Order CC-2 accepted') < 0);
    assert.equal(tl.filter(function (e) { return e.title === 'Order CC-1 priced'; })[0].at, '2026-09-11T09:00:00.000Z');
    has('Deposit invoice INV-7 issued · order CC-1'); has('Deposit invoice INV-7 paid · order CC-1');
    has('2 units received'); has('2 units assigned to Farm A by the customer');
    has('Site Farm A added by the customer'); has('Design Farm A layout started by the customer'); has('Design Farm A layout saved by the customer');
    has('Design tool trial granted');
    has('Shannon Johnson (shannon@amperagecapital.com) joined the account'); has('CFO (cfo@amperagecapital.com) was added to the account');
    has('new@amperagecapital.com asked to join the account');
    assert.ok(!titles.some(function (t) { return /Not theirs|CC-OTH|CC-X|J-1/.test(t); }), 'nothing of another account or workspace');
    assert.equal(tl.filter(function (e) { return e.kind === 'unit-received'; })[0].detail, 'S1, S2');
    for (var i = 1; i < tl.length; i++) assert.ok(C.millis(tl[i - 1].at) >= C.millis(tl[i].at), 'newest first');
  });
  await test('the design tool\'s current grant stands in when there is no audit of it', async function () {
    var out = C.timeline({ editorLite: { status: 'active', source: 'provider', plan: 'year', updatedAt: '2026-09-20T00:00:00Z' } });
    assert.deepEqual(out.map(function (e) { return [e.kind, e.title, e.detail]; }), [['design-subscription', 'Design tool subscription active', 'yearly']]);
    var sub = C.timeline({ editorEvents: [{ action: 'customer-editor-lite', at: '2026-09-21T00:00:00Z', by: 'stripe', grant: { status: 'past_due', plan: 'month' } }], editorLite: { status: 'active', source: 'provider', updatedAt: '2026-09-20T00:00:00Z' } });
    assert.deepEqual(sub.map(function (e) { return e.title; }), ['Design tool subscription payment overdue']);
    assert.deepEqual(C.timeline({ orders: [{ id: 'x', createdAt: 'not a date', orderNo: 'N' }] }), [], 'no time on the record: left out, not invented');
  });
  await test('the office\'s note on a document it shares stays in the office; a customer\'s own note is theirs', async function () {
    assert.equal(C.fileView('f1', { name: 'a.pdf', from: 'office', shared: true, note: 'floor is $410/kWh' }, 'customer').note, '');
    assert.equal(C.fileView('f1', { name: 'a.pdf', from: 'office', shared: true, note: 'floor is $410/kWh' }, 'office').note, 'floor is $410/kWh');
    assert.equal(C.fileView('f2', { name: 'b.pdf', from: 'customer', note: 'our site plan' }, 'customer').note, 'our site plan');
  });

  console.log('\n' + count + ' passed');
})().catch(function (e) { console.error('FAIL', e && e.stack || e); process.exit(1); });
