#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * api/_lib/prime-order.js — an approved customer quote becomes an Omega
 * Logic order in the SELLER's workspace (the workspace the rep is in), on
 * the Firestore double: a seller not on Omega Logic is told so in plain
 * words and the retry works once it is; the quoted battery is checked
 * against the seller's published products, and — when the seller has not
 * published it — ordered as a REFERENCE line resolved on the server from
 * the seller's own battery list (never from what the quote record says
 * about it) by the quote door's own rule (Q.offered), so a battery the list
 * no longer offers (FENECON's XXL outside FENECON) is refused in the door's
 * words while FENECON orders its own, marked { reference, mfr } with
 * procure{} naming its maker; a
 * battery the seller publishes is a normal line; one order per revision
 * (a deterministic id); the daily cap; the end client stamped on an
 * admitted account; the seller's own approved price on its own order, never
 * the cost or margin; and the office then prices and accepts it through
 * the workflow's own price step (D1, tenant-billed).
 */
'use strict';
var assert = require('node:assert/strict');
var F = require('./_lib/firestore-double');
var count = 0;
function ok(c, m) { assert.ok(c, m); count++; }
function eq(a, b, m) { assert.deepEqual(a, b, m); count++; }
async function refused(fn, status, re, label) {
  var err = null;
  try { await fn(); } catch (e) { err = e; }
  if (!err) assert.fail('expected ' + status + ': ' + label);
  assert.equal(err.status, status, label + ' → ' + err.message);
  if (re) assert.match(err.message, re, label);
  count++; return err;
}
var DB;
function httpError(st, m) { var e = new Error(m); e.status = st; return e; }
function safeOrg(v) { var s = String(v == null ? '' : v).trim().toLowerCase(); return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(s) ? s : ''; }
F.mock('../api/_lib/admin', { handler: function (fn) { return fn; }, httpError: httpError, db: function () { return DB; }, safeOrg: safeOrg,
  canActInOrg: async function (c, org) { return c.staff || c.orgId === org; },
  FieldValue: function () { return { serverTimestamp: function () { return 'TS'; } }; } });
var PO = require('../api/_lib/prime-order'), P = require('../api/_lib/logic-policy'), Q = require('../api/_lib/customer-quote'); var Cu = require('../api/_lib/custody');
var PP = require('../omega-prime-project.js');

var NOW = Date.parse('2026-10-17T15:00:00Z');
var SELLER = 'sunwave.energy', MFR = 'cleancell.us';
var SM = 'CLEANCELL-SM-1000-REV-H';
/* the seller's own battery list on the server: the reference Smart Module */
var LISTED = Q.unitsFor(SELLER, { name: 'Sunwave Energy', status: 'active' }, {}).filter(function (u) { return u.key === SM; })[0];
var PRODUCT = { sku: 'CC-SM-1000', name: 'Sunwave Smart Module 1 MW / 2 MWh', kind: 'product', kw: 1000, kwh: 2000, active: true };
function quote(extra) {
  return Object.assign({ id: 'qt-0123456789abcdef', orgId: SELLER, projectId: 'p1', quoteNo: 'SUNWAV-Q-20261017-ABCDE', rev: 2, status: 'approved',
    customer: { name: 'Dana Ruiz', company: 'Riverside Cold Chain', email: 'dana@riverside.co', phone: '312-555-0110', address: { line1: '9 Dock Rd', city: 'Gary', state: 'IN', zip: '46402' } },
    site: { address: '1200 W Lake St, Chicago, IL 60607', lat: 41.8855, lng: -87.6536, zip: '60607', utility: 'ComEd', circuit: 'Feeder 1234' },
    unit: { key: SM, sku: 'CC-SM-1000', mfr: 'CleanCell US', model: 'Smart Module - 1 MW / 2 MWh (non-BABA)', kw: 1000, kwh: 2000, hours: 2, vendorOrgId: null, source: 'reference' },
    pricing: { sellCents: 123456700, marginCents: 20000000, markupPct: 20 }, cost: { totalCents: { base: 103456700 } },
    seller: { name: 'Sunwave Energy', company: { legalName: 'Sunwave Energy LLC', phone: '312-555-0100', address: { line1: '1 Solar Way', city: 'Chicago', state: 'IL', postalCode: '60601' } }, rep: { name: 'Riley Rep', email: 'riley@sunwave.energy' } },
    acceptance: { approvedAt: NOW, approvedBy: { name: 'Dana Ruiz', title: 'Director', email: 'typed-by-approver@evil.example' } } }, extra || {});
}
function onLogic(org, name) {
  DB.seed('omega_orgs/' + org, { name: name, status: 'active' });
  DB.seed('omega_orgs/' + org + '/billing/current', { tier: 'enterprise', addons: ['omega-logic'] });
  DB.seed('omega_orgs/' + org + '/fulfillment/config', { enabled: true, accounting: 'tenant', terms: { depositPct: 30, dueDays: 30 } });
}
function reset(sellerOnLogic) {
  DB = new F.DB(); DB.serial = true;
  if (sellerOnLogic === false) { DB.seed('omega_orgs/' + SELLER, { name: 'Sunwave Energy', status: 'active' }); DB.seed('omega_orgs/' + SELLER + '/billing/current', { tier: 'standard' }); }
  else onLogic(SELLER, 'Sunwave Energy');
  DB.seed('omega_orgs/' + SELLER + '/storefront/config', { products: [] });
  DB.seed('omega_orgs/' + SELLER + '/members/r1', { role: 'owner', status: 'active' });
  /* the battery's maker is on the platform too: its workspace is never touched */
  onLogic(MFR, 'Clean Cell');
  DB.seed('omega_orgs/' + MFR, { name: 'Clean Cell', status: 'active', brands: ['cleancell us', 'cleancell', 'clean cell'] });
  DB.seed('omega_orgs/' + MFR + '/storefront/config', { products: [Object.assign({}, PRODUCT, { name: 'Smart Module (Clean Cell)' })] });
  DB.seed('projects/p1', { orgId: SELLER, name: 'Lake St', prime: { v: 2, unitKey: SM } });
}
function orders() { return Array.from(DB.data.entries()).filter(function (e) { return /^orders\/[^/]+$/.test(e[0]); }); }
function under(prefix) { return Array.from(DB.data.entries()).filter(function (e) { return e[0].indexOf(prefix) === 0; }); }

async function run() {
  ok(LISTED && LISTED.sku === 'CC-SM-1000' && LISTED.source === 'reference' && LISTED.mfr === 'CleanCell US', 'the fixture: the reference Smart Module is on the seller’s own list');
  ok(!('manufacturerOf' in PO), 'no brand-map routing: the order is the seller’s, whoever made the battery');

  /* ── what must hold, said plainly ── */
  reset();
  await refused(function () { return PO.create(DB, { quote: quote({ status: 'viewed' }), now: NOW }); }, 409, /Only an approved quote/, 'only an approved quote');

  /* ── a seller not on Omega Logic: a plain sentence, then the retry works ── */
  reset(false);
  var e1 = await refused(function () { return PO.create(DB, { quote: quote(), now: NOW }); }, 409, null, 'a seller without an Omega Logic office');
  eq(e1.message, 'Sunwave Energy is not on Omega Logic yet — add Omega Logic to fulfil approved quotes here, then press Retry.', 'said in plain words, naming the workspace');
  ok(e1.plain === true && orders().length === 0, 'a plain refusal the quote records; no order anywhere');
  ok(under('omega_orgs/' + MFR + '/notifications/').length === 0, 'and nothing reaches the battery’s maker');
  DB.seed('omega_orgs/' + SELLER + '/billing/current', { tier: 'enterprise', addons: ['omega-logic'] });
  DB.seed('omega_orgs/' + SELLER + '/fulfillment/config', { enabled: true, accounting: 'tenant', terms: { depositPct: 30, dueDays: 30 } });
  var retried = await PO.create(DB, { quote: quote(), now: NOW });
  ok(retried.ok && retried.org === SELLER && orders().length === 1, 'once the workspace is on Omega Logic, the retry makes the order there');
  reset();
  DB.data.delete('omega_orgs/' + SELLER);
  var e2 = await refused(function () { return PO.create(DB, { quote: quote(), now: NOW }); }, 409, /^Sunwave Energy is not on Omega Logic yet/, 'a seller with no workspace record');
  ok(e2.plain === true, 'plain too');
  reset(); DB.seed('omega_orgs/' + SELLER, { name: 'Sunwave Energy', status: 'suspended' });
  await refused(function () { return PO.create(DB, { quote: quote(), now: NOW }); }, 409, /not on Omega Logic yet/, 'a suspended workspace runs no office');
  reset();
  await refused(function () { return PO.create(DB, { quote: quote({ orgId: '' }), now: NOW }); }, 409, /not on Omega Logic yet/, 'a quote with no workspace');

  /* ── the battery, from the seller's own list ── */
  reset();
  await refused(function () { return PO.create(DB, { quote: quote({ unit: { key: 'NOT-A-UNIT', sku: 'NOPE-1' } }), now: NOW }); }, 409, /^The battery \(NOT-A-UNIT\) is not on Sunwave Energy’s battery list any more/, 'a battery the seller’s list does not hold is never ordered');
  /* ONE rule with the quote door (Q.offered = omega-prime-project.js
     offered()): a quote saved on FENECON's XXL before it left every list
     but FENECON's (2026-10-17) is refused in the words the door uses, and
     told where to choose the unit; the same product under another key is
     the list's own entry */
  var poSrc = require('fs').readFileSync(require.resolve('../api/_lib/prime-order'), 'utf8');
  ok(Q.offered === PP.offered && /var unit = Q\.offered\(Q\.unitsFor\(org, ctx\.org, sf\), q\.unit\);/.test(poSrc) && !/function unitFrom|u\.key === key/.test(poSrc) && !('unitFrom' in PO), 'the hand-off resolves the battery by the door’s own rule, with no lookup of its own');
  var xxlQuote = quote({ unit: Q.unitOf(PP.XXL) });
  var ex = await refused(function () { return PO.create(DB, { quote: xxlQuote, now: NOW }); }, 409, null, 'the XXL outside FENECON is never ordered');
  eq(ex.message, 'The FENECON Industrial XXL is not on Sunwave Energy’s battery list any more, so its order line could not be checked. Choose the unit on Omega Prime’s Proposal step (the drawing is kept), save the proposal and send it again.', 'in the door’s words, naming where to choose');
  ok(ex.plain === true && orders().length === 0, 'a plain refusal the quote keeps; no order');
  var rekeyed = await PO.create(DB, { quote: quote({ unit: Object.assign({}, quote().unit, { key: 'SUNWAVE-SM-OLD', sku: 'cc-sm-1000' }) }), now: NOW });
  eq(DB.data.get('orders/' + rekeyed.orderId).items[0].sku, 'CC-SM-1000', 'the same product under another key is the list’s own entry, by its own SKU');
  reset();
  await refused(function () { return PO.create(DB, { quote: quote({ site: { address: 'somewhere near the river' }, customer: { name: 'Dana', company: 'Riverside' } }), now: NOW }); }, 409, /street, city, state and ZIP/, 'an address the order check cannot read');
  DB.seed('omega_orgs/' + SELLER + '/storefront/config', { products: [Object.assign({}, PRODUCT, { active: false })] });
  await refused(function () { return PO.create(DB, { quote: quote(), now: NOW }); }, 409, /lists CC-SM-1000 but not as an orderable product/, 'a SKU the seller switched off is refused, never re-added as a reference');
  DB.seed('omega_orgs/' + SELLER + '/storefront/config', { products: [Object.assign({}, PRODUCT, { kind: 'component' })] });
  await refused(function () { return PO.create(DB, { quote: quote(), now: NOW }); }, 409, /not as an orderable product/, 'nor a component');
  eq(orders().length, 0, 'none of that made an order');
  var dest = PO.destination(quote({ site: { address: 'near the river' } }));
  eq([dest.line1, dest.city, dest.state, dest.zip, dest.name], ['9 Dock Rd', 'Gary', 'IN', '46402', 'Riverside Cold Chain'], 'a site with no street falls back to the customer’s typed address');

  /* ── the seller on Omega Logic, the battery bought in: the reference line ── */
  reset();
  DB.seed('omega_orgs/' + SELLER + '/customer_index/dana@riverside.co', { customerId: 'acct1' });
  DB.seed('omega_orgs/' + SELLER + '/customers/acct1', { name: 'Riverside Cold Chain', status: 'active' });
  DB.seed('omega_orgs/' + SELLER + '/customers/acct1/users/dana@riverside.co', { email: 'dana@riverside.co', status: 'active', role: 'owner' });
  /* what the quote record says about the battery is only which one: its
     name, maker and figures come from the server's list */
  var forged = quote({ unit: Object.assign({}, quote().unit, { mfr: 'Evil Batteries', model: 'FORGED', name: 'FORGED', vendorOrgId: 'evil.example', source: 'tenant' }) });
  var made = await PO.create(DB, { quote: forged, now: NOW, by: 'customer' });
  var id = 'prime_' + P.key(SELLER + ':project:p1:qt-0123456789abcdef:2');
  ok(made.ok && made.orderId === id && made.org === SELLER && made.workspace === 'Sunwave Energy' && /^PRM-20261017-[A-Z0-9]{6}$/.test(made.orderNo), 'one order, in the SELLER’s workspace, its id deterministic: ' + made.orderNo);
  eq(made.logicUrl, '/omega-logic?org=sunwave.energy&order=' + id + '#orders', 'and the address of it in the seller’s own Omega Logic');
  ok(made.reference === true && made.manufacturer === 'CleanCell US', 'a reference line, its maker named');
  var o = DB.data.get('orders/' + id);
  ok(o.orgId === SELLER && o.orgName === 'Sunwave Energy' && o.status === 'new' && o.source === 'prime' && o.pricing === null && !o.logic, 'new, unpriced, in the seller’s own office');
  eq(o.items, [{ sku: 'CC-SM-1000', name: 'CleanCell US Smart Module - 1 MW / 2 MWh (non-BABA)', kind: 'product', qty: 1, reference: true, mfr: 'CleanCell US' }], 'the line: the quoted battery as a reference product, marked with its maker, from the server’s list');
  eq(o.procure, { mfr: 'CleanCell US', mfrOrgId: null, sku: 'CC-SM-1000', model: 'Smart Module - 1 MW / 2 MWh (non-BABA)' }, 'procure: the office knows the battery is bought in');
  eq(Cu.boughtIn(o, 'CC-SM-1000'), { sku: 'CC-SM-1000', mfr: 'CleanCell US', model: 'Smart Module - 1 MW / 2 MWh (non-BABA)' }, 'and custody’s ONE test reads it as bought in: its passport offers the maker’s warranty');
  ok(JSON.stringify(o).indexOf('FORGED') < 0 && JSON.stringify(o).indexOf('Evil') < 0 && JSON.stringify(o).indexOf('evil.example') < 0, 'nothing the quote record says about the battery’s maker or name reaches the order');
  eq(o.customer, { name: 'Dana Ruiz', email: 'dana@riverside.co', company: 'Riverside Cold Chain', phone: '312-555-0110', address: { line1: '1200 W Lake St', city: 'Chicago', state: 'IL', zip: '60607' }, notes: '' }, 'the buyer is the end client the rep typed');
  ok(o.customerId === 'acct1' && DB.data.get('omega_orgs/' + SELLER + '/customers/acct1').hasOrders === true, 'stamped on the account that admitted them; the account has orders');
  eq(o.delivery.destinations[0].address, { name: 'Riverside Cold Chain', line1: '1200 W Lake St', city: 'Chicago', state: 'IL', zip: '60607', country: 'US' }, 'delivered to the site, in the end client’s name');
  eq(o.delivery.legs, [], 'a delivery plan Logistics can ship against');
  eq(o.requestedTerms, { depositPct: 30, dueDays: 30 }, 'the seller’s own requested terms');
  eq(o.approvedQuote, { quoteId: 'qt-0123456789abcdef', quoteNo: 'SUNWAV-Q-20261017-ABCDE', rev: 2, totalCents: 123456700, note: 'The price your customer approved on proposal SUNWAV-Q-20261017-ABCDE.' }, 'the seller’s own approved price prefills its own office');
  ok(o.originatorOrgId === SELLER && o.sourceOrgId === SELLER && o.sourceQuoteId === 'qt-0123456789abcdef' && o.sourceQuoteRevision === 2 && o.purchaseOrder.proposal === 'qt-0123456789abcdef', 'it says where it came from');
  var j = JSON.stringify(o);
  ['20000000', '103456700', 'marginCents', 'margin', 'markup', 'typed-by-approver', 'Director'].forEach(function (w) { ok(j.indexOf(w) < 0, 'never on the order: ' + w); });
  ok(under('orders/' + id + '/events/').some(function (e) { return /awaiting the office’s price/.test(e[1].what) && /bought in from CleanCell US/.test(e[1].what); }), 'an event: awaiting the office’s price, the battery bought in');
  ok(under('omega_audit/').some(function (e) { return e[1].action === 'prime-order' && e[1].orderId === id && e[1].orgId === SELLER && e[1].reference === true; }), 'an audit row');
  ok(under('omega_orgs/' + SELLER + '/notifications/').some(function (e) { return e[1].kind === 'order' && e[1].orderId === id && /price it in Omega Logic/.test(e[1].text); }), 'the seller’s own office is notified');
  ok(under('omega_orgs/' + MFR + '/notifications/').length === 0 && !orders().some(function (e) { return e[1].orgId === MFR; }), 'the battery’s maker gets nothing: no order, no notification');
  eq(DB.data.get('projects/p1').prime.order, { org: SELLER, id: id, orderNo: made.orderNo, at: new Date(NOW).toISOString() }, 'the project mirror names the seller’s order');
  eq(DB.data.get('omega_orgs/' + SELLER + '/quote_counters/order-2026-10-17').count, 1, 'counted for the seller');
  /* once */
  var again = await PO.create(DB, { quote: quote(), now: NOW + 1000 });
  ok(again.duplicate === true && again.orderNo === made.orderNo && again.reference === true && again.logicUrl === made.logicUrl && orders().length === 1, 'again: the same order, no second');
  DB.seed('omega_orgs/' + SELLER + '/storefront/config', { products: [PRODUCT] });
  await refused(function () { return PO.create(DB, { quote: quote(), now: NOW }); }, 409, /different lines/, 'the same revision with a different line (now published) is refused');
  var rev3 = await PO.create(DB, { quote: quote({ rev: 3 }), now: NOW });
  ok(rev3.orderId !== id && orders().length === 2, 'a new revision is a new order');
  /* the cap */
  DB.seed('omega_orgs/' + SELLER + '/quote_counters/order-2026-10-17', { count: PO.DAILY_CAP });
  await refused(function () { return PO.create(DB, { quote: quote({ rev: 4 }), now: NOW }); }, 429, /approved quotes to Omega Logic today/, 'fifty a seller a day');
  /* no project: no mirror, still the order */
  reset(); DB.data.delete('projects/p1');
  ok((await PO.create(DB, { quote: quote(), now: NOW })).ok && !DB.data.has('projects/p1'), 'a missing project is not created by the mirror');
  /* a person still waiting to be admitted never stamps an account */
  reset();
  DB.seed('omega_orgs/' + SELLER + '/customer_index/dana@riverside.co', { customerId: 'acct1' });
  DB.seed('omega_orgs/' + SELLER + '/customers/acct1', { name: 'Riverside Cold Chain', status: 'active' });
  DB.seed('omega_orgs/' + SELLER + '/customers/acct1/users/dana@riverside.co', { email: 'dana@riverside.co', status: 'pending', role: 'member' });
  var pend = await PO.create(DB, { quote: quote(), now: NOW });
  ok(!DB.data.get('orders/' + pend.orderId).customerId, 'a person still waiting to be admitted never stamps an account');

  /* ── the battery published by the seller: a normal line ── */
  reset();
  DB.seed('omega_orgs/' + SELLER + '/storefront/config', { products: [PRODUCT] });
  var pub = await PO.create(DB, { quote: quote(), now: NOW }), po1 = DB.data.get('orders/' + pub.orderId);
  eq(po1.items, [{ sku: 'CC-SM-1000', name: 'Sunwave Smart Module 1 MW / 2 MWh', kind: 'product', qty: 1 }], 'the seller’s published product is the line, under its own name, unmarked');
  ok(pub.reference === false && po1.procure === null, 'not a reference; the seller’s own product is not bought in');
  ok(Cu.boughtIn(po1, 'CC-SM-1000') === null, 'custody agrees: its warranty is the catalog’s');

  /* ── a maker selling its own battery (Clean Cell's own workspace) ── */
  reset();
  DB.seed('omega_orgs/' + MFR + '/storefront/config', { products: [] });
  var ccList = Q.unitsFor(MFR, { name: 'Clean Cell', status: 'active', brands: ['cleancell us'] }, {}), ccSm = ccList.filter(function (u) { return u.key === SM; })[0];
  ok(ccSm && ccSm.source === 'own-shipped' && ccSm.vendorOrgId === MFR, 'Clean Cell’s own list holds its Rev H units as its own');
  var own = await PO.create(DB, { quote: quote({ orgId: MFR, unit: ccSm, seller: { name: 'Clean Cell', rep: { name: 'Casey', email: 'casey@cleancell.us' } } }), now: NOW });
  var oo = DB.data.get('orders/' + own.orderId);
  ok(oo.orgId === MFR && oo.items[0].reference === true && oo.procure === null, 'unpublished, it is a reference line on its own order, and not bought in');
  ok(Cu.boughtIn(oo, oo.items[0].sku) === null, 'custody agrees: a maker’s own unpublished unit is never called bought in');

  /* ── FENECON's own workspace: its XXL is on its list, so it is ordered,
     its own (not bought in), a reference line until it publishes it ── */
  reset();
  onLogic('fenecon.com', 'FENECON');
  DB.seed('omega_orgs/fenecon.com/storefront/config', { products: [] });
  var fen = await PO.create(DB, { quote: quote({ orgId: 'fenecon.com', unit: Q.unitOf(PP.XXL), seller: { name: 'FENECON', rep: { name: 'Fen', email: 'rep@fenecon.com' } } }), now: NOW });
  var fo = DB.data.get('orders/' + fen.orderId);
  ok(fo.orgId === 'fenecon.com' && fo.items[0].sku === 'FENECON-IND-XXL' && fo.items[0].reference === true && fo.procure === null && fo.prime.unit.key === 'FENECON-IND-XXL', 'FENECON orders its own XXL: a reference line on its own order, not bought in');

  /* ── the office prices and accepts it through the workflow's own step ── */
  reset();
  made = await PO.create(DB, { quote: quote(), now: NOW });
  var W = require('../api/_lib/logic-workflow');
  ok(typeof W.price === 'function', 'the workflow’s price step loads');
  var owner = { uid: 'r1', email: 'riley@sunwave.energy', orgId: SELLER, staff: false, claims: { email_verified: true } };
  var linesBefore = JSON.parse(JSON.stringify(DB.data.get('orders/' + made.orderId).items));
  ok(linesBefore[0].reference === true, 'a reference line goes to the price step');
  var priced = await W.price(made.orderId, 1234567, owner, true);
  var po2 = DB.data.get('orders/' + made.orderId);
  ok(priced.ok && po2.status === 'accepted' && po2.logic && po2.logic.commercial.baseCents === 123456700 && po2.logic.accounting === 'tenant' && po2.logic.acceptedBy === 'riley@sunwave.energy', 'the seller’s owner prices the reference line at the approved price and accepts it (tenant-billed)');
  eq(po2.items, linesBefore, 'the reference line survives pricing as it was');
  var stranger = { uid: 'x', email: 'casey@cleancell.us', orgId: MFR, staff: false, claims: { email_verified: true } };
  reset(); made = await PO.create(DB, { quote: quote(), now: NOW });
  await refused(function () { return W.price(made.orderId, 1, stranger, true); }, 403, null, 'the battery’s maker cannot price the seller’s order (D1)');

  /* ── review, 2026-10-17: one live order a site ──
     A change after approval is a NEW quote on the same project; its
     approval must not make a second, independent order while the first is
     live. live(): not cancelled (status, or the office's cancellation
     request) and not shipped or complete (status, or a load that left). */
  ok(PO.live({ status: 'new' }) && PO.live({ status: 'accepted', logic: {} }) && PO.live({ status: 'in_fulfilment', delivery: { legs: [{ status: 'planned' }] } }), 'live: new, priced or accepted, in production with only a planned load');
  ok(!PO.live({ status: 'cancelled' }) && !PO.live({ status: 'accepted', cancelRequested: true }), 'not live: cancelled, or a cancellation requested in Omega Logic');
  ok(!PO.live({ status: 'shipped' }) && !PO.live({ status: 'complete' }) && !PO.live({ status: 'in_fulfilment', delivery: { legs: [{ status: 'in_transit' }] } }), 'not live: closed — shipped, complete, or a load that left the plant');
  ok(!PO.live(null) && !PO.live('prime_x'), 'nothing is not a live order');
  reset();
  var first = await PO.create(DB, { quote: quote(), now: NOW });
  eq(DB.data.get('projects/p1').prime.order.id, first.orderId, 'the first approval: its order, named on the project');
  var Q2 = { id: 'qt-fedcba9876543210', quoteNo: 'SUNWAV-Q-20261018-QTWO', rev: 1 };
  var block = await refused(function () { return PO.create(DB, { quote: quote(Q2), now: NOW + 86400000 }); }, 409, null, 'a second approved quote on the same project while the first order is live');
  eq(block.message, 'This site already has order ' + first.orderNo + ' from proposal SUNWAV-Q-20261017-ABCDE. Cancel or close that order in Omega Logic, then press Send to Omega Logic again.', 'said in plain words: the order, the proposal, what to do');
  ok(block.plain === true && orders().length === 1 && DB.data.get('projects/p1').prime.order.id === first.orderId, 'a plain refusal the quote keeps; no second order; the project still names the first');
  DB.seed('orders/' + first.orderId, Object.assign(DB.data.get('orders/' + first.orderId), { status: 'accepted', logic: { createdAt: 'x', acceptedAt: 'y' }, cancelRequested: true }));
  var second = await PO.create(DB, { quote: quote(Q2), now: NOW + 86400000 });
  ok(second.ok && second.orderId !== first.orderId && orders().length === 2, 'the earlier order cancelled in Omega Logic: the retry makes the new one');
  eq(DB.data.get('projects/p1').prime.order.id, second.orderId, 'and the project names it');
  var Q3 = { id: 'qt-0000aaaa1111bbbb', quoteNo: 'SUNWAV-Q-20261019-THREE', rev: 1 };
  await refused(function () { return PO.create(DB, { quote: quote(Q3), now: NOW + 2 * 86400000 }); }, 409, new RegExp('order ' + second.orderNo + ' from proposal SUNWAV-Q-20261018-QTWO'), 'a third approval is held by the second, live, order');
  DB.seed('orders/' + second.orderId, Object.assign(DB.data.get('orders/' + second.orderId), { status: 'cancelled' }));
  ok((await PO.create(DB, { quote: quote(Q3), now: NOW + 2 * 86400000 })).ok, 'cancelled outright (status cancelled), the next one goes');
  /* closed is not live: a shipped order does not hold a new purchase */
  reset();
  first = await PO.create(DB, { quote: quote(), now: NOW });
  DB.seed('orders/' + first.orderId, Object.assign(DB.data.get('orders/' + first.orderId), { status: 'shipped' }));
  ok((await PO.create(DB, { quote: quote(Q2), now: NOW + 86400000 })).ok && orders().length === 2, 'the earlier order shipped (closed): a new approval is a new order');
  /* the project's pointer is checked against the order itself */
  reset();
  DB.seed('orders/prime_other', { orgId: SELLER, orderNo: 'PRM-OTHER', status: 'new', source: 'prime', sourceOrgId: SELLER, sourceProjectId: 'p-elsewhere', sourceQuoteId: 'qt-1111111111111111', prime: { quoteNo: 'ELSEWHERE' } });
  DB.seed('projects/p1', Object.assign(DB.data.get('projects/p1'), { prime: { v: 2, unitKey: SM, order: { org: SELLER, id: 'prime_other', orderNo: 'PRM-OTHER' } } }));
  ok((await PO.create(DB, { quote: quote(), now: NOW })).ok, 'a pointer at another project’s order does not hold this site');
  reset();
  DB.seed('orders/prime_theirs', { orgId: 'rival.energy', orderNo: 'PRM-THEIRS', status: 'new', source: 'prime', sourceOrgId: 'rival.energy', sourceProjectId: 'p1', sourceQuoteId: 'qt-2222222222222222', prime: { quoteNo: 'RIVAL-Q' } });
  DB.seed('projects/p1', Object.assign(DB.data.get('projects/p1'), { prime: { v: 2, unitKey: SM, order: { org: 'rival.energy', id: 'prime_theirs' } } }));
  var mine = await PO.create(DB, { quote: quote(), now: NOW });
  ok(mine.ok, 'nor one at another seller’s order (a pointer the browser wrote never names someone else’s order)');
  reset();
  DB.seed('projects/p1', Object.assign(DB.data.get('projects/p1'), { prime: { v: 2, unitKey: SM, order: { id: '../omega_orgs/x' } } }));
  ok((await PO.create(DB, { quote: quote(), now: NOW })).ok, 'a pointer that is not an order id is ignored');

  /* ── build() is pure ── */
  var built = PO.build({ quote: quote(), id: 'prime_x', orderNo: 'PRM-1', now: NOW, by: 'customer', org: SELLER, orgName: 'Sunwave Energy', unit: LISTED, reference: true,
    input: { items: [{ sku: 'CC-SM-1000', name: 'x', kind: 'product', qty: 1, reference: true, mfr: 'CleanCell US' }], destinations: [{ id: 'd1', address: { name: 'R', line1: '1', city: 'C', state: 'IL', zip: '1', country: 'US' }, requestedDate: null, items: [{ sku: 'CC-SM-1000', qty: 1 }] }] } });
  ok(built.doc.orgId === SELLER && built.audit.action === 'prime-order' && built.event.what === built.doc.history[0].what && built.doc.procure.mfr === 'CleanCell US', 'pure: the order, its event and its audit row');
  ok(!('approvedQuote' in PO.build({ quote: quote({ pricing: null }), id: 'prime_y', orderNo: 'PRM-2', now: NOW, org: SELLER, orgName: 'S', unit: LISTED, input: built.doc.delivery ? { items: built.doc.items, destinations: built.doc.delivery.destinations } : null }).doc), 'no approved price, no approvedQuote');

  console.log('test-prime-order: ' + count + ' assertions passed');
}
run().catch(function (e) { console.error('FAIL', e && e.stack || e); process.exit(1); });
