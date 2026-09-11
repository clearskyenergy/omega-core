/* You cannot buy a third of a container, and EXW is not delivered.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Two commercial facts sit on every hardware quote and neither is in the
   arithmetic: the supplier sells a PRODUCT of a fixed size, and the price is
   quoted at a named place. Ignore the first and a small site is priced at a
   third of what it costs to buy. Ignore the second and the haul is missing.

   Both are reported the way this model has always reported an unknown
   utility upgrade — as a named exposure with an amount and the action that
   closes it — rather than folded into the total or absorbed by contingency.
   These tests hold that line, and hold the harder one underneath it: the
   tool must not invent the numbers it does not have. */
'use strict';
const path = require('path'), assert = require('assert');
global.window = global;
const M = require(path.join(__dirname, '..', '..', 'omega-cost-model.js'));
let fails = 0;
function ok(name, fn){
  try { fn(); console.log('  ✓ ' + name); }
  catch (e) { fails++; console.log('  ✗ ' + name + '\n      ' + e.message); }
}
const QUOTE = { name:'Gotion', dcPerKwh:113, basis:'quote', date:'2026-08-28',
                expires:'2026-10-27', incoterm:'EXW Manteno, IL',
                model:'5 MWh DC block', blockMwh:5 };
function priced(kw, extra){
  const v = Object.assign({}, QUOTE, extra || {});
  return M.price({ kw:kw, hours:2, volt:'12470', utilityUpgrade:'none',
                   rates:M.ratesFromVendor(v) });
}
const find = (r, pre) => (r.exposures || []).filter(x => x.id.indexOf(pre) === 0)[0];

console.log('exposures — block size and freight');

/* ── block granularity ───────────────────────────────────────────────── */
ok('a site smaller than one block reports the stranded capacity', function(){
  const r = priced(884);                       /* 1,768 kWh of a 5,000 kWh block */
  const x = find(r, 'granularity.');
  assert(x, 'no granularity exposure on a sub-block site');
  assert(x.usd > 300000, 'stranded exposure is only $' + Math.round(x.usd));
  assert(/less than one block/.test(x.why), 'it does not say the site is under a block');
  assert(x.closes && /supplier|whole number of blocks/.test(x.closes),
    'the exposure names no action that closes it');
});

ok('a site landing exactly on a block boundary reports nothing', function(){
  const r = priced(2500);                      /* 5,000 kWh = one whole block */
  assert(!find(r, 'granularity.'),
    'a site that needs exactly one block is being told it strands capacity');
});

ok('the exposure is NOT added to the total', function(){
  /* The quote this was built against was issued for 12.5 MWh — two and a
     half blocks — so per-kWh is a defensible reading of that document.
     Billing whole blocks on the customer's behalf would substitute our
     assumption for their supplier's terms. */
  const withBlock = priced(884);
  const noBlock = priced(884, { blockMwh:null });
  assert(Math.round(withBlock.total.base) === Math.round(noBlock.total.base),
    'declaring a block size silently changed the total');
});

ok('a supplier with no block size on file produces no exposure', function(){
  assert(!find(priced(884, { blockMwh:null }), 'granularity.'),
    'an exposure was invented for a supplier who never stated a block size');
});

/* ── freight ─────────────────────────────────────────────────────────── */
ok('an EXW price reports freight as an exposure with NO amount', function(){
  const x = find(priced(2500), 'freight.');
  assert(x, 'an at-gate price reports no freight exposure');
  assert.strictEqual(x.usd, null,
    'a freight allowance was invented — $' + x.usd + ' nobody quoted');
  assert(/not guessed/.test(x.why), 'it does not say the amount is not guessed');
});

ok('a delivered price reports no freight exposure', function(){
  assert(!find(priced(2500, { incoterm:'DAP site' }), 'freight.'),
    'a DAP price is being told its freight is missing');
});

ok('recorded freight is added to the rate and closes the exposure', function(){
  const bare = priced(2500);
  const hauled = priced(2500, { freightPerKwh:6,
                                freightRef:'Haul quote, ABC Logistics 2026-09-02' });
  assert(hauled.total.base > bare.total.base, 'freight did not reach the total');
  assert(!find(hauled, 'freight.'), 'freight is still open after being priced');
  assert(/freight/i.test(hauled.divisions[0].lines[0].basis),
    'the line does not show that freight is in the rate');
});

ok('freight with no reference demotes the whole blended rate', function(){
  /* A firm battery quote plus a freight figure nobody sourced is not a firm
     price for the pair. The blend is only as good as its weakest half, and
     claiming otherwise is how an unsourced number rides into a credit paper
     on the back of a real one. */
  const sourced = priced(2500, { freightPerKwh:6, freightRef:'Haul quote 2026-09-02' });
  const typed   = priced(2500, { freightPerKwh:6 });
  assert(sourced.sourcing.evidenceShare > 0.2,
    'a fully sourced pair is not counted as evidence');
  assert.strictEqual(typed.sourcing.evidenceShare, 0,
    'an unsourced freight number still rode in as evidence');
  assert(/no freight reference on file/.test(typed.divisions[0].lines[0].ref),
    'the line does not disclose the missing freight reference');
});

console.log(fails ? '\n' + fails + ' failed' : '\nall passed');
process.exit(fails ? 1 : 0);
