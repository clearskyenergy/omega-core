#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   scripts/import-evcs-sites.js — one-shot, idempotent import of the 292
   EVCS sites into omega_orgs/{org}/sites, keyed on externalSiteIds.evcs.

     node scripts/import-evcs-sites.js --org evcs.com                        # dry run
     node scripts/import-evcs-sites.js --org evcs.com --apply                # write
     node scripts/import-evcs-sites.js --org evcs.com --apply --source <path>

   Field mapping (spec Appendix A):
   - id            -> externalSiteIds.evcs (stable string ID; the idempotency key)
   - name/city/state -> as-is
   - installed     -> installedKw: charger NAMEPLATE kW, never approved capacity
   - peak          -> reportedPeakKw + peakUnresolved: true. The workbook's
                      header and footer disagree on what this field means, so
                      it is stored flagged, never relabeled as capacity.
   - meter         -> meterOwned: true | false | null. A blank stays null
                      (unknown); it is NEVER coerced to false.
   - term          -> termYearsRemaining: a snapshot of years remaining, not
                      an expiry date. A blank stays null; 0 is a real value.
   - screen/pods   -> screening: a labeled legacy scenario
                      "EVCS legacy proxy v1", not verified capacity.
   - share         -> commercial.revenueShare: whole percent in the source
                      (6) stored as a fraction (0.06). A blank stays null.
   - kwhshare      -> commercial.kwhShare: already fractional, stored as-is.
   - rent          -> commercial.rentMonthly, as-is (usually null).

   Idempotent: rows whose externalSiteIds.evcs already exists are skipped,
   never updated. Every applied write is recorded in omega_audit
   (action sitecrm-import). The source workbooks stay out of the repo;
   this script reads them from disk and commits no customer data.

   ORG SCOPING: the 292 EVCS rows belong to the EVCS workspace ONLY.
   The script refuses any --org other than evcs.com unless
   --allow-other-org is passed explicitly. Other workspaces start empty
   and import their own sites through the Portfolio UI. */

'use strict';
var fs = require('fs'), path = require('path'), ROOT = path.join(__dirname, '..');
var A = require(path.join(ROOT, 'api/_lib/admin'));

function numOrNull(v) {
  if (v === undefined || v === null || v === '') return null;
  var n = Number(v);
  return isFinite(n) ? n : null;
}
/* Meter ownership: true | false stay; anything else (blank, null, other)
   is unknown — never coerced to false. */
function meterOrNull(v) {
  if (v === true || v === 'true' || v === 1 || v === '1') return true;
  if (v === false || v === 'false' || v === 0 || v === '0') return false;
  return null;
}

function mapRow(r) {
  var peak = numOrNull(r.peak);
  var meter = meterOrNull(r.meter);
  var share = numOrNull(r.share);
  return {
    docId: 'evcs-' + String(r.id),
    externalSiteIds: { evcs: String(r.id) },
    name: String(r.name || '').slice(0, 200),
    city: String(r.city || '').slice(0, 120),
    state: String(r.state || '').slice(0, 10),
    installedKw: numOrNull(r.installed),
    reportedPeakKw: peak,
    peakUnresolved: peak != null,
    peakDefinition: peak != null
      ? 'Workbook header/footer disagree on this field\u2019s meaning; stored as reported, not as approved capacity.'
      : null,
    meterOwned: meter,
    termYearsRemaining: numOrNull(r.term),
    screening: {
      label: 'EVCS legacy proxy v1',
      screenKw: numOrNull(r.screen),
      pods: numOrNull(r.pods),
      reserveKw: numOrNull(r.reserve),
      note: 'Legacy screening proxy from the EVCS workbook (pod 75 kW IT, PUE 1.2). Not verified capacity.'
    },
    commercial: {
      rentMonthly: numOrNull(r.rent),
      revenueShare: share == null ? null : share / 100,
      kwhShare: numOrNull(r.kwhshare)
    },
    source: 'EVCS_investor_work/data.json',
    flags: {
      meterUnknown: meter == null,
      peakExceedsInstalled: peak != null && numOrNull(r.installed) != null && peak > Number(r.installed),
      termMissing: numOrNull(r.term) == null
    }
  };
}

