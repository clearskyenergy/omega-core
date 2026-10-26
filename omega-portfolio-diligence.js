/* ═══════════════════════════════════════════════════════════════════════════
   omega-portfolio-diligence.js — the compute-site diligence on the
   portfolio's two pages (portfolio.html: the register and its side panel;
   site-crm.html: the site record's Diligence tab)
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   ES5, no build step. It draws what GET /api/site-crm answers under
   `diligence` and asks the door's diligence-* actions; every word, figure
   and rule is the server's (api/_lib/portfolio/diligence.js, the view's
   lines, sizing, ladder and band), so this file decides nothing and holds
   no workspace's name: the name it prints is the answer's brand (the white
   label's platform name, else the workspace's own). Where the workspace's
   switch is off the answer's diligence is null, the pages never call this,
   and nothing new is drawn.

   The layout is the one Thomas approved (2026-10-25): the stage strip; the
   tally under the workspace's name against the target band; the pipeline
   with seven chips (confirmed green, in progress amber, screened blue, open
   grey, fails red), the IRR, the stage, Screen with Grid Atlas and the
   J/K/E/P keys; the site's card with a row a gate, the sizing chips and the
   contract-price slider over the server's own ladder. No browser popup is
   used: a pass reason, a confirmation and every form are on the page.
   ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  var TONE = { open: 'op', screened: 'sc', working: 'wk', confirmed: 'ok', fails: 'no' };
  var ROW_GATES = ['power', 'interconnection', 'fiber', 'control', 'chips', 'offtake'];
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  function num(v) { return v == null || v === '' || !isFinite(Number(v)) ? null : Number(v); }
  function fmt(n, dp) { n = num(n); return n == null ? '—' : n.toLocaleString('en-US', { maximumFractionDigits: dp == null ? 1 : dp }); }
  function money(n) { n = num(n); if (n == null) return '—'; var a = Math.abs(n); return (n < 0 ? '−$' : '$') + (a >= 1e6 ? (a / 1e6).toFixed(2) + 'M' : a >= 1e3 ? Math.round(a / 1e3) + 'k' : String(Math.round(a))); }
  function moneyM(n) { n = num(n); return n == null ? '—' : '$' + (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M'; }
  /* every listener a mount adds is kept, so destroy() takes them all back
     and a second mount on the same element replaces the first (a page that
     draws the card again after a reload never stacks two of each) */
  function binder(el) {
    var bag = [];
    if (el.__odg && el.__odg.destroy) el.__odg.destroy();
    return { on: function (ev, fn, at) { (at || el).addEventListener(ev, fn); bag.push([at || el, ev, fn]); },
      off: function () { bag.forEach(function (b) { b[0].removeEventListener(b[1], b[2]); }); bag = []; } };
  }
  function qs(el, s) { return el.querySelector(s); }
  function qsa(el, s) { return Array.prototype.slice.call(el.querySelectorAll(s)); }
  function val(el, s) { var x = qs(el, s); return x ? x.value : undefined; }

  /* the narrow layout: a phone, or the card in a side panel on any screen
     (fit() gives the element .odg-narrow from its own width) */
  var NARROW = '.odg-strip{grid-template-columns:repeat(4,minmax(0,1fr))}.odg-rg{grid-template-columns:minmax(0,1fr) 92px;grid-template-areas:"s st" "c c";row-gap:6px}.odg-rg>div:nth-child(1){grid-area:s}.odg-rg>div:nth-child(2){grid-area:c}.odg-rg>div:nth-child(3){display:none}.odg-rg>div:nth-child(4){grid-area:st;text-align:right}.odg-rg.hd{display:none}' +
    '.odg-gt{grid-template-columns:minmax(0,1fr) auto}.odg-gt>div:nth-child(3){grid-column:1/-1}.odg-tiles{grid-template-columns:1fr 1fr}';
  function scoped(rules, pre) { return rules.replace(/(^|\})([^{}]+)\{/g, function (m, b, sel) { return b + sel.split(',').map(function (x) { return pre + ' ' + x.trim(); }).join(',') + '{'; }); }
  var CSS = [
    '.odg{--odg-ok:var(--ows-green-soft,#E3F4EA);--odg-ok-i:var(--ows-green,#1E7A4C);--odg-wk:var(--ows-amber-soft,#FBEFD9);--odg-wk-i:var(--ows-amber,#8A5A0B);--odg-sc:var(--ows-brand-soft,#E3F1F8);--odg-sc-i:var(--ows-brand-ink,#0B4F73);--odg-op:var(--ows-sunk,#F1F3F5);--odg-op-i:var(--ows-ink2,#5B6672);--odg-no:#FCEBEB;--odg-no-i:#8B2A1E;font-family:"DM Sans",system-ui,sans-serif;color:var(--ows-ink,#14171A)}',
    '.odg-card{background:var(--ows-paper,#fff);border:1px solid var(--ows-line,#E4E8EC);border-radius:var(--ows-r,14px);padding:16px 18px;box-shadow:var(--ows-shadow,none)}',
    '.odg-lb{font-size:12px;color:var(--ows-ink2,#5B6672)}.odg-k{font:500 10.5px "DM Mono",monospace;letter-spacing:.06em;text-transform:uppercase;color:var(--ows-ink3,#8A949E)}',
    '.odg-strip{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:6px}',
    '.odg-st{background:var(--ows-sunk,#F1F3F5);border:1px solid transparent;border-radius:10px;padding:8px 10px;text-align:left;font:inherit;color:inherit;cursor:pointer}',
    '.odg-st b{display:block;font:600 18px/1.2 Poppins,"DM Sans",sans-serif;font-variant-numeric:tabular-nums}.odg-st.hot{border-color:var(--ows-brand,#0089BD)}.odg-st.sel{background:var(--ows-brand-soft,#E3F1F8)}',
    '.odg-tally-top{display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:8px}.odg-tally-top h3{margin:0;font:600 15px Poppins,"DM Sans",sans-serif}',
    '.odg-bar{position:relative;height:10px;background:var(--ows-sunk,#F1F3F5);border-radius:5px;margin:10px 0 6px;overflow:hidden}.odg-bar .band{position:absolute;top:0;bottom:0;background:var(--odg-sc)}.odg-bar .fill{position:absolute;left:0;top:0;bottom:0;background:var(--ows-brand,#0089BD)}',
    '.odg-row-acts{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;align-items:center}',
    '.odg-btn{font:500 13px "DM Sans",sans-serif;padding:6px 12px;border:1px solid var(--ows-line2,#C9D1D9);border-radius:999px;background:var(--ows-paper,#fff);color:var(--ows-ink,#14171A);cursor:pointer;white-space:nowrap}',
    '.odg-btn:hover{background:var(--ows-sunk,#F1F3F5)}.odg-btn.pri{background:var(--ows-brand,#0089BD);border-color:var(--ows-brand,#0089BD);color:#fff}.odg-btn[disabled]{opacity:.5;cursor:default}.odg-btn.sm{font-size:12px;padding:3px 9px}',
    '.odg-g{display:inline-flex;align-items:center;justify-content:center;min-width:30px;height:22px;padding:0 5px;border-radius:6px;font-size:11px;margin-right:3px}',
    '.odg-ok{background:var(--odg-ok);color:var(--odg-ok-i)}.odg-wk{background:var(--odg-wk);color:var(--odg-wk-i)}.odg-sc{background:var(--odg-sc);color:var(--odg-sc-i)}.odg-op{background:var(--odg-op);color:var(--odg-op-i);box-shadow:inset 0 0 0 1px var(--ows-line,#E4E8EC)}.odg-no{background:var(--odg-no);color:var(--odg-no-i)}',
    '.odg-pill{display:inline-block;font-size:11px;font-weight:600;padding:3px 8px;border-radius:6px;white-space:nowrap}',
    '.odg-pipe-head{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px}',
    '.odg-tools{display:flex;gap:6px;flex-wrap:wrap;align-items:center}.odg-tools select{border:1px solid var(--ows-line,#E4E8EC);border-radius:8px;padding:5px 8px;font:inherit;font-size:12.5px;background:var(--ows-paper,#fff);color:inherit}',
    '.odg-rg{display:grid;grid-template-columns:minmax(0,1fr) 244px 54px 120px;gap:10px;align-items:center;padding:9px 6px;border-top:1px solid var(--ows-line,#E4E8EC);font-size:13px;border-radius:8px}',
    '.odg-rg.hd{border-top:none;padding-top:0}.odg-rg.cur{background:var(--ows-brand-soft,#E3F1F8)}.odg-rg .nm{font-weight:600;cursor:pointer}.odg-rg .nm:hover{text-decoration:underline}',
    '.odg-legend{margin-top:8px;font-size:11px;color:var(--ows-ink2,#5B6672)}',
    '.odg-in{border:1px solid var(--ows-line,#E4E8EC);border-radius:8px;padding:6px 8px;font:inherit;font-size:13px;background:var(--ows-paper,#fff);color:inherit;box-sizing:border-box;max-width:100%}',
    '.odg-gt{display:grid;grid-template-columns:118px 96px minmax(0,1fr);gap:10px;align-items:start;padding:9px 0;border-top:1px solid var(--ows-line,#E4E8EC);font-size:13px}',
    '.odg-gt .src{font-size:12px;color:var(--ows-ink2,#5B6672);margin-top:2px}.odg-gt a{color:var(--ows-brand-ink,#0B4F73);cursor:pointer;text-decoration:underline}',
    '.odg-m{background:var(--ows-sunk,#F1F3F5);border-radius:8px;padding:10px 12px}.odg-m b{display:block;font:600 22px/1.2 Poppins,"DM Sans",sans-serif;font-variant-numeric:tabular-nums}',
    '.odg-tiles{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}',
    '.odg-form{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:8px 12px;margin-top:8px}.odg-form label{display:block;font-size:11.5px;color:var(--ows-ink2,#5B6672)}.odg-form label .odg-in{width:100%;margin-top:3px}',
    '.odg-det{border-top:1px solid var(--ows-line,#E4E8EC);padding:8px 0}.odg-det>summary{cursor:pointer;font-weight:600;font-size:13px;list-style:none}.odg-det>summary::before{content:"\\25B8  ";color:var(--ows-ink3,#8A949E)}.odg-det[open]>summary::before{content:"\\25BE  "}',
    '.odg-flags{margin:8px 0 0;padding:0;list-style:none;font-size:12px;color:var(--odg-wk-i)}.odg-flags li{margin:2px 0}',
    '.odg-msg{font-size:12.5px;margin-top:6px}.odg-msg.err{color:#B03A1E}.odg-msg.ok{color:var(--odg-ok-i)}',
    '.odg-hist{font-size:12px;color:var(--ows-ink2,#5B6672);margin:6px 0 0;padding-left:16px}',
    '.odg-gh{background:none;color:var(--ows-ink2,#5B6672);font-weight:600}.odg-rg.hd>span:nth-child(2){white-space:nowrap}',
    '@media (max-width:760px){' + NARROW + '}',
    scoped(NARROW, '.odg-narrow')
  ].join('\n');
  function style() {
    if (document.getElementById('odg-css')) return;
    var st = document.createElement('style'); st.id = 'odg-css'; st.textContent = CSS; document.head.appendChild(st);
  }
  /* lay out by the element's own width, so a card in a side panel folds on a desktop too; a hidden element (width 0) keeps what it has until it shows */
  function fit(el, px) {
    function go() { var w = el.getBoundingClientRect().width; if (w > 0) { if (w < px) el.classList.add('odg-narrow'); else el.classList.remove('odg-narrow'); } }
    go();
    if (typeof root.ResizeObserver === 'function') { var ro = new root.ResizeObserver(go); ro.observe(el); return function () { ro.disconnect(); }; }
    root.addEventListener('resize', go); return function () { root.removeEventListener('resize', go); };
  }
  function chip(k, st, sch) { var lab = (sch && sch.gateLabels && sch.gateLabels[k]) || k, sl = (sch && sch.stateLabels && sch.stateLabels[st]) || st; return '<span class="odg-g odg-' + (TONE[st] || 'op') + '" title="' + esc(lab + ': ' + sl) + '">' + esc((sch && sch.gateShort && sch.gateShort[k]) || k) + '</span>'; }
  function pill(st, text) { return '<span class="odg-pill odg-' + (TONE[st] || 'op') + '">' + esc(text) + '</span>'; }
  function stagePill(stage, sch, brand, short) {
    var lab = (sch.stageLabels && sch.stageLabels[stage]) || stage;
    if (stage === 'passed') return pill('fails', lab);
    if (stage === 'pursue') return pill('screened', short ? (brand.shortName || brand.name || lab) : lab + (brand.name ? ' · ' + brand.name : ''));
    if (stage === 'brought-in' || stage === 'screened') return pill('open', lab);
    return pill(stage === 'confirmed' ? 'confirmed' : 'working', lab);
  }
  function freeLine(r) {
    var p = [];
    p.push(r.freeKw != null ? fmt(r.freeKw, 0) + ' kW free' : 'free power unknown');
    if (r.units != null) p.push(r.units + ' ' + (r.unitsLabel === 'Omega-Core skids' ? 'skid' : r.unitsLabel === 'pods' ? 'pod' : 'unit') + (r.units === 1 ? '' : 's'));
    return p.join(' · ');
  }
  /* the tally's line: a figure no earmarked site has is said to be missing, never summed to zero; one some sites lack says on how many it rests */
  function tallyLine(t, sch) {
    var p = [t.sites + ' site' + (t.sites === 1 ? '' : 's') + ' ' + esc((sch.stageLabels.pursue || '').toLowerCase())], lack = [];
    if (t.sites) {
      p.push(t.availableKnown ? esc(fmt(t.availableMw, 2)) + ' MW' : 'power not known');
      p.push(t.unitsKnown ? t.units + ' ' + (t.unitLabels && t.unitLabels.length === 1 && t.unitLabels[0] === 'Omega-Core skids' ? 'skid' : 'unit') + (t.units === 1 ? '' : 's') : 'not sized');
      p.push(t.capexKnown ? '<b>' + esc(moneyM(t.capexUsd)) + '</b> capex' : 'capex not modelled');
      if (t.availableKnown && t.availableKnown < t.sites) lack.push('power on ' + t.availableKnown + ' of ' + t.sites);
      if (t.unitsKnown && t.unitsKnown < t.sites) lack.push('sized on ' + t.unitsKnown + ' of ' + t.sites);
      if (t.capexKnown && t.capexKnown < t.sites) lack.push('capex on ' + t.capexKnown + ' of ' + t.sites);
    }
    return p.join(' · ') + (lack.length ? ' <span class="odg-lb">(' + lack.join(', ') + ')</span>' : '');
  }
  function typing(e) { var t = e.target, n = t && t.tagName; return n === 'INPUT' || n === 'TEXTAREA' || n === 'SELECT' || (t && t.isContentEditable); }

  /* ══ the register ════════════════════════════════════════════════════
     mountRegister(el, { data, post(action, extra) → Promise, reload() →
     Promise, openSite(id), msg(text, ok), canEdit }) */
  function mountRegister(el, opts) {
    style();
    var B = binder(el), st = { data: opts.data, stage: '', gate: '', cur: 0, passing: null, confirmLoi: false, screening: null, stop: false };
    el.classList.add('odg');
    function D() { return st.data.diligence; }
    function rows() {
      var list = (st.data.sites || []).filter(function (s) { return s.diligence && !s.archived; });
      if (st.stage === 'live') list = list.filter(function (s) { return s.diligence.stage !== 'passed'; });
      else if (st.stage) list = list.filter(function (s) { return s.diligence.stage === st.stage; });
      if (st.gate) { var g = st.gate.split(':'); list = list.filter(function (s) { var gs = s.diligence.gates || {}; return g[0] === 'any' ? Object.keys(gs).some(function (k) { return gs[k] === g[1]; }) : gs[g[0]] === g[1]; }); }
      return list;
    }
    function render() {
      var d = D(), sch = d.schema, brand = d.brand || {}, t = d.tally, list = rows(), all = (st.data.sites || []).filter(function (s) { return s.diligence && !s.archived; });
      if (st.cur >= list.length) st.cur = Math.max(0, list.length - 1);
      var counts = {}; (d.pipeline || []).forEach(function (x) { counts[x.stage] = x.count; });
      var h = '<div class="odg-strip" role="group" aria-label="Stages">' + sch.stages.concat([sch.passed]).map(function (s) {
        return '<button type="button" class="odg-st' + (s === 'pursue' ? ' hot' : '') + (st.stage === s ? ' sel' : '') + '" data-stage="' + esc(s) + '"><span class="odg-lb" style="font-size:11px">' + esc(sch.stageLabels[s]) + '</span><b>' + (counts[s] || 0) + '</b></button>';
      }).join('') + '</div>';
      /* the tally, under the workspace's own name */
      var tg = t.target, maxUsd = tg ? Math.max(tg.maxUsd, t.capexUsd || 0) : Math.max(t.capexUsd || 0, 1), partner = sch.config && sch.config.offtake && sch.config.offtake.partner;
      var earm = all.filter(function (s) { return s.diligence.stage === 'pursue'; }).length;
      h += '<div class="odg-card" style="margin-top:12px"><div class="odg-tally-top"><h3>' + esc(brand.name || 'Pipeline') + '</h3><div style="font-size:13px">' + tallyLine(t, sch) + '</div></div>';
      if (tg) h += '<div class="odg-bar" aria-hidden="true"><div class="band" style="left:' + (tg.minUsd / maxUsd * 100).toFixed(1) + '%;width:' + ((tg.maxUsd - tg.minUsd) / maxUsd * 100).toFixed(1) + '%"></div><div class="fill" style="width:' + Math.min(100, (t.capexUsd || 0) / maxUsd * 100).toFixed(1) + '%"></div></div>' +
        '<div style="display:flex;justify-content:space-between" class="odg-lb"><span>$0</span><span>' + esc(tg.label) + ' ' + esc(moneyM(tg.minUsd).replace(/M$/, '')) + '–' + esc(moneyM(tg.maxUsd)) + '</span></div>';
      h += '<div class="odg-row-acts">' + (partner && opts.canEdit ? '<button type="button" class="odg-btn" data-act="loi"' + (earm ? '' : ' disabled title="Earmark sites first"') + '>Send LOI package to ' + esc(partner.name) + '</button>' : '') +
        '<button type="button" class="odg-btn" data-act="view">' + (st.stage === 'pursue' ? 'Show every site' : 'Open ' + esc(brand.name || '') + ' view') + '</button></div>';
      if (st.confirmLoi) h += '<div class="odg-m" style="margin-top:10px">Send <b>' + earm + ' ' + esc((sch.stageLabels.pursue || '').toLowerCase()) + ' site' + (earm === 1 ? '' : 's') + '</b> to ' + esc(partner ? partner.name : '') + ' in one LOI package? It carries each site’s power, compute, chips, fiber and control, never your IRR or capex, with you in copy.' +
        '<textarea class="odg-in" id="odg-loi-note" rows="2" style="width:100%;margin-top:8px" placeholder="A note for the partner (optional)"></textarea><div class="odg-row-acts"><button type="button" class="odg-btn pri" data-act="loi-send">Send the package</button><button type="button" class="odg-btn" data-act="loi-cancel">Cancel</button></div></div>';
      h += '</div>';
      /* the pipeline */
      h += '<div class="odg-card" style="margin-top:12px"><div class="odg-pipe-head"><div class="odg-lb">' + esc((brand.name ? brand.name + ' pipeline' : 'Pipeline')) + ' · ' + list.length + ' of ' + all.length + ' site' + (all.length === 1 ? '' : 's') + '</div><div class="odg-tools">' +
        '<select aria-label="Stage" data-f="stage"><option value="">Any stage</option><option value="live"' + (st.stage === 'live' ? ' selected' : '') + '>Not passed</option>' + sch.stages.concat([sch.passed]).map(function (s) { return '<option value="' + esc(s) + '"' + (st.stage === s ? ' selected' : '') + '>' + esc(sch.stageLabels[s]) + '</option>'; }).join('') + '</select>' +
        '<select aria-label="Gate" data-f="gate"><option value="">Any gate</option>' + ['any'].concat(sch.gates).map(function (g) { return sch.gateStates.map(function (s) { var v = g + ':' + s; return '<option value="' + esc(v) + '"' + (st.gate === v ? ' selected' : '') + '>' + esc((g === 'any' ? 'Any gate' : sch.gateLabels[g]) + ': ' + sch.stateLabels[s]) + '</option>'; }).join(''); }).join('') + '</select>' +
        (opts.canEdit ? '<button type="button" class="odg-btn" data-act="screen"' + (st.screening ? ' disabled' : '') + '>Screen with Grid Atlas</button>' : '') + '</div></div>';
      if (st.screening) h += '<div class="odg-m" style="margin-bottom:8px">' + esc(st.screening) + ' <button type="button" class="odg-btn sm" data-act="screen-stop">Stop</button></div>';
      h += '<div class="odg-rg hd odg-lb"><span>Site</span><span>' + sch.gates.map(function (g) { return '<span class="odg-g odg-gh" title="' + esc(sch.gateLabels[g]) + '">' + esc((sch.gateShort && sch.gateShort[g]) || g) + '</span>'; }).join('') + '</span><span>IRR</span><span>Stage</span></div>';
      if (!list.length) h += '<div class="odg-lb" style="padding:14px 6px">' + (all.length ? 'No site matches these filters.' : 'No sites yet: import or register sites above.') + '</div>';
      list.forEach(function (s, i) {
        var r = s.diligence, loc = [s.city, s.state].filter(Boolean).join(', ');
        h += '<div class="odg-rg' + (i === st.cur ? ' cur' : '') + '" data-row="' + i + '" data-id="' + esc(s.id) + '"><div><div class="nm" data-act="open">' + esc(s.name || 'Site') + (loc ? '<span class="odg-lb" style="font-weight:400"> · ' + esc(loc) + '</span>' : '') + '</div><div class="odg-lb">' + esc(freeLine(r)) + '</div></div>' +
          '<div>' + sch.gates.map(function (g) { return chip(g, r.gates[g], sch); }).join('') + '</div>' +
          '<div>' + (r.irrPct != null ? esc(fmt(r.irrPct, 0)) + '%' : '<span class="odg-lb">—</span>') + '</div><div>' + stageCell(s, r, sch, brand) + '</div></div>';
      });
      h += '<div class="odg-legend">Legend: green ' + esc(sch.stateLabels.confirmed) + ' (document) · amber ' + esc(sch.stateLabels.working) + ' · blue ' + esc(sch.stateLabels.screened) + ' (public data) · grey ' + esc(sch.stateLabels.open) + ' · red ' + esc(sch.stateLabels.fails) + ' · J/K next, E ' + esc((sch.callLabels.pursue || '').toLowerCase()) + ', P pass</div></div>';
      el.innerHTML = h;
    }
    function stageCell(s, r, sch, brand) {
      if (st.passing === s.id) return '<div><input class="odg-in" data-pass-reason style="width:100%" placeholder="Why pass? (5+ characters)" aria-label="Reason to pass"><div style="margin-top:4px"><button type="button" class="odg-btn sm pri" data-act="pass-go">Pass</button> <button type="button" class="odg-btn sm" data-act="pass-cancel">Cancel</button></div></div>';
      if (r.stage === 'passed') return stagePill('passed', sch, brand, true) + '<div class="odg-lb" style="font-size:11px">' + esc((r.decision && r.decision.reason) || '') + '</div>';
      if ((r.stage === 'brought-in' || r.stage === 'screened') && opts.canEdit) return '<button type="button" class="odg-btn sm" data-act="earmark">' + esc(sch.callLabels.pursue) + '</button>';
      return stagePill(r.stage, sch, brand, true);
    }
    function current() { var l = rows(); return l[st.cur] || null; }
    function act(p, okText) {
      return p.then(function (j) { if (okText || (j && j.note)) opts.msg(okText || j.note, true); return opts.reload(); }).catch(function (e) { opts.msg(e.message); });
    }
    function earmark(s) { return act(opts.post('diligence-decide', { site: s.id, choice: 'pursue' }), (s.name || 'Site') + ': ' + D().schema.stageLabels.pursue.toLowerCase() + '.'); }
    function startPass(s) { st.passing = s.id; render(); var x = qs(el, '[data-pass-reason]'); if (x) x.focus(); }
    function doPass() {
      var s = (st.data.sites || []).filter(function (x) { return x.id === st.passing; })[0], x = qs(el, '[data-pass-reason]'), why = x ? x.value.trim() : '';
      if (!s) return;
      if (why.length < 5) { opts.msg('Say why you pass on ' + (s.name || 'the site') + ' (5 characters or more).'); if (x) x.focus(); return; }
      st.passing = null; act(opts.post('diligence-decide', { site: s.id, choice: 'pass', reason: why }), (s.name || 'Site') + ': passed.');
    }
    function screen() {
      var ids = rows().map(function (s) { return s.id; }); if (!ids.length) return;
      st.stop = false; st.screening = 'Starting the Grid Atlas screen…'; render();
      opts.post('diligence-screen-start', { ids: ids }).then(function (j) {
        var job = j.job;
        if (!job.total) { st.screening = null; opts.msg('Every site here was screened in the last week' + (j.skippedFresh && j.skippedFresh.length ? ' (' + j.skippedFresh.length + ')' : '') + '.', true); render(); return; }
        (function next() {
          if (st.stop) { st.screening = null; opts.msg('Screen paused: ' + job.done + ' of ' + job.total + ' done. Press Screen again to carry on.', true); return opts.reload(); }
          st.screening = 'Screening with Grid Atlas: ' + job.done + ' of ' + job.total + ' sites done…'; render();
          return opts.post('diligence-screen-step', { jobId: job.id }).then(function (r) {
            job = r.job;
            if (job.status === 'complete') { st.screening = null; opts.msg('Screened ' + job.done + ' site' + (job.done === 1 ? '' : 's') + (job.failed ? '; ' + job.failed + ' could not be located' : '') + '. Gates move to screened only on public data; nothing is confirmed by a screen.', true); return opts.reload(); }
            return next();
          });
        })();
      }).catch(function (e) { st.screening = null; render(); opts.msg(e.message); });
    }
    B.on('click', function (e) {
      var b = e.target.closest('[data-act],[data-stage]'); if (!b || !el.contains(b)) return;
      var row = e.target.closest('[data-id]'), s = row ? (st.data.sites || []).filter(function (x) { return x.id === row.getAttribute('data-id'); })[0] : null;
      if (row) st.cur = Number(row.getAttribute('data-row')) || 0;
      if (b.hasAttribute('data-stage')) { var sg = b.getAttribute('data-stage'); st.stage = st.stage === sg ? '' : sg; st.cur = 0; render(); return; }
      var a = b.getAttribute('data-act');
      if (a === 'open' && s) opts.openSite(s.id);
      else if (a === 'earmark' && s) earmark(s);
      else if (a === 'pass-go') doPass();
      else if (a === 'pass-cancel') { st.passing = null; render(); }
      else if (a === 'view') { st.stage = st.stage === 'pursue' ? '' : 'pursue'; st.cur = 0; render(); }
      else if (a === 'loi') { st.confirmLoi = true; render(); var n = qs(el, '#odg-loi-note'); if (n) n.focus(); }
      else if (a === 'loi-cancel') { st.confirmLoi = false; render(); }
      else if (a === 'loi-send') { var note = val(el, '#odg-loi-note'); st.confirmLoi = false; render(); act(opts.post('diligence-loi', { note: note || undefined })); }
      else if (a === 'screen') screen();
      else if (a === 'screen-stop') { st.stop = true; }
    });
    B.on('change', function (e) {
      var f = e.target.getAttribute && e.target.getAttribute('data-f'); if (!f) return;
      st[f] = e.target.value; st.cur = 0; render();
    });
    B.on('keydown', function (e) { if (e.key === 'Enter' && e.target.hasAttribute && e.target.hasAttribute('data-pass-reason')) { e.preventDefault(); doPass(); } if (e.key === 'Escape' && st.passing) { st.passing = null; render(); } });
    /* J/K next and previous, E earmark, P pass, Enter open: anywhere on the page but a field */
    function keys(e) {
      if (!el.isConnected || typing(e) || e.metaKey || e.ctrlKey || e.altKey || document.getElementById('ows-overlay')) return;
      var k = e.key.toLowerCase(), l = rows(); if (!l.length) return;
      if (k === 'j' || k === 'k') { st.cur = Math.max(0, Math.min(l.length - 1, st.cur + (k === 'j' ? 1 : -1))); render(); var c = qs(el, '.odg-rg.cur'); if (c && c.scrollIntoView) c.scrollIntoView({ block: 'nearest' }); e.preventDefault(); }
      else if (k === 'e' && opts.canEdit) { var s = l[st.cur]; if (s && (s.diligence.stage === 'brought-in' || s.diligence.stage === 'screened')) { earmark(s); e.preventDefault(); } }
      else if (k === 'p' && opts.canEdit) { var p = l[st.cur]; if (p && p.diligence.stage !== 'passed') { startPass(p); e.preventDefault(); } }
      else if (k === 'enter') { var o = l[st.cur]; if (o) { opts.openSite(o.id); e.preventDefault(); } }
    }
    B.on('keydown', keys, document);
    render();
    var unfit = fit(el, 700);
    el.__odg = { update: function (data) { st.data = data; render(); }, current: current, destroy: function () { B.off(); unfit(); st.stop = true; el.classList.remove('odg-narrow'); el.innerHTML = ''; el.__odg = null; } };
    return el.__odg;
  }

  /* ══ the site's card ═════════════════════════════════════════════════
     mountCard(el, { site, diligence: { view, schema, brand }, files, post,
     reload, next() | null, canEdit, msg }) */
  function mountCard(el, opts) {
    style();
    var B = binder(el), st = { d: opts.diligence, edit: null, price: null, passing: false, note: null };
    el.classList.add('odg');
    function V() { return st.d.view; }
    function S() { return st.d.schema; }
    /* the card's last word stays through a redraw until the next action */
    function noteHtml() { return '<div class="odg-msg odg-cardmsg' + (st.note ? (st.note.ok ? ' ok' : ' err') : '') + '" role="status">' + esc(st.note ? st.note.text : '') + '</div>'; }
    function say(text, ok) { st.note = text ? { text: text, ok: !!ok } : null; var m = qs(el, '.odg-cardmsg'); if (m) m.outerHTML = noteHtml(); if (opts.msg && !ok) opts.msg(text); }
    function done(j, okText) {
      if (j && j.diligence && j.diligence.stage) st.d.view = j.diligence;   /* the change answers with the new view */
      st.edit = null; render(); if (okText) say(okText, true);
      if (opts.reload) opts.reload(true);
    }
    function post(action, extra, okText) { st.note = null; return opts.post(action, Object.assign({ site: opts.site.id }, extra || {})).then(function (j) { done(j, okText || (j && j.unchanged ? 'Nothing changed.' : 'Saved.')); return j; }).catch(function (e) { say(e.message); }); }
    function ladderRow(v) {
      var L = v.ladder || []; if (!L.length) return null;
      var want = st.price != null ? st.price : (v.offtake.pricePerGpuHour != null ? v.offtake.pricePerGpuHour : (v.economics.ladderBasis && v.economics.ladderBasis.centre));
      var best = L[0]; L.forEach(function (r) { if (Math.abs(r.price - want) < Math.abs(best.price - want)) best = r; });
      return best;
    }
    function render() {
      var v = V(), sch = S(), brand = st.d.brand || {}, s = opts.site, ec = v.economics, h = '';
      var head = [v.power.availableKw != null ? fmt(v.power.availableKw, 0) + ' kW free' : 'free power unknown'];
      if (ec.units != null) head.push(ec.units + ' ' + (ec.unitsLabel || 'units'));
      var chosen = (v.sizing && (v.sizing.byChipset || []).filter(function (x) { return x.chosen; })[0]) || null;
      if (chosen || (v.gates.chips.value && v.gates.chips.value.chipset)) head.push((chosen && chosen.name) || v.gates.chips.value.chipset);
      h += '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap"><div><div style="font:600 16px Poppins,\'DM Sans\',sans-serif">' + esc(s.name || 'Site') + '</div><div class="odg-lb">' + esc(head.join(' · ')) + (v.intakeLabel ? ' · ' + esc(v.intakeLabel) : '') + '</div></div>' +
        '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">' + stagePill(v.stage, sch, brand, false) +
        (opts.canEdit && (v.stage === 'brought-in' || v.stage === 'screened') ? '<button type="button" class="odg-btn" data-act="earmark">' + esc(sch.callLabels.pursue) + '</button>' : '') +
        (opts.canEdit && v.stage !== 'passed' ? '<button type="button" class="odg-btn" data-act="pass">Pass</button>' : '') +
        (opts.canEdit && v.stage === 'passed' ? '<button type="button" class="odg-btn" data-act="reopen">Reopen</button>' : '') +
        (opts.next ? '<button type="button" class="odg-btn" data-act="next">Next site →</button>' : '') + '</div></div>';
      if (st.passing) h += '<div class="odg-m" style="margin-top:8px"><input class="odg-in" data-pass-reason style="width:100%" placeholder="Why pass? (5+ characters)" aria-label="Reason to pass"><div class="odg-row-acts"><button type="button" class="odg-btn pri" data-act="pass-go">Pass</button><button type="button" class="odg-btn" data-act="pass-cancel">Cancel</button></div></div>';
      if (v.decision && v.decision.choice === 'pass') h += '<div class="odg-m" style="margin-top:8px"><b style="font-size:13px;display:inline">Passed' + (v.decision.auto ? ' by the workspace’s exclusion' : '') + ':</b> ' + esc(v.decision.reason || '') +
        (v.decision.auto ? ' <span class="odg-lb">(' + esc(v.decision.auto.field) + ' is ' + esc(v.decision.auto.value) + ')</span>' + (opts.canEdit ? '<div class="odg-row-acts"><input class="odg-in" data-reverse-reason style="flex:1;min-width:200px" placeholder="Why reverse the exclusion? (5+ characters)"><button type="button" class="odg-btn" data-act="reverse">Reverse and ' + esc(sch.callLabels.pursue.toLowerCase()) + '</button></div>' : '') : '') + '</div>';
      if (v.next && v.next.stage) h += '<div class="odg-lb" style="margin-top:6px">Next: ' + esc(v.next.label) + (v.next.requirement ? ' — ' + esc(v.next.requirement) : (opts.canEdit ? ' <button type="button" class="odg-btn sm" data-act="advance">Move to ' + esc(v.next.label) + '</button>' : '')) + '</div>';
      h += noteHtml();
      /* a row a gate */
      h += '<div style="margin-top:8px">';
      ROW_GATES.forEach(function (k) {
        var g = v.gates[k], L = (v.lines && v.lines[k]) || {}, a = L.action;
        h += '<div class="odg-gt"><div style="font-weight:600">' + esc(g.label) + '</div><div>' + pill(g.state, g.stateLabel) + '</div><div>' + esc(L.sentence || '') +
          '<div class="src">' + esc(L.sources || '') + (a && opts.canEdit ? (L.sources ? ' · ' : '') + '<a data-act="gate-action" data-gate="' + k + '">' + esc(a.label) + '</a>' : '') +
          (opts.canEdit ? ' · <a data-act="gate-edit" data-gate="' + k + '">Update</a>' : '') + '</div>' + (st.edit === k ? gateForm(k, g, sch) : '') + '</div></div>';
      });
      h += '</div>';
      /* sizing chips, one a chipset */
      if (v.sizing && (v.sizing.words || (v.sizing.byChipset || []).length)) h += '<div style="border-top:1px solid var(--ows-line,#E4E8EC);padding-top:10px;margin-top:4px"><div class="odg-lb" style="margin-bottom:6px">' + esc(v.sizing.words || 'Size by chipset') + '</div><div style="display:flex;gap:6px;flex-wrap:wrap;font-size:12px">' +
        (v.sizing.byChipset || []).map(function (x) { return '<span class="odg-pill odg-' + (x.chosen ? 'sc' : 'op') + '">' + esc(x.name) + ' · ' + esc(fmt(x.gpus, 0)) + ' GPUs</span>'; }).join('') + '</div></div>';
      /* the economics: the server's ladder, the band, the lines */
      h += '<div style="border-top:1px solid var(--ows-line,#E4E8EC);padding-top:10px;margin-top:10px"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><span style="font-weight:600;font-size:13px">' + esc(v.gates.economics.label) + '</span>' + pill(v.gates.economics.state, v.gates.economics.stateLabel) + '</div>';
      var lr = ladderRow(v);
      if (lr) {
        var L2 = v.ladder, lo = L2[0].price, hi = L2[L2.length - 1].price, step = L2.length > 1 ? Math.round((L2[1].price - L2[0].price) * 100) / 100 : 0.05;
        h += '<div style="display:flex;align-items:center;gap:12px;margin:10px 0"><label for="odg-px" class="odg-lb">Contract price in the LOI</label><input type="range" id="odg-px" min="' + lo + '" max="' + hi + '" step="' + step + '" value="' + lr.price + '" style="flex:1" aria-describedby="odg-econ"><span data-px style="font-weight:600;min-width:96px;text-align:right">$' + esc(lr.price.toFixed(2)) + '/GPU-hr</span></div>' +
          '<div id="odg-econ" data-econ aria-live="polite">' + econHtml(v, lr) + '</div>' +
          '<div class="odg-lb" style="margin-top:6px">' + esc(v.gates.economics.note || '') + (ec.disclaimer ? ' · ' + esc(ec.disclaimer) : '') + '</div>';
      } else h += '<div style="font-size:13px;margin-top:6px">' + esc((v.lines && v.lines.economics && v.lines.economics.sentence) || 'No economics on file') + '</div><div class="odg-lb">' + esc(v.gates.economics.note || '') + '</div>';
      h += '</div>';
      /* what the record says needs a look */
      var fl = (v.flags || []).filter(function (f) { return f.code !== 'EXCLUDED'; });
      if (fl.length) h += '<ul class="odg-flags">' + fl.slice(0, 8).map(function (f) { return '<li>⚠ ' + esc(f.message) + '</li>'; }).join('') + '</ul>';
      /* the forms */
      if (opts.canEdit) h += forms(v, sch);
      if (v.history && v.history.length) h += '<details class="odg-det"><summary>History</summary><ul class="odg-hist">' + v.history.slice(0, 12).map(function (x) { return '<li>' + esc(String(x.at || '').slice(0, 10)) + ' · ' + esc(x.by || '') + ' · ' + esc(x.what) + (x.to != null && typeof x.to !== 'object' ? ' → ' + esc(x.to) : '') + (x.note ? ' — ' + esc(x.note) : '') + '</li>'; }).join('') + '</ul></details>';
      el.innerHTML = '<div class="odg-card">' + h + '</div>';
    }
    /* the figures beside the slider: one row of the server's ladder, as it answered */
    function econHtml(v, lr) {
      var ec = v.economics;
      return '<div class="odg-tiles"><div class="odg-m"><div class="odg-lb">Project IRR</div><b>' + esc(fmt(lr.projectIrrPct, 0)) + '%</b></div><div class="odg-m"><div class="odg-lb">Payback</div><b>' + (lr.paybackMonths != null ? esc(lr.paybackMonths) + ' mo' : '—') + '</b></div>' +
        '<div class="odg-m"><div class="odg-lb">Cash multiple</div><b>' + (lr.projectMultiple != null ? esc(lr.projectMultiple.toFixed(2)) + '×' : '—') + '</b></div><div class="odg-m"><div class="odg-lb">ROI over ' + esc(fmt(v.offtake.termYears, 0)) + ' yrs</div><b>' + esc(fmt(lr.roiPct, 0)) + '%</b></div></div>' +
        (lr.bandWords ? '<div style="font-size:13px;margin-top:10px;color:' + (lr.band === 'below' ? 'var(--odg-no-i)' : lr.band === 'inside' ? 'var(--odg-ok-i)' : 'var(--odg-sc-i)') + '">' + esc(lr.bandWords) + '</div>' : '') +
        '<div class="odg-lb" style="margin-top:4px">' + esc([ec.units != null ? ec.units + ' ' + (ec.unitsLabel === 'Omega-Core skids' ? 'skids' : 'units') : null, ec.capexUsd != null ? 'capex ' + money(ec.capexUsd) : null, lr.revenuePerYear != null ? 'revenue ' + money(lr.revenuePerYear) + ' a year' : null,
          lr.partnerFeePerYear != null && v.offtake.partner ? v.offtake.partner.name + ' fee ' + money(lr.partnerFeePerYear) + ' a year' : null, lr.irrWithoutFeePct != null && v.offtake.partner ? 'without the fee: ' + fmt(lr.irrWithoutFeePct, 0) + '% IRR' : null].filter(Boolean).join(' · ')) + '</div>' +
        (opts.canEdit && lr.price !== v.offtake.pricePerGpuHour ? '<div class="odg-row-acts"><button type="button" class="odg-btn sm" data-act="set-price" data-price="' + lr.price + '">Use $' + esc(lr.price.toFixed(2)) + ' as the LOI price</button></div>' : '');
    }
    function field(name, label, value, extra) { return '<label>' + esc(label) + '<input class="odg-in" name="' + name + '" value="' + esc(value == null ? '' : value) + '"' + (extra || '') + '></label>'; }
    function select(name, label, options, value) { return '<label>' + esc(label) + '<select class="odg-in" name="' + name + '"><option value="">—</option>' + options.map(function (o) { var k = typeof o === 'string' ? o : o.key, l = typeof o === 'string' ? o : o.label; return '<option value="' + esc(k) + '"' + (String(value) === String(k) ? ' selected' : '') + '>' + esc(l) + '</option>'; }).join('') + '</select></label>'; }
    function yesno(name, label, value) { return select(name, label, [{ key: 'true', label: 'Yes' }, { key: 'false', label: 'No' }], value === true ? 'true' : value === false ? 'false' : ''); }
    function files() { return (opts.files || []).filter(function (f) { return !f.archived; }).map(function (f) { return { key: f.id, label: f.name }; }); }
    function gateForm(k, g, sch) {
      var v = g.value || {}, src = g.source || {}, docs = (k === 'control' ? (V().control.route ? sch.routes[V().control.route].confirmedBy : []) : (sch.confirmedBy[k] || [])).map(function (d) { return { key: d, label: sch.docs[d] }; });
      var h = '<form data-form="gate" data-gate="' + k + '" class="odg-form" style="background:var(--ows-sunk,#F1F3F5);padding:10px;border-radius:10px">' +
        select('state', 'State', sch.gateStates.map(function (s) { return { key: s, label: (sch.gateStateLabels[k] && sch.gateStateLabels[k][s]) || sch.stateLabels[s] }; }), g.state) +
        select('srcKind', 'Source', sch.sourceKinds, src.kind || '') + field('srcName', 'Source name', src.kind === 'document' ? '' : src.name) + field('srcRef', 'Link or reference', src.ref) +
        select('evidenceFileId', 'Document on the Files', files(), g.evidenceFileId || '') + select('doc', 'Which document', docs, src.doc || '');
      if (k === 'power') h += select('path', 'Power path', sch.powerPaths, v.path || '') + field('serviceKw', 'Service capacity (kW)', v.serviceKw) + field('willServeKw', 'Will-serve (kW)', v.willServeKw) + field('utility', 'Utility', v.utility);
      if (k === 'interconnection') h += field('utility', 'Utility', v.utility) + select('kind', 'Kind', ['existing-service', 'interconnection-agreement', 'queue', 'none'], v.kind || '') + field('approvedImportKw', 'Approved import (kW)', v.approvedImportKw) + field('queueId', 'Queue position', v.queueId) + select('studyStatus', 'Study', ['none', 'requested', 'in-study', 'approved', 'withdrawn'], v.studyStatus || '');
      if (k === 'fiber') h += field('carriers', 'Carriers (comma-separated)', (v.carriers || []).join(', ')) + yesno('symmetric1g', '1 Gbps symmetric', v.symmetric1g) + field('lateralMi', 'Lateral (miles)', v.lateralMi) + field('carrier', 'Carrier on the quote', v.carrier) + field('mrcUsd', 'Monthly charge ($)', v.mrcUsd);
      if (k === 'chips') h += field('chipset', 'Chipset', v.chipset) + field('gpus', 'GPUs', v.gpus) + field('units', 'Units', v.units) + field('supplier', 'Supplier', v.supplier) + field('leadWeeks', 'Lead time (weeks)', v.leadWeeks) + field('deliveryDate', 'Delivery', v.deliveryDate, ' type="date"');
      if (k === 'control' && V().control.route === 'takeover') h += select('amendmentFileId', 'Amendment on the Files', files(), v.amendmentFileId || '');
      h += field('note', 'Note', v.note) + field('reason', 'Reason (for fails)', v.reason) +
        '<div style="grid-column:1/-1" class="odg-row-acts"><button type="submit" class="odg-btn pri">Save ' + esc(g.label.toLowerCase()) + '</button><button type="button" class="odg-btn" data-act="gate-cancel">Cancel</button></div></form>';
      return h;
    }
    function forms(v, sch) {
      var cfg = sch.config || {}, c = v.control || {}, o = v.offtake || {}, ch = v.chargers || {}, sv = v.survey || {}, h = '';
      h += '<details class="odg-det"><summary>Site profile</summary><form data-form="profile" class="odg-form">' + select('intakeType', 'Intake type', cfg.intakeTypes || [], v.intakeType || '') + select('hostDeal', 'Host deal', cfg.hostDeals || [], v.hostDeal || '') + '<div style="grid-column:1/-1"><button type="submit" class="odg-btn pri">Save</button></div></form></details>';
      h += '<details class="odg-det"><summary>Chargers</summary><form data-form="chargers" class="odg-form">' + field('count', 'Chargers', ch.count) + field('kw', 'Nameplate (kW)', ch.kw) + select('status', 'Status', sch.chargerStatus, ch.status || '') + field('network', 'Network', ch.network) + select('use', 'Use', sch.chargerUse, ch.use || '') +
        field('peakKw', 'Measured peak (kW)', ch.peak && ch.peak.kw) + select('peakSource', 'Measured by', sch.peakSources, ch.peak && ch.peak.source || '') + field('peakPeriod', 'Period', ch.peak && ch.peak.period) + '<div style="grid-column:1/-1" class="odg-lb">The nameplate is never subtracted: free power is the service less the measured peak.</div><div style="grid-column:1/-1"><button type="submit" class="odg-btn pri">Save chargers</button></div></form></details>';
      var r = c.route || '', rf = '<form data-form="control" class="odg-form">' + select('route', 'Route', sch.routeKeys || Object.keys(sch.routes).map(function (k) { return { key: k, label: sch.routes[k].label }; }), r);
      if (r === 'own') rf += field('entity', 'Owner entity', c.own && c.own.entity);
      if (r === 'buy') { var b = c.buy || {}; rf += field('priceUsd', 'Purchase price ($)', b.priceUsd) + field('depositUsd', 'Deposit ($)', b.depositUsd) + field('closingDate', 'Closing', b.closingDate, ' type="date"') + field('contingencies', 'Contingencies', b.contingencies); }
      if (r === 'lease') { var l = c.lease || {}; rf += field('rentMonthlyUsd', 'Rent ($ a month)', l.rentMonthlyUsd) + field('escalatorPct', 'Escalator (%/yr)', l.escalatorPct) + field('termYears', 'Term (years)', l.termYears) + field('startDate', 'Start', l.startDate, ' type="date"') + field('endDate', 'End', l.endDate, ' type="date"') + field('renewals', 'Renewal options', l.renewals) + yesno('computePermitted', 'Compute permitted', l.computePermitted) + yesno('storagePermitted', 'Storage permitted', l.storagePermitted); }
      if (r === 'takeover') { var t = c.takeover || {}; rf += field('currentHost', 'Current host', t.currentHost) + field('endDate', 'Host agreement end', t.endDate, ' type="date"') + field('termLeftYears', 'Term left (years)', t.termLeftYears) + field('rentMonthlyUsd', 'Rent ($ a month)', t.rentMonthlyUsd) + field('revenueSharePct', 'Revenue share (%)', t.revenueSharePct) + select('consentToAssign', 'Consent to assign', sch.consent, t.consentToAssign || '') + select('amendment', 'Amendment', sch.amendment, t.amendment || '') + yesno('computeStoragePermitted', 'Compute and storage permitted', t.computeStoragePermitted) + select('equipmentAtTermEnd', 'Equipment at term end', sch.equipmentAtTermEnd, t.equipmentAtTermEnd || ''); }
      rf += '<div style="grid-column:1/-1" class="odg-lb">' + esc(c.term && c.term.end ? 'Control to ' + c.term.end + (c.term.ok === false ? ', ' + c.term.shortMonths + ' months short of the offtake term plus removal' : '') : c.term && c.term.perpetual ? 'Held for as long as it is held' : 'Choose the route, then its terms') + '</div><div style="grid-column:1/-1"><button type="submit" class="odg-btn pri">Save control</button></div></form>';
      h += '<details class="odg-det"' + (st.edit === 'control-form' ? ' open' : '') + '><summary>Site control: ' + esc(r ? sch.routes[r].label : 'not chosen') + '</summary>' + rf + '</details>';
      var off = o.offtaker || {};
      h += '<details class="odg-det"><summary>Offtake' + (o.partner ? ' · ' + esc(o.partner.name) : '') + '</summary><form data-form="offtake" class="odg-form">' + select('loiStatus', 'LOI', sch.loi, o.loiStatus || '') + field('offtakerName', 'Offtaker', off.name) + field('offtakerContact', 'Offtaker contact', off.contact) +
        field('termYears', 'Term (years)' + (o.defaulted && o.defaulted.indexOf('termYears') >= 0 ? ' · default' : ''), o.defaulted && o.defaulted.indexOf('termYears') >= 0 ? '' : o.termYears, o.defaulted && o.defaulted.indexOf('termYears') >= 0 ? ' placeholder="' + esc(o.termYears) + '"' : '') +
        field('pricePerGpuHour', 'Price ($ per GPU-hour)', o.pricePerGpuHour) + field('takeOrPayPct', 'Take-or-pay (%)', o.takeOrPayPct) +
        field('feePct', 'Partner fee (%)' + (o.defaulted && o.defaulted.indexOf('feePct') >= 0 ? ' · default' : ''), o.defaulted && o.defaulted.indexOf('feePct') >= 0 ? '' : o.feePct, o.defaulted && o.defaulted.indexOf('feePct') >= 0 ? ' placeholder="' + esc(o.feePct) + '"' : '') +
        select('status', 'Offtake status', sch.offtakeStatus, o.status || '') + field('startDate', 'Start', o.startDate, ' type="date"') +
        (o.stated ? '<div style="grid-column:1/-1" class="odg-lb">' + esc((o.stated.by || 'The partner') + ' states: ' + [o.stated.termYears ? o.stated.termYears + '-year term' : null, o.stated.returnPct ? o.stated.returnPct.join('–') + '% return' : null, o.stated.paybackYears ? 'about ' + o.stated.paybackYears + '-year payback' : null, o.stated.cardLeadWeeks ? 'cards in about ' + o.stated.cardLeadWeeks + ' weeks' : null].filter(Boolean).join(', ') + (o.stated.verified ? '' : ' (unverified)')) + '</div>' : '') +
        '<div style="grid-column:1/-1"><button type="submit" class="odg-btn pri">Save offtake</button></div></form></details>';
      h += '<details class="odg-det"><summary>Site survey: ' + esc(sv.state || 'open') + '</summary><form data-form="survey" class="odg-form">' + select('state', 'Survey', sch.survey, sv.state || '') + field('date', 'Date', sv.date, ' type="date"') + select('fileId', 'Report on the Files', files(), sv.fileId || '') + field('note', 'Note', sv.note) + '<div style="grid-column:1/-1"><button type="submit" class="odg-btn pri">Save survey</button></div></form></details>';
      return h;
    }
    function n(x) { return x === '' ? null : x; }
    function submit(f) {
      var kind = f.getAttribute('data-form'), g = function (k) { var x = f.elements[k]; return x ? x.value : undefined; };
      if (kind === 'gate') {
        var k = f.getAttribute('data-gate'), body = { gate: k, state: g('state') || undefined, value: { note: n(g('note')), reason: n(g('reason')) } }, sk = g('srcKind');
        ['path', 'serviceKw', 'willServeKw', 'utility', 'kind', 'approvedImportKw', 'queueId', 'studyStatus', 'carriers', 'symmetric1g', 'lateralMi', 'carrier', 'mrcUsd', 'chipset', 'gpus', 'units', 'supplier', 'leadWeeks', 'deliveryDate', 'amendmentFileId'].forEach(function (x) { if (f.elements[x]) body.value[x] = n(g(x)); });
        if (sk) body.source = { kind: sk, name: sk === 'document' ? (n(g('srcName')) || undefined) : g('srcName'), ref: n(g('srcRef')) || undefined, doc: sk === 'document' ? g('doc') : undefined };
        body.evidenceFileId = n(g('evidenceFileId'));
        return post('diligence-gate', body, 'Saved.');
      }
      if (kind === 'profile') return post('diligence-profile', { intakeType: n(g('intakeType')), hostDeal: n(g('hostDeal')) });
      if (kind === 'chargers') { var pk = n(g('peakKw')); return post('diligence-chargers', { count: n(g('count')), kw: n(g('kw')), status: n(g('status')), network: n(g('network')), use: n(g('use')), peak: pk == null && !g('peakSource') ? undefined : { kw: pk, source: n(g('peakSource')), period: n(g('peakPeriod')) } }); }
      if (kind === 'control') {
        var r = g('route'), cb = { route: n(r) };
        var keys = { own: ['entity'], buy: ['priceUsd', 'depositUsd', 'closingDate', 'contingencies'], lease: ['rentMonthlyUsd', 'escalatorPct', 'termYears', 'startDate', 'endDate', 'renewals', 'computePermitted', 'storagePermitted'], takeover: ['currentHost', 'endDate', 'termLeftYears', 'rentMonthlyUsd', 'revenueSharePct', 'consentToAssign', 'amendment', 'computeStoragePermitted', 'equipmentAtTermEnd'] };
        if (r && keys[r] && keys[r].some(function (x) { return f.elements[x]; })) { cb[r] = {}; keys[r].forEach(function (x) { if (f.elements[x]) cb[r][x] = n(g(x)); }); }
        return post('diligence-control', cb, r && !cb[r] ? 'Route chosen: fill in its terms.' : 'Saved.');
      }
      if (kind === 'offtake') {
        var ob = { loiStatus: n(g('loiStatus')), termYears: n(g('termYears')), pricePerGpuHour: n(g('pricePerGpuHour')), takeOrPayPct: n(g('takeOrPayPct')), feePct: n(g('feePct')), status: n(g('status')), startDate: n(g('startDate')) };
        if (g('offtakerName')) ob.offtaker = { name: g('offtakerName'), contact: n(g('offtakerContact')) };
        return post('diligence-offtake', ob);
      }
      if (kind === 'survey') return post('diligence-survey', { state: n(g('state')), date: n(g('date')), fileId: n(g('fileId')), note: n(g('note')) });
    }
    B.on('submit', function (e) { var f = e.target.closest('form[data-form]'); if (!f) return; e.preventDefault(); submit(f); });
    B.on('change', function (e) {
      if (e.target.id === 'odg-px') return;
      var f = e.target.closest('form[data-form="control"]'); if (f && e.target.name === 'route') { st.d.view.control = Object.assign({}, st.d.view.control, { route: e.target.value || null }); st.edit = 'control-form'; render(); }
    });
    /* the slider moves through the server's rows; only the figures beside it are drawn again, so a drag is never cut */
    B.on('input', function (e) {
      if (e.target.id !== 'odg-px') return;
      st.price = Number(e.target.value); var lr = ladderRow(V()), out = qs(el, '[data-econ]'), px = qs(el, '[data-px]');
      if (lr && out) out.innerHTML = econHtml(V(), lr);
      if (lr && px) px.textContent = '$' + lr.price.toFixed(2) + '/GPU-hr';
    });
    B.on('keydown', function (e) { if (e.key === 'Enter' && e.target.hasAttribute && e.target.hasAttribute('data-pass-reason')) { e.preventDefault(); doPass(); } });
    function doPass() { var x = qs(el, '[data-pass-reason]'), why = x ? x.value.trim() : ''; if (why.length < 5) { say('Say why you pass (5 characters or more).'); return; } st.passing = false; post('diligence-decide', { choice: 'pass', reason: why }, 'Passed.'); }
    B.on('click', function (e) {
      var b = e.target.closest('[data-act]'); if (!b || !el.contains(b)) return;
      var a = b.getAttribute('data-act'), k = b.getAttribute('data-gate'), v = V();
      if (a === 'earmark') post('diligence-decide', { choice: 'pursue' }, S().stageLabels.pursue + '.');
      else if (a === 'pass') { st.passing = true; render(); var x = qs(el, '[data-pass-reason]'); if (x) x.focus(); }
      else if (a === 'pass-go') doPass();
      else if (a === 'pass-cancel') { st.passing = false; render(); }
      else if (a === 'reopen') post('diligence-decide', { choice: 'reopen' }, 'Reopened.');
      else if (a === 'reverse') { var rr = qs(el, '[data-reverse-reason]'); post('diligence-decide', { choice: 'pursue', reason: rr ? rr.value.trim() : '' }, 'Exclusion reversed; ' + S().stageLabels.pursue.toLowerCase() + '.'); }
      else if (a === 'advance' && v.next && v.next.stage) post('diligence-stage', { stage: v.next.stage }, 'Moved to ' + v.next.label + '.');
      else if (a === 'next' && opts.next) opts.next();
      else if (a === 'gate-edit') { st.edit = st.edit === k ? null : k; render(); }
      else if (a === 'gate-cancel') { st.edit = null; render(); }
      else if (a === 'set-price') post('diligence-offtake', { pricePerGpuHour: Number(b.getAttribute('data-price')) }, 'LOI price set.');
      else if (a === 'gate-action') {
        var act2 = v.lines[k] && v.lines[k].action; if (!act2) return;
        if (act2.key === 'control-form') { st.edit = 'control-form'; render(); return; }
        if (act2.key === 'loi-package') { opts.post('diligence-loi', { ids: [opts.site.id] }).then(function (j) { done(null, j.note); }).catch(function (e2) { say(e2.message); }); return; }
        if (act2.task) opts.post('log', { site: opts.site.id, type: 'task', subject: act2.task.subject, body: 'Evidence: ' + act2.task.evidence })
          .then(function () { return act2.moves ? post('diligence-gate', { gate: act2.moves.gate, state: act2.moves.state }, 'Logged on Today: ' + act2.task.subject + '.') : done(null, 'Logged.'); }).catch(function (e3) { say(e3.message); });
      }
    });
    render();
    var unfit = fit(el, 640);
    el.__odg = { update: function (d, site, filesList) { st.d = d; if (site) opts.site = site; if (filesList) opts.files = filesList; render(); }, destroy: function () { B.off(); unfit(); el.classList.remove('odg-narrow'); el.innerHTML = ''; el.__odg = null; } };
    return el.__odg;
  }

  root.OmegaDiligence = { mountRegister: mountRegister, mountCard: mountCard, TONE: TONE };
})(typeof window !== 'undefined' ? window : this);
