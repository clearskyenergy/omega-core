/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/design-order.js — a drawing becomes one purchase order per OEM
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   PURE. No Firestore and no buyer accounts. The editor's BOM and Omega
   Prime's quote are the same shape here: lines with a sku, a quantity and
   a manufacturer. A published catalog sku becomes an order line in that
   OEM's workspace. A trench, a conduit run or anything the catalog does
   not sell stays on the order as part of the drawing and is not dropped
   and not retyped.

   One order per OEM per project (ds_ + a hash of the two). Filing again
   opens the same order. The drawing's estimate is recorded as an estimate.
   It is not an approved customer price.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var crypto = require('crypto');
var Pt = require('./portal');

var STATE_NAMES = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA',
  hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA',
  kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
  massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS',
  missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK',
  oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT',
  virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI',
  wyoming: 'WY', 'district of columbia': 'DC'
};
var ABBR = {};
Object.keys(STATE_NAMES).forEach(function (k) { ABBR[STATE_NAMES[k]] = true; });

function clip(v, n) { return String(v || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, n); }
function skuOk(s) {
  return /^[A-Za-z0-9._-]{1,100}$/.test(s) && ['__proto__', 'constructor', 'prototype'].indexOf(s) < 0;
}
function wholeQty(q) {
  var n = Number(q);
  if (!isFinite(n) || n <= 0 || n > 10000) return null;
  var r = Math.round(n);
  if (Math.abs(n - r) > 0.001 || r < 1 || r > 10000) return null;
  return r;
}
function dollarsToCents(v) {
  var n = Number(v);
  if (!isFinite(n) || n <= 0 || n > 100000000) return null;
  return Math.round(n * 100);
}
/* The drawing's own total, in cents: Prime's run, else Site Map's Run
   capex, else a total the caller already computed. Never a typed price. */
function estimateFrom(project, body) {
  project = project || {}; body = body || {};
  var run = project.prime && project.prime.run;
  var usd = null;
  if (run && Number(run.totalUsd) > 0) usd = Number(run.totalUsd);
  else if (Number(project.capex) > 0) usd = Number(project.capex);
  else if (Number(body.estimateUsd) > 0) usd = Number(body.estimateUsd);
  return dollarsToCents(usd);
}
function orderId(orgId, projectId) {
  return 'ds_' + crypto.createHash('sha256').update(String(orgId) + ':' + String(projectId)).digest('hex').slice(0, 40);
}
function orderNo(projectId) {
  var s = String(projectId || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 12).toUpperCase();
  return 'DS-' + (s || 'PROJECT');
}
function catalogOrgs(lines, designerOrgId) {
  var ids = {};
  if (designerOrgId) ids[String(designerOrgId)] = true;
  (lines || []).forEach(function (l) { if (l && l.vendorOrgId) ids[String(l.vendorOrgId)] = true; });
  return Object.keys(ids);
}
function findProduct(list, sku) {
  var hit = null;
  (list || []).forEach(function (p) {
    if (hit || !p) return;
    var key = p.sku || p.key;
    if (key !== sku) return;
    var row = { sku: key, name: p.name || key, active: p.active, placeholder: p.placeholder, kind: p.kind || 'product' };
    if (Pt.orderable(row)) hit = row;
  });
  return hit;
}
/* "100 Main St, Chicago, IL 60601" and "100 Main St, Austin, Texas 78701".
   A ZIP or state the project already holds fills a gap. A city that is
   not in the address stays blank. Nothing here invents one. */
