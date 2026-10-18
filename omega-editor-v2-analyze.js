/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * What the drawing supports, in the side panel. Project Intelligence is
 * omega-project-intelligence.js. A value stack, a circuit verdict, and a
 * weather run are shown only when one is already stored. This file does
 * not dispatch, price, or score a feeder.
 */
(function (root) {
  'use strict';

  var PI = root.OmegaProjectIntelligence;

  function num(v) { var n = +v; return isFinite(n) ? n : 0; }

  function factsFrom(doc, summary) {
    doc = doc || {};
    summary = summary || {};
    var placed = 0, conduits = 0, derKw = 0, i, e;
    var list = doc.entities || [];
    for (i = 0; i < list.length; i++) {
      e = list[i];
      if (e.type === 'conduit') conduits++;
      if (e.type === 'equip' || e.type === 'array' || e.type === 'polygon' || e.type === 'rect' || e.type === 'obstruction') placed++;
      if (e.derKw > 0) derKw += +e.derKw;
    }
    return {
      name: doc.name || '',
      address: doc.address || '',
      bessKw: num(summary.bessKw),
      bessKwh: num(summary.bessKwh),
      solarKw: num(summary.solarKwDc),
      solarKwAc: num(summary.solarKwAc),
      chargerCount: num(summary.chargerCount),
      chargerKw: num(summary.chargerKw),
      placedCount: placed,
      conduitCount: conduits,
      derKw: derKw,
      cost: num(doc.costTotal),
      revenue: num(doc.revenueYear1),
      net: num(doc.netCost) || num(doc.costTotal),
      site: doc.siteScreen || null,
      designVerified: !!doc.designVerified,
      billKwh: doc.billKwh != null && doc.billKwh !== '' ? num(doc.billKwh) : null,
      billName: doc.billName || '',
      valueStack: doc.valueStack || null,
      grid: doc.grid || null,
      milestones: doc.milestones || null,
      costLines: doc.costLines || null
    };
  }

  function assess(doc, summary) {
    PI = PI || root.OmegaProjectIntelligence;
    return PI.assess(factsFrom(doc, summary));
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function block(host, title) {
    var b = el('section', 'quiet-block');
    b.appendChild(el('h3', null, title));
    host.appendChild(b);
    return b;
  }

  function show(state) {
    if (typeof document === 'undefined') return;
    var host = document.getElementById('analyze-body');
    if (!host) return;
    var D = root.OmegaEditorV2Doc;
    var facts = factsFrom(state.doc, D.summary(state.doc));
    var x = (PI || root.OmegaProjectIntelligence).assess(facts);
    host.innerHTML = '';

    var decision = block(host, 'Project intelligence');
    var score = el('div', 'score-num', x.decision);
    decision.appendChild(score);
    decision.appendChild(el('p', null, x.score + ' / 100. Readiness 45%, site quality 35%, economics 20%.'));
    if (!facts.site) decision.appendChild(el('p', null, 'Site quality is waiting on the site screen, so those 35 points are not in this score.'));
    else if (!facts.site.anyReal) decision.appendChild(el('p', null, 'The site screen is on file and it is still an estimate. Nothing in it is backed by project data yet.'));
    var list = el('div', null, '');
    var i, c, row;
    for (i = 0; i < x.checks.length; i++) {
      c = x.checks[i];
      row = el('p', null, (c.ok ? 'Yes — ' : 'Not yet — ') + c.n + '. ' + c.d);
      list.appendChild(row);
    }
    decision.appendChild(list);
    decision.appendChild(el('p', null, 'Source: the drawing, plus a site screen and a cost only when the project has them.'));

    var vs = block(host, 'Value stack');
    if (facts.bessKw <= 0) vs.appendChild(el('p', null, 'Place a battery to size a value stack. There is not one on the drawing.'));
    else vs.appendChild(el('p', null, facts.bessKw + ' kW / ' + facts.bessKwh + ' kWh on the drawing.'));
    if (facts.valueStack && facts.valueStack.streams && facts.valueStack.streams.length) {
      var max = 0, s;
      for (i = 0; i < facts.valueStack.streams.length; i++) if (+facts.valueStack.streams[i].usd > max) max = +facts.valueStack.streams[i].usd;
      for (i = 0; i < facts.valueStack.streams.length; i++) {
        s = facts.valueStack.streams[i];
        var bar = el('div', 'stream', (s.name || 'Stream') + '  $' + Math.round(+s.usd || 0).toLocaleString());
        var fill = el('i', 'stream-fill');
        fill.style.width = (max > 0 ? Math.round((+s.usd || 0) / max * 100) : 0) + '%';
        bar.appendChild(fill);
        vs.appendChild(bar);
      }
      vs.appendChild(el('p', null, 'Source: ' + (facts.valueStack.source || 'the value-stack run stored on this project') + '.'));
    } else vs.appendChild(el('p', null, 'No dispatch is stored. Revenue streams are computed on the server and then kept on the project.'));

    var grid = block(host, 'Grid check');
    var designKw = facts.bessKw + facts.chargerKw;
    grid.appendChild(el('p', null, 'Equipment on the drawing asks for ' + Math.round(designKw) + ' kW.'));
    if (facts.grid && facts.grid.verdict) {
      grid.appendChild(el('p', null, String(facts.grid.verdict)));
      grid.appendChild(el('p', null, 'Source: the grid verdict stored on this project.'));
    } else grid.appendChild(el('p', null, 'No circuit verdict is stored. Grid check runs on the server from the site point and this equipment.'));

    var bill = block(host, 'Bill');
    if (facts.billName) bill.appendChild(el('p', null, 'File noted: ' + facts.billName + '.'));
    if (facts.billKwh != null) bill.appendChild(el('p', null, 'Annual use entered from the bill: ' + Math.round(facts.billKwh).toLocaleString() + ' kWh.'));
    else bill.appendChild(el('p', null, 'No usage figure from a bill yet.'));
    var kwhLabel = el('label', 'field', 'Annual kWh from the bill');
    var kwhInput = document.createElement('input');
    kwhInput.type = 'number';
    kwhInput.min = '0';
    kwhInput.id = 'bill-kwh';
    if (facts.billKwh != null) kwhInput.value = String(facts.billKwh);
    kwhLabel.appendChild(kwhInput);
    bill.appendChild(kwhLabel);
    var fileLabel = el('label', 'field', 'Bill file');
    var file = document.createElement('input');
    file.type = 'file';
    file.id = 'bill-file';
    file.accept = '.pdf,.csv,.txt,application/pdf';
    fileLabel.appendChild(file);
    bill.appendChild(fileLabel);
    bill.appendChild(el('p', null, 'The file name is kept on the project. The tariff is read on the server, not in this panel.'));

    var gen = block(host, 'Generation');
    gen.appendChild(el('p', null, (facts.solarKw || 0) + ' kW-DC on the drawing' + (facts.solarKwAc ? (', about ' + facts.solarKwAc + ' kW-AC.') : '.')));
    gen.appendChild(el('p', null, 'Source: the arrays on the drawing. An annual kWh figure needs a weather run, and none is stored here.'));
    if (facts.billKwh != null && facts.solarKw > 0) {
      gen.appendChild(el('p', null, 'The bill\'s annual use is ' + Math.round(facts.billKwh).toLocaleString() + ' kWh. Solar kWh is not estimated from the nameplate.'));
    }
  }

  function readBill(state, done) {
    var input = document.getElementById('bill-kwh');
    var file = document.getElementById('bill-file');
    var fields = {};
    if (input && input.value !== '') fields.billKwh = +input.value;
    if (file && file.files && file.files[0]) fields.billName = file.files[0].name;
    if (!Object.keys(fields).length) { if (done) done(false); return; }
    root.OmegaEditorV2Doc.setMeta(state, fields);
    if (done) done(true);
  }

  function showOutputs(state) {
    if (typeof document === 'undefined') return;
    var host = document.getElementById('outputs-body');
    if (!host) return;
    var R = root.OmegaEditorV2Reports;
    host.innerHTML = '';
    host.appendChild(el('p', null, 'Each report is built from the drawing as it is now. A figure that is not on the drawing is left blank.'));
    var list = R.list(), i, btn;
    for (i = 0; i < list.length; i++) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn';
      btn.textContent = list[i].title;
      btn.setAttribute('data-report', list[i].id);
      btn.addEventListener('click', function () { download(state, this.getAttribute('data-report')); });
      host.appendChild(btn);
    }
  }

  function download(state, kind) {
    var D = root.OmegaEditorV2Doc;
    var R = root.OmegaEditorV2Reports;
    var facts = factsFrom(state.doc, D.summary(state.doc));
    var built = R.build(kind, facts, state.doc);
    if (!built) return;
    var blob = new Blob([built.pdf], { type: 'application/pdf' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = built.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function showFunding(state) {
    if (typeof document === 'undefined') return;
    var host = document.getElementById('funding-body');
    if (!host) return;
    var D = root.OmegaEditorV2Doc;
    var facts = factsFrom(state.doc, D.summary(state.doc));
    var gate = (PI || root.OmegaProjectIntelligence).fundingReadiness(facts);
    host.innerHTML = '';
    var b = block(host, 'Funding');
    b.appendChild(el('div', 'score-num', gate.decision));
    b.appendChild(el('p', null, gate.score + ' / 100 from the drawing. The marketplace uses this same score.'));
    b.appendChild(el('p', null, gate.ready ? 'The score clears the pursue line.' : 'The score is not at the pursue line yet.'));
    var send = document.createElement('button');
    send.type = 'button';
    send.className = 'btn primary';
    send.id = 'btn-funding-send';
    send.textContent = 'Send to funding';
    send.addEventListener('click', function () {
      var H = root.OmegaEditorV2Hooks;
      var ctx = { doc: state.doc, facts: facts, readiness: gate };
      if (H && H.invoke('funding', ctx)) return;
      var status = document.getElementById('status');
      if (status) status.textContent = 'Funding uses the marketplace submission. Nothing is attached to this button yet.';
    });
    b.appendChild(send);
  }

  var api = {
    factsFrom: factsFrom,
    assess: function (state) {
      var D = root.OmegaEditorV2Doc;
      return assess(state.doc, D.summary(state.doc));
    },
    show: show,
    showOutputs: showOutputs,
    showFunding: showFunding,
    readBill: readBill,
    download: download,
    VERSION: 'editor-v2-analyze/1'
  };
  root.OmegaEditorV2Analyze = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : global);
