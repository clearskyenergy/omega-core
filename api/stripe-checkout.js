/* ═══════════════════════════════════════════════════════════════════════════
   api/stripe-checkout.js — a workspace pays its plan by card, on Stripe's page
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   POST /api/stripe-checkout { action: 'pay' }                  → { url }
        Stripe Checkout for what the plan owes (billing/current.amountDue)
   POST /api/stripe-checkout { action: 'card' }                 → { url }
        Stripe Checkout that saves a card and charges nothing
   POST /api/stripe-checkout { action: 'confirm', sessionId }   → { state }
        the page back from Stripe: records what the session did (paid,
        saved, open or expired), exactly as the webhook does

   WHY. Plan & billing told a workspace billed by ClearSky outside the
   package engine (paymentProvider 'manual', a legacy tier) "No billing
   account yet … Ask ClearSky", with $1,299 owed on the same page (Tommy,
   2026-09-27: "that should be where stripe lives and they can input and
   make a payment"). Now an owner or administrator pays what is owed, or
   keeps a card on file, on Stripe's hosted Checkout page. The card is typed
   there, never on our pages; we keep the Stripe customer id and nothing
   about the card.

   WHAT IS PAID. billing/current.amountDue, read here, never a number from
   the browser: ClearSky sets it (api/tenant-billing.js, the master console)
   and this endpoint only collects it. Refused, so nothing is paid twice or
   on the wrong rail:
     · a PACKAGED workspace: the engine invoices it, and each invoice has its
       own Stripe or QuickBooks page (What you owe);
     · a plan invoiced in QuickBooks (paymentProvider 'quickbooks');
     · a plan a Stripe subscription bills (stripeSubscriptionId), or any open
       Stripe invoice on the customer: that invoice is the pay page;
     · nothing owed, or an amount a card cannot carry.

   THE CUSTOMER. One Stripe customer per workspace: billing/current's
   stripeCustomerId when there is one (api/stripe-create.js made those, with
   metadata.orgId), else one made here with the same mark and written back
   before Checkout opens, so the next click finds it. A customer marked for
   another workspace is refused. metadata.orgId is the LEGACY tenant mark
   (the webhook's tenant branch knows it); a package's own customer is
   stripe-billing.js's and carries omegaOrg, which this one never does.

   RECORDING. checkout.session.completed (api/stripe-webhook.js asks
   webhook() below before its tenant branch) and the page's return (confirm,
   with the session id Stripe puts on the success address) run the SAME
   record(): the session read back from Stripe, then ONE transaction that
   appends billing/current/history/stripe-<session> (a second delivery finds
   it and changes nothing) and writes
     stripeCustomerId, paymentProvider 'stripe'           (card and pay)
     lastPaidAt, amountPaid, amountDue less what was paid (pay)
     subscriptionDue one period on                        (pay, see below)
   subscriptionDue moves only when the due on record is the one this session
   was opened for and it is now paid in full: the same day next month (the
   month's last day when it is shorter), a year on for an annual plan — as
   the tenant branch's invoice.paid sets it to the paid period's end. The
   receipt invoice Checkout makes (invoice_creation) and the intents carry
   the same mark, so the tenant branch never sees them and never moves
   subscriptionDue to the day the card was charged.
   The card becomes the customer's default for the next payment (the portal
   shows it; the next Checkout offers it). Nothing charges it by itself:
   autopay is not built (docs/PAYMENTS-STRIPE.md).
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var crypto = require('crypto'), A = require('./_lib/admin');

var MARK = 'omegaPlanPay', ORIGIN = 'https://silmarillion.clearskyomega.com';
/* Stripe's floor and a card's ceiling, in cents */
var MIN_CENTS = 50, MAX_CENTS = 99999999;

function stripeClient() { return require('stripe')(process.env.STRIPE_SECRET_KEY); }
function configured() { return !!process.env.STRIPE_SECRET_KEY; }
function mode() { return /^(sk|rk)_live_/.test(String(process.env.STRIPE_SECRET_KEY || '')) ? 'live' : 'test'; }
function idOf(v) { return typeof v === 'string' ? v : v && typeof v.id === 'string' ? v.id : ''; }
function cusId(v) { var s = idOf(v); return /^cus_[A-Za-z0-9]{1,64}$/.test(s) ? s : ''; }
function sessionId(v) { var s = String(v || ''); return /^cs_(test|live)_[A-Za-z0-9]{1,200}$/.test(s) ? s : ''; }
function ms(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v.seconds === 'number') return v.seconds * 1000;
  if (typeof v._seconds === 'number') return v._seconds * 1000;
  var t = Date.parse(v); return isNaN(t) ? 0 : t;
}
/* the due a session was opened for, as a day: a Timestamp, an ISO time and a YYYY-MM-DD all compare */
function dueKey(v) { var t = ms(v); return t ? new Date(t).toISOString().slice(0, 10) : ''; }
/* one period on from the due just paid; a YYYY-MM-DD (the console's) stays a date */
function nextDue(v, annual) {
  var t = ms(v); if (!t) return null;
  var d = new Date(t), y = d.getUTCFullYear(), m = d.getUTCMonth() + (annual ? 12 : 1);
  var last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  var out = new Date(Date.UTC(y, m, Math.min(d.getUTCDate(), last), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()));
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? out.toISOString().slice(0, 10) : out.toISOString();
}
function cents(v) { var n = Number(v); return isFinite(n) ? Math.round(n * 100) : 0; }
function usd(c) { return '$' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 }); }
function titleCase(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }
/* an idempotency key within Stripe's 255 characters, whatever the org and host */
function key(what, parts) { return 'omega-plan-' + what + '-' + crypto.createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 48); }
function billingRef(db, org) { return db.collection('omega_orgs').doc(org).collection('billing').doc('current'); }

/* why this workspace's plan is not paid here at all ('' when it is) */
function railRefusal(bl) {
  if (bl.packaged === true) return 'Your package is paid on each invoice’s own page, under What you owe.';
  if (bl.paymentProvider === 'quickbooks') return 'Your plan is invoiced in QuickBooks: pay it on QuickBooks’ own page.';
  return '';
}
/* why what is owed cannot be paid by card here ('' when it can) */
function payRefusal(bl) {
  if (bl.stripeSubscriptionId) return 'Your plan is billed by a Stripe subscription: pay its open invoice under What you owe.';
  var c = cents(bl.amountDue);
  if (c <= 0) return 'Nothing is owed right now.';
  if (c < MIN_CENTS) return 'An amount under $0.50 cannot be paid by card. ClearSky settles it with you.';
  if (c > MAX_CENTS) return 'An amount this size is paid by invoice. ClearSky sends it.';
  return '';
}
/* the address Stripe sends the person back to: the host they came from (Vercel routes by it) */
function base(req) {
  var h = String((req.headers && req.headers.host) || '').toLowerCase();
  if (!/^[a-z0-9.-]+(:\d{1,5})?$/.test(h)) return ORIGIN;
  return (/^(localhost|127\.0\.0\.1)(:|$)/.test(h) ? 'http://' : 'https://') + h;
}

/* the workspace's Stripe customer: the one on record, else one made now and written back */
async function customerFor(s, db, org, bl, caller, name) {
  if (bl.stripeCustomerId) {
    var c;
    try { c = await s.customers.retrieve(bl.stripeCustomerId); }
    catch (e) { if (e && (e.code === 'resource_missing' || e.statusCode === 404)) throw A.httpError(409, 'The Stripe customer on this workspace is not in this Stripe account. ClearSky reviews it.'); throw e; }
    if (!c || c.deleted) throw A.httpError(409, 'The Stripe customer on this workspace was removed. ClearSky reviews it.');
    var mark = (c.metadata || {}).orgId || (c.metadata || {}).omegaOrg;
    if (mark && mark !== org) throw A.httpError(409, 'The Stripe customer on this workspace is marked for another. ClearSky reviews it.');
    return String(c.id);
  }
  /* the person's uid is in the key: two administrators at once make two
     customers and the transaction below keeps one, never an idempotency error */
  var made = await s.customers.create({ name: name, email: caller.email || undefined, metadata: { orgId: org, omegaPlan: 'true' } },
    { idempotencyKey: key('customer', [mode(), org, caller.uid]) });
  var id = cusId(made);
  if (!id) throw new Error('Stripe returned no customer id');
  var ref = billingRef(db, org);
  return db.runTransaction(async function (tx) {
    var snap = await tx.get(ref), now = snap.exists ? snap.data() || {} : {};
    if (now.stripeCustomerId) return String(now.stripeCustomerId);
    tx.set(ref, { stripeCustomerId: id }, { merge: true });
    return id;
  });
}

