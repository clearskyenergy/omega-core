/* ═══════════════════════════════════════════════════════════════════════════
   GET  /api/my-sites?org=<orgId>       the customer's sites and every unit
                                        they hold, with where it is, what
                                        site it is bound to, and its coverage
   POST /api/my-sites { org, action, … }
        site        create or edit one of their own sites (name, address,
                    interconnection details)
        assign      bind a unit they received to one of their sites
        received    the unit arrived (accepted or damaged)
        commissioned the unit was commissioned on a date, by whom
        destination "this one is going there": a site named before the
                    unit arrives; receipt binds it there, the office confirms
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   The END CUSTOMER'S side of custody (api/_lib/custody.js): they receive at
   the site, bind each unit to the site it is interconnected at, and see
   the warranty or SLA start. Same rules as the office — one status
   machine, one coverage engine — so a unit the customer commissions on
   the phone is the same record the office sees.

   Scope, as everywhere on the portal: the VERIFIED email is the control.
   A unit is theirs when the order it was built for belongs to their
   company ACCOUNT (B.accountOrders: its customerId, or billed to one of its
   people); a site is theirs when it carries their account. Every active
   person on the account works the same sites and units.
   Nothing else is reachable, and a move the rules refuse says why.
   Scrubbed 500s, like api/my-orders.js.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var A = require('./_lib/admin'), B = require('./_lib/buyer-accounts'), P = require('./_lib/logic-policy'), C = require('./_lib/custody');
var CUSTOMER_MOVES = { received: 'receive', assign: 'assign', installed: 'install', commissioned: 'commission' };

function root(db, org) { return db.collection('omega_orgs').doc(org); }
/* The account's orders — B.accountOrders is the one reader: its customerId,
   or billed to any active person on the account. */
async function myOrders(db, org, email, acct) {
  return (await B.accountOrders(db, org, email, acct, { limit: 100 })).docs;
}
async function myUnits(db, org, orderIds) {
  var units = [];
  for (var i = 0; i < orderIds.length; i += 10) { var s = await db.collection('plant_units').where('orgId', '==', org).where('orderId', 'in', orderIds.slice(i, i + 10)).limit(400).get(); s.docs.forEach(function (d) { var u = d.data(); if (u.shipUnit) units.push(u); }); }
  return units;
}
function pub(u, product, now, order) {
  var c = C.custodyOf(u), shipped = order && order.shipment && order.shipment.shippedAt ? String(order.shipment.shippedAt).slice(0, 10) : null;
  return { serial: u.serial, sku: u.sku, name: product ? product.name : u.sku, orderNo: u.orderNo || (order && order.orderNo) || null,
    status: c.status || (u.at === 'ready' ? 'ready to ship' : 'being built'), label: c.status ? C.label(c.status) : (u.at === 'ready' ? 'ready to ship' : 'being built'), state: c.state || null,
    siteId: c.siteId || null, siteName: c.siteName || null, position: c.position || '', shippedAt: c.shippedAt || shipped, receivedAt: c.receivedAt || null, installedAt: c.installedAt || null, commissionedAt: c.commissionedAt || null,
    replacedBy: c.replacedBy || null, replaces: c.replaces || null,
    plannedSiteId: c.plannedSiteId || null, plannedSiteName: c.plannedSiteName || null, confirmation: C.confirmation(c), confirmedAt: c.confirmedAt || null,
    coverage: C.coverageWithInheritance(product, u, now, shipped).map(function (cv) { return { id: cv.templateId, type: cv.type, provider: cv.provider, status: cv.status, why: cv.why, from: cv.startDate, until: cv.endDate, termMonths: cv.termMonths, metrics: cv.metrics, docUrl: cv.docUrl }; }) };
}
function pubSite(s) { return { id: s.id, name: s.name, address: s.address || {}, endCustomer: s.endCustomer || '', interconnection: s.interconnection || {}, contact: s.contact || {}, notes: s.notes || '', status: s.status || 'active' }; }

