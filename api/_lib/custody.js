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
   paste from a sheet is accepted too */
function parseCsv(text) {
  var s = String(text || '').replace(/^﻿/, ''), rows = [], row = [], field = '', q = false, sep = s.indexOf('\t') >= 0 && s.indexOf(',') < 0 ? '\t' : ',';
  for (var i = 0; i < s.length; i++) {
    var ch = s[i];
    if (q) { if (ch === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += ch; continue; }
    if (ch === '"') q = true; else if (ch === sep) { row.push(field); field = ''; } else if (ch === '\n' || ch === '\r') { if (ch === '\r' && s[i + 1] === '\n') i++; row.push(field); field = ''; if (row.some(function (f) { return f.trim() !== ''; })) rows.push(row); row = []; } else field += ch;
  }
  row.push(field); if (row.some(function (f) { return f.trim() !== ''; })) rows.push(row);
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
        var key = siteKey(ctx.customerId || (unit.custody && unit.custody.customerId) || unit.customerId || null, r.siteName, r.zip);
        site = ctx.byKey[key] || newSites[key];
        if (!site) {
          if (!ctx.allowNewSites) throw fail(400, 'Site "' + r.siteName + '" does not exist; add it first or allow new sites');
          if (!r.line1 && !r.city) throw fail(400, 'A new site needs an address');
          site = newSites[key] = { id: 'site_' + key.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60), name: r.siteName, customerId: ctx.customerId || null, address: { line1: r.line1 || '', city: r.city || '', state: r.state || '', zip: r.zip || '', country: 'US' }, endCustomer: r.endCustomer || '', interconnection: { utility: r.utility || '', meterNo: r.meter || '', poi: r.poi || '' }, isNew: true };
          item.newSite = true;
        }
      }
      if (site) { item.siteId = site.id; item.siteName = site.name; }
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
  var lat = b.lat == null || b.lat === '' ? null : Number(b.lat), lng = b.lng == null || b.lng === '' ? null : Number(b.lng);
  if ((lat != null && !(lat >= -90 && lat <= 90)) || (lng != null && !(lng >= -180 && lng <= 180))) throw fail(400, 'Latitude or longitude out of range');
  var out = { name: name, customerId: clean(b.customerId, 80) || (existing && existing.customerId) || null, endCustomer: clean(b.endCustomer, 160),
    address: { line1: clean(a.line1, 200), line2: clean(a.line2, 200), city: clean(a.city, 100), state: clean(a.state, 40), zip: clean(a.zip, 20), country: clean(a.country, 40) || 'US' },
    lat: lat, lng: lng, interconnection: { utility: clean(ic.utility, 120), accountNo: clean(ic.accountNo, 80), meterNo: clean(ic.meterNo, 80), poi: clean(ic.poi, 200), serviceVoltage: clean(ic.serviceVoltage, 40), serviceKw: ic.serviceKw == null || ic.serviceKw === '' ? null : Number(ic.serviceKw), agreementRef: clean(ic.agreementRef, 120) },
    contact: { name: clean(b.contact && b.contact.name, 120), phone: clean(b.contact && b.contact.phone, 40), email: clean(b.contact && b.contact.email, 160) },
    notes: clean(b.notes, 1000), status: b.status === 'inactive' ? 'inactive' : 'active', lifecycleSiteId: clean(b.lifecycleSiteId, 80) || null };
  if (out.interconnection.serviceKw != null && !(out.interconnection.serviceKw >= 0)) throw fail(400, 'Service kW must be a number');
  return out;
}
function siteId(customerId, s) { return 'site_' + siteKey(customerId, s.name, s.address && s.address.zip).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60); }

module.exports = { STATUSES: STATUSES, STATES: STATES, MOVES: MOVES, LABELS: LABELS, TRIGGERS: TRIGGERS, COLUMNS: COLUMNS, TEMPLATE_HEADERS: TEMPLATE_HEADERS, MAX_ROWS: MAX_ROWS,
  custodyOf: custodyOf, label: label, serial: serial, day: day, judge: judge, apply: apply, state: state, destination: destination, confirm: confirm, confirmation: confirmation,
  templatesOf: templatesOf, template: template, coverageOf: coverageOf, coverageWithInheritance: coverageWithInheritance, inherited: inherited, addMonths: addMonths,
  exceptions: exceptions, reconcile: reconcile, csvTemplate: csvTemplate, parseCsv: parseCsv, guessMapping: guessMapping, mapRow: mapRow, plan: plan, siteKey: siteKey, site: site, siteId: siteId };
