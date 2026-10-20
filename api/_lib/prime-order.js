/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   ═══════════════════════════════════════════════════════════════════════════
   api/_lib/prime-order.js — an APPROVED customer quote becomes an Omega
   Logic order in the SELLER's workspace: the workspace the rep is in, the
   one that sold it (Tommy, 2026-10-17: "if it gets approved then it goes to
   omega logic to be fulfilled", and Omega Logic is "the logic function of
   the tenant I'm in").

     whose        the quote's orgId (customer_quotes/{id}.orgId): the order is
                  orders/{id}.orgId = the seller, the field every Omega Logic
                  reader keys on, so it opens in that workspace's office
     must hold    an Omega Logic office (logic-access.context + subscribed);
                  otherwise a plain sentence the quote keeps, and POST handoff
                  retries once the workspace is on Omega Logic
     the line     order-lifecycle.po, the one order-line validator, against
                  the seller's published products (portal.orderables, the one
                  buyer test) — PLUS, when the quoted battery's SKU is not
                  among them, the battery itself as a REFERENCE product line:
                  resolved on the server from the seller's own battery list
                  (omega-prime-project.js units(), the list the quote was
                  priced from), never from a request body, and marked
                  { reference: true, mfr } on the order's line
     bought in    procure { mfr, mfrOrgId|null, sku, model }: the office knows
                  the unit is bought from its maker, not built on its floor
     id           prime_<P.key(seller:project:<projectId>:<quoteId>:<rev>)>,
                  so an approval retried, or a hand-off retried, makes ONE
                  order; the same id with different lines is refused
     status       'new', source 'prime': it waits on the office's price
                  (office-stage 'quote'). NOTHING here prices, accepts or
                  charges; logic.* is the pricer's to write (logic-workflow).

   ── THE PRICE ON THE ORDER ──────────────────────────────────────────────
   The seller now OWNS the order, so its own approved price may ride on it:
   approvedQuote { quoteId, quoteNo, rev, totalCents } prefills its office's
   price box. Every person who reads the order (tenantReader: the seller's
   members) can already read that figure on the quote itself; a buyer reads
   the order only through portal.publicOrder, an allowlist that never names
   it. The COST and the MARGIN behind the price stay on the quote.

   ── WHO THE BUYER IS ────────────────────────────────────────────────────
   The end client the rep typed on the quote (never what the approver typed),
   stamped onto an admitted customer account in the transaction
   (buyer-accounts.stampableAccount), exactly as api/orders.js create does.

   ── NOT DONE HERE ───────────────────────────────────────────────────────
   logic-workflow.release() reserves finished units from the seller's plant
   and turns what is missing into a works order. A bought-in reference line
   has no plant units of the seller's, so a release asks the plant for one
   (awaiting_serials) until the delivered unit's serial is registered. That
   is release()'s rule and is left alone; procure{} says why.

   ── ONE LIVE ORDER A SITE ───────────────────────────────────────────────
   A change after an approval is a NEW quote on the same project (an
   approved quote is final), and its approval would be a second order for
   the one site. So while the project's order (projects/{id}.prime.order,
   written below) came from ANOTHER quote and is still live() — not
   cancelled, and not yet shipped — no second order is made: the quote
   keeps the reason, and Send to Omega Logic (POST handoff) makes it once
   the earlier order is cancelled in Omega Logic. The pointer is checked
   against the order itself (same seller, same project, a Prime order), so
   a pointer the browser could have written never names another order.

   A request that cannot be made throws an error with `plain: true` and a
   sentence a rep can act on; the quote keeps it and POST handoff retries.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var A = require('./admin'), L = require('./order-lifecycle'), P = require('./logic-policy'), Pt = require('./portal');
var C = require('./custody'), X = require('./logic-access'), B = require('./buyer-accounts'), Q = require('./customer-quote');

var DAILY_CAP = 50;   /* order hand-offs a seller's workspace may make a day */

