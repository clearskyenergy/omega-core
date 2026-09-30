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
function str(v, max) { v = (typeof v === 'string' || typeof v === 'number') ? String(v) : ''; v = v.replace(/\s+/g, ' ').trim(); return max ? v.slice(0, max) : v; }
function num(v) { if (typeof v !== 'number' && typeof v !== 'string') return null; if (v === '') return null; var n = Number(v); return isFinite(n) ? n : null; }
function pos(v) { var n = num(v); return n != null && n > 0 ? n : null; }
function fmtNum(n, dp) { return Number(n).toLocaleString('en-US', { maximumFractionDigits: dp == null ? 1 : dp }); }
function money(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
function mdy(d) { d = d || new Date(); return (d.getMonth() + 1) + '/' + d.getDate() + '/' + String(d.getFullYear()).slice(2); }
function longDate(d) { d = d || new Date(); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }); }
function kmToMi(km) { return Math.round(km * 0.621371 * 10) / 10; }
function joinNice(parts, sep) { return parts.filter(function (p) { return p != null && String(p).trim() !== ''; }).join(sep || ' · '); }
function valid(email) { return /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/.test(String(email || '').trim()); }
function st2(v) { v = str(v, 12).toUpperCase(); return /^[A-Z]{2}$/.test(v) ? v : ''; }
function countyWord(c) { return c + (/county|parish|borough/i.test(c) ? '' : ' County'); }

/* ── what the form's font can print ──────────────────────────────────
   The form's fields are drawn with the standard Helvetica, which encodes
   Windows-1252 and nothing else (measured from pdf-lib: 0x20-0x7E,
   0xA0-0xFF and the 27 cp1252 extras). Anything outside it made pdf-lib
   throw and the preview answer 500 — a project in Kāneʻohe, a name with an
   Ł, a pasted "≥" or zero-width space. So text is transliterated before it
   reaches the form: typographic symbols to their ASCII spelling, accented
   letters to their base letter, invisible characters removed, and anything
   still unprintable to "?". The report says which fields were changed. */
var CP1252_EXTRA = [0x152, 0x153, 0x160, 0x161, 0x178, 0x17d, 0x17e, 0x192, 0x2c6, 0x2dc, 0x2013, 0x2014, 0x2018, 0x2019, 0x201a,
  0x201c, 0x201d, 0x201e, 0x2020, 0x2021, 0x2022, 0x2026, 0x2030, 0x2039, 0x203a, 0x20ac, 0x2122];
function printable(c) { return (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || CP1252_EXTRA.indexOf(c) >= 0; }
var SPELL = { '≥': '>=', '≤': '<=', '→': '->', '←': '<-', '⇒': '=>', '↔': '<->', '−': '-', '‐': '-', '‑': '-',
  '‒': '-', '―': '-', '≈': '~', '∼': '~', '≠': '!=', '✓': 'x', '✔': 'x', '✗': 'x', '✘': 'x', '✅': 'x',
  'ʻ': "'", 'ʼ': "'", '′': "'", '″': '"', '−−': '--', 'Ω': 'ohm', 'Ω': 'ohm', '··': '..',
  'Ł': 'L', 'ł': 'l', 'Đ': 'D', 'đ': 'd', 'ı': 'i', 'Ħ': 'H', 'ħ': 'h', 'Ŧ': 'T', 'ŧ': 't', 'Ŀ': 'L',
  'ŀ': 'l', '∕': '/', '⁄': '/', '№': 'No.', '℃': 'C', '℉': 'F', '㎡': 'm2', '⅓': '1/3', '⅔': '2/3' };
function toWinAnsi(v, keepNewlines) {
  var s = String(v == null ? '' : v), out = '';
  for (var i = 0; i < s.length; i++) {
    var ch = s.charAt(i), c = s.charCodeAt(i);
    if (ch === '\n') { out += keepNewlines ? '\n' : ' '; continue; }
    if (ch === '\t' || ch === '\r' || c === 0x2028 || c === 0x2029 || c === 0x202f || c === 0x205f || c === 0x3000 || (c >= 0x2000 && c <= 0x200a)) { out += ' '; continue; }
    if ((c >= 0x200b && c <= 0x200f) || c === 0xfeff || c === 0x2060 || c === 0xad || (c >= 0xfe00 && c <= 0xfe0f)) continue;
    if (c < 0x20 || c === 0x7f) continue;
    if (c >= 0xd800 && c <= 0xdbff) { i++; out += '?'; continue; }          /* emoji and other astral characters */
    if (printable(c)) { out += ch; continue; }
    if (SPELL[ch]) { out += SPELL[ch]; continue; }
    var base = '';
    try { base = ch.normalize('NFKD').replace(/[\u0300-\u036f]/g, ''); } catch (e) { base = ''; }
    var ok = base && base.split('').every(function (b) { return printable(b.charCodeAt(0)); });
    out += ok ? base : '?';
  }
  return out;
}

/* ── dates: the form's date field formats m/d/yy ─────────────────── */
var MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
function normalizeDate(v) {
  var s = str(v, 40); if (!s) return { text: '', ok: true };
  var m, y, mo, d;
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s))) { y = +m[1]; mo = +m[2]; d = +m[3]; }
  else if ((m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2}|\d{4})$/.exec(s))) { mo = +m[1]; d = +m[2]; y = +m[3]; if (y < 100) y += 2000; }
  else if ((m = /^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(s)) && MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) >= 0) { mo = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1; d = +m[2]; y = +m[3]; }
  else if ((m = /^(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})$/.exec(s)) && MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) >= 0) { d = +m[1]; mo = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1; y = +m[3]; }
  if (!mo || mo < 1 || mo > 12 || !d || d < 1 || d > 31 || !y || y < 1990 || y > 2100) return { text: s.slice(0, 24), ok: false };
  var dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1) return { text: s.slice(0, 24), ok: false };
  return { text: mo + '/' + d + '/' + String(y).slice(2), ok: true, iso: y + '-' + (mo < 10 ? '0' : '') + mo + '-' + (d < 10 ? '0' : '') + d };
}
function isoToday(facts) { var t = facts && typeof facts.today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(facts.today) ? facts.today : null; return t; }

/* ── what the browser sends: cleaned, capped, nothing trusted blindly ── */
var SS_FLAGS = ['ss_zoning_prohibited', 'ss_moratorium', 'ss_hoa_restrict', 'ss_height_restrict', 'ss_historic_district', 'ss_overlay_zone',
  'ss_no_fire_access', 'ss_occupied_setback', 'ss_gas_meter_close', 'ss_sprinkler_req', 'ss_uhf_fails', 'ss_floodplain', 'ss_wetlands',
  'ss_underground_util', 'ss_soil_contamination', 'ss_noise_ordinance', 'ss_code_no_ess', 'ss_deed_restrict', 'ss_drainage_conflict',
  'ss_feeder_overload', 'ss_ic_moratorium', 'ss_lease_prohibit', 'ss_other'];
var WF_CHECKS = ['p5_zoning_ok', 'p5_flood_ok', 'p5_historic_ok', 'p5_noise_ok', 'ck_title', 'p5_elec', 'p5_bldg', 'p5_fire_perm', 'p5_civil',
  'p5_stormwater', 'p5_erp', 'p5_haz'];
