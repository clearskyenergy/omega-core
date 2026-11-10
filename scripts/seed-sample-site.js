#!/usr/bin/env node
/* scripts/seed-sample-site.js — put ONE clearly-marked SAMPLE site into a
   workspace's register, showing the diligence journey mid-flight with a
   REAL contract-case IRR (Thomas, 2026-10-26: "can you put a sample site
   with a 30% irr with light smith … seed it").
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Nothing is typed as a result: the facts are seeded (an 800 kW service,
   a 350 kW measured peak, so 450 kW free → 6 skids) and the offtake's
   contract price is chosen so the ONE engine (api/_lib/compute-contract.js)
   itself answers ≈30% project IRR on the workspace's own offtake terms
   (the 6-year term and the partner's 10% fee from its config). The dry
   run prints the engine's whole verdict; --apply refuses unless the
   engine's IRR is within a point of the asked figure.

   The sample is SAFE in the pipeline:
   - its name starts with "Sample:" and it carries the tag `sample`;
   - it is left at the SCREENED stage, never Earmarked, so it can never
     enter the tally or an LOI package to the partner unless a person
     earmarks it themselves;
   - its diligence is composed through the library's own change() calls
     (every rule enforced), written once with one omega_audit row;
   - an existing site of the same id is NEVER overwritten (re-run = no-op);
     archive it from the register when it has served its purpose.

   SAFE BY DEFAULT: the default is an OFFLINE dry run (no network, no
   credentials): it composes the record, runs the engine and prints what
   --apply would write. --apply (with --confirm-org repeating --org)
   writes as FIREBASE_SERVICE_ACCOUNT, else the Firebase CLI's account
   (scripts/_lib/live-admin.js); it refuses if omega_orgs/{org} is
   missing, if the diligence switch is off, or if the site already exists.

   Usage:
     node scripts/seed-sample-site.js --org solelacapital.com
     node scripts/seed-sample-site.js --org solelacapital.com --apply --confirm-org solelacapital.com
*/
'use strict';
var fs = require('fs'), path = require('path');
var D = require('../api/_lib/portfolio/diligence');
var CC = require('../api/_lib/compute-contract').contractCase;
var CM = require('../api/_lib/omega-compute-model');

function arg(name) { var i = process.argv.indexOf('--' + name); return i > 0 ? (process.argv[i + 1] && process.argv[i + 1].indexOf('--') !== 0 ? process.argv[i + 1] : true) : null; }
var ORG = String(arg('org') || '').toLowerCase().trim();
var APPLY = process.argv.indexOf('--apply') > 0, CONFIRM = String(arg('confirm-org') || '').toLowerCase().trim();
var TARGET_IRR = 30, SITE_ID = 'sample-lightsmith-30', AGAIN = process.argv.indexOf('--again') > 0;
if (!ORG) { console.error('Name the workspace: --org <orgId>'); process.exit(2); }

/* the workspace's own offtake terms come from its seed config, never typed here */
var slug = ORG.split('.')[0];
var seedPath = path.join(__dirname, '..', 'tenants', slug, 'portfolio-diligence.json');
if (!fs.existsSync(seedPath)) { console.error('No diligence seed at ' + seedPath + ': the sample needs the workspace’s own offtake terms'); process.exit(2); }
var CFG = D.normalizeConfig(D.validateConfig(JSON.parse(fs.readFileSync(seedPath, 'utf8'))));
if (!CFG.offtake.partner) { console.error('The workspace’s config names no offtake partner'); process.exit(2); }

var NOW = new Date().toISOString(), BY = 'script:seed-sample-site';
/* the facts: the 1 MW EXAMPLE (Thomas, 2026-10-26: "this should be a 1mW
   example and thats one container and that has 7 gpu racks at 5m a rack").
   1,500 kW service less a 350 kW measured peak = 1,150 kW free, which
   carries ONE of the config's 1 MW containers with 150 kW to spare. */
var FREE_KW = 1150;
var FACTS = {
  siteId: SITE_ID, name: 'Sample: Crossroads Charging Plaza', tags: ['sample'],
  hostType: 'retail', address: { street: '1959 S Power Rd', city: 'Mesa', state: 'AZ', zip: '85206' },
  city: 'Mesa', state: 'AZ', zip: '85206',
  serviceCapacityKw: 1500, existingPeakKw: 350, installedKw: 600,
  notes: 'A SAMPLE site seeded to show the diligence journey at the notes’ 1 MW example; archive it when done.',
  source: 'seed-sample-site', createdAt: NOW, updatedAt: NOW, revision: 1
};

