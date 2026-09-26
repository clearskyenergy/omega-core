/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Phase 7: usage counters. Where a metered deliverable is produced, the
 * producing endpoint (or POST /api/usage for the producers that live in the
 * browser) counts it here, in a transaction, idempotent by client id, under
 * omega_orgs/{org}/usage/{cycleStart}. NOT the Event Layer, which is
 * terms-gated and excludes signed-agreement tenants by design.
 *
 * This is an honest billing counter, not a security boundary: the package
 * gate (package-access.requireModule) decides who may produce; this decides
 * what is included, what is over, and what the next invoice carries.
 * Overage is billed as its own lines on the next recurring invoice
 * (quantity over included + purchased × overageCents). A pack raises
 * `purchased` for the cycle it was bought in. Usage never blocks opening,
 * viewing or exporting finished work; it only gates producing the NEXT
 * metered deliverable, and only when auto top-up is off.
 */
'use strict';
var R = require('./proration'), M = require('./modules'), P = require('./subscription-pricing');
function fail(message, status) { var e = new Error(message); e.status = status || 400; throw e; }
var ACTIVITY = { models: 'Storage models', boms: 'Bills of materials', screens: 'Site screens' };
/* Every meter the catalog names: the billed ones carry the book's allowance. */
function meters(book) {
  return M.catalog().filter(function (m) { return m.meter; }).map(function (m) {
    var u = book.usage[m.meter];
    return { key: m.meter, module: m.key, moduleName: m.name, name: u ? u.name : ACTIVITY[m.meter] || m.meter, billed: !!u,
      included: u ? u.included : null, overageCents: u ? u.overageCents : null, packUnits: u ? u.packUnits : null, packCents: u ? u.packCents : null };
  });
}
function meter(book, key) {
  var m = meters(book).filter(function (x) { return x.key === key; })[0];
  if (!m) fail('Unknown meter');
  return m;
}
function clientId(v) {
  if (typeof v !== 'string' || !/^[A-Za-z0-9_.:-]{8,120}$/.test(v)) fail('A client id of 8–120 letters, digits, dots, dashes or colons is required');
  return v;
}
/* The tenant's current cycle: from their billing day to the next. */
function cycleOf(billing, now) { return R.cycle(R.iso(now), billing.billingDay || 1); }
function ref(root, cycle) { return root.collection('usage').doc(cycle.start); }
function empty(cycle) { return { cycle: { start: cycle.start, end: cycle.end }, counts: {}, purchased: {}, updatedAt: null }; }
/* Per meter: used, allowance, what is left, the note the tool shows, the pack. */
function summary(billing, book, doc, modules) {
  var counts = (doc && doc.counts) || {}, purchased = (doc && doc.purchased) || {}, owned = modules || (billing.subscription && billing.subscription.modules) || billing.modules || [];
  return meters(book).filter(function (m) { return owned.indexOf(m.module) >= 0; }).map(function (m) {
    var used = counts[m.key] || 0, bought = purchased[m.key] || 0, out = { key: m.key, module: m.module, moduleName: m.moduleName, name: m.name, billed: m.billed, used: used, purchased: bought };
    if (!m.billed) { out.display = used + ' ' + m.name.toLowerCase() + ' this cycle'; return out; }
    var allowance = m.included + bought, remaining = Math.max(0, allowance - used), pct = allowance ? Math.round(100 * used / allowance) : 100;
    out.included = m.included; out.allowance = allowance; out.remaining = remaining; out.overage = Math.max(0, used - allowance); out.pct = pct;
    out.overageCents = m.overageCents; out.autoTopup = billing.autoTopup === true;
    out.pack = { units: m.packUnits, cents: m.packCents, display: 'Buy ' + m.packUnits + ' more for ' + P.money(m.packCents) };
    out.display = used + ' of ' + allowance + ' ' + m.name + ' used this cycle';
    out.note = used >= allowance ? (billing.autoTopup === true ? 'You have used all ' + allowance + ' ' + m.name + ' this cycle; the rest are billed at ' + P.money(m.overageCents) + ' each on your next invoice.'
      : 'You have used all ' + allowance + ' ' + m.name + ' this cycle. ' + out.pack.display + '.')
      : pct >= 80 ? remaining + ' of ' + allowance + ' ' + m.name + ' left this cycle.' : null;
    out.allowed = used < allowance || billing.autoTopup === true;
    return out;
  });
}
/* Count one deliverable. Idempotent by client id; refuses (402) a billed
 * meter at its allowance unless auto top-up is on. Never counts twice. */
