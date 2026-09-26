#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Phase 6: the Subscription Proposal, end to end on the Firestore double.
 * Mail and QuickBooks are stand-ins; no network, no live writes.
 */
'use strict';
var assert = require('assert'), F = require('./_lib/firestore-double'), H = require('./_lib/packaging-billing-fixture');
var db, caller, mails = [], qbo = { invoices: 0 }, count = 0;
H.mockAdmin(function () { return db; }, function () { return caller; });
H.mockQbo(function () { qbo.invoices++; });
F.mock('../api/_lib/mail', { templates: { proposalSent: async function (o) { mails.push(o); return { ok: true }; }, signupReceived: async function () {}, signupAlert: async function () {} } });
var SP = require('../api/_lib/subscription-proposal'), B = require('../api/_lib/pricebook'), M = require('../api/_lib/modules'), P = require('../api/_lib/subscription-pricing');
var endpoint = require('../api/subscription-proposal'), signup = require('../api/tenant-signup');
function check(condition, label) { assert.ok(condition, label); count++; }
function equal(a, b, label) { assert.deepStrictEqual(a, b, label); count++; }
async function refused(fn, re, label) { await assert.rejects(fn, re, label); count++; }
var NOW = Date.parse('2026-09-26T12:00:00Z'), now = NOW, realNow = Date.now; Date.now = function () { return now; };
var STAFF = { uid: 'rep', staff: true, email: 'rep@clearsky-usa.com', orgId: 'clearsky-usa.com', claims: { email_verified: true, name: 'Riley Rep' } };
var res = { setHeader: function () {} };
function post(body, who) { caller = who || STAFF; return endpoint({ method: 'POST', headers: {}, body: body, query: {} }, res); }
function get(query, who) { caller = who || STAFF; return endpoint({ method: 'GET', headers: {}, query: query, body: {} }, res); }
function fresh() { db = new F.DB(); db.serial = true; var book = H.enabledBook(); db.seed('pricebook/' + book.version, book); mails = []; qbo.invoices = 0; return book; }
var EV = { answers: { design: 'quarter', sites: 'quarter', estimate: 'quarter', ev: 'quarter', plansets: 'quarter', permitting: 'year', storage: 'year' }, evPerMonth: 30,
  spend: { tools: '900', consultants: 1500, drafting: '400' }, unitCosts: { evApplications: '150' }, paysToday: 'Two drafting contractors and a screening service.' };
