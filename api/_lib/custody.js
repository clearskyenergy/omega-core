/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   custody.js — where a serialized unit is after it leaves the plant, who
   holds it, which end site it is bound to, and what coverage that binds.

   ONE status machine, ONE coverage engine, ONE import parser, ONE receiving
   reconciliation — so a unit assigned from a form, a scan, a spreadsheet or
   the customer's own app is judged by the same rules and an invalid move
   is refused with a reason, never applied quietly.

   Built ON the records Omega Logic already keeps, not beside them:
     plant_units/{org__serial}.custody      the unit's custody block
     plant_units/{…}/custody_events/{id}    append-only, never edited
     omega_orgs/{org}/sites/{siteId}        an end location with its
                                             interconnection details
     storefront/config.products[].coverage  templates per SKU; warrantyYears
                                             is the default template
   Pure: no Firestore, no clock except the `now` handed in. */
'use strict';
var A = require('./admin');

/* ── the status machine ────────────────────────────────────────────────
   '' means the unit is still the plant's (building, ready, on the shelf).
   The custodian is implied by the status: carrier while in transit, the
   customer from receipt on, the end site once assigned. */
var STATUSES = ['', 'in_transit', 'delivered', 'received', 'assigned', 'installed', 'commissioned', 'in_service', 'rma_open', 'returned', 'replaced', 'decommissioned'];
var STATES = ['damaged', 'lost', 'quarantined', 'scrapped'];
var LABELS = { '': 'at the plant', in_transit: 'in transit', delivered: 'delivered', received: 'received', assigned: 'assigned to site', installed: 'installed', commissioned: 'commissioned', in_service: 'in service', rma_open: 'RMA open', returned: 'returned', replaced: 'replaced', decommissioned: 'decommissioned' };
/* action → the statuses it may start from, and the status it ends in */
var MOVES = {
  ship:         { from: ['', 'received'],                                     to: 'in_transit' },
  deliver:      { from: ['in_transit'],                                       to: 'delivered' },
  receive:      { from: ['', 'in_transit', 'delivered'],                      to: 'received' },
  assign:       { from: ['delivered', 'received', 'assigned'],               to: 'assigned' },
  install:      { from: ['assigned', 'received'],                             to: 'installed' },
  commission:   { from: ['assigned', 'installed', 'received'],               to: 'commissioned' },
  'in-service': { from: ['commissioned'],                                     to: 'in_service' },
  'rma-open':   { from: ['installed', 'commissioned', 'in_service'],         to: 'rma_open' },
  'rma-return': { from: ['rma_open'],                                         to: 'returned' },
  replace:      { from: ['rma_open'],                                         to: 'replaced' },
  decommission: { from: ['installed', 'commissioned', 'in_service', 'returned'], to: 'decommissioned' }
};
var CUSTODIAN = { '': 'plant', in_transit: 'carrier', delivered: 'customer', received: 'customer', assigned: 'site', installed: 'site', commissioned: 'site', in_service: 'site', rma_open: 'site', returned: 'plant', replaced: 'plant', decommissioned: 'site' };
var SERIAL = /^[A-Za-z0-9][A-Za-z0-9._-]{2,99}$/;
var MAX_ROWS = 2000;

function clean(v, n) { return String(v == null ? '' : v).trim().slice(0, n || 160); }
function fail(s, m) { return A.httpError(s, m); }
function serial(v) { var s = clean(v, 100); if (!SERIAL.test(s)) throw fail(400, 'Serial "' + s + '" is not a valid serial'); return s; }
/* YYYY-MM-DD, or M/D/YYYY as spreadsheets print it; a bare ISO timestamp is cut to its day */
function day(v) {
  var s = clean(v, 40); if (!s) return '';
  var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); if (m) s = m[1] + '-' + m[2] + '-' + m[3];
  else { var us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s); if (us) s = us[3] + '-' + ('0' + us[1]).slice(-2) + '-' + ('0' + us[2]).slice(-2); }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || isNaN(Date.parse(s)) || new Date(s).toISOString().slice(0, 10) !== s) throw fail(400, 'Date "' + clean(v, 40) + '" must be YYYY-MM-DD');
  return s;
}
function custodyOf(unit) { var c = unit && unit.custody && typeof unit.custody === 'object' ? unit.custody : {}; return Object.assign({ status: '', state: null, siteId: null, siteName: null, position: '', coverage: [] }, c); }
function label(status) { return LABELS[status] || status || 'at the plant'; }

/* ── a move: judged, then applied ──────────────────────────────────────
   judge() says whether `action` may happen to this unit now; apply()
   returns the custody patch and the event to append. Both are pure, so the
   office endpoint, the customer endpoint and the importer share them. */
function judge(unit, action, body) {
  var c = custodyOf(unit), move = MOVES[action], b = body || {};
  if (!move) return { ok: false, reason: 'unknown_action', say: 'Unknown custody action "' + action + '"' };
  if (!unit || !unit.shipUnit) return { ok: false, reason: 'not_a_shipping_unit', say: 'Only a shipping unit is tracked past the plant; a component travels with its assembly' };
  if (c.state === 'scrapped') return { ok: false, reason: 'scrapped', say: 'A scrapped unit is not moved again' };
  if (['ship', 'receive'].indexOf(action) >= 0 && !c.status && unit.at !== 'ready') return { ok: false, reason: 'not_ready', say: 'The unit has not reached Ready at the plant' };
  if (move.from.indexOf(c.status) < 0) return { ok: false, reason: 'wrong_status', say: 'Cannot ' + action.replace('-', ' ') + ' a unit that is ' + label(c.status) };
  if (action === 'assign' && !b.siteId) return { ok: false, reason: 'site_required', say: 'Choose the site' };
  if (action === 'assign' && c.status === 'assigned' && c.siteId === b.siteId && (b.position || '') === (c.position || '')) return { ok: true, action: 'duplicate', say: 'Already assigned to that site' };
  if (action === 'replace' && !b.replacementSerial) return { ok: false, reason: 'replacement_required', say: 'Name the replacement serial' };
  if (action === 'replace' && b.replacementSerial === unit.serial) return { ok: false, reason: 'self', say: 'A unit cannot replace itself' };
  return { ok: true, action: action, say: 'OK' };
}
function apply(unit, action, body, by, now, method) {
  var c = custodyOf(unit), b = body || {}, at = clean(b.at, 40) || now, dayAt = day(at), patch = {}, ev = { type: action, from: c.status, to: MOVES[action].to, by: by, at: now, method: method || 'manual', note: clean(b.note, 500) };
  patch['custody.status'] = MOVES[action].to; patch['custody.custodian'] = CUSTODIAN[MOVES[action].to]; patch['custody.updatedAt'] = now; patch['custody.updatedBy'] = by;
  if (action === 'ship') { patch['custody.shippedAt'] = dayAt; if (b.legId) { patch['custody.legId'] = clean(b.legId, 120); ev.legId = clean(b.legId, 120); } }
  if (action === 'deliver') { patch['custody.deliveredAt'] = dayAt; }
  if (action === 'receive') { patch['custody.receivedAt'] = dayAt; if (!c.deliveredAt) patch['custody.deliveredAt'] = dayAt; if (b.condition === 'damaged') { patch['custody.state'] = 'damaged'; ev.state = 'damaged'; } }
  /* receiving a unit the customer already said was "going to" a site binds
     it there, as their declaration, unless the receipt names a site itself */
  if (action === 'receive' && !b.siteId && c.plannedSiteId) { b = Object.assign({}, b, { siteId: c.plannedSiteId, siteName: c.plannedSiteName, position: c.plannedPosition || undefined }); method = c.plannedBy === 'customer' ? 'customer' : method; }
  if (action === 'assign' || (b.siteId && ['install', 'commission', 'receive'].indexOf(action) >= 0)) {
    patch['custody.siteId'] = clean(b.siteId, 80); patch['custody.siteName'] = clean(b.siteName, 160); if (b.position != null) patch['custody.position'] = clean(b.position, 120); if (b.endCustomer) patch['custody.endCustomer'] = clean(b.endCustomer, 160); if (action === 'assign') patch['custody.assignedAt'] = dayAt; ev.siteId = clean(b.siteId, 80);
    /* who says so: the customer DECLARES where a unit went and the office
       CONFIRMS it; an office record is its own confirmation. A new
       declaration to another site is unconfirmed again. */
    var same = c.siteId === patch['custody.siteId'] && c.confirmedAt;
    patch['custody.declaredBy'] = method === 'customer' ? 'customer' : 'office'; patch['custody.declaredAt'] = now;
    if (method === 'customer' && !same) { patch['custody.confirmedAt'] = null; patch['custody.confirmedBy'] = null; } else if (!same) { patch['custody.confirmedAt'] = now; patch['custody.confirmedBy'] = by; }
    if (c.plannedSiteId) { patch['custody.plannedSiteId'] = null; patch['custody.plannedSiteName'] = null; patch['custody.plannedPosition'] = null; patch['custody.plannedBy'] = null; patch['custody.plannedAt'] = null; }
  }
  if (action === 'install') { patch['custody.installedAt'] = dayAt; if (b.installer) patch['custody.installer'] = clean(b.installer, 120); }
  if (action === 'commission') { patch['custody.commissionedAt'] = dayAt; if (!c.installedAt) patch['custody.installedAt'] = dayAt; if (b.installer) patch['custody.installer'] = clean(b.installer, 120); if (b.reportUrl) patch['custody.commissioningReportUrl'] = clean(b.reportUrl, 600); }
  if (action === 'in-service') patch['custody.inServiceAt'] = dayAt;
  if (action === 'rma-open') { patch['custody.rma'] = { openedAt: dayAt, reason: clean(b.reason || b.note, 500), returnedAt: null }; }
  if (action === 'rma-return') { patch['custody.rma.returnedAt'] = dayAt; patch['custody.custodian'] = 'plant'; }
  if (action === 'replace') { patch['custody.replacedBy'] = serial(b.replacementSerial); patch['custody.replacedAt'] = dayAt; ev.replacedBy = patch['custody.replacedBy']; }
  if (action === 'decommission') patch['custody.decommissionedAt'] = dayAt;
  return { patch: patch, event: ev };
}
/* "this one is going there": a destination named before the unit is bound,
   by the customer on the phone or the office on the load. Not a move; it
   is honoured at receipt (apply 'receive') and cleared once assigned. */
