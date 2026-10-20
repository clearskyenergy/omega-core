/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   Pricing collectors, on recorded fixtures. A dry run writes nothing.
   A move past the source threshold is a review flag, not a new price. */
'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var lib = require('../pricing-collectors/lib');
var ppi = require('../pricing-collectors/bls-ppi');
var oews = require('../pricing-collectors/bls-oews');
var eia = require('../pricing-collectors/eia-aeo');
var atb = require('../pricing-collectors/nrel-atb');
var lbnl = require('../pricing-collectors/lbnl-interconnection');
var dot = require('../pricing-collectors/state-dot');
var util = require('../pricing-collectors/utility-unit-cost');
var laz = require('../pricing-collectors/lazard-pdf');
var run = require('../pricing-collectors/run');

var root = path.join(__dirname, '../pricing-collectors/fixtures');
var count = 0;

function read(name) { return fs.readFileSync(path.join(root, name), 'utf8'); }

var ppiParsed = ppi.parseApi(read('bls-ppi.json'));
assert.equal(ppiParsed.ok, true);
assert.equal(ppiParsed.metrics.WPU10260314, 607.705);
assert.equal(ppiParsed.records.filter(function (r) { return r.series === 'WPU10260314'; })[0].period, '2026-09');
assert.notEqual(ppiParsed.metrics.WPU10260314, 602.663);
count += 4;

assert.equal(oews.seriesId('N', '0000000', '47-2111', '03'), 'OEUN000000000000047211103');
assert.equal(oews.seriesId('S', '1700000', '47-2111', '03'), 'OEUS170000000000047211103');
assert.equal(oews.seriesId('M', '0016980', '47-2111', '03'), 'OEUM001698000000047211103');
var wages = oews.parseApi(read('bls-oews.json'));
assert.equal(wages.metrics['0000000.47-2111.03'], 34.37);
assert.equal(wages.metrics['1700000.47-2111.03'], 44.34);
assert.equal(wages.metrics['0016980.47-2111.03'], 45.41);
count += 6;

var table = eia.parseTable(read('eia-aeo.txt'));
assert.equal(table.ok, true);
assert.equal(table.metrics['ct.frame.basePerKw'], 791);
assert.equal(table.metrics['battery.4h.fomPerKwYr'], 40.62);
var empty = eia.parseTable('not a table');
assert.equal(empty.ok, false);
assert.equal(empty.records.length, 0);
count += 5;

var csv = atb.parseCsv(read('nrel-atb.txt'));
assert.equal(csv.ok, true);
assert.equal(csv.metrics['utility-60mw.$/kW'], 1372);
assert.equal(csv.metrics['utility-60mw.$/kWh'], 343);
assert.equal(csv.metrics['commercial-1800kw.$/kW'], 1612);
assert.equal(csv.metrics['commercial-1800kw.$/kWh'], 403);
assert.ok(csv.note.indexOf('not a column') >= 0);
count += 6;

var briefs = lbnl.parseText(read('lbnl-interconnection.txt'));
assert.equal(briefs.ok, true);
assert.equal(briefs.metrics.spp, 57);
assert.equal(briefs.metrics.pjm, 84);
assert.equal(briefs.metrics.miso, 102);
assert.equal(briefs.records.length, 3);
count += 5;

var bids = dot.parseRows(JSON.parse(read('state-dot.json')));
assert.equal(bids.ok, true);
assert.equal(bids.metrics['618-7030'], 17.5);
assert.equal(bids.records.filter(function (r) { return r.code === '618-7030'; })[0].n, 2);
assert.equal(bids.metrics['618-7040'], undefined);
count += 4;

var guide = util.parseText(read('utility-unit-cost.txt'));
assert.equal(guide.ok, true);
assert.equal(guide.metrics['pge.xfmr.150'], 53985);
assert.equal(guide.metrics['pge.switch.pme5'], 93417);
assert.equal(guide.metrics['pge.ug.sf'], 880);
assert.equal(guide.metrics['comed.ug.12kv'], 275);
var skipped = util.reviewMetrics(
  { records: [{ id: 'pge.xfmr.150', usd: 53985 }, { id: 'comed.ug.12kv', usd: 275 }] },
  { 'pge.xfmr.150': 53985 },
  { pge: true, comed: false }
);
assert.equal(Object.prototype.hasOwnProperty.call(skipped, 'comed.ug.12kv'), false);
assert.equal(skipped['pge.xfmr.150'], 53985);
count += 7;

