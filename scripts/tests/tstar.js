/* Site finder — starring keeps a site, it does not file it away.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Reported from the field: press the star and the card vanishes out of the
   panel, and the only way back to the site you were mid-way through working
   is the Starred tab. Two separate causes, both asserted here:

     1. starSite() cleared ST.current, so starring the site you were LOOKING
        AT deleted the lookup that put it on screen.
     2. filtered() applied the prospecting filters to starred rows, so a site
        kept deliberately still disappeared behind a minimum kW set to find
        other ones.

   What must stay true is the thing those two fixes could easily undo: the
   starred list is not prepended to every view. That was the original defect
   — the working panel filling with already-filed sites — and a fix for the
   disappearing card that brings it back is not a fix. */
'use strict';
var fs = require('fs'), path = require('path'), assert = require('assert');
var html = fs.readFileSync(
  path.join(__dirname, '..', '..', 'clearsky-sitefinder.html'), 'utf8');
var fails = 0;
function ok(name, fn) {
  try { fn(); console.log('  ✓ ' + name); }
  catch (e) { fails++; console.log('  ✗ ' + name + '\n      ' + e.message); }
}
function fn(name, stop) {
  var body = html.slice(html.indexOf('function ' + name));
  return body.slice(0, body.indexOf(stop));
}

console.log('star keeps the site in the finder');

ok('starring the current lookup does not clear it', function () {
  var body = fn('starSite', '\n  /*');
  assert(/ST\.saved\.unshift\(rec\)/.test(body), 'starSite no longer keeps the record');
  assert(!/ST\.current\s*=\s*null/.test(body),
    'starSite still clears ST.current — the card will vanish the moment it is starred');
});

ok('dismissing a site DOES still clear it', function () {
  var body = fn('hideSite', '\n  function unhideAll');
  assert(/ST\.current\s*=\s*null/.test(body),
    'hiding a site must remove it from in front of the rep — that is what hiding is');
});

ok('a starred row is exempt from the prospecting filters', function () {
  var body = fn('filtered', '\n    ST.cut = cut;');
  var i = body.indexOf('if (isSaved(r.id)) return true;');
  assert(i > 0, 'filtered() applies the filters to starred rows');
  assert(i < body.indexOf('cut.kw++'),
    'the exemption sits below the kW cut, so a starred site is still dropped by it');
});

ok('an exempt row is not counted as a filter casualty', function () {
  var body = fn('filtered', '\n    ST.cut = cut;');
  var line = body.split('\n').filter(function (l) {
    return l.indexOf('isSaved(r.id)) return true') >= 0;
  })[0];
  assert(line && !/cut\./.test(line),
    'the starred exemption increments a cut counter, so "0 of 1" will lie');
});

ok('the star is still viewport-bound, not pinned to every view', function () {
  var body = html.slice(html.indexOf('var vb = map.getBounds();'));
  body = body.slice(0, body.indexOf('var sn = document.getElementById("savedN")'));
  assert(/rows = \(ST\.view === "saved"\)\s*\?\s*saved/.test(body),
    'the Starred tab no longer shows the saved list');
  assert(!/\.concat\(saved/.test(body) && !/saved\.concat\(/.test(body),
    'the saved list is being prepended to the working views again — that is the '
    + 'defect this design removed: the panel fills with already-filed sites');
});

ok('the starred site and the lookup are one record, so a refresh updates both',
  function () {
    var body = fn('starSite', '\n  /*');
    assert(/ST\.saved\.unshift\(rec\)/.test(body) && !/JSON\.parse\(JSON\.stringify/.test(body),
      'the starred copy is cloned, so refreshing the lookup will not update it');
  });

ok('the card shows which state it is in', function () {
  assert(/isSaved\(r\.id\) \? "\\u2605" : "\\u2606"/.test(html),
    'the card star does not fill when the site is starred');
});

console.log(fails ? '\n' + fails + ' failed' : '\nall passed');
process.exit(fails ? 1 : 0);