function plain(status, message) { var e = A.httpError(status, message); e.plain = true; return e; }
function str(v, n) { return v == null ? '' : String(v).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, n || 200); }
function data(s) { return s && s.exists ? (s.data() || {}) : null; }
function notOnLogic(name) { return plain(409, name + ' is not on Omega Logic yet — add Omega Logic to fulfil approved quotes here, then press Retry.'); }

function orderId(sellerOrg, quote) { return 'prime_' + P.key(sellerOrg + ':project:' + quote.projectId + ':' + quote.id + ':' + quote.rev); }

/* An order a second one for the same site would DUPLICATE. Not live:
   cancelled (its status, or the cancellation the office requested in Omega
   Logic, which holds production and is never reversed), or closed — it has
   shipped or completed (its status, or a delivery leg past 'planned' when
   Logistics moves it): what left the plant is not changed by a new
   proposal, so a new approval then is a new purchase. */
function live(order) {
  if (!order || typeof order !== 'object') return false;
  var s = str(order.status, 40), legs = order.delivery && Array.isArray(order.delivery.legs) ? order.delivery.legs : [];
  if (s === 'cancelled' || order.cancelRequested === true) return false;
  if (s === 'shipped' || s === 'complete') return false;
  if (legs.some(function (g) { return g && g.status && g.status !== 'planned'; })) return false;
  return true;
}
/* the site's earlier Prime order that would block this quote's, or null:
   the project's pointer, checked against the order itself */
function earlierOrder(pointer, earlier, q, id) {
  if (!pointer || !earlier || pointer === id) return null;
  if (earlier.source !== 'prime' || !earlier.sourceQuoteId || earlier.sourceQuoteId === q.id) return null;
  if (earlier.sourceOrgId !== q.orgId || String(earlier.sourceProjectId) !== String(q.projectId)) return null;
  return live(earlier) ? earlier : null;
}
function siteHasOrder(earlier, pointer) {
  var no = str(earlier.orderNo, 40) || str(pointer && pointer.orderNo, 40) || str(pointer && pointer.id, 128);
  var qn = str(earlier.prime && earlier.prime.quoteNo, 60) || str(earlier.purchaseOrder && earlier.purchaseOrder.number, 60);
  return plain(409, 'This site already has order ' + no + ' from proposal ' + (qn || 'an earlier proposal') + '. Cancel or close that order in Omega Logic, then press Send to Omega Logic again.');
}
function orderNo(id, now) { return 'PRM-' + new Date(now).toISOString().slice(0, 10).replace(/-/g, '') + '-' + id.slice(-6).toUpperCase(); }
/* Where the seller opens the order: its own Omega Logic, on the order
   (customer-quote.js logicUrl, the one address the views read too). */
var logicUrl = Q.logicUrl;

/* Where it is delivered: the site (one line, split by custody's own address
   reader), else the customer's typed address; the end client's name on it. */
function destination(quote) {
  var site = quote.site || {}, cust = quote.customer || {};
  var a = C.splitAddress(str(site.address, 400));
  if (!(a.line1 && a.city && a.state && a.zip)) {
    var ca = cust.address || {};
    if (ca.line1 && ca.city && ca.state && ca.zip) a = { line1: str(ca.line1, 200), city: str(ca.city, 100), state: C.stateCode(ca.state) || str(ca.state, 80), zip: str(ca.zip, 30) };
  }
  return { name: str(cust.company || cust.name || 'Project site', 120), line1: a.line1 || '', city: a.city || '', state: a.state || '', zip: a.zip || '', country: 'US' };
}

/* The quoted battery, from the seller's OWN list on the server (the list
   the quote was priced from): by its key, else the same SKU (the list keeps
   one entry per SKU). The quote record only names which one. */
function unitFrom(list, quoted) {
  quoted = quoted || {};
  var key = str(quoted.key, 120), sku = str(quoted.sku, 100);
  var byKey = key ? list.filter(function (u) { return u && u.key === key; })[0] : null;
  return byKey || (sku ? list.filter(function (u) { return u && u.sku === sku; })[0] : null) || null;
}

