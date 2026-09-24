/* ═══════════════════════════════════════════════════════════════════════════
   GET  /api/logic-accounting?org=<orgId>[&status=&customer=&overdue=1][&format=csv]
        the workspace's receivables ledger (logic-accounting.html)
   POST /api/logic-accounting { org, action: 'sync-choose' | 'sync-connect' |
        'sync-disconnect' | 'sync-push' | 'sync-link' | 'sync-pull', … }
        the workspace's OWN books: QuickBooks or Stripe
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   WHO. A workspace owner/admin and the ClearSky owner — X.authorize(caller,
   org, true) on every method. A member reads none of it: the ledger names
   every customer's balance.

   THE LEDGER is one row per invoice across the workspace's orders, keyed by
   the customer ACCOUNT (api/_lib/buyer-accounts.js accountOfOrder), with
   aging from the explicit or derived due date. The rules — settle, aging,
   filters, totals, CSV — are api/_lib/receivables.js (pure); this file only
   reads. The page never sums money.

   THE WRITES stay where they were. Recording, voiding, editing an invoice and
   releasing on PO are api/logic-office.js actions onto the ONE writer,
   api/_lib/logic-workflow.js. Here: which provider the workspace chose
   (fulfillment/config.ledgerSync — closed to browsers by firestore.rules),
   connecting / disconnecting that provider (api/_lib/ledger-sync.js, tokens
   only under integrations/**), and push / link / pull, which go through the
   workflow as well. Every write is audited in omega_audit.

   Ledger sync is for TENANT-billed workspaces (fulfillment/config.accounting
   === 'tenant'): a ClearSky-billed workspace's invoices live in ClearSky's
   QuickBooks and reconcile there (api/logic-connect.js, qbo-sales.js).
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var A = require('./_lib/admin'), X = require('./_lib/logic-access'), P = require('./_lib/logic-policy');
var R = require('./_lib/receivables'), W = require('./_lib/logic-workflow');
function ledgerSync() { return require('./_lib/ledger-sync'); }
function syncModule() {
  try { return ledgerSync(); }
  catch (e) { if (e && e.code === 'MODULE_NOT_FOUND') throw A.httpError(503, 'Ledger sync is not installed on this deployment'); throw e; }
}
var PROVIDERS = ['quickbooks', 'stripe'], METHODS = ['card', 'us_bank_account'];
var ACTIONS = ['sync-choose', 'sync-connect', 'sync-disconnect', 'sync-push', 'sync-link', 'sync-pull'];
var NOT_TENANT = 'Ledger sync is for workspaces that invoice on their own paper; this workspace is billed through ClearSky QuickBooks';

function chosen(config) { var p = ((config || {}).ledgerSync || {}).provider; return PROVIDERS.indexOf(p) >= 0 ? p : 'none'; }
function lower(v) { return String(v || '').trim().toLowerCase(); }

/* What the page shows about the workspace's own books. No token, secret or
   key: ledger-sync's status() returns names of missing env vars and whether
   a company / account is connected, and nothing else. */
async function syncStatus(config, org) {
  var ls = (config || {}).ledgerSync || {};
  var base = { available: true, eligible: (config || {}).accounting === 'tenant', provider: chosen(config),
    chosenBy: ls.chosenBy || null, chosenAt: ls.chosenAt || null, since: ls.since || null };
  var LS;
  try { LS = ledgerSync(); }
  catch (e) { if (e && e.code === 'MODULE_NOT_FOUND') return { available: false, eligible: base.eligible, provider: base.provider }; throw e; }
  var st, qb = ls.quickbooks || {}, sp = ls.stripe || {};
  try { st = await LS.status(org); }
  catch (e) { st = { quickbooks: { connected: false, lastError: String(e.message || e).slice(0, 200) }, stripe: { connected: false, lastError: String(e.message || e).slice(0, 200) } }; }
  return Object.assign(base, {
    quickbooks: Object.assign({}, st.quickbooks, { itemRef: qb.itemRef || '', taxCodeRef: qb.taxCodeRef || 'NON', approved: qb.approved === true }),
    stripe: Object.assign({}, st.stripe, { paymentMethods: Array.isArray(sp.paymentMethods) && sp.paymentMethods.length ? sp.paymentMethods : METHODS.slice(), sendEmail: sp.sendEmail === true }) });
}

