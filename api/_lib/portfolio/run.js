/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/portfolio/run.js — one site, start to finish, and the package that
   feeds it
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   The orchestration api/customer-portfolio.js calls. Two jobs:

   intake(files)  a customer's upload — ZIP, CSV, XLSX, PDFs, images — into
                  classified files, parsed site lists and interval summaries.
                  Nothing is written here; the endpoint stores what this
                  returns. A ZIP is opened by zip.js (safe against traversal
                  and bombs); every file keeps its original name for the
                  provenance trail and gets a content hash as its id.

   processSite()  quality → size → screen → finance → next action, for ONE
                  site, catching its own errors so a bad site never stops
                  the batch. The interval file, if any, is read back from
                  private storage at run time; its values are never stored
                  on the Firestore record.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var crypto = require('crypto');
var zip = require('./zip'), csv = require('./csv'), xlsx = require('./xlsx'), I = require('./ingest'), M = require('./match'), V = require('./interval'), Q = require('./quality'), S = require('./size'), SC = require('./screen'), F = require('./finance');

var MAX_FILE = 25 * 1024 * 1024, MAX_REQUEST = 4 * 1024 * 1024;
var ALLOWED = /\.(zip|csv|xlsx|txt|pdf|png|jpe?g|dxf|dwg|docx?|kmz|kml)$/i;

function fail(status, msg) { var e = new Error(msg); e.status = status; throw e; }
function sha(b) { return crypto.createHash('sha256').update(b).digest('hex'); }
function safeFileName(raw) { var s = String(raw || '').replace(/\\/g, '/').split('/').map(function (p) { return p.replace(/[^A-Za-z0-9._ ()\-]/g, '_').slice(0, 120); }).filter(function (p) { return p && p !== '.' && p !== '..'; }).join('/'); return s || 'file'; }
function sniff(bytes, name) {
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b) return /\.xlsx$/i.test(name) ? 'xlsx' : 'zip';
  if (bytes.length >= 5 && bytes.subarray(0, 5).toString() === '%PDF-') return 'pdf';
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png';
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'jpeg';
  return 'text';
}

/* uploads: [{ name, bytes }] (already base64-decoded) → { files, siteLists, problems } */
function intake(uploads, now) {
  now = now || new Date().toISOString();
  var files = [], siteLists = [], problems = [], total = 0;
  function add(name, bytes, container) {
    name = safeFileName(name);
    if (!ALLOWED.test(name)) { problems.push({ file: name, error: 'File type not accepted' }); return; }
    if (bytes.length > MAX_FILE) { problems.push({ file: name, error: 'Larger than ' + (MAX_FILE / 1048576) + ' MB' }); return; }
    var kind = sniff(bytes, name);
    if (/\.pdf$/i.test(name) && kind !== 'pdf') { problems.push({ file: name, error: 'Not a PDF' }); return; }
    if (/\.(png|jpe?g)$/i.test(name) && ['png', 'jpeg'].indexOf(kind) < 0) { problems.push({ file: name, error: 'Not a PNG or JPEG image' }); return; }
    var type = M.classify(name, bytes), rec = { id: sha(bytes), name: name, container: container || null, type: type, size: bytes.length, sha256: sha(bytes), uploadedAt: now, bytes: bytes };
    if (type === 'sitelist') {
      try {
        var rows = kind === 'xlsx' || /\.xlsx$/i.test(name) ? xlsx.sheetRows(bytes) : csv.parse(bytes.toString('utf8'));
        var parsed = I.siteList(rows, name, now);
        if (parsed.sites.length) { siteLists.push({ file: name, sites: parsed.sites, problems: parsed.problems, unknownHeaders: parsed.unknownHeaders }); rec.sites = parsed.sites.length; }
        else if (/\.csv$/i.test(name)) { rec.type = M.classify(name.replace(/site|list|master/gi, ''), bytes) === 'interval' ? 'interval' : 'document'; problems.push({ file: name, error: parsed.problems.length ? parsed.problems[0].error : 'No sites found in this list' }); }
        else problems.push({ file: name, error: parsed.problems.length ? parsed.problems[0].error : 'No sites found in this workbook' });
      } catch (e) { problems.push({ file: name, error: e.message }); rec.type = 'document'; }
    }
    if (rec.type === 'interval') {
      var s = V.series(bytes.toString('utf8'));
      rec.interval = s.ok ? { readings: s.readings, intervalMin: s.intervalMin, days: s.days, completeYear: s.completeYear, peakKw: Math.round(s.peakKw * 10) / 10, kwh: Math.round(s.kwh) } : { ok: false, error: s.error };
      if (!s.ok) { rec.type = 'document'; problems.push({ file: name, error: 'Not readable as interval data: ' + s.error }); }
    }
    files.push(rec);
  }
  (uploads || []).forEach(function (u) {
    var bytes = Buffer.isBuffer(u.bytes) ? u.bytes : Buffer.from(String(u.base64 || ''), 'base64'), name = safeFileName(u.name);
    total += bytes.length;
    if (total > MAX_REQUEST) fail(413, 'This upload exceeds ' + (MAX_REQUEST / 1048576) + ' MB; send the portfolio in more than one upload');
    if (/\.zip$/i.test(name) || (sniff(bytes, name) === 'zip' && !/\.xlsx$/i.test(name))) {
      var entries;
      try { entries = zip.extract(bytes); } catch (e) { problems.push({ file: name, error: e.message }); return; }
      entries.forEach(function (en) { if (!/(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db)/i.test(en.name)) add(en.name, en.bytes, name); });
    } else add(name, bytes, null);
  });
  return { files: files, siteLists: siteLists, problems: problems };
}

