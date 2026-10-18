#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Omega Prime v2, beside the live page.
 *   the seven steps, the readiness score, a source and a date on every figure
 *   the project refuses to exist without a customer, and the customer is the
 *     editor-v2 assignment plus a CRM party link
 *   grid layers are the Grid Atlas list, not a second copy in the page
 *   the pad rule lives on the server
 *   the experience helper is called when it exists and is not invented here
 *   live Prime, its service worker, and config.js are untouched
 */
'use strict';
var assert = require('node:assert/strict');
var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '../..');
var count = 0;
function read(f) { return fs.readFileSync(path.join(ROOT, f), 'utf8'); }
function ok(cond, msg) { assert.ok(cond, msg); count++; }

global.OmegaEditorV2Assign = require(path.join(ROOT, 'omega-editor-v2-assign.js'));
global.OmegaCrmFoundation = require(path.join(ROOT, 'omega-crm-foundation.js'));
global.OmegaPrimeProject = require(path.join(ROOT, 'omega-prime-project.js'));
var V = require(path.join(ROOT, 'omega-prime-v2.js'));
var GL = require(path.join(ROOT, 'omega-grid-layers.js'));
var Fit = require(path.join(ROOT, 'api/_lib/prime-fit.js'));
var H = require(path.join(ROOT, 'api/_lib/hosting-capacity.js'));
var HS = require(path.join(ROOT, 'api/_lib/hosting-screen.js'));
var PP = global.OmegaPrimeProject;
var A = global.OmegaEditorV2Assign;
var C = global.OmegaCrmFoundation;

/* ── path ───────────────────────────────────────────────────────────── */
assert.deepEqual(V.STEPS.map(function (s) { return s.label; }),
  ['Site', 'Grid Atlas', 'Circuit', 'Load', 'Site Map', 'Quote', 'Omega Logic']);
count++;
var blank = V.empty();
assert.equal(V.readiness(blank).score, 0);
assert.equal(V.canOpen(blank, 'atlas'), false);
assert.equal(V.canOpen(blank, 'site'), true);
count += 3;
var full = {
  lat: 41.8, lng: -87.6, geoSrc: 'U.S. Census geocoder', geoAt: '2026-10-18T00:00:00.000Z',
  assignment: { customerName: 'Riverside Logistics' },
  sub: { name: 'Crawford', kv: 138, mi: 0.62, source: 'EIA substations' }, subAt: '2026-10-18T00:00:01.000Z',
  verdict: { version: 'grid-verdict-v1', verdict: { key: 'study', label: 'Needs a study', at: '2026-10-18T00:00:02.000Z' }, circuit: { netKw: 240 } },
  grid: { verdict: { at: '2026-10-18T00:00:02.000Z' } },
  probe: { layerId: 75, rows: [{ refreshed: '2026-09-30' }] },
  circuitUtility: 'comed',
  load: { months: 12, at: '2026-10-18T00:00:03.000Z', demandRate: 19.85, peakKw: 1910, source: 'OMEGA rate book' },
  placed: true,
  conduitFt: 140,
  run: { total: { base: 1140000 }, pricedBy: 'api/price-site' }, runAt: '2026-10-18T00:00:04.000Z'
};
assert.equal(V.readiness(full).score, 100);
assert.equal(V.readiness(full).items.filter(function (i) { return i.on; }).length, 7);
count += 2;
var figs = V.figures(full);
assert.ok(figs.length >= 6);
figs.forEach(function (f) { assert.ok(f.source && f.asOf, JSON.stringify(f)); count++; });
assert.throws(function () { V.cite(12, '', '2026-10-18'); });
assert.throws(function () { V.cite(12, 'a source', ''); });
count += 2;
var line = V.circuitSourceLine(full.verdict, full.probe);
ok(/ComEd hosting-capacity service, resolved at the point \(layer 75\)/.test(line), line);
ok(/BESS_HC/.test(line) && /Feeder_Q/.test(line), line);
ok(/Queue refreshed 2026-09-30/.test(line), line);
ok(/OMEGA grid verdict \(grid-verdict-v1\)/.test(line), line);
ok(/Asked 2026-10-18T00:00:02.000Z/.test(line), line);

