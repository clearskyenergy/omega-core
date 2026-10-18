/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Guided builds, Project Intelligence, and the Site Plan shell.
 * The layout numbers come from api/_lib/guided-build.js. The page asks
 * for them. It does not carry the block size, the conduit names, or the
 * table packer.
 */
'use strict';
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '../..');

require(path.join(ROOT, 'omega-editor-v2-geom.js'));
require(path.join(ROOT, 'omega-editor-v2-doc.js'));
require(path.join(ROOT, 'omega-project-intelligence.js'));
require(path.join(ROOT, 'omega-guided-build-form.js'));
require(path.join(ROOT, 'omega-editor-v2-hooks.js'));
require(path.join(ROOT, 'omega-editor-v2-reports.js'));
require(path.join(ROOT, 'omega-editor-v2-build.js'));
require(path.join(ROOT, 'omega-editor-v2-analyze.js'));

var G = global.OmegaEditorV2Geom;
var D = global.OmegaEditorV2Doc;
var PI = global.OmegaProjectIntelligence;
var Form = global.OmegaGuidedBuildForm;
var Hooks = global.OmegaEditorV2Hooks;
var Reports = global.OmegaEditorV2Reports;
var Build = global.OmegaEditorV2Build;
var An = global.OmegaEditorV2Analyze;
var GB = require(path.join(ROOT, 'api/_lib/guided-build.js'));
var Score = require(path.join(ROOT, 'api/_lib/editor-score.js'));

var n = 0;
function check(cond, msg) {
  assert.ok(cond, msg);
  n++;
}

/* ── the eight builds ─────────────────────────────────────────────── */
check(Form.ids().join() === 'der,autolayout,bess,topology,l2,dcfc,compute,engineering', 'eight builds, in the ribbon order');
var empty = GB.plan('nope', {});
check(empty.ok === false, 'an unknown build is refused');

var side = Math.sqrt(500 * 1000 / 15);
var one = GB.plan('der', { mw: 0.5, cols: 4, source: 'pv', xfmr: true, pxPerFt: 6, origin: { x: 0, y: 0 } });
check(one.ok && one.summary.blocks === 1 && one.equipment.length === 4 && one.conduits.length === 3, 'half a megawatt of PV is one block, an inverter, a transformer, and a collector');
check(one.equipment[0].w === Math.round(side * 10) / 10, 'the PV block width is the 500 kW footprint');
check(one.equipment[0].h === Math.round(side * 0.6 * 10) / 10, 'the PV block depth is 0.6 of that side');
check(one.equipment[0].derKw === 500 && one.equipment[1].key === 'pcs' && one.equipment[2].key === 'transformer' && one.equipment[3].key === 'poi', 'PV block, inverter, transformer, collector');
var blkH = side * 0.6;
check(one.equipment[1].y === Math.round((blkH + 1) * 10) / 10, 'the inverter sits one foot under the block at 6 px/ft');
check(one.conduits[0].spec === 'RMC-DC' && one.conduits[1].spec === 'RMC-AC' && one.conduits[2].spec === 'RMC-AC', 'DC into the inverter, AC out, AC to the collector');

var five = GB.plan('der', {});
check(five.ok && five.summary.blocks === 10 && five.summary.nameplateMw === 5 && five.equipment.length === 31, 'the default DER build is 5 MW, ten blocks');
var wind = GB.plan('der', { source: 'wind', mw: 1, xfmr: true, origin: { x: 10, y: 20 } });
check(wind.summary.blocks === 10 && wind.equipment[0].w === 70 && wind.equipment[0].x === 10 && wind.equipment[0].y === 20, 'wind is a 70 ft turbine, placed at the origin given');
check(wind.equipment.filter(function (e) { return e.key === 'pcs'; }).length === 0, 'wind has no PV inverter');
var bare = GB.plan('der', { mw: 0.5, xfmr: false });
check(bare.equipment.length === 3 && bare.conduits.length === 0, 'without transformers there is no collector run');
var tooMany = GB.plan('der', { source: 'wind', mw: 20 });
check(tooMany.ok === false && /48/.test(tooMany.reason), 'a build that would drop more than 48 blocks is refused');

