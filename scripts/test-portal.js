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
/* THE TRAP: api/orders.js USED TO write notes as (customer.notes || b.note),
   so a rep's own deal commentary landed in the field that reads as the
   customer's. The write is fixed, but rows created before it still carry the
   alias with nothing to tell them apart — so the exclusion is permanent. */
ok('customer.notes is NEVER echoed, because old rows carry an aliased rep note',
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


/* ── the org parameter is a Firestore PATH, not just a lookup key ────────
   Appended 2026-09-20 after an adversarial pass. admin.js cannot be
   require()d here — it pulls in firebase-admin, which is not a local
   dependency — so safeOrg is extracted from source and exercised directly.
   That is uglier than importing it and it is the only way to cover the
   control at all, which beats leaving it uncovered. */
(function orgShape() {
  var fs = require('fs'), path = require('path');
  var src = fs.readFileSync(path.join(__dirname, '..', 'api', '_lib', 'admin.js'), 'utf8');
  var alias = /var ORG_ALIAS = \{[^}]*\};/.exec(src);
  var body  = /function safeOrg\(v\) \{[\s\S]*?\n\}/.exec(src);
  ok('safeOrg exists in api/_lib/admin.js', !!alias && !!body);
  if (!alias || !body) return;
  var safeOrg = new Function(alias[0] + '\n' + body[0] + '\nreturn safeOrg;')();

  ok('a plain domain passes', safeOrg('cleancell.us') === 'cleancell.us');
  ok('  case and padding are folded', safeOrg('  CleanCell.US ') === 'cleancell.us');
  ok('  a multi-label domain passes', safeOrg('a.b.co.uk') === 'a.b.co.uk');
  ok('  and the alias fold still applies', safeOrg('fenecon.de') === 'fenecon.com');

  /* THE ATTACK. Firestore .doc() takes multi-segment paths, so
     omega_orgs/<org> with a slash in org is a VALID document elsewhere. */
  ok('a slash is refused — it would resolve to another document',
     safeOrg('cleancell.us/customers/someone-else') === '');
  ok('a traversal is refused', safeOrg('../../etc/passwd') === '');
  ok('a backslash is refused', safeOrg('cleancell.us\\customers') === '');
  ok('an empty org is refused', safeOrg('') === '' && safeOrg(null) === '' && safeOrg(undefined) === '');
  ok('a bare label with no dot is refused', safeOrg('cleancell') === '');
  ok('a leading dash is refused', safeOrg('-bad.com') === '');
  ok('a trailing dash is refused', safeOrg('bad-.com') === '');
  ok('an over-long value is refused', safeOrg(new Array(300).join('x') + '.com') === '');
  ok('a wildcard is refused', safeOrg('*') === '' && safeOrg('cleancell.*') === '');
  ok('a space inside is refused', safeOrg('clean cell.us') === '');
  ok('a null byte is refused', safeOrg('cleancell.us\u0000/x') === '');

  /* Every endpoint that takes an org from a caller must use it. */
  ['my-orders.js', 'my-account.js', 'tenant-systems.js'].forEach(function (f) {
    var e = fs.readFileSync(path.join(__dirname, '..', 'api', f), 'utf8');
    ok('api/' + f + ' shape-checks its org parameter', /A\.safeOrg\(/.test(e));
  });
})();

/* ── found by the adversarial pass, 2026-09-20 ──────────────────────────
   Three of these were real and shipped for a few minutes. The dates were
   the worst: createdAt is written with FieldValue.serverTimestamp(), so it
   comes back as a Timestamp OBJECT — String()-ing it gave the customer
   "[object Object]" as their order date, and made every row compare equal
   in the newest-first sort. */
(function adversarial() {
  var TS = function (iso) { return { toDate: function () { return new Date(iso); } }; };

  ok('a Firestore Timestamp becomes an ISO string, not [object Object]',
     P.when(TS('2026-09-01T10:00:00Z')) === '2026-09-01T10:00:00.000Z');
  ok('  the _seconds shape works too (a decoded Timestamp)',
     typeof P.when({ _seconds: 1788000000 }) === 'string');
  ok('  a Date works', P.when(new Date('2026-09-01T10:00:00Z')) === '2026-09-01T10:00:00.000Z');
  ok('  an ISO string passes through', P.when('2026-09-01T10:00:00Z') === '2026-09-01T10:00:00Z');
  ok('  a junk object becomes null rather than "[object Object]"', P.when({}) === null);
  ok('  null stays null', P.when(null) === null && P.when(undefined) === null);
  var dated = P.publicOrder({ createdAt: TS('2026-09-01T10:00:00Z'),
                              promisedShipAt: TS('2026-11-14T00:00:00Z') }, {});
  ok('placedAt is rendered from a Timestamp', dated.placedAt === '2026-09-01T10:00:00.000Z');
  ok('promisedShipAt too', String(dated.promisedShipAt).indexOf('2026-11-14') === 0);
  ok('  and "[object Object]" appears nowhere in the projection',
     JSON.stringify(dated).indexOf('[object') < 0);

  /* A HELD UNIT IS NOT PROGRESSING. Its station alone would report the line
     as moving when the unit is stuck with an NCR against it. */
  ok('a unit held at QA does not report Inspection & test',
     P.milestoneOf({ status: 'in_fulfilment' }, [{ at: 'qa', hold: 'NCR-26-89' }]).key === 'production');
  ok('  the same unit NOT held does report it',
     P.milestoneOf({ status: 'in_fulfilment' }, [{ at: 'qa' }]).key === 'testing');
  ok('a unit held at Ready does not report Ready to ship',
     P.milestoneOf({ status: 'in_fulfilment' }, [{ at: 'ready', hold: 'x' }]).key !== 'ready');
  ok('one held unit holds the whole order back',
     P.milestoneOf({ status: 'in_fulfilment' },
       [{ at: 'ready' }, { at: 'pack' }, { at: 'qa', hold: 'x' }]).key === 'production');
  ok('  and the customer is never told WHY — the NCR is the tenant\u2019s business',
     JSON.stringify(P.publicOrder({ status: 'in_fulfilment' },
       { units: [{ at: 'qa', hold: 'NCR-26-89' }] })).indexOf('NCR') < 0);

  /* The not-yet-kitted branch used to pin worstRank to 0, which made it
     unbeatable — so a unit held further back could never win. */
  ok('a unit held at Kitting outranks one that is merely un-started',
     P.milestoneOf({ status: 'in_fulfilment' },
       [{ at: '' }, { at: 'kit', hold: 'x' }]).key === 'confirmed');
  ok('  an un-started unit alone still reads In production',
     P.milestoneOf({ status: 'in_fulfilment' }, [{ at: '' }]).key === 'production');

  /* The endpoint must narrow in the query, not after the page limit. */
  var fs = require('fs'), path = require('path');
  var mo = fs.readFileSync(path.join(__dirname, '..', 'api', 'my-orders.js'), 'utf8');
  ok('my-orders narrows by orderNo IN THE QUERY, not after the limit',
     /q = q\.where\('orderNo', '==', wanted\)/.test(mo));
  ok('  and orders in the query rather than sorting Timestamps in JS',
     /orderBy\('createdAt', 'desc'\)/.test(mo) && !/String\(b\.createdAt/.test(mo));
  /* The four-field composite that a sorted orderNo lookup would need does
     not exist in firestore.indexes.json, so the lookup must not sort. */
  ok('  and does NOT sort the single-order lookup (no such index)',
     /q = q\.where\('orderNo'[^)]*\);[\s\S]{0,40}\} else \{/.test(mo));
  var idx = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'firestore.indexes.json'), 'utf8'));
  var needed = (idx.indexes || []).some(function (i) {
    if (i.collectionGroup !== 'orders') return false;
    var f = (i.fields || []).map(function (x) { return x.fieldPath; }).join(',');
    return f === 'orgId,customer.email,createdAt';
  });
  ok('  the composite the list query needs is in firestore.indexes.json', needed);

  /* CLAUDE.md: the shared runtime is ES5. globalThis is ES2020. */
  var em = fs.readFileSync(path.join(__dirname, '..', 'omega-editor-mode.js'), 'utf8');
  /* Strip comments first. The previous version of this assertion matched the
     comment that EXPLAINS why globalThis was removed, which is the same trap
     that caught a check on the portal page earlier the same day: a source
     scan that does not strip prose tests the prose. */
  var code = em.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  ok('omega-editor-mode.js uses no globalThis (ES2020) in CODE',
     code.indexOf('globalThis') < 0);
  ok('  and no arrow functions, const or let', !/=>|\bconst\s|\blet\s/.test(code));
  ok('  the comment explaining the removal is still there',
     em.indexOf('globalThis') > 0);
})();

console.log('\n  ' + pass + ' passed, ' + fail + ' failed  (including the org-shape control)\n');
process.exit(fail ? 1 : 0);
