/* ═══════════════════════════════════════════════════════════════════════════════
   ClearSky-OMEGA · white-label storefront loader  (embed/loader.js)
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   THE ONLY FILE THE TENANT'S WEB DEVELOPER EVER SEES. Two lines on their page:

       <div id="cleancell-storefront"></div>
       <script src="https://cleancell.clearskyomega.com/embed/loader.js"
               data-key="omega_pk_live_…"
               data-target="#cleancell-storefront" async></script>

   It injects an iframe pointing at /embed/storefront.html and keeps its height
   in step with its content. That is all. It is deliberately the least
   interesting file in the feature, because it is the one running on somebody
   else's website and every capability it has is one they have to trust us with.

   ─────────────────────────────────────────────────────────────────────────────
   WHY AN IFRAME AND NOT INLINE MARKUP
   ─────────────────────────────────────────────────────────────────────────────
   Injecting the form into their DOM would be easier to style and wrong in four
   ways that all bite in production:

     · THEIR CSS would style our form. A global `input { width:100% }` on their
       marketing site silently breaks a checkout we cannot see.
     · OUR CSS would leak into their page. A reset in our stylesheet moving
       their nav is a support call we cannot reproduce.
     · THEIR JS would share a global scope with ours, and their analytics
       would read our form fields — including the customer's address.
     · A same-origin iframe is a SECURITY BOUNDARY. Script on their page
       cannot read the customer's typed details out of a cross-origin frame.
       Inline, anything on the page could — including a third-party tag they
       added last week and forgot.

   The iframe also means our fetches are same-origin to US, so the storefront
   needs no CORS grant and no credential that crosses an origin.

   ─────────────────────────────────────────────────────────────────────────────
   THE HEIGHT MESSAGE, AND WHY IT IS CHECKED
   ─────────────────────────────────────────────────────────────────────────────
   The frame posts its height; this applies it. Every postMessage listener on
   a customer's website is an inbound channel from any frame or window, so:

     · the message's origin must be OUR origin — the one we loaded the frame
       from, computed from this script's own src, not configured and not
       assumed;
     · the payload must be the shape we expect;
     · the height is clamped. A hostile or buggy frame should not be able to
       make a 40-million-pixel element on their page.

   None of that is theoretical politeness. A loader that applied any height
   from any origin is a defacement primitive on the tenant's own site.
   ═══════════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var MIN_H = 320;
  var MAX_H = 8000;

  /* This script's own <script> element. document.currentScript is not in the
     ES5-era browsers this estate still supports, so fall back to finding
     ourselves by src — matched on the path, since the tenant may load us from
     their own vanity hostname. */
  function self() {
    if (document.currentScript) return document.currentScript;
    var all = document.getElementsByTagName('script');
    for (var i = all.length - 1; i >= 0; i--) {
      if (/\/embed\/loader\.js(\?|$)/.test(all[i].src || '')) return all[i];
    }
    return null;
  }

  var tag = self();
  if (!tag) return;

  /* OUR origin, derived from where this file was actually served from. The
     one value the height listener below trusts, and it is not configurable
     on purpose: a data-origin attribute would be a way to point the trust
     somewhere else. */
  var base = (function () {
    var a = document.createElement('a');
    a.href = tag.src;
    return a.protocol + '//' + a.host;
  })();

  var key = tag.getAttribute('data-key') || '';
  if (!key) {
    if (window.console && console.error) {
      console.error('[storefront] data-key is missing on the loader script tag.');
    }
    return;
  }
  var configId = tag.getAttribute('data-config') || '';
  var targetSel = tag.getAttribute('data-target') || '';
  var minH = parseInt(tag.getAttribute('data-min-height') || '', 10) || MIN_H;

  /* Where to put it: the named element, or immediately where the tag sits,
     which is what a developer who just pasted the snippet expects. */
  function mountPoint() {
    if (targetSel) {
      var el = document.querySelector(targetSel);
      if (el) return el;
      if (window.console && console.warn) {
        console.warn('[storefront] data-target "' + targetSel + '" not found; mounting in place.');
      }
    }
    var holder = document.createElement('div');
    if (tag.parentNode) tag.parentNode.insertBefore(holder, tag.nextSibling);
    else document.body.appendChild(holder);
    return holder;
  }

  function build() {
    var mount = mountPoint();
    /* The CLEAN path. vercel.json sets cleanUrls:true, so
       /embed/storefront.html 308s to /embed/storefront — which works, but
       spends a round trip on every load of a customer's page and relies on
       the redirect carrying the query string. */
    var src = base + '/embed/storefront?k=' + encodeURIComponent(key)
            + (configId ? '&c=' + encodeURIComponent(configId) : '');

    var frame = document.createElement('iframe');
    frame.src = src;
    frame.title = tag.getAttribute('data-title') || 'Energy storage';
    frame.setAttribute('loading', 'lazy');
    /* allow-forms/scripts/same-origin is what the page needs and nothing
       more. No allow-top-navigation: a widget must never be able to move the
       host page somewhere else. */
    frame.setAttribute('sandbox', 'allow-forms allow-scripts allow-same-origin allow-popups');
    frame.setAttribute('referrerpolicy', 'strict-origin');
    frame.style.cssText = 'width:100%;border:0;display:block;min-height:' + minH + 'px;'
      + 'height:' + minH + 'px;transition:height .18s ease;background:transparent';
    mount.appendChild(frame);

    window.addEventListener('message', function (ev) {
      /* 1 · from us, 2 · from THIS frame, 3 · the right shape, 4 · in range.
         All four, in that order, before anything is applied. */
      if (ev.origin !== base) return;
      if (ev.source !== frame.contentWindow) return;
      var d = ev.data;
      if (!d || d.omegaEmbed !== 'height') return;
      var h = Number(d.height);
      if (!isFinite(h)) return;
      h = Math.max(minH, Math.min(MAX_H, Math.ceil(h)));
      frame.style.height = h + 'px';
    }, false);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }
})();