function destination(unit, body, by, now, method) {
  var c = custodyOf(unit), b = body || {};
  if (!unit || !unit.shipUnit) throw fail(400, 'Only a shipping unit is tracked past the plant');
  if (c.state === 'scrapped') throw fail(409, 'A scrapped unit is not sent anywhere');
  if (['', 'in_transit', 'delivered', 'received'].indexOf(c.status) < 0) throw fail(409, 'The unit is already ' + label(c.status) + '; change its site through assign');
  var clear = !b.siteId;
  return { patch: { 'custody.plannedSiteId': clear ? null : clean(b.siteId, 80), 'custody.plannedSiteName': clear ? null : clean(b.siteName, 160), 'custody.plannedPosition': clear ? null : clean(b.position, 120), 'custody.plannedBy': clear ? null : (method === 'customer' ? 'customer' : 'office'), 'custody.plannedAt': clear ? null : now, 'custody.updatedAt': now, 'custody.updatedBy': by },
    event: { type: clear ? 'destination-clear' : 'destination', from: c.status, to: c.status, siteId: clear ? null : clean(b.siteId, 80), by: by, at: now, method: method || 'manual', note: clean(b.note, 500) } };
}
/* the office confirms what the customer declared */
function confirm(unit, body, by, now) {
  var c = custodyOf(unit);
  if (!c.siteId) throw fail(409, 'The unit is not assigned to a site; nothing to confirm');
  if (c.confirmedAt) return { duplicate: true, patch: {}, event: null };
  return { patch: { 'custody.confirmedAt': now, 'custody.confirmedBy': by, 'custody.updatedAt': now, 'custody.updatedBy': by },
    event: { type: 'confirm', from: c.status, to: c.status, siteId: c.siteId, by: by, at: now, method: 'manual', note: clean(body && body.note, 500) } };
}
/* free-text links on a unit that are not moves: who resold it, who the end
   customer is, who installed it, notes, the commissioning report. Nothing
   here changes status or coverage. */
var DETAIL_FIELDS = { reseller: 160, endCustomer: 160, notes: 1000, position: 120, installer: 120, commissioningReportUrl: 600, buyerRef: 120 };
function detail(unit, body, by, now) {
  var c = custodyOf(unit), b = body || {}, patch = {}, changed = [];
  if (!unit || !unit.shipUnit) throw fail(400, 'Only a shipping unit is tracked past the plant');
  Object.keys(DETAIL_FIELDS).forEach(function (k) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return;
    var v = clean(b[k], DETAIL_FIELDS[k]);
    if (k === 'commissioningReportUrl' && v && !/^https:\/\//.test(v)) throw fail(400, 'The commissioning report must be an HTTPS link');
    if ((c[k] || '') === v) return;
    patch['custody.' + k] = v; changed.push(k);
  });
  if (!changed.length) return { duplicate: true, patch: {}, event: null };
  patch['custody.updatedAt'] = now; patch['custody.updatedBy'] = by;
  return { patch: patch, event: { type: 'detail', from: c.status, to: c.status, by: by, at: now, method: 'manual', note: changed.map(function (k) { return k + ': ' + (patch['custody.' + k] || '—'); }).join(' · ').slice(0, 500), fields: changed } };
}

/* ── the register: one flat row per unit, every column a spreadsheet
   would want, built the same way for the endpoint and the sandbox.
   Party model follows what an OEM's installed-base register carries:
   seller (the tenant), buyer (the account that ordered), reseller (who
   sold it on, if anyone), end customer (whose site it runs at), site
   (where it is interconnected). Shipping off the load, coverage derived. */
var REGISTER_COLUMNS = [
  { key: 'serial', label: 'Serial', group: 'unit', width: 150 }, { key: 'sku', label: 'Product', group: 'unit' }, { key: 'product', label: 'Product name', group: 'unit' }, { key: 'unitType', label: 'Type', group: 'unit' }, { key: 'built', label: 'Built', group: 'unit' },
  { key: 'statusLabel', label: 'Status', group: 'where' }, { key: 'state', label: 'Condition', group: 'where' }, { key: 'custodian', label: 'Held by', group: 'where' }, { key: 'confirmation', label: 'Site confirmed', group: 'where' }, { key: 'goingTo', label: 'Going to', group: 'where' },
  { key: 'seller', label: 'Seller', group: 'parties' }, { key: 'buyer', label: 'Buyer', group: 'parties' }, { key: 'reseller', label: 'Reseller', group: 'parties', edit: 'text' }, { key: 'endCustomer', label: 'End customer', group: 'parties', edit: 'text' },
  { key: 'site', label: 'Site', group: 'site', edit: 'site' }, { key: 'position', label: 'Position', group: 'site', edit: 'text' }, { key: 'siteAddress', label: 'Site address', group: 'site' }, { key: 'utility', label: 'Utility', group: 'site' }, { key: 'poi', label: 'Interconnection point', group: 'site' }, { key: 'meter', label: 'Meter', group: 'site' },
  { key: 'orderNo', label: 'Order', group: 'shipping' }, { key: 'poNumber', label: 'Customer PO', group: 'shipping' }, { key: 'load', label: 'Load', group: 'shipping' }, { key: 'carrier', label: 'Carrier', group: 'shipping' }, { key: 'tracking', label: 'BOL / tracking', group: 'shipping' }, { key: 'shippedAt', label: 'Shipped', group: 'shipping' }, { key: 'deliveredAt', label: 'Delivered', group: 'shipping' }, { key: 'receivedAt', label: 'Received', group: 'shipping' },
  { key: 'installedAt', label: 'Installed', group: 'install', edit: 'date:install' }, { key: 'commissionedAt', label: 'Commissioned', group: 'install', edit: 'date:commission' }, { key: 'installer', label: 'Installer', group: 'install', edit: 'text' }, { key: 'inServiceAt', label: 'In service', group: 'install' },
  { key: 'warrantyStatus', label: 'Warranty', group: 'coverage' }, { key: 'warrantyFrom', label: 'Warranty from', group: 'coverage' }, { key: 'warrantyUntil', label: 'Warranty until', group: 'coverage' }, { key: 'slaStatus', label: 'SLA', group: 'coverage' }, { key: 'slaUntil', label: 'SLA until', group: 'coverage' }, { key: 'slaUptime', label: 'SLA uptime %', group: 'coverage' },
  { key: 'replacedBy', label: 'Replaced by', group: 'service' }, { key: 'replaces', label: 'Replaces', group: 'service' }, { key: 'rmaOpenedAt', label: 'RMA opened', group: 'service' }, { key: 'notes', label: 'Notes', group: 'service', edit: 'text' }
];
function registerRow(unit, ctx, now) {
  ctx = ctx || {}; var c = custodyOf(unit), p = ctx.product || null, o = ctx.order || null, leg = ctx.leg || null, site = ctx.site || null, ic = (site && site.interconnection) || {}, a = (site && site.address) || {};
  var cov = coverageWithInheritance(p, unit, now, o && o.shipment && o.shipment.shippedAt ? String(o.shipment.shippedAt).slice(0, 10) : null);
  var w = cov.filter(function (x) { return x.type === 'warranty'; })[0] || null, sla = cov.filter(function (x) { return x.type === 'sla'; })[0] || null;
  return { serial: unit.serial, sku: unit.sku, product: p ? p.name : '', unitType: unit.unitType || 'unit', built: String(unit.readyAt || unit.arrivedAt || unit.createdAt || '').slice(0, 10), orderId: unit.orderId || null,
    status: c.status, statusLabel: c.status ? label(c.status) : (unit.at === 'ready' ? 'ready to ship' : 'being built'), state: c.state || '', custodian: c.status ? (CUSTODIAN[c.status] || '') : 'plant', confirmation: c.siteId ? (c.confirmedAt ? 'confirmed ' + String(c.confirmedAt).slice(0, 10) : 'customer says') : '', goingTo: !c.siteId && c.plannedSiteName ? c.plannedSiteName : '',
    seller: ctx.seller || '', buyer: ctx.buyer || (o && o.customer && (o.customer.company || o.customer.name)) || '', buyerId: unit.customerId || c.customerId || (o && o.customerId) || null, reseller: c.reseller || '', endCustomer: c.endCustomer || '',
    siteId: c.siteId || null, site: c.siteName || '', position: c.position || '', siteAddress: [a.line1, a.city, a.state, a.zip].filter(Boolean).join(', '), utility: ic.utility || '', poi: ic.poi || '', meter: ic.meterNo || '',
    orderNo: unit.orderNo || (o && o.orderNo) || '', poNumber: (o && ((o.purchaseOrder && o.purchaseOrder.number) || o.poNumber)) || '', load: c.legId || (leg && leg.id) || '', carrier: leg ? leg.carrier || '' : '', tracking: leg ? leg.tracking || '' : '',
    shippedAt: c.shippedAt || (leg && leg.pickedUpAt ? String(leg.pickedUpAt).slice(0, 10) : '') || '', deliveredAt: c.deliveredAt || '', receivedAt: c.receivedAt || '',
    installedAt: c.installedAt || '', commissionedAt: c.commissionedAt || '', installer: c.installer || '', inServiceAt: c.inServiceAt || '',
    warrantyStatus: w ? w.status + (w.status === 'pending' && w.why ? ' · ' + w.why : '') : '', warrantyFrom: w ? w.startDate || '' : '', warrantyUntil: w ? w.endDate || '' : '', slaStatus: sla ? sla.status : '', slaUntil: sla ? sla.endDate || '' : '', slaUptime: sla && sla.metrics && sla.metrics.uptimePct != null ? sla.metrics.uptimePct : '',
    replacedBy: c.replacedBy || '', replaces: c.replaces || '', rmaOpenedAt: c.rma && c.rma.openedAt ? c.rma.openedAt : '', notes: c.notes || '',
    can: { assign: judge(unit, 'assign', { siteId: '_' }).ok || c.status === 'assigned', install: judge(unit, 'install', {}).ok, commission: judge(unit, 'commission', {}).ok, destination: plannable(unit).ok } };
}
/* what the customer's own record says, for either side to show */
function confirmation(c) { c = c || {}; return !c.siteId ? null : c.confirmedAt ? 'confirmed' : 'declared'; }
/* a side state: damaged, lost, quarantined, scrapped, or cleared */
function state(unit, value, body, by, now, method) {
  var c = custodyOf(unit); value = value === 'clear' ? null : value;
  if (value && STATES.indexOf(value) < 0) throw fail(400, 'State must be damaged, lost, quarantined, scrapped or clear');
  if (c.state === 'scrapped') throw fail(409, 'A scrapped unit stays scrapped');
  return { patch: { 'custody.state': value, 'custody.stateAt': value ? now : null, 'custody.updatedAt': now, 'custody.updatedBy': by },
    event: { type: value ? 'state' : 'state-clear', state: value, from: c.status, to: c.status, by: by, at: now, method: method || 'manual', note: clean(body && body.note, 500) } };
}

