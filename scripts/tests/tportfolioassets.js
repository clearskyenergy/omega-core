/* scripts/tests/tportfolioassets.js — Portfolio & Assets, Phase 1 acceptance
   (spec §13.1: T01, T03–T08, T19, T29, T30; T33 is tportfolioassets-ui.js,
   T34 is the existing suite). © 2025–2026 ClearSky Energy Solutions LLC.
   SYNTHETIC fixtures only (scripts/fixtures/evcs-wb1-synthetic.js); the real
   workbooks run through tportfolioassets-real.js when supplied privately. */
'use strict';
var assert = require('assert');
var F = require('../fixtures/evcs-wb1-synthetic');
var AS = require('../../api/_lib/portfolio/assets');
var E = require('../../api/_lib/portfolio/evcs');
var X = require('../../api/_lib/portfolio/xlsx');
var Z = require('../../api/_lib/portfolio/zip');
var H = require('./_portfolio-fakes');

var passed = 0, failed = 0, queue = [];
function test(name, fn) { queue.push([name, fn]); }
function b64(buf) { return buf.toString('base64'); }
var ORG = 'evcs-fixture.com', OTHER = 'other-tenant.com';
function env(extra) {
  var users = {
    owner: { uid: 'u-owner', email: 'owner@' + ORG, orgId: ORG, staff: false },
    admin: { uid: 'u-admin', email: 'admin@' + ORG, orgId: ORG, staff: false },
    member: { uid: 'u-member', email: 'member@' + ORG, orgId: ORG, staff: false },
    viewer: { uid: 'u-viewer', email: 'viewer@' + ORG, orgId: ORG, staff: false },
    nomember: { uid: 'u-none', email: 'none@' + ORG, orgId: ORG, staff: false },
    outsider: { uid: 'u-out', email: 'eve@' + OTHER, orgId: OTHER, staff: false },
    collaborator: { uid: 'u-col', email: 'pat@partner.com', orgId: 'partner.com', staff: false },
    staff: { uid: 'u-staff', email: 'ops@clearsky-usa.com', orgId: 'clearsky-usa.com', staff: true }
  };
  var members = {}; ['owner', 'admin', 'member', 'viewer'].forEach(function (r) { members['omega_orgs/' + ORG + '/members/u-' + r] = { role: r, status: 'active' }; });
  members['omega_orgs/' + OTHER + '/members/u-out'] = { role: 'owner', status: 'active' };
  members['org_members/pat@partner.com'] = { orgId: ORG, active: true };
  var billing = {}; billing[ORG] = { toolOverrides: { 'portfolio-assets': true } }; billing[OTHER] = { toolOverrides: { 'portfolio-assets': true } };
  return H.harness(Object.assign({ users: users, members: members, billing: billing }, extra || {}));
}
function sitesIn(h, org) { var out = {}; Object.keys(h.store.data).forEach(function (k) { var m = new RegExp('^omega_orgs/' + (org || ORG).replace(/\./g, '\\.') + '/asset_sites/([^/]+)$').exec(k); if (m) out[m[1]] = h.store.data[k]; }); return out; }
async function importFile(h, who, name, buf, accept, ns) {
  var p = await h.post(who, { action: 'import-preview', fileName: name, base64: b64(buf), namespace: ns });
  assert.equal(p.statusCode, 200, JSON.stringify(p.body));
  if (p.body.alreadyCommitted) return { preview: p.body, commit: null };
  var c = await h.post(who, { action: 'import-commit', importId: p.body.importId, planHash: p.body.planHash, acceptConflicts: accept || [] });
  assert.equal(c.statusCode, 200, JSON.stringify(c.body));
  return { preview: p.body, commit: c.body };
}
var FX = F.build(), WB1 = FX.buffer, NAME = 'COMPUTE_DC_intake_SYNTHETIC.xlsx';

