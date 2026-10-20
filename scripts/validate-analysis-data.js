#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   npm run validate:data
   Offline reference cases, rate bounds, ZIP territory and source age.
   --live also queries the open hosting-capacity services (no key).
   OPENEI_API_KEY and EIA_API_KEY, when set, add one URDB and one EIA
   spot check. Neither key is required. Nothing here writes production
   data or environment variables.

   Exit 0 when there is no error. A warning is printed and does not fail
   the run. --strict fails on warnings too. */
'use strict';
var fs = require('fs');
var C = require('../api/_lib/analysis-checks');
var H = require('../api/_lib/hosting-capacity');
var Rates = require('../api/_lib/utility-rates');

function flag(name) { return process.argv.indexOf(name) >= 0; }
function option(name) {
  var i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}
function envNum(name, dflt) {
  if (process.env[name] == null || process.env[name] === '') return dflt;
  var n = +process.env[name];
  return isFinite(n) ? n : dflt;
}

function recount(report) {
  var errors = report.checks.filter(function (c) { return !c.ok && c.severity === 'error'; });
  var warnings = report.checks.filter(function (c) { return !c.ok && c.severity === 'warn'; });
  report.summary = {
    passed: report.checks.filter(function (c) { return c.ok; }).length,
    errors: errors.length,
    warnings: warnings.length,
    checks: report.checks.length
  };
  report.ok = errors.length === 0 && !(flag('--strict') && warnings.length > 0);
  return report;
}

function lines(report) {
  var s = report.summary;
  var out = ['Analysis validation — ' + s.passed + ' passed, ' + s.errors + ' error' + (s.errors === 1 ? '' : 's') + ', ' + s.warnings + ' warning' + (s.warnings === 1 ? '' : 's') + ' (' + report.mode + ')'];
  report.checks.forEach(function (c) {
    if (c.ok && c.severity !== 'warn') return;
    if (c.ok) return;
    out.push('  ' + (c.severity === 'error' ? 'ERROR' : 'WARN ') + '  ' + c.id + '  ' + c.message);
  });
  if (report.ok && s.warnings === 0 && s.errors === 0) out.push('  No errors or warnings.');
  out.push('  JSON: ' + (option('--out') || 'pass --out <file> to write the machine-readable report'));
  return out.join('\n');
}

function push(report, c) { report.checks.push(c); }

async function getJson(url) {
  var res = await fetch(url, { headers: { Accept: 'application/json' } });
  var text = await res.text();
  var body;
  try { body = JSON.parse(text); } catch (e) { body = { parseError: true, text: text.slice(0, 200) }; }
  return { status: res.status, body: body };
}

