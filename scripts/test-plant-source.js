/* The work-order card reads the purchase order live. These pin what crosses
   and what stays on the order.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var S = require('../api/_lib/plant-source');
var pass = 0, fail = 0;
function ok(label, yes, detail) { console.log('  ' + (yes ? 'PASS' : 'FAIL') + '  ' + label + (detail !== undefined ? '  ' + JSON.stringify(detail) : '')); if (yes) pass++; else fail++; }

console.log('\nplant source');
ok('no order is null', S.sourceOf(null) === null && S.sourceOf(undefined) === null);

var empty = S.sourceOf({});
ok('an empty order keeps the shape and invents nothing', empty && empty.poNumber === null && empty.projectId === null && empty.address === null && empty.items.length === 0 && empty.sites.length === 0);

var full = S.sourceOf({
  sourceProjectId: 'prj_example_site', projectId: 'other-project',
  purchaseOrder: { number: 'PO-EXAMPLE-1' }, poIntake: { number: 'INTAKE-9' }, poNumber: 'LEGACY',
  customer: { email: 'buyer@example.invalid', address: { name: 'Billing', line1: '9 Billing Rd', city: 'Naperville', state: 'IL', zip: '60540' } },
  items: [
    { sku: 'EXAMPLE-CAB', name: 'Example battery cabinet', qty: 2, listPrice: 639000 },
    { sku: '__proto__', name: 'nope', qty: 1 },
    { sku: 'ZERO', name: 'dropped', qty: 0 },
    { sku: 'EXAMPLE-MOD', name: 'Module pack', qty: 4 }
  ],
  delivery: { destinations: [{ id: 'a', address: { name: 'Example site A', line1: '1 Example St', city: 'Chicago', state: 'IL', zip: '60601' }, items: [{ sku: 'EXAMPLE-CAB', name: 'Example battery cabinet', qty: 2, listPrice: 1 }] }] },
  logic: { commercial: { totalCents: 127800000 } }, notes: 'secret note'
});
var dumped = JSON.stringify(full);
ok('prices, email and notes do not cross', dumped.indexOf('639000') < 0 && dumped.indexOf('127800000') < 0 && dumped.indexOf('listPrice') < 0 && dumped.indexOf('buyer@') < 0 && dumped.indexOf('secret') < 0, dumped);
ok('the project id on the order wins, intact', full.projectId === 'prj_example_site');
ok('the purchase-order number wins over intake and a legacy field', full.poNumber === 'PO-EXAMPLE-1');
ok('named lines are kept and a zero qty or a bad sku is dropped', full.items.length === 2 && full.items[0].sku === 'EXAMPLE-CAB' && full.items[0].name === 'Example battery cabinet' && full.items[0].qty === 2 && full.items[1].sku === 'EXAMPLE-MOD');
ok('a destination address wins over the billing address', full.address && full.address.name === 'Example site A' && full.address.line1 === '1 Example St' && full.address.city === 'Chicago' && full.address.state === 'IL' && full.address.zip === '60601');
ok('the site keeps its own lines', full.sites.length === 1 && full.sites[0].id === 'a' && full.sites[0].lines[0].qty === 2 && full.sites[0].lines[0].name === 'Example battery cabinet');

var billing = S.sourceOf({ poIntake: { number: 'INTAKE-9' }, projectId: 'prj_fallback', customer: { address: { street: '4 Customer Way', city: 'Joliet', state: 'IL', postal: '60431' } }, items: [{ sku: 'EXAMPLE-CAB', name: 'Kept name', qty: 1 }] });
ok('intake number and projectId are used when the purchase order has neither', billing.poNumber === 'INTAKE-9' && billing.projectId === 'prj_fallback');
ok('the customer address is the ship-to when there is no destination', billing.address.line1 === '4 Customer Way' && billing.address.city === 'Joliet' && billing.address.zip === '60431' && billing.sites.length === 0);
ok('the line name is kept intact', billing.items[0].name === 'Kept name');

var named = S.sourceOf({
  delivery: { destinations: [
    { id: 'a', address: { name: 'Site A', line1: '1 A St', city: 'Chicago', state: 'IL' }, items: [{ sku: 'CAB', qty: 1 }] },
    { id: 'b', address: { name: 'Site B', line1: '2 B St', city: 'Aurora', state: 'IL' }, items: [{ sku: 'CAB', qty: 3 }, { sku: 'MOD', name: 'Module', qty: 1 }] }
  ] },
  items: [{ sku: 'CAB', name: 'Cabinet', qty: 4 }]
});
ok('each destination is kept with its own lines', named.sites.length === 2 && named.sites[1].address.name === 'Site B' && named.sites[1].lines.length === 2 && named.address.name === 'Site A');

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
