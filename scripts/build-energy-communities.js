#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   scripts/build-energy-communities.js — the location tables the pro forma's
   site lookup reads, rebuilt from the government's own spreadsheets
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Writes three files that api/_lib/site-lookup.js require()s (Vercel bundles
   required JSON with the function, so a lookup costs no network call):

     api/_lib/data/ec_statistical_2026.json   §45/§48/§45Y/§48E energy
         community, STATISTICAL AREA category: every county that qualifies
         under IRS Notice 2026-39 Appendix 1 (2025 unemployment), keyed on
         the 2020 county GEOID.
     api/_lib/data/ec_coal_tracts_v5.json     energy community, COAL CLOSURE
         category: every 2020 census tract on the cumulative list (Notice
         2023-29 App. C through Notice 2026-39 App. 2).
     api/_lib/data/lic_cat1_2026.json         §48E(h) low-income bonus,
         Category 1 (NMTC low-income community) share of each 2025 tract.

   WHY STATIC TABLES AND NOT A MAP SERVICE. The obvious live source, the
   DOE/NETL ArcGIS layers, still serves Notice 2024-48 (2023 unemployment):
   against the 2026 list it has 174 counties that no longer qualify, misses
   140 that now do, and misses 152 coal-closure tracts. A financing team
   reads "energy community: yes" as ten points of ITC, so a stale map is
   worse than no answer. Treasury publishes the lists it computed; these are
   those lists, reshaped, with no judgement added.

   ─────────────────────────────────────────────────────────────────────────
   THE JUNE REFRESH (once a year, after the IRS energy-community notice)
   ─────────────────────────────────────────────────────────────────────────
   The statistical-area list changes every year: it is re-run on the prior
   year's unemployment and published in an IRS notice around June (2026-39
   landed 2026-06-10; the next, on 2026 unemployment, is expected June 2027).
   The coal-closure list only grows. The low-income Category 1 map is fixed
   through 2028 unless the program says otherwise.

     1. Open https://home.treasury.gov/policy-issues/tax-policy/data-transparency/all-treasury-generated-energy-communities-data-sets
     2. Point SOURCES below at the new files (the county file's name carries
        the unemployment year, e.g. EC_MSA_FFE_U2026_AllCounties.xlsx; the
        coal file's carries a version, e.g. EC_CC_V6.xlsx) and update NOTICE.
     3. node scripts/build-energy-communities.js
     4. node scripts/tests/tsitelookup.js, then commit the three JSON files.
   The output file names stay the same on purpose, so the require() paths in
   site-lookup.js never change; the notice and data vintage travel inside
   each file's `meta` and come back to the page in the lookup's asOf.

     node scripts/build-energy-communities.js                 # download, build, write
     node scripts/build-energy-communities.js --from <dir>    # local copies, same file names
     node scripts/build-energy-communities.js --check         # build, compare, write nothing

   No dependencies: a spreadsheet is a zip of XML, and Node has zlib. The
   reader below handles exactly what these three workbooks use.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

var fs = require('fs');
var path = require('path');
var zlib = require('zlib');
var crypto = require('crypto');

var ROOT = path.join(__dirname, '..');
var OUT_DIR = path.join(ROOT, 'api', '_lib', 'data');

/* What the tables say about themselves. Update with SOURCES each June. */
var NOTICE = {
  notice: 'IRS Notice 2026-39',
  effective: '2026-06-10',
  unemploymentYear: 2025,
  nextExpected: 'June 2027 (Notice on 2026 unemployment)'
};

var SOURCES = {
  statistical: {
    file: 'EC_MSA_FFE_U2025_AllCounties.xlsx',
    url: 'https://home.treasury.gov/system/files/131/EC_MSA_FFE_U2025_AllCounties.xlsx'
  },
  coal: {
    file: 'EC_CC_V5.xlsx',
    url: 'https://home.treasury.gov/system/files/131/EC_CC_V5.xlsx'
  },
  lowIncome: {
    file: 'CleanElectricityLowIncome_2026.xlsx',
    url: 'https://data.nlr.gov/system/files/315/1771958807-CleanElectricityLowIncome_Excel_20260217_0.xlsx'
  }
};
var METHODOLOGY = 'https://home.treasury.gov/system/files/131/EC-Data-Methodology-V3-06122026.pdf';
var TREASURY_PAGE = 'https://home.treasury.gov/policy-issues/tax-policy/data-transparency/all-treasury-generated-energy-communities-data-sets';

/* ── a minimal .xlsx reader ──────────────────────────────────────────────── */

/* zip → { name: Buffer } for the entries asked for. Central directory, not
   local headers: a streamed zip may leave the sizes in a local header 0. */
function unzip(buf, want) {
  var eocd = -1, i;
  for (i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not a zip file (no end-of-central-directory record)');
  var count = buf.readUInt16LE(eocd + 10);
  var p = buf.readUInt32LE(eocd + 16);
  if (p === 0xffffffff) throw new Error('zip64 archives are not supported');
  var out = {};
  for (i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('corrupt zip central directory');
    var method = buf.readUInt16LE(p + 10);
    var csize = buf.readUInt32LE(p + 20);
    var nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
    var local = buf.readUInt32LE(p + 42);
    var name = buf.toString('utf8', p + 46, p + 46 + nlen);
    p += 46 + nlen + xlen + clen;
    if (want && want.indexOf(name) < 0 && !/^xl\/worksheets\/sheet\d+\.xml$/.test(name)) continue;
    if (buf.readUInt32LE(local) !== 0x04034b50) throw new Error('corrupt zip local header for ' + name);
    var start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    var raw = buf.slice(start, start + csize);
    if (method === 0) out[name] = raw;
    else if (method === 8) out[name] = zlib.inflateRawSync(raw);
    else throw new Error('unsupported zip compression method ' + method + ' for ' + name);
  }
  return out;
}

function xmlText(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, function (m, e) {
    var k = e.toLowerCase();
    if (k === 'amp') return '&';
    if (k === 'lt') return '<';
    if (k === 'gt') return '>';
    if (k === 'quot') return '"';
    if (k === 'apos') return '\'';
    return String.fromCharCode(k.charAt(1) === 'x' ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10));
  });
}
function attr(tag, name) {
  var m = new RegExp('\\s' + name + '="([^"]*)"').exec(tag);
  return m ? xmlText(m[1]) : null;
}
/* All <t> runs inside one <si> or <is>, joined: rich text splits a cell. */
function runs(xml) {
  var out = '', re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g, m;
  while ((m = re.exec(xml))) out += xmlText(m[1]);
  return out;
}
function colIndex(ref) {
  var s = /^[A-Z]+/.exec(ref)[0], n = 0, i;
  for (i = 0; i < s.length; i++) n = n * 26 + s.charCodeAt(i) - 64;
  return n - 1;
}

