/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * scripts/tests/teditorv2outputs.js — permit set and single-line.
 *
 * The numbers below are worked from the cited NEC sections. The golden
 * files lock the four reference sites so a later edit cannot quietly
 * change an OCPD, a conductor, or a check.
 */
'use strict';
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var D = require('../../omega-editor-v2-doc.js');
var E = require('../../omega-editor-v2-electrical.js');
var SLD = require('../../omega-editor-v2-sld.js');
var Sheets = require('../../omega-editor-v2-sheets.js');

var n = 0;
function check(cond, msg) {
  assert.ok(cond, msg);
  n++;
}
function eq(a, b, msg) {
  assert.strictEqual(a, b, msg);
  n++;
}

function site(name, electrical, entities) {
  var doc = D.create({
    name: name,
    address: '1 Test Road',
    assignment: { customerName: 'Test customer' }
  });
  doc.electrical = electrical || {};
  (entities || []).forEach(function (e, i) {
    e.id = e.id || ('e' + i);
    e.layer = e.layer || (e.type === 'equip' ? 'equipment' : 'site');
    doc.entities.push(e);
  });
  return doc;
}
function checkById(model, id) {
  var i;
  for (i = 0; i < model.checks.length; i++) if (model.checks[i].id === id) return model.checks[i];
  return null;
}

/* ── 125% continuous, 240.6, 240.4(D), parallel sets ─────────────────── */
var i1000 = E.lineCurrent(1000, 480, 3, 0.95);
eq(Math.round(i1000 * 10) / 10, 1266.1, '1000 kW at 480 V, 3-phase, 0.95 pf is 1266.1 A');
eq(Math.round(i1000 * 1.25 * 10) / 10, 1582.6, '706.31 / 215.3 design current is 125%');

var s14 = E.sizeContinuous(15);
eq(s14.spec, '14 AWG Cu', '240.4(D): 15 A lands on 14 AWG');
eq(s14.ocpdA, 15, '240.6 next standard at 15 A');
eq(s14.egc, '14', 'Table 250.122 at 15 A is 14 AWG');
var s12 = E.sizeContinuous(20);
eq(s12.spec, '12 AWG Cu', '240.4(D): 20 A is 12 AWG, not 14');
eq(s12.ocpdA, 20, '20 A device');
var s10 = E.sizeContinuous(30);
eq(s10.spec, '10 AWG Cu', '240.4(D): 30 A is 10 AWG');
eq(s10.ocpdA, 30, '30 A device');
var s16 = E.sizeContinuous(16);
eq(s16.awg, '12', '16 A cannot stay on 14 AWG');
eq(s16.ocpdA, 20, 'next standard above 16 A is 20 A');

var parallel = E.sizeContinuous(1000);
eq(parallel.sets, 2, '1000 A uses two parallel sets');
check(parallel.awg !== '14' && parallel.awg !== '12' && parallel.awg !== '10' && parallel.awg !== '8' && parallel.awg !== '6' && parallel.awg !== '4' && parallel.awg !== '3' && parallel.awg !== '2' && parallel.awg !== '1', '310.10(G) parallel starts at 1/0');
eq(parallel.spec, '2 sets of 900 kcmil Cu', 'smallest 75°C copper that carries 1000 A in two sets');
eq(parallel.ocpdA, 1000, '240.6 rating at 1000 A');
eq(parallel.egc, '2/0', 'Table 250.122 at 1000 A is 2/0');

var nextHigher = E.sizeContinuous(225.5);
eq(nextHigher.spec, '4/0 AWG Cu', '4/0 ampacity is 230 A');
eq(nextHigher.ocpdA, 250, '240.4(B) next standard size at 800 A and below');
eq(nextHigher.nextHigher, true, 'the next-higher rule is named, not hidden');

var tooBig = E.sizeContinuous(7000);
check(tooBig.error && /6000/.test(tooBig.error), 'past 240.6(A) 6000 A is an error, not a made-up device');

