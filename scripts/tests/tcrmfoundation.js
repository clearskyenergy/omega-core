#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * The CRM relaunch foundation (docs/CRM-RELAUNCH.md). Holds the attachment
 * rules in omega-crm-foundation.js and that the preview page only renders
 * them: no Firebase, no API, no place in the existing navigation. */
'use strict';
var assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm');
var ROOT = path.join(__dirname, '../..');
var F = require(path.join(ROOT, 'omega-crm-foundation.js'));
var count = 0;

assert.deepEqual(F.KINDS, ['project', 'site', 'design', 'analysis', 'proposal', 'order', 'document']); count++;
['hubspot', 'salesforce', 'zoho', 'pipedrive', 'gohighlevel', 'aurora', 'enerflo', 'jobnimbus'].forEach(function (key) {
  assert.ok(F.PROVIDERS.some(function (p) { return p.key === key; }), key); count++;
});
assert.equal(F.FIELDS.project.filter(function (f) { return f.key === 'kw'; })[0].owner, 'omega', 'capacity is never the CRM\'s'); count++;
assert.equal(F.FIELDS.project.filter(function (f) { return f.key === 'capex'; })[0].owner, 'omega'); count++;
assert.equal(F.FIELDS.project.filter(function (f) { return f.key === 'stage'; })[0].owner, 'either'); count++;

var link = F.linkInput({ kind: 'project', objectId: 'p_oakland', accountId: 'acct_riverside', role: 'customer', contactId: 'ct_jordan', sharedWith: ['Helios.Example'] });
assert.equal(link.sharedWith[0], 'helios.example'); count++;
assert.throws(function () { F.linkInput({ kind: 'drawing', objectId: 'p', accountId: 'a', role: 'customer' }); }, /Choose a project/); count++;
assert.throws(function () { F.linkInput({ kind: 'project', objectId: '../x', accountId: 'a', role: 'customer' }); }, /not valid/); count++;
assert.throws(function () { F.linkInput({ kind: 'project', objectId: 'p', accountId: 'a', role: 'buyer' }); }, /Choose a role/); count++;

var first = F.applyLink([], { kind: 'project', objectId: 'p1', accountId: 'acct_a', role: 'customer' });
assert.equal(first.created, true); assert.equal(first.links.length, 1); count += 2;
var again = F.applyLink(first.links, { kind: 'project', objectId: 'p1', accountId: 'acct_a', role: 'customer', contactId: 'ct_1', title: 'Buyer' });
assert.equal(again.created, false); assert.equal(again.links.length, 1); assert.equal(again.links[0].title, 'Buyer'); count += 3;
assert.throws(function () { F.applyLink(first.links, { kind: 'project', objectId: 'p1', accountId: 'acct_b', role: 'customer' }); }, /already has a customer/); count++;
var withUtility = F.applyLink(first.links, { kind: 'project', objectId: 'p1', accountId: 'acct_util', role: 'utility' });
assert.equal(withUtility.links.length, 2); assert.equal(F.primaryAccount(withUtility.links, 'project', 'p1'), 'acct_a'); count += 2;
assert.equal(first.links.length, 1, 'applyLink does not mutate the list it was given'); count++;

var ref = F.externalRef({ provider: 'hubspot', kind: 'project', objectId: 'p1', remoteType: 'deals', remoteId: '18442201' });
assert.equal(ref.provider, 'hubspot'); count++;
assert.throws(function () { F.externalRef({ provider: 'monday', kind: 'project', objectId: 'p1', remoteType: 'board', remoteId: '1' }); }, /Choose a CRM/); count++;

var conflict = F.judgeField(
  { key: 'stage', label: 'Stage', owner: 'either' },
  { value: 'Candidate', at: '2026-10-17T14:02:00Z' },
  { value: 'Qualified', at: '2026-10-17T16:40:00Z' },
  '2026-10-15T12:00:00Z');
assert.equal(conflict.status, 'conflict'); assert.equal(conflict.value, ''); count += 2;
var kept = F.judgeField(
  { key: 'kw', label: 'Power (kW)', owner: 'omega' },
  { value: '75', at: '2026-10-17T14:02:00Z' },
  { value: '100', at: '2026-10-17T16:41:00Z' },
  '2026-10-15T12:00:00Z');
assert.equal(kept.status, 'kept'); assert.equal(kept.value, '75'); count += 2;

var model = F.sample();
var rows = F.portfolioRows(model, model.links);
assert.deepEqual(rows.map(function (r) { return r.account.id; }), ['acct_northline', 'acct_riverside']); count++;
assert.equal(rows[0].sync, 'conflict'); assert.equal(rows[1].sync, 'synced'); count += 2;
assert.equal(rows[1].projects, 1); assert.equal(rows[1].orders, 1); assert.equal(rows[1].analyses, 1); count += 3;
var profile = F.profileOf(model, model.links, 'acct_riverside');
var garage = profile.work.filter(function (w) { return w.object && w.object.id === 'p_oakland'; })[0];
assert.ok(garage.parties.some(function (p) { return p.role === 'utility' && p.account.id === 'acct_pge'; })); count++;
assert.ok(garage.parties.some(function (p) { return p.role === 'capital' && p.account.id === 'acct_helios'; })); count++;
assert.equal(F.profileOf(model, model.links, 'missing'), null); count++;
var judged = F.judgeBundle(model.sync[1]);
assert.equal(judged.status, 'conflict');
assert.equal(judged.rows.filter(function (r) { return r.key === 'kw'; })[0].status, 'kept'); count += 2;

var page = fs.readFileSync(path.join(ROOT, 'crm-foundation.html'), 'utf8');
var code = page.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
assert.ok(page.indexOf('ClearSky Energy Solutions LLC. Proprietary and Confidential') >= 0); count++;
assert.ok(page.indexOf('/omega-crm-foundation.js') >= 0); count++;
assert.ok(!/firebase|omega-tenant|omega-sso|firestore/i.test(code), 'the preview does not boot the product'); count++;
assert.ok(!/fetch\s*\(/.test(page), 'the preview does not call the network'); count++;
assert.ok(page.indexOf('crm-foundation') >= 0); count++;
['index.html', 'workspace.html', 'portfolio.html', 'editor.html', 'omega-prime.html', 'orders.html'].forEach(function (f) {
  var src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  assert.ok(src.indexOf('crm-foundation') < 0, f + ' does not link the preview'); count++;
});
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'omega-crm-foundation.js'), 'utf8'), { window: {}, module: { exports: {} }, console: console }); count++;

console.log('tcrmfoundation: ' + count + ' assertions passed');