/* workbook → { sheetName: [ [cell, …], … ] } with every cell a string. */
function readXlsx(buf) {
  var z = unzip(buf, ['xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/sharedStrings.xml']);
  var strings = [];
  if (z['xl/sharedStrings.xml']) {
    var sx = z['xl/sharedStrings.xml'].toString('utf8'), re = /<si>([\s\S]*?)<\/si>|<si\/>/g, m;
    while ((m = re.exec(sx))) strings.push(m[1] ? runs(m[1]) : '');
  }
  var rels = {}, rx = z['xl/_rels/workbook.xml.rels'].toString('utf8'), r, rre = /<Relationship\b[^>]*>/g;
  while ((r = rre.exec(rx))) rels[attr(r[0], 'Id')] = attr(r[0], 'Target');
  var wb = z['xl/workbook.xml'].toString('utf8'), sre = /<sheet\b[^>]*>/g, s, out = {};
  while ((s = sre.exec(wb))) {
    var target = rels[attr(s[0], 'r:id')] || '';
    target = target.replace(/^\//, '');
    if (target.indexOf('xl/') !== 0) target = 'xl/' + target;
    if (!z[target]) throw new Error('sheet ' + attr(s[0], 'name') + ' is missing from the workbook');
    out[attr(s[0], 'name')] = sheetRows(z[target].toString('utf8'), strings);
  }
  return out;
}

function sheetRows(xml, strings) {
  var rows = [], rre = /<row\b[^>]*>([\s\S]*?)<\/row>/g, rm;
  while ((rm = rre.exec(xml))) {
    var cells = [], cre = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, cm;
    while ((cm = cre.exec(rm[1]))) {
      var head = '<c' + cm[1] + '>', body = cm[2] || '', type = attr(head, 't'), ref = attr(head, 'r');
      var v = /<v>([\s\S]*?)<\/v>/.exec(body), val = '';
      if (type === 'inlineStr') val = runs(body);
      else if (v && type === 's') val = strings[parseInt(v[1], 10)] || '';
      else if (v) val = xmlText(v[1]);
      cells[ref ? colIndex(ref) : cells.length] = val;
    }
    for (var i = 0; i < cells.length; i++) if (cells[i] === undefined) cells[i] = '';
    if (cells.length) rows.push(cells);
  }
  return rows;
}

/* ── shaping ─────────────────────────────────────────────────────────────── */

function norm(s) { return String(s || '').toLowerCase().replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, ''); }
/* The header row is found by name and every column by a pattern, so a
   column Treasury inserts next June moves nothing here. */
