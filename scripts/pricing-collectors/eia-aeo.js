/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   EIA AEO Electricity Market Module Table 3 collector.
   The Open Data API does not publish this table. The assumptions
   PDF is the source. A failed parse does not drop the accepted rows. */
'use strict';

var fs = require('fs');
var lib = require('./lib');

var ID = 'eia-aeo';
var URL = 'https://www.eia.gov/outlooks/aeo/assumptions/pdf/EMM_Assumptions.pdf';
var THRESHOLD = 0.01;
var ROWS = [
  { id: 'cc.single', label: 'Combined-cycle, single-shaft', mw: 627, basePerKw: 875, totalPerKw: 875, vomPerMwh: 3.39, fomPerKwYr: 15.75 },
  { id: 'cc.multi', label: 'Combined-cycle, multi-shaft', mw: 1227, basePerKw: 824, totalPerKw: 824, vomPerMwh: 3.46, fomPerKwYr: 12.31 },
  { id: 'cc.ccs95', label: 'Combined-cycle with 95% CCS', mw: 543, basePerKw: 2245, totalPerKw: 2469, vomPerMwh: 5.13, fomPerKwYr: 25.17 },
  { id: 'ct.aero', label: 'Combustion turbine, aeroderivative', mw: 211, basePerKw: 1522, totalPerKw: 1522, vomPerMwh: 5.79, fomPerKwYr: 9.70 },
  { id: 'ct.frame', label: 'Combustion turbine, industrial frame', mw: 419, basePerKw: 791, totalPerKw: 791, vomPerMwh: 4.05, fomPerKwYr: 6.97 },
  { id: 'fuelcell', label: 'Fuel cells', mw: 10, basePerKw: 7447, totalPerKw: 7896, vomPerMwh: 0.70, fomPerKwYr: 36.67 },
  { id: 'hydrogen', label: 'Hydrogen turbine', mw: 237, basePerKw: 823, totalPerKw: 823, vomPerMwh: 5.36, fomPerKwYr: 8.34 },
  { id: 'dg.base', label: 'Distributed generation, base', mw: 2, basePerKw: 1743, totalPerKw: 1743, vomPerMwh: 10.25, fomPerKwYr: 23.06 },
  { id: 'dg.peak', label: 'Distributed generation, peak', mw: 1, basePerKw: 2093, totalPerKw: 2093, vomPerMwh: 10.25, fomPerKwYr: 23.06 },
  { id: 'battery.4h', label: 'Battery storage, four-hour lithium-ion', mw: 150, basePerKw: 1580, totalPerKw: 1580, vomPerMwh: 0, fomPerKwYr: 40.62, charged: false }
];

function parseTable(text) {
  var records = [];
  var metrics = {};
  var lines = String(text).split(/\r?\n/);
  var i, line, parts, row, spec;
  for (i = 0; i < lines.length; i++) {
    line = lines[i].trim();
    if (line.indexOf('|') < 0) continue;
    parts = line.split('|').map(function (s) { return s.trim(); });
    if (parts.length < 6) continue;
    spec = null;
    for (row = 0; row < ROWS.length; row++) {
      if (parts[0] === ROWS[row].id) spec = ROWS[row];
    }
    if (!spec) continue;
    records.push({
      id: spec.id,
      label: parts[1] || spec.label,
      mw: lib.num(parts[2]),
      basePerKw: lib.num(parts[3]),
      totalPerKw: lib.num(parts[4]),
      vomPerMwh: lib.num(parts[5]),
      fomPerKwYr: lib.num(parts[6]),
      charged: spec.id === 'battery.4h' ? false : undefined
    });
    metrics[spec.id + '.basePerKw'] = lib.num(parts[3]);
    metrics[spec.id + '.fomPerKwYr'] = lib.num(parts[6]);
  }
  return { ok: records.length === ROWS.length, records: records, metrics: metrics };
}

function metricsOf(accepted) {
  var out = {};
  var rows = (accepted && accepted.records) || [];
  var i;
  for (i = 0; i < rows.length; i++) {
    out[rows[i].id + '.basePerKw'] = rows[i].basePerKw;
    out[rows[i].id + '.fomPerKwYr'] = rows[i].fomPerKwYr;
  }
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
      published: '2025-04',
      dollarYear: 2024,
      read: read,
      threshold: THRESHOLD,
      ok: parsed.ok,
      records: parsed.ok ? parsed.records : [],
      api: process.env.EIA_API_KEY ? 'key set; Table 3 is not an Open Data route, so the PDF is still the source' : 'EIA_API_KEY unset; Open Data API not called'
    }, extra || {});
    return { id: ID, ok: parsed.ok, live: !opts.fixture, review: rev, written: lib.writeProposed(ID, snapshot, rev, !!opts.dryRun), snapshot: snapshot };
  }
  if (opts.fixture) return Promise.resolve(finish(parseTable(fs.readFileSync(opts.fixture, 'utf8')), { fixture: true }));
  return lib.fetchChecked(URL, { timeout: 60000 }).then(function (res) {
    if (!res.ok) return finish({ ok: false, records: [], metrics: {} }, { error: res.robots && !res.robots.allowed ? res.robots.note : ('HTTP ' + res.status), robots: res.robots });
    var extracted = lib.pdfText(res.body);
    if (!extracted.ok) return finish({ ok: false }, { error: extracted.error, robots: res.robots });
    var parsed = parseTable(extracted.text);
    if (!parsed.ok) {
      return finish({ ok: false, records: [], metrics: {} }, {
        error: 'Table 3 did not parse into the ten named rows. Accepted rows were left in place.',
        robots: res.robots
      });
    }
    return finish(parsed, { robots: res.robots });
  });
}

module.exports = { ID: ID, URL: URL, ROWS: ROWS, THRESHOLD: THRESHOLD, parseTable: parseTable, collect: collect };
