/* ═══════════════════════════════════════════════════════════════════════════
   scripts/_lib/prospect-sources.js — where the companies are listed
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   THE REGISTRY the harvest reads (scripts/harvest-prospects.js). Each entry
   is one PUBLIC dataset that names the companies doing the work we sell to,
   grouped server-side so one request returns one row per company with a
   count of its projects: evidence, not a guess. Pull once, join offline,
   never a live join in a browser (docs/SALES-AGENT.md §5).

   What a harvest yields is a CANDIDATE: a company NAME and why it is on the
   list. Public project records carry no website and no person, so a
   candidate is never written to; the sales agent researches it (the
   company's own site, the right person, a work address) and only then does
   it become a prospect (POST /api/sales resolve-candidate).

   Adding a source: one entry here, verified by running
     node scripts/harvest-prospects.js --source <key>
   and reading the top of what it prints. Socrata portals (data.ny.gov,
   data.cityofchicago.org, data.ct.gov, …) take the same shape. A source that
   needs a login, a scrape of someone's HTML or a paid API does not belong
   here: those are a CSV somebody exports and hands to --csv.

   Checked 2026-09-27 against data.ny.gov (NYSERDA; open data, public
   domain terms of the NY Open Data portal).
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

var SOURCES = [
  { key: 'ny-commercial-solar', host: 'data.ny.gov', dataset: 'wgsj-jt5f', field: 'developer',
    where: "pv_system_size_kwac >= 100 AND interconnection_date > '2023-01-01'", last: 'interconnection_date',
    vertical: 'installer', state: 'NY', what: 'commercial solar projects (100 kWac and up) interconnected since 2023',
    label: 'NY distributed solar, commercial (NYSERDA)', page: 'https://data.ny.gov/d/wgsj-jt5f' },
  { key: 'ny-retail-storage', host: 'data.ny.gov', dataset: 'ugya-enpy', field: 'contractor',
    where: "program_type != 'Residential'", last: 'date_completed',
    vertical: 'installer', state: 'NY', what: 'retail or bulk energy storage projects in the NYSERDA incentive programs',
    label: 'NY retail and bulk storage incentives (NYSERDA)', page: 'https://data.ny.gov/d/ugya-enpy' },
  { key: 'ny-storage-interconnection', host: 'data.ny.gov', dataset: 'hspb-4n4p', field: 'developer',
    where: '', last: 'interconnection_date',
    vertical: 'installer', state: 'NY', what: 'energy storage interconnections', minProjects: 3,
    label: 'NY statewide energy storage interconnections (NYSERDA)', page: 'https://data.ny.gov/d/hspb-4n4p' },
  { key: 'ny-ev-charge-ready', host: 'data.ny.gov', dataset: '9wxk-hakb', field: 'contractor_applicant',
    where: '', last: 'installation_activation_date',
    vertical: 'installer', state: 'NY', what: 'Charge Ready NY EV charging installations',
    label: 'Charge Ready NY applicants (NYSERDA)', page: 'https://data.ny.gov/d/9wxk-hakb' },
  { key: 'ny-large-renewables', host: 'data.ny.gov', dataset: 'dprp-55ye', field: 'developer_name',
    where: '', last: '',
    vertical: 'developer', state: 'NY', what: 'large-scale renewable projects contracted by NYSERDA',
    label: 'NY large-scale renewables (NYSERDA)', page: 'https://data.ny.gov/d/dprp-55ye' }
];

/* not a company: what a form's free-text field collects instead */
var NOT_A_COMPANY = /^(n\/?a|none|unknown|self|self[- ]install(ed)?|homeowner|owner|customer|tbd|other|various|-+|\.+)$/i;

function byKey(k) { return SOURCES.filter(function (s) { return s.key === k; })[0] || null; }

/* one grouped request: a row per company, with its project count */
function url(src, limit) {
  var sel = src.field + ' as name, count(*) as n' + (src.last ? ', max(' + src.last + ') as last' : '');
  var where = src.field + ' IS NOT NULL' + (src.where ? ' AND ' + src.where : '');
  var q = { '$select': sel, '$where': where, '$group': src.field, '$order': 'n DESC', '$limit': String(limit || 1000) };
  return 'https://' + src.host + '/resource/' + src.dataset + '.json?' + Object.keys(q).map(function (k) { return k + '=' + encodeURIComponent(q[k]); }).join('&');
}

/* the grouped rows → candidates for POST /api/sales upsert-candidates */
function candidates(src, rows) {
  var min = src.minProjects || 1;
  return (rows || []).filter(function (r) {
    var name = String(r.name || '').trim();
    return name && !NOT_A_COMPANY.test(name) && Number(r.n) >= min;
  }).map(function (r) {
    var n = Math.round(Number(r.n) || 0), last = r.last ? String(r.last).slice(0, 10) : '';
    return {
      company: String(r.name).trim(), projects: n, state: src.state, vertical: src.vertical,
      source: { kind: 'harvest', ref: src.key }, tags: [String(src.state || '').toLowerCase(), src.key].filter(Boolean),
      evidence: [{ text: n + ' ' + src.what + (last ? ' (latest ' + last + ')' : ''), url: src.page, source: src.key }]
    };
  });
}

module.exports = { SOURCES: SOURCES, byKey: byKey, url: url, candidates: candidates, NOT_A_COMPANY: NOT_A_COMPANY };
