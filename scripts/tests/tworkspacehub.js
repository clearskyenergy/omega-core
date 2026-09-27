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
ok('Projects panel names In flight and its page', (function (r) { return r[0].href === '#flight' && r[1].href === '/projects.html'; })(HUB.items('projects', ctxFor({ orgId: 'x' }))));
ok('an unknown area is empty', HUB.items('nope', ctxFor({})).length === 0);

/* 4 · does a workspace hold a module: the one rule the Modules page and
   the marketplace store share */
var MODS = {}; M.catalog().forEach(function (m) { MODS[m.key] = m; });
var ent3 = ctxFor({ orgId: 'x', tierLevel: 3 }, { tierLevel: 3, packaged: false });
ok('Enterprise holds a module whose tools are all open', HUB.moduleState(MODS.storage, ent3) === 'held', HUB.moduleState(MODS.storage, ent3));
ok('Enterprise holds a capabilities-only module (plan sets)', HUB.moduleState(MODS.plansets, ent3) === 'held');
ok('Enterprise without the add-on does not hold Omega Logic', HUB.moduleState(MODS['logic-office'], ent3) === 'ask');
var entLogic = ctxFor({ orgId: 'x', tierLevel: 3, addons: ['omega-logic'] }, { tierLevel: 3, packaged: false });
ok('the omega-logic add-on holds every Logic part', ['logic-office', 'logic-plant', 'logic-customer'].every(function (k) { return HUB.moduleState(MODS[k], entLogic) === 'held'; }));
var std1 = ctxFor({ orgId: 'x', tierLevel: 1 }, { tierLevel: 1, packaged: false });
ok('Standard does not hold a capabilities-only module', HUB.moduleState(MODS.plansets, std1) === 'ask');
var stdStates = M.catalog().map(function (m) { return HUB.moduleState(m, std1); });
ok('Standard holds some modules, is partly on others and asks for the rest', stdStates.indexOf('held') >= 0 && stdStates.indexOf('ask') >= 0, stdStates);
var partly = M.catalog().filter(function (m) { return HUB.moduleState(m, std1) === 'part'; })[0];
if (partly) { var pt = HUB.moduleTools(partly, std1); ok('a partly held module counts its open tools honestly', pt.open > 0 && pt.open < pt.total, pt); }
var pk = ctxFor({ orgId: 'x', tierLevel: 1, modules: ['lite'], packaged: true, toolAccess: ['editor'] }, { packaged: true, modules: ['lite'] });
ok('a packaged workspace holds exactly what its projection lists', HUB.moduleState(MODS.lite, pk) === 'held' && HUB.moduleState(MODS.gridatlas, pk) === 'open');
ok('an unknown module is asked for', HUB.moduleState(null, ent3) === 'ask');
/* Add to plan on a legacy plan (api/_lib/addons.js): what it bought and has on now is held, part by part */
var entBought = ctxFor({ orgId: 'x', tierLevel: 3 }, { tierLevel: 3, packaged: false, addOns: ['logic-office', 'logic-plant'] });
ok('a Logic part bought as an add-on is held; one not bought is still asked for', HUB.moduleState(MODS['logic-office'], entBought) === 'held' && HUB.moduleState(MODS['logic-plant'], entBought) === 'held' && HUB.moduleState(MODS['logic-customer'], entBought) === 'ask');
ok('holdsLogic answers part by part for a legacy plan with add-ons', HUB.holdsLogic(entBought, 'logic-office') && HUB.holdsLogic(entBought, 'logic-plant') && !HUB.holdsLogic(entBought, 'logic-logistics'));
ok('the hub earns the Plant area from a bought part and not Deliver', HUB.compose(entBought).ring.map(function (a) { return a.key; }).indexOf('plant') >= 0 && HUB.compose(entBought).ring.map(function (a) { return a.key; }).indexOf('deliver') < 0, HUB.compose(entBought).ring.map(function (a) { return a.key; }));
var stdBought = ctxFor({ orgId: 'x', tierLevel: 1 }, { tierLevel: 1, packaged: false, addOns: ['plansets'] });
ok('a capabilities-only module bought as an add-on is held on Standard', HUB.moduleState(MODS.plansets, stdBought) === 'held');
var pkIgnores = ctxFor({ orgId: 'x', tierLevel: 1, modules: ['lite'], packaged: true, toolAccess: ['editor'] }, { packaged: true, modules: ['lite'], addOns: ['gridatlas'] });
ok('a packaged workspace is judged by its projection alone, never by add-ons', HUB.moduleState(MODS.gridatlas, pkIgnores) === 'open');
ok('holdsLogic survives a missing context', HUB.holdsLogic(null, 'logic-office') === false);
/* 5 · the store tells the truth about a LEGACY plan (Tommy, 2026-09-27):
   a module is measured by its standalone tools AND what the editor opens of
   it (catalog legacyGates, asked of the editor's own ladder, OmegaCaps).
   Nobody's access changes; only what the store SAYS they hold. */