function cleanFacts(raw) {
  raw = (raw && typeof raw === 'object') ? raw : {};
  function o(x, k) { return (x && x[k] && typeof x[k] === 'object' && !Array.isArray(x[k])) ? x[k] : {}; }
  var site = o(raw, 'site'), ga = o(raw, 'gridAtlas'), grid = o(raw, 'grid'), sl = o(raw, 'substationLookup'), dr = o(raw, 'drawing'),
      bess = o(raw, 'bess'), run = o(raw, 'run'), bill = o(raw, 'billImport'), jur = o(raw, 'jurisdiction'), ter = o(raw, 'terrain'),
      wf = o(raw, 'workflow'), ap = o(raw, 'autopilot'), apParcel = o(ap, 'parcel'), poi = o(raw, 'poi'), bnd = o(raw, 'boundary'),
      tsp = o(wf, 'tsp'), research = o(wf, 'research'), flags = o(wf, 'flags'), checks = o(wf, 'checks'),
      off = (raw.offtaker && typeof raw.offtaker === 'object') ? raw.offtaker : { name: raw.offtaker };
  function line(x) { x = (x && typeof x === 'object') ? x : {}; return { name: str(x.name, 120), voltageKv: num(x.voltageKv), distanceKm: num(x.distanceKm), owner: str(x.owner, 120) }; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  var ssOn = {}, ckOn = {};
  SS_FLAGS.forEach(function (k) { if (flags[k] === true || flags[k] === '1' || flags[k] === 1) ssOn[k] = true; });
  WF_CHECKS.forEach(function (k) { if (checks[k] === true || checks[k] === '1' || checks[k] === 1) ckOn[k] = true; });
  var poiKind = str(poi.kind, 20);
  return {
    today: isoToday(raw),
    name: str(raw.name, 160), address: str(raw.address, 300), city: str(raw.city, 80), state: st2(raw.state),
    site: { county: str(site.county, 80), state: st2(site.state), zip: str(site.zip, 10),
            parcelApn: str(site.parcelApn, 60), parcelAcres: pos(site.parcelAcres), parcelOwner: str(site.parcelOwner, 160),
            parcelZoning: str(site.parcelZoning, 60), parcelSource: str(site.parcelSource, 80),
            ahjName: str(site.ahjName, 120), ahjPermitDays: pos(site.ahjPermitDays) },
    gridAtlas: { nearestSubstationName: str(ga.nearestSubstationName, 120), nearestSubstationKm: num(ga.nearestSubstationKm),
                 nearestSubstationKv: pos(ga.nearestSubstationKv), owner: str(ga.owner, 120), score: num(ga.score) },
    grid: { substations: arr(grid.substations).slice(0, 3).map(line), lines: arr(grid.lines).slice(0, 3).map(line), ranAt: str(grid.ranAt, 40) },
    substationLookup: { name: str(sl.name, 120), kv: pos(sl.kv), miles: num(sl.miles), dir: str(sl.dir, 4), capMw: pos(sl.capMw), source: str(sl.source, 120) },
    drawing: { tech: str(dr.tech, 20), solarKwDc: pos(dr.solarKwDc), solarKwAc: pos(dr.solarKwAc), bessKw: pos(dr.bessKw), bessKwh: pos(dr.bessKwh),
               evPorts: pos(dr.evPorts), itKw: pos(dr.itKw), capex: pos(dr.capex), units: pos(dr.units), elements: pos(dr.elements),
               hasBoundary: dr.hasBoundary === true },
    boundary: { acres: pos(bnd.acres), source: str(bnd.source, 80) },
    exclusions: arr(raw.exclusions).slice(0, 30).map(function (x) { x = (x && typeof x === 'object') ? x : {}; return { reason: str(x.reason, 60), acres: pos(x.acres) }; })
      .filter(function (x) { return x.reason && x.reason !== 'unclassified'; }),
    poi: { kind: ['none', 'utility-xfmr', 'substation'].indexOf(poiKind) >= 0 ? poiKind : '', ft: pos(poi.ft), source: str(poi.source, 20) },
    bess: { chem: str(bess.chem, 20), mfr: str(bess.mfr, 60), model: str(bess.model, 60) },
    run: { total: pos(run.total), at: num(run.at), contracted: run.contracted === true },
    wizMode: str(raw.wizMode, 8).toUpperCase(), wizModeConfirmed: raw.wizModeConfirmed === true, interconMode: str(raw.interconMode, 20),
    /* a guided-build offtaker is a load CLASS (it carries an id); a name
       typed in the new-project dialog is a buyer somebody named */
    offtaker: { name: str(off && off.name, 80), guided: !!(off && (typeof off.id === 'string' || typeof off.id === 'number') && String(off.id)) },
    billImport: { utility: str(bill.utility, 120), rateSchedule: str(bill.rateSchedule, 80) },
    jurisdiction: { state: jur.known === true ? st2(jur.state) : '', utility: str(jur.utility, 120), known: jur.known === true, multiUtility: jur.multiUtility === true },
    terrain: { reliefFt: num(ter.reliefFt), areaFt2: pos(ter.areaFt2), slopePct: num(ter.slopePct) },
    workflow: { owner: str(wf.owner, 160), siteControl: str(wf.siteControl, 20), utility: str(wf.utility, 40), flood: str(wf.flood, 4),
                pathFinal: str(wf.pathFinal, 8).toUpperCase(), appStatus: str(wf.appStatus, 20), queuePos: str(wf.queuePos, 60), timeline: str(wf.timeline, 60),
                queueRisk: str(wf.queueRisk, 12), ahj: str(wf.ahj, 120), fireDept: str(wf.fireDept, 120), zoning: str(wf.zoning, 80),
                notes: str(wf.notes, 600), icNotes: str(wf.icNotes, 600), ssCustom: str(wf.ssCustom, 400), codDate: str(wf.codDate, 20),
                exportMode: str(wf.exportMode, 12), appType: str(wf.appType, 16), icEntity: str(wf.icEntity, 8), market: str(wf.market, 8),
                icStatusErcot: str(wf.icStatusErcot, 12), poiName: str(wf.poiName, 120), substation: str(wf.substation, 120),
                poiKv: pos(wf.poiKv), gentieMi: pos(wf.gentieMi), gentieKv: pos(wf.gentieKv),
                tsp: { name: str(tsp.name, 120), type: str(tsp.type, 8).toUpperCase() },
                p3Kw: pos(wf.p3Kw), p3Kwh: pos(wf.p3Kwh), p3Duration: pos(wf.p3Duration), proposedKw: pos(wf.proposedKw), proposedKwh: pos(wf.proposedKwh),
                flags: ssOn, checks: ckOn,
                research: { utility: str(research.utility, 120), floodZone: str(research.floodZone, 40), jurisdiction: str(research.jurisdiction, 160), zoning: str(research.zoning, 160) },
                updatedAt: num(wf.updatedAt) },
    autopilot: { parcel: { apn: str(apParcel.apn, 60), acres: pos(apParcel.acres), county: str(apParcel.county, 80), source: str(apParcel.source, 80) },
                 nearestSubstationKm: num(ap.nearestSubstationKm), owner: str(ap.owner, 120) },
    hasMap: raw.hasMap === true
  };
}

/* The saved drawing already carries two facts the session may not: the
   substation a person looked up (a kind:'substation' shape with
   omegaLookup) and the drawn point of interconnection (a utility 'mpoi'
   shape with omegaPoi, and its gen-tie conduit's length). Read from the
   record so a draft from a fresh page load still has them. */
function fromDrawing(p) {
  var out = { substation: null, poi: null };
  var shapes = Array.isArray(p && p.shapes) ? p.shapes : [], conduits = Array.isArray(p && p.conduits) ? p.conduits : [];
  for (var i = shapes.length - 1; i >= 0; i--) {
    var sh = shapes[i]; if (!sh || typeof sh !== 'object') continue;
    if (!out.substation && sh.kind === 'substation' && sh.omegaLookup) {
      out.substation = { name: str(sh.label, 120), kv: pos(String(sh.voltage || '').replace(/[^\d.]/g, '')), miles: num(sh.srcMiles), dir: str(sh.srcDir, 4),
                         capMw: pos(sh.capMw), source: str(sh.srcName, 120), owner: str(sh.srcOwner, 120) };
    }
    if (!out.poi && sh.kind === 'utility' && sh.utype === 'mpoi' && sh.omegaPoi) {
      var ft = null;
      conduits.forEach(function (c) { if (c && c.omegaPoi && c.omegaGenTie) ft = pos(c.ftOverride) || pos(c.ftLen) || ft; });
      out.poi = { kind: /^SUBSTATION/i.test(String(sh.label || '')) ? 'substation' : 'utility-xfmr', ft: ft, source: 'drawing' };
    }
  }
  return out;
}

/* the Viability Workflow's own words for its codes */
var SITE_CONTROL = { owned: 'fee simple owned', long_lease: 'long-term lease (5+ years)', loi: 'LOI / in negotiation', none: 'no site control yet' };
var APP_STATUS = { not_started: 'not started', preapp: 'pre-application requested', submitted: 'application submitted', study: 'in the study phase', agreement: 'interconnection agreement received', executed: 'interconnection agreement executed' };
var ERCOT_STATUS = { screen: 'screening / site assessment', sswg: 'SSWG data submitted', inr: 'INR filed', sec: 'security screening study',
  fis: 'full interconnection study', sgia: 'SGIA executed', energize: 'energization / testing', cod: 'commercial operation' };
var APP_TYPE = { part466_l3: 'Part 466 Level 3 (non-export) application', part466_l2: 'Part 466 Level 2 (<500 kW) application', full_study: 'full interconnection study required' };
var EXPORT_MODE = { non_export: 'non-export', limited: 'limited export', full: 'full export', btm_vpp: 'non-export with VPP participation' };
var MARKET = { ERCOT: 'ERCOT', PJM: 'PJM', MISO: 'MISO', SPP: 'SPP', CAISO: 'CAISO', NYISO: 'NYISO', 'ISO-NE': 'ISO-NE', none: 'vertically integrated (no organized market)' };
var UTIL_TYPE = { IOU: 'investor-owned', COOP: 'electric cooperative', MUNI: 'municipal utility', 'G&T': 'generation and transmission cooperative', TSP: 'transmission service provider' };
var WF_UTILITY = { comed: 'ComEd', ameren: 'Ameren Illinois', pge: 'PG&E', sce: 'Southern California Edison (SCE)', sdge: 'SDG&E', ladwp: 'LADWP' };
var WF_UTILITY_TYPE = { comed: 'IOU', ameren: 'IOU', pge: 'IOU', sce: 'IOU', sdge: 'IOU', ladwp: 'MUNI' };
var TECH_LABEL = { storage: 'Stand Alone BESS', solar_bess: 'Solar plus BESS', solar: 'Solar PV', datacenter: 'Other — data center load', ev: 'Other — EV charging', efficiency: 'Other' };
var SCOPE_TECH = [[['der', 'bess'], 'Solar plus BESS'], [['bess'], 'Stand Alone BESS'], [['der'], 'Solar PV'], [['microgrid'], 'Other — DER / microgrid'],
  [['compute'], 'Other — data center / compute campus'], [['dcfc'], 'Other — DC fast charging'], [['l2'], 'Other — Level 2 EV charging'], [['building'], 'Other — building / net-zero']];
var TYPE_TECH = { bess: 'Stand Alone BESS', solar: 'Solar PV', dcfc: 'Other — DC fast charging', l2: 'Other — Level 2 EV charging', compute: 'Other — data center / compute campus', microgrid: 'Other — DER / microgrid', building: 'Other — building / net-zero' };

/* the Apply for Financing request for this project, if one exists */
function finFacts(app) {
  if (!app || typeof app !== 'object') return null;
  var f = (app.form && typeof app.form === 'object') ? app.form : {};
  return { status: str(app.status, 20), product: str(f.product, 60), requestType: str(f.requestType, 60), amount: pos(f.financedAmount),
           termMonths: pos(f.termMonths), ntpDate: str(f.ntpDate, 20), codDate: str(f.codDate, 20), deferral: str(f.deferral, 40) };
}

/* ── the project mode: a CHOICE, never the editor's default ──────────
   The editor starts every project on BTM and saves it whether or not
   anybody chose it, so a BTM on the record is not evidence. The mode is
   taken from the Viability Workflow's path decision or export mode, a
   non-default mode (FOM, EVSE, L2), a BTM the drawing agrees with (a
   guided-build offtaker, an imported host bill, or the POI set to behind
   the meter), or a drawn point of interconnection that exports. */
function modeOf(f, p) {
  var wf = f.workflow;
  if (wf.pathFinal === 'BTM' || wf.pathFinal === 'FTM' || wf.pathFinal === 'DUAL') return { mode: wf.pathFinal, src: 'Viability Workflow path decision' };
  if (EXPORT_MODE[wf.exportMode]) return { mode: wf.exportMode === 'full' ? 'FTM' : 'BTM', sub: EXPORT_MODE[wf.exportMode], src: 'Viability Workflow export mode' };
  var wiz = f.wizMode || str(p.wizMode, 8).toUpperCase();
  if (wiz === 'FOM' || wiz === 'EVSE' || wiz === 'L2') return { mode: wiz === 'FOM' ? 'FTM' : wiz, src: 'site map project mode' };
  var exportsPoi = f.poi.kind === 'utility-xfmr' || f.poi.kind === 'substation';
  if (wiz === 'BTM' && f.wizModeConfirmed && !exportsPoi) return { mode: 'BTM', src: 'site map project mode (chosen in the guided build)' };
  if (wiz === 'BTM' && !exportsPoi && (f.offtaker.guided || f.billImport.utility || f.poi.kind === 'none')) return { mode: 'BTM', src: 'site map project mode' };
  if (exportsPoi) return { mode: 'EXPORT', src: 'site map POI setting' };
  return null;
}

/* ── compose: what the project can honestly say, with its sources ─────
   input: { project, org, caller: {email, name}, facts, finApp, today }
   returns { cover, answers, status, attachments, provenance, sendingAs } */
function compose(input) {
  input = input || {};
  var p = input.project || {}, org = input.org || {}, caller = input.caller || {}, f = cleanFacts(input.facts);
  var fin = finFacts(input.finApp), drawn = fromDrawing(p);
  if (!f.poi.kind && drawn.poi) f.poi = drawn.poi;
  if (!f.substationLookup.name && f.substationLookup.miles == null && drawn.substation) f.substationLookup = drawn.substation;
  var today = f.today ? new Date(f.today + 'T12:00:00Z') : (input.today || new Date());
  var A = {}, prov = [];
  function answer(q, text, sources) { A[q] = { text: str(text, 2000), sources: (sources || []).filter(function (s, i, a) { return s && a.indexOf(s) === i; }) }; }
  function note(item, value, source) { prov.push([item, value, source]); }
  var wf = f.workflow, flag = wf.flags, check = wf.checks;
  var mode = modeOf(f, p);

  /* identity */
  var orgName = str(org.name, 120) || str(org.slug, 60) || str(p.orgId, 80) || '';
  var who = joinNice([str(caller.name, 80), str(caller.email, 120)], ' · ');
  var name = f.name || str(p.name, 160) || '';
  var address = f.address || str(p.address, 300) || '';
  var state = f.site.state || f.state || f.jurisdiction.state || st2(p.state) || '';
  var county = f.site.county || f.autopilot.parcel.county || str(p.county, 80) || '';
  var countySrc = f.site.county ? 'county from the geocoded site' : (f.autopilot.parcel.county ? 'county from the parcel record' : (county ? 'county from the project record' : ''));

  var cover = {
    submittedBy: joinNice([orgName, who], '\n'),
    projectNameLocation: joinNice([name, joinNice([address, county ? countyWord(county) : '', state && !address ? state : ''], ' · ')], '\n'),
    date: f.today ? normalizeDate(f.today).text : mdy(today)
  };
  note('Cover', 'Workspace, person, project name, address, date', 'the workspace record, the signed-in account, the project record');

  /* 1 · property */
  var apn = f.site.parcelApn || f.autopilot.parcel.apn;
  var parcelAcres = f.site.parcelAcres != null ? f.site.parcelAcres : f.autopilot.parcel.acres;
  var parcelSrc = f.site.parcelSource || f.autopilot.parcel.source || 'the parcel service';
  var q1 = [], q1s = [];
  if (address) { q1.push(address); q1s.push('project record'); }
  if (county) { q1.push(countyWord(county) + (state ? ', ' + state : '')); q1s.push(countySrc); }
  else if (state && !address) q1.push(state);
  if (apn) { q1.push('APN ' + apn); q1s.push('parcel number from ' + parcelSrc); }
  if (parcelAcres) { q1.push('approx. ' + fmtNum(parcelAcres, 1) + ' acres (parcel boundary from ' + parcelSrc + ')'); q1s.push('acreage from the parcel boundary'); }
  else if (f.boundary.acres) { q1.push('approx. ' + fmtNum(f.boundary.acres, 1) + ' acres (measured from the property line on the site map)'); q1s.push('acreage measured from the site map boundary'); }
  answer('q1', q1.join(' · '), q1s);
  note('1 Property', A.q1.text || '(blank)', A.q1.sources.join('; ') || 'nothing on the project');

  /* 2 · technology and size */
  var d = f.drawing, q2 = [], q2s = [];
  var tech = '', techSrc = '';
  if (d.tech && d.tech !== 'land' && TECH_LABEL[d.tech]) { tech = TECH_LABEL[d.tech]; techSrc = 'the site map drawing'; }
  if (!tech) {
    var scopes = Array.isArray(p.siteScopes) ? p.siteScopes.map(String) : [];
    for (var si = 0; si < SCOPE_TECH.length && scopes.length; si++) {
      if (SCOPE_TECH[si][0].every(function (k) { return scopes.indexOf(k) >= 0; })) { tech = SCOPE_TECH[si][1]; techSrc = 'the project type chosen when the project was made'; break; }
    }
    if (!tech && TYPE_TECH[str(p.type, 20).toLowerCase()]) { tech = TYPE_TECH[str(p.type, 20).toLowerCase()]; techSrc = 'the project type on the record'; }
  }
  if (tech) { q2.push(tech); q2s.push(techSrc); }
  var bz = (p.bessSizing && typeof p.bessSizing === 'object') ? p.bessSizing : {};
  var kw = null, kwh = null, dur = null, sizeSrc = '';
  if (d.bessKw || d.bessKwh) { kw = d.bessKw; kwh = d.bessKwh; sizeSrc = 'the site map drawing'; }
  else if (pos(bz.powerKw) || pos(bz.nameplateKwh)) { kw = pos(bz.powerKw); kwh = pos(bz.nameplateKwh); dur = pos(bz.durationH); sizeSrc = 'the Battery Sizer' + (bz.basis ? ' (sized from ' + (bz.basis === 'interval' ? 'interval data' : 'utility bills') + ')' : ''); }
  else if (pos(p.bessKw) || pos(p.bessKwh)) { kw = pos(p.bessKw); kwh = pos(p.bessKwh); sizeSrc = 'the Site Map Run'; }
  else if (wf.p3Kw || wf.p3Kwh) { kw = wf.p3Kw; kwh = wf.p3Kwh; dur = wf.p3Duration; sizeSrc = 'Viability Workflow'; }
  else if (wf.proposedKw || wf.proposedKwh) { kw = wf.proposedKw; kwh = wf.proposedKwh; sizeSrc = 'Viability Workflow'; }
  if (!dur && kw && kwh) dur = kwh / kw;
  var size = [];
  if (d.solarKwDc) size.push(fmtNum(d.solarKwDc / 1000, 2) + ' MWdc solar' + (d.solarKwAc ? ' (' + fmtNum(d.solarKwAc / 1000, 2) + ' MWac)' : ''));
  if (kw || kwh) {
    var sz = [];
    if (kw) sz.push(fmtNum(kw / 1000, 2) + ' MW');
    if (kwh) sz.push(fmtNum(kwh / 1000, 2) + ' MWh');
    if (dur) sz.push(fmtNum(dur, 1) + '-hour');
    size.push((tech ? 'storage ' : 'BESS ') + sz.join(' / '));
  }
  if (d.itKw) size.push(fmtNum(d.itKw / 1000, 2) + ' MW of IT load');
  if (d.evPorts) size.push(fmtNum(d.evPorts, 0) + ' EV charging ports');
  if (size.length) q2.push(size.join('; '));
  if (d.solarKwDc || d.itKw || d.evPorts) q2s.push('the site map drawing');
  if (kw || kwh) q2s.push(sizeSrc);
  if (f.bess.chem) { q2.push(f.bess.chem + (f.bess.mfr ? ' (' + joinNice([f.bess.mfr, f.bess.model], ' ') + ')' : '')); q2s.push('battery catalogue'); }
  if (d.units) q2.push(fmtNum(d.units, 0) + ' enclosure' + (d.units === 1 ? '' : 's') + ' placed');
  answer('q2', q2.join(' · '), q2s);
  note('2 Technology', A.q2.text || '(blank)', A.q2.sources.join('; ') || 'no project type and nothing placed on the site map');

  /* 3 · owner and site control */
  var q3 = [], q3s = [];
  if (f.site.parcelOwner) { q3.push('Owner of record per ' + parcelSrc + ': ' + f.site.parcelOwner); q3s.push('parcel record'); }
  if (wf.owner) { q3.push('Owner / entity: ' + wf.owner); q3s.push('Viability Workflow'); }
  if (SITE_CONTROL[wf.siteControl]) { q3.push('Site control: ' + SITE_CONTROL[wf.siteControl]); q3s.push('Viability Workflow'); }
  answer('q3', q3.join('. '), q3s);
  note('3 Owner and site control', A.q3.text || '(blank)', A.q3.sources.join('; ') || 'not on the project — the developer answers');

  /* 4 · deed or title */
  var q4 = [], q4s = [];
  if (check.ck_title) { q4.push('Full title commitment ordered (Viability Workflow checklist); copy to be attached'); q4s.push('Viability Workflow'); }
  answer('q4', q4.join(' '), q4s);
  note('4 Deed or title', A.q4.text || '(blank)', A.q4.sources.join('; ') || 'never on the platform — attach');

  /* 5 · title exceptions and claims */
  var q5 = [], q5s = [];
  if (flag.ss_deed_restrict) q5.push('Deed restriction prohibiting utility structures or storage flagged');
  if (flag.ss_lease_prohibit) q5.push('tenant lease restricts or prohibits utility / BESS work (flagged)');
  if (flag.ss_hoa_restrict) q5.push('HOA or CC&Rs restrict BESS / utility equipment (flagged)');
  if (q5.length) q5s.push("Viability Workflow site screen");
  var easements = f.exclusions.filter(function (x) { return /easement|right-of-way|row\b/i.test(x.reason); });
  if (easements.length) { q5.push('Traced on the site map: ' + easements.map(function (x) { return x.reason + (x.acres ? ' about ' + fmtNum(x.acres, 1) + ' ac' : ''); }).join('; ')); q5s.push('site map exclusions'); }
  answer('q5', q5.join('; '), q5s);
  note('5 Title exceptions', A.q5.text || '(blank)', A.q5.sources.join('; ') || 'never on the platform — attach');

  /* 6 · utility and ownership type */
  var q6 = [], q6s = [], utilType = '';
  if (wf.tsp.name) { q6.push(wf.tsp.name); utilType = wf.tsp.type; q6s.push('Viability Workflow (TSP / DSP)'); }
  else if (f.billImport.utility) { q6.push(f.billImport.utility); q6s.push('the imported utility bill'); }
  else if (WF_UTILITY[wf.utility]) { q6.push(WF_UTILITY[wf.utility]); utilType = WF_UTILITY_TYPE[wf.utility] || ''; q6s.push('Viability Workflow'); }
  else if (wf.research.utility) { q6.push(wf.research.utility); q6s.push("Viability Workflow's address research — verify"); }
  else if (str(p.utility, 120)) { q6.push(str(p.utility, 120)); q6s.push('project record'); }
  else if (f.jurisdiction.known && f.jurisdiction.utility && !f.jurisdiction.multiUtility) {
    q6.push(f.jurisdiction.utility + " (OMEGA's state table lists it for " + (f.jurisdiction.state || state) + '; confirm the serving utility and whether it is investor-owned, municipal or a cooperative on a bill)');
    q6s.push('state utility table');
  }
  if (q6.length && UTIL_TYPE[utilType]) q6[0] += ' — ' + UTIL_TYPE[utilType];
  answer('q6', q6.join(' · '), q6s);
  note('6 Utility', A.q6.text || '(blank)', A.q6.sources.join('; ') || 'not on the project');

  /* 7 · classification */
  var q7 = [], q7s = [];
  if (mode) {
    var ms = { BTM: 'Behind the meter' + (mode.sub ? ', ' + mode.sub : '') + ' — on the customer side of the existing service',
      FTM: 'Front of meter — ' + (mode.sub || 'export') + ' / wholesale', DUAL: 'Dual path (behind or in front of the meter) — awaiting utility feedback',
      EVSE: 'Behind the meter — EV charging load on the site service', L2: 'Behind the meter — Level 2 EV charging on the site service',
      EXPORT: 'Exporting to the grid through a new point of interconnection' }[mode.mode];
    if (ms) { q7.push(ms); q7s.push(mode.src); }
  }
  if (f.poi.kind === 'utility-xfmr') { q7.push('distribution interconnection: a step-up transformer and point of interconnection on the distribution system'); q7s.push('site map POI ' + (f.poi.source === 'drawing' ? 'drawn' : 'setting')); }
  else if (f.poi.kind === 'substation') { q7.push('transmission-level interconnection at a substation (gen-tie)'); q7s.push('site map POI ' + (f.poi.source === 'drawing' ? 'drawn' : 'setting')); }
  else if (f.poi.kind === 'none' && mode && (mode.mode === 'BTM' || mode.mode === 'EVSE' || mode.mode === 'L2')) q7.push('no new point of interconnection (existing service)');
  if (wf.icEntity === 'ercot') { q7.push('ERCOT transmission-connected'); q7s.push('Viability Workflow'); }
  else if (wf.icEntity === 'tsp') { q7.push('distribution-connected through the TSP'); q7s.push('Viability Workflow'); }
  if (APP_TYPE[wf.appType]) { q7.push(APP_TYPE[wf.appType]); q7s.push('Viability Workflow'); }
  if (MARKET[wf.market]) { q7.push('wholesale market: ' + MARKET[wf.market]); q7s.push('Viability Workflow'); }
  answer('q7', q7.join('; '), q7s);
  note('7 Classification', A.q7.text || '(blank)', A.q7.sources.join('; ') || 'no project mode chosen (the editor default is not a choice)');

  answer('q8', '', []); note('8 Utility contact', '(blank)', 'never on the platform — the developer answers');

  /* 9 · application and queue */
  var q9 = [], q9s = [];
  if (ERCOT_STATUS[wf.icStatusErcot]) q9.push('ERCOT interconnection: ' + ERCOT_STATUS[wf.icStatusErcot]);
  else if (APP_STATUS[wf.appStatus]) q9.push('Interconnection: ' + APP_STATUS[wf.appStatus]);
  if (wf.queuePos) q9.push('queue / application number ' + wf.queuePos);
  if (q9.length) q9s.push('Viability Workflow');
  answer('q9', q9.join('; '), q9s);
  note('9 Application and queue', A.q9.text || '(blank)', A.q9.sources.join('; ') || 'not on the project — the developer answers');

  /* 10 · utility requirements */
  var q10 = [], q10s = [];
  if (wf.appType === 'full_study') q10.push('A full interconnection study is required');
  if (wf.icNotes) q10.push("Interconnection notes from the developer's workflow: " + wf.icNotes);
  if (q10.length) q10s.push('Viability Workflow');
  answer('q10', q10.join('. '), q10s);
  note('10 Utility requirements', A.q10.text || '(blank)', A.q10.sources.join('; ') || 'never on the platform');

  /* 11 · utility timeline */
  var q11 = [], q11s = [];
  if (wf.timeline) q11.push("Estimated interconnection timeline per the developer's workflow: " + wf.timeline + (/[a-z]/i.test(wf.timeline) ? '' : ' weeks'));
  if (flag.ss_ic_moratorium) q11.push('utility interconnection queue frozen / moratorium flagged');
  if (flag.ss_feeder_overload) q11.push('utility feeder at or near capacity flagged');
  if (wf.queueRisk === 'high' || wf.queueRisk === 'moderate') q11.push('queue risk rated ' + wf.queueRisk + ' by the developer');
  if (q11.length) q11s.push('Viability Workflow');
  answer('q11', q11.join('; '), q11s);
  note('11 Utility timeline', A.q11.text || '(blank)', A.q11.sources.join('; ') || 'never on the platform');

  /* 12 · connection point */
  var q12 = [], q12s = [], screening = false;
  if (wf.poiName || wf.substation || wf.poiKv || wf.gentieMi) {
    q12.push("Developer's POI: " + joinNice([wf.poiName, wf.substation && wf.substation !== wf.poiName ? 'substation ' + wf.substation : '', wf.poiKv ? fmtNum(wf.poiKv, 2) + ' kV' : '',
      wf.gentieMi ? 'gen-tie about ' + fmtNum(wf.gentieMi, 1) + ' mi' + (wf.gentieKv ? ' at ' + fmtNum(wf.gentieKv, 1) + ' kV' : '') : ''], ', '));
    q12s.push('Viability Workflow');
  }
  if (f.poi.kind === 'utility-xfmr' || f.poi.kind === 'substation') {
    q12.push('POI on the site map: ' + (f.poi.kind === 'substation' ? 'substation' : 'utility transformer') + (f.poi.ft ? ', about ' + fmtNum(f.poi.ft >= 5280 ? f.poi.ft / 5280 : f.poi.ft, 1) + (f.poi.ft >= 5280 ? ' mi' : ' ft') + ' from the equipment' : ''));
    q12s.push('site map POI');
  }
  var sub = f.grid.substations[0] || null;
  if (sub && (sub.name || sub.distanceKm != null)) {
    q12.push('Nearest substation per Grid Atlas' + (f.grid.ranAt ? ' (' + f.grid.ranAt.slice(0, 10) + ')' : '') + ': ' + joinNice([sub.name, sub.voltageKv != null ? fmtNum(sub.voltageKv, 0) + ' kV' : '', sub.distanceKm != null ? 'about ' + fmtNum(kmToMi(sub.distanceKm), 1) + ' mi' : '', sub.owner ? 'owner ' + sub.owner : ''], ', '));
    q12s.push('Grid Atlas'); screening = true;
  } else if (f.gridAtlas.nearestSubstationKm != null) {
    q12.push('Nearest substation per Grid Atlas: ' + joinNice([f.gridAtlas.nearestSubstationName, f.gridAtlas.nearestSubstationKv ? fmtNum(f.gridAtlas.nearestSubstationKv, 0) + ' kV' : '', 'about ' + fmtNum(kmToMi(f.gridAtlas.nearestSubstationKm), 1) + ' mi', f.gridAtlas.owner ? 'owner ' + f.gridAtlas.owner : ''], ', '));
    q12s.push('Grid Atlas'); screening = true;
  } else if (f.autopilot.nearestSubstationKm != null) {
    q12.push('Nearest substation about ' + fmtNum(kmToMi(f.autopilot.nearestSubstationKm), 1) + ' mi' + (f.autopilot.owner ? ' (owner ' + f.autopilot.owner + ')' : ''));
    q12s.push('Grid Atlas (autopilot run)'); screening = true;
  }
  var ln = f.grid.lines[0] || null;
  if (ln && (ln.voltageKv != null || ln.distanceKm != null)) q12.push('nearest line ' + joinNice([ln.voltageKv != null ? fmtNum(ln.voltageKv, 0) + ' kV' : '', ln.distanceKm != null ? 'about ' + fmtNum(kmToMi(ln.distanceKm), 1) + ' mi' : ''], ', '));
  var sl = f.substationLookup;
  if (sl.name || sl.miles != null) {
    q12.push('Substation lookup: ' + joinNice([sl.name, sl.kv ? fmtNum(sl.kv, 0) + ' kV' : '', sl.miles != null ? fmtNum(sl.miles, 1) + ' mi ' + sl.dir : '', sl.capMw ? fmtNum(sl.capMw, 0) + ' MW planning basis' : ''], ', '));
    q12s.push('substation lookup' + (sl.source ? ' (' + sl.source + ')' : '')); screening = true;
  }
  if (screening) q12.push('Screening estimate from public grid data — not a substitute for the utility interconnection study.');
  answer('q12', q12.join('; '), q12s);
  note('12 Connection point', A.q12.text || '(blank)', A.q12.sources.join('; ') || 'no POI, lookup or Grid Atlas result on the project');

  /* 13 · buyer */
  var q13 = [], q13s = [];
  if (mode && mode.mode === 'BTM') {
    q13.push("The host facility's own load (behind the meter)");
    if (f.offtaker.name) { q13.push((f.offtaker.guided ? 'load class: ' : 'named on the project: ') + f.offtaker.name); q13s.push(f.offtaker.guided ? 'guided build offtaker class' : 'offtaker named on the project'); }
    q13s.push(mode.src);
  }
  else if (mode && (mode.mode === 'EVSE' || mode.mode === 'L2')) { q13.push('EV drivers charging at the site (behind the meter)'); q13s.push(mode.src); }
  else if (mode && (mode.mode === 'FTM' || mode.mode === 'EXPORT')) {
    var mkt = MARKET[wf.market] ? ' (' + MARKET[wf.market] + ')' : '';
    if (f.offtaker.name && !f.offtaker.guided) { q13.push('Utility / wholesale market' + mkt + '; offtaker named on the project: ' + f.offtaker.name); q13s.push('offtaker named on the project'); }
    else q13.push('Utility / wholesale market — the project exports; no offtaker is named on the project record' + mkt);
    q13s.push(mode.src);
  }
  else if (d.itKw) { q13.push('The on-site data center load (' + fmtNum(d.itKw / 1000, 2) + ' MW of IT load on the site map)'); q13s.push('the site map drawing'); }
  answer('q13', q13.join(' · '), q13s);
  note('13 Power buyer', A.q13.text || '(blank)', A.q13.sources.join('; ') || 'no project mode chosen; a buyer is never a company name here');

  answer('q14', '', []); note('14 LOI / PPA', '(blank)', 'never on the platform — attach');
  var q15 = [], q15s = [];
  if (utilType === 'COOP' || utilType === 'MUNI') { q15.push('The serving utility is ' + (utilType === 'COOP' ? 'an electric cooperative' : 'a municipal utility') + '; its wholesale supplier and whether the project is allowable are not on the project record'); q15s.push('Viability Workflow'); }
  answer('q15', q15.join(' '), q15s);
  note('15 Co-op / municipal supply', A.q15.text || '(blank)', A.q15.sources.join('; ') || 'never on the platform');

  /* 16 · authority and use */
  var q16 = [], q16s = [];
  var ahj = wf.ahj || f.site.ahjName;
  if (ahj) { q16.push('Authority having jurisdiction: ' + ahj); q16s.push(wf.ahj ? 'Viability Workflow' : 'site data'); }
  else if (wf.research.jurisdiction) { q16.push('Jurisdiction per the address research: ' + wf.research.jurisdiction); q16s.push("Viability Workflow's address research — verify"); }
  else if (county) { q16.push(countyWord(county) + (state ? ', ' + state : '') + (f.city ? '; city on the address: ' + f.city : '') + ' — confirm which is the land-use authority for this parcel'); q16s.push(countySrc); }
  if (wf.fireDept) q16.push('fire authority: ' + wf.fireDept);
  var zoning = wf.zoning || f.site.parcelZoning;
  if (zoning) { q16.push('parcel zoning: ' + zoning + (f.site.parcelZoning && !wf.zoning ? ' (per ' + parcelSrc + ')' : '')); q16s.push(wf.zoning ? 'Viability Workflow' : 'parcel record'); }
  var useKnown = false;
  if (flag.ss_zoning_prohibited) { q16.push('zoning explicitly prohibits energy storage (flagged in the site screen)'); q16s.push('Viability Workflow site screen'); useKnown = true; }
  else if (check.p5_zoning_ok) { q16.push("zoning allows BESS as an accessory use (developer's permitting check)"); q16s.push('Viability Workflow'); useKnown = true; }
  if (flag.ss_overlay_zone) q16.push('overlay zone with special BESS restrictions (flagged)');
  if (q16.length && !useKnown) q16.push('Whether utility-scale solar or storage is a permitted use on this parcel is not on the project record — confirm with the authority.');
  answer('q16', q16.join('; '), q16s);
  note('16 Authority and use', A.q16.text || '(blank)', A.q16.sources.join('; ') || 'nothing on the project');

  /* 17 · permitting timeline */
  var q17 = [], q17s = [];
  if (flag.ss_moratorium) { q17.push('the municipality has an ESS development moratorium (flagged in the site screen)'); q17s.push('Viability Workflow site screen'); }
  var permits = [['p5_elec', 'electrical'], ['p5_bldg', 'building'], ['p5_fire_perm', 'fire department'], ['p5_civil', 'civil / site plan'], ['p5_stormwater', 'stormwater review'],
    ['p5_erp', 'emergency response plan'], ['p5_haz', 'hazard mitigation plan']].filter(function (x) { return check[x[0]]; }).map(function (x) { return x[1]; });
  if (permits.length) { q17.push('Permits identified: ' + permits.join(', ')); q17s.push('Viability Workflow'); }
  if (wf.notes) { q17.push('Permitting notes: ' + wf.notes); q17s.push('Viability Workflow'); }
  if (f.site.ahjPermitDays) { q17.push('typical permit turnaround on file for the jurisdiction: about ' + fmtNum(f.site.ahjPermitDays, 0) + ' days'); q17s.push('site data'); }
  answer('q17', q17.join('; '), q17s);
  note('17 Permitting timeline', A.q17.text || '(blank)', A.q17.sources.join('; ') || 'not on the project — the developer answers');

  /* 18 · site concerns */
  var q18 = [], q18s = [], screened = {};
  if (flag.ss_floodplain) { q18.push('Flood: in a FEMA 100-year floodplain (Zone A/AE/AO), flagged in the site screen'); q18s.push('Viability Workflow site screen'); screened.flood = 1; }
  else if (check.p5_flood_ok) { q18.push("Flood: not in the 100-year floodplain (developer's permitting check)"); q18s.push('Viability Workflow'); screened.flood = 1; }
  else if (wf.flood === '1') { q18.push('Flood: minimal flood risk' + (wf.research.floodZone ? ' (FEMA zone ' + wf.research.floodZone + ')' : '') + " per the Viability Workflow's address research — verify on the FEMA map"); q18s.push("Viability Workflow's address research"); screened.flood = 1; }
  else if (wf.flood === '0') { q18.push('Flood: in or near a mapped floodplain' + (wf.research.floodZone ? ' (FEMA zone ' + wf.research.floodZone + ')' : '') + " per the Viability Workflow's address research — review"); q18s.push("Viability Workflow's address research"); screened.flood = 1; }
  if (flag.ss_wetlands) { q18.push('wetlands within 100 ft of the BESS pad (flagged)'); q18s.push('Viability Workflow site screen'); screened.wetlands = 1; }
  if (flag.ss_soil_contamination) { q18.push('known brownfield or soil contamination (flagged)'); q18s.push('Viability Workflow site screen'); screened.contamination = 1; }
  if (flag.ss_historic_district) { q18.push('historic district or landmark designation (flagged)'); q18s.push('Viability Workflow site screen'); }
  else if (check.p5_historic_ok) { q18.push("no historic or environmental restrictions (developer's permitting check)"); q18s.push('Viability Workflow'); }
  if (flag.ss_noise_ordinance) { q18.push('local noise ordinance below BESS HVAC output (flagged)'); q18s.push('Viability Workflow site screen'); }
  if (flag.ss_drainage_conflict) { q18.push('BESS pad conflicts with stormwater drainage (flagged)'); q18s.push('Viability Workflow site screen'); }
  var envEx = f.exclusions.filter(function (x) { return /wetland|flood|water/i.test(x.reason); });
  if (envEx.length) {
    q18.push('traced on the site map: ' + envEx.map(function (x) { return x.reason + (x.acres ? ' about ' + fmtNum(x.acres, 1) + ' ac' : ''); }).join('; '));
    q18s.push('site map exclusions');
    envEx.forEach(function (x) { if (/wetland|water/i.test(x.reason)) screened.wetlands = 1; if (/flood/i.test(x.reason)) screened.flood = 1; });
  }
  if (f.terrain.reliefFt != null && f.terrain.areaFt2) {
    q18.push('terrain: about ' + fmtNum(f.terrain.reliefFt, 0) + ' ft of relief across the sampled ' + fmtNum(f.terrain.areaFt2 / 43560, 1) + ' acres' +
      (f.terrain.slopePct != null ? ', average grade about ' + fmtNum(f.terrain.slopePct, 1) + '%' : ''));
    q18s.push('terrain sample'); screened.slopes = 1;
  }
  if (wf.ssCustom) { q18.push('other: ' + wf.ssCustom); q18s.push('Viability Workflow site screen'); }
  if (q18.length) {
    var notScreened = [['wetlands', 'wetlands'], ['species', 'protected species'], ['contamination', 'contamination'], ['farmland', 'protected farmland'],
      ['airport', 'airport'], ['community', 'community opposition']].filter(function (x) { return !screened[x[0]]; }).map(function (x) { return x[1]; });
    if (notScreened.length) q18.push('Not screened by OMEGA: ' + notScreened.join(', ') + '.');
  }
  answer('q18', q18.join('; '), q18s);
  note('18 Site concerns', A.q18.text || '(blank)', A.q18.sources.join('; ') || 'not screened — the developer answers');

  /* status block */
  var capex = f.run.total || pos(p.capex) || null;
  var capexSrc = f.run.total ? 'the Site Map Run (total install' + (f.run.contracted ? ', contracted figure' : '') + ')'
    : (pos(p.capex) ? 'the project record (' + (p.capexSource === 'site-map' ? 'Site Map Run' : 'entered') + (num(p.capexAt) ? ', ' + longDate(new Date(num(p.capexAt))) : '') + ')' : '');
  var finSrc = fin ? 'the Apply for Financing request' + (fin.status ? ' (' + fin.status + ')' : '') : '';
  var cod = normalizeDate(wf.codDate), finCod = fin ? normalizeDate(fin.codDate) : { text: '' }, ntp = fin ? normalizeDate(fin.ntpDate) : { text: '' };
  var financing = '';
  if (fin && fin.amount) financing = money(fin.amount) + (fin.product ? ' ' + fin.product.toLowerCase() : '') + (fin.termMonths ? ', ' + fmtNum(fin.termMonths, 0) + '-month term' : '');
  var status = {
    constructionStart: ntp.text ? { text: ntp.text + ' (notice to proceed on the Apply for Financing request)', sources: [finSrc] } : { text: '', sources: [] },
    cod: cod.text ? { text: cod.text, sources: ['Viability Workflow'] } : (finCod.text ? { text: finCod.text, sources: [finSrc] } : { text: '', sources: [] }),
    totalCost: { text: capex ? money(capex) + ' — ' + capexSrc : '', sources: capex ? [capexSrc] : [] },
    financing: financing ? { text: financing, sources: [finSrc] } : { text: '', sources: [] }
  };
  note('Target construction start', status.constructionStart.text || '(blank)', status.constructionStart.sources[0] || 'not on the project — the developer answers');
  note('Target COD', status.cod.text || '(blank)', status.cod.sources[0] || 'not on the project');
  note('Estimated total project cost', status.totalCost.text || '(blank)', status.totalCost.sources[0] || 'the site has not been priced');
  note('Financing requested', status.financing.text || '(blank)', status.financing.sources[0] || 'typed by the developer');

  /* attachments: only what the platform can actually produce is pre-ticked */
  var att = {};
  Object.keys(ATTACHMENT_LABEL).forEach(function (k) { att[k] = { on: false, why: '' }; });
  if (apn || parcelAcres) att.addressParcel = { on: true, why: 'address and parcel number are on the form' };
  if (d.hasBoundary || parcelAcres || f.boundary.acres) att.boundaryKml = { on: true, why: 'the parcel boundary is on the site map (export it as KMZ from Site Map)' };
  if (d.elements || d.units) att.layoutSitePlan = { on: true, why: 'the site map layout; a snapshot is attached when the box below is ticked' };
  if (screening || f.poi.kind === 'substation' || f.poi.kind === 'utility-xfmr') att.distanceMap = { on: true, why: 'Grid Atlas / substation lookup / POI on the site map' };
  if (A.q16.text || A.q17.text || A.q18.text) att.permitEnvironmental = { on: true, why: 'the jurisdiction, zoning and site facts above' };

  return { cover: cover, answers: A, status: status, attachments: att, provenance: prov,
           sendingAs: { org: orgName, who: who }, questions: QUESTIONS, attachmentLabels: ATTACHMENT_LABEL };
}

/* ── the draft as the person sends it back ──────────────────────────
   Strings and numbers only (an object is not an answer, and "false" is not
   an unticked box: a box is ticked by a literal true or {on: true}); every
   text transliterated to what the form's font can print; capped. `changed`
   names each box whose characters had to change, `date` whether the cover
   date is one the form's date field reads. */
var LABEL = { submittedBy: 'Submitted by', projectNameLocation: 'Project name and location', date: 'Date',
  constructionStart: 'Target construction start', cod: 'Target COD', totalCost: 'Estimated total project cost', financing: 'Financing requested' };
function questionLabel(q) { return 'Q' + String(q).replace('q', ''); }
function cleanDraft(raw) {
  function obj(x) { return (x && typeof x === 'object' && !Array.isArray(x)) ? x : {}; }
  raw = obj(raw);
  var cover = obj(raw.cover), answers = obj(raw.answers), status = obj(raw.status), att = obj(raw.attachments), changed = [];
  function text(v, max, lines, label) {
    if (v && typeof v === 'object' && !Array.isArray(v)) v = v.text;
    if (typeof v !== 'string' && typeof v !== 'number') return '';
    var s = String(v).replace(/\r\n?/g, '\n');
    function tidy(t) {
      return lines ? t.split('\n').map(function (l) { return l.replace(/[ \t]+/g, ' ').trim(); }).filter(Boolean).join('\n')
                   : t.replace(/\s+/g, ' ').trim();
    }
    var plain = tidy(s.replace(/[\t\u00a0\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]/g, ' ')), printed = tidy(toWinAnsi(s, lines));
    if (printed !== plain && label && changed.indexOf(label) < 0) changed.push(label);
    return printed.slice(0, max);
  }
  var date = normalizeDate(text(cover.date, 40, false, LABEL.date));
  var out = { cover: { submittedBy: text(cover.submittedBy, 300, true, LABEL.submittedBy), projectNameLocation: text(cover.projectNameLocation, 300, true, LABEL.projectNameLocation), date: date.text },
              answers: {}, status: {}, attachments: {}, changed: changed, date: { ok: date.ok, iso: date.iso || null } };
  Object.keys(QUESTION_PREFIX).forEach(function (q) { out.answers[q] = text(answers[q], 2000, false, questionLabel(q)); });
  Object.keys(STATUS).forEach(function (k) { out.status[k] = text(status[k], 400, false, LABEL[k]); });
  Object.keys(ATTACHMENT_LABEL).forEach(function (k) { var a = att[k]; out.attachments[k] = a === true || !!(a && typeof a === 'object' && !Array.isArray(a) && a.on === true); });
  return out;
}

/* ── fill: the draft into Helios's own form ─────────────────────────── */
/* The width the viewer will DRAW. pdf-lib's widthOfTextAtSize is kerned;
   the field appearance it writes is not, so a kerned measure lets a line
   run past the clip. Measured per character, cached per font. */
function measurer(font) {
  var cache = {};
  return function (text, size) {
    var w = 0; text = String(text);
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (cache[ch] == null) cache[ch] = font.widthOfTextAtSize(ch, 1000);
      w += cache[ch];
    }
    return w * size / 1000;
  };
}
/* Words onto lines. `maxWidth` is a number or a function of the line
   index (the printed lines are not all the same width). A token longer
   than a line (a URL, an email, APNs joined by commas) is broken after
   a comma or semicolon, else / or @, else . - or _, where one falls in the
   line's second half, else between characters, so nothing is
   written past the box and then reported as fitting. */
