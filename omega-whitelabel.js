/* ═══════════════════════════════════════════════════════════════════════════════
   ClearSky-OMEGA · White-Label Layer  (omega-whitelabel.js)
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   ─────────────────────────────────────────────────────────────────────────────
   WHAT THIS FILE DOES
   ─────────────────────────────────────────────────────────────────────────────
   omega-brand.js answers "which TENANT is this and what does it look like?".
   It already paints the tenant's name and logo into the chrome, and it has
   always done that well. What it does NOT do is change what the PLATFORM is
   called: platformName() reads one key off /config.js and every deployment
   returns 'ClearSky-OMEGA'.

   That is the whole difference between a branded tenant and a white-labelled
   one. A branded tenant is Clean Cell using ClearSky-OMEGA and being told so.
   A white-labelled tenant is Clean Cell's own platform, which happens to be
   ClearSky-OMEGA underneath — and whose end customers are never told, because
   they are Clean Cell's customers, not ours.

   So this file owns exactly one question: WHAT IS THE PLATFORM CALLED HERE,
   and what carries its mark? It is deliberately small, because the answer has
   to be the same on every page and a big file would drift.

   ─────────────────────────────────────────────────────────────────────────────
   THE CONFIG BLOCK
   ─────────────────────────────────────────────────────────────────────────────
   Lives on the tenant record, mirrored to tenant_public so it paints BEFORE
   sign-in (the login screen is the first place a white label has to hold —
   a Clean Cell employee who sees "ClearSky-OMEGA" on the door has already
   learned the thing the contract says they would not):

     omega_orgs/{orgId}.whiteLabel = {
       enabled:        true,
       platformName:   'Clean Cell Power Platform',
       shortName:      'Clean Cell',        // tight spaces: chips, badges
       attribution:    'powered-by',        // 'powered-by' | 'none'
       attributionText:'Powered by ClearSky OMEGA',
       markUrl:        '/tenants/cleancell/mark-white.png',
       supportEmail:   'support@cleancell.us',
       embed: { ... }                        // see omega-embed / api/embed-*
     }

   ── ATTRIBUTION IS A CONTRACT TERM, NOT A DEFAULT ────────────────────────
   `attribution` defaults to 'powered-by' and that default is deliberate.
   Removing our name from a product we operate is something a customer BUYS;
   it should never happen because somebody forgot to set a field. Set it to
   'none' only for an account whose agreement actually says so.

   ── WHAT THIS CANNOT REACH ───────────────────────────────────────────────
   Text baked into a tool's own markup or into a PDF it draws. There are
   ~40 such strings across the tool estate (grep "ClearSky-OMEGA" and
   "Powered by ClearSky"). Sweeping every text node on the page to find them
   would be a rewrite of arbitrary customer content on every render, which is
   a worse bug than the one it fixes. Instead:

       <span data-omega-platform>ClearSky-OMEGA</span>

   marks a string as the platform's name and this file owns it from then on.
   Tools are converted as they are touched; until one is, it still says
   ClearSky-OMEGA, which is honest and is the pre-existing behaviour.
   docs/WHITE-LABEL.md tracks the conversion.

   LOAD ORDER — directly after omega-tenant.js, which is what puts the
   tenant (and therefore the whiteLabel block) on CLEARSKY_CONFIG:

       /config.js · /omega-brand.js · /omega-tenant.js · /omega-whitelabel.js

   ES5. No build step.

   PUBLIC API — window.OmegaWhiteLabel
     .active()         true when this tenant is white-labelled
     .block()          the raw whiteLabel object (or null)
     .platformName()   what to call the platform here
     .shortName()      the tight-space form
     .attribution()    the line to print, or '' when the contract removes it
     .markUrl()        the mark to use in dark chrome
     .supportEmail()   who the tenant's own users should write to
     .apply()          repaint (idempotent; safe to call any number of times)
   ═══════════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var PLATFORM = 'ClearSky-OMEGA';

  /* Images that ARE the ClearSky mark. A white-labelled deployment swaps
     these for the tenant's mark; every other image on the page is content
     and is left alone. Matched on the file name so a tenant folder copy or
     a cache-busting query string still matches. */
  var MARK_SRC = /(clearsky-omega-mark|omega-logo|omega-mark)[-a-z0-9]*\.(png|svg)/i;

  function cfg() { return global.CLEARSKY_CONFIG || (global.CLEARSKY_CONFIG = {}); }

  function tenant() {
    var c = cfg();
    return (c.tenant && c.tenant.orgId) ? c.tenant : null;
  }

  /* The block, from wherever it landed. omega-tenant.js copies it out of
     tenant_public onto the tenant object; a legacy /config.js may carry it
     inline. Neither is required — absent means "not white-labelled", which
     is the correct answer for every tenant but a handful. */
  function block() {
    var t = tenant();
    var wl = (t && t.whiteLabel) || cfg().whiteLabel || null;
    return (wl && typeof wl === 'object') ? wl : null;
  }

  function active() {
    var wl = block();
    return !!(wl && wl.enabled !== false && wl.platformName);
  }

  function platformName() {
    var wl = block();
    if (active()) return String(wl.platformName);
    return cfg().platformName || PLATFORM;
  }

  function shortName() {
    var wl = block();
    if (!active()) return platformName();
    return String(wl.shortName || wl.platformName);
  }

  /* '' means print nothing. Any other value is a line the page may show in
     a footer. Note the default: a white label with no explicit `attribution`
     still carries our name. */
  function attribution() {
    var wl = block();
    if (!active()) return '';
    var mode = wl.attribution || 'powered-by';
    if (mode === 'none') return '';
    return String(wl.attributionText || 'Powered by ClearSky OMEGA');
  }

  function markUrl() {
    var wl = block(), t = tenant();
    if (!active()) return '';
    return String(wl.markUrl || (t && t.logo) || '');
  }

  function supportEmail() {
    var wl = block();
    return (wl && wl.supportEmail) ? String(wl.supportEmail) : '';
  }

  /* ── Painting ─────────────────────────────────────────────────────────── */

  /* Wrap OmegaBrand.platformName so every existing caller — paintAuth's
     #auth-platform, paintTitle's fallback, anything a tool wrote against the
     documented API — gets the white-labelled answer with no edit. Same
     technique omega-tenant.js uses on OmegaBrand.resolve, and guarded the
     same way so a double load does not wrap a wrapper. */
  function wrapBrand() {
    var B = global.OmegaBrand;
    if (!B || B._wlWrapped) return;
    B.platformName = platformName;
    B._wlWrapped = true;
  }

  function setTokens() {
    if (!global.document || !document.documentElement) return;
    var el = document.documentElement;
    /* A class, so a page can hide or restyle our own marks in CSS without
       having to know anything about this file. */
    if (active()) el.className += (el.className ? ' ' : '') + 'omega-white-label';
    var wl = block();
    if (!wl) return;
    var s = el.style;
    if (wl.accent) s.setProperty('--wl-accent', wl.accent);
    if (wl.ink) s.setProperty('--wl-ink', wl.ink);
  }

  /* Elements that have declared themselves to be the platform's name. */
  function paintPlatformText() {
    if (!global.document || !document.querySelectorAll) return;
    var name = platformName();
    var list = document.querySelectorAll('[data-omega-platform]');
    for (var i = 0; i < list.length; i++) {
      /* An element may ask for a specific form: data-omega-platform="short". */
      var want = list[i].getAttribute('data-omega-platform');
      list[i].textContent = (want === 'short') ? shortName() : name;
    }
  }

  /* Swap our mark for theirs. Only images whose src IS the ClearSky mark, and
     only when the tenant actually gave us one to swap in — an empty markUrl
     must leave the existing image alone rather than break it to a 404.

     HIDDEN, NOT BLANKED, when a white label has no mark of its own: a broken
     image is worse than no image, and our mark on their platform is worse
     than both. */
  function paintMarks() {
    if (!global.document || !document.querySelectorAll) return;
    if (!active()) return;
    var url = markUrl();
    var imgs = document.querySelectorAll('img');
    for (var i = 0; i < imgs.length; i++) {
      var img = imgs[i];
      var src = img.getAttribute('src') || '';
      var declared = img.hasAttribute('data-omega-mark');
      if (!declared && !MARK_SRC.test(src)) continue;
      if (url) {
        if (img.getAttribute('src') !== url) { img.setAttribute('src', url); img.alt = shortName(); }
      } else {
        img.style.display = 'none';
      }
    }
  }

  /* A footer line, for pages that asked for one by shipping the element.
     Nothing is inserted into a page that did not ask. */
  function paintAttribution() {
    if (!global.document || !document.querySelectorAll) return;
    var text = attribution();
    var list = document.querySelectorAll('[data-omega-attribution]');
    for (var i = 0; i < list.length; i++) {
      list[i].textContent = text;
      list[i].style.display = text ? '' : 'none';
    }
  }

  function apply() {
    wrapBrand();
    setTokens();
    paintPlatformText();
    paintMarks();
    paintAttribution();
  }

  /* ── Boot ─────────────────────────────────────────────────────────────────
     Run now for the synchronous case (a cached tenant_public, or a legacy
     /config.js that pins the tenant inline), then again on each event that
     can change the answer. omega-tenant.js fires 'omega:tenant' when the
     hostname resolves and 'omega:entitlements' after sign-in; the branding
     can arrive at either, and a white label that only takes effect on the
     second page load is not a white label. */
  apply();
  if (global.addEventListener) {
    global.addEventListener('omega:tenant', apply);
    global.addEventListener('omega:entitlements', apply);
    if (global.document && document.addEventListener) {
      document.addEventListener('DOMContentLoaded', apply);
    }
  }

  global.OmegaWhiteLabel = {
    PLATFORM:      PLATFORM,
    block:         block,
    active:        active,
    platformName:  platformName,
    shortName:     shortName,
    attribution:   attribution,
    markUrl:       markUrl,
    supportEmail:  supportEmail,
    apply:         apply
  };
})(window);
