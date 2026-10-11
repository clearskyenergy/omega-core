/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/site-model.js — a portfolio SITE as the Compute Site Pro Forma's
   input, and the figures the register keeps of its answer
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   The register holds what a workspace knows about a site: its service,
   its chargers, its usage, its power price, the pods it screened for. The
   Compute Site Pro Forma (api/_lib/compute-site.js on the ONE finance
   engine) wants the same facts in its own shape. This is the ONE mapping
   between them, pure, so the site page, the register's bulk run and the
   test read one rule:

     inputFor(site, over, ctx)  → { ok, input }  or  { ok:false, missing[] }
     summaryOf(result, input)   → latestModel, the figures a row shows
     askOf(site)                → the capital request's total project cost

   Read, never invent (the portfolio's rule): a site without a service
   figure, a ZIP or a pod count is NOT modelled on a default — the answer
   names what to enter. The model's own defaults (GPU class, tariff book,
   charging pattern) stand where the site says nothing, and the input the
   run used is stored beside its result so the figure can always be traced.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var CS = require('./compute-site');

/* the model's own lists, never a copy */
var GPU_CLASSES = Object.keys(CS.GPU);
var STRUCTURES = Object.keys(CS.STRUCTURES);
var HOST_TYPES = ['multifamily', 'commercial', 'retail', 'industrial'];
/* the charging pattern a host type implies (compute-site.js EV_PATTERNS) */
var PATTERN = { multifamily: 'overnight', commercial: 'workplace', retail: 'retail', industrial: 'fleet' };

function num(v) { var n = Number(v); return v == null || v === '' || !isFinite(n) ? null : n; }
function pos(v) { var n = num(v); return n != null && n > 0 ? n : null; }
function str(v, max) { return v == null ? '' : String(v).trim().slice(0, max || 160); }
function tags(site) { return (Array.isArray(site.tags) ? site.tags : []).map(function (t) { return String(t).toLowerCase(); }); }

/* The pods a site is sized for: what the run asks, else the stored pod
   pro forma, else the screening proxy. */
function podsOf(site, over) {
  var o = pos(over && over.pods); if (o) return { pods: Math.floor(o), basis: 'entered' };
  var lp = site.latestProforma; if (lp && pos(lp.pods)) return { pods: Math.floor(lp.pods), basis: 'pod pro forma' };
  var sc = site.screening; if (sc && pos(sc.pods)) return { pods: Math.floor(sc.pods), basis: 'screening proxy' };
  return null;
}
/* The service the model balances on: the capacity on record (derated by
   the model's continuous limit), else the available power the record
   carries plus the existing peak it was netted against (already the
   usable figure, so no derating). */
function serviceOf(site) {
  var svc = pos(site.serviceCapacityKw);
  if (svc) return { kw: svc, loadingPct: null, basis: 'service capacity on record' };
  var mw = pos(site.availablePowerMw), peak = num(site.existingPeakKw);
  if (mw && peak != null) return { kw: mw * 1000 + peak, loadingPct: 100, basis: 'available power plus existing peak, as entered' };
  return null;
}
function annualKwhOf(site) {
  var a = pos(site.annualUsageKwh); if (a) return a;
  var m = Array.isArray(site.monthlyUsageKwh) ? site.monthlyUsageKwh : null;
  if (!m || m.some(function (x) { return x == null; })) return null;
  var s = 0; m.forEach(function (x) { s += Number(x) || 0; }); return s > 0 ? s : null;
}
/* ports from the chargers' nameplate: DC fast charging by tag or a large
   nameplate, Level 2 otherwise */
function evOf(site, hostType) {
  var kw = pos(site.installedKw), t = tags(site), dc = t.indexOf('dcfc') >= 0 || (kw != null && kw >= 150 && t.indexOf('l2') < 0);
  var per = dc ? 150 : 11.5, ports = kw ? Math.max(1, Math.round(kw / per)) : 0;
  return { ports: ports, kwPerPort: per, existing: true, pattern: PATTERN[hostType] || 'overnight', basis: kw ? (dc ? 'DC fast chargers' : 'Level 2 chargers') + ' from ' + kw + ' kW nameplate' : 'no chargers on record' };
}

/* inputFor(site, over, ctx): the model's input, or what is missing.
   over = { pods, gpuClass, structure, zip, hostType, label } from the run;
   ctx = { orgName } */
