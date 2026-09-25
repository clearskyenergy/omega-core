#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   scripts/test-customer-signin.js — the customer app signs in through the
   ONE sign-in (omega-logic-signin.js) wearing the supplier's name, and an
   iPhone home-screen app can sign in at all (CUST-01)
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   The module runs in node:vm against a DOM stand-in just big enough to draw
   the form, press its buttons and read what it says. Checked:
     - with no brand the office's sign-in is Omega Logic's, as it was
     - with a brand: the supplier's name and mark, no "Omega Logic" and no
       Omega Logic icon anywhere on it, the page's own element ids
     - installed on an iPhone (navigator.standalone): no emailed link (it
       would open in Safari), email and password with Forgot password, the
       one line that says why, Google by same-site redirect, never a pop-up
     - in a browser: the emailed link first, with the page's own words about
       who sends it and where to look
     - "First time here? Create a password": the account, then the link that
       confirms the address
     node scripts/test-customer-signin.js
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var assert = require('node:assert/strict'), vm = require('node:vm'), fs = require('fs'), path = require('path');
var SRC = fs.readFileSync(path.join(__dirname, '..', 'omega-logic-signin.js'), 'utf8');

function node(sel) { return { sel: sel, hidden: false, style: {}, textContent: '', value: '', disabled: false, className: '', attrs: {}, setAttribute: function (k, v) { this.attrs[k] = v; }, focus: function () { this.focused = true; } }; }
function load(env) {
  env = env || {};
  var stubs = {}, head = [], calls = [];
  var el = { html: '', set innerHTML(v) { this.html = v; stubs = {}; }, get innerHTML() { return this.html; },
    querySelector: function (sel) {
      if (sel.charAt(0) === '#' && this.html.indexOf('id="' + sel.slice(1) + '"') < 0) return null;
      if (sel.charAt(0) === '.' && this.html.indexOf(sel.slice(1)) < 0) return null;
      return stubs[sel] || (stubs[sel] = node(sel));
    },
    querySelectorAll: function (sel) { return sel === '.ols-pw' ? [this.querySelector('label.ols-pw'), this.querySelector('#ols-pass')] : []; } };
  var auth = {
    sendSignInLinkToEmail: function (e, o) { calls.push(['link', e, o.url]); return Promise.resolve(); },
    signInWithPopup: function () { calls.push(['popup']); return Promise.resolve(); },
    signInWithRedirect: function () { calls.push(['redirect']); return Promise.resolve(); },
    signInWithEmailAndPassword: function (e, p) { calls.push(['password', e, p]); return Promise.resolve(); },
    sendPasswordResetEmail: function (e) { calls.push(['reset', e]); return Promise.resolve(); },
    createUserWithEmailAndPassword: function (e, p) {
      calls.push(['create', e, p]);
      if (e === 'taken@northwind.example') { var err = new Error('x'); err.code = 'auth/email-already-in-use'; return Promise.reject(err); }
      var u = { emailVerified: false, sendEmailVerification: function () { calls.push(['verify', e]); return Promise.resolve(); } }; auth.currentUser = u; return Promise.resolve({ user: u });
    },
    app: { options: { authDomain: 'silmarillion.clearskyomega.com' } } };
  var win = { navigator: { standalone: env.standalone === true }, location: { host: 'silmarillion.clearskyomega.com' }, localStorage: { setItem: function () {} },
    fetch: function (u) { calls.push(['fetch', u]); return Promise.resolve({ ok: true, json: function () { return Promise.resolve({ google: env.google !== false }); } }); },
    firebase: { auth: { GoogleAuthProvider: function () { this.setCustomParameters = function () {}; } } } };
  var doc = { getElementById: function (id) { return head.indexOf(id) >= 0 ? {} : null; }, createElement: function () { return {}; }, head: { appendChild: function (s) { head.push(s.id); } } };
  vm.runInNewContext(SRC, { window: win, document: doc, fetch: win.fetch, Promise: Promise });
  return { S: win.OmegaLogicSignIn, el: el, auth: auth, calls: calls, head: head, $: function (sel) { return el.querySelector(sel); } };
}
function tick() { return new Promise(function (r) { setTimeout(r, 15); }); }
function submit(x) { x.$('#ols-form').onsubmit({ preventDefault: function () {} }); }
var BRAND = { name: 'Clean Cell', logoUrl: '/tenants/cleancell/logo.png' };
function customer(x, extra) {
  return Object.assign({ auth: x.auth, brand: BRAND, lede: 'Your orders, sites and equipment.', linkUrl: 'https://silmarillion.clearskyomega.com/portals/customer/app?org=cleancell.us', linkKey: 'omega.portal.email', create: true,
    ids: { email: 'g-email', submit: 'g-link' },
    labels: { emailLabel: 'Email address', home: '/portals/customer/app?org=cleancell.us', installed: 'Emailed sign-in links open in Safari, not in this app: sign in here with Google, or with your email and a password.',
      linkSent: function (em) { return 'Check your inbox: a sign-in link from noreply@clearsky-portal.firebaseapp.com is on its way to ' + em + '. Not there in a minute? Look in spam or junk.'; } } }, extra || {});
}
var count = 0; async function test(name, fn) { await fn(); count++; console.log('PASS ' + name); }