/* ── coverage ──────────────────────────────────────────────────────────
   Templates come off the catalog product; the product's warrantyYears is
   the default template when it carries none. A unit's coverage is DERIVED
   from its custody dates every time it is read, never stored, so a
   corrected commissioning date corrects the warranty with it. */
var TRIGGERS = ['ship', 'delivery', 'commissioning', 'earliest_of'];
function templatesOf(product) {
  product = product || {};
  var list = Array.isArray(product.coverage) ? product.coverage.filter(function (t) { return t && t.id; }) : [];
  if (!list.length && Number(product.warrantyYears) > 0) list = [{ id: 'warranty', type: 'warranty', provider: 'oem', termMonths: Math.round(Number(product.warrantyYears) * 12), trigger: 'ship', capMonths: null, metrics: null, docUrl: '' }];
  return list;
}
function template(t) {
  t = t || {};
  var id = clean(t.id, 40).toLowerCase().replace(/[^a-z0-9_-]/g, ''); if (!id) throw fail(400, 'Coverage needs an id');
  var type = t.type === 'sla' ? 'sla' : 'warranty', term = Number(t.termMonths), cap = t.capMonths == null || t.capMonths === '' ? null : Number(t.capMonths);
  if (!Number.isInteger(term) || term < 1 || term > 600) throw fail(400, 'Coverage term must be 1–600 months');
  if (TRIGGERS.indexOf(t.trigger) < 0) throw fail(400, 'Coverage trigger must be ship, delivery, commissioning or earliest_of');
  if (t.trigger === 'earliest_of' && !(Number.isInteger(cap) && cap > 0)) throw fail(400, 'earliest_of needs capMonths: commissioning, or ship date plus that many months, whichever is first');
  var m = t.metrics && typeof t.metrics === 'object' ? t.metrics : {}, metrics = null;
  if (type === 'sla') { metrics = { uptimePct: m.uptimePct == null || m.uptimePct === '' ? null : Number(m.uptimePct), responseHours: m.responseHours == null || m.responseHours === '' ? null : Number(m.responseHours), resolutionHours: m.resolutionHours == null || m.resolutionHours === '' ? null : Number(m.resolutionHours) }; if (metrics.uptimePct != null && !(metrics.uptimePct > 0 && metrics.uptimePct <= 100)) throw fail(400, 'Uptime must be 0–100%'); }
  var docUrl = clean(t.docUrl, 600); if (docUrl && !/^https:\/\//.test(docUrl)) throw fail(400, 'Coverage document must be an HTTPS link');
  return { id: id, type: type, provider: clean(t.provider, 80) || 'oem', termMonths: term, trigger: t.trigger, capMonths: cap, metrics: metrics, exclusions: clean(t.exclusions, 500), docUrl: docUrl };
}
function addMonths(iso, months) { var d = new Date(iso + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + months); return d.toISOString().slice(0, 10); }
function startOf(t, c, shippedFallback) {
  var ship = c.shippedAt || shippedFallback || null, delivery = c.receivedAt || c.deliveredAt || null, comm = c.commissionedAt || null;
  if (t.trigger === 'ship') return ship;
  if (t.trigger === 'delivery') return delivery;
  if (t.trigger === 'commissioning') return comm;
  var capped = ship ? addMonths(ship, t.capMonths) : null;
  if (comm && capped) return comm < capped ? comm : capped;
  return comm || capped;
}
function coverageOf(product, unit, now, shippedFallback) {
  var c = custodyOf(unit), today = String(now).slice(0, 10);
  return templatesOf(product).map(function (t) {
    var start = c.status === 'replaced' ? null : startOf(t, c, shippedFallback), end = start ? addMonths(start, t.termMonths) : null, status;
    var why = null;
    if (c.status === 'replaced') status = 'transferred';
    else if (!start) { status = 'pending'; why = 'waiting for ' + (t.trigger === 'earliest_of' ? 'commissioning' : t.trigger); }
    else if (start > today) { status = 'pending'; why = 'starts ' + start + (t.trigger === 'earliest_of' ? ' unless commissioned first' : ''); }
    else if (!c.siteId) { status = 'pending'; why = 'no site assigned'; }
    else if (today > end) status = 'expired';
    else status = 'active';
    return { templateId: t.id, type: t.type, provider: t.provider, trigger: t.trigger, termMonths: t.termMonths, startDate: start, endDate: end, status: status, why: why, metrics: t.metrics || null, docUrl: t.docUrl || '' };
  });
}
/* On replacement the new unit inherits the REMAINING term: its coverage
   starts when the original's did and ends when the original's would have. */
function inherited(originalCoverage) {
  return (originalCoverage || []).filter(function (cv) { return cv.startDate; }).map(function (cv) { return { templateId: cv.templateId, type: cv.type, provider: cv.provider, startDate: cv.startDate, endDate: cv.endDate, inheritedFrom: cv.serial || null }; });
}
function coverageWithInheritance(product, unit, now, shippedFallback) {
  var own = coverageOf(product, unit, now, shippedFallback), c = custodyOf(unit), inh = Array.isArray(c.inheritedCoverage) ? c.inheritedCoverage : [];
  if (!inh.length) return own;
  var today = String(now).slice(0, 10);
  return own.map(function (cv) { var h = inh.filter(function (x) { return x.templateId === cv.templateId; })[0]; if (!h) return cv; return Object.assign({}, cv, { startDate: h.startDate, endDate: h.endDate, status: !c.siteId ? 'pending' : (today > h.endDate ? 'expired' : 'active'), why: !c.siteId ? 'no site assigned' : null, inheritedFrom: h.inheritedFrom }); });
}

/* ── exceptions: the gaps that lose warranty claims ────────────────────── */
function exceptions(units, products, now, opts) {
  var o = Object.assign({ staleTransitDays: 21, unassignedDays: 30, expiringDays: 90, confirmDays: 3 }, opts || {}), by = {}, out = [];
  (products || []).forEach(function (p) { if (p && p.sku) by[p.sku] = p; });
  var t = new Date(now).getTime();
  function days(iso) { return iso ? Math.floor((t - Date.parse(iso)) / 86400000) : null; }
  (units || []).forEach(function (u) {
    var c = custodyOf(u), s = c.status;
    if (!s && !c.state) return;
    var cov = coverageWithInheritance(by[u.sku], u, now);
    if ((s === 'commissioned' || s === 'in_service') && !c.siteId) out.push({ serial: u.serial, kind: 'commissioned_without_site', say: 'Commissioned but assigned to no site: coverage cannot start' });
    if (s === 'in_transit' && days(c.shippedAt) > o.staleTransitDays) out.push({ serial: u.serial, kind: 'stale_in_transit', say: 'In transit for ' + days(c.shippedAt) + ' days' });
    if ((s === 'received' || s === 'delivered') && days(c.receivedAt || c.deliveredAt) > o.unassignedDays) out.push({ serial: u.serial, kind: 'received_not_assigned', say: 'Received ' + days(c.receivedAt || c.deliveredAt) + ' days ago and not assigned to a site' });
    if (c.siteId && !c.confirmedAt && c.declaredBy === 'customer' && days(c.declaredAt) >= o.confirmDays) out.push({ serial: u.serial, kind: 'declared_unconfirmed', say: 'Customer says it is at ' + (c.siteName || c.siteId) + ' since ' + String(c.declaredAt).slice(0, 10) + '; not yet confirmed' });
    if (c.state && s !== 'replaced' && s !== 'returned') out.push({ serial: u.serial, kind: 'state_' + c.state, say: c.state.charAt(0).toUpperCase() + c.state.slice(1) + (c.stateAt ? ' since ' + String(c.stateAt).slice(0, 10) : '') });
    cov.forEach(function (cv) {
      if (cv.status === 'active' && cv.endDate && (Date.parse(cv.endDate) - t) / 86400000 <= o.expiringDays) out.push({ serial: u.serial, kind: 'coverage_expiring', say: cv.type + ' ' + cv.templateId + ' ends ' + cv.endDate });
      if (s === 'in_service' && cv.status === 'pending') out.push({ serial: u.serial, kind: 'in_service_no_coverage', say: 'In service with ' + cv.type + ' ' + cv.templateId + ' still pending: ' + cv.why });
    });
  });
  return out;
}

/* ── receiving reconciliation: expected (the load) vs actual (scanned) ── */
function reconcile(expected, actual) {
  var exp = {}, seen = {}, received = [], overage = [], damaged = [], duplicate = [];
  (expected || []).forEach(function (s) { exp[s] = true; });
  (actual || []).forEach(function (r) {
    var s = typeof r === 'string' ? r : r && r.serial, cond = typeof r === 'string' ? 'accepted' : (r && r.condition) || 'accepted';
    if (!s) return; if (seen[s]) { duplicate.push(s); return; } seen[s] = true;
    if (!exp[s]) { overage.push(s); return; }
    (cond === 'damaged' ? damaged : received).push(s);
  });
  var short = Object.keys(exp).filter(function (s) { return !seen[s]; });
  return { received: received, damaged: damaged, short: short, overage: overage, duplicate: duplicate, complete: !short.length && !overage.length };
}

/* ── import: any spreadsheet, mapped once per org, dry run first ───────── */
var COLUMNS = {
  serial: ['serial_number', 'serial', 'sn', 's/n', 'serial no', 'serial number', 'unit'],
  siteId: ['site_id', 'site id', 'siteid'],
  siteName: ['site_name', 'site', 'site name', 'location', 'location name'],
  line1: ['address', 'street', 'line1', 'address 1', 'street address'],
  city: ['city'], state: ['state', 'st'], zip: ['zip', 'zip code', 'postal code', 'postcode'],
  endCustomer: ['end_customer', 'end customer', 'account', 'customer'],
  position: ['position', 'rack', 'bay', 'slot', 'location in site'],
  installer: ['installer', 'installed by', 'contractor'],
  receivedDate: ['received_date', 'received', 'date received', 'delivery date', 'delivered'],
  installDate: ['install_date', 'installed', 'install date', 'installation date'],
  commissionDate: ['commission_date', 'commissioned', 'commissioning date', 'commission date', 'cod'],
  condition: ['condition', 'receiving condition'],
  utility: ['utility'], meter: ['meter_number', 'meter', 'meter no', 'meter number'], poi: ['interconnection_point', 'poi', 'point of interconnection', 'interconnection'],
  notes: ['notes', 'note', 'comment', 'comments']
};
var TEMPLATE_HEADERS = ['serial_number', 'site_id', 'site_name', 'address', 'city', 'state', 'zip', 'end_customer', 'position', 'installer', 'received_date', 'install_date', 'commission_date', 'condition', 'utility', 'meter_number', 'interconnection_point', 'notes'];
function csvTemplate() { return TEMPLATE_HEADERS.join(',') + '\n' + ['CC418-26-44190', '', 'Bakersfield yard', '1200 Depot Rd', 'Bakersfield', 'CA', '93307', 'InCharge Energy', 'Pad 2', 'Riverside Electric', '2026-11-20', '2026-11-28', '2026-12-04', 'accepted', 'PG&E', '1002233', 'POI-7 480V', ''].join(',') + '\n'; }
/* RFC-4180 enough: quoted fields, doubled quotes, CRLF; a tab-separated
   paste from a sheet is accepted too. csvRows keeps the line each row
   started on; `sep` is chosen by the caller when it knows better (a site
   list decides from its header line alone: a tab-separated paste from a
   sheet has commas INSIDE its address cells). Unchosen, it is the old rule:
   tab only when the text has no comma at all. */
function csvRows(text, sep) {
  var s = String(text || '').replace(/^\uFEFF/, ''), rows = [], row = [], field = '', q = false, line = 1, start = 1;
  if (sep !== '\t' && sep !== ',') sep = s.indexOf('\t') >= 0 && s.indexOf(',') < 0 ? '\t' : ',';
  function keep() { if (row.some(function (f) { return f.trim() !== ''; })) rows.push({ line: start, cells: row }); }
  for (var i = 0; i < s.length; i++) {
    var ch = s[i];
    if (q) { if (ch === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else q = false; } else { if (ch === '\n') line++; field += ch; } continue; }
    if (ch === '"') q = true; else if (ch === sep) { row.push(field); field = ''; } else if (ch === '\n' || ch === '\r') { if (ch === '\r' && s[i + 1] === '\n') i++; row.push(field); field = ''; keep(); row = []; line++; start = line; } else field += ch;
  }
  row.push(field); keep();
  return rows;
}
function parseCsv(text, sep) {
  var rows = csvRows(text, sep).map(function (r) { return r.cells; });
  if (!rows.length) return { headers: [], rows: [] };
  var headers = rows[0].map(function (h) { return h.trim(); });
  return { headers: headers, rows: rows.slice(1).map(function (r) { var o = {}; headers.forEach(function (h, i) { o[h] = (r[i] || '').trim(); }); return o; }) };
}
/* which of our fields each of their headers feeds; a saved mapping wins */
function guessMapping(headers, saved) {
  var map = {}; (headers || []).forEach(function (h) {
    var k = String(h).trim().toLowerCase().replace(/\s+/g, ' ');
    if (saved && saved[h]) { map[h] = saved[h]; return; }
    Object.keys(COLUMNS).some(function (field) { if (COLUMNS[field].indexOf(k) >= 0 || k === field.toLowerCase()) { map[h] = field; return true; } return false; });
  });
  return map;
}
function mapRow(raw, mapping) { var out = {}; Object.keys(mapping || {}).forEach(function (h) { if (mapping[h] && raw[h] != null && String(raw[h]).trim() !== '') out[mapping[h]] = String(raw[h]).trim(); }); return out; }
function siteKey(customerId, name, zip) { return (customerId || 'none') + ':' + String(name || '').trim().toLowerCase().replace(/\s+/g, ' ') + ':' + String(zip || '').trim(); }
/* Plan what each row would do, against the units and sites handed in.
   `units` is a map serial → unit; `sites` a map siteId → site and
   a map by siteKey. Nothing is written here: the endpoint commits. */
function plan(rows, mapping, ctx, now) {
  var out = [], newSites = {}, seen = {};
  if (!Array.isArray(rows)) throw fail(400, 'Rows required');
  if (rows.length > MAX_ROWS) throw fail(400, 'At most ' + MAX_ROWS + ' rows per import');
  rows.forEach(function (raw, i) {
    var r = mapRow(raw, mapping), item = { row: i + 2, serial: r.serial || '', actions: [], problems: [], siteId: null, siteName: null, newSite: false };
    try {
      if (!r.serial) throw fail(400, 'No serial on this row');
      item.serial = serial(r.serial);
      if (seen[item.serial]) throw fail(400, 'Serial appears twice in the file'); seen[item.serial] = true;
      var unit = ctx.units[item.serial]; if (!unit) throw fail(404, 'Serial is not registered with the plant');
      if (!unit.shipUnit) throw fail(400, 'A component travels with its assembly');
      /* the site: by id, or by name (+zip) on the customer, created if the office allows */
      var site = null;
      if (r.siteId) { site = ctx.sites[r.siteId]; if (!site) throw fail(404, 'Site id "' + r.siteId + '" not found'); }
      else if (r.siteName) {
        /* ONE owner for the key and the record: a new site made for a unit
           already on a customer's account belongs to that account, or no
           person on it could see the site their unit is at. */
        var owner = ctx.customerId || (unit.custody && unit.custody.customerId) || unit.customerId || (ctx.accountOf && ctx.accountOf(unit)) || null;
        /* An UNOWNED site with that name and ZIP (the office made it without
           choosing a customer, or an earlier import did) is the same place:
           adopt it rather than refusing the row or making a duplicate and
           moving the unit onto it. It stays shared — the unit's own
           custody.customerId is what puts it on the account. */
        var key = siteKey(owner, r.siteName, r.zip), anyKey = siteKey(null, r.siteName, r.zip);
        site = ctx.byKey[key] || newSites[key] || (owner ? (ctx.byKey[anyKey] || newSites[anyKey]) : null);
        if (!site) {
          if (!ctx.allowNewSites) throw fail(400, 'Site "' + r.siteName + '" does not exist; add it first or allow new sites');
          if (!r.line1 && !r.city) throw fail(400, 'A new site needs an address');
          site = newSites[key] = { id: 'site_' + key.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60), name: r.siteName, customerId: owner, address: { line1: r.line1 || '', city: r.city || '', state: r.state || '', zip: r.zip || '', country: 'US' }, endCustomer: r.endCustomer || '', interconnection: { utility: r.utility || '', meterNo: r.meter || '', poi: r.poi || '' }, isNew: true };
          item.newSite = true;
        }
      }
      if (site) {
        var siteOwner = ctx.customerId || (unit.custody && unit.custody.customerId) || unit.customerId || (ctx.accountOf && ctx.accountOf(unit)) || null;
        if (site.customerId && siteOwner && site.customerId !== siteOwner) throw fail(409, 'Site "' + site.name + '" belongs to another customer account');
        item.siteId = site.id; item.siteName = site.name;
      }
      var c = custodyOf(unit), sim = JSON.parse(JSON.stringify(unit));
      function step(action, body) { var v = judge(sim, action, body); if (!v.ok) throw fail(409, v.say); if (v.action === 'duplicate') return; var ap = apply(sim, action, body, 'import', now, 'import'); Object.keys(ap.patch).forEach(function (k) { var parts = k.split('.'), t = sim; parts.slice(0, -1).forEach(function (p) { t = t[p] || (t[p] = {}); }); t[parts[parts.length - 1]] = ap.patch[k]; }); item.actions.push(Object.assign({ action: action }, body)); }
      var cond = r.condition ? String(r.condition).toLowerCase() : '';
      if (cond && ['accepted', 'damaged', 'received', 'ok', 'intact'].indexOf(cond) < 0) throw fail(400, 'Condition must be accepted or damaged');
      if (r.receivedDate && ['', 'in_transit', 'delivered'].indexOf(c.status) >= 0) step('receive', { at: day(r.receivedDate), condition: cond === 'damaged' ? 'damaged' : 'accepted', siteId: site ? site.id : undefined, siteName: site ? site.name : undefined });
      if (site && (['delivered', 'received'].indexOf(custodyOf(sim).status) >= 0 || (custodyOf(sim).status === 'assigned' && custodyOf(sim).siteId !== site.id))) step('assign', { siteId: site.id, siteName: site.name, position: r.position, endCustomer: r.endCustomer });
      else if (site && custodyOf(sim).siteId !== site.id) { var st = custodyOf(sim).status; throw fail(409, !st ? 'Unit is still at the plant; a received date is needed before a site' : st === 'in_transit' ? 'Unit is in transit; a received date is needed before a site' : 'Unit is ' + label(st) + ' at another site; move it through RMA or decommissioning'); }
      if (r.installDate && custodyOf(sim).status !== 'installed' && ['assigned', 'received'].indexOf(custodyOf(sim).status) >= 0) step('install', { at: day(r.installDate), installer: r.installer });
      if (r.commissionDate && ['assigned', 'installed', 'received'].indexOf(custodyOf(sim).status) >= 0) step('commission', { at: day(r.commissionDate), installer: r.installer });
      if (!item.actions.length) item.skipped = true;
    } catch (e) { item.problems.push(e.message); }
    out.push(item);
  });
  var summary = { rows: out.length, willChange: out.filter(function (x) { return x.actions.length && !x.problems.length; }).length, skipped: out.filter(function (x) { return x.skipped && !x.problems.length; }).length, errors: out.filter(function (x) { return x.problems.length; }).length, newSites: Object.keys(newSites).length };
  return { items: out, newSites: Object.keys(newSites).map(function (k) { return newSites[k]; }), summary: summary };
}

/* ── the site record ──────────────────────────────────────────────────── */
function site(input, existing) {
  var b = input || {}, name = clean(b.name, 160); if (!name) throw fail(400, 'Site name required');
  var a = b.address && typeof b.address === 'object' ? b.address : {}, ic = b.interconnection && typeof b.interconnection === 'object' ? b.interconnection : {};
  var address = { line1: clean(a.line1, 200), line2: clean(a.line2, 200), city: clean(a.city, 100), state: clean(a.state, 40), zip: clean(a.zip, 20), country: clean(a.country, 40) || 'US' };
  /* a pin the edit does not send is kept only while the address is the
     same place (an edit form that has no map must not wipe a geocoded pin,
     and must not leave the old address's pin on a new one); '' or null
     clears it */
  var keep = !!existing && samePlace(existing.address, address);
  var lat = b.lat === undefined && existing ? (keep && existing.lat != null ? existing.lat : null) : (b.lat == null || b.lat === '' ? null : Number(b.lat));
  var lng = b.lng === undefined && existing ? (keep && existing.lng != null ? existing.lng : null) : (b.lng == null || b.lng === '' ? null : Number(b.lng));
  if ((lat != null && !(lat >= -90 && lat <= 90)) || (lng != null && !(lng >= -180 && lng <= 180))) throw fail(400, 'Latitude or longitude out of range');
  var out = { name: name, customerId: clean(b.customerId, 80) || (existing && existing.customerId) || null, endCustomer: clean(b.endCustomer, 160),
    address: address,
    lat: lat, lng: lng, interconnection: { utility: clean(ic.utility, 120), accountNo: clean(ic.accountNo, 80), meterNo: clean(ic.meterNo, 80), poi: clean(ic.poi, 200), serviceVoltage: clean(ic.serviceVoltage, 40), serviceKw: ic.serviceKw == null || ic.serviceKw === '' ? null : Number(ic.serviceKw), agreementRef: clean(ic.agreementRef, 120) },
    contact: { name: clean(b.contact && b.contact.name, 120), phone: clean(b.contact && b.contact.phone, 40), email: clean(b.contact && b.contact.email, 160) },
    notes: clean(b.notes, 1000), status: b.status === 'inactive' ? 'inactive' : 'active', lifecycleSiteId: clean(b.lifecycleSiteId, 80) || null,
    /* the customer's own reference for the place (store #, site id), from a
       site list; an edit that does not send it keeps it */
    ref: b.ref === undefined ? clean(existing && existing.ref, 80) : clean(b.ref, 80) };
  if (out.interconnection.serviceKw != null && !(out.interconnection.serviceKw >= 0)) throw fail(400, 'Service kW must be a number');
  return out;
}
function siteId(customerId, s) { return 'site_' + siteKey(customerId, s.name, s.address && s.address.zip).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60); }
/* the same place: the street as matched (addressKey), the city and the state */
function samePlace(a, b) {
  a = a || {}; b = b || {};
  return addressKey(a.line1, a.zip) === addressKey(b.line1, b.zip) && String(a.city || '').trim().toLowerCase() === String(b.city || '').trim().toLowerCase()
    && (stateCode(a.state) || String(a.state || '').trim().toUpperCase()) === (stateCode(b.state) || String(b.state || '').trim().toUpperCase());
}