function inputFor(site, over, ctx) {
  site = site || {}; over = over || {}; ctx = ctx || {};
  var missing = [];
  var zip = str(over.zip || site.zip, 10);
  if (!/^\d{5}(-\d{4})?$/.test(zip)) missing.push('the site’s five-digit ZIP code (the tariff book and the climate are read from it)');
  var svc = serviceOf(site);
  if (!svc) missing.push('the service capacity (kW), or the available power (MW) together with the existing peak (kW)');
  var pods = podsOf(site, over);
  if (!pods) missing.push('a pod count: run the pod pro forma, or enter the pods to model');
  var hostType = HOST_TYPES.indexOf(over.hostType) >= 0 ? over.hostType : HOST_TYPES.indexOf(site.hostType) >= 0 ? site.hostType : 'multifamily';
  var gpu = GPU_CLASSES.indexOf(over.gpuClass) >= 0 ? over.gpuClass : 'h200';
  var structure = STRUCTURES.indexOf(over.structure) >= 0 ? over.structure : 'own';
  if (missing.length) return { ok: false, missing: missing };
  var annual = annualKwhOf(site), price = pos(site.powerPricePerKwh), ev = evOf(site, hostType), cm = site.commercial || {};
  var input = {
    site: { name: str(site.name, 120) || 'Site', host: str(site.name, 160), hostType: hostType, city: str(site.city, 80), zip: zip.slice(0, 5),
            street: str(site.address, 160), sponsor: str(ctx.orgName, 120) },
    service: { kw: svc.kw },
    load: annual ? { annualKwh: annual } : {},
    ev: { ports: ev.ports, kwPerPort: ev.kwPerPort, existing: true, pattern: ev.pattern },
    compute: { pods: pods.pods, gpuClass: gpu },
    battery: { kw: 0, kwh: 0 },
    deal: { structure: structure }
  };
  if (svc.loadingPct != null) input.service.loadingPct = svc.loadingPct;
  if (price) input.tariff = { onPeakRate: price, offPeakRate: price };
  if (pos(cm.rentMonthly)) input.deal.rentPerYear = pos(cm.rentMonthly) * 12;
  var basis = { service: svc.basis, pods: pods.basis, chargers: ev.basis, load: annual ? 'annual usage on record' : 'a typical ' + hostType + ' load (none on record)',
                tariff: price ? 'the site’s power price as a flat rate' : 'the planning rate book for the ZIP', gpuClass: gpu, structure: structure };
  return { ok: true, input: input, basis: basis };
}

/* summaryOf(result, input, meta): what the site keeps of a run. Every
   figure is the engine's own; a lease with no capital has no IRR and says
   so by null. */
function summaryOf(result, input, meta) {
  meta = meta || {};
  var pf = result && result.proforma || null, m = pf && pf.metrics || {}, su = pf && pf.sourcesUses || {}, who = result && result.structure || {};
  var deals = {};
  Object.keys(result && result.deals || {}).forEach(function (k) {
    var d = result.deals[k];
    deals[k] = { label: d.label, capital: d.capital, equity: d.equity, irr: d.irr, npv: d.npv, payback: d.payback, year1: d.year1 };
  });
  var v = result && result.verdict || {};
  return {
    modelId: meta.modelId || null, at: meta.at || null, by: meta.by || null, label: meta.label || '',
    version: result && result.version || null, financeVersion: pf && pf.version || null,
    structure: who.key || null, structureLabel: who.label || null,
    pods: result && result.compute ? result.compute.pods : null, gpuClass: result && result.compute ? result.compute.gpuClass : null,
    gpuName: result && result.compute ? result.compute.gpuName : null, gpus: result && result.compute ? result.compute.gpus : null,
    serviceKw: result && result.service ? result.service.kw : null, limitKw: result && result.service ? result.service.limitKw : null,
    irr: m.afterTaxIrr == null ? null : m.afterTaxIrr, preTaxIrr: m.preTaxIrr == null ? null : m.preTaxIrr,
    npv: m.npv == null ? null : m.npv, paybackYears: m.paybackYears == null ? null : m.paybackYears,
    totalReturns: m.totalReturns == null ? null : m.totalReturns, moic: m.moic == null ? null : m.moic,
    levered: !!m.levered, dscrMin: m.dscrMin == null ? null : m.dscrMin,
    totalProjectCost: su.totalUses == null ? null : su.totalUses, capex: pf && pf.capex ? pf.capex.total : null,
    equity: su.equity == null ? null : su.equity, debt: su.debt == null ? null : su.debt,
    year1: deals[who.key] ? deals[who.key].year1 : null, termYears: pf && pf.inputs ? pf.inputs.years : null,
    verdict: { label: v.label || null, act: v.act || null, tone: v.tone || null, gate: v.gate || null },
    confidence: result && result.confidence || null,
    deals: deals, title: result && result.story ? result.story.title : null,
    zip: input && input.site ? input.site.zip : null, hostType: input && input.site ? input.site.hostType : null
  };
}

/* The capital request: total project cost from the compute model when one
   has run, else the pod pro forma's investor capital. Says where it came
   from; null when neither is on file. */
function askOf(site) {
  site = site || {};
  var lm = site.latestModel, lp = site.latestProforma;
  if (lm && pos(lm.totalProjectCost)) return { amount: lm.totalProjectCost, source: 'compute-model', equity: lm.equity, debt: lm.debt, irr: lm.irr, structure: lm.structure, structureLabel: lm.structureLabel, termYears: lm.termYears, pods: lm.pods, modelId: lm.modelId, at: lm.at };
  if (lp && pos(lp.investorCapital)) return { amount: lp.investorCapital, source: 'pod-proforma', equity: lp.investorCapital, debt: 0, irr: lp.investorIrrDefined ? lp.investorIrrAnnual : null, structure: null, structureLabel: 'Investor capital, pods (60-month case)', termYears: 5, pods: lp.pods, scenarioId: lp.scenarioId, at: lp.at };
  return null;
}

module.exports = { inputFor: inputFor, summaryOf: summaryOf, askOf: askOf, podsOf: podsOf, serviceOf: serviceOf, evOf: evOf,
  GPU_CLASSES: GPU_CLASSES, STRUCTURES: STRUCTURES, HOST_TYPES: HOST_TYPES };
