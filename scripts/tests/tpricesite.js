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

/* ── STRAIGHT INTO THE COMED MAP ──────────────────────────────────────
   Wanting the utility's map for the site you are looking at used to mean
   copying the address into a second tool by hand, for a point this page
   already knows to five decimal places. */
ok('the drawer links into the ComEd map with the site on the URL', function () {
  assert(/function comedUrl/.test(html), 'nothing builds a ComEd link');
  var fn = html.slice(html.indexOf('function comedUrl'));
  fn = fn.slice(0, fn.indexOf('\n  function gridAtlasHtml'));
  ['addr=', 'lat=', 'lon=', 'org=', 'return='].forEach(function (k) {
    assert(fn.indexOf(k) > 0, 'the ComEd link omits ' + k);
  });
  assert(/\/comed-capacity\?/.test(fn), 'it does not point at the ComEd tool');
});

ok('coordinates are sent, not just the address', function () {
  /* Address-only would put the site through a geocoder a second time, and a
     second geocode of the same string lands a block away often enough to
     matter when the question is what the grid looks like at ONE point. */
  var est = fs.readFileSync(path.join(ROOT, 'comed-capacity.html'), 'utf8');
  var seg = est.slice(est.indexOf('ARRIVING FROM THE SITE FINDER'));
  seg = seg.slice(0, 2000);
  assert(/isFinite\(lat\)&&isFinite\(lon\)/.test(seg),
    'the ComEd tool does not prefer the coordinates it was handed');
  assert(/analyze\(L\.latLng\(lat,lon\)\)/.test(seg),
    'it centres on the point without analysing it');
  assert(/\}\s*else if\(addr\)\{\s*geocode\(addr\)/.test(seg),
    'an address-only link is not honoured');
  assert(/getElementById\("q"\)\.value=addr/.test(seg),
    'the address is not put in the search box, so the rep cannot see what is loaded');
});

ok('the two grid sources are not both styled as the primary action', function () {
  /* One is the utility's published hosting capacity; the other is national
     transmission data and is NOT circuit capacity. A rep who reads the
     second as the first has a number that does not mean what they think. */
  assert(/id="gaRun"[\s\S]{0,80}class="ghost"|class="ghost" id="gaRun"/.test(html),
    'the national-data button still reads as a primary action');
});

/* ── EVERY DELEGATED CONTROL HAS A LISTENER THAT CAN SEE IT ───────────
   The click handler was bound to #cards alone while three controls were
   rendered into the DRAWER: the Grid Atlas lookup, the duration buttons in
   the sizer, and "reset to the full circuit". Their clicks landed on an
   element the listener never saw, so all three did nothing — no error, no
   console message, just furniture that looks like a button.

   This checks the property rather than the three instances: every
   data-* action the page renders must be reachable from a container that
   actually has the handler. */
ok('the delegated click handler is bound to the drawer as well as the list',
  function () {
    assert(/function onDelegatedClick/.test(html),
      'the handler is still an anonymous function bound to one container');
    assert(/getElementById\("cards"\)\.addEventListener\("click", onDelegatedClick\)/.test(html),
      'the list no longer gets the handler');
    assert(/getElementById\("dBody"\)[\s\S]{0,120}addEventListener\("click", onDelegatedClick\)/.test(html),
      'the DRAWER does not get the handler, so its buttons are inert');
  });

ok('every drawer action the page renders is one the handler answers', function () {
  /* Rendered actions vs handled actions, compared as sets. A new control
     added to the drawer without a branch here shows up as a failure rather
     than as a button nobody notices is dead. */
  var rendered = {}, m;
  var re = /data-(ga-id|hrs|szreset|cost-id|star|hide|phsug)=/g;
  while ((m = re.exec(html))) rendered['data-' + m[1]] = true;
  var missing = Object.keys(rendered).filter(function (a) {
    if (html.indexOf('closest("[' + a + ']")') > 0) return false;
    if (html.indexOf('getAttribute("' + a + '")') > 0) return false;
    return true;
  });
  assert.deepStrictEqual(missing, [],
    'rendered but never handled: ' + missing.join(', '));
});

/* ── ONE DURATION DEFAULT, READ FROM ONE PLACE ────────────────────────
   The finder and the estimator each used to carry their own literal 2. A
   default that lives in two files is a default that will eventually be two
   different defaults, and every kWh figure on the platform depends on it. */