var PROSPECT = { company: 'Green Wolf Strategies', domain: 'GreenWolf.example', contactName: 'Dana Wolf', email: 'Dana@GreenWolf.example', phone: '555-0111', type: 'ev', address: { line1: '9 Wolf Way', city: 'Chicago', state: 'IL', postalCode: '60601', country: 'US' } };
async function run() {
  process.env.PACKAGING_BILLING_ENABLED = 'true'; process.env.QBO_ENV = 'sandbox'; process.env.PACKAGING_SIGNUP_ENABLED = 'true';
  var book = fresh();
  /* ── the library: discovery → recommendation ── */
  var d = SP.discovery(EV), rec = SP.recommend(d, book);
  equal(rec.modules, ['lite', 'gridatlas', 'estimate', 'evrebates', 'plansets'], '"this quarter" answers become the starting package, in catalog order');
  equal(rec.next.map(function (n) { return n.module; }), ['storage', 'permitting'], '"within the year" answers become the next rungs');
  check(/30 EV applications a month: 20 are included/.test(rec.notes[0]), 'more applications than included is said, with the overage and the pack');
  equal(d.spend, { tools: 90000, consultants: 150000, drafting: 40000, data: 0, other: 0 }, 'spend is kept in cents; a blank category is zero');
  equal(d.unitCosts, { evApplications: 15000, matrices: null, siteStudies: null }, 'a unit cost they did not give is null, never zero');
  var sell = SP.recommend(SP.discovery({ answers: { design: 'quarter', sell: 'quarter' }, flags: { sellBuilds: true, sellShips: true } }), book);
  equal(sell.modules, ['lite', 'whitelabel', 'logic-office', 'logic-plant', 'logic-logistics'], 'a Logic part brings Office with it');
  equal(SP.recommend(SP.discovery({ answers: { sites: 'quarter' }, flags: { sitesMany: true, sitesIllinois: true } }), book).modules, ['lite', 'gridatlas', 'siteintel', 'sitefinder'], 'many sites → Site Intelligence; northern Illinois → Site Finder');
  equal(SP.recommend(SP.discovery({}), book).modules, ['lite'], 'no answers is still Lite: never below the floor');
  assert.throws(function () { SP.discovery({ answers: { ev: 'maybe' } }); }, /quarter, year or no/); count++;
  assert.throws(function () { SP.discovery({ spend: { tools: '-5' } }); }, /dollar amount/); count++;
  assert.throws(function () { SP.discovery({ evPerMonth: 2.5 }); }, /whole number/); count++;
  assert.throws(function () { SP.prospect({ company: 'X' }); }, /Company name/); count++;
  equal(SP.prospect(PROSPECT).domain, 'greenwolf.example', 'the domain is lowercased: it IS the orgId');
  equal(SP.prospect(PROSPECT).email, 'dana@greenwolf.example', 'the contact email is lowercased');
  /* ── the library: price, value, terms, Order Form on the signed book ── */
  var r = SP.compose({ prospect: PROSPECT, discovery: EV, selection: { modules: rec.modules, credit: true } }, book, now);
  equal(r.pricing.plan, 'field', 'five EV-installer modules fit Field');
  equal([r.pricing.recurringCents, r.pricing.creditCents, r.pricing.monthlyCents, r.pricing.listCents], [129900, 51960, 77940, 175000], 'Field $1,299; 40% credit; $779.40 in the window; $1,750 at list');
  equal(r.pricing.monthlyCents, P.quote(rec.modules, book, { plan: 'field', credit: r.selection.credit ? { pct: 40, startsAt: new Date(now).toISOString(), endsAt: new Date(now + 90 * 86400000).toISOString() } : null, now: now }).monthlyCents, 'the proposal price IS the pricing library’s');
  equal(r.value.spendTodayCents, 280000, 'spend today is the sum of what they gave');
  equal(r.value.deltaCents, 280000 - 129900, 'the delta is against the recurring price, not the credited one');
  equal(r.value.usage[0].valueCents, 20 * 15000, 'included EV applications valued at their own unit cost');
  check(r.value.display.delta === '$1,501/month less than today' && r.value.display.yearly === '$18,012 a year', r.value.display.delta + ' / ' + r.value.display.yearly);
  equal(r.orderForm.schedule.map(function (x) { return x.module + ':' + x.unitCents; }), ['lite:50000', 'gridatlas:25000', 'estimate:25000', 'evrebates:25000', 'plansets:50000'], 'the Module Schedule carries every module at its list unit price');
  equal(r.orderForm.schedule[3].included, '20 EV applications/cycle', 'included usage on the schedule');
  equal(r.orderForm.lines.map(function (l) { return l.itemKey; }), ['plan:field', 'credit'], 'order lines are the invoice lines');
  equal(r.orderForm.credit.monthlyDisplay, '−$519.60/month', 'the credit is its own line, never a lower list price');
  equal(r.terms.initialTermMonths, 12, 'Initial Term');
  check(/never below \$500/.test(r.terms.credit), 'the credit never takes the price below the floor');
  var noSpend = SP.compose({ prospect: PROSPECT, discovery: { answers: EV.answers }, selection: { modules: rec.modules } }, book, now);
  equal([noSpend.value.display.delta, noSpend.value.display.usageValue], [null, null], 'no figures given, no comparison invented');
  assert.throws(function () { SP.selection({ modules: rec.modules, interval: 'annual', credit: true }, book, now); }, /Annual prepay excludes/); count++;
  assert.throws(function () { SP.selection({ modules: ['lite', 'evrebates', 'plansets', 'siteintel', 'engineering'], plan: 'field' }, book, now); }, /do not fit/); count++;
  var annual = SP.compose({ prospect: PROSPECT, discovery: EV, selection: { modules: rec.modules, interval: 'annual' } }, book, now);
  equal(annual.pricing.annualPrepayCents, 129900 * 11, 'annual prepay is eleven months');
  check(/eleven months/.test(annual.orderForm.term.election) === false && /11 months for 12/.test(annual.terms.election), 'the election says 11 months for 12');
  /* ── the endpoint: staff only, context, save, send ── */
  var member = { uid: 'm1', staff: false, email: 'someone@other.example', orgId: 'other.example', role: 'member', claims: { email_verified: true } };
  await refused(function () { return post({ action: 'context' }, member); }, /Staff only/, 'context is staff only');
  await refused(function () { return post({ action: 'save', prospect: PROSPECT, discovery: EV, selection: { modules: ['lite'] } }, member); }, /Staff only/, 'save is staff only');
  await refused(function () { return get({}, member); }, /Staff only/, 'the list is staff only');
  await refused(function () { return post({ action: 'context', bogus: 1 }); }, /Unsupported field/, 'unknown fields are refused');
  var ctx = await post({ action: 'context' });
  check(ctx.questions.length === 12 && ctx.catalog.length === M.catalog().length && ctx.brand.name === 'ClearSky Energy Solutions', 'context: the twelve questions, the priced catalog, the sender brand');
  var open = await post({ action: 'recommend', discovery: EV }, member);
  equal(open.recommendation.modules, rec.modules, 'a signed-in prospect may ask for a recommendation');
  equal(open.pricing.display.recurring, '$1,299/month', '… and sees its price');
  var priced = await post({ action: 'price', selection: { modules: ['lite', 'storage'] }, discovery: EV }, member);
  equal([priced.pricing.plan, priced.pricing.recurringCents, priced.value.spendTodayCents], ['alacarte', 75000, 280000], 'a selection is priced à la carte when that is cheaper');
  var saved = await post({ action: 'save', prospect: PROSPECT, discovery: EV, selection: { modules: rec.modules, credit: true }, notes: 'Met at the ComEd event.' });
  check(/^sp-[a-f0-9]{16}$/.test(saved.id) && saved.proposal.status === 'draft', 'save creates a draft with an id');
  equal(saved.proposal.pricing.recurringCents, 129900, 'the saved record carries the server price');
  check(saved.proposal.notes === 'Met at the ComEd event.' && saved.proposal.prospect.orgId === null, 'notes are kept for staff; no workspace exists for this domain yet');
  await refused(function () { return get({ id: saved.id, key: 'a'.repeat(48) }, member); }, /not found/, 'a draft is invisible to a customer even with a key-shaped string');
  await refused(function () { return post({ action: 'accept', id: saved.id, key: 'a'.repeat(48) }, member); }, /not valid/, 'a draft cannot be accepted');
  var sent = await post({ action: 'send', id: saved.id, note: 'Looking forward to it.' });
  var key = /key=([a-f0-9]{48})$/.exec(sent.url)[1];
  check(sent.status === 'sent' && sent.mailState === 'sent' && mails.length === 1 && mails[0].email === 'dana@greenwolf.example' && mails[0].url === sent.url && mails[0].replyTo === STAFF.email, 'send emails the customer a link with the key and the rep as reply-to');
  equal(sent.validUntil, now + 30 * 86400000, 'a sent proposal is valid for 30 days');
  check(db.data.get('subscription_proposals/' + saved.id).acceptance.keyHash === SP.hashKey(key) && db.data.get('subscription_proposals/' + saved.id).acceptance.keyHash !== key, 'only the hash of the key is stored');
  check(!('keyHash' in (sent.proposal.acceptance || {})), 'the staff projection never returns the hash');
  /* ── the customer view ── */
  await refused(function () { return get({ id: saved.id, key: 'b'.repeat(48) }); }, /not found/, 'a wrong key is a missing proposal');
  await refused(function () { return get({ id: 'sp-0000000000000000', key: key }); }, /not found/, 'a wrong id is a missing proposal');
  var view = await get({ id: saved.id, key: key }, null);
  check(view.proposal.status === 'sent' && view.proposal.pricing.display.recurring === '$1,299/month' && view.proposal.orderForm.customer.company === 'Green Wolf Strategies', 'the customer sees the priced proposal and the Order Form');
  check(view.proposal.notes === undefined && view.proposal.history === undefined && !(view.proposal.acceptance && view.proposal.acceptance.keyHash), 'the customer never sees rep notes, history or the hash');
  equal(view.accept, { how: 'signup', signupUrl: '/start.html?proposal=' + saved.id + '&key=' + key, host: null }, 'a company with no workspace accepts by signing up');
  check(db.data.get('subscription_proposals/' + saved.id).acceptance.viewedAt === now, 'the first view is recorded');
  var listed = await get({});
  equal(listed.proposals.map(function (p) { return [p.id, p.status, p.company]; }), [[saved.id, 'sent', 'Green Wolf Strategies']], 'staff list the proposals');
  /* ── editing what was sent withdraws it ── */
  var edited = await post({ action: 'save', id: saved.id, prospect: PROSPECT, discovery: EV, selection: { modules: rec.modules.concat(['storage']), credit: true } });
  check(edited.proposal.status === 'draft' && edited.proposal.acceptance === null, 'a sent proposal that is edited goes back to draft; the key is gone');
  await refused(function () { return get({ id: saved.id, key: key }); }, /not found/, 'the old link no longer opens it');
  var resent = await post({ action: 'send', id: saved.id }), key2 = /key=([a-f0-9]{48})$/.exec(resent.url)[1];
  check(key2 !== key && mails.length === 2, 'resending issues a new key and a new email');
  /* ── a prospect with no workspace cannot accept in place ── */
  var prospectUser = { uid: 'p1', staff: false, email: 'dana@greenwolf.example', orgId: 'greenwolf.example', role: 'owner', claims: { email_verified: true, name: 'Dana Wolf' } };
  await refused(function () { return post({ action: 'accept', id: saved.id, key: key2 }, prospectUser); }, /Sign up with this proposal/, 'no workspace yet: accept means sign up');
  await refused(function () { return post({ action: 'accept', id: saved.id, key: key2 }); }, /customer accepts their own/, 'staff cannot accept for a customer');
  /* ── signing up with the proposal accepts it and proposes its package ── */
  var signupBody = { companyName: 'Green Wolf Strategies', vertical: 'installer', slug: 'greenwolf', proposalId: saved.id, proposalKey: key2,
    billingProfile: Object.assign({}, H.profile('greenwolf.example', 'Green Wolf Strategies'), { vertical: 'installer' }) };
  caller = prospectUser;
  await refused(function () { return signup({ method: 'POST', headers: {}, body: Object.assign({}, signupBody, { proposalKey: key }) }); }, /not valid/, 'signup with a withdrawn key is refused');
  var created = await signup({ method: 'POST', headers: {}, body: signupBody });
  check(created.created === true && created.orgId === 'greenwolf.example', 'the workspace is created pending');
  var bill = db.data.get('omega_orgs/greenwolf.example/billing/current');
  equal(bill.proposedPackage.modules, rec.modules.concat(['storage']).sort(function (a, b) { return M.catalog().map(function (m) { return m.key; }).indexOf(a) - M.catalog().map(function (m) { return m.key; }).indexOf(b); }), 'the proposed package is the proposal’s');
  check(bill.proposedPackage.credit && bill.proposedPackage.credit.pct === 40 && bill.proposalId === saved.id, 'the credit the rep proposed travels with it');
  var accepted = db.data.get('subscription_proposals/' + saved.id);
  check(accepted.status === 'accepted' && accepted.acceptance.orgId === 'greenwolf.example' && accepted.acceptance.result.path === 'signup', 'the proposal is accepted in the same transaction');
  await refused(function () { return post({ action: 'send', id: saved.id }); }, /cannot be sent/, 'an accepted proposal is closed to edits');
  var again = await get({ id: saved.id, key: key2 }, null);
  equal(again.accept.how, 'none', 'nothing left to accept');
  /* ── signup with a discovery and no proposal ── */
  db.data.delete('omega_orgs/lattice.example');
  caller = { uid: 'l1', staff: false, email: 'kim@lattice.example', orgId: 'lattice.example', role: 'owner', claims: { email_verified: true, name: 'Kim Lattice' } };
  var options = await signup({ method: 'GET', headers: {}, query: {}, body: {} });
  check(options.questions.length === 12 && options.spend.length === 5, 'signup options carry the discovery questions');
  var walked = await signup({ method: 'POST', headers: {}, body: { companyName: 'Lattice Energy', vertical: 'developer', slug: 'lattice', discovery: EV,
    billingProfile: Object.assign({}, H.profile('lattice.example', 'Lattice Energy'), { vertical: 'developer' }) } });
  var lb = db.data.get('omega_orgs/lattice.example/billing/current');
  check(walked.created === true && lb.proposedPackage.modules.join() === rec.modules.join() && lb.signupDiscovery.recommendation.modules.join() === rec.modules.join(), 'a self-serve signup proposes the recommended package from its answers');
  equal(lb.signupDiscovery.discovery.spend.consultants, 150000, 'the answers are kept for the rep who approves');
  caller = { uid: 'b1', staff: false, email: 'b@bad.example', orgId: 'bad.example', role: 'owner', claims: { email_verified: true } };
  await refused(function () { return signup({ method: 'POST', headers: {}, body: { companyName: 'Bad Answers', vertical: 'developer', discovery: { answers: { ev: 'later' } }, billingProfile: Object.assign({}, H.profile('bad.example', 'Bad Answers'), { vertical: 'developer' }) } }); }, /quarter, year or no/, 'a malformed discovery is refused before anything is written');
  check(!db.data.get('omega_orgs/bad.example'), 'nothing was written for it');
  /* ── an existing paid tenant accepts through plan-change ── */
  book = fresh();
  H.seedPaidTenant(db, { org: 'walters.example', name: 'Walters Wholesale', keys: ['lite', 'whitelabel', 'estimate'], plan: 'alacarte', profile: H.profile('walters.example', 'Walters Wholesale'), member: 'w1' });
  var ws = await post({ action: 'save', prospect: { company: 'Walters Wholesale', domain: 'walters.example', contactName: 'Wes Walters', email: 'wes@walters.example' }, discovery: { answers: { design: 'quarter', sell: 'quarter' }, flags: { sellOrders: true, sellShips: true } }, selection: { modules: ['lite', 'whitelabel', 'estimate', 'logic-office', 'logic-logistics'] } });
  check(ws.proposal.prospect.orgId === 'walters.example' && ws.proposal.prospect.existing.packaged === true, 'an existing workspace is recognised by its domain');
  var wsent = await post({ action: 'send', id: ws.id }), wkey = /key=([a-f0-9]{48})$/.exec(wsent.url)[1];
  equal((await get({ id: ws.id, key: wkey }, null)).accept, { how: 'sign-in', signupUrl: null, host: 'fixture.example' }, 'an existing customer signs in to accept');
  var owner = { uid: 'w1', staff: false, email: 'wes@walters.example', orgId: 'walters.example', role: 'owner', claims: { email_verified: true } };
  var wm = { uid: 'w2', staff: false, email: 'someone@walters.example', orgId: 'walters.example', role: 'member', claims: { email_verified: true } };
  await refused(function () { return post({ action: 'accept', id: ws.id, key: wkey }, wm); }, /workspace administrator/, 'a member cannot accept');
  await refused(function () { return post({ action: 'accept', id: ws.id, key: wkey }, { uid: 'x', staff: false, email: 'x@other.example', orgId: 'other.example', role: 'owner', claims: { email_verified: true } }); }, /Own organization/, 'another organization cannot accept');
  var outcome = await post({ action: 'accept', id: ws.id, key: wkey }, owner);
  check(outcome.path === 'plan-change' && outcome.state === 'awaiting_payment' && qbo.invoices === 1 && /^change-/.test(outcome.changeId), 'a paid tenant’s acceptance is a pay-first change invoice');
  var wb = db.data.get('omega_orgs/walters.example/billing/current');
  equal(wb.modules, ['lite', 'estimate', 'whitelabel'], 'nothing switches on before the change invoice is paid (catalog order)');
  equal(db.data.get('subscription_proposals/' + ws.id).status, 'accepted', 'the proposal is accepted');
  equal(await post({ action: 'accept', id: ws.id, key: wkey }, owner), outcome, 'accepting again returns the same result and issues nothing');
  check(qbo.invoices === 1, 'one invoice');
  /* ── an active but unpackaged tenant gets the proposal as its proposed package ── */
  db.seed('omega_orgs/cir.example', { name: 'CIR', status: 'active', packagingSandbox: true, signedUpAt: '2026-08-01T12:00:00Z', domains: ['cir.example'] });
  db.seed('omega_orgs/cir.example/billing/current', { tier: 'deluxe' });
  db.seed('omega_orgs/cir.example/billing/profile', H.profile('cir.example', 'CIR'));
  var cs = await post({ action: 'save', prospect: { company: 'CIR', domain: 'cir.example', email: 'pm@cir.example' }, discovery: { answers: { design: 'quarter', plansets: 'quarter', engineering: 'quarter', estimate: 'quarter', permitting: 'quarter' } }, selection: { modules: ['lite', 'plansets', 'engineering', 'estimate', 'permitting'], plan: 'pro', credit: true } });
  var csent = await post({ action: 'send', id: cs.id }), ckey = /key=([a-f0-9]{48})$/.exec(csent.url)[1];
  var cOwner = { uid: 'c1', staff: false, email: 'pm@cir.example', orgId: 'cir.example', role: 'owner', claims: { email_verified: true } };
  var cOut = await post({ action: 'accept', id: cs.id, key: ckey }, cOwner);
  var cb = db.data.get('omega_orgs/cir.example/billing/current');
  check(cOut.path === 'activation' && cb.proposedPackage.plan === 'pro' && cb.proposedPackage.modules.length === 5 && cb.proposalId === cs.id && cb.tier === 'deluxe', 'an unpackaged tenant’s acceptance proposes the package for staff to activate; nothing else changes');
  check(!!db.data.get('omega_orgs/clearsky-usa.com/notifications/proposal-' + cs.id), 'staff are told to activate');
  /* ── decline and expiry ── */
  var ds = await post({ action: 'save', prospect: { company: 'Roam Energy', domain: 'roam.example', email: 'r@roam.example' }, discovery: {}, selection: { modules: ['lite'] } });
  await refused(function () { return post({ action: 'decline', id: ds.id }); }, /cannot become declined/, 'only a sent proposal is declined');
  var dsent = await post({ action: 'send', id: ds.id }), dkey = /key=([a-f0-9]{48})$/.exec(dsent.url)[1];
  equal((await post({ action: 'decline', id: ds.id })).status, 'declined', 'declined');
  await refused(function () { return post({ action: 'accept', id: ds.id, key: dkey }, cOwner); }, /cannot become accepted/, 'a declined proposal cannot be accepted');
  var es = await post({ action: 'save', prospect: { company: 'R.E.S.', domain: 'res.example', email: 'r@res.example' }, discovery: {}, selection: { modules: ['lite'] } });
  var esent = await post({ action: 'send', id: es.id }), ekey = /key=([a-f0-9]{48})$/.exec(esent.url)[1];
  now = NOW + 31 * 86400000;
  var late = await get({ id: es.id, key: ekey }, null);
  check(late.proposal.status === 'expired' && late.accept.how === 'none' && db.data.get('subscription_proposals/' + es.id).status === 'expired', 'after 30 days the link shows an expired proposal');
  db.seed('omega_orgs/res.example', { name: 'RES', status: 'active', packagingSandbox: true, domains: ['res.example'] });
  await refused(function () { return post({ action: 'accept', id: es.id, key: ekey }, { uid: 'r1', staff: false, email: 'r@res.example', orgId: 'res.example', role: 'owner', claims: { email_verified: true } }); }, /cannot become accepted|expired/, 'an expired proposal cannot be accepted');
  now = NOW;
  console.log('Subscription proposal: ' + count + ' passed; mail and QuickBooks stand-ins, no network.');
}
run().then(function () { Date.now = realNow; }, function (e) { Date.now = realNow; console.error(e); process.exit(1); });
