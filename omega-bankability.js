/* ═══════════════════════════════════════════════════════════════════════════
   omega-bankability.js — draw a readiness score the server already computed
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Editor-v2 and funding-v2.html both load this file. It does not score.
   The weights, the hard gates and the line to be listed live in
   api/_lib/bankability.js and come back on the response. A bar is the
   server's earned/points, shown, not recomputed into a different answer.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pct(earned, points) {
    var e = +earned || 0, p = +points || 0;
    if (p <= 0) return 0;
    var n = Math.round(e / p * 100);
    if (n < 0) return 0;
    if (n > 100) return 100;
    return n;
  }

  function ring(result) {
    var score = result && result.score != null ? result.score : 0;
    var visible = !!(result && result.visible);
    var label = visible ? 'Listed' : 'Not listed';
    return '<div class="bk-ring' + (visible ? ' is-on' : '') + '" data-score="' + esc(score) + '">'
      + '<div class="bk-num">' + esc(score) + '</div>'
      + '<div class="bk-of">of 100</div>'
      + '<div class="bk-flag">' + label + '</div></div>';
  }

  function items(list) {
    var html = '<ol class="bk-items">';
    (list || []).forEach(function (it) {
      var state = it.pass ? (it.earned >= it.points ? 'full' : 'partial') : 'gap';
      html += '<li class="bk-' + state + '"><div class="bk-row"><span>' + esc(it.label) + '</span>'
        + '<b>' + esc(it.earned) + ' / ' + esc(it.points) + '</b></div>'
        + '<div class="bk-bar"><i style="width:' + pct(it.earned, it.points) + '%"></i></div>'
        + (it.missing ? '<p>' + esc(it.missing) + '</p>' : '')
        + '</li>';
    });
    return html + '</ol>';
  }

  function checklist(lines) {
    if (!lines || !lines.length) return '<p class="bk-clear">Nothing is missing for the financier list.</p>';
    var html = '<ul class="bk-check">';
    lines.forEach(function (line) { html += '<li>' + esc(line) + '</li>'; });
    return html + '</ul>';
  }

  function summary(card) {
    if (!card) return '';
    function row(k, v) {
      return '<div class="bk-kv"><span>' + esc(k) + '</span><b>' + esc(v == null || v === '' ? '—' : v) + '</b></div>';
    }
    var streams = '';
    (card.streams || []).forEach(function (s) {
      streams += '<li><b>' + esc(s.name) + '</b>'
        + (s.assumption ? '<span>' + esc(s.assumption) + '</span>' : '')
        + (s.source ? '<span class="bk-src">' + esc(s.source) + '</span>' : '')
        + '</li>';
    });
    var risks = '';
    (card.risks || []).forEach(function (r) { risks += '<li>' + esc(r) + '</li>'; });
    return '<article class="bk-sum">'
      + '<header><h2>' + esc(card.name) + '</h2>'
      + (card.illustrative ? '<span class="bk-pill">Illustrative</span>' : '')
      + '</header>'
      + '<div class="bk-facts">'
      + row('ROM', card.askText) + row('IRR', card.irrText) + row('NPV', card.npvText) + row('Payback', card.paybackText)
      + row('Place', card.place) + row('Technology', card.techLabel) + row('Stage', card.devStage)
      + row('Offtake', card.offtake) + row('Basis', card.basis) + row('Readiness', card.score)
      + '</div>'
      + '<h3>Value stack</h3>'
      + (streams ? '<ul class="bk-streams">' + streams + '</ul>' : '<p class="bk-muted">No stream was on the package.</p>')
      + '<h3>Risks on the record</h3>'
      + (risks ? '<ul class="bk-risks">' + risks + '</ul>' : '<p class="bk-muted">No gap was left on a gate that passed.</p>')
      + '</article>';
  }

  function compare(table) {
    if (!table) return '';
    var head = '<tr><th></th>' + (table.names || []).map(function (n) { return '<th>' + esc(n) + '</th>'; }).join('') + '</tr>';
    var body = '';
    (table.rows || []).forEach(function (r) {
      body += '<tr><th>' + esc(r.label) + '</th>' + (r.cells || []).map(function (c) { return '<td>' + esc(c) + '</td>'; }).join('') + '</tr>';
    });
    return '<table class="bk-compare"><thead>' + head + '</thead><tbody>' + body + '</tbody></table>';
  }

  global.OmegaBankability = { esc: esc, ring: ring, items: items, checklist: checklist, summary: summary, compare: compare };
})(typeof window !== 'undefined' ? window : global);
