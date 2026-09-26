/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var assert = require('assert'), fs = require('fs'), M = require('../api/_lib/modules'), count = 0;
function check(v, message) { assert(v, message); count++; }
var all = M.catalog(), exceptions = M.notSold(), tools = require('../omega-tools').catalog();
check(all.length === 19, 'nineteen modules');
tools.forEach(function (t) {
  var owners = all.concat(exceptions).filter(function (m) { return m.tools.indexOf(t.key) >= 0; });
  check(owners.length === 1, 'registry ownership: ' + t.key);
  if (t.soon) check(exceptions.indexOf(owners[0]) >= 0, 'soon is not sold: ' + t.key);
});
check(!M.resolve(['lite', 'engineering']).toolAccess.includes('interconnectstudy'), 'Enterprise-only study stays separate');
check(M.resolve(['lite']).caps.indexOf('all') < 0, 'no all capability');
check(M.owners('ov-airender', '').join() === 'plansets', 'AI Render decision');
check(M.owners('', "_guidedPick('compute')").join() === 'compute', 'Compute does not inherit guided Lite');
[[], ['storage'], ['lite', 'logic-plant'], ['lite', 'lite'], ['lite', 'toString'], ['lite', '__proto__'], ['lite', 'unknown'], 'lite'].forEach(function (keys) {
  assert.throws(function () { M.resolve(keys); }); count++;
});
Object.keys(M.starters()).forEach(function (k) { check(M.normalize(M.starters()[k]).includes('lite'), 'starter validates: ' + k); });
var snapshot = M.catalog(); snapshot[0].tools.push('bad'); check(!M.get('lite').tools.includes('bad'), 'callers cannot mutate catalog');
var html = fs.readFileSync('editor.html', 'utf8');
var ribbon = html.slice(html.indexOf('<div id="ribbon">'), html.indexOf('function rbPage'));
/* The static ribbon and File menu: exact handlers, including every flyout.
 * Inputs without a command are presentation controls, not paid launchers. */
var start = html.indexOf('onclick="rbRun(newProject)"');
var end = html.indexOf('<script', html.indexOf('<div id="ribbon">'));
var markup = html.slice(start, end), re = /<button\b([^>]*)>/g, match, staticCount = 0;
while ((match = re.exec(markup))) {
  var attrs = match[1], id = /\bid="([^"]*)"/.exec(attrs), onclick = /\bonclick="([^"]*)"/.exec(attrs);
  if (!onclick) continue;
  var handler = onclick[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"');
  var owners = M.owners(id ? id[1] : '', handler);
  check(owners.length === 1, 'static command owns exactly one: ' + handler + ' => ' + owners); staticCount++;
}
check(staticCount >= 177, 'static scanner must not silently lose the ribbon');
/* Independent source inventory: literal IDs assigned to injected buttons and
 * helper-created ribbon commands. Future unclassified commands fail this test. */
var files = ['editor.html', 'omega-design-ai.js', 'omega-terrain-pack-v2.js'];
var ids = {};
files.forEach(function (file) {
  var source = fs.readFileSync(file, 'utf8');
  var rx = /(?:\b\w+\.id\s*=\s*|\b(?:btn|add|inject|ribbonButton)\([^\n]{0,45})['"]((?:rb-|omega-btn-|ov-ribbon-|ov-model-|omega-terr-btn)[^'"]*)['"]/g, m;
  while ((m = rx.exec(source))) ids[m[1]] = true;
});
Object.keys(ids).forEach(function (id) { check(M.owners(id, '').length === 1, 'injected command: ' + id); });
check(Object.keys(ids).length >= 50, 'dynamic scanner covers all known creation sites');
console.log('Packaging catalog: ' + count + ' passed; ' + tools.length + ' registry tools, ' + staticCount + ' static commands, ' + Object.keys(ids).length + ' injected IDs.');
