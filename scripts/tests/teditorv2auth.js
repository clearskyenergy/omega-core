/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Site Plan sign-in for guided builds, and the solar kW-AC default.
 * The layout stays in api/_lib/guided-build.js. A missing session does
 * not place anything on the client.
 */
'use strict';
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '../..');

require(path.join(ROOT, 'omega-editor-v2-geom.js'));
require(path.join(ROOT, 'omega-editor-v2-doc.js'));
require(path.join(ROOT, 'omega-guided-build-form.js'));
require(path.join(ROOT, 'omega-editor-v2-auth.js'));
require(path.join(ROOT, 'omega-editor-v2-build.js'));

var D = global.OmegaEditorV2Doc;
var Form = global.OmegaGuidedBuildForm;
var Auth = global.OmegaEditorV2Auth;
var Build = global.OmegaEditorV2Build;

var n = 0;
function check(cond, msg) {
  assert.ok(cond, msg);
  n++;
}

var bess = Form.defaults('bess');
check(bess.solarKw === '', 'solar kW-AC starts blank');
check(bess.solarKw !== 2 && bess.solarKw !== '2', 'solar kW-AC is not 2');
check(bess.hours === 2, 'hours stays 2');

var doc = D.create({ name: 'Sample industrial site', anchor: { lat: 33.306, lng: -112.074 } });
var parcel = { id: 'parcel', type: 'polygon', layer: 'site', closed: true, pts: [
  { x: 0, y: 0 }, { x: 420, y: 0 }, { x: 420, y: 280 }, { x: 0, y: 280 }
]};
doc.entities.push(parcel);
doc.entities.push({ id: 'array', type: 'array', layer: 'array', boundaryId: parcel.id, mount: 'fixed-ground', setbackFt: 15 });
doc.entities.push({
  id: 'ob', type: 'obstruction', layer: 'obstruction', closed: true,
  pts: [{ x: 300, y: 170 }, { x: 390, y: 170 }, { x: 390, y: 245 }, { x: 300, y: 245 }]
});
var summary = D.summary(doc);
check(summary.solarKwAc === 482, 'the sample array is 482 kW-AC, got ' + summary.solarKwAc);
check(Build.solarAcOf(summary) === '482', 'prefill uses that figure');
check(Build.solarAcOf({ solarKwAc: 0 }) === '' && Build.solarAcOf(null) === '', 'no array stays blank');

var page = fs.readFileSync(path.join(ROOT, 'editor-v2.html'), 'utf8');
var iApp = page.indexOf('firebase-app-compat.js');
var iAuthSdk = page.indexOf('firebase-auth-compat.js');
var iCfg = page.indexOf('src="config.js"');
var iMod = page.indexOf('src="omega-editor-v2-auth.js"');
var iBoot = page.indexOf('OmegaEditorV2App.boot()');
check(iApp > 0 && iApp < iAuthSdk && iAuthSdk < iCfg && iCfg < iMod && iMod < iBoot, 'Firebase, config, and the sign-in module load before boot');
check(page.indexOf('firebase-firestore') > 0 && /omega-brand\.js.*<\/script>\s*<script src="omega-tenant\.js"/m.test(page), 'workspace saves use Firestore and the shared tenant runtime follows branding');
check(page.indexOf('Sign in to place guided builds.') >= 0 && page.indexOf('id="build-signin-btn"') >= 0, 'the dialog has the sign-in sentence and a button');
check(page.indexOf('missing bearer token') < 0, 'the page does not print the raw token error');
check(page.indexOf('api/_lib/guided-build') < 0, 'the page does not ship the planner');

var authSrc = fs.readFileSync(path.join(ROOT, 'omega-editor-v2-auth.js'), 'utf8');
check(authSrc.indexOf('Persistence.LOCAL') >= 0 && authSrc.indexOf('CLEARSKY_CONFIG') >= 0, 'LOCAL persistence, config from the one file');
check(authSrc.indexOf('AIza') < 0, 'the auth module does not carry a second API key');
check(authSrc.indexOf('signInWithPopup') >= 0 && authSrc.indexOf('signInWithRedirect') >= 0, 'popup, then redirect');
check(authSrc.indexOf('auth/popup-blocked') >= 0 && authSrc.indexOf('auth/popup-closed-by-user') >= 0 && authSrc.indexOf('auth/cancelled-popup-request') >= 0, 'the same three popup failures fall back');
check(authSrc.indexOf("addScope('email')") >= 0 && authSrc.indexOf("addScope('profile')") >= 0, 'email and profile, as Site Map asks');
check(authSrc.indexOf('firestore') < 0, 'no Firestore from the sign-in module');

