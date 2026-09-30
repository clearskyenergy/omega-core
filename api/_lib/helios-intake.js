/* api/_lib/helios-intake.js — Helios Energy Advisors' first-pass checklist,
   filled from a project.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Helios hands a developer a fillable PDF ("Large Land Deal First Pass
   Checklist": eighteen questions, an attachment list and a status block)
   before it will look at a deal. This library is the ONE place that knows
   that form: which of its fields answer which question, how a long answer
   is wrapped across the printed lines, and what a project can honestly say
   in each box.

   THREE RULES.
   1. Read, never invent. compose() writes an answer only from a fact the
      project, the drawing, a lookup the person ran, or the Viability
      Workflow actually holds, and says where each one came from. A question
      the platform cannot answer stays BLANK for the person to fill; the
      platform never writes "Unknown" on its own say-so, because a wrong
      "Unknown" on a question the developer can answer is worse than a blank.
   2. Helios's file, not a redrawn page. fill() writes into the form's own
      AcroForm fields (the same way ev-cost-workbook.html fills United
      Illuminating's application), so what lands on their desk is the form
      they issued with the answers in the boxes.
   3. A screening figure says so. Anything from Grid Atlas or the parcel
      service carries its caveat in the answer text, next to the number,
      because the sentence is what gets read and the footnote is not.

   The blank form is forms/helios-first-pass.pdf. scripts/tests/thelios.js
   pins its field names, so a new revision of the form fails the test instead
   of producing a blank page. */
'use strict';
var fs = require('fs'), path = require('path');

var TEMPLATE_PATH = path.join(__dirname, '..', '..', 'forms', 'helios-first-pass.pdf');
/* pdf-lib, self-hosted under vendor/ like the scan library (MIT; the
   licence sits beside it). ONE copy, required by a literal path so the
   function bundler carries it and the unit tests run with no install —
   the CI job that runs scripts/tests/t*.js fetches nothing. */
function pdfLib() { return require('../../vendor/pdf-lib/1.17.1/pdf-lib.min.js'); }
var TEMPLATE_URL = '/forms/helios-first-pass.pdf';

/* ── the form's fields, by what they answer ─────────────────────────── */
var COVER = { submittedBy: 'Submitted by', projectNameLocation: 'Project name and location', date: 'Date10_af_date' };
/* each question's lines are named "<prefix> 1", "<prefix> 2", … as Acrobat
   named them off the printed text; fill() finds how many there are */
var QUESTION_PREFIX = {
  q1: '1 Where is the property Include address county state parcel numbers and approximate acreage',
  q2: 'kW or MW and if applicable MWh and storage duration',
  q3: 'purchase agreement',
  q4: '4 Is a current deed or title report available Attach the most recent copy',
  q5: 'other claims affecting the property Attach available documents',
  q6: '6 What utility serves the property Is it investor owned municipal or a cooperative',
  q7: 'interconnection behind the meter non export or wholesale generation',
  q8: '8 Who is the utility or interconnection contact Provide department name phone number and email if known',
  q9: 'queue number and attach any response',
  q10: '10 What documents studies deposits or other requirements has the utility identified',
  q11: 'could take multiple years',
  q12: 'known and attach a map or screenshot',
  q13: '13 Who will buy or use the power utility data center business cooperative municipality or another buyer',
  q14: '14 Is there an LOI term sheet PPA utility program or other written evidence of buyer interest Attach it if available',
  q15: 'confirmed as allowable',
  q16: 'property',
  q17: 'special study',
  q18: 'airport concerns or community opposition'
};
var STATUS = {
  constructionStart: 'Target construction start',
  cod: 'Target commercial operation date',
  totalCost: 'Estimated total project cost',
  financing: 'Amount and type of financing requested'
};
/* the attachment list as printed: six rows, left column then right. The
   boxes are placed by where they sit on the page, never by their names
   ("undefined_7"), which say nothing. */
var ATTACHMENTS = [
  ['addressParcel', 'landownerSiteControl'],
  ['deedTitle', 'titleCommitment'],
  ['boundaryKml', 'layoutSitePlan'],
  ['utilityContact', 'utilityResponse'],
  ['queueRecord', 'distanceMap'],
  ['buyerLoiPpa', 'permitEnvironmental']
];
var ATTACHMENT_LABEL = {
  addressParcel: 'Address and parcel numbers', landownerSiteControl: 'Landowner and site control documents',
  deedTitle: 'Current deed or title report', titleCommitment: 'Title commitment and exceptions',
  boundaryKml: 'Property boundary map or KML/KMZ', layoutSitePlan: 'Preliminary layout or site plan',
  utilityContact: 'Utility contact information', utilityResponse: 'Utility requirements or response',
  queueRecord: 'Interconnection or queue record', distanceMap: 'Line or substation distance map',
  buyerLoiPpa: 'Buyer LOI term sheet or PPA', permitEnvironmental: 'Known permit or environmental information'
};
/* the questions as the person sees them in the dialog: short, in the form's words */
var QUESTIONS = {
  q1: 'Where is the property? Address, county, state, parcel numbers and approximate acreage.',
  q2: 'Proposed technology: Solar PV, Solar plus BESS, Stand Alone BESS or Other. Estimated kW or MW, MWh and storage duration.',
  q3: 'Who owns the land, and does the project have site control? Attach ownership and any signed option, lease or purchase agreement.',
  q4: 'Is a current deed or title report available? Attach the most recent copy.',
  q5: 'Title commitments or exceptions: mortgages, liens, easements, mineral rights, restrictions or other claims. Attach documents.',
  q6: 'What utility serves the property? Investor owned, municipal or a cooperative?',
  q7: 'Project classification and process: distribution or transmission interconnection, behind the meter, non-export or wholesale generation?',
  q8: 'Utility or interconnection contact: department, name, phone and email, if known.',
  q9: 'Has the utility been contacted or an interconnection application submitted? Application or queue number; attach any response.',
  q10: 'Documents, studies, deposits or other requirements the utility has identified.',
  q11: 'Timeline the utility has provided. Any delay, moratorium, backlog or multi-year indication.',
  q12: 'Expected connection point: nearest line or substation, approximate distance, voltage if known. Attach a map or screenshot.',
  q13: 'Who will buy or use the power: utility, data center, business, cooperative, municipality or another buyer?',
  q14: 'LOI, term sheet, PPA, utility program or other written evidence of buyer interest. Attach if available.',
  q15: 'If a cooperative or municipal utility is involved, who supplies its wholesale power, and has the project been confirmed as allowable?',
  q16: 'Which county, city or other authority will approve the project? Is large scale solar or storage allowed on the property?',
  q17: 'Estimated permitting timeline. Any hearing, rezoning, public meeting, moratorium, size limit or special study.',
  q18: 'Known wetlands, flood zones, protected species, contamination, protected farmland, steep slopes, airport concerns or community opposition.'
};

