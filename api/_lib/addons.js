/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Add to plan, for a workspace billed OUTSIDE the package engine (Tommy,
 * 2026-09-27: "these should allow me to buy them immediately and not email
 * clearsky it should allow them to add to plan and then charge their credit
 * card or saved payment method").
 *
 * A legacy workspace (billing.packaged !== true: a tier on Stripe's or
 * ClearSky's own paper, often a signed contract) keeps its plan, its price
 * and its billing exactly as they are. What it buys here is an ADD-ON: the
 * module at the book's list price, on its own QuickBooks invoice, paid first
 * by card on QuickBooks' secure page (a card saved there pays in one click,
 * and Autopay pays each renewal). Nothing switches on before QuickBooks shows
 * the invoice paid; then the module is on, renewed monthly on the day of the
 * first purchase, and switched off again only when a renewal stays unpaid
 * past the book's grace. The plan underneath is never touched; moving the
 * whole workspace onto a package stays ClearSky's (the admin Package tab).
 *
 *   billing/current.addOns   Admin SDK only (the rules deny a browser)
 *     modules      bought: a paid purchase adds (a fresh start replaces),
 *                  a reversed purchase takes back; staff may edit it
 *     live         switched on now, derived by settle() from the invoices
 *     state        awaiting_payment · paid · past_due · lapsed
 *     billingDay, nextInvoiceOn, paidThrough, accessUntil
 *     monthlyCents, monthlyDisplay, pending (what waits for payment)
 *     granted      what switching on wrote into the legacy grant fields, so
 *                  switching off takes back exactly that, never what staff set
 *   billing/current/invoices/addon-…   kind 'addon': a purchase (add[]) or
 *                  a renewal (modules[]), reconciled with every other invoice
 *                  by package-billing.reconcile
 *
 * ON, for a workspace billed outside the engine, is what its readers already
 * honour, never a second rule:
 *   an Omega Logic part   logic-access holds it while addOns.live lists it
 *   a module's tools      toolOverrides[tool] = true (and the toolAccess
 *                         allowlist, when the workspace has one): what
 *                         ClearSky used to do by hand in the master console
 *   editor capabilities   the legacy add-on keys omega-caps reads (LEGACY)
 * Which modules the plan already holds is the pages' own rule,
 * OmegaWorkspaceHub.moduleState, run here on the tools catalog.
 */
'use strict';
var M = require('./modules'), P = require('./subscription-pricing'), B = require('./pricebook'), R = require('./proration');
var Q = require('./qbo-billing'), BP = require('./billing-profile'), Mode = require('./packaging-mode');
var LOGIC = ['logic-office', 'logic-plant', 'logic-materials', 'logic-logistics', 'logic-customer'];
/* The legacy add-on keys (omega-caps.js ADDON_GRANTS) that switch a module's
   editor capabilities on where the legacy editor gates them (data-cap:
   schematic, riser, export, engineering, compute, permitting). A module whose
   capabilities the legacy editor does not gate needs none. Pinned against
   omega-caps and the catalog by scripts/test-addons.js. */
var LEGACY = { plansets: ['schematics', 'exports'], siteintel: ['parcelscreen'], engineering: ['engineering'], compute: ['compute'], permitting: ['permitting'], whitelabel: ['whitelabel'] };
/* omega-tenant.js TIER_LEVEL: the level a legacy workspace's tiles are
   judged at. scripts/test-addons.js asserts the two are the same. */
var TIER_LEVEL = { trial: 3, standard: 1, pro: 2, deluxe: 2, enterprise: 3, internal: 3, partner: 2 };
function fail(message, status, code) { var e = new Error(message); e.status = status || 409; if (code) e.code = code; throw e; }
function isLogic(k) { return LOGIC.indexOf(k) >= 0; }
function order(keys) {
  var set = {}; (keys || []).forEach(function (k) { if (typeof k === 'string') set[k] = true; });
  return M.catalog().map(function (m) { return m.key; }).filter(function (k) { return set[k] && k !== 'lite'; });
}
function label(k) { var m = M.get(k); return m ? m.name : k; }
function names(keys) { return order(keys).map(label); }
function sum(lines) { return lines.reduce(function (n, l) { return n + l.amountCents; }, 0); }
function isAddon(r) { return !!r && r.kind === 'addon'; }
function instant(v) { return typeof v === 'number' ? v : v && typeof v.toMillis === 'function' ? v.toMillis() : Date.parse(v); }

