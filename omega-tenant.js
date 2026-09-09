/* ═══════════════════════════════════════════════════════════════════════════════
   ClearSky-OMEGA · Tenant Runtime  (omega-tenant.js)
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   WHAT THIS FILE DOES
   ───────────────────
   Makes ONE deployment serve every tenant. It answers "which tenant is this
   hostname, and what is this user entitled to?" from Firestore instead of
   from a per-repo /config.js — while leaving /config.js working as the
   fallback so nothing breaks during migration.

   LOAD ORDER (index.html, marketplace.html, projects.html, tool pages):
       firebase-*-compat.js
       /config.js            ← may still carry a `tenant` block (legacy)
       /omega-brand.js
       /omega-tenant.js      ← THIS. Must follow omega-brand.js.
       ...everything else

   THREE PHASES
   ────────────
   1. PRE-AUTH — tenant identity from the hostname.
      Reads  tenant_public/{hostname}  (world-readable; branding only — no
      emails, no billing). Populates window.CLEARSKY_CONFIG.tenant when
      config.js did not pin one, so OmegaBrand.pinned()/paintAuth() work
      exactly as they do today. Result is cached in localStorage so the
      SECOND visit paints synchronously before the network answers.

   2. POST-AUTH — entitlements.
      Once Firebase reports a user, reads
        omega_orgs/{orgId}                 status, vertical, shell
        omega_orgs/{orgId}/billing/current tier, addons, toolOverrides
        omega_orgs/{orgId}/members/{uid}   role, toolAccess
      and merges tier/unlock data INTO the resolved workspace object, which
      is the object index.html's applyToolLocks() and omega-tools.js read.
      Then re-runs applyToolLocks() and OmegaBrand.paint() if present.
      A suspended/cancelled tenant is signed out with a plain message.

   HUB HOSTS (app.clearskyomega.com): nothing is pinned. After sign-in the
      person is routed to their tenant's hostname, to /start.html if their
      domain has no tenant yet, or to a 'being set up' screen if it is
      pending approval.

   3. HOSTNAME LOCK.
      If tenant_public says a different orgId than config.js pins, or the
      hostname is not registered at all AND config.js pins nothing, the
      page refuses to boot (unless the host is on the local/preview list).
      This is what makes a copied set of files useless on someone else's
      server: the files are public; the hostname registration is not.

   ES5. No build step. Uses the compat Firebase SDK already on the page.

   PUBLIC API — window.OmegaTenant
      .host                  the hostname this page resolved for
      .tenant                the tenant_public doc (or null)
      .org                   omega_orgs doc once loaded
      .billing               billing/current once loaded
      .member                members/{uid} once loaded
      .role                  'owner'|'admin'|'member'|'viewer' (default member)
      .status                'active' | 'suspended' | ...
      .effectiveTools(cat)   array of tool keys this user may open, given
                             an omega-tools.js catalog (or any [{key,tier,addon}])
      .canOpen(toolKey)      boolean
      .isAdmin()             tenant owner/admin (NOT ClearSky staff)
      .ready(cb)             cb(tenant) when pre-auth resolution is done
      .onEntitlements(cb)    cb(ws) after billing/members merged into ws
   EVENTS on window:  'omega:tenant'  and  'omega:entitlements'
   ═══════════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var CACHE_KEY = 'omega_tenant_public:';

  /* ── "THIS TAB HAD A SIGNED-IN USER" ──────────────────────────────────────
     Firebase reports no user before it has finished restoring, and every page
     that acted on that showed a login form to somebody who was signed in. The
     confirm-and-wait guards fix the common case, but they cannot tell a slow
     restore from a genuine first visit, so they have to give up quickly.

     This is the missing fact. sessionStorage lives for the life of the TAB, so
     if it says a user was here, a null on the next page is a restore in
     progress and the page should keep waiting rather than paint a login.

     Cleared by endSession(), which the sign-out buttons call. That is the
     whole rule: the only thing that ends a session is the person asking. */
  var SESSION_KEY = 'omega_had_session';
  function markSession() { try { global.sessionStorage.setItem(SESSION_KEY, '1'); } catch (e) {} }
  function endSession()  { try { global.sessionStorage.removeItem(SESSION_KEY); } catch (e) {} }
  function hadSession()  { try { return global.sessionStorage.getItem(SESSION_KEY) === '1'; } catch (e) { return false; } }
  var LOCAL_HOSTS = ['localhost', '127.0.0.1'];
  var PREVIEW_SUFFIXES = ['.vercel.app', 'staging.clearskyomega.com', 'next.clearskyomega.com'];
  /* HUB HOSTS: no pinned tenant, no hostname lock. Where people sign up and
     get routed to their own workspace. /start.html lives here. */
  /* silmarillion.clearskyomega.com is the front door the marketing site's
     "Log in to OMEGA" points at. It has to be a HUB and not a tenant: a
     tenant_public registration pins one orgId, and the whole job of a public
     login link is to take anybody's work email and route them to whichever
     workspace it belongs to. Without this the domain resolves, serves, and
     then refuses with "is not a registered ClearSky-OMEGA portal address" —
     which is the hostname lock doing exactly what it should to a host nobody
     told it about. */
  var HUB_HOSTS = ['app.clearskyomega.com', 'clearskyomega.com', 'www.clearskyomega.com'];

  /* ── HOSTS THAT SERVE EVERY TENANT INLINE ────────────────────────────────
     A HUB dispatches: a signed-in user is redirected to their own org's
     hostname. An OPEN host does not — it resolves each user's workspace from
     their email domain and serves them where they already are.

     silmarillion.clearskyomega.com was in HUB_HOSTS and is the host everyone
     actually works on, so every signed-in tenant user was being redirected to
     omega_orgs/{their domain}.domains[0]. A Firebase session belongs to ONE
     ORIGIN, so the redirect left it behind: FENECON users landed on
     fenecon.clearskyomega.com with no session and a login form, which is why
     it looked like being logged out for moving between pages. It happened on
     every page, because the routing runs on every page load.

     Walters and Roam had it worse — walters.clearskyomega.com and
     roam.clearskyomega.com do not resolve at all, so the hub was sending them
     to a hostname that does not exist.

     Dispatching is still right for app./www./clearskyomega.com, where somebody
     arrives without knowing which workspace is theirs. It is wrong for the
     host that IS the workspace.

     NOT simply removed from HUB_HOSTS: without a tenant_public document, an
     unlisted host is refused outright as a copied deployment. This says
     "serves every tenant, pins none", which is a third thing from "hub" and
     "one tenant's portal". */
  var OPEN_HOSTS = ['silmarillion.clearskyomega.com'];
  var TIER_LEVEL = { trial: -1, standard: 1, pro: 2, enterprise: 3, internal: 3, partner: 2 };
  var TIER_LABEL = { trial: 'Trial', standard: 'Standard', pro: 'Pro', enterprise: 'Enterprise', internal: 'Internal', partner: 'Partner' };

  function cfg() { return global.CLEARSKY_CONFIG || (global.CLEARSKY_CONFIG = {}); }
  function host() { return String(global.location && global.location.hostname || '').toLowerCase(); }
  function isPreviewHost(h) {
    if (LOCAL_HOSTS.indexOf(h) >= 0) return true;
    for (var i = 0; i < PREVIEW_SUFFIXES.length; i++) {
      if (h === PREVIEW_SUFFIXES[i] || h.slice(-PREVIEW_SUFFIXES[i].length) === PREVIEW_SUFFIXES[i]) return true;
    }
    return false;
  }
  function isHubHost(h) { return HUB_HOSTS.indexOf(h) >= 0; }
  function isOpenHost(h) { return OPEN_HOSTS.indexOf(h) >= 0; }
  function log() { if (global.console && console.log) console.log.apply(console, ['[OmegaTenant]'].concat([].slice.call(arguments))); }

  var T = {
    host: host(), tenant: null, org: null, billing: null, member: null,
    role: 'member', status: 'active', _ws: null,
    _readyCbs: [], _entCbs: [], _ready: false, _ent: false
  };

  /* ── localStorage cache (best-effort; private mode may throw) ───────────── */
  function readCache() {
    try { var raw = global.localStorage.getItem(CACHE_KEY + T.host); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }
  function writeCache(doc) {
    try { global.localStorage.setItem(CACHE_KEY + T.host, JSON.stringify(doc)); } catch (e) {}
  }
  /* ── A CACHE FOR A DOCUMENT THAT NO LONGER EXISTS IS NOT A CACHE ─────────
     readCache() pins a tenant synchronously so the page does not flash. That
     is only sound while tenant_public still says the same thing. When the
     document has gone, the cached pin has to go with it — and so does the pin
     it already applied, or resolve() spends the rest of the session judging
     every user against a workspace this host is not. That is what was logging
     people out for moving between pages: a stale pin from an earlier state,
     applied on every load, matching nobody. */
  function dropCache() {
    try { global.localStorage.removeItem(CACHE_KEY + T.host); } catch (e) {}
  }
  function unpin(previousOrgId) {
    var c = cfg();
    if (c.tenant && c.tenant.orgId === previousOrgId) { try { delete c.tenant; } catch (e) { c.tenant = null; } }
    T.tenant = null;
  }

  /* ── tenant_public → CLEARSKY_CONFIG.tenant (the shape omega-brand.js expects) ── */
  function toTenantBlock(pub) {
    var domains = pub.domains || [];
    var primary = pub.orgId;
    var extra = [];
    for (var i = 0; i < domains.length; i++) if (domains[i] !== primary) extra.push(domains[i]);
    return {
      type:           pub.type || 'developer',
      orgId:          primary,
      clientName:     pub.name || primary,
      accountTier:    TIER_LABEL[pub.tier || 'standard'] || 'Standard',
      tierLevel:      TIER_LEVEL[pub.tier || 'standard'] != null ? TIER_LEVEL[pub.tier || 'standard'] : 1,
      allowedDomain:  primary,
      allowedDomains: extra,
      allowedEmails:  pub.allowedEmails || [],
      requiredTools:  pub.requiredTools || null,
      logo:           pub.logoUrl || '',
      exportBrand:    pub.exportBrand || { name: pub.name || primary, logo: pub.logoUrl || '' },
      colors:         pub.colors || null,
      vertical:       pub.vertical || null,
      shell:          pub.shell || 'default',
      trial:          pub.trial || null,
      _source:        'tenant_public'
    };
  }
  function applyPublic(pub) {
    T.tenant = pub;
    var c = cfg();
    var pinned = c.tenant && c.tenant.orgId;
    if (pinned && c.tenant.orgId !== pub.orgId) {
      /* HOSTNAME LOCK, case 1: the files say one tenant, the registry says
         another. Somebody deployed tenant A's config on tenant B's hostname,
         or copied files somewhere they don't belong. Refuse. */
      refuse('This deployment is configured for ' + c.tenant.orgId + ' but ' + T.host + ' is registered to ' + pub.orgId + '.');
      return;
    }
    if (!pinned) c.tenant = toTenantBlock(pub);
    else {
      /* config.js pins the same tenant: let Firestore branding win for the
         fields it carries, keep config.js for the rest. */
      if (pub.logoUrl) c.tenant.logo = pub.logoUrl;
      if (pub.name) c.tenant.clientName = pub.name;
      if (pub.colors) c.tenant.colors = pub.colors;
      c.tenant.shell = pub.shell || c.tenant.shell || 'default';
      c.tenant.vertical = pub.vertical || c.tenant.vertical || null;
    }
    if (!c.adminDomains) c.adminDomains = ['csebuilders.com', 'clearsky-usa.com'];
    applyColors(c.tenant.colors);
  }
  function applyColors(colors) {
    if (!colors || !global.document || !document.documentElement) return;
    var s = document.documentElement.style;
    if (colors.primary) s.setProperty('--tenant-primary', colors.primary);
    if (colors.accent)  s.setProperty('--tenant-accent',  colors.accent);
    if (colors.topbar)  s.setProperty('--tenant-topbar',  colors.topbar);
  }

  function refuse(msg) {
    T.refused = msg;
    log('REFUSED:', msg);
    if (!global.document) return;
    var d = document.createElement('div');
    d.setAttribute('style', 'position:fixed;inset:0;background:#0A1628;color:#E5EEF7;z-index:99999;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;padding:24px;text-align:center');
    d.innerHTML = '<div style="max-width:520px"><div style="font-size:22px;font-weight:700;margin-bottom:10px">This portal is not available at this address</div>'
      + '<div style="font-size:14px;color:#8BA3C4;line-height:1.5">' + String(msg).replace(/</g, '&lt;') + '<br><br>If you believe this is an error, contact support@csebuilders.com.</div></div>';
    document.body ? document.body.appendChild(d) : document.addEventListener('DOMContentLoaded', function () { document.body.appendChild(d); });
  }

  function fireReady() {
    if (T._ready) return;
    T._ready = true;
    for (var i = 0; i < T._readyCbs.length; i++) { try { T._readyCbs[i](T.tenant); } catch (e) {} }
    T._readyCbs = [];
    try { global.dispatchEvent(new CustomEvent('omega:tenant', { detail: T.tenant })); } catch (e) {}
  }

  /* ── Phase 1: resolve by hostname ────────────────────────────────────────── */
  function db() {
    if (!global.firebase || !firebase.firestore) return null;
    try { if (!firebase.apps.length) firebase.initializeApp(cfg().firebase); } catch (e) {}
    return firebase.firestore();
  }
  function resolveHost() {
    if (isHubHost(T.host)) {
      /* Hub: nothing to pin. If a tenant page (not /start) is opened on the
         hub, routeFromHub() sends signed-in users to their own workspace. */
      T.hub = true; fireReady(); return;
    }
    if (isOpenHost(T.host)) {
      /* Serves every tenant, pins none and dispatches nobody. Each user's
         workspace is resolved from their email domain, on this host, with the
         session they already have. */
      fireReady(); return;
    }
    var cached = readCache();
    if (cached && cached.orgId) { applyPublic(cached); log('cached', cached.orgId); }

    var d = db();
    if (!d) { fireReady(); return; }
    d.collection('tenant_public').doc(T.host).get().then(function (snap) {
      if (snap.exists) {
        var pub = snap.data(); pub.orgId = pub.orgId || snap.id;
        writeCache(pub);
        if (!T.refused) applyPublic(pub);
      } else if (!cached) {
        var c = cfg();
        if (!(c.tenant && c.tenant.orgId) && !isPreviewHost(T.host)) {
          /* HOSTNAME LOCK, case 2: unregistered host, nothing pinned. This
             is a copied deployment. (Zero-config auto-tenant is still
             reachable on preview hosts for development.) */
          refuse(T.host + ' is not a registered ClearSky-OMEGA portal address.');
        }
      } else {
        /* The host has no tenant_public document, but this browser had one
           cached and has already pinned it. Nothing used to correct that —
           the branch above only ran when there was NO cache — so the stale
           pin survived every reload and every navigation, and resolve() kept
           returning null for anyone outside that tenant.

           Drop both the cache and the pin it applied, then carry on: with no
           pin, resolve() falls through to the registry and the zero-config
           path, which is what an unpinned host is supposed to do. */
        log('tenant_public gone for ' + T.host + ' — dropping stale pin ' + cached.orgId);
        dropCache();
        unpin(cached.orgId);
      }
      fireReady();
    })['catch'](function (err) {
      log('tenant_public read failed; using config.js', err && err.message);
      fireReady();
    });
  }

  /* ── Phase 2: entitlements after sign-in ─────────────────────────────────── */
  function orgIdFor(user) {
    var c = cfg();
    if (global.OMEGA_WORKSPACE && global.OMEGA_WORKSPACE.orgId) return global.OMEGA_WORKSPACE.orgId;
    if (c.tenant && c.tenant.orgId) return c.tenant.orgId;
    var e = String(user && user.email || '').toLowerCase();
    return e.split('@')[1] || '';
  }
  function mergeEntitlements(ws) {
    if (!ws) return ws;
    var b = T.billing || {};
    if (b.tier) {
      ws.accountTier = TIER_LABEL[b.tier] || ws.accountTier;
      ws.tierLevel   = TIER_LEVEL[b.tier] != null ? TIER_LEVEL[b.tier] : ws.tierLevel;
    }
    if (b.addons) ws.addons = b.addons;
    if (b.toolOverrides) ws.toolOverrides = b.toolOverrides;
    if (b.trialEndsAt && !ws.trial) ws.trial = { endsAt: b.trialEndsAt };
    if (T.member && T.member.toolAccess) ws.toolAccess = T.member.toolAccess;
    ws.role = T.role;
    ws.orgStatus = T.status;
    /* ── THE ORG RECORD IS WHERE THE NAME LIVES ──────────────────────────
       On a host that pins nobody, the workspace is derived from the email
       domain — which gives "Renewablenrgsolutions", a company name nobody
       chose. omega_orgs holds the one somebody typed. This merged every other
       field off that record and left the name alone, so a tenant could be set
       up properly and still be addressed by its domain with the capital in the
       wrong place. Applied only when the record actually has one, so a
       derived name stays as the fallback it is. */
    if (T.org && T.org.name) ws.clientName = T.org.name;
    if (T.org && T.org.logoUrl && !ws.logo) ws.logo = T.org.logoUrl;
    ws.vertical = ws.vertical || (T.org && T.org.vertical) || null;
    ws.shell = ws.shell || (T.org && T.org.shell) || 'default';
    /* Some tenants have no business in the marketplace — a design partner is
       here to draw what they are handed, not to shop. A flag on the org record
       rather than a list of domains in three navs. */
    if (T.org && T.org.hideMarketplace === true) ws.hideMarketplace = true;
    /* Who this tenant does joint development with — the label on their JD
       workspace entry, and what keeps that entry in the nav when the queue is
       empty. */
    if (T.org && T.org.jdPartnerOf) ws.jdPartnerOf = T.org.jdPartnerOf;
    /* Which end of the relationship they are on, and the partner's orgId —
       needed to put them on a project's roster when one is sent over. */
    if (T.org && T.org.jdRole) ws.jdRole = T.org.jdRole;
    if (T.org && T.org.jdPartnerOrg) ws.jdPartnerOrg = T.org.jdPartnerOrg;
    /* unlockedTools is what applyToolLocks() reads. Compute it from the
       catalog when omega-tools.js is present; otherwise leave config's. */
    if (global.OMEGATools && OMEGATools.catalog) {
      var cat = OMEGATools.catalog();
      if (cat && cat.length) ws.unlockedTools = effectiveTools(cat, ws);
    }
    return ws;
  }
  function effectiveTools(catalog, ws) {
    ws = ws || global.OMEGA_WORKSPACE || cfg().tenant || {};
    var level = typeof ws.tierLevel === 'number' ? ws.tierLevel : 1;
    var addons = ws.addons || [];
    var ov = ws.toolOverrides || {};
    var access = ws.toolAccess || null;
    var out = [];
    for (var i = 0; i < catalog.length; i++) {
      var t = catalog[i]; if (!t || !t.key) continue;
      var minTier = typeof t.tier === 'number' ? t.tier : (typeof t.minTier === 'number' ? t.minTier : 1);
      var ok = level >= minTier;
      if (!ok && t.addon && addons.indexOf(t.addon) >= 0) ok = true;
      if (ov[t.key] === true) ok = true;
      if (ov[t.key] === false) ok = false;
      if (ok && access && access.indexOf(t.key) < 0) ok = false;
      if (ok) out.push(t.key);
    }
    return out;
  }
  /* ── ASSIGNED DESIGN WORK ─────────────────────────────────────────────────
     A design partner is a tenant like any other; what makes them one is that
     somebody has put their org on a project's orgsInvolved[] roster. So the
     nav item is data-driven rather than a domain hardcoded somewhere: count
     the projects this org is a collaborator on that carry a design handoff,
     and reveal the item if there are any.

     Labelled with the workspace that assigned them — "OSA 3" while there is
     one, "Design Queue 5" once there are several — because to the person
     looking at it the useful word is who is waiting, not what the feature is
     called.

     Cached for the tab. The count is a nav badge, not a number anybody acts
     on, and it is not worth a query on every page load of every tenant. */
  var WORK_KEY = 'omega_design_queue';
  /* ── THE WORKSPACE IS A PLACE, NOT A NOTIFICATION ─────────────────────────
     This only appeared when the count was above zero, so a design partner's
     JD workspace vanished the moment they finished everything — and the way
     to check what you had just sent back was to remember the URL. The Quote
     Desk is always in the nav whether or not anything is in it, for the same
     reason: it is somewhere you go, not a badge that lights up.

     So the count decides the BADGE, and omega_orgs.jdPartnerOf decides whether
     the entry is there at all. A tenant nobody does joint development with
     still sees nothing, which is most of them. */
  function paintDesignNav(n, label, always) {
    if (!global.document) return;
    var a = document.getElementById('sn-design');
    if (!a) return;
    if (!n && !always) return;
    var l = document.getElementById('sn-design-label');
    var c = document.getElementById('sn-design-n');
    if (l && label) l.textContent = label;
    if (c) c.textContent = n ? String(n) : '';
    a.style.display = '';
    /* The section heading comes with it. A "Joint development" label with
       nothing under it is worse than no label — and this item IS the JD
       workspace from the partner's side, so it belongs under that heading
       rather than floating above it. */
    ['sn-jv-divider', 'sn-jv-label'].forEach(function (id) {
      var e = document.getElementById(id); if (e) e.style.display = '';
    });
  }
  function countDesignWork(org, jdOf) {
    if (!global.document || !document.getElementById('sn-design')) return;
    /* Paint the entry immediately when we already know they are a JD partner,
       so it does not flicker in after the count returns. */
    if (jdOf) paintDesignNav(0, jdOf, true);
    try {
      var raw = global.sessionStorage.getItem(WORK_KEY + ':' + org);
      if (raw) { var c = JSON.parse(raw); paintDesignNav(c.n, jdOf || c.label, !!jdOf); return; }
    } catch (e) {}
    var d = db(); if (!d || !org) return;
    d.collection('projects').where('orgsInvolved', 'array-contains', org).get()
      .then(function (sn) {
        var n = 0, froms = {};
        sn.forEach(function (doc) {
          var dz = (doc.data() || {}).design || {};
          if (dz.status !== 'in_design' && dz.status !== 'revise') return;
          n++;
          if (dz.fromOrg) froms[String(dz.fromOrg).toUpperCase()] = 1;
        });
        var keys = Object.keys(froms);
        var label = jdOf || ((keys.length === 1) ? keys[0] : 'Design Queue');
        try { global.sessionStorage.setItem(WORK_KEY + ':' + org,
                JSON.stringify({ n: n, label: label })); } catch (e) {}
        paintDesignNav(n, label, !!jdOf);
      })['catch'](function () { /* a nav badge is not worth an error */ });
  }

  /* Hiding a link is not a permission — Firestore rules are. This is about
     not offering somebody a door that is not theirs to walk through. */
  function paintMarketplaceNav(ws) {
    if (!global.document || !ws || !ws.hideMarketplace) return;
    var els = document.querySelectorAll('[data-sn="marketplace"]');
    for (var i = 0; i < els.length; i++) els[i].style.display = 'none';
  }

  function fireEntitlements(ws) {
    T._ent = true; T._ws = ws;
    try { countDesignWork((ws && ws.orgId) || '', (ws && ws.jdPartnerOf) || ''); } catch (e) {}
    try { paintMarketplaceNav(ws); } catch (e) {}
    /* The chrome was painted before this record arrived; repaint it now that
       the real name is known, or the header keeps the derived one. */
    try { if (global.OmegaBrand && OmegaBrand.paint) OmegaBrand.paint(ws); } catch (e) {}
    for (var i = 0; i < T._entCbs.length; i++) { try { T._entCbs[i](ws); } catch (e) {} }
    try { global.dispatchEvent(new CustomEvent('omega:entitlements', { detail: ws })); } catch (e) {}
    /* Re-run the gates that already exist on the page. */
    try { if (typeof global.applyToolLocks === 'function') global.applyToolLocks(); } catch (e) {}
    try { if (global.OmegaBrand && OmegaBrand.paint) OmegaBrand.paint(ws); } catch (e) {}
  }
  /* ── Hub routing: a signed-in person on the hub goes to their tenant ─── */
  function routeFromHub(user) {
    var d = db(); if (!d || !user) return;
    var domain = String(user.email || '').toLowerCase().split('@')[1] || '';
    if (!domain) return;
    d.collection('omega_orgs').doc(domain).get().then(function (s) {
      var onStart = /\/start(\.html)?$/.test(global.location.pathname);
      if (s.exists) {
        var o = s.data(), host = (o.domains && o.domains[0]) || null;
        T.org = o; T.status = o.status || 'active';
        if (T.status === 'pending') { pendingBanner(o, user, null); lockedEntitlements(); return; }
        if (host && host !== T.host && !onStart) { global.location.href = 'https://' + host + global.location.pathname + global.location.search; return; }
        if (host && host !== T.host && onStart) { global.location.href = 'https://' + host + '/'; return; }
        try { global.dispatchEvent(new CustomEvent('omega:hub', { detail: { exists: true, org: o } })); } catch (e) {}
      } else {
        if (!onStart) { global.location.href = '/start.html'; return; }
        try { global.dispatchEvent(new CustomEvent('omega:hub', { detail: { exists: false, domain: domain } })); } catch (e) {}
      }
    })['catch'](function (err) { log('hub lookup failed', err && err.message); });
  }

  /* An account with nothing unlocked. unlockedTools is what applyToolLocks()
     reads, so an empty list draws every tool in the state the UI already has
     for "not on your plan" — no second locked-out design to build or keep in
     step. */
  function lockedEntitlements() {
    var ws = mergeEntitlements(global.OMEGA_WORKSPACE || cfg().tenant || {}) || {};
    ws.unlockedTools = [];
    ws.pendingApproval = true;
    fireEntitlements(ws);
  }

  /* A strip at the top of the page, not a screen over it. It has to survive a
     dashboard that repaints, so it is appended once and identified by id. */
  function pendingBanner(org, user, req) {
    if (!global.document) return;
    if (document.getElementById('omega-pending')) return;
    var esc = function (x) { return String(x == null ? '' : x).replace(/</g, '&lt;'); };
    var who = (org && org.name) || (req && req.company) || 'Your workspace';
    var d = document.createElement('div');
    d.id = 'omega-pending';
    d.setAttribute('style', 'position:sticky;top:0;z-index:9998;background:#7C4A00;color:#FFF3E0;'
      + 'font:600 13px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;padding:10px 16px;'
      + 'display:flex;gap:12px;align-items:center;flex-wrap:wrap');
    d.innerHTML = '<span style="font-size:11px;letter-spacing:.14em;background:rgba(255,255,255,.16);'
      + 'padding:3px 8px;border-radius:999px">AWAITING APPROVAL</span>'
      + '<span style="flex:1;min-width:240px;font-weight:500">'
      + esc(who) + ' is with the ClearSky team. Tools stay locked until it is approved \u2014 '
      + 'usually one business day. We will email '
      + '<b>' + esc(user && user.email) + '</b> the moment it is live.</span>'
      + '<a href="mailto:support@csebuilders.com" style="color:#FFF3E0;text-decoration:underline">'
      + 'Chase it up</a>';
    function attach() { if (document.body) document.body.insertBefore(d, document.body.firstChild); }
    if (document.body) attach(); else document.addEventListener('DOMContentLoaded', attach);
  }

  function loadEntitlements(user) {
    var d = db(); if (!d || !user) return;
    if (T.hub) { routeFromHub(user); return; }
    var org = orgIdFor(user); if (!org) return;
    var uid = user.uid;
    var ref = d.collection('omega_orgs').doc(org);
    /* Independently caught. These are three different documents with three
       different rules, and one refusal used to discard the other two — losing
       the org record, and with it the tenant's name and every flag on it,
       because a member document happened to be unreadable. */
    function soft(p) { return p.then(function (s) { return s; },
                                     function () { return { exists: false }; }); }
    Promise.all([
      soft(ref.get()),
      soft(ref.collection('billing').doc('current').get()),
      soft(ref.collection('members').doc(uid).get())
    ]).then(function (r) {
      T.org = r[0].exists ? r[0].data() : null;
      T.billing = r[1].exists ? r[1].data() : null;
      T.member = r[2].exists ? r[2].data() : null;
      T.role = (T.member && T.member.role) || 'member';
      T.status = (T.org && T.org.status) || 'active';

      /* ── NO TENANT RECORD FOR THIS DOMAIN ────────────────────────────────
         Two very different people land here and they must not be treated the
         same. A legacy tenant whose omega_orgs doc has never been seeded has
         to keep working — that is why tenantActive() in the rules treats an
         absent document as active. Somebody who signed themselves up on
         /login three minutes ago must not.

         The access request tells them apart, and it is only read in this
         branch, so nobody with a tenant record pays for the lookup. */
      if (!T.org) {
        return d.collection('access_requests').doc(uid).get().then(function (rq) {
          var r = rq.exists ? (rq.data() || {}) : null;
          if (r && (r.status || 'pending') === 'pending') {
            pendingBanner(null, user, r);
            lockedEntitlements();
            return;
          }
          fireEntitlements(mergeEntitlements(global.OMEGA_WORKSPACE || cfg().tenant || null));
        })['catch'](function () {
          fireEntitlements(mergeEntitlements(global.OMEGA_WORKSPACE || cfg().tenant || null));
        });
      }

      if (T.status === 'pending') {
        /* NOT A WALL. A workspace awaiting approval used to get a full-screen
           block, which tells somebody who has just signed up that the product
           does not work. They get the dashboard instead, with a banner saying
           where their request is and every tool locked — the same shape as a
           tier they have not bought, which the UI already knows how to draw.
           There is nothing to protect by hiding the shell: the data behind
           each tool is gated by rules, not by whether a link is visible. */
        pendingBanner(T.org, user, null);
        lockedEntitlements();
        return;
      }
      /* ── THE PRODUCT DOES NOT SIGN CUSTOMERS OUT ──────────────────────────
         Both of these used to call auth.signOut() after showing the refusal.
         Signing somebody out is not how you tell them their account is
         suspended — it is how you tell them nothing at all, because the next
         thing they see is a login form and the only story that fits is "it
         logged me out". They then sign in again, successfully, and land on
         the same wall, which is worse than the wall on its own.

         The refusal covers the screen and says what is wrong and who to
         contact. The session stays; the sign-out button is where it always
         was. Nothing here is a security boundary — Firestore rules are, and
         they do not care whether a browser is still holding a token. */
      if (T.status === 'suspended' || T.status === 'cancelled') {
        refuse('Your organisation\'s account is ' + T.status + '. Contact billing@csebuilders.com to restore access.');
        return;
      }
      if (T.member && T.member.status === 'disabled') {
        refuse('Your access to this workspace has been disabled by your administrator.');
        return;
      }
      /* Self-register in members so the tenant admin sees this person. Rules
         only allow role 'member', status 'active', own email — so this is
         safe to attempt blindly. Failure is fine (staff previewing, etc.). */
      if (!T.member) {
        ref.collection('members').doc(uid).set({
          email: String(user.email || '').toLowerCase(),
          name: user.displayName || '',
          role: 'member', status: 'active',
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        })['catch'](function () {});
      }
      /* ── WAIT FOR THE OBJECT THESE FLAGS HAVE TO LAND ON ────────────────
         index.html sets window.OMEGA_WORKSPACE inside ITS auth handler, and
         two handlers on the same event have no defined order. Lose that race
         and ws is null, mergeEntitlements returns null, and everything just
         read off the org record — the name, the tier, toolAccess,
         hideMarketplace — is dropped on the floor with no error anywhere.

         So wait for it. A couple of seconds is far longer than the gap
         between two callbacks on the same event, and if it never arrives we
         fire with whatever config had, which is the old behaviour. */
      (function applyWhenReady(tries) {
        var ws = global.OMEGA_WORKSPACE || cfg().tenant || null;
        if (!ws && (tries || 0) < 20) {
          setTimeout(function () { applyWhenReady((tries || 0) + 1); }, 100);
          return;
        }
        fireEntitlements(mergeEntitlements(ws));
      })(0);
    })['catch'](function (err) {
      log('entitlements read failed; config.js tier stands', err && err.message);
      fireEntitlements(global.OMEGA_WORKSPACE || cfg().tenant || null);
    });
  }

  /* Wrap OmegaBrand.resolve so the workspace it returns already carries
     whatever billing we have. Everything downstream keeps calling the same
     function. */
  function wrapBrand() {
    if (!global.OmegaBrand || global.OmegaBrand._tenantWrapped) return;
    var orig = global.OmegaBrand.resolve;
    global.OmegaBrand.resolve = function (email, registry) {
      var ws = orig(email, registry);
      return T.billing ? mergeEntitlements(ws) : ws;
    };
    global.OmegaBrand._tenantWrapped = true;
  }

  /* ── THIS RAN BEFORE THERE WAS AN APP TO WATCH ────────────────────────────
     firebase.auth() throws "No Firebase App '[DEFAULT]' has been created"
     until initializeApp() has run — and on the dashboard that happens LATER,
     inside a poll waiting for config.js. omega-tenant.js loads before it. So
     this registered nothing, the throw went into a bare catch, and the entire
     second phase of this file — the org record, the billing tier, toolAccess,
     hideMarketplace, the suspended check, member self-registration, the design
     queue count — never ran at all on any host that does not pin a tenant.

     It looked fine because every one of those has a sensible default: the
     workspace falls back to the name derived from the email domain, the tier
     falls back to config.js, and nothing errors. A whole phase was missing and
     the page looked ordinary.

     So: wait for an app instead of assuming one. Initialise it here if config
     has landed and nobody else has yet — db() already does exactly that, and
     doing it in two places is how the two get out of step. Give up after about
     seven seconds, which is far longer than a page that is going to work ever
     takes.

     ⚠ Registering twice would double every entitlement read, so the guard is
     on the registration and not on the retry. */
  function watchAuth(tries) {
    if (T._watching) return;
    if (!global.firebase || !firebase.auth) return;
    var ready = false;
    try {
      if (!firebase.apps.length) {
        var c = cfg();
        if (c && c.firebase) firebase.initializeApp(c.firebase);
      }
      ready = !!firebase.apps.length;
    } catch (e) { ready = false; }

    if (!ready) {
      if ((tries || 0) < 60) setTimeout(function () { watchAuth((tries || 0) + 1); }, 120);
      else log('no firebase app after 7s; entitlements will not load');
      return;
    }

    try {
      T._watching = true;
      firebase.auth().onAuthStateChanged(function (user) {
        if (user) { markSession(); setTimeout(function () { loadEntitlements(user); }, 0); }
        else { T.billing = null; T.member = null; T.role = 'member'; T._ent = false; }
      });
    } catch (e) { T._watching = false; log('auth watch failed', e && e.message); }
  }

  /* ── boot ────────────────────────────────────────────────────────────────── */
  global.OmegaTenant = {
    get host() { return T.host; },
    get tenant() { return T.tenant; },
    get org() { return T.org; },
    get billing() { return T.billing; },
    get member() { return T.member; },
    get role() { return T.role; },
    get status() { return T.status; },
    get refused() { return T.refused || null; },
    get hub() { return !!T.hub; },
    /* Did this TAB have a signed-in user? Pages use it to tell a slow restore
       apart from a genuine signed-out visit. endSession() is called by the
       sign-out buttons — nothing else may call it. */
    hadSession: hadSession,
    endSession: endSession,
    effectiveTools: function (catalog) { return effectiveTools(catalog || (global.OMEGATools && OMEGATools.catalog ? OMEGATools.catalog() : [])); },
    canOpen: function (key) { return this.effectiveTools().indexOf(key) >= 0; },
    isAdmin: function () { return T.role === 'owner' || T.role === 'admin'; },
    ready: function (cb) { if (T._ready) { try { cb(T.tenant); } catch (e) {} } else T._readyCbs.push(cb); },
    onEntitlements: function (cb) { if (T._ent) { try { cb(T._ws); } catch (e) {} } else T._entCbs.push(cb); },
    /* For the account-settings page: refresh after a branding save. */
    refresh: function () { try { global.localStorage.removeItem(CACHE_KEY + T.host); } catch (e) {} resolveHost(); }
  };

  wrapBrand();
  resolveHost();
  watchAuth();
})(window);
