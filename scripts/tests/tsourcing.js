/* The cost estimator has to say where every number came from.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   A client asking for bankable numbers is asking a specific question: can an
   independent engineer trace each dollar back to a document. Before this,
   the answer was no — thirty-two rates in the model, not one carrying a
   citation, and a UI that presented them with the same confidence it would
   have given a signed quote.

   These tests hold the honest behaviour in place. The one that matters most
   is the last group: the tool must never describe an un-evidenced number as
   evidence, however it arrived. Optimism here is not a UI bug, it is a
   number going into somebody's credit paper. */
'use strict';
const fs = require('fs'), path = require('path'), assert = require('assert');
const ROOT = path.join(__dirname, '..', '..');
let fails = 0;
function ok(name, fn){
  try { fn(); console.log('  ✓ ' + name); }
  catch (e) { fails++; console.log('  ✗ ' + name + '\n      ' + e.message); }
}

global.window = global;
const M = require(path.join(ROOT, 'omega-cost-model.js'));

/* Boot the page with a stub DOM, the same seam the parity test uses. */
const html = fs.readFileSync(path.join(ROOT, 'clearsky-cost-estimator.html'), 'utf8');
const body = html.match(/<script>([\s\S]*?)<\/script>/g)
                 .map(b => b.replace(/<\/?script>/g, '')).join('\n');
function stubEl(){
  return { style:{}, dataset:{}, classList:{ add(){}, remove(){}, toggle(){}, contains(){return false;} },
           children:[], value:'', textContent:'', innerHTML:'', checked:false, disabled:false,
           appendChild(){}, removeChild(){}, setAttribute(){}, removeAttribute(){},
           getAttribute(){ return null; }, addEventListener(){}, removeEventListener(){},
           querySelector(){ return stubEl(); }, querySelectorAll(){ return []; },
           closest(){ return null; }, focus(){}, click(){}, remove(){} };
}
global.document = { getElementById:()=>stubEl(), createElement:()=>stubEl(),
                    addEventListener:()=>{}, removeEventListener:()=>{},
                    querySelector:()=>stubEl(), querySelectorAll:()=>[],
                    body:stubEl(), readyState:'complete' };
/* Node 24 defines navigator as a getter-only global, so a plain assignment
   throws under 'use strict'. defineProperty says what is meant anyway. */
Object.defineProperty(global, 'navigator', { value:{ userAgent:'node' }, configurable:true });
global.fetch = () => Promise.resolve({ ok:false, json:()=>Promise.resolve({}) });
global.localStorage = { getItem:()=>null, setItem:()=>{}, removeItem:()=>{} };
const mod = { exports:{} };
new Function('module','window','document','localStorage','navigator','fetch', body)
  (mod, global, global.document, global.localStorage, global.navigator, global.fetch);
const EST = mod.exports;

console.log('sourcing — where every number came from');
if (!EST || !EST.compute) { console.log('  ✗ estimator did not load'); process.exit(1); }

const ES = EST.S;
function setup(){
  ES.kw = 2000; ES.hours = 2; ES.packet = null; ES.carryUpgrade = false; ES.leadRelease = 'bod';
  ES.req = { interconnectionVoltage:'12470', poiDistanceFt:'250', utilitySideUpgrade:'none',
             padArea:'', soilAndGrading:'typical', ahj:'typical', laborBasis:'open',
             equipmentQuoteDate:'', duration:'' };
  EST.setVendSel('');
}

/* ── the model's own honesty ──────────────────────────────────────────── */
ok('every rate in the shipped model declares a tier', function(){
  let n = 0, bad = [];
  M.MODEL.forEach(D => D.lines.forEach(L => {
    n++;
    if (!L.src || !M.TIERS[L.src]) bad.push(L.id);
  }));
  assert(n >= 30, 'only found ' + n + ' rates — did the model shrink?');
  assert.deepStrictEqual(bad, [], 'rates with no declared source: ' + bad.join(', '));
});

ok('a rate that names no source defaults to the WEAKEST tier', function(){
  /* The direction of this default is the whole point. Defaulting the other
     way would let a new line pass for evidence by saying nothing. */
  const line = M.MODEL[0].lines[0];
  assert.strictEqual(line.src, 'planning',
    'the battery rate claims tier "' + line.src + '" with no citation behind it');
});