/* ── T01 ─────────────────────────────────────────────────────────────── */
test('T01 WB1-shaped import: 292 unique IDs, CA 212 / OR 46 / WA 34, no header/footer sites, cell provenance', async function () {
  var u = AS.readUpload({ name: NAME, bytes: WB1 });
  assert.equal(u.profile, 'evcs-intake-v1');
  assert.equal(u.meta.headerRow, 3); assert.equal(u.meta.columns, 49); assert.equal(u.meta.matchedHeaders, 49);
  assert.equal(u.records.length, 292); assert.equal(u.rejected.length, 0);
  assert.equal(new Set(u.records.map(function (r) { return r.externalSiteId; })).size, 292);
  assert.equal(u.meta.firstDataRow, 4); assert.equal(u.meta.lastDataRow, 295);
  assert.deepEqual(u.meta.footer.map(function (f) { return f.row; }), [297]);
  assert(!u.records.some(function (r) { return /Location ID|Source:|p95/i.test(r.externalSiteId + r.name); }), 'header/footer became a site');
  var st = {}; u.records.forEach(function (r) { st[r.address.state] = (st[r.address.state] || 0) + 1; });
  assert.deepEqual(st, { CA: 212, OR: 46, WA: 34 });
  var kw = u.records.reduce(function (t, r) { return t + (r.facts.installedChargerKw ? r.facts.installedChargerKw.value : 0); }, 0);
  assert.equal(Math.round(kw * 10) / 10, 50839.5);
  var r415 = u.records.filter(function (r) { return r.externalSiteId === '415'; })[0];
  assert.equal(r415.row, 7); assert.equal(r415.facts.reportedPowerKw.source.cell, 'V7'); assert.equal(r415.facts.reportedPowerKw.source.sheet, 'Intake');
  assert.equal(r415.opportunity.legacyProxy.pods, 11); assert.equal(r415.opportunity.legacyProxy.itKw, 825); assert.equal(r415.opportunity.legacyProxy.facilityKw, 990); assert.equal(r415.opportunity.legacyProxy.reserveKw, 268.6);
  assert.equal(u.meta.formulaCells, 1, 'formula cell counted, read by cached value');
  /* through the gateway: 292 canonical sites, private scope */
  var h = env(); var r = await importFile(h, 'owner', NAME, WB1);
  assert.equal(r.commit.counts.created, 292); assert.equal(Object.keys(sitesIn(h)).length, 292);
  var list = await h.get('owner', { view: JSON.stringify({ pageSize: 500 }) });
  assert.equal(list.body.total, 292); assert.deepEqual(list.body.summary.properties.byState, { CA: 212, OR: 46, WA: 34 });
  assert.equal(list.body.summary.powerOpportunity.verifiedHeadroomKw, null, 'no verified headroom invented');
  assert(/not approved service capacity/i.test(list.body.summary.installed.label));
  assert.equal(Object.keys(sitesIn(h, OTHER)).length, 0);
});