/* The customer ACCOUNT of each order (its stamp, else the account that
   admitted the person it is billed to) and the account's name. */
async function entriesOf(db, org, docs) {
  var B = require('./_lib/buyer-accounts'), byEmail = {}, names = {}, out = [];
  for (var s of docs) {
    var o = s.data(), cid = o.customerId || null;
    if (!cid && ['embed', 'config-link'].indexOf(o.source) < 0) {
      var e = lower((o.customer || {}).email);
      if (e) { if (!(e in byEmail)) byEmail[e] = await B.accountOfOrder(db, org, o); cid = byEmail[e]; }
    }
    out.push({ id: s.id, order: o, cid: cid ? String(cid) : null });
  }
  for (var x of out) {
    if (!x.cid || x.cid in names) continue;
    names[x.cid] = null;
    try { var a = await db.collection('omega_orgs').doc(org).collection('customers').doc(P.id(x.cid)).get(); if (a.exists) names[x.cid] = a.data().name || null; }
    catch (err) { if (!err.status) throw err; }
  }
  return out.map(function (x) { return { id: x.id, order: x.order, account: x.cid ? { id: x.cid, name: names[x.cid] } : null }; });
}

async function orderIn(db, org, id) {
  var ref = db.collection('orders').doc(P.id(id)), s = await ref.get();
  if (!s.exists || s.data().orgId !== org) throw A.httpError(404, 'Order not found in this workspace');
  return s;
}
function stageArg(v) { if (R.STAGES.indexOf(v) < 0) throw A.httpError(400, 'stage must be deposit or balance'); return v; }

/* sync-choose: the provider and its settings. QuickBooks needs the
   installment item and tax treatment approved by the workspace's accountant
   (the same approval ClearSky's own company requires); Stripe needs at least
   one payment method. A section left out of the body keeps what was saved. */
function choose(cur, b, email, now) {
  var p = b.provider;
  if (['none'].concat(PROVIDERS).indexOf(p) < 0) throw A.httpError(400, 'provider must be none, quickbooks or stripe');
  var qb = cur.quickbooks || null, st = cur.stripe || null;
  if (b.quickbooks != null || (p === 'quickbooks' && !(qb && qb.approved === true))) {
    var q = b.quickbooks || {}, item = String(q.itemRef == null ? '' : q.itemRef).trim();
    var tax = q.taxCodeRef == null || String(q.taxCodeRef).trim() === '' ? 'NON' : String(q.taxCodeRef).trim().toUpperCase();
    if (!/^\d{1,20}$/.test(item)) throw A.httpError(400, 'QuickBooks item id must be digits');
    if (!/^(NON|TAX|\d{1,20})$/.test(tax)) throw A.httpError(400, 'QuickBooks tax code must be NON, TAX or a tax code id');
    if (q.approved !== true) throw A.httpError(409, 'Confirm the QuickBooks item and tax treatment first');
    var same = qb && qb.approved === true && qb.itemRef === item && qb.taxCodeRef === tax;
    qb = { itemRef: item, taxCodeRef: tax, approved: true, approvedBy: same ? qb.approvedBy : email, approvedAt: same ? qb.approvedAt : now };
  }
  if (b.stripe != null || (p === 'stripe' && !st)) {
    var s = b.stripe || {}, pm = s.paymentMethods == null ? METHODS.slice() : s.paymentMethods;
    if (!Array.isArray(pm) || pm.some(function (m) { return METHODS.indexOf(m) < 0; })) throw A.httpError(400, 'Stripe payment methods are card and us_bank_account');
    pm = METHODS.filter(function (m) { return pm.indexOf(m) >= 0; });
    if (!pm.length) throw A.httpError(400, 'Choose at least one Stripe payment method');
    st = { paymentMethods: pm, sendEmail: s.sendEmail === true };
  }
  return { provider: p, quickbooks: qb, stripe: st,
    since: p === 'none' ? null : (p !== cur.provider ? now : (cur.since || now)),
    chosenBy: email, chosenAt: now };
}

