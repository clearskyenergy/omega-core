/* ═══════════════════════════════════════════════════════════════════════════════
   api/_lib/invest-bank.js — the ACH rail behind SkyFund, as one adapter
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Three money movements need a bank rail: an investor's funds INTO the
   escrow account, distributions OUT to investors, and refunds back. Cards
   (Stripe Checkout, api/invest.js) cost ~3% and Stripe's restricted-business
   terms cover securities offerings, so the rail that scales is ACH: the
   investor links a bank account once, then transfers are near-free in both
   directions.

   PROVIDERS, chosen by INVEST_ACH_PROVIDER (or inferred from keys):
     none    no rail. The storefront hides bank features; Stripe or wire only.
     mock    no network. Links a "Sandbox Checking" account and settles every
             transfer instantly, so the whole flow — link, invest, pay out,
             refund — runs in tests and in the console without credentials.
     dwolla  Plaid Link verifies the investor's bank account (the browser
             gets a link token from here, never the Plaid secret); Dwolla
             holds a Verified Customer per investor (its CIP check is the
             identity verification), one funding source per linked account,
             and moves money between that source and the platform's escrow
             and distribution accounts. Its webhook (api/invest-ach-webhook.js)
             settles the ledger.

   WHAT NEVER TOUCHES FIRESTORE: the SSN last-4 and date of birth the
   Verified Customer needs are forwarded to Dwolla and dropped. The profile
   keeps the customer id, the funding-source id, the bank name, and the last
   four digits of the account — enough to show "Chase •••• 4321" and to
   address a transfer, nothing that identifies the account elsewhere.

   ENV
     INVEST_ACH_PROVIDER              none | mock | dwolla
     DWOLLA_KEY, DWOLLA_SECRET        API credentials
     DWOLLA_ENV                       sandbox (default) | production
     DWOLLA_ESCROW_FUNDING_SOURCE     URL of the platform's escrow bank account in Dwolla
     DWOLLA_DISTRIBUTION_FUNDING_SOURCE  default source for distributions (a campaign
                                      may override with bank.distributionSourceUrl)
     DWOLLA_WEBHOOK_SECRET            the secret given when the subscription was created
     PLAID_CLIENT_ID, PLAID_SECRET    Plaid credentials; PLAID_ENV sandbox | production

   The Dwolla and Plaid calls follow their published v1 APIs and were written
   against the documentation, not a live sandbox — run the sandbox checklist
   in portals/skyfund/README.md before the first real transfer.
   ═══════════════════════════════════════════════════════════════════════════════ */
'use strict';
var crypto = require('crypto');
var A = require('./admin');

function provider() {
  var p = String(process.env.INVEST_ACH_PROVIDER || '').toLowerCase();
  if (p === 'mock' || p === 'dwolla' || p === 'none') return p;
  return (process.env.DWOLLA_KEY && process.env.DWOLLA_SECRET) ? 'dwolla' : 'none';
}
function status() {
  var p = provider();
  return {
    provider: p,
    plaid: p === 'dwolla',
    stripe: !!process.env.STRIPE_SECRET_KEY,
    escrowConfigured: p === 'mock' || (p === 'dwolla' && !!process.env.DWOLLA_ESCROW_FUNDING_SOURCE),
    distributionConfigured: p === 'mock' || (p === 'dwolla' && !!process.env.DWOLLA_DISTRIBUTION_FUNDING_SOURCE),
    sandbox: p !== 'dwolla' || (process.env.DWOLLA_ENV || 'sandbox') !== 'production'
  };
}
function money(n) { return (Math.round(Number(n) * 100) / 100).toFixed(2); }

/* ── Dwolla ─────────────────────────────────────────────────────────────── */
var DW = { tok: null, exp: 0 };
function dwBase() { return (process.env.DWOLLA_ENV || 'sandbox') === 'production' ? 'https://api.dwolla.com' : 'https://api-sandbox.dwolla.com'; }
function dwToken() {
  if (DW.tok && Date.now() < DW.exp) return Promise.resolve(DW.tok);
  return fetch(dwBase() + '/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: 'Basic ' + Buffer.from(process.env.DWOLLA_KEY + ':' + process.env.DWOLLA_SECRET).toString('base64') },
    body: 'grant_type=client_credentials'
  }).then(function (r) { return r.json(); }).then(function (j) {
    if (!j.access_token) throw A.httpError(502, 'Dwolla refused the credentials');
    DW.tok = j.access_token; DW.exp = Date.now() + (Number(j.expires_in || 3600) - 60) * 1000;
    return DW.tok;
  });
}
/* One call. A 201 yields { location, id }; anything else yields the parsed
   body; a non-2xx throws with Dwolla's own message. */