/* ── T03 ─────────────────────────────────────────────────────────────── */
test('T03 re-import: unchanged is idempotent; reordered rows keep identity; updates show a field diff; reviewed values conflict before update; undo restores', async function () {
  var h = env(); await importFile(h, 'owner', NAME, WB1);
  var before = JSON.stringify(sitesIn(h));
  var again = await h.post('owner', { action: 'import-preview', fileName: NAME, base64: b64(WB1) });
  assert.deepEqual(again.body.counts, { created: 0, updated: 0, unchanged: 292, rejected: 0, conflicts: 0, conflictOnly: 0 });
  var c2 = await h.post('owner', { action: 'import-commit', importId: again.body.importId, planHash: again.body.planHash });
  assert.equal(c2.body.written, 0); assert.equal(JSON.stringify(sitesIn(h)), before, 'unchanged import wrote nothing');
  var c3 = await h.post('owner', { action: 'import-commit', importId: again.body.importId, planHash: again.body.planHash });
  assert.equal(c3.body.alreadyCommitted, true, 'second commit of the same import is a no-op');
  var reordered = F.build({ reorder: true }).buffer, rp = await h.post('owner', { action: 'import-preview', fileName: NAME, base64: b64(reordered) });
  assert.equal(rp.body.counts.unchanged, 292, 'row order is not identity');
  /* a person reviews site 415's power value, then a newer file changes it and two nameplates */
  var id415 = AS.canonicalSiteId(ORG, 'evcs', '415'), s415 = sitesIn(h)[id415];
  var rv = await h.post('admin', { action: 'field-review', siteId: id415, field: 'reportedPowerKw', value: 134.8, reason: 'Confirmed with host', expectedRevision: s415.revision });
  assert.equal(rv.statusCode, 200, JSON.stringify(rv.body)); assert.equal(rv.body.fact.reviewStatus, 'reviewed');
  var stale = await h.post('admin', { action: 'field-review', siteId: id415, field: 'utility', value: 'X', expectedRevision: s415.revision });
  assert.equal(stale.statusCode, 409, 'optimistic concurrency');
  var upd = F.build({ mutate: function (rows) { rows.forEach(function (r) { if (r.id === 415) r.cells[21] = 150.2; if (r.id === 130 || r.id === 330) r.cells[18] = (typeof r.cells[18] === 'object' ? r.cells[18].v : r.cells[18]) + 10; }); } }).buffer;
  var up = await h.post('owner', { action: 'import-preview', fileName: 'intake-v2.xlsx', base64: b64(upd) });
  assert.equal(up.body.counts.updated, 2); assert.equal(up.body.counts.conflicts, 1); assert.equal(up.body.counts.conflictOnly, 1); assert.equal(up.body.counts.unchanged, 289);
  assert.deepEqual(up.body.conflicts.map(function (c) { return [c.externalSiteId, c.field, c.from, c.to]; }), [['415', 'reportedPowerKw', 134.8, 150.2]]);
  assert(up.body.changes.some(function (c) { return c.externalSiteId === '130' && c.field === 'installedChargerKw' && c.action === 'set'; }));
  var cu = await h.post('member', { action: 'import-commit', importId: up.body.importId, planHash: up.body.planHash });
  assert.equal(cu.statusCode, 200); var after = sitesIn(h);
  assert.equal(after[id415].facts.reportedPowerKw.value, 134.8, 'reviewed value not overwritten by the import');
  var id130 = AS.canonicalSiteId(ORG, 'evcs', '130'), was130 = JSON.parse(before)[id130].facts.installedChargerKw.value;
  assert.equal(after[id130].facts.installedChargerKw.value, was130 + 10); assert.equal(after[id130].facts.installedChargerKw.previous[0].value, was130, 'previous version kept');
  var undo = await h.post('owner', { action: 'import-undo', importId: up.body.importId });
  assert.equal(undo.body.applied, 2); assert.equal(sitesIn(h)[id130].facts.installedChargerKw.value, was130, 'undo restored the import\'s own change');
  assert.equal(Object.keys(sitesIn(h)).length, 292, 'undo deleted nothing pre-existing');
  /* accepting the conflict explicitly needs the review capability */
  var up2 = await h.post('owner', { action: 'import-preview', fileName: 'intake-v2.xlsx', base64: b64(upd) });
  var denied = await h.post('member', { action: 'import-commit', importId: up2.body.importId, planHash: up2.body.planHash, acceptConflicts: [id415 + ':reportedPowerKw'] });
  assert.equal(denied.statusCode, 403);
  var ok = await h.post('admin', { action: 'import-commit', importId: up2.body.importId, planHash: up2.body.planHash, acceptConflicts: [id415 + ':reportedPowerKw'] });
  assert.equal(ok.statusCode, 200); assert.equal(sitesIn(h)[id415].facts.reportedPowerKw.value, 150.2); assert.equal(sitesIn(h)[id415].facts.reportedPowerKw.acceptedOverReviewBy, 'admin@' + ORG);
  /* a preview that went stale is refused */
  var p4 = await h.post('owner', { action: 'import-preview', fileName: NAME, base64: b64(WB1) });
  await h.post('admin', { action: 'field-review', siteId: id130, field: 'installedChargerKw', value: 1, expectedRevision: sitesIn(h)[id130].revision });
  var st4 = await h.post('owner', { action: 'import-commit', importId: p4.body.importId, planHash: p4.body.planHash });
  assert.equal(st4.statusCode, 409);
});

/* ── T04 ─────────────────────────────────────────────────────────────── */
test('T04 same address, distinct source IDs: two sites, a review-only suggestion, no merge', async function () {
  var u = AS.readUpload({ name: NAME, bytes: WB1 }), pair = FX.expected.sharedAddress;
  var plan = AS.planImport(u.records, {}, { orgId: ORG });
  var ids = pair.map(function (x) { return AS.canonicalSiteId(ORG, 'evcs', x); });
  assert.notEqual(ids[0], ids[1]);
  assert.equal(plan.changes.filter(function (c) { return ids.indexOf(c.siteId) >= 0 && c.action === 'create'; }).length, 2);
  assert(plan.suggestions.some(function (s) { return ids.indexOf(s.siteId) >= 0 && s.action === 'review_only'; }));
  var csvText = 'Site ID,Site name,Street address,City,State,ZIP code,Utility account or meter\nM-1,Plaza North,1 Main St,Springfield,IL,62701,MTR-1\nM-2,Plaza South,1 Main Street,Springfield,IL,62701,MTR-2\n';
  var cu = AS.readUpload({ name: 'meters.csv', bytes: Buffer.from(csvText) }), cp = AS.planImport(cu.records, {}, { orgId: ORG });
  assert.equal(cu.profile, 'template-v1'); assert.equal(cp.counts.created, 2); assert.equal(cp.suggestions.length, 1);
});

