/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   freight.js — one order's FREIGHT PLAN: every shipping unit with the site
   it is going to (the MASTER LIST), the sites grouped into LANES a
   logistics partner can price, the quotes the office records per lane, and
   what accepting one plans on the ledger.

   Built ON what exists, not beside it:
     plant_units/{org__serial}.custody     plannedSiteId / siteId (bulk sites)
     omega_orgs/{org}/sites/{siteId}       address, lat/lng, contact, ref
     orders/{id}.delivery                  destinations[] and legs[] (the
                                           ledger, api/logic-logistics.js)
     storefront/config.products[]          weightLb, widthFt, depthFt,
                                           heightFt, freightClass, stackable,
                                           handlingNote (shipping-fields.js)
     omega_orgs/{org}/fulfillment/config.freight.origin   the ship-from
     omega_orgs/{org}/freight_quotes/{id}  quotes, append-only (Admin SDK)

   LANES are US regions, one fixed map, in this order:
     NORTHEAST      Northeast            CT MA ME NH NJ NY PA RI VT
     MIDATLANTIC    Mid-Atlantic         DC DE MD VA WV
     SOUTHEAST      Southeast            AL FL GA KY MS NC SC TN
     GREATLAKES     Great Lakes          IL IN MI OH WI
     CENTRALPLAINS  Central Plains       IA KS MN MO ND NE SD
     SOUTHCENTRAL   South Central        AR LA OK TX
     MOUNTAIN       Mountain             AZ CO ID MT NM NV UT WY
     PACIFIC        Pacific              CA OR WA
     ALASKA         Alaska (ocean/air)   AK
     HAWAII         Hawaii (ocean/air)   HI
     PUERTORICO     Puerto Rico (ocean)  PR
     CHECK          Address to check     anything else (no state, another country)
   A lane KEY is never a state's two letters: it goes into every load id
   Accept names (FRT-<order>-<lane>-<n>-S<k>), which a carrier and the
   customer read, and "NE" or "SC" would read as Nebraska or South Carolina.
   Within a lane the stops that still need freight are ordered
   nearest-neighbour from the ORIGIN by straight-line (haversine) miles when
   the origin and the stop both have a map pin; a stop with no pin is
   appended in state order (state, city, name). Stops whose units are all
   booked or shipped follow, unnumbered by distance.

   Pure: no Firestore, no network, no clock but the `now` handed in. It
   holds no pricing logic (a quote is a number the carrier gave the office,
   recorded as typed) and it never reads a list price, a supplier, a cost
   basis or a margin. Bundled into the public sandbox, so ES5 and only
   ./admin (httpError, stubbed there), ./custody and ./shipping-fields —
   never order-lifecycle.js or logic-policy.js (server-only). */
'use strict';
var A = require('./admin'), C = require('./custody'), SF = require('./shipping-fields');

/* ── regions ──────────────────────────────────────────────────────────── */
var REGIONS = [
  { key: 'NORTHEAST', label: 'Northeast', states: ['CT', 'MA', 'ME', 'NH', 'NJ', 'NY', 'PA', 'RI', 'VT'] },
  { key: 'MIDATLANTIC', label: 'Mid-Atlantic', states: ['DC', 'DE', 'MD', 'VA', 'WV'] },
  { key: 'SOUTHEAST', label: 'Southeast', states: ['AL', 'FL', 'GA', 'KY', 'MS', 'NC', 'SC', 'TN'] },
  { key: 'GREATLAKES', label: 'Great Lakes', states: ['IL', 'IN', 'MI', 'OH', 'WI'] },
  { key: 'CENTRALPLAINS', label: 'Central Plains', states: ['IA', 'KS', 'MN', 'MO', 'ND', 'NE', 'SD'] },
  { key: 'SOUTHCENTRAL', label: 'South Central', states: ['AR', 'LA', 'OK', 'TX'] },
  { key: 'MOUNTAIN', label: 'Mountain', states: ['AZ', 'CO', 'ID', 'MT', 'NM', 'NV', 'UT', 'WY'] },
  { key: 'PACIFIC', label: 'Pacific', states: ['CA', 'OR', 'WA'] },
  { key: 'ALASKA', label: 'Alaska (ocean/air)', states: ['AK'] },
  { key: 'HAWAII', label: 'Hawaii (ocean/air)', states: ['HI'] },
  { key: 'PUERTORICO', label: 'Puerto Rico (ocean)', states: ['PR'] },
  { key: 'CHECK', label: 'Address to check', states: [] }
];
var REGION_OF = {}, REGION_BY_KEY = {}, REGION_INDEX = {};
REGIONS.forEach(function (r, i) { REGION_BY_KEY[r.key] = r; REGION_INDEX[r.key] = i; r.states.forEach(function (s) { REGION_OF[s] = r.key; }); });
var US_COUNTRY = ['', 'US', 'USA', 'U.S.', 'U.S.A.', 'UNITED STATES', 'UNITED STATES OF AMERICA'];

var LOAD_ID = /^[A-Za-z0-9_-]{1,100}$/;
var QUOTE_ID = /^[A-Za-z0-9_-]{1,120}$/;
var MAX_STOP_UNITS = 100;    // the ledger's own cap on serials per load (order-lifecycle serials())
var MAX_QUOTE_UNITS = 400;   // one accept is one transaction
var EARTH_MILES = 3958.8;
var NOT = SF.NOT_ON_FILE;
var NOTICE = 'Weights, sizes and classes come from the product catalog; a value that is not on file says "not on file" and is never guessed. Miles are straight-line, not road miles. Nothing here books a carrier: record the quotes you get, and Accept plans the loads on this ledger.';
var FREIGHT_LABELS = { open: 'Needs freight', booked: 'Booked on load', shipped: 'Shipped', unassigned: 'No site yet', blocked: 'Cannot ship' };
var LANE_LABELS = { 'needs-quote': 'Needs a quote', quoted: 'Quoted', accepted: 'Quote accepted · loads planned', booked: 'Booked on the ledger', shipped: 'Shipped' };

function fail(s, m) { return A.httpError(s, m); }
function clean(v, n) { return String(v == null ? '' : v).replace(/^\s+|\s+$/g, '').slice(0, n || 160); }
/* free text a person typed: bounded, no control characters (a note may
   carry line breaks) */
function text(v, max, label, required, multiline) {
  if (v == null) v = '';
  if (typeof v !== 'string' && typeof v !== 'number') throw fail(400, label + ' must be text');
  var s = String(v);
  if ((multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/ : /[\u0000-\u001f\u007f]/).test(s)) throw fail(400, label + ' has characters that are not allowed');
  s = s.replace(/^\s+|\s+$/g, '');
  if (s.length > max) throw fail(400, label + ': at most ' + max + ' characters');
  if (required && !s) throw fail(400, label + ' is required');
  return s;
}
function regionOf(state, country) {
  var cc = String(country == null ? '' : country).replace(/^\s+|\s+$/g, '').toUpperCase();
  if (cc === 'PR' || cc === 'PUERTO RICO') return 'PUERTORICO';
  if (US_COUNTRY.indexOf(cc) < 0) return 'CHECK';
  return REGION_OF[C.stateCode(state)] || 'CHECK';
}
function laneKeyOf(k) { var s = String(k == null ? '' : k); if (!REGION_BY_KEY[s]) throw fail(400, 'Unknown lane'); return s; }
/* a day, from an ISO string, a Date or a Firestore Timestamp */
function dayOf(v) {
  if (!v) return null;
  if (typeof v === 'string') return /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null;
  if (typeof v.toDate === 'function') { try { return v.toDate().toISOString().slice(0, 10); } catch (e) { return null; } }
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  var sec = v._seconds != null ? v._seconds : v.seconds;
  return sec != null && isFinite(sec) ? new Date(sec * 1000).toISOString().slice(0, 10) : null;
}

