/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * scripts/tests/teditorv2guided.js — a guided build becomes the drawings.
 *
 * The phrases are the facts the old Site Map permit set printed (cover
 * notes, site information, title block, schedule columns, sign legends,
 * scale, north, tags). A guided build has to print every one of them.
 * The gap list is locked too, so a missing sheet cannot be silent.
 */
'use strict';
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var D = require('../../omega-editor-v2-doc.js');
var E = require('../../omega-editor-v2-electrical.js');
var SLD = require('../../omega-editor-v2-sld.js');
var Sheets = require('../../omega-editor-v2-sheets.js');
var Guided = require('../../omega-editor-v2-guided.js');

var n = 0;
function check(cond, msg) {
  assert.ok(cond, msg);
  n++;
}
function eq(a, b, msg) {
  assert.strictEqual(a, b, msg);
  n++;
}

function sheetText(doc) {
  var built = Sheets.build(doc, { size: 'ansi-d', date: '2026-10-18' });
  return {
    built: built,
    text: built.pages.map(function (p) { return Sheets.pageText(p); }).join('\n')
  };
}

function requireCoverage(kind, text) {
  var cov = Guided.coverage(kind, text);
  eq(cov.missing.join(','), '', kind + ' sheets keep the old permit-set facts' + (cov.missing.length ? ' missing ' + cov.missing.join(',') : ''));
}

var GAP_IDS = [
  'satellite', 'sign-artwork', 'structural-pad', 'racking-section', 'fence-section',
  'electrode', 'conduit-fill', 'flood-default', 'manufacturer-default', 'listing-claim',
  'pptx', 'ai-notes', 'manual-sld', 'mv-relay', 'ada-stall', 'existing-survey'
];

eq(Guided.gaps.map(function (g) { return g.id; }).join(','), GAP_IDS.join(','), 'the gap list is the whole list, in order');
Guided.gaps.forEach(function (g) {
  check(g.detail && g.detail.length > 40, 'gap ' + g.id + ' says what is missing and why');
});

['bess', 'dcfc', 'l2', 'pv'].forEach(function (kind) {
  var doc = Guided.apply(null, Guided.examples[kind]());
  var out = sheetText(doc);
  requireCoverage(kind, out.text);
  var model = out.built.model;
  check(model.hasContent, kind + ' drawing has electrical content');
  check(model.ready === true, kind + ' guided build is ready to review: ' + (model.blocks[0] ? model.blocks[0].title : ''));
  var sld = out.built.pages.filter(function (p) { return p.number === 'E-002'; })[0];
  check(!!sld && sld._sld, kind + ' single-line is on E-002');
  eq(SLD.labelHits(sld._sld).length, 0, kind + ' single-line labels do not overlap');
  eq(SLD.orthogonal(sld._sld).length, 0, kind + ' single-line wires are orthogonal');
  check(out.text.indexOf('Flood zone X') < 0, kind + ' does not invent flood zone X');
  check(out.text.indexOf('UL 9540') < 0 && out.text.indexOf('UL1741') < 0 && out.text.indexOf('UL 1741') < 0, kind + ' does not claim a listing the record does not state');
  check(out.text.indexOf('Issued for review. Not sealed.') >= 0, kind + ' set is issued for review');
  var numbers = out.built.pages.map(function (p) { return p.number; });
  ['G-001', 'C-001', 'E-001', 'E-002', 'E-003', 'E-004', 'E-005', 'E-006', 'E-007', 'E-008', 'E-009', 'A-001'].forEach(function (id) {
    check(numbers.indexOf(id) >= 0, kind + ' sheet ' + id);
  });
});

var bessDoc = Guided.apply(null, Guided.examples.bess());
var bess = sheetText(bessDoc);
check(bess.text.indexOf('Reference Cells') >= 0 && bess.text.indexOf('RC-4000') >= 0, 'the battery maker and model come from the build');
check(bess.text.indexOf('Reference Power') >= 0 && bess.text.indexOf('RP-1000') >= 0, 'the PCS maker and model come from the build');
check(bess.text.indexOf('BESS-1') >= 0 && bess.text.indexOf('XFMR-1') >= 0, 'equipment tags are on the set');
check(bess.text.indexOf('123-45-678') >= 0, 'the APN is the one on the build');
check(bess.text.indexOf('G-100') >= 0 && bess.text.indexOf('A. Designer') >= 0 && bess.text.indexOf('B. Checker') >= 0, 'job number and the title-block names are the ones on the build');
check(bess.text.indexOf('Guided Storage LLC') >= 0, 'the customer is the one on the build');
check(bess.text.indexOf('Existing shed') >= 0, 'demolition lists the item the build marked');
check(bess.text.indexOf('Guided 1 MW BESS - 100 Storage Road.') >= 0, 'the cover joins the name and the address with a hyphen the PDF can print');
var bessPdf = Sheets.toPdf(bess.built);
check(bessPdf.indexOf('(Guided 1 MW BESS - 100 Storage Road.)') >= 0, 'the permit PDF prints the address, not a missing glyph');
check(bessPdf.indexOf('BESS ?') < 0, 'the permit PDF does not replace the dash with a question mark');
check(bess.text.indexOf('C-002') >= 0, 'a marked demolition item gets its sheet');
check(bess.text.indexOf('Flood zone: not on the project') >= 0, 'a blank flood zone stays blank');
check(bess.text.indexOf('3 sets of 1000 kcmil') >= 0, 'the 1 MW battery is three parallel sets');
check(bess.text.indexOf('Datasheet not on file.') >= 0, 'a missing datasheet is said, not invented');
check(bess.text.indexOf('Rev 0') >= 0, 'the revision is the one on the drawing');
eq(E.golden(bessDoc).circuits[0].ocpdA, 1600, 'the guided 1 MW battery is a 1600 A device');
eq(E.golden(bessDoc).transformer.nameplateKva, 1500, 'the guided transformer nameplate is 1500 kVA');

