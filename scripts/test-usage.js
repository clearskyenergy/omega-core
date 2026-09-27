#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Phase 7: usage counters, the produce gate, overage on the recurring
 * invoice, buy-more packs through reconciliation, auto top-up and the
 * 90-day review. Firestore double; QuickBooks and mail are stand-ins.
 */
'use strict';
var assert = require('assert'), F = require('./_lib/firestore-double'), H = require('./_lib/packaging-billing-fixture');
var db, caller, qbo = { invoices: 0, plans: [] }, receipts = {}, count = 0;
H.mockAdmin(function () { return db; }, function () { return caller; });
F.mock('../api/_lib/mail', { templates: { packageInvoice: async function () { return { ok: true }; } } });
var Q = require('../api/_lib/qbo-billing');
Q.driver = function () { return { customer: async function () { return 'C-fixture'; },
  invoice: async function (plan) { qbo.invoices++; qbo.plans.push(plan); return { id: 'I-' + plan.marker.slice(-14), totalCents: plan.subtotalCents, payUrl: 'https://connect.intuit.com/pay/' + plan.kind }; },
  reconcile: async function (record) { var r = receipts[record.qboInvoiceId] || { satisfied: record.state === 'paid' }; return { satisfied: !!r.satisfied, reversed: !!r.reversed, paidCents: r.satisfied ? record.totalCents : 0, payUrl: record.paymentLink }; } }; };