/* the day a quote's "valid until" is judged against: the calendar day in
   Hawaii (UTC−10), the last US state to finish a day. A carrier's "valid
   until the 24th" is good through the end of the 24th wherever the office
   is; judged on the UTC day it would expire at 5pm Pacific / 8pm Eastern.
   The cost is a few hours of grace after midnight in the east, and the
   carrier confirms the rate when the load is booked anyway. The page's date
   picker uses the browser's own day, which is never before this one in the
   US, so a date it offers is never refused here. */
function quoteDay(now) {
  var t = Date.parse(String(now == null ? '' : now));
  return isFinite(t) ? new Date(t - 10 * 3600000).toISOString().slice(0, 10) : String(now == null ? '' : now).slice(0, 10);
}
/* where a stop is, for a price: the street as matched (C.addressKey), the
   city and the state — C.samePlace's terms. It is in a lane's key, so a
   site whose address is corrected (same site, new street) makes a price
   given for the old one stale, and Accept compares it again. */
function placeKey(a) {
  a = a || {};
  return C.addressKey(a.line1, a.zip) + '|' + String(a.city || '').replace(/^\s+|\s+$/g, '').toLowerCase() + '|' + (C.stateCode(a.state) || String(a.state || '').replace(/^\s+|\s+$/g, '').toUpperCase());
}
/* the address a quote's stop was priced for */
function quotedAt(s) { s = s || {}; return { line1: s.line1 || '', city: s.city || '', state: s.state || '', zip: s.zip || '' }; }
/* the load id Accept uses when the office leaves the box blank:
   FRT-<order>-<lane>-<n>, n one past the loads already planned on this lane
   from a quote (counted by their freight.loadId, whatever the office named
   them), stepped past any leg id the ledger already has. ONE rule: the
   endpoint, the sandbox and each lane's nextLoadId in the plan (what the
   Accept step previews) all call this, on the same legs. */
function nextLoadId(order, laneKey, legs) {
  var o = order || {}, list = Array.isArray(legs) ? legs : [], seen = {}, n = 0, id;
  var base = 'FRT-' + String(o.orderNo || o.id || 'order').replace(/[^A-Za-z0-9_-]+/g, '-').slice(0, 60) + '-' + String(laneKey || '');
  list.forEach(function (l) { var f = l && l.freight; if (f && f.laneKey === laneKey && f.loadId && !seen[f.loadId]) { seen[f.loadId] = true; n++; } });
  do { n++; id = base + '-' + n; } while (list.some(function (l) { return !!l && String(l.id).indexOf(id + '-S') === 0; }));
  return id;
}

/* ── distance ─────────────────────────────────────────────────────────── */
function hasPin(p) {
  if (!p || p.lat === null || p.lng === null || p.lat === undefined || p.lng === undefined || p.lat === '' || p.lng === '') return false;
  var la = Number(p.lat), ln = Number(p.lng);
  return isFinite(la) && isFinite(ln) && la >= -90 && la <= 90 && ln >= -180 && ln <= 180;
}
function rad(d) { return d * Math.PI / 180; }
function rawMiles(a, b) {
  var dLat = rad(Number(b.lat) - Number(a.lat)), dLng = rad(Number(b.lng) - Number(a.lng));
  var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(rad(Number(a.lat))) * Math.cos(rad(Number(b.lat))) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * EARTH_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}
/* straight-line miles, one decimal; null without both pins */
function haversineMiles(a, b) { return hasPin(a) && hasPin(b) ? Math.round(rawMiles(a, b) * 10) / 10 : null; }

/* ── money: a quote as the carrier gave it, in cents. Not a price this
   platform computes — a number typed off a carrier's email. (Named
   quoteCents: scripts/tests/tappsandbox.js refuses a `cents` function in
   the public bundle, where it would mean the fee snapshot.) ─────────── */
function quoteCents(v) {
  if (v === null || v === undefined || typeof v === 'boolean' || (typeof v === 'string' && !v.replace(/^\s+|\s+$/g, ''))) throw fail(400, 'Enter the quoted amount');
  var n = Number(typeof v === 'string' ? v.replace(/[$,\s]/g, '') : v);
  if (!isFinite(n) || n <= 0 || n > 10000000) throw fail(400, 'The quoted amount must be more than $0 and at most $10,000,000');
  return Math.round(n * 100);
}

/* ── one unit ─────────────────────────────────────────────────────────── */
/* Ready to ship exactly as the pickup gate judges it: logic-policy.ready()
   (at Ready, no hold, no NCR, and a PASSING test — no test record is not a
   pass). That module is server-only and never in the public bundle, so the
   one condition is copied here; scripts/test-freight.js holds the two to
   the same answers. api/logic-logistics.js pickup also runs it on every
   serialized component of the unit (its rootSerial family), so a unit is
   only ready when its components are: `parts` are those, as far as the
   order's units show them. A sheet that says "Ready now" is a promise to a
   carrier; it must never be one the pickup then refuses. */
function unitReady(u) { return !!u && u.at === 'ready' && !u.hold && !u.ncr && !!u.test && u.test.result === 'pass'; }
function partSay(c) {
  var at = clean(c.at, 60);
  return c.hold ? 'on hold' : c.ncr ? 'NCR ' + clean(c.ncr, 60) : c.test && c.test.result === 'fail' ? 'test failed' : at === 'ready' ? 'awaiting test' : at ? 'at ' + at : 'not started';
}
function buildState(u, parts) {
  u = u || {};
  var at = clean(u.at, 60), failed = !!(u.test && u.test.result === 'fail'), passed = !!(u.test && u.test.result === 'pass');
  var part = (parts || []).filter(function (c) { return c && !unitReady(c); }).sort(function (a, b) { return C.naturalCompare(a.serial, b.serial); })[0] || null;
  var ready = unitReady(u) && !part;
  var label = u.hold ? 'On hold · ' + clean(u.hold, 80) : u.ncr ? 'On hold · NCR ' + clean(u.ncr, 60) : failed ? 'Test failed'
    : at === 'ready' && !passed ? 'Awaiting test' : at === 'ready' && part ? 'Component not ready · ' + clean(part.serial, 100) + ' ' + partSay(part) : ready ? 'Ready' : at ? 'Building · ' + at : 'Not started';
  return { ready: ready, label: label, since: ready ? dayOf(u.arrivedAt) || dayOf(u.readyAt) : null };
}
/* each shipping unit's serialized components, by its serial (rootSerial) */
function partsIndex(list) {
  var by = {};
  (list || []).forEach(function (c) { if (!c || c.shipUnit || !c.rootSerial || c.rootSerial === c.serial) return; (by[c.rootSerial] = by[c.rootSerial] || []).push(c); });
  return by;
}
/* the legs an order carries, by serial and by id */
function legIndex(legs) {
  var idx = { bySerial: {}, byId: {} };
  (legs || []).forEach(function (l) { if (!l) return; if (l.id) idx.byId[l.id] = l; (l.serials || []).forEach(function (s) { idx.bySerial[s] = l; }); });
  return idx;
}
/* the leg a unit is on: the order's own ledger first, then the unit's
   logisticsLegId (a load recorded against it that this order does not
   list is still a load: treated as planned, never as free) */
