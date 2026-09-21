/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/plant-release.js — validate an order's as-built release package
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   A works-order release is where a commercial order becomes physical units.
   This pure module validates that package before api/plant-release.js writes
   anything: one serial is one physical thing, a component belongs to one
   larger assembly, the product roots do not exceed what was ordered, and a
   component tree cannot contain a cycle. It knows no Firestore and makes no
   commercial decision, so the guardrails are testable without a database.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

var P = require('./plant');

var TYPES = { cell: 1, module: 2, rack: 3, cabinet: 4, accessory: 1 };

function fail(message) { var e = new Error(message); e.status = 400; throw e; }
function clean(value, max) {
  var out = String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  if (out.length > (max || 160)) fail('A release field is too long.');
  return out;
}
function required(value, name, max) {
  var out = clean(value, max);
  if (!out) fail((name || 'A release field') + ' is required.');
  return out;
}
function typeOf(value) {
  var type = required(value, 'unitType', 20).toLowerCase();
  if (!TYPES[type]) fail('unitType must be cell, module, rack, cabinet or accessory.');
  return type;
}
function number(value, name) {
  if (value == null || value === '') return null;
  var n = Number(value);
  if (!isFinite(n) || n < 0 || n > 10000000) fail((name || 'number') + ' is out of range.');
  return n;
}

/* The trace fields are fixed. An arbitrary metadata map feels flexible until
   a scanner sends a 900 KB diagnostic blob and blocks every write on the
   traveler. Raw rig diagnostics belong in the immutable scan event; this is
   the stable identity carried by a cell/module/cabinet for its lifetime. */
function traceOf(raw) {
  raw = raw || {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('trace must be an object.');
  return {
    lot:             clean(raw.lot, 100) || null,
    supplier:         clean(raw.supplier, 160) || null,
    manufacturedAt:   clean(raw.manufacturedAt, 40) || null,
    chemistry:        clean(raw.chemistry, 80) || null,
    capacityKwh:      number(raw.capacityKwh, 'trace.capacityKwh'),
    nominalVoltage:   number(raw.nominalVoltage, 'trace.nominalVoltage'),
    firmware:         clean(raw.firmware, 100) || null,
    bmsVersion:       clean(raw.bmsVersion, 100) || null
  };
}

function orderedQuantities(order) {
  var out = {}, items = (order && Array.isArray(order.items)) ? order.items : [];
  items.forEach(function (item) {
    var sku = clean(item && item.sku, 100);
    var qty = Math.floor(Number(item && item.qty) || 0);
    if (sku && qty > 0) out[sku] = (out[sku] || 0) + qty;
  });
  return out;
}

function noCycle(units) {
  var bySerial = {}, state = {};
  units.forEach(function (u) { bySerial[u.serial] = u; });
  function visit(serial) {
    if (state[serial] === 'visiting') fail('A component tree cannot contain a cycle.');
    if (state[serial] === 'done') return;
    state[serial] = 'visiting';
    var u = bySerial[serial];
    if (u.parentSerial) visit(u.parentSerial);
    state[serial] = 'done';
  }
  units.forEach(function (u) { visit(u.serial); });
}

function normalizeUnits(raw, order) {
  if (!Array.isArray(raw) || !raw.length || raw.length > 400) {
    fail('Release 1 to 400 serialized units at a time.');
  }
  var seen = {}, units = raw.map(function (input) {
    input = input || {};
    var serial = P.serialFrom(input.serial);
    if (!serial) fail('Every unit needs a readable serial.');
    if (seen[serial]) fail('A serial appears more than once in this release.');
    seen[serial] = true;
    var parent = input.parentSerial ? P.serialFrom(input.parentSerial) : '';
    if (input.parentSerial && !parent) fail('A parentSerial is unreadable.');
    if (parent === serial) fail('A serial cannot be its own parent.');
    return {
      serial: serial,
      sku: required(input.sku, 'sku', 100),
      unitType: typeOf(input.unitType),
      parentSerial: parent || null,
      shipUnit: input.shipUnit === true,
      trace: traceOf(input.trace)
    };
  });

  var bySerial = {};
  units.forEach(function (u) { bySerial[u.serial] = u; });
  units.forEach(function (u) {
    if (!u.parentSerial) return;
    var parent = bySerial[u.parentSerial];
    if (!parent) fail('Every parentSerial must be included in the same release.');
    if (TYPES[parent.unitType] <= TYPES[u.unitType]) {
      fail('A parent must be a larger assembly than its component.');
    }
  });
  noCycle(units);

  var allowed = orderedQuantities(order), roots = {};
  units.forEach(function (u) {
    if (!u.shipUnit) return;
    if (u.parentSerial) fail('A shipping unit cannot also be a component.');
    if (!allowed[u.sku]) fail('A shipping unit SKU is not on the order.');
    roots[u.sku] = (roots[u.sku] || 0) + 1;
  });
  Object.keys(roots).forEach(function (sku) {
    if (roots[sku] > allowed[sku]) fail('Release has more ' + sku + ' shipping units than the order.');
  });
  if (!Object.keys(roots).length) fail('At least one unit must be marked shipUnit.');
  return units;
}

function routingOf(raw) {
  var routing = raw || P.DEFAULT_ROUTING;
  if (!Array.isArray(routing) || !routing.length || routing.length > 24) fail('Routing must have 1 to 24 stations.');
  var seen = {};
  return routing.map(function (station) {
    var key = clean(typeof station === 'string' ? station : station && station.key, 32).toLowerCase();
    var label = clean(typeof station === 'string' ? station : station && station.label, 80) || key;
    if (!/^[a-z][a-z0-9_-]{0,31}$/.test(key)) fail('A routing station key is invalid.');
    if (seen[key]) fail('Routing cannot repeat a station.');
    seen[key] = true;
    return { key: key, label: label };
  });
}

module.exports = { normalizeUnits: normalizeUnits, routingOf: routingOf, traceOf: traceOf, orderedQuantities: orderedQuantities };
