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
   every rule to what a browser sends back.

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

  console.log('tplanread: ' + pass + ' passed');
})().catch(function (e) { console.error(e); process.exit(1); });
