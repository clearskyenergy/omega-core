/* scripts/tests/tportfolio-phases.js — Portfolio & Assets Phases 2–5 + CRM
   acceptance (spec §13.1: T11–T18, T20–T25, T27, T28, T31, T32, T35; T26
   parity runs on the private workbook in tportfolio-economics-real.js).
   © 2025–2026 ClearSky Energy Solutions LLC. SYNTHETIC fixtures only. */
'use strict';
var assert = require('assert');
var P = require('../../api/_lib/portfolio/power'), R = require('../../api/_lib/portfolio/readiness'), E = require('../../api/_lib/portfolio/economics'), HO = require('../../api/_lib/portfolio/handoff');
var AS = require('../../api/_lib/portfolio/assets'), H = require('./_portfolio-fakes');
var passed = 0, failed = 0, queue = [];
function test(n, f) { queue.push([n, f]); }
var ORG = 'evcs-fixture.com', OTHER = 'other-tenant.com';
function env(billingOverrides) {
  var users = { owner: { uid: 'u-owner', email: 'owner@' + ORG, orgId: ORG }, member: { uid: 'u-member', email: 'member@' + ORG, orgId: ORG }, viewer: { uid: 'u-viewer', email: 'viewer@' + ORG, orgId: ORG }, outsider: { uid: 'u-out', email: 'eve@' + OTHER, orgId: OTHER } };
  var members = {}; ['owner', 'member', 'viewer'].forEach(function (r) { members['omega_orgs/' + ORG + '/members/u-' + r] = { role: r, status: 'active' }; });
  members['omega_orgs/' + OTHER + '/members/u-out'] = { role: 'owner', status: 'active' };
  var billing = {}; billing[ORG] = { toolOverrides: billingOverrides || {} };
  return H.harness({ users: users, members: members, billing: billing });
}
var WB1 = require('../fixtures/evcs-wb1-synthetic').build().buffer, W2 = require('../fixtures/evcs-wb2-synthetic').build();
async function imp(h, name, buf) { var p = await h.post('owner', { action: 'import-preview', fileName: name, base64: buf.toString('base64') }); assert.equal(p.statusCode, 200, JSON.stringify(p.body)); var c = await h.post('owner', { action: 'import-commit', importId: p.body.importId, planHash: p.body.planHash, acceptConflicts: [] }); assert.equal(c.statusCode, 200, JSON.stringify(c.body)); }
async function loaded() { var h = env(); await imp(h, 'COMPUTE_DC_intake_SYNTHETIC.xlsx', WB1); await imp(h, 'EVCS_Solela_Site_Model_SYNTHETIC.xlsx', W2.buffer); var an = (await h.get('owner', { analyses: 1 })).body.analyses[0]; return { h: h, analysis: an }; }
function key(h, re) { return Object.keys(h.store.data).filter(function (k) { return re.test(k); }); }
function site(h, id) { return h.store.data['omega_orgs/' + ORG + '/asset_sites/' + id]; }
/* synthetic, NOT the workbook's values */
var SYN = { gpuPerPod: 64, gpuPrice: 2.1, utilization: 0.7, uptime: 0.99, priceChange: -0.1, powerPrice: 0.12, costEscalation: 0.03, fixedOpexMonth: 6000, networkPct: 0.03, maintPct: 0.02, podCapex: 1500000, bessCapex: 100000, liquidity: 25000, bessOmYear: 4000, investorResidual: 0.5 };

