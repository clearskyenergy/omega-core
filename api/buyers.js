/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var A = require('./_lib/admin'), X = require('./_lib/logic-access'), B = require('./_lib/buyer-accounts'), P = require('./_lib/logic-policy');
module.exports = A.handler(async function (req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'POST') throw A.httpError(405, 'GET or POST only');
  var caller = await A.authenticate(req), b = req.body || {}, org = A.safeOrg(req.method === 'GET' ? req.query.org : b.org);
  // Customer contact details and commercial terms are office/admin data.
  var ctx = await X.authorize(caller, org, true);
  if (!X.subscribed(ctx)) throw A.httpError(403, 'Omega Logic subscription is not active');
  var db = A.db(), root = db.collection('omega_orgs').doc(org);
  var portalUrl = 'https://silmarillion.clearskyomega.com/portals/customer/?org=' + encodeURIComponent(org);
  if (req.method === 'GET') {
    if (req.query.email) {
      var acct = await B.lookup(db, org, B.email(req.query.email));
      if (!acct) throw A.httpError(404, 'Customer not found');
      var orders = await db.collection('orders').where('orgId', '==', org).where('customer.email', '==', acct.user.email).orderBy('createdAt', 'desc').limit(100).get();
      return { customerId: acct.id, company: acct.data.name, name: acct.user.name || '', email: acct.user.email,
        status: acct.data.status, terms: P.terms(ctx.config.terms, acct.data.terms), portalUrl: portalUrl,
        orders: orders.docs.map(function (r) { var o = r.data(); return { id: r.id, orderNo: o.orderNo, status: o.status }; }), limited: orders.size === 100 };
    }
    var q = root.collection('customers').orderBy('__name__');
    if (req.query.after) q = q.startAfter(P.id(req.query.after));
    var rows = await q.limit(50).get();
    var customers = await Promise.all(rows.docs.map(async function (r) {
      var d = r.data(), users = await r.ref.collection('users').limit(25).get();
      return { id: r.id, company: d.name || '', status: d.status || 'active', terms: P.terms(ctx.config.terms, d.terms),
        users: users.docs.map(function (u) { var v = u.data(); return { email: v.email, name: v.name || '', role: v.role, activated: !!v.uid }; }), usersLimited: users.size === 25 };
    }));
    return { org: org, name: ctx.org.name || org, customers: customers, portalUrl: portalUrl, next: rows.size === 50 ? rows.docs[49].id : null };
  }
  var address = B.email(b.email);
  if (b.action === 'create') {
    if (!B.clean(b.company) || !B.clean(b.name)) throw A.httpError(400, 'Company and contact name are required');
    var terms = b.terms ? P.terms(ctx.config.terms, b.terms) : {};
    var account = await B.ensure(db, org, address, { company: b.company, name: b.name, terms: terms, source: 'office' }, caller);
    return { ok: true, customerId: account.id, created: account.created, portalUrl: portalUrl,
      note: account.created ? 'Customer record created. They activate their login using their own verified email.' : 'Customer already exists. Existing terms and identity were preserved.' };
  }
  if (b.action === 'terms') {
    var updated = P.terms(ctx.config.terms, b.terms);
    return db.runTransaction(async function (tx) {
      var found = await B.lookup(db, org, address, tx);
      if (!found) throw A.httpError(404, 'Create this customer first');
      var ref = root.collection('customers').doc(found.id), now = new Date().toISOString();
      tx.update(ref, { terms: Object.assign({}, found.data.terms || {}, updated), updatedAt: now, termsUpdatedBy: caller.email });
      tx.create(db.collection('omega_audit').doc(), { action: 'buyer-terms', orgId: org, customerId: found.id, by: caller.email, at: now,
        was: found.data.terms || {}, terms: updated });
      return { ok: true, terms: updated, note: 'Applies to future prices. Existing invoices retain their agreed terms.' };
    });
  }
  if (b.action === 'invite') {
    var target = B.active(await B.lookup(db, org, address)), mail = require('./_lib/mail');
    var wl = ctx.org.whiteLabel || {}, em = wl.embed || {};
    var storefront = await root.collection('storefront').doc('config').get();
    if (!em.mailFrom || !storefront.exists || storefront.data().emailCustomer !== true || !mail.configured()) throw A.httpError(409, 'Customer email delivery is not configured. Share the customer portal link instead.');
    // A portal invitation, NOT a bearer sign-in link. Only the recipient can
    // authenticate; office staff never receive login tokens or passwords.
    var title = (ctx.org.name || org) + ': your customer account';
    var result = await mail.send(address, title, mail.wlLayout({ name: ctx.org.name || org, supportEmail: wl.supportEmail }, 'Your customer account is ready',
      '<p>Sign in with <b>' + mail.esc(address) + '</b> to activate your customer account and view your orders and payment terms.</p>' + mail.button(portalUrl, 'Open your account')), null, { from: em.mailFrom, replyTo: em.supportEmail || wl.supportEmail || undefined });
    if (!result.ok) throw A.httpError(502, 'Invitation was not sent. You can retry or share the portal link.');
    await root.collection('customers').doc(target.id).set({ lastInvitedAt: new Date().toISOString(), lastInvitedBy: caller.email }, { merge: true });
    return { ok: true, note: 'Invitation sent. This does not verify their email or grant staff access.' };
  }
  throw A.httpError(400, 'Unknown customer action');
});