function legOf(u, idx) {
  if (!u) return null;
  if (typeof idx === 'function') return idx(u) || null;
  idx = idx || { bySerial: {}, byId: {} };
  if (!idx.bySerial) idx = { bySerial: idx, byId: {} };
  var l = idx.bySerial[u.serial] || (u.logisticsLegId ? idx.byId[u.logisticsLegId] : null);
  if (!l && u.logisticsLegId) l = { id: String(u.logisticsLegId), status: 'planned', carrier: '', tracking: '', unknown: true };
  return l || null;
}
/* blocked · shipped · booked · unassigned · open */
function freightState(u, idx) {
  var c = C.custodyOf(u);
  if (c.state === 'scrapped' || c.state === 'lost') return 'blocked';
  var leg = legOf(u, idx);
  if (c.status || (leg && leg.status !== 'planned')) return 'shipped';
  if (leg) return 'booked';
  if (!siteOfUnit(u)) return 'unassigned';
  return 'open';
}
/* assigned (bound) wins over planned ("going to") */
function siteOfUnit(u) {
  var c = C.custodyOf(u);
  if (c.siteId) return { siteId: String(c.siteId), siteName: clean(c.siteName, 160), how: 'assigned' };
  if (c.plannedSiteId) return { siteId: String(c.plannedSiteId), siteName: clean(c.plannedSiteName, 160), how: 'planned' };
  return null;
}

/* ── estimates, from the catalog only ─────────────────────────────────── */
function num(v) { return v === null || v === undefined || v === '' || typeof v === 'boolean' ? null : (isFinite(Number(v)) ? Number(v) : null); }
function r2(n) { return Math.round(n * 100) / 100; }
function estimate(units, bySku) {
  bySku = bySku || {};
  var lb = 0, lbN = 0, lbMiss = {}, sq = 0, sqN = 0, sqMiss = {}, h = null, hMiss = {}, stack = {}, classes = {}, classMiss = {}, handling = {}, n = 0, noStack = false;
  (units || []).forEach(function (u) {
    if (!u) return; n++;
    var sku = String(u.sku || ''), key = sku || '(no SKU)', p = bySku[sku] || null, w = p ? num(p.weightLb) : null, wf = p ? num(p.widthFt) : null, df = p ? num(p.depthFt) : null, hf = p ? num(p.heightFt) : null;
    if (w != null) { lb += w; lbN++; } else lbMiss[key] = true;
    if (wf != null && df != null) { sq += wf * df; sqN++; } else sqMiss[key] = true;
    if (hf != null) h = h == null ? hf : Math.max(h, hf); else hMiss[key] = true;
    stack[key] = p && p.stackable === true ? 'yes' : p && p.stackable === false ? 'no' : 'unknown';
    if (p && p.stackable === false) noStack = true;
    if (p && p.freightClass != null && p.freightClass !== '') classes[String(p.freightClass)] = true; else classMiss[key] = true;
    if (p && p.handlingNote) handling[String(p.handlingNote)] = true;
  });
  var hl = Object.keys(handling).sort(); if (noStack) hl.push('Do not stack');
  var sorted = function (o) { return Object.keys(o).sort(C.naturalCompare); };
  /* stacking, as a carrier reads it: "yes" or "no" when every SKU says the
     same; the SKUs named when they differ ("yes: A; no: B"); and a SKU
     nobody answered for named as not on file — never folded into a
     "mixed" that reads as some yes and some no */
  var yes = [], no = [], unk = [];
  sorted(stack).forEach(function (k) { (stack[k] === 'yes' ? yes : stack[k] === 'no' ? no : unk).push(k); });
  var stackable = !yes.length && !no.length ? NOT : (yes.length && no.length ? 'yes: ' + yes.join(', ') + '; no: ' + no.join(', ') : yes.length ? 'yes' : 'no') + (unk.length ? ' (' + NOT + ': ' + unk.join(', ') + ')' : '');
  return {
    units: n,
    weightLb: { lb: r2(lb), complete: n > 0 ? lbN === n : true, missing: sorted(lbMiss), counted: lbN },
    floorSqFt: { sqft: r2(sq), complete: n > 0 ? sqN === n : true, missing: sorted(sqMiss), counted: sqN },
    maxHeightFt: h == null ? null : r2(h), heightComplete: Object.keys(hMiss).length === 0, heightMissing: sorted(hMiss),
    stackable: stackable,
    freightClass: Object.keys(classes).sort(function (a, b) { return Number(a) - Number(b); }),
    freightClassComplete: Object.keys(classMiss).length === 0, freightClassMissing: sorted(classMiss),
    handling: hl
  };
}
/* one estimate cell: the number when complete, "not on file" when nothing
   is, "<n> (not on file: SKU…)" when partial */
function estCell(total, complete, missing, counted) {
  if (complete) return total;
  if (!counted) return NOT;
  return total + ' (' + NOT + ': ' + missing.join(', ') + ')';
}

/* ── which order destination a stop's leg goes against ────────────────── */
var LEGACY_SAY = 'This order needs a reviewed destination plan; legacy orders are not changed automatically';
function destinationFor(destinations, site) {
  var list = Array.isArray(destinations) ? destinations : null, s = site || {}, a = s.address || {}, nm = s.name || s.siteName || s.siteId || 'this stop';
  if (!list) return { id: null, how: 'none', say: LEGACY_SAY };
  var hit = list.filter(function (d) { return d && d.address && C.samePlace(d.address, a); })[0];
  if (hit) return { id: hit.id, how: 'address', say: '' };
  if (list.length === 1) return { id: list[0].id, how: 'only', say: 'The order has one destination (' + clean((list[0].address || {}).name || list[0].id, 120) + '); this stop is recorded on its load as the real drop.' };
  return { id: null, how: 'none', say: 'No destination on the order matches ' + nm + (C.oneLine(a) ? ' (' + C.oneLine(a) + ')' : '') + '. Plan this stop on the ledger against the right destination.' };
}

