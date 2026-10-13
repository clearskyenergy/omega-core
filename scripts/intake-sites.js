#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   scripts/intake-sites.js — sites from the paperwork into a workspace's
   Asset CRM (Portfolio), through the SAME endpoint code the page uses
   (api/site-crm.js): the site's facts, its contacts, the activity log with
   its follow-ups, and the agreements as documents on Files.
     node scripts/intake-sites.js --org nextnrg.com --file sites.json
     node scripts/intake-sites.js --org nextnrg.com --file sites.json --apply
   DRY RUN BY DEFAULT on the in-memory Firestore double: every step is
   validated and printed, nothing real is touched. --apply runs the same
   steps on the live project. Credentials for --apply, as intake-order.js:
   FIREBASE_SERVICE_ACCOUNT, else the Firebase CLI's signed-in account
   (`firebase login`, or `firebase login --reauth` when its token lapsed).
   IDEMPOTENT: a site is found by its externalSiteIds (any key the file
   gives, e.g. docusign or termsheet) and updated, never duplicated; a
   contact with the same email is kept; an activity with the same subject is
   not logged twice; a document already on the site (same bytes and name) is
   reported, not stored again. Every write is audited by the endpoint.
   The sites file is NOT in the repo: it carries a customer's agreements.
   docs/site-intake-template.json is the shape. Who is recorded on every
   write is the ClearSky owner; the file is the record of who asked. */
'use strict';
var fs = require('fs'), path = require('path'), crypto = require('crypto');
var ROOT = path.join(__dirname, '..');
var args = process.argv.slice(2), APPLY = args.indexOf('--apply') >= 0;
var fileArg = args[args.indexOf('--file') + 1], orgArg = args[args.indexOf('--org') + 1];
if (args.indexOf('--file') < 0 || !fileArg || args.indexOf('--org') < 0 || !orgArg) { console.error('usage: node scripts/intake-sites.js --org <domain> --file sites.json [--apply]'); process.exit(2); }
var FILE = JSON.parse(fs.readFileSync(fileArg, 'utf8')), org = String(orgArg).toLowerCase();
if (FILE.org && String(FILE.org).toLowerCase() !== org) { console.error('the file is for ' + FILE.org + ', not ' + org); process.exit(2); }
var OWNER = { email: 'tom@clearsky-usa.com', uid: 'tom', orgId: 'clearsky-usa.com', staff: true, claims: { email_verified: true } };
var REPORT = fileArg.replace(/\.json$/, '') + (APPLY ? '.applied' : '.dryrun') + '.json';

var adminPath = require.resolve(path.join(ROOT, 'api/_lib/admin')), A;
function mock(p, exports) { require.cache[require.resolve(p)] = { id: require.resolve(p), filename: require.resolve(p), loaded: true, exports: exports }; }
var store = {};
if (!APPLY) {
  var DB = require('./_lib/firestore-double').DB, db = new DB();
  A = { httpError: function (s, m) { var e = new Error(m); e.status = s; return e; }, handler: function (f) { return f; }, db: function () { return db; },
    safeOrg: function (v) { return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(v || '') ? v : ''; }, authenticate: async function (req) { return req.caller || OWNER; },
    canActInOrg: async function (c, o) { return c.staff || c.orgId === o; }, isDegraded: function () { return false; },
    init: function () { throw new Error('the Admin SDK must not be reached in a dry run'); },
    FieldValue: function () { return { serverTimestamp: function () { return new Date().toISOString(); } }; } };
  mock(adminPath, A);
  db.seed('omega_orgs/' + org, { name: org, status: 'active' });
  var I = require(path.join(ROOT, 'api/_lib/po-intake'));
  I.bucket = function () { return { file: function (p) { return { save: async function (bytes) { store[p] = bytes.length; }, download: async function () { throw new Error('dry run'); } }; } }; };
} else {
  A = require(adminPath);
  require('./_lib/live-admin')(A);
  A.authenticate = async function (req) { return req.caller || OWNER; };
}
var siteCrm = require(path.join(ROOT, 'api/site-crm'));
function call(body, query) {
  return new Promise(function (resolve, reject) {
    /* the real A.handler answers through res; the double's handler returns the value */
    var res = { setHeader: function () {}, headersSent: false, status: function (c) { this.code = c; return this; },
      json: function (o) { this.headersSent = true; (this.code >= 400 ? reject : resolve)(this.code >= 400 ? Object.assign(new Error(o.error || 'error'), { status: this.code }) : o); },
      end: function () { resolve(null); } };
    Promise.resolve().then(function () { return siteCrm({ method: body ? 'POST' : 'GET', body: body ? Object.assign({ org: org }, body) : undefined, query: query ? Object.assign({ org: org }, query) : { org: org }, headers: {}, caller: OWNER }, res); })
      .then(function (out) { if (out !== undefined) resolve(out); }).catch(reject);
  });
}
var report = { org: org, mode: APPLY ? 'applied' : 'dry-run', at: new Date().toISOString(), sites: [] };
function log(s) { console.log('  ' + s); }

