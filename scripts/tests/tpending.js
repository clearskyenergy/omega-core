/* omega-tenant.js — what an unapproved account is actually allowed to do.
   The request was "a dashboard with no permission to access any tools", which
   is a security statement, not a cosmetic one: the test is that
   unlockedTools comes back empty, not that a banner appears. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'omega-tenant.js'), 'utf8');

let fails = 0;
function ok(c, m) { if (!c) { fails++; console.log('  FAIL ' + m); } else console.log('  ok   ' + m); }

function run(docs, opts) {
  opts = opts || {};
  /* The host has to resolve, or resolveHost() refuses it and paints its own
     overlay into the same body we are counting. */
  docs = Object.assign({ 'tenant_public/roam.clearskyomega.com':
    { orgId: 'roamenergy.co', name: 'Roam Energy', domains: ['roam.clearskyomega.com'] } }, docs);
  const body = { children: [], firstChild: null,
                 insertBefore(n) { this.children.push(n); }, appendChild(n) { this.children.push(n); } };
  function snap(p) { return { exists: p in docs, data: () => docs[p] }; }
  function ref(p) {
    return { get: () => Promise.resolve(snap(p)),
             set: () => Promise.resolve(),
             collection: c => ({ doc: d => ref(p + '/' + c + '/' + d) }) };
  }
  let authCb = null;
  const G = {
    console, setTimeout, Promise, Date, JSON, CustomEvent: function (n, o) { this.type = n; this.detail = o && o.detail; },
    location: { hostname: opts.host || 'roam.clearskyomega.com', pathname: '/', search: '', href: '' },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: { body, createElement: () => ({ id: '', _style: '', setAttribute(k, v) { if (k === 'style') this._style = v; }, innerHTML: '' }),
                getElementById: () => null, addEventListener() {}, readyState: 'complete' },
    addEventListener() {}, dispatchEvent() {},
    CLEARSKY_CONFIG: { tenant: { name: 'Roam Energy', accountTier: 'Trial', tierLevel: 1,
                                 unlockedTools: ['editor', 'projects', 'proforma'] } },
    firebase: {
      auth: () => ({ onAuthStateChanged(cb) { authCb = cb; }, signOut: () => Promise.resolve() }),
      firestore: Object.assign(() => ({ collection: c => ({ doc: d => ref(c + '/' + d) }) }),
                              { FieldValue: { serverTimestamp: () => '<ts>' } })
    }
  };
  G.window = G;
  vm.createContext(G);
  vm.runInContext(SRC, G);
  return { G, body, signIn(user) { authCb && authCb(user); } };
}

const USER = { uid: 'u9', email: 'admin@roamenergy.co', displayName: 'Admin' };
const wait = () => new Promise(r => setTimeout(r, 30));
const banners = t => t.body.children.filter(n => n.id === 'omega-pending').length;

