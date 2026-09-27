/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * The workspace as a Stripe customer: its card on file, and paying what
 * ClearSky set as due, for a plan billed OUTSIDE the package engine (Tommy,
 * 2026-09-27, on Plan & billing's Payment method: "This payment method
 * should be linked to the stripe payment system we built with quickbooks.
 * Stripe collects and takes the payment and sends it to quickbooks which is
 * our account").
 *
 * Stripe takes the money. ClearSky's books are QuickBooks, filled from
 * Stripe by the Connect to Stripe bookkeeping app
 * (docs/PAYMENTS-BROWSER-SETUP.md Part 3). Nothing here writes a payment
 * into QuickBooks: that would book it twice.
 *
 *   link     one Stripe customer per workspace: the legacy tier's own
 *            billing/current.stripeCustomerId (what stripe-create.js made
 *            for ClearSky, and what the webhook's tier path finds a
 *            workspace by), made here by the workspace's owner or an
 *            administrator when there is none. Marked metadata.orgId and
 *            omegaOrg and found again by that mark and the billing email, so
 *            a retry never makes a second one; a lock on the record keeps
 *            two admins from making two.
 *   card     the card on file, READ BACK from Stripe every time (brand, last
 *            four, expiry). Never stored here.
 *   session  Stripe's own pages: the customer portal, or its "add a payment
 *            method" flow, which makes the new card the customer's default
 *            for invoices. The card is typed on Stripe's page, never ours.
 *   pay      the amount ClearSky set as due (billing/current.amountDue,
 *            staff-written, never priced here) as ONE send_invoice Stripe
 *            invoice, paid on Stripe's hosted invoice page, which offers the
 *            card on file. One invoice per due date and amount (its marker):
 *            a retry, a second tab or a second admin finds the same one, a
 *            paid one is never billed again, and an open one for an amount
 *            that has since changed is voided so nobody pays a stale figure.
 *   settle   reads that invoice back from Stripe (the webhook, "I've paid");
 *            paid → amountDue 0 (only while the due is still the one it
 *            billed), lastPaidAt, amountPaid, one history row, the tenant's
 *            receipt and ClearSky's alert. Once per invoice.
 *
 * GUARDS. The one database is production's, so a preview deployment on a
 * Stripe TEST key must never bind a real tenant: a test key writes only for
 * a workspace marked packagingSandbox (the engine's own rule), a binding made
 * in the other mode is refused and never overwritten, and a LIVE key serves
 * any active workspace. A PACKAGED workspace is the engine's: its customer is
 * made with its first invoice, so this reads its card and opens its portal
 * and nothing else. A plan ClearSky invoices through QuickBooks
 * (paymentProvider 'quickbooks') keeps its card on QuickBooks' page.
 */
'use strict';
var crypto = require('crypto');
var DAY = 86400000, MIN_CENTS = 50, MAX_CENTS = 99999999, STAFF_ORG = 'clearsky-usa.com', HOME = 'silmarillion.clearskyomega.com';
var PLAN = { trial: 'Trial', standard: 'Standard', pro: 'Pro', deluxe: 'Deluxe', enterprise: 'Enterprise', partner: 'Partner', internal: 'Internal' };
var BRAND = { visa: 'Visa', mastercard: 'Mastercard', amex: 'American Express', 'american express': 'American Express', discover: 'Discover', diners: 'Diners Club', 'diners club': 'Diners Club', jcb: 'JCB', unionpay: 'UnionPay' };
var QUICKBOOKS = 'This workspace pays through QuickBooks: the card is saved on QuickBooks’ own payment page.';

function fail(message, status) { var e = new Error(message); e.status = status || 409; throw e; }
function key(value) { return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 48); }
/* the deployment's Stripe mode, read off its key: 'live', 'test' or null */
function mode() { var k = String(process.env.STRIPE_SECRET_KEY || ''); return /^(sk|rk)_live_/.test(k) ? 'live' : /^(sk|rk)_test_/.test(k) ? 'test' : null; }
function client() { return mode() ? require('stripe')(process.env.STRIPE_SECRET_KEY) : null; }
function money(cents) { return '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 }); }
function ymd(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  var t = typeof v === 'number' ? v : v && typeof v.toMillis === 'function' ? v.toMillis() : v instanceof Date ? v.getTime() : v && typeof v._seconds === 'number' ? v._seconds * 1000 : Date.parse(v);
  return isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null;
}
function niceDay(d) { var t = Date.parse(d + 'T12:00:00Z'); return isFinite(t) ? new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : d; }
function planLabel(b) { var t = String((b && b.tier) || '').toLowerCase(); return PLAN[t] ? 'OMEGA ' + PLAN[t] + ' plan' : 'OMEGA plan'; }
function payLink(url) { return require('./stripe-billing').payLink(url); }

async function context(db, orgId) {
  var root = db.collection('omega_orgs').doc(orgId), current = root.collection('billing').doc('current');
  var got = await Promise.all([root.get(), current.get(), root.collection('billing').doc('profile').get()]);
  return { orgId: orgId, root: root, current: current, org: got[0].exists ? got[0].data() || {} : null, billingExists: got[1].exists,
    billing: got[1].exists ? got[1].data() || {} : {}, profile: got[2].exists ? got[2].data() : null };
}

/* Which rail the workspace's card belongs to. A package asks the engine's one
   rule (billing-driver); a plan billed outside it is Stripe's unless ClearSky
   invoices it through QuickBooks, and a plan that already has a Stripe
   customer is Stripe's whatever else its record says. */
function railOf(b) {
  b = b || {};
  if (b.packaged === true) return require('./billing-driver').providerOf(b);
  return (b.paymentProvider === 'quickbooks' || b.billingProvider === 'quickbooks') && !b.stripeCustomerId ? 'quickbooks' : 'stripe';
}
/* the binding on the record, in this deployment's mode: null, or why not */
function boundRefusal(b) {
  var m = mode();
  if (!m) return 'Stripe is not set up on this deployment yet.';
  if (typeof b.stripeLivemode === 'boolean' && b.stripeLivemode !== (m === 'live')) return 'This workspace’s card is on Stripe’s ' + (b.stripeLivemode ? 'live' : 'test') + ' account; this deployment uses Stripe’s ' + m + ' mode.';
  return null;
}
/* why this workspace cannot link a card or pay its plan through Stripe here, or null */
function refusal(c) {
  var b = c.billing;
  if (!c.org || !c.billingExists) return 'ClearSky sets up billing for this workspace first.';
  if (b.packaged === true) return 'This workspace is billed by its package: its invoices, with their payment pages, are under What you owe.';
  if (railOf(b) !== 'stripe') return QUICKBOOKS;
  var st = c.org.status || 'active';
  if (st === 'pending') return 'Billing opens once ClearSky approves the workspace.';
  if (st !== 'active') return 'This workspace is ' + st + '; ask ClearSky.';
  var m = mode();
  if (!m) return 'Stripe is not set up on this deployment yet.';
  if (b.stripeCustomerId) { var bm = boundRefusal(b); if (bm) return bm; }
  if (m === 'test' && c.org.packagingSandbox !== true) return 'This deployment uses Stripe’s test mode; only a sandbox workspace links a card or pays here.';
  return null;
}

/* ── the amount due: ClearSky's number, read, never made ── */
/* The marker is the due's identity: the date, the amount, and how many dues
   Stripe has already settled (stripeDueSeq, counted by settle), so the same
   figure billed again after a payment is a new invoice, never "already paid". */
function dueOf(orgId, b) {
  var n = Number(b && b.amountDue);
  if (!(n > 0) || !isFinite(n)) return null;
  var cents = Math.round(n * 100), date = ymd(b.subscriptionDue), seq = Number(b.stripeDueSeq) || 0;
  return { cents: cents, date: date, display: money(cents), marker: orgId + '/' + (date || 'now') + '/' + cents + (seq ? '#' + seq : '') };
}
function centsRefusal(cents) {
  if (cents < MIN_CENTS) return 'The amount due is below Stripe’s minimum card payment; ClearSky settles it.';
  if (cents > MAX_CENTS) return 'The amount due is more than one card payment can take; ClearSky arranges it.';
  return null;
}
/* a payment arrived for a figure ClearSky has since changed: nothing more is
   taken from here until ClearSky has looked and set the figure again */
function holdRefusal(orgId, b) {
  var h = b && b.stripeDueHold, owed = dueOf(orgId, b);
  if (!h || !owed || h.marker !== owed.marker) return null;
  return 'A payment of ' + money(Number(h.cents) || 0) + ' reached Stripe for an earlier amount due; ClearSky reviews the account before the next payment here.';
}
/* what the page shows: the figure, and the Stripe invoice already open for it */
function dueView(c) {
  var d = dueOf(c.orgId, c.billing); if (!d) return null;
  var sd = c.billing.stripeDue, open = sd && sd.marker === d.marker && sd.state === 'open' && sd.hostedUrl ? { invoiceId: sd.invoiceId, url: sd.hostedUrl, number: sd.number || null } : null;
  return { cents: d.cents, display: d.display, date: d.date, open: open };
}
function daysUntil(date, now) { var t = date ? Date.parse(date + 'T23:59:59Z') : NaN; return isFinite(t) && t > now ? Math.max(1, Math.min(30, Math.ceil((t - now) / DAY))) : 1; }
function memo(c, due) { return ('ClearSky OMEGA · ' + ((c.org && c.org.name) || c.orgId) + ' · the amount due' + (due.date ? ' ' + niceDay(due.date) : '') + ' on your plan').slice(0, 500); }
function line(c, due) { return (planLabel(c.billing) + (due.date ? ' · due ' + niceDay(due.date) : '')).slice(0, 500); }

/* ── the customer ── */
/* who Stripe writes to: the billing contact, else the owner or administrator
   asking (never a ClearSky address for a tenant), else the signup address */
function contact(c, caller) {
  var p = c.profile && typeof c.profile.email === 'string' && c.profile.email ? c.profile : null;
  var email = String((p && p.email) || (caller && !caller.staff && caller.email) || (c.org && c.org.signup && c.org.signup.email) || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('Save the workspace’s billing contact first: Stripe sends each receipt there.');
  return { email: email, name: String((p && p.legalName) || (c.org && c.org.name) || c.orgId).slice(0, 200) };
}
/* the workspace's own customer, checked: this mode, not deleted, not another workspace's */
async function bound(c, stripe) {
  var b = c.billing, why = boundRefusal(b), cus;
  if (why) fail(why);
  try { cus = await stripe.customers.retrieve(b.stripeCustomerId, { expand: ['invoice_settings.default_payment_method'] }); }
  catch (e) { if (e && (e.statusCode === 404 || e.status === 404 || e.code === 'resource_missing')) fail('Stripe has no customer ' + b.stripeCustomerId + ' in ' + mode() + ' mode; ClearSky reviews the workspace’s billing.'); throw e; }
  if (!cus || cus.deleted) fail('The workspace’s Stripe customer was deleted in Stripe; ClearSky links a new one.');
  if (cus.livemode !== (mode() === 'live')) fail('The workspace’s Stripe customer is in Stripe’s ' + (cus.livemode ? 'live' : 'test') + ' mode; this deployment uses ' + mode() + ' mode.');
  var md = cus.metadata || {}, mark = md.omegaOrg || md.orgId;
  if (mark && mark !== c.orgId) fail('That Stripe customer is marked for another workspace; ClearSky reviews it.');
  return cus;
}
async function link(db, c, caller, stripe, now) {
  if (c.billing.stripeCustomerId) return bound(c, stripe);
  var why = refusal(c); if (why) fail(why);
  var who = contact(c, caller), lock = key(c.orgId + ':' + now + ':' + Math.random()), taken = null, by = (caller && caller.email) || null;
  await db.runTransaction(async function (tx) {
    var s = await tx.get(c.current), d = s.exists ? s.data() : null;
    if (!d) fail('ClearSky sets up billing for this workspace first.');
    if (d.stripeCustomerId) { taken = d; return; }
    if (d.stripeLinkLock && d.stripeLinkLock.until > now) fail('Stripe is being linked for this workspace right now; try again in a moment.');
    tx.update(c.current, { stripeLinkLock: { id: lock, until: now + 60000, by: by } });
  });
  if (taken) { c.billing = taken; return bound(c, stripe); }
  try {
    var m = mode(), rows = ((await stripe.customers.list({ email: who.email, limit: 100 })) || {}).data || [];
    var mine = rows.filter(function (x) { var md = x.metadata || {}; return !x.deleted && x.livemode === (m === 'live') && (md.omegaOrg === c.orgId || md.orgId === c.orgId); });
    if (mine.length > 1) fail('More than one Stripe customer is marked for ' + c.orgId + '; ClearSky reviews it.');
    var cus = mine[0] || await stripe.customers.create({ name: who.name, email: who.email, metadata: { orgId: c.orgId, omegaOrg: c.orgId, omegaBilling: 'plan' } },
      { idempotencyKey: key('omega-plan-customer:' + m + ':' + c.orgId + ':' + who.email) });
    var cmd = (cus && cus.metadata) || {};
    if (!cus || !cus.id || cus.livemode !== (m === 'live') || (cmd.omegaOrg !== c.orgId && cmd.orgId !== c.orgId)) fail('Stripe did not confirm the customer; try again.');
    await db.runTransaction(async function (tx) {
      var s = await tx.get(c.current), d = s.exists ? s.data() : {};
      if (!d.stripeLinkLock || d.stripeLinkLock.id !== lock) fail('Linking Stripe changed underneath; try again.');
      var patch = { stripeCustomerId: String(cus.id), stripeLivemode: m === 'live', stripeLinkedAt: now, stripeLinkedBy: by, stripeLinkLock: null, updatedAt: now, updatedBy: by };
      /* the plan now pays ClearSky by card through Stripe; an arrangement staff named (invoice, stripe) stays as it is */
      if (!d.paymentProvider || d.paymentProvider === 'manual') patch.paymentProvider = 'stripe';
      var event = { at: now, by: by, action: 'stripe-linked', changed: { stripeCustomerId: patch.stripeCustomerId, stripeLivemode: patch.stripeLivemode, paymentProvider: patch.paymentProvider || d.paymentProvider || null },
        was: { stripeCustomerId: null, paymentProvider: d.paymentProvider || null } };
      tx.update(c.current, patch);
      tx.set(c.current.collection('history').doc('stripe-linked-' + cus.id), event);
      tx.set(c.root.collection('admin_audit').doc('stripe-linked-' + cus.id), event);
      c.billing = Object.assign({}, d, patch);
    });
    return cus;
  } catch (e) {
    try { await db.runTransaction(async function (tx) { var s = await tx.get(c.current), d = s.exists ? s.data() : {}; if (d.stripeLinkLock && d.stripeLinkLock.id === lock) tx.update(c.current, { stripeLinkLock: null }); }); } catch (x) {}
    throw e;
  }
}

/* ── the card on file, read back ── */
function describe(pm) {
  if (pm.type === 'card' && pm.card) {
    var brand = String(pm.card.brand || 'card').toLowerCase(), name = BRAND[brand] || (brand.charAt(0).toUpperCase() + brand.slice(1));
    return { type: 'card', brand: brand, last4: pm.card.last4 || null, expMonth: pm.card.exp_month || null, expYear: pm.card.exp_year || null,
      label: name + (pm.card.last4 ? ' ending ' + pm.card.last4 : ''), expires: pm.card.exp_month && pm.card.exp_year ? ('0' + pm.card.exp_month).slice(-2) + '/' + pm.card.exp_year : null };
  }
  if (pm.type === 'us_bank_account' && pm.us_bank_account) return { type: 'bank', last4: pm.us_bank_account.last4 || null, label: (pm.us_bank_account.bank_name || 'Bank account') + (pm.us_bank_account.last4 ? ' ending ' + pm.us_bank_account.last4 : ''), expires: null };
  if (pm.type === 'link') return { type: 'link', label: 'Stripe Link', expires: null };
  return { type: String(pm.type || 'other'), label: 'Saved with Stripe', expires: null };
}
async function cardOf(stripe, cus) {
  var pm = cus.invoice_settings && cus.invoice_settings.default_payment_method;
  if (typeof pm === 'string' && pm) pm = await stripe.paymentMethods.retrieve(pm);
  if (pm && pm.type) return describe(pm);
  /* a card from Stripe's older Sources API, as the first tier customers have */
  if (typeof cus.default_source === 'string' && cus.default_source && stripe.customers.retrieveSource) {
    try {
      var s = await stripe.customers.retrieveSource(cus.id, cus.default_source);
      if (s && s.object === 'card') return describe({ type: 'card', card: { brand: s.brand, last4: s.last4, exp_month: s.exp_month, exp_year: s.exp_year } });
    } catch (e) {}
  }
  return null;
}

/* ── Stripe's own pages ── */
/* back to Plan & billing on the host the person came from */
function returnUrl(host) {
  var h = String(host || '').toLowerCase(), local = /^(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(h);
  if (!local && !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:\d{1,5})?$/.test(h)) h = HOME;
  return (local ? 'http://' : 'https://') + h + '/workspace#billing';
}
async function session(stripe, customerId, back, card) {
  var body = { customer: customerId, return_url: back }, s;
  /* the "add a payment method" flow: the new card becomes the customer's default for invoices */
  if (card) body.flow_data = { type: 'payment_method_update', after_completion: { type: 'redirect', redirect: { return_url: back } } };
  try { s = await stripe.billingPortal.sessions.create(body); }
  catch (e) {
    if (e && (e.type === 'StripeInvalidRequestError' || e.statusCode === 400)) {
      console.warn('[stripe-customer] portal refused:', e.message);
      fail('Stripe’s customer portal is not switched on for card changes yet. ClearSky turns it on in Stripe (Settings › Billing › Customer portal › Payment methods).');
    }
    throw e;
  }
  if (!s || typeof s.url !== 'string' || !/^https:\/\//.test(s.url)) fail('Stripe did not return its page; try again.');
  return s.url;
}
async function portal(db, c, caller, stripe, now, host, card) {
  var cus;
  if (c.billing.stripeCustomerId) {
    if (railOf(c.billing) !== 'stripe') fail(QUICKBOOKS);
    cus = await bound(c, stripe);
    /* the portal lists open invoices with a Pay button: never one for a figure ClearSky has since changed */
    await closeStale(db, c, stripe, cus.id, now);
  } else if (card) cus = await link(db, c, caller, stripe, now);
  else fail(c.billing.packaged === true ? 'Your first Stripe invoice links the card: pay it under What you owe, and the portal opens after.' : 'Add a card first: the Stripe portal opens once the workspace has one.');
  return { url: await session(stripe, cus.id, returnUrl(host), card) };
}

/* ── stale invoices ── */
/* Our invoices still open for a figure ClearSky has since changed (the master
   console writes the record directly, so nothing here hears the change) are
   voided in Stripe the next time the workspace's Stripe is touched: nobody
   pays a stale figure from the page, the portal or Stripe's own email. One
   that was paid meanwhile cannot be voided; settle records it and holds the
   next payment for ClearSky. */
async function voidStale(stripe, orgId, rows, marker) {
  var gone = [];
  for (var i = 0; i < rows.length; i++) {
    var md = rows[i].metadata || {};
    if (rows[i].status !== 'open' || !md.omegaDue || md.omegaOrg !== orgId || md.omegaDue === marker) continue;
    try { await stripe.invoices.voidInvoice(rows[i].id, {}, { idempotencyKey: key('omega-due-void:' + rows[i].id) }); gone.push(String(rows[i].id)); } catch (e) {}
  }
  return gone;
}
/* the record's open invoice, when its figure has since changed: voided, and the record stops offering it */
async function closeStale(db, c, stripe, customerId, now) {
  var sd = c.billing.stripeDue, owed = dueOf(c.orgId, c.billing);
  if (!sd || sd.state !== 'open' || (owed && sd.marker === owed.marker)) return;
  var rows = ((await stripe.invoices.list({ customer: customerId, limit: 100 })) || {}).data || [];
  var gone = await voidStale(stripe, c.orgId, rows, owed ? owed.marker : null), mine = rows.filter(function (r) { return String(r.id) === String(sd.invoiceId); })[0];
  var state = gone.indexOf(String(sd.invoiceId)) >= 0 ? 'void' : mine && (mine.status === 'void' || mine.status === 'uncollectible') ? mine.status : null;
  if (!state) return;
  await db.runTransaction(async function (tx) {
    var s = await tx.get(c.current), d = s.exists ? s.data() : {};
    if (d.stripeDue && d.stripeDue.invoiceId === sd.invoiceId && d.stripeDue.state === 'open') tx.update(c.current, { stripeDue: Object.assign({}, d.stripeDue, { state: state, closedAt: now }) });
  });
  c.billing.stripeDue = Object.assign({}, sd, { state: state, closedAt: now });
}

/* ── paying the amount due ── */
async function pay(db, c, caller, stripe, now, mailer) {
  var why = refusal(c); if (why) fail(why);
  var b = c.billing, by = (caller && caller.email) || null;
  if (b.paymentLink) fail('Pay with the payment link ClearSky set for this workspace, under What you owe.');
  var due = dueOf(c.orgId, b); if (!due) fail('Nothing is owed right now.');
  var cr = centsRefusal(due.cents) || holdRefusal(c.orgId, b); if (cr) fail(cr);
  var cus = await link(db, c, caller, stripe, now), m = mode();
  /* Stripe sends an invoice only to a customer with an address: one made by
     hand in the dashboard may have none, so it gets the billing contact's */
  if (!cus.email) { var who = contact(c, caller); cus = await stripe.customers.update(cus.id, { email: who.email }, { idempotencyKey: key('omega-plan-email:' + cus.id + ':' + who.email) }); }
  /* a balance on the Stripe customer is applied to the next invoice (a debt
     added, a credit taken off), so the card would not be charged the figure
     shown: ClearSky settles it first */
  if (typeof cus.balance === 'number' && cus.balance !== 0) fail('The workspace’s Stripe account carries ' + (cus.balance > 0 ? 'a balance owed' : 'a credit') + ' of ' + money(Math.abs(cus.balance)) + '; ClearSky settles it before a card payment here.');
  var rows = ((await stripe.invoices.list({ customer: cus.id, limit: 100 })) || {}).data || [];
  /* an invoice ClearSky already has open for this customer (the dashboard, a tier subscription) is the way to pay: never a second one beside it */
  var foreign = rows.filter(function (i) { return i.status === 'open' && !(i.metadata || {}).omegaDue; });
  if (foreign.length) fail('Stripe already has an open invoice for this workspace (' + (foreign[0].number || foreign[0].id) + '): pay that one, under What you owe.');
  var ours = rows.filter(function (i) { var md = i.metadata || {}; return md.omegaDue && md.omegaOrg === c.orgId; });
  /* a payment Stripe took for an earlier figure that nothing has recorded yet
     (no webhook, nobody pressed I've paid): recorded before anything new is
     billed, which holds this one for ClearSky */
  var recorded = false;
  for (var j = 0; j < ours.length; j++) {
    if (ours[j].status !== 'paid' || ours[j].metadata.omegaDue === due.marker) continue;
    if ((await c.current.collection('history').doc('stripe-paid-' + ours[j].id).get()).exists) continue;
    if ((await settle(db, c.orgId, String(ours[j].id), stripe, now, by)).recorded) recorded = true;
  }
  if (recorded) {
    await deliver(db, c.orgId, now, mailer);
    var fresh = (await context(db, c.orgId)).billing, owedNow = dueOf(c.orgId, fresh), held = holdRefusal(c.orgId, fresh);
    if (held || !owedNow) fail(held || 'Nothing is owed right now.');
    if (owedNow.marker !== due.marker) fail('The amount due changed while Stripe was checked; open Plan & billing again.');
  }
  var same = ours.filter(function (i) { return i.metadata.omegaDue === due.marker && i.status !== 'void'; });
  if (same.length > 1) fail('More than one Stripe invoice is open for this amount; ClearSky reviews it.');
  var inv = same[0] || null, created = false;
  /* paid already (the webhook has not run): recorded now, with its receipt */
  async function paidNow(id) {
    var r = await settle(db, c.orgId, String(id), stripe, now, by);
    if (r.recorded) await deliver(db, c.orgId, now, mailer);
    return Object.assign(r, { display: due.display });
  }
  if (inv && inv.status === 'paid') return paidNow(inv.id);
  if (inv && inv.status === 'uncollectible') fail('ClearSky marked this amount uncollectible in Stripe; ask ClearSky.');
  /* an invoice still open for an amount or date that has since changed: voided, so nobody pays a stale figure */
  await voidStale(stripe, c.orgId, ours, due.marker);
  if (!inv) {
    /* a voided one for the same marker leaves its key behind: the next is a fresh request, never its replay */
    var tries = ours.filter(function (x) { return x.metadata.omegaDue === due.marker; }).length;
    inv = await stripe.invoices.create({ customer: cus.id, collection_method: 'send_invoice', days_until_due: daysUntil(due.date, now), currency: 'usd', auto_advance: false,
      pending_invoice_items_behavior: 'exclude', description: memo(c, due),
      metadata: { omegaDue: due.marker, omegaOrg: c.orgId, omegaDueCents: String(due.cents), omegaDueDate: due.date || '' } },
      { idempotencyKey: key('omega-due:' + m + ':' + due.marker + ':' + tries) });
    created = true;
  }
  if (inv.status === 'draft') {
    var lines = ((await stripe.invoices.listLineItems(inv.id, { limit: 10 })) || {}).data || [];
    if (!lines.length) await stripe.invoiceItems.create({ customer: cus.id, invoice: inv.id, amount: due.cents, currency: 'usd', description: line(c, due), metadata: { omegaDue: due.marker } }, { idempotencyKey: key('omega-due-line:' + inv.id) });
    inv = await stripe.invoices.finalizeInvoice(inv.id, { auto_advance: false }, { idempotencyKey: key('omega-due-finalize:' + inv.id) });
  }
  if (!inv || String(inv.customer) !== String(cus.id) || inv.livemode !== (m === 'live') || String(inv.currency || '').toLowerCase() !== 'usd' || (inv.metadata || {}).omegaDue !== due.marker || inv.total !== due.cents) {
    fail('The Stripe invoice does not match the amount due; ClearSky reviews it.');
  }
  /* what the card is charged is amount_due: a balance applied at finalizing
     makes it something else, so an open one is withdrawn and ClearSky looks */
  if (inv.amount_due !== due.cents) {
    if (inv.status === 'open') { try { await stripe.invoices.voidInvoice(inv.id, {}, { idempotencyKey: key('omega-due-void:' + inv.id) }); } catch (e) {} }
    fail('Stripe would charge ' + money(Number(inv.amount_due) || 0) + ' for this ' + due.display + ' (a balance on the Stripe account); ClearSky reviews it.');
  }
  if (inv.status === 'paid') return paidNow(inv.id);
  /* Stripe emails the invoice once, when it is made here: the accountant's copy */
  if (created) { try { await stripe.invoices.sendInvoice(inv.id, {}, { idempotencyKey: key('omega-due-send:' + inv.id) }); } catch (e) {} }
  var url = payLink(inv.hosted_invoice_url);
  var rec = { invoiceId: String(inv.id), marker: due.marker, amountCents: due.cents, dueDate: due.date, number: inv.number || null, hostedUrl: url, state: 'open', issuedAt: now, issuedBy: (caller && caller.email) || null };
  await db.runTransaction(async function (tx) {
    var s = await tx.get(c.current), d = s.exists ? s.data() : {}, still = dueOf(c.orgId, d);
    if (!still || still.marker !== due.marker) fail('The amount due changed while the invoice was made; open Plan & billing again.');
    /* the same invoice asked for again keeps who made it and when */
    if (d.stripeDue && d.stripeDue.invoiceId === rec.invoiceId) { rec.issuedAt = d.stripeDue.issuedAt || rec.issuedAt; rec.issuedBy = d.stripeDue.issuedBy || rec.issuedBy; }
    tx.update(c.current, { stripeDue: rec });
  });
  return { state: 'open', url: url, emailed: !url, invoiceId: rec.invoiceId, number: rec.number, display: due.display, amountCents: due.cents };
}

/* ── reading it back ── */
async function settle(db, orgId, invoiceId, stripe, now, by) {
  var c = await context(db, orgId), b = c.billing;
  if (!c.billingExists || !b.stripeCustomerId) fail('This workspace has no Stripe customer', 404);
  if (!/^in_[A-Za-z0-9_]+$/.test(String(invoiceId || ''))) fail('Not a Stripe invoice', 400);
  var inv;
  try { inv = await stripe.invoices.retrieve(invoiceId); }
  catch (e) { if (e && (e.statusCode === 404 || e.status === 404 || e.code === 'resource_missing')) fail('That invoice is gone from Stripe', 404); throw e; }
  var md = (inv && inv.metadata) || {};
  if (!inv || inv.id !== invoiceId || !md.omegaDue || md.omegaOrg !== orgId) fail('That invoice is not this workspace’s amount due', 404);
  if (String(inv.customer) !== String(b.stripeCustomerId)) fail('The invoice is on another Stripe customer; ClearSky reviews it.');
  if (inv.livemode !== (mode() === 'live')) fail('The invoice is in Stripe’s other mode.');
  if (!(inv.status === 'paid' && inv.amount_paid > 0)) {
    /* voided or written off in Stripe: the page stops offering its link. Read
       again inside the write: pay() may have moved the record on to a newer
       invoice since this began, and that one must not be overwritten */
    if (inv.status === 'void' || inv.status === 'uncollectible') {
      await db.runTransaction(async function (tx) {
        var s = await tx.get(c.current), d = s.exists ? s.data() : {};
        if (d.stripeDue && d.stripeDue.invoiceId === inv.id && d.stripeDue.state !== inv.status) tx.update(c.current, { stripeDue: Object.assign({}, d.stripeDue, { state: inv.status, closedAt: now }) });
      });
    }
    return { state: inv.status, invoiceId: inv.id, url: inv.status === 'open' ? payLink(inv.hosted_invoice_url) : null, recorded: false };
  }
  var at = inv.status_transitions && inv.status_transitions.paid_at ? inv.status_transitions.paid_at * 1000 : now, cents = inv.amount_paid, out = { state: 'paid', invoiceId: inv.id, recorded: false };
  await db.runTransaction(async function (tx) {
    var hist = c.current.collection('history').doc('stripe-paid-' + inv.id), s = await tx.get(c.current), h = await tx.get(hist);
    if (h.exists) return;
    var d = s.exists ? s.data() : {}, owed = dueOf(orgId, d), matches = !!owed && owed.marker === md.omegaDue, disp = money(cents), name = (c.org && c.org.name) || orgId;
    var changed = { lastPaidAt: new Date(at).toISOString(), amountPaid: Math.round((Number(d.amountPaid) || 0) * 100 + cents) / 100, paymentFailedAt: null };
    /* the figure is zeroed only while it is still the one this invoice billed,
       and the next due, even the same figure and date, is then a new invoice
       (stripeDueSeq). A payment for a figure that has since changed is
       ClearSky's to look at: nothing more is taken from here until ClearSky
       has set the figure again (stripeDueHold) */
    if (matches) changed.amountDue = 0;
    var patch = Object.assign({}, changed, { updatedAt: now, updatedBy: by || 'stripe' });
    if (matches) { patch.stripeDueSeq = (Number(d.stripeDueSeq) || 0) + 1; patch.stripeDueHold = null; }
    else if (owed) patch.stripeDueHold = { invoiceId: String(inv.id), marker: owed.marker, cents: cents, at: now };
    if (d.stripeDue && d.stripeDue.invoiceId === inv.id) patch.stripeDue = Object.assign({}, d.stripeDue, { state: 'paid', paidAt: at, paidCents: cents });
    tx.update(c.current, patch);
    tx.set(hist, { at: now, by: by || 'stripe', action: 'stripe-payment', invoice: inv.id, amountCents: cents, changed: changed,
      was: { lastPaidAt: d.lastPaidAt == null ? null : d.lastPaidAt, amountPaid: d.amountPaid == null ? null : d.amountPaid, amountDue: d.amountDue == null ? null : d.amountDue } });
    /* the tenant's receipt and ClearSky's alert, sent once by the runner's outbox (deliver below) */
    tx.set(c.root.collection('notifications').doc('stripe-paid-' + inv.id), { kind: 'billing', read: false, createdAt: now, packageMail: 'paid', mailState: 'pending', first: false,
      email: inv.customer_email || null, text: 'Payment received: ' + disp + ' by card through Stripe, for your ' + planLabel(d) + '. Thank you.', amountDisplay: disp, invoiceId: inv.id, payWith: 'Stripe' });
    tx.set(db.collection('omega_orgs').doc(STAFF_ORG).collection('notifications').doc('billing-paid-' + orgId + '-' + inv.id), { kind: 'payment', read: false, createdAt: now, orgId: orgId, staffMail: 'paidAlert', mailState: 'pending', first: false,
      text: 'Payment received: ' + name + ' ' + disp + ' (the plan’s amount due, by card through Stripe)', amountDisplay: disp, invoiceId: inv.id, payWith: 'Stripe' });
    if (!matches) {
      tx.set(db.collection('omega_orgs').doc(STAFF_ORG).collection('notifications').doc('billing-review-' + orgId + '-' + inv.id), { kind: 'billing-review', read: false, createdAt: now, orgId: orgId, staffMail: 'billingAlert', mailState: 'pending', invoiceId: inv.id,
        text: 'Stripe payment ' + inv.id + ' (' + disp + ') from ' + name + ' was for an amount due that has since changed on the workspace’s record, so the amount due was left as it is. Review it in the master console.' });
    }
    out.recorded = true; out.matches = matches;
  });
  return out;
}
/* the receipt and the alert go out now, not at the next tick */
async function deliver(db, orgId, now, mailer) {
  try {
    var Runner = require('./package-billing-runner'), m = mailer || require('./mail');
    await Runner.deliver(db, orgId, now, m); await Runner.staffDeliver(db, now, m);
  } catch (e) { console.warn('[stripe-customer] mail:', e && e.message); }
}
/* "I've paid": one look per workspace every eight seconds */
async function check(db, c, caller, stripe, now, mailer) {
  var why = refusal(c); if (why) fail(why);
  var sd = c.billing.stripeDue;
  if (!sd || !sd.invoiceId) return { state: 'none', due: dueView(c) };
  if (c.billing.stripeDueCheckedAt && now - c.billing.stripeDueCheckedAt < 8000) return { state: sd.state, throttled: true, due: dueView(c) };
  await c.current.update({ stripeDueCheckedAt: now });
  var r = await settle(db, c.orgId, sd.invoiceId, stripe, now, caller && caller.email);
  if (r.recorded) await deliver(db, c.orgId, now, mailer);
  return Object.assign({}, r, { due: dueView(await context(db, c.orgId)) });
}

/* ── what Plan & billing reads (an owner or administrator) ── */
async function view(db, c, stripe, now) {
  var b = c.billing, rail = c.billingExists ? railOf(b) : null;
  var out = { orgId: c.orgId, rail: rail, packaged: b.packaged === true, linked: !!b.stripeCustomerId, mode: mode(), card: null, canLink: false, reason: null, due: null, canPay: false, payReason: null };
  if (rail !== 'stripe') { out.reason = rail === 'quickbooks' ? QUICKBOOKS : 'ClearSky sets up billing for this workspace first.'; return out; }
  if (b.stripeCustomerId) {
    var bm = boundRefusal(b);
    if (bm) out.reason = bm;
    else if (!stripe) out.reason = 'Stripe is not set up on this deployment yet.';
    else {
      try {
        var cus = await bound(c, stripe);
        out.card = await cardOf(stripe, cus); out.canLink = true;
        /* a figure ClearSky changed since its invoice was made: that invoice is withdrawn before the page offers anything */
        if (b.packaged !== true && !refusal(c)) { try { await closeStale(db, c, stripe, cus.id, now); } catch (e) { console.warn('[stripe-customer] stale invoice:', e && e.message); } }
      } catch (e) { out.reason = e.status && e.status < 500 ? e.message : 'Stripe could not be reached just now.'; }
    }
  } else { out.reason = refusal(c); out.canLink = !out.reason; }
  if (b.packaged !== true) {
    out.due = dueView(c);
    out.payReason = refusal(c) || (b.paymentLink ? 'Pay with the payment link ClearSky set for this workspace.' : null) || (out.due ? centsRefusal(out.due.cents) || holdRefusal(c.orgId, b) : 'Nothing is owed right now.');
    out.canPay = !out.payReason;
  }
  return out;
}

/* the endpoint's one door: every action for one workspace */
async function run(db, orgId, action, caller, o) {
  o = o || {};
  var c = await context(db, orgId), now = o.now || Date.now(), stripe = o.stripe || null;
  try {
    if (action === 'view') return await view(db, c, stripe, now);
    if (!stripe) fail('Stripe is not set up on this deployment yet.', 503);
    if (action === 'card' || action === 'portal') return await portal(db, c, caller, stripe, now, o.host, action === 'card');
    if (action === 'pay') return await pay(db, c, caller, stripe, now, o.mail);
    if (action === 'check') return await check(db, c, caller, stripe, now, o.mail);
    fail('Action must be view, card, portal, pay or check', 400);
  } catch (e) {
    /* Stripe's own refusal is said as Stripe's, never as our fault (a 500) */
    if (e && !e.status && typeof e.type === 'string' && /^Stripe/.test(e.type)) {
      console.warn('[stripe-customer] Stripe refused ' + action + ':', e.message);
      var x = new Error('Stripe refused: ' + String(e.message || 'no reason given').slice(0, 300)); x.status = e.statusCode >= 500 || e.type === 'StripeConnectionError' ? 502 : 409; throw x;
    }
    throw e;
  }
}

/* The workspace a Stripe event is about, when it is a plan's amount-due
   invoice made by pay() above; null for everything else (a package invoice
   carries omegaPackage and is the engine's). api/stripe-webhook.js settles
   it before the legacy tier path can touch the record. */
function eventOrg(evt) {
  var o = evt && evt.data && evt.data.object;
  if (!o || o.object !== 'invoice' || !/^invoice\./.test(evt.type || '')) return null;
  var md = o.metadata || {};
  if (!md.omegaDue || md.omegaPackage === 'true') return null;
  return typeof md.omegaOrg === 'string' && /^[a-z0-9.-]{3,253}$/.test(md.omegaOrg) ? md.omegaOrg : null;
}

module.exports = { run: run, view: view, link: link, portal: portal, pay: pay, settle: settle, check: check, deliver: deliver, eventOrg: eventOrg,
  railOf: railOf, refusal: refusal, dueOf: dueOf, describe: describe, returnUrl: returnUrl, mode: mode, client: client, context: context };
