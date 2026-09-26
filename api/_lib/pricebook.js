/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * The proposed price book. Persist versions in pricebook/{version}; never
 * reprice a used version. No browser copy of this file or its calculations.
 */
'use strict';
var M = require('./modules');
var VERSION = '2026-10-proposed';
function integer(n, name, min) {
  if (typeof n !== 'number' || !isFinite(n) || Math.floor(n) !== n || n < (min || 0) || n > 1000000000) {
    var e = new Error('Invalid ' + name); e.status = 400; throw e;
  }
  return n;
}
function error(message) { var e = new Error(message); e.status = 409; throw e; }
function proposed() {
  var b = { version: VERSION, currency: 'USD', enabled: false, frozen: false, usedAt: null,
    floorCents: 50000, modules: {}, logins: { builders: 3, viewers: 10, builderCents: 5000, viewerCents: 1500 },
    plans: { field: { name: 'Field', priceCents: 129900, capCents: 125000, maxDeliverables: 0 },
      pro: { name: 'Pro', priceCents: 249900, capCents: 300000, maxDeliverables: 1 } },
    logicBundle: { name: 'Omega Logic — all five', priceCents: 250000 },
    enterprise: { floorAnnualCents: 15000000, setupCents: 2500000, devHoursMonthly: 7 },
    credit: { pct: 40, days: 90 }, annualPaidMonths: 11,
    serviceFees: { lite: 150000, field: 340000, pro: 340000, enterprise: 1000000, waiverScope: 'first-year' },
    policy: { trialDays: 14, guidedBuildsInLite: true, failedPaymentGraceBusinessDays: 10,
      memberModuleEntry: true, billingProvider: 'quickbooks', savedCardEnabled: false,
      packExpiry: 'cycle-end', autoTopup: false, permittingBeta: true, removalsAtReview: true, reviewDays: 90 },
    qbo: { env: 'sandbox', realmId: null, items: {} } };
  var logic = { 'logic-office': 150000, 'logic-plant': 75000, 'logic-materials': 50000,
    'logic-logistics': 50000, 'logic-customer': 25000 };
  var shelves = { floor: 50000, addon: 25000, standard: 25000, premium: 50000, deliverable: 75000 };
  M.catalog().forEach(function (m) { b.modules[m.key] = { priceCents: m.shelf === 'platform' ? logic[m.key] : shelves[m.shelf] }; });
  b.usage = {
    evApplications: { module: 'evrebates', name: 'EV applications', included: 20, overageCents: 5000, packUnits: 10, packCents: 50000 },
    matrices: { module: 'permitting', name: 'Permitting matrices', included: 1, overageCents: 250000, packUnits: 1, packCents: 250000 },
    siteStudies: { module: 'sitefinder', name: 'Site studies', included: 25, overageCents: 1500, packUnits: 25, packCents: 37500 }
  };
  return b;
}
function validate(b) {
  if (!b || !/^[a-z0-9][a-z0-9-]{2,59}$/.test(b.version || '') || b.currency !== 'USD') error('Invalid price book');
  integer(b.floorCents, 'floor', 50000);
  if (typeof b.frozen !== 'boolean' || typeof b.enabled !== 'boolean') error('Price book flags required');
  var keys = M.catalog().map(function (m) { return m.key; });
  if (!b.modules || Object.keys(b.modules).sort().join() !== keys.slice().sort().join()) error('Price book must cover the catalog exactly');
  keys.forEach(function (k) { integer(b.modules[k].priceCents, k + ' price', 1); });
  if (b.modules.lite.priceCents < b.floorCents) error('Lite is below the floor');
  ['field', 'pro'].forEach(function (p) {
    var x = b.plans && b.plans[p]; if (!x) error('Missing plan');
    integer(x.priceCents, p + ' price', b.floorCents); integer(x.capCents, p + ' cap', 1); integer(x.maxDeliverables, p + ' deliverables');
  });
  ['builders', 'viewers', 'builderCents', 'viewerCents'].forEach(function (k) { integer(b.logins[k], k); });
  integer(b.logicBundle.priceCents, 'Logic bundle', 1);
  integer(b.enterprise.floorAnnualCents, 'Enterprise annual floor', 15000000);
  integer(b.enterprise.setupCents, 'Enterprise setup'); integer(b.enterprise.devHoursMonthly, 'development hours');
  integer(b.credit.pct, 'credit'); integer(b.credit.days, 'credit days', 1);
  if (b.credit.pct > 100 || b.credit.days > 90) error('Credit exceeds proposed limits');
  integer(b.annualPaidMonths, 'annual paid months', 1); if (b.annualPaidMonths > 12) error('Invalid annual period');
  ['lite', 'field', 'pro', 'enterprise'].forEach(function (k) { integer(b.serviceFees[k], k + ' service fee'); });
  Object.keys(b.usage).forEach(function (k) {
    var u = b.usage[k]; if (!M.get(u.module)) error('Unknown usage module');
    ['included', 'overageCents', 'packUnits', 'packCents'].forEach(function (f) { integer(u[f], k + ' ' + f, f === 'included' ? 0 : 1); });
  });
  if (b.version === VERSION && (!b.qbo || b.qbo.env !== 'sandbox')) error('Proposed book requires sandbox');
  integer(b.policy.trialDays, 'trial days', 1); if (b.policy.trialDays > 14) error('Trial exceeds 14 days');
  return b;
}
function writable(b) {
  validate(b);
  if (b.frozen || b.usedAt != null) error('Used or frozen price books are immutable; create a new version');
}
function stable(v) {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ':' + stable(v[k]); }).join(',') + '}';
  return JSON.stringify(v);
}
async function seed(db, book, apply) {
  validate(book); var ref = db.doc('pricebook/' + book.version);
  return db.runTransaction(async function (tx) {
    var s = await tx.get(ref), current = s.exists ? s.data() : null;
    if (current && stable(current) !== stable(book)) error('Version already exists; seed never overwrites it');
    if (!current && apply) tx.create(ref, book);
    return { version: book.version, action: current ? 'unchanged' : 'create', applied: !!apply };
  });
}
async function load(db, version) {
  if (typeof version !== 'string' || !/^[a-z0-9][a-z0-9-]{2,59}$/.test(version)) error('Invalid price book version');
  var s = await db.doc('pricebook/' + version).get();
  if (!s.exists) error('Price book not seeded'); return validate(s.data());
}
/* Called INSIDE the activation transaction, after reading the book and all
 * other records. Quotes do not freeze a book. A used version is never thawed. */
function freeze(tx, ref, book, now) {
  validate(book); if (book.frozen && book.usedAt != null) return;
  tx.update(ref, { frozen: true, usedAt: book.usedAt == null ? now : book.usedAt });
}
module.exports = { VERSION: VERSION, proposed: proposed, validate: validate, integer: integer,
  writable: writable, stable: stable, seed: seed, load: load, freeze: freeze };