/* site: the stored site record · ctx: { products, tenantCost, listPrices, now, readFile(path) → Promise<Buffer> } */
async function processSite(site, ctx) {
  ctx = ctx || {}; var now = ctx.now || new Date().toISOString(), out = {};
  try {
    var iv = (site.documents || []).filter(function (d) { return d.type === 'interval'; }).sort(function (a, b) { return (b.uploadedAt || '').localeCompare(a.uploadedAt || ''); })[0];
    var s = Object.assign({}, site);
    if (iv && ctx.readFile) {
      var bytes = await ctx.readFile(iv.path), ser = V.series(bytes.toString('utf8'));
      s.interval = ser.ok ? Object.assign({ file: iv.name }, ser, { values: undefined }) : { ok: false, error: ser.error, file: iv.name };
      s.intervalValues = ser.ok ? ser.values : null;
      delete s.interval.values;
    } else { s.interval = null; s.intervalValues = null; }
    var quality = Q.assess(s), sizing = S.size(s, quality, { products: ctx.products, tenantCost: ctx.tenantCost, now: now });
    var screening = SC.screen(s, quality, sizing), financial = F.evaluate(s, sizing, { tenantCost: ctx.tenantCost, listPrices: ctx.listPrices });
    out = { quality: quality, sizing: sizing, screening: screening, financial: financial, nextAction: SC.nextAction(screening.disposition, sizing, quality),
      interval: s.interval ? { file: s.interval.file, ok: s.interval.ok, readings: s.interval.readings, intervalMin: s.interval.intervalMin, days: s.interval.days, completeYear: s.interval.completeYear, peakKw: s.interval.peakKw, kwh: s.interval.kwh, error: s.interval.error || null } : null,
      status: sizing.status === 'unable' ? 'needs_information' : screening.disposition === 'hold' ? 'on_hold' : 'sized', error: null, processedAt: now };
  } catch (e) {
    out = { status: 'failed', error: String(e && e.message || e).slice(0, 300), processedAt: now };
  }
  return out;
}

module.exports = { intake: intake, processSite: processSite, sha: sha, safeFileName: safeFileName, MAX_REQUEST: MAX_REQUEST, MAX_FILE: MAX_FILE };