function dw(method, urlOrPath, body) {
  var url = /^https?:/.test(urlOrPath) ? urlOrPath : dwBase() + urlOrPath;
  return dwToken().then(function (tok) {
    return fetch(url, { method: method, headers: { Authorization: 'Bearer ' + tok, Accept: 'application/vnd.dwolla.v1.hal+json', 'Content-Type': 'application/vnd.dwolla.v1.hal+json' }, body: body ? JSON.stringify(body) : undefined });
  }).then(function (r) {
    if (r.status === 201) { var loc = r.headers.get('location') || ''; return { created: true, location: loc, id: loc.split('/').pop() }; }
    return r.text().then(function (t) {
      var j = {}; try { j = JSON.parse(t); } catch (e) {}
      if (!r.ok) { var err = A.httpError(502, 'Dwolla ' + r.status + ': ' + (j.message || t.slice(0, 200))); err.dwolla = j; throw err; }
      return j;
    });
  });
}
function plaid(path, body) {
  var base = (process.env.PLAID_ENV || 'sandbox') === 'production' ? 'https://production.plaid.com' : 'https://sandbox.plaid.com';
  var payload = Object.assign({ client_id: process.env.PLAID_CLIENT_ID, secret: process.env.PLAID_SECRET }, body);
  return fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw A.httpError(502, 'Plaid: ' + (j.error_message || j.error_code || r.status)); return j; }); });
}
function dwCustomer(caller, profile, identity) {
  if (profile.bank && profile.bank.customerUrl) return dw('GET', profile.bank.customerUrl).then(function (c) { return { url: profile.bank.customerUrl, id: c.id || profile.bank.customerId, status: c.status || 'verified' }; });
  var need = ['firstName', 'lastName', 'address1', 'city', 'state', 'postalCode', 'dateOfBirth', 'ssnLast4'];
  for (var i = 0; i < need.length; i++) if (!identity[need[i]]) throw A.httpError(400, 'Identity details are required to open the bank link: ' + need[i] + ' is missing.');
  var body = { firstName: identity.firstName, lastName: identity.lastName, email: caller.email, type: 'personal',
    address1: identity.address1, address2: identity.address2 || undefined, city: identity.city, state: identity.state, postalCode: identity.postalCode,
    dateOfBirth: identity.dateOfBirth, ssn: String(identity.ssnLast4).slice(-4), correlationId: 'investor-' + caller.uid };
  return dw('POST', '/customers', body).then(function (r) {
    return dw('GET', r.location).then(function (c) { return { url: r.location, id: r.id, status: c.status || 'unverified' }; });
  }).catch(function (e) {
    /* An email Dwolla already knows: reuse that customer rather than fail. */
    var about = e.dwolla && e.dwolla.code === 'Duplicate' && e.dwolla._links && e.dwolla._links.about && e.dwolla._links.about.href;
    if (!about) throw e;
    return dw('GET', about).then(function (c) { return { url: about, id: c.id || about.split('/').pop(), status: c.status || 'unverified' }; });
  });
}