/* ── Phase 2: power (pure) ───────────────────────────────────────────── */
test('T11 unknown approved limit → verified headroom null; nameplate never relabelled approval', function () {
  var h = P.headroom({ required: ['approvedImport'], limits: { service: { kw: 800 } }, baselineKw: 100 });
  assert.equal(h.verifiedKw, null); assert.equal(h.reason, 'UNKNOWN_LIMIT');
  var c = P.classify({ facts: { installedChargerKw: { value: 600 } } }); assert.equal(c.level, 'proxy'); assert(/not approved/i.test(c.label));
});
test('T12 500 − 180 − 50 − 20 = 250 kW raw headroom', function () {
  var h = P.headroom({ required: ['approvedImport'], limits: { approvedImport: { kw: 500 } }, baselineKw: 180, commitments: [{ id: 'c1', kw: 50 }], reserveKw: 20 });
  assert.equal(h.rawKw, 250); assert.equal(h.verifiedKw, 250);
});
test('T13 75 kW IT pods at PUE 1.2 on 250 kW → 2 pods, 150 IT / 180 facility, PUE once', function () {
  var f = P.computeFit(250, { podItKw: 75, pue: 1.2 }); assert.equal(f.pods, 2); assert.equal(f.itKw, 150); assert.equal(f.facilityKw, 180);
});
test('T14 commitment already in baseline is not subtracted twice; membership recorded', function () {
  var h = P.headroom({ required: ['approvedImport'], limits: { approvedImport: { kw: 500 } }, baselineKw: 180, baselineIncludes: ['c1'], commitments: [{ id: 'c1', kw: 50 }], reserveKw: 20 });
  assert.equal(h.rawKw, 300); assert.deepEqual(h.alreadyInBaseline, ['c1']); assert.deepEqual(h.subtractedCommitments, []);
});
test('T15 two meters on one transformer cannot exceed the shared envelope', function () {
  var env1 = { id: 'tx1', kw: 300 }, led = [{ envelopeId: 'tx1', kw: 200, status: 'approved' }];
  assert.equal(P.checkAllocation(env1, led, { kw: 150, idempotencyKey: 'b' }).code, 'ENVELOPE_EXCEEDED');
  assert(P.checkAllocation(env1, led, { kw: 100, idempotencyKey: 'b' }).ok);
});
test('T16 concurrent + duplicate reservations through the gateway: atomic, idempotent, no double allocation', async function () {
  var L = await loaded(), h = L.h, ids = L.analysis.shortlist.siteIds;
  assert.equal((await h.post('owner', { action: 'envelope-save', envelopeId: 'tx1', kw: 300, siteIds: ids.slice(0, 2) })).statusCode, 200);
  var a = await h.post('owner', { action: 'allocation-reserve', envelopeId: 'tx1', siteId: ids[0], kw: 200, idempotencyKey: 'k1' });
  var dup = await h.post('owner', { action: 'allocation-reserve', envelopeId: 'tx1', siteId: ids[0], kw: 200, idempotencyKey: 'k1' });
  var over = await h.post('owner', { action: 'allocation-reserve', envelopeId: 'tx1', siteId: ids[1], kw: 150, idempotencyKey: 'k2' });
  assert.equal(a.statusCode, 200); assert.equal(dup.body.duplicate, true); assert.equal(over.statusCode, 409);
  assert.equal(h.store.data['omega_orgs/' + ORG + '/asset_allocations/led_tx1'].items.length, 1);
  assert.equal((await h.post('member', { action: 'allocation-reserve', envelopeId: 'tx1', siteId: ids[1], kw: 10, idempotencyKey: 'k3' })).statusCode, 403, 'review capability required');
});
test('T17 partial / active-only interval data → warnings, no annual energy or firm capacity', function () {
  var part = P.intervalCoverage(new Array(1000).fill(40), { intervalMin: 15 }); assert(part.warnings.some(function (w) { return /PARTIAL/.test(w); })); assert.equal(part.annualKwh, null); assert.equal(part.firmCapacityKw, null);
  var act = P.intervalCoverage(new Array(35040).fill(10), { intervalMin: 15, activeOnly: true }); assert.equal(act.annualKwh, null); assert.equal(act.completeYear, false);
  var full = P.intervalCoverage(new Array(35040).fill(10), { intervalMin: 15 }); assert.equal(full.annualKwh, 87600); assert.equal(full.firmCapacityKw, null);
});
test('T18 BESS charging, losses and backup are counted; energy cannot be sold twice', function () {
  var b = { usableKwh: 400, maxKw: 100, backupReserveKwh: 100, roundTripEff: 0.8, rechargeHours: 4 };
  var r = P.bessPlan(b, [{ service: 'peak', kw: 100, kwh: 200 }, { service: 'dr', kw: 100, kwh: 200 }], 50);
  assert(r.errors.some(function (e) { return e.code === 'ENERGY_DOUBLE_SOLD'; }));
  var ok = P.bessPlan(b, [{ service: 'peak', kw: 100, kwh: 200 }], 100); assert(ok.ok); assert.equal(ok.rechargeKwh, 250); assert.equal(ok.lossesKwh, 50);
  assert(P.bessPlan(b, [{ service: 'peak', kw: 100, kwh: 300 }], 20).errors.some(function (e) { return e.code === 'RECHARGE_EXCEEDS_HEADROOM'; }));
});
test('T35 fleet physical totals count each site / shared envelope once across overlapping portfolios', function () {
  var s = { a: { facts: { installedChargerKw: { value: 100 } }, powerEvidence: { envelopeId: 'e', envelopeHeadroomKw: 50 } }, b: { facts: { installedChargerKw: { value: 60 } }, powerEvidence: { envelopeId: 'e', envelopeHeadroomKw: 50 } }, c: { facts: { installedChargerKw: { value: 10 } }, powerEvidence: { verifiedKw: 5 } } };
  var t = P.fleetPhysical([{ siteIds: ['a', 'b'] }, { siteIds: ['a', 'c'] }, { siteIds: ['b', 'c'] }], s);
  assert.deepEqual(t, { sites: 3, installedKw: 170, verifiedHeadroomKw: 55, envelopes: 1 });
});