global.window = global; global.document = { documentElement: {}, body: { setAttribute: function () {}, getAttribute: function () { return null; } }, querySelectorAll: function () { return []; }, addEventListener: function () {}, dispatchEvent: function () {} };
require(path.join(ROOT, 'omega-caps.js'));
var CAPS = global.OmegaCaps;
/* the tier → tool level the tenant's pages read, taken from omega-tenant.js itself (a trial opens every tool) */
var LEVEL = Function('return ' + /var TIER_LEVEL = (\{[^}]+\});/.exec(require('fs').readFileSync(path.join(ROOT, 'omega-tenant.js'), 'utf8'))[1])();
function legacy(tier, billing, org, ws, whiteLabel) {
  var b = Object.assign({ tier: tier }, billing || {});
  var w = Object.assign({ orgId: org || 'x.example', tierLevel: LEVEL[tier] }, ws || {});
  return ctxFor(w, { tierLevel: LEVEL[tier], packaged: false, canCap: HUB.capsFor(b, org || 'x.example', CAPS), billing: b, whiteLabel: whiteLabel || null, visible: function (k) { var t = TOOLS.byKey(k); return !!t && TOOLS.isVisible(t, w); } });
}
function st(key, ctx) { return HUB.moduleState(MODS[key], ctx); }
ok('every catalog module carries legacyGates (the editor\'s gates, read off the editor)', M.catalog().every(function (m) { return Array.isArray(m.legacyGates); }));
ok('capsFor asks the editor\'s own ladder', HUB.capsFor({ tier: 'deluxe' }, 'x.example', CAPS)('export.plotplan') === true && HUB.capsFor({ tier: 'standard' }, 'x.example', CAPS)('export.plotplan') === false);
ok('capsFor reads a missing tier as trial, as the editor does', HUB.capsFor({}, 'x.example', CAPS)('export.blueprint') === false);
ok('without OmegaCaps the page falls back to the tools alone', HUB.capsFor({ tier: 'deluxe' }, 'x', {}) === null && HUB.moduleState(MODS.plansets, std1) === 'ask');
var perf = legacy('deluxe'), core = legacy('standard'), trial = legacy('trial'), ent = legacy('enterprise');
ok('Performance produces plot plans and one-lines in the editor: it holds Plan Sets', st('plansets', perf) === 'held', st('plansets', perf));
ok('Core has Plan Sets\' permit and sheet tools but not the plot plan: partly', st('plansets', core) === 'part', st('plansets', core));
ok('Core\'s Analyze tab is closed: Storage is partly on, not held', st('storage', core) === 'part', st('storage', core));
ok('Performance opens Analyze and every storage tool: held', st('storage', perf) === 'held', st('storage', perf));
ok('Compute\'s editor tab is Enterprise: Core is partly on, even though the compute pages open', st('compute', core) === 'part', st('compute', core));
ok('the Compute add-on on Performance holds Compute', st('compute', legacy('deluxe', { addons: ['compute'] })) === 'held');
ok('the JV carve-out holds Compute for a JV partner on Performance', st('compute', legacy('deluxe', {}, 'sunesol.com')) === 'held');
ok('capTier narrows what the store says, as it narrows the editor', st('plansets', legacy('enterprise', { capTier: 'standard' })) === 'part');
ok('the Permitting matrix opens at every legacy tier (its old gate is on a retired button): held', ['trial', 'standard', 'deluxe'].every(function (t) { return st('permitting', legacy(t)) === 'held'; }));
ok('Enterprise holds every editor module', ['lite', 'gridatlas', 'storage', 'estimate', 'plansets', 'siteintel', 'engineering', 'finance', 'compute', 'ops', 'permitting'].every(function (k) { return st(k, ent) === 'held'; }), ['lite', 'plansets', 'siteintel'].map(function (k) { return k + ':' + st(k, ent); }));
ok('a tool this org can never see (ClearSky\'s own EV workbook) never keeps EV Rebates partly on', st('evrebates', ent) === 'held' && st('evrebates', core) === 'held', [st('evrebates', ent), st('evrebates', core)]);
ok('the note under Partly names both halves, never "4 of 4 of its tools" alone', HUB.moduleNote(MODS.storage, core) === '4 of 4 of its tools and some of its commands in Site Map are on your plan', HUB.moduleNote(MODS.storage, core));
ok('a module with only editor commands says so', HUB.moduleNote(MODS.plansets, core) === 'some of its commands in Site Map are on your plan', HUB.moduleNote(MODS.plansets, core));
ok('one open tool reads "is"', HUB.moduleNote(MODS.sitefinder, core) === '1 of 2 of its tools is on your plan', HUB.moduleNote(MODS.sitefinder, core));
ok('ClearSky\'s own workspace with no tier on record reads as the editor opens it (internal)', HUB.capsFor({}, 'clearsky-usa.com', CAPS)('compute') === true && HUB.capsFor({}, 'clearsky-usa.com', CAPS)('export.plotplan') === true);
ok('a trial opens every tool but only the designer in the editor: Storage is partly on, Plan Sets partly', st('storage', trial) === 'part' && st('plansets', trial) === 'part', [st('storage', trial), st('plansets', trial)]);
ok('Core and Performance hold Lite: its drawing tools (Trace Boundary, Fence & Tie, Move System) live on Draw on every plan, not on the Compute tab', st('lite', perf) === 'held' && st('lite', core) === 'held', [st('lite', perf), st('lite', core)]);
ok('Trial cannot print a blueprint: Lite is partly on', st('lite', trial) === 'part' && HUB.moduleEditor(MODS.lite, trial).open < HUB.moduleEditor(MODS.lite, trial).total);
/* Omega Storefront has no tools and no editor commands: it is on exactly
   where the public storefront's own gate opens it (api/_lib/embed.js
   storefrontEntitled), a staff flag on the tenant record or the add-on,
   never the tier. It used to read "held" wherever the plan opened
   everything, and the storefront then refused that Enterprise tenant. */
