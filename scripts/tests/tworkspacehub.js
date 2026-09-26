/* The hub names only tools and modules that exist, and composes honestly.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   omega-workspace-hub.js decides which six areas ring Today on the Omega
   Workspace home. An area is a list of tool keys; a Logic area names a
   module. Both lists are typed by hand, so this asserts every key against
   the REAL catalogs (OMEGATools.catalog(), api/_lib/modules.js) — a tool
   renamed or retired cannot leave a dead cell — and pins the composition
   rules: Today is the centre, Projects and Team are always in the ring,
   an area with nothing open earns no cell, a packaged Lite workspace gets
   exactly Lite's areas, and a workspace holding Omega Logic leads with it.

   node scripts/tests/tworkspacehub.js */
'use strict';
var path = require('path'), ROOT = path.join(__dirname, '..', '..');
var HUB = require(path.join(ROOT, 'omega-workspace-hub.js'));
var TOOLS = require(path.join(ROOT, 'omega-tools.js'));
var M = require(path.join(ROOT, 'api', '_lib', 'modules.js'));
var pass = 0, fail = 0;
function ok(m, c, got) { if (c) { pass++; return; } fail++; console.log('  FAIL ' + m + (got !== undefined ? '  got: ' + JSON.stringify(got) : '')); }

var catalog = TOOLS.catalog(), keys = catalog.map(function (t) { return t.key; });
var moduleKeys = M.catalog().map(function (m) { return m.key; });

/* 1 · every key the table names exists */
HUB.AREAS.forEach(function (a) {
  (a.tools || []).forEach(function (k) { ok('area ' + a.key + ' names a real tool: ' + k, keys.indexOf(k) >= 0); });
  if (a.logic) ok('area ' + a.key + ' names a real module: ' + a.logic, moduleKeys.indexOf(a.logic) >= 0);
  ok('area ' + a.key + ' has a label, an icon and a hint', !!(a.label && a.icon && a.hint));
});
/* every sold, live tool belongs to some area, so nothing bought is unreachable from the hub */
var placed = {}; HUB.AREAS.forEach(function (a) { (a.tools || []).forEach(function (k) { placed[k] = true; }); });
catalog.forEach(function (t) { if (t.soon || t.key === 'intake_admin') return; ok('tool ' + t.key + ' belongs to an area', !!placed[t.key]); });

/* 2 · composition */
function ctxFor(ws, extra) {
  var c = { canOpen: function (k) { var t = TOOLS.byKey(k); return !!t && TOOLS.isUnlocked(t, ws); }, tool: function (k) { return TOOLS.byKey(k); }, modules: ws.modules || [], addons: ws.addons || [], hideMarketplace: !!ws.hideMarketplace };
  Object.keys(extra || {}).forEach(function (k) { c[k] = extra[k]; });
  return c;
}
var ent = HUB.compose(ctxFor({ orgId: 'x', tierLevel: 3 }));
ok('the centre is Today', ent.centre && ent.centre.key === 'today', ent.centre);
ok('the ring holds six', ent.ring.length === 6, ent.ring.map(function (a) { return a.key; }));
ok('Projects leads the ring and Team closes it', ent.ring[0].key === 'projects' && ent.ring[5].key === 'team', ent.ring.map(function (a) { return a.key; }));
ok('an enterprise workspace fills the middle with Design, Grid, Money, Sales', ent.ring.slice(1, 5).map(function (a) { return a.key; }).join() === 'design,grid,money,sales', ent.ring.map(function (a) { return a.key; }));

var none = HUB.compose(ctxFor({ orgId: 'x', toolAccess: [] }));
ok('an empty allowlist leaves only the always-on cells (Projects, Market, Team)', none.ring.map(function (a) { return a.key; }).join() === 'projects,market,team', none.ring.map(function (a) { return a.key; }));
var noMarket = HUB.compose(ctxFor({ orgId: 'x', toolAccess: [], hideMarketplace: true }));
ok('hideMarketplace drops Market when none of its tools are open', noMarket.ring.map(function (a) { return a.key; }).join() === 'projects,team', noMarket.ring.map(function (a) { return a.key; }));

var two = HUB.compose(ctxFor({ orgId: 'x', toolAccess: ['editor', 'gridatlas'] }));
ok('the two-tool product earns Design and Grid and nothing else of the tools', two.ring.map(function (a) { return a.key; }).join() === 'projects,design,grid,market,team', two.ring.map(function (a) { return a.key; }));

var liteTools = M.get('lite').tools.slice();
var lite = HUB.compose(ctxFor({ orgId: 'x', packaged: true, packageAccess: { packaged: true, toolAccess: liteTools, modules: ['lite'] }, modules: ['lite'] }));
ok('a packaged Lite workspace opens Design, Sales, Market and Permits (intake) from Lite\'s tools alone', lite.ring.map(function (a) { return a.key; }).join() === 'projects,design,sales,market,permits,team', lite.ring.map(function (a) { return a.key; }));

var logic = HUB.compose(ctxFor({ orgId: 'x', tierLevel: 3, packaged: false, modules: ['lite', 'logic-office', 'logic-plant', 'logic-logistics'] }));
ok('a workspace holding Omega Logic leads with Orders, Plant and Deliver', logic.ring.map(function (a) { return a.key; }).slice(0, 4).join() === 'projects,orders,plant,deliver', logic.ring.map(function (a) { return a.key; }));
var legacyLogic = HUB.compose(ctxFor({ orgId: 'x', tierLevel: 3, addons: ['omega-logic'] }));
ok('the legacy omega-logic add-on holds every part', legacyLogic.ring.map(function (a) { return a.key; }).slice(1, 4).join() === 'orders,plant,deliver', legacyLogic.ring.map(function (a) { return a.key; }));
var officeOnly = HUB.compose(ctxFor({ orgId: 'x', tierLevel: 3, modules: ['lite', 'logic-office'] }));
ok('Office alone earns Orders and not Plant or Deliver', officeOnly.ring.some(function (a) { return a.key === 'orders'; }) && !officeOnly.ring.some(function (a) { return a.key === 'plant' || a.key === 'deliver'; }), officeOnly.ring.map(function (a) { return a.key; }));

/* 3 · the side panel */
var rows = HUB.items('money', ctxFor({ orgId: 'x', tierLevel: 1 }));
ok('Money lists the Standard sizers open and the Deluxe models locked, open first', rows.length > 3 && !rows[0].locked && rows.some(function (r) { return r.locked; }) && rows.filter(function (r) { return r.locked; }).every(function (r, i, arr) { return rows.indexOf(r) >= rows.length - arr.length; }), rows.map(function (r) { return r.key + (r.locked ? ':locked' : ''); }));
ok('a row carries the catalog\'s name', rows.every(function (r) { return r.name && TOOLS.byKey(r.key).name === r.name; }));
ok('Projects panel names its page', HUB.items('projects', ctxFor({ orgId: 'x' }))[0].href === '/projects.html');
ok('an unknown area is empty', HUB.items('nope', ctxFor({})).length === 0);

console.log('tworkspacehub: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
