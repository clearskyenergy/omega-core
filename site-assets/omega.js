/* ClearSky OMEGA — shared site behavior (ES5, no build step) */
(function () {
  'use strict';

  /* Mobile nav toggle */
  window.toggleNav = function () {
    var links = document.getElementById('navLinks');
    if (links) { links.classList.toggle('open'); }
  };

  /* Close mobile nav after tapping a link */
  document.addEventListener('DOMContentLoaded', function () {
    var links = document.getElementById('navLinks');
    if (links) {
      var anchors = links.querySelectorAll('a');
      for (var i = 0; i < anchors.length; i++) {
        anchors[i].addEventListener('click', function () {
          links.classList.remove('open');
        });
      }
    }
  });

  /* Video modal (SAP-style full-screen). Toggle display first, then opacity
     on the next frame so the fade transition actually runs. */
  window.openVideo = function () {
    var m = document.getElementById('videoModal');
    if (!m) { return; }
    m.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    /* force reflow then add .open so opacity animates from 0 -> 1 */
    void m.offsetWidth;
    m.classList.add('open');
  };
  window.closeVideo = function () {
    var m = document.getElementById('videoModal');
    if (!m) { return; }
    m.classList.remove('open');
    document.body.style.overflow = '';
    var v = m.querySelector('video');
    if (v) { try { v.pause(); v.currentTime = 0; } catch (e) {} }
    /* wait for the opacity fade-out, then hide */
    setTimeout(function () { m.style.display = 'none'; }, 300);
  };
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { window.closeVideo(); }
  });
  document.addEventListener('click', function (e) {
    var m = document.getElementById('videoModal');
    if (m && e.target === m) { window.closeVideo(); }
  });
})();
