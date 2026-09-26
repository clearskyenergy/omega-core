/* A two-tool product, and the one page it used to hold on.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Clean Cell resells a white-labelled design tool that is Site Map + Grid
   Atlas and nothing else. That is not a new feature — it is
   billing/current.toolAccess = ['editor','gridatlas'], a field the master
   console has written for a while.

   TWO FAILURES, BOTH SILENT, BOTH SELL SOMETHING WE DID NOT AGREE TO.

   1 · THE ALLOWLIST WAS ONLY ENFORCED ON THE DASHBOARD.
       index.html reads billing.toolAccess and re-runs its tool locks.
       omega-tenant.js — which every OTHER signed-in page uses, and which
       computes ws.unlockedTools — read only members/{uid}.toolAccess. So a
       customer sold two tools saw two tiles on the dashboard and had the
       tier's full set everywhere else. Colleagues auto-join as `member` with
       no member doc at all, so for them the restriction did not exist.

   2 · AN EMPTY ALLOWLIST MEANT "UNRESTRICTED" IN THE CLIENT AND "DENY" ON
       THE SERVER. omega-tools.js tested `toolAccess && .length`, so [] fell
       through to the tier and showed the tool unlocked; api/fiber-screen.js
       and api/compute-lease.js refuse it with a 403, and
       tests/fiber-api.test.js already asserted that. A tile that opens onto
       a 403 is the wrong direction for a client/server disagreement.

   node scripts/tests/ttoolaccess.js */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..', '..');
const TENANT_SRC = fs.readFileSync(path.join(ROOT, 'omega-tenant.js'), 'utf8');
const TOOLS = require(path.join(ROOT, 'omega-tools.js'));

let pass = 0, fail = 0;
function ok(m, c, got) {
  if (c) { pass++; return; }
  fail++; console.log('  FAIL ' + m + (got !== undefined ? '  got: ' + JSON.stringify(got) : ''));
}

/* The product, named once. */
const DESIGN_PRODUCT = ['editor', 'gridatlas'];

/* ── 1 · omega-tools.js: absent, empty and populated are three states ──── */
const EDITOR = { key: 'editor', tier: 1 };
const ATLAS = { key: 'gridatlas', tier: 0 };
const PROFORMA = { key: 'proforma', tier: 1 };

function unlocked(tool, ws) { return TOOLS.isUnlocked(tool, ws); }

/* Absent → the tier decides, exactly as before. */
ok('no allowlist: the tier still grants a tool',
   unlocked(PROFORMA, { tierLevel: 3 }) === true);

/* Populated → only what it names, whatever the tier. */
const TWO = { tierLevel: 3, toolAccess: DESIGN_PRODUCT };
ok('allowlist grants what it names', unlocked(EDITOR, TWO) === true);
ok('allowlist grants the second thing it names', unlocked(ATLAS, TWO) === true);
ok('allowlist refuses an enterprise tool it does not name',
   unlocked(PROFORMA, TWO) === false, unlocked(PROFORMA, TWO));

/* An allowlist outranks every widening lever underneath it — that is what
   makes it an allowlist rather than a suggestion. */
ok('requiredTools cannot widen an allowlist',
   unlocked(PROFORMA, { tierLevel: 3, toolAccess: DESIGN_PRODUCT, requiredTools: ['proforma'] }) === false);
ok('unlockedTools cannot widen an allowlist',
   unlocked(PROFORMA, { tierLevel: 3, toolAccess: DESIGN_PRODUCT, unlockedTools: ['proforma'] }) === false);
ok('toolOverrides cannot widen an allowlist',
   unlocked(PROFORMA, { tierLevel: 3, toolAccess: DESIGN_PRODUCT, toolOverrides: { proforma: true } }) === false);

/* ★ EMPTY IS NOT ABSENT. The fix, and the client/server agreement it buys. */
ok('★ an EMPTY allowlist grants nothing, matching the api/ tool gates',
   unlocked(EDITOR, { tierLevel: 3, toolAccess: [] }) === false,
   unlocked(EDITOR, { tierLevel: 3, toolAccess: [] }));
ok('an empty allowlist is not widened by requiredTools either',
   unlocked(EDITOR, { tierLevel: 3, toolAccess: [], requiredTools: ['editor'] }) === false);

/* No workspace at all is admin/internal and still sees everything. */
ok('no workspace still sees everything', unlocked(PROFORMA, null) === true);

/* ── 2 · The product, against the REAL catalogue ─────────────────────────
   Asserted on OMEGATools.catalog() rather than a fixture, because the thing
   that must stay true is "these two and nothing else" as tools are added.
   A fixture would keep passing while tool 43 quietly joined the product. */
(function () {
  const cat = TOOLS.catalog();
  ok('the real catalogue loaded', cat.length > 10, cat.length);
  const ws = { tierLevel: 3, addons: ['whitelabel'], toolAccess: DESIGN_PRODUCT };
  const got = cat.filter(t => TOOLS.isUnlocked(t, ws)).map(t => t.key).sort();
  ok('★ the design product is exactly Site Map + Grid Atlas',
     got.join(',') === DESIGN_PRODUCT.slice().sort().join(','), got);

  /* And they are the tools he named, under the names the catalogue uses —
     "site map editor" is key `editor`, whose display name is "Site Map". */
  const byKey = k => cat.filter(t => t.key === k)[0];
  ok('`editor` is the one called Site Map', (byKey('editor') || {}).name === 'Site Map',
     (byKey('editor') || {}).name);
  ok('`gridatlas` is Grid Atlas', (byKey('gridatlas') || {}).name === 'Grid Atlas',
     (byKey('gridatlas') || {}).name);
  ok('Grid Atlas is a page of its own, so it can be linked directly',
     (byKey('gridatlas') || {}).file === '/grid-atlas.html', (byKey('gridatlas') || {}).file);
})();

/* ── 3 · omega-tenant.js: the org allowlist reaches the workspace ───────
   Harness after scripts/tests/tpending.js — the host has to resolve or
   resolveHost() refuses it and never gets to the entitlement phase. */
function run(docs, host, projection) {
  docs = Object.assign({
    'tenant_public/cc.clearskyomega.com': {
      orgId: 'design-customer.com', name: 'A Clean Cell customer',
      domains: ['cc.clearskyomega.com']
    }
  }, docs);
  const body = { children: [], firstChild: null,
                 insertBefore(n) { this.children.push(n); }, appendChild(n) { this.children.push(n); } };
  const snap = p => ({ exists: p in docs, data: () => docs[p] });
  const ref = p => ({
    get: () => docs.__failedBilling && /billing\/current$/.test(p) ? Promise.reject(new Error('offline')) : Promise.resolve(snap(p)),
    set: () => Promise.resolve(),
    collection: c => ({ doc: d => ref(p + '/' + c + '/' + d) })
  });
  let authCb = null;
  const G = {
    console, setTimeout, Promise, Date, JSON,
    fetch: async () => ({ ok: !!projection, json: async () => projection }),
    CustomEvent: function (n, o) { this.type = n; this.detail = o && o.detail; },
    location: { hostname: host || 'cc.clearskyomega.com', pathname: '/', search: '', href: '' },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: {
      body,
      createElement: () => ({ id: '', _style: '', setAttribute(k, v) { if (k === 'style') this._style = v; }, innerHTML: '', querySelector: () => null }),
      getElementById: () => null, addEventListener() {}, readyState: 'complete'
    },
    addEventListener() {}, dispatchEvent() {},
    CLEARSKY_CONFIG: { tenant: { name: 'A Clean Cell customer', accountTier: 'Standard', tierLevel: 1 } },
    /* The real tool layer, so unlockedTools is computed from the real
       catalogue by the real filter. */
    OMEGATools: TOOLS,
    firebase: {
      apps: [{ name: '[DEFAULT]' }], initializeApp() {},
      auth: () => ({ onAuthStateChanged(cb) { authCb = cb; }, signOut: () => Promise.resolve() }),
      firestore: Object.assign(() => ({ collection: c => ({ doc: d => ref(c + '/' + d) }) }),
                               { FieldValue: { serverTimestamp: () => '<ts>' } })
    }
  };
  G.window = G;
  vm.createContext(G);
  vm.runInContext(TENANT_SRC, G);
  return { G, signIn: u => authCb && authCb(u) };
}

