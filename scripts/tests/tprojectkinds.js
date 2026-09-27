#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * The editor's Projects list names what KIND of project each row is.
 *
 * Why (Tommy, 2026-09-27): "we dont need BTM or FOM just show all the
 * projects … but they should tell what kind of project they are i.e bess L2
 * DCFC". Every row wore the BESS wizard's market, which every save writes and
 * which defaults to BTM, so a Level 2 job read "BTM", and the list had BTM/FOM
 * tabs that filtered on it. The tabs are gone and a row carries its kinds:
 * what the record declared (type, siteScopes while they agree with it, the EV
 * wizard's L2/EVSE) plus what is on its plan, read by the editor's OWN
 * collectors (evChargerTotals, _findBessPads, derTotals), which now take a
 * saved record as well as the live drawing. Then: "remove the BTM/FOM market
 * field from new project too" — the editor's own New Project dialog asks no
 * market; the BESS wizard asks when it runs.
 *
 * The functions are grabbed straight out of editor.html and run in a vm with
 * the few globals they touch. Static: node, no browser. */
'use strict';
var assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm');
var SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'editor.html'), 'utf8');
var count = 0;
function ok(v, label) { assert.ok(v, label); count++; }
/* arrays made inside the vm carry its realm's prototype; compare the values */
function same(a, b, label) { assert.deepEqual(Array.from(a), b, label + ' — got ' + JSON.stringify(a)); count++; }

function bodyFrom(needle) {
  var hits = [];
  for (var k = SRC.indexOf(needle); k >= 0; k = SRC.indexOf(needle, k + 1)) hits.push(k);
  assert.equal(hits.length, 1, needle + ' appears ' + hits.length + ' times');
  var i = SRC.indexOf('{', hits[0]), d = 0;
  for (;; i++) { if (SRC[i] === '{') d++; else if (SRC[i] === '}') { d--; if (!d) break; } }
  return SRC.slice(hits[0], i + 1);
}
function fn(name) { return bodyFrom('function ' + name + '('); }

/* the PROJECT TYPE block, whole: OmegaProjectTypes is the one type table */
var mark = SRC.indexOf('<!-- ================= PROJECT TYPE =================');
ok(mark > 0, 'the PROJECT TYPE block is in editor.html');
var s0 = SRC.indexOf('<script>', mark) + '<script>'.length, projectTypes = SRC.slice(s0, SRC.indexOf('</script>', s0));

var store = {};
var ctx = {
  console: console,
  document: { getElementById: function () { return null; } },
  localStorage: { getItem: function (k) { return store[k] || null; }, setItem: function (k, v) { store[k] = String(v); } },
  setInterval: function () { return 0; }, setTimeout: function () { return 0; },
  DERC_DC: { dc_cruiser: { label: 'Compute Container (20ft)', kw: 35 } }
};
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(projectTypes, ctx);
vm.runInContext([fn('_eqRole'), fn('derTotals'), fn('_findBessPads'), fn('evChargerTotals'),
  fn('_projKinds'), fn('_projKindLabels'), 'window.evChargerTotals=evChargerTotals;'].join('\n'), ctx);
var PT = ctx.OmegaProjectTypes, labels = ctx._projKindLabels;

/* 1. one type table: every type has a short name, and norm folds every spelling a record carries */
PT.list().forEach(function (t) { ok(typeof t.short === 'string' && t.short.length > 0, t.key + ' has a short name (' + t.short + ')'); });
same([PT.norm('l2'), PT.norm('Level 2'), PT.norm('dcfc'), PT.norm('compute'), PT.norm('microgrid'), PT.norm('other'), PT.norm(null)],
  ['evl2', 'evl2', 'ev', 'datacenter', 'der', null, null], 'norm folds the record vocabularies onto the editor keys');
same([PT.short('evl2'), PT.short('ev'), PT.short('bess'), PT.short('nope')], ['L2', 'DCFC', 'BESS', ''], 'short names by any spelling');

/* 2. what it was declared */
same(labels({ type: 'evl2' }), ['L2'], 'a Level 2 project reads L2');
same(labels({ type: 'dcfc' }), ['DCFC'], 'the New Project dialog\'s dcfc reads DCFC');
same(labels({ type: 'bess', siteScopes: ['bess', 'l2'] }), ['BESS', 'L2'], 'every scope of a mixed site');
same(labels({ type: 'solar', siteScopes: ['der', 'bess'] }), ['Solar', 'BESS'], 'the dialog\'s DER / Solar scope is solar, not a microgrid');
same(labels({ type: 'evl2', siteScopes: ['bess'] }), ['L2'], 'a BESS start the editor re-typed Level 2 is not a BESS project');
same(labels({ type: 'Solar + Storage' }), ['Solar', 'BESS'], 'a combined type is both kinds');
same(labels({ type: 'microgrid', siteScopes: ['microgrid'] }), ['DER'], 'a microgrid reads DER');
same(labels({ type: 'compute' }), ['Data center'], 'compute reads Data center');
same(labels({ type: 'building', siteScopes: ['building'] }), ['Building'], 'a building project');
same(labels({ wizMode: 'L2' }), ['L2'], 'the EV wizard\'s Level 2 mode');
same(labels({ wizMode: 'EVSE' }), ['DCFC'], 'the EV wizard\'s EVSE mode is its DCFC build');

