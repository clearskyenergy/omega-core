/* ═══════════════════════════════════════════════════════════════════════════
   api/customer-subscribe.js — a supplier's CUSTOMER subscribes to Editor Lite
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   GET  /api/customer-subscribe?org=
        { available, monthlyPriceCents, yearlyPriceCents, currency, status,
          expiresAt, plan, entitled, canManage }
   POST /api/customer-subscribe { org, plan: 'month'|'year' [, from:'portal'] }
        { url }  → Stripe Checkout (mode subscription)
   POST /api/customer-subscribe { org, action: 'manage' [, from:'portal'] }
        { url }  → Stripe billing portal for the ACCOUNT's Stripe customer

   The one thing a supplier's customer (Amperage Capital, buying from Clean
   Cell) pays the platform for: the design tool, white-labelled as the
   supplier's, monthly or yearly. docs/OMEGA-LOGIC-ECOSYSTEM.md "The one paid
   difference".

   WHO. The proof api/my-orders.js asks for: a VERIFIED email, the account
   that email is on (customer_index), an ACTIVE person on an active account.
   The account comes from the token, never from the request. Any active
   person on the account may START a subscription — it is paid by card at
   Stripe, and the grant is the ACCOUNT's, so every person on it designs.
   Only the account's OWNER or the person who subscribed may open the
   billing portal, because that is where it is cancelled.

   PRICES. The supplier's, set by ClearSky's owner:
   billing/current.customerEditorLite.monthlyPriceCents / yearlyPriceCents
   (api/tenant-billing.js, logic-admin.html; api/logic-onboard.js for the
   monthly one). Sent to Stripe as price_data — no Stripe Price object is
   kept in sync with a Firestore field. A plan with no price is not offered,
   and checkout is not offered at all unless the supplier has Editor Lite on
   (billing/current.editorLite.enabled) and the server has STRIPE_SECRET_KEY.

   STRIPE. ClearSky's account, the same client api/stripe-create.js builds
   (env keys only). One Stripe CUSTOMER per customer ACCOUNT — never the
   tenant's own (that one carries metadata.orgId and api/stripe-webhook.js
   would bill the tenant for it). Ours carry metadata
   { kind: 'customer-editor-lite', org, customerId } — deliberately `org`,
   not `orgId` — on the customer, the Checkout Session AND the subscription
   (subscription_data), and an Admin-SDK-only pointer
   stripe_customers/{cus_…} → { kind, org, customerId } answers events that
   carry no subscription metadata without a collection-group index. The rules
   match neither stripe_customers nor stripe_events, so browsers are denied.

   THE GRANT. webhook() below — called FIRST by api/stripe-webhook.js — sets
   omega_orgs/{org}/customers/{id}.editorLite =
     { source: 'provider', status: 'active'|'past_due'|'inactive', plan,
       expiresAt: current_period_end, stripeCustomerId, stripeSubscriptionId,
       subscribedBy, updatedAt, stripeEventAt }
   which is the shape api/_lib/buyer-design.js entitlement() accepts (source
   provider + active + unexpired + the supplier's Editor Lite on). Deduped by
   Stripe event id (stripe_events/{evt_…}); an event older than the one
   already applied to the same subscription is ignored; a lapse never
   revokes a trial or a DIFFERENT subscription; every change is audited in
   omega_audit with what it was.

   Scrubs its own 500s, like api/my-orders.js: a Stripe or helper message
   must never reach a battery customer's screen.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var A = require('./_lib/admin'), B = require('./_lib/buyer-accounts'), D = require('./_lib/buyer-design');
var P = require('./_lib/logic-policy'), links = require('./_lib/customer-links'), brand = require('./_lib/logic-brand');

var KIND = 'customer-editor-lite', PLANS = ['month', 'year'];
var POINTERS = 'stripe_customers', EVENTS = 'stripe_events';
var PAID = ['active', 'past_due'];
/* Stripe subscription status → the grant's. trialing is a paid-for trial
   Stripe runs (we set none today); everything that is not collecting is
   inactive. */
var STATUS = { active: 'active', trialing: 'active', past_due: 'past_due' };