function wrap(text, font, size, maxWidth) {
  var W = typeof font === 'function' ? font : measurer(font);
  function widthAt(i) { return typeof maxWidth === 'function' ? maxWidth(i) : maxWidth; }
  var words = String(text).replace(/\s+/g, ' ').trim().split(' '), lines = [], line = '';
  if (words.length === 1 && words[0] === '') return [];
  for (var i = 0; i < words.length; i++) {
    var w = words[i], test = line ? line + ' ' + w : w;
    if (W(test, size) <= widthAt(lines.length)) { line = test; continue; }
    if (line) { lines.push(line); line = ''; }
    while (W(w, size) > widthAt(lines.length)) {
      var max = widthAt(lines.length), k = 1;
      while (k < w.length && W(w.slice(0, k + 1), size) <= max) k++;
      /* a list separator first, then a path or address one, then a hyphen */
      var cut = -1, BREAKS = [',;', '/@', '.-_'];
      for (var bi = 0; bi < BREAKS.length && cut < 0; bi++) {
        for (var j = k; j > Math.floor(k / 2); j--) { if (BREAKS[bi].indexOf(w.charAt(j - 1)) >= 0) { cut = j; break; } }
      }
      if (cut < 0) cut = k;
      lines.push(w.slice(0, cut)); w = w.slice(cut);
    }
    line = w;
  }
  if (line) lines.push(line);
  return lines;
}
/* The last line that fits, with an ellipsis where the text was cut. */
function ellipsize(line, W, size, width) {
  line = String(line || '');
  while (line && W(line + ' …', size) > width) line = line.slice(0, -1);
  return line.replace(/\s+$/, '') + ' …';
}