var boundary = [{ x: 0, y: 0 }, { x: 420, y: 0 }, { x: 420, y: 280 }, { x: 0, y: 280 }];
var packed = G.fillTables(boundary, [], { mount: 'fixed-ground' });
var auto = GB.plan('autolayout', { boundary: boundary, boundaryId: 'parcel' });
check(auto.ok && auto.summary.kw === packed.kw && auto.summary.tableCount === packed.tableCount, 'auto-layout matches the drawing packer');
check(auto.equipment.length === 1 && auto.equipment[0].type === 'array' && auto.equipment[0].boundaryId === 'parcel', 'auto-layout places one array on that parcel');
check(GB.plan('autolayout', {}).ok === false, 'auto-layout without a parcel is refused');

var btm = GB.plan('bess', { mode: 'btm', kw: 1000, hours: 2, origin: { x: 0, y: 0 } });
check(btm.equipment.map(function (e) { return e.key; }).join() === 'bess,transformer,disco,panel,meter,poi', 'behind the meter is the six-piece chain');
check(btm.equipment[0].kw === 1000 && btm.equipment[0].kwh === 2000, 'two hours at the entered kW');
check(btm.conduits.map(function (c) { return c.spec; }).join() === 'EV-MAIN,MV-UG,MV-UG,EMT-BMS,EV-FEEDER', 'behind-the-meter conduit names');
var fom = GB.plan('bess', { mode: 'fom' });
check(fom.conduits[fom.conduits.length - 1].spec === 'MV-UG', 'front of the meter leaves on MV');
var solar = GB.plan('bess', { mode: 'solar', kw: 500, hours: 4 });
check(solar.equipment[3].key === 'bess' && solar.equipment[3].kwh === 2000, 'solar + storage keeps the battery');
check(solar.conduits.some(function (c) { return c.spec === 'RMC-DC'; }), 'the solar leg is DC');

var topo = GB.plan('topology', { kw: 1000, hours: 2 });
check(topo.equipment.length === 7 && topo.equipment[0].label === 'Point of connection' && topo.equipment[6].label === 'Utility point of interconnection', 'full topology is the seven-node chain');

var l2 = GB.plan('l2', {});
check(l2.summary.stalls === 8 && l2.summary.kwEach === 7.7 && l2.summary.totalKw === 61.6, 'eight Level 2 stalls at 32 A, 240 V');
check(l2.equipment.filter(function (e) { return e.key === 'charger'; }).length === 8, 'one charger symbol per stall');
var l2new = GB.plan('l2', { service: 'new', stalls: 2 });
check(l2new.equipment[0].key === 'poi' && l2new.equipment[1].key === 'transformer', 'a new Level 2 service starts at the utility');

var dcfc = GB.plan('dcfc', {});
check(dcfc.summary.count === 4 && dcfc.summary.kwEach === 150 && dcfc.summary.totalKw === 600 && dcfc.summary.ports === 2, 'four 150 kW chargers, two ports each');
check(dcfc.equipment[0].key === 'poi' && dcfc.equipment.filter(function (e) { return e.level === 'dcfc'; }).length === 4, 'DCFC service then the dispensers');

var comp = GB.plan('compute', {});
check(comp.summary.topo === 'RADIAL' && comp.equipment.length === 10 && comp.equipment[comp.equipment.length - 1].kw === 5000, 'radial compute is ten nodes and 5 MW');
check(comp.equipment[0].key === 'substation' && comp.equipment[comp.equipment.length - 1].key === 'racks', 'substation to racks');
var nobatt = GB.plan('compute', { incBess: false });
check(nobatt.equipment.length === 9 && !nobatt.equipment.some(function (e) { return e.key === 'bess'; }), 'the battery node drops when it is turned off');
var dc800 = GB.plan('compute', { topo: 'DC800' });
check(dc800.equipment.length === 7 && dc800.equipment.some(function (e) { return e.label === 'Solid-state transformer'; }) && !dc800.equipment.some(function (e) { return e.key === 'ups'; }), '800 VDC has no UPS');

