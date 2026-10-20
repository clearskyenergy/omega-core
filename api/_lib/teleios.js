/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   ═══════════════════════════════════════════════════════════════════════════
   api/_lib/teleios.js — the Omega Teleios ladder: one customer quote from
   "saved" to complete ("Teleios" means complete), read across the three
   records that already know each step.

     the quote     customer_quotes/{id}            saved → approved
     the order     orders/{prime_…} (Omega Logic)  ordered → ready
                   in the SELLER's workspace (prime-order.js), so its office
                   is "your office" to the seller reading this
     the units     plant_units/{org__serial}       shipped → on site, and the
                   + the product's coverage         warranty live = Teleios

   PURE. No Firestore, no clock but the `now` handed in. DERIVED at read
   time, never stored, on the rules that already own each stage — the
   office's stageOf() (api/_lib/office-stage.js), the buyer's milestoneOf()
   (api/_lib/portal.js) and custody's custodyOf() / coverageWithInheritance()
   (api/_lib/custody.js) — so the ladder can never disagree with the office,
   the customer portal or the unit passport about where an order is.

   ── WHAT IT NEVER SAYS ──────────────────────────────────────────────────
   The ladder is a progress line, not a ledger. The order carries its
   office's price, invoices, deposit and terms (order.logic.commercial,
   invoices, payout, tenantPricing) — the seller's own now, a manufacturer's
   on an order made before 2026-10-17 — and none of it is read into a step:
   stageOf() is asked for its KEY and label only, never for `next` (its text
   names invoice amounts and ClearSky's wire bookkeeping), and every note
   below is a sentence written here.

   ── THE RULE AT THE UNIT STEPS ──────────────────────────────────────────
   An order is where its LEAST-advanced shipping unit is (portal.js's rule
   for the floor, applied to custody too): three units delivered and one in
   transit is "shipped", not "delivered". Exceptions and cancellation sit
   OFF the ladder (`off`), with the steps already done kept as they were.
   After-sales service — an RMA open, the unit returned, replaced or
   decommissioned — is PAST delivery and receipt: it is a note on the step,
   never a rewind of the ladder. A unit replaced under RMA is read through
   its replacement (custody.replacedBy; custody.js gives the replacement the
   original's site and the remaining term as inheritedCoverage).

   ── TELEIOS ─────────────────────────────────────────────────────────────
   Complete means delivered, on site and under warranty: every unit standing
   for the order carries AT LEAST ONE warranty on file, and every one of
   them is live. A unit with none on file (a bought-in battery whose maker's
   warranty this workspace never recorded) holds Teleios and says so; the
   office records the maker's warranty on that unit's passport in Omega
   Logic (custody.js makerWarranty, read by the same coverage engine), and
   `need` names the unit so Track opens its passport.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var S = require('./office-stage'), Pt = require('./portal'), C = require('./custody');

var STEPS = [
  { key: 'saved',     label: 'Quote saved',            phase: 'proposal' },
  { key: 'sent',      label: 'Proposal sent',          phase: 'proposal' },
  { key: 'viewed',    label: 'Viewed by the customer', phase: 'proposal' },
  { key: 'approved',  label: 'Approved',               phase: 'proposal' },
  { key: 'ordered',   label: 'Ordered',                phase: 'logic' },
  { key: 'priced',    label: 'Priced',                 phase: 'logic' },
  { key: 'accepted',  label: 'Accepted',               phase: 'logic' },
  { key: 'released',  label: 'Released to the plant',  phase: 'logic' },
  { key: 'building',  label: 'In production',          phase: 'logic' },
  { key: 'ready',     label: 'Ready to ship',          phase: 'logic' },
  { key: 'shipped',   label: 'Shipped',                phase: 'delivery' },
  { key: 'delivered', label: 'Delivered',              phase: 'delivery' },
  { key: 'received',  label: 'Received',               phase: 'delivery' },
  { key: 'onsite',    label: 'On site',                phase: 'delivery' },
  { key: 'teleios',   label: 'Omega Teleios',          phase: 'teleios' }
];
var KEYS = STEPS.map(function (s) { return s.key; });

/* custody statuses at or past each unit step; the service states custody.js
   reaches only after a unit was installed (rma-open from installed,
   commissioned or in service; then rma-return, replace, decommission) are
   past every one of them */
var SERVICE = ['rma_open', 'returned', 'replaced', 'decommissioned'];
var SHIPPED_ON = ['in_transit', 'delivered', 'received', 'assigned', 'installed', 'commissioned', 'in_service'].concat(SERVICE);
var DELIVERED_ON = ['delivered', 'received', 'assigned', 'installed', 'commissioned', 'in_service'].concat(SERVICE);
var RECEIVED_ON = ['received', 'assigned', 'installed', 'commissioned', 'in_service'].concat(SERVICE);

/* any stored time (a Timestamp, millis, an ISO string) → ISO, or null */
function iso(v) { var s = Pt.when(v), t = s ? Date.parse(s) : NaN; return isFinite(t) ? new Date(t).toISOString() : null; }
/* a step a field says is done: its time when it reads as one, else just done */
function mark(v) { return v ? (iso(v) || true) : false; }
function day(v) { var s = iso(v); return s ? s.slice(0, 10) : ''; }
function nowIso(now) { var t = typeof now === 'number' ? now : Date.parse(now); return new Date(isFinite(t) ? t : Date.now()).toISOString(); }
function str(v, n) { return v == null ? '' : String(v).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, n || 200); }
/* the units an order ships: shipping units, never a component, never a voided serial */
function shipping(units) { return (Array.isArray(units) ? units : []).filter(function (u) { return u && u.shipUnit && u.inventoryStatus !== 'void'; }); }
function latest(list) { var best = null; list.forEach(function (v) { var s = iso(v); if (s && (!best || s > best)) best = s; }); return best; }
function count(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }
/* The units that stand for the order NOW: one replaced under RMA is read
   through its replacement (custody.replacedBy), followed to the last one.
   `extra` are replacement records the door read by serial (a replacement
   is often stock from another order); a replacement that is itself one of
   the order's units is counted once. A replacement not on file leaves the
   replaced unit standing, and the ladder says so. */
function standing(units, extra) {
  var bySerial = {}, seen = {}, out = [];
  units.concat(shipping(extra)).forEach(function (u) { if (u.serial && !bySerial[u.serial]) bySerial[u.serial] = u; });
  units.forEach(function (u) {
    var cur = u, c = C.custodyOf(cur), hops = 0;
    while (c.status === 'replaced' && c.replacedBy && bySerial[c.replacedBy] && bySerial[c.replacedBy] !== cur && hops < 5) { cur = bySerial[c.replacedBy]; c = C.custodyOf(cur); hops++; }
    var k = cur.serial || ('#' + out.length);
    if (seen[k]) return;
    seen[k] = true; out.push(cur);
  });
  return out;
}
/* after-sales service on a unit, in a sentence (custody's own facts, no money) */
function serviceSay(u) {
  var c = C.custodyOf(u), s = c.status, serial = str(u.serial, 100) || 'A unit', rma = c.rma || {};
  if (s === 'rma_open') return 'RMA open on ' + serial + (day(rma.openedAt) ? ' since ' + day(rma.openedAt) : '');
  if (s === 'returned') return serial + ' returned to the plant under RMA' + (day(rma.returnedAt) ? ' on ' + day(rma.returnedAt) : '');
  if (s === 'decommissioned') return serial + ' decommissioned' + (day(c.decommissionedAt) ? ' on ' + day(c.decommissionedAt) : '');
  if (s === 'replaced') return serial + ' was replaced by ' + (str(c.replacedBy, 100) || 'another unit') + ', whose record is not on file';
  return null;
}

/* o: { quote, order, units, replacements, products, now, office, manufacturer }
   quote is the customer_quotes record; order the orders document (or null);
   units its plant_units rows; replacements the plant_units records of units
   that replaced them (custody.replacedBy), when the door read them;
   products the catalog of the workspace that holds the order (coverage).
   office names that workspace; when it is the quote's own (the order's
   orgId is the quote's, or no order yet), the notes say "your office". */
function ladder(o) {
  o = o || {};
  var q = o.quote || {}, order = o.order || null, units = shipping(o.units), products = Array.isArray(o.products) ? o.products : [];
  var now = nowIso(o.now), acc = q.acceptance || {}, done = {}, note = {}, off = null, need = null;
  var mine = order ? (!!q.orgId && order.orgId === q.orgId) : true;
  var who = mine ? 'your' : str(o.office || o.manufacturer || (q.unit && q.unit.mfr) || 'the manufacturer', 80) + '’s';

  /* ── the proposal ── */
  done.saved = iso(q.createdAt) || true;
  if (acc.sentAt) done.sent = mark(acc.sentAt);
  if (acc.viewedAt) done.viewed = mark(acc.viewedAt);
  if (q.status === 'approved') done.approved = mark(acc.approvedAt) || true;
  note.sent = 'Not sent yet';
  note.viewed = acc.sentAt ? 'Sent ' + day(acc.sentAt) + (acc.sentTo ? ' to ' + str(acc.sentTo, 120) : '') + '; not opened yet' : null;
  note.approved = acc.viewCount ? 'Opened ' + count(Number(acc.viewCount) || 0, 'time') + '; waiting for the customer’s decision' : 'Waiting for the customer’s decision';
  if (q.status === 'declined') off = { key: 'declined', label: 'Declined by the customer', note: str(acc.declineReason, 300) || null };
  else if (q.status === 'expired') off = { key: 'expired', label: 'Expired', note: acc.validUntil ? 'It was valid until ' + day(acc.validUntil) + '; send it again to reopen it' : 'Send it again to reopen it' };
  else if (q.status === 'withdrawn') off = { key: 'withdrawn', label: 'Withdrawn', note: 'Withdrawn by the seller; the link no longer opens it' };

  /* ── Omega Logic: the manufacturer's office and plant ── */
  var h = q.handoff || {};
  note.ordered = h.error ? str(h.error, 300) : 'Sending the order to ' + who + ' Omega Logic';
  if (order) {
    var l = order.logic || null, stage = S.stageOf(order);
    done.ordered = iso(order.createdAt) || iso(h.at) || true;
    note.priced = 'With ' + who + ' office to price';
    if (l) done.priced = mark(l.createdAt) || true;
    note.accepted = 'Priced; waiting for the order to be accepted';
    if (l && l.acceptedAt) done.accepted = mark(l.acceptedAt);
    note.released = 'Accepted; waiting to be released to the plant';
    if (l && l.releasedAt) done.released = mark(l.releasedAt);
    var ms = Pt.milestoneOf(order, units);
    note.building = ms.key === 'testing' ? 'Inspection & test' : 'In production';
    if (l && l.readyAt) { done.building = mark(l.readyAt); done.ready = mark(l.readyAt); }
    note.ready = 'Built; being readied for shipment';
    if (stage.key === 'cancelled') off = { key: 'cancelled', label: 'Cancelled', note: 'The order was cancelled' };
    else if (stage.key === 'exception') off = { key: 'exception', label: stage.label === 'Cancellation requested' ? 'Cancellation requested' : 'Needs attention', note: (mine ? 'Your' : who) + ' office is resolving it' };

    /* ── delivery: the order is where its least-advanced unit is ── */
    var legs = order.delivery && Array.isArray(order.delivery.legs) ? order.delivery.legs : [];
    var held = standing(units, o.replacements), cs = held.map(C.custodyOf), n = cs.length;
    function every(list) { return n > 0 && cs.every(function (c) { return list.indexOf(c.status) >= 0; }); }
    function some(list) { return cs.filter(function (c) { return list.indexOf(c.status) >= 0; }).length; }
    function legsAll(list) { return !n && legs.length > 0 && legs.every(function (g) { return list.indexOf(g.status) >= 0; }); }
    if (['shipped', 'complete'].indexOf(order.status) >= 0 || every(SHIPPED_ON) || legsAll(['in_transit', 'delivered', 'accepted', 'exception']))
      done.shipped = latest(cs.map(function (c) { return c.shippedAt; }).concat(legs.map(function (g) { return g.pickedUpAt; }), [order.shipment && order.shipment.shippedAt])) || true;
    note.shipped = n && some(SHIPPED_ON) ? some(SHIPPED_ON) + ' of ' + count(n, 'unit') + ' shipped' : 'Ready; waiting for pickup';
    if (every(DELIVERED_ON) || legsAll(['delivered', 'accepted', 'exception']))
      done.delivered = latest(cs.map(function (c) { return c.deliveredAt || c.receivedAt; }).concat(legs.map(function (g) { return g.deliveredAt; }))) || true;
    note.delivered = n && some(DELIVERED_ON) ? some(DELIVERED_ON) + ' of ' + count(n, 'unit') + ' delivered' : 'In transit';
    if (every(RECEIVED_ON) || legsAll(['accepted', 'exception']))
      done.received = latest(cs.map(function (c) { return c.receivedAt; }).concat(legs.map(function (g) { return g.inspectedAt; }))) || true;
    note.received = 'Delivered; waiting for the receiving inspection';
    var onsite = n > 0 && cs.every(function (c) { return !!c.siteId && RECEIVED_ON.indexOf(c.status) >= 0; });
    if (onsite) done.onsite = latest(cs.map(function (c) { return c.assignedAt || c.receivedAt; })) || true;
    var bound = cs.filter(function (c) { return !!c.siteId; }).length;
    note.onsite = n && bound ? bound + ' of ' + count(n, 'unit') + ' bound to the site' : 'Received; waiting to be assigned to its site';

    /* ── Teleios: on site, and every unit carries a warranty on file, every
       one of them live. An empty list is NOT "every warranty live": a
       bought-in battery whose maker's warranty this workspace never
       recorded (its SKU is not in the catalog, or the product names no
       coverage, and nothing is on the unit) holds Teleios and says where
       to record it. ── */
    var by = {}; products.forEach(function (p) { if (p && p.sku) by[p.sku] = p; });
    var services = Array.isArray(order.items) && order.items.length > 0 && order.items.every(function (it) { return it && it.kind === 'service'; });
    var starts = [], waiting = null, missing = null, covered = n > 0;
    held.forEach(function (u) {
      var cov = C.coverageWithInheritance(by[u.sku], u, now).filter(function (cv) { return cv.type === 'warranty'; });
      if (!cov.length) { covered = false; if (!missing) missing = u; return; }
      cov.forEach(function (cv) {
        if (cv.startDate) starts.push(cv.startDate);
        if (cv.status === 'active') return;
        covered = false;
        if (!waiting) waiting = cv.why || (cv.status === 'expired' ? 'expired on ' + day(cv.endDate) : cv.status === 'transferred' ? 'with its replacement' : str(cv.status, 40));
      });
    });
    var live = onsite && covered;
    if ((services && order.status === 'complete') || live) done.teleios = latest(starts) || done.onsite || iso(order.updatedAt) || true;
    var sku = missing ? str(missing.sku, 100) : '', bi = missing ? C.boughtIn(order, missing.sku) : null;
    note.teleios = missing ? 'No warranty on file for ' + (sku || 'this unit') + (bi ? ': it is bought in' + (bi.mfr ? ' from ' + bi.mfr : '') + '; record the maker’s warranty on its unit passport in Omega Logic' : '')
      : waiting ? 'On site; the warranty is ' + str(waiting, 120) : 'On site; the warranty starts when the site is bound';
    /* the unit to open: Track links its passport, where the warranty is recorded */
    if (bi && missing.serial && !off) need = { kind: 'maker-warranty', serial: str(missing.serial, 100), sku: sku, mfr: bi.mfr || null };

    /* a unit the custody rules flag (lost, damaged, in transit too long…) is
       said on the step it holds back; the words are custody's own, no money */
    var flags = C.exceptions(held, products, now);
    if (flags.length) note.custody = str(flags[0].say, 200) + (flags.length > 1 ? ' (+' + (flags.length - 1) + ' more)' : '');
    /* after-sales service (an RMA, a return, a decommissioning) is a note
       on the step the ladder is at — the last one, when it is complete */
    var says = held.map(serviceSay).filter(Boolean);
    if (says.length) note.service = says[0] + (says.length > 1 ? ' (+' + (says.length - 1) + ' more)' : '');
  }

  /* everything up to the furthest step reached is done; the next is current */
  var reached = -1, i;
  for (i = 0; i < KEYS.length; i++) if (done[KEYS[i]]) reached = i;
  var complete = reached === KEYS.length - 1 && !off;
  var steps = STEPS.map(function (s, i2) {
    var state = i2 <= reached ? 'done' : i2 === reached + 1 ? 'current' : 'todo';
    var at = done[s.key] && done[s.key] !== true ? done[s.key] : null;
    var n2 = state === 'current' ? (note[s.key] || null) : null;
    if (state === 'current' && note.custody) n2 = (n2 ? n2 + ' · ' : '') + note.custody;
    if (state === 'current' && note.service) n2 = (n2 ? n2 + ' · ' : '') + note.service;
    return { key: s.key, label: s.label, phase: s.phase, state: state, at: at, note: n2 };
  });
  if (complete) steps[steps.length - 1].note = 'Delivered, on site and under warranty' + (note.service ? ' · ' + note.service : '');
  return { steps: steps, current: complete ? 'teleios' : KEYS[Math.min(reached + 1, KEYS.length - 1)], complete: complete, off: off, need: complete ? null : need };
}

/* The one line a list row shows (the Quote Desk, Today): where the quote IS
   — the furthest step reached, said as a state — or why it stopped. A step
   in progress reads as itself: released to the plant is "In production". */
var NOW_AT = { saved: 'Quote saved', sent: 'Sent · not opened yet', viewed: 'Viewed by the customer', approved: 'Approved',
  ordered: 'In Omega Logic · awaiting price', priced: 'Priced · awaiting acceptance', accepted: 'Accepted · awaiting release',
  ready: 'Ready to ship', shipped: 'Shipped', delivered: 'Delivered', received: 'Received', onsite: 'On site', teleios: 'Omega Teleios · complete' };
function stage(l) {
  if (!l || !Array.isArray(l.steps)) return { key: 'saved', label: NOW_AT.saved };
  if (l.off) return { key: l.off.key, label: l.off.label };
  var reached = 'saved', cur = null;
  l.steps.forEach(function (s) { if (s.state === 'done') reached = s.key; if (s.state === 'current') cur = s; });
  if (reached === 'released') return { key: 'building', label: (cur && cur.key === 'building' && cur.note) || 'In production' };
  if (reached === 'building') reached = 'ready';
  if (reached === 'approved' && cur && cur.key === 'ordered' && cur.note && !/^Sending/.test(cur.note)) return { key: 'approved', label: 'Approved · the order needs a retry' };
  return { key: reached, label: NOW_AT[reached] || reached };
}

module.exports = { STEPS: STEPS, KEYS: KEYS, SERVICE: SERVICE, ladder: ladder, stage: stage, shipping: shipping, standing: standing };
