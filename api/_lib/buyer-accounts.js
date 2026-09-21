/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var A = require('./admin'), X = require('./logic-access'), P = require('./logic-policy');
function email(value) {
  var s = String(value || '').trim().toLowerCase();
  if (s.length > 254 || !/^[^@\s/]+@[^@\s/]+\.[^@\s/]+$/.test(s)) throw A.httpError(400, 'A valid customer email is required');
  return s;
}
function clean(v, n) { return String(v || '').trim().slice(0, n || 160); }
async function context(org) {
  var ctx = await X.context(org);
  if (!X.subscribed(ctx)) throw A.httpError(403, 'This customer portal is not active');
  return ctx;
}
function active(acct) {
  if (!acct || !acct.user || ['disabled', 'suspended', 'cancelled'].indexOf(acct.data.status) >= 0 ||
      ['disabled', 'suspended'].indexOf(acct.user.status) >= 0) throw A.httpError(403, 'Customer access is disabled. Contact your supplier.');
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
    var now = new Date().toISOString(), data = { orgId: org, name: clean(seed.company) || clean(seed.name) || address,
      plan: 'free', status: 'active', source: seed.source === 'office' ? 'office' : 'self',
      terms: seed.terms || {}, agreements: [], hasOrders: seed.hasOrders === true, createdAt: now };
    var user = { email: address, name: clean(seed.name, 120), phone: clean(seed.phone, 40), role: 'owner', status: 'active', createdAt: now };
    if (caller && caller.uid && String(caller.email).toLowerCase() === address) {
      user.uid = caller.uid; user.lastSeenAt = now;
    }
    tx.create(root.collection('customer_index').doc(address), { customerId: ref.id, email: address, createdAt: now });
    tx.create(ref, data);
    tx.create(ref.collection('users').doc(address), user);
    if (seed.source === 'office') tx.create(db.collection('omega_audit').doc(), {
      action: 'buyer-created', orgId: org, customerId: ref.id, email: address, by: caller.email, at: now
    });
    return { id: ref.id, data: data, user: user, created: true };
  });
}
module.exports = { email: email, clean: clean, context: context, active: active, lookup: lookup, ensure: ensure };
