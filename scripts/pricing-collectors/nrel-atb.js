/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   NREL 2025 Electricity ATB model-parameters collector.
   Reads the two representative battery systems from the OEDI CSV.
   The commercial cost-equation constant is in the workbook, not
   this CSV, and is not invented here. */
'use strict';

var fs = require('fs');
var lib = require('./lib');

var ID = 'nrel-atb';
var URL = 'https://data.openei.org/files/8759/2025_v1_Model_Parameters_08-27-2026.csv';
var PAGE = 'https://data.openei.org/submissions/8759';
var THRESHOLD = 0.01;

function parseCsv(text) {
  var lines = String(text).split(/\r?\n/);
  var metrics = {};
  var records = [];
  var i, p, tech, detail, kind, value, units, scenario, year;
  for (i = 0; i < lines.length; i++) {
    if (lines[i].indexOf('Total energy storage system cost') < 0) continue;
    p = lines[i].split(',');
    tech = p[0];
    detail = p[1];
    kind = p[5];
    value = lib.num(p[6]);
    units = p[7];
    scenario = p[9];
    year = p[10];
    if (kind !== 'Total energy storage system cost') continue;
    if (scenario !== 'Base' || year !== '2024.0') continue;
    if (tech === 'Utility Scale Battery Storage' && detail === '60MW 240MWh') {
      records.push({ id: 'utility-60mw', tech: tech, detail: detail, value: value, units: units, dollarYear: 2023 });
      metrics['utility-60mw.' + units] = value;
    }
    if (tech === 'Commercial Scale Battery Storage' && detail === '1800 kW 7200 kWh') {
      records.push({ id: 'commercial-1800kw', tech: tech, detail: detail, value: value, units: units, dollarYear: 2023 });
      metrics['commercial-1800kw.' + units] = value;
    }
  }
  var ids = {};
  records.forEach(function (r) { ids[r.id + r.units] = 1; });
  var ok = ids['utility-60mw$/kW'] && ids['utility-60mw$/kWh'] && ids['commercial-1800kw$/kW'] && ids['commercial-1800kw$/kWh'];
  return {
    ok: !!ok,
    records: records,
    metrics: metrics,
    note: 'The commercial Battery Capital Cost Constant is not a column in this CSV. The workbook value of 0 was read separately and is not re-derived here.'
  };
}

function metricsOf(accepted) {
  var out = {};
  var rows = (accepted && accepted.records) || [];
  var i;
  for (i = 0; i < rows.length; i++) out[rows[i].id + '.' + rows[i].units] = rows[i].value;
  return out;
}

function collect(opts) {
  opts = opts || {};
  var read = opts.read || lib.readDate();
  var accepted = lib.readAccepted(ID);
  function finish(parsed, extra) {
    var rev = parsed.ok ? lib.review(metricsOf(accepted), parsed.metrics, THRESHOLD) : { threshold: THRESHOLD, flags: [], needsReview: false, unparsed: true };
    var snapshot = Object.assign({
      source: ID,
      url: URL,
      page: PAGE,
      published: '2025',
      read: read,
      threshold: THRESHOLD,
      ok: parsed.ok,
      records: parsed.ok ? parsed.records : [],
      note: parsed.note
    }, extra || {});
    return { id: ID, ok: parsed.ok, live: !opts.fixture, review: rev, written: lib.writeProposed(ID, snapshot, rev, !!opts.dryRun), snapshot: snapshot };
  }
  if (opts.fixture) return Promise.resolve(finish(parseCsv(fs.readFileSync(opts.fixture, 'utf8')), { fixture: true }));
  return lib.fetchChecked(URL, { timeout: 60000 }).then(function (res) {
    if (!res.ok) return finish({ ok: false, records: [], metrics: {} }, { error: res.robots && !res.robots.allowed ? res.robots.note : ('HTTP ' + res.status), robots: res.robots });
    return finish(parseCsv(res.body.toString('utf8')), { robots: res.robots });
  });
}

module.exports = { ID: ID, URL: URL, THRESHOLD: THRESHOLD, parseCsv: parseCsv, collect: collect };
