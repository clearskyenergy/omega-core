/* A stated solar ratio is the size. "1.3 MW of solar per MW of compute" is
   a design decision: the ground layout stops at the table that reaches the
   DC target, the engine's solar plan takes the ratio as the want rather
   than the economics, and the dialog carries the choice. */
const fs = require('fs');
const path = require('path');
let fails = 0;
function ok(c, m) { if (!c) { fails++; console.log('  FAIL ' + m); } else console.log('  ok   ' + m); }
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'editor.html'), 'utf8');

/* Slice a top-level function or var by name, brace-matched. */
function slice(startRe) {
  const m = startRe.exec(src); if (!m) throw new Error('not found: ' + startRe);
  let i = src.indexOf('{', m.index), depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (!depth) return src.slice(m.index, j + 1); }
  }
  throw new Error('unbalanced: ' + startRe);
}
const code = [
  'var GM_ROW_DRAW_CAP = 1200; var DER_PV_WPSF = 20;',
  slice(/var GM_TABLE = \{/), ';',
  slice(/function _gmTable\(presetKey\)/),
  slice(/function _gmPointInPoly\(x, y, poly\)/),
  slice(/function _gmBBox\(poly\)/),
  slice(/function _gmRectPlaceable\(cx, cy, halfW, halfH, boundary, setbackPx, exclusions\)/),
  slice(/function computeGroundLayout\(opts\)/),
  'module.exports = { computeGroundLayout: computeGroundLayout };'
].join('\n');
const m = { exports: {} };
new Function('module', 'exports', code)(m, m.exports);
const lay = m.exports.computeGroundLayout;

const P = 6;
const box = [{ x: 0, y: 0 }, { x: 1500 * P, y: 0 }, { x: 1500 * P, y: 1200 * P }, { x: 0, y: 1200 * P }];
global._derScale = () => P;
const full = lay({ boundary: box });
ok(full && full.kw > 3000, 'a 41-acre box takes several MW of tables uncapped (' + (full && full.kw) + ' kW-DC)');
ok(full.targetKwDc === 0 && !full.targetHit, 'no target means no target');

const capped = lay({ boundary: box, maxKwDc: 1300 });
ok(capped.targetHit === true, 'a 1.3 MW-DC target stops the walk');
const perTable = full.kw / full.tableCount;
ok(Math.abs(capped.kw - 1300) <= perTable * 1.01, 'and lands within one table of it (' + capped.kw + ' kW-DC)');
ok(capped.tableCount < full.tableCount, 'fewer tables than the fill');
const rows = {};
capped.tables.forEach(t => { rows[Math.round(t.y)] = 1; });
ok(Object.keys(rows).length < full.rowCount, 'the block fills rows from one edge, leaving the rest open');

const over = lay({ boundary: box, maxKwDc: 1e9 });
ok(!over.targetHit && over.kw === full.kw, 'a target larger than the land is land-bound, not an error');

/* The engine and the dialog. */
const plan = src.slice(src.lastIndexOf('function solarPlan(ev, input, cfg)'));
ok(/var ratio = \(\+input\.solarRatio > 0\) \? \+input\.solarRatio : 0;/.test(plan), 'the live solar plan reads input.solarRatio');
ok(/wantAc = ratio \* s\.itMw \* 1000;/.test(plan), 'ratio × IT MW is the want, in kW-AC');
ok(/targetKwDc: ratio \? kwDc : 0/.test(plan), 'and the plan hands the drawing a DC target');
ok(/maxKwDc: plan\.solar\.targetKwDc \|\| 0/.test(src), 'the first field is drawn to that target');
ok(/var left = target \? Math\.max\(0, target - \(plan\.solar\.drawnKw \|\| 0\)\) : 0;/.test(src), 'later fields take only what is left');
ok(/solarRatio: \(der\.solarMode === 'ratio' && \+der\.solarRatio > 0\) \? \+der\.solarRatio : null/.test(src), 'the adapter passes the dialog choice');
ok(/id="od-solarmode"/.test(src) && /id="od-solarratio"/.test(src), 'the dialog has the mode and the ratio');
ok(/DER\.solarMode = \(sm && sm\.value === 'ratio'\) \? 'ratio' : 'fill';/.test(src), 'and remembers them');

if (fails) { console.log('tsolarratio: ' + fails + ' failed'); process.exit(1); }
console.log('tsolarratio: all passed');