var eng = GB.plan('engineering', {});
check(eng.summary.containers === 1 && eng.summary.kw === 1000 && eng.summary.kwh === 2000, 'engineering build defaults to one 1000 kW / 2000 kWh container');
check(eng.equipment.map(function (e) { return e.key; }).join() === 'poi,transformer,panel,pcs,bess,ems', 'engineering order is interconnection, gear, battery, EMS');
check(eng.conduits.some(function (c) { return c.spec === 'EMT-BMS'; }) && eng.conduits.some(function (c) { return c.spec === 'CTRL-PWR'; }), 'the EMS reads the battery and takes control power');
var multi = GB.plan('engineering', { kw: 1000, hours: 2, unitKwh: 500 });
check(multi.summary.containers === 4 && multi.equipment.filter(function (e) { return e.key === 'bess'; }).length === 4, 'containers follow the unit size');

/* placing is one undo */
var state = D.createState(D.create({ name: 'Parcel' }));
state.doc.entities.push({ id: 'parcel', type: 'polygon', layer: 'site', closed: true, pts: boundary });
var before = state.doc.entities.length;
var placed = Build.place(state, auto);
check(placed.ok && D.summary(state.doc).solarKwDc === auto.summary.kw, 'the placed array takes off at the planned kW');
var placedEnt = D.find(state.doc, placed.ids[0]);
check(placedEnt && placedEnt.locked !== true, 'a placed build is an ordinary editable entity');
var derState = D.createState(D.create());
var derPlan = GB.plan('der', { source: 'pv', mw: 0.5, cols: 1, origin: { x: 0, y: 0 } });
Build.place(derState, derPlan);
check(D.summary(derState.doc).solarKwDc === 500, 'a DER solar block takes off as kW-DC');
var windState = D.createState(D.create());
Build.place(windState, GB.plan('der', { source: 'wind', mw: 0.5, cols: 1, origin: { x: 0, y: 0 } }));
check(D.summary(windState.doc).solarKwDc === 0 && D.summary(windState.doc).derKw === 500, 'wind is generation, not solar');
check(state.doc.build && state.doc.build.id === 'autolayout', 'the build is recorded on the project');
D.undo(state);
check(state.doc.entities.length === before && !state.doc.build, 'one undo removes the whole build');

/* the client does not carry the layout rules */
var client = fs.readFileSync(path.join(ROOT, 'omega-editor-v2-build.js'), 'utf8');
check(client.indexOf('blockKw') < 0 && client.indexOf('wPerSqft') < 0 && client.indexOf('EV-MAIN') < 0, 'the browser build file has no block size and no conduit schedule');
check(client.indexOf('/api/guided-build') >= 0, 'the browser asks the server');
var cleared = D.create();
cleared.entities.push({ id: 'parcel', type: 'polygon', layer: 'site', closed: true, pts: boundary });
cleared.entities.push({ id: 'b', type: 'equip', key: 'bess', x: 48, y: 36, w: 28, h: 10, kw: 500, kwh: 1000 });
var where = Build.contextOf(cleared, 6);
check(where.origin.x === 88 && where.origin.y === 20 && where.boundaryId === 'parcel', 'a build starts clear of equipment already on the parcel');

