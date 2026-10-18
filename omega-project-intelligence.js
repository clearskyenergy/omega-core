/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * Project Intelligence. The same weights, checks, and decision lines Site
 * Map uses (editor.html readProject): readiness 45%, site quality 35%,
 * economics 20%. Site quality is an INPUT from the site screen
 * (api/_lib/editor-score.js interconnect). This file does not score a
 * feeder, a tariff, or a parcel.
 *
 * Funding reads fundingReadiness(). When OmegaFundingReadiness.score
 * exists (the marketplace gate), that result wins and this file only
 * normalizes it. Until that module is present, the score above is the
 * gate.
 */
(function (root) {
  'use strict';

  var WEIGHTS = { readiness: 0.45, site: 0.35, economics: 0.20 };
  var PURSUE_AT = 75;
  var ADVANCE_AT = 52;

  function money(n) {
    if (!(isFinite(n) && n > 0)) return '';
    return '$' + Math.round(n).toLocaleString();
  }
  function num(v) {
    var n = +v;
    return isFinite(n) ? n : 0;
  }

  function checksOf(f) {
    var addr = String(f.address || '').trim();
    var kw = num(f.bessKw), kwh = num(f.bessKwh);
    var placed = num(f.placedCount), runs = num(f.conduitCount);
    var cost = num(f.cost), rev = num(f.revenue);
    var site = f.site || null;
    return [
      { key: 'site', ok: !!addr, w: 12, n: 'Site identified', d: addr || 'Enter and load the project address' },
      { key: 'system', ok: kw > 0 && kwh > 0, w: 16, n: 'System configured', d: kw > 0 ? ((kw / 1000).toFixed(2) + ' MW / ' + (kwh / 1000).toFixed(2) + ' MWh') : 'Select the BESS and operating size' },
      { key: 'layout', ok: placed > 0, w: 14, n: 'Concept layout', d: placed ? (placed + ' placed objects') : 'Place the primary equipment on the site' },
      { key: 'routing', ok: runs > 0, w: 10, n: 'Electrical routing', d: runs ? (runs + ' conduit runs drawn') : 'Route equipment to the point of interconnection' },
      { key: 'cost', ok: cost > 0, w: 14, n: 'Cost model', d: cost > 0 ? (money(cost) + ' installed estimate') : 'Run the construction cost estimate' },
      { key: 'revenue', ok: rev > 0, w: 14, n: 'Revenue model', d: rev > 0 ? (money(rev) + '/year enabled') : 'Run or enter the applicable value stack' },
      { key: 'evidence', ok: !!(site && site.anyReal), w: 12, n: 'Site data evidence', d: site && site.anyReal ? 'Location factors include project data' : 'Connect parcel, capacity, AHJ or Grid Atlas data' },
      { key: 'verified', ok: !!f.designVerified, w: 8, n: 'Design verified', d: f.designVerified ? 'Site map marked complete' : 'Verify BOM and mark the site map complete' }
    ];
  }

  function model(facts) {
    facts = facts || {};
    var checks = checksOf(facts);
    var ready = 0, i, missing = [];
    for (i = 0; i < checks.length; i++) {
      if (checks[i].ok) ready += checks[i].w;
      else missing.push(checks[i]);
    }
    var site = facts.site || null;
    var sp = site ? num(site.pct) : 0;
    var cost = num(facts.cost), rev = num(facts.revenue);
    var econ = cost && rev ? Math.max(0, Math.min(100, rev / cost * 650)) : 0;
    var score = Math.round(ready * WEIGHTS.readiness + sp * WEIGHTS.site + econ * WEIGHTS.economics);
    var decision = score >= PURSUE_AT && missing.length <= 2 ? 'PURSUE' : score >= ADVANCE_AT ? 'ADVANCE WITH CONDITIONS' : 'HOLD & DE-RISK';
    return {
      score: score,
      decision: decision,
      ready: ready,
      sitePct: sp,
      economics: Math.round(econ * 10) / 10,
      weights: { readiness: WEIGHTS.readiness, site: WEIGHTS.site, economics: WEIGHTS.economics },
      checks: checks,
      missing: missing,
      scenarios: scenarios({ cost: cost, rev: rev, net: num(facts.net) || cost }),
      source: 'omega-project-intelligence',
      siteScreen: site ? { score: num(site.score), pct: sp, anyReal: !!site.anyReal } : null
    };
  }

  function scenarios(x) {
    var net = x.net || x.cost || 0, rev = x.rev || 0;
    var rows = [
      { name: 'Conservative', cost: net * 1.12, revenue: rev * 0.78, base: false },
      { name: 'Base case', cost: net, revenue: rev, base: true },
      { name: 'Upside', cost: net * 0.94, revenue: rev * 1.18, base: false }
    ];
    var i, s;
    for (i = 0; i < rows.length; i++) {
      s = rows[i];
      s.paybackYears = s.revenue ? s.cost / s.revenue : null;
      s.cashOnCash = s.cost ? s.revenue / s.cost : null;
    }
    return rows;
  }

  function externalGate() {
    if (root.OmegaFundingReadiness && typeof root.OmegaFundingReadiness.score === 'function') return root.OmegaFundingReadiness;
    if (typeof require === 'function') {
      try { return require('./api/_lib/funding-readiness.js'); } catch (e) { /* not shipped yet */ }
    }
    return null;
  }

  function assess(facts) {
    var gate = externalGate();
    if (gate) {
      try {
        var ext = gate.score(facts || {});
        if (ext && typeof ext.score === 'number' && isFinite(ext.score)) {
          ext.source = ext.source || 'funding-readiness';
          if (!ext.decision) ext.decision = ext.score >= PURSUE_AT ? 'PURSUE' : ext.score >= ADVANCE_AT ? 'ADVANCE WITH CONDITIONS' : 'HOLD & DE-RISK';
          if (!ext.weights) ext.weights = { readiness: WEIGHTS.readiness, site: WEIGHTS.site, economics: WEIGHTS.economics };
          return ext;
        }
      } catch (err) { /* fall through to the local model */ }
    }
    return model(facts);
  }

  function fundingReadiness(facts) {
    var x = assess(facts);
    return {
      score: x.score,
      decision: x.decision,
      ready: x.score >= PURSUE_AT && (!x.missing || x.missing.length <= 2),
      weights: x.weights,
      checks: x.checks || [],
      source: x.source || 'omega-project-intelligence'
    };
  }

  var api = {
    assess: assess,
    model: model,
    scenarios: scenarios,
    fundingReadiness: fundingReadiness,
    WEIGHTS: WEIGHTS,
    VERSION: 'project-intelligence/1'
  };
  root.OmegaProjectIntelligence = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : global);