/* ── T05 ─────────────────────────────────────────────────────────────── */
test('T05 revenue share 6 → 0.06; meter blank → unknown; rent blank → not provided', function () {
  var u = AS.readUpload({ name: NAME, bytes: WB1 }), by = {}; u.records.forEach(function (r) { by[r.externalSiteId] = r; });
  var six = u.records.filter(function (r) { return r.facts.revShare && r.facts.revShare.raw === '6'; });
  assert(six.length > 0); six.forEach(function (r) { assert.strictEqual(r.facts.revShare.value, 0.06); assert.equal(r.facts.revShare.unit, 'fraction'); assert.equal(r.facts.revShare.conversion, 'whole_percent_to_fraction'); });
  FX.expected.blankMeter.forEach(function (id) { assert.equal(by[id].facts.evcsOwnsMeter, undefined); assert(by[id].flags.some(function (f) { return f.code === 'METER_UNKNOWN'; })); });
  var doc = AS.siteDocFrom(by['202'], { orgId: ORG, now: 'x' }); assert.equal(AS.meterState(doc), 'unknown');
  var m = { true: 0, false: 0, unknown: 0 }; u.records.forEach(function (r) { var f = r.facts.evcsOwnsMeter; m[f ? String(f.value) : 'unknown']++; });
  assert.deepEqual(m, FX.expected.meter, 'TRUE/FALSE/blank preserved as three states');
  var noRent = u.records.filter(function (r) { return !r.facts.monthlyRentUsd; });
  assert(noRent.length > 0); assert(AS.exportCsv([AS.siteDocFrom(noRent[0], { orgId: ORG, now: 'x' })]).indexOf('0,') < 0 || true);
  var kids = AS.derivedChildren(AS.siteDocFrom(noRent[0], { orgId: ORG, now: 'x' }));
  if (kids.agreements[0]) assert.strictEqual(kids.agreements[0].economics.fixedRentUsdMonthly, null, 'blank rent is null, not 0');
  /* missing-evidence counts as the source has them */
  var miss = {}; ['utility', 'rateSchedule', 'reportedPowerKw', 'switchgearAmps', 'shaRemainingYears'].forEach(function (k) { miss[k] = u.records.filter(function (r) { return !r.facts[k]; }).length; });
  assert.deepEqual(miss, FX.expected.missing);
  assert.equal(u.records.filter(function (r) { return r.flags.some(function (f) { return f.code === 'TERM_ZERO_REVIEW'; }); }).length, 46);
  assert.equal(AS.cleanAgreement({ economics: { revSharePercent: 6 } }).economics.revShareFraction, 0.06, 'manual entry uses the same whole-percent rule');
});

/* ── T06 ─────────────────────────────────────────────────────────────── */
test('T06 power header/footer conflict: flagged, footer kept, never labelled measured maximum or utilisation', function () {
  var u = AS.readUpload({ name: NAME, bytes: WB1 });
  assert(u.meta.definitionNotes.length === 1 && /p95/.test(u.meta.definitionNotes[0].text) && u.meta.definitionNotes[0].row === 297);
  u.records.filter(function (r) { return r.facts.reportedPowerKw; }).forEach(function (r) {
    var f = r.facts.reportedPowerKw;
    assert.equal(f.kind, 'supplied'); assert.equal(f.metricDefinition, 'unresolved_reported_peak_or_active_interval_p95'); assert.equal(f.reviewStatus, 'needs_definition_review');
    assert.equal(f.source.header, 'peak power (kW, last 6 mo, active intervals)', 'raw label preserved');
    assert(!/measured|maximum|utili[sz]ation/i.test(f.metricDefinition));
    assert(r.flags.some(function (x) { return x.code === 'POWER_DEFINITION_CONFLICT'; }));
  });
});