module.exports = A.handler(async function (req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'POST') throw A.httpError(405, 'GET or POST only');
  try {
    var caller = await A.authenticate(req), b = req.body || {}, org = A.safeOrg(req.method === 'GET' ? req.query.org : b.org);
    if (!org) throw A.httpError(400, 'Valid supplier required');
    if (!caller.claims || caller.claims.email_verified !== true) throw A.httpError(403, 'Please confirm your email address, then sign in again.');
    var ctx = await B.context(org), db = A.db(), email = B.email(caller.email), acct = B.active(await B.lookup(db, org, email)), now = new Date().toISOString();
    var orders = await myOrders(db, org, email, acct), byOrder = {}; orders.forEach(function (d) { byOrder[d.id] = d.data(); });
    var catalog = await root(db, org).collection('storefront').doc('config').get(), byP = {}; (catalog.exists ? catalog.data().products || [] : []).forEach(function (p) { if (p && p.sku) byP[p.sku] = p; });
    var siteRows = await root(db, org).collection('sites').where('customerId', '==', acct.id).limit(200).get(), mySites = siteRows.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }).filter(function (s) { return s.status !== 'inactive'; });

    if (req.method === 'GET') {
      var units = await myUnits(db, org, Object.keys(byOrder));
      var perSite = {}; units.forEach(function (u) { var sid = C.custodyOf(u).siteId; if (sid) perSite[sid] = (perSite[sid] || 0) + 1; });
      return { org: org, brand: require('./_lib/logic-brand')(ctx.org), customerId: acct.id,
        sites: mySites.map(function (s) { return Object.assign(pubSite(s), { units: perSite[s.id] || 0 }); }),
        units: units.filter(function (u) { return C.custodyOf(u).status || u.at === 'ready'; }).map(function (u) { return pub(u, byP[u.sku], now, byOrder[u.orderId]); }),
        moves: { received: ['', 'in_transit', 'delivered'], assign: ['delivered', 'received', 'assigned'], installed: ['assigned', 'received'], commissioned: ['assigned', 'installed', 'received'] } };
    }

    if (b.action === 'site') {
      var id = b.id ? P.id(b.id) : null;
      return db.runTransaction(async function (tx) {
        var existing = id ? await tx.get(root(db, org).collection('sites').doc(id)) : null;
        if (id && (!existing.exists || existing.data().customerId !== acct.id)) throw A.httpError(404, 'Site not found on your account');
        var rec = C.site(Object.assign({}, b, { customerId: acct.id, lifecycleSiteId: existing && existing.exists ? existing.data().lifecycleSiteId : null }), existing && existing.exists ? existing.data() : null);
        rec.customerId = acct.id;
        var sref = existing && existing.exists ? existing.ref : root(db, org).collection('sites').doc(C.siteId(acct.id, rec));
        if (!id) { var clash = await tx.get(sref); if (clash.exists) throw A.httpError(409, 'You already have a site with that name and ZIP'); }
        var doc = Object.assign({ orgId: org }, rec, { updatedAt: now, updatedBy: email });
        if (existing && existing.exists) tx.update(sref, doc); else tx.create(sref, Object.assign(doc, { createdAt: now, createdBy: email, source: 'customer' }));
        return { ok: true, site: pubSite(Object.assign({ id: sref.id }, doc)) };
      });
    }

    if (b.action === 'destination') {
      var dserial = C.serial(b.serial), dref = db.collection('plant_units').doc(org + '__' + dserial);
      return db.runTransaction(async function (tx) {
        var ds = await tx.get(dref); if (!ds.exists || ds.data().orgId !== org || !byOrder[ds.data().orderId]) throw A.httpError(404, 'That serial is not on one of your orders');
        var dsite = null; if (b.siteId) { dsite = mySites.filter(function (x) { return x.id === P.id(b.siteId); })[0]; if (!dsite) throw A.httpError(404, 'Site not found on your account'); }
        var dr = C.destination(ds.data(), { siteId: dsite ? dsite.id : '', siteName: dsite ? dsite.name : '', position: b.position, note: b.note }, email, now, 'customer'); dr.event.orderId = ds.data().orderId; dr.patch['custody.customerId'] = acct.id;
        tx.update(dref, dr.patch); tx.create(dref.collection('custody_events').doc(), Object.assign({ orgId: org, serial: dserial }, dr.event));
        var dafter = JSON.parse(JSON.stringify(ds.data())); Object.keys(dr.patch).forEach(function (k) { var parts = k.split('.'), t = dafter; parts.slice(0, -1).forEach(function (p) { t = t[p] || (t[p] = {}); }); t[parts[parts.length - 1]] = dr.patch[k]; });
        return { ok: true, unit: pub(dafter, byP[dafter.sku], now, byOrder[dafter.orderId]) };
      });
    }
    var move = CUSTOMER_MOVES[b.action]; if (!move) throw A.httpError(400, 'Unsupported action');
    var serial = C.serial(b.serial), ref = db.collection('plant_units').doc(org + '__' + serial);
    return db.runTransaction(async function (tx) {
      var s = await tx.get(ref); if (!s.exists || s.data().orgId !== org || !byOrder[s.data().orderId]) throw A.httpError(404, 'That serial is not on one of your orders');
      var u = s.data(), site = null;
      if (b.siteId) { site = mySites.filter(function (x) { return x.id === P.id(b.siteId); })[0]; if (!site) throw A.httpError(404, 'Site not found on your account'); }
      if (move === 'assign' && !site) throw A.httpError(400, 'Choose the site');
      var body = { at: b.at, condition: b.condition === 'damaged' ? 'damaged' : 'accepted', siteId: site ? site.id : undefined, siteName: site ? site.name : undefined, position: b.position, installer: b.installer, endCustomer: site ? site.endCustomer : undefined, note: b.note };
      var v = C.judge(u, move, body); if (!v.ok) throw A.httpError(409, v.say);
      if (v.action === 'duplicate') return { ok: true, duplicate: true, unit: pub(u, byP[u.sku], now, byOrder[u.orderId]) };
      var ap = C.apply(u, move, body, email, now, 'customer'); ap.patch['custody.customerId'] = acct.id; ap.event.orderId = u.orderId;
      tx.update(ref, ap.patch); tx.create(ref.collection('custody_events').doc(), Object.assign({ orgId: org, serial: serial }, ap.event));
      var after = JSON.parse(JSON.stringify(u)); Object.keys(ap.patch).forEach(function (k) { var parts = k.split('.'), t = after; parts.slice(0, -1).forEach(function (p) { t = t[p] || (t[p] = {}); }); t[parts[parts.length - 1]] = ap.patch[k]; });
      return { ok: true, unit: pub(after, byP[u.sku], now, byOrder[u.orderId]) };
    });
  } catch (e) { if (e.status && e.status < 500) throw e; console.error('[my-sites]', e); throw A.httpError(500, 'Could not update your sites right now. Please retry.'); }
});