var buildSrc = fs.readFileSync(path.join(ROOT, 'omega-editor-v2-build.js'), 'utf8');
check(buildSrc.indexOf('Sign in to place guided builds.') >= 0 && buildSrc.indexOf('needSignIn') >= 0, 'Place asks for a sign-in instead of a raw error');
check(buildSrc.indexOf('missing bearer token') < 0 && buildSrc.indexOf('api/_lib/guided-build') < 0, 'the build client has no token string and no planner');
check(buildSrc.indexOf('omega.editorV2.buildDraft') >= 0 && buildSrc.indexOf('omega.editorV2.buildReturn') >= 0, 'a redirect can restore the dialog');

function tokenFn(src) {
  var i = src.indexOf('function token()');
  return src.slice(i, i + 700);
}
/* the grid layer asks hosting capacity through the shared client (2026-10-17,
   the national door), so the client's token is the one the layer uses */
var gridFile = fs.readFileSync(path.join(ROOT, 'omega-editor-v2-grid.js'), 'utf8');
var verdictSrc = tokenFn(fs.readFileSync(path.join(ROOT, 'omega-grid-verdict.js'), 'utf8'));
check(gridFile.indexOf('function token()') < 0 && gridFile.indexOf('/api/hosting-capacity\'') < 0 && /GV\.hosting\(body\)/.test(gridFile), 'hosting capacity goes through the shared client, never a second token path');
check(verdictSrc.indexOf('OmegaEditorV2Auth') >= 0 && verdictSrc.indexOf('Sign in to check the grid.') >= 0 && verdictSrc.indexOf('currentUser') >= 0, 'the shared verdict client prefers Site Plan auth when it is on the page');

var editor = fs.readFileSync(path.join(ROOT, 'editor.html'), 'utf8');
check(editor.indexOf('omega-editor-v2-auth') < 0 && editor.indexOf('omega-editor-v2') < 0, 'Site Map does not load the Site Plan sign-in');

var appSrc = fs.readFileSync(path.join(ROOT, 'omega-editor-v2-app.js'), 'utf8');
check(appSrc.indexOf('Bld.resume') >= 0, 'boot restores a build that left for sign-in');

check(typeof Auth.idToken === 'function' && typeof Auth.signIn === 'function', 'the module exports a token and a sign-in');
check(Auth.projectId() === '', 'without config the project id is empty');

var fetched = 0;
var seenAuth = '';
function jsonRes(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status: status,
    json: function () { return Promise.resolve(body); }
  };
}

Auth.idToken().then(function (t) {
  check(t === '', 'no session is an empty token');
  return Auth.signIn().then(function () { check(false, 'sign-in without Firebase should fail'); }, function (err) {
    check(/unavailable/i.test(err.message) && !/bearer/i.test(err.message), 'a missing SDK says sign-in is unavailable');
  });
}).then(function () {
  global.OmegaEditorV2Auth = { idToken: function () { return Promise.resolve(''); } };
  global.fetch = function () { fetched++; return Promise.resolve(jsonRes(200, { ok: true })); };
  return Build.ask('bess', { kw: 500 });
}).then(function (r) {
  check(r && r.needSignIn === true && !r.reason && fetched === 0, 'no token means no request and no error string');
  global.OmegaEditorV2Auth = { idToken: function () { return Promise.resolve('tok-1'); } };
  global.fetch = function (url, opts) {
    fetched++;
    seenAuth = opts && opts.headers && opts.headers.Authorization;
    return Promise.resolve(jsonRes(401, { error: 'missing bearer token' }));
  };
  return Build.ask('bess', { kw: 500 });
}).then(function (r) {
  check(seenAuth === 'Bearer tok-1' && fetched === 1, 'a session sends the ID token');
  check(r && r.needSignIn === true && !r.reason, 'a bearer rejection becomes the sign-in panel');
  global.fetch = function (url, opts) {
    seenAuth = opts.headers.Authorization;
    return Promise.resolve(jsonRes(403, { error: 'Sign in to place a guided build.' }));
  };
  return Build.ask('bess', { kw: 500 });
}).then(function (r) {
  check(seenAuth === 'Bearer tok-1' && r.needSignIn === true && !r.reason, 'a workspace refusal is the same panel');
  global.fetch = function () { return Promise.resolve(jsonRes(413, { error: 'This site is too large to build in one request.' })); };
  return Build.ask('bess', { kw: 500 });
}).then(function (r) {
  check(r && r.needSignIn !== true && r.reason.indexOf('too large') >= 0, 'a real refusal is still said');
  console.log('teditorv2auth: ' + n + ' checks passed');
}).catch(function (e) {
  console.error(e);
  process.exit(1);
});
