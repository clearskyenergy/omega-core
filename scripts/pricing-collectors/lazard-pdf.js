/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   Lazard LCOE+ collector. It cites capital-cost ranges from the
   public PDF and does not store the PDF. A range is kept only when
   the header and the dollar pairs agree. No midpoint is taken. */
'use strict';

var fs = require('fs');
var lib = require('./lib');

var ID = 'lazard';
var V18 = 'https://www.lazard.com/media/5tlbhyla/lazards-lcoeplus-june-2025-_vf.pdf';
var V17 = 'https://www.lazard.com/media/xemfey0k/lazards-lcoeplus-june-2024-_vf.pdf';
var THRESHOLD = 0.05;

function ranges(line) {
  var re = /\$([0-9][0-9,]*(?:\.\d+)?)\s*[–\-]\s*\$([0-9][0-9,]*(?:\.\d+)?)/g;
  var out = [], m;
  while ((m = re.exec(line))) out.push({ low: lib.num(m[1]), high: lib.num(m[2]) });
  return out;
}

function editionAt(text, index) {
  var a = text.lastIndexOf('EDITION 18.0', index);
  var b = text.lastIndexOf('EDITION 17.0', index);
  if (a >= 0 || b >= 0) return a > b ? '18.0' : '17.0';
  var w = text.slice(Math.max(0, index - 500), Math.min(text.length, index + 1500));
  if (/V 1 8|V18\.0/.test(w)) return '18.0';
  if (/V17/.test(w)) return '17.0';
  return null;
}

function row(edition, technology, pair, unit, page) {
  return { edition: edition, technology: technology, low: pair.low, high: pair.high, unit: unit, page: page };
}

/* A hybrid page prints the same range twice, once per paired
   technology. Two different ranges on one line are not collapsed. */
function samePair(pairs) {
  var i;
  for (i = 1; i < pairs.length; i++) {
    if (pairs[i].low !== pairs[0].low || pairs[i].high !== pairs[0].high) return false;
  }
  return true;
}

function parseText(text) {
  var src = String(text);
  var records = [];
  var metrics = {};
  var re = /Total Capital Cost[^\n]*|Initial Capital Cost—DC[^\n]*|Initial Capital Cost-DC[^\n]*|Inverter Cost[^\n]*/g;
  var m, line, pre, pairs, edition, i;
  while ((m = re.exec(src))) {
    line = m[0];
    pairs = ranges(line);
    if (!pairs.length) continue;
    pre = src.slice(Math.max(0, m.index - 700), m.index);
    edition = editionAt(src, m.index);
    if (!edition) continue;
    if (/Inverter Cost/.test(line) && pairs.length >= 1 && samePair(pairs)) {
      records.push(row(edition, 'storage.hybrid.inverter', pairs[0], '$/kW', null));
      continue;
    }
    if (/excl\.\s*Inverter/.test(line) && pairs.length >= 1 && samePair(pairs)) {
      records.push(row(edition, 'storage.hybrid.exclInverter', pairs[0], '$/kWh', null));
      continue;
    }
    if (/Initial Capital Cost/.test(line)) {
      var names = edition === '17.0'
        ? ['storage.utility.1h.dc', 'storage.utility.2h.dc', 'storage.utility.4h.dc', 'storage.ci.dc', 'storage.residential.dc']
        : ['storage.utility.2h.dc', 'storage.utility.4h.dc', 'storage.ci.dc', 'storage.residential.dc'];
      if (pairs.length !== names.length) continue;
      for (i = 0; i < names.length; i++) records.push(row(edition, names[i], pairs[i], '$/kWh', null));
      continue;
    }
    if (/Rooftop Residential/.test(pre) && pre.lastIndexOf('Rooftop Residential') > pre.lastIndexOf('Geothermal') && pairs.length === 3) {
      records.push(row(edition, 'pv.residential', pairs[0], '$/kW', null));
      records.push(row(edition, 'pv.community', pairs[1], '$/kW', null));
      records.push(row(edition, 'pv.utility', pairs[2], '$/kW', null));
      continue;
    }
    if (/Community and C&I/.test(pre) && !/Rooftop Residential/.test(pre) && pairs.length === 2) {
      records.push(row(edition, 'pv.community', pairs[0], '$/kW', null));
      records.push(row(edition, 'pv.utility', pairs[1], '$/kW', null));
      continue;
    }
    if (/Geothermal/.test(pre) && /Wind/.test(pre) && pairs.length === 3 && !/Gas Peaking \(New Build\)/.test(line)) {
      records.push(row(edition, 'geothermal', pairs[0], '$/kW', null));
      records.push(row(edition, 'wind.onshore', pairs[1], '$/kW', null));
      records.push(row(edition, 'wind.offshore', pairs[2], '$/kW', null));
      continue;
    }
    if (/Gas Peaking \(New Build\)/.test(pre) && /Nuclear/.test(pre) && pairs.length === 4) {
      records.push(row(edition, 'gas.peaking', pairs[0], '$/kW', null));
      records.push(row(edition, 'nuclear', pairs[1], '$/kW', null));
      records.push(row(edition, 'coal', pairs[2], '$/kW', null));
      records.push(row(edition, 'gas.ccgt', pairs[3], '$/kW', null));
    }
  }
  var seen = {};
  records = records.filter(function (r) {
    var k = r.edition + '|' + r.technology;
    if (seen[k]) return false;
    seen[k] = 1;
    metrics[r.edition + '.' + r.technology + '.low'] = r.low;
    metrics[r.edition + '.' + r.technology + '.high'] = r.high;
    return true;
  });
  var need = ['18.0.pv.utility.low', '18.0.storage.utility.4h.dc.low', '17.0.pv.utility.low', '17.0.storage.utility.4h.dc.low'];
  var ok = need.every(function (k) { return metrics[k] != null; });
  return { ok: ok, records: records, metrics: metrics };
}

