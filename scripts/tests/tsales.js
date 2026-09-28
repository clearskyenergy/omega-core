#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   scripts/tests/tsales.js — the sales database: the rules (api/_lib/sales.js),
   the endpoint (api/sales.js) and the website's demo form
   (api/demo-request.js), on the in-memory Firestore double. No network.

   Pinned here because an agent acts on them: who may be written to, what a
   LinkedIn post may say, that a stage never moves backwards on an agent's
   word, that a machine key never reads the book unless ClearSky holds it,
   and that the form stores a lead before it says "Received". */
'use strict';
var assert = require('node:assert/strict');
var crypto = require('crypto');
var FD = require('../_lib/firestore-double'), DB = FD.DB, mock = FD.mock;

var DAY = 86400000, HOUR = 3600000;
var NOW = Date.parse('2026-09-30T15:00:00Z');   /* a Wednesday */
function ago(d) { return new Date(NOW - d * DAY).toISOString(); }
function ahead(d) { return new Date(NOW + d * DAY).toISOString(); }
var n = 0;
function test(name, fn) { fn(); n++; console.log('PASS ' + name); }
async function atest(name, fn) { await fn(); n++; console.log('PASS ' + name); }
async function rejects(p, status, re) {
  try { await p; } catch (e) { assert.equal(e.status, status, e.message); if (re) assert.match(e.message, re); return e; }
  throw new Error('expected a ' + status);
}

var S = require('../../api/_lib/sales');

