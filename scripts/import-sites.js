#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   scripts/import-sites.js — a site sheet into a workspace's register, by a
   staff member, through the REAL door
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   The register page's own import (portfolio.html → POST /api/site-crm
   site-import), run from a terminal: for a sheet too large to click through,
   or to correct sites already imported before the page that can do it is
   deployed. Nothing here is a second copy of a rule:
     · the columns are read by the page's OWN field list and header matcher,
       cut out of portfolio.html between its imTemplate markers
     · the CSV is read by api/_lib/portfolio/csv.js
     · the write is api/site-crm.js's own site-import: every row validated
       before anything is written, a row whose External ID names a site
       already there UPDATES it (the cells that carry something; the word
       "clear" empties a fact), every write audited as sitecrm-import

   node scripts/import-sites.js --org <orgId> --file <sheet.csv>
       DRY RUN. Reads the live register (read only) and prints which rows
       would update which sites, which would create one, and what would be
       refused. Writes nothing.
   node scripts/import-sites.js --org <orgId> --file <sheet.csv> --apply --confirm-org <orgId>
       Writes, as FIREBASE_SERVICE_ACCOUNT when it is set, else the Firebase
       CLI's signed-in account (scripts/_lib/live-admin.js). REFUSES unless
       --confirm-org repeats --org and omega_orgs/{org} exists. --partner
       "<name>" stands on every row that names none (the dialog's field).
       --backup <file.json> keeps what each updated site held before.
   It never creates a workspace, a member or a billing record, and never
   deletes a site.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var fs = require('fs'), path = require('path'), os = require('os');
var ROOT = path.join(__dirname, '..');
function arg(n) { var i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : null; }
var APPLY = process.argv.indexOf('--apply') >= 0, ORG = String(arg('--org') || '').trim().toLowerCase(), CONFIRM = arg('--confirm-org'), FILE = arg('--file'), PARTNER = arg('--partner'), BACKUP = arg('--backup');
function refuse(code, m) { var e = new Error(m); e.exitCode = code; return e; }

/* the page's own field list and header matcher */
function pageFields() {
  var src = fs.readFileSync(path.join(ROOT, 'portfolio.html'), 'utf8'), m = /\/\* ▶ imTemplate \*\/([\s\S]*?)\/\* ◀ imTemplate \*\//.exec(src);
  if (!m) throw refuse(2, 'portfolio.html no longer carries the imTemplate markers');
  return Function(m[1] + '; return { IMFIELDS: IMFIELDS, imAutoMap: imAutoMap };')();
}
/* the sheet → site-save-shaped rows, as the page's imBuildRows builds them */
function rowsOf(file, partner) {
  var CSV = require(path.join(ROOT, 'api/_lib/portfolio/csv')), P = pageFields();
  var parsed = CSV.parse(fs.readFileSync(file, 'utf8')), data = parsed.rows || parsed;
  if (!Array.isArray(data) || data.length < 2) throw refuse(2, 'No data rows found. The first row must be headers.');
  var head = data[0].map(function (h) { return String(h == null ? '' : h).trim(); }), map = head.map(P.imAutoMap), unmapped = head.filter(function (h, i) { return h && !map[i]; });
  if (map.indexOf('name') < 0) throw refuse(2, 'No column maps to Site name.');
  var rows = [];
  for (var i = 1; i < data.length; i++) {
    var r = data[i], obj = {}, ext = '', empty = true;
    for (var c = 0; c < head.length; c++) {
      var key = map[c]; if (!key) continue;
      var v = String(r[c] == null ? '' : r[c]).trim(); if (v !== '') empty = false;
      if (key === 'externalId') { ext = v; continue; }
      if (key === 'meterOwned') obj[key] = /^(y|yes|true|1|owned)$/i.test(v) ? true : (/^(n|no|false|0)$/i.test(v) ? false : null); else obj[key] = v;
    }
    if (empty) continue;
    if (partner && !obj.portfolioPartner) obj.portfolioPartner = String(partner).slice(0, 80);
    if (ext) obj.externalSiteIds = { import: ext };
    rows.push(obj);
  }
  return { rows: rows, head: head, map: map, unmapped: unmapped };
}
function cliEmail() {
  try { var st = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config/configstore/firebase-tools.json'), 'utf8')); return (st.user && st.user.email) || (st.activeAccounts && st.activeAccounts[0] && st.activeAccounts[0].user && st.activeAccounts[0].user.email) || null; } catch (e) { return null; }
}

(async function () {
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(ORG)) throw refuse(2, 'Which workspace? --org <orgId>');
  if (!FILE || !fs.existsSync(FILE)) throw refuse(2, 'Which sheet? --file <sheet.csv>');
  var sheet = rowsOf(FILE, PARTNER);
  console.log('Sheet: ' + sheet.rows.length + ' rows · columns → ' + sheet.head.map(function (h, i) { return h + (sheet.map[i] ? '' : ' (skipped)'); }).join(', '));
  if (sheet.rows.length > 500) throw refuse(2, 'At most 500 rows an import; split the sheet.');

  var A = require(path.join(ROOT, 'api/_lib/admin'));
  require('./_lib/live-admin')(A);
  var db = A.db(), root = db.collection('omega_orgs').doc(ORG), orgDoc = await root.get();
  if (!orgDoc.exists) throw refuse(2, 'omega_orgs/' + ORG + ' does not exist. Nothing was written.');
  console.log('Workspace: ' + ((orgDoc.data() || {}).name || ORG) + ' (' + ORG + ')');

  /* what the door will do, read only: the match is the sheet's own ID */
  var have = await root.collection('sites').limit(2000).get(), byId = {}, total = 0;
  have.docs.forEach(function (d) { total++; var v = d.data() || {}, k = v.externalSiteIds && v.externalSiteIds.import; if (k && !byId[k]) byId[k] = d; });
  var updates = [], creates = [], kept = [], dup = {}, dups = [], before = {};
  sheet.rows.forEach(function (r, i) {
    var k = r.externalSiteIds && r.externalSiteIds.import;
    if (k) { if (dup[k] != null) dups.push('row ' + (i + 2) + ' repeats External ID ' + k); dup[k] = i; }
    var hit = k ? byId[k] : null;
    if (!hit) { creates.push((k ? k + ' ' : '') + r.name); return; }
    var cur = hit.data() || {};
    if (cur.facts && typeof cur.facts === 'object') { kept.push(k + ' ' + (cur.name || '')); return; }
    var ch = [];
    Object.keys(r).forEach(function (f) {
      if (f === 'externalSiteIds' || f === 'name' && String(cur.name || '') === String(r.name)) return;
      var v = r[f]; if (v === '' || v == null) return;
      var clear = typeof v === 'string' && /^\(?clear\)?$/i.test(v.trim()), was = cur[f] == null ? null : cur[f];
      if (clear ? was != null : String(was == null ? '' : was) !== String(v)) ch.push(f + ': ' + (was == null ? '—' : was) + ' → ' + (clear ? '(cleared)' : v));
    });
    before[hit.id] = { name: cur.name || null, externalId: k, serviceCapacityKw: cur.serviceCapacityKw == null ? null : cur.serviceCapacityKw, transformerKva: cur.transformerKva == null ? null : cur.transformerKva, portfolioPartner: cur.portfolioPartner || null,
      termYearsRemaining: cur.termYearsRemaining == null ? null : cur.termYearsRemaining, existingPeakKw: cur.existingPeakKw == null ? null : cur.existingPeakKw, status: cur.status || null, city: cur.city || null, state: cur.state || null, address: cur.address || null };
    updates.push({ id: hit.id, key: k, name: cur.name || r.name, changes: ch });
  });
  console.log('Register: ' + total + ' sites on file.');
  console.log('Would UPDATE ' + updates.length + ' site(s) by their External ID' + (updates.length ? ', ' + updates.filter(function (u) { return u.changes.length; }).length + ' with a change:' : '.'));
  updates.slice(0, 6).forEach(function (u) { console.log('  ' + u.key + '  ' + u.name + '  ·  ' + (u.changes.join('; ') || 'no change')); });
  if (updates.length > 6) console.log('  … and ' + (updates.length - 6) + ' more');
  console.log('Would CREATE ' + creates.length + ' new site(s)' + (creates.length ? ': ' + creates.slice(0, 8).join(', ') + (creates.length > 8 ? ' …' : '') : '.'));
  if (kept.length) console.log('REFUSED (kept by the workbook import): ' + kept.join(', '));
  if (dups.length) console.log('REFUSED: ' + dups.join('; '));
  if (BACKUP) { fs.writeFileSync(BACKUP, JSON.stringify({ org: ORG, at: new Date().toISOString(), sites: before }, null, 1)); console.log('What each matched site holds now is kept in ' + BACKUP); }

  if (!APPLY) { console.log('\nDRY RUN: nothing was written. Re-run with --apply --confirm-org ' + ORG + ' to write.'); return; }
  if (CONFIRM !== ORG) throw refuse(2, 'Refusing: --confirm-org must repeat --org (' + ORG + ').');
  if (kept.length || dups.length) throw refuse(2, 'Refusing: fix the refused rows first. Nothing was written.');
  var by = arg('--by') || cliEmail();
  if (!by) throw refuse(2, 'Who is writing? --by <email>');
  A.authenticate = async function () { return { uid: 'script:import-sites', email: by, orgId: 'clearsky-usa.com', staff: true, claims: { email_verified: true } }; };
  A.canActInOrg = async function (c) { return c.staff === true; };
  var siteCrm = require(path.join(ROOT, 'api/site-crm'));
  var out = await new Promise(function (resolve, reject) {
    var res = { headersSent: false, setHeader: function () {}, status: function (n) { res.code = n; return res; }, json: function (b) { resolve(b); return res; }, end: function (b) { resolve(b); } };
    Promise.resolve(siteCrm({ method: 'POST', headers: {}, query: {}, body: { org: ORG, action: 'site-import', rows: sheet.rows } }, res)).then(function (b) { if (b !== undefined) resolve(b); }, reject);
  });
  if (!out || out.ok !== true) { console.log('NOTHING WAS WRITTEN: ' + JSON.stringify(out && (out.errors || out.error || out.message || out)).slice(0, 1200)); process.exitCode = 1; return; }
  console.log('\nWRITTEN as ' + by + ': ' + out.note);
})().catch(function (e) { console.error(e.exitCode ? e.message : e); process.exit(e.exitCode || 1); });