(async function () {
  /* ── 1 · signed up, no workspace yet ─────────────────────────────────── */
  console.log('signed up, awaiting approval');
  let t = run({ 'access_requests/u9': { status: 'pending', company: 'Roam Energy',
                                        email: 'admin@roamenergy.co' } });
  let got = null;
  t.G.OmegaTenant.onEntitlements(ws => { got = ws; });
  t.signIn(USER);
  await wait();
  ok(!!got, 'entitlements still fire — the dashboard loads');
  ok(Array.isArray(got.unlockedTools) && got.unlockedTools.length === 0,
     'and NOTHING is unlocked, whatever config.js says');
  ok(got.pendingApproval === true, 'the workspace object says why');
  ok(banners(t) === 1, 'one banner, at the top of the page');
  const bn = t.body.children.filter(n => n.id === 'omega-pending')[0];
  ok(/position:sticky/.test(bn._style) && !/inset:0/.test(bn._style),
     'a strip at the top, not a screen over the page');

  /* ── 2 · a legacy tenant with no omega_orgs doc still works ──────────── */
  console.log('legacy tenant, never seeded');
  t = run({});
  got = null;
  t.G.OmegaTenant.onEntitlements(ws => { got = ws; });
  t.signIn(USER);
  await wait();
  ok(!!got, 'entitlements fire');
  ok(got.pendingApproval !== true && !(got.unlockedTools && !got.unlockedTools.length),
     'and are NOT locked — an absent org record is not an unapproved account');
  ok(banners(t) === 0, 'no banner');

  /* ── 3 · a declined request is not a pending one ─────────────────────── */
  console.log('declined');
  t = run({ 'access_requests/u9': { status: 'declined', company: 'Roam Energy' } });
  got = null;
  t.G.OmegaTenant.onEntitlements(ws => { got = ws; });
  t.signIn(USER);
  await wait();
  ok(got && got.pendingApproval !== true, 'not locked forever by a request that was answered');

  /* ── 4 · the tenant exists but is pending approval ───────────────────── */
  console.log('tenant pending');
  t = run({ 'omega_orgs/roamenergy.co': { name: 'Roam Energy', status: 'pending' } });
  got = null;
  t.G.OmegaTenant.onEntitlements(ws => { got = ws; });
  t.signIn(USER);
  await wait();
  ok(got && got.unlockedTools.length === 0, 'a pending workspace unlocks nothing');
  ok(banners(t) === 1, 'and says so in a banner');
  ok(t.G.OmegaTenant.status === 'pending', 'status is readable by the page');

  /* ── 5 · an approved, active tenant is unaffected ────────────────────── */
  console.log('approved');
  t = run({ 'omega_orgs/roamenergy.co': { name: 'Roam Energy', status: 'active' },
            'omega_orgs/roamenergy.co/billing/current': { tier: 'trial' } });
  got = null;
  t.G.OmegaTenant.onEntitlements(ws => { got = ws; });
  t.signIn(USER);
  await wait();
  ok(got && got.pendingApproval !== true, 'nothing is locked');
  ok(banners(t) === 0, 'and the banner is gone');

  /* ── 6 · a cached pin for a host that no longer has a tenant_public doc ──
     This is what was logging people out for moving between pages: the cache
     pins a tenant synchronously so the page does not flash, and nothing ever
     corrected it when the document behind it had gone. resolve() then judged
     every user against a workspace this host is not. */
  console.log('stale tenant pin');
  const STALE = { orgId: 'fenecon.com', name: 'FENECON', domains: ['fenecon.com'], tier: 'trial' };
  function runWithCache(docs, cached) {
    const store = {};
    if (cached) store['omega_tenant_public:roam.clearskyomega.com'] = JSON.stringify(cached);
    const t = run(docs, {});
    return t;
  }
  /* Drive resolveHost directly through a fake localStorage that holds a pin
     for a host whose document has been removed. */
  function stalePin(docsHaveHost) {
    const seen = {};
    const body = { children: [], firstChild: null, insertBefore() {}, appendChild() {} };
    function snap(p) { return { exists: p in DOCS, data: () => DOCS[p] }; }
    const DOCS = docsHaveHost
      ? { 'tenant_public/roam.clearskyomega.com': STALE }
      : {};
    function ref(p) {
      return { get: () => Promise.resolve(snap(p)), set: () => Promise.resolve(),
               collection: c => ({ doc: d => ref(p + '/' + c + '/' + d) }) };
    }
    const G = {
      console, setTimeout, Promise, Date, JSON,
      CustomEvent: function (n, o) { this.type = n; this.detail = o && o.detail; },
      location: { hostname: 'roam.clearskyomega.com', pathname: '/', search: '', href: '' },
      localStorage: { _s: Object.assign({}, seen,
                        { 'omega_tenant_public:roam.clearskyomega.com': JSON.stringify(STALE) }),
                      getItem(k) { return this._s[k] === undefined ? null : this._s[k]; },
                      setItem(k, v) { this._s[k] = v; },
                      removeItem(k) { delete this._s[k]; } },
      document: { body, createElement: () => ({ id: '', setAttribute() {}, innerHTML: '' }),
                  getElementById: () => null, addEventListener() {}, readyState: 'complete',
                  documentElement: { style: { setProperty() {} } } },
      addEventListener() {}, dispatchEvent() {},
      CLEARSKY_CONFIG: {},
      firebase: { auth: () => ({ onAuthStateChanged() {}, signOut: () => Promise.resolve() }),
                  firestore: Object.assign(() => ({ collection: c => ({ doc: d => ref(c + '/' + d) }) }),
                                           { FieldValue: { serverTimestamp: () => '<ts>' } }) }
    };
    G.window = G;
    vm.createContext(G);
    vm.runInContext(SRC, G);
    return G;
  }

  let G = stalePin(false);
  await wait();
  ok(!(G.CLEARSKY_CONFIG.tenant && G.CLEARSKY_CONFIG.tenant.orgId),
     'a cached pin is dropped when the host has no tenant_public document');
  ok(G.localStorage.getItem('omega_tenant_public:roam.clearskyomega.com') === null,
     'and the cache behind it is cleared, so a reload does not re-pin it');

  G = stalePin(true);
  await wait();
  ok(!!(G.CLEARSKY_CONFIG.tenant && G.CLEARSKY_CONFIG.tenant.orgId === 'fenecon.com'),
     'a cache that still matches a live document keeps its pin');

  console.log(fails ? '\n' + fails + ' FAILED' : '\nall passed');
  process.exit(fails ? 1 : 0);
})();