async function start(req, caller, org, action) {
  var db = A.db(), s = stripeClient(), snap = await billingRef(db, org).get();
  if (!snap.exists) throw A.httpError(409, 'This workspace has no billing record yet. ClearSky sets it up.');
  var bl = snap.data() || {}, why = railRefusal(bl) || (action === 'pay' ? payRefusal(bl) : '');
  if (why) throw A.httpError(409, why);
  var orgDoc = await db.collection('omega_orgs').doc(org).get(), company = String((orgDoc.exists && (orgDoc.data() || {}).name) || org).slice(0, 200);
  var customer = await customerFor(s, db, org, bl, caller, company);
  var meta = { orgId: org, by: String(caller.email || '').slice(0, 200) };
  meta[MARK] = 'true';
  var at = base(req), back = at + '/workspace#billing';
  if (action === 'card') {
    var saving = await s.checkout.sessions.create({ mode: 'setup', customer: customer, client_reference_id: org, payment_method_types: ['card'],
      metadata: meta, setup_intent_data: { metadata: meta },
      success_url: at + '/workspace?card={CHECKOUT_SESSION_ID}#billing', cancel_url: back });
    return { url: saving.url };
  }
  /* an open Stripe invoice already asks for this money: that page, not a second charge */
  var open = await s.invoices.list({ customer: customer, status: 'open', limit: 1 });
  if (open && open.data && open.data.length) throw A.httpError(409, 'An open Stripe invoice covers this: pay it under What you owe.');
  var amount = cents(bl.amountDue), due = dueKey(bl.subscriptionDue), plan = 'OMEGA ' + titleCase(bl.tier || 'standard') + ' plan';
  var what = (company + (due ? ' · due ' + due : '')).slice(0, 500);
  meta.cents = String(amount); meta.due = due;
  var session = await s.checkout.sessions.create({
    mode: 'payment', customer: customer, client_reference_id: org, payment_method_types: ['card'],
    line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: amount, product_data: { name: plan, description: what } } }],
    /* the card stays on the customer for the next payment */
    payment_intent_data: { setup_future_usage: 'off_session', description: plan + ' · ' + what, metadata: meta },
    /* a receipt invoice for the books and the billing history; it carries the mark, so the tenant branch leaves it alone */
    invoice_creation: { enabled: true, invoice_data: { description: plan + ' · ' + what, metadata: meta } },
    metadata: meta, success_url: at + '/workspace?paid={CHECKOUT_SESSION_ID}#billing', cancel_url: back
  }, { idempotencyKey: key('pay', [mode(), org, caller.uid, amount, due, at]) });
  return { url: session.url, amountCents: amount, display: usd(amount) };
}

