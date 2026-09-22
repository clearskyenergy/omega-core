/* ==========================================================================
   omega-project-cost.js  ·  ClearSky-OMEGA shared platform file
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   --------------------------------------------------------------------------
   WHAT IT COSTS US TO DEPLOY HERE, from the site finder's property card and
   the phone app: the installed battery, plus site control two ways — buy the
   building at its asking price, or lease the pad at the host-lease rent.
   Every number comes from /api/project-cost (CLAUDE.md: pricing lives in
   /api/, never here); this file asks, renders and summarises.

     OmegaProjectCost.quote(payload, cb)   cb(err, result)  POST /api/project-cost
     OmegaProjectCost.html(result, opts)   the comparison block; opts.tiles is
                                           the host page's tile class
     OmegaProjectCost.summary(result)      one paragraph for a note or a share

   ES5, no build step. Firebase compat auth off window.firebase, as the lease
   module does.
   ========================================================================== */
(function (root) {
  'use strict';
  if (root.OmegaProjectCost) return;
  var ENDPOINT = '/api/project-cost';
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function money(v) { return v == null || !isFinite(v) ? '—' : '$' + Math.round(v).toLocaleString(); }
  function fmt(v) { return v == null || !isFinite(v) ? '—' : Math.round(v).toLocaleString(); }

  function quote(payload, cb) {
    var user = root.firebase && root.firebase.auth && root.firebase.auth().currentUser;
    if (!user) { cb(new Error('Sign in to cost this project.')); return; }
    user.getIdToken().then(function (token) {
      return fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify(payload) });
    }).then(function (res) {
      return res.json().then(function (d) { if (!res.ok) throw new Error((d.error && (d.error.message || d.error)) || 'Project cost unavailable'); return d; });
    }).then(function (d) { cb(null, d); })['catch'](function (e) { cb(e); });
  }

  function html(result, opts) {
    opts = opts || {};
    var r = result && result.result; if (!r) return '';
    var tiles = opts.tiles || 'tiles', c = r.capex, b = r.buy, l = r.lease;
    var h = '<div class="' + tiles + ' pcTiles">' +
      '<div><b>' + money(c.base) + '</b>to build ' + fmt(r.kw) + ' kW / ' + fmt(r.kwh) + ' kWh' + (c.perKwh ? ' · ' + money(c.perKwh) + '/kWh' : '') + '</div>' +
      '<div><b>' + (b.pending ? 'Pending' : money(b.total)) + '</b>buy the building' + (b.pending ? '' : ' · ' + money(b.askPrice) + ' asking + build') + '</div>' +
      '<div><b>' + money(l.total) + '</b>lease the pad · ' + money(l.siteControl) + ' rent over ' + l.termYears + ' yrs + build</div></div>';
    h += '<p class="note pcVerdict"><b>' + esc(r.compare.sentence) + '</b></p>';
    h += '<p class="note">' + (c.estimateClassPlain ? esc(c.estimateClassPlain) + '. ' : '') +
      (c.rangeLow != null ? 'Build range ' + money(c.rangeLow) + ' to ' + money(c.rangeHigh) + '. ' : '') +
      (c.incentives ? 'Screening incentives of about ' + money(c.incentives) + ' would bring the build to ' + money(c.net) + ' net. ' : '') +
      (c.assumedSize ? 'Sized on an assumption, not a circuit. ' : '') +
      (b.pending ? esc(b.note) + ' ' : '') +
      'Rent shown at the base offer (' + money(l.monthly) + '/mo); the walk-away and high bands put the term at ' + money(l.bands.low) + ' to ' + money(l.bands.high) + '.</p>';
    if (result.disclaimer) h += '<p class="note">' + esc(result.disclaimer) + '</p>';
    return h;
  }

  function summary(result) {
    var r = result && result.result; if (!r) return '';
    var b = r.buy, l = r.lease;
    return 'Cost to deploy ' + fmt(r.kw) + ' kW / ' + fmt(r.kwh) + ' kWh: build ' + money(r.capex.base) +
      (b.pending ? '; buy route pending an asking price' : '; buy the building ' + money(b.total) + ' all-in (' + money(b.askPrice) + ' asking)') +
      '; lease the pad ' + money(l.total) + ' all-in (' + money(l.siteControl) + ' rent over ' + l.termYears + ' years). ' + r.compare.sentence + ' Estimate, not a bid.';
  }

  root.OmegaProjectCost = { quote: quote, html: html, summary: summary, ENDPOINT: ENDPOINT };
})(typeof window !== 'undefined' ? window : this);