/* ── Project Intelligence, same weights ───────────────────────────── */
var weights = [12, 16, 14, 10, 14, 14, 12, 8].reduce(function (a, b) { return a + b; }, 0);
check(weights === 100 && PI.WEIGHTS.readiness === 0.45 && PI.WEIGHTS.site === 0.35 && PI.WEIGHTS.economics === 0.2, 'readiness 45, site 35, economics 20, checks sum to 100');
var sampleFacts = { address: 'Sample parcel', bessKw: 500, bessKwh: 1000, placedCount: 4, conduitCount: 1, cost: 0, revenue: 0, site: null, designVerified: false };
var hold = PI.model(sampleFacts);
check(hold.ready === 52 && hold.score === 23 && hold.decision === 'HOLD & DE-RISK', 'a drawn site with no cost and no site screen is 23, hold');
check(hold.missing.length === 4, 'cost, revenue, evidence, and verification are the open checks');
var screen = Score.interconnect({ state: 'AZ', sysKW: 500, facts: {} });
check(typeof screen.score === 'number' && screen.anyReal === false, 'the site screen still comes from editor-score');
var withSite = PI.model(Object.assign({}, sampleFacts, { site: screen }));
check(withSite.score === Math.round(52 * 0.45 + screen.pct * 0.35), 'site quality is the server screen, not a second formula');
var pursueFacts = Object.assign({}, sampleFacts, { cost: 1000000, revenue: 200000, net: 1000000, site: { pct: 60, score: 3, anyReal: true, factors: [{ real: true }] }, designVerified: true });
var pursue = PI.model(pursueFacts);
check(pursue.score === 86 && pursue.decision === 'PURSUE' && pursue.missing.length === 0, 'a complete screen at these inputs is 86, pursue');
var gateFacts = Object.assign({}, sampleFacts, { cost: 1000000, revenue: 200000, net: 1000000, site: { pct: 60, score: 3, anyReal: false } });
var gated = PI.model(gateFacts);
check(gated.score === 77 && gated.decision === 'PURSUE' && gated.missing.length === 2, '75 with two checks still open is pursue');
check(pursue.scenarios[1].base === true && Math.abs(pursue.scenarios[1].paybackYears - 5) < 1e-9, 'base-case payback is net divided by year-one value');

global.OmegaFundingReadiness = { score: function () { return { score: 91, decision: 'PURSUE', source: 'funding-readiness', missing: [] }; } };
var gate = PI.fundingReadiness(sampleFacts);
check(gate.score === 91 && gate.source === 'funding-readiness' && gate.ready === true, 'a funding-readiness module replaces the local score');
delete global.OmegaFundingReadiness;
check(PI.fundingReadiness(sampleFacts).source === 'omega-project-intelligence' && PI.fundingReadiness(sampleFacts).ready === false, 'without that module the local score is the gate');

/* facts come off the drawing */
var doc = D.create({ name: 'Sample industrial site', address: 'Sample parcel' });
doc.entities.push({ id: 'b', type: 'equip', key: 'bess', kw: 500, kwh: 1000 });
doc.entities.push({ id: 'c', type: 'conduit', pts: [{ x: 0, y: 0 }, { x: 1, y: 0 }] });
doc.entities.push({ id: 'p', type: 'polygon', pts: boundary });
var facts = An.factsFrom(doc, D.summary(doc));
check(facts.bessKw === 500 && facts.bessKwh === 1000 && facts.conduitCount === 1 && facts.address === 'Sample parcel', 'analyze reads the drawing');
check(An.assess({ doc: doc }).decision === 'HOLD & DE-RISK', 'assess uses those facts');

/* reports print sources and leave blanks */
var rom = Reports.build('rom', facts, doc);
check(rom.pdf.indexOf('%PDF-1.4') === 0 && rom.pdf.indexOf('%%EOF') > 0, 'a report is a PDF');
check(rom.lines.some(function (l) { return l.text.indexOf('500 kW') >= 0; }), 'the ROM names the battery on the drawing');
var cost = Reports.build('cost', facts, doc);
check(cost.lines.some(function (l) { return /not on this drawing/i.test(l.text); }), 'a missing cost is left blank');
var sched = Reports.build('schedule', facts, doc);
check(sched.lines.filter(function (l) { return /not set/.test(l.text); }).length === 6, 'six milestones, no invented dates');
check(Reports.list().length === 7, 'seven reports');
var memo = Reports.build('memo', pursueFacts, doc);
check(memo.lines.some(function (l) { return l.text.indexOf('PURSUE') >= 0; }), 'the memo carries the decision');

