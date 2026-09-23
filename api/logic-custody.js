/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   GET  /api/logic-custody?org=            sites, counts by status, exceptions,
                                            coverage templates
        &serial=<serial>                    the unit passport: custody, coverage,
                                            every custody event and plant scan
        &site=<siteId>                      one site and the units bound to it
        &view=exceptions                    the gaps that lose warranty claims
        &template=assignment                the CSV to send a customer
   POST /api/logic-custody { org, action, … }
        site          create or edit a site (an end location with its
                      interconnection details)
        move          receive · assign · install · commission · in-service ·
                      rma-open · rma-return · decommission, one serial
        state         damaged · lost · quarantined · scrapped · clear
        replace       an RMA'd unit is replaced; coverage transfers its
                      remaining term to the new serial
        receive-load  the customer's load arrived: expected (the leg) vs
                      scanned, shorts and overages named
        import        a spreadsheet of site assignments, mapped, dry run
                      first, idempotent on commit
        mapping-save  remember a customer's column names for next time

   Every rule is in api/_lib/custody.js; this file reads and writes. A move
   is judged inside the transaction that applies it, so two scanners cannot
   both assign the same unit. Every applied move appends one event under
   the unit; nothing here edits or deletes an event.

   Any active member of the workspace may record custody (the builders
   receive, the commissioning engineer commissions); coverage templates are
   catalog fields and change through the catalog endpoint. */
'use strict';
var A = require('./_lib/admin'), X = require('./_lib/logic-access'), P = require('./_lib/logic-policy'), C = require('./_lib/custody'), Plant = require('./_lib/plant');
var UNIT_FIELDS = ['serial', 'sku', 'unitType', 'shipUnit', 'rootSerial', 'woId', 'orderId', 'orderNo', 'customerId', 'at', 'hold', 'inventoryStatus', 'custody', 'createdAt'];
var MAX_UNITS = 2000;

function root(db, org) { return db.collection('omega_orgs').doc(org); }
async function products(db, org) { var s = await root(db, org).collection('storefront').doc('config').get(); return s.exists ? (s.data().products || []) : []; }
async function sites(db, org) { var q = await root(db, org).collection('sites').orderBy('__name__').limit(500).get(); return q.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }); }
async function tracked(db, org) {
  var q = db.collection('plant_units').where('orgId', '==', org).orderBy('createdAt', 'desc').limit(MAX_UNITS); if (q.select) q = q.select.apply(q, UNIT_FIELDS);
  var s = await q.get(); return { units: s.docs.map(function (d) { return d.data(); }).filter(function (u) { return u.shipUnit; }), limited: s.size === MAX_UNITS };
}
function unitRef(db, org, serial) { return db.collection('plant_units').doc(org + '__' + serial); }
function view(u, byProduct, now) {
  var c = C.custodyOf(u);
  return { serial: u.serial, sku: u.sku, unitType: u.unitType || 'unit', orderId: u.orderId || null, orderNo: u.orderNo || null, customerId: u.customerId || c.customerId || null, at: u.at || '', hold: u.hold || null,
    custody: Object.assign({}, c, { label: C.label(c.status) }), coverage: C.coverageWithInheritance(byProduct[u.sku], u, now) };
}
function eventDoc(unitRef) { return unitRef.collection('custody_events').doc(); }