/* ── Phase 2/3 through the gateway ───────────────────────────────────── */
test('Shortlist view + create linked projects: opt-in, idempotent, tenant-scoped', async function () {
  var L = await loaded(), h = L.h, an = L.analysis;
  var v = await h.get('owner', { shortlist: an.id }); assert.equal(v.statusCode, 200); assert.equal(v.body.members.length, W2.shortlist.length); assert(/not individually underwritten/.test(v.body.caveat));
  assert.equal((await h.post('owner', { action: 'shortlist-create-projects', analysisId: an.id })).statusCode, 400, 'explicit choice required');
  var pick = an.shortlist.siteIds.slice(0, 3), r1 = await h.post('owner', { action: 'shortlist-create-projects', analysisId: an.id, siteIds: pick }), r2 = await h.post('owner', { action: 'shortlist-create-projects', analysisId: an.id, siteIds: pick });
  assert(r1.body.projects.every(function (p) { return p.created; })); assert(r2.body.projects.every(function (p) { return !p.created; }));
  assert.equal(key(h, /^projects\/pa_/).length, 3); pick.forEach(function (id, i) { assert.equal(site(h, id).links.projectId, r1.body.projects[i].projectId); assert.equal(h.store.data['projects/' + r1.body.projects[i].projectId].orgId, ORG); });
  assert.equal((await h.post('viewer', { action: 'shortlist-create-projects', analysisId: an.id, siteIds: pick })).statusCode, 403);
  assert.equal((await h.get('outsider', { shortlist: an.id })).statusCode, 404, 'other tenant sees nothing');
});
test('Power-evidence workflow: revision guard, headroom, fit, reviewed classification', async function () {
  var L = await loaded(), h = L.h, id = L.analysis.shortlist.siteIds[0], rev = site(h, id).revision;
  assert.equal((await h.post('owner', { action: 'power-evidence', siteId: id, expectedRevision: rev - 1 })).statusCode, 409);
  var r = await h.post('owner', { action: 'power-evidence', siteId: id, expectedRevision: rev, limits: { approvedImport: { kw: 500, source: 'utility letter' } }, baselineKw: 180, commitments: [{ id: 'c1', kw: 50 }], reserveKw: 20, review: { signedBy: 'PE', validUntil: '2027-10-01' } });
  assert.equal(r.statusCode, 200, JSON.stringify(r.body)); assert.equal(r.body.powerEvidence.verifiedKw, 250); assert.equal(r.body.powerEvidence.fit.pods, 2); assert.equal(r.body.powerEvidence.classification.level, 'reviewed');
  var iv = await h.post('owner', { action: 'interval-upload', siteId: id, csv: 'ts,kw\n1,10\n2,12\n' }); assert.equal(iv.body.coverage.annualKwh, null);
});
test('T20 editor create/open/return/reopen: one linked project, same id, geometry preserved', async function () {
  var L = await loaded(), h = L.h, id = L.analysis.shortlist.siteIds[1];
  var ask = await h.post('owner', { action: 'handoff', siteId: id, tool: 'editor' }); assert.equal(ask.body.status, 'needs-project');
  var o1 = await h.post('owner', { action: 'handoff', siteId: id, tool: 'editor', createProject: true }); assert(o1.body.ok); assert(/^\/editor\.html\?id=pa_/.test(o1.body.url)); assert(/return=/.test(o1.body.url));
  h.store.data['projects/' + o1.body.projectId].elements = [{ id: 'e1', manual: true }];
  var o2 = await h.post('owner', { action: 'handoff', siteId: id, tool: 'editor', createProject: true }); assert.equal(o2.body.projectId, o1.body.projectId);
  assert.equal(key(h, /^projects\//).length, 1); assert.deepEqual(h.store.data['projects/' + o1.body.projectId].elements, [{ id: 'e1', manual: true }]);
  var s1 = await h.post('owner', { action: 'map-sync', siteId: id }), s2 = await h.post('owner', { action: 'map-sync', siteId: id }); assert.equal(s1.body.revision, s2.body.revision); assert.equal(s1.body.map.state, 'review-needed');
  assert(!/evcs|@/i.test(o1.body.url.split('?')[1].replace(/return=[^&]*/, '')), 'URL carries opaque selectors only');
});
test('T21 locked / unavailable / failed tool: honest status, context kept, retryable, no fabricated result', async function () {
  var h = env({ gridatlas: false }); await imp(h, 'COMPUTE_DC_intake_SYNTHETIC.xlsx', WB1); var id = Object.keys(h.store.data).filter(function (k) { return /asset_sites\/[^/]+$/.test(k); })[0].split('/').pop();
  var lk = await h.post('owner', { action: 'handoff', siteId: id, tool: 'gridatlas' }); assert.equal(lk.body.ok, false); assert.equal(lk.body.status, 'locked');
  assert.equal((await h.post('owner', { action: 'handoff', siteId: id, tool: 'nope' })).statusCode, 400);
  var fb = await h.post('owner', { action: 'handoff', siteId: id, tool: 'fiber' }), fr = await h.post('owner', { action: 'handoff-result', handoffId: fb.body.handoffId, status: 'no-coverage', data: { distanceM: 12 } });
  assert.equal(fr.body.result.result, null); assert.equal(fr.body.result.retryable, true); assert.equal(fr.body.result.status, 'no-coverage');
  assert.equal((await h.get('owner', { handoff: fb.body.handoffId })).body.handoff.context.name != null, true);
  var fs = require('fs'), path = require('path'), reg = fs.readFileSync(path.join(__dirname, '../../omega-tools.js'), 'utf8');
  Object.keys(HO.TOOLS).forEach(function (k) { var t = HO.TOOLS[k]; if (t.registryKey) assert(new RegExp('\\b' + t.registryKey + '\\b').test(reg), 'registry key ' + t.registryKey); var f = t.route.split('?')[0].replace(/^\//, ''); assert(fs.existsSync(path.join(__dirname, '../..', t.api ? f + '.js' : f)), 'route ' + t.route); });
});
test('T22 bill with mismatched meter / unreadable fields → review queue, cannot satisfy the gate', async function () {
  var L = await loaded(), h = L.h, id = L.analysis.shortlist.siteIds[2]; h.store.data['omega_orgs/' + ORG + '/asset_sites/' + id].meters = ['M-1'];
  var b = await h.post('owner', { action: 'bill-save', siteId: id, manual: true, entered: { periodStart: '2026-01-01', periodEnd: '2026-02-01', meterId: 'M-9', kwh: 1000, totalUsd: 150 } });
  assert.equal(b.body.bill.state, 'entered'); assert(b.body.bill.problems.indexOf('BILL_METER_MISMATCH') >= 0);
  var u = await h.post('owner', { action: 'bill-save', siteId: id, entered: { kwh: 'abc' } }); assert.equal(u.statusCode, 400);
  var nr = await h.post('owner', { action: 'bill-save', siteId: id, extraction: { source: 'ocr', confidence: 0.4 }, entered: { kwh: 5 } }); assert(nr.body.bill.problems.indexOf('NO_EVIDENCE') >= 0);
  var rv = await h.post('owner', { action: 'bill-review', billId: b.body.bill.id, accept: true }); assert.equal(rv.body.ok, false);
  assert.equal((await h.get('owner', { bills: 1 })).body.bills.length, 2);
  var g = R.gates({ site: { meters: ['M-1'] }, bills: [b.body.bill], mapLink: null, canPublish: true }); assert(g.codes.some(function (c) { return c.code === 'BILL_METER_MISMATCH'; })); assert(g.codes.some(function (c) { return c.code === 'BILLS_NOT_REVIEWED'; }));
});

async function readySite() {
  var L = await loaded(), h = L.h, id = L.analysis.shortlist.siteIds[0], P2 = 'omega_orgs/' + ORG + '/asset_sites/' + id;
  h.store.data[P2].meters = ['M-1'];
  var o = await h.post('owner', { action: 'handoff', siteId: id, tool: 'editor', createProject: true }); h.store.data['projects/' + o.body.projectId].elements = [{ id: 'pad' }];
  await h.post('owner', { action: 'map-sync', siteId: id, markReviewed: true });
  var ag = await h.post('owner', { action: 'agreement-upsert', siteId: id, agreement: { type: 'host_site', signed: true, computePermitted: true, reviewStatus: 'reviewed', endDate: '2035-01-01' } }); assert.equal(ag.statusCode, 200, JSON.stringify(ag.body));
  await h.post('owner', { action: 'power-evidence', siteId: id, expectedRevision: site(h, id).revision, limits: { approvedImport: { kw: 500 } }, baselineKw: 180, reserveKw: 20, review: { signedBy: 'PE', validUntil: '2027-10-01' } });
  var b = await h.post('owner', { action: 'bill-save', siteId: id, manual: true, entered: { periodStart: '2026-01-01', periodEnd: '2026-02-01', meterId: 'M-1', kwh: 1000, totalUsd: 150 } });
  assert.equal((await h.post('owner', { action: 'bill-review', billId: b.body.bill.id, accept: true })).body.state, 'accepted');
  var sc = await h.post('owner', { action: 'scenario-run', siteId: id, overrides: SYN, startDate: '2027-01-01' }); assert.equal(sc.statusCode, 200, JSON.stringify(sc.body)); assert(sc.body.ok, JSON.stringify(sc.body));
  return { h: h, id: id, scenario: sc.body.result };
}
test('T23 map absent / blank / bills unreviewed → submission denied server-side with codes', async function () {
  var L = await loaded(), h = L.h, id = L.analysis.shortlist.siteIds[0];
  var p = await h.post('owner', { action: 'package-prepare', siteId: id }); var codes = p.body.package.gates.codes.map(function (c) { return c.code; });
  ['MAP_MISSING_OR_EMPTY', 'BILLS_NOT_REVIEWED', 'SITE_CONTROL_REVIEW_REQUIRED', 'FINANCIAL_SCENARIO_STALE'].forEach(function (c) { assert(codes.indexOf(c) >= 0, c); });
  var s = await h.post('owner', { action: 'package-submit', packageId: p.body.package.id, confirm: true }); assert.equal(s.statusCode, 409); assert(/MAP_MISSING_OR_EMPTY/.test(s.body.error || JSON.stringify(s.body)));
  await h.post('owner', { action: 'handoff', siteId: id, tool: 'editor', createProject: true }); await h.post('owner', { action: 'map-sync', siteId: id });
  var p2 = await h.post('owner', { action: 'package-prepare', siteId: id }); assert(p2.body.package.gates.codes.some(function (c) { return c.code === 'MAP_MISSING_OR_EMPTY'; }), 'blank map is not a map');
});
test('T24 complete reviewed package → exactly one private submission after explicit authorization', async function () {
  var S = await readySite(), h = S.h, p = await h.post('owner', { action: 'package-prepare', siteId: S.id, scenarioId: S.scenario.scenarioId });
  assert(p.body.package.gates.ok, JSON.stringify(p.body.package.gates.codes));
  assert.equal((await h.post('owner', { action: 'package-submit', packageId: p.body.package.id })).statusCode, 400, 'confirm required');
  assert.equal((await h.post('member', { action: 'package-submit', packageId: p.body.package.id, confirm: true })).statusCode, 403);
  var s1 = await h.post('owner', { action: 'package-submit', packageId: p.body.package.id, confirm: true }), s2 = await h.post('owner', { action: 'package-submit', packageId: p.body.package.id, confirm: true });
  assert.equal(s1.statusCode, 200, JSON.stringify(s1.body)); assert.equal(s2.body.duplicate, true); assert.equal(key(h, /asset_submissions\//).length, 1);
  assert.equal(s1.body.submission.publication.state, 'not-published'); assert(/partial/i.test(s1.body.submission.snapshot.partialHistory));
});
test('T25 changing a bill / map / agreement after analysis marks outputs and package stale; nothing republished', async function () {
  var S = await readySite(), h = S.h, p = await h.post('owner', { action: 'package-prepare', siteId: S.id, scenarioId: S.scenario.scenarioId });
  await h.post('owner', { action: 'agreement-upsert', siteId: S.id, agreement: { type: 'host_site', notes: 'amended' } });
  var pk = h.store.data['omega_orgs/' + ORG + '/asset_packages/' + p.body.package.id]; assert.equal(pk.status, 'stale'); assert.equal(pk.staleReason, 'agreement');
  assert.equal(h.store.data['omega_orgs/' + ORG + '/asset_results/' + S.scenario.id].status, 'stale');
  assert.equal((await h.post('owner', { action: 'package-submit', packageId: p.body.package.id, confirm: true })).statusCode, 409);
  assert.deepEqual(R.invalidates('map'), ['design', 'package']); assert(R.invalidates('bill').indexOf('finance') >= 0);
});

/* ── Phase 4: economics ──────────────────────────────────────────────── */
test('T27 portfolio IRR from aggregated dated flows, never averaged', function () {
  var a = [{ date: '2027-01-01', amount: -100 }, { date: '2028-01-01', amount: 130 }], b = [{ date: '2027-07-01', amount: -1000 }, { date: '2029-07-01', amount: 1100 }];
  var pf = E.portfolio([{ flows: a }, { flows: b }]), ia = E.xirr(a).irr, ib = E.xirr(b).irr;
  assert.equal(pf.irr.status, 'ok'); assert(Math.abs(pf.irr.irr - (ia + ib) / 2) > 0.01); assert.equal(pf.method, 'aggregated dated cash flows');
  var chk = pf.flows.reduce(function (s, f) { return s + f.amount / Math.pow(1 + pf.irr.irr, (Date.parse(f.date) - Date.parse('2027-01-01')) / (365 * 864e5)); }, 0); assert(Math.abs(chk) < 1e-6);
});
test('T28 no root / multiple roots / missing costs: disclosed, never 0% or a positive return', function () {
  var none = E.xirr([{ date: '2027-01-01', amount: 100 }, { date: '2028-01-01', amount: 100 }]); assert.equal(none.status, 'not-defined'); assert.equal(none.irr, undefined);
  var multi = E.periodIrr([-100, 230, -132]); assert.equal(multi.status, 'ambiguous'); assert.equal(multi.roots.length, 2);
  var inc = E.legacyPod({ itKwPerPod: 75, pue: 1.2 }); assert.equal(inc.status, 'incomplete'); assert(inc.missing.indexOf('podCapex') >= 0); assert.equal(inc.projectIrr, undefined);
  assert.equal(E.npv([1, 2], null).status, 'not-defined');
});
test('Scenarios: legacy vs IQGEN-shaped set side by side; legacy analysis untouched; portfolio IRR via gateway', async function () {
  var S = await readySite(), h = S.h, ak = key(h, /asset_analyses\//)[0], before = JSON.stringify(h.store.data[ak]);
  var set = { kind: 'iqgen-hardware-v1', itCeilingKw: 100, reservedOverhead: 0.1, pricingBasis: 'On-Demand', capexMid: 900000, selectedChipset: 'SYN-8', chipsets: [{ name: 'SYN-8', gpusPerNode: 8, nodeKw: 10, onDemandPerNodeHr: 16, spotPerNodeHr: null }], caveats: [] };
  h.store.data['omega_orgs/' + ORG + '/asset_assumption_sets/iqgen_syn'] = { id: 'iqgen_syn', kind: set.kind, set: set };
  var q = await h.post('owner', { action: 'scenario-run', siteId: S.id, assumptionSet: 'iqgen', assumptionSetId: 'iqgen_syn', overrides: SYN, pods: 1, startDate: '2027-01-01', scenarioId: 'sc_iqgen' });
  assert(q.body.ok, JSON.stringify(q.body)); assert.equal(q.body.result.hardware.nodes, 9); assert.equal(q.body.result.assumptionSet.kind, 'iqgen-hardware-v1');
  assert.equal(JSON.stringify(h.store.data[ak]), before, 'WB2 legacy assumptions never overwritten');
  var spot = await h.post('owner', { action: 'scenario-run', siteId: S.id, assumptionSet: 'iqgen', assumptionSetId: 'iqgen_syn', overrides: SYN, pods: 1 }); assert(spot.body.ok);
  var pi = await h.post('owner', { action: 'portfolio-irr', siteIds: [S.id, 'missing-site'] }); assert.equal(pi.body.method, 'aggregated dated cash flows'); assert.deepEqual(pi.body.sitesMissing, ['missing-site']);
  assert.equal((await h.post('viewer', { action: 'scenario-run', siteId: S.id })).statusCode, 403);
});

/* ── CRM ─────────────────────────────────────────────────────────────── */
test('CRM on the register: account link, pipeline stage, activity, follow-up task; tenant-private', async function () {
  var L = await loaded(), h = L.h, id = L.analysis.shortlist.siteIds[0];
  h.store.data['omega_orgs/' + ORG + '/customers/acme'] = { name: 'Acme Host' }; h.store.data['omega_orgs/' + ORG + '/customers/acme/contacts/c1'] = { name: 'Dana', email: 'dana@example.com', primary: true };
  assert.equal((await h.post('owner', { action: 'crm-link', siteId: id, customerId: 'nope' })).statusCode, 404);
  assert.equal((await h.post('owner', { action: 'crm-link', siteId: id, stage: 'bogus' })).statusCode, 400);
  var l = await h.post('member', { action: 'crm-link', siteId: id, customerId: 'acme', stage: 'proposal' }); assert.equal(l.body.crm.stage, 'proposal');
  var a = await h.post('member', { action: 'activity-log', siteId: id, type: 'call', subject: 'Intro', contactId: 'c1', followUpAt: '2026-10-20' }); assert(a.body.ok);
  var c = await h.get('owner', { crm: id }); assert.equal(c.body.contacts[0].name, 'Dana'); assert.equal(c.body.activity.length, 2); assert.equal(c.body.crm.nextFollowUp, '2026-10-20');
  assert.equal(key(h, new RegExp('asset_sites/' + id + '/tasks/fu_')).length, 1);
  var pl = await h.get('owner', { pipeline: 1 }); assert.equal(pl.body.pipeline.filter(function (x) { return x.stage === 'proposal'; })[0].count, 1);
  assert.equal((await h.post('viewer', { action: 'activity-log', siteId: id, type: 'note' })).statusCode, 403);
  assert.equal((await h.get('outsider', { crm: id })).statusCode, 404);
});

/* ── Phase 5 ─────────────────────────────────────────────────────────── */
test('T31 no telemetry connection → no live values, no generated KPIs', async function () {
  var L = await loaded(), r = await L.h.get('owner', { performance: 1 }); assert.equal(r.body.status, 'no-live-connection'); assert.equal(r.body.kpis, null); assert.deepEqual(r.body.connectors, []);
});
test('T32 durable job: browser close pauses with state kept; per-site failure isolated; retry; idempotent start', async function () {
  var L = await loaded(), h = L.h, ids = Array.from(new Set(L.analysis.shortlist.siteIds)).slice(0, 4).concat(['ghost-site']);
  var j = await h.post('owner', { action: 'job-start', kind: 'power-classify', siteIds: ids, idempotencyKey: 'run1' }), again = await h.post('owner', { action: 'job-start', kind: 'power-classify', siteIds: ids, idempotencyKey: 'run1' });
  assert.equal(again.body.duplicate, true);
  var s1 = await h.post('owner', { action: 'job-step', jobId: j.body.job.id, max: 2 }); assert.equal(s1.body.job.status, 'paused'); assert.equal(s1.body.job.done, 2);
  /* "browser closed": a later call resumes from the persisted state */
  var st = (await h.get('owner', { job: j.body.job.id })).body.job; assert.equal(st.done, 2);
  var s2 = await h.post('owner', { action: 'job-step', jobId: j.body.job.id, max: 10 }); assert.equal(s2.body.job.status, 'complete-with-failures'); assert.equal(s2.body.job.done, ids.length - 1); assert.equal(s2.body.job.failed, 1); assert.equal(s2.body.job.items['ghost-site'].status, 'failed');
});

(async function () {
  for (var i = 0; i < queue.length; i++) {
    try { await queue[i][1](); passed++; console.log('PASS ' + queue[i][0]); }
    catch (e) { failed++; console.log('FAIL ' + queue[i][0] + '\n     ' + (e && e.stack || e).split('\n').slice(0, 5).join('\n     ')); }
  }
  console.log('portfolio phases 2-5: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})();