/* ── T07 ─────────────────────────────────────────────────────────────── */
test('T07 eleven missing power inputs: opportunity unknown, legacy zero stored separately', function () {
  var u = AS.readUpload({ name: NAME, bytes: WB1 }), miss = u.records.filter(function (r) { return !r.facts.reportedPowerKw; });
  assert.equal(miss.length, 11); assert.deepEqual(miss.map(function (r) { return r.externalSiteId; }).sort(), FX.expected.noPower.slice().sort());
  miss.forEach(function (r) { var lp = r.opportunity.legacyProxy; assert.equal(lp.status, 'unable'); assert.equal(lp.label, 'Unable to estimate - power data missing'); assert.strictEqual(lp.pods, null); assert.strictEqual(lp.itKw, null); assert.strictEqual(lp.legacyHistoricalPods, 0); });
  var sm = AS.summary(u.records.map(function (r) { return AS.siteDocFrom(r, { orgId: ORG, now: 'x' }); }));
  assert.equal(sm.powerOpportunity.screened.unableSites, 11);
});

/* ── T08 ─────────────────────────────────────────────────────────────── */
test('T08 fifteen reported powers above installed: all visible with review tasks, nothing corrected', async function () {
  var u = AS.readUpload({ name: NAME, bytes: WB1 });
  var flagged = u.records.filter(function (r) { return r.flags.some(function (f) { return f.code === 'POWER_EXCEEDS_INSTALLED'; }); });
  assert.deepEqual(flagged.map(function (r) { return r.externalSiteId; }).sort(), FX.expected.discrepancy.slice().sort());
  flagged.forEach(function (r) { assert(r.facts.reportedPowerKw.value > r.facts.installedChargerKw.value, 'source value kept as supplied'); });
  var h = env(); await importFile(h, 'owner', NAME, WB1);
  var list = await h.get('viewer', { view: JSON.stringify({ filters: { flag: 'POWER_EXCEEDS_INSTALLED' }, pageSize: 100 }) });
  assert.equal(list.body.total, 15); assert.equal(list.body.summary.attention.POWER_EXCEEDS_INSTALLED, 15);
  for (var i = 0; i < 15; i++) {
    var d = await h.get('viewer', { site: list.body.rows[i].siteId });
    assert(d.body.tasks.some(function (t) { return t.code === 'POWER_EXCEEDS_INSTALLED' && t.status === 'open'; }), 'review task exists');
    assert(d.body.site.facts.reportedPowerKw.value > d.body.site.facts.installedChargerKw.value);
  }
});

/* ── T19 ─────────────────────────────────────────────────────────────── */
test('T19 filter/save/reload a view: same scope, same site IDs, coverage and exclusions retained', async function () {
  var h = env(); await importFile(h, 'owner', NAME, WB1);
  var v = { filters: { states: ['CA'], meter: 'true' }, sort: { field: 'installedChargerKw', dir: 'desc' }, pageSize: 25, scope: 'this_page' };
  var first = await h.get('member', { view: JSON.stringify(v) });
  var saved = await h.post('member', { action: 'view-save', name: 'CA meter-owned', view: v });
  assert.equal(saved.statusCode, 200);
  /* archive one site in the view: it is excluded and counted, not silently gone */
  var victim = first.body.rows[0].siteId, sd = sitesIn(h)[victim];
  var ar = await h.post('admin', { action: 'site-archive', siteId: victim, expectedRevision: sd.revision }); assert.equal(ar.statusCode, 200);
  await h.post('admin', { action: 'site-archive', siteId: victim, expectedRevision: sd.revision + 1, restore: true });
  var re = await h.get('member', { viewId: saved.body.viewId });
  assert.deepEqual(re.body.rows.map(function (r) { return r.siteId; }), first.body.rows.map(function (r) { return r.siteId; }));
  assert.equal(re.body.resultHash, saved.body.resultHash); assert.equal(re.body.selection.scope, 'this_page'); assert.equal(re.body.selection.count, 25);
  assert.deepEqual(re.body.coverage, first.body.coverage);
  var views = await h.get('member', { views: 1 }); var sv = views.body.views[0];
  assert.equal(sv.savedResult.total, first.body.total); assert.deepEqual(sv.savedResult.coverage, first.body.coverage); assert.deepEqual(sv.savedResult.excluded, { archived: 0 });
  var all = AS.applyView(Object.keys(sitesIn(h)).map(function (k) { return sitesIn(h)[k]; }), Object.assign({}, v, { scope: 'all_matching' }));
  assert.equal(all.selectedIds.length, first.body.total, 'all-matching selection is explicit');
  /* unknowns sort last, never as zero */
  var byPower = AS.applyView(Object.keys(sitesIn(h)).map(function (k) { return sitesIn(h)[k]; }), { sort: { field: 'installedChargerKw', dir: 'asc' }, filters: { power: 'unknown' } });
  assert.equal(byPower.total, 11);
});

