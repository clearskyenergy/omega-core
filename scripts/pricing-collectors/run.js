/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   Weekday pricing collectors. Writes a proposed snapshot and a review
   file. Does not modify accepted.json. */
'use strict';

var path = require('path');
var collectors = [
  require('./bls-oews'),
  require('./bls-ppi'),
  require('./eia-aeo'),
  require('./nrel-atb'),
  require('./lbnl-interconnection'),
  require('./state-dot'),
  require('./utility-unit-cost'),
  require('./lazard-pdf')
];

function arg(name) {
  var i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

function main() {
  var dry = process.argv.indexOf('--dry-run') >= 0;
  var fixture = process.argv.indexOf('--fixture') >= 0;
  var only = arg('--only');
  var list = collectors.filter(function (c) {
    return !only || only.split(',').indexOf(c.ID) >= 0;
  });
  var root = path.join(__dirname, 'fixtures');
  var chain = Promise.resolve([]);
  list.forEach(function (c) {
    chain = chain.then(function (acc) {
      var opts = { dryRun: dry };
      if (fixture) opts.fixture = path.join(root, c.ID + '.txt');
      if (c.ID === 'state-dot' && fixture) opts.fixture = path.join(root, 'state-dot.json');
      if (c.ID === 'bls-ppi' && fixture) opts.fixture = path.join(root, 'bls-ppi.json');
      if (c.ID === 'bls-oews' && fixture) opts.fixture = path.join(root, 'bls-oews.json');
      return c.collect(opts).then(function (result) {
        acc.push(result);
        return acc;
      }).catch(function (err) {
        acc.push({ id: c.ID, ok: false, error: err.message, review: { needsReview: false, flags: [] } });
        return acc;
      });
    });
  });
  return chain.then(function (results) {
    results.forEach(function (r) {
      var flags = (r.review && r.review.flags) || [];
      var state = !r.ok ? 'UNPARSED' : (flags.length ? ('REVIEW ' + flags.length) : 'unchanged');
      if (r.live === false) state = 'fixture ' + state;
      console.log(r.id + '\t' + state + (r.error ? '\t' + r.error : '') + (dry ? '\t(dry-run, nothing written)' : ''));
    });
    console.log(dry ? 'Dry run. accepted.json was not written.' : 'Proposed snapshots are not applied. accepted.json was not written.');
    return results;
  });
}

if (require.main === module) {
  main().catch(function (err) {
    console.error(err && err.stack || err);
    process.exit(1);
  });
}

module.exports = { main: main, collectors: collectors };
