/* ClearSky staff is a VERIFIED @clearsky-usa.com address.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   THE HOLE THIS CLOSES
   Staff status used to be decided from the email domain alone. A Firebase
   email/password account can be opened on ANY address without proving it, so
   an unverified rep@clearsky-usa.com was ClearSky staff: past the tenant gates
   in every endpoint that honours caller.staff, and admin in firestore.rules.
   api/proforma.js was fixed first (2026-09-24); this is the same rule applied
   where the decision is made for everybody:
     · api/_lib/verify-token.js verifyIdToken()   — staff and emailVerified
     · api/_lib/admin.js authenticate()           — verified staff domain only
     · firestore.rules isAdmin(), storage.rules isAdminDomain()
     · api/ring.js, which asked isStaffEmail() directly
   "Verified" is the literal true. A missing claim is not verified, and
   neither is the string "true".

   csebuilders.com was RETIRED as a staff domain the same day: it was the
   legacy repo's domain, has no accounts, and a staff domain nobody uses is
   only attack surface. A VERIFIED @csebuilders.com is not staff either.

   The tokens here are real RS256 JWTs signed with a throwaway key, so
   verify-token runs its own signature and claim checks rather than a stub's.
   firebase-admin is intercepted at load: CI runs this with no npm install.

   node scripts/tests/tstaffverified.js */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto'), Module = require('module');
const ROOT = path.join(__dirname, '..', '..');

let fails = 0;
function ok(c, m) { if (!c) { fails++; console.log('  FAIL ' + m); } else console.log('  ok   ' + m); }

/* ── a signing key Google never published, and a fetch that publishes it ── */
const KID = 'test-kid-1';
const pair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const PUBLIC_PEM = pair.publicKey.export({ type: 'spki', format: 'pem' });
const reads = [];
global.fetch = async function (url) {
  url = String(url);
  if (/securetoken@system\.gserviceaccount\.com/.test(url)) {
    return { ok: true, status: 200, headers: { get: () => 'public, max-age=3600' },
             json: async () => ({ [KID]: PUBLIC_PEM }) };
  }
  if (/firestore\.googleapis\.com/.test(url)) {
    reads.push(url.replace(/^.*\/documents\//, ''));
    return { ok: false, status: 404, json: async () => ({}) };   // no record anywhere
  }
  throw new Error('unexpected fetch in test: ' + url);
};

const V = require(path.join(ROOT, 'api/_lib/verify-token.js'));

function b64url(o) { return Buffer.from(JSON.stringify(o)).toString('base64url'); }
function sign(claims) {
  const now = Math.floor(Date.now() / 1000);
  const body = Object.assign({
    aud: V.PROJECT_ID, iss: 'https://securetoken.google.com/' + V.PROJECT_ID,
    sub: 'uid-' + String(claims.email || 'x').split('@')[0], iat: now - 5, exp: now + 3600
  }, claims);
  const head = b64url({ alg: 'RS256', kid: KID, typ: 'JWT' }) + '.' + b64url(body);
  return head + '.' + crypto.createSign('RSA-SHA256').update(head).sign(pair.privateKey).toString('base64url');
}
/* Omit email_verified entirely when the value is undefined. */
function token(email, verified, extra) {
  const c = Object.assign({ email: email }, extra || {});
  if (verified !== undefined) c.email_verified = verified;
  return sign(c);
}

function res() {
  return { statusCode: 0, body: null, headers: {},
    setHeader(k, v) { this.headers[k] = v; }, status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; }, end() { return this; } };
}
function req(tok, extra) {
  return Object.assign({ method: 'GET', headers: { authorization: 'Bearer ' + tok }, query: {} }, extra || {});
}

/* ── 1. verify-token.verifyIdToken ───────────────────────────────────────── */
async function verifyTokenTests() {
  console.log('verify-token.verifyIdToken');
  let c = await V.verifyIdToken(token('rep@clearsky-usa.com', true));
  ok(c.staff === true && c.emailVerified === true, 'a VERIFIED @clearsky-usa.com is staff');
  c = await V.verifyIdToken(token('rep@csebuilders.com', true));
  ok(c.staff === false && c.emailVerified === true, 'a VERIFIED @csebuilders.com is NOT staff (domain retired)');
  c = await V.verifyIdToken(token('REP@CLEARSKY-USA.COM', true));
  ok(c.staff === true, 'the domain is compared case-insensitively');

  c = await V.verifyIdToken(token('rep@clearsky-usa.com', false));
  ok(c.staff === false && c.emailVerified === false, 'an UNVERIFIED @clearsky-usa.com is NOT staff');
  c = await V.verifyIdToken(token('rep@clearsky-usa.com', undefined));
  ok(c.staff === false && c.emailVerified === false, 'a MISSING email_verified claim is not verified, and not staff');
  c = await V.verifyIdToken(token('rep@clearsky-usa.com', 'true'));
  ok(c.staff === false && c.emailVerified === false, 'email_verified "true" as a string is not true');
  c = await V.verifyIdToken(token('rep@clearsky-usa.com.evil.example', true));
  ok(c.staff === false, 'a look-alike domain is not staff, verified or not');

  c = await V.verifyIdToken(token('ana@cleancell.us', true));
  ok(c.staff === false && c.emailVerified === true && c.orgId === 'cleancell.us', 'a verified tenant user: emailVerified, not staff');
  c = await V.verifyIdToken(token('ana@cleancell.us', undefined));
  ok(c.emailVerified === false, 'emailVerified reads an absent claim as NOT verified (it used to read it as verified)');

  /* The claim is inside the signed payload; flipping it breaks the signature. */
  const t = token('rep@clearsky-usa.com', false).split('.');
  const forged = JSON.parse(Buffer.from(t[1], 'base64url').toString());
  forged.email_verified = true;
  let refused = null;
  try { await V.verifyIdToken(t[0] + '.' + b64url(forged) + '.' + t[2]); } catch (e) { refused = e; }
  ok(refused && refused.status === 401, 'setting email_verified in an unsigned edit is refused (401)');
}

/* ── 2. an endpoint on verify-token: the tenant gate staff used to skip ──── */
async function endpointTests() {
  console.log('api/fiber-screen.js (verify-token, staff skips the org and member reads)');
  const screen = require(path.join(ROOT, 'api/fiber-screen.js'));

  reads.length = 0;
  let r = res();
  await screen(req(token('rep@clearsky-usa.com', true)), r);
  ok(r.statusCode === 400 && /latitude/i.test(r.body && r.body.error),
     'verified staff pass the gate and reach input validation (400 on an empty query) — got ' + r.statusCode);
  ok(!reads.some(p => /members\//.test(p)), 'verified staff are not asked for an org membership');

  reads.length = 0;
  r = res();
  await screen(req(token('rep@clearsky-usa.com', false)), r);
  ok(r.statusCode === 403, 'an UNVERIFIED @clearsky-usa.com is refused by the tenant gate — got ' + r.statusCode + ' ' + JSON.stringify(r.body));
  ok(reads.some(p => /^omega_orgs\/clearsky-usa\.com$/.test(p)),
     'and it was judged as an ordinary member of its own domain, not as staff');

  r = res();
  await screen(req(token('rep@clearsky-usa.com', undefined)), r);
  ok(r.statusCode === 403, 'a staff address with no email_verified claim is refused too — got ' + r.statusCode);

  r = res();
  await screen(req(token('rep@csebuilders.com', true)), r);
  ok(r.statusCode === 403, 'a VERIFIED @csebuilders.com is refused by the tenant gate (domain retired) — got ' + r.statusCode);

  console.log('api/ring.js (asked isStaffEmail() directly)');
  const ring = require(path.join(ROOT, 'api/ring.js'));
  const saved = process.env.RING_ALLOWED_EMAILS;
  try {
    delete process.env.RING_ALLOWED_EMAILS;
    r = res(); await ring(req(token('rep@clearsky-usa.com', true), { query: { path: '/nope' } }), r);
    ok(r.statusCode === 400, 'no allowlist: verified staff reach the path check (400) — got ' + r.statusCode);
    r = res(); await ring(req(token('rep@csebuilders.com', true), { query: { path: '/nope' } }), r);
    ok(r.statusCode === 403, 'no allowlist: a VERIFIED @csebuilders.com is refused (domain retired) — got ' + r.statusCode);
    r = res(); await ring(req(token('rep@clearsky-usa.com', false), { query: { path: '/nope' } }), r);
    ok(r.statusCode === 403, 'no allowlist: an UNVERIFIED staff address is refused (403) — got ' + r.statusCode);
    r = res(); await ring(req(token('ana@cleancell.us', true), { query: { path: '/nope' } }), r);
    ok(r.statusCode === 403, 'no allowlist: a verified non-staff address is refused (403)');

    process.env.RING_ALLOWED_EMAILS = 'owner@personal.example';
    r = res(); await ring(req(token('owner@personal.example', true), { query: { path: '/nope' } }), r);
    ok(r.statusCode === 400, 'a VERIFIED named address reaches the path check (400) — got ' + r.statusCode);
    r = res(); await ring(req(token('owner@personal.example', false), { query: { path: '/nope' } }), r);
    ok(r.statusCode === 403, 'an UNVERIFIED named address is refused (403) — got ' + r.statusCode);
    r = res(); await ring(req(token('owner@personal.example', undefined), { query: { path: '/nope' } }), r);
    ok(r.statusCode === 403, 'a named address with no email_verified claim is refused (403)');
  } finally {
    if (saved === undefined) delete process.env.RING_ALLOWED_EMAILS; else process.env.RING_ALLOWED_EMAILS = saved;
  }
}

/* ── 3. admin.js authenticate(), on an intercepted firebase-admin ────────── */
async function adminTests() {
  console.log('api/_lib/admin.js authenticate()');
  const DECODED = {};
  const nothing = { get: async () => ({ exists: false, data: () => ({}) }) };
  const FAKE = {
    apps: [{}],
    initializeApp() {}, credential: { cert() {} },
    auth: () => ({ verifyIdToken: async (t) => { if (!DECODED[t]) throw new Error('bad token'); return DECODED[t]; } }),
    firestore: () => ({ collection: () => ({ doc: () => Object.assign({ collection: () => ({ doc: () => nothing }) }, nothing) }) })
  };
  const load = Module._load;
  Module._load = function (request) {
    if (request === 'firebase-admin') return FAKE;
    return load.apply(this, arguments);
  };
  let A;
  try { A = require(path.join(ROOT, 'api/_lib/admin.js')); } finally { Module._load = load; }

  function as(name, dec) {
    DECODED[name] = Object.assign({ uid: 'uid-' + name }, dec);
    return A.authenticate({ headers: { authorization: 'Bearer ' + name } });
  }

  let c = await as('v', { email: 'rep@clearsky-usa.com', email_verified: true });
  ok(c.staff === true, 'a VERIFIED @clearsky-usa.com is staff');
  c = await as('cse', { email: 'rep@csebuilders.com', email_verified: true });
  ok(c.staff === false, 'a VERIFIED @csebuilders.com is NOT staff (domain retired)');

  const unverified = await as('u', { email: 'rep@clearsky-usa.com', email_verified: false });
  ok(unverified.staff === false, 'an UNVERIFIED @clearsky-usa.com is NOT staff');
  c = await as('m', { email: 'rep@clearsky-usa.com' });
  ok(c.staff === false, 'a MISSING email_verified claim is not staff');
  c = await as('s', { email: 'rep@clearsky-usa.com', email_verified: 'true' });
  ok(c.staff === false, 'email_verified "true" as a string is not true');

  c = await as('claim', { email: 'ops@partner.example', email_verified: false, role: 'staff' });
  ok(c.staff === false, 'a role claim cannot substitute for a verified staff domain');
  c = await as('retired-claim', { email: 'rep@csebuilders.com', email_verified: true, role: 'staff' });
  ok(c.staff === false, 'a role claim cannot restore the retired staff domain');
  c = await as('t', { email: 'ana@cleancell.us', email_verified: true });
  ok(c.staff === false, 'a verified tenant user is not staff');

  /* What staff used to buy: acting in, and administering, somebody else's tenant. */
  ok(await A.canActInOrg(unverified, 'cleancell.us') === false, 'an unverified staff address cannot act in another tenant');
  ok(await A.isTenantAdmin(unverified, 'cleancell.us') === false, 'nor administer one');
  const verified = await as('v2', { email: 'rep@clearsky-usa.com', email_verified: true });
  ok(await A.canActInOrg(verified, 'cleancell.us') === true, 'a verified staff address still can (the bypass is intact for real staff)');
}

/* ── 4. the rules ────────────────────────────────────────────────────────── */
function stripComments(s) { return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''); }
function fnBody(src, name) {
  const m = new RegExp('function\\s+' + name + '\\s*\\(\\s*\\)\\s*\\{([\\s\\S]*?)\\n\\s*\\}').exec(src);
  return m ? m[1] : null;
}
function rulesTests() {
  console.log('firestore.rules / storage.rules');
  const VERIFIED = /request\.auth\.token\.get\(\s*'email_verified'\s*,\s*false\s*\)\s*==\s*true/;
  const fs1 = stripComments(fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8'));
  const isAdmin = fnBody(fs1, 'isAdmin');
  ok(isAdmin && VERIFIED.test(isAdmin), 'firestore.rules isAdmin() requires email_verified == true (absent reads as false)');
  ok(isAdmin && /^\s*return\s+signedIn\(\)\s*&&\s*request\.auth\.token\.get\('email_verified'/.test(isAdmin),
     'and it is a top-level && — not one arm of an ||');
  ok(isAdmin && /clearsky-usa\[\.\]com/.test(isAdmin), 'isAdmin() names @clearsky-usa.com');
  ['isAdmin', 'isVdcOperatorDomain', 'vdcOperatorOrg'].forEach(function (n) {
    const b = fnBody(fs1, n);
    ok(b && !/csebuilders/.test(b), 'firestore.rules ' + n + '() no longer names the retired csebuilders.com');
  });
  ok(/function isOmegaStaff\(\)\s*\{\s*return isAdmin\(\)/.test(fs1) && /function isOmegaAdmin\(\)\s*\{\s*return isAdmin\(\)/.test(fs1),
     'isOmegaStaff() and isOmegaAdmin() reach the domain only through isAdmin()');

  const st = stripComments(fs.readFileSync(path.join(ROOT, 'storage.rules'), 'utf8'));
  const dom = fnBody(st, 'isAdminDomain');
  ok(dom && VERIFIED.test(dom), 'storage.rules isAdminDomain() requires email_verified == true');
  ok(dom && /^\s*return\s+request\.auth\s*!=\s*null\s*&&\s*request\.auth\.token\.get\('email_verified'/.test(dom),
     'and it is a top-level && guarded by request.auth != null');
  ok(dom && !/csebuilders/.test(dom), 'storage.rules isAdminDomain() no longer names the retired csebuilders.com');

  console.log('api/ (the staff domain lists)');
  ['api/_lib/verify-token.js', 'api/_lib/admin.js', 'api/omega-ai-extract.js'].forEach(function (f) {
    const m = /var STAFF_DOMAINS = (\[[^\]]*\])/.exec(fs.readFileSync(path.join(ROOT, f), 'utf8'));
    ok(m && m[1] === "['clearsky-usa.com']", f + ' STAFF_DOMAINS is exactly clearsky-usa.com — got ' + (m && m[1]));
  });
  ok(!/doc\('csebuilders\.com'\)/.test(fs.readFileSync(path.join(ROOT, 'api/tenant-signup.js'), 'utf8')),
     'signup alerts no longer land in the retired csebuilders.com org');
}

(async function () {
  try {
    await verifyTokenTests();
    var savedFetch = global.fetch;
    global.fetch = async function (url) { if (/firestore\.googleapis\.com/.test(String(url))) return { ok: false, status: 503, json: async () => ({}) }; return savedFetch(url); };
    var accessFailure;
    try { await V.authenticateWithTier(req(token('member@example.com', true))); } catch (e) { accessFailure = e; }
    ok(accessFailure && accessFailure.status === 503, 'billing read failure is unavailable, never legacy trial access');
    global.fetch = savedFetch;
    var missing = await V.authenticateWithTier(req(token('member@example.com', true)));
    ok(missing.tier === 'trial' && !missing.billing.packaged, 'an actual missing billing record preserves legacy behavior');
    await endpointTests();
    await adminTests();
    rulesTests();
  } catch (e) {
    fails++; console.log('  FAIL threw: ' + (e && e.stack || e));
  }
  console.log(fails ? '\n' + fails + ' FAILED' : '\nstaff needs a verified email: all passed');
  process.exit(fails ? 1 : 0);
})();