/* The products the order line is checked against: the seller's published,
   orderable products, and — when the battery's SKU is not one of them — the
   battery as a reference line. A SKU the seller DOES list but has switched
   off (inactive, a placeholder, a component) is refused, never re-added. */
function catalogFor(unit, storefront, sellerName) {
  var all = Array.isArray(storefront) ? storefront : [], sku = str(unit.sku, 100);
  var products = Pt.orderables(all), mine = products.some(function (p) { return p.sku === sku; });
  if (mine) return { products: products, reference: false };
  if (all.some(function (p) { return p && p.sku === sku; })) throw plain(409, sellerName + '’s Omega Logic catalog lists ' + sku + ' but not as an orderable product (it is switched off, a placeholder or a component). Publish it, or remove it so the quoted battery is ordered as bought in, then press Retry.');
  var mfr = str(unit.mfr, 80), model = str(unit.model, 160);
  return { reference: true, products: products.concat([{ sku: sku, name: str([mfr, model].filter(Boolean).join(' ') || unit.name || sku, 200), kind: 'product', active: true, reference: true, mfr: mfr }]) };
}

/* The order lines, through the one validator; its refusals in a rep's words. */
function lines(quote, unit, cat, sellerName) {
  var sku = str(unit.sku, 100);
  if (!sku) throw plain(409, 'This battery has no catalog SKU, so it cannot be ordered through Omega Logic. Choose a battery from your list in Omega Prime, or order it outside the platform.');
  var dest = destination(quote);
  if (!(dest.line1 && dest.city && dest.state && dest.zip)) throw plain(409, 'The site address could not be read as street, city, state and ZIP, so the delivery could not be planned. Add the street address to the customer block on the quote, save it, and press Retry.');
  var input;
  try {
    input = L.po({ poNumber: quote.quoteNo, items: [{ sku: sku, qty: 1 }],
      destinations: [{ id: 'd1', address: dest, requestedDate: '', items: [{ sku: sku, qty: 1 }] }],
      notes: 'Omega Prime proposal ' + quote.quoteNo + ' rev ' + quote.rev + ', approved by the customer.' }, cat.products);
  } catch (e) {
    if (/published product/.test(e.message || '')) throw plain(409, sellerName + '’s Omega Logic catalog cannot take ' + sku + ' as an order line yet. Publish it, then press Retry.');
    throw plain(409, 'The order was refused by Omega Logic’s order check (' + str(e.message, 160) + '). Correct the quote and press Retry.');
  }
  if (cat.reference) input.items = input.items.map(function (it) { return it.sku === sku ? Object.assign({}, it, { reference: true, mfr: str(unit.mfr, 80) }) : it; });
  return input;
}

/* PURE: the order document, its first event and its audit row.
   o: { quote, id, orderNo, now, by, org, orgName, input, unit, reference, accountId, requestedTerms } */