ok('the site finder takes its duration default from the shared model', function () {
  assert(/window\.OmegaCostModel && window\.OmegaCostModel\.DEFAULT_HOURS/.test(html),
    'the finder does not read DEFAULT_HOURS from the cost model');
  assert(!/hours:\s*2\b/.test(html),
    'a hard-coded 2-hour default is still in the site finder');
  assert(!/at 2 h\b/.test(html.replace(/\/\*[\s\S]*?\*\//g, ' ')),
    'a visible "at 2 h" string survives in the site finder');
});

ok('the model exports the default AFTER declaring it', function () {
  /* It was assigned onto the exports object above its own `var`, where
     hoisting gives the name but not the value — so it exported undefined
     and every caller fell back to its own literal, which is the drift this
     shared file exists to stop. */
  var src = fs.readFileSync(path.join(ROOT, 'omega-cost-model.js'), 'utf8');
  assert(src.indexOf('var DEFAULT_HOURS') < src.indexOf('M.DEFAULT_HOURS'),
    'DEFAULT_HOURS is exported before it is assigned');
  global.window = global;
  var M2 = require(path.join(ROOT, 'omega-cost-model.js'));
  assert.strictEqual(M2.DEFAULT_HOURS, 4, 'the exported default is ' + M2.DEFAULT_HOURS);
});

/* ── WHAT COULD ACTUALLY GO HERE ──────────────────────────────────────
   The panel said what the circuit allows and what it would cost, and never
   what a rep could BUY. The gap between those is where the surprise lives:
   a supplier sells a 5 MWh block, so a site with room for 3.8 MWh has one
   real option and it is not 3.8 MWh. */
ok('the drawer offers battery options sized to the opportunity', function () {
  assert(/function fitOptions\b/.test(html), 'nothing computes what fits');
  assert(/fitOptionsHtml\(r\) \+/.test(html),
    'the block is not rendered into the drawer');
  var fn = html.slice(html.indexOf('function fitOptions('));
  fn = fn.slice(0, fn.indexOf('function fitOptionsHtml'));
  assert(/_orgVendors/.test(fn),
    'options are not built from the organisation\'s own supplier records');
  assert(/blockMwh/.test(fn), 'block size is ignored, so every option is a fiction');
});

ok('it ships NO catalogue of its own', function () {
  /* An invented product is worse than no product, because somebody will
     quote it. Every option must come off a record the org entered. */
  var fn = html.slice(html.indexOf('function fitOptions('));
  fn = fn.slice(0, fn.indexOf('function fitOptionsHtml'));
  assert(!/\b(CATL|Gotion|Tesla|Megapack|Sungrow|BYD)\b/.test(fn),
    'a product name is hard-coded into the fit logic');
  assert(/if \(!priced && !blockKwh\) continue/.test(fn),
    'a supplier with nothing on file still produces an option');
});

ok('overshooting the target is described as duration, not waste', function () {
  /* The circuit caps kW and does not care about kWh. A block bigger than
     the target is a LONGER system at the same power, which is usually
     worth more — calling it stranded would be wrong here, even though the
     same overshoot IS stranded capacity when you are billed for a block. */
  var fn = html.slice(html.indexOf('function fitOptionsHtml'));
  fn = fn.slice(0, fn.indexOf('function computeEstimate'));
  assert(/caps kW, not kWh/.test(fn),
    'the overshoot is not explained in terms of duration');
  assert(/short of the target/.test(fn),
    'an option that undershoots is not called out');
});

ok('a hold can be any whole kW, not a multiple of 25', function () {
  /* step="25" with min="1" made the valid values 1, 26, 51 … so the browser
     refused 944 — the exact figure the panel had just said was available. */
  assert(/id="rKw" type="number" min="1" step="1"/.test(html),
    'the hold field still rejects the number the panel offers');
});

/* ── THE ADDRESS LOOKUP IS NOT AN ENRICHED RECORD ─────────────────────
   enrich() attaches claims and mine to every row a search builds. The
   address lookup builds its own record by hand — no parcel, no ledger rows
   — and has neither. liveClaims read r.claims.length on the first line, so
   searching an address threw inside drawerHtml and the drawer half-drew.
   Address search is the front door of this tool. */
ok('record arrays are read through a guard, never bare', function () {
  /* Comments stripped: the fix is explained in one, and an explanation of a
     bug must not read as the bug. This is the third test in this file to
     learn that lesson. */
  var code = html.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
  assert(/function claimsOf\(r\)/.test(code) && /function mineOf\(r\)/.test(code),
    'the guards are gone');
  assert(!/\br\.claims\.length/.test(code),
    'a bare r.claims.length is back — the address lookup will throw again');
  assert(!/\br\.mine\.length/.test(code),
    'a bare r.mine.length is back');
});

ok('the address lookup is normalised the same way every other record is',
  function () {
    /* Guarding derived fields one at a time is losing — the next field
       added to the drawer breaks the lookup again. It goes through enrich()
       now, so it has cst, claims, mine and whatever comes next. */
    var seg = html.slice(html.indexOf('circ: v.state, sz: v.size, src: "lookup"'));
    seg = seg.slice(0, 1600);
    assert(/try \{ rec = enrich\(rec\); \}/.test(seg),
      'the lookup record is still handed to the drawer without enrich()');
    assert(/catch \(eEnrich\)/.test(seg),
      'an enrich failure would take the whole lookup down');
  });

ok('the card names the battery that fits', function () {
  assert(/function fitBest\(r\)/.test(html), 'nothing picks a best-fit option');
  assert(/fitLineHtml\(r\) \+/.test(html), 'the card does not render it');
  var fn = html.slice(html.indexOf('function fitLineHtml'));
  fn = fn.slice(0, fn.indexOf('function fitOptionsHtml'));
  assert(/if \(!o\) return "";/.test(fn),
    'the card line is not silent when nothing is on file — a row of ' +
    'apologies down a list of twenty sites is worse than no row');
  assert(/fitOptions\(r\)/.test(html.slice(html.indexOf('function fitBest'), html.indexOf('function fitLineHtml'))),
    'the card uses a different source from the drawer, so they can disagree');
});

ok('the hand-built lookup record still lacks those fields', function () {
  /* If it ever gains them the guards stay anyway, but this is the reason
     they exist and it is worth failing loudly if the shape changes. */
  var rec = html.slice(html.indexOf('id: "addr:" + lat.toFixed(5)'));
  rec = rec.slice(0, rec.indexOf('ST.sel = rec'));
  assert(!/\bclaims:/.test(rec) && !/\bmine:/.test(rec),
    'the lookup record now sets claims/mine — re-check the guards are still needed');
});

console.log(fails ? '\n' + fails + ' failed' : '\nall passed');
process.exit(fails ? 1 : 0);
