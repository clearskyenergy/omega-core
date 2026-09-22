/* ═══════════════════════════════════════════════════════════════════════════
   portals/customer/portfolio.js — "Size a system → Portfolio upload"
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   The companion to portals/customer/index.html: the four-step portfolio
   workflow (upload → validate and match → run analysis → review and
   export), rendered inside the portal's Size a system view. ES5, no build
   step. It renders what /api/customer-portfolio returns and never computes
   a size, a score or a total itself. Files are read in the browser only to
   be sent (base64) to the API; nothing is parsed client-side.

   window.OmegaPortfolio.mount(root, { org, api, esc })
     api(path, init) → Promise<{ ok, status, j }>  — the portal's own signed fetch
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  var STEPS = [['upload', '1 · Upload portfolio'], ['match', '2 · Validate & match files'], ['run', '3 · Run portfolio analysis'], ['review', '4 · Review & export results']];
  var DISP = { pass: 'go', conditional: 'wait', info: 'wait', hold: 'stop', no: 'stop' };
  var MAX_REQUEST = 4 * 1024 * 1024;

  function mount(root, o) {
    var api = o.api, ORG = o.org, esc = o.esc || function (v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    var q = '?org=' + encodeURIComponent(ORG), state = { step: 'upload', list: null, pid: null, data: null, site: null, filter: { q: '', disp: '', sizing: '' }, running: false, progress: null };
    function $(id) { return root.querySelector('#' + id); }
    function status(t, bad) { var el = $('pf-status'); if (el) { el.textContent = t || ''; el.className = 'muted' + (bad ? ' err' : ''); } }
    function n(v, d) { return v == null ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: d || 0 }); }
    function money(v) { return v == null ? '—' : '$' + Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 }); }
    function pill(cls, text) { return '<span class="pill ' + cls + '">' + esc(text) + '</span>'; }
    function readFiles(input) {
      var files = Array.prototype.slice.call(input.files || []), total = 0;
      files.forEach(function (f) { total += f.size; });
      if (!files.length) return Promise.reject(new Error('Choose at least one file.'));
      if (total > MAX_REQUEST * 0.74) return Promise.reject(new Error('This selection is over 3 MB. Upload the site list first, then add documents in smaller batches.'));
      return Promise.all(files.map(function (f) { return new Promise(function (resolve, reject) { var r = new FileReader(); r.onload = function () { resolve({ name: f.name, base64: String(r.result).split(',')[1] || '' }); }; r.onerror = function () { reject(new Error('Could not read ' + f.name)); }; r.readAsDataURL(f); }); }));
    }
    function post(body) { return api('/api/customer-portfolio', { method: 'POST', body: JSON.stringify(Object.assign({ org: ORG }, body)) }).then(function (r) { if (!r.ok) throw new Error(r.j.error || 'Request failed'); return r.j; }); }
    function get(extra) { return api('/api/customer-portfolio' + q + extra).then(function (r) { if (!r.ok) throw new Error(r.j.error || 'Request failed'); return r.j; }); }
    /* Authenticated download: fetch with the token, then hand the bytes to the browser. */
    function fetchBlob(extra, name) {
      return o.tok().then(function (t) { return fetch('/api/customer-portfolio' + q + extra, { headers: { Authorization: 'Bearer ' + t } }); }).then(function (r) { if (!r.ok) return r.json().then(function (j) { throw new Error(j.error || 'Download failed'); }); return r.blob(); }).then(function (blob) { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000); });
    }
    function openHtml(extra) {
      return o.tok().then(function (t) { return fetch('/api/customer-portfolio' + q + extra, { headers: { Authorization: 'Bearer ' + t } }); }).then(function (r) { return r.text(); }).then(function (html) { var w = window.open('', '_blank'); if (w) { w.document.open(); w.document.write(html); w.document.close(); } });
    }

    function shell() {
      root.innerHTML = '<div class="pf-steps">' + STEPS.map(function (s) { var on = state.step === s[0]; return '<button type="button" class="pf-step' + (on ? ' on' : '') + '" data-step="' + s[0] + '"' + (s[0] !== 'upload' && !state.pid ? ' disabled' : '') + '>' + esc(s[1]) + '</button>'; }).join('') + '</div><p id="pf-status" class="muted"></p><div id="pf-body"></div>';
      Array.prototype.forEach.call(root.querySelectorAll('[data-step]'), function (b) { b.onclick = function () { if (b.disabled) return; state.step = b.getAttribute('data-step'); draw(); }; });
    }
    function draw() { shell(); ({ upload: drawUpload, match: drawMatch, run: drawRun, review: drawReview })[state.step](); }

    /* ── 1 · Upload ─────────────────────────────────────────────────────── */
    function drawUpload() {
      var b = $('pf-body');
      b.innerHTML = '<div class="ord"><h3>Upload a portfolio</h3><p class="muted">A ZIP package, or a CSV / XLSX site list. A ZIP may hold the site list, utility bills (PDF, PNG, JPEG), interval or 8760 CSV files, site plans, one-lines and equipment schedules — organised in folders named by Site ID if you can. Files are matched to sites by Site ID first, then by address; anything unclear waits for your review. Up to 3 MB per upload; add more files afterwards.</p>'
        + '<div class="row2"><div><label for="pf-name">Portfolio name</label><input id="pf-name" placeholder="e.g. Midwest cold-storage portfolio"></div><div><label for="pf-files">Files</label><input id="pf-files" type="file" multiple accept=".zip,.csv,.xlsx,.pdf,.png,.jpg,.jpeg,.txt"></div></div>'
        + '<div class="actions"><button type="button" class="btn p" id="pf-create">Upload and validate</button><button type="button" class="btn" id="pf-tpl-csv">Template (CSV)</button><button type="button" class="btn" id="pf-tpl-xlsx">Template (XLSX)</button></div>'
        + '<p class="muted" style="font-size:13px">Minimum columns: Site ID, Site name, Street address, City, State, ZIP code. Optional: customer, utility, meter, objective, tariff ($/kW-month, $/kWh), Jan–Dec kW and kWh, interval file name, service voltage and phase, main service amps, transformer kVA, existing generation, solar, planned EV load, export limit, desired duration, backup load and hours, interconnection limit, hosting capacity, installation area, budget.</p></div>'
        + '<div class="ord"><h3>Your portfolios</h3><div id="pf-list"><p class="muted">Loading…</p></div></div>';
      $('pf-tpl-csv').onclick = function () { fetchBlob('&template=csv', 'portfolio-upload-template.csv')['catch'](function (e) { status(e.message, true); }); };
      $('pf-tpl-xlsx').onclick = function () { fetchBlob('&template=xlsx', 'portfolio-upload-template.xlsx')['catch'](function (e) { status(e.message, true); }); };
      $('pf-create').onclick = function () {
        var btn = this; btn.disabled = true; status('Reading files…');
        readFiles($('pf-files')).then(function (files) { status('Uploading and validating…'); return post({ action: 'create', name: $('pf-name').value, files: files }); }).then(function (r) { state.pid = r.portfolioId; status(r.note || (r.duplicate ? 'This package was already uploaded; opened.' : 'Uploaded.')); return open(r.portfolioId, 'match'); })['catch'](function (e) { status(e.message, true); }).then(function () { btn.disabled = false; });
      };
      get('').then(function (d) { state.list = d.portfolios; var el = $('pf-list'); if (!el) return; el.innerHTML = d.portfolios.length ? d.portfolios.map(function (p) { var s = p.summary || {}; return '<button type="button" class="pf-row" data-open="' + esc(p.id) + '"><b>' + esc(p.name) + '</b> ' + pill(p.status === 'report_ready' ? 'go' : 'wait', String(p.status).replace(/_/g, ' ')) + '<br><span class="muted">' + p.siteCount + ' sites' + (s.line ? ' · ' + esc(s.line) : '') + ' · ' + esc(new Date(p.updatedAt).toLocaleDateString()) + '</span></button>'; }).join('') : '<p class="muted">No portfolios yet.</p>'; Array.prototype.forEach.call(el.querySelectorAll('[data-open]'), function (x) { x.onclick = function () { open(x.getAttribute('data-open'), null); }; }); })['catch'](function (e) { status(e.message, true); });
    }
    function open(pid, step) {
      state.pid = pid; status('Loading portfolio…');
      return get('&portfolio=' + encodeURIComponent(pid)).then(function (d) { state.data = d; state.step = step || (d.portfolio.status === 'report_ready' ? 'review' : (d.remaining && d.portfolio.status === 'analyzing') ? 'run' : 'match'); status(''); draw(); })['catch'](function (e) { status(e.message, true); });
    }

    /* ── 2 · Validate & match ───────────────────────────────────────────── */
    function drawMatch() {
      var d = state.data, b = $('pf-body'); if (!d) { b.innerHTML = '<p class="muted">Upload a portfolio first.</p>'; return; }
      var siteOpts = '<option value="">— choose a site —</option>' + d.sites.map(function (s) { return '<option value="' + esc(s.siteId) + '">' + esc(s.siteId) + ' · ' + esc(s.name) + '</option>'; }).join('');
      b.innerHTML = '<div class="ord"><div class="hd"><b>' + esc(d.portfolio.name) + '</b>' + pill('wait', String(d.portfolio.status).replace(/_/g, ' ')) + '<span class="sp"></span><span class="muted">' + d.sites.length + ' sites · ' + d.files.length + ' files</span></div>'
        + (d.portfolio.problems.length ? '<h4>Problems in the upload</h4><ul class="muted">' + d.portfolio.problems.slice(0, 30).map(function (p) { return '<li>' + esc(p.file || '') + (p.row ? ' row ' + p.row : '') + ': ' + esc(p.error) + '</li>'; }).join('') + '</ul>' : '<p class="muted">No problems in the site list.</p>')
        + '<h4>Documents needing review · ' + d.reviewQueue.length + '</h4>' + (d.reviewQueue.length ? '<table class="pf-table"><thead><tr><th>File</th><th>Type</th><th>Suggested</th><th>Assign to</th></tr></thead><tbody>' + d.reviewQueue.map(function (f) { return '<tr><td>' + esc(f.name) + '</td><td>' + esc(f.type) + '</td><td>' + (f.candidates.length ? esc(f.candidates.join(', ')) : '<span class="muted">no match</span>') + '</td><td><select data-assign="' + esc(f.id) + '">' + siteOpts + '</select></td></tr>'; }).join('') + '</tbody></table>' : '<p class="muted">Every document matched one site, or there are no documents.</p>')
        + '<h4>Matched files</h4><table class="pf-table"><thead><tr><th>File</th><th>Type</th><th>Site</th><th>Matched by</th></tr></thead><tbody>' + d.files.filter(function (f) { return f.siteId; }).map(function (f) { return '<tr><td>' + esc(f.name) + '</td><td>' + esc(f.type) + (f.interval ? ' · ' + f.interval.readings + ' readings' + (f.interval.completeYear ? ', full year' : ', ' + f.interval.days + ' days') : '') + '</td><td>' + esc(f.siteId) + '</td><td>' + esc(f.matchedBy) + ' <button type="button" class="btn" style="padding:2px 8px;font-size:12px" data-unassign="' + esc(f.id) + '">Unassign</button></td></tr>'; }).join('') + '</tbody></table>'
        + '<h4>Sites · ' + d.sites.length + '</h4><table class="pf-table"><thead><tr><th>Site</th><th>Address</th><th>Documents</th><th>Data</th><th>Warnings</th></tr></thead><tbody>' + d.sites.map(function (s) { return '<tr><td><b>' + esc(s.siteId) + '</b><br><span class="muted">' + esc(s.name) + '</span></td><td>' + esc(s.addressLine) + '</td><td>' + s.documents + '</td><td>' + (s.quality ? esc(s.quality.levelLabel) + ' · ' + s.quality.completeness : '<span class="muted">not validated yet</span>') + '</td><td class="muted">' + esc((s.warnings || []).join('; ')) + '</td></tr>'; }).join('') + '</tbody></table>'
        + '<div class="actions"><label class="btn" for="pf-more" style="cursor:pointer">Add more files</label><input id="pf-more" type="file" multiple hidden accept=".zip,.csv,.xlsx,.pdf,.png,.jpg,.jpeg,.txt"><button type="button" class="btn p" id="pf-go">Continue to analysis →</button></div></div>';
      Array.prototype.forEach.call(b.querySelectorAll('[data-assign]'), function (sel) { sel.onchange = function () { if (!sel.value) return; status('Assigning…'); post({ action: 'assign', portfolioId: state.pid, fileId: sel.getAttribute('data-assign'), siteId: sel.value }).then(function () { return open(state.pid, 'match'); })['catch'](function (e) { status(e.message, true); }); }; });
      Array.prototype.forEach.call(b.querySelectorAll('[data-unassign]'), function (x) { x.onclick = function () { status('Unassigning…'); post({ action: 'assign', portfolioId: state.pid, fileId: x.getAttribute('data-unassign'), siteId: null }).then(function () { return open(state.pid, 'match'); })['catch'](function (e) { status(e.message, true); }); }; });
      $('pf-more').onchange = function () { status('Uploading…'); readFiles($('pf-more')).then(function (files) { return post({ action: 'upload', portfolioId: state.pid, files: files }); }).then(function (r) { status(r.note || 'Uploaded.'); return open(state.pid, 'match'); })['catch'](function (e) { status(e.message, true); }); };
      $('pf-go').onclick = function () { state.step = 'run'; draw(); };
    }

    /* ── 3 · Run ────────────────────────────────────────────────────────── */
    function drawRun() {
      var d = state.data, b = $('pf-body'); if (!d) { b.innerHTML = '<p class="muted">Upload a portfolio first.</p>'; return; }
      var total = d.sites.length, remaining = d.remaining;
      b.innerHTML = '<div class="ord"><h3>Run portfolio analysis</h3><p class="muted">Each site is validated, screened and sized on its own with the supplier\'s sizing engine, in batches, so one incomplete site never stops the rest. You can leave this page and come back; progress is saved per site.</p>'
        + '<div class="pf-bar"><i id="pf-fill" style="width:' + (total ? Math.round((total - remaining) / total * 100) : 0) + '%"></i></div><p id="pf-prog" class="muted">' + (total - remaining) + ' of ' + total + ' sites processed' + (remaining ? ' · ' + remaining + ' remaining' : ' · complete') + '</p>'
        + '<div class="actions"><button type="button" class="btn p" id="pf-run"' + (remaining ? '' : ' disabled') + '>' + (remaining ? 'Run analysis' : 'Analysis complete') + '</button><button type="button" class="btn" id="pf-rerun-all">Rerun every site</button><button type="button" class="btn" id="pf-results"' + (d.summary.processed ? '' : ' disabled') + '>Review results →</button></div>'
        + '<div id="pf-log" class="muted" style="font-size:13px;max-height:260px;overflow:auto"></div></div>';
      $('pf-run').onclick = function () { runAll(); };
      $('pf-rerun-all').onclick = function () { status('Queueing every site…'); post({ action: 'rerun', portfolioId: state.pid }).then(function () { return open(state.pid, 'run'); })['catch'](function (e) { status(e.message, true); }); };
      $('pf-results').onclick = function () { open(state.pid, 'review'); };
    }
    function runAll() {
      if (state.running) return; state.running = true; var btn = $('pf-run'); if (btn) btn.disabled = true; status('Analysing…');
      function step() {
        return post({ action: 'analyze', portfolioId: state.pid, batch: 6 }).then(function (r) {
          var fill = $('pf-fill'), prog = $('pf-prog'), log = $('pf-log');
          if (fill) fill.style.width = (r.total ? Math.round((r.total - r.remaining) / r.total * 100) : 0) + '%';
          if (prog) prog.textContent = (r.total - r.remaining) + ' of ' + r.total + ' sites processed' + (r.remaining ? ' · ' + r.remaining + ' remaining' : ' · complete');
          if (log) log.innerHTML += r.processed.map(function (p) { return '<div>' + esc(p.siteId) + ' → ' + esc(p.sizing || p.status) + (p.screening ? ' · ' + esc(p.screening) : '') + (p.error ? ' · <span class="err">' + esc(p.error) + '</span>' : '') + '</div>'; }).join('');
          if (r.remaining > 0 && r.processed.length) return step();
          status(r.summary.line); state.running = false;
          return open(state.pid, 'review');
        });
      }
      step()['catch'](function (e) { status(e.message, true); state.running = false; if (btn) btn.disabled = false; });
    }

    /* ── 4 · Review & export ────────────────────────────────────────────── */
    function drawReview() {
      var d = state.data, b = $('pf-body'); if (!d) { b.innerHTML = '<p class="muted">Upload a portfolio first.</p>'; return; }
      var s = d.summary, f = state.filter;
      var rows = d.sites.filter(function (x) { if (f.disp && (!x.screening || x.screening.disposition !== f.disp)) return false; if (f.sizing && (!x.sizing || x.sizing.status !== f.sizing)) return false; var qq = f.q.toLowerCase(); return !qq || [x.siteId, x.name, x.addressLine, x.utility, x.screening && x.screening.label, x.sizing && x.sizing.statusLabel, x.screening && x.screening.blocker].join(' ').toLowerCase().indexOf(qq) >= 0; });
      b.innerHTML = '<div class="ord"><div class="hd"><b>' + esc(d.portfolio.name) + '</b>' + pill(d.portfolio.status === 'report_ready' ? 'go' : 'wait', String(d.portfolio.status).replace(/_/g, ' ')) + '<span class="sp"></span><span class="muted">' + esc(s.line) + '</span></div>'
        + '<div class="kv"><div><small>Sites uploaded</small><b>' + s.sites + '</b></div><div><small>Processed</small><b>' + s.processed + '</b></div><div><small>Detailed sizes</small><b>' + s.detailed + '</b></div><div><small>Preliminary sizes</small><b>' + s.preliminary + '</b></div><div><small>Screening estimates</small><b>' + s.screening + '</b></div><div><small>Need information</small><b>' + s.needsInfo + '</b></div><div><small>On hold</small><b>' + s.hold + '</b></div><div><small>Not viable</small><b>' + s.notViable + '</b></div>'
        + '<div><small>Recommended MW · ' + s.sitesInTotal + ' sites</small><b>' + n(s.totalMw, 2) + '</b></div><div><small>Recommended MWh</small><b>' + n(s.totalMwh, 2) + '</b></div><div><small>Est. CAPEX · ' + s.capexSites + ' sites</small><b>' + (s.capex != null ? money(s.capex) : 'n/a') + '</b></div><div><small>Est. savings/yr · ' + s.savingsSites + ' sites</small><b>' + (s.savingsYr != null ? money(s.savingsYr) : 'n/a') + '</b></div></div>'
        + '<p class="muted" style="font-size:13px">Totals sum detailed and preliminary sizes only; screening ranges (' + n(s.rangeKwLow) + '–' + n(s.rangeKwHigh) + ' kW across ' + s.screening + ' sites) are never added. Incentives: ' + esc(s.incentivesNote) + '. "Pass" is preliminary platform screening, not utility approval, a permit, final engineering or interconnection approval.</p>'
        + '<div class="actions"><button type="button" class="btn p" id="pf-exec">Executive report</button><button type="button" class="btn" id="pf-csv">Export CSV</button><button type="button" class="btn" id="pf-back-run">Analysis</button></div></div>'
        + '<div class="ord"><div class="row2"><div><input id="pf-q" type="search" placeholder="Search site, address, utility, blocker" value="' + esc(f.q) + '"></div><div style="display:flex;gap:8px"><select id="pf-disp"><option value="">All dispositions</option><option value="pass">Pass</option><option value="conditional">Conditional</option><option value="info">Needs Information</option><option value="hold">Hold — Grid Constraint</option><option value="no">Not Viable</option></select><select id="pf-sizing"><option value="">All sizing</option><option value="detailed">Detailed</option><option value="preliminary">Preliminary</option><option value="screening">Screening estimate</option><option value="unable">Unable to size</option></select></div></div>'
        + '<div class="pf-scroll"><table class="pf-table"><thead><tr><th>Site</th><th>Address</th><th>Utility</th><th>Screening</th><th>Sizing</th><th>kW</th><th>kWh</th><th>h</th><th>Data</th><th>Conf.</th><th>Blocker</th><th>Next action</th><th>Processed</th></tr></thead><tbody>'
        + rows.map(function (x) { var z = x.sizing || {}, sc = x.screening || {}; return '<tr data-site="' + esc(x.siteId) + '"><td><b>' + esc(x.siteId) + '</b><br><span class="muted">' + esc(x.name) + '</span></td><td>' + esc(x.addressLine) + '</td><td>' + esc(x.utility || '—') + '</td><td>' + (sc.label ? pill(DISP[sc.disposition] || 'wait', sc.label) : '—') + '</td><td>' + esc(z.statusLabel || (x.status === 'failed' ? 'Failed' : '—')) + '</td><td>' + (z.status === 'screening' && z.range ? n(z.range.kwLow) + '–' + n(z.range.kwHigh) : n(z.kw)) + '</td><td>' + (z.status === 'screening' && z.range ? n(z.range.kwhLow) + '–' + n(z.range.kwhHigh) : n(z.kwh)) + '</td><td>' + (z.durationH ? n(z.durationH, 1) : '—') + '</td><td>' + (x.quality ? x.quality.completeness : '—') + '</td><td>' + (z.confidence ? z.confidence.score : '—') + '</td><td class="muted">' + esc(sc.blocker || x.error || '') + '</td><td class="muted">' + esc(x.nextAction || '') + '</td><td class="muted">' + esc(x.processedAt ? String(x.processedAt).slice(0, 10) : '') + '</td></tr>'; }).join('')
        + '</tbody></table></div><p class="muted">' + rows.length + ' of ' + d.sites.length + ' sites · click a row to open the site</p></div><div id="pf-site"></div>';
      $('pf-q').oninput = function () { f.q = this.value; drawReview(); if ($('pf-q')) { $('pf-q').focus(); $('pf-q').setSelectionRange(f.q.length, f.q.length); } };
      $('pf-disp').value = f.disp; $('pf-disp').onchange = function () { f.disp = this.value; drawReview(); };
      $('pf-sizing').value = f.sizing; $('pf-sizing').onchange = function () { f.sizing = this.value; drawReview(); };
      $('pf-exec').onclick = function () { openHtml('&portfolio=' + encodeURIComponent(state.pid) + '&report=executive')['catch'](function (e) { status(e.message, true); }); };
      $('pf-csv').onclick = function () { fetchBlob('&portfolio=' + encodeURIComponent(state.pid) + '&export=csv', 'portfolio-results.csv')['catch'](function (e) { status(e.message, true); }); };
      $('pf-back-run').onclick = function () { state.step = 'run'; draw(); };
      Array.prototype.forEach.call(b.querySelectorAll('tr[data-site]'), function (tr) { tr.onclick = function () { openSite(tr.getAttribute('data-site')); }; });
      if (state.site) openSite(state.site);
    }
    function openSite(siteId) {
      state.site = siteId; var el = $('pf-site'); if (!el) return; el.innerHTML = '<div class="ord"><p class="muted">Loading ' + esc(siteId) + '…</p></div>';
      get('&portfolio=' + encodeURIComponent(state.pid) + '&site=' + encodeURIComponent(siteId)).then(function (r) {
        var s = r.site, z = s.sizing || {}, sc = s.screening || {}, qy = s.quality || {}, fin = s.financial || {}, list = function (items) { return items && items.length ? '<ul>' + items.map(function (i) { return '<li>' + esc(typeof i === 'string' ? i : i.label) + '</li>'; }).join('') + '</ul>' : '<p class="muted">None.</p>'; };
        var canProject = z.status === 'detailed' || z.status === 'preliminary';
        el.innerHTML = '<div class="ord" id="pf-site-card"><div class="hd"><span class="no">' + esc(s.siteId) + '</span><b>' + esc(s.name) + '</b><span class="sp"></span>' + (sc.label ? pill(DISP[sc.disposition] || 'wait', sc.label) : '') + ' ' + (z.statusLabel ? pill(z.status === 'detailed' ? 'go' : 'wait', z.statusLabel) : '') + ' <button type="button" class="btn" id="pf-close" style="padding:4px 10px">Close</button></div><p class="muted">' + esc(s.addressLine) + (sc.caveat ? ' · ' + esc(sc.caveat) : '') + '</p>'
          + '<div class="kv"><div><small>Recommended power</small><b>' + (z.status === 'screening' && z.range ? n(z.range.kwLow) + '–' + n(z.range.kwHigh) : n(z.kw)) + ' kW</b></div><div><small>Nameplate energy</small><b>' + (z.status === 'screening' && z.range ? n(z.range.kwhLow) + '–' + n(z.range.kwhHigh) : n(z.kwh)) + ' kWh</b></div><div><small>Usable · duration</small><b>' + n(z.usableKwh) + ' kWh · ' + (z.durationH ? n(z.durationH, 1) : '—') + ' h</b></div><div><small>PCS / inverter</small><b>' + n(z.pcsKw) + ' kW</b></div><div><small>Est. peak reduction</small><b>' + n(z.peakReductionKw) + ' kW</b></div><div><small>Confidence · data</small><b>' + (z.confidence ? z.confidence.score + ' · ' + esc(z.confidence.label) : '—') + ' · ' + (qy.completeness != null ? qy.completeness : '—') + '</b></div></div>'
          + (z.range ? '<p class="muted">' + esc(z.range.note) + '</p>' : '') + (z.reason ? '<p class="muted">' + esc(z.reason) + '</p>' : '')
          + '<h4>Recommended equipment</h4>' + (z.config ? '<p>' + z.config.qty + ' × ' + esc(z.config.name) + ' (' + esc(z.config.sku) + ') = ' + n(z.config.totalKw) + ' kW / ' + n(z.config.totalKwh) + ' kWh' + (z.config.integrates && z.config.integrates.pcs ? ' · PCS integrated' : ' · PCS separate') + (z.fit ? ' · fit: ' + (z.fit.fits ? 'fits' : 'does not fit') + ' (' + n(z.fit.neededSqft) + ' of ' + n(z.fit.availableSqft) + ' sq ft)' : '') + '</p>' + (z.config.alternatives && z.config.alternatives.length ? '<p class="muted">Also: ' + z.config.alternatives.map(function (a) { return a.qty + ' × ' + esc(a.name); }).join('; ') + '</p>' : '') : '<p class="muted">' + (z.kw ? 'No catalog product covers this size within 6 units.' : 'No size yet.') + '</p>')
          + (z.constraints ? '<p><b>Electrical:</b> ' + (z.constraints.cappedBy.length ? 'capped by ' + esc(z.constraints.cappedBy.join(', ')) + ' (uncapped need ' + n(z.constraints.uncappedKw) + ' kW)' : (z.constraints.verification ? esc(z.constraints.verification) : 'within the supplied limits')) + '</p>' : '')
          + '<h4>Use case</h4><p>' + esc(z.useCase || (s.fields && s.fields.objective ? s.fields.objective.value : '—')) + '</p>'
          + '<h4>Alternatives</h4>' + (z.alternatives && z.alternatives.length ? '<ul>' + z.alternatives.map(function (a) { return '<li>' + esc(a.label) + ': ' + n(a.kw) + ' kW / ' + n(a.kwh) + ' kWh</li>'; }).join('') + '</ul>' : '<p class="muted">None.</p>')
          + '<h4>Assumptions</h4>' + list(z.assumptions) + '<h4>Information still required</h4>' + list((z.required || []).concat((qy.missing || []).map(function (m) { return m.label; }), (qy.improve || []).map(function (m) { return m.label; })))
          + '<h4>Screening</h4>' + list(sc.reasons) + (sc.factors ? '<table class="pf-table"><tbody>' + Object.keys(sc.factors).map(function (k) { var v = sc.factors[k]; return '<tr><td>' + esc(k) + '</td><td>' + (v.ok === true ? '✓' : v.ok === false ? '✗' : '·') + '</td><td class="muted">' + esc(v.note || (v.score != null ? 'confidence ' + v.score + ' · completeness ' + v.completeness : '')) + '</td></tr>'; }).join('') + '</tbody></table>' : '')
          + '<h4>Financial</h4>' + (fin.status && fin.status !== 'unavailable' ? '<div class="kv"><div><small>Savings / yr (' + esc(fin.status) + ')</small><b>' + money(fin.savingsYr) + '</b></div><div><small>CAPEX (' + esc(fin.capexBasis) + ')</small><b>' + money(fin.capex) + '</b></div><div><small>Simple payback</small><b>' + (fin.paybackYr != null ? fin.paybackYr + ' yr' : '—') + '</b></div></div>' + list(fin.assumptions) : '<p class="muted">Unavailable: ' + esc(fin.reason || 'no size') + '</p>') + '<p class="muted">Still required: ' + esc((fin.required || []).join('; ')) + '</p>'
          + '<h4>Imported data</h4><table class="pf-table"><tbody>' + Object.keys(s.fields || {}).map(function (k) { var v = s.fields[k]; return '<tr><td>' + esc(k) + '</td><td>' + esc(v.value) + (v.units ? ' ' + esc(v.units) : '') + '</td><td class="muted">' + esc(v.kind) + ' · ' + esc(v.confidence) + ' · ' + esc(v.source && v.source.file ? v.source.file + (v.source.row ? ' row ' + v.source.row : '') : '') + '</td></tr>'; }).join('') + (s.months && s.months.length ? '<tr><td>billed months</td><td>' + s.months.length + '</td><td class="muted">' + esc(s.months[0].source ? s.months[0].source.file : '') + '</td></tr>' : '') + '</tbody></table>'
          + '<h4>Documents</h4>' + ((s.documents || []).length ? '<ul>' + s.documents.map(function (dd) { return '<li>' + esc(dd.name) + ' · ' + esc(dd.type) + (dd.interval ? ' · ' + dd.interval.readings + ' readings' : '') + ' · ' + esc(dd.matchedBy || '') + '</li>'; }).join('') + '</ul>' : '<p class="muted">None matched. Bills are stored for the record; their figures are not extracted automatically yet.</p>')
          + '<h4>Provide missing information</h4><p class="muted">Add an interval / 8760 CSV, bills or a corrected site list for this site only; it is reprocessed on its own.</p><input id="pf-site-files" type="file" multiple accept=".csv,.xlsx,.pdf,.png,.jpg,.jpeg,.txt">'
          + '<div class="actions"><button type="button" class="btn p" id="pf-site-upload">Upload for this site</button><button type="button" class="btn" id="pf-site-rerun">Rerun analysis</button><button type="button" class="btn" id="pf-site-report">Site report</button>' + (canProject ? '<button type="button" class="btn" id="pf-site-project">' + (s.projectId ? 'Open in Design Studio' : 'Add to projects') + '</button>' : '') + '</div>'
          + '<h4>Processing history</h4>' + ((s.history || []).length ? '<ul class="muted" style="font-size:13px">' + s.history.slice(-12).map(function (h) { return '<li>' + esc(h.at) + ' · ' + esc(h.what) + '</li>'; }).join('') + '</ul>' : '') + '</div>';
        $('pf-close').onclick = function () { state.site = null; el.innerHTML = ''; };
        $('pf-site-upload').onclick = function () { var btn = this; btn.disabled = true; status('Uploading for ' + siteId + '…'); readFiles($('pf-site-files')).then(function (files) { return post({ action: 'upload', portfolioId: state.pid, siteId: siteId, files: files }); }).then(function (r) { status(r.note); return open(state.pid, 'review'); })['catch'](function (e) { status(e.message, true); }).then(function () { btn.disabled = false; }); };
        $('pf-site-rerun').onclick = function () { status('Rerunning ' + siteId + '…'); post({ action: 'rerun', portfolioId: state.pid, siteId: siteId }).then(function () { status('Reprocessed.'); return open(state.pid, 'review'); })['catch'](function (e) { status(e.message, true); }); };
        $('pf-site-report').onclick = function () { openHtml('&portfolio=' + encodeURIComponent(state.pid) + '&report=site&site=' + encodeURIComponent(siteId))['catch'](function (e) { status(e.message, true); }); };
        if ($('pf-site-project')) $('pf-site-project').onclick = function () { if (s.projectId && r.designLink) { location.href = r.designLink; return; } status('Adding to projects…'); post({ action: 'add-to-projects', portfolioId: state.pid, siteId: siteId }).then(function (a) { status(a.duplicate ? 'Already in your projects.' : 'Added to your projects.'); location.href = a.designLink; })['catch'](function (e) { status(e.message, true); }); };
        el.scrollIntoView({ block: 'start', behavior: 'smooth' });
      })['catch'](function (e) { el.innerHTML = '<div class="ord"><p class="err">' + esc(e.message) + '</p></div>'; });
    }

    draw();
    return { open: open, refresh: function () { if (state.pid) open(state.pid, state.step); else draw(); } };
  }
  window.OmegaPortfolio = { mount: mount };
})();
