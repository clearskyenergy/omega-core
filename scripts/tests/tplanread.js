#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   Build › Read Plans, held without a browser or a network.

   The library (api/_lib/plan-read.js): the schema is closed the way
   structured outputs need it; the request names the model the SERVER chose;
   the normaliser keeps only what the sheet's words carry (no quote → low,
   an impossible number → null, an unknown kind → dropped and counted); a
   charger is Level 2 or DC fast only by what is printed; the cross-check on
   the sample plan set (scripts/_lib/plan-fixture.js) merges the same unit
   across sheets (quantities never summed), names the 1,200 vs 1,290 kWh
   disagreement with both sheets, leaves the low-confidence read unticked,
   and lists solar and runs without placing them; every check fires on its
   own crafted case and none fires on agreeing figures; revive() re-applies
   every rule to what a browser sends back. What changed since the plans:
   each status on its own case (a re-rated battery, a deleted charger, a
   copy, a removed transformer, the box never placed, a meter added by
   hand), the 2% tolerance, an exact count, the plans' own disagreement
   named, listed figures summed and folded under a stated total, no lengths
   on a drawing not set to scale, a v1 read compared on its totals only,
   junk sanitised, section by section with what differs first.

   The door (api/plan-read.js) on the Firestore double with Claude stubbed:
   the model and the key are the server's (a body naming a model changes
   nothing); a sheet read twice is answered from the workspace's cache and
   counted once; the daily caps refuse BEFORE the model is called; a failed,
   refused or cut-off read gives its place back; no key means nothing is
   read or counted; and the plan, the member, the email and the workspace's
   status each refuse on their own.
   node scripts/tests/tplanread.js */
'use strict';
var assert = require('node:assert/strict'), path = require('path');
var ROOT = path.join(__dirname, '..', '..');
var P = require(path.join(ROOT, 'api', '_lib', 'plan-read.js'));
var FX = require(path.join(ROOT, 'scripts', '_lib', 'plan-fixture.js'));
var FD = require(path.join(ROOT, 'scripts', '_lib', 'firestore-double.js'));
var pass = 0;
function ok(c, m) { assert.ok(c, m); pass++; }
function eq(a, b, m) { assert.deepEqual(a, b, m); pass++; }

