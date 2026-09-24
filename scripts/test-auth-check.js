#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   scripts/test-auth-check.js — the installed iPhone app signs in through its
   own host (config.js) and asks api/auth-check whether Google accepts that
   host yet, so nobody is sent to Google's "Access blocked" page.
     node scripts/test-auth-check.js */
'use strict';
var assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm');
var AC = require('../api/auth-check');
var ROOT = path.join(__dirname, '..');
var count = 0; async function test(n, f) { await f(); count++; console.log('PASS ' + n); }

/* a fake of the two calls: Firebase's createAuthUri, then Google */
function fake(google, opts) {
  opts = opts || {}; var calls = [];
  var f = async function (url, init) {
    calls.push(url);
    if (opts.down) throw new Error('network');
    if (/createAuthUri/.test(url)) {
      var body = JSON.parse(init.body);
      if (opts.firebaseError) return { ok: false, json: async function () { return { error: { message: opts.firebaseError } }; } };
      return { ok: true, json: async function () { return { authUri: (opts.authHost || 'https://accounts.google.com') + '/o/oauth2/auth?redirect_uri=' + encodeURIComponent(body.continueUri) }; } };
    }
    var loc = google ? 'https://accounts.google.com/v3/signin/identifier?x=1' : 'https://accounts.google.com/signin/oauth/error?authError=redirect_uri_mismatch';
    return { status: 302, headers: { get: function (h) { return h === 'location' ? loc : null; } }, text: async function () { return ''; } };
  };
  f.calls = calls; return f;
}
function res() { var r = { headers: {}, statusCode: 0, body: '' }; r.setHeader = function (k, v) { r.headers[k.toLowerCase()] = v; }; r.end = function (b) { r.body = b; return r; }; return r; }
function req(host, method) { return { method: method || 'GET', headers: { host: host } }; }
function configFor(pathname, standalone, host) {
  var w = {}, ctx = { window: w, location: { pathname: pathname, host: host || 'app.example-tenant.clearskyomega.com' }, navigator: { standalone: standalone } };
  vm.createContext(ctx); vm.runInContext(fs.readFileSync(path.join(ROOT, 'config.js'), 'utf8'), ctx);
  return w.CLEARSKY_CONFIG.firebase.authDomain;
}

