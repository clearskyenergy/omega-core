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
   2026-09-28 (Tommy: "when we click create new account it should go to the
   page that is the start and helps them purchase and buy an account and
   pay for it and create their account"): the login page's own account form
   is gone; Create an account IS the signup page, whose first step makes
   the account. It holds that:
     1. Create an account on the login page lands on the signup page with
        the typed address carried over (in this browser, never a link);
        its first step makes the account (a personal address is refused
        before one is made) and walks straight into the GUIDED signup: what
        your team does (one screen of tiles, the server's recommendation in
        the dock as they tap), your system (priced, the fee named), confirm
        your email (only there; nothing is created before it; a reload
        resumes at it; the click moves it on by itself), billing (the short
        form, the company asked once, there), Subscribe → the first
        invoice; and Skip, on a phone, with a confirmed address that never
        sees the email step, to the trial;
     2. a colleague of an existing workspace still goes in, from the same
        form; an address that already has an account signs in from it;
     3. a signed-in person with no workspace yet goes to signup, including
        one who accepted terms on an empty derived workspace (no projects);
     4. a legacy person without a record who has projects keeps the
        workspace;
     5. with packaged signup off, the same door is the reviewed request
        (a pending workspace), never a form on the login page.

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
var SHOTS = (function () { var i = process.argv.indexOf('--shots'); return i >= 0 ? (process.argv[i + 1] || null) : null; })();
if (SHOTS && !fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });
async function shot(p, name) { if (!SHOTS) return; await new Promise(function (r) { setTimeout(r, 700); }); await p.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: true }); }
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
        u.reload = function () { window.__reloads = (window.__reloads || 0) + 1; if (localStorage.getItem('dbl-clicked') === '1') u.emailVerified = true; return Promise.resolve(); };
        /* what a verification link was sent with: its continue address (Firebase's Continue button) */
        u.sendEmailVerification = function (o) { (window.__verifySends = window.__verifySends || []).push(o && o.url ? o.url : null); return Promise.resolve(); };
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

  /* 1. a new company: Create an account → the signup page, whose first step makes the account → the guided signup:
        what your team does (taps, a live suggestion from the server), your system (priced), confirm your email (only
        here, moving on by itself, and resumed after a reload), billing (the short form), Subscribe → the first invoice */
  seedServer(); posts = [];
  var ctx = await ctxFor({}), p = await ctx.newPage(), t = track(p);
  await p.goto(base + '/login.html', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#createBtn'); await wait(300);
  await p.fill('#email', 'kim@newco.example');
  await p.click('#createBtn');
  await p.waitForURL(/start\.html/, { timeout: 6000 }).catch(function () {});
  ok('Create an account lands on /start.html at once, no form on the login page', /\/start\.html$/.test(new URL(p.url()).pathname) && t.nav.length === 2, t.nav);
  await p.waitForSelector('#step-auth:not(.hide)', { timeout: 6000 }).catch(function () {});
  await p.waitForFunction(function () { return /first invoice by card/.test(document.getElementById('auth-next').textContent); }, null, { timeout: 6000 }).catch(function () {});
  var au = await p.evaluate(function () { return { title: document.querySelector('#step-auth h1').textContent, email: document.getElementById('em').value, btn: document.getElementById('create-btn').textContent.trim(), next: document.getElementById('auth-next').textContent, signin: !!document.querySelector('#auth-hint a[href="/login.html"]'), prices: !!document.querySelector('#auth-hint a[href="/offerings.html"]'), google: /Continue with Google/.test(document.getElementById('google-btn').textContent), created: window.__firebaseDouble.auth.log.filter(function (x) { return x.op === 'create'; }).length, url: location.href }; });
  ok('its first step is Create your account: the typed address carried over, a password, Create account, Google, a way to sign in and the price list; nothing made yet', /^Create your account$/.test(au.title) && au.email === 'kim@newco.example' && au.btn === 'Create account' && au.signin && au.prices && au.google && au.created === 0, au);
  ok('it says what comes next, as the price list says: the guided run and the first invoice by card', /what your team does/.test(au.next) && /first invoice by card/.test(au.next) && !/\?/.test(au.url), au);
  await shot(p, 'signup-0-account');
  /* a personal address is refused before an account is made for it; a short password too */
  await p.fill('#em', 'kim@gmail.com'); await p.fill('#pw', 'longenough1'); await p.click('#create-btn'); await wait(200);
  var refused = await p.evaluate(function () { return { err: document.getElementById('auth-err').textContent, created: window.__firebaseDouble.auth.log.filter(function (x) { return x.op === 'create'; }).length }; });
  ok('a personal address is refused before any account is made', /work email/.test(refused.err) && refused.created === 0, refused);
  await p.fill('#em', 'kim@newco.example'); await p.fill('#pw', 'short'); await p.click('#create-btn'); await wait(200);
  ok('a short password is refused', /8 characters/.test(await p.$eval('#auth-err', function (e) { return e.textContent; })));
  await p.fill('#pw', 'longenough1'); await p.click('#create-btn');
  await p.waitForFunction(function () { var e = document.getElementById('step-discovery'); return e && !e.classList.contains('hide'); }, null, { timeout: 8000 }).catch(function () {});
  var st = await p.evaluate(function () { return { form: !document.getElementById('step-form').classList.contains('hide'), auth: !document.getElementById('step-auth').classList.contains('hide'), discovery: !document.getElementById('step-discovery').classList.contains('hide'), tiles: document.querySelectorAll('#signup-questions .sq-tile').length, radios: document.querySelectorAll('#step-discovery input[type=radio]').length, who: document.getElementById('discovery-who').textContent, step: (document.querySelector('#signup-steps li.on') || {}).getAttribute && document.querySelector('#signup-steps li.on').getAttribute('data-step'), steps: !document.getElementById('signup-steps').classList.contains('hide'), skip: !!document.getElementById('discovery-skip'), reqWorkspace: /Request my workspace/.test(document.body.innerText), created: window.__firebaseDouble.auth.log.filter(function (x) { return x.op === 'create'; }).map(function (x) { return x.email; }), sends: window.__verifySends || [] }; });
  ok('Create account makes the account and sends the link whose Continue button opens this page again', st.created.join() === 'kim@newco.example' && st.sends.length === 1 && /\/start\.html$/.test(st.sends[0] || ''), st);
  ok('never visited /workspace on the way', !t.nav.some(function (u) { return /\/workspace/.test(u); }), t.nav);
  ok('then it opens on one question, a tile per answer (no radio rows), on step 1 of the stepper, with a way to skip, signed in as the new account, and nothing says "Request my workspace"', st.discovery && !st.form && !st.auth && st.tiles === 12 && st.radios === 0 && st.steps && st.step === 'work' && st.skip && st.who === 'kim@newco.example' && !st.reqWorkspace, st);
  await shot(p, 'signup-1-work');
  /* two taps and a chip: the dock shows the server's own recommendation as they tap */
  await p.click('.sq-tile[data-q="sites"]'); await p.click('.sq-tile[data-q="storage"]');
  ok('a tile with more to say opens its chips', await p.evaluate(function () { return !document.querySelector('.sq-more[data-for="sites"]').classList.contains('hide') && document.querySelector('.sq-more[data-for="sell"]').classList.contains('hide'); }));
  await p.click('.chip[data-flag="sitesMany"]');
  await p.waitForFunction(function () { return /\$[\d,]+\/month/.test(document.getElementById('signup-live').textContent) && / \+ /.test(document.getElementById('signup-live').textContent); }, null, { timeout: 6000 }).catch(function () {});
  var live = await p.$eval('#signup-live', function (e) { return e.textContent; });
  ok('the dock under the tiles is the server\'s recommendation, priced, as they tap', /Grid Atlas|Omega Grid|Intel/.test(live) && /\$[\d,]+\/month/.test(live), live);
  await shot(p, 'signup-1-work-picked');
  ok('nothing is created or requested while choosing', !posts.some(function (x) { return /tenant-signup/.test(x); }), posts);
  await p.click('#discovery-continue');
  await p.waitForSelector('#step-build:not(.hide)', { timeout: 6000 }).catch(function () {});
  await p.waitForFunction(function () { return /^\$[\d,]+\/month$/.test(document.getElementById('signup-package-price').textContent); }, null, { timeout: 8000 }).catch(function () {});
  var build = await p.evaluate(function () { return { cards: document.querySelectorAll('#signup-package-menu [data-module-card]').length, checked: Array.prototype.map.call(document.querySelectorAll('#signup-package-menu [data-module-card] input:checked'), function (i) { return i.closest('[data-module-card]').getAttribute('data-module-card'); }), price: document.getElementById('signup-package-price').textContent, next: document.getElementById('build-next').textContent, cont: document.getElementById('build-continue').textContent.trim(), step: document.querySelector('#signup-steps li.on').getAttribute('data-step'), work: document.querySelector('#signup-steps li[data-step="work"]').className }; });
  ok('Your system: the menu, priced by the server, starting from what they tapped (Lite, Grid Atlas, Site Intel, Storage)', build.cards > 0 && ['lite', 'gridatlas', 'siteintel', 'storage'].every(function (k) { return build.checked.indexOf(k) >= 0; }) && /^\$[\d,]+\/month$/.test(build.price) && build.step === 'system' && build.work === 'done', build);
  ok('the cart says what is next: the email, then billing', build.cont === 'Continue' && /confirm your email, then billing/.test(build.next), build);
  await shot(p, 'signup-2-system');
  await p.click('#build-continue'); await wait(400);
  var ver = await p.evaluate(function () { return { verify: !document.getElementById('step-verify').classList.contains('hide'), email: document.getElementById('verify-email').textContent, step: document.querySelector('#signup-steps li.on').getAttribute('data-step'), billing: !document.getElementById('step-billing').classList.contains('hide') }; });
  ok('an unconfirmed address meets one step for it, between the system and billing, and nothing is created', ver.verify && !ver.billing && ver.email === 'kim@newco.example' && ver.step === 'verify' && !posts.some(function (x) { return /tenant-signup/.test(x); }) && !sdb.data.get('omega_orgs/newco.example'), { ver: ver, posts: posts });
  await shot(p, 'signup-3-verify');
  /* the email link opens this page again: a reload in the tab lands on the same step, not the start */
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#step-verify:not(.hide)', { timeout: 8000 }).catch(function () {});
  ok('a reload (the link opens the page again) resumes at the email step with the system kept', await p.evaluate(function () { return !document.getElementById('step-verify').classList.contains('hide') && document.querySelector('#signup-steps li.on').getAttribute('data-step') === 'verify'; }));
  /* Send it again: a new link whose Continue button brings them back to the signup */
  await p.click('#verify-resend'); await wait(250);
  var resent = await p.evaluate(function () { return { status: document.getElementById('verify-status-text').textContent, sends: window.__verifySends || [] }; });
  ok('Send it again sends a new link that brings them back to the signup', /^Sent again to kim@newco\.example/.test(resent.status) && resent.sends.length === 1 && /^http:\/\/127\.0\.0\.1:\d+\/start\.html$/.test(resent.sends[0] || ''), resent);
  /* "I've clicked it" before the click: said plainly, nothing made */
  await p.click('#verify-check'); await wait(300);
  var early = await p.evaluate(function () { return document.getElementById('verify-status-text').textContent; });
  ok('"I\'ve clicked it" before the click says it is not confirmed yet and makes nothing', /^Not yet/.test(early) && !posts.some(function (x) { return /tenant-signup/.test(x); }), { status: early, posts: posts });
  /* away in the mail app: the tab is hidden and asks nobody; the click happens there */
  await p.evaluate(function () { window.__hidden = true; Object.defineProperty(document, 'hidden', { configurable: true, get: function () { return window.__hidden === true; } }); window.__reloads = 0; });
  await p.evaluate(function () { localStorage.setItem('dbl-clicked', '1'); });
  await wait(5600);
  var away = await p.evaluate(function () { return { reloads: window.__reloads, verify: !document.getElementById('step-verify').classList.contains('hide') }; });
  ok('while the tab is hidden it asks Firebase nothing and makes nothing', away.reloads === 0 && away.verify && !posts.some(function (x) { return /tenant-signup/.test(x); }), { away: away, posts: posts });
  /* back on the tab: it looks at once (not at the next tick) and the page moves on by itself */
  var back = await p.evaluate(function () { window.__hidden = false; document.dispatchEvent(new Event('visibilitychange')); return window.__reloads; });
  ok('coming back to the tab asks Firebase at once', back === 1, back);
  await p.waitForSelector('#step-billing:not(.hide)', { timeout: 9000 }).catch(function () {});
  var bl = await p.evaluate(function () { return { billing: !document.getElementById('step-billing').classList.contains('hide'), verifyDone: document.querySelector('#signup-steps li[data-step="verify"]').className, legal: document.querySelector('[data-profile-field="legalName"]').value, email: document.querySelector('[data-profile-field="email"]').value, more: document.querySelector('#signup-billing-profile details.obp-more').open, shown: Array.prototype.filter.call(document.querySelectorAll('#signup-billing-profile [data-profile-field]'), function (e) { return !e.closest('details:not([open])'); }).length, lines: document.querySelectorAll('#summary-lines li').length, price: document.getElementById('summary-price').textContent, pay: document.getElementById('billing-pay').textContent.trim() }; });
  ok('the click carries the page on by itself to billing, the email step ticked', bl.billing && bl.verifyDone === 'done', bl);
  ok('billing is the short form: the billing email filled in, the company asked once (here, never on the login page), the optional fields folded away', bl.legal === '' && bl.email === 'kim@newco.example' && bl.more === false && bl.shown === 9, bl);
  ok('the summary carries the system and its price, and Subscribe is the one button', bl.lines === 4 && /^\$[\d,]+\/month$/.test(bl.price) && bl.pay === 'Subscribe', bl);
  ok('no surprise at the pay step: the first-year service fee the first invoice carries is named before Subscribe, as the server priced it', /first-year service fee of \$[\d,]+/.test(await p.$eval('#summary-fee', function (e) { return e.textContent; })) && /first-year service fee of \$[\d,]+/.test(await p.$eval('#signup-fee', function (e) { return e.textContent; })));
  for (var pair of [['legalName', 'NewCo Energy'], ['contactName', 'Kim Lee'], ['phone', '555-0100'], ['teamSize', '3'], ['address.line1', '1 Main'], ['address.city', 'Chicago'], ['address.state', 'IL'], ['address.postalCode', '60601']]) await p.locator('[data-profile-field="' + pair[0] + '"]').fill(pair[1]);
  await shot(p, 'signup-4-billing');
  await p.click('#billing-pay');
  await p.waitForSelector('#step-pay:not(.hide)', { timeout: 9000 }).catch(function () {});
  var org = sdb.data.get('omega_orgs/newco.example'), bill = sdb.data.get('omega_orgs/newco.example/billing/current');
  ok('Subscribe makes the workspace, named after the billing form\'s company, on a verified token and issues the first invoice for what they chose', await visible(p, 'step-pay') && org && org.status === 'active' && org.name === 'NewCo Energy' && bill && bill.packagingState === 'awaiting_payment' && invoices === 1 && bill.proposedPackage && ['gridatlas', 'siteintel', 'storage'].every(function (k) { return bill.proposedPackage.modules.indexOf(k) >= 0; }) && posts.filter(function (x) { return /tenant-signup pay-now/.test(x); }).every(function (x) { return /verified$/.test(x) && !/unverified/.test(x); }), { posts: posts, org: org && org.status, state: bill && bill.packagingState, invoices: invoices, modules: bill && bill.proposedPackage && bill.proposedPackage.modules });
  ok('the answers travel with the signup for the rep (tapped = this quarter)', bill && bill.signupDiscovery && bill.signupDiscovery.discovery.answers.sites === 'quarter' && bill.signupDiscovery.discovery.answers.storage === 'quarter' && bill.signupDiscovery.discovery.answers.ev === 'no' && bill.signupDiscovery.discovery.flags.sitesMany === true, bill && bill.signupDiscovery);
  ok('the company draft is forgotten', await p.evaluate(function () { return localStorage.getItem('omega:signup-draft') === null; }));
  await shot(p, 'signup-5-pay');
  ok('no page errors', !t.errs.length, t.errs);
  await ctx.close();

  /* 1b. skip: straight to the menu with Omega Design alone, no suggestion, no answers sent; on a phone */
  seedServer(); posts = [];
  ctx = await ctxFor({}, { email: 'ava@skipco.example', emailVerified: true }); p = await ctx.newPage(); t = track(p);
  await p.setViewportSize({ width: 390, height: 844 });
  await p.addInitScript(function () { try { localStorage.setItem('omega:signup-draft', JSON.stringify({ company: 'SkipCo', vertical: 'developer', email: 'ava@skipco.example', at: Date.now() })); } catch (e) {} });
  await p.goto(base + '/start.html', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#step-discovery:not(.hide)', { timeout: 8000 }).catch(function () {});
  var phone = await p.evaluate(function () { return { overflow: document.documentElement.scrollWidth > window.innerWidth + 1, verifyStep: document.querySelector('#signup-steps li[data-step="verify"]').className, dock: getComputedStyle(document.querySelector('.dock')).position }; });
  ok('on a phone: no sideways scroll, the dock sticks, and a confirmed address shows its step already ticked', !phone.overflow && phone.dock === 'sticky' && phone.verifyStep === 'done', phone);
  await shot(p, 'signup-phone-work');
  await p.click('#discovery-skip');
  await p.waitForSelector('#step-build:not(.hide)', { timeout: 6000 }).catch(function () {});
  var sk = await p.evaluate(function () { return { checked: Array.prototype.map.call(document.querySelectorAll('#signup-package-menu [data-module-card] input:checked'), function (i) { return i.closest('[data-module-card]').getAttribute('data-module-card'); }), suggest: !document.getElementById('signup-suggest').classList.contains('hide'), next: document.getElementById('build-next').textContent, overflow: document.documentElement.scrollWidth > window.innerWidth + 1 }; });
  ok('Skip goes straight to the menu with Omega Design alone and no suggestion; a confirmed address goes straight to billing next', sk.checked.join() === 'lite' && !sk.suggest && /^Next: billing and payment/.test(sk.next) && !sk.overflow, sk);
  await shot(p, 'signup-phone-system');
  await p.click('#build-continue');
  await p.waitForSelector('#step-billing:not(.hide)', { timeout: 6000 }).catch(function () {});
  ok('a confirmed address never sees the email step', await visible(p, 'step-billing') && !(await visible(p, 'step-verify')));
  for (var pair2 of [['contactName', 'Ava Lin'], ['phone', '555-0101'], ['teamSize', '2'], ['address.line1', '2 Main'], ['address.city', 'Chicago'], ['address.state', 'IL'], ['address.postalCode', '60602']]) await p.locator('[data-profile-field="' + pair2[0] + '"]').fill(pair2[1]);
  ok('the billing step fits a phone', await p.evaluate(function () { return document.documentElement.scrollWidth <= window.innerWidth + 1; }));
  await shot(p, 'signup-phone-billing');
  await p.click('#billing-submit');
  await p.waitForSelector('#step-done:not(.hide)', { timeout: 8000 }).catch(function () {});
  var skb = sdb.data.get('omega_orgs/skipco.example/billing/current');
  ok('the trial instead: a pending workspace for Omega Design, and no discovery sent for a skip', await visible(p, 'step-done') && skb && skb.proposedPackage.modules.join() === 'lite' && skb.signupDiscovery === null && sdb.data.get('omega_orgs/skipco.example').status === 'pending', skb && { mods: skb.proposedPackage.modules, disc: skb.signupDiscovery });
  ok('no page errors (skip, phone)', !t.errs.length, t.errs);
  await ctx.close();

  /* 2. a colleague of an existing company still goes in, from the same form (the hub routing on the signup page) */
  posts = []; ctx = await ctxFor({ 'omega_orgs/acme.example': { name: 'Acme', status: 'active' } }); p = await ctx.newPage(); t = track(p);
  await p.goto(base + '/login.html', { waitUntil: 'domcontentloaded' }); await p.waitForSelector('#createBtn'); await wait(300);
  await p.click('#createBtn'); await p.waitForURL(/start\.html/, { timeout: 6000 }).catch(function () {}); await p.waitForSelector('#create-btn', { timeout: 6000 }).catch(function () {});
  await p.fill('#em', 'lee@acme.example'); await p.fill('#pw', 'longenough1'); await p.click('#create-btn');
  await p.waitForURL(function (u) { return !/start\.html/.test(u.pathname); }, { timeout: 6000 }).catch(function () {});
  ok('colleague of an existing workspace goes in, never into the signup', !/start\.html/.test(p.url()) && !posts.some(function (x) { return /tenant-signup/.test(x); }), t.nav);
  await ctx.close();
  /* 2b. an address that already has an account signs in from the same button (the verification link opens this page in any browser) */
  ctx = await ctxFor({}); p = await ctx.newPage(); t = track(p);
  await p.addInitScript(function () { window.__accounts = { 'kim@newco.example': { email: 'kim@newco.example', password: 'longenough1', emailVerified: true, providerId: 'password' } }; });
  await p.goto(base + '/start.html', { waitUntil: 'domcontentloaded' }); await p.waitForSelector('#create-btn', { timeout: 6000 }).catch(function () {});
  await p.evaluate(function () { var a = window.__firebaseDouble.auth, accounts = window.__accounts; var create = a.createUserWithEmailAndPassword, sign = a.signInWithEmailAndPassword; a.createUserWithEmailAndPassword = function (e, p) { if (accounts[e]) return Promise.reject({ code: 'auth/email-already-in-use', message: 'in use' }); return create.call(a, e, p); }; a.signInWithEmailAndPassword = function (e, p) { var acct = accounts[e]; if (!acct) return sign.call(a, e, p); if (acct.password !== p) return Promise.reject({ code: 'auth/wrong-password', message: 'wrong' }); return a._become(acct); }; });
  await p.fill('#em', 'kim@newco.example'); await p.fill('#pw', 'wrongpassword'); await p.click('#create-btn'); await wait(300);
  ok('an existing account with the wrong password is told so, and nothing is made', /already has an OMEGA account/.test(await p.$eval('#auth-err', function (e) { return e.textContent; })) && !(await p.evaluate(function () { return !!window.__firebaseDouble.auth.currentUser; })));
  await p.fill('#pw', 'longenough1'); await p.click('#create-btn');
  await p.waitForSelector('#step-discovery:not(.hide)', { timeout: 8000 }).catch(function () {});
  ok('with its password it signs in from the same button and walks into the signup', await visible(p, 'step-discovery') && !(await visible(p, 'step-auth')));
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

  /* 5. packaged signup off: Create an account is the same door, and it is the reviewed request (a pending workspace) */
  PACKAGED = false; process.env.PACKAGING_SIGNUP_ENABLED = 'false'; seedServer(); posts = [];
  ctx = await ctxFor({}); p = await ctx.newPage(); t = track(p);
  await p.goto(base + '/login.html', { waitUntil: 'domcontentloaded' }); await p.waitForSelector('#createBtn'); await wait(300);
  await p.click('#createBtn'); await p.waitForURL(/start\.html/, { timeout: 6000 }).catch(function () {}); await p.waitForSelector('#create-btn', { timeout: 6000 }).catch(function () {});
  await p.waitForFunction(function () { return /reviews each new workspace/.test(document.getElementById('auth-next').textContent); }, null, { timeout: 6000 }).catch(function () {});
  ok('signup off: the account step says the workspace is reviewed, not paid', /reviews each new workspace/.test(await p.$eval('#auth-next', function (e) { return e.textContent; })));
  await p.fill('#em', 'max@other.example'); await p.fill('#pw', 'longenough1'); await p.click('#create-btn');
  await p.waitForSelector('#step-form:not(.hide)', { timeout: 8000 }).catch(function () {});
  await p.waitForFunction(function () { return /Request my workspace/.test(document.getElementById('f-submit').textContent); }, null, { timeout: 6000 }).catch(function () {});
  ok('signup off: the company form, "Request my workspace"', await visible(p, 'step-form') && /Request my workspace/.test(await p.$eval('#f-submit', function (e) { return e.textContent; })));
  await p.fill('#f-name', 'Other'); await p.click('#f-submit');
  /* the request claims a company's domain, so it waits on the confirmed address as the server requires; the click carries it on */
  await p.waitForSelector('#step-verify:not(.hide)', { timeout: 6000 }).catch(function () {});
  ok('signup off: the request waits on the confirmed address (nothing filed for an address nobody has shown they can read)', await visible(p, 'step-verify') && !posts.some(function (x) { return /tenant-signup create/.test(x); }), posts);
  await p.evaluate(function () { localStorage.setItem('dbl-clicked', '1'); }); await p.click('#verify-check');
  await p.waitForSelector('#step-done:not(.hide)', { timeout: 8000 }).catch(function () {});
  var r5 = { done: await visible(p, 'step-done'), title: await p.$eval('#step-done h1', function (e) { return e.textContent; }), path: new URL(p.url()).pathname, org: sdb.data.get('omega_orgs/other.example'), w: await p.evaluate(function () { return window.__firebaseDouble.store.log.map(function (x) { return x.op + ' ' + x.path; }); }) };
  ok('signup off: "Request received" on the signup page, a pending workspace, and no access request on the login page', r5.done && r5.title === 'Request received' && r5.path === '/start.html' && r5.org && r5.org.status === 'pending' && !r5.w.some(function (x) { return /access_requests\//.test(x); }), { done: r5.done, title: r5.title, path: r5.path, status: r5.org && r5.org.status, w: r5.w });
  await ctx.close();

  await browser.close(); srv.close();
  console.log(fails ? '\nrender-signup: ' + fails + ' FAILED' : '\nrender-signup: every check passed. No network calls.');
  process.exit(fails ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });
