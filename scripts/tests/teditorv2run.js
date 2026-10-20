/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * Site Plan's Run: what is drawn goes to the platform's own engines and the
 * answers come back onto the drawing, in the fields the workspace reads.
 * Offline, against the REAL cost engine and the REAL value-stack handler
 * (scripts/_lib/editor-v2-server.js; only sign-in and geocoding stand in).
 * The browser file carries no rate, no dispatch and no IRR rule.
 */
'use strict';
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '../..');
require('../../omega-editor-v2-geom.js');
require('../../omega-editor-v2-assign.js');
var D = require('../../omega-editor-v2-doc.js');
var B = require('../../omega-editor-v2-bridge.js');
var Run = require('../../omega-editor-v2-run.js');
var Server = require('../_lib/editor-v2-server.js').create({ zip: '85201', state: 'AZ' });

var n = 0;
function check(cond, msg) { assert.ok(cond, msg); n++; }

/* A site with a battery, a ground array, a rooftop array, two chargers,
   a meter and a transformer. */
function site() {
  var doc = D.create({ name: 'Run check', address: '29 W Main St, Mesa, AZ 85201', anchor: { lat: 33.41541, lng: -111.83264 } });
  var lot = { id: D.uid('e'), type: 'polygon', layer: 'site', closed: true, pts: [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 200 }, { x: 0, y: 200 }] };
  var roof = { id: D.uid('e'), type: 'polygon', layer: 'site', closed: true, pts: [{ x: 320, y: 0 }, { x: 420, y: 0 }, { x: 420, y: 80 }, { x: 320, y: 80 }] };
  doc.entities.push(lot, roof);
  doc.entities.push({ id: D.uid('e'), type: 'array', layer: 'array', boundaryId: lot.id, mount: 'fixed-ground', setbackFt: 10 });
  doc.entities.push({ id: D.uid('e'), type: 'array', layer: 'array', boundaryId: roof.id, mount: 'rooftop', setbackFt: 3 });
  doc.entities.push({ id: D.uid('e'), type: 'equip', layer: 'equipment', key: 'bess', label: 'BESS', x: 40, y: 30, w: 20, h: 8, rot: 0, kw: 500, kwh: 1000 });
  doc.entities.push({ id: D.uid('e'), type: 'equip', layer: 'equipment', key: 'charger', label: 'L2', x: 10, y: 10, w: 3, h: 2, rot: 0, kw: 11.5 });
  doc.entities.push({ id: D.uid('e'), type: 'equip', layer: 'equipment', key: 'charger', label: 'DCFC', x: 14, y: 10, w: 3, h: 2, rot: 0, kw: 150, level: 'dcfc' });
  doc.entities.push({ id: D.uid('e'), type: 'equip', layer: 'equipment', key: 'meter', label: 'Meter', x: 5, y: 5, w: 2, h: 1.5, rot: 0 });
  doc.entities.push({ id: D.uid('e'), type: 'equip', layer: 'equipment', key: 'transformer', label: 'Transformer', x: 25, y: 5, w: 8, h: 6, rot: 0 });
  return doc;
}

/* ── quantities: the drawing in the cost engine's words ─────────────── */
var doc = site();
var s = D.summary(doc);
var q = Run.quantities(doc);
check(s.bessKw === 500 && s.solarKwDc > 0 && s.chargerCount === 2, 'the check site has a battery, solar and two chargers');
check(q.cost.fleetRating.kw === 500 && q.cost.fleetRating.kwh === 1000 && q.cost.configuredKwh === 1000, 'the battery goes as its rating');
check(q.cost.solar.byMount.ground > 0 && q.cost.solar.byMount.roof > 0 && !q.cost.solar.byMount.canopy, 'a ground array is ground and a rooftop array is roof');
check(Math.abs(q.cost.solar.byMount.ground + q.cost.solar.byMount.roof - s.solarKwDc) < 0.2 && q.cost.solarKwDc === s.solarKwDc, 'the mounts add up to the takeoff');
var kinds = q.cost.ev.items.map(function (it) { return it.kind; }).sort();
check(kinds.join() === 'evdc,evl2', 'a Level 2 charger is evl2 and a DCFC is DC');
check(q.cost.counts.meter === 1 && q.cost.counts.hasXfmr === true, 'the meter and the transformer are counted');
check(Run.MOUNT.carport === 'canopy' && Run.MOUNT['tracker-1ax'] === 'ground', 'a carport is a canopy and a tracker is ground');

/* ── signature: a changed size is a new question; a moved pad is not ── */
var sig = Run.signature(doc);
var moved = JSON.parse(JSON.stringify(doc));
moved.entities.forEach(function (e) { if (e.key === 'bess') e.x += 30; });
check(Run.signature(moved) === sig, 'moving the battery is the same run');
var bigger = JSON.parse(JSON.stringify(doc));
bigger.entities.forEach(function (e) { if (e.key === 'bess') e.kwh = 2000; });
check(Run.signature(bigger) !== sig && Run.isStale(bigger, { sig: sig }) && !Run.isStale(doc, { sig: sig }), 'a bigger battery makes the run stale');
check(Run.siteOf(doc).address === '29 W Main St, Mesa, AZ 85201' && Run.siteOf(doc).lat === 33.41541, 'the site goes as its address and point');
check(Run.siteOf(D.create({ address: 'Sample parcel', anchor: { lat: 1, lng: 2 } })).address === undefined, 'the sample parcel label is not sent as an address');

/* ── the run, against the real engines ────────────────────────────── */
global.window = global;
global.OmegaEditorV2Auth = { idToken: function () { return Promise.resolve('run-check'); } };
global.fetch = function (url, opts) {
  return Server.answer(url, JSON.parse(opts.body)).then(function (r) {
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: function () { return Promise.resolve(r.json); } };
  });
};

