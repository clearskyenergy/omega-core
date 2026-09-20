#!/usr/bin/env node
/* scripts/test-portal.js — what a buyer may see of their own order
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   The projection is the only thing standing between a customer's order page
   and ClearSky's cost basis, so the first block poisons an order with every
   sensitive field the real document carries and searches the serialised
   output for each one. Everything after that is about telling the truth: a
   milestone that runs ahead of the slowest unit is how a delivery date gets
   promised twice. */
'use strict';
var P = require('../api/_lib/portal.js');

var pass = 0, fail = 0;
function ok(name, cond, got) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (got === undefined ? '' : '  got: ' + JSON.stringify(got))); }
}

console.log('\nbuyer portal projection\n');

/* ── NOTHING SENSITIVE LEAVES ───────────────────────────────────────────── */
var POISONED = {
  id: 'ord_1', orderNo: 'CLEANCELL-20260901-4A9F2', orgName: 'Clean Cell',
  status: 'in_fulfilment', createdAt: '2026-09-01T10:00:00Z',
  orgId: 'cleancell.us',
  /* the three that look safe and are not — see api/_lib/portal.js header */
  fulfilledBy: 'clearsky', source: 'tenant', placedBy: 'rep@csebuilders.com',
  sourceProjectId: 'proj_8812', interest: 'platform', owner: 'ops@cleancell.us',
  updatedAt: '2026-09-19T08:00:00Z',
  /* every commercially sensitive field the real document carries */
  pricing: { total: 310000, unit: 77500 }, cost: 191000, margin: 0.22,
  capexPerKwh: 312.5, capexPerKw: 640,
  tenantPricing: { total: 240000, currency: 'USD' },   /* NOT published */
  fulfilledBy: 'clearsky', fulfilment: { carrier: 'internal', cost: 4200 },
  provenance: { placedBy: 'rep@csebuilders.com', via: 'api/orders create' },
  history: [{ at: '2026-09-01T10:00:00Z', by: 'thomas@csebuilders.com', what: 'priced' }],
  pricedBy: 'thomas@csebuilders.com', internalNotes: 'squeeze the freight',
  items: [{ sku: 'CC-418', name: '418 kWh cabinet', qty: 3, kw: 200, kwh: 418, cost: 63666, margin: .2 }],
  customer: { name: 'Dana Ruiz', company: 'Riverside Cold Chain', email: 'ops@riverside.example',
              phone: '312-555-0110',
              /* the rep's own note, aliased into the customer's field at api/orders.js:258 */
              notes: 'shopping us against Tesla, do not go below 240k',
              address: { line1: '1 Industrial Dr', city: 'Chicago', state: 'IL', zip: '60616' } },
  documents: [
    { kind: 'invoice', name: 'Invoice 4418', url: 'https://x/i', at: '2026-09-02', audience: 'customer' },
    { kind: 'fat', name: 'Internal FAT notes', url: 'https://x/f', at: '2026-09-20', audience: 'internal' },
    { kind: 'supplier', name: 'Cell supplier invoice', url: 'https://x/s', at: '2026-09-03' }
  ],
  system: { kw: 600, kwh: 1250, durationH: 2 }, promisedShipAt: '2026-11-14'
};

var out = P.publicOrder(POISONED, { units: [{ at: 'elec' }], showPrice: true });
var blob = JSON.stringify(out);

['191000', 'margin', '0.22', 'capexPerKwh', 'capexPerKw', '312.5', '640',
 'csebuilders.com', 'provenance', 'history', 'pricedBy', 'internalNotes',
 'squeeze', 'fulfilment', '4200', '310000', '77500', '63666',
 /* established by reading the writers, not assumed */
 'clearsky', 'placedBy', 'sourceProjectId', 'proj_8812', 'interest',
 'in_fulfilment', 'cleancell.us', 'Tesla', '240k'
].forEach(function (needle) {
  ok('the projection never carries ' + needle, blob.indexOf(needle) < 0);
});
ok('  and it is not simply empty', out.items.length === 1 && blob.length > 250);
ok('an UNPUBLISHED tenant price is withheld even when showPrice is on',
   out.price === undefined && blob.indexOf('240000') < 0, out.price);
ok('a line item keeps sku, name, qty, kw, kwh',
   out.items[0].sku === 'CC-418' && out.items[0].qty === 3 && out.items[0].kwh === 418);
ok('  and drops the per-item cost and margin',
   out.items[0].cost === undefined && out.items[0].margin === undefined);
ok('the internal status is not echoed', out.status === undefined);
ok('fulfilledBy is never echoed — it is literally the string clearsky',
   out.fulfilledBy === undefined);
ok('the raw orgId is not echoed; the seller is named instead',
   out.orgId === undefined && out.soldBy === 'Clean Cell');
ok('the customer-facing reference is orderNo', out.orderNo === 'CLEANCELL-20260901-4A9F2');
ok('the raw document id is not echoed', out.id === undefined);
/* THE TRAP: api/orders.js:258 writes notes as (customer.notes || b.note), so a
   rep's own deal commentary lands in the field that reads as the customer's. */
ok('customer.notes is NEVER echoed, because a rep note is aliased into it',
   blob.indexOf('Tesla') < 0 && blob.indexOf('240k') < 0);
ok('  but the rest of their contact details are returned',
   out.contact && out.contact.name === 'Dana Ruiz' && out.contact.company === 'Riverside Cold Chain');
