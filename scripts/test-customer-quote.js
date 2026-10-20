#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Customer quotes (Omega Prime → the seller's customer), end to end on the
 * Firestore double: the library (compose, markup and total, keys, the status
 * machine, expiry, the projections), the seller's company (deck-brand,
 * tenant-branding), and the door (/api/customer-quote): server pricing that
 * ignores a body total, the Helios send door's gates, the public view and
 * its counting, approve → exactly one Omega Logic order in the SELLER's own
 * workspace (the battery bought in as a reference line), a seller not yet
 * on Omega Logic told so and the hand-off retried once it is, the link into
 * its own Omega Logic, an uploaded logo carried into what the customer
 * approves, a $0 scope line never printed, decline and question caps,
 * withdraw, the Desk's rows and the ladder.
 * Mail is real api/_lib/mail.js on a stand-in SMTP transport; nothing
 * reaches the network or a live database.
 */
'use strict';
var assert = require('node:assert/strict'), path = require('path');
var ROOT = path.join(__dirname, '..');
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

/* ── the clock (expiry, the per-minute limiter) ── */
var NOW = Date.parse('2026-10-17T15:00:00Z'), realNow = Date.now;
Date.now = function () { return NOW; };
function tick(ms) { NOW += ms == null ? 61000 : ms; }

/* ── SMTP stand-in: the real mail module, a fake transport ── */
process.env.MAIL_USER = 'support@clearsky-usa.com'; process.env.MAIL_PASS = 'test-pass'; delete process.env.MAIL_FROM; delete process.env.PUBLIC_BASE_URL; delete process.env.TENANT_WILDCARD_LIVE;
var SENT = [], MAIL_FAIL = false;
var nm = require.resolve('nodemailer', { paths: [path.join(ROOT, 'api', '_lib')] });
require.cache[nm] = { id: nm, filename: nm, loaded: true, exports: { createTransport: function () { return { sendMail: function (msg) {
  if (MAIL_FAIL) return Promise.reject(new Error('smtp down'));
  SENT.push(msg); return Promise.resolve({ messageId: 'm' + SENT.length });
} }; } } };

/* ── the double learns array-contains (the brand lookup) ── */
var plainGet = F.Query.prototype.get;
F.Query.prototype.get = async function () {
  var ac = this.f.filter(function (f) { return f[1] === 'array-contains'; });
  if (!ac.length) return plainGet.call(this);
  var rest = new F.Query(this.db, this.path, this.f.filter(function (f) { return f[1] !== 'array-contains'; }), this.s, Infinity);
  var r = await plainGet.call(rest), cap = this.cap;
  var docs = r.docs.filter(function (d) { return ac.every(function (f) { var v = F.get(d.data(), f[0]); return Array.isArray(v) && v.indexOf(f[2]) >= 0; }); }).slice(0, cap);
  return { docs: docs, size: docs.length, empty: !docs.length, forEach: function (fn) { docs.forEach(fn); } };
};

/* ── admin: the real rules on the double ── */
var DB, CALLER;
function httpError(st, m) { var e = new Error(m); e.status = st; return e; }
var ALIAS = { 'fenecon.de': 'fenecon.com', 'fenecon.us': 'fenecon.com' };
function safeOrg(v) { var s = String(v == null ? '' : v).trim().toLowerCase(); if (!s || s.length > 253 || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(s)) return ''; return ALIAS[s] || s; }
async function isTenantAdmin(c, org) { if (c.staff) return true; if (c.orgId !== org) return false; var s = await DB.doc('omega_orgs/' + org + '/members/' + c.uid).get(); var d = s.exists ? s.data() : null; return !!d && d.status !== 'disabled' && (d.role === 'owner' || d.role === 'admin'); }
F.mock('../api/_lib/admin', { handler: function (fn) { return fn; }, httpError: httpError, db: function () { return DB; }, init: function () { return {}; },
  authenticate: function () { return CALLER ? Promise.resolve(Object.assign({}, CALLER)) : Promise.reject(httpError(401, 'missing bearer token')); },
  safeOrg: safeOrg, orgOf: function (e) { return safeOrg(String(e || '').split('@')[1]); }, isDegraded: function () { return false; },
  isTenantAdmin: isTenantAdmin,
  clientAdmin: async function (c, org) { if (c.staff) return true; if (!(await isTenantAdmin(c, org))) return false; var s = await DB.doc('omega_orgs/' + org).get(); return s.exists && (s.data() || {}).status === 'active'; },
  canActInOrg: async function (c, org) { return c.staff || c.orgId === org; },
  billingOf: async function (org) { var s = await DB.doc('omega_orgs/' + org + '/billing/current').get(); return s.exists ? s.data() : { tier: 'standard', addons: [], toolOverrides: {} }; },
  FieldValue: function () { return { serverTimestamp: function () { return 'TS'; } }; } });

var Q = require('../api/_lib/customer-quote'), DECK = require('../api/_lib/deck-brand'), MAIL = require('../api/_lib/mail'), T = require('../api/_lib/teleios');
var PP = require('../omega-prime-project.js'), CC = require('../omega-cleancell-catalog.js'), BP = require('../omega-bess-products.js');
var PRICE = require('../api/price-site')._helpers;
var api = require('../api/customer-quote'), branding = require('../api/tenant-branding');

/* ── the workspaces ── */
var SELLER = 'sunwave.energy', MFR = 'cleancell.us';
var COMPANY = { legalName: 'Sunwave Energy LLC', address: { line1: '1 Solar Way', line2: 'Suite 4', city: 'Chicago', state: 'IL', postalCode: '60601', country: 'US' }, phone: '312-555-0100', email: 'sales@sunwave.energy', website: 'https://sunwave.energy' };
var REP = { uid: 'u1', email: 'riley@sunwave.energy', orgId: SELLER, staff: false, claims: { email_verified: true, name: 'Token Name' } };
var VIEWER = { uid: 'u2', email: 'val@sunwave.energy', orgId: SELLER, staff: false, claims: { email_verified: true } };
var MEMBER = { uid: 'u4', email: 'max@sunwave.energy', orgId: SELLER, staff: false, claims: { email_verified: false } };
var STAFF = { uid: 's1', email: 'ops@clearsky-usa.com', orgId: 'clearsky-usa.com', staff: true, claims: { email_verified: true } };
var PARTNER = { uid: 'p1', email: 'pat@partner.energy', orgId: 'partner.energy', staff: false, claims: { email_verified: true } };
var CUSTOMER = { name: 'Dana Ruiz', company: 'Riverside Cold Chain', email: 'Dana@Riverside.co', phone: '312-555-0110', address: { line1: '1200 W Lake St', city: 'Chicago', state: 'IL', zip: '60607' } };
var PRODUCT = { sku: 'CC-SM-1000', name: 'Smart Module 1 MW / 2 MWh', kind: 'product', kw: 1000, kwh: 2000, active: true, warrantyYears: 10 };

function seedUnit() {
  var list = PP.units({ orgId: SELLER, brand: 'Sunwave Energy', entries: {}, keys: [], ownOnly: false, owner: ['sunwaveenergy', 'sunwave'] }, CC.entries(), { isOwn: BP.isOwn });
  var sm = list.filter(function (u) { return u.key === 'CLEANCELL-SM-1000-REV-H'; })[0];
  return PP.repFootprint(sm, 40, 10);
}
function projectDoc(unit, extra) {
  var c = { lat: 41.8855, lng: -87.6536 };
  var st = { addr: '1200 W Lake St, Chicago, IL 60607', lat: c.lat, lng: c.lng, geoSrc: 'test', unit: unit,
    area: { s: c.lat - 0.0002, w: c.lng - 0.0003, n: c.lat + 0.0002, e: c.lng + 0.0003 }, unitAt: c, poi: { lat: c.lat + 0.0004, lng: c.lng + 0.0006 }, conduit: true,
    hosting: { utility: { key: 'comed', display: 'ComEd', eiaId: 4110, holding: 'Exelon' }, coverage: 'read', circuit: { id: 'F1234', name: 'Feeder 1234', substation: 'Lakeview TSS' } } };
  var d = PP.projectDoc(st, { uid: 'u1', email: REP.email, name: 'Riley Rep', orgId: SELLER }, 1);
  return Object.assign(d, extra || {});
}
function reset() {
  DB = new F.DB(); DB.serial = true; SENT = []; MAIL_FAIL = false; CALLER = REP;
  process.env.MAIL_USER = 'support@clearsky-usa.com';
  DB.seed('omega_orgs/' + SELLER, { name: 'Sunwave Energy', slug: 'sunwave', status: 'active', vertical: 'installer', domains: ['sunwave.clearskyomega.com'], colors: { primary: '#0a7a5a' }, company: COMPANY });
  DB.seed('omega_orgs/' + SELLER + '/billing/current', { tier: 'standard' });
  DB.seed('omega_orgs/' + SELLER + '/members/u1', { role: 'admin', status: 'active', name: 'Riley Rep' });
  DB.seed('omega_orgs/' + SELLER + '/members/u2', { role: 'viewer', status: 'active' });
  DB.seed('omega_orgs/' + SELLER + '/members/u3', { role: 'member', status: 'disabled' });
  DB.seed('omega_orgs/' + SELLER + '/members/u4', { role: 'member', status: 'active' });
  DB.seed('omega_orgs/' + MFR, { name: 'Clean Cell', slug: 'cleancell', status: 'active', vertical: 'oem', brands: ['cleancell us', 'cleancell', 'clean cell'], whiteLabel: { enabled: true, platformName: 'Clean Cell Power Platform' } });
  DB.seed('omega_orgs/' + MFR + '/billing/current', { tier: 'enterprise', addons: ['omega-logic'] });
  DB.seed('omega_orgs/' + MFR + '/fulfillment/config', { enabled: true, accounting: 'tenant', terms: { depositPct: 30, dueDays: 30 } });
  DB.seed('omega_orgs/' + MFR + '/storefront/config', { products: [] });
  DB.seed('projects/p1', projectDoc(seedUnit()));
}
var IP = 0;
function req(method, body, query) { return { method: method, headers: { 'x-forwarded-for': '10.0.0.' + (++IP % 250), 'user-agent': 'test' }, body: body || {}, query: query || {} }; }
var RES = { setHeader: function () {} };
function post(body, who) { CALLER = who === undefined ? REP : who; return api(req('POST', body), RES); }
function get(query, who) { CALLER = who === undefined ? REP : who; return api(req('GET', null, query), RES); }
function pub(body) { CALLER = null; return api(req('POST', body), RES); }
function view(id, key) { CALLER = null; return api(req('GET', null, { id: id, key: key }), RES); }
function keyOf(url) { return /key=([a-f0-9]{48})$/.exec(url)[1]; }
var SID = 0; function sid() { return 'send-test-' + (++SID); }
function quote(id) { return DB.data.get('customer_quotes/' + id); }
function day() { return new Date(NOW).toISOString().slice(0, 10); }
var BODY = { customer: CUSTOMER, pricing: { mode: 'markup', markupPct: 20, showGroupPrices: true }, terms: { validDays: 30, paymentTerms: '30% on order, balance on energisation', notes: 'Includes one year of monitoring.' } };
function saveBody(extra) { return Object.assign({ action: 'save', projectId: 'p1' }, JSON.parse(JSON.stringify(BODY)), extra || {}); }

