/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/portal.js — what a BUYER may see of their own order
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   PURE. No Firestore, no network, no clock it does not receive. Two jobs:

     milestoneOf()  the order's eight internal statuses and the floor's ten
                    stations, collapsed into the six words a customer reads
     publicOrder()  the order document, rebuilt key by key for its customer

   ── WHY THE PROJECTION IS AN ALLOWLIST AND NOT A DENYLIST ────────────────
   An `orders` document carries `pricing`, `cost`, `margin`, `tenantPricing`,
   `provenance` and a `history[]` stamped with staff emails. A denylist is a
   list somebody has to remember to extend every time a field is added, and
   the failure is silent and points at the customer. So nothing here forwards
   a document: every key in the output is named in this file, which is the
   same discipline api/embed-config.js is built on and the reason its header
   warns never to replace it with a spread.

   scripts/test-portal.js poisons an order with a cost basis and a margin and
   then searches the serialised output for them. "The author remembered" is
   not a control.

   ── THREE FIELDS THAT LOOK SAFE AND ARE NOT ──────────────────────────────
   Established by reading api/orders.js and api/embed-order.js end to end
   rather than by assuming:

     fulfilledBy   is literally the string 'clearsky'. The whole white-label
                   deal is that the tenant sells and we fulfil invisibly —
                   api/embed-order.js turns OFF the customer receipt email
                   purely because a support@csebuilders.com From line would
                   give it away. Echoing the field in JSON does the same
                   thing more quietly.

     customer.notes LOOKED like the customer's own words and was not.
                   api/orders.js used to write it as
                   `clean(customer.notes || b.note, 2000)` — so when a
                   customer left it blank, the REP'S OWN note landed there. A
                   rep typing "shopping us against Tesla, do not go below X"
                   would have it handed back to that customer as "what you
                   told us". The write is fixed (the rep's note now goes on
                   the history thread), but every row created BEFORE the fix
                   still carries the alias and nothing on the record says
                   which ones. So the exclusion stays: an old order with a
                   rep's deal commentary in this field is one order too many.

     status        'quoted' means CLEARSKY has priced it to the TENANT. A
                   customer seeing that before their own reseller has quoted
                   them is a leak of an internal step, not just jargon.

   There are also THREE writers to an order, not two — api/embed-layout.js
   adds a siteStudy block — which is the argument for an allowlist rather
   than a denylist: writer number four is safe by default.

   ── WHY THE CUSTOMER DOES NOT SEE THE STATIONS ───────────────────────────
   The scan data is right there and it is tempting to show "Rack assembly,
   bench 3". The routing is the TENANT'S internal process, and whether their
   customers see bench-level detail is a commercial decision that belongs to
   them, not to us. So ten stations collapse into three public words and the
   map is overridable per tenant.

   What is actually valuable is not the label: it is that the milestone MOVES
   ON ITS OWN as scans arrive, so nobody at Clean Cell is emailing
   reassurance and no customer is phoning to ask.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

/* The public ladder. `cancelled` is off the ladder on purpose — it is a
   terminal state, not a step, and giving it an index would put it "after"
   shipped in any progress bar drawn from this. */
var LADDER = [
  { key: 'received',  label: 'Received',          say: 'We have your order and are confirming it.' },
  { key: 'confirmed', label: 'Confirmed',         say: 'Confirmed and scheduled into production.' },
  { key: 'production',label: 'In production',     say: 'Your units are being built.' },
  { key: 'testing',   label: 'Inspection & test', say: 'Built — now under inspection and end-of-line test.' },
  { key: 'ready',     label: 'Ready to ship',     say: 'Packed and staged for collection.' },
  { key: 'shipped',   label: 'Shipped',           say: 'On its way to you.' }
];
var CANCELLED = { key: 'cancelled', label: 'Cancelled', say: 'This order was cancelled.' };

/* status → milestone, for the statuses that decide on their own. */
var BY_STATUS = {
  'new':           'received',
  'confirmed':     'confirmed',
  'quoted':        'confirmed',   /* commercial states the customer need not parse */
  'accepted':      'confirmed',
  'in_fulfilment': null,          /* the floor decides — see stationMilestone */
  'shipped':       'shipped',
  'complete':      'shipped',
  'cancelled':     'cancelled'
};

/* station → milestone. The default BESS routing in api/_lib/plant.js. */
var BY_STATION = {
  kit: 'production', module: 'production', rack: 'production',
  encl: 'production', elec: 'production',
  bms: 'testing', eol: 'testing', qa: 'testing',
  pack: 'ready', ready: 'ready'
};

function norm(v) { return String(v == null ? '' : v).trim().toLowerCase(); }

