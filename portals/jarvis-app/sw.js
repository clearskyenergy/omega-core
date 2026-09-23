/* ═══════════════════════════════════════════════════════════════════════════════
   portals/jarvis-app/sw.js — the Jarvis phone app's service worker
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Two jobs, and the reasons for each are borrowed from two workers already
   in the repo.

   1. The shell opens from the home screen with no signal (same-origin pages
      and scripts NETWORK FIRST, the cache only answers when the network
      cannot — the sitefinder-app worker). Nothing from another origin is
      ever stored: not the Firebase SDK, not Google Fonts, and above all not
      the twinChat function, which is where every answer, every spoken reply
      and every setting comes from. Nothing under /api/ either.

   2. Push. iOS delivers Web Push only to an installed app and only through
      its service worker, so the push and notificationclick handlers from
      mission-sw.js live here too — with this app's own URL as the place a
      tap lands. Every push path ends in showNotification(): a push event
      that does not is a "silent push" and iOS revokes the subscription after
      a few of them.

   Registered by index.html with scope /jarvis-app (the Vercel rewrite path);
   vercel.json sends Service-Worker-Allowed for this file so that scope is
   permitted from /portals/jarvis-app/. ES5.
   ═══════════════════════════════════════════════════════════════════════════════ */
var VERSION = 'jarvis-app-2026-09-23';
var HOME = '/jarvis-app';

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

self.addEventListener('push', function (event) {
  var d = {};
  try { d = event.data ? event.data.json() : {}; }
  catch (_) { try { d = { body: event.data.text() }; } catch (__) { d = {}; } }
  var title = d.title || 'Jarvis';
  var opts = {
    body: d.body || '',
    icon: d.icon || HOME + '/brand/jarvis-icon-192.png',
    badge: d.badge || HOME + '/brand/jarvis-icon-192.png',
    tag: d.tag || 'jarvis',
    renotify: true,
    requireInteraction: !!d.requireInteraction,
    data: { url: d.url || HOME }
  };
  event.waitUntil(self.registration.showNotification(title, opts));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || HOME;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].url.indexOf(HOME) >= 0 && 'focus' in list[i]) {
          if (list[i].navigate && url !== HOME) { try { list[i].navigate(url); } catch (_) {} }
          return list[i].focus();
        }
      }
      return self.clients.openWindow ? self.clients.openWindow(url) : null;
    })
  );
});

self.addEventListener('pushsubscriptionchange', function () {
  console.warn('[jarvis-app sw] subscription changed — the app re-subscribes on next load');
});
