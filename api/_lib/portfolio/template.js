/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/portfolio/template.js — the portfolio site list: one column set
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   PURE. The columns a customer's site list may carry, the header spellings
   we accept for each, the units, and the downloadable template. The
   ingester, the quality check, the sizer and the export all read THIS list;
   a column added here is understood everywhere at once.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* kind: text | number | boolean · units for numbers · required for a usable row */
var FIELDS = [
  { key: 'siteId', label: 'Site ID', required: true, aliases: ['site id', 'site_id', 'siteid', 'id', 'site ref', 'ref', 'site number', 'site no', 'store', 'store number', 'location id'] },
  { key: 'name', label: 'Site name', required: true, aliases: ['site name', 'name', 'site', 'location', 'facility', 'property'] },
  { key: 'address', label: 'Street address', required: true, aliases: ['street address', 'address', 'street', 'address 1', 'address1', 'addr'] },
  { key: 'city', label: 'City', required: true, aliases: ['city', 'town', 'municipality'] },
  { key: 'state', label: 'State', required: true, aliases: ['state', 'province', 'st'] },
  { key: 'zip', label: 'ZIP code', required: true, aliases: ['zip code', 'zip', 'zipcode', 'postal code', 'postcode'] },
  { key: 'account', label: 'Customer or account name', aliases: ['customer or account name', 'customer', 'account', 'account name', 'company', 'owner'] },
  { key: 'utility', label: 'Utility', aliases: ['utility', 'utility company', 'electric utility', 'iou'] },
  { key: 'utilityAccount', label: 'Utility account or meter', aliases: ['utility account or meter', 'utility account', 'account number', 'meter', 'meter id', 'meter number', 'service point'] },
  { key: 'objective', label: 'Project objective', aliases: ['project objective', 'objective', 'use case', 'goal', 'purpose'] },
  { key: 'documents', label: 'Available documents', aliases: ['available documents', 'documents', 'docs', 'files'] },
  { key: 'tariff', label: 'Tariff', aliases: ['tariff', 'rate schedule', 'rate', 'tariff code', 'rate class'] },
  { key: 'demandChargePerKw', label: 'Demand charge ($/kW-month)', kind: 'number', units: '$/kW-month', aliases: ['demand charge', 'demand charge ($/kw-month)', 'demand charge $/kw', 'demand rate', '$/kw'] },
  { key: 'energyRate', label: 'Energy rate ($/kWh)', kind: 'number', units: '$/kWh', aliases: ['energy rate', 'energy rate ($/kwh)', '$/kwh', 'energy price', 'kwh rate'] },
  { key: 'annualKwh', label: 'Annual kWh', kind: 'number', units: 'kWh', aliases: ['annual kwh', 'annual usage', 'yearly kwh', 'kwh per year', 'annual consumption'] },
  { key: 'peakKw', label: 'Peak demand (kW)', kind: 'number', units: 'kW', aliases: ['peak demand (kw)', 'peak demand', 'peak kw', 'max demand', 'billed demand', 'monthly peak kw', 'peak'] },
  { key: 'intervalFile', label: 'Interval or 8760 file', aliases: ['interval or 8760 file', 'interval file', '8760 file', 'interval data', '8760', 'load profile file'] },
  { key: 'serviceVoltage', label: 'Service voltage (V)', kind: 'number', units: 'V', aliases: ['service voltage (v)', 'service voltage', 'voltage', 'volts'] },
  { key: 'phase', label: 'Phase', kind: 'number', units: 'phases', aliases: ['phase', 'phases', 'service phase'] },
  { key: 'mainServiceA', label: 'Main service rating (A)', kind: 'number', units: 'A', aliases: ['main service rating (a)', 'main service rating', 'service rating', 'main breaker', 'service amps', 'amps'] },
  { key: 'transformerKva', label: 'Transformer capacity (kVA)', kind: 'number', units: 'kVA', aliases: ['transformer capacity (kva)', 'transformer capacity', 'transformer kva', 'transformer'] },
  { key: 'existingGenerationKw', label: 'Existing generation (kW)', kind: 'number', units: 'kW', aliases: ['existing generation (kw)', 'existing generation', 'generator kw', 'generation'] },
  { key: 'solarKw', label: 'Solar capacity (kW)', kind: 'number', units: 'kW', aliases: ['solar capacity (kw)', 'solar capacity', 'solar kw', 'pv kw', 'solar'] },
  { key: 'solarKwhYr', label: 'Solar production (kWh/yr)', kind: 'number', units: 'kWh/yr', aliases: ['solar production (kwh/yr)', 'solar production', 'pv production', 'solar kwh'] },
  { key: 'evLoadKw', label: 'Planned EV-charging load (kW)', kind: 'number', units: 'kW', aliases: ['planned ev-charging load (kw)', 'planned ev load', 'ev load', 'ev charging kw', 'ev kw'] },
  { key: 'exportLimitKw', label: 'Export limit (kW)', kind: 'number', units: 'kW', aliases: ['export limit (kw)', 'export limit', 'export restriction', 'export restrictions', 'max export'] },
  { key: 'durationHours', label: 'Desired duration (h)', kind: 'number', units: 'h', aliases: ['desired duration (h)', 'desired duration', 'duration', 'duration hours', 'discharge duration'] },
  { key: 'backupKw', label: 'Backup load (kW)', kind: 'number', units: 'kW', aliases: ['backup load (kw)', 'backup load', 'critical load', 'backup kw'] },
  { key: 'backupHours', label: 'Backup duration (h)', kind: 'number', units: 'h', aliases: ['backup duration (h)', 'backup duration', 'backup hours', 'resilience hours'] },
  { key: 'interconnectionLimitKw', label: 'Interconnection limit (kW)', kind: 'number', units: 'kW', aliases: ['interconnection limit (kw)', 'interconnection limit', 'interconnect limit', 'grid limit', 'utility limit'] },
  { key: 'hostingCapacityKw', label: 'Hosting capacity (kW)', kind: 'number', units: 'kW', aliases: ['hosting capacity (kw)', 'hosting capacity', 'feeder capacity', 'available capacity'] },
  { key: 'areaSqft', label: 'Available installation area (sq ft)', kind: 'number', units: 'sq ft', aliases: ['available installation area (sq ft)', 'available installation area', 'installation area', 'available area', 'area sqft', 'yard sqft'] },
  { key: 'buildingSqft', label: 'Building area (sq ft)', kind: 'number', units: 'sq ft', aliases: ['building area (sq ft)', 'building sqft', 'building area', 'gross floor area', 'gfa'] },
  { key: 'buildingType', label: 'Building type', aliases: ['building type', 'type', 'facility type', 'property type', 'use'] },
  { key: 'budgetUsd', label: 'Customer target or budget (USD)', kind: 'number', units: 'USD', aliases: ['customer target or budget (usd)', 'budget', 'target', 'budget usd', 'capex target'] },
  { key: 'lat', label: 'Latitude', kind: 'number', units: 'deg', aliases: ['latitude', 'lat'] },
  { key: 'lng', label: 'Longitude', kind: 'number', units: 'deg', aliases: ['longitude', 'lng', 'lon', 'long'] }
];

