#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   scripts/render-signup.js — Create an account, and where it lands
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Boots the REAL login.html and start.html in Chromium. login.html imports
   the MODULAR Firebase SDK; each module is answered by a thin shim over
   scripts/_lib/firebase-double.js, and start.html's compat SDK is the double
   itself. The signed-in person survives a navigation in the tab, as a
   Firebase session does, and their ID token says "verified" only once it is
   minted after the email link is clicked, as Firebase's does. /api/
   tenant-signup and /api/subscription-proposal are the REAL endpoints on the
   in-memory Firestore double, QuickBooks mocked. Nothing leaves the machine.

   2026-09-27: Create account on the login page opened a brand-new company
   onto /workspace (a workspace derived from the email domain) instead of
   the signup; then it opened the signup on a company form that asked again
   and waited behind the email link, which read as the old request path.
   It holds that:
     1. a new company's account goes from Create account straight into the
        signup (How you work today), company carried over, then the billing
        profile and Build your system, priced, BEFORE the email link is
        clicked; Subscribe waits for the link (nothing is created), and the
        click carries the page on by itself to the first invoice;
     2. a colleague of an existing workspace still goes in;
     3. a signed-in person with no workspace yet goes to signup, including
        one who accepted terms on an empty derived workspace (no projects);
     4. a legacy person without a record who has projects keeps the
        workspace;
     5. with packaged signup off, the older access request is unchanged.

     node scripts/render-signup.js
     npm run check:pages
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
process.env.PACKAGING_PROVIDER = 'quickbooks';
var http = require('http'), fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..');
var PW = process.env.PLAYWRIGHT || (function () { try { return require.resolve('playwright'); } catch (e) { return '/opt/node22/lib/node_modules/playwright'; } })();
var chromium; try { chromium = require(PW).chromium; } catch (e) { console.log('render-signup: Playwright not found (' + PW + '); skipped'); process.exit(0); }
var SANDBOX_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
var CHROME = process.env.CHROME || (fs.existsSync(SANDBOX_CHROME) ? SANDBOX_CHROME : chromium.executablePath());
if (!fs.existsSync(CHROME)) { console.log('render-signup: Chromium not found (' + CHROME + '); skipped'); process.exit(0); }
var DOUBLE = fs.readFileSync(path.join(ROOT, 'scripts/_lib/firebase-double.js'), 'utf8');

/* the server: the real signup and quote endpoints on the Firestore double */
var F = require('./_lib/firestore-double'), H = require('./_lib/packaging-billing-fixture'), B = require('../api/_lib/pricebook');
var sdb = null, caller = null, invoices = 0;
H.mockAdmin(function () { return sdb; }, function () { return caller; });
F.mock('../api/_lib/mail', { templates: { signupReceived: async function () {}, signupAlert: async function () {}, billingAlert: async function () {} } });
H.mockQbo(function () { invoices++; }, { paid: false });
var ROUTES = { '/api/tenant-signup': require('../api/tenant-signup'), '/api/subscription-proposal': require('../api/subscription-proposal') };
function seedServer() { sdb = new F.DB(); sdb.serial = true; var book = B.proposed(); book.enabled = true; book.qbo.realmId = 'fixture'; sdb.seed('pricebook/' + book.version, book); }
/* the page's token is "tok|email|verified|uid" (below); the endpoint sees what a verified Firebase token would say */
function callerOf(auth) {
  var m = /^Bearer tok\|([^|]+)\|([01])\|(.+)$/.exec(auth || ''); if (!m) return null;
  return { uid: m[3], email: m[1], orgId: m[1].split('@')[1], staff: false, role: null, claims: { email_verified: m[2] === '1', name: '' } };
}

var TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
var PACKAGED = true, posts = [];
var srv = http.createServer(async function (req, res) {
  var u = req.url.split('?')[0];
  function json(o, s) { res.writeHead(s || 200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); }
  if (u.indexOf('/api/') === 0) {
    /* the shape api/offerings.js answers; only signup is read here */
    if (u === '/api/offerings') return json({ signup: { packaged: PACKAGED, payNow: PACKAGED, start: '/start.html' } });
    if (ROUTES[u]) {
      var chunks = []; for await (var c of req) chunks.push(c);
      var body = chunks.length ? JSON.parse(Buffer.concat(chunks)) : {};
      caller = callerOf(req.headers.authorization);
      if (!caller) return json({ error: 'sign in first' }, 401);
      if (req.method === 'POST') posts.push(u + ' ' + (body.action || (body.payNow ? 'pay-now' : 'create')) + ' ' + (caller.claims.email_verified ? 'verified' : 'unverified'));
      try { return json(await ROUTES[u]({ method: req.method, headers: req.headers, query: {}, body: body }, { setHeader: function () {} })); }
      catch (e) { return json({ error: e.message }, e.status || 500); }
    }
    return json({ error: 'no ' + u }, 404);
  }
  var f = path.join(ROOT, u === '/' ? 'index.html' : u);
  if (!fs.existsSync(f) && fs.existsSync(f + '.html')) f += '.html';
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
});
var SHIM = {
  'firebase-app.js': 'export function initializeApp(c){ try { return window.firebase.initializeApp(c); } catch (e) { return window.firebase.app(); } }',
  'firebase-auth.js': [
    'const D = () => window.__firebaseDouble;',
    'export function getAuth(){ return D().auth; }',
    'export const browserLocalPersistence = "local";',
    'export function setPersistence(){ return Promise.resolve(); }',
    'export function onAuthStateChanged(a, fn){ return a.onAuthStateChanged(fn); }',
    'export function createUserWithEmailAndPassword(a, e, p){ return a.createUserWithEmailAndPassword(e, p); }',
    'export function signInWithEmailAndPassword(a, e, p){ return a.signInWithEmailAndPassword(e, p); }',
    'export function sendEmailVerification(u, o){ D().auth.log.push({ op: "verify", url: o && o.url }); return Promise.resolve(); }',
    'export class GoogleAuthProvider { constructor(){ this.providerId = "google.com"; } setCustomParameters(p){ this._params = p; } }',
    'export function signInWithPopup(a, p){ return a.signInWithPopup(p); }',
    'export function sendPasswordResetEmail(a, e){ return a.sendPasswordResetEmail(e); }',
    'export function signOut(a){ return a.signOut(); }',
    'export function reload(u){ return u.reload(); }'
  ].join('\n'),
  'firebase-firestore.js': [
    'const D = () => window.__firebaseDouble;',
    'export function getFirestore(){ return D().db; }',
    'export function doc(db, ...s){ return db.doc(s.join("/")); }',
    'export function collection(db, n){ return db.collection(n); }',
    'export function where(f, op, v){ return { f, op, v }; }',
    'export function limit(n){ return { limit: n }; }',
    'export function query(q, ...parts){ parts.forEach(p => { q = p.limit ? q.limit(p.limit) : q.where(p.f, p.op, p.v); }); return q; }',
    'export function getDoc(r){ return r.get().then(s => ({ id: s.id, exists: () => s.exists, data: () => s.data() })); }',
    'export function getDocs(q){ return q.get(); }',
    'export function setDoc(r, d, o){ return r.set(d, o); }',
    'export function serverTimestamp(){ return window.firebase.firestore.FieldValue.serverTimestamp(); }'
  ].join('\n')
};
var fails = 0; function ok(n, c, d) { console.log((c ? 'ok   ' : 'FAIL ') + n + (c ? '' : ' ' + JSON.stringify(d))); if (!c) fails++; }
function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
(async function () {
  process.env.PACKAGING_SIGNUP_ENABLED = 'true'; process.env.PACKAGING_BILLING_ENABLED = 'true'; process.env.QBO_ENV = 'sandbox';
  await new Promise(function (r) { srv.listen(0, '127.0.0.1', r); });
  var base = 'http://127.0.0.1:' + srv.address().port;
  var browser = await chromium.launch({ executablePath: CHROME });
  async function ctxFor(docs, user) {
    var ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, function (r) {
      var url = r.request().url(), m = /firebasejs\/10[^/]*\/(firebase-[a-z]+\.js)/.exec(url);
      if (m) return r.fulfill({ status: 200, contentType: 'text/javascript', body: SHIM[m[1]] || '' });
      if (/gstatic\.com\/firebasejs/.test(url)) return r.fulfill({ status: 200, contentType: 'text/javascript', body: '' });
      return r.fulfill({ status: 200, contentType: 'text/css', body: '' });
    });
    await ctx.addInitScript(DOUBLE);
    /* The signed-in person survives a navigation in this tab. Their token
       says "verified" only once it is minted (getIdToken(true)) after the
       link is clicked — localStorage 'dbl-clicked' stands for the click. */
    await ctx.addInitScript(function (cfg) {
      var saved = null; try { saved = JSON.parse(sessionStorage.getItem('dbl-user') || 'null'); } catch (e) {}
      var d = window.FirebaseDouble.install(window, { user: saved || cfg.user, docs: cfg.docs, latency: 8 });
      function patch(u) {
        if (!u) return u;
        var minted = sessionStorage.getItem('dbl-minted') === '1';
        if (minted) u.emailVerified = true;
        u.reload = function () { if (localStorage.getItem('dbl-clicked') === '1') u.emailVerified = true; return Promise.resolve(); };
        u.getIdToken = function (force) {
          if (force && u.emailVerified) { minted = true; sessionStorage.setItem('dbl-minted', '1'); }
          return Promise.resolve('tok|' + u.email + '|' + (minted || (u.emailVerified && !u.__unverifiedAtStart) ? 1 : 0) + '|' + u.uid);
        };
        return u;
      }
      if (d.auth.currentUser) { d.auth.currentUser.__unverifiedAtStart = d.auth.currentUser.emailVerified !== true; patch(d.auth.currentUser); }
      var become = d.auth._become;
      d.auth._become = function (u) { try { sessionStorage.setItem('dbl-user', JSON.stringify(u)); } catch (e) {} return become(u).then(function (r) { d.auth.currentUser.__unverifiedAtStart = d.auth.currentUser.emailVerified !== true; patch(d.auth.currentUser); return r; }); };
    }, { docs: docs, user: user || null });
    return ctx;
  }
  function track(p) {
    var nav = [], errs = [];
    p.on('framenavigated', function (f) { if (f === p.mainFrame()) nav.push(f.url().replace(base, '')); });
    p.on('pageerror', function (e) { errs.push(e.message); });
    return { nav: nav, errs: errs };
  }
  function visible(p, id) { return p.evaluate(function (i) { var e = document.getElementById(i); return !!e && !e.classList.contains('hide') && getComputedStyle(e).display !== 'none'; }, id); }

  /* 1. a new company: Create account → straight into the signup → billing → build, priced, before the link; Subscribe waits for the click */
  seedServer(); posts = [];
  var ctx = await ctxFor({}), p = await ctx.newPage(), t = track(p);
  await p.goto(base + '/login.html', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#createBtn'); await wait(300);
  await p.click('#createBtn');
  await p.fill('#suEmail', 'kim@newco.example'); await p.fill('#suCompany', 'NewCo Energy'); await p.selectOption('#suVertical', 'epc'); await p.fill('#suPass', 'longenough1'); await p.fill('#suNote', 'Two BESS sites');
  await p.click('#suSubmit');
  await p.waitForURL(/start\.html/, { timeout: 6000 }).catch(function () {});
  ok('new account lands on /start.html', /\/start\.html$/.test(new URL(p.url()).pathname), t.nav);
  ok('never visited /workspace on the way', !t.nav.some(function (u) { return /\/workspace/.test(u); }), t.nav);
  await p.waitForFunction(function () { var e = document.getElementById('step-discovery'); return e && !e.classList.contains('hide'); }, null, { timeout: 8000 }).catch(function () {});
  var st = await p.evaluate(function () { return { form: !document.getElementById('step-form').classList.contains('hide'), discovery: !document.getElementById('step-discovery').classList.contains('hide'), questions: document.querySelectorAll('#signup-questions .sq').length, name: document.getElementById('f-name').value, vertical: document.getElementById('f-vertical').value, note: document.getElementById('f-note').value, banner: getComputedStyle(document.getElementById('verify-note')).display, bannerEmail: document.getElementById('verify-email').textContent, reqWorkspace: /Request my workspace/.test(document.body.innerText) }; });
  ok('it opens on the signup itself (How you work today), not a company form that asks again', st.discovery && !st.form && st.questions === 12, st);
  ok('the company, what they do and the note carried over from Create account', st.name === 'NewCo Energy' && st.vertical === 'epc' && st.note === 'Two BESS sites', st);
  ok('a banner says the link is needed to subscribe, and nothing says "Request my workspace"', st.banner === 'block' && st.bannerEmail === 'kim@newco.example' && !st.reqWorkspace, st);
  await p.click('#discovery-continue');
  await p.waitForSelector('#step-billing:not(.hide)', { timeout: 6000 }).catch(function () {});
  ok('billing profile opens before the email is verified', await visible(p, 'step-billing'));
  for (var pair of [['contactName', 'Kim Lee'], ['phone', '555-0100'], ['teamSize', '3'], ['address.line1', '1 Main'], ['address.city', 'Chicago'], ['address.state', 'IL'], ['address.postalCode', '60601']]) await p.locator('[data-profile-field="' + pair[0] + '"]').fill(pair[1]);
  ok('the billing profile starts from the company', (await p.locator('[data-profile-field="legalName"]').inputValue()) === 'NewCo Energy');
  await p.click('#billing-continue');
  await p.waitForSelector('#step-build:not(.hide)', { timeout: 6000 }).catch(function () {});
  await p.waitForFunction(function () { return /^\$[\d,]+\/month$/.test(document.getElementById('signup-package-price').textContent); }, null, { timeout: 8000 }).catch(function () {});
  var build = await p.evaluate(function () { return { cards: document.querySelectorAll('#signup-package-menu [data-module-card]').length, price: document.getElementById('signup-package-price').textContent, pay: document.getElementById('billing-pay').textContent.trim() }; });
  ok('Build your system: the menu, priced by the server, before the email is verified', build.cards > 0 && /^\$[\d,]+\/month$/.test(build.price) && build.pay === 'Subscribe', build);
  await p.click('#billing-pay'); await wait(800);
  var held = await p.evaluate(function () { return { err: document.getElementById('build-err').textContent, build: !document.getElementById('step-build').classList.contains('hide') }; });
  ok('Subscribe waits for the link: says so and creates nothing', held.build && /Confirm your email to subscribe/.test(held.err) && !posts.some(function (x) { return /tenant-signup/.test(x); }) && !sdb.data.get('omega_orgs/newco.example'), { held: held, posts: posts });
  /* the person clicks the link in their email */
  await p.evaluate(function () { localStorage.setItem('dbl-clicked', '1'); });
  await p.waitForSelector('#step-pay:not(.hide)', { timeout: 9000 }).catch(function () {});
  var org = sdb.data.get('omega_orgs/newco.example'), bill = sdb.data.get('omega_orgs/newco.example/billing/current');
  ok('the click carries the page on by itself: the workspace is made on a verified token and the first invoice is issued', await visible(p, 'step-pay') && org && org.status === 'active' && bill && bill.packagingState === 'awaiting_payment' && invoices === 1 && posts.filter(function (x) { return /tenant-signup pay-now/.test(x); }).every(function (x) { return /verified$/.test(x) && !/unverified/.test(x); }), { posts: posts, org: org && org.status, state: bill && bill.packagingState, invoices: invoices });
  ok('the banner is gone and the company draft forgotten', await p.evaluate(function () { return getComputedStyle(document.getElementById('verify-note')).display === 'none' && localStorage.getItem('omega:signup-draft') === null; }));
  ok('no page errors', !t.errs.length, t.errs);
  await ctx.close();

  /* 2. a colleague of an existing company still goes in */
  ctx = await ctxFor({ 'omega_orgs/acme.example': { name: 'Acme', status: 'active' } }); p = await ctx.newPage(); t = track(p);
  await p.goto(base + '/login.html', { waitUntil: 'domcontentloaded' }); await p.waitForSelector('#createBtn'); await wait(300);
  await p.click('#createBtn'); await p.fill('#suEmail', 'lee@acme.example'); await p.fill('#suCompany', 'Acme'); await p.fill('#suPass', 'longenough1'); await p.click('#suSubmit');
  await p.waitForURL(/workspace/, { timeout: 6000 }).catch(function () {});
  ok('colleague of an existing workspace goes to it', /\/workspace/.test(p.url()), t.nav);
  await ctx.close();

  /* 3. returning: signed in, no workspace record → signup; also after accepting terms on an empty derived workspace */
  ctx = await ctxFor({}, { email: 'kim@newco2.example', emailVerified: true }); p = await ctx.newPage(); t = track(p);
  await p.goto(base + '/login.html', { waitUntil: 'domcontentloaded' });
  await p.waitForURL(/start\.html/, { timeout: 6000 }).catch(function () {});
  ok('signed-in person with no workspace is sent to /start.html', /start\.html/.test(p.url()), t.nav);
  await ctx.close();
  ctx = await ctxFor({ 'termsAcceptances/uid-testtestcom': { version: 'x' } }, { email: 'test@test.com', uid: 'uid-testtestcom' }); p = await ctx.newPage(); t = track(p);
  await p.goto(base + '/login.html', { waitUntil: 'domcontentloaded' });
  await p.waitForURL(/start\.html/, { timeout: 6000 }).catch(function () {});
  ok('an account that accepted terms on an empty derived workspace (no projects) goes to signup', /start\.html/.test(p.url()), t.nav);
  await ctx.close();

  /* 4. legacy: no omega_orgs record, terms accepted and projects under the company → the workspace as before */
  ctx = await ctxFor({ 'termsAcceptances/uid-leelegacyexample': { version: 'x' }, 'projects/p1': { orgId: 'legacy.example', name: 'Site A' } }, { email: 'lee@legacy.example', uid: 'uid-leelegacyexample' }); p = await ctx.newPage(); t = track(p);
  await p.goto(base + '/login.html', { waitUntil: 'domcontentloaded' });
  await p.waitForURL(/workspace/, { timeout: 6000 }).catch(function () {});
  ok('legacy user without a record, with projects, keeps the workspace', /\/workspace/.test(p.url()), t.nav);
  await ctx.close();

  /* 5. packaged signup off: the old request path is unchanged */
  PACKAGED = false;
  ctx = await ctxFor({}); p = await ctx.newPage(); t = track(p);
  await p.goto(base + '/login.html', { waitUntil: 'domcontentloaded' }); await p.waitForSelector('#createBtn'); await wait(300);
  await p.click('#createBtn'); await p.fill('#suEmail', 'max@other.example'); await p.fill('#suCompany', 'Other'); await p.fill('#suPass', 'longenough1'); await p.click('#suSubmit');
  await wait(2500);
  var r5 = await p.evaluate(function () { return { title: document.getElementById('blockedTitle').textContent, path: location.pathname, w: window.__firebaseDouble.store.log.map(function (x) { return x.op + ' ' + x.path; }) }; });
  ok('signup off: "Request received" on the login page, access request filed', r5.title === 'Request received' && r5.path === '/login.html' && r5.w.some(function (x) { return /access_requests\//.test(x); }), r5);
  await ctx.close();

  await browser.close(); srv.close();
  console.log(fails ? '\nrender-signup: ' + fails + ' FAILED' : '\nrender-signup: every check passed. No network calls.');
  process.exit(fails ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });
