/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/plant-work.js — what a bench DOES to a unit: steps and the parts
   each step consumes
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   PURE. No Firestore, no clock it does not receive. The scan engine in
   plant.js decides whether a unit may ARRIVE at a station; this decides what
   has to happen at that station before the unit may LEAVE it.

   ── WHERE THE WORK IS WRITTEN DOWN ───────────────────────────────────────
   On the product's bill of materials. Every BOM line may carry the station
   that consumes it and a step name within that station:

       { sku: 'CC-CELL-280', qty: 16, station: 'module', step: '1 · Fit cells' }

   So one list drives the storefront, the materials plan AND the bench: a
   product's cells are demanded by the plan, bought by the office, and issued
   at Module build by the operator, and all three read the same line. A line
   with no station is planned and bought but never gated at a bench — the
   plant that has not mapped its stations yet keeps working exactly as before
   — and comes off the shelf when the unit reaches Ready instead
   (backflush(), below), so the shelf count does not stay high by it.

   ── A STEP IS DONE WHEN ITS PARTS ARE ISSUED ─────────────────────────────
   Issuing is the bench's one extra interaction: scan the part's label (or tap
   it) and the quantity for THIS unit comes off the shelf, onto the unit's
   record, with the supplier lot when the operator gives one. A step with no
   parts (a torque check, a firmware load) is confirmed with one tap. When
   every step at the station is done the unit may be scanned in at the next
   bench; until then the next bench refuses it, and names what is open.

   ── WHAT THE OPERATOR CAN NOT DO ─────────────────────────────────────────
   Issue a part that is not on this step, issue more than the line says, issue
   to a unit that is not at this bench, or issue to a unit on hold. Over-issue
   is a stock problem the office fixes with a count; under-issue is a step
   that never completes, which the board shows.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

var P = require('./plant');

var MAX_STEPS = 24;
var DEFAULT_STEP = 'Fit parts';

