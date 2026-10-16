/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   The plan-set reader: one sheet of a customer's drawings in, the equipment
   and the facts printed on it out, each with the words it was read from and
   where on the sheet they are (2026-10-16, Tommy: "let's build it", after a
   Perplexity ad that "reads blueprints, prices jobs, and maps out builds";
   docs/BLUEPRINT-TO-BUILD.md).

   Pure, ES5, no I/O. api/plan-read.js is the ONE door: it checks who is
   asking, calls the model with request() below and stores the answer. This
   file holds the prompt, the output schema, the normaliser and the
   cross-checks, so all of it is tested without a network and none of it
   reaches a browser (CLAUDE.md, IP protection).

   READ, NEVER INVENT. A plan set ends up on a permit and an interconnection
   application, so a misread is worse than a blank:
     - every item and fact carries `quote`, the words on the sheet it came
       from, and a box on the sheet; a value with no words behind it is
       downgraded to low confidence and left unticked;
     - a number outside what the kind can physically be is dropped (null),
       never clamped into range;
     - two sheets that disagree are SHOWN (issues[]), never averaged or
       silently resolved;
     - nothing here places anything. The browser shows the read; a person
       ticks what is right; the editor places it through its own tools.

   What a placed item becomes is decided here too (`place`), so the page
   keeps no rule of its own: an Insert-tab element (counted by the Run the
   same way as one placed by hand), a charger as the EV tools' own Level 2
   or DC fast shape (so the Run prices it as that kind), or nothing (a run, a building, a note: listed,
   not drawn). Solar is listed with its kW and drawn by the person, because
   the Run prices an array from its traced geometry. */
'use strict';

var VERSION = 'plan-read-1';

/* What a thing on a sheet can be, and what the editor makes of it.
   place.via: 'eq'    = addEl({type:'eq', eqId}) as Insert does;
              'shape' = the EV tools' own charger shape ('evl2' Level 2,
                        'evunit' DC fast), which the Run prices by kind
                        and kW (editor-cost evEst);
              null    = listed only. */
var KINDS = {
  bess:             { label: 'Battery storage',        place: { via: 'eq', id: 'bess' } },
  inverter:         { label: 'Inverter / PCS',          place: { via: 'eq', id: 'pcs' } },
  transformer:      { label: 'Transformer',             place: { via: 'eq', id: 'xfmr' } },
  switchgear:       { label: 'Switchgear',              place: { via: 'eq', id: 'panel' } },
  panelboard:       { label: 'Panelboard',              place: { via: 'eq', id: 'panel' } },
  disconnect:       { label: 'Disconnect',              place: { via: 'eq', id: 'disco' } },
  meter:            { label: 'Meter',                   place: { via: 'eq', id: 'meter' } },
  service_pedestal: { label: 'Service pedestal',        place: { via: 'eq', id: 'svcped' } },
  ev_charger:       { label: 'EV charger',              place: { via: 'shape', id: 'evunit' } },   /* Level 2 or DC fast: chargerPlace() */
  generator:        { label: 'Generator',               place: { via: 'eq', id: 'genset' } },
  ups:              { label: 'UPS',                     place: { via: 'eq', id: 'ups' } },
  junction_box:     { label: 'Junction box',            place: { via: 'eq', id: 'jbox' } },
  utility_pole:     { label: 'Utility pole',            place: { via: 'eq', id: 'pole' } },
  concrete_pad:     { label: 'Concrete pad',            place: { via: 'eq', id: 'pad' } },
  bollard:          { label: 'Bollard',                 place: { via: 'eq', id: 'bollard' } },
  fence:            { label: 'Fence',                   place: { via: 'eq', id: 'fence' } },
  solar_array:      { label: 'Solar array',             place: null, note: 'Draw the array (Draw › Solar) to price it; Array › Edit Size sets its kW.' },
  conduit_run:      { label: 'Conduit / cable run',     place: null, note: 'Route it with Draw › Conduit; the length read here is shown to match.' },
  trench:           { label: 'Trench',                  place: null, note: 'Draw it with the trench tool; the length read here is shown to match.' },
  building:         { label: 'Building',                place: null },
  other:            { label: 'Other',                   place: null }
};
var KIND_KEYS = Object.keys(KINDS);

/* The facts a sheet can state about the project. `unit` is the one unit the
   number is held in; `lo`/`hi` are what the thing can physically be. A text
   fact has no unit. These are facts to read and check against each other,
   never prices: the Run prices what is drawn. */
var FACTS = {
  project_name:      { label: 'Project name' },
  site_address:      { label: 'Site address' },
  utility:           { label: 'Utility' },
  ahj:               { label: 'Authority having jurisdiction' },
  service_voltage:   { label: 'Service voltage' },
  service_amps:      { label: 'Service size', unit: 'A', lo: 30, hi: 20000 },
  main_breaker_amps: { label: 'Main breaker', unit: 'A', lo: 15, hi: 20000 },
  pv_kw_dc:          { label: 'Solar (DC)', unit: 'kW', lo: 0.5, hi: 500000 },
  pv_kw_ac:          { label: 'Solar (AC)', unit: 'kW', lo: 0.5, hi: 500000 },
  pv_module:         { label: 'Solar module' },
  pv_module_watts:   { label: 'Module rating', unit: 'W', lo: 50, hi: 1000 },
  pv_module_count:   { label: 'Module count', unit: 'modules', lo: 1, hi: 2000000 },
  inverter_count:    { label: 'Inverter count', unit: 'inverters', lo: 1, hi: 5000 },
  bess_kw:           { label: 'Battery power', unit: 'kW', lo: 1, hi: 2000000 },
  bess_kwh:          { label: 'Battery energy', unit: 'kWh', lo: 1, hi: 10000000 },
  bess_model:        { label: 'Battery model' },
  ev_charger_count:  { label: 'EV chargers', unit: 'chargers', lo: 1, hi: 5000 },
  ev_charger_kw:     { label: 'Charger rating', unit: 'kW', lo: 1, hi: 1500 },
  transformer_kva:   { label: 'Transformer', unit: 'kVA', lo: 5, hi: 500000 },
  interconnection:   { label: 'Interconnection' }
};
var FACT_KEYS = Object.keys(FACTS);
var DISCIPLINES = ['site', 'electrical', 'civil', 'structural', 'solar', 'storage', 'ev', 'title', 'details', 'other'];
var SOURCES = ['drawing', 'schedule', 'note', 'title_block', 'legend'];
var LEVELS = ['high', 'medium', 'low'];