(async function () {
  /* ── 1. the schema: every object closed, every property required ── */
  (function walk(node, where) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'object') {
      ok(node.additionalProperties === false, where + ' is closed');
      eq(Object.keys(node.properties).sort(), node.required.slice().sort(), where + ' requires every property');
      Object.keys(node.properties).forEach(function (k) { walk(node.properties[k], where + '.' + k); });
    }
    if (node.items) walk(node.items, where + '[]');
    (node.anyOf || []).forEach(function (n, i) { walk(n, where + '|' + i); });
    ok(!('minimum' in node) && !('maximum' in node) && !('minLength' in node) && !('maxLength' in node), where + ' uses no constraint structured outputs refuses');
  })(P.SCHEMA, 'schema');
  eq(P.SCHEMA.properties.items.items.properties.kind.enum, Object.keys(P.KINDS), 'the item kinds are the KINDS table');
  eq(P.SCHEMA.properties.facts.items.properties.key.enum, Object.keys(P.FACTS), 'the fact keys are the FACTS table');

  /* ── 2. the request ── */
  var rq = P.request({ page: 3, of: 9, fileName: 'set.pdf', text: 'E-601 SCHEDULE', mediaType: 'image/jpeg', imageBase64: 'AAAA' }, { model: 'claude-opus-5-5' });
  eq(rq.model, 'claude-opus-5-5', 'the model is the one the server passed');
  eq(rq.output_config.format.type, 'json_schema', 'structured output');
  ok(rq.output_config.format.schema === P.SCHEMA && rq.output_config.effort === 'medium', 'the one schema, at medium effort by default');
  eq(rq.fallbacks, 'default', 'a refusal falls back to Anthropic’s recommended model');
  ok(!('fallbacks' in P.request({ imageBase64: 'A' }, { model: 'm', fallbacks: false })), 'and that can be turned off');
  eq(rq.messages[0].content[0].type, 'image', 'the sheet image goes first');
  ok(/page 3 of 9/.test(rq.messages[0].content[1].text) && /E-601 SCHEDULE/.test(rq.messages[0].content[1].text), 'the page and its text layer ride with it');
  ok(/no text layer/.test(P.request({ imageBase64: 'A' }, { model: 'm' }).messages[0].content[1].text), 'a scan says it has no text layer');
  ok(/READ, NEVER INVENT/.test(P.SYSTEM) && /quote/.test(P.SYSTEM) && /null/.test(P.SYSTEM), 'the prompt asks for the words read and nulls over guesses');

  /* ── 3. the normaliser ── */
  var n = P.normalize({
    sheet: { number: 'E-1', title: 'X', discipline: 'nonsense', scale: null, revision: null },
    items: [
      { kind: 'ev_charger', tag: 'EV-1', description: 'charger', kw: 40000, quantity: 2, box: { x: 0.1, y: 0.1, w: 0.1, h: 0.05 }, source: 'drawing', quote: 'EV-1', confidence: 'high' },
      { kind: 'nuke', quote: 'X' },
      { kind: 'bess', tag: 'B', kw: 250, kwh: 1000, quantity: 0, box: { x: 2, y: 0, w: 1, h: 1 }, quote: '', confidence: 'high' },
      { kind: 'meter', tag: 'M', kwh: 99, length_ft: 50, quote: 'M', confidence: 'medium' },
      { kind: 'trench', length_ft: 240, quote: '240 LF', confidence: 'high' }
    ],
    facts: [{ key: 'pv_kw_dc', number: 315, quote: '315 kW-DC', confidence: 'high' }, { key: 'pv_kw_dc', number: -5, quote: 'x', confidence: 'high' },
      { key: 'utility', text: '', quote: 'UTILITY', confidence: 'high' }, { key: 'secret', text: 'x', quote: 'x' }],
    notes: ['a', '', 'b'], unreadable: null
  }, { page: 4 });
  eq(n.sheet.discipline, 'other', 'an unknown discipline is other');
  eq(n.items.length, 4, 'an unknown kind is dropped');
  eq(n.items[0].kw, null, 'a 40,000 kW charger is a misread: null, never clamped');
  eq([n.items[0].quantity, n.items[0].id, n.items[0].page], [2, 'p4-i1', 4], 'ids and pages follow the sheet');
  eq(n.items[1].confidence, 'low', 'no quote → low confidence, whatever the model said');
  ok(n.items[1].quantityUnread && n.items[1].quantity === 1, 'an impossible quantity is marked unread, not trusted');
  eq(n.items[1].box, null, 'a box off the sheet is dropped');
  eq([n.items[2].kwh, n.items[2].lengthFt], [null, null], 'kWh only on a battery; a length only on a run, trench or fence');
  eq(n.items[3].lengthFt, 240, 'a trench keeps its printed length');
  eq(n.items[3].place, null, 'a trench is listed, not placed');
  eq(n.facts.length, 1, 'a fact out of range, a blank text fact and an unknown key are dropped');
  eq(n.dropped, 4, 'and every drop is counted for the page to say');
  eq(n.notes, ['a', 'b'], 'empty notes go');
  eq(P.normalize(null, { page: 1 }).items, [], 'nothing in, nothing out');

  /* chargers: Level 2 or DC fast only by what is printed */
  function charger(o) { return P.normalize({ items: [Object.assign({ kind: 'ev_charger', description: 'charger', quote: 'C', confidence: 'high' }, o)] }, { page: 1 }).items[0]; }
  eq(charger({ kw: 19.2 }).place, { via: 'shape', id: 'evl2' }, '19.2 kW is Level 2');
  eq(charger({ kw: 180 }).place, { via: 'shape', id: 'evunit' }, '180 kW is DC fast');
  eq(charger({ description: 'Level 2 charger, dual port' }).place.id, 'evl2', 'Level 2 by its words');
  eq(charger({ quote: '(2) DCFC CCS1' }).place.id, 'evunit', 'DC fast by its words');
  var unknown = charger({});
  ok(unknown.place === null && /Neither a rating/.test(unknown.note), 'neither printed: listed, not placed (they price an order of magnitude apart)');

  /* ── 4. the sample plan set ── */
  var built = await FX.build(), A = FX.answers(built.marks);
  ok(built.bytes.length > 2000 && Buffer.from(built.bytes.slice(0, 5)).toString() === '%PDF-', 'the fixture is a PDF');
  var sheets = [1, 2, 3].map(function (p) { return P.normalize(A[p], { page: p }); });
  [1, 2, 3].forEach(function (p) { A[p].items.concat(A[p].facts).forEach(function (x) { ok(x.box && x.box.w > 0, 'page ' + p + ' read "' + x.quote.slice(0, 30) + '" has a measured box'); }); });
  var R = P.check(sheets);
  var by = {}; R.items.forEach(function (it) { by[(it.tag || it.kind)] = it; });
  eq(by['ESS-1'].pages, [2, 3], 'ESS-1 on the site plan and the schedule is one unit');
  eq(by['ESS-1'].quantity, 1, 'one battery, not two');
  eq([by['ESS-1'].manufacturer, by['ESS-1'].model, by['ESS-1'].source], ['Example Storage Co', 'XS-1290', 'schedule'], 'the merged unit carries what the schedule added');
  eq(by['EV-1 THRU EV-8'].quantity, 8, 'eight chargers on two sheets are eight, never sixteen');
  eq(by['EV-1 THRU EV-8'].place.id, 'evl2', 'the schedule’s 19.2 kW makes them Level 2');
  eq(by['DC-1, DC-2'].place.id, 'evunit', 'and 180 kW makes these DC fast');
  ok(by.junction_box && by.junction_box.confidence === 'low' && by.junction_box.selected === false, 'the box read from a symbol is left unticked');
  ok(by['PV ARRAY A'].place === null && by['PV ARRAY A'].selected === false && /Draw the array/.test(by['PV ARRAY A'].note), 'solar is listed with how to draw it, not placed');
  ok(by['C-1'].place === null && by['C-1'].lengthFt === 240, 'the conduit run is listed with its length');
  ok(by['INV-1, INV-2'].selected && by['INV-1, INV-2'].quantity === 2, 'two inverters from the schedule, ticked');
  var kwh = R.facts.filter(function (f) { return f.key === 'bess_kwh'; })[0];
  ok(kwh && !kwh.agree && kwh.values.length === 2, 'the battery energy disagrees');
  var dis = R.issues.filter(function (i) { return i.code === 'disagree'; });
  eq(dis.length, 1, 'one disagreement, and only that one');
  ok(/1,200 kWh on E-001/.test(dis[0].text) && /1,290 kWh on E-601/.test(dis[0].text), 'it names both figures and both sheets: ' + dis[0].text);
  eq(dis[0].pages, [1, 3], 'and points at both pages');
  ok(R.facts.filter(function (f) { return f.key === 'bess_kw'; })[0].agree, 'the battery power agrees across sheets');
  ok(R.facts.filter(function (f) { return f.key === 'service_voltage'; })[0].pages.length === 2, 'a fact two sheets agree on carries both');
  eq(R.issues.filter(function (i) { return i.level === 'warn'; }).map(function (i) { return i.code; }), ['disagree'], 'the agreeing figures raise nothing: modules × watts, duration, charger count, transformer, service');
  eq([R.summary.sheets, R.summary.warnings], [3, 1], 'the summary');
  ok(R.summary.selected === R.items.filter(function (it) { return it.selected; }).length && R.items.every(function (it) { return !it.selected || it.place; }), 'only placeable items are ticked');

  /* ── 5. each cross-check, on its own case ── */
  function sheetWith(facts, items, page) { return P.normalize({ sheet: { number: 'S-' + (page || 1) }, facts: facts || [], items: items || [] }, { page: page || 1 }); }
  function F(key, v) { return typeof v === 'number' ? { key: key, number: v, quote: key, confidence: 'high' } : { key: key, text: v, quote: key, confidence: 'high' }; }
  function codes(list) { return P.check(list).issues.map(function (i) { return i.code; }); }
  ok(codes([sheetWith([F('pv_kw_dc', 400), F('pv_module_count', 572), F('pv_module_watts', 550)])]).indexOf('pv-modules') >= 0, '572 × 550 W is not 400 kW-DC');
  ok(codes([sheetWith([F('bess_kw', 100), F('bess_kwh', 2000)])]).indexOf('bess-duration') >= 0, 'a 20-hour battery is questioned');
  ok(codes([sheetWith([F('bess_kw', 500)], [{ kind: 'bess', tag: 'B1', kw: 250, quote: 'B1', confidence: 'high' }])]).indexOf('bess-sum') >= 0, 'one 250 kW unit is not 500 kW');
  ok(codes([sheetWith([F('ev_charger_count', 12)], [{ kind: 'ev_charger', tag: 'EV', kw: 7.2, quantity: 10, quote: 'EV', confidence: 'high' }])]).indexOf('ev-count') >= 0, '10 listed is not 12 stated');
  ok(codes([sheetWith([F('transformer_kva', 150), F('bess_kw', 500)])]).indexOf('xfmr-size') >= 0, 'a 150 kVA transformer under a 500 kW battery');
  ok(codes([sheetWith([F('service_voltage', '208Y/120V 3PH'), F('service_amps', 200)], [{ kind: 'ev_charger', tag: 'DC', kw: 150, quantity: 2, quote: 'DC', confidence: 'high' }])]).indexOf('service-ev') >= 0, '300 kW of chargers on a 200 A 208 V service');
  var two = P.check([sheetWith([F('utility', 'ComEd')], [], 1), sheetWith([F('utility', 'Ameren')], [], 2)]);
  ok(two.issues[0].code === 'disagree' && /“ComEd” on S-1; “Ameren” on S-2/.test(two.issues[0].text), 'text facts disagree too: ' + two.issues[0].text);
  var near = P.check([sheetWith([F('pv_kw_dc', 315)], [], 1), sheetWith([F('pv_kw_dc', 315.4)], [], 2)]);
  ok(near.facts[0].agree && !near.issues.length, 'within 2% is the same figure');
  var conflict = P.check([sheetWith([], [{ kind: 'transformer', tag: 'T1', kva: 500, quote: 'T1', confidence: 'high' }], 1), sheetWith([], [{ kind: 'transformer', tag: 'T-1', kva: 750, quote: 'T-1', confidence: 'high' }], 2)]);
  ok(conflict.items.length === 1 && conflict.items[0].conflicts[0] === 'kva' && conflict.items[0].selected === false && conflict.issues[0].code === 'item-conflict', 'one tag, two ratings: merged, flagged, unticked');
  var twoOnOne = P.check([sheetWith([], [{ kind: 'ev_charger', kw: 7.2, model: 'X', quote: 'a', confidence: 'high' }, { kind: 'ev_charger', kw: 7.2, model: 'X', quote: 'b', confidence: 'high' }], 1)]);
  eq(twoOnOne.items.length, 2, 'two untagged chargers on one sheet stay two');
  eq(P.serviceVolts('480Y/277V 3PH 4W'), { volts: 480, phases: 3 }, '480Y/277V is three-phase');
  eq(P.serviceVolts('240V 1PH'), { volts: 240, phases: 1 }, '240 V single-phase');
  eq(P.serviceVolts('SEE NOTES'), null, 'no voltage, no figure');

  /* revive: what a browser sends back goes through every rule again */
  eq(P.revive(sheets[2]), sheets[2], 'a sheet as read() returned it revives unchanged');
  var tampered = JSON.parse(JSON.stringify(sheets[2]));
  tampered.items[0].kw = 9e12; tampered.items.push({ kind: 'nuke', quote: 'x' }); tampered.items[1].confidence = 'certain';
  var back = P.revive(tampered);
  ok(back.items[0].kw === null && back.items.length === sheets[2].items.length && back.items[1].confidence === 'low' && back.dropped >= 1, 'an impossible kW, an unknown kind and a made-up level do not survive');
  eq(P.parse('```json\n{"a":1}\n```'), { a: 1 }, 'a fenced answer parses');
  eq(P.parse('no'), null, 'prose is not an answer');

  /* ── what changed since the plans (Blueprint to Build, Phase 5) ── */
  var READ = { v: 2, id: 'prx1', fileName: 'Sunrise plans.pdf', readAt: '2026-10-16T10:00:00Z', sheets: [{ page: 1, number: 'E-101' }, { page: 2, number: 'PV-1' }],
    facts: [{ key: 'bess_kw', number: 1000, sheet: 'E-101', agree: true }, { key: 'bess_kwh', number: 2000, sheet: 'E-101', agree: true }, { key: 'ev_charger_count', number: 8, sheet: 'E-101', agree: true }],
    listed: [{ kind: 'solar_array', tag: 'PV-1', kw: 200, quantity: 1, sheet: 'PV-1' }, { kind: 'solar_array', tag: 'PV-2', kw: 115, quantity: 1, sheet: 'PV-1' },
      { kind: 'conduit_run', tag: 'C-1', lengthFt: 120, quantity: 1, sheet: 'E-101' }, { kind: 'building', quantity: 1, sheet: 'A-1' }],
    items: [
      { id: 'b', kind: 'bess', tag: 'BESS-1', model: 'MP-2', kw: 500, kwh: 1000, quantity: 2, placed: 2, sheet: 'E-101' },
      { id: 'c', kind: 'ev_charger', tag: 'EV-1 THRU EV-8', kw: 7.2, quantity: 8, placed: 8, sheet: 'E-101' },
      { id: 't', kind: 'transformer', tag: 'T-1', kva: 1000, quantity: 1, placed: 1, sheet: 'E-101' },
      { id: 's', kind: 'switchgear', tag: 'SWG-1', amps: 2000, quantity: 1, placed: 1, sheet: 'E-101' },
      { id: 'p', kind: 'panelboard', tag: 'LP-1', amps: 225, quantity: 1, placed: 1, sheet: 'E-101' },
      { id: 'd', kind: 'disconnect', tag: 'DS-1', quantity: 1, placed: 0, sheet: 'E-101' }
    ] };
  /* the drawing exactly as Place left it */
  function asDrawn(over) {
    var now = { fromRead: [{ item: 'b', kw: 500, kwh: 1000, model: 'MP-2' }, { item: 'b', kw: 500, kwh: 1000, model: 'MP-2' }, { item: 't' }, { item: 's' }, { item: 'p' }],
      counts: { bess: 2, charger: 8, 'eq:xfmr': 1, 'eq:panel': 2 }, labels: {}, totals: { bessKw: 1000, bessKwh: 2000, solarKwDc: 315, chargers: 8, conduitFt: 120, trenchFt: 0 }, scaled: true };
    for (var i = 0; i < 8; i++) now.fromRead.push({ item: 'c', kw: 7.2, model: 'Level 2 charger' });
    return Object.assign(now, over || {});
  }
  function totals(o) { return Object.assign({}, asDrawn().totals, o); }
  function rowOf(res, label, section) { return res.rows.filter(function (r) { return r.label === label && (!section || r.section === section); })[0]; }
  function statuses(res) { var o = {}; res.rows.forEach(function (r) { o[r.section + ':' + r.label] = r.status; }); return o; }
  var same = P.changes(READ, asDrawn());
  eq(statuses(same), { 'stated:Battery power': 'as-read', 'stated:Battery energy': 'as-read', 'stated:EV chargers': 'as-read',
    'placed:DS-1': 'not-placed', 'placed:BESS-1': 'as-read', 'placed:EV-1 THRU EV-8': 'as-read', 'placed:T-1': 'as-read', 'placed:SWG-1': 'as-read', 'placed:LP-1': 'as-read',
    'listed:Solar array (PV-1, PV-2)': 'as-read', 'listed:Conduit / cable run (C-1)': 'as-read', 'listed:Building': 'listed' }, 'the drawing as Place left it reads as read, item by item; the unticked disconnect is not placed');
  eq([same.differ, same.summary['not-placed'], same.compared], [1, 1, true], 'one row differs: the item never placed');
  eq([rowOf(same, 'BESS-1').plans, rowOf(same, 'BESS-1').drawing], ['2 × MP-2 · 500 kW / 1,000 kWh', '2 × MP-2 · 500 kW / 1,000 kWh'], 'the plans’ figures beside the drawing’s, unit by unit');
  eq([rowOf(same, 'T-1').plans, rowOf(same, 'T-1').drawing], ['1 × Transformer · 1,000 kVA', '1 × Transformer'], 'a rating the drawing does not carry is shown, never compared');
  eq(rowOf(same, 'EV-1 THRU EV-8').plans, '8 × EV charger · 7.2 kW', 'no model printed: the kind names it');
  var fence = JSON.parse(JSON.stringify(READ)); fence.items.push({ id: 'f', kind: 'fence', lengthFt: 160, quantity: 1, placed: 1, sheet: 'C-1' });
  eq(rowOf(P.changes(fence, asDrawn({ fromRead: asDrawn().fromRead.concat([{ item: 'f' }]) })), 'Fence').plans, '1 × Fence · 160 ft', 'a printed length rides with the item');
  eq(rowOf(same, 'Solar array (PV-1, PV-2)').plans, '315 kW-DC', 'listed arrays are summed and set against the drawing’s solar');
  ok(/E-101/.test(rowOf(same, 'BESS-1').sheet) && same.read.fileName === 'Sunrise plans.pdf' && same.read.sheets.join() === 'E-101,PV-1', 'each row keeps its sheet, and the answer names the read');

  var mv = asDrawn(); mv.fromRead[0] = { item: 'b', kw: 500, kwh: 1100, model: 'MP-2' };
  var mr = rowOf(P.changes(READ, mv), 'BESS-1');
  ok(mr.status === 'changed' && /kWh on 1 unit differs/.test(mr.note), 'a re-rated battery is changed, and the note names the figure');
  eq(mr.drawing, '1 × MP-2 · 500 kW / 1,100 kWh; 1 × MP-2 · 500 kW / 1,000 kWh', 'the drawing column groups the units by what they carry');
  mv.fromRead[0] = { item: 'b', kw: 509, kwh: 1015, model: 'MP-2' };
  eq(rowOf(P.changes(READ, mv), 'BESS-1').status, 'as-read', 'within 2% is as read');
  mv.fromRead[0] = { item: 'b', kw: 500, kwh: 1030, model: 'MP-2' };
  eq(rowOf(P.changes(READ, mv), 'BESS-1').status, 'changed', 'and 3% is not');
  mv.fromRead[0] = { item: 'b', kw: 500, kwh: 1000, model: 'mp 2' };
  eq(rowOf(P.changes(READ, mv), 'BESS-1').status, 'as-read', 'a model differing only in case and punctuation is the same model');
  mv.fromRead[0] = { item: 'b', kw: 600, kwh: 1000, model: 'Megapack 2 XL' };
  ok(/kW and model on 1 unit differ/.test(rowOf(P.changes(READ, mv), 'BESS-1').note), 'another model and another rating, both named');

  var fw = asDrawn({ counts: { bess: 2, charger: 6, 'eq:xfmr': 1, 'eq:panel': 2 }, totals: totals({ chargers: 6 }) });
  fw.fromRead = fw.fromRead.slice(0, 11);
  var fr = P.changes(READ, fw);
  eq([rowOf(fr, 'EV-1 THRU EV-8').status, rowOf(fr, 'EV-1 THRU EV-8').drawing], ['fewer', '6 × Level 2 charger · 7.2 kW'], 'two chargers taken off: fewer');
  ok(/The plans show 8; 6 are on the drawing/.test(rowOf(fr, 'EV-1 THRU EV-8').note), 'and how many');
  eq([rowOf(fr, 'EV chargers', 'stated').status, rowOf(fr, 'EV chargers', 'stated').drawing], ['differs', '6 chargers'], 'the plans’ stated charger count differs too');
  var more = asDrawn({ counts: { bess: 2, charger: 9, 'eq:xfmr': 1, 'eq:panel': 2 }, totals: totals({ chargers: 9 }) });
  more.fromRead.push({ item: 'c', kw: 7.2, model: 'Level 2 charger' });
  var mo = P.changes(READ, more);
  ok(rowOf(mo, 'EV-1 THRU EV-8').status === 'more' && !mo.rows.some(function (r) { return r.section === 'added'; }), 'a copy of a placed charger carries the read: more, not added');
  var gone = asDrawn({ counts: { bess: 2, charger: 8, 'eq:panel': 2 } });
  gone.fromRead = gone.fromRead.filter(function (p) { return p.item !== 't'; });
  ok(rowOf(P.changes(READ, gone), 'T-1').status === 'removed' && /none is on the drawing/.test(rowOf(P.changes(READ, gone), 'T-1').note), 'a placed transformer deleted: removed');
  var cut = JSON.parse(JSON.stringify(READ)); cut.items[1].quantity = 60; cut.items[1].placed = 40;
  var cr = asDrawn({ counts: { bess: 2, charger: 40, 'eq:xfmr': 1, 'eq:panel': 2 }, totals: totals({ chargers: 40 }) });
  for (var ci = 8; ci < 40; ci++) cr.fromRead.push({ item: 'c', kw: 7.2, model: 'Level 2 charger' });
  ok(rowOf(P.changes(cut, cr), 'EV-1 THRU EV-8').status === 'fewer' && /40 placed from them/.test(rowOf(P.changes(cut, cr), 'EV-1 THRU EV-8').note), 'the plans’ 60 against the 40 one Place puts down: fewer than the plans, and why');

  var add = asDrawn({ counts: { bess: 2, charger: 10, 'eq:xfmr': 1, 'eq:panel': 3, 'eq:meter': 2 }, labels: { 'eq:meter': 'Meter', 'eq:panel': 'Bogus' }, totals: totals({ chargers: 10, trenchFt: 140 }) });
  var ad = P.changes(READ, add);
  eq(ad.rows.filter(function (r) { return r.section === 'added'; }).map(function (r) { return [r.label, r.drawing]; }),
    [['EV chargers', '2 on the drawing'], ['Switchgear / Panelboard', '1 on the drawing'], ['Meter', '2 on the drawing'], ['Trench', '140 ft']],
    'what the plans did not carry is added: the extra chargers, a panel, a meter, the trench; a known kind keeps the server’s name');
  eq(P.changes(READ, asDrawn({ counts: { bess: 3, charger: 8, 'eq:xfmr': 1, 'eq:panel': 2 } })).rows.filter(function (r) { return r.section === 'added'; }).map(function (r) { return r.label; }),
    ['Battery storage'], 'a third battery, drawn by hand, is added');
  eq(['bess', 'ev_charger', 'switchgear', 'panelboard', 'transformer', 'solar_array'].map(P.countKey), ['bess', 'charger', 'eq:panel', 'eq:panel', 'eq:xfmr', null], 'a battery is the fleet, a charger the Run’s, equipment its Insert id');

  var st1 = rowOf(P.changes(READ, asDrawn({ totals: totals({ bessKwh: 2236 }) })), 'Battery energy');
  eq([st1.status, st1.plans, st1.drawing], ['differs', '2,000 kWh', '2,236 kWh'], 'a stated total the drawing no longer carries differs');
  eq(rowOf(P.changes(READ, asDrawn({ totals: totals({ bessKw: 0, bessKwh: 0 }) })), 'Battery power').status, 'not-drawn', 'a stated battery with none drawn: not drawn');
  var exact = JSON.parse(JSON.stringify(READ)); exact.facts[2].number = 50;
  eq(rowOf(P.changes(exact, asDrawn({ totals: totals({ chargers: 51 }) })), 'EV chargers', 'stated').status, 'differs', 'a count is exact: 51 chargers are not the plans’ 50');
  var split = JSON.parse(JSON.stringify(READ)); split.facts[1].agree = false;
  ok(/sheets disagree/.test(rowOf(P.changes(split, asDrawn()), 'Battery energy').note), 'a figure the plans’ own sheets disagree on says so');

  var dc = JSON.parse(JSON.stringify(READ)); dc.facts.push({ key: 'pv_kw_dc', number: 315, sheet: 'PV-1', agree: true });
  var dcr = P.changes(dc, asDrawn());
  ok(rowOf(dcr, 'Solar (DC)').status === 'as-read' && rowOf(dcr, 'Solar array (PV-1, PV-2)').status === 'listed' && /Compared above/.test(rowOf(dcr, 'Solar array (PV-1, PV-2)').note), 'a stated solar total is compared once; the arrays point to it');
  var runs = JSON.parse(JSON.stringify(READ)); runs.listed[2] = { kind: 'conduit_run', tag: 'C-1', quantity: 1, sheet: 'E-101' };
  var rr = rowOf(P.changes(runs, asDrawn()), 'Conduit / cable run (C-1)');
  ok(rr.status === 'listed' && /No length printed/.test(rr.note) && rr.drawing === '120 ft', 'a run with no length is not compared, and the drawing’s figure is still shown');
  var far = rowOf(P.changes(READ, asDrawn({ totals: totals({ conduitFt: 270 }) })), 'Conduit / cable run (C-1)');
  ok(far.status === 'differs' && /270 ft of conduit in all/.test(far.note), 'a conduit total that differs');
  var two = JSON.parse(JSON.stringify(READ)); two.listed[0].quantity = 2;
  eq(rowOf(P.changes(two, asDrawn()), 'Solar array (PV-1, PV-2)').plans, '515 kW-DC', 'a listed figure counts its quantity');
  var flat = P.changes(READ, asDrawn({ scaled: false, totals: totals({ conduitFt: 999, trenchFt: 140 }) }));
  ok(rowOf(flat, 'Conduit / cable run (C-1)').drawing === 'not to scale' && rowOf(flat, 'Conduit / cable run (C-1)').status === 'listed' && !rowOf(flat, 'Trench'), 'a drawing not set to scale has no lengths: not compared, never zero, and no trench added');

  var v1 = JSON.parse(JSON.stringify(READ)); v1.v = 1; delete v1.items;
  var o1 = P.changes(v1, asDrawn({ totals: totals({ trenchFt: 50 }) }));
  ok(!o1.compared && /saved before/.test(o1.notes[0]), 'a read saved before v2 says it cannot compare item by item');
  ok(!o1.rows.some(function (r) { return r.section === 'placed' || (r.section === 'added' && r.key === 'charger'); }) && rowOf(o1, 'Battery energy').status === 'as-read' && rowOf(o1, 'Trench'),
    'and invents neither placed rows nor added units, while the stated totals and the drawn trench still compare');

  var junk = P.changes({ id: 'x', items: [{ id: 'q', kind: 'nuke', kw: 'lots', quantity: -4, placed: 'all' }, null, 7], facts: [{ key: 'bess_kw', number: '9e99' }, { key: 'evil', number: 3 }], listed: 'no', sheets: {} },
    { fromRead: 'x', counts: { 'eq:pad': -3, 'eq:meter': 'many', x: 1e9 }, totals: { bessKw: 'NaN' } });
  eq(junk.rows.map(function (r) { return [r.section, r.kind, r.plans, r.status]; }), [['placed', 'other', '1 × Other', 'not-placed']], 'junk in: an unknown kind is other, a bad quantity is one, impossible figures and counts are dropped');
  eq(P.changes(null, null).rows, [], 'nothing in, nothing out');
  var secs = ad.rows.map(function (r) { return r.section; }).filter(function (v, i, a) { return a.indexOf(v) === i; });
  eq(secs, ['stated', 'placed', 'listed', 'added'], 'section by section');
  var placedSt = P.changes(READ, gone).rows.filter(function (r) { return r.section === 'placed'; }).map(function (r) { return P.CHANGE_ORDER.indexOf(r.status); });
  eq(placedSt, placedSt.slice().sort(function (a, b) { return a - b; }), 'and within a section, what differs first');
  ok(/not an engineering judgement/.test(same.basis) && same.rows.every(function (r) { return r.statusLabel && r.sectionLabel; }), 'every row carries its words, and the basis says what it is not');

  /* ── 6. the door ── */
  var DB, AUTH, CLIENT_ADMIN, CALLS, REPLY;
  var ME = { uid: 'u1', email: 'dana@sunrise.example', orgId: 'sunrise.example', staff: false, claims: { email_verified: true } };
  function as(c) { AUTH = function () { return Promise.resolve(JSON.parse(JSON.stringify(c))); }; }
  function reset(billing, member, org) {
    DB = new FD.DB(); as(ME); CLIENT_ADMIN = false; CALLS = [];
    DB.seed('omega_orgs/sunrise.example', org || { name: 'Sunrise', status: 'active' });
    DB.seed('omega_orgs/sunrise.example/billing/current', billing || { tier: 'deluxe' });
    DB.seed('omega_orgs/sunrise.example/members/u1', member || { role: 'admin', status: 'active' });
    REPLY = function (body) { var p = /page (\d+)/.exec(body.messages[0].content[1].text)[1]; return { status: 200, json: { model: body.model, stop_reason: 'end_turn', usage: { input_tokens: 5000, output_tokens: 1200 }, content: [{ type: 'text', text: JSON.stringify(A[((p - 1) % 3) + 1]) }] } }; };
    process.env.ANTHROPIC_API_KEY = 'test-platform-key';
    delete process.env.OMEGA_PLAN_MODEL; delete process.env.AI_KEY_SUNRISE_EXAMPLE; delete process.env.OMEGA_PLAN_FALLBACKS;
  }
  global.fetch = function (url, init) {
    var body = JSON.parse(init.body); CALLS.push({ url: url, headers: init.headers, body: body });
    var r = REPLY(body);
    return Promise.resolve({ ok: r.status < 300, status: r.status, json: function () { return Promise.resolve(r.json); } });
  };
  function httpError(s, m) { var e = new Error(m); e.status = s; return e; }
  FD.mock('../api/_lib/admin.js', { handler: function (fn) { return fn; }, httpError: httpError, db: function () { return DB; },
    authenticate: function (req) { return AUTH(req); }, clientAdmin: function () { return Promise.resolve(!!CLIENT_ADMIN); },
    safeOrg: function (v) { v = String(v || '').toLowerCase(); return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(v) ? v : ''; } });
  var api = require(path.join(ROOT, 'api', 'plan-read.js'));
  function call(body) { return api({ method: 'POST', headers: {}, body: body }); }
  async function refused(body, status, why) { try { await call(body); assert.fail('expected ' + status + ': ' + why); } catch (e) { assert.equal(e.status, status, why + ' → ' + e.message); pass++; return e; } }
  function counter() { var c = DB.data.get('omega_orgs/sunrise.example/plan_read_counters/' + new Date().toISOString().slice(0, 10)); return c ? c.n : 0; }
  var JPEG = 'data:image/jpeg;base64,' + Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(400, 7)]).toString('base64');
  var PNG = 'data:image/png;base64,' + Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(100, 1)]).toString('base64');
  function sheetBody(page, extra) { return Object.assign({ action: 'read', fileName: 'sample.pdf', sheet: { page: page, of: 3, text: 'page ' + page + ' text', image: JPEG } }, extra || {}); }

  reset();
  var r1 = await call(sheetBody(3, { model: 'claude-fable-5-1' }));
  ok(r1.ok && !r1.cached && r1.sheet.items.length === A[3].items.length, 'a sheet is read and normalised');
  eq(CALLS.length, 1, 'one call to the model');
  eq([CALLS[0].body.model, CALLS[0].headers['x-api-key']], ['claude-opus-5-5', 'test-platform-key'], 'the server’s model and key; the body’s "model" is ignored');
  eq(CALLS[0].headers['anthropic-beta'], 'server-side-fallback-2026-07-01', 'the fallback beta rides with fallbacks: "default"');
  ok(CALLS[0].url === 'https://api.anthropic.com/v1/messages' && CALLS[0].body.messages[0].content[0].source.media_type === 'image/jpeg', 'the sheet goes to the Messages API as an image');
  eq([counter(), r1.today], [1, { used: 1, of: 80 }], 'counted once, and the page is told where today stands');
  var cached = Array.from(DB.data.keys()).filter(function (k) { return /plan_reads\//.test(k); });
  eq(cached.length, 1, 'the read is cached for the workspace');
  var r2 = await call(sheetBody(3));
  ok(r2.cached && CALLS.length === 1 && counter() === 1, 'the same sheet again: from the cache, no call, not counted');
  eq(r2.sheet, r1.sheet, 'and the same answer');
  var r3 = await call(sheetBody(5));
  ok(!r3.cached && CALLS.length === 2, 'the same image as a different page with different text is a new read');
  process.env.OMEGA_PLAN_MODEL = 'claude-sonnet-5-5'; process.env.OMEGA_PLAN_FALLBACKS = 'off'; process.env.AI_KEY_SUNRISE_EXAMPLE = 'tenant-key';
  await call(sheetBody(1, { sheet: { page: 1, text: 'other', image: PNG } }));
  ok(CALLS[2].body.model === 'claude-sonnet-5-5' && !CALLS[2].body.fallbacks && !CALLS[2].headers['anthropic-beta'] && CALLS[2].headers['x-api-key'] === 'tenant-key', 'the deployment sets the model, fallbacks and a tenant’s own key');
  ok(CALLS[2].body.messages[0].content[0].source.media_type === 'image/png', 'a PNG goes as a PNG');

  /* caps refuse before the model is called */
  reset();
  DB.seed('omega_orgs/sunrise.example/plan_read_counters/' + new Date().toISOString().slice(0, 10), { n: api.limits.PER_ORG_DAY, users: {} });
  await refused(sheetBody(1), 429, 'the workspace’s day is spent');
  eq(CALLS.length, 0, 'and nothing was sent');
  reset();
  DB.seed('omega_orgs/sunrise.example/plan_read_counters/' + new Date().toISOString().slice(0, 10), { n: 3, users: { u1: api.limits.PER_USER_DAY } });
  await refused(sheetBody(1), 429, 'one person’s day is spent');
  reset(); await call(sheetBody(3));
  DB.seed('omega_orgs/sunrise.example/plan_read_counters/' + new Date().toISOString().slice(0, 10), { n: api.limits.PER_ORG_DAY, users: {} });
  ok((await call(sheetBody(3))).cached && CALLS.length === 1, 'a sheet already read opens on a spent day: the cache is free');

  /* a failed read gives its place back */
  reset(); REPLY = function () { return { status: 500, json: { error: { message: 'overloaded' } } }; };
  await refused(sheetBody(1), 502, 'the service failing is ours to say');
  eq(counter(), 0, 'and the place is given back');
  reset(); REPLY = function () { return { status: 429, json: { error: { message: 'rate limited' } } }; };
  await refused(sheetBody(1), 429, 'busy is busy');
  reset(); REPLY = function () { return { status: 200, json: { stop_reason: 'refusal', content: [] } }; };
  await refused(sheetBody(1), 422, 'a declined sheet');
  eq(counter(), 0, 'given back');
  reset(); REPLY = function () { return { status: 200, json: { stop_reason: 'max_tokens', content: [{ type: 'text', text: '{"sheet":' }] } }; };
  await refused(sheetBody(1), 502, 'a cut-off answer is not half a sheet');
  reset(); REPLY = function () { return { status: 200, json: { stop_reason: 'end_turn', content: [{ type: 'text', text: 'I could not read it.' }] } }; };
  await refused(sheetBody(1), 502, 'prose is not a read');
  eq([counter(), Array.from(DB.data.keys()).filter(function (k) { return /plan_reads\//.test(k); }).length], [0, 0], 'nothing counted, nothing cached');

  /* no key: nothing read, nothing counted */
  reset(); delete process.env.ANTHROPIC_API_KEY;
  var nk = await refused(sheetBody(1), 503, 'no AI key on the deployment');
  ok(/Nothing was read or counted/.test(nk.message) && CALLS.length === 0 && counter() === 0, 'and it says so');

  /* the image */
  reset();
  await refused(sheetBody(1, { sheet: { page: 1, image: 'https://x/y.jpg' } }), 400, 'a URL is not a sheet');
  await refused(sheetBody(1, { sheet: { page: 1, image: 'data:image/jpeg;base64,' + Buffer.from('GIF89a....').toString('base64') } }), 400, 'a GIF called a JPEG');
  await refused(sheetBody(1, { sheet: { page: 1, image: 'data:image/jpeg;base64,' + Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.alloc(3700000)]).toString('base64') } }), 413, 'too large');
  eq(CALLS.length, 0, 'none of them reached the model');

  /* who */
  reset(); as(Object.assign({}, ME, { claims: { email_verified: false } }));
  await refused(sheetBody(1), 403, 'an unverified email');
  CLIENT_ADMIN = true; ok((await call(sheetBody(1))).ok, 'an owner or admin of an active client reads without the link');
  reset(null, null, { status: 'suspended' }); await refused(sheetBody(1), 403, 'a suspended workspace');
  reset(null, null, { status: 'pending' }); await refused(sheetBody(1), 403, 'a pending workspace');
  reset(null, { role: 'member', status: 'disabled' }); await refused(sheetBody(1), 403, 'a disabled member');
  reset(null, { role: 'viewer', status: 'active' }); await refused(sheetBody(1), 403, 'a viewer');
  reset(null, { role: 'member', status: 'active', toolAccess: ['gridatlas'] }); await refused(sheetBody(1), 403, 'a member without Site Map');
  reset({ tier: 'deluxe', toolAccess: ['gridatlas'] }); await refused(sheetBody(1), 403, 'a product without Site Map');
  var DAY = 86400000;
  reset({ packaged: true, packagingState: 'paid', modules: ['lite'], accessUntil: Date.now() + 30 * DAY });
  ok((await call(sheetBody(1))).ok, 'a package holds Omega Design, so it reads');
  reset({ packaged: true, packagingState: 'paid', modules: ['lite'], accessUntil: Date.now() - DAY });
  var ro = await refused(sheetBody(1), 403, 'a lapsed package is read-only');
  ok(/Omega Design/.test(ro.message), 'and says which module reads plans');
  reset(); as(Object.assign({}, ME, { orgId: 'not a domain' })); await refused(sheetBody(1), 403, 'no workspace on the token');
  reset(); as({ uid: 's1', email: 'ops@clearsky-usa.com', orgId: 'clearsky-usa.com', staff: true, claims: { email_verified: true } });
  var sr = await call(sheetBody(2));
  eq(sr.today.of, api.limits.STAFF_DAY, 'staff read on their own cap');
  await refused({ action: 'erase' }, 400, 'an unknown action');

  /* check: pure, sanitised */
  reset();
  var ck = await call({ action: 'check', sheets: sheets.concat([{ page: 9, items: [{ kind: 'nuke' }], facts: 'x' }]) });
  ok(ck.ok && ck.result.summary.warnings === 1 && ck.result.issues.some(function (i) { return i.code === 'dropped'; }), 'check runs every rule again on what came back, and says what it dropped');
  eq(CALLS.length, 0, 'check calls nothing');
  await refused({ action: 'check', sheets: [] }, 400, 'nothing to check');

  /* changes: pure, sanitised, needs a read and a sign-in */
  reset();
  var chg = await call({ action: 'changes', read: READ, now: asDrawn() });
  eq([chg.ok, chg.result.rows, CALLS.length], [true, same.rows, 0], 'changes is the library’s answer, and calls nothing');
  await refused({ action: 'changes', now: asDrawn() }, 400, 'no read on the project');
  AUTH = function () { return Promise.reject(httpError(401, 'Sign in')); };
  await refused({ action: 'changes', read: READ, now: asDrawn() }, 401, 'signed out');

  console.log('tplanread: ' + pass + ' passed');
})().catch(function (e) { console.error(e); process.exit(1); });
