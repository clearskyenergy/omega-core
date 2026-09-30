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
var PDF = require('pdf-lib');
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
  wizMode: 'FOM', interconMode: 'service', offtaker: null,
  billImport: { utility: 'Imperial Irrigation District' },
  terrain: { reliefFt: 6, areaFt2: 43560 * 40 },
  workflow: { owner: 'Sample Owner LLC', siteControl: 'loi', appStatus: 'submitted', queuePos: '26INR0042', flood: '0', researchFloodZone: 'X', codDate: '12/15/27', timeline: '18-24 months' },
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
  eq(doc.getForm().getFields().filter(function (f) { return f.constructor.name === 'PDFCheckBox'; }).length, 12, 'twelve attachment boxes');
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
  ok(/wholesale buyer/.test(d.answers.q13.text), 'q13: FOM means a wholesale buyer, never a company name');
  eq(d.answers.q14.text, '', 'q14 blank'); eq(d.answers.q15.text, '', 'q15 blank');
  ok(/Imperial County/.test(d.answers.q16.text) && /M-1/.test(d.answers.q16.text) && /not on the project record/.test(d.answers.q16.text), 'q16: county, zoning, and no claim about permitted use');
  eq(d.answers.q17.text, '', 'q17 blank without a permit pack');
  ok(/not in a mapped floodplain/.test(d.answers.q18.text) && /zone X/.test(d.answers.q18.text) && /not screened by OMEGA/.test(d.answers.q18.text), 'q18: flood from the workflow, and what was not screened');
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
  var btm = H.compose({ project: PROJECT, org: ORG, caller: CALLER, facts: { wizMode: 'BTM', interconMode: 'none', offtaker: { name: 'Cold storage' } } });
  ok(/Behind the meter/.test(btm.answers.q7.text) && /no new point of interconnection/.test(btm.answers.q7.text), 'BTM classification');
  ok(/host facility/.test(btm.answers.q13.text) && /Cold storage/.test(btm.answers.q13.text), 'BTM buyer is the host, with the load class');
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
  var boxes = form.getFields().filter(function (f) { return f.constructor.name === 'PDFCheckBox'; });
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

  /* ── 5 · the door ── */
  var AUTH, DOCS, SETS, ADDS, SAVED, MAILS, MAIL_ON, MAIL_RESULT, CLIENT_ADMIN;
  function reset() {
    AUTH = function () { return Promise.resolve({ uid: 'u1', email: 'dana@nextnrg.example', orgId: 'nextnrg.example', staff: false, claims: { email_verified: true, name: 'Dana Ortiz' } }); };
    DOCS = { 'projects/p1': Object.assign({}, PROJECT), 'omega_orgs/nextnrg.example': Object.assign({}, ORG), 'fin_settings/dealroom': { orgs: { helios: ['intake@helios.example'] } } };
    SETS = []; ADDS = []; SAVED = []; MAILS = []; MAIL_ON = true; MAIL_RESULT = { ok: true, id: 'msg-1' }; CLIENT_ADMIN = false;
    delete process.env.HELIOS_INTAKE_EMAIL; delete process.env.MAIL_NOTIFY;
  }
  function httpError(s, m) { var e = new Error(m); e.status = s; return e; }
  function fakeDb() {
    function doc(col, id) {
      return { id: id,
        get: function () { return Promise.resolve({ exists: !!DOCS[col + '/' + id], data: function () { return DOCS[col + '/' + id]; } }); },
        set: function (data, o) { SETS.push({ path: col + '/' + id, data: data, opts: o }); DOCS[col + '/' + id] = Object.assign({}, DOCS[col + '/' + id], data); return Promise.resolve(); },
        collection: function (sub) { return { add: function (data) { ADDS.push({ path: col + '/' + id + '/' + sub, data: data }); return Promise.resolve({ id: 'h1' }); } }; } };
    }
    return { collection: function (col) { return { doc: function (id) { return doc(col, id); } }; } };
  }
  var fakeAdmin = { handler: function (fn) { return fn; }, httpError: httpError, authenticate: function (req) { return AUTH(req); }, db: fakeDb,
    canActInOrg: function (caller, org) { return Promise.resolve(!!caller.staff || caller.orgId === org); },
    clientAdmin: function () { return Promise.resolve(!!CLIENT_ADMIN); },
    init: function () { return { storage: function () { return { bucket: function () { return { file: function (p) { return { save: function (bytes, o) { SAVED.push({ path: p, bytes: bytes, opts: o }); return Promise.resolve(); } }; } }; } }; } }; },
    FieldValue: function () { return { increment: function (n) { return { __inc: n }; } }; } };
  var fakeMail = { configured: function () { return MAIL_ON; }, send: function (to, subject, html, text, opts) { MAILS.push({ to: to, subject: subject, html: html, opts: opts }); return Promise.resolve(MAIL_RESULT); },
    layout: function (t, b) { return '<html>' + b + '</html>'; }, esc: function (s) { return String(s == null ? '' : s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); } };
  function inject(rel, exp) { var p = require.resolve(path.join(ROOT, 'api', '_lib', rel)); require.cache[p] = { id: p, filename: p, loaded: true, exports: exp }; }
  inject('admin.js', fakeAdmin); inject('mail.js', fakeMail);
  var api = require(path.join(ROOT, 'api', 'helios-intake.js'));
  function call(body, method) { return api({ method: method || 'POST', headers: {}, body: body }); }
  async function refused(body, status, why, method) { try { await call(body, method); assert.fail('expected ' + status + ': ' + why); } catch (e) { eq(e.status, status, why + ' → ' + e.message); } }

  reset();
  var dr = await call({ projectId: 'p1', action: 'draft', facts: RICH });
  ok(dr.ok && dr.configured && dr.to[0] === 'intake@helios.example' && dr.draft.answers.q12.text.length > 0, 'draft: composed, and says where it will go');
  ok(dr.draft.questions && dr.draft.attachmentLabels, 'draft carries the labels the dialog prints');
  eq(SETS.length + ADDS.length + SAVED.length + MAILS.length, 0, 'draft writes nothing');

  var pv = await call({ projectId: 'p1', action: 'preview', draft: draft });
  ok(pv.ok && pv.pdfBase64 && pv.fileName, 'preview hands back the PDF');
  var pvDoc = await PDF.PDFDocument.load(Buffer.from(pv.pdfBase64, 'base64'));
  ok(pvDoc.getForm().getTextField(H.QUESTION_PREFIX.q2 + ' 1').getText().indexOf('Stand Alone BESS') === 0, 'the preview is filled');
  eq(SETS.length + ADDS.length + SAVED.length + MAILS.length, 0, 'preview writes and sends nothing');

  reset(); AUTH = function () { return Promise.resolve({ uid: 'u2', email: 'new@nextnrg.example', orgId: 'nextnrg.example', staff: false, claims: { email_verified: false } }); };
  await refused({ projectId: 'p1', action: 'send', draft: draft }, 403, 'an unverified member cannot send');
  ok(await call({ projectId: 'p1', action: 'draft', facts: {} }).then(function (r) { return r.ok; }), 'but may draft');
  CLIENT_ADMIN = true;
  ok((await call({ projectId: 'p1', action: 'send', draft: draft })).ok, 'an owner or administrator of an active client sends without the link');

  reset(); DOCS['fin_settings/dealroom'] = {};
  await refused({ projectId: 'p1', action: 'send', draft: draft }, 400, 'no address configured: refused, not guessed');
  eq(MAILS.length, 0, 'nothing mailed');
  process.env.HELIOS_INTAKE_EMAIL = 'env@helios.example';
  ok((await call({ projectId: 'p1', action: 'send', draft: draft })).sentTo[0] === 'env@helios.example', 'the environment address is used');

  reset(); MAIL_ON = false;
  await refused({ projectId: 'p1', action: 'send', draft: draft }, 500, 'mail not configured is a deployment problem');

  reset();
  var jpeg = Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), Buffer.alloc(300, 1)]);
  var s = await call({ projectId: 'p1', action: 'send', draft: draft, message: 'Calexico first pass, per our call.', siteMapJpeg: 'data:image/jpeg;base64,' + jpeg.toString('base64') });
  ok(s.ok && s.sentTo[0] === 'intake@helios.example' && /^projects\/p1\/helios-first-pass-\d{8}T\d{4}\.pdf$/.test(s.path), 'sent, and the file sits in the project\'s own folder: ' + s.path);
  eq(SAVED.length, 1, 'one file stored'); eq(SAVED[0].opts.contentType, 'application/pdf', 'as a PDF');
  eq(MAILS.length, 1, 'one email');
  eq(MAILS[0].to, 'intake@helios.example', 'to Helios');
  eq(MAILS[0].opts.cc, 'dana@nextnrg.example, dev@clearsky-usa.com', 'the sender and ClearSky in copy');
  eq(MAILS[0].opts.replyTo, 'dana@nextnrg.example', 'replies reach the sender');
  eq(MAILS[0].opts.attachments.length, 2, 'the form and the snapshot');
  eq(MAILS[0].opts.attachments[0].contentType, 'application/pdf', 'the PDF first');
  eq(MAILS[0].opts.attachments[1].filename, 'site-map.jpg', 'then the site map');
  ok(/Calexico first pass, per our call\./.test(MAILS[0].html) && /NextNRG/.test(MAILS[0].html) && /Dana Ortiz/.test(MAILS[0].html), 'the mail names the sender and carries the message');
  ok(/First pass checklist — 225 Cesar Chavez Blvd — Calexico/.test(MAILS[0].subject), 'subject names the project');
  var rec = SETS.filter(function (x) { return x.path === 'projects/p1'; })[0];
  ok(rec && rec.opts && rec.opts.merge === true && rec.data.heliosIntake.sentTo[0] === 'intake@helios.example' && rec.data.heliosIntake.count.__inc === 1 && rec.data.heliosIntake.snapshot === true, 'the send is recorded on the project, merged, counted');
  ok(ADDS.length === 1 && ADDS[0].path === 'projects/p1/intakes' && ADDS[0].data.kind === 'helios-first-pass', 'and in the project\'s history');
  var dr2 = await call({ projectId: 'p1', action: 'draft', facts: {} });
  ok(dr2.lastSent && dr2.lastSent.sentBy === 'dana@nextnrg.example', 'the next draft says it was sent before');

  reset();
  var s2 = await call({ projectId: 'p1', action: 'send', draft: draft, siteMapJpeg: 'data:image/png;base64,' + Buffer.alloc(400, 2).toString('base64') });
  eq(MAILS[0].opts.attachments.length, 1, 'a non-JPEG snapshot is dropped, the form still goes'); ok(s2.ok, 'sent');

  reset(); MAIL_RESULT = { ok: false, error: 'bounced' };
  await refused({ projectId: 'p1', action: 'send', draft: draft }, 502, 'a refused message is reported, the file is still stored');
  eq(SAVED.length, 1, 'stored before the send');
  eq(SETS.length, 0, 'not recorded as sent');

  reset(); AUTH = function () { return Promise.resolve({ uid: 'u9', email: 'x@other.example', orgId: 'other.example', staff: false, claims: { email_verified: true } }); };
  await refused({ projectId: 'p1', action: 'draft', facts: {} }, 403, 'another workspace cannot even draft');
  reset(); AUTH = function () { return Promise.resolve({ uid: 's1', email: 'ops@clearsky-usa.com', orgId: 'clearsky-usa.com', staff: true, claims: { email_verified: true } }); };
  ok((await call({ projectId: 'p1', action: 'draft', facts: {} })).ok, 'staff may');
  reset(); DOCS['omega_orgs/nextnrg.example'].status = 'suspended';
  await refused({ projectId: 'p1', action: 'send', draft: draft }, 403, 'a suspended workspace cannot send');
  reset(); delete DOCS['omega_orgs/nextnrg.example'];
  ok((await call({ projectId: 'p1', action: 'send', draft: draft })).ok, 'no workspace record: fails open, like the editor gate');
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
  ok(pkg.dependencies['pdf-lib'], 'pdf-lib is a dependency of the function');
  ok(fs.existsSync(path.join(ROOT, 'forms', 'helios-first-pass.pdf')), 'the blank form is in the repo');

  console.log('helios intake: ' + checks + ' checks passed.');
})().catch(function (e) { console.error(e && e.stack || e); process.exit(1); });