/* Physical ranges per item field, by kind where it matters: a 40,000 kW
   "EV charger" is a misread, and so is a 2 kW transformer. */
var RANGE = {
  kw:       { lo: 0.1, hi: 2000000, ev_charger: [1, 1500], inverter: [0.2, 10000], generator: [1, 100000], ups: [0.5, 50000] },
  kwh:      { lo: 1, hi: 10000000 },
  kva:      { lo: 1, hi: 500000, transformer: [5, 500000] },
  amps:     { lo: 1, hi: 20000 },
  quantity: { lo: 1, hi: 500 },
  length_ft:{ lo: 1, hi: 200000 }
};

/* ── the output schema (structured outputs: every object closed, every
   property required, a missing value is null) ── */
function nullable(t) { return { anyOf: [t, { type: 'null' }] }; }
var STR = { type: 'string' }, NUM = { type: 'number' }, INT = { type: 'integer' };
var BOX = { type: 'object', additionalProperties: false, required: ['x', 'y', 'w', 'h'],
  properties: { x: NUM, y: NUM, w: NUM, h: NUM } };
var SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['sheet', 'items', 'facts', 'notes', 'unreadable'],
  properties: {
    sheet: { type: 'object', additionalProperties: false, required: ['number', 'title', 'discipline', 'scale', 'revision'],
      properties: { number: nullable(STR), title: nullable(STR), discipline: { type: 'string', enum: DISCIPLINES }, scale: nullable(STR), revision: nullable(STR) } },
    items: { type: 'array', items: { type: 'object', additionalProperties: false,
      required: ['kind', 'tag', 'description', 'manufacturer', 'model', 'kw', 'kwh', 'kva', 'amps', 'voltage', 'quantity', 'length_ft', 'box', 'source', 'quote', 'confidence'],
      properties: {
        kind: { type: 'string', enum: KIND_KEYS }, tag: nullable(STR), description: STR, manufacturer: nullable(STR), model: nullable(STR),
        kw: nullable(NUM), kwh: nullable(NUM), kva: nullable(NUM), amps: nullable(NUM), voltage: nullable(STR),
        quantity: nullable(INT), length_ft: nullable(NUM), box: nullable(BOX),
        source: { type: 'string', enum: SOURCES }, quote: STR, confidence: { type: 'string', enum: LEVELS } } } },
    facts: { type: 'array', items: { type: 'object', additionalProperties: false,
      required: ['key', 'text', 'number', 'box', 'quote', 'confidence'],
      properties: { key: { type: 'string', enum: FACT_KEYS }, text: nullable(STR), number: nullable(NUM), box: nullable(BOX),
        quote: STR, confidence: { type: 'string', enum: LEVELS } } } },
    notes: { type: 'array', items: STR },
    unreadable: nullable(STR)
  }
};

var SYSTEM = [
  'You read ONE sheet of a construction plan set for an energy project (battery storage, solar, EV charging, microgrid, data centre or a building electrical service) and report what is printed on it.',
  '',
  'You get an image of the sheet and, when the PDF had one, its text layer. The text layer has the exact spelling of what is printed; the image shows where it is. Use both.',
  '',
  'READ, NEVER INVENT. This read goes onto a permit and an interconnection application, so a blank is better than a guess.',
  '- Report only what is printed on THIS sheet. Do not use general knowledge to fill a value in.',
  '- Every item and fact has `quote`: the words on the sheet you read it from, copied exactly (a schedule row, a callout, a note, a title-block line). If you cannot quote it, do not report it.',
  '- A number that is not printed is null. Do not compute a value from other values (do not multiply modules by watts, do not divide kWh by hours).',
  '- Convert units only: MW to kW (x1000), MWh to kWh (x1000), kVA stays kVA. Lengths in feet (metres x 3.281).',
  '- `box` is where the quote is on the image, as fractions of the image width and height from the top-left corner (x, y, w, h, each 0 to 1). Use null if you cannot place it.',
  '- `confidence`: high = printed clearly and unambiguous; medium = printed but partly illegible or you had to choose between two readings; low = inferred from a symbol or a partial label.',
  '',
  'ITEMS are pieces of equipment or runs a contractor would buy or build:',
  '- One item per distinct piece of equipment. A schedule row with a quantity is ONE item with that quantity (e.g. "(12) DUAL PORT LEVEL 2 CHARGERS" is one ev_charger with quantity 12). Equipment drawn several times with the same tag is one item; different tags (INV-1, INV-2) are different items.',
  '- Prefer equipment schedules and the single-line diagram; they carry ratings. Set `source` to where you read it.',
  '- Do not list legend symbols, north arrows, keynotes that name nothing, existing utility poles shown only for context unless labelled as new or modified work, or the title block itself.',
  '- kinds: bess (battery cabinets/containers), inverter (PCS, string or central inverter), transformer, switchgear, panelboard (incl. MDP, distribution panels), disconnect (switches, fused/non-fused, AC/DC disconnects), meter (incl. CT cabinets), service_pedestal, ev_charger (L2 and DCFC; a dispenser and its power cabinet are one charger unless scheduled separately), generator, ups, junction_box (incl. pull boxes, combiners), utility_pole, concrete_pad, bollard, fence, solar_array (an array or block of modules), conduit_run (a conduit or cable run with a size or length), trench, building, other.',
  '- `tag` is the label on the drawing (INV-1, ESS-A, MDP, T1). `description` is a short plain description of the item in your own words, under 12 words.',
  '- kw/kwh/kva/amps are the ratings printed for that item. `voltage` as printed ("480Y/277V", "1000VDC"). `quantity` is how many (null if one or not stated). `length_ft` only for runs and trenches with a printed length.',
  '',
  'FACTS are statements about the whole project (title block, general notes, system summary, single-line notes). Use the key that fits; one fact per key per value printed. Text facts go in `text`; numeric facts go in `number` (in kW, kWh, kVA, A, W or a count) with the printed words in `quote`.',
  '',
  'SHEET: the sheet number and title from the title block, its discipline, the drawing scale if printed, the revision if printed.',
  '',
  '`notes`: at most five short notes about anything a reviewer must know that has no place above (e.g. "Battery schedule says by others", "Sheet references detail 4/E-501 not included"). Do not restate items.',
  'If the image is not a drawing sheet or is illegible, set `unreadable` to why and return empty lists.'
].join('\n');