function headerRow(rows, mustHave) {
  for (var i = 0; i < Math.min(rows.length, 20); i++) {
    var line = rows[i].map(norm).join('|');
    if (line.indexOf(mustHave) >= 0) return i;
  }
  throw new Error('no header row containing "' + mustHave + '"');
}
function column(header, re, what) {
  for (var i = 0; i < header.length; i++) if (re.test(norm(header[i]))) return i;
  throw new Error('no column for ' + what + ' (' + re + ')');
}
function pad(s, n) {
  s = String(s).replace(/\.0+$/, '').replace(/^\s+|\s+$/g, '');
  while (s.length < n) s = '0' + s;
  return s;
}
/* Treasury stores 4.31 as 4.3099999999999996. */
function r2(v) { var n = parseFloat(v); return isFinite(n) ? Math.round(n * 100) / 100 : 0; }
function flag(v) { return String(v).replace(/\s+/g, '') === '1'; }

function buildStatistical(book) {
  var name = Object.keys(book)[0], rows = book[name];
  var h = headerRow(rows, 'state fips code'), H = rows[h];
  var c = {
    st: column(H, /^state fips code$/, 'state FIPS'),
    co: column(H, /^county fips code$/, 'county FIPS'),
    msa1: column(H, /^msa or non-msa name \(vintage 1\)$/, 'vintage 1 area name'),
    msa2: column(H, /^msa or non-msa name \(vintage 2\)$/, 'vintage 2 area name'),
    nat: column(H, /^ec national unemployment rate \d{4}$/, 'national unemployment rate'),
    ur1: column(H, /^\d{4} unemployment rate for msa\/non-msa, vintage 1$/, 'vintage 1 unemployment rate'),
    ur2: column(H, /^\d{4} unemployment rate for msa\/non-msa, vintage 2$/, 'vintage 2 unemployment rate'),
    ec1: column(H, /^\d{4} energy community \(vintage 1\) \(0\/1\)$/, 'vintage 1 energy community flag'),
    ec2: column(H, /^\d{4} energy community \(vintage 2\) \(0\/1\)$/, 'vintage 2 energy community flag'),
    ec: column(H, /^\d{4} energy community \(one or both vintages\)$/, 'energy community flag')
  };
  var year = parseInt(/(\d{4})$/.exec(norm(H[c.nat]))[1], 10);
  if (year !== NOTICE.unemploymentYear) {
    throw new Error('the county file is for ' + year + ' unemployment but NOTICE says ' + NOTICE.unemploymentYear + '; update NOTICE with SOURCES');
  }
  var counties = {}, all = 0, nat = null, i;
  for (i = h + 1; i < rows.length; i++) {
    var row = rows[i];
    if (!/^\d+$/.test(String(row[c.st] || '').replace(/\.0+$/, ''))) continue;
    all++;
    if (nat === null) nat = r2(row[c.nat]);
    if (!flag(row[c.ec])) continue;
    counties[pad(row[c.st], 2) + pad(row[c.co], 3)] = {
      v1: flag(row[c.ec1]), v2: flag(row[c.ec2]),
      msa1: String(row[c.msa1] || ''), msa2: String(row[c.msa2] || ''),
      ur1: r2(row[c.ur1]), ur2: r2(row[c.ur2])
    };
  }
  var n = Object.keys(counties).length;
  if (all < 3000 || n < 100 || !(nat > 1 && nat < 20)) {
    throw new Error('the county file does not look like the full list (' + all + ' counties, ' + n + ' qualifying, national rate ' + nat + ')');
  }
  return { counties: counties, nationalRate: nat, countiesInFile: all };
}

var MONTHS = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
function isoDate(text) {
  var m = /^([a-z]{3})[a-z]*\.?\s+(\d{1,2}),\s*(\d{4})$/i.exec(String(text).replace(/^\s+|\s+$/g, ''));
  if (!m || !MONTHS[m[1].toLowerCase()]) return null;
  return m[3] + '-' + MONTHS[m[1].toLowerCase()] + '-' + pad(m[2], 2);
}

