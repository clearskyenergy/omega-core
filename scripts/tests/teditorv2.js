/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * scripts/tests/teditorv2.js — Site Plan preview.
 *
 * Geometry, undo, the customer assignment and the project record the
 * current Site Map already reads. The page is exercised separately.
 */
'use strict';
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var G = require('../../omega-editor-v2-geom.js');
var A = require('../../omega-editor-v2-assign.js');
var D = require('../../omega-editor-v2-doc.js');
var B = require('../../omega-editor-v2-bridge.js');
var X = require('../../omega-editor-v2-export.js');
var R = require('../../omega-editor-v2-recovery.js');
var CAD = require('../../cad-kernel.js');

var n = 0;
function check(cond, msg) {
  assert.ok(cond, msg);
  n++;
}

/* ── module density matches Site Map's EAGLE G7B inputs ─────────────── */
var editor = fs.readFileSync(path.join(__dirname, '../../editor.html'), 'utf8');
check(editor.indexOf('widthMm:1134') >= 0 && editor.indexOf('heightMm:2382') >= 0, 'v1 module frame');
check(editor.indexOf('watts:640') >= 0, 'v1 module watts');
check(G.MODULE.wpsf === 22.01, 'W/ft² is 22.01, the same rounding _pvModuleWpsf publishes');
check(editor.indexOf('moduleFill=0.92') >= 0, 'v1 fill factor');
check(editor.indexOf("gcr:0.40") >= 0 && editor.indexOf('tableW:20, tableH:12') >= 0, 'v1 ground table');

/* Hand-worked 80 × 50 ft rectangle, 10 ft setback, 20 × 12 tables.
   One row, two tables, 9.7 kW-DC. */
var boundary = [{ x: 0, y: 0 }, { x: 80, y: 0 }, { x: 80, y: 50 }, { x: 0, y: 50 }];
var lay = G.fillTables(boundary, [], { mount: 'fixed-ground' });
check(lay.ok && lay.tableCount === 2 && lay.rowCount === 1, 'two tables, one row');
check(lay.kw === 9.7, '9.7 kW-DC');
check(lay.kwAc === Math.round(9.7 / 1.25), 'AC at 1.25 DC:AC');
check(lay.pitchFt === 30, 'pitch is table depth / 0.40 GCR');
check(lay.setbackFt === 10, 'ground setback is 10 ft');

/* A building on the second table removes it. */
var blocked = G.fillTables(boundary, [[{ x: 32, y: 10 }, { x: 52, y: 10 }, { x: 52, y: 22 }, { x: 32, y: 22 }]], {});
check(blocked.tableCount === 1 && blocked.kw < lay.kw, 'an obstruction removes the table it covers');

/* Target stops the walk. */
var capped = G.fillTables(boundary, [], { maxKwDc: 5 });
check(capped.tableCount === 1 && capped.targetHit === true, 'a kW target stops the fill');

/* ── setback ─────────────────────────────────────────────────────────── */
var inset = G.offsetPolygon([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 60 }, { x: 0, y: 60 }], 10);
check(inset.ok, 'rectangle insets');
check(Math.abs(G.area(inset.pts) - 3200) < 1, '80 × 40 ft inside a 100 × 60');
var tooFar = G.offsetPolygon(boundary, 40);
check(tooFar.ok === false && /does not fit/.test(tooFar.reason), 'a setback that eats the shape is refused');