/* What is switched on now: the add-ons the last reconciliation left on, and
   only while their paid period and the book's grace last. logic-access and
   the workspace read this; settle() is its only writer. */
function live(billing, now) {
  var a = billing && billing.addOns;
  if (!a || !Array.isArray(a.live) || !a.live.length) return [];
  var until = instant(a.accessUntil);
  if (!isFinite(until) || (now == null ? Date.now() : now) >= until) return [];
  return order(a.live);
}
/* The legacy workspace as the tools catalog judges it: the org's own grant
   fields (omega-tenant.js mergeEntitlements, without a member's list). */
function workspace(orgId, b) {
  var ws = { orgId: orgId, toolOverrides: b.toolOverrides || {}, addons: b.addons || [] };
  if (b.tier && TIER_LEVEL[b.tier] != null) ws.tierLevel = TIER_LEVEL[b.tier];
  if (Array.isArray(b.toolAccess)) ws.toolAccess = b.toolAccess.slice();
  return ws;
}
/* Does the plan (with its live add-ons) already hold this module? The
   Modules page and the store ask OmegaWorkspaceHub.moduleState; so does
   this, on the tools catalog as omega-tools.js seeds it (publish-tools keeps
   the live catalog in step), so the server never sells what a page shows
   as Live. */
function held(orgId, b, key, now) {
  var m = M.get(key); if (!m || key === 'lite') return true;
  var T = require('../../omega-tools.js'), HUB = require('../../omega-workspace-hub.js'), ws = workspace(orgId, b);
  return HUB.moduleState(m, { packaged: false, modules: [], addons: ws.addons, addOns: live(b, now), tierLevel: ws.tierLevel,
    canOpen: function (k) { var t = T.byKey(k); return !!t && T.isUnlocked(t, ws); }, tool: function (k) { return T.byKey(k); } }) === 'held';
}

/* The add-ons' own monthly price: each module at the book's list price, the
   five Omega Logic parts as the bundle once the add-ons complete it. No floor
   and no tier: the plan underneath is billed where it always was. */
function line(k, book) { return { itemKey: 'module:' + k, name: label(k), quantity: 1, amountCents: book.modules[k].priceCents }; }
function price(keys, book) {
  var mods = order(keys), logic = mods.filter(isLogic), lines = [];
  mods.forEach(function (k) { if (!isLogic(k)) lines.push(line(k, book)); });
  var bundle = logic.length === LOGIC.length;
  if (bundle) lines.push({ itemKey: 'logic-bundle', name: book.logicBundle.name, quantity: 1, amountCents: book.logicBundle.priceCents, modules: logic });
  else logic.forEach(function (k) { lines.push(line(k, book)); });
  var cents = sum(lines), logicCents = sum(lines.filter(function (l) { return l.itemKey === 'logic-bundle' || isLogic(l.itemKey.slice(7)); }));
  return { modules: mods, lines: lines, monthlyCents: cents, logicCents: logicCents, bundle: bundle, display: P.money(cents) + '/month' };
}
function scaled(lines, numerator, denominator) {
  var out = lines.map(function (l) { return Object.assign({}, l, { quantity: 1, amountCents: Math.round(l.amountCents * numerator / denominator) }); });
  var target = Math.round(sum(lines) * numerator / denominator), rounded = sum(out);
  if (out.length) out[0].amountCents += target - rounded;
  return out;
}
/* A purchase inside a paid add-on cycle: what it adds, prorated to the
   add-on billing day. The fifth Logic part is one bundle line for the
   difference, which may be nothing (the bundle costs less than four parts). */
