/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/portfolio/size.js — one site through the existing sizing engine
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   PURE orchestration. No sizing arithmetic lives here: the numbers come
   from api/_lib/bess-engine.js (the same sweep the storefront and the
   editor use), the equipment from api/_lib/product-fit.js against the
   tenant's design catalog, the screening-only load estimate from
   api/_lib/site-score.js. This module decides WHICH engine path the data
   allows (quality.js already said how far the claim may go), applies the
   electrical limits the site supplied, and writes every assumption down.

   The three engine paths, in the order the evidence prefers:
     interval, complete year  → sizeFromInterval            (detailed-capable)
     interval, partial year   → ~30-day blocks → sizeFromMonthly (preliminary)
     billed months            → sizeFromMonthly              (preliminary)
     annual / peak / building → synthetic months → sizeFromMonthly, reported
                                as a RANGE only                 (screening)
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var E = require('../bess-engine'), FIT = require('../product-fit'), Q = require('./quality'), V = require('./interval');
var SITE = null; try { SITE = require('../site-score'); } catch (e) { SITE = null; }

var STATUS = { detailed: 'Detailed Size Complete', preliminary: 'Preliminary Size Complete', screening: 'Screening Estimate', unable: 'Unable to Size' };
var CLEARANCE_FT = 5, CONTINUOUS = 0.8; /* NEC continuous-load convention for a service or transformer ceiling */

function prov(value, units, kind, why, source) { return { value: value, units: units || null, kind: kind, confidence: kind === 'supplied' ? 'high' : kind === 'calculated' ? 'medium' : 'low', note: why || null, source: source || null }; }
function round(n, d) { var p = Math.pow(10, d || 0); return Math.round(n * p) / p; }

/* The tariff the engine runs on, and what was assumed to build it. */
function tariffFor(site, tenantCost, assumptions, sources) {
  var t = {}, d = E.defaultTariff();
  if (Q.has(site, 'demandChargePerKw')) { t.demandChargePerKw = Math.min(200, Q.val(site, 'demandChargePerKw')); sources.push(site.fields.demandChargePerKw.source); }
  else assumptions.push('Demand charge assumed at ' + d.demandChargePerKw + ' $/kW-month (no tariff supplied)');
  if (Q.has(site, 'energyRate')) { t.energyRate = Math.min(2, Q.val(site, 'energyRate')); sources.push(site.fields.energyRate.source); }
  else assumptions.push('Energy rate assumed at ' + d.energyRate + ' $/kWh (no tariff supplied)');
  if (tenantCost && tenantCost.capexPerKwh > 0) t.capexPerKwh = tenantCost.capexPerKwh; else assumptions.push('Installed cost assumed at ' + d.capexPerKwh + ' $/kWh + ' + d.capexPerKw + ' $/kW (no supplier cost basis)');
  if (tenantCost && tenantCost.capexPerKw > 0) t.capexPerKw = tenantCost.capexPerKw;
  return t;
}

/* Service, transformer and interconnection limits, as a kW ceiling. */
function limits(site) {
  var out = [], f = site.fields || {};
  if (Q.has(site, 'interconnectionLimitKw')) out.push({ key: 'interconnection', label: 'Interconnection limit', kw: Q.val(site, 'interconnectionLimitKw'), source: f.interconnectionLimitKw.source });
  if (Q.has(site, 'transformerKva')) out.push({ key: 'transformer', label: 'Transformer ' + Q.val(site, 'transformerKva') + ' kVA × ' + CONTINUOUS, kw: round(Q.val(site, 'transformerKva') * CONTINUOUS, 0), source: f.transformerKva.source });
  if (Q.has(site, 'mainServiceA') && Q.has(site, 'serviceVoltage')) {
    var ph = Q.has(site, 'phase') ? Q.val(site, 'phase') : 3, kva = Q.val(site, 'serviceVoltage') * Q.val(site, 'mainServiceA') * (ph === 1 ? 1 : Math.sqrt(3)) / 1000;
    out.push({ key: 'service', label: 'Main service ' + Q.val(site, 'mainServiceA') + ' A at ' + Q.val(site, 'serviceVoltage') + ' V (' + round(kva, 0) + ' kVA) × ' + CONTINUOUS, kw: round(kva * CONTINUOUS, 0), source: f.mainServiceA.source });
  }
  return out;
}

function screeningRows(site, assumptions, sources) {
  var peak = null, annual = null, f = site.fields || {};
  if (Q.has(site, 'peakKw')) { peak = Q.val(site, 'peakKw'); sources.push(f.peakKw.source); }
  if (Q.has(site, 'annualKwh')) { annual = Q.val(site, 'annualKwh'); sources.push(f.annualKwh.source); }
  if (peak == null && SITE && Q.has(site, 'buildingSqft') && Q.has(site, 'buildingType')) {
    var m = SITE.modelLoad({ type: Q.val(site, 'buildingType'), sqft: Q.val(site, 'buildingSqft') }, {});
    if (m && m.peakKw > 0) { peak = m.peakKw; annual = annual != null ? annual : (m.annualKwh && m.annualKwh.value) || null; assumptions.push('Load ESTIMATED from ' + Q.val(site, 'buildingSqft') + ' sq ft of ' + Q.val(site, 'buildingType') + ' (EUI model): peak ' + round(peak, 0) + ' kW' + (m.reason ? ' — ' + m.reason : '')); }
  }
  if (!(peak > 0)) return null;
  if (annual == null) { annual = peak * 8760 * 0.45; assumptions.push('Annual kWh assumed from a 45% load factor (no consumption supplied)'); }
  else assumptions.push('Monthly consumption assumed flat at one twelfth of the annual figure; the billed peak applied to every month');
  var rows = []; for (var i = 0; i < 12; i++) rows.push({ month: i, demandKw: peak, kwh: annual / 12 });
  return rows;
}

function bestFit(products, kw, kwh) {
  var fits = FIT.fitProducts(products || [], kw, kwh);
  if (!fits.length) return null;
  var f = fits[0], p = f.p;
  return { sku: String(p.sku || ''), name: String(p.name || p.sku || ''), qty: f.qty, unitKw: +p.kw || 0, unitKwh: +p.kwh || 0, totalKw: round(f.totKw, 0), totalKwh: round(f.totKwh, 0),
    widthFt: +p.widthFt || null, depthFt: +p.depthFt || null, integrates: p.integrates || {}, chemistry: p.chemistry || null, oversupply: round(f.over, 2),
    alternatives: fits.slice(1, 3).map(function (g) { return { sku: String(g.p.sku || ''), name: String(g.p.name || g.p.sku || ''), qty: g.qty, totalKw: round(g.totKw, 0), totalKwh: round(g.totKwh, 0) }; }) };
}

/* site: ingest record (+ site.interval from interval.js, site.intervalValues when loaded)
   quality: quality.assess(site)
   opts: { products: catalog designs, tenantCost: {capexPerKwh, capexPerKw}, now } */