var drop = E.voltageDrop(100, 100, 4110, 240, 1);
eq(drop.volts, 62.8, 'single-phase drop uses 2 × 12.9 × I × L / cm');
eq(drop.pct, 26.2, 'percent of 240 V');

/* ── interconnection ─────────────────────────────────────────────────── */
var pass120 = E.analyze(site('120', { voltage: 480, phases: 3, pf: 0.95, method: 'auto', busA: 400, mainA: 400 }, [
  { type: 'equip', key: 'pcs', kw: 5, x: 10, y: 10, w: 4, h: 4 },
  { type: 'equip', key: 'bess', kw: 5, kwh: 20, x: 20, y: 10, w: 8, h: 4 }
]));
eq(pass120.interconnect.method, '120', 'auto steps to 705.12(B)(2) when the 100% rule fails');
eq(pass120.interconnect.ok, true, '400 A main + 125% of a 5 kW source fits 120% of a 400 A bus');
eq(pass120.interconnect.sumA, 408, 'the sum is the main plus 125% of source current');
eq(pass120.interconnect.cite, 'NEC 2023 705.12(B)(2)', '120% rule citation');
eq(pass120.ready, true, 'a passing 120% rule is ready');
check(pass120.blocks.length === 0, 'no blocking check');

var fail120 = E.analyze(site('fail', { voltage: 480, phases: 3, pf: 0.95, method: 'auto', busA: 100, mainA: 100 }, [
  { type: 'equip', key: 'pcs', kw: 50, x: 10, y: 10, w: 4, h: 4 },
  { type: 'equip', key: 'bess', kw: 50, kwh: 100, x: 20, y: 10, w: 8, h: 4 }
]));
eq(fail120.interconnect.method, '120', '120% is the rule that was tried');
eq(fail120.interconnect.ok, false, 'the bus does not accept the source');
eq(fail120.ready, false, 'a failed bus rule is not ready');
eq(fail120.blocks[0].id, 'nec705', 'the block is the interconnection');
eq(fail120.blocks[0].cite, 'NEC 2023 705.12(B)', '705.12(B) is the citation');
eq(E.readiness(fail120 && site('fail', { voltage: 480, phases: 3, pf: 0.95, method: 'auto', busA: 100, mainA: 100 }, [
  { type: 'equip', key: 'pcs', kw: 50, x: 10, y: 10, w: 4, h: 4 },
  { type: 'equip', key: 'bess', kw: 50, kwh: 100, x: 20, y: 10, w: 8, h: 4 }
])).summary, 'Not ready. The bus rating does not accept this source', 'one sentence, the first block');

var supplySmall = E.analyze(site('tap', { voltage: 480, phases: 3, pf: 0.95, method: 'supply' }, [
  { type: 'equip', key: 'pcs', kw: 1, x: 10, y: 10, w: 4, h: 4 },
  { type: 'equip', key: 'bess', kw: 1, kwh: 2, x: 20, y: 10, w: 8, h: 4 }
]));
eq(supplySmall.circuits[0].spec, '14 AWG Cu', 'a 1 kW source sizes to 14 AWG');
eq(supplySmall.interconnect.method, 'supply', 'supply-side was chosen');
eq(supplySmall.interconnect.ok, false, '705.11(B) refuses copper smaller than 6 AWG');
eq(supplySmall.ready, false, 'an undersized tap is not ready');
eq(supplySmall.blocks[0].cite, 'NEC 2023 705.11(B)', '705.11(B) citation');

/* ── voltage drop is a note, not a block ─────────────────────────────── */
var longRun = E.analyze(site('long', { voltage: 480, phases: 3, pf: 0.95 }, [
  { type: 'equip', key: 'pcs', kw: 5, x: 0, y: 0, w: 4, h: 4 },
  { type: 'equip', key: 'bess', kw: 5, kwh: 10, x: 10, y: 0, w: 8, h: 4 },
  { type: 'conduit', spec: 'RMC', pts: [{ x: 0, y: 0 }, { x: 0, y: 500 }] }
]));
eq(longRun.circuits[0].dropPct, 3.6, '500 ft of 14 AWG is over the 3% note');
var vdCheck = checkById(longRun, 'vd-src-ess-1');
eq(vdCheck.ok, false, 'the drop is flagged');
eq(vdCheck.severity, 'review', 'the informational note is not a block');
eq(longRun.ready, true, 'a high drop still previews and, with no block, exports');