function deltaLines(before, after, add, book, remaining, days) {
  var lines = [];
  add.forEach(function (k) { if (!isLogic(k)) lines.push(line(k, book)); });
  var logicAdded = add.filter(isLogic);
  if (logicAdded.length) {
    if (after.bundle && !before.bundle) lines.push({ itemKey: 'logic-bundle', name: book.logicBundle.name + ' · completes the five parts', quantity: 1, amountCents: after.logicCents - before.logicCents, modules: after.modules.filter(isLogic) });
    else logicAdded.forEach(function (k) { lines.push(line(k, book)); });
  }
  return scaled(lines, remaining, days).filter(function (l) { return l.amountCents !== 0; });
}
function wanted(list) {
  if (!Array.isArray(list) || !list.length || list.length > 24) fail('Choose at least one module to add', 400);
  var out = [];
  list.forEach(function (k) {
    if (typeof k !== 'string' || !M.get(k)) fail('Unknown module', 400);
    if (k === 'lite') fail('Omega Design is always included', 400);
    if (out.indexOf(k) < 0) out.push(k);
  });
  return out;
}
/* The requested modules and what they need that the workspace does not hold. */
function closure(has, add) {
  var out = [];
  function take(k) { if (k === 'lite' || has(k) || out.indexOf(k) >= 0) return; M.get(k).requires.forEach(take); out.push(k); }
  add.forEach(take);
  return order(out);
}
function pending(rows) {
  return (rows || []).filter(function (r) { return isAddon(r) && r.state === 'unpaid' && r.qboInvoiceId; })
    .sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); })
    .map(function (r) { var keys = r.purpose === 'renewal' ? r.modules : r.add;
      return { id: r.id, purpose: r.purpose || 'purchase', add: order(keys), names: names(keys), totalCents: r.totalCents, display: P.money(r.totalCents || 0),
        paymentLink: r.paymentLink || null, date: r.date, expiresOn: r.purpose === 'renewal' ? null : (r.cycle && r.cycle.end) || null }; });
}
function ordinal(d) { var s = ['th', 'st', 'nd', 'rd'], v = d % 100; return d + (s[(v - 20) % 10] || s[v] || s[0]); }
function current(c) { return c.root.collection('billing').doc('current'); }
async function records(c) { return (await current(c).collection('invoices').orderBy('date').get()).docs.map(function (d) { return d.data(); }); }
/* Whether a card payment can be taken here at all (the engine's own guard:
   the billing flag, and the sandbox or the live company). The engine's words
   name flags and realms; a customer hears only that it is not open yet. */
function payable(c) {
  try { require('./package-billing').guard(c); return { ok: true }; }
  catch (e) { return { ok: false, detail: e.message }; }
}
function gate(c, rows, now) {
  var b = c.billing;
  if (b.packaged === true) return { canBuy: false, reason: 'This workspace is on a subscription package: add modules on the Ladder, which prices and invoices them.' };
  if (!c.billingExists) return { canBuy: false, reason: 'Your workspace has no plan on record yet, so nothing can be added to it. ClearSky sets the plan up once; then Add to plan works here.' };
  if (c.org.status !== 'active') return { canBuy: false, reason: 'Your workspace is not active.' };
  var open = pending(rows);
  if (open.length) return { canBuy: false, reason: (open[0].purpose === 'renewal' ? 'Your add-on renewal is waiting for payment' : 'An add-on is waiting for payment: ' + open[0].names.join(', ')) + '. Pay it' + (open[0].purpose === 'renewal' ? '' : ' or cancel it') + ' first.' };
  var pay = payable(c);
  if (!pay.ok) return { canBuy: false, reason: 'Card payments are not open for this workspace yet.', detail: pay.detail };
  return { canBuy: true };
}

