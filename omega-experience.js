/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   omega-experience.js — the one release switch for the new experience.

   Values are classic and v2. Resolution, first hit wins:
     1. ?ui=v2 or ?ui=classic on this visit (written to localStorage)
     2. that remembered choice (localStorage key omega-experience)
     3. omega_orgs/{org}/members/{uid}.experience
     4. omega_orgs/{org}.experience
     5. classic
   Anything else (blank, a typo, a future word) is ignored, so a bad
   value cannot turn the new pages on. Absent means classic. Signup does
   not write the field. The browser only reads it.

   The router sends a person from a classic route to its v2 route when
   the switch is v2 AND that v2 page has landed. It does not send them
   to a route whose page is not in the tree yet. A classic view the v2
   home does not paint (Plan & billing, Modules, Tools, Team, Feed)
   stays on /workspace because of its hash.

   A v2 address opened directly stays, so the new page is reachable
   while the default is still classic. A tab the router itself sent
   returns to classic on the next load after the switch flips back.
   Switch to classic is /workspace?ui=classic, which is remembered, so
   an org still on v2 does not pull that browser straight back.

   This is not homeOf() (omega_home, ?home=, shell: classic). That
   chooses the classic dashboard or the workspace. This chooses which
   experience of a page. ES5. No Firebase init: a page that already
   started Firebase is read; a page that never does stays on the query
   and the memory. */