/* ── snap, ortho, typed distances ────────────────────────────────────── */
var segs = [{ a: { x: 0, y: 0 }, b: { x: 10, y: 0 } }];
var flags = { grid: true, endpoint: true, midpoint: true, edge: true, angle: false };
function sn(p, extra) {
  var ctx = { flags: flags, segments: segs, gridFt: 1, pxPerFt: 1, tolPx: 0.5 };
  var k;
  for (k in extra) if (extra.hasOwnProperty(k)) ctx[k] = extra[k];
  return G.snap(p, ctx);
}
check(sn({ x: 0.2, y: 0.1 }).kind === 'endpoint' && sn({ x: 0.2, y: 0.1 }).point.x === 0, 'endpoint wins');
check(sn({ x: 5, y: 0.2 }).kind === 'midpoint', 'midpoint');
check(sn({ x: 3, y: 0.4 }).kind === 'edge', 'edge when midpoint is farther than the tolerance');
check(sn({ x: 10.2, y: 4.6 }, { segments: [] }).kind === 'grid' && sn({ x: 10.2, y: 4.6 }, { segments: [] }).point.y === 5, 'grid');
var orth = G.orthoPoint({ x: 0, y: 0 }, { x: 10, y: 1 }, 90);
check(Math.abs(orth.y) < 1e-9 && orth.x > 10, 'ortho keeps the length and drops the rise');
var typed = G.parseEntry('25<90', { x: 1, y: 1 });
check(Math.abs(typed.point.x - 1) < 1e-9 && Math.abs(typed.point.y - 26) < 1e-9, '25<90 is north of the base');
var rel = G.parseEntry('@5,0', { x: 2, y: 3 });
check(rel.point.x === 7 && rel.point.y === 3, 'relative point');
check(G.parseEntry('nope').error, 'a bad entry explains itself');
var nanSnap = G.snap({ x: NaN, y: 1 }, { flags: flags, segments: segs, gridFt: 1, pxPerFt: 1, tolPx: 0.5 });
check(nanSnap.kind === 'free' && isNaN(nanSnap.point.x), 'snap leaves a non-finite point alone');
check(G.coordReadout({ x: 12.5, y: 3 }, true).indexOf('ft') >= 0 && G.coordReadout({ x: 12.5, y: 3 }, true).indexOf('px') < 0, 'a scaled readout says ft');
check(G.coordReadout({ x: 12.5, y: 3 }, false).indexOf('px') >= 0 && G.coordReadout({ x: 12.5, y: 3 }, false).indexOf('ft') < 0, 'an unscaled readout says px');
var cross = [{ a: { x: 0, y: 0 }, b: { x: 10, y: 10 } }, { a: { x: 0, y: 10 }, b: { x: 10, y: 0 } }];
var ix = G.snapCad(CAD, { x: 5.2, y: 5.1 }, cross, { pxPerFt: 1, tolPx: 2 });
check(ix && ix.kind === 'intersection' && Math.abs(ix.point.x - 5) < 0.05, 'object snaps use the architecture kernel');
var nanCad = G.snapCad(CAD, { x: NaN, y: 0 }, cross, {});
check(nanCad.kind === 'free' && isNaN(nanCad.point.x), 'the kernel path does not invent a point from NaN');

/* ── select, align, undo ─────────────────────────────────────────────── */
var st = D.createState(D.create({ name: 'T' }));
var aId = D.add(st, { type: 'rect', layer: 'site', x: 10, y: 10, w: 4, h: 2, rot: 0 });
var bId = D.add(st, { type: 'rect', layer: 'site', x: 30, y: 14, w: 4, h: 2, rot: 0 });
check(st.doc.entities.length === 2, 'two rectangles');
D.align(st, [aId, bId], 'bottom');
var a = D.find(st.doc, aId), b = D.find(st.doc, bId);
check(Math.abs(G.boundsOf(a).minY - G.boundsOf(b).minY) < 1e-6, 'align bottom');
check(D.undo(st) === true && D.find(st.doc, aId).y === 10, 'undo restores the move');
check(D.redo(st) === true, 'redo');
var gid = D.group(st, [aId, bId]);
D.move(st, [aId], 0, 5);
a = D.find(st.doc, aId); b = D.find(st.doc, bId);
check(a.groupId === gid && a.y === 15 && b.y === 15, 'moving one of a group moves both');
D.ungroup(st, [aId]);
check(!D.find(st.doc, aId).groupId && !D.find(st.doc, bId).groupId, 'ungroup');

/* Redo restores the whole document, including a conduit run and the customer.
   The Site Map redo snapshot used to omit trench runs. */
var run = D.createState(D.create({
  name: 'Run',
  assignment: A.assignCustomer(A.empty(), { customerName: 'Northwind' })
}));
D.add(run, { type: 'conduit', layer: 'conduit', pts: [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 8 }], spec: 'RMC' });
D.add(run, { type: 'line', layer: 'site', a: { x: 1, y: 1 }, b: { x: 4, y: 1 } });
check(D.undo(run) === true, 'undo the line');
check(D.redo(run) === true, 'redo the line');
var conduit = null, ri;
for (ri = 0; ri < run.doc.entities.length; ri++) if (run.doc.entities[ri].type === 'conduit') conduit = run.doc.entities[ri];
check(conduit && conduit.pts.length === 3 && conduit.pts[2].y === 8, 'redo puts the conduit run back');
check(run.doc.assignment.customerName === 'Northwind', 'redo keeps the customer on the project');

var ids = G.boxSelect(st.doc.entities, { x: 0, y: 0 }, { x: 100, y: 100 }, false);
check(ids.length === 2, 'window select encloses both');

