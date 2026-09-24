/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/buyer-accounts.js — a workspace's CUSTOMER ACCOUNTS
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Omega Logic is ClearSky's product; a tenant (Clean Cell) is a workspace in
   it; and the workspace's customers (Amperage Capital) are SUB-ACCOUNTS with
   several people on each:

     omega_orgs/{org}/customers/{customerId}              the company
     omega_orgs/{org}/customers/{customerId}/users/{email} its people
     omega_orgs/{org}/customer_index/{email}  -> {customerId}   who is where

   Every active person on an account sees and works the ACCOUNT: its orders,
   POs, sites, units and designs. This file is the ONE writer of a person
   joining, leaving or changing role (addUser / setUser) and the ONE reader of
   an account's orders (accountOrders), so the office, the customer owner and
   a colleague's first sign-in cannot drift apart. Admin SDK only; the rules
   keep the pointer write:false and the people create-less for that reason.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var A = require('./admin'), X = require('./logic-access'), P = require('./logic-policy');
var PUBLIC = require('./public-domains');
var OFF = ['disabled', 'suspended'];            // a person who may not act
var NOT_ACTIVE = ['disabled', 'suspended', 'pending'];
function email(value) {
  var s = String(value || '').trim().toLowerCase();
  if (s.length > 254 || !/^[^@\s/]+@[^@\s/]+\.[^@\s/]+$/.test(s)) throw A.httpError(400, 'A valid customer email is required');
  return s;
}
function clean(v, n) { return String(v || '').trim().slice(0, n || 160); }
function domainOf(address) { var d = String(address || '').split('@')[1] || ''; return d.toLowerCase(); }
/* A company domain, or '' for a public mailbox provider: a gmail address says
   nothing about which company a person works for. */
function companyDomain(address) { var d = domainOf(address); return d && PUBLIC.indexOf(d) < 0 ? d : ''; }
/* A company email domain the OFFICE typed for an account ('' when blank).
   Colleagues who sign in from it ask to join, so a public mailbox provider
   or a malformed value is refused rather than stored. */
function accountDomain(value) {
  var d = String(value || '').trim().toLowerCase().replace(/^@/, '');
  if (!d) return '';
  if (d.length > 120 || !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d)) throw A.httpError(400, 'Company email domain looks wrong (e.g. amperagecapital.com)');
  if (PUBLIC.indexOf(d) >= 0) throw A.httpError(400, d + ' is a public mailbox provider, not a company domain');
  return d;
}
function nameKey(name) { return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 160); }
var DEAD = ['disabled', 'suspended', 'cancelled'];   // an account that may not act
/* A person the account ADMITTED: anyone but a join request still waiting or
   one that was turned down. A colleague who was active and later turned off
   stays admitted, so the orders they placed stay the account's. This one
   predicate decides both which orders an account reads (accountOrders) and
   which new orders are stamped with its customerId (stampableAccount). */
function admitted(u) {
  u = u || {};
  var s = u.status || 'active';
  if (s === 'pending' || u.declined === true) return false;
  if (s === 'disabled' && u.source === 'domain-request' && !u.approvedAt) return false;
  return true;
}
/* An office company the office may match by name: never one a customer made
   for themselves (its name is whatever they typed), never a superseded or
   merged record, never a closed one. Legacy records with no source count,
   and so does a self-made account the office has since VERIFIED as a
   company (accountType 'company', set only by the office: api/buyers.js
   profile with a domain; the customer's own endpoint cannot write it). */
function officeCompany(v) {
  v = v || {};
  return (v.source !== 'self' || v.accountType === 'company') && !v.supersededBy && !v.mergedInto && DEAD.indexOf(v.status) < 0;
}
async function context(org) {
  var ctx = await X.context(org);
  if (!X.subscribed(ctx)) throw A.httpError(403, 'This customer portal is not active');
  return ctx;
}
/* May this person act on this account? No account at all is its own case:
   the person has simply not been added to their company yet. */
