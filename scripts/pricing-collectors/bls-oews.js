/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   BLS OEWS collector for SOC 47-2111, 47-2061, and 47-2073.
   Mean hourly wage is datatype 03. Employment is datatype 01.
   The accepted wage table is not replaced when a wage moves. */
'use strict';

var fs = require('fs');
var lib = require('./lib');

var ID = 'bls-oews';
var URL = 'https://api.bls.gov/publicAPI/v2/timeseries/data/';
var THRESHOLD = 0.05;
var SOC = ['47-2111', '47-2061', '47-2073'];
var FIPS = {
  AL: '01', AK: '02', AZ: '04', AR: '05', CA: '06', CO: '08', CT: '09', DE: '10', DC: '11',
  FL: '12', GA: '13', HI: '15', ID: '16', IL: '17', IN: '18', IA: '19', KS: '20', KY: '21',
  LA: '22', ME: '23', MD: '24', MA: '25', MI: '26', MN: '27', MS: '28', MO: '29', MT: '30',
  NE: '31', NV: '32', NH: '33', NJ: '34', NM: '35', NY: '36', NC: '37', ND: '38', OH: '39',
  OK: '40', OR: '41', PA: '42', RI: '44', SC: '45', SD: '46', TN: '47', TX: '48', UT: '49',
  VT: '50', VA: '51', WA: '53', WV: '54', WI: '55', WY: '56'
};
var METRO_AREA = { '16980': '0016980', '41860': '0041860', '26420': '0026420', '31080': '0031080', '35620': '0035620' };

function seriesId(areaType, area7, soc, datatype) {
  return 'OEU' + areaType + area7 + '000000' + String(soc).replace('-', '') + datatype;
}

function targetsFromAccepted(accepted) {
  var out = [{ geography: 'national', code: 'US', areaType: 'N', area7: '0000000' }];
  var rec = (accepted && accepted.records) || {};
  var st, id;
  for (st in (rec.states || FIPS)) {
    if (!FIPS[st]) continue;
    out.push({ geography: 'state', code: st, areaType: 'S', area7: FIPS[st] + '00000' });
  }
  for (id in (rec.metros || METRO_AREA)) {
    if (!METRO_AREA[id]) continue;
    out.push({ geography: 'metro', code: id, areaType: 'M', area7: METRO_AREA[id] });
  }
  return out;
}

function latestAnnual(rows) {
  var best = null;
  var i, row, key;
  for (i = 0; i < rows.length; i++) {
    row = rows[i];
    if (row.period !== 'A01') continue;
    key = String(row.year);
    if (!best || key > best.key) best = { year: row.year, value: lib.num(row.value) };
  }
  return best;
}

function parseApi(body) {
  var json = typeof body === 'string' ? JSON.parse(body) : body;
  var series = (json.Results && json.Results.series) || [];
  var metrics = {};
  var i, hit, id, soc, datatype, area;
  for (i = 0; i < series.length; i++) {
    id = series[i].seriesID || '';
    hit = latestAnnual(series[i].data || []);
    if (!hit || hit.value == null) continue;
    soc = id.slice(17, 23);
    soc = soc.slice(0, 2) + '-' + soc.slice(2);
    datatype = id.slice(23, 25);
    area = id.slice(4, 11);
    metrics[area + '.' + soc + '.' + datatype] = hit.value;
  }
  return { ok: Object.keys(metrics).length > 0, metrics: metrics, year: null };
}

function metricsOf(accepted) {
  var out = {};
  var rec = (accepted && accepted.records) || {};
  var i;
  function put(area, hourly, employment) {
    for (i = 0; i < SOC.length; i++) {
      out[area + '.' + SOC[i] + '.03'] = hourly[i];
      out[area + '.' + SOC[i] + '.01'] = employment[i];
    }
  }
  if (rec.national) put('0000000', rec.national.hourly, rec.national.employment);
  return out;
}

function collect(opts) {
  opts = opts || {};
  var read = opts.read || lib.readDate();
  var accepted = lib.readAccepted(ID);
  function finish(parsed, extra) {
    var proposed = parsed.metrics || {};
    var base = metricsOf(accepted);
    var compared = {};
    var k;
    for (k in proposed) {
      if (Object.prototype.hasOwnProperty.call(base, k) || opts.compareAll) compared[k] = proposed[k];
    }
    /* A fixture or a partial live pull must not look like the other
       wages were dropped. Compare only keys the parse actually returned. */
    var acceptedSide = {};
    for (k in compared) if (Object.prototype.hasOwnProperty.call(base, k)) acceptedSide[k] = base[k];
    var rev = parsed.ok ? lib.review(acceptedSide, compared, THRESHOLD) : { threshold: THRESHOLD, flags: [], needsReview: false, unparsed: true };
    var snapshot = Object.assign({
      source: ID,
      url: URL,
      read: read,
      threshold: THRESHOLD,
      ok: parsed.ok,
      metrics: compared,
      note: 'Wages are compared with the accepted snapshot. Nothing here is copied onto accepted.json.'
    }, extra || {});
    return { id: ID, ok: parsed.ok, live: !opts.fixture, review: rev, written: lib.writeProposed(ID, snapshot, rev, !!opts.dryRun), snapshot: snapshot };
  }
  if (opts.fixture) return Promise.resolve(finish(parseApi(fs.readFileSync(opts.fixture, 'utf8')), { fixture: true }));
  var areas = targetsFromAccepted(accepted);
  if (opts.areas) areas = areas.filter(function (a) { return opts.areas.indexOf(a.code) >= 0; });
  var ids = [];
  areas.forEach(function (a) {
    SOC.forEach(function (soc) {
      ids.push(seriesId(a.areaType, a.area7, soc, '03'));
      ids.push(seriesId(a.areaType, a.area7, soc, '01'));
    });
  });
  var batches = [];
  var i;
  for (i = 0; i < ids.length; i += 25) batches.push(ids.slice(i, i + 25));
  var merged = { Results: { series: [] } };
  var chain = Promise.resolve({ ok: true, robots: null });
  batches.forEach(function (batch) {
    chain = chain.then(function (prev) {
      if (!prev.ok && prev.robots && !prev.robots.allowed) return prev;
      var payload = { seriesid: batch, startyear: '2025', endyear: '2025' };
      if (process.env.BLS_API_KEY) payload.registrationkey = process.env.BLS_API_KEY;
      var body = JSON.stringify(payload);
      return lib.fetchChecked(URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        body: body,
        timeout: 40000
      }).then(function (res) {
        if (!res.ok) return res;
        var json = JSON.parse(res.body.toString('utf8'));
        var series = (json.Results && json.Results.series) || [];
        merged.Results.series = merged.Results.series.concat(series);
        return { ok: true, robots: res.robots };
      });
    });
  });
  return chain.then(function (res) {
    if (!res.ok) return finish({ ok: false, metrics: {} }, { error: res.robots && !res.robots.allowed ? res.robots.note : ('HTTP ' + res.status), robots: res.robots });
    return finish(parseApi(merged), { robots: res.robots, seriesRequested: ids.length });
  });
}

module.exports = {
  ID: ID, URL: URL, SOC: SOC, FIPS: FIPS, THRESHOLD: THRESHOLD,
  seriesId: seriesId, parseApi: parseApi, metricsOf: metricsOf, collect: collect
};