/* Firestore writes createdAt with FieldValue.serverTimestamp(), so what comes
   back is a TIMESTAMP OBJECT, not a string. String()-ing it yields
   "[object Object]" — which is what a customer would have seen as their order
   date, and what would have silently defeated the newest-first sort in
   api/my-orders.js, because every row compares equal. Accepts a Timestamp, a
   Date, epoch millis or an ISO string; returns an ISO string or null. */
function when(v) {
  if (v == null) return null;
  try {
    if (typeof v.toDate === 'function') return v.toDate().toISOString();
    if (v instanceof Date) return isFinite(v.getTime()) ? v.toISOString() : null;
    if (typeof v === 'number' && isFinite(v)) return new Date(v).toISOString();
    if (typeof v === 'object' && typeof v._seconds === 'number') {
      return new Date(v._seconds * 1000).toISOString();
    }
    var s = String(v).trim();
    return s && s.indexOf('[object') !== 0 ? s.slice(0, 40) : null;
  } catch (e) { return null; }
}
function clip(v, n) { return v == null ? null : String(v).slice(0, n || 400); }
function numOrNull(v) { var n = Number(v); return isFinite(n) ? n : null; }

function ladderIndex(key) {
  for (var i = 0; i < LADDER.length; i++) if (LADDER[i].key === key) return i;
  return -1;
}
function step(key) {
  var i = ladderIndex(key);
  return i < 0 ? null : LADDER[i];
}

/* The FURTHEST-BEHIND unit decides, not the furthest ahead. An order of six
   units where five are packed and one is still at Electrical is "in
   production": telling a customer their order is ready when a sixth of it is
   on a bench is the kind of true-ish answer that costs a delivery date.

   A UNIT ON HOLD IS NOT PROGRESSING. It may be sitting at QA with a failed
   capacity test against it, and its station alone would report "Inspection &
   test" as though the line were moving. A held unit is pinned to the last
   milestone it genuinely completed, so the order cannot read further ahead
   than its most stuck unit. The customer is not told WHY — an NCR number is
   the tenant's business — only that it has not moved on. */
function stationMilestone(units) {
  if (!units || !units.length) return null;
  var worst = null, worstRank = 99;
  for (var i = 0; i < units.length; i++) {
    var u = units[i] || {};
    var at = norm(u.at);
    /* hasOwnProperty, not a bare lookup: norm() lets 'constructor' and
       '__proto__' through, and both would otherwise resolve to something
       inherited from Object.prototype rather than to undefined. */
    var m = Object.prototype.hasOwnProperty.call(BY_STATION, at) ? BY_STATION[at] : null;
    if (!m) {
      /* Not yet kitted, OR at a station this routing does not know. Both
         pin the order to the floor. The unknown-station case used to
         `continue` without touching worstRank, so that unit stopped
         participating in the furthest-behind decision entirely — a tenant
         who renames one station would have had orders reported by their
         REMAINING units, which is exactly the over-reporting this function
         exists to prevent.

         Ranked AT 'production' rather than at 0: pinning it to zero made it
         unbeatable, so a unit held back at Kitting could never be recognised
         as the furthest behind. */
      var pr = ladderIndex('production');
      if (pr < worstRank) { worstRank = pr; worst = 'production'; }
      continue;
    }
    var r = ladderIndex(m);
    /* Held: do not credit the station it is stuck AT. */
    if (u.hold) r = Math.max(0, r - 1);
    if (r < worstRank) { worstRank = r; worst = LADDER[r] ? LADDER[r].key : m; }
  }
  return worst;
}

/* unit, order, tenant map → the one word the customer reads.
   `map` lets a tenant rename or re-group the public ladder without a deploy;
   an unknown key in it is ignored rather than obeyed, because a typo in a
   config document should not invent a milestone. */
function milestoneOf(order, units, map) {
  var status = norm(order && order.status) || 'new';
  var key = Object.prototype.hasOwnProperty.call(BY_STATUS, status) ? BY_STATUS[status] : 'received';

  if (key === 'cancelled') {
    return { key: CANCELLED.key, label: CANCELLED.label, say: CANCELLED.say, index: null, of: LADDER.length };
  }
  if (key === null) {
    key = stationMilestone(units) || 'production';
  }
  // Some items may be allocated ready stock while other items are not yet
  // serialized. Those ready units cannot speak for an incomplete order.
  if (order && order.logic && key === 'ready' && !order.logic.readyAt) key = 'production';
  if (order && order.logic && (order.cancelRequested || order.logic.paymentException) && key !== 'shipped') key = 'confirmed';

  var s = step(key) || LADDER[0];
  var label = s.label, say = s.say;
  if (map && typeof map === 'object' && map[s.key]) {
    var o = map[s.key];
    if (typeof o === 'string') label = o;
    else { if (o.label) label = String(o.label); if (o.say) say = String(o.say); }
  }
  return { key: s.key, label: label, say: say, index: ladderIndex(s.key), of: LADDER.length };
}

