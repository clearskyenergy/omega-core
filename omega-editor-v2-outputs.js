/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * omega-editor-v2-outputs.js — the one Outputs place.
 *
 * Ready or not ready, then preview or export. The checks, the code
 * sections and the schedules are on the sheets, not on the canvas.
 */
(function (root) {
  'use strict';

  var E = root.OmegaEditorV2Electrical;
  var Sheets = root.OmegaEditorV2Sheets;
  var session = null;

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

  function buildSet() {
    return Sheets.build(session.doc, {
      size: session.size,
      date: today(),
      catalog: session.api.catalog || {},
      underlay: session.underlay || null,
      aerialUnavailable: !!session.aerialUnavailable
    });
  }

  function aerialOn() {
    return !(session.doc.drawing && session.doc.drawing.aerial === false);
  }

  function setAerial(on) {
    session.doc.drawing = session.doc.drawing || {};
    session.doc.drawing.aerial = !!on;
    session.underlay = null;
    session.aerialUnavailable = false;
    if (on) loadAerial();
    else render();
  }

  function loadAerial() {
    var A = root.OmegaEditorV2Aerial;
    if (!session || !A || !A.wanted(session.doc)) return;
    var token = {};
    session.aerialToken = token;
    A.fetchImage(session.doc, function (err, img) {
      if (!session || session.aerialToken !== token) return;
      if (err || !img) session.aerialUnavailable = true;
      else session.underlay = img;
      render();
    });
  }

  function open(api) {
    var which = api.which === 'sld' ? 'sld' : (api.which === 'set' ? 'set' : 'list');
    session = {
      api: api,
      doc: api.doc,
      mode: which === 'list' ? 'list' : 'preview',
      page: 0,
      which: which === 'sld' ? 'sld' : 'set',
      size: 'ansi-d',
      underlay: null,
      aerialUnavailable: false
    };
    render();
    var dlg = $('dlg-outputs');
    if (dlg && !dlg.open) dlg.showModal();
    if (aerialOn()) loadAerial();
  }

  function sync(doc) {
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
    var ready = E.readiness(session.doc, session.api.catalog || {});
    body.appendChild(el('h2', { id: 'out-title' }, 'Outputs'));
    var status = el('p', { className: 'out-status ' + (ready.ready ? 'is-ok' : 'is-no') }, ready.summary);
    body.appendChild(status);

    var sizeRow = el('div', { className: 'out-size' });
    sizeRow.appendChild(el('label', { for: 'out-size' }, 'Sheet size'));
    var select = el('select', { id: 'out-size', 'aria-label': 'Sheet size' });
    var sizes = Sheets.SIZES, key, opt;
    for (key in sizes) if (sizes.hasOwnProperty(key)) {
      opt = el('option', { value: key }, sizes[key].name);
      if (key === session.size) opt.selected = true;
      select.appendChild(opt);
    }
    select.addEventListener('change', function () { session.size = select.value; });
    sizeRow.appendChild(select);
    body.appendChild(sizeRow);
    body.appendChild(aerialToggle());

    body.appendChild(row('Permit plan set', 'The cover, the site plan, the single-line, the schedules and the checks.', ready, function () {
      session.which = 'set'; session.page = 0; session.mode = 'preview'; render();
    }, function (kind) { exportSet(kind, ready); }));

    body.appendChild(row('Single-line diagram', 'The same diagram as sheet E-002, on its own.', ready, function () {
      session.which = 'sld'; session.page = 0; session.mode = 'preview'; render();
    }, function () { exportSld(ready); }));

    var files = el('div', { className: 'out-row' });
    var copy = el('div');
    copy.appendChild(el('h3', null, 'Drawing file'));
    copy.appendChild(el('p', { className: 'out-note' }, 'The linework, without the permit set.'));
    files.appendChild(copy);
    var actions = el('div', { className: 'out-actions' });
    var drawing = session.api.drawing || {};
    actions.appendChild(fileButton('PNG', drawing.png));
    actions.appendChild(fileButton('PDF', drawing.pdf));
    actions.appendChild(fileButton('DXF', drawing.dxf));
    actions.appendChild(fileButton('Project', drawing.json));
    actions.appendChild(fileButton('Import', drawing.importFile));
    files.appendChild(actions);
    body.appendChild(files);

    var foot = el('div', { className: 'row-actions' });
    foot.appendChild(button('Close', 'btn', function () { close(); }));
    body.appendChild(foot);
  }

  function row(title, note, ready, onPreview, onExport) {
    var line = el('div', { className: 'out-row' });
    var copy = el('div');
    copy.appendChild(el('h3', null, title));
    copy.appendChild(el('p', { className: 'out-note' }, note));
    line.appendChild(copy);
    var actions = el('div', { className: 'out-actions' });
    actions.appendChild(button('Preview', 'btn', onPreview));
    var exp = button('Export', 'btn primary', function () { onExport('pdf'); });
    var dxf = button('DXF', 'btn', function () { onExport('dxf'); });
    if (!ready.ready) {
      exp.disabled = true;
      dxf.disabled = true;
      exp.title = ready.summary;
      dxf.title = ready.summary;
    }
    actions.appendChild(exp);
    if (title.indexOf('Permit') === 0) actions.appendChild(dxf);
    line.appendChild(actions);
    return line;
  }

  function aerialToggle() {
    var A = root.OmegaEditorV2Aerial;
    var row = el('div', { className: 'out-size' });
    var hasAnchor = session.doc.anchor && isFinite(+session.doc.anchor.lat);
    if (!hasAnchor) {
      row.appendChild(el('p', { className: 'out-note' }, 'No site point is on the project, so the plot plan has no aerial photo.'));
      return row;
    }
    var box = el('input', { type: 'checkbox', id: 'out-aerial', 'aria-label': 'Aerial photo on the site plan' });
    box.checked = aerialOn();
    box.addEventListener('change', function () { setAerial(box.checked); });
    row.appendChild(box);
    row.appendChild(el('span', null, 'Aerial photo on the site plan'));
    var note = session.underlay
      ? ('Imagery: ' + (A && A.ATTRIBUTION ? A.ATTRIBUTION : 'U.S. Geological Survey') + '.')
      : (session.aerialUnavailable ? 'Aerial imagery was not available.' : (box.checked ? 'The photo is loading.' : 'The photo is off. The plan stays linework.'));
    row.appendChild(el('p', { className: 'out-note' }, note));
    return row;
  }

  function fileButton(label, fn) {
    return button(label, 'btn', function () { if (fn) fn(); });
  }

  function button(label, className, fn) {
    var b = el('button', { type: 'button', className: className }, label);
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
    var built = buildSet();
    var pages = pagesFor(built);
    if (session.page >= pages.length) session.page = pages.length - 1;
    if (session.page < 0) session.page = 0;
    var page = pages[session.page];
    var bar = el('div', { className: 'out-bar' });
    bar.appendChild(button('Back', 'btn', function () { session.mode = 'list'; render(); }));
    bar.appendChild(el('strong', null, (page.number || '') + '  ' + (page.title || '')));
    bar.appendChild(el('span', { className: 'out-note' }, (session.page + 1) + ' of ' + pages.length));
    var prev = button('Previous', 'btn', function () { session.page--; render(); });
    var next = button('Next', 'btn', function () { session.page++; render(); });
    if (session.page === 0) prev.disabled = true;
    if (session.page >= pages.length - 1) next.disabled = true;
    bar.appendChild(prev);
    bar.appendChild(next);
    body.appendChild(bar);
    if (session.which !== 'sld') body.appendChild(aerialToggle());
    var frame = el('div', { className: 'out-preview' });
    frame.innerHTML = Sheets.toSvg(page);
    body.appendChild(frame);
  }

  function exportSet(kind, ready) {
    if (!ready.ready) return;
    var built = buildSet();
    var base = session.api.fileBase ? session.api.fileBase() : 'site-plan';
    if (kind === 'dxf') session.api.download(base + '-permit-' + session.size + '.dxf', 'application/dxf', Sheets.toDxf(built));
    else session.api.download(base + '-permit-' + session.size + '.pdf', 'application/pdf', Sheets.toPdf(built));
  }

  function exportSld(ready) {
    if (!ready.ready) return;
    var built = buildSet();
    var pages = [];
    var i;
    for (i = 0; i < built.pages.length; i++) if (built.pages[i].number.indexOf('E-002') === 0) pages.push(built.pages[i]);
    var base = session.api.fileBase ? session.api.fileBase() : 'site-plan';
    session.api.download(base + '-single-line-' + session.size + '.pdf', 'application/pdf', Sheets.toPdf({ pages: pages }));
  }

  function close() {
    session = null;
    var dlg = $('dlg-outputs');
    if (dlg && dlg.open) dlg.close();
  }

  function bind() {
    var dlg = $('dlg-outputs');
    if (!dlg) return;
    dlg.addEventListener('close', function () { session = null; });
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
    else bind();
  }

  var api = { open: open, sync: sync, isOpen: isOpen, close: close, VERSION: 'editor-v2-outputs/1' };
  root.OmegaEditorV2Outputs = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : global);
