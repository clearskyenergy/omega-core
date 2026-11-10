/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * omega-editor-v2-outputs.js — the one Outputs place.
 *
 * Ready or not ready, then preview or export. The checks, the code
 * sections and the schedules are on the sheets, not on the canvas.
 *
 * Outputs is the right-hand panel (panel()): the drawings and the
 * engineering, each with ready or not ready and a one-click export.
 * Preview opens the sheet dialog (open()) at full size. Both read the
 * same builders below, so the panel and the dialog cannot drift.
 */
(function (root) {
  'use strict';

  var E = root.OmegaEditorV2Electrical;
  var Sheets = root.OmegaEditorV2Sheets;
  var session = null;
  var panelState = null;

  function $(id) { return document.getElementById(id); }

  function today() {
    var d = new Date();
    function p(n) { return n < 10 ? '0' + n : '' + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  function el(tag, attrs, text) {
    var node = document.createElement(tag), k;
    attrs = attrs || {};
    for (k in attrs) if (attrs.hasOwnProperty(k)) {
      if (k === 'className') node.className = attrs[k];
      else node.setAttribute(k, attrs[k]);
    }
    if (text != null) node.textContent = text;
    return node;
  }

  function stateFor(api, prev) {
    return {
      api: api,
      doc: api.doc,
      size: prev && prev.size ? prev.size : 'ansi-d',
      underlay: null,
      aerialUnavailable: false
    };
  }

  function buildSet(s) {
    return Sheets.build(s.doc, {
      size: s.size,
      date: today(),
      catalog: s.api.catalog || {},
      underlay: s.underlay || null,
      aerialUnavailable: !!s.aerialUnavailable
    });
  }

  function aerialOn(s) {
    return !(s.doc.drawing && s.doc.drawing.aerial === false);
  }

  function setAerial(s, on, rerender) {
    var drawing = JSON.parse(JSON.stringify(s.doc.drawing || {}));
    drawing.aerial = !!on;
    if (s.api.updateMeta) s.api.updateMeta({drawing:drawing});
    else s.doc.drawing = drawing;
    s.underlay = null;
    s.aerialUnavailable = false;
    if (on) loadAerial(s, rerender);
    else rerender();
  }

  /* Loads the photo once for this state, then calls done. A sheet exported
     before the photo arrives would silently print without it. */
  function loadAerial(s, done) {
    var A = root.OmegaEditorV2Aerial;
    if (!s || !A || !A.wanted(s.doc) || !aerialOn(s) || s.underlay || s.aerialUnavailable) { if (done) done(); return; }
    var token = {};
    s.aerialToken = token;
    A.fetchImage(s.doc, function (err, img) {
      if (s.aerialToken !== token) return;
      if (err || !img) s.aerialUnavailable = true;
      else s.underlay = img;
      if (done) done();
    });
  }

  function open(api) {
    var which = api.which === 'sld' ? 'sld' : (api.which === 'set' ? 'set' : 'list');
    session = stateFor(api, panelState);
    session.mode = which === 'list' ? 'list' : 'preview';
    session.page = 0;
    session.which = which === 'sld' ? 'sld' : 'set';
    render();
    var dlg = $('dlg-outputs');
    if (dlg && !dlg.open) dlg.showModal();
    if (aerialOn(session)) loadAerial(session, render);
  }

  function sync(doc) {
    if (panelState) { panelState.doc = doc; renderPanel(); }
    if (!session) return;
    session.doc = doc;
    render();
  }

  function isOpen() { return !!session; }

  function render() {
    var body = $('out-body');
    if (!body || !session) return;
    while (body.firstChild) body.removeChild(body.firstChild);
    if (session.mode === 'preview') renderPreview(body);
    else renderList(body);
  }

  function renderList(body) {
    var s = session;
    var ready = E.readiness(s.doc, s.api.catalog || {});
    body.appendChild(el('h2', { id: 'out-title' }, 'Outputs'));
    body.appendChild(el('p', { className: 'out-status ' + (ready.ready ? 'is-ok' : 'is-no') }, ready.summary));
    if (s.api.updateMeta) body.appendChild(detailsForm(s));
    body.appendChild(sizeRow(s));
    body.appendChild(aerialToggle(s, render));

    body.appendChild(row('Permit plan set', 'The cover, the site plan, the single-line, the schedules and the checks.', [
      button('Preview', 'btn', function () { s.which = 'set'; s.page = 0; s.mode = 'preview'; render(); }),
      exportButton('Export', 'btn primary', ready, function () { exportSet(s, 'pdf', ready); }),
      exportButton('DXF', 'btn', ready, function () { exportSet(s, 'dxf', ready); })
    ]));
    body.appendChild(row('Single-line diagram', 'The same diagram as sheet E-002, on its own.', [
      button('Preview', 'btn', function () { s.which = 'sld'; s.page = 0; s.mode = 'preview'; render(); }),
      exportButton('Export', 'btn primary', ready, function () { exportSld(s, ready); })
    ]));
    body.appendChild(row('Drawing file', 'The linework, without the permit set.', drawingButtons(s)));

    var foot = el('div', { className: 'row-actions' });
    foot.appendChild(button('Close', 'btn', function () { close(); }));
    body.appendChild(foot);
  }

  /* ── The Outputs panel ─────────────────────────────────────────────── */

  function panel(api) {
    panelState = stateFor(api, panelState);
    renderPanel();
    if (aerialOn(panelState)) loadAerial(panelState, renderPanel);
  }

  function hidePanel() { panelState = null; }

  function renderPanel() {
    var host = $('outputs-body');
    var s = panelState;
    if (!host || !s) return;
    while (host.firstChild) host.removeChild(host.firstChild);
    var ready = E.readiness(s.doc, s.api.catalog || {});
    host.appendChild(el('p', { className: 'out-status ' + (ready.ready ? 'is-ok' : 'is-no'), id: 'outputs-status' }, ready.summary));

    host.appendChild(panelRow('out-permit', 'Permit set + plot plan', 'Cover, site plan, equipment, single-line, schedules, placards, grounding and the checks.', [
      button('Preview', 'btn', function () { preview(s, 'set'); }, 'btn-permit'),
      exportButton('PDF', 'btn primary', ready, function () { exportSet(s, 'pdf', ready); }, 'out-permit-pdf'),
      exportButton('DXF', 'btn', ready, function () { exportSet(s, 'dxf', ready); }, 'out-permit-dxf')
    ]));
    host.appendChild(panelRow('out-sld', 'One-line', 'Sheet E-002 on its own, generated from the placed equipment.', [
      button('Preview', 'btn', function () { preview(s, 'sld'); }, 'btn-sld'),
      exportButton('PDF', 'btn primary', ready, function () { exportSld(s, ready); }, 'out-sld-pdf')
    ]));
    host.appendChild(panelRow('out-bom', 'Bill of materials', 'The placed equipment and conduit. A screening list, not a quote.', [
      button('Preview', 'btn', function () { if (s.api.bom) s.api.bom(); }, 'out-bom-preview'),
      button('Request a quote in Logic', 'btn', function () { if (s.api.quote) s.api.quote(); }, 'btn-quote')
    ]));
    host.appendChild(panelRow('out-file', 'Drawing file', 'The linework, without the permit set. Project saves the whole drawing; Import opens one.', drawingButtons(s)));
    host.appendChild(checksBlock(ready));

    var sheet = el('details', { className: 'out-details', id: 'out-sheet' });
    sheet.appendChild(el('summary', null, 'Sheet size and aerial photo'));
    sheet.appendChild(sizeRow(s));
    sheet.appendChild(aerialToggle(s, renderPanel));
    host.appendChild(sheet);
    if (s.api.updateMeta) host.appendChild(detailsForm(s));

    host.appendChild(panelRow('out-handoff', 'Hand off', 'The same saved project, opened in the next tool.', [
      button('Open in OMEGA Prime', 'btn', function () { if (s.api.handoff) s.api.handoff('prime'); }, 'btn-prime'),
      button('Open in Logic', 'btn', function () { if (s.api.handoff) s.api.handoff('logic'); }, 'btn-logic'),
      button('Push to Funding', 'btn', function () { if (s.api.funding) s.api.funding(); }, 'out-funding')
    ]));
  }

  function preview(s, which) {
    var api = {}, k;
    for (k in s.api) if (s.api.hasOwnProperty(k)) api[k] = s.api[k];
    api.doc = s.doc;
    api.which = which;
    api.fromPanel = true;
    open(api);
  }

  function checksBlock(ready) {
    var box = el('details', { className: 'out-details', id: 'out-checks' });
    var count = ready.blocks.length + ready.notes.length;
    box.appendChild(el('summary', null, 'Checks' + (count ? (' · ' + (ready.blocks.length ? (ready.blocks.length + ' blocking, ') : '') + ready.notes.length + ' to review') : ' · none open')));
    if (!count) box.appendChild(el('p', { className: 'out-note' }, 'Every applicable check passed. Sheet E-009 lists them.'));
    var list = el('ul', { className: 'out-checks' }), i, c, item;
    for (i = 0; i < ready.blocks.length + ready.notes.length; i++) {
      c = i < ready.blocks.length ? ready.blocks[i] : ready.notes[i - ready.blocks.length];
      item = el('li', { className: i < ready.blocks.length ? 'is-block' : 'is-note' });
      item.appendChild(el('strong', null, (i < ready.blocks.length ? 'Blocking — ' : 'Review — ') + (c.title || c.id)));
      if (c.cite) item.appendChild(el('span', { className: 'out-note' }, ' ' + c.cite));
      if (c.detail) item.appendChild(el('p', { className: 'out-note' }, c.detail));
      list.appendChild(item);
    }
    if (count) box.appendChild(list);
    return box;
  }

  function panelRow(id, title, note, actions) {
    var line = el('div', { className: 'out-row out-panel-row', id: id });
    var copy = el('div');
    copy.appendChild(el('h3', null, title));
    copy.appendChild(el('p', { className: 'out-note' }, note));
    line.appendChild(copy);
    var box = el('div', { className: 'out-actions' }), i;
    for (i = 0; i < actions.length; i++) box.appendChild(actions[i]);
    line.appendChild(box);
    return line;
  }

  /* ── Shared pieces ─────────────────────────────────────────────────── */

  function drawingButtons(s) {
    var drawing = s.api.drawing || {};
    return [
      fileButton('PNG', drawing.png, 'out-png'),
      fileButton('PDF', drawing.pdf, 'out-pdf'),
      fileButton('DXF', drawing.dxf, 'out-dxf'),
      fileButton('Project', drawing.json, 'out-json'),
      fileButton('Import', drawing.importFile, 'out-import')
    ];
  }

  function sizeRow(s) {
    var line = el('div', { className: 'out-size' });
    var id = s === session ? 'out-size' : 'out-panel-size';
    line.appendChild(el('label', { for: id }, 'Sheet size'));
    var select = el('select', { id: id, 'aria-label': 'Sheet size' });
    var sizes = Sheets.SIZES, key, opt;
    for (key in sizes) if (sizes.hasOwnProperty(key)) {
      opt = el('option', { value: key }, sizes[key].name);
      if (key === s.size) opt.selected = true;
      select.appendChild(opt);
    }
    select.addEventListener('change', function () { s.size = select.value; });
    line.appendChild(select);
    return line;
  }

  function detailsForm(s) {
    var details = el('details', { className: 'out-details' });
    details.appendChild(el('summary', null, 'Electrical and sheet details'));
    details.appendChild(el('p', { className: 'out-note' }, 'Enter verified project facts. Blank values remain unspecified; any calculation assumptions are identified on the sheets. Save the project to keep these details in your workspace.'));
    var form = el('form'), grid = el('div', { className: 'out-fields' }), fields = [];
    var specs = [
      ['electrical','voltage','Service voltage (V)',1], ['electrical','phases','Phases (1 or 3)',1,3],
      ['electrical','pf','Power factor',0.01,1], ['electrical','busA','Bus rating (A)',1],
      ['electrical','mainA','Main breaker (A)',1], ['electrical','ambientC','Ambient temperature (°C)',-50,100],
      ['electrical','ahj','Authority having jurisdiction'], ['electrical','utility','Utility'],
      ['electrical','apn','Parcel number'], ['electrical','necEdition','Adopted NEC edition'],
      ['drawing','jobNo','Job number'], ['drawing','designedBy','Designed by'],
      ['drawing','checkedBy','Checked by'], ['drawing','rev','Revision']
    ];
    specs.forEach(function (spec) {
      var label = el('label', null, spec[2]), input = el('input', { type: spec.length > 3 ? 'number' : 'text', 'aria-label': spec[2] });
      input.value = (s.doc[spec[0]] || {})[spec[1]] == null ? '' : (s.doc[spec[0]] || {})[spec[1]];
      if (spec.length > 3) { input.min = spec[3]; input.step = spec[1] === 'phases' ? '2' : 'any'; if (spec[4] != null) input.max = spec[4]; }
      else input.maxLength = 200;
      label.appendChild(input); grid.appendChild(label); fields.push({ spec: spec, input: input });
    });
    var methodLabel = el('label', null, 'Interconnection method'), method = el('select', { 'aria-label': 'Interconnection method' });
    [['auto','Determine from ratings'],['120','Load-side 120%'],['100','Load-side 100%'],['supply','Supply-side']].forEach(function (pair) { var opt = el('option', {value:pair[0]},pair[1]); method.appendChild(opt); });
    method.value = (s.doc.electrical || {}).method || 'auto'; methodLabel.appendChild(method); grid.appendChild(methodLabel);
    form.appendChild(grid); var save = el('button', {type:'submit',className:'btn'}, 'Apply details'); form.appendChild(save);
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var patch = {electrical:JSON.parse(JSON.stringify(s.doc.electrical || {})),drawing:JSON.parse(JSON.stringify(s.doc.drawing || {}))};
      fields.forEach(function (field) { var value = field.input.value.trim(); if (value === '') delete patch[field.spec[0]][field.spec[1]]; else patch[field.spec[0]][field.spec[1]] = field.spec.length > 3 ? Number(value) : value; });
      patch.electrical.method = method.value;
      s.api.updateMeta(patch);
    });
    details.appendChild(form); return details;
  }

  function row(title, note, actions) {
    var line = el('div', { className: 'out-row' });
    var copy = el('div');
    copy.appendChild(el('h3', null, title));
    copy.appendChild(el('p', { className: 'out-note' }, note));
    line.appendChild(copy);
    var box = el('div', { className: 'out-actions' }), i;
    for (i = 0; i < actions.length; i++) box.appendChild(actions[i]);
    line.appendChild(box);
    return line;
  }

  function aerialToggle(s, rerender) {
    var A = root.OmegaEditorV2Aerial;
    var line = el('div', { className: 'out-size' });
    var hasAnchor = s.doc.anchor && isFinite(+s.doc.anchor.lat);
    if (!hasAnchor) {
      line.appendChild(el('p', { className: 'out-note' }, 'No site point is on the project, so the plot plan has no aerial photo.'));
      return line;
    }
    var box = el('input', { type: 'checkbox', id: s === session ? 'out-aerial' : 'out-panel-aerial', 'aria-label': 'Aerial photo on the site plan' });
    box.checked = aerialOn(s);
    box.addEventListener('change', function () { setAerial(s, box.checked, rerender); });
    line.appendChild(box);
    line.appendChild(el('span', null, 'Aerial photo on the site plan'));
    var note = s.underlay
      ? ('Imagery: ' + (A && A.ATTRIBUTION ? A.ATTRIBUTION : 'U.S. Geological Survey') + '.')
      : (s.aerialUnavailable ? 'Aerial imagery was not available.' : (box.checked ? 'The photo is loading.' : 'The photo is off. The plan stays linework.'));
    line.appendChild(el('p', { className: 'out-note' }, note));
    return line;
  }

  function fileButton(label, fn, id) {
    return button(label, 'btn', function () { if (fn) fn(); }, id);
  }

  function exportButton(label, className, ready, fn, id) {
    var b = button(label, className, fn, id);
    if (!ready.ready) {
      b.disabled = true;
      b.title = ready.summary;
    }
    return b;
  }

  function button(label, className, fn, id) {
    var b = el('button', { type: 'button', className: className }, label);
    if (id) b.id = id;
    b.addEventListener('click', fn);
    return b;
  }

  function pagesFor(built) {
    if (session.which !== 'sld') return built.pages;
    var i, out = [];
    for (i = 0; i < built.pages.length; i++) {
      if (built.pages[i].number.indexOf('E-002') === 0) out.push(built.pages[i]);
    }
    return out.length ? out : built.pages;
  }

  function renderPreview(body) {
    var built = buildSet(session);
    var pages = pagesFor(built);
    if (session.page >= pages.length) session.page = pages.length - 1;
    if (session.page < 0) session.page = 0;
    var page = pages[session.page];
    var bar = el('div', { className: 'out-bar' });
    if (session.api.fromPanel) bar.appendChild(button('Close', 'btn', function () { close(); }));
    else bar.appendChild(button('Back', 'btn', function () { session.mode = 'list'; render(); }));
    bar.appendChild(el('strong', null, (page.number || '') + '  ' + (page.title || '')));
    bar.appendChild(el('span', { className: 'out-note' }, (session.page + 1) + ' of ' + pages.length));
    var prev = button('Previous', 'btn', function () { session.page--; render(); });
    var next = button('Next', 'btn', function () { session.page++; render(); });
    if (session.page === 0) prev.disabled = true;
    if (session.page >= pages.length - 1) next.disabled = true;
    bar.appendChild(prev);
    bar.appendChild(next);
    var ready = E.readiness(session.doc, session.api.catalog || {});
    var s = session;
    bar.appendChild(exportButton('Export PDF', 'btn primary', ready, function () {
      if (s.which === 'sld') exportSld(s, ready); else exportSet(s, 'pdf', ready);
    }));
    body.appendChild(bar);
    if (session.which !== 'sld') body.appendChild(aerialToggle(session, render));
    var frame = el('div', { className: 'out-preview' });
    frame.innerHTML = Sheets.toSvg(page);
    body.appendChild(frame);
  }

  function exportSet(s, kind, ready) {
    if (!ready.ready) return;
    loadAerial(s, function () {
      var built = buildSet(s);
      var base = s.api.fileBase ? s.api.fileBase() : 'site-plan';
      if (kind === 'dxf') s.api.download(base + '-permit-' + s.size + '.dxf', 'application/dxf', Sheets.toDxf(built));
      else s.api.download(base + '-permit-' + s.size + '.pdf', 'application/pdf', Sheets.toPdf(built));
    });
  }

  function exportSld(s, ready) {
    if (!ready.ready) return;
    var built = buildSet(s);
    var pages = [];
    var i;
    for (i = 0; i < built.pages.length; i++) if (built.pages[i].number.indexOf('E-002') === 0) pages.push(built.pages[i]);
    var base = s.api.fileBase ? s.api.fileBase() : 'site-plan';
    s.api.download(base + '-single-line-' + s.size + '.pdf', 'application/pdf', Sheets.toPdf({ pages: pages }));
  }

  function close() {
    session = null;
    var dlg = $('dlg-outputs');
    if (dlg && dlg.open) dlg.close();
  }

  function bind() {
    var dlg = $('dlg-outputs');
    if (!dlg) return;
    dlg.addEventListener('close', function () { if (!dlg.open) session = null; });
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
    else bind();
  }

  var api = { open: open, panel: panel, hidePanel: hidePanel, sync: sync, isOpen: isOpen, close: close, VERSION: 'editor-v2-outputs/2' };
  root.OmegaEditorV2Outputs = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : global);