/* ── customer, assignment, CRM ──────────────────────────────────────── */
assert.throws(function () { V.attachCustomer(null, { customerName: '  ' }); });
count++;
var held = V.attachCustomer(null, { customerName: 'Riverside Logistics' });
assert.equal(held.customerIdSource, 'prime-v2-local');
assert.equal(held.assignment.customerId, 'c_riverside_logistics');
assert.equal(held.assignment.customerName, 'Riverside Logistics');
count += 3;
var kept = V.attachCustomer(held, { customerName: 'Riverside Logistics', customerId: 'cust_real' });
assert.equal(kept.customerIdSource, 'crm');
assert.equal(kept.assignment.customerId, 'cust_real');
count += 2;
var who = { uid: 'u1', email: 'Rep@ClearSky-USA.com', name: 'Rep', orgId: 'clearsky-usa.com' };
assert.throws(function () {
  V.projectDoc({ addr: 'x', lat: 1, lng: 2, unit: PP.XXL }, who, 'TS');
});
count++;
var st = {
  addr: '3400 S Federal St, Chicago, IL 60616', lat: 41.81522, lng: -87.62261, geoSrc: 'U.S. Census geocoder',
  unit: PP.XXL, assignment: held.assignment, customerIdSource: held.customerIdSource, projectId: 'p_demo1',
  grid: { verdict: { key: 'study' } }, load: { peakKw: 10 }
};
var doc = V.projectDoc(st, who, 'TS');
assert.equal(doc.client, 'Riverside Logistics');
assert.equal(doc.assignment.schema, A.SCHEMA);
assert.equal(doc.assignment.customerId, 'c_riverside_logistics');
assert.equal(doc.projectRef.schema, 'omega.project-ref/1');
assert.equal(doc.projectRef.projectId, 'p_demo1');
assert.equal(doc.projectRef.orgId, 'clearsky-usa.com');
assert.equal(doc.projectRef.customerId, 'c_riverside_logistics');
assert.equal(C.primaryAccount(doc.crm.links, 'project', 'p_demo1'), 'c_riverside_logistics');
assert.equal(doc.prime.v, 2);
assert.equal(doc.prime.route, '/omega-prime-v2');
assert.equal(doc.prime.customerIdSource, 'prime-v2-local');
assert.equal(doc.bessList[0].catalogKey, 'FENECON-IND-XXL');
assert.deepEqual(doc.elements, []);
assert.deepEqual(doc.conduits, []);
assert.equal(doc.orgId, 'clearsky-usa.com');
count += 13;
ok(!('shapes' in doc), 'no forged drawing');

/* ── experience hook ────────────────────────────────────────────────── */
assert.equal(V.experienceRoute({}), null);
assert.equal(V.experienceRoute({ OmegaExperience: { route: function () { return '/omega-prime-v2'; } } }), '/omega-prime-v2');
assert.equal(V.experienceRoute({ OmegaExperience: { route: function () { return '/omega-prime'; } } }), '/omega-prime');
assert.equal(V.experienceRoute({ OmegaExperience: { route: function () { return '/editor-v2'; } } }), null);
assert.equal(V.experienceRoute({ OmegaExperience: { route: function () { throw new Error('down'); } } }), null);
count += 5;
ok(V.EXPERIENCE.helper === 'OmegaExperience.route' && V.EXPERIENCE.key === 'prime', 'the hook names the helper the other release owns');

/* ── layers shared with Grid Atlas, not forked into the page ───────── */
var atlas = read('grid-atlas.html');
var national = read('grid-atlas-national.js');
GL.SUBSTATIONS.urls.forEach(function (u) { ok(atlas.indexOf(u) >= 0 && national.indexOf(u) >= 0, u); });
GL.TRANSMISSION.urls.forEach(function (u) { ok(atlas.indexOf(u) >= 0 && national.indexOf(u) >= 0, u); });
var subsBlock = atlas.slice(atlas.indexOf('substations:'), atlas.indexOf('transmission:'));
ok(subsBlock.indexOf(GL.SUBSTATIONS.urls[0]) >= 0, 'first substation mirror is Grid Atlas\'s');
var page = read('omega-prime-v2.html');
var pageJs = read('omega-prime-v2-page.js');
ok(page.indexOf('services5.arcgis.com') < 0 && pageJs.indexOf('services5.arcgis.com') < 0, 'the page does not carry its own layer hosts');
ok(page.indexOf('/omega-grid-layers.js') > 0 && page.indexOf('/omega-grid-atlas-client.js') > 0, 'shared atlas client and layers');
ok(page.indexOf('/omega-comed-layers.js') > 0 && page.indexOf('/omega-grid-verdict.js') > 0, 'shared circuit path');
ok(page.indexOf('omega-prime-pwa.js') < 0 && page.indexOf('omega-prime-sw.js') < 0, 'v2 does not register the Prime app worker');
ok(page.indexOf('data-experience-hook="OmegaExperience.route"') > 0, 'the hook is on the page');
['CLEAR_LONG_FT', 'needLong', '+ 20', 'xfmrOffsetFt:'].forEach(function (t) {
  ok(page.indexOf(t) < 0 && pageJs.indexOf(t) < 0, 'pad rule leaked into the page: ' + t);
});

