/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/portfolio/evcs.js — the EVCS site-intake import profile (WB1 shape)
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   PURE. Recognises an EV-charging site intake by its SHEET/HEADER SIGNATURE
   (not its filename), finds the header row (row 3 in the reference intake,
   beneath a title and merged group headings), reads only rows that carry a
   valid Location ID, keeps the source/definition footer as import metadata
   rather than as a site, and turns every populated cell into a FACT with
   cell-level provenance (Intake!V7).

   Conversion rules (docs/PORTFOLIO-ASSET-MANAGER-PLAN.md §4, spec App. A):
   - Location ID is a string identity, namespaced (externalSiteIds.evcs).
   - Rev share (%) is WHOLE PERCENT: 6 → 0.06 (raw 6 retained).
   - "EVCS owns meter" is tri-state: TRUE, FALSE, or blank = UNKNOWN. Blank
     is never coerced to false.
   - Switchgear text (T) and parsed amps (U) are both kept; no kW from amps.
   - The power column's header ("peak … active intervals") and the footer's
     "p95 avg power" disagree; the value is an UNRESOLVED REPORTED STATISTIC
     with a definition-review flag — never a measured maximum, a full-period
     average, utilisation or available power.
   - Reported power above installed charger kW is flagged with a review task;
     the source value is never clamped or corrected.
   - SHA remaining years is a dated snapshot, not an expiry date; zero is
     flagged for agreement review, not treated as an expiration.
   - A blank cell is NOT a zero, a denial or proof of absence: no fact.

   The "EVCS legacy proxy v1" screen is reproduced ONLY as a labelled,
   preliminary scenario for workbook parity. Missing inputs give "Unable to
   estimate - power data missing"; the workbook's historical zero is stored
   separately as legacyHistoricalPods. Never an approval or headroom.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

var PROFILE = 'evcs-intake-v1';
var COLUMNS = [
  ['A', 'locationId', 'Location ID', 'text'],
  ['B', 'name', 'Location name', 'text'],
  ['C', 'street', 'Street address', 'text'],
  ['D', 'city', 'City', 'text'],
  ['E', 'state', 'State', 'text'],
  ['F', 'zip', 'ZIP', 'zip'],
  ['G', 'county', 'County', 'text'],
  ['H', 'apn', 'APN', 'text'],
  ['I', 'grossAcres', 'Gross (acres)', 'number', 'acres'],
  ['J', 'usableAcres', 'Usable (acres)', 'number', 'acres'],
  ['K', 'hostAccount', 'Account name (site host)', 'text'],
  ['L', 'shaTermYears', 'SHA term (yrs)', 'number', 'years'],
  ['M', 'shaRemainingYears', 'SHA remaining (yrs)', 'number', 'years'],
  ['N', 'locationType', 'Location type', 'text'],
  ['O', 'utility', 'Utility', 'text'],
  ['P', 'rateSchedule', 'Rate schedule (latest bill)', 'text'],
  ['Q', 'utilitySource', 'Utility source', 'text'],
  ['R', 'evcsOwnsMeter', 'EVCS owns meter', 'bool'],
  ['S', 'installedChargerKw', 'Installed capacity (kW, L2+L3)', 'number', 'kW'],
  ['T', 'switchgearRaw', 'Switchgear size (as stored)', 'text'],
  ['U', 'switchgearAmps', 'Switchgear (amps)', 'number', 'A'],
  ['V', 'reportedPowerKw', 'peak power (kW, last 6 mo, active intervals)', 'number', 'kW'],
  ['W', 'capacityStatus', 'Status', 'text'],
  ['X', 'carriers', 'Carriers', 'text'],
  ['Y', 'zoning', 'Zoning', 'text'],
  ['Z', 'ahj', 'AHJ', 'text'],
  ['AA', 'timing', 'Timing', 'text'],
  ['AB', 'siteMap', 'Site map', 'text'],
  ['AC', 'monthlyRentUsd', 'Monthly rent ($)', 'number', 'USD/month'],
  ['AD', 'revShare', 'Rev share (%)', 'percentWhole', 'fraction'],
  ['AE', 'revSharePerKwh', 'Rev share ($/kWh)', 'number', 'USD/kWh'],
  ['AF', 'utilityDocumentation', 'Utility documentation', 'text'],
  ['AG', 'nearestSubstation', 'Nearest substation', 'text'],
  ['AH', 'lines', 'Transmission / distribution lines', 'text'],
  ['AI', 'fiberProof', 'Fiber proof', 'text'],
  ['AJ', 'fiberDiversity', 'Fiber diversity', 'text'],
  ['AK', 'entitlements', 'Entitlements', 'text'],
  ['AL', 'water', 'Water', 'text'],
  ['AM', 'sewer', 'Sewer', 'text'],
  ['AN', 'gas', 'Gas', 'text'],
  ['AO', 'roadAccess', 'Road access', 'text'],
  ['AP', 'floodplain', 'Floodplain', 'text'],
  ['AQ', 'wetlands', 'Wetlands', 'text'],
  ['AR', 'environmental', 'Environmental', 'text'],
  ['AS', 'geotechnical', 'Geotechnical', 'text'],
  ['AT', 'easements', 'Easements', 'text'],
  ['AU', 'pipelineRail', 'Pipeline / rail', 'text'],
  ['AV', 'taxesIncentives', 'Taxes / incentives', 'text'],
  ['AW', 'priorDiligence', 'Prior diligence', 'text']
].map(function (c, i) { return { col: c[0], index: i, key: c[1], header: c[2], type: c[3], unit: c[4] || null }; });

