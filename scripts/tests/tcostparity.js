/* Does omega-cost-model.price() agree with the estimator's own compute()?
   Same tables now, but the LOOP was ported by hand — and a pricing loop that
   is nearly right is worse than one that is obviously wrong, because it ships.
   So: run both on the same inputs and compare to the cent. */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
let fails = 0;
function ok(c, m){ console.log('  ' + (c ? 'ok  ' : 'FAIL') + '   ' + m); if(!c) fails++; }

global.window = global;
const M = require(path.join(ROOT, 'omega-cost-model.js'));

/* Load the estimator's own compute() with a stubbed page. */
const html = fs.readFileSync(path.join(ROOT, 'clearsky-cost-estimator.html'), 'utf8');
const body = html.match(/<script>([\s\S]*?)<\/script>/g)
                 .map(b => b.replace(/<\/?script>/g, '')).join('\n');
/* A stub that accepts whatever the page does to it. The point is to reach
   compute(), not to render anything. */
function stubEl(){
  const e = { style:{}, dataset:{}, classList:{ add(){}, remove(){}, toggle(){}, contains(){return false;} },
              children:[], value:'', textContent:'', innerHTML:'', checked:false, disabled:false,
              appendChild(){}, removeChild(){}, setAttribute(){}, removeAttribute(){},
              getAttribute(){ return null; }, addEventListener(){}, removeEventListener(){},
              querySelector(){ return stubEl(); }, querySelectorAll(){ return []; },
              closest(){ return null; }, focus(){}, click(){}, remove(){} };
  return e;
}
global.document = { getElementById:()=>stubEl(), createElement:()=>stubEl(),
                    addEventListener:()=>{}, removeEventListener:()=>{},
                    querySelector:()=>stubEl(), querySelectorAll:()=>[],
                    body:stubEl(), readyState:'complete' };
global.navigator = { userAgent:'node' };
global.fetch = () => Promise.resolve({ ok:false, json:()=>Promise.resolve({}) });
global.localStorage = { getItem:()=>null, setItem:()=>{}, removeItem:()=>{} };
/* The estimator's IIFE already exports itself for a test harness when a
   `module` object is in scope — use that seam rather than prising the
   function out of a closure. */
let EST = null;
try {
  /* exports must be TRUTHY: the estimator guards on `module.exports`, so a
     null here silently skips its own export and looks like a load failure. */
  const mod = { exports: {} };
  new Function('module', 'window', 'document', 'localStorage', 'navigator', 'fetch', body)
    (mod, global, global.document, global.localStorage, global.navigator, global.fetch);
  EST = mod.exports;
} catch (e) {
  console.log('could not load estimator:', e.message);
}
const compute = EST && EST.compute;
const ES = EST && EST.S;

console.log('parity — model vs estimator');
if (!compute) { ok(false, 'estimator compute() did not load'); process.exit(1); }

const CASES = [
  { name:'2 MW / 2h, 12 kV, unknown everything',
    est:{ kw:2000, hours:2, req:{ interconnectionVoltage:'12470', poiDistanceFt:'', utilitySideUpgrade:'',
          padArea:'', soilAndGrading:'', ahj:'', laborBasis:'', equipmentQuoteDate:'' } },
    mod:{ kw:2000, hours:2, volt:'12470' } },
  { name:'500 kW / 4h, 480 V, poor ground, hard AHJ, prevailing wage',
    est:{ kw:500, hours:4, req:{ interconnectionVoltage:'480', poiDistanceFt:'900', utilitySideUpgrade:'none',
          padArea:'3000', soilAndGrading:'poor', ahj:'hard', laborBasis:'pw', equipmentQuoteDate:'' } },
    mod:{ kw:500, hours:4, volt:'480', poiFt:900, utilityUpgrade:'none', padArea:3000,
          soil:'poor', ahj:'hard', labor:'pw' } },
  { name:'5 MW / 2h, 34.5 kV, rock, streamlined, union, xfmr upgrade',
    est:{ kw:5000, hours:2, req:{ interconnectionVoltage:'34500', poiDistanceFt:'250', utilitySideUpgrade:'xfmr',
          padArea:'', soilAndGrading:'rock', ahj:'fast', laborBasis:'pla', equipmentQuoteDate:'' } },
    mod:{ kw:5000, hours:2, volt:'34500', poiFt:250, utilityUpgrade:'xfmr',
          soil:'rock', ahj:'fast', labor:'pla' } }
];

CASES.forEach(function (c) {
  ES.kw = c.est.kw; ES.hours = c.est.hours; ES.req = c.est.req;
  ES.packet = null; ES.carryUpgrade = false; ES.leadRelease = 'bod';
  const a = compute();
  const b = M.price(c.mod);
  if (!a || !b) { ok(false, c.name + ' — one side returned null'); return; }
  const cent = (x) => Math.round(x * 100);
  ok(cent(a.total.base) === cent(b.total.base),
     c.name + '  base $' + Math.round(b.total.base).toLocaleString()
     + (cent(a.total.base) === cent(b.total.base) ? '' :
        '  (estimator ' + Math.round(a.total.base) + ' vs model ' + Math.round(b.total.base) + ')'));
  ok(cent(a.total.lo) === cent(b.total.lo) && cent(a.total.hi) === cent(b.total.hi),
     '   band matches');
  ok(a.divisions.length === b.divisions.length, '   same divisions');
});

/* A supplier quote must move the battery line and nothing else. */
ES.kw = 2000; ES.hours = 2; ES.packet = null; ES.carryUpgrade = false;
ES.req = { interconnectionVoltage:'12470', poiDistanceFt:'', utilitySideUpgrade:'none',
           padArea:'', soilAndGrading:'', ahj:'', laborBasis:'', equipmentQuoteDate:'' };
const plain = M.price({ kw:2000, hours:2, volt:'12470', utilityUpgrade:'none' });
const quoted = M.price({ kw:2000, hours:2, volt:'12470', utilityUpgrade:'none',
                         vendor:{ name:'CATL', dcPerKwh:95 } });
ok(quoted.total.base < plain.total.base, 'a $95/kWh quote prices below the $115 generic rate');
const noPrice = M.price({ kw:2000, hours:2, volt:'12470', utilityUpgrade:'none',
                          vendor:{ name:'CATL', dcPerKwh:null } });
ok(Math.round(noPrice.total.base) === Math.round(plain.total.base),
   'a supplier with NO price on file changes nothing');
const zero = M.price({ kw:2000, hours:2, volt:'12470', utilityUpgrade:'none',
                       vendor:{ name:'CATL', dcPerKwh:0 } });
ok(Math.round(zero.total.base) === Math.round(plain.total.base),
   'a zero is not treated as a price');

console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed');
process.exit(fails ? 1 : 0);
