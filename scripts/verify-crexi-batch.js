/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Verify append-only browser captures; never writes to the live database.
 * node scripts/verify-crexi-batch.js <capture-directory> <expected-count>
 */
'use strict';
var fs = require('fs'), path = require('path');
var dir = path.resolve(process.argv[2] || '');
var expected = Number(process.argv[3]);
if (!Number.isInteger(expected) || expected < 1) throw new Error('Expected count required');
var pages = {}, listings = {}, duplicateIds = [], captures = [];
fs.readdirSync(dir).filter(function (f) { return /^\d+-[a-f0-9]+\.json$/.test(f); }).sort().forEach(function (file) {
  var batch = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  var capturedAt = new Date(Number(file.split('-')[0])).toISOString();
  if (batch.orgId !== 'chileasing.com') throw new Error('Wrong destination in ' + file);
  batch.pages.forEach(function (page) {
    if (pages[page.page]) throw new Error('Duplicate page ' + page.page);
    pages[page.page] = page.rows.length;
    page.rows.forEach(function (row) {
      var match = /^\/properties\/(\d+)\//.exec(row.url);
      if (!match || !row.address) throw new Error('Invalid listing');
      var id = match[1];
      if (listings[id]) { duplicateIds.push(id); return; }
      listings[id] = {
        source: 'crexi', listingId: id, address: row.address,
        listingUrl: 'https://www.crexi.com' + row.url,
        sourceText: row.text, observedAt: capturedAt,
        sourcePage: page.page,
        owner: null, feeder: null, hostingCapacityKw: null,
        energyScore: null, latitude: null, longitude: null
      };
    });
  });
  captures.push(file);
});
var missingPages = [], expectedPages = Math.ceil(expected / 60);
for (var i = 1; i <= expectedPages; i++) if (!pages[i]) missingPages.push(i);
var count = Object.keys(listings).length;
var report = {
  orgId: 'chileasing.com', scope: 'Crexi Cook County Illinois for-sale search',
  verifiedAt: new Date().toISOString(), expectedSearchCount: expected,
  uniqueListings: count, pages: pages, missingPages: missingPages,
  duplicateIds: duplicateIds, sourceFiles: captures,
  collectionComplete: count === expected && !missingPages.length && !duplicateIds.length,
  liveImportComplete: false,
  limitations: ['Search-card data only; listing-detail and owner records not collected.',
    'No geocoding, circuit association, load estimate, or energy scoring performed.',
    'No live tenant data or starred-site records changed.']
};
var target = path.join(dir, 'verified-' + Date.now() + '.json');
fs.writeFileSync(target, JSON.stringify({manifest: report, listings: Object.keys(listings).map(function (id) { return listings[id]; })}, null, 2), {flag:'wx',mode:384});
console.log(JSON.stringify({file:target, uniqueListings:count, missingPages:missingPages, duplicates:duplicateIds.length, collectionComplete:report.collectionComplete, liveImportComplete:false},null,2));