/* ── pad and hosting stay server-side ───────────────────────────────── */
var small = Fit.fit({ unit: { lFt: 20, wFt: 8 }, area: { wFt: 10, hFt: 10 } });
assert.equal(small.ok, false);
assert.equal(small.needLongFt, 40);
assert.equal(small.needShortFt, 20);
assert.ok(small.source && small.asOf);
count += 4;
var big = Fit.fit({ unit: { lFt: 20, wFt: 8 }, area: { wFt: 80, hFt: 40 } });
assert.equal(big.ok, true);
assert.equal(big.place.xfmrOffsetFt, 19);
count += 2;
var assumed = Fit.fit({ unit: {}, area: { wFt: 80, hFt: 40 } });
assert.equal(assumed.assumedFootprint, true);
assert.equal(assumed.footprintKnown, false);
count += 2;
assert.throws(function () { Fit.fit({ unit: { lFt: 20, wFt: 8 }, area: { wFt: 0, hFt: 10 } }); });
count++;
assert.equal(H.sourceForState('IL'), null);
assert.equal(H.sourceForState('CA').id, 'pge-grip');
assert.equal(H.sourceForState('MA').id, 'ng-ma-feeder');
assert.equal(H.sourceForState('ny').id, 'ng-ny-feeder');
count += 4;
var screened = HS.screen(H.byId('pge-grip'), { attributes: { FeederId: '123', FeederName: 'Castro', GenCapacity_kW: 800, ICA_Analysis_Date: '2026-10-01' } });
assert.equal(screened.publishedKind, 'generation');
assert.equal(screened.circuit.publishedKw, 800);
assert.equal(screened.circuit.addressResolved, false);
assert.equal(screened.asOf, '2026-10-01');
count += 4;
var pv = HS.screen('ng-ma-feeder', { attributes: { feeder_cdf: 'F1', feeder_max_hc: 1.5, hca_refresh_date: '10/02/2026' } });
assert.equal(pv.publishedKind, 'pv');
assert.equal(pv.circuit.publishedKw, 1500);
count += 2;
ok(read('api/hosting-capacity.js').indexOf("require('./_lib/hosting-capacity')") > 0, 'the route uses the shared registry');
ok(read('api/prime-fit.js').indexOf("require('./_lib/prime-fit')") > 0, 'the pad route uses the server rule');
ok(/ComEd is refused here on purpose/.test(read('api/hosting-capacity.js')), 'ComEd stays on the parcel probe');

/* ── live Prime and the installed app are left alone ────────────────── */
var live = read('omega-prime.html');
ok(live.indexOf('omega-prime-pwa.js') > 0 && live.indexOf('GV.ask(body)') > 0, 'live Prime still runs its own page');
ok(read('omega-prime-sw.js').indexOf("var PAGE = '/omega-prime'") > 0, 'the worker still opens live Prime');
ok(read('config.js').indexOf("var app = /^\\/(office\\/app|plant\\/app|portals\\/customer\\/app|omega-logic)(\\/|\\.html)?$/") > 0, 'the standalone auth path is unchanged');
/* A service-worker scope is a path-prefix match: the next character must
   be end or slash. /omega-prime-v2 is a sibling, so the installed app
   does not control it. /omega-prime/v2 would. */
function controls(scope, pathname) {
  if (pathname === scope) return true;
  if (pathname.indexOf(scope) !== 0) return false;
  return pathname.charAt(scope.length) === '/';
}
ok(controls('/omega-prime', '/omega-prime') && controls('/omega-prime', '/omega-prime/install'), 'the app still owns its routes');
ok(!controls('/omega-prime', '/omega-prime-v2'), 'v2 is outside the installed app');
var sw = read('omega-prime-sw.js');
ok(sw.indexOf('omega-prime-v2') < 0, 'the worker does not name v2');

assert.equal(V.stateOf('3400 S FEDERAL ST, CHICAGO, IL, 60616'), 'IL');
assert.equal(V.stateOf('no zip'), '');
count += 2;

console.log('tprimev2: ' + count + ' assertions passed');
