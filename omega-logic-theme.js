/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   omega-logic-theme.js — the tenant's colours, and ONE chrome for every
   office page.

   apply(brand)  paints the tenant's colours and name.
   chrome(opts)  paints the same header (name · who · Sign out) and the same
                 left navigation on every office page, in the order the
                 business runs: sell → build → stock → deliver → money →
                 setup. Website, installation and the URL generator are
                 ClearSky's to maintain and appear only for a ClearSky owner.
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
  function apply(brand) {
    brand = brand || {}; var style = document.documentElement.style;
    [['primary','--brand'],['primary','--cta'],['primary','--green'],['primary','--brand-d'],['accent','--accent'],['ink','--ink']].forEach(function (p) {
      if (/^#[0-9a-f]{6}$/i.test(brand[p[0]] || '')) style.setProperty(p[1], brand[p[0]]);
    });
    if (/^#[0-9a-f]{6}$/i.test(brand.primary || '')) {
      var rgb=[1,3,5].map(function(i){return parseInt(brand.primary.slice(i,i+2),16);}).join(',');
      style.setProperty('--brand-soft','rgba('+rgb+',0.13)');
    }
    document.body.classList.add('logic-theme');
    /* Only when a name was given: a colour-only call (a theme preview) must
       not rename anything. The office header's "Omega Logic" is marked
       data-product-name, never data-brand-name, so no tenant name reaches it. */
    if (brand.name) Array.prototype.forEach.call(document.querySelectorAll('[data-brand-name]'), function (e) { e.textContent = brand.name; });
  }

  /* Back to the product's own colours (after a preview of a tenant's). */
  function reset() { var style = document.documentElement.style; ['--brand', '--cta', '--green', '--brand-d', '--accent', '--ink', '--brand-soft'].forEach(function (p) { style.removeProperty(p); }); }

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

  function groups(org, owner) {
    var q = '?org=' + encodeURIComponent(org), e = encodeURIComponent(org);
    var g = [
      ['Run the business', [
        ['dashboard', 'Dashboard', '/omega-logic' + q],
        ['orders', 'Orders', '/omega-logic' + q + '#orders'],
        ['pos', 'Company POs', '/po-inbox?office=1&org=' + e],
        ['customers', 'Customers', '/portals/customer/admin.html' + q],
        ['officeapp', 'Office app', '/office/app' + q]]],
      ['Build', [
        ['woboard', 'Work order board', '/plant/work-orders.html' + q],
        ['works', 'Work orders & registration', '/plant/' + q],
        ['board', 'Plant board', '/plant/manager.html' + q],
        ['stations', 'Stations & tablets', '/plant/manager.html' + q + '#stations'],
        ['app', 'Plant app', '/plant/app' + q]]],
      ['Stock & supply', [
        ['inventory', 'Inventory', '/logic-inventory.html' + q],
        ['materials', 'Materials plan', '/logic-materials.html' + q],
        ['purchasing', 'Purchase orders', '/logic-materials.html' + q + '#po'],
        ['vendors', 'Vendors & prices', '/logic-materials.html' + q + '#suppliers']]],
      ['Deliver', [
        ['shipping', 'Shipping & receiving', '/logic-logistics.html' + q],
        ['custody', 'Sites & custody', '/logic-custody.html' + q],
        ['register', 'Fleet register', '/logic-register.html' + q],
        ['quality', 'Quality & serial records', '/plant/' + q + '#records']]],
      ['Money', [
        ['cash', 'Cash flow', '/omega-logic' + q + '#cash'],
        ['accounting', 'Accounting', '/logic-accounting.html' + q]]],
      ['Setup', [
        ['products', 'Products & bills', '/logic-catalog.html' + q],
        ['settings', 'Settings', '/logic-settings.html' + q]]]
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
    return g;
  }

  function chrome(o) {
    o = o || {};
    var org = String(o.org || ''), owner = ownerFlag(o.owner), name = 'Omega Logic';
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
      so.onclick = function () {
        so.disabled = true;
        var done = function () { location.href = o.afterSignOut || location.pathname + location.search; };
        try { if (window.firebase && firebase.auth) firebase.auth().signOut().then(done, done); else done(); } catch (e) { done(); }
      };
    }
    /* shell + nav */
    if (!org) return;
    var main = document.querySelector('main'), shell = document.querySelector('.logic-shell'), nav = document.querySelector('.logic-nav');
    if (!shell && main) {
      shell = document.createElement('div'); shell.className = 'logic-shell';
      main.parentNode.insertBefore(shell, main); shell.appendChild(main); main.classList.add('logic-main');
    }
    if (!nav && shell) { nav = document.createElement('nav'); nav.className = 'logic-nav'; nav.setAttribute('aria-label', 'Office'); shell.insertBefore(nav, shell.firstChild); }
    if (!nav) return;
    var h = '';
    groups(org, owner).forEach(function (g) {
      h += '<p class="eyebrow">' + esc(g[0]) + '</p>';
      g[1].forEach(function (l) { h += '<a href="' + esc(l[2]) + '"' + (l[0] === o.current ? ' aria-current="page"' : '') + '>' + esc(l[1]) + '</a>'; });
    });
    if (o.local && o.local.length) {
      h += '<p class="eyebrow">On this page</p>';
      o.local.forEach(function (l) { h += '<a href="' + esc(l.href) + '" class="local"' + (l.id ? ' id="' + esc(l.id) + '"' : '') + (l.hidden ? ' hidden' : '') + '>' + esc(l.label) + '</a>'; });
    }
    nav.innerHTML = h;
  }

  window.OmegaLogicTheme = { apply: apply, reset: reset, chrome: chrome, groups: groups };
})();
