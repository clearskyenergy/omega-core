/* ZTMM container data centre — the catalogue rows and the block planner.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Evaluates the DC_CATALOG / ZTMM_BLOCKS / ztmmPlan slice straight out of
   editor.html (no build step, so extraction is the only route in) and checks
   that the numbers on the rows are the numbers on the vendor's sheets, and
   that the planner picks the vendor's block rather than multiplying the small
   one.

     node scripts/tests/tztmm.js
*/
const fs = require('fs'), path = require('path'), vm = require('vm');
const s = fs.readFileSync(path.join(__dirname, '..', '..', 'editor.html'), 'utf8');

let fails = 0;
function ok(c, m) { if (!c) { fails++; console.log('  FAIL ' + m); } else console.log('  ok   ' + m); }

const i0 = s.indexOf('var DC_CATALOG = {');
const i1 = s.indexOf('/* END ZTMM PLANNER */', i0);
ok(i0 > 0 && i1 > i0, 'the catalogue and the planner are in the file, in that order');
const ctx = {};
vm.runInNewContext(s.slice(i0, i1) + '\nthis.DC_CATALOG=DC_CATALOG;this.ZTMM_BLOCKS=ZTMM_BLOCKS;this.ztmmPlan=ztmmPlan;', ctx);
const { DC_CATALOG: C, ZTMM_BLOCKS: B, ztmmPlan } = ctx;

console.log('catalogue rows — Layout-01, 2026-09-18');
const u = C.dc_ztmm1;
ok(u && u.kw === 920, '6 x 150 kW racks + 20 kW network = 920 kW IT, not the 1 MW envelope');
ok(u.lf === 40 && u.wf === 25, 'two 40 ft x 12\'-6" containers side by side = 40 x 25 ft');
ok(u.cooling === 'external-chiller' && u.water === 0, 'chillers are off-pad, and the plant is non-evaporative');
ok(u.coolKw === 1200 && u.upsKva === 1625, '1200 kW chiller unit; 1125 + 500 kVA UPS');
ok(/Layout-01/.test(u.verified), 'the row cites the drawing');
ok(C.dc_ztmm1b && C.dc_ztmm1b.kw === 1070 && C.dc_ztmm1b.racks === 7, 'Option B: seven racks, 1.07 MW IT');
ok(/not resized|resize/i.test(C.dc_ztmm1b.spec), 'and says the plant is not resized on the drawing');
ok(C.dc_mdc1 && C.dc_mdc1.verified === null, 'the nominal 1 MW row is still marked nominal');

console.log('reference blocks');
ok(B.length === 3 && B.map(b => b.mw).join() === '1,3,5', '1 / 3 / 5 MW, in order');
ok(B[1].itKw === 3080 && B[1].racks === 20 && B[1].containers === 4 && B[1].wf === 50,
   '3 MW: 20 racks + 4 network = 3,080 kW in four containers on 40 x 50');
ok(B[1].chillers.n === 4 && B[1].chillers.main === 3 && B[1].chillers.kw === 1200, '3 MW: 4 x 1200 kW chillers, 3 main / 1 spare');
ok(B[2].itKw === 5350 && B[2].racks === 35 && B[2].containers === 7 && B[2].wf === 87.5,
   '5 MW: 35 racks + 5 network = 5,350 kW in seven containers on 40 x 87.5');
ok(B[2].chillers.kw === 2000 && B[2].ups[0].kva === 1250 && B[2].ups[0].n === 5, '5 MW: 2000 kW chillers, 5 x 1250 kVA UPS as labelled');
B.forEach(b => ok(b.stack.length === b.containers
                  && b.stack.filter(x => x === 'IT').length === b.itPods
                  && b.stack.filter(x => x === 'ELE').length === b.elePods,
                  b.mw + ' MW: the drawn stack matches the POD counts'));

console.log('the planner');
let p = ztmmPlan(920, u);
ok(p.blocks.length === 1 && p.blocks[0].mw === 1 && p.racks === 6 && p.spareRacks === 0 && p.overRacks === 0,
   '920 kW -> the 1 MW block, six racks populated, nothing spare, nothing over');
p = ztmmPlan(1000, u);
ok(p.blocks[0].mw === 1 && p.racks === 6 && p.overRacks === 1,
   '1,000 kW -> still the 1 MW block (the vendor\'s name for it), 6.5 racks in a six-rack POD -> one rack over');
ok(/Option B/.test(p.notes[0]), 'and the first note points at Option B / the next block');
p = ztmmPlan(2000, u);
ok(p.blocks.length === 1 && p.blocks[0].mw === 3 && p.racks === 13 && p.spareRacks === 7,
   '2 MW -> the 3 MW block: 13 racks populated, 7 spare positions, not two 1 MW blocks');
ok(p.totals.chillers.n === 4 && p.totals.containers === 4, 'and the 3 MW plant: 4 chillers, 4 containers');
p = ztmmPlan(5000, u);
ok(p.blocks.length === 1 && p.blocks[0].mw === 5 && !p.extrapolated && p.overRacks === 0, '5 MW -> the 5 MW sheet, as published');
p = ztmmPlan(8000, u);
ok(p.extrapolated && p.blocks.map(b => b.mw).join('+') === '5+3', '8 MW -> 5 + 3, flagged extrapolated');
ok(/Beyond the published/.test(p.notes[0]), 'and the first note says so');
ok(p.racks === 35 + 18 && p.overRacks === 0,
   '8 MW: the 5 MW block takes its drawn 5,350 kW (35 racks); the 3 MW block carries 2,650 kW (18 racks)');
ok(p.totals.upsKva === 5 * 1250 + 4 * 1000 && p.totals.chillers.main === 6, 'totals sum across blocks');
ok(p.notes.some(n => /chiller yard/i.test(n)), 'every plan says the chiller yard is undimensioned');
p = ztmmPlan(3080, u);
ok(p.blocks.length === 1 && p.blocks[0].mw === 3 && p.racks === 20 && p.overRacks === 0,
   '3,080 kW is exactly what the 3 MW sheet draws, so it stays in the 3 MW block');
p = ztmmPlan(1050, C.dc_ztmm1b);
ok(p.optionB && p.blocks[0].mw === 1 && p.blocks[0].racks === 7 && p.blocks[0].itKw === 1070 && p.racks === 7 && p.overRacks === 0,
   'Option B re-rates the 1 MW block to seven racks and 1,050 kW fills them');
ok(p.notes.some(n => /Option B/.test(n)), 'and carries the resize caveat');
ok(B[0].racks === 6, 'without mutating the published table');
p = ztmmPlan(0, u);
ok(p.racks === 0 && p.blocks.length === 0, 'no load, no blocks');

console.log('wiring');
ok(/dc_ztmm1:\s*'compute-pod'/.test(s), 'EQ_ARCH knows the unit is compute');
ok(/dc_ztmm1:\s*'dc-mod'/.test(s), 'the DXF block library maps it');
ok(/dc_ztmm1:\s*40\b/.test(s), 'and the symbol length is 40 ft');
ok(/derSetDc\('dc_ztmm1'\)/.test(s), 'the Data Ctr flyout can place it');
ok(/id="ocb-unit"/.test(s) && /unitId:g\('ocb-unit'\)/.test(s), 'the Compute Build dialog picks the unit and passes it to the sizer');
ok(/unitId:'dc_ztmm1'/.test(s), 'the guided build seeds the modular format with it');

console.log(fails ? ('\n' + fails + ' FAILED') : '\nall ok');
process.exit(fails ? 1 : 0);
