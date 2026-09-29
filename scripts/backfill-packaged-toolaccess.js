#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   scripts/backfill-packaged-toolaccess.js — give packaged workspaces the
   tools the module catalog added to modules they ALREADY hold.

     node scripts/backfill-packaged-toolaccess.js                  # dry run, every workspace
     node scripts/backfill-packaged-toolaccess.js --org acme.com   # dry run, one workspace
     node scripts/backfill-packaged-toolaccess.js --apply          # write

   WHY. A packaged workspace's `billing/current.toolAccess` is a COPY of
   `api/_lib/modules.js resolve(modules).toolAccess`, saved when the plan
   is approved or activated and rewritten by the billing engine only when
   it reconciles an invoice (package-billing.accessAfterInvoices). A trial
   has no invoice until it ends, and nothing re-saves the copy when a module
   gains a tool. The API does not read the copy (package-access.project()
   resolves modules[] on every call), but firestore.rules does:
   `packageWrite(org, tool)` requires `tool in billing/current.toolAccess`,
   so the browser's `toolData/{org}/tools/{tool}` save is refused for a tool
   the server itself runs. First seen with `vppsim` joining Omega Design
   (lite) on 2026-09-29: the VPP Earnings Simulator answered and its Save
   was permission-denied on every package provisioned before that deploy.

   WHAT IT DOES, per omega_orgs/{org}/billing/current:
     - only a `packaged: true` record in a live state — trial, paid or
       past_due_lite — is considered; a legacy plan's toolAccess is a
       staff-set allowlist (Clean Cell's two-tool product) and is never
       touched, and awaiting_payment / unpaid are rewritten by the engine
       from the modules the moment they are paid;
     - the tools are re-derived with modules.resolve(): the record's
       modules[], or Omega Design alone for past_due_lite (the engine's own
       rule, package-billing.accessAfterInvoices);
     - tools are only ADDED, in catalog order after what is stored; a stored
       tool the catalog no longer names is kept (the engine's next paid
       reconcile is the one writer that narrows a grant);
     - it writes `toolAccess` and nothing else on the record, plus one
       omega_orgs/{org}/admin_audit row per workspace changed with what it
       was and what it became, in the billing engine's audit shape; inside a
       transaction that re-reads the record, so a record the engine moved
       since the dry run is judged again;
     - it never deletes. A record whose modules[] no longer resolve is
       reported for a person and left alone.
   Run it (dry run first, then --apply) with any deploy that adds a tool to
   a module; scripts/tests/tpackagedtoolaccess.js fails until the catalog
   it last saw is updated, which is the reminder. */
'use strict';
var path = require('path'), ROOT = path.join(__dirname, '..');
var M = require(path.join(ROOT, 'api/_lib/modules'));

var BY = 'scripts/backfill-packaged-toolaccess.js';
var LIVE_STATES = ['trial', 'paid', 'past_due_lite'];
var ORG_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;

/* Pure: what one billing record should gain. */
function plan(billing) {
  if (!billing) return { action: 'skip', why: 'no billing record' };
  if (billing.packaged !== true) return { action: 'skip', why: 'not packaged (a legacy allowlist is staff-set)' };
  var state = billing.packagingState;
  if (LIVE_STATES.indexOf(state) < 0) return { action: 'skip', why: 'not live (' + (state || 'no state') + '); the engine writes grants when it is paid' };
  var keys = state === 'past_due_lite' ? ['lite'] : billing.modules, grants;
  try { grants = M.resolve(keys); } catch (e) { return { action: 'review', state: state, why: 'modules do not resolve (' + e.message + '); a person decides' }; }
  var was = Array.isArray(billing.toolAccess) ? billing.toolAccess.slice() : null, have = was || [], add = [];
  grants.toolAccess.forEach(function (t) { if (have.indexOf(t) < 0 && add.indexOf(t) < 0) add.push(t); });
  if (!add.length) return { action: 'none', state: state, modules: grants.modules, was: was };
  return { action: 'add', state: state, modules: grants.modules, was: was, add: add, toolAccess: have.concat(add) };
}

function auditRow(org, p, now) {
  return { at: now, by: BY, action: 'package-toolaccess-backfill', orgId: org,
    reason: 'The module catalog added tools to modules this workspace holds; firestore.rules packageWrite reads the stored toolAccess.',
    packagingState: p.state, modules: p.modules,
    was: { toolAccess: p.was }, changed: { toolAccess: p.toolAccess, added: p.add } };
}

async function listOrgs(db) {
  var ids = [], last = null;
  for (;;) {
    var q = db.collection('omega_orgs').orderBy('__name__').limit(300);
    if (last) q = q.startAfter(last);
    var page = await q.select().get();
    page.docs.forEach(function (d) { ids.push(d.id); });
    if (page.docs.length < 300) return ids;
    last = page.docs[page.docs.length - 1].id;
  }
}

/* One pass. opts: { apply, org, now, log }. Returns the per-org report. */
async function run(db, opts) {
  opts = opts || {};
  var apply = opts.apply === true, now = opts.now == null ? Date.now() : opts.now, log = opts.log || console.log;
  var orgs = opts.org ? [opts.org] : await listOrgs(db), report = [];
  for (var i = 0; i < orgs.length; i++) {
    var org = orgs[i], root = db.collection('omega_orgs').doc(org), cur = root.collection('billing').doc('current'), p;
    if (!apply) {
      var snap = await cur.get();
      p = plan(snap.exists ? snap.data() : null);
    } else {
      p = await db.runTransaction(async function (tx) {
        var fresh = await tx.get(cur), out = plan(fresh.exists ? fresh.data() : null);
        if (out.action === 'add') {
          tx.update(cur, { toolAccess: out.toolAccess });
          tx.create(root.collection('admin_audit').doc(), auditRow(org, out, now));
        }
        return out;
      });
    }
    report.push(Object.assign({ orgId: org }, p));
  }
  var counts = {};
  report.forEach(function (r) { counts[r.action] = (counts[r.action] || 0) + 1; });
  log((apply ? 'APPLIED' : 'DRY RUN') + ' · ' + report.length + ' workspace' + (report.length === 1 ? '' : 's') + ' read');
  report.forEach(function (r) {
    var what = r.action === 'add' ? (apply ? 'added ' : 'would add ') + r.add.join(', ')
      : r.action === 'none' ? 'up to date' : r.action === 'review' ? 'REVIEW: ' + r.why : 'skip: ' + r.why;
    log('  ' + r.orgId + '  ' + (r.state || '-') + (r.modules ? '  [' + r.modules.join(' ') + ']' : '') + '  ' + what);
  });
  log('  ' + Object.keys(counts).sort().map(function (k) { return k + ' ' + counts[k]; }).join(' · ') + (apply ? '' : '  (nothing written; --apply to write)'));
  return report;
}

function parseArgs(argv) {
  var out = { apply: false, org: null };
  for (var i = 0; i < argv.length; i++) {
    if (argv[i] === '--apply') out.apply = true;
    else if (argv[i] === '--org') out.org = String(argv[++i] || '').toLowerCase();
    else throw new Error('unknown argument: ' + argv[i]);
  }
  if (out.org !== null && !ORG_RE.test(out.org)) throw new Error('--org needs an orgId (the email domain)');
  return out;
}

module.exports = { plan: plan, run: run, parseArgs: parseArgs, auditRow: auditRow, LIVE_STATES: LIVE_STATES };

if (require.main === module) {
  var args;
  try { args = parseArgs(process.argv.slice(2)); }
  catch (e) { console.error(e.message + '\nusage: node scripts/backfill-packaged-toolaccess.js [--org <orgId>] [--apply]'); process.exit(2); }
  var A = require(path.join(ROOT, 'api/_lib/admin'));
  require('./_lib/live-admin')(A);
  run(A.db(), args).then(function (report) {
    if (report.some(function (r) { return r.action === 'review'; })) console.log('  Some workspaces need a person: see REVIEW above.');
  }).catch(function (e) { console.error(e); process.exit(1); });
}