function buildCoal(book) {
  var name = Object.keys(book)[0], rows = book[name];
  var h = headerRow(rows, '2020 census tract number fips code'), H = rows[h];
  var c = {
    tract: column(H, /^2020 census tract number fips code$/, 'tract GEOID'),
    type: column(H, /^tract type$/, 'tract type'),
    since: column(H, /^date of eligibility$/, 'eligibility date')
  };
  var tracts = {}, i;
  for (i = h + 1; i < rows.length; i++) {
    var id = String(rows[i][c.tract] || '').replace(/\.0+$/, '');
    if (!/^\d{9,11}$/.test(id)) continue;
    var since = String(rows[i][c.since] || '').replace(/^\s+|\s+$/g, '');
    /* The page shows the date, and a date it cannot read would show as a
       blank: refuse the build instead. */
    if (!isoDate(since)) throw new Error('tract ' + id + ': unreadable eligibility date "' + since + '"');
    tracts[pad(id, 11)] = { type: String(rows[i][c.type] || '').replace(/^\s+|\s+$/g, ''), since: since };
  }
  if (Object.keys(tracts).length < 1000) throw new Error('the coal file has only ' + Object.keys(tracts).length + ' tracts');
  return { tracts: tracts };
}

function buildLowIncome(book) {
  var name = null, k;
  for (k in book) if (/tract percentages/i.test(k)) name = k;
  if (!name) throw new Error('no "Tract percentages" sheet in the low-income workbook');
  var rows = book[name], h = headerRow(rows, 'census tract geoid'), H = rows[h];
  var c = {
    tract: column(H, /^census tract geoid \d{4}$/, 'tract GEOID'),
    pct: column(H, /^percent in category 1$/, 'Category 1 percent')
  };
  var tractYear = parseInt(/(\d{4})$/.exec(norm(H[c.tract]))[1], 10);
  var pct = {}, ct = {}, all = 0, i;
  for (i = h + 1; i < rows.length; i++) {
    var id = String(rows[i][c.tract] || '').replace(/\.0+$/, '');
    if (!/^\d{9,11}$/.test(id)) continue;
    id = pad(id, 11);
    all++;
    var p = parseFloat(rows[i][c.pct]);
    if (isFinite(p) && p > 0) pct[id] = Math.round(p * 100) / 100;
    /* Connecticut's 2022 planning regions replaced its counties, so its
       tract GEOIDs changed county code while the six-digit tract code did
       not. The geocoder answers in 2020 geography; this index maps a 2020
       Connecticut tract to its current GEOID by that code. */
    if (id.slice(0, 2) === '09') ct[id.slice(5)] = id;
  }
  if (all < 80000) throw new Error('the low-income file has only ' + all + ' tracts');
  return { pctCategory1: pct, ctTracts: ct, tractsInFile: all, tractYear: tractYear };
}

/* ── I/O ─────────────────────────────────────────────────────────────────── */

function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }

function load(key, from) {
  var src = SOURCES[key];
  if (from) return Promise.resolve(fs.readFileSync(path.join(from, src.file)));
  return fetch(src.url, { redirect: 'follow' }).then(function (r) {
    if (!r.ok) throw new Error(src.url + ' → HTTP ' + r.status);
    return r.arrayBuffer();
  }).then(function (ab) { return Buffer.from(ab); });
}

function sourceMeta(key, buf) {
  return { url: SOURCES[key].url, file: SOURCES[key].file, bytes: buf.length, sha256: sha256(buf) };
}

