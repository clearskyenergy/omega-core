/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Opt in by card, for a workspace billed OUTSIDE the package engine (Tommy,
 * 2026-09-27: "these should allow me to buy them immediately and not email
 * clearsky it should allow them to add to plan and then charge their credit
 * card or saved payment method"). On every module surface it is the one
 * card's Opt in (OmegaWorkspaceHub.moduleCard, the one menu in
 * omega-package-menu.js): the menu asks addon-quote first, and a module
 * that switches on exactly is bought here ("Opt in and pay", or "Turn it
 * on" for $0); anything else is the recorded request (plan-change opt-in).
 * Opt out of a paid add-on is stop(): it stays on until the end of the
 * month paid for and is not renewed; Cancel request withdraws that.
 *
 * A legacy workspace (billing.packaged !== true: a tier on Stripe's or
 * ClearSky's own paper, often a signed contract) keeps its plan, its price
 * and its billing exactly as they are. What it buys here is an ADD-ON: the
 * module at the book's list price, on its own invoice beside the plan — on
 * the workspace's rail (rail(): QuickBooks, or Stripe under
 * PACKAGING_PROVIDER=stripe on the plan's own Stripe customer) — paid first
 * by card on that rail's secure page (a card saved there pays in one click).
 * Nothing switches on before the rail shows the invoice paid
 * (package-billing.reconcile); then the module is on, renewed monthly on the day of the
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
 *   its Site Map commands the editor opens exactly the module's own
 *                         commands while addOns.live lists it (omega-caps,
 *                         from package-access.legacy(): the add-ons on and
 *                         the catalog's ribbon), as a package's are, never a
 *                         whole tab (2026-09-27, the editor's Opt in)
 *   anything else         the legacy key its reader honours (LEGACY)
 * Which modules the plan already holds is the pages' own rule,
 * OmegaWorkspaceHub.moduleState, run here on the tools catalog.
 */
'use strict';
var M = require('./modules'), P = require('./subscription-pricing'), B = require('./pricebook'), R = require('./proration');
var Q = require('./qbo-billing'), BP = require('./billing-profile'), Mode = require('./packaging-mode'), D = require('./billing-driver');
var LOGIC = ['logic-office', 'logic-plant', 'logic-materials', 'logic-logistics', 'logic-customer'];
/* The rail an add-on bills through. A workspace whose add-ons are already
   invoiced through QuickBooks stays there (its customer record decides, as
   billing-driver.providerOf decides a package's); otherwise the
   deployment's rail (PACKAGING_PROVIDER), and on Stripe the workspace's OWN
   customer — the one Plan & billing's card door links (stripe-customer
   link, the ONE writer of a legacy plan's stripeCustomerId) — with the
   add-on on its own send_invoice invoice beside the plan, never a second
   customer. A plan ClearSky invoices through QuickBooks (stripe-customer
   railOf) keeps its add-ons on QuickBooks too. */
function rail(b) {
  b = b || {};
  if (b.qboCustomerId) return 'quickbooks';
  if (Mode.provider() !== 'stripe') return 'quickbooks';
  return require('./stripe-customer').railOf(b) === 'stripe' ? 'stripe' : 'quickbooks';
}
function railName(b) { return D.name(rail(b)); }
/* the billing profile an invoice carries: QuickBooks needs the whole one; on Stripe a saved one adds the PO, none is fine */
function profileFor(c, provider) { return provider === 'stripe' && !(c.profile && c.profile.legalName) ? {} : BP.stored(c.profile); }
/* the rail's own page: QuickBooks' page, Stripe's page */
function pageOf(name) { return name + (/s$/.test(name) ? '\'' : '\'s') + ' secure page'; }
/* The legacy add-on keys a module's OTHER readers honour. Never an editor
   key: the keys omega-caps reads (ADDON_GRANTS: compute, engineering,
   schematics, exports …) open a whole Site Map tab (data-cap), every
   module's commands on it with the one bought, so a live add-on's editor
   half is opened by the module itself instead (omega-caps, exactly its own
   commands, from package-access.legacy()). Pinned by scripts/test-addons.js. */
var LEGACY = { whitelabel: ['whitelabel'] };
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
/* a purchase whose invoice is gone: refunded or voided (reversed), or cancelled and voided on Stripe */
function dead(r) { return r.state === 'reversed' || (r.state === 'cancelled' && r.voided === true); }
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
  /* the older billing.omegaLogic flag holds all of Omega Logic, as logic-access wholeLogic() reads it: judged, never written */
  var addons = (b.addons || []).slice(); if (b.omegaLogic === true && addons.indexOf('omega-logic') < 0) addons.push('omega-logic');
  var ws = { orgId: orgId, toolOverrides: b.toolOverrides || {}, addons: addons };
  if (b.tier && TIER_LEVEL[b.tier] != null) ws.tierLevel = TIER_LEVEL[b.tier];
  if (Array.isArray(b.toolAccess)) ws.toolAccess = b.toolAccess.slice();
  return ws;
}
/* The pages' own judge of a legacy module: the ONE legacy ctx
   (OmegaWorkspaceHub.legacyCtx, which workspace.html, marketplace.html, the
   editor's plan chip and the admin Package tab build too): its tools on the
   tools catalog and its Site Map commands on the editor's own ladder
   (omega-caps.js, the file the editor runs: it loads here as a module, its
   browser parts untouched), for the workspace with no person. `editorOn`:
   the add-ons whose own commands the editor opens (addOns.live, or what a
   purchase would leave on). */
function judge(orgId, b, editorOn) {
  var T = require('../../omega-tools.js'), HUB = require('../../omega-workspace-hub.js'), CAPS = require('../../omega-caps.js').OmegaCaps;
  var ctx = HUB.legacyCtx({ tools: T, ws: workspace(orgId, b), billing: b, caps: CAPS, who: { orgId: orgId }, addOns: [] });
  ctx.editorModules = editorOn || [];
  return { HUB: HUB, ctx: ctx };
}
/* Does the plan (with its live add-ons) already hold this module? The
   Modules page and the store ask OmegaWorkspaceHub.moduleState; so does
   this, on the tools catalog as omega-tools.js seeds it (publish-tools keeps
   the live catalog in step), so the server never sells what a page shows
   as Live. */
function held(orgId, b, key, now) {
  var m = M.get(key); if (!m || key === 'lite') return true;
  var j = judge(orgId, b); j.ctx.addOns = live(b, now);
  return j.HUB.moduleState(m, j.ctx) === 'held';
}
/* ── Sold only when it switches on EXACTLY (Tommy's decision, 2026-09-27).
   A legacy plan's editor opens Site Map a whole tab at a time (data-cap), so
   a legacy key would leave part of a module off (Omega Storage on Standard:
   its tools, not its Analyze-tab commands) or switch on part of another
   (Omega Compute's tab carries Intel's and Engineer's commands too). So the
   editor opens a live add-on's OWN commands instead, wherever they sit and
   nothing else on their tab (omega-caps, by the catalog's ribbon): the
   Opt in the editor offers where the plan stops is a purchase on every plan.
   The purchase is simulated on the record the grants would write and the
   add-ons it would leave on, and judged by the same rule as the pages,
   without the add-on shortcut: every module bought must be held, and no
   other module may gain anything (Omega Design, always included, aside).
   An Omega Logic part is exact on every plan: logic-access reads
   addOns.live itself. What is still not exact (a module with no tools and
   no commands to switch on beside the plan: the storefront, set up with
   ClearSky) is not sold here; the quote says why and offers the recorded
   request (plan-change opt-in). */
var SETUP_ONLY = ['whitelabel'];
function exact(orgId, b, keys, now) {
  var mine = order(keys).filter(function (k) { return !isLogic(k); });
  if (!mine.length) return { exact: true, partial: [], spill: [], shut: [] };
  var have = live(b, now), on = order(have.concat(keys)), g = grant(b, on);
  var after = Object.assign({}, b, { toolOverrides: g.toolOverrides, addons: g.addons }, g.toolAccess ? { toolAccess: g.toolAccess } : {});
  function measure(bill, editorOn) {
    var j = judge(orgId, bill, editorOn), out = {};
    M.catalog().forEach(function (m) { var t = j.HUB.moduleTools(m, j.ctx), e = j.HUB.moduleEditor(m, j.ctx); out[m.key] = { state: j.HUB.moduleState(m, j.ctx), open: t.open + e.open, shut: e.open < e.total }; });
    return out;
  }
  var was = measure(b, have), will = measure(after, on);
  /* the storefront is a contract line item ClearSky sets up (the tenant
     record's whiteLabel, staff-written: CLAUDE.md, White label), never
     switched on by a card, even where the add-on key alone would open it */
  var partial = mine.filter(function (k) { return SETUP_ONLY.indexOf(k) >= 0 || will[k].state !== 'held'; });
  var spill = M.catalog().map(function (m) { return m.key; }).filter(function (k) { return k !== 'lite' && keys.indexOf(k) < 0 && will[k].open > was[k].open; });
  return { exact: !partial.length && !spill.length, partial: partial, spill: spill, shut: partial.filter(function (k) { return will[k].shut; }) };
}
function listed(keys) { var n = names(keys); return n.length < 2 ? n.join('') : n.slice(0, -1).join(', ') + ' and ' + n[n.length - 1]; }
function why(x, add) {
  var tail = ' ClearSky can include it by moving the workspace onto a package, where each module is priced on its own.';
  var setup = x.partial.filter(function (k) { return x.shut.indexOf(k) < 0; }), many;
  if (setup.length) { many = setup.length > 1; return listed(setup) + (many ? ' are' : ' is') + ' set up with ClearSky, so ' + (many ? 'they' : 'it') + ' cannot be added here on ' + (many ? 'their' : 'its') + ' own.' + tail; }
  if (x.shut.length) { many = x.shut.length > 1; return listed(x.shut) + ' cannot be added to your plan on ' + (many ? 'their' : 'its') + ' own: on your plan Site Map opens ' + (many ? 'their' : 'its') + ' commands a whole tab at a time, so ' + (many ? 'they' : 'it') + ' would be only partly on.' + tail; }
  return listed(add) + ' cannot be added to your plan on ' + (add.length > 1 ? 'their' : 'its') + ' own: on your plan ' + (add.length > 1 ? 'they' : 'it') + ' would also switch on part of ' + listed(x.spill) + '.' + tail;
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
  return (rows || []).filter(function (r) { return isAddon(r) && r.state === 'unpaid' && D.issued(r); })
    .sort(function (a, b) { return String(a.date).localeCompare(String(b.date)); })
    .map(function (r) { var keys = r.purpose === 'renewal' ? r.modules : r.add;
      return { id: r.id, purpose: r.purpose || 'purchase', add: order(keys), names: names(keys), totalCents: r.totalCents, display: P.money(r.totalCents || 0),
        paymentLink: r.paymentLink || null, payWith: D.name(D.recordProvider(r)), date: r.date, expiresOn: r.purpose === 'renewal' ? null : (r.cycle && r.cycle.end) || null }; });
}
function ordinal(d) { var s = ['th', 'st', 'nd', 'rd'], v = d % 100; return d + (s[(v - 20) % 10] || s[v] || s[0]); }
function current(c) { return c.root.collection('billing').doc('current'); }
async function records(c) { return (await current(c).collection('invoices').orderBy('date').get()).docs.map(function (d) { return d.data(); }); }
/* Whether a card payment can be taken here at all (the engine's own guard:
   the billing flag, and the sandbox or the live company). The engine's words
   name flags and realms; a customer hears only that it is not open yet. */
function payable(c) {
  try { require('./package-billing').guard(c, rail(c.billing)); return { ok: true }; }
  catch (e) { return { ok: false, detail: e.message }; }
}
function gate(c, rows, now, x, add) {
  var b = c.billing;
  if (b.packaged === true) return { canBuy: false, reason: 'This workspace is on a subscription package: add modules on the Ladder, which prices and invoices them.' };
  /* no plan to add to: never sold here; Opt in records the request instead
     (the menu then says billing is not set up, with the email to ClearSky) */
  if (!c.billingExists) return { canBuy: false, reason: 'Your workspace has no plan on record yet, so nothing can be added to it by card. ClearSky sets the plan up once; then Opt in works here.', request: true };
  if (c.org.status !== 'active') return { canBuy: false, reason: 'Your workspace is not active.' };
  /* not exact on this plan: never sold here; the recorded request instead */
  if (x && !x.exact) return { canBuy: false, reason: why(x, add), request: true };
  var open = pending(rows);
  if (open.length) return { canBuy: false, reason: (open[0].purpose === 'renewal' ? 'Your add-on renewal is waiting for payment' : 'An add-on is waiting for payment: ' + open[0].names.join(', ')) + '. Pay it' + (open[0].purpose === 'renewal' ? '' : ' or cancel it') + ' first.' };
  var pay = payable(c);
  if (!pay.ok) return { canBuy: false, reason: 'Card payments are not open for this workspace yet.', detail: pay.detail, request: true };
  return { canBuy: true };
}

/* ── The quote: pure, from a loaded context and the invoice records ────── */
function quote(c, rows, input, now, staff) {
  var b = c.billing, book = c.book, a = b.addOns || {}, orgId = c.root.id, today = R.iso(now);
  /* a package is judged by its own projection, never by the legacy rule below */
  if (b.packaged === true) fail('This workspace is on a subscription package: add modules on the Ladder, which prices and invoices them.', 409);
  var have = live(b, now), inCycle = !!a.billingDay && a.state === 'paid' && have.length > 0;
  /* the add-on renewal is due and not issued yet: a purchase now would start
     the next cycle and the renewal would be skipped (a free month) */
  var renewalDue = inCycle && !!a.nextInvoiceOn && a.nextInvoiceOn <= today;
  var add = closure(function (k) { return held(orgId, b, k, now); }, wanted(input.add));
  if (!add.length) fail('Already on your plan', 409);
  var day = inCycle ? a.billingDay : new Date(now).getUTCDate(), cycle = R.cycle(today, day);
  var before = price(inCycle ? have : [], book), after = price((inCycle ? have : []).concat(add), book);
  var lines = inCycle ? deltaLines(before, after, add, book, cycle.remainingDays, cycle.days) : after.lines.map(function (l) { return Object.assign({}, l); });
  var total = sum(lines);
  if (total < 0) { lines = []; total = 0; }
  /* QuickBooks invoices a customer with a billing address (billing-profile
     customer); Stripe's hosted page needs only the workspace and the payer's
     email (stripe-customer contact), so it never asks for the form first */
  var included = total === 0, needsProfile = rail(b) === 'quickbooks' && !(c.profile && c.profile.legalName);
  var g = renewalDue ? { canBuy: false, reason: 'Your add-on renewal is being issued today. Add modules once it has gone through; that usually takes under an hour.' } : gate(c, rows, now, exact(orgId, b, add, now), add);
  var basis = { org: orgId, book: book.version, have: inCycle ? have : [], add: add, fresh: !inCycle, day: day, cycle: cycle, lines: lines, total: total };
  /* a purchase whose invoice is dead (voided or refunded: 'reversed') makes
     the next request of this cycle a new purchase, with its own invoice */
  var reissued = (rows || []).filter(function (r) { return isAddon(r) && r.purpose !== 'renewal' && dead(r) && r.cycle && r.cycle.start === cycle.start; }).length;
  if (reissued) basis.reissued = reissued;
  var previewId = Q.key(B.stable(basis));
  /* cancel voids a Stripe invoice but never a QuickBooks one: a cancelled
     purchase of any of these modules whose invoice is still open, asked for
     again with another id (another day, another set), is never a second
     invoice beside it; the same request the same day revives it (buy) */
  var stillOpen = (rows || []).filter(function (r) { return isAddon(r) && r.purpose !== 'renewal' && r.state === 'cancelled' && !dead(r) && D.issued(r) && r.id !== 'addon-' + previewId && (r.add || []).some(function (k) { return add.indexOf(k) >= 0; }); })[0];
  if (g.canBuy && stillOpen) g = { canBuy: false, reason: 'Your cancelled request for ' + names(stillOpen.add).join(', ') + ' still has an open ' + D.name(D.recordProvider(stillOpen)) + ' invoice' + (stillOpen.paymentLink ? ' (' + stillOpen.paymentLink + ')' : '') + '. Pay that invoice to switch it on, or ask ClearSky to void it and add it again.' };
  var then = after.display + ' on the ' + ordinal(day) + ', on its own invoice beside your plan' + (inCycle ? ' (add-ons were ' + before.display + ')' : '');
  var out = { orgId: orgId, previewId: previewId, effectiveAt: now, add: add, addNames: names(add), requested: order(wanted(input.add)), lines: lines, todayCents: total,
    monthlyCents: after.monthlyCents, monthlyBeforeCents: before.monthlyCents, monthlyDisplay: after.display, billingDay: day, fresh: !inCycle, included: included,
    cycle: { start: cycle.start, end: cycle.end, days: cycle.days, remainingDays: cycle.remainingDays }, activation: included ? 'immediate' : 'on-payment',
    canBuy: g.canBuy, reason: g.reason || null, request: g.request === true, needsProfile: needsProfile, pending: pending(rows), payment: rail(b), payWith: railName(b),
    display: {
      amount: P.money(total),
      today: included ? 'Nothing to pay today: it is covered by the add-ons you already pay for.' : P.money(total) + ' today, for ' + (inCycle ? cycle.remainingDays + ' of ' + cycle.days + ' days until your add-on billing date, ' + cycle.end : today + ' to ' + cycle.end),
      then: 'then ' + then,
      activation: included ? 'It switches on now.' : rail(b) === 'stripe' ? 'The card on file with Stripe is charged now; without one, pay by card on ' + pageOf('Stripe') + '. It switches on the moment the payment clears.'
        : 'Pay by card on ' + pageOf(railName(b)) + '; a card you saved there pays in one click. It switches on the moment the payment clears.',
      plan: 'Your plan and its billing stay exactly as they are.' } };
  if (staff && g.detail) out.detail = g.detail;
  return out;
}
async function context(db, orgId) {
  var root = db.doc('omega_orgs/' + orgId);
  var rows = await Promise.all([root.get(), root.collection('billing').doc('current').get(), root.collection('billing').doc('profile').get()]);
  if (!rows[0].exists) fail('This workspace has no account record yet, so it cannot be billed. ClearSky sets it up once; then Opt in works here.', 404);
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
  var openRenewal = mine.some(function (r) { return r.purpose === 'renewal' && r.state === 'unpaid' && D.issued(r); });
  var waiting = mine.some(function (r) { return r.purpose !== 'renewal' && r.state === 'unpaid' && D.issued(r); });
  var issued = mine.filter(function (r) { return (D.issued(r) || r.state === 'paid') && r.period && r.period.end && ['cancelled', 'expired', 'reversed'].indexOf(r.state) < 0; });
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
function boughtAfter(billing, record, from, to, rows) {
  var a = billing.addOns || {}, bought = order(a.modules || []);
  if (record.purpose === 'renewal') return null;
  if (to === 'paid' && from !== 'paid') {
    /* a fresh purchase replaces what was bought only while nothing is on: a
       late payment of a cancelled or expired one, landing after a later
       purchase is paid, adds to it and never switches that off */
    var replace = record.fresh && ['paid', 'past_due'].indexOf(a.state) < 0;
    var next = replace ? order(record.add) : order(bought.concat(record.add || []));
    return { modules: next, billingDay: replace || !a.billingDay ? record.billingDay : a.billingDay };
  }
  if (to === 'reversed' && from === 'paid') {
    /* a module stays while a LATER paid add-on invoice still covers it (the
       renewal that billed it, a purchase after it); a part never outlives
       what it requires */
    var covered = function (k) { return (rows || []).some(function (r) { return isAddon(r) && r.id !== record.id && r.state === 'paid' && r.period && record.period && r.period.end > record.period.end && ((r.purpose === 'renewal' ? r.modules : r.add) || []).indexOf(k) >= 0; }); };
    var keep = bought.filter(function (k) { return (record.add || []).indexOf(k) < 0 || covered(k); });
    keep = keep.filter(function (k) { return M.get(k).requires.every(function (q) { return q === 'lite' || keep.indexOf(q) >= 0; }); });
    return { modules: keep, billingDay: a.billingDay || null };
  }
  return null;
}

/* ── Buy: issue the invoice (or switch on at once when nothing is owed) ── */
/* The card on file paid the invoice at Stripe a moment ago: the SAME
   reconcile the webhook and the runner run reads it back and switches the
   modules on, so the purchase answers on, not waiting, and its replay says
   the same. A reconcile that cannot read Stripe right now leaves the answer
   as issued: the money moved, and the webhook or the runner settles it. */
async function settleCharged(db, c, orgId, op, result, invoiceId, now, deps) {
  try { await require('./package-billing').reconcile(db, orgId, now, deps, { only: invoiceId }); }
  catch (e) { console.warn('[addons] charged, not yet read back for ' + orgId + ':', e && e.message); return result; }
  var b = (await current(c).get()).data() || {}, live = (b.addOns && b.addOns.live) || [];
  var on = (result.add || []).every(function (k) { return live.indexOf(k) >= 0; });
  var final = Object.assign({}, result, { state: on ? 'active' : result.state, live: live.slice(), paymentLink: on ? null : result.paymentLink });
  await op.set({ result: final }, { merge: true });
  return final;
}
async function buy(db, orgId, input, caller, now, deps) {
  var c = await context(db, orgId);
  if (typeof input.previewId !== 'string' || !/^[a-f0-9]{48}$/.test(input.previewId)) fail('The price changed; review it again before paying');
  var cur = current(c), op = cur.collection('operations').doc('addon-' + input.previewId);
  var fingerprint = Q.key(B.stable({ add: input.add }));
  var done = await op.get();
  if (done.exists && done.data().state === 'done') {
    if (done.data().requestFingerprint !== fingerprint) fail('A purchase id cannot be reused with different inputs');
    var mine = cur.collection('invoices').doc('addon-' + input.previewId), had = await mine.get();
    if (had.exists && had.data().state === 'reversed') fail('The price changed; review it again before paying');
    if (had.exists && had.data().state === 'cancelled') return revive(db, c, mine, input, done.data().result, caller, now);
    return done.data().result;
  }
  var rows = await records(c), q = quote(c, rows, input, now, caller.staff);
  if (input.previewId !== q.previewId) fail('The price changed; review it again before paying');
  var at = input.effectiveAt;
  if (!Number.isSafeInteger(at) || at > now || now - at > 10 * 60000) fail('Refresh the price');
  if (!q.canBuy) fail(q.reason);
  var provider = rail(c.billing), payWith = D.name(provider);
  if (q.needsProfile) fail('Add your billing contact first: it is who ' + payWith + ' invoices.', 409, 'billing-profile');
  require('./package-billing').guard(c, provider);
  var today = R.iso(now), id = 'addon-' + q.previewId;
  var record = { kind: 'addon', purpose: 'purchase', id: id, date: today, fresh: q.fresh, billingDay: q.billingDay, cycle: { start: q.cycle.start, end: q.cycle.end },
    period: { start: today, end: q.cycle.end }, add: q.add, lines: q.lines, subtotalCents: q.todayCents, totalCents: q.todayCents, monthlyCents: q.monthlyCents,
    pricebookVersion: c.book.version, marker: 'OMEGA add-on ' + orgId + ' / ' + today + ' / ' + q.previewId.slice(0, 12), memo: 'Add-on: ' + q.addNames.join(', '),
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
    var driver = D.driver(c.book, provider, deps), profile = profileFor(c, provider), customer;
    if (provider === 'stripe') {
      /* the workspace's own Stripe customer, through the one door that links
         it (Plan & billing's card): its mode, its mark and its card checked */
      var SC = require('./stripe-customer'), sc = await SC.context(db, orgId);
      customer = String((await SC.link(db, sc, caller, (deps && deps.stripe) || SC.client(), now)).id);
    } else customer = await driver.customer(orgId, profile, c.billing.qboCustomerId || null);
    /* on Stripe the card on file pays now (stripe-billing invoice, charge);
       without one, or refused, the invoice waits on its hosted page */
    var issued = q.todayCents > 0 ? await driver.invoice(record, profile, customer, { charge: provider === 'stripe' }) : null;
    var answer = await db.runTransaction(async function (tx) {
      var live1 = await tx.get(cur), invoices = await tx.get(cur.collection('invoices').orderBy('date')), bookRef = db.doc('pricebook/' + c.book.version), bookSnap = await tx.get(bookRef);
      var fresh = live1.data() || {};
      if (!fresh.addOnLock || fresh.addOnLock.id !== id) fail('The purchase moved; retry');
      var stored = Object.assign({}, record, issued ? Object.assign({ state: 'unpaid', totalCents: issued.totalCents, paymentLink: issued.payUrl, issuedAt: now, chargedAt: issued.charged ? now : null, card: issued.card || null }, D.invoiceFields(provider, issued.id, customer))
        : Object.assign({ state: 'paid', provider: provider, paidCents: 0, paymentLink: null, paidAt: now }, provider === 'stripe' ? { stripeCustomerId: customer } : { qboInvoiceId: null, qboCustomerId: customer }));
      tx.set(cur.collection('invoices').doc(id), stored);
      var base = fresh, moved = issued ? null : boughtAfter(fresh, stored, 'unpaid', 'paid');
      if (moved) base = Object.assign({}, fresh, { addOns: Object.assign({}, fresh.addOns || {}, moved) });
      var patch = settle(base, invoices.docs.map(function (d) { return d.data(); }).concat([stored]), c.book, now);
      if (provider === 'quickbooks') { patch.qboCustomerId = customer; patch.qboRealmId = c.book.qbo.realmId; }
      patch.addOnLock = null; patch.updatedAt = now; patch.updatedBy = caller.email;
      tx.update(cur, patch);
      if (bookSnap.exists) B.freeze(tx, bookRef, bookSnap.data(), now);
      /* the runner renews and reconciles it: packagedLive is what the live
         runner's query reads (the sandbox runner reads packagingSandbox) */
      if (Mode.live(provider)) tx.set(c.root, { packagedLive: true, updatedAt: now }, { merge: true });
      /* paid by the card on file, the reconcile below tells them what is on; else the invoice and its page, and why the card did not pay */
      if (issued && !issued.charged) tx.set(c.root.collection('notifications').doc('addon-invoice-' + id), { kind: 'billing', read: false, createdAt: now,
        text: (issued.declined ? 'Your card on file was not charged (' + issued.declined + '). ' : '') + 'Your invoice to add ' + q.addNames.join(', ') + ' is ready: ' + P.money(issued.totalCents) + '. Pay it by card on ' + pageOf(payWith) + (issued.declined ? ', or change the card in Plan & billing,' : '') + ' and it switches on as soon as the payment clears.',
        packageMail: 'packageInvoice', mailState: 'pending', paymentLink: issued.payUrl, amountDisplay: P.money(issued.totalCents), payWith: payWith });
      var result = { ok: true, addOnId: id, state: issued ? 'awaiting_payment' : 'active', add: q.add, addNames: q.addNames, todayCents: stored.totalCents, display: P.money(stored.totalCents),
        paymentLink: stored.paymentLink || null, payWith: payWith, payLinkMissing: !!(issued && !issued.payUrl && !issued.charged), expiresOn: q.cycle.end, monthlyDisplay: q.monthlyDisplay, live: patch.addOns.live,
        charged: !!(issued && issued.charged), card: (issued && issued.card) || null, declined: (issued && issued.declined) || null };
      tx.set(op, { state: 'done', result: result, completedAt: now }, { merge: true });
      var event = { at: now, by: caller.email, action: issued ? 'addon-requested' : 'addon-included', changeId: id,
        was: { addOns: (fresh.addOns && fresh.addOns.modules) || [], tier: fresh.tier || null }, changed: { add: q.add, totalCents: stored.totalCents, monthlyCents: q.monthlyCents, state: stored.state, live: patch.addOns.live, charged: !!(issued && issued.charged) } };
      tx.set(cur.collection('history').doc(id), event); tx.set(c.root.collection('admin_audit').doc(id), event);
      return result;
    });
    if (issued && issued.charged) answer = await settleCharged(db, c, orgId, op, answer, issued.id, now, deps);
    return answer;
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
/* The same purchase asked for again after its cancel, while its QuickBooks
   invoice is still open: it waits for payment again on that invoice, never
   a second one. Re-checked as a request (same price, nothing else waiting). */
async function revive(db, c, ref, input, result, caller, now) {
  var cur = current(c);
  return db.runTransaction(async function (tx) {
    var snap = await tx.get(ref), live0 = await tx.get(cur), invoices = await tx.get(cur.collection('invoices').orderBy('date')), fresh = live0.data() || {};
    var rows = invoices.docs.map(function (d) { return d.data(); }), r = snap.data();
    if (!r || r.state !== 'cancelled' || dead(r)) fail('Your plan changed; review the price again');
    var again = quote(Object.assign({}, c, { billing: fresh }), rows, input, now);
    if (again.previewId !== input.previewId) fail('Your plan changed; review the price again');
    if (!again.canBuy) fail(again.reason);
    tx.update(ref, { state: 'unpaid', cancelledAt: null, cancelledBy: null, reopenedAt: now, reopenedBy: caller.email });
    var all = rows.map(function (d) { return d.id === r.id ? Object.assign({}, d, { state: 'unpaid' }) : d; });
    var patch = settle(fresh, all, c.book, now); patch.updatedAt = now; patch.updatedBy = caller.email;
    tx.update(cur, patch);
    var event = { at: now, by: caller.email, action: 'addon-reopened', changeId: r.id, invoiceId: D.invoiceId(r),
      was: { state: 'cancelled' }, changed: { state: 'unpaid', note: 'Asked for again after its cancel: it waits on the same ' + D.name(D.recordProvider(r)) + ' invoice, never a second one.' } };
    tx.set(cur.collection('history').doc(r.id + '-reopen-' + now), event); tx.set(c.root.collection('admin_audit').doc(r.id + '-reopen-' + now), event);
    return Object.assign({}, result, { state: 'awaiting_payment', paymentLink: r.paymentLink || result.paymentLink || null, reopened: true });
  });
}
/* Cancel a purchase still waiting for payment. The QuickBooks invoice stays
   open until staff void it; a payment after this is honoured and flagged. */
async function cancel(db, orgId, addOnId, caller, now, deps) {
  var c = await context(db, orgId);
  if (typeof addOnId !== 'string' || !/^addon-[a-f0-9]{48}$/.test(addOnId)) fail('Invalid add-on id', 400);
  var cur = current(c), ref = cur.collection('invoices').doc(addOnId), before = await ref.get(), voided = false;
  if (!before.exists || !isAddon(before.data()) || before.data().purpose !== 'purchase') fail('No such add-on purchase', 404);
  if (before.data().state !== 'unpaid') fail('Only a purchase waiting for payment can be cancelled');
  /* on Stripe the open invoice is voided first, so nothing payable is left
     beside the plan (a paid one is refused there); QuickBooks' stays open
     until staff void it, as before */
  if (D.recordProvider(before.data()) === 'stripe' && D.issued(before.data())) { await D.driver(c.book, 'stripe', deps).voidOpen(before.data()); voided = true; }
  return db.runTransaction(async function (tx) {
    var snap = await tx.get(ref), live0 = await tx.get(cur), invoices = await tx.get(cur.collection('invoices').orderBy('date')), fresh = live0.data() || {};
    if (!snap.exists || !isAddon(snap.data()) || snap.data().purpose !== 'purchase') fail('No such add-on purchase', 404);
    var r = snap.data(); if (r.state !== 'unpaid') fail('Only a purchase waiting for payment can be cancelled');
    var mark = { state: 'cancelled', cancelledAt: now, cancelledBy: caller.email };
    if (voided) { mark.voided = true; mark.paymentLink = null; }
    tx.update(ref, mark);
    var all = invoices.docs.map(function (d) { return d.id === addOnId ? Object.assign({}, d.data(), mark) : d.data(); });
    var patch = settle(fresh, all, c.book, now); patch.updatedAt = now; patch.updatedBy = caller.email;
    tx.update(cur, patch);
    var event = { at: now, by: caller.email, action: 'addon-cancelled', changeId: addOnId, invoiceId: D.invoiceId(r),
      was: { state: r.state }, changed: { state: 'cancelled', voided: voided, note: voided ? 'The Stripe invoice was voided; nothing is left to pay.' : 'The ' + D.name(D.recordProvider(r)) + ' invoice stays open until staff void it; a payment after this is flagged for review.' } };
    tx.set(cur.collection('history').doc(addOnId + '-cancel'), event); tx.set(c.root.collection('admin_audit').doc(addOnId + '-cancel'), event);
    return { ok: true, addOnId: addOnId, state: 'cancelled' };
  });
}

/* ── Opt out of a paid add-on: it stops at the end of the month paid for ──
   (the one card's Opt out on a module the plan holds through an add-on; its
   Cancel request is `withdraw`). Recorded on addOns.ending[key]; the renewal
   on nextInvoiceOn is priced without it and it switches off that day
   (issue()). Nothing is refunded and nothing changes before then. Stopping
   a part stops what needs it (Office takes the departments bought on it);
   keeping one keeps what it needs. */
function endingKeys(a) { var e = (a && a.ending) || {}; return order(Object.keys(e).filter(function (k) { return e[k] && e[k].status === 'requested'; })); }
function needsOf(k) { return (M.get(k) || { requires: [] }).requires; }
async function stop(db, orgId, input, caller, now, withdraw) {
  var c = await context(db, orgId), b = c.billing, a = b.addOns || {}, cur = current(c);
  if (b.packaged === true) fail('This workspace is on a subscription package: opt out through the menu, which queues it for the quarterly review.', 409);
  if (!c.billingExists) fail('This workspace has no add-ons to stop.', 409);
  var want = wanted(input.remove), bought = order(a.modules || []), ending = endingKeys(a);
  function plan(bill) {
    var fa = bill.addOns || {}, have = order(fa.modules || []), end = endingKeys(fa), out = [];
    want.forEach(function (k) {
      if (have.indexOf(k) < 0) fail(label(k) + ' is not an add-on on your plan.', 409);
      if (withdraw ? end.indexOf(k) < 0 : end.indexOf(k) >= 0) fail(withdraw ? 'No request to withdraw' : 'Already requested', 409);
    });
    if (!withdraw && fa.state !== 'paid') fail('Your add-on renewal is waiting for payment: pay it first, or leave it unpaid and the add-ons switch off after the grace period.', 409);
    function take(k) {
      if (out.indexOf(k) >= 0) return; out.push(k);
      if (!withdraw) have.forEach(function (o) { if (end.indexOf(o) < 0 && needsOf(o).indexOf(k) >= 0) take(o); });
      else needsOf(k).forEach(function (r) { if (end.indexOf(r) >= 0) take(r); });
    }
    want.forEach(take);
    var after = withdraw ? end.filter(function (k) { return out.indexOf(k) < 0; }) : end.concat(out);
    return { keys: order(out), endsOn: fa.nextInvoiceOn || null, before: price(have.filter(function (k) { return end.indexOf(k) < 0; }), c.book), after: price(have.filter(function (k) { return after.indexOf(k) < 0; }), c.book) };
  }
  var p = plan(b), day = p.endsOn ? p.endsOn : 'the end of the month you paid for';
  var note = withdraw ? listed(p.keys) + (p.keys.length > 1 ? ' stay' : ' stays') + ' on and renew' + (p.keys.length > 1 ? '' : 's') + ' on ' + day + ': your add-ons stay ' + p.after.display + '.'
    : listed(p.keys) + (p.keys.length > 1 ? ' stay' : ' stays') + ' on until ' + day + ', the end of the month you paid for, and ' + (p.keys.length > 1 ? 'are' : 'is') + ' not renewed. ' + (p.after.monthlyCents ? 'Your add-ons then cost ' + p.after.display + ' (now ' + p.before.display + ').' : 'Nothing is billed for add-ons after that.') + ' No refund for time already paid. Your plan and its billing stay exactly as they are.';
  if (input.dryRun === true) return { dryRun: true, remove: p.keys, names: names(p.keys), endsOn: p.endsOn, beforeDisplay: p.before.display, afterDisplay: p.after.display, withdraw: !!withdraw, note: note };
  return db.runTransaction(async function (tx) {
    var live0 = await tx.get(cur), fresh = live0.data() || {}, q = plan(fresh), fa = fresh.addOns || {}, map = Object.assign({}, fa.ending || {}), at = R.iso(now);
    if (q.keys.join() !== p.keys.join()) fail('Your add-ons changed; review it again');
    q.keys.forEach(function (k) { map[k] = withdraw ? Object.assign({}, map[k], { status: 'withdrawn', withdrawnAt: at, withdrawnBy: caller.email }) : { key: k, name: label(k), endsOn: q.endsOn, requestedAt: at, requestedBy: caller.email, status: 'requested' }; });
    tx.update(cur, { addOns: Object.assign({}, fa, { ending: map }), updatedAt: now, updatedBy: caller.email });
    var id = (withdraw ? 'addon-stop-withdrawn-' : 'addon-stop-') + Q.key(B.stable({ k: q.keys, at: now }));
    var event = { at: now, by: caller.email, action: withdraw ? 'addon-stop-withdrawn' : 'addon-stop-requested', changeId: id, changed: { modules: q.keys, names: names(q.keys), endsOn: q.endsOn, monthlyAfter: q.after.display, note: note } };
    tx.set(cur.collection('history').doc(id), event); tx.set(c.root.collection('admin_audit').doc(id), event);
    return { ok: true, withdrawn: !!withdraw, remove: q.keys, names: names(q.keys), endsOn: q.endsOn, afterDisplay: q.after.display, ending: map, note: note };
  });
}
/* ── The monthly renewal, on the add-on billing day (the hourly runner) ── */
async function issue(db, orgId, now, deps) {
  var S = require('./package-billing'), c = await context(db, orgId), provider = rail(c.billing), payWith = D.name(provider); S.guard(c, provider);
  var b = c.billing, a = b.addOns || {}, today = R.iso(now), bought = order(a.modules || []);
  if (b.packaged === true || !bought.length || !a.nextInvoiceOn || a.nextInvoiceOn > today || a.state !== 'paid' || !a.billingDay) return { skipped: true };
  if (c.org.status !== 'active') return { skipped: true };
  if (!D.bound(b, provider, c.book)) fail(payWith + ' customer binding is required');
  var customerId = provider === 'stripe' ? b.stripeCustomerId : b.qboCustomerId;
  var on = a.nextInvoiceOn, id = 'addon-renewal-' + on, cur = current(c), ref = cur.collection('invoices').doc(id);
  var plan = await db.runTransaction(async function (tx) {
    var existing = await tx.get(ref), live0 = await tx.get(cur), fresh = live0.data() || {};
    if (existing.exists && D.issued(existing.data())) return null;
    var fa = fresh.addOns || {};
    if (fa.nextInvoiceOn !== on || fa.state !== 'paid') fail('Add-on billing date changed; retry');
    if (fresh.addOnInvoiceLock && fresh.addOnInvoiceLock.until > now) fail('The add-on renewal is already being issued');
    /* the month paid for is over for what was stopped (endingKeys); and with
       all of Omega Logic on the contract (logic-access wholeLogic), its parts
       are no longer billed here */
    var whole = (fresh.addons || []).indexOf('omega-logic') >= 0 || fresh.omegaLogic === true;
    var ending = endingKeys(fa), kept = order(fa.modules || []).filter(function (k) { return ending.indexOf(k) < 0; });
    var mods = kept.filter(function (k) { return !(whole && isLogic(k)); });
    if (ending.length && !existing.exists) {
      /* the month paid for is over: what was stopped leaves now, and its
         grants with it (settle), before the renewal is priced on the rest */
      var rows0 = (await tx.get(cur.collection('invoices').orderBy('date'))).docs.map(function (d) { return d.data(); }), endMap = Object.assign({}, fa.ending || {});
      ending.forEach(function (k) { endMap[k] = Object.assign({}, endMap[k], { status: 'done', endedAt: now }); });
      var gone = settle(Object.assign({}, fresh, { addOns: Object.assign({}, fa, { modules: kept, ending: endMap }) }), rows0, c.book, now);
      tx.update(cur, gone);
      var endEvent = { at: now, by: 'billing-run', action: 'addon-ended', changed: { ended: ending, names: names(ending), live: gone.addOns.live } };
      tx.set(cur.collection('history').doc('addon-ended-' + on), endEvent); tx.set(c.root.collection('admin_audit').doc('addon-ended-' + on), endEvent);
      if (!mods.length) return { ended: ending };
    }
    if (!mods.length) return null;
    var p = price(mods, c.book), cycle = R.cycle(on, fa.billingDay);
    var prepared = existing.exists ? existing.data() : { kind: 'addon', purpose: 'renewal', id: id, date: on, period: { start: on, end: cycle.end }, modules: mods, lines: p.lines,
      subtotalCents: p.monthlyCents, totalCents: p.monthlyCents, monthlyCents: p.monthlyCents, pricebookVersion: c.book.version,
      marker: 'OMEGA add-on ' + orgId + ' / ' + on, memo: 'Add-ons: ' + names(mods).join(', '), createdAt: now };
    tx.set(ref, Object.assign({}, prepared, { state: 'prepared' }));
    tx.set(cur, { addOnInvoiceLock: { date: on, until: now + 120000 } }, { merge: true });
    return prepared;
  });
  if (!plan) return { skipped: true, alreadyIssued: true };
  if (plan.ended) return { ended: plan.ended };
  try {
    /* on Stripe the card on file pays the renewal now; the runner's reconcile reads it back and keeps the add-ons on */
    var issued = await D.driver(c.book, provider, deps).invoice(plan, profileFor(c, provider), customerId, { charge: provider === 'stripe' });
    return await db.runTransaction(async function (tx) {
      var live1 = await tx.get(cur), inv = await tx.get(ref), invoices = await tx.get(cur.collection('invoices').orderBy('date')), fresh = live1.data() || {};
      if (D.issued(inv.data())) return { alreadyIssued: true };
      if (!fresh.addOnInvoiceLock || fresh.addOnInvoiceLock.date !== plan.date) fail('Add-on renewal reservation changed; retry');
      var stored = Object.assign({}, inv.data(), { state: 'unpaid', totalCents: issued.totalCents, paymentLink: issued.payUrl, issuedAt: now, chargedAt: issued.charged ? now : null, card: issued.card || null }, D.invoiceFields(provider, issued.id, customerId));
      tx.set(ref, stored);
      var all = invoices.docs.map(function (d) { return d.id === id ? stored : d.data(); });
      var patch = settle(fresh, all, c.book, now); patch.addOnInvoiceLock = null;
      tx.update(cur, patch);
      tx.set(cur.collection('history').doc('addon-renewal-' + on), { at: now, by: 'billing-run', action: 'addon-invoice-issued', invoiceId: issued.id, provider: provider, date: on, amountCents: issued.totalCents, charged: !!issued.charged });
      /* paid by the card on file, the reconcile's receipt is the mail; else the invoice and its page, and why the card did not pay */
      if (!issued.charged) tx.set(c.root.collection('notifications').doc('addon-invoice-' + id), { kind: 'billing', read: false, createdAt: now,
        text: (issued.declined ? 'Your card on file was not charged (' + issued.declined + '). ' : '') + 'Your add-on invoice is ready: ' + P.money(issued.totalCents) + ' for ' + names(plan.modules).join(', ') + ', ' + plan.period.start + ' to ' + plan.period.end + '. Pay it by card on ' + pageOf(payWith) + (issued.declined ? ', or change the card in Plan & billing' : ', or with the card saved there') + '.',
        packageMail: 'packageInvoice', mailState: 'pending', paymentLink: issued.payUrl, amountDisplay: P.money(issued.totalCents), payWith: payWith });
      return { issued: true, date: on, invoiceId: issued.id, paymentLink: issued.payUrl, charged: !!issued.charged };
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
    accessUntil: a.accessUntil == null ? null : a.accessUntil, pending: rows ? pending(rows) : (a.pending || []),
    ending: endingKeys(a).map(function (k) { return { key: k, name: label(k), endsOn: a.ending[k].endsOn || a.nextInvoiceOn || null, requestedAt: a.ending[k].requestedAt || null }; }), payWith: railName(billing) };
}
module.exports = { LOGIC: LOGIC, LEGACY: LEGACY, TIER_LEVEL: TIER_LEVEL, rail: rail, live: live, held: held, price: price, quote: quote, preview: preview, buy: buy, cancel: cancel, stop: stop, endingKeys: endingKeys,
  issue: issue, settle: settle, grant: grant, exact: exact, judge: judge, boughtAfter: boughtAfter, pending: pending, view: view, context: context, records: records, isAddon: isAddon };