function build(o) {
  var q = o.quote, now = o.now, at = new Date(now).toISOString(), id = o.id, u = o.unit || q.unit || {}, seller = q.seller || {}, rep = seller.rep || {};
  var cust = q.customer || {}, input = o.input, dest = input.destinations[0].address, site = q.site || {}, by = str(o.by, 254) || 'customer';
  var customer = { name: str(cust.name || cust.company, 120), email: str(cust.email || rep.email, 254).toLowerCase(), company: str(cust.company, 160), phone: str(cust.phone, 40),
    address: { line1: dest.line1, city: dest.city, state: dest.state, zip: dest.zip }, notes: '' };
  var mfr = str(u.mfr, 80), vendor = A.safeOrg(u.vendorOrgId);
  /* bought in: anything the seller does not make itself — a reference
     battery, or one another workspace makes. The seller's own product
     (its list's 'tenant' or 'own-shipped' unit) is not, even unpublished. */
  var own = u.source === 'tenant' || u.source === 'own-shipped' || (!!vendor && vendor === o.org);
  var procure = !own && (o.reference || u.source === 'reference' || (!!vendor && vendor !== o.org))
    ? { mfr: mfr, mfrOrgId: vendor && vendor !== o.org ? vendor : null, sku: str(u.sku, 100), model: str(u.model, 200) } : null;
  var what = 'Order from Omega Prime proposal ' + q.quoteNo + ' rev ' + q.rev + ', approved by the customer' + (cust.company ? ' (' + str(cust.company, 120) + ')' : '')
    + '; awaiting the office’s price.' + (procure ? ' The battery is bought in from ' + (mfr || 'its manufacturer') + '.' : '') + ' No acceptance or charge.';
  var doc = {
    orgId: o.org, orgName: str(o.orgName, 120), orderNo: o.orderNo, status: 'new', source: 'prime', interest: 'product', fulfilledBy: 'clearsky',
    items: input.items, system: { kw: u.kw || null, kwh: u.kwh || null, durationH: u.hours || null, basis: 'designed-in-omega-prime' },
    customer: customer, pricing: null,
    purchaseOrder: { number: q.quoteNo, submittedBy: by, submittedAt: at, proposal: q.id },
    delivery: { version: 1, revision: 0, destinations: input.destinations, legs: [] },
    originatorOrgId: q.orgId, originatorName: str(seller.name || q.orgId, 120), originatorBy: str(rep.email, 254).toLowerCase(),
    sourceOrgId: q.orgId, sourceProjectId: q.projectId, sourceQuoteId: q.id, sourceQuoteRevision: q.rev, rfqId: null,
    procure: procure,
    prime: { projectId: q.projectId, quoteId: q.id, quoteNo: q.quoteNo, rev: q.rev,
      site: { address: str(site.address, 400), lat: typeof site.lat === 'number' ? site.lat : null, lng: typeof site.lng === 'number' ? site.lng : null, utility: str(site.utility, 160), circuit: str(site.circuit, 160) },
      unit: { key: str(u.key, 120), sku: str(u.sku, 100), mfr: mfr, model: str(u.model, 200), kw: u.kw || null, kwh: u.kwh || null },
      approvedAt: q.acceptance && q.acceptance.approvedAt ? new Date(q.acceptance.approvedAt).toISOString() : at },
    history: [{ at: at, by: by, what: what }]
  };
  if (o.requestedTerms) doc.requestedTerms = o.requestedTerms;
  if (o.accountId) doc.customerId = o.accountId;
  if (q.pricing && q.pricing.sellCents) doc.approvedQuote = { quoteId: q.id, quoteNo: q.quoteNo, rev: q.rev, totalCents: q.pricing.sellCents, note: 'The price your customer approved on proposal ' + q.quoteNo + '.' };
  return { doc: doc, event: { at: at, by: by, what: what },
    audit: { action: 'prime-order', orgId: o.org, orderId: id, sourceOrgId: q.orgId, projectId: q.projectId, quoteId: q.id, rev: q.rev, by: by, at: at, reference: !!o.reference } };
}

/* The one door: { quote, now, by } →
   { ok, orderId, orderNo, org, workspace, manufacturer, reference, procure, logicUrl, duplicate }.
   Throws a `plain` error (409/429) the quote records; anything else is a 500. */
