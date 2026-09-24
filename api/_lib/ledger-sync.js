/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/ledger-sync.js — a workspace's OWN books: QuickBooks or Stripe
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   For a TENANT-BILLED workspace (fulfillment/config.accounting === 'tenant':
   the OEM invoices on its own paper) the office can ask Omega Logic to keep
   its own books in step — its own QuickBooks company, or its own Stripe
   account through Stripe Connect. This module is the only code that talks
   to either on a workspace's behalf. It is NOT ClearSky's QuickBooks
   (integrations/quickbooks, qbo-sales.js, logic-connect.js), and it never
   reaches that company: ledger-connect refuses ClearSky's realm and every
   QuickBooks call here goes through qbo.js WITH an org.

   ── WHAT IT MAY WRITE ──
   Only its own documents under integrations/** (Admin SDK only in
   firestore.rules): the workspace's QuickBooks tokens, its connected Stripe
   account id, customer mappings, invoice reverse indexes, one-time OAuth
   states, webhook dedupe records, and an omega_audit row when a company is
   connected. It NEVER writes an order. It returns what the provider says
   (PushResult, payment items) and api/_lib/logic-workflow.js — the one
   writer of order money — applies it through the same rules the office
   uses (api/_lib/receivables.js). The Stripe webhook (api/ledger-webhook.js)
   is a HINT that makes the workflow re-read Stripe through this module.

   ── WHAT NEVER LEAVES THE SERVER ──
   Tokens, secrets, keys and OAuth codes. status() returns env var NAMES
   that are missing and whether a company is connected; a test asserts no
   secret appears in any return value. Stripe Connect OAuth (Standard) hands
   back tokens too — they are dropped on receipt: the platform key plus the
   connected account id (Stripe-Account header) is all a call needs, so no
   Stripe token is stored anywhere.

   ── REFERENCES ──
   A payment read back from a provider is recorded with bankReference
   'qbo:<PaymentId>' or 'stripe:<chargeId | paymentIntentId | invoiceId>'.
   receivables.js reserves those prefixes for the sync, so an office typo
   can never impersonate a provider payment, and a provider payment the
   office voided is reported as a conflict, never re-received.

   Design and what is not built: docs/ACCOUNTING.md.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var A = require('./admin'), Q = require('./qbo'), P = require('./logic-policy'), R = require('./receivables');
var crypto = require('crypto');

var PROVIDERS = ['quickbooks', 'stripe'];
var STATE_COOKIE = 'omega_ledger_state';
/* The order is the order status() reports them in, and the order a person
   sets them in: app credentials, then the redirect registered with the app. */
var QB_VARS = ['QBO_CLIENT_ID', 'QBO_CLIENT_SECRET', 'QBO_WORKSPACE_REDIRECT_URI'];
var ST_VARS = ['STRIPE_SECRET_KEY', 'STRIPE_CONNECT_CLIENT_ID', 'STRIPE_CONNECT_REDIRECT_URI', 'STRIPE_CONNECT_WEBHOOK_SECRET'];
var QB_ROOT = 'integrations/quickbooks_workspaces/orgs';
var ST_ROOT = 'integrations/stripe_connect';
var STATES = 'integrations/ledger_oauth/states';
var STRIPE_API = 'https://api.stripe.com/v1';
var STRIPE_CONNECT = 'https://connect.stripe.com';
/* Pinned: the invoice's `charge` and `payment_intent` fields that pull
   reads exist in this version (later versions moved them). */
var STRIPE_VERSION = '2024-06-20';
/* Stripe amounts are at most eight digits (USD 999,999.99) per line; an
   installment above that is split into parts on one invoice. */
var STRIPE_MAX_LINE = 99999999;
var OPEN_DISPUTE = ['warning_needs_response', 'warning_under_review', 'needs_response', 'under_review'];
var NAME = { quickbooks: 'QuickBooks', stripe: 'Stripe' };

/* ── small helpers ──────────────────────────────────────────────────────── */
function db() { return A.db(); }
function nowIso() { return new Date().toISOString(); }
function today() { return new Date().toISOString().slice(0, 10); }
function fail(status, message) { return A.httpError(status, message); }
function orgOf(org) { var s = A.safeOrg(org); if (!s) throw fail(400, 'Valid org required'); return s; }
function missingOf(vars) { return vars.filter(function (k) { return !process.env[k]; }); }
function requireConfigured(vars) {
  var m = missingOf(vars);
  if (m.length) throw fail(503, 'Missing on this deployment: ' + m.join(', '));
}
function hostOf(u) { try { return u ? new URL(u).host : null; } catch (e) { return null; } }
function usd(c) { return (Number(c || 0) / 100).toFixed(2); }
function money(v) { var n = Number(v); return v == null || v === '' || !isFinite(n) ? NaN : Math.round(n * 100); }
function iso(v) { if (v == null) return null; var d = new Date(typeof v === 'number' ? v : String(v)); return isNaN(d) ? null : d.toISOString(); }
function idOf(v) { return typeof v === 'string' ? v : (v && v.id) || null; }
function sameRef(a, b) { return R.refKey(a) === R.refKey(b); }
/* The customer's name as the books will show it: the customer ACCOUNT
   (company) first, the way qbo-sales keys ClearSky's customers. QuickBooks
   refuses a colon (it separates sub-customers) and control characters. */
function displayName(view) {
  var a = view.account || {}, c = view.customer || {};
  var s = String(a.name || c.company || c.name || c.email || 'Customer')
    .replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/:/g, '-').replace(/\s+/g, ' ').trim();
  return (s || 'Customer').slice(0, 100);
}
function stageWord(stage) { return stage === 'deposit' ? 'Deposit' : 'Balance'; }
/* Every ACTIVE payment this provider recorded that the provider no longer
   shows is a reversal (deleted or voided in QuickBooks, gone in Stripe). */
