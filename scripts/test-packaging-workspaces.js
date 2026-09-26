/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var assert = require('assert'), fs = require('fs'), vm = require('vm');
var M = require('../api/_lib/modules'), X = require('../api/_lib/package-access');
var count = 0, memory = {}, box = { localStorage: { getItem: function (k) { return memory[k]; }, setItem: function (k, v) { memory[k] = v; } } };
vm.runInNewContext(fs.readFileSync('omega-workspaces.js', 'utf8'), box);
vm.runInNewContext(fs.readFileSync('omega-caps.js', 'utf8'), box);
var W = box.OmegaWorkspaces, C = box.OmegaCaps;
function check(value, msg) { assert(value, msg); count++; }
function equal(actual, expected, msg) { assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected, msg); count++; }
equal(W.normalize('bess', ['bess', 'l2']), ['bess', 'l2'], 'mixed scope union');
equal(W.normalize('solar', ['der', 'bess']), ['solarstorage'], 'existing solar + storage scopes');
equal(W.normalize('legacy-unknown'), [], 'unknown is not guessed');
equal(W.normalize('evl2'), ['l2'], 'saved editor alias');
equal(W.normalize('datacenter'), ['compute'], 'compute alias');
W.setIdentity('alice'); W.setAll(true); W.setIdentity('bob'); check(!W.all(), 'new user never inherits all preference');
W.setAll(false); W.setIdentity('alice'); check(W.all(), 'preference remembered for user'); W.setIdentity(null); check(!W.all(), 'signed out reset');
var packages = [['lite'], M.starters().ev, M.starters().developer, M.starters().epc, M.catalog().map(function (m) { return m.key; })];
var core = ['rbMode(\'select\')', 'rbMode(\'line\')', 'rbMode(\'polyline\')', 'rbMode(\'rect\')', 'rbMode(\'circle\')', 'addTextBox()', 'undoLast()', 'startCal()', 'toggle3D()', 'toggleLayersPanel()', 'openConduitMenu()', 'openMvCableDialog()'];
packages.forEach(function (keys) {
  C.setPackage(X.project({ emailVerified: true }, { packaged: true, packagingState: 'paid', accessUntil: Date.now() + 86400000, modules: keys }, { status: 'active' }, { role: 'owner' }));
  Object.keys(W.presets).forEach(function (workspace) {
    W.setProject(workspace);
    core.forEach(function (handler) { check(W.relevance(handler, '', 'draw') >= 0 && C.allowedCommand('', handler), keys.join(',') + '/' + workspace + ': core ' + handler); });
    check(W.core('', 'rb-redo', 'modify'), 'redo survives ' + workspace);
    check(C.allowedCommand('ov-airender', 'OmegaAIRender.open()') === (keys.indexOf('plansets') >= 0), 'workspace cannot grant AI Render');
  });
});
W.setProject('l2'); check(W.relevance('openBessSizer()', '', 'analyze') < 0, 'L2 focuses out storage');
W.setProject('l2', ['l2','bess']); check(W.relevance('openBessSizer()', '', 'analyze') > 0, 'mixed project restores storage');
W.setProject('compute'); check(W.relevance('openDcClusterDialog()', '', 'compute') > 0, 'compute workspace');
C.setPackage(X.customerDrawing(true)); check(Object.keys(C.MODULE_GRANTS).length === M.catalog().length, 'one projected catalog');
check(C.MODULE_GRANTS.plansets.features.indexOf('AI Render') >= 0, 'AI Render menu source');
C.setPackage(null); check(Object.keys(C.MODULE_GRANTS).length === 0, 'no previous user catalog retained');
M.catalog().forEach(function (m) { check(m.features.length === 3, m.key + ' has three features'); });
console.log('Packaging workspaces: ' + count + ' passed; five packages × seven project types.');
var backfill = require('./backfill-modules');
var seed = { orgId: 'example.com', billing: { tier: 'standard', addons: ['plansets'], toolAccess: ['editor', 'osaportal'] }, effectiveTools: ['editor', 'osaportal'] };
var original = JSON.stringify(seed), report = backfill.plan(seed);
check(report.retainedOutsideCatalog.some(function (r) { return r.tool === 'osaportal'; }), 'JV portal flagged, never silently dropped');
check(report.proposedModules.indexOf('plansets') >= 0, 'existing module add-on carried forward');
check(report.changesApplied === false && report.preservesTrials && report.preservesBillingDates, 'dry run never changes billing');
check(JSON.stringify(seed) === original, 'input billing remains unchanged');
assert.throws(function () { backfill.main(['--apply']); }); count++;
assert.throws(function () { backfill.plan({ orgId: 'example.com', billing: {} }); }); count++;
console.log('Including migration safety: ' + count + ' passed.');
// Run the real empty-state function with a successfully loaded empty array.
// The old length check attempted another fetch forever for a new account.
var editorSource = fs.readFileSync('editor.html', 'utf8'), recentHost = { innerHTML: '' }, fetches = 0;
var recentBox = { window: { _allProjects: [] }, document: { getElementById: function () { return recentHost; } },
  _homeFetchProjects: function () { fetches++; throw new Error('A loaded empty result must not refetch'); } };
var recentStart = editorSource.indexOf('function homeLoadRecent(){'), recentEnd = editorSource.indexOf('window.homeLoadRecent = homeLoadRecent;', recentStart);
vm.runInNewContext(editorSource.slice(recentStart, recentEnd), recentBox);
recentBox.homeLoadRecent(); recentBox.homeLoadRecent();
check(fetches === 0, 'loaded empty Recent panel never refetches');
check(recentHost.innerHTML.indexOf('No recent projects yet') >= 0, 'new account gets an actionable empty state');
console.log('Including empty-project regression: ' + count + ' passed.');