(async function () {
  console.log('\nthe office sign-in is Omega Logic\'s, as it was');
  await test('no brand: "Sign in to Omega Logic", the Omega Logic icon and fine print, its own ids', function () {
    var x = load(); x.S.signIn(x.el, { auth: x.auth, linkUrl: 'https://h/office/app', linkKey: 'k' });
    assert.match(x.el.innerHTML, /<h1>Sign in to Omega Logic<\/h1>/); assert.match(x.el.innerHTML, /\/icons\/omega-logic-192\.png/); assert.match(x.el.innerHTML, /Omega Logic by ClearSky/);
    assert.match(x.el.innerHTML, /<input id="ols-email" /); assert.match(x.el.innerHTML, /<button class="ols-submit" type="submit">Sign in<\/button>/);
    assert.equal(x.$('#ols-new'), null, 'no sign-up on the office'); assert.equal(x.$('#ols-installed'), null); assert.deepEqual(x.head, ['ols-css']);
  });

  console.log('\nthe customer app: the supplier\'s name, never Omega Logic\'s');
  await test('with a brand: the supplier\'s name and mark, no Omega Logic words or icon, the page\'s own ids', function () {
    var x = load(); x.S.signIn(x.el, customer(x));
    var h = x.el.innerHTML;
    assert.match(h, /<h1>Sign in to Clean Cell<\/h1>/); assert.match(h, /<img class="ols-logo" src="\/tenants\/cleancell\/logo\.png" alt="Clean Cell">/);
    assert.equal(/Omega Logic|omega-logic|ClearSky/i.test(h), false, 'no platform name or icon on the customer surface');
    assert.match(h, /<label for="g-email">Email address<\/label><input id="g-email" /); assert.match(h, /<button class="ols-submit" type="submit" id="g-link">/);
    assert.match(h, /id="ols-new"/); assert.equal(x.$('#ols-new').hidden, true, 'sign-up is a password matter; hidden while the link is offered');
  });
  await test('  a mark that is not an https address or a path on this site is not drawn', function () {
    var x = load(); x.S.signIn(x.el, customer(x, { brand: { name: 'Clean Cell', logoUrl: 'javascript:alert(1)' } }));
    assert.equal(/<img/.test(x.el.innerHTML), false); assert.equal(/javascript:/.test(x.el.innerHTML), false);
  });
  await test('in a browser: the emailed link first, with who sends it and where to look', async function () {
    var x = load(); x.S.signIn(x.el, customer(x));
    assert.equal(x.$('.ols-submit').textContent, 'Email me a sign-in link'); assert.equal(x.$('#ols-installed'), null, 'the installed-app line is for the installed app only');
    x.$('#g-email').value = 'ops@northwind.example'; submit(x); await tick();
    assert.deepEqual(x.calls[0], ['link', 'ops@northwind.example', 'https://silmarillion.clearskyomega.com/portals/customer/app?org=cleancell.us']);
    assert.match(x.$('#ols-msg').textContent, /from noreply@clearsky-portal\.firebaseapp\.com is on its way to ops@northwind\.example\. Not there in a minute\? Look in spam or junk\./);
  });

  console.log('\ninstalled on an iPhone (CUST-01)');
  await test('no emailed link (it would open Safari); email and password with Forgot password; one line says why', function () {
    var x = load({ standalone: true }); x.S.signIn(x.el, customer(x));
    assert.equal(x.$('#ols-mode'), null, 'no "email me a link" on the home-screen app');
    assert.equal(x.$('.ols-submit').textContent, 'Sign in'); assert.equal(x.$('#ols-pass').hidden, false); assert.equal(x.$('#ols-forgot').hidden, false);
    assert.match(x.el.innerHTML, /<p class="ols-note" id="ols-installed">Emailed sign-in links open in Safari, not in this app/);
    assert.equal(x.$('#ols-new').hidden, false); assert.equal(x.$('#ols-new').textContent, 'First time here? Create a password');
  });
  await test('Google goes by same-site redirect, never the pop-up iOS cannot report', async function () {
    var x = load({ standalone: true }); x.S.signIn(x.el, customer(x));
    x.$('#signin').onclick(); await tick();
    assert.deepEqual(x.calls.map(function (c) { return c[0]; }), ['fetch', 'redirect']);
  });
  await test('  and where Google does not accept the host yet, it says so and names THIS app\'s address, not /logic', async function () {
    var x = load({ standalone: true, google: false }); x.S.signIn(x.el, customer(x));
    x.$('#signin').onclick(); await tick();
    var m = x.$('#ols-msg').textContent;
    assert.match(m, /not switched on for the installed app/); assert.match(m, /silmarillion\.clearskyomega\.com\/portals\/customer\/app\?org=cleancell\.us in Safari/); assert.equal(/\/logic/.test(m), false);
    assert.equal(x.$('#g-email').focused, true);
  });
  await test('email and password sign in; Forgot password sends the reset to set one', async function () {
    var x = load({ standalone: true }); x.S.signIn(x.el, customer(x));
    x.$('#g-email').value = 'ops@northwind.example'; x.$('#ols-pass').value = 'hunter22'; submit(x); await tick();
    x.$('#ols-forgot').onclick(); await tick();
    assert.deepEqual(x.calls, [['fetch', '/api/auth-check'], ['password', 'ops@northwind.example', 'hunter22'], ['reset', 'ops@northwind.example']]);
    assert.match(x.$('#ols-msg').textContent, /reset link is on its way/);
  });
  await test('first time here: the account, then the link that confirms the address', async function () {
    var x = load({ standalone: true }); x.S.signIn(x.el, customer(x));
    x.$('#ols-new').onclick(); assert.equal(x.$('.ols-submit').textContent, 'Create my sign-in'); assert.equal(x.$('#ols-pass').attrs.autocomplete, 'new-password');
    x.$('#g-email').value = 'new@northwind.example'; x.$('#ols-pass').value = 'hunter22'; submit(x); await tick();
    assert.deepEqual(x.calls.slice(1), [['create', 'new@northwind.example', 'hunter22'], ['verify', 'new@northwind.example']]);
    assert.match(x.$('#ols-msg').textContent, /emailed a link to new@northwind\.example to confirm/);
    var y = load({ standalone: true }); y.S.signIn(y.el, customer(y)); y.$('#ols-new').onclick();
    y.$('#g-email').value = 'taken@northwind.example'; y.$('#ols-pass').value = 'hunter22'; submit(y); await tick();
    assert.match(y.$('#ols-msg').textContent, /already has a sign-in here\. Tap “Forgot password\?”/);
  });
  console.log('\n' + count + ' customer sign-in checks passed. No network calls.');
})().catch(function (e) { console.error(e); process.exit(1); });