function active(acct) {
  if (!acct) throw A.httpError(403, 'Open your customer account first, or ask your supplier to add your email to your company.');
  if (!acct.user || DEAD.indexOf(acct.data.status) >= 0 || OFF.indexOf(acct.user.status) >= 0) throw A.httpError(403, 'Customer access is disabled. Contact your supplier.');
  if (acct.user.status === 'pending') throw A.httpError(403, 'Your request to join ' + (clean(acct.data.name) || 'this account') + ' is waiting for approval from its owner or your supplier.');
  return acct;
}
async function lookup(db, org, address, tx) {
  var root = db.collection('omega_orgs').doc(org), ptr = root.collection('customer_index').doc(email(address));
  var get = function (ref) { return tx ? tx.get(ref) : ref.get(); }, p = await get(ptr);
  if (!p.exists) return null;
  var cid = P.id((p.data() || {}).customerId), ref = root.collection('customers').doc(cid);
  var rows = await Promise.all([get(ref), get(ref.collection('users').doc(address))]);
  // Never recreate a dangling pointer or silently reactivate a removed member.
  if (!rows[0].exists || !rows[1].exists) throw A.httpError(409, 'This customer account needs office review.');
  return { id: cid, data: rows[0].data(), user: rows[1].data(), created: false };
}
async function ensure(db, org, address, seed, caller) {
  address = email(address); seed = seed || {};
  var root = db.collection('omega_orgs').doc(org), ref = root.collection('customers').doc();
  return db.runTransaction(async function (tx) {
    var found = await lookup(db, org, address, tx);
    if (found) return active(found);
    var now = new Date().toISOString(), office = seed.source === 'office', company = clean(seed.company);
    var data = { orgId: org, name: company || clean(seed.name) || address,
      plan: 'free', status: 'active', source: office ? 'office' : 'self',
      terms: seed.terms || {}, agreements: [], hasOrders: seed.hasOrders === true, createdAt: now };
    /* The office set this company up: it IS a company. Colleagues who sign in
       from its email domain ask to join it — but only a domain the office
       TYPED (seed.domain), never one read off whoever happened to be the
       contact: a consultant's or a parent company's domain would otherwise
       pull strangers in. A self-made account claims no domain at all. */
    if (office && company) { data.accountType = 'company'; data.nameLower = nameKey(company); var d = accountDomain(seed.domain); if (d) data.domain = d; }
    var user = { email: address, name: clean(seed.name, 120), phone: clean(seed.phone, 40), role: 'owner', status: 'active', createdAt: now };
    if (caller && caller.uid && String(caller.email).toLowerCase() === address) {
      user.uid = caller.uid; user.lastSeenAt = now;
    }
    tx.create(root.collection('customer_index').doc(address), { customerId: ref.id, email: address, createdAt: now });
    tx.create(ref, data);
    tx.create(ref.collection('users').doc(address), user);
    if (office) tx.create(db.collection('omega_audit').doc(), {
      action: 'buyer-created', orgId: org, customerId: ref.id, email: address, by: caller.email, at: now
    });
    return { id: ref.id, data: data, user: user, created: true };
  });
}

/* ── The account's people ──────────────────────────────────────────────── */
async function people(db, org, customerId, opts) {
  opts = opts || {};
  var s = await db.collection('omega_orgs').doc(org).collection('customers').doc(P.id(customerId)).collection('users').limit(opts.limit || 100).get();
  return s.docs.map(function (d) { var v = d.data() || {}; return { email: clean(v.email || d.id, 254), name: clean(v.name, 120), phone: clean(v.phone, 40), role: v.role === 'owner' ? 'owner' : 'user', status: v.status || 'active', activated: !!v.uid, lastSeenAt: v.lastSeenAt || null, requestedAt: v.requestedAt || null, approvedAt: v.approvedAt || null, declined: v.declined === true, source: v.source || null }; })
    .filter(function (u) { return opts.all || NOT_ACTIVE.indexOf(u.status) < 0; })
    .sort(function (a, b) { return (a.role === 'owner' ? 0 : 1) - (b.role === 'owner' ? 0 : 1) || a.email.localeCompare(b.email); });
}

/* ── The account's orders ──────────────────────────────────────────────
   An order is the ACCOUNT's when it carries the account's customerId, or is
   billed to one of the people it ADMITTED (orders written before customerId
   was stamped, and the storefront's, which carry only an email). A colleague
   who was active and has since been turned off stays admitted: their orders
   were the company's. A request still waiting, or one turned down, is not.
   An order stamped for a DIFFERENT account is never included, whoever it is
   billed to. With no account, the caller's own email and nothing else.

   No composite index has to deploy before this code: the per-email list
   rides the existing (orgId, customer.email, createdAt DESC) composite, and
   the (orgId, customerId) list is equality-only, OVER-FETCHED so the rows
   filtered out below cannot eat the page, then sorted here on createdAt as
   MILLIS — a Timestamp object stringifies identically for every row, so a
   string sort silently does nothing. firestore.indexes.json carries the
   (orgId, customerId, createdAt DESC) composite for when that list outgrows
   the over-fetch.

   A PO still under office review (poIntake, not converted) is not an order
   yet and is left out unless the caller asks for intake. */
function millis(v) {
  if (!v) return 0;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v.toDate === 'function') return v.toDate().getTime();
  if (typeof v === 'number') return v;
  if (typeof v === 'object' && typeof v._seconds === 'number') return v._seconds * 1000;
  var t = Date.parse(v); return isFinite(t) ? t : 0;
}
async function accountOrders(db, org, address, account, opts) {
  opts = opts || {};
  var cap = opts.limit || 100, wide = Math.min(Math.max(cap * 4, 200), 500), emails = address ? [email(address)] : [];
  if (account) (await people(db, org, account.id, { all: true, limit: 100 })).forEach(function (u) { if (admitted(u) && emails.indexOf(u.email) < 0) emails.push(u.email); });
  emails = emails.slice(0, 40);
  function q(field, value, n) {
    var x = db.collection('orders').where('orgId', '==', org).where(field, '==', value);
    if (opts.orderNo) x = x.where('orderNo', '==', opts.orderNo);
    else if (field === 'customer.email') x = x.orderBy('createdAt', 'desc');
    return x.limit(n).get().then(function (s) { return { s: s, n: n }; });
  }
  var jobs = emails.map(function (e) { return q('customer.email', e, cap); });
  if (account) jobs.push(q('customerId', account.id, wide));
  var snaps = await Promise.all(jobs), seen = {}, out = [], truncated = false;
  snaps.forEach(function (r) {
    if (r.s.size >= r.n) truncated = true;
    r.s.docs.forEach(function (d) {
      if (seen[d.id]) return;
      var v = d.data() || {};
      if (v.orgId !== org) return;
      if (account ? (v.customerId && v.customerId !== account.id) : (v.customer && v.customer.email !== emails[0])) return;
      if (!opts.includeIntake && v.poIntake && !v.poIntake.convertedAt) return;
      seen[d.id] = true; out.push(d);
    });
  });
  out.sort(function (a, b) { return millis((b.data() || {}).createdAt) - millis((a.data() || {}).createdAt); });
  return { docs: out.slice(0, cap), truncated: truncated || out.length > cap };
}
/* The account a NEW order (or a price, or custody) may be stamped with, from
   the pointer of the email it is billed to: only when the account is open
   and it admitted that person. A request still waiting or turned down never
   stamps — or a stranger would put orders on a company by asking to join. */
async function stampableAccount(db, org, address, tx) {
  var e; try { e = email(address); } catch (x) { return null; }
  try {
    var get = function (ref) { return tx ? tx.get(ref) : ref.get(); };
    var root = db.collection('omega_orgs').doc(org), p = await get(root.collection('customer_index').doc(e));
    if (!p.exists) return null;
    var cid = P.id((p.data() || {}).customerId), ref = root.collection('customers').doc(cid);
    var r = await Promise.all([get(ref), get(ref.collection('users').doc(e))]);
    if (!r[0].exists || !r[1].exists) return null;
    var a = r[0].data() || {};
    if (a.supersededBy || a.mergedInto || DEAD.indexOf(a.status) >= 0) return null;
    return admitted(r[1].data()) ? cid : null;
  } catch (err) { if (tx || (err && err.status)) throw err; return null; }
}
/* Which account an order belongs to: its stamp, else the account of the
   person it is billed to. Used where custody must follow the ACCOUNT. An
   email typed on a public page (embed, config link) proves nothing. */
