/* omega-finance-path.js — from the drawing to a fundable deal, in one session.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Output › Financing › Finance It (2026-10-16; docs/BLUEPRINT-TO-BUILD.md
   Phase 5: "drawing → financed project in one session ... Perplexity stops at
   the price; we hand over a fundable deal"). One panel takes the reviewed
   model, in order, through what turns a priced drawing into a deal someone
   can fund:
   - saved;
   - priced by the Run;
   - its returns;
   - the compute case when there is compute on the drawing;
   - checked against the customer's plans when they were read (Read Plans);
   - then the hand-offs: Helios's intake, the marketplace, a lender.

   Each step's state is read from what the editor already holds: the Run's
   own total and freshness (S.lastRunAt, S.resultsStale, window._COST_TOTAL),
   the Results rail's own figures (window._RR_FIN), the Omega-Core
   qualification riding on the project (S.omegaCore), and the server's
   comparison with the plans (OmegaPlanRead.changes). Each step's button is
   the ribbon's own command, clicked, so every gate, guard and plan rule
   applies exactly as if the person had pressed it. A command the plan does
   not open says so instead. The hand-offs wait until the project is saved
   and the Run has priced the drawing as it stands: what goes out is the
   reviewed model, never a stale one. The hand-offs stay on the ribbon as
   they were.

   It works nothing out and writes nothing itself. `steps(state)` is the one
   rule for what each step says (pure; scripts/tests/tfinancepath.js).
   ES5 on purpose (CLAUDE.md): var, function, no build step. */