Run.run(doc).then(function (out) {
  var f = out.fields;
  var costCall = Server.calls.filter(function (c) { return c.path === '/api/cost-rollup'; })[0];
  var vsCall = Server.calls.filter(function (c) { return c.path === '/api/value-stack'; })[0];
  check(costCall && vsCall && Server.calls.length === 2, 'Run asks the cost engine, then the value stack, once each');
  check(f.costRun && f.costRun.total > 0 && f.costTotal === f.costRun.total, 'the cost engine prices the drawing: $' + (f.costRun && f.costRun.total));
  check(f.costRun.lines.some(function (l) { return l.id === 'bess'; }) && f.costRun.lines.some(function (l) { return l.id === 'solar'; }) && f.costRun.lines.some(function (l) { return l.id === 'ev'; }), 'the estimate names battery, solar and charging lines');
  check(vsCall.body.cost && vsCall.body.cost.capexUsd === f.costTotal, 'the value stack is run against the installed estimate');
  check(vsCall.body.battery.kw === 500 && vsCall.body.battery.kwh === 1000 && vsCall.body.solarKw === s.solarKwDc, 'with the battery and the solar on the drawing');
  var vs = f.valueStack;
  check(vs && vs.streams.length > 0 && vs.streams.every(function (x) { return typeof x.name === 'string' && isFinite(x.usd); }), 'the streams come back named and priced');
  check(vs.streams.every(function (x) { return x.tier === 'computed' || x.tier === 'published' || x.tier === 'planning'; }), 'every stream says whether it is computed, published or planning');
  check(vs.capexUsd === f.costTotal && vs.capexSource === 'site-map', 'the server used the run\'s cost, not its generic model');
  check(vs.irr === null || (vs.irr > -1 && vs.irr < 1), 'the IRR is a fraction or withheld, never invented');
  check(vs.where && vs.where.indexOf('85201') === 0 && vs.tariff && vs.confidence, 'it says which market and tariff it read, and how sure it is');
  check(f.revenueYear1 === vs.owner && f.netCost === vs.netCostUsd, 'year-one value is the owner\'s share; net cost is after incentives');
  check(f.lastRun && f.lastRun.sig === sig && !Object.keys(out.notes).length, 'the run records the drawing it answered, with nothing left undone');

  /* the answers ride the document through save and reopen, and the
     project record carries them in the fields the workspace reads */
  var st = D.createState(doc);
  D.setMeta(st, f);
  var reopened = D.restore(JSON.parse(JSON.stringify(D.serialize(st.doc))));
  check(reopened.costRun && reopened.valueStack && reopened.lastRun && reopened.costTotal === f.costTotal, 'the run survives a save and a reopen');
  var rec = B.project(st.doc);
  check(rec.capex === f.costTotal && rec.capexSource === 'site-plan' && !!rec.capexAt && rec.bessKw === 500 && rec.bessKwh === 1000, 'the project record carries capex the workspace reads');
  check(rec.annualRevenue === vs.owner && rec.incentive === vs.incentiveUsd, 'and the year-one value and the incentive');
  check(B.project(D.create({ name: 'Blank', anchor: { lat: 33.4, lng: -111.8 } })).capex === undefined, 'a drawing that was never run claims no capex');

  /* nothing drawn, nobody signed in, no battery: each says why */
  return Run.run(D.create({ name: 'Empty', anchor: { lat: 33.4, lng: -111.8 } }));
}).then(function (empty) {
  check(empty.notes.all && /Nothing on the drawing/.test(empty.notes.all) && !Object.keys(empty.fields).length, 'an empty drawing runs nothing and says so');
  global.OmegaEditorV2Auth = { idToken: function () { return Promise.resolve(''); } };
  return Run.run(site());
}).then(function (signedOut) {
  check(signedOut.signedOut && /Sign in/.test(signedOut.notes.all) && !Object.keys(signedOut.fields).length, 'signed out, it asks for a sign-in and writes nothing');
  global.OmegaEditorV2Auth = { idToken: function () { return Promise.resolve('run-check'); } };
  var noBattery = site();
  noBattery.entities = noBattery.entities.filter(function (e) { return e.key !== 'bess'; });
  return Run.run(noBattery);
}).then(function (nb) {
  check(nb.fields.costRun && nb.fields.costRun.total > 0 && !nb.fields.valueStack && /battery/.test(nb.notes.value), 'with no battery the cost runs and the value stack says why it did not');

  /* the browser file is a messenger */
  var src = fs.readFileSync(path.join(ROOT, 'omega-editor-v2-run.js'), 'utf8');
  ['BENCH', 'perKwh', 'usdPerWdc', 'discountRate', 'demandCharge', 'irr(', 'simulate('].forEach(function (t) {
    check(src.indexOf(t) < 0, 'no pricing, dispatch or IRR rule in the browser: ' + t);
  });
  var page = fs.readFileSync(path.join(ROOT, 'editor-v2.html'), 'utf8');
  check(page.indexOf('omega-editor-v2-run.js') > page.indexOf('omega-editor-v2-solar.js') && page.indexOf('omega-editor-v2-run.js') < page.indexOf('omega-editor-v2-app.js'), 'the page loads Run before the app');
  check(fs.readFileSync(path.join(ROOT, 'editor.html'), 'utf8').indexOf('omega-editor-v2-run') < 0, 'Site Map is unchanged');
  console.log('teditorv2run: ' + n + ' checks passed');
}).catch(function (e) { console.error(e); process.exit(1); });