/* ── customer assignment ─────────────────────────────────────────────── */
var asg = A.assignCustomer(A.empty(), { customerId: 'cust_1', customerName: 'Sample customer' });
asg = A.setStakeholders(asg, [
  { role: 'contact', name: 'Site contact', company: 'Sample customer' },
  { role: 'sales', name: 'Sales', company: 'ClearSky' },
  { role: 'installer', company: 'Sample installer' },
  { role: 'contact', name: '', company: '', email: '' }
]);
check(asg.customerId === 'cust_1' && asg.stakeholders.length === 3, 'blank stakeholder rows are dropped');
var fields = A.toProjectFields(asg);
check(fields.client === 'Sample customer' && fields.assignment.schema === A.SCHEMA, 'legacy client string follows the customer');
var read = A.fromProject({ client: 'Sample customer', assignment: fields.assignment });
check(read.customerId === 'cust_1' && read.clientDrift === false, 'round trip');
var legacy = A.fromProject({ client: 'Acme Widgets' });
check(legacy.customerName === 'Acme Widgets' && legacy.customerId === null, 'a v1 project with only a client name still opens');
var drift = A.fromProject({ client: 'Old name', assignment: fields.assignment });
check(drift.clientDrift === true && drift.customerName === 'Sample customer', 'a drifted list name is reported, the assignment wins');
var threw = false;
try { A.assignCustomer(A.empty(), { customerId: 'has space', customerName: 'No' }); } catch (e) { threw = /letters/.test(e.message); }
check(threw, 'a customer id has to be a CRM record id');
threw = false;
try { A.normalize({ customerName: 'Ok', stakeholders: [{ role: 'owner', name: 'Pat' }] }); } catch (e) { threw = /Role/.test(e.message); }
check(threw, 'only contact, sales and installer');
var ref = A.linkProject({ projectId: 'p_abc', orgId: 'clearsky-usa.com', customerId: 'cust_1' });
check(ref.schema === 'omega.project-ref/1' && ref.orgId === 'clearsky-usa.com' && ref.remoteProjectId === null, 'project ref');

/* ── project record feeds the same fields Site Map sums ─────────────── */
var doc = D.create({
  name: 'West lot',
  address: '1 Example Rd',
  anchor: { lat: 33.4, lng: -112.0 },
  assignment: asg,
  projectId: 'p_testparcel'
});
var parcel = { id: 'parcel', type: 'polygon', layer: 'site', closed: true, pts: boundary };
doc.entities.push(parcel);
doc.entities.push({ id: 'arr', type: 'array', layer: 'array', boundaryId: 'parcel', mount: 'fixed-ground' });
doc.entities.push({ id: 'bat', type: 'equip', layer: 'equipment', key: 'bess', label: 'BESS', x: 20, y: 10, w: 20, h: 8, rot: 0, kw: 500, kwh: 1000 });
doc.entities.push({ id: 'ch', type: 'equip', layer: 'equipment', key: 'charger', label: 'Charger', x: 40, y: 10, w: 3, h: 2, rot: 0, kw: 19.2 });
var rec = B.project(doc);
check(rec.editor === 'v2' && rec.schema === 'omega.project/1', 'record schema');
check(rec.client === 'Sample customer' && rec.assignment.customerId === 'cust_1', 'customer is on the project');
var solarShape = null, si;
for (si = 0; si < rec.shapes.length; si++) if (rec.shapes[si].kind === 'dersolar') solarShape = rec.shapes[si];
check(rec.shapes.length === 2 && solarShape && solarShape.kw === 9.7, 'dersolar.kw is the drawn capacity');
check(solarShape.tableCount === 2 && solarShape.autoLayout === true && solarShape._ppfAt === 2, 'array payload');
check(rec.bessList.length === 1 && rec.bessList[0].kw === 500 && rec.bessList[0].kwh === 1000, 'bessList is what the fleet falls back to');
check(rec.elements[0].type === 'bess-asm' && rec.elements[1].eqId === 'charger', 'equipment kinds Site Map counts');
check(rec.takeoff.solarKwDc === 9.7 && rec.takeoff.bessKw === 500, 'takeoff matches the shapes and the fleet');
check(rec.siteScopes.indexOf('der') >= 0 && rec.siteScopes.indexOf('bess') >= 0 && rec.siteScopes.indexOf('l2') >= 0, 'scopes');
check(rec.type === 'solar', 'type follows the New Project precedence, der before storage');
check(rec.mapState.lat === 33.4 && rec.mapState.pxPerFt === 2 && rec.pxPerFt === 2 && rec.unitLabel === 'ft', 'map anchor and scale');
var back = B.fromRecord(rec);
check(back.projectId === 'p_testparcel' && back.entities.length === 4, 'editorV2 round trip');
check(D.arrayLayout(back, D.find(back, 'arr')).kw === 9.7, 'reopened array still measures 9.7');

/* Scope order is the New Project dialog's, not a second list. */
var np = fs.readFileSync(path.join(__dirname, '../../omega-newproject.js'), 'utf8');
var legacy = [], m, re = /legacy:\s*'([^']+)'/g;
while ((m = re.exec(np))) legacy.push(m[1]);
check(legacy.slice(0, 7).join(',') === B.SCOPE_ORDER.map(function (s) { return s.legacy; }).join(','), 'type precedence matches OmegaNewProject.SCOPES');