const USER = { getIdToken: () => Promise.resolve('fixture'), uid: 'u1', email: 'chris@design-customer.com', displayName: 'Chris' };
const ORG = 'omega_orgs/design-customer.com';
const wait = () => new Promise(r => setTimeout(r, 40));

function entitlements(docs, projection) {
  const t = run(docs, null, projection);
  let got = null;
  t.G.OmegaTenant.onEntitlements(ws => { got = ws; });
  t.signIn(USER);
  return wait().then(() => got);
}

(async function () {
  const org = { name: 'A Clean Cell customer', status: 'active', vertical: 'developer' };

  /* 3a · ★ THE CASE THAT WAS BROKEN. The org bought two tools. The member
     doc says nothing — which is every colleague who auto-joins. */
  let ws = await entitlements({
    [ORG]: org,
    [ORG + '/billing/current']: { tier: 'deluxe', toolAccess: DESIGN_PRODUCT },
    [ORG + '/members/u1']: { email: USER.email, role: 'member', status: 'active' }
  });
  ok('entitlements resolved', !!ws);
  ok('★ the ORG allowlist reaches the workspace',
     ws && (ws.toolAccess || []).join(',') === DESIGN_PRODUCT.join(','), ws && ws.toolAccess);
  ok('★ unlockedTools is the two-tool product, not the deluxe tier',
     ws && (ws.unlockedTools || []).slice().sort().join(',') === DESIGN_PRODUCT.slice().sort().join(','),
     ws && ws.unlockedTools);
  ok('the tier is still deluxe underneath — the allowlist narrows, it does not downgrade',
     ws && ws.tierLevel === 2, ws && ws.tierLevel);

  /* 3b · No member doc at all. A colleague who auto-joined. */
  ws = await entitlements({
    [ORG]: org,
    [ORG + '/billing/current']: { tier: 'deluxe', toolAccess: DESIGN_PRODUCT }
  });
  ok('★ a colleague with no member doc is still restricted',
     ws && (ws.unlockedTools || []).slice().sort().join(',') === DESIGN_PRODUCT.slice().sort().join(','),
     ws && ws.unlockedTools);

  /* 3c · No allowlist anywhere. Every tenant live today — nothing may change
     for them, which is the whole risk of touching this function. */
  ws = await entitlements({
    [ORG]: org,
    [ORG + '/billing/current']: { tier: 'deluxe', addons: ['engineering'] },
    [ORG + '/members/u1']: { email: USER.email, role: 'admin', status: 'active' }
  });
  ok('no allowlist leaves toolAccess unset', ws && !ws.toolAccess, ws && ws.toolAccess);
  ok('no allowlist keeps a deluxe account on more than two tools',
     ws && (ws.unlockedTools || []).length > DESIGN_PRODUCT.length, ws && (ws.unlockedTools || []).length);

  /* 3d · Member-only allowlist — the pre-existing behaviour, unchanged. */
  ws = await entitlements({
    [ORG]: org,
    [ORG + '/billing/current']: { tier: 'deluxe' },
    [ORG + '/members/u1']: { email: USER.email, role: 'member', status: 'active', toolAccess: ['gridatlas'] }
  });
  ok('a member-only allowlist still works',
     ws && (ws.toolAccess || []).join(',') === 'gridatlas', ws && ws.toolAccess);

  /* 3e · Both. They INTERSECT: this person gets one of the two the org bought. */
  ws = await entitlements({
    [ORG]: org,
    [ORG + '/billing/current']: { tier: 'deluxe', toolAccess: DESIGN_PRODUCT },
    [ORG + '/members/u1']: { email: USER.email, role: 'member', status: 'active', toolAccess: ['gridatlas'] }
  });
  ok('org ∩ member is the intersection',
     ws && (ws.toolAccess || []).join(',') === 'gridatlas', ws && ws.toolAccess);

  /* 3f · ★ A member doc must not be able to name a tool the org never bought.
     members/{uid} is writable by a TENANT ADMIN, so a union here would let a
     customer grant themselves the whole platform by editing their own team. */
  ws = await entitlements({
    [ORG]: org,
    [ORG + '/billing/current']: { tier: 'deluxe', toolAccess: DESIGN_PRODUCT },
    [ORG + '/members/u1']: { email: USER.email, role: 'admin', status: 'active',
                             toolAccess: ['editor', 'proforma', 'financing'] }
  });
  ok('★ a member list cannot name a tool the org did not buy',
     ws && (ws.toolAccess || []).join(',') === 'editor', ws && ws.toolAccess);
  ok('★ and the computed tool set does not contain it either',
     ws && (ws.unlockedTools || []).indexOf('proforma') < 0, ws && ws.unlockedTools);

  /* 3g · An empty intersection is a misconfiguration and resolves to nothing
     rather than to everything. Asserted end to end, because this is where the
     client and the api/ gates had to be made to agree. */
  ws = await entitlements({
    [ORG]: org,
    [ORG + '/billing/current']: { tier: 'deluxe', toolAccess: DESIGN_PRODUCT },
    [ORG + '/members/u1']: { email: USER.email, role: 'member', status: 'active', toolAccess: ['proforma'] }
  });
  ok('an empty intersection is empty, not absent',
     ws && Array.isArray(ws.toolAccess) && ws.toolAccess.length === 0, ws && ws.toolAccess);
  ok('★ and offers nothing rather than the whole tier',
     ws && (ws.unlockedTools || []).length === 0, ws && ws.unlockedTools);

  for (const emptyAt of ['billing', 'member']) {
    ws = await entitlements({ [ORG]: org,
      [ORG + '/billing/current']: { tier: 'enterprise', toolAccess: emptyAt === 'billing' ? [] : DESIGN_PRODUCT },
      [ORG + '/members/u1']: { role: 'member', status: 'active', toolAccess: emptyAt === 'member' ? [] : DESIGN_PRODUCT } });
    ok(emptyAt + ' empty allowlist closes every tool', ws && ws.toolAccess.length === 0 && ws.unlockedTools.length === 0);
  }
  const projection = require('../../api/_lib/package-access').project({ emailVerified: true },
    { packaged: true, modules: ['lite'], packagingState: 'paid' }, org, { role: 'member', status: 'active' });
  const packagedDocs = { [ORG]: org, [ORG + '/billing/current']: { packaged: true, tier: 'enterprise', toolAccess: ['proforma'] },
    [ORG + '/members/u1']: { role: 'member', status: 'active' } };
  ws = await entitlements(packagedDocs, projection);
  ok('package projection overrides legacy enterprise and allowlist', ws && ws.packaged && ws.toolAccess.indexOf('editor') >= 0 && ws.toolAccess.indexOf('proforma') < 0);
  ok('unowned packaged tool is hidden, not a disabled tile', !TOOLS.isVisible(PROFORMA, ws));
  ws = await entitlements(packagedDocs, null);
  ok('failed package projection closes every tool', ws && ws.toolAccess.length === 0 && ws.unlockedTools.length === 0);
  ws = await entitlements({ [ORG]: org, __failedBilling: true });
  ok('failed billing read cannot fall back to config tier', ws && ws.toolAccess.length === 0 && ws.unlockedTools.length === 0);

  console.log('\ntool access allowlist: ' + pass + ' passed, ' + fail + ' failed');
  if (fail) process.exit(1);
})();
