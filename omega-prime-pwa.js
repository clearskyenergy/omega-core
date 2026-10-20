/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   omega-prime-pwa.js — register Omega Prime's service worker, and on the
   install page keep the Chrome install prompt for the Install button.
   Scope is /omega-prime and nothing wider: a missing scope would claim
   the whole origin. The worker script is /omega-prime-sw.js, whose own
   directory allows that scope. ES5. */
(function () {
  /* Written while the page is still parsing, so they sit in the head the
     same way a static tag would. Skipped when the page already named a
     manifest (the install page) and after the parser has closed, where
     document.write would erase the page. */
  if (document.readyState === 'loading' && !document.querySelector('link[rel="manifest"]')) {
    document.write(
      '<link rel="manifest" href="/omega-prime.webmanifest">' +
      '<link rel="icon" href="/icons/omega-prime-192.png" sizes="192x192" type="image/png">' +
      '<link rel="apple-touch-icon" href="/icons/omega-prime-180.png" sizes="180x180">' +
      '<meta name="theme-color" content="#0B2A3D">' +
      '<meta name="mobile-web-app-capable" content="yes">' +
      '<meta name="apple-mobile-web-app-capable" content="yes">' +
      '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">' +
      '<meta name="apple-mobile-web-app-title" content="Omega Prime">'
    );
  }
  var SCOPE = '/omega-prime';
  var secure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (secure && 'serviceWorker' in navigator) {
    try { navigator.serviceWorker.register('/omega-prime-sw.js', { scope: SCOPE })['catch'](function () {}); } catch (e) {}
  }
  window.addEventListener('beforeinstallprompt', function (e) {
    var btn = document.getElementById('installBtn');
    if (!btn) return;
    e.preventDefault();
    btn.hidden = false;
    var note = document.getElementById('installNote');
    if (note) note.hidden = true;
    btn.addEventListener('click', function () {
      btn.disabled = true;
      e.prompt();
      e.userChoice.then(function () { btn.hidden = true; });
    });
  });
  window.addEventListener('appinstalled', function () {
    var btn = document.getElementById('installBtn');
    if (btn) btn.hidden = true;
    var done = document.getElementById('installed');
    if (done) done.hidden = false;
  });
})();
