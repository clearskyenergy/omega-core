/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/portfolio/quality.js — how much a site can be trusted to be sized
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   PURE. Reads the site record ingest.js produced (plus what documents were
   matched) and answers two separate questions:

     completeness  0–100, how much of the useful information is present
     level         detailed | preliminary | screening | insufficient —
                   what the SIZER is allowed to claim

   and lists EXACTLY what is missing, as the customer would supply it. The
   level is decided before the sizer runs, so the sizer cannot promote a
   single bill into a detailed recommendation, and the missing list is the
   same text the "Provide missing information" action asks for.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

var LEVELS = { detailed: 'Detailed sizing', preliminary: 'Preliminary sizing', screening: 'Screening estimate only', insufficient: 'Insufficient data' };

/* The exact requests, keyed so a later upload can satisfy them. */
var ASKS = {
  interval: { key: 'interval', label: 'Interval or 8760 load data (a full year, kW per 15 or 60 minutes)' },
  bills12: { key: 'bills12', label: 'Twelve months of utility bills (monthly kWh and peak kW)' },
  peaks: { key: 'peaks', label: 'Peak-demand history (billed kW for at least six months)' },
  tariff: { key: 'tariff', label: 'Applicable tariff (demand charge $/kW-month and energy rate $/kWh)' },
  service: { key: 'service', label: 'Service rating (main service amps, voltage and phase)' },
  transformer: { key: 'transformer', label: 'Transformer capacity (kVA)' },
  ev: { key: 'ev', label: 'Planned EV-charging load (kW)' },
  backup: { key: 'backup', label: 'Required backup duration (hours) and backup load (kW)' },
  export: { key: 'export', label: 'Export or interconnection limit (kW)' },
  area: { key: 'area', label: 'Site plan or available installation area (sq ft)' },
  objective: { key: 'objective', label: 'Project objective (demand charges, backup, solar shifting, EV, grid services)' },
  address: { key: 'address', label: 'Complete street address, city, state and ZIP' },
  utility: { key: 'utility', label: 'Serving utility' }
};

function has(site, key) { var f = site && site.fields && site.fields[key]; return !!(f && f.value !== '' && f.value != null); }
function val(site, key) { return has(site, key) ? site.fields[key].value : null; }

function assess(site) {
  site = site || {}; var f = site.fields || {}, months = Array.isArray(site.months) ? site.months : [], iv = site.interval || null;
  var score = 0, missing = [], improve = [], notes = [];
  var addressOk = has(site, 'address') && has(site, 'city') && has(site, 'state');
  if (addressOk) score += 15; else missing.push(ASKS.address);
  if (has(site, 'utility')) score += 5; else improve.push(ASKS.utility);
  /* Load: the thing that decides the level. */
  var loadKind = null;
  if (iv && iv.ok && iv.completeYear) { loadKind = 'interval'; score += 30; }
  else if (iv && iv.ok && iv.days >= 30) { loadKind = 'interval-partial'; score += 20; }
  else if (months.length >= 12) { loadKind = 'bills12'; score += 25; }
  else if (months.length >= 6) { loadKind = 'bills6'; score += 18; }
  else if (months.length >= 1) { loadKind = 'bills-few'; score += 10; }
  else if (has(site, 'peakKw') && has(site, 'annualKwh')) { loadKind = 'annual'; score += 10; }
  else if (has(site, 'peakKw')) { loadKind = 'peak-only'; score += 6; }
  else if (has(site, 'buildingSqft') && has(site, 'buildingType')) { loadKind = 'building'; score += 4; }
  var tariffOk = has(site, 'demandChargePerKw') && has(site, 'energyRate');
  if (tariffOk) score += 15; else if (has(site, 'tariff') || has(site, 'demandChargePerKw')) score += 6;
  var objectiveOk = has(site, 'objective'); if (objectiveOk) score += 5;
  var serviceOk = has(site, 'mainServiceA') && has(site, 'serviceVoltage'), xfmrOk = has(site, 'transformerKva'), limitOk = has(site, 'interconnectionLimitKw') || has(site, 'exportLimitKw');
  var electricalOk = serviceOk || xfmrOk || limitOk;
  if (serviceOk) score += 6; if (xfmrOk) score += 4; if (limitOk) score += 5;
  if (has(site, 'areaSqft')) score += 5;
  if ((site.documents || []).length) score += 5;
  var objective = String(val(site, 'objective') || '').toLowerCase();

  var level;
  if (loadKind === 'interval' && tariffOk && objectiveOk && electricalOk) level = 'detailed';
  else if (loadKind === 'interval' || loadKind === 'interval-partial' || loadKind === 'bills12' || loadKind === 'bills6') level = 'preliminary';
  else if (loadKind) level = 'screening';
  else level = 'insufficient';

  /* What would raise the level, in the order it helps most. */
  if (level !== 'detailed') {
    if (loadKind !== 'interval') (level === 'insufficient' ? missing : improve).push(ASKS.interval);
    if (['interval', 'interval-partial', 'bills12'].indexOf(loadKind) < 0) (level === 'insufficient' || level === 'screening' ? missing : improve).push(ASKS.bills12);
    if (!loadKind || loadKind === 'building') missing.push(ASKS.peaks);
    if (!tariffOk) (level === 'insufficient' ? missing : improve).push(ASKS.tariff);
    if (!objectiveOk) improve.push(ASKS.objective);
    if (!electricalOk) { improve.push(ASKS.service); improve.push(ASKS.transformer); }
    if (!limitOk) improve.push(ASKS.export);
  }
  if (/backup|resilien|outage|critical/.test(objective) && !(has(site, 'backupHours') && has(site, 'backupKw'))) improve.push(ASKS.backup);
  if (/\bev\b|charg/.test(objective) && !has(site, 'evLoadKw')) improve.push(ASKS.ev);
  if (!has(site, 'areaSqft')) improve.push(ASKS.area);
  if (loadKind === 'building') notes.push('Load is modelled from building type and floor area (an estimate), not measured.');
  if (loadKind === 'bills-few') notes.push('Fewer than six billed months: a peak season may be missing.');
  if (loadKind === 'interval-partial') notes.push('Interval data covers ' + iv.days + ' days, not a full year; peak season may be missing.');

  var dedupe = {}, all = missing.concat(improve).filter(function (a) { if (dedupe[a.key]) return false; dedupe[a.key] = true; return true; });
  return { completeness: Math.max(0, Math.min(100, Math.round(score))), level: level, levelLabel: LEVELS[level], loadKind: loadKind,
    tariffSupplied: tariffOk, electricalKnown: electricalOk, objectiveSupplied: objectiveOk,
    missing: level === 'insufficient' ? all : missing.filter(function (a) { return dedupe[a.key]; }), improve: level === 'insufficient' ? [] : improve, requests: all, notes: notes };
}

module.exports = { assess: assess, LEVELS: LEVELS, ASKS: ASKS, has: has, val: val };