/* ── The quote: pure, from a loaded context and the invoice records ────── */
function quote(c, rows, input, now, staff) {
  var b = c.billing, book = c.book, a = b.addOns || {}, orgId = c.root.id, today = R.iso(now);
  /* a package is judged by its own projection, never by the legacy rule below */
  if (b.packaged === true) fail('This workspace is on a subscription package: add modules on the Ladder, which prices and invoices them.', 409);
  var have = live(b, now), inCycle = !!a.billingDay && a.state === 'paid' && have.length > 0;
  var add = closure(function (k) { return held(orgId, b, k, now); }, wanted(input.add));
  if (!add.length) fail('Already on your plan', 409);
  var day = inCycle ? a.billingDay : new Date(now).getUTCDate(), cycle = R.cycle(today, day);
  var before = price(inCycle ? have : [], book), after = price((inCycle ? have : []).concat(add), book);
  var lines = inCycle ? deltaLines(before, after, add, book, cycle.remainingDays, cycle.days) : after.lines.map(function (l) { return Object.assign({}, l); });
  var total = sum(lines);
  if (total < 0) { lines = []; total = 0; }
  var included = total === 0, g = gate(c, rows, now), needsProfile = !(c.profile && c.profile.legalName);
  var previewId = Q.key(B.stable({ org: orgId, book: book.version, have: inCycle ? have : [], add: add, fresh: !inCycle, day: day, cycle: cycle, lines: lines, total: total }));
  var then = after.display + ' on the ' + ordinal(day) + ', on its own invoice beside your plan' + (inCycle ? ' (add-ons were ' + before.display + ')' : '');
  var out = { orgId: orgId, previewId: previewId, effectiveAt: now, add: add, addNames: names(add), requested: order(wanted(input.add)), lines: lines, todayCents: total,
    monthlyCents: after.monthlyCents, monthlyBeforeCents: before.monthlyCents, monthlyDisplay: after.display, billingDay: day, fresh: !inCycle, included: included,
    cycle: { start: cycle.start, end: cycle.end, days: cycle.days, remainingDays: cycle.remainingDays }, activation: included ? 'immediate' : 'on-payment',
    canBuy: g.canBuy, reason: g.reason || null, needsProfile: needsProfile, pending: pending(rows), payment: 'quickbooks',
    display: {
      amount: P.money(total),
      today: included ? 'Nothing to pay today: it is covered by the add-ons you already pay for.' : P.money(total) + ' today, for ' + (inCycle ? cycle.remainingDays + ' of ' + cycle.days + ' days until your add-on billing date, ' + cycle.end : today + ' to ' + cycle.end),
      then: 'then ' + then,
      activation: included ? 'It switches on now.' : 'Pay by card on QuickBooks\' secure page; a card you saved there pays in one click. It switches on the moment the payment clears.',
      plan: 'Your plan and its billing stay exactly as they are.' } };
  if (staff && g.detail) out.detail = g.detail;
  return out;
}
async function context(db, orgId) {
  var root = db.doc('omega_orgs/' + orgId);
  var rows = await Promise.all([root.get(), root.collection('billing').doc('current').get(), root.collection('billing').doc('profile').get()]);
  if (!rows[0].exists) fail('This workspace has no account record yet, so it cannot be billed. ClearSky sets it up once; then Add to plan works here.', 404);
  var billing = rows[1].exists ? rows[1].data() : {};
  var book = await B.load(db, billing.packaged === true ? billing.pricebookVersion || B.VERSION : B.VERSION);
  return { root: root, org: rows[0].data(), billing: billing, billingExists: rows[1].exists, profile: rows[2].exists ? rows[2].data() : null, book: book };
}
async function preview(db, orgId, input, now, staff) { var c = await context(db, orgId); return quote(c, await records(c), input, now, staff); }

/* ── The grants: what `on` needs written on the legacy record ────────────
   Takes back what an earlier settle() wrote and is no longer wanted (only
   where its value is still there), writes what is wanted and missing, and
   records which is which. Staff values are never ours to take back. */
function grant(billing, on) {
  var prev = (billing.addOns && billing.addOns.granted) || {}, prevOv = prev.toolOverrides || {}, prevAccess = prev.toolAccess || [], prevAddons = prev.addons || [];
  var want = { tools: [], addons: [] };
  order(on).forEach(function (k) {
    M.get(k).tools.forEach(function (t) { if (want.tools.indexOf(t) < 0) want.tools.push(t); });
    (LEGACY[k] || []).forEach(function (x) { if (want.addons.indexOf(x) < 0) want.addons.push(x); });
  });
  var has = Object.prototype.hasOwnProperty, ov = Object.assign({}, billing.toolOverrides || {}), granted = { toolOverrides: {}, toolAccess: [], addons: [] };
  Object.keys(prevOv).forEach(function (t) {
    if (want.tools.indexOf(t) >= 0) { granted.toolOverrides[t] = prevOv[t]; if (ov[t] !== true) ov[t] = true; return; }
    if (ov[t] === true) { if (prevOv[t] === null || prevOv[t] === undefined) delete ov[t]; else ov[t] = prevOv[t]; }
  });
  want.tools.forEach(function (t) {
    if (has.call(granted.toolOverrides, t) || ov[t] === true) return;
    granted.toolOverrides[t] = has.call(ov, t) ? ov[t] : null; ov[t] = true;
  });
  var out = { toolOverrides: ov, granted: granted };
  if (Array.isArray(billing.toolAccess)) {
    var access = billing.toolAccess.slice();
    prevAccess.forEach(function (t) { if (want.tools.indexOf(t) >= 0) return; var i = access.indexOf(t); if (i >= 0) access.splice(i, 1); });
    want.tools.forEach(function (t) { if (access.indexOf(t) < 0) { access.push(t); granted.toolAccess.push(t); } else if (prevAccess.indexOf(t) >= 0) granted.toolAccess.push(t); });
    out.toolAccess = access;
  }
  var addons = (billing.addons || []).slice();
  prevAddons.forEach(function (x) { if (want.addons.indexOf(x) >= 0) return; var i = addons.indexOf(x); if (i >= 0) addons.splice(i, 1); });
  want.addons.forEach(function (x) { if (addons.indexOf(x) < 0) { addons.push(x); granted.addons.push(x); } else if (prevAddons.indexOf(x) >= 0) granted.addons.push(x); });
  out.addons = addons;
  return out;
}
/* ── What is switched on, from what was bought and what is paid ──────────
   Paid through = the latest paid add-on period's end; the add-ons stay on
   until then plus the book's grace (business days), the same window a
   package gets. Returns the billing patch: addOns and the grant fields. */
