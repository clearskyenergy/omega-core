/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * The Stripe rail for packaged billing (2026-09-27, Tommy: "charge people
 * on the spot with Stripe"). The same driver the QuickBooks one is —
 * customer / invoice / reconcile / guard (api/_lib/qbo-billing.js) — so the
 * engine keeps ONE paid transition (package-billing.reconcile) and ONE
 * access rule (accessAfterInvoices) whichever rail took the money.
 *
 * One rail per workspace, one place per charge. A Stripe workspace gets no
 * OMEGA QuickBooks invoice at all: Stripe's own QuickBooks app records each
 * card payment as a sales receipt (docs/PAYMENTS-BROWSER-SETUP.md Part 3),
 * so an OMEGA invoice for the same money would book the revenue twice and
 * sit open in A/R forever.
 *
 *   invoice()    the record's charge. With a card on file (saved by the
 *                first Checkout) it is charged at once, off-session; without
 *                one, or when the bank wants the cardholder, the record waits
 *                on its PAY LINK. Returns the engine's {id, totalCents,
 *                payUrl} plus `charge` (what happened to the card).
 *   pay link     https://<home>/api/package-pay?o=&r=&s= — durable, signed,
 *                safe to mail. Each visit reuses the record's open Checkout
 *                Session or mints the next one (a session lives 24 hours;
 *                an invoice may wait to the end of its cycle).
 *   returned()   Checkout's success_url: re-read the session from Stripe,
 *                attach its payment, save the card, reconcile that one
 *                record, send the receipt, open the workspace.
 *   webhook()    the same, from Stripe's event. A HINT: nothing is granted
 *                from an event body; the record is re-read from Stripe.
 *   reconcile()  re-reads every payment on the record: paid when what was
 *                received covers the total; reversed when all of it went
 *                back (a full refund or a lost dispute).
 *
 * Namespace (the legacy tenant branch of api/stripe-webhook.js acts on
 * metadata.orgId and on billing/current.stripeCustomerId, and Editor Lite
 * claims kind 'customer-editor-lite'): every object carries
 * metadata {kind:'omega-package', org, record, ref} — never `orgId` — and the
 * customer id lives at billing/current.stripe.customerId, never at the
 * top-level field. Card data never touches OMEGA: Stripe's hosted Checkout
 * takes it; OMEGA keeps the brand and the last four digits to show.
 */