/* Twelve optional pairs, "Jan kWh" … "Dec kW". */
function monthColumns() {
  var out = [];
  MONTHS.forEach(function (m, i) {
    out.push({ key: 'kwh_' + (i + 1), label: m + ' kWh', kind: 'number', units: 'kWh', month: i, measure: 'kwh', aliases: [m.toLowerCase() + ' kwh', m.toLowerCase() + '_kwh', 'kwh ' + m.toLowerCase(), 'kwh_' + (i + 1), 'kwh' + (i + 1)] });
    out.push({ key: 'kw_' + (i + 1), label: m + ' kW', kind: 'number', units: 'kW', month: i, measure: 'kw', aliases: [m.toLowerCase() + ' kw', m.toLowerCase() + '_kw', 'kw ' + m.toLowerCase(), 'kw_' + (i + 1), 'kw' + (i + 1), m.toLowerCase() + ' peak kw', m.toLowerCase() + ' demand'] });
  });
  return out;
}

function normHeader(h) { return String(h == null ? '' : h).toLowerCase().replace(/[\s_\-\/]+/g, ' ').replace(/[^a-z0-9 $().]/g, '').trim(); }

/* header text → field key, or null. Exact label first, then aliases. */
function resolveHeader(h) {
  var n = normHeader(h), all = FIELDS.concat(monthColumns());
  for (var i = 0; i < all.length; i++) {
    var f = all[i];
    if (normHeader(f.label) === n) return f;
    for (var j = 0; j < (f.aliases || []).length; j++) if (normHeader(f.aliases[j]) === n) return f;
  }
  return null;
}

var REQUIRED = FIELDS.filter(function (f) { return f.required; }).map(function (f) { return f.key; });

function templateRows() {
  var head = FIELDS.map(function (f) { return f.label; }).concat(monthColumns().map(function (c) { return c.label; }));
  var example = ['S-001', 'North distribution center', '1200 Industrial Dr', 'Chicago', 'IL', '60632', 'Example Logistics LLC', 'ComEd', '1234567890', 'Demand charge reduction; 2 h backup for refrigeration', 'S-001/bill-2025-*.pdf; S-001/interval-2025.csv', 'Rate BESH', 18.5, 0.11, 1850000, 640, 'S-001/interval-2025.csv', 480, 3, 1200, 1000, 0, 250, 340000, 150, 0, 2, 200, 4, 500, '', 6000, 120000, 'Warehouse / cold storage', 750000, '', ''];
  var months = monthColumns().map(function (c) { return ''; });
  return [head, example.concat(months)];
}

module.exports = { FIELDS: FIELDS, MONTHS: MONTHS, REQUIRED: REQUIRED, monthColumns: monthColumns, resolveHeader: resolveHeader, normHeader: normHeader, templateRows: templateRows };