function settle(billing, rows, book, now) {
  var a = Object.assign({}, billing.addOns || {}), bought = order(a.modules || []), mine = (rows || []).filter(isAddon);
  var paid = mine.filter(function (r) { return r.state === 'paid' && r.period && r.period.end; });
  var through = paid.reduce(function (d, r) { return !d || r.period.end > d ? r.period.end : d; }, null);
  var until = through ? R.date(R.addDays(R.businessDays(through, book.policy.failedPaymentGraceBusinessDays), 1)) : null;
  var on = !!until && now < until && bought.length > 0;
  var openRenewal = mine.some(function (r) { return r.purpose === 'renewal' && r.state === 'unpaid' && r.qboInvoiceId; });
  var waiting = mine.some(function (r) { return r.purpose !== 'renewal' && r.state === 'unpaid' && r.qboInvoiceId; });
  var issued = mine.filter(function (r) { return (r.qboInvoiceId || r.state === 'paid') && r.period && r.period.end && ['cancelled', 'expired', 'reversed'].indexOf(r.state) < 0; });
  var next = issued.reduce(function (d, r) { return !d || r.period.end > d ? r.period.end : d; }, null);
  var p = price(bought, book), liveMods = on ? bought : [];
  a.modules = bought; a.live = liveMods;
  a.state = on ? (openRenewal ? 'past_due' : 'paid') : through ? 'lapsed' : waiting ? 'awaiting_payment' : 'none';
  a.paidThrough = through; a.accessUntil = until; a.nextInvoiceOn = bought.length ? next : null;
  a.monthlyCents = p.monthlyCents; a.monthlyDisplay = bought.length ? p.display : null; a.pending = pending(mine);
  var g = grant(billing, liveMods);
  a.granted = g.granted;
  var patch = { addOns: a, toolOverrides: g.toolOverrides, addons: g.addons };
  if (g.toolAccess) patch.toolAccess = g.toolAccess;
  return patch;
}
/* A purchase moving to paid or reversed changes what was bought. Paid after
   a cancel or after its period passed is still honoured (the customer paid)
   and the caller flags it for a person. */
function boughtAfter(billing, record, from, to) {
  var a = billing.addOns || {}, bought = order(a.modules || []);
  if (record.purpose === 'renewal') return null;
  if (to === 'paid' && from !== 'paid') {
    var next = record.fresh ? order(record.add) : order(bought.concat(record.add || []));
    return { modules: next, billingDay: record.fresh || !a.billingDay ? record.billingDay : a.billingDay };
  }
  if (to === 'reversed' && from === 'paid') return { modules: bought.filter(function (k) { return (record.add || []).indexOf(k) < 0; }), billingDay: a.billingDay || null };
  return null;
}

