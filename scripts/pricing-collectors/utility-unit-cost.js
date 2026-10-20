/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   Utility unit-cost collector. PG&E's Unit Cost Guide and ComEd's
   DER interconnection cost guide are public. A figure is stored only
   when the line that names the equipment also states the dollar.
   Nothing here is escalated with a PPI. */
'use strict';

var fs = require('fs');
var lib = require('./lib');

var ID = 'utility-unit-cost';
var PGE = 'https://www.pge.com/assets/pge/docs/about/doing-business-with-pge/unit-cost-guide.pdf';
var COMED = 'https://www.comed.com/cdn/assets/v3/assets/blt3ebb3fed6084be2a/blt2bdb5921266bf5c4/67742fbd63a97db2f50004f7/DER_Interconnection_Guidelines_for_Customers_2024-v3.pdf';
var THRESHOLD = 0.05;

var ANCHORS = [
  { id: 'pge.xfmr.150', re: /150kva\s*&\s*Sec\.\s*Cable\(120\/208V\)/i, unit: '$/each', bookLine: 'el.transformer.kva', source: 'pge' },
  { id: 'pge.xfmr.300', re: /300kva\s*&\s*Sec\.\s*Cable\(120\/208V\)/i, unit: '$/each', bookLine: 'el.transformer.kva', source: 'pge' },
  { id: 'pge.xfmr.750', re: /750kva\s*&\s*Sec\.\s*Cable\(480\/277V\)/i, unit: '$/each', bookLine: 'el.transformer.kva', source: 'pge' },
  { id: 'pge.xfmr.1000', re: /1000kva\s*&\s*Sec\.\s*Cable\(480\/277V\)/i, unit: '$/each', bookLine: 'el.transformer.kva', source: 'pge' },
  { id: 'pge.xfmr.1500', re: /1500kva\s*&\s*Sec\.\s*Cable\(480\/277V\)/i, unit: '$/each', bookLine: 'el.transformer.kva', source: 'pge' },
  { id: 'pge.switch.pme5', re: /PME\s*5\s*Padmount Switch/i, unit: '$/each', bookLine: 'el.switchgear', source: 'pge' },
  { id: 'pge.switch.pcc', re: /Padmounted Visible SW at PCC/i, unit: '$/each', bookLine: 'el.switchgear', source: 'pge' },
  { id: 'pge.relay.ipac', re: /New IPAC relay cabinet/i, unit: '$/each', bookLine: 'el.protection', source: 'pge' },
  { id: 'pge.relay.dtt', re: /Direct Transfer Trip/i, unit: '$/each', bookLine: 'el.protection', source: 'pge' },
  { id: 'pge.ug.sf', re: /New UG Line\(SF\)-\s*Trench and Install/i, unit: '$/ft', bookLine: null, source: 'pge' },
  { id: 'comed.relay.substation', re: /Substation Relay/i, unit: '$/each', bookLine: 'el.protection', source: 'comed' },
  { id: 'comed.ug.12kv', re: /12kV Underground/i, unit: '$/ft', bookLine: null, source: 'comed' },
  { id: 'comed.xfmr.btm500', re: /Behind the meter > 500kW/i, unit: '$/each', bookLine: 'el.transformer.kva', source: 'comed' }
];

function dollarsOnLine(line) {
  var per = line.match(/\$([0-9][0-9,]*)\s*\/\s*ft/i) || line.match(/\$([0-9][0-9,]*)\/ft/i);
  if (per) return lib.num(per[1]);
  var m = line.match(/\$([0-9][0-9,]*)/);
  return m ? lib.num(m[1]) : null;
}

function parseText(text) {
  var lines = String(text).split(/\r?\n/);
  var records = [];
  var metrics = {};
  var i, a, n, line;
  for (i = 0; i < ANCHORS.length; i++) {
    a = ANCHORS[i];
    for (n = 0; n < lines.length; n++) {
      line = lines[n];
      if (!a.re.test(line)) continue;
      var usd = dollarsOnLine(line);
      if (usd == null) continue;
      records.push({ id: a.id, usd: usd, unit: a.unit, bookLine: a.bookLine, source: a.source });
      metrics[a.id] = usd;
      break;
    }
  }
  return { ok: metrics['pge.xfmr.150'] != null && metrics['pge.switch.pme5'] != null && metrics['pge.relay.ipac'] != null, records: records, metrics: metrics };
}

