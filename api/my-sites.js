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
      Many sites at once (a PO's list of sites, pasted or uploaded):
        sites-preview { text }            the list read, matched against the
                    account's sites, new ones geocoded (Census only, inside
                    the account's daily allowance: api/_lib/site-geo.js)
        sites-create  { rows: [{ name, address, lat, lng, ref }] }
                    one transaction, idempotent by address on the account
        plan-preview  { orderNo, sites: [{ siteId, units }], replan? }
                    the order's units spread over those sites (C.spread)
        plan-apply    { orderNo, sites, replan?, planKey, confirm: true }
                    the same plan recomputed here, each unit re-read in its
                    transaction and given its "going to" (C.destination)
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
var A = require('./_lib/admin'), B = require('./_lib/buyer-accounts'), P = require('./_lib/logic-policy'), C = require('./_lib/custody'), SG = require('./_lib/site-geo'), Pt = require('./_lib/portal');
var crypto = require('crypto');
var PLAN_CHUNK = 25;   // units per transaction: the plant scans these units while they are built
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
/* A site as the CUSTOMER reads it, key by key: api/_lib/portal.js
   publicSite (the details are shown only when they are the customer's own
   entries — what the office typed about a site stays in the office). */
var pubSite = Pt.publicSite, ownEntries = Pt.ownSiteEntries, DETAILS = ['interconnection', 'contact', 'endCustomer', 'notes'];
/* What the customer entered, kept apart from the record the office also
   edits: their previous entries, with what they sent now on top (a field
   they did not send is theirs as it was). Cleaned by the same C.site. */
function entriesOf(b, before, rec, email, now) {
  var prev = before || {}, sent = function (k) { return b[k] !== undefined; };
  var merged = { name: rec.name, address: rec.address,
    interconnection: Object.assign({}, prev.interconnection || {}, b.interconnection && typeof b.interconnection === 'object' ? b.interconnection : {}),
    contact: Object.assign({}, prev.contact || {}, b.contact && typeof b.contact === 'object' ? b.contact : {}),
    endCustomer: sent('endCustomer') ? b.endCustomer : prev.endCustomer, notes: sent('notes') ? b.notes : prev.notes };
  var c = C.site(merged);
  return { interconnection: c.interconnection, contact: c.contact, endCustomer: c.endCustomer, notes: c.notes, at: now, by: email };
}
/* An edit from the customer changes what they sent; a detail they did not
   send (or cannot see: the office's) is kept, never wiped. */
function keepUnsent(b, existing) {
  if (!existing) return b;
  var out = Object.assign({}, b);
  DETAILS.forEach(function (k) {
    if (k === 'interconnection' || k === 'contact') out[k] = Object.assign({}, existing[k] || {}, b[k] && typeof b[k] === 'object' ? b[k] : {});
    else if (b[k] === undefined) out[k] = existing[k];
  });
  return out;
}
function poOf(o) { return (o.purchaseOrder && o.purchaseOrder.number) || o.poNumber || null; }

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
    var siteRows = await root(db, org).collection('sites').where('customerId', '==', acct.id).limit(500).get(), mySites = siteRows.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }).filter(function (s) { return s.status !== 'inactive'; });

    if (req.method === 'GET') {
      var units = await myUnits(db, org, Object.keys(byOrder));
      /* every unit, being built or not: "4 going here" counts the ones still
         on the line, which is a whole order the week the PO lands */
      var perSite = {}, plannedAt = {}, perOrder = {};
      units.forEach(function (u) { var c = C.custodyOf(u); if (c.siteId) perSite[c.siteId] = (perSite[c.siteId] || 0) + 1; else if (c.plannedSiteId) plannedAt[c.plannedSiteId] = (plannedAt[c.plannedSiteId] || 0) + 1; (perOrder[u.orderId] = perOrder[u.orderId] || []).push(u); });
      return { org: org, brand: require('./_lib/logic-brand')(ctx.org), customerId: acct.id,
        sites: mySites.map(function (s) { return Object.assign(pubSite(s), { units: perSite[s.id] || 0, planned: plannedAt[s.id] || 0 }); }),
        /* the orders a site list can be spread over, by orderNo: the order's
           document id never reaches the customer (api/_lib/portal.js) */
        orders: orders.filter(function (d) { return perOrder[d.id]; }).map(function (d) { var o = d.data(); return Object.assign({ orderNo: o.orderNo || null, po: poOf(o) }, C.unitCounts(perOrder[d.id])); }),
        units: units.filter(function (u) { return C.custodyOf(u).status || u.at === 'ready'; }).map(function (u) { return pub(u, byP[u.sku], now, byOrder[u.orderId]); }),
        moves: { received: ['', 'in_transit', 'delivered'], assign: ['delivered', 'received', 'assigned'], installed: ['assigned', 'received'], commissioned: ['assigned', 'installed', 'received'] } };
    }

    /* Re-read the login's pointer inside every write: if the office moved
       this login to another company meanwhile (buyers user-add rehome),
       the move and this write conflict instead of a site or custody stamp
       landing on the account that was just emptied and suspended. */
    var still = async function (tx) {
      var p = await tx.get(root(db, org).collection('customer_index').doc(email));
      if (!p.exists || P.id(p.data().customerId) !== acct.id) throw A.httpError(409, 'Your login was just moved to another account. Reload and try again.');
    };
    /* ── many sites at once ──────────────────────────────────────────── */
    if (b.action === 'sites-preview') {
      if (String(b.text == null ? '' : b.text).length > C.MAX_SITE_TEXT) throw A.httpError(400, 'That list is too long; paste at most ' + C.MAX_SITE_ROWS + ' sites at a time.');
      var pv = C.sitesPreview(b.text, mySites, acct.id);
      /* the pins: new rows only, Census only, cache first, inside the
         account's (and all customers') daily allowance — a miss, a row not
         reached or an allowance spent is shown without a pin, never refused */
      var geo = await SG.locate(db, org, pv.rows, 'customer', acct.id, now);
      return Object.assign({ ok: true, geoLimited: geo.geoLimited }, pv);
    }
    if (b.action === 'sites-create') {
      var recs = C.siteListInputs(b.rows, acct.id);
      return db.runTransaction(async function (tx) {
        await still(tx);
        /* the account's sites as they are NOW, and every candidate id, read
           before anything is written */
        var cur = await tx.get(root(db, org).collection('sites').where('customerId', '==', acct.id).limit(500)), have = cur.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
        var pl = C.placeSites(recs, have, acct.id), taken = {}, made = [];
        for (var i = 0; i < pl.create.length; i++) {
          var item = pl.create[i], id = null;
          for (var j = 0; j < item.candidates.length && !id; j++) { var cand = item.candidates[j]; if (taken[cand]) continue; taken[cand] = true; if (!(await tx.get(root(db, org).collection('sites').doc(cand))).exists) id = cand; }
          if (!id) throw A.httpError(409, 'Row ' + (item.row + 1) + ' (' + item.rec.name + '): too many sites share that name and ZIP. Rename it and try again.');
          made.push({ id: id, doc: Object.assign({ orgId: org }, item.rec, { customerId: acct.id, source: 'customer-list', createdAt: now, createdBy: email, updatedAt: now, updatedBy: email,
            customerEntries: { interconnection: item.rec.interconnection, contact: item.rec.contact, endCustomer: item.rec.endCustomer, notes: item.rec.notes, at: now, by: email } }) });
        }
        made.forEach(function (m) { tx.create(root(db, org).collection('sites').doc(m.id), m.doc); });
        return { ok: true, created: made.map(function (m) { return pubSite(Object.assign({ id: m.id }, m.doc)); }), existing: pl.existing.map(pubSite) };
      });
    }
    if (b.action === 'plan-preview' || b.action === 'plan-apply') {
      var ono = String(b.orderNo == null ? '' : b.orderNo).trim(), od = orders.filter(function (d) { return ono && d.data().orderNo === ono; })[0];
      if (!od) throw A.httpError(404, 'That order is not on your account');
      var chosen = C.planSites(b.sites, mySites, 'Site not found on your account');
      /* a unit of the order stamped for ANOTHER account (the office imported
         or replaced it onto a resale account) is left out, as the office's
         door leaves it out: the customer's plan never re-stamps it */
      var foreign = function (u) { var a = C.stampedAccount(u); return a && a !== acct.id ? 'On another customer account' : null; };
      var ounits = await myUnits(db, org, [od.id]), plan = C.spread(ounits, chosen, { replan: b.replan === true, exclude: foreign });
      if (b.action === 'plan-preview') return Object.assign({ ok: true, orderNo: ono }, plan);
      if (b.confirm !== true) throw A.httpError(400, 'Preview the plan, then confirm it');
      if (plan.problems.length) throw A.httpError(409, plan.problems[0]);
      if (!C.planMatches(plan, b)) throw A.httpError(409, 'The order changed since your preview. Preview it again.');
      var todo = C.planWrites(plan), more = todo.length > C.MAX_PLAN_UNITS, was = {}, planId = 'plan_' + crypto.randomBytes(6).toString('hex'), applied = [], skipped = [];
      todo = todo.slice(0, C.MAX_PLAN_UNITS);
      ounits.forEach(function (u) { was[u.serial] = C.custodyOf(u).plannedSiteId || ''; });
      for (var c0 = 0; c0 < todo.length; c0 += PLAN_CHUNK) {
        var chunk = todo.slice(c0, c0 + PLAN_CHUNK);
        /* each unit re-read inside its transaction: a scan, a load or a
           colleague may have moved it since the preview. Outcomes are
           returned, never pushed from inside, so a retried transaction
           cannot count twice. */
        var r = await db.runTransaction(async function (tx) {
          await still(tx);
          var snaps = await Promise.all(chunk.map(function (a) { return tx.get(db.collection('plant_units').doc(org + '__' + a.serial)); })), ok = [], no = [], writes = [];
          chunk.forEach(function (a, k) {
            var u = snaps[k].exists ? snaps[k].data() : null, p = u ? C.plannable(u) : null, no1 = u && a.siteId ? foreign(u) : null;
            if (!u || u.orgId !== org || u.orderId !== od.id) { no.push({ serial: a.serial, why: 'No longer on this order' }); return; }
            if (!p.ok) { no.push({ serial: a.serial, why: p.say }); return; }
            if (no1) { no.push({ serial: a.serial, why: no1 }); return; }
            if ((C.custodyOf(u).plannedSiteId || '') !== was[a.serial]) { no.push({ serial: a.serial, why: 'Changed since your preview' }); return; }
            var dr = C.destination(u, { siteId: a.siteId, siteName: a.siteName }, email, now, 'customer');
            dr.event.orderId = od.id; dr.event.via = 'site-list'; dr.event.planId = planId;
            if (a.siteId && !C.custodyOf(u).customerId) dr.patch['custody.customerId'] = acct.id;
            writes.push({ ref: snaps[k].ref, serial: a.serial, dr: dr }); ok.push(a);
          });
          writes.forEach(function (w) { tx.update(w.ref, w.dr.patch); tx.create(w.ref.collection('custody_events').doc(), Object.assign({ orgId: org, serial: w.serial }, w.dr.event)); });
          return { ok: ok, no: no };
        });
        applied = applied.concat(r.ok); skipped = skipped.concat(r.no);
      }
      return { ok: true, planId: planId, orderNo: ono, applied: applied.length, skipped: skipped, more: more, perSite: plan.perSite, assignments: C.planResult(plan, applied, skipped),
        released: plan.released, leftover: plan.leftover, elsewhere: plan.elsewhere, notPlanned: plan.notPlanned, planKey: plan.planKey };
    }

    if (b.action === 'site') {
      var id = b.id ? P.id(b.id) : null;
      return db.runTransaction(async function (tx) {
        await still(tx);
        var existing = id ? await tx.get(root(db, org).collection('sites').doc(id)) : null;
        if (id && (!existing.exists || existing.data().customerId !== acct.id)) throw A.httpError(404, 'Site not found on your account');
        var before = existing && existing.exists ? existing.data() : null;
        var rec = C.site(Object.assign({}, keepUnsent(b, before), { customerId: acct.id, lifecycleSiteId: before ? before.lifecycleSiteId : null }), before);
        rec.customerId = acct.id;
        var sref = before ? existing.ref : root(db, org).collection('sites').doc(C.siteId(acct.id, rec));
        if (!id) { var clash = await tx.get(sref); if (clash.exists) throw A.httpError(409, 'You already have a site with that name and ZIP'); }
        var doc = Object.assign({ orgId: org }, rec, { updatedAt: now, updatedBy: email, customerEntries: entriesOf(b, before ? ownEntries(before) : null, rec, email, now) });
        if (existing && existing.exists) tx.update(sref, doc); else tx.create(sref, Object.assign(doc, { createdAt: now, createdBy: email, source: 'customer' }));
        return { ok: true, site: pubSite(Object.assign({ id: sref.id }, doc)) };
      });
    }

    if (b.action === 'destination') {
      var dserial = C.serial(b.serial), dref = db.collection('plant_units').doc(org + '__' + dserial);
      return db.runTransaction(async function (tx) {
        await still(tx);
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
      await still(tx);
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
