#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Dry-run migration planner. Reads snapshots; has no Firestore write path.
 * Usage: node scripts/backfill-modules.js --input reviewed-org-snapshot.json
 * Input: [{orgId, billing, effectiveTools: [current tool keys]}]. Capture
 * effectiveTools from the existing workspace before enabling packaged access.
 */
'use strict';
var fs = require('fs'), vm = require('vm'), path = require('path');
var M = require('../api/_lib/modules');
var source = fs.readFileSync(path.join(__dirname, '..', 'omega-caps.js'), 'utf8');
function plan(row) {
  if (!row || typeof row.orgId !== 'string' || !row.orgId || !row.billing || !Array.isArray(row.effectiveTools)) throw new Error('Each organization needs billing and its captured effectiveTools; do not guess current access');
  var b = row.billing, flags = [], modules = ['lite'], exceptions = [], catalog = M.catalog(), caps = {};
  vm.runInNewContext(source, caps);
  var C = caps.OmegaCaps;
  C.setOrg('migration@' + row.orgId); C.setAddons(b.addons || []);
  var tier = C.effectiveTier(b.tier, b.capTier);
  if (b.packaged) return { orgId: row.orgId, action: 'already-packaged', modules: M.normalize(b.modules), flags: ['No changes proposed'] };
  catalog.forEach(function (m) {
    if (m.key === 'lite') return;
    var fromTool = m.tools.some(function (key) { return row.effectiveTools.indexOf(key) >= 0; });
    var fromCap = m.ribbon.length && m.caps.some(function (key) { return C.can(tier, key); });
    var fromAddon = (b.addons || []).indexOf(m.key) >= 0;
    if (fromTool || fromCap || fromAddon) modules.push(m.key);
  });
  // Dependencies are explicit catalog data, not another module map.
  modules.slice().forEach(function (key) { M.get(key).requires.forEach(function (dep) { if (modules.indexOf(dep) < 0) modules.push(dep); }); });
  modules = M.normalize(modules);
  var after = M.resolve(modules).toolAccess;
  var missing = row.effectiveTools.filter(function (k) { return after.indexOf(k) < 0; });
  missing.forEach(function (k) { var owner = M.notSold().filter(function (m) { return m.tools.indexOf(k) >= 0; })[0]; exceptions.push({ tool: k, reason: owner ? owner.reason : 'Unclassified existing tool' }); });
  var extra = after.filter(function (k) { return row.effectiveTools.indexOf(k) < 0; });
  if (missing.length) flags.push('Retain legacy grants; explicit decision needed for tools outside the sold catalog');
  if (extra.length) flags.push('Modules would broaden access; review package and member restrictions');
  if (b.capTier || b.toolAccess || b.toolOverrides || b.editorLite || b.contractId) flags.push('Custom access or contract: manual review required');
  if (tier === 'internal' || tier === 'partner') flags.push('Staff or partner arrangement requires review');
  flags.push('Do not activate until pricing, paid/trial lifecycle and data-write gates are approved');
  return { orgId: row.orgId, action: 'review-only', proposedModules: modules, retainedOutsideCatalog: exceptions,
    currentTools: row.effectiveTools.slice().sort(), addedTools: extra, flags: flags,
    changesApplied: false, preservesBillingDates: true, preservesTrials: true };
}
function main(args) {
  if (args.indexOf('--apply') >= 0 || args.indexOf('--live') >= 0) throw new Error('Phase 3 is dry-run only; no apply or live-write path exists');
  if (args.length !== 2 || args[0] !== '--input') throw new Error('Usage: node scripts/backfill-modules.js --input reviewed-org-snapshot.json');
  var rows = JSON.parse(fs.readFileSync(args[1], 'utf8'));
  if (!Array.isArray(rows)) throw new Error('Input must be an organization snapshot array');
  return { dryRun: true, source: 'reviewed-snapshot', organizations: rows.map(plan), changesApplied: 0 };
}
module.exports = { plan: plan, main: main };
if (require.main === module) { try { console.log(JSON.stringify(main(process.argv.slice(2)), null, 2)); } catch (e) { console.error(e.message); process.exitCode = 1; } }