function metricsOf(accepted) {
  var out = {};
  var rows = (accepted && accepted.records) || [];
  var i;
  for (i = 0; i < rows.length; i++) {
    out[rows[i].edition + '.' + rows[i].technology + '.low'] = rows[i].low;
    out[rows[i].edition + '.' + rows[i].technology + '.high'] = rows[i].high;
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
      url: V18,
      priorUrl: V17,
      published: '2025-06',
      priorPublished: '2024-06',
      dollarYear: null,
      read: read,
      threshold: THRESHOLD,
      ok: parsed.ok,
      records: parsed.ok ? parsed.records : [],
      note: 'Ranges as printed. No midpoint. No dollar year is printed on the assumption pages. The illustrative single figure on the sample calculation page is not a published range and is not stored. The PDF is not stored. Lazard\'s footer limits redistribution of the material; this snapshot cites the capital-cost ranges and the URL.'
    }, extra || {});
    return { id: ID, ok: parsed.ok, live: !opts.fixture, review: rev, written: lib.writeProposed(ID, snapshot, rev, !!opts.dryRun), snapshot: snapshot };
  }
  if (opts.fixture) return Promise.resolve(finish(parseText(fs.readFileSync(opts.fixture, 'utf8')), { fixture: true }));
  function one(url) {
    return lib.fetchChecked(url, { timeout: 60000 }).then(function (res) {
      if (!res.ok) return { ok: false, res: res, text: '' };
      var extracted = lib.pdfText(res.body);
      return { ok: extracted.ok, res: res, text: extracted.ok ? extracted.text : '', error: extracted.error };
    });
  }
  return one(V18).then(function (a) {
    return one(V17).then(function (b) {
      if (!a.ok || !b.ok) {
        return finish({ ok: false }, { error: a.error || b.error || 'PDF was not fetched', robots: a.res && a.res.robots });
      }
      return finish(parseText('EDITION 18.0\n' + a.text + '\nEDITION 17.0\n' + b.text), { robots: a.res.robots });
    });
  });
}

module.exports = { ID: ID, V18: V18, V17: V17, THRESHOLD: THRESHOLD, parseText: parseText, ranges: ranges, collect: collect };
