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

   ── ONE IMPORTER, MANY SPECS ──
   The second thing anybody wanted to bulk-load was not a site but a PRODUCT:
   a vendor's sheet of modular data-center units for the editor's equipment
   library. Everything above (parse, header synonyms, refusing a hedge,
   preview-before-write, the needs-attention sheet) is the same problem, so
   it is the same code, and what differs is carried by the SPEC:

     headers      column synonyms, per field
     fields       coercion and limits, per field
     required     which fields hold a row back when empty
     dedupe       the field that makes a re-upload an update
     existingKeys where that id lives on an already-saved record
     derive(rec)  fill-ins after coercion — MW to kW, metres to feet, a
                  stable key from manufacturer + model when the sheet has
                  none. A derived key is why "no id column" is NOT a
                  warning for equipment: the same product twice is one
                  product, and there is nothing to spell differently.
     noun         what a row is, for the preview ("project", "unit")
     label(rec)   how a row is named in the needs-attention table
     template     headers + example rows, for a downloadable blank

   OmegaImport.PROJECT_SPEC is the original. OmegaImport.MDC_SPEC is the
   modular data-center unit. The module still does not know what a project
   or a Firestore document is; the host page's commit() does.
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
    noun: 'project',
    headers: HEADERS,
    required: ['name'],
    dedupe: 'external_id',
    /* Where a saved record keeps the id a sheet calls external_id. Both
       spellings are live: portfolio.html writes intakeId. */
    existingKeys: ['intakeId', 'external_id'],
    label: function (rec) { return rec.name; },
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

  /* ── MODULAR DATA-CENTER UNITS ──────────────────────────────────────────
     A vendor's product sheet, one row per unit, into the editor's equipment
     library (equipment/{doc}, cat 'datacenter', sub 'module') and from there
     into DC_CATALOG so the unit can be dropped on a site to scale.

     WHAT IS REQUIRED, AND WHY MORE THAN ONE COLUMN THIS TIME. A site can
     be imported on a name alone because everything else is found out
     later. A unit cannot: the editor draws it at its real footprint and
     multiplies its IT load by PUE to size the service, so a unit with no
     dimensions or no load is not a unit, it is a label. Manufacturer,
     model, IT load and footprint are the floor. Everything else is
     optional and read straight off the datasheet when it is there.

     `kw_it` is IT LOAD, not facility draw — same rule as DC_CATALOG. A
     sheet that gives MW, or metres, or millimetres, is converted in
     derive(); nobody is asked to re-key a datasheet into our units.

     COOLING IS A PROPERTY OF THE PRODUCT. 'integrated' carries its own
     plant, 'integrated-closed-loop' does so with no site water, and
     'external' needs a chiller yard drawn beside it. `water_gpd` of zero
     is a siting fact worth recording on a dry parcel. */
  var MDC_HEADERS = {
    manufacturer: ['manufacturer', 'mfr', 'make', 'vendor', 'oem', 'brand', 'supplier', 'maker'],
    model:        ['model', 'product', 'model name', 'product name', 'model number',
                   'model no', 'part number', 'unit name', 'name'],
    key:          ['key', 'sku', 'id', 'part no', 'unit id', 'product id', 'catalog key',
                   'catalogue key', 'ref', 'reference', 'external id', 'item'],
    kw_it:        ['it load kw', 'it kw', 'kw it', 'kw', 'it load', 'power kw', 'it capacity kw',
                   'critical load kw', 'critical kw', 'capacity kw', 'it power kw', 'kw it load',
                   'it load kw', 'load kw', 'compute kw'],
    mw_it:        ['it load mw', 'it mw', 'mw it', 'mw', 'capacity mw', 'it capacity mw',
                   'critical load mw', 'power mw', 'it power mw', 'load mw', 'compute mw'],
    length_ft:    ['length ft', 'length', 'l ft', 'length feet', 'len ft', 'long ft', 'l'],
    width_ft:     ['width ft', 'width', 'w ft', 'width feet', 'wide ft', 'w'],
    height_ft:    ['height ft', 'height', 'h ft', 'height feet', 'tall ft', 'h'],
    length_m:     ['length m', 'l m', 'length metres', 'length meters'],
    width_m:      ['width m', 'w m', 'width metres', 'width meters'],
    height_m:     ['height m', 'h m', 'height metres', 'height meters'],
    length_mm:    ['length mm', 'l mm'],
    width_mm:     ['width mm', 'w mm'],
    height_mm:    ['height mm', 'h mm'],
    cooling:      ['cooling', 'cooling type', 'heat rejection', 'cooling system', 'thermal'],
    cool_kw:      ['cooling kw', 'cool kw', 'cooling capacity kw', 'cooling capacity',
                   'heat rejection kw'],
    water_gpd:    ['water gpd', 'water', 'gpd', 'water use gpd', 'water gallons per day',
                   'water consumption', 'gallons per day', 'water use', 'water use gal day'],
    volts:        ['volts', 'voltage', 'v', 'utility voltage', 'input voltage', 'ac voltage',
                   'vac', 'volts ac', 'service voltage'],
    ups:          ['ups', 'ups included', 'backup', 'power protection', 'ups onboard'],
    pue:          ['pue', 'design pue', 'rated pue'],
    acres:        ['acres', 'footprint acres', 'site acres', 'land acres', 'pad acres'],
    cost_usd:     ['cost usd', 'cost', 'price', 'price usd', 'unit cost', 'unit price', 'capex',
                   '$', 'cost $', 'price $', 'list price', 'budget price'],
    verified:     ['verified', 'source', 'datasheet', 'spec sheet', 'url', 'link',
                   'reference url', 'datasheet url', 'source url'],
    notes:        ['notes', 'note', 'description', 'comments', 'comment', 'spec', 'specs',
                   'remarks', 'summary']
  };
  var COOLING = ['integrated', 'integrated-closed-loop', 'external'];
  /* Keys are what norm() makes of a cell: lower case, hyphens to spaces. A
     word that could mean either side ("liquid", "air") is deliberately NOT
     here — it is refused with a suggestion rather than guessed at, because a
     liquid-cooled unit may still want a chiller yard. */
  var COOLING_ALIAS = {
    'integrated': 'integrated', 'self contained': 'integrated', 'selfcontained': 'integrated',
    'onboard': 'integrated', 'on board': 'integrated', 'built in': 'integrated',
    'builtin': 'integrated', 'included': 'integrated', 'internal': 'integrated',
    'dx': 'integrated', 'in row': 'integrated', 'inrow': 'integrated', 'yes': 'integrated',
    'integrated closed loop': 'integrated-closed-loop', 'closed loop': 'integrated-closed-loop',
    'closed circuit': 'integrated-closed-loop', 'direct to chip': 'integrated-closed-loop',
    'd2c': 'integrated-closed-loop', 'no site water': 'integrated-closed-loop',
    'waterless': 'integrated-closed-loop', 'dry': 'integrated-closed-loop',
    'external': 'external', 'chiller': 'external', 'chillers': 'external',
    'chiller yard': 'external', 'site chillers': 'external', 'chilled water': 'external',
    'site water': 'external', 'evaporative': 'external', 'cooling tower': 'external',
    'none': 'external', 'not included': 'external', 'by others': 'external', 'no': 'external'
  };
  var UPS = ['integrated', 'external', 'none'];
  var UPS_ALIAS = {
    'integrated': 'integrated', 'yes': 'integrated', 'y': 'integrated', 'true': 'integrated',
    'included': 'integrated', 'onboard': 'integrated', 'on board': 'integrated',
    'built in': 'integrated', 'builtin': 'integrated', 'internal': 'integrated',
    'external': 'external', 'by others': 'external', 'site ups': 'external',
    'separate': 'external', 'not included': 'external',
    'none': 'none', 'no': 'none', 'n': 'none', 'false': 'none', 'excluded': 'none'
  };

  function slugKey(s, max) {
    return String(s == null ? '' : s).toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, max || 24);
  }
  function feet(rec, base) {
    var ft = rec[base + '_ft'], m = rec[base + '_m'], mm = rec[base + '_mm'];
    delete rec[base + '_m']; delete rec[base + '_mm'];
    if (ft == null && m != null)  ft = m * 3.28084;
    if (ft == null && mm != null) ft = mm / 304.8;
    if (ft == null) { delete rec[base + '_ft']; return; }
    rec[base + '_ft'] = Math.round(ft * 10) / 10;
  }

  var MDC_SPEC = {
    noun: 'unit',
    headers: MDC_HEADERS,
    required: ['manufacturer', 'model', 'kw_it', 'length_ft', 'width_ft'],
    dedupe: 'key',
    existingKeys: ['key'],
    label: function (rec) {
      return [rec.manufacturer, rec.model].filter(Boolean).join(' ');
    },
    derive: function (rec) {
      if (rec.kw_it == null && rec.mw_it != null) rec.kw_it = Math.round(rec.mw_it * 1000);
      delete rec.mw_it;
      feet(rec, 'length'); feet(rec, 'width'); feet(rec, 'height');
      if (rec.key) rec.key = String(rec.key).trim().toUpperCase().replace(/\s+/g, '-');
      else if (rec.manufacturer && rec.model)
        rec.key = 'MDC-' + slugKey(rec.manufacturer, 16) + '-' + slugKey(rec.model, 24);
      return rec;
    },
    fields: {
      manufacturer: { type: 'text',   max: 80 },
      model:        { type: 'text',   max: 120 },
      key:          { type: 'text',   max: 60 },
      kw_it:        { type: 'number', min: 1 },
      mw_it:        { type: 'number', min: 0.001 },
      length_ft:    { type: 'number', min: 1 },
      width_ft:     { type: 'number', min: 1 },
      height_ft:    { type: 'number', min: 1 },
      length_m:     { type: 'number', min: 0.3 },
      width_m:      { type: 'number', min: 0.3 },
      height_m:     { type: 'number', min: 0.3 },
      length_mm:    { type: 'number', min: 300 },
      width_mm:     { type: 'number', min: 300 },
      height_mm:    { type: 'number', min: 300 },
      cooling:      { type: 'enum',   values: COOLING, alias: COOLING_ALIAS },
      cool_kw:      { type: 'number', min: 0 },
      water_gpd:    { type: 'number', min: 0 },
      volts:        { type: 'number', min: 100 },
      ups:          { type: 'enum',   values: UPS, alias: UPS_ALIAS },
      pue:          { type: 'number', min: 1 },
      acres:        { type: 'number', min: 0 },
      cost_usd:     { type: 'money',  min: 0 },
      verified:     { type: 'text',   max: 300 },
      notes:        { type: 'text',   max: 2000 }
    },
    /* The blank a person downloads. The example is the one published unit
       DC_CATALOG already carries with a source, so the sheet teaches the
       units by showing real numbers rather than "1234". */
    template: {
      headers: ['Manufacturer', 'Model', 'SKU', 'IT load kW', 'Length ft', 'Width ft', 'Height ft',
                'Cooling', 'Cooling kW', 'Water gpd', 'Volts', 'UPS', 'PUE', 'Acres', 'Cost USD',
                'Datasheet', 'Notes'],
      example: [
        ['Armada', 'Leviathan', 'MDC-ARMADA-LEVIATHAN', 1770, 119, 45, '', 'integrated-closed-loop',
         2200, 0, 480, 'integrated', '', 0.12, '', 'armada.ai/product/leviathan',
         'Three containers on one pad: two 45 ft (compute, power) and one 20 ft (cooling). Air-cooled N+1, no site water.'],
        ['Generic', '1 MW container', '', 1000, 40, 10, '', 'integrated', '', 0, 480, 'integrated',
         '', '', '', '', 'Planning block, no vendor datasheet behind it.']
      ]
    }
  };

  /* ── coercion ─────────────────────────────────────────────────────────── */

  function norm(s) {
    return String(s == null ? '' : s).toLowerCase()
      .replace(/[_\-]+/g, ' ').replace(/[^a-z0-9 $]/g, '').replace(/\s+/g, ' ').trim();
  }

  function mapHeaders(headers, spec) {
    var H = (spec && spec.headers) || HEADERS;
    var out = {}, used = {};
    for (var i = 0; i < headers.length; i++) {
      var h = norm(headers[i]);
      if (!h) continue;
      for (var key in H) {
        if (used[key]) continue;
        var syn = H[key];
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
    if (f.type === 'number' || f.type === 'money') {
      var r = number(s, f.type === 'money');
      /* `min` was declared on every numeric field and checked nowhere, so a
         -5 MW site and a 0 kW unit both imported as facts. A floor is a
         floor: below it is refused, with the number, like a hedge is. */
      if (r.ok && r.value != null && f.min != null && r.value < f.min)
        return { ok: false, why: '"' + s + '" is below the minimum of ' + f.min };
      return r;
    }
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
    var map = mapHeaders(headers, spec);
    var unmapped = [];
    for (var h = 0; h < headers.length; h++)
      if (!map[h] && String(headers[h] || '').trim()) unmapped.push(headers[h]);

    var seen = {}, existingIds = {}, exKeys = spec.existingKeys || ['intakeId', 'external_id'];
    (existing || []).forEach(function (d) {
      if (!d) return;
      var id = null;
      for (var k = 0; k < exKeys.length && !id; k++) id = d[exKeys[k]];
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
      /* Fill-ins come BEFORE the required check, so a sheet that says MW
         satisfies a spec that asks for kW. */
      if (typeof spec.derive === 'function') {
        try { rec = spec.derive(rec) || rec; }
        catch (e) { why.push('could not read this row: ' + (e && e.message || e)); }
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
    var mappedDedupe = false;
    for (var mk in map) if (map[mk] === spec.dedupe) mappedDedupe = true;
    var derived = ready.length > 0 && ready.filter(function (r) { return !r.rec[spec.dedupe]; }).length === 0;
    return {
      ready: ready, problems: problems, unmapped: unmapped,
      mapped: (function () { var o = []; for (var k in map) o.push(map[k]); return o; })(),
      /* A mapped id column, or a derive() that gave every row that will
         land one — either way a corrected re-upload updates in place, and
         the warning that says otherwise would be wrong. */
      hasDedupe: mappedDedupe || derived,
      updating: ready.filter(function (r) { return r.updates; }).length
    };
  }

  /* The blank sheet a person downloads before they have anything to import:
     the columns in our words, plus example rows carrying real numbers so the
     units are shown rather than described. Rows for XLSX.utils.aoa_to_sheet. */
  function templateRows(spec) {
    spec = spec || PROJECT_SPEC;
    var t = spec.template;
    if (t && t.headers) return [t.headers.slice()].concat((t.example || []).map(function (r) { return r.slice(); }));
    var head = [], k;
    for (k in spec.fields) head.push(k);
    return [head];
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
  function downloadBad(report, label, spec) {
    spec = spec || PROJECT_SPEC;
    var aoa = [['row', 'why'].concat(Object.keys(spec.fields))];
    report.problems.forEach(function (p) {
      var line = [p.row, p.why.join('; ')];
      for (var k in spec.fields) line.push(p.rec[k] == null ? '' : p.rec[k]);
      aoa.push(line);
    });
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Needs attention');
    XLSX.writeFile(wb, (label || 'import').replace(/[^\w.-]+/g, '-') + '-needs-attention.xlsx');
  }

  function open(opts) {
    css();
    var label = opts.label || 'Import';
    var spec = opts.spec || PROJECT_SPEC;
    var noun = spec.noun || 'project';
    var nameOf = typeof spec.label === 'function' ? spec.label : function (r) { return r.name; };
    return parse(opts.file).then(function (table) {
      var rep = validate(table, spec, opts.existing || []);
      return new Promise(function (resolve) {
        var scrim = document.createElement('div');
        scrim.className = 'oim-scrim';
        var creating = rep.ready.length - rep.updating;

        var warn = '';
        if (!rep.hasDedupe)
          warn += '<div class="oim-warn"><b>No id column found.</b> Nothing in this file '
               +  'identifies a row across uploads, so a corrected file sent later cannot '
               +  'update these — it would add a second copy of every ' + esc(noun) + '. Add an '
               +  '<code>' + esc(spec.dedupe) + '</code> (or “ID”) column and re-export if you can.</div>';
        if (rep.unmapped.length)
          warn += '<div class="oim-warn"><b>Columns ignored:</b> ' + esc(rep.unmapped.join(', '))
               +  '. Nothing was lost from the file — these simply have no home on a '
               +  esc(noun) + ' yet.</div>';

        var rows = rep.problems.map(function (p) {
          return '<tr class="bad"><td>' + p.row + '</td><td>' + esc(nameOf(p.rec) || '—')
               + '</td><td class="oim-why">' + esc(p.why.join('; ')) + '</td></tr>';
        }).join('');

        scrim.innerHTML =
          '<div class="oim" role="dialog" aria-modal="true">'
          + '<div class="oim-h"><h2>' + esc(label) + ' — ' + esc(opts.file.name) + '</h2>'
          + '<p>Nothing is saved until you choose to import. Sheet: ' + esc(table.sheet) + '</p></div>'
          + '<div class="oim-b">'
          + '<div class="oim-sum">'
          +   '<div class="oim-ok"><b>' + creating + '</b>new ' + esc(noun) + (creating === 1 ? '' : 's') + '</div>'
          +   (rep.updating ? '<div class="oim-upd"><b>' + rep.updating + '</b>will update existing</div>' : '')
          +   '<div class="oim-bad"><b>' + rep.problems.length + '</b>need attention</div>'
          + '</div>'
          + warn
          + (rep.problems.length
              ? '<table class="oim-tbl"><thead><tr><th>Row</th><th>' + esc(noun.charAt(0).toUpperCase() + noun.slice(1))
                + '</th><th>Why it is held back</th></tr></thead>'
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
          if (a === 'dl') return downloadBad(rep, label, spec);
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
    PROJECT_SPEC: PROJECT_SPEC, MDC_SPEC: MDC_SPEC, KINDS: KINDS, HEADERS: HEADERS,
    open: open, parse: parse, validate: validate, mapHeaders: mapHeaders,
    coerce: coerce, number: number, batchId: batchId, templateRows: templateRows
  };
}));
