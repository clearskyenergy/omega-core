/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var fs = require('fs'), vm = require('vm'), assert = require('assert');
var html = fs.readFileSync(require('path').join(__dirname, '../workspace.html'), 'utf8');
var source = html.slice(html.indexOf('var signInTimer = null;'), html.indexOf('function bind(user'));
function fixture(had) {
  var callback, timer, delay, navigated, bound;
  var auth = { currentUser: null, onAuthStateChanged: function (f) { callback = f; } };
  vm.runInNewContext(source, { auth: auth, OmegaTenant: { hadSession: function () { return had; } }, window: { OmegaTenant: { hadSession: function () { return had; } }, location: { replace: function (url) { navigated = url; } } },
    setTimeout: function (fn, ms) { timer = fn; delay = ms; return 1; }, clearTimeout: function () { timer = null; }, bind: function (u) { bound = u; } });
  return { emit: function (u) { auth.currentUser = u; callback(u); }, tick: function () { if (timer) timer(); }, url: function () { return navigated; }, delay: function () { return delay; }, bound: function () { return bound; } };
}
var f = fixture(false); f.emit(null); assert.equal(f.delay(), 1600); f.tick(); assert.equal(f.url(), '/login.html');
f = fixture(true); f.emit(null); assert.equal(f.delay(), 8000); var user = { uid: 'restored' }; f.emit(user); f.tick(); assert.equal(f.url(), undefined); assert.equal(f.bound(), user);
console.log('PASS single signed-out event reaches login; restored session cancels redirect');
