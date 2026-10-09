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
  eq(P.quote(['lite'], b).annualPrepayBeforeCreditCents, 500000); /* ten months of twelve: two months free (2026-09-26) */
  /* Omega Design alone carries no service fee (Tommy, 2026-09-29): the rule is fee()'s own, so a seeded book's old Lite figure changes nothing; Field and Pro keep the plan fee */
  eq(P.quote(['lite'], b).serviceFee.amountCents, 0); eq(P.quote(['lite'], b).serviceFee.display, 'None');
  var seeded = JSON.parse(JSON.stringify(b)); seeded.serviceFees.lite = 150000;
  eq(P.quote(['lite'], seeded).serviceFee.amountCents, 0, 'the seeded 2026-10 book prices Lite the same');
  eq(P.quote(M.starters().ev, b).serviceFee.amountCents, 340000, 'Field carries the plan fee');
  var waiver = { mode: 'waived', reason: 'Launch partner' };
  eq(P.quote(M.starters().ev, b, { serviceFee: waiver }).serviceFee.amountCents, 0); eq(P.quote(M.starters().ev, b, { serviceFee: waiver }).serviceFee.display, 'Waived');
  eq(P.quote(M.starters().ev, b, { serviceFee: waiver, year: 2 }).serviceFee.amountCents, 340000);
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
  /* A NEGOTIATED TIER PRICE (2026-09-28, Tommy: "i can override it if they are on a tier otherwise they pay for what they add") */
  var ev = M.starters().ev, deal = { amountCents: 99900, reason: 'Launch partner' };
  var nq = P.quote(ev, b, { plan: 'field', priceOverride: deal });
  eq([nq.monthlyCents, nq.recurringCents, nq.plan], [99900, 99900, 'field'], 'a negotiated Field price replaces the tier price');
  eq(nq.lines.filter(function (l) { return l.itemKey === 'plan:field'; }).map(function (l) { return [l.amountCents, l.listCents, l.name]; }), [[99900, 129900, 'Field (negotiated)']], 'the plan line carries it, and remembers the list price');
  eq([nq.priceOverride.plan, nq.priceOverride.amountCents, nq.priceOverride.listCents, nq.priceOverride.reason], ['field', 99900, 129900, 'Launch partner']);
  eq(nq.display.negotiated, 'Negotiated: $999/month for Field (list $1,299/month). Launch partner');
  eq(nq.annualPrepayBeforeCreditCents, 99900 * 10, 'the year follows it');
  eq(P.quote(ev.concat(logic), b, { plan: 'field', priceOverride: deal }).monthlyCents, 99900 + 250000, 'Omega Logic is added on top at list: they pay for what they add');
  eq(P.quote(ev, b, { plan: 'field', builders: 4, priceOverride: deal }).monthlyCents, 99900 + b.logins.builderCents, 'and so are extra logins');
  eq(P.quote(ev, b, { plan: 'field', priceOverride: Object.assign({ plan: 'pro' }, deal) }).monthlyCents, 129900, 'a price negotiated for another tier does not apply');
  eq(P.quote(ev, b, { plan: 'field', priceOverride: Object.assign({ plan: 'pro' }, deal) }).priceOverride, null);
  eq(P.quote(ev, b, { plan: 'auto', priceOverride: Object.assign({ plan: 'field' }, deal) }).monthlyCents, 99900, 'under auto the negotiated tier competes at its negotiated price');
  eq(P.quote(['lite', 'storage'], b, { plan: 'auto', priceOverride: Object.assign({ plan: 'field' }, deal) }).plan, 'alacarte', 'and a selection that is cheaper à la carte stays there');
  eq(P.quote(['lite', 'storage'], b, { plan: 'auto', priceOverride: Object.assign({ plan: 'field' }, deal) }).priceOverride, null);
  rejects(function () { P.quote(['lite', 'storage'], b, { plan: 'alacarte', priceOverride: deal }); });                 /* never à la carte: they pay for what they add */
  rejects(function () { P.quote(ev, b, { plan: 'auto', priceOverride: deal }); });                                       /* a tier must be named */
  rejects(function () { P.quote(ev, b, { plan: 'field', priceOverride: { amountCents: 10000, reason: 'x' } }); });        /* never below the floor */
  rejects(function () { P.quote(ev, b, { plan: 'field', priceOverride: { amountCents: 99900 } }); });                     /* a reason */
  rejects(function () { P.quote(ev, b, { plan: 'field', priceOverride: { amountCents: 999.5, reason: 'x' } }); });        /* whole cents */
  eq(P.dollarsToCents('999', 'x'), 99900); eq(P.dollarsToCents('999.5', 'x'), 99950); rejects(function () { P.dollarsToCents('nine', 'x'); }); rejects(function () { P.dollarsToCents('-1', 'x'); });
  eq(P.quote(ev, b, { plan: 'field' }).priceOverride, null, 'no negotiation: nothing on the quote');
  console.log('Subscription pricing and version safety: ' + count + ' passed.');
}
main().catch(function (e) { console.error(e); process.exitCode = 1; });
