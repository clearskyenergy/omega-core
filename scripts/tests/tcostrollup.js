#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Project capex is what Site Map's Run costed.

   Why (Tommy, 2026-09-28: "project capex should reflect the costs that
   are calculated by the run function in the project site map editor"):
   the workspace's Pipeline capex, the dashboard's portfolio and the asset
   book read `capex`, `incentive`, `annualRevenue` and `bessKwh` off
   projects/{id}, and nothing the editor did wrote them — 63 designed sites
   read "not priced yet" beside cost sheets that had priced every one.

   The run's own functions are grabbed out of editor.html (as tsvcped.js
   does) and run against the totals the cost sheet publishes; the fields
   they produce are then handed to the REAL workspace rule
   (omega-workspace-today.js) so both ends are held in one place. The
   payload allowlist and the load-side reset are pinned structurally, the
   way test-fiber-integration.js pins omegaFiber: a field saved through a
   spread, or restored never, is the bug class this repo has met before. */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const ED = fs.readFileSync(path.join(ROOT, 'editor.html'), 'utf8');
const WS = fs.readFileSync(path.join(ROOT, 'workspace.html'), 'utf8');
const IX = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const T = require(path.join(ROOT, 'omega-workspace-today.js'));

function bodyFrom(src, needle) {
  const hits = [];
  for (let k = src.indexOf(needle); k >= 0; k = src.indexOf(needle, k + 1)) hits.push(k);
  if (hits.length !== 1) throw new Error(needle + ' appears ' + hits.length + ' times');
  let k = src.indexOf('{', hits[0]), d = 0;
  for (;; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) break; } }
  return src.slice(hits[0], k + 1);
}
function chk(l, ok, x = '') { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${l}${x ? '  ' + x : ''}`); if (!ok) all = false; return ok; }
let all = true;

/* the browser: window and the bare globals are one object */
global.window = global;
global.S = { lastRunAt: null, costRollup: null };
(0, eval)(bodyFrom(ED, 'function omegaRunRollup('));
(0, eval)(bodyFrom(ED, 'function omegaRollupFields('));
(0, eval)(bodyFrom(ED, 'function omegaRunSave('));

const AT = Date.UTC(2026, 8, 28, 20, 1, 0);
function sheet(o) {
  const w = { _COST_TOTAL: 0, _NET_COST: 0, _INC_TOTAL: 0, _YR1_REV: 0, _COST_IS_CONTRACTED: false };
  Object.keys(o || {}).forEach(k => { w[k] = o[k]; });
  Object.keys(w).forEach(k => { global[k] = w[k]; });
  S.lastRunAt = AT; S.costRollup = null;
}
let fleet = { kw: 1000, kwh: 2000, units: 2, source: 'placed' };
global.omegaBessFleet = () => fleet;

console.log('\nthe run captures its own totals');
{
  sheet({ _COST_TOTAL: 1234567.8, _NET_COST: 864197.8, _INC_TOTAL: 370370, _YR1_REV: 0 });
  const r = omegaRunRollup();
  chk('Total install is the capex, to the dollar', r.capex === 1234568, JSON.stringify(r));
  chk('the incentives netted and the net figure ride with it', r.incentive === 370370 && r.netCost === 864198);
  chk('the placed fleet is the battery', r.bessKw === 1000 && r.bessKwh === 2000);
  chk('revenue with no streams filled in is zero, not invented', r.annualRevenue === 0);
  chk('the run\'s own clock and the benchmark flag', r.at === AT && r.contracted === false);
  chk('it is kept on S for the save', S.costRollup === r);

  sheet({ _COST_TOTAL: 500000, _NET_COST: NaN, _INC_TOTAL: 50000, _YR1_REV: 64000.4, _COST_IS_CONTRACTED: true });
  const c = omegaRunRollup();
  chk('a contracted number is marked as one and revenue rounds', c.contracted === true && c.annualRevenue === 64000, JSON.stringify(c));
  chk('net falls back to gross less incentives when the sheet has not netted', c.netCost === 450000);

  sheet({ _COST_TOTAL: 0 });
  S.costRollup = { capex: 1 };
  chk('a run that priced nothing records nothing and clears the last capture', omegaRunRollup() === null && S.costRollup === null);
  sheet({ _COST_TOTAL: 'abc' });
  chk('a sheet that has not run is not a price', omegaRunRollup() === null);

  fleet = { kw: 0, kwh: 0, units: 0, source: 'placed' };
  sheet({ _COST_TOTAL: 9000, _NET_COST: 9000 });
  const nb = omegaRunRollup();
  chk('a site with no battery has a cost and no battery', nb.capex === 9000 && nb.bessKw === 0 && nb.bessKwh === 0);
  global.omegaBessFleet = () => { throw new Error('collector down'); };
  chk('a collector that throws costs the run its battery, not its capex', omegaRunRollup().capex === 9000);
  global.omegaBessFleet = () => fleet;
}

console.log('\nthe record\'s fields, and nothing the run did not produce');
{
  fleet = { kw: 1000, kwh: 2000, units: 2, source: 'placed' };
  sheet({ _COST_TOTAL: 1234567.8, _NET_COST: 864197.8, _INC_TOTAL: 370370, _YR1_REV: 0 });
  const f = omegaRollupFields(omegaRunRollup());
  chk('capex, incentive, the battery, when and where from', f.capex === 1234568 && f.incentive === 370370 && f.bessKwh === 2000 && f.bessKw === 1000 && f.capexAt === AT && f.capexSource === 'site-map', JSON.stringify(f));
  chk('no revenue key when the streams gave none (a zero would erase a figure someone entered)', !('annualRevenue' in f));
  sheet({ _COST_TOTAL: 1234567.8, _NET_COST: 864197.8, _INC_TOTAL: 370370, _YR1_REV: 64000 });
  chk('revenue when the streams gave one', omegaRollupFields(omegaRunRollup()).annualRevenue === 64000);
  fleet = { kw: 0, kwh: 0, units: 0, source: 'placed' };
  sheet({ _COST_TOTAL: 9000, _NET_COST: 9000 });
  const nb = omegaRollupFields(omegaRunRollup());
  chk('no battery keys when nothing is placed or configured', !('bessKwh' in nb) && !('bessKw' in nb) && nb.capex === 9000, JSON.stringify(nb));
  chk('nothing captured, nothing written', JSON.stringify(omegaRollupFields(null)) === '{}' && JSON.stringify(omegaRollupFields({ capex: 0 })) === '{}');
  chk('an incentive of zero is written as zero, the run netted none', 'incentive' in nb && nb.incentive === 0);
}

console.log('\nthe run saves what it priced');
{
  let saved = 0, marked = [];
  global._setSaved = s => marked.push(s);
  global.saveProject = () => { saved++; };
  global._currentUser = { uid: 'u' }; global._projectId = 'p1'; global._loadReady = true; global.OmegaCaps = null;
  fleet = { kw: 1000, kwh: 2000, units: 2, source: 'placed' };
  sheet({ _COST_TOTAL: 1234567.8, _NET_COST: 864197.8 }); omegaRunRollup();
  chk('a priced run marks the record unsaved and saves once', omegaRunSave() === true && saved === 1 && marked.join() === 'unsaved', marked.join() + ' saved=' + saved);
  sheet({ _COST_TOTAL: 0 }); omegaRunRollup();
  chk('a run that priced nothing saves nothing', omegaRunSave() === false && saved === 1);
  sheet({ _COST_TOTAL: 1234567.8 }); omegaRunRollup();
  global._projectId = null;
  chk('no project open, no save (the first save carries it)', omegaRunSave() === false && saved === 1);
  global._projectId = 'p1'; global._loadReady = false;
  chk('a project still loading is not written over', omegaRunSave() === false && saved === 1);
  global._loadReady = true; global.OmegaCaps = { packageAccess: () => ({ readOnly: true }) };
  chk('a read-only plan waits, as every producing control does', omegaRunSave() === false && saved === 1);
  global.OmegaCaps = { packageAccess: () => ({ unverified: true }) };
  chk('an unchecked plan waits too', omegaRunSave() === false && saved === 1);
  global.OmegaCaps = { packageAccess: () => ({ readOnly: false, modules: ['lite'] }) };
  chk('a live plan saves', omegaRunSave() === true && saved === 2);
  global.OmegaCaps = { packageAccess: () => null };
  chk('a legacy plan (no package) saves', omegaRunSave() === true && saved === 3);
}

console.log('\nthe editor wires it: Run captures, the payload carries it, a load resets it');
{
  const run = bodyFrom(ED, 'function omegaRunDesign(');
  chk('omegaRunDesign captures the totals after the recompute, before the rail draws', /updateCostEst[\s\S]*S\.lastRunAt = Date\.now\(\);\s*try\{ omegaRunRollup\(\); \}catch\(e\)\{\}\s*try\{ omegaRenderResults\(\); \}catch\(e\)\{\}/.test(run));
  chk('and saves once the results are current', /omegaSetStale\(false\); \}catch\(e\)\{\}\s*try\{ omegaRunSave\(\); \}catch\(e\)\{\}/.test(run));
  const save = bodyFrom(ED, 'async function saveProject(');
  chk('saveProject asks omegaRollupFields for the record\'s fields before the payload literal', /const _rollup = \(typeof omegaRollupFields==='function'\) \? omegaRollupFields\(S\.costRollup\) : \{\};\s*const payload = \{/.test(save));
  ['capex', 'incentive', 'annualRevenue', 'bessKwh', 'bessKw', 'capexAt', 'capexSource'].forEach(k => {
    chk(k + ' is in the save payload literal, from the rollup, never a spread', new RegExp('^\\s*' + k + ':\\s+_rollup\\.' + k + ',', 'm').test(save));
  });
  chk('undefined is stripped before the write, so an unpriced save leaves the record\'s figures alone', /_stripUndefinedInPlace\(payload\);/.test(save) && /if\(v===undefined\)\{ delete obj\[k\]; \}/.test(bodyFrom(ED, 'function _stripUndefinedInPlace(')));
  chk('_loadProject resets the capture, so a figure never leaks from the previously open project', /S\.omegaFiberAt\s*=\s*d\.omegaFiberAt\s*\|\|\s*null;[\s\S]{0,400}S\.costRollup\s*=\s*null;/.test(bodyFrom(ED, 'async function _loadProject(')));
}

console.log('\nthe readers read exactly those names');
{
  chk('the workspace hands the raw project records to the Today rule', /db\.collection\('projects'\)\.where\('orgsInvolved', 'array-contains', org\)\.get\(\)/.test(WS));
  chk('the dashboard rollup reads capex, incentive, annualRevenue and bessKwh off the record', /Number\(d\.capex\)/.test(IX) && /Number\(d\.incentive\)/.test(IX) && /Number\(d\.annualRevenue\)/.test(IX) && /Number\(d\.bessKwh\)/.test(IX));
  chk('the workspace card sizes a project by bessKwh', /p\.bessKwh/.test(WS));

  /* both ends: the fields a run wrote, through the REAL workspace rule */
  const NOW = Date.UTC(2026, 8, 29, 12, 0, 0);
  fleet = { kw: 1000, kwh: 2000, units: 2, source: 'placed' };
  sheet({ _COST_TOTAL: 1234567.8, _NET_COST: 864197.8, _INC_TOTAL: 370370 });
  const priced = Object.assign({ id: 'p1', name: '431 Sunderland Rd', type: 'l2', stage: 'candidate', elements: [{ type: 'evgear', evKind: 'charger' }], createdAt: NOW - 3 * 86400000, updatedAt: NOW - 3600000 }, omegaRollupFields(omegaRunRollup()));
  const unpriced = { id: 'p2', name: '33 Hermon St', stage: 'candidate', createdAt: NOW - 3 * 86400000, updatedAt: NOW - 7200000 };
  const both = T.build({ now: NOW, me: 'admin@concordenergyusa.com', projects: [priced, unpriced], canOpen: () => true });
  const capex = both.kpis.filter(k => k.key === 'capex')[0];
  chk('Pipeline capex is the run\'s figure, and the site nobody ran is the one not priced yet', capex.value === '$1.2M' && capex.delta === '1 project not priced yet', JSON.stringify(capex));
  chk('the priced site no longer needs a battery size; the other still does', both.needs.some(r => r.key === 'size:p2') && !both.needs.some(r => /p1/.test(r.key)), JSON.stringify(both.needs.map(r => r.key)));
  const one = T.build({ now: NOW, me: 'admin@concordenergyusa.com', projects: [priced], canOpen: () => true });
  chk('a pipeline of priced sites has no dash and no "not priced yet"', one.kpis[2].value === '$1.2M' && one.kpis[2].delta === '', JSON.stringify(one.kpis[2]));
  const card = T.board({ now: NOW, projects: [priced, unpriced] });
  chk('the In flight card of the priced Level 2 site reads designed and run at 100%; the site nobody ran still asks for a size', card.filter(c => c.id === 'p1')[0].why === 'Designed and run · Touched today' && T.progress(priced).pct === 100 && card.filter(c => c.id === 'p2')[0].why === 'No battery size yet', JSON.stringify(card.map(c => c.why)));
}

console.log(all ? '\nALL PASS' : '\nFAILURES');
process.exit(all ? 0 : 1);