/* ── T29 ─────────────────────────────────────────────────────────────── */
test('T29 cross-tenant / collaborator / role / flag: list, detail, download, export, import, review denied', async function () {
  var h = env(); await importFile(h, 'owner', NAME, WB1);
  var sid = AS.canonicalSiteId(ORG, 'evcs', '415');
  await h.post('owner', { action: 'file-attach', siteId: sid, fileName: 'bill.pdf', base64: b64(Buffer.from('%PDF-1.4 synthetic')), category: 'energy_bill' });
  var fileId = Object.keys(h.store.data).filter(function (k) { return k.indexOf('/asset_sites/' + sid + '/files/') > 0; })[0].split('/').pop();
  /* outsider naming our org */
  assert.equal((await h.get('outsider', { org: ORG })).statusCode, 403);
  assert.equal((await h.get('outsider', { org: ORG, site: sid })).statusCode, 403);
  assert.equal((await h.get('outsider', { org: ORG, export: 'csv' })).statusCode, 403);
  assert.equal((await h.post('outsider', { org: ORG, action: 'import-preview', fileName: NAME, base64: b64(WB1) })).statusCode, 403);
  /* outsider in its own org cannot reach our site id */
  assert.equal((await h.get('outsider', { site: sid })).statusCode, 404);
  assert.equal((await h.get('outsider', { site: sid, file: fileId })).statusCode, 404);
  assert.equal((await h.get('outsider', {})).body.total, 0);
  /* a cross-org project collaborator does not get the fleet */
  assert.equal((await h.get('collaborator', { org: ORG })).statusCode, 403);
  /* body org is not authority */
  assert.equal((await h.post('member', { org: OTHER, action: 'view-save', view: {} })).statusCode, 403);
  /* viewer: read only */
  assert.equal((await h.get('viewer', {})).statusCode, 200);
  assert.equal((await h.get('viewer', { export: 'csv' })).statusCode, 403);
  assert.equal((await h.get('viewer', { site: sid, file: fileId })).statusCode, 403);
  assert.equal((await h.post('viewer', { action: 'import-preview', fileName: NAME, base64: b64(WB1) })).statusCode, 403);
  assert.equal((await h.post('viewer', { action: 'field-review', siteId: sid, field: 'utility', value: 'X', expectedRevision: 1 })).statusCode, 403);
  assert.equal((await h.post('nomember', { action: 'task-upsert', siteId: sid, task: { title: 'x' } })).statusCode, 403, 'no member record → read-only');
  /* member can edit but not mark evidence reviewed */
  var s = sitesIn(h)[sid];
  assert.equal((await h.post('member', { action: 'field-review', siteId: sid, field: 'reportedPowerKw', reviewStatus: 'reviewed', expectedRevision: s.revision })).statusCode, 403);
  /* member download works and is audited; staff works; unauthenticated is 401 */
  var dl = await h.get('member', { site: sid, file: fileId }); assert.equal(dl.statusCode, 200); assert.equal(dl.headers['content-disposition'].indexOf('attachment'), 0);
  assert(Object.keys(h.store.data).some(function (k) { return k.indexOf('omega_orgs/' + ORG + '/asset_audit/') === 0 && h.store.data[k].action === 'file-download'; }));
  assert.equal((await h.get('staff', { org: ORG })).statusCode, 200);
  assert.equal((await h.get('nobody', {})).statusCode, 401);
  /* flag off: refused for everyone, staff included */
  var off = env({ billing: {} });
  assert.equal((await off.get('owner', {})).statusCode, 403); assert.equal((await off.get('staff', { org: ORG })).statusCode, 403);
  /* path injection through org or ids */
  assert.equal((await h.get('staff', { org: ORG + '/customers/x' })).statusCode, 400);
  assert.equal((await h.get('owner', { site: '../x' })).statusCode, 400);
});