'use strict';
var crypto = require('crypto'), Mode = require('./packaging-mode'), BP = require('./billing-profile'), K = require('./kit');
var KIND = 'omega-package', API_VERSION = '2024-06-20';
var TRANSIENT = ['StripeConnectionError', 'StripeAPIError', 'StripeRateLimitError', 'StripeAuthenticationError', 'StripePermissionError'];
function fail(message, status, extra) { var e = new Error(message); e.status = status || 409; if (extra) Object.assign(e, extra); throw e; }
function key(value) { return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 48); }
function idOf(v) { return typeof v === 'string' ? v : (v && v.id) || null; }
function money(c) { return '$' + (c / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
/* Stripe's errors, in the engine's words: a failure on ClearSky's side
   (no answer, Stripe down, our key refused, rate limit) is `clearsky` and
   retried; anything else is the record's and goes to a person. */
function wrap(e) {
  if (!e || !e.type || !/^Stripe/.test(e.type)) return e;
  var out = new Error('Stripe: ' + String(e.message || e.type).slice(0, 300));
  out.status = e.statusCode || 502; out.code = e.code || null; out.stripeType = e.type; out.raw = e.raw || null;
  out.clearsky = TRANSIENT.indexOf(e.type) >= 0 || !e.statusCode || e.statusCode >= 500;
  if (!out.clearsky && out.status < 400) out.status = 409;
  return out;
}
async function call(fn) { try { return await fn(); } catch (e) { throw wrap(e); } }
function client(supplied) {
  if (supplied) return supplied;
  var k = Mode.stripeKey();
  if (!k) fail('Stripe is not set up for packaging in ' + Mode.env() + ' mode (a ' + (Mode.live() ? 'live' : 'test') + ' key is required)', 503, { clearsky: true });
  return require('stripe')(k, { apiVersion: API_VERSION, maxNetworkRetries: 1, timeout: 15000 });
}
/* The mode's key and the book's company must agree before any Stripe call
   (qbo-items.guard is the QuickBooks twin). */
function guard(book) {
  if (!Mode.open()) fail('Packaging billing requires QBO_ENV=sandbox (or PACKAGING_LIVE=true with QBO_ENV=production)', 409, { clearsky: true });
  if (!Mode.stripeKey()) fail('Stripe is not set up for packaging in ' + Mode.env() + ' mode', 503, { clearsky: true });
  if (book && (!book.qbo || book.qbo.env !== Mode.env())) fail('The price book is not this mode\'s', 409, { clearsky: true });
}
function meta(org, recordId, ref) { return { kind: KIND, org: org, record: recordId, ref: ref, env: Mode.env() }; }
function ours(m, org, recordId, ref) { return !!m && m.kind === KIND && m.org === org && (!recordId || m.record === recordId) && (!ref || m.ref === ref); }
function refOf(marker) { return 'stp_' + key('omega-package-record:' + marker).slice(0, 24); }
function total(lines) {
  var t = (lines || []).reduce(function (n, l) { return n + l.amountCents; }, 0);
  if (!Number.isInteger(t) || t < 50) fail('A card charge must be at least $0.50', 409);
  return t;
}
function address(a) {
  a = a || {}; var country = String(a.country || '').trim();
  if (/^(usa?|united states( of america)?)$/i.test(country)) country = 'US';
  var out = { line1: a.line1, line2: a.line2 || undefined, city: a.city, state: a.state, postal_code: a.postalCode };
  if (/^[A-Za-z]{2}$/.test(country)) out.country = country.toUpperCase();
  return out;
}
/* Home: where a payer is sent back to (api/_lib/kit.js home(), the one rule). */
function homeOf(org) { return K.home(org || null, { wildcard: process.env.TENANT_WILDCARD_LIVE === 'true' }); }
/* ── the pay link: signed with a key derived from the mode's Stripe key, so
   a sandbox link never opens a live checkout and the other way round ── */
function linkKey() { var k = Mode.stripeKey(); if (!k) fail('Stripe is not set up for packaging in ' + Mode.env() + ' mode', 503, { clearsky: true }); return crypto.createHash('sha256').update('omega-package-pay-link\u0000' + k).digest(); }
function signature(org, recordId) { return crypto.createHmac('sha256', linkKey()).update(org + '\n' + recordId).digest('hex').slice(0, 40); }
function payLink(host, org, recordId) {
  return 'https://' + host + '/api/package-pay?o=' + encodeURIComponent(org) + '&r=' + encodeURIComponent(recordId) + '&s=' + signature(org, recordId);
}
function validRecordId(r) { return typeof r === 'string' && /^[A-Za-z0-9_-]{6,120}$/.test(r); }
function verifyLink(org, recordId, sig) {
  if (!org || !validRecordId(recordId) || typeof sig !== 'string' || !/^[a-f0-9]{40}$/.test(sig)) return false;
  var want = Buffer.from(signature(org, recordId)), got = Buffer.from(sig);
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}
/* A pay link a page may show: QuickBooks' own (the intuit.com pin in
   logic-policy, shared with Omega Logic orders and left as it is), or OUR
   pay path on the open host, a clearskyomega.com host or the workspace's own
   attached host. Showing a link is never access. */
function safePayLink(value, org) {
  var intuit = require('./logic-policy').paymentLink(value); if (intuit) return intuit;
  try {
    var u = new URL(value), host = u.hostname;
    var hostOk = /(^|\.)clearskyomega\.com$/.test(host) || host === homeOf(org);
    if (u.protocol !== 'https:' || u.username || u.password || !hostOk || u.pathname !== '/api/package-pay') return null;
    if (!u.searchParams.get('o') || !u.searchParams.get('r') || !/^[a-f0-9]{40}$/.test(u.searchParams.get('s') || '')) return null;
    return u.href;
  } catch (e) { return null; }
}
/* Checkout line items: the engine's lines as they are, or — when a credit
   line is negative (Checkout takes no negative line) — one line for the
   total that names every line in its description. */
function lineItems(record) {
  var lines = record.lines || [], name = record.kind === 'change' ? 'OMEGA subscription change' : record.kind === 'pack' ? 'OMEGA usage pack' : 'OMEGA subscription';
  var span = record.period ? ' · ' + record.period.start + ' to ' + record.period.end : '';
  if (lines.length && lines.length <= 50 && lines.every(function (l) { return Number.isInteger(l.amountCents) && l.amountCents > 0; })) {
    return lines.map(function (l) { return { quantity: 1, price_data: { currency: 'usd', unit_amount: l.amountCents, product_data: { name: String(l.name || name).slice(0, 250) } } }; });
  }
  var description = lines.map(function (l) { return l.name + ' ' + (l.amountCents < 0 ? '−' + money(-l.amountCents) : money(l.amountCents)); }).join('; ').slice(0, 500);
  return [{ quantity: 1, price_data: { currency: 'usd', unit_amount: record.totalCents, product_data: { name: (name + span).slice(0, 250), description: description || undefined } } }];
}
var CONSENT = 'Your card is kept on file for this workspace: its subscription is charged on the billing date, and any module or pack you confirm is charged when you confirm it. Paying an invoice with another card makes that card the one on file; to remove it, ask ClearSky.';

function driver(book, supplied) {
  async function customer(orgId, profile, existingId) {
    guard(book); var s = client(supplied), p = BP.normalize(profile);
    var fields = { name: p.legalName, email: p.email, phone: p.phone, address: address(p.address), description: 'OMEGA-' + orgId, metadata: { kind: KIND, org: orgId } };
    if (existingId) {
      if (!/^cus_[A-Za-z0-9]+$/.test(existingId)) fail('Invalid Stripe customer');
      var found = await call(function () { return s.customers.retrieve(existingId); });
      if (!found || found.deleted || !found.metadata || found.metadata.kind !== KIND || found.metadata.org !== orgId) fail('The Stripe customer belongs to another account; accounting review required');
      await call(function () { return s.customers.update(existingId, { name: fields.name, email: fields.email, phone: fields.phone, address: fields.address }, { idempotencyKey: key('omega-package-customer-update:' + existingId + ':' + key(JSON.stringify(fields))) }); });
      return existingId;
    }
    var made = await call(function () { return s.customers.create(fields, { idempotencyKey: key('omega-package-customer:' + Mode.env() + ':' + orgId + ':' + key(JSON.stringify(fields))) }); });
    if (!made || !/^cus_/.test(made.id || '')) fail('Stripe did not confirm the customer');
    return made.id;
  }
  /* opts: { org, recordId, host } — where the record lives and where its payer is sent */
  async function invoice(plan, profile, customerId, opts) {
    guard(book); opts = opts || {};
    if (typeof plan.marker !== 'string' || !plan.marker) fail('Invoice marker required');
    if (!opts.org || !validRecordId(opts.recordId) || !opts.host) fail('Stripe invoices need the workspace and record');
    var s = client(supplied), cents = total(plan.lines), ref = refOf(plan.marker);
    var out = { id: ref, totalCents: cents, payUrl: payLink(opts.host, opts.org, opts.recordId), payLinkMissing: false, provider: 'stripe', charge: null };
    var cus = await call(function () { return s.customers.retrieve(customerId); });
    if (!cus || cus.deleted || !cus.metadata || cus.metadata.kind !== KIND || cus.metadata.org !== opts.org) fail('The Stripe customer belongs to another account; accounting review required');
    var pm = idOf(cus.invoice_settings && cus.invoice_settings.default_payment_method);
    /* opts.offSession === false: the engine holds the card (a workspace whose
       invoice was refunded or charged back is never charged again unasked) */
    if (!pm || opts.offSession === false) return out;
    /* Stripe keeps an idempotency key for about a day and the runner retries
       for longer: a charge already made for this record (a crash between the
       charge and our write) is found again, never made twice. A list is read
       straight from Stripe; search would lag. */
    var recent = await call(function () { return s.paymentIntents.list({ customer: customerId, limit: 100 }); });
    var prior = (recent && recent.data || []).filter(function (x) { return ours(x.metadata, opts.org, opts.recordId, ref) && ['succeeded', 'processing', 'requires_capture'].indexOf(x.status) >= 0; })[0];
    if (prior) { out.charge = { paymentIntentId: prior.id, status: prior.status === 'succeeded' ? 'succeeded' : prior.status, code: null, found: true }; return out; }
    /* on the spot: the card on file, now. A refusal is not an error — the
       record waits on its pay link and the payer is told why. */
    try {
      var pi = await call(function () {
        return s.paymentIntents.create({ amount: cents, currency: 'usd', customer: customerId, payment_method: pm, off_session: true, confirm: true,
          payment_method_types: ['card'], description: plan.marker.slice(0, 1000), metadata: meta(opts.org, opts.recordId, ref) },
          { idempotencyKey: key('omega-package-charge:' + plan.marker) });
      });
      out.charge = { paymentIntentId: pi.id, status: pi.status, code: null };
    } catch (e) {
      if (e.clearsky || e.stripeType !== 'StripeCardError') throw e;
      var failed = e.raw && e.raw.payment_intent;
      out.charge = { paymentIntentId: idOf(failed), status: 'failed', code: e.code || (e.raw && e.raw.decline_code) || 'card_declined' };
    }
    return out;
  }
  /* A payment counts when it belongs to this record (metadata), is in this
     mode, in dollars and succeeded. Sessions still unattached (a return or
     an event that never came) are looked up too, so a lost webhook costs a
     delay, never a payment. */
  async function reconcile(record) {
    guard(book); var s = client(supplied), st = record.stripe || {};
    if (record.provider !== 'stripe' || !record.stripeRef || !st.customerId || !st.org) fail('Not a Stripe record');
    var ids = (st.paymentIntents || []).slice();
    var sessions = (st.sessions || []).slice(-10);
    for (var i = 0; i < sessions.length; i++) {
      var cs = await call(function () { return s.checkout.sessions.retrieve(sessions[i]); });
      if (!cs || !ours(cs.metadata, st.org, null, record.stripeRef)) fail('Checkout session does not belong to this invoice; accounting review required');
      var paid = cs.status === 'complete' && cs.payment_status === 'paid' && idOf(cs.payment_intent);
      if (paid && ids.indexOf(paid) < 0) ids.push(paid);
    }
    if (ids.length > 20) fail('Too many payments on one invoice; accounting review required');
    var received = 0, back = 0, succeeded = 0, lost = false, open = false;
    for (var j = 0; j < ids.length; j++) {
      var pi = await call(function () { return s.paymentIntents.retrieve(ids[j], { expand: ['latest_charge'] }); });
      if (!pi || !ours(pi.metadata, st.org, null, record.stripeRef)) fail('A payment does not belong to this invoice; accounting review required');
      if (idOf(pi.customer) !== st.customerId) fail('Payment customer mismatch; accounting review required');
      if (!Mode.stripeModeOk(pi.livemode)) fail('A payment from the other Stripe mode; accounting review required');
      if (pi.status !== 'succeeded') continue;
      if (String(pi.currency).toLowerCase() !== 'usd') fail('Payment currency changed; accounting review required');
      succeeded++; received += pi.amount_received || 0;
      var ch = pi.latest_charge && typeof pi.latest_charge === 'object' ? pi.latest_charge : null;
      if (ch) {
        back += ch.amount_refunded || 0;
        if (ch.disputed) {
          var disputes = await call(function () { return s.disputes.list({ payment_intent: pi.id, limit: 10 }); });
          (disputes && disputes.data || []).forEach(function (d) { if (d.status === 'lost') { lost = true; back += d.amount || 0; } else if (d.status !== 'won') open = true; });
        }
      }
    }
    var net = Math.max(0, received - Math.min(back, received));
    /* reversed: everything went back, or a lost dispute took the net below
       the total (a lost dispute on a DUPLICATE payment leaves one full
       payment standing: still paid) */
    var reversed = succeeded > 0 && (net === 0 || (lost && net < record.totalCents));
    /* a partial refund is a concession somebody decided: the invoice stays
       paid (the net is reported); paying twice is money to give back, and
       once it is given back the note goes */
    var satisfied = !reversed && received >= record.totalCents;
    return { satisfied: satisfied, reversed: reversed, paidCents: net, payUrl: record.paymentLink || null,
      review: net > record.totalCents ? 'paid more than once: refund the difference' : open ? 'a dispute is open' : null };
  }
  return { customer: customer, invoice: invoice, reconcile: reconcile, guard: function () { return guard(book); } };
}

/* ── the pay link, visited: the record's open Checkout, or the next one ── */
async function load(db, org, recordId) {
  var root = db.doc('omega_orgs/' + org), current = root.collection('billing').doc('current'), ref = current.collection('invoices').doc(recordId);
  var rows = await Promise.all([root.get(), current.get(), ref.get()]);
  if (!rows[0].exists || !rows[2].exists) fail('This invoice was not found', 404);
  var record = rows[2].data(), billing = rows[1].exists ? rows[1].data() : {};
  if (record.provider !== 'stripe' || !record.stripeRef || !record.stripe) fail('This invoice is not paid by card', 409);
  return { root: root, current: current, ref: ref, org: rows[0].data(), billing: billing, record: record };
}
function done(org, what) { return 'https://' + homeOf(org) + '/workspace?checkout=' + what + '#billing'; }
/* The engine's own switch (package-billing.guard: the billing flag, the
   mode, an enabled book, a marked sandbox tenant) holds for a mailed pay
   link too: turning packaged billing off stops cards being taken. */
async function engineOpen(db, org) {
  var S = require('./package-billing');
  try { S.guard(await S.context(db, org)); } catch (e) { fail('Card payments are paused for this workspace right now; nothing was charged', 503, { clearsky: true }); }
}
/* ClearSky's inbox, once per id: a card payment a person has to look at. */
async function reviewAlert(db, org, id, text) {
  try {
    var ref = db.doc('omega_orgs/clearsky-usa.com/notifications/billing-review-' + id);
    await db.runTransaction(async function (tx) {
      var old = await tx.get(ref); if (old.exists) return;
      tx.set(ref, { kind: 'billing-review', read: false, createdAt: Date.now(), orgId: org, staffMail: 'billingAlert', mailState: 'pending', text: String(text).slice(0, 600) });
    });
  } catch (e) { console.error('[stripe-billing] review alert not written:', e && e.message); }
}
var LIVE_PI = ['succeeded', 'processing', 'requires_capture'];
async function checkout(db, org, recordId, now, supplied) {
  var x = await load(db, org, recordId), r = x.record, st = r.stripe;
  if (r.state === 'paid') return { url: done(x.org, 'done'), paid: true };
  if (r.state !== 'unpaid') fail(r.state === 'cancelled' ? 'This change was cancelled' : r.state === 'expired' ? 'This invoice expired at the end of its cycle' : 'This invoice cannot be paid now', 409);
  if (!x.billing.stripe || x.billing.stripe.customerId !== st.customerId || x.billing.stripe.env !== Mode.env()) fail('This workspace\'s card billing changed; ask ClearSky', 409);
  await engineOpen(db, org);
  guard(null); var s = client(supplied);
  /* a charge already on this invoice (the card on file, charged a moment
     ago; a checkout just paid): settle it and never offer a second payment */
  var prior = st.paymentIntents || [];
  for (var i = 0; i < prior.length; i++) {
    var had = await call(function () { return s.paymentIntents.retrieve(prior[i]); });
    if (had && LIVE_PI.indexOf(had.status) >= 0) {
      try { await settle(db, org, recordId, now, supplied); } catch (e) { console.warn('[stripe-billing] settle before checkout:', e && e.message); }
      if ((await x.ref.get()).data().state === 'paid') return { url: done(x.org, 'done'), paid: true };
      fail('This invoice was already charged to your card; it shows as paid within a few minutes', 409);
    }
  }
  var open = st.openSession;
  if (open && open.id) {
    var cur = await call(function () { return s.checkout.sessions.retrieve(open.id); });
    if (cur && cur.status === 'complete') return returned(db, org, recordId, cur.id, now, supplied);
    if (cur && cur.status === 'open' && cur.url && ours(cur.metadata, org, recordId, r.stripeRef) && open.expiresAt > now + 5 * 60000) return { url: cur.url };
    /* about to lapse: close it before opening the next, so one invoice never has two payable checkouts */
    if (cur && cur.status === 'open') { try { await call(function () { return s.checkout.sessions.expire(open.id); }); } catch (e) { console.warn('[stripe-billing] old checkout not closed:', e && e.message); } }
  }
  var host = homeOf(x.org), n = (st.sessionCount || 0) + 1;
  var session = await call(function () {
    return s.checkout.sessions.create({ mode: 'payment', customer: st.customerId, client_reference_id: org.slice(0, 200),
      line_items: lineItems(r), payment_method_types: ['card'],
      payment_intent_data: { setup_future_usage: 'off_session', description: String(r.marker || '').slice(0, 1000), metadata: meta(org, recordId, r.stripeRef) },
      metadata: meta(org, recordId, r.stripeRef),
      success_url: payLink(host, org, recordId) + '&cs={CHECKOUT_SESSION_ID}', cancel_url: done(x.org, 'cancelled'),
      custom_text: { submit: { message: CONSENT } } },
      { idempotencyKey: key('omega-package-checkout:' + r.stripeRef + ':' + n) });
  });
  if (!session || !session.id || !session.url) fail('Stripe did not open a checkout', 502, { clearsky: true });
  var moved = await db.runTransaction(async function (tx) {
    var fresh = (await tx.get(x.ref)).data(), fst = fresh.stripe || {};
    /* cancelled or paid while the session was being made: never hand it out */
    if (fresh.state !== 'unpaid') return fresh.state;
    var list = (fst.sessions || []).filter(function (id) { return id !== session.id; }).concat([session.id]).slice(-10);
    tx.update(x.ref, { 'stripe.sessions': list, 'stripe.sessionCount': Math.max(fst.sessionCount || 0, n),
      'stripe.openSession': { id: session.id, url: session.url, expiresAt: (session.expires_at || 0) * 1000 || now + 23 * 3600000 } });
    return null;
  });
  if (moved) {
    try { await call(function () { return s.checkout.sessions.expire(session.id); }); } catch (e) { console.warn('[stripe-billing] checkout not closed:', e && e.message); }
    if (moved === 'paid') return { url: done(x.org, 'done'), paid: true };
    fail(moved === 'cancelled' ? 'This change was cancelled' : 'This invoice cannot be paid now', 409);
  }
  return { url: session.url };
}
/* Attach a Stripe payment to its record (idempotent), then settle that record. */
async function attach(db, x, piId, sessionId, now) {
  await db.runTransaction(async function (tx) {
    var fresh = (await tx.get(x.ref)).data(), fst = fresh.stripe || {};
    var pis = (fst.paymentIntents || []).slice(), sessions = (fst.sessions || []).slice();
    if (piId && pis.indexOf(piId) < 0) pis.push(piId);
    if (sessionId && sessions.indexOf(sessionId) < 0) sessions.push(sessionId);
    var patch = { 'stripe.paymentIntents': pis.slice(-20), 'stripe.sessions': sessions.slice(-10), 'stripe.lastReturnAt': now || Date.now() };
    if (fst.openSession && fst.openSession.id === sessionId) patch['stripe.openSession'] = null;
    tx.update(x.ref, patch);
  });
}
/* The card that paid becomes the card on file (what renewals and confirmed
   additions are charged to) when there is none yet, or when the one on file
   was just declined for this invoice. A pay link is public (it is mailed),
   so paying one never replaces a working card on file. billing/current is
   readable by any signed-in account at the domain: it keeps the brand and
   the last four digits only, never the expiry. */
async function keepCard(db, x, pi, s) {
  var pm = pi && pi.payment_method && typeof pi.payment_method === 'object' ? pi.payment_method : null, pmId = idOf(pi && pi.payment_method);
  if (!pmId) return;
  var cus = await call(function () { return s.customers.retrieve(x.record.stripe.customerId); });
  var onFile = idOf(cus && cus.invoice_settings && cus.invoice_settings.default_payment_method);
  var declined = x.record.stripe && x.record.stripe.lastCharge && x.record.stripe.lastCharge.status === 'failed';
  if (onFile && onFile !== pmId && !declined) return;
  if (onFile !== pmId) await call(function () { return s.customers.update(x.record.stripe.customerId, { invoice_settings: { default_payment_method: pmId } }, { idempotencyKey: key('omega-package-default-card:' + x.record.stripe.customerId + ':' + pmId) }); });
  var card = pm && pm.card ? { brand: pm.card.brand || null, last4: pm.card.last4 || null } : null;
  await x.current.update({ 'stripe.cardOnFile': true, 'stripe.card': card, 'stripe.cardSavedAt': Date.now() });
}
async function settle(db, org, recordId, now, supplied) {
  var S = require('./package-billing'), out;
  /* reconcile throws only when the engine refuses to run (its guard): that is ClearSky's to fix, so a caller retries */
  try { out = await S.reconcile(db, org, now, supplied ? { stripe: supplied } : undefined, { only: recordId }); } catch (e) { e.clearsky = true; throw e; }
  try { var Runner = require('./package-billing-runner'), mailer = require('./mail'); await Runner.deliver(db, org, now, mailer); await Runner.staffDeliver(db, now, mailer); } catch (e) { console.warn('[stripe-billing] mail after settle:', e && e.message); }
  return (out.invoices || [])[0] || null;
}
/* Checkout's success_url: the session is re-read from Stripe; nothing in the URL is trusted beyond which record to look at. */
async function returned(db, org, recordId, sessionId, now, supplied) {
  if (typeof sessionId !== 'string' || !/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId)) fail('Invalid checkout session', 400);
  var x = await load(db, org, recordId); guard(null);
  var st = x.record.stripe || {};
  var s = client(supplied), cs = await call(function () { return s.checkout.sessions.retrieve(sessionId, { expand: ['payment_intent', 'payment_intent.payment_method'] }); });
  if (!cs || !ours(cs.metadata, org, recordId, x.record.stripeRef) || idOf(cs.customer) !== x.record.stripe.customerId || !Mode.stripeModeOk(cs.livemode)) fail('This checkout does not belong to this invoice', 403);
  if (cs.status !== 'complete' || cs.payment_status !== 'paid') return { url: done(x.org, cs.status === 'expired' ? 'cancelled' : 'pending') };
  var pi = cs.payment_intent && typeof cs.payment_intent === 'object' ? cs.payment_intent : await call(function () { return s.paymentIntents.retrieve(idOf(cs.payment_intent), { expand: ['payment_method'] }); });
  /* THIS payment already applied (the payer's return and Stripe's event
     both land here, a reload, a loop on the URL): nothing more to do. A
     different payment — paid twice — is always attached, never skipped. */
  var known = (st.paymentIntents || []).indexOf(idOf(pi)) >= 0;
  if (known && x.record.state === 'paid') return { url: done(x.org, 'done'), paid: true };
  if (known && st.lastReturnAt && now - st.lastReturnAt < 8000) return { url: done(x.org, 'pending'), paid: true };
  await attach(db, x, idOf(pi), cs.id, now);
  try { await keepCard(db, x, pi, s); } catch (e) { console.warn('[stripe-billing] card on file not saved:', e && e.message); }
  /* the money is taken: the payer is never shown an error from here on;
     what did not settle is finished by the webhook or the runner, and a
     person hears about anything they cannot finish */
  try { await settle(db, org, recordId, now, supplied); }
  catch (e) {
    if (!e.clearsky) await reviewAlert(db, org, 'stripe-' + cs.id, 'A card payment for ' + org + ' (invoice record ' + recordId + ') was taken but not applied: ' + e.message + '. Access is unchanged until you decide.');
    return { url: done(x.org, 'pending'), paid: true };
  }
  var after = (await x.ref.get()).data();
  return { url: done(x.org, after.state === 'paid' ? 'done' : 'pending'), paid: true };
}
/* Stripe's event → the same path. Returns null for anything that is not a
   packaged-billing object, so the endpoint answers 200 and Stripe stops. */
var EVENTS = /^(checkout\.session\.(completed|expired)|payment_intent\.(succeeded|payment_failed|canceled)|charge\.(refunded|dispute\.(created|closed|funds_withdrawn|funds_reinstated)))$/;
async function webhook(db, evt, now, supplied) {
  if (!evt || !EVENTS.test(evt.type || '') || !evt.data || !evt.data.object) return null;
  var obj = evt.data.object, m = obj.metadata || null, s = null;
  if (/^charge\./.test(evt.type)) {
    var piId = idOf(obj.payment_intent); if (!piId) return null;
    if (!Mode.open() || !Mode.stripeKey()) return { ignored: 'packaging is off in this mode' };
    s = client(supplied);
    var owner = await call(function () { return s.paymentIntents.retrieve(piId); });
    m = owner && owner.metadata;
  }
  if (!m || m.kind !== KIND) return null;
  if (!Mode.stripeModeOk(evt.livemode) || m.env !== Mode.env()) return { ignored: 'another Stripe mode' };
  var org = require('./admin').safeOrg(m.org), recordId = m.record;
  if (!org || !validRecordId(recordId)) return { ignored: 'no workspace record' };
  var eref = db.doc('stripe_events/' + evt.id), attempts = 0;
  var claim = await db.runTransaction(async function (tx) {
    var old = await tx.get(eref), o = old.exists ? old.data() : null;
    if (o && o.state === 'done') return 'duplicate';
    if (o && o.state === 'processing' && o.at > now - 120000) return 'busy';
    attempts = ((o && o.attempts) || 0) + 1;
    tx.set(eref, { kind: KIND, type: evt.type, org: org, record: recordId, state: 'processing', at: now, attempts: attempts });
    return 'claimed';
  });
  if (claim === 'duplicate') return { duplicate: true };
  if (claim === 'busy') fail('Event is being processed', 503, { clearsky: true });
  try {
    var x = await load(db, org, recordId), result;
    if (evt.type === 'checkout.session.completed') result = await returned(db, org, recordId, obj.id, now, supplied);
    else {
      if (evt.type === 'payment_intent.succeeded') {
        s = s || client(supplied);
        var pi = await call(function () { return s.paymentIntents.retrieve(obj.id, { expand: ['payment_method'] }); });
        if (!ours(pi.metadata, org, recordId, x.record.stripeRef) || idOf(pi.customer) !== x.record.stripe.customerId) fail('The payment does not belong to this invoice', 409);
        await attach(db, x, pi.id, null, now);
        try { await keepCard(db, x, pi, s); } catch (e) { console.warn('[stripe-billing] card on file not saved:', e && e.message); }
      }
      result = await settle(db, org, recordId, now, supplied);
    }
    /* Stripe says the money arrived but the record did not move (a
       transient failure inside reconcile): answer 500 so Stripe comes back */
    if (/succeeded|completed/.test(evt.type)) {
      var after = (await x.ref.get()).data();
      if (after.state !== 'paid' && !after.reviewRequired) fail('The payment is not settled yet; Stripe will retry', 503, { clearsky: true });
    }
    await eref.set({ state: 'done', doneAt: Date.now() }, { merge: true });
    return { applied: true, org: org, record: recordId, state: result && (result.state || (result.paid ? 'paid' : null)) || null };
  } catch (e) {
    await eref.set({ state: 'failed', error: String(e && e.message || e).slice(0, 300), failedAt: Date.now() }, { merge: true });
    /* money that arrived and could not be applied is never acknowledged in
       silence: Stripe is asked to come back a few times (its invoice record
       may not be written yet), then a person is told */
    if (/succeeded|completed/.test(evt.type) && !e.clearsky) {
      /* only a record not written yet is worth waiting for; anything else a person sees now */
      if (e.status === 404 && attempts < 5) { e.clearsky = true; e.status = 503; }
      else await reviewAlert(db, org, 'stripe-' + evt.id, 'A card payment for ' + org + ' (' + evt.type + ', invoice record ' + recordId + ') could not be applied: ' + e.message + '. Look it up in Stripe; access is unchanged until you decide.');
    }
    throw e;
  }
}
/* A cancelled change's open Checkout is closed, so it cannot be paid after
   the tenant said no (a payment that still lands is honoured and reviewed). */
async function close(record, supplied) {
  var open = record && record.stripe && record.stripe.openSession;
  if (!open || !open.id || !Mode.stripeKey()) return false;
  var s = client(supplied), cur = await call(function () { return s.checkout.sessions.retrieve(open.id); });
  if (!cur || cur.status !== 'open') return false;
  await call(function () { return s.checkout.sessions.expire(open.id); });
  return true;
}
module.exports = { KIND: KIND, driver: driver, close: close, reviewAlert: reviewAlert, engineOpen: engineOpen, key: key, refOf: refOf, payLink: payLink, verifyLink: verifyLink, safePayLink: safePayLink, homeOf: homeOf,
  lineItems: lineItems, checkout: checkout, returned: returned, settle: settle, webhook: webhook, wrap: wrap, validRecordId: validRecordId };
