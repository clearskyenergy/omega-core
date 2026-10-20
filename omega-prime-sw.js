/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   omega-prime-sw.js — Omega Prime's service worker.

   Registered from omega-prime-pwa.js with scope /omega-prime, which is the
   clean URL of omega-prime.html and also covers /omega-prime/install.
   The script lives beside the page (not inside that path) so the browser
   allows a scope that includes /omega-prime itself; trailingSlash on this
   host redirects /omega-prime/ back to /omega-prime, and a scope of
   /omega-prime/ would miss the page people actually open.

   Network first. The cache holds the app shell so the page opens when the
   signal drops. It never stores /api/ responses, Firebase auth under /__/,
   or a response that arrived through a redirect (clean URLs answer
   /omega-prime.html with a 308, and a redirected response cannot answer a
   later page load). Anything this worker does not own is left to the
   browser — return, do not respondWith — so a sign-in redirect is
   untouched. Cross-origin fetches (Firebase, map tiles, fonts, Leaflet)
   are not seen here. */
var SHELL = 'omega-prime-shell-v1';
var PAGE = '/omega-prime';
var INSTALL = '/omega-prime/install';
var FILES = [
  PAGE, INSTALL,
  '/omega-prime.webmanifest',
  '/omega-prime-mobile.css', '/omega-prime-pwa.js',
  '/omega-splash.js', '/config.js', '/omega-brand.js', '/omega-tenant.js',
  '/omega-whitelabel.js', '/omega-tools.js', '/omega-comed-layers.js',
  '/omega-bess-products.js', '/omega-cleancell-catalog.js', '/omega-site-catalogs.js',
  '/omega-grid-verdict.js', '/omega-prime-project.js', '/omega-quote-deck.js',
  '/omega-logo.png',
  '/icons/omega-prime-180.png', '/icons/omega-prime-192.png',
  '/icons/omega-prime-512.png', '/icons/omega-prime-maskable-512.png',
  '/vendor/qrcode-generator/2.0.4/qrcode.js'
];
function primeNav(pathname) {
  return pathname === PAGE || pathname === INSTALL;
}
function keepable(r) {
  return !!r && r.ok === true && r.status === 200 && r.redirected !== true && (!r.type || r.type === 'basic' || r.type === 'default');
}
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(SHELL).then(function (c) {
    return Promise.all(FILES.map(function (f) {
      return fetch(f, { cache: 'no-cache' }).then(function (r) { if (keepable(r)) return c.put(f, r); })['catch'](function () {});
    }));
  }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('omega-prime-shell-') === 0 && k !== SHELL; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var url;
  try { url = new URL(e.request.url); } catch (err) { return; }
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.indexOf('/api/') === 0 || url.pathname.indexOf('/__/') === 0) return;
  if (e.request.headers.get('authorization')) return;
  var nav = e.request.mode === 'navigate' && primeNav(url.pathname);
  var key = url.pathname;
  if (!nav && FILES.indexOf(key) < 0) return;
  e.respondWith(fetch(e.request).then(function (r) {
    if (keepable(r) && (nav || FILES.indexOf(key) >= 0)) {
      var copy = r.clone();
      caches.open(SHELL).then(function (c) { c.put(key, copy); });
    }
    return r;
  })['catch'](function () {
    return caches.match(key, { ignoreSearch: true }).then(function (hit) {
      return hit || (nav ? caches.match(PAGE) : Response.error());
    });
  }));
});