var pvDoc = Guided.apply(null, Guided.examples.pv());
var pvNumbers = sheetText(pvDoc).built.pages.map(function (p) { return p.number; });
check(pvNumbers.indexOf('C-002') < 0, 'an empty demolition sheet is not issued');
check(sheetText(pvDoc).text.indexOf('690.8') >= 0, 'the array sheet cites 690.8');

var bareBuild = Guided.examples.bess();
bareBuild.equipment.forEach(function (eq) { eq.mfr = ''; eq.model = ''; });
var bareText = sheetText(Guided.apply(null, bareBuild)).text;
check(bareText.indexOf('Reference Cells') < 0 && bareText.indexOf('RC-4000') < 0, 'a maker is not filled in when the build does not name one');
check(bareText.indexOf('No nameplate fields on the drawing') >= 0, 'a blank nameplate stays blank');

/* Regeneration: a later build replaces only what it stamped. */
bessDoc.entities.push({
  id: 'hand_nail', type: 'text', source: 'field', layer: 'annotation',
  x: 5, y: 5, text: 'Survey nail', h: 2
});
var smaller = Guided.examples.bess();
smaller.equipment.forEach(function (eq) {
  if (eq.key === 'pcs' || eq.key === 'bess') eq.kw = 250;
});
var next = Guided.apply(bessDoc, smaller);
var kept = false, guidedLeft = 0, i, ent;
for (i = 0; i < next.entities.length; i++) {
  ent = next.entities[i];
  if (ent.id === 'hand_nail' && ent.source === 'field') kept = true;
  if (ent.source === 'guided' && ent.text === 'Survey nail') guidedLeft++;
}
check(kept, 'a mark that was not part of the build stays on the drawing');
eq(guidedLeft, 0, 'the survey mark is not rewritten as guided');
var again = sheetText(next);
check(again.text.indexOf('3 sets of 1000 kcmil') < 0, 'the old conductor callout is gone after the build changes');
check(again.text.indexOf('600 kcmil Cu') >= 0, 'the new conductor callout comes from the new ratings');
eq(E.golden(next).circuits[0].ocpdA, 400, '250 kW on the same build is a 400 A device');
check(again.text.indexOf('Existing shed') >= 0, 'the new build still lists the demolition it carries');

var round = D.restore(D.serialize(next));
eq(round.electrical.utility, 'Reference Electric', 'restore keeps the utility the build wrote');
eq(round.electrical.apn, '123-45-678', 'restore keeps the APN');
eq(round.drawing.jobNo, 'G-100', 'restore keeps the job number');
eq(round.drawing.designedBy, 'A. Designer', 'restore keeps designed by');
eq(round.guided.kind, 'bess', 'restore keeps the guided kind');
eq(round.assignment.customerName, 'Guided Storage LLC', 'restore keeps the customer');
var nail = false;
for (i = 0; i < round.entities.length; i++) if (round.entities[i].id === 'hand_nail') nail = true;
check(nail, 'restore keeps the mark the build did not own');
eq(E.golden(round).circuits[0].ocpdA, 400, 'the restored document still sizes the new rating');

var page = fs.readFileSync(path.join(__dirname, '../../editor-v2.html'), 'utf8');
check(page.indexOf('omega-editor-v2-guided.js') >= 0, 'the preview loads the guided-build module');
check(fs.readFileSync(path.join(__dirname, '../../omega-editor-v2-app.js'), 'utf8').indexOf('function applyGuidedBuild') >= 0, 'the editor applies a build onto the open document');
check(fs.readFileSync(path.join(__dirname, '../../editor.html'), 'utf8').indexOf('omega-editor-v2') < 0, 'Site Map is not this preview');

console.log('teditorv2guided: ' + n + ' checks passed');