ok('Enterprise without the storefront switched on does not hold Omega Storefront (the storefront refuses it)', st('whitelabel', ent) === 'ask' && st('whitelabel', perf) === 'ask' && st('whitelabel', legacy('partner')) === 'ask', [st('whitelabel', ent), st('whitelabel', legacy('partner'))]);
ok('the tenant record switches it on at any tier (whiteLabel.enabled, staff-written)', st('whitelabel', legacy('standard', {}, 'x.example', {}, { enabled: true, platformName: 'Cell' })) === 'held' && st('whitelabel', legacy('enterprise', {}, 'x.example', {}, { enabled: true })) === 'held');
ok('so does the whitelabel add-on', st('whitelabel', legacy('standard', { addons: ['whitelabel'] })) === 'held');
ok('toolOverrides switches it either way, over the flag and the add-on', st('whitelabel', legacy('trial', { toolOverrides: { whitelabel: true } })) === 'held' && st('whitelabel', legacy('enterprise', { addons: ['whitelabel'], toolOverrides: { whitelabel: false } }, 'x.example', {}, { enabled: true })) === 'ask');
ok('a white label that is only painted (a name, not switched on) is not the storefront', st('whitelabel', legacy('deluxe', {}, 'x.example', {}, { platformName: 'Cell' })) === 'ask');
ok('a workspace with no billing record is judged by its tenant record alone', HUB.moduleState(MODS.whitelabel, Object.assign(legacy('trial'), { billing: null, whiteLabel: { enabled: true } })) === 'held');
var E = require(path.join(ROOT, 'api', '_lib', 'embed.js')), cases = 0, differ = [];
[undefined, true, false].forEach(function (ov) { [[], ['whitelabel'], ['WhiteLabel'], ['compute']].forEach(function (ad) { [undefined, true, false, 'yes'].forEach(function (en) { [true, false].forEach(function (hasBilling) {
  var b = hasBilling ? { addons: ad, toolOverrides: ov === undefined ? {} : { whitelabel: ov } } : null, wl = en === undefined ? null : { enabled: en };
  cases++; if (HUB.storefront(b, wl) !== E.storefrontEntitled(b, wl)) differ.push(JSON.stringify([b, wl]));
}); }); }); });
ok('the store\'s storefront rule is the public storefront\'s own, case for case (' + cases + ' cases)', !differ.length, differ.slice(0, 4));
var srcOf = function (f) { return require('fs').readFileSync(path.join(ROOT, f), 'utf8'); };
ok('the workspace, the store and the console hand the storefront gate its inputs', ['workspace.html', 'marketplace.html'].every(function (f) { return /whiteLabel: (WS|ws)\.whiteLabel \|\| null/.test(srcOf(f)) && /billing: (WS|ws)\.billing \|\| \(window\.OmegaTenant/.test(srcOf(f)); }) && /billing: b, whiteLabel: data\.whiteLabel \|\| null/.test(srcOf('admin/package-panel.js')) && /whiteLabel: wl,/.test(srcOf('api/tenant-package.js')));
ok('the public storefront asks the named rule', /if \(!storefrontEntitled\(billing, wl\)\) throw/.test(srcOf('api/_lib/embed.js')));
ok('a nested gate needs every link: the Compute add-on on Core opens parcel screening only where Analyze is open', HUB.moduleEditor(MODS.siteintel, legacy('standard', { addons: ['compute'] })).open === 2 && HUB.moduleEditor(MODS.siteintel, legacy('deluxe', { addons: ['compute'] })).open === 4);
var allow = legacy('enterprise', { toolAccess: ['editor', 'gridatlas'] }, 'x.example', { toolAccess: ['editor', 'gridatlas'] });
var noEditor = legacy('enterprise', {}, 'x.example', { toolAccess: ['gridatlas'] });
ok('an allowlist without the editor opens none of its commands', st('plansets', noEditor) === 'ask' && st('storage', noEditor) === 'ask', [st('plansets', noEditor), st('storage', noEditor)]);
ok('Site Map + Grid Atlas (Clean Cell): Plan Sets opens in the editor, Storage only partly', st('plansets', allow) === 'held' && st('storage', allow) === 'part', [st('plansets', allow), st('storage', allow)]);
ok('Omega Logic is still judged by the add-on alone', st('logic-office', ent) === 'ask');
ok('a packaged workspace is never judged by legacy gates', HUB.moduleState(MODS.plansets, Object.assign({}, perf, { packaged: true, modules: ['lite'] })) === 'open');

M.catalog().forEach(function (m) { ok('module ' + m.key + ' says what it is for, in one sentence, with no price in it', typeof m.blurb === 'string' && m.blurb.length > 40 && !/\$\d/.test(m.blurb), m.blurb); });

console.log('tworkspacehub: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
