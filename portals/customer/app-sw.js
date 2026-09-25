/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   portals/customer/app-sw.js — the customer app's service worker. Network
   first, always: an order status from yesterday is worse than a spinner.
   What it keeps is the SHELL (the page, the theme, the sign-in, the PO
   parser), so the app opens and says "offline" instead of a browser error
   page. API calls and sign-in requests are never cached. Scoped to
   /portals/customer/app so it never sits in front of the desktop portal
   next to it.

   Only an address that answers 200 itself is kept (LIVE-7, as the office
   app's worker): the site serves clean URLs, so /portals/customer/app.html
   answers with a 308 to /portals/customer/app, and a response that came
   through a redirect cannot answer a page load — the browser shows its own
   error page. So the page is kept under its clean address (whatever its
   ?org=), a redirected response is never stored, and v2 drops the v1 shell
   that held one. v2 also keeps the two sign-in scripts: the app opens on
   the one sign-in (omega-logic-signin.js), in the supplier's name. */
var SHELL = 'customer-app-shell-v2';
var PAGE = '/portals/customer/app';
var FILES = [PAGE, '/omega-logic-theme.css', '/omega-logic-theme.js', '/omega-auth-errors.js', '/omega-logic-signin.js', '/omega-po-bulk.js', '/omega-hexhub.js', '/portals/customer/portfolio.js'];
/* what the cache may hold: this site's own 200, not reached through a redirect */
function keepable(r) { return !!r && r.ok === true && r.status === 200 && r.redirected !== true && (!r.type || r.type === 'basic' || r.type === 'default'); }
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(SHELL).then(function (c) {
    return Promise.all(FILES.map(function (f) { return fetch(f, { cache: 'no-cache' }).then(function (r) { if (keepable(r)) return c.put(f, r); })['catch'](function () {}); }));
  }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  /* only THIS app's old shells: the three apps share one origin, and a
     phone may carry more than one of them */
  e.waitUntil(caches.keys().then(function (keys) { return Promise.all(keys.filter(function (k) { return k.indexOf('customer-app-shell-') === 0 && k !== SHELL; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.indexOf('/api/') === 0) return;
  /* the app page, however it was asked for: a navigation, /portals/customer/app, or the old app.html */
  var page = e.request.mode === 'navigate' || url.pathname === PAGE || url.pathname === PAGE + '.html', key = page ? PAGE : url.pathname;
  e.respondWith(fetch(e.request).then(function (r) {
    if (keepable(r) && FILES.indexOf(key) >= 0) { var copy = r.clone(); caches.open(SHELL).then(function (c) { c.put(key, copy); }); }
    return r;
  })['catch'](function () {
    /* offline: the shell's own copy; any page load gets the app page, which says it is offline */
    return caches.match(key, { ignoreSearch: true }).then(function (hit) { return hit || (page ? caches.match(PAGE) : Response.error()); });
  }));
});
