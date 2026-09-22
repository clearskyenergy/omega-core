/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var test = require('node:test'), assert = require('node:assert/strict');
var D = require('../api/_lib/listing-detail');
/* The Morton Grove Walgreens page as innerText would hand it over: grid cells tab-separated. */
var PAGE = ['Sale Lease Auctions Comps & Records Products AI', 'Subscribe to Intelligence for full access',
  '5730 W Dempster St, Morton Grove, IL 60053 For Sale', 'Notes Print Share Save Report',
  'Unpriced | 1 day on market | Updated 1 day ago', 'Walgreens - Morton Grove, IL', 'Request Info View OM', 'Details',
  'Property Type\tRetail\tSub Type\tPharmacy/Drug', 'Square Footage\t14,440\tAcreage\t0.720', 'Ground Lease\tNo\tNOI\t$375,435',
  'Tenancy\tSingle\tLease Type\tNN', 'Occupancy\t100%\tInvestment Type\tNet Lease', 'Lease Expiration\t07/31/2028\tRemaining Term\t1.9',
  'Lease Options\t6 x 5-years\tYear Built\t2001',
  'Short-Term Walgreens | Highly Fungible Box | Affluent Chicago Suburb', 'Marketing description', 'JLL is pleased to exclusively offer for sale the fee-simple interest in the Walgreens.',
  'Alex Geanakos PRO', 'IL IL: #475.189621', 'View phone number', 'View email', 'JLL', 'Mohsin Mirza PRO', 'IL IL 475.189943', '(312) 555-0142', 'mohsin@jll.example', 'JLL',
  'Listed by JLL - New York City, New York. JLL Chicago | Americas Headquarters'].join('\n');
test('a Crexi listing page: price line, details grid, brokers, firm', function () {
  var d = D.parse(PAGE, '2026-09-22T12:00:00Z');
  assert.equal(d.unpriced, true); assert.equal(d.askPrice, undefined); assert.equal(d.daysOnMarket, 1); assert.equal(d.updated, 'Updated 1 day ago');
  assert.equal(d.headline, 'Walgreens - Morton Grove, IL');
  assert.equal(d.propertyType, 'Retail'); assert.equal(d.subtype, 'Pharmacy/Drug'); assert.equal(d.sqft, 14440); assert.equal(d.lotAcres, 0.72);
  assert.equal(d.groundLease, 'No'); assert.equal(d.noi, 375435); assert.equal(d.tenancy, 'Single'); assert.equal(d.leaseType, 'NN');
  assert.equal(d.occupancy, 100); assert.equal(d.investmentType, 'Net Lease'); assert.equal(d.leaseExpiration, '07/31/2028'); assert.equal(d.remainingTerm, 1.9);
  assert.equal(d.leaseOptions, '6 x 5-years'); assert.equal(d.yearBuilt, 2001);
  assert.equal(d.listedBy, 'JLL');
  assert.deepEqual(d.brokers.map(function (b) { return b.name; }), ['Alex Geanakos', 'Mohsin Mirza']);
  assert.equal(d.brokers[0].firm, 'JLL'); assert.equal(d.brokers[0].phone, undefined, 'a masked phone is not invented');
  assert.equal(d.brokers[1].phone, '(312) 555-0142'); assert.equal(d.brokers[1].email, 'mohsin@jll.example');
  assert.equal(d.ownerName, undefined, 'the owner sits behind the paywall and is not on the page');
  assert.equal(d.src, 'crexi-page'); assert.equal(d.capturedAt, '2026-09-22T12:00:00Z');
});
test('a priced page with the grid on separate lines, colon labels and a cap rate', function () {
  var d = D.parse(['4100 W 42nd Pl, Chicago, IL 60632 For Sale', '$2,450,000 | 12 days on market | Updated 3 days ago', 'Industrial Warehouse', 'Details',
    'Property Type', 'Industrial', 'Square Footage', '52,000', 'Cap Rate', '7.25%', 'Price/SF', '$47.12', 'Zoning: M1-2', 'Year Built', '1978', 'Units', '3', 'Owner: Example Holdings LLC', 'Last Sale Price: $1,200,000', 'Sale Date: 03/14/2019'].join('\n'));
  assert.equal(d.askPrice, 2450000); assert.equal(d.daysOnMarket, 12); assert.equal(d.headline, 'Industrial Warehouse');
  assert.equal(d.sqft, 52000); assert.equal(d.capRate, 7.25); assert.equal(d.pricePerSf, 47.12); assert.equal(d.zoning, 'M1-2'); assert.equal(d.yearBuilt, 1978); assert.equal(d.units, 3);
  assert.equal(d.ownerName, 'Example Holdings LLC'); assert.equal(d.lastSalePrice, 1200000); assert.equal(d.lastSaleDate, '03/14/2019');
});
test('sanitize keeps typed fields only and trims text', function () {
  var s = D.sanitize({ askPrice: 1, sqft: 'x', zoning: 'M', bogus: 'y', brokers: [{ name: 'A', phone: 1, firm: 'F' }, { firm: 'no name' }], unpriced: 1 });
  assert.deepEqual(s, { askPrice: 1, zoning: 'M', unpriced: true, brokers: [{ name: 'A', firm: 'F' }] });
  assert.equal(D.trimText('a   \n\n\n\nb' + 'x'.repeat(5000)).length, D.MAX_TEXT);
  assert.deepEqual(D.parse(''), { capturedAt: null, src: 'crexi-page' });
});