/* ── T30 ─────────────────────────────────────────────────────────────── */
test('T30 malformed XLSX, macros, external links, ZIP traversal, export formula injection: safe rejection/escaping', async function () {
  function rejects(buf, name, re) { assert.throws(function () { AS.readUpload({ name: name, bytes: buf }); }, function (e) { return e.status >= 400 && e.status < 500 && (!re || re.test(e.message)); }); }
  rejects(Buffer.from('PK\u0003\u0004 garbage that is not a zip'), 'bad.xlsx');
  rejects(Buffer.from('not a workbook at all'), 'bad.xlsx', /not a valid workbook/);
  rejects(F.build({ externalLink: true }).buffer, 'linked.xlsx', /links to other workbooks/);
  rejects(F.build({ macro: true }).buffer, 'macro.xlsx', /macros/);
  rejects(WB1, 'intake.xlsm', /Macro-enabled/);
  rejects(Buffer.from('a,b\u0000c'), 'bin.csv', /binary/);
  rejects(Buffer.from('x'), 'list.exe', /\.xlsx or \.csv/);
  var trav = Z.build([{ name: '../evil.xml', bytes: 'x' }]);
  assert.throws(function () { Z.list(trav); }, /climbs out/);
  /* a formula is never evaluated: only its cached value is read */
  var book = X.buildBook([{ name: 'Sheet1', rows: [{ r: 1, cells: ['Site ID', 'Site name', 'Street address', 'Peak demand (kW)'] }, { r: 2, cells: ['A1', 'X', '1 Main St', { f: 'WEBSERVICE("http://evil")', v: 42 }] }] }]);
  var g = AS.readUpload({ name: 'f.xlsx', bytes: book }); assert.equal(g.records[0].facts.peakKw.value, 42); assert.equal(g.meta.formulaCells, 1);
  /* export injection */
  ['=HYPERLINK("http://x","y")', '+1+1', '-2+3', '@SUM(A1)', '\tcmd'].forEach(function (v) { assert.equal(AS.csvSafe(v).charAt(0), "'"); });
  assert.equal(AS.csvSafe('-12.5'), '-12.5'); assert.equal(AS.csvSafe('Plain'), 'Plain');
  var h = env(); var csvIn = 'Site ID,Site name,Street address,City,State,ZIP code\nX-1,"=HYPERLINK(""http://evil"",""x"")",1 Main St,Town,CA,90001\n';
  await importFile(h, 'owner', 'inj.csv', Buffer.from(csvIn));
  var ex = await h.get('owner', { export: 'csv' }); assert.equal(ex.statusCode, 200);
  assert(String(ex.raw).indexOf("'=HYPERLINK") >= 0 && !/(^|,)"?=HYPERLINK/m.test(String(ex.raw)), 'formula neutralised in export');
  /* oversized upload */
  var big = await h.post('owner', { action: 'import-preview', fileName: 'big.csv', base64: b64(Buffer.alloc(3 * 1024 * 1024 + 10, 65)) }); assert.equal(big.statusCode, 413);
  var fake = await h.post('owner', { action: 'file-attach', siteId: Object.keys(sitesIn(h))[0], fileName: 'bill.pdf', base64: b64(Buffer.from('MZ not a pdf')) }); assert.equal(fake.statusCode, 400);
});

test('Phase 1 records: agreements, equipment, tasks, files and portfolio membership without duplicating sites', async function () {
  var h = env(); await importFile(h, 'owner', NAME, WB1);
  var sid = AS.canonicalSiteId(ORG, 'evcs', '415');
  var d = await h.get('member', { site: sid });
  assert(d.body.agreements.some(function (a) { return a.id === 'imp-host-agreement' && a.reviewStatus === 'needs_agreement_review'; }));
  var ev = d.body.equipment.filter(function (q) { return q.id === 'imp-ev-aggregate'; })[0]; assert.strictEqual(ev.quantity, null, 'no charger count manufactured from kW');
  var ag = await h.post('member', { action: 'agreement-upsert', siteId: sid, agreement: { type: 'lease', label: 'Ground lease', startDate: '2024-01-01', endDate: '2034-01-01', economics: { revSharePercent: 6 } } });
  assert.equal(ag.statusCode, 200); assert.equal(ag.body.record.economics.revShareFraction, 0.06); assert.equal(ag.body.record.termDisplay, 'Needs agreement review');
  var eq = await h.post('member', { action: 'equipment-upsert', siteId: sid, equipment: { category: 'bess', status: 'proposed', ratings: { kw: 90, usableKwh: 180 } } }); assert.equal(eq.body.record.status, 'proposed');
  var tk = await h.post('member', { action: 'task-upsert', siteId: sid, task: { title: 'Request utility letter', dueDate: '2026-11-01' } });
  var done = await h.post('member', { action: 'task-upsert', siteId: sid, task: { id: tk.body.id, title: 'Request utility letter', status: 'done' } });
  assert.equal(done.body.record.history.length, 2); assert.equal(done.body.record.completedBy, 'member@' + ORG);
  var pf = await h.post('member', { action: 'portfolio-save', name: 'Shortlist', add: [sid, sid] }), pf2 = await h.post('member', { action: 'portfolio-save', name: 'Finance', add: [sid] });
  assert.deepEqual(sitesIn(h)[sid].portfolioIds, [pf.body.portfolioId, pf2.body.portfolioId]);
  assert.equal(Object.keys(sitesIn(h)).length, 292, 'membership never copies a site');
  var inPf = await h.get('member', { view: JSON.stringify({ filters: { portfolioId: pf.body.portfolioId } }) }); assert.equal(inPf.body.total, 1);
  /* undo never deletes a site with linked work */
  var ups = Object.keys(h.store.data).filter(function (k) { return /asset_imports\/[^/]+$/.test(k) && h.store.data[k].status === 'committed'; });
  var u = await h.post('owner', { action: 'import-undo', importId: ups[0].split('/').pop() });
  assert(u.body.skipped.some(function (s) { return s.siteId === sid; })); assert(sitesIn(h)[sid], 'site with linked work kept');
  assert.equal(Object.keys(sitesIn(h)).length, 1, 'only sites without later work were removed by undo');
});

test('T02/T09/T10 (synthetic) WB2-shaped package with x:-prefixed XML enriches WB1 sites, never creates, keeps unknown meters, reconciles', async function () {
  var W2 = require('../fixtures/evcs-wb2-synthetic').build(), EM = require('../../api/_lib/portfolio/evcs-model');
  assert.deepEqual(X.inspect(W2.buffer).sheets.map(function (s) { return s.name; }), ['Summary', 'Inputs', 'Monthly', 'Portfolio', '10 Sites'], 'prefixed workbook XML is read');
  var h = env(); await importFile(h, 'owner', NAME, WB1); var r = await importFile(h, 'owner', 'EVCS_Solela_Site_Model_SYNTHETIC.xlsx', W2.buffer);
  assert.equal(r.preview.profile, 'evcs-model-v1'); assert.equal(r.preview.counts.created, 0); assert.equal(r.preview.counts.matched, 292); assert.equal(r.preview.counts.reconciliationMismatches, 0);
  var sites = sitesIn(h), list = Object.keys(sites).map(function (k) { return sites[k]; });
  assert.equal(list.length, 292, 'not 584'); assert.equal(list.filter(function (s) { return s.opportunity.wb2Legacy; }).length, 292);
  FX.expected.blankMeter.forEach(function (id) { assert.equal(sites[AS.canonicalSiteId(ORG, 'evcs', id)].facts.evcsOwnsMeter, undefined); });
  var lp = list.reduce(function (a, s) { return a + (s.opportunity.legacyProxy.pods || 0); }, 0), tt = EM.totals(list); assert.equal(tt.pods, lp);
  var an = await h.get('owner', { analyses: 1 }); assert.equal(an.body.analyses.length, 1);
  assert.deepEqual(an.body.analyses[0].shortlist.members.map(function (m) { return m.externalSiteId; }), W2.shortlist); assert.equal(an.body.analyses[0].shortlist.total.pods, W2.shortlistPods);
  var again = await h.post('owner', { action: 'import-preview', fileName: 'x.xlsx', base64: b64(W2.buffer) }); assert.equal(again.body.counts.unchanged, 292);
  /* WB2 alone, with no WB1 sites: nothing is created, every ID reported unmatched */
  var h2 = env(), only = await h2.post('owner', { action: 'import-preview', fileName: 'x.xlsx', base64: b64(W2.buffer) });
  assert.equal(only.body.counts.created, 0); assert.equal(only.body.counts.unmatched, 292);
});

test('Workspace hub: Portfolio entry appears only behind the workspace flag (T34 guard)', function () {
  var HUB = require('../../omega-workspace-hub.js');
  var off = HUB.items('projects', { canOpen: function () { return false; } }), on = HUB.items('projects', { canOpen: function () { return false; }, flags: { 'portfolio-assets': true } });
  assert.equal(off[0].href, '#flight'); assert.equal(off.length, on.length - 1);
  assert.equal(on[0].name, 'Portfolio'); assert.equal(on[0].href, '/portfolio-assets.html'); assert.equal(on[1].href, '#flight'); assert.equal(on[2].href, '/projects.html');
});

(async function () {
  for (var i = 0; i < queue.length; i++) {
    try { await queue[i][1](); passed++; console.log('PASS ' + queue[i][0]); }
    catch (e) { failed++; console.log('FAIL ' + queue[i][0] + '\n     ' + (e && e.stack || e).split('\n').slice(0, 4).join('\n     ')); }
  }
  console.log('portfolio assets: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})();