function addVanished(items, payments, source) {
  var seen = {};
  items.forEach(function (i) { seen[R.refKey(i.ref)] = true; });
  (payments || []).forEach(function (p) {
    if (!p || p.voidedAt || (p.source || 'office') !== source || seen[R.refKey(p.bankReference)]) return;
    items.push({ ref: p.bankReference, amountCents: p.amountCents, date: p.date, reversed: true, external: p.external || null });
  });
  return items;
}

/* One-time OAuth state, shared by both providers. The callback trusts the
   provider and org ONLY from this document, never from its query string. */
async function newState(provider, org, caller) {
  var state = crypto.randomBytes(32).toString('hex');
  await db().doc(STATES + '/' + state).create({ provider: provider, orgId: org, uid: (caller && caller.uid) || null,
    email: (caller && caller.email) || null, createdAt: nowIso(), expiresAt: Date.now() + 600000, used: false });
  return state;
}
function stateCookie(state) { return STATE_COOKIE + '=' + state + '; Path=/api/ledger-connect; HttpOnly; Secure; SameSite=Lax; Max-Age=600'; }

/* ═══ QuickBooks — the workspace's own company ════════════════════════════ */
function qbDoc(org) { return db().doc(QB_ROOT + '/' + orgOf(org)); }
async function qbLoad(org) { var s = await qbDoc(org).get(); return s.exists ? s.data() : null; }
function qbExpired(d) { return !!(d && d.refreshExpiresAt && Date.now() > d.refreshExpiresAt); }
/* Connected = a refresh token we can still use, in this deployment's Intuit
   environment. An expired or other-environment token is "not connected", so
   the page offers Connect again instead of a sync that can only fail. */