function metricsOf(accepted) {
  var out = {};
  var rows = (accepted && accepted.records) || [];
  var i;
  for (i = 0; i < rows.length; i++) out[rows[i].id] = rows[i].usd;
  return out;
}

/* A source that was not fetched must not look like its figures were
   withdrawn. A source that was fetched and lost a line still flags. */
function reviewMetrics(accepted, proposed, fetched) {
  var base = metricsOf(accepted);
  var side = {};
  var k, src;
  fetched = fetched || { pge: true, comed: true };
  function sourceOf(key) { return key.indexOf('comed.') === 0 ? 'comed' : 'pge'; }
  for (k in proposed) {
    if (Object.prototype.hasOwnProperty.call(proposed, k) && Object.prototype.hasOwnProperty.call(base, k)) side[k] = base[k];
  }
  for (k in base) {
    if (!Object.prototype.hasOwnProperty.call(base, k)) continue;
    src = sourceOf(k);
    if (fetched[src] && !Object.prototype.hasOwnProperty.call(proposed, k)) side[k] = base[k];
  }
  return side;
}

function collect(opts) {
  opts = opts || {};
  var read = opts.read || lib.readDate();
  var accepted = lib.readAccepted(ID);
  function finish(parsed, extra) {
    var fetched = (extra && extra.fetched) || { pge: true, comed: true };
    var rev = parsed.ok ? lib.review(reviewMetrics(accepted, parsed.metrics, fetched), parsed.metrics, THRESHOLD) : { threshold: THRESHOLD, flags: [], needsReview: false, unparsed: true };
    var records = parsed.ok ? parsed.records.slice() : [];
    var carried = false;
    if (parsed.ok && !fetched.comed && accepted && accepted.records) {
      var i;
      for (i = 0; i < accepted.records.length; i++) {
        if (String(accepted.records[i].id).indexOf('comed.') === 0) records.push(accepted.records[i]);
      }
      carried = true;
    }
    var snapshot = Object.assign({
      source: ID,
      url: PGE,
      comedUrl: COMED,
      read: read,
      threshold: THRESHOLD,
      ok: parsed.ok,
      records: records,
      note: 'Utility interconnection facilities, as printed. A transformer row includes the guide\'s secondary cable where the guide says so. These are not a bare $/kVA, not a customer trench, and not escalated.'
        + (carried ? ' ComEd was not fetched on this run. Its accepted figures are carried here and were not re-read.' : '')
    }, extra || {});
    return { id: ID, ok: parsed.ok, live: !opts.fixture, review: rev, written: lib.writeProposed(ID, snapshot, rev, !!opts.dryRun), snapshot: snapshot };
  }
  if (opts.fixture) return Promise.resolve(finish(parseText(fs.readFileSync(opts.fixture, 'utf8')), { fixture: true }));
  return lib.fetchChecked(PGE, { timeout: 45000 }).then(function (pge) {
    if (!pge.ok) return finish({ ok: false }, { error: pge.robots && !pge.robots.allowed ? pge.robots.note : ('PG&E HTTP ' + pge.status), robots: pge.robots });
    var extracted = lib.pdfText(pge.body, 'layout');
    if (!extracted.ok) return finish({ ok: false }, { error: extracted.error });
    return lib.fetchChecked(COMED, { timeout: 45000 }).then(function (comed) {
      var extraText = '';
      if (comed.ok) {
        var ctext = lib.pdfText(comed.body, 'layout');
        if (ctext.ok) extraText = '\n' + ctext.text;
      }
      var parsed = parseText(extracted.text + extraText);
      if (!parsed.ok) return finish({ ok: false }, { error: 'The unit-cost lines did not parse. Accepted figures were left in place.', robots: pge.robots, fetched: { pge: true, comed: !!comed.ok } });
      return finish(parsed, { robots: pge.robots, comed: comed.ok ? 'fetched' : (comed.robots && comed.robots.note), fetched: { pge: true, comed: !!comed.ok } });
    });
  });
}

module.exports = { ID: ID, PGE: PGE, COMED: COMED, THRESHOLD: THRESHOLD, parseText: parseText, reviewMetrics: reviewMetrics, collect: collect };
