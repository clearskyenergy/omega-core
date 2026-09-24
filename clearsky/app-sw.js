/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   clearsky/app-sw.js — Logic HQ's service worker. Network first, always, the
   same as the office app's: what it keeps is the SHELL, so the app opens and
   says "offline" instead of a browser error page. API calls are never cached;
   an estate from yesterday is worse than a spinner. */
var SHELL = 'clearsky-hq-shell-v1';
var FILES = ['/clearsky/app', '/clearsky/app.html', '/omega-logic-theme.css'];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(SHELL).then(function (c) { return Promise.all(FILES.map(function (f) { return c.add(f)['catch'](function () {}); })); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) { return Promise.all(keys.filter(function (k) { return k.indexOf('clearsky-hq-shell-') === 0 && k !== SHELL; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.indexOf('/api/') === 0) return;
  e.respondWith(fetch(e.request).then(function (r) {
    if (r.ok && FILES.indexOf(url.pathname) >= 0) { var copy = r.clone(); caches.open(SHELL).then(function (c) { c.put(e.request, copy); }); }
    return r;
  })['catch'](function () { return caches.match(e.request).then(function (hit) { return hit || caches.match('/clearsky/app.html'); }); }));
});
