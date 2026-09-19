#!/usr/bin/env node
/* The product importer, run as the CLI it is.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   One spreadsheet decides what a stranger can order, what their yard study
   looks like, and what the editor lays out. Four ways that goes wrong quietly:

   1 · DIMENSIONS IN MILLIMETRES. Every container datasheet in this industry
       prints mm — Gotion's is 6058 x 2438. Pasted into a feet column that is
       a 6,058 ft battery, and the site study would report that nothing fits
       on a three-acre lot while looking completely confident about it.

   2 · BLANK INTEGRATION FLAGS READ AS "NO". getWizSteps() skips the PCS,
       disconnect and transformer steps when the cabinet contains them. Blank
       means nobody answered, not "external" — and treating the two the same
       draws an external PCS on an all-in-one cabinet.

   3 · A COST BASIS IN THE SPREADSHEET. A supplier's own sheet is exactly
       where capexPerKwh turns up, and it must never reach a file that gets
       committed or emailed on.

   4 · A DUPLICATE SKU, which silently overwrites downstream.

   node scripts/test-import-products.js */
'use strict';
var fs = require('fs'), os = require('os'), path = require('path');
var cp = require('child_process');
var ROOT = path.join(__dirname, '..');
var SCRIPT = path.join(ROOT, 'scripts', 'import-products.js');

var pass = 0, fail = 0;
function ok(name, cond, got) {
  if (cond) { pass++; return; }
  fail++; console.error('  FAIL ' + name + (got !== undefined ? '  got: ' + JSON.stringify(got) : ''));
}

var TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'omega-import-'));
function run(csv, extra) {
  var f = path.join(TMP, 'p' + Math.random().toString(36).slice(2) + '.csv');
  fs.writeFileSync(f, csv);
  var r = cp.spawnSync(process.execPath, [SCRIPT, '--org', 'test.com', '--file', f].concat(extra || []),
    { encoding: 'utf8' });
  return { out: (r.stdout || '') + (r.stderr || ''), code: r.status };
}
var HEAD = 'sku,name,kw,kwh,widthFt,depthFt,dimUnits,integratesPcs,integratesXfmr,integratesDisco,priceMode,listPrice\n';

/* ── 1 · Units ─────────────────────────────────────────────────────────
   A 20 ft ISO container is 6058 x 2438 mm = 19.88 x 8.00 ft. The importer
   must land on that, because the site study draws it to scale. */
(function units() {
  var r = run(HEAD + 'C,Container,500,2000,6058,2438,mm,yes,yes,yes,quote,\n');
  ok('millimetres convert', /"widthFt": 19\.88/.test(r.out), (/"widthFt":[^,]*/.exec(r.out) || [])[0]);
  ok('and the short side lands on 8 ft', /"depthFt": 8/.test(r.out), (/"depthFt":[^,]*/.exec(r.out) || [])[0]);

  r = run(HEAD + 'C,Container,500,2000,238.5,96,in,yes,yes,yes,quote,\n');
  ok('inches convert', /"widthFt": 19\.88/.test(r.out), (/"widthFt":[^,]*/.exec(r.out) || [])[0]);

  r = run(HEAD + 'C,Container,500,2000,6.058,2.438,m,yes,yes,yes,quote,\n');
  ok('metres convert', /"widthFt": 19\.88/.test(r.out), (/"widthFt":[^,]*/.exec(r.out) || [])[0]);

  r = run(HEAD + 'C,Cabinet,100,215,8,4,ft,yes,no,yes,quote,\n');
  ok('feet pass through', /"widthFt": 8/.test(r.out));

  /* THE ONE THAT MATTERS. */
  r = run(HEAD + 'C,Container,500,2000,6058,2438,ft,yes,yes,yes,quote,\n');
  ok('mm pasted into a feet column is REFUSED, not drawn',
     /not a battery/.test(r.out) && /6058 x 2438 ft/.test(r.out), r.out.slice(0, 200));
  ok('and that row does not import', /0  orderable|not imported|PROBLEMS/.test(r.out));

  r = run(HEAD + 'C,Container,500,2000,20,8,cubits,yes,yes,yes,quote,\n');
  ok('an unknown unit is refused by name', /is not one of ft, in, mm, m, cm/.test(r.out));
})();

/* ── 2 · Blank is not false ────────────────────────────────────────────── */
(function integrates() {
  var r = run(HEAD + 'C,Cabinet,100,215,8,4,ft,,,,quote,\n');
  ok('blank integration flags are REPORTED, not silently taken as external',
     /no integration flags/.test(r.out), r.out.slice(0, 300));
  ok('and the count says so', /will draw an external PCS/.test(r.out));
  ok('but the product still imports', /1  orderable/.test(r.out));
  ok('and stores all three as false, which is what "unanswered" must mean downstream',
     /"pcs": false/.test(r.out) && /"xfmr": false/.test(r.out) && /"disco": false/.test(r.out));

  r = run(HEAD + 'C,Cabinet,100,215,8,4,ft,yes,no,yes,quote,\n');
  ok('an answered row is not warned about', !/no integration flags/.test(r.out));
  ok('yes maps true', /"pcs": true/.test(r.out));
  ok('no maps false', /"xfmr": false/.test(r.out));

  /* The spellings a real person types. */
  ['y', 'YES', 'true', '1', 'x', 'integrated', 'internal'].forEach(function (w) {
    var rr = run(HEAD + 'C,Cabinet,100,215,8,4,ft,' + w + ',no,no,quote,\n');
    ok('"' + w + '" counts as integrated', /"pcs": true/.test(rr.out));
  });
  ['n', 'NO', 'false', '0', 'external'].forEach(function (w) {
    var rr = run(HEAD + 'C,Cabinet,100,215,8,4,ft,' + w + ',no,no,quote,\n');
    ok('"' + w + '" counts as external', /"pcs": false/.test(rr.out));
  });
})();