if (require.main === module) {
require('./_lib/live-admin')(A);
var args = process.argv.slice(2), APPLY = args.indexOf('--apply') >= 0;
var org = String(args[args.indexOf('--org') + 1] || '').toLowerCase();
var srcIdx = args.indexOf('--source');
var SOURCE = srcIdx >= 0 ? args[srcIdx + 1]
  : '/Users/tommyg/Downloads/EVCS_investor_work/data.json';
if (args.indexOf('--org') < 0 || !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(org)) {
  console.error('usage: node scripts/import-evcs-sites.js --org <orgId> [--apply] [--source <path>] [--allow-other-org]');
  process.exit(2);
}
var seedCheck = checkSeedOrg(org, args);
if (seedCheck && seedCheck.indexOf('WARNING') !== 0) { console.error(seedCheck); process.exit(2); }
if (seedCheck) console.log(seedCheck);
(async function () {
  var raw = JSON.parse(fs.readFileSync(SOURCE, 'utf8'));
  var rows = Array.isArray(raw) ? raw : raw.rows;
  if (!Array.isArray(rows)) { console.error('No rows in ' + SOURCE); process.exit(2); }
  var mapped = rows.map(mapRow);

  var db = A.db(), col = db.collection('omega_orgs').doc(org).collection('sites');
  var existing = await col.select().get();
  var have = {};
  existing.docs.forEach(function (d) {
    var ids = (d.data() || {}).externalSiteIds || {};
    if (ids.evcs) have[String(ids.evcs)] = true;
  });

  var fresh = mapped.filter(function (m) { return !have[m.externalSiteIds.evcs]; });
  var skipped = mapped.length - fresh.length;

  /* Trap report: the import never hides these. */
  var traps = {
    meterUnknown: mapped.filter(function (m) { return m.flags.meterUnknown; }).length,
    peakExceedsInstalled: mapped.filter(function (m) { return m.flags.peakExceedsInstalled; }).length,
    peakMissing: mapped.filter(function (m) { return m.reportedPeakKw == null; }).length,
    termMissing: mapped.filter(function (m) { return m.flags.termMissing; }).length
  };
  var pods = mapped.reduce(function (s, m) { return s + (m.screening.pods || 0); }, 0);

  console.log((APPLY ? 'APPLYING' : 'DRY RUN') + ' · ' + org + ' · source ' + SOURCE);
  console.log('  rows: ' + mapped.length + ' · to write: ' + fresh.length + ' · already present (skipped): ' + skipped);
  console.log('  traps: meter unknown ' + traps.meterUnknown + ' · peak missing ' + traps.peakMissing +
    ' · peak > installed ' + traps.peakExceedsInstalled + ' · term missing ' + traps.termMissing);
  console.log('  screening pods (legacy proxy, unverified): ' + pods);
  fresh.slice(0, 3).forEach(function (m) {
    console.log('  e.g. ' + m.docId + ' ' + m.name + ' · installed ' + m.installedKw + ' kW · peak ' +
      (m.reportedPeakKw == null ? 'not provided' : m.reportedPeakKw + ' kW (unresolved)') +
      ' · meter ' + (m.meterOwned == null ? 'unknown' : m.meterOwned) +
      ' · term ' + (m.termYearsRemaining == null ? 'not provided' : m.termYearsRemaining + 'y') +
      ' · pods ' + m.screening.pods);
  });
  if (!APPLY || !fresh.length) return;

  /* Two writes per site (site + audit); commit well under the 500-write cap. */
  var now = new Date().toISOString(), batch = db.batch(), n = 0;
  async function flush() { await batch.commit(); batch = db.batch(); n = 0; }
  for (var i = 0; i < fresh.length; i++) {
    var m = fresh[i], ref = col.doc(m.docId);
    batch.create(ref, {
      orgId: org,
      name: m.name, city: m.city, state: m.state,
      installedKw: m.installedKw,
      reportedPeakKw: m.reportedPeakKw, peakUnresolved: m.peakUnresolved, peakDefinition: m.peakDefinition,
      meterOwned: m.meterOwned,
      termYearsRemaining: m.termYearsRemaining,
      screening: m.screening,
      commercial: m.commercial,
      externalSiteIds: m.externalSiteIds,
      flags: m.flags,
      archived: false,
      createdAt: now, createdBy: 'scripts/import-evcs-sites.js',
      source: m.source
    });
    batch.create(db.collection('omega_audit').doc(), {
      action: 'sitecrm-import', orgId: org, siteId: m.docId,
      by: 'scripts/import-evcs-sites.js', at: now,
      externalSiteIds: m.externalSiteIds, name: m.name
    });
    n += 2;
    if (n >= 400) await flush();
  }
  await batch.commit();
  console.log('  wrote ' + fresh.length + ' sites + audit entries.');
})().catch(function (e) { console.error(e); process.exit(1); });
}

/* The EVCS 292-site dataset is seeded into the EVCS workspace only.
   Returns null when allowed, a WARNING string when overridden, or a
   refusal string otherwise. */
var EVCS_SEED_ORGS = ['evcs.com'];
function checkSeedOrg(orgId, argv) {
  if (EVCS_SEED_ORGS.indexOf(orgId) >= 0) return null;
  if ((argv || []).indexOf('--allow-other-org') >= 0)
    return 'WARNING: seeding the EVCS dataset into non-EVCS org "' + orgId + '" (--allow-other-org given)';
  return 'Refusing: this script seeds the EVCS 292-site dataset, which belongs only to ' +
    EVCS_SEED_ORGS.join(', ') + '. Pass --org ' + EVCS_SEED_ORGS[0] +
    ', or add --allow-other-org if you truly mean "' + orgId + '".';
}

module.exports = { mapRow: mapRow, meterOrNull: meterOrNull, numOrNull: numOrNull,
  EVCS_SEED_ORGS: EVCS_SEED_ORGS, checkSeedOrg: checkSeedOrg };