async function count(db, orgId, billing, book, key, id, by, now, options) {
  options = options || {};
  var m = meter(book, key), cid = clientId(id), root = db.doc('omega_orgs/' + orgId), cycle = cycleOf(billing, now), docRef = ref(root, cycle), eventRef = docRef.collection('events').doc(cid);
  return db.runTransaction(async function (tx) {
    var snap = await tx.get(docRef), seen = await tx.get(eventRef), doc = snap.exists ? snap.data() : empty(cycle);
    var before = summary(billing, book, doc, [m.module]).filter(function (s) { return s.key === key; })[0];
    if (seen.exists) return { counted: false, repeat: true, cycle: doc.cycle, meter: before };
    if (m.billed && options.gate !== false && !before.allowed) { var e = new Error(before.note); e.status = 402; e.meter = before; throw e; }
    var counts = Object.assign({}, doc.counts); counts[key] = (counts[key] || 0) + 1;
    var next = Object.assign({}, doc, { counts: counts, updatedAt: now });
    tx.set(docRef, next);
    tx.set(eventRef, { meter: key, at: now, by: by || null, source: options.source || 'api' });
    return { counted: true, repeat: false, cycle: next.cycle, meter: summary(billing, book, next, [m.module]).filter(function (s) { return s.key === key; })[0] };
  });
}
/* A paid pack raises the cycle's purchased units; called by reconciliation. */
function addPack(tx, root, pack, existing, now) {
  var doc = existing || empty(pack.cycle), purchased = Object.assign({}, doc.purchased); purchased[pack.meter] = Math.max(0, (purchased[pack.meter] || 0) + pack.units);
  var next = Object.assign({}, doc, { cycle: doc.cycle || pack.cycle, counts: doc.counts || {}, purchased: purchased, updatedAt: now });
  tx.set(ref(root, pack.cycle), next); return next;
}
/* The overage lines a recurring invoice carries for the cycle that just ended. */
function overageLines(doc, book, modules) {
  if (!doc) return [];
  return meters(book).filter(function (m) { return m.billed && modules.indexOf(m.module) >= 0; }).map(function (m) {
    var used = (doc.counts || {})[m.key] || 0, over = Math.max(0, used - m.included - ((doc.purchased || {})[m.key] || 0));
    return over ? { itemKey: 'overage:' + m.key, name: m.name + ' overage', quantity: over, unitCents: m.overageCents, amountCents: over * m.overageCents } : null;
  }).filter(Boolean);
}
/* The 90-day right-size review: what was used against what is included,
 * which modules show no recorded activity, and where a tier fits better.
 * Activity is counted only where a producer counts it; a module without a
 * meter, or whose meter is not yet counted, is reported as such, never as
 * "unused". */
async function review(db, orgId, billing, book, now) {
  var root = db.doc('omega_orgs/' + orgId), since = R.iso(now - book.policy.reviewDays * 86400000), rows = await root.collection('usage').get();
  var docs = rows.docs.map(function (d) { return d.data(); }).filter(function (d) { return d.cycle && d.cycle.start >= since; }).sort(function (a, b) { return a.cycle.start.localeCompare(b.cycle.start); });
  var owned = (billing.subscription && billing.subscription.modules) || billing.modules || ['lite'], totals = {}, allowance = {};
  docs.forEach(function (d) { Object.keys(d.counts || {}).forEach(function (k) { totals[k] = (totals[k] || 0) + d.counts[k]; }); });
  var out = { since: since, cycles: docs.length, days: book.policy.reviewDays, meters: [], modules: [], suggestions: [] };
  meters(book).forEach(function (m) {
    if (owned.indexOf(m.module) < 0) return;
    var used = totals[m.key] || 0, included = m.billed ? m.included * Math.max(1, docs.length) : null, bought = 0;
    docs.forEach(function (d) { bought += ((d.purchased || {})[m.key] || 0); });
    var row = { key: m.key, module: m.module, moduleName: m.moduleName, name: m.name, billed: m.billed, used: used, included: included, purchased: bought, over: m.billed ? Math.max(0, used - included - bought) : null };
    out.meters.push(row);
    if (m.billed && row.over > 0) out.suggestions.push({ module: m.module, kind: 'more', text: m.moduleName + ': ' + used + ' ' + m.name + ' in ' + docs.length + ' cycle' + (docs.length === 1 ? '' : 's') + ' against ' + (included + bought) + ' included; ' + row.over + ' over. A pack (' + m.packUnits + ' for ' + P.money(m.packCents) + ') or the next tier would cover it.' });
    else if (docs.length && used === 0) out.suggestions.push({ module: m.module, kind: 'remove', text: m.moduleName + ': no ' + m.name.toLowerCase() + ' recorded since ' + since + '. Consider removing it at the review.' });
  });
  owned.forEach(function (k) {
    var m = M.get(k), row = out.meters.filter(function (r) { return r.module === k; })[0];
    out.modules.push({ module: k, name: m.name, shelf: m.shelf, activity: row ? row.used : null, note: row ? null : (k === 'lite' ? 'Always included' : 'No usage meter for this module yet') });
  });
  try {
    var q = P.quote(owned, book, { plan: (billing.subscription && billing.subscription.plan) || billing.plan || 'auto', builders: billing.builders, viewers: billing.viewers, serviceFee: billing.serviceFee, interval: billing.interval, now: now });
    if (q.recommendation && q.recommendation.plan !== q.plan && q.recommendation.savingsCents > 0) out.suggestions.push({ module: null, kind: 'steer', text: q.display.fit });
  } catch (e) { /* a legacy record the book cannot price has no steer */ }
  return out;
}
module.exports = { meters: meters, meter: meter, clientId: clientId, cycleOf: cycleOf, summary: summary, count: count, addPack: addPack, overageLines: overageLines, review: review, empty: empty };
