#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   scripts/test-office-sw.js — the three apps' service workers (LIVE-7)
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   The site serves clean URLs: /office/app.html answers with a 308 to
   /office/app. The worker used to pre-cache the .html address, so what it
   kept was a response that came through a redirect — and a page load that
   is answered with one shows the browser's error page instead of the app,
   which is exactly when the shell was meant to help (offline). This runs
   office/app-sw.js in a fresh context with a fake network and cache:

   · nothing it pre-caches is an address that redirects (.html), and a
     redirected response is never stored, on install or later;
   · offline, a page load (any ?org=, or the old .html address) gets the
     app page as the network last served it, not a redirect;
   · a new version drops the older office shells and no other app's.

     node scripts/test-office-sw.js
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm');
/* the three apps' workers, one pattern (the office app's first; the plant
   and customer apps' the same fix) */
var APPS = [
  { name: 'office', file: 'office/app-sw.js', page: '/office/app', shell: 'office-app-shell-v3', prefix: 'office-app-shell-' },
  { name: 'plant', file: 'plant/app-sw.js', page: '/plant/app', shell: 'plant-app-shell-v3', prefix: 'plant-app-shell-' },
  { name: 'customer', file: 'portals/customer/app-sw.js', page: '/portals/customer/app', shell: 'customer-app-shell-v2', prefix: 'customer-app-shell-' }];
var SRC = '', APP = APPS[0];
var count = 0;
function test(name, fn) { return Promise.resolve().then(fn).then(function () { count++; console.log('  ok   ' + name); }); }

var ORIGIN = 'https://silmarillion.clearskyomega.com';
/* the site as Vercel serves it: *.html → 308 to the clean address, which answers 200 */
function site(offline) {
  return function (req) {
    if (offline.on) return Promise.reject(new TypeError('Failed to fetch'));
    var u = new URL(typeof req === 'string' ? req : req.url, ORIGIN);
    var redirected = /\.html$/.test(u.pathname);
    return Promise.resolve(res(u.pathname.replace(/\.html$/, ''), redirected));
  };
}
function res(body, redirected) { return { ok: true, status: 200, redirected: !!redirected, type: 'basic', body: body, clone: function () { return res(body, redirected); } }; }
function worker(keys) {
  var handlers = {}, offline = { on: false }, stores = {};
  (keys || []).forEach(function (k) { stores[k] = {}; });
  function key(r) { var u = new URL(typeof r === 'string' ? r : r.url, ORIGIN); return u.pathname; }
  var caches = {
    open: function (name) { var s = stores[name] = stores[name] || {}; return Promise.resolve({ put: function (r, v) { s[typeof r === 'string' ? r : key(r) + new URL(r.url).search] = v; return Promise.resolve(); }, add: function () { throw new Error('the worker must not c.add(): it cannot refuse a redirect'); } }); },
    keys: function () { return Promise.resolve(Object.keys(stores)); },
    delete: function (k) { delete stores[k]; return Promise.resolve(true); },
    match: function (r, o) { var want = typeof r === 'string' ? r : key(r) + (o && o.ignoreSearch ? '' : new URL(r.url).search); var hit; Object.keys(stores).forEach(function (n) { if (!hit && stores[n][want]) hit = stores[n][want]; }); return Promise.resolve(hit); }
  };
  var self = { addEventListener: function (t, f) { handlers[t] = f; }, skipWaiting: function () { return Promise.resolve(); }, clients: { claim: function () { return Promise.resolve(); } } };
  var ctx = { self: self, caches: caches, fetch: site(offline), URL: URL, location: new URL(ORIGIN + '/' + APP.file), Promise: Promise, Response: { error: function () { return { error: true }; } } };
  vm.runInNewContext(SRC, ctx);
  function event(t, extra) { var done = []; var e = Object.assign({ waitUntil: function (p) { done.push(p); }, respondWith: function (p) { done.push(p); e.answer = p; } }, extra || {}); handlers[t](e); return Promise.all(done).then(function () { return e.answer; }); }
  return { ctx: ctx, stores: stores, offline: offline, install: function () { return event('install'); }, activate: function () { return event('activate'); },
    get: function (p, mode) { return event('fetch', { request: { url: ORIGIN + p, method: 'GET', mode: mode || 'no-cors' } }); } };
}

