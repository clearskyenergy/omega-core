/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   omega-design-ai.js: the address gate, and which of the autopilot's two
   entry points a launch takes. Offline; a stub DOM, no browser. */
'use strict';
var assert = require('assert');
var path = require('path');

function load(state) {
  var noop = function () {};
  var node = function () {
    return { style: {}, dataset: {}, appendChild: noop, setAttribute: noop,
             remove: noop, focus: noop, getBoundingClientRect: function () { return { width: 0, height: 0 }; } };
  };
  var doc = { readyState: 'complete', addEventListener: noop,
              getElementById: function () { return null; },
              querySelector: function () { return null; },
              createElement: node, body: { appendChild: noop } };
  var root = {
    document: doc, console: { info: noop },
    location: { origin: 'https://silmarillion.clearskyomega.com', href: '/editor', pathname: '/editor' },
    __omegaAutopilot: state || null,
    posted: null,
    postMessage: function (m) { root.posted = m; }
  };
  root.window = root;
  var prevW = global.window, prevD = global.document;
  global.window = root; global.document = doc;
  delete require.cache[require.resolve(path.join(__dirname, '../../omega-design-ai.js'))];
  require(path.join(__dirname, '../../omega-design-ai.js'));
  global.window = prevW; global.document = prevD;
  return root;
}

/* ── the address gate ────────────────────────────────────────────────────── */
var A = load().OmegaDesignAI;
['800 Progress Dr, Frederick MD 21701', '1 Elm St', 'County Route 9', '49 Progress Drive']
  .forEach(function (v) { assert.ok(A.looksLikeAddress(v), v + ' is an address'); });
['Chicago', 'Frederick', 'Maryland', 'the north field']
  .forEach(function (v) { assert.ok(!A.looksLikeAddress(v), v + ' is not an address'); });

/* ── a cold tab navigates, carrying the size it was given ────────────────── */
var cold = load(null);
assert.equal(cold.OmegaDesignAI.launch({ address: '800 Progress Dr', mw: 1.71, mwh: 3.42, mode: 'BTM' }), 'navigating');
var url = cold.location.href;
assert.ok(url.indexOf('/editor?address=') === 0, 'it navigates to the editor with an address: ' + url);
assert.ok(url.indexOf('auto=bess') > 0, 'it asks for the bess run');
assert.ok(url.indexOf('mw=1.71') > 0 && url.indexOf('mwh=3.42') > 0, 'the size rides along');
assert.ok(url.indexOf('from=button') > 0, 'the entry point is recorded');
assert.ok(url.indexOf('800%20Progress%20Dr') > 0 || url.indexOf('800+Progress+Dr') > 0, 'the address is encoded');
assert.equal(cold.posted, null, 'a cold tab posts nothing');

/* A size that was not given must not become a number in the URL — the
   autopilot stops and asks for it, which is the behaviour worth keeping. */
var noSize = load(null);
noSize.OmegaDesignAI.launch({ address: '1 Elm St', mw: null, mwh: null, mode: 'BTM' });
assert.ok(noSize.location.href.indexOf('mw=') < 0, 'no size means no mw parameter');

/* ── a tab that already finished a run is commanded, not reloaded ────────── */
var warm = load({ finished: true, stopped: false, fatal: false, centre: { lat: 39.4, lng: -77.4 } });
assert.equal(warm.OmegaDesignAI.launch({ address: 'ignored', mw: 2, mwh: 8, mode: 'FOM' }), 'commanded');
assert.equal(warm.location.href, '/editor', 'a warm tab is not thrown away');
assert.equal(warm.posted.type, 'OMEGA_AUTOPILOT_CMD', 'it uses the autopilot command channel');
assert.equal(warm.posted.auto, 'bess');
assert.equal(warm.posted.mw, 2);
assert.equal(warm.posted.mode, 'FOM');

/* Every condition the autopilot itself checks before accepting a command.
   Getting any of these wrong means the message is silently ignored and the
   button looks broken, so each one must fall back to a navigation. */
[{ finished: false, centre: { lat: 1, lng: 1 } },
 { finished: true, stopped: true, centre: { lat: 1, lng: 1 } },
 { finished: true, fatal: true, centre: { lat: 1, lng: 1 } },
 { finished: true, centre: null }].forEach(function (st, i) {
  var r = load(st);
  assert.equal(r.OmegaDesignAI.launch({ address: '1 Elm St', mode: 'BTM' }), 'navigating',
    'state ' + i + ' cannot be commanded and must navigate instead');
});

console.log('PASS: design-ai address gate, cold-tab navigation and warm-tab command channel.');
