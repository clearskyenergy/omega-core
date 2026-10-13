/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   api/_lib/site-kinds.js — what KIND of project a registered site is.

   A site in the Asset CRM carries `siteScopes`, the same keys a Site Map
   project carries (omega-newproject.js SCOPES: der, bess, compute, dcfc, l2,
   microgrid, building), so the project the site makes (`send-to-editor`)
   opens on exactly what was declared. The ONE type table is
   omega-workspaces.js: a key is valid when its `normalize` recognises it
   (an alias such as `storage` or `solar` is accepted and kept as typed).
   No second list here: the labels live in omega-newproject.js for the
   pages, the aliases in omega-workspaces.js for everybody. */
'use strict';
var path = require('path');
var W = require(path.join(__dirname, '..', '..', 'omega-workspaces.js'));
var O = W.OmegaWorkspaces || W;
var MAX = 7;

function fail(message) { var e = new Error(message); e.status = 400; return e; }

/* undefined → undefined (the caller leaves the stored value alone);
   null, '' or [] → [] (cleared); a list or a comma-separated string → the
   keys, lower-cased, unique, each one the table knows. */
function scopesInput(v) {
  if (v === undefined) return undefined;
  if (v === null || v === '') return [];
  var arr = Array.isArray(v) ? v : String(v).split(',');
  var out = [];
  arr.forEach(function (k) {
    k = String(k == null ? '' : k).trim().toLowerCase();
    if (!k) return;
    if (!/^[a-z0-9+-]{1,24}$/.test(k) || O.normalize(null, [k]).length !== 1) throw fail('Project type "' + k + '" is not one the platform knows');
    if (out.indexOf(k) < 0) out.push(k);
  });
  if (out.length > MAX) throw fail('At most ' + MAX + ' project types on a site');
  return out;
}

module.exports = { scopesInput: scopesInput, normalize: function (scopes) { return O.normalize(null, scopes); }, MAX: MAX };
