/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   office/app-sw.js — the office app's service worker. Network first, always:
   an order list from yesterday is worse than a spinner. What it keeps is
   the SHELL (the page, the theme, the PO parser), so the app opens and says
   "offline" instead of a browser error page. API calls are never cached. */
var SHELL = 'office-app-shell-v2';
var FILES = ['/office/app', '/office/app.html', '/omega-logic-theme.css', '/omega-logic-theme.js', '/omega-po-bulk.js', '/omega-logic-signin.js', '/omega-hexhub.js', '/omega-scan.js'];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(SHELL).then(function (c) { return Promise.all(FILES.map(function (f) { return c.add(f)['catch'](function () {}); })); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  /* only THIS app's old shells: the three apps share one origin, and a
     phone may carry more than one of them */
  e.waitUntil(caches.keys().then(function (keys) { return Promise.all(keys.filter(function (k) { return k.indexOf('office-app-shell-') === 0 && k !== SHELL; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.indexOf('/api/') === 0) return;
  e.respondWith(fetch(e.request).then(function (r) {
    if (r.ok && FILES.indexOf(url.pathname) >= 0) { var copy = r.clone(); caches.open(SHELL).then(function (c) { c.put(e.request, copy); }); }
    return r;
  })['catch'](function () { return caches.match(e.request).then(function (hit) { return hit || caches.match('/office/app.html'); }); }));
});
