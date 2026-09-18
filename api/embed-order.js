/* ═══════════════════════════════════════════════════════════════════════════════
   POST /api/embed-order
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   A member of the public, on the tenant's own website, asks to order a system.
   This is the ONLY write a stranger can cause anywhere in omega-core, so it
   is written as if that is the whole threat model — because it is.

   Body: {
     key,                       // embed key
     customer: { name, company, email, phone, address{line1,city,state,zip}, notes },
     system:   { kw, kwh, durationH },
     items:    [ { sku, qty } ],
     configId?,                 // ordering a configuration a designer published
     consent: true,             // they ticked the box
     _hp: ''                    // honeypot; a bot fills it, a person cannot see it
   }

   ─────────────────────────────────────────────────────────────────────────────
   AN ORDER IS A REQUEST. IT IS NOT A TRANSACTION.
   ─────────────────────────────────────────────────────────────────────────────
   status is pinned to 'new' and nothing here takes payment. A human confirms
   every row before anything is committed to. That is what makes a publishable
   key an acceptable credential on this endpoint: the worst a forged call
   achieves is a junk row in a queue somebody reads.

   THEREFORE THESE FIELDS ARE NOT READ FROM THE REQUEST, EVER:
     status, pricing, price, cost, margin, fulfilment, orgId, fulfilledBy,
     history, createdAt
   They are set here or not at all. A browser that could set `pricing` could
   order a 4 MWh system for a dollar and have a document that says we agreed.
   The item PRICE likewise is re-read from the tenant's published catalogue by
   SKU; the quantity is the only number the customer gets to choose.

   ─────────────────────────────────────────────────────────────────────────────
   WHO OWNS WHAT
   ─────────────────────────────────────────────────────────────────────────────
     orgId       the white-label tenant. Their customer, their relationship,
                 their name on the storefront. They read the order.
     fulfilledBy 'clearsky' — WE manage the order and the fulfilment. That is
                 the deal being sold: the tenant sells, we deliver.

   Both are stamped server-side from the tenant record, so a request cannot
   file an order into somebody else's workspace or reassign who fulfils it.

   ─────────────────────────────────────────────────────────────────────────────
   NO CUSTOMER EMAIL BY DEFAULT — AND WHY THAT IS THE WHITE LABEL WORKING
   ─────────────────────────────────────────────────────────────────────────────
   _lib/mail.js sends from support@csebuilders.com. A confirmation email to
   Clean Cell's customer would arrive as "Clean Cell <support@csebuilders.com>"
   and tell them, in the From line, exactly who is really behind the website
   they just ordered from. That is the one thing a white label is bought to
   prevent, so the customer receipt is OFF unless the tenant has a verified
   sending identity (whiteLabel.embed.mailFrom + a Workspace "send mail as"
   grant or their own SPF/DKIM). The page confirms on screen instead, which
   reveals nothing.

   Until a tenant sending domain exists, the notifications that DO go out are
   internal: ClearSky fulfilment, and a row in the tenant's own inbox.
   See docs/WHITE-LABEL.md § Sending domain.
   ═══════════════════════════════════════════════════════════════════════════════ */
'use strict';
var E = require('./_lib/embed');
var A = require('./_lib/admin');
var M = require('./_lib/mail');

var DAILY_DEFAULT = 60;
var DEDUPE_MS = 10 * 60 * 1000;

function clean(v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max || 200); }
function num(v) { var n = Number(v); return isFinite(n) ? n : null; }

/* Deliberately permissive — this refuses what cannot be a mailbox, not what
   an RFC frowns on. A real customer turned away by a clever regex is a lost
   order; a typo is caught by the human who reads the queue. */
function email(v) {
  var e = clean(v, 160).toLowerCase();
  return /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(e) ? e : '';
}

function readCustomer(raw) {
  var c = raw || {};
  var out = {
    name:    clean(c.name, 120),
    company: clean(c.company, 160),
    email:   email(c.email),
    phone:   clean(c.phone, 40),
    notes:   clean(c.notes, 2000),
    address: {
      line1: clean(c.address && c.address.line1, 200),
      city:  clean(c.address && c.address.city, 100),
      state: clean(c.address && c.address.state, 40),
      zip:   clean(c.address && c.address.zip, 20)
    }
  };
  if (!out.name) throw A.httpError(400, 'Please give us a name to put on the order.');
  if (!out.email) throw A.httpError(400, 'Please give us an email address we can reply to.');
  return out;
}

/* Human-readable, sortable, and it does not leak a count: the suffix is the
   document id's own tail, not a sequence, so nobody learns how many orders
   this tenant has taken from their own order number. */
function orderNo(orgId, id) {
  var d = new Date();
  var slug = String(orgId).replace(/\..*$/, '').replace(/[^a-z0-9]/gi, '').slice(0, 4).toUpperCase() || 'ORD';
  var day = d.getUTCFullYear() + ('0' + (d.getUTCMonth() + 1)).slice(-2) + ('0' + d.getUTCDate()).slice(-2);
  return slug + '-' + day + '-' + String(id).slice(-5).toUpperCase();
}

/* The durable order limit. _lib/embed.js rate-limits reads in instance
   memory, which is right for reads and useless for the call that creates
   rows: every cold start gets a fresh allowance. So the one call with a
   consequence counts against a document, in a transaction, per UTC day. */
function claimDailySlot(db, FV, orgId, cap) {
  var ref = db.collection('omega_orgs').doc(orgId).collection('storefront').doc('counters');
  var day = new Date().toISOString().slice(0, 10);
  return db.runTransaction(function (tx) {
    return tx.get(ref).then(function (s) {
      var d = s.exists ? (s.data() || {}) : {};
      var n = (d.day === day) ? (num(d.orders) || 0) : 0;
      if (n >= cap) {
        throw A.httpError(429, 'This storefront has reached its order limit for today. Please contact us directly.');
      }
      tx.set(ref, { day: day, orders: n + 1, updatedAt: FV.serverTimestamp() }, { merge: true });
      return n + 1;
    });
  });
}