/* ── 3 · The cost basis never gets in ──────────────────────────────────── */
(function money() {
  var r = run('sku,name,kw,kwh,capexPerKwh\nA,B,10,20,380\n');
  ok('a capexPerKwh column is a hard stop', /COST BASIS column/.test(r.out), r.out.slice(0, 120));
  ok('and nothing is imported', !/orderable/.test(r.out));

  ['capexPerKw', 'cost', 'costPerKwh', 'buyPrice', 'margin'].forEach(function (c) {
    var rr = run('sku,name,kw,kwh,' + c + '\nA,B,10,20,1\n');
    ok('"' + c + '" is refused too', /COST BASIS column/.test(rr.out));
  });

  /* listPrice is different — a number the tenant chose to print in public. */
  r = run(HEAD + 'C,Cabinet,100,215,8,4,ft,yes,no,yes,list,64000\n');
  ok('listPrice is allowed', !/COST BASIS/.test(r.out));
  ok('and publishes when priceMode is list', /"listPrice": 64000/.test(r.out));
  ok('and is counted', /1  showing a public list price/.test(r.out));

  r = run(HEAD + 'C,Cabinet,100,215,8,4,ft,yes,no,yes,list,\n');
  ok('priceMode list with no price is downgraded rather than shown as $0',
     /"priceMode": "quote"/.test(r.out) && /price on request/.test(r.out), r.out.slice(0, 400));

  r = run(HEAD + 'C,Cabinet,100,215,8,4,ft,yes,no,yes,quote,64000\n');
  ok('a price on a quote-mode row is NOT published',
     !/"listPrice"/.test(r.out), (/"listPrice":[^,]*/.exec(r.out) || [])[0]);
})();

/* ── 4 · Rows that cannot be a product ─────────────────────────────────── */
(function refusals() {
  var r = run(HEAD + ',No sku,100,215,8,4,ft,yes,no,yes,quote,\n');
  ok('a row with no sku is refused', /no sku/.test(r.out));

  r = run(HEAD + 'C,No energy,,,8,4,ft,yes,no,yes,quote,\n');
  ok('a row with neither kW nor kWh is refused', /needs a kW or a kWh/.test(r.out));

  r = run(HEAD + 'C,One,100,215,8,4,ft,yes,no,yes,quote,\nC,Two,200,400,8,4,ft,yes,no,yes,quote,\n');
  ok('a duplicate sku is flagged', /duplicate sku: C/.test(r.out));

  r = run(HEAD + 'A,Only kW,100,,8,4,ft,yes,no,yes,quote,\n');
  ok('kW alone is enough to be orderable', /1  orderable/.test(r.out));

  r = run(HEAD + 'A,No footprint,100,215,,,ft,yes,no,yes,quote,\n');
  ok('a product with no footprint still imports', /1  orderable/.test(r.out));
  ok('but is counted as undrawable', /0  drawable/.test(r.out));
  ok('and the operator is told what that costs',
     /NOT ONE PRODUCT HAS A FOOTPRINT/.test(r.out), r.out.slice(-400));
})();

/* ── 5 · It does not write unless told to ──────────────────────────────── */
(function dryRun() {
  var r = run(HEAD + 'C,Cabinet,100,215,8,4,ft,yes,no,yes,quote,\n');
  ok('the default is a dry run', /DRY RUN — nothing written/.test(r.out));
  ok('and it exits clean when every row is good', r.code === 0, r.code);

  r = run(HEAD + ',No sku,100,215,8,4,ft,yes,no,yes,quote,\n');
  ok('a dry run with problems exits non-zero', r.code !== 0, r.code);
})();

/* ── 6 · The template we hand to a manufacturer actually works ─────────── */
(function template() {
  var f = path.join(ROOT, 'docs', 'product-list-template.csv');
  ok('the template exists', fs.existsSync(f));
  var r = cp.spawnSync(process.execPath, [SCRIPT, '--org', 'test.com', '--file', f], { encoding: 'utf8' });
  var out = (r.stdout || '') + (r.stderr || '');
  ok('the template imports cleanly', r.status === 0, out.slice(-300));
  ok('both example rows are drawable', /2  drawable/.test(out), out.slice(0, 400));
  ok('and both state an integration answer', /2  with a stated integration answer/.test(out));
  ok('the template demonstrates the mm case, which is the one people get wrong',
     fs.readFileSync(f, 'utf8').indexOf(',mm,') > 0);
})();

try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
console.log('\nproduct import: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