(async function () {
  console.log((APPLY ? 'APPLYING' : 'DRY RUN') + ' · ' + org + ' · ' + FILE.sites.length + ' site(s)');
  var register = (await call(null, {})).sites || [];
  for (var i = 0; i < FILE.sites.length; i++) {
    var S = FILE.sites[i], ext = S.site.externalSiteIds || {}, out = { name: S.site.name, steps: [] };
    console.log('\n' + S.site.name);
    /* 1. the site, found by any external id it carries */
    var found = register.filter(function (r) { return Object.keys(ext).some(function (k) { return r.externalSiteIds && r.externalSiteIds[k] === ext[k]; }); })[0];
    var saved = await call(Object.assign({ action: 'site-save' }, found ? { id: found.id } : {}, S.site));
    var sid = saved.id; out.id = sid; out.steps.push({ step: 'site', created: !found }); log((found ? 'updated' : 'added') + ' site ' + sid);
    /* 2. contacts, by email */
    var page = await call(null, { site: sid });
    for (var c = 0; c < (S.contacts || []).length; c++) {
      var ct = S.contacts[c], have = (page.contacts || []).filter(function (x) { return ct.email && String(x.email || '').toLowerCase() === String(ct.email).toLowerCase(); })[0];
      if (have) { log('contact kept: ' + ct.name); out.steps.push({ step: 'contact', name: ct.name, kept: true }); continue; }
      await call(Object.assign({ action: 'contact-save', site: sid }, ct)); log('contact added: ' + ct.name); out.steps.push({ step: 'contact', name: ct.name });
    }
    /* 3. the log and its follow-ups, by subject */
    page = await call(null, { site: sid });
    for (var a = 0; a < (S.activity || []).length; a++) {
      var ac = S.activity[a], dup = (page.activity || []).filter(function (x) { return x.subject === ac.subject; })[0];
      if (dup) { log('logged already: ' + ac.subject); out.steps.push({ step: 'activity', subject: ac.subject, kept: true }); continue; }
      await call(Object.assign({ action: 'log', site: sid }, ac)); log('logged: ' + ac.subject + (ac.followUpAt ? ' (follow up ' + ac.followUpAt + ')' : '')); out.steps.push({ step: 'activity', subject: ac.subject });
    }
    /* 4. the documents: bytes from disk, deduplicated by the endpoint */
    for (var f = 0; f < (S.files || []).length; f++) {
      var fl = S.files[f], bytes = fs.readFileSync(fl.path), name = fl.name || path.basename(fl.path);
      var up = await call({ action: 'file-upload', site: sid, file: { name: name, base64: bytes.toString('base64') }, category: fl.category || 'agreement', note: fl.note || '', shared: false });
      log((up.duplicate ? 'document already on the site: ' : 'document stored: ') + name + ' (' + Math.round(bytes.length / 1024) + ' KB, sha256 ' + crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 12) + ')');
      out.steps.push({ step: 'file', name: name, duplicate: !!up.duplicate, id: up.id });
    }
    report.sites.push(out);
  }
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  console.log('\n' + (APPLY ? 'Applied.' : 'Dry run complete; nothing written.') + ' Report: ' + REPORT);
  process.exit(0);
})().catch(function (e) { console.error('\nSTOPPED: ' + (e.status ? e.status + ' ' : '') + e.message); fs.writeFileSync(REPORT, JSON.stringify(Object.assign(report, { error: e.message }), null, 2)); process.exit(1); });
