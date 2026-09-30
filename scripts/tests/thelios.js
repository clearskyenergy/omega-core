#!/usr/bin/env node
/* The Helios intake: Helios Energy Advisors' first-pass checklist, filled
   from a project and sent from the editor.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   What is worth pinning here:
   1. Helios's form is the form we think it is. The filler writes by field
      NAME; a new revision of their PDF with different names would fill
      nothing and say nothing. So the names are asserted against the file.
   2. compose() reads and never invents. A rich session fills the questions
      it can with a source each; a bare project leaves them blank, and the
      platform never writes "Unknown" on its own.
   3. fill() puts the text into the boxes, wraps across the printed lines,
      ticks the boxes by position, and reports what did not fit.
   4. The door: who may draft, who may send, where it goes, what is kept. */
'use strict';
var assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..', '..');
var H = require(path.join(ROOT, 'api', '_lib', 'helios-intake.js'));
var PDF = H.pdfLib();
var checks = 0;
function ok(c, m) { assert.ok(c, m); checks++; }
function eq(a, b, m) { assert.equal(a, b, m); checks++; }

var TEMPLATE = fs.readFileSync(H.TEMPLATE_PATH);
var RICH = {
  name: '225 Cesar Chavez Blvd — Calexico', address: '225 Cesar Chavez Blvd, Calexico, CA 92231', city: 'Calexico', state: 'CA',
  site: { county: 'Imperial County', state: 'CA', zip: '92231', parcelApn: '059-000-000', parcelAcres: 42.3, parcelOwner: 'Sample Owner LLC', parcelZoning: 'M-1', parcelSource: 'Regrid' },
  grid: { substations: [{ name: 'CALEXICO', voltageKv: 92, distanceKm: 2.1, owner: 'Imperial Irrigation District' }], lines: [{ voltageKv: 92, distanceKm: 1 }], ranAt: '2026-09-28T10:00:00.000Z' },
  substationLookup: { name: 'CALEXICO', kv: 92, miles: 1.3, dir: 'ESE', capMw: 40, source: 'HIFLD' },
  drawing: { tech: 'storage', bessKw: 20000, bessKwh: 80000, capex: 31600000, units: 20, elements: 31, hasBoundary: true },
  bess: { chem: 'LFP', mfr: 'Sample', model: 'S-4' },
  run: { total: 31600000, at: 1790000000000, contracted: false },
  wizMode: 'FOM', interconMode: 'service', offtaker: null, poi: { kind: 'utility-xfmr', ft: 400, source: 'setting' },
  billImport: { utility: 'Imperial Irrigation District' },
  terrain: { reliefFt: 6, areaFt2: 43560 * 40 },
  workflow: { owner: 'Sample Owner LLC', siteControl: 'loi', appStatus: 'submitted', queuePos: '26INR0042', flood: '1', research: { floodZone: 'X' }, codDate: '12/15/27', timeline: '18-24 months' },
  hasMap: true
};
var PROJECT = { orgId: 'nextnrg.example', name: '225 Cesar Chavez Blvd — Calexico', address: '225 Cesar Chavez Blvd, Calexico, CA', capex: 31600000, capexAt: 1790000000000, capexSource: 'site-map', bessKw: 20000, bessKwh: 80000, wizMode: 'FOM' };
var ORG = { name: 'NextNRG', status: 'active' };
var CALLER = { email: 'dana@nextnrg.example', name: 'Dana Ortiz' };