/* ── many sites at once: a pasted list, matched, spread over an order ──
   A customer's PO names its sites as an email list or a sheet. These turn
   that text into site rows (parseSiteList), say which already exist on the
   account (matchSites), and spread an order's units over the chosen sites
   (spread) — all pure, so api/my-sites.js, api/logic-custody.js and the
   sandbox answer the same way. Nothing here geocodes or writes: geocoding
   is the endpoints' (api/_lib/geocode.js), and each unit's "going to" is
   recorded through destination() above, one event per unit.

   A site MATCHES by its address on the same account (the street as
   normalised by addressKey, plus the 5-digit ZIP), never by its id alone:
   siteId() cuts at 60 characters and folds capitals, so two places can
   compute the same id. The endpoints give a new site the next free -2…-9
   suffix inside the transaction when its id is already taken. */
var MAX_SITE_ROWS = 200;      // a list, a create call, a plan's sites
var MAX_PLAN_UNITS = 200;     // units written per plan-apply call (2 writes each)
/* The text is typed by whoever is signed in — on the customer side, any
   verified email — so the reader is bounded before any pattern runs: the
   whole list, and each line (a longer one is not an address and is left
   out by name). Every pattern below is anchored or runs on a short window,
   and the right-hand trims are done by hand: /\s+$/ and friends backtrack
   quadratically on a long run of spaces that does not end the line. */
