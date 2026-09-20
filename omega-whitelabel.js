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
     .previewOrg()     the org a STAFF user has asked to be painted as, or ''

   ─────────────────────────────────────────────────────────────────────────────
   STAFF PREVIEW  —  ?wlpreview=<orgId>
   ─────────────────────────────────────────────────────────────────────────────
   A white label is the one feature whose owner cannot see it. orgId IS the
   email domain, so the only accounts that resolve to cleancell.us are Clean
   Cell's own — and ClearSky has no mailbox there. Demonstrating, reviewing or
   supporting a white label therefore meant signing in as the customer or
   editing their data, and CLAUDE.md already forbids the second ("Test as a
   tenant using adminDomains preview, not by editing their data").

   So: ?wlpreview=cleancell.us paints this page as that tenant.

   IT CHANGES THE PAINT AND NEVER THE SCOPE. That sentence is the whole
   security argument and it is enforced below rather than promised: hydrate()
   in preview mode pins CLEARSKY_CONFIG.tenant.orgId to the REAL signed-in
   org and copies only presentation keys out of the previewed record. A staff
   user in preview still reads and writes their own projects, because every
   read is scoped by that orgId. A preview that moved it would be an
   impersonation feature wearing a branding feature's clothes.

   THE GATE IS FIRESTORE, NOT THIS FILE. Preview works by reading
   omega_orgs/{other org}, which the rules allow only for ClearSky staff
   (isAdmin()). A tenant who discovers the parameter gets a permission error
   and no preview. The adminDomains() check here exists so the BANNER and the
   messaging are right for the person who can use it — it is not the control.

   IT IS DELIBERATELY NOT STICKY. It lives in the URL and nowhere else: no
   sessionStorage, no cookie. A staff user who closes the tab is out of it,
   and nobody can be left in a preview they have forgotten they are in. The
   banner says so on screen for the same reason.
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
    paintPreviewBanner();
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

  /* ── The preview, once there is a user to check ────────────────────────
     previewOrg() needs firebase.auth().currentUser to know whether the
     person asking is staff, and on first script run there is none. So the
     answer is forgotten and re-asked when sign-in resolves, and the hydrate
     is fired from there. Without this the preview would need a second page
     load, which everybody would read as "it does not work".

     Fires on EVERY page that loads this file, not just the editor: a staff
     user previewing Clean Cell wants the whole signed-in surface painted, and
     omega-tenant.js has already put the REAL tenant on CLEARSKY_CONFIG by
     then — which is exactly the orgId hydrate() keeps. */
  (function bootPreview() {
    if (!global.location || !/[?&]wlpreview=/i.test(String(global.location.search || ''))) return;
    var fired = false;
    function go() {
      _forgetPreview();
      if (!previewOrg() || fired) return;
      fired = true;
      hydrate();
    }
    try {
      var fb = global.firebase;
      if (fb && fb.auth && fb.apps && fb.apps.length) {
        fb.auth().onAuthStateChanged(function (u) { if (u) go(); });
        if (fb.auth().currentUser) go();
        return;
      }
    } catch (e) {}
    /* No SDK yet (script order, or a page that boots Firebase later). Poll
       briefly rather than give up — bounded, so a page without Firebase at
       all costs ten seconds of nothing instead of a leaked interval. */
    var n = 0;
    var t = global.setInterval && global.setInterval(function () {
      if (fired || ++n > 50) { global.clearInterval(t); return; }
      try {
        var f = global.firebase;
        if (f && f.auth && f.apps && f.apps.length && f.auth().currentUser) {
          global.clearInterval(t); go();
        }
      } catch (e2) {}
    }, 200);
  })();

  /* ── HYDRATE: THE WHITE LABEL ON A PAGE THAT HAS NO TENANT RUNTIME ────
     omega-tenant.js is what normally puts the block on CLEARSKY_CONFIG, and
     every page that signs users in loads it. editor.html does NOT — it has
     its own brand resolution predating omega-brand.js — and wiring the tenant
     runtime into a 162k-line page brings the HOSTNAME LOCK with it: a page
     that currently boots anywhere would start refusing unregistered hosts,
     including whatever the site-agent MCP is pointed at.

     That lock is a real security property and the editor should eventually
     have it. It is a deliberate, separately-tested change — not a passenger
     on a branding one. So this reads the ONE document the white label needs,
     directly, for pages in that position.

     It is not a way around the lock: it adds branding and removes nothing.
     The editor is exactly as reachable after this as before. Said plainly
     because "we skipped the security control to ship the logo" is the
     sentence this comment exists to prevent somebody writing later.

     Reads omega_orgs/{orgId} — a tenant may read their OWN record, so this
     needs no rule change and no mirror. Resolves the org from whatever the
     page knows; on the editor that is the signed-in user's email domain.

     ── WHICH ORG GETS PAINTED, AND WHICH ORG OWNS THE DATA ───────────────
     Normally the same one, and then there is nothing to say. Under
     ?wlpreview= they differ, and keeping them apart is the safety property:

       PAINTED  = the previewed org's record (name, logo, whiteLabel)
       SCOPED   = resolveOrg(), the signed-in user's own org, ALWAYS

     So `orgId` below is only ever assigned from resolveOrg(), never from the
     org whose record was read. Everything downstream — projects, layouts,
     toolData, the storefront catalogue — keys off that value, so a preview
     cannot reach another tenant's data even by accident. If you are editing
     this function, that is the line not to move.

     Resolves the whiteLabel block (or null). Never rejects. */
  function hydrate(orgId) {
    return Promise.resolve().then(function () {
      var pv = previewOrg();
      var mine = String(resolveOrg() || '').toLowerCase();
      /* An explicit argument wins, then the preview, then whoever is signed
         in. The preview outranks the signed-in org because that IS the
         request; it does not outrank a caller who named an org outright. */
      var org = String(orgId || pv || mine || '').toLowerCase();
      if (!org) return null;
      var fb = global.firebase;
      if (!fb || !fb.firestore || !fb.apps || !fb.apps.length) return null;
      return fb.firestore().collection('omega_orgs').doc(org).get().then(function (d) {
        if (!d || !d.exists) return null;
        var o = d.data() || {};
        var c = cfg();
        /* Scope, not paint. On a page with no tenant runtime (the editor)
           this is where CLEARSKY_CONFIG.tenant is born, and it is born with
           the SIGNED-IN org — never with `org`, which under preview is
           somebody else's. */
        if (!c.tenant) c.tenant = { orgId: mine || org };
        /* The NAME and LOGO too, not just the platform string: an editor that
           says "Clean Cell Power Platform" in the chrome and then prints
           "Your Company" on the proposal has not been white-labelled. */
        if (o.name) c.tenant.clientName = o.name;
        if (o.logoUrl) c.tenant.logo = o.logoUrl;
        if (o.colors) c.tenant.colors = o.colors;
        if (o.exportBrand) c.tenant.exportBrand = o.exportBrand;
        /* WHICH PRODUCT, not which paint. omega-editor-mode.js reads this to
           decide whether the editor is the full platform or the cut-down BESS
           designer a partner resells. It rides this read because this document
           is already being fetched; a second read for one string would be a
           second thing to keep in step. Absent means 'full' — see that file's
           header on why the mode fails OPEN. */
        if (o.editorMode) c.tenant.editorMode = String(o.editorMode);
        c.tenant.whiteLabel = o.whiteLabel || null;
        if (pv && org === pv) c.tenant.wlPreviewOf = pv;
        apply();
        return c.tenant.whiteLabel;
      }, function () { return null; });
    })['catch'](function () { return null; });
  }

  /* ── Staff preview ────────────────────────────────────────────────────────
     Reads the ONE list of ClearSky domains that already exists — omega-brand's
     adminDomains(), fed by /config.js — rather than starting a second one.
     CLAUDE.md records what three copies of orgAlias() cost; a second copy of
     "who is staff" would cost more, because the two would disagree about
     somebody's access rather than about a tenant's name. */
  function adminDomains() {
    try {
      var B = global.OmegaBrand;
      if (B && typeof B.adminDomains === 'function') {
        var l = B.adminDomains();
        if (l && l.length) return l;
      }
      var c = cfg();
      if (c.adminDomains && c.adminDomains.length) return c.adminDomains;
    } catch (e) {}
    return [];
  }

  function signedInDomain() {
    try {
      var fb = global.firebase;
      if (fb && fb.auth && fb.apps && fb.apps.length) {
        var u = fb.auth().currentUser;
        if (u && u.email) return String(u.email).toLowerCase().split('@')[1] || '';
      }
    } catch (e) {}
    return '';
  }

  function isStaffDomain() {
    var d = signedInDomain();
    if (!d) return false;
    var list = adminDomains();
    for (var i = 0; i < list.length; i++) {
      if (String(list[i]).toLowerCase() === d) return true;
    }
    return false;
  }

  /* '' unless a ClearSky user has asked, in the URL, to be painted as one
     named tenant. Lowercased and constrained to a domain shape so the value
     cannot carry a path and reach a document nobody meant to name. */
  var _previewChecked = false, _previewOrg = '';
  function previewOrg() {
    if (_previewChecked) return _previewOrg;
    _previewChecked = true;
    try {
      var q = String((global.location && global.location.search) || '');
      var m = /[?&]wlpreview=([^&#]+)/i.exec(q);
      if (!m) return _previewOrg;
      var want = decodeURIComponent(m[1]).toLowerCase().trim();
      if (!/^[a-z0-9][a-z0-9.-]{2,80}\.[a-z]{2,24}$/.test(want)) return _previewOrg;
      if (!isStaffDomain()) return _previewOrg;
      _previewOrg = want;
    } catch (e) {}
    return _previewOrg;
  }
  /* Re-check once sign-in lands: previewOrg() is often asked before
     firebase.auth() has a user, and a preview that needed a page reload to
     appear would send somebody to the conclusion that it is broken. */
  function _forgetPreview() { _previewChecked = false; _previewOrg = ''; }

  /* A banner, because a staff user looking at somebody else's brand must
     never be in any doubt about which of the two things they are looking at.
     Inserted by this file rather than shipped per page: a page that forgot it
     would be a page where the doubt exists. */
  function paintPreviewBanner() {
    if (!global.document || !document.body) return;
    var org = previewOrg();
    var id = 'omega-wl-preview-bar';
    var bar = document.getElementById(id);
    if (!org) { if (bar && bar.parentNode) bar.parentNode.removeChild(bar); return; }
    if (!bar) {
      bar = document.createElement('div');
      bar.id = id;
      bar.setAttribute('role', 'status');
      bar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:2147483000;'
        + 'background:#7a2e00;color:#fff;font:600 12px/1.45 system-ui,-apple-system,Segoe UI,sans-serif;'
        + 'padding:7px 12px;text-align:center;letter-spacing:.01em;'
        + 'box-shadow:0 -2px 10px rgba(0,0,0,.28)';
      document.body.appendChild(bar);
    }
    bar.textContent = 'ClearSky staff preview — painted as ' + org
      + '. Your own data is unchanged and still scoped to '
      + (resolveOrg() || 'your org') + '. Drop ?wlpreview= from the URL to leave.';
  }

  /* The org that OWNS THIS SESSION'S DATA. Never the previewed org — see
     hydrate(). Mirrors the alias fold the rules use
     — FIFTH copy of that map in the estate, which CLAUDE.md already records
     as a wart; kept local so this file works on a page that defines none of
     the other resolvers. */
  var ORG_ALIAS = { 'fenecon.de': 'fenecon.com', 'fenecon.us': 'fenecon.com' };
  function resolveOrg() {
    try {
      if (global.OMEGA_WORKSPACE && global.OMEGA_WORKSPACE.orgId) return global.OMEGA_WORKSPACE.orgId;
      var c = cfg();
      if (c.tenant && c.tenant.orgId) return c.tenant.orgId;
      if (typeof global._projOrgId === 'function') { var p = global._projOrgId(); if (p) return p; }
      var fb = global.firebase;
      if (fb && fb.auth && fb.apps && fb.apps.length) {
        var u = fb.auth().currentUser;
        if (u && u.email) {
          var d = String(u.email).toLowerCase().split('@')[1] || '';
          return ORG_ALIAS[d] || d;
        }
      }
    } catch (e) {}
    return '';
  }

  global.OmegaWhiteLabel = {
    PLATFORM:      PLATFORM,
    hydrate:       hydrate,
    resolveOrg:    resolveOrg,
    block:         block,
    active:        active,
    platformName:  platformName,
    shortName:     shortName,
    attribution:   attribution,
    markUrl:       markUrl,
    supportEmail:  supportEmail,
    previewOrg:    previewOrg,
    isStaffDomain: isStaffDomain,
    apply:         apply,
    _forgetPreview: _forgetPreview    /* tests */
  };
})(window);
