/* ══════════════════════════════════════════════════════════════════════════
   CLEARSKY-OMEGA · BOOT LOADER  (omega-boot.js)

   SHARED PLATFORM FILE — tenant-neutral. No customer name, domain, logo or
   colour. The only asset it touches is /omega-logo.png, which every
   deployment already carries.

   ─────────────────────────────────────────────────────────────────────────
   THIS IS AN EXTRACTION, NOT AN INVENTION
   ─────────────────────────────────────────────────────────────────────────
   index.html already carries a boot loader, inline, immediately after
   <body>: a fixed #omega-boot overlay with an .ob-mark tile, an .ob-spin
   spinner, an .ob-txt caption, a `window._omegaReady()` dismiss hook called
   from the first onAuthStateChanged, and a pure-CSS failsafe that fades it
   at 8s whatever JavaScript does. Its own comment says why it exists:
   "prevents auth flash on navigation".

   That file is not changed by this one and does not load it. It works, and
   forking a 300 KB shared page to import something it already has would be
   a regression dressed as a refactor.

   What this file does is make the SAME loader available to the secondary
   pages, which never got it:

     · /fleet.html and /commission.html hide both #gate and #wrap until auth
       resolves, so they paint a bare topbar over an empty page first.
       Nothing is wrong; it just looks like something is.

   Everything below therefore mirrors index.html's markup, class names,
   colours, timings and public API deliberately. `window._omegaReady()` is
   the same function name on purpose: a page can call it without caring
   whether it got the loader inline or from here, and anyone who has read one
   implementation has read both. Two loaders that look almost the same are
   worse than one that is copied exactly.

   ─────────────────────────────────────────────────────────────────────────
   THE ONE THING IT ADDS: COVERING THE WAY OUT
   ─────────────────────────────────────────────────────────────────────────
   index.html's loader covers a page ARRIVING. Nothing covers a page
   LEAVING, so clicking through to another portal page shows the browser's
   own white tear-down between the two documents.

   So a click on a same-origin link re-raises the overlay before the
   navigation starts, in a lighter "warm" form. Warm is not cold repainted:
   a session that has already signed in does not need a splash announcing
   the application, it needs the strobe covered. It is pale, quieter, and
   carries no spinner.

   Warm/cold is decided by a sessionStorage flag, which is the right
   lifetime — per tab, dies with the tab, and a genuinely new session
   correctly gets the full splash again. Where sessionStorage is unavailable
   (private modes, some webviews) everything falls back to cold, which is
   the safe direction: a splash slightly heavier than it needed to be,
   rather than a veil that never covers the flash it exists for.

   ─────────────────────────────────────────────────────────────────────────
   ⚠ AN OVERLAY THAT DOES NOT LIFT IS WORSE THAN THE FLASH IT HID
   ─────────────────────────────────────────────────────────────────────────
   A cosmetic overlay that fails closed turns a cosmetic problem into a
   blank unusable page. It fails OPEN in every direction, and the first of
   these is inherited from index.html because it is the only one that
   survives JavaScript dying outright:

     · a pure-CSS keyframe fades and un-clicks it at FAILSAFE_S, with no
       script involvement at all
     · a JS timeout lifts it earlier, at HOLD_MAX_MS
     · 'pageshow' lifts it, which covers the back/forward cache — without
       that, going Back lands on a restored page still wearing the overlay
       it was wearing when it left
     · an uncaught throw lifts it, because a page that has thrown is not
       going to call _omegaReady()
     · it never hides <body>. It is an overlay, not a curtain: if removal is
       interrupted the page underneath was visible the whole time.

   ⚠ The throw handler is NOT in the capture phase. A capture-phase window
   listener also receives RESOURCE load failures — a 404 on an image, a
   blocked font stylesheet, an ad-blocked script — because those fire on the
   element and are only visible while capturing. An earlier revision did
   capture, and every load tore its own overlay off about 100 ms in, which
   is worse than having none: the splash appears and is snatched away. A
   missing image is not a reason to stop covering the flash.
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var doc = global.document;
  if (!doc || !doc.documentElement) return;

  /* index.html already defines _omegaReady inline and does not load this
     file. If some future page ends up with both, the inline one wins and
     this exits — one loader per page, and the one written into the page is
     the one its own auth code is calling. */
  if (typeof global._omegaReady === 'function') return;

  var FAILSAFE_S  = 8;      // pure-CSS, matches index.html exactly
  var HOLD_MAX_MS = 6000;   // JS ceiling, deliberately inside the CSS one
  var COLD_MIN_MS = 400;    // floor, so a warm cache doesn't make it flicker
  var FADE_MS     = 280;    // matches index.html's .28s transition

  var WARM_KEY = 'omega:booted';

  /* Declared by the page that will dismiss this itself:

       <script src="/omega-boot.js" data-wait="auth"></script>

     Without the attribute the overlay lifts shortly after 'load', which is
     right for a page that has never heard of this file. With it, the
     overlay waits for _omegaReady() up to HOLD_MAX_MS.

     Not cosmetic. An earlier revision applied the load-based net
     unconditionally, so any page whose auth took longer than a second — a
     cold Firebase handshake, a slow connection — had its overlay pulled off
     and its empty shell revealed, which is exactly the flash this prevents.
     A net meant for legacy pages was firing on the pages it was built for.

     document.currentScript is reliable here because this file is loaded
     synchronously, which it must be anyway to beat the first paint. */
  var WAIT_FOR_READY = (function () {
    try {
      var me = doc.currentScript;
      return !!(me && me.getAttribute('data-wait') === 'auth');
    } catch (e) { return false; }
  })();

  var html = doc.documentElement;
  var veil = null, shownAt = 0, done = false, timer = null, mode = 'cold';

  function isWarm() {
    try { return global.sessionStorage.getItem(WARM_KEY) === '1'; }
    catch (e) { return false; }            // no storage ⇒ treat as cold
  }
  function markWarm() {
    try { global.sessionStorage.setItem(WARM_KEY, '1'); } catch (e) {}
  }

  /* ── Styles ─────────────────────────────────────────────────────────────
     Injected into documentElement rather than head: on a cold parse head may
     not be closed yet, and this has to apply to the very first paint. Same
     technique as the SSO guard already in index.html.

     Colours, sizes and timings are index.html's, not new ones. */
  function injectStyles() {
    if (doc.getElementById('omega-boot-css')) return;
    var s = doc.createElement('style');
    s.id = 'omega-boot-css';
    s.textContent = [
      /* Background on <html> so there is no white in the instant before
         <body> exists and before the overlay can be attached to anything. */
      'html.ob-cold{background:#0B1E35}',
      'html.ob-warm{background:#EDEFF1}',

      '#omega-boot{position:fixed;inset:0;z-index:2147483000;display:flex;',
        'flex-direction:column;align-items:center;justify-content:center;gap:20px;',
        'transition:opacity ' + (FADE_MS / 1000) + 's ease}',
      '#omega-boot.hide{opacity:0;pointer-events:none}',
      '#omega-boot.ob-m-cold{background:#0B1E35}',
      '#omega-boot.ob-m-warm{background:#EDEFF1;gap:14px}',

      /* The tile is index.html's .ob-mark, with the real mark inside it
         instead of a glyph. The glyph stays as the fallback child so a slow
         or missing PNG still shows something on brand rather than an empty
         gradient square. */
      '#omega-boot .ob-mark{width:60px;height:60px;border-radius:16px;',
        'background:linear-gradient(135deg,#006F9A,#00A9A4);',
        'display:flex;align-items:center;justify-content:center;overflow:hidden;',
        'color:#fff;font:700 30px/1 "DM Sans",sans-serif;',
        'box-shadow:0 12px 30px rgba(0,169,164,.35)}',
      '#omega-boot.ob-m-warm .ob-mark{width:40px;height:40px;border-radius:11px;',
        'box-shadow:0 6px 16px rgba(0,169,164,.22)}',
      '#omega-boot .ob-img{width:100%;height:100%;object-fit:cover;display:none}',
      '#omega-boot .ob-img.ok{display:block}',
      '#omega-boot .ob-img.ok + .ob-glyph{display:none}',

      '#omega-boot .ob-spin{width:26px;height:26px;border:3px solid rgba(255,255,255,.25);',
        'border-top-color:#00C4BC;border-radius:50%;animation:ob-spin .7s linear infinite}',
      '#omega-boot .ob-txt{color:#8CA3BE;font:500 13px/1 "DM Sans",sans-serif;letter-spacing:.3px}',
      '#omega-boot.ob-m-warm .ob-txt{color:#7A8B9C;font-size:12px}',
      '@keyframes ob-spin{to{transform:rotate(360deg)}}',

      /* Failsafe, copied from index.html: never let the loader trap the user
         if JS fails to dismiss it. This is the only safeguard that works
         when script execution has stopped entirely, which is why it is CSS
         and why it stays even though a JS timeout also exists. */
      '#omega-boot{animation:ob-failsafe 0s linear ' + FAILSAFE_S + 's forwards}',
      '@keyframes ob-failsafe{to{opacity:0;pointer-events:none;visibility:hidden}}',

      '@media(prefers-reduced-motion:reduce){',
        '#omega-boot .ob-spin{animation:none;border-top-color:rgba(255,255,255,.45)}',
        '#omega-boot{transition:none}}'
    ].join('');
    html.appendChild(s);
  }

  /* ── Build ──────────────────────────────────────────────────────────── */

  function build(kind) {
    var v = doc.createElement('div');
    v.id = 'omega-boot';
    v.className = 'ob-m-' + kind;
    v.setAttribute('role', 'status');
    v.setAttribute('aria-label', 'Loading');

    var tile = doc.createElement('div');
    tile.className = 'ob-mark';

    var img = doc.createElement('img');
    img.className = 'ob-img';
    img.alt = '';
    img.setAttribute('aria-hidden', 'true');
    img.onload = function () { img.className = 'ob-img ok'; };
    img.onerror = function () { img.className = 'ob-img'; };   // glyph stays
    img.src = '/omega-logo.png';

    var glyph = doc.createElement('span');
    glyph.className = 'ob-glyph';
    glyph.innerHTML = '&Omega;';

    tile.appendChild(img);
    tile.appendChild(glyph);
    v.appendChild(tile);

    /* Cold only. A spinner on a 200 ms page transition is noise, and a
       spinner that appears and vanishes reads as a stutter. */
    if (kind === 'cold') {
      var sp = doc.createElement('div');
      sp.className = 'ob-spin';
      v.appendChild(sp);
    }

    var txt = doc.createElement('div');
    txt.className = 'ob-txt';
    txt.textContent = (kind === 'cold') ? 'Loading your workspace\u2026' : 'One moment\u2026';
    v.appendChild(txt);

    return v;
  }

  /* Attached to <html>, deliberately outside <body>, so it is up before
     <body> has even been parsed on a cold load. It is a fixed overlay, so it
     covers the page without hiding it — nothing here ever sets visibility on
     <body>, and an interrupted removal therefore cannot leave a blank page. */
  function attach(v) {
    if (doc.body && doc.body.parentNode === html) html.insertBefore(v, doc.body);
    else html.appendChild(v);
  }

  function show(kind) {
    if (done) return;                     // never re-veil a page already handed over
    kind = kind || (isWarm() ? 'warm' : 'cold');
    mode = kind;
    injectStyles();

    if (!veil) {
      veil = build(kind);
      attach(veil);
      shownAt = Date.now();
    }
    html.classList.add(kind === 'warm' ? 'ob-warm' : 'ob-cold');

    if (timer) clearTimeout(timer);
    timer = setTimeout(function () { hide(true); }, HOLD_MAX_MS);
  }

  /* ── Hide ───────────────────────────────────────────────────────────── */

  function reveal() {
    html.classList.remove('ob-cold', 'ob-warm');
    if (!veil) return;
    var v = veil;
    veil = null;
    v.className += ' hide';               // same class index.html uses
    setTimeout(function () {
      if (v && v.parentNode) v.parentNode.removeChild(v);
    }, FADE_MS + 40);
  }

  function hide(force) {
    if (done && !veil) return;
    done = true;
    if (timer) { clearTimeout(timer); timer = null; }
    if (!veil) { html.classList.remove('ob-cold', 'ob-warm'); return; }

    var floor = (mode === 'warm') ? 0 : COLD_MIN_MS;
    var left = force ? 0 : Math.max(0, floor - (Date.now() - shownAt));
    if (left) setTimeout(reveal, left);
    else reveal();
  }

  /* Same name and same contract as index.html's inline version: call it once
     auth state is known, so the screen underneath is already the correct one
     — app, gate, or a pending redirect — and never flashes. */
  function ready() {
    markWarm();
    hide(false);
  }

  /* ── Covering the way out ───────────────────────────────────────────── */

  function sameOrigin(a) {
    try { return a.origin === location.origin; } catch (e) { return false; }
  }

  function onClick(e) {
    if (!done) return;                                 // still booting; ignore
    if (e.defaultPrevented || e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;   // new tab

    var a = e.target && e.target.closest ? e.target.closest('a') : null;
    if (!a || !a.href) return;
    if (a.target && a.target !== '_self') return;
    if (a.hasAttribute('download')) return;
    if (!/^https?:$/.test(a.protocol)) return;         // mailto:, tel:, blob:
    if (!sameOrigin(a)) return;                        // leaving the portal
    /* Same document, different hash — no navigation follows, so an overlay
       raised here would never be lifted by a load. */
    if (a.pathname === location.pathname && a.search === location.search &&
        a.hash && a.hash !== location.hash) return;

    done = false;
    veil = null;
    show('warm');
    /* No preventDefault. The navigation proceeds normally and the overlay
       just rides on the outgoing page until the document is replaced. If the
       navigation never happens, HOLD_MAX_MS and the CSS failsafe both still
       lift it. */
  }

  /* ── Fail-open wiring ───────────────────────────────────────────────── */

  /* bfcache: a restored page keeps whatever DOM it had when it left,
     overlay included. persisted === true is exactly that case. */
  global.addEventListener('pageshow', function (e) {
    if (e && e.persisted) { done = true; reveal(); }
  });

  /* Bubble phase and a target check — see the header. A resource 404 must
     not be mistaken for the page having thrown. */
  global.addEventListener('error', function (e) {
    if (e && e.target && e.target !== global) return;
    hide(true);
  });
  global.addEventListener('unhandledrejection', function () { hide(true); });

  /* Net for pages that have NOT declared data-wait="auth". A page that has
     declared it is left to HOLD_MAX_MS instead, so a slow auth is covered
     rather than cut off a second in. */
  if (!WAIT_FOR_READY) {
    global.addEventListener('load', function () {
      setTimeout(function () { if (!done) hide(true); }, 900);
    });
  }

  doc.addEventListener('click', onClick, true);

  show();

  global._omegaReady = ready;                          // index.html's API
  global.OmegaBoot = { show: show, hide: function () { hide(true); },
                       ready: ready, isWarm: isWarm };

})(window);