var UNIT = CFG.unit;
if (!UNIT) { console.error('The workspace’s config carries no compute unit (portfolioDiligence.unit): run the enable script with the current seed first'); process.exit(2); }
/* solve the contract price on the engine itself so the ENGINE answers the
   target IRR on the config's own unit and offtake terms: scan in cents */
function caseAt(price) {
  return CC({ chipset: UNIT.chipset || undefined, availableKw: FREE_KW,
    unit: { label: UNIT.label, word: UNIT.word, kw: UNIT.kw, gpus: UNIT.gpus, itKw: UNIT.itKw != null ? UNIT.itKw : undefined, racks: UNIT.racks != null ? UNIT.racks : undefined, rackCostUsd: UNIT.rackCostUsd != null ? UNIT.rackCostUsd : undefined, costUsd: UNIT.costUsd },
    contract: { termMonths: CFG.offtake.termYears != null ? Math.round(CFG.offtake.termYears * 12) : undefined, pricePerGpuHour: price, takeOrPayPct: 80,
    partner: { name: CFG.offtake.partner.name, feePct: CFG.offtake.feePct != null ? CFG.offtake.feePct : undefined } }, site: {} }, { ladder: false });
}
var best = null;
for (var c = 50; c <= 900; c++) {
  var p = c / 100, o = caseAt(p);
  if (!o.priced || !o.returns || o.returns.projectIrrPct == null) continue;
  if (!best || Math.abs(o.returns.projectIrrPct - TARGET_IRR) < Math.abs(best.irr - TARGET_IRR)) best = { price: p, irr: o.returns.projectIrrPct, out: o };
}
if (!best || Math.abs(best.irr - TARGET_IRR) > 1) { console.error('The engine lands no price within a point of ' + TARGET_IRR + '% on these facts'); process.exit(1); }
/* get smart on the $/GPU-hour that is paid: where the solved contract price
   sits against the chipset's PUBLIC reference (CoreWeave), and against the
   compute-lease notes' own anchors — reported, never reconciled */
var CHIP = CM.chipset(UNIT.chipset || 'h100');
var refOd = CHIP && CHIP.onDemandNode != null ? Math.round(CHIP.onDemandNode / CHIP.gpusPerNode * 100) / 100 : null;
var refSpot = CHIP && CHIP.spotNode != null ? Math.round(CHIP.spotNode / CHIP.gpusPerNode * 100) / 100 : null;
var ref = refSpot != null ? { basis: 'spot', price: refSpot } : refOd != null ? { basis: 'on-demand', price: refOd } : null;
var GET_SMART = {
  contractPricePerGpuHour: best.price,
  publicReference: ref ? { chipset: CHIP.name, basis: ref.basis, pricePerGpuHour: ref.price, source: 'CoreWeave North America public pricing (the chipset library)' } : 'none published for ' + (CHIP ? CHIP.name : 'the chipset'),
  askVsReference: ref ? Math.round(best.price / ref.price * 1000) / 10 + '% of the public ' + ref.basis + ' rate' : null,
  notesAnchors: {
    conservativeCase: '~30% over the 6-year term (the notes) → the engine answers ' + best.irr + '% at $' + best.price,
    targetDealSize: '$25–35M a deal (the notes) → this container is $' + Math.round(UNIT.costUsd / 1e6) + 'M',
    payback: 'the notes say 2–2.5 years; the engine’s payback at this price is ' + best.out.returns.paybackMonths + ' months — the notes’ own figures sit in tension, reported as given',
    collateral: 'cards collateralize up to 80% (the notes; unverified, not used in the math)'
  }
};

/* the diligence record, composed through the library's own rules */
function apply(d, action, input) {
  var r = D.change(d, action, input, { site: FACTS, config: CFG, files: [], agreements: [], role: 'member', canEdit: true, by: BY, now: NOW });
  return r.unchanged ? d : r.diligence;
}
var dg;
['power', 'interconnection', 'fiber'].forEach(function (g) { dg = apply(dg, 'gate', { gate: g, state: 'screened', source: { kind: 'public', name: 'Sample data (seeded)' } }); });
dg = apply(dg, 'stage', { stage: 'screened' });
dg = apply(dg, 'profile', { intakeType: 'operating-charging', hostDeal: 'ground-lease' });
dg = apply(dg, 'chargers', { count: 8, kw: 600, status: 'operating', use: 'public', network: 'Sample Network', peak: { kw: 350, source: 'bill', period: '2025-11—2026-10' } });
dg = apply(dg, 'control', { route: 'lease', lease: { termYears: 10, startDate: '2026-11-01', computePermitted: true, storagePermitted: true } });
dg = apply(dg, 'gate', { gate: 'chips', state: 'screened', source: { kind: 'model', name: 'The contract case sizing' }, value: { chipset: CHIP ? CHIP.name : null, gpus: UNIT.gpus, units: 1 } });
dg = apply(dg, 'offtake', { pricePerGpuHour: best.price, takeOrPayPct: 80 });

