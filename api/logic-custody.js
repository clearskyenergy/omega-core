/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   GET  /api/logic-custody?org=            sites, counts by status, exceptions,
                                            coverage templates
        &serial=<serial>                    the unit passport: custody, coverage,
                                            every custody event and plant scan
        &site=<siteId>                      one site and the units bound to it
        &view=exceptions                    the gaps that lose warranty claims
        &view=register                      one flat row per unit: parties,
                                            site, shipping, coverage (the
                                            spreadsheet)
        &template=assignment                the CSV to send a customer
        &view=plan&customerId=<id>          one customer ACCOUNT's sites and its
                                            orders with units, for "many
                                            sites at once"
   POST /api/logic-custody { org, action, … }
        site          create or edit a site (an end location with its
                      interconnection details)
        move          receive · assign · install · commission · in-service ·
                      rma-open · rma-return · decommission, one serial
        destination   "this one is going there" before it is bound; honoured
                      at receipt
        confirm       the office confirms a site the customer declared
        detail        reseller, end customer, installer, notes, position,
                      commissioning report — links, not moves
        state         damaged · lost · quarantined · scrapped · clear
        replace       an RMA'd unit is replaced; coverage transfers its
                      remaining term to the new serial
        receive-load  the customer's load arrived: expected (the leg) vs
                      scanned, shorts and overages named
        import        a spreadsheet of site assignments, mapped, dry run
                      first, idempotent on commit
        mapping-save  remember a customer's column names for next time
      Many sites at once (a customer's PO list of sites), for ONE account:
        sites-preview { customerId, text }   the list read and matched
        sites-create  { customerId, rows }   one transaction, idempotent
        plan-preview  { orderId, sites: [{ siteId, units }], replan? }
        plan-apply    { orderId, sites, replan?, planKey, confirm: true }
      — the same actions and rules as api/my-sites.js, scoped to the office

   Every rule is in api/_lib/custody.js; this file reads and writes. A move
   is judged inside the transaction that applies it, so two scanners cannot
   both assign the same unit. Every applied move appends one event under
   the unit; nothing here edits or deletes an event.

   Any active member of the workspace may record custody (the builders
   receive, the commissioning engineer commissions); coverage templates are
   catalog fields and change through the catalog endpoint. */
'use strict';
var A = require('./_lib/admin'), X = require('./_lib/logic-access'), P = require('./_lib/logic-policy'), C = require('./_lib/custody'), Plant = require('./_lib/plant'), B = require('./_lib/buyer-accounts');
var SG = require('./_lib/site-geo');
var PLAN_CHUNK = 25;   // units per transaction: the plant scans these units while they are built
var UNIT_FIELDS = ['serial', 'sku', 'unitType', 'shipUnit', 'rootSerial', 'woId', 'orderId', 'orderNo', 'customerId', 'at', 'hold', 'inventoryStatus', 'custody', 'createdAt'];
var MAX_UNITS = 2000;

function root(db, org) { return db.collection('omega_orgs').doc(org); }
async function products(db, org) { var s = await root(db, org).collection('storefront').doc('config').get(); return s.exists ? (s.data().products || []) : []; }
async function sites(db, org) { var q = await root(db, org).collection('sites').orderBy('__name__').limit(500).get(); return q.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }); }
async function tracked(db, org) {
  var q = db.collection('plant_units').where('orgId', '==', org).orderBy('createdAt', 'desc').limit(MAX_UNITS); if (q.select) q = q.select.apply(q, UNIT_FIELDS);
  var s = await q.get(); return { units: s.docs.map(function (d) { return d.data(); }).filter(function (u) { return u.shipUnit && u.inventoryStatus !== 'void'; }), limited: s.size === MAX_UNITS };
}
function unitRef(db, org, serial) { return db.collection('plant_units').doc(org + '__' + serial); }
function view(u, byProduct, now) {
  var c = C.custodyOf(u);
  return { serial: u.serial, sku: u.sku, unitType: u.unitType || 'unit', orderId: u.orderId || null, orderNo: u.orderNo || null, customerId: u.customerId || c.customerId || null, at: u.at || '', hold: u.hold || null,
    custody: Object.assign({}, c, { label: C.label(c.status), confirmation: C.confirmation(c) }), coverage: C.coverageWithInheritance(byProduct[u.sku], u, now) };
}
function eventDoc(unitRef) { return unitRef.collection('custody_events').doc(); }
/* Which customer ACCOUNT a unit belongs to: its custody stamp, its own
   field, else the account of the order it was built for (the order's
   customerId, or the account of the person it is billed to). Custody follows
   the account so every person on it sees the unit and its site. `order` may
   be passed when it is already read (a transaction read must come first). */
async function accountOfUnit(db, org, u, order) {
  var c = C.custodyOf(u); if (c.customerId) return c.customerId; if (u.customerId) return u.customerId;
  if (!u.orderId) return null;
  var o = order; if (o === undefined) { var os = await db.collection('orders').doc(P.id(u.orderId)).get(); o = os.exists ? os.data() : null; }
  return o && o.orgId === org ? B.accountOfOrder(db, org, o) : null;
}
/* A site on one customer's account never takes another customer's unit: the
   warranty would start at a site the owner cannot see. */
function siteFits(site, owner) { if (site && site.customerId && owner && site.customerId !== owner) throw A.httpError(409, 'That site belongs to another customer account'); }
/* An account sites may be created on: it exists and is open — not turned
   off, not superseded or merged into another. */
