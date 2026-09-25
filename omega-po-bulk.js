/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   omega-po-bulk.js — ONE parser for a stack of purchase orders typed or
   pasted as lines. The office PO inbox, the office phone app and the
   customer phone app all read the same sheet, so the column order lives
   here once (docs/OMEGA-LOGIC-MANUAL.md prints it). ES5; also a node module
   so scripts/test-po-bulk.js can hold it still.

   One line per product per PO:
     PO number, SKU, qty, ship-to name, address, city, state, ZIP,
     requested date (YYYY-MM-DD or M/D/YYYY, optional), notes (optional)

   How a line is read:
     - rows copied from Excel or Google Sheets arrive TAB-separated: a line
       with a tab in it is split on tabs; any other line on commas
     - "double quotes" keep a comma (or a tab, or a line break) inside one
       cell, as in a CSV file: "1200 Depot Rd, Suite 4"; "" is a quote
     - a first row of column names (PO number, SKU, qty…) is skipped
     - everything after the ninth separator is the notes, commas and all
     - a ZIP that is not a ZIP is refused rather than guessed at: it is
       what an unquoted comma in an address looks like (every column after
       it shifts one to the right). The one repair: a ZIP column a
       spreadsheet read as a NUMBER lost its leading zero (02134 is 2134),
       so three or four digits in a state whose ZIPs start with 0 get it
       back, the way api/_lib/custody.js reads a pasted site list
   Lines with the same PO number are one purchase order going to ONE place.
   A later line may leave the ship-to columns blank ("same place"), repeat
   the place's name, or fill only some of the address: what it fills is
   compared with the place already named, and only an address that differs
   is another place (a name alone never is); a PO
   number that names two different addresses is a problem that blocks
   sending, never a silent merge (it goes through "One PO to several
   sites", which carries a destination per site). What comes back is
   exactly the `pos[]` api/po-intake.js submit-many takes, plus the
   problems to fix before sending. Nothing is priced or accepted here. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.OmegaPoBulk = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var MAX_POS = 50, NEED = 8;
  var COLUMNS = ['PO number', 'SKU', 'qty', 'ship-to name', 'address', 'city', 'state', 'ZIP', 'requested date (YYYY-MM-DD)', 'notes'];
  var SEVERAL = 'One PO to several sites';
  var ZIP = /^\d{5}(-?\d{4})?$/;
  /* the states and territories whose ZIP codes start with 0 (api/_lib/custody.js ZERO_ZIP, plus the Virgin Islands and the military's Europe code) */
  var ZERO_ZIP = { CT: 1, MA: 1, ME: 1, NH: 1, NJ: 1, PR: 1, RI: 1, VT: 1, VI: 1, AE: 1, CONNECTICUT: 1, MASSACHUSETTS: 1, MAINE: 1, 'NEW HAMPSHIRE': 1, 'NEW JERSEY': 1, 'PUERTO RICO': 1, 'RHODE ISLAND': 1, VERMONT: 1, 'VIRGIN ISLANDS': 1 };
  function zeroState(v) { return ZERO_ZIP[trim(v).toUpperCase().replace(/\./g, '').replace(/\s+/g, ' ')] === 1; }
  function trim(v) { return String(v == null ? '' : v).replace(/^\s+|\s+$/g, ''); }

  /* The sheet as records: one per line, except where a "quoted cell" runs
     over a line break (a note typed in a spreadsheet cell). The separator
     is decided per line, so a row pasted from a sheet and a row typed with
     commas can sit in one paste. */
  function records(text) {
    var s = String(text || '').replace(/\r\n?/g, '\n'), out = [], i = 0, line = 1;
    while (i < s.length) {
      var nl = s.indexOf('\n', i), raw = s.slice(i, nl < 0 ? s.length : nl), sep = raw.indexOf('\t') >= 0 ? '\t' : ',';
      var cells = [], cur = '', q = false, start = line, j = i;
      for (; j < s.length; j++) {
        var ch = s.charAt(j);
        if (q) {
          if (ch === '"') { if (s.charAt(j + 1) === '"') { cur += '"'; j++; } else q = false; }
          else { if (ch === '\n') line++; cur += ch; }
        } else if (ch === '"' && !trim(cur)) { q = true; cur = ''; }
        else if (ch === sep) { cells.push(cur); cur = ''; }
        else if (ch === '\n') break;
        else cur += ch;
      }
      cells.push(cur);
      out.push({ line: start, raw: raw, sep: sep === '\t' ? 'tab' : 'comma', open: q, cells: cells.map(trim) });
      i = j + 1; line++;
    }
    return out;
  }
  function blank(r) { for (var k = 0; k < r.cells.length; k++) if (r.cells[k]) return false; return true; }
  /* A row of column names: at least two of the first three cells are the
     names of their columns (a data row with a mistyped qty is NOT one, and
     is refused by line instead). Only the first row of a sheet can be one. */
  var HEAD = [/^(po|p\.o\.|purchase order)\s*(number|no\.?|#|ref(erence)?)?$/i, /^(sku|product|item|part|model)\s*(number|no\.?|#|code)?$/i, /^(qty|quantity|units?|count)$/i];
  function header(r) {
    var hits = 0; for (var k = 0; k < HEAD.length; k++) if (HEAD[k].test(r.cells[k] || '')) hits++;
    return hits >= 2;
  }
  /* 2026-11-15, or 11/15/2026 as a US spreadsheet shows a date */
  function isoDate(v) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v), y, mo, d;
    if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
    else { m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v); if (!m) return null; mo = +m[1]; d = +m[2]; y = +m[3]; }
    var t = new Date(Date.UTC(y, mo - 1, d));
    if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return null;
    return y + '-' + (mo < 10 ? '0' : '') + mo + '-' + (d < 10 ? '0' : '') + d;
  }
  function sepWord(r) { return r.sep === 'tab' ? 'tabs' : 'commas'; }
  var PLACE = ['line1', 'city', 'state', 'zip'];
  function norm(x) { return trim(x).toLowerCase().replace(/\s+/g, ' '); }
  /* a later line is the same place when every ADDRESS field it fills agrees
     with that place; the ship-to name is a label, never an address */
  function samePlace(known, d) { return PLACE.every(function (k) { return !norm(d[k]) || norm(d[k]) === norm(known[k]); }); }

  function parse(text, opts) {
    opts = opts || {};
    var severalLabel = opts.severalSites || SEVERAL;
    var pos = {}, order = [], problems = [], first = true, skipped = false, seps = {};
    records(text).forEach(function (r) {
      if (blank(r)) return;
      var at = 'line ' + r.line + ': ';
      if (first) { first = false; if (header(r)) { skipped = true; return; } }
      seps[r.sep] = true;
      if (r.open) { problems.push(at + 'a double quote (") opens a cell and is never closed'); return; }
      var f = r.cells;
      if (f.length < NEED) {
        problems.push(at + f.length + ' column' + (f.length === 1 ? '' : 's') + ' (split on ' + sepWord(r) + '); a line needs at least ' + NEED + ': ' + COLUMNS.slice(0, NEED).join(', ')
          + (r.sep === 'comma' && f.length === 1 && /;/.test(r.raw) ? '. Separate them with commas, or paste the rows straight from the spreadsheet' : ''));
        return;
      }
      /* whatever came after the ninth separator is the notes: a comma in a
         note is kept, never cut off */
      if (f.length > COLUMNS.length) f = f.slice(0, COLUMNS.length - 1).concat([f.slice(COLUMNS.length - 1).join(r.sep === 'tab' ? ' ' : ', ')]);
      for (var k = 0; k < COLUMNS.length - 1 && k < f.length; k++) f[k] = f[k].replace(/\s*\n\s*/g, ' ');
      var no = f[0], qtyText = f[2].replace(/^(\d{1,3})((,\d{3})+)$/, function (a, h, t) { return h + t.replace(/,/g, ''); }), qty = Number(qtyText);
      if (!no) { problems.push(at + 'no PO number'); return; }
      if (!f[1]) { problems.push(at + 'no SKU'); return; }
      if (!/^\d+$/.test(qtyText) || !(qty > 0)) { problems.push(at + 'qty must be a whole number above zero (the 3rd column reads "' + f[2].slice(0, 40) + '")'); return; }
      var dest = { name: f[3], line1: f[4], city: f[5], state: f[6], zip: f[7], country: 'US' };
      /* an ADDRESS given on this line (F5): a repeated ship-to name with the address left blank is still "same place" */
      var given = !!(dest.line1 || dest.city || dest.state || dest.zip), badZip = '';
      if (/^\d{3,4}$/.test(dest.zip) && zeroState(dest.state)) dest.zip = ('00' + dest.zip).slice(-5);
      if (dest.zip && /^\d{1,4}$/.test(dest.zip)) {
        badZip = at + 'the ZIP (8th column) reads "' + dest.zip + '", and a US ZIP code has five digits. If the sheet dropped a leading zero, type all five (e.g. 0' + dest.zip + ')';
      } else if (dest.zip && !ZIP.test(dest.zip)) {
        badZip = at + 'the ZIP (8th column, split on ' + sepWord(r) + ') reads "' + dest.zip.slice(0, 40) + '", not a US ZIP code'
          + (r.sep === 'comma' ? '. A name or address with a comma in it needs double quotes ("1200 Depot Rd, Suite 4"), or paste the rows straight from the spreadsheet' : '');
      }
      /* a bad date after a bad ZIP is the same shifted line: say the cause */
      var date = '';
      if (f[8]) { date = isoDate(f[8]); if (!date) { problems.push(badZip || at + 'requested date must be YYYY-MM-DD (the 9th column reads "' + f[8].slice(0, 40) + '")'); return; } }
      var p = pos[no];
      if (!p) {
        p = pos[no] = { number: no, lines: [], destination: dest, requestedDate: date, notes: f[9] || '', places: [], dates: [] };
        order.push(no);
        if (!dest.name || !dest.line1 || !dest.city || !dest.state || !dest.zip) problems.push(at + 'PO ' + no + ' needs its ship-to name, address, city, state and ZIP on its first line');
      } else if (f[9] && ('; ' + p.notes + ';').indexOf('; ' + f[9] + ';') < 0) p.notes = p.notes ? p.notes + '; ' + f[9] : f[9];
      if (badZip) problems.push(badZip);
      if (given) {
        var known = false;
        p.places.forEach(function (pl) { if (samePlace(pl.dest, dest)) known = true; });
        if (!known) p.places.push({ dest: dest, line: r.line });
      }
      if (date && p.dates.indexOf(date) < 0) p.dates.push(date);
      if (date && !p.requestedDate) p.requestedDate = date;
      var same = null; p.lines.forEach(function (l) { if (l.sku === f[1]) same = l; });
      if (same) same.qty += qty; else p.lines.push({ sku: f[1], qty: qty });
    });
    var list = order.map(function (k) {
      var p = pos[k];
      if (p.places.length > 1) problems.push('PO ' + p.number + ' has ' + p.places.length + ' ship-to addresses (lines ' + p.places.map(function (pl) { return pl.line; }).join(', ') + '). One PO number goes to one place on this sheet: send it with “' + severalLabel + '”, or give each address its own PO number.');
      if (p.dates.length > 1) problems.push('PO ' + p.number + ' asks for ' + p.dates.length + ' requested dates (' + p.dates.join(', ') + '). One PO number has one date on this sheet: use one date, or send it with “' + severalLabel + '”.');
      return { number: p.number, lines: p.lines, destination: p.destination, requestedDate: p.requestedDate, notes: p.notes };
    });
    if (list.length > MAX_POS) problems.push('at most ' + MAX_POS + ' purchase orders at a time');
    return { pos: list, problems: problems, header: skipped, separator: seps.tab && seps.comma ? 'mixed' : seps.tab ? 'tab' : 'comma' };
  }
  /* The one-line summary every entry screen shows under the textarea. */
  function summary(r) {
    var lines = r.pos.reduce(function (t, p) { return t + p.lines.length; }, 0);
    return (r.pos.length ? r.pos.length + ' purchase order' + (r.pos.length === 1 ? '' : 's') + ', ' + lines + ' line' + (lines === 1 ? '' : 's') + (r.header ? ' (header row skipped)' : '') : 'Paste or type lines above.')
      + (r.problems.length ? ' · ' + r.problems.join(' · ') : '');
  }
  /* A PO number with several ship-to addresses: the entry screens point at
     the several-sites route beside the message. */
  function several(r) { return r.problems.some(function (p) { return / ship-to addresses \(lines /.test(p); }); }
  function ready(r) { return r.pos.length > 0 && !r.problems.length; }
  return { parse: parse, summary: summary, ready: ready, several: several, MAX_POS: MAX_POS, COLUMNS: COLUMNS, SEVERAL: SEVERAL };
}));