/* ── spacing, Level 2 voltage, empty drawing, a changed kW ──────────── */
var gap = E.analyze(site('gap', { voltage: 480, phases: 3, pf: 0.95, method: 'supply' }, [
  { type: 'equip', key: 'bess', kw: 100, kwh: 200, x: 0, y: 0, w: 10, h: 8 },
  { type: 'equip', key: 'bess', kw: 100, kwh: 200, x: 12, y: 0, w: 10, h: 8 },
  { type: 'polygon', closed: true, pts: [{ x: -30, y: -30 }, { x: 80, y: -30 }, { x: 80, y: 40 }, { x: -30, y: 40 }] }
]));
eq(gap.spacing.minUnitFt, 2, 'the two cabinets are 2 ft apart');
eq(checkById(gap, 'bess-gap').severity, 'review', 'under 3 ft is a review, the adopted fire code decides');
eq(gap.ready, true, 'spacing does not block the export');

var l2 = E.analyze(site('l2', { voltage: 480, phases: 3, pf: 1 }, [
  { type: 'equip', key: 'charger', level: 'l2', kw: 7.2, x: 10, y: 10, w: 2, h: 2 }
]));
eq(l2.circuits[0].volts, 208, 'Level 2 is taken at 208 V when the service is 480 V');
eq(l2.circuits[0].phases, 1, 'Level 2 is single-phase');
eq(l2.circuits[0].cite, 'NEC 2023 625.41', '625.41 sizes the charger');
eq(l2.ready, false, 'Level 2 on a 480 V service with no step-down is not ready');
eq(l2.blocks[0].cite, 'NEC 2023 625.40, 625.41', '625.40 / 625.41');

var stepped = E.analyze(site('step', { voltage: 480, phases: 3, pf: 1 }, [
  { type: 'equip', key: 'transformer', secondaryV: 240, zPct: 5.75, x: 5, y: 5, w: 6, h: 6 },
  { type: 'equip', key: 'charger', level: 'l2', kw: 7.2, x: 10, y: 10, w: 2, h: 2 }
]));
eq(stepped.ready, true, 'a 240 V secondary clears the Level 2 block');
eq(stepped.transformer.nameplateKva, 15, 'duty rounds up to a standard nameplate, with no NEC multiplier');

var blank = E.analyze(D.create({ name: 'Empty' }));
eq(blank.ready, false, 'an empty drawing is not ready');
eq(E.readiness(D.create({ name: 'Empty' })).summary, 'Not ready. Nothing to document yet', 'the empty sentence names the block');

var live = E.fixtures.bess1mw();
eq(E.analyze(live).circuits[0].ocpdA, 1600, '1 MW PCS is a 1600 A device');
live.entities.forEach(function (e) {
  if (e.key === 'pcs' || e.key === 'bess') e.kw = 250;
});
var shrunk = E.analyze(live);
eq(shrunk.circuits[0].ocpdA, 400, 'dropping the PCS to 250 kW drops the device to 400 A');
eq(shrunk.circuits[0].spec, '600 kcmil Cu', '250 kW is one 600 kcmil, not 600 AWG');

