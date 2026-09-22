/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   omega-po-bulk.js — ONE parser for a stack of purchase orders typed or
   pasted as lines. The office PO inbox, the office phone app and the
   customer phone app all read the same sheet, so the column order lives
   here once (docs/OMEGA-LOGIC-MANUAL.md prints it). ES5; also a node module
   so scripts/test-po-bulk.js can hold it still.

   One line per product per PO, comma-separated:
     PO number, SKU, qty, ship-to name, address, city, state, ZIP,
     requested date (YYYY-MM-DD, optional), notes (optional)
   Lines with the same PO number are one purchase order going to one place
   (the first line's destination wins). What comes back is exactly the
   `pos[]` api/po-intake.js submit-many takes, plus the problems to fix
   before sending. Nothing is priced or accepted here. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.OmegaPoBulk = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var MAX_POS = 50;
  var COLUMNS = ['PO number', 'SKU', 'qty', 'ship-to name', 'address', 'city', 'state', 'ZIP', 'requested date (YYYY-MM-DD)', 'notes'];
  function parse(text) {
    var pos = {}, order = [], problems = [];
    String(text || '').split(/\r?\n/).forEach(function (line, i) {
      if (!line.trim()) return;
      var f = line.split(',').map(function (x) { return x.trim(); });
      if (f.length < 8) { problems.push('line ' + (i + 1) + ': needs at least PO number, SKU, qty, ship-to name, address, city, state, ZIP'); return; }
      var no = f[0], qty = Number(f[2]);
      if (!no) { problems.push('line ' + (i + 1) + ': no PO number'); return; }
      if (!f[1]) { problems.push('line ' + (i + 1) + ': no SKU'); return; }
      if (!(qty > 0) || qty !== Math.floor(qty)) { problems.push('line ' + (i + 1) + ': qty must be a whole number above zero'); return; }
      if (f[8] && !/^\d{4}-\d{2}-\d{2}$/.test(f[8])) { problems.push('line ' + (i + 1) + ': requested date must be YYYY-MM-DD'); return; }
      if (!pos[no]) {
        pos[no] = { number: no, lines: [], destination: { name: f[3], line1: f[4], city: f[5], state: f[6], zip: f[7], country: 'US' }, requestedDate: f[8] || '', notes: f[9] || '' };
        order.push(no);
      }
      var same = null; pos[no].lines.forEach(function (l) { if (l.sku === f[1]) same = l; });
      if (same) same.qty += qty; else pos[no].lines.push({ sku: f[1], qty: qty });
    });
    if (order.length > MAX_POS) problems.push('at most ' + MAX_POS + ' purchase orders at a time');
    return { pos: order.map(function (k) { return pos[k]; }), problems: problems };
  }
  /* The one-line summary every entry screen shows under the textarea. */
  function summary(r) {
    var lines = r.pos.reduce(function (t, p) { return t + p.lines.length; }, 0);
    return (r.pos.length ? r.pos.length + ' purchase order' + (r.pos.length === 1 ? '' : 's') + ', ' + lines + ' line' + (lines === 1 ? '' : 's') : 'Paste or type lines above.')
      + (r.problems.length ? ' · ' + r.problems.join(' · ') : '');
  }
  function ready(r) { return r.pos.length > 0 && !r.problems.length; }
  return { parse: parse, summary: summary, ready: ready, MAX_POS: MAX_POS, COLUMNS: COLUMNS };
}));