/* ── small helpers ──────────────────────────────────────────────────── */
function str(v, max) { v = (v == null) ? '' : String(v); v = v.replace(/\s+/g, ' ').trim(); return max ? v.slice(0, max) : v; }
function num(v) { var n = Number(v); return (typeof v !== 'boolean' && v !== '' && v != null && isFinite(n)) ? n : null; }
function fmtNum(n, dp) { return Number(n).toLocaleString('en-US', { maximumFractionDigits: dp == null ? 1 : dp }); }
function money(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
function mdy(d) { d = d || new Date(); return (d.getMonth() + 1) + '/' + d.getDate() + '/' + String(d.getFullYear()).slice(2); }
function longDate(d) { d = d || new Date(); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
function kmToMi(km) { return Math.round(km * 0.621371 * 10) / 10; }
function joinNice(parts, sep) { return parts.filter(function (p) { return p != null && String(p).trim() !== ''; }).join(sep || ' · '); }
function valid(email) { return /.+@.+\..+/.test(String(email || '').trim()); }

/* ── what the browser sends: cleaned, capped, nothing trusted blindly ── */
function cleanFacts(raw) {
  raw = (raw && typeof raw === 'object') ? raw : {};
  function o(k) { return (raw[k] && typeof raw[k] === 'object') ? raw[k] : {}; }
  var site = o('site'), ga = o('gridAtlas'), grid = o('grid'), sl = o('substationLookup'), dr = o('drawing'),
      bess = o('bess'), run = o('run'), bill = o('billImport'), jur = o('jurisdiction'), ter = o('terrain'),
      wf = o('workflow'), ap = o('autopilot'), apParcel = (ap.parcel && typeof ap.parcel === 'object') ? ap.parcel : {},
      off = (raw.offtaker && typeof raw.offtaker === 'object') ? raw.offtaker : { name: raw.offtaker };
  function line(x) { x = (x && typeof x === 'object') ? x : {}; return { name: str(x.name, 120), voltageKv: num(x.voltageKv), distanceKm: num(x.distanceKm), owner: str(x.owner, 120) }; }
  return {
    name: str(raw.name, 160), address: str(raw.address, 300), city: str(raw.city, 80), state: str(raw.state, 2).toUpperCase(),
    site: { county: str(site.county, 80), state: str(site.state, 2).toUpperCase(), zip: str(site.zip, 10),
            parcelApn: str(site.parcelApn, 60), parcelAcres: num(site.parcelAcres), parcelOwner: str(site.parcelOwner, 160),
            parcelZoning: str(site.parcelZoning, 60), parcelSource: str(site.parcelSource, 80),
            ahjName: str(site.ahjName, 120), ahjPermitDays: num(site.ahjPermitDays) },
    gridAtlas: { nearestSubstationName: str(ga.nearestSubstationName, 120), nearestSubstationKm: num(ga.nearestSubstationKm),
                 nearestSubstationKv: num(ga.nearestSubstationKv), owner: str(ga.owner, 120), score: num(ga.score) },
    grid: { substations: (Array.isArray(grid.substations) ? grid.substations : []).slice(0, 3).map(line),
            lines: (Array.isArray(grid.lines) ? grid.lines : []).slice(0, 3).map(line), ranAt: str(grid.ranAt, 40) },
    substationLookup: { name: str(sl.name, 120), kv: num(sl.kv), miles: num(sl.miles), dir: str(sl.dir, 4), capMw: num(sl.capMw), source: str(sl.source, 120) },
    drawing: { tech: str(dr.tech, 20), solarKwDc: num(dr.solarKwDc), solarKwAc: num(dr.solarKwAc), bessKw: num(dr.bessKw), bessKwh: num(dr.bessKwh),
               evPorts: num(dr.evPorts), itKw: num(dr.itKw), capex: num(dr.capex), units: num(dr.units), elements: num(dr.elements),
               hasBoundary: dr.hasBoundary === true },
    bess: { chem: str(bess.chem, 20), mfr: str(bess.mfr, 60), model: str(bess.model, 60) },
    run: { total: num(run.total), at: num(run.at), contracted: run.contracted === true },
    wizMode: str(raw.wizMode, 8).toUpperCase(), interconMode: str(raw.interconMode, 20),
    offtaker: { name: str(off && off.name, 80) },
    billImport: { utility: str(bill.utility, 120), rateSchedule: str(bill.rateSchedule, 80) },
    jurisdiction: { state: str(jur.state, 2).toUpperCase(), utility: str(jur.utility, 120), known: jur.known === true, multiUtility: jur.multiUtility === true },
    terrain: { reliefFt: num(ter.reliefFt), areaFt2: num(ter.areaFt2) },
    workflow: { owner: str(wf.owner, 160), siteControl: str(wf.siteControl, 20), utility: str(wf.utility, 40), flood: str(wf.flood, 4),
                pathFinal: str(wf.pathFinal, 8).toUpperCase(), appStatus: str(wf.appStatus, 20), queuePos: str(wf.queuePos, 60), timeline: str(wf.timeline, 60),
                ahj: str(wf.ahj, 120), fireDept: str(wf.fireDept, 120), zoning: str(wf.zoning, 80), notes: str(wf.notes, 400), codDate: str(wf.codDate, 20),
                researchUtility: str(wf.researchUtility, 120), researchFloodZone: str(wf.researchFloodZone, 40), updatedAt: num(wf.updatedAt) },
    autopilot: { parcel: { apn: str(apParcel.apn, 60), acres: num(apParcel.acres), county: str(apParcel.county, 80), source: str(apParcel.source, 80) },
                 nearestSubstationKm: num(ap.nearestSubstationKm), owner: str(ap.owner, 120) },
    hasMap: raw.hasMap === true
  };
}

/* the Viability Workflow's own words for its codes */
var SITE_CONTROL = { owned: 'fee simple owned', long_lease: 'long-term lease (5+ years)', loi: 'LOI / in negotiation', none: 'no site control yet' };
var APP_STATUS = { not_started: 'not started', preapp: 'pre-application requested', submitted: 'application submitted', study: 'in the study phase', agreement: 'interconnection agreement received', executed: 'interconnection agreement executed' };
var WF_UTILITY = { comed: 'ComEd', ameren: 'Ameren Illinois', pge: 'PG&E', sce: 'Southern California Edison (SCE)', sdge: 'SDG&E', ladwp: 'LADWP' };
var TECH_LABEL = { storage: 'Stand Alone BESS', solar_bess: 'Solar plus BESS', solar: 'Solar PV', datacenter: 'Other — data center load', ev: 'Other — EV charging', land: 'Other', efficiency: 'Other' };

/* ── compose: what the project can honestly say, with its sources ─────
   input: { project, org, caller: {email, name}, facts, today }
   returns { cover, answers, status, attachments, provenance, sendingAs } */
function compose(input) {
  input = input || {};
  var p = input.project || {}, org = input.org || {}, caller = input.caller || {}, f = cleanFacts(input.facts), today = input.today || new Date();
  var A = {}, prov = [];
  function answer(q, text, sources) { A[q] = { text: str(text, 2000), sources: sources || [] }; }
  function note(item, value, source) { prov.push([item, value, source]); }

  /* identity */
  var orgName = str(org.name, 120) || str(org.slug, 60) || str(p.orgId, 80) || '';
  var who = joinNice([str(caller.name, 80), str(caller.email, 120)], ' · ');
  var name = f.name || str(p.name, 160) || '';
  var address = f.address || str(p.address, 300) || '';
  var state = f.state || f.site.state || f.jurisdiction.state || str(p.state, 2).toUpperCase() || '';
  var county = f.site.county || f.autopilot.parcel.county || str(p.county, 80) || '';
  var countySrc = f.site.county ? 'the geocoded site' : (f.autopilot.parcel.county ? 'the parcel record' : '');

  var cover = {
    submittedBy: joinNice([orgName, who], '\n'),
    projectNameLocation: joinNice([name, joinNice([address, county ? county + (/county/i.test(county) ? '' : ' County') : '', state && !address ? state : ''], ' · ')], '\n'),
    date: mdy(today)
  };
  note('Cover', 'Workspace, person, project name, address, date', 'the workspace record, the signed-in account, the project record');

  /* 1 · property */
  var apn = f.site.parcelApn || f.autopilot.parcel.apn, acres = f.site.parcelAcres != null ? f.site.parcelAcres : f.autopilot.parcel.acres;
  var parcelSrc = f.site.parcelSource || f.autopilot.parcel.source || 'the parcel service';
  var q1 = [], q1s = [];
  if (address) { q1.push(address); q1s.push('project record'); }
  if (county) { q1.push(county + (/county/i.test(county) ? '' : ' County') + (state ? ', ' + state : '')); q1s.push('county from ' + countySrc); }
  else if (state) q1.push(state);
  if (apn) { q1.push('APN ' + apn); q1s.push('parcel number from ' + parcelSrc); }
  if (acres != null && acres > 0) { q1.push('approx. ' + fmtNum(acres, 1) + ' acres (parcel boundary from ' + parcelSrc + ')'); q1s.push('acreage measured from the parcel boundary'); }
  answer('q1', q1.join(' · '), q1s);
  note('1 Property', A.q1.text || '(blank)', q1s.join('; ') || 'nothing on the project');

  /* 2 · technology and size */
  var d = f.drawing, q2 = [], q2s = [];
  var tech = TECH_LABEL[d.tech] || '';
  var bessKw = d.bessKw != null && d.bessKw > 0 ? d.bessKw : (num(p.bessKw) > 0 ? num(p.bessKw) : null);
  var bessKwh = d.bessKwh != null && d.bessKwh > 0 ? d.bessKwh : (num(p.bessKwh) > 0 ? num(p.bessKwh) : null);
  if (!tech && bessKwh) tech = 'Stand Alone BESS';
  if (tech) q2.push(tech);
  var size = [];
  if (d.solarKwDc > 0) size.push(fmtNum(d.solarKwDc / 1000, 2) + ' MWdc solar' + (d.solarKwAc > 0 ? ' (' + fmtNum(d.solarKwAc / 1000, 2) + ' MWac)' : ''));
  if (bessKw || bessKwh) {
    var s = [];
    if (bessKw) s.push(fmtNum(bessKw / 1000, 2) + ' MW');
    if (bessKwh) s.push(fmtNum(bessKwh / 1000, 2) + ' MWh');
    if (bessKw && bessKwh) s.push(fmtNum(bessKwh / bessKw, 1) + '-hour');
    size.push('storage ' + s.join(' / '));
  }
  if (d.itKw > 0) size.push(fmtNum(d.itKw / 1000, 2) + ' MW of IT load');
  if (d.evPorts > 0) size.push(fmtNum(d.evPorts, 0) + ' EV charging ports');
  if (size.length) { q2.push(size.join('; ')); q2s.push(d.bessKw > 0 || d.solarKwDc > 0 ? 'the site map drawing' : 'the project record'); }
  if (f.bess.chem) { q2.push(f.bess.chem + (f.bess.mfr ? ' (' + joinNice([f.bess.mfr, f.bess.model], ' ') + ')' : '')); q2s.push('battery catalogue'); }
  if (d.units > 0) q2.push(fmtNum(d.units, 0) + ' enclosure' + (d.units === 1 ? '' : 's') + ' placed');
  answer('q2', q2.join(' · '), q2s);
  note('2 Technology', A.q2.text || '(blank)', q2s.join('; ') || 'nothing placed on the site map');

  /* 3 · owner and site control */
  var q3 = [], q3s = [];
  if (f.site.parcelOwner) { q3.push('Owner of record per ' + parcelSrc + ': ' + f.site.parcelOwner); q3s.push('parcel record'); }
  if (f.workflow.owner) { q3.push('Owner / entity: ' + f.workflow.owner); q3s.push('Viability Workflow'); }
  if (f.workflow.siteControl && SITE_CONTROL[f.workflow.siteControl]) { q3.push('Site control: ' + SITE_CONTROL[f.workflow.siteControl]); if (q3s.indexOf('Viability Workflow') < 0) q3s.push('Viability Workflow'); }
  answer('q3', q3.join('. '), q3s);
  note('3 Owner and site control', A.q3.text || '(blank)', q3s.join('; ') || 'not on the project — the developer answers');

  answer('q4', '', []); answer('q5', '', []);
  note('4 Deed or title', '(blank)', 'never on the platform — attach');
  note('5 Title exceptions', '(blank)', 'never on the platform — attach');

  /* 6 · utility */
  var q6 = [], q6s = [];
  var util = f.billImport.utility || (WF_UTILITY[f.workflow.utility] || (f.workflow.utility && f.workflow.utility !== 'other' ? f.workflow.utility : '')) || f.workflow.researchUtility || str(p.utility, 120);
  if (util) { q6.push(util); q6s.push(f.billImport.utility ? 'the imported utility bill' : (f.workflow.utility || f.workflow.researchUtility ? 'Viability Workflow' : 'project record')); }
  else if (f.jurisdiction.known && f.jurisdiction.utility && !f.jurisdiction.multiUtility) { q6.push(f.jurisdiction.utility + ' (the sole investor-owned utility in ' + (f.jurisdiction.state || state) + ' — confirm on a bill)'); q6s.push('state utility table'); }
  answer('q6', q6.join(' · '), q6s);
  note('6 Utility', A.q6.text || '(blank)', q6s.join('; ') || 'not on the project; ownership type (IOU, municipal, co-op) is never held');

  /* 7 · classification */
  var q7 = [], q7s = [];
  var mode = f.workflow.pathFinal || f.wizMode || str(p.wizMode, 8).toUpperCase();
  var ic = f.interconMode || str(p.interconMode, 20);
  if (mode === 'BTM') { q7.push('Behind the meter — on the customer side of the existing service'); }
  else if (mode === 'FTM' || mode === 'FOM') { q7.push('Front of meter — export / wholesale'); }
  else if (mode === 'DUAL') { q7.push('Behind the meter with export (dual)'); }
  else if (mode === 'EVSE' || mode === 'L2') { q7.push('Behind the meter — EV charging load on the site service'); }
  if (mode) q7s.push(f.workflow.pathFinal ? 'Viability Workflow decision' : 'site map project mode');
  if (ic === 'none') { q7.push('no new point of interconnection drawn'); q7s.push('site map POI setting'); }
  else if (ic === 'service') { q7.push('point of interconnection drawn as a utility step-up transformer on a distribution circuit (distribution interconnection)'); q7s.push('site map POI setting'); }
  else if (ic === 'substation') { q7.push('point of interconnection drawn at a substation (transmission-level tap / gen-tie)'); q7s.push('site map POI setting'); }
  answer('q7', q7.join('; '), q7s);
  note('7 Classification', A.q7.text || '(blank)', q7s.join('; ') || 'no project mode chosen');

  answer('q8', '', []); note('8 Utility contact', '(blank)', 'never on the platform — the developer answers');

  /* 9 · application and queue */
  var q9 = [], q9s = [];
  if (f.workflow.appStatus && APP_STATUS[f.workflow.appStatus]) { q9.push('Interconnection: ' + APP_STATUS[f.workflow.appStatus]); q9s.push('Viability Workflow'); }
  if (f.workflow.queuePos) { q9.push('queue / application number ' + f.workflow.queuePos); if (!q9s.length) q9s.push('Viability Workflow'); }
  answer('q9', q9.join('; '), q9s);
  note('9 Application and queue', A.q9.text || '(blank)', q9s.join('; ') || 'not on the project — the developer answers');

  answer('q10', '', []); note('10 Utility requirements', '(blank)', 'never on the platform');
  var q11 = [], q11s = [];
  if (f.workflow.timeline) { q11.push('Estimated interconnection timeline per the developer\'s workflow: ' + f.workflow.timeline); q11s.push('Viability Workflow'); }
  answer('q11', q11.join(' '), q11s);
  note('11 Utility timeline', A.q11.text || '(blank)', q11s.join('; ') || 'never on the platform');

  /* 12 · connection point */
  var q12 = [], q12s = [];
  var sub = f.grid.substations[0] || null;
  if (sub && (sub.name || sub.distanceKm != null)) {
    q12.push('Nearest substation per Grid Atlas' + (f.grid.ranAt ? ' (' + f.grid.ranAt.slice(0, 10) + ')' : '') + ': ' + joinNice([sub.name, sub.voltageKv != null ? fmtNum(sub.voltageKv, 0) + ' kV' : '', sub.distanceKm != null ? 'about ' + fmtNum(kmToMi(sub.distanceKm), 1) + ' mi' : '', sub.owner ? 'owner ' + sub.owner : ''], ', '));
    q12s.push('Grid Atlas');
  } else if (f.gridAtlas.nearestSubstationKm != null) {
    q12.push('Nearest substation per Grid Atlas: ' + joinNice([f.gridAtlas.nearestSubstationName, f.gridAtlas.nearestSubstationKv != null ? fmtNum(f.gridAtlas.nearestSubstationKv, 0) + ' kV' : '', 'about ' + fmtNum(kmToMi(f.gridAtlas.nearestSubstationKm), 1) + ' mi', f.gridAtlas.owner ? 'owner ' + f.gridAtlas.owner : ''], ', '));
    q12s.push('Grid Atlas');
  } else if (f.autopilot.nearestSubstationKm != null) {
    q12.push('Nearest substation about ' + fmtNum(kmToMi(f.autopilot.nearestSubstationKm), 1) + ' mi' + (f.autopilot.owner ? ' (owner ' + f.autopilot.owner + ')' : ''));
    q12s.push('Grid Atlas (autopilot run)');
  }
  var ln = f.grid.lines[0] || null;
  if (ln && (ln.voltageKv != null || ln.distanceKm != null)) { q12.push('nearest line ' + joinNice([ln.voltageKv != null ? fmtNum(ln.voltageKv, 0) + ' kV' : '', ln.distanceKm != null ? 'about ' + fmtNum(kmToMi(ln.distanceKm), 1) + ' mi' : ''], ', ')); }
  if (f.substationLookup.name || f.substationLookup.miles != null) {
    q12.push('Substation lookup: ' + joinNice([f.substationLookup.name, f.substationLookup.kv != null ? fmtNum(f.substationLookup.kv, 0) + ' kV' : '', f.substationLookup.miles != null ? fmtNum(f.substationLookup.miles, 1) + ' mi ' + f.substationLookup.dir : '', f.substationLookup.capMw != null ? fmtNum(f.substationLookup.capMw, 0) + ' MW planning basis' : ''], ', '));
    q12s.push('substation lookup' + (f.substationLookup.source ? ' (' + f.substationLookup.source + ')' : ''));
  }
  if (q12.length) q12.push('Screening estimate from public grid data — not a substitute for the utility interconnection study.');
  answer('q12', q12.join('; '), q12s);
  note('12 Connection point', A.q12.text || '(blank)', q12s.join('; ') || 'Grid Atlas has not run on this site');

  /* 13 · buyer */
  var q13 = [], q13s = [];
  if (mode === 'BTM' || mode === 'EVSE' || mode === 'L2') {
    q13.push(mode === 'BTM' ? 'The host facility\'s own load (behind the meter)' : 'EV charging at the site (behind the meter)');
    if (f.offtaker.name || str(p.offtaker && p.offtaker.name, 80)) q13.push('load class: ' + (f.offtaker.name || str(p.offtaker.name, 80)));
    q13s.push('site map project mode' + (f.offtaker.name ? '; guided build offtaker class' : ''));
  } else if (mode === 'FTM' || mode === 'FOM' || mode === 'DUAL') {
    q13.push('Utility / wholesale buyer — front-of-meter project; no offtaker is named on the project record');
    q13s.push('site map project mode');
  }
  answer('q13', q13.join(' · '), q13s);
  note('13 Power buyer', A.q13.text || '(blank)', q13s.join('; ') || 'no project mode chosen; a buyer is never a company name here');

  answer('q14', '', []); note('14 LOI / PPA', '(blank)', 'never on the platform — attach');
  answer('q15', '', []); note('15 Co-op / municipal supply', '(blank)', 'never on the platform');

  /* 16 · authority and use */
  var q16 = [], q16s = [];
  var ahj = f.workflow.ahj || f.site.ahjName;
  if (ahj) { q16.push('Authority having jurisdiction: ' + ahj); q16s.push(f.workflow.ahj ? 'Viability Workflow' : 'site data'); }
  else if (county) { q16.push('County: ' + county + (/county/i.test(county) ? '' : ' County') + (state ? ', ' + state : '') + (f.city ? '; city on the address: ' + f.city : '') + ' — confirm which is the land-use authority for this parcel'); q16s.push('geocoded site'); }
  if (f.workflow.fireDept) { q16.push('fire authority: ' + f.workflow.fireDept); }
  var zoning = f.workflow.zoning || f.site.parcelZoning;
  if (zoning) { q16.push('parcel zoning: ' + zoning + (f.site.parcelZoning && !f.workflow.zoning ? ' (per ' + parcelSrc + ')' : '')); q16s.push(f.workflow.zoning ? 'Viability Workflow' : 'parcel record'); }
  if (q16.length) q16.push('Whether utility-scale solar or storage is a permitted use on this parcel is not on the project record — confirm with the authority.');
  answer('q16', q16.join('; '), q16s);
  note('16 Authority and use', A.q16.text || '(blank)', q16s.join('; ') || 'nothing on the project');

  var q17 = [], q17s = [];
  if (f.site.ahjPermitDays != null && f.site.ahjPermitDays > 0) { q17.push('Typical permit turnaround on file for the jurisdiction: about ' + fmtNum(f.site.ahjPermitDays, 0) + ' days'); q17s.push('site data'); }
  answer('q17', q17.join(' '), q17s);
  note('17 Permitting timeline', A.q17.text || '(blank)', q17s.join('; ') || 'not on the project — the developer answers');

  /* 18 · site concerns */
  var q18 = [], q18s = [];
  if (f.workflow.flood === '1') { q18.push('Flood: in a mapped floodplain per the developer\'s workflow' + (f.workflow.researchFloodZone ? ' (FEMA zone ' + f.workflow.researchFloodZone + ')' : '') + ' — review'); q18s.push('Viability Workflow'); }
  else if (f.workflow.flood === '0') { q18.push('Flood: not in a mapped floodplain per the developer\'s workflow' + (f.workflow.researchFloodZone ? ' (FEMA zone ' + f.workflow.researchFloodZone + ')' : '')); q18s.push('Viability Workflow'); }
  else if (f.workflow.researchFloodZone) { q18.push('FEMA flood zone ' + f.workflow.researchFloodZone + ' per the developer\'s workflow research'); q18s.push('Viability Workflow'); }
  if (f.terrain.reliefFt != null && f.terrain.areaFt2 > 0) { q18.push('Terrain: about ' + fmtNum(f.terrain.reliefFt, 0) + ' ft of relief across the sampled ' + fmtNum(f.terrain.areaFt2 / 43560, 1) + ' acres'); q18s.push('terrain sample'); }
  if (q18.length) q18.push('Wetlands, protected species, contamination, protected farmland, airport and community factors were not screened by OMEGA.');
  answer('q18', q18.join('. '), q18s);
  note('18 Site concerns', A.q18.text || '(blank)', q18s.join('; ') || 'not screened — the developer answers');

  /* status block */
  var capex = f.run.total > 0 ? f.run.total : (d.capex > 0 ? d.capex : (num(p.capex) > 0 ? num(p.capex) : null));
  var capexSrc = f.run.total > 0 || d.capex > 0 ? 'the Site Map Run (total install' + (f.run.contracted ? ', contracted figure' : '') + ')' : (num(p.capex) > 0 ? 'the project record (' + (p.capexSource === 'site-map' ? 'Site Map Run' : 'entered') + (p.capexAt ? ', ' + longDate(new Date(num(p.capexAt) || p.capexAt)) : '') + ')' : '');
  var status = {
    constructionStart: { text: '', sources: [] },
    cod: { text: f.workflow.codDate ? f.workflow.codDate : '', sources: f.workflow.codDate ? ['Viability Workflow'] : [] },
    totalCost: { text: capex ? money(capex) + ' — ' + capexSrc : '', sources: capex ? [capexSrc] : [] },
    financing: { text: '', sources: [] }
  };
  note('Target construction start', '(blank)', 'never on the platform — the developer answers');
  note('Target COD', status.cod.text || '(blank)', status.cod.sources[0] || 'not on the project');
  note('Estimated total project cost', status.totalCost.text || '(blank)', status.totalCost.sources[0] || 'the site has not been priced');
  note('Financing requested', '(blank)', 'typed by the developer — the platform never knows it');

  /* attachments: only what the platform can actually produce is pre-ticked */
  var att = {};
  Object.keys(ATTACHMENT_LABEL).forEach(function (k) { att[k] = { on: false, why: '' }; });
  if (apn || acres != null) att.addressParcel = { on: true, why: 'address and parcel number are on the form' };
  if (d.hasBoundary || acres != null) att.boundaryKml = { on: true, why: 'the parcel boundary is on the site map (export it as KMZ from Site Map)' };
  if (d.elements > 0 || d.units > 0) att.layoutSitePlan = { on: true, why: 'the site map layout; a snapshot is attached when the box below is ticked' };
  if (q12.length) att.distanceMap = { on: true, why: 'Grid Atlas / substation lookup on the site map' };
  if (q16.length || q18.length) att.permitEnvironmental = { on: true, why: 'the jurisdiction, zoning and flood facts above' };

  return { cover: cover, answers: A, status: status, attachments: att, provenance: prov,
           sendingAs: { org: orgName, who: who }, questions: QUESTIONS, attachmentLabels: ATTACHMENT_LABEL };
}

/* ── the draft as the person sends it back: strings only, capped ─────── */
function cleanDraft(raw) {
  raw = (raw && typeof raw === 'object') ? raw : {};
  var cover = (raw.cover && typeof raw.cover === 'object') ? raw.cover : {};
  var answers = (raw.answers && typeof raw.answers === 'object') ? raw.answers : {};
  var status = (raw.status && typeof raw.status === 'object') ? raw.status : {};
  var att = (raw.attachments && typeof raw.attachments === 'object') ? raw.attachments : {};
  function text(v, max) { v = (v == null) ? '' : String(v); if (typeof v === 'object') return ''; return v.replace(/\r/g, '').replace(/[ \t]+/g, ' ').trim().slice(0, max); }
  var out = { cover: { submittedBy: text(cover.submittedBy, 300), projectNameLocation: text(cover.projectNameLocation, 300), date: text(cover.date, 12) },
              answers: {}, status: {}, attachments: {} };
  Object.keys(QUESTION_PREFIX).forEach(function (q) { var a = answers[q]; out.answers[q] = text(a && typeof a === 'object' ? a.text : a, 2000).replace(/\n+/g, ' '); });
  Object.keys(STATUS).forEach(function (k) { var s = status[k]; out.status[k] = text(s && typeof s === 'object' ? s.text : s, 160).replace(/\n+/g, ' '); });
  Object.keys(ATTACHMENT_LABEL).forEach(function (k) { var a = att[k]; out.attachments[k] = !!(a && typeof a === 'object' ? a.on : a); });
  return out;
}

/* ── fill: the draft into Helios's own form ─────────────────────────── */
function wrap(text, font, size, maxWidth) {
  var words = String(text).replace(/\s+/g, ' ').trim().split(' '), lines = [], line = '';
  for (var i = 0; i < words.length; i++) {
    var w = words[i], test = line ? line + ' ' + w : w;
    if (font.widthOfTextAtSize(test, size) <= maxWidth) line = test;
    else { if (line) lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  return lines;
}

function templateBytes() {
  return new Promise(function (resolve, reject) {
    fs.readFile(TEMPLATE_PATH, function (err, buf) {
      if (!err && buf && buf.length) return resolve(new Uint8Array(buf));
      /* the function bundle may not carry the file; the deployment serves it */
      var origin = process.env.HELIOS_FORM_ORIGIN || require('./kit').ORIGIN;
      if (typeof fetch !== 'function') return reject(new Error('the blank Helios form is not on this deployment (' + TEMPLATE_PATH + ')'));
      fetch(origin + TEMPLATE_URL).then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.arrayBuffer(); })
        .then(function (ab) { resolve(new Uint8Array(ab)); })
        .catch(function (e) { reject(new Error('the blank Helios form could not be read: ' + e.message)); });
    });
  });
}

/* returns { bytes, report } — report says what was written where, and what did not fit */
function fill(template, draft) {
  var PDF = pdfLib();
  draft = cleanDraft(draft);
  return PDF.PDFDocument.load(template).then(function (doc) {
    return doc.embedFont(PDF.StandardFonts.Helvetica).then(function (helv) {
      var form = doc.getForm(), report = [];
      function field(name) { try { return form.getTextField(name); } catch (e) { return null; } }
      function setFit(name, value, size, min) {
        var fld = field(name); if (!fld) { report.push({ field: name, missing: true }); return; }
        if (!value) return;
        var width = fld.acroField.getWidgets()[0].getRectangle().width - 8, s = size;
        while (s > min && helv.widthOfTextAtSize(value, s) > width) s -= 0.25;
        fld.setFontSize(s); fld.setText(value);
        report.push({ field: name, size: s, overflow: helv.widthOfTextAtSize(value, s) > width });
      }
      /* cover: the two multi-line boxes take a line break; the date field formats m/d/yy */
      var c = draft.cover;
      ['submittedBy', 'projectNameLocation'].forEach(function (k) {
        var fld = field(COVER[k]); if (!fld) { report.push({ field: COVER[k], missing: true }); return; }
        if (c[k]) { fld.setFontSize(9.5); fld.setText(c[k].split('\n').slice(0, 2).join('\n')); }
      });
      var dfld = field(COVER.date); if (dfld && c.date) { dfld.setFontSize(12); dfld.setText(c.date); }

      Object.keys(QUESTION_PREFIX).forEach(function (q) {
        var lines = [];
        for (var n = 1; n <= 6; n++) { var fld = field(QUESTION_PREFIX[q] + ' ' + n); if (!fld) break; lines.push(fld); }
        if (!lines.length) { report.push({ question: q, missing: true }); return; }
        var text = draft.answers[q];
        if (!text) { report.push({ question: q, lines: 0, of: lines.length }); return; }
        var width = lines[0].acroField.getWidgets()[0].getRectangle().width - 8, size = 9, wrapped;
        for (;;) { wrapped = wrap(text, helv, size, width); if (wrapped.length <= lines.length || size <= 7) break; size -= 0.5; }
        var truncated = false;
        if (wrapped.length > lines.length) {
          wrapped = wrapped.slice(0, lines.length);
          wrapped[wrapped.length - 1] = wrapped[wrapped.length - 1].replace(/\s+\S*$/, '') + ' …';
          truncated = true;
        }
        lines.forEach(function (fld, i) { fld.setFontSize(size); fld.setText(wrapped[i] || ''); });
        report.push({ question: q, lines: wrapped.length, of: lines.length, size: size, truncated: truncated });
      });

      Object.keys(STATUS).forEach(function (k) { setFit(STATUS[k], draft.status[k], 9.5, 7); });

      /* the attachment boxes, by position */
      /* by class, never by constructor name: the vendored build is minified */
      var boxes = form.getFields().filter(function (fl) { return fl instanceof PDF.PDFCheckBox; }).map(function (fl) {
        var r = fl.acroField.getWidgets()[0].getRectangle(); return { f: fl, x: r.x, y: Math.round(r.y) };
      });
      var rows = []; boxes.forEach(function (b) { if (rows.indexOf(b.y) < 0) rows.push(b.y); }); rows.sort(function (a, b) { return b - a; });
      boxes.forEach(function (b) {
        var key = (ATTACHMENTS[rows.indexOf(b.y)] || [])[b.x < 200 ? 0 : 1];
        if (!key) return;
        if (draft.attachments[key]) b.f.check(); else b.f.uncheck();
      });

      form.updateFieldAppearances(helv);
      return doc.save().then(function (bytes) { return { bytes: bytes, report: report }; });
    });
  });
}

/* the field names the form must carry, for the test and for a sanity read */
function expectedFields() {
  var names = [COVER.submittedBy, COVER.projectNameLocation, COVER.date];
  var lines = { q1: 2, q2: 2, q3: 2, q4: 2, q5: 3, q6: 2, q7: 2, q8: 3, q9: 3, q10: 4, q11: 4, q12: 3, q13: 2, q14: 2, q15: 2, q16: 3, q17: 3, q18: 4 };
  Object.keys(QUESTION_PREFIX).forEach(function (q) { for (var n = 1; n <= lines[q]; n++) names.push(QUESTION_PREFIX[q] + ' ' + n); });
  Object.keys(STATUS).forEach(function (k) { names.push(STATUS[k]); });
  return names;
}

/* ── where it goes ───────────────────────────────────────────────────
   HELIOS_INTAKE_EMAIL (one or more addresses) wins; else the deal room's
   own list for Helios (fin_settings/dealroom.orgs.helios, editable by an
   administrator on the deal room page); else nobody, and the caller is
   told so. Never a person's address in the code. */
function recipients(env, settings) {
  env = env || {}; settings = settings || {};
  var fromEnv = String(env.HELIOS_INTAKE_EMAIL || '').split(/[,;\s]+/).map(function (s) { return s.trim(); }).filter(valid);
  if (fromEnv.length) return { to: fromEnv, source: 'HELIOS_INTAKE_EMAIL' };
  var list = (settings.orgs && Array.isArray(settings.orgs.helios)) ? settings.orgs.helios : [];
  list = list.map(function (s) { return String(s || '').trim(); }).filter(valid);
  if (list.length) return { to: list, source: 'fin_settings/dealroom.orgs.helios' };
  return { to: [], source: null };
}

/* ── the email ──────────────────────────────────────────────────────── */
function fileName(draft, today) {
  var base = str((draft && draft.cover && draft.cover.projectNameLocation || '').split('\n')[0], 60) || 'project';
  var d = today || new Date();
  return 'Helios-First-Pass-' + base.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '') + '-' + d.toISOString().slice(0, 10) + '.pdf';
}
function emailHtml(esc, o) {
  o = o || {};
  var d = o.draft || { cover: {}, answers: {}, status: {} };
  var rows = [];
  function row(k, v) { if (v) rows.push('<tr><td style="padding:4px 14px 4px 0;color:#8BA3C4;white-space:nowrap;vertical-align:top">' + esc(k) + '</td><td style="padding:4px 0;color:#E5EEF7">' + esc(v) + '</td></tr>'); }
  row('Project', (d.cover.projectNameLocation || '').split('\n')[0]);
  row('Location', (d.cover.projectNameLocation || '').split('\n')[1] || '');
  row('Submitted by', (d.cover.submittedBy || '').replace(/\n/g, ' · '));
  row('Technology', d.answers.q2);
  row('Classification', d.answers.q7);
  row('Connection point', d.answers.q12);
  row('Estimated total project cost', d.status.totalCost);
  row('Target COD', d.status.cod);
  row('Financing requested', d.status.financing);
  var filled = Object.keys(d.answers).filter(function (q) { return d.answers[q]; }).length;
  var html = '<p>' + esc(o.orgName || 'A developer') + (o.who ? ' (' + esc(o.who) + ')' : '') + ' has completed your Large Land Deal First Pass Checklist for the project below. The filled form is attached'
    + (o.snapshot ? ', with a snapshot of the site map' : '') + '.</p>'
    + (o.message ? '<p style="background:#12233A;border-left:3px solid #4FA8FF;padding:10px 12px;margin:14px 0;color:#E5EEF7">' + esc(o.message).replace(/\n/g, '<br>') + '</p>' : '')
    + '<table style="border-collapse:collapse;font-size:13px;margin:12px 0">' + rows.join('') + '</table>'
    + '<p style="color:#8BA3C4;font-size:12px">' + filled + ' of 18 questions are answered on the form; the rest are blank for a follow-up. Answers marked as screening estimates come from public parcel and grid data read by ClearSky OMEGA and are not a substitute for a utility study or a title report. Reply to this email to reach the sender.</p>';
  return html;
}

module.exports = { pdfLib: pdfLib, compose: compose, cleanFacts: cleanFacts, cleanDraft: cleanDraft, fill: fill, wrap: wrap, templateBytes: templateBytes,
  expectedFields: expectedFields, recipients: recipients, emailHtml: emailHtml, fileName: fileName, mdy: mdy,
  QUESTIONS: QUESTIONS, QUESTION_PREFIX: QUESTION_PREFIX, ATTACHMENT_LABEL: ATTACHMENT_LABEL, ATTACHMENTS: ATTACHMENTS, STATUS: STATUS, COVER: COVER,
  TEMPLATE_PATH: TEMPLATE_PATH, TEMPLATE_URL: TEMPLATE_URL };