/* ── stop order ───────────────────────────────────────────────────────── */
function byState(a, b) {
  var sa = C.stateCode((a.address || {}).state) || String((a.address || {}).state || ''), sb = C.stateCode((b.address || {}).state) || String((b.address || {}).state || '');
  if (sa !== sb) return sa < sb ? -1 : 1;
  var ca = String((a.address || {}).city || '').toLowerCase(), cb = String((b.address || {}).city || '').toLowerCase();
  if (ca !== cb) return ca < cb ? -1 : 1;
  var n = C.naturalCompare(String(a.name || ''), String(b.name || '')); if (n) return n;
  return String(a.siteId) < String(b.siteId) ? -1 : String(a.siteId) > String(b.siteId) ? 1 : 0;
}
function orderStops(origin, stops) {
  var list = (stops || []).map(function (s) { var o = {}; for (var k in s) if (Object.prototype.hasOwnProperty.call(s, k)) o[k] = s[k]; return o; });
  var out = [], ordering;
  if (hasPin(origin)) {
    var pinned = list.filter(hasPin), rest = list.filter(function (s) { return !hasPin(s); }).sort(byState), cur = origin;
    /* nearest first; a tie goes to the name as a person reads it, then the id */
    var before = function (x, y) { var n = C.naturalCompare(String(x.name || ''), String(y.name || '')); return n ? n < 0 : String(x.siteId) < String(y.siteId); };
    while (pinned.length) {
      var best = 0, bestD = rawMiles(cur, pinned[0]);
      for (var i = 1; i < pinned.length; i++) {
        var d = rawMiles(cur, pinned[i]);
        if (d < bestD || (d === bestD && before(pinned[i], pinned[best]))) { best = i; bestD = d; }
      }
      var next = pinned.splice(best, 1)[0]; next.milesFromPrev = Math.round(bestD * 10) / 10; out.push(next); cur = next;
    }
    rest.forEach(function (s) { s.milesFromPrev = null; out.push(s); });
    ordering = !rest.length ? 'nearest' : out.length === rest.length ? 'state' : 'mixed';
  } else {
    out = list.sort(byState); out.forEach(function (s) { s.milesFromPrev = null; }); ordering = 'state';
  }
  out.forEach(function (s, i) { s.seq = i + 1; });
  var miles = null;
  if (out.length && hasPin(origin) && out.every(hasPin)) { miles = 0; out.forEach(function (s) { miles += s.milesFromPrev; }); miles = Math.round(miles * 10) / 10; }
  return { stops: out, ordering: ordering, miles: miles };
}

/* ── the ship-from ────────────────────────────────────────────────────── */
function origin(input, existing) {
  var b = input && typeof input === 'object' ? input : {}, a = b.address && typeof b.address === 'object' ? b.address : {}, ct = b.contact && typeof b.contact === 'object' ? b.contact : {};
  var name = text(b.name, 160, 'The ship-from name', true);
  var line1 = text(a.line1, 200, 'Street', true), line2 = text(a.line2, 200, 'Street 2'), city = text(a.city, 100, 'City', true);
  var state = C.stateCode(a.state); if (!state) throw fail(400, 'Use a US state');
  var zip = text(a.zip, 20, 'ZIP', true), zm = /^(\d{5})(?:-?(\d{4}))?$/.exec(zip);
  if (!zm) throw fail(400, 'ZIP must be 5 or 9 digits');
  var address = { line1: line1, line2: line2, city: city, state: state, zip: zm[2] ? zm[1] + '-' + zm[2] : zm[1], country: 'US' };
  var keep = !!existing && !!existing.address && C.samePlace(existing.address, address);
  var lat = b.lat === undefined ? (keep && existing.lat != null ? Number(existing.lat) : null) : (b.lat === null || b.lat === '' ? null : Number(b.lat));
  var lng = b.lng === undefined ? (keep && existing.lng != null ? Number(existing.lng) : null) : (b.lng === null || b.lng === '' ? null : Number(b.lng));
  if ((lat != null && !(lat >= -90 && lat <= 90)) || (lng != null && !(lng >= -180 && lng <= 180))) throw fail(400, 'Latitude or longitude out of range');
  if ((lat == null) !== (lng == null)) { lat = null; lng = null; }
  return { name: name, address: address, contact: { name: text(ct.name, 120, 'Contact name'), phone: text(ct.phone, 40, 'Contact phone') },
    hours: text(b.hours, 120, 'Dock hours'), notes: text(b.notes, 500, 'Notes', false, true), lat: lat, lng: lng };
}
function originLine(o) { return o && o.address && o.address.line1 ? [clean(o.name, 160), C.oneLine(o.address)].filter(Boolean).join(', ') : ''; }

/* ── the order, however it is shaped ─────────────────────────────────── */
function deliveryOf(o) {
  o = o || {};
  var d = o.delivery && typeof o.delivery === 'object' ? o.delivery : (Array.isArray(o.destinations) ? { destinations: o.destinations, legs: o.legs, revision: o.revision } : {});
  return { destinations: Array.isArray(d.destinations) ? d.destinations : null, legs: Array.isArray(d.legs) ? d.legs : [], revision: typeof d.revision === 'number' ? d.revision : 0 };
}
function poOf(o) { return (o && ((o.purchaseOrder && o.purchaseOrder.number) || o.poNumber)) || ''; }
function customerOf(o) { var c = (o && o.customer) || {}; return typeof c === 'string' ? c : clean(c.company || c.name, 160); }

/* ── quotes ───────────────────────────────────────────────────────────── */
/* `day` is quoteDay(now): what "valid until" is judged against */
function quoteView(q, lane, day) {
  q = q || {};
  var vu = q.validUntil || null, open = (q.status || 'recorded') === 'recorded', here = {};
  ((lane && lane.stops) || []).forEach(function (st) { here[st.siteId] = st; });
  /* each stop as priced, with where that site is NOW when it is still on
     the lane: `moved` when the site's address is no longer the one the
     carrier priced (the Accept step shows the current one; Accept refuses) */
  var stops = (q.stops || []).map(function (s) {
    var cur = here[s.siteId] || null;
    return { seq: s.seq, siteId: s.siteId, siteName: s.siteName || '', line1: s.line1 || '', city: s.city || '', state: s.state || '', zip: s.zip || '', serials: (s.serials || []).slice(),
      where: cur ? cur.oneLine || C.oneLine(cur.address) : '', moved: !!cur && !C.samePlace(quotedAt(s), cur.address) };
  });
  return { id: String(q.id || ''), laneKey: q.laneKey || '', laneLabel: q.laneLabel || (REGION_BY_KEY[q.laneKey] || {}).label || '', carrier: q.carrier || '', amountCents: typeof q.amountCents === 'number' ? q.amountCents : null,
    currency: q.currency || 'USD', transitDays: q.transitDays == null ? null : q.transitDays, validUntil: vu, reference: q.reference || '', note: q.note || '', status: q.status || 'recorded',
    /* flags for a quote that is still open: an accepted, superseded or
       withdrawn one is history, and its lane has moved on by design */
    expired: open && !!(vu && day && vu < day), stale: open && (!lane || q.planKey !== lane.planKey), moved: open && stops.some(function (s) { return s.moved; }),
    stops: stops,
    units: typeof q.units === 'number' ? q.units : (q.stops || []).reduce(function (t, s) { return t + (s.serials || []).length; }, 0),
    recordedAt: q.recordedAt || null, recordedBy: q.recordedBy || null, acceptedAt: q.acceptedAt || null, acceptedBy: q.acceptedBy || null, legIds: (q.legIds || []).slice(),
    withdrawnAt: q.withdrawnAt || null, withdrawnBy: q.withdrawnBy || null, reason: q.reason || '', supersededBy: q.supersededBy || null, supersedes: q.supersedes || null };
}
function newestFirst(a, b) { var x = String(a.recordedAt || ''), y = String(b.recordedAt || ''); return x < y ? 1 : x > y ? -1 : 0; }
function bestOf(views) {
  var best = null;
  views.forEach(function (v) {
    /* a price Accept would refuse is never "best": expired, or a stop's address moved since */
    if (v.status !== 'recorded' || v.expired || v.moved || v.amountCents == null) return;
    if (!best || v.amountCents < best.amountCents || (v.amountCents === best.amountCents && String(v.recordedAt || '') < String(best.recordedAt || ''))) best = v;
  });
  return best;
}