/* 3. BTM / FOM is a market, not a kind; nothing declared and nothing placed is no label */
same(labels({ wizMode: 'BTM' }), [], 'BTM alone is no label');
same(labels({ wizMode: 'FOM', type: 'other' }), [], 'FOM and an "other" type are no label');
same(labels({}), [], 'an empty record is no label');
same(labels(null), [], 'no record is no label');

/* 4. what is on its plan, by the editor's own collectors */
same(labels({ wizMode: 'BTM', elements: [{ type: 'bess-asm' }] }), ['BESS'], 'a guided-build BESS assembly');
same(labels({ shapes: [{ kind: 'bespad' }] }), ['BESS'], 'a hand-drawn BESS pad');
same(labels({ bessList: [{ name: 'BESS-01' }] }), ['BESS'], 'a configured BESS');
same(labels({ shapes: [{ kind: 'evl2', kw: 11 }] }), ['L2'], 'a Level 2 charger drawn from Draw');
same(labels({ elements: [{ type: 'evgear', evKind: 'charger', evLevel: 'L2', units: 2 }] }), ['L2'], 'a guided Level 2 pedestal');
same(labels({ elements: [{ type: 'evgear', evKind: 'charger', kw: 180 }] }), ['DCFC'], 'a guided DCFC unit');
same(labels({ shapes: [{ kind: 'evunit', kw: 480 }] }), ['DCFC'], 'a DCFC unit drawn from Draw');
same(labels({ type: 'ev', elements: [{ type: 'evgear', evKind: 'charger' }, { type: 'evgear', evKind: 'bess' }] }), ['DCFC', 'BESS'], 'a DCFC site with a BESS on its plan');
same(labels({ type: 'solarbess', shapes: [{ kind: 'dersolar', kw: 400 }] }), ['Solar', 'BESS'], 'no kind twice');
same(labels({ shapes: [{ kind: 'dersolar', kw: 400 }] }), ['Solar'], 'a solar array');
same(labels({ shapes: [{ kind: 'derdc', kw: 1000 }] }), ['Data center'], 'a data-center load');
/* saveProject always writes shapes (S.shapes || []), and derTotals reads nothing without it */
same(labels({ shapes: [], elements: [{ type: 'eq', eqId: 'dc_cruiser' }] }), ['Data center'], 'a compute container placed from the palette');
same(labels({ shapes: [null], elements: 'not a list' }), [], 'a malformed record is no label, never a throw');

/* 5. the live drawing still answers when no record is passed, and a record never reads S */
ctx.S = { shapes: [{ kind: 'evl2', kw: 11 }, { kind: 'dersolar', kw: 50 }], elements: [{ type: 'bess-asm' }] };
ok(vm.runInContext('evChargerTotals().l2Units', ctx) === 1, 'evChargerTotals() still reads S');
ok(vm.runInContext('derTotals().solarUnits', ctx) === 1, 'derTotals() still reads S');
ok(vm.runInContext('_findBessPads().length', ctx) === 1, '_findBessPads() still reads S');
same(labels({ type: 'dcfc' }), ['DCFC'], 'a record is read, not the drawing open behind the list');

/* 6. the page: no tabs, no market badge, search finds a kind, Home → Recent says the same */
ok(!/id="proj-tab-/.test(SRC) && SRC.indexOf('setProjTab') < 0, 'the BTM/FOM tabs are gone');
var render = fn('renderProjectsList'), filter = fn('filterProjects'), recent = fn('homeLoadRecent');
ok(render.indexOf('wizMode') < 0 && render.indexOf('_projKindLabels(p)') > 0, 'a row wears its kinds, not the market');
ok(filter.indexOf('wizMode') < 0 && filter.indexOf('_projKindLabels(p)') > 0, 'every project is listed and search finds a kind');
ok(recent.indexOf('p.wizMode') < 0 && recent.indexOf('_projKindLabels(p)') > 0, 'Home → Recent names the same kinds');
/* the editor's own New Project dialog asks no market either: the BESS wizard asks when it runs */
var create = fn('createNewProject');
ok(SRC.indexOf('id="np-market"') < 0 && create.indexOf('np-market') < 0 && !/\bwizMode\s*:/.test(create) && !/\bmarket\s*:/.test(create),
  'New Project has no BTM/FOM market field and creates a project without one');
ok(SRC.indexOf('id="np-offtaker"') > 0 && create.indexOf('np-offtaker') > 0, 'New Project still takes the off-taker');

console.log('project kinds: ' + count + ' checks passed.');
