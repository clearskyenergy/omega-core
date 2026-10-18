/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   The purchase order a work order was released from, read when the card
   opens. A later correction of the project, the ship-to or the lines is
   what the floor sees. Prices, email and notes never cross. */
'use strict';
var BAD = { __proto__: 1, constructor: 1, prototype: 1 };

function text(v, n) {
  if (v == null) return '';
  return String(v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n || 200);
}
function skuOf(v) {
  var s = text(v, 100);
  return !s || BAD[s] ? '' : s;
}
function addressOf(a) {
  if (!a || typeof a !== 'object') return null;
  var name = text(a.name, 160), line1 = text(a.line1 || a.street, 200), city = text(a.city, 80);
  var state = text(a.state, 40), zip = text(a.zip || a.postal, 20);
  if (!name && !line1 && !city) return null;
  return { name: name || null, line1: line1 || null, city: city || null, state: state || null, zip: zip || null };
}
/* A name a person reads. An email address is never one. */
function plainName(v) {
  var s = text(v, 160);
  if (!s || BAD[s] || s.indexOf('@') >= 0) return '';
  return s;
}
function linesOf(items) {
  var out = [];
  (Array.isArray(items) ? items : []).forEach(function (it) {
    if (!it || typeof it !== 'object') return;
    var sku = skuOf(it.sku), qty = Math.floor(Number(it.qty));
    if (!sku || !isFinite(qty) || qty <= 0) return;
    out.push({ sku: sku, name: text(it.name, 200) || null, qty: qty });
  });
  return out;
}
/* Null when there is no order. Otherwise the shape is always present, and
   a missing fact is null or an empty list — never invented. */
function sourceOf(order) {
  if (!order || typeof order !== 'object') return null;
  var po = order.purchaseOrder && order.purchaseOrder.number;
  var intake = order.poIntake && order.poIntake.number;
  var dest = order.delivery && Array.isArray(order.delivery.destinations) ? order.delivery.destinations : [];
  var sites = [];
  dest.forEach(function (d) {
    if (!d || typeof d !== 'object') return;
    var address = addressOf(d.address), lines = linesOf(d.items);
    if (!address && !lines.length) return;
    sites.push({ id: text(d.id, 80) || null, address: address, lines: lines });
  });
  var cust = order.customer && typeof order.customer === 'object' ? order.customer : null;
  var poDoc = order.purchaseOrder && typeof order.purchaseOrder === 'object' ? order.purchaseOrder : null;
  return {
    poNumber: text(po || intake || order.poNumber, 80) || null,
    projectId: text(order.sourceProjectId || order.projectId, 120) || null,
    projectName: plainName(order.projectName) || plainName(order.sourceProjectName) || plainName(poDoc && poDoc.projectName) || plainName(order.design && order.design.projectName) || null,
    customerName: (cust && (plainName(cust.company) || plainName(cust.name))) || null,
    address: (sites[0] && sites[0].address) || addressOf(cust && cust.address),
    items: linesOf(order.items),
    sites: sites
  };
}

module.exports = { sourceOf: sourceOf, addressOf: addressOf, linesOf: linesOf };
