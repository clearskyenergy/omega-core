/* ═══════════════════════════════════════════════════════════════════════════════
   POST /api/orders   — work an order: price it, move it, annotate it
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   READS ARE NOT HERE. orders.html queries Firestore directly and the rules
   decide: a tenant sees their own rows, ClearSky sees all. That is on purpose
   — a live listener beats a polling endpoint, and routing reads through a
   function would mean re-implementing the rules in JavaScript, which is the
   thing CLAUDE.md says the rules exist to prevent.

   WRITES ARE ALL HERE, because every one of them is a decision about money or
   commitment and the rules for those cannot be expressed as a document shape:

     action:'price'   { orderId, pricing:{ subtotal, freight, tax, total,
                                           currency, validUntil, terms } }
     action:'status'  { orderId, status, note? }
     action:'note'    { orderId, note }
     action:'assign'  { orderId, owner }

   ─────────────────────────────────────────────────────────────────────────────
   WHO MAY DO WHAT, AND WHY IT IS ASYMMETRIC
   ─────────────────────────────────────────────────────────────────────────────
   The white-label arrangement is: the tenant SELLS, ClearSky FULFILS. So

     PRICE            ClearSky only. The tenant's own margin sits on top of
                      our number; letting them write ours would make the
                      invoice unreconcilable.
     STATUS           ClearSky only, EXCEPT 'cancelled', which the tenant may
                      always set on their own order. Their customer, their
                      right to call it off — and a tenant who cannot cancel
                      rings us instead, which is worse for everyone.
     NOTE / ASSIGN    Either side. A shared thread on the order beats two
                      systems and a phone call.

   A tenant is never given a path to 'shipped'. Marking goods shipped that
   have not shipped is the one status lie with a customer on the other end
   of it.
   ═══════════════════════════════════════════════════════════════════════════════ */
'use strict';
var A = require('./_lib/admin');

/* The lifecycle, in order. Not a free-text field: a queue where one person
   types 'in progress' and another types 'In Progress' cannot be counted. */
var STATUS = ['new', 'confirmed', 'quoted', 'accepted', 'in_fulfilment', 'shipped', 'complete', 'cancelled'];
var TENANT_MAY_SET = ['cancelled'];

function clean(v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max || 200); }
function num(v) { var n = Number(v); return isFinite(n) ? n : null; }
function money(v) {
  var n = num(v);
  if (n == null) return null;
  if (n < 0) throw A.httpError(400, 'amounts cannot be negative');
  if (n > 1e11) throw A.httpError(400, 'that amount is out of range');
  return Math.round(n * 100) / 100;
}

module.exports = A.handler(function (req) {
  if (req.method !== 'POST') throw A.httpError(405, 'POST only');
  var b = req.body || {};
  var orderId = clean(b.orderId, 120);
  if (!orderId) throw A.httpError(400, 'orderId required');

  return A.authenticate(req).then(function (caller) {
    var db = A.db(), FV = A.FieldValue();
    var ref = db.collection('orders').doc(orderId);

    return ref.get().then(function (s) {
      if (!s.exists) throw A.httpError(404, 'order not found');
      var order = s.data() || {};
      var orgId = String(order.orgId || '').toLowerCase();

      return A.canActInOrg(caller, orgId).then(function (inOrg) {
        /* Two different capabilities, kept as two variables rather than one
           `allowed`, because every branch below needs to say WHICH. */
        var staff = !!caller.staff;
        if (!staff && !inOrg) throw A.httpError(403, 'not your order');

        var entry = { at: new Date().toISOString(), by: caller.email, what: '' };
        var patch = { updatedAt: FV.serverTimestamp() };

        if (b.action === 'price') {
          if (!staff) throw A.httpError(403, 'pricing is set by ClearSky');
          var p = b.pricing || {};
          var pricing = {
            subtotal: money(p.subtotal), freight: money(p.freight), tax: money(p.tax),
            total: money(p.total), currency: clean(p.currency, 8) || 'USD',
            validUntil: clean(p.validUntil, 40), terms: clean(p.terms, 1000),
            pricedBy: caller.email, pricedAt: new Date().toISOString()
          };
          if (pricing.total == null) throw A.httpError(400, 'pricing.total is required');
          patch.pricing = pricing;
          /* Pricing an order IS quoting it. Two clicks to do one thing is how
             a queue fills with priced rows still marked 'new'. */
          if (order.status === 'new' || order.status === 'confirmed') patch.status = 'quoted';
          entry.what = 'priced ' + pricing.currency + ' ' + pricing.total
                     + (patch.status ? ' · status → quoted' : '');

        } else if (b.action === 'status') {
          var next = clean(b.status, 40);
          if (STATUS.indexOf(next) < 0) throw A.httpError(400, 'unknown status: ' + next);
          if (!staff && TENANT_MAY_SET.indexOf(next) < 0) {
            throw A.httpError(403, 'ClearSky moves an order through fulfilment; you may cancel it');
          }
          if (order.status === 'complete' && next !== 'complete') {
            throw A.httpError(409, 'a completed order cannot be reopened — raise a new one');
          }
          patch.status = next;
          entry.what = 'status → ' + next + (b.note ? ' · ' + clean(b.note, 500) : '');

        } else if (b.action === 'note') {
          var note = clean(b.note, 2000);
          if (!note) throw A.httpError(400, 'note is empty');
          entry.what = 'note: ' + note;

        } else if (b.action === 'assign') {
          var owner = clean(b.owner, 160).toLowerCase();
          patch.owner = owner || null;
          entry.what = owner ? ('assigned to ' + owner) : 'unassigned';

        } else {
          throw A.httpError(400, 'unknown action');
        }

        /* Append, never replace. The history is the audit trail and an
           order's price changing with no record of who changed it is the
           argument you lose. */
        patch.history = FV.arrayUnion(entry);

        return ref.update(patch).then(function () {
          if (patch.status && patch.status !== order.status) {
            try {
              db.collection('omega_orgs').doc(orgId).collection('notifications').add({
                text: 'Order ' + (order.orderNo || orderId) + ' is now ' + patch.status,
                kind: 'order', orderId: order.orderNo || orderId, read: false,
                createdAt: FV.serverTimestamp()
              });
            } catch (e) {}
          }
          return { ok: true, orderId: orderId, status: patch.status || order.status };
        });
      });
    });
  });
});