function requireVerified(caller) {
  if (!caller || !caller.claims || caller.claims.email_verified !== true) throw A.httpError(403, 'Please confirm your email address, then sign in again.');
  if (!caller.email) throw A.httpError(403, 'This account has no email address on it.');
  return String(caller.email).trim().toLowerCase();
}
function stripeClient() { return require('stripe')(process.env.STRIPE_SECRET_KEY); }
function configured() { return !!process.env.STRIPE_SECRET_KEY; }
function price(v) { var n = Number(v); return v != null && Number.isSafeInteger(n) && n >= 100 ? n : null; }
function offer(ctx) {
  var o = ctx.billing.customerEditorLite || {}, m = price(o.monthlyPriceCents), y = price(o.yearlyPriceCents);
  var on = (ctx.billing.editorLite || {}).enabled === true;
  return { enabled: on, monthlyPriceCents: m, yearlyPriceCents: y, available: on && configured() && !!(m || y) };
}
function iso(sec) { var n = Number(sec); return isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : null; }
function cusId(v) { var s = typeof v === 'string' ? v : v && typeof v.id === 'string' ? v.id : ''; return /^cus_[A-Za-z0-9]{1,64}$/.test(s) ? s : ''; }
function subId(v) { var s = typeof v === 'string' ? v : v && typeof v.id === 'string' ? v.id : ''; return /^sub_[A-Za-z0-9]{1,64}$/.test(s) ? s : ''; }
function mail(v) { var s = String(v || '').trim().toLowerCase(); return s.length <= 254 && /^[^@\s/]+@[^@\s/]+\.[^@\s/]+$/.test(s) ? s : null; }

async function pointerOf(db, org, customerId) {
  var q = await db.collection(POINTERS).where('org', '==', org).where('customerId', '==', customerId).limit(1).get();
  if (q.empty) return null;
  var d = q.docs[0].data() || {};
  return d.kind === KIND ? { id: q.docs[0].id, data: d } : null;
}
function returnUrls(org, from) {
  var p = links.paths(org);
  if (from === 'portal') {
    return { success: p.account + '&checkout=done#design', cancel: p.account + '&checkout=cancelled#design', back: p.account + '#design' };
  }
  return { success: p.app + '&tab=design&checkout=done', cancel: p.app + '&tab=design&checkout=cancelled', back: p.app + '&tab=design' };
}

/* What the customer app shows: the offer, and the ACCOUNT's grant. */
function view(ctx, acct, address) {
  var o = offer(ctx), grant = acct.data.editorLite || {}, ent = D.entitlement(ctx, acct.data, null);
  var provider = grant.source === 'provider';
  return { available: o.available, monthlyPriceCents: o.monthlyPriceCents, yearlyPriceCents: o.yearlyPriceCents, currency: 'USD',
    /* A paid subscription says what Stripe says (active / past_due /
       inactive) so a customer with a failed card can reach Manage; a trial
       or nothing says what the entitlement says. */
    status: provider ? (PAID.indexOf(grant.status) >= 0 ? grant.status : 'inactive') : ent.status,
    expiresAt: provider || ent.active ? grant.expiresAt || null : null,
    plan: provider && PLANS.indexOf(grant.plan) >= 0 ? grant.plan : null,
    entitled: ent.active,
    canManage: provider && !!grant.stripeCustomerId && (acct.user.role === 'owner' || grant.subscribedBy === address) };
}