(async function () {
  /* ── 1 · the template is Helios's form, with the fields the filler names ── */
  var doc = await PDF.PDFDocument.load(TEMPLATE);
  var names = doc.getForm().getFields().map(function (f) { return f.getName(); });
  H.expectedFields().forEach(function (n) { ok(names.indexOf(n) >= 0, 'the form carries "' + n + '"'); });
  eq(doc.getForm().getFields().filter(function (f) { return f instanceof PDF.PDFCheckBox; }).length, 12, 'twelve attachment boxes');
  eq(doc.getPageCount(), 5, 'five pages');

  /* ── 2 · compose reads, never invents ── */
  var d = H.compose({ project: PROJECT, org: ORG, caller: CALLER, facts: RICH, today: new Date(2026, 8, 30) });
  eq(d.cover.date, '9/30/26', 'the cover date is m/d/yy, as the field formats');
  ok(/NextNRG/.test(d.cover.submittedBy) && /Dana Ortiz/.test(d.cover.submittedBy), 'submitted by names the workspace and the person');
  ok(/Calexico/.test(d.cover.projectNameLocation) && /Imperial County/.test(d.cover.projectNameLocation), 'project and location on the cover');
  ok(/APN 059-000-000/.test(d.answers.q1.text) && /42\.3 acres/.test(d.answers.q1.text) && /Imperial County, CA/.test(d.answers.q1.text), 'q1: address, county, APN, acreage');
  ok(d.answers.q1.sources.some(function (s) { return /parcel/.test(s); }), 'q1 says the parcel came from the parcel service');
  ok(/Stand Alone BESS/.test(d.answers.q2.text) && /20 MW \/ 80 MWh \/ 4-hour/.test(d.answers.q2.text) && /LFP/.test(d.answers.q2.text), 'q2: technology, size, duration, chemistry: ' + d.answers.q2.text);
  ok(/Owner of record per Regrid: Sample Owner LLC/.test(d.answers.q3.text) && /LOI \/ in negotiation/.test(d.answers.q3.text), 'q3: owner and site control in the workflow\'s words');
  eq(d.answers.q4.text, '', 'q4 blank: deed is never on the platform');
  eq(d.answers.q5.text, '', 'q5 blank');
  ok(/Imperial Irrigation District/.test(d.answers.q6.text), 'q6: the utility off the bill');
  ok(/Front of meter/.test(d.answers.q7.text) && /distribution interconnection/.test(d.answers.q7.text), 'q7: FOM and the drawn POI');
  eq(d.answers.q8.text, '', 'q8 blank: a contact is never on the platform');
  ok(/application submitted/.test(d.answers.q9.text) && /26INR0042/.test(d.answers.q9.text), 'q9: status and queue number from the workflow');
  eq(d.answers.q10.text, '', 'q10 blank');
  ok(/18-24 months/.test(d.answers.q11.text), 'q11: the workflow timeline, named as the developer\'s');
  ok(/Grid Atlas/.test(d.answers.q12.text) && /92 kV/.test(d.answers.q12.text) && /1\.3 mi/.test(d.answers.q12.text) && /not a substitute for the utility interconnection study/.test(d.answers.q12.text), 'q12: substation, kV, distance and the caveat');
  ok(/wholesale market/.test(d.answers.q13.text) && /no offtaker is named/.test(d.answers.q13.text), 'q13: FOM means a wholesale buyer, never an invented company name');
  eq(d.answers.q14.text, '', 'q14 blank'); eq(d.answers.q15.text, '', 'q15 blank');
  ok(/Imperial County/.test(d.answers.q16.text) && /M-1/.test(d.answers.q16.text) && /not on the project record/.test(d.answers.q16.text), 'q16: county, zoning, and no claim about permitted use');
  eq(d.answers.q17.text, '', 'q17 blank without a permit pack');
  ok(/minimal flood risk/.test(d.answers.q18.text) && /zone X/.test(d.answers.q18.text) && /not screened by OMEGA/i.test(d.answers.q18.text), 'q18: the workflow\'s "1" is minimal flood risk (zone X), and what was not screened');
  ok(/\$31,600,000/.test(d.status.totalCost.text) && /Site Map Run/.test(d.status.totalCost.text), 'cost from the run');
  eq(d.status.cod.text, '12/15/27', 'COD from the workflow');
  eq(d.status.financing.text, '', 'the financing ask is never known');
  eq(d.status.constructionStart.text, '', 'construction start is never known');
  ok(d.attachments.addressParcel.on && d.attachments.boundaryKml.on && d.attachments.layoutSitePlan.on && d.attachments.distanceMap.on && d.attachments.permitEnvironmental.on, 'the boxes the platform can supply are pre-ticked');
  ok(!d.attachments.deedTitle.on && !d.attachments.buyerLoiPpa.on && !d.attachments.utilityContact.on, 'the developer\'s documents are not');
  eq(d.provenance.length, 23, 'one provenance row per item: the cover, eighteen questions, four status lines');
  var all = JSON.stringify(d.answers) + JSON.stringify(d.status);
  ok(!/unknown/i.test(all), 'the platform never writes "Unknown"');

  var bare = H.compose({ project: { orgId: 'x.example', name: 'Quarry Road', address: '14 Quarry Rd, Lowell, MA' }, org: {}, caller: {}, facts: {} });
  ok(/14 Quarry Rd/.test(bare.answers.q1.text) && !/APN/.test(bare.answers.q1.text), 'a bare project answers the address and nothing more');
  ['q2', 'q3', 'q6', 'q7', 'q9', 'q12', 'q13', 'q16', 'q18'].forEach(function (q) { eq(bare.answers[q].text, '', 'bare ' + q + ' stays blank'); });
  Object.keys(bare.attachments).forEach(function (k) { ok(!bare.attachments[k].on, 'bare: no box pre-ticked (' + k + ')'); });
  var btm = H.compose({ project: PROJECT, org: ORG, caller: CALLER, facts: { wizMode: 'BTM', poi: { kind: 'none' }, offtaker: { id: 'cold', name: 'Cold storage' } } });
  ok(/Behind the meter/.test(btm.answers.q7.text) && /no new point of interconnection/.test(btm.answers.q7.text), 'BTM classification, corroborated by the POI and a guided-build offtaker');
  ok(/host facility/.test(btm.answers.q13.text) && /load class: Cold storage/.test(btm.answers.q13.text), 'BTM buyer is the host, with the load class');

  /* the editor's DEFAULT mode is not a choice: every new project is BTM on
     the record until somebody picks, so a bare BTM reports nothing */
  var dflt = H.compose({ project: { orgId: 'x.example', name: 'Solar land', wizMode: 'BTM' }, org: {}, caller: {}, facts: { wizMode: 'BTM' } });
  eq(dflt.answers.q7.text, '', 'an unconfirmed BTM default: q7 blank');
  eq(dflt.answers.q13.text, '', 'and q13 blank');
  var chosen = H.compose({ project: { orgId: 'x.example', wizMode: 'BTM' }, org: {}, caller: {}, facts: { wizMode: 'BTM', wizModeConfirmed: true } });
  ok(/Behind the meter/.test(chosen.answers.q7.text), 'a BTM chosen in the guided build is reported');
  var typed = H.compose({ project: { orgId: 'x.example', wizMode: 'FOM' }, org: {}, caller: {}, facts: { offtaker: { name: 'Duke Energy Progress (PPA)' } } });
  ok(/offtaker named on the project: Duke Energy Progress \(PPA\)/.test(typed.answers.q13.text) && !/no offtaker/.test(typed.answers.q13.text), 'a typed offtaker is the named buyer, never "none named": ' + typed.answers.q13.text);
  var exporting = H.compose({ project: { orgId: 'x.example', wizMode: 'BTM' }, org: {}, caller: {}, facts: { wizMode: 'BTM', poi: { kind: 'substation', ft: 9000 } } });
  ok(/Exporting to the grid/.test(exporting.answers.q7.text) && /transmission-level/.test(exporting.answers.q7.text) && /1\.7 mi/.test(exporting.answers.q12.text), 'a drawn substation POI exports, whatever the default says');
  var wfPath = H.compose({ project: { orgId: 'x.example' }, org: {}, caller: {}, facts: { workflow: { exportMode: 'full', appType: 'full_study', market: 'PJM', icNotes: 'Deposit $50k due at SIS', timeline: '18' } } });
  ok(/Front of meter — full export/.test(wfPath.answers.q7.text) && /full interconnection study required/.test(wfPath.answers.q7.text) && /PJM/.test(wfPath.answers.q7.text), 'the workflow\'s export mode, application type and market: ' + wfPath.answers.q7.text);
  ok(/full interconnection study is required/.test(wfPath.answers.q10.text) && /Deposit \$50k/.test(wfPath.answers.q10.text), 'q10 from the application type and the interconnection notes');
  ok(/18 weeks/.test(wfPath.answers.q11.text), 'a bare timeline number is in the workflow\'s own unit: ' + wfPath.answers.q11.text);

  /* flood, both ways: the workflow's "1" is minimal risk, "0" a floodplain */
  var wet = H.compose({ project: { orgId: 'x.example' }, org: {}, caller: {}, facts: { workflow: { flood: '0', research: { floodZone: 'AE' } } } });
  ok(/in or near a mapped floodplain/.test(wet.answers.q18.text) && /zone AE/.test(wet.answers.q18.text), 'flood "0" is a mapped floodplain (zone AE)');

  /* the wires company and what kind of utility it is, from the workflow */
  var tva = H.compose({ project: { orgId: 'x.example', address: '1 Main St, Jackson, TN' }, org: {}, caller: {}, facts: { state: 'TN', jurisdiction: { state: 'TN', utility: 'Jackson Energy Authority', known: true } } });
  ok(!/— investor-owned|sole investor-owned/.test(tva.answers.q6.text) && /confirm/.test(tva.answers.q6.text), 'the state table never asserts investor-owned (TVA\'s distributors are municipal and co-op): ' + tva.answers.q6.text);
  var coop = H.compose({ project: { orgId: 'x.example' }, org: {}, caller: {}, facts: { workflow: { tsp: { name: 'Pedernales Electric Cooperative', type: 'COOP' } } } });
  ok(/Pedernales Electric Cooperative — electric cooperative/.test(coop.answers.q6.text), 'q6: the TSP and its ownership type');
  ok(coop.answers.q15.text.length > 0, 'q15 speaks when a co-op serves the site');

  /* the site screen and the checklist the developer ticked */
  var flagged = H.compose({ project: { orgId: 'x.example' }, org: {}, caller: {}, facts: {
    workflow: { flags: { ss_wetlands: '1', ss_soil_contamination: true, ss_deed_restrict: '1', ss_bogus: '1' }, checks: { ck_title: '1', p5_zoning_ok: '1' } },
    exclusions: [{ reason: 'Easement / access', acres: 1.2 }, { reason: 'Wetland / waters', acres: 3.4 }, { reason: 'unclassified' }],
    boundary: { acres: 61.5 }, address: '9 Farm Rd, Ames, IA', terrain: { reliefFt: 12, areaFt2: 43560 * 60, slopePct: 2.4 } } });
  ok(/Deed restriction/.test(flagged.answers.q5.text) && /Easement \/ access about 1\.2 ac/.test(flagged.answers.q5.text), 'q5: the deed flag and the traced easement');
  ok(/title commitment ordered/i.test(flagged.answers.q4.text), 'q4: the title check the developer ticked');
  ok(/wetland/i.test(flagged.answers.q18.text) && /contamination/i.test(flagged.answers.q18.text) && /Wetland \/ waters about 3\.4 ac/.test(flagged.answers.q18.text), 'q18: flagged hazards and the traced wetland: ' + flagged.answers.q18.text);
  var notScreened = (/Not screened by OMEGA: ([^;.]*)/i.exec(flagged.answers.q18.text) || [])[1] || '';
  ok(!/wetlands/.test(notScreened) && !/contamination/.test(notScreened), 'and never lists as "not screened" what the developer flagged: ' + notScreened);
  ok(/2\.4%/.test(flagged.answers.q18.text), 'the terrain\'s average grade');
  ok(/61\.5 acres \(measured from the property line/.test(flagged.answers.q1.text), 'q1: acreage from the drawn property line when no parcel service ran');

  /* a state is two letters from the address or the geocoder, never a placeholder */
  var unknownState = H.compose({ project: { orgId: 'x.example' }, org: {}, caller: {}, facts: { address: '1200 County Road 5', jurisdiction: { state: '(unknown)', known: false } } });
  ok(!/\(U/.test(unknownState.answers.q1.text), 'the jurisdiction table\'s "(unknown)" never prints as a state: ' + unknownState.answers.q1.text);
  var ranked = H.compose({ project: { orgId: 'x.example' }, org: {}, caller: {}, facts: { address: '4500 FM 1960, Spring', state: 'CO', site: { county: 'Harris County', state: 'TX' } } });
  ok(/Harris County, TX/.test(ranked.answers.q1.text), 'the geocoder\'s state outranks one parsed elsewhere');

  /* q2: the drawing, else the project type, else nothing (never "Other") */
  var empty = H.compose({ project: { orgId: 'x.example' }, org: {}, caller: {}, facts: { drawing: { tech: 'land' } } });
  eq(empty.answers.q2.text, '', 'an empty drawing leaves q2 blank');
  var typedProject = H.compose({ project: { orgId: 'x.example', siteScopes: ['der', 'bess'], bessSizing: { powerKw: 5000, nameplateKwh: 20000, durationH: 4, basis: 'interval' } }, org: {}, caller: {}, facts: {} });
  ok(/Solar plus BESS/.test(typedProject.answers.q2.text) && /5 MW \/ 20 MWh \/ 4-hour/.test(typedProject.answers.q2.text), 'q2 from the project type and the Battery Sizer: ' + typedProject.answers.q2.text);
  ok(typedProject.answers.q2.sources.some(function (x) { return /project type/.test(x); }) && typedProject.answers.q2.sources.some(function (x) { return /Battery Sizer/.test(x); }), 'each part credited to where it came from');

  /* the Apply for Financing request fills the status block */
  var fin = H.compose({ project: { orgId: 'x.example' }, org: {}, caller: {}, facts: {},
    finApp: { status: 'submitted', form: { financedAmount: 22000000, product: 'Construction-to-term debt', termMonths: 84, ntpDate: '2027-03-01', codDate: '2027-12-15' } } });
  ok(/\$22,000,000/.test(fin.status.financing.text) && /84-month term/.test(fin.status.financing.text), 'financing from the application: ' + fin.status.financing.text);
  ok(/^3\/1\/27/.test(fin.status.constructionStart.text) && fin.status.cod.text === '12/15/27', 'NTP and COD from the application');

  /* the record's drawing carries the substation lookup and the drawn POI */
  var drawn = H.fromDrawing({ shapes: [{ kind: 'substation', omegaLookup: true, label: 'SANDY CREEK', voltage: '138 kV', srcMiles: 2.4, srcDir: 'NW', capMw: 60, srcName: 'HIFLD' },
    { kind: 'utility', utype: 'mpoi', omegaPoi: true, label: 'SUBSTATION POI' }], conduits: [{ omegaPoi: true, omegaGenTie: true, ftOverride: 6100 }] });
  ok(drawn.substation && drawn.substation.name === 'SANDY CREEK' && drawn.substation.kv === 138 && drawn.substation.miles === 2.4, 'the substation lookup off the saved drawing');
  ok(drawn.poi && drawn.poi.kind === 'substation' && drawn.poi.ft === 6100, 'the drawn POI and its gen-tie length');

  /* the cover date is the person's own day, not the server's UTC one */
  eq(H.compose({ project: {}, org: {}, caller: {}, facts: { today: '2026-09-29' } }).cover.date, '9/29/26', 'the browser\'s local date');
  var hostile = H.compose({ project: PROJECT, org: ORG, caller: CALLER, facts: { site: { parcelApn: '<script>x</script>'.repeat(10) }, drawing: { bessKw: 'abc' } } });
  ok(hostile.answers.q1.text.indexOf('<script>') >= 0 && hostile.answers.q1.text.length < 400, 'facts are capped, not trusted');
  ok(!/NaN/.test(JSON.stringify(hostile.answers)), 'a non-number never prints');

  /* ── 3 · fill writes into Helios's own boxes ── */
  var draft = { cover: d.cover, answers: {}, status: {}, attachments: {} };
  Object.keys(d.answers).forEach(function (q) { draft.answers[q] = d.answers[q].text; });
  Object.keys(d.status).forEach(function (k) { draft.status[k] = d.status[k].text; });
  Object.keys(d.attachments).forEach(function (k) { draft.attachments[k] = d.attachments[k].on; });
  draft.status.financing = '$22,000,000 construction-to-term debt';
  draft.answers.q10 = 'x '.repeat(900);      /* far past four lines */
  var filled = await H.fill(TEMPLATE, draft);
  var back = await PDF.PDFDocument.load(filled.bytes), form = back.getForm();
  ok(form.getTextField(H.QUESTION_PREFIX.q1 + ' 1').getText().indexOf('225 Cesar Chavez Blvd') === 0, 'q1 line 1 starts with the answer');
  ok(form.getTextField(H.QUESTION_PREFIX.q12 + ' 3').getText().length > 0, 'q12 wraps onto its third line');
  eq(form.getTextField(H.QUESTION_PREFIX.q4 + ' 1').getText() || '', '', 'a blank answer leaves the line empty');
  eq(form.getTextField(H.COVER.date).getText(), '9/30/26', 'the date is written');
  eq(form.getTextField(H.STATUS.financing).getText(), '$22,000,000 construction-to-term debt', 'the status box is written');
  var r10 = filled.report.filter(function (x) { return x.question === 'q10'; })[0];
  ok(r10 && r10.truncated && r10.lines === 4, 'an answer past the printed lines is cut and reported');
  var r12 = filled.report.filter(function (x) { return x.question === 'q12'; })[0];
  ok(r12 && !r12.truncated && r12.lines <= 3, 'q12 fits its three lines');
  var boxes = form.getFields().filter(function (f) { return f instanceof PDF.PDFCheckBox; });
  eq(boxes.filter(function (b) { return b.isChecked(); }).length, 5, 'five boxes ticked');
  var byPos = {}; boxes.forEach(function (b) { var rc = b.acroField.getWidgets()[0].getRectangle(); byPos[(rc.x < 200 ? 'L' : 'R') + Math.round(rc.y)] = b.isChecked(); });
  var rows = Object.keys(byPos).map(function (k) { return +k.slice(1); }).filter(function (v, i, a) { return a.indexOf(v) === i; }).sort(function (a, b) { return b - a; });
  ok(byPos['L' + rows[0]] === true && byPos['R' + rows[0]] === false, 'row 1: address ticked, landowner not');
  ok(byPos['L' + rows[2]] === true && byPos['R' + rows[2]] === true, 'row 3: boundary and layout ticked');
  ok(byPos['R' + rows[4]] === true && byPos['L' + rows[4]] === false, 'row 5: distance map ticked, queue record not');
  ok(byPos['R' + rows[5]] === true && byPos['L' + rows[5]] === false, 'row 6: permit/environmental ticked, LOI not');
  ok(filled.bytes.length > 500000, 'the output is still their file');
  eq(H.fileName(draft, new Date(Date.UTC(2026, 8, 30))), 'Helios-First-Pass-225-Cesar-Chavez-Blvd-Calexico-2026-09-30.pdf', 'a file name from the project');

  /* ── 4 · where it goes ── */
  eq(H.recipients({ HELIOS_INTAKE_EMAIL: 'a@helios.example, b@helios.example' }, { orgs: { helios: ['c@helios.example'] } }).to.join(','), 'a@helios.example,b@helios.example', 'the environment wins');
  eq(H.recipients({}, { orgs: { helios: ['c@helios.example', 'not-an-address'] } }).to.join(','), 'c@helios.example', 'else the deal room list, invalid entries dropped');
  eq(H.recipients({}, {}).to.length, 0, 'else nobody');
  eq(H.recipients({ HELIOS_INTAKE_EMAIL: 'nope' }, {}).to.length, 0, 'a bad address is nobody');

  /* ── 3b · what the form's font cannot print, and what does not fit ── */
  eq(H.toWinAnsi('Kāneʻohe ≥ 5 MW → Łódź​ ✓'), "Kane'ohe >= 5 MW -> Lódz x", 'accents dropped where the font lacks them, symbols spelled out, invisible characters removed');
  eq(H.toWinAnsi('naïve café — “quoted” €5'), 'naïve café — “quoted” €5', 'everything Windows-1252 has is kept');
  eq(H.toWinAnsi('site 😀 ok'), 'site ? ok', 'an emoji is a question mark, never a crash');
  var odd = JSON.parse(JSON.stringify(draft));
  odd.cover.projectNameLocation = 'Kāneʻohe Bay Storage ≥ 20 MW\n45-123 Kamehameha Hwy, Kāneʻohe, HI​';
  odd.cover.submittedBy = 'NextNRG — Development\nDana Ortiz-Łukasiewicz · dana@nextnrg.example\n+1 555 010 2000\nA fourth line';
  odd.answers.q1 = 'APNs 1-2-3-004-005-000,1-2-3-004-006-000,1-2-3-004-007-000,1-2-3-004-008-000,1-2-3-004-009-000,1-2-3-004-010-000 https://www.example.com/a/very/long/path/to/the/parcel/record.pdf';
  odd.status.financing = '$22,000,000 construction-to-term debt with a tax equity bridge and a letter of credit for the interconnection deposit';
  odd.status.totalCost = 'x'.repeat(390);
  odd.cover.date = 'September 30, 2026';
  var oddFill = await H.fill(TEMPLATE, odd), oddForm = (await PDF.PDFDocument.load(oddFill.bytes)).getForm();
  ok(/^Kane'ohe Bay Storage >= 20 MW\n45-123 Kamehameha Hwy, Kane'ohe, HI$/.test(oddForm.getTextField(H.COVER.projectNameLocation).getText()), 'a name the font cannot print is transliterated, not a 500');
  eq(oddForm.getTextField(H.COVER.submittedBy).getText().split('\n').length, 4, 'the cover keeps every line the person wrote');
  var coverRow = oddFill.report.filter(function (x) { return x.field === 'submittedBy'; })[0];
  ok(coverRow && !coverRow.truncated && coverRow.size < 9.5, 'shrinking to fit the box instead of dropping lines');
  eq(oddForm.getTextField(H.COVER.date).getText(), '9/30/26', 'a long-form date becomes m/d/yy, year and all');
  var q1Row = oddFill.report.filter(function (x) { return x.question === 'q1'; })[0];
  ok(q1Row && !q1Row.truncated, 'a long run of APNs and a URL are broken at their commas and slashes, and fit');
  var wr = H.wrap('1-2-3-004-005-000,1-2-3-004-006-000,1-2-3-004-007-000,1-2-3-004-008-000', H.measurer(await (await PDF.PDFDocument.create()).embedFont(PDF.StandardFonts.Helvetica)), 9, 120);
  ok(wr.length > 1 && wr.slice(0, -1).every(function (l) { return /,$/.test(l); }), 'a token longer than a line breaks after its commas: ' + JSON.stringify(wr));
  var finRow = oddFill.report.filter(function (x) { return x.field === 'financing'; })[0];
  ok(finRow && finRow.lines === 2 && !finRow.truncated, 'a long financing line wraps onto two lines of its box');
  eq(oddForm.getTextField(H.STATUS.financing).getText().split('\n').length, 2, 'as two lines');
  var costRow = oddFill.report.filter(function (x) { return x.field === 'totalCost'; })[0];
  ok(costRow && costRow.truncated && /…$/.test(oddForm.getTextField(H.STATUS.totalCost).getText()), 'past two lines it is cut with an ellipsis and reported');
  ok(oddFill.issues.some(function (t) { return /Estimated total project cost is longer than its box/.test(t); }), 'and said in words');
  ok(oddFill.issues.some(function (t) { return /replaced/.test(t) && /Project name and location/.test(t) && /Submitted by/.test(t); }), 'the boxes whose characters changed are named');
  ok(oddFill.issues.some(function (t) { return /Q10 is longer/.test(t); }), 'a cut answer is named');
  /* the width the viewer DRAWS: every written line fits its box unkerned */
  var helv = await (await PDF.PDFDocument.create()).embedFont(PDF.StandardFonts.Helvetica), W = H.measurer(helv);
  Object.keys(H.QUESTION_PREFIX).forEach(function (q) {
    for (var n = 1; n <= 6; n++) {
      var fld; try { fld = oddForm.getTextField(H.QUESTION_PREFIX[q] + ' ' + n); } catch (e) { break; }
      var r = fld.acroField.getWidgets()[0].getRectangle(), rowq = oddFill.report.filter(function (x) { return x.question === q; })[0];
      if (rowq && rowq.size) ok(W(fld.getText() || '', rowq.size) <= r.width - 8 + 0.01, q + ' line ' + n + ' fits its box as drawn');
    }
  });
  var badDate = JSON.parse(JSON.stringify(draft)); badDate.cover.date = 'next spring';
  var bd = await H.fill(TEMPLATE, badDate);
  eq((await PDF.PDFDocument.load(bd.bytes)).getForm().getTextField(H.COVER.date).getText() || '', '', 'a date the form cannot read is left blank');
  ok(bd.issues.some(function (t) { return /next spring/.test(t); }), 'and said');

  /* the draft is cleaned to strings, and a box is ticked only by true */
  var cd = H.cleanDraft({ cover: { date: '2026-09-30' }, answers: { q1: { text: 'from an object' }, q2: { nested: 1 }, q3: ['x'], q4: 42 },
    status: { cod: { text: '12/15/27' } }, attachments: { addressParcel: 'false', deedTitle: true, boundaryKml: { on: true }, utilityContact: { on: 'true' }, queueRecord: 1 } });
  eq(cd.answers.q1, 'from an object', '{text} is read'); eq(cd.answers.q2, '', 'an object is not an answer'); eq(cd.answers.q3, '', 'nor an array'); eq(cd.answers.q4, '42', 'a number is');
  ok(!/object Object/.test(JSON.stringify(cd)), 'never "[object Object]"');
  ok(!cd.attachments.addressParcel && cd.attachments.deedTitle && cd.attachments.boundaryKml && !cd.attachments.utilityContact && !cd.attachments.queueRecord, 'the string "false", {on:"true"} and 1 tick nothing; true and {on:true} do');
  eq(cd.cover.date, '9/30/26', 'an ISO date becomes the form\'s m/d/yy');
  eq(H.normalizeDate('12/15/2027').text, '12/15/27', 'm/d/yyyy');
  eq(H.normalizeDate('15 Dec 2027').text, '12/15/27', 'd Month yyyy');
  ok(!H.normalizeDate('2/30/27').ok, 'February 30th is not a date');
  eq(H.fileName({ cover: { projectNameLocation: 'Kane\'ohe Bay\nx', date: '9/29/26' } }, new Date(Date.UTC(2026, 8, 30))), 'Helios-First-Pass-Kane-ohe-Bay-2026-09-29.pdf', 'the file is named for the form\'s own date');

  /* ── 5 · the door ── */
  var FD = require(path.join(ROOT, 'scripts', '_lib', 'firestore-double.js'));
  var DB, AUTH, SAVED, MAILS, MAIL_ON, MAIL_RESULT, CLIENT_ADMIN, SAVE_FAIL;
  var ME = { uid: 'u1', email: 'dana@nextnrg.example', orgId: 'nextnrg.example', staff: false, claims: { email_verified: true, name: 'Token Name' } };
  function as(c) { AUTH = function () { return Promise.resolve(Object.assign({}, c)); }; }
  function reset() {
    DB = new FD.DB(); as(ME);
    DB.seed('projects/p1', PROJECT);
    DB.seed('omega_orgs/nextnrg.example', ORG);
    DB.seed('omega_orgs/nextnrg.example/billing/current', { tier: 'deluxe' });
    DB.seed('omega_orgs/nextnrg.example/members/u1', { role: 'admin', status: 'active', name: 'Dana Ortiz' });
    DB.seed('fin_settings/dealroom', { orgs: { helios: ['intake@helios.example'] } });
    SAVED = []; MAILS = []; MAIL_ON = true; MAIL_RESULT = { ok: true, id: 'msg-1' }; CLIENT_ADMIN = false; SAVE_FAIL = false;
    delete process.env.HELIOS_INTAKE_EMAIL; delete process.env.MAIL_NOTIFY;
  }
  function snap() { return JSON.stringify(Array.from(DB.data.entries()).sort()); }
  function httpError(st, m) { var e = new Error(m); e.status = st; return e; }
  var fakeAdmin = { handler: function (fn) { return fn; }, httpError: httpError, authenticate: function (req) { return AUTH(req); }, db: function () { return DB; },
    clientAdmin: function () { return Promise.resolve(!!CLIENT_ADMIN); },
    init: function () { return { storage: function () { return { bucket: function () { return { file: function (p) { return { save: function (bytes, o) { if (SAVE_FAIL) return Promise.reject(new Error('bucket down')); SAVED.push({ path: p, bytes: bytes, opts: o }); return Promise.resolve(); } }; } }; } }; } }; },
    FieldValue: function () { return {}; } };
  var fakeMail = { configured: function () { return MAIL_ON; }, send: function (to, subject, html, text, opts) { MAILS.push({ to: to, subject: subject, html: html, opts: opts }); return Promise.resolve(MAIL_RESULT); },
    layout: function (t, b) { return '<html>' + b + '</html>'; }, esc: function (s) { return String(s == null ? '' : s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); } };
  FD.mock('../api/_lib/admin.js', fakeAdmin); FD.mock('../api/_lib/mail.js', fakeMail);
  var api = require(path.join(ROOT, 'api', 'helios-intake.js'));
  function call(body, method) { return api({ method: method || 'POST', headers: {}, body: body }); }
  async function refused(body, status, why, method) { try { await call(body, method); assert.fail('expected ' + status + ': ' + why); } catch (e) { eq(e.status, status, why + ' → ' + e.message); } }
  var n = 0; function sid() { return 'send-test-' + (++n); }

  reset();
  var before = snap();
  var dr = await call({ projectId: 'p1', action: 'draft', facts: RICH });
  ok(dr.ok && dr.configured && dr.mailConfigured && dr.to[0] === 'intake@helios.example' && dr.draft.answers.q12.text.length > 0, 'draft: composed, and says where it will go');
  ok(dr.draft.questions && dr.draft.attachmentLabels, 'draft carries the labels the dialog prints');
  ok(/Dana Ortiz/.test(dr.draft.cover.submittedBy) && !/Token Name/.test(dr.draft.cover.submittedBy), 'the sender is named from the workspace\'s member record, not the token');
  eq(snap(), before, 'draft writes nothing');
  var pv = await call({ projectId: 'p1', action: 'preview', draft: draft });
  ok(pv.ok && pv.pdfBase64 && pv.fileName && Array.isArray(pv.issues), 'preview hands back the PDF and what did not fit');
  var pvDoc = await PDF.PDFDocument.load(Buffer.from(pv.pdfBase64, 'base64'));
  ok(pvDoc.getForm().getTextField(H.QUESTION_PREFIX.q2 + ' 1').getText().indexOf('Stand Alone BESS') === 0, 'the preview is filled');
  eq(snap() + SAVED.length + MAILS.length, before + 0 + 0, 'preview writes and sends nothing');
  var weird = await call({ projectId: 'p1', action: 'preview', draft: odd });
  ok(weird.ok && weird.issues.length >= 2, 'a draft full of characters the font lacks previews, with the changes said');

  /* the financing request: the workspace's own, never a partner's */
  reset();
  DB.seed('fin_applications/a1', { orgId: 'nextnrg.example', projectId: 'p1', status: 'submitted', form: { financedAmount: 22000000, product: 'Construction-to-term debt', termMonths: 84 }, updatedAt: 5 });
  DB.seed('fin_applications/a2', { orgId: 'other.example', projectId: 'p1', status: 'submitted', form: { financedAmount: 999 }, updatedAt: 9 });
  var withFin = await call({ projectId: 'p1', action: 'draft', facts: {} });
  ok(/\$22,000,000/.test(withFin.draft.status.financing.text), 'the workspace\'s own Apply for Financing request fills the ask');
  DB.seed('projects/p1', Object.assign({}, PROJECT, { orgsInvolved: ['partner.example'] }));
  DB.seed('omega_orgs/partner.example/billing/current', { tier: 'enterprise' });
  as({ uid: 'u7', email: 'pat@partner.example', orgId: 'partner.example', staff: false, claims: { email_verified: true } });
  var partner = await call({ projectId: 'p1', action: 'draft', facts: {} });
  ok(partner.ok && partner.draft.status.financing.text === '', 'a JDA partner may draft, and never sees the owner\'s financing request');
  await refused({ projectId: 'p1', action: 'send', draft: draft, sendId: sid() }, 403, 'but only the project\'s own workspace sends it');

  /* who may read, as the projects read rule says */
  reset(); as({ uid: 'u9', email: 'x@other.example', orgId: 'other.example', staff: false, claims: { email_verified: true } });
  DB.seed('omega_orgs/other.example/billing/current', { tier: 'enterprise' });
  await refused({ projectId: 'p1', action: 'draft', facts: {} }, 403, 'another workspace cannot even draft');
  reset(); DB.seed('projects/p2', { name: 'Legacy, no org' });
  as({ uid: 'anon', email: '', orgId: '', staff: false, claims: {} });
  await refused({ projectId: 'p2', action: 'draft', facts: {} }, 403, 'an email-less token never matches a project with no org');
  DB.seed('projects/p3', { name: 'Mine', uid: 'u1', orgId: 'old.example' });
  as(ME);
  ok((await call({ projectId: 'p3', action: 'draft', facts: {} })).ok, 'the project\'s own creator may draft it');

  /* the plan behind the button */
  reset(); DB.seed('omega_orgs/nextnrg.example/billing/current', { tier: 'standard' });
  await refused({ projectId: 'p1', action: 'draft', facts: {} }, 403, 'a plan without the Output tab\'s exports cannot use it');
  DB.seed('omega_orgs/nextnrg.example/billing/current', { tier: 'standard', addOns: { live: ['finance'], accessUntil: Date.now() + 86400000 } });
  ok((await call({ projectId: 'p1', action: 'draft', facts: {} })).ok, 'Omega Capital bought as an add-on opens it');
  DB.seed('omega_orgs/nextnrg.example/billing/current', { tier: 'deluxe', toolAccess: ['gridatlas'] });
  await refused({ projectId: 'p1', action: 'draft', facts: {} }, 403, 'a product without Site Map cannot');
  DB.seed('omega_orgs/nextnrg.example/billing/current', { tier: 'deluxe' });
  DB.seed('omega_orgs/nextnrg.example/members/u1', { role: 'member', status: 'disabled' });
  await refused({ projectId: 'p1', action: 'draft', facts: {} }, 403, 'a member the workspace disabled cannot');
  reset();
  var soon = new Date(Date.now() + 30 * 86400000).toISOString();
  DB.seed('omega_orgs/nextnrg.example/billing/current', { packaged: true, modules: ['lite'], packagingState: 'paid', accessUntil: soon });
  await refused({ projectId: 'p1', action: 'draft', facts: {} }, 403, 'a package without Omega Capital cannot');
  DB.seed('omega_orgs/nextnrg.example/billing/current', { packaged: true, modules: ['lite', 'finance'], packagingState: 'paid', accessUntil: soon });
  ok((await call({ projectId: 'p1', action: 'draft', facts: {} })).ok, 'a package with it can');
  DB.seed('omega_orgs/nextnrg.example/billing/current', { packaged: true, modules: ['lite', 'finance'], packagingState: 'paid', accessUntil: new Date(Date.now() - 86400000).toISOString() });
  ok((await call({ projectId: 'p1', action: 'draft', facts: {} })).ok, 'a read-only package may still draft');
  await refused({ projectId: 'p1', action: 'preview', draft: draft }, 403, 'but produces nothing');

  /* sending asks more */
  reset(); as({ uid: 'u2', email: 'new@nextnrg.example', orgId: 'nextnrg.example', staff: false, claims: { email_verified: false } });
  await refused({ projectId: 'p1', action: 'send', draft: draft, sendId: sid() }, 403, 'an unverified member cannot send');
  ok(await call({ projectId: 'p1', action: 'draft', facts: {} }).then(function (r) { return r.ok; }), 'but may draft');
  CLIENT_ADMIN = true;
  ok((await call({ projectId: 'p1', action: 'send', draft: draft, sendId: sid() })).ok, 'an owner or administrator of an active client sends without the link');
  reset(); DB.seed('omega_orgs/nextnrg.example/members/u1', { role: 'viewer', status: 'active' });
  await refused({ projectId: 'p1', action: 'send', draft: draft, sendId: sid() }, 403, 'a viewer cannot send');
  reset(); DB.seed('omega_orgs/nextnrg.example', Object.assign({}, ORG, { status: 'suspended' }));
  await refused({ projectId: 'p1', action: 'send', draft: draft, sendId: sid() }, 403, 'a suspended workspace cannot send');
  ok((await call({ projectId: 'p1', action: 'draft', facts: {} })).ok, 'but may still draft (the refusal is the send\'s)');
  reset(); DB.data.delete('omega_orgs/nextnrg.example');
  await refused({ projectId: 'p1', action: 'send', draft: draft, sendId: sid() }, 403, 'no workspace record: mailing a third party does not fail open');
  ok((await call({ projectId: 'p1', action: 'draft', facts: {} })).ok, 'drafting does');
  reset(); DB.seed('projects/g1', { orgId: 'gmail.com', name: 'x' }); DB.seed('omega_orgs/gmail.com', { name: 'Gmail', status: 'active' });
  DB.seed('omega_orgs/gmail.com/billing/current', { tier: 'enterprise' }); DB.seed('omega_orgs/gmail.com/members/g', { role: 'owner', status: 'active' });
  as({ uid: 'g', email: 'someone@gmail.com', orgId: 'gmail.com', staff: false, claims: { email_verified: true } });
  await refused({ projectId: 'g1', action: 'send', draft: draft, sendId: sid() }, 403, 'a personal email domain never sends in a company\'s name');

  reset(); DB.seed('fin_settings/dealroom', {});
  await refused({ projectId: 'p1', action: 'send', draft: draft, sendId: sid() }, 400, 'no address configured: refused, not guessed');
  eq(MAILS.length, 0, 'nothing mailed');
  process.env.HELIOS_INTAKE_EMAIL = 'env@helios.example';
  ok((await call({ projectId: 'p1', action: 'send', draft: draft, sendId: sid() })).sentTo[0] === 'env@helios.example', 'the environment address is used');
  reset(); MAIL_ON = false;
  await refused({ projectId: 'p1', action: 'send', draft: draft, sendId: sid() }, 500, 'mail not configured is a deployment problem');
  reset();
  await refused({ projectId: 'p1', action: 'send', draft: draft }, 400, 'a send carries its id');

  /* the send itself */
  reset();
  var jpeg = Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), Buffer.alloc(300, 1)]);
  var id1 = sid();
  var s = await call({ projectId: 'p1', action: 'send', sendId: id1, draft: draft, message: 'Calexico first pass, per our call.', siteMapJpeg: 'data:image/jpeg;base64,' + jpeg.toString('base64') });
  ok(s.ok && s.sentTo[0] === 'intake@helios.example' && new RegExp('^projects/p1/helios-first-pass-\\d{8}T\\d{6}-' + id1 + '\\.pdf$').test(s.path), 'sent, and the file sits in the project\'s own folder under its own name: ' + s.path);
  ok(Array.isArray(s.issues) && Array.isArray(s.report), 'the send says what the form holds');
  eq(SAVED.length, 1, 'one file stored'); eq(SAVED[0].opts.contentType, 'application/pdf', 'as a PDF');
  eq(MAILS.length, 1, 'one email');
  eq(MAILS[0].to, 'intake@helios.example', 'to Helios');
  eq(MAILS[0].opts.cc, 'dana@nextnrg.example, dev@clearsky-usa.com', 'the sender and ClearSky in copy');
  eq(MAILS[0].opts.replyTo, 'dana@nextnrg.example', 'replies reach the sender');
  eq(MAILS[0].opts.attachments.length, 2, 'the form and the snapshot');
  eq(MAILS[0].opts.attachments[0].contentType, 'application/pdf', 'the PDF first');
  eq(MAILS[0].opts.attachments[1].filename, 'site-map.jpg', 'then the site map');
  ok(/Calexico first pass, per our call\./.test(MAILS[0].html) && /NextNRG/.test(MAILS[0].html) && /Dana Ortiz/.test(MAILS[0].html) && /dana@nextnrg\.example/.test(MAILS[0].html), 'the mail names the workspace, the person and their verified address, and carries the message');
  ok(/First pass checklist — 225 Cesar Chavez Blvd — Calexico/.test(MAILS[0].subject), 'subject names the project');
  var proj = DB.data.get('projects/p1');
  ok(proj.heliosIntake && proj.heliosIntake.sentTo[0] === 'intake@helios.example' && proj.heliosIntake.snapshot === true && proj.heliosIntake.sendId === id1, 'the send is recorded on the project');
  var hist = DB.data.get('projects/p1/intakes/' + id1);
  ok(hist && hist.state === 'sent' && hist.kind === 'helios-first-pass' && hist.orgId === 'nextnrg.example', 'and in the project\'s history, keyed by the send');
  var day = new Date().toISOString().slice(0, 10);
  eq(DB.data.get('projects/p1/intake_counters/helios-' + day).count, 1, 'counted for the project');
  eq(DB.data.get('omega_orgs/nextnrg.example/intake_counters/helios-' + day).count, 1, 'and for the workspace');
  var again = await call({ projectId: 'p1', action: 'send', sendId: id1, draft: draft });
  ok(again.ok && again.repeat === true && again.path === s.path, 'the same send again answers with the first');
  eq(MAILS.length, 1, 'and mails nothing more');
  var dr2 = await call({ projectId: 'p1', action: 'draft', facts: {} });
  ok(dr2.lastSent && dr2.lastSent.sentBy === 'dana@nextnrg.example', 'the next draft says it was sent before');
  var s2 = await call({ projectId: 'p1', action: 'send', sendId: sid(), draft: draft, siteMapJpeg: 'data:image/png;base64,' + Buffer.alloc(400, 2).toString('base64') });
  eq(MAILS[1].opts.attachments.length, 1, 'a non-JPEG snapshot is dropped, the form still goes'); ok(s2.ok, 'sent');
  ok(SAVED[0].path !== SAVED[1].path, 'two sends never share a stored file');

  /* limits, on documents no browser can reach */
  reset(); DB.seed('projects/p1/intake_counters/helios-' + day, { count: 5 });
  await refused({ projectId: 'p1', action: 'send', draft: draft, sendId: sid() }, 429, 'five sends a project a day');
  eq(MAILS.length, 0, 'nothing mailed past the limit');
  reset(); DB.seed('omega_orgs/nextnrg.example/intake_counters/helios-' + day, { count: 25 });
  await refused({ projectId: 'p1', action: 'send', draft: draft, sendId: sid() }, 429, 'twenty-five a workspace a day');
  reset(); as({ uid: 's1', email: 'ops@clearsky-usa.com', orgId: 'clearsky-usa.com', staff: true, claims: { email_verified: true } });
  DB.seed('projects/p1/intake_counters/helios-' + day, { count: 5 });
  ok((await call({ projectId: 'p1', action: 'send', draft: draft, sendId: sid() })).ok, 'staff are not held to the daily limit');
  ok((await call({ projectId: 'p1', action: 'draft', facts: {} })).ok, 'and may draft any project');

  /* a send in flight, a failed one, a stale one */
  reset(); var id2 = sid();
  DB.seed('projects/p1/intakes/' + id2, { state: 'sending', startedAt: new Date().toISOString() });
  await refused({ projectId: 'p1', action: 'send', draft: draft, sendId: id2 }, 409, 'a send in flight is not sent twice');
  DB.seed('projects/p1/intakes/' + id2, { state: 'sending', startedAt: new Date(Date.now() - 3600000).toISOString() });
  ok((await call({ projectId: 'p1', action: 'send', draft: draft, sendId: id2 })).ok, 'one that died an hour ago may be retried');
  reset(); MAIL_RESULT = { ok: false, error: 'bounced' }; var id3 = sid();
  await refused({ projectId: 'p1', action: 'send', draft: draft, sendId: id3 }, 502, 'a refused message is reported, the file is still stored');
  eq(SAVED.length, 1, 'stored before the send');
  ok(!DB.data.get('projects/p1').heliosIntake, 'not recorded as sent');
  eq(DB.data.get('projects/p1/intakes/' + id3).state, 'failed', 'the history says it failed');
  MAIL_RESULT = { ok: true, id: 'msg-2' };
  ok((await call({ projectId: 'p1', action: 'send', draft: draft, sendId: id3 })).ok, 'and the retry with the same id goes');
  reset(); SAVE_FAIL = true;
  await refused({ projectId: 'p1', action: 'send', draft: draft, sendId: sid() }, 502, 'a file that cannot be stored is never mailed');
  eq(MAILS.length, 0, 'nothing mailed');

  reset();
  await refused({ projectId: 'nope', action: 'draft' }, 404, 'unknown project');
  await refused({ projectId: 'p1', action: 'delete' }, 400, 'unknown action');
  await refused({ projectId: '../x', action: 'draft' }, 400, 'a path is not an id');
  await refused({ projectId: 'p1' }, 405, 'GET is refused', 'GET');

  /* ── 6 · the editor is wired ── */
  var editor = fs.readFileSync(path.join(ROOT, 'editor.html'), 'utf8');
  ok(/<script src="\/omega-helios-intake\.js"><\/script>/.test(editor), 'the module loads in the editor');
  ok(/onclick="rbRun\(openHeliosIntake\)" data-cap="export"/.test(editor), 'the Output tab has the button, on the export cap');
  ok(/function openHeliosIntake\(\)/.test(editor), 'and its opener');
  var mod = fs.readFileSync(path.join(ROOT, 'omega-helios-intake.js'), 'utf8');
  ok(!/=>|\bconst\b|\blet\b|`/.test(mod), 'the module is ES5');
  ok(/© 2025–2026 ClearSky Energy Solutions LLC/.test(mod), 'and carries the header');
  var icons = require(path.join(ROOT, 'omega-ribbon-icons.js'));
  ok(icons.pathFor('Helios Intake', 'Helios Intake') !== icons.FALLBACK, 'the button has its own icon');
  var pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  ok(!pkg.dependencies['pdf-lib'], 'pdf-lib is vendored, not an npm dependency: the unit job installs nothing');
  ok(fs.existsSync(path.join(ROOT, 'vendor', 'pdf-lib', '1.17.1', 'pdf-lib.min.js')) && fs.existsSync(path.join(ROOT, 'vendor', 'pdf-lib', '1.17.1', 'LICENSE-pdf-lib')), 'the vendored build and its licence are in the repo');
  ok(typeof PDF.PDFDocument === 'object' || typeof PDF.PDFDocument === 'function', 'and it loads under Node');
  ok(fs.existsSync(path.join(ROOT, 'forms', 'helios-first-pass.pdf')), 'the blank form is in the repo');

  console.log('helios intake: ' + checks + ' checks passed.');
})().catch(function (e) { console.error(e && e.stack || e); process.exit(1); });
