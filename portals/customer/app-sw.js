/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   portals/customer/app-sw.js — the customer app's service worker. Network
   first, always: an order status from yesterday is worse than a spinner.
   What it keeps is the SHELL (the page, the theme, the PO parser), so the
   app opens and says "offline" instead of a browser error page. API calls
   and sign-in are never cached. Scoped to /portals/customer/app so it never
   sits in front of the desktop portal next to it. */
var SHELL = 'customer-app-shell-v1';
var FILES = ['/portals/customer/app', '/portals/customer/app.html', '/omega-logic-theme.css', '/omega-logic-theme.js', '/omega-po-bulk.js', '/omega-hexhub.js', '/portals/customer/portfolio.js'];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(SHELL).then(function (c) { return Promise.all(FILES.map(function (f) { return c.add(f)['catch'](function () {}); })); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  /* only THIS app's old shells: the three apps share one origin, and a
     phone may carry more than one of them */
  e.waitUntil(caches.keys().then(function (keys) { return Promise.all(keys.filter(function (k) { return k.indexOf('customer-app-shell-') === 0 && k !== SHELL; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.indexOf('/api/') === 0) return;
  e.respondWith(fetch(e.request).then(function (r) {
    if (r.ok && FILES.indexOf(url.pathname) >= 0) { var copy = r.clone(); caches.open(SHELL).then(function (c) { c.put(e.request, copy); }); }
    return r;
  })['catch'](function () { return caches.match(e.request).then(function (hit) { return hit || caches.match('/portals/customer/app.html'); }); }));
});