module.exports = A.handler(async function (req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (['GET', 'POST'].indexOf(req.method) < 0) throw A.httpError(405, 'GET or POST only');
  var caller = await A.authenticate(req), b = req.body || {}, db = A.db(), q = req.query || {};
  var org = A.safeOrg(req.method === 'GET' ? q.org : b.org);
  if (!org) throw A.httpError(400, 'Valid org required');
  var ctx = await X.authorize(caller, org, true), config = ctx.config || {};

  if (req.method === 'GET') {
    var snap = await db.collection('orders').where('orgId', '==', org).orderBy('createdAt', 'desc').limit(500).get();
    /* an unconverted PO is not an order yet (the office's rule); an order with
       no invoices has nothing to collect */
    var docs = snap.docs.filter(function (s) { var o = s.data() || {}; return (!o.poIntake || o.poIntake.convertedAt) && o.logic && o.logic.invoices; });
    var today = new Date().toISOString().slice(0, 10), provider = chosen(config);
    var filters = { status: ['all', 'open', 'to_issue', 'paid'].indexOf(q.status) >= 0 ? q.status : 'all',
      customer: String(q.customer || '').slice(0, 200), overdue: q.overdue === '1' || q.overdue === 'true' };
    var led = R.ledger(await entriesOf(db, org, docs), today, filters, { provider: provider });
    if (q.format === 'csv') return { filename: 'receivables-' + org + '-' + today + '.csv', csv: R.csv(led.rows) };
    return Object.assign({ owner: X.owner(caller), org: org, name: ctx.org.name || org, brand: require('./_lib/logic-brand')(ctx.org),
      today: today, accounting: config.accounting === 'tenant' ? 'tenant' : 'quickbooks' }, led,
      { sync: await syncStatus(config, org), limited: snap.size === 500 });
  }

  if (ACTIONS.indexOf(b.action) < 0) throw A.httpError(400, 'Unknown action');
  if (config.accounting !== 'tenant' && !(b.action === 'sync-choose' && b.provider === 'none')) throw A.httpError(409, NOT_TENANT);
  var now = new Date().toISOString(), cfgRef = db.collection('omega_orgs').doc(org).collection('fulfillment').doc('config');
  function audit(row) { return db.collection('omega_audit').doc().create(Object.assign({ orgId: org, by: caller.email, at: now }, row)); }

  if (b.action === 'sync-choose') {
    var next = await db.runTransaction(async function (tx) {
      var c = await tx.get(cfgRef), cur = ((c.exists ? c.data() : {}) || {}).ledgerSync || {};
      var n = choose(cur, b, caller.email, now);
      tx.set(cfgRef, { ledgerSync: n }, { merge: true });
      tx.create(db.collection('omega_audit').doc(), { orgId: org, action: 'ledger-sync-choose', by: caller.email, at: now,
        before: { provider: cur.provider || 'none', quickbooks: cur.quickbooks || null, stripe: cur.stripe || null }, after: n });
      return n;
    });
    return { ok: true, sync: await syncStatus(Object.assign({}, config, { ledgerSync: next }), org) };
  }

  if (b.action === 'sync-connect' || b.action === 'sync-disconnect') {
    if (PROVIDERS.indexOf(b.provider) < 0) throw A.httpError(400, 'provider must be quickbooks or stripe');
    var prov = syncModule().providers[b.provider];
    if (b.action === 'sync-connect') {
      /* the OAuth / Connect round trip is authenticated by a one-time state
         document plus this host-scoped cookie (api/ledger-connect.js) */
      var started = await prov.connectUrl(org, caller);
      if (started.setCookie) res.setHeader('Set-Cookie', started.setCookie);
      await audit({ action: 'ledger-sync-connect-start', provider: b.provider });
      return { url: started.url };
    }
    await prov.disconnect(org, caller);
    var after = await db.runTransaction(async function (tx) {
      var c = await tx.get(cfgRef), cur = ((c.exists ? c.data() : {}) || {}).ledgerSync || {}, n = cur;
      if (cur.provider === b.provider) {
        n = Object.assign({}, cur, { provider: 'none', since: null, chosenBy: caller.email, chosenAt: now });
        tx.set(cfgRef, { ledgerSync: n }, { merge: true });
      }
      tx.create(db.collection('omega_audit').doc(), { orgId: org, action: 'ledger-sync-disconnect', provider: b.provider, by: caller.email, at: now,
        before: { provider: cur.provider || 'none' }, after: { provider: n.provider || 'none' } });
      return n;
    });
    return { ok: true, sync: await syncStatus(Object.assign({}, config, { ledgerSync: after }), org) };
  }

  if (b.action === 'sync-push') { await orderIn(db, org, b.orderId); return W.pushLedgerInvoice(b.orderId, stageArg(b.stage), caller); }
  if (b.action === 'sync-link') {
    await orderIn(db, org, b.orderId);
    var providerId = String(b.invoiceId == null ? '' : b.invoiceId).trim();
    if (!/^[A-Za-z0-9_]{1,64}$/.test(providerId)) throw A.httpError(400, 'Invoice id must be 1–64 letters, digits or underscores');
    return W.linkLedgerInvoice(b.orderId, stageArg(b.stage), providerId, caller);
  }

  /* sync-pull: one order, or every order of the workspace with an invoice in
     the chosen provider (newest first, 25 per call), one after another; an
     order that fails is reported and the rest still run. */
  var provider = chosen(config);
  if (provider === 'none') throw A.httpError(409, 'Choose QuickBooks or Stripe on the accounting page first');
  var targets, limited = false;
  if (b.orderId) { var one = await orderIn(db, org, b.orderId); targets = [one]; }
  else {
    var all = await db.collection('orders').where('orgId', '==', org).orderBy('createdAt', 'desc').limit(500).get();
    targets = all.docs.filter(function (s) {
      var l = (s.data() || {}).logic || {};
      return l.accounting === 'tenant' && Object.keys(l.invoices || {}).some(function (k) { var g = (l.invoices[k] || {}).ledger; return !!(g && g.provider === provider); });
    });
    limited = targets.length > 25; targets = targets.slice(0, 25);
  }
  /* bounded by time as well as count: the function has 30 s, the provider
     is remote, and the rest waits for the next "Sync all" or the worker */
  var results = [], counts = { orders: 0, recorded: 0, voided: 0, conflicts: 0, errors: 0 }, started = Date.now();
  for (var t of targets) {
    if (results.length && Date.now() - started > 20000) { limited = true; break; }
    counts.orders++;
    var row = { orderId: t.id, orderNo: t.data().orderNo || null, stages: {} };
    try {
      var r = await W.syncLedger(t.id, caller, { source: 'accounting' });
      row.stages = r.stages || {}; if (r.skipped) row.skipped = r.skipped;
      Object.keys(row.stages).forEach(function (k) { var st = row.stages[k]; counts.recorded += st.recorded.length; counts.voided += st.voided.length; counts.conflicts += st.conflicts.length; });
    } catch (e) {
      if (b.orderId) throw e;
      row.error = String(e.message || e).slice(0, 300); counts.errors++;
      /* one invoice refused by the provider: what the other one recorded is still reported */
      if (e.partial && e.partial.stages) {
        row.stages = e.partial.stages;
        Object.keys(row.stages).forEach(function (k) { var st = row.stages[k]; counts.recorded += st.recorded.length; counts.voided += st.voided.length; counts.conflicts += st.conflicts.length; });
      }
    }
    results.push(row);
  }
  await audit({ action: 'ledger-sync-pull', provider: provider, orderId: b.orderId ? P.id(b.orderId) : null, counts: counts });
  var out = { ok: true, provider: provider, results: results, limited: limited };
  /* the provider is not connected (or sync is off): say so once, not per order */
  if (results.length && results.every(function (r) { return r.skipped && r.skipped === results[0].skipped; })) out.skipped = results[0].skipped;
  return out;
});