module.exports = E.handler(function (req) {
  if (req.method !== 'POST') throw A.httpError(405, 'POST only');
  var b = req.body || {};

  /* A bot fills every field it finds, including the one positioned off
     screen. Refused before anything is read or counted. Answered with a
     plain 400 rather than a fake success — we are not running a tarpit. */
  if (clean(b._hp, 80)) throw A.httpError(400, 'invalid submission');
  if (b.consent !== true) throw A.httpError(400, 'Please confirm you would like us to contact you.');

  return E.resolve(req, { limit: 10, scope: 'storefront' }).then(function (ctx) {
    var customer = readCustomer(b.customer);
    var db = A.db(), FV = A.FieldValue();
    var sfRef = db.collection('omega_orgs').doc(ctx.orgId).collection('storefront').doc('config');

    var configLoad = b.configId
      ? db.collection('embed_configs').doc(clean(b.configId, 64)).get()
      : Promise.resolve(null);

    return Promise.all([sfRef.get(), configLoad]).then(function (r) {
      var sf = r[0].exists ? (r[0].data() || {}) : {};
      var cfgSnap = r[1];

      /* A published configuration, if one was named. It carries the designed
         system and BOM, so it WINS over anything the browser sent — that is
         the whole point of publishing one: a designer decided it, and the
         customer is accepting it, not re-specifying it. */
      var config = null;
      if (b.configId) {
        if (!cfgSnap || !cfgSnap.exists) throw A.httpError(404, 'That configuration link is no longer valid.');
        config = cfgSnap.data() || {};
        if (String(config.orgId || '').toLowerCase() !== ctx.orgId) {
          throw A.httpError(403, 'That configuration belongs to another storefront.');
        }
        if (config.revoked === true) throw A.httpError(410, 'That configuration link has been withdrawn.');
        if (config.expiresAt && new Date(config.expiresAt).getTime() < Date.now()) {
          throw A.httpError(410, 'That configuration link has expired.');
        }
      }

      /* Items. Quantity is the customer's; everything else is re-read from
         the tenant's own published catalogue by SKU. An item whose SKU is not
         published is dropped rather than refused — a stale cached page should
         still be able to send us a lead. */
      var published = Array.isArray(sf.products) ? sf.products : [];
      function bySku(sku) {
        for (var i = 0; i < published.length; i++) {
          if (String(published[i].sku) === sku) return published[i];
        }
        return null;
      }

      var items = [];
      if (config && Array.isArray(config.items)) {
        items = config.items.map(function (it) {
          return { sku: clean(it.sku, 64), name: clean(it.name, 120), qty: Math.max(1, Math.min(9999, num(it.qty) || 1)),
                   kw: num(it.kw), kwh: num(it.kwh), listPrice: num(it.listPrice), source: 'config' };
        }).slice(0, 40);
      } else if (Array.isArray(b.items)) {
        b.items.slice(0, 20).forEach(function (it) {
          var sku = clean(it && it.sku, 64);
          if (!sku) return;
          var p = bySku(sku);
          if (!p) return;
          items.push({
            sku: sku, name: clean(p.name || sku, 120),
            qty: Math.max(1, Math.min(9999, num(it.qty) || 1)),
            kw: num(p.kw), kwh: num(p.kwh),
            /* From the CATALOGUE, not the request. */
            listPrice: p.priceMode === 'list' ? num(p.listPrice) : null,
            source: 'catalog'
          });
        });
      }

      /* The system. From the config when there is one; otherwise the figures
         the sizer showed, which are advisory on an order and are re-derived
         by whoever works it. Recorded as 'customer-reported' so nobody
         downstream mistakes them for an engineered number. */
      var system = config && config.system ? {
        kw: num(config.system.kw), kwh: num(config.system.kwh),
        durationH: num(config.system.durationH), basis: 'published-configuration'
      } : {
        kw: num(b.system && b.system.kw), kwh: num(b.system && b.system.kwh),
        durationH: num(b.system && b.system.durationH), basis: 'customer-reported'
      };

      var cap = num(sf.dailyOrderCap) || DAILY_DEFAULT;

      return claimDailySlot(db, FV, ctx.orgId, cap).then(function () {
        /* Double-click and back-button dedupe: the same email asking for the
           same thing inside ten minutes is one order, not two. Cheap, and it
           saves the person who works the queue from calling twice. */
        return db.collection('orders')
          .where('orgId', '==', ctx.orgId)
          .where('customer.email', '==', customer.email)
          .orderBy('createdAt', 'desc').limit(1).get()
          .then(function (q) {
            if (!q.empty) {
              var prev = q.docs[0];
              var pd = prev.data() || {};
              var at = pd.createdAt && pd.createdAt.toDate ? pd.createdAt.toDate().getTime() : 0;
              if (at && (Date.now() - at) < DEDUPE_MS && pd.status === 'new') {
                return prev.ref.update({
                  items: items, system: system,
                  'customer.notes': customer.notes,
                  updatedAt: FV.serverTimestamp()
                }).then(function () {
                  return { ok: true, orderId: prev.id, orderNo: pd.orderNo || null, deduped: true,
                           message: 'We already have your request — we have updated it.' };
                });
              }
            }
            return create();
          }, function () {
            /* The dedupe query needs a composite index. Missing one must not
               cost us the order, so a failed lookup falls through to create.
               firestore.indexes.json carries it; this is the belt. */
            return create();
          });

        function create() {
          var ref = db.collection('orders').doc();
          var no = orderNo(ctx.orgId, ref.id);
          var doc = {
            orderNo:     no,
            orgId:       ctx.orgId,                 /* whose customer */
            orgName:     clean(ctx.org.name, 120) || ctx.orgId,
            /* WE fulfil. Stamped, never requested. */
            fulfilledBy: String(sf.fulfilledBy || 'clearsky'),
            status:      'new',                     /* pinned; see header */
            source:      config ? 'config-link' : 'embed',
            configId:    config ? clean(b.configId, 64) : null,
            sourceProjectId: config ? (config.projectId || null) : null,
            customer:    customer,
            system:      system,
            items:       items,
            pricing:     null,                      /* filled by a human */
            provenance:  {
              embedKeyId: ctx.keyId,
              keyLabel:   ctx.keyLabel,
              /* A CLAIM by the embedding page, not a verified fact. Named so
                 it reads that way in the console too. */
              claimedOrigin:  ctx.origin || null,
              originAllowlisted: !!ctx.originTrusted,
              userAgent:  clean(req.headers && req.headers['user-agent'], 300)
            },
            history: [{ at: new Date().toISOString(), by: 'storefront', what: 'created' }],
            createdAt:   FV.serverTimestamp(),
            updatedAt:   FV.serverTimestamp()
          };

          return ref.set(doc).then(function () {
            notify(ctx, doc, sf);
            return {
              ok: true, orderId: ref.id, orderNo: no,
              message: clean(sf.thanks, 400) ||
                'Thank you — your request is with our team. We will be in touch shortly.'
            };
          });
        }
      });
    });
  });
});

