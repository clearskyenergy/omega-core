/* ═══════════════════════════════════════════════════════════════════════════════
   portals/skyfund/sw.js — the SkyFund service worker
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   What it is for: the app installs to a phone's home screen or a desktop
   (Chrome / Edge "Install", Safari "Add to Home Screen") and opens even
   with no signal, showing the last projects it saw.

   What it deliberately does NOT do: cache anything from another origin
   (the Firebase SDK, Firestore, Google Fonts, Plaid, Stripe) or anything
   under /api/ — money and sign-in always go to the network. Same-origin
   pages and scripts are NETWORK FIRST, so a deploy is picked up on the
   next load; the cache only answers when the network cannot.

   Registered by index.html with scope /skyfund (the Vercel rewrite path);
   vercel.json sends Service-Worker-Allowed for this file so that scope is
   permitted from /portals/skyfund/. The sandbox build registers a copy as
   ./sw.js.  ES5.
   ═══════════════════════════════════════════════════════════════════════════════ */
var VERSION = 'skyfund-2026-09-12';

self.addEventListener('install', function () { self.skipWaiting(); });

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url;
  try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin) return;
  if (url.pathname.indexOf('/api/') === 0) return;
  e.respondWith(fetch(req).then(function (res) {
    if (res && res.ok && res.type === 'basic') {
      var copy = res.clone();
      caches.open(VERSION).then(function (c) { c.put(req, copy); })['catch'](function () {});
    }
    return res;
  })['catch'](function () {
    return caches.match(req).then(function (hit) {
      if (hit) return hit;
      if (req.mode === 'navigate') return caches.match(new URL(self.registration.scope).pathname).then(function (page) { return page || caches.match('./'); });
      return undefined;
    });
  }));
});