function parseAddress(raw, hints) {
  hints = hints || {};
  var src = clip(raw, 400);
  var zip = String(hints.zip || '').replace(/\D/g, '').slice(0, 5);
  var state = clip(hints.state, 80).toUpperCase();
  if (!ABBR[state]) state = '';
  var city = clip(hints.city, 100);
  var zipIn = src.match(/\b(\d{5})(?:-\d{4})?\b/);
  if (!zip && zipIn) zip = zipIn[1];
  var rest = src.replace(/\b\d{5}(?:-\d{4})?\b/, ' ').replace(/\s+/g, ' ').trim().replace(/[,\s]+$/, '');
  var names = Object.keys(STATE_NAMES).sort(function (a, b) { return b.length - a.length; });
  var found = false, i;
  for (i = 0; i < names.length; i++) {
    var re = new RegExp('\\b' + names[i].replace(/\s+/g, '\\s+') + '\\b', 'i');
    if (!re.test(rest)) continue;
    if (!state) state = STATE_NAMES[names[i]];
    rest = rest.replace(re, ' ').replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', ').trim().replace(/^[,\s]+|[,\s]+$/g, '');
    found = true;
    break;
  }
  if (!found) {
    var ab = rest.match(/,\s*([A-Za-z]{2})\s*$/) || rest.match(/\s([A-Za-z]{2})\s*$/);
    if (ab && ABBR[ab[1].toUpperCase()]) {
      if (!state) state = ab[1].toUpperCase();
      rest = rest.slice(0, ab.index).trim().replace(/[,\s]+$/, '');
    }
  }
  var parts = rest.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  var line1 = '';
  if (parts.length >= 2) { if (!city) city = parts.pop(); line1 = parts.join(', '); }
  else if (parts.length === 1) line1 = parts[0];
  if (!line1) line1 = src;
  return {
    name: clip(hints.name, 120) || 'Project site',
    line1: clip(line1, 200),
    city: clip(city, 100),
    state: clip(state, 80),
    zip: clip(zip, 30),
    country: 'US',
    raw: src
  };
}
function annotate(l, catalogs, designer) {
  var sku = clip(l && l.sku, 100);
  var qty = Number(l && l.qty);
  var row = {
    sku: sku, description: clip(l && l.description, 300), qty: isFinite(qty) ? qty : 0,
    unit: clip(l && l.unit, 20) || 'ea', manufacturer: clip(l && l.manufacturer, 120),
    vendorOrgId: l && l.vendorOrgId ? String(l.vendorOrgId) : '', onOrder: false, reason: '', orgId: '', wholeQty: 0, product: null
  };
  if (!sku) { row.reason = 'no-sku'; return row; }
  if (!skuOk(sku)) { row.reason = 'sku'; return row; }
  var q = wholeQty(l.qty);
  if (q == null) { row.reason = 'qty'; return row; }
  row.wholeQty = q;
  var vendor = row.vendorOrgId;
  var target = vendor && vendor !== designer ? vendor : designer;
  if (!target) { row.reason = 'no-catalog'; return row; }
  var prod = findProduct(catalogs[target], sku);
  if (!prod) { row.reason = 'unpublished'; return row; }
  row.onOrder = true; row.orgId = target; row.product = prod; row.reason = '';
  return row;
}
function lineView(l, org) {
  var on = !!(l.onOrder && l.orgId === org);
  var row = { sku: l.sku, description: l.description, qty: l.qty, unit: l.unit, manufacturer: l.manufacturer, onOrder: on };
  if (!on) row.reason = l.onOrder && l.orgId !== org ? 'other-order' : (l.reason || 'not-ordered');
  return row;
}
function draft(spec) {
  spec = spec || {};
  var lines = Array.isArray(spec.lines) ? spec.lines : [];
  var catalogs = spec.catalogs || {};
  var designer = String(spec.designerOrgId || '');
  var project = spec.project || {};
  var addr = parseAddress(project.address || '', { zip: project.zip, state: project.state, city: project.city, name: project.name });
  var annotated = lines.map(function (l) { return annotate(l, catalogs, designer); });
  var byOrg = {};
  annotated.forEach(function (l) {
    if (!l.onOrder || !l.orgId) return;
    (byOrg[l.orgId] = byOrg[l.orgId] || []).push(l);
  });
  var names = spec.orgNames || {};
  var estimate = spec.estimateCents == null ? null : (function () {
    var n = Math.round(Number(spec.estimateCents));
    return isFinite(n) && n > 0 ? n : null;
  })();
  var orders = Object.keys(byOrg).sort().map(function (org) {
    var map = {};
    byOrg[org].forEach(function (l) {
      if (!map[l.sku]) map[l.sku] = { sku: l.sku, name: clip(l.product.name || l.sku, 200), kind: l.product.kind === 'service' ? 'service' : 'product', qty: 0 };
      map[l.sku].qty += l.wholeQty;
    });
    var items = Object.keys(map).sort().map(function (k) { return map[k]; }).filter(function (it) { return it.qty >= 1 && it.qty <= 10000; });
    var drawn = annotated.map(function (l) { return lineView(l, org); });
    return {
      orgId: org,
      orgName: names[org] || org,
      orderNo: orderNo(project.id),
      items: items,
      destination: {
        id: 'site',
        address: {
          name: addr.name, line1: addr.line1 || addr.raw || 'Address on the drawing',
          city: addr.city, state: addr.state, zip: addr.zip, country: 'US'
        },
        requestedDate: null,
        items: items.map(function (it) { return { sku: it.sku, qty: it.qty }; })
      },
      design: {
        projectId: String(project.id || ''),
        projectName: clip(project.name, 200),
        address: addr.raw || clip(project.address, 400),
        lines: drawn,
        estimateCents: estimate,
        rfqId: spec.rfqId || null
      }
    };
  });
  return {
    orders: orders,
    unmatched: annotated.filter(function (l) { return !l.onOrder; }).map(function (l) { return lineView(l, ''); })
  };
}
function documentOf(opts) {
  var one = opts.order, addr = one.destination.address;
  return {
    orgId: one.orgId,
    orderNo: one.orderNo,
    status: 'new',
    source: 'design',
    projectId: one.design.projectId,
    fulfilledBy: 'clearsky',
    items: one.items,
    system: {},
    customer: {
      email: '',
      name: '',
      company: '',
      phone: '',
      address: addr,
      notes: ''
    },
    purchaseOrder: { number: one.orderNo, submittedBy: opts.email, submittedAt: opts.now },
    delivery: { version: 1, revision: 0, destinations: [one.destination], legs: [] },
    requestedTerms: { depositPct: 30, dueDays: 0 },
    design: {
      projectId: one.design.projectId,
      projectName: one.design.projectName || '',
      address: one.design.address || '',
      lines: one.design.lines,
      estimateCents: one.design.estimateCents == null ? null : one.design.estimateCents,
      rfqId: one.design.rfqId || null
    },
    history: [{ at: opts.now, by: opts.email, what: 'Opened from the drawing. Address, lines and the estimate came with the project.' }],
    createdAt: opts.createdAt,
    updatedAt: opts.createdAt
  };
}
function response(id, data, callerOrg, orgName) {
  data = data || {};
  var same = String(callerOrg || '') === String(data.orgId || '');
  var row = {
    id: id, orgId: data.orgId, orgName: orgName || data.orgId, orderNo: data.orderNo,
    sameWorkspace: same, lines: Array.isArray(data.items) ? data.items.length : 0
  };
  if (same) row.href = '/omega-logic?org=' + encodeURIComponent(data.orgId) + '&order=' + encodeURIComponent(id) + '#orders';
  return row;
}
function view(o) {
  if (!o || !o.design || typeof o.design !== 'object') return null;
  var d = o.design;
  var lines = Array.isArray(d.lines) ? d.lines.map(function (l) {
    l = l || {};
    var row = {
      sku: String(l.sku || ''), description: String(l.description || ''), qty: l.qty,
      unit: String(l.unit || ''), manufacturer: String(l.manufacturer || ''), onOrder: l.onOrder === true
    };
    if (!row.onOrder && l.reason) row.reason = String(l.reason);
    return row;
  }) : [];
  var est = Number(d.estimateCents);
  return {
    projectId: d.projectId ? String(d.projectId) : '',
    projectName: String(d.projectName || ''),
    address: String(d.address || ''),
    estimateCents: isFinite(est) && est > 0 ? Math.round(est) : null,
    rfqId: d.rfqId ? String(d.rfqId) : null,
    lines: lines,
    unmatched: lines.filter(function (l) { return !l.onOrder; })
  };
}
function shipTo(o) {
  var dest = o && o.delivery && o.delivery.destinations && o.delivery.destinations[0];
  var a = dest && dest.address;
  if (!a) return null;
  return { name: a.name || '', line1: a.line1 || '', city: a.city || '', state: a.state || '', zip: a.zip || '', country: a.country || '' };
}

module.exports = {
  parseAddress: parseAddress, draft: draft, view: view, shipTo: shipTo, orderId: orderId, orderNo: orderNo,
  documentOf: documentOf, response: response, dollarsToCents: dollarsToCents, estimateFrom: estimateFrom,
  catalogOrgs: catalogOrgs
};