/* The blank form, read from the function bundle (vercel.json includeFiles
   pins it). The served copy is the fallback, and its origin is resolved
   HERE, at module scope, so the bundler traces kit.js and a failure rejects
   instead of throwing inside a callback. */
var FORM_ORIGIN = process.env.HELIOS_FORM_ORIGIN || require('./kit').ORIGIN;
function templateBytes() {
  return new Promise(function (resolve, reject) {
    fs.readFile(TEMPLATE_PATH, function (err, buf) {
      try {
        if (!err && buf && buf.length) return resolve(new Uint8Array(buf));
        if (typeof fetch !== 'function') return reject(new Error('the blank Helios form is not on this deployment (' + TEMPLATE_PATH + ')'));
        fetch(FORM_ORIGIN + TEMPLATE_URL).then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.arrayBuffer(); })
          .then(function (ab) { resolve(new Uint8Array(ab)); })
          .catch(function (e) { reject(new Error('the blank Helios form could not be read: ' + e.message)); });
      } catch (e) { reject(e); }
    });
  });
}

/* fill(template, draft) → { bytes, report, issues, draft }
   draft   the draft as the person sent it; cleaned here (cleanDraft)
   report  one row per box: what was written, at what size, on how many
           lines, and whether anything was cut
   issues  the same in words, for the person before anything is sent:
           what was cut, what could not be printed as typed, a date the
           form does not read. Empty means the form holds every word.
   Nothing is ever written past a box: an answer longer than its printed
   lines is cut with an ellipsis and SAID to be cut. */
