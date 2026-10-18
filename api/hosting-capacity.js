/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   POST /api/hosting-capacity { lat, lng, state }
   A non-ComEd hosting screen. The registry, the query, and the field
   mapping are api/_lib/hosting-capacity.js (the file editor v2 shares).
   This route only fetches and returns one normalized feature.
   ComEd is refused here on purpose: the parcel probe is omega-comed-layers.js.
   Illinois and any state with no open layer answer covered:false.
   Same sign-in as the grid verdict. */
'use strict';
var A = require('./_lib/admin');
var H = require('./_lib/hosting-capacity');
var S = require('./_lib/hosting-screen');
var MODULES = ['gridatlas', 'siteintel', 'sitefinder', 'compute'];

function fetchJson(url) {
  var ctl = null, timer = null;
  try {
    ctl = new AbortController();
    timer = setTimeout(function () { try { ctl.abort(); } catch (e) {} }, 12000);
  } catch (e) {}
  return fetch(url, { signal: ctl ? ctl.signal : undefined }).then(function (r) {
    if (timer) clearTimeout(timer);
    if (!r.ok) throw new Error('The hosting service answered ' + r.status);
    return r.json();
  }, function (e) {
    if (timer) clearTimeout(timer);
    throw e;
  });
}

module.exports = A.handler(function (req, res) {
  if (req.method !== 'POST') throw A.httpError(405, 'POST only');
  return A.authenticate(req).then(function (caller) {
    if (!caller || !(caller.orgId || caller.staff)) throw A.httpError(403, 'A workspace sign-in is required');
    return require('./_lib/package-access').withCaller(caller, MODULES, { produce: false }).then(function () {
      var b = req.body && typeof req.body === 'object' ? req.body : {};
      var lat = +b.lat, lng = +b.lng;
      var src = H.sourceForState(b.state);
      res.setHeader('Cache-Control', 'no-store');
      if (!src) {
        return { covered: false, state: String(b.state || '').toUpperCase(), states: S.coveredStates(),
          say: 'No open hosting-capacity layer is read for this state. ComEd is resolved at the parcel by its own map.' };
      }
      var url;
      try { url = H.queryUrl(src, lat, lng); }
      catch (e) { throw A.httpError(400, e.message); }
      return fetchJson(url).then(function (j) {
        var features = j && j.features;
        if (j && j.error) throw A.httpError(502, 'The hosting service did not return a layer');
        if (!features || !features.length) {
          return { covered: true, empty: true, sourceId: src.id, utility: src.utility, verified: src.verified,
            say: src.utility + ' returned no feeder within the search. That is not a zero. It needs a study.' };
        }
        var out = S.screen(src, features[0]);
        out.verified = src.verified;
        out.queriedAt = new Date().toISOString();
        return out;
      }, function (e) {
        throw A.httpError(502, e.message || 'The hosting service did not answer');
      });
    });
  });
});