async function accountOfOrder(db, org, o) {
  if (!o) return null;
  if (o.customerId) return String(o.customerId);
  if (['embed', 'config-link'].indexOf(o.source) >= 0) return null;
  var e = o.customer && o.customer.email; if (!e) return null;
  return stampableAccount(db, org, e);
}

/* ── One writer of a person joining an account ─────────────────────────
   addUser(db, org, customerId, address, {name, phone, role, status}, by, how)
     how.source    'office' | 'owner' | 'domain-request'
     how.rehome    the OFFICE may move a login whose email already points
                   elsewhere, in exactly two cases and never otherwise:
       'account'   an EMPTY self-made account (the colleague who signed in
                   before being added): no orders, sites, designs, terms,
                   agreements or Editor Lite grant, and nobody else on it.
                   That account is suspended with `supersededBy` — never
                   deleted, never `mergedInto` (that stays a reviewed,
                   order-moving script merge).
       'request'   a membership the other account never ADMITTED (a join
                   request still waiting or turned down) with no orders
                   billed to that email: only the pointer and that one
                   person record move; the other company is untouched.
                   Anything else keeps the 409.
   Every emptiness check is re-read INSIDE the transaction before any write,
   so an order, site or colleague landing on the stray account meanwhile
   aborts the move instead of being orphaned.
   A person already on THIS account is refused (their access is preserved). */
function isEmptySelfRecord(d) {
  d = d || {}; var t = d.terms || {};
  return d.source === 'self' && d.hasOrders !== true && !d.editorLite && !Object.keys(t).length && !(d.agreements || []).length && !d.supersededBy && !d.mergedInto;
}
function strayReads(db, org, root, from, address) {
  var ref = root.collection('customers').doc(from);
  return [ref.collection('users').limit(2), db.collection('orders').where('orgId', '==', org).where('customerId', '==', from).limit(1),
    root.collection('sites').where('customerId', '==', from).limit(1), ref.collection('projects').limit(1),
    db.collection('orders').where('orgId', '==', org).where('customer.email', '==', address).limit(1)];
}
/* What kind of move the office may make of `address` off account `from`,
   judged on reads made through `get` (plain, or the transaction's). */
