/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * The real server behind Site Plan's Run, offline, for the checks
 * (scripts/tests/teditorv2run.js, scripts/render-editor-v2.js).
 *
 *   POST /api/cost-rollup  → api/_lib/editor-cost.js rollup(), the engine
 *                            the route calls (the route adds the caller's
 *                            org as vendorOrg; a test caller is no vendor)
 *   POST /api/value-stack  → the api/value-stack.js handler itself, with
 *                            sign-in and geocoding stood in for: the caller
 *                            is staff (the gate is tvalueapi's to test) and
 *                            a map point reverse-geocodes to `zip`
 *
 * Nothing here reaches the network. answer(url, body) resolves
 * { status, json } and never rejects.
 */
'use strict';
var path = require('path');
var ROOT = path.join(__dirname, '..', '..');

var VT = require(path.join(ROOT, 'api/_lib/verify-token.js'));
var GEO = require(path.join(ROOT, 'api/_lib/geocode.js'));
var EC = require(path.join(ROOT, 'api/_lib/editor-cost.js'));

function create(opts) {
  opts = opts || {};
  var zip = opts.zip || '85042';
  var calls = [];
  VT.verifyIdToken = function () {
    return Promise.resolve({ uid: 'run-check', email: 'run-check@clearsky-usa.com', emailVerified: true, orgId: 'clearsky-usa.com', staff: true, claims: {} });
  };
  GEO.reverse = function () { return Promise.resolve({ zip: zip, state: opts.state || 'AZ', county: null }); };
  GEO.geocode = function () { return Promise.resolve(null); };
  var VS = require(path.join(ROOT, 'api/value-stack.js'));

  function handler(fn, body) {
    return new Promise(function (resolve) {
      var out = { status: 200, json: null };
      var res = {
        setHeader: function () {},
        status: function (s) { out.status = s; return res; },
        json: function (j) { out.json = j; resolve(out); return res; }
      };
      Promise.resolve(fn({ method: 'POST', headers: { authorization: 'Bearer run-check' }, body: body }, res)).catch(function (e) {
        resolve({ status: 500, json: { ok: false, error: String(e && e.message || e) } });
      });
    });
  }

  function answer(url, body) {
    var p = String(url).replace(/^https?:\/\/[^/]+/, '').split('?')[0];
    calls.push({ path: p, body: body });
    if (p === '/api/cost-rollup') return Promise.resolve({ status: 200, json: EC.rollup(JSON.parse(JSON.stringify(body || {}))) });
    if (p === '/api/value-stack') return handler(VS, body);
    return Promise.resolve({ status: 404, json: { ok: false, error: 'Not stood in for this check: ' + p } });
  }

  return { answer: answer, calls: calls };
}

module.exports = { create: create };