/* ── golden files ────────────────────────────────────────────────────── */
['sample', 'bess1mw', 'commercialPv', 'dcfc'].forEach(function (name) {
  var got = E.golden(E.fixtures[name]());
  var file = path.join(__dirname, '../fixtures/editor-v2-outputs/' + name + '.json');
  var want = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.deepStrictEqual(got, want, name + ' golden');
  n++;
  check(got.ready === true, name + ' reference is ready to review');
});
var sampleG = E.golden(E.fixtures.sample());
eq(sampleG.circuits[0].kw, 250, 'the sample battery is sized from the 250 kW PCS');
eq(sampleG.circuits[0].spec, '600 kcmil Cu', 'kcmil, not AWG, at 600');
eq(sampleG.circuits[1].spec, '2 sets of 600 kcmil Cu', 'the array is two parallel sets');
eq(sampleG.interconnect.method, 'unknown', 'no bus rating means 705 is not invented');
var bessG = E.golden(E.fixtures.bess1mw());
eq(bessG.transformer.requiredKva, 1053, '1000 kW / 0.95, rounded');
eq(bessG.transformer.nameplateKva, 1500, 'next standard nameplate');
eq(bessG.interconnect.method, 'supply', 'the 1 MW fixture is a supply-side connection');
var pvG = E.golden(E.fixtures.commercialPv());
eq(pvG.interconnect.method, '100', '400 A main + this array fits the 800 A bus under 705.12(B)(1)');
eq(pvG.interconnect.ok, true, 'the 100% rule passes');
eq(pvG.circuits[0].ocpdA, 150, 'commercial array OCPD');
eq(pvG.circuits[0].cite, 'NEC 2023 690.8(A), 690.8(B)(1), 690.9', 'PV output cites 690.8 and 690.9');
var dcG = E.golden(E.fixtures.dcfc());
eq(dcG.loadKw, 600, 'four 150 kW chargers');
eq(dcG.interconnect.method, 'none', 'chargers are loads, so 705 does not apply');
eq(dcG.transformer.nameplateKva, 750, '600 kVA duty rounds to 750');
eq(dcG.circuits[0].cite, 'NEC 2023 625.41', 'each DCFC cites 625.41');
check(dcG.circuits.every(function (c) { return c.ocpdA === 250 && c.spec === '4/0 AWG Cu'; }), 'each DCFC is 4/0 on a 250 A device');

/* ── sheets: pages, citations, PDF, DXF, single-line ─────────────────── */
function allText(built) {
  return built.pages.map(function (p) { return Sheets.pageText(p); }).join('\n');
}
var built = Sheets.build(E.fixtures.sample(), { size: 'ansi-d', date: '2026-10-18' });
check(built.pages.length >= 12, 'the sample set has the twelve sheets, and a continuation when the cover needs one');
var numbers = built.pages.map(function (p) { return p.number; });
['G-001', 'C-001', 'E-001', 'E-002', 'E-003', 'E-004', 'E-005', 'E-006', 'E-007', 'E-008', 'E-009', 'A-001'].forEach(function (id) {
  check(numbers.indexOf(id) >= 0, 'sheet ' + id);
});
var text = allText(built);
check(text.indexOf('Sample industrial site') >= 0, 'the title block names the project');
check(text.indexOf('Sample customer') >= 0, 'the title block names the customer');
check(text.indexOf('Issued for review. Not sealed.') >= 0, 'a ready set says it is for review');
check(text.indexOf('706.31') >= 0 && text.indexOf('690.8') >= 0 && text.indexOf('250.122') >= 0, 'the set prints the sections it used');
check(text.indexOf('600 kcmil') >= 0, 'the schedule says kcmil');
check(text.indexOf('NOT FOR PERMIT') < 0, 'a ready set is not stamped not-for-permit');
var sldPage = built.pages.filter(function (p) { return p.number === 'E-002'; })[0];
eq(SLD.labelHits(sldPage._sld).length, 0, 'sample single-line labels do not overlap');
eq(SLD.orthogonal(sldPage._sld).length, 0, 'sample single-line wires are orthogonal');

var blocked = Sheets.build(site('fail', { voltage: 480, phases: 3, pf: 0.95, method: 'auto', busA: 100, mainA: 100 }, [
  { type: 'equip', key: 'pcs', kw: 50, x: 10, y: 10, w: 4, h: 4 },
  { type: 'equip', key: 'bess', kw: 50, kwh: 100, x: 20, y: 10, w: 8, h: 4 }
]), { size: 'ansi-d', date: '2026-10-18' });
check(allText(blocked).indexOf('NOT FOR PERMIT') >= 0, 'a blocked set says it is not for permit');