/* ── the projection ──────────────────────────────────────────────────────
   Every key named. `tenantPricing` is the TENANT's price to their customer
   and is the only money that may appear here — and only when the tenant has
   published it. ClearSky's `pricing`, `cost` and `margin` never do. */
function publicOrder(order, opts) {
  var o = order || {};
  var op = opts || {};
  var ms = milestoneOf(o, op.units, op.milestoneMap);

  var items = [];
  var src = Array.isArray(o.items) ? o.items : [];
  for (var i = 0; i < src.length && i < 100; i++) {
    var it = src[i] || {};
    items.push({
      sku: clip(it.sku, 80),
      name: clip(it.name, 160),
      qty: numOrNull(it.qty),
      kw: numOrNull(it.kw),
      kwh: numOrNull(it.kwh)
    });
  }

  var docs = [];
  var ds = Array.isArray(o.documents) ? o.documents : [];
  for (var j = 0; j < ds.length && j < 50; j++) {
    var d = ds[j] || {};
    /* Only documents the tenant marked customer-facing. An internal FAT
       report or a supplier invoice attached to the same order is not the
       customer's to read because it shares a parent. */
    if (d.audience !== 'customer') continue;
    docs.push({ kind: clip(d.kind, 60), name: clip(d.name, 160),
                url: clip(d.url, 600), at: clip(d.at, 40) });
  }

  var out = {
    /* orderNo is the server-generated customer-facing reference —
       <ORGSLUG>-<YYYYMMDD>-<doc-id tail>. The tail is deliberately not a
       sequence, so it does not leak how many orders the tenant has taken.
       The raw document id is NOT echoed: it is a handle into a collection
       the customer has no read path to. */
    orderNo: clip(o.orderNo, 120),
    /* The brand they think they bought from — the white-label seller's own
       name, never orgId, which is an internal partition key. */
    soldBy: clip(o.orgName, 160),
    placedAt: when(o.createdAt),
    milestone: ms,
    /* The internal status is NOT echoed. 'quoted' and 'accepted' are
       commercial states and 'in_fulfilment' tells a customer nothing. */
    items: items,
    documents: docs,
    /* The delivery address, from the customer's own submission. Address
       subfields only — customer.notes is excluded, see the header. */
    site: (function () {
      var a = (o.customer && o.customer.address) || o.site || null;
      if (!a) return null;
      return { line1: clip(a.line1, 200), city: clip(a.city, 100),
               state: clip(a.state, 40), zip: clip(a.zip, 20) };
    })(),
    /* Their own contact details, so they can see what we will deliver
       against and tell the tenant it is wrong. Name, company, email, phone —
       and deliberately NOT notes. */
    contact: o.customer ? {
      name: clip(o.customer.name, 120), company: clip(o.customer.company, 160),
      email: clip(o.customer.email, 160), phone: clip(o.customer.phone, 40)
    } : null,
    system: o.system ? {
      kw: numOrNull(o.system.kw), kwh: numOrNull(o.system.kwh),
      durationH: numOrNull(o.system.durationH)
    } : null,
    promisedShipAt: when(o.promisedShipAt),
    cancelRequested: !!o.cancelRequested
  };

  /* The tenant's own price to their own customer, only once published. */
  if (op.showPrice && o.tenantPricing && o.tenantPricing.publishedToCustomer === true) {
    out.price = {
      total: numOrNull(o.tenantPricing.total),
      currency: clip(o.tenantPricing.currency || 'USD', 8)
    };
  }
  if (o.logic && o.logic.commercial && o.tenantPricing && o.tenantPricing.publishedToCustomer === true) {
    var policy = require('./logic-policy'), commercial = o.logic.commercial;
    out.checkout = { currency: 'USD', base: commercial.baseCents / 100, processingFee: commercial.feeCents / 100,
      total: commercial.totalCents / 100, depositPercent: commercial.terms.depositPct,
      invoices: Object.keys(o.logic.invoices || {}).map(function (stage) {
        var invoice = o.logic.invoices[stage];
        return { stage: stage, amount: invoice.amountCents / 100, recorded: (invoice.paidCents || 0) / 100,
          status: invoice.status, payUrl: o.cancelRequested || o.logic.paymentException ? null : policy.paymentLink(invoice.payUrl), dueDays: commercial.terms.dueDays };
      }) };
  }
  if (o.shipment) out.shipment = { carrier: clip(o.shipment.carrier, 80), tracking: clip(o.shipment.tracking, 120), shippedAt: when(o.shipment.shippedAt) };
  return out;
}

module.exports = {
  LADDER: LADDER,
  when: when,
  CANCELLED: CANCELLED,
  BY_STATUS: BY_STATUS,
  BY_STATION: BY_STATION,
  ladderIndex: ladderIndex,
  stationMilestone: stationMilestone,
  milestoneOf: milestoneOf,
  publicOrder: publicOrder
};