module.exports = A.handler(function (req, res) {
  res.setHeader('Cache-Control', 'no-store');
  return (async function () {
    if (req.method !== 'GET' && req.method !== 'POST') throw A.httpError(405, 'GET or POST only');
    var caller = await A.authenticate(req), address = requireVerified(caller);
    var b = (req.method === 'GET' ? req.query : req.body) || {}, org = A.safeOrg(b.org || '');
    if (!org) throw A.httpError(400, 'a valid org is required');
    if (typeof A.isDegraded === 'function' && A.isDegraded()) throw A.httpError(503, 'Subscriptions are temporarily unavailable. Please try again shortly.');
    var db = A.db(), ctx = await B.context(org);
    var acct = B.active(await B.lookup(db, org, address));
    if (req.method === 'GET') return view(ctx, acct, address);

    var urls = returnUrls(org, b.from), grant = acct.data.editorLite || {};
    if (b.action === 'manage') {
      if (!configured()) throw A.httpError(503, 'Subscriptions are temporarily unavailable. Please try again shortly.');
      var ptr = await pointerOf(db, org, acct.id);
      if (!ptr) throw A.httpError(409, 'There is no Editor Lite subscription on this account yet.');
      if (acct.user.role !== 'owner' && grant.subscribedBy !== address) throw A.httpError(403, 'Only the owner of this account, or the person who subscribed, can manage the subscription.');
      var portal = await stripeClient().billingPortal.sessions.create({ customer: ptr.id, return_url: urls.back });
      return { url: portal.url };
    }
    if (b.action !== undefined && b.action !== 'subscribe') throw A.httpError(400, 'Unknown subscription action');
    if (PLANS.indexOf(b.plan) < 0) throw A.httpError(400, 'Choose monthly or yearly.');
    var o = offer(ctx), amount = b.plan === 'year' ? o.yearlyPriceCents : o.monthlyPriceCents;
    if (!o.available || !amount) throw A.httpError(409, 'Your supplier does not offer ' + (b.plan === 'year' ? 'a yearly' : 'a monthly') + ' Editor Lite subscription here yet. Ask your account rep for a trial.');
    if (grant.source === 'provider' && PAID.indexOf(grant.status) >= 0) throw A.httpError(409, 'This account already has an Editor Lite subscription. Use Manage subscription to change it.');

    var s = stripeClient(), meta = { kind: KIND, org: org, customerId: acct.id }, name = String(acct.data.name || address).slice(0, 200);
    /* One Stripe customer per ACCOUNT, found by the Admin-only pointer. The
       idempotency key makes two quick clicks one customer, not two. */
    var existing = await pointerOf(db, org, acct.id), customer = existing ? existing.id : '';
    if (!customer) {
      var made = await s.customers.create({ email: address, name: name, metadata: meta }, { idempotencyKey: 'cel-customer-' + org + '-' + acct.id });
      customer = cusId(made);
      if (!customer) throw new Error('Stripe returned no customer id');
      await db.collection(POINTERS).doc(customer).set({ kind: KIND, org: org, customerId: acct.id, createdBy: address, createdAt: new Date().toISOString() });
    }
    var sessionMeta = Object.assign({}, meta, { email: address, plan: b.plan });
    var label = brand(ctx.org).name + ' · Editor Lite';
    var session = await s.checkout.sessions.create({
      mode: 'subscription', customer: customer, client_reference_id: acct.id,
      line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: amount, recurring: { interval: b.plan },
        product_data: { name: label.slice(0, 250), metadata: { kind: KIND, org: org } } } }],
      metadata: sessionMeta, subscription_data: { metadata: sessionMeta },
      success_url: urls.success, cancel_url: urls.cancel });
    await db.collection('omega_audit').add({ action: 'customer-editor-lite-checkout', orgId: org, customerId: acct.id, by: address,
      plan: b.plan, amountCents: amount, stripeCustomerId: customer, sessionId: String(session.id || ''), at: new Date().toISOString() });
    return { url: session.url };
  })()['catch'](function (e) {
    if (e && e.status && e.status < 500) throw e;
    if (e && e.status === 503) throw e;
    console.error('[customer-subscribe]', e);
    throw A.httpError(500, 'Something went wrong on our side. Please try again.');
  });
});

/* ── the webhook branch (api/stripe-webhook.js calls this FIRST) ──────────
   Returns null when the event is not a customer Editor Lite event — the
   tenant's own billing branches then run exactly as before — and an object
   (applied, duplicate or ignored with a reason) when it is, so one of our
   events never falls through to patch a TENANT's billing/current (a
   customer cancelling must not set their supplier's tier to 'trial'). */