/* ── Buy: issue the invoice (or switch on at once when nothing is owed) ── */
async function buy(db, orgId, input, caller, now, deps) {
  var c = await context(db, orgId);
  if (typeof input.previewId !== 'string' || !/^[a-f0-9]{48}$/.test(input.previewId)) fail('The price changed; review it again before paying');
  var cur = current(c), op = cur.collection('operations').doc('addon-' + input.previewId);
  var fingerprint = Q.key(B.stable({ add: input.add }));
  var done = await op.get();
  if (done.exists && done.data().state === 'done') {
    if (done.data().requestFingerprint !== fingerprint) fail('A purchase id cannot be reused with different inputs');
    return done.data().result;
  }
  var rows = await records(c), q = quote(c, rows, input, now, caller.staff);
  if (input.previewId !== q.previewId) fail('The price changed; review it again before paying');
  var at = input.effectiveAt;
  if (!Number.isSafeInteger(at) || at > now || now - at > 10 * 60000) fail('Refresh the price');
  if (!q.canBuy) fail(q.reason);
  if (q.needsProfile) fail('Add your billing contact first: it is who QuickBooks invoices.', 409, 'billing-profile');
  require('./package-billing').guard(c);
  var today = R.iso(now), id = 'addon-' + q.previewId;
  var record = { kind: 'addon', purpose: 'purchase', id: id, date: today, fresh: q.fresh, billingDay: q.billingDay, cycle: { start: q.cycle.start, end: q.cycle.end },
    period: { start: today, end: q.cycle.end }, add: q.add, lines: q.lines, subtotalCents: q.todayCents, totalCents: q.todayCents, monthlyCents: q.monthlyCents,
    pricebookVersion: c.book.version, marker: 'OMEGA add-on ' + orgId + ' / ' + today + ' / ' + q.previewId.slice(0, 12), memo: 'Add to plan: ' + q.addNames.join(', '),
    by: caller.email, createdAt: now };
  var replay = await db.runTransaction(async function (tx) {
    var old = await tx.get(op), live0 = await tx.get(cur), invoices = await tx.get(cur.collection('invoices').orderBy('date'));
    if (old.exists && old.data().state === 'done') return old.data().result;
    var fresh = live0.data() || {}, again = quote(Object.assign({}, c, { billing: fresh }), invoices.docs.map(function (d) { return d.data(); }), input, now);
    if (again.previewId !== q.previewId || !again.canBuy) fail('Your plan changed; review the price again');
    if (fresh.addOnLock && fresh.addOnLock.until > now) fail('A purchase is already being processed; retry shortly');
    tx.set(cur, { addOnLock: { id: id, until: now + 120000 } }, { merge: true });
    tx.set(op, { state: 'running', at: now, by: caller.email, requestFingerprint: fingerprint }, { merge: true });
    return null;
  });
  if (replay) return replay;
  try {
    var driver = Q.driver(c.book, deps), profile = BP.stored(c.profile);
    var customer = await driver.customer(orgId, profile, c.billing.qboCustomerId || null);
    var issued = q.todayCents > 0 ? await driver.invoice(record, profile, customer) : null;
    return await db.runTransaction(async function (tx) {
      var live1 = await tx.get(cur), invoices = await tx.get(cur.collection('invoices').orderBy('date')), bookRef = db.doc('pricebook/' + c.book.version), bookSnap = await tx.get(bookRef);
      var fresh = live1.data() || {};
      if (!fresh.addOnLock || fresh.addOnLock.id !== id) fail('The purchase moved; retry');
      var stored = Object.assign({}, record, issued ? { state: 'unpaid', qboInvoiceId: issued.id, qboCustomerId: customer, totalCents: issued.totalCents, paymentLink: issued.payUrl, issuedAt: now }
        : { state: 'paid', qboInvoiceId: null, qboCustomerId: customer, paidCents: 0, paymentLink: null, paidAt: now });
      tx.set(cur.collection('invoices').doc(id), stored);
      var base = fresh, moved = issued ? null : boughtAfter(fresh, stored, 'unpaid', 'paid');
      if (moved) base = Object.assign({}, fresh, { addOns: Object.assign({}, fresh.addOns || {}, moved) });
      var patch = settle(base, invoices.docs.map(function (d) { return d.data(); }).concat([stored]), c.book, now);
      patch.qboCustomerId = customer; patch.qboRealmId = c.book.qbo.realmId; patch.addOnLock = null; patch.updatedAt = now; patch.updatedBy = caller.email;
      tx.update(cur, patch);
      if (bookSnap.exists) B.freeze(tx, bookRef, bookSnap.data(), now);
      /* the runner renews and reconciles it: packagedLive is what the live
         runner's query reads (the sandbox runner reads packagingSandbox) */
      if (Mode.live()) tx.set(c.root, { packagedLive: true, updatedAt: now }, { merge: true });
      if (issued) tx.set(c.root.collection('notifications').doc('addon-invoice-' + id), { kind: 'billing', read: false, createdAt: now,
        text: 'Your invoice to add ' + q.addNames.join(', ') + ' is ready: ' + P.money(issued.totalCents) + '. Pay it by card in QuickBooks and it switches on as soon as the payment clears.',
        packageMail: 'packageInvoice', mailState: 'pending', paymentLink: issued.payUrl, amountDisplay: P.money(issued.totalCents) });
      var result = { ok: true, addOnId: id, state: issued ? 'awaiting_payment' : 'active', add: q.add, addNames: q.addNames, todayCents: stored.totalCents, display: P.money(stored.totalCents),
        paymentLink: stored.paymentLink || null, payLinkMissing: !!(issued && !issued.payUrl), expiresOn: q.cycle.end, monthlyDisplay: q.monthlyDisplay, live: patch.addOns.live };
      tx.set(op, { state: 'done', result: result, completedAt: now }, { merge: true });
      var event = { at: now, by: caller.email, action: issued ? 'addon-requested' : 'addon-included', changeId: id,
        was: { addOns: (fresh.addOns && fresh.addOns.modules) || [], tier: fresh.tier || null }, changed: { add: q.add, totalCents: stored.totalCents, monthlyCents: q.monthlyCents, state: stored.state, live: patch.addOns.live } };
      tx.set(cur.collection('history').doc(id), event); tx.set(c.root.collection('admin_audit').doc(id), event);
      return result;
    });
  } catch (e) {
    await db.runTransaction(async function (tx) {
      var live2 = await tx.get(cur), old = await tx.get(op), fresh = live2.data() || {};
      if (old.exists && old.data().state === 'done') return;
      if (fresh.addOnLock && fresh.addOnLock.id === id) tx.update(cur, { addOnLock: null });
      tx.set(op, { state: 'retry', failedAt: now }, { merge: true });
    });
    throw e;
  }
}
/* Cancel a purchase still waiting for payment. The QuickBooks invoice stays
   open until staff void it; a payment after this is honoured and flagged. */
