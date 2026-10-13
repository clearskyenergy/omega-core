/* scripts/tests/tportfolio-economics-real.js — T26 parity on the PRIVATE
   EVCS model workbook and the IQGEN set as an alternate option. Prints
   aggregates only. Skips (exit 0) when the files are not supplied.
   EVCS_WB2_PATH=… [IQGEN_PATH=…] node scripts/tests/tportfolio-economics-real.js
   © 2025–2026 ClearSky Energy Solutions LLC. */
'use strict';
var fs = require('fs'), assert = require('assert');
var X = require('../../api/_lib/portfolio/xlsx'), EM = require('../../api/_lib/portfolio/evcs-model'), E = require('../../api/_lib/portfolio/economics'), Q = require('../../api/_lib/portfolio/iqgen');
var WB2 = process.env.EVCS_WB2_PATH, IQ = process.env.IQGEN_PATH, pass = 0, fail = 0;
function t(n, f) { try { f(); pass++; console.log('PASS ' + n); } catch (e) { fail++; console.log('FAIL ' + n + ': ' + e.message); } }
if (!WB2 || !fs.existsSync(WB2)) { console.log('SKIP: EVCS_WB2_PATH not supplied'); process.exit(0); }
var b = fs.readFileSync(WB2), g = {}; EM.SHEETS.forEach(function (n) { g[n] = X.sheetGrid(b, { sheet: n }); });
var base = E.fromAssumptions(EM.parse(g, {}).assumptions), r = E.legacyPod(base);
t('T26 project IRR ≈ 0.005407871 (1e-7)', function () { assert.equal(r.status, 'ok'); assert(Math.abs(r.projectIrr.annualized - 0.005407871) < 1e-7, r.projectIrr.annualized); });
t('T26 investor IRR ≈ 0.004339862 (1e-7)', function () { assert(Math.abs(r.investorIrr.annualized - 0.004339862) < 1e-7, r.investorIrr.annualized); });
t('T26 59 operating-month payback; $2,111,375 capital per pod', function () { assert.equal(r.paybackMonths, 59); assert(Math.abs(r.capital - 2111375) < 0.01); });
if (IQ && fs.existsSync(IQ)) {
  var qb = fs.readFileSync(IQ), info = X.inspect(qb); X.assertSafe(info);
  var gs = {}; Q.SHEETS.forEach(function (n) { gs[n] = X.sheetGrid(qb, { sheet: n }); }); var set = Q.parse(gs, {});
  t('IQGEN recognised and parsed as a separate hardware set', function () { assert(Q.detect(info.sheets.map(function (s) { return s.name; }))); assert.equal(set.kind, 'iqgen-hardware-v1'); assert(set.chipsets.length > 0); });
  t('IQGEN scenario runs on the same engine; WB2 legacy parity unchanged', function () { var before = JSON.stringify(base); var q = E.iqgenPod(set, set.selectedChipset, base); assert.equal(q.status, 'ok'); assert.equal(JSON.stringify(base), before); assert.equal(E.legacyPod(base).projectIrr.annualized, r.projectIrr.annualized); });
  console.log('aggregate: IQGEN chipsets ' + set.chipsets.length + ', formula-error cells excluded ' + set.formulaErrors.length + ', caveats ' + set.caveats.length);
}
console.log('portfolio economics (real workbooks): ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
