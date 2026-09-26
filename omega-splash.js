/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * The OMEGA loading screen, on every page a person signs in to, and on
 * every move between them (Tommy, 2026-09-26: "anytime we move from one
 * page to another we need the omega loading page; we can never flash
 * another page or the login page; it must be professional").
 *
 * Loaded FIRST in <head>. It paints the mark on navy before anything else
 * can paint, hides the page's own content until the page is known — auth
 * answered signed-out (the sign-in card is then the truth), or the
 * entitlements arrived (signed in, package known), or the page said so —
 * and shows the mark again the instant a link is followed or the page is
 * left, so the next page's own splash takes over without a gap.
 *
 *   <script src="/omega-splash.js?v=1"></script>              the default
 *   <script src="/omega-splash.js?v=1" data-boot="no">        a page with its
 *                                       own boot splash (index.html): leaving only
 *   <script src="/omega-splash.js?v=1" data-hold="1">         a page that ends it
 *                                       itself with OmegaSplash.done() (login, start)
 *
 * It ends on: window 'omega:auth' with detail.user === false (omega-tenant.js,
 * the first answer), 'omega:entitlements', OmegaSplash.done(), the window's
 * load + 400 ms where no omega-tenant.js is on the page and the page does not
 * hold, and a hard cap of 4 s — the dashboard's boot watchdog taught us that
 * a splash that can outlive a dead page hides the failure behind a brand
 * animation. ES5, no dependencies, safe to load twice. */
(function () {
  'use strict';
  if (typeof window === 'undefined' || !window.document || window.OmegaSplash) return;
  var d = document, h = d.documentElement, me = d.currentScript || (function () { var s = d.getElementsByTagName('script'); return s[s.length - 1]; })();
  var boot = !(me && me.getAttribute('data-boot') === 'no'), hold = !!(me && me.getAttribute('data-hold')), done = false, capTimer = null;
  var MARK = '<svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true"><path d="M32 8C18.7 8 9 17.6 9 30.5c0 8.3 4.4 15.4 11.2 19.5H12v6h16v-6h-1.6C19.6 46.6 15 39.2 15 30.5 15 20.9 22.4 14 32 14s17 6.9 17 16.5c0 8.7-4.6 16.1-11.4 19.5H36v6h16v-6h-8.2C50.6 45.9 55 38.8 55 30.5 55 17.6 45.3 8 32 8z" fill="#fff"/></svg>';
  function css() {
    if (d.getElementById('omega-splash-style')) return;
    var st = d.createElement('style'); st.id = 'omega-splash-style';
    st.textContent = 'html.omega-loading{background:#0E1B33}html.omega-loading body{background:#0E1B33}html.omega-loading body>*:not(#omega-splash){visibility:hidden!important}'
      + '#omega-splash{position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:#0E1B33;color:#fff;font:600 13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;letter-spacing:.18em;text-transform:uppercase;visibility:visible;opacity:1;transition:opacity .22s ease}'
      + '#omega-splash svg{animation:omegaSplashPulse 1.6s ease-in-out infinite;opacity:.96}#omega-splash .omega-splash-name{color:#9FB4D6;font-size:11px}'
      + '#omega-splash .omega-splash-bar{width:120px;height:2px;background:rgba(255,255,255,.14);border-radius:2px;overflow:hidden}#omega-splash .omega-splash-bar i{display:block;width:40%;height:100%;background:#4DA3FF;animation:omegaSplashSlide 1.2s ease-in-out infinite}'
      + '#omega-splash.omega-splash-out{opacity:0;pointer-events:none}'
      + '@keyframes omegaSplashPulse{0%,100%{opacity:.55;transform:scale(.97)}50%{opacity:1;transform:scale(1)}}@keyframes omegaSplashSlide{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}'
      + '@media(prefers-reduced-motion:reduce){#omega-splash svg,#omega-splash .omega-splash-bar i{animation:none}}';
    (d.head || h).appendChild(st);
  }
  function mount() {
    if (!d.body) return null;
    var s = d.getElementById('omega-splash');
    if (s) { s.className = ''; return s; }
    s = d.createElement('div'); s.id = 'omega-splash'; s.setAttribute('role', 'status'); s.setAttribute('aria-label', 'Loading ClearSky-OMEGA');
    s.innerHTML = MARK + '<div class="omega-splash-name">ClearSky-OMEGA</div><div class="omega-splash-bar"><i></i></div>';
    d.body.insertBefore(s, d.body.firstChild); return s;
  }
  function show() {
    done = false; css();
    if (!/\bomega-loading\b/.test(h.className)) h.className += (h.className ? ' ' : '') + 'omega-loading';
    if (d.body) mount(); else d.addEventListener('DOMContentLoaded', function () { if (!done) mount(); });
    if (capTimer) clearTimeout(capTimer);
    capTimer = setTimeout(finish, 4000);
  }
  function finish() {
    if (done) return; done = true;
    if (capTimer) { clearTimeout(capTimer); capTimer = null; }
    h.className = h.className.replace(/\s*\bomega-loading\b/, '');
    var s = d.getElementById('omega-splash');
    if (s) { s.className = 'omega-splash-out'; setTimeout(function () { if (s.parentNode && done) s.parentNode.removeChild(s); }, 260); }
  }
  /* the page is known */
  window.addEventListener('omega:auth', function (e) { if (!e.detail || e.detail.user !== true) finish(); });
  window.addEventListener('omega:entitlements', finish);
  window.addEventListener('omega:splash-done', finish);
  window.addEventListener('load', function () {
    /* no tenant runtime and not held: nothing else will say so */
    if (!hold && !window.OmegaTenant) setTimeout(finish, 400);
  });
  /* a page restored from the back-forward cache is already painted */
  window.addEventListener('pageshow', function (e) { if (e.persisted) finish(); });
  /* leaving: the mark, before the next page can paint */
  d.addEventListener('click', function (e) {
    var t = e.target, a = t && t.closest ? t.closest('a[href]') : null;
    if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || a.target === '_blank' || a.hasAttribute('download')) return;
    var href = a.getAttribute('href') || '';
    if (!href || /^(#|javascript:|mailto:|tel:|sms:)/i.test(href)) return;
    try { var u = new URL(a.href, location.href); if (u.origin !== location.origin) return; if (u.pathname === location.pathname && u.search === location.search && u.hash) return; } catch (x) { return; }
    show();
  }, true);
  window.addEventListener('beforeunload', function () { show(); });
  window.OmegaSplash = { show: show, done: finish, get active() { return !done; } };
  if (boot) show(); else done = true;
})();