(function (root) {
  'use strict';
  var doc = root.document;

  function money(x) { return '$' + Math.round(+x || 0).toLocaleString('en-US'); }
  function day(iso) { var d = iso ? new Date(iso) : null; return d && isFinite(d.getTime()) ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''; }
  function num(x) { return x != null && isFinite(x); }

  /* the Omega-Core verdicts, in the qualifier's own words */
  var VERDICT = { qualified: 'qualified', conditional: 'qualified with conditions', 'needs-qualification': 'needs further qualification', 'not-qualified': 'does not qualify' };
  /* the hand-offs, in the order a deal goes out */
  var HANDOFFS = [
    ['helios', 'Helios intake', 'Helios Energy Advisors’ first-pass checklist, filled from this project, previewed and sent from here.'],
    ['market', 'List it for capital', 'Files the deal in the finance marketplace for capital partners to find, attributed to your account.'],
    ['financing', 'Ask a lender for a price', 'Apply for Financing: a pricing request with the project carried across.']
  ];

  /* ── the rule: what each step says, from what the editor holds ────────
     s: { project: { id, dirty }, priced: { ran, stale, running, total },
          fin: { irr, perW, payback } | null (the rail's, current only),
          compute: { skids, pods, core: { verdict, at } | null },
          plans: { fileName, readAt, differ } | null,
          allowed: { <action>: false when the plan does not open it } }
     Each step: key, label, status (done · todo · review · wait · go · info),
     text, action (a key run() knows, or null), locked (the plan does not
     open the action), disabled (an earlier step must be done first). */
  function steps(s) {
    s = s || {};
    var p = s.project || {}, pr = s.priced || {}, fin = s.fin || null, c = s.compute || {}, pl = s.plans || null, a = s.allowed || {};
    var saved = !!p.id && !p.dirty, priced = !!pr.ran && !pr.stale && !pr.running && (+pr.total || 0) > 0, ready = saved && priced, out = [];
    function add(o) { o.locked = !!(o.action && a[o.action] === false); out.push(o); }

    add({ key: 'save', label: 'Saved', status: saved ? 'done' : 'todo', action: saved ? null : 'save',
      text: saved ? 'The project is saved; the hand-offs carry it.'
        : !p.id ? 'Save the project first: the hand-offs carry the saved project.'
        : 'The drawing has unsaved changes. Save it, so what goes out is what is on screen.' });

    add({ key: 'run', label: 'Priced by the Run', status: priced ? 'done' : pr.running ? 'wait' : 'todo', action: priced || pr.running ? null : 'run',
      text: pr.running ? 'Running the design…'
        : priced ? 'The Run priced this drawing at ' + money(pr.total) + '.'
        : pr.ran && pr.stale ? 'The drawing changed since the last Run. Run it again.'
        : pr.ran ? 'The Run priced nothing: nothing on the drawing carries a price yet.'
        : 'Run the design to price the drawing.' });

    var irr = priced && fin && num(fin.irr);
    add({ key: 'returns', label: 'Returns', status: !priced ? 'wait' : irr ? 'done' : 'todo', action: !priced ? null : irr ? 'rail' : 'valueStack',
      text: !priced ? 'After the Run.'
        : irr ? '10-year IRR ' + fin.irr.toFixed(1) + '%' + (num(fin.perW) ? ' at $' + fin.perW.toFixed(2) + '/W' : '') + (num(fin.payback) && fin.payback > 0 ? ', payback ' + fin.payback.toFixed(1) + ' years' : '') + ', as the Results rail has them.'
        : 'No revenue is modelled for this drawing, so there is no IRR yet. Model it in the Value Stack.' });

    if (c.skids > 0) {
      var v = c.core && (VERDICT[c.core.verdict] || c.core.verdict);
      add({ key: 'compute', label: 'Compute case', status: v ? 'done' : 'todo', action: 'omegaCore',
        text: v ? 'Omega-Core: ' + v + (c.core.at ? ' (' + day(c.core.at) + ')' : '') + '. The host’s lease and the skid’s own returns are in its panel.'
          : (c.skids === 1 ? 'An Omega-Core skid is' : c.skids + ' Omega-Core skids are') + ' on the drawing. Qualify it for the host’s lease and the skid’s own returns.' });
    } else if (c.pods > 0) {
      add({ key: 'compute', label: 'Compute case', status: 'info', action: 'siteScreen',
        text: 'Compute is on the drawing. Its returns are the Compute Site Pro Forma’s; the Site Screen takes the drawing there.' });
    }

    if (pl) {
      add({ key: 'plans', label: 'Checked against the customer’s plans', status: pl.differ == null ? 'todo' : pl.differ ? 'review' : 'done', action: 'whatChanged',
        text: pl.differ == null ? 'Compare the drawing with ' + (pl.fileName || 'the plans that were read') + '.'
          : pl.differ ? pl.differ + (pl.differ === 1 ? ' row differs' : ' rows differ') + ' from ' + (pl.fileName || 'the plans') + '. Review them; sheet E0.1 carries them in the plan set.'
          : 'The drawing matches ' + (pl.fileName || 'the plans') + ' on everything compared.' });
    }

    HANDOFFS.forEach(function (h) {
      add({ key: h[0], label: h[1], status: ready ? 'go' : 'wait', action: h[0], disabled: !ready,
        text: h[2] + (ready ? '' : ' Once the project is saved and priced as it stands.') });
    });
    return out;
  }

  /* the head of the panel: where the deal stands */
  function headline(list) {
    var need = list.filter(function (x) { return x.status === 'todo' || x.status === 'review'; }), go = list.some(function (x) { return x.status === 'go'; });
    if (go && !need.length) return { tone: 'ok', text: 'Ready to hand over: saved, priced and checked. Take it to a hand-off below.' };
    if (go) return { tone: 'warn', text: 'Ready to hand over. ' + need.length + (need.length === 1 ? ' step is' : ' steps are') + ' still open: ' + need.map(function (x) { return x.label.toLowerCase(); }).join(', ') + '.' };
    return { tone: 'info', text: 'Save the project and run the design; the hand-offs open once the drawing is priced as it stands.' };
  }

  var api = { steps: steps, headline: headline, VERDICT: VERDICT };
  if (!doc) { if (typeof module === 'object' && module.exports) module.exports = api; return; }

  /* ── the page ─────────────────────────────────────────────────────── */
  var HOST = 'finance-path-modal', timer = null, sig = '';
  function el(id) { return doc.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function S_() { try { return root.S || null; } catch (e) { return null; } }

  /* the ribbon's own command for each action: clicked, never re-implemented */
  var COMMAND = {
    valueStack: function () { return el('rb-valuestack'); },
    omegaCore: function () { return doc.querySelector('#ribbon [onclick*="openOmegaCore"]'); },
    siteScreen: function () { return el('rb-site-screen'); },
    helios: function () { return doc.querySelector('#ribbon [onclick*="openHeliosIntake"]'); },
    market: function () { return doc.querySelector('#ribbon [onclick*="openMarketplacePush"]'); },
    financing: function () { return doc.querySelector('#ribbon [onclick*="openFinancingApply"]'); }
  };
  function allowed(btn) {
    if (!btn) return false;
    try { return !root.OmegaCaps || typeof root.OmegaCaps.allowedElement !== 'function' || !!root.OmegaCaps.allowedElement(btn); } catch (e) { return false; }
  }

  function gather() {
    var S = S_() || {}, shapes = S.shapes || [], last = null, pr = S.planRead && S.planRead.id ? S.planRead : null, out;
    try { last = root.OmegaPlanRead && root.OmegaPlanRead._lastChanges ? root.OmegaPlanRead._lastChanges() : null; } catch (e) {}
    out = {
      project: { id: root._projectId || null, dirty: !!root._workDirty },
      priced: { ran: !!S.lastRunAt, stale: !!S.resultsStale, running: !!S.running, total: +root._COST_TOTAL || 0 },
      fin: S.lastRunAt && !S.resultsStale ? root._RR_FIN || null : null,
      compute: { skids: shapes.filter(function (sh) { return sh && sh.kind === 'derdc' && sh.omegaCore; }).length,
        pods: shapes.filter(function (sh) { return sh && sh.kind === 'derdc' && !sh.omegaCore; }).length, core: S.omegaCore && S.omegaCore.verdict ? { verdict: S.omegaCore.verdict, at: S.omegaCore.at } : null },
      plans: pr ? { fileName: pr.fileName, readAt: pr.readAt, differ: last && last.readId === pr.id && last.result ? last.result.differ : null } : null,
      allowed: {}
    };
    Object.keys(COMMAND).forEach(function (k) { out.allowed[k] = allowed(COMMAND[k]()); });
    return out;
  }

  var CSS = ''
    + '#finance-path-modal{position:fixed;inset:0;background:rgba(6,12,22,.82);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px}'
    + '#finance-path-modal .fp-card{background:var(--panel);border:1px solid var(--border);border-radius:12px;max-width:720px;width:100%;max-height:92vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.6);color:var(--text);font-size:12px}'
    + '#finance-path-modal .fp-head{padding:14px 18px;border-bottom:1px solid var(--border);display:flex;align-items:flex-start;justify-content:space-between;gap:12px}'
    + '#finance-path-modal .fp-body{padding:14px 18px;overflow:auto;flex:1;min-height:0}'
    + '#finance-path-modal .fp-sub{font-size:11px;color:var(--sub);line-height:1.55}'
    + '#finance-path-modal .fp-top{border-radius:8px;padding:9px 12px;margin:0 0 12px;line-height:1.5}'
    + '#finance-path-modal .fp-ok{background:rgba(34,197,94,.10);border:1px solid rgba(34,197,94,.45)}'
    + '#finance-path-modal .fp-warn{background:rgba(245,166,35,.12);border:1px solid rgba(245,166,35,.45)}'
    + '#finance-path-modal .fp-info{background:rgba(148,163,184,.10);border:1px solid var(--border)}'
    + '#finance-path-modal ol{list-style:none;margin:0;padding:0}'
    + '#finance-path-modal li{display:flex;gap:11px;align-items:flex-start;padding:10px 0;border-bottom:1px solid var(--border)}'
    + '#finance-path-modal li:last-child{border-bottom:none}'
    + '#finance-path-modal .fp-n{flex:0 0 22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:11px;border:1.5px solid var(--border);color:var(--sub)}'
    + '#finance-path-modal li[data-status=done] .fp-n{background:var(--green,#22C55E);border-color:transparent;color:#05210f}'
    + '#finance-path-modal li[data-status=todo] .fp-n,#finance-path-modal li[data-status=review] .fp-n{border-color:#D8A23E;color:#D8A23E}'
    + '#finance-path-modal li[data-status=go] .fp-n{border-color:var(--accent,#4A8FD8);color:var(--accent,#4A8FD8)}'
    + '#finance-path-modal li[data-status=wait]{opacity:.7}'
    + '#finance-path-modal .fp-main{flex:1;min-width:0}'
    + '#finance-path-modal .fp-label{font-weight:700;font-size:12.5px}'
    + '#finance-path-modal .fp-btn{padding:7px 12px;border-radius:7px;border:1px solid var(--border);background:var(--hover-strong,rgba(255,255,255,.06));color:var(--text);font:inherit;font-size:11.5px;cursor:pointer;white-space:nowrap}'
    + '#finance-path-modal .fp-btn:disabled{opacity:.5;cursor:default}'
    + '#finance-path-modal .fp-go{background:var(--accent,#4A8FD8);border-color:transparent;color:#fff;font-weight:700}'
    + '#finance-path-modal .fp-lock{font-size:10.5px;color:var(--sub);white-space:nowrap}'
    + '@media (max-width:640px){#finance-path-modal{padding:0}#finance-path-modal .fp-card{max-height:100vh;border-radius:0}#finance-path-modal li{flex-wrap:wrap}#finance-path-modal .fp-act{flex-basis:100%;padding-left:33px}}';
  var LABEL = { save: 'Save', run: 'Run', rail: 'Show', valueStack: 'Value Stack', omegaCore: 'Omega-Core', siteScreen: 'Site Screen', whatChanged: 'What changed', helios: 'Helios intake', market: 'Push to Marketplace', financing: 'Apply for Financing' };

  function render() {
    var h = el(HOST); if (!h) return;
    var list = steps(gather()), top = headline(list), s = JSON.stringify([list, top]);
    if (s === sig) return; sig = s;
    var ownBody = el('fp-body'), scroll = ownBody ? ownBody.scrollTop : 0;
    h.innerHTML = '<style>' + CSS + '</style><div class="fp-card"><div class="fp-head"><div><div style="font-size:16px;font-weight:800">Finance it</div>'
      + '<div class="fp-sub" style="margin-top:2px">From the drawing to a deal someone can fund: each step is the editor’s own, in order, on the model as it stands.</div></div>'
      + '<button type="button" aria-label="Close" onclick="OmegaFinancePath.close()" style="background:none;border:none;color:var(--sub);font-size:22px;cursor:pointer;line-height:1">×</button></div>'
      + '<div class="fp-body" id="fp-body"><div class="fp-top fp-' + top.tone + '" role="status">' + esc(top.text) + '</div><ol>'
      + list.map(function (x, i) {
        var act = '';
        if (x.locked) act = '<span class="fp-lock">Not on this workspace’s plan</span>';
        else if (x.action) act = '<button type="button" class="fp-btn' + (x.status === 'go' || x.status === 'todo' ? ' fp-go' : '') + '" data-act="' + esc(x.action) + '"' + (x.disabled ? ' disabled' : '') + '>' + esc(LABEL[x.action] || x.action) + '</button>';
        return '<li data-step="' + esc(x.key) + '" data-status="' + esc(x.status) + '"><span class="fp-n">' + (x.status === 'done' ? '✓' : i + 1) + '</span>'
          + '<div class="fp-main"><div class="fp-label">' + esc(x.label) + '</div><div class="fp-sub">' + esc(x.text) + '</div></div><div class="fp-act">' + act + '</div></li>';
      }).join('') + '</ol></div></div>';
    var b = el('fp-body'); if (b) b.scrollTop = scroll;
  }

  /* what each button does: the editor's own command */
  function run(action) {
    /* the panel's own order holds for a caller too: a hand-off waits on a saved, priced drawing */
    var step = steps(gather()).filter(function (x) { return x.action === action; })[0];
    if (step && (step.disabled || step.locked)) { render(); return; }
    if (action === 'save') { if (typeof root.saveProject === 'function') try { root.saveProject(); } catch (e) {} render(); return; }
    if (action === 'run') { if (typeof root.omegaRunDesign === 'function') try { root.omegaRunDesign(); } catch (e) {} render(); return; }
    if (action === 'rail') {
      close();
      var rr = el('rr');
      if (rr && rr.classList.contains('rr-collapsed') && typeof root.omegaRailToggle === 'function') root.omegaRailToggle();
      var g = el('rr-g-fin');
      if (g && g.classList.contains('rr-shut') && typeof root.omegaGrpToggle === 'function') root.omegaGrpToggle('rr-g-fin');
      if (g && g.scrollIntoView) try { g.scrollIntoView({ block: 'nearest' }); } catch (e) {}
      return;
    }
    if (action === 'whatChanged') { close(); if (root.OmegaPlanRead && typeof root.OmegaPlanRead.whatChanged === 'function') root.OmegaPlanRead.whatChanged(); return; }
    var find = COMMAND[action], btn = find && find();
    if (!btn || !allowed(btn)) { render(); return; }
    close();
    btn.click();
  }

  function onKey(e) { if (e.key === 'Escape' && el(HOST) && !doc.getElementById('pr-zoom')) close(); }
  function open() {
    var h = el(HOST);
    if (!h) {
      h = doc.createElement('div'); h.id = HOST;
      h.setAttribute('role', 'dialog'); h.setAttribute('aria-modal', 'true'); h.setAttribute('aria-label', 'Finance it');
      var down = false;
      h.onmousedown = function (e) { down = e.target === h; };
      h.onclick = function (e) {
        if (e.target === h && down) { close(); return; }
        var t = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
        if (t && !t.disabled) run(t.getAttribute('data-act'));
      };
      doc.body.appendChild(h);
      doc.addEventListener('keydown', onKey);
    }
    sig = '';
    render();
    clearInterval(timer);
    timer = setInterval(render, 700);   /* the Run, a save, a qualification: the steps follow */
    /* the comparison with the plans, asked each time the panel opens (pure,
       cheap): the drawing may have changed since */
    var S = S_() || {};
    if (S.planRead && S.planRead.id && root.OmegaPlanRead && typeof root.OmegaPlanRead.changes === 'function') {
      root.OmegaPlanRead.changes().then(function () { sig = ''; render(); }, function () {});
    }
  }
  function close() {
    clearInterval(timer); timer = null;
    var h = el(HOST); if (h) h.remove();
    doc.removeEventListener('keydown', onKey);
  }

  root.OmegaFinancePath = { open: open, close: close, steps: steps, headline: headline, run: run,
    /* for the render check: the state the panel reads */
    _gather: gather };
})(typeof window !== 'undefined' ? window : this);