async function run(app) {
  APP = app; SRC = fs.readFileSync(path.join(__dirname, '..', app.file), 'utf8');
  var P = app.page;
  console.log('\nthe ' + app.name + ' app\'s service worker (LIVE-7)');
  await test('nothing pre-cached is an address that redirects; the page is kept under its clean address', async function () {
    var w = worker(), files = w.ctx.FILES;
    assert.ok(Array.isArray(files) && files.length >= 5);
    assert.ok(!files.some(function (f) { return /\.html$/.test(f); }), 'no .html in the shell list: ' + files.join(', '));
    assert.equal(w.ctx.SHELL, app.shell);
    await w.install();
    var kept = w.stores[w.ctx.SHELL];
    assert.ok(kept[P] && kept[P].redirected === false);
    assert.ok(Object.keys(kept).every(function (k) { return !kept[k].redirected; }), 'no redirected response in the shell');
    assert.ok(kept['/omega-logic-signin.js'] && kept['/omega-auth-errors.js'], 'the sign-in the app opens on is in the shell');
  });
  await test('a redirected response is never stored, even when the network hands one back', async function () {
    var w = worker(); await w.install();
    var before = JSON.stringify(Object.keys(w.stores[w.ctx.SHELL]).sort());
    var r = await w.get(P + '.html?org=cleancell.us', 'navigate');
    assert.equal(r.redirected, true, 'the browser still gets what the network said');
    assert.equal(w.stores[w.ctx.SHELL][P].redirected, false, 'the kept page is still the clean one');
    assert.equal(JSON.stringify(Object.keys(w.stores[w.ctx.SHELL]).sort()), before);
    assert.equal(w.ctx.keepable({ ok: true, status: 200, redirected: true, type: 'basic' }), false);
    assert.equal(w.ctx.keepable({ ok: true, status: 200, redirected: false, type: 'opaqueredirect' }), false);
    assert.equal(w.ctx.keepable({ ok: false, status: 404, redirected: false, type: 'basic' }), false);
  });
  await test('offline, any page load of the app gets the app page (never a redirect or the browser\'s error page)', async function () {
    var w = worker(); await w.install(); w.offline.on = true;
    var a = await w.get(P + '?org=cleancell.us', 'navigate'), b = await w.get(P + '.html', 'navigate'), c = await w.get(P + '?tab=menu', 'navigate');
    [a, b, c].forEach(function (x) { assert.ok(x && x.body === P && x.redirected === false); });
    var js = await w.get('/omega-logic-theme.js'); assert.equal(js.body, '/omega-logic-theme.js');
    var miss = await w.get('/not-in-the-shell.js'); assert.ok(miss && miss.error === true, 'a file it never kept is a network error, not the app page');
    var api = await w.get('/api/logic-office?org=cleancell.us'); assert.equal(api, undefined, 'data is never served by the worker');
  });
  await test('the page fetched online is kept for its clean address whatever its ?org=', async function () {
    var w = worker(); await w.activate();
    await w.get(P + '?org=cleancell.us', 'navigate');
    assert.ok(w.stores[w.ctx.SHELL][P], 'stored under ' + P);
    w.offline.on = true; var r = await w.get(P + '?org=other.example', 'navigate'); assert.equal(r.body, P);
  });
  await test('a new version drops the older ' + app.name + ' shells, and only those', async function () {
    var others = APPS.filter(function (x) { return x !== app; }).map(function (x) { return x.prefix + 'v1'; });
    var w = worker([app.prefix + 'v1', app.prefix + 'v0'].concat(others));
    await w.activate();
    assert.deepEqual(Object.keys(w.stores).sort(), others.slice().sort());
  });
}
(async function () {
  for (var i = 0; i < APPS.length; i++) await run(APPS[i]);
  console.log('\n' + count + ' service worker checks passed. No network.');
})().catch(function (e) { console.error(e); process.exit(1); });