async function cancel(db, orgId, addOnId, caller, now) {
  var c = await context(db, orgId);
  if (typeof addOnId !== 'string' || !/^addon-[a-f0-9]{48}$/.test(addOnId)) fail('Invalid add-on id', 400);
  var cur = current(c), ref = cur.collection('invoices').doc(addOnId);
  return db.runTransaction(async function (tx) {
    var snap = await tx.get(ref), live0 = await tx.get(cur), invoices = await tx.get(cur.collection('invoices').orderBy('date')), fresh = live0.data() || {};
    if (!snap.exists || !isAddon(snap.data()) || snap.data().purpose !== 'purchase') fail('No such add-on purchase', 404);
    var r = snap.data(); if (r.state !== 'unpaid') fail('Only a purchase waiting for payment can be cancelled');
    tx.update(ref, { state: 'cancelled', cancelledAt: now, cancelledBy: caller.email });
    var all = invoices.docs.map(function (d) { return d.id === addOnId ? Object.assign({}, d.data(), { state: 'cancelled' }) : d.data(); });
    var patch = settle(fresh, all, c.book, now); patch.updatedAt = now; patch.updatedBy = caller.email;
    tx.update(cur, patch);
    var event = { at: now, by: caller.email, action: 'addon-cancelled', changeId: addOnId, invoiceId: r.qboInvoiceId,
      was: { state: r.state }, changed: { state: 'cancelled', note: 'The QuickBooks invoice stays open until staff void it; a payment after this is flagged for review.' } };
    tx.set(cur.collection('history').doc(addOnId + '-cancel'), event); tx.set(c.root.collection('admin_audit').doc(addOnId + '-cancel'), event);
    return { ok: true, addOnId: addOnId, state: 'cancelled' };
  });
}
/* ── The monthly renewal, on the add-on billing day (the hourly runner) ── */
async function issue(db, orgId, now, deps) {
  var S = require('./package-billing'), c = await context(db, orgId); S.guard(c);
  var b = c.billing, a = b.addOns || {}, today = R.iso(now), bought = order(a.modules || []);
  if (b.packaged === true || !bought.length || !a.nextInvoiceOn || a.nextInvoiceOn > today || a.state !== 'paid' || !a.billingDay) return { skipped: true };
  if (c.org.status !== 'active') return { skipped: true };
  if (!b.qboCustomerId || b.qboRealmId !== c.book.qbo.realmId) fail('QuickBooks customer binding is required');
  var on = a.nextInvoiceOn, id = 'addon-renewal-' + on, cur = current(c), ref = cur.collection('invoices').doc(id);
  var plan = await db.runTransaction(async function (tx) {
    var existing = await tx.get(ref), live0 = await tx.get(cur), fresh = live0.data() || {};
    if (existing.exists && existing.data().qboInvoiceId) return null;
    var fa = fresh.addOns || {};
    if (fa.nextInvoiceOn !== on || fa.state !== 'paid') fail('Add-on billing date changed; retry');
    if (fresh.addOnInvoiceLock && fresh.addOnInvoiceLock.until > now) fail('The add-on renewal is already being issued');
    var mods = order(fa.modules || []), p = price(mods, c.book), cycle = R.cycle(on, fa.billingDay);
    var prepared = existing.exists ? existing.data() : { kind: 'addon', purpose: 'renewal', id: id, date: on, period: { start: on, end: cycle.end }, modules: mods, lines: p.lines,
      subtotalCents: p.monthlyCents, totalCents: p.monthlyCents, monthlyCents: p.monthlyCents, pricebookVersion: c.book.version,
      marker: 'OMEGA add-on ' + orgId + ' / ' + on, memo: 'Add-ons: ' + names(mods).join(', '), createdAt: now };
    tx.set(ref, Object.assign({}, prepared, { state: 'prepared' }));
    tx.set(cur, { addOnInvoiceLock: { date: on, until: now + 120000 } }, { merge: true });
    return prepared;
  });
  if (!plan) return { skipped: true, alreadyIssued: true };
  try {
    var issued = await Q.driver(c.book, deps).invoice(plan, BP.stored(c.profile), b.qboCustomerId);
    return await db.runTransaction(async function (tx) {
      var live1 = await tx.get(cur), inv = await tx.get(ref), invoices = await tx.get(cur.collection('invoices').orderBy('date')), fresh = live1.data() || {};
      if (inv.data().qboInvoiceId) return { alreadyIssued: true };
      if (!fresh.addOnInvoiceLock || fresh.addOnInvoiceLock.date !== plan.date) fail('Add-on renewal reservation changed; retry');
      var stored = Object.assign({}, inv.data(), { state: 'unpaid', qboInvoiceId: issued.id, qboCustomerId: b.qboCustomerId, totalCents: issued.totalCents, paymentLink: issued.payUrl, issuedAt: now });
      tx.set(ref, stored);
      var all = invoices.docs.map(function (d) { return d.id === id ? stored : d.data(); });
      var patch = settle(fresh, all, c.book, now); patch.addOnInvoiceLock = null;
      tx.update(cur, patch);
      tx.set(cur.collection('history').doc('addon-renewal-' + on), { at: now, by: 'billing-run', action: 'addon-invoice-issued', qboInvoiceId: issued.id, date: on, amountCents: issued.totalCents });
      tx.set(c.root.collection('notifications').doc('addon-invoice-' + id), { kind: 'billing', read: false, createdAt: now,
        text: 'Your add-on invoice is ready: ' + P.money(issued.totalCents) + ' for ' + names(plan.modules).join(', ') + ', ' + plan.period.start + ' to ' + plan.period.end + '. With Autopay on in QuickBooks it is charged to your saved card.',
        packageMail: 'packageInvoice', mailState: 'pending', paymentLink: issued.payUrl, amountDisplay: P.money(issued.totalCents) });
      return { issued: true, date: on, invoiceId: issued.id, paymentLink: issued.payUrl };
    });
  } catch (e) {
    await db.runTransaction(async function (tx) { var s = await tx.get(cur), lock = (s.data() || {}).addOnInvoiceLock; if (lock && lock.date === plan.date) tx.update(cur, { addOnInvoiceLock: null }); });
    throw e;
  }
}
/* What a page is told about the add-ons (Plan & billing, the store, the
   Modules page): bought, on, what they cost, what waits for payment. */
function view(billing, rows, now) {
  var a = billing.addOns;
  if (!a && !(rows || []).some(isAddon)) return null;
  a = a || {};
  var on = live(billing, now);
  return { modules: order(a.modules), names: names(a.modules), live: on, liveNames: names(on), state: a.state || 'none', monthlyCents: a.monthlyCents || 0,
    monthlyDisplay: a.monthlyDisplay || null, billingDay: a.billingDay || null, nextInvoiceOn: a.nextInvoiceOn || null, paidThrough: a.paidThrough || null,
    accessUntil: a.accessUntil == null ? null : a.accessUntil, pending: rows ? pending(rows) : (a.pending || []) };
}
module.exports = { LOGIC: LOGIC, LEGACY: LEGACY, TIER_LEVEL: TIER_LEVEL, live: live, held: held, price: price, quote: quote, preview: preview, buy: buy, cancel: cancel,
  issue: issue, settle: settle, grant: grant, boughtAfter: boughtAfter, pending: pending, view: view, context: context, records: records, isAddon: isAddon };
