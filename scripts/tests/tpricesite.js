/* Site finder — "Price this site" prices in place.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   The point of this test is the WIRING, not the arithmetic: tcostparity.js
   already proves omega-cost-model.js and the estimator agree to the cent.
   What broke here before was the path — a button that opened a second tool,
   and a handler that called a function nobody had written. So this asserts
   that the sitefinder's price button runs the inline path, that the inline
   path calls something the file actually defines, and that the model answers
   the two shapes the page can hand it: a circuit-derived size, and the
   stated assumption used when no circuit is attributed. */
'use strict';
var fs = require('fs'), path = require('path'), assert = require('assert');
var ROOT = path.join(__dirname, '..', '..');
var html = fs.readFileSync(path.join(ROOT, 'clearsky-sitefinder.html'), 'utf8');
var fails = 0;
function ok(name, fn) {
  try { fn(); console.log('  ✓ ' + name); }
  catch (e) { fails++; console.log('  ✗ ' + name + '\n      ' + e.message); }
}

console.log('price-this-site');

ok('the drawer button prices in place, not in another tab', function () {
  assert(/cs\.onclick = function \(\) \{ priceInPlace\(r\); \}/.test(html),
    'the drawer #costSite button no longer calls priceInPlace');
});

ok('the card button prices in place too', function () {
  var m = html.match(/data-cost-id"\)\][\s\S]{0,600}?priceInPlace\(cr\)/);
  assert(m, 'the card [data-cost-id] handler does not reach priceInPlace');
});

ok('every function the price path calls is defined in this file', function () {
  var body = html.slice(html.indexOf('function computeEstimate'));
  body = body.slice(0, body.indexOf('\n  function costInEstimator'));
  var called = {}, m, re = /([A-Za-z_$][\w$]*)\s*\(/g;
  while ((m = re.exec(body))) called[m[1]] = 1;
  ['function', 'if', 'return', 'catch', 'typeof', 'price', 'Math', 'Date',
   'toLocaleString'].forEach(function (k) { delete called[k]; });
  var missing = Object.keys(called).filter(function (n) {
    if (/^(String|Number|Object|Array|JSON|parseInt|parseFloat|isFinite|isNaN)$/.test(n)) return false;
    if (new RegExp('function\\s+' + n + '\\s*\\(').test(html)) return false;
    if (new RegExp('\\b' + n + '\\s*=\\s*function').test(html)) return false;
    if (new RegExp('\\.' + n + '\\s*\\(').test(body)) return false;   /* a method */
    return true;
  });
  assert.deepStrictEqual(missing, [],
    'priceInPlace calls ' + missing.join(', ') + ' — not defined anywhere in the file');
});

ok('the card handler does not call the isOpen() that never existed', function () {
  assert(!/\bisOpen\s*\(/.test(html), 'isOpen( is still referenced');
});

/* ── the two shapes the model is asked for ─────────────────────────────── */
var M = require(path.join(ROOT, 'omega-cost-model.js'));
var UNKNOWN = {
  volt: '', poiFt: null, padArea: null, soil: '', ahj: '', labor: '',
  utilityUpgrade: '', carryUpgrade: false, quoteDate: ''
};
function priced(kw, hours, extra) {
  var input = { kw: kw, hours: hours };
  Object.keys(UNKNOWN).forEach(function (k) { input[k] = UNKNOWN[k]; });
  if (extra) Object.keys(extra).forEach(function (k) { input[k] = extra[k]; });
  return M.price(input);
}

ok('the stated assumption (1 MW / 2 h, nothing answered) prices', function () {
  var e = priced(1000, 2);
  assert(e && e.total, 'no estimate came back');
  assert(e.total.base > 0, 'base is ' + e.total.base);
  assert(e.total.lo < e.total.base && e.total.base < e.total.hi,
    'the band does not straddle the base: ' + JSON.stringify(e.total));
  assert.strictEqual(e.kwh, 2000, 'kWh is ' + e.kwh);
});

ok('a circuit-derived size prices, and bigger costs more per site', function () {
  var small = priced(1000, 2), big = priced(4000, 2);
  assert(big.total.base > small.total.base, 'a 4 MW site is not dearer than 1 MW');
  assert(big.perKwh.base < small.perKwh.base,
    'four times the energy is not cheaper per kWh — check the scaling');
});

ok('480 V, which is the only driver this page can answer, moves the number',
  function () {
    var unknown = priced(1000, 2), at480 = priced(1000, 2, { volt: '480' });
    assert(at480.total.base !== unknown.total.base,
      'declaring 480 V changed nothing, so the page is passing it nowhere');
  });

ok('the tool never quotes a number without its class', function () {
  var body = html.slice(html.indexOf('function computeEstimate'));
  body = body.slice(0, body.indexOf('\n  function costInEstimator'));
  assert(/estimateClass:\s*"Class 5/.test(body),
    'an inline price is a concept screen and must be labelled Class 5');
  assert(/accuracyLow:\s*-0\.30/.test(body) && /accuracyHigh:\s*0\.50/.test(body),
    'the Class 5 accuracy band is missing');
});

ok('the packet carries the estimate, class and band together', function () {
  var pk = html.slice(html.indexOf('function sitePacket'));
  pk = pk.slice(0, pk.indexOf('\n  function downloadPacket'));
  assert(/estimate: \(function \(\)/.test(pk), 'the packet has no estimate section');
  ['estimateClass', 'accuracyLow', 'accuracyHigh', 'stillUnanswered', 'notAQuote']
    .forEach(function (k) {
      assert(pk.indexOf(k) > 0, 'the packet estimate omits ' + k);
    });
});

ok('exporting a packet prices the site if nobody pressed the button',
  function () {
    var dp = html.slice(html.indexOf('function downloadPacket'));
    dp = dp.slice(0, dp.indexOf('\n  /*'));
    assert(/if \(!_estimates\[r\.id\]\)[\s\S]{0,200}computeEstimate\(r\)/.test(dp),
      'downloadPacket does not price an unpriced site');
  });

ok('the packet path cannot recurse back into itself', function () {
  var ce = html.slice(html.indexOf('function computeEstimate'));
  ce = ce.slice(0, ce.indexOf('\n  function priceInPlace'));
  assert(!/costInEstimator\(|downloadPacket\(/.test(ce),
    'computeEstimate falls back, and its fallback chain ends at downloadPacket');
});

console.log(fails ? '\n' + fails + ' failed' : '\nall passed');
process.exit(fails ? 1 : 0);