var PAD = 8;
function fill(template, rawDraft) {
  var PDF = pdfLib();
  var draft = cleanDraft(rawDraft);
  return PDF.PDFDocument.load(template).then(function (doc) {
    return doc.embedFont(PDF.StandardFonts.Helvetica).then(function (helv) {
      var form = doc.getForm(), report = [], issues = [], W = measurer(helv);
      function field(name) { try { return form.getTextField(name); } catch (e) { return null; } }
      function rect(fld) { return fld.acroField.getWidgets()[0].getRectangle(); }
      /* a box of `rows` lines at most: one line shrinking from `big` to
         `small`, then wrapped, then cut. Returns the row for the report. */
      function box(fld, value, big, small, floor, maxRows) {
        var r = rect(fld), width = r.width - PAD, height = r.height - 4, s, lines;
        var paras = String(value).split('\n');
        function layout(size) { var out = []; paras.forEach(function (p) { out = out.concat(wrap(p, W, size, width)); }); return out; }
        if (paras.length === 1) {
          for (s = big; s >= small - 1e-9; s -= 0.25) if (W(value, s) <= width) { fld.setFontSize(s); fld.setText(value); return { size: s, lines: 1, truncated: false }; }
        }
        for (s = Math.min(big, 9.5); s >= floor - 1e-9; s -= 0.25) {
          lines = layout(s);
          if (lines.length <= maxRows && lines.length * s * 1.2 <= height) {
            fld.enableMultiline(); fld.setFontSize(s); fld.setText(lines.join('\n'));
            return { size: s, lines: lines.length, truncated: false };
          }
        }
        s = floor; lines = layout(s);
        var keep = Math.max(1, Math.min(maxRows, Math.floor(height / (s * 1.2))));
        lines = lines.slice(0, keep); lines[keep - 1] = ellipsize(lines[keep - 1], W, s, width);
        fld.enableMultiline(); fld.setFontSize(s); fld.setText(lines.join('\n'));
        return { size: s, lines: keep, truncated: true };
      }

      /* cover: the two boxes keep every line the person wrote, shrinking to
         fit their height; the date field formats m/d/yy (AFDate), so only a
         date it reads is written */
      var c = draft.cover;
      ['submittedBy', 'projectNameLocation'].forEach(function (k) {
        var fld = field(COVER[k]); if (!fld) { report.push({ kind: 'missing', field: COVER[k], missing: true }); return; }
        if (!c[k]) return;
        var row = box(fld, c[k], 9.5, 9.5, 6.5, 6);
        report.push(Object.assign({ kind: 'cover', field: k, label: LABEL[k] }, row));
        if (row.truncated) issues.push(LABEL[k] + ' is longer than its box and was cut after ' + row.lines + ' lines.');
      });
      var dfld = field(COVER.date);
      if (!dfld) report.push({ kind: 'missing', field: COVER.date, missing: true });
      else if (c.date && draft.date.ok) { dfld.setFontSize(12); dfld.setText(c.date); report.push({ kind: 'cover', field: 'date', label: LABEL.date, size: 12, lines: 1, truncated: false }); }
      else if (c.date) { report.push({ kind: 'date', field: 'date', text: c.date, unparsed: true }); issues.push('"' + c.date + '" is not a date the form reads (m/d/yy), so the date was left blank.'); }

      Object.keys(QUESTION_PREFIX).forEach(function (q) {
        var lines = [];
        for (var n = 1; n <= 6; n++) { var fld = field(QUESTION_PREFIX[q] + ' ' + n); if (!fld) break; lines.push(fld); }
        if (!lines.length) { report.push({ kind: 'missing', question: q, missing: true }); return; }
        var text = draft.answers[q];
        if (!text) { report.push({ kind: 'question', question: q, lines: 0, of: lines.length }); return; }
        var widths = lines.map(function (fld) { return rect(fld).width - PAD; });
        function widthAt(i) { return widths[Math.min(i, widths.length - 1)]; }
        var size = 9, wrapped;
        for (;;) { wrapped = wrap(text, W, size, widthAt); if (wrapped.length <= lines.length || size <= 7) break; size -= 0.5; }
        var truncated = false;
        if (wrapped.length > lines.length) {
          wrapped = wrapped.slice(0, lines.length);
          wrapped[lines.length - 1] = ellipsize(wrapped[lines.length - 1], W, size, widthAt(lines.length - 1));
          truncated = true;
          issues.push(questionLabel(q) + ' is longer than its ' + lines.length + ' printed lines and was cut; shorten it, or put the rest in the note to Helios.');
        }
        lines.forEach(function (fld, i) { fld.setFontSize(size); fld.setText(wrapped[i] || ''); });
        report.push({ kind: 'question', question: q, lines: wrapped.length, of: lines.length, size: size, truncated: truncated });
      });

      Object.keys(STATUS).forEach(function (k) {
        var fld = field(STATUS[k]); if (!fld) { report.push({ kind: 'missing', field: STATUS[k], missing: true }); return; }
        if (!draft.status[k]) return;
        var row = box(fld, draft.status[k], 9.5, 7.5, 7, 2);
        report.push(Object.assign({ kind: 'status', field: k, label: LABEL[k] }, row));
        if (row.truncated) issues.push(LABEL[k] + ' is longer than its box and was cut.');
      });

      if (draft.changed.length) {
        report.push({ kind: 'normalized', fields: draft.changed.slice() });
        issues.push('Characters the form\'s font cannot print were replaced (accents dropped, symbols spelled out) in: ' + draft.changed.join(', ') + '.');
      }

      /* the attachment boxes, by position; by class, never by constructor
         name: the vendored build is minified */
      var boxes = form.getFields().filter(function (fl) { return fl instanceof PDF.PDFCheckBox; }).map(function (fl) {
        var r = rect(fl); return { f: fl, x: r.x, y: Math.round(r.y) };
      });
      var rows = []; boxes.forEach(function (b) { if (rows.indexOf(b.y) < 0) rows.push(b.y); }); rows.sort(function (a, b) { return b - a; });
      boxes.forEach(function (b) {
        var key = (ATTACHMENTS[rows.indexOf(b.y)] || [])[b.x < 200 ? 0 : 1];
        if (!key) return;
        if (draft.attachments[key]) b.f.check(); else b.f.uncheck();
      });

      form.updateFieldAppearances(helv);
      return doc.save().then(function (bytes) { return { bytes: bytes, report: report, issues: issues, draft: draft }; });
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
  var nd = normalizeDate(draft && draft.cover && draft.cover.date);
  var iso = nd.ok && nd.iso ? nd.iso : (today || new Date()).toISOString().slice(0, 10);
  return 'Helios-First-Pass-' + (base.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'project') + '-' + iso + '.pdf';
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
  toWinAnsi: toWinAnsi, normalizeDate: normalizeDate, fromDrawing: fromDrawing, modeOf: modeOf, finFacts: finFacts, measurer: measurer,
  QUESTIONS: QUESTIONS, QUESTION_PREFIX: QUESTION_PREFIX, ATTACHMENT_LABEL: ATTACHMENT_LABEL, ATTACHMENTS: ATTACHMENTS, STATUS: STATUS, COVER: COVER,
  TEMPLATE_PATH: TEMPLATE_PATH, TEMPLATE_URL: TEMPLATE_URL };