/* Best-effort. A mail failure never fails the order: the Firestore row is the
   record and the console is where the work happens. Same rule as _lib/mail.js
   and as the rest of /api/. */
function notify(ctx, doc, sf) {
  var FV = A.FieldValue();
  var line = 'New order ' + doc.orderNo + ' — ' + (doc.system.kw || '?') + ' kW / '
           + (doc.system.kwh || '?') + ' kWh for ' + (doc.customer.company || doc.customer.name);

  /* The tenant's own inbox row. They sold it; they should see it arrive. */
  try {
    A.db().collection('omega_orgs').doc(ctx.orgId).collection('notifications')
      .add({ text: line, kind: 'order', orderId: doc.orderNo, read: false, createdAt: FV.serverTimestamp() });
  } catch (e) {}

  /* ClearSky fulfilment. ORDER_NOTIFY first: order fulfilment and workspace
     signups are different inboxes and different people, and MAIL_NOTIFY is
     already spoken for by signups. */
  try {
    var to = process.env.ORDER_NOTIFY || process.env.MAIL_NOTIFY || 'dev@clearsky-usa.com';
    var rows = M.row('Order', doc.orderNo)
      + M.row('Storefront', doc.orgName + ' (' + doc.orgId + ')')
      + M.row('System', (doc.system.kw || '?') + ' kW / ' + (doc.system.kwh || '?') + ' kWh')
      + M.row('Customer', doc.customer.name + (doc.customer.company ? ' · ' + doc.customer.company : ''))
      + M.row('Email', doc.customer.email)
      + M.row('Phone', doc.customer.phone || '—')
      + M.row('Site', [doc.customer.address.line1, doc.customer.address.city,
                       doc.customer.address.state, doc.customer.address.zip].filter(Boolean).join(', ') || '—')
      + M.row('Items', doc.items.length
          ? doc.items.map(function (i) { return i.qty + '× ' + (i.name || i.sku); }).join(', ') : '— (sizing only)')
      + M.row('From', doc.provenance.claimedOrigin || 'unknown')
      + M.row('Notes', doc.customer.notes || '—');
    M.send(to, '[OMEGA] ' + line,
      M.layout('Order ' + doc.orderNo, '<table style="font-size:14px;border-collapse:collapse">' + rows + '</table>'
        + M.button('https://silmarillion.clearskyomega.com/orders', 'Work this order')));
  } catch (e) {}

  /* The customer receipt, only when this tenant has a sending identity of
     their own. See the header: without one, the From line is the leak. */
  try {
    var wl = ctx.whiteLabel || {};
    var em = wl.embed || {};
    if (em.mailFrom && sf.emailCustomer === true) {
      /* wlLayout, not layout: the product layout prints CLEARSKY-OMEGA in the
         eyebrow and our address in the footer. Getting the From line right
         and then putting our name in the body would be a wasted precaution. */
      var brand = {
        name: doc.orgName,
        accent: em.accent || wl.accent || '',
        supportEmail: em.supportEmail || wl.supportEmail || '',
        attribution: em.attribution === 'powered-by'
          ? (wl.attributionText || 'Powered by ClearSky OMEGA') : ''
      };
      M.send(doc.customer.email, (doc.orgName || 'Your order') + ' — request received',
        M.wlLayout(brand, 'Thank you', '<p>We have your request for a '
          + (doc.system.kw ? M.esc(doc.system.kw + ' kW / ' + doc.system.kwh + ' kWh') : 'storage')
          + ' system. Your reference is <b>' + M.esc(doc.orderNo) + '</b>.</p>'
          + '<p>Someone will be in touch shortly.</p>'),
        null, { from: em.mailFrom, replyTo: em.supportEmail || wl.supportEmail || undefined });
    }
  } catch (e) {}
}