/* Field semantics the UI and later phases read: never relabel these. */
var SEMANTICS = {
  installedChargerKw: { metricDefinition: 'aggregate_installed_charger_nameplate', note: 'Charger nameplate (L2+L3 total); not utility-approved or service capacity' },
  reportedPowerKw: { metricDefinition: 'unresolved_reported_peak_or_active_interval_p95', measurementScope: 'source_reported_site_power', observedPeriod: 'last_6_months_as_reported', reviewStatus: 'needs_definition_review',
    note: 'Header says peak (active intervals); footer defines p95 of 15-min average power, idle excluded. Not a measured maximum, a full-period average, utilisation or available power.' },
  shaRemainingYears: { metricDefinition: 'reported_remaining_term_snapshot', note: 'Reported remaining term at the intake date; not a signed expiration date' },
  shaTermYears: { metricDefinition: 'reported_original_term' },
  evcsOwnsMeter: { metricDefinition: 'reported_meter_ownership_flag', note: 'Reported flag; not authority to use or resell power' },
  hostAccount: { note: 'Host-party label; not automatically landowner, meter customer or equipment owner' },
  rateSchedule: { note: 'Reported tariff code; not a bill' },
  switchgearAmps: { note: 'Parsed amperes; voltage, phase and continuous rating still required; kW is not derived' },
  apn: { note: 'Parcel identifier; not a unique site identity' },
  revShare: { note: 'Imported as whole percent and stored as a fraction (6 → 0.06); revenue basis and applicability need review' },
  capacityStatus: { note: 'Source capacity-request status context; not operating status' },
  carriers: { note: 'Reported carriers; not serviceability confirmation' }
};

function norm(h) { return String(h == null ? '' : h).toLowerCase().replace(/\s+/g, ' ').replace(/[^a-z0-9 ()$%+\/,.-]/g, '').trim(); }
function text(v) { return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim(); }

/* Where are the headers? The first row (of the first 15) whose cells match
   at least 80% of the profile's headers in place. */
function findHeaderRow(rows) {
  for (var i = 0; i < Math.min(rows.length, 15); i++) {
    var cells = rows[i].cells || [], hits = 0;
    COLUMNS.forEach(function (c) { if (norm(cells[c.index]) === norm(c.header)) hits++; });
    if (hits >= Math.ceil(COLUMNS.length * 0.8)) return { index: i, row: rows[i].r, hits: hits };
  }
  return null;
}
/* Signature: an 'Intake' sheet (or any sheet) whose header row matches, and
   the three columns that make this profile what it is are present. */
function detect(grid) {
  var h = findHeaderRow(grid.rows || []);
  if (!h) return null;
  var cells = grid.rows[h.index].cells;
  var core = norm(cells[0]) === norm('Location ID') && norm(cells[17]) === norm('EVCS owns meter') && /power/.test(norm(cells[21]));
  return core ? { profile: PROFILE, headerRow: h.row, headerIndex: h.index, matched: h.hits, columns: COLUMNS.length, sheet: grid.sheet } : null;
}

function validId(v) { var s = text(v); return /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/.test(s) ? s : ''; }
function parseNumber(raw) {
  var s = text(raw); if (s === '') return { blank: true };
  var n = Number(s.replace(/[$,\s]/g, '').replace(/^\((.*)\)$/, '-$1'));
  return isFinite(n) ? { value: n } : { invalid: s };
}
function parseBool(raw) {
  var s = text(raw).toLowerCase(); if (s === '') return { blank: true };
  if (['true', 'yes', 'y', '1', 't'].indexOf(s) >= 0) return { value: true };
  if (['false', 'no', 'n', '0', 'f'].indexOf(s) >= 0) return { value: false };
  return { invalid: text(raw) };
}