var MAX_SITE_TEXT = 100000;   // characters in one pasted list or file
var MAX_SITE_LINE = 400;      // characters on one address line or sheet cell
var US_STATES = { AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', DC: 'District of Columbia', PR: 'Puerto Rico' };
var STATE_BY_NAME = {}; Object.keys(US_STATES).forEach(function (k) { STATE_BY_NAME[US_STATES[k].toLowerCase()] = k; }); STATE_BY_NAME['washington dc'] = 'DC'; STATE_BY_NAME['washington d.c.'] = 'DC';
function stateCode(v) { var s = String(v == null ? '' : v).trim().replace(/\.$/, ''); if (!s) return ''; var up = s.toUpperCase().replace(/\./g, ''); if (US_STATES[up]) return up; return STATE_BY_NAME[s.toLowerCase().replace(/\s+/g, ' ')] || ''; }
/* the street as a matching key: case, punctuation and the usual USPS
   abbreviations folded, so "16 West Elm Street" and "16 W Elm St." match */
var ABBR = { street: 'st', avenue: 'ave', av: 'ave', road: 'rd', drive: 'dr', boulevard: 'blvd', lane: 'ln', court: 'ct', place: 'pl', highway: 'hwy', parkway: 'pkwy', square: 'sq', suite: 'ste', circle: 'cir', terrace: 'ter', trail: 'trl', freeway: 'fwy', expressway: 'expy', building: 'bldg', floor: 'fl', north: 'n', south: 's', east: 'e', west: 'w', northeast: 'ne', northwest: 'nw', southeast: 'se', southwest: 'sw' };
function addressKey(line1, zip) {
  var words = String(line1 || '').toLowerCase().replace(/[.,#]/g, ' ').replace(/\s+/g, ' ').trim().split(' ').map(function (w) { return ABBR[w] || w; });
  return words.join(' ') + '|' + String(zip || '').trim().slice(0, 5);
}
/* serials in the order a person reads them: …-9 before …-10 */
function naturalCompare(a, b) {
  var ax = String(a).match(/\d+|\D+/g) || [], bx = String(b).match(/\d+|\D+/g) || [];
  for (var i = 0; i < Math.max(ax.length, bx.length); i++) {
    var x = ax[i], y = bx[i];
    if (x === undefined) return -1; if (y === undefined) return 1; if (x === y) continue;
    if (/^\d/.test(x) && /^\d/.test(y)) { var sx = x.replace(/^0+/, ''), sy = y.replace(/^0+/, ''); if (sx.length !== sy.length) return sx.length - sy.length; if (sx !== sy) return sx < sy ? -1 : 1; return x.length - y.length; }
    return x < y ? -1 : 1;
  }
  return 0;
}
function bySerial(a, b) { return naturalCompare(a.serial, b.serial); }
function oneLine(a) { a = a || {}; return [a.line1, a.city, [a.state, a.zip].filter(Boolean).join(' ')].filter(Boolean).join(', '); }
function defaultName(a) { a = a || {}; return a.city ? a.city + (a.state ? ', ' + a.state : '') : (a.line1 || ''); }
/* the right-hand end without whitespace (and, with punct, without the full
   stop or semicolon a formal list ends its lines with), by hand */
function trimEnd(s, punct) {
  s = String(s == null ? '' : s); var i = s.length;
  while (i > 0) { var ch = s.charAt(i - 1); if (/\s/.test(ch) || (punct && (ch === '.' || ch === ';' || ch === ','))) i--; else break; }
  return s.slice(0, i);
}
function isDigit(ch) { return ch >= '0' && ch <= '9'; }
/* a ZIP at the end of a part, read from the right by hand: the longest run
   of digits, spaces and dashes that starts and ends with a digit, and what
   stands before it */
function zipTail(s) {
  var n = s.length; if (!n || !isDigit(s.charAt(n - 1))) return null;
  var i = n; while (i > 0 && /[\d\s-]/.test(s.charAt(i - 1))) i--;
  while (i < n && !isDigit(s.charAt(i))) i++;
  return { zip: s.slice(i).replace(/\s+/g, ''), before: trimEnd(s.slice(0, i)) };
}

/* "Street, City, ST 12345", read from the RIGHT so a ", Suite 100" stays in
   the street: the last part is the state and ZIP (or the ZIP alone, the
   state before it), the part before that the city, the rest the street. A
   trailing full stop or semicolon is not part of the ZIP. */
function splitAddress(text) {
  var parts = trimEnd(text, true).split(',').map(function (x) { return x.trim(); }).filter(Boolean), out = { line1: '', city: '', state: '', zip: '' };
  if (parts.length && /^(u\.?s\.?a?\.?|united states( of america)?)$/i.test(parts[parts.length - 1])) parts.pop();
  if (!parts.length) return out;
  var last = parts.pop(), m = zipTail(last), cand;
  if (m) { out.zip = m.zip; cand = m.before; if (!cand) cand = parts.length > 1 ? parts.pop() : ''; }
  else cand = last;
  if (cand && stateCode(cand)) out.state = stateCode(cand);
  else if (cand) {
    var words = cand.split(/\s+/), found = false;
    for (var k = Math.min(4, words.length - 1); k >= 1 && !found; k--) {
      var tail = words.slice(words.length - k).join(' ');
      if (stateCode(tail) && (k > 1 || /^[A-Za-z]{2}\.?$/.test(tail) || tail.length > 3)) { out.state = stateCode(tail); parts.push(words.slice(0, words.length - k).join(' ')); found = true; }
    }
    /* no state found: a two-letter word, or a word after the city, is a
       bad state; a lone word after the street is the city */
    if (!found) { if (/^[A-Za-z]{2}\.?$/.test(cand) || parts.length >= 2) out.state = cand; else parts.push(cand); }
  }
  out.city = parts.length ? parts.pop() : '';
  out.line1 = parts.join(', ');
  return out;
}
/* ONE row validator: the list parser and sites-create both run it, so an
   edited row from a browser gets exactly the checks a pasted one does. */
function checkSiteRow(r) {
  r = r || {}; var a = r.address && typeof r.address === 'object' ? r.address : {}, problems = [];
  var line1 = clean(a.line1, 200), city = clean(a.city, 100), stRaw = clean(a.state, 40), zip = clean(a.zip, 20), st = stateCode(stRaw);
  if (!line1) problems.push(city && /^\d/.test(city) ? 'No city, or no comma between the street and the city' : 'No street address');
  if (!city) problems.push('No city');
  if (!stRaw) problems.push('No state'); else if (!st) problems.push('"' + stRaw + '" is not a US state');
  if (!zip) problems.push('No ZIP code'); else if (!/^\d{5}(-\d{4})?$/.test(zip)) problems.push('ZIP "' + zip + '" must be 5 digits, or ZIP+4');
  var units = r.units == null || r.units === '' ? null : Number(r.units);
  if (units !== null && !(isFinite(units) && Math.floor(units) === units && units >= 0 && units <= 10000)) { problems.push('Units "' + clean(r.units, 20) + '" must be a whole number from 0 to 10,000'); units = null; }
  /* not a problem but worth a look: a street with no house number in front
     is as often the sender's office in an email signature ("Acme Capital,
     500 Congress Ave…") as a site. The screens start such a row unticked;
     a grid address (N7W22025 …) is a house number. */
  var warnings = line1 && !/^(\d|[NSEW]\d)/i.test(line1) ? ['The street does not start with a house number: is this one of the sites, or an office or signature address?'] : [];
  return { name: clean(r.name, 160), address: { line1: line1, city: city, state: st || stRaw, zip: zip, country: 'US' }, units: units, ref: clean(r.ref, 80), problems: problems, warnings: warnings };
}
/* a trailing unit count on a line: " x3", " ×3", " (3 units)", " - 3 units",
   "; 3", ", 3 units". Run on the last UNIT_WINDOW characters only, so no
   pattern ever scans a long line (a tab-separated row is read by cells,
   lineCells below, not by a pattern). */
var UNIT_TAILS = [/\s[x×]\s?(\d+(?:\.\d+)?)$/i, /\(\s*(\d+(?:\.\d+)?)\s*(?:units?|batter(?:y|ies)|pcs|ea)?\s*\)$/i, /\s[-–—]\s*(\d+(?:\.\d+)?)\s*(?:units?|batter(?:y|ies))$/i, /;\s*(\d+(?:\.\d+)?)\s*(?:units?|batter(?:y|ies))?$/i, /,\s*(\d+(?:\.\d+)?)\s*(?:units?|batter(?:y|ies))$/i];
var UNIT_WINDOW = 40;
function unitTail(t) {
  var off = Math.max(0, t.length - UNIT_WINDOW), w = t.slice(off), out = null;
  UNIT_TAILS.some(function (re) { var m = re.exec(w); if (m) { out = { units: Number(m[1]), rest: trimEnd(t.slice(0, off + m.index)) }; return true; } return false; });
  return out;
}
function unitCell(v) { var s = String(v == null ? '' : v).trim(), m = /^(\d+(?:\.\d+)?)\s*(?:units?|batter(?:y|ies)|pcs|ea)?$/i.exec(s); return !s ? null : m ? Number(m[1]) : s; }
/* a cell our own CSV download wrote as text so a spreadsheet keeps its
   leading zero (="04101") reads back as the text */
function unText(v) { var s = String(v == null ? '' : v).trim(); return /^="[^"]*"$/.test(s) ? s.slice(2, -1) : s; }
var LIST_COLUMNS = {
  name: ['name', 'site', 'site name', 'location', 'location name', 'store', 'store name'],
  line1: ['address', 'street', 'address 1', 'address line 1', 'street address', 'line1', 'line 1', 'address1', 'addr'],
  line2: ['address 2', 'address line 2', 'line2', 'line 2', 'address2', 'suite'],
  city: ['city', 'town'], state: ['state', 'st', 'state/province', 'province'],
  zip: ['zip', 'zip code', 'zipcode', 'postal code', 'postcode', 'postal'],
  units: ['units', 'qty', 'quantity', 'count', 'batteries', 'units planned', '# units', 'number of units', 'unit count'],
  ref: ['ref', 'store #', 'store number', 'store no', 'store no.', 'site id', 'site #', 'site number', 'reference', 'store id', 'location id']
};
function listField(h) { var k = String(h || '').trim().toLowerCase().replace(/_+/g, ' ').replace(/\s+/g, ' ').replace(/:$/, ''); var f = null; Object.keys(LIST_COLUMNS).some(function (x) { if (LIST_COLUMNS[x].indexOf(k) >= 0) { f = x; return true; } return false; }); return f; }
var ZERO_ZIP = ['CT', 'MA', 'ME', 'NH', 'NJ', 'PR', 'RI', 'VT'];
function tooMany(n) { return fail(400, 'At most ' + MAX_SITE_ROWS + ' sites in one list; this one has ' + n + '. Split it into smaller lists.'); }
/* a line that is CELLS, not one address: a quoted CSV line (a one-column
   sheet saved from Excel or Google Sheets quotes every address, since each
   has commas) or a row copied out of a sheet without its header row
   (tab-separated). null for a plain line. */
function lineCells(t) {
  if (t.charAt(0) === '"') { var r = csvRows(t, ',')[0]; return r ? r.cells : null; }
  if (t.indexOf('\t') >= 0) return t.split('\t');
  return null;
}
/* cells by position, the state found from the RIGHT: [name…] street, city,
   state, ZIP [units]. Else one cell that is a whole address (commas and a
   number), named by the cells before it, counted by a number after it.
   Else the cells joined as one line (…, city, "ST 12345" [units]). */
function fromCells(cells) {
  var c = cells.map(unText).filter(Boolean), n = c.length, i, units = null;
  function count(v) { return v != null && /^\d/.test(v) ? unitCell(v) : null; }
  /* "Store 12:" or "Store 12 –" in a name cell: the mark is not the name */
  function bare(v) { var k = v.length; while (k > 0 && /[\s:\-–—]/.test(v.charAt(k - 1))) k--; return v.slice(0, k); }
  for (i = n - 1; i >= 1; i--) {
    if (!stateCode(c[i])) continue;
    var zip = i + 1 < n && /^\d{3,5}(?:-\d{4})?$/.test(c[i + 1]) ? c[i + 1] : '', after = i + (zip ? 2 : 1);
    if (/^\d{3,4}$/.test(zip) && ZERO_ZIP.indexOf(stateCode(c[i])) >= 0) zip = ('00' + zip).slice(-5);
    return { name: i >= 3 ? bare(c.slice(0, i - 2).join(' ')) : '', address: { line1: i >= 2 ? c[i - 2] : '', city: c[i - 1], state: c[i], zip: zip }, units: count(c[after]) };
  }
  for (i = 0; i < n; i++) if (c[i].indexOf(',') >= 0 && /\d/.test(c[i])) return { name: bare(c.slice(0, i).join(' ')), text: c[i], units: count(c[i + 1]) };
  if (n >= 2 && typeof count(c[n - 1]) === 'number' && /\d{5}(?:-\d{4})?$/.test(c[n - 2])) { units = count(c[n - 1]); c = c.slice(0, -1); }
  return { name: '', text: c.join(', '), units: units };
}
/* one address line (bounded, bullet stripped, trimmed) → a row: its cells
   by position, else a trailing count, a leading "Name: " or "Name — ", and
   the address read from the right */
function lineRow(t) {
  var cells = lineCells(t), got = null, name = '', units = null;
  if (cells) { got = cells.length > 1 ? fromCells(cells) : { name: '', text: unText(cells[0]), units: null }; if (got.address) return got; t = trimEnd(got.text, true); name = got.name; units = got.units; }
  if (units == null) { var tail = unitTail(t); if (tail) { units = tail.units; t = tail.rest; } }
  t = t.trim();
  if (!name) {
    /* "Name: street…" always names the site. "Name — street…" only when the
       name is not itself a street and a house number follows: an emailed
       "1200 S Hwy 99 – Suite 100" (Outlook turns " - " into " – ") is one
       street, not a site called "1200 S Hwy 99" */
    var nm = /^([^,:]{1,120}?)\s*:\s+(\S.*)$/.exec(t), dm = nm ? null : /^(.{1,120}?)\s+[—–]\s+(\S.*)$/.exec(t);
    if (dm && !/^\d/.test(dm[1]) && /^\d/.test(dm[2])) nm = dm;
    if (nm && /\d/.test(nm[2])) { name = nm[1].trim(); t = nm[2]; }
  }
  return { name: name, address: splitAddress(t), units: units };
}
/* a line that is only column names ("Address", a one-column sheet's
   header): read past without a word */
function headerLine(t) { var cells = lineCells(t) || t.split(','); return cells.every(function (x) { x = unText(x); return !x || !!listField(x); }) && cells.some(function (x) { return !!unText(x); }); }
/* the pasted text → site rows. Table mode when the first line is a header
   with at least two known column names; otherwise one address per line. */
function parseSiteList(text) {
  var s = String(text == null ? '' : text);
  if (s.length > MAX_SITE_TEXT) throw fail(400, 'That list is too long (' + s.length + ' characters). Paste at most ' + MAX_SITE_ROWS + ' sites at a time, or split the file.');
  s = s.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  var lines = s.split('\n'), first = -1, top = [], rows = [], format = 'lines';
  for (var i = 0; i < lines.length; i++) if (lines[i].trim()) { first = i; break; }
  if (first < 0) return { format: format, rows: [], problems: ['Paste the list of site addresses, one per line, or a sheet with a header row'] };
  var sep = lines[first].indexOf('\t') >= 0 ? '\t' : ',', head = (csvRows(lines[first], sep)[0] || { cells: [] }).cells, idx = {}, hits = 0;
  head.forEach(function (h, j) { var f = listField(h); if (f && idx[f] === undefined) { idx[f] = j; hits++; } });
  if (hits >= 2) {
    format = 'table';
    if (idx.line1 === undefined) return { format: format, rows: [], problems: ['The sheet needs an address column (Address, Street or Address line 1)'] };
    var data = csvRows(s, sep).filter(function (r) { return r.line > first + 1; });
    if (data.length > MAX_SITE_ROWS) throw tooMany(data.length);
    data.forEach(function (r) {
      /* a cell is bounded like a line; our own CSV's ="04101" reads as 04101 */
      function cell(f) { return idx[f] === undefined ? '' : unText(String(r.cells[idx[f]] == null ? '' : r.cells[idx[f]]).slice(0, MAX_SITE_LINE)); }
      var street = cell('line1'), a;
      if (street && !cell('city') && !cell('state') && !cell('zip')) a = splitAddress(street);
      else a = { line1: street + (cell('line2') ? ', ' + cell('line2') : ''), city: cell('city'), state: cell('state'), zip: cell('zip') };
      /* a ZIP column Excel read as a number lost its leading zero, in the
         states whose ZIPs start with one */
      if (idx.zip !== undefined && /^\d{3,4}$/.test(a.zip) && ZERO_ZIP.indexOf(stateCode(a.state)) >= 0) a.zip = ('00' + a.zip).slice(-5);
      var row = checkSiteRow({ name: cell('name'), address: a, units: unitCell(cell('units')), ref: cell('ref') });
      row.line = r.line; row.named = !!row.name; rows.push(row);
    });
  } else {
    var picked = [];
    lines.forEach(function (raw, n) {
      if (raw.length > MAX_SITE_LINE) { top.push('Line ' + (n + 1) + ' is too long to be one address (' + raw.length + ' characters) and was left out'); return; }
      var t = trimEnd(raw.replace(/^\s*(?:>\s*)+/, '').replace(/^\s*(?:[-•*·▪◦‣–—]\s+|\(?\d{1,3}[.)]\s+)/, ''), true);
      if (!t.trim()) return;
      t = t.trim();
      /* an address has a number and a comma (or a ZIP); a greeting, a
         signature or "Please ship PO 77 to:" has not. A line of column
         names is a sheet's header, read past. */
      if (!/\d/.test(t) && headerLine(t)) return;
      if (!/\d/.test(t) || !(/,|\t/.test(t) || /\b\d{5}\b/.test(t))) { top.push('Line ' + (n + 1) + ' does not look like an address (street, city, state ZIP) and was left out: "' + clean(t, 60) + '"'); return; }
      picked.push({ line: n + 1, text: t });
    });
    if (picked.length > MAX_SITE_ROWS) throw tooMany(picked.length);
    picked.forEach(function (p) {
      var got = lineRow(p.text), row = checkSiteRow({ name: got.name, address: got.address, units: got.units });
      row.line = p.line; row.named = !!row.name; rows.push(row);
    });
  }
  /* the same street and ZIP twice is one place: a problem on the second */
  var firstAt = {};
  rows.forEach(function (r) {
    if (!r.address.line1 || !/^\d{5}/.test(r.address.zip)) return;
    var k = addressKey(r.address.line1, r.address.zip);
    if (firstAt[k]) r.problems.push('Listed twice: the same address as line ' + firstAt[k]); else firstAt[k] = r.line;
  });
  /* default names: "City, ST", or "City, ST · street" where two rows share
     the city */
  var perCity = {}; rows.forEach(function (r) { if (r.address.city) { var k = r.address.city.toLowerCase() + '|' + r.address.state; perCity[k] = (perCity[k] || 0) + 1; } });
  rows.forEach(function (r) {
    if (r.name) return;
    var a = r.address, k = a.city.toLowerCase() + '|' + a.state;
    r.name = clean(a.city ? defaultName(a) + (perCity[k] > 1 && a.line1 ? ' · ' + a.line1 : '') : (a.line1 || 'Line ' + r.line), 160);
  });
  if (!rows.length && !top.length) top.push('No addresses found');
  return { format: format, rows: rows, problems: top };
}
/* which rows are already sites on this account: the same street + 5-digit
   ZIP. A site with the same NAME and ZIP at another address is a clash to
   point out, not a match; sites-create names the new one apart. */
function matchSites(rows, existing, customerId) {
  var mine = (existing || []).filter(function (x) { return x && x.status !== 'inactive' && (x.customerId || null) === (customerId || null); }), byAddr = {}, byKey = {};
  mine.forEach(function (x) { var a = x.address || {}; if (a.line1 && a.zip) { var k = addressKey(a.line1, a.zip); if (!byAddr[k]) byAddr[k] = x; } byKey[siteKey(customerId, x.name, a.zip)] = x; });
  return (rows || []).map(function (r) {
    var out = Object.assign({}, r), a = r.address || {};
    out.exists = false; out.existingId = null; out.clash = false;
    if (r.problems && r.problems.length) { out.status = 'problem'; out.siteId = null; return out; }
    var hit = byAddr[addressKey(a.line1, a.zip)];
    if (hit) { out.exists = true; out.existingId = hit.id; out.existingName = hit.name; out.siteId = hit.id; out.status = 'exists'; out.warnings = []; return out; }
    var k = byKey[siteKey(customerId, r.name, a.zip)];
    if (k) { out.clash = true; out.note = 'Another site on this account is called "' + k.name + '" at this ZIP; this one will be added as a separate site. Rename one to tell them apart.'; }
    out.siteId = siteId(customerId, { name: r.name, address: a }); out.status = 'new';
    return out;
  });
}
function sitesPreview(text, existing, customerId) {
  var p = parseSiteList(text), rows = matchSites(p.rows, existing, customerId);
  return { format: p.format, rows: rows, problems: p.problems, summary: { rows: rows.length, new: rows.filter(function (r) { return r.status === 'new'; }).length, existing: rows.filter(function (r) { return r.status === 'exists'; }).length, problems: rows.filter(function (r) { return r.status === 'problem'; }).length } };
}
/* the rows a preview would geocode (new ones only), as one-line addresses;
   withGeo lays the answers back on: a hit is { lat, lng, matchedAddress },
   a miss null, a row not looked up (over the budget) lookedUp false */
function toLocate(rows) { var out = []; (rows || []).forEach(function (r, i) { if (r.status === 'new') out.push({ i: i, address: oneLine(r.address) }); }); return out; }
function withGeo(rows, targets, hits) {
  (rows || []).forEach(function (r) { r.geo = null; r.lookedUp = false; });
  (targets || []).forEach(function (t, j) { var h = hits ? hits[j] : undefined, r = rows[t.i]; if (h === undefined) return; r.lookedUp = true; r.geo = h && isFinite(h.lat) && isFinite(h.lng) ? { lat: Number(h.lat), lng: Number(h.lng), matchedAddress: String(h.matched || '') } : null; });
  return rows;
}
/* sites-create's input: each row through the ONE validator and site() */
function siteListInputs(rows, customerId) {
  if (!Array.isArray(rows) || !rows.length) throw fail(400, 'No sites to create');
  if (rows.length > MAX_SITE_ROWS) throw fail(400, 'At most ' + MAX_SITE_ROWS + ' sites at a time');
  return rows.map(function (r, i) {
    r = r || {}; var chk = checkSiteRow({ name: r.name, address: r.address, ref: r.ref }), label = 'Row ' + (i + 1) + (chk.name ? ' (' + chk.name + ')' : '') + ': ';
    if (chk.problems.length) throw fail(400, label + chk.problems.join('; ') + '. Nothing was created.');
    try { return site({ name: chk.name || defaultName(chk.address), customerId: customerId, address: chk.address, lat: r.lat, lng: r.lng, ref: chk.ref }); }
    catch (e) { throw fail(e.status || 400, label + e.message + '. Nothing was created.'); }
  });
}
/* which records are already there (by address, on the account) and which
   to create, each with its id candidates: siteId(), then -2 … -9. The
   endpoint reads the candidates inside its transaction and takes the first
   free one — an id taken by another account, another address or an
   inactive site is never reported as "exists". */
function placeSites(recs, have, customerId) {
  var mine = (have || []).filter(function (x) { return x && x.status !== 'inactive' && (x.customerId || null) === (customerId || null); }), byAddr = {}, seen = {}, existing = [], create = [];
  mine.forEach(function (x) { var a = x.address || {}; if (a.line1 && a.zip) { var k = addressKey(a.line1, a.zip); if (!byAddr[k]) byAddr[k] = x; } });
  (recs || []).forEach(function (rec, i) {
    var k = addressKey(rec.address.line1, rec.address.zip), hit = byAddr[k];
    if (hit) { if (!seen['id:' + hit.id]) { seen['id:' + hit.id] = true; existing.push(hit); } return; }
    if (seen[k]) return; seen[k] = true;
    var base = siteId(customerId, rec), ids = [base]; for (var n = 2; n <= 9; n++) ids.push(base + '-' + n);
    create.push({ row: i, rec: rec, candidates: ids });
  });
  return { existing: existing, create: create };
}

/* ── may this unit be given a destination now? ONE rule for the bulk
   plan, both GETs, the register and the sample. A received unit is left
   out: receipt is what honours a plan (apply 'receive'), so a plan on a
   unit already received would read "going to" forever — it is assigned to
   its site when it gets there instead. */
function plannable(unit) {
  var c = custodyOf(unit);
  if (!unit || !unit.shipUnit) return { ok: false, why: 'component', say: 'A component travels with its assembly' };
  if (c.state === 'scrapped') return { ok: false, why: 'scrapped', say: 'Scrapped' };
  if (c.state === 'lost') return { ok: false, why: 'lost', say: 'Marked lost' };
  if (c.siteId) return { ok: false, why: 'bound', say: label(c.status).charAt(0).toUpperCase() + label(c.status).slice(1) + ' at ' + (c.siteName || c.siteId) };
  if (c.status === 'received') return { ok: false, why: 'received', say: 'Received already: assign it to its site when it gets there' };
  if (['', 'in_transit', 'delivered'].indexOf(c.status) < 0) return { ok: false, why: 'status', say: 'Already ' + label(c.status) };
  return { ok: true, why: null, say: '' };
}
/* the customer account a unit is already stamped for, if any: its custody
   stamp, else its own field. A unit stamped for another account is left
   out of a plan on either door (the office: api/logic-custody.js refuse;
   the customer: api/my-sites.js) and is never re-stamped by one. */
function stampedAccount(unit) { var c = custodyOf(unit); return c.customerId || (unit && unit.customerId) || null; }
/* an order's units at a glance, for the order pickers */
function unitCounts(units) {
  var o = { units: 0, eligible: 0, building: 0, planned: 0 };
  (units || []).forEach(function (u) { if (!u || !u.shipUnit) return; var c = custodyOf(u); o.units++; if (plannable(u).ok) o.eligible++; if (!c.status && u.at !== 'ready') o.building++; if (c.plannedSiteId && !c.siteId) o.planned++; });
  return o;
}
/* the sites a plan names, each one that the caller may use; `known` is the
   list the endpoint has already scoped (the account's sites) */
function planSites(list, known, notFound) {
  if (!Array.isArray(list) || !list.length) throw fail(400, 'Choose the sites');
  if (list.length > MAX_SITE_ROWS) throw fail(400, 'At most ' + MAX_SITE_ROWS + ' sites in one plan');
  var by = {}; (known || []).forEach(function (x) { if (x && x.status !== 'inactive') by[x.id] = x; });
  return list.map(function (x) { var id = clean(x && x.siteId, 160), s = by[id]; if (!s) throw fail(404, notFound || 'Site not found'); return { siteId: s.id, name: s.name, units: x.units == null || x.units === '' ? null : x.units }; });
}
/* Spread an order's units over sites, in site order, lowest serials first.
   `sites` [{ siteId, name, units }]: every number given → exactly those
   (never more than the order has); none → an even spread, one more to the
   first N mod S; mixed → the numbered first, the rest spread evenly over
   the others. A site's number counts what is already planned there, and
   what of this order is already bound there. A re-run is idempotent: what
   is planned stays; a lowered number keeps the lowest serials and RELEASES
   the rest (their destination is cleared unless another site takes them).
   A unit already going to a site NOT on the list is left alone and
   reported, unless opts.replan. opts.exclude(unit) → a reason refuses a
   unit the caller may not plan (the office: another account's unit).
   Pure; the endpoint recomputes it from orderId + sites on apply, so the
   browser never sends serial → site pairs. */
function spread(units, sites, opts) {
  opts = opts || {};
  var problems = [], list = [], inList = {};
  (sites || []).forEach(function (x, i) {
    var id = clean(x && x.siteId, 160), nm = clean(x && x.name, 160) || id;
    if (!id) { problems.push('Site ' + (i + 1) + ' has no id'); return; }
    if (inList[id]) { problems.push(nm + ' is listed twice'); return; }
    var n = x.units == null || x.units === '' ? null : Number(x.units);
    if (n !== null && !(isFinite(n) && Math.floor(n) === n && n >= 0 && n <= 10000)) { problems.push('Units for ' + nm + ' must be a whole number from 0 to 10,000'); n = null; }
    inList[id] = { siteId: id, name: nm, asked: n, current: [], placed: 0 }; list.push(inList[id]);
  });
  if (!list.length && !problems.length) problems.push('Choose at least one site');
  if (list.length > MAX_SITE_ROWS) problems.push('At most ' + MAX_SITE_ROWS + ' sites in one plan');
  var all = (units || []).filter(function (u) { return u && u.shipUnit; }).slice().sort(bySerial), notPlanned = [], elsewhere = [], pool = [];
  all.forEach(function (u) {
    var c = custodyOf(u), p = plannable(u), no = p.ok && opts.exclude ? opts.exclude(u) : null;
    if (!p.ok || no) { if (p.why === 'bound' && inList[c.siteId]) inList[c.siteId].placed++; notPlanned.push({ serial: u.serial, why: no ? 'account' : p.why, say: no || p.say }); return; }
    if (c.plannedSiteId && inList[c.plannedSiteId]) { inList[c.plannedSiteId].current.push(u); return; }
    if (c.plannedSiteId && !opts.replan) { elsewhere.push({ serial: u.serial, siteId: c.plannedSiteId, siteName: c.plannedSiteName || c.plannedSiteId }); return; }
    pool.push(u);
  });
  var movable = pool.length, placed = 0; list.forEach(function (s) { movable += s.current.length; placed += s.placed; });
  var total = movable + placed, askedSum = 0, open = [];
  list.forEach(function (s) { if (s.asked === null) open.push(s); else { askedSum += s.asked; s.target = s.asked; } });
  if (askedSum > total) problems.push('The list asks for ' + askedSum + ' unit' + (askedSum === 1 ? '' : 's') + ', but only ' + total + ' of this order’s units can go to these sites' + (elsewhere.length || notPlanned.length ? ' (' + [elsewhere.length ? elsewhere.length + ' already going to other sites' : '', notPlanned.length ? notPlanned.length + ' cannot be planned' : ''].filter(Boolean).join(', ') + ')' : '') + '. Lower the numbers.');
  var rest = Math.max(0, total - askedSum), each = open.length ? Math.floor(rest / open.length) : 0, extra = open.length ? rest % open.length : 0;
  open.forEach(function (s, i) { s.target = each + (i < extra ? 1 : 0); });
  var perSite = function (withPlan) { return list.map(function (s) { return { siteId: s.siteId, name: s.name, asked: s.asked, count: s.target == null ? 0 : s.target, placed: s.placed, planned: withPlan ? s.planned : s.current.length, short: withPlan ? s.short : 0 }; }); };
  if (problems.length) return { assignments: [], perSite: perSite(false), leftover: [], released: [], elsewhere: elsewhere, notPlanned: notPlanned, problems: problems, eligible: movable, writes: 0, planKey: '' };
  var free = pool.slice(), back = {};
  list.forEach(function (s) { var room = Math.max(0, s.target - s.placed); s.keep = s.current.slice(0, room); s.current.slice(room).forEach(function (u) { back[u.serial] = s; free.push(u); }); });
  free.sort(bySerial);
  var assignments = [], k = 0;
  list.forEach(function (s) {
    var room = Math.max(0, s.target - s.placed), take = room - s.keep.length, got = 0;
    s.keep.forEach(function (u) { assignments.push({ serial: u.serial, siteId: s.siteId, siteName: s.name, how: 'unchanged', from: s.siteId }); });
    while (got < take && k < free.length) { var u = free[k++], was = custodyOf(u).plannedSiteId || null; assignments.push({ serial: u.serial, siteId: s.siteId, siteName: s.name, how: !was ? 'new' : was === s.siteId ? 'unchanged' : 'changed', from: was }); got++; }
    s.planned = s.keep.length + got; s.short = Math.max(0, take - got);
  });
  /* what no site took: a unit a lowered number let go is RELEASED (its
     destination cleared); a unit that was going to a site not on the list
     (only in the pool with replan) is not touched, so it is reported as
     still going there, never as "without a site"; the rest is left over */
  var rem = free.slice(k), released = [], leftover = [];
  rem.forEach(function (u) {
    var s = back[u.serial], c = custodyOf(u);
    if (s) { released.push({ serial: u.serial, siteId: s.siteId, siteName: s.name }); leftover.push(u.serial); }
    else if (c.plannedSiteId) elsewhere.push({ serial: u.serial, siteId: c.plannedSiteId, siteName: c.plannedSiteName || c.plannedSiteId, unused: true });
    else leftover.push(u.serial);
  });
  var writes = assignments.filter(function (a) { return a.how !== 'unchanged'; }).length + released.length;
  var out = { assignments: assignments, perSite: perSite(true), leftover: leftover, released: released, elsewhere: elsewhere, notPlanned: notPlanned, problems: [], eligible: movable, writes: writes };
  out.planKey = planKey(out);
  return out;
}
/* what apply checks against the preview: the same serial → site mapping.
   The released units are NOT in it: plan-apply writes at most 200 units a
   call, releases last, and a unit released in one call is (rightly) no
   longer "released" when the next call recomputes the plan — so a key over
   them changed between the calls of ONE apply and the second call was
   refused after the first had written. The assignments are the same on
   every call of an apply (a written unit is "unchanged" at its site, a
   released one returns to the pool the others take from in the same
   order); a release that no longer happens is a write fewer, never one
   nobody saw, and each unit is re-read in its transaction anyway. */
function planKey(pl) {
  var s = (pl.assignments || []).map(function (a) { return a.serial + '>' + a.siteId; }).sort().join('|'), h = 5381;
  for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return 'p' + h.toString(36) + '.' + (pl.assignments || []).length;
}
/* does the recomputed plan still say what the preview said? The body may
   carry the preview's planKey, or its perSite counts; either one differing
   is "changed since your preview". Neither sent: nothing to compare. */
function planMatches(pl, body) {
  body = body || {};
  if (body.planKey && body.planKey !== pl.planKey) return false;
  if (Array.isArray(body.perSite)) { var now = {}; (pl.perSite || []).forEach(function (s) { now[s.siteId] = s.count; }); if (body.perSite.length !== (pl.perSite || []).length || body.perSite.some(function (s) { return !s || now[s.siteId] !== Number(s.count); })) return false; }
  return true;
}
/* what plan-apply writes, in order: new and changed destinations, then the
   released ones (cleared) — at most MAX_PLAN_UNITS per call */
function planWrites(pl) {
  return (pl.assignments || []).filter(function (a) { return a.how !== 'unchanged'; }).map(function (a) { return { serial: a.serial, siteId: a.siteId, siteName: a.siteName, how: a.how }; })
    .concat((pl.released || []).map(function (r) { return { serial: r.serial, siteId: '', siteName: '', how: 'released', from: r.siteId }; }));
}
/* the assignments as they stand after apply: a skipped unit says why, one
   left for the next call says so */
function planResult(pl, applied, skipped) {
  var sk = {}, done = {}; (skipped || []).forEach(function (x) { sk[x.serial] = x.why; }); (applied || []).forEach(function (x) { done[x.serial] = true; });
  return (pl.assignments || []).map(function (a) { var o = { serial: a.serial, siteId: a.siteId, siteName: a.siteName, how: a.how }; if (sk[a.serial]) { o.how = 'skipped'; o.why = sk[a.serial]; } else if (a.how !== 'unchanged' && !done[a.serial]) o.how = 'pending'; return o; });
}

module.exports = { STATUSES: STATUSES, STATES: STATES, MOVES: MOVES, LABELS: LABELS, TRIGGERS: TRIGGERS, COLUMNS: COLUMNS, TEMPLATE_HEADERS: TEMPLATE_HEADERS, MAX_ROWS: MAX_ROWS,
  custodyOf: custodyOf, label: label, serial: serial, day: day, judge: judge, apply: apply, state: state, destination: destination, confirm: confirm, confirmation: confirmation, detail: detail, DETAIL_FIELDS: DETAIL_FIELDS, REGISTER_COLUMNS: REGISTER_COLUMNS, registerRow: registerRow,
  templatesOf: templatesOf, template: template, coverageOf: coverageOf, coverageWithInheritance: coverageWithInheritance, inherited: inherited, addMonths: addMonths,
  exceptions: exceptions, reconcile: reconcile, csvTemplate: csvTemplate, csvRows: csvRows, parseCsv: parseCsv, guessMapping: guessMapping, mapRow: mapRow, plan: plan, siteKey: siteKey, site: site, siteId: siteId,
  MAX_SITE_ROWS: MAX_SITE_ROWS, MAX_PLAN_UNITS: MAX_PLAN_UNITS, MAX_SITE_TEXT: MAX_SITE_TEXT, MAX_SITE_LINE: MAX_SITE_LINE, US_STATES: US_STATES, stateCode: stateCode, addressKey: addressKey, samePlace: samePlace, naturalCompare: naturalCompare, oneLine: oneLine, splitAddress: splitAddress, checkSiteRow: checkSiteRow,
  trimEnd: trimEnd, unitTail: unitTail, unText: unText, parseSiteList: parseSiteList, matchSites: matchSites, sitesPreview: sitesPreview, toLocate: toLocate, withGeo: withGeo, siteListInputs: siteListInputs, placeSites: placeSites,
  plannable: plannable, stampedAccount: stampedAccount, unitCounts: unitCounts, planSites: planSites, spread: spread, planKey: planKey, planMatches: planMatches, planWrites: planWrites, planResult: planResult };
