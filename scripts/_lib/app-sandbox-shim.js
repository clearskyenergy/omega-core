/* ═══════════════════════════════════════════════════════════════════════════
   scripts/_lib/app-sandbox-shim.js — the three phone apps with nothing behind
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   The plant app, the office app, the customer app and the bench screen talk
   to two things: the Firebase compat SDK (auth) and the signed-in endpoints
   under /api/. This file stands in for both, so the REAL pages, unmodified
   in their logic, run from a static link with the sample Clean Cell on the
   device. scripts/build-app-sandbox.js bundles the fixtures and the pure
   libraries above this and drops the whole thing next to the pages as
   app-sandbox/sandbox.js.

   WHAT IS REAL HERE: the pages, every screen, every flow, and the numbers —
   the board, the map, the materials plan, the bench steps and the sizes
   are computed by the same libraries the product runs (bundled, not
   copied). WHAT IS NOT: sign-in (any email works, no password), the data
   (one sample tenant, kept in this browser's localStorage), and the desktop
   pages the apps link to (not part of the sandbox; a tap says so).

   Never deployed as a product: it is a private test link.  ES5.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';
  var F = global.OmegaSandboxFixtures, TENANT = global.OMEGA_SANDBOX_TENANT || {};
  var KEY = 'omega_sandbox_v1', USER_KEY = 'omega_sandbox_user_v1', ORG = 'cleancell.us';
  function load(k) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function seedIfMissing(k, v) { try { if (!localStorage.getItem(k)) localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  var state = load(KEY) || F.initialState(); save(KEY, state);
  var V = F.views(state);
  /* The apps remember their workspace; the bench remembers its pairing.
     Both are seeded so the trial does not start with a form. Any station
     ID and token pair on the bench screen; "st-phone" is a roaming phone. */
  seedIfMissing('omega_plant_app_org', ORG); seedIfMissing('omega_office_app_org', ORG); seedIfMissing('omega_customer_app_org', ORG);
  seedIfMissing('omega_station_v1', { stationId: 'st-phone', token: 'sandbox', label: 'Marco’s phone', station: '*', roaming: true, lineId: 'main', location: '', brand: F.brand });
  global.CLEARSKY_CONFIG = { firebase: {}, tenant: { orgId: ORG } };

  /* ── firebase.auth(), enough of it ───────────────────────────────────── */
  var listeners = [], user = load(USER_KEY);
  function mk(u) { return u ? { uid: 'sandbox-' + u.email, email: u.email, getIdToken: function () { return Promise.resolve('sandbox'); } } : null; }
  var auth = { currentUser: mk(user) };
  function become(email) { user = email ? { email: String(email).toLowerCase() } : null; save(USER_KEY, user); auth.currentUser = mk(user); listeners.forEach(function (fn) { setTimeout(function () { fn(auth.currentUser); }, 0); }); return Promise.resolve(auth.currentUser); }
  auth.onAuthStateChanged = function (fn) { listeners.push(fn); setTimeout(function () { fn(auth.currentUser); }, 0); return function () {}; };
  auth.signInWithPopup = function () { return become(global.OMEGA_SANDBOX_STAFF || 'demo@cleancell.us'); };
  auth.signInWithRedirect = auth.signInWithPopup;
  auth.signOut = function () { return become(null); };
  auth.sendSignInLinkToEmail = function (email) { return become(email).then(function () { return undefined; }); };
  auth.isSignInWithEmailLink = function () { return false; };
  auth.signInWithEmailLink = function (email) { return become(email); };
  function GoogleAuthProvider() {}
  var fb = { apps: [1], initializeApp: function () {}, auth: function () { return auth; } };
  fb.auth.GoogleAuthProvider = GoogleAuthProvider;
  global.firebase = fb;

  /* ── /api/, answered on the device ───────────────────────────────────── */
  function who() { return user ? user.email : ''; }
  function get(path, q) {
    if (path === '/api/logic-plant') return V.plantJson(q);
    if (path === '/api/logic-materials') return /workOrder=/.test(q) ? V.soloJson() : V.materialsJson();
    if (path === '/api/logic-catalog') return V.catalogJson();
    if (path === '/api/logic-office') return V.officeJson();
    if (path === '/api/buyers') return V.buyersJson(q);
    if (path === '/api/po-intake') return V.intakeJson(q, who());
    if (path === '/api/customer-portal') return V.portalJson;
    if (path === '/api/my-account') return V.accountJson(who());
    if (path === '/api/my-orders') return V.myOrdersJson(who());
    if (path === '/api/customer-design') return V.designJson();
    if (path === '/api/app-manifest') return V.manifest((/app=(\w+)/.exec(q) || [])[1], TENANT);
    return { status: 404, error: 'Not in this sandbox: ' + path };
  }
  function respond(json, status) { return Promise.resolve(new Response(JSON.stringify(json), { status: status, headers: { 'Content-Type': 'application/json' } })); }
  var realFetch = global.fetch ? global.fetch.bind(global) : null;
  global.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '', a = document.createElement('a'); a.href = url;
    if (a.host !== location.host || a.pathname.indexOf('/api/') !== 0) return realFetch ? realFetch(input, init) : Promise.reject(new Error('offline'));
    var method = ((init && init.method) || 'GET').toUpperCase(), body = {};
    try { body = init && init.body ? JSON.parse(init.body) : {}; } catch (e) {}
    var out;
    try { out = method === 'GET' ? get(a.pathname, a.search.slice(1)) : F.post(state, a.pathname, a.search.slice(1), body, who()); } catch (e) { out = { status: 500, error: e.message }; }
    save(KEY, state);
    if (out && out.error && out.status) return respond({ error: out.error }, out.status);
    return respond(out, 200);
  };

  /* ── the strip, reset, and the desktop links the sandbox does not have ── */
  function reset() { try { [KEY, USER_KEY, 'omega_station_v1', 'omega_station_pick', 'omega_plant_app_filter', 'omega_office_app_filter', 'omega_office_app_company'].forEach(function (k) { localStorage.removeItem(k); }); } catch (e) {} location.reload(); }
  var APP = (/\/app-sandbox\/(\w+)/.exec(location.pathname) || [])[1] || '';
  var CSS = '.sb-strip{background:#6D5BD0;color:#fff;font:600 12px/1.3 system-ui,sans-serif;padding:6px 12px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;position:relative;z-index:6}.sb-strip b{letter-spacing:.1em;text-transform:uppercase;font-size:10.5px}.sb-strip span{opacity:.85;font-weight:500;flex:1;min-width:0}.sb-strip a,.sb-strip button{color:#fff;background:rgba(255,255,255,.14);border:0;border-radius:6px;padding:4px 8px;font:600 12px system-ui,sans-serif;text-decoration:none;cursor:pointer}.sb-strip a[aria-current]{background:rgba(255,255,255,.34)}.sb-toast{position:fixed;left:12px;right:12px;bottom:calc(76px + env(safe-area-inset-bottom,0));background:#0B2733;color:#fff;padding:12px 14px;border-radius:12px;font:500 14px system-ui,sans-serif;z-index:50;box-shadow:0 8px 24px rgba(0,0,0,.25)}';
  function toast(t) { var el = document.createElement('div'); el.className = 'sb-toast'; el.textContent = t; document.body.appendChild(el); setTimeout(function () { el.remove(); }, 3200); }
  function strip() {
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    var d = document.createElement('div'); d.className = 'sb-strip';
    d.innerHTML = '<b>Sandbox</b><span>Nothing here is real — a sample plant, on this phone.</span>'
      + [['plant', 'Plant'], ['office', 'Office'], ['customer', 'Customer'], ['bench', 'Bench']].map(function (x) { return '<a href="/app-sandbox/' + x[0] + '"' + (APP === x[0] ? ' aria-current="page"' : '') + '>' + x[1] + '</a>'; }).join('')
      + '<button type="button" id="sb-reset">Reset</button>';
    document.body.insertBefore(d, document.body.firstChild);
    document.getElementById('sb-reset').onclick = function () { if (confirm('Start the sample over? Everything you did in this sandbox on this phone is forgotten.')) reset(); };
  }
  document.addEventListener('DOMContentLoaded', strip);
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null; if (!a) return;
    var href = a.getAttribute('href') || '';
    if (/^(https?:)?\/\//.test(href) || href.charAt(0) !== '/' || href.indexOf('/app-sandbox/') === 0) return;
    e.preventDefault(); toast('That opens a desktop page in the real product — not part of this sandbox.');
  }, true);
  global.OMEGA_SANDBOX = { state: function () { return state; }, reset: reset, become: become };
}(typeof window !== 'undefined' ? window : this));