/* EVCS legacy proxy v1 — workbook parity only (spec §3.5). */
var LEGACY = { name: 'EVCS legacy proxy v1', podItKw: 75, pue: 1.2, podFacilityKw: 90, reservePowerMultiplier: 1.25, reserveInstalledFraction: 0.2, minRemainingYears: 5 };
function legacyProxy(installedKw, powerKw, meterOwned, remainingYears) {
  var caveat = 'Preliminary proxy using charger nameplate; not approved power, headroom, compute rights or utility approval.';
  var out = { scenario: LEGACY.name, assumptions: LEGACY, kind: 'proxied', caveat: caveat, legacyHistoricalPods: null };
  if (installedKw == null || powerKw == null) {
    out.status = 'unable'; out.label = 'Unable to estimate - power data missing';
    out.missing = [installedKw == null ? 'installedChargerKw' : null, powerKw == null ? 'reportedPowerKw' : null].filter(Boolean);
    out.pods = null; out.itKw = null; out.facilityKw = null; out.meterTermPods = null;
    out.legacyHistoricalPods = 0; /* the spreadsheet's historical zero convention, kept for reconciliation only */
    return out;
  }
  var reserve = Math.max(powerKw * LEGACY.reservePowerMultiplier, installedKw * LEGACY.reserveInstalledFraction);
  var screen = Math.max(0, installedKw - reserve), pods = Math.floor(screen / LEGACY.podFacilityKw + 1e-9);
  out.status = 'screened'; out.label = pods > 0 ? 'Screened potential (legacy proxy)' : 'No pod under legacy proxy';
  out.reserveKw = Math.round(reserve * 1000) / 1000; out.screenKw = Math.round(screen * 1000) / 1000;
  out.pods = pods; out.itKw = pods * LEGACY.podItKw; out.facilityKw = pods * LEGACY.podFacilityKw;
  out.meterTermPods = meterOwned === true && remainingYears != null && remainingYears >= LEGACY.minRemainingYears ? pods : 0;
  out.meterTermBasis = meterOwned == null ? 'meter flag unknown in source' : (remainingYears == null ? 'remaining term unknown in source' : 'source meter flag and reported remaining term');
  out.legacyHistoricalPods = pods;
  return out;
}