/* ── the plan ─────────────────────────────────────────────────────────── */
function contactOf(site) { var c = (site && site.contact) || {}; return { name: clean(c.name, 120), phone: clean(c.phone, 40) }; }
function addressOf(site) {
  var a = (site && site.address) || {};
  return { line1: clean(a.line1, 200), line2: clean(a.line2, 200), city: clean(a.city, 100), state: clean(a.state, 40), zip: clean(a.zip, 20), country: clean(a.country, 40) || 'US' };
}
function skuLines(units, bySku) {
  var by = {}, order = [];
  units.forEach(function (u) { var s = String(u.sku || ''); if (!by[s]) { by[s] = { sku: s, name: bySku[s] && bySku[s].name ? clean(bySku[s].name, 160) : '', qty: 0 }; order.push(s); } by[s].qty++; });
  return order.sort(C.naturalCompare).map(function (s) { return by[s]; });
}
function readyOf(units, promised, today, builds) {
  var of = units.length, k = units.filter(function (u) { return builds && builds[u.serial] ? builds[u.serial].ready : buildState(u).ready; }).length;
  if (!of) return { ready: 0, of: 0, date: null, label: 'Nothing left to ship' };
  if (k === of) return { ready: k, of: of, date: today || null, label: 'Ready now' };
  if (promised) return { ready: k, of: of, date: promised, label: k + ' of ' + of + ' ready · plant date ' + promised };
  return { ready: k, of: of, date: null, label: k + ' of ' + of + ' ready · no ship date set' };
}
function plan(input) {
  var inp = input || {}, now = String(inp.now || ''), today = now.slice(0, 10), qday = quoteDay(now), o = inp.order || {}, dl = deliveryOf(o), idx = legIndex(dl.legs);
  var bySku = {}; (inp.products || []).forEach(function (p) { if (p && p.sku) bySku[String(p.sku)] = p; });
  var sites = inp.sites || {}, orig = inp.origin && inp.origin.address ? inp.origin : null, promised = dayOf(inp.promised);
  /* inp.components: the order's serialized components (not shipping
     units), which the pickup gate checks with their unit */
  var parts = partsIndex((inp.components || []).concat(inp.units || []));
  var units = (inp.units || []).filter(function (u) { return u && u.shipUnit; }).slice().sort(function (a, b) { return C.naturalCompare(a.serial, b.serial); });
  var recs = [], builds = {}, stopsById = {}, stopOrder = [], unassigned = [], offLane = [], blocked = [];
  units.forEach(function (u) {
    var st = freightState(u, idx), leg = legOf(u, idx), s = siteOfUnit(u), rec = { u: u, state: st, leg: leg, site: s, build: buildState(u, parts[u.serial]) };
    recs.push(rec); builds[u.serial] = rec.build;
    if (st === 'blocked') { blocked.push(rec); return; }
    /* no site: still to be given one (unassigned), or already on a load or
       shipped without one (planned by hand, or before bulk sites) — the
       second is not work for "Many sites at once" and is listed apart */
    if (!s) { (st === 'unassigned' ? unassigned : offLane).push(rec); return; }
    var stop = stopsById[s.siteId];
    if (!stop) { stop = stopsById[s.siteId] = { siteId: s.siteId, recs: [], hows: {}, fallbackName: s.siteName }; stopOrder.push(s.siteId); }
    stop.recs.push(rec); stop.hows[s.how] = true;
  });
  /* each stop, with its site's address and pin */
  var built = stopOrder.map(function (id) {
    var st = stopsById[id], site = sites[id] || null, a = addressOf(site), openU = [], bookedN = 0, shippedN = 0;
    st.recs.forEach(function (r) { if (r.state === 'open') openU.push(r.u); else if (r.state === 'booked') bookedN++; else if (r.state === 'shipped') shippedN++; });
    return { siteId: id, name: clean(site && site.name, 160) || st.fallbackName || id, ref: clean(site && site.ref, 80), how: st.hows.assigned && st.hows.planned ? 'mixed' : st.hows.assigned ? 'assigned' : 'planned',
      siteStatus: !site ? 'missing' : site.status === 'inactive' ? 'inactive' : 'active',
      address: a, oneLine: C.oneLine(a), lat: site && hasPin(site) ? Number(site.lat) : null, lng: site && hasPin(site) ? Number(site.lng) : null, contact: contactOf(site),
      region: regionOf(a.state, a.country), recs: st.recs,
      serials: st.recs.map(function (r) { return r.u.serial; }), openSerials: openU.map(function (u) { return u.serial; }),
      open: openU.length, booked: bookedN, shipped: shippedN, units: st.recs.length,
      skus: skuLines(openU, bySku), estimate: estimate(openU, bySku), ready: readyOf(openU, promised, today, builds),
      destination: destinationFor(dl.destinations, { name: clean(site && site.name, 160) || st.fallbackName || id, address: a }) };
  });
  /* lanes, in REGIONS order; open stops routed first */
  var byLane = {}; built.forEach(function (s) { (byLane[s.region] = byLane[s.region] || []).push(s); });
  var quoteViews = (inp.quotes || []).filter(function (q) { return q && q.id; });
  var usedQuotes = {}, laneOfSerial = {};
  var lanes = REGIONS.filter(function (r) { return byLane[r.key]; }).map(function (r) {
    var all = byLane[r.key], openStops = all.filter(function (s) { return s.open > 0; }), restStops = all.filter(function (s) { return !s.open; });
    var r1 = orderStops(orig, openStops), r2 = orderStops(orig, restStops);
    r2.stops.forEach(function (s, i) { s.seq = r1.stops.length + i + 1; s.milesFromPrev = null; });
    var stops = r1.stops.concat(r2.stops), openU = [], pairs = [], n = { units: 0, open: 0, booked: 0, shipped: 0 };
    stops.forEach(function (s) {
      n.units += s.units; n.open += s.open; n.booked += s.booked; n.shipped += s.shipped;
      /* the lane as priced: each open serial → its site AT its address */
      s.recs.forEach(function (rc) { laneOfSerial[rc.u.serial] = { lane: r.key, seq: s.seq, siteId: s.siteId }; if (rc.state === 'open') { openU.push(rc.u); pairs.push({ serial: rc.u.serial, siteId: s.siteId + '@' + placeKey(s.address) }); } });
    });
    var lane = { key: r.key, label: r.label, ordering: openStops.length ? r1.ordering : r2.ordering, miles: openStops.length ? r1.miles : null, stops: stops,
      units: n.units, open: n.open, booked: n.booked, shipped: n.shipped, skus: skuLines(openU, bySku), estimate: estimate(openU, bySku), planKey: C.planKey({ assignments: pairs }),
      nextLoadId: nextLoadId(o, r.key, dl.legs) };
    var qs = quoteViews.filter(function (q) { return q.laneKey === r.key; }).map(function (q) { usedQuotes[q.id] = true; return quoteView(q, lane, qday); }).sort(newestFirst);
    lane.quotes = qs; lane.best = bestOf(qs);
    lane.accepted = qs.filter(function (q) { return q.status === 'accepted'; }).sort(function (a, b) { return String(a.acceptedAt || '') < String(b.acceptedAt || '') ? 1 : -1; })[0] || null;
    lane.state = lane.open > 0 ? (qs.some(function (q) { return q.status === 'recorded' && !q.expired && !q.moved; }) ? 'quoted' : 'needs-quote') : lane.booked > 0 ? (lane.accepted ? 'accepted' : 'booked') : 'shipped';
    lane.stateLabel = LANE_LABELS[lane.state];
    lane.loads = [];
    return lane;
  });
  /* the ledger's loads that carry each lane's units */
  var laneBy = {}; lanes.forEach(function (l) { laneBy[l.key] = l; });
  dl.legs.forEach(function (leg) {
    var hit = null; (leg.serials || []).some(function (sn) { hit = laneOfSerial[sn] || null; return !!hit; });
    if (!hit) return;
    laneBy[hit.lane].loads.push({ legId: leg.id, status: leg.status || '', carrier: leg.carrier || '', tracking: leg.tracking || '', siteId: leg.siteId || hit.siteId, stop: leg.freight && leg.freight.stop ? leg.freight.stop : hit.seq, quoteId: leg.freight && leg.freight.quoteId ? leg.freight.quoteId : null, units: (leg.serials || []).length });
  });
  /* master rows, in lane · stop · serial order, then no site, then cannot ship */
  var rows = [], stopOf = {};
  lanes.forEach(function (l) { l.stops.forEach(function (s) { s.recs.forEach(function (rc) { stopOf[rc.u.serial] = { lane: l, stop: s }; }); }); });
  var rank = function (x, at) { return at ? 0 : x.state === 'blocked' ? 3 : x.state === 'unassigned' ? 2 : 1; };
  var sortedRecs = recs.slice().sort(function (x, y) {
    var a = stopOf[x.u.serial], b = stopOf[y.u.serial], ra = rank(x, a), rb = rank(y, b);
    if (ra !== rb) return ra - rb;
    if (a && b) { var la = REGION_INDEX[a.lane.key], lb = REGION_INDEX[b.lane.key]; if (la !== lb) return la - lb; if (a.stop.seq !== b.stop.seq) return a.stop.seq - b.stop.seq; }
    return C.naturalCompare(x.u.serial, y.u.serial);
  });
  var orderNo = clean(o.orderNo, 60), po = clean(poOf(o), 80);
  sortedRecs.forEach(function (rc) {
    var u = rc.u, p = bySku[u.sku] || null, at = stopOf[u.serial], s = at ? at.stop : null, a = s ? s.address : {};
    rows.push({ serial: u.serial, sku: u.sku || '', product: p && p.name ? clean(p.name, 160) : '', build: rc.build.label, readySince: rc.build.since || '', freight: FREIGHT_LABELS[rc.state],
      lane: at ? at.lane.label : '', stop: s ? s.seq : '', site: s ? s.name : (rc.site ? rc.site.siteName || rc.site.siteId : ''), siteRef: s ? s.ref : '', siteIs: rc.site ? (rc.site.how === 'assigned' ? 'Assigned' : 'Going to') : '',
      street: a.line1 || '', street2: a.line2 || '', city: a.city || '', state: a.state || '', zip: a.zip || '', country: s ? a.country || 'US' : '', lat: s && s.lat != null ? s.lat : '', lng: s && s.lng != null ? s.lng : '',
      contact: s ? s.contact.name : '', phone: s ? s.contact.phone : '',
      weightLb: p && num(p.weightLb) != null ? num(p.weightLb) : NOT, dims: SF.dims(p || {}), freightClass: p && p.freightClass ? String(p.freightClass) : NOT,
      stackable: p && p.stackable === true ? 'yes' : p && p.stackable === false ? 'no' : NOT, handling: p && p.handlingNote ? String(p.handlingNote) : NOT,
      load: rc.leg ? rc.leg.id : '', carrier: rc.leg ? rc.leg.carrier || '' : '', orderNo: orderNo, poNumber: po, freightState: rc.state });
  });
  var otherQuotes = quoteViews.filter(function (q) { return !usedQuotes[q.id]; }).map(function (q) { return quoteView(q, null, qday); }).sort(newestFirst);
  var count = function (st) { return recs.filter(function (r) { return r.state === st; }).length; };
  var openAll = recs.filter(function (r) { return r.state === 'open'; }).map(function (r) { return r.u; }), est = estimate(openAll, bySku);
  var tidy = function (rc) { var u = rc.u; return { serial: u.serial, sku: u.sku || '', state: rc.state, stateLabel: FREIGHT_LABELS[rc.state], build: rc.build.label, ready: rc.build.ready, load: rc.leg ? rc.leg.id : '', why: rc.state === 'blocked' ? (C.custodyOf(u).state === 'lost' ? 'Marked lost' : 'Scrapped') : rc.state === 'shipped' ? 'Shipped' : rc.state === 'booked' ? 'Booked' : '' }; };
  /* stops as the page reads them: the working recs dropped */
  lanes.forEach(function (l) { l.stops.forEach(function (s) { delete s.recs; delete s.region; }); });
  return {
    order: { id: String(o.id || ''), orderNo: orderNo, poNumber: po, status: o.status || '', customer: customerOf(o), revision: dl.revision, legacy: !dl.destinations,
      destinations: (dl.destinations || []).map(function (d) { var da = d.address || {}; return { id: d.id, name: clean(da.name, 160), city: clean(da.city, 100), state: clean(da.state, 40), zip: clean(da.zip, 20), items: (d.items || []).map(function (i) { return { sku: i.sku, qty: i.qty }; }) }; }) },
    origin: orig, originSet: !!orig, originPinned: hasPin(orig),
    summary: { units: recs.length, sites: built.length, lanes: lanes.length, open: count('open'), booked: count('booked'), shipped: count('shipped'), unassigned: count('unassigned'), blocked: count('blocked'),
      ready: recs.filter(function (r) { return r.build.ready && r.state !== 'shipped' && r.state !== 'blocked'; }).length,
      weightLb: est.weightLb.counted ? est.weightLb.lb : null, weightComplete: est.weightLb.complete, weightMissing: est.weightLb.missing },
    rows: rows, lanes: lanes, unassigned: unassigned.map(tidy), offLane: offLane.map(tidy), blocked: blocked.map(tidy), otherQuotes: otherQuotes, notice: NOTICE, generatedAt: now
  };
}

