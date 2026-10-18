/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   State DOT average unit-price collector.
   TxDOT's open-data bid tabs are the official line items. The
   quantity-weighted mean is of rank-1 bids only. IDOT's awarded-price
   report is an email subscription and is not fetched. A Caltrans
   electrical-conduit average is recorded only when that page states one. */
'use strict';

var fs = require('fs');
var lib = require('./lib');

var ID = 'state-dot';
var TX_API = 'https://data.texas.gov/resource/de7b-7dna.json';
var TX_PAGE = 'https://data.texas.gov/dataset/Bid-Tabulations/de7b-7dna';
var THRESHOLD = 0.05;
var ITEMS = [
  { code: '618-7030', description: 'CONDT (PVC) (SCH 40) (2")', bookLine: 'el.conduit.ft' },
  { code: '618-7036', description: 'CONDT (PVC) (SCH 40) (3")', bookLine: null },
  { code: '618-7040', description: 'CONDT (PVC) (SCH 40) (4")', bookLine: null }
];

function weighted(rows, code) {
  var n = 0, qty = 0, cost = 0, unit = null, dates = [];
  var i, row, price, q, rank;
  for (i = 0; i < rows.length; i++) {
    row = rows[i];
    if (row.bid_code !== code) continue;
    rank = String(row.bid_rank_sequence_number || '');
    if (rank !== '1') continue;
    price = lib.num(row.bid_item_unit_price_amount);
    q = lib.num(row.bid_item_quantity);
    if (!(price >= 0) || !(q > 0)) continue;
    n += 1;
    qty += q;
    cost += price * q;
    unit = row.measurement_unit || unit;
    if (row.project_actual_let_date) dates.push(String(row.project_actual_let_date).slice(0, 10));
  }
  dates.sort();
  if (!n || !qty) return null;
  return {
    code: code,
    n: n,
    quantity: Math.round(qty),
    unit: unit,
    weightedAverage: Math.round((cost / qty) * 10000) / 10000,
    firstLet: dates[0] || null,
    lastLet: dates[dates.length - 1] || null
  };
}

function parseRows(rows) {
  var records = [];
  var metrics = {};
  var i, stat, spec;
  for (i = 0; i < ITEMS.length; i++) {
    spec = ITEMS[i];
    stat = weighted(rows, spec.code);
    if (!stat) continue;
    stat.description = spec.description;
    stat.bookLine = spec.bookLine;
    stat.price = spec.bookLine ? Math.round(stat.weightedAverage * 100) / 100 : null;
    records.push(stat);
    metrics[spec.code] = stat.weightedAverage;
  }
  return { ok: records.length > 0 && metrics['618-7030'] != null, records: records, metrics: metrics };
}

function metricsOf(accepted) {
  var out = {};
  var rows = (accepted && accepted.records && accepted.records.txdot) || [];
  var i;
  for (i = 0; i < rows.length; i++) out[rows[i].code] = rows[i].weightedAverage;
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
      url: TX_PAGE,
      api: TX_API,
      read: read,
      threshold: THRESHOLD,
      ok: parsed.ok,
      records: {
        txdot: parsed.ok ? parsed.records : [],
        idot: 'IDOT Pay Item Report with Awarded Prices is an email subscription (webapps.dot.illinois.gov). It was not fetched. A third-party bid page was not used.',
        caltrans: extra && extra.caltrans ? extra.caltrans : 'Not requested in this run.'
      },
      note: 'Item 618 is installed conduit, including excavation and backfill, per the TxDOT specification. It is not a bare material price and it is not escalated with the conduit PPI. Rank 2 and later bids are excluded. Engineer estimates are not rank 1.'
    }, extra || {});
    delete snapshot.caltrans;
    return { id: ID, ok: parsed.ok, live: !opts.fixture, review: rev, written: lib.writeProposed(ID, snapshot, rev, !!opts.dryRun), snapshot: snapshot };
  }
  if (opts.fixture) {
    var rows = JSON.parse(fs.readFileSync(opts.fixture, 'utf8'));
    return Promise.resolve(finish(parseRows(rows), { fixture: true, caltrans: 'fixture' }));
  }
  var where = "bid_rank_sequence_number = '1' AND (" + ITEMS.map(function (it) {
    return "bid_code = '" + it.code + "'";
  }).join(' OR ') + ')';
  function page(offset, acc) {
    var target = TX_API + '?$select=bid_code,bid_item_description,bid_item_unit_price_amount,bid_item_quantity,bid_rank_sequence_number,measurement_unit,project_actual_let_date&$where=' + encodeURIComponent(where) + '&$limit=1000&$offset=' + offset;
    return lib.fetchChecked(target, { timeout: 60000 }).then(function (res) {
      if (!res.ok) return { ok: false, res: res, rows: acc };
      var batch = JSON.parse(res.body.toString('utf8'));
      acc = acc.concat(batch);
      if (batch.length < 1000) return { ok: true, res: res, rows: acc };
      return page(offset + 1000, acc);
    });
  }
  return page(0, []).then(function (got) {
    if (!got.ok) {
      return finish({ ok: false, records: [], metrics: {} }, {
        error: got.res && got.res.robots && !got.res.robots.allowed ? got.res.robots.note : ('HTTP ' + (got.res && got.res.status)),
        robots: got.res && got.res.robots
      });
    }
    return finish(parseRows(got.rows), { robots: got.res.robots, rows: got.rows.length, caltrans: 'Caltrans Contract Cost Data did not return an electrical-conduit weighted average in the pages read. Irrigation and drainage pipe items were not used.' });
  });
}

module.exports = { ID: ID, TX_API: TX_API, ITEMS: ITEMS, THRESHOLD: THRESHOLD, weighted: weighted, parseRows: parseRows, collect: collect };