var capex = laz.parseText(read('lazard.txt'));
assert.equal(capex.ok, true);
assert.equal(capex.metrics['18.0.pv.utility.low'], 1150);
assert.equal(capex.metrics['18.0.pv.utility.high'], 1600);
assert.equal(capex.metrics['18.0.storage.utility.4h.dc.low'], 107);
assert.equal(capex.metrics['18.0.storage.hybrid.inverter.low'], 19);
assert.equal(capex.metrics['17.0.pv.utility.low'], 850);
assert.equal(capex.metrics['17.0.pv.residential.low'], 2300);
assert.equal(capex.metrics['17.0.storage.utility.4h.dc.low'], 160);
assert.equal(JSON.stringify(capex.metrics).indexOf('153'), -1);
count += 9;

var moved = lib.review({ a: 100 }, { a: 110 }, 0.05);
assert.equal(moved.needsReview, true);
assert.equal(moved.flags[0].kind, 'moved');
var quiet = lib.review({ a: 100 }, { a: 101 }, 0.05);
assert.equal(quiet.needsReview, false);
assert.equal(quiet.flags.length, 0);
var dropped = lib.review({ a: 1, b: 2 }, { a: 1 }, 0.05);
assert.equal(dropped.flags[0].kind, 'dropped');
assert.equal(lib.escalate(100, 200, 220), 110);
assert.equal(lib.escalate(null, 200, 220), null);
assert.equal(lib.escalate(100, 0, 220), null);
assert.equal(lib.pathDisallowed('User-agent: *\nDisallow: /\nAllow: /publicAPI/\n', '/publicAPI/v2/timeseries/data/'), false);
assert.equal(lib.pathDisallowed('User-agent: *\nDisallow: /\n', '/anything'), true);
count += 8;

var acceptedDot = fs.readFileSync(lib.acceptedPath('state-dot'));
var proposedDir = path.join(lib.SNAP_ROOT, 'state-dot', 'proposed');
var hadProposed = fs.existsSync(proposedDir);

var argv = process.argv;
process.argv = ['node', 'run.js', '--fixture', '--dry-run'];
run.main().then(function (results) {
  process.argv = argv;
  var byId = {};
  results.forEach(function (r) { byId[r.id] = r; });
  assert.equal(byId['state-dot'].review.needsReview, true);
  assert.equal(byId['state-dot'].written.wrote, false);
  assert.ok(byId['state-dot'].review.flags.some(function (f) { return f.key === '618-7030' && f.kind === 'moved'; }));
  assert.ok(byId['state-dot'].review.flags.some(function (f) { return f.key === '618-7040' && f.kind === 'dropped'; }));
  assert.ok(!byId['state-dot'].review.flags.some(function (f) { return f.key === '618-7036'; }));
  assert.equal(byId['bls-ppi'].review.needsReview, false);
  assert.equal(byId['lazard'].ok, true);
  assert.equal(fs.existsSync(proposedDir), hadProposed);
  assert.equal(fs.readFileSync(lib.acceptedPath('state-dot')).equals(acceptedDot), true);
  count += 8;

  var ppiAccepted = fs.readFileSync(lib.acceptedPath('bls-ppi'));
  process.argv = argv;
  return ppi.collect({ fixture: path.join(root, 'bls-ppi.json'), dryRun: false, read: '2099-01-01' }).then(function (written) {
    assert.equal(written.written.wrote, true);
    assert.equal(written.written.acceptedUntouched, true);
    assert.equal(written.review.needsReview, false);
    assert.equal(fs.readFileSync(lib.acceptedPath('bls-ppi')).equals(ppiAccepted), true);
    var proposed = path.join(lib.SNAP_ROOT, 'bls-ppi', 'proposed', '2099-01-01.json');
    var review = path.join(lib.SNAP_ROOT, 'bls-ppi', 'review.json');
    assert.equal(fs.existsSync(proposed), true);
    fs.unlinkSync(proposed);
    fs.unlinkSync(review);
    try { fs.rmdirSync(path.join(lib.SNAP_ROOT, 'bls-ppi', 'proposed')); } catch (e) { /* kept if other files */ }
    assert.equal(fs.existsSync(proposed), false);
    count += 6;
    console.log('tpricingcollect: ' + count + ' assertions passed');
  });
}).catch(function (err) {
  console.error(err && err.stack || err);
  process.exit(1);
});
