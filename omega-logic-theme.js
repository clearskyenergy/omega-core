/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   omega-logic-theme.js — the tenant's colours, and ONE chrome for every
   office page.

   apply(brand)  paints the tenant's colours and name.
   chrome(opts)  paints the same header (name · who · Sign out) and the same
                 left navigation on every office page, in the order the
                 business runs: sell → build → stock → deliver → money →
                 setup. Website, installation and the URL generator are
                 ClearSky's to maintain and appear only for a ClearSky owner.
                 After the page's first render it lands on the section the
                 address names (#hash, or #detail for ?order=) — land().
   signInHref()  Omega Logic's one front door, coming back to this page.
                 Sign out goes there, and an office page opened signed out
                 offers it in its header (watchSignIn).
   hub(input)    the office's hex-hub counts and captions, ONE computation
                 for the desktop dashboard and the Omega Logic app, so the
                 two surfaces count the same things.
   moneyTiles(t) the money tiles from the receivables ledger's own totals
                 (the server's receivables.totals(), what Accounting prints).
   words / when / day / count / plainError
                 plain words for what the endpoints send as codes, ISO times
                 and counts, and for a request the network dropped.
                 ES5, no build step, like every shared runtime file. */
(function () {
  'use strict';
  /* Every Omega Logic page wears the product's home-screen identity: a
     phone that adds ANY office page to its home screen gets the Hex grid
     icon and the name "Omega Logic", never a letter tile made from the
     page title. (The office app declares these statically; a desktop
     office page gets them here, before anyone can tap Share.) */
  try { (function homeScreen() {
    /* office and plant pages only: a customer page (portal, customer app,
       storefront, Editor Lite, customer POs) wears the SUPPLIER's name */
    if (typeof location === 'undefined' || typeof document === 'undefined' || !document.head || !document.createElement) return;
    if (!/^\/(omega-logic|logic-[a-z-]+|office\/|plant\/|portals\/customer\/admin)/.test(location.pathname || '')) return;
    var h = document.head;
    if (!h.querySelector('link[rel="apple-touch-icon"]')) { var l = document.createElement('link'); l.rel = 'apple-touch-icon'; l.href = '/icons/omega-logic-180.png'; h.appendChild(l); }
    if (!h.querySelector('meta[name="apple-mobile-web-app-title"]')) { var m = document.createElement('meta'); m.name = 'apple-mobile-web-app-title'; m.content = 'Omega Logic'; h.appendChild(m); }
    if (!h.querySelector('link[rel="icon"]')) { var f = document.createElement('link'); f.rel = 'icon'; f.type = 'image/png'; f.href = '/icons/omega-logic-192.png'; h.appendChild(f); }
  })(); } catch (e) { /* never break a page over an icon */ }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  /* The fill behind a filled button's white text: the colour itself when
     it already reads (WCAG AA, 4.5:1 against white), else the same hue
     darkened until it does. A light tenant colour is common, and white on
     it is unreadable. */
  function luminance(rgb) { return rgb.map(function (v) { v = v / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }).reduce(function (t, v, i) { return t + v * [0.2126, 0.7152, 0.0722][i]; }, 0); }
  function contrastWithWhite(rgb) { return 1.05 / (luminance(rgb) + 0.05); }
  function fillFor(hex) {
    var rgb = [1, 3, 5].map(function (i) { return parseInt(hex.slice(i, i + 2), 16); });
    for (var k = 0; k < 40 && contrastWithWhite(rgb) < 4.6; k++) rgb = rgb.map(function (v) { return Math.floor(v * 0.92); });
    return '#' + rgb.map(function (v) { return ('0' + v.toString(16)).slice(-2); }).join('');
  }
  function apply(brand) {
    brand = brand || {}; var style = document.documentElement.style;
    [['primary','--brand'],['primary','--cta'],['primary','--green'],['primary','--brand-d'],['accent','--accent'],['ink','--ink']].forEach(function (p) {
      if (/^#[0-9a-f]{6}$/i.test(brand[p[0]] || '')) style.setProperty(p[1], brand[p[0]]);
    });
    if (/^#[0-9a-f]{6}$/i.test(brand.primary || '')) {
      var rgb=[1,3,5].map(function(i){return parseInt(brand.primary.slice(i,i+2),16);}).join(',');
      style.setProperty('--brand-soft','rgba('+rgb+',0.13)');
      style.setProperty('--brand-fill', fillFor(brand.primary));
    }
    document.body.classList.add('logic-theme');
    /* Only when a name was given: a colour-only call (a theme preview) must
       not rename anything. The office header's "Omega Logic" is marked
       data-product-name, never data-brand-name, so no tenant name reaches it. */
    if (brand.name) Array.prototype.forEach.call(document.querySelectorAll('[data-brand-name]'), function (e) { e.textContent = brand.name; });
  }

  /* Back to the product's own colours (after a preview of a tenant's). */
  function reset() { var style = document.documentElement.style; ['--brand', '--cta', '--green', '--brand-d', '--accent', '--ink', '--brand-soft', '--brand-fill'].forEach(function (p) { style.removeProperty(p); }); }

  /* Who is a ClearSky owner is decided by every endpoint; this only
     remembers, for the pages that do not say, whether to SHOW the ClearSky
     group. Showing a link is not access — each page refuses on its own. */
  function ownerFlag(v) {
    try {
      if (v === true) sessionStorage.setItem('omega_logic_owner', '1');
      if (v === false) sessionStorage.removeItem('omega_logic_owner');
      return v === true || (v == null && sessionStorage.getItem('omega_logic_owner') === '1');
    } catch (e) { return v === true; }
  }
  /* The same for the Team page (D2): the office endpoint says whether this
     person may add and disable the workspace's people (access.team — an
     active owner or administrator, or ClearSky); pages that do not say
     remember it for THIS workspace only. api/logic-team.js refuses on its
     own whatever is shown. */
  function teamFlag(org, v) {
    try {
      if (v === true && org) sessionStorage.setItem('omega_logic_team', org);
      if (v === false && sessionStorage.getItem('omega_logic_team') === org) sessionStorage.removeItem('omega_logic_team');
      return v === true || (v == null && !!org && sessionStorage.getItem('omega_logic_team') === org);
    } catch (e) { return v === true; }
  }

  /* The same for the Omega Logic PARTS a workspace holds (Phase 8): the
     office endpoint says (access.parts — plant, materials, logistics,
     customer; every one on a legacy subscription); pages that do not say
     remember it for THIS workspace only. Not said means everything is
     shown, as before; a list that was said, even an empty one, is what the
     package holds. Showing a link is never access: each endpoint refuses
     the part it owns on its own (logic-access.requirePart). */
  var PARTS = ['plant', 'materials', 'logistics', 'customer'];
  function partsFlag(org, v) {
    try {
      if (Array.isArray(v)) { v = v.filter(function (p) { return PARTS.indexOf(p) >= 0; }); if (org) sessionStorage.setItem('omega_logic_parts', org + '|' + v.join(',')); return v; }
      if (v == null && org) { var s = sessionStorage.getItem('omega_logic_parts') || '', i = s.indexOf('|'); if (i > 0 && s.slice(0, i) === org) return s.slice(i + 1) ? s.slice(i + 1).split(',') : []; }
      return null;
    } catch (e) { return Array.isArray(v) ? v.slice() : null; }
  }
  /* is this part shown: not said (null) shows everything */
  function holds(parts, part) { return !part || !Array.isArray(parts) || parts.indexOf(part) >= 0; }

  /* opts.team: show Team under Setup (an owner or administrator, or ClearSky)
     opts.parts: the Omega Logic parts held (an array), or null for all. A
     link's fourth field names the part whose endpoint serves it; a group
     with nothing left is not drawn. */
  function groups(org, owner, opts) {
    opts = opts || {};
    var q = '?org=' + encodeURIComponent(org), e = encodeURIComponent(org), parts = owner ? null : opts.parts;
    var g = [
      ['Run the business', [
        ['dashboard', 'Dashboard', '/omega-logic' + q],
        ['orders', 'Orders', '/omega-logic' + q + '#orders'],
        ['pos', 'Company POs', '/po-inbox?office=1&org=' + e],
        ['customers', 'Customers', '/portals/customer/admin.html' + q],
        ['officeapp', 'Office app', '/office/app' + q]]],
      ['Build', [
        ['woboard', 'Work order board', '/plant/work-orders.html' + q, 'plant'],
        ['works', 'Work orders & registration', '/plant/' + q, 'plant'],
        ['board', 'Plant board', '/plant/manager.html' + q, 'plant'],
        ['stations', 'Stations & tablets', '/plant/manager.html' + q + '#stations', 'plant'],
        ['app', 'Plant app', '/plant/app' + q, 'plant']]],
      ['Stock & supply', [
        /* finished units on the shelf are the plant's (api/logic-plant page=stock) */
        ['inventory', 'Inventory', '/logic-inventory.html' + q, 'plant'],
        ['materials', 'Materials plan', '/logic-materials.html' + q, 'materials'],
        ['purchasing', 'Purchase orders', '/logic-materials.html' + q + '#po', 'materials'],
        ['vendors', 'Vendors & prices', '/logic-materials.html' + q + '#suppliers', 'materials']]],
      ['Deliver', [
        ['shipping', 'Shipping & receiving', '/logic-logistics.html' + q, 'logistics'],
        ['custody', 'Sites & custody', '/logic-custody.html' + q, 'logistics'],
        ['register', 'Fleet register', '/logic-register.html' + q, 'logistics'],
        /* the plant board's own Quality view: holds, failed tests and
           routing exceptions (a serial's record is looked up from Work
           orders & registration) */
        ['quality', 'Quality & holds', '/plant/manager.html' + q + '#quality', 'plant']]],
      ['Money', [
        ['cash', 'Cash flow', '/omega-logic' + q + '#cash'],
        ['accounting', 'Accounting', '/logic-accounting.html' + q]]],
      ['Setup', [
        ['products', 'Products & bills', '/logic-catalog.html' + q]].concat(opts.team ? [
        ['team', 'Team', '/logic-team.html' + q]] : [], [
        ['settings', 'Settings', '/logic-settings.html' + q]])]
    ];
    if (owner) g.push(['ClearSky', [
      ['accounts', 'All OEM accounts', '/omega-logic'],
      ['admin', 'Subscribers & commissioning', '/logic-admin.html' + (org ? q : '')],
      ['website', 'Website & installation', '/whitelabel-setup.html' + q],
      ['experience', 'Customer experience', '/customer-start.html' + q],
      ['urls', 'URL generator', '/logic-urls.html' + q],
      ['kit', 'Apps & guides', '/logic-kit.html' + q],
      ['flow', 'Production flow', '/plant/manager.html' + q + '#flow'],
      ['mission', 'Jarvis Mission', '/mission?view=logic&org=' + e]]]);
    if (Array.isArray(parts)) g = g.map(function (x) { return [x[0], x[1].filter(function (l) { return holds(parts, l[3]); })]; }).filter(function (x) { return x[1].length; });
    return g;
  }

  /* ── the one front door (OFF-07) ─────────────────────────────────────────
     Omega Logic's sign-in is /omega-logic. Sign out goes there, and so does
     the link an office page offers when it is opened signed out; ?next=
     brings the person back to the page they were on (nextFor, which the
     front door reads). */
  var FRONT = '/omega-logic';
  var NEXT_OK = /^\/(logic-[a-z-]+(\.html)?|plant\/((index|manager|work-orders)(\.html)?)?|po-inbox(\.html)?|customer-po(\.html)?|portals\/customer\/admin(\.html)?|omega-logic)(\?[^#\s<>"'\x60]*)?(#[A-Za-z][\w-]*)?$/;
  function signInHref() {
    try {
      /* the front door itself, with its company in the address, is already the sign-in */
      if (/^\/omega-logic\/?$/.test(location.pathname)) return FRONT + (location.search || '');
      var here = location.pathname + (location.search || '') + (location.hash || '');
      return NEXT_OK.test(here) ? FRONT + '?next=' + encodeURIComponent(here) : FRONT;
    } catch (e) { return FRONT; }
  }
  /* The page a sign-in at the front door returns to: only one of this
     product's office pages on this site, and only for the company just
     opened (the ClearSky owner: any). Anything else is ignored and the
     person lands on the dashboard. `search` defaults to this address's. */
  function nextFor(org, any, search) {
    var n = '';
    try { n = new URLSearchParams(search == null ? location.search : search).get('next') || ''; } catch (e) { return ''; }
    if (!n || n.length > 600 || !NEXT_OK.test(n)) return '';
    var m = /[?&]org=([^&#]*)/.exec(n), at = '';
    try { at = m ? decodeURIComponent(m[1]).toLowerCase() : ''; } catch (e2) { return ''; }
    if (any) return n;
    return at && at === String(org || '').toLowerCase() ? n : '';
  }
  var OFFICE_PAGE = /^\/(logic-[a-z-]+(\.html)?|plant\/?|plant\/(index|manager|work-orders)(\.html)?|portals\/customer\/admin(\.html)?)$/;
  function officeSubPage(path, search) {
    if (OFFICE_PAGE.test(path || '')) return true;
    return /^\/(po-inbox|customer-po)(\.html)?$/.test(path || '') && /[?&]office=1(&|$)/.test(search || '');
  }
  /* signed out on an office page: one link in its header to the front
     door; signed in (or once chrome() repaints the header) it is gone */
  function paintSignedOut(out) {
    var el = document.getElementById('logic-signin');
    if (!out) { if (el && el.parentNode) el.parentNode.removeChild(el); return; }
    var header = document.querySelector('header');
    if (el || !header) return;
    el = document.createElement('a'); el.id = 'logic-signin'; el.className = 'logic-signin'; el.href = signInHref(); el.textContent = 'Sign in to Omega Logic →';
    header.appendChild(el);
  }
  function watchSignIn() {
    try {
      if (!officeSubPage(location.pathname, location.search)) return;
      if (window.firebase && firebase.apps && firebase.apps.length && firebase.auth) firebase.auth().onAuthStateChanged(function (u) { paintSignedOut(!u); });
    } catch (e) { /* the page's own sign-in message still stands */ }
  }
  try {
    if (typeof document !== 'undefined' && document.addEventListener && typeof location !== 'undefined') {
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watchSignIn);
      else if (typeof setTimeout === 'function') setTimeout(watchSignIn, 0);
    }
  } catch (e) {}

  /* ── land (OFF-04) ───────────────────────────────────────────────────────
     A link that names a section (/omega-logic?org=…#orders,
     /logic-materials.html?org=…#po) or an order (?order=…, whose detail is
     #detail) opens AT it, not at the top of the page. Called by chrome(),
     which pages call after their data arrives; the section is drawn just
     after, so it is looked for a few times, and looked for again while the
     panels above it fill in and push it down. Once per page load, and never
     once the person has scrolled on their own. */
  var LANDED = false;
  function landTarget(hash, search) {
    if (/^#[A-Za-z][\w-]{0,60}$/.test(hash || '')) return String(hash).slice(1);
    if (/[?&]order=[^&#]/.test(search || '')) return 'detail';
    return '';
  }
  function land(win, doc) {
    win = win || window; doc = doc || document;
    if (LANDED) return; LANDED = true;
    var id = landTarget(win.location.hash, win.location.search);
    if (!id || typeof win.setTimeout !== 'function') return;
    var tries = 0, at = null;
    function y() { return win.pageYOffset || (doc.documentElement && doc.documentElement.scrollTop) || 0; }
    function shown(el) { return !!el && !el.hidden && !(el.closest && el.closest('[hidden]')) && !(el.closest && el.closest('.logic-nav')); }
    function go(el) { if (el.scrollIntoView) el.scrollIntoView({ block: 'start' }); at = y(); }
    function attempt() {
      if (at === null && y() > 40) return;           /* they scrolled before it was drawn */
      var el = doc.getElementById(id);
      if (shown(el)) { go(el); settle(el, 0); return; }
      if (++tries < 16) win.setTimeout(attempt, tries < 5 ? 60 : 250);
    }
    /* the panels above fill in after the first paint: stay on the section
       while the person has not moved */
    function settle(el, n) {
      if (n >= 4) return;
      win.setTimeout(function () {
        if (Math.abs(y() - at) > 2) return;
        var top = el.getBoundingClientRect ? el.getBoundingClientRect().top : 0;
        if (Math.abs(top) > 4) go(el);
        settle(el, n + 1);
      }, n === 0 ? 300 : 700);
    }
    win.setTimeout(attempt, 0);
  }

  function chrome(o) {
    o = o || {};
    var org = String(o.org || ''), owner = ownerFlag(o.owner), name = 'Omega Logic';
    var team = owner || teamFlag(org, o.team) || o.current === 'team';
    /* the parts this workspace holds (Phase 8): said by the office endpoint,
       remembered for the pages that do not say; ClearSky sees every group */
    var parts = owner ? null : partsFlag(org, o.parts);
    /* Omega Logic is ClearSky's product and the tenant is a workspace in it
       (as QuickBooks is the app and the company is what you sign into): the
       header is always Omega Logic in its own colours, and says whose
       workspace this is. The tenant's white label is for what ITS customers
       see — the storefront, the customer portal and app, the editor. */
    var workspace = (o.brand && o.brand.workspace) || o.workspace || o.name || org;
    document.body.classList.add('logic-theme');
    /* header */
    var header = document.querySelector('header');
    if (header) {
      header.className = (header.className ? header.className + ' ' : '') + 'logic-chrome';
      /* The brand is the way home from every page of the workspace, the way it is on every
         site anyone has used; Home in the account nav says the same thing in words. An OEM's
         home is its dashboard; ClearSky's, with no org in the URL, is the directory of accounts. */
      var home = org ? '/omega-logic?org=' + encodeURIComponent(org) : '/omega-logic';
      header.innerHTML = '<div><a class="logic-home" href="' + esc(home) + '" title="Home"><b data-product-name>' + esc(name) + '</b></a><div class="muted logic-sub">' + esc([workspace, o.subtitle || (owner ? 'managed by ClearSky' : 'office workspace')].filter(Boolean).join(' · ')) + '</div></div>'
        + '<nav class="logic-who" aria-label="Account"><a href="' + esc(home) + '">Home</a><span id="who">' + esc(o.who || '') + '</span>'
        + (owner ? '<a href="/login">Where to?</a>' : '')
        + '<button type="button" id="signout" class="logic-signout">Sign out</button></nav>';
      var so = document.getElementById('signout');
      /* signed out, the page is Omega Logic's front door, which brings the
         person back here once they sign in again (never a dead end) */
      var after = o.afterSignOut || signInHref();
      so.onclick = function () {
        so.disabled = true;
        var done = function () { location.href = after; };
        try { if (window.firebase && firebase.auth) firebase.auth().signOut().then(done, done); else done(); } catch (e) { done(); }
      };
    }
    /* shell + nav */
    if (!org) { land(); return; }
    var main = document.querySelector('main'), shell = document.querySelector('.logic-shell'), nav = document.querySelector('.logic-nav');
    if (!shell && main) {
      shell = document.createElement('div'); shell.className = 'logic-shell';
      main.parentNode.insertBefore(shell, main); shell.appendChild(main); main.classList.add('logic-main');
    }
    if (!nav && shell) { nav = document.createElement('nav'); nav.className = 'logic-nav'; nav.setAttribute('aria-label', 'Office'); shell.insertBefore(nav, shell.firstChild); }
    if (nav) {
      var h = '';
      groups(org, owner, { team: team, parts: parts }).forEach(function (g) {
        h += '<p class="eyebrow">' + esc(g[0]) + '</p>';
        g[1].forEach(function (l) { h += '<a href="' + esc(l[2]) + '"' + (l[0] === o.current ? ' aria-current="page"' : '') + '>' + esc(l[1]) + '</a>'; });
      });
      if (o.local && o.local.length) {
        h += '<p class="eyebrow">On this page</p>';
        o.local.forEach(function (l) { h += '<a href="' + esc(l.href) + '" class="local"' + (l.id ? ' id="' + esc(l.id) + '"' : '') + (l.hidden ? ' hidden' : '') + '>' + esc(l.label) + '</a>'; });
      }
      nav.innerHTML = h;
    }
    land();
  }

  /* ── plain words (OFF-11) ────────────────────────────────────────────────
     The endpoints send codes (in_transit, po_needs_information), ISO times
     and bare counts; an office screen says them in words. */
  var WORDS = {
    in_transit: 'in transit', awaiting_serials: 'awaiting serials', not_started: 'not started', in_progress: 'in progress', on_hold: 'on hold',
    in_fulfilment: 'in production', in_fulfillment: 'in production', po_review: 'under review', po_needs_information: 'needs information',
    po_declined: 'declined', to_issue: 'to issue', awaiting_payment: 'awaiting payment', part_paid: 'part paid', not_required: 'not required',
    partially_received: 'partly received', part_received: 'partly received', wire_recorded: 'wire recorded', in_service: 'in service',
    quoted: 'priced', new: 'new', ordered: 'ordered', draft: 'draft', sent: 'sent', received: 'received', closed: 'closed'
  };
  /* where a company PO came from, as the office says it */
  var SOURCES = { customer: 'uploaded by the customer', 'customer-bulk': 'sent by the customer on the PO sheet', office: 'entered by the office',
    'office-bulk': 'entered by the office on the PO sheet', email: 'received by email', 'email-adapter': 'received by email' };
  function words(v) { var k = String(v == null ? '' : v); return Object.prototype.hasOwnProperty.call(WORDS, k) ? WORDS[k] : k.replace(/[_-]+/g, ' ').trim(); }
  function source(v) { var k = String(v == null ? '' : v); return Object.prototype.hasOwnProperty.call(SOURCES, k) ? SOURCES[k] : (k ? words(k) : ''); }
  function count(n, one, many) { n = Number(n) || 0; return n + ' ' + (n === 1 ? one : (many || one + 's')); }
  /* A time as the endpoints send it: ISO, a date (YYYY-MM-DD), epoch ms, or
     a Firestore timestamp that came through JSON as { _seconds } */
  function toDate(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'object' && !(v instanceof Date)) { var s = typeof v._seconds === 'number' ? v._seconds : typeof v.seconds === 'number' ? v.seconds : null; v = s == null ? null : s * 1000; if (v == null) return null; }
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return { d: new Date(v + 'T00:00:00Z'), dateOnly: true };
    var d = v instanceof Date ? v : new Date(v);
    return isNaN(d.getTime()) ? null : { d: d, dateOnly: false };
  }
  var DAY = { month: 'short', day: 'numeric', year: 'numeric' };
  function fmtDay(t) { try { return t.d.toLocaleDateString('en-US', t.dateOnly ? { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' } : DAY); } catch (e) { return t.d.toISOString().slice(0, 10); } }
  /* "Sep 24, 2026" */
  function day(v) { var t = toDate(v); return t ? fmtDay(t) : (typeof v === 'string' ? v : ''); }
  /* "Sep 24, 2026, 2:05 PM" (a date alone stays a date) */
  function when(v) {
    var t = toDate(v); if (!t) return typeof v === 'string' ? v : '';
    if (t.dateOnly) return fmtDay(t);
    try { return fmtDay(t) + ', ' + t.d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); } catch (e) { return fmtDay(t); }
  }
  /* A request the network dropped says so, never "Failed to fetch" */
  var NET = /^(Failed to fetch|NetworkError when attempting to fetch resource\.?|Load failed|Network request failed|The Internet connection appears to be offline\.?|The network connection was lost\.?)$/i;
  function plainError(e) {
    var m = String((e && e.message) || (typeof e === 'string' ? e : '') || '').trim();
    var offline = typeof navigator !== 'undefined' && navigator && navigator.onLine === false;
    if (offline || NET.test(m)) return 'No connection. Nothing was loaded or saved; try again when you are back online.';
    return m || 'Something went wrong. Try again.';
  }

  /* ── the office hub (OFF-14, D1) ─────────────────────────────────────────
     ONE count for the desktop dashboard (omega-logic.html) and the Omega
     Logic app (office/app.html): the same badges and captions from the same
     data, so the two never disagree. A badge is what needs a person; its
     caption says what the number is (one kind: that kind; several: how many
     need you). A count that has not arrived (null) shows no badge rather
     than a zero it cannot vouch for.
       input: { orders, owner, accounting, intake, follow, followErr,
                pending, plantRows, toConfirm, inTransit, short,
                outstandingCents, today,
                parts }   the Omega Logic parts held (Phase 8): a ring cell
                          whose part is not in the package is not drawn
                          (Plant · plant, Deliver · logistics, Stock ·
                          materials); not said draws all six
     Price and accept (D1): the server says per order whether the person
     looking may take the step (o.can) and whom it waits on (o.waitingOn);
     an order the viewer may price or accept is theirs to do, one waiting
     on somebody else is listed as waiting and never counted. */
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function todayIso() { var d = new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function addDays(s, n) { var d = new Date(String(s).slice(0, 10) + 'T00:00:00Z'); if (isNaN(d.getTime())) return ''; d.setUTCDate(d.getUTCDate() + (Number(n) || 0)); return d.toISOString().slice(0, 10); }
  function isoDay(v) { var t = toDate(v); return t ? t.d.toISOString().slice(0, 10) : ''; }
  function cap(n) { n = Number(n) || 0; return n > 99 ? '99+' : n > 0 ? String(n) : ''; }
  function kdollars(c) { var d = Number(c || 0) / 100; return d >= 1e6 ? '$' + (d / 1e6).toFixed(1) + 'M' : d >= 1e3 ? '$' + (d / 1e3).toFixed(1) + 'k' : '$' + Math.round(d); }
  function dollars(c) { return '$' + (Number(c || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function stageKey(o) { return o && o.stage ? o.stage.key : (o && o.status); }
  function openReq(o) { return ((o && o.requests) || []).filter(function (r) { return r && r.status === 'open'; }); }
  function unitsOf(o) { return ((o && o.items) || []).reduce(function (n, i) { return n + (Number(i && i.qty) || 0); }, 0); }
  function canDo(o, what, owner) { return o && o.can ? !!o.can[what] : !!owner; }
  function pricingStep(o) { return ['quote', 'priced'].indexOf(stageKey(o)) >= 0; }
  function company(o) { var c = (o && o.customer) || {}; return c.company || c.name || c.email || ''; }
  /* A pay link is drawn only when it is an https address with no user name
     or password in it (the endpoints check it too). */
  function safeUrl(u) {
    if (typeof u !== 'string' || !u || u.length > 1000 || /[\s<>"'`]/.test(u) || !/^https:\/\//i.test(u)) return '';
    try { var x = new URL(u); return x.protocol === 'https:' && !x.username && !x.password && x.hostname.indexOf('.') > 0 ? x.href : ''; } catch (e) { return ''; }
  }
  /* Every invoice with money still owed on it: to issue (billed on the
     workspace's own paper, not yet issued), overdue (past the order's terms
     from the day it was issued) or open; soonest due first. */
  function invoices(orders, accounting, today) {
    var now = today || todayIso(), out = [];
    (orders || []).forEach(function (o) {
      var l = o && o.logic; if (!l) return;
      var terms = (l.commercial && l.commercial.terms) || {}, tb = ((l.accounting) || accounting || 'quickbooks') === 'tenant';
      Object.keys(l.invoices || {}).forEach(function (k) {
        var i = l.invoices[k] || {}, amt = Number(i.amountCents) || 0, pd = Number(i.paidCents) || 0;
        if (!amt || pd >= amt || i.status === 'paid' || i.satisfied === true) return;
        var due = i.dueDate || i.dueAt ? isoDay(i.dueDate || i.dueAt) : i.issuedAt ? addDays(i.issuedAt, terms.dueDays) : '';
        out.push({ o: o, k: k, i: i, tb: tb, open: amt - pd, due: due, state: tb && !i.id ? 'issue' : due && due < now ? 'overdue' : 'open', pay: safeUrl(i.payUrl) });
      });
    });
    return out.sort(function (a, b) { return (a.due || '9') < (b.due || '9') ? -1 : (a.due || '9') > (b.due || '9') ? 1 : 0; });
  }
  /* the caption under a badge: one kind says itself, several say how many */
  function caption(parts, fallback) {
    var on = parts.filter(function (p) { return p[0] > 0; }), total = on.reduce(function (n, p) { return n + p[0]; }, 0);
    if (!on.length) return fallback || '';
    return on.length === 1 ? on[0][1] : total + ' need you';
  }
  function hub(x) {
    x = x || {};
    var orders = x.orders || [], owner = !!x.owner, today = x.today || todayIso(), s = { orders: orders };
    function actionable(o) { return pricingStep(o) && (canDo(o, 'price', owner) || canDo(o, 'accept', owner)); }
    s.inv = invoices(orders, x.accounting, today);
    s.toIssue = s.inv.filter(function (r) { return r.state === 'issue'; }).length;
    s.overdue = s.inv.filter(function (r) { return r.state === 'overdue'; }).length;
    s.withReq = orders.filter(function (o) { return openReq(o).length; });
    s.attention = orders.filter(function (o) { return stageKey(o) === 'exception'; });
    s.toPrice = orders.filter(actionable);
    s.waiting = orders.filter(function (o) { return pricingStep(o) && !actionable(o) && !openReq(o).length; });
    s.toShip = orders.filter(function (o) { return stageKey(o) === 'ship'; });
    s.shipUnits = s.toShip.reduce(function (n, o) { return n + unitsOf(o); }, 0);
    var intake = x.intake || {};
    s.review = (Number(intake.review) || 0) + (Number(intake.needsInfo) || 0);
    /* which company's PO waits (OFF-03): the office endpoint's list, by company */
    s.reviewBy = null;
    if (Array.isArray(intake.waiting)) {
      var by = {}; s.reviewBy = [];
      intake.waiting.forEach(function (p) {
        if (!p) return; var k = p.customerId || ('?' + (p.company || ''));
        if (!by[k]) { by[k] = { customerId: p.customerId || '', company: p.company || '', pos: [] }; s.reviewBy.push(by[k]); }
        by[k].pos.push(p);
      });
    }
    /* one row per order: an order with an open request is listed to answer,
       not again to fix or to price */
    s.needs = [];
    s.withReq.forEach(function (o) { s.needs.push({ o: o, why: count(openReq(o).length, 'customer request'), pill: 'answer' }); });
    s.attention.forEach(function (o) { if (!openReq(o).length) s.needs.push({ o: o, why: o.stage ? o.stage.next : 'needs attention', pill: 'fix' }); });
    s.toPrice.forEach(function (o) { if (!openReq(o).length) s.needs.push({ o: o, why: o.stage ? o.stage.next : 'price it', pill: canDo(o, 'price', owner) ? 'price' : 'accept' }); });
    /* a follow-up is due on its day; a task with no day is owed now */
    var follow = Array.isArray(x.follow) ? x.follow : [];
    s.follow = follow.filter(function (f) { var d = isoDay(f && f.followUpAt); return d ? d <= today : !!f && f.type === 'task'; });
    s.followLater = follow.length - s.follow.length;
    s.pending = x.pending == null ? null : Number(x.pending) || 0;
    s.rows = Array.isArray(x.plantRows) ? x.plantRows.filter(function (r) { return r && r.stage !== 'complete'; }) : null;
    s.late = s.rows ? s.rows.filter(function (r) { return r.late; }) : [];
    s.held = s.rows ? s.rows.filter(function (r) { return r.progress && r.progress.held > 0; }) : [];
    s.heldUnits = s.held.reduce(function (n, r) { return n + (Number(r.progress.held) || 0); }, 0);
    s.toConfirm = x.toConfirm == null ? null : Number(x.toConfirm) || 0;
    s.inTransit = x.inTransit == null ? null : Number(x.inTransit) || 0;
    s.short = x.short == null ? null : Number(x.short) || 0;
    s.count = s.needs.length + s.review + s.follow.length;
    var waitAdmin = s.waiting.some(function (o) { return o.waitingOn === 'admin'; });
    var sales = s.toPrice.length + s.review + s.withReq.length, people = s.follow.length + (s.pending || 0), deliver = s.shipUnits + (s.toConfirm || 0), money = s.toIssue + s.overdue;
    var d = new Date();
    s.items = [
      { key: 'today', label: 'Today', icon: '◷', badge: cap(s.count), hint: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) },
      { key: 'sales', label: 'Sales', icon: '▤', badge: cap(sales), hint: caption([[s.toPrice.length, s.toPrice.length + ' to price'], [s.withReq.length, count(s.withReq.length, 'request')], [s.review, count(s.review, 'PO') + ' to review']],
        s.waiting.length ? s.waiting.length + ' waiting on ' + (waitAdmin ? 'an admin' : 'ClearSky') : count(orders.length, 'order')) },
      { key: 'customers', label: 'Customers', icon: '◉', badge: cap(people), hint: caption([[s.follow.length, count(s.follow.length, 'follow-up') + ' due'], [s.pending || 0, (s.pending || 0) + ' asking to join']], 'CRM') },
      { key: 'plant', label: 'Plant', icon: '⚙', badge: cap(s.heldUnits), hint: s.rows ? (s.heldUnits ? s.heldUnits + ' on hold' : s.late.length ? s.late.length + ' late' : count(s.rows.length, 'work order')) : '' },
      { key: 'deliver', label: 'Deliver', icon: '◎', badge: cap(deliver), hint: caption([[s.shipUnits, count(s.shipUnits, 'unit') + ' to ship'], [s.toConfirm || 0, (s.toConfirm || 0) + ' to confirm']], s.inTransit != null ? s.inTransit + ' in transit' : '') },
      { key: 'stock', label: 'Stock', icon: '▦', badge: cap(s.short), hint: s.short == null ? '' : s.short ? count(s.short, 'part') + ' short' : 'nothing short' },
      { key: 'money', label: 'Money', icon: '$', badge: cap(money), hint: caption([[s.overdue, s.overdue + ' overdue'], [s.toIssue, s.toIssue + ' to issue']],
        x.outstandingCents == null ? '' : Number(x.outstandingCents) > 0 ? kdollars(x.outstandingCents) + ' open' : 'nothing open') }
    ];
    if (Array.isArray(x.parts)) s.items = s.items.filter(function (it) { return holds(x.parts, HUB_PART[it.key]); });
    return s;
  }
  /* which Omega Logic part each ring cell belongs to (the rest are the Office's) */
  var HUB_PART = { plant: 'plant', deliver: 'logistics', stock: 'materials' };
  /* Where "N company POs to review" goes (OFF-03): one row per company
     that has a PO waiting, saying whose it is; a company with one PO
     waiting opens that PO's review itself, a company with several opens its
     own queue. Without the office's list (an older server): the one row to
     the Company POs page, as before. */
  function reviewLinks(org, s) {
    var e = encodeURIComponent(org || ''), inbox = '/po-inbox?office=1&org=' + e;
    if (!s || !s.review) return [];
    if (!s.reviewBy || !s.reviewBy.length) return [{ title: count(s.review, 'company PO') + ' to review', sub: 'uploaded by customers; map the lines and destinations', href: inbox }];
    var listed = 0;
    var out = s.reviewBy.map(function (g) {
      var p = g.pos[0] || {}, one = g.pos.length === 1 && !!p.id && !!g.customerId, who = g.company || 'a customer';
      listed += g.pos.length;
      return { title: one ? (p.poNumber ? 'PO ' + p.poNumber : 'A PO') + ' from ' + who : count(g.pos.length, 'company PO') + ' from ' + who,
        sub: one ? words(p.status) + (p.createdAt ? ' · received ' + day(p.createdAt) : '') + ' · map the lines and destinations' : 'waiting for review · map the lines and destinations',
        href: one ? '/customer-po?org=' + e + '&office=1&customerId=' + encodeURIComponent(g.customerId) + '&intake=' + encodeURIComponent(p.id)
          : g.customerId ? inbox + '&customerId=' + encodeURIComponent(g.customerId) : inbox };
    });
    if (s.review > listed) out.push({ title: count(s.review - listed, 'more company PO') + ' to review', sub: 'on the Company POs page', href: inbox });
    return out;
  }

  /* ── the money tiles (OFF-02) ────────────────────────────────────────────
     The receivables ledger's own totals: the server runs
     api/_lib/receivables.js totals() over the orders shown, the same rule
     Accounting prints, and the page sums nothing. An invoice counts as
     invoiced once it is issued; To issue is its own tile (billed on the
     workspace's paper, not issued yet). No totals (an older server): the
     tiles say so rather than guess. */
  function moneyTiles(t) {
    var has = !!t && typeof t === 'object';
    function c(k) { return has && t[k] != null ? Number(t[k]) || 0 : null; }
    return [
      { k: 'invoiced', label: 'Invoiced', cents: c('invoicedCents'), note: has ? '' : 'see Accounting' },
      { k: 'received', label: 'Received', cents: c('receivedCents'), note: has && t.voidedCents ? dollars(t.voidedCents) + ' voided, not counted' : '' },
      { k: 'outstanding', label: 'Outstanding', cents: c('outstandingCents'), note: has ? 'on issued invoices' : '' },
      { k: 'overdue', label: 'Overdue', cents: c('overdueCents'), bad: has && Number(t.overdueCents) > 0, note: has && t.overdueCount ? count(t.overdueCount, 'invoice') : '' },
      { k: 'toIssue', label: 'To issue', cents: c('toIssueCents'), note: has ? 'not on an invoice yet' : '' }
    ];
  }
  function tileHtml(tl) {
    return '<div data-k="' + esc(tl.k) + '"' + (tl.bad ? ' class="bad"' : '') + '><small>' + esc(tl.label) + '</small><b>' + (tl.cents == null ? '—' : dollars(tl.cents)) + '</b>' + (tl.note ? '<small>' + esc(tl.note) + '</small>' : '') + '</div>';
  }
  /* The order stages, counted by the server's stage (api/_lib/office-stage.js
     totals().byStage) the same way on the dashboard strip and the app. */
  function stageTiles(byStage) {
    var b = byStage || {};
    function n() { var t = 0; for (var i = 0; i < arguments.length; i++) t += Number(b[arguments[i]]) || 0; return t; }
    return [
      { k: 'quote', label: 'Requests & quotes', n: n('quote', 'priced'), note: 'to price or accept' },
      { k: 'deposit', label: 'Awaiting deposit', n: n('deposit'), note: 'accepted, deposit not paid' },
      { k: 'build', label: 'In build', n: n('release', 'production', 'balance'), note: 'released to the plant' },
      { k: 'ship', label: 'Ready to ship', n: n('ship'), note: 'paid in full' },
      { k: 'shipped', label: 'Shipped', n: n('shipped', 'complete'), note: 'of the orders shown' },
      { k: 'attention', label: 'Needs attention', n: n('exception'), bad: n('exception') > 0, note: 'an exception to fix' }
    ];
  }

  window.OmegaLogicTheme = { apply: apply, reset: reset, chrome: chrome, groups: groups, holds: holds, partsHeld: partsFlag, signInHref: signInHref, nextFor: nextFor, officeSubPage: officeSubPage,
    land: land, landTarget: landTarget, words: words, source: source, count: count, day: day, when: when, plainError: plainError, fillFor: fillFor,
    hub: hub, invoices: invoices, reviewLinks: reviewLinks, moneyTiles: moneyTiles, tileHtml: tileHtml, stageTiles: stageTiles, company: company, safeUrl: safeUrl };
})();
