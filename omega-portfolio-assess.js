/* ═══════════════════════════════════════════════════════════════════════════
   omega-portfolio-assess.js — the pages' one drawing of the SITE ASSESSMENT
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   ES5, no build step. Decides nothing and computes nothing: every figure,
   word and state is the server's answer (api/_lib/portfolio/assess.js
   through api/site-crm.js). The register (portfolio.html) asks it for a
   row's cells and for the side panel's card:
     OmegaPortfolioAssess.cells(a)          the row's five cells, as HTML
     OmegaPortfolioAssess.card(site, a, o)  the side panel's card, as HTML
     OmegaPortfolioAssess.wire(root, site, hooks)   its buttons:
        hooks.run(siteId)  hooks.approve(siteId, uses[])  hooks.full(siteId)
        → Promise of GET ?assessment=1   hooks.check(siteId, item, state, note)
        → Promise of the new readiness   hooks.canEdit
   `a` is a site's `assessment` on the register's answer (null: never run).
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function n0(n) { return Math.round(n).toLocaleString('en-US'); }
  function money(n) { if (n == null || !isFinite(n)) return null; var a = Math.abs(n), s = a >= 1e6 ? (a / 1e6).toFixed(2) + 'M' : a >= 1e3 ? Math.round(a / 1e3) + 'k' : String(Math.round(a)); return (n < 0 ? '−$' : '$') + s; }
  function kwWord(kw) { return kw >= 1000 ? (Math.round(kw / 10) / 100) + ' MW' : n0(kw) + ' kW'; }
  function kwhWord(kwh) { return kwh >= 1000 ? (Math.round(kwh / 10) / 100) + ' MWh' : n0(kwh) + ' kWh'; }
  function pct(p) { return p == null ? null : (Math.round(p * 10) / 10) + '%'; }
  var BASIS = { measured: ['free', 'pa-ok', 'Measured'], entered: ['entered', 'pa-blue', 'Entered'], ceiling: ['ceiling', 'pa-warn', 'Ceiling'] };

  var CSS = '.pa-sub{font-size:11.5px;color:var(--ows-ink3);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.pa-no{font-size:12.5px;color:var(--ows-ink3);font-style:italic}.pa-warn{color:var(--ows-amber)}.pa-ok{color:var(--ows-green)}.pa-blue{color:var(--ows-brand-ink)}' +
    '.pa-bar{height:6px;border-radius:4px;background:var(--ows-sunk);overflow:hidden;position:relative;margin-top:5px}.pa-bar i{position:absolute;left:0;top:0;bottom:0;border-radius:4px}.pa-bar .s{background:#BFD6F2}.pa-bar .d{background:var(--ows-green)}' +
    '.pa-card{display:grid;gap:12px}.pa-pow{background:var(--ows-sunk);border-radius:12px;padding:12px 14px;font-size:13px;line-height:1.5}.pa-pow b{font:600 20px/1.2 Poppins,"DM Sans",sans-serif;display:block}' +
    '.pa-pill{display:inline-block;font-size:11px;font-weight:600;padding:2px 8px;border-radius:20px;background:var(--ows-paper);border:1px solid var(--ows-line);margin-left:6px;vertical-align:middle}' +
    '.pa-uses{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:8px}.pa-use{border:1px solid var(--ows-line);border-radius:12px;padding:10px 12px;min-width:0}.pa-use.best{border-color:var(--ows-green)}.pa-use.off{opacity:.75}' +
    '.pa-use .k{font:500 10.5px "DM Mono",monospace;letter-spacing:.06em;text-transform:uppercase;color:var(--ows-ink3)}.pa-use .sz{font-weight:600;font-size:13.5px;margin-top:4px}.pa-use .irr{font:600 22px/1.1 Poppins,"DM Sans",sans-serif;color:var(--ows-green);margin-top:6px}.pa-use .irr.na{font-size:13px;color:var(--ows-ink3);font-weight:500}' +
    '.pa-use .n{font-size:11.5px;color:var(--ows-ink2);margin-top:4px;line-height:1.45}' +
    '.pa-flag{font-size:12px;color:var(--ows-amber);margin-top:4px}.pa-list{margin:6px 0 0;padding-left:18px;font-size:12.5px;line-height:1.55;color:var(--ows-ink)}' +
    '.pa-appr{display:flex;flex-wrap:wrap;gap:8px;align-items:center;font-size:12.5px}.pa-appr label{display:inline-flex;align-items:center;gap:5px;border:1px solid var(--ows-line2);border-radius:999px;padding:5px 11px;cursor:pointer;font-weight:600}.pa-appr input{accent-color:var(--ows-brand)}' +
    '.pa-btn{border-radius:999px;padding:6px 13px;font-weight:600;font-size:12.5px;border:1px solid var(--ows-line2);background:var(--ows-paper);color:var(--ows-ink);cursor:pointer}.pa-btn.primary{background:var(--ows-brand);border-color:var(--ows-brand);color:#fff}' +
    '.pa-sec{border:1px solid var(--ows-line);border-radius:10px;margin-top:8px}.pa-sec summary{cursor:pointer;padding:9px 12px;font-weight:600;font-size:13px;display:flex;justify-content:space-between;gap:8px}.pa-sec summary span{font-weight:500;color:var(--ows-ink3);font-size:12px}' +
    '.pa-item{border-top:1px solid var(--ows-line);padding:9px 12px;font-size:12.5px;line-height:1.45}.pa-item .st{font-size:10.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;margin-right:6px}.pa-item .st.open{color:var(--ows-ink3)}.pa-item .st.screened{color:var(--ows-brand-ink)}.pa-item .st.done{color:var(--ows-green)}.pa-item .st.na{color:var(--ows-ink3)}' +
    '.pa-item .w{color:var(--ows-ink2);margin-top:3px}.pa-item .a{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}.pa-item .a input{flex:1;min-width:140px;border:1px solid var(--ows-line2);border-radius:8px;padding:4px 8px;font:inherit;font-size:12px}.pa-item .a button{font-size:11.5px;padding:3px 10px}' +
    '.pa-tbl{width:100%;border-collapse:collapse;font-size:11.5px;font-variant-numeric:tabular-nums}.pa-tbl th,.pa-tbl td{text-align:right;padding:4px 6px;border-top:1px solid var(--ows-line)}.pa-tbl th{font-weight:600;color:var(--ows-ink3)}.pa-tbl td:first-child,.pa-tbl th:first-child{text-align:left}' +
    '';
  function style() { if (document.getElementById('pa-style')) return; var s = document.createElement('style'); s.id = 'pa-style'; s.textContent = CSS; document.head.appendChild(s); }

  /* ── the register's cells ─────────────────────────────────────────────── */
  function cells(a) {
    style();
    var none = '<span class="pa-no">–</span>';
    if (!a || a.notRun) return { power: null, compute: none, bess: none, charge: none, ready: a && a.decision ? '<span class="pill pill-teal" title="Approved for pre-development">' + esc(a.decision.label) + '</span>' : '<span class="pa-no">Not run</span>' };
    var p = a.power || {}, b = BASIS[p.basis] || null, stale = a.stale ? ' <span class="pa-warn" title="A fact changed since this ran: run it again">↻</span>' : '';
    var power = p.availableKw == null ? '<span class="pa-no" title="' + esc(p.words || '') + '">Not on file</span>'
      : '<b title="' + esc(p.words || '') + '">' + esc(kwWord(p.availableKw)) + '</b>' + stale + '<div class="pa-sub"><span class="' + (b ? b[1] : '') + '">' + esc(b ? b[0] : '') + '</span> · ' + (p.transformerKva ? esc(n0(p.transformerKva)) + ' kVA' : 'kVA not on file') + '</div>';
    var c = a.compute || {}, ce = c.economics || {}, compute = c.fits && c.chosen
      ? '<b title="' + esc(c.words || '') + '">' + esc((c.chosen.units > 1 ? c.chosen.units + ' × ' : '') + c.chosen.label) + '</b><div class="pa-sub" title="' + esc(ce.irrBasis || '') + '">' + (ce.irrPct != null ? esc(pct(ce.irrPct)) + ' at ' + esc(ce.priceBasis || 'reference') : 'no reference price') + '</div>'
      : '<span class="pa-no" title="' + esc(c.words || '') + '">No fit</span>';
    var bs = a.bess || {}, br = bs.returns || {}, bess = bs.ok
      ? '<b title="' + esc(bs.market ? bs.market.words : '') + '">' + esc(kwhWord(bs.sizing.kwh)) + '</b><div class="pa-sub">' + (br.noNetInvestment ? 'no net capital' : br.irrPct != null ? esc(pct(br.irrPct)) : 'IRR n/a') + (bs.market && bs.market.fit !== 'zone' ? ' <span class="pa-warn" title="' + esc(bs.market.words) + '">ref</span>' : '') + '</div>'
      : '<span class="pa-no" title="' + esc(bs.reason || '') + '">No fit</span>';
    var su = a.supercharger || {}, sr = su.returns || {}, charge = su.ok
      ? '<b>' + esc(su.sizing.posts) + ' posts</b><div class="pa-sub" title="' + esc(sr.irrBasis || '') + '">' + (sr.irrPct != null ? esc(pct(sr.irrPct)) : 'IRR n/a') + '</div>'
      : '<span class="pa-no" title="' + esc(su.reason || '') + '">No fit</span>';
    var r = a.readiness || {}, ready = '<span title="' + esc((r.done || 0) + ' of ' + (r.applicable || 0) + ' items with evidence on file; ' + (r.screened || 0) + ' screened from public data') + '"><b>' + esc(r.pct || 0) + '%</b>' +
      '<div class="pa-bar"><i class="s" style="width:' + (r.screenedPct || 0) + '%"></i><i class="d" style="width:' + (r.pct || 0) + '%"></i></div></span>' +
      (a.decision ? '<div class="pa-sub"><span class="pa-ok" title="Approved for pre-development' + (a.decision.by ? ' by ' + esc(a.decision.by) : '') + '">✓ ' + esc(a.decision.label) + '</span></div>' : '<div class="pa-sub">' + esc(r.label || '') + '</div>');
    return { power: power, compute: compute, bess: bess, charge: charge, ready: ready };
  }

  /* ── the side panel's card ────────────────────────────────────────────── */
  function useCard(key, title, best, body) { return '<div class="pa-use' + (best === key ? ' best' : '') + (body.off ? ' off' : '') + '"><div class="k">' + esc(title) + (best === key ? ' · highest' : '') + '</div>' + body.html + '</div>'; }
  function card(site, a, o) {
    style(); o = o || {};
    if (!a || a.notRun) return '<div class="pa-card" id="pa-card"><div class="ows-note">This site has not been assessed yet. Run it to size compute, a battery and fast charging on its free power, with each one’s return and the shovel-ready score.</div>' +
      (o.canEdit ? '<div><button type="button" class="pa-btn primary" data-pa="run">Run the assessment</button></div>' : '') + '</div>';
    var p = a.power || {}, b = BASIS[p.basis] || null, h = '<div class="pa-card" id="pa-card">';
    h += '<div class="pa-pow"><b>' + (p.availableKw != null ? esc(kwWord(p.availableKw)) + ' ' + esc(b ? b[0] : '') : 'Power not on file') + (b ? ' <span class="pa-pill ' + b[1] + '">' + esc(b[2]) + '</span>' : '') + '</b>' + esc(p.words || '') +
      '<div>Transformer: <b style="display:inline;font-size:13px">' + (p.transformerKva ? esc(n0(p.transformerKva)) + ' kVA' : 'kVA not on file') + '</b>' +
      (p.substation && p.substation.name ? ' · Substation: ' + esc(p.substation.name) + (p.substation.kv ? ', ' + esc(p.substation.kv) + ' kV' : '') + (p.substation.distanceMi != null ? ', ' + esc(p.substation.distanceMi) + ' mi' : '') : '') + (p.utility ? ' · ' + esc(p.utility) : '') + '</div>' +
      (p.flags || []).map(function (f) { return '<div class="pa-flag">⚠ ' + esc(f) + '</div>'; }).join('') +
      (a.stale ? '<div class="pa-flag">↻ A fact on the site changed since this ran. Run it again.</div>' : '') + '</div>';
    var best = a.recommend ? a.recommend.best : null, c = a.compute || {}, ce = c.economics || {}, bs = a.bess || {}, br = bs.returns || {}, su = a.supercharger || {}, sr = su.returns || {};
    h += '<div class="pa-uses">' +
      useCard('compute', 'Compute', best, c.fits && c.chosen ? { html: '<div class="sz">' + esc((c.chosen.units > 1 ? c.chosen.units + ' × ' : '') + c.chosen.label) + ' of IT</div><div class="irr' + (ce.irrPct == null ? ' na' : '') + '">' + (ce.irrPct != null ? esc(pct(ce.irrPct)) : 'No reference price') + '</div>' +
        '<div class="n">' + esc(ce.irrBasis || '') + (ce.capexUsd ? ' · capital ' + esc(money(ce.capexUsd)) : '') + (ce.gpus ? ' · ' + esc(n0(ce.gpus)) + ' GPUs (' + esc(ce.chipset ? ce.chipset.name : '') + ')' : '') + (ce.paybackMonths != null ? ' · payback ' + esc(ce.paybackMonths) + ' months' : '') + '</div><div class="n">' + esc(n0(c.chosen.meterKw)) + ' kW at the meter' + (c.chosen.leftKw > 0 ? ', ' + esc(n0(c.chosen.leftKw)) + ' kW left' : '') + '</div>' }
        : { off: true, html: '<div class="irr na">Does not fit</div><div class="n">' + esc(c.words || '') + '</div>' }) +
      useCard('bess', 'Battery storage', best, bs.ok ? { html: '<div class="sz">' + esc(kwWord(bs.sizing.kw)) + ' / ' + esc(kwhWord(bs.sizing.kwh)) + '</div><div class="irr' + (br.irrPct == null ? ' na' : '') + '">' + (br.noNetInvestment ? 'No net capital' : br.irrPct != null ? esc(pct(br.irrPct)) : 'IRR not defined') + '</div>' +
        '<div class="n">' + esc(br.irrBasis || '') + ' · NPV ' + esc(money(br.npv)) + ' at ' + esc(br.discountRatePct) + '%' + (br.paybackYears ? ' · payback ' + esc(br.paybackYears) + ' yr' : '') + '</div><div class="n">Capital ' + esc(money(bs.capex.total)) + ', ' + esc(money(bs.capex.net)) + ' after the credit' + (bs.capex.rebateApplies ? ' and rebate' : '') + ' · year 1 ' + esc(money(bs.year1.netCashFlow)) + '</div>' +
        (bs.market && bs.market.fit !== 'zone' ? '<div class="pa-flag">' + esc(bs.market.words) + '</div>' : '') }
        : { off: true, html: '<div class="irr na">Does not fit</div><div class="n">' + esc(bs.reason || '') + '</div>' }) +
      useCard('supercharger', 'Fast charging \u00b7 Supercharger host', best, su.ok ? { html: '<div class="sz">' + esc(su.sizing.posts) + ' posts</div><div class="irr' + (sr.irrPct == null ? ' na' : '') + '">' + (sr.irrPct != null ? esc(pct(sr.irrPct)) : 'IRR not defined') + '</div>' +
        '<div class="n">' + esc(sr.irrBasis || '') + ' (' + esc(pct(sr.preTaxIrrPct)) + ' before tax) · NPV ' + esc(money(sr.npv)) + ' at ' + esc(sr.discountRatePct) + '%' + (sr.paybackYears != null ? ' · payback ' + esc(sr.paybackYears) + ' yr' : '') + '</div><div class="n">Capital ' + esc(money(su.capex.total)) + ' · year 1 revenue ' + esc(money(su.year1.revenue)) + ' · $' + esc(su.inputs.pricePerKwh) + '/kWh sold, $' + esc(su.inputs.electricityPerKwh) + ' paid</div>' }
        : { off: true, html: '<div class="irr na">Does not fit</div><div class="n">' + esc(su.reason || '') + '</div>' }) + '</div>';
    h += '<div class="ows-note" style="margin:0">' + esc(a.note || '') + (a.recommend && a.recommend.words ? ' ' + esc(a.recommend.words) + '.' : '') + ' Screening figures, not a return promise.</div>';
    /* approve for pre-development */
    var d = a.decision, uses = d ? d.uses : (best ? [best] : []);
    h += '<div class="dr-sec" style="margin:2px 0 0">Approve for pre-development</div>';
    if (d) h += '<div style="font-size:13px"><span class="pill pill-teal">✓ ' + esc(d.label) + '</span> <span style="color:var(--ows-ink2);font-size:12px">' + esc((d.by || '') + (d.at ? ' · ' + String(d.at).slice(0, 10) : '')) + '</span></div>';
    if (o.canEdit) h += '<div class="pa-appr">' + [['compute', 'Compute'], ['bess', 'Battery'], ['supercharger', 'Fast charging']].map(function (u) { return '<label><input type="checkbox" data-pa-use="' + u[0] + '"' + (uses.indexOf(u[0]) >= 0 ? ' checked' : '') + '> ' + u[1] + '</label>'; }).join('') +
      '<button type="button" class="pa-btn primary" data-pa="approve">' + (d ? 'Change' : 'Approve') + '</button>' + (d ? '<button type="button" class="pa-btn" data-pa="withdraw">Withdraw</button>' : '') + '</div><div style="font-size:11.5px;color:var(--ows-ink2)">Tick more than one for a hybrid. The site moves to Pre-development and its Site Map project opens on what is approved.</div>';
    /* shovel ready */
    var r = a.readiness || {};
    h += '<div class="dr-sec" style="margin:2px 0 0">Shovel ready</div><div id="pa-ready">' + readyHead(r) + '</div>';
    if ((a.verify || []).length) h += '<div id="pa-verify"><div style="font-size:12px;font-weight:600;margin-top:2px">Verify next</div><ol class="pa-list">' + a.verify.map(function (v) { return '<li>' + esc(v.label) + '</li>'; }).join('') + '</ol></div>';
    h += '<div id="pa-full"><button type="button" class="pa-btn" data-pa="full">Open the checklist and the yearly tables</button></div>';
    h += '<div style="font-size:11.5px;color:var(--ows-ink3)">' + esc('Assessed ' + String(a.at || '').slice(0, 10) + (a.by ? ' by ' + a.by : '') + (a.screenAt ? ' · screened ' + String(a.screenAt).slice(0, 10) : ' · the Grid Atlas and parcel screens have not run') + ' · ' + ((a.confidence || {}).words || '')) + '</div>';
    if (o.canEdit) h += '<div><button type="button" class="pa-btn" data-pa="run">Run again</button></div>';
    return h + '</div>';
  }
  function readyHead(r) {
    return '<div style="font-size:13px"><b>' + esc(r.pct || 0) + '%</b> with evidence on file · ' + esc(r.screenedPct || 0) + '% screened · ' + esc(r.open || 0) + ' open of ' + esc(r.applicable || 0) + ' <span class="pa-pill">' + esc(r.label || '') + '</span></div>' +
      '<div class="pa-bar" style="height:8px"><i class="s" style="width:' + (r.screenedPct || 0) + '%"></i><i class="d" style="width:' + (r.pct || 0) + '%"></i></div>';
  }
  var STATE_WORD = { open: 'Open', screened: 'Screened', done: 'Evidence on file', na: 'Not applicable' };
  function itemHtml(it, canEdit) {
    return '<div class="pa-item" data-item="' + esc(it.key) + '"><span class="st ' + esc(it.state) + '">' + esc(STATE_WORD[it.state] || it.state) + '</span>' + esc(it.label) +
      (it.words ? '<div class="w">' + esc(it.words) + (it.source ? ' <i>(' + esc(it.source) + ')</i>' : '') + '</div>' : '') + (it.note ? '<div class="w">Note: ' + esc(it.note) + (it.by ? ' — ' + esc(it.by) : '') + '</div>' : '') +
      (canEdit ? '<div class="a">' + (it.state === 'done' || it.state === 'na' ? '<button type="button" class="pa-btn" data-set="open">Reopen</button>' : '<input type="text" maxlength="300" placeholder="What is the evidence? (a note)" aria-label="Evidence note"><button type="button" class="pa-btn" data-set="done">Evidence on file</button><button type="button" class="pa-btn" data-set="na">N/A</button>') + '</div>' : '') + '</div>';
  }
  function checklistHtml(r, canEdit) {
    return (r.sections || []).map(function (s) { return '<details class="pa-sec"><summary>' + esc(s.label) + '<span>' + esc(s.done) + ' of ' + esc(s.of) + '</span></summary>' + (s.items || []).map(function (it) { return itemHtml(it, canEdit); }).join('') + '</details>'; }).join('');
  }
  function tables(res) {
    var h = '', b = res.bess, s = res.supercharger;
    function usd(n) { return n == null ? '' : (n < 0 ? '−' : '') + '$' + n0(Math.abs(n)); }
    if (b && b.ok) h += '<details class="pa-sec"><summary>Battery: ten years<span>' + esc(kwWord(b.sizing.kw)) + ' / ' + esc(kwhWord(b.sizing.kwh)) + '</span></summary><div style="overflow:auto;padding:0 8px 8px"><table class="pa-tbl"><tr><th>Year</th><th>MWh</th><th>Net revenue</th><th>Operating</th><th>Net cash</th><th>Tax</th><th>To equity</th></tr>' +
      b.projections.map(function (y) { return '<tr><td>' + y.year + '</td><td>' + y.energyMwh + '</td><td>' + usd(y.netRevenue) + '</td><td>' + usd(y.opex) + '</td><td>' + usd(y.netCashFlow) + '</td><td>' + usd(y.incomeTax) + '</td><td>' + usd(y.equityCashFlow) + '</td></tr>'; }).join('') + '</table>' +
      '<ul class="pa-list">' + (b.notes || []).map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul></div></details>';
    if (s && s.ok) h += '<details class="pa-sec"><summary>Fast charging: fifteen years<span>' + esc(s.sizing.posts) + ' posts</span></summary><div style="overflow:auto;padding:0 8px 8px"><table class="pa-tbl"><tr><th>Year</th><th>kWh</th><th>Revenue</th><th>Electricity</th><th>Service fee</th><th>After tax</th><th>Cumulative</th></tr>' +
      s.projections.map(function (y) { return '<tr><td>' + y.year + '</td><td>' + n0(y.kwh) + '</td><td>' + usd(y.revenue) + '</td><td>' + usd(y.electricity) + '</td><td>' + usd(y.serviceFee) + '</td><td>' + usd(y.cashFlow) + '</td><td>' + usd(y.cumulative) + '</td></tr>'; }).join('') + '</table>' +
      '<ul class="pa-list">' + (s.notes || []).map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul></div></details>';
    var c = res.compute;
    if (c) h += '<details class="pa-sec"><summary>Compute: the shelf<span>' + esc(c.fits && c.chosen ? c.chosen.label : 'no fit') + '</span></summary><div style="padding:0 8px 8px"><table class="pa-tbl"><tr><th>Unit (IT)</th><th>At the meter</th><th>Fits</th></tr>' +
      (c.shelf || []).map(function (u) { return '<tr><td>' + esc(u.label) + '</td><td>' + n0(u.meterKw) + ' kW</td><td>' + (u.fits ? (u.units > 1 ? u.units + ' ×' : 'Yes') : 'No') + '</td></tr>'; }).join('') + '</table>' +
      '<ul class="pa-list">' + ((c.economics && c.economics.notes) || []).map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul></div></details>';
    return h;
  }

  function wire(root, site, hooks) {
    var el = root.querySelector('#pa-card'); if (!el) return;
    hooks = hooks || {};
    function on(sel, fn) { Array.prototype.forEach.call(el.querySelectorAll(sel), function (b) { b.addEventListener('click', function (ev) { ev.preventDefault(); fn(b); }); }); }
    on('[data-pa="run"]', function () { if (hooks.run) hooks.run(site.id); });
    on('[data-pa="approve"]', function () {
      var uses = Array.prototype.filter.call(el.querySelectorAll('[data-pa-use]'), function (c) { return c.checked; }).map(function (c) { return c.getAttribute('data-pa-use'); });
      if (hooks.approve) hooks.approve(site.id, uses);
    });
    on('[data-pa="withdraw"]', function () { if (hooks.approve) hooks.approve(site.id, []); });
    function wireItems(box) {
      Array.prototype.forEach.call(box.querySelectorAll('.pa-item [data-set]'), function (b) {
        b.addEventListener('click', function () {
          var row = b.closest('.pa-item'), key = row.getAttribute('data-item'), inp = row.querySelector('input'), note = inp ? inp.value.trim() : '';
          b.disabled = true;
          hooks.check(site.id, key, b.getAttribute('data-set'), note).then(function (j) {
            var open = Array.prototype.map.call(box.querySelectorAll('details.pa-sec'), function (d) { return d.open; });
            box.querySelector('#pa-check').innerHTML = checklistHtml(j.readiness, hooks.canEdit);
            Array.prototype.forEach.call(box.querySelectorAll('#pa-check details.pa-sec'), function (d, i) { d.open = !!open[i]; });
            var rh = el.querySelector('#pa-ready'); if (rh) rh.innerHTML = readyHead(j.readiness);
            wireItems(box);
          }).catch(function (e) { b.disabled = false; if (hooks.error) hooks.error(e); });
        });
      });
    }
    on('[data-pa="full"]', function (b) {
      var box = el.querySelector('#pa-full'); b.disabled = true; b.textContent = 'Loading…';
      hooks.full(site.id).then(function (j) {
        var res = j.assessment.result;
        box.innerHTML = '<div id="pa-check">' + checklistHtml(res.readiness, hooks.canEdit) + '</div>' + tables(res);
        wireItems(box);
      }).catch(function (e) { b.disabled = false; b.textContent = 'Open the checklist and the yearly tables'; if (hooks.error) hooks.error(e); });
    });
  }

  window.OmegaPortfolioAssess = { cells: cells, card: card, wire: wire, kwWord: kwWord, kwhWord: kwhWord, money: money, pct: pct };
})();
