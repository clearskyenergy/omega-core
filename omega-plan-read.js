/* omega-plan-read.js — Read a customer's plan set into Site Map.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Build › 1 · Site › Read Plans (2026-10-16, Tommy: "let's build it";
   docs/BLUEPRINT-TO-BUILD.md, Phase 1). The person drops the customer's PDF
   (or a photo of a sheet). Each sheet is rendered here with pdf.js, its text
   layer pulled, and sent on its own to POST /api/plan-read, which reads it
   and answers with the equipment and the project facts printed on it, each
   with the words it was read from and where on the sheet they are. The
   sheets are then checked together on the server (the same unit on the site
   plan and the single-line is one unit; two sheets that disagree are shown).

   The person sees every read beside a crop of the sheet it came from, ticks
   what is right, and Place puts the ticked equipment on the drawing through
   the editor's own tools (addEl as Insert does; a charger as the EV tools'
   own Level 2 or DC fast shape), so the Run counts and prices them like
   anything placed by hand, as ONE undo
   step, in a row at the centre of the view to be dragged into place. Solar
   arrays, runs and trenches are listed with their figures, not drawn: the
   Run prices an array from its traced geometry. Trace over a sheet puts a
   sheet on the canvas as the backdrop (the Site Overlay's own upload).

   The BROWSER only collects and shows. What a thing on a sheet is, how it
   is placed, the prompt, the schema and the checks are api/_lib/plan-read.js
   (CLAUDE.md, IP protection). Nothing here writes to Firestore; what was
   read rides on the project as S.planRead through saveProject.

   ES5 on purpose (CLAUDE.md): var, function, promises. Every editor global
   it touches is behind a guard. */
