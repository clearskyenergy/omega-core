/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var assert = require('assert'), B = require('../api/_lib/pricebook'), P = require('../api/_lib/subscription-pricing');
var DB = require('./_lib/firestore-double').DB, count = 0;
function eq(a, b, msg) { assert.deepStrictEqual(a, b, msg); count++; }
function rejects(fn) { assert.throws(fn); count++; }
async function main() {
  var b = B.proposed(), M = require('../api/_lib/modules');
  eq(P.quote(['lite'], b).monthlyCents, 50000, 'floor');
  eq(P.quote(['lite', 'storage'], b).plan, 'alacarte', 'do not upsell a cheaper selection');
  eq(P.quote(M.starters().ev, b).plan, 'field', 'EV starter');
  eq(P.quote(M.starters().ev, b).monthlyCents, 129900);
  eq(P.quote(M.starters().epc, b).plan, 'pro');
  eq(P.quote(M.starters().epc, b).monthlyCents, 249900);
  eq(P.quote(['lite', 'permitting'], b).plan, 'alacarte');
  rejects(function () { P.quote(['lite', 'permitting'], b, { plan: 'field' }); });
  rejects(function () { P.quote(['lite', 'permitting', 'sitefinder'], b, { plan: 'pro' }); });
  rejects(function () { P.quote(['lite', 'storage', 'plansets', 'finance', 'compute'], b, { plan: 'field' }); });
  var all = M.catalog().map(function (m) { return m.key; });
  eq(P.quote(all, b).recurringCents, 900000, 'whole menu plus bundled Logic');
  eq(P.quote(['lite', 'logic-office'], b).recurringCents, 200000);
  var logic = all.filter(function (k) { return k.indexOf('logic-') === 0; });
  eq(P.quote(M.starters().ev.concat(logic), b).monthlyCents, 379900, 'Logic outside Field cap');
  eq(P.quote(['lite'], b, { builders: 4, viewers: 12 }).monthlyCents, 58000);
  [NaN, -1, 2.5, '4', Infinity, 1e12].forEach(function (v) { rejects(function () { P.quote(['lite'], b, { builders: v }); }); });
  var credit = { pct: 40, startsAt: '2026-10-01T00:00:00Z', endsAt: '2026-12-30T00:00:00Z' };
  eq(P.quote(['lite'], b, { credit: credit, now: Date.parse(credit.startsAt) }).monthlyCents, 50000);
  eq(P.quote(M.starters().ev, b, { credit: credit, now: Date.parse(credit.startsAt) }).monthlyCents, 77940);
  eq(P.quote(M.starters().ev, b, { credit: credit, now: Date.parse(credit.endsAt) }).creditCents, 0);
  eq(P.quote(M.starters().ev, b, { credit: credit, now: Date.parse(credit.startsAt) - 1 }).creditCents, 0);
  rejects(function () { P.quote(['lite'], b, { credit: { pct: 40, startsAt: credit.startsAt, endsAt: '2027-01-01' }, now: Date.now() }); });
  rejects(function () { P.quote(['lite'], b, { credit: { pct: 100, startsAt: credit.startsAt, endsAt: credit.endsAt }, now: Date.now() }); });
  eq(P.quote(['lite'], b).annualPrepayBeforeCreditCents, 550000);
  eq(P.quote(['lite'], b).serviceFee.amountCents, 150000);
  var waiver = { mode: 'waived', reason: 'Launch partner' };
  eq(P.quote(['lite'], b, { serviceFee: waiver }).serviceFee.amountCents, 0);
  eq(P.quote(['lite'], b, { serviceFee: waiver, year: 2 }).serviceFee.amountCents, 150000);
  eq(P.quote(['lite'], b, { serviceFee: { mode: 'custom', amountCents: 25000, reason: 'Agreement', appliesTo: 'every-year' }, year: 2 }).serviceFee.amountCents, 25000);
  rejects(function () { P.quote(['lite'], b, { serviceFee: { mode: 'waived' } }); });
  rejects(function () { P.quote(['lite'], b, { serviceFee: { mode: 'custom', amountCents: -1, reason: 'No' } }); });
  eq(P.quote(['lite'], b, { serviceFee: waiver }).monthlyCents, 50000, 'fee not counted toward floor');
  for (var mask = 0; mask < 256; mask++) {
    var keys = ['lite']; ['storage', 'estimate', 'gridatlas', 'plansets', 'finance', 'compute', 'permitting', 'sitefinder'].forEach(function (k, i) { if (mask & (1 << i)) keys.push(k); });
    var q = P.quote(keys, b, { credit: credit, now: Date.parse(credit.startsAt) });
    eq(q.lines.reduce(function (sum, l) { return sum + l.amountCents; }, 0), q.monthlyCents, 'invoice lines reconcile');
    assert(q.monthlyCents >= 50000); count++;
  }
  var db = new DB(); db.serial = true;
  eq((await B.seed(db, b, false)).action, 'create'); eq(db.data.size, 0);
  await B.seed(db, b, true); eq((await B.seed(db, b, true)).action, 'unchanged');
  var altered = B.proposed(); altered.modules.storage.priceCents++;
  await assert.rejects(function () { return B.seed(db, altered, true); }); count++;
  await db.runTransaction(async function (tx) { var ref = db.doc('pricebook/' + b.version), s = await tx.get(ref); B.freeze(tx, ref, s.data(), 123); });
  var frozen = await B.load(db, b.version); eq(frozen.frozen, true); eq(frozen.usedAt, 123);
  rejects(function () { B.writable(frozen); });
  frozen.frozen = false; rejects(function () { B.writable(frozen); });
  var bad = B.proposed(); bad.floorCents = 1; rejects(function () { B.validate(bad); });
  bad = B.proposed(); bad.modules.lite.priceCents = 49999; rejects(function () { B.validate(bad); });
  bad = B.proposed(); bad.policy.trialDays = 15; rejects(function () { B.validate(bad); });
  bad = B.proposed(); bad.modules.storage.priceCents = NaN; rejects(function () { B.validate(bad); });
  bad = B.proposed(); bad.qbo.env = 'production'; rejects(function () { B.validate(bad); });
  console.log('Subscription pricing and version safety: ' + count + ' passed.');
}
main().catch(function (e) { console.error(e); process.exitCode = 1; });
