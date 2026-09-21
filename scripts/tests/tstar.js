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
var fs = require('fs'), path = require('path'), assert = require('assert'), vm = require('vm');
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

/* Exercise the page functions with the real persistence module in scoped
   local mode. Durable records are copies, so object identity is not the
   guarantee: the current card survives and refreshed fields reach storage. */
function savedHarness() {
  var storage = {}, context = {
    ST: { saved: [], byId: {}, current: null }, _estimates: {},
    _savedBaseline: {}, _savedUnsubscribe: null, _savedAuth: '',
    _savedViewContext: '', _savedViewMode: '',
    render: function () {}, document: { getElementById: function () { return null; } },
    nearestKnown: function () { return null; }, LAY: { inTerritory: function () { return true; } },
    window: { alert: function (message) { context.lastAlert = message; }, localStorage: {
      getItem: function (k) { return storage[k] || null; },
      setItem: function (k, v) { storage[k] = v; }
    } }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../../omega-site-saves.js'), 'utf8'), context);
  ['loadSaved', 'savedWriteDone', 'syncSavedView', 'persistSaved', 'starSite',
    'isSaved', 'recordFromLookup', 'setCurrent'].forEach(function (name) {
    var body = html.slice(html.indexOf('  function ' + name + '('));
    var end = body.indexOf('\n  }');
    assert(end >= 0, 'Missing function ' + name);
    vm.runInContext(body.slice(0, end + 4), context);
  });
  var saves = context.window.OmegaSiteSaves;
  saves.onChange(context.syncSavedView);
  saves.init('test.com', { uid: 'rep', email: 'rep@test.com' }, function () {});
  return context;
}

ok('starring the current lookup does not clear it', function () {
  var c = savedHarness(), record = { id: 'site:41.00000,-87.00000', src: 'lookup', addr: 'A' };
  c.ST.current = record;
  c.starSite(record);
  assert.strictEqual(c.ST.current, record, 'the working lookup was cleared or replaced');
  assert(c.isSaved(record.id), 'star did not persist the site');
  assert.strictEqual(c.ST.saved[0].src, 'lookup', 'original source was lost');
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

ok('refreshing the lookup persists its new source fields and keeps saved decisions',
  function () {
    var c = savedHarness(), rec = { id: 'site:41.00000,-87.00000', lat: 41, lon: -87,
      addr: 'Old', src: 'lookup', feederId: 'F1', service: { phase: '3', confirmed: true },
      sizePick: { kw: 25, hours: 2 } };
    c.ST.current = rec; c.starSite(rec);
    var current = c.setCurrent({ label: 'New', parcel: null, feederId: 'F2',
      state: { nameplate: 300, queue: 40 }, rows: [], sub: 'Sub', geoSrc: 'utility' }, 41, -87);
    var saved = c.window.OmegaSiteSaves.get(rec.id);
    ['id', 'addr', 'src', 'feederId', 'lat', 'lon', 'nameplate', 'queue', 'geoSrc'].forEach(function (field) {
      assert.strictEqual(saved[field], current[field], field + ' did not refresh in durable storage');
    });
    assert.strictEqual(saved.addr, 'New');
    assert.strictEqual(current.service.phase, '3', 'refresh lost confirmed phase');
    assert.strictEqual(current.sizePick.kw, 25, 'refresh lost chosen size');
    assert.strictEqual(saved.src, 'lookup', 'refresh lost original source');
  });

ok('the card shows which state it is in', function () {
  assert(/isSaved\(r\.id\) \? "\\u2605" : "\\u2606"/.test(html),
    'the card star does not fill when the site is starred');
});

ok('save hydration does not write back and changing accounts clears saved context', function () {
  var c = savedHarness(), record = { id: 'site:41.00000,-87.00000', src: 'lookup', addr: 'A' };
  c.ST.current = record; c.starSite(record); c.ST.byId[record.id] = record;
  c._estimates[record.id] = { total: 42 };
  var saves = c.window.OmegaSiteSaves, writes = 0;
  saves.save = saves.patch = function () { writes++; };
  c.syncSavedView();
  assert.strictEqual(writes, 0, 'stream hydration fed back into persistence');
  saves.init('other.com', { uid: 'other', email: 'other@other.com' }, function () {});
  assert.strictEqual(c.ST.saved.length, 0);
  assert.strictEqual(c.ST.current, null);
  assert.strictEqual(c.ST.byId[record.id], undefined);
  assert.strictEqual(Object.keys(c._estimates).length, 0);
});

ok('detached starring explains sign-in and keeps the current lookup visible', function () {
  var c = savedHarness(); c.window.OmegaSiteSaves.detach();
  var record = { id: 'site:41.00000,-87.00000', src: 'lookup', addr: 'A' };
  c.ST.current = record; c.starSite(record);
  assert(/Sign in/.test(c.lastAlert), 'detached save silently did nothing');
  assert.strictEqual(c.ST.current, record, 'failed save discarded the working lookup');
  assert.strictEqual(c.ST.saved.length, 0);
});

console.log(fails ? '\n' + fails + ' failed' : '\nall passed');
process.exit(fails ? 1 : 0);
