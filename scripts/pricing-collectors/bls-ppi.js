/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   BLS Producer Price Index collector. An index is not a dollar.
   The accepted snapshot is not replaced when a series moves. */
'use strict';

var fs = require('fs');
var path = require('path');
var lib = require('./lib');

var ID = 'bls-ppi';
var URL = 'https://api.bls.gov/publicAPI/v2/timeseries/data/';
var THRESHOLD = 0.05;
var SERIES = [
  { id: 'WPU10260314', label: 'Copper wire and cable', bookLine: 'el.conductor.ft' },
  { id: 'WPU11710216', label: 'Noncurrent-carrying electrical conduit and conduit fittings, including plastic conduit', bookLine: 'el.conduit.ft' },
  { id: 'WPU1174', label: 'Transformers and power regulators', bookLine: 'el.transformer.kva' },
  { id: 'WPU1175', label: 'Switchgear, switchboard, and industrial controls', bookLine: 'el.switchgear' }
];

function latestMonthly(rows) {
  var best = null;
  var i, row, key;
  for (i = 0; i < rows.length; i++) {
    row = rows[i];
    if (!/^M\d\d$/.test(row.period || '')) continue;
    key = String(row.year) + row.period;
    if (!best || key > best.key) best = { key: key, year: row.year, period: row.period, value: lib.num(row.value) };
  }
  return best;
}

function parseApi(body) {
  var json = typeof body === 'string' ? JSON.parse(body) : body;
  var series = (json.Results && json.Results.series) || [];
  var byId = {};
  var metrics = {};
  var i, row, hit, spec;
  for (i = 0; i < series.length; i++) {
    hit = latestMonthly(series[i].data || []);
    if (!hit || hit.value == null) continue;
    byId[series[i].seriesID] = {
      series: series[i].seriesID,
      period: hit.year + '-' + hit.period.slice(1),
      value: hit.value
    };
    metrics[series[i].seriesID] = hit.value;
  }
  var records = [];
  for (i = 0; i < SERIES.length; i++) {
    spec = SERIES[i];
    if (!byId[spec.id]) continue;
    records.push({
      series: spec.id,
      label: spec.label,
      bookLine: spec.bookLine,
      period: byId[spec.id].period,
      value: byId[spec.id].value
    });
  }
  return { ok: records.length === SERIES.length, records: records, metrics: metrics };
}

function metricsOf(accepted) {
  var out = {};
  var rows = (accepted && accepted.records) || [];
  var i;
  for (i = 0; i < rows.length; i++) out[rows[i].series] = rows[i].value;
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
      read: read,
      threshold: THRESHOLD,
      ok: parsed.ok,
      records: parsed.records || [],
      metrics: parsed.metrics || {},
      note: 'Index only. escalate() is not applied: no commodity base dollar and base-period index were both read.'
    }, extra || {});
    var written = lib.writeProposed(ID, snapshot, rev, !!opts.dryRun);
    return { id: ID, ok: parsed.ok, live: !opts.fixture, review: rev, written: written, snapshot: snapshot };
  }
  if (opts.fixture) return Promise.resolve(finish(parseApi(fs.readFileSync(opts.fixture, 'utf8')), { fixture: true }));
  var payload = JSON.stringify({
    seriesid: SERIES.map(function (s) { return s.id; }),
    startyear: String((opts.year || 2026) - 1),
    endyear: String(opts.year || 2026)
  });
  if (process.env.BLS_API_KEY) {
    var obj = JSON.parse(payload);
    obj.registrationkey = process.env.BLS_API_KEY;
    payload = JSON.stringify(obj);
  }
  return lib.fetchChecked(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    body: payload,
    timeout: 40000
  }).then(function (res) {
    if (!res.ok) return finish({ ok: false, records: [], metrics: {} }, { error: res.robots && !res.robots.allowed ? res.robots.note : ('HTTP ' + res.status), robots: res.robots });
    var parsed;
    try { parsed = parseApi(res.body.toString('utf8')); }
    catch (e) { parsed = { ok: false, records: [], metrics: {}, error: e.message }; }
    return finish(parsed, { robots: res.robots });
  });
}

module.exports = { ID: ID, URL: URL, SERIES: SERIES, THRESHOLD: THRESHOLD, parseApi: parseApi, metricsOf: metricsOf, collect: collect };
