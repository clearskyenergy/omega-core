/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   omega-prime-pwa.js — register Omega Prime's service worker, and on the
   install page keep the Chrome install prompt for the Install button.
   Scope is /omega-prime and nothing wider: a missing scope would claim
   the whole origin. The worker script is /omega-prime-sw.js, whose own
   directory allows that scope. ES5. */
(function () {
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