function norm(v) { return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim(); }
function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
function isPlain(v) { return v && typeof v === 'object' && !Array.isArray(v); }
function safeKey(k) { return ['__proto__', 'constructor', 'prototype'].indexOf(k) < 0; }
function roundQty(n) { return Math.round(n * 10000) / 10000; }
function stepId(name) {
  var id = norm(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return id || 'parts';
}

/* The steps one unit of `product` goes through at `station`, in BOM order.
   `by` (sku → catalog row) names the parts; a part missing from the catalog
   is still listed by SKU so the operator sees it rather than a shorter list. */
function stepsFor(product, station, by, checks) {
  station = norm(station);
  if (!station) return [];
  var order = [], steps = Object.create(null);
  (product && product.bom || []).forEach(function (l) {
    if (!isPlain(l) || norm(l.station) !== station) return;
    var name = norm(l.step).slice(0, 80) || DEFAULT_STEP, id = stepId(name);
    if (!steps[id]) {
      if (order.length >= MAX_STEPS) return;
      steps[id] = { id: id, name: name, parts: [] }; order.push(id);
    }
    var part = by && safeKey(String(l.sku)) && isPlain(by[l.sku]) ? by[l.sku] : {};
    var codes = [String(l.sku).toLowerCase()];
    if (norm(part.supplierSku)) codes.push(norm(part.supplierSku).toLowerCase());
    steps[id].parts.push({ sku: String(l.sku), name: norm(part.name) || String(l.sku), qty: roundQty(num(l.qty)),
      unit: norm(l.unit) || norm(part.unit) || 'ea', codes: codes });
  });
  /* Check-only steps come off the routing (plant-flow.js `checks`) and apply
     to every product; they follow the parts so the check is on a fitted unit. */
  (Array.isArray(checks) ? checks : []).forEach(function (name) {
    name = norm(name).slice(0, 80); if (!name) return;
    var id = 'check-' + stepId(name);
    if (steps[id] || order.length >= MAX_STEPS) return;
    steps[id] = { id: id, name: name, parts: [], check: true }; order.push(id);
  });
  return order.map(function (id) { return steps[id]; });
}

/* Every station on a routing that has at least one step for this product —
   the manager's view of how much work a product is. */
function stationsWithWork(product, routing, by) {
  return (routing || []).filter(function (s) { return stepsFor(product, s.key, by, s.checks).length > 0; }).map(function (s) { return s.key; });
}

function workAt(unit, station) {
  var w = unit && isPlain(unit.work) && safeKey(station) && isPlain(unit.work[station]) ? unit.work[station] : {};
  return { issued: isPlain(w.issued) ? w.issued : {}, lots: isPlain(w.lots) ? w.lots : {}, done: isPlain(w.done) ? w.done : {} };
}

/* What the bench shows: each step with its parts, how much is issued, and
   whether the unit may leave. */
function statusOf(unit, station, steps) {
  var w = workAt(unit, station), open = [];
  var out = (steps || []).map(function (s) {
    var parts = s.parts.map(function (p) {
      var got = safeKey(p.sku) ? roundQty(num(w.issued[p.sku])) : 0;
      return { sku: p.sku, name: p.name, qty: p.qty, unit: p.unit, issued: got, remaining: roundQty(Math.max(0, p.qty - got)),
        lot: safeKey(p.sku) && w.lots[p.sku] ? String(w.lots[p.sku]) : null, codes: p.codes };
    });
    var done = !!w.done[s.id] || (parts.length > 0 && parts.every(function (p) { return p.remaining <= 0; }));
    if (!done) open.push(s.name);
    return { id: s.id, name: s.name, parts: parts, done: done, doneAt: w.done[s.id] || null, check: !!s.check };
  });
  return { station: station, steps: out, open: open, complete: open.length === 0 };
}

/* Which part a scanned code means, on THIS unit's open steps first. */
function resolvePart(steps, status, code) {
  code = norm(code).toLowerCase();
  if (!code) return null;
  var hit = null;
  (status.steps || []).forEach(function (s) {
    if (hit) return;
    s.parts.forEach(function (p) {
      if (hit) return;
      if (p.codes.indexOf(code) >= 0 && (p.remaining > 0 || !s.done)) hit = { step: s, part: p };
    });
  });
  if (hit) return hit;
  (status.steps || []).forEach(function (s) {
    if (hit) return;
    s.parts.forEach(function (p) { if (!hit && p.codes.indexOf(code) >= 0) hit = { step: s, part: p }; });
  });
  return hit;
}

function here(unit, station, routing) {
  if (!unit) return { ok: false, reason: 'unknown_unit', say: 'That serial is not on any open works order here.' };
  if (norm(unit.at) !== station) {
    return { ok: false, reason: 'not_here', say: unit.at ? 'This unit is at ' + P.labelOf(routing, unit.at) + ', not at this bench. Scan it in here first.'
                                                       : 'This unit has not been scanned in anywhere yet. Scan it in first.' };
  }
  if (unit.hold) return { ok: false, reason: 'on_hold', say: 'On hold — ' + (norm(unit.hold) || 'see the supervisor') + '. Nothing can be issued to it.' };
  return null;
}

/* The one rule for issuing, in one place. qty defaults to what the line
   still needs; more than that is refused, not clamped, because the line is
   the specification and the shelf is not. */
function judgeIssue(unit, station, routing, steps, code, qty) {
  station = norm(station);
  var stop = here(unit, station, routing);
  if (stop) return stop;
  var status = statusOf(unit, station, steps);
  if (!status.steps.length) return { ok: false, reason: 'no_work', say: 'Nothing is issued at this bench for this product.' };
  var hit = resolvePart(steps, status, code);
  if (!hit) return { ok: false, reason: 'not_a_part', say: 'That is not a part of any step at this bench for this unit.' };
  if (hit.part.remaining <= 0) {
    return { ok: true, action: 'duplicate', step: hit.step.id, sku: hit.part.sku, say: hit.part.name + ' is already issued in full to this unit.' };
  }
  var want = qty == null || qty === '' ? hit.part.remaining : num(qty);
  if (!(want > 0)) return { ok: false, reason: 'bad_qty', say: 'Enter a quantity greater than zero.' };
  if (want > hit.part.remaining + 1e-9) {
    return { ok: false, reason: 'over_issue', say: 'Only ' + hit.part.remaining + ' ' + hit.part.unit + ' of ' + hit.part.name + ' is still needed on this unit.' };
  }
  var after = roundQty(hit.part.issued + want);
  var stepDone = hit.step.parts.every(function (p) { return (p.sku === hit.part.sku ? after : p.issued) >= p.qty - 1e-9; });
  return { ok: true, action: 'issue', step: hit.step.id, stepName: hit.step.name, sku: hit.part.sku, name: hit.part.name, unit: hit.part.unit,
    qty: roundQty(want), issuedAfter: after, stepDone: stepDone,
    say: 'Issued ' + roundQty(want) + ' ' + hit.part.unit + ' ' + hit.part.name + (stepDone ? ' — ' + hit.step.name + ' complete.' : '.') };
}

function applyIssue(unit, station, verdict, at, lot) {
  if (!verdict || !verdict.ok || verdict.action !== 'issue') return null;
  var w = workAt(unit, station), issued = {}, lots = {}, done = {}, k;
  for (k in w.issued) if (safeKey(k)) issued[k] = w.issued[k];
  for (k in w.lots) if (safeKey(k)) lots[k] = w.lots[k];
  for (k in w.done) if (safeKey(k)) done[k] = w.done[k];
  issued[verdict.sku] = verdict.issuedAfter;
  lot = norm(lot).slice(0, 80);
  if (lot) lots[verdict.sku] = lots[verdict.sku] ? (String(lots[verdict.sku]).indexOf(lot) >= 0 ? lots[verdict.sku] : String(lots[verdict.sku]) + ', ' + lot).slice(0, 240) : lot;
  if (verdict.stepDone && !done[verdict.step]) done[verdict.step] = at;
  return { issued: issued, lots: lots, done: done };
}

/* A step with no parts is confirmed by the operator. A step WITH parts is
   never confirmed around its parts: issue them. */
function judgeStepDone(unit, station, routing, steps, id) {
  station = norm(station);
  var stop = here(unit, station, routing);
  if (stop) return stop;
  var status = statusOf(unit, station, steps), s = status.steps.filter(function (x) { return x.id === norm(id); })[0];
  if (!s) return { ok: false, reason: 'unknown_step', say: 'That step is not on this bench for this unit.' };
  if (s.done) return { ok: true, action: 'duplicate', step: s.id, say: s.name + ' is already done.' };
  var left = s.parts.filter(function (p) { return p.remaining > 0; });
  if (left.length) return { ok: false, reason: 'parts_open', say: 'Issue ' + left.map(function (p) { return p.remaining + ' ' + p.unit + ' ' + p.name; }).join(', ') + ' first.' };
  return { ok: true, action: 'step-done', step: s.id, stepName: s.name, say: s.name + ' done.' };
}

function applyStepDone(unit, station, verdict, at) {
  if (!verdict || !verdict.ok || verdict.action !== 'step-done') return null;
  var w = workAt(unit, station), done = {}, k;
  for (k in w.done) if (safeKey(k)) done[k] = w.done[k];
  done[verdict.step] = at;
  return { issued: w.issued, lots: w.lots, done: done };
}

/* Everything issued to a unit, across stations — the unit's material trace. */
function issuedTotals(unit) {
  var out = {};
  if (!unit || !isPlain(unit.work)) return out;
  Object.keys(unit.work).forEach(function (st) {
    if (!safeKey(st)) return;
    var w = workAt(unit, st);
    Object.keys(w.issued).forEach(function (sku) { if (safeKey(sku)) out[sku] = roundQty((out[sku] || 0) + num(w.issued[sku])); });
  });
  return out;
}

/* ── THE GATE, FOR EVERY CALLER ────────────────────────────────────────
   A unit arriving anywhere — a bench scan (api/mes-scan.js), a rig's
   result or a supervisor's hand-recorded one (api/mes-test-result.js) — is
   refused while a step is open at the bench it is leaving. These three are
   the one way every caller works that out, so a second endpoint cannot
   forget the checks on the routing or read the bill differently. */

/* sku → catalog row, from storefront/config.products */
function catalogIndex(rows) {
  var by = {};
  (Array.isArray(rows) ? rows : []).forEach(function (p) { if (isPlain(p) && p.sku && safeKey(String(p.sku))) by[p.sku] = p; });
  return by;
}
/* check-only steps live on the works order's copy of the routing */
function checksOf(wo, station) {
  var s = (wo && Array.isArray(wo.routing) ? wo.routing : []).filter(function (x) { return x && x.key === station; })[0];
  return s && Array.isArray(s.checks) ? s.checks : [];
}
/* the names of the steps still open where the unit IS */
function openAt(unit, wo, by) {
  if (!unit || !norm(unit.at)) return [];
  var at = norm(unit.at), product = unit.sku && by && safeKey(String(unit.sku)) && isPlain(by[unit.sku]) ? by[unit.sku] : null;
  return statusOf(unit, at, stepsFor(product, at, by, checksOf(wo, at))).open;
}

/* ── LINES NO BENCH ISSUES ─────────────────────────────────────────────
   A bill line with no station (or one naming a station that is not on the
   unit's routing) is planned and bought, but no bench ever takes it off the
   shelf. The materials plan assumes a finished unit took its whole bill
   (materials.js demandsFrom), so without this the shelf count stays high
   by that line for every unit built and the next plan under-buys.

   backflush() is what a unit that has just reached Ready still owes the
   shelf: each such line's quantity for one unit, less anything a bench did
   issue to it. api/mes-scan.js takes it off fulfillment/materials and adds
   it to the works order's issued totals in the same transaction as the
   arrival — the same two writes an issue at a bench makes — so the plan's
   "a finished unit took its bill" is true on the shelf too. */
function routingKeys(routing) { return (Array.isArray(routing) ? routing : []).map(function (s) { return norm(s && s.key); }).filter(Boolean); }
function benchless(line, keys) { var st = norm(line && line.station); return !st || keys.indexOf(st) < 0; }
function backflush(product, unit, routing) {
  if (!product || !Array.isArray(product.bom)) return [];
  var keys = routingKeys(routing), got = issuedTotals(unit), out = [];
  product.bom.forEach(function (l) {
    if (!isPlain(l) || !safeKey(String(l.sku)) || !benchless(l, keys)) return;
    var left = roundQty(num(l.qty) - num(got[l.sku]));
    if (left > 0) out.push({ sku: String(l.sku), qty: left, unit: norm(l.unit) || 'ea' });
  });
  return out;
}
/* Every assembly's lines that no bench on `routing` issues — the warning
   the materials plan and the catalog show. */
function unstationed(products, routing) {
  var keys = routingKeys(routing), out = [];
  (Array.isArray(products) ? products : []).forEach(function (p) {
    if (!isPlain(p) || p.active === false || p.kind === 'service' || !Array.isArray(p.bom) || !p.bom.length) return;
    var lines = p.bom.filter(function (l) { return isPlain(l) && l.sku && benchless(l, keys); }).map(function (l) {
      var st = norm(l.station);
      return { sku: String(l.sku), qty: roundQty(num(l.qty)), unit: norm(l.unit) || 'ea', station: st || null };
    });
    if (lines.length) out.push({ sku: String(p.sku), name: norm(p.name) || String(p.sku), kind: p.kind === 'component' ? 'component' : 'product', lines: lines.slice(0, 80) });
  });
  return out;
}

module.exports = { stepsFor: stepsFor, stationsWithWork: stationsWithWork, statusOf: statusOf, resolvePart: resolvePart,
  judgeIssue: judgeIssue, applyIssue: applyIssue, judgeStepDone: judgeStepDone, applyStepDone: applyStepDone,
  issuedTotals: issuedTotals, stepId: stepId, catalogIndex: catalogIndex, checksOf: checksOf, openAt: openAt,
  backflush: backflush, unstationed: unstationed, MAX_STEPS: MAX_STEPS, DEFAULT_STEP: DEFAULT_STEP };