function main() {
  var args = process.argv.slice(2);
  var fromAt = args.indexOf('--from');
  var from = fromAt >= 0 ? args[fromAt + 1] : null;
  var check = args.indexOf('--check') >= 0;
  var builtAt = new Date().toISOString().slice(0, 10);

  return Promise.all([load('statistical', from), load('coal', from), load('lowIncome', from)]).then(function (bufs) {
    var sa = buildStatistical(readXlsx(bufs[0]));
    var cc = buildCoal(readXlsx(bufs[1]));
    var li = buildLowIncome(readXlsx(bufs[2]));
    var dataVintage = NOTICE.unemploymentYear + ' unemployment (BLS LAUS); 2020 counties';

    var files = {
      'ec_statistical_2026.json': {
        meta: {
          what: 'Energy community, statistical-area category: counties that qualify, keyed on the 2020 county GEOID',
          notice: NOTICE.notice, effective: NOTICE.effective, dataVintage: dataVintage,
          unemploymentYear: NOTICE.unemploymentYear,
          geography: '2020 counties (Census geocoder vintage Census2020_Current). Connecticut vintage 2 uses its 2022 planning regions (county codes 110-190).',
          builtAt: builtAt, refresh: 'Every June, after the IRS energy-community notice; next expected ' + NOTICE.nextExpected + '. See scripts/build-energy-communities.js.',
          source: sourceMeta('statistical', bufs[0]), methodology: METHODOLOGY, page: TREASURY_PAGE,
          countiesInFile: sa.countiesInFile, qualifying: Object.keys(sa.counties).length
        },
        source: 'Treasury ' + SOURCES.statistical.file + ' = ' + NOTICE.notice + ' Appendix 1',
        effective: NOTICE.effective,
        nationalRate2025: sa.nationalRate,
        countyGeoidVintage: '2020 (Census2020_Current)',
        counties: sa.counties
      },
      'ec_coal_tracts_v5.json': {
        meta: {
          what: 'Energy community, coal-closure category: 2020 census tracts with a coal mine closure after 1999 or a coal-fired unit retirement after 2009, and the tracts directly adjoining them',
          notice: NOTICE.notice, effective: NOTICE.effective,
          dataVintage: 'Cumulative: Notice 2023-29 App. C, 2023-47 App. 3, 2024-48 App. 2, 2025-31 App. 4, 2026-39 App. 2; 2020 tracts',
          geography: '2020 census tracts (Census geocoder vintage Census2020_Current)',
          builtAt: builtAt, refresh: 'Every June with the statistical-area list; this list only grows.',
          source: sourceMeta('coal', bufs[1]), methodology: METHODOLOGY, page: TREASURY_PAGE,
          tracts: Object.keys(cc.tracts).length
        },
        source: 'Treasury ' + SOURCES.coal.file + ' (cumulative through ' + NOTICE.notice + ' Appendix 2)',
        tractGeoidVintage: '2020 (Census2020_Current)',
        tracts: cc.tracts
      },
      'lic_cat1_2026.json': {
        meta: {
          what: '§48E(h) Low-Income Communities Bonus, Category 1 (NMTC low-income community): percent of each tract\'s land area in a Category 1 area; tracts at 0 are omitted',
          notice: 'Low-Income Communities Bonus Credit Program, geographic eligibility (update January 2026)',
          effective: '2024-09-01 through 2028',
          dataVintage: 'NMTC low-income map from 2016-2020 ACS; ' + li.tractYear + ' tracts',
          geography: li.tractYear + ' census tracts. Outside Connecticut these GEOIDs equal the 2020 ones; Connecticut is mapped through ctTracts.',
          builtAt: builtAt, refresh: 'When the program republishes (next expected 2028).',
          source: sourceMeta('lowIncome', bufs[2]),
          tractsInFile: li.tractsInFile, withCategory1: Object.keys(li.pctCategory1).length
        },
        source: 'data.nlr.gov/submissions/315 CleanElectricityLowIncome_Excel_20260217 (Category 1 = NMTC LIC, 2016-2020 ACS)',
        tractGeoidVintage: li.tractYear + ' (Current_Current)',
        pctCategory1: li.pctCategory1,
        ctTracts: li.ctTracts
      }
    };

    var changed = 0;
    Object.keys(files).forEach(function (f) {
      var p = path.join(OUT_DIR, f);
      var old = null;
      try { old = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { /* first build */ }
      var next = files[f];
      /* Compare the data, not the build date: a rebuild of the same files is
         not a change worth a commit. */
      var same = old && JSON.stringify(strip(old)) === JSON.stringify(strip(next));
      console.log((same ? '  same     ' : '  CHANGED  ') + f + summary(next));
      if (!same) changed++;
      if (!check && !same) {
        fs.mkdirSync(OUT_DIR, { recursive: true });
        fs.writeFileSync(p, JSON.stringify(next) + '\n');
      }
    });
    if (check && changed) process.exitCode = 1;
    console.log(check ? (changed ? '\n' + changed + ' table(s) differ from the committed ones.' : '\nThe committed tables are current.')
      : '\nWrote ' + changed + ' file(s) to ' + path.relative(ROOT, OUT_DIR) + '/.');
  });
}

function strip(o) {
  var c = JSON.parse(JSON.stringify(o));
  if (c.meta) delete c.meta.builtAt;
  return c;
}
function summary(o) {
  if (o.counties) return '  (' + Object.keys(o.counties).length + ' counties, national rate ' + o.nationalRate2025 + '%)';
  if (o.tracts) return '  (' + Object.keys(o.tracts).length + ' tracts)';
  return '  (' + Object.keys(o.pctCategory1).length + ' tracts with Category 1 area, ' + Object.keys(o.ctTracts).length + ' Connecticut tracts indexed)';
}

if (require.main === module) {
  main().catch(function (e) {
    console.error('build-energy-communities: ' + (e && e.message ? e.message : e));
    process.exit(1);
  });
}

module.exports = { readXlsx: readXlsx, buildStatistical: buildStatistical, buildCoal: buildCoal,
  buildLowIncome: buildLowIncome, isoDate: isoDate, NOTICE: NOTICE, SOURCES: SOURCES };