/* ── the two sheets: the ONLY place their columns are defined ────────── */
var MASTER_COLUMNS = [
  { key: 'serial', label: 'Serial' }, { key: 'sku', label: 'SKU' }, { key: 'product', label: 'Product' }, { key: 'build', label: 'Build status' }, { key: 'readySince', label: 'Ready since' },
  { key: 'freight', label: 'Freight status' }, { key: 'lane', label: 'Lane' }, { key: 'stop', label: 'Stop' }, { key: 'site', label: 'Site' }, { key: 'siteRef', label: 'Site ref', text: true }, { key: 'siteIs', label: 'Site is' },
  { key: 'street', label: 'Street' }, { key: 'street2', label: 'Street 2' }, { key: 'city', label: 'City' }, { key: 'state', label: 'State' }, { key: 'zip', label: 'ZIP', text: true }, { key: 'country', label: 'Country' },
  { key: 'lat', label: 'Latitude' }, { key: 'lng', label: 'Longitude' }, { key: 'contact', label: 'Receiving contact' }, { key: 'phone', label: 'Contact phone' },
  { key: 'weightLb', label: 'Weight lb' }, { key: 'dims', label: 'Dimensions ft (W × D × H)' }, { key: 'freightClass', label: 'Freight class' }, { key: 'stackable', label: 'Stackable' }, { key: 'handling', label: 'Handling' },
  { key: 'load', label: 'Load' }, { key: 'carrier', label: 'Carrier' }, { key: 'orderNo', label: 'Order' }, { key: 'poNumber', label: 'Customer PO' }
];
var QUOTE_COLUMNS = [
  { key: 'lane', label: 'Lane' }, { key: 'stop', label: 'Stop' }, { key: 'stopsInLane', label: 'Stops in lane' }, { key: 'pickUp', label: 'Pick up from' },
  { key: 'site', label: 'Site' }, { key: 'siteRef', label: 'Site ref', text: true }, { key: 'street', label: 'Street' }, { key: 'street2', label: 'Street 2' }, { key: 'city', label: 'City' }, { key: 'state', label: 'State' }, { key: 'zip', label: 'ZIP', text: true }, { key: 'country', label: 'Country' },
  { key: 'lat', label: 'Latitude' }, { key: 'lng', label: 'Longitude' }, { key: 'miles', label: 'Miles from previous stop (straight line)' }, { key: 'contact', label: 'Receiving contact' }, { key: 'phone', label: 'Contact phone' },
  { key: 'units', label: 'Units' }, { key: 'skus', label: 'SKUs' }, { key: 'serials', label: 'Serials' }, { key: 'weight', label: 'Est. weight lb' }, { key: 'floor', label: 'Est. floor area sq ft' }, { key: 'height', label: 'Max height ft' },
  { key: 'freightClass', label: 'Freight class' }, { key: 'stackable', label: 'Stackable' }, { key: 'ready', label: 'Ready' }, { key: 'pickupDate', label: 'Earliest pickup date' }, { key: 'handling', label: 'Special handling' }, { key: 'orderNo', label: 'Order' }
];
/* one cell, as the bulk-sites download writes it (logic-custody.html
   csvCell): {text} keeps a leading-zero ZIP or a long ref as ="…", a text
   cell starting = + - @ gets a leading ' so a spreadsheet does not run it.
   A number is written as the number — a longitude is negative and is not
   a formula. */