async function run() {
  /* ══ 1 · the library ══ */
  var unit = seedUnit();
  eq([unit.key, unit.sku, unit.mfr, unit.footprint, unit.lFt, unit.wFt], ['CLEANCELL-SM-1000-REV-H', 'CC-SM-1000', 'CleanCell US', 'rep', 40, 10], 'the fixture battery: a Clean Cell reference unit with the rep’s submittal footprint');
  var input = PP.runInput(unit, projectDoc(unit).prime.layout);
  var answer = PRICE.finish(REP, SELLER, input, { rates: null, installer: null, supplier: null, note: 'generic' });
  var cost = Q.costOf(answer, input);
  ok(cost.totalCents.base === Math.round(answer.total.base * 100) && cost.divisions.length === 6, 'the cost is the cost model’s own total, in cents, with its six divisions');
  var sellM = Q.sellOf(cost, Q.pricing({ mode: 'markup', markupPct: 20 }));
  eq(sellM.sellCents, Math.round(cost.totalCents.base * 1.2 / 100) * 100, 'markup: cost × 1.2, to the dollar');
  eq(sellM.marginCents, sellM.sellCents - cost.totalCents.base, 'the margin is sell − cost');
  eq(sellM.groups.reduce(function (s, g) { return s + g.sellCents; }, 0), sellM.sellCents, 'the three customer lines add up to the sell price exactly');
  var sellT = Q.sellOf(cost, Q.pricing({ mode: 'total', totalUsd: 2500000 }));
  ok(sellT.sellCents === 250000000 && sellT.markupPct === null && sellT.effectiveMarkupPct === Math.round((250000000 / cost.totalCents.base - 1) * 1000) / 10, 'total: the rep’s figure is the price; the markup it implies is computed');
  assert.throws(function () { Q.pricing({ mode: 'markup', markupPct: 900 }); }, /Markup must be/); count++;
  assert.throws(function () { Q.pricing({ mode: 'total' }); }, /total price/); count++;
  assert.throws(function () { Q.pricing({ mode: 'bid' }); }, /markup or total/); count++;
  assert.throws(function () { Q.customer({ name: 'X' }); }, /Name the customer/); count++;
  assert.throws(function () { Q.customer({ name: 'Dana', email: 'not-an-email' }); }, /email/); count++;
  assert.throws(function () { Q.terms({ validDays: 365 }); }, /1–180 days/); count++;
  eq(Q.terms({}).validDays, 30, 'a quote is valid 30 days unless the rep says otherwise');
  var rec = Q.compose({ id: 'qt-0123456789abcdef', orgId: SELLER, projectId: 'p1', quoteNo: 'SUNWAV-Q-20261017-ABCDE', rev: 1, customer: CUSTOMER, pricing: { mode: 'markup', markupPct: 20, totalUsd: 1, sellCents: 5 },
    terms: {}, unit: unit, layout: projectDoc(unit).prime.layout, site: { address: '1200 W Lake St, Chicago, IL 60607', utility: 'ComEd' }, cost: cost, seller: { name: 'Sunwave Energy', rep: { name: 'Riley', email: REP.email } } }, NOW);
  eq(rec.pricing.sellCents, sellM.sellCents, 'compose ignores a total and a sell figure in the pricing it is handed: the server’s cost and the rep’s markup decide');
  eq(rec.scope[0].amount, 'Quoted by CleanCell US', 'the battery line reads “Quoted by <manufacturer>”');
  ok(/CleanCell US/.test(rec.scope[0].name) && /1,000 kW \/ ~2,000 kWh/.test(rec.scope[0].name) && /transformer and disconnect/.test(rec.scope[0].name), 'the battery line names the unit and the gear it needs');
  ok(rec.scope[1].amount === null && rec.scope[2].amount === null, 'line prices are hidden unless the rep shows them');
  var shown = Q.compose(Object.assign({}, rec, { customer: CUSTOMER, pricing: { mode: 'markup', markupPct: 20, showGroupPrices: true }, terms: {} }), NOW);
  ok(/^\$[\d,]+$/.test(shown.scope[1].amount) && /^\$[\d,]+$/.test(shown.scope[2].amount) && shown.scope[0].amount === 'Quoted by CleanCell US', 'shown, the installation and engineering lines carry the sell price; the battery line still does not');
  eq(rec.customer.email, 'dana@riverside.co', 'the customer email is lowercased');
  /* a line with no cost behind it is never printed as "$0" */
  var noEng = Q.costOf({ total: { lo: 900000, base: 1000000, hi: 1100000 }, divisions: [{ id: 'eq', name: 'Equipment', base: 700000 }, { id: 'el', name: 'Electrical', base: 300000 }] }, {});
  var zr = Q.compose(Object.assign({}, rec, { customer: CUSTOMER, pricing: { mode: 'markup', markupPct: 13, showGroupPrices: true }, terms: {}, cost: noEng }), NOW);
  eq(zr.pricing.groups.map(function (g) { return g.key + ':' + g.sellCents; }).join(' '), 'equipment:' + (zr.pricing.sellCents - zr.pricing.groups[1].sellCents) + ' installation:' + zr.pricing.groups[1].sellCents + ' engineering:0', 'no engineering cost: its share is exactly $0 (the rounding goes to the largest line)');
  eq(zr.pricing.groups.reduce(function (t, g) { return t + g.sellCents; }, 0), zr.pricing.sellCents, 'and the lines still add up to the price');
  ok(/^\$[\d,]+$/.test(zr.scope[1].amount) && zr.scope[2].amount === null, 'shown prices: the installation line carries its figure, the $0 engineering line sends null, never "$0"');
  ok(JSON.stringify(Q.customerView(Object.assign({}, zr, { status: 'sent', acceptance: { sentAt: NOW, validUntil: NOW + 1 } }))).indexOf('"$0"') < 0, 'the customer view prints no "$0"');
  /* keys, transitions, expiry */
  var tok = Q.token(), withKey = { acceptance: { keyHash: Q.hashKey(tok) } };
  ok(/^qt-[a-f0-9]{16}$/.test(Q.newId()) && /^[a-f0-9]{48}$/.test(tok), 'ids and keys have their shapes');
  ok(Q.verifyKey(withKey, tok) && !Q.verifyKey(withKey, 'b'.repeat(48)) && !Q.verifyKey(withKey, tok.toUpperCase()) && !Q.verifyKey({ acceptance: null }, tok) && !Q.verifyKey(withKey, tok + '0'), 'only the key itself verifies; only its hash is kept');
  assert.throws(function () { Q.transition({ status: 'draft' }, 'approved', NOW); }, /draft quote cannot become approved/); count++;
  assert.throws(function () { Q.transition({ status: 'approved' }, 'draft', NOW); }, /approved quote cannot become draft/); count++;
  assert.throws(function () { Q.transition({ status: 'sent', acceptance: { validUntil: NOW - 1 } }, 'approved', NOW); }, /expired/); count++;
  ok(Q.expired({ status: 'viewed', acceptance: { validUntil: NOW - 1 } }, NOW) && !Q.expired({ status: 'approved', acceptance: { validUntil: NOW - 1 } }, NOW), 'only an open quote expires');
  /* the customer projection: poisoned record, searched */
  var POISON = Object.assign({}, rec, { status: 'sent', snapshot: 'f'.repeat(64), history: [{ by: 'riley@sunwave.energy', action: 'saved', secret: 'HIST-POISON' }], createdBy: 'CREATOR-POISON', updatedBy: 'EDITOR-POISON',
    internalNotes: 'NOTE-POISON squeeze the freight', financial: { stack: 'STACK-POISON' }, margin: 'MARGIN-POISON', handoff: { error: 'HANDOFF-POISON' }, mailState: 'MAILSTATE-POISON',
    acceptance: { keyHash: 'KEYHASH-POISON', sentAt: NOW, validUntil: NOW + 86400000, ipHash: 'IPHASH-POISON', ua: 'UA-POISON', questions: [{ message: 'QUESTION-POISON' }], questionCount: 1 },
    questions: [{ at: NOW, message: 'KEPT-QUESTION-POISON', email: 'asker-poison@x.co', rev: 1, sentAt: NOW }],
    cost: Object.assign({}, cost, { supplierNote: 'SUPPLIER-POISON', divisions: cost.divisions.map(function (d) { return Object.assign({}, d, { name: 'DIV-POISON ' + d.name }); }) }),
    unit: Object.assign({}, rec.unit, { vendorOrgId: 'VENDOR-POISON', sourceDoc: 'SOURCEDOC-POISON' }),
    seller: { name: 'Sunwave Energy', orgId: 'ORG-POISON', companySource: 'SOURCE-POISON', whiteLabel: true, platformName: 'PLATFORM-POISON', supportEmail: 'support-poison@x.co', rep: { name: 'Riley', email: REP.email } } });
  var cv = JSON.stringify(Q.customerView(POISON));
  ['POISON', 'internal', 'margin', 'markupPct', 'keyHash', 'history', 'createdBy', 'updatedBy', 'ipHash', '"ua"', 'supplier', 'subtotal', 'divisions', 'perKw', 'financial', 'handoff', 'mailState', 'questions',
    String(cost.totalCents.base), Q.money(cost.totalCents.base), Q.money(sellM.marginCents), 'estimateClass', 'vendorOrgId', 'sourceDoc', 'orgId', 'projectId', 'layoutHash', 'cost'].forEach(function (w) {
    ok(cv.indexOf(w) < 0, 'the customer view never carries ' + w);
  });
  ok(Q.customerView(POISON).price.total === Q.money(sellM.sellCents) && /quoted by CleanCell US/.test(Q.customerView(POISON).price.note), 'it carries the price, formatted, and the battery note');
  var tv = Q.tenantView(POISON);
  ok(tv.internal.margin === Q.money(sellM.marginCents) && tv.internal.cost.total === Q.money(cost.totalCents.base) && tv.internal.markupPct === 20, 'the seller’s view carries the cost, the markup and the margin');
  ok(JSON.stringify(tv).indexOf('KEYHASH-POISON') < 0 && JSON.stringify(tv).indexOf('IPHASH-POISON') < 0, 'not even the seller sees the key hash or the ip hash');
  var snapA = Q.snapshotOf(POISON), snapB = Q.snapshotOf(Object.assign({}, POISON, { pricing: Object.assign({}, POISON.pricing, { sellCents: POISON.pricing.sellCents + 100 }) }));
  ok(/^[a-f0-9]{64}$/.test(snapA) && snapA !== snapB && snapA === Q.snapshotOf(JSON.parse(JSON.stringify(POISON))), 'the snapshot covers the price and survives a round trip');
  eq(Q.snapshotOf(Object.assign({}, POISON, { history: [], acceptance: Object.assign({}, POISON.acceptance, { viewCount: 9, lastViewedAt: NOW + 5 }) })), snapA, 'views and history never change what was approved');

  /* ══ 2 · the seller's company ══ */
  var b1 = DECK.brandOf({ name: 'Sunwave', company: COMPANY }, SELLER, null, { profile: { legalName: 'Billing Name', phone: '1' } });
  ok(b1.company.legalName === 'Sunwave Energy LLC' && b1.company.source === 'record' && b1.company.email === 'sales@sunwave.energy', 'the record’s company wins');
  var b2 = DECK.brandOf({ name: 'Sunwave' }, SELLER, null, { profile: { legalName: 'Sunwave Billing Inc', email: 'ap@sunwave.energy', phone: '312-555-0199', website: 'https://sunwave.energy', address: { line1: '9 Pay St', city: 'Chicago', state: 'IL', postalCode: '60601', country: 'US' } } });
  ok(b2.company.legalName === 'Sunwave Billing Inc' && b2.company.source === 'billing-profile' && b2.company.email === '' && b2.company.address.line1 === '9 Pay St', 'none on the record: the billing profile’s, without its accounts-payable email');
  eq(DECK.brandOf({ name: 'X' }, 'x.com', null, { company: true }).company, null, 'neither: no company');
  eq(Object.keys(DECK.brandOf({ name: 'Sunwave', company: COMPANY }, SELLER)).sort().join(','), 'attribution,colors,logoUrl,name,platformName,tagline', 'not asked for, the answer is exactly the six keys it always was (the Pro Forma’s contract)');
  eq(DECK.brandOf({ name: 'Sunwave', company: COMPANY }, SELLER, null, { company: true }).company.legalName, 'Sunwave Energy LLC', 'asked for without a profile: the record’s');
  eq(DECK.brandOf({ company: { legalName: 'Bad', website: 'javascript:alert(1)', email: 'nope' } }, 'x.com', null, { company: true }).company.website, '', 'a stored website that is not http(s) reads blank');
  ok(['name', 'logoUrl', 'colors', 'tagline', 'attribution', 'platformName'].every(function (k) { return k in b2; }), 'brandOf keeps every key it had');
  /* tenant-branding: a valid company stored, junk refused, never public */
  reset();
  DB.seed('omega_orgs/' + SELLER + '/members/u1', { role: 'owner', status: 'active' });
  CALLER = REP;
  var br = await branding({ method: 'POST', body: { orgId: SELLER, company: { legalName: ' Sunwave Energy LLC ', phone: '(312) 555-0100', email: 'Sales@Sunwave.energy', website: 'https://sunwave.energy', address: { line1: '1 Solar Way', city: 'Chicago', state: 'IL', postalCode: '60601', country: 'US' } } } });
  ok(br.ok, 'a tenant admin saves the company');
  var stored = DB.data.get('omega_orgs/' + SELLER).company;
  ok(stored.legalName === 'Sunwave Energy LLC' && stored.email === 'sales@sunwave.energy' && stored.address.line2 === '', 'stored cleaned: trimmed, the email lowercased, every address key present');
  ok(!('company' in (DB.data.get('tenant_public/sunwave.clearskyomega.com') || {})), 'and never mirrored into the world-readable tenant_public');
  await refused(function () { return branding({ method: 'POST', body: { orgId: SELLER, company: { legalName: 'X', fax: '1' } } }); }, 400, /Unsupported company field/, 'an unknown company field is refused');
  await refused(function () { return branding({ method: 'POST', body: { orgId: SELLER, company: { website: 'javascript:alert(1)' } } }); }, 400, /http\(s\)/, 'a script URL is refused');
  await refused(function () { return branding({ method: 'POST', body: { orgId: SELLER, company: { email: 'not an email' } } }); }, 400, /email/, 'a bad email is refused');
  await refused(function () { return branding({ method: 'POST', body: { orgId: SELLER, company: { legalName: 'A\u0007B' } } }); }, 400, /legal name/, 'control characters are refused');
  await refused(function () { return branding({ method: 'POST', body: { orgId: SELLER, company: 'Sunwave' } }); }, 400, /object/, 'a string is not a company');
  await refused(function () { return branding({ method: 'POST', body: { orgId: SELLER, company: { address: { line1: 'x', county: 'Cook' } } } }); }, 400, /address field/, 'an unknown address field is refused');
  CALLER = VIEWER;
  await refused(function () { return branding({ method: 'POST', body: { orgId: SELLER, company: { legalName: 'Mine' } } }); }, 403, /tenant admin/, 'a viewer cannot write it');
  CALLER = REP;
  await branding({ method: 'POST', body: { orgId: SELLER, company: null } });
  eq(DB.data.get('omega_orgs/' + SELLER).company, null, 'null clears it');

  /* ══ 3 · preview and save: the server prices ══ */
  reset();
  await refused(function () { return post({ action: 'preview', projectId: 'p1', customer: CUSTOMER, total: 1 }); }, 400, /Unsupported field/, 'a top-level total is refused outright');
  var pv = await post(Object.assign({ action: 'preview', projectId: 'p1' }, BODY, { pricing: { mode: 'markup', markupPct: 20, totalUsd: 5, sellCents: 1, costUsd: 2 } }));
  var expected = PRICE.finish(REP, SELLER, PP.runInput(unit, projectDoc(unit).prime.layout), { rates: null, installer: null, supplier: null, note: 'x' });
  eq(pv.quote.internal.cost.total, Q.money(Math.round(expected.total.base * 100)), 'preview: the cost is /api/price-site’s for the project’s own layout and battery');
  eq(pv.quote.price.total, Q.money(Math.round(expected.total.base * 100 * 1.2 / 100) * 100), 'and the price is that cost with the markup: body totals are ignored');
  ok(pv.quote.quoteNo === 'DRAFT' && pv.quote.id === null && !DB.data.has('customer_quotes/' + pv.quote.id), 'preview writes nothing');
  ok(Array.from(DB.data.keys()).every(function (k) { return k.indexOf('customer_quotes/') !== 0; }), 'no quote record exists after a preview');
  ok(pv.quote.seller.company.legalName === 'Sunwave Energy LLC' && pv.quote.seller.rep.name === 'Riley Rep' && pv.quote.seller.accent === '#0A7A5A', 'the seller: the workspace’s company, the rep by their member name, the accent');
  /* a logo uploaded on the dashboard is a PNG data URI on the org record
     (index.html saveLogo, up to 180 KiB): it rides into the record, the
     snapshot the customer approves, the customer's view and the deck */
  var LOGO = 'data:image/png;base64,' + new Array(4001).join('iVBORw0KGgo') + '=';
  DB.seed('omega_orgs/' + SELLER, Object.assign(DB.data.get('omega_orgs/' + SELLER), { logoUrl: LOGO }));
  var lg = await post(saveBody()), lgRec = quote(lg.quote.id);
  ok(lgRec.seller.logoUrl === LOGO && lg.quote.seller.logoUrl === LOGO, 'an uploaded data: logo is kept on the quote (' + LOGO.length + ' characters)');
  ok(Q.content(lgRec).seller.logoUrl === LOGO && Q.snapshotOf(lgRec) !== Q.snapshotOf(Object.assign({}, lgRec, { seller: Object.assign({}, lgRec.seller, { logoUrl: '' }) })), 'and the snapshot covers it: the customer approves the letterhead they saw');
  var lgKey = keyOf((await post({ action: 'send', id: lg.quote.id, sendId: sid(), deliver: 'link' })).url);
  var lgView = (await view(lg.quote.id, lgKey)).quote;
  ok(lgView.seller.logoUrl === LOGO, 'the customer’s view carries it');
  ok(require('../omega-quote-deck.js').body(lgView).indexOf('<img src="' + LOGO + '"') >= 0, 'and the deck prints it');
  DB.seed('omega_orgs/' + SELLER, Object.assign(DB.data.get('omega_orgs/' + SELLER), { logoUrl: 'data:image/svg+xml;base64,PHN2Zz4=' }));
  eq((await post(Object.assign({ action: 'preview', projectId: 'p1' }, BODY))).quote.seller.logoUrl, '', 'an SVG data URI is not a logo (it can carry script)');
  DB.seed('omega_orgs/' + SELLER, Object.assign(DB.data.get('omega_orgs/' + SELLER), { logoUrl: null }));
  tick();
  eq(pv.quote.seller.attribution, 'Prepared with ClearSky-OMEGA', 'no white label: the platform is named in the footer');
  eq(pv.quote.site, { address: '1200 W Lake St, Chicago, IL 60607', utility: 'ComEd', circuit: 'Feeder 1234 · Lakeview TSS' }, 'the site, its utility and circuit from the project');
  ok(pv.quote.system.unit.footprint === 'rep' && pv.quote.system.layout.v === 2 && pv.quote.system.layout.xfmr && pv.quote.system.layout.disco && pv.quote.system.conduitFt > 0, 'the system: the unit, the v2 plan with its gear and conduit');
  var sv = await post(saveBody()), id = sv.quote.id;
  ok(Q.validId(id) && sv.quote.status === 'draft' && sv.quote.rev === 1 && /^SUNWAV-Q-20261017-[A-F0-9]{5}$/.test(sv.quote.quoteNo), 'save: a draft with an id, rev 1 and a quote number: ' + sv.quote.quoteNo);
  var r1 = quote(id);
  ok(r1.orgId === SELLER && r1.projectId === 'p1' && r1.unit.key === 'CLEANCELL-SM-1000-REV-H' && r1.cost.pricedBy === 'api/price-site' && r1.acceptance === null, 'the record: the workspace, the project, the battery from the server’s list, the cost');
  var mirror = DB.data.get('projects/p1').prime.quote;
  eq(mirror, { id: id, quoteNo: r1.quoteNo, status: 'draft', rev: 1, sentAt: null, decidedAt: null }, 'the project mirror is status only');
  ok(JSON.stringify(mirror).indexOf('$') < 0 && JSON.stringify(mirror).indexOf('Dana') < 0, 'no price and no person on the project (a JDA collaborator reads it)');
  ok(DB.data.get('projects/p1').updatedAt === 1, 'the project’s updatedAt is left alone');
  var tot = await post(Object.assign(saveBody({ id: id }), { pricing: { mode: 'total', totalUsd: 2500000 } }));
  ok(tot.quote.price.total === '$2,500,000' && tot.quote.rev === 2 && tot.quote.internal.margin === Q.money(250000000 - Math.round(expected.total.base * 100)), 'total mode: the rep’s figure, rev 2, the margin computed');
  /* who may */
  await refused(function () { return post(saveBody(), VIEWER); }, 403, /viewer/, 'a viewer cannot save');
  ok((await get({ id: id }, VIEWER)).quote.id === id, 'but may read');
  await refused(function () { return post(saveBody(), { uid: 'u3', email: 'dis@sunwave.energy', orgId: SELLER, staff: false, claims: { email_verified: true } }); }, 403, /not active/, 'a disabled member cannot');
  DB.seed('projects/p1', Object.assign(DB.data.get('projects/p1'), { orgsInvolved: ['partner.energy'] }));
  DB.seed('org_members/pat@partner.energy', { orgId: SELLER, active: true });
  await refused(function () { return post(saveBody(), PARTNER); }, 403, /own workspace/, 'a JDA collaborator, even with an org_members grant, quotes nothing');
  await refused(function () { return get({ id: id }, PARTNER); }, 403, /workspace that made/, 'nor reads the quote');
  await refused(function () { return get({ projectId: 'p1' }, PARTNER); }, 403, /own workspace/, 'nor the project’s quotes');
  DB.seed('omega_orgs/' + SELLER + '/billing/current', { tier: 'standard', toolAccess: ['editor', 'gridatlas'] });
  await refused(function () { return post(saveBody({ id: id })); }, 403, /Site Finder or the Cost Estimator/, 'the pricing gate is /api/price-site’s');
  DB.seed('omega_orgs/' + SELLER + '/billing/current', { tier: 'standard' });
  DB.seed('projects/p9', { orgId: SELLER, name: 'no prime' });
  await refused(function () { return post(Object.assign(saveBody(), { projectId: 'p9' })); }, 409, /Place the battery/, 'a project with no Prime layout cannot be quoted');
  DB.seed('projects/p8', projectDoc(PP.XXL));
  await refused(function () { return post(Object.assign(saveBody(), { projectId: 'p8' })); }, 409, /not in your workspace/, 'a battery the workspace’s list no longer offers (the XXL outside FENECON) is refused');
  /* a charger, an array or a compute unit Prime set up (main #348) is not a
     battery: quote required, sized in Site Map — never priced as one */
  var CAT = require(path.join(ROOT, 'omega-site-catalogs.js'));
  [PP.forType('ev', null, CAT)[0], PP.forType('solar', null, CAT)[0], PP.forType('compute', null, CAT)[0]].forEach(function (u, k) {
    DB.seed('projects/px' + k, projectDoc(u));
  });
  for (var pk = 0; pk < 3; pk++) {
    await refused(function () { return post(Object.assign(saveBody(), { projectId: 'px' + pk })); }, 409, /^Quote required: the .+ is sized in Site Map/, 'a unit that is not a battery is quote required (' + pk + ')');
    await refused(function () { return post(Object.assign({ action: 'preview', projectId: 'px' + pk }, BODY)); }, 409, /Quote required/, 'previewed neither (' + pk + ')');
  }
  tick();
  var staffSave = await post(saveBody({ id: id }), STAFF);
  ok(staffSave.quote.rev === 3 && staffSave.quote.seller.rep.email === STAFF.email, 'ClearSky staff may work a tenant’s quote');
  await post(saveBody({ id: id }));

  /* ══ 4 · sending ══ */
  reset();
  id = (await post(saveBody())).quote.id;
  await refused(function () { return view(id, 'a'.repeat(48)); }, 404, /not found/, 'a draft is invisible to a key-shaped string');
  await refused(function () { return post({ action: 'send', id: id, sendId: sid(), deliver: 'email' }, VIEWER); }, 403, /viewer/, 'a viewer cannot send');
  await refused(function () { return post({ action: 'send', id: id, sendId: sid(), deliver: 'email' }, MEMBER); }, 403, /Verify your email/, 'an unverified member cannot send');
  await refused(function () { return post({ action: 'send', id: id, deliver: 'email' }); }, 400, /sendId/, 'a send carries its id');
  await refused(function () { return post({ action: 'send', id: id, sendId: sid(), deliver: 'fax' }); }, 400, /email or link/, 'email or link only');
  DB.seed('omega_orgs/' + SELLER, Object.assign(DB.data.get('omega_orgs/' + SELLER), { status: 'suspended' }));
  await refused(function () { return post({ action: 'send', id: id, sendId: sid(), deliver: 'email' }); }, 403, /suspended/, 'a suspended workspace cannot send');
  reset(); id = (await post(saveBody())).quote.id;
  DB.data.delete('omega_orgs/' + SELLER);
  await refused(function () { return post({ action: 'send', id: id, sendId: sid(), deliver: 'link' }); }, 403, /workspace on record/, 'no workspace record: a send does not fail open');
  /* the unverified admin of an active client sends without the link */
  reset(); id = (await post(saveBody())).quote.id;
  var unverifiedAdmin = Object.assign({}, REP, { claims: { email_verified: false } });
  var s0 = await post({ action: 'send', id: id, sendId: sid(), deliver: 'link' }, unverifiedAdmin);
  ok(s0.ok && s0.mailState === 'manual' && /^https:\/\/silmarillion\.clearskyomega\.com\/quote\?id=qt-[a-f0-9]{16}&key=[a-f0-9]{48}$/.test(s0.url), 'an owner or administrator of an active client sends without the email link; the link is on the open host: ' + s0.url);
  eq(SENT.length, 0, 'a link send mails nothing');
  /* a personal domain */
  reset();
  DB.seed('omega_orgs/gmail.com', { name: 'Gmail', status: 'active' }); DB.seed('omega_orgs/gmail.com/billing/current', { tier: 'standard' }); DB.seed('omega_orgs/gmail.com/members/g', { role: 'owner', status: 'active' });
  DB.seed('projects/g1', projectDoc(seedUnit(), { orgId: 'gmail.com' }));
  var GMAIL = { uid: 'g', email: 'someone@gmail.com', orgId: 'gmail.com', staff: false, claims: { email_verified: true } };
  /* a public mailbox domain is never a workspace: one 'gmail.com' bucket would
     share every unclaimed Gmail user's quotes, so nothing opens there at all */
  await refused(function () { return post(Object.assign(saveBody(), { projectId: 'g1' }), GMAIL); }, 403, /company workspace/, 'a public mailbox domain cannot even save a quote');
  await refused(function () { return get({ list: '1' }, GMAIL); }, 403, /company workspace/, 'nor list the bucket\'s quotes');
  /* an unverified account on the seller's own domain, with no role: nothing */
  var DRIFTER = { uid: 'drifter', email: 'drifter@' + SELLER, orgId: SELLER, staff: false, claims: { email_verified: false } };
  id = (await post(saveBody())).quote.id;
  await refused(function () { return get({ list: '1' }, DRIFTER); }, 403, /Verify your email/, 'an unverified sign-up on the seller\'s domain lists no quotes');
  await refused(function () { return get({ id: id }, DRIFTER); }, 403, /Verify your email/, 'and opens none (customer details, cost and margin)');
  await refused(function () { return post({ action: 'withdraw', id: id }, DRIFTER); }, 403, /Verify your email/, 'and withdraws none');
  /* email, from the default mailbox, the rep in reply and copy */
  reset(); id = (await post(saveBody())).quote.id;
  var id1 = sid(), s1 = await post({ action: 'send', id: id, sendId: id1, deliver: 'email', message: 'As discussed on site Tuesday.' });
  var key1 = keyOf(s1.url), m1 = SENT[0];
  ok(s1.ok && s1.mailState === 'sent' && SENT.length === 1, 'emailed once');
  ok(m1.to === 'dana@riverside.co' && m1.replyTo === REP.email && m1.cc === REP.email && m1.from === 'ClearSky-OMEGA <support@clearsky-usa.com>', 'to the customer, Reply-To and a copy to the rep, from the default mailbox (no white label)');
  ok(m1.html.indexOf(s1.url.replace(/&/g, '&amp;')) >= 0 && /Review and approve/.test(m1.html) && /background:#0A7A5A/.test(m1.html) && /As discussed on site Tuesday\./.test(m1.html), 'the mail carries the link, the seller’s accent and the rep’s message');
  ok(/SUNWAVE ENERGY/.test(m1.html) && m1.html.indexOf('CLEARSKY-OMEGA') < 0 && /Prepared with ClearSky-OMEGA/.test(m1.html), 'in the seller’s brand, with the platform named only in the footer line');
  var r2 = quote(id);
  ok(r2.status === 'sent' && r2.acceptance.keyHash === Q.hashKey(key1) && r2.acceptance.keyHash !== key1 && new Date(r2.acceptance.validUntil).toISOString() === '2026-11-16T23:59:59.999Z' && /^[a-f0-9]{64}$/.test(r2.snapshot), 'sent: the key’s hash, valid through the END of the 30th day (UTC), the snapshot');
  ok(DB.data.get('customer_quotes/' + id + '/sends/' + id1).state === 'sent' && DB.data.get('omega_orgs/' + SELLER + '/quote_counters/send-' + day()).count === 1 && DB.data.get('omega_orgs/' + SELLER + '/quote_counters/q-' + id + '-' + day()).count === 1, 'the send is claimed and counted on documents no browser can reach');
  ok(Array.from(DB.data.entries()).some(function (e) { return e[0].indexOf('omega_audit/') === 0 && e[1].action === 'customer-quote-send' && e[1].quoteId === id; }), 'and audited');
  eq(DB.data.get('projects/p1').prime.quote.status, 'sent', 'the project mirror follows');
  var again = await post({ action: 'send', id: id, sendId: id1, deliver: 'email' });
  ok(again.ok && again.repeat === true && again.url === null && SENT.length === 1, 'the same send id answers with the first and mails nothing more');
  eq(quote(id).acceptance.keyHash, Q.hashKey(key1), 'and mints no new key');
  var id2 = sid();
  DB.seed('customer_quotes/' + id + '/sends/' + id2, { state: 'sending', startedAt: NOW });
  await refused(function () { return post({ action: 'send', id: id, sendId: id2, deliver: 'email' }); }, 409, /already being sent/, 'a send in flight is not sent twice');
  DB.seed('customer_quotes/' + id + '/sends/' + id2, { state: 'sending', startedAt: NOW - 3600000 });
  var s2 = await post({ action: 'send', id: id, sendId: id2, deliver: 'email' });
  ok(s2.ok && SENT.length === 2 && keyOf(s2.url) !== key1, 'one that died an hour ago is retried, with a new key');
  await refused(function () { return view(id, key1); }, 404, /not found/, 'the old link died with the resend');
  var key2 = keyOf(s2.url);
  /* the mail fails: nothing changes */
  var before = JSON.stringify(quote(id)); MAIL_FAIL = true;
  var id3 = sid();
  await refused(function () { return post({ action: 'send', id: id, sendId: id3, deliver: 'email' }); }, 502, /could not be sent/, 'a mail failure is a 502');
  MAIL_FAIL = false;
  eq(JSON.stringify(quote(id)), before, 'and the quote is exactly as it was: the customer’s link still works');
  ok((await view(id, key2)).quote.id === id, '…which it does');
  eq(DB.data.get('customer_quotes/' + id + '/sends/' + id3).state, 'failed', 'the claim is marked failed');
  /* limits */
  DB.seed('omega_orgs/' + SELLER + '/quote_counters/q-' + id + '-' + day(), { count: 5 });
  await refused(function () { return post({ action: 'send', id: id, sendId: sid(), deliver: 'email' }); }, 429, /5 times today/, 'five sends a quote a day');
  ok((await post({ action: 'send', id: id, sendId: sid(), deliver: 'link' }, STAFF)).ok, 'staff are not held to it');
  DB.seed('omega_orgs/' + SELLER + '/quote_counters/q-' + id + '-' + day(), { count: 0 });
  DB.seed('omega_orgs/' + SELLER + '/quote_counters/send-' + day(), { count: 50 });
  await refused(function () { return post({ action: 'send', id: id, sendId: sid(), deliver: 'email' }); }, 429, /50 quotes today/, 'fifty a workspace a day');
  DB.seed('omega_orgs/' + SELLER + '/quote_counters/send-' + day(), { count: 0 });
  /* no customer email, mail not set up */
  reset();
  id = (await post(Object.assign(saveBody(), { customer: { name: 'Dana Ruiz', company: 'Riverside Cold Chain' } }))).quote.id;
  await refused(function () { return post({ action: 'send', id: id, sendId: sid(), deliver: 'email' }); }, 400, /customer’s email/, 'no customer email: email is refused');
  ok((await post({ action: 'send', id: id, sendId: sid(), deliver: 'link' })).ok, 'a link still goes');
  delete process.env.MAIL_USER;
  id = (await post(saveBody())).quote.id;
  await refused(function () { return post({ action: 'send', id: id, sendId: sid(), deliver: 'email' }); }, 500, /Mail is not configured/, 'mail not configured is a deployment problem');
  process.env.MAIL_USER = 'support@clearsky-usa.com';
  /* a white label without its own verified sending address: link only */
  reset();
  DB.seed('omega_orgs/' + SELLER, Object.assign(DB.data.get('omega_orgs/' + SELLER), { whiteLabel: { enabled: true, platformName: 'Sunwave OS', attribution: 'powered-by' } }));
  id = (await post(saveBody())).quote.id;
  await refused(function () { return post({ action: 'send', id: id, sendId: sid(), deliver: 'email' }); }, 409, /link instead/, 'white label, no mailFrom: email refused, never a ClearSky From line');
  eq(SENT.length, 0, 'nothing mailed');
  var wlLink = await post({ action: 'send', id: id, sendId: sid(), deliver: 'link' });
  ok(wlLink.ok && wlLink.mailState === 'manual', 'a link goes');
  eq(wlLink.quote.seller.attribution, 'Powered by ClearSky OMEGA', 'the white label’s own attribution line is the footer');
  DB.seed('omega_orgs/' + SELLER, Object.assign(DB.data.get('omega_orgs/' + SELLER), { whiteLabel: { enabled: true, platformName: 'Sunwave OS', supportEmail: 'help@sunwave.energy', embed: { mailFrom: 'quotes@sunwave.energy' } } }));
  var wlMail = await post({ action: 'send', id: id, sendId: sid(), deliver: 'email' });
  ok(wlMail.ok && SENT.length === 1 && SENT[0].from === 'quotes@sunwave.energy' && SENT[0].html.indexOf('ClearSky') >= 0 === /Powered by ClearSky OMEGA/.test(SENT[0].html), 'with a verified mailFrom it is emailed from the seller’s own address');
  ok(/help@sunwave\.energy/.test(SENT[0].html), 'and the footer is the seller’s own desk');
  /* a stale quote is not sent */
  reset(); id = (await post(saveBody())).quote.id;
  var moved = DB.data.get('projects/p1'); moved.prime.layout = PP.layout({ unit: seedUnit(), area: moved.prime.layout.area, unitAt: { lat: 41.8856, lng: -87.6537 }, poi: moved.prime.layout.poi, conduit: true });
  DB.seed('projects/p1', moved);
  await refused(function () { return post({ action: 'send', id: id, sendId: sid(), deliver: 'link' }); }, 409, /site changed/, 'the map moved since the quote was priced: save again first');
  var rowsStale = await get({ list: '1' });
  ok(rowsStale.quotes[0].stale === true, 'the Desk flags it stale');
  tick();
  await post(saveBody({ id: id }));
  ok((await get({ list: '1' })).quotes[0].stale === false, 'saved again: no longer stale');

  /* ══ 5 · the customer's view ══ */
  reset(); id = (await post(saveBody())).quote.id;
  var key = keyOf((await post({ action: 'send', id: id, sendId: sid(), deliver: 'link' })).url);
  await refused(function () { return view(id, 'b'.repeat(48)); }, 404, /not found/, 'a wrong key is a missing quote');
  await refused(function () { return view('qt-0000000000000000', key); }, 404, /not found/, 'a wrong id is a missing quote');
  await refused(function () { return view('../omega_orgs/x', key); }, 404, /not found/, 'a path is not an id');
  var v1 = await view(id, key);
  ok(v1.quote.status === 'viewed' && v1.quote.price.total === Q.money(quote(id).pricing.sellCents), 'the first view opens it: sent → viewed, the price formatted');
  var r3 = quote(id);
  ok(r3.status === 'viewed' && r3.acceptance.viewedAt === NOW && r3.acceptance.viewCount === 1 && r3.acceptance.lastViewedAt === NOW, 'viewedAt, lastViewedAt and the count');
  tick(5000);
  await view(id, key);
  ok(quote(id).acceptance.viewCount === 2 && quote(id).acceptance.viewedAt === NOW - 5000 && quote(id).acceptance.lastViewedAt === NOW, 'a second view counts, the first view stays the first');
  var notes = Array.from(DB.data.entries()).filter(function (e) { return e[0].indexOf('omega_orgs/' + SELLER + '/notifications/') === 0 && e[1].kind === 'quote-viewed'; });
  eq(notes.length, 1, 'the seller is notified once, on the first view');
  var blob = JSON.stringify(v1);
  ['internal', 'margin', 'markupPct', 'keyHash', 'history', 'createdBy', 'ipHash', 'supplier', 'divisions', Q.money(r3.cost.totalCents.base), Q.money(r3.pricing.marginCents), 'riley@sunwave.energy"', 'orgId'].forEach(function (w) {
    if (w === 'riley@sunwave.energy"') return; /* the rep's own address is on the letterhead on purpose */
    ok(blob.indexOf(w) < 0, 'the served customer view never carries ' + w);
  });
  ok(v1.quote.seller.rep.email === REP.email && v1.quote.snapshot === r3.snapshot, 'it carries the rep to answer questions, and the snapshot to approve');
  /* ══ 6 · editing what was sent withdraws it ══ */
  tick();
  var ed = await post(saveBody({ id: id }));
  ok(ed.quote.status === 'draft' && quote(id).acceptance === null && quote(id).rev === 2, 'a viewed quote that is edited goes back to draft, rev 2');
  ok(quote(id).history.some(function (h) { return h.action === 'withdrawn-for-edit'; }), 'and its history says the sent copy was withdrawn');
  await refused(function () { return view(id, key); }, 404, /not found/, 'the old link no longer opens it');
  await refused(function () { return pub({ action: 'approve', id: id, key: key, name: 'Dana Ruiz', agree: true, snapshot: r3.snapshot }); }, 404, /not found/, 'nor can it approve what was withdrawn');
  /* ══ 7 · expiry ══ */
  key = keyOf((await post({ action: 'send', id: id, sendId: sid(), deliver: 'link' })).url);
  var snap = (await view(id, key)).quote.snapshot;
  tick(31 * 86400000);
  var ex = await view(id, key);
  ok(ex.quote.status === 'expired' && quote(id).status === 'expired', 'past its date it reads expired, and is recorded so');
  await refused(function () { return pub({ action: 'approve', id: id, key: key, name: 'Dana Ruiz', agree: true, snapshot: snap }); }, 409, /cannot become approved/, 'an expired quote cannot be approved');
  var re = await post({ action: 'send', id: id, sendId: sid(), deliver: 'link' });
  ok(re.ok && quote(id).status === 'sent', 'the rep may send it again: a new key, a new term');
  key = keyOf(re.url);

  /* ══ 8 · approve → exactly one order, in the SELLER's own Omega Logic ══ */
  var shown2 = (await view(id, key)).quote;
  await refused(function () { return pub({ action: 'approve', id: id, key: key, name: 'Dana Ruiz', snapshot: shown2.snapshot }); }, 400, /Tick the box/, 'agree is required');
  await refused(function () { return pub({ action: 'approve', id: id, key: key, agree: true, snapshot: shown2.snapshot }); }, 400, /Type your name/, 'a name is required');
  await refused(function () { return pub({ action: 'approve', id: id, key: key, name: 'Dana Ruiz', agree: true, snapshot: 'c'.repeat(64) }); }, 409, /changed since it was opened/, 'a snapshot that is not the one sent cannot approve');
  await refused(function () { return pub({ action: 'approve', id: id, key: 'd'.repeat(48), name: 'Dana Ruiz', agree: true, snapshot: shown2.snapshot }); }, 404, /not found/, 'a wrong key cannot approve');
  await refused(function () { return pub({ action: 'approve', id: id, key: key, name: 'Dana Ruiz', agree: true, snapshot: shown2.snapshot, total: 1 }); }, 400, /Unsupported field/, 'an extra field is refused');
  SENT = [];
  var ap = await pub({ action: 'approve', id: id, key: key, name: 'Dana Ruiz', title: 'Facilities Director', email: 'dana@riverside.co', agree: true, snapshot: shown2.snapshot });
  var r4 = quote(id);
  ok(ap.ok && ap.quote.status === 'approved' && ap.quote.decision.approvedBy.name === 'Dana Ruiz' && ap.quote.decision.approvedBy.title === 'Facilities Director', 'approved, by name and title');
  ok(r4.acceptance.approvedAt === NOW && /^[a-f0-9]{32}$/.test(r4.acceptance.ipHash) && r4.acceptance.agreedSnapshot === shown2.snapshot, 'the approval records when, a hashed ip and the snapshot agreed to');
  ok(r4.handoff && r4.handoff.error === 'Sunwave Energy is not on Omega Logic yet — add Omega Logic to fulfil approved quotes here, then press Retry.' && !r4.handoff.orderId, 'the seller is not on Omega Logic yet: the hand-off is refused in plain words');
  var orders = function () { return Array.from(DB.data.entries()).filter(function (e) { return /^orders\/[^/]+$/.test(e[0]) && e[1].sourceQuoteId === id; }); };
  eq(orders().length, 0, 'and no order exists');
  ok(SENT.some(function (m) { return m.to === REP.email && /Quote approved/.test(m.subject) && /not on Omega Logic yet/.test(m.html) && m.replyTo === 'dana@riverside.co'; }), 'the rep is told, with the reason, Reply-To the customer');
  eq(DB.data.get('projects/p1').prime.quote.status, 'approved', 'the project mirror says approved');
  var lad0 = (await get({ id: id })).ladder;
  ok(lad0.current === 'ordered' && /not on Omega Logic yet/.test(lad0.steps[4].note) && lad0.steps[3].state === 'done', 'the ladder: approved, the order step current with the reason');
  ok((await get({ list: '1' })).quotes[0].handoff.logicUrl === null && (await get({ id: id })).quote.handoff.logicUrl === null, 'no order yet: no Omega Logic link');
  /* not on Omega Logic: Prime and the Desk offer it, never a dead link — an
     owner or administrator is offered the module, a member is told whom to
     ask (Tommy, 2026-10-17: "upsell the module or tell them to ask an admin") */
  var lg0 = (await get({ id: id })).logic;
  ok(lg0.on === false && lg0.canAdd === true && lg0.url === '/workspace#module-logic-office' && lg0.module === 'logic-office', 'an administrator is offered Omega Logic on its Modules card');
  DB.seed('omega_orgs/' + SELLER + '/members/u5', { role: 'member', status: 'active' });
  var lgm = (await get({ list: '1' }, { uid: 'u5', email: 'mo@sunwave.energy', orgId: SELLER, staff: false, claims: { email_verified: true } })).logic;
  ok(lgm.on === false && lgm.canAdd === false && lgm.url === '/workspace#module-logic-office', 'a member is not offered the purchase; the page says to ask an owner or administrator');
  /* the workspace adds Omega Logic, the rep retries */
  DB.seed('omega_orgs/' + SELLER + '/billing/current', { tier: 'standard', addons: ['omega-logic'] });
  DB.seed('omega_orgs/' + SELLER + '/fulfillment/config', { enabled: true, accounting: 'tenant', terms: { depositPct: 30, dueDays: 30 } });
  var lg1 = (await get({ projectId: 'p1' })).logic;
  ok(lg1.on === true && lg1.canAdd === false && lg1.url === '/omega-logic?org=sunwave.energy', 'on Omega Logic: the link opens the workspace’s own Omega Logic');
  await refused(function () { return post({ action: 'handoff', id: id }, VIEWER); }, 403, /viewer/, 'a viewer cannot retry the hand-off');
  var ho = await post({ action: 'handoff', id: id });
  ok(ho.ok && ho.handoff.orderNo && /^PRM-20261/.test(ho.handoff.orderNo) && ho.handoff.org === SELLER && ho.handoff.workspace === 'Sunwave Energy' && !ho.handoff.error, 'once the workspace is on Omega Logic, the retry makes the order there: ' + ho.handoff.orderNo);
  eq(orders().length, 1, 'exactly one order');
  var order = orders()[0][1], oid = orders()[0][0].split('/')[1];
  ok(oid === 'prime_' + require('../api/_lib/logic-policy').key(SELLER + ':project:p1:' + id + ':' + r4.rev), 'its id is deterministic: prime_<key(seller:project:quote:rev)>');
  eq(ho.quote.handoff.logicUrl, '/omega-logic?org=sunwave.energy&order=' + oid + '#orders', 'the seller’s view links to the order in its own Omega Logic');
  ok(ho.handoff.reference === true && ho.quote.handoff.procure.mfr === 'CleanCell US' && ho.quote.handoff.procure.mfrOrgId === null, 'the battery is bought in from its maker: a reference line');
  ok(order.orgId === SELLER && order.status === 'new' && order.source === 'prime' && order.pricing === null && !order.logic, 'in the SELLER’s workspace, new, unpriced, unaccepted');
  eq(order.items, [{ sku: 'CC-SM-1000', name: 'CleanCell US Smart Module - 1 MW / 2 MWh (non-BABA)', kind: 'product', qty: 1, reference: true, mfr: 'CleanCell US' }], 'the line is the quoted battery as a reference product (the seller publishes none)');
  ok(order.customer.email === 'dana@riverside.co' && order.customer.company === 'Riverside Cold Chain' && order.delivery.destinations[0].address.name === 'Riverside Cold Chain' && order.delivery.destinations[0].address.zip === '60607', 'the end client is the buyer and the delivery');
  ok(order.originatorOrgId === SELLER && order.sourceProjectId === 'p1' && order.sourceQuoteId === id && order.purchaseOrder.number === r4.quoteNo, 'it says where it came from');
  ok(order.approvedQuote.totalCents === r4.pricing.sellCents && order.approvedQuote.quoteId === id && order.approvedQuote.rev === r4.rev, 'the seller’s own approved price rides on its own order');
  var oj = JSON.stringify(order);
  [Q.money(r4.pricing.marginCents), 'margin', 'markup', 'sellCents', String(r4.cost.totalCents.base), Q.money(r4.cost.totalCents.base), 'Facilities'].forEach(function (w) {
    ok(oj.indexOf(w) < 0, 'the order never carries ' + w);
  });
  ok(!Array.from(DB.data.entries()).some(function (e) { return /^orders\/[^/]+$/.test(e[0]) && e[1].orgId === MFR; }), 'nothing lands in the battery maker’s workspace');
  ok(Array.from(DB.data.keys()).some(function (k) { return k.indexOf('orders/' + oid + '/events/') === 0; }), 'an events row');
  ok(Array.from(DB.data.entries()).some(function (e) { return e[0].indexOf('omega_audit/') === 0 && e[1].action === 'prime-order' && e[1].orderId === oid; }), 'an omega_audit row');
  ok(Array.from(DB.data.entries()).some(function (e) { return e[0].indexOf('omega_orgs/' + SELLER + '/notifications/') === 0 && e[1].kind === 'order' && e[1].orderId === oid; }), 'a notification to the seller’s own office');
  eq(DB.data.get('projects/p1').prime.order, { org: SELLER, id: oid, orderNo: ho.handoff.orderNo, at: new Date(NOW).toISOString() }, 'the project mirror prime.order');
  ok(/is in Sunwave Energy’s Omega Logic to fulfil \(the battery is bought in from CleanCell US\)/.test(JSON.stringify((await get({ id: id })).quote.events)), 'the quote’s log says where the order is');
  /* idempotent */
  var ap2 = await pub({ action: 'approve', id: id, key: key, name: 'Dana Ruiz', agree: true, snapshot: shown2.snapshot });
  ok(ap2.ok && ap2.repeat === true, 'a second approval answers with the first');
  var ho2 = await post({ action: 'handoff', id: id });
  ok(ho2.ok && ho2.handoff.orderNo === ho.handoff.orderNo, 'a second hand-off answers with the order made');
  quote(id).handoff.error = 'x';
  DB.seed('customer_quotes/' + id, Object.assign(quote(id), { handoff: { error: 'forced', tries: 2 } }));
  var ho3 = await post({ action: 'handoff', id: id });
  ok(ho3.ok && ho3.handoff.orderNo === ho.handoff.orderNo, 'even a forced retry finds the same order (deterministic id)');
  eq(orders().length, 1, 'still exactly one order');
  await refused(function () { return post(saveBody({ id: id })); }, 409, /approved quote cannot be edited/, 'an approved quote cannot be edited');
  await refused(function () { return pub({ action: 'decline', id: id, key: key }); }, 409, /approved quote cannot become declined/, 'nor declined');
  await refused(function () { return post({ action: 'withdraw', id: id }); }, 409, /approved quote cannot become withdrawn/, 'nor withdrawn');
  /* the ladder after the order */
  var g1 = await get({ id: id });
  ok(g1.ladder.current === 'priced' && g1.ladder.steps[4].state === 'done' && g1.ladder.steps[5].note === 'With your office to price', 'the ladder: ordered, waiting on the seller’s own office to price');
  var lj = JSON.stringify(g1.ladder);
  ok(lj.indexOf('$') < 0 && lj.indexOf('deposit') < 0, 'the ladder names no price or terms');
  DB.seed('orders/' + oid, Object.assign(DB.data.get('orders/' + oid), { status: 'accepted', logic: { createdAt: '2026-11-01T00:00:00Z', acceptedAt: '2026-11-02T00:00:00Z', commercial: { baseCents: 99900000, totalCents: 99900000, depositCents: 29970000 }, invoices: { deposit: { amountCents: 29970000, paidCents: 0 } } }, tenantPricing: { total: 999000 } }));
  var g2 = await get({ id: id });
  ok(g2.ladder.current === 'released' && JSON.stringify(g2.ladder).indexOf('999') < 0, 'priced and accepted: waiting for release, and the office’s price is nowhere in it');
  ok(g2.quote.internal && JSON.stringify(g2.quote).indexOf('99900000') < 0 && JSON.stringify(g2.quote).indexOf('999,000') < 0, 'nor in the seller’s view of the quote');
  var rowsNow = (await get({ list: '1' })).quotes;
  ok(rowsNow[0].stage && rowsNow[0].stage.key === 'accepted' && rowsNow[0].stage.label === 'Accepted · awaiting release' && rowsNow[0].handoff.orderNo === ho.handoff.orderNo, 'the Desk row carries where it is: ' + rowsNow[0].stage.label);
  eq(rowsNow[0].handoff.logicUrl, '/omega-logic?org=sunwave.energy&order=' + oid + '#orders', 'and the link into the seller’s own Omega Logic');
  /* an order made before 2026-10-17 sits in a manufacturer's workspace: no link the seller could not open */
  eq(Q.handoffUrl({ orgId: SELLER, handoff: { orderId: 'prime_old', org: MFR } }), null, 'a hand-off to another workspace carries no Omega Logic link');
  ok((await get({ projectId: 'p1' })).quotes.length === 1, 'the project’s quotes');

  /* ══ 9 · decline, question, withdraw ══ */
  reset(); id = (await post(saveBody())).quote.id;
  key = keyOf((await post({ action: 'send', id: id, sendId: sid(), deliver: 'link' })).url);
  await refused(function () { return pub({ action: 'question', id: id, key: key, message: ' ' }); }, 400, /Type your question/, 'a question needs words');
  for (var qn = 1; qn <= 10; qn++) { var qa = await pub({ action: 'question', id: id, key: key, message: 'Question ' + qn + ': what about the fence?', email: 'dana@riverside.co' }); }
  ok(qa.ok && qa.questions === 10, 'ten questions are taken');
  await refused(function () { return pub({ action: 'question', id: id, key: key, message: 'Eleven?' }); }, 429, /10 questions/, 'the eleventh is refused (durable, counted on the record)');
  ok(SENT.filter(function (m) { return /A question about your quote/.test(m.subject) && m.to === REP.email; }).length === 10, 'each question reaches the rep');
  eq((await get({ id: id })).quote.acceptance.questions.length, 10, 'and is on the seller’s view');
  var longReason = new Array(1500).join('x');
  var dc = await pub({ action: 'decline', id: id, key: key, reason: longReason });
  ok(dc.ok && dc.quote.status === 'declined' && quote(id).acceptance.declineReason.length === 1000, 'declined; the reason is capped at 1,000 characters');
  var dc2 = await pub({ action: 'decline', id: id, key: key, reason: 'again' });
  ok(dc2.repeat === true && quote(id).acceptance.declineReason.length === 1000, 'a second decline changes nothing');
  await refused(function () { return pub({ action: 'question', id: id, key: key, message: 'Still there?' }); }, 409, /declined/, 'a declined quote takes no questions');
  ok((await get({ id: id })).ladder.off.key === 'declined', 'the ladder puts a declined quote off the ladder');
  tick();
  ok((await post(saveBody({ id: id }))).quote.status === 'draft', 'a declined quote may be revised (back to draft)');
  key = keyOf((await post({ action: 'send', id: id, sendId: sid(), deliver: 'link' })).url);
  var wd = await post({ action: 'withdraw', id: id });
  ok(wd.ok && quote(id).status === 'withdrawn' && quote(id).acceptance.keyHash === null, 'withdrawn: the key is gone');
  await refused(function () { return view(id, key); }, 404, /not found/, 'the link no longer opens it');
  await refused(function () { return post({ action: 'send', id: id, sendId: sid(), deliver: 'link' }); }, 409, /withdrawn quote cannot be sent/, 'a withdrawn quote is saved again before it is sent');
  ok((await get({ id: id })).ladder.off.key === 'withdrawn', 'the ladder says withdrawn');
  await refused(function () { return get({}); }, 400, /list=1/, 'a bare GET asks for what it wants');
  await refused(function () { return post({ action: 'save', projectId: 'p1' }, null); }, 401, null, 'no token, no tenant door');

  /* ══ 10 · the manufacturer selling its own battery (its own workspace) ══ */
  reset();
  DB.seed('omega_orgs/' + MFR + '/members/c1', { role: 'owner', status: 'active', name: 'Casey Cell' });
  DB.seed('omega_orgs/' + MFR + '/storefront/config', { products: [PRODUCT] });
  var CCREP = { uid: 'c1', email: 'casey@cleancell.us', orgId: MFR, staff: false, claims: { email_verified: true } };
  var ccUnits = PP.units({ orgId: MFR, brand: 'Clean Cell', entries: {}, keys: [], ownOnly: true, owner: ['cleancell'] }, CC.entries(), { isOwn: BP.isOwn });
  var ccSm = PP.repFootprint(ccUnits.filter(function (u) { return u.key === 'CLEANCELL-SM-1000-REV-H'; })[0], 40, 10);
  DB.seed('projects/c1', projectDoc(ccSm, { orgId: MFR, uid: 'c1' }));
  DB.seed('omega_orgs/' + MFR + '/customer_index/dana@riverside.co', { customerId: 'acct1' });
  DB.seed('omega_orgs/' + MFR + '/customers/acct1', { name: 'Riverside Cold Chain', status: 'active' });
  DB.seed('omega_orgs/' + MFR + '/customers/acct1/users/dana@riverside.co', { email: 'dana@riverside.co', status: 'active', role: 'owner' });
  var own = await post(Object.assign(saveBody(), { projectId: 'c1' }), CCREP);
  var oidOwn = own.quote.id;
  eq(quote(oidOwn).unit.vendorOrgId, MFR, 'its own workspace’s Rev H unit is its own (vendorOrgId)');
  key = keyOf((await post({ action: 'send', id: oidOwn, sendId: sid(), deliver: 'link' }, CCREP)).url);
  var shownOwn = (await view(oidOwn, key)).quote;
  eq(shownOwn.seller.attribution, 'Powered by ClearSky OMEGA', 'Clean Cell is white-labelled: its footer is the contract’s line');
  await pub({ action: 'approve', id: oidOwn, key: key, name: 'Dana Ruiz', agree: true, snapshot: shownOwn.snapshot });
  var ownOrder = Array.from(DB.data.entries()).filter(function (e) { return /^orders\/[^/]+$/.test(e[0]) && e[1].sourceQuoteId === oidOwn; });
  eq(ownOrder.length, 1, 'approved: one order, at once (the SKU is published)');
  var oo = ownOrder[0][1];
  ok(oo.orgId === MFR && oo.customer.email === 'dana@riverside.co' && oo.customer.company === 'Riverside Cold Chain' && oo.customerId === 'acct1', 'same workspace: the end client is the buyer, stamped onto the admitted account');
  ok(oo.approvedQuote && oo.approvedQuote.totalCents === quote(oidOwn).pricing.sellCents, 'and the price its customer approved prefills its own office');
  eq(oo.items, [{ sku: 'CC-SM-1000', name: 'Smart Module 1 MW / 2 MWh', kind: 'product', qty: 1 }], 'its published product is a normal line');
  ok(oo.procure === null, 'and its own battery is not bought in');
  ok(DB.data.get('omega_orgs/' + MFR + '/customers/acct1').hasOrders === true, 'the account now has orders');

  /* ══ 11 · the review of 2026-10-17 ══ */
  function at(when) { var t = Date.parse(when); assert.ok(t >= NOW, 'the clock only moves forward: ' + when); NOW = t; }
  function onLogic() {
    DB.seed('omega_orgs/' + SELLER + '/billing/current', { tier: 'standard', addons: ['omega-logic'] });
    DB.seed('omega_orgs/' + SELLER + '/fulfillment/config', { enabled: true, accounting: 'tenant', terms: { depositPct: 30, dueDays: 30 } });
  }
  async function approvedOn(projectId) {
    var qid = (await post(Object.assign(saveBody(), { projectId: projectId }))).quote.id;
    var k = keyOf((await post({ action: 'send', id: qid, sendId: sid(), deliver: 'link' })).url);
    var shownQ = (await view(qid, k)).quote;
    return { id: qid, key: k, answer: await pub({ action: 'approve', id: qid, key: k, name: 'Dana Ruiz', agree: true, snapshot: shownQ.snapshot }) };
  }
  function row(list, qid) { return list.filter(function (x) { return x.id === qid; })[0]; }
  function orderKeys() { return Array.from(DB.data.keys()).filter(function (k) { return /^orders\/[^/]+$/.test(k); }); }

  /* — money:0 / pages:1 — the validity is a DATE: the offer holds to the
     end of the date the email, the deck and the pages print (UTC) — */
  reset(); at('2027-01-05T15:00:00Z');                  /* 9 am in Chicago */
  id = (await post(saveBody())).quote.id;
  key = keyOf((await post({ action: 'send', id: id, sendId: sid(), deliver: 'email' })).url);
  eq(new Date(quote(id).acceptance.validUntil).toISOString(), '2027-02-04T23:59:59.999Z', 'sent for 30 days at 15:00Z: valid through the END of 2027-02-04 (UTC)');
  eq(Q.validUntilAt(Date.parse('2027-01-05T15:00:00Z'), 30), Date.parse('2027-02-04T23:59:59.999Z'), 'Q.validUntilAt: 23:59:59.999 UTC on the date sentAt + validDays falls on');
  ok(/valid until <b>2027-02-04<\/b>/.test(SENT[SENT.length - 1].html), 'the email prints that date');
  eq(row((await get({ list: '1' })).quotes, id).validUntil, '2027-02-04', 'the Desk row keeps YYYY-MM-DD');
  at('2027-02-04T17:00:00Z');                           /* 11 am in Chicago on the printed date: it used to be expired by now */
  var lastDay = (await view(id, key)).quote;
  ok(lastDay.status === 'viewed' && lastDay.validUntil === '2027-02-04' && quote(id).status === 'viewed', 'opened on the printed last day: open, not expired');
  ok(require('../omega-quote-deck.js').body(lastDay).indexOf('February 4, 2027') >= 0, 'the deck prints the same date');
  eq(quote(id).acceptance.validUntil, Date.parse(lastDay.validUntil + 'T00:00:00Z') + 86400000 - 1, 'the server’s last moment IS the pages’ reading of the date (quote.html and Today: the end of that UTC day)');
  at('2027-02-04T23:59:00Z');
  var lastMinute = await pub({ action: 'approve', id: id, key: key, name: 'Dana Ruiz', agree: true, snapshot: lastDay.snapshot });
  ok(lastMinute.ok && quote(id).status === 'approved', 'approved in the last minute of the printed date');
  reset(); at('2027-02-10T15:00:00Z');
  id = (await post(saveBody())).quote.id;
  key = keyOf((await post({ action: 'send', id: id, sendId: sid(), deliver: 'link' })).url);
  var openSnap = (await view(id, key)).quote.snapshot;
  at('2027-03-12T23:59:59.999Z');
  ok((await view(id, key)).quote.status === 'viewed', 'open to 23:59:59.999 UTC on its date');
  at('2027-03-13T00:00:00.000Z');
  ok((await view(id, key)).quote.status === 'expired' && quote(id).status === 'expired', 'expired from the first moment of the next day');
  await refused(function () { return pub({ action: 'approve', id: id, key: key, name: 'Dana Ruiz', agree: true, snapshot: openSnap }); }, 409, /cannot become approved/, 'and then cannot be approved');
  reset(); at('2027-03-20T01:00:00Z');                  /* 8 pm in Chicago on 19 March */
  id = (await post(saveBody())).quote.id;
  key = keyOf((await post({ action: 'send', id: id, sendId: sid(), deliver: 'email' })).url);
  eq(new Date(quote(id).acceptance.validUntil).toISOString(), '2027-04-19T23:59:59.999Z', 'an evening send: valid through the date it prints, 2027-04-19');
  ok(/valid until <b>2027-04-19<\/b>/.test(SENT[SENT.length - 1].html), 'which the email prints');
  at('2027-04-19T02:00:00Z');                           /* the evening BEFORE the printed date, in Chicago: it used to end here */
  ok((await view(id, key)).quote.status === 'viewed', 'still open the evening before the printed date');
  at('2027-04-19T22:00:00Z');                           /* 5 pm in Chicago on the printed date */
  ok((await view(id, key)).quote.status === 'viewed', 'and open on the printed date itself');

  /* — money:4 — the customer's questions survive an edit and a resend — */
  reset(); at('2027-05-03T15:00:00Z');
  id = (await post(saveBody())).quote.id;
  key = keyOf((await post({ action: 'send', id: id, sendId: sid(), deliver: 'link' })).url);
  await pub({ action: 'question', id: id, key: key, message: 'Can you do 15% less?', email: 'dana@riverside.co' });
  var logged = Array.from(DB.data.entries()).filter(function (e) { return e[0].indexOf('customer_quotes/' + id + '/events/') === 0 && e[1].what === 'Question from the customer: Can you do 15% less?'; });
  ok(logged.length === 1 && logged[0][1].message === 'Can you do 15% less?' && logged[0][1].email === 'dana@riverside.co', 'the question’s own words are in the quote’s log');
  tick();
  var edited = await post(saveBody({ id: id }));
  ok(quote(id).acceptance === null && quote(id).questions.length === 1 && quote(id).questions[0].message === 'Can you do 15% less?', 'an edit withdraws the link and keeps the question on the record');
  ok(edited.quote.questions.length === 1 && edited.quote.questions[0].message === 'Can you do 15% less?' && edited.quote.questions[0].email === 'dana@riverside.co' && edited.quote.questions[0].rev === 1, 'and on the seller’s view: what was asked, by whom, on which revision');
  key = keyOf((await post({ action: 'send', id: id, sendId: sid(), deliver: 'link' })).url);
  var resent = await get({ id: id });
  ok(resent.quote.questions.length === 1 && resent.quote.acceptance.questions.length === 0 && quote(id).acceptance.questionCount === 0, 'a resend keeps it too; the new link has had no questions yet');
  ok(resent.quote.events.some(function (e) { return e.what === 'Question from the customer: Can you do 15% less?'; }), 'the seller’s log shows the words');
  ok(JSON.stringify((await view(id, key)).quote).indexOf('15% less') < 0, 'the customer’s view never carries the questions');
  for (var qq = 1; qq <= 10; qq++) await pub({ action: 'question', id: id, key: key, message: 'Second-link question ' + qq });
  await refused(function () { return pub({ action: 'question', id: id, key: key, message: 'One too many' }); }, 429, /10 questions/, 'ten a link: the cap counts this send');
  ok(quote(id).questions.length === 11 && (await get({ id: id })).quote.acceptance.questions.length === 10, 'every question is still on the record; ten on this link');
  key = keyOf((await post({ action: 'send', id: id, sendId: sid(), deliver: 'link' })).url);
  for (qq = 1; qq <= 10; qq++) await pub({ action: 'question', id: id, key: key, message: 'Third-link question ' + qq });
  var keptQs = quote(id).questions;
  ok(keptQs.length === Q.QUESTIONS_KEPT && keptQs[0].message === 'Second-link question 1' && keptQs[keptQs.length - 1].message === 'Third-link question 10', 'the last ' + Q.QUESTIONS_KEPT + ' are kept, the oldest dropped first');
  reset(); at('2027-05-04T15:00:00Z'); delete process.env.MAIL_USER;
  id = (await post(saveBody())).quote.id;
  key = keyOf((await post({ action: 'send', id: id, sendId: sid(), deliver: 'link' })).url);
  await pub({ action: 'question', id: id, key: key, message: 'Is the fence included?' });
  ok(quote(id).questions[0].message === 'Is the fence included?' && (await get({ id: id })).quote.questions[0].message === 'Is the fence included?', 'with mail not set up, the words are still on the record (they used to live only in a mail that never went)');
  process.env.MAIL_USER = 'support@clearsky-usa.com';

  /* — pages:5 — an approved quote is never "stale": it cannot be saved again — */
  reset(); at('2027-05-10T15:00:00Z');
  var appr = await approvedOn('p1');
  tick();
  var draftQ = (await post(saveBody())).quote.id;
  var moved2 = DB.data.get('projects/p1'); moved2.prime.layout = PP.layout({ unit: seedUnit(), area: moved2.prime.layout.area, unitAt: { lat: 41.8856, lng: -87.6537 }, poi: moved2.prime.layout.poi, conduit: true });
  DB.seed('projects/p1', moved2);
  var staleRows = (await get({ list: '1' })).quotes;
  ok(row(staleRows, appr.id).status === 'approved' && row(staleRows, appr.id).stale === false, 'the map moved after the approval: the approved quote is not stale (it cannot be saved again)');
  ok(row(staleRows, draftQ).stale === true, 'the draft priced on the old map is');
  ok((await get({ id: appr.id })).quote.stale === false && (await get({ id: draftQ })).quote.stale === true, 'and the seller’s view says the same');
  ok(row((await get({ projectId: 'p1' })).quotes, appr.id).stale === false, 'Prime’s list too');

  /* — money:3 — a change after approval is a NEW quote, and the site never
     gets a second live order — */
  reset(); onLogic(); at('2027-06-01T15:00:00Z');
  var one = await approvedOn('p1');
  var orderA = DB.data.get('projects/p1').prime.order;
  ok(one.answer.ok && orderA && orderA.orderNo && quote(one.id).handoff.orderNo === orderA.orderNo && orderKeys().length === 1, 'the first approval: its order in the seller’s Omega Logic');
  tick();
  var two = await post(saveBody());   /* Prime saves a change after an approval with no id: a new quote */
  eq(two.quote.supersedes, { quoteId: one.id, quoteNo: quote(one.id).quoteNo, orderNo: orderA.orderNo, live: true }, 'the new quote names the approved one it replaces, its order, and that the order is live (the page warns before sending)');
  eq((await get({ id: two.quote.id })).quote.supersedes, two.quote.supersedes, 'and the seller’s view of it says so');
  eq((await get({ id: one.id })).quote.supersedes, null, 'the approved quote itself replaces nothing');
  var k2 = keyOf((await post({ action: 'send', id: two.quote.id, sendId: sid(), deliver: 'link' })).url), shownTwo = (await view(two.quote.id, k2)).quote;
  SENT = [];
  var apTwo = await pub({ action: 'approve', id: two.quote.id, key: k2, name: 'Dana Ruiz', agree: true, snapshot: shownTwo.snapshot });
  var held = 'This site already has order ' + orderA.orderNo + ' from proposal ' + quote(one.id).quoteNo + '. Cancel or close that order in Omega Logic, then press Send to Omega Logic again.';
  ok(apTwo.ok && quote(two.quote.id).status === 'approved', 'the customer’s approval stands');
  eq(quote(two.quote.id).handoff.error, held, 'but no second order: the quote keeps the reason in plain words');
  ok(orderKeys().length === 1 && DB.data.get('projects/p1').prime.order.id === orderA.id, 'exactly one order for the site, and the project still names it');
  ok(SENT.some(function (m) { return m.to === REP.email && m.html.indexOf('This site already has order ' + orderA.orderNo) >= 0; }), 'the rep is told why');
  eq(row((await get({ list: '1' })).quotes, two.quote.id).stage, { key: 'approved', label: 'Approved · the order needs a retry' }, 'the Desk row: the order needs a retry');
  var stillHeld = await post({ action: 'handoff', id: two.quote.id });
  ok(stillHeld.ok === false && stillHeld.handoff.error === held && orderKeys().length === 1, 'Send to Omega Logic again while the first order is live: still held');
  DB.seed('orders/' + orderA.id, Object.assign(DB.data.get('orders/' + orderA.id), { status: 'cancelled' }));
  var go = await post({ action: 'handoff', id: two.quote.id });
  ok(go.ok && go.handoff.orderNo && go.handoff.orderNo !== orderA.orderNo && !go.handoff.error && orderKeys().length === 2, 'the first order cancelled: Send to Omega Logic makes the new one, ' + go.handoff.orderNo);
  eq(DB.data.get('projects/p1').prime.order.orderNo, go.handoff.orderNo, 'and the project names it');
  tick();
  var three = await post(saveBody());
  eq(three.quote.supersedes, { quoteId: two.quote.id, quoteNo: quote(two.quote.id).quoteNo, orderNo: go.handoff.orderNo, live: true }, 'the next change names the latest approval and its live order');
  DB.seed('orders/' + go.handoff.orderId, Object.assign(DB.data.get('orders/' + go.handoff.orderId), { cancelRequested: true }));
  eq((await get({ id: three.quote.id })).quote.supersedes.live, false, 'its order cancelled in Omega Logic: no longer live, said so');

  /* — money:2 / pages:0 / money:1 / money:6 — the Desk reads the SAME ladder
     as the detail, units and coverage included, and only as much as it needs — */
  reset(); onLogic(); at('2027-07-01T15:00:00Z');
  DB.seed('projects/p2', projectDoc(seedUnit()));
  var siteA = await approvedOn('p1'), siteB = await approvedOn('p2');
  tick();
  var draftC = (await post(saveBody())).quote.id;
  var oA = quote(siteA.id).handoff, oB = quote(siteB.id).handoff;
  ok(oA.orderId && oB.orderId && oA.orderId !== oB.orderId && oA.reference === true, 'two sites, two orders (the battery bought in: a reference line)');
  var LOGIC_READY = { createdAt: '2027-07-02T00:00:00Z', acceptedAt: '2027-07-03T00:00:00Z', releasedAt: '2027-07-04T00:00:00Z', readyAt: '2027-07-10T00:00:00Z' };
  [oA, oB].forEach(function (h) { DB.seed('orders/' + h.orderId, Object.assign(DB.data.get('orders/' + h.orderId), { status: 'in_fulfilment', logic: LOGIC_READY })); });
  var COMMISSIONED = { status: 'commissioned', shippedAt: '2027-07-12', deliveredAt: '2027-07-15', receivedAt: '2027-07-15', commissionedAt: '2027-07-20', siteId: 'site1', siteName: 'Lake St' };
  function plantUnit(serial, orderId, custody) { DB.seed('plant_units/' + SELLER + '__' + serial, { orgId: SELLER, orderId: orderId, serial: serial, sku: 'CC-SM-1000', shipUnit: true, at: 'ready', custody: custody }); }
  plantUnit('SM-0001', oA.orderId, COMMISSIONED);
  plantUnit('SM-0002', oB.orderId, { status: 'in_transit', shippedAt: '2027-07-28' });
  DB.seed('omega_orgs/' + SELLER + '/storefront/config', { products: [PRODUCT] });   /* the seller records the warranty (10 years from shipment) */
  at('2027-08-01T15:00:00Z');
  var detailA = await get({ id: siteA.id });
  ok(detailA.ladder.complete && detailA.ladder.current === 'teleios', 'the detail: delivered, on site and under warranty');
  var QC = 0, SC = 0, qget = F.Query.prototype.get, rget = F.Ref.prototype.get, desk;
  F.Query.prototype.get = function () { if (this.path === 'plant_units') QC++; return qget.apply(this, arguments); };
  F.Ref.prototype.get = function () { if (/\/storefront\/config$/.test(this.path)) SC++; return rget.apply(this, arguments); };
  try { desk = (await get({ list: '1' })).quotes; } finally { F.Query.prototype.get = qget; F.Ref.prototype.get = rget; }
  eq(row(desk, siteA.id).stage, { key: 'teleios', label: 'Omega Teleios · complete' }, 'the Desk row reads Omega Teleios · complete');
  eq(row(desk, siteA.id).stage, T.stage(detailA.ladder), 'one ladder: the row and the detail agree');
  eq(row(desk, siteB.id).stage, { key: 'shipped', label: 'Shipped' }, 'the other site, on the road: Shipped');
  eq(row(desk, draftC).stage, { key: 'saved', label: 'Quote saved' }, 'a draft has no order to read');
  ok(QC === 2 && SC === 1, 'bounded: one plant_units query an order (' + QC + '), the catalog read once for the workspace (' + SC + ')');
  eq(row((await get({ projectId: 'p1' })).quotes, siteA.id).stage, row(desk, siteA.id).stage, 'Prime’s list (?projectId=) reads the same');
  /* money:6: an RMA opened after completion is a note, never a rewind */
  plantUnit('SM-0001', oA.orderId, Object.assign({}, COMMISSIONED, { status: 'rma_open', rma: { openedAt: '2027-07-30', reason: 'Inverter fault', returnedAt: null } }));
  var rmaDetail = await get({ id: siteA.id });
  ok(rmaDetail.ladder.complete && /RMA open on SM-0001 since 2027-07-30$/.test(rmaDetail.ladder.steps[14].note), 'an RMA on the completed project: still complete, the RMA a note on the step');
  eq(row((await get({ list: '1' })).quotes, siteA.id).stage.key, 'teleios', 'and the Desk row still reads Omega Teleios');
  /* replaced under RMA by stock from another order: read through the replacement */
  plantUnit('SM-0001', oA.orderId, Object.assign({}, COMMISSIONED, { status: 'replaced', replacedBy: 'SM-0009', replacedAt: '2027-07-31', rma: { openedAt: '2027-07-30' } }));
  plantUnit('SM-0009', 'prime_stock_order', { status: 'assigned', siteId: 'site1', siteName: 'Lake St', replaces: 'SM-0001', receivedAt: '2027-07-31', assignedAt: '2027-07-31',
    inheritedCoverage: [{ templateId: 'warranty', type: 'warranty', provider: 'oem', startDate: '2027-07-12', endDate: '2037-07-12', inheritedFrom: 'SM-0001' }] });
  var repDetail = await get({ id: siteA.id });
  ok(repDetail.ladder.complete && repDetail.ladder.steps[14].at === '2027-07-12T00:00:00.000Z', 'replaced by a unit from stock: the door reads the replacement by serial; complete on the inherited warranty');
  eq(row((await get({ list: '1' })).quotes, siteA.id).stage.key, 'teleios', 'the Desk row too');
  /* money:1: the maker's warranty not on file — the bought-in battery holds Teleios */
  plantUnit('SM-0001', oA.orderId, COMMISSIONED); DB.data.delete('plant_units/' + SELLER + '__SM-0009');
  DB.seed('omega_orgs/' + SELLER + '/storefront/config', { products: [] });
  var noWarranty = await get({ id: siteA.id });
  ok(!noWarranty.ladder.complete && noWarranty.ladder.current === 'teleios', 'no warranty on file for the bought-in battery: not complete');
  eq(noWarranty.ladder.steps[14].note, 'No warranty on file for CC-SM-1000: it is bought in from CleanCell US, and the maker’s warranty is not on file in this workspace', 'said in plain words');
  eq(row((await get({ list: '1' })).quotes, siteA.id).stage, { key: 'onsite', label: 'On site' }, 'the Desk row reads On site, never Omega Teleios');

  /* — the lead's standing() fixes, kept: a public mailbox domain and an
     unverified sign-up on the seller's domain reach nothing — */
  reset(); at('2027-08-02T15:00:00Z');
  id = (await post(saveBody())).quote.id;
  var DRIFT = { uid: 'drifter', email: 'drifter@' + SELLER, orgId: SELLER, staff: false, claims: { email_verified: false } };
  await refused(function () { return post(saveBody({ id: id }), DRIFT); }, 403, /Verify your email/, 'an unverified sign-up saves nothing');
  await refused(function () { return post(Object.assign({ action: 'preview', projectId: 'p1' }, BODY), DRIFT); }, 403, /Verify your email/, 'previews nothing (the cost and margin)');
  await refused(function () { return get({ projectId: 'p1' }, DRIFT); }, 403, /Verify your email/, 'lists no project’s quotes');
  await refused(function () { return post({ action: 'handoff', id: id }, DRIFT); }, 403, /Verify your email/, 'and hands nothing to Omega Logic');
  ok((await get({ list: '1' }, Object.assign({}, REP, { claims: { email_verified: false } }))).quotes.length === 1, 'an owner or administrator of an active client reads without the email link (admin.clientAdmin)');
  DB.seed('omega_orgs/gmail.com', { name: 'Gmail', status: 'active' }); DB.seed('omega_orgs/gmail.com/members/g', { role: 'owner', status: 'active' });
  DB.seed('customer_quotes/qt-00000000000000aa', Object.assign({}, quote(id), { id: 'qt-00000000000000aa', orgId: 'gmail.com' }));
  await refused(function () { return get({ id: 'qt-00000000000000aa' }, { uid: 'g', email: 'bob@gmail.com', orgId: 'gmail.com', staff: false, claims: { email_verified: true } }); }, 403, /company workspace/, 'a quote in a public mailbox bucket opens for nobody but staff');

  console.log('test-customer-quote: ' + count + ' assertions passed');
}
run().then(function () { Date.now = realNow; }, function (e) { Date.now = realNow; console.error('FAIL', e && e.stack || e); process.exit(1); });