async function webhook(evt, s) {
  var obj = (evt && evt.data && evt.data.object) || {}, meta = obj.metadata || {}, type = String(evt && evt.type || '');
  var sub = /^customer\.subscription\.(created|updated|deleted)$/.test(type), done = type === 'checkout.session.completed', inv = /^invoice\./.test(type);
  if (!sub && !done && !inv) return null;
  var db = A.db(), cus = cusId(obj.customer), ptr = null;
  var ours = meta.kind === KIND || (inv && obj.subscription_details && (obj.subscription_details.metadata || {}).kind === KIND);
  if (!ours && cus) {
    var p = await db.collection(POINTERS).doc(cus).get();
    if (p.exists && (p.data() || {}).kind === KIND) { ours = true; ptr = p.data(); }
  }
  if (!ours) return null;
  /* invoice.* carries no grant: the subscription events that come with it
     (past_due, active on renewal) do. Acknowledged so it never reaches the
     tenant's branch. */
  if (inv) return { kind: KIND, ignored: 'invoice events are carried by the subscription events' };
  if (done && obj.mode !== 'subscription') return { kind: KIND, ignored: 'not a subscription checkout' };
  var subscription = obj;
  if (done) {
    if (!subId(obj.subscription)) return { kind: KIND, ignored: 'checkout without a subscription' };
    subscription = typeof obj.subscription === 'object' ? obj.subscription : await s.subscriptions.retrieve(obj.subscription);
  }
  return apply(db, evt, subscription, meta, ptr);
}
async function apply(db, evt, sub, meta, ptr) {
  var sm = sub.metadata || {}, org = A.safeOrg(sm.org || meta.org || (ptr && ptr.org) || ''), cid = String(sm.customerId || meta.customerId || (ptr && ptr.customerId) || '');
  var cus = cusId(sub.customer), sid = subId(sub.id), evId = String(evt.id || '');
  if (!org || !/^[a-zA-Z0-9_-]{1,120}$/.test(cid) || !cus || !sid || !/^evt_[A-Za-z0-9]{1,64}$/.test(evId)) return { kind: KIND, ignored: 'incomplete customer Editor Lite metadata' };
  var item = sub.items && sub.items.data && sub.items.data[0] || {}, recurring = item.price && item.price.recurring || {};
  var status = evt.type === 'customer.subscription.deleted' ? 'inactive' : STATUS[sub.status] || 'inactive';
  var expiresAt = status === 'inactive' ? iso(sub.ended_at) || iso(sub.canceled_at) || iso(evt.created) || new Date().toISOString()
    : iso(sub.current_period_end) || iso(item.current_period_end);
  var plan = PLANS.indexOf(recurring.interval) >= 0 ? recurring.interval : PLANS.indexOf(sm.plan) >= 0 ? sm.plan : null;
  var root = db.collection('omega_orgs').doc(org), ref = root.collection('customers').doc(P.id(cid));
  var evRef = db.collection(EVENTS).doc(evId), ptrRef = db.collection(POINTERS).doc(cus);
  return db.runTransaction(async function (tx) {
    var rows = await Promise.all([tx.get(evRef), tx.get(ref), tx.get(ptrRef)]);
    if (rows[0].exists) return { kind: KIND, duplicate: true };
    var now = new Date().toISOString(), record = { type: evt.type, kind: KIND, org: org, customerId: cid, subscription: sid, at: now };
    function skip(why) { record.ignored = why; tx.create(evRef, record); return { kind: KIND, ignored: why }; }
    if (!rows[1].exists) return skip('no such customer account');
    var pd = rows[2].exists ? rows[2].data() || {} : null;
    /* The pointer is written when checkout starts; an event naming a Stripe
       customer that points at ANOTHER account is refused, not re-bound. */
    if (pd && (pd.kind !== KIND || pd.org !== org || pd.customerId !== cid)) return skip('Stripe customer belongs to another account');
    var prior = rows[1].data().editorLite || {}, same = prior.source === 'provider' && prior.stripeSubscriptionId === sid;
    if (same && Number(prior.stripeEventAt) > Number(evt.created)) return skip('older than the event already applied');
    /* A lapse only ends the subscription it is about: never a trial the
       supplier granted, never another subscription on the account. */
    if (status === 'inactive' && !same) return skip('not the subscription on this account');
    var grant = { source: 'provider', status: status, plan: plan, expiresAt: expiresAt, stripeCustomerId: cus, stripeSubscriptionId: sid,
      subscribedBy: mail(sm.email || meta.email) || prior.subscribedBy || null, updatedAt: now, stripeEventAt: Number(evt.created) || 0 };
    tx.update(ref, { editorLite: grant });
    if (!pd) tx.set(ptrRef, { kind: KIND, org: org, customerId: cid, createdBy: 'stripe', createdAt: now });
    record.applied = status; tx.create(evRef, record);
    /* action 'customer-editor-lite' is what the CRM timeline reads (api/crm.js) */
    tx.create(db.collection('omega_audit').doc(), { action: 'customer-editor-lite', orgId: org, customerId: cid, by: grant.subscribedBy || 'Stripe', source: 'stripe',
      event: evt.type, eventId: evId, was: Object.keys(prior).length ? prior : null, grant: grant, at: now });
    return { kind: KIND, applied: status, customerId: cid };
  });
}

module.exports.webhook = webhook;
module.exports.KIND = KIND;
