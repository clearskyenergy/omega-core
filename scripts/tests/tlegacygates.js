/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   The truthful legacy store, held without a browser.

   api/_lib/modules.js `legacyGates` says which legacy caps gate each
   module's commands in the editor; OmegaWorkspaceHub.moduleState asks them
   of the editor's own ladder (OmegaCaps.canWith). The exact table is read
   off the live editor by scripts/render-legacy-gates.js (check:pages).
   This pins, in npm test, what can drift without Chromium:
     - every data-cap the editor actually carries (markup outside comments,
       and the ones scripts set) is a cap the ladder can answer;
     - every legacyGates entry, and each link of a chain, is '' or such a
       cap, and a chain is how a command with its own cap on a gated tab
       reads;
     - no module lists a gate the editor no longer carries.
   node scripts/tests/tlegacygates.js */
'use strict';
var fs = require('fs'), path = require('path'), ROOT = path.join(__dirname, '..', '..');
var M = require(path.join(ROOT, 'api', '_lib', 'modules.js'));
global.window = global;
global.document = { documentElement: {}, body: { setAttribute: function () {}, getAttribute: function () { return null; } }, querySelectorAll: function () { return []; }, addEventListener: function () {}, dispatchEvent: function () {} };
require(path.join(ROOT, 'omega-caps.js'));
var C = global.OmegaCaps, pass = 0, fail = 0;
function ok(m, c, got) { if (c) { pass++; return; } fail++; console.log('  FAIL ' + m + (got !== undefined ? '  got: ' + JSON.stringify(got) : '')); }

var html = fs.readFileSync(path.join(ROOT, 'editor.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
var live = {};
(html.match(/data-cap="[^"]+"/g) || []).forEach(function (a) { live[a.slice(10, -1)] = 1; });
(html.match(/setAttribute\(\s*['"]data-cap['"]\s*,\s*['"][^'"]+['"]\s*\)/g) || []).forEach(function (a) { live[/,\s*['"]([^'"]+)['"]/.exec(a)[1]] = 1; });
var caps = Object.keys(live).sort();
/* a cap the ladder knows: granted by some tier, some add-on or the JV carve-out, or a dotted child of one */
function known(cap) {
  var grants = [].concat.apply([], C.LADDER.map(function (t) { return C.GRANTS[t] || []; }));
  Object.keys(C.ADDON_GRANTS).forEach(function (k) { grants = grants.concat(C.ADDON_GRANTS[k]); });
  grants = grants.concat(C.JV_GRANTS);
  var dot = cap.indexOf('.');
  return grants.indexOf(cap) >= 0 || (dot > 0 && grants.indexOf(cap.slice(0, dot)) >= 0);
}
ok('the editor carries data-cap gates (live markup and script)', caps.length >= 6, caps);
caps.forEach(function (c) { ok('editor gate "' + c + '" is a cap the ladder answers', known(c)); });
ok('Enterprise opens every gate the editor carries', caps.every(function (c) { return C.canWith('enterprise', c, {}); }));
ok('a trial opens none of the paid gates', caps.filter(function (c) { return C.canWith('trial', c, {}); }).length === 0, caps.filter(function (c) { return C.canWith('trial', c, {}); }));

M.catalog().forEach(function (m) {
  ok(m.key + ' carries legacyGates', Array.isArray(m.legacyGates));
  (m.legacyGates || []).forEach(function (g) {
    if (g === '') return;
    g.split('+').forEach(function (link) {
      ok(m.key + ': gate "' + link + '" is one the editor still carries', !!live[link], caps);
      ok(m.key + ': gate "' + link + '" is a cap the ladder answers', known(link));
    });
  });
  if (/^logic-/.test(m.key) || !m.ribbon.length) ok(m.key + ' has no editor commands, so no gates', !(m.legacyGates || []).length);
});
var chains = [].concat.apply([], M.catalog().map(function (m) { return (m.legacyGates || []).filter(function (g) { return g.indexOf('+') > 0; }); }));
ok('a chain names the tab first, then the command\'s own cap', chains.every(function (g) { var p = g.split('+'); return p.length === 2 && live[p[0]] && live[p[1]]; }), chains);

console.log('tlegacygates: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
