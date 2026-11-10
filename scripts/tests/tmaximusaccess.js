/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * Omega Maximus is a module ($1,299/month from price book 2026-11). Its
 * doors ask ONE question on any plan (package-access withModuleAnyPlan): a
 * package by its modules[], a legacy plan by the ONE legacy rule
 * (addons.held, the Modules page's moduleState with the add-ons bought by
 * card). /api/maximus-access is that same answer for the page's lock.
 * Offline: the admin module stands on the Firestore double; the rule, the
 * catalog, the tools and the hub are the real ones.
 */
'use strict';
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var F = require('../_lib/firestore-double');
var ROOT = path.join(__dirname, '../..');

var db = new F.DB(), caller = null;
function httpError(status, message) { var e = new Error(message); e.status = status; return e; }
F.mock('../api/_lib/admin', {
  handler: function (fn) {
    return function (req, res) {
      return Promise.resolve().then(function () { return fn(req, res); }).then(function (out) { res.statusCode = 200; res.body = out; return out; },
        function (e) { res.statusCode = e.status || 500; res.body = { error: e.message }; });
    };
  },
  authenticate: function () { return caller ? Promise.resolve(caller) : Promise.reject(httpError(401, 'Sign in')); },
  httpError: httpError,
  db: function () { return db; },
  billingOf: function (org) { return db.doc('omega_orgs/' + org + '/billing/current').get().then(function (s) { return s.exists ? s.data() : {}; }); }
});

var X = require('../../api/_lib/package-access');
var B = require('../../api/_lib/pricebook');
var endpoint = require('../../api/maximus-access');

var n = 0;
function check(cond, msg) { assert.ok(cond, msg); n++; }
var ORG = 'maximus-check.example';
function who(extra) { return Object.assign({ uid: 'u1', email: 'owner@' + ORG, emailVerified: true, orgId: ORG, staff: false }, extra || {}); }
function legacy(billing) {
  db = new F.DB();
  db.seed('omega_orgs/' + ORG, { name: 'Maximus check', status: 'active' });
  db.seed('omega_orgs/' + ORG + '/members/u1', { role: 'owner', status: 'active' });
  db.seed('omega_orgs/' + ORG + '/billing/current', billing);
}
function packaged(modules) {
  legacy({ packaged: true, packagingState: 'paid', modules: modules, accessUntil: Date.now() + 30 * 86400000, pricebookVersion: B.VERSION });
}
function allowed(c) { return X.withModuleAnyPlan(c || who(), 'maximus').then(function () { return true; }, function (e) { if (e.status !== 403) throw e; return e.message; }); }

var cases = [
  ['a Standard plan buys it', function () { legacy({ tier: 'standard' }); }, false],
  ['a Deluxe (Pro) plan buys it', function () { legacy({ tier: 'deluxe' }); }, false],
  ['an Enterprise contract holds it', function () { legacy({ tier: 'enterprise' }); }, true],
  ['a trial tries it (a trial\'s tool level is Enterprise\'s)', function () { legacy({ tier: 'trial' }); }, true],
  ['the add-on (toolOverrides, as addons.grant writes it) opens it on Standard', function () { legacy({ tier: 'standard', toolOverrides: { siteplantrial: true } }); }, true],
  ['an Enterprise plan with it switched off does not hold it', function () { legacy({ tier: 'enterprise', toolOverrides: { siteplantrial: false } }); }, false],
  ['an allowlist without it does not hold it, whatever the tier', function () { legacy({ tier: 'enterprise', toolAccess: ['editor', 'gridatlas'] }); }, false],
  ['an allowlist naming it holds it', function () { legacy({ tier: 'standard', toolAccess: ['editor', 'siteplantrial'] }); }, true],
  ['a package of Omega Design alone does not hold it', function () { packaged(['lite']); }, false],
  ['a package with Omega Maximus holds it', function () { packaged(['lite', 'maximus']); }, true]
];

var chain = Promise.resolve();
cases.forEach(function (c) {
  chain = chain.then(function () {
    c[1]();
    return allowed().then(function (got) {
      if (c[2]) check(got === true, c[0] + ': ' + got);
      else check(typeof got === 'string' && /Omega Maximus/.test(got), c[0] + ' (refused with the module named): ' + got);
    });
  });
});

chain.then(function () {
  legacy({ tier: 'standard' });
  return allowed(who({ staff: true, orgId: 'clearsky-usa.com' })).then(function (got) { check(got === true, 'ClearSky staff pass'); });
}).then(function () {
  /* the page's answer is the doors' answer, with the price off the release book */
  legacy({ tier: 'standard' });
  db.seed('pricebook/' + B.VERSION, B.proposed());
  caller = who();
  var res = { setHeader: function () {} };
  return endpoint({ method: 'GET', headers: {} }, res).then(function () {
    check(res.statusCode === 200 && res.body.held === false && res.body.price === '$1,299/month' && res.body.optIn === '/workspace#module-maximus', 'the page is told: not held, $1,299/month, Opt in on the Modules page');
    check(/Omega Maximus is not on this workspace's plan/.test(res.body.reason), 'with the doors\' own words');
    legacy({ tier: 'enterprise' });
    var res2 = { setHeader: function () {} };
    return endpoint({ method: 'GET', headers: {} }, res2).then(function () {
      check(res2.statusCode === 200 && res2.body.held === true && Object.keys(res2.body).join() === 'held', 'held: the page opens and is told nothing else');
      caller = null;
      var res3 = { setHeader: function () {} };
      return endpoint({ method: 'GET', headers: {} }, res3).then(function () { check(res3.statusCode === 401, 'signed out is a 401, never an answer'); });
    });
  });
}).then(function () {
  /* every Maximus door asks it first; the page carries the lock */
  [['api/guided-build.js', "withModuleAnyPlan(caller, 'maximus')"], ['api/editor-v2-component-cost.js', "withModuleAnyPlan(caller, 'maximus'"],
   ['api/editor-v2-3d-config.js', "withModuleAnyPlan(caller,'maximus'"], ['api/editor-v2-3d-tiles.js', "withModuleAnyPlan(caller,'maximus'"],
   ['api/solar-design.js', "withModuleAnyPlan(caller, 'maximus')"]].forEach(function (d) {
    check(fs.readFileSync(path.join(ROOT, d[0]), 'utf8').indexOf(d[1]) >= 0, d[0] + ' asks for Omega Maximus');
  });
  var page = fs.readFileSync(path.join(ROOT, 'editor-v2.html'), 'utf8'), app = fs.readFileSync(path.join(ROOT, 'omega-editor-v2-app.js'), 'utf8');
  check(page.indexOf('id="maximus-lock"') > 0 && page.indexOf('href="/workspace#module-maximus"') > 0 && app.indexOf("'/api/maximus-access'") > 0, 'the page asks and shows the price and Opt in when it is not held');
  console.log('tmaximusaccess: ' + n + ' checks passed');
}).catch(function (e) { console.error(e); process.exit(1); });