(async function () {
  console.log('\nthe installed app\'s Google sign-in');
  await test('config.js: an Omega Logic app on an iPhone home screen signs in through its own host, decided before any script can start Firebase', async function () {
    ['/office/app', '/office/app.html', '/omega-logic', '/plant/app', '/portals/customer/app'].forEach(function (p) { assert.equal(configFor(p, true), 'app.example-tenant.clearskyomega.com', p); });
    assert.equal(configFor('/office/app', false), 'clearsky-portal.firebaseapp.com', 'in a browser tab: the project domain, pop-up as before');
    assert.equal(configFor('/office/app', undefined), 'clearsky-portal.firebaseapp.com');
    ['/projects', '/', '/editor', '/office/apps', '/mission'].forEach(function (p) { assert.equal(configFor(p, true), 'clearsky-portal.firebaseapp.com', 'not an Omega Logic app: ' + p); });
  });
  await test('on a host whose handler Google accepts (silmarillion), every Omega Logic sign-in goes through it, installed or not; other pages keep the project domain', async function () {
    var S = 'silmarillion.clearskyomega.com';
    ['/office/app', '/omega-logic', '/plant/app', '/portals/customer/app'].forEach(function (p) { assert.equal(configFor(p, false, S), S, p); assert.equal(configFor(p, undefined, S), S, p); });
    ['/projects', '/', '/editor', '/mission'].forEach(function (p) { assert.equal(configFor(p, false, S), 'clearsky-portal.firebaseapp.com', p); });
  });
  await test('the page start-up no longer decides it (omega-tenant.js starts Firebase first, so a later switch never took effect)', async function () {
    var src = fs.readFileSync(path.join(ROOT, 'omega-logic-signin.js'), 'utf8');
    global.window = global; var nav = Object.getOwnPropertyDescriptor(global, 'navigator');
    Object.defineProperty(global, 'navigator', { value: { standalone: true }, configurable: true });
    try { vm.runInThisContext(src); var cfg = { authDomain: 'clearsky-portal.firebaseapp.com' }; assert.equal(global.OmegaLogicSignIn.config(cfg).authDomain, 'clearsky-portal.firebaseapp.com'); }
    finally { if (nav) Object.defineProperty(global, 'navigator', nav); delete global.OmegaLogicSignIn; }
    var tenant = fs.readFileSync(path.join(ROOT, 'omega-tenant.js'), 'utf8'), app = fs.readFileSync(path.join(ROOT, 'office/app.html'), 'utf8');
    assert.ok(/firebase\.initializeApp\(c\.firebase\)/.test(tenant), 'omega-tenant.js still starts Firebase from CLEARSKY_CONFIG, which is why config.js must decide');
    assert.ok(app.indexOf('<script src="/config.js"></script><script src="/omega-brand.js"></script><script src="/omega-tenant.js"></script>') > 0, 'config.js loads before omega-tenant.js on the office app');
  });
  await test('the public web key here is the one in config.js', async function () {
    assert.ok(fs.readFileSync(path.join(ROOT, 'config.js'), 'utf8').indexOf("apiKey:            '" + AC.WEB_KEY + "'") > 0);
  });
  await test('Google refusing the handler (redirect_uri_mismatch) is "no"; showing its sign-in is "yes"; a failure is "could not tell"', async function () {
    assert.equal(await AC.googleAccepts('silmarillion.clearskyomega.com', fake(false)), false);
    var yes = fake(true); assert.equal(await AC.googleAccepts('silmarillion.clearskyomega.com', yes), true);
    assert.match(yes.calls[0], /identitytoolkit\.googleapis\.com\/v1\/accounts:createAuthUri\?key=/);
    assert.match(yes.calls[1], /redirect_uri=https%3A%2F%2Fsilmarillion\.clearskyomega\.com%2F__%2Fauth%2Fhandler/, 'asks about THIS host\'s handler');
    assert.equal(await AC.googleAccepts('silmarillion.clearskyomega.com', fake(true, { down: true })), null);
    assert.equal(await AC.googleAccepts('silmarillion.clearskyomega.com', fake(true, { firebaseError: 'UNAUTHORIZED_DOMAIN : Domain not allowlisted' })), false);
    assert.equal(await AC.googleAccepts('silmarillion.clearskyomega.com', fake(true, { firebaseError: 'INTERNAL' })), null);
    var odd = fake(true, { authHost: 'https://evil.example' }); assert.equal(await AC.googleAccepts('silmarillion.clearskyomega.com', odd), null); assert.equal(odd.calls.length, 1, 'never follows an address that is not Google\'s');
  });
  await test('only our own hosts are asked about; the request supplies nothing else', async function () {
    assert.equal(AC.hostOf(req('silmarillion.clearskyomega.com')), 'silmarillion.clearskyomega.com');
    assert.equal(AC.hostOf(req('SILMARILLION.clearskyomega.com:443')), 'silmarillion.clearskyomega.com');
    assert.equal(AC.hostOf({ headers: { 'x-forwarded-host': 'tools.csebuilders.com', host: 'x.vercel.app' } }), 'tools.csebuilders.com');
    ['evil.example', 'clearskyomega.com.evil.example', 'evilclearskyomega.com', '', '127.0.0.1'].forEach(function (h) { assert.equal(AC.hostOf(req(h)), '', h); });
    var f = fake(true), r = res(); await AC.check(req('evil.example'), r, f, 1);
    assert.deepEqual(JSON.parse(r.body), { google: null }); assert.equal(f.calls.length, 0, 'a foreign host costs no call');
    var r2 = res(); await AC.check(req('silmarillion.clearskyomega.com', 'POST'), r2, f, 1); assert.equal(r2.statusCode, 405);
  });
  await test('answers are cached, and a "no" is re-asked soon so Google comes back by itself after the console change', async function () {
    Object.keys(AC._cache).forEach(function (k) { delete AC._cache[k]; });
    var no = fake(false), r = res(); await AC.check(req('demo.clearskyomega.com'), r, no, 1000);
    assert.deepEqual(JSON.parse(r.body), { google: false }); assert.match(r.headers['cache-control'], /s-maxage=60\b/);
    var r2 = res(); await AC.check(req('demo.clearskyomega.com'), r2, no, 2000); assert.equal(no.calls.length, 2, 'the second ask is answered from the cache');
    var yes = fake(true), r3 = res(); await AC.check(req('demo.clearskyomega.com'), r3, yes, 1000 + 5 * 60 * 1000 + 1);
    assert.deepEqual(JSON.parse(r3.body), { google: true }, 'after the cache lapses the new answer is seen'); assert.match(r3.headers['cache-control'], /s-maxage=600/);
    var down = fake(true, { down: true }), r4 = res(); await AC.check(req('osa.clearskyomega.com'), r4, down, 1);
    assert.deepEqual(JSON.parse(r4.body), { google: null }); assert.equal(AC._cache['osa.clearskyomega.com'], undefined, '"could not tell" is not remembered');
  });
  await test('the sign-in page asks before it sends an installed app to Google, and tells a Google-only person how to set a password', async function () {
    var s = fs.readFileSync(path.join(ROOT, 'omega-logic-signin.js'), 'utf8');
    assert.ok(/fetch\('\/api\/auth-check'/.test(s) && /not switched on for the installed app/.test(s));
    assert.match(s, /If you have only ever used Google, tap \\u201cForgot password\?\\u201d to set a password/);
  });
  console.log('\n' + count + ' installed-app sign-in checks passed. No network calls.\n');
})().catch(function (e) { console.error(e); process.exit(1); });
