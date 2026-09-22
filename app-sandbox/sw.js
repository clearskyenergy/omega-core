/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   app-sandbox/sw.js — one worker for the three sandboxes. Network first,
   same-origin only, never /api/ (the sandbox answers those on the page and
   they never reach the network), so a rebuild is picked up on the next
   open and the pages still open with no signal.  ES5. */
var VERSION = 'app-sandbox-v1';
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(caches.keys().then(function (keys) { return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); })); });
self.addEventListener('fetch', function (e) {
  var req = e.request; if (req.method !== 'GET') return;
  var url; try { url = new URL(req.url); } catch (err) { return; }
  if (url.origin !== self.location.origin || url.pathname.indexOf('/api/') === 0) return;
  e.respondWith(fetch(req).then(function (res) {
    if (res && res.ok && res.type === 'basic') { var copy = res.clone(); caches.open(VERSION).then(function (c) { c.put(req, copy); })['catch'](function () {}); }
    return res;
  })['catch'](function () { return caches.match(req).then(function (hit) { return hit || (req.mode === 'navigate' ? caches.match('/app-sandbox/plant') : undefined); }); }));
});
