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
  var LOCAL_HOSTS = ['localhost', '127.0.0.1'];
  var PREVIEW_SUFFIXES = ['.vercel.app', 'staging.clearskyomega.com', 'next.clearskyomega.com'];
  /* HUB HOSTS: no pinned tenant, no hostname lock. Where people sign up and
     get routed to their own workspace. /start.html lives here. */
  var HUB_HOSTS = ['app.clearskyomega.com', 'clearskyomega.com', 'www.clearskyomega.com'];
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
    ws.vertical = ws.vertical || (T.org && T.org.vertical) || null;
    ws.shell = ws.shell || (T.org && T.org.shell) || 'default';
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
  function fireEntitlements(ws) {
    T._ent = true; T._ws = ws;
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
        if (T.status === 'pending') { pendingScreen(o, user); return; }
        if (host && host !== T.host && !onStart) { global.location.href = 'https://' + host + global.location.pathname + global.location.search; return; }
        if (host && host !== T.host && onStart) { global.location.href = 'https://' + host + '/'; return; }
        try { global.dispatchEvent(new CustomEvent('omega:hub', { detail: { exists: true, org: o } })); } catch (e) {}
      } else {
        if (!onStart) { global.location.href = '/start.html'; return; }
        try { global.dispatchEvent(new CustomEvent('omega:hub', { detail: { exists: false, domain: domain } })); } catch (e) {}
      }
    })['catch'](function (err) { log('hub lookup failed', err && err.message); });
  }

  function pendingScreen(org, user) {
    if (!global.document) return;
    var name = (org && org.name) || 'your workspace';
    var d = document.createElement('div');
    d.id = 'omega-pending';
    d.setAttribute('style', 'position:fixed;inset:0;background:#0A1628;color:#E5EEF7;z-index:99999;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;padding:24px;text-align:center');
    d.innerHTML = '<div style="max-width:520px"><div style="font-size:12px;letter-spacing:.2em;color:#00A9A4;font-weight:700;margin-bottom:14px">CLEARSKY-OMEGA</div>'
      + '<div style="font-size:22px;font-weight:700;margin-bottom:10px">' + String(name).replace(/</g, '&lt;') + ' is being set up</div>'
      + '<div style="font-size:14px;color:#8BA3C4;line-height:1.6">Your workspace request is with the ClearSky team. Approval usually takes one business day; you\'ll get an email at <b style="color:#E5EEF7">' + String(user && user.email || '').replace(/</g, '&lt;') + '</b> the moment it\'s live.<br><br>Questions: <a href="mailto:support@csebuilders.com" style="color:#00A9A4">support@csebuilders.com</a></div>'
      + '<button onclick="firebase.auth().signOut().then(function(){location.reload()})" style="margin-top:24px;background:transparent;border:1px solid #2A3F5F;color:#8BA3C4;padding:10px 18px;border-radius:8px;cursor:pointer;font-size:13px">Sign out</button></div>';
    document.body ? document.body.appendChild(d) : document.addEventListener('DOMContentLoaded', function () { document.body.appendChild(d); });
  }

  function loadEntitlements(user) {
    var d = db(); if (!d || !user) return;
    if (T.hub) { routeFromHub(user); return; }
    var org = orgIdFor(user); if (!org) return;
    var uid = user.uid;
    var ref = d.collection('omega_orgs').doc(org);
    Promise.all([
      ref.get(),
      ref.collection('billing').doc('current').get(),
      ref.collection('members').doc(uid).get()
    ]).then(function (r) {
      T.org = r[0].exists ? r[0].data() : null;
      T.billing = r[1].exists ? r[1].data() : null;
      T.member = r[2].exists ? r[2].data() : null;
      T.role = (T.member && T.member.role) || 'member';
      T.status = (T.org && T.org.status) || 'active';

      if (T.status === 'pending') {
        pendingScreen(T.org, user);
        return;
      }
      if (T.status === 'suspended' || T.status === 'cancelled') {
        refuse('Your organisation\'s account is ' + T.status + '. Contact billing@csebuilders.com to restore access.');
        try { firebase.auth().signOut(); } catch (e) {}
        return;
      }
      if (T.member && T.member.status === 'disabled') {
        refuse('Your access to this workspace has been disabled by your administrator.');
        try { firebase.auth().signOut(); } catch (e) {}
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
      var ws = global.OMEGA_WORKSPACE || cfg().tenant || null;
      fireEntitlements(mergeEntitlements(ws));
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

  function watchAuth() {
    if (!global.firebase || !firebase.auth) return;
    try {
      firebase.auth().onAuthStateChanged(function (user) {
        if (user) setTimeout(function () { loadEntitlements(user); }, 0);
        else { T.billing = null; T.member = null; T.role = 'member'; T._ent = false; }
      });
    } catch (e) {}
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