/* ── the request the door sends ── */
function request(sheet, opts) {
  opts = opts || {};
  var text = String(sheet.text || '').slice(0, 24000);
  var lines = ['Sheet: page ' + (sheet.page || 1) + (sheet.of ? ' of ' + sheet.of : '') + ' of the file "' + String(sheet.fileName || 'plan set').slice(0, 120) + '".'];
  lines.push(text ? 'PDF text layer (exact spelling; the order may follow the drawing, not reading order):\n' + text : 'This sheet has no text layer; read it from the image.');
  lines.push('Report this sheet.');
  var body = {
    model: opts.model,
    max_tokens: 16000,
    system: SYSTEM,
    output_config: { effort: opts.effort || 'medium', format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{ role: 'user', content: [
      { type: 'image', source: { type: 'base64', media_type: sheet.mediaType || 'image/jpeg', data: sheet.imageBase64 } },
      { type: 'text', text: lines.join('\n\n') }
    ] }]
  };
  if (opts.fallbacks !== false) body.fallbacks = 'default';
  return body;
}

/* ── normalising what came back ── */
function str(v, max) { if (v == null) return null; v = String(v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim(); return v ? v.slice(0, max || 200) : null; }
function num(v, lo, hi) { var n = typeof v === 'number' ? v : (typeof v === 'string' && v.trim() ? Number(v) : NaN); return isFinite(n) && n >= lo && n <= hi ? n : null; }
function oneOf(v, list, dflt) { return list.indexOf(v) >= 0 ? v : dflt; }
function box(b) {
  if (!b || typeof b !== 'object') return null;
  var x = +b.x, y = +b.y, w = +b.w, h = +b.h;
  if (![x, y, w, h].every(isFinite) || w <= 0.002 || h <= 0.002 || x < -0.01 || y < -0.01 || x + w > 1.01 || y + h > 1.01) return null;
  function c(v) { return Math.round(Math.min(1, Math.max(0, v)) * 10000) / 10000; }
  return { x: c(x), y: c(y), w: c(w), h: c(h) };
}
function ranged(field, kind, v) {
  var r = RANGE[field], k = r[kind];
  return k ? num(v, k[0], k[1]) : num(v, r.lo, r.hi);
}
/* A charger is Level 2 or DC fast by what is PRINTED: its kW (Level 2
   tops out at 19.2 kW on a 100 A circuit; 22 kW leaves room for a
   three-phase AC unit), else its words. Neither printed: listed, not
   placed, because the two are priced an order of magnitude apart. */
function chargerPlace(it) {
  var words = [it.tag, it.description, it.model, it.quote].join(' ');
  if (it.kw != null) return { via: 'shape', id: it.kw <= 22.5 ? 'evl2' : 'evunit' };
  if (/\bDC\b|DCFC|FAST|\bCCS\b|NACS|CHADEMO/i.test(words)) return { via: 'shape', id: 'evunit' };
  if (/LEVEL\s*(?:2|II)\b|\bL2\b|\bJ1772\b|\bAC\s+CHARG/i.test(words)) return { via: 'shape', id: 'evl2' };
  return null;
}
function settleCharger(it, quotes) {
  it.place = chargerPlace({ tag: it.tag, description: it.description, model: it.model, kw: it.kw, quote: quotes.join(' ') });
  it.note = it.place ? (it.place.id === 'evl2' ? 'Placed as a Level 2 charger.' : 'Placed as a DC fast charger.')
    : 'Neither a rating nor Level 2 / DC fast is printed for it. Place it from Draw › EV once you know which.';
}
/* A value with no words behind it is not high or medium. */
function level(c, quote) { c = oneOf(c, LEVELS, 'low'); return quote ? c : 'low'; }

/* The model's answer for one sheet → the shape every reader uses. Drops
   what does not fit the schema instead of trusting it; counts what it
   dropped so the page can say so. */
function normalize(raw, meta) {
  meta = meta || {};
  var page = Math.max(1, Math.floor(+meta.page || 1)), out, dropped = 0;
  raw = raw && typeof raw === 'object' ? raw : {};
  var sh = raw.sheet && typeof raw.sheet === 'object' ? raw.sheet : {};
  out = {
    version: VERSION, page: page,
    sheet: { number: str(sh.number, 24), title: str(sh.title, 120), discipline: oneOf(sh.discipline, DISCIPLINES, 'other'), scale: str(sh.scale, 60), revision: str(sh.revision, 40) },
    items: [], facts: [], notes: [], unreadable: str(raw.unreadable, 300)
  };
  (Array.isArray(raw.items) ? raw.items.slice(0, 200) : []).forEach(function (it) {
    if (!it || typeof it !== 'object' || KIND_KEYS.indexOf(it.kind) < 0) { dropped++; return; }
    var quote = str(it.quote, 300), kind = it.kind, def = KINDS[kind];
    var item = {
      id: 'p' + page + '-i' + (out.items.length + 1), page: page, kind: kind, kindLabel: def.label,
      tag: str(it.tag, 40), description: str(it.description, 140) || def.label, manufacturer: str(it.manufacturer, 80), model: str(it.model, 100),
      kw: ranged('kw', kind, it.kw), kwh: kind === 'bess' ? ranged('kwh', kind, it.kwh) : null, kva: ranged('kva', kind, it.kva), amps: ranged('amps', kind, it.amps),
      voltage: str(it.voltage, 40), quantity: it.quantity == null ? 1 : (ranged('quantity', kind, Math.round(+it.quantity)) || null),
      lengthFt: (kind === 'conduit_run' || kind === 'trench' || kind === 'fence') ? ranged('length_ft', kind, it.length_ft) : null,
      box: box(it.box), source: oneOf(it.source, SOURCES, 'drawing'), quote: quote, confidence: level(it.confidence, quote),
      place: def.place ? { via: def.place.via, id: def.place.id } : null, note: def.note || null
    };
    if (kind === 'ev_charger') settleCharger(item, [quote]);
    /* a quantity the model printed but that is impossible is a misread: keep the item, unticked, quantity unknown */
    if (item.quantity == null) { item.quantity = 1; item.confidence = 'low'; item.quantityUnread = true; }
    out.items.push(item);
  });
  (Array.isArray(raw.facts) ? raw.facts.slice(0, 80) : []).forEach(function (f) {
    if (!f || typeof f !== 'object' || FACT_KEYS.indexOf(f.key) < 0) { dropped++; return; }
    var def = FACTS[f.key], quote = str(f.quote, 300), fact = { id: 'p' + page + '-f' + (out.facts.length + 1), page: page, key: f.key, label: def.label, unit: def.unit || null,
      text: str(f.text, 200), number: def.unit ? num(f.number, def.lo, def.hi) : null, box: box(f.box), quote: quote, confidence: level(f.confidence, quote) };
    if (def.unit ? fact.number == null : !fact.text) { dropped++; return; }
    out.facts.push(fact);
  });
  out.notes = (Array.isArray(raw.notes) ? raw.notes : []).map(function (n) { return str(n, 240); }).filter(Boolean).slice(0, 5);
  out.dropped = dropped;
  return out;
}

/* ── one plan set: the sheets together ── */
function norm(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
var RANK = { high: 3, medium: 2, low: 1 };
function where(pages, sheets) {
  return pages.map(function (p) { var s = sheets[p]; return s && s.sheet.number ? s.sheet.number : 'page ' + p; }).join(', ');
}
function fmt(n, unit) { var r = Math.abs(n) >= 100 ? Math.round(n) : Math.round(n * 10) / 10; return r.toLocaleString('en-US') + (unit ? ' ' + unit : ''); }
function close(a, b, tol) { return Math.abs(a - b) <= tol * Math.max(Math.abs(a), Math.abs(b)); }

/* The same unit drawn on the site plan and on the single-line is ONE unit.
   Tagged items merge by kind and tag; untagged ones by kind, model and
   rating across DIFFERENT sheets (two untagged chargers on one sheet are two
   chargers). A merged item keeps every place it was read and the larger of
   the quantities, never their sum. */
function mergeItems(sheetList) {
  var out = [], byKey = {};
  sheetList.forEach(function (s) {
    s.items.forEach(function (it) {
      var key = it.tag ? it.kind + '|T|' + norm(it.tag)
        : (it.model ? it.kind + '|M|' + norm(it.model) + '|' + (it.kw || '') + '|' + (it.kva || '') + '|' + (it.kwh || '') : null);
      var hit = key && byKey[key];
      if (hit && (it.tag || hit.pages.indexOf(it.page) < 0)) {
        if (hit.pages.indexOf(it.page) < 0) hit.pages.push(it.page);
        hit.reads.push({ id: it.id, page: it.page, quote: it.quote, box: it.box, source: it.source });
        ['manufacturer', 'model', 'kw', 'kwh', 'kva', 'amps', 'voltage', 'lengthFt'].forEach(function (f) {
          if (hit[f] == null && it[f] != null) hit[f] = it[f];
          else if (hit[f] != null && it[f] != null && typeof it[f] === 'number' && !close(hit[f], it[f], 0.02)) hit.conflicts.push(f);
        });
        if (it.quantity > hit.quantity) hit.quantity = it.quantity;
        if (RANK[it.confidence] > RANK[hit.confidence]) hit.confidence = it.confidence;
        if (it.source === 'schedule') hit.source = 'schedule';
        return;
      }
      var copy = JSON.parse(JSON.stringify(it));
      copy.pages = [it.page]; copy.reads = [{ id: it.id, page: it.page, quote: it.quote, box: it.box, source: it.source }]; copy.conflicts = [];
      out.push(copy); if (key && !byKey[key]) byKey[key] = copy;
    });
  });
  out.forEach(function (it) {
    it.conflicts = it.conflicts.filter(function (f, i, a) { return a.indexOf(f) === i; });
    /* every sheet's words decide a charger's kind, not only the first sheet's */
    if (it.kind === 'ev_charger') settleCharger(it, it.reads.map(function (r) { return r.quote || ''; }));
    /* ticked by default only when it can be placed, was read with words behind it, and nothing about it disagrees */
    it.selected = !!it.place && it.confidence !== 'low' && !it.conflicts.length;
  });
  return out;
}

/* One value per fact key. Numbers within 2% agree; anything else is a
   disagreement, shown with every sheet's value. The value kept is the most
   confident read, then the first sheet that said it. */
function mergeFacts(sheetList) {
  var by = {};
  sheetList.forEach(function (s) { s.facts.forEach(function (f) { (by[f.key] = by[f.key] || []).push(f); }); });
  return FACT_KEYS.filter(function (k) { return by[k]; }).map(function (k) {
    var reads = by[k].slice().sort(function (a, b) { return RANK[b.confidence] - RANK[a.confidence] || a.page - b.page; }), best = reads[0], def = FACTS[k];
    var distinct = [];
    reads.forEach(function (r) {
      var same = distinct.filter(function (d) { return def.unit ? close(d.number, r.number, 0.02) : norm(d.text) === norm(r.text); })[0];
      if (same) { if (same.pages.indexOf(r.page) < 0) same.pages.push(r.page); } else distinct.push({ number: r.number, text: r.text, pages: [r.page] });
    });
    return { key: k, label: def.label, unit: def.unit || null, number: best.number, text: best.text, confidence: best.confidence, quote: best.quote, box: best.box, page: best.page,
      pages: reads.map(function (r) { return r.page; }).filter(function (p, i, a) { return a.indexOf(p) === i; }), values: distinct, agree: distinct.length === 1 };
  });
}

/* Volts line-to-line from a printed service ("480Y/277V 3PH", "208/120V",
   "240V 1PH"); null when it cannot be told. */
function serviceVolts(text) {
  var m = /(\d{3,5})\s*(?:Y|\/|V|\s)/i.exec(String(text || ''));
  if (!m) return null;
  var v = +m[1]; if (!(v >= 100 && v <= 35000)) return null;
  var single = /1\s*(?:PH|Ø|PHASE)|SINGLE/i.test(text) || (v === 240 && !/3\s*(?:PH|Ø|PHASE)|THREE/i.test(text));
  return { volts: v, phases: single ? 1 : 3 };
}

/* The cross-checks. Each compares two things the SHEETS printed; none
   brings in an outside figure, and none is an engineering verdict — each
   says what disagrees and where, for a person to look at. */
function check(sheetList) {
  sheetList = (sheetList || []).filter(function (s) { return s && Array.isArray(s.items) && Array.isArray(s.facts); });
  var pages = {}, issues = [];
  sheetList.forEach(function (s) { pages[s.page] = s; });
  var items = mergeItems(sheetList), facts = mergeFacts(sheetList), F = {};
  facts.forEach(function (f) { F[f.key] = f; });
  function issue(level, code, text, pp) { issues.push({ level: level, code: code, text: text, pages: (pp || []).filter(function (p, i, a) { return a.indexOf(p) === i; }) }); }

  facts.forEach(function (f) {
    if (f.agree) return;
    issue('warn', 'disagree', f.label + ' differs between sheets: ' + f.values.map(function (v) {
      return (f.unit ? fmt(v.number, f.unit) : '“' + v.text + '”') + ' on ' + where(v.pages, pages);
    }).join('; ') + '.', f.pages);
  });
  items.forEach(function (it) {
    if (it.conflicts.length) issue('warn', 'item-conflict', (it.tag || it.kindLabel) + ': ' + it.conflicts.join(', ') + ' read differently on ' + where(it.pages, pages) + '.', it.pages);
  });

  var dc = F.pv_kw_dc, n = F.pv_module_count, w = F.pv_module_watts;
  if (dc && n && w) {
    var built = n.number * w.number / 1000;
    if (!close(built, dc.number, 0.03)) issue('warn', 'pv-modules', fmt(n.number) + ' modules × ' + fmt(w.number, 'W') + ' is ' + fmt(built, 'kW-DC') +
      ', but the plan states ' + fmt(dc.number, 'kW-DC') + ' (' + where(dc.pages, pages) + ').', [n.page, w.page, dc.page]);
  }
  var bkw = F.bess_kw, bkwh = F.bess_kwh;
  if (bkw && bkwh) {
    var hours = bkwh.number / bkw.number;
    if (hours < 0.5 || hours > 8) issue('warn', 'bess-duration', 'The battery reads ' + fmt(bkwh.number, 'kWh') + ' at ' + fmt(bkw.number, 'kW') + ', a ' + fmt(hours) + '-hour duration. Check both figures.', [bkw.page, bkwh.page]);
  }
  var bessItems = items.filter(function (it) { return it.kind === 'bess' && it.kw != null; });
  if (bkw && bessItems.length) {
    var sum = bessItems.reduce(function (t, it) { return t + it.kw * it.quantity; }, 0);
    if (!close(sum, bkw.number, 0.05)) issue('warn', 'bess-sum', 'The battery units add to ' + fmt(sum, 'kW') + ' but the plan states ' + fmt(bkw.number, 'kW') + ' (' + where(bkw.pages, pages) + ').', [bkw.page].concat(bessItems.map(function (it) { return it.page; })));
  }
  var chargers = items.filter(function (it) { return it.kind === 'ev_charger'; }), ports = chargers.reduce(function (t, it) { return t + it.quantity; }, 0);
  if (F.ev_charger_count && chargers.length && ports !== F.ev_charger_count.number) {
    issue('warn', 'ev-count', 'The plan states ' + fmt(F.ev_charger_count.number) + ' chargers (' + where(F.ev_charger_count.pages, pages) + ') but ' + fmt(ports) + ' are listed on the drawings.', F.ev_charger_count.pages);
  }
  var xf = F.transformer_kva ? F.transformer_kva.number : items.filter(function (it) { return it.kind === 'transformer' && it.kva; }).reduce(function (m, it) { return Math.max(m, it.kva); }, 0);
  var through = Math.max(bkw ? bkw.number : 0, F.pv_kw_ac ? F.pv_kw_ac.number : 0);
  if (xf && through && xf < through) issue('warn', 'xfmr-size', 'The transformer reads ' + fmt(xf, 'kVA') + ', below the ' + fmt(through, 'kW') + ' the plan sends through it. Confirm the rating or the configuration.', []);
  var sv = F.service_voltage && serviceVolts(F.service_voltage.text), amps = F.service_amps || F.main_breaker_amps;
  var evKw = chargers.reduce(function (t, it) { return t + (it.kw || (F.ev_charger_kw ? F.ev_charger_kw.number : 0)) * it.quantity; }, 0);
  if (sv && amps && evKw) {
    var cap = amps.number * sv.volts * (sv.phases === 3 ? Math.sqrt(3) : 1) / 1000;
    if (evKw > cap) issue('warn', 'service-ev', 'The chargers listed total ' + fmt(evKw, 'kW') + ', more than the ' + fmt(cap, 'kW') + ' a ' + fmt(amps.number, 'A') + ' service at ' + sv.volts + ' V carries at full load. Check load management or the service.', amps.pages);
  }
  var low = items.filter(function (it) { return it.confidence === 'low'; }).length;
  if (low) issue('info', 'low-confidence', low + (low === 1 ? ' item was' : ' items were') + ' read with low confidence and left unticked. Look at each crop before placing it.', []);
  sheetList.forEach(function (s) {
    if (s.unreadable) issue('info', 'unreadable', (s.sheet.number || 'Page ' + s.page) + ' could not be read: ' + s.unreadable, [s.page]);
    if (s.dropped) issue('info', 'dropped', (s.sheet.number || 'Page ' + s.page) + ': ' + s.dropped + ' entr' + (s.dropped === 1 ? 'y' : 'ies') + ' did not fit the reader’s schema and were left out.', [s.page]);
  });

  return {
    version: VERSION, items: items, facts: facts, issues: issues,
    sheets: sheetList.map(function (s) { return { page: s.page, number: s.sheet.number, title: s.sheet.title, discipline: s.sheet.discipline, scale: s.sheet.scale, revision: s.sheet.revision, items: s.items.length, facts: s.facts.length, notes: s.notes, unreadable: s.unreadable }; }),
    summary: { sheets: sheetList.length, items: items.length, placeable: items.filter(function (it) { return !!it.place; }).length, selected: items.filter(function (it) { return it.selected; }).length,
      facts: facts.length, warnings: issues.filter(function (i) { return i.level === 'warn'; }).length }
  };
}

/* ── what changed since the plans (Blueprint to Build, Phase 5: "plan set
   in → plan set out") ─────────────────────────────────────────────────────
   `read` is the project's saved read (S.planRead: what the customer's plans
   stated, and, from v2, every placeable item with its read figures and how
   many of it Place put down). `now` is what the drawing holds, as the Run
   counts it: the pieces that still carry this read's provenance with their
   current ratings, how many pieces of each kind stand on the drawing, and
   its totals. Every figure the plans gave is AS READ, CHANGED, FEWER, MORE,
   REMOVED or NOT PLACED; a stated total or a listed run DIFFERS or is NOT
   DRAWN; what stands on the drawing beyond the plans is ADDED. It compares
   figures the plans printed with figures the drawing carries. It is never an
   engineering judgement, and it says what it could not compare. The editor's
   plan set prints it as sheet E0.1. */
var CHANGE_ORDER = ['changed', 'fewer', 'more', 'removed', 'not-placed', 'differs', 'not-drawn', 'added', 'as-read', 'listed'];
var CHANGE_LABEL = { changed: 'Changed', fewer: 'Fewer', more: 'More', removed: 'Removed', 'not-placed': 'Not placed', differs: 'Differs',
  'not-drawn': 'Not drawn', added: 'Added', 'as-read': 'As read', listed: 'Listed' };
var SECTIONS = { stated: 'Stated in the plans', placed: 'Placed from the plans', listed: 'Listed in the plans', added: 'On the drawing, not from the plans' };
var SECTION_ORDER = ['stated', 'placed', 'listed', 'added'];
var SAME_TOL = 0.02;
/* the stated facts a drawing carries a figure for, and which figure */
var STATED = {
  bess_kw:          { now: 'bessKw', unit: 'kW' },
  bess_kwh:         { now: 'bessKwh', unit: 'kWh' },
  pv_kw_dc:         { now: 'solarKwDc', unit: 'kW-DC' },
  ev_charger_count: { now: 'chargers', unit: 'chargers', exact: true }
};
/* a listed kind's figure and the drawing's total it is compared with */
var LISTED_TOTAL = {
  solar_array: { field: 'kw', now: 'solarKwDc', unit: 'kW-DC', stated: 'pv_kw_dc', what: 'solar' },
  conduit_run: { field: 'lengthFt', now: 'conduitFt', unit: 'ft', what: 'conduit' },
  trench:      { field: 'lengthFt', now: 'trenchFt', unit: 'ft', what: 'trench' }
};
var ADDED_TOTAL = [['solarKwDc', 'Solar arrays', 'kW-DC', 'solar_array', 'pv_kw_dc'], ['conduitFt', 'Conduit', 'ft', 'conduit_run'], ['trenchFt', 'Trench', 'ft', 'trench']];
/* The drawing's count a read kind lands under: a battery is any battery
   (the fleet's units), a charger any charger the Run prices, equipment its
   Insert id (switchgear and panelboards both place a panel). */
function countKey(kind) {
  if (kind === 'bess') return 'bess';
  if (kind === 'ev_charger') return 'charger';
  var k = KINDS[kind]; return k && k.place && k.place.via === 'eq' ? 'eq:' + k.place.id : null;
}
var COUNT_LABEL = { bess: 'Battery storage', charger: 'EV chargers' };
KIND_KEYS.forEach(function (k) {
  var key = countKey(k); if (!key || COUNT_LABEL[key]) return;
  COUNT_LABEL[key] = KIND_KEYS.filter(function (o) { return countKey(o) === key; }).map(function (o) { return KINDS[o].label; }).join(' / ');
});
function rating(o) {
  var r = [];
  if (o.kw != null) r.push(fmt(o.kw, 'kW')); if (o.kwh != null) r.push(fmt(o.kwh, 'kWh'));
  if (o.kva != null) r.push(fmt(o.kva, 'kVA')); if (o.amps != null) r.push(fmt(o.amps, 'A'));
  if (o.lengthFt != null) r.push(fmt(o.lengthFt, 'ft'));
  return r.join(' / ');
}
function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
function cleanRead(read) {
  read = read && typeof read === 'object' ? read : {};
  var items = Array.isArray(read.items) ? read.items.slice(0, 400).map(function (it) {
    it = it || {}; var kind = oneOf(it.kind, KIND_KEYS, 'other');
    return { id: str(it.id, 60), kind: kind, tag: str(it.tag, 60), model: str(it.model, 120), manufacturer: str(it.manufacturer, 80),
      kw: num(it.kw, 0, 2000000), kwh: num(it.kwh, 0, 10000000), kva: num(it.kva, 0, 500000), amps: num(it.amps, 0, 20000), lengthFt: num(it.lengthFt, 0, 10000000),
      quantity: Math.max(1, Math.min(500, Math.floor(+it.quantity || 1))), placed: Math.max(0, Math.min(500, Math.floor(+it.placed || 0))), sheet: str(it.sheet, 40) };
  }).filter(function (it) { return it.id; }) : null;
  return {
    v: Math.max(1, Math.floor(+read.v || 1)), id: str(read.id, 60), fileName: str(read.fileName, 160), readAt: str(read.readAt, 40),
    sheets: (Array.isArray(read.sheets) ? read.sheets.slice(0, 80) : []).map(function (s) { s = s || {}; return { page: Math.floor(+s.page || 0), number: str(s.number, 24) }; }),
    facts: (Array.isArray(read.facts) ? read.facts.slice(0, 80) : []).map(function (f) { f = f || {}; return { key: oneOf(f.key, FACT_KEYS, null), number: num(f.number, 0, 1e9), sheet: str(f.sheet, 40), agree: f.agree !== false }; })
      .filter(function (f) { return f.key && f.number != null; }),
    listed: (Array.isArray(read.listed) ? read.listed.slice(0, 400) : []).map(function (it) {
      it = it || {}; return { kind: oneOf(it.kind, KIND_KEYS, 'other'), tag: str(it.tag, 60), kw: num(it.kw, 0, 2000000), lengthFt: num(it.lengthFt, 0, 10000000),
        quantity: Math.max(1, Math.min(500, Math.floor(+it.quantity || 1))), sheet: str(it.sheet, 40) };
    }),
    items: items
  };
}
function cleanNow(now) {
  now = now && typeof now === 'object' ? now : {};
  var from = (Array.isArray(now.fromRead) ? now.fromRead.slice(0, 5000) : []).map(function (p) {
    p = p || {}; return { item: str(p.item, 60), kw: num(p.kw, 0, 2000000), kwh: num(p.kwh, 0, 10000000), model: str(p.model, 120) };
  }).filter(function (p) { return p.item; });
  var counts = {}, labels = {}, c = now.counts && typeof now.counts === 'object' ? now.counts : {}, l = now.labels && typeof now.labels === 'object' ? now.labels : {};
  Object.keys(c).slice(0, 200).forEach(function (k) {
    var key = str(k, 40), n = num(c[k], 0, 100000);
    if (key && n != null) { counts[key] = Math.floor(n); labels[key] = COUNT_LABEL[key] || str(l[k], 80) || key; }
  });
  var t = now.totals && typeof now.totals === 'object' ? now.totals : {}, totals = {}, scaled = now.scaled !== false;
  ['bessKw', 'bessKwh', 'solarKwDc', 'chargers', 'conduitFt', 'trenchFt'].forEach(function (k) { totals[k] = num(t[k], 0, 1e9) || 0; });
  /* a drawing not set to scale has no lengths: unknown, never zero */
  if (!scaled) { totals.conduitFt = null; totals.trenchFt = null; }
  return { fromRead: from, counts: counts, labels: labels, totals: totals, scaled: scaled };
}
function changes(readIn, nowIn) {
  var read = cleanRead(readIn), N = cleanNow(nowIn), rows = [], notes = [], onDrawing = {}, items = read.items;
  var stated = {}, listedKinds = {};
  read.facts.forEach(function (f) { if (!stated[f.key]) stated[f.key] = f; });
  read.listed.forEach(function (it) { listedKinds[it.kind] = true; });
  function row(r) { r.statusLabel = CHANGE_LABEL[r.status]; r.sectionLabel = SECTIONS[r.section]; rows.push(r); }

  /* the totals the plans stated, against the drawing's own totals */
  Object.keys(STATED).forEach(function (k) {
    var f = stated[k], d = STATED[k]; if (!f) return;
    var have = N.totals[d.now], status = !have ? 'not-drawn' : (d.exact ? Math.round(have) === Math.round(f.number) : close(have, f.number, SAME_TOL)) ? 'as-read' : 'differs';
    var note = status === 'differs' ? 'The drawing carries ' + fmt(have, d.unit) + '; the plans state ' + fmt(f.number, d.unit) + '.' : status === 'not-drawn' ? 'Stated in the plans; none is on the drawing.' : '';
    if (!f.agree) note = (note ? note + ' ' : '') + 'The plans’ own sheets disagree on this figure; the read kept ' + fmt(f.number, d.unit) + '.';
    row({ section: 'stated', key: k, label: FACTS[k].label, sheet: f.sheet, plans: fmt(f.number, d.unit), drawing: have ? fmt(have, d.unit) : 'none', status: status, note: note });
  });

  /* each item placed from the plans, against the pieces still carrying it */
  if (items) items.forEach(function (it) {
    var key = countKey(it.kind), pieces = N.fromRead.filter(function (p) { return p.item === it.id; }), m = pieces.length;
    if (key) onDrawing[key] = (onDrawing[key] || 0) + m;
    /* what it is (the model printed, else the kind) and its figures, on both sides */
    var printed = [it.model || KINDS[it.kind].label, rating(it)].filter(Boolean).join(' · ');
    var fields = {}, moved = pieces.filter(function (p) {
      var kw = it.kw != null && p.kw != null && !close(p.kw, it.kw, SAME_TOL), kwh = it.kwh != null && p.kwh != null && !close(p.kwh, it.kwh, SAME_TOL),
        model = !!(it.model && p.model && norm(p.model) !== norm(it.model));
      if (kw) fields.kW = 1; if (kwh) fields.kWh = 1; if (model) fields.model = 1;
      return kw || kwh || model;
    });
    var groups = {}, order = [];
    pieces.forEach(function (p) {
      var t = [p.model || KINDS[it.kind].label, rating(p)].filter(Boolean).join(' · ');
      if (groups[t] == null) { groups[t] = 0; order.push(t); } groups[t]++;
    });
    var drawn = m ? order.map(function (t) { return groups[t] + ' × ' + t; }).join('; ') : 'none';
    var status = !m ? (it.placed ? 'removed' : 'not-placed') : moved.length ? 'changed' : m < it.quantity ? 'fewer' : m > it.quantity ? 'more' : 'as-read', note = [];
    if (status === 'removed') note.push('Placed from the plans; none is on the drawing now.');
    if (status === 'not-placed') note.push('In the plans; not placed when they were read.');
    if (moved.length) note.push('The ' + Object.keys(fields).join(' and ') + ' on ' + plural(moved.length, 'unit', 'units') + ' differ' + (Object.keys(fields).length === 1 ? 's' : '') + ' from the plans.');
    if (m && m !== it.quantity) note.push('The plans show ' + it.quantity + '; ' + m + (m === 1 ? ' is' : ' are') + ' on the drawing' + (it.placed < it.quantity ? ' (' + it.placed + ' placed from them)' : '') + '.');
    row({ section: 'placed', key: key, kind: it.kind, label: it.tag || KINDS[it.kind].label, sheet: it.sheet, plans: it.quantity + ' × ' + printed, drawing: drawn, status: status, note: note.join(' ') });
  });
  else notes.push('This read was saved before Read Plans kept each item’s figures, so placed items are not compared one by one. Read the plans again to compare them.');

  /* what the plans only listed: their figures summed, against the drawing's */
  var byKind = {};
  read.listed.forEach(function (it) { (byKind[it.kind] = byKind[it.kind] || []).push(it); });
  Object.keys(byKind).forEach(function (kind) {
    var list = byKind[kind], d = LISTED_TOTAL[kind], tags = list.map(function (it) { return it.tag; }).filter(Boolean);
    var label = KINDS[kind].label + (tags.length ? ' (' + tags.slice(0, 4).join(', ') + (tags.length > 4 ? ', …' : '') + ')' : '');
    var sheets = list.map(function (it) { return it.sheet; }).filter(function (s, i, a) { return s && a.indexOf(s) === i; }).join(', ');
    var withFig = d ? list.filter(function (it) { return it[d.field] != null; }) : [];
    var have = d ? N.totals[d.now] : 0;
    if (d && have === null) {
      row({ section: 'listed', key: kind, kind: kind, label: label, sheet: sheets, plans: withFig.length ? fmt(withFig.reduce(function (t, it) { return t + it[d.field] * it.quantity; }, 0), d.unit) : plural(list.length, 'item', 'items'),
        drawing: 'not to scale', status: 'listed', note: 'The drawing is not set to scale, so its lengths are not compared. Calibrate the map to compare them.' });
      return;
    }
    if (!d || !withFig.length) {
      row({ section: 'listed', key: kind, kind: kind, label: label, sheet: sheets, plans: plural(list.length, 'item', 'items'), drawing: d ? (have ? fmt(have, d.unit) : 'none') : '—', status: 'listed',
        note: d ? 'No ' + (d.field === 'kw' ? 'rating' : 'length') + ' printed for it, so it is not compared.' : 'Listed in the plans; Read Plans does not draw it.' });
      return;
    }
    var sum = withFig.reduce(function (t, it) { return t + it[d.field] * it.quantity; }, 0);
    if (d.stated && stated[d.stated]) {
      row({ section: 'listed', key: kind, kind: kind, label: label, sheet: sheets, plans: fmt(sum, d.unit), drawing: '—', status: 'listed', note: 'Compared above with the plans’ stated ' + FACTS[d.stated].label + '.' });
      return;
    }
    var status = !have ? 'not-drawn' : close(have, sum, SAME_TOL) ? 'as-read' : 'differs', note = [];
    if (status === 'differs') note.push('The drawing carries ' + fmt(have, d.unit) + ' of ' + d.what + ' in all; the plans read ' + fmt(sum, d.unit) + '.');
    if (status === 'not-drawn') note.push('Listed in the plans; none is drawn.');
    if (withFig.length < list.length) note.push(plural(list.length - withFig.length, 'item has', 'items have') + ' no figure printed and ' + (list.length - withFig.length === 1 ? 'is' : 'are') + ' left out of the sum.');
    row({ section: 'listed', key: kind, kind: kind, label: label, sheet: sheets, plans: fmt(sum, d.unit), drawing: have ? fmt(have, d.unit) : 'none', status: status, note: note.join(' ') });
  });

  /* what stands on the drawing beyond the plans */
  if (items) Object.keys(N.counts).forEach(function (key) {
    var extra = N.counts[key] - (onDrawing[key] || 0);
    if (extra > 0) row({ section: 'added', key: key, label: N.labels[key], sheet: null, plans: '—', drawing: extra + ' on the drawing', status: 'added', note: 'On the drawing; not placed from the plans.' });
  });
  ADDED_TOTAL.forEach(function (a) {
    var have = N.totals[a[0]];
    if (have > 0 && !listedKinds[a[3]] && !(a[4] && stated[a[4]])) row({ section: 'added', key: a[0], label: a[1], sheet: null, plans: '—', drawing: fmt(have, a[2]), status: 'added', note: 'On the drawing; nothing was read for it from the plans.' });
  });

  /* section by section, and within one what differs first */
  rows.forEach(function (r, i) { r._i = i; });
  rows.sort(function (a, b) { return SECTION_ORDER.indexOf(a.section) - SECTION_ORDER.indexOf(b.section) || CHANGE_ORDER.indexOf(a.status) - CHANGE_ORDER.indexOf(b.status) || a._i - b._i; });
  rows.forEach(function (r) { delete r._i; });
  var summary = {};
  rows.forEach(function (r) { summary[r.status] = (summary[r.status] || 0) + 1; });
  var differ = rows.filter(function (r) { return ['as-read', 'listed'].indexOf(r.status) < 0; }).length;
  return {
    version: VERSION,
    read: { id: read.id, fileName: read.fileName, readAt: read.readAt, v: read.v, sheets: read.sheets.map(function (s) { return s.number || 'p.' + s.page; }) },
    rows: rows, summary: summary, differ: differ, notes: notes, compared: !!items, labels: CHANGE_LABEL, order: CHANGE_ORDER, sections: SECTIONS, sectionOrder: SECTION_ORDER,
    basis: 'Figures as printed on the customer’s sheets (read by Read Plans, each with the words it was read from) against the drawing as the Run counts it. Ratings agree within 2%. A difference is listed for a person to review; it is not an engineering judgement.'
  };
}

/* A sheet as read() returned it, back through the normaliser: `check`
   takes sheets from the browser, so it re-applies every rule above rather
   than trusting what came back. Same order in, same ids out. */
function revive(s) {
  s = s && typeof s === 'object' ? s : {};
  var raw = { sheet: s.sheet, notes: s.notes, unreadable: s.unreadable,
    items: (Array.isArray(s.items) ? s.items : []).map(function (it) { it = it || {}; return { kind: it.kind, tag: it.tag, description: it.description, manufacturer: it.manufacturer, model: it.model,
      kw: it.kw, kwh: it.kwh, kva: it.kva, amps: it.amps, voltage: it.voltage, quantity: it.quantityUnread ? 0 : it.quantity, length_ft: it.lengthFt, box: it.box, source: it.source, quote: it.quote, confidence: it.confidence }; }),
    facts: (Array.isArray(s.facts) ? s.facts : []).map(function (f) { f = f || {}; return { key: f.key, text: f.text, number: f.number, box: f.box, quote: f.quote, confidence: f.confidence }; }) };
  var out = normalize(raw, { page: s.page });
  out.dropped += Math.max(0, Math.floor(+s.dropped || 0));
  return out;
}

/* Parse the model's text answer: structured outputs return one JSON object,
   but a refusal or a cut-off answer is not that. */
function parse(text) {
  text = String(text || '').trim();
  try { return JSON.parse(text); } catch (e) {}
  var a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(text.slice(a, b + 1)); } catch (e2) {} }
  return null;
}

module.exports = { VERSION: VERSION, KINDS: KINDS, FACTS: FACTS, SCHEMA: SCHEMA, SYSTEM: SYSTEM, RANGE: RANGE,
  request: request, normalize: normalize, revive: revive, check: check, parse: parse, serviceVolts: serviceVolts, _box: box,
  changes: changes, countKey: countKey, CHANGE_ORDER: CHANGE_ORDER };