async function strayKind(db, org, from, address, get) {
  var root = db.collection('omega_orgs').doc(org), ref = root.collection('customers').doc(P.id(from));
  var rows = await Promise.all([get(ref), get(ref.collection('users').doc(address))]);
  if (!rows[0].exists || !rows[1].exists) return null;
  var d = rows[0].data() || {}, u = rows[1].data() || {};
  var checks = await Promise.all(strayReads(db, org, root, ref.id, address).map(get));
  if (isEmptySelfRecord(d) && checks[0].size === 1 && checks[0].docs[0].id === address && checks[1].empty && checks[2].empty && checks[3].empty && checks[4].empty) {
    return { kind: 'account', ref: ref, status: d.status || 'active' };
  }
  if (!admitted(u) && checks[4].empty) return { kind: 'request', ref: ref, status: u.status || 'active' };
  return null;
}
async function addUser(db, org, customerId, address, fields, by, how) {
  address = email(address); fields = fields || {}; how = how || {};
  var root = db.collection('omega_orgs').doc(org), cid = P.id(customerId), acctRef = root.collection('customers').doc(cid);
  var role = fields.role === 'owner' ? 'owner' : 'user', status = fields.status === 'pending' ? 'pending' : 'active';
  var MERGE = 'This email already belongs to another customer account; contact ClearSky for a reviewed account merge';
  var plain = function (ref) { return ref.get(); };
  var pre = await root.collection('customer_index').doc(address).get(), stray = null;
  if (pre.exists && P.id(pre.data().customerId) !== cid) {
    stray = how.rehome ? await strayKind(db, org, P.id(pre.data().customerId), address, plain) : null;
    if (!stray) throw A.httpError(409, MERGE);
  }
  return db.runTransaction(async function (tx) {
    var acct = await tx.get(acctRef), ptrRef = root.collection('customer_index').doc(address), ptr = await tx.get(ptrRef), uref = acctRef.collection('users').doc(address), u = await tx.get(uref);
    var was = ptr.exists ? P.id(ptr.data().customerId) : null, again = null;
    if (was && was !== cid) {
      if (!stray || stray.ref.id !== was) throw A.httpError(409, MERGE);
      again = await strayKind(db, org, was, address, function (ref) { return tx.get(ref); });
      if (!again || again.kind !== stray.kind || again.status !== stray.status) throw A.httpError(409, 'That login changed while it was being moved; try again');
    }
    if (!acct.exists || DEAD.indexOf(acct.data().status) >= 0) throw A.httpError(404, 'Active customer account not found');
    if (u.exists) throw A.httpError(409, 'This person is already on the account; their access was preserved');
    var now = new Date().toISOString(), moved = null, label = acct.data().name || cid;
    if (again) {
      tx.update(ptrRef, { customerId: cid, movedFrom: was, movedAt: now, movedBy: by });
      if (again.kind === 'account') tx.update(again.ref, { status: 'suspended', supersededBy: cid, supersededAt: now, updatedAt: now });
      tx.update(again.ref.collection('users').doc(address), { status: 'disabled', movedTo: cid, updatedAt: now, note: 'Moved to ' + label });
      moved = was;
    } else if (!ptr.exists) tx.create(ptrRef, { customerId: cid, email: address, createdAt: now });
    var doc = { email: address, name: clean(fields.name, 120), phone: clean(fields.phone, 40), role: role, status: status, source: how.source || 'office', addedBy: by || null, createdAt: now };
    if (status === 'pending') doc.requestedAt = now;
    if (fields.uid) doc.uid = fields.uid;
    tx.create(uref, doc);
    var action = status === 'pending' ? 'buyer-join-requested' : !moved ? 'buyer-user-added' : again.kind === 'request' ? 'buyer-request-rehomed' : 'buyer-login-rehomed';
    tx.create(db.collection('omega_audit').doc(), { action: action, orgId: org, customerId: cid, email: address, role: role, status: status, source: how.source || 'office', from: moved, by: by || address, at: now });
    return { ok: true, customerId: cid, email: address, role: role, status: status, moved: moved, account: { id: cid, data: acct.data(), user: doc, created: true } };
  });
}

/* ── One writer of a person's status or role ───────────────────────────
   setUser(db, org, customerId, address, {status?, role?}, by, how)
     how.owner   the caller is the account's OWNER (customer side): may
                 approve a pending request, disable or re-enable a colleague;
                 may not change roles or their own access.
   Nobody may leave an account without an active owner. Never deletes. */
