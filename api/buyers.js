/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   GET  /api/buyers?org=                      the workspace's customer accounts
        &customerId= | &email=                one ACCOUNT: its people, every
                                              order on it, terms, links
   POST /api/buyers { org, action, … }        create · profile · terms ·
                                              user-add · user-status · invite ·
                                              editor-trial

   The office's Customer hub. A customer is a COMPANY with several people on
   it (api/_lib/buyer-accounts.js); the office opens the account, not one
   person, and every action names the account by customerId (an email still
   resolves to its account, for the scripts and tests written before). */
'use strict';
var A = require('./_lib/admin'), X = require('./_lib/logic-access'), B = require('./_lib/buyer-accounts'), P = require('./_lib/logic-policy'), K = require('./_lib/kit');
var S = require('./_lib/office-stage');
/* What the office sees per order in a customer's account: what was
   invoiced, what has been recorded as paid, the balance, whether it
   shipped, who on the account it is billed to, and whether the customer is
   waiting on an answer. Cost and margin are ClearSky's and are not here. */
function money(id, o) {
  var l = o.logic || {}, inv = 0, paid = 0;
  Object.keys(l.invoices || {}).forEach(function (k) { var i = l.invoices[k] || {}; inv += Number(i.amountCents) || 0; paid += Number(i.paidCents) || 0; });
  var at = o.createdAt && o.createdAt.toDate ? o.createdAt.toDate().toISOString() : (typeof o.createdAt === 'string' ? o.createdAt : null);
  var stage = null; try { stage = S.stageOf(o); } catch (e) { stage = null; }
  return { id: id, orderNo: o.orderNo || id, status: o.status || 'new', stage: stage, placedAt: at, poNumber: (o.purchaseOrder || {}).number || null,
    billedTo: { name: String((o.customer || {}).name || '').slice(0, 120), email: String((o.customer || {}).email || '').slice(0, 160) },
    totalCents: l.commercial ? Number(l.commercial.totalCents) || 0 : null, invoicedCents: inv, paidCents: paid, balanceCents: Math.max(0, inv - paid),
    shippedAt: o.shipment && o.shipment.shippedAt ? String(o.shipment.shippedAt) : null, worksOrderId: o.worksOrderId || null,
    items: (o.items || []).slice(0, 20).map(function (i) { return { sku: i.sku, name: i.name || i.sku, qty: i.qty }; }),
    openRequests: (o.requests || []).filter(function (r) { return r && r.status === 'open'; }).length };
}
function totalsOf(rows) { return rows.reduce(function (t, m) { t.invoicedCents += m.invoicedCents; t.paidCents += m.paidCents; t.balanceCents += m.balanceCents; t.openRequests += m.openRequests; return t; }, { invoicedCents: 0, paidCents: 0, balanceCents: 0, openRequests: 0 }); }
module.exports = A.handler(async function (req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'POST') throw A.httpError(405, 'GET or POST only');
  var caller = await A.authenticate(req), b = req.body || {}, org = A.safeOrg(req.method === 'GET' ? req.query.org : b.org);
  // Customer contact details and commercial terms are office/admin data.
  var ctx = await X.authorize(caller, org, true);
  /* ClearSky's owner may set up customers while commissioning, before the
     workspace is switched on; the workspace's own staff once it is. */
  if (!X.subscribed(ctx) && !X.owner(caller)) throw A.httpError(403, 'Omega Logic subscription is not active');
  var db = A.db(), root = db.collection('omega_orgs').doc(org), host = K.hostOf(ctx.org);
  /* The addresses the office hands a customer: the phone app (the tenant's
     branded one) and the same account on a desktop. */
  var portalUrl = K.url('/portals/customer/', org, host), appUrl = K.url('/portals/customer/app', org, host);
  /* One account, by id or by any person's email on it. */
  async function accountOf(input, tx) {
    if (input.customerId) {
      var ref = root.collection('customers').doc(P.id(input.customerId)), s = tx ? await tx.get(ref) : await ref.get();
      if (!s.exists) throw A.httpError(404, 'Customer not found');
      return { id: s.id, data: s.data() || {}, ref: ref, user: null };
    }
    var found = await B.lookup(db, org, B.email(input.email), tx);
    if (!found) return null;
    found.ref = root.collection('customers').doc(found.id);
    return found;
  }
  if (req.method === 'GET') {
    if (req.query.customerId || req.query.email) {
      var acct = await accountOf(req.query);
      if (!acct) throw A.httpError(404, 'Customer not found');
      var people = await B.people(db, org, acct.id, { all: true, limit: 100 });
      var contact = acct.user || people.filter(function (u) { return u.role === 'owner' && u.status === 'active'; })[0] || people[0] || null;
      var got = await B.accountOrders(db, org, contact ? contact.email : null, acct, { limit: 100 });
      var orders = got.docs.map(function (r) { return money(r.id, r.data()); });
      return { customerId: acct.id, company: acct.data.name || '', accountType: acct.data.accountType || (acct.data.source === 'office' ? 'company' : 'individual'), domain: acct.data.domain || '',
        rep: acct.data.rep || null, owner: X.owner(caller), editorAccess: require('./_lib/buyer-design').entitlement(ctx, acct.data),
        /* the person the office opened it from (or the owner), for the older views */
        name: contact ? contact.name || '' : '', email: contact ? contact.email : '', phone: contact ? contact.phone || '' : '',
        activated: !!(contact && contact.activated), lastSeenAt: contact ? contact.lastSeenAt || null : null, contactStatus: contact ? contact.status : null,
        people: people, address: acct.data.address || null, createdAt: acct.data.createdAt || null,
        plan: acct.data.plan || 'free', status: acct.data.status || 'active', terms: P.terms(ctx.config.terms, acct.data.terms),
        portalUrl: portalUrl, appUrl: appUrl, orders: orders, totals: totalsOf(orders), limited: got.truncated };
    }
    var q = root.collection('customers').orderBy('__name__');
    if (req.query.after) q = q.startAfter(P.id(req.query.after));
    var rows = await q.limit(50).get();
    var customers = await Promise.all(rows.docs.map(async function (r) {
      var d = r.data(), list = await B.people(db, org, r.id, { all: true, limit: 25 });
      return { id: r.id, company: d.name || '', status: d.status || 'active', accountType: d.accountType || (d.source === 'office' ? 'company' : 'individual'), terms: P.terms(ctx.config.terms, d.terms),
        supersededBy: d.supersededBy || null, pending: list.filter(function (u) { return u.status === 'pending'; }).length,
        users: list.map(function (u) { return { email: u.email, name: u.name, role: u.role, status: u.status, activated: u.activated }; }), usersLimited: list.length === 25 };
    }));
    return { org: org, name: ctx.org.name || org, brand: require('./_lib/logic-brand')(ctx.org), owner: X.owner(caller), customers: customers.filter(function (c) { return !c.supersededBy; }),
      portalUrl: portalUrl, appUrl: appUrl, next: rows.size === 50 ? rows.docs[49].id : null };
  }
  if (b.action === 'editor-trial') {
    X.requireOwner(caller);
    var days = Number(b.days);
    if (!Number.isInteger(days) || days < 0 || days > 14) throw A.httpError(400, 'Choose zero to revoke, or 1–14 trial days');
    return db.runTransaction(async function (tx) {
      var found = await accountOf(b, tx); if (!found) throw A.httpError(404, 'Customer not found');
      if (['disabled', 'suspended', 'cancelled'].indexOf(found.data.status) >= 0) throw A.httpError(403, 'Customer access is disabled.');
      var prior = found.data.editorLite || {};
      if (prior.source === 'provider' && prior.status === 'active') throw A.httpError(409, 'Manage the existing paid subscription through its billing provider');
      var now = new Date(), grant = { status: days ? 'trial' : 'inactive', source: 'owner-trial',
        expiresAt: new Date(now.getTime() + days * 86400000).toISOString(), grantedBy: caller.email, grantedAt: now.toISOString() };
      tx.update(found.ref, { editorLite: grant });
      tx.create(db.collection('omega_audit').doc(), { action: 'buyer-editor-trial', orgId: org, customerId: found.id, by: caller.email, at: now.toISOString(), was: prior, grant: grant });
      return { ok: true, note: days ? 'Time-limited Editor Lite trial granted. No subscription or charge was created.' : 'Trial access revoked. Saved projects were retained.' };
    });
  }
  if (b.action === 'profile') {
    /* The COMPANY's details (name, address, access, email domain) by account;
       a person's name and phone only when a person is named. */
    if (!B.clean(b.company)) throw A.httpError(400, 'Company name is required');
    if (['active', 'suspended'].indexOf(b.status) < 0) throw A.httpError(400, 'Choose active or suspended access');
    var ad = b.address || {}, company = B.clean(b.company), shipping = { line1: B.clean(ad.line1, 200), city: B.clean(ad.city, 100), state: B.clean(ad.state, 40), zip: B.clean(ad.zip, 20) };
    var domain = b.domain === undefined ? undefined : (b.domain ? A.safeOrg(String(b.domain).toLowerCase()) : '');
    if (b.domain && !domain) throw A.httpError(400, 'Invalid company email domain');
    if (domain && require('./_lib/public-domains').indexOf(domain) >= 0) throw A.httpError(400, domain + ' is a public mailbox provider, not a company domain');
    var person = b.email && (b.name !== undefined || b.phone !== undefined) ? B.email(b.email) : null;
    return db.runTransaction(async function (tx) {
      var found = await accountOf(b, tx);
      if (!found) throw A.httpError(404, 'Customer not found');
      var uref = person ? found.ref.collection('users').doc(person) : null, us = uref ? await tx.get(uref) : null;
      if (person && !us.exists) throw A.httpError(404, 'That person is not on this account');
      var now = new Date().toISOString(), patch = { name: company, nameLower: B.nameKey(company), address: shipping, status: b.status, updatedAt: now };
      if (domain !== undefined) patch.domain = domain;
      tx.update(found.ref, patch);
      if (person) tx.update(uref, { name: B.clean(b.name, 120), phone: B.clean(b.phone, 40), updatedAt: now });
      tx.create(db.collection('omega_audit').doc(), { action: 'buyer-profile', orgId: org, customerId: found.id, by: caller.email, at: now,
        was: { name: found.data.name || '', address: found.data.address || null, status: found.data.status || 'active', domain: found.data.domain || '' },
        profile: { name: company, address: shipping, status: b.status, domain: domain === undefined ? (found.data.domain || '') : domain, person: person } });
      return { ok: true, note: 'Customer profile saved. Existing orders, invoices and subscription billing were not changed.' };
    });
  }
  if (b.action === 'create') {
    if (!B.clean(b.company) || !B.clean(b.name)) throw A.httpError(400, 'Company and contact name are required');
    var address = B.email(b.email), terms = b.terms ? P.terms(ctx.config.terms, b.terms) : {};
    /* One company, one account: a second "Amperage Capital" splits its
       orders, balance and people in two. Add the person to the one that
       exists instead. */
    if (!(await B.lookup(db, org, address))) {
      var same = await B.findByName(db, org, b.company);
      if (same) { var e = A.httpError(409, same.data.name + ' already has an account. Open it and add ' + address + ' to it instead.'); e.existingCustomerId = same.id; throw e; }
    }
    var account = await B.ensure(db, org, address, { company: b.company, name: b.name, terms: terms, source: 'office' }, caller);
    return { ok: true, customerId: account.id, created: account.created, portalUrl: portalUrl, appUrl: appUrl,
      note: account.created ? 'Customer record created. They activate their login using their own verified email.' : 'Customer already exists. Existing terms and identity were preserved.' };
  }
  if (b.action === 'terms') {
    var updated = P.terms(ctx.config.terms, b.terms);
    return db.runTransaction(async function (tx) {
      var found = await accountOf(b, tx);
      if (!found) throw A.httpError(404, 'Create this customer first');
      var now = new Date().toISOString();
      tx.update(found.ref, { terms: Object.assign({}, found.data.terms || {}, updated), updatedAt: now, termsUpdatedBy: caller.email });
      tx.create(db.collection('omega_audit').doc(), { action: 'buyer-terms', orgId: org, customerId: found.id, by: caller.email, at: now,
        was: found.data.terms || {}, terms: updated });
      return { ok: true, terms: updated, note: 'Applies to future prices. Existing invoices retain their agreed terms.' };
    });
  }
  /* A person joins the account (the office may move a login that signed in
     before it was added, when that stray account is empty), or a person's
     access or role changes. B.addUser / B.setUser are the one writer. */
  if (b.action === 'user-add') {
    if (!b.customerId) throw A.httpError(400, 'Which account?');
    var added = await B.addUser(db, org, b.customerId, b.email, { name: b.name, phone: b.phone, role: b.role === 'owner' ? 'owner' : 'user', status: 'active' }, caller.email, { source: 'office', rehome: true });
    return { ok: true, person: { email: added.email, role: added.role, status: added.status }, moved: added.moved,
      note: (added.moved ? 'Moved their login onto this account. ' : 'Added. ') + 'They sign in with ' + added.email + '; send them the customer app link.' };
  }
  if (b.action === 'user-status') {
    if (!b.customerId) throw A.httpError(400, 'Which account?');
    var changed = await B.setUser(db, org, b.customerId, b.email, { status: b.status == null ? null : b.status, role: b.role == null ? null : b.role }, caller.email, {});
    return { ok: true, person: changed, note: changed.status === 'active' ? 'Access on.' : 'Access off. Their past activity stays on the account.' };
  }
  if (b.action === 'invite') {
    var address2 = B.email(b.email), target = B.active(await B.lookup(db, org, address2)), mail = require('./_lib/mail');
    if (b.customerId && target.id !== P.id(b.customerId)) throw A.httpError(400, 'That person is not on this account');
    var wl = ctx.org.whiteLabel || {}, em = wl.embed || {}, brand = require('./_lib/logic-brand')(ctx.org);
    var storefront = await root.collection('storefront').doc('config').get();
    if (!em.mailFrom || !storefront.exists || storefront.data().emailCustomer !== true || !mail.configured()) throw A.httpError(409, 'Customer email delivery is not configured. Share the customer app link instead.');
    // A portal invitation, NOT a bearer sign-in link. Only the recipient can
    // authenticate; office staff never receive login tokens or passwords.
    var title = brand.name + ': your customer account';
    var result = await mail.send(address2, title, mail.wlLayout({ name: brand.name, supportEmail: brand.supportEmail || wl.supportEmail, attribution: brand.attribution || undefined }, 'Your customer account is ready',
      '<p>Sign in with <b>' + mail.esc(address2) + '</b> to see ' + mail.esc(target.data.name || 'your company') + '\'s orders, sites and equipment, and payment terms.</p>' + mail.button(appUrl, 'Open the app on your phone') + '<p style="margin-top:12px">On a computer: <a href="' + mail.esc(portalUrl) + '">' + mail.esc(portalUrl) + '</a></p>'), null, { from: em.mailFrom, replyTo: em.supportEmail || wl.supportEmail || undefined });
    if (!result.ok) throw A.httpError(502, 'Invitation was not sent. You can retry or share the customer app link.');
    await root.collection('customers').doc(target.id).set({ lastInvitedAt: new Date().toISOString(), lastInvitedBy: caller.email }, { merge: true });
    return { ok: true, note: 'Invitation sent. This does not verify their email or grant staff access.' };
  }
  throw A.httpError(400, 'Unknown customer action');
});