/* ── record: what a completed session did, written once ──────────────────── */
async function record(s, db, session, via) {
  var meta = (session && session.metadata) || {}, org = A.safeOrg(meta.orgId || ''), sid = sessionId(session && session.id);
  if (meta[MARK] !== 'true' || !org || !sid) return { ignored: 'not a plan checkout' };
  var pay = session.mode === 'payment';
  if (!pay && session.mode !== 'setup') return { orgId: org, ignored: 'not a payment or a card' };
  if (session.status === 'expired') return { orgId: org, state: 'expired' };
  if (session.status !== 'complete' || (pay && session.payment_status !== 'paid')) return { orgId: org, state: 'open' };
  var cus = cusId(session.customer);
  if (!cus) return { orgId: org, ignored: 'no customer on the session' };
  var intent = pay ? session.payment_intent : session.setup_intent;
  if (!idOf(intent)) return { orgId: org, state: 'open' };
  if (typeof intent === 'string') intent = pay ? await s.paymentIntents.retrieve(intent) : await s.setupIntents.retrieve(intent);
  if (!intent || intent.status !== 'succeeded') return { orgId: org, state: 'open' };
  /* the card is the customer's default from now on; a refusal records the payment all the same */
  var pm = idOf(intent.payment_method);
  if (pm) { try { await s.customers.update(cus, { invoice_settings: { default_payment_method: pm } }); } catch (e) { console.warn('[stripe-checkout] default card not set for', org, e && e.message); } }
  var ref = billingRef(db, org), hist = ref.collection('history').doc('stripe-' + sid), FV = A.FieldValue();
  var paid = pay ? Number(session.amount_total) || 0 : 0, state = pay ? 'paid' : 'saved';
  return db.runTransaction(async function (tx) {
    var rows = await Promise.all([tx.get(ref), tx.get(hist)]);
    if (rows[1].exists) return { orgId: org, state: state, duplicate: true };
    var cur = rows[0].exists ? rows[0].data() || {} : {};
    var row = { at: FV.serverTimestamp(), by: meta.by || 'stripe', source: 'stripe-checkout', via: via, sessionId: sid, stripeCustomerId: cus, mode: session.mode };
    if (pay) row.amountCents = paid;
    /* money came in that the record cannot take as it stands: kept, and a person looks */
    function review(why) { row.review = why; tx.create(hist, row); return { orgId: org, state: 'review', review: why, amountCents: paid }; }
    if (!rows[0].exists) return review('The workspace has no billing record.');
    if (cur.packaged === true) return review('The workspace moved onto a package after this checkout opened.');
    if (cur.stripeCustomerId && cur.stripeCustomerId !== cus) return review('Another Stripe customer is on the workspace.');
    var patch = { stripeCustomerId: cus, paymentProvider: 'stripe' };
    if (pay) {
      var owed = Math.max(0, cents(cur.amountDue)), left = Math.max(0, owed - paid);
      patch.amountDue = left / 100; patch.amountPaid = paid / 100; patch.lastPaidAt = new Date().toISOString(); patch.paymentFailedAt = null;
      if (!left && cur.subscriptionDue && dueKey(cur.subscriptionDue) === String(meta.due || '')) patch.subscriptionDue = nextDue(cur.subscriptionDue, cur.interval === 'annual');
      if (paid > owed) row.overpaidCents = paid - owed;
    }
    var was = {}; Object.keys(patch).forEach(function (k) { was[k] = cur[k] === undefined ? null : cur[k]; });
    row.changed = patch; row.was = was;
    tx.set(ref, Object.assign({}, patch, { updatedAt: FV.serverTimestamp(), updatedBy: 'stripe' }), { merge: true });
    tx.create(hist, row);
    return { orgId: org, state: state, recorded: true, amountCents: paid, amountDue: pay ? patch.amountDue : cur.amountDue == null ? null : cur.amountDue,
      subscriptionDue: patch.subscriptionDue || cur.subscriptionDue || null, overpaidCents: row.overpaidCents || 0 };
  });
}