/* ── the adapter ────────────────────────────────────────────────────────── */
var mock = {
  linkToken: function (caller) { return Promise.resolve({ linkToken: 'mock-link-' + caller.uid }); },
  linkBank: function (caller, profile, body) {
    return Promise.resolve({ provider: 'mock', customerId: 'mock-cust-' + caller.uid, fundingSourceId: 'mock-fs-' + caller.uid,
      name: body.name || 'Sandbox Checking', mask: String(body.mask || '0000').slice(-4), status: 'verified', identityStatus: 'verified', linkedAt: new Date().toISOString() });
  },
  removeBank: function () { return Promise.resolve(); },
  debit: function (pledgeId, amount) { return Promise.resolve({ transferId: 'mock-in-' + pledgeId, status: 'processed' }); },
  credit: function (payoutId, amount) { return Promise.resolve({ transferId: 'mock-out-' + payoutId, status: 'processed' }); },
  refund: function (pledgeId, amount) { return Promise.resolve({ transferId: 'mock-back-' + pledgeId, status: 'processed' }); }
};
var dwolla = {
  linkToken: function (caller) {
    return plaid('/link/token/create', { user: { client_user_id: caller.uid }, client_name: 'SkyFund', products: ['auth'], country_codes: ['US'], language: 'en' })
      .then(function (j) { return { linkToken: j.link_token, expiration: j.expiration }; });
  },
  linkBank: function (caller, profile, body) {
    if (!body.publicToken || !body.accountId) throw A.httpError(400, 'publicToken and accountId from Plaid Link are required');
    return dwCustomer(caller, profile, body.identity || {}).then(function (cust) {
      return plaid('/item/public_token/exchange', { public_token: body.publicToken }).then(function (x) {
        return plaid('/processor/token/create', { access_token: x.access_token, account_id: body.accountId, processor: 'dwolla' });
      }).then(function (pt) {
        return dw('POST', cust.url + '/funding-sources', { plaidToken: pt.processor_token, name: body.name || 'Checking' });
      }).then(function (fs) {
        return { provider: 'dwolla', customerUrl: cust.url, customerId: cust.id, fundingSourceUrl: fs.location, fundingSourceId: fs.id,
          name: body.name || 'Checking', mask: String(body.mask || '').slice(-4), status: cust.status === 'verified' ? 'verified' : 'pending', identityStatus: cust.status, linkedAt: new Date().toISOString() };
      });
    });
  },
  removeBank: function (bank) { return bank && bank.fundingSourceUrl ? dw('POST', bank.fundingSourceUrl, { removed: true }).catch(function () { return null; }) : Promise.resolve(); },
  debit: function (pledgeId, amount, bank, meta) {
    if (!process.env.DWOLLA_ESCROW_FUNDING_SOURCE) throw A.httpError(503, 'DWOLLA_ESCROW_FUNDING_SOURCE is not set');
    return dw('POST', '/transfers', { _links: { source: { href: bank.fundingSourceUrl }, destination: { href: process.env.DWOLLA_ESCROW_FUNDING_SOURCE } },
      amount: { currency: 'USD', value: money(amount) }, metadata: Object.assign({ kind: 'cf_pledge', pledgeId: pledgeId }, meta || {}), correlationId: 'pledge-' + pledgeId })
      .then(function (r) { return { transferId: r.id, transferUrl: r.location, status: 'pending' }; });
  },
  credit: function (payoutId, amount, bank, sourceUrl, meta) {
    var src = sourceUrl || process.env.DWOLLA_DISTRIBUTION_FUNDING_SOURCE;
    if (!src) throw A.httpError(503, 'no distribution funding source: set DWOLLA_DISTRIBUTION_FUNDING_SOURCE or the campaign\'s bank.distributionSourceUrl');
    return dw('POST', '/transfers', { _links: { source: { href: src }, destination: { href: bank.fundingSourceUrl } },
      amount: { currency: 'USD', value: money(amount) }, metadata: Object.assign({ kind: 'cf_payout', payoutId: payoutId }, meta || {}), correlationId: 'payout-' + payoutId })
      .then(function (r) { return { transferId: r.id, transferUrl: r.location, status: 'pending' }; });
  },
  refund: function (pledgeId, amount, bank, meta) {
    if (!process.env.DWOLLA_ESCROW_FUNDING_SOURCE) throw A.httpError(503, 'DWOLLA_ESCROW_FUNDING_SOURCE is not set');
    return dw('POST', '/transfers', { _links: { source: { href: process.env.DWOLLA_ESCROW_FUNDING_SOURCE }, destination: { href: bank.fundingSourceUrl } },
      amount: { currency: 'USD', value: money(amount) }, metadata: Object.assign({ kind: 'cf_refund', pledgeId: pledgeId }, meta || {}), correlationId: 'refund-' + pledgeId })
      .then(function (r) { return { transferId: r.id, transferUrl: r.location, status: 'pending' }; });
  }
};
function adapter() {
  var p = provider();
  if (p === 'mock') return mock;
  if (p === 'dwolla') return dwolla;
  throw A.httpError(503, 'no ACH rail is configured (INVEST_ACH_PROVIDER)');
}

/* Dwolla signs each webhook body with HMAC-SHA256 of the subscription secret,
   hex, in X-Request-Signature-SHA-256. Compared in constant time. */
function verifyWebhook(rawBody, signature) {
  var secret = process.env.DWOLLA_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  var expect = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  var a = Buffer.from(String(signature).toLowerCase()), b = Buffer.from(expect);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = { provider: provider, status: status, adapter: adapter, verifyWebhook: verifyWebhook, money: money, _dwolla: dwolla, _mock: mock };