function cell(v, asText) {
  if (asText) {
    var t = String(v == null ? '' : v);
    return /^\d[\d-]*$/.test(t) && (t.charAt(0) === '0' || t.length > 15) ? '"=""' + t + '"""' : cell(t);
  }
  if (typeof v === 'number' && isFinite(v)) return String(v);
  var s = v == null ? '' : String(v);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function csv(columns, rows) {
  var lines = [columns.map(function (c) { return cell(c.label); }).join(',')];
  (rows || []).forEach(function (r) { lines.push(columns.map(function (c) { return cell(r[c.key], c.text); }).join(',')); });
  return '\ufeff' + lines.join('\r\n');
}
function masterCsv(pl) { return csv(MASTER_COLUMNS, pl.rows || []); }
function quoteRows(pl) {
  var out = [], from = originLine(pl.origin) || 'not set', orderNo = (pl.order || {}).orderNo || '';
  (pl.lanes || []).forEach(function (l) {
    var open = l.stops.filter(function (s) { return s.open > 0; });
    open.forEach(function (s) {
      var e = s.estimate, a = s.address;
      out.push({ lane: l.label, stop: s.seq, stopsInLane: open.length, pickUp: from, site: s.name, siteRef: s.ref, street: a.line1, street2: a.line2, city: a.city, state: a.state, zip: a.zip, country: a.country || 'US',
        lat: s.lat == null ? '' : s.lat, lng: s.lng == null ? '' : s.lng, miles: s.milesFromPrev == null ? '' : s.milesFromPrev, contact: s.contact.name, phone: s.contact.phone, units: s.open,
        skus: s.skus.map(function (k) { return k.qty + ' × ' + k.sku + (k.name ? ' ' + k.name : ''); }).join('; '), serials: s.openSerials.join(' '),
        weight: estCell(e.weightLb.lb, e.weightLb.complete, e.weightLb.missing, e.weightLb.counted), floor: estCell(e.floorSqFt.sqft, e.floorSqFt.complete, e.floorSqFt.missing, e.floorSqFt.counted),
        height: e.maxHeightFt == null ? NOT : estCell(e.maxHeightFt, e.heightComplete, e.heightMissing, 1),
        freightClass: e.freightClass.length ? estCell(e.freightClass.join(', '), e.freightClassComplete, e.freightClassMissing, 1) : NOT, stackable: e.stackable, ready: s.ready.label, pickupDate: s.ready.date || '',
        handling: e.handling.join('; '), orderNo: orderNo });
    });
  });
  return out;
}
function quoteCsv(pl) { return csv(QUOTE_COLUMNS, quoteRows(pl)); }
function fileSafe(s) { return String(s || '').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'order'; }
function exportsOf(pl, now) {
  var day = String(now || pl.generatedAt || '').slice(0, 10), no = fileSafe((pl.order || {}).orderNo || (pl.order || {}).id);
  return { master: { filename: 'freight-master-' + no + '-' + day + '.csv', csv: masterCsv(pl) }, quote: { filename: 'freight-quote-request-' + no + '-' + day + '.csv', csv: quoteCsv(pl) } };
}

/* ── recording a quote ────────────────────────────────────────────────── */
function quoteInput(body, lane, order, by, now) {
  var b = body || {}, today = quoteDay(now), key = laneKeyOf(b.laneKey);
  if (!lane || lane.key !== key) throw fail(409, 'That lane is not on this order any more. Reload the freight plan.');
  if (!(lane.open > 0)) throw fail(409, 'Every unit on this lane is already booked or shipped; there is nothing left to quote');
  if (!b.planKey) throw fail(400, 'Reload the freight plan before recording a quote');
  if (String(b.planKey) !== lane.planKey) throw fail(409, 'This lane changed since you opened it. Reload the freight plan and record the quote again.');
  var carrier = text(b.carrier, 120, 'Carrier', true), amountCents = quoteCents(b.amount);
  var cur = b.currency == null || b.currency === '' ? 'USD' : String(b.currency).replace(/^\s+|\s+$/g, '').toUpperCase();
  if (cur !== 'USD') throw fail(400, 'Quotes are recorded in USD');
  var transit = null;
  if (b.transitDays != null && b.transitDays !== '') { transit = Number(b.transitDays); if (!(isFinite(transit) && Math.floor(transit) === transit && transit >= 0 && transit <= 90)) throw fail(400, 'Transit days must be a whole number from 0 to 90'); }
  var valid = b.validUntil == null || b.validUntil === '' ? null : C.day(b.validUntil);
  if (valid && today && valid < today) throw fail(400, 'That quote has already expired (valid until ' + valid + ')');
  var sup = b.supersedes == null || b.supersedes === '' ? null : String(b.supersedes);
  if (sup && !QUOTE_ID.test(sup)) throw fail(400, 'Invalid quote to replace');
  var stops = lane.stops.filter(function (s) { return s.open > 0; }).map(function (s) { return { seq: s.seq, siteId: s.siteId, siteName: s.name, line1: s.address.line1 || '', city: s.address.city || '', state: s.address.state || '', zip: s.address.zip || '', serials: s.openSerials.slice() }; });
  var units = stops.reduce(function (t, s) { return t + s.serials.length; }, 0), w = lane.estimate.weightLb;
  return { orgId: clean(order && order.orgId, 200) || null, orderId: String((order && order.id) || ''), orderNo: clean(order && order.orderNo, 60), laneKey: key, laneLabel: lane.label,
    carrier: carrier, amountCents: amountCents, currency: 'USD', transitDays: transit, validUntil: valid, reference: text(b.reference, 120, 'Reference'), note: text(b.note, 500, 'Note', false, true), planKey: lane.planKey,
    stops: stops, units: units, weightLb: w.counted ? w.lb : null, weightComplete: !!w.complete,
    status: 'recorded', recordedAt: now, recordedBy: by || '', supersedes: sup,
    acceptedAt: null, acceptedBy: null, legIds: [], withdrawnAt: null, withdrawnBy: null, reason: '', supersededBy: null,
    trail: [{ at: now, by: by || '', status: 'recorded', note: sup ? 'Replaces ' + sup : '' }] };
}

/* ── accepting one: may its units still be planned? ───────────────────── */
function eligible(u, siteId, orderId, idx) {
  if (!u) return 'not registered';
  if (u.orderId !== orderId) return 'no longer on this order';
  if (!u.shipUnit) return 'not a shipping unit';
  var c = C.custodyOf(u);
  if (c.state === 'scrapped') return 'scrapped';
  if (c.state === 'lost') return 'marked lost';
  var leg = legOf(u, idx);
  if (leg) return 'already on load ' + leg.id;
  if (c.status) return 'already ' + C.label(c.status);
  var s = siteOfUnit(u);
  if (!s) return 'no longer has a site';
  if (s.siteId !== siteId) return 'now going to ' + (s.siteName || s.siteId);
  return null;
}
function acceptCheck(input) {
  var inp = input || {}, q = inp.quote || {}, units = inp.unitsBySerial || {}, sites = inp.sitesById || {}, o = inp.order || {}, today = quoteDay(inp.now);
  var dl = deliveryOf(o), idx = legIndex(dl.legs), problems = [], ineligible = [], total = 0, covered = {};
  if (q.status !== 'recorded') problems.push('This quote is ' + (q.status || 'not recorded') + '; only a recorded quote can be accepted');
  if (q.validUntil && today && q.validUntil < today) problems.push('This quote expired on ' + q.validUntil + '; record the carrier’s fresh quote');
  if (!dl.destinations) problems.push(LEGACY_SAY);
  var stops = (q.stops || []).map(function (s) {
    var site = sites[s.siteId] || null, nm = (site && site.name) || s.siteName || s.siteId, head = 'Stop ' + s.seq + ' · ' + nm + ': ';
    if (!site) problems.push(head + 'the site is gone');
    else if (site.status === 'inactive') problems.push(head + 'the site is inactive');
    /* the carrier priced a place: a site whose address was corrected since
       (same site, new street) is a different drop, at a price nobody gave */
    else if (!C.samePlace(quotedAt(s), site.address || {})) problems.push(head + 'the address changed since this price (priced for ' + (C.oneLine(quotedAt(s)) || 'no address') + '; now ' + (C.oneLine(site.address) || 'no address') + '). Record a new price for this lane');
    var dest = dl.destinations ? destinationFor(dl.destinations, { name: nm, address: (site && site.address) || { city: s.city, state: s.state, zip: s.zip } }) : { id: null, how: 'none', say: LEGACY_SAY };
    if (dl.destinations && dest.how === 'none') problems.push(head + dest.say);
    var list = (s.serials || []).slice();
    if (list.length > MAX_STOP_UNITS) problems.push(head + list.length + ' units; one load carries at most ' + MAX_STOP_UNITS + '. Plan this stop on the ledger in parts');
    total += list.length;
    list.forEach(function (sn) { covered[sn] = true; var why = eligible(units[sn] || null, s.siteId, String(o.id || ''), idx); if (why) ineligible.push({ serial: sn, why: why }); });
    return { seq: s.seq, siteId: s.siteId, siteName: nm, destinationId: dest.id, destinationHow: dest.how, serials: list };
  });
  if (!stops.length) problems.push('This quote names no stops');
  if (total > MAX_QUOTE_UNITS) problems.push('This quote covers ' + total + ' units; accept at most ' + MAX_QUOTE_UNITS + ' at a time');
  var notOnQuote = (inp.laneOpen || []).filter(function (sn) { return !covered[sn]; });
  return { stops: stops, ineligible: ineligible, notOnQuote: notOnQuote, problems: problems };
}
/* "S1 (why), S2 (why) … and N more" */
function ineligibleSay(list) {
  var shown = list.slice(0, 10).map(function (x) { return x.serial + ' (' + x.why + ')'; }).join(', ');
  return 'Not eligible any more: ' + shown + (list.length > 10 ? ' and ' + (list.length - 10) + ' more' : '') + ' — re-quote the lane or plan the rest on the ledger';
}

module.exports = { REGIONS: REGIONS, REGION_OF: REGION_OF, NOTICE: NOTICE, LOAD_ID: LOAD_ID, QUOTE_ID: QUOTE_ID, MAX_STOP_UNITS: MAX_STOP_UNITS, MAX_QUOTE_UNITS: MAX_QUOTE_UNITS, FREIGHT_LABELS: FREIGHT_LABELS, LANE_LABELS: LANE_LABELS, LEGACY_SAY: LEGACY_SAY,
  MASTER_COLUMNS: MASTER_COLUMNS, QUOTE_COLUMNS: QUOTE_COLUMNS,
  regionOf: regionOf, laneKeyOf: laneKeyOf, haversineMiles: haversineMiles, hasPin: hasPin, cents: quoteCents, quoteCents: quoteCents, dayOf: dayOf, quoteDay: quoteDay, placeKey: placeKey, nextLoadId: nextLoadId,
  unitReady: unitReady, buildState: buildState, partsIndex: partsIndex, legIndex: legIndex, legOf: legOf, freightState: freightState, siteOfUnit: siteOfUnit, estimate: estimate, estCell: estCell,
  destinationFor: destinationFor, orderStops: orderStops, origin: origin, originLine: originLine, deliveryOf: deliveryOf,
  plan: plan, quoteView: quoteView, cell: cell, csv: csv, masterCsv: masterCsv, quoteRows: quoteRows, quoteCsv: quoteCsv, exportsOf: exportsOf,
  quoteInput: quoteInput, eligible: eligible, acceptCheck: acceptCheck, ineligibleSay: ineligibleSay };