(function (root) {
  'use strict';
  var STORAGE = 'omega-experience';
  var ROUTED = 'omega-experience-routed';
  /* landed flips in the same change that adds the page. The test reads
     the tree, so a merged twin fails until this flag is true. */
  var ROUTES = [
    { key: 'workspace', classic: '/workspace', v2: '/workspace-v2', landed: true },
    { key: 'editor', classic: '/editor.html', v2: '/editor-v2', landed: false },
    { key: 'portfolio', classic: '/portfolio.html', v2: '/portfolio-v2', landed: false },
    { key: 'prime', classic: '/omega-prime.html', v2: '/omega-prime-v2', landed: false },
    { key: 'finance', classic: '/finance', v2: '/finance-v2', landed: false, alias: ['/portals/finance'] }
  ];
  var CLASSIC_VIEWS = { billing: 1, modules: 1, tools: 1, team: 1, feed: 1, plans: 1, flight: 1 };

  function value(v) { return v === 'v2' || v === 'classic' ? v : ''; }

  function pathOf(p) {
    var s = String(p || '').split('?')[0].split('#')[0];
    if (s.length > 1 && s.charAt(s.length - 1) === '/') s = s.slice(0, -1);
    if (s.slice(-5) === '.html') s = s.slice(0, -5);
    if (s.length > 6 && s.slice(-6) === '/index') s = s.slice(0, -6);
    if (s.length > 1 && s.charAt(s.length - 1) === '/') s = s.slice(0, -1);
    return s || '/';
  }

  function queryOf(search) {
    var m = /(?:^|[?&])ui=(v2|classic|v1)(?:&|$)/.exec(String(search || ''));
    if (!m) return '';
    /* ?ui=v1 is the classic link the journey release already shipped. */
    return m[1] === 'v1' ? 'classic' : m[1];
  }

  function stripUi(search) {
    var s = String(search || '');
    if (s.charAt(0) === '?') s = s.slice(1);
    if (!s) return '';
    var parts = s.split('&'), keep = [], i, k;
    for (i = 0; i < parts.length; i++) {
      if (!parts[i]) continue;
      k = parts[i].split('=')[0];
      if (k === 'ui') continue;
      keep.push(parts[i]);
    }
    return keep.length ? '?' + keep.join('&') : '';
  }

  function resolve(o) {
    o = o || {};
    var q = o.query != null ? value(o.query) : queryOf(o.search);
    return q || value(o.remembered) || value(o.user) || value(o.org) || 'classic';
  }

  function routeByKey(key) {
    var i;
    for (i = 0; i < ROUTES.length; i++) if (ROUTES[i].key === key) return ROUTES[i];
    return null;
  }

  function routeFor(pathname) {
    var p = pathOf(pathname), i, r, list, j;
    for (i = 0; i < ROUTES.length; i++) {
      r = ROUTES[i];
      if (p === pathOf(r.classic) || p === pathOf(r.v2)) return r;
      list = r.alias || [];
      for (j = 0; j < list.length; j++) if (p === pathOf(list[j])) return r;
    }
    return null;
  }

  function onClassic(route, pathname) {
    var p = pathOf(pathname), list, j;
    if (!route || p === pathOf(route.v2)) return false;
    if (p === pathOf(route.classic)) return true;
    list = route.alias || [];
    for (j = 0; j < list.length; j++) if (p === pathOf(list[j])) return true;
    return false;
  }

  function onV2(route, pathname) {
    return !!(route && pathOf(pathname) === pathOf(route.v2));
  }

  function classicView(hash) {
    var h = String(hash || '');
    if (h.charAt(0) === '#') h = h.slice(1);
    h = h.split('&')[0].split('?')[0];
    if (!h) return false;
    if (CLASSIC_VIEWS[h]) return true;
    return h.indexOf('module-') === 0;
  }

  function href(key, experience) {
    var r = routeByKey(key);
    if (!r) return '';
    if (experience === 'v2' && r.landed) return r.v2;
    return r.classic;
  }

  function landed(key) {
    var r = routeByKey(key);
    return !!(r && r.landed);
  }

  /* A door on the v2 page. experience v2 returns the twin only once it
     has landed; until then the classic path is the door. A hash the v2
     home does not paint is left on the classic workspace. */
  function upgrade(hrefIn, experience) {
    var s = String(hrefIn || ''), hash = '', search = '', hi, qi, route;
    if (!s || s.charAt(0) === '#') return hrefIn;
    hi = s.indexOf('#');
    if (hi >= 0) { hash = s.slice(hi); s = s.slice(0, hi); }
    qi = s.indexOf('?');
    if (qi >= 0) { search = s.slice(qi); s = s.slice(0, qi); }
    route = routeFor(s);
    if (!route || !route.landed || !onClassic(route, s)) return hrefIn;
    if (route.key === 'workspace' && classicView(hash)) return hrefIn;
    if ((experience || 'v2') !== 'v2') return hrefIn;
    return route.v2 + search + hash;
  }

  /* Where to send this visit. Empty means stay. Only an upgrade of a
     classic route, or a return from a v2 route this tab was sent to,
     or an explicit ?ui=classic while standing on the v2 route. */
  function destination(o) {
    o = o || {};
    var route = routeFor(o.path || '');
    if (!route || !route.landed) return '';
    var exp = resolve(o);
    var search = stripUi(o.search);
    var hash = o.hash || '';
    if (onClassic(route, o.path) && exp === 'v2') {
      if (route.key === 'workspace' && classicView(hash)) return '';
      return route.v2 + search + hash;
    }
    if (onV2(route, o.path) && exp !== 'v2') {
      var asked = queryOf(o.search) === 'classic';
      if (asked || (o.routed && (o.settled || value(o.remembered)))) return route.classic + search + hash;
    }
    return '';
  }

  function classicHref(path, search, hash) {
    var route = routeFor(path || '/workspace-v2');
    var base = route ? route.classic : '/workspace';
    var q = stripUi(search);
    q = q ? q + '&ui=classic' : '?ui=classic';
    return base + q + (hash || '');
  }

  function fromDocs(orgDoc, memberDoc) {
    return {
      org: value(orgDoc && orgDoc.experience),
      user: value(memberDoc && memberDoc.experience)
    };
  }

  function readStored() {
    try { return root.localStorage ? (root.localStorage.getItem(STORAGE) || '') : ''; } catch (e) { return ''; }
  }
  function remember(v) {
    try { if ((v === 'v2' || v === 'classic') && root.localStorage) root.localStorage.setItem(STORAGE, v); } catch (e) {}
  }
  function wasRouted() {
    try { return !!(root.sessionStorage && root.sessionStorage.getItem(ROUTED) === '1'); } catch (e) { return false; }
  }
  function markRouted() {
    try { if (root.sessionStorage) root.sessionStorage.setItem(ROUTED, '1'); } catch (e) {}
  }
  function clearRouted() {
    try { if (root.sessionStorage) root.sessionStorage.removeItem(ROUTED); } catch (e) {}
  }

  var record = { org: '', user: '', settled: false, pulled: false };

  function go() {
    var loc = root.location;
    if (!loc || !loc.pathname) return;
    var q = queryOf(loc.search);
    if (q) remember(q);
    var dest = destination({
      search: loc.search, path: loc.pathname, hash: loc.hash,
      remembered: readStored(), user: record.user, org: record.org,
      routed: wasRouted(), settled: record.settled
    });
    if (!dest) return;
    var destPath = dest.split('?')[0].split('#')[0];
    if (pathOf(destPath) === pathOf(loc.pathname)) return;
    var route = routeFor(loc.pathname);
    if (route && pathOf(destPath) === pathOf(route.v2)) markRouted();
    else clearRouted();
    loc.replace(dest);
  }

  function onEntitlements(ws) {
    record.settled = true;
    if (ws) {
      record.org = value(ws.experience);
      record.user = value(ws.experienceUser);
    }
    go();
  }

  function orgFromUser(user) {
    if (!user || !user.getIdTokenResult) {
      var email = String(user && user.email || '').toLowerCase();
      var at = email.indexOf('@');
      return Promise.resolve(at >= 0 ? email.slice(at + 1) : '');
    }
    return user.getIdTokenResult().then(function (r) {
      var claim = r && r.claims && r.claims.orgId;
      if (claim) return String(claim).toLowerCase();
      var email = String(user.email || '').toLowerCase();
      var at = email.indexOf('@');
      return at >= 0 ? email.slice(at + 1) : '';
    });
  }

  /* Editor and the finance portal do not load omega-tenant.js. One read
     of the two fields, then the same go(). Never starts Firebase. */
  function pullRecord() {
    if (record.pulled || record.settled) return;
    var fb = root.firebase;
    if (!fb || !fb.auth || !fb.firestore) return;
    var auth;
    try { auth = fb.auth(); } catch (e) { return; }
    if (!auth) return;
    function read(user) {
      if (record.pulled || record.settled || !user) return;
      record.pulled = true;
      orgFromUser(user).then(function (org) {
        if (!org) { record.settled = true; go(); return; }
        var db = fb.firestore();
        return Promise.all([
          db.collection('omega_orgs').doc(org).get(),
          db.collection('omega_orgs').doc(org).collection('members').doc(user.uid).get()
        ]).then(function (snaps) {
          var got = fromDocs(snaps[0] && snaps[0].exists ? snaps[0].data() : null, snaps[1] && snaps[1].exists ? snaps[1].data() : null);
          record.org = got.org;
          record.user = got.user;
          record.settled = true;
          go();
        });
      })['catch'](function () { record.settled = true; });
    }
    if (auth.currentUser) { read(auth.currentUser); return; }
    if (auth.onAuthStateChanged) auth.onAuthStateChanged(function (user) { read(user); });
  }

  function watch() {
    if (root.__omegaExperienceWatch) return;
    root.__omegaExperienceWatch = true;
    go();
    if (root.addEventListener) {
      root.addEventListener('omega:entitlements', function (ev) {
        record.pulled = true;
        onEntitlements(ev && ev.detail);
      });
    }
    var hooks = 0, hookTimer = setInterval(function () {
      hooks++;
      var OT = root.OmegaTenant, ws = OT && OT.workspace;
      if (ws && (ws.orgId || ws.experience || ws.experienceUser)) {
        record.pulled = true;
        onEntitlements(ws);
        clearInterval(hookTimer);
      } else if (hooks > 80) clearInterval(hookTimer);
    }, 100);
    var pulls = 0, pullTimer = setInterval(function () {
      pulls++;
      if (record.pulled || record.settled || root.OmegaTenant) { clearInterval(pullTimer); return; }
      var fb = root.firebase, auth = null;
      try { auth = fb && fb.auth && fb.auth(); } catch (e) { auth = null; }
      if (auth && (auth.currentUser || auth.onAuthStateChanged)) {
        clearInterval(pullTimer);
        pullRecord();
        return;
      }
      if (pulls > 40) clearInterval(pullTimer);
    }, 200);
  }

  var API = {
    STORAGE: STORAGE,
    routes: ROUTES,
    value: value,
    pathOf: pathOf,
    queryOf: queryOf,
    stripUi: stripUi,
    resolve: resolve,
    routeFor: routeFor,
    href: href,
    landed: landed,
    upgrade: upgrade,
    destination: destination,
    classicHref: classicHref,
    fromDocs: fromDocs,
    classicView: classicView
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (root) root.OmegaExperience = API;
  if (root && root.document && root.location) watch();
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