async function setUser(db, org, customerId, address, change, by, how) {
  address = email(address); change = change || {}; how = how || {};
  var status = change.status == null ? null : String(change.status), role = change.role == null ? null : String(change.role);
  if (status !== null && ['active', 'disabled'].indexOf(status) < 0) throw A.httpError(400, 'Choose active or disabled');
  if (role !== null && ['owner', 'user'].indexOf(role) < 0) throw A.httpError(400, 'Choose owner or user');
  if (status === null && role === null) throw A.httpError(400, 'Nothing to change');
  if (how.owner && role !== null) throw A.httpError(403, 'Only your supplier can change who owns the account');
  if (how.owner && by && String(by).toLowerCase() === address) throw A.httpError(400, 'You cannot change your own access');
  var root = db.collection('omega_orgs').doc(org), cid = P.id(customerId), acctRef = root.collection('customers').doc(cid);
  return db.runTransaction(async function (tx) {
    var acct = await tx.get(acctRef), uref = acctRef.collection('users').doc(address), u = await tx.get(uref), all = await tx.get(acctRef.collection('users').limit(100));
    if (!acct.exists) throw A.httpError(404, 'Customer account not found');
    if (!u.exists) throw A.httpError(404, 'That person is not on this account');
    var cur = u.data() || {}, next = { status: status !== null ? status : (cur.status || 'active'), role: role !== null ? role : (cur.role === 'owner' ? 'owner' : 'user') };
    var owners = all.docs.filter(function (d) { var v = d.data() || {}; var s = d.id === address ? next.status : (v.status || 'active'), r = d.id === address ? next.role : v.role; return r === 'owner' && s === 'active'; });
    /* Refuse only a change that TAKES AWAY the last active owner. An account
       the office made with no owner yet (the PO inbox's company form) must
       still let the office approve a request or turn someone off. */
    var wasOwner = cur.role === 'owner' && (cur.status || 'active') === 'active';
    if (wasOwner && !(next.role === 'owner' && next.status === 'active') && !owners.length) throw A.httpError(409, 'An account needs at least one active owner; make someone else the owner first');
    var curStatus = cur.status || 'active', now = new Date().toISOString(), patch = { status: next.status, role: next.role, updatedAt: now, updatedBy: by || null };
    if (next.status === 'active' && (curStatus === 'pending' || cur.declined === true)) { patch.approvedAt = now; patch.approvedBy = by || null; patch.declined = false; }
    /* Turning a waiting request down is its own state: the person was never
       admitted, so none of their orders are the account's and the office may
       later move the login to the right company. */
    if (curStatus === 'pending' && next.status === 'disabled') { patch.declined = true; patch.declinedAt = now; patch.declinedBy = by || null; }
    tx.update(uref, patch);
    tx.create(db.collection('omega_audit').doc(), { action: patch.declined === true ? 'buyer-request-declined' : 'buyer-user-updated', orgId: org, customerId: cid, email: address, was: { status: cur.status || 'active', role: cur.role || 'user' }, now: next, by: by || null, via: how.owner ? 'owner' : 'office', at: now });
    return { ok: true, email: address, status: next.status, role: next.role, declined: patch.declined === true };
  });
}

/* ── A colleague signing in for the first time ─────────────────────────
   Their verified email's domain matches exactly ONE active company account
   the office set up (amperagecapital.com → Amperage Capital): they join it
   as a PENDING user — nothing is visible until the account owner or the
   supplier approves — instead of silently getting an account of their own
   that would then block the office from adding them. */
async function joinRequest(db, org, address, caller) {
  address = email(address);
  var d = companyDomain(address); if (!d) return null;
  var s = await db.collection('omega_orgs').doc(org).collection('customers').where('domain', '==', d).limit(3).get();
  var hits = s.docs.filter(function (r) { var v = r.data() || {}; return officeCompany(v) && (v.status || 'active') === 'active'; });
  if (hits.length !== 1) return null;
  var out = await addUser(db, org, hits[0].id, address, { name: caller && caller.name, role: 'user', status: 'pending', uid: caller && caller.uid }, address, { source: 'domain-request' });
  return out.account;
}
/* A company by name, so the office does not create a second "Amperage
   Capital". Only an office company matches (officeCompany): a self-made
   account's name is whatever its customer typed, so matching it would hand
   the office's contacts and POs to whoever typed the name first. Records
   written before nameLower existed are matched by a bounded scan. */
async function findByName(db, org, name) {
  var key = nameKey(name); if (!key) return null;
  var col = db.collection('omega_orgs').doc(org).collection('customers');
  var s = await col.where('nameLower', '==', key).limit(5).get();
  var hit = s.docs.filter(function (r) { return officeCompany(r.data()); })[0];
  if (hit) return { id: hit.id, data: hit.data() };
  var all = await col.limit(500).get();
  hit = all.docs.filter(function (r) { var v = r.data() || {}; return nameKey(v.name) === key && officeCompany(v); })[0];
  return hit ? { id: hit.id, data: hit.data() } : null;
}

module.exports = { email: email, clean: clean, context: context, active: active, lookup: lookup, ensure: ensure,
  people: people, accountOrders: accountOrders, accountOfOrder: accountOfOrder, millis: millis,
  addUser: addUser, setUser: setUser, joinRequest: joinRequest, findByName: findByName,
  stampableAccount: stampableAccount, admitted: admitted, officeCompany: officeCompany,
  companyDomain: companyDomain, accountDomain: accountDomain, nameKey: nameKey };