async function create(db, o) {
  var q = o.quote, now = o.now || Date.now(), FV = A.FieldValue();
  if (!q || q.status !== 'approved') throw plain(409, 'Only an approved quote becomes an order.');
  var org = A.safeOrg(q.orgId), seller = q.seller || {}, word = str(seller.name, 120) || str(q.orgId, 120) || 'This workspace';
  if (!org) throw notOnLogic(word);
  var ctx;
  try { ctx = await X.context(org); }
  catch (e) { if (e && (e.status === 404 || e.status === 400)) throw notOnLogic(word); throw e; }
  var name = str(ctx.org.name, 120) || word;
  if (!X.subscribed(ctx, now)) throw notOnLogic(name);
  var sf = data(await db.collection('omega_orgs').doc(org).collection('storefront').doc('config').get()) || {};
  var unit = unitFrom(Q.unitsFor(org, ctx.org, sf), q.unit);
  if (!unit) throw plain(409, 'The battery on this quote (' + (str(q.unit && (q.unit.key || q.unit.sku), 120) || 'none') + ') is not in ' + name + '’s battery list any more, so its order line could not be checked. Choose it again in Omega Prime, save a new revision of the quote, and send it.');
  var cat = catalogFor(unit, sf.products, name);
  var input = lines(q, unit, cat, name);
  var id = orderId(org, q), no = orderNo(id, now), url = logicUrl(org, id);
  var terms = null; try { terms = P.terms((ctx.config || {}).terms); } catch (e) { terms = null; }
  var ref = db.collection('orders').doc(id), pref = db.collection('projects').doc(String(q.projectId));
  var day = new Date(now).toISOString().slice(0, 10), cref = db.collection('omega_orgs').doc(org).collection('quote_counters').doc('order-' + day);
  return db.runTransaction(async function (tx) {
    var prior = data(await tx.get(ref));
    if (prior) {
      var same = JSON.stringify(prior.items || []) === JSON.stringify(input.items);
      if (!same) throw plain(409, 'An order for this revision already exists with different lines; save a new revision of the quote for a new order.');
      return { ok: true, duplicate: true, orderId: id, orderNo: prior.orderNo, org: org, workspace: name, manufacturer: (prior.procure && prior.procure.mfr) || str(unit.mfr, 80) || null,
        reference: (prior.items || []).some(function (it) { return it && it.reference === true; }), procure: prior.procure || null, logicUrl: url };
    }
    var project = data(await tx.get(pref)), counter = data(await tx.get(cref)) || {};
    /* one live order a site: the project's order, if it came from another
       quote and is still live, is cancelled first (read before any write) */
    var was = project && project.prime && project.prime.order, wid = was && typeof was.id === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(was.id) ? was.id : '';
    if (wid && wid !== id) {
      var blocking = earlierOrder(wid, data(await tx.get(db.collection('orders').doc(wid))), q, id);
      if (blocking) throw siteHasOrder(blocking, was);
    }
    var n = Number(counter.count) || 0;
    if (n >= DAILY_CAP) throw plain(429, name + ' has handed ' + n + ' approved quotes to Omega Logic today; press Retry tomorrow.');
    var accountId = q.customer && q.customer.email ? await B.stampableAccount(db, org, q.customer.email, tx) : null;
    var made = build({ quote: q, id: id, orderNo: no, now: now, by: o.by, org: org, orgName: name, input: input, unit: unit, reference: cat.reference, accountId: accountId, requestedTerms: terms });
    made.doc.createdAt = FV.serverTimestamp(); made.doc.updatedAt = FV.serverTimestamp();
    tx.create(ref, made.doc);
    tx.create(ref.collection('events').doc(), made.event);
    tx.create(db.collection('omega_audit').doc(), made.audit);
    tx.set(cref, { count: n + 1, day: day, updatedAt: made.event.at });
    if (accountId) tx.update(db.collection('omega_orgs').doc(org).collection('customers').doc(accountId), { hasOrders: true });
    if (project) tx.update(pref, { 'prime.order': { org: org, id: id, orderNo: no, at: made.event.at } });
    tx.create(db.collection('omega_orgs').doc(org).collection('notifications').doc(), { kind: 'order', read: false, orderId: id, createdAt: FV.serverTimestamp(),
      text: 'New order ' + no + ' from approved proposal ' + q.quoteNo + (q.customer && q.customer.company ? ' (' + str(q.customer.company, 120) + ')' : '') + ': price it in Omega Logic.' });
    return { ok: true, orderId: id, orderNo: no, org: org, workspace: name, manufacturer: str(unit.mfr, 80) || null, reference: cat.reference, procure: made.doc.procure, logicUrl: url };
  });
}

module.exports = { DAILY_CAP: DAILY_CAP, orderId: orderId, orderNo: orderNo, logicUrl: logicUrl, destination: destination, unitFrom: unitFrom,
  catalogFor: catalogFor, lines: lines, build: build, create: create, plain: plain, live: live, earlierOrder: earlierOrder };
