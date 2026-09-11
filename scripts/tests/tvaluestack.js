/* What a battery earns, and who says so.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   A revenue stack is where optimism gets laundered into a spreadsheet, so
   the rule is stricter here than on the cost side, not looser. Every stream
   declares its tier, a stream nobody supplied is reported as MISSING rather
   than defaulted to zero-and-forgotten, and the two numbers most often got
   wrong — PJM accreditation and the ComEd rebate's conditions — are pinned. */
'use strict';
const path = require('path'), assert = require('assert');
global.window = global;
const V = require(path.join(__dirname, '..', '..', 'omega-value-stack.js'));
let fails = 0;
function ok(name, fn){
  try { fn(); console.log('  ✓ ' + name); }
  catch (e) { fails++; console.log('  ✗ ' + name + '\n      ' + e.message); }
}

console.log('value stack — published rates, applied to one site');

ok('PJM capacity is accredited, not quoted at nameplate', function(){
  /* The commonest error in a storage pro forma: a 4-hour battery is not
     1 MW of capacity, it is 59% of 1 MW. Quoting the clearing price against
     nameplate overstates this stream by nearly half. */
  const s = V.stack({ kw: 1000, hours: 4 });
  const cap = s.streams.filter(x => x.id === 'pjm.capacity')[0];
  assert(cap, 'no capacity stream');
  const nameplate = 1 * V.PJM.price * 365;
  assert(cap.usd < nameplate * 0.65,
    'capacity is being quoted at or near nameplate ($' + Math.round(cap.usd) + ')');
  assert(/59%/.test(cap.how), 'the accreditation rate is not shown in the working');
});

ok('longer duration accredits higher, as PJM publishes it', function(){
  const four = V.stack({ kw: 1000, hours: 4 }).streams[0].usd;
  const eight = V.stack({ kw: 1000, hours: 8 }).streams[0].usd;
  assert(eight > four, 'an 8-hour battery does not accredit above a 4-hour one');
  assert.strictEqual(V.elccFor(4).rate, 0.59);
  assert.strictEqual(V.elccFor(8).rate, 0.71);
});

ok('a duration below the lowest class claims nothing', function(){
  /* There is no storage class under four hours to accredit against.
     Extrapolating one would be inventing an accreditation. */
  const s = V.stack({ kw: 1000, hours: 2 });
  assert(!s.streams.filter(x => x.id === 'pjm.capacity').length,
    'capacity revenue was claimed for a 2-hour battery');
  assert(s.missing.join(' ').indexOf('PJM capacity') >= 0,
    'and it is not reported as missing either');
});

ok('a stream with no input is MISSING, never zero', function(){
  /* A total that silently omits two of five reads like a complete answer. */
  const s = V.stack({ kw: 826, hours: 6 });
  assert(s.missing.length >= 2, 'absent streams are not reported');
  assert(!s.streams.filter(x => x.usd === 0).length,
    'an absent stream was counted as a zero-value stream');
});

ok('every stream carries a tier and a working', function(){
  const s = V.stack({ kw: 826, hours: 6, demandLoPerKwMonth: 8,
                      demandHiPerKwMonth: 14, vppPerKwYear: 150 });
  s.streams.forEach(function (x) {
    assert(x.tier, x.id + ' has no tier');
    assert(x.how && x.how.length > 10, x.id + ' shows no arithmetic');
    assert(x.ref && x.ref.length > 10, x.id + ' cites nothing');
  });
  assert(s.streams.filter(x => x.tier === 'published').length >= 1,
    'nothing in the stack is published');
});

ok('the VPP rate is NOT presented as published without a citation', function(){
  /* ComEd's Rider VPP / BYODLR is still before the ICC. */
  const s = V.stack({ kw: 826, hours: 6, vppPerKwYear: 150 });
  const vpp = s.streams.filter(x => x.id === 'vpp')[0];
  assert.strictEqual(vpp.tier, 'planning',
    'an unfiled tariff is being presented as a published rate');
  assert(/ICC|indicative/.test(vpp.ref), 'its status is not disclosed');
});

/* ── incentives ───────────────────────────────────────────────────────── */
ok('the ComEd rebate is per kWh, as their own terms state', function(){
  /* It looks like a typo and it is not: "$250 per kilowatt-hour ('kWh') …
     for eligible energy storage facilities associated with a qualified DG
     facility". Checked against ComEd's DG Rebate Terms and Conditions. */
  assert.strictEqual(V.COMED_REBATE.perKwh, 250);
  assert(/per kWh/i.test(V.COMED_REBATE.ref), 'the unit is not stated in the citation');
  assert(/comed\.com/.test(V.COMED_REBATE.url), 'no link to the source document');
});

ok('the two conditions that decide the rebate travel with it', function(){
  const inc = V.incentives({ capexUsd: 1021000, kwh: 5407, itcRate: 0.30,
                             rebatePerKwh: 250 });
  const reb = inc.items.filter(x => x.id === 'rebate')[0];
  assert(/qualified DG facility/i.test(reb.conditions),
    'the DG pairing condition is missing');
  assert(/Rate BESH/i.test(reb.conditions), 'the Rate BESH commitment is missing');
});

ok('a rebate larger than the project is flagged, not suppressed', function(){
  const inc = V.incentives({ capexUsd: 1021000, kwh: 5407, itcRate: 0.30,
                             rebatePerKwh: 250 });
  assert(inc.flags.length === 1, 'no flag on a rebate exceeding the project');
  /* The flag must point at the CONDITIONS, not at the rate. The rate is
     right; I doubted it and ComEd's own terms say otherwise. A flag that
     tells somebody their correct number looks wrong trains them to ignore
     flags. */
  assert(/qualified DG facility/i.test(inc.flags[0]) && /Rate BESH/i.test(inc.flags[0]),
    'the flag does not name the two conditions that actually decide the rebate');
  assert(/not necessarily wrong|designed to run this large/i.test(inc.flags[0]),
    'the flag reads as a dispute of the rate rather than a prompt to confirm terms');
  const reb = inc.items.filter(x => x.id === 'rebate')[0];
  assert(Math.round(reb.usd) === 250 * 5407,
    'the rebate was silently reduced instead of being flagged');
});

ok('a cap is applied when one is entered', function(){
  const inc = V.incentives({ capexUsd: 1021000, kwh: 5407, rebatePerKwh: 250,
                             rebateCapUsd: 400000 });
  const reb = inc.items.filter(x => x.id === 'rebate')[0];
  assert.strictEqual(Math.round(reb.usd), 400000, 'the cap was ignored');
  assert(/capped/.test(reb.how), 'the cap is not disclosed in the working');
});

/* ── utility cost, both directions ────────────────────────────────────── */
ok('utility cost reports capex AND opex, and guesses neither', function(){
  /* A pro forma carrying only the one-off cost is wrong every year after
     the first. */
  const u = V.utilityCost({ kw: 826 });
  assert.strictEqual(u.capexUsd, null);
  assert.strictEqual(u.opexPerYear, null);
  assert(/interconnection study/i.test(u.capexNote), 'capex note says nothing useful');
  assert(/every year|annually/i.test(u.opexNote), 'the recurring nature is not stated');
  const u2 = V.utilityCost({ kw: 826, standbyPerKwMonth: 2 });
  assert.strictEqual(Math.round(u2.opexPerYear), 826 * 2 * 12);
});

console.log(fails ? '\n' + fails + ' failed' : '\nall passed');
process.exit(fails ? 1 : 0);
