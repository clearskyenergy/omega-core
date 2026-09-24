/* ═══════════════════════════════════════════════════════════════════════════
   /api/logic-admin — ClearSky's control over every Omega Logic subscriber
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   The owner console behind /logic-admin.html. Restricted to the verified
   ClearSky owner account (logic-access.requireOwner), the same gate the
   Omega Logic directory and every office-side ClearSky action already use.

   GET  ?                          every subscriber (add &all=1 for every tenant)
   GET  ?org=                      the whole record: tenant, billing, office
                                   terms, storefront, members, keys, hosts,
                                   data counts, the admin audit trail
   GET  ?org=&export=zip           the hand-over export (CSV + JSON per
                                   collection, README, manifest)
   GET  ?org=&export=csv&collection=orders   one table
   POST { action: 'commission' }   stand up a new subscriber
   POST { action: 'org' }          the structural tenant fields (+ tenant_public mirror)
   POST { action: 'storefront' }   copy, flags, limits, cost basis — never products
   POST { action: 'member' }       invite / re-role / disable a workspace member

   Billing, branding and the white label, the office terms and the tenant's
   status keep their own endpoints (tenant-billing, tenant-branding,
   logic-office configure, tenant-approve); the page posts to them so each
   allowlist stays in the one file that owns it. Every write here lands a
   row in omega_orgs/{org}/admin_audit with what changed and what it was.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var A = require('./_lib/admin'), X = require('./_lib/logic-access'), L = require('./_lib/logic-admin'), WL = require('./_lib/whitelabel'), M = require('./_lib/mail');
var zip = require('./_lib/portfolio/zip'), csv = require('./_lib/portfolio/csv'), PUBLIC = require('./_lib/public-domains');

function now() { return new Date().toISOString(); }
/* The set-password link continues to the tenant's own host — but Firebase
   Auth only accepts a continue URL on a domain listed under Authentication →
   Settings → Authorized domains, and a newly commissioned host never is
   (there is no wildcard). So a refused host falls back to the hub, which is,
   and the response says so instead of handing staff an error. */
var HUB = 'https://silmarillion.clearskyomega.com/';
async function resetLink(auth, email, hostName) {
  try { return { link: await auth.generatePasswordResetLink(email, { url: 'https://' + hostName + '/' }), error: null, note: null }; }
  catch (e1) {
    if (!/allowlist|authorized|unauthorized-continue-uri|invalid-continue-uri/i.test(String(e1 && e1.message || e1))) return { link: null, error: String(e1 && e1.message || e1), note: null };
    try { return { link: await auth.generatePasswordResetLink(email, { url: HUB }), error: null, note: hostName + ' is not an authorized domain in Firebase Auth yet, so the link continues to the hub; add the host under Authentication → Settings → Authorized domains to change that.' }; }
    catch (e2) { return { link: null, error: String(e2 && e2.message || e2), note: null }; }
  }
}
/* Audit ids sort NEWEST FIRST under a plain ascending orderBy('__name__'):
   an inverted millisecond stamp, so the trail needs no composite index (a
   descending __name__ order on a subcollection does, and the live page
   found that out). */
function rid(at) { return String(1e13 - Date.parse(at)).padStart(13, '0') + '_' + Math.random().toString(36).slice(2, 8); }

module.exports = A.handler(async function (req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (['GET', 'POST'].indexOf(req.method) < 0) throw A.httpError(405, 'GET or POST only');
  var caller = await A.authenticate(req); X.requireOwner(caller);
  var db = A.db(), b = req.method === 'GET' ? (req.query || {}) : (req.body || {});
  var org = b.org ? A.safeOrg(String(b.org).toLowerCase()) : '';
  if (b.org && !org) throw A.httpError(400, 'Valid org required');
  var root = org ? db.collection('omega_orgs').doc(org) : null;

  async function audit(action, detail) { var at = now(); await root.collection('admin_audit').doc(rid(at)).set(Object.assign({ action: action, orgId: org, by: caller.email, at: at }, detail || {})); }
  async function mirror(orgDoc, removedHosts) {
    var batch = db.batch(), at = now();
    (removedHosts || []).forEach(function (h) { batch.delete(db.collection('tenant_public').doc(h)); });
    (orgDoc.domains || []).forEach(function (h) { batch.set(db.collection('tenant_public').doc(String(h).toLowerCase()), WL.publicRecord(org, orgDoc, at), { merge: true }); });
    await batch.commit();
  }
  async function count(q) { var s = await q.select().limit(500).get(); return s.size >= 500 ? '500+' : s.size; }
  async function bounded(q) { var s = await q.limit(L.EXPORT_LIMIT).get(); return { docs: s.docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }), truncated: s.size >= L.EXPORT_LIMIT }; }

  /* ── GET ─────────────────────────────────────────────────────────────── */
  if (req.method === 'GET') {
    if (!org) {
      var all = await db.collection('omega_orgs').orderBy('__name__').limit(300).get(), rows = [];
      all.forEach(function (s) { var d = s.data(); if (d.supersededBy) return; if (b.all === '1' || L.isLogic(d)) rows.push({ id: s.id, org: d }); });
      var bills = await Promise.all(rows.map(function (r) { return db.collection('omega_orgs').doc(r.id).collection('billing').doc('current').get(); }));
      return { owner: true, subscribers: rows.map(function (r, i) { return L.summary(r.id, r.org, bills[i].exists ? bills[i].data() : {}); }), total: all.size, tiers: L.TIERS, verticals: L.VERTICALS, roles: L.ROLES };
    }
    var snap = await root.get(); if (!snap.exists) throw A.httpError(404, 'No tenant record for ' + org);
    var orgDoc = snap.data();
    if (b.export === 'zip' || b.export === 'csv') {
      var files = [], manifest = { orgId: org, name: orgDoc.name || org, exportedAt: now(), exportedBy: caller.email, collections: [] };
      var wanted = b.export === 'csv' ? L.EXPORT.filter(function (e) { return e.name === String(b.collection || ''); }) : L.EXPORT;
      if (!wanted.length) throw A.httpError(400, 'collection must be one of ' + L.EXPORT.map(function (e) { return e.name; }).join(', '));
      for (var i = 0; i < wanted.length; i++) {
        var e = wanted[i], rowsOut = [], truncated = false;
        if (e.kind === 'root') { var r1 = await bounded(db.collection(e.collection).where('orgId', '==', org)); rowsOut = r1.docs; truncated = r1.truncated; }
        else if (e.kind === 'sub') { var r2 = await bounded(root.collection(e.collection)); rowsOut = r2.docs; truncated = r2.truncated; }
        else if (e.kind === 'events' || e.kind === 'users') {
          var parents = e.kind === 'events' ? (await db.collection(e.collection).where('orgId', '==', org).limit(200).get()).docs : (await root.collection(e.collection).limit(200).get()).docs;
          for (var p = 0; p < parents.length; p++) { var subs = await parents[p].ref.collection(e.sub).limit(500).get(); subs.forEach(function (d) { rowsOut.push(Object.assign({ id: d.id }, e.kind === 'events' ? { orderId: parents[p].id } : { customerId: parents[p].id }, d.data())); }); }
          truncated = parents.length >= 200;
        }
        else if (e.kind === 'products') { var sf = await root.collection('storefront').doc('config').get(); rowsOut = ((sf.exists && sf.data().products) || []).map(function (x, k) { return Object.assign({ id: x.sku || String(k + 1) }, x); }); }
        else if (e.kind === 'doc') { var dd = await root.collection(e.collection).doc(e.doc).get(); var body = dd.exists ? dd.data() : {}; var keyed = Object.keys(body).filter(function (k) { return Array.isArray(body[k]); }); rowsOut = keyed.length ? [].concat.apply([], keyed.map(function (k) { return body[k].map(function (x, n) { return Object.assign({ id: k + '-' + (n + 1), group: k }, x); }); })) : (dd.exists ? [Object.assign({ id: e.doc }, body)] : []); }
        rowsOut = rowsOut.map(L.redact);
        files.push({ name: e.name + '.csv', bytes: Buffer.from('﻿' + csv.stringify(L.table(rowsOut))) });
        files.push({ name: e.name + '.json', bytes: Buffer.from(JSON.stringify(rowsOut, null, 1)) });
        manifest.collections.push({ name: e.name, count: rowsOut.length, truncated: truncated, label: e.label });
      }
      var stamp = manifest.exportedAt.slice(0, 10);
      if (b.export === 'csv') { res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', 'attachment; filename="' + org + '-' + wanted[0].name + '-' + stamp + '.csv"'); res.end(files[0].bytes); return; }
      files.unshift({ name: 'manifest.json', bytes: Buffer.from(JSON.stringify(manifest, null, 1)) });
      files.unshift({ name: 'README.txt', bytes: Buffer.from(L.readme({ orgId: org, name: manifest.name, at: manifest.exportedAt, by: caller.email, collections: manifest.collections })) });
      await audit('export', { collections: manifest.collections.map(function (c) { return c.name + ':' + c.count; }) });
      res.setHeader('Content-Type', 'application/zip'); res.setHeader('Content-Disposition', 'attachment; filename="omega-logic-' + (orgDoc.slug || org) + '-' + stamp + '.zip"');
      res.end(zip.build(files)); return;
    }
    var reads = await Promise.all([root.collection('billing').doc('current').get(), root.collection('fulfillment').doc('config').get(), root.collection('storefront').doc('config').get(),
      root.collection('members').limit(200).get(), db.collection('embed_keys').where('orgId', '==', org).limit(50).get(), root.collection('admin_audit').orderBy('__name__').limit(100).get(),
      Promise.all((orgDoc.domains || []).map(function (h) { return db.collection('tenant_public').doc(String(h).toLowerCase()).get(); })),
      count(db.collection('orders').where('orgId', '==', org)), count(root.collection('customers')), count(root.collection('reps')), count(db.collection('plant_works_orders').where('orgId', '==', org)),
      count(db.collection('plant_units').where('orgId', '==', org)), count(db.collection('plant_stations').where('orgId', '==', org))]);
    var sfc = reads[2].exists ? reads[2].data() : {}, storefront = {};
    L.SF_TEXT.concat(L.SF_BOOL, L.SF_NUM, L.SF_COST).forEach(function (k) { storefront[k] = sfc[k] === undefined ? null : sfc[k]; });
    storefront.products = (sfc.products || []).map(function (p) { return { sku: p.sku, name: p.name, kind: p.kind || 'product', kw: p.kw, kwh: p.kwh, priceMode: p.priceMode || null, listPrice: p.listPrice || null, archived: !!p.archived }; });
    return { owner: true, orgId: org, summary: L.summary(org, orgDoc, reads[0].exists ? reads[0].data() : {}), org: orgDoc, billing: reads[0].exists ? reads[0].data() : null, config: reads[1].exists ? reads[1].data() : null,
      storefront: storefront, members: reads[3].docs.map(function (d) { var m = d.data(); return { uid: d.id, email: m.email, name: m.name || null, role: m.role, status: m.status || 'active', invitedAt: m.invitedAt || null }; }),
      embedKeys: reads[4].docs.map(function (d) { var k = d.data(); return { id: d.id, label: k.label || null, active: k.active !== false, origins: k.origins || [], scopes: k.scopes || [] }; }),
      audit: reads[5].docs.map(function (d) { return d.data(); }), hosts: (orgDoc.domains || []).map(function (h, i) { return { host: h, mirrored: reads[6][i].exists }; }),
      counts: { orders: reads[7], customers: reads[8], reps: reads[9], workOrders: reads[10], units: reads[11], stations: reads[12] },
      exportSets: L.EXPORT.map(function (e) { return { name: e.name, label: e.label }; }), fields: { org: L.ORG_KEYS, storefront: { text: L.SF_TEXT, bool: L.SF_BOOL, num: L.SF_NUM, cost: L.SF_COST } }, tiers: L.TIERS, verticals: L.VERTICALS, roles: L.ROLES,
      links: { office: '/omega-logic?org=' + encodeURIComponent(org), settings: '/logic-settings.html?org=' + encodeURIComponent(org), catalog: '/logic-catalog.html?org=' + encodeURIComponent(org), setup: '/whitelabel-setup.html?org=' + encodeURIComponent(org), customers: '/portals/customer/admin.html?org=' + encodeURIComponent(org), portal: '/portals/customer/?org=' + encodeURIComponent(org) } };
  }

  /* ── POST ────────────────────────────────────────────────────────────── */
  var action = String(b.action || '');
  async function ensureMember(orgId, orgName, hostName, m) {
    var auth = A.init().auth(), u, status, members = db.collection('omega_orgs').doc(orgId).collection('members');
    /* A status change or a set-password link never creates an account: the
       member is found by email, and only a ROLE (an invitation) reaches Auth
       to create one. */
    if (!m.role) {
      var found = await members.where('email', '==', m.email).limit(1).get();
      if (found.empty) throw A.httpError(404, m.email + ' is not a member of this workspace yet; give a role to invite them');
      var doc = found.docs[0], data = doc.data(), out = { uid: doc.id, email: m.email, role: data.role, status: data.status || 'active', account: 'unchanged', claims: false, resetLink: null, resetLinkError: null, mail: null };
      if (m.status) { await doc.ref.set({ status: m.status, updatedAt: now(), updatedBy: caller.email }, { merge: true }); out.status = m.status; }
      if (m.resetLink) { var made0 = await resetLink(auth, m.email, hostName); out.resetLink = made0.link; out.resetLinkError = made0.error; out.resetLinkNote = made0.note; }
      return out;
    }
    try { u = await auth.getUserByEmail(m.email); status = 'existing'; }
    catch (e) { if (!(e && e.code === 'auth/user-not-found')) throw e; u = await auth.createUser({ email: m.email, emailVerified: false, displayName: m.name || orgName }); status = 'created'; }
    var mref = db.collection('omega_orgs').doc(orgId).collection('members').doc(u.uid), prev = await mref.get();
    var patch = { email: m.email, status: m.status || (prev.exists && prev.data().status) || 'active', updatedAt: now() };
    if (m.role) patch.role = m.role; if (m.name) patch.name = m.name; if (!prev.exists) { patch.invitedBy = caller.email; patch.invitedAt = now(); }
    if (!prev.exists && !patch.role) throw A.httpError(404, m.email + ' is not a member of this workspace yet; give a role to invite them');
    await mref.set(patch, { merge: true });
    /* Sign-in claims are set only for the tenant's own people: rewriting a
       staff member's or a partner's claims would move THEIR home workspace. */
    var claims = A.orgOf(m.email) === orgId;
    if (claims && patch.role) await auth.setCustomUserClaims(u.uid, Object.assign({}, u.customClaims || {}, { orgId: orgId, role: patch.role }));
    var link = null, linkError = null, linkNote = null, mail = null;
    if (status === 'created' || m.sendMail) { var made = await resetLink(auth, m.email, hostName); link = made.link; linkError = made.error; linkNote = made.note; }
    if (m.sendMail && link && M.configured && M.configured()) {
      try {
        var r = await M.send(m.email, orgName + ' on ClearSky-OMEGA — set your password', M.layout('Your ' + orgName + ' workspace is ready',
          '<p>ClearSky has set up <b>' + M.esc(orgName) + '</b> at <b>' + M.esc(hostName) + '</b>.</p><p>Choose your password to get in. The link is good for about an hour; after that, use “Forgot password” on the sign-in page with this address.</p>' + M.button(link, 'Set your password')),
          'Your ' + orgName + ' workspace is ready at https://' + hostName + '/. Set your password: ' + link);
        mail = r && r.ok ? 'sent' : 'not sent';
      } catch (e3) { mail = 'not sent — ' + e3.message; }
    }
    return { uid: u.uid, email: m.email, role: patch.role || (prev.exists ? prev.data().role : null), status: patch.status, account: status, claims: claims, resetLink: link, resetLinkError: linkError, resetLinkNote: linkNote, mail: mail };
  }

  if (action === 'commission') {
    var c = L.commission(b, A.safeOrg, PUBLIC), ref = db.collection('omega_orgs').doc(c.orgId), exists = await ref.get();
    if (exists.exists) throw A.httpError(409, c.orgId + ' already has a tenant record — open it in the admin instead of commissioning it twice');
    var taken = await Promise.all(c.domains.map(function (h) { return db.collection('tenant_public').doc(h).get(); }));
    taken.forEach(function (t, i) { if (t.exists && t.data().orgId && t.data().orgId !== c.orgId) throw A.httpError(409, c.domains[i] + ' already belongs to ' + t.data().orgId); });
    var at = now(), rec = L.records(c, caller.email, at), batch = db.batch();
    batch.set(ref, rec.org);
    batch.set(ref.collection('billing').doc('current'), rec.billing);
    batch.set(ref.collection('billing').doc('current').collection('history').doc(rid(at)), { at: at, by: caller.email, changed: rec.billing, was: {} });
    batch.set(ref.collection('fulfillment').doc('config'), rec.config);
    c.domains.forEach(function (h) { batch.set(db.collection('tenant_public').doc(h), WL.publicRecord(c.orgId, rec.org, at)); });
    batch.set(ref.collection('admin_audit').doc(rid(at)), { action: 'commission', orgId: c.orgId, by: caller.email, at: at, record: { org: rec.org, billing: rec.billing, config: rec.config } });
    await batch.commit();
    var owner = null; try { owner = await ensureMember(c.orgId, c.name, c.domains[0], { email: c.ownerEmail, role: 'owner', name: c.ownerName, sendMail: b.sendMail === true }); }
    catch (e4) { owner = { email: c.ownerEmail, account: 'failed', error: String(e4 && e4.message || e4) }; }
    return { ok: true, orgId: c.orgId, hosts: c.domains, owner: owner, links: { admin: '/logic-admin.html?org=' + encodeURIComponent(c.orgId), office: '/omega-logic?org=' + encodeURIComponent(c.orgId), setup: '/whitelabel-setup.html?org=' + encodeURIComponent(c.orgId) },
      next: ['Import the product list: node scripts/import-products.js --org ' + c.orgId + ' --file products.csv --bom bom.csv', 'Storefront key and public pages: white-label setup', 'Office terms and QuickBooks: office settings', 'Production flow and stations: plant board'] };
  }
  if (!org) throw A.httpError(400, 'org required');
  var cur = await root.get(); if (!cur.exists) throw A.httpError(404, 'No tenant record for ' + org);
  var before = cur.data();

  if (action === 'org') {
    var patch = L.orgPatch(b.patch), was = {};
    Object.keys(patch).forEach(function (k) { was[k] = before[k] === undefined ? null : before[k]; });
    patch.updatedAt = now();
    await root.set(patch, { merge: true });
    var after = Object.assign({}, before, patch), removed = (before.domains || []).filter(function (h) { return (after.domains || []).indexOf(h) < 0; });
    await mirror(after, removed);
    await audit('org', { changed: patch, was: was, hostsReleased: removed });
    return { ok: true, changed: Object.keys(patch).filter(function (k) { return k !== 'updatedAt'; }), hosts: after.domains || [], hostsReleased: removed };
  }
  if (action === 'storefront') {
    var sp = L.storefrontPatch(b.patch), sref = root.collection('storefront').doc('config'), sbefore = await sref.get(), swas = {}, sb = sbefore.exists ? sbefore.data() : {};
    Object.keys(sp).forEach(function (k) { swas[k] = sb[k] === undefined ? null : sb[k]; });
    await sref.set(Object.assign({}, sp, { updatedAt: now(), updatedBy: caller.email }), { merge: true });
    await audit('storefront', { changed: sp, was: swas });
    return { ok: true, changed: Object.keys(sp) };
  }
  if (action === 'member') {
    var m = L.memberRequest(b);
    if (m.status === 'disabled') {
      var roster = await root.collection('members').limit(200).get(), owners = roster.docs.filter(function (d) { var x = d.data(); return x.role === 'owner' && x.status !== 'disabled'; });
      if (owners.length === 1 && owners[0].data().email === m.email) throw A.httpError(409, 'That is the last active owner; make somebody else the owner first');
    }
    var out = await ensureMember(org, before.name || org, (before.domains || [])[0] || (before.slug + '.clearskyomega.com'), m);
    if (!m.resetLink || m.status) await audit('member', { email: m.email, role: out.role, status: out.status, account: out.account });
    return Object.assign({ ok: true }, out);
  }
  throw A.httpError(400, 'action must be commission, org, storefront or member');
});