/* hooks */
var seen = null;
check(Hooks.register('view3d', function (ctx) { seen = ctx; }) === true, 'the 3D slot accepts a listener');
check(Hooks.invoke('view3d', { doc: doc }) === true && seen && seen.doc === doc, 'the 3D button can hand the drawing over');
check(Hooks.invoke('permit', {}) === false && Hooks.invoke('sld', {}) === false, 'permit and single-line stay empty until someone attaches them');
check(Hooks.register('nope', function () {}) === false, 'unknown slots are refused');

/* the shell stays one bar */
var page = fs.readFileSync(path.join(ROOT, 'editor-v2.html'), 'utf8');
check((page.match(/id="ribbon"/g) || []).length === 1, 'one ribbon');
check((page.match(/id="stages"/g) || []).length === 1, 'one section bar');
var nav = page.slice(page.indexOf('id="stages"'), page.indexOf('</nav>'));
check((nav.match(/<button/g) || []).length === 5, 'five sections');
var ribbon = page.slice(page.indexOf('id="ribbon"'), page.indexOf('id="workspace"'));
var builds = ribbon.match(/data-build="[a-z0-9]+"/g) || [];
check(builds.join() === 'data-build="der",data-build="autolayout",data-build="bess",data-build="topology",data-build="l2",data-build="dcfc",data-build="compute",data-build="engineering"', 'eight build buttons, in the old ribbon order');
check(ribbon.indexOf('id="build-group"') < ribbon.indexOf('<h2>Edit</h2>'), 'Build is the group before Edit');
check(page.indexOf('Start with a guided build') >= 0, 'a blank site says to start with a guided build');
check(page.indexOf('id="btn-run"') > page.indexOf('id="btn-outputs"') && page.indexOf('id="ribbon-end"') > page.indexOf('<h2>View</h2>'), 'Run sits at the right end, beside Outputs');
check(page.indexOf('id="outputs-menu"') >= 0 && page.indexOf('Permit set') >= 0 && page.indexOf('Push to Funding Marketplace') >= 0, 'Outputs is one menu');
check(page.indexOf('id="analyze-close"') >= 0, 'Analyze can close back to the drawing');
check((page.match(/data-act="png"/g) || []).length === 0, 'PNG, PDF, and DXF are not their own ribbon buttons');
check(page.indexOf('id="btn-3d"') >= 0 && page.indexOf('id="btn-permit"') >= 0 && page.indexOf('id="btn-sld"') >= 0, '3D, permit set, and single-line have a button');
check(page.indexOf('data-hook="permit"') >= 0 && page.indexOf('id="outputs-menu"') >= 0, 'permit set lives in the Outputs menu');
check(page.indexOf('api/_lib/guided-build') < 0, 'the page does not ship the planner');
check(page.indexOf('id="next-action"') >= 0 && page.indexOf('id="site-yes"') >= 0 && page.indexOf('id="build-place"') >= 0, 'the core loop has one control per step');
var editor = fs.readFileSync(path.join(ROOT, 'editor.html'), 'utf8');
check(editor.indexOf('omega-editor-v2') < 0 && editor.indexOf('guided-build.js') < 0, 'Site Map is unchanged by this page');

/* Core loop on the sample site, counted as clicks from the loaded drawing:
   1. Does this site work?   2. Yes, build it   3. Place on the site
   4. Run                    5. Quote
   Place is the only step that waits on the server. */
var app = fs.readFileSync(path.join(ROOT, 'omega-editor-v2-app.js'), 'utf8');
check(app.indexOf("label: 'Does this site work?'") >= 0 && app.indexOf("label: 'Run'") >= 0 && app.indexOf("label: 'Quote'") >= 0, 'the next action is one label at a time');

console.log('tguidedbuild: ' + n + ' checks passed');
