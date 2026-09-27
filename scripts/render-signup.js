#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   scripts/render-signup.js — Create an account, and where it lands
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Boots the REAL login.html and start.html in Chromium. login.html imports
   the MODULAR Firebase SDK; each module is answered by a thin shim over
   scripts/_lib/firebase-double.js, and start.html's compat SDK is the double
   itself. The signed-in person survives a navigation in the tab, as a
   Firebase session does. Nothing leaves the machine.

   2026-09-27: Create account on the login page opened a brand-new company
   onto /workspace (a workspace derived from the email domain) instead of
   the signup it had started: making the account signs it in, and the
   page's "already signed in" listener routed it before the signup handler
   could. It holds that:
     1. a new company's account lands on /start.html, company carried over,
        held for verification, and moves on BY ITSELF once the link is
        clicked (a fresh token; the one minted before the click says no);
     2. a colleague of an existing workspace still goes in;
     3. a signed-in person with no workspace yet goes to /start.html;
     4. a legacy person with no omega_orgs record who has used the product
        (accepted terms) keeps the workspace;
     5. with packaged signup off, the older access request is unchanged.

     node scripts/render-signup.js
     npm run check:pages
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var http = require('http'), fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..');
var PW = process.env.PLAYWRIGHT || (function () { try { return require.resolve('playwright'); } catch (e) { return '/opt/node22/lib/node_modules/playwright'; } })();
var chromium; try { chromium = require(PW).chromium; } catch (e) { console.log('render-signup: Playwright not found (' + PW + '); skipped'); process.exit(0); }
var SANDBOX_CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
var CHROME = process.env.CHROME || (fs.existsSync(SANDBOX_CHROME) ? SANDBOX_CHROME : chromium.executablePath());
if (!fs.existsSync(CHROME)) { console.log('render-signup: Chromium not found (' + CHROME + '); skipped'); process.exit(0); }
var DOUBLE = fs.readFileSync(path.join(ROOT, 'scripts/_lib/firebase-double.js'), 'utf8');
var TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
var PACKAGED = true, calls = [];
var srv = http.createServer(function (req, res) {
  var u = req.url.split('?')[0];
  function json(o, s) { res.writeHead(s || 200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); }
  if (u.indexOf('/api/') === 0) {
    calls.push(req.method + ' ' + u + ' ' + (req.headers.authorization || ''));
    /* the shape api/offerings.js answers; only signup is read here */
    if (u === '/api/offerings') return json({ signup: { packaged: PACKAGED, payNow: PACKAGED, start: '/start.html' } });
    if (u === '/api/tenant-signup') {
      if (!/verified/.test(req.headers.authorization || '')) return json({ error: 'verify your email address first, then try again' }, 403);
      return json({ packaging: true, payNow: true, payWith: 'Stripe', modules: [], questions: [], spend: [] });
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
    'export function getDoc(r){ return r.get().then(s => ({ id: s.id, exists: () => s.exists, data: () => s.data() })); }',
    'export function getDocs(q){ return q.get(); }',
    'export function setDoc(r, d, o){ return r.set(d, o); }',
    'export function serverTimestamp(){ return window.firebase.firestore.FieldValue.serverTimestamp(); }'
  ].join('\n')
};
var fails = 0; function ok(n, c, d) { console.log((c ? 'ok   ' : 'FAIL ') + n + (c ? '' : ' ' + JSON.stringify(d))); if (!c) fails++; }
function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
(async function () {
  await new Promise(function (r) { srv.listen(0, '127.0.0.1', r); });
  var base = 'http://127.0.0.1:' + srv.address().port;
  var browser = await chromium.launch({ executablePath: CHROME });
  async function ctxFor(docs, user) {
    var ctx = await browser.newContext();
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, function (r) {
      var url = r.request().url(), m = /firebasejs\/10[^/]*\/(firebase-[a-z]+\.js)/.exec(url);
      if (m) return r.fulfill({ status: 200, contentType: 'text/javascript', body: SHIM[m[1]] || '' });
      if (/gstatic\.com\/firebasejs/.test(url)) return r.fulfill({ status: 200, contentType: 'text/javascript', body: '' });
      return r.fulfill({ status: 200, contentType: 'text/css', body: '' });
    });
    await ctx.addInitScript(DOUBLE);
    /* the signed-in person survives a navigation in this tab */
    await ctx.addInitScript(function (cfg) {
      var saved = null; try { saved = JSON.parse(sessionStorage.getItem('dbl-user') || 'null'); } catch (e) {}
      var d = window.FirebaseDouble.install(window, { user: saved || cfg.user, docs: cfg.docs, latency: 8 });
      var become = d.auth._become; d.auth._become = function (u) { try { sessionStorage.setItem('dbl-user', JSON.stringify(u)); } catch (e) {} return become(u); };
    }, { docs: docs, user: user || null });
    return ctx;
  }

  /* 1. a new company creates an account: it goes to the signup page, not the workspace */
  var ctx = await ctxFor({}), p = await ctx.newPage(), errs = [], nav = [];
  p.on('pageerror', function (e) { errs.push(e.message); });
  p.on('framenavigated', function (f) { if (f === p.mainFrame()) nav.push(f.url().replace(base, '')); });
  await p.goto(base + '/login.html', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#createBtn'); await wait(300);
  await p.click('#createBtn');
  await p.fill('#suEmail', 'kim@newco.example'); await p.fill('#suCompany', 'NewCo Energy'); await p.fill('#suPass', 'longenough1');
  await p.click('#suSubmit');
  await p.waitForURL(/start\.html/, { timeout: 6000 }).catch(function () {});
  await wait(1500);
  ok('new account lands on /start.html', /\/start\.html$/.test(new URL(p.url()).pathname), nav);
  ok('never visited /workspace on the way', !nav.some(function (u) { return /\/workspace/.test(u); }), nav);
  var st = await p.evaluate(function () { return { form: !document.getElementById('step-form').classList.contains('hide'), verify: getComputedStyle(document.getElementById('verify-note')).display, name: document.getElementById('f-name').value, who: document.getElementById('who-email').textContent }; });
  ok('start shows the company step with the name carried over', st.form && st.name === 'NewCo Energy' && st.who === 'kim@newco.example', st);
  ok('start holds for verification', st.verify === 'block', st);
  /* the person clicks the link in the email: Firebase now says verified and a forced token carries it */
  await p.evaluate(function () { var u = window.__firebaseDouble.auth.currentUser; u.reload = function () { u.emailVerified = true; return Promise.resolve(); }; u.getIdToken = function (force) { return Promise.resolve(force || u.__fresh ? (u.__fresh = true, 'verified-token') : 'stale-token'); }; });
  await wait(6500);
  st = await p.evaluate(function () { return { verify: getComputedStyle(document.getElementById('verify-note')).display, submit: document.getElementById('f-submit').disabled, label: document.getElementById('f-submit').textContent, hint: document.getElementById('form-hint').textContent }; });
  ok('start moves on by itself once the email is verified', st.verify === 'none' && !st.submit && st.label === 'Continue', st);
  ok('no page errors', !errs.length, errs);
  await ctx.close();

  /* 2. a colleague of an existing company still goes in */
  ctx = await ctxFor({ 'omega_orgs/acme.example': { name: 'Acme', status: 'active' } }); p = await ctx.newPage(); nav = [];
  p.on('framenavigated', function (f) { if (f === p.mainFrame()) nav.push(f.url().replace(base, '')); });
  await p.goto(base + '/login.html', { waitUntil: 'domcontentloaded' }); await p.waitForSelector('#createBtn'); await wait(300);
  await p.click('#createBtn'); await p.fill('#suEmail', 'lee@acme.example'); await p.fill('#suCompany', 'Acme'); await p.fill('#suPass', 'longenough1'); await p.click('#suSubmit');
  await p.waitForURL(/workspace/, { timeout: 6000 }).catch(function () {});
  ok('colleague of an existing workspace goes to it', /\/workspace/.test(p.url()), nav);
  await ctx.close();

  /* 3. returning: signed in, no workspace record, never used the product → signup */
  ctx = await ctxFor({}, { email: 'kim@newco.example', emailVerified: true }); p = await ctx.newPage(); nav = [];
  p.on('framenavigated', function (f) { if (f === p.mainFrame()) nav.push(f.url().replace(base, '')); });
  await p.goto(base + '/login.html', { waitUntil: 'domcontentloaded' });
  await p.waitForURL(/start\.html/, { timeout: 6000 }).catch(function () {});
  ok('signed-in person with no workspace is sent to /start.html', /start\.html/.test(p.url()), nav);
  await ctx.close();

  /* 4. legacy: no omega_orgs record but has accepted terms → the workspace as before */
  ctx = await ctxFor({ 'termsAcceptances/uid-leelegacyexample': { version: 'x' } }, { email: 'lee@legacy.example', uid: 'uid-leelegacyexample' }); p = await ctx.newPage(); nav = [];
  p.on('framenavigated', function (f) { if (f === p.mainFrame()) nav.push(f.url().replace(base, '')); });
  await p.goto(base + '/login.html', { waitUntil: 'domcontentloaded' });
  await p.waitForURL(/workspace/, { timeout: 6000 }).catch(function () {});
  ok('legacy user without a record keeps the workspace', /\/workspace/.test(p.url()), nav);
  await ctx.close();

  /* 5. packaged signup off: the old request path is unchanged, and no workspace hijack */
  PACKAGED = false;
  ctx = await ctxFor({}); p = await ctx.newPage(); nav = [];
  p.on('framenavigated', function (f) { if (f === p.mainFrame()) nav.push(f.url().replace(base, '')); });
  await p.goto(base + '/login.html', { waitUntil: 'domcontentloaded' }); await p.waitForSelector('#createBtn'); await wait(300);
  await p.click('#createBtn'); await p.fill('#suEmail', 'max@other.example'); await p.fill('#suCompany', 'Other'); await p.fill('#suPass', 'longenough1'); await p.click('#suSubmit');
  await wait(2500);
  var t = await p.evaluate(function () { return { title: document.getElementById('blockedTitle').textContent, path: location.pathname, w: window.__firebaseDouble.store.log.map(function (x) { return x.op + ' ' + x.path; }) }; });
  ok('signup off: "Request received" on the login page, access request filed', t.title === 'Request received' && t.path === '/login.html' && t.w.some(function (x) { return /access_requests\//.test(x); }), t);
  await ctx.close();

  await browser.close(); srv.close();
  console.log(fails ? '\nrender-signup: ' + fails + ' FAILED' : '\nrender-signup: every check passed. No network calls.'); process.exit(fails ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });
