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

/* The two entry points answer two different questions and must not drift
   back into each other. The CARD screens a site without leaving the map;
   the DRAWER hands it to the estimator for a proper review — the nine
   drivers, the schedule, and Print/PDF. Collapsing either into the other
   is a regression, in one direction or the other, so both are pinned. */
ok('the drawer button opens the estimator, already costed', function () {
  var seg = html.slice(html.indexOf('var cs = document.getElementById("costSite")'));
  seg = seg.slice(0, 420);
  assert(/costInEstimator\(r\)/.test(seg),
    'the drawer button does not open the estimator');
  assert(/if \(!_estimates\[r\.id\]\) priceInPlace\(r\)/.test(seg),
    'it opens the estimator without pricing first, so the packet carries no figure');
});

ok('the drawer offers the estimator, not two equal unlabelled buttons', function () {
  /* Matched on the closing tag: the label is built by concatenation, so
     ">Open the estimator<" never appears contiguously in the source. */
  assert(/Open the estimator<\/button>/.test(html),
    'the primary action is not named "Open the estimator"');
  assert(!/<button id="dPacket"/.test(html),
    'Download the packet is still a button competing with the estimator');
});

ok('the card button prices in place too', function () {
  var m = html.match(/data-cost-id"\)\][\s\S]{0,600}?priceInPlace\(cr\)/);
  assert(m, 'the card [data-cost-id] handler does not reach priceInPlace');
});

ok('every function the price path calls is defined in this file', function () {
  var body = html.slice(html.indexOf('function computeEstimate'));
  body = body.slice(0, body.indexOf('\n  function costInEstimator'));
  /* Strip comments and string literals FIRST. Scanning raw source made this
     read English prose as code — a comment containing "... stores (the)"
     was reported as a call to an undefined stores(). The check is worth
     keeping; the tokenizer had to stop being naive. */
  var code = body
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""');
  var called = {}, m, re = /([A-Za-z_$][\w$]*)\s*\(/g;
  while ((m = re.exec(code))) called[m[1]] = 1;
  ['function', 'if', 'return', 'catch', 'typeof', 'price', 'Math', 'Date',
   'toLocaleString'].forEach(function (k) { delete called[k]; });
  var missing = Object.keys(called).filter(function (n) {
    if (/^(function|if|for|while|switch|catch|return|typeof|new)$/.test(n)) return false;
    if (/^(String|Number|Object|Array|JSON|parseInt|parseFloat|isFinite|isNaN)$/.test(n)) return false;
    if (new RegExp('function\\s+' + n + '\\s*\\(').test(html)) return false;
    if (new RegExp('\\b' + n + '\\s*=\\s*function').test(html)) return false;
    if (new RegExp('\\.' + n + '\\s*\\(').test(code)) return false;   /* a method */
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

/* ── THE DEPENDENCY, NOT JUST THE CODE PATH ───────────────────────────
   Every test above passed while this feature was completely broken in the
   browser: the page never loaded omega-cost-model.js, so window.OmegaCostModel
   was undefined, computeEstimate() returned null, and every press fell
   through to opening the estimator in another tab — the exact behaviour the
   inline pricing existed to remove.

   The tests checked that the code CALLED the model. Nothing checked that
   the model was there to call. Any page that prices against a shared
   library must load it, and that is now asserted rather than assumed. */
['clearsky-sitefinder.html', 'clearsky-cost-estimator.html'].forEach(function (f) {
  ok(f + ' loads the cost model it prices with', function () {
    var src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert(/OmegaCostModel/.test(src), f + ' does not use the model at all');
    assert(/<script[^>]+src="\/?omega-cost-model\.js"/.test(src),
      f + ' calls OmegaCostModel but never loads omega-cost-model.js — '
        + 'the global will be undefined in a browser');
  });
});

ok('the site finder prices from the org quote, not just the generic rate', function () {
  assert(/ratesFromVendor\(_orgPricing\)/.test(html),
    'computeEstimate does not pass the organisation\'s supplier pricing, so the '
    + 'same site prices differently here than in the estimator');
  assert(/toolData"\)\.doc\(ORG\)/.test(html),
    'nothing reads toolData/{orgId}/tools/costestimator');
});

ok('the finder never WRITES the org pricing', function () {
  /* It is a consumer. A screen that could quietly edit the organisation's
     battery pricing is a screen nobody should trust. */
  var seg = html.slice(html.indexOf('function loadOrgPricing'));
  seg = seg.slice(0, seg.indexOf('\n  function computeEstimate'));
  assert(!/\.set\(|\.update\(|saveToolData/.test(seg),
    'loadOrgPricing can write to the org record');
});

ok('phase is suggested from the load, and never auto-confirmed', function () {
  assert(/function phaseSuggest/.test(html), 'no phase suggestion exists');
  var use = html.slice(html.indexOf('var use = document.getElementById("phSugUse")'));
  use = use.slice(0, 320);
  assert(/setPhase\(r\.id, use\.getAttribute\("data-phsug"\), false/.test(use),
    'accepting the suggestion marks it CONFIRMED — a tool\'s opinion is not a meter photo');
});

ok('phase is never used to guess the interconnection voltage', function () {
  /* Comments stripped: the removal is explained in one, and a note about a
     mistake must not read as the mistake. */
  var code = html.replace(/\/\*[\s\S]*?\*\//g, ' ')
                 .replace(/<!--[\s\S]*?-->/g, ' ');
  assert(!/3p480/.test(code),
    'the dead "3p480" phase test is back; phase does not determine voltage — '
      + 'three-phase service can be 208 V, 480 V or a primary tie');
});

/* ── THE HANDOFF ITSELF ───────────────────────────────────────────────
   The packet used to travel in sessionStorage, which a new tab only
   inherits when it was opened by window.open WITH an opener. A pop-up
   blocker, a middle-click, or a browser that turns the pop-up into a
   same-tab navigation all break that, and the estimator lands on a URL
   naming a key that does not exist in its world: "NO PACKET". */
ok('the packet travels in localStorage, which every tab can read', function () {
  var seg = html.slice(html.indexOf('function costInEstimator'));
  seg = seg.slice(0, seg.indexOf('\n  /* Shown in the drawer'));
  assert(/localStorage\.setItem\(key/.test(seg),
    'the packet is not written where a second tab can read it');
  assert(!/sessionStorage\.setItem/.test(seg),
    'it is still writing the packet to sessionStorage');
});

ok('a blocked pop-up keeps the packet and offers a link', function () {
  var seg = html.slice(html.indexOf('function costInEstimator'));
  seg = seg.slice(0, seg.indexOf('\n  /* Shown in the drawer'));
  assert(!/removeItem/.test(seg),
    'a blocked pop-up still throws the packet away');
  assert(/packetLink\(url\)/.test(seg),
    'a blocked pop-up leaves the rep with no way through');
});

ok('stale packets are pruned rather than accumulated', function () {
  assert(/function prunePackets/.test(html), 'nothing prunes old packets');
  assert(/prunePackets\(\);[\s\S]{0,120}var key = "cs-packet-"/.test(html),
    'pruning does not run when a packet is written');
});

ok('the estimator reads localStorage first and still accepts the old shelf',
  function () {
    var est = fs.readFileSync(path.join(ROOT, 'clearsky-cost-estimator.html'), 'utf8');
    var seg = est.slice(est.indexOf('function adoptHandoff'));
    seg = seg.slice(0, seg.indexOf('loadPacket(obj)'));
    assert(/localStorage\.getItem\(q\)/.test(seg), 'the estimator ignores localStorage');
    assert(/sessionStorage\.getItem\(q\)/.test(seg),
      'the sessionStorage fallback is gone, so a tab opened by the old build breaks');
    assert(/localStorage\.removeItem\(q\)/.test(seg),
      'the adopted packet is not cleared, so the next open gets a stale site');
  });

ok('the printed estimate keeps the schedule', function () {
  /* The Gantt scrolls inside .gWrap on screen. On paper there is nothing to
     scroll, so an auto overflow cuts the chart at the page width and the
     weeks past that edge vanish with no sign they were there. */
  var est = fs.readFileSync(path.join(ROOT, 'clearsky-cost-estimator.html'), 'utf8');
  var pr = est.slice(est.indexOf('@media print{'));
  pr = pr.slice(0, pr.indexOf('\n  }'));
  assert(/\.gWrap\{overflow:visible\}/.test(pr),
    'the Gantt is still clipped in print');
  assert(/\.gRow\{break-inside:avoid\}/.test(pr),
    'schedule rows can split across a page break');
});

console.log(fails ? '\n' + fails + ' failed' : '\nall passed');
process.exit(fails ? 1 : 0);