/* grid: xlsx.sheetGrid() result. → { meta, records[], rejected[] } */
function parse(grid, opts) {
  opts = opts || {};
  var det = detect(grid);
  if (!det) { var e = new Error('This workbook does not match the EVCS intake profile'); e.status = 400; throw e; }
  var file = opts.file || null, now = opts.now || new Date().toISOString(), namespace = opts.namespace || 'evcs';
  var after = grid.rows.slice(det.headerIndex + 1), records = [], rejected = [], footer = [], seen = {}, lastDataRow = null;
  after.forEach(function (row) {
    var cells = row.cells || [], id = validId(cells[0]), filled = cells.filter(function (c) { return text(c) !== ''; }).length;
    if (!filled) return;
    if (!id) {
      /* A long sentence in column A with the rest of the row empty is a note
         (the source/definition footer), not a site and not an error. */
      if (filled <= 2 && text(cells[0]).length > 40) { footer.push({ row: row.r, text: text(cells[0]).slice(0, 2000) }); return; }
      rejected.push({ row: row.r, reason: text(cells[0]) ? 'Location ID "' + text(cells[0]).slice(0, 40) + '" is not a valid identifier' : 'Row has no Location ID' });
      return;
    }
    if (seen[id]) { rejected.push({ row: row.r, externalSiteId: id, reason: 'Duplicate Location ID ' + id + ' (first on row ' + seen[id] + ')' }); return; }
    seen[id] = row.r; lastDataRow = row.r;
    var facts = {}, warnings = [], raw = {};
    COLUMNS.forEach(function (c) {
      var v = cells[c.index], t = text(v);
      raw[c.key] = t === '' ? null : t;
      if (c.index === 0 || t === '') return;
      var base = { unit: c.unit, kind: 'supplied', raw: t, source: { file: file, sheet: grid.sheet, cell: c.col + row.r, row: row.r, column: c.col, header: c.header, externalSiteId: id, profile: PROFILE }, importedAt: now, reviewStatus: 'unreviewed' };
      var sem = SEMANTICS[c.key]; if (sem) Object.keys(sem).forEach(function (k) { base[k] = sem[k]; });
      if (c.type === 'number' || c.type === 'percentWhole') {
        var n = parseNumber(v);
        if (n.invalid != null) { warnings.push({ code: 'NOT_A_NUMBER', field: c.key, cell: c.col + row.r, message: c.header + ' is not a number: "' + n.invalid.slice(0, 40) + '"' }); base.value = null; base.reviewStatus = 'invalid_in_source'; facts[c.key] = base; return; }
        if (n.value < 0) warnings.push({ code: 'NEGATIVE_VALUE', field: c.key, cell: c.col + row.r, message: c.header + ' is negative' });
        base.value = c.type === 'percentWhole' ? Math.round(n.value * 1e6) / 1e8 : n.value;
        if (c.type === 'percentWhole') base.conversion = 'whole_percent_to_fraction';
      } else if (c.type === 'bool') {
        var b = parseBool(v);
        if (b.invalid != null) { warnings.push({ code: 'NOT_A_FLAG', field: c.key, cell: c.col + row.r, message: c.header + ' is not TRUE/FALSE: "' + b.invalid.slice(0, 20) + '"' }); base.value = null; base.reviewStatus = 'invalid_in_source'; }
        else base.value = b.value;
      } else if (c.type === 'zip') {
        base.value = /^\d{1,4}$/.test(t) ? ('00000' + t).slice(-5) : t;
        if (base.value !== t) base.conversion = 'zip_leading_zeros_restored';
      } else base.value = t.slice(0, 2000);
      facts[c.key] = base;
    });
    var val = function (k) { return facts[k] && facts[k].value != null ? facts[k].value : null; };
    var flags = [];
    if (val('reportedPowerKw') != null) flags.push({ code: 'POWER_DEFINITION_CONFLICT', field: 'reportedPowerKw', severity: 'review', message: 'Power statistic definition is unresolved (header: peak over active intervals; footer: p95 15-min average, idle excluded). Clarify before use.' });
    else flags.push({ code: 'POWER_MISSING', field: 'reportedPowerKw', severity: 'info', message: 'Reported power not provided; opportunity cannot be estimated.' });
    if (val('reportedPowerKw') != null && val('installedChargerKw') != null && val('reportedPowerKw') > val('installedChargerKw'))
      flags.push({ code: 'POWER_EXCEEDS_INSTALLED', field: 'reportedPowerKw', severity: 'review', message: 'Reported power (' + val('reportedPowerKw') + ' kW) exceeds installed charger nameplate (' + val('installedChargerKw') + ' kW). Confirm units, measurement scope, installed equipment and definitions. Source values are not corrected.' });
    if (!facts.evcsOwnsMeter) flags.push({ code: 'METER_UNKNOWN', field: 'evcsOwnsMeter', severity: 'info', message: 'Meter ownership not provided in source (unknown, not false).' });
    if (val('shaRemainingYears') === 0) flags.push({ code: 'TERM_ZERO_REVIEW', field: 'shaRemainingYears', severity: 'review', message: 'Reported remaining term is 0; needs agreement review (not a verified expiration).' });
    if (!facts.shaRemainingYears) flags.push({ code: 'TERM_MISSING', field: 'shaRemainingYears', severity: 'info', message: 'Remaining term not provided.' });
    if (!facts.utility) flags.push({ code: 'UTILITY_MISSING', field: 'utility', severity: 'info', message: 'Utility not provided.' });
    if (!facts.rateSchedule) flags.push({ code: 'TARIFF_MISSING', field: 'rateSchedule', severity: 'info', message: 'Rate schedule not provided (a tariff label is not a bill either way).' });
    if (!facts.switchgearAmps) flags.push({ code: 'SWITCHGEAR_MISSING', field: 'switchgearAmps', severity: 'info', message: 'Switchgear amps not provided.' });
    records.push({
      externalSiteId: id, namespace: namespace, row: row.r,
      name: val('name') || ('Location ' + id),
      address: { street: val('street'), city: val('city'), state: val('state'), zip: val('zip'), county: val('county') },
      facts: facts, flags: flags, warnings: warnings,
      opportunity: { legacyProxy: legacyProxy(val('installedChargerKw'), val('reportedPowerKw'), facts.evcsOwnsMeter ? facts.evcsOwnsMeter.value : null, val('shaRemainingYears')) }
    });
  });
  footer = footer.filter(function (f) { return lastDataRow == null || f.row > lastDataRow; }).concat([]);
  return {
    meta: { profile: PROFILE, sheet: grid.sheet, sheets: grid.sheets, headerRow: det.headerRow, columns: COLUMNS.length, matchedHeaders: det.matched, dataRows: records.length, firstDataRow: records.length ? records[0].row : null, lastDataRow: lastDataRow,
      footer: footer, formulaCells: grid.formulas || 0,
      definitionNotes: footer.filter(function (f) { return /p95|percentile/i.test(f.text); }).map(function (f) { return { row: f.row, text: f.text, appliesTo: 'reportedPowerKw' }; }) },
    records: records, rejected: rejected
  };
}

module.exports = { PROFILE: PROFILE, COLUMNS: COLUMNS, SEMANTICS: SEMANTICS, LEGACY: LEGACY, detect: detect, findHeaderRow: findHeaderRow, parse: parse, legacyProxy: legacyProxy };
