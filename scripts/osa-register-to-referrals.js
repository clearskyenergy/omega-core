#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════════
   ClearSky-OMEGA · OSA canonical register → referral upload files
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Turns the "Project Register" tab of the OSA Canonical Portfolio workbook into
   the referral CSVs that tenants/osa/portfolio.html already imports, one file
   per partner, and DRY-RUNS each one through the real importer before writing
   it. Never deployed; never writes to Firestore. The upload itself stays a
   reviewed browser action — see PORTFOLIO.md § 8.

   ─────────────────────────────────────────────────────────────────────────────
   WHY THE HEADERS ARE NOT LISTED HERE
   ─────────────────────────────────────────────────────────────────────────────
   They are read out of tenants/osa/ingest-data.js at run time (Ingest.FIELDS,
   in a vm with its three globals stubbed, the way scripts/tests/tositescreen.js
   does it). A second copy of that list would drift, and the drift would be
   invisible: a renamed header does not fail, it silently lands as a blank
   column. Reading the one list means a file this writes always matches the
   importer that reads it, and the dry run proves it per row.

   ─────────────────────────────────────────────────────────────────────────────
   WHAT IT WILL NOT DO
   ─────────────────────────────────────────────────────────────────────────────
   Guess attribution. A row whose Portfolio Tag has no verified email domain
   goes to needs-attribution.csv and nowhere else. Attribution locks the moment
   a deal advances, so a plausible guess here is a wrong number in the partner
   reporting that nobody can unpick afterwards. The domains below come from the
   workbook's own JV Status Cadence tab (verified recipients, read 2026-10-27);
   --partners <file.json> overrides them.

   Usage
     node scripts/osa-register-to-referrals.js --in <Project Register.csv> \
          [--screen <Screen (68).csv>] [--out <dir>] [--type compute] \
          [--promote <tier>] [--partners <file.json>]
     node scripts/osa-register-to-referrals.js --sheet-id <id> [...]
   ═══════════════════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

/* ── partner email domains ───────────────────────────────────────────────────
   The Portfolio Tag is a human label ("IQ GEN; IQ Gen"); partnerOrg is an
   email domain that decides who can sign in and see the deal. Keys are matched
   case-insensitively against the tag's first segment. */
const PARTNERS = {
  'evcs':           'evcs.com',
  'iq gen':         'iqgen.energy',
  'iqgen':          'iqgen.energy',
  'francis energy': 'francisenergy.com',
  'nextnrg':        'nextnrg.com',
  'jetrise':        'jetriseventures.com',
  'clearsky':       'clearsky-usa.com'
};

/* ── tiny CSV reader/writer (RFC 4180) ──────────────────────────────────── */
function parseCsv(text) {
  const rows = []; let row = [], f = '', q = false;
  text = String(text).replace(/\r\n/g, '\n').replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; }
      else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f.length || row.length) { row.push(f); rows.push(row); }
  return rows;
}
function toObjects(rows) {
  const head = rows[0].map(h => String(h).trim());
  return rows.slice(1).map(r => {
    const o = {};
    head.forEach((h, j) => { o[h] = r[j] == null ? '' : String(r[j]).trim(); });
    return o;
  });
}
function esc(v) {
  v = String(v == null ? '' : v);
  return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}

/* ── the register's own prose ─────────────────────────────────────────────
   Cells carry an evidence marker ("[CONFIRMED] 6801 Hollywood Blvd") and the
   unknowns are sentences, not blanks ("UNKNOWN - do not apply the below-1-MW
   floor until ..."). A marker is provenance and is kept in the notes; it is
   not part of an address. A sentence is never a value. */
const MARKER = /^\s*\[(?:CONFIRMED[^\]]*|REPRESENTED[^\]]*|INFERRED|CONFLICT|CONFIRM|UNKNOWN)\]\s*/i;
function plain(v) { return String(v == null ? '' : v).replace(MARKER, '').trim(); }
function markerOf(v) { const m = String(v || '').match(MARKER); return m ? m[0].trim() : ''; }
function known(v) {
  const s = plain(v);
  return (!s || /^(UNKNOWN|NEEDS-INPUT|N\/A|TBD|NONE IDENTIFIED)\b/i.test(s)) ? '' : s;
}
/* A number only when the cell IS a number. Everywhere else the register is
   explaining why it does not know, and a digit inside that explanation
   ("at or below 1 MW") is not a measurement. */
