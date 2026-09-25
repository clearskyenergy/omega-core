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
  /* Which of the four pages this is. Under /app-sandbox/ it is the path
     (the committed pages set nothing); a private test link is its own origin
     at '/', so the build writes OMEGA_SANDBOX_APP into the page and that
     wins. Decided BEFORE the sign-in key, which depends on it. */
  var APP = global.OMEGA_SANDBOX_APP || (/\/app-sandbox\/(\w+)/.exec(location.pathname) || [])[1] || '';
  /* the buyer is a different person from the office staff: the customer
     app keeps its own sign-in, so trying the office sample first does not
     open the customer app as the office (with the owner's controls), and
     signing out of one does not sign the other out */
  /* v2: the sample grew a CRM, documents, a pay link and the design tool's
     prices; a phone that kept the v1 sample starts over on the new one.
     v3: the sample order carries the two units still on the line (what a
     site list is spread over); a phone that kept v2 starts over.
     v4: the plant runs the full routing on the sample's own units (the
     bench moves them), the workspace has its people (Team) and the office
     prices and accepts what it bills itself; a phone that kept v3 starts over.
     v5: the sample carries the freight plan's order (56 cabinets, 16
     sites, a ship-from); a phone that kept v4 starts over */
  var KEY = 'omega_sandbox_v5', USER_KEY = 'omega_sandbox_user_v1' + (APP === 'customer' ? '_customer' : ''), ORG = 'cleancell.us';
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
  auth.signInWithEmailAndPassword = function (email) { return become(email); };
  /* "First time here? Create a password": any email, signed in at once (no confirmation email in a sandbox) */
  auth.createUserWithEmailAndPassword = function (email) { return become(email).then(function (u) { return { user: u }; }); };
  auth.sendPasswordResetEmail = function () { return Promise.resolve(); };
  function GoogleAuthProvider() {}
  var fb = { apps: [1], initializeApp: function () {}, auth: function () { return auth; } };
  fb.auth.GoogleAuthProvider = GoogleAuthProvider;
  global.firebase = fb;

  /* ── /api/, answered on the device ───────────────────────────────────── */
  function who() { return user ? user.email : ''; }
  function get(path, q) {
    if (path === '/api/logic-plant') return V.plantJson(q, who());
    if (path === '/api/logic-materials') return /workOrder=/.test(q) ? V.soloJson() : V.materialsJson();
    if (path === '/api/logic-catalog') return V.catalogJson();
    if (path === '/api/logic-office') return V.officeJson();
    if (path === '/api/buyers') return V.buyersJson(q);
    if (path === '/api/po-intake') return V.intakeJson(q, who());
    if (path === '/api/customer-portal') return V.portalJson;
    if (path === '/api/my-account') return V.accountJson(who());
    if (path === '/api/my-orders') return V.myOrdersJson(who());
    if (path === '/api/my-sites') return V.mySitesJson();
    if (path === '/api/logic-custody') return V.custodyJson(q);
    /* the ledger, or one order's freight plan (?freight=<orderId>) */
    if (path === '/api/logic-logistics') return /(^|&)freight=/.test(q) ? V.freightJson(q) : V.logisticsJson();
    if (path === '/api/customer-design') return V.designJson();
    if (path === '/api/crm') return V.crmJson(q);
    if (path === '/api/my-files') return V.myFilesJson(q);
    if (path === '/api/customer-subscribe') return V.subJson(who());
    if (path === '/api/customer-portfolio') return V.portfolioJson();
    if (path === '/api/app-manifest') return V.manifest((/app=(\w+)/.exec(q) || [])[1], TENANT);
    if (path === '/api/logic-workspaces') return V.workspacesJson(who());
    if (path === '/api/logic-team') return V.teamJson(who());
    /* whether Google takes an installed app through this host: yes here,
       unless a check says otherwise (OMEGA_SANDBOX_GOOGLE = false) */
    if (path === '/api/auth-check') return { google: global.OMEGA_SANDBOX_GOOGLE !== false };
    return { status: 404, error: 'Not in this sandbox: ' + path };
  }
  function respond(json, status) { return Promise.resolve(new Response(JSON.stringify(json), { status: status, headers: { 'Content-Type': 'application/json' } })); }
  /* a document, as the endpoints hand one over: bytes, an attachment */
  function bytes(d) { return Promise.resolve(new Response(new Blob([d.body], { type: 'application/octet-stream' }), { status: 200, headers: { 'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment; filename="' + String(d.name || 'document').replace(/["\\\r\n]/g, '_') + '"', 'X-Content-Type-Options': 'nosniff' } })); }
  /* Stripe's two pages are not in a sandbox. Checkout: the sample granted
     the subscription, so make the trip back Stripe would (…&checkout=done
     on this page), which the app says the way the product does — over
     https; a page opened over plain http refuses any non-https link, as
     the real page does. The billing page: said plainly. */
  function stripe(path, out) {
    if (path !== '/api/customer-subscribe' || !out || typeof out.url !== 'string') return out;
    if (out.url === '#manage') return { status: 409, error: 'Manage subscription opens Stripe’s billing page — not part of this sandbox. Nothing is charged here.' };
    if (out.url !== '#subscribed') return out;
    try { var back = new URL(location.href); back.searchParams.set('tab', 'design'); back.searchParams.set('checkout', 'done'); back.hash = ''; return { url: back.href }; } catch (e) { return out; }
  }
  var realFetch = global.fetch ? global.fetch.bind(global) : null;
  global.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '', a = document.createElement('a'); a.href = url;
    if (a.host !== location.host || a.pathname.indexOf('/api/') !== 0) return realFetch ? realFetch(input, init) : Promise.reject(new Error('offline'));
    var method = ((init && init.method) || 'GET').toUpperCase(), body = {};
    try { body = init && init.body ? JSON.parse(init.body) : {}; } catch (e) {}
    var out;
    try { out = method === 'GET' ? get(a.pathname, a.search.slice(1)) : stripe(a.pathname, F.post(state, a.pathname, a.search.slice(1), body, who())); } catch (e) { out = { status: 500, error: e.message }; }
    save(KEY, state);
    if (out && out.error && out.status) return respond({ error: out.error }, out.status);
    if (out && out.download) return bytes(out.download);
    return respond(out, 200);
  };

  /* ── the strip, reset, and the desktop links the sandbox does not have ── */
  function reset() { try { [KEY, USER_KEY, 'omega_station_v1', 'omega_station_pick', 'omega_plant_app_filter', 'omega_office_app_filter', 'omega_office_app_company'].forEach(function (k) { localStorage.removeItem(k); }); } catch (e) {} location.reload(); }
  /* Where the other three pages are. Under /app-sandbox/ they are siblings;
     published as private test links (one artifact per app, each its own
     origin) the build writes OMEGA_SANDBOX_LINKS (and APP, above) into the
     page. A link to another origin opens as a link, not a route. */
  var LINKS = global.OMEGA_SANDBOX_LINKS || { plant: '/app-sandbox/plant', office: '/app-sandbox/office', customer: '/app-sandbox/customer', bench: '/app-sandbox/bench' };
  /* A private test link's frame answers confirm() with false before anyone
     sees it; the pages ask before a stack of POs or an assignment. Nothing
     in a sandbox needs guarding, so say what would have been asked and go. */
  global.confirm = function (msg) { toast(String(msg || '').split('?')[0] + ' — done. (The sandbox skips the confirmation.)'); return true; };
  var CSS = '.sb-strip{background:#6D5BD0;color:#fff;font:600 12px/1.3 system-ui,sans-serif;padding:6px 12px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;position:relative;z-index:6}.sb-strip b{letter-spacing:.1em;text-transform:uppercase;font-size:10.5px}.sb-strip span{opacity:.85;font-weight:500;flex:1 1 240px;min-width:0;line-height:1.35}.sb-strip a,.sb-strip button{color:#fff;background:rgba(255,255,255,.14);border:0;border-radius:6px;padding:4px 8px;font:600 12px system-ui,sans-serif;text-decoration:none;cursor:pointer}.sb-strip a[aria-current]{background:rgba(255,255,255,.34)}.sb-toast{position:fixed;left:12px;right:12px;bottom:calc(76px + env(safe-area-inset-bottom,0));background:#0B2733;color:#fff;padding:12px 14px;border-radius:12px;font:500 14px system-ui,sans-serif;z-index:50;box-shadow:0 8px 24px rgba(0,0,0,.25)}';
  function toast(t) { var el = document.createElement('div'); el.className = 'sb-toast'; el.textContent = t; document.body.appendChild(el); setTimeout(function () { el.remove(); }, 3200); }
  /* THE CUSTOMER SANDBOX IS SENT TO A SUPPLIER'S CUSTOMER: the kit's
     customer message links it (api/_lib/kit.js). The plant, the office (the
     margin sheet, "ClearSky approves the customer price", every other
     company on the book) and the bench are the SUPPLIER'S side, so the
     customer's strip links none of them (DOC-M7, CUST-12, CUST-13), and a
     link into them that a page carries is answered like any desktop page:
     not part of this sample. The other three still link each other and the
     customer app — their people are the supplier's. */
  var SUPPLIER_SIDE = ['plant', 'office', 'bench'];
  function stripLinks() { return (APP === 'customer' ? [] : [['plant', 'Plant'], ['office', 'Office'], ['customer', 'Customer'], ['bench', 'Bench']]).filter(function (x) { return !!LINKS[x[0]]; }); }
  function strip() {
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    var d = document.createElement('div'); d.className = 'sb-strip';
    d.innerHTML = '<b>Sandbox</b><span>Nothing here is real — ' + (APP === 'customer' ? 'a sample company account' : 'a sample plant') + ', on this phone.</span>'
      + stripLinks().map(function (x) { return '<a href="' + LINKS[x[0]] + '"' + (APP === x[0] ? ' aria-current="page"' : '') + '>' + x[1] + '</a>'; }).join('')
      + '<button type="button" id="sb-reset">Reset</button>';
    document.body.insertBefore(d, document.body.firstChild);
    document.getElementById('sb-reset').onclick = function () { if (confirm('Start the sample over? Everything you did in this sandbox on this phone is forgotten.')) reset(); };
  }
  document.addEventListener('DOMContentLoaded', strip);
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null; if (!a) return;
    var href = a.getAttribute('href') || '';
    if (APP === 'customer' && SUPPLIER_SIDE.some(function (k) { return LINKS[k] && href.indexOf(LINKS[k]) === 0 && /^(\.html)?([?#\/]|$)/.test(href.slice(LINKS[k].length)); })) { e.preventDefault(); toast('That is your supplier’s side — not part of this sample.'); return; }
    if (/^(https?:)?\/\//.test(href) || href.charAt(0) !== '/' || href.indexOf('/app-sandbox/') === 0) return;
    e.preventDefault(); toast('That opens a desktop page in the real product — not part of this sandbox.');
  }, true);
  global.OMEGA_SANDBOX = { state: function () { return state; }, reset: reset, become: become };
}(typeof window !== 'undefined' ? window : this));