/* ── the page ─────────────────────────────────────────────────────────── */
ok('with nothing on file the panel claims 0% evidence', function(){
  setup();
  const r = EST.compute();
  assert.strictEqual(r.sourcing.evidenceShare, 0);
  const h = EST.sourceHtml(r);
  assert(/Where every number came from/.test(h), 'the panel did not render');
  assert(/0<small>%<\/small>/.test(h), 'the panel does not show 0% evidence');
});

ok('the estimate class says so in words, not just in a number', function(){
  setup();
  const r = EST.compute();
  assert(/Nothing in this total is priced from a quote/.test(r.cls.why),
    'the class note does not disclose that nothing is quoted: ' + r.cls.why);
});

ok('a firm, in-date quote counts as evidence and moves the share', function(){
  setup();
  EST.VENDORS.catl.dcPerKwh = 113;
  EST.VENDORS.catl.basis = 'quote';
  EST.VENDORS.catl.ref = 'Q-1';
  EST.VENDORS.catl.date = new Date().toISOString().slice(0,10);
  EST.VENDORS.catl.expires = '';
  EST.setVendSel('catl');
  const r = EST.compute();
  assert(r.sourcing.evidenceShare > 0.2,
    'a battery quote moved evidence to only ' + r.sourcing.evidenceShare);
  assert.strictEqual(r.divisions[0].lines[0].src, 'quote');
});

ok('a BUDGETARY number is a reference, never evidence', function(){
  setup();
  EST.VENDORS.catl.basis = 'budgetary';
  EST.setVendSel('catl');
  const r = EST.compute();
  assert.strictEqual(r.sourcing.evidenceShare, 0,
    'a ROM number is being counted as evidence');
  assert(r.sourcing.citedShare > 0, 'but it should still count as citable');
});

ok('an EXPIRED quote stops being evidence on its expiry date', function(){
  setup();
  EST.VENDORS.catl.basis = 'quote';
  EST.VENDORS.catl.expires = '2020-01-01';
  EST.setVendSel('catl');
  const r = EST.compute();
  assert.strictEqual(r.sourcing.evidenceShare, 0,
    'a price nobody is bound by any more is still being called evidence');
});

ok('something remembered from a call is a planning rate', function(){
  setup();
  EST.VENDORS.catl.basis = 'verbal';
  EST.VENDORS.catl.expires = '';
  EST.setVendSel('catl');
  const r = EST.compute();
  assert.strictEqual(r.sourcing.evidenceShare, 0);
  assert.strictEqual(r.sourcing.citedShare, 0,
    'a verbal number is not citable either');
});

/* ── what leaves the building ─────────────────────────────────────────── */
ok('the JSON export carries a per-line audit trail', function(){
  setup();
  const r = EST.compute();
  EST.setLast(r, EST.cpm());
  const j = JSON.parse(EST.toJson());
  assert(j.sourcing, 'no sourcing block in the export');
  assert(j.sourcing.lines.length >= 30, 'only ' + j.sourcing.lines.length + ' audited lines');
  assert(j.sourcing.tierMeanings.planning,
    'the export does not define its own tiers — a reader cannot interpret it');
  const total = j.sourcing.usdByTier.actual + j.sourcing.usdByTier.quote +
                j.sourcing.usdByTier.published + j.sourcing.usdByTier.planning;
  assert(Math.abs(total - j.cost.totalUsd.base) <= 5,
    'the audited dollars (' + total + ') do not add up to the total (' +
    j.cost.totalUsd.base + ') — the coverage share has the wrong denominator');
});

ok('the CSV names the source on every line', function(){
  setup();
  const r = EST.compute();
  EST.setLast(r, EST.cpm());
  const csv = EST.toCsv();
  const head = csv.split('\n')[0];
  assert(/Source/.test(head) && /Reference/.test(head), 'no source columns: ' + head);
  /* Count fields the way a spreadsheet does. A naive split on "," reports
     every quoted thousands separator as an extra column — which is exactly
     what a rate like "$58 / ft x 1,250 ft" puts in this file. */
  const fields = (line) => {
    let n = 1, q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { if (q && line[i+1] === '"') i++; else q = !q; }
      else if (c === ',' && !q) n++;
    }
    return n;
  };
  const widths = csv.split('\n').filter(Boolean).map(fields);
  assert(new Set(widths).size === 1,
    'ragged CSV — rows have ' + [...new Set(widths)].join('/') + ' columns');
});

console.log(fails ? '\n' + fails + ' failed' : '\nall passed');
process.exit(fails ? 1 : 0);
