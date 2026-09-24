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

     action:'create'  { customer:{name,email,...}, items:[{sku,qty}],
                        system:{kw,kwh}, projectId?, note? }
                      `note` is the REP's note. It lands on the history
                      thread, the same place action:'note' puts one, and
                      never in customer.notes — that field is the
                      customer's own words and nothing else.
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
var M = require('./_lib/mail');
var B = require('./_lib/buyer-accounts');

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

  /* 'create' is the only action with no orderId — it is making one. */
  if (b.action === 'create') {
    return A.authenticate(req).then(function (caller) { return create(caller, b); });
  }

  var orderId = clean(b.orderId, 120);
  if (!orderId) throw A.httpError(400, 'orderId required');

  return A.authenticate(req).then(function (caller) {
    var db = A.db(), FV = A.FieldValue();
    var ref = db.collection('orders').doc(orderId);

    return ref.get().then(function (s) {
      if (!s.exists) throw A.httpError(404, 'order not found');
      var order = s.data() || {};
      var orgId = String(order.orgId || '').toLowerCase();

      if (order.logic && ['price', 'status'].indexOf(b.action) >= 0) {
        throw A.httpError(409, 'This order is managed by Omega Logic. Use its office workflow so invoice, payment, cancellation and shipment controls remain consistent.');
      }

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

/* ═══════════════════════════════════════════════════════════════════════════
   action:'create' — a TENANT places an order themselves
   ═══════════════════════════════════════════════════════════════════════════
   /api/embed-order covers the public path: a stranger on the manufacturer's
   website. This is the other half — the manufacturer's own team ordering on a
   customer's behalf, from a project they just designed.

   SAME DISCIPLINE, DIFFERENT DOOR. Everything embed-order refuses to read
   from the request, this refuses too: orgId and fulfilledBy are stamped from
   the tenant record, status is pinned to 'new', pricing starts null, and the
   item price is re-read from the org's published catalogue by SKU. A tenant
   admin is not a stranger, but they are also not the party that prices the
   order — ClearSky is, and an order that arrived already priced would make
   the invoice unreconcilable in exactly the way action:'price' guards
   against.

   WHAT IT ADDS over the public path: it is attributed to a real signed-in
   person (`placedBy`), it can carry a projectId so the order traces back to
   the design, and it skips the consent checkbox and the honeypot — those
   exist to gate an anonymous form, and re-asking a signed-in colleague to
   tick a box about being contacted is theatre.

   IT DOES NOT DEDUPE. embed-order does, because a customer double-clicking a
   web form is common and produces two identical rows. A colleague filing two
   orders for one customer usually means two orders. */
function create(caller, b) {
  var db = A.db(), FV = A.FieldValue();
  var orgId = String(b.orgId ? clean(b.orgId, 120).toLowerCase() : caller.orgId);

  return A.canActInOrg(caller, orgId).then(function (ok) {
    if (!ok) throw A.httpError(403, 'not your workspace');

    var customer = b.customer || {};
    var name = clean(customer.name, 120);
    var email = clean(customer.email, 160).toLowerCase();
    if (!name) throw A.httpError(400, 'customer.name is required');
    if (!/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(email)) throw A.httpError(400, 'a valid customer.email is required');

    var loads = [
      db.collection('omega_orgs').doc(orgId).get(),
      db.collection('omega_orgs').doc(orgId).collection('storefront').doc('config').get()
    ];
    if (b.projectId) loads.push(db.collection('projects').doc(clean(b.projectId, 120)).get());

    return Promise.all(loads).then(function (r) {
      if (!r[0].exists) throw A.httpError(404, 'workspace not found');
      var org = r[0].data() || {};
      var sf = r[1].exists ? (r[1].data() || {}) : {};

      /* A named project must belong to this org. Otherwise an order could be
         attributed to somebody else's design. */
      var projectId = null;
      if (b.projectId) {
        var ps = r[2];
        if (!ps || !ps.exists) throw A.httpError(404, 'project not found');
        if (String((ps.data() || {}).orgId || '').toLowerCase() !== orgId) {
          throw A.httpError(403, 'that project belongs to another workspace');
        }
        projectId = clean(b.projectId, 120);
      }

      /* Components (api/_lib/materials.js) are what a product is made of,
         not a thing that is sold; an order line naming one is refused. */
      var published = (Array.isArray(sf.products) ? sf.products : []).filter(function (p) { return p && p.kind !== 'component'; });
      var components = (Array.isArray(sf.products) ? sf.products : []).filter(function (p) { return p && p.kind === 'component'; });
      function bySku(sku) {
        for (var i = 0; i < published.length; i++) if (String(published[i].sku) === sku) return published[i];
        return null;
      }

      var items = [];
      (Array.isArray(b.items) ? b.items : []).slice(0, 40).forEach(function (it) {
        var sku = clean(it && it.sku, 64);
        if (!sku) return;
        if (components.some(function (c) { return String(c.sku) === sku; })) throw A.httpError(400, sku + ' is a component, not a product');
        var p = bySku(sku);
        items.push({
          sku: sku,
          name: clean((p && p.name) || (it && it.name) || sku, 120),
          qty: Math.max(1, Math.min(9999, num(it && it.qty) || 1)),
          kw: p ? num(p.kw) : num(it && it.kw),
          kwh: p ? num(p.kwh) : num(it && it.kwh),
          /* From the CATALOGUE, never the request — the same rule as the
             public path, for the same reason. */
          listPrice: (p && p.priceMode === 'list') ? num(p.listPrice) : null,
          published: !!p
        });
      });

      var ref = db.collection('orders').doc();
      var d = new Date();
      var slug = orgId.replace(/\..*$/, '').replace(/[^a-z0-9]/gi, '').slice(0, 4).toUpperCase() || 'ORD';
      var day = d.getUTCFullYear() + ('0' + (d.getUTCMonth() + 1)).slice(-2) + ('0' + d.getUTCDate()).slice(-2);
      var no = slug + '-' + day + '-' + ref.id.slice(-5).toUpperCase();

      var doc = {
        orderNo: no,
        orgId: orgId,
        orgName: clean(org.name, 120) || orgId,
        fulfilledBy: String(sf.fulfilledBy || 'clearsky'),
        status: 'new',                      /* pinned, as on the public path */
        source: 'tenant',
        placedBy: caller.email,             /* a real person, unlike an embed order */
        sourceProjectId: projectId,
        configId: null,
        customer: {
          name: name, company: clean(customer.company, 160), email: email,
          phone: clean(customer.phone, 40),
          /* The customer's OWN words and nothing else. This used to read
             `customer.notes || b.note`, which put the rep's note in the
             field orders.html labels "Customer said:" — and which
             api/_lib/portal.js had to exclude from the buyer's projection
             for exactly that reason. The rep's note goes on the history
             thread below, where action:'note' already puts one. */
          notes: clean(customer.notes, 2000),
          address: {
            line1: clean(customer.address && customer.address.line1, 200),
            city: clean(customer.address && customer.address.city, 100),
            state: clean(customer.address && customer.address.state, 40),
            zip: clean(customer.address && customer.address.zip, 20)
          }
        },
        system: {
          kw: num(b.system && b.system.kw), kwh: num(b.system && b.system.kwh),
          durationH: num(b.system && b.system.durationH),
          basis: projectId ? 'designed-in-editor' : 'tenant-entered'
        },
        items: items,
        pricing: null,                      /* ClearSky prices it */
        provenance: { placedBy: caller.email, via: 'api/orders create' },
        history: (function () {
          var h = [{ at: new Date().toISOString(), by: caller.email, what: 'created' }];
          var repNote = clean(b.note, 2000);
          if (repNote) h.push({ at: new Date().toISOString(), by: caller.email, what: 'note: ' + repNote });
          return h;
        })(),
        createdAt: FV.serverTimestamp(),
        updatedAt: FV.serverTimestamp()
      };

      /* The customer ACCOUNT this order belongs to, when the email is on one
         that ADMITTED that person (B.stampableAccount: never a join request
         still waiting or turned down): a signed-in member of the tenant typed
         it (canActInOrg), so every person on that account sees the order
         (buyer-accounts accountOrders). An anonymous public order never gets
         this stamp. The pointer is read in the SAME transaction as the
         write, so an office move of that login (buyers user-add rehome)
         and this order are serialised instead of racing; the account is
         marked hasOrders so an emptiness check cannot miss it. */
      return db.runTransaction(function (tx) {
        return B.stampableAccount(db, orgId, email, tx).then(function (cid) {
          /* each attempt decides afresh: a retried transaction must not
             carry a stamp from an attempt that was thrown away */
          delete doc.customerId;
          if (cid) {
            doc.customerId = String(cid);
            tx.update(db.collection('omega_orgs').doc(orgId).collection('customers').doc(String(cid)), { hasOrders: true });
          }
          tx.set(ref, doc);
        });
      }).then(function () {
        try {
          var to = process.env.ORDER_NOTIFY || process.env.MAIL_NOTIFY || 'dev@clearsky-usa.com';
          M.send(to, '[OMEGA] New order ' + no + ' — ' + doc.orgName,
            M.layout('Order ' + no, '<table style="font-size:14px;border-collapse:collapse">'
              + M.row('Workspace', doc.orgName + ' (' + orgId + ')')
              + M.row('Placed by', caller.email)
              + M.row('Customer', name + (doc.customer.company ? ' · ' + doc.customer.company : ''))
              + M.row('Email', email)
              + M.row('System', (doc.system.kw || '?') + ' kW / ' + (doc.system.kwh || '?') + ' kWh')
              + M.row('Items', items.length
                  ? items.map(function (i) { return i.qty + '× ' + (i.name || i.sku); }).join(', ') : '—')
              + '</table>'
              + M.button('https://silmarillion.clearskyomega.com/orders', 'Work this order')));
        } catch (e) {}
        return { ok: true, orderId: ref.id, orderNo: no, status: 'new' };
      });
    });
  });
}
