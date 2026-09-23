/* ClearSky OMEGA — mission control service worker
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   ── THIS WORKER CACHES NOTHING, ON PURPOSE ──

   It exists for one reason: iOS delivers Web Push only to an installed PWA,
   and only through a service worker. That is the whole job. There is no
   fetch handler here at all, and that is a deliberate reading of the scar
   tissue in tenants/nextnrg/sw.js — its v1 was cache-first for every request
   including the app's own HTML, and a stale editor.html then became
   permanent for anyone who had loaded it once. A dashboard that silently
   serves yesterday's build is a worse outage than one that is simply down,
   because nobody thinks to look.

   Adding offline support later means adding a fetch handler that is
   network-first and never, ever stores a document from this origin. Until
   someone genuinely needs that, the safest cache is no cache.

   ── SCOPE ──

   Registered from mission-push.js with { scope: '/mission' } so it controls
   the dashboard and nothing else. A root-scoped worker here would sit in
   front of editor.html, projects.html and every tool on the wildcard domain
   for every tenant — an enormous blast radius for a notification feature. */
'use strict';

/* Take over as soon as a new copy is installed rather than waiting for every
   tab to close. There is no cached content to invalidate, so the usual reason
   to be cautious about skipWaiting does not apply here. */
self.addEventListener('install', function (e) { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener('push', function (event) {
  /* A push with no body, or a body that is not the JSON we send, still has to
     produce a notification: on iOS and Android a push event that ends without
     showNotification() is a "silent push", and the browser may revoke the
     subscription after a few of them. So every path below ends in one. */
  var d = {};
  try { d = event.data ? event.data.json() : {}; }
  catch (_) { try { d = { body: event.data.text() }; } catch (__) { d = {}; } }

  var title = d.title || 'JARVIS';
  var opts = {
    body: d.body || '',
    icon: d.icon || '/icons/mission-192.png',
    badge: d.badge || '/icons/mission-192.png',
    tag: d.tag || 'jarvis',
    /* Same tag replaces rather than stacks, so ten status pings do not bury
       the phone; renotify makes the replacement actually buzz. */
    renotify: true,
    requireInteraction: !!d.requireInteraction,
    data: { url: d.url || '/mission?view=command' }
  };
  event.waitUntil(self.registration.showNotification(title, opts));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || '/mission?view=command';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(function (list) {
        /* Focus the dashboard if it is already open — opening a second copy
           of a page that holds a live conversation is its own small bug. */
        for (var i = 0; i < list.length; i++) {
          if (list[i].url.indexOf('/mission') >= 0 && 'focus' in list[i]) {
            if (list[i].navigate) { try { list[i].navigate(url); } catch (_) {} }
            return list[i].focus();
          }
        }
        return self.clients.openWindow ? self.clients.openWindow(url) : null;
      })
  );
});

/* Safari/iOS can drop a subscription on its own (a long silence, an OS
   update). The page re-subscribes on its next load; this just makes the event
   visible in the worker's log instead of being a mystery on the server. */
self.addEventListener('pushsubscriptionchange', function (event) {
  console.warn('[mission-sw] subscription changed — the page will re-subscribe on next load');
});