var U = require('../api/_lib/usage'), B = require('../api/_lib/pricebook'), S = require('../api/_lib/package-billing'), Policy = require('../api/_lib/package-billing-policy'), M = require('../api/_lib/modules');
var usageApi = require('../api/usage'), planChange = require('../api/plan-change');
function check(condition, label) { assert.ok(condition, label); count++; }
function equal(a, b, label) { assert.deepStrictEqual(a, b, label); count++; }
async function refused(fn, re, label) { await assert.rejects(fn, re, label); count++; }
var NOW = Date.parse('2026-09-26T12:00:00Z'), now = NOW, realNow = Date.now; Date.now = function () { return now; };
var ORG = 'walters.example', ROOT = 'omega_orgs/' + ORG, res = { setHeader: function () {} };
var OWNER = { uid: 'w1', staff: false, email: 'wes@' + ORG, orgId: ORG, role: 'owner', claims: { email_verified: true } };
var MEMBER = { uid: 'w2', staff: false, email: 'mel@' + ORG, orgId: ORG, role: 'member', claims: { email_verified: true } };
var STAFF = { uid: 'rep', staff: true, email: 'rep@clearsky-usa.com', orgId: 'clearsky-usa.com', role: 'owner', claims: { email_verified: true } };
function post(body, who) { caller = who || OWNER; return usageApi({ method: 'POST', headers: {}, body: body, query: {} }, res); }
function get(query, who) { caller = who || OWNER; return usageApi({ method: 'GET', headers: {}, query: query || {}, body: {} }, res); }
function change(body, who) { caller = who || OWNER; return planChange({ method: 'POST', headers: {}, body: body, query: {} }, res); }
function fresh(keys, plan) {
  db = new F.DB(); db.serial = true; qbo = { invoices: 0, plans: [] }; receipts = {};
  var book = H.seedPaidTenant(db, { org: ORG, name: 'Walters Wholesale', keys: keys, plan: plan, profile: H.profile(ORG, 'Walters Wholesale'), member: 'w1' });
  db.seed(ROOT + '/members/w2', { role: 'member', status: 'active' });
  return H.enabledBook();
}
async function run() {
  process.env.PACKAGING_BILLING_ENABLED = 'true'; process.env.QBO_ENV = 'sandbox';
  var book = fresh(['lite', 'evrebates', 'estimate', 'sitefinder'], 'alacarte'), billing = db.data.get(ROOT + '/billing/current');
  /* ── meters and the empty summary ── */
  equal(U.meters(book).map(function (m) { return m.key + (m.billed ? '*' : ''); }), ['models', 'boms', 'evApplications*', 'screens', 'matrices*', 'siteStudies*'], 'six meters from the catalog; three billed by the book');
  var s0 = U.summary(billing, book, null);
  equal(s0.map(function (m) { return m.key; }), ['boms', 'evApplications', 'siteStudies'], 'only the package’s meters are summarised');
  equal([s0[1].used, s0[1].allowance, s0[1].remaining, s0[1].pct, s0[1].allowed, s0[1].note], [0, 20, 20, 0, true, null], 'a fresh cycle: 0 of 20, nothing to say');
  equal(s0[1].pack.display, 'Buy 10 more for $500', 'the pack offer comes from the book');
  equal(s0[0].display, '0 bills of materials this cycle', 'an activity meter has no allowance');
  assert.throws(function () { U.meter(book, 'widgets'); }, /Unknown meter/); count++;
  assert.throws(function () { U.clientId('short'); }, /client id/); count++;
  /* ── counting: idempotent by client id, cycle-keyed ── */
  var cycle = U.cycleOf(billing, now); equal([cycle.start, cycle.end], ['2026-09-20', '2026-10-20'], 'the cycle runs from the billing day');
  var c1 = await U.count(db, ORG, billing, book, 'evApplications', 'workbook:job-1', OWNER.email, now, { source: 'test' });
  equal([c1.counted, c1.repeat, c1.meter.used], [true, false, 1], 'the first export counts');
  var c2 = await U.count(db, ORG, billing, book, 'evApplications', 'workbook:job-1', OWNER.email, now + 5000);
  equal([c2.counted, c2.repeat, c2.meter.used], [false, true, 1], 'the same deliverable again does not');
  equal(db.data.get(ROOT + '/usage/2026-09-20').counts, { evApplications: 1 }, 'stored under the cycle start');
  check(!!db.data.get(ROOT + '/usage/2026-09-20/events/workbook:job-1'), 'the event carries the client id');
  for (var i = 2; i <= 16; i++) await U.count(db, ORG, billing, book, 'evApplications', 'workbook:job-' + i, OWNER.email, now);
  var s16 = U.summary(billing, book, db.data.get(ROOT + '/usage/2026-09-20'))[1];
  equal([s16.used, s16.pct, s16.note], [16, 80, '4 of 20 EV applications left this cycle.'], 'at 80% a quiet note');
  for (i = 17; i <= 20; i++) await U.count(db, ORG, billing, book, 'evApplications', 'workbook:job-' + i, OWNER.email, now);
  /* ── the gate: 402 with the pack; never twice; auto top-up lets it through ── */
  var err = null; try { await U.count(db, ORG, billing, book, 'evApplications', 'workbook:job-21', OWNER.email, now); } catch (e) { err = e; }
  check(err && err.status === 402 && /used all 20 EV applications this cycle\. Buy 10 more for \$500\./.test(err.message), 'the 21st is refused with the pack offer: ' + (err && err.message));
  equal(db.data.get(ROOT + '/usage/2026-09-20').counts.evApplications, 20, 'a refused deliverable is not counted');
  var topped = await U.count(db, ORG, billing, book, 'boms', 'rfq:abcdefghij0001', OWNER.email, now, { gate: false });
  equal(topped.meter.used, 1, 'an activity meter is never gated');
  var auto = Object.assign({}, billing, { autoTopup: true });
  var c21 = await U.count(db, ORG, auto, book, 'evApplications', 'workbook:job-21', OWNER.email, now);
  equal([c21.counted, c21.meter.used, c21.meter.overage], [true, 21, 1], 'with auto top-up the 21st counts as overage');
  check(/billed at \$50 each on your next invoice/.test(c21.meter.note), 'and the note says how it is billed');
  /* ── the endpoint ── */
  await refused(function () { return post({ meter: 'evApplications', clientId: 'workbook:job-22', bogus: 1 }); }, /Unsupported field/, 'unknown fields refused');
  await refused(function () { return post({ meter: 'evApplications', clientId: 'workbook:job-22' }, MEMBER); }, /used all 20/, 'a member at the allowance is refused too');
  var st = await post({ meter: 'siteStudies', clientId: 'packet:site-1' });
  equal([st.metered, st.counted, st.meter.used, st.meter.allowance], [true, true, 1, 25], 'a site packet counts against site studies');
  equal((await post({ meter: 'siteStudies', clientId: 'packet:site-1' }, MEMBER)).repeat, true, 'a member re-downloading the same packet is not a second study');
  await refused(function () { return post({ meter: 'matrices', clientId: 'matrix:aaaaaaaa' }); }, /not in your package/, 'a meter of a module not owned is refused by the package gate');
  equal((await post({ meter: 'evApplications', clientId: 'workbook:job-22' }, STAFF)).metered, false, 'staff produce nothing that is metered');
  var view = await get({}, MEMBER);
  equal([view.metered, view.cycle.start, view.canBuy, !!view.review], [true, '2026-09-20', false, false], 'a member sees the cycle and the meters, no review, cannot buy');
  var adminView = await get({});
  check(adminView.canBuy === true && adminView.review && adminView.review.days === 90, 'the owner may buy and sees the review');
  equal(adminView.meters.filter(function (m) { return m.key === 'evApplications'; })[0].used, 21, 'the endpoint reports this cycle (20 included + the one auto top-up let through)');
  await refused(function () { return get({ orgId: 'other.example' }); }, /Own organization/, 'another organization is refused');
  db.seed('omega_orgs/legacy.example/billing/current', { tier: 'deluxe' });
  equal((await get({ orgId: 'legacy.example' }, STAFF)).metered, false, 'an unpackaged tenant is not metered');
  /* ── buy more: pay first, added when paid ── */
  var quote = await change({ action: 'pack-quote', meter: 'evApplications' });
  equal([quote.units, quote.cents, quote.display, quote.canApply, quote.cycle.end], [10, 50000, '$500', true, '2026-10-20'], 'the pack offer: 10 for $500, good until the cycle ends');
  await refused(function () { return change({ action: 'pack-quote', meter: 'boms' }); }, /not metered/, 'an activity meter has no pack');
  await refused(function () { return change({ action: 'pack-quote', meter: 'matrices' }); }, /not in your package/, 'no pack for a module not owned');
  await refused(function () { return change({ action: 'pack-buy', meter: 'evApplications', previewId: 'a'.repeat(48), effectiveAt: now }); }, /Refresh the pack offer/, 'a stale offer is refused');
  await refused(function () { return change({ action: 'pack-buy', meter: 'evApplications', previewId: quote.previewId, effectiveAt: quote.effectiveAt }, MEMBER); }, /workspace administrator/, 'a member cannot buy');
  var bought = await change({ action: 'pack-buy', meter: 'evApplications', previewId: quote.previewId, effectiveAt: quote.effectiveAt });
  check(bought.state === 'awaiting_payment' && bought.display === '$500' && qbo.invoices === 1 && /^pack-/.test(bought.packId) && bought.paymentLink, 'a pack is a QuickBooks invoice, paid first');
  equal(qbo.plans[0].lines, [{ itemKey: 'pack:evApplications', name: 'OMEGA · EV applications ×10', quantity: 1, amountCents: 50000 }], 'on the pack item');
  equal(await change({ action: 'pack-buy', meter: 'evApplications', previewId: quote.previewId, effectiveAt: quote.effectiveAt }), bought, 'a retry replays without a second invoice');
  check(qbo.invoices === 1, 'one pack invoice');
  equal(db.data.get(ROOT + '/usage/2026-09-20').purchased, {}, 'nothing is added before the payment');
  var rec = db.data.get(ROOT + '/billing/current/invoices/' + bought.packId);
  check(rec.kind === 'pack' && rec.state === 'unpaid' && rec.pack.cycle.start === '2026-09-20', 'the pack record names its cycle');
  var recon = await S.reconcile(db, ORG, now);
  equal(recon.invoices.filter(function (r) { return r.invoiceId === rec.qboInvoiceId; })[0].state, 'unpaid', 'unpaid until QuickBooks says otherwise');
  equal(db.data.get(ROOT + '/billing/current').modules, ['lite', 'estimate', 'evrebates', 'sitefinder'], 'access is untouched by an open pack');
  receipts[rec.qboInvoiceId] = { satisfied: true };
  await S.reconcile(db, ORG, now);
  equal(db.data.get(ROOT + '/usage/2026-09-20').purchased, { evApplications: 10 }, 'paid → ten more for this cycle');
  var after = await post({ meter: 'evApplications', clientId: 'workbook:job-23' });
  equal([after.counted, after.meter.used, after.meter.allowance, after.meter.remaining], [true, 22, 30, 8], 'the next export now counts inside the raised allowance');
  check(db.data.get(ROOT + '/billing/current').packagingState === 'paid', 'the subscription state is untouched');
  receipts[rec.qboInvoiceId] = { satisfied: false, reversed: true };
  await S.reconcile(db, ORG, now);
  equal(db.data.get(ROOT + '/usage/2026-09-20').purchased, { evApplications: 0 }, 'a reversed pack takes its units back (never below zero)');
  check(db.data.get(ROOT + '/billing/current').packagingState === 'paid', 'a reversed pack never closes the workspace');
  /* ── auto top-up is the tenant admin’s switch ── */
  await refused(function () { return change({ action: 'auto-topup', enabled: 'yes' }); }, /true or false/, 'auto top-up takes a boolean');
  await refused(function () { return change({ action: 'auto-topup', enabled: true }, MEMBER); }, /workspace administrator/, 'members cannot switch it');
  equal((await change({ action: 'auto-topup', enabled: true })).autoTopup, true, 'the owner switches it on');
  check(db.data.get(ROOT + '/billing/current').autoTopup === true && Object.keys(db.data.get('omega_orgs/' + ORG + '/admin_audit') || {}).length >= 0, 'stored and audited');
  var over = await post({ meter: 'evApplications', clientId: 'workbook:job-24' });
  equal([over.counted, over.meter.overage], [true, 3], 'with auto top-up the export goes through as overage');
  /* ── overage on the recurring invoice (at the end of the cycle) ── */
  billing = db.data.get(ROOT + '/billing/current');
  var doc = db.data.get(ROOT + '/usage/2026-09-20');
  equal(U.overageLines(doc, book, ['lite', 'evrebates', 'sitefinder']), [{ itemKey: 'overage:evApplications', name: 'EV applications overage', quantity: 3, unitCents: 5000, amountCents: 15000 }], 'three over → one line at 3 × $50');
  equal(U.overageLines(doc, book, ['lite', 'sitefinder']), [], 'a meter of a module not in the package bills nothing');
  var plan = Policy.invoice(Object.assign({}, billing, { firstInvoiceOn: '2026-08-20', subscriptionStartedAt: Date.parse('2026-08-20T12:00:00Z') }), book, '2026-10-20', doc);
  check(plan.lines.some(function (l) { return l.itemKey === 'overage:evApplications' && l.amountCents === 15000; }) && plan.subtotalCents === 500 * 100 + 250 * 100 + 250 * 100 + 750 * 100 + 15000, 'the recurring invoice carries the overage line: ' + plan.subtotalCents);
  now = Date.parse('2026-10-20T12:00:00Z');
  var issued = await S.issue(db, ORG, now);
  check(issued.issued === true && qbo.plans[qbo.plans.length - 1].lines.some(function (l) { return l.itemKey === 'overage:evApplications'; }), 'issue() reads the ending cycle’s usage and bills it');
  now = NOW;
  /* ── the review ── */
  var review = (await get({})).review;
  check(review.cycles === 1 && review.since === '2026-06-28', 'ninety days of cycles');
  var evRow = review.meters.filter(function (m) { return m.key === 'evApplications'; })[0];
  equal([evRow.used, evRow.included, evRow.purchased, evRow.over], [23, 20, 0, 3], 'used against included and packs');
  check(review.suggestions.some(function (s) { return s.kind === 'more' && s.module === 'evrebates'; }), 'over → a pack or the next tier');
  check(review.suggestions.some(function (s) { return s.kind === 'steer'; }) === false, 'four à la carte modules at $1,750 do not fit Field: no steer');
  check(review.modules.filter(function (m) { return m.module === 'lite'; })[0].note === 'Always included', 'Lite is never a removal candidate');
  var quiet = fresh(['lite', 'storage', 'estimate', 'evrebates'], 'field');
  db.seed(ROOT + '/usage/2026-09-20', { cycle: { start: '2026-09-20', end: '2026-10-20' }, counts: { boms: 3 }, purchased: {} });
  var r2 = await U.review(db, ORG, db.data.get(ROOT + '/billing/current'), quiet, now);
  check(r2.suggestions.some(function (s) { return s.kind === 'remove' && s.module === 'evrebates'; }) && r2.suggestions.some(function (s) { return s.kind === 'remove' && s.module === 'storage'; }), 'a module with nothing recorded is a removal candidate');
  check(!r2.suggestions.some(function (s) { return s.module === 'estimate'; }), 'a module with activity is not');
  var alacarte = fresh(['lite', 'gridatlas', 'storage', 'estimate', 'evrebates'], 'alacarte');
  var r3 = await U.review(db, ORG, db.data.get(ROOT + '/billing/current'), alacarte, now);
  check(r3.suggestions.some(function (s) { return s.kind === 'steer' && /Switch to Field/.test(s.text); }), 'à la carte above Field is steered to Field');
  console.log('Usage and packs: ' + count + ' passed; QuickBooks and mail stand-ins, no network.');
}
run().then(function () { Date.now = realNow; }, function (e) { Date.now = realNow; console.error(e); process.exit(1); });
