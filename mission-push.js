/* ClearSky OMEGA — push notifications for mission control (client half)
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Drop-in by design: mission.html needs one line,

       <script src="/mission-push.js" defer></script>

   and nothing else. Everything here is namespaced under window.JarvisPush and
   touches no existing function, because the dashboard is a single 300KB file
   that more than one person edits.

   ── WHAT iOS REQUIRES, IN ORDER ──

   1. The page must be INSTALLED to the Home Screen. Web Push does not exist
      in a normal Safari tab, and the APIs are simply absent — so a capability
      check that only asks "is PushManager defined" reports "not supported" on
      a phone that supports it perfectly, one tap of Share > Add to Home
      Screen away. enable() tells those two cases apart and says which it is.
   2. Notification.requestPermission() must be called inside a user gesture.
      Called on load it is rejected, and on iOS a rejection is permanent for
      the origin until the app is deleted and re-added. So this NEVER asks on
      its own — it asks when something calls enable() from a click.
   3. The subscription must carry the server's VAPID public key, which is
      fetched rather than hardcoded: a key baked into a static file drifts
      from the server's private half the moment anyone rotates it, and the
      failure lands at SEND time as a 403 on a subscription that looked fine
      when it was made. One fetch removes a whole class of silent breakage. */
'use strict';
(function () {

  /* The dashboard's worker by default. The Jarvis phone app loads this same
     file and points it at its own worker and scope BEFORE the script tag, so
     one subscribe flow serves both and a fix lands in both. */
  var SW_URL = window.JARVIS_PUSH_SW_URL || '/mission-sw.js';
  var SCOPE = window.JARVIS_PUSH_SCOPE || '/mission';

  function b64ToU8(base64) {
    var pad = '='.repeat((4 - base64.length % 4) % 4);
    var s = (base64 + pad).replace(/-/g, '+').replace(/_/g, '/');
    var raw = atob(s);
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  /* Standalone = launched from the Home Screen. iOS reports it on navigator,
     everyone else through the display-mode media query. */
  function installed() {
    return window.navigator.standalone === true ||
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  }
  function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }

  function state() {
    if (!('serviceWorker' in navigator)) return 'unsupported';
    if (!('PushManager' in window)) {
      return (isIOS() && !installed()) ? 'needs-install' : 'unsupported';
    }
    if (!('Notification' in window)) return 'unsupported';
    if (Notification.permission === 'denied') return 'blocked';
    if (Notification.permission === 'granted') return 'granted';
    return 'askable';
  }

  var token = null;
  /* The page owns auth; this asks it for a token rather than duplicating the
     Firebase sign-in. mission.html already has token(); if it is not there
     yet, setToken() lets it hand one over. */
  function getToken() {
    if (typeof token === 'function') return Promise.resolve().then(token);
    if (typeof window.token === 'function') return Promise.resolve().then(window.token);
    return Promise.resolve(null);
  }

  function register() {
    return navigator.serviceWorker.register(SW_URL, { scope: SCOPE });
  }

  function enable() {
    var st = state();
    if (st === 'needs-install') {
      return Promise.reject(new Error(
        'On iPhone, notifications need this page added to the Home Screen first: ' +
        'Share → Add to Home Screen, then open it from there.'));
    }
    if (st === 'unsupported') return Promise.reject(new Error('This browser cannot do push notifications.'));
    if (st === 'blocked') return Promise.reject(new Error(
      'Notifications are blocked for this app in system settings, so the page cannot ask again.'));

    return Promise.resolve()
      .then(function () { return Notification.requestPermission(); })
      .then(function (p) {
        if (p !== 'granted') throw new Error('Notifications were not allowed.');
        return register();
      })
      .then(function (reg) {
        return fetch('/api/push-key').then(function (r) { return r.json(); })
          .then(function (j) {
            if (!j || !j.key) throw new Error('The server has no VAPID key configured.');
            return reg.pushManager.getSubscription().then(function (existing) {
              /* A subscription made against a different key is worse than
                 none: it looks healthy here and 403s at send time. Replace it. */
              if (existing) {
                var same = existing.options && existing.options.applicationServerKey &&
                  btoa(String.fromCharCode.apply(null, new Uint8Array(existing.options.applicationServerKey)))
                    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') === j.key;
                if (same) return existing;
                return existing.unsubscribe().then(function () { return null; });
              }
              return null;
            }).then(function (sub) {
              return sub || reg.pushManager.subscribe({
                userVisibleOnly: true,               /* iOS requires it */
                applicationServerKey: b64ToU8(j.key)
              });
            });
          });
      })
      .then(function (sub) {
        return getToken().then(function (t) {
          if (!t) throw new Error('Sign in first — a subscription has to belong to someone.');
          return fetch('/api/push-subscribe', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + t, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              subscription: sub.toJSON(),
              ua: navigator.userAgent.slice(0, 200),
              installed: installed()
            })
          }).then(function (r) {
            if (!r.ok) return r.json().catch(function () { return {}; })
              .then(function (j) { throw new Error(j.error || ('HTTP ' + r.status)); });
            return sub;
          });
        });
      });
  }

  function disable() {
    if (!('serviceWorker' in navigator)) return Promise.resolve();
    return navigator.serviceWorker.getRegistration(SCOPE).then(function (reg) {
      if (!reg) return;
      return reg.pushManager.getSubscription().then(function (s) {
        return s ? s.unsubscribe() : null;
      });
    });
  }

  /* Keep the worker current without ever asking for permission: registering is
     silent, and only subscribe() needs consent. Doing it on load means the
     worker is already installed by the time he taps the button. */
  if ('serviceWorker' in navigator && (state() === 'granted' || installed())) {
    register().catch(function () {});
  }

  window.JarvisPush = {
    state: state, enable: enable, disable: disable, installed: installed,
    setToken: function (fn) { token = fn; },
    /* For a settings row: tells the UI what to render without asking for
       anything. 'needs-install' is the interesting one on a phone. */
    describe: function () {
      var s = state();
      return s === 'granted' ? 'Notifications are on' :
        s === 'askable' ? 'Turn on notifications' :
        s === 'needs-install' ? 'Add to Home Screen to enable notifications' :
        s === 'blocked' ? 'Notifications are blocked in system settings' :
        'Notifications are not supported here';
    }
  };
})();