ok('  and their delivery address', out.site && out.site.city === 'Chicago');

/* documents are opt-in, not opt-out */
ok('only customer-facing documents are returned', out.documents.length === 1, out.documents);
ok('  the internal FAT notes are withheld', blob.indexOf('Internal FAT') < 0);
ok('  a document with NO audience is withheld, not assumed public',
   blob.indexOf('Cell supplier invoice') < 0);

/* the tenant's own published price DOES pass */
var pub = JSON.parse(JSON.stringify(POISONED));
pub.tenantPricing.publishedToCustomer = true;
var withPrice = P.publicOrder(pub, { units: [{ at: 'elec' }], showPrice: true });
ok('a PUBLISHED tenant price is returned', withPrice.price && withPrice.price.total === 240000);
ok('  but only when the caller asked for it',
   P.publicOrder(pub, { units: [{ at: 'elec' }] }).price === undefined);
ok('  and ClearSky pricing still never appears',
   JSON.stringify(withPrice).indexOf('310000') < 0);

/* ── the milestone tells the truth ──────────────────────────────────────── */
ok('new is Received', P.milestoneOf({ status: 'new' }).key === 'received');
['confirmed', 'quoted', 'accepted'].forEach(function (s) {
  ok('the commercial state ' + s + ' reads as Confirmed', P.milestoneOf({ status: s }).key === 'confirmed');
});
ok('shipped is Shipped', P.milestoneOf({ status: 'shipped' }).key === 'shipped');
ok('complete is Shipped, not a seventh word', P.milestoneOf({ status: 'complete' }).key === 'shipped');
ok('cancelled is off the ladder, with no index',
   P.milestoneOf({ status: 'cancelled' }).key === 'cancelled' &&
   P.milestoneOf({ status: 'cancelled' }).index === null);
ok('an unknown status falls back to Received rather than throwing',
   P.milestoneOf({ status: 'wat' }).key === 'received');
ok('no status at all is Received', P.milestoneOf({}).key === 'received');

/* THE ONE THAT MATTERS: the slowest unit decides */
var mixed = P.milestoneOf({ status: 'in_fulfilment' },
  [{ at: 'ready' }, { at: 'pack' }, { at: 'elec' }]);
ok('five-sixths packed and one on a bench is still In production', mixed.key === 'production', mixed);
ok('  because promising a ship date on the fastest unit is how it slips twice',
   P.milestoneOf({ status: 'in_fulfilment' }, [{ at: 'ready' }, { at: 'qa' }]).key === 'testing');
ok('every unit packed reads Ready to ship',
   P.milestoneOf({ status: 'in_fulfilment' }, [{ at: 'pack' }, { at: 'ready' }]).key === 'ready');
ok('a unit not yet kitted holds the order at In production',
   P.milestoneOf({ status: 'in_fulfilment' }, [{ at: '' }, { at: 'ready' }]).key === 'production');
ok('in_fulfilment with NO units yet is In production, not a blank',
   P.milestoneOf({ status: 'in_fulfilment' }, []).key === 'production');
ok('an unrecognised station does not silently advance the order',
   P.milestoneOf({ status: 'in_fulfilment' }, [{ at: 'welding' }, { at: 'elec' }]).key === 'production');

/* the floor never overrides a terminal status */
ok('a shipped order stays Shipped whatever the units say',
   P.milestoneOf({ status: 'shipped' }, [{ at: 'kit' }]).key === 'shipped');
ok('a cancelled order stays Cancelled whatever the units say',
   P.milestoneOf({ status: 'cancelled' }, [{ at: 'ready' }]).key === 'cancelled');

/* ── the tenant may rename, but not invent ──────────────────────────────── */
var renamed = P.milestoneOf({ status: 'in_fulfilment' }, [{ at: 'qa' }],
  { testing: { label: 'Quality hold', say: 'Under our 14-point check.' } });
ok('a tenant may rename a milestone', renamed.label === 'Quality hold');
ok('  and its sentence', /14-point/.test(renamed.say));
ok('  but the key is unchanged, so nothing downstream breaks', renamed.key === 'testing');
ok('a string map entry renames the label',
   P.milestoneOf({ status: 'new' }, [], { received: 'Logged' }).label === 'Logged');
ok('a typo in the tenant map is ignored rather than obeyed',
   P.milestoneOf({ status: 'new' }, [], { recieved: 'Logged' }).label === 'Received');

/* ── shape and hygiene ──────────────────────────────────────────────────── */
ok('the ladder is six public words', P.LADDER.length === 6);
ok('every ladder step has a key, a label and a sentence',
   P.LADDER.every(function (s) { return s.key && s.label && s.say; }));
ok('index and of let a progress bar be drawn',
   P.milestoneOf({ status: 'new' }).index === 0 && P.milestoneOf({ status: 'new' }).of === 6);
ok('a cancel request is surfaced as a boolean',
   P.publicOrder({ cancelRequested: true }).cancelRequested === true);
ok('garbage does not throw', (function () {
  try { P.publicOrder(null, null); P.publicOrder({ items: 'x', documents: 5 }, {}); P.milestoneOf(null, null, null); return true; }
  catch (e) { return false; }
})());
ok('a 500-item order is capped rather than echoed whole',
   P.publicOrder({ items: new Array(500).fill({ sku: 'x' }) }, {}).items.length === 100);

console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