var saved = B.withSavedBy(rec, { email: 'rep@clearsky-usa.com', tab: 'tab_1', at: 100, ua: 'test' });
check(saved.savedBy.tab === 'tab_1' && saved.savedBy.at === 100 && saved.savedBy.email === 'rep@clearsky-usa.com', 'savedBy for a drawing write');
threw = false;
try { B.withSavedBy(rec, { email: 'a@b.c' }); } catch (e) { threw = /savedBy/.test(e.message); }
check(threw, 'a drawing save without savedBy is refused here, as the rules refuse it');

/* Hand-entered kW replaces the module count on the shape the run reads. */
doc.entities[1].kwOverride = 50;
var over = B.project(doc);
var overSolar = null;
for (si = 0; si < over.shapes.length; si++) if (over.shapes[si].kind === 'dersolar') overSolar = over.shapes[si];
check(overSolar.kw === 50 && overSolar.kwSource === 'entered' && over.takeoff.solarKwDc === 50, 'an entered kW is what gets saved');

/* ── DXF and PDF ─────────────────────────────────────────────────────── */
var dxf = X.toDxf(doc);
check(dxf.indexOf('LINE') >= 0 && dxf.indexOf('EOF') >= 0 && dxf.indexOf('\n70\n2\n') >= 0, 'DXF in feet');
var imported = X.fromDxf('0\nSECTION\n2\nENTITIES\n0\nLINE\n8\nSite\n10\n0\n20\n0\n11\n25\n21\n0\n0\nENDSEC\n0\nEOF\n');
check(imported.entities.length === 1 && imported.entities[0].b.x === 25, 'DXF line comes back at 25 ft');
var pdf = X.toPdf(doc, over.takeoff);
check(pdf.indexOf('%PDF-1.4') === 0 && pdf.indexOf('%%EOF') > 0, 'PDF');
check(pdf.indexOf('West lot') >= 0 && pdf.indexOf('Sample customer') >= 0, 'PDF names the project and the customer');
check(pdf.indexOf('50 kW-DC') >= 0, 'PDF carries the entered capacity');

/* ── local draft, same rules as the Site Map recovery ───────────────── */
var store = R.memory();
var kept = D.create({ name: 'Kept' });
kept.entities.push({ id: 'e_line', type: 'line', layer: 'site', a: { x: 0, y: 0 }, b: { x: 10, y: 0 } });
var wrote = R.write(store, kept, 5000);
check(wrote.ok === true, 'a draft is stored');
var draft = R.read(store);
check(R.offer(draft, { projectId: draft.projectId, savedAt: null, now: 5000 }).offer === true, 'an unsaved draft is offered');
check(R.offer(draft, { projectId: 'someone-else', savedAt: null, now: 5000 }).reason === 'other-project', 'a draft for another project is not offered');
check(R.offer(draft, { projectId: draft.projectId, savedAt: 5000, now: 6000 }).reason === 'saved-newer', 'a draft older than the save is not offered');
check(R.offer({ v: 1, projectId: 'p', at: 5000, doc: { entities: [] } }, { projectId: 'p', now: 5000 }).reason === 'empty', 'an empty draft is not offered');
check(R.loadKeepsDirty(true) === true && R.loadKeepsDirty(false) === false, 'an edit during load stays dirty');
check(R.shouldWarnOnClose(false, false) === false && R.shouldWarnOnClose(true, false) === true && R.shouldWarnOnClose(false, true) === true, 'close warns for a dirty sheet or a save in flight, not an empty boot');
var huge = D.create({ name: 'Huge' });
var many = [], hi;
for (hi = 0; hi < 80000; hi++) many.push({ x: hi, y: hi });
huge.entities.push({ id: 'e_big', type: 'polyline', layer: 'site', pts: many });
var refused = R.write(store, huge, 9000);
check(refused.ok === false && refused.reason === 'size', 'a draft over 1.5 MB is refused');
check(R.read(store).name === 'Kept', 'a refused draft does not replace the one already stored');
R.drop(store);
check(R.read(store) === null, 'a save drops the draft');

/* The current editor is not this page. */
var page = fs.readFileSync(path.join(__dirname, '../../editor-v2.html'), 'utf8');
check(page.indexOf('omega-editor-v2-app.js') >= 0 && page.indexOf('cad-kernel.js') >= 0 && page.indexOf('omega-editor-v2-recovery.js') >= 0, 'page boots the preview');
check(page.indexOf('id="editor"') < 0, 'preview does not reuse the Site Map root');
check(fs.readFileSync(path.join(__dirname, '../../editor.html'), 'utf8').indexOf('omega-editor-v2') < 0, 'Site Map does not load the preview');

console.log('teditorv2: ' + n + ' checks passed');