(function (root) {
  'use strict';
  var API = '/api/plan-read';
  var HOST_ID = 'plan-read-modal';
  var PDFJS_SRC = root.PDFJS_SRC || 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  var PDFJS_WORKER = root.PDFJS_WORKER || 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  var MAX_PAGES = 40, LONG_EDGE = 2400, MAX_JPEG = 3400000, THUMB_W = 150, PER_ITEM = 40, PER_PLACE = 150;

  /* the session's read: kept while the editor is open, so closing the
     dialog and opening it again comes back to the review */
  var st = null;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function $(id) { return document.getElementById(id); }
  function S_() { return root.S || null; }
  function fmt(n) { if (n == null || !isFinite(n)) return ''; var r = Math.abs(n) >= 100 ? Math.round(n) : Math.round(n * 10) / 10; return r.toLocaleString('en-US'); }

  function token() {
    var u = root._currentUser || (root.firebase && root.firebase.auth && root.firebase.auth().currentUser);
    return u ? u.getIdToken() : Promise.reject(new Error('Sign in to read a plan set.'));
  }
  function post(body) {
    return token().then(function (tok) {
      return fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: JSON.stringify(body) });
    }).then(function (r) {
      return r.text().then(function (t) {
        var j = null; try { j = JSON.parse(t); } catch (e) {}
        if (!r.ok) { var err = new Error((j && j.error) || ('The plan reader answered ' + r.status + '.')); err.status = r.status; throw err; }
        return j || {};
      });
    });
  }

  /* ── pdf.js, fetched the first time a PDF is dropped (the same build the
     BESS sizer's bill reader loads) ── */
  var pdfjsP = null;
  function pdfjs() {
    if (root.pdfjsLib) return Promise.resolve(root.pdfjsLib);
    if (pdfjsP) return pdfjsP;
    pdfjsP = new Promise(function (resolve, reject) {
      var s = document.createElement('script'); s.src = PDFJS_SRC; s.async = true;
      s.onload = function () {
        var lib = root.pdfjsLib || root['pdfjs-dist/build/pdf'];
        if (!lib) { reject(new Error('The PDF reader did not load.')); return; }
        try { lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER; } catch (e) {}
        resolve(lib);
      };
      s.onerror = function () { pdfjsP = null; reject(new Error('The PDF reader could not be fetched. Check the connection and try again.')); };
      document.head.appendChild(s);
    });
    return pdfjsP;
  }

  /* ── one sheet → a JPEG of at most LONG_EDGE px and its text layer ── */
  function jpegOf(canvas) {
    var q = 0.85, url = canvas.toDataURL('image/jpeg', q);
    while (url.length > MAX_JPEG && q > 0.45) { q -= 0.1; url = canvas.toDataURL('image/jpeg', q); }
    return url.length > MAX_JPEG ? null : url;
  }
  function whiteCanvas(w, h) {
    var c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
    var x = c.getContext('2d'); x.fillStyle = '#ffffff'; x.fillRect(0, 0, c.width, c.height); return c;
  }
  function textOf(content) {
    var rows = [];
    (content.items || []).forEach(function (it) {
      if (!it || !it.str || !String(it.str).trim()) return;
      var y = it.transform ? it.transform[5] : 0, x = it.transform ? it.transform[4] : 0, row = null;
      for (var i = 0; i < rows.length; i++) if (Math.abs(rows[i].y - y) < 3) { row = rows[i]; break; }
      if (!row) { row = { y: y, parts: [] }; rows.push(row); }
      row.parts.push({ x: x, s: String(it.str) });
    });
    rows.sort(function (a, b) { return b.y - a.y; });
    return rows.map(function (r) { r.parts.sort(function (a, b) { return a.x - b.x; }); return r.parts.map(function (p) { return p.s; }).join(' ').replace(/\s+/g, ' ').trim(); })
      .join('\n').slice(0, 24000);
  }
  function renderPdfPage(doc, n, longEdge) {
    return doc.getPage(n).then(function (page) {
      var v1 = page.getViewport({ scale: 1 }), k = Math.min(longEdge / Math.max(v1.width, v1.height), 4), v = page.getViewport({ scale: k });
      var c = whiteCanvas(v.width, v.height);
      return page.render({ canvasContext: c.getContext('2d'), viewport: v }).promise.then(function () { return { canvas: c, page: page }; });
    });
  }
  function readFileAsDataURL(file) {
    return new Promise(function (resolve, reject) { var r = new FileReader(); r.onload = function () { resolve(r.result); }; r.onerror = function () { reject(new Error('Could not read that file.')); }; r.readAsDataURL(file); });
  }
  function loadImage(src) {
    return new Promise(function (resolve, reject) { var im = new Image(); im.onload = function () { resolve(im); }; im.onerror = function () { reject(new Error('That image could not be opened.')); }; im.src = src; });
  }

  /* ── the dialog ── */
  function host() {
    var h = $(HOST_ID);
    if (!h) {
      h = document.createElement('div'); h.id = HOST_ID;
      h.setAttribute('role', 'dialog'); h.setAttribute('aria-modal', 'true'); h.setAttribute('aria-label', 'Read a plan set');
      h.setAttribute('style', 'position:fixed;inset:0;background:rgba(6,12,22,.82);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px');
      var down = false;
      h.onmousedown = function (e) { down = e.target === h; };
      h.onclick = function (e) { if (e.target === h && down) close(); down = false; };
      document.body.appendChild(h);
      document.addEventListener('keydown', onKey);
    }
    return h;
  }
  function onKey(e) {
    if (e.key !== 'Escape' || !$(HOST_ID)) return;
    if ($('pr-zoom')) { $('pr-zoom').remove(); return; }
    close();
  }
  function busyReading() { return !!(st && st.pages && st.pages.some(function (p) { return p.status === 'reading'; })); }
  function close() {
    if (busyReading() && !confirm('Sheets are still being read. Close anyway? What has been read so far is kept for this session.')) return;
    if (st) st.cancelled = true;
    var h = $(HOST_ID); if (h) h.remove();
    document.removeEventListener('keydown', onKey);
  }
  var CSS = '#plan-read-modal .pr-card{background:var(--panel);border:1px solid var(--border);border-radius:12px;max-width:1080px;width:100%;max-height:92vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.6);color:var(--text);font-size:12px}'
    + '#plan-read-modal .pr-head{padding:14px 18px;border-bottom:1px solid var(--border);display:flex;align-items:flex-start;justify-content:space-between;gap:12px}'
    + '#plan-read-modal .pr-body{padding:16px 18px;overflow:auto;flex:1;min-height:0}'
    + '#plan-read-modal .pr-foot{padding:12px 18px;border-top:1px solid var(--border);display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:flex-end}'
    + '#plan-read-modal .pr-btn{padding:8px 14px;border-radius:7px;border:1px solid var(--border);background:var(--hover-strong,rgba(255,255,255,.06));color:var(--text);font:inherit;font-size:12px;cursor:pointer}'
    + '#plan-read-modal .pr-btn:disabled{opacity:.5;cursor:default}'
    + '#plan-read-modal select.pr-btn{font-size:12px;padding:7px 8px;max-width:180px}'
    + '#plan-read-modal .pr-primary{background:var(--green,#22C55E);border-color:transparent;color:#05210f;font-weight:700}'
    + '#plan-read-modal .pr-sub{font-size:11px;color:var(--sub);line-height:1.55}'
    + '#plan-read-modal .pr-drop{border:2px dashed var(--border);border-radius:10px;padding:34px 20px;text-align:center;cursor:pointer}'
    + '#plan-read-modal .pr-drop.on{border-color:var(--green,#22C55E);background:rgba(34,197,94,.06)}'
    + '#plan-read-modal .pr-pages{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px;margin-top:12px}'
    + '#plan-read-modal .pr-page{border:1px solid var(--border);border-radius:8px;padding:8px;background:rgba(127,127,127,.04)}'
    + '#plan-read-modal .pr-page canvas,#plan-read-modal .pr-page img{width:100%;height:auto;display:block;border-radius:4px;background:#fff}'
    + '#plan-read-modal .pr-st{font-size:10.5px;margin-top:5px;line-height:1.4}'
    + '#plan-read-modal .pr-sec{font-size:10px;letter-spacing:.5px;text-transform:uppercase;color:var(--sub);margin:16px 0 6px;font-weight:700}'
    + '#plan-read-modal table{width:100%;border-collapse:collapse}'
    + '#plan-read-modal td,#plan-read-modal th{border-bottom:1px solid var(--border);padding:6px 6px;vertical-align:top;text-align:left}'
    + '#plan-read-modal th{font-size:9.5px;color:var(--sub);text-transform:uppercase;letter-spacing:.4px;font-weight:600}'
    + '#plan-read-modal .pr-crop{width:150px;height:46px;border:1px solid var(--border);border-radius:4px;background:#fff;cursor:zoom-in;display:block}'
    + '#plan-read-modal .pr-chip{display:inline-block;padding:1px 6px;border-radius:9px;font-size:9.5px;font-weight:700;letter-spacing:.2px;white-space:nowrap}'
    + '#plan-read-modal .pr-high{background:rgba(34,197,94,.16);color:#16A34A}#plan-read-modal .pr-medium{background:rgba(245,166,35,.18);color:#B7791F}#plan-read-modal .pr-low{background:rgba(239,68,68,.15);color:#DC2626}'
    + '#plan-read-modal .pr-issue{border-radius:7px;padding:8px 10px;margin:0 0 6px;line-height:1.5}'
    + '#plan-read-modal .pr-warn{background:rgba(245,166,35,.12);border:1px solid rgba(245,166,35,.45)}#plan-read-modal .pr-info{background:rgba(148,163,184,.10);border:1px solid var(--border)}'
    + '#plan-read-modal .pr-q{font-size:10px;color:var(--sub);font-family:ui-monospace,Menlo,Consolas,monospace;margin-top:2px;word-break:break-word}'
    + '#plan-read-modal .pr-sum{display:flex;flex-wrap:wrap;gap:14px;margin:0 0 4px}'
    + '#plan-read-modal .pr-sum b{font-size:18px;display:block}'
    + '#pr-zoom{position:fixed;inset:0;z-index:10001;background:rgba(6,12,22,.9);display:flex;align-items:center;justify-content:center;padding:24px;cursor:zoom-out}'
    + '#pr-zoom canvas{max-width:100%;max-height:100%;background:#fff;border-radius:6px}'
    + '@media (max-width:640px){#plan-read-modal{padding:0!important}#plan-read-modal .pr-card{max-height:100vh;border-radius:0}#plan-read-modal .pr-hide-phone{display:none}#plan-read-modal .pr-crop{width:110px}}';
  function shell(sub, body, foot) {
    return '<style>' + CSS + '</style><div class="pr-card"><div class="pr-head"><div><div style="font-size:16px;font-weight:800">Read a plan set</div>'
      + '<div class="pr-sub" style="margin-top:2px">' + sub + '</div></div>'
      + '<button type="button" aria-label="Close" onclick="OmegaPlanRead.close()" style="background:none;border:none;color:var(--sub);font-size:22px;cursor:pointer;line-height:1">×</button></div>'
      + '<div class="pr-body" id="pr-body">' + body + '</div>' + (foot ? '<div class="pr-foot" id="pr-foot">' + foot + '</div>' : '') + '</div>';
  }

  /* step 1: the file */
  function startView() {
    var again = st && st.result ? '<div class="pr-issue pr-info" style="margin-bottom:12px">You read <b>' + esc(st.fileName) + '</b> earlier in this session. <button type="button" class="pr-btn" onclick="OmegaPlanRead.review()">Back to that read</button></div>' : '';
    host().innerHTML = shell('Drop the customer’s drawings. Each sheet is read for its equipment, ratings and project facts, with the place on the sheet each came from.',
      again + '<label class="pr-drop" id="pr-drop" for="pr-file"><div style="font-size:28px;line-height:1">&#128196;</div>'
      + '<div style="font-size:14px;font-weight:700;margin-top:8px">Drop a PDF plan set here, or choose a file</div>'
      + '<div class="pr-sub" style="margin-top:6px">PDF up to ' + MAX_PAGES + ' sheets, or a JPEG/PNG photo of one sheet. Vector PDFs read best: their own text is read word for word.</div></label>'
      + '<input id="pr-file" type="file" accept="application/pdf,.pdf,image/png,image/jpeg" style="display:none">'
      + '<div class="pr-sub" style="margin-top:14px">Nothing is placed until you tick it. Every figure shows the words it was read from; anything the sheets disagree on is listed for you to check. A sheet read again is free; a workspace reads up to 80 new sheets a day.</div>',
      '<button type="button" class="pr-btn" onclick="OmegaPlanRead.close()">Cancel</button>');
    var input = $('pr-file'), drop = $('pr-drop');
    input.onchange = function () { if (input.files && input.files[0]) takeFile(input.files[0]); };
    drop.ondragover = function (e) { e.preventDefault(); drop.classList.add('on'); };
    drop.ondragleave = function () { drop.classList.remove('on'); };
    drop.ondrop = function (e) { e.preventDefault(); drop.classList.remove('on'); var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) takeFile(f); };
  }
  function fail(msg) {
    var b = $('pr-body'); if (!b) return;
    b.insertAdjacentHTML('afterbegin', '<div class="pr-issue pr-warn" role="alert">' + esc(msg) + '</div>');
  }
  function takeFile(file) {
    var pdf = /pdf$/i.test(file.type) || /\.pdf$/i.test(file.name), img = /^image\/(png|jpeg)$/.test(file.type);
    if (!pdf && !img) { fail('That is not a PDF, PNG or JPEG.'); return; }
    if (file.size > 80 * 1024 * 1024) { fail('That file is over 80 MB. Split the plan set and read the sheets that matter.'); return; }
    st = { fileName: file.name, pages: [], doc: null, result: null, cancelled: false, cut: 0 };
    host().innerHTML = shell(esc(file.name), '<div class="pr-sub">Opening the file…</div>');
    var go = pdf ? openPdf(file) : openImage(file);
    go.then(pagesView).catch(function (e) { startView(); fail(e.message || String(e)); });
  }
  function openPdf(file) {
    return Promise.all([pdfjs(), file.arrayBuffer ? file.arrayBuffer() : new Response(file).arrayBuffer()]).then(function (r) {
      return r[0].getDocument({ data: new Uint8Array(r[1]) }).promise;
    }).then(function (doc) {
      st.doc = doc; st.cut = Math.max(0, doc.numPages - MAX_PAGES);
      for (var n = 1; n <= Math.min(doc.numPages, MAX_PAGES); n++) st.pages.push({ page: n, of: doc.numPages, selected: true, status: 'ready' });
    });
  }
  function openImage(file) {
    return readFileAsDataURL(file).then(loadImage).then(function (im) {
      var k = Math.min(1, LONG_EDGE / Math.max(im.naturalWidth, im.naturalHeight)), c = whiteCanvas(im.naturalWidth * k, im.naturalHeight * k);
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      var jpg = jpegOf(c); if (!jpg) throw new Error('That image is too large to send.');
      st.pages.push({ page: 1, of: 1, selected: true, status: 'ready', image: jpg, text: '' });
    });
  }

  /* step 2: the sheets, ticked, then read one at a time */
  function pageCard(p) {
    var s = p.status === 'reading' ? '<span style="color:#38BDF8">Reading…</span>'
      : p.status === 'done' ? '<span style="color:#16A34A">✓ ' + p.result.items.length + ' items, ' + p.result.facts.length + ' facts' + (p.cached ? ' (read before)' : '') + '</span>'
      : p.status === 'error' ? '<span style="color:#DC2626">' + esc(p.error) + '</span> <button type="button" class="pr-btn" style="padding:2px 8px;font-size:10.5px" onclick="OmegaPlanRead.retry(' + p.page + ')">Retry</button>'
      : p.status === 'queued' ? '<span style="color:var(--sub)">Waiting…</span>' : '';
    var title = p.result && p.result.sheet ? esc((p.result.sheet.number || '') + ' ' + (p.result.sheet.title || '')).trim() : '';
    return '<div class="pr-page" id="pr-pg-' + p.page + '"><label style="display:flex;gap:6px;align-items:center;margin-bottom:6px;cursor:pointer">'
      + '<input type="checkbox" ' + (p.selected ? 'checked ' : '') + (p.status === 'done' || p.status === 'reading' ? 'disabled ' : '') + 'onchange="OmegaPlanRead.pick(' + p.page + ',this.checked)">'
      + '<b>Page ' + p.page + '</b>' + (title ? '<span class="pr-sub" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + title + '</span>' : '') + '</label>'
      + '<div id="pr-th-' + p.page + '" style="aspect-ratio:3/2;background:#fff;border-radius:4px"></div><div class="pr-st">' + s + '</div></div>';
  }
  function pagesView() {
    var picked = st.pages.filter(function (p) { return p.selected && p.status !== 'done'; }).length, done = st.pages.filter(function (p) { return p.status === 'done'; }).length;
    var reading = busyReading();
    host().innerHTML = shell(esc(st.fileName) + ' · ' + st.pages.length + (st.pages.length === 1 ? ' sheet' : ' sheets') + (st.cut ? ' (the first ' + MAX_PAGES + '; ' + st.cut + ' more not shown)' : ''),
      '<div class="pr-sub">Untick sheets that carry nothing to build (renderings, details, specifications) to save reads. Cover, site, electrical and single-line sheets carry the most.</div>'
      + '<div class="pr-pages">' + st.pages.map(pageCard).join('') + '</div>',
      '<span class="pr-sub" style="margin-right:auto" id="pr-progress">' + (done ? done + ' read' : '') + '</span>'
      + '<button type="button" class="pr-btn" onclick="OmegaPlanRead.restart()">Another file</button>'
      + (done ? '<button type="button" class="pr-btn" onclick="OmegaPlanRead.review()"' + (reading ? ' disabled' : '') + '>Review ' + done + (done === 1 ? ' sheet' : ' sheets') + '</button>' : '')
      + '<button type="button" class="pr-btn pr-primary" id="pr-read" onclick="OmegaPlanRead.read()"' + (picked && !reading ? '' : ' disabled') + '>' + (reading ? 'Reading…' : 'Read ' + picked + (picked === 1 ? ' sheet' : ' sheets')) + '</button>');
    thumbs();
  }
  function refreshCard(p) { var el = $('pr-pg-' + p.page); if (el) { el.outerHTML = pageCard(p); drawThumb(p); } }
  function drawThumb(p) {
    var box = $('pr-th-' + p.page); if (!box) return;
    if (p.thumb) { box.innerHTML = ''; box.style.aspectRatio = ''; box.appendChild(cloneCanvas(p.thumb)); }
  }
  function cloneCanvas(c) { var d = document.createElement('canvas'); d.width = c.width; d.height = c.height; d.getContext('2d').drawImage(c, 0, 0); return d; }
  function thumbs() {
    var chain = Promise.resolve();
    st.pages.forEach(function (p) {
      if (p.thumb) { drawThumb(p); return; }
      chain = chain.then(function () {
        if (st.cancelled) return;
        if (p.image) return loadImage(p.image).then(function (im) { var c = whiteCanvas(THUMB_W, THUMB_W * im.naturalHeight / im.naturalWidth); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); p.thumb = c; drawThumb(p); });
        return renderPdfPage(st.doc, p.page, THUMB_W).then(function (r) { p.thumb = r.canvas; drawThumb(p); });
      }).catch(function () {});
    });
  }
  function prepare(p) {
    if (p.image) return Promise.resolve(p);
    return renderPdfPage(st.doc, p.page, LONG_EDGE).then(function (r) {
      p.image = jpegOf(r.canvas);
      if (!p.image) throw new Error('This sheet is too large to send even compressed.');
      return r.page.getTextContent().then(function (tc) { p.text = textOf(tc); return p; }, function () { p.text = ''; return p; });
    });
  }
  function readOne(p) {
    p.status = 'reading'; p.error = null; refreshCard(p);
    return prepare(p).then(function () {
      return post({ action: 'read', fileName: st.fileName, sheet: { page: p.page, of: p.of, text: p.text || '', image: p.image } });
    }).then(function (r) {
      p.status = 'done'; p.result = r.sheet; p.cached = !!r.cached; p.selected = true;
      if (r.today) st.today = r.today;
    }).catch(function (e) {
      p.status = 'error'; p.error = e.message || String(e);
      if (e.status === 429 || e.status === 503 || e.status === 403) st.stop = p.error;   /* the rest would fail the same way */
    }).then(function () { if (!st.cancelled) refreshCard(p); });
  }
  function read() {
    if (!st || busyReading()) return;
    st.stop = null;
    var queue = st.pages.filter(function (p) { return p.selected && p.status !== 'done'; });
    if (!queue.length) return;
    queue.forEach(function (p) { p.status = 'queued'; });
    pagesView();
    var i = 0;
    function worker() {
      if (st.cancelled) return Promise.resolve();
      if (st.stop) { queue.slice(i).forEach(function (p) { if (p.status === 'queued') { p.status = 'error'; p.error = st.stop; refreshCard(p); } }); i = queue.length; return Promise.resolve(); }
      var p = queue[i++]; if (!p) return Promise.resolve();
      return readOne(p).then(worker);
    }
    Promise.all([worker(), worker()]).then(function () {
      if (st.cancelled) return;
      var ok = st.pages.filter(function (p) { return p.status === 'done'; }).length;
      if (ok && !st.pages.some(function (p) { return p.status === 'error'; })) review();
      else pagesView();
    });
  }
  function retry(n) { var p = st && st.pages.filter(function (x) { return x.page === n; })[0]; if (!p || busyReading()) return; p.selected = true; p.status = 'ready'; read(); }
  function pick(n, on) { var p = st && st.pages.filter(function (x) { return x.page === n; })[0]; if (p) { p.selected = !!on; pagesView(); } }

  /* step 3: the review */
  function review() {
    if (!st) { startView(); return; }
    st.cancelled = false;
    var sheets = st.pages.filter(function (p) { return p.status === 'done'; }).map(function (p) { return p.result; });
    if (!sheets.length) { pagesView(); return; }
    host().innerHTML = shell(esc(st.fileName), '<div class="pr-sub">Checking the sheets against each other…</div>');
    post({ action: 'check', sheets: sheets }).then(function (r) {
      st.result = r.result; reviewView();
    }).catch(function (e) { pagesView(); fail(e.message || String(e)); });
  }
  function sheetName(page) {
    var s = (st.result.sheets || []).filter(function (x) { return x.page === page; })[0];
    return s && s.number ? s.number : 'p.' + page;
  }
  function chip(c) { return '<span class="pr-chip pr-' + c + '">' + c + '</span>'; }
  function crop(page, box, key) {
    return box ? '<canvas class="pr-crop" width="300" height="92" data-crop="' + esc(key) + '" data-page="' + page + '" data-box="' + esc(JSON.stringify(box)) + '" title="Where it was read — click to see the sheet" onclick="OmegaPlanRead.zoom(this)"></canvas>'
      : '<span class="pr-sub">no box</span>';
  }
  function specs(it) {
    var r = [];
    if (it.manufacturer || it.model) r.push(esc([it.manufacturer, it.model].filter(Boolean).join(' ')));
    var rating = [];
    if (it.kw != null) rating.push(fmt(it.kw) + ' kW'); if (it.kwh != null) rating.push(fmt(it.kwh) + ' kWh'); if (it.kva != null) rating.push(fmt(it.kva) + ' kVA');
    if (it.amps != null) rating.push(fmt(it.amps) + ' A'); if (it.voltage) rating.push(esc(it.voltage)); if (it.lengthFt != null) rating.push(fmt(it.lengthFt) + ' ft');
    if (rating.length) r.push(rating.join(' · '));
    return r.join('<br>');
  }
  function reviewView() {
    var R = st.result, items = R.items, placeable = items.filter(function (it) { return !!it.place; });
    var sum = '<div class="pr-sum">' + [[R.summary.sheets, 'sheets read'], [R.summary.items, 'items'], [R.summary.placeable, 'can be placed'], [R.summary.facts, 'project facts'], [R.summary.warnings, 'to check']]
      .map(function (s) { return '<div><b>' + s[0] + '</b><span class="pr-sub">' + s[1] + '</span></div>'; }).join('') + '</div>';
    var issues = R.issues.length ? '<div class="pr-sec">Check these</div>' + R.issues.map(function (i) {
      return '<div class="pr-issue pr-' + (i.level === 'warn' ? 'warn' : 'info') + '">' + (i.level === 'warn' ? '⚠ ' : '') + esc(i.text) + '</div>';
    }).join('') : '<div class="pr-sec">Check these</div><div class="pr-sub">The sheets agree with each other on everything the reader compared.</div>';
    var factRows = R.facts.map(function (f) {
      var v = f.unit ? fmt(f.number) + ' ' + esc(f.unit) : esc(f.text);
      var also = f.agree ? (f.pages.length > 1 ? ' <span class="pr-sub">(same on ' + f.pages.map(sheetName).join(', ') + ')</span>' : '')
        : '<div style="color:#B7791F;font-size:10.5px">Also read as ' + f.values.slice(1).map(function (x) { return (f.unit ? fmt(x.number) + ' ' + f.unit : x.text) + ' on ' + x.pages.map(sheetName).join(', '); }).map(esc).join('; ') + '</div>';
      return '<tr><td><b>' + esc(f.label) + '</b></td><td>' + v + also + '<div class="pr-q">“' + esc(f.quote) + '”</div></td><td>' + esc(sheetName(f.page)) + '</td><td>' + chip(f.confidence) + '</td><td class="pr-hide-phone">' + crop(f.page, f.box, 'f-' + f.key) + '</td></tr>';
    }).join('');
    var itemRows = items.map(function (it, ix) {
      var r0 = it.reads[0], can = !!it.place;
      return '<tr' + (can ? '' : ' style="opacity:.82"') + '><td><input type="checkbox" data-item="' + ix + '" ' + (it.selected ? 'checked ' : '') + (can ? '' : 'disabled title="Listed only"') + ' aria-label="Place ' + esc(it.tag || it.kindLabel) + '"></td>'
        + '<td><b>' + esc(it.tag || it.kindLabel) + '</b><div class="pr-sub">' + esc(it.tag || it.description !== it.kindLabel ? it.description : '') + '</div>'
        + (can ? '' : '<div class="pr-sub" style="color:var(--sub)">Listed, not drawn.' + (it.note ? ' ' + esc(it.note) : '') + '</div>')
        + (it.conflicts.length ? '<div style="color:#B7791F;font-size:10.5px">' + esc(it.conflicts.join(', ')) + ' read differently on two sheets</div>' : '') + '</td>'
        + '<td>' + (specs(it) || '<span class="pr-sub">no rating printed</span>') + '<div class="pr-q">“' + esc(r0.quote) + '”</div></td>'
        + '<td style="text-align:center"><b>' + it.quantity + '</b></td><td>' + it.pages.map(sheetName).map(esc).join('<br>') + '</td><td>' + chip(it.confidence) + '</td>'
        + '<td class="pr-hide-phone">' + crop(r0.page, r0.box, 'i-' + ix) + '</td></tr>';
    }).join('');
    var sheetsList = R.sheets.map(function (s) { return '<span class="pr-chip" style="background:rgba(127,127,127,.12);color:var(--text);margin:0 4px 4px 0">' + esc((s.number || 'p.' + s.page) + (s.title ? ' · ' + s.title : '')) + '</span>'; }).join('');
    var traceable = st.pages.filter(function (p) { return p.status === 'done' && p.image; });
    var canTrace = !!($('fbg') && typeof root.loadBg === 'function');
    host().innerHTML = shell(esc(st.fileName) + (st.today ? ' · ' + st.today.used + ' of ' + st.today.of + ' sheets read today' : ''),
      sum + '<div style="margin:6px 0 2px">' + sheetsList + '</div>' + issues
      + '<div class="pr-sec">Equipment and runs</div><div class="pr-sub" style="margin-bottom:4px">Ticked items are placed in a row at the centre of the view, labelled with their tag and the sheet they came from; drag each into place. Low-confidence reads start unticked.</div>'
      + '<table><thead><tr><th></th><th>Item</th><th>Rating and the words read</th><th>Qty</th><th>Sheet</th><th>Read</th><th class="pr-hide-phone">On the sheet</th></tr></thead><tbody>' + itemRows + '</tbody></table>'
      + (R.facts.length ? '<div class="pr-sec">Project facts</div><table><thead><tr><th>Fact</th><th>Value and the words read</th><th>Sheet</th><th>Read</th><th class="pr-hide-phone">On the sheet</th></tr></thead><tbody>' + factRows + '</tbody></table>'
        + '<div class="pr-sub" style="margin-top:6px">Facts are kept on the project with this read. They are not prices: the Run prices what is drawn.</div>' : ''),
      '<span class="pr-sub" style="margin-right:auto" id="pr-count"></span>'
      + (canTrace && traceable.length ? '<select id="pr-trace" class="pr-btn pr-hide-phone" aria-label="Sheet to trace over">' + traceable.map(function (p) { return '<option value="' + p.page + '">' + esc(sheetName(p.page)) + '</option>'; }).join('') + '</select>'
        + '<button type="button" class="pr-btn pr-hide-phone" onclick="OmegaPlanRead.trace()">Trace over this sheet</button>' : '')
      + '<button type="button" class="pr-btn" onclick="OmegaPlanRead.sheets()">Sheets</button>'
      + '<button type="button" class="pr-btn pr-primary" id="pr-place" onclick="OmegaPlanRead.place()">Place on the drawing</button>');
    var body = $('pr-body');
    body.addEventListener('change', function (e) { if (e.target && e.target.hasAttribute('data-item')) { items[+e.target.getAttribute('data-item')].selected = e.target.checked; count(); } });
    count(); drawCrops();
    if (!placeable.length) { var pb = $('pr-place'); if (pb) { pb.disabled = true; pb.textContent = 'Nothing to place'; } }
  }
  function units() {
    var n = 0; (st.result.items || []).forEach(function (it) { if (it.selected && it.place) n += Math.min(it.quantity || 1, PER_ITEM); }); return Math.min(n, PER_PLACE);
  }
  function count() {
    var n = units(), el = $('pr-count'), b = $('pr-place');
    if (el) el.textContent = n ? n + (n === 1 ? ' unit' : ' units') + ' will be placed' : 'Nothing ticked';
    if (b && st.result.items.some(function (it) { return it.place; })) { b.disabled = !n; b.textContent = n ? 'Place ' + n + ' on the drawing' : 'Place on the drawing'; }
  }
  /* the crops: the sheet's own pixels around the box, so every read can be
     checked against the drawing at a glance */
  var imgCache = {};
  function pageImage(page) {
    var p = st.pages.filter(function (x) { return x.page === page; })[0];
    if (!p || !p.image) return Promise.reject(new Error('no image'));
    if (!imgCache[p.image.length + ':' + page]) imgCache[p.image.length + ':' + page] = loadImage(p.image);
    return imgCache[p.image.length + ':' + page];
  }
  function drawCrops() {
    Array.prototype.forEach.call(document.querySelectorAll('#plan-read-modal canvas[data-crop]'), function (c) {
      var box; try { box = JSON.parse(c.getAttribute('data-box')); } catch (e) { return; }
      pageImage(+c.getAttribute('data-page')).then(function (im) {
        /* a region of the crop's own shape, tall enough to read the words:
           centred on the box when it fits, else anchored at the start of the
           words (the sheet view shows the whole line) */
        var W = im.naturalWidth, H = im.naturalHeight, bx = box.x * W, by = box.y * H, bw = box.w * W, bh = box.h * H, aspect = c.width / c.height;
        var rh = Math.min(H, Math.max(bh * 2.2, 28)), rw = Math.min(W, rh * aspect);
        var sx = bw + bh * 0.6 <= rw ? bx + bw / 2 - rw / 2 : bx - bh * 0.4, sy = by + bh / 2 - rh / 2;
        sx = Math.max(0, Math.min(W - rw, sx)); sy = Math.max(0, Math.min(H - rh, sy));
        var x = c.getContext('2d'), k = c.width / rw;
        x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
        x.drawImage(im, sx, sy, rw, rh, 0, 0, c.width, c.height);
        x.strokeStyle = 'rgba(234,88,12,.9)'; x.lineWidth = 2;
        x.strokeRect((bx - sx) * k - 3, (by - sy) * k - 3, bw * k + 6, bh * k + 6);
      }).catch(function () {});
    });
  }
  function zoom(c) {
    var box; try { box = JSON.parse(c.getAttribute('data-box')); } catch (e) { return; }
    pageImage(+c.getAttribute('data-page')).then(function (im) {
      var z = document.createElement('div'); z.id = 'pr-zoom'; z.title = 'Click to close';
      var cv = document.createElement('canvas'); cv.width = im.naturalWidth; cv.height = im.naturalHeight;
      var x = cv.getContext('2d'); x.drawImage(im, 0, 0);
      x.strokeStyle = 'rgba(234,88,12,.95)'; x.lineWidth = Math.max(3, im.naturalWidth / 500);
      x.strokeRect(box.x * cv.width - 6, box.y * cv.height - 6, box.w * cv.width + 12, box.h * cv.height + 12);
      z.appendChild(cv); z.onclick = function () { z.remove(); };
      document.body.appendChild(z);
    }).catch(function () {});
  }

  /* ── place: the editor's own tools, one undo step ── */
  /* "EV-1 THRU EV-8" → EV-1 … EV-8; "INV-1, INV-2" → INV-1, INV-2; else TAG #n */
  function tagsFor(tag, n) {
    var t = String(tag || '').trim(), out = [];
    var range = /^([A-Za-z]+[-\s]?)(\d+)\s*(?:THRU|THROUGH|TO|-|–|—)\s*(?:[A-Za-z]+[-\s]?)?(\d+)$/i.exec(t);
    if (range && +range[3] > +range[2] && +range[3] - +range[2] + 1 === n) { for (var i = +range[2]; i <= +range[3]; i++) out.push(range[1] + i); return out; }
    var list = t.split(/\s*,\s*/);
    if (list.length === n && list.every(Boolean)) return list;
    for (var j = 1; j <= n; j++) out.push(t ? (n > 1 ? t + ' #' + j : t) : '');
    return out;
  }
  /* the short line the drawing prints under a placed unit: the model and
     its one headline rating (the sheet and the words read ride on planRead) */
  function nameplate(it) {
    var r = it.kind === 'bess' && it.kw != null && it.kwh != null ? fmt(it.kw) + ' kW / ' + fmt(it.kwh) + ' kWh'
      : it.kva != null ? fmt(it.kva) + ' kVA' : it.kw != null ? fmt(it.kw) + ' kW' : it.amps != null ? fmt(it.amps) + ' A' : it.lengthFt != null ? fmt(it.lengthFt) + ' ft' : '';
    return [it.model, r].filter(Boolean).join(' \u00b7 ');
  }
  function center() {
    var sc = $('sc'), r = sc ? sc.getBoundingClientRect() : { width: 900, height: 600 }, c = { x: r.width / 2, y: r.height / 2 };
    try { if (typeof root._plotUnproject === 'function') return root._plotUnproject(c) || c; } catch (e) {}
    return c;
  }
  function place() {
    var S = S_(), R = st && st.result;
    if (!S || !R) return;
    if (typeof root.addEl !== 'function') { alert('This editor build cannot place equipment from here. Use Insert to place the items listed.'); return; }
    var picked = R.items.filter(function (it) { return it.selected && it.place; });
    if (!picked.length) return;
    var readId = 'pr' + Date.now().toString(36), c = center(), placed = [], total = 0, shapes = 0;
    var batch = typeof root.omegaHistBatch === 'function' ? root.omegaHistBatch : function (fn) { var r = fn(); if (typeof root.pushHist === 'function') root.pushHist(); return r; };
    batch(function () {
      var slot = 0, cols = 6, stepX = 140, stepY = 130;
      picked.forEach(function (it) {
        var n = Math.min(it.quantity || 1, PER_ITEM), tags = tagsFor(it.tag, n), sheet = sheetName(it.pages[0]);
        for (var k = 0; k < n && total < PER_PLACE; k++) {
          var x = c.x + ((slot % cols) - (cols - 1) / 2) * stepX, y = c.y + Math.floor(slot / cols) * stepY;
          var label = tags[k] || it.kindLabel, spec = nameplate(it);
          var prov = { read: readId, item: it.id, sheet: sheet, page: it.pages[0], confidence: it.confidence, quote: (it.reads[0] && it.reads[0].quote) || '' };
          var el = null;
          if (it.place.via === 'shape') {
            el = charger(it, x, y, label, prov);
            if (el) { placed.push(el.id); shapes++; }
            slot++; total++; continue;
          } else {
            var w = typeof root._eqDropW === 'function' ? root._eqDropW(it.place.id) : 60;
            el = root.addEl({ type: 'eq', eqId: it.place.id, label: label, x: x - w / 2, y: y - w / 2, w: w, rot: 0, spec: spec });
            if (el && it.place.id === 'bess') { if (it.kw != null) { el.bessKw = it.kw; el.bgbKw = it.kw; } if (it.kwh != null) { el.bessKwh = it.kwh; el.bgbKwh = it.kwh; } if (it.model) el.bessModel = it.model; }
          }
          if (el) { el.planRead = prov; placed.push(el.id); try { if (typeof root.renderEl === 'function') root.renderEl(el); } catch (e) {} }
          slot++; total++;
        }
      });
    });
    S.planRead = {
      v: 1, id: readId, fileName: st.fileName, readAt: new Date().toISOString(),
      sheets: R.sheets.map(function (s) { return { page: s.page, number: s.number, title: s.title, discipline: s.discipline }; }),
      facts: R.facts.map(function (f) { return { key: f.key, label: f.label, number: f.number, text: f.text, unit: f.unit, page: f.page, sheet: sheetName(f.page), agree: f.agree, confidence: f.confidence }; }),
      issues: R.issues.filter(function (i) { return i.level === 'warn'; }).map(function (i) { return i.text; }),
      placed: placed.length, listed: R.items.filter(function (it) { return !it.place; }).map(function (it) { return { kind: it.kind, tag: it.tag, kw: it.kw, lengthFt: it.lengthFt, quantity: it.quantity, sheet: sheetName(it.pages[0]) }; })
    };
    try { if (typeof root.updCount === 'function') root.updCount(); } catch (e) {}
    try { if (shapes && typeof root.updShapeCount === 'function') root.updShapeCount(); } catch (e) {}
    try { if (typeof root.renderLegend === 'function') root.renderLegend(); } catch (e) {}
    try { root._workDirty = true; if (typeof root._setSaved === 'function') root._setSaved('unsaved'); } catch (e) {}
    try { if (typeof root.updateCostEst === 'function') root.updateCostEst(); } catch (e) {}
    var b = $('pr-body');
    if (b) b.insertAdjacentHTML('afterbegin', '<div class="pr-issue pr-info" role="status" style="border-color:rgba(34,197,94,.5)"><b>Placed ' + placed.length + (placed.length === 1 ? ' unit' : ' units') + '</b> in a row at the centre of the view. Drag each into place; one Undo (Ctrl+Z) takes them all back. Save the project to keep the read with it.</div>');
    var pb = $('pr-place'); if (pb) { pb.disabled = true; pb.textContent = '✓ Placed'; }
    var foot = $('pr-foot'); if (foot && !$('pr-done')) foot.insertAdjacentHTML('beforeend', '<button type="button" class="pr-btn" id="pr-done" onclick="OmegaPlanRead.close()">Done</button>');
    if (b) b.scrollTop = 0;
    return placed.length;
  }

  /* A charger as the EV tools draw one: the Level 2 or DC fast shape the
     Run prices by kind and kW. No catalogue id: the model is the one the
     sheet printed, never a product the page would have to guess. */
  function charger(it, x, y, label, prov) {
    var S = S_(); if (!S || typeof root.renderShape !== 'function' || typeof root.uid !== 'function') return null;
    var l2 = it.place.id === 'evl2';
    var sh = { id: root.uid(), kind: l2 ? 'evl2' : 'evunit', evId: null, pts: [{ x: x, y: y }],
      style: S.shapeStyle || '', color: typeof root.SHAPE_STROKE !== 'undefined' ? root.SHAPE_STROKE : '#000',
      lf: l2 ? 1.1 : 2.9, wf: l2 ? 0.8 : 3.1, model: it.model || (l2 ? 'Level 2 charger' : 'DC fast charger'), mfr: it.manufacturer || '',
      kw: it.kw != null ? it.kw : 0, ports: 1, tag: label, label: label, planRead: prov,
      scaled: typeof root._evScaled === 'function' ? root._evScaled() : false };
    S.shapes = S.shapes || []; S.shapes.push(sh);
    try { root.renderShape(sh); } catch (e) {}
    return sh;
  }

  /* ── trace over a sheet: the Site Overlay's own upload, handed the sheet ── */
  function trace() {
    var sel = $('pr-trace'), n = sel ? +sel.value : 0, p = st && st.pages.filter(function (x) { return x.page === n; })[0], input = $('fbg');
    if (!p || !p.image || !input) return;
    if (!confirm('Put ' + sheetName(n) + ' on the canvas as the backdrop to trace over?\n\nIt replaces the map image (as Site Overlay › Upload Image does). Calibrate Scale next, using a dimension on the sheet.')) return;
    try {
      var bin = atob(p.image.split(',')[1]), arr = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      var file = new File([arr], (sheetName(n) || 'sheet') + '.jpg', { type: 'image/jpeg' }), dt = new DataTransfer();
      dt.items.add(file); input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      close();
    } catch (e) { alert('This browser could not hand the sheet to the overlay. Save the sheet image and use Site Overlay › Upload Image.'); }
  }

  function open() {
    if (st) st.cancelled = false;
    if (st && st.result) { reviewView(); return; }
    if (st && st.pages && st.pages.length) { pagesView(); return; }
    startView();
  }

  root.OmegaPlanRead = {
    open: open, close: close, read: read, retry: retry, pick: pick, review: review, place: place, trace: trace, zoom: zoom,
    sheets: function () { if (st) { st.cancelled = false; pagesView(); } },
    restart: function () { if (busyReading()) return; st = null; startView(); },
    /* for the render check: the read as the page holds it */
    _state: function () { return st; }, _tagsFor: tagsFor, _textOf: textOf
  };
})(typeof window !== 'undefined' ? window : this);
