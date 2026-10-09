#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   scripts/tests/tpartnersplit.js — the capital partner split
   (scripts/omega-core-partner-split.js) adds up: every dollar the skid
   makes goes to the partner or to ClearSky and nowhere else, the
   contracted case pays the partner's capital back inside the term, a
   worse case is never better, and the sale-leaseback payment returns
   exactly the yield it was sized to. Pinned so a change to the model or the
   script cannot quietly flatter the partner's page. */
'use strict';
var assert = require('node:assert/strict');
var cp = require('child_process'), path = require('path');
var n = 0;
function test(name, fn) { fn(); n++; console.log('PASS ' + name); }

var out = JSON.parse(cp.execFileSync(process.execPath, [path.join(__dirname, '..', 'omega-core-partner-split.js'), '--json'], { encoding: 'utf8' }));
var by = {}; out.cases.forEach(function (c) { by[c.key] = c; });

test('four cases, merchant first and stress last, each priced on the same skid', function () {
  assert.deepEqual(out.cases.map(function (c) { return c.key; }), ['merchant', 'contracted', 'downside', 'stress']);
  out.cases.forEach(function (c) { assert.equal(c.project.capex, 450000); assert.equal(c.inputs.hostLeaseMonthly, 1000, 'the host lease is the market reference base'); });
});
test('structure 1 conserves cash: partner + ClearSky over the term = cash to split + fees + residual, within rounding', function () {
  out.cases.forEach(function (c) {
    var o = c.owner;
    assert.ok(o.partnerTotal >= 0 && o.clearskyTotal >= 0, c.key);
    assert.ok(Math.abs(o.partnerTotal + o.clearskyTotal - o.produced) < 1, c.key + ': partner ' + o.partnerTotal + ' + ClearSky ' + o.clearskyTotal + ' = produced ' + o.produced);
  });
});
test('the contracted base pays the partner back inside the term with the pref covered; the merchant case sooner', function () {
  assert.ok(by.contracted.owner.partnerPayback != null && by.contracted.owner.partnerPayback <= 60, 'contracted payback ' + by.contracted.owner.partnerPayback);
  assert.ok(by.contracted.owner.prefCoverMin >= 1, 'pref covered at worst ' + by.contracted.owner.prefCoverMin);
  assert.ok(by.merchant.owner.partnerPayback < by.contracted.owner.partnerPayback);
});
test('a worse case is never better for the partner under any structure', function () {
  ['owner', 'revshare'].forEach(function (s) {
    assert.ok(by.merchant[s].partnerIrr >= by.contracted[s].partnerIrr, s + ' merchant >= contracted');
    assert.ok(by.contracted[s].partnerIrr >= by.downside[s].partnerIrr, s + ' contracted >= downside');
    assert.ok(by.downside[s].partnerIrr >= by.stress[s].partnerIrr, s + ' downside >= stress');
  });
  assert.ok(by.merchant.leaseback.coverMin > by.contracted.leaseback.coverMin && by.contracted.leaseback.coverMin > by.downside.leaseback.coverMin);
});
test('the sale-leaseback payment is sized to the yield: paying it 60 times plus the residual returns the yield on the price', function () {
  var l = by.merchant.leaseback, r = out.proposed.leaseYieldPct / 12, n60 = 60, cap = 450000, res = by.merchant.project.residual;
  var pv = 0; for (var k = 1; k <= n60; k++) pv += l.payment / Math.pow(1 + r, k);
  pv += res / Math.pow(1 + r, n60);
  assert.ok(Math.abs(pv - cap) < 1, 'PV of the lease at the yield is the price: ' + pv);
  assert.equal(l.partnerIrr, out.proposed.leaseYieldPct);
  assert.equal(by.stress.leaseback.payment, l.payment, 'the payment does not move with the case');
});
test('the downside says so: under water somewhere, never flattered', function () {
  assert.ok(by.stress.leaseback.shortMonths > 0 && by.stress.revshare.clearskyNegMonths > 0);
  assert.ok(by.stress.owner.partnerMultiple < 1, 'the partner does not get his capital back in the stress case');
});
console.log('all ' + n + ' partner-split checks passed');