/* ── the rules ── */
test('a company is its work domain; a public mailbox is that one person', function () {
  assert.equal(S.prospectIdFor({ email: 'Ann@CleanCell.us' }), 'cleancell.us');
  assert.equal(S.prospectIdFor({ website: 'https://www.cleancell.us/about' }), 'cleancell.us');
  assert.equal(S.prospectIdFor({ email: 'jane.doe@gmail.com' }), 'jane.doe@gmail.com');
  assert.equal(S.prospectIdFor({ email: 'not-an-email' }), '');
  assert.equal(S.normDomain('cleancell.us/customers/x'), 'cleancell.us', 'a path is cut off, never kept');
  assert.equal(S.normDomain('../../etc'), '');
});
test('a stage only moves forward; won and lost are ends; lost is never automatic', function () {
  assert.equal(S.forward('contacted', 'demo'), 'demo');
  assert.equal(S.forward('demo', 'contacted'), 'demo');
  assert.equal(S.forward('trial', 'lost'), 'trial');
  assert.equal(S.forward('won', 'proposal'), 'won');
  assert.equal(S.forward(undefined, 'target'), 'target');
  assert.equal(S.forward('target', 'nonsense'), 'target');
});
test('a merge is additive: contacts join, evidence dedupes, a typed name survives a harvest, the stage holds', function () {
  var e = { id: 'acme.example', company: 'ACME Solar (typed)', stage: 'demo', contacts: [{ name: 'Ann', email: 'ann@acme.example' }], evidence: [{ url: 'https://x.example/list', text: 'on the list' }] };
  var inc = S.cleanProspect({ domain: 'acme.example', company: 'Acme Solar LLC', stage: 'target', vertical: 'installer',
    contacts: [{ email: 'ann@acme.example', title: 'Ops' }, { name: 'Bo', email: 'bo@acme.example' }],
    evidence: [{ url: 'https://x.example/list', text: 'dup' }, { text: 'NABCEP listed' }] }).prospect;
  var m = S.mergeProspect(e, inc, NOW);
  assert.equal(m.company, 'ACME Solar (typed)'); assert.equal(m.vertical, 'installer'); assert.equal(m.stage, 'demo');
  assert.deepEqual(m.contacts.map(function (c) { return c.email; }), ['ann@acme.example', 'bo@acme.example']);
  assert.equal(m.contacts[0].title, 'Ops', 'a new fact fills a blank');
  assert.equal(m.evidence.length, 2);
  var o = S.mergeProspect(e, inc, NOW, { overwrite: true });
  assert.equal(o.company, 'Acme Solar LLC', 'staff may overwrite on purpose');
});
test('screen: the off-limits floor, the do-not-contact list, public mailboxes and robots', function () {
  var ctx = { suppressed: { 'stop@acme.example': 1, '*@blocked.example': 1 }, offLimits: [{ domain: 'mid-deal.example', why: 'mid-negotiation' }] };
  assert.equal(S.screen('derek@fenecon.de', ctx).ok, false);
  assert.match(S.screen('someone@us.fenecon.com', ctx).reason, /FENECON/);
  assert.match(S.screen('grant@sunesol.com', ctx).reason, /OSA JV/);
  assert.match(S.screen('x@lionheartenergy.com', ctx).reason, /Never contact/);
  assert.match(S.screen('stop@acme.example', ctx).reason, /do-not-contact/);
  assert.match(S.screen('a@sub.blocked.example', ctx).reason, /domain is on the do-not-contact/);
  assert.match(S.screen('b@mid-deal.example', ctx).reason, /mid-negotiation/);
  assert.match(S.screen('noreply@acme.example', ctx).reason, /not a person/);
  assert.match(S.screen('jane@gmail.com', ctx).reason, /public mailbox/);
  assert.equal(S.screen('jane@gmail.com', { inbound: true }).ok, true, 'fine when they wrote to us first');
  var info = S.screen('info@acme.example', ctx);
  assert.equal(info.ok, true); assert.match(info.warn, /shared inbox/);
  assert.equal(S.screen('ann@acme.example', ctx).ok, true);
});
test('the demo form: the honeypot is silent, a bad address is named, the source is kept', function () {
  assert.deepEqual(S.validDemo({ name: 'Bot', email: 'b@x.example', website: 'http://spam' }), { ok: false, spam: true });
  assert.match(S.validDemo({ name: 'Jane', email: 'nope' }).error, /email/);
  assert.match(S.validDemo({ email: 'j@x.example' }).error, /name/);
  var v = S.validDemo({ name: ' Jane ', email: 'Jane@Acme.Example', message: 'line one\nline two', source: { utm_source: 'LinkedIn', utm_campaign: 'w40-site-screen', ref: 'www.linkedin.com' } });
  assert.equal(v.ok, true); assert.equal(v.value.name, 'Jane'); assert.equal(v.value.email, 'jane@acme.example');
  assert.equal(v.value.message, 'line one\nline two'); assert.equal(v.value.source.utm_source, 'linkedin');
  assert.equal(S.sourceOf(v.value.source), 'linkedin');
  assert.equal(S.sourceOf({ ref: 'www.linkedin.com' }), 'linkedin');
  assert.equal(S.sourceOf({ ref: 'lnkd.in' }), 'linkedin');
  assert.equal(S.sourceOf({}), 'direct');
});
test('LinkedIn: no prices, no price list, no coming-soon feature sold as shipping', function () {
  [ 'Plans from $500 a month. https://www.clearskyomega.com/?utm_source=linkedin',
    'Only 1,299/month for the Field plan https://www.clearskyomega.com/?utm_source=linkedin',
    'See our pricing: https://www.clearskyomega.com/?utm_source=linkedin',
    'Everything is on https://silmarillion.clearskyomega.com/offerings',
    'Two months free on annual! https://www.clearskyomega.com/?utm_source=linkedin'
  ].forEach(function (t) { var r = S.lintPost(t); assert.equal(r.ok, false, t); assert.ok(r.problems.some(function (p) { return /no prices|price list/.test(p); }), t); });
  var ahj = S.lintPost('Submit your permit in the AHJ Approval Portal. https://www.clearskyomega.com/ahj.html?utm_source=linkedin');
  assert.equal(ahj.ok, false); assert.match(ahj.problems.join(' '), /coming soon/);
  assert.equal(S.lintPost('The AHJ Approval Portal is coming soon. https://www.clearskyomega.com/ahj.html?utm_source=linkedin').ok, true);
  var good = S.lintPost('We screened 40 ComEd parcels for grid headroom this week. Bring one parcel: https://www.clearskyomega.com/contact.html');
  assert.equal(good.ok, true); assert.match(good.warnings.join(' '), /untagged link/);
});
test('tagLinks tags our links only, keeps the anchor, and never double-tags', function () {
  var t = S.tagLinks('A https://www.clearskyomega.com/platform.html#a and https://example.com/x and https://www.clearskyomega.com/?utm_source=x', 'w40 site screen');
  assert.match(t, /platform\.html\?utm_source=linkedin&utm_medium=social&utm_campaign=w40-site-screen#a/);
  assert.match(t, /https:\/\/example\.com\/x /);
  assert.match(t, /\?utm_source=x$/);
  assert.equal(S.lintPost(t + ' more').warnings.filter(function (w) { return /untagged/.test(w); }).length, 0);
});
test('business days: a Friday-evening request answered Monday morning waited less than a day', function () {
  var fri = Date.parse('2026-09-25T22:00:00Z'), mon = Date.parse('2026-09-28T09:00:00Z');
  assert.ok(S.businessDays(fri, mon) < 1);
  assert.ok(Math.abs(S.businessDays(Date.parse('2026-09-28T09:00:00Z'), Date.parse('2026-09-30T09:00:00Z')) - 2) < 1e-9);
});
test('the dashboard: approvals, unanswered requests (a draft is not an answer), sources, LinkedIn and what to change', function () {
  var board = { summary: { trial: 2, paying: 3, pastDue: 0 }, tenants: [
    { orgId: 'slow.example', name: 'Slow', lifecycle: 'pending', who: 'sam@slow.example', days: { sinceSignup: 2.2 }, flags: ['awaiting-approval'], priority: 3 },
    { orgId: 'end.example', name: 'End', lifecycle: 'trial', who: 'e@end.example', action: 'Send End the proposal', why: 'trial ends', priority: 3, days: {} } ] };
  var orgs = [
    { orgId: 'a.example', selfServe: true, createdAt: ago(10), approvedAt: new Date(NOW - 10 * DAY + 5 * HOUR).toISOString() },
    { orgId: 'b.example', selfServe: true, createdAt: ago(8), approvedAt: new Date(NOW - 8 * DAY + 50 * HOUR).toISOString() },
    { orgId: 'seed.example', selfServe: false, createdAt: ago(5), approvedAt: ago(5) },
    { orgId: 'slow.example', selfServe: true, createdAt: ago(2.2), approvedAt: null } ];
  var acts = [
    { id: 'd1', kind: 'demo-request', at: ago(3), prospectId: 'jane.example', name: 'Jane', email: 'jane@jane.example', source: { utm_source: 'linkedin', utm_campaign: 'w39' } },
    { id: 'x1', kind: 'email-drafted', at: ago(2.5), prospectId: 'jane.example', ref: 'g1' },
    { id: 'd2', kind: 'demo-request', at: ago(4), prospectId: 'kim.example', name: 'Kim', email: 'kim@kim.example', source: {} },
    { id: 'x2', kind: 'email-sent', at: ago(3.9), prospectId: 'kim.example', ref: 'g2' },
    { id: 'l1', kind: 'linkedin-drafted', at: ago(6), ref: 'post-w39', summary: 'Grid headroom post', campaign: 'w39' },
    { id: 'l2', kind: 'linkedin-published', at: ago(5), ref: 'post-w39', url: 'https://www.linkedin.com/feed/update/1' },
    { id: 'l3', kind: 'linkedin-stats', at: ago(1), ref: 'post-w39', stats: { impressions: 900, reactions: 14, clicks: 22 } } ];
  var prospects = [
    { id: 'jane.example', company: 'Jane Co', stage: 'contacted', score: 60, next: { action: 'Reply to Jane', due: '2026-09-29' }, contacts: [{ email: 'jane@jane.example' }] },
    { id: 'acme.example', company: 'Acme', stage: 'target', score: 20 },
    { id: 'won.example', company: 'Won', stage: 'won', score: 0 } ];
  var d = S.dashboard({ board: board, orgs: orgs, prospects: prospects, activity: acts, config: {}, suppressed: 2 }, NOW);
  assert.equal(d.approvals.pending.length, 1); assert.equal(d.approvals.pending[0].url, '/admin/tenant?org=slow.example');
  assert.equal(d.approvals.signups30, 3, 'self-serve signups only; a seeded workspace kept nobody waiting');
  assert.equal(d.approvals.medianHours30, 27.5); assert.equal(d.approvals.sameDay30, 1); assert.equal(d.approvals.overADay30, 2);
  assert.deepEqual(d.inbound.unanswered.map(function (u) { return u.email; }), ['jane@jane.example'], 'Kim got a send; Jane only a draft');
  assert.deepEqual(d.inbound.bySource30, [{ key: 'direct', count: 1 }, { key: 'linkedin', count: 1 }]);
  assert.equal(d.linkedin.published30, 1); assert.equal(d.linkedin.leads30, 1);
  assert.equal(d.linkedin.posts[0].stats.clicks, 22); assert.equal(d.linkedin.posts[0].url, 'https://www.linkedin.com/feed/update/1');
  assert.equal(d.outreach.d30.drafted, 1); assert.equal(d.outreach.d30.sent, 1);
  assert.equal(d.funnel.prospects.contacted, 1); assert.equal(d.funnel.openProspects, 2); assert.equal(d.prospects.due, 1);
  assert.deepEqual(d.today.slice(0, 4).map(function (t) { return t.kind; }), ['approve', 'reply', 'account', 'prospect']);
  var words = d.suggestions.map(function (s) { return s.text; }).join(' | ');
  assert.match(words, /1 signup waiting for approval; the oldest 2 days/);
  assert.match(words, /Median time to approve a signup is 27.5 hours/);
  assert.match(words, /1 demo request unanswered after a business day/);
  assert.match(words, /Cold email is blocked/);
  assert.equal(d.config.postalAddressSet, false); assert.equal(d.suppressed, 2);
});

/* ── the endpoint, on the Firestore double ── */
var db = new DB();
var sent = [];
var A = { db: function () { return db; }, handler: function (f) { return f; }, authenticate: async function (r) { if (!r.caller) { var e = new Error('invalid token'); e.status = 401; throw e; } return r.caller; },
  httpError: function (s, m) { var e = new Error(m); e.status = s; return e; }, FieldValue: function () { return {}; },
  safeOrg: function (v) { v = String(v || '').toLowerCase(); return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(v) ? v : ''; } };
mock('../api/_lib/admin', A);
mock('../api/_lib/mail', { templates: { demoRequestAlert: async function (o) { sent.push(o); return { ok: true }; } } });
Date.now = function () { return NOW; };
var api = require('../../api/sales');
var demo = require('../../api/demo-request');

var STAFF = { uid: 's', email: 'tom@clearsky-usa.com', staff: true };
var TENANT = { uid: 't', email: 'ann@northstar.example', orgId: 'northstar.example', staff: false };
function key(label, o) {
  var k = 'omega_ak_' + crypto.createHash('sha256').update(label).digest('hex').slice(0, 48);
  db.seed('agent_keys/' + crypto.createHash('sha256').update(k).digest('hex'), Object.assign({ orgId: 'clearsky-usa.com', label: label, active: true }, o));
  return k;
}
var AGENT = key('sales agent', { admin: true, scopes: ['growth:read', 'sales:read', 'sales:write'] });
var READER = key('jarvis reader', { admin: true, scopes: ['sales:read'] });
var TENANTKEY = key('a tenant gpt', { orgId: 'ogisolar.com', admin: false, scopes: ['sales:read', 'sales:write'] });
function get(query, who) { return Promise.resolve().then(function () { return api({ method: 'GET', query: query || {}, headers: typeof who === 'string' ? { authorization: 'Bearer ' + who } : {}, caller: typeof who === 'string' ? null : (who || STAFF) }, {}); }); }
function post(body, who) { return Promise.resolve().then(function () { return api({ method: 'POST', body: body, query: {}, headers: typeof who === 'string' ? { authorization: 'Bearer ' + who } : {}, caller: typeof who === 'string' ? null : (who || STAFF) }, {}); }); }
var ip = 0;
function form(body) { ip++; return Promise.resolve().then(function () { return demo({ method: 'POST', body: body, headers: { 'x-forwarded-for': '10.0.0.' + ip, origin: 'https://www.clearskyomega.com' } }, {}); }); }

db.seed('omega_orgs/clearsky-usa.com', { name: 'ClearSky', status: 'active' });
db.seed('omega_orgs/pendingco.example', { name: 'Pendingco', status: 'pending', createdAt: ago(1.5), signup: { email: 'sam@pendingco.example' } });
db.seed('omega_orgs/pendingco.example/billing/current', { tier: 'trial', trialEndsAt: ahead(14) });
db.seed('omega_orgs/trialco.example', { name: 'Trialco', status: 'active', createdAt: ago(12), approvedAt: ago(11), signup: { email: 'tia@trialco.example' } });
db.seed('omega_orgs/trialco.example/billing/current', { tier: 'trial', trialEndsAt: ahead(2) });

(async function () {
  await atest('who: a tenant and a tenant\'s key are refused; a ClearSky key needs the scope; staff read', async function () {
    await rejects(get({}, TENANT), 403, /staff only/);
    await rejects(get({}, TENANTKEY), 403, /not a ClearSky key/);
    await rejects(post({ action: 'suppress', email: 'x@y.example' }, READER), 403, /sales:write/);
    await rejects(get({}, 'omega_ak_' + '0'.repeat(48)), 401, /unknown agent key/);
    var d = await get({}, READER);
    assert.equal(d.funnel.pending, 1); assert.equal(d.approvals.pending[0].orgId, 'pendingco.example');
  });

  await atest('the demo form: stored, mailed to ClearSky with Reply-To, filed as an inbound prospect at contacted', async function () {
    var r = await form({ name: 'Jane Doe', company: 'Acme Solar', email: 'jane@acme.example', vertical: 'Installers & sales channel', interest: 'OMEGA Platform',
      message: 'Two sites in Joliet', page: '/contact.html', source: { utm_source: 'linkedin', utm_campaign: 'w40-grid', landing: '/platform.html' } });
    assert.equal(r.ok, true); assert.ok(r.id);
    var a = db.data.get('sales_activity/' + r.id);
    assert.equal(a.kind, 'demo-request'); assert.equal(a.message, 'Two sites in Joliet'); assert.equal(a.source.utm_campaign, 'w40-grid'); assert.equal(a.by, 'website');
    var p = db.data.get('sales_prospects/acme.example');
    assert.equal(p.stage, 'contacted'); assert.equal(p.inbound, true); assert.equal(p.company, 'Acme Solar'); assert.equal(p.contacts[0].name, 'Jane Doe');
    assert.equal(sent.length, 1); assert.equal(sent[0].email, 'jane@acme.example'); assert.equal(sent[0].sourceWord, 'linkedin');
    assert.equal(db.data.get('sales_counters/demo-2026-09-30').n, 1);
  });
  await atest('the demo form: a bot gets a quiet yes and nothing is stored; a bad address is a 400; a GET is refused', async function () {
    var before = db.data.size;
    assert.deepEqual(await form({ name: 'x', email: 'x@x.example', website: 'spam' }), { ok: true });
    assert.equal(db.data.size, before); assert.equal(sent.length, 1);
    await rejects(form({ name: 'Jane', email: 'jane at acme' }), 400, /email/);
    await rejects(Promise.resolve().then(function () { return demo({ method: 'GET', headers: {} }, {}); }), 405);
    var r = await form(JSON.stringify({ name: 'Str', email: 'str@str.example' }));
    assert.equal(r.ok, true, 'a text/plain JSON body is read too');
  });
  await atest('the demo form: past the daily cap it says so and stores nothing', async function () {
    db.seed('sales_counters/demo-2026-09-30', { n: 100 });
    await rejects(form({ name: 'Late', email: 'late@late.example' }), 429, /busy/);
    assert.equal(db.data.has('sales_prospects/late.example'), false);
    db.seed('sales_counters/demo-2026-09-30', { n: 2 });
  });

  await atest('upsert: files new companies, merges known ones, refuses rows with no domain and duplicates, logs one research row', async function () {
    var r = await post({ action: 'upsert-prospects', label: 'NABCEP IL', prospects: [
      { company: 'Bright Installers', domain: 'bright.example', vertical: 'installer', state: 'il', contacts: [{ name: 'Rae', email: 'rae@bright.example' }], evidence: [{ text: 'NABCEP PV Installation Professional', url: 'https://example.org/nabcep' }], next: { action: 'Intro email about plan sets', due: '2026-09-30' } },
      { company: 'Acme Solar', domain: 'acme.example', stage: 'target', tags: ['il'] },
      { company: 'No Domain Inc' },
      { company: 'Bright again', domain: 'bright.example' } ] }, AGENT);
    assert.deepEqual(r.created, ['bright.example']); assert.deepEqual(r.updated, ['acme.example']);
    assert.equal(r.errors.length, 2); assert.match(r.errors[0].error, /domain/); assert.match(r.errors[1].error, /duplicate/);
    var acme = db.data.get('sales_prospects/acme.example');
    assert.equal(acme.stage, 'contacted', 'a harvest never moves an inbound lead back to target'); assert.deepEqual(acme.tags, ['il']);
    var bright = db.data.get('sales_prospects/bright.example');
    assert.equal(bright.state, 'IL'); assert.equal(bright.createdBy, 'agent:sales agent'); assert.ok(bright.score > 0);
    var research = Array.from(db.data.entries()).filter(function (e) { return /^sales_activity\//.test(e[0]) && e[1].kind === 'research'; });
    assert.equal(research.length, 1); assert.match(research[0][1].summary, /Filed 1 new, updated 1 \(NABCEP IL\)/);
  });

  await atest('log: cold email is blocked until the sender and postal address are set; an inbound lead and a customer are not cold', async function () {
    var r = await post({ action: 'log', entries: [
      { kind: 'email-drafted', to: 'rae@bright.example', summary: 'Intro', ref: 'gmail-draft-1', id: 'draft-2026-09-30-bright' },
      { kind: 'email-drafted', to: 'jane@acme.example', summary: 'Re: your demo request', ref: 'gmail-draft-2', id: 'draft-2026-09-30-acme' },
      { kind: 'email-drafted', to: 'tia@trialco.example', summary: 'Trial ends Friday', ref: 'gmail-draft-3', orgId: 'trialco.example' },
      { kind: 'email-drafted', to: 'derek@fenecon.de', summary: 'nope' },
      { kind: 'email-drafted', to: 'someone@gmail.com', summary: 'nope' },
      { kind: 'bogus' } ] }, AGENT);
    assert.equal(r.ok, false);
    assert.match(r.results[0].error, /cold email is blocked/);
    assert.equal(r.results[1].ok, true, 'Jane wrote to us'); assert.equal(r.results[2].ok, true, 'Trialco is a customer');
    assert.match(r.results[3].error, /FENECON/); assert.match(r.results[4].error, /public mailbox/); assert.match(r.results[5].error, /unknown kind/);
    var again = await post({ action: 'log', entries: [{ kind: 'email-drafted', to: 'jane@acme.example', id: 'draft-2026-09-30-acme' }] }, AGENT);
    assert.equal(again.results[0].state, 'existed', 'a retry drafts nothing twice');
  });
  await atest('config: a person sets the sender (clearsky-usa.com only) and address; the key cannot', async function () {
    await rejects(post({ action: 'config', sender: 'dev@clearsky-usa.com' }, AGENT), 403);
    await rejects(post({ action: 'config', sender: 'tommy@gmail.com' }), 400, /clearsky-usa.com/);
    await rejects(post({ action: 'config', sender: 'old@csebuilders.com' }), 400, /clearsky-usa.com/);
    await rejects(post({ action: 'config', postalAddress: 'Clinton Iowa' }), 400, /street number/);
    var r = await post({ action: 'config', enabled: true, sender: 'dev@clearsky-usa.com', postalAddress: '1 Example St, Clinton, IA 52732', dailyDraftCap: 3, offLimits: [{ domain: 'nextnrg.example', why: 'existing contract' }] });
    assert.deepEqual(r.changed, ['enabled', 'sender', 'postalAddress', 'dailyDraftCap', 'offLimits']);
    var ok = await post({ action: 'log', entries: [{ kind: 'email-drafted', to: 'rae@bright.example', id: 'draft-2026-09-30-bright-2' }] }, AGENT);
    assert.equal(ok.results[0].ok, true, 'cold is allowed once the sender and address are on record');
    var s = await post({ action: 'screen', emails: ['bo@nextnrg.example', 'rae@bright.example', 'x@gmail.com'] }, READER);
    assert.match(s.results[0].reason, /existing contract/); assert.equal(s.results[1].ok, true); assert.equal(s.results[2].ok, false);
  });
  await atest('log: the daily draft cap binds the agent, not a person', async function () {
    var r = await post({ action: 'log', entries: [{ kind: 'email-drafted', to: 'rae@bright.example', id: 'cap-a' }, { kind: 'email-drafted', to: 'rae@bright.example', id: 'cap-b' }] }, AGENT);
    assert.match(r.results[0].error, /daily draft cap \(3\)/);
    var p = await post({ action: 'log', entries: [{ kind: 'email-drafted', to: 'rae@bright.example', id: 'cap-person' }] });
    assert.equal(p.results[0].ok, true);
  });
  await atest('log: a send, a reply and a meeting date the prospect and move it forward, never back', async function () {
    await post({ action: 'log', entries: [{ kind: 'email-sent', to: 'rae@bright.example', ref: 'gmail-draft-1' }] }, AGENT);
    assert.equal(db.data.get('sales_prospects/bright.example').stage, 'contacted');
    await post({ action: 'log', entries: [{ kind: 'meeting', prospectId: 'bright.example', summary: 'Demo held' }] }, AGENT);
    var b = db.data.get('sales_prospects/bright.example');
    assert.equal(b.stage, 'demo'); assert.equal(b.lastTouchAt, new Date(NOW).toISOString());
    await post({ action: 'log', entries: [{ kind: 'reply', prospectId: 'bright.example' }] }, AGENT);
    assert.equal(db.data.get('sales_prospects/bright.example').stage, 'demo');
  });
  await atest('stage: the agent moves forward only and never to won or lost; a person may do either', async function () {
    await rejects(post({ action: 'stage', prospectId: 'bright.example', stage: 'contacted' }, AGENT), 409, /forward only/);
    await rejects(post({ action: 'stage', prospectId: 'bright.example', stage: 'lost' }, AGENT), 403);
    var f = await post({ action: 'stage', prospectId: 'bright.example', stage: 'trial' }, AGENT);
    assert.deepEqual([f.was, f.stage], ['demo', 'trial']);
    var p = await post({ action: 'stage', prospectId: 'bright.example', stage: 'lost', note: 'went with a competitor' });
    assert.equal(p.stage, 'lost');
    await rejects(post({ action: 'stage', prospectId: 'nobody.example', stage: 'demo' }), 404);
    await rejects(post({ action: 'stage', prospectId: 'a/b', stage: 'demo' }), 400);
  });
  await atest('suppress: written once, never overwritten, and screen refuses afterwards', async function () {
    var r = await post({ action: 'suppress', email: 'Rae@Bright.example', reason: 'asked to stop' }, AGENT);
    assert.equal(r.key, 'rae@bright.example'); assert.equal(r.existed, false);
    assert.equal((await post({ action: 'suppress', email: 'rae@bright.example' }, AGENT)).existed, true);
    await post({ action: 'suppress', domain: 'https://www.quiet.example/' }, AGENT);
    assert.ok(db.data.has('sales_suppressions/*@quiet.example'));
    var s = await post({ action: 'screen', emails: ['rae@bright.example', 'a@quiet.example'] }, AGENT);
    assert.equal(s.results[0].ok, false); assert.equal(s.results[1].ok, false);
  });
  await atest('lint-post: tags the links and refuses a price', async function () {
    var r = await post({ action: 'lint-post', text: 'Grid headroom, parcel by parcel: https://www.clearskyomega.com/platform.html', campaign: 'w40' }, READER);
    assert.equal(r.lint.ok, true); assert.match(r.text, /utm_source=linkedin/);
    var bad = await post({ action: 'lint-post', text: 'Lite is $500/month https://www.clearskyomega.com/' }, READER);
    assert.equal(bad.lint.ok, false);
  });
  await atest('views: the agent packet carries the rules, the request\'s words and what was already drafted today', async function () {
    var p = await get({ view: 'agent' }, AGENT);
    assert.equal(p.rules.coldEmailAllowed, true); assert.equal(p.rules.dailyDraftCap, 3);
    assert.ok(p.rules.offLimits.some(function (o) { return o.domain === 'fenecon.com'; }));
    assert.ok(p.rules.offLimits.some(function (o) { return o.domain === 'nextnrg.example'; }));
    assert.equal(p.approvals[0].orgId, 'pendingco.example');
    var jane = p.demoRequests.filter(function (d) { return d.email === 'jane@acme.example'; })[0];
    assert.equal(jane.message, 'Two sites in Joliet', 'the words, so the reply can answer them');
    assert.ok(p.alreadyToday.some(function (a) { return a.id === 'draft-2026-09-30-acme'; }));
    assert.ok(p.accounts.some(function (t) { return t.orgId === 'trialco.example'; }), 'a trial ending is the agent\'s too');
    var list = await get({ view: 'prospects', state: 'IL' }, READER);
    assert.deepEqual(list.prospects.map(function (x) { return x.id; }), ['bright.example']);
    var one = await get({ prospect: 'acme.example' }, READER);
    assert.equal(one.prospect.company, 'Acme Solar'); assert.ok(one.activity.length >= 2);
    await rejects(get({ prospect: 'nobody.example' }, READER), 404);
    await rejects(get({ view: 'nope' }, READER), 400);
    var d = await get({});
    assert.equal(d.inbound.demoRequests30, 2); assert.equal(d.config.enabled, true); assert.equal(d.suppressed, 2);
  });

  await atest('candidates: spellings fold into one, a re-run replaces its own count, research turns one into a prospect', async function () {
    var r = await post({ action: 'upsert-candidates', label: 'ny-retail-storage', candidates: [
      { company: 'Nine Dot Energy LLC', projects: 77, state: 'NY', vertical: 'installer', source: { kind: 'harvest', ref: 'ny-retail-storage' }, evidence: [{ text: '77 retail storage projects (NYSERDA)', url: 'https://data.ny.gov/d/ugya-enpy', source: 'ny-retail-storage' }] },
      { company: 'Nine Dot Energy, L.L.C.', projects: 3, state: 'NY', source: { kind: 'harvest', ref: 'ny-retail-storage' } },
      { company: '' } ] }, AGENT);
    assert.equal(r.created, 1); assert.equal(r.errors.length, 1);
    var c = db.data.get('sales_candidates/nine-dot-energy');
    assert.equal(c.projects, 80); assert.equal(c.status, 'new'); assert.deepEqual(c.states, ['NY']);
    await post({ action: 'upsert-candidates', candidates: [{ company: 'Nine Dot Energy LLC', projects: 81, state: 'NY', source: { kind: 'harvest', ref: 'ny-retail-storage' } }] }, AGENT);
    assert.equal(db.data.get('sales_candidates/nine-dot-energy').projects, 81, 'the same source re-run replaces its own count');
    var q = await get({ view: 'candidates' }, READER);
    assert.equal(q.candidates[0].key, 'nine-dot-energy');
    await rejects(post({ action: 'resolve-candidate', key: 'nine-dot-energy', prospect: { domain: 'gmail.com' } }, AGENT), 400);
    var done = await post({ action: 'resolve-candidate', key: 'nine-dot-energy', prospect: { domain: 'ninedotenergy.example', contacts: [{ name: 'Ops Lead', email: 'ops@ninedotenergy.example', title: 'VP Development' }] } }, AGENT);
    assert.equal(done.prospectId, 'ninedotenergy.example'); assert.equal(done.created, true);
    var p = db.data.get('sales_prospects/ninedotenergy.example');
    assert.equal(p.company, 'Nine Dot Energy LLC'); assert.equal(p.state, 'NY'); assert.match(p.evidence[0].text, /77 retail storage/);
    assert.equal(db.data.get('sales_candidates/nine-dot-energy').status, 'enriched');
    await post({ action: 'upsert-candidates', candidates: [{ company: 'Tiny Roofing' }] }, AGENT);
    var sk = await post({ action: 'resolve-candidate', key: 'tiny-roofing', skip: true, reason: 'residential only' }, AGENT);
    assert.equal(sk.status, 'skipped');
    var d = await get({});
    assert.deepEqual(d.candidates, { new: 0, enriched: 1, skipped: 1 });
  });
  await atest('lists: a sheet\'s headers map onto a prospect; a vertical is read from its words', async function () {
    var m = S.guessProspectMapping(['Company Name', 'Website', 'First Name', 'Last Name', 'Title', 'Email', 'State', 'Business Type', 'Notes']);
    assert.deepEqual(m, { 'Company Name': 'company', 'Website': 'domain', 'First Name': 'firstName', 'Last Name': 'lastName', 'Title': 'title', 'Email': 'email', 'State': 'state', 'Business Type': 'vertical', 'Notes': 'notes' });
    var p = S.cleanProspect(S.rowToProspect({ 'Company Name': 'Volt EPC', 'Website': 'https://www.voltepc.example', 'First Name': 'Lee', 'Last Name': 'Ng', 'Title': 'CEO', 'Email': 'lee@voltepc.example', 'State': 'il', 'Business Type': 'EPC / engineering', 'Notes': 'met at RE+' }, m, { label: 'master list' })).prospect;
    assert.equal(p.id, 'voltepc.example'); assert.equal(p.vertical, 'epc'); assert.equal(p.state, 'IL'); assert.equal(p.contacts[0].name, 'Lee Ng'); assert.equal(p.summary, 'met at RE+');
  });

  console.log('all ' + n + ' sales checks passed');
})().catch(function (e) { console.error(e); process.exit(1); });
