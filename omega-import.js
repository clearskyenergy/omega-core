/* omega-import.js — a spreadsheet of sites becomes projects, visibly.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   ES5, no build step, no dependencies of its own. The host page supplies
   SheetJS (already pinned at cdnjs 0.18.5 in intake.html) and the function
   that actually writes a row. Core, not a tenant file: any tenant that can
   create a record can import a hundred of them.

   ── NOTHING IS WRITTEN UNTIL HE HAS SEEN IT ──
   A hundred rows arrive from someone else's export, and six of them will be
   wrong in ways nobody anticipated. All-or-nothing punishes 94 good sites for
   one typo; import-and-report leaves a partial state nobody approved and six
   rows nobody returns to. So parse and validate write NOTHING: they produce a
   report, the report is shown, and only then does a commit happen. It is the
   same shape as the stage gate in portfolio-data.js, which returns WHICH
   fields are missing rather than failing one at a time.

   ── ONE REQUIRED COLUMN ──
   `name`. That is all. portfolio-data.js argues the case better than this
   comment can: "Requiring a number people do not have gets a guess typed in
   to clear the gate, which is worse than no number at all, because a guess
   looks like a decision afterwards." A partner's export will not carry our
   field names, and demanding them produces a spreadsheet of invented values.
   Attribution (who brought it) comes from the TAB being imported into, never
   from the file — asking a sheet to repeat "Francis Energy" a hundred times
   is a hundred chances to spell it differently.

   ── external_id IS THE MOST IMPORTANT COLUMN NOBODY THINKS ABOUT ──
   Francis sends a corrected file next week. Without a stable id from their
   side, that is not a correction, it is a second hundred sites, and no way to
   say which hundred is current. With one, the same row updates in place. A
   file without the column still imports; it warns first, loudly, because the
   consequence lands a week later when nobody is looking.

   ── EVERY IMPORT IS ONE UNDOABLE EVENT ──
   Rows carry the batch id they arrived in. Reversing a bad import is then one
   action against one field, rather than picking a hundred records out of a
   collection by hand.

     OmegaImport.open({
       file: fileFromInput,
       spec: OmegaImport.PROJECT_SPEC,
       existing: dealsArray,          // for cross-file duplicate detection
       label: 'Francis Energy',
       commit: function (rows, batchId) { return Promise.all(rows.map(create)); }
     });
   ═══════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OmegaImport = factory();
}(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  /* ── the contract ─────────────────────────────────────────────────────── */

  var KINDS = ['bess', 'solar', 'ev', 'microgrid', 'datacenter'];
  var KIND_ALIAS = {
    battery: 'bess', storage: 'bess', bess: 'bess', 'battery storage': 'bess',
    solar: 'solar', pv: 'solar', 'solar pv': 'solar',
    ev: 'ev', evse: 'ev', charging: 'ev', 'ev charging': 'ev', dcfc: 'ev',
    microgrid: 'microgrid', 'micro grid': 'microgrid',
    datacenter: 'datacenter', 'data center': 'datacenter', compute: 'datacenter',
    dc: 'datacenter'
  };

  /* Header synonyms. A partner exports "Site Name", "MW", "CapEx ($)"; nobody
     is going to rename their columns to ours, and a strict header match just
     moves the failure earlier. */
  var HEADERS = {
    name:          ['name', 'site name', 'site', 'project', 'project name', 'title'],
    external_id:   ['external id', 'externalid', 'id', 'ref', 'reference', 'site id',
                    'site ref', 'their id', 'partner id'],
    address:       ['address', 'site address', 'street', 'location'],
    state:         ['state', 'st', 'province'],
    kind:          ['kind', 'type', 'technology', 'tech', 'asset type', 'what'],
    size_mw:       ['size mw', 'mw', 'capacity mw', 'capacity', 'power mw', 'size'],
    size_mwh:      ['size mwh', 'mwh', 'energy mwh', 'storage mwh', 'duration mwh'],
    capex_usd:     ['capex usd', 'capex', 'cost', 'capex $', 'total cost', 'budget'],
    requested_usd: ['requested usd', 'requested', 'funding requested', 'capital sought',
                    'ask', 'financing requested'],
    contact_name:  ['contact name', 'contact', 'owner', 'site contact'],
    contact_email: ['contact email', 'email', 'e-mail', 'contact e-mail'],
    client_org:    ['client org', 'client', 'customer', 'end customer', 'host'],
    notes:         ['notes', 'note', 'comment', 'comments', 'description']
  };

  var PROJECT_SPEC = {
    required: ['name'],
    dedupe: 'external_id',
    fields: {
      name:          { type: 'text',  max: 200 },
      external_id:   { type: 'text',  max: 80 },
      address:       { type: 'text',  max: 300 },
      state:         { type: 'state' },
      kind:          { type: 'enum',  values: KINDS, alias: KIND_ALIAS },
      size_mw:       { type: 'number', min: 0 },
      size_mwh:      { type: 'number', min: 0 },
      capex_usd:     { type: 'money', min: 0 },
      requested_usd: { type: 'money', min: 0 },
      contact_name:  { type: 'text',  max: 120 },
      contact_email: { type: 'email' },
      client_org:    { type: 'text',  max: 120 },
      notes:         { type: 'text',  max: 2000 }
    }
  };

  /* ── coercion ─────────────────────────────────────────────────────────── */

  function norm(s) {
    return String(s == null ? '' : s).toLowerCase()
      .replace(/[_\-]+/g, ' ').replace(/[^a-z0-9 $]/g, '').replace(/\s+/g, ' ').trim();
  }

  function mapHeaders(headers) {
    var out = {}, used = {};
    for (var i = 0; i < headers.length; i++) {
      var h = norm(headers[i]);
      if (!h) continue;
      for (var key in HEADERS) {
        if (used[key]) continue;
        var syn = HEADERS[key];
        for (var j = 0; j < syn.length; j++) {
          if (h === syn[j]) { out[i] = key; used[key] = true; break; }
        }
        if (out[i]) break;
      }
    }
    return out;
  }

  /* "~5MW", "5 MW", "$1,200,000", "1.2m" — a partner's sheet is prose with
     numbers in it. Anything genuinely ambiguous is REFUSED rather than
     guessed: "~5" is someone saying they do not know, and recording 5 as if
     they did is the guess-as-decision problem again. */
  function number(raw, money) {
    var s = String(raw == null ? '' : raw).trim();
    if (!s) return { ok: true, value: null };
    /* Anything hedged or ranged is REFUSED. Caught in testing: "5-10" came
       through as 5 and "about 5" came through as 5, because the range test
       only knew about en/em dashes and nothing tested for prose. A hedge
       recorded as a fact is the exact failure this module exists to stop —
       the person wrote "5-10" precisely because they do not know. */
    if (/^[~≈><]/.test(s)
        || /\d\s*[-–—]\s*\d/.test(s)
        || /\bto\b/.test(s) || /\+/.test(s.replace(/e[+-]?\d+/i, ''))
        || /\b(about|approx|approximately|around|circa|est|estimated|up\s+to|at\s+least|max|min|tbc)\b/i.test(s))
      return { ok: false, why: '"' + s + '" is approximate or a range — import it blank and set it later' };
    /* A clean numeric literal, exponent included, is taken as written —
       SheetJS hands most numbers over as numbers, but a text-formatted cell
       arrives as "1.5e3" and the unit-suffix matcher below reads that as 1. */
    var plain = s.replace(/[,$\s]/g, '');
    if (/^-?\d*\.?\d+(e[+-]?\d+)?$/i.test(plain))
      return { ok: true, value: parseFloat(plain) };
    var mult = 1, m = s.match(/([\d.,]+)\s*([kmb])?\b/i);
    if (!m) return { ok: false, why: '"' + s + '" is not a number' };
    if (m[2]) mult = { k: 1e3, m: 1e6, b: 1e9 }[m[2].toLowerCase()];
    var n = parseFloat(m[1].replace(/,/g, ''));
    if (!isFinite(n)) return { ok: false, why: '"' + s + '" is not a number' };
    if (money && /[kmb]/i.test(s) === false && /^\s*\$?[\d.,]+\s*$/.test(s) === false && !m[2])
      { /* a trailing unit like MW on a money column is odd but not fatal */ }
    return { ok: true, value: n * mult };
  }

  function nearest(v, list) {
    var best = null, bd = 99;
    for (var i = 0; i < list.length; i++) {
      var d = lev(v, list[i]);
      if (d < bd) { bd = d; best = list[i]; }
    }
    return bd <= 2 ? best : null;
  }
  function lev(a, b) {
    var m = a.length, n = b.length, d = [], i, j;
    for (i = 0; i <= m; i++) d[i] = [i];
    for (j = 0; j <= n; j++) d[0][j] = j;
    for (i = 1; i <= m; i++) for (j = 1; j <= n; j++)
      d[i][j] = Math.min(d[i-1][j] + 1, d[i][j-1] + 1,
                         d[i-1][j-1] + (a.charAt(i-1) === b.charAt(j-1) ? 0 : 1));
    return d[m][n];
  }

  function coerce(key, raw, spec) {
    var f = spec.fields[key] || { type: 'text' };
    var s = String(raw == null ? '' : raw).trim();
    if (!s) return { ok: true, value: '' };
    if (f.type === 'number') return number(s, false);
    if (f.type === 'money')  return number(s, true);
    if (f.type === 'email') {
      if (!/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(s))
        return { ok: false, why: '"' + s + '" is not an email address' };
      return { ok: true, value: s.toLowerCase() };
    }
    if (f.type === 'state') {
      var t = s.toUpperCase().replace(/[^A-Z]/g, '');
      return { ok: true, value: t.length === 2 ? t : s };
    }
    if (f.type === 'enum') {
      var k = norm(s), a = f.alias && f.alias[k];
      if (a) return { ok: true, value: a };
      if (f.values.indexOf(k) >= 0) return { ok: true, value: k };
      var guess = nearest(k, f.values.concat(Object.keys(f.alias || {})));
      return { ok: false, why: '"' + s + '" is not a known type'
               + (guess ? ' — did you mean ' + ((f.alias && f.alias[guess]) || guess) + '?' : '') };
    }
    if (f.max && s.length > f.max) s = s.slice(0, f.max);
    return { ok: true, value: s };
  }

  /* ── the report ───────────────────────────────────────────────────────── */

  function validate(table, spec, existing) {
    spec = spec || PROJECT_SPEC;
    var headers = table.headers || [], rows = table.rows || [];
    var map = mapHeaders(headers);
    var unmapped = [];
    for (var h = 0; h < headers.length; h++)
      if (!map[h] && String(headers[h] || '').trim()) unmapped.push(headers[h]);

    var seen = {}, existingIds = {};
    (existing || []).forEach(function (d) {
      var id = d && (d.intakeId || d.external_id);
      if (id) existingIds[String(id).toLowerCase()] = d;
    });

    var ready = [], problems = [], i, j;
    for (i = 0; i < rows.length; i++) {
      var raw = rows[i], rec = {}, why = [];
      for (j = 0; j < headers.length; j++) {
        var key = map[j];
        if (!key) continue;
        var c = coerce(key, raw[j], spec);
        if (!c.ok) why.push(key + ': ' + c.why);
        else if (c.value !== '' && c.value !== null) rec[key] = c.value;
      }
      for (j = 0; j < spec.required.length; j++)
        if (!rec[spec.required[j]]) why.push(spec.required[j] + ' is empty');

      var id = rec[spec.dedupe] ? String(rec[spec.dedupe]).toLowerCase() : '';
      if (id && seen[id] !== undefined)
        why.push('duplicate ' + spec.dedupe + ' "' + rec[spec.dedupe]
                 + '" — also on row ' + (seen[id] + 2));
      if (id) seen[id] = i;

      var row = { row: i + 2, rec: rec, why: why };   /* +2: header is row 1 */
      if (id && existingIds[id]) { row.updates = existingIds[id]; }
      if (why.length) problems.push(row); else ready.push(row);
    }
    return {
      ready: ready, problems: problems, unmapped: unmapped,
      mapped: (function () { var o = []; for (var k in map) o.push(map[k]); return o; })(),
      hasDedupe: (function () { for (var k in map) if (map[k] === spec.dedupe) return true; return false; })(),
      updating: ready.filter(function (r) { return r.updates; }).length
    };
  }

  /* ── parsing ──────────────────────────────────────────────────────────── */

  function parse(file) {
    return new Promise(function (res, rej) {
      if (typeof XLSX === 'undefined')
        return rej(new Error('The spreadsheet reader did not load. Reload the page.'));
      var r = new FileReader();
      r.onerror = function () { rej(new Error('That file could not be read.')); };
      r.onload = function () {
        try {
          var wb = XLSX.read(new Uint8Array(r.result), { type: 'array' });
          var sh = wb.Sheets[wb.SheetNames[0]];
          var aoa = XLSX.utils.sheet_to_json(sh, { header: 1, blankrows: false, defval: '' });
          /* The header is the first row with two or more non-empty cells: real
             exports open with a title row, a logo, or an empty line. */
          var hi = 0;
          for (var i = 0; i < Math.min(aoa.length, 10); i++) {
            var filled = aoa[i].filter(function (c) { return String(c).trim(); }).length;
            if (filled >= 2) { hi = i; break; }
          }
          res({ headers: aoa[hi] || [], rows: aoa.slice(hi + 1),
                sheet: wb.SheetNames[0], sheets: wb.SheetNames });
        } catch (e) { rej(new Error('That did not read as a spreadsheet: ' + e.message)); }
      };
      r.readAsArrayBuffer(file);
    });
  }

  function batchId() {
    return 'imp_' + Date.now().toString(36) + '_' +
           Math.random().toString(36).slice(2, 7);
  }

  /* ── the preview ──────────────────────────────────────────────────────── */

  var CSS_ID = 'omega-import-css';
  var CSS = ''
    + '.oim-scrim{position:fixed;inset:0;background:rgba(15,20,26,.55);z-index:9100;'
    +   'display:flex;align-items:flex-start;justify-content:center;padding:24px 16px;overflow:auto}'
    + '.oim{background:var(--card,#fff);color:var(--ink,#16202b);width:min(56rem,100%);'
    +   'border-radius:10px;box-shadow:0 18px 50px rgba(0,0,0,.28);overflow:hidden}'
    + '.oim-h{padding:18px 22px 12px;border-bottom:1px solid var(--line,#e5e9ef)}'
    + '.oim-h h2{margin:0 0 4px;font:600 17px/1.3 inherit}'
    + '.oim-h p{margin:0;color:var(--dim,#5c6b7a);font-size:13px}'
    + '.oim-b{padding:16px 22px;max-height:56vh;overflow:auto}'
    + '.oim-sum{display:flex;gap:18px;margin:0 0 14px;font-size:14px;flex-wrap:wrap}'
    + '.oim-sum b{font-size:22px;display:block;line-height:1.1}'
    + '.oim-ok b{color:#0D9488}.oim-bad b{color:#B42318}.oim-upd b{color:#0070F2}'
    + '.oim-warn{background:#FFF7E6;border:1px solid #F5C77E;border-radius:8px;'
    +   'padding:10px 12px;margin:0 0 14px;font-size:13px;line-height:1.5}'
    + '.oim-tbl{width:100%;border-collapse:collapse;font-size:13px}'
    + '.oim-tbl th{text-align:left;font-weight:600;padding:6px 8px;border-bottom:1px solid var(--line,#e5e9ef);'
    +   'color:var(--dim,#5c6b7a);position:sticky;top:0;background:var(--card,#fff)}'
    + '.oim-tbl td{padding:6px 8px;border-bottom:1px solid var(--line,#f0f3f7);vertical-align:top}'
    + '.oim-tbl tr.bad td{background:#FEF3F2}'
    + '.oim-why{color:#B42318}'
    + '.oim-f{padding:14px 22px;border-top:1px solid var(--line,#e5e9ef);display:flex;'
    +   'gap:10px;align-items:center;flex-wrap:wrap}'
    + '.oim-f .sp{flex:1}'
    + '.oim-btn{font:inherit;font-size:14px;padding:9px 16px;border-radius:7px;cursor:pointer;'
    +   'border:1px solid var(--line,#cfd6de);background:var(--card,#fff);color:inherit}'
    + '.oim-btn.pri{background:#0070F2;border-color:#0070F2;color:#fff}'
    + '.oim-btn[disabled]{opacity:.5;cursor:default}';

  function css() {
    if (document.getElementById(CSS_ID)) return;
    var st = document.createElement('style');
    st.id = CSS_ID; st.textContent = CSS;
    document.head.appendChild(st);
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* The rejected rows go back as a file. Telling someone row 31 is wrong in a
     hundred-row export is telling them to go hunting; handing back a sheet
     with only those rows and a column saying why is something they can fix
     and send back. */
  function downloadBad(report, label) {
    var aoa = [['row', 'why'].concat(Object.keys(PROJECT_SPEC.fields))];
    report.problems.forEach(function (p) {
      var line = [p.row, p.why.join('; ')];
      for (var k in PROJECT_SPEC.fields) line.push(p.rec[k] == null ? '' : p.rec[k]);
      aoa.push(line);
    });
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Needs attention');
    XLSX.writeFile(wb, (label || 'import').replace(/[^\w.-]+/g, '-') + '-needs-attention.xlsx');
  }

  function open(opts) {
    css();
    var label = opts.label || 'Import';
    return parse(opts.file).then(function (table) {
      var rep = validate(table, opts.spec || PROJECT_SPEC, opts.existing || []);
      return new Promise(function (resolve) {
        var scrim = document.createElement('div');
        scrim.className = 'oim-scrim';
        var creating = rep.ready.length - rep.updating;

        var warn = '';
        if (!rep.hasDedupe)
          warn += '<div class="oim-warn"><b>No id column found.</b> Nothing in this file '
               +  'identifies a row across uploads, so a corrected file sent later cannot '
               +  'update these — it would add a second copy of every site. Add an '
               +  '<code>external_id</code> (or “Site ID”) column and re-export if you can.</div>';
        if (rep.unmapped.length)
          warn += '<div class="oim-warn"><b>Columns ignored:</b> ' + esc(rep.unmapped.join(', '))
               +  '. Nothing was lost from the file — these simply have no home on a project yet.</div>';

        var rows = rep.problems.map(function (p) {
          return '<tr class="bad"><td>' + p.row + '</td><td>' + esc(p.rec.name || '—')
               + '</td><td class="oim-why">' + esc(p.why.join('; ')) + '</td></tr>';
        }).join('');

        scrim.innerHTML =
          '<div class="oim" role="dialog" aria-modal="true">'
          + '<div class="oim-h"><h2>' + esc(label) + ' — ' + esc(opts.file.name) + '</h2>'
          + '<p>Nothing is saved until you choose to import. Sheet: ' + esc(table.sheet) + '</p></div>'
          + '<div class="oim-b">'
          + '<div class="oim-sum">'
          +   '<div class="oim-ok"><b>' + creating + '</b>new project' + (creating === 1 ? '' : 's') + '</div>'
          +   (rep.updating ? '<div class="oim-upd"><b>' + rep.updating + '</b>will update existing</div>' : '')
          +   '<div class="oim-bad"><b>' + rep.problems.length + '</b>need attention</div>'
          + '</div>'
          + warn
          + (rep.problems.length
              ? '<table class="oim-tbl"><thead><tr><th>Row</th><th>Site</th><th>Why it is held back</th></tr></thead>'
                + '<tbody>' + rows + '</tbody></table>'
              : '<p style="color:var(--dim,#5c6b7a);font-size:13px">Every row read cleanly.</p>')
          + '</div>'
          + '<div class="oim-f">'
          +   (rep.problems.length ? '<button class="oim-btn" data-act="dl">Download the '
                + rep.problems.length + ' to fix</button>' : '')
          +   '<span class="sp"></span>'
          +   '<button class="oim-btn" data-act="cancel">Cancel</button>'
          +   '<button class="oim-btn pri" data-act="go"' + (rep.ready.length ? '' : ' disabled')
          +     '>Import ' + rep.ready.length + '</button>'
          + '</div></div>';

        function close(v) { scrim.remove(); resolve(v); }
        scrim.addEventListener('click', function (e) {
          var b = e.target.closest ? e.target.closest('[data-act]') : null;
          if (!b) { if (e.target === scrim) close(null); return; }
          var a = b.getAttribute('data-act');
          if (a === 'cancel') return close(null);
          if (a === 'dl') return downloadBad(rep, label);
          if (a === 'go') {
            b.disabled = true; b.textContent = 'Importing…';
            var id = batchId();
            Promise.resolve(opts.commit(rep.ready, id)).then(function (r) {
              close({ imported: rep.ready.length, batchId: id, skipped: rep.problems.length, result: r });
            }, function (err) {
              b.disabled = false; b.textContent = 'Import ' + rep.ready.length;
              alert('The import failed and nothing was saved: ' + (err && err.message || err));
            });
          }
        });
        document.body.appendChild(scrim);
      });
    });
  }

  return {
    PROJECT_SPEC: PROJECT_SPEC, KINDS: KINDS, HEADERS: HEADERS, open: open,
    parse: parse, validate: validate, mapHeaders: mapHeaders,
    coerce: coerce, number: number, batchId: batchId
  };
}));