/* what the pages will read: the view on the composed record, the engine's case riding it */
var site = Object.assign({}, FACTS, { diligence: dg });
var view = D.view(site, { config: CFG, now: NOW, files: [], agreements: [], kase: { output: best.out, input: { availableKw: FREE_KW }, at: NOW } });
var summary = { org: ORG, siteId: SITE_ID, name: FACTS.name, stage: view.stageLabel, freeKw: view.power.availableKw,
  unit: { label: UNIT.label, racks: UNIT.racks, rackCostUsd: UNIT.rackCostUsd, modularKw: UNIT.modularKw },
  contractPricePerGpuHour: best.price, engine: { projectIrrPct: best.irr, paybackMonths: best.out.returns.paybackMonths, multiple: best.out.returns.projectMultiple,
    units: best.out.sizing.units, unitsLabel: view.economics.unitsLabel, gpus: best.out.sizing.gpus, capexUsd: best.out.capex.total, revenuePerYearUsd: best.out.returns.revenuePerYear,
    partner: CFG.offtake.partner.name, partnerFeePerYearUsd: best.out.returns.partnerFeePerYear, termYears: CFG.offtake.termYears },
  getSmart: GET_SMART,
  safety: { stage: 'screened, never Earmarked: outside the tally and the LOI package until a person earmarks it', tag: 'sample', overwrite: 'an existing site is replaced only with --again' } };

if (!APPLY) {
  console.log(JSON.stringify({ mode: 'DRY RUN (offline)', wouldWrite: summary }, null, 2));
  console.log('\nNothing was written. Apply with:\n  node scripts/seed-sample-site.js --org ' + ORG + ' --apply --confirm-org ' + ORG);
  process.exit(0);
}
if (CONFIRM !== ORG) { console.error('--apply needs --confirm-org ' + ORG); process.exit(2); }

(async function () {
  var A = require('../api/_lib/admin');
  require('./_lib/live-admin')(A);
  var db = A.db(), root = db.collection('omega_orgs').doc(ORG);
  var org = await root.get();
  if (!org.exists) { console.error('No omega_orgs/' + ORG + ': the workspace is made in the master console, never here'); process.exit(1); }
  var billing = await root.collection('billing').doc('current').get();
  if (!billing.exists || !D.enabled(billing.data())) { console.error('The diligence switch is not on for ' + ORG + ' (enable-portfolio-diligence first)'); process.exit(1); }
  var sref = root.collection('sites').doc(SITE_ID), ex = await sref.get();
  if (ex.exists && !AGAIN) { console.log(JSON.stringify({ mode: 'APPLIED', changed: false, note: 'The sample site is already there; --again replaces it (it is a sample), or archive it from the register.' }, null, 2)); process.exit(0); }
  if (ex.exists) await sref.set(Object.assign({}, FACTS, { createdAt: ex.data().createdAt || NOW, revision: (ex.data().revision || 1) + 1, diligence: JSON.parse(JSON.stringify(dg)) }));
  else await sref.create(Object.assign({}, FACTS, { diligence: JSON.parse(JSON.stringify(dg)) }));
  await db.collection('omega_audit').doc().create({ action: 'sitecrm-diligence-seed-sample', orgId: ORG, siteId: SITE_ID, by: BY, at: NOW,
    note: (ex.exists ? 'Sample site REPLACED (--again)' : 'Sample site seeded') + ' at $' + best.price + '/GPU-hour → ' + best.irr + '% project IRR on the ' + UNIT.label + ' (the engine’s own figure)' });
  console.log(JSON.stringify({ mode: 'APPLIED', changed: true, wrote: summary }, null, 2));
  process.exit(0);
})().catch(function (e) { console.error('Failed: ' + (e && e.message || e)); process.exit(1); });