function numeric(v) {
  const s = plain(v).replace(/[,$\s]/g, '').replace(/MW$/i, '');
  return /^[0-9]*\.?[0-9]+$/.test(s) ? s : '';
}
function tag(v) { return String(v || '').split(';')[0].trim(); }
function domainFor(t, map) {
  const k = tag(t).toLowerCase();
  if (map[k]) return map[k];
  for (const key of Object.keys(map)) if (k === key || k.indexOf(key) === 0) return map[key];
  return '';
}
function clip(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

/* ── the one field list, read off the importer ───────────────────────────── */
function templateFields() {
  const src = fs.readFileSync(path.join(ROOT, 'tenants', 'osa', 'ingest-data.js'), 'utf8');
  const win = {
    CLEARSKY_CONFIG: { portfolio: { projectTypes: [] } },
    Portfolio: { num: () => null, typeOf: () => null, normalizeUrl: u => u, stamp: () => 'now' },
    OmegaAccess: { orgName: o => o }
  };
  win.window = win;
  vm.createContext(win);
  vm.runInContext(src, win, { filename: 'ingest-data.js' });
  if (!win.Ingest || !win.Ingest.FIELDS) throw new Error('ingest-data.js did not expose Ingest.FIELDS');
  return { fields: win.Ingest.FIELDS, Ingest: win.Ingest };
}

/* ── the dry run ─────────────────────────────────────────────────────────
   The same buildRows() the browser calls, with the same batch defaults, so a
   refusal or a warning shows up here rather than in front of somebody at the
   import dialog. */
function dryRun(rowsOut, fields, opts) {
  const src = fs.readFileSync(path.join(ROOT, 'tenants', 'osa', 'ingest-data.js'), 'utf8');
  const cfgPath = path.join(ROOT, 'tenants', 'osa', 'config.js');
  const cfgSrc = fs.readFileSync(cfgPath, 'utf8');
  /* config.js reads the hostname to pick a tenant. Any host does here: the only
     thing wanted out of it is the project-type vocabulary. */
  const cfgWin = {
    window: null,
    location: { hostname: 'osa.clearskyomega.com', href: 'https://osa.clearskyomega.com/', search: '' },
    navigator: { userAgent: 'node' },
    document: { documentElement: {}, addEventListener: () => {}, querySelector: () => null }
  };
  cfgWin.window = cfgWin;
  vm.createContext(cfgWin);
  vm.runInContext(cfgSrc, cfgWin, { filename: 'config.js' });
  const TYPES = (((cfgWin.CLEARSKY_CONFIG || {}).portfolio || {}).projectTypes) || [];

  let SS = null;
  try {
    const ssSrc = fs.readFileSync(path.join(ROOT, 'tenants', 'osa', 'site-screen.js'), 'utf8');
    const ssWin = {}; ssWin.window = ssWin;
    vm.createContext(ssWin); vm.runInContext(ssSrc, ssWin, { filename: 'site-screen.js' });
    SS = ssWin.SiteScreen || null;
  } catch (e) { /* the conveniences are optional, as in the browser */ }

  const win = {
    CLEARSKY_CONFIG: { portfolio: { projectTypes: TYPES } },
    Portfolio: {
      num: v => { if (v == null || v === '') return null; const x = Number(String(v).replace(/[,$\s]/g, '')); return isFinite(x) ? x : null; },
      typeOf: k => TYPES.filter(t => t.key === k)[0] || null,
      normalizeUrl: u => u, stamp: () => 'now'
    },
    OmegaAccess: { orgName: o => o },
    SiteScreen: SS
  };
  win.window = win;
  vm.createContext(win);
  vm.runInContext(src, win, { filename: 'ingest-data.js' });
  const IN = win.Ingest;

  const headers = fields.map(f => f.header);
  const sheet = { name: 'dry', rows: [headers].concat(rowsOut.map(r => fields.map(f => r[f.key] || ''))) };
  const tpl = IN.mapFromTemplate(headers);
  if (!tpl) throw new Error('the file this script writes is not recognised as the referral template');
  return IN.buildRows(sheet, tpl.map, {
    headerRow: 0,
    defaultSizeMw: opts.defaultSizeMw,
    defaultProjectType: opts.type,
    existing: []
  });
}

/* ── main ────────────────────────────────────────────────────────────────── */
function arg(name, dflt) {
  const i = process.argv.indexOf('--' + name);
  return i > 0 && process.argv[i + 1] && !/^--/.test(process.argv[i + 1]) ? process.argv[i + 1] : dflt;
}

function fetchTab(sheetId, tabName) {
  const url = 'https://docs.google.com/spreadsheets/d/' + sheetId
            + '/gviz/tq?tqx=out:csv&sheet=' + encodeURIComponent(tabName);
  return execFileSync('curl', ['-sS', '-L', '--max-time', '180', url], { maxBuffer: 1 << 28 }).toString('utf8');
}

function main() {
  const inFile   = arg('in');
  const sheetId  = arg('sheet-id');
  const screenIn = arg('screen');
  const outDir   = arg('out', path.join(ROOT, '.osa-upload'));
  const type     = String(arg('type', 'compute')).toLowerCase();
  const promoteTier = arg('promote', '');
  const defaultSizeMw = Number(arg('default-mw', '1'));
  const partnersFile = arg('partners');

  if (!inFile && !sheetId) {
    console.error('Give it the register: --in "<Project Register.csv>" or --sheet-id <id>.');
    console.error('Run with --help for the full usage.');
    process.exit(2);
  }
  const map = Object.assign({}, PARTNERS);
  if (partnersFile) Object.assign(map, JSON.parse(fs.readFileSync(partnersFile, 'utf8')));

  const regCsv = inFile ? fs.readFileSync(inFile, 'utf8') : fetchTab(sheetId, 'Project Register');
  const reg = toObjects(parseCsv(regCsv));
  if (!reg.length || !('Project ID' in reg[0]))
    throw new Error('that does not look like the Project Register tab (no "Project ID" column)');

  /* The 68 screened sites carry a measured six-month peak. It is the only
     load figure in the workbook, so it rides along where it exists. */
  const peak = {};
  const screenCsv = screenIn ? fs.readFileSync(screenIn, 'utf8')
                  : (sheetId ? fetchTab(sheetId, 'Screen (68)') : '');
  if (screenCsv) {
    toObjects(parseCsv(screenCsv)).forEach(s => {
      const id = s['Project ID'], kw = numeric(s['6-mo peak kW']);
      if (id && kw) peak[id] = kw;
    });
  }

  const { fields } = templateFields();
  const byPartner = {}, orphans = [], unusable = [];
  const stat = { rows: 0, noAddress: 0, promoted: 0, withPeak: 0 };

  reg.forEach((r, i) => {
    const id = r['Project ID'];
    const name = known(r.Site) || plain(r.Site);
    /* A register row with no site name is a provenance note somebody wrote
       into the table, not a lead. Reported rather than skipped: a row that
       vanishes between a sheet of 395 and an upload of 393 is exactly the
       difference nobody can account for six months later. */
    if (!id || !name) {
      unusable.push({ row: i + 2, id: id || '(no id)', why: !id ? 'no Project ID' : 'no site name',
                      tag: tag(r['Portfolio Tag']), source: known(r['Source Provenance']) });
      return;
    }
    stat.rows++;

    const partner = domainFor(r['Portfolio Tag'], map);
    const address = known(r.Address);
    if (!address) stat.noAddress++;

    const notes = [
      known(r['Host Facility']) ? 'Host: ' + known(r['Host Facility']) : '',
      known(r['Principal Use']) ? 'Use: ' + known(r['Principal Use']) : '',
      known(r['Electric Utility']) ? 'Utility: ' + known(r['Electric Utility']) : '',
      markerOf(r.Address) ? 'Address evidence: ' + markerOf(r.Address) : '',
      known(r['Cohort Tier']) ? 'Cohort ' + known(r['Cohort Tier']) : '',
      known(r['Project Gate']) ? 'Gate ' + known(r['Project Gate']) : '',
      clip(known(r['Top Red Flags']), 240),
      'OSA register ' + id
    ].filter(Boolean).join(' · ');

    const row = {
      name: name,
      partnerOrg: partner,
      clientOrgId: '',
      address: address,
      projectType: type,
      siteNotes: notes,
      monthlyBillUsd: '',
      annualKwh: '',
      meters: '',
      loadKw: peak[id] || '',
      sizeMw: numeric(r['Initial MW']),
      channel: 'OSA canonical register',
      referredAt: '',
      ref: id,
      promote: (promoteTier && known(r['Cohort Tier']) === promoteTier) ? 'yes' : ''
    };
    if (row.loadKw) stat.withPeak++;
    if (row.promote) stat.promoted++;

    if (!partner) { orphans.push({ row: row, tag: tag(r['Portfolio Tag']) }); return; }
    (byPartner[partner] = byPartner[partner] || []).push(row);
  });

  fs.mkdirSync(outDir, { recursive: true });
  const header = fields.map(f => esc(f.header)).join(',');
  const write = (file, rows) => {
    const body = rows.map(rw => fields.map(f => esc(rw[f.key] || '')).join(',')).join('\n');
    fs.writeFileSync(path.join(outDir, file), header + '\n' + body + '\n');
  };

  const all = [];
  Object.keys(byPartner).sort().forEach(d => { all.push.apply(all, byPartner[d]); });

  console.log('OSA canonical register → referral upload files');
  console.log('  register rows read      ' + (stat.rows + unusable.length));
  console.log('  leads                   ' + stat.rows
              + (unusable.length ? '  (' + unusable.length + ' row(s) are not a lead — listed below)' : ''));
  console.log('  attributable            ' + all.length);
  console.log('  needs attribution       ' + orphans.length);
  console.log('  no usable address       ' + stat.noAddress);
  console.log('  carrying a measured kW  ' + stat.withPeak);
  console.log('  marked promote          ' + stat.promoted
              + (promoteTier ? ' (cohort ' + promoteTier + ')' : ' (nothing promoted — pass --promote <tier>)'));
  unusable.forEach(u => console.log('    not a lead  sheet row ' + u.row + '  ' + u.id
                                    + ' (' + u.why + ', tag ' + (u.tag || '—') + ')'));
  console.log('');

  /* buildRows returns the rows as an array with `defaulted` hung off it. */
  const report = dryRun(all, fields, { defaultSizeMw: defaultSizeMw, type: type });
  const refused = report.filter(r => !r.ok);
  const warned = report.filter(r => r.ok && r.warnings && r.warnings.length);
  console.log('dry run through the real importer (buildRows)');
  console.log('  would land              ' + (report.length - refused.length));
  console.log('  would be refused        ' + refused.length);
  console.log('  with a warning          ' + warned.length);
  if (report.defaulted) {
    console.log('  given the batch size    ' + (report.defaulted.sizeMw || 0) + ' MW-default rows');
    console.log('  given the batch type    ' + (report.defaulted.projectType || 0));
    console.log('  project type aliased    ' + (report.defaulted.aliased || 0));
  }
  refused.slice(0, 8).forEach(r => console.log('    REFUSED  ' + r.values.name + ' — ' + r.problems.join(' ')));
  const seen = {};
  warned.forEach(r => r.warnings.forEach(w => { seen[w] = (seen[w] || 0) + 1; }));
  Object.keys(seen).slice(0, 8).forEach(w => console.log('    warn ×' + seen[w] + '  ' + w));
  if (refused.length) {
    console.error('\nRefused rows are in the files. Fix them in the workbook and re-run; '
                + 'the importer refuses them again at the dialog, so nothing lands half-done.');
  }

  console.log('\nwritten to ' + outDir);
  Object.keys(byPartner).sort().forEach(d => {
    const file = 'osa-' + d.replace(/[^a-z0-9]+/gi, '-') + '.csv';
    write(file, byPartner[d]);
    console.log('  ' + String(byPartner[d].length).padStart(4) + '  ' + file);
  });
  write('osa-all-partners.csv', all);
  console.log('  ' + String(all.length).padStart(4) + '  osa-all-partners.csv');
  if (orphans.length) {
    write('needs-attribution.csv', orphans.map(o => o.row));
    fs.writeFileSync(path.join(outDir, 'needs-attribution.txt'),
      orphans.map(o => o.tag + '  →  ' + o.row.name + '  (' + o.row.ref + ')').join('\n') + '\n');
    console.log('  ' + String(orphans.length).padStart(4) + '  needs-attribution.csv'
              + '  ← no verified email domain for the Portfolio Tag; fill the column in before uploading');
  }
}

if (require.main === module) {
  if (process.argv.indexOf('--help') > 0) {
    console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0]);
    process.exit(0);
  }
  try { main(); }
  catch (e) { console.error('failed: ' + e.message); process.exit(1); }
}

module.exports = { parseCsv, toObjects, plain, known, numeric, domainFor, PARTNERS };