module.exports = A.handler(async function (req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'POST') throw A.httpError(405, 'GET or POST only');
  var caller = await A.authenticate(req), b = req.body || {}, org = A.safeOrg(req.method === 'GET' ? req.query.org : b.org);
  var ctx = await X.authorize(caller, org, false), db = A.db(), now = new Date().toISOString(), by = caller.email;
  if (!X.subscribed(ctx)) throw A.httpError(403, 'Omega Logic subscription required');
  var brand = require('./_lib/logic-brand')(ctx.org);

  if (req.method === 'GET') {
    if (req.query.template) { res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', 'attachment; filename="site-assignment-template.csv"'); res.end(C.csvTemplate()); return; }
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
    var counts = {}; C.STATUSES.forEach(function (k) { counts[k || 'plant'] = 0; });
    var offPlant = []; list.forEach(function (u) { var c = C.custodyOf(u); counts[c.status || 'plant']++; if (c.status) offPlant.push(view(u, byP, now)); });
    var siteList = await sites(db, org), perSite = {}; offPlant.forEach(function (u) { if (u.custody.siteId) perSite[u.custody.siteId] = (perSite[u.custody.siteId] || 0) + 1; });
    var cov = { active: 0, pending: 0, expired: 0, expiring: 0 }; offPlant.forEach(function (u) { u.coverage.forEach(function (cv) { if (cov[cv.status] != null) cov[cv.status]++; if (cv.status === 'active' && cv.endDate && (Date.parse(cv.endDate) - Date.parse(now)) / 86400000 <= 90) cov.expiring++; }); });
    var customers = await root(db, org).collection('customers').orderBy('__name__').limit(200).get();
    var mapping = await root(db, org).collection('custody_mappings').doc('assignment').get();
    return { brand: brand, name: ctx.org.name || org, owner: X.owner(caller), counts: counts, coverage: cov, units: offPlant.slice(0, 500), unitsShown: Math.min(offPlant.length, 500), unitsTotal: offPlant.length,
      sites: siteList.map(function (s) { return Object.assign({}, s, { units: perSite[s.id] || 0 }); }), exceptions: C.exceptions(list, prods, now).slice(0, 200),
      customers: customers.docs.map(function (d) { return { id: d.id, name: d.data().name || d.id }; }), products: prods.filter(function (p) { return p && p.sku && (p.kind || 'product') === 'product'; }).map(function (p) { return { sku: p.sku, name: p.name, coverage: C.templatesOf(p) }; }),
      mapping: mapping.exists ? mapping.data().columnMap || null : null, columns: C.TEMPLATE_HEADERS, moves: C.MOVES, states: C.STATES, limited: all.limited, sampled: list.length };
  }

  /* ── writes ─────────────────────────────────────────────────────────── */
  var action = String(b.action || ''), method = ['manual', 'scan', 'import'].indexOf(b.method) >= 0 ? b.method : 'manual';
  function audit(tx, what, extra) { tx.create(db.collection('omega_audit').doc(), Object.assign({ orgId: org, action: 'custody-' + what, by: by, at: now }, extra || {})); }

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

  if (action === 'move' || action === 'state' || action === 'replace') {
    var serial = C.serial(b.serial), ref = unitRef(db, org, serial), what = action === 'move' ? String(b.move || '') : action;
    if (action === 'move' && !C.MOVES[what]) throw A.httpError(400, 'Unknown move');
    if (action === 'move' && what === 'ship') throw A.httpError(400, 'Shipping is recorded under Shipping & receiving, on the load');
    return db.runTransaction(async function (tx) {
      var s = await tx.get(ref); if (!s.exists || s.data().orgId !== org) throw A.httpError(404, 'Serial is not registered');
      var u = s.data(), site = null;
      if (b.siteId) { var sd = await tx.get(root(db, org).collection('sites').doc(P.id(b.siteId))); if (!sd.exists || sd.data().status === 'inactive') throw A.httpError(404, 'Site not found'); site = Object.assign({ id: sd.id }, sd.data()); }
      var body = Object.assign({}, b, { siteId: site ? site.id : undefined, siteName: site ? site.name : undefined });
      if (action === 'state') { var st = C.state(u, String(b.state || ''), b, by, now, method); tx.update(ref, st.patch); tx.create(eventDoc(ref), Object.assign({ orgId: org, serial: serial }, st.event)); return { ok: true, serial: serial, state: st.patch['custody.state'] }; }
      if (action === 'replace') {
        var v0 = C.judge(u, 'replace', body); if (!v0.ok) throw A.httpError(409, v0.say);
        var rep = C.serial(b.replacementSerial), rref = unitRef(db, org, rep), rs = await tx.get(rref);
        if (!rs.exists || rs.data().orgId !== org) throw A.httpError(404, 'Replacement serial is not registered');
        var ru = rs.data(), rc = C.custodyOf(ru); if (!ru.shipUnit) throw A.httpError(400, 'Replacement must be a shipping unit');
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
      if (u.customerId && !C.custodyOf(u).customerId) ap2.patch['custody.customerId'] = u.customerId;
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
    var applied = [], damagedApplied = [], refused = [];
    for (var i = 0; i < rec.received.length + rec.damaged.length; i++) {
      var sn = i < rec.received.length ? rec.received[i] : rec.damaged[i - rec.received.length], cond = i < rec.received.length ? 'accepted' : 'damaged';
      await db.runTransaction(async function (tx) {
        var ur = unitRef(db, org, sn), us = await tx.get(ur); if (!us.exists) { refused.push({ serial: sn, why: 'not registered' }); return; }
        var uu = us.data(), body = { at: b.at, condition: cond, siteId: siteDoc ? siteDoc.id : undefined, siteName: siteDoc ? siteDoc.data().name : undefined, legId: legId, note: b.note };
        var vv = C.judge(uu, 'receive', body); if (!vv.ok) { refused.push({ serial: sn, why: vv.say }); return; }
        var ap3 = C.apply(uu, 'receive', body, by, now, method); ap3.event.legId = legId; ap3.event.orderId = oref.id; ap3.patch['custody.legId'] = legId; if (os.data().customerId) ap3.patch['custody.customerId'] = os.data().customerId;
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
    var planned = C.plan(parsed.rows, mapping, { units: unitsBy, sites: sitesBy, byKey: byKey, customerId: customerId, allowNewSites: b.allowNewSites === true }, now);
    if (b.dryRun !== false) return { ok: true, dryRun: true, headers: parsed.headers, mapping: mapping, plan: planned };
    /* commit: sites first, then every row's moves, in one batch per 200 rows */
    var batchRef = root(db, org).collection('custody_imports').doc(), batch = db.batch(), ops = 0, done = { created: 0, updated: 0, skipped: 0 };
    planned.newSites.forEach(function (s) { var rec = C.site({ name: s.name, customerId: s.customerId, address: s.address, endCustomer: s.endCustomer, interconnection: s.interconnection }); batch.set(root(db, org).collection('sites').doc(s.id), Object.assign({ orgId: org }, rec, { createdAt: now, createdBy: by, updatedAt: now, updatedBy: by, importBatchId: batchRef.id })); ops++; done.created++; });
    var batches = [batch];
    planned.items.forEach(function (item) {
      if (item.problems.length) return; if (!item.actions.length) { done.skipped++; return; }
      var u = JSON.parse(JSON.stringify(unitsBy[item.serial])), ur = unitRef(db, org, item.serial), patch = {};
      item.actions.forEach(function (a) { var ap = C.apply(u, a.action, a, by, now, 'import'); Object.assign(patch, ap.patch); Object.keys(ap.patch).forEach(function (k) { var parts = k.split('.'), t = u; parts.slice(0, -1).forEach(function (p) { t = t[p] || (t[p] = {}); }); t[parts[parts.length - 1]] = ap.patch[k]; }); ap.event.importBatchId = batchRef.id; if (ops > 380) { batch = db.batch(); batches.push(batch); ops = 0; } batch.create(eventDoc(ur), Object.assign({ orgId: org, serial: item.serial }, ap.event)); ops++; });
      if (customerId) patch['custody.customerId'] = customerId;
      batch.update(ur, patch); ops++; done.updated++;
    });
    batch.set(batchRef, { orgId: org, kind: 'assignment', fileName: String(b.fileName || '').slice(0, 200), rowCount: parsed.rows.length, created: done.created, updated: done.updated, skipped: done.skipped, errors: planned.items.filter(function (x) { return x.problems.length; }).map(function (x) { return { row: x.row, serial: x.serial, problems: x.problems }; }).slice(0, 500), mapping: mapping, committedAt: now, by: by });
    batch.create(db.collection('omega_audit').doc(), { orgId: org, action: 'custody-import', by: by, at: now, batchId: batchRef.id, rows: parsed.rows.length, created: done.created, updated: done.updated, skipped: done.skipped, errors: planned.summary.errors });
    for (var bi = 0; bi < batches.length; bi++) await batches[bi].commit();
    return { ok: true, dryRun: false, batchId: batchRef.id, mapping: mapping, summary: Object.assign({}, planned.summary, done), errors: planned.items.filter(function (x) { return x.problems.length; }) };
  }
  throw A.httpError(400, 'Unknown custody action');
});
