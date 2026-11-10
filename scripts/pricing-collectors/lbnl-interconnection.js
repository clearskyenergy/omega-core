/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   LBNL interconnection-cost collector. It records a completed-project
   mean only when the briefing text states that mean. It does not
   average the three ISOs into one price. */
'use strict';

var fs = require('fs');
var lib = require('./lib');

var ID = 'lbnl-interconnection';
var THRESHOLD = 0.01;
var BRIEFS = [
  {
    id: 'spp',
    iso: 'SPP',
    url: 'https://eta-publications.lbl.gov/sites/default/files/berkeley_lab_2023.04.20-_spp_interconnection_costs.pdf',
    published: '2023-04',
    phrase: /(?:mean|average)[\s\S]{0,80}\$57\/kW/i,
    usdPerKw: 57
  },
  {
    id: 'pjm',
    iso: 'PJM',
    url: 'https://eta-publications.lbl.gov/sites/default/files/berkeley_lab_2023.1.12-_pjm_interconnection_costs.pdf',
    published: '2023-01',
    phrase: /mean:\s*\$42 to \$84\/kW/,
    usdPerKw: 84
  },
  {
    id: 'miso',
    iso: 'MISO',
    url: 'https://eta-publications.lbl.gov/sites/default/files/berkeley_lab_2022.10.06-_miso_interconnection_costs.pdf',
    published: '2022-10',
    phrase: /nearly doubled \(to \$102\/kW\)/,
    usdPerKw: 102
  }
];

function parseText(text) {
  var records = [];
  var metrics = {};
  var i, src;
  src = String(text);
  for (i = 0; i < BRIEFS.length; i++) {
    if (!BRIEFS[i].phrase.test(src)) continue;
    records.push({
      id: BRIEFS[i].id,
      iso: BRIEFS[i].iso,
      usdPerKw: BRIEFS[i].usdPerKw,
      url: BRIEFS[i].url,
      published: BRIEFS[i].published,
      dollarYear: 2022
    });
    metrics[BRIEFS[i].id] = BRIEFS[i].usdPerKw;
  }
  return { ok: records.length === BRIEFS.length, records: records, metrics: metrics };
}

function metricsOf(accepted) {
  var out = {};
  var rows = (accepted && accepted.records) || [];
  var i;
  for (i = 0; i < rows.length; i++) out[rows[i].id] = rows[i].usdPerKw;
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
      url: BRIEFS[0].url,
      read: read,
      threshold: THRESHOLD,
      ok: parsed.ok,
      records: parsed.ok ? parsed.records : [],
      note: 'Completed-project means. Not a behind-the-meter unit cost and not averaged into one number.'
    }, extra || {});
    return { id: ID, ok: parsed.ok, live: !opts.fixture, review: rev, written: lib.writeProposed(ID, snapshot, rev, !!opts.dryRun), snapshot: snapshot };
  }
  if (opts.fixture) return Promise.resolve(finish(parseText(fs.readFileSync(opts.fixture, 'utf8')), { fixture: true }));
  var texts = [];
  var chain = Promise.resolve({ ok: true });
  BRIEFS.forEach(function (b) {
    chain = chain.then(function () {
      return lib.fetchChecked(b.url, { timeout: 45000 }).then(function (res) {
        if (!res.ok) {
          texts.push('');
          return res;
        }
        var extracted = lib.pdfText(res.body);
        texts.push(extracted.ok ? extracted.text : '');
        return res;
      });
    });
  });
  return chain.then(function (res) {
    var parsed = parseText(texts.join('\n'));
    if (!parsed.ok) return finish({ ok: false, records: [], metrics: {} }, { error: 'A briefing mean was not in the extracted text. Accepted means were left in place.', robots: res && res.robots });
    return finish(parsed, { robots: res && res.robots });
  });
}

module.exports = { ID: ID, BRIEFS: BRIEFS, THRESHOLD: THRESHOLD, parseText: parseText, collect: collect };
