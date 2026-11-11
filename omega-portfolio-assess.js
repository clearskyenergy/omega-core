/* ═══════════════════════════════════════════════════════════════════════════
   omega-portfolio-assess.js — the pages' one drawing of the SITE ASSESSMENT
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   ES5, no build step. Decides nothing and computes nothing: every figure,
   word and state is the server's answer (api/_lib/portfolio/assess.js
   through api/site-crm.js). The register (portfolio.html) asks it for a
   row's cells and for the side panel's card:
     OmegaPortfolioAssess.cells(a, o)       the row's cells, as HTML (o.funding:
        the workspace's funding list, where it has one → a `fund` cell)
     OmegaPortfolioAssess.card(site, a, o)  the side panel's card, as HTML
     OmegaPortfolioAssess.wire(root, site, hooks)   its buttons:
        hooks.run(siteId)  hooks.approve(siteId, uses[])  hooks.full(siteId)
        → Promise of GET ?assessment=1   hooks.check(siteId, item, state, note)
        → Promise of the new readiness   hooks.canEdit
        hooks.upgrade(siteId, body)   a utility-side upgrade request, marked
        hooks.fund(siteId, action, body)   submit | withdraw | decide
        hooks.report(siteId)   the diligence report, printed
     OmegaPortfolioAssess.gateStrip(a)   the workspace's gates as one row of marks
        (pass, fail, open), where its settings carry them; hooks.vote(siteId,
        vote, note) records a review member's vote
     OmegaPortfolioAssess.report(site, full, o)   the DILIGENCE REPORT of one
        site as a page of HTML (the three uses, the power, the screens, the
        checklist); printReports(pages, o) prints one or many.
   `a` is a site's `assessment` on the register's answer (null: never run).
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
  function n0(n) { return Math.round(n).toLocaleString('en-US'); }
  function money(n) { if (n == null || !isFinite(n)) return null; var a = Math.abs(n), s = a >= 1e6 ? (a / 1e6).toFixed(2) + 'M' : a >= 1e3 ? Math.round(a / 1e3) + 'k' : String(Math.round(a)); return (n < 0 ? '−$' : '$') + s; }
  function kwWord(kw) { return kw >= 1000 ? (Math.round(kw / 10) / 100) + ' MW' : n0(kw) + ' kW'; }
  function kwhWord(kwh) { return kwh >= 1000 ? (Math.round(kwh / 10) / 100) + ' MWh' : n0(kwh) + ' kWh'; }
  /* the chosen unit as words: by chip where the workspace sizes the maker's pod by the chip racked in it */
  function unitShort(ch) { return (ch.units > 1 ? ch.units + ' × ' : '') + ch.label + (ch.chip ? ' ' + ch.chip : ''); }
  function unitText(ch) { return (ch.units > 1 ? ch.units + ' × ' : '') + ch.label + ' of IT' + (ch.chip ? ', ' + ch.chip : ''); }
  /* the shelf: the units by IT load, or (by chip) what the maker's pod carries with each chip, every figure the server's */
  function shelfTable(c, cls) {
    var rows = c.shelf || [], fit = function (u) { return u.fits ? (u.units > 1 ? u.units + ' ×' : 'Yes') : 'No'; };
    if (!c.byChip) return '<table' + (cls ? ' class="' + cls + '"' : '') + '><tr><th>Unit (IT)</th><th>Class</th><th>At the meter</th><th>Fits</th></tr>' + rows.map(function (u) { return '<tr><td>' + esc(u.label) + '</td><td>' + esc(u.klassLabel || '') + '</td><td>' + n0(u.meterKw) + ' kW</td><td>' + fit(u) + '</td></tr>'; }).join('') + '</table>';
    return '<table' + (cls ? ' class="' + cls + '"' : '') + '><tr><th>Chip in the pod</th><th>GPUs a pod</th><th>IT a pod</th><th>At the meter</th><th>Pods</th><th>Return</th></tr>' + rows.map(function (u) {
      return '<tr><td>' + esc(u.chip || '') + '</td><td>' + (u.gpus != null ? n0(u.gpus) : '') + '</td><td>' + esc(u.label) + '</td><td>' + n0(u.meterKw) + ' kW</td><td>' + (u.fits ? esc(u.units) : 'No fit') + '</td><td>' + (u.irrPct != null ? esc(pct(u.irrPct)) : u.fits ? 'No price' : '') + '</td></tr>'; }).join('') + '</table>';
  }
  function podWords(c) { return c.byChip && c.pod ? (c.pod.baseline ? c.pod.baseline + '. ' : 'The ' + c.pod.label + ' (' + c.pod.sheet + '). ') + c.pod.standing + '.' : ''; }
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
    '.pa-k{display:inline-block;font:600 9.5px "DM Mono",monospace;letter-spacing:.05em;text-transform:uppercase;padding:1px 6px;border-radius:20px;border:1px solid var(--ows-line2);color:var(--ows-ink2);vertical-align:middle;margin-left:4px}' +
    '.pa-box{border:1px solid var(--ows-line);border-radius:12px;padding:10px 12px;font-size:12.5px;line-height:1.5}.pa-box.on{border-color:var(--ows-brand)}.pa-box .a{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:8px}.pa-box select,.pa-box input[type=text],.pa-box input[type=number]{border:1px solid var(--ows-line2);border-radius:8px;padding:5px 8px;font:inherit;font-size:12px;background:var(--ows-paper);color:var(--ows-ink);min-width:0}' +
    '.pa-pf{width:100%;border-collapse:collapse;font-size:12px;margin-top:6px;font-variant-numeric:tabular-nums}.pa-pf td{padding:3px 0;border-top:1px solid var(--ows-line)}.pa-pf td:last-child{text-align:right;font-weight:600}.pa-pf tr.t td{border-top:1px solid var(--ows-line2);font-weight:700}' +
    '.pa-fund{display:inline-block;font-size:11.5px;font-weight:600;padding:2px 9px;border-radius:20px;border:1px solid var(--ows-line2);white-space:nowrap}.pa-fund.sub{background:#EAF2FD;border-color:#BFD6F2;color:var(--ows-brand-ink)}.pa-fund.ok{background:#E7F6EC;border-color:#B9E2C6;color:var(--ows-green)}.pa-fund.no{background:#FCEDEA;border-color:#F0C4BB;color:#A43A26}' +
    '.pa-gs{display:inline-flex;gap:3px;vertical-align:middle;margin-left:6px}.pa-g{display:inline-block;min-width:18px;padding:0 3px;border-radius:4px;font:700 9px/14px "DM Mono",monospace;text-align:center;border:1px solid var(--ows-line2);color:var(--ows-ink3);background:var(--ows-paper)}.pa-g.pass{background:#E7F6EC;border-color:#B9E2C6;color:var(--ows-green)}.pa-g.fail{background:#FCEDEA;border-color:#F0C4BB;color:#A43A26}' +
    '.pa-gl{display:grid;gap:5px;margin-top:6px}.pa-gl>div{display:grid;grid-template-columns:auto 1fr;gap:8px;align-items:start;font-size:12.5px;line-height:1.45}.pa-gl .w{color:var(--ows-ink2)}' +
    '.pa-tbl{width:100%;border-collapse:collapse;font-size:11.5px;font-variant-numeric:tabular-nums}.pa-tbl th,.pa-tbl td{text-align:right;padding:4px 6px;border-top:1px solid var(--ows-line)}.pa-tbl th{font-weight:600;color:var(--ows-ink3)}.pa-tbl td:first-child,.pa-tbl th:first-child{text-align:left}' +
    '';
  function style() { if (document.getElementById('pa-style')) return; var s = document.createElement('style'); s.id = 'pa-style'; s.textContent = CSS; document.head.appendChild(s); }

  /* ── the register's cells ─────────────────────────────────────────────── */
  var UP_WORD = { requested: 'requested', granted: 'granted', declined: 'declined' };
  function fundCell(a, f) {
    var fd = a && a.funding;
    if (!fd) return a && a.confidence && a.confidence.screened ? '<span class="pa-no" title="Screened: ready to submit to ' + esc(f.name) + '">Not submitted</span>' : '<span class="pa-no" title="' + esc(f.name) + ' sees screened sites only: run the screens first">Screen first</span>';
    var amt = fd.amountUsd != null ? money(fd.amountUsd) : (fd.label || ''), d = fd.decision || {};
    if (fd.status === 'approved') return '<span class="pa-fund ok" title="Approved by ' + esc(d.name || d.by || f.name) + (d.at ? ' on ' + esc(String(d.at).slice(0, 10)) : '') + '">Approved</span><div class="pa-sub">' + esc(amt) + '</div>';
    if (fd.status === 'declined') return '<span class="pa-fund no" title="' + esc(d.note || '') + '">Declined</span><div class="pa-sub">' + esc(d.name || '') + '</div>';
    return '<span class="pa-fund sub" title="Submitted by ' + esc(fd.submittedBy || '') + (fd.submittedAt ? ' on ' + esc(String(fd.submittedAt).slice(0, 10)) : '') + '; waiting on ' + esc(f.name) + '">With committee</span><div class="pa-sub">' + esc(amt) + '</div>';
  }
  function cells(a, o) {
    style(); o = o || {};
    var none = '<span class="pa-no">–</span>', f = o.funding || null;
    if (!a || a.notRun) return { power: null, compute: none, bess: none, charge: none, fund: f ? '<span class="pa-no" title="Run and screen the site first">Not run</span>' : null, ready: a && a.decision ? '<span class="pill pill-teal" title="Approved for pre-development">' + esc(a.decision.label) + '</span>' : '<span class="pa-no">Not run</span>' };
    var p = a.power || {}, b = BASIS[p.basis] || null, stale = a.stale ? ' <span class="pa-warn" title="A fact changed since this ran: run it again">↻</span>' : '';
    var power = p.availableKw == null ? '<span class="pa-warn" title="' + esc((p.words || '') + '. Record the transformer’s kVA or the service size to size this site.') + '">Not on file</span>'
      : '<b title="' + esc(p.words || '') + '">' + esc(kwWord(p.availableKw)) + '</b>' + stale + '<div class="pa-sub"><span class="' + (b ? b[1] : '') + '">' + esc(b ? b[0] : '') + '</span> · ' + (p.transformerKva ? esc(n0(p.transformerKva)) + ' kVA' : 'kVA not on file') + '</div>';
    /* NOT SIZED IS NOT "NO FIT" (2026-11-09, Tommy, of nine sites whose intake sheet left the service size blank: "please look into these 'no fits' as they seem to maybe be good candidates"): a site with no power figure was never judged, and says what it needs */
    var unsized = p.availableKw == null, needs = '<span class="pa-warn" title="No service, transformer or available-power figure is on file for this site, so nothing was sized. It was not judged: record the transformer’s kVA (or the service) and run it again.">Needs power</span>';
    var up = a.upgrade || null;
    if (up && p.availableKw != null) power += '<div class="pa-sub ' + (up.status === 'declined' ? 'pa-warn' : 'pa-blue') + '" title="' + esc(up.words || '') + '">↑ ' + esc(kwWord(up.targetKw)) + ' upgrade ' + esc(UP_WORD[up.status] || up.status) + '</div>';
    var adv = !up ? a.upgradeAdvice || null : null;
    /* a near miss leads: where the next pod up is within a tenth of what it needs, that is the ask to make first */
    var near = adv && adv.next && adv.next.shortKw <= adv.next.needKw * 0.1 ? adv.next : null;
    if (adv) power += '<div class="pa-sub pa-warn" title="' + esc(adv.words || '') + '">' + (near ? '↑ ' + esc(kwWord(near.shortKw)) + ' short of a ' + esc(near.label.replace(/ (Nano|Micro) pod$/, '')) + ' pod' : '↑ ask +' + esc(kwWord(adv.shortKw)) + ' for 1 MW') + '</div>';
    var c = a.compute || {}, ce = c.economics || {}, pf = ce.proforma || null, compute = c.fits && c.chosen
      ? '<b title="' + esc(c.words || '') + '">' + esc(unitShort(c.chosen)) + '</b>' + (c.chosen.klassLabel ? '<span class="pa-k" title="' + esc(c.chosen.klassLabel) + ': ' + (c.byChip ? 'the 1 MW pod, sized by the chip racked in it' : c.chosen.klass === 'micro' ? '1 MW of IT and up' : 'under 1 MW of IT') + '">' + esc(c.chosen.klass === 'micro' ? 'Micro' : 'Nano') + '</span>' : '') +
        '<div class="pa-sub" title="' + esc((ce.irrBasis || '') + (pf && pf.asStated ? '. On ' + pf.partner + '’s own utility figure: ' + pct(pf.asStated.irrPct) : '')) + '">' + (ce.irrPct != null ? esc(pct(ce.irrPct)) + (ce.basis === 'partner' ? ' · partner ref' : ' at ' + esc(ce.priceBasis || 'reference')) : 'no reference price') + '</div>'
      : unsized ? needs : '<span class="pa-no" title="' + esc(c.words || '') + '">No fit</span>';
    var bs = a.bess || {}, br = bs.returns || {}, bess = bs.ok
      ? '<b title="' + esc(bs.market ? bs.market.words : '') + '">' + esc(kwhWord(bs.sizing.kwh)) + '</b><div class="pa-sub">' + (br.noNetInvestment ? 'no net capital' : br.irrPct != null ? esc(pct(br.irrPct)) : 'IRR n/a') + (bs.market && bs.market.fit !== 'zone' ? ' <span class="pa-warn" title="' + esc(bs.market.words) + '">ref</span>' : '') + '</div>'
      : unsized ? needs : '<span class="pa-no" title="' + esc(bs.reason || '') + '">No fit</span>';
    var su = a.supercharger || {}, sr = su.returns || {}, charge = su.ok
      ? '<b>' + esc(su.sizing.posts) + ' dispensers</b><div class="pa-sub" title="' + esc(sr.irrBasis || '') + '">' + (sr.irrPct != null ? esc(pct(sr.irrPct)) : 'IRR n/a') + '</div>'
      : unsized ? needs : '<span class="pa-no" title="' + esc(su.reason || '') + '">No fit</span>';
    var r = a.readiness || {}, ready = '<span title="' + esc((r.done || 0) + ' of ' + (r.applicable || 0) + ' items with evidence on file; ' + (r.screened || 0) + ' screened from public data') + '"><b>' + esc(r.pct || 0) + '%</b>' +
      '<div class="pa-bar"><i class="s" style="width:' + (r.screenedPct || 0) + '%"></i><i class="d" style="width:' + (r.pct || 0) + '%"></i></div></span>' +
      (a.decision ? '<div class="pa-sub"><span class="pa-ok" title="Approved for pre-development' + (a.decision.by ? ' by ' + esc(a.decision.by) : '') + '">✓ ' + esc(a.decision.label) + '</span></div>' : '<div class="pa-sub">' + esc(r.label || '') + '</div>');
    return { power: power, compute: compute, bess: bess, charge: charge, ready: ready, fund: f ? fundCell(a, f) : null };
  }

  /* ── closing a site: purchased, the host agreement assigned, the lease in place ── */
  function closingHtml(a, o) {
    var c = a.closing; if (!c || !c.steps) return '';
    var h = '<div class="dr-sec" style="margin:2px 0 0">Closing \u00b7 ' + esc(c.done) + ' of ' + esc(c.of) + '</div><div class="pa-box' + (c.complete ? ' on' : '') + '" id="pa-closing"><div class="pa-gl">' +
      c.steps.map(function (x) {
        var act = '';
        if (o.canEdit) act = x.key === 'lease'
          ? '<div class="a"><input type="number" min="1" max="99" step="1" data-pa-close-years placeholder="years" aria-label="Lease term in years" value="' + esc(x.years != null ? x.years : '') + '" style="width:80px"><button type="button" class="pa-btn' + (x.done ? '' : ' primary') + '" data-pa-close="lease">' + (x.years != null ? 'Change' : 'Record the lease') + '</button>' + (x.years != null ? '<button type="button" class="pa-btn" data-pa-close-undo="lease">Undo</button>' : '') + '</div>'
          : '<div class="a">' + (x.done ? '<button type="button" class="pa-btn" data-pa-close-undo="' + esc(x.key) + '">Undo</button>' : '<button type="button" class="pa-btn primary" data-pa-close="' + esc(x.key) + '">Mark done</button>') + '</div>';
        return '<div><span class="pa-g ' + (x.done ? 'pass' : x.short ? 'fail' : 'open') + '" style="min-width:26px">' + (x.done ? '✓' : '·') + '</span><div><b>' + esc(x.label) + '</b><div class="w">' + esc(x.words) + (x.by ? ' \u00b7 ' + esc(x.by) + (x.at ? ', ' + esc(String(x.at).slice(0, 10)) : '') : '') + '</div>' + act + '</div></div>';
      }).join('') + '</div><div style="color:var(--ows-ink2);margin-top:6px;font-size:11.5px">A record of what was done. Marking a step buys, assigns and signs nothing.</div></div>';
    return h;
  }
  /* ── the workspace's gates: one mark a gate, in its own order ─────────── */
  var GATE_WORD = { pass: 'passed', fail: 'not met', open: 'open' };
  function gateStrip(a) {
    var g = a && a.gates; if (!g || !g.list) return '';
    style();
    return '<span class="pa-gs" aria-label="Gates: ' + esc(g.passed) + ' of ' + esc(g.of) + ' passed">' + g.list.map(function (x) { return '<span class="pa-g ' + esc(x.state) + '" title="' + esc(x.key + ' ' + x.label + ' — ' + (GATE_WORD[x.state] || x.state) + ': ' + x.words) + '">' + esc(x.key.replace('G', '')) + '</span>'; }).join('') + '</span>';
  }
  function gatesHtml(a, o) {
    var g = a.gates; if (!g || !g.list) return '';
    var h = '<div class="dr-sec" style="margin:2px 0 0">Gates \u00b7 ' + esc(g.passed) + ' of ' + esc(g.of) + ' passed' + (g.failed.length ? ' \u00b7 ' + esc(g.failed.join(', ')) + ' not met' : '') + '</div><div class="pa-box" id="pa-gates"><div class="pa-gl">' +
      g.list.map(function (x) { return '<div><span class="pa-g ' + esc(x.state) + '" style="min-width:26px">' + esc(x.key) + '</span><div><b>' + esc(x.label) + '</b> <span class="' + (x.state === 'pass' ? 'pa-ok' : x.state === 'fail' ? 'pa-warn' : '') + '" style="font-size:11.5px">' + esc(GATE_WORD[x.state] || x.state) + '</span><div class="w">' + esc(x.words) + '</div></div></div>'; }).join('') + '</div>';
    var rv = a.review, ri = o.review;
    if (rv) {
      h += '<div style="margin-top:10px;border-top:1px solid var(--ows-line);padding-top:8px" id="pa-review"><b>' + esc(rv.name) + '</b> <span class="pa-fund ' + (rv.outcome ? 'ok' : rv.split ? 'no' : 'sub') + '">' + esc(rv.outcome ? rv.outcomeLabel : rv.split ? 'Split' : rv.cast + ' of ' + rv.of + ' voted') + '</span>' +
        '<div style="margin-top:4px">' + rv.votes.map(function (v) { return '<span style="display:inline-block;margin:0 10px 2px 0">' + esc(v.name) + ': <b>' + esc(v.vote === 'own' ? 'own' : v.vote === 'flip' ? 'flip' : '—') + '</b></span>'; }).join('') + '</div>' +
        '<div class="w" style="color:var(--ows-ink2)">The decision stands when every member has voted the same way.</div>';
      if (ri && ri.canVote) h += '<div class="a"><input type="text" maxlength="500" data-pa-vote-note placeholder="A note with your vote (optional)" aria-label="A note with your vote" style="flex:1;min-width:150px"><button type="button" class="pa-btn primary" data-pa-vote="own">Own &amp; operate</button><button type="button" class="pa-btn" data-pa-vote="flip">Portfolio / flip</button><button type="button" class="pa-btn" data-pa-vote="clear">Clear my vote</button></div>';
      h += '</div>';
    }
    return h + '</div>';
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
      useCard('compute', 'Compute' + (c.chosen && c.chosen.klassLabel ? ' \u00b7 ' + c.chosen.klassLabel : ''), best, c.fits && c.chosen ? { html: '<div class="sz">' + esc(unitText(c.chosen)) + '</div><div class="irr' + (ce.irrPct == null ? ' na' : '') + '">' + (ce.irrPct != null ? esc(pct(ce.irrPct)) : 'No reference price') + '</div>' +
        '<div class="n">' + esc(ce.irrBasis || '') + (ce.capexUsd ? ' · capital ' + esc(money(ce.capexUsd)) : '') + (ce.gpus ? ' · ' + esc(n0(ce.gpus)) + ' GPUs (' + esc(ce.chipset ? ce.chipset.name : '') + ')' : '') + (ce.paybackMonths != null ? ' · payback ' + esc(ce.paybackMonths) + ' months' : '') + '</div><div class="n">' + esc(n0(c.chosen.meterKw)) + ' kW at the meter' + (c.chosen.leftKw > 0 ? ', ' + esc(n0(c.chosen.leftKw)) + ' kW left' : '') +
        (ce.electricity && ce.electricity.perKwh != null ? ' · power at $' + esc(ce.electricity.perKwh) + '/kWh' + (ce.electricity.utility ? ' (' + esc(ce.electricity.utility) + ')' : '') : '') + '</div>' + proformaHtml(ce.proforma) }
        : { off: true, html: '<div class="irr na">' + (p.availableKw == null ? 'Not sized' : 'Does not fit') + '</div><div class="n">' + esc(c.words || '') + '</div>' }) +
      useCard('bess', 'Battery storage', best, bs.ok ? { html: '<div class="sz">' + esc(kwWord(bs.sizing.kw)) + ' / ' + esc(kwhWord(bs.sizing.kwh)) + '</div><div class="irr' + (br.irrPct == null ? ' na' : '') + '">' + (br.noNetInvestment ? 'No net capital' : br.irrPct != null ? esc(pct(br.irrPct)) : 'IRR not defined') + '</div>' +
        '<div class="n">' + esc(br.irrBasis || '') + ' · NPV ' + esc(money(br.npv)) + ' at ' + esc(br.discountRatePct) + '%' + (br.paybackYears ? ' · payback ' + esc(br.paybackYears) + ' yr' : '') + '</div><div class="n">Capital ' + esc(money(bs.capex.total)) + ', ' + esc(money(bs.capex.net)) + ' after the credit' + (bs.capex.rebateApplies ? ' and rebate' : '') + ' · year 1 ' + esc(money(bs.year1.netCashFlow)) + '</div>' +
        (bs.market && bs.market.fit !== 'zone' ? '<div class="pa-flag">' + esc(bs.market.words) + '</div>' : '') }
        : { off: true, html: '<div class="irr na">' + (p.availableKw == null ? 'Not sized' : 'Does not fit') + '</div><div class="n">' + esc(bs.reason || '') + '</div>' }) +
      useCard('supercharger', 'Fast charging \u00b7 Supercharger host', best, su.ok ? { html: '<div class="sz">' + esc(su.sizing.posts) + ' dispensers</div><div class="irr' + (sr.irrPct == null ? ' na' : '') + '">' + (sr.irrPct != null ? esc(pct(sr.irrPct)) : 'IRR not defined') + '</div>' +
        '<div class="n">' + esc(sr.irrBasis || '') + ' (' + esc(pct(sr.preTaxIrrPct)) + ' before tax) · NPV ' + esc(money(sr.npv)) + ' at ' + esc(sr.discountRatePct) + '%' + (sr.paybackYears != null ? ' · payback ' + esc(sr.paybackYears) + ' yr' : '') + '</div><div class="n">Capital ' + esc(money(su.capex.total)) + ' · year 1 revenue ' + esc(money(su.year1.revenue)) + ' · $' + esc(su.inputs.pricePerKwh) + '/kWh sold, $' + esc(su.inputs.electricityPerKwh) + ' paid</div>' }
        : { off: true, html: '<div class="irr na">' + (p.availableKw == null ? 'Not sized' : 'Does not fit') + '</div><div class="n">' + esc(su.reason || '') + '</div>' }) + '</div>';
    h += '<div class="ows-note" style="margin:0">' + esc(a.note || '') + (a.recommend && a.recommend.words ? ' ' + esc(a.recommend.words) + '.' : '') + ' Screening figures, not a return promise.</div>';
    if (a.pairing) h += '<div class="pa-box" id="pa-pairing"><b>Beside the pod</b><div>' + esc(a.pairing.words) + '</div><div style="color:var(--ows-ink2);margin-top:4px">Battery capital ' + esc(money(a.pairing.bess.capexUsd)) + ' (' + esc(money(a.pairing.bess.netCapexUsd)) + ' after the credit) · NPV ' + esc(money(a.pairing.bess.npv)) + '</div></div>';
    h += upgradeHtml(a, o);
    /* approve for pre-development */
    var d = a.decision, uses = d ? d.uses : (best ? [best] : []);
    h += '<div class="dr-sec" style="margin:2px 0 0">Approve for pre-development</div>';
    if (d) h += '<div style="font-size:13px"><span class="pill pill-teal">✓ ' + esc(d.label) + '</span> <span style="color:var(--ows-ink2);font-size:12px">' + esc((d.by || '') + (d.at ? ' · ' + String(d.at).slice(0, 10) : '')) + '</span></div>';
    if (o.canEdit) h += '<div class="pa-appr">' + [['compute', 'Compute'], ['bess', 'Battery'], ['supercharger', 'Fast charging']].map(function (u) { return '<label><input type="checkbox" data-pa-use="' + u[0] + '"' + (uses.indexOf(u[0]) >= 0 ? ' checked' : '') + '> ' + u[1] + '</label>'; }).join('') +
      '<button type="button" class="pa-btn primary" data-pa="approve">' + (d ? 'Change' : 'Approve') + '</button>' + (d ? '<button type="button" class="pa-btn" data-pa="withdraw">Withdraw</button>' : '') + '</div><div style="font-size:11.5px;color:var(--ows-ink2)">Tick more than one for a hybrid. The site moves to Pre-development and its Site Map project opens on what is approved.</div>';
    h += closingHtml(a, o);
    h += fundingHtml(a, o, best);
    h += gatesHtml(a, o);
    /* shovel ready */
    var r = a.readiness || {};
    h += '<div class="dr-sec" style="margin:2px 0 0">Shovel ready</div><div id="pa-ready">' + readyHead(r) + '</div>';
    if ((a.verify || []).length) h += '<div id="pa-verify"><div style="font-size:12px;font-weight:600;margin-top:2px">Verify next</div><ol class="pa-list">' + a.verify.map(function (v) { return '<li>' + esc(v.label) + '</li>'; }).join('') + '</ol></div>';
    h += '<div id="pa-full"><button type="button" class="pa-btn" data-pa="full">Open the checklist and the yearly tables</button></div>';
    h += '<div><button type="button" class="pa-btn" data-pa="report" title="Compute, the battery and fast charging on this site, its power, the screens and the readiness checklist, as one printable report">Diligence report (print / save as PDF)</button></div>';
    h += '<div style="font-size:11.5px;color:var(--ows-ink3)">' + esc('Assessed ' + String(a.at || '').slice(0, 10) + (a.by ? ' by ' + a.by : '') + (a.screenAt ? ' · screened ' + String(a.screenAt).slice(0, 10) : ' · the Grid Atlas and parcel screens have not run') + ' · ' + ((a.confidence || {}).words || '')) + '</div>';
    if (o.canEdit) h += '<div><button type="button" class="pa-btn" data-pa="run">Run again</button></div>';
    return h + '</div>';
  }
  /* the compute pro forma on the offtake partner's figures: one year, this site's utility beside theirs */
  function proformaHtml(pf) {
    if (!pf) return '';
    function row(k, v, cls) { return '<tr' + (cls ? ' class="' + cls + '"' : '') + '><td>' + k + '</td><td>' + v + '</td></tr>'; }
    var st = pf.asStated;
    return '<table class="pa-pf">' + row('Investment', esc(money(pf.capexUsd))) + row('Revenue a year <span class="pa-warn" title="A stated figure, not a contract: the offtake is not confirmed">as stated</span>', esc(money(pf.revenuePerYear))) +
      row('Utility a year, ' + (pf.utilityBasis === 'site' ? 'this site' : 'as stated'), '−' + esc(money(pf.utilityPerYear).replace('$', '$'))) +
      (pf.partnerFeePerYear ? row(esc(pf.partner) + '’s fee (' + esc(pf.reference.feePct) + '%)', '−' + esc(money(pf.partnerFeePerYear))) : '') + row('Other operating', '−' + esc(money(pf.otherOperatingPerYear))) + row('Earnings a year', esc(money(pf.ebitdaPerYear)), 't') + '</table>' +
      '<div class="n">On ' + esc(pf.partner) + '’s figures, stated and unverified' + (st && pf.utilityBasis === 'site' ? '. With their own utility figure (' + esc(money(st.utilityPerYear)) + ' a year): ' + esc(pct(st.irrPct)) + ', payback ' + esc(st.paybackMonths) + ' months' : '') + '.</div>';
  }
  /* a utility-side upgrade request: where it stands, what it would carry, and the mark */
  function upgradeHtml(a, o) { /* the mark where there is one; else the upgrade to ask for (derived), and the way to mark it */
    var up = a.upgrade || null, adv = a.upgradeAdvice || null, c = a.compute || {}, more = (c.shelf || []).filter(function (u) { return !u.fits; }).reverse();   /* the largest first: the 1 MW Micro pod is the ask */
    if (!up && !adv && !(o.canEdit && more.length)) return '';
    var h = '<div class="dr-sec" style="margin:2px 0 0">Utility-side upgrade</div><div class="pa-box' + (up ? ' on' : '') + '" id="pa-upgrade">';
    if (up) {
      h += '<div>' + esc(up.words || '') + '</div>';
      if (up.compute) h += '<div style="margin-top:4px">With it: <b>' + esc(up.compute.label) + '</b> of IT' + (up.compute.klassLabel ? ' (' + esc(up.compute.klassLabel) + ')' : '') + (up.compute.irrPct != null ? ' · ' + esc(pct(up.compute.irrPct)) + (up.compute.priceBasis ? ' ' + (up.compute.priceBasis === 'partner ref' ? 'on the partner’s figures' : 'at ' + esc(up.compute.priceBasis)) : '') : '') + (up.compute.capexUsd ? ' · capital ' + esc(money(up.compute.capexUsd)) : '') + '</div>';
      if (up.note) h += '<div style="color:var(--ows-ink2)">Note: ' + esc(up.note) + '</div>';
      h += '<div style="font-size:11.5px;color:var(--ows-ink3)">' + esc((up.by || '') + (up.at ? ' · ' + String(up.at).slice(0, 10) : '')) + '</div>';
      if (o.canEdit) h += '<div class="a">' + (up.status !== 'granted' ? '<button type="button" class="pa-btn" data-pa-up="granted">Mark granted</button>' : '') + (up.status !== 'declined' ? '<button type="button" class="pa-btn" data-pa-up="declined">Mark declined</button>' : '') +
        (up.status !== 'requested' ? '<button type="button" class="pa-btn" data-pa-up="requested">Back to requested</button>' : '') + '<button type="button" class="pa-btn" data-pa-up="withdrawn">Withdraw</button></div>';
    } else {
      h += (adv ? '<div>' + esc(adv.words) + '</div>' + (adv.compute && adv.compute.irrPct != null ? '<div style="margin-top:4px">With the ' + esc(adv.label) + ': ' + esc(pct(adv.compute.irrPct)) + (adv.compute.priceBasis ? ' ' + (adv.compute.priceBasis === 'partner ref' ? 'on the partner’s figures' : 'at ' + esc(adv.compute.priceBasis)) : '') + (adv.compute.capexUsd ? ' · capital ' + esc(money(adv.compute.capexUsd)) : '') + '</div>' : '')
        : '<div>Ask the utility for more power than the site has, to carry a larger compute unit.</div>') + (o.canEdit ? '<div style="color:var(--ows-ink2);margin-top:4px">Marking it records that the partner is asking; it changes no size until the utility grants it.</div>' : '');
      if (o.canEdit && more.length) h +=
        '<div class="a"><select data-pa-up-unit aria-label="The unit the upgrade is for">' + more.map(function (u) { return '<option value="' + esc(u.key) + '">' + esc(u.label + ' ' + (u.chip ? u.chip + ' pod' : u.klassLabel || '') + ' · ' + n0(u.meterKw) + ' kW at the meter') + '</option>'; }).join('') + '<option value="">Another figure…</option></select>' +
        '<input type="number" min="1" step="1" data-pa-up-kw placeholder="kW at the meter" aria-label="Power asked for at the meter, kW" style="width:130px;display:none">' +
        '<input type="text" maxlength="80" data-pa-up-by placeholder="Who is asking (the partner)" aria-label="Who is asking the utility" value="' + esc(o.partner || '') + '" style="flex:1;min-width:120px">' +
        '<button type="button" class="pa-btn primary" data-pa-up="requested">Mark upgrade requested</button></div>';
    }
    return h + '</div>';
  }
  /* the funding list: screened, submitted, decided by the committee */
  function fundingHtml(a, o, best) {
    var f = o.funding; if (!f) return '';
    var fd = a.funding || null, screened = !!(a.confidence && a.confidence.screened), who = f.name + (f.members && f.members.length ? ' (' + f.members.join(', ') + ')' : '');
    var h = '<div class="dr-sec" style="margin:2px 0 0">Funding \u00b7 ' + esc(f.name) + '</div><div class="pa-box' + (fd ? ' on' : '') + '" id="pa-funding">';
    function lines(x) { return (x.lines || []).map(function (l) { return '<div><b>' + esc(l.label) + '</b> · ' + esc(l.size || '') + (l.capexUsd != null ? ' · ' + esc(money(l.capexUsd)) : '') + (l.irrPct != null ? ' · ' + esc(pct(l.irrPct)) + ' screening return' : '') + '</div>'; }).join('') + (x.words ? '<div style="color:var(--ows-ink2)">' + esc(x.words) + '</div>' : ''); }
    if (!fd) {
      if (!screened) h += '<div>' + esc(f.name) + ' sees screened sites only. Run the Grid Atlas and parcel screens on this site first (Run), then submit it.</div>';
      else if (o.canEdit) {
        var pick = best ? [best] : [];
        h += '<div>Screened. Say what the funding is for and submit it to ' + esc(who) + '.</div><div class="pa-appr" style="margin-top:8px">' + [['compute', 'Compute'], ['bess', 'Battery'], ['supercharger', 'Fast charging']].map(function (u) { return '<label><input type="checkbox" data-pa-fund-use="' + u[0] + '"' + (pick.indexOf(u[0]) >= 0 ? ' checked' : '') + '> ' + u[1] + '</label>'; }).join('') + '</div>' +
          '<div class="a"><input type="text" maxlength="500" data-pa-fund-note placeholder="A note for the committee (optional)" aria-label="A note for the committee" style="flex:1;min-width:150px"><button type="button" class="pa-btn primary" data-pa-fund="submit">Submit for funding</button></div>';
      } else h += '<div>Screened, not yet submitted to ' + esc(f.name) + '.</div>';
      return h + '</div>';
    }
    var d = fd.decision || null;
    h += '<div><span class="pa-fund ' + (fd.status === 'approved' ? 'ok' : fd.status === 'declined' ? 'no' : 'sub') + '">' + (fd.status === 'approved' ? 'Funding approved' : fd.status === 'declined' ? 'Declined' : 'Waiting on ' + esc(f.name)) + '</span>' + (fd.amountUsd != null ? ' <b>' + esc(money(fd.amountUsd)) + '</b>' : '') + '</div>' + lines(fd) +
      '<div style="font-size:11.5px;color:var(--ows-ink3)">Submitted by ' + esc(fd.submittedBy || '') + (fd.submittedAt ? ' · ' + esc(String(fd.submittedAt).slice(0, 10)) : '') + (fd.note ? ' · “' + esc(fd.note) + '”' : '') + '</div>';
    if (d) h += '<div style="margin-top:4px">' + (d.status === 'approved' ? 'Approved' : 'Declined') + ' by <b>' + esc(d.name || d.by || '') + '</b>' + (d.at ? ' on ' + esc(String(d.at).slice(0, 10)) : '') + (d.note ? ': ' + esc(d.note) : '') + '</div>';
    if (f.canDecide) h += '<div class="a"><input type="text" maxlength="500" data-pa-fund-note placeholder="' + (fd.status === 'submitted' ? 'A note (needed to decline)' : 'A note for the change') + '" aria-label="Decision note" style="flex:1;min-width:150px">' +
      (fd.status !== 'approved' ? '<button type="button" class="pa-btn primary" data-pa-fund="approved">Approve funding</button>' : '') + (fd.status !== 'declined' ? '<button type="button" class="pa-btn" data-pa-fund="declined">Decline</button>' : '') + '</div>';
    else if (fd.status === 'submitted') h += '<div style="color:var(--ows-ink2);margin-top:4px">Decided by ' + esc(who) + '.</div>';
    if (o.canEdit && fd.status === 'submitted') h += '<div class="a"><button type="button" class="pa-btn" data-pa-fund="withdraw">Take off the list</button></div>';
    else if (o.canEdit && fd.status === 'declined') h += '<div class="a"><button type="button" class="pa-btn" data-pa-fund="resubmit">Submit again</button></div>';
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
    if (s && s.ok) h += '<details class="pa-sec"><summary>Fast charging: fifteen years<span>' + esc(s.sizing.posts) + ' dispensers</span></summary><div style="overflow:auto;padding:0 8px 8px"><table class="pa-tbl"><tr><th>Year</th><th>kWh</th><th>Revenue</th><th>Electricity</th><th>Service fee</th><th>After tax</th><th>Cumulative</th></tr>' +
      s.projections.map(function (y) { return '<tr><td>' + y.year + '</td><td>' + n0(y.kwh) + '</td><td>' + usd(y.revenue) + '</td><td>' + usd(y.electricity) + '</td><td>' + usd(y.serviceFee) + '</td><td>' + usd(y.cashFlow) + '</td><td>' + usd(y.cumulative) + '</td></tr>'; }).join('') + '</table>' +
      '<ul class="pa-list">' + (s.notes || []).map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul></div></details>';
    var c = res.compute;
    if (c) h += '<details class="pa-sec"><summary>' + (c.byChip ? 'Compute: the pod by chip' : 'Compute: the shelf') + '<span>' + esc(c.fits && c.chosen ? unitShort(c.chosen) : 'no fit') + '</span></summary><div style="padding:0 8px 8px">' +
      (c.byChip ? '<div style="font-size:12px;color:var(--ows-ink2);margin:0 0 6px">' + esc(podWords(c)) + (c.chosen && c.chosen.why ? ' Chosen: ' + esc(c.chosen.why) + '.' : '') + '</div>' + shelfTable(c, 'pa-tbl') + '<ul class="pa-list">' + (c.thermal ? '<li>Heat: ' + esc(c.thermal.words) + '</li>' : '') + (c.more ? '<li>' + esc(c.more) + '</li>' : '') + (c.requirements || []).map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>'
        : '<table class="pa-tbl"><tr><th>Unit (IT)</th><th>At the meter</th><th>Fits</th></tr>' + (c.shelf || []).map(function (u) { return '<tr><td>' + esc(u.label) + '</td><td>' + n0(u.meterKw) + ' kW</td><td>' + (u.fits ? (u.units > 1 ? u.units + ' ×' : 'Yes') : 'No') + '</td></tr>'; }).join('') + '</table>') +
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
    on('[data-pa="report"]', function () { if (hooks.report) hooks.report(site.id); });
    on('[data-pa-close]', function (b) {
      if (!hooks.closing) return;
      var step = b.getAttribute('data-pa-close'), body = { step: step, done: true };
      if (step === 'lease') { var y = el.querySelector('[data-pa-close-years]'); body.years = y && y.value ? Number(y.value) : null; }
      hooks.closing(site.id, body);
    });
    on('[data-pa-close-undo]', function (b) { if (hooks.closing) hooks.closing(site.id, { step: b.getAttribute('data-pa-close-undo'), done: false }); });
    on('[data-pa-vote]', function (b) { var n = el.querySelector('[data-pa-vote-note]'); if (hooks.vote) hooks.vote(site.id, b.getAttribute('data-pa-vote'), n ? n.value.trim() : ''); });
    /* the upgrade request */
    var upSel = el.querySelector('[data-pa-up-unit]'), upKw = el.querySelector('[data-pa-up-kw]');
    if (upSel && upKw) { var showKw = function () { upKw.style.display = upSel.value ? 'none' : ''; }; upSel.addEventListener('change', showKw); showKw(); }
    on('[data-pa-up]', function (b) {
      if (!hooks.upgrade) return;
      var st = b.getAttribute('data-pa-up'), body = { status: st }, by = el.querySelector('[data-pa-up-by]');
      if (st === 'requested' && upSel) { if (upSel.value) body.unit = upSel.value; else body.targetKw = upKw && upKw.value ? Number(upKw.value) : null; if (by && by.value.trim()) body.askedBy = by.value.trim(); }
      hooks.upgrade(site.id, body);
    });
    /* the funding list */
    on('[data-pa-fund]', function (b) {
      if (!hooks.fund) return;
      var act = b.getAttribute('data-pa-fund'), box = el.querySelector('#pa-funding'), noteEl = box && box.querySelector('[data-pa-fund-note]'), note = noteEl ? noteEl.value.trim() : '';
      if (act === 'submit') hooks.fund(site.id, 'submit', { uses: Array.prototype.filter.call(box.querySelectorAll('[data-pa-fund-use]'), function (c) { return c.checked; }).map(function (c) { return c.getAttribute('data-pa-fund-use'); }), note: note });
      else if (act === 'resubmit') hooks.fund(site.id, 'submit', { uses: (hooks.fundingOf && hooks.fundingOf(site.id) || {}).uses || [], note: note });
      else if (act === 'withdraw') hooks.fund(site.id, 'withdraw', {});
      else hooks.fund(site.id, 'decide', { decision: act, note: note });
    });
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

  /* ── THE DILIGENCE REPORT (2026-11-09, Tommy: "i want to be able to export a
     dilligence report on each site that shows tesla, bess, and compute") ──
     One site, one document: what the power on file carries, each use with
     its capital and return, what the screens read (the substation, the
     utility, fiber, the parcel), the readiness checklist and what to verify
     next. Every figure is the server's answer to GET ?site=&assessment=1,
     drawn; nothing is computed here. What was not read is said. */
  var RCSS = 'body{font:13px/1.5 -apple-system,"Segoe UI",Helvetica,Arial,sans-serif;color:#14212b;margin:0;padding:28px 34px}h1{font-size:24px;margin:2px 0 2px}h2{font-size:15px;margin:22px 0 8px;padding-bottom:4px;border-bottom:2px solid #14212b}h3{font-size:12.5px;margin:12px 0 4px}' +
    '.rp{page-break-after:always}.rp:last-child{page-break-after:auto}.ey{font:600 10.5px/1.4 "SF Mono",Menlo,monospace;letter-spacing:.08em;text-transform:uppercase;color:#5b6b78}.sub{color:#44525e}.mut{color:#6b7a86;font-size:11.5px}' +
    '.three{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:10px}.bx{border:1px solid #c9d3db;border-radius:8px;padding:10px 12px;break-inside:avoid}.bx.best{border:2px solid #1c7c4a}.bx .big{font-size:22px;font-weight:700;color:#1c7c4a;margin:4px 0}.bx .big.na{font-size:13px;color:#6b7a86;font-weight:500}' +
    'table{width:100%;border-collapse:collapse;font-size:11.5px;font-variant-numeric:tabular-nums;margin-top:4px}th,td{text-align:right;padding:3px 6px;border-bottom:1px solid #dde4ea;vertical-align:top}th{font-weight:600;color:#44525e}td:first-child,th:first-child{text-align:left}table.kv td:last-child{font-weight:600}table.kv td{width:50%}' +
    'ul{margin:4px 0 0;padding-left:18px}li{margin:1px 0}.flag{color:#9a5b00}.st{font:700 9.5px/1 "SF Mono",Menlo,monospace;letter-spacing:.05em;text-transform:uppercase;white-space:nowrap}.st.done{color:#1c7c4a}.st.screened{color:#1f5fae}.st.open,.st.na{color:#6b7a86}' +
    '.foot{margin-top:18px;padding-top:8px;border-top:1px solid #c9d3db;font-size:10.5px;color:#6b7a86}@media print{body{padding:0}@page{margin:14mm 13mm}}';
  function report(site, full, o) {
    o = o || {}; site = site || {};
    var A = (full && full.assessment) || {}, res = A.result || {}, p = res.power || {}, c = res.compute || {}, ce = c.economics || {}, bs = res.bess || {}, br = bs.returns || {}, su = res.supercharger || {}, sr = su.returns || {}, r = res.readiness || {}, sc = A.screen || {}, pa = A.parcel || {}, fb = sc.fiber || null, up = res.upgrade || null, best = res.recommend ? res.recommend.best : null;
    function usd(n) { return n == null || !isFinite(n) ? '–' : (n < 0 ? '−' : '') + '$' + n0(Math.abs(n)); }
    function kv(rows) { return '<table class="kv">' + rows.filter(function (x) { return x && x[1] != null && x[1] !== ''; }).map(function (x) { return '<tr><td>' + esc(x[0]) + '</td><td>' + x[1] + '</td></tr>'; }).join('') + '</table>'; }
    function notes(list) { return list && list.length ? '<ul>' + list.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>' : ''; }
    var addr = typeof site.address === 'string' ? site.address : '', loc = [addr, site.city, site.state, site.zip].filter(Boolean).join(', '), ids = site.externalSiteIds || {}, idKey = Object.keys(ids)[0];
    var h = '<section class="rp"><div class="ey">' + esc(o.brand || 'Site diligence') + ' · Site diligence report</div><h1>' + esc(site.name || (full.site && full.site.name) || 'Site') + '</h1>' +
      '<div class="sub">' + esc(loc || 'Address not on file') + (site.portfolioPartner ? ' · ' + esc(site.portfolioPartner) : '') + (idKey ? ' · ' + esc(ids[idKey]) : '') + (site.status ? ' · ' + esc(site.status) : '') + '</div>' +
      '<div class="mut">Assessed ' + esc(String(A.ranAt || res.at || '').slice(0, 10)) + (A.ranBy ? ' by ' + esc(A.ranBy) : '') + (sc.at ? ' · screened ' + esc(String(sc.at).slice(0, 10)) : ' · the Grid Atlas and parcel screens have not run') + ' · ' + esc((res.confidence || {}).words || '') + '</div>';
    /* the three uses */
    function box(key, title, ok, size, irr, lines, off) { return '<div class="bx' + (best === key ? ' best' : '') + '"><div class="ey">' + esc(title) + (best === key ? ' · highest' : '') + '</div>' + (ok ? '<div><b>' + esc(size) + '</b></div><div class="big' + (irr == null ? ' na' : '') + '">' + esc(irr == null ? 'No return shown' : irr) + '</div>' + lines.filter(Boolean).map(function (l) { return '<div class="mut">' + esc(l) + '</div>'; }).join('') : '<div class="big na">' + (p.availableKw == null ? 'Not sized: no power figure on file' : 'Does not fit') + '</div><div class="mut">' + esc(off || '') + '</div>') + '</div>'; }
    h += '<h2>What this site carries</h2><div class="sub">' + esc(res.note || '') + '</div><div class="three">' +
      box('compute', 'Compute' + (c.chosen && c.chosen.klassLabel ? ' · ' + c.chosen.klassLabel : ''), c.fits && c.chosen, c.chosen ? unitText(c.chosen) : '', ce.irrPct != null ? pct(ce.irrPct) : null, [ce.irrBasis, ce.capexUsd ? 'Capital ' + money(ce.capexUsd) : '', ce.paybackMonths != null ? 'Payback ' + ce.paybackMonths + ' months' : ''], c.words) +
      box('bess', 'Battery storage', bs.ok, bs.ok ? kwWord(bs.sizing.kw) + ' / ' + kwhWord(bs.sizing.kwh) : '', bs.ok ? (br.noNetInvestment ? 'No net capital' : br.irrPct != null ? pct(br.irrPct) : null) : null, bs.ok ? [br.irrBasis, 'Capital ' + money(bs.capex.total) + ', ' + money(bs.capex.net) + ' net', 'NPV ' + money(br.npv) + ' at ' + br.discountRatePct + '%'] : [], bs.reason) +
      box('supercharger', 'Fast charging · Tesla Supercharger host', su.ok, su.ok ? su.sizing.posts + ' dispensers' : '', su.ok && sr.irrPct != null ? pct(sr.irrPct) : null, su.ok ? [sr.irrBasis + ' (' + pct(sr.preTaxIrrPct) + ' before tax)', 'Capital ' + money(su.capex.total), sr.paybackYears != null ? 'Payback ' + sr.paybackYears + ' years' : ''] : [], su.reason) + '</div>' +
      '<div class="mut" style="margin-top:6px">' + esc(res.recommend && res.recommend.words ? res.recommend.words + '. ' : '') + 'The three returns are on different bases, each named in its section. Screening figures, not a return promise.</div>';
    /* power */
    h += '<h2>Power and grid</h2>' + kv([['Free power', p.availableKw != null ? '<b>' + esc(kwWord(p.availableKw)) + '</b> (' + esc(p.basis || '') + ')' : 'Not on file'], ['How it is read', esc(p.words || '')], ['Transformer', p.transformerKva ? esc(n0(p.transformerKva)) + ' kVA' : 'kVA not on file'], ['Service', p.serviceCapacityKw ? esc(n0(p.serviceCapacityKw)) + ' kW' : null],
      ['Site peak', p.peakKw != null ? esc(n0(p.peakKw)) + ' kW (' + esc(p.peakBasis || '') + ')' : 'Not on file'], ['Utility', p.utility ? esc(p.utility) : null], ['Nearest substation', p.substation && p.substation.name ? esc(p.substation.name) + (p.substation.kv ? ', ' + esc(p.substation.kv) + ' kV' : '') + (p.substation.distanceMi != null ? ', ' + esc(p.substation.distanceMi) + ' mi' : '') : null],
      ['Published load hosting', p.hosting ? esc(n0(p.hosting.loadKw)) + ' kW' + (p.hosting.circuit ? ' on ' + esc(p.hosting.circuit) : '') : null], ['Utility-side upgrade', up ? esc(up.words) + (up.compute ? ' With it: ' + esc(up.compute.label) + ' of IT' + (up.compute.irrPct != null ? ', ' + esc(pct(up.compute.irrPct)) : '') + '.' : '') : res.upgradeAdvice ? esc(res.upgradeAdvice.words) + (res.upgradeAdvice.compute && res.upgradeAdvice.compute.irrPct != null ? ' With the ' + esc(res.upgradeAdvice.label) + ': ' + esc(pct(res.upgradeAdvice.compute.irrPct)) + '.' : '') : null]]) +
      (p.flags && p.flags.length ? '<ul class="flag">' + p.flags.map(function (f) { return '<li>' + esc(f) + '</li>'; }).join('') + '</ul>' : '');
    /* compute */
    h += '<h2>Compute' + (c.chosen && c.chosen.klassLabel ? ' · ' + esc(c.chosen.klassLabel) : '') + '</h2>';
    if (c.fits && c.chosen) {
      var pf = ce.proforma || null;
      h += kv([['Unit', esc(unitText(c.chosen))], ['At the meter', esc(n0(c.chosen.meterKw)) + ' kW at ' + (c.byChip ? 'the pod’s design pPUE ' : 'PUE ') + esc(c.pue) + (c.chosen.leftKw > 0 ? ', ' + esc(n0(c.chosen.leftKw)) + ' kW left' : '')], ['GPUs', ce.gpus ? esc(n0(ce.gpus)) + ' ' + esc(ce.chipset ? ce.chipset.name : '') : null], ['Capital', ce.capexUsd ? esc(usd(ce.capexUsd)) : null],
        ['Return', ce.irrPct != null ? '<b>' + esc(pct(ce.irrPct)) + '</b>' : 'Not shown'], ['Basis', esc(ce.irrBasis || '')], ['Payback', ce.paybackMonths != null ? esc(ce.paybackMonths) + ' months' : null], ['Electricity', ce.electricity && ce.electricity.perKwh != null ? '$' + esc(ce.electricity.perKwh) + ' a kWh' + (ce.electricity.utility ? ' (' + esc(ce.electricity.utility) + ')' : '') : 'the engine’s default']]);
      if (pf) h += '<h3>One year on ' + esc(pf.partner) + '’s figures (stated, unverified)</h3><table><tr><th></th><th>This site</th>' + (pf.asStated ? '<th>As ' + esc(pf.partner) + ' stated</th>' : '') + '</tr>' +
        [['Investment', pf.capexUsd, pf.capexUsd], ['Revenue', pf.revenuePerYear, pf.revenuePerYear], ['Utility', -pf.utilityPerYear, pf.asStated ? -pf.asStated.utilityPerYear : null], [pf.partner + '’s fee', -pf.partnerFeePerYear, -pf.partnerFeePerYear], ['Other operating', -pf.otherOperatingPerYear, -pf.otherOperatingPerYear], ['Earnings', pf.ebitdaPerYear, pf.asStated ? pf.asStated.ebitdaPerYear : null]].map(function (x) { return '<tr><td>' + esc(x[0]) + '</td><td>' + usd(x[1]) + '</td>' + (pf.asStated ? '<td>' + usd(x[2]) + '</td>' : '') + '</tr>'; }).join('') +
        '<tr><td><b>Project IRR</b></td><td><b>' + esc(pct(ce.irrPct)) + '</b></td>' + (pf.asStated ? '<td><b>' + esc(pct(pf.asStated.irrPct)) + '</b></td>' : '') + '</tr><tr><td>Payback</td><td>' + esc(ce.paybackMonths) + ' months</td>' + (pf.asStated ? '<td>' + esc(pf.asStated.paybackMonths) + ' months</td>' : '') + '</tr></table>';
      if (res.pairing) h += '<h3>Beside the pod</h3><div class="sub">' + esc(res.pairing.words) + ' Battery capital ' + esc(usd(res.pairing.bess.capexUsd)) + ', ' + esc(usd(res.pairing.bess.netCapexUsd)) + ' after the credit.</div>';
      if (c.byChip) h += '<h3>The pod by chip on this power</h3><div class="sub">' + esc(podWords(c)) + (c.chosen.why ? ' Chosen: ' + esc(c.chosen.why) + '.' : '') + '</div>' + shelfTable(c) + (c.thermal ? '<h3>Heat</h3><div class="sub">' + esc(c.thermal.words) + '</div>' : '') + '<h3>What the site has to provide</h3>' + notes((c.requirements || []).concat(c.more ? [c.more] : [])) + '<h3>How it is priced</h3>' + notes(ce.notes);
      else h += '<h3>The shelf on this power</h3>' + shelfTable(c) + notes(ce.notes);
    } else h += '<div class="sub">' + esc(c.words || 'Not sized') + '</div>';
    /* battery */
    h += '<h2>Battery storage</h2>';
    if (bs.ok) {
      h += kv([['Size', esc(kwWord(bs.sizing.kw)) + ' / ' + esc(kwhWord(bs.sizing.kwh)) + ' (' + esc(bs.sizing.hours) + ' hours)'], ['Capital', esc(usd(bs.capex.total)) + ' (hardware ' + esc(usd(bs.capex.hardware)) + ', soft costs ' + esc(usd(bs.capex.softCosts)) + ', construction ' + esc(usd(bs.capex.construction)) + ', interconnection ' + esc(usd(bs.capex.interconnection)) + ')'],
        ['Credit sold', esc(usd(bs.capex.itcProceeds))], ['Rebate', bs.capex.rebateApplies ? esc(usd(bs.capex.rebate)) : 'None counted'], ['Net capital', esc(usd(bs.capex.net))], ['Return', br.noNetInvestment ? 'No net capital: an IRR is not defined' : br.irrPct != null ? '<b>' + esc(pct(br.irrPct)) + '</b>' : 'Not defined'], ['Basis', esc(br.irrBasis || '')],
        ['NPV', esc(usd(br.npv)) + ' at ' + esc(br.discountRatePct) + '%'], ['Payback', br.paybackWords ? esc(br.paybackWords) : br.paybackYears != null ? esc(br.paybackYears) + ' years' : null], ['Equity after tax', (br.equityIrrPct != null ? esc(pct(br.equityIrrPct)) + ' IRR · ' : '') + 'NPV ' + esc(usd(br.equityNpv))], ['Market', bs.market ? esc(bs.market.words) : null]]) +
        (bs.revenue && bs.revenue.streams ? '<h3>The grid value stack, year one</h3><table><tr><th>Stream</th><th>$ a kW-year</th><th>Year one</th><th>Share</th></tr>' + bs.revenue.streams.map(function (x) { return '<tr><td>' + esc(x.label) + '</td><td>' + esc(x.perKwYear) + '</td><td>' + usd(x.year1) + '</td><td>' + esc(x.sharePct) + '%</td></tr>'; }).join('') + '</table>' : '') +
        '<h3>Ten years</h3><table><tr><th>Year</th><th>MWh</th><th>Net revenue</th><th>Operating</th><th>Net cash</th><th>Tax</th><th>To equity</th></tr>' + (bs.projections || []).map(function (y) { return '<tr><td>' + y.year + '</td><td>' + y.energyMwh + '</td><td>' + usd(y.netRevenue) + '</td><td>' + usd(y.opex) + '</td><td>' + usd(y.netCashFlow) + '</td><td>' + usd(y.incomeTax) + '</td><td>' + usd(y.equityCashFlow) + '</td></tr>'; }).join('') + '</table>' + notes(bs.notes);
    } else h += '<div class="sub">' + esc(bs.reason || 'Not sized') + '</div>';
    /* fast charging */
    h += '<h2>Fast charging · Tesla Supercharger host</h2>';
    if (su.ok) {
      h += kv([['Posts', esc(su.sizing.posts) + ' (' + esc(n0(su.sizing.drawKw)) + ' kW at ' + esc(su.sizing.kwPerPost) + ' kW a post)'], ['Capital', esc(usd(su.capex.total)) + ' (equipment ' + esc(usd(su.capex.equipment)) + ', installation ' + esc(usd(su.capex.installation)) + ')'], ['Price sold', '$' + esc(su.inputs.pricePerKwh) + ' a kWh'], ['Electricity paid', '$' + esc(su.inputs.electricityPerKwh) + ' a kWh'],
        ['Utilisation', esc(su.inputs.kwhPerPostDay) + ' kWh a dispenser a day'], ['Return', sr.irrPct != null ? '<b>' + esc(pct(sr.irrPct)) + '</b> after tax · ' + esc(pct(sr.preTaxIrrPct)) + ' before tax' : 'Not defined'], ['Basis', esc(sr.irrBasis || '')], ['NPV', esc(usd(sr.npv)) + ' at ' + esc(sr.discountRatePct) + '%'], ['Payback', sr.paybackYears != null ? esc(sr.paybackYears) + ' years' : 'Not inside the term']]) +
        '<h3>Fifteen years</h3><table><tr><th>Year</th><th>kWh</th><th>Revenue</th><th>Electricity</th><th>Service fee</th><th>After tax</th><th>Cumulative</th></tr>' + (su.projections || []).map(function (y) { return '<tr><td>' + y.year + '</td><td>' + n0(y.kwh) + '</td><td>' + usd(y.revenue) + '</td><td>' + usd(y.electricity) + '</td><td>' + usd(y.serviceFee) + '</td><td>' + usd(y.cashFlow) + '</td><td>' + usd(y.cumulative) + '</td></tr>'; }).join('') + '</table>' + notes(su.notes);
    } else h += '<div class="sub">' + esc(su.reason || 'Not sized') + '</div>';
    /* what the screens read */
    h += '<h2>Fiber, parcel and zoning</h2>' + kv([['Carriers at the address', fb && fb.carriersRead ? (fb.carriers && fb.carriers.length ? esc(fb.carriers.slice(0, 6).join(', ')) : 'None read') : 'Not read'], ['1 Gbps symmetric', fb ? (fb.symmetric1g === true ? 'Offered' : fb.symmetric1g === false ? 'Not read at the address' : 'Not read') : 'Not read'],
      ['Nearest carrier hotel', fb && fb.carrierHotel ? esc(fb.carrierHotel) + (fb.carrierHotelMi != null ? ', ' + esc(fb.carrierHotelMi) + ' mi' : '') : null], ['Parcel', pa.ok ? [pa.apn ? 'APN ' + esc(pa.apn) : '', pa.acres != null ? esc(pa.acres) + ' acres' : '', pa.county ? esc(pa.county) : ''].filter(Boolean).join(' · ') : 'Not read' + (pa.reason ? ' (' + esc(pa.reason) + ')' : '')],
      ['Zoning on the parcel record', pa.ok && pa.zoning ? esc(pa.zoning) + ' (permitted uses not confirmed)' : 'Not read'], ['Owner on the public record', pa.ok && pa.owner ? esc(pa.owner) : null]]);
    /* readiness */
    h += '<h2>Shovel ready: ' + esc(r.pct || 0) + '% with evidence on file</h2><div class="sub">' + esc(r.done || 0) + ' of ' + esc(r.applicable || 0) + ' items with evidence on file · ' + esc(r.screened || 0) + ' screened from public data (not yet evidence) · ' + esc(r.open || 0) + ' open · ' + esc(r.label || '') + '</div>' +
      (r.sections || []).map(function (s) { return '<h3>' + esc(s.label) + ' (' + esc(s.done) + ' of ' + esc(s.of) + ')</h3><table>' + (s.items || []).map(function (it) { return '<tr><td style="width:14%"><span class="st ' + esc(it.state) + '">' + esc(STATE_WORD[it.state] || it.state) + '</span></td><td style="text-align:left">' + esc(it.label) + (it.words ? '<div class="mut">' + esc(it.words) + (it.source ? ' (' + esc(it.source) + ')' : '') + '</div>' : '') + (it.note ? '<div class="mut">Note: ' + esc(it.note) + (it.by ? ' — ' + esc(it.by) : '') + '</div>' : '') + '</td></tr>'; }).join('') + '</table>'; }).join('');
    if ((res.verify || []).length) h += '<h2>Verify next</h2><ol>' + res.verify.map(function (v) { return '<li>' + esc(v.label) + '</li>'; }).join('') + '</ol>';
    /* decisions */
    var d = A.decision, fd = A.funding, fi = o.funding;
    var gts = A.gates, rvw = A.review;
    var cls = A.closing;
    if (cls && cls.steps) h += '<h2>Closing: ' + esc(cls.done) + ' of ' + esc(cls.of) + '</h2><table>' + cls.steps.map(function (x) { return '<tr><td>' + esc(x.label) + '</td><td style="text-align:left">' + esc(x.words) + (x.by ? ' · ' + esc(x.by) + (x.at ? ', ' + esc(String(x.at).slice(0, 10)) : '') : '') + '</td><td><span class="st ' + (x.done ? 'done' : 'open') + '">' + (x.done ? 'done' : 'open') + '</span></td></tr>'; }).join('') + '</table>';
    if (gts && gts.list) h += '<h2>Gates: ' + esc(gts.passed) + ' of ' + esc(gts.of) + ' passed</h2><table><tr><th>Gate</th><th style="text-align:left">Where it stands</th><th></th></tr>' + gts.list.map(function (x) { return '<tr><td>' + esc(x.key + ' ' + x.label) + '</td><td style="text-align:left">' + esc(x.words) + '</td><td><span class="st ' + (x.state === 'pass' ? 'done' : x.state === 'fail' ? 'na' : 'open') + '"' + (x.state === 'fail' ? ' style="color:#a43a26"' : '') + '>' + esc(GATE_WORD[x.state] || x.state) + '</span></td></tr>'; }).join('') + '</table>' +
      (rvw ? '<div class="sub" style="margin-top:6px">' + esc(rvw.words) + '. ' + rvw.votes.map(function (v) { return esc(v.name) + ': ' + esc(v.vote ? (v.vote === 'own' ? 'own and operate' : 'portfolio / flip') + (v.at ? ' (' + String(v.at).slice(0, 10) + ')' : '') : 'not voted'); }).join(' · ') + '</div>' : '');
    if (d || fd || fi) h += '<h2>Decisions</h2>' + kv([['Pre-development', d ? 'Approved: ' + esc(d.label) + (d.by ? ' by ' + esc(d.by) : '') + (d.at ? ' on ' + esc(String(d.at).slice(0, 10)) : '') : 'Not approved'],
      fi || fd ? ['Funding' + (fi ? ' · ' + fi.name : ''), fd ? (fd.status === 'approved' ? 'Approved' : fd.status === 'declined' ? 'Declined' : 'Submitted, waiting on the committee') + (fd.label ? ' · ' + esc(fd.label) : '') + (fd.amountUsd != null ? ' · ' + esc(usd(fd.amountUsd)) : '') + (fd.decision ? ' · ' + esc(fd.decision.name || fd.decision.by || '') + (fd.decision.at ? ', ' + esc(String(fd.decision.at).slice(0, 10)) : '') + (fd.decision.note ? ': ' + esc(fd.decision.note) : '') : '') : 'Not submitted'] : null]);
    h += '<h2>What this report does not read</h2><ul><li>Flood, wetlands, protected species and contamination: no environmental source is read; those checklist items stay open until a person records the evidence.</li><li>The utility’s answer: a published hosting figure, where one exists, is not a will-serve letter.</li><li>Carrier names need the federal broadband data to answer; a quote from a carrier is the evidence.</li><li>Screened means public data or an imported fact speaks to an item. It is not evidence on file.</li></ul>' +
      '<div class="foot">' + esc(o.brand || '') + (o.brand ? ' · ' : '') + 'Site diligence report · ' + esc(site.name || '') + ' · printed ' + esc(o.today || '') + '. Screening figures from the facts on file and public data; not a return promise, an offer or an engineering study.' + (o.attribution ? ' ' + esc(o.attribution) : '') + '</div></section>';
    return h;
  }
  /* print one or many reports from a hidden frame: no pop-up to block, no tab to close */
  function printReports(pages, o) {
    o = o || {};
    var old = document.getElementById('pa-print'); if (old) old.parentNode.removeChild(old);
    var fr = document.createElement('iframe'); fr.id = 'pa-print'; fr.setAttribute('aria-hidden', 'true'); fr.setAttribute('title', 'Diligence report');
    fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    var docHtml = '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(o.title || 'Site diligence report') + '</title><style>' + RCSS + '</style></head><body>' + (pages || []).join('') + '</body></html>';
    /* the frame takes the focus to print (Safari prints the focused frame) and hands it back, or Escape would no longer reach the page's own panel */
    function back() { try { fr.blur(); window.focus(); if (o.focusBack && o.focusBack.focus) o.focusBack.focus(); } catch (e) {} }
    fr.addEventListener('load', function () { try { fr.contentWindow.addEventListener('afterprint', back); fr.contentWindow.focus(); fr.contentWindow.print(); } catch (e) { if (o.onError) o.onError(e); } setTimeout(back, 0); });
    fr.srcdoc = docHtml; document.body.appendChild(fr);
    return fr;
  }

  window.OmegaPortfolioAssess = { cells: cells, card: card, wire: wire, gateStrip: gateStrip, report: report, printReports: printReports, kwWord: kwWord, kwhWord: kwhWord, money: money, pct: pct };
})();