['ansi-d', 'arch-d', 'tabloid'].forEach(function (size) {
  ['sample', 'bess1mw', 'commercialPv', 'dcfc'].forEach(function (name) {
    var set = Sheets.build(E.fixtures[name](), { size: size, date: '2026-10-18' });
    var pdf = Sheets.toPdf(set);
    check(pdf.indexOf('%PDF-1.4') === 0 && pdf.lastIndexOf('%%EOF') === pdf.length - 5, name + ' ' + size + ' PDF');
    eq((pdf.match(/\/Type \/Page \/Parent/g) || []).length, set.pages.length, name + ' ' + size + ' page count');
    set.pages.forEach(function (p) {
      p.ops.forEach(function (o) {
        if (o.t !== 'tx') return;
        assert.ok(o.x >= 0 && o.y >= 0 && o.x <= p.w + 0.02 && o.y <= p.h + 0.02, name + ' ' + size + ' text off ' + p.number + ': ' + o.text);
      });
      if (p._sld) {
        eq(SLD.labelHits(p._sld).length, 0, name + ' ' + size + ' labels');
        eq(SLD.orthogonal(p._sld).length, 0, name + ' ' + size + ' wires');
      }
    });
    n++;
    var dxf = Sheets.toDxf(set);
    check(dxf.indexOf('$INSUNITS') >= 0 && dxf.indexOf('\n70\n1\n') >= 0, name + ' ' + size + ' DXF inches');
    check(dxf.indexOf('\n8\nG-001\n') >= 0 && dxf.indexOf('\n8\nE-002\n') >= 0, name + ' ' + size + ' DXF sheet layers');
    check(dxf.indexOf('\n0\nEOF\n') >= 0, name + ' ' + size + ' DXF ends');
  });
});
check(Sheets.toPdf(Sheets.build(E.fixtures.bess1mw(), { size: 'ansi-d', date: '2026-10-18' })).indexOf('[0 0 2448 1584]') >= 0, 'ANSI D media box');
check(Sheets.toPdf(Sheets.build(E.fixtures.dcfc(), { size: 'tabloid', date: '2026-10-18' })).indexOf('[0 0 1224 792]') >= 0, '11×17 media box');

var named = D.create({ name: 'A & B <site>', address: '2 Ampersand', assignment: { customerName: 'Smith & Co' } });
named.entities.push({ id: 'e0', type: 'equip', layer: 'equipment', key: 'pcs', kw: 10, x: 1, y: 1, w: 4, h: 4 });
var svg = Sheets.toSvg(Sheets.build(named, { size: 'tabloid', date: '2026-10-18' }).pages[0]);
check(svg.indexOf('A &amp; B &lt;site&gt;') >= 0, 'preview escapes the project name');
check(svg.indexOf('<site>') < 0, 'raw markup from the name is not in the SVG');

/* ── the page stays one Outputs button ───────────────────────────────── */
var page = fs.readFileSync(path.join(__dirname, '../../editor-v2.html'), 'utf8');
var app = fs.readFileSync(path.join(__dirname, '../../omega-editor-v2-app.js'), 'utf8');
var editor = fs.readFileSync(path.join(__dirname, '../../editor.html'), 'utf8');
eq((page.match(/data-act="outputs"/g) || []).length, 1, 'one Outputs button');
check(page.indexOf('data-act="png"') < 0 && page.indexOf('data-act="pdf"') < 0, 'PNG and PDF are not extra ribbon buttons');
check(page.indexOf('omega-editor-v2-electrical.js') >= 0 && page.indexOf('omega-editor-v2-sld.js') >= 0 && page.indexOf('omega-editor-v2-sheets.js') >= 0 && page.indexOf('omega-editor-v2-outputs.js') >= 0, 'the four modules load');
check(page.indexOf('id="dlg-outputs"') >= 0, 'one dialog');
check(app.indexOf('OmegaEditorV2Outputs.sync(state.doc)') >= 0, 'a drawing change refreshes Outputs');
check(editor.indexOf('omega-editor-v2') < 0, 'Site Map does not load this preview');