function qbLive(d) { return !!(d && d.refreshToken && !d.disconnectedAt && d.env === Q.ENV && !qbExpired(d)); }
async function qbReady(org) {
  requireConfigured(QB_VARS);
  var d = await qbLoad(org);
  if (!qbLive(d)) throw fail(409, 'Connect QuickBooks for this workspace first');
  return d;
}
function qbq(s) { return "'" + String(s).replace(/'/g, "\\'") + "'"; }
function qbInvoices(org) { return qbDoc(org).collection('invoices'); }

/* The QuickBooks customer is the customer ACCOUNT. A mapping is kept per
   account and realm; otherwise an existing customer with exactly that
   display name is adopted (the workspace's books may already hold it), and
   only then is one created — with a stable request id, so a retry is the
   same customer. A name QuickBooks already uses elsewhere (6240, e.g. a
   vendor) gets a short, stable suffix. */
async function qbCustomer(org, realm, view) {
  var key = String((view.account || {}).key || ''), mref = qbDoc(org).collection('customers').doc(P.key(key));
  var m = await mref.get();
  if (m.exists && String(m.data().realmId) === String(realm) && m.data().qboCustomerId) return String(m.data().qboCustomerId);
  var name = displayName(view), shown = name, matched = false, id;
  var q = await Q.request(org, 'query?query=' + encodeURIComponent('select * from Customer where DisplayName = ' + qbq(name)));
  var found = (q.QueryResponse || {}).Customer || [];
  if (found.length === 1) { id = String(found[0].Id); matched = true; }
  else {
    var make = function (display, suffix) {
      var body = { DisplayName: display, CompanyName: display.slice(0, 100) };
      if ((view.customer || {}).email) body.PrimaryEmailAddr = { Address: String(view.customer.email) };
      return Q.request(org, 'customer', body, P.key('ws-customer:' + org + ':' + realm + ':' + key + suffix))
        .then(function (r) { return String(r.Customer.Id); });
    };
    try { id = await make(name, ''); }
    catch (e) {
      if (String(e.code) !== '6240') throw e;
      shown = name.slice(0, 91) + ' (' + P.key(key).slice(0, 6) + ')';
      id = await make(shown, ':2');
    }
  }
  await mref.set({ accountKey: key, realmId: String(realm), qboCustomerId: id, displayName: shown, matchedExisting: matched, createdAt: nowIso() });
  return id;
}

/* What an invoice in QuickBooks looks like to the workflow. The pay link is
   Intuit's own (P.paymentLink accepts only intuit.com). */
async function qbResult(org, realm, id, amountCents, customerId) {
  var got = (await Q.request(org, 'invoice/' + encodeURIComponent(id) + '?include=invoiceLink')).Invoice || {};
  var total = money(got.TotalAmt);
  return { provider: 'quickbooks', invoiceId: String(got.Id || id), number: got.DocNumber ? String(got.DocNumber) : null,
    customerId: String((got.CustomerRef || {}).value || customerId || '') || null, company: String(realm),
    hostedUrl: P.paymentLink(got.InvoiceLink || got.invoiceLink) || null, totalCents: isNaN(total) ? null : total,
    warning: total !== amountCents ? 'QuickBooks total USD ' + usd(total) + ' differs from USD ' + usd(amountCents) + ' — check the item\'s tax treatment' : null };
}
/* Reverse index: which order a workspace QuickBooks invoice belongs to, so
   one QuickBooks invoice can never be linked to two orders (its payments
   would count twice) and a push that died after Intuit committed resumes.
   Keyed by COMPANY and id (`<realmId>_<invoiceId>`): QuickBooks numbers
   invoices per company, so after a workspace moves to another company its
   invoice 145 is not the old company's 145. The old company's entries stay
   as the history of the orders pushed there. A document written under the
   bare id (before the key carried the company) is honoured only in its own
   company. */
function qbIndexRef(org, realm, id) { return qbInvoices(org).doc(String(realm) + '_' + String(id)); }
async function qbIndex(org, realm, id, view, stage) {
  var ref = qbIndexRef(org, realm, id), s = await ref.get(), hit = s.exists ? s.data() : null;
  if (!hit) {
    var legacy = await qbInvoices(org).doc(String(id)).get();
    if (legacy.exists && String(legacy.data().realmId) === String(realm)) hit = legacy.data();
  }
  if (hit && (hit.orderId !== view.id || hit.stage !== stage)) {
    throw fail(409, 'QuickBooks invoice ' + id + ' is already linked to another order (' + (hit.orderNo || hit.orderId) + ', ' + hit.stage + ')');
  }
  if (!s.exists) await ref.set({ orderId: view.id, orderNo: view.orderNo || null, stage: stage, number: view.invoice.number || null, realmId: String(realm), invoiceId: String(id), createdAt: nowIso() });
}

var quickbooks = {
  missing: function () { return missingOf(QB_VARS); },
  ready: async function (org) {
    if (quickbooks.missing().length) return false;
    return qbLive(await qbLoad(org));
  },
  status: async function (org) {
    var m = quickbooks.missing(), d = await qbLoad(org), on = qbLive(d), why = (d && d.lastError) || null;
    if (!why && d && d.refreshToken && !d.disconnectedAt) {
      if (d.env !== Q.ENV) why = 'QuickBooks environment changed; reconnect';
      else if (qbExpired(d)) why = 'QuickBooks refresh token expired — reconnect from the accounting page';
    }
    return { configured: !m.length, missing: m, env: Q.ENV, connectHost: hostOf(process.env.QBO_WORKSPACE_REDIRECT_URI), connected: on,
      realmId: on ? String(d.realmId || '') || null : null, companyName: on ? d.companyName || null : null,
      connectedAt: on ? iso(d.connectedAt) : null, connectedBy: on ? d.connectedBy || null : null,
      refreshExpiresAt: on ? iso(d.refreshExpiresAt) : null, lastError: why };
  },
  connectUrl: async function (org, caller) {
    org = orgOf(org); requireConfigured(QB_VARS);
    var d = await qbLoad(org);
    if (qbLive(d)) throw fail(409, 'Already connected to QuickBooks company ' + d.realmId + '; disconnect it first');
    var state = await newState('quickbooks', org, caller);
    return { url: Q.authorizeUrl(state, org), setCookie: stateCookie(state) };
  },
  /* Revoke at Intuit (best effort), then forget the tokens and keep the
     record: the realm stays, so an invoice pushed to that company still
     says which company it is in. Never deleted. */
  disconnect: async function (org, caller) {
    org = orgOf(org);
    var d = await qbLoad(org);
    if (!d || d.disconnectedAt) return { ok: true };
    await Q.revoke(org);
    await qbDoc(org).update({ accessToken: null, refreshToken: null, expiresAt: 0, disconnectedAt: nowIso(), disconnectedBy: (caller && caller.email) || null });
    return { ok: true };
  },
  pushInvoice: async function (org, view, stage) {
    org = orgOf(org);
    var d = await qbReady(org), realm = String(d.realmId), s = (view.ledgerSync || {}).quickbooks || {}, inv = view.invoice || {};
    if (!/^\d{1,20}$/.test(String(s.itemRef || '')) || s.approved !== true) {
      throw fail(409, 'Choose and approve the QuickBooks item for installment invoices on the accounting page first');
    }
    if (!inv.number) throw fail(409, 'Record the ' + stage + ' invoice as issued first');
    var number = String(inv.number), po = view.poNumber || null;
    /* resume: an invoice this order already has in THIS company (a push
       that died after Intuit committed, then retried) is returned, not
       made twice. A voided one (total 0) is left alone. */
    var prior = (await qbInvoices(org).where('orderId', '==', view.id).where('stage', '==', stage).get()).docs
      .filter(function (x) { return String(x.data().realmId) === realm; });
    for (var i = 0; i < prior.length; i++) {
      var old, qid = String(prior[i].data().invoiceId || prior[i].id);   /* a bare-id document is its own id */
      try { old = (await Q.request(org, 'invoice/' + encodeURIComponent(qid))).Invoice || {}; }
      catch (e) { if (String(e.code) === '610') continue; throw e; }   /* 610: deleted in QuickBooks */
      if (money(old.TotalAmt) > 0) return qbResult(org, realm, qid, inv.amountCents, (old.CustomerRef || {}).value);
    }
    var customerId = await qbCustomer(org, realm, view), amount = inv.amountCents / 100;
    var memo = stageWord(stage) + ' — ' + (po ? 'PO ' + po + ' — ' : '') + 'Invoice ' + number;
    var body = { CustomerRef: { value: customerId }, CurrencyRef: { value: 'USD' },
      AllowOnlineACHPayment: true, AllowOnlineCreditCardPayment: true,
      PrivateNote: 'OMEGA ' + org + ' / ' + (view.orderNo || view.id) + ' / ' + stage + ' / ' + number,
      CustomerMemo: { value: memo.slice(0, 1000) },
      Line: [{ Amount: amount, Description: memo.slice(0, 4000), DetailType: 'SalesItemLineDetail',
        SalesItemLineDetail: { ItemRef: { value: String(s.itemRef) }, Qty: 1, UnitPrice: amount, TaxCodeRef: { value: s.taxCodeRef || 'NON' } } }] };
    if (number.length <= 21) body.DocNumber = number;   /* QuickBooks' DocNumber limit; the memo always carries it */
    if (inv.issuedAt) body.TxnDate = inv.issuedAt;
    if (inv.dueAt) body.DueDate = inv.dueAt;
    if ((view.customer || {}).email) body.BillEmail = { Address: String(view.customer.email) };
    var made = await Q.request(org, 'invoice', body, P.key('ws-invoice:' + org + ':' + view.id + ':' + stage + ':' + number));
    var id = String(made.Invoice.Id);
    await qbIndex(org, realm, id, view, stage);
    return qbResult(org, realm, id, inv.amountCents, customerId);
  },
  /* Adopt an invoice the workspace already made in its QuickBooks (the
     Amperage deposit was issued before a provider was chosen): only when
     currency and amount match, and never one already linked elsewhere. */
  linkInvoice: async function (org, view, stage, providerInvoiceId) {
    org = orgOf(org);
    var d = await qbReady(org), realm = String(d.realmId), id = String(providerInvoiceId || ''), inv = view.invoice || {};
    if (!/^\d{1,20}$/.test(id)) throw fail(400, 'QuickBooks invoice id must be digits');
    var got = (await Q.request(org, 'invoice/' + encodeURIComponent(id) + '?include=invoiceLink')).Invoice || {};
    var cur = (got.CurrencyRef || {}).value || 'USD', total = money(got.TotalAmt);
    if (cur !== 'USD' || total !== inv.amountCents) {
      throw fail(409, 'QuickBooks invoice ' + id + ' is ' + cur + ' ' + usd(total) + '; this invoice is USD ' + usd(inv.amountCents));
    }
    await qbIndex(org, realm, id, view, stage);
    var customerId = String((got.CustomerRef || {}).value || '');
    var mref = qbDoc(org).collection('customers').doc(P.key(String((view.account || {}).key || ''))), m = await mref.get();
    if (customerId && !(m.exists && String(m.data().realmId) === realm)) {
      await mref.set({ accountKey: String((view.account || {}).key || ''), realmId: realm, qboCustomerId: customerId,
        displayName: String((got.CustomerRef || {}).name || displayName(view)).slice(0, 100), matchedExisting: true, createdAt: nowIso() });
    }
    return { provider: 'quickbooks', invoiceId: String(got.Id || id), number: got.DocNumber ? String(got.DocNumber) : null,
      customerId: customerId || null, company: realm, hostedUrl: P.paymentLink(got.InvoiceLink || got.invoiceLink) || null,
      totalCents: total, warning: null };
  },
  /* The payments QuickBooks links to this invoice, as qbo: references —
     the same proof rules P.receipt applies to ClearSky's company: the
     customer must match, USD only, and a payment line that settles this
     invoice together with another transaction is refused as ambiguous. */
  pullPayments: async function (org, view, stage) {
    org = orgOf(org);
    var d = await qbReady(org), realm = String(d.realmId), inv = view.invoice || {}, l = inv.ledger;
    if (!l || l.provider !== 'quickbooks' || !l.invoiceId) throw fail(409, 'This invoice is not in QuickBooks');
    if (l.company && String(l.company) !== realm) {
      throw fail(409, 'This invoice was pushed to QuickBooks company ' + l.company + '; the workspace is now connected to ' + realm);
    }
    var got = (await Q.request(org, 'invoice/' + encodeURIComponent(l.invoiceId))).Invoice || {};
    if (((got.CurrencyRef || {}).value || 'USD') !== 'USD' || money(got.TotalAmt) !== l.totalCents) {
      throw fail(409, 'QuickBooks invoice changed; reconcile by hand');
    }
    var ids = [];
    (got.LinkedTxn || []).forEach(function (t) { if (t.TxnType === 'Payment' && ids.indexOf(String(t.TxnId)) < 0) ids.push(String(t.TxnId)); });
    if (ids.length > 40) throw fail(409, 'Too many payment allocations; reconcile this invoice manually');
    var items = [];
    for (var i = 0; i < ids.length; i++) {
      var p = (await Q.request(org, 'payment/' + encodeURIComponent(ids[i]))).Payment || {};
      if (String((p.CustomerRef || {}).value) !== String(l.customerId)) throw fail(409, 'Payment customer mismatch');
      if (((p.CurrencyRef || {}).value || 'USD') !== 'USD') throw fail(409, 'Payment currency mismatch');
      var applied = 0;
      (p.Line || []).forEach(function (line) {
        var links = line.LinkedTxn || [];
        if (links.some(function (x) { return x.TxnType === 'Invoice' && String(x.TxnId) === String(got.Id || l.invoiceId); })) {
          if (links.length !== 1) throw fail(409, 'Ambiguous QuickBooks payment allocation');
          applied += money(line.Amount) || 0;
        }
      });
      if (applied > money(p.TotalAmt)) throw fail(409, 'Invalid QuickBooks payment allocation');
      if (applied > 0) items.push({ ref: 'qbo:' + String(p.Id || ids[i]), amountCents: applied, date: String(p.TxnDate || today()).slice(0, 10),
        reversed: false, external: { paymentId: String(p.Id || ids[i]) } });
    }
    return addVanished(items, inv.payments, 'quickbooks');
  }
};

/* ═══ Stripe — the workspace's own account, through Connect ═══════════════ */
function stDoc(org) { return db().doc(ST_ROOT + '/orgs/' + orgOf(org)); }
function stAccount(acct) { return db().doc(ST_ROOT + '/accounts/' + acct); }
function stInvoices(org) { return stDoc(org).collection('invoices'); }
async function stLoad(org) { var s = await stDoc(org).get(); return s.exists ? s.data() : null; }
function stLive(d) { return !!(d && /^acct_/.test(String(d.accountId || '')) && !d.disconnectedAt); }
async function stReady(org) {
  requireConfigured(ST_VARS);
  var d = await stLoad(org);
  if (!stLive(d)) throw fail(409, 'Connect Stripe for this workspace first');
  return d;
}
/* Stripe's form encoding: nested keys as a[b][0]=… (brackets left
   readable), null/undefined omitted, booleans as true/false. */
function pairs(obj, prefix, out) {
  Object.keys(obj).forEach(function (k) {
    var v = obj[k], key = prefix ? prefix + '[' + k + ']' : k;
    if (v === undefined || v === null) return;
    if (typeof v === 'object') return pairs(v, key, out);
    out.push(encodeURIComponent(key).replace(/%5B/g, '[').replace(/%5D/g, ']') + '=' + encodeURIComponent(String(v)));
  });
  return out;
}
function formOf(obj) { return pairs(obj || {}, '', []).join('&'); }
/* One call on a CONNECTED account: the platform key authenticates, the
   Stripe-Account header says whose books. Every POST carries an
   Idempotency-Key, so a retry after a timeout is the same object. */
async function stripeRequest(method, path, params, opts) {
  opts = opts || {};
  var key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw fail(503, 'Missing on this deployment: STRIPE_SECRET_KEY');
  var url = STRIPE_API + path, body = formOf(params);
  if (method === 'GET' && body) url += (url.indexOf('?') < 0 ? '?' : '&') + body;
  var headers = { Authorization: 'Bearer ' + key, 'Stripe-Version': STRIPE_VERSION, Accept: 'application/json' };
  if (opts.account) headers['Stripe-Account'] = opts.account;
  if (method === 'POST') {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    headers['Idempotency-Key'] = opts.idem || ('omega-' + crypto.randomBytes(16).toString('hex'));
  }
  var r = await fetch(url, { method: method, signal: AbortSignal.timeout(15000), headers: headers, body: method === 'POST' ? body : undefined });
  var j = await r.json().catch(function () { return {}; });
  if (!r.ok) {
    var e = fail(502, 'Stripe request failed (' + r.status + '): ' + String((j.error && j.error.message) || r.statusText || 'error').slice(0, 160));
    e.httpStatus = r.status; e.code = (j.error && j.error.code) || null;
    throw e;
  }
  return j;
}
/* The OAuth endpoints live on connect.stripe.com and take the platform key
   with no Stripe-Account header. */
async function stripeOAuth(path, params) {
  var r = await fetch(STRIPE_CONNECT + path, { method: 'POST', signal: AbortSignal.timeout(15000),
    headers: { Authorization: 'Bearer ' + process.env.STRIPE_SECRET_KEY, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: formOf(params) });
  var j = await r.json().catch(function () { return {}; });
  if (!r.ok) throw fail(502, 'Stripe request failed (' + r.status + '): ' + String(j.error_description || j.error || r.statusText || 'error').slice(0, 160));
  return j;
}
/* When a connected account disconnects this platform in Stripe
   (account.application.deauthorized). Returns the org it belonged to. */
async function stripeDeauthorized(acct) {
  var idx = await stAccount(acct).get();
  if (!idx.exists) return null;
  var org = A.safeOrg(idx.data().orgId), at = nowIso();
  if (!idx.data().disconnectedAt) await stAccount(acct).update({ disconnectedAt: at, disconnectedBy: 'stripe' });
  if (org) {
    var d = await stLoad(org);
    if (d && d.accountId === acct && !d.disconnectedAt) await stDoc(org).update({ disconnectedAt: at, disconnectedBy: 'stripe' });
  }
  return org || null;
}
async function stCustomer(org, acct, view) {
  var key = String((view.account || {}).key || ''), mref = stDoc(org).collection('customers').doc(P.key(key)), m = await mref.get();
  if (m.exists && m.data().accountId === acct && m.data().stripeCustomerId) return m.data().stripeCustomerId;
  var c = await stripeRequest('POST', '/customers', { name: displayName(view), email: (view.customer || {}).email || null,
    metadata: { omega_org: org, omega_account: key } }, { account: acct, idem: 'omega-cus-' + P.key(org + ':' + acct + ':' + key) });
  await mref.set({ accountKey: key, accountId: acct, stripeCustomerId: c.id, createdAt: nowIso() });
  return c.id;
}
/* An installment above Stripe's per-line maximum is split into parts;
   each part is tagged, so a resumed draft adds only the parts it lacks. */
function parts(amountCents) {
  var out = [], left = amountCents;
  while (left > 0) { var n = Math.min(left, STRIPE_MAX_LINE); out.push(n); left -= n; }
  return out;
}
async function completeDraft(org, acct, got, view, stage, customer, settings) {
  var inv = view.invoice, number = String(inv.number), chunks = parts(inv.amountCents);
  var have = {};
  ((got.lines && got.lines.data) || []).forEach(function (line) { var p = line.metadata && line.metadata.omega_part; if (p != null) have[String(p)] = true; });
  var untagged = !Object.keys(have).length && got.total > 0;   /* a draft finished by hand in Stripe: leave its lines alone */
  for (var i = 0; i < chunks.length && !untagged; i++) {
    if (have[String(i)]) continue;
    var desc = (view.orderNo || view.id) + ' — ' + stage + ' invoice ' + number + (chunks.length > 1 ? ' (part ' + (i + 1) + ' of ' + chunks.length + ')' : '');
    await stripeRequest('POST', '/invoiceitems', { customer: customer, invoice: got.id, amount: chunks[i], currency: 'usd', description: desc,
      metadata: { omega_order: view.id, omega_stage: stage, omega_part: String(i) } },
      { account: acct, idem: 'omega-ii-' + P.key(org + ':' + got.id + ':' + i) });
  }
  var fin = await stripeRequest('POST', '/invoices/' + encodeURIComponent(got.id) + '/finalize', {}, { account: acct, idem: 'omega-fin-' + P.key(org + ':' + got.id) });
  if (settings.sendEmail === true) {
    try { await stripeRequest('POST', '/invoices/' + encodeURIComponent(got.id) + '/send', {}, { account: acct, idem: 'omega-send-' + P.key(org + ':' + got.id) }); }
    catch (e) { /* best effort: the hosted page is the pay link either way */ }
  }
  return fin;
}
function stResult(acct, got, customer, amountCents, number) {
  var w = [];
  if (got.total !== amountCents) w.push('Stripe total USD ' + usd(got.total) + ' differs from USD ' + usd(amountCents));
  if (amountCents > STRIPE_MAX_LINE) w.push('Above USD 999,999.99 Stripe may refuse a single card or bank payment unless the account has a raised limit');
  var meta = (got.metadata || {}).omega_invoice;
  if (number && meta && meta !== number) w.push('The Stripe invoice carries invoice number ' + meta);
  return { provider: 'stripe', invoiceId: got.id, number: got.number || null, customerId: idOf(got.customer) || customer || null, company: acct,
    hostedUrl: /^https:\/\//.test(String(got.hosted_invoice_url || '')) ? got.hosted_invoice_url : null,
    totalCents: typeof got.total === 'number' ? got.total : null, warning: w.length ? w.join('; ').slice(0, 300) : null };
}
async function disputeOf(acct, charge) {
  if (charge.dispute && typeof charge.dispute === 'object') return charge.dispute;
  if (!charge.disputed) return null;
  var list = await stripeRequest('GET', '/disputes', { charge: charge.id, limit: 10 }, { account: acct });
  return ((list && list.data) || []).slice().sort(function (a, b) { return (b.created || 0) - (a.created || 0); })[0] || null;
}

var stripe = {
  missing: function () { return missingOf(ST_VARS); },
  ready: async function (org) {
    if (stripe.missing().length) return false;
    return stLive(await stLoad(org));
  },
  status: async function (org) {
    var m = stripe.missing(), d = await stLoad(org), on = stLive(d), why = (d && d.lastError) || null;
    if (!why && d && d.disconnectedBy === 'stripe' && d.disconnectedAt) why = 'The Stripe account disconnected Omega Logic on ' + String(d.disconnectedAt).slice(0, 10) + '; connect again to resume';
    return { configured: !m.length, missing: m, connectHost: hostOf(process.env.STRIPE_CONNECT_REDIRECT_URI), connected: on,
      accountId: on ? d.accountId : null, livemode: on ? d.livemode === true : null, connectedAt: on ? iso(d.connectedAt) : null,
      connectedBy: on ? d.connectedBy || null : null, webhook: !!process.env.STRIPE_CONNECT_WEBHOOK_SECRET, lastError: why };
  },
  connectUrl: async function (org, caller) {
    org = orgOf(org); requireConfigured(ST_VARS);
    var d = await stLoad(org);
    if (stLive(d)) throw fail(409, 'Already connected to Stripe account ' + d.accountId + '; disconnect it first');
    var state = await newState('stripe', org, caller);
    var url = STRIPE_CONNECT + '/oauth/authorize?response_type=code&client_id=' + encodeURIComponent(process.env.STRIPE_CONNECT_CLIENT_ID) +
      '&scope=read_write&state=' + state + '&redirect_uri=' + encodeURIComponent(process.env.STRIPE_CONNECT_REDIRECT_URI);
    return { url: url, setCookie: stateCookie(state) };
  },
  disconnect: async function (org, caller) {
    org = orgOf(org);
    var d = await stLoad(org);
    if (!d || !d.accountId || d.disconnectedAt) return { ok: true };
    if (process.env.STRIPE_SECRET_KEY && process.env.STRIPE_CONNECT_CLIENT_ID) {
      try { await stripeOAuth('/oauth/deauthorize', { client_id: process.env.STRIPE_CONNECT_CLIENT_ID, stripe_user_id: d.accountId }); }
      catch (e) { /* best effort: our record is what the sync reads */ }
    }
    var at = nowIso(), by = (caller && caller.email) || null;
    await stDoc(org).update({ disconnectedAt: at, disconnectedBy: by });
    var idx = await stAccount(d.accountId).get();
    if (idx.exists && idx.data().orgId === org) await stAccount(d.accountId).update({ disconnectedAt: at, disconnectedBy: by });
    return { ok: true };
  },
  /* A send_invoice invoice on the connected account, finalized, with a
     hosted page (card / ACH as the workspace chose) that becomes the pay
     link. The reverse index is written the moment Stripe returns the id,
     so the webhook can place its events and a half-made invoice resumes
     instead of being made twice. */
  pushInvoice: async function (org, view, stage) {
    org = orgOf(org);
    var d = await stReady(org), acct = d.accountId, inv = view.invoice || {}, number = String(inv.number || '');
    if (!number) throw fail(409, 'Record the ' + stage + ' invoice as issued first');
    var s = (view.ledgerSync || {}).stripe || {};
    var methods = (Array.isArray(s.paymentMethods) && s.paymentMethods.length ? s.paymentMethods : ['card', 'us_bank_account'])
      .filter(function (m) { return m === 'card' || m === 'us_bank_account'; });
    if (!methods.length) methods = ['card', 'us_bank_account'];
    var customer = await stCustomer(org, acct, view);
    var prior = (await stInvoices(org).where('orderId', '==', view.id).where('stage', '==', stage).get()).docs
      .map(function (x) { return Object.assign({ id: x.id }, x.data()); })
      .filter(function (x) { return x.accountId === acct; })
      .sort(function (a, b) { return String(b.createdAt || '').localeCompare(String(a.createdAt || '')); });
    for (var i = 0; i < prior.length; i++) {
      var got;
      try { got = await stripeRequest('GET', '/invoices/' + encodeURIComponent(prior[i].id), null, { account: acct }); }
      catch (e) { if (e.httpStatus === 404) continue; throw e; }
      if (got.status === 'void') continue;
      if (got.status === 'draft') got = await completeDraft(org, acct, got, view, stage, customer, s);
      return stResult(acct, got, customer, inv.amountCents, number);
    }
    var po = view.poNumber || null, due = inv.dueAt ? Math.floor(Date.parse(inv.dueAt + 'T23:59:59Z') / 1000) : NaN;
    var body = { customer: customer, collection_method: 'send_invoice', auto_advance: false, currency: 'usd', pending_invoice_items_behavior: 'exclude',
      description: (view.orderNo || view.id) + ' — ' + stage + ' invoice ' + number,
      custom_fields: [{ name: 'Invoice', value: number.slice(0, 140) }].concat(po ? [{ name: 'PO', value: String(po).slice(0, 140) }] : []),
      payment_settings: { payment_method_types: methods },
      metadata: { omega_org: org, omega_order: view.id, omega_stage: stage, omega_invoice: number } };
    if (isFinite(due) && due * 1000 > Date.now() + 3600000) body.due_date = due; else body.days_until_due = 1;
    /* prior.length is in the key: after an invoice is voided in Stripe the
       next push is a NEW invoice, not a replay of the voided one. */
    var made = await stripeRequest('POST', '/invoices', body,
      { account: acct, idem: 'omega-inv-' + P.key(org + ':' + view.id + ':' + stage + ':' + number + ':' + prior.length) });
    await stInvoices(org).doc(made.id).set({ orderId: view.id, stage: stage, number: number, accountId: acct, createdAt: nowIso() });
    var done = await completeDraft(org, acct, made, view, stage, customer, s);
    return stResult(acct, done, customer, inv.amountCents, number);
  },
  linkInvoice: async function (org, view, stage, providerInvoiceId) {
    org = orgOf(org);
    var d = await stReady(org), acct = d.accountId, id = String(providerInvoiceId || ''), inv = view.invoice || {};
    if (!/^in_[A-Za-z0-9]{1,60}$/.test(id)) throw fail(400, 'Stripe invoice ids start in_');
    var got = await stripeRequest('GET', '/invoices/' + encodeURIComponent(id), null, { account: acct });
    if (got.currency !== 'usd' || got.total !== inv.amountCents || got.status === 'draft' || got.status === 'void') {
      throw fail(409, 'Stripe invoice ' + id + ' does not match this invoice');
    }
    var ref = stInvoices(org).doc(id), ix = await ref.get();
    if (ix.exists && (ix.data().orderId !== view.id || ix.data().stage !== stage)) throw fail(409, 'Stripe invoice ' + id + ' is already linked to another order');
    if (!ix.exists) await ref.set({ orderId: view.id, stage: stage, number: inv.number || null, accountId: acct, createdAt: nowIso() });
    return stResult(acct, got, null, inv.amountCents, null);
  },
  /* A paid invoice is ONE payment, referenced by its charge (or payment
     intent, or the invoice itself when marked paid out of band). A refund
     of the whole charge or a lost dispute is a reversal; an open dispute
     or a partial refund is a warning a person reads — never applied. */
  pullPayments: async function (org, view, stage) {
    org = orgOf(org);
    var d = await stReady(org), acct = d.accountId, inv = view.invoice || {}, l = inv.ledger;
    if (!l || l.provider !== 'stripe' || !l.invoiceId) throw fail(409, 'This invoice is not in Stripe');
    if (l.company && l.company !== acct) throw fail(409, 'This invoice was pushed to Stripe account ' + l.company + '; the workspace is now connected to ' + acct);
    var got = await stripeRequest('GET', '/invoices/' + encodeURIComponent(l.invoiceId), { expand: ['charge'] }, { account: acct });
    if (got.currency !== 'usd' || got.total !== l.totalCents) throw fail(409, 'Stripe invoice changed; reconcile by hand');
    var items = [];
    if (got.status === 'paid') {
      var charge = got.charge && typeof got.charge === 'object' ? got.charge : null, chargeId = idOf(got.charge), pi = idOf(got.payment_intent);
      var ref, external;
      if (got.paid_out_of_band) { ref = 'stripe:' + got.id; external = { invoiceId: got.id, chargeId: null }; }
      else {
        var candidates = [chargeId, pi].filter(Boolean).map(function (x) { return 'stripe:' + x; });
        if (!candidates.length) candidates = ['stripe:' + got.id];
        /* a payment first seen by its payment intent keeps that reference
           once the charge appears — a new reference would read as a
           reversal of the old one */
        var kept = (inv.payments || []).filter(function (p) { return !p.voidedAt && candidates.some(function (c) { return sameRef(c, p.bankReference); }); })[0];
        ref = kept ? kept.bankReference : candidates[0];
        external = { invoiceId: got.id, chargeId: chargeId || null };
      }
      var paidAt = got.status_transitions && got.status_transitions.paid_at;
      var item = { ref: ref, amountCents: got.amount_paid, date: paidAt ? new Date(paidAt * 1000).toISOString().slice(0, 10) : today(),
        reversed: false, external: external };
      if (charge) {
        var dispute = await disputeOf(acct, charge);
        var refunded = charge.refunded === true || (charge.amount > 0 && charge.amount_refunded >= charge.amount);
        if (refunded || (dispute && dispute.status === 'lost')) item.reversed = true;
        else if (dispute && OPEN_DISPUTE.indexOf(dispute.status) >= 0) item.warning = 'Disputed in Stripe; funds withheld until it is decided';
        else if (charge.amount_refunded > 0) item.warning = 'Partially refunded in Stripe (USD ' + usd(charge.amount_refunded) + '); review by hand';
      }
      items.push(item);
    }
    return addVanished(items, inv.payments, 'stripe');
  }
};

/* ═══ The OAuth / Connect callback (api/ledger-connect.js) ═══════════════ */
async function finishQuickbooks(org, st, q) {
  requireConfigured(QB_VARS);
  var realm = String(q.realmId || '');
  if (!/^\d+$/.test(realm)) throw fail(400, 'Invalid QuickBooks company');
  var clearsky = await Q.load();
  if (clearsky && clearsky.realmId && String(clearsky.realmId) === realm) {
    throw fail(409, 'That is ClearSky\'s QuickBooks company. Connect this workspace\'s own company.');
  }
  var old = await qbLoad(org);
  if (old && old.realmId && String(old.realmId) !== realm && !old.disconnectedAt) {
    throw fail(409, 'This workspace is connected to QuickBooks company ' + old.realmId + '. Disconnect it on the accounting page first.');
  }
  var tok = await Q.tokenCall({ grant_type: 'authorization_code', code: String(q.code), redirect_uri: Q.cfg(org).redirect });
  await Q.save(tok, realm, { orgId: org, connectedAt: nowIso(), connectedBy: st.email || null, refreshLeaseUntil: 0,
    disconnectedAt: null, disconnectedBy: null, lastError: null, companyName: null }, org);
  try {
    var ci = await Q.request(org, 'companyinfo/' + encodeURIComponent(realm));
    var name = ci && ci.CompanyInfo && ci.CompanyInfo.CompanyName;
    if (name) await qbDoc(org).update({ companyName: String(name).slice(0, 200) });
  } catch (e) { /* best effort: the realm id identifies the company */ }
  return realm;
}
async function finishStripe(org, st, q) {
  requireConfigured(ST_VARS);
  var tok = await stripeOAuth('/oauth/token', { grant_type: 'authorization_code', code: String(q.code) });
  /* Keep ONLY the account id, mode and scope. The access and refresh
     tokens in the same response are dropped here and stored nowhere. */
  var acct = String(tok.stripe_user_id || ''), livemode = tok.livemode === true, scope = String(tok.scope || '').slice(0, 40);
  tok = null;
  if (!/^acct_[A-Za-z0-9]+$/.test(acct)) throw fail(502, 'Stripe returned no connected account');
  await db().runTransaction(async function (tx) {
    var idx = await tx.get(stAccount(acct)), cur = await tx.get(stDoc(org));
    if (idx.exists && idx.data().orgId !== org && !idx.data().disconnectedAt) throw fail(409, 'That Stripe account is connected to another workspace');
    if (cur.exists && stLive(cur.data()) && cur.data().accountId !== acct) {
      throw fail(409, 'This workspace is connected to Stripe account ' + cur.data().accountId + '. Disconnect it on the accounting page first.');
    }
    var at = nowIso();
    tx.set(stDoc(org), { orgId: org, accountId: acct, livemode: livemode, scope: scope, connectedAt: at, connectedBy: st.email || null,
      disconnectedAt: null, disconnectedBy: null, lastError: null }, { merge: true });
    tx.set(stAccount(acct), { orgId: org, connectedAt: at, disconnectedAt: null });
  });
  return acct;
}
/* The callback is authenticated by the one-time state document plus the
   host-scoped cookie set when an admin started the flow on the accounting
   page — exactly as logic-connect.js does for ClearSky's company. */
async function finishConnect(req) {
  var q = req.query || {}, state = String(q.state || '');
  var m = new RegExp('(?:^|;\\s*)' + STATE_COOKIE + '=([^;]+)').exec((req.headers && req.headers.cookie) || '');
  if (!/^[a-f0-9]{64}$/.test(state) || !m || m[1] !== state) throw fail(403, 'OAuth state mismatch; start from the accounting page');
  var sref = db().doc(STATES + '/' + state);
  var st = await db().runTransaction(async function (tx) {
    var s = await tx.get(sref), d = s.exists ? s.data() : null;
    if (!d || d.used || !(d.expiresAt > Date.now())) throw fail(403, 'OAuth request expired or already used');
    tx.update(sref, { used: true, usedAt: nowIso() });
    return d;
  });
  var org = orgOf(st.orgId), provider = st.provider;
  if (PROVIDERS.indexOf(provider) < 0) throw fail(403, 'OAuth request expired or already used');
  var back = '/logic-accounting.html?org=' + encodeURIComponent(org);
  if (q.error) {
    var code = String(q.error) === 'access_denied' ? 'denied' : String(q.error).replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 40) || 'error';
    return { org: org, provider: provider, location: back + '&syncError=' + encodeURIComponent(code) };
  }
  if (!q.code) throw fail(400, 'Missing authorization code');
  var company = provider === 'quickbooks' ? await finishQuickbooks(org, st, q) : await finishStripe(org, st, q);
  await db().collection('omega_audit').doc().create({ orgId: org, action: 'ledger-sync-connected', provider: provider, company: company,
    by: st.email || null, at: nowIso() });
  return { org: org, provider: provider, location: back + '&connected=' + provider };
}

async function status(org) {
  return { quickbooks: await quickbooks.status(org), stripe: await stripe.status(org) };
}

module.exports = {
  PROVIDERS: PROVIDERS,
  providers: { quickbooks: quickbooks, stripe: stripe },
  status: status,
  finishConnect: finishConnect,
  STATE_COOKIE: STATE_COOKIE,
  NAME: NAME,
  /* api/ledger-webhook.js only */
  stripeRequest: stripeRequest,
  stripeDeauthorized: stripeDeauthorized
};
