/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var A = require('./admin'), P = require('./logic-policy');
function text(v, max, required, multiline) {
  if (typeof v !== 'string' || v.length > max || (multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/ : /[\u0000-\u001f\u007f]/).test(v)) throw A.httpError(400, 'Invalid text field');
  v = v.trim();
  if (required && !v) throw A.httpError(400, 'Required text is missing');
  return v;
}
function address(v) {
  v = v || {};
  return { name: text(v.name, 120, true), line1: text(v.line1, 200, true), city: text(v.city, 100, true),
    state: text(v.state, 80, true), zip: text(v.zip, 30, true), country: text(v.country || 'US', 2, true).toUpperCase() };
}
function po(body, products) {
  if (!body || typeof body !== 'object') throw A.httpError(400, 'Order details required');
  var poNumber = text(body.poNumber, 80, true);
  if (!Array.isArray(body.items) || !body.items.length || body.items.length > 50) throw A.httpError(400, 'Provide 1–50 order lines');
  var quantities = P.quantities(body.items), items = Object.keys(quantities).sort().map(function (sku) {
    var p = products.filter(function (r) { return r.sku === sku && r.active !== false && !r.placeholder && r.sku !== 'GENERIC-BESS'; })[0];
    if (!p) throw A.httpError(400, 'Select a currently published product or service');
    return { sku: sku, name: String(p.name || sku), kind: p.kind === 'service' ? 'service' : 'product', qty: quantities[sku] };
  });
  if (!Array.isArray(body.destinations) || !body.destinations.length || body.destinations.length > 50) throw A.httpError(400, 'Provide 1–50 destinations');
  var allocated = Object.create(null), seen = Object.create(null);
  var destinations = body.destinations.map(function (d) {
    if (!d || typeof d !== 'object') throw A.httpError(400, 'Invalid destination');
    var id = P.id(d.id);
    if (seen[id]) throw A.httpError(400, 'Destination identifiers must be unique');
    seen[id] = true;
    if (!Array.isArray(d.items) || !d.items.length || d.items.length > 50) throw A.httpError(400, 'Destination items required');
    var q = P.quantities(d.items);
    Object.keys(q).forEach(function (sku) { if (!quantities[sku]) throw A.httpError(400, 'Destination SKU is not ordered'); allocated[sku] = (allocated[sku] || 0) + q[sku]; });
    var requestedDate = text(d.requestedDate || '', 10, false);
    if (requestedDate && (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate) || !isFinite(Date.parse(requestedDate)) || new Date(requestedDate).toISOString().slice(0,10) !== requestedDate)) throw A.httpError(400, 'Invalid requested date');
    return { id: id, address: address(d.address), requestedDate: requestedDate || null,
      items: Object.keys(q).sort().map(function (sku) { return { sku: sku, qty: q[sku] }; }) };
  }).sort(function (a,b) { return a.id.localeCompare(b.id); });
  if (Object.keys(quantities).some(function (sku) { return allocated[sku] !== quantities[sku]; })) throw A.httpError(400, 'Destination quantities must exactly match the order by SKU');
  return { poNumber: poNumber, items: items, destinations: destinations, notes: text(body.notes || '', 2000, false, true) };
}
function serials(value) {
  if (!Array.isArray(value) || !value.length || value.length > 100) throw A.httpError(400, 'Select 1–100 serials per load');
  var list = value.map(function (v) { return text(v, 100, true); });
  if (list.some(function (s) { return !/^[A-Za-z0-9._-]+$/.test(s); }) || new Set(list).size !== list.length) throw A.httpError(400, 'Serials must be unique and valid');
  return list;
}
function evidence(value) { var out = text(value, 1200, true, true); if (out.length < 12) throw A.httpError(400, 'Provide a meaningful evidence reference or inspection description'); return out; }
function transition(leg, action, body, by, now) {
  var next = JSON.parse(JSON.stringify(leg)), ev = { action: action, at: now, by: by, evidence: evidence(body.evidence), source: 'manual' };
  if (action === 'pickup') {
    if (leg.status !== 'planned') throw A.httpError(409, 'Pickup requires a planned load');
    next.status = 'in_transit'; next.pickedUpAt = now;
  } else if (action === 'location') {
    if (leg.status !== 'in_transit') throw A.httpError(409, 'Location updates require a load in transit');
  } else if (action === 'delivered') {
    if (leg.status !== 'in_transit') throw A.httpError(409, 'Delivery requires a recorded pickup');
    next.status = 'delivered'; next.deliveredAt = now;
  } else if (action === 'inspect') {
    if (leg.status !== 'delivered') throw A.httpError(409, 'Inspection requires a recorded delivery');
    if (!Array.isArray(body.receipts) || body.receipts.length !== leg.serials.length) throw A.httpError(400, 'Record one disposition for every serial');
    var seen = Object.create(null);
    next.receipts = body.receipts.map(function (r) {
      if (!r || typeof r !== 'object') throw A.httpError(400, 'Invalid receiving disposition');
      if (leg.serials.indexOf(r.serial) < 0 || seen[r.serial] || ['accepted', 'damaged', 'missing'].indexOf(r.condition) < 0) throw A.httpError(400, 'Invalid or duplicate receiving disposition');
      seen[r.serial] = true;
      return { serial: r.serial, condition: r.condition };
    });
    next.status = next.receipts.every(function (r) { return r.condition === 'accepted'; }) ? 'accepted' : 'exception';
    next.inspectedAt = now;
  } else throw A.httpError(400, 'Unsupported lifecycle action');
  if (['pickup','location','delivered'].indexOf(action) >= 0) {
    ev.location = text(body.location, 200, true);
    next.lastConfirmedLocation = { label: ev.location, at: now, source: 'manual' };
  }
  next.lastEvent = ev;
  return { leg: next, event: ev };
}
/* ONE way a load is planned on the ledger: the 'plan' action of
   api/logic-logistics.js calls it once, the freight plan's 'freight-accept'
   once per stop of the accepted quote (inside one transaction, with the
   legs planned so far). Pure: the caller reads the units (aligned with
   `serials`; null = not registered) and applies unitPatches. Every check,
   its order and its message are the ones the plan action always made; the
   serial is now named. `extra` ({ siteId, siteName, freight{} }) is copied
   onto the leg additively — the customer projections (buyerOrder here,
   portal.publicOrder) build their legs key by key and never carry it. */
function planLeg(o) {
  var d = o.delivery || {}, legs = o.legs || [], legId = P.id(o.legId), now = o.now;
  if (!Array.isArray(d.destinations)) throw A.httpError(409, 'This order needs a reviewed destination plan; legacy orders are not changed automatically');
  if (legs.some(function (x) { return x.id === legId; })) throw A.httpError(409, 'Shipment leg identifier already exists');
  if (legs.length >= 100) throw A.httpError(409, 'Order has reached its shipment-leg limit; contact support');
  var dest = d.destinations.filter(function (x) { return x.id === o.destinationId; })[0];
  if (!dest) throw A.httpError(400, 'Choose an order destination');
  var list = serials(o.serials), units = o.units || [];
  list.forEach(function (sn, i) { if (!units[i]) throw A.httpError(400, 'Serial ' + sn + ' is not registered'); });
  var counts = Object.create(null);
  // Prior allocation is distinct by serial, including already delivered loads.
  var assigned = Object.create(null);
  legs.forEach(function (x) { (x.serials || []).forEach(function (sn) { assigned[sn] = true; }); });
  list.forEach(function (sn, i) {
    var u = units[i];
    if (u.orgId !== o.org || u.orderId !== o.orderId || !u.shipUnit || assigned[u.serial] || u.logisticsLegId) throw A.httpError(409, 'Serial ' + sn + ' must be an unassigned shipping unit on this order');
    counts[u.sku] = (counts[u.sku] || 0) + 1;
  });
  var allowance = P.quantities(dest.items), prior = Object.create(null);
  legs.filter(function (x) { return x.destinationId === dest.id; }).forEach(function (x) { (x.items || []).forEach(function (i) { prior[i.sku] = (prior[i.sku] || 0) + i.qty; }); });
  Object.keys(counts).forEach(function (sku) { if (!allowance[sku] || counts[sku] + (prior[sku] || 0) > allowance[sku]) throw A.httpError(409, 'Shipment exceeds destination allocation'); });
  var leg = { id: legId, destinationId: dest.id, serials: list, items: Object.keys(counts).map(function (sku) { return { sku: sku, qty: counts[sku] }; }),
    carrier: text(o.carrier, 120, true), tracking: text(o.tracking, 160, true), status: 'planned', createdAt: now };
  var ex = o.extra || {};
  ['siteId', 'siteName', 'freight'].forEach(function (k) { if (ex[k] !== undefined && ex[k] !== null) leg[k] = ex[k]; });
  var ev = { action: 'plan', at: now, by: o.by, evidence: evidence(o.evidence), source: o.source || 'manual' };
  return { leg: leg, event: ev, unitPatches: list.map(function (sn) { return { serial: sn, patch: { logisticsLegId: legId, logisticsOrderId: o.orderId } }; }) };
}
function buyerOrder(o, id) {
  return { id: id, orderNo: o.orderNo, status: o.status, poNumber: (o.purchaseOrder || {}).number || null,
    items: (o.items || []).map(function (i) { return { sku: i.sku, name: i.name || i.sku, qty: i.qty }; }),
    destinations: (o.delivery || {}).destinations || [], revision: (o.delivery || {}).revision || 0,
    legs: ((o.delivery || {}).legs || []).map(function (l) { return { id:l.id, destinationId:l.destinationId, carrier:l.carrier,
      tracking:l.tracking, serials:l.serials, status:l.status, pickedUpAt:l.pickedUpAt||null, deliveredAt:l.deliveredAt||null,
      lastConfirmedLocation:l.lastConfirmedLocation||null, receipts:l.receipts||[] }; }) };
}
module.exports = { text:text, address:address, po:po, serials:serials, evidence:evidence, transition:transition, planLeg:planLeg, buyerOrder:buyerOrder };