function openAccount(d) { return !!d && ['disabled', 'suspended', 'cancelled'].indexOf(d.status) < 0 && !d.supersededBy && !d.mergedInto; }
function poOf(o) { return (o.purchaseOrder && o.purchaseOrder.number) || o.poNumber || null; }
function accountId(v, say) { if (!v) throw A.httpError(400, say || 'Choose the customer account'); return P.id(v); }

module.exports = A.handler(async function (req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'POST') throw A.httpError(405, 'GET or POST only');
  var caller = await A.authenticate(req), b = req.body || {}, org = A.safeOrg(req.method === 'GET' ? req.query.org : b.org);
  var ctx = await X.authorize(caller, org, false), db = A.db(), now = new Date().toISOString(), by = caller.email;
  if (!X.subscribed(ctx)) throw A.httpError(403, 'Omega Logic subscription required');
  var brand = require('./_lib/logic-brand')(ctx.org);

  if (req.method === 'GET') {
    if (req.query.template) { res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', 'attachment; filename="site-assignment-template.csv"'); res.end(C.csvTemplate()); return; }
    /* one account's sites and its orders with units: what the office's
       "many sites at once" pickers need, without the whole fleet */
    if (req.query.view === 'plan') {
      var pcid = accountId(req.query.customerId), pc = await root(db, org).collection('customers').doc(pcid).get();
      if (!pc.exists) throw A.httpError(404, 'Customer account not found');
      var porders = (await B.accountOrders(db, org, null, { id: pcid }, { limit: 100 })).docs, pids = porders.map(function (d) { return d.id; }), punits = [];
      for (var pi = 0; pi < pids.length; pi += 10) { var ps = await db.collection('plant_units').where('orgId', '==', org).where('orderId', 'in', pids.slice(pi, pi + 10)).limit(MAX_UNITS).get(); ps.docs.forEach(function (d) { var pu = d.data(); if (pu.shipUnit) punits.push(pu); }); }
      var byOrd = {}, boundAt = {}, goingAt = {};
      punits.forEach(function (pu) { var pcu = C.custodyOf(pu); (byOrd[pu.orderId] = byOrd[pu.orderId] || []).push(pu); if (pcu.siteId) boundAt[pcu.siteId] = (boundAt[pcu.siteId] || 0) + 1; else if (pcu.plannedSiteId) goingAt[pcu.plannedSiteId] = (goingAt[pcu.plannedSiteId] || 0) + 1; });
      var psites = await root(db, org).collection('sites').where('customerId', '==', pcid).limit(500).get();
      return { brand: brand, customer: { id: pcid, name: pc.data().name || pcid, status: pc.data().status || 'active', open: openAccount(pc.data()) },
        sites: psites.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }).filter(function (sx) { return sx.status !== 'inactive'; }).map(function (sx) { return { id: sx.id, name: sx.name, address: sx.address || {}, ref: sx.ref || '', lat: sx.lat == null ? null : sx.lat, lng: sx.lng == null ? null : sx.lng, units: boundAt[sx.id] || 0, planned: goingAt[sx.id] || 0 }; }),
        orders: porders.filter(function (d) { return byOrd[d.id]; }).map(function (d) { var o = d.data(); return Object.assign({ orderId: d.id, orderNo: o.orderNo || null, po: poOf(o) }, C.unitCounts(byOrd[d.id])); }) };
    }
    var prods = await products(db, org), byP = {}; prods.forEach(function (p) { if (p && p.sku) byP[p.sku] = p; });
    if (req.query.serial) {
      var serial = Plant.serialFrom(req.query.serial) || C.serial(req.query.serial), ref = unitRef(db, org, serial), s = await ref.get();
      if (!s.exists || s.data().orgId !== org) throw A.httpError(404, 'Serial not found');
      var u = s.data(), ev = await ref.collection('custody_events').orderBy('at', 'desc').limit(100).get();
      var scans = await db.collection('plant_scans').where('orgId', '==', org).where('serial', '==', serial).orderBy('createdAt', 'desc').limit(50).get();
      var site = C.custodyOf(u).siteId ? await root(db, org).collection('sites').doc(C.custodyOf(u).siteId).get() : null;
      var replaced = C.custodyOf(u).replacedBy ? await unitRef(db, org, C.custodyOf(u).replacedBy).get() : null, replaces = C.custodyOf(u).replaces ? await unitRef(db, org, C.custodyOf(u).replaces).get() : null;
      return { brand: brand, unit: view(u, byP, now), product: byP[u.sku] ? { sku: u.sku, name: byP[u.sku].name, coverage: C.templatesOf(byP[u.sku]) } : null,
        site: site && site.exists ? Object.assign({ id: site.id }, site.data()) : null,
        events: ev.docs.map(function (d) { return d.data(); }), scans: scans.docs.map(function (d) { var x = d.data(); return { at: x.createdAt || x.at, station: x.station, ok: x.ok, kind: x.kind || 'scan', say: x.verdict && x.verdict.say || '' }; }),
        replacedBy: replaced && replaced.exists ? view(replaced.data(), byP, now) : null, replaces: replaces && replaces.exists ? view(replaces.data(), byP, now) : null, moves: C.MOVES, states: C.STATES };
    }
    var all = await tracked(db, org), list = all.units;
    if (req.query.site) {
      var sd = await root(db, org).collection('sites').doc(P.id(req.query.site)).get(); if (!sd.exists) throw A.httpError(404, 'Site not found');
      var here = list.filter(function (u) { return C.custodyOf(u).siteId === sd.id; }).map(function (u) { return view(u, byP, now); });
      return { brand: brand, site: Object.assign({ id: sd.id }, sd.data()), units: here, exceptions: C.exceptions(list.filter(function (u) { return C.custodyOf(u).siteId === sd.id; }), prods, now), limited: all.limited };
    }
    if (req.query.view === 'exceptions') return { brand: brand, exceptions: C.exceptions(list, prods, now), sampled: list.length, limited: all.limited };
    if (req.query.view === 'register') {
      /* one flat row per shipping unit, at the plant or beyond, joined to
         its order (buyer, PO, load) and its site; the columns a spreadsheet
         would want. Orders are read one by one (≤ 300 distinct). */
      var ids = {}; list.forEach(function (u) { if (u.orderId) ids[u.orderId] = true; });
      var orderIds = Object.keys(ids).slice(0, 300), orderDocs = await Promise.all(orderIds.map(function (id) { return db.collection('orders').doc(id).get(); })), orders = {};
      orderDocs.forEach(function (d) { if (d.exists && d.data().orgId === org) orders[d.id] = Object.assign({ id: d.id }, d.data()); });
      var siteRows = await sites(db, org), sitesBy = {}; siteRows.forEach(function (sx) { sitesBy[sx.id] = sx; });
      var custRows = await root(db, org).collection('customers').orderBy('__name__').limit(200).get(), custBy = {}; custRows.docs.forEach(function (d) { custBy[d.id] = d.data().name || d.id; });
      var seller = ctx.org.name || org;
      var rows = list.map(function (u) { var c = C.custodyOf(u), o = orders[u.orderId] || null, leg = o ? (((o.delivery || {}).legs || []).filter(function (l) { return l.id === c.legId || (!c.legId && (l.serials || []).indexOf(u.serial) >= 0); })[0] || null) : null;
        return C.registerRow(u, { product: byP[u.sku] || null, order: o, leg: leg, site: c.siteId ? sitesBy[c.siteId] || null : null, seller: seller, buyer: custBy[u.customerId || c.customerId || (o && o.customerId)] || (o && o.customer && (o.customer.company || o.customer.name)) || '' }, now); });
      return { brand: brand, name: seller, owner: X.owner(caller), columns: C.REGISTER_COLUMNS, rows: rows, sites: siteRows.filter(function (sx) { return sx.status !== 'inactive'; }).map(function (sx) { return { id: sx.id, name: sx.name }; }), products: prods.filter(function (p) { return p && p.sku && (p.kind || 'product') === 'product'; }).map(function (p) { return { sku: p.sku, name: p.name }; }), limited: all.limited, sampled: list.length };
    }
    var counts = {}; C.STATUSES.forEach(function (k) { counts[k || 'plant'] = 0; });
    var offPlant = []; list.forEach(function (u) { var c = C.custodyOf(u); counts[c.status || 'plant']++; if (c.status) offPlant.push(view(u, byP, now)); });
    var siteList = await sites(db, org), perSite = {}, plannedAt = {}; offPlant.forEach(function (u) { if (u.custody.siteId) perSite[u.custody.siteId] = (perSite[u.custody.siteId] || 0) + 1; });
    /* "going to": from EVERY unit, the ones still being built included */
    var goingTo = list.filter(function (u) { var c = C.custodyOf(u); return c.plannedSiteId && !c.siteId; }); goingTo.forEach(function (u) { var id = C.custodyOf(u).plannedSiteId; plannedAt[id] = (plannedAt[id] || 0) + 1; });
    var cov = { active: 0, pending: 0, expired: 0, expiring: 0 }; offPlant.forEach(function (u) { u.coverage.forEach(function (cv) { if (cov[cv.status] != null) cov[cv.status]++; if (cv.status === 'active' && cv.endDate && (Date.parse(cv.endDate) - Date.parse(now)) / 86400000 <= 90) cov.expiring++; }); });
    var customers = await root(db, org).collection('customers').orderBy('__name__').limit(200).get();
    var mapping = await root(db, org).collection('custody_mappings').doc('assignment').get();
    var toConfirm = offPlant.filter(function (u) { return u.custody.confirmation === 'declared'; }), planned = goingTo.slice(0, 200).map(function (u) { return view(u, byP, now); });
    return { brand: brand, name: ctx.org.name || org, owner: X.owner(caller), counts: counts, coverage: cov, units: offPlant.slice(0, 500), unitsShown: Math.min(offPlant.length, 500), unitsTotal: offPlant.length,
      toConfirm: toConfirm.slice(0, 200), planned: planned.slice(0, 200),
      sites: siteList.map(function (s) { return Object.assign({}, s, { units: perSite[s.id] || 0, planned: plannedAt[s.id] || 0 }); }), exceptions: C.exceptions(list, prods, now).slice(0, 200),
      customers: customers.docs.map(function (d) { return { id: d.id, name: d.data().name || d.id }; }), products: prods.filter(function (p) { return p && p.sku && (p.kind || 'product') === 'product'; }).map(function (p) { return { sku: p.sku, name: p.name, coverage: C.templatesOf(p) }; }),
      mapping: mapping.exists ? mapping.data().columnMap || null : null, columns: C.TEMPLATE_HEADERS, moves: C.MOVES, states: C.STATES, limited: all.limited, sampled: list.length };
  }

  /* ── writes ─────────────────────────────────────────────────────────── */
  var action = String(b.action || ''), method = ['manual', 'scan', 'import'].indexOf(b.method) >= 0 ? b.method : 'manual';
  function audit(tx, what, extra) { tx.create(db.collection('omega_audit').doc(), Object.assign({ orgId: org, action: 'custody-' + what, by: by, at: now }, extra || {})); }

  /* ── many sites at once, for one customer account ─────────────────── */
  if (action === 'sites-preview' || action === 'sites-create') {
    var scid = accountId(b.customerId, 'Choose the customer account the sites belong to'), cref = root(db, org).collection('customers').doc(scid);
    if (action === 'sites-preview') {
      if (String(b.text == null ? '' : b.text).length > C.MAX_SITE_TEXT) throw A.httpError(400, 'That list is too long; paste at most ' + C.MAX_SITE_ROWS + ' sites at a time.');
      var cd = await cref.get(); if (!cd.exists || !openAccount(cd.data())) throw A.httpError(404, 'Customer account not found, or it is closed');
      var have0 = (await root(db, org).collection('sites').where('customerId', '==', scid).limit(500).get()).docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
      var pv = C.sitesPreview(b.text, have0, scid);
      /* the pins: new rows only, Census only, cache first, inside the
         office's own daily allowance (api/_lib/site-geo.js) */
      var geo = await SG.locate(db, org, pv.rows, 'office', scid, now);
      return Object.assign({ ok: true, customerId: scid, geoLimited: geo.geoLimited }, pv);
    }
    var recs = C.siteListInputs(b.rows, scid);
    return db.runTransaction(async function (tx) {
      var cd2 = await tx.get(cref); if (!cd2.exists || !openAccount(cd2.data())) throw A.httpError(404, 'Customer account not found, or it is closed');
      var cur = await tx.get(root(db, org).collection('sites').where('customerId', '==', scid).limit(500)), have = cur.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); });
      var pl = C.placeSites(recs, have, scid), taken = {}, made = [];
      for (var i = 0; i < pl.create.length; i++) {
        var item = pl.create[i], sid = null;
        for (var j = 0; j < item.candidates.length && !sid; j++) { var cand = item.candidates[j]; if (taken[cand]) continue; taken[cand] = true; if (!(await tx.get(root(db, org).collection('sites').doc(cand))).exists) sid = cand; }
        if (!sid) throw A.httpError(409, 'Row ' + (item.row + 1) + ' (' + item.rec.name + '): too many sites share that name and ZIP. Rename it and try again.');
        made.push({ id: sid, doc: Object.assign({ orgId: org }, item.rec, { customerId: scid, source: 'office-list', createdAt: now, createdBy: by, updatedAt: now, updatedBy: by }) });
      }
      made.forEach(function (m) { tx.create(root(db, org).collection('sites').doc(m.id), m.doc); });
      audit(tx, 'sites-created', { customerId: scid, created: made.map(function (m) { return m.id; }), existing: pl.existing.map(function (x) { return x.id; }) });
      return { ok: true, customerId: scid, created: made.map(function (m) { return Object.assign({ id: m.id }, m.doc); }), existing: pl.existing };
    });
  }
  if (action === 'plan-preview' || action === 'plan-apply') {
    if (!b.orderId) throw A.httpError(400, 'Choose the order');
    var poref = db.collection('orders').doc(P.id(b.orderId)), pos = await poref.get();
    if (!pos.exists || pos.data().orgId !== org) throw A.httpError(404, 'Order not found');
    if (!Array.isArray(b.sites) || !b.sites.length) throw A.httpError(400, 'Choose the sites');
    if (b.sites.length > C.MAX_SITE_ROWS) throw A.httpError(400, 'At most ' + C.MAX_SITE_ROWS + ' sites in one plan');
    var sdocs = await Promise.all(b.sites.map(function (x) { var v = String(x && x.siteId || ''); return /^[a-zA-Z0-9_-]{1,120}$/.test(v) ? root(db, org).collection('sites').doc(v).get() : null; }));
    var known = sdocs.filter(function (d) { return d && d.exists; }).map(function (d) { return Object.assign({ id: d.id }, d.data()); }), siteOf = {};
    var chosen = C.planSites(b.sites, known, 'Site not found');
    known.forEach(function (sx) { siteOf[sx.id] = sx; });
    /* every site must be one the order's account may use (siteFits), and a
       unit stamped for another account is left out of the spread */
    var powner = await B.accountOfOrder(db, org, pos.data());
    chosen.forEach(function (x) { siteFits(siteOf[x.siteId], powner); });
    function ownerOf(u) { return C.stampedAccount(u) || powner || null; }
    function refuse(u) { var o = ownerOf(u), bad = chosen.filter(function (x) { var sx = siteOf[x.siteId]; return sx.customerId && o && sx.customerId !== o; })[0]; return bad ? 'On another customer account than ' + bad.name : null; }
    var punits = (await db.collection('plant_units').where('orgId', '==', org).where('orderId', '==', pos.id).limit(MAX_UNITS).get()).docs.map(function (d) { return d.data(); }).filter(function (u) { return u.shipUnit; });
    var plan = C.spread(punits, chosen, { replan: b.replan === true, exclude: refuse });
    if (action === 'plan-preview') return Object.assign({ ok: true, orderId: pos.id, orderNo: pos.data().orderNo || null }, plan);
    if (b.confirm !== true) throw A.httpError(400, 'Preview the plan, then confirm it');
    if (plan.problems.length) throw A.httpError(409, plan.problems[0]);
    if (!C.planMatches(plan, b)) throw A.httpError(409, 'The order changed since your preview. Preview it again.');
    var todo = C.planWrites(plan), more = todo.length > C.MAX_PLAN_UNITS, was = {}, planRef = db.collection('omega_audit').doc(), planId = planRef.id, applied = [], skipped = [];
    todo = todo.slice(0, C.MAX_PLAN_UNITS);
    punits.forEach(function (u) { was[u.serial] = C.custodyOf(u).plannedSiteId || ''; });
    for (var c0 = 0; c0 < todo.length; c0 += PLAN_CHUNK) {
      var chunk = todo.slice(c0, c0 + PLAN_CHUNK);
      /* each unit re-read inside its transaction; outcomes returned, never
         pushed from inside, so a retried transaction cannot count twice */
      var r = await db.runTransaction(async function (tx) {
        var snaps = await Promise.all(chunk.map(function (a) { return tx.get(unitRef(db, org, a.serial)); })), ok = [], no = [], writes = [];
        chunk.forEach(function (a, k) {
          var u = snaps[k].exists ? snaps[k].data() : null, p = u ? C.plannable(u) : null, no1 = u && a.siteId ? refuse(u) : null;
          if (!u || u.orgId !== org || u.orderId !== pos.id) { no.push({ serial: a.serial, why: 'No longer on this order' }); return; }
          if (!p.ok) { no.push({ serial: a.serial, why: p.say }); return; }
          if (no1) { no.push({ serial: a.serial, why: no1 }); return; }
          if ((C.custodyOf(u).plannedSiteId || '') !== was[a.serial]) { no.push({ serial: a.serial, why: 'Changed since the preview' }); return; }
          var dr = C.destination(u, { siteId: a.siteId, siteName: a.siteName }, by, now, 'manual');
          dr.event.orderId = pos.id; dr.event.via = 'site-list'; dr.event.planId = planId;
          if (a.siteId && !C.custodyOf(u).customerId && ownerOf(u)) dr.patch['custody.customerId'] = ownerOf(u);
          writes.push({ ref: snaps[k].ref, serial: a.serial, dr: dr }); ok.push(a);
        });
        writes.forEach(function (w) { tx.update(w.ref, w.dr.patch); tx.create(eventDoc(w.ref), Object.assign({ orgId: org, serial: w.serial }, w.dr.event)); });
        return { ok: ok, no: no };
      });
      applied = applied.concat(r.ok); skipped = skipped.concat(r.no);
    }
    await planRef.create({ orgId: org, action: 'custody-site-plan', by: by, at: now, planId: planId, orderId: pos.id, customerId: powner || null, sites: chosen.map(function (x) { return x.siteId; }).slice(0, 200), applied: applied.length, skipped: skipped.length, released: applied.filter(function (a) { return a.how === 'released'; }).length, more: more });
    return { ok: true, planId: planId, orderId: pos.id, orderNo: pos.data().orderNo || null, applied: applied.length, skipped: skipped, more: more, perSite: plan.perSite, assignments: C.planResult(plan, applied, skipped),
      released: plan.released, leftover: plan.leftover, elsewhere: plan.elsewhere, notPlanned: plan.notPlanned, planKey: plan.planKey };
  }

  if (action === 'site') {
    var id = b.id ? P.id(b.id) : null, sref;
    return db.runTransaction(async function (tx) {
      var existing = id ? await tx.get(root(db, org).collection('sites').doc(id)) : null;
      if (id && !existing.exists) throw A.httpError(404, 'Site not found');
      var rec = C.site(b, existing && existing.exists ? existing.data() : null);
      sref = existing && existing.exists ? existing.ref : root(db, org).collection('sites').doc(C.siteId(rec.customerId, rec));
      if (!id) { var clash = await tx.get(sref); if (clash.exists) throw A.httpError(409, 'A site with that name and ZIP already exists for this customer: ' + sref.id); }
      var doc = Object.assign({ orgId: org }, rec, { updatedAt: now, updatedBy: by });
      if (existing && existing.exists) tx.update(sref, doc); else tx.create(sref, Object.assign(doc, { createdAt: now, createdBy: by }));
      audit(tx, existing && existing.exists ? 'site-updated' : 'site-created', { siteId: sref.id, before: existing && existing.exists ? existing.data() : null, after: doc });
      return { ok: true, siteId: sref.id, site: Object.assign({ id: sref.id }, doc) };
    });
  }

  if (action === 'detail') {
    var tserial = C.serial(b.serial), tref = unitRef(db, org, tserial);
    return db.runTransaction(async function (tx) {
      var ts = await tx.get(tref); if (!ts.exists || ts.data().orgId !== org) throw A.httpError(404, 'Serial is not registered');
      var tr = C.detail(ts.data(), b, by, now); if (tr.duplicate) return { ok: true, action: 'duplicate', serial: tserial, custody: C.custodyOf(ts.data()) };
      tx.update(tref, tr.patch); tx.create(eventDoc(tref), Object.assign({ orgId: org, serial: tserial }, tr.event));
      var tafter = JSON.parse(JSON.stringify(ts.data())); Object.keys(tr.patch).forEach(function (k) { var parts = k.split('.'), t = tafter; parts.slice(0, -1).forEach(function (p) { t = t[p] || (t[p] = {}); }); t[parts[parts.length - 1]] = tr.patch[k]; });
      return { ok: true, action: 'detail', serial: tserial, changed: tr.event.fields, custody: C.custodyOf(tafter) };
    });
  }
  if (action === 'confirm' || action === 'destination') {
    var cserial = C.serial(b.serial), cref = unitRef(db, org, cserial);
    return db.runTransaction(async function (tx) {
      var cs = await tx.get(cref); if (!cs.exists || cs.data().orgId !== org) throw A.httpError(404, 'Serial is not registered');
      var cu = cs.data(), csite = null, cOwner = null;
      if (action === 'destination' && b.siteId) { var csd = await tx.get(root(db, org).collection('sites').doc(P.id(b.siteId))); if (!csd.exists || csd.data().status === 'inactive') throw A.httpError(404, 'Site not found'); csite = Object.assign({ id: csd.id }, csd.data()); }
      if (action === 'destination') { var cord = cu.orderId ? await tx.get(db.collection('orders').doc(P.id(cu.orderId))) : null; cOwner = await accountOfUnit(db, org, cu, cord && cord.exists ? cord.data() : null); siteFits(csite, cOwner); }
      var r = action === 'confirm' ? C.confirm(cu, b, by, now) : C.destination(cu, { siteId: csite ? csite.id : '', siteName: csite ? csite.name : '', position: b.position, note: b.note }, by, now, method);
      if (action === 'destination' && cOwner && !C.custodyOf(cu).customerId) r.patch['custody.customerId'] = cOwner;
      if (r.duplicate) return { ok: true, action: 'duplicate', serial: cserial, say: 'Already confirmed', custody: C.custodyOf(cu) };
      tx.update(cref, r.patch); tx.create(eventDoc(cref), Object.assign({ orgId: org, serial: cserial }, r.event));
      var cafter = JSON.parse(JSON.stringify(cu)); Object.keys(r.patch).forEach(function (k) { var parts = k.split('.'), t = cafter; parts.slice(0, -1).forEach(function (p) { t = t[p] || (t[p] = {}); }); t[parts[parts.length - 1]] = r.patch[k]; });
      return { ok: true, action: action, serial: cserial, say: action === 'confirm' ? 'Confirmed at ' + (cu.custody.siteName || cu.custody.siteId) : (csite ? 'Going to ' + csite.name : 'Destination cleared'), custody: Object.assign(C.custodyOf(cafter), { confirmation: C.confirmation(cafter.custody) }) };
    });
  }
  if (action === 'move' || action === 'state' || action === 'replace') {
    var serial = C.serial(b.serial), ref = unitRef(db, org, serial), what = action === 'move' ? String(b.move || '') : action;
    if (action === 'move' && !C.MOVES[what]) throw A.httpError(400, 'Unknown move');
    if (action === 'move' && what === 'ship') throw A.httpError(400, 'Shipping is recorded under Shipping & receiving, on the load');
    return db.runTransaction(async function (tx) {
      var s = await tx.get(ref); if (!s.exists || s.data().orgId !== org) throw A.httpError(404, 'Serial is not registered');
      var u = s.data(), site = null;
      if (b.siteId) { var sd = await tx.get(root(db, org).collection('sites').doc(P.id(b.siteId))); if (!sd.exists || sd.data().status === 'inactive') throw A.httpError(404, 'Site not found'); site = Object.assign({ id: sd.id }, sd.data()); }
      var mord = u.orderId && !C.custodyOf(u).customerId && !u.customerId ? await tx.get(db.collection('orders').doc(P.id(u.orderId))) : null;
      var mOwner = await accountOfUnit(db, org, u, mord ? (mord.exists ? mord.data() : null) : undefined);
      if (action === 'move') siteFits(site, mOwner);
      var body = Object.assign({}, b, { siteId: site ? site.id : undefined, siteName: site ? site.name : undefined });
      if (action === 'state') { var st = C.state(u, String(b.state || ''), b, by, now, method); tx.update(ref, st.patch); tx.create(eventDoc(ref), Object.assign({ orgId: org, serial: serial }, st.event)); return { ok: true, serial: serial, state: st.patch['custody.state'] }; }
      if (action === 'replace') {
        var v0 = C.judge(u, 'replace', body); if (!v0.ok) throw A.httpError(409, v0.say);
        var rep = C.serial(b.replacementSerial), rref = unitRef(db, org, rep), rs = await tx.get(rref);
        if (!rs.exists || rs.data().orgId !== org) throw A.httpError(404, 'Replacement serial is not registered');
        var ru = rs.data(), rc = C.custodyOf(ru); if (!ru.shipUnit) throw A.httpError(400, 'Replacement must be a shipping unit'); if (ru.inventoryStatus === 'void') throw A.httpError(409, 'That serial was voided (a typo corrected at registration); use the real serial');
        if (['installed', 'commissioned', 'in_service', 'rma_open', 'replaced', 'decommissioned'].indexOf(rc.status) >= 0) throw A.httpError(409, 'Replacement unit is already ' + C.label(rc.status));
        var prods2 = await products(db, org), prod = prods2.filter(function (p) { return p.sku === u.sku; })[0], c0 = C.custodyOf(u);
        var oldCov = C.coverageWithInheritance(prod, u, now).map(function (cv) { return Object.assign({}, cv, { serial: serial }); });
        var ap = C.apply(u, 'replace', body, by, now, method); tx.update(ref, ap.patch); tx.create(eventDoc(ref), Object.assign({ orgId: org, serial: serial }, ap.event));
        var rpatch = { 'custody.status': c0.status === 'rma_open' && c0.siteId ? 'assigned' : 'received', 'custody.custodian': c0.siteId ? 'site' : 'customer', 'custody.siteId': c0.siteId || null, 'custody.siteName': c0.siteName || null, 'custody.position': c0.position || '', 'custody.endCustomer': c0.endCustomer || null, 'custody.customerId': c0.customerId || u.customerId || null,
          'custody.replaces': serial, 'custody.receivedAt': rc.receivedAt || String(now).slice(0, 10), 'custody.assignedAt': c0.siteId ? String(now).slice(0, 10) : null, 'custody.inheritedCoverage': prod && prod.coverage && prod.coverage.some(function (t) { return t.restartOnReplace; }) ? [] : C.inherited(oldCov), 'custody.updatedAt': now, 'custody.updatedBy': by };
        tx.update(rref, rpatch); tx.create(eventDoc(rref), { orgId: org, serial: rep, type: 'replacement-of', from: rc.status, to: rpatch['custody.status'], replaces: serial, siteId: c0.siteId || null, by: by, at: now, method: method, note: C.serial(serial) + ' → ' + rep });
        audit(tx, 'replace', { serial: serial, replacementSerial: rep, siteId: c0.siteId || null });
        return { ok: true, serial: serial, replacementSerial: rep, siteId: c0.siteId || null, inherited: rpatch['custody.inheritedCoverage'] };
      }
      var v = C.judge(u, what, body); if (!v.ok) throw A.httpError(409, v.say);
      if (v.action === 'duplicate') return { ok: true, action: 'duplicate', serial: serial, say: v.say, custody: C.custodyOf(u) };
      var ap2 = C.apply(u, what, body, by, now, method);
      if (mOwner && !C.custodyOf(u).customerId) ap2.patch['custody.customerId'] = mOwner;
      tx.update(ref, ap2.patch); tx.create(eventDoc(ref), Object.assign({ orgId: org, serial: serial }, ap2.event));
      var after = JSON.parse(JSON.stringify(u)); Object.keys(ap2.patch).forEach(function (k) { var parts = k.split('.'), t = after; parts.slice(0, -1).forEach(function (p) { t = t[p] || (t[p] = {}); }); t[parts[parts.length - 1]] = ap2.patch[k]; });
      return { ok: true, action: what, serial: serial, say: 'Recorded: ' + C.label(after.custody.status) + (site ? ' at ' + site.name : ''), custody: C.custodyOf(after) };
    });
  }

  if (action === 'receive-load') {
    var oref = db.collection('orders').doc(P.id(b.orderId)), legId = String(b.legId || ''), list = Array.isArray(b.received) ? b.received.slice(0, 200) : [];
    var os = await oref.get(); if (!os.exists || os.data().orgId !== org) throw A.httpError(404, 'Order not found');
    var leg = ((os.data().delivery || {}).legs || []).filter(function (l) { return l.id === legId; })[0]; if (!leg) throw A.httpError(404, 'Load not found on this order');
    var rec = C.reconcile(leg.serials, list.map(function (r) { return { serial: C.serial(typeof r === 'string' ? r : r.serial), condition: r && r.condition === 'damaged' ? 'damaged' : 'accepted' }; }));
    var siteDoc = b.siteId ? await root(db, org).collection('sites').doc(P.id(b.siteId)).get() : null; if (b.siteId && (!siteDoc.exists)) throw A.httpError(404, 'Site not found');
    var loadOwner = await B.accountOfOrder(db, org, os.data());
    if (siteDoc) siteFits(siteDoc.data(), loadOwner);
    var applied = [], damagedApplied = [], refused = [];
    for (var i = 0; i < rec.received.length + rec.damaged.length; i++) {
      var sn = i < rec.received.length ? rec.received[i] : rec.damaged[i - rec.received.length], cond = i < rec.received.length ? 'accepted' : 'damaged';
      await db.runTransaction(async function (tx) {
        var ur = unitRef(db, org, sn), us = await tx.get(ur); if (!us.exists) { refused.push({ serial: sn, why: 'not registered' }); return; }
        var uu = us.data(), body = { at: b.at, condition: cond, siteId: siteDoc ? siteDoc.id : undefined, siteName: siteDoc ? siteDoc.data().name : undefined, legId: legId, note: b.note };
        var vv = C.judge(uu, 'receive', body); if (!vv.ok) { refused.push({ serial: sn, why: vv.say }); return; }
        var ap3 = C.apply(uu, 'receive', body, by, now, method); ap3.event.legId = legId; ap3.event.orderId = oref.id; ap3.patch['custody.legId'] = legId; if (loadOwner && !C.custodyOf(uu).customerId) ap3.patch['custody.customerId'] = loadOwner;
        tx.update(ur, ap3.patch); tx.create(eventDoc(ur), Object.assign({ orgId: org, serial: sn }, ap3.event)); (cond === 'damaged' ? damagedApplied : applied).push(sn);
      });
    }
    await db.collection('omega_audit').doc().create({ orgId: org, action: 'custody-receive-load', by: by, at: now, orderId: oref.id, legId: legId, received: applied.length, short: rec.short, overage: rec.overage, damaged: damagedApplied.length });
    return { ok: true, legId: legId, received: applied, damaged: damagedApplied, short: rec.short, overage: rec.overage, duplicate: rec.duplicate, refused: refused, complete: rec.complete && !refused.length, note: rec.short.length ? rec.short.length + ' expected serial' + (rec.short.length === 1 ? '' : 's') + ' did not arrive; the load stays partial until they do or Shipping records them missing.' : (rec.overage.length ? rec.overage.length + ' serial' + (rec.overage.length === 1 ? ' was' : 's were') + ' not on this load and not received; check the load they belong to.' : 'Every expected serial was received.') };
  }

  if (action === 'mapping-save') {
    var cm = b.mapping && typeof b.mapping === 'object' ? b.mapping : {}, clean = {};
    Object.keys(cm).slice(0, 60).forEach(function (h) { if (Object.prototype.hasOwnProperty.call(C.COLUMNS, cm[h])) clean[String(h).slice(0, 80)] = cm[h]; });
    await root(db, org).collection('custody_mappings').doc('assignment').set({ orgId: org, kind: 'assignment', columnMap: clean, updatedAt: now, updatedBy: by }, { merge: true });
    return { ok: true, mapping: clean };
  }

  if (action === 'import') {
    var parsed = Array.isArray(b.rows) ? { headers: Object.keys(b.rows[0] || {}), rows: b.rows } : C.parseCsv(b.text), saved = await root(db, org).collection('custody_mappings').doc('assignment').get();
    var mapping = b.mapping && typeof b.mapping === 'object' && Object.keys(b.mapping).length ? b.mapping : C.guessMapping(parsed.headers, saved.exists ? saved.data().columnMap : null);
    if (!Object.keys(mapping).some(function (h) { return mapping[h] === 'serial'; })) throw A.httpError(400, 'Map a column to the serial number');
    if (parsed.rows.length > C.MAX_ROWS) throw A.httpError(400, 'At most ' + C.MAX_ROWS + ' rows per import');
    var serials = {}; parsed.rows.forEach(function (r) { var m = C.mapRow(r, mapping); if (m.serial) serials[String(m.serial).trim()] = true; });
    var keys = Object.keys(serials).slice(0, C.MAX_ROWS), unitDocs = await Promise.all(keys.map(function (sn) { return /^[A-Za-z0-9][A-Za-z0-9._-]{2,99}$/.test(sn) ? unitRef(db, org, sn).get() : Promise.resolve(null); }));
    var unitsBy = {}; unitDocs.forEach(function (d) { if (d && d.exists && d.data().orgId === org) unitsBy[d.data().serial] = d.data(); });
    var siteRows = await sites(db, org), sitesBy = {}, byKey = {}; siteRows.forEach(function (s) { sitesBy[s.id] = s; byKey[C.siteKey(s.customerId, s.name, s.address && s.address.zip)] = s; });
    var customerId = b.customerId ? P.id(b.customerId) : null;
    /* each unit's account, from its order when custody has none yet */
    var ordIds = {}; Object.keys(unitsBy).forEach(function (sn) { var uu0 = unitsBy[sn]; if (uu0.orderId && !C.custodyOf(uu0).customerId && !uu0.customerId) ordIds[uu0.orderId] = true; });
    var ordAcct = {}; await Promise.all(Object.keys(ordIds).slice(0, 300).map(async function (oid) { var od = await db.collection('orders').doc(P.id(oid)).get(); ordAcct[oid] = od.exists && od.data().orgId === org ? await B.accountOfOrder(db, org, od.data()) : null; }));
    var planned = C.plan(parsed.rows, mapping, { units: unitsBy, sites: sitesBy, byKey: byKey, customerId: customerId, allowNewSites: b.allowNewSites === true, accountOf: function (uu1) { return ordAcct[uu1.orderId] || null; } }, now);
    if (b.dryRun !== false) return { ok: true, dryRun: true, headers: parsed.headers, mapping: mapping, plan: planned };
    /* commit: sites first, then every row's moves, in one batch per 200 rows */
    var batchRef = root(db, org).collection('custody_imports').doc(), batch = db.batch(), ops = 0, done = { created: 0, updated: 0, skipped: 0 };
    planned.newSites.forEach(function (s) { var rec = C.site({ name: s.name, customerId: s.customerId, address: s.address, endCustomer: s.endCustomer, interconnection: s.interconnection }); batch.set(root(db, org).collection('sites').doc(s.id), Object.assign({ orgId: org }, rec, { createdAt: now, createdBy: by, updatedAt: now, updatedBy: by, importBatchId: batchRef.id })); ops++; done.created++; });
    var batches = [batch];
    planned.items.forEach(function (item) {
      if (item.problems.length) return; if (!item.actions.length) { done.skipped++; return; }
      var u = JSON.parse(JSON.stringify(unitsBy[item.serial])), ur = unitRef(db, org, item.serial), patch = {};
      item.actions.forEach(function (a) { var ap = C.apply(u, a.action, a, by, now, 'import'); Object.assign(patch, ap.patch); Object.keys(ap.patch).forEach(function (k) { var parts = k.split('.'), t = u; parts.slice(0, -1).forEach(function (p) { t = t[p] || (t[p] = {}); }); t[parts[parts.length - 1]] = ap.patch[k]; }); ap.event.importBatchId = batchRef.id; if (ops > 380) { batch = db.batch(); batches.push(batch); ops = 0; } batch.create(eventDoc(ur), Object.assign({ orgId: org, serial: item.serial }, ap.event)); ops++; });
      var rowOwner = customerId || C.custodyOf(unitsBy[item.serial]).customerId || unitsBy[item.serial].customerId || ordAcct[unitsBy[item.serial].orderId] || null;
      if (rowOwner) patch['custody.customerId'] = rowOwner;
      batch.update(ur, patch); ops++; done.updated++;
    });
    batch.set(batchRef, { orgId: org, kind: 'assignment', fileName: String(b.fileName || '').slice(0, 200), rowCount: parsed.rows.length, created: done.created, updated: done.updated, skipped: done.skipped, errors: planned.items.filter(function (x) { return x.problems.length; }).map(function (x) { return { row: x.row, serial: x.serial, problems: x.problems }; }).slice(0, 500), mapping: mapping, committedAt: now, by: by });
    batch.create(db.collection('omega_audit').doc(), { orgId: org, action: 'custody-import', by: by, at: now, batchId: batchRef.id, rows: parsed.rows.length, created: done.created, updated: done.updated, skipped: done.skipped, errors: planned.summary.errors });
    for (var bi = 0; bi < batches.length; bi++) await batches[bi].commit();
    return { ok: true, dryRun: false, batchId: batchRef.id, mapping: mapping, summary: Object.assign({}, planned.summary, done), errors: planned.items.filter(function (x) { return x.problems.length; }) };
  }
  throw A.httpError(400, 'Unknown custody action');
});