async function live(report) {
  report.mode = 'live';
  var points = {
    'pge-grip': { lat: 37.7749, lon: -122.4194, label: 'San Francisco' },
    'ng-ma-feeder': { lat: 42.2626, lon: -71.8023, label: 'Worcester, MA' },
    'ng-ny-feeder': { lat: 42.8656, lon: -78.7709, label: 'Buffalo area, National Grid NY' }
  };
  var ids = Object.keys(points), i;
  for (i = 0; i < ids.length; i++) {
    var id = ids[i], pt = points[id];
    var check = { id: 'live.' + id, severity: 'info', ok: false, message: '', detail: { place: pt.label } };
    try {
      var got = await getJson(H.queryUrl(id, pt.lat, pt.lon));
      var err = got.body && got.body.error;
      var feats = ((got.body && got.body.features) || []).map(function (f) { return H.normalize(id, f); })
        .filter(function (r) { return r.loadKw != null || r.pvKw != null; });
      check.ok = got.status === 200 && !err && feats.length > 0;
      if (!check.ok) check.severity = 'error';
      check.message = check.ok
        ? id + ' returned ' + feats.length + ' hosting figure(s) at ' + pt.label
        : id + ' returned no hosting figure' + (err ? ' (' + (err.message || err.code) + ')' : '');
      check.detail.sample = feats[0] || null;
      check.detail.status = got.status;
    } catch (e) {
      check.message = id + ' request failed: ' + (e && e.message ? e.message : e);
    }
    push(report, check);
  }

  if (!process.env.OPENEI_API_KEY) {
    push(report, { id: 'live.openei', severity: 'info', ok: true,
      message: 'OPENEI_API_KEY is not set. The URDB spot check was skipped. A free key is at https://openei.org/services/api/signup/',
      detail: { skipped: true } });
  } else {
    var oe = { id: 'live.openei', severity: 'error', ok: false, message: '', detail: null };
    try {
      var oeUrl = 'https://api.openei.org/utility_rates?version=latest&format=json&detail=minimal&sector=Commercial&address=60601&limit=1&api_key=' + encodeURIComponent(process.env.OPENEI_API_KEY);
      var oeGot = await getJson(oeUrl);
      var items = oeGot.body && (oeGot.body.items || oeGot.body.rates);
      oe.ok = oeGot.status === 200 && items && items.length > 0;
      oe.message = oe.ok ? 'OpenEI URDB returned a commercial rate record for ZIP 60601' : 'OpenEI URDB did not return a rate for ZIP 60601';
      oe.detail = { status: oeGot.status, name: items && items[0] && (items[0].name || items[0].label) };
    } catch (e) { oe.message = 'OpenEI request failed: ' + (e && e.message); }
    push(report, oe);
  }

  if (!process.env.EIA_API_KEY) {
    push(report, { id: 'live.eia', severity: 'info', ok: true,
      message: 'EIA_API_KEY is not set. The retail-price spot check was skipped. A free key is at https://www.eia.gov/opendata/',
      detail: { skipped: true } });
  } else {
    var eia = { id: 'live.eia', severity: 'warn', ok: true, message: '', detail: null };
    try {
      var eiaUrl = 'https://api.eia.gov/v2/electricity/retail-sales/data/?api_key=' + encodeURIComponent(process.env.EIA_API_KEY) +
        '&frequency=annual&data[0]=price&facets[stateid][]=IL&facets[sectorid][]=COM&sort[0][column]=period&sort[0][direction]=desc&length=1';
      var eiaGot = await getJson(eiaUrl);
      var row = eiaGot.body && eiaGot.body.response && eiaGot.body.response.data && eiaGot.body.response.data[0];
      var cents = row && +row.price;
      var book = Rates.lookup('60601').energyRate;
      if (!(cents > 0)) {
        eia.ok = false; eia.severity = 'error';
        eia.message = 'EIA did not return an Illinois commercial retail price';
      } else {
        var eiaPerKwh = cents > 1 ? cents / 100 : cents;
        var ratio = book / eiaPerKwh;
        eia.ok = ratio > 0.5 && ratio < 2;
        eia.severity = eia.ok ? 'info' : 'warn';
        eia.message = 'Illinois commercial retail price is ' + eiaPerKwh.toFixed(4) + ' $/kWh (' + row.period + '). The ComEd planning energy rate is ' + book + ' $/kWh.';
        eia.detail = { period: row.period, eiaPerKwh: eiaPerKwh, bookPerKwh: book, ratio: Math.round(ratio * 100) / 100 };
      }
    } catch (e) {
      eia.ok = false; eia.severity = 'error';
      eia.message = 'EIA request failed: ' + (e && e.message);
    }
    push(report, eia);
  }
  return recount(report);
}

var report = C.run({
  now: new Date(),
  staleDays: envNum('VALIDATE_STALE_DAYS', 45),
  errorDays: envNum('VALIDATE_STALE_ERROR_DAYS', 180)
});

var pending = flag('--live') ? live(report) : Promise.resolve(recount(report));
pending.then(function (out) {
  var text = lines(out);
  console.log(text);
  var dest = option('--out');
  if (dest) fs.writeFileSync(dest, JSON.stringify(out, null, 2));
  if (flag('--json')) console.log(JSON.stringify(out, null, 2));
  process.exit(out.ok ? 0 : 1);
}).catch(function (e) {
  console.error(e && e.stack || e);
  process.exit(1);
});
