/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Plan & billing's Payment method, linked to Stripe (api/stripe-customer.js
 * on api/_lib/stripe-customer.js; Tommy, 2026-09-27: "This payment method
 * should be linked to the stripe payment system we built with quickbooks.
 * Stripe collects and takes the payment and sends it to quickbooks which is
 * our account").
 *
 *   the door      an owner or administrator (or verified staff) of their own
 *                 workspace; a member reads the record, never this
 *   the card      Add a card links ONE Stripe customer (never a second, even
 *                 two admins at once), opens Stripe's add-a-payment-method
 *                 flow back to /workspace#billing, and the card is read back
 *                 from Stripe, never stored
 *   the amount    ClearSky's amountDue is ONE Stripe invoice per due date and
 *                 amount, paid on Stripe's page; I've paid and the webhook
 *                 record it once (amountDue 0, lastPaidAt, amountPaid, the
 *                 receipt, ClearSky's alert), never through the tier path;
 *                 a changed figure voids the stale invoice, a stale payment
 *                 is ClearSky's review, an open invoice ClearSky made is
 *                 never doubled
 *   the guards    a test key never binds a real tenant (the one database is
 *                 production's), a binding in the other mode is never
 *                 overwritten, a package and a QuickBooks plan keep their rail
 * Firestore and Stripe doubles; nothing reaches the network. Every write is
 * checked for an undefined value, which the Admin SDK refuses.
 */
'use strict';
var assert = require('assert'), fs = require('fs'), path = require('path'), Module = require('module');
var F = require('./_lib/firestore-double'), SD = require('./_lib/stripe-double').StripeDouble;
var db, count = 0;
function env(o) { Object.keys(o).forEach(function (k) { if (o[k] == null) delete process.env[k]; else process.env[k] = o[k]; }); }
env({ STRIPE_SECRET_KEY: 'sk_live_double', PACKAGING_PROVIDER: null, PACKAGING_LIVE: null, QBO_ENV: null });

/* ── the Admin SDK refuses undefined anywhere in a write: so does this ── */
function defined(v, at) {
  if (v === undefined) throw new Error('undefined written at ' + at);
  if (v && typeof v === 'object') Object.keys(v).forEach(function (k) { defined(v[k], at + '.' + k); });
}
var runOne = F.DB.prototype.runOne;
F.DB.prototype.runOne = function (fn) {
  return runOne.call(this, function (tx) {
    return fn({ get: tx.get, create: function (r, v) { defined(v, r.path); return tx.create(r, v); }, set: function (r, v, o) { defined(v, r.path); return tx.set(r, v, o); }, update: function (r, v) { defined(v, r.path); return tx.update(r, v); } });
  });
};
['set', 'update', 'create'].forEach(function (k) { var orig = F.Ref.prototype[k]; F.Ref.prototype[k] = function (v, o) { defined(v, this.path); return orig.call(this, v, o); }; });

F.mock('../api/_lib/admin', { handler: function (fn) { return fn; }, authenticate: async function (req) { return req.caller; }, db: function () { return db; },
  httpError: function (status, text) { var e = new Error(text); e.status = status; return e; }, safeOrg: function (s) { return /^[a-z0-9.-]+\.[a-z]+$/.test(s || '') ? s : ''; },
  orgOf: function (x) { return String(x).split('@')[1]; },
  isTenantAdmin: async function (c, o) { if (c.staff) return true; if (c.orgId !== o) return false; var m = await db.doc('omega_orgs/' + o + '/members/' + c.uid).get(); return m.exists && m.data().status !== 'disabled' && ['owner', 'admin'].indexOf(m.data().role) >= 0; },
  clientAdmin: async function (c, o) { if (c.staff) return true; if (c.orgId !== o) return false; var m = await db.doc('omega_orgs/' + o + '/members/' + c.uid).get(), r = await db.doc('omega_orgs/' + o).get(); return m.exists && m.data().status !== 'disabled' && ['owner', 'admin'].indexOf(m.data().role) >= 0 && r.exists && r.data().status === 'active'; },
  canActInOrg: async function (c, o) { return c.staff || c.orgId === o; },
  billingOf: async function (o) { var r = await db.doc('omega_orgs/' + o + '/billing/current').get(); return r.exists ? r.data() : {}; },
  FieldValue: function () { return { serverTimestamp: function () { return Date.now(); } }; },
  init: function () { return { auth: function () { return { setCustomUserClaims: async function () {} }; } }; } });
var SC = require('../api/_lib/stripe-customer'), api = require('../api/stripe-customer');

var MAILED = [];
var mailer = { templates: new Proxy({}, { get: function (t, name) { return async function (o) { MAILED.push({ template: name, email: o.email, text: o.text, invoiceId: o.invoiceId }); return { ok: true }; }; } }) };

var ORG = 'concord.example', ROOT = 'omega_orgs/' + ORG, CUR = ROOT + '/billing/current', HOST = 'concord.clearskyomega.com';
var owner = { staff: false, uid: 'u-owner', email: 'pat@concord.example', orgId: ORG, claims: { email_verified: true } };
var admin2 = Object.assign({}, owner, { uid: 'u-admin', email: 'sam@concord.example' });
var member = Object.assign({}, owner, { uid: 'u-member', email: 'lee@concord.example' });
var staff = { staff: true, uid: 'u-staff', email: 'tom@clearsky-usa.com', orgId: 'clearsky-usa.com', claims: { email_verified: true } };
function fixture(billing, org) {
  db = new F.DB(); db.serial = true;
  db.seed(ROOT, Object.assign({ name: 'Concord Energy', status: 'active', domains: [HOST] }, org || {}));
  if (billing !== null) db.seed(CUR, billing || { tier: 'standard', addons: [], toolOverrides: {}, paymentProvider: 'manual', amountDue: 1299, subscriptionDue: '2026-09-02', amountPaid: 1299, lastPaidAt: '2026-08-02' });
  db.seed(ROOT + '/members/u-owner', { role: 'owner', status: 'active', email: owner.email });
  db.seed(ROOT + '/members/u-admin', { role: 'admin', status: 'active', email: admin2.email });
  db.seed(ROOT + '/members/u-member', { role: 'member', status: 'active', email: member.email });
  MAILED = [];
}
function bill() { return db.data.get(CUR); }
function keys(prefix) { return Array.from(db.data.keys()).filter(function (k) { return k.indexOf(prefix) === 0; }); }
function call(caller, body, stripe, host) { api.deps = { stripe: stripe === undefined ? null : stripe, mail: mailer }; return api({ method: 'POST', caller: caller, body: body || {}, headers: { host: host || HOST } }, { setHeader: function () {} }); }
function ok(v, text, detail) { if (!v) { console.error('FAIL ' + text + (detail !== undefined ? '\n   ' + JSON.stringify(detail).slice(0, 500) : '')); process.exitCode = 1; throw new Error(text); } count++; console.log('  ok   ' + text); }
async function refused(text, fn, re, status) {
  var e = await fn().then(function () { return null; }, function (x) { return x; });
  ok(!!e && re.test(e.message) && (!status || e.status === status), text, e ? { message: e.message, status: e.status } : 'was not refused');
  return e;
}

async function door() {
  console.log('\nthe door: an owner or administrator of their own workspace, or verified staff');
  fixture(); var s = new SD({ livemode: true });
  var uv = await call(Object.assign({}, owner, { claims: {} }), { action: 'view' }, s);
  ok(uv.orgId === ORG, 'an unverified owner of an active client may: the role vouches (admin.clientAdmin; a Team invitation makes its account unverified)', uv);
  await refused('an unverified member is refused', function () { return call(Object.assign({}, member, { claims: {} }), { action: 'view' }, s); }, /Verified email/, 403);
  fixture(undefined, { status: 'pending' });
  await refused('an unverified owner of a workspace still pending approval is refused', function () { return call(Object.assign({}, owner, { claims: {} }), { action: 'view' }, s); }, /Verified email/, 403);
  fixture();
  await refused('another workspace is refused', function () { return call(owner, { orgId: 'other.example', action: 'view' }, s); }, /Own organization/, 403);
  await refused('a member is refused: the card is the owner\'s and the administrators\'', function () { return call(member, { action: 'card' }, s); }, /owner or administrator/, 403);
  await refused('an unknown field is refused', function () { return call(owner, { action: 'view', amount: 1 }, s); }, /Unsupported field/, 400);
  await refused('an unknown action is refused', function () { return call(owner, { action: 'refund' }, s); }, /Action must be/, 400);
  var v = await call(staff, { orgId: ORG, action: 'view' }, s);
  ok(v.orgId === ORG && v.rail === 'stripe', 'verified ClearSky staff may act for a tenant', v);
  ok(s.calls.length === 0, '...and a workspace with no Stripe customer costs no Stripe call to view', s.calls);
}

async function card() {
  console.log('\nAdd a card: one Stripe customer, Stripe\'s own page, back to Plan & billing');
  fixture(); var s = new SD({ livemode: true });
  var v = await call(owner, { action: 'view' }, s);
  ok(v.rail === 'stripe' && v.linked === false && v.canLink === true && v.card === null && v.reason === null, 'a plan ClearSky invoiced by hand ("manual") is Stripe\'s to link: the card can be added', v);
  ok(v.due && v.due.cents === 129900 && v.due.display === '$1,299' && v.due.date === '2026-09-02' && v.due.open === null && v.canPay === true, 'the amount due is ClearSky\'s own figure, payable through Stripe', v.due);
  var r = await call(owner, { action: 'card' }, s);
  var sess = s.sessions[0], b = bill(), cus = s.customers_[b.stripeCustomerId];
  ok(/^https:\/\/billing\.stripe\.com\//.test(r.url) && s.sessions.length === 1, 'Add a card answers with Stripe\'s own page', r);
  ok(sess.flow && sess.flow.type === 'payment_method_update' && sess.flow.after_completion.type === 'redirect' && sess.flow.after_completion.redirect.return_url === 'https://' + HOST + '/workspace#billing' && sess.return_url === 'https://' + HOST + '/workspace#billing',
    'it is the add-a-payment-method flow (the card becomes the default for invoices) and it comes back to Plan & billing on the same host', sess);
  ok(sess.configuration === null && s.all('configs').length === 0, 'Stripe\'s own portal settings are used whenever they take the card: nothing of OMEGA\'s is made', sess);
  ok(/^cus_/.test(b.stripeCustomerId) && b.stripeLivemode === true && b.paymentProvider === 'stripe' && b.stripeLinkedBy === owner.email && b.stripeLinkLock === null, 'the workspace is bound to its Stripe customer, in live mode, and now pays by card through Stripe', b);
  ok(cus.email === owner.email && cus.name === 'Concord Energy' && cus.metadata.orgId === ORG && cus.metadata.omegaOrg === ORG, 'the customer is the workspace (its name, the owner\'s address with no billing contact saved, both marks the webhook and the engine read)', cus);
  var hist = db.data.get(CUR + '/history/stripe-linked-' + b.stripeCustomerId);
  ok(hist && hist.was.paymentProvider === 'manual' && hist.changed.paymentProvider === 'stripe' && hist.by === owner.email && db.data.get(ROOT + '/admin_audit/stripe-linked-' + b.stripeCustomerId), 'the link is a history row and an audit row: who, what it was', hist);
  await call(admin2, { action: 'card' }, s);
  ok(s.all('customers').length === 1 && s.sessions[1].customer === b.stripeCustomerId, 'asked again (another administrator): the same customer, never a second');
  s.saveCard(b.stripeCustomerId);
  v = await call(owner, { action: 'view' }, s);
  ok(v.linked && v.card && v.card.label === 'Visa ending 4242' && v.card.expires === '12/2030' && v.canLink, 'the card is read back from Stripe: brand, last four, expiry', v.card);
  ok(!/4242|visa/i.test(JSON.stringify(bill())), '...and nothing about it is written to the workspace\'s record');
  var p = await call(owner, { action: 'portal' }, s);
  ok(/^https:\/\/billing\.stripe\.com\//.test(p.url) && s.sessions[2].flow === null, 'Invoices and receipts is the plain portal for the same customer', s.sessions[2]);

  console.log('\nthe billing contact, when one is saved, is who Stripe writes to');
  fixture(); db.seed(CUR.replace('current', 'profile'), { legalName: 'Concord Energy LLC', email: 'ap@concord.example', contactName: 'AP' });
  var s2 = new SD({ livemode: true }); await call(owner, { action: 'card' }, s2);
  var c2 = s2.all('customers')[0];
  ok(c2.email === 'ap@concord.example' && c2.name === 'Concord Energy LLC', 'the billing profile names the customer and its receipts address', c2);
  fixture(); var s3 = new SD({ livemode: true });
  await refused('staff with no billing contact on file never gives Stripe a ClearSky address', function () { return call(staff, { orgId: ORG, action: 'card' }, s3); }, /billing contact/);
  ok(s3.all('customers').length === 0 && !bill().stripeCustomerId && !bill().stripeLinkLock, '...nothing was made, and the lock is released');

  console.log('\ntwo administrators at once: one customer');
  fixture(); var s4 = new SD({ livemode: true });
  var both = await Promise.all([call(owner, { action: 'card' }, s4).catch(function (e) { return e; }), call(admin2, { action: 'card' }, s4).catch(function (e) { return e; })]);
  ok(s4.all('customers').length === 1 && bill().stripeCustomerId === s4.all('customers')[0].id && both.some(function (x) { return x && x.url; }), 'one customer is made and bound; the other click waits or is told to try again', both.map(function (x) { return x.url || x.message; }));
  var again = await call(admin2, { action: 'card' }, s4);
  ok(!!again.url && s4.all('customers').length === 1, '...and a retry opens the page for the same one');

  console.log('\nStripe\'s portal settings never saved: OMEGA\'s own, the card and the invoices only');
  fixture(); var s5 = new SD({ livemode: true, portalRefuses: true });
  var r5 = await call(owner, { action: 'card' }, s5), cfg5 = s5.all('configs');
  ok(!!r5.url && cfg5.length === 1 && s5.sessions.length === 1 && s5.sessions[0].configuration === cfg5[0].id && s5.sessions[0].flow.type === 'payment_method_update', 'a portal whose settings nobody saved in Stripe still takes the card, through OMEGA\'s own portal settings', { r: r5, configs: cfg5, sessions: s5.sessions });
  var f5 = cfg5[0].features;
  ok(cfg5[0].metadata.omega === 'workspace-billing' && cfg5[0].livemode === true && f5.payment_method_update.enabled === true && f5.invoice_history.enabled === true && Object.keys(f5).sort().join() === 'invoice_history,payment_method_update', '...which offer the card and the invoice history and nothing else: no cancelling, no plan changes', cfg5[0]);
  await call(admin2, { action: 'card' }, s5); await call(owner, { action: 'portal' }, s5);
  ok(s5.all('configs').length === 1 && s5.sessions[1].configuration === cfg5[0].id && s5.sessions[2].configuration === cfg5[0].id && s5.calls.filter(function (c) { return c === 'billingPortal.configurations.create'; }).length === 1, '...made once and found again by its mark (another administrator, the invoice portal)', s5.sessions);
  console.log('\nStripe\'s side can refuse: said plainly');
  fixture(); var s5b = new SD({ livemode: true, portalRefuses: true, configRefuses: true });
  await refused('a key that may not make portal settings either: ClearSky\'s to switch on in Stripe, said in words', function () { return call(owner, { action: 'card' }, s5b); }, /customer portal is not switched on/, 409);
  fixture(Object.assign({}, bill(), { stripeCustomerId: 'cus_other', stripeLivemode: true })); var s6 = new SD({ livemode: true });
  s6.customers_.cus_other = { id: 'cus_other', object: 'customer', livemode: true, email: 'x@other.example', metadata: { orgId: 'other.example' } };
  await refused('a customer on the record marked for another workspace is never used', function () { return call(owner, { action: 'card' }, s6); }, /another workspace/);
  s6.customers_.cus_other = { id: 'cus_other', object: 'customer', livemode: true, deleted: true };
  await refused('a customer deleted in Stripe is ClearSky\'s to relink', function () { return call(owner, { action: 'card' }, s6); }, /deleted in Stripe/);
  ok(bill().stripeCustomerId === 'cus_other', '...and neither refusal overwrote the binding');
}

async function paying() {
  console.log('\nthe amount due, paid by card on Stripe\'s page');
  fixture(); var s = new SD({ livemode: true }), now = Date.parse('2026-09-27T15:00:00Z');
  var r = await call(owner, { action: 'pay' }, s);
  var b = bill(), inv = s.invoices_[r.invoiceId], lines = s.all('items').filter(function (x) { return x.invoice === r.invoiceId; });
  ok(r.state === 'open' && /^https:\/\/invoice\.stripe\.com\//.test(r.url) && r.display === '$1,299', 'Pay answers with Stripe\'s hosted invoice page for $1,299', r);
  ok(inv.collection_method === 'send_invoice' && inv.currency === 'usd' && inv.total === 129900 && inv.status === 'open' && inv.metadata.omegaDue === ORG + '/2026-09-02/129900' && inv.metadata.omegaOrg === ORG && !inv.metadata.omegaPackage && !inv.metadata.orgId,
    'one send_invoice invoice in dollars for ClearSky\'s figure, marked with the due date and amount, never as a package invoice', inv);
  ok(lines.length === 1 && lines[0].amount === 129900 && lines[0].description === 'OMEGA Standard plan · due Sep 2, 2026', 'one line: the plan and its due date', lines);
  ok(/^cus_/.test(b.stripeCustomerId) && b.stripeDue.invoiceId === r.invoiceId && b.stripeDue.state === 'open' && b.stripeDue.hostedUrl === r.url, 'paying links the customer first and keeps the open invoice on the record', b.stripeDue);
  ok(s.sent.length === 1 && s.sent[0] === r.invoiceId, 'Stripe emails the invoice once: the accountant\'s copy');
  var r2 = await call(owner, { action: 'pay' }, s);
  ok(r2.invoiceId === r.invoiceId && s.all('invoices').length === 1 && s.sent.length === 1, 'asked again (a second tab, a retry): the same invoice, nothing new, nothing re-sent');
  var v = await call(owner, { action: 'view' }, s);
  ok(v.due.open && v.due.open.url === r.url, 'the page is told the invoice is open, with its page', v.due);
  var c = await SC.check(db, await SC.context(db, ORG), owner, s, now, mailer);
  ok(c.state === 'open' && !c.recorded && bill().amountDue === 1299, 'I\'ve paid before paying: still open, nothing recorded', c);
  var t = await SC.check(db, await SC.context(db, ORG), owner, s, now + 2000, mailer);
  ok(t.throttled === true, 'one look every eight seconds', t);

  s.pay(r.invoiceId);
  c = await SC.check(db, await SC.context(db, ORG), owner, s, now + 9000, mailer);
  b = bill();
  ok(c.state === 'paid' && c.recorded === true && c.matches === true, 'paid on Stripe\'s page: I\'ve paid records it', c);
  ok(b.amountDue === 0 && b.lastPaidAt === new Date(1790000000 * 1000).toISOString() && b.amountPaid === 2598 && b.paymentFailedAt === null && b.stripeDue.state === 'paid' && b.subscriptionDue === '2026-09-02',
    'nothing owed, the payment dated as Stripe dated it, paid to date grows by what was paid, and ClearSky\'s schedule is left as ClearSky set it', b);
  var hist = db.data.get(CUR + '/history/stripe-paid-' + r.invoiceId);
  ok(hist && hist.was.amountDue === 1299 && hist.changed.amountDue === 0 && hist.amountCents === 129900, 'one history row: what it was, what it is', hist);
  ok(MAILED.some(function (m) { return m.template === 'paid' && m.email === owner.email && /\$1,299 by card through Stripe/.test(m.text); }) && MAILED.some(function (m) { return m.template === 'paidAlert' && m.invoiceId === r.invoiceId; }),
    'the tenant\'s receipt (to the customer\'s address; there is no billing profile) and ClearSky\'s alert went out', MAILED);
  var mails = MAILED.length;
  c = await SC.check(db, await SC.context(db, ORG), owner, s, now + 20000, mailer);
  ok(c.state === 'paid' && !c.recorded && bill().amountPaid === 2598 && MAILED.length === mails, 'looked at again: recorded once, mailed once');
  await refused('nothing owed: nothing to pay', function () { return call(owner, { action: 'pay' }, s); }, /Nothing is owed/);

  console.log('\na figure that changes: the stale invoice is voided, a stale payment is ClearSky\'s review');
  fixture(); s = new SD({ livemode: true });
  var a = await call(owner, { action: 'pay' }, s);
  var cur = bill(); cur.amountDue = 2598; cur.subscriptionDue = '2026-10-02'; db.seed(CUR, cur);
  var bnew = await call(owner, { action: 'pay' }, s);
  ok(s.invoices_[a.invoiceId].status === 'void' && s.invoices_[bnew.invoiceId].total === 259800 && bnew.invoiceId !== a.invoiceId, 'ClearSky changed the figure: the old invoice is voided, the new one bills the new figure', { old: s.invoices_[a.invoiceId].status, total: s.invoices_[bnew.invoiceId].total });
  fixture(); s = new SD({ livemode: true });
  a = await call(owner, { action: 'pay' }, s);
  cur = bill(); cur.amountDue = 500; db.seed(CUR, cur);
  s.pay(a.invoiceId);
  var st = await SC.settle(db, ORG, a.invoiceId, s, now, 'stripe');
  ok(st.recorded && st.matches === false && bill().amountDue === 500 && bill().amountPaid === 2598, 'a payment for a figure that has since changed is recorded, and the amount due is left as it is', bill());
  ok(!!db.data.get('omega_orgs/clearsky-usa.com/notifications/billing-review-' + ORG + '-' + a.invoiceId), '...and ClearSky is asked to look');

  console.log('\nan invoice ClearSky already has open in Stripe is never doubled');
  fixture(); s = new SD({ livemode: true });
  await call(owner, { action: 'card' }, s);
  var byHand = await s.invoices.create({ customer: bill().stripeCustomerId, collection_method: 'send_invoice', days_until_due: 7, currency: 'usd', metadata: {} });
  await s.invoiceItems.create({ customer: bill().stripeCustomerId, invoice: byHand.id, amount: 129900, currency: 'usd', description: 'September' });
  await s.invoices.finalizeInvoice(byHand.id, {});
  await refused('the dashboard\'s open invoice is the way to pay', function () { return call(owner, { action: 'pay' }, s); }, /already has an open invoice/);
  ok(s.all('invoices').length === 1, '...and no second invoice was made');

  console.log('\nan add-on the engine invoiced on the same customer sits beside the plan, never in its way (Concord, 2026-09-28)');
  fixture(); s = new SD({ livemode: true });
  await call(owner, { action: 'card' }, s);
  var addon = await s.invoices.create({ customer: bill().stripeCustomerId, collection_method: 'send_invoice', days_until_due: 1, currency: 'usd', metadata: { omegaPackage: 'true', omegaOrg: ORG, omegaKind: 'addon', omegaMarker: 'OMEGA add-on ' + ORG + ' / 2026-09-28 / abc' } });
  await s.invoiceItems.create({ customer: bill().stripeCustomerId, invoice: addon.id, amount: 50000, currency: 'usd', description: 'Add-on: Omega Compute' });
  await s.invoices.finalizeInvoice(addon.id, {});
  var beside = await call(owner, { action: 'pay' }, s);
  ok(beside.state === 'open' && beside.invoiceId !== addon.id && s.invoices_[beside.invoiceId].total === 129900 && s.invoices_[addon.id].status === 'open',
    'the plan\'s $1,299 gets its own invoice; the open $500 add-on invoice is neither paid here nor voided (its record decides)', { beside: beside, addon: s.invoices_[addon.id].status });

  console.log('\na customer ClearSky made by hand, and Stripe saying no');
  fixture(Object.assign({}, bill(), { stripeCustomerId: 'cus_byhand', stripeLivemode: true }));
  s = new SD({ livemode: true }); s.customers_.cus_byhand = { id: 'cus_byhand', object: 'customer', livemode: true, metadata: { orgId: ORG } };
  r = await call(owner, { action: 'pay' }, s);
  ok(s.customers_.cus_byhand.email === owner.email && s.invoices_[r.invoiceId].customer === 'cus_byhand' && s.all('customers').length === 1, 'a customer made in the dashboard with no address gets the billing contact\'s before Stripe is asked to send it an invoice', s.customers_.cus_byhand);
  s.invoices.list = async function () { var e = new Error('Invalid API Key provided'); e.type = 'StripeAuthenticationError'; e.statusCode = 401; throw e; };
  await refused('Stripe\'s own refusal is said as Stripe\'s (409), never as our 500', function () { return call(owner, { action: 'pay' }, s); }, /^Stripe refused: Invalid API Key/, 409);

  console.log('\nwhen paying from here does not apply');
  fixture(Object.assign({}, bill(), { paymentLink: 'https://buy.stripe.com/test_link' }));
  s = new SD({ livemode: true });
  await refused('ClearSky set a payment link of its own: that is the way to pay', function () { return call(owner, { action: 'pay' }, s); }, /payment link/);
  v = await call(owner, { action: 'view' }, s);
  ok(v.canPay === false && /payment link/.test(v.payReason), '...and the page is told why', v);
  fixture({ tier: 'standard', paymentProvider: 'manual', amountDue: 0.3, subscriptionDue: '2026-09-02' });
  await refused('below Stripe\'s minimum card payment', function () { return call(owner, { action: 'pay' }, new SD({ livemode: true })); }, /minimum/);
}

async function webhook() {
  console.log('\nthe webhook records a paid amount due once, never through the tier path');
  fixture(); var s = new SD({ livemode: true });
  var r = await call(owner, { action: 'pay' }, s);
  s.pay(r.invoiceId);
  var load = Module._load, Hook;
  Module._load = function (request) { if (request === 'stripe') return function () { return { webhooks: { constructEvent: function (buf, sig) { if (sig !== 'signed') throw new Error('bad'); return JSON.parse(String(buf)); } } }; }; return load.apply(this, arguments); };
  try {
    delete require.cache[require.resolve('../api/stripe-webhook')];
    Hook = require('../api/stripe-webhook'); Hook.deps = { stripe: s, mail: mailer };
    var hook = function (evt) {
      return new Promise(function (resolve) {
        var listeners = {}, req = { method: 'POST', headers: { 'stripe-signature': 'signed' }, on: function (n, f) { listeners[n] = f; return req; } };
        var res = { code: 200, status: function (c) { res.code = c; return res; }, json: function (b) { resolve({ code: res.code, body: b }); }, send: function (b) { resolve({ code: res.code, body: b }); }, end: function () { resolve({ code: res.code }); } };
        Hook(req, res); setImmediate(function () { listeners.data(Buffer.from(JSON.stringify(evt))); listeners.end(); });
      });
    };
    var got = await hook(s.event('invoice.paid', r.invoiceId)), b = bill();
    ok(got.code === 200 && got.body.due && got.body.due.recorded === true, 'invoice.paid is answered as the plan\'s amount due', got.body);
    ok(b.amountDue === 0 && b.amountPaid === 2598 && b.subscriptionDue === '2026-09-02' && b.lastStripeEvent === undefined && db.data.get(ROOT).status === 'active', 'recorded; and the tier path never ran (it would have moved the due date to the invoice\'s own)', b);
    var again = await hook(s.event('invoice.payment_succeeded', r.invoiceId));
    ok(again.code === 200 && !again.body.due.recorded && bill().amountPaid === 2598, 'the same payment again (another event, a retry) is not counted twice', again.body);
    var foreign = await hook({ id: 'evt_x', type: 'invoice.paid', data: { object: { id: 'in_zzz', object: 'invoice', metadata: { omegaDue: 'x', omegaOrg: 'nobody.example' } } } });
    ok(foreign.code === 200 && /no Stripe customer|not this workspace/.test(foreign.body.due.ignored || ''), 'an invoice for a workspace that is not bound is acknowledged and changes nothing', foreign.body);
  } finally { Module._load = load; if (Hook) Hook.deps = null; }
  ok(SC.eventOrg(s.event('invoice.paid', r.invoiceId)) === ORG, 'which events are a plan\'s amount due: ours');
  ok(SC.eventOrg({ type: 'invoice.paid', data: { object: { object: 'invoice', metadata: { omegaPackage: 'true', omegaOrg: ORG, omegaDue: 'x' } } } }) === null
    && SC.eventOrg({ type: 'invoice.paid', data: { object: { object: 'invoice', metadata: { orgId: ORG } } } }) === null
    && SC.eventOrg({ type: 'customer.updated', data: { object: { object: 'customer', metadata: { omegaDue: 'x', omegaOrg: ORG } } } }) === null
    && SC.eventOrg({ type: 'invoice.paid', data: { object: { object: 'invoice', metadata: { omegaDue: 'x', omegaOrg: '../omega_orgs' } } } }) === null,
    '...never a package invoice, a tier invoice, a customer event or a mark that is not a workspace');
}

async function guards() {
  console.log('\nthe one database is production\'s: a test key never binds a real tenant');
  fixture(); env({ STRIPE_SECRET_KEY: 'sk_test_double' }); var s = new SD({ livemode: false });
  var v = await call(owner, { action: 'view' }, s);
  ok(v.canLink === false && /test mode/.test(v.reason) && v.canPay === false, 'a preview deployment (test key) tells a real workspace no', v);
  await refused('...and refuses to link it', function () { return call(owner, { action: 'card' }, s); }, /test mode/);
  ok(!bill().stripeCustomerId && s.calls.length === 0, '...before any Stripe call, writing nothing', s.calls);
  fixture(undefined, { packagingSandbox: true }); s = new SD({ livemode: false });
  var r = await call(owner, { action: 'card' }, s);
  ok(!!r.url && bill().stripeLivemode === false, 'a sandbox workspace links in test mode');
  env({ STRIPE_SECRET_KEY: 'sk_live_double' });
  v = await call(owner, { action: 'view' }, new SD({ livemode: true }));
  ok(!v.canLink && /test account; this deployment uses Stripe’s live mode/.test(v.reason), 'a binding made in the other mode is named, never used', v);
  await refused('...and never overwritten', function () { return call(owner, { action: 'card' }, new SD({ livemode: true })); }, /test account/);
  ok(bill().stripeLivemode === false, '...the binding is as it was');
  env({ STRIPE_SECRET_KEY: null });
  fixture(); v = await call(owner, { action: 'view' }, null);
  ok(/not set up/.test(v.reason) && !v.canLink, 'no Stripe key: the page is told plainly', v);
  await refused('...and an action is a 503', function () { return call(owner, { action: 'card' }, null); }, /not set up/, 503);
  env({ STRIPE_SECRET_KEY: 'sk_live_double' });

  console.log('\nthe rail stays where it is');
  fixture({ packaged: true, billingProvider: 'quickbooks', paymentProvider: 'quickbooks', qboCustomerId: 'C1', modules: ['lite'], amountDue: 500 });
  s = new SD({ livemode: true });
  v = await call(owner, { action: 'view' }, s);
  ok(v.rail === 'quickbooks' && !v.canLink && /QuickBooks/.test(v.reason), 'a package billed through QuickBooks keeps its card on QuickBooks\' page', v);
  await refused('...Add a card is refused', function () { return call(owner, { action: 'card' }, s); }, /billed by its package/);
  await refused('...and so is paying from here', function () { return call(owner, { action: 'pay' }, s); }, /billed by its package/);
  fixture({ packaged: true, billingProvider: 'stripe', paymentProvider: 'stripe', stripeCustomerId: 'cus_pkg', stripeLivemode: true, modules: ['lite'] });
  s = new SD({ livemode: true }); s.customers_.cus_pkg = { id: 'cus_pkg', object: 'customer', livemode: true, email: 'ap@concord.example', metadata: { omegaOrg: ORG, omegaPackage: 'true' } }; s.saveCard('cus_pkg', { brand: 'mastercard', last4: '4444', exp_month: 3, exp_year: 2029 });
  v = await call(owner, { action: 'view' }, s);
  ok(v.rail === 'stripe' && v.card.label === 'Mastercard ending 4444' && v.card.expires === '03/2029' && v.canLink && v.due === null, 'a package on the Stripe rail: its card is read back, and it may change it', v);
  r = await call(owner, { action: 'card' }, s);
  ok(r.url && s.sessions[0].customer === 'cus_pkg' && s.all('customers').length === 1, '...on its own customer, the engine\'s');
  await refused('...its invoices stay the engine\'s', function () { return call(owner, { action: 'pay' }, s); }, /billed by its package/);
  fixture({ packaged: true, billingProvider: 'stripe', paymentProvider: 'stripe', modules: ['lite'] });
  await refused('a package with no customer yet: its first invoice links the card', function () { return call(owner, { action: 'portal' }, new SD({ livemode: true })); }, /first Stripe invoice/);
  fixture({ tier: 'standard', paymentProvider: 'quickbooks', amountDue: 1299 });
  v = await call(owner, { action: 'view' }, new SD({ livemode: true }));
  ok(v.rail === 'quickbooks' && !v.canLink, 'a plan ClearSky invoices through QuickBooks keeps its card there', v);
  fixture({ tier: 'standard', paymentProvider: 'manual', qboCustomerId: 'C9', addOns: { modules: ['logic-office'] }, amountDue: 1299 });
  v = await call(owner, { action: 'view' }, new SD({ livemode: true }));
  ok(v.rail === 'stripe' && v.canLink, 'add-ons billed in QuickBooks do not move the plan\'s own card off Stripe', v);
  fixture(null);
  v = await call(owner, { action: 'view' }, new SD({ livemode: true }));
  ok(v.rail === null && !v.canLink && /sets up billing/.test(v.reason), 'no billing record: ClearSky sets it up first', v);
  await refused('...and nothing is linked', function () { return call(owner, { action: 'card' }, new SD({ livemode: true })); }, /sets up billing/);
  fixture(undefined, { status: 'pending' });
  await refused('a workspace waiting for approval is not billed yet', function () { return call(owner, { action: 'card' }, new SD({ livemode: true })); }, /approves/);

  console.log('\nback to Plan & billing on the host the person came from');
  ok(SC.returnUrl('concord.clearskyomega.com') === 'https://concord.clearskyomega.com/workspace#billing' && SC.returnUrl('127.0.0.1:4100') === 'http://127.0.0.1:4100/workspace#billing'
    && SC.returnUrl('evil.example/x') === 'https://silmarillion.clearskyomega.com/workspace#billing' && SC.returnUrl('') === 'https://silmarillion.clearskyomega.com/workspace#billing', 'a host that is not a host is the open front door');
}

/* the cases an adversarial review found: a stale invoice must never become a second payment */
async function reviewed() {
  var now = Date.parse('2026-09-27T15:00:00Z'), s, a, cur, v;
  function setDue(amount, date) { cur = bill(); cur.amountDue = amount; if (date !== undefined) cur.subscriptionDue = date; db.seed(CUR, cur); }

  console.log('\na payment for a figure ClearSky has since changed holds the next one');
  fixture(); s = new SD({ livemode: true });
  a = await call(owner, { action: 'pay' }, s);
  setDue(2598, '2026-10-02');
  s.pay(a.invoiceId);
  var st = await SC.settle(db, ORG, a.invoiceId, s, now, 'stripe');
  ok(st.recorded && st.matches === false && bill().stripeDueHold && bill().stripeDueHold.invoiceId === a.invoiceId && bill().amountDue === 2598, 'the earlier invoice, paid from Stripe\'s email, is recorded, and the new figure is held', bill());
  await refused('...so Pay takes nothing more until ClearSky has looked', function () { return call(owner, { action: 'pay' }, s); }, /reviews the account before the next payment/);
  v = await call(owner, { action: 'view' }, s);
  ok(v.canPay === false && /reviews the account/.test(v.payReason) && s.all('invoices').length === 1, '...the page says why, and no second invoice was made', v.payReason);
  setDue(1299);
  var rest = await call(owner, { action: 'pay' }, s);
  ok(rest.state === 'open' && s.invoices_[rest.invoiceId].total === 129900, 'once ClearSky sets the figure again (what is left), it is paid as before', rest);

  console.log('\nClearSky keeping the figure it set releases the hold too');
  /* ClearSky rolls on to October before September's emailed invoice is paid:
     September is recorded and holds October, and ClearSky saving October's
     figure unchanged is the review that releases it */
  async function heldOctober() {
    fixture(); s = new SD({ livemode: true });
    a = await call(owner, { action: 'pay' }, s);
    setDue(1299, '2026-10-02');
    s.pay(a.invoiceId);
    await SC.settle(db, ORG, a.invoiceId, s, now, 'stripe');
  }
  await heldOctober();
  await refused('September, paid from Stripe\'s email after ClearSky rolled on, holds October', function () { return call(owner, { action: 'pay' }, s); }, /reviews the account/);
  var TB = require('../api/tenant-billing');
  await TB({ method: 'POST', caller: staff, body: { orgId: ORG, tier: 'standard' } });
  ok(!!bill().stripeDueHold, '...a staff write that leaves the amount due alone (the tier) keeps the hold');
  await TB({ method: 'POST', caller: staff, body: { orgId: ORG, amountDue: 1299 } });
  var released = keys(CUR + '/history/').map(function (k) { return db.data.get(k); }).filter(function (h) { return h.changed && h.changed.stripeDueHold === null; })[0];
  ok(bill().stripeDueHold === null && !!released && released.was.stripeDueHold.invoiceId === a.invoiceId, 'ClearSky saving the same figure through /api/tenant-billing releases it, and the history keeps what it released', released);
  var oct = await call(owner, { action: 'pay' }, s);
  ok(oct.state === 'open' && oct.invoiceId !== a.invoiceId && s.invoices_[oct.invoiceId].total === 129900 && s.invoices_[oct.invoiceId].metadata.omegaDueDate === '2026-10-02', '...and October is paid as before', oct);

  /* the admin's own save (Save terms on /admin/account.html, moved there from the console 2026-09-28), run from its source as tadminstanding.js reads it */
  await heldOctober();
  var SRC = fs.readFileSync(path.join(__dirname, '../admin/account.js'), 'utf8'), at = SRC.indexOf('function saveTenantBilling('), end = SRC.indexOf('{', at), depth = 0;
  for (;; end++) { if (SRC[end] === '{') depth++; else if (SRC[end] === '}' && !--depth) break; }
  var form = { 'tb-tier': 'standard', 'tb-amt': '1299', 'tb-due': '2026-10-02', 'tb-paid': String(bill().amountPaid), 'tb-paidat': bill().lastPaidAt, 'tb-jarvis': 'on' }, msg = { textContent: '' };
  var page = { getElementById: function (id) { if (id === 'tb-msg-' + ORG) return msg; var f = id.slice(0, -(ORG.length + 1)); return Object.prototype.hasOwnProperty.call(form, f) ? { value: form[f] } : null; } };
  var saveTenantBilling = new Function('db', 'firebase', 'document', 'currentUser', 'loadTenants', SRC.slice(at, end + 1) + '\nreturn saveTenantBilling;')(
    db, { firestore: { FieldValue: { serverTimestamp: function () { return now; } } } }, page, { email: staff.email }, function () {});
  saveTenantBilling(ORG);
  for (var tick = 0; tick < 200 && !/^(Saved|Failed)/.test(msg.textContent); tick++) await new Promise(function (r) { setImmediate(r); });
  ok(msg.textContent === 'Saved.' && bill().stripeDueHold === null && bill().amountDue === 1299, 'the master console\'s save, the figure unchanged, releases it too', { msg: msg.textContent, hold: bill().stripeDueHold });
  ok((await call(owner, { action: 'pay' }, s)).state === 'open', '...and October is paid');

  fixture(); s = new SD({ livemode: true }); MAILED = [];
  a = await call(owner, { action: 'pay' }, s);
  setDue(2598, '2026-10-02');
  s.pay(a.invoiceId);
  await refused('with no webhook, Pay records the earlier payment first and holds the new figure', function () { return call(owner, { action: 'pay' }, s); }, /reviews the account/);
  ok(!!db.data.get(CUR + '/history/stripe-paid-' + a.invoiceId) && s.all('invoices').length === 1 && MAILED.some(function (m) { return m.template === 'paid'; }), '...recorded once, with its receipt, and nothing new billed', MAILED.map(function (m) { return m.template; }));

  console.log('\na stale invoice is withdrawn wherever the workspace\'s Stripe is touched');
  fixture(); s = new SD({ livemode: true });
  a = await call(owner, { action: 'pay' }, s);
  setDue(0);
  v = await call(owner, { action: 'view' }, s);
  ok(s.invoices_[a.invoiceId].status === 'void' && bill().stripeDue.state === 'void' && v.due === null, 'ClearSky zeroed the figure (a cheque): opening Plan & billing voids the invoice Stripe emailed', { stripe: s.invoices_[a.invoiceId].status, rec: bill().stripeDue });
  fixture(); s = new SD({ livemode: true });
  a = await call(owner, { action: 'pay' }, s);
  setDue(999);
  await call(owner, { action: 'portal' }, s);
  ok(s.invoices_[a.invoiceId].status === 'void' && bill().stripeDue.state === 'void', '...and so does opening the portal, which would list it with a Pay button');

  console.log('\na late event never overwrites a newer invoice');
  fixture(); s = new SD({ livemode: true });
  a = await call(owner, { action: 'pay' }, s);
  setDue(2598);
  s.voidInvoice(a.invoiceId);
  /* the void event reads the record, and while it asks Stripe about the old
     invoice, Pay lands the new one on the record: the event must not write
     the old one back over it */
  var retrieve = s.invoices.retrieve, newer = { invoiceId: 'in_newer', marker: ORG + '/2026-09-02/259800', amountCents: 259800, state: 'open', hostedUrl: 'https://invoice.stripe.com/i/acct_double/in_newer' };
  s.invoices.retrieve = async function (iid) { cur = bill(); cur.stripeDue = newer; db.seed(CUR, cur); return retrieve(iid); };
  await SC.settle(db, ORG, a.invoiceId, s, now, 'stripe');
  s.invoices.retrieve = retrieve;
  ok(bill().stripeDue.invoiceId === 'in_newer' && bill().stripeDue.state === 'open', 'the voided invoice\'s event, racing Pay\'s newer invoice onto the record, leaves the newer one there', bill().stripeDue);
  fixture(); s = new SD({ livemode: true });
  a = await call(owner, { action: 'pay' }, s);
  setDue(2598);
  var b = await call(owner, { action: 'pay' }, s);
  await SC.settle(db, ORG, a.invoiceId, s, now, 'stripe');
  ok(s.invoices_[a.invoiceId].status === 'void' && bill().stripeDue.invoiceId === b.invoiceId && bill().stripeDue.state === 'open', '...and arriving after, the same', bill().stripeDue);

  console.log('\nthe same figure and date billed again after a payment');
  fixture(); s = new SD({ livemode: true });
  a = await call(owner, { action: 'pay' }, s); s.pay(a.invoiceId);
  await SC.settle(db, ORG, a.invoiceId, s, now, 'stripe');
  setDue(1299);
  var again = await call(owner, { action: 'pay' }, s);
  ok(again.state === 'open' && again.invoiceId !== a.invoiceId && s.all('invoices').length === 2 && bill().stripeDueSeq === 1, 'is a new invoice, never "already paid" with money still owed', { again: again, seq: bill().stripeDueSeq });

  console.log('\nPay finding its invoice already paid');
  fixture(); s = new SD({ livemode: true }); MAILED = [];
  a = await call(owner, { action: 'pay' }, s); s.pay(a.invoiceId);
  var p4 = await call(owner, { action: 'pay' }, s);
  ok(p4.state === 'paid' && p4.recorded && bill().amountDue === 0 && MAILED.some(function (m) { return m.template === 'paid'; }) && MAILED.some(function (m) { return m.template === 'paidAlert'; }), 'records it and sends the receipt and ClearSky\'s alert', { p4: p4, mailed: MAILED.map(function (m) { return m.template; }) });

  console.log('\na balance on the Stripe account');
  fixture(); s = new SD({ livemode: true });
  await call(owner, { action: 'card' }, s);
  var cid = bill().stripeCustomerId;
  s.customers_[cid].balance = 5000;
  await refused('a balance owed would be added to the card\'s charge: ClearSky settles it first', function () { return call(owner, { action: 'pay' }, s); }, /balance owed of \$50/);
  s.customers_[cid].balance = -129900;
  await refused('...and a credit would pay it without the card', function () { return call(owner, { action: 'pay' }, s); }, /credit of \$1,299/);
  ok(s.all('invoices').length === 0, '...nothing was invoiced');
  s.customers_[cid].balance = 0;
  var fin = s.invoices.finalizeInvoice;
  s.invoices.finalizeInvoice = async function (iid, p, o) { var r = await fin(iid, p, o); s.invoices_[iid].amount_due = 139900; r.amount_due = 139900; return r; };
  await refused('a balance that lands between the check and the invoice withdraws it', function () { return call(owner, { action: 'pay' }, s); }, /Stripe would charge \$1,399/);
  ok(s.all('invoices').length === 1 && s.all('invoices')[0].status === 'void', '...voided, never left to charge the wrong figure');
  s.invoices.finalizeInvoice = fin;

  console.log('\nStripe\'s own 4xx on a webhook invoice');
  var Hook = require('../api/stripe-webhook');
  fixture(); s = new SD({ livemode: true });
  await call(owner, { action: 'card' }, s);
  var gone = await Hook.dueEvent(ORG, 'in_000999', s, { mail: mailer });
  ok(/gone from Stripe/.test(gone.ignored || ''), 'an invoice deleted in the dashboard is acknowledged, not retried for days', gone);
  s.invoices.retrieve = async function () { var e = new Error('Invalid invoice'); e.type = 'StripeInvalidRequestError'; e.statusCode = 400; throw e; };
  var bad = await Hook.dueEvent(ORG, 'in_000998', s, { mail: mailer });
  ok(/Invalid invoice/.test(bad.ignored || ''), '...and so is any 4xx Stripe itself answers', bad);
}

(async function () {
  await door();
  await card();
  await paying();
  await webhook();
  await guards();
  await reviewed();
  console.log('\nstripe customer: ' + count + ' passed, 0 failed');
})().catch(function (e) { console.error(e); process.exit(1); });