/* ClearSky hears about the money (and anything a person has to look at) once: from whichever door wrote it */
async function tell(db, r) {
  if (!r || !(r.recorded || r.state === 'review') || !r.amountCents) return;
  try {
    var mail = (module.exports.deps && module.exports.deps.mail) || require('./_lib/mail');
    var o = await db.collection('omega_orgs').doc(r.orgId).get(), company = (o.exists && (o.data() || {}).name) || r.orgId;
    if (r.state === 'review') await mail.templates.billingAlert({ company: company, orgId: r.orgId, text: usd(r.amountCents) + ' was paid by card on Stripe for the plan, and the billing record was not changed: ' + r.review });
    else await mail.templates.paidAlert({ company: company, orgId: r.orgId, amountDisplay: usd(r.amountCents), payWith: 'Stripe', what: 'Plan paid by card' + (r.amountDue ? '; ' + usd(cents(r.amountDue)) + ' still owed' : '') + (r.overpaidCents ? '; ' + usd(r.overpaidCents) + ' more than was owed' : '') });
  } catch (e) { console.warn('[stripe-checkout] alert not sent for', r.orgId, e && e.message); }
}

module.exports = A.handler(function (req, res) {
  res.setHeader('Cache-Control', 'no-store');
  var b = req.body || {};
  return (async function () {
    if (req.method !== 'POST') throw A.httpError(405, 'POST only');
    var caller = await A.authenticate(req);
    if (!caller.claims || caller.claims.email_verified !== true) throw A.httpError(403, 'Please confirm your email address, then sign in again.');
    var org = A.safeOrg(b.orgId || caller.orgId || '');
    if (!org) throw A.httpError(400, 'orgId required');
    if (!(await A.isTenantAdmin(caller, org))) throw A.httpError(403, 'An owner or administrator of the workspace pays and keeps the card.');
    if (typeof A.isDegraded === 'function' && A.isDegraded()) throw A.httpError(503, 'Card payments are unavailable for a moment. Please try again shortly.');
    if (!configured()) throw A.httpError(503, 'Card payments are not switched on here yet. ClearSky can send an invoice instead.');
    if (b.action === 'pay' || b.action === 'card') return start(req, caller, org, b.action);
    if (b.action !== 'confirm') throw A.httpError(400, 'Action must be pay, card or confirm');
    var sid = sessionId(b.sessionId);
    if (!sid) throw A.httpError(400, 'sessionId required');
    var s = stripeClient(), session = await s.checkout.sessions.retrieve(sid);
    if (!session || (session.metadata || {})[MARK] !== 'true' || A.safeOrg((session.metadata || {}).orgId || '') !== org) throw A.httpError(404, 'That checkout is not this workspace’s.');
    var r = await record(s, A.db(), session, 'return');
    await tell(A.db(), r);
    return { orgId: org, state: r.state || 'open', amountDue: r.amountDue == null ? null : r.amountDue, subscriptionDue: r.subscriptionDue || null, display: r.amountCents ? usd(r.amountCents) : null };
  })()['catch'](function (e) {
    if (e && e.status && e.status < 500) throw e;
    if (e && e.status === 503) throw e;
    console.error('[stripe-checkout]', e);
    /* a confirm that fails leaves a payment Stripe holds: the webhook records it */
    throw A.httpError(502, b.action === 'confirm' ? 'Stripe holds your payment; this page could not record it yet. It shows here within a minute.' : 'Stripe could not be reached. Nothing was charged; please try again.');
  });
});

/* ── the webhook branch (api/stripe-webhook.js asks this before the tenant
   branch) ── null for anything not marked as ours, so every other event runs
   exactly as before; checkout.session.completed is recorded; every other
   event of ours (the receipt invoice, the intents) is acknowledged and goes
   no further, because the session carries the payment. */
async function webhook(evt, s) {
  var o = evt && evt.data && evt.data.object;
  if (!o || (o.metadata || {})[MARK] !== 'true') return null;
  if (evt.type !== 'checkout.session.completed' || o.object !== 'checkout.session') return { planPay: true, ignored: String(evt.type || '') + ' is carried by checkout.session.completed' };
  var r = await record(s, A.db(), o, 'webhook');
  await tell(A.db(), r);
  return Object.assign({ planPay: true }, r);
}

module.exports.webhook = webhook;
module.exports.record = record;
module.exports.nextDue = nextDue;
module.exports.MARK = MARK;
/* tests hand a mailer here */
module.exports.deps = null;
