/* An EPC quotes a job, not a rate.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   A supplier quotes $/kWh. An installer quotes one figure for all the
   electrical and one for all the civil, against ONE project. Three things
   have to stay true for that to be usable without becoming misleading:

     the breakdown is not invented — a quoted division total must not be
       split across the lines inside it, because a manufactured split reads
       exactly like a real one;
     a lump sum with no size cannot be applied to another project at all;
     and headroom the contractor named is reported, never deducted. */
'use strict';
const path = require('path'), assert = require('assert');
global.window = global;
const M = require(path.join(__dirname, '..', '..', 'omega-cost-model.js'));
let fails = 0;
function ok(name, fn){
  try { fn(); console.log('  ✓ ' + name); }
  catch (e) { fails++; console.log('  ✗ ' + name + '\n      ' + e.message); }
}
/* SYNTHETIC FIGURES ON PURPOSE. The quote this was built against carries a
   confidentiality clause and this repository is public, so the real numbers
   live in the organisation's own record and never in a committed file. The
   behaviour under test does not depend on them: round numbers make the
   scaling assertions readable, which is all a fixture owes anybody. */
const EPC = { name:'An installer', basis:'quote', ref:'Q-0001', date:'2026-07-07',
              project:'A job', projectKwh:1000,
              divisions:{ el:200000, cv:60000 },
              savingPct:0.08, savingWhy:'Copper conduit; aluminium would serve.' };
const at = (kw, inst) => M.price({ kw:kw, hours:2, volt:'12470',
                                   utilityUpgrade:'none', installer:inst });
const div = (r, id) => r.divisions.filter(d => d.id === id)[0];

console.log('installers — a quoted job, not a rate');

ok('at the size it was quoted for, the division IS the quoted figure', function(){
  const r = at(500, EPC);                         /* 500 kW × 2 h = 1,000 kWh */
  assert(Math.abs(div(r,'el').base - 200000) < 1,
    'electrical came out at ' + Math.round(div(r,'el').base));
  assert(Math.abs(div(r,'cv').base - 60000) < 1,
    'civil came out at ' + Math.round(div(r,'cv').base));
});

ok('it scales to another size rather than being copied across', function(){
  const half = at(250, EPC);
  assert(Math.abs(div(half,'el').base - 200000/2) < 1,
    'a half-size job did not scale: ' + Math.round(div(half,'el').base));
});

ok('a lump sum with NO size is refused, not guessed', function(){
  const noSize = Object.assign({}, EPC, { projectKwh:null, projectKw:null });
  const r = at(500, noSize);
  const plain = at(500, null);
  assert(Math.round(r.total.base) === Math.round(plain.total.base),
    'an unsized lump sum was applied to a project anyway');
  assert(!div(r,'el').quotedBy, 'the division claims to be quoted');
});

ok('the lines inside a quoted division are marked covered, not re-priced', function(){
  const r = at(500, EPC);
  const lines = div(r,'el').lines;
  assert(lines.length > 0, 'the scope disappeared with the rates');
  assert(lines.every(l => l.coveredBy === 'An installer'),
    'a line inside a quoted division is not marked as covered by it');
  const sum = lines.reduce((a,l) => a + l.cost, 0);
  assert(Math.abs(sum - div(r,'el').base) > 1,
    'the line costs were rescaled to add up to the quote — that is an invented breakdown');
});

ok('a quoted division counts as evidence and lifts the audit', function(){
  const r = at(500, EPC), plain = at(500, null);
  assert.strictEqual(plain.sourcing.evidenceShare, 0);
  assert(r.sourcing.evidenceShare > 0.2,
    'a quoted electrical and civil scope backs only ' + r.sourcing.evidenceShare);
  const row = r.sourcing.rows.filter(x => x.id === 'div.el')[0];
  assert(row && /Q-0001/.test(row.ref), 'the audit row carries no quote reference');
});

ok('value engineering is reported as headroom, never deducted', function(){
  const r = at(500, EPC);
  const ve = r.exposures.filter(e => e.id.indexOf('ve.') === 0);
  assert(ve.length === 2, 'expected headroom on both quoted divisions');
  assert(ve.every(e => e.usd < 0), 'headroom is signed as a cost, not a saving');
  const noVe = at(500, Object.assign({}, EPC, { savingPct:null }));
  assert(Math.round(noVe.total.base) === Math.round(r.total.base),
    'the saving was taken off the total — nobody has priced the alternative');
});

ok('a rough estimate is still evidence, but a verbal number is not', function(){
  /* A written quotation off a site map is a real document somebody signed a
     number onto. What it is NOT is carried in the qualifier, in words, on
     the estimate — not by silently downgrading its tier. */
  const rough = at(500, EPC);
  assert.strictEqual(div(rough,'el').src, 'quote');
  const verbal = at(500, Object.assign({}, EPC, { basis:'verbal' }));
  assert.strictEqual(div(verbal,'el').src, 'planning',
    'something remembered from a call is being counted as a quote');
  const budgetary = at(500, Object.assign({}, EPC, { basis:'budgetary' }));
  assert.strictEqual(div(budgetary,'el').src, 'published');
});

console.log(fails ? '\n' + fails + ' failed' : '\nall passed');
process.exit(fails ? 1 : 0);