function size(site, quality, opts) {
  opts = opts || {}; var assumptions = [], sources = [], required = [], f = site.fields || {};
  if (quality.level === 'insufficient') return { status: 'unable', statusLabel: STATUS.unable, reason: 'Not enough load information to run the sizing engine', assumptions: [], sources: [], required: quality.requests, confidence: { score: 0, label: 'none' } };
  var tariff = tariffFor(site, opts.tenantCost, assumptions, sources), res = null, path = null, rows = null;
  var engineOpts = { tariff: tariff };
  if (Q.has(site, 'durationHours')) { engineOpts.peakHours = Math.min(12, Q.val(site, 'durationHours')); assumptions.push('Peak event duration taken as the requested ' + engineOpts.peakHours + ' h discharge duration'); }
  if (site.interval && site.interval.ok && Array.isArray(site.intervalValues) && site.intervalValues.length >= 24) {
    if (site.interval.completeYear) { res = E.sizeFromInterval(site.intervalValues, { tariff: tariff, intervalMin: site.interval.intervalMin }); path = 'interval'; sources.push({ file: site.interval.file || null, field: 'load column', units: 'kW' }); }
    else { rows = V.toBlocks(site.intervalValues, site.interval.intervalMin); path = 'interval-partial'; assumptions.push('Interval data covers ' + site.interval.days + ' days: folded into 30-day blocks and sized like billed months'); sources.push({ file: site.interval.file || null, field: 'load column', units: 'kW' }); }
  }
  if (!res && !rows && Array.isArray(site.months) && site.months.length) { rows = site.months.map(function (m) { return { month: m.month, demandKw: m.demandKw, kwh: m.kwh != null ? m.kwh : 0 }; }); path = 'monthly'; site.months.forEach(function (m) { if (m.source) sources.push(m.source); }); if (site.months.some(function (m) { return m.kwh == null; })) assumptions.push('Some months carry a peak but no kWh; those months are treated as zero consumption for arbitrage'); }
  if (!res && !rows) { rows = screeningRows(site, assumptions, sources); path = 'screening'; }
  if (!res && rows) res = E.sizeFromMonthly(rows, engineOpts);
  if (!res || !res.ok) return { status: 'unable', statusLabel: STATUS.unable, reason: (res && res.error) || 'The sizing engine could not size this load', assumptions: assumptions, sources: sources, required: quality.requests, confidence: { score: 0, label: 'none' }, path: path };
  var sum = E.summarize(res);
  if (!sum || !(sum.kw > 0)) return { status: 'unable', statusLabel: STATUS.unable, reason: 'The load has no shavable peak at these tariff rates', assumptions: assumptions, sources: sources, required: quality.requests, confidence: { score: 0, label: 'none' }, path: path };

  var status = quality.level === 'detailed' && path === 'interval' ? 'detailed' : (quality.level === 'screening' || path === 'screening') ? 'screening' : 'preliminary';
  if (sum.assumedDuration) assumptions.push('Peak event duration assumed at ' + round(sum.durationH, 1) + ' h (' + res.meta.confidence + ')');
  var derate = res.derate || 0.95;

  /* Electrical ceilings the site told us about. */
  var caps = limits(site), uncappedKw = sum.kw, kw = sum.kw, kwh = sum.kwh, cappedBy = [];
  caps.forEach(function (c) { if (c.kw > 0 && c.kw < kw) { kw = c.kw; cappedBy.push(c); } });
  if (cappedBy.length) { var keepH = sum.durationH || (kwh / uncappedKw); kwh = round(kw * keepH / derate, 0); assumptions.push('Power capped at ' + kw + ' kW by ' + cappedBy.map(function (c) { return c.label; }).join(' and ') + '; energy kept at the same duration'); }
  var verification = caps.length ? null : 'Subject to electrical and utility verification: no service rating, transformer capacity or interconnection limit was supplied';
  if (verification) required.push(Q.ASKS.service.label);
  if (!Q.has(site, 'interconnectionLimitKw') && !Q.has(site, 'exportLimitKw')) required.push(Q.ASKS.export.label);

  /* Requirements the customer stated, shown as alternatives rather than overriding the evidence. */
  var alternatives = [];
  (res.sensitivity || []).slice(0, 4).forEach(function (s) { if (s && s.hours) alternatives.push({ label: 'At ' + s.hours + ' h duration', kw: kw, kwh: round(Math.max(kwh * 0.5, s.nameplateKwh), 0) }); });
  if (Q.has(site, 'backupKw') && Q.has(site, 'backupHours')) { var bk = Q.val(site, 'backupKw'), bh = Q.val(site, 'backupHours'), need = round(bk * bh / derate, 0); alternatives.push({ label: 'Backup ' + bk + ' kW for ' + bh + ' h', kw: Math.max(kw, bk), kwh: Math.max(kwh, need), driver: 'backup' }); if (need > kwh) assumptions.push('The stated backup requirement (' + need + ' kWh nameplate) exceeds the demand-charge size; shown as an alternative'); }
  if (Q.has(site, 'evLoadKw')) assumptions.push('Planned EV load of ' + Q.val(site, 'evLoadKw') + ' kW is not in the historical profile; the size does not yet cover it');
  if (Q.has(site, 'solarKw')) assumptions.push('Existing solar of ' + Q.val(site, 'solarKw') + ' kW: solar shifting was not modelled (no production profile)');

  var config = bestFit(opts.products, kw, kwh), fit = null;
  if (config && Q.has(site, 'areaSqft') && config.widthFt && config.depthFt) {
    var need = round(config.qty * (config.widthFt + CLEARANCE_FT) * (config.depthFt + CLEARANCE_FT), 0), have = Q.val(site, 'areaSqft');
    fit = { fits: need <= have, neededSqft: need, availableSqft: have, basis: config.qty + ' × ' + config.widthFt + '×' + config.depthFt + ' ft with ' + CLEARANCE_FT + ' ft clearance' };
  } else if (config) required.push(Q.ASKS.area.label);
  if (!config) required.push('A supplier product that covers ' + kw + ' kW / ' + kwh + ' kWh within ' + FIT.MAX_UNITS + ' units (none in the current catalog)');

  var base = { interval: 85, 'interval-partial': 65, monthly: sum.basis === 'single-bill' ? 35 : 55, screening: 20 }[path] || 20;
  var score = base + (quality.tariffSupplied ? 5 : -5) + (caps.length ? 5 : -5) + ((site.months || []).length >= 12 && path === 'monthly' ? 5 : 0);
  score = Math.max(5, Math.min(95, score));
  var out = {
    status: status, statusLabel: STATUS[status], path: path,
    kw: kw, kwh: kwh, usableKwh: round(kwh * derate, 0), durationH: kw > 0 ? round(kwh * derate / kw, 2) : 0,
    pcsKw: config ? config.totalKw : kw, useCase: Q.val(site, 'objective') || 'Demand-charge reduction',
    peakReductionKw: round(cappedBy.length ? Math.min(sum.shaveKw, kw) : sum.shaveKw, 0), annualPeakKw: res.meta.annualPeak != null ? round(res.meta.annualPeak, 0) : null,
    config: config, fit: fit, constraints: { limits: caps, cappedBy: cappedBy.map(function (c) { return c.key; }), uncappedKw: uncappedKw, verification: verification },
    engine: { basis: sum.basis, confidence: sum.confidence, assumedDuration: sum.assumedDuration, cRateLimited: sum.cRateLimited, feasible: sum.feasible, cyclesYr: sum.cyclesYr, breaches: sum.breaches, savingsYr: sum.savingsYr, capex: sum.capex, paybackYr: sum.paybackYr, derate: derate },
    assumptions: assumptions, sources: sources, required: required, alternatives: alternatives,
    confidence: { score: score, label: score >= 75 ? 'high' : score >= 45 ? 'medium' : 'low' }
  };
  if (status === 'screening') {
    var lo = round(kw * 0.6, 0), hi = round(kw * 1.4, 0);
    out.range = { kwLow: lo, kwHigh: hi, kwhLow: round(kwh * 0.6, 0), kwhHigh: round(kwh * 1.4, 0), note: 'Screening range only — not a recommended size. Supply billed peaks or interval data to size this site.' };
  }
  return out;
}

module.exports = { size: size, limits: limits, bestFit: bestFit, STATUS: STATUS, CONTINUOUS: CONTINUOUS, CLEARANCE_FT: CLEARANCE_FT };