/* ── the dialog: one sentence, preview always, export only when ready ─ */
function el() {
  var node = {
    children: [], attrs: {}, listeners: {}, className: '', textContent: '',
    disabled: false, title: '', innerHTML: '', open: false, value: '', selected: false,
    setAttribute: function (k, v) { this.attrs[k] = v; },
    appendChild: function (c) { this.children.push(c); return c; },
    removeChild: function (c) { this.children = this.children.filter(function (x) { return x !== c; }); },
    addEventListener: function (ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); },
    showModal: function () { this.open = true; },
    close: function () {
      this.open = false;
      (this.listeners.close || []).forEach(function (fn) { fn(); });
    }
  };
  Object.defineProperty(node, 'firstChild', { get: function () { return node.children[0] || null; } });
  return node;
}
var ids = {};
global.document = {
  readyState: 'complete',
  getElementById: function (id) { return ids[id] || null; },
  createElement: function () { return el(); },
  addEventListener: function () {}
};
ids['dlg-outputs'] = el();
ids['out-body'] = el();
var Out = require('../../omega-editor-v2-outputs.js');

function walk(node, hit) {
  if (!node) return;
  hit(node);
  (node.children || []).forEach(function (c) { walk(c, hit); });
}
function findText(text) {
  var found = null;
  walk(ids['out-body'], function (node) { if (!found && node.textContent === text) found = node; });
  return found;
}
function findClass(part) {
  var found = null;
  walk(ids['out-body'], function (node) {
    if (!found && node.className && node.className.indexOf(part) >= 0) found = node;
  });
  return found;
}
function click(node) { (node.listeners.click || []).forEach(function (fn) { fn(); }); }

var downloads = [];
Out.open({
  doc: D.create({ name: 'Empty' }),
  download: function (name) { downloads.push(name); },
  fileBase: function () { return 'empty'; },
  drawing: { png: function () { downloads.push('png'); } }
});
eq(findClass('out-status').textContent, 'Not ready. Nothing to document yet', 'the dialog leads with the one sentence');
eq(findText('Export').disabled, true, 'Export is off until the drawing is ready');
check(findText('Preview') && findText('Preview').disabled === false, 'Preview stays available');
click(findText('Export'));
eq(downloads.length, 0, 'a disabled export does not write a file');
click(findText('PNG'));
eq(downloads[0], 'png', 'the drawing file is still one click');
click(findText('Preview'));
check(findText('Back'), 'Preview opens the sheets');
click(findText('Back'));

downloads = [];
Out.open({
  doc: E.fixtures.sample(),
  download: function (name, mime, body) { downloads.push({ name: name, mime: mime, body: body }); },
  fileBase: function () { return 'sample-site'; },
  drawing: {}
});
check(/^Ready to review\. \d+ notes are printed in the set\.$/.test(findClass('out-status').textContent), 'ready is one sentence and does not list the notes');
eq(findText('Export').disabled, false, 'Export is on');
click(findText('Export'));
eq(downloads[0].name, 'sample-site-permit-ansi-d.pdf', 'permit export is one PDF');
check(downloads[0].body.indexOf('%PDF-1.4') === 0, 'the file is a PDF');
var dxfBtn = null;
walk(ids['out-body'], function (node) {
  if (!dxfBtn && node.textContent === 'DXF') dxfBtn = node;
});
click(dxfBtn);
check(/\.dxf$/.test(downloads[1].name) && downloads[1].body.indexOf('INSUNITS') >= 0, 'permit DXF is the sheet set');

Out.sync(D.create({ name: 'Empty' }));
eq(findClass('out-status').textContent, 'Not ready. Nothing to document yet', 'a drawing change updates the sentence');
eq(findText('Export').disabled, true, 'the export follows the new drawing');
Out.close();
eq(Out.isOpen(), false, 'Close leaves the dialog');

console.log('teditorv2outputs: ' + n + ' checks passed');
