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
  (a.also || []).concat(a.tools || []).forEach(function (k) { ok('area ' + a.key + ' names a real tool: ' + k, keys.indexOf(k) >= 0); });
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
ok('Finance leads with the financing portal, open on every plan', rows[0].key === 'financing' && !rows[0].locked && TOOLS.byKey('financing').file === '/finance', rows[0]);
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
   Nobody's access changes; only what the store SAYS they hold. ONE rule:
   the Modules page, Plan & billing, the marketplace, the editor's plan
   chip, the admin Package tab and the server's add-on check all ask it
   (2026-09-27: "the modules are paid services tied directly to the
   editor"). */
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
/* Omega Design (lite) is the floor every plan stands on: always held, even
   on a trial that cannot print a blueprint (the editor half still counts it) */
ok('Core and Performance hold Omega Design: its drawing tools (Trace Boundary, Fence & Tie, Move System) live on Draw on every plan, not on the Compute tab', st('lite', perf) === 'held' && st('lite', core) === 'held' && HUB.moduleEditor(MODS.lite, core).open === HUB.moduleEditor(MODS.lite, core).total, HUB.moduleEditor(MODS.lite, core));
ok('Trial cannot print a blueprint, yet Omega Design is held', st('lite', trial) === 'held' && HUB.moduleEditor(MODS.lite, trial).open < HUB.moduleEditor(MODS.lite, trial).total);
/* Omega Storefront has no tools and no editor commands: it is on exactly
   where the public storefront's own gate opens it (api/_lib/storefront.js
   storefrontEntitled, which api/_lib/embed.js asks), a staff flag on the tenant record or the add-on,
   never the tier. It used to read "held" wherever the plan opened
   everything, and the storefront then refused that Enterprise tenant. */
ok('Enterprise without the storefront switched on does not hold Omega Storefront (the storefront refuses it)', st('whitelabel', ent) === 'ask' && st('whitelabel', perf) === 'ask' && st('whitelabel', legacy('partner')) === 'ask', [st('whitelabel', ent), st('whitelabel', legacy('partner'))]);
ok('the tenant record switches it on at any tier (whiteLabel.enabled, staff-written)', st('whitelabel', legacy('standard', {}, 'x.example', {}, { enabled: true, platformName: 'Cell' })) === 'held' && st('whitelabel', legacy('enterprise', {}, 'x.example', {}, { enabled: true })) === 'held');
ok('so does the whitelabel add-on', st('whitelabel', legacy('standard', { addons: ['whitelabel'] })) === 'held');
ok('toolOverrides switches it either way, over the flag and the add-on', st('whitelabel', legacy('trial', { toolOverrides: { whitelabel: true } })) === 'held' && st('whitelabel', legacy('enterprise', { addons: ['whitelabel'], toolOverrides: { whitelabel: false } }, 'x.example', {}, { enabled: true })) === 'ask');
ok('a white label that is only painted (a name, not switched on) is not the storefront', st('whitelabel', legacy('deluxe', {}, 'x.example', {}, { platformName: 'Cell' })) === 'ask');
ok('a workspace with no billing record is judged by its tenant record alone', HUB.moduleState(MODS.whitelabel, Object.assign(legacy('trial'), { billing: null, whiteLabel: { enabled: true } })) === 'held');
var E = require(path.join(ROOT, 'api', '_lib', 'storefront.js')), cases = 0, differ = [];
[undefined, true, false].forEach(function (ov) { [[], ['whitelabel'], ['WhiteLabel'], ['compute']].forEach(function (ad) { [undefined, true, false, 'yes'].forEach(function (en) { [true, false].forEach(function (hasBilling) {
  var b = hasBilling ? { addons: ad, toolOverrides: ov === undefined ? {} : { whitelabel: ov } } : null, wl = en === undefined ? null : { enabled: en };
  cases++; if (HUB.storefront(b, wl) !== E.storefrontEntitled(b, wl)) differ.push(JSON.stringify([b, wl]));
}); }); }); });
ok('the store\'s storefront rule is the public storefront\'s own, case for case (' + cases + ' cases)', !differ.length, differ.slice(0, 4));
var srcOf = function (f) { return require('fs').readFileSync(path.join(ROOT, f), 'utf8'); };
/* every surface judges a legacy workspace through the ONE legacy ctx
   (OmegaWorkspaceHub.legacyCtx), which carries the billing record and the
   tenant record's whiteLabel to the storefront rule */
var lcOn = HUB.legacyCtx({ tools: TOOLS, ws: { orgId: 'x.example', tierLevel: 1, whiteLabel: { enabled: true } }, billing: { tier: 'standard' }, caps: CAPS, who: { orgId: 'x.example' } });
var lcOff = HUB.legacyCtx({ tools: TOOLS, ws: { orgId: 'x.example', tierLevel: 3 }, billing: { tier: 'enterprise' }, caps: CAPS, who: { orgId: 'x.example' } });
var lcArg = HUB.legacyCtx({ tools: TOOLS, ws: { orgId: 'x.example', tierLevel: 1 }, billing: { tier: 'standard' }, whiteLabel: { enabled: true }, caps: CAPS, who: { orgId: 'x.example' } });
ok('the one legacy ctx hands the storefront gate its inputs: the tenant record switches it on, Enterprise alone does not', st('whitelabel', lcOn) === 'held' && st('whitelabel', lcOff) === 'ask' && st('whitelabel', lcArg) === 'held', [st('whitelabel', lcOn), st('whitelabel', lcOff), st('whitelabel', lcArg)]);
ok('the workspace, the store and the console build it with the billing record and the tenant record', /HUB\.legacyCtx\(\{ tools: T, ws: WS, billing: WS\.billing \|\| \(window\.OmegaTenant/.test(srcOf('workspace.html')) && /H\.legacyCtx\(\{ tools: OMEGATools, ws: ws, billing: bl,/.test(srcOf('marketplace.html')) && /billing: data\.billing \|\| null, whiteLabel: data\.whiteLabel \|\| null/.test(srcOf('admin/package-panel.js')) && /whiteLabel: wl,/.test(srcOf('api/tenant-package.js')));
ok('the public storefront asks the named rule', /if \(!SF\.storefrontEntitled\(billing, wl\)\) throw/.test(srcOf('api/_lib/embed.js')));
ok('a nested gate needs every link: the Compute add-on on Core opens parcel screening only where Analyze is open', HUB.moduleEditor(MODS.siteintel, legacy('standard', { addons: ['compute'] })).open === 2 && HUB.moduleEditor(MODS.siteintel, legacy('deluxe', { addons: ['compute'] })).open === 4);
var allow = legacy('enterprise', { toolAccess: ['editor', 'gridatlas'] }, 'x.example', { toolAccess: ['editor', 'gridatlas'] });
var noEditor = legacy('enterprise', {}, 'x.example', { toolAccess: ['gridatlas'] });
ok('an allowlist without the editor opens none of its commands', st('plansets', noEditor) === 'ask' && st('storage', noEditor) === 'ask', [st('plansets', noEditor), st('storage', noEditor)]);
ok('Site Map + Grid Atlas (Clean Cell): Plan Sets opens in the editor, Storage only partly', st('plansets', allow) === 'held' && st('storage', allow) === 'part', [st('plansets', allow), st('storage', allow)]);
ok('Omega Logic is still judged by the add-on alone', st('logic-office', ent) === 'ask');
/* an add-on the editor opens by the module (editorModules: what api/_lib/addons.js
   exact() simulates a purchase with): all of its own commands, whatever gates
   their tab, and not one of another module's that share it */
var coreCompute = Object.assign({}, core, { editorModules: ['compute'] });
ok('an add-on opens every one of its own commands in Site Map', HUB.moduleEditor(MODS.compute, coreCompute).open === HUB.moduleEditor(MODS.compute, coreCompute).total && st('compute', coreCompute) === 'held', HUB.moduleEditor(MODS.compute, coreCompute));
ok('...and nothing of the modules that share its tab', HUB.moduleEditor(MODS.siteintel, coreCompute).open === HUB.moduleEditor(MODS.siteintel, core).open && HUB.moduleEditor(MODS.engineering, coreCompute).open === HUB.moduleEditor(MODS.engineering, core).open);
ok('an allowlist without the editor opens none of an add-on\'s commands either', HUB.moduleEditor(MODS.plansets, Object.assign({}, noEditor, { editorModules: ['plansets'] })).open === 0);
ok('the storefront has no commands to open: the add-on rule changes nothing for it', st('whitelabel', Object.assign({}, perf, { editorModules: ['whitelabel'] })) === 'ask');
ok('a packaged workspace is never judged by legacy gates', HUB.moduleState(MODS.plansets, Object.assign({}, perf, { packaged: true, modules: ['lite'] })) === 'open');
/* the whole ladder on the real catalog: what each legacy plan holds */
function holds(ctx, want) { return M.catalog().filter(function (m) { return HUB.moduleState(m, ctx) === want; }).map(function (m) { return m.key; }).join(); }
ok('Standard holds Omega Design, Omega EV and Omega Permits', holds(core, 'held') === 'lite,evrebates,permitting', holds(core, 'held'));
ok('Standard is partly on nine modules', holds(core, 'part') === 'gridatlas,storage,estimate,plansets,siteintel,engineering,finance,compute,sitefinder', holds(core, 'part'));
ok('Deluxe holds nine and is partly on four', holds(perf, 'held') === 'lite,gridatlas,storage,estimate,evrebates,plansets,ops,permitting,sitefinder' && holds(perf, 'part') === 'siteintel,engineering,finance,compute', [holds(perf, 'held'), holds(perf, 'part')]);
ok('a trial holds Omega Design, Omega EV, Omega Permits and Omega Sites', holds(trial, 'held') === 'lite,evrebates,permitting,sitefinder', holds(trial, 'held'));

/* 5b · editorCtx: the ONE mirror of OmegaCaps.read() every surface asks,
   pure (it asks canWith and never sets the library's own state) */
ok('the editor governs its ladder words and nothing a package invented', typeof CAPS.governs !== 'function' || (CAPS.governs('export.plotplan') && CAPS.governs('compute') && CAPS.governs('schematic') && !CAPS.governs('storage') && !CAPS.governs('gridatlas') && !CAPS.governs('all')));
function viaCtx(billing, who, level) { var c = ctxFor({ orgId: (who && who.orgId) || 'x', tierLevel: level, addons: (billing && billing.addons) || [] }, { tierLevel: level, packaged: false }), e = HUB.editorCtx(CAPS, billing, who); Object.keys(e).forEach(function (k) { c[k] = e[k]; }); return c; }
var trialC = viaCtx({ tier: 'trial' }, { email: 'a@newco.example', orgId: 'newco.example' }, 3);
ok('editorCtx: a trial runs Site Map as trial and is not Enterprise for a module with nothing to count (Omega Storefront)', trialC.tier === 'trial' && trialC.ungated === false && HUB.moduleState(MODS.whitelabel, trialC) === 'ask', [trialC.tier, HUB.moduleState(MODS.whitelabel, trialC)]);
var entC = viaCtx({ tier: 'enterprise' }, { email: 'a@big.example', orgId: 'big.example' }, 3);
ok('editorCtx: Enterprise is ungated and holds Omega Storefront', entC.ungated === true && HUB.moduleState(MODS.whitelabel, entC) === 'held');
var capC = viaCtx({ tier: 'enterprise', capTier: 'standard' }, { email: 'a@big.example', orgId: 'big.example' }, 3);
ok('editorCtx: capTier scopes Site Map below the billed tier, as the editor does', capC.tier === 'standard' && HUB.moduleState(MODS.plansets, capC) !== 'held', [capC.tier, HUB.moduleState(MODS.plansets, capC)]);
var intC = viaCtx(null, { email: 'ann@clearsky-usa.com', emailVerified: true, orgId: 'clearsky-usa.com' }, 3);
ok('editorCtx: a verified ClearSky address with no billing record runs internal, as OmegaCaps.resolve does', intC.tier === 'internal' && intC.ungated && HUB.moduleState(MODS.plansets, intC) === 'held', intC.tier);
var unv = viaCtx(null, { email: 'ann@clearsky-usa.com', emailVerified: false, orgId: 'clearsky-usa.com' }, 3);
ok('editorCtx: an unverified ClearSky address is not internal', unv.tier === 'trial', unv.tier);
var recC = viaCtx({ tier: 'standard' }, { email: 'ann@clearsky-usa.com', emailVerified: true, orgId: 'clearsky-usa.com' }, 1);
ok('editorCtx: a billing record wins over the internal fallback, as in the editor', recC.tier === 'standard', recC.tier);
var staffJudge = HUB.editorCtx(CAPS, { tier: 'deluxe' }, { orgId: 'northstar.example' });
ok('editorCtx: staff judging a tenant by orgId get the tenant\'s tier, never internal', staffJudge.tier === 'deluxe' && staffJudge.canCap('export.plotplan') === true && staffJudge.editorCan('export.plotplan') === true);
ok('editorCtx: the JV carve-out follows the org', HUB.editorCtx(CAPS, { tier: 'deluxe' }, { orgId: 'sunesol.com' }).canCap('compute') === true && HUB.editorCtx(CAPS, { tier: 'deluxe' }, { orgId: 'x.example' }).canCap('compute') === false);
ok('editorCtx: add-ons only widen', HUB.editorCtx(CAPS, { tier: 'standard', addons: ['compute'] }, { orgId: 'x.example' }).canCap('compute') === true);
ok('editorCtx: without the library nothing is counted', HUB.editorCtx(null, {}, {}) === null);
if (CAPS.setOrg && CAPS.org) {
  CAPS.setOrg('me@page.example'); CAPS.setAddons(['engineering']);
  HUB.editorCtx(CAPS, { tier: 'enterprise', addons: ['compute'] }, { orgId: 'sunesol.com' }); HUB.capsFor({ tier: 'deluxe', addons: ['compute'] }, 'sunesol.com', CAPS)('compute');
  ok('editorCtx and capsFor are pure: the page\'s own OmegaCaps org and add-ons are untouched', CAPS.org() === 'page.example' && CAPS.addons().join() === 'engineering', [CAPS.org(), CAPS.addons()]);
  CAPS.setOrg(''); CAPS.setAddons([]);
}
/* legacyCtx: the ONE ctx every legacy surface builds (tools, add-ons, the editor's half) */
var lc = HUB.legacyCtx({ tools: TOOLS, ws: { orgId: 'x.example', tierLevel: LEVEL.standard }, billing: { tier: 'standard' }, caps: CAPS, who: { orgId: 'x.example' } });
ok('legacyCtx judges exactly as the tools, capsFor and visible do', M.catalog().every(function (m) { return HUB.moduleState(m, lc) === HUB.moduleState(m, core); }), M.catalog().map(function (m) { return m.key + ':' + HUB.moduleState(m, lc) + '/' + HUB.moduleState(m, core); }));
var future = Date.now() + 864e5, past = Date.now() - 1000;
var lcAo = HUB.legacyCtx({ tools: TOOLS, ws: { orgId: 'x.example', tierLevel: 3 }, billing: { tier: 'enterprise', addOns: { live: ['logic-office'], accessUntil: future } }, caps: CAPS });
ok('legacyCtx reads the add-ons on now from the record while their access lasts', lcAo.addOns.join() === 'logic-office' && HUB.moduleState(MODS['logic-office'], lcAo) === 'held');
var lcGone = HUB.legacyCtx({ tools: TOOLS, ws: { orgId: 'x.example', tierLevel: 3 }, billing: { tier: 'enterprise', addOns: { live: ['logic-office'], accessUntil: past } }, caps: CAPS });
ok('...and never after it ended', lcGone.addOns.length === 0 && HUB.moduleState(MODS['logic-office'], lcGone) === 'ask');
var lcPend = HUB.legacyCtx({ tools: TOOLS, ws: { orgId: 'x.example', tierLevel: 3 }, billing: { tier: 'enterprise' }, caps: CAPS, canOpen: function () { return false; } });
ok('legacyCtx takes the page\'s own canOpen (nothing opens while a workspace awaits approval)', HUB.moduleState(MODS.gridatlas, lcPend) !== 'held');
/* a workspace judged with no person (the server's add-on check, the admin
   Package tab) reads its record as capsFor does: ClearSky's own workspace
   with no tier on record, or no record at all, runs internal; a person's
   page reads it as the editor resolves for that person */
ok('capsFor: ClearSky\'s own workspace with no record at all runs internal too', HUB.capsFor(null, 'clearsky-usa.com', CAPS)('export.plotplan') === true && HUB.capsFor(null, 'x.example', CAPS)('export.plotplan') === false);
var lcOwn = HUB.legacyCtx({ tools: TOOLS, ws: { orgId: 'clearsky-usa.com', tierLevel: 3 }, billing: null, caps: CAPS, who: { orgId: 'clearsky-usa.com' } });
var lcOwnTier = HUB.legacyCtx({ tools: TOOLS, ws: { orgId: 'clearsky-usa.com', tierLevel: 1 }, billing: { tier: 'standard' }, caps: CAPS, who: { orgId: 'clearsky-usa.com' } });
ok('legacyCtx with no person follows capsFor: internal with no tier on record, the tier when there is one', lcOwn.editorTier === 'internal' && lcOwnTier.editorTier === 'standard' && lcOwn.canCap('export.plotplan') === HUB.capsFor(null, 'clearsky-usa.com', CAPS)('export.plotplan'), [lcOwn.editorTier, lcOwnTier.editorTier]);
var lcGuest = HUB.legacyCtx({ tools: TOOLS, ws: { orgId: 'clearsky-usa.com', tierLevel: 3 }, billing: null, caps: CAPS, who: { email: 'guest@clearsky-usa.com', emailVerified: false, orgId: 'clearsky-usa.com' } });
ok('a person\'s page reads it as the editor resolves for that person: an unverified address is not internal', lcGuest.editorTier === 'trial', lcGuest.editorTier);

/* 6 · one card, one status, at most one action (2026-09-27: "the opt in
   and opt out stuff you need to make that make sense"). Every state the
   Modules page and Plan & billing show comes from moduleCard, in the
   contract's words. */
var stdE = legacy('standard'), delE = legacy('deluxe'), entE = legacy('enterprise'), trialE = legacy('trial');
var PK = function (mods) { return ctxFor({ orgId: 'x', tierLevel: 1, modules: mods, packaged: true, toolAccess: ['editor'] }, { packaged: true, modules: mods }); };
var O = { planName: 'Standard', company: 'Northstar', price: '$250/month', admin: true };
function card(m, ctx, bl, sm, o) { var oo = {}; Object.keys(O).forEach(function (k) { oo[k] = O[k]; }); Object.keys(o || {}).forEach(function (k) { oo[k] = o[k]; }); return HUB.moduleCard(m, ctx, bl || {}, sm || null, oo); }
var c;
c = card(MODS.lite, stdE); ok('Omega Design is live, always included, with no action', c.state === 'included' && c.pill === 'Live · always included' && !c.action, c);
c = card(MODS.gridatlas, PK(['lite', 'gridatlas'])); ok('a packaged held module is Live and offers Opt out', c.state === 'live' && c.pill === 'Live' && c.action.kind === 'remove' && c.action.label === 'Opt out' && c.via === 'package', c);
c = card(MODS.gridatlas, PK(['lite'])); ok('a packaged module not held offers Opt in with its price and the proration', c.state === 'available' && c.pill === 'Not on your plan' && c.action.kind === 'add' && c.action.label === 'Opt in' && c.priceLine === '$250/month' && /Prorated today/.test(c.note), c);
c = card(MODS.gridatlas, PK(['lite']), {}, { gate: { canApply: false, reason: 'Pay your current invoice first.' } }); ok('a closed purchase gate says why and disables Opt in', c.action.disabled === true && c.note === 'Pay your current invoice first.', c);
c = card(MODS.gridatlas, PK(['lite']), {}, { pending: [{ add: ['gridatlas'], display: '$200.00', paymentLink: 'https://qb/pay', expiresOn: '2026-10-20' }] });
ok('an open change invoice reads Waiting for payment, pays on the invoice page and can be cancelled', c.state === 'awaiting' && c.pill === 'Waiting for payment' && c.action.kind === 'pay' && c.action.href === 'https://qb/pay' && c.secondary.label === 'Cancel request' && /switches on when paid · expires unpaid on Oct 20$/.test(c.note), c);
c = card(MODS.gridatlas, PK(['lite']), {}, { payWith: 'Stripe', pending: [{ add: ['gridatlas'], display: '$200.00', paymentLink: 'https://stripe/pay' }] });
ok('a packaged change invoice names the rail the server bills through', c.action.payWith === 'Stripe', c.action);
c = card(MODS.gridatlas, PK(['lite']), { subscription: { modules: ['lite', 'gridatlas'] }, paymentLink: 'https://qb/p' }); ok('bought but not on yet: Pay now, never Opt out and never "Paid"', c.state === 'bought' && c.pill === 'Bought · not on yet' && c.action.kind === 'pay' && !/Paid/.test(c.pill + c.note), c);
c = card(MODS.gridatlas, PK(['lite', 'gridatlas']), { removalRequests: [{ module: 'gridatlas', requestedAt: '2026-09-27T12:00:00Z' }] }, { nextReviewOn: '2026-12-20' });
ok('a queued packaged opt-out stays on and billed until the review, and can be cancelled', c.state === 'removing' && c.pill === 'Opting out' && c.held && /until your review on Dec 20/.test(c.note) && c.action.label === 'Cancel request', c);
c = card(MODS.plansets, delE, { optOuts: { plansets: { status: 'requested', requestedAt: '2026-09-27' } } }); ok('a legacy opt-out is with ClearSky and access is unchanged', c.state === 'removing' && /Requested Sep 27/.test(c.note) && /access is unchanged/.test(c.note) && c.action.kind === 'cancel' && c.via === 'request', c);
c = card(MODS.plansets, delE); ok('a legacy held module reads Included in the plan and offers Opt out', c.state === 'live' && c.priceLine === 'Included in Standard' && c.action.kind === 'remove' && !c.action.via, c);
c = card(MODS.plansets, stdE, { optIns: { plansets: { status: 'requested', requestedAt: '2026-09-27', display: '$500/month' } } }); ok('a legacy opt-in is requested with its price and can be cancelled', c.state === 'requested' && c.pill === 'Opt-in requested' && /at \$500\/month/.test(c.note) && c.action.label === 'Cancel request', c);
c = card(MODS.ops, stdE, { optIns: { ops: { status: 'withdrawn' } } }); ok('a withdrawn opt-in is simply available again', c.state === 'available' && c.action.kind === 'add', c);
c = card(MODS.compute, stdE); ok('partly included: says how much of both halves, offers Opt in for the rest, never Opt out', c.state === 'part' && c.pill === 'Partly included' && c.action.kind === 'add' && /^3 of 3 of its tools and some of its commands in Site Map are on your plan\./.test(c.note) && /adds the rest for \$250\/month/.test(c.note), c);
c = card(MODS.ops, stdE); ok('a legacy module not held is Opt in, priced from the list, and the menu says how it is billed first', c.state === 'available' && /^Adds \$250\/month\./.test(c.note) && /before anything is charged/.test(c.note) && c.action.label === 'Opt in', c);
c = card(MODS.gridatlas, PK(['lite', 'gridatlas']), {}, null, { admin: false }); ok('a member sees the status and who changes it, and no button', c.pill === 'Live' && !c.action && /owner or administrator of Northstar/.test(c.adminLine), c);
c = card(MODS.gridatlas, PK(['lite']), { subscription: { modules: ['lite', 'gridatlas'] }, paymentLink: 'https://qb/p' }, null, { admin: false }); ok('a member may still pay an open invoice', c.action && c.action.kind === 'pay', c);
c = card(MODS.gridatlas, PK(['lite']), {}, null, { pendingApproval: true }); ok('a workspace awaiting approval opens nothing yet', !c.action && /Opens when ClearSky approves Northstar/.test(c.note), c);
/* review #9: a module ON the plan of a workspace awaiting approval offers
   no Opt out either (it would file a request, an audit row and a staff
   mail about a plan ClearSky has not approved) */
c = card(MODS.gridatlas, PK(['lite', 'gridatlas']), {}, null, { pendingApproval: true }); ok('awaiting approval: a packaged module on the plan reads Live and offers no Opt out', c.state === 'live' && !c.action && !c.secondary && /opens when ClearSky approves Northstar/.test(c.note), c);
c = card(MODS.plansets, delE, {}, null, { pendingApproval: true }); ok('awaiting approval: a legacy module on the plan offers no Opt out', c.state === 'live' && !c.action && !c.secondary, c);
ok('awaiting approval: no card on any plan carries an action', [stdE, delE, entE, trialE, PK(['lite']), PK(['lite', 'gridatlas', 'logic-office'])].every(function (cx) { return M.catalog().every(function (m) { var k = card(m, cx, { optIns: { plansets: { status: 'requested' } }, optOuts: { gridatlas: { status: 'requested' } }, addOns: { pending: [{ id: 'addon-1', purpose: 'purchase', add: ['logic-office'], paymentLink: 'https://qb/a' }] } }, { pending: [{ add: ['storage'], paymentLink: 'https://qb/pay' }] }, { pendingApproval: true }); return !k.action && !k.secondary; }); }));
/* review #8: the money column is the bare price on every card; the words
   that say where a held module is billed are in the note (the column is
   nowrap beside the name, and "$1,500/month · in your monthly fee" ran
   past a phone's card edge) */
c = card(MODS.gridatlas, PK(['lite', 'gridatlas'])); ok('a packaged Live module\'s money column is the bare price, the note says it is in the monthly fee', c.priceLine === '$250/month' && /in your monthly fee/.test(c.note), c);
ok('every card\'s money column is short: a price or a few words, never price and words', [stdE, delE, entE, trialE, PK(['lite']), PK(['lite', 'gridatlas', 'estimate', 'engineering', 'siteintel', 'logic-office', 'storage'])].every(function (cx) { return M.catalog().every(function (m) { var k = card(m, cx, {}, null, { price: '$1,500/month' }); return String(k.priceLine).length <= 22 && !/·/.test(k.priceLine); }); }));
/* review #10: ONE precedence. The card carries the record its state rests
   on, and Plan & billing lists what is in flight from the cards; a request
   the plan already answered is never in flight */
c = card(MODS.plansets, stdE, { optIns: { plansets: { status: 'requested', requestedAt: '2026-09-27', display: '$500/month' } } }); ok('a requested opt-in carries its request as the card\'s record', c.state === 'requested' && c.record && c.record.display === '$500/month', c);
c = card(MODS.plansets, delE, { optOuts: { plansets: { status: 'requested', requestedAt: '2026-09-27' } } }); ok('a legacy opt-out carries its request as the card\'s record', c.state === 'removing' && c.record && c.record.requestedAt === '2026-09-27', c);
c = card(MODS.plansets, delE, { optIns: { plansets: { status: 'requested', requestedAt: '2026-09-01' } } }); ok('a stale opt-in (the plan now holds the module) is Live, with no record in flight', c.state === 'live' && !c.record && c.action.kind === 'remove', c);
c = card(MODS.ops, stdE, { optOuts: { ops: { status: 'requested', requestedAt: '2026-09-01' } } }); ok('a stale opt-out (the plan no longer holds the module) is simply on offer, with no record in flight', c.state === 'available' && !c.record && c.action.kind === 'add', c);
c = card(MODS.gridatlas, PK(['lite', 'gridatlas']), { removalRequests: [{ module: 'gridatlas', requestedAt: 5 }] }); ok('a queued packaged opt-out carries the removal as its record', c.state === 'removing' && c.record && c.record.requestedAt === 5, c);
c = card(MODS.gridatlas, PK(['lite']), {}, { pending: [{ add: ['gridatlas'], display: '$200', paymentLink: 'https://qb/pay' }] }); ok('a change invoice is the awaiting card\'s record', c.state === 'awaiting' && c.record && c.record.paymentLink === 'https://qb/pay', c);
c = card(MODS.gridatlas, PK(['lite', 'gridatlas']), {}, { removalRequests: [{ module: 'gridatlas', requestedAt: 7 }] }); ok('the summary\'s removals stand in where billing/current carries none', c.state === 'removing' && c.record.requestedAt === 7, c);
c = card(MODS.plansets, stdE, {}, { optIns: { plansets: { status: 'requested', requestedAt: '2026-09-27' } } }); ok('the summary\'s opt-ins stand in where billing/current carries none', c.state === 'requested', c);
c = card(MODS.gridatlas, PK(['lite']), {}, { subscription: ['lite', 'gridatlas'] }); ok('the summary\'s subscription stands in where billing/current carries none', c.state === 'bought', c);
c = card(MODS.ops, stdE, { optIns: {} }, { optIns: { ops: { status: 'requested' } } }); ok('billing/current\'s own answer wins over the summary\'s', c.state === 'available', c);

/* 6b · a legacy plan's card add-ons (api/_lib/addons.js) are STATES of the
   one card, in the contract's words: Opt in (the menu asks the server for
   the add-on quote first), Waiting for payment with Pay and Cancel request,
   Live with Opt out (it stops at the end of the month paid for), Opting
   out with Cancel request */
var soon = Date.now() + 20 * 864e5;
function withAddOns(tier, live) { var cx = legacy(tier); cx.addOns = live || []; return cx; }
var buying = { addOns: { modules: [], live: [], state: 'awaiting_payment', pending: [{ id: 'addon-abc', purpose: 'purchase', add: ['logic-office'], names: ['Logic Office'], display: '$1,000.00', paymentLink: 'https://qb/addon', payWith: 'QuickBooks', date: '2026-09-27', expiresOn: '2026-10-26' }] } };
c = card(MODS['logic-office'], withAddOns('enterprise'), buying);
ok('an add-on bought by card and not paid yet: Waiting for payment, Pay on its invoice, Cancel request withdraws the purchase', c.state === 'awaiting' && c.pill === 'Waiting for payment' && c.via === 'addon' && c.action.kind === 'pay' && c.action.href === 'https://qb/addon' && c.action.label === 'Pay $1,000.00' && c.action.payWith === 'QuickBooks' && c.secondary.kind === 'cancel' && c.secondary.label === 'Cancel request' && c.secondary.via === 'addon' && c.secondary.addOnId === 'addon-abc' && /\$1,000\.00 invoice · switches on when paid · expires unpaid on Oct 26$/.test(c.note), c);
ok('...and the add-on invoice is the card\'s record', c.record && c.record.kind === 'addon' && c.record.id === 'addon-abc' && c.record.purpose === 'purchase', c.record);
c = card(MODS['logic-office'], withAddOns('enterprise'), { addOns: { pending: [{ id: 'addon-abc', purpose: 'purchase', add: ['logic-office'], display: '$1,000.00' }] } });
ok('an add-on invoice without its pay link yet sends the person to Plan & billing', c.state === 'awaiting' && c.action.kind === 'billing', c);
c = card(MODS['logic-office'], withAddOns('enterprise'), buying, null, { admin: false });
ok('a member may pay an add-on invoice but not cancel it', c.action && c.action.kind === 'pay' && !c.secondary && /owner or administrator/.test(c.adminLine), c);
c = card(MODS['logic-office'], withAddOns('enterprise'), {}, { addOns: buying.addOns });
ok('the summary\'s add-ons stand in where billing/current carries none', c.state === 'awaiting' && c.secondary.addOnId === 'addon-abc', c);
var onNow = { addOns: { modules: ['logic-office'], live: ['logic-office'], state: 'paid', accessUntil: soon, nextInvoiceOn: '2026-10-27', billingDay: 27, pending: [] } };
c = card(MODS['logic-office'], withAddOns('enterprise', ['logic-office']), onNow);
ok('an add-on on now is Live, paid by card, renewing, and Opt out stops it (never the recorded opt-out)', c.state === 'live' && c.pill === 'Live' && c.via === 'addon' && /^Add-on · paid by card, renews on Oct 27\.$/.test(c.note) && c.action.kind === 'remove' && c.action.label === 'Opt out' && c.action.via === 'addon', c);
ok('...its money column is its own price, not "Included in" the plan', c.priceLine === '$250/month', c.priceLine);
var renewing = { addOns: { modules: ['logic-office'], live: ['logic-office'], state: 'past_due', accessUntil: soon, nextInvoiceOn: '2026-11-27', pending: [{ id: 'addon-renewal-2026-10-27', purpose: 'renewal', add: ['logic-office'], display: '$1,000.00', paymentLink: 'https://qb/renew', payWith: 'QuickBooks' }] } };
c = card(MODS['logic-office'], withAddOns('enterprise', ['logic-office']), renewing);
ok('an add-on whose renewal waits for payment stays on, pays, and has no Cancel request or Opt out', c.held && c.pill === 'Waiting for payment' && c.action.kind === 'pay' && c.action.href === 'https://qb/renew' && !c.secondary && c.record.purpose === 'renewal', c);
var stopping = { addOns: { modules: ['logic-office'], live: ['logic-office'], state: 'paid', accessUntil: soon, nextInvoiceOn: '2026-10-27', pending: [], ending: { 'logic-office': { key: 'logic-office', status: 'requested', endsOn: '2026-10-27', requestedAt: '2026-09-27T10:00:00Z' } } } };
c = card(MODS['logic-office'], withAddOns('enterprise', ['logic-office']), stopping);
ok('an add-on opted out of stays on until the month paid for ends, and Cancel request keeps it', c.state === 'removing' && c.pill === 'Opting out' && c.held && c.via === 'addon' && /^Stays on until Oct 27, the end of the month you paid for, and is not renewed\.$/.test(c.note) && c.action.kind === 'cancel' && c.action.label === 'Cancel request' && c.action.via === 'addon-stop', c);
c = card(MODS['logic-office'], withAddOns('enterprise', ['logic-office']), {}, { addOns: { live: ['logic-office'], nextInvoiceOn: '2026-10-27', pending: [], ending: [{ key: 'logic-office', name: 'Logic Office', endsOn: '2026-10-27', requestedAt: '2026-09-27T10:00:00Z' }] } });
ok('the summary\'s list of add-ons ending reads the same', c.state === 'removing' && c.action.via === 'addon-stop', c);
c = card(MODS['logic-office'], withAddOns('enterprise', ['logic-office']), { addOns: { modules: ['logic-office'], live: ['logic-office'], state: 'paid', accessUntil: soon, nextInvoiceOn: '2026-10-27', ending: { 'logic-office': { status: 'withdrawn' } } } });
ok('a withdrawn stop is simply Live again', c.state === 'live' && c.action.via === 'addon', c);
c = card(MODS['logic-office'], withAddOns('enterprise'), { addOns: { modules: ['logic-office'], live: [], state: 'lapsed', pending: [] } });
ok('a lapsed add-on is not on: Opt in again, never "unpaid"', c.state === 'available' && c.action.kind === 'add' && !/unpaid/i.test(c.pill + c.note), c);
c = card(MODS.gridatlas, PK(['lite']), { addOns: buying.addOns });
ok('a packaged workspace never reads legacy add-on states', c.state === 'available' && c.via === 'package', c);
var aoStates = [card(MODS['logic-office'], withAddOns('enterprise'), buying), card(MODS['logic-office'], withAddOns('enterprise', ['logic-office']), onNow), card(MODS['logic-office'], withAddOns('enterprise', ['logic-office']), renewing), card(MODS['logic-office'], withAddOns('enterprise', ['logic-office']), stopping)];
var everyState = aoStates.slice();
[stdE, delE, entE, trialE, PK(['lite']), PK(['lite', 'gridatlas', 'logic-office'])].forEach(function (cx) { M.catalog().forEach(function (m) { everyState.push(card(m, cx)); }); });
everyState.forEach(function (k) {
  ok('card ' + k.key + ' never offers Opt out unless it is Live', !(k.action && k.action.kind === 'remove') || k.state === 'live', k);
  ok('card ' + k.key + ' uses the contract words', !/Subscribe|\bAsk\b|Keep module|Add to plan/.test(k.pill + ' ' + k.note + ' ' + (k.action ? k.action.label : '') + ' ' + (k.secondary ? k.secondary.label : '')), k);
});
ok('the pills are the contract pills', everyState.every(function (k) { return ['Live', 'Live · always included', 'Opting out', 'Waiting for payment', 'Bought · not on yet', 'Opt-in requested', 'Partly included', 'Not on your plan'].indexOf(k.pill) >= 0; }));
ok('a calendar day is that day wherever the reader is', HUB.shortDay('2026-12-20') === 'Dec 20' && HUB.shortDay('2026-01-01') === 'Jan 1' && HUB.shortDay('') === '');

M.catalog().forEach(function (m) { ok('module ' + m.key + ' says what it is for, in one sentence, with no price in it', typeof m.blurb === 'string' && m.blurb.length > 40 && !/\$\d/.test(m.blurb), m.blurb); });

console.log('tworkspacehub: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
