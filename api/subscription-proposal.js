/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * The Subscription Proposal's one door (Phase 6).
 *
 *   GET  ?id=&key=                 the customer's view of a SENT proposal:
 *                                  the key from the email is the credential;
 *                                  no account is needed to read it.
 *   GET  (staff)                   the list, or ?id= one record in full.
 *   POST { action: 'context' }     staff: brand, catalog, questions, defaults.
 *   POST { action: 'recommend' }   any verified signed-in person: answers →
 *                                  the recommended package and its price.
 *   POST { action: 'price' }       any verified signed-in person: a selection
 *                                  → price, value, terms. No writes.
 *   POST { action: 'save' }        staff: create or update a draft.
 *   POST { action: 'send' }        staff: key + expiry + the email.
 *   POST { action: 'decline' }     staff: close it.
 *   POST { action: 'accept' }      the prospect's OWN tenant admin, signed in,
 *                                  with the key: a paid packaged tenant goes
 *                                  through plan-change (pay first); any other
 *                                  tenant gets the proposal as its proposed
 *                                  package for staff to activate. A company
 *                                  with no workspace accepts by signing up
 *                                  (api/tenant-signup.js takes the key).
 *
 * Every dollar figure comes from api/_lib/subscription-proposal.js on the
 * signed price book; the pages draw what this returns. Records are
 * subscription_proposals/{id}, Admin SDK only. Sandbox rules apply to any
 * path that moves money (plan-change, activation, signup).
 */
'use strict';
var A = require('./_lib/admin'), SP = require('./_lib/subscription-proposal'), B = require('./_lib/pricebook'), M = require('./_lib/modules'), P = require('./_lib/subscription-pricing');
var Policy = require('./_lib/package-billing-policy'), DECK = require('./_lib/deck-brand'), C = require('./_lib/plan-change'), S = require('./_lib/package-billing'), MAIL = require('./_lib/mail');
var STAFF_ORG = 'clearsky-usa.com', BASE = process.env.PUBLIC_BASE_URL || 'https://silmarillion.clearskyomega.com';
var ACTIONS = ['context', 'recommend', 'price', 'save', 'send', 'decline', 'accept'], STAFF_ONLY = ['context', 'save', 'send', 'decline'];
var FIELDS = ['action', 'id', 'key', 'orgId', 'prospect', 'discovery', 'selection', 'notes', 'pricebookVersion', 'interval', 'note'];
function fail(status, message) { throw A.httpError(status, message); }
function coll(db) { return db.collection('subscription_proposals'); }
function validId(id) { return typeof id === 'string' && /^sp-[a-f0-9]{16}$/.test(id); }
async function load(db, id) {
  if (!validId(id)) fail(400, 'Invalid proposal id');
  var s = await coll(db).doc(id).get(); if (!s.exists) fail(404, 'Proposal not found');
  return s.data();
}
async function brandFor(db, orgId) {
  var s = await db.doc('omega_orgs/' + orgId).get();
  return DECK.brandOf(s.exists ? s.data() : { name: 'ClearSky Energy Solutions' }, orgId);
}
function history(record, entry) { return (record.history || []).concat([entry]).slice(-50); }
function customerUrl(id, key) { return BASE + '/proposal.html?id=' + encodeURIComponent(id) + '&key=' + key; }
/* The prospect's domain IS the orgId when they already have a workspace. */
async function existingOrg(db, domain) {
  if (!domain) return null;
  var s = await db.doc('omega_orgs/' + domain).get(); if (!s.exists) return null;
  var b = await db.doc('omega_orgs/' + domain + '/billing/current').get(), bill = b.exists ? b.data() : {};
  return { orgId: domain, status: s.data().status || null, packaged: bill.packaged === true, packagingState: bill.packagingState || null, host: (s.data().domains || [])[0] || null };
}
async function customerView(db, id, key, now) {
  var record = await load(db, id);
  if (record.status === 'draft' || !SP.verifyKey(record, key)) fail(404, 'Proposal not found');
  var patch = null;
  if (SP.expired(record, now)) { record = Object.assign({}, record, { status: 'expired' }); patch = { status: 'expired' }; }
  if (!record.acceptance.viewedAt) { record = Object.assign({}, record, { acceptance: Object.assign({}, record.acceptance, { viewedAt: now }) }); patch = Object.assign(patch || {}, { acceptance: record.acceptance }); }
  if (patch) await coll(db).doc(id).update(patch);
  var org = await existingOrg(db, record.prospect.domain), how = record.status !== 'sent' ? 'none' : (org ? 'sign-in' : 'signup');
  return { proposal: SP.projection(record, 'customer'), questions: SP.QUESTIONS, accept: { how: how, signupUrl: how === 'signup' ? '/start.html?proposal=' + encodeURIComponent(id) + '&key=' + key : null, host: org ? org.host : null } };
}
async function context(db, caller, input, bk) {
  var out = { pricebookVersion: bk.version, brand: await brandFor(db, caller.orgId || STAFF_ORG), sender: { name: (caller.claims && caller.claims.name) || '', email: caller.email },
    catalog: P.catalog(bk), starters: M.starters(), starterLabels: M.starterLabels(), questions: SP.QUESTIONS, answers: SP.ANSWERS, spend: SP.SPEND, unitCosts: SP.UNIT_COSTS,
    defaults: { credit: bk.credit, logins: bk.logins, annualPaidMonths: bk.annualPaidMonths, serviceFees: bk.serviceFees, floorCents: bk.floorCents, plans: bk.plans, initialTermMonths: SP.INITIAL_TERM_MONTHS, validDays: SP.VALID_DAYS } };
  var orgId = A.safeOrg(input.orgId);
  if (orgId) {
    var org = await db.doc('omega_orgs/' + orgId).get(), bill = await db.doc('omega_orgs/' + orgId + '/billing/current').get(), prof = await db.doc('omega_orgs/' + orgId + '/billing/profile').get();
    if (org.exists) {
      var o = org.data(), b = bill.exists ? bill.data() : {}, p = prof.exists ? prof.data() : {};
      out.org = { orgId: orgId, name: o.name || orgId, vertical: o.vertical || '', status: o.status || null, packaged: b.packaged === true, packagingState: b.packagingState || null,
        modules: (b.subscription && b.subscription.modules) || b.modules || ['lite'], plan: (b.subscription && b.subscription.plan) || b.plan || null, interval: b.interval || 'monthly',
        prospect: { company: p.legalName || o.name || orgId, domain: orgId, contactName: p.contactName || '', email: p.email || (o.signup && o.signup.email) || '', phone: p.phone || '', address: p.address || {} } };
    }
  }
  return out;
}
async function save(db, caller, input, bk, now) {
  var record, id = input.id;
  if (id != null) {
    record = await load(db, id);
    if (record.status !== 'draft' && record.status !== 'sent') fail(409, 'A ' + record.status + ' proposal cannot be edited; start a new one');
  } else { id = SP.newId(); record = { id: id, status: 'draft', createdAt: now, createdBy: caller.email, history: [] }; }
  var next = SP.compose(Object.assign({}, record, { prospect: input.prospect, discovery: input.discovery, selection: input.selection, notes: input.notes }), bk, now);
  var org = await existingOrg(db, next.prospect.domain);
  next.prospect = Object.assign({}, next.prospect, { orgId: org ? org.orgId : null, existing: org });
  next.sender = record.sender || { orgId: caller.orgId || STAFF_ORG, email: caller.email, name: (caller.claims && caller.claims.name) || '', brand: await brandFor(db, caller.orgId || STAFF_ORG) };
  next.updatedAt = now; next.updatedBy = caller.email;
  // Editing what was sent withdraws it: the customer accepts only what they saw.
  if (record.status === 'sent') { next.status = 'draft'; next.acceptance = null; next.history = history(next, { at: now, by: caller.email, action: 'withdrawn-for-edit' }); }
  next.history = history(next, { at: now, by: caller.email, action: record.createdAt === now ? 'created' : 'saved' });
  await coll(db).doc(id).set(next);
  return { id: id, proposal: SP.projection(next, 'staff') };
}
async function send(db, caller, input, bk, now) {
  var record = await load(db, input.id);
  if (record.status !== 'draft' && record.status !== 'sent') fail(409, 'A ' + record.status + ' proposal cannot be sent');
  if (!record.prospect.email) fail(400, 'Add the customer contact’s email before sending');
  var next = SP.compose(record, bk, now), key = SP.token(), org = await existingOrg(db, next.prospect.domain);
  next.prospect = Object.assign({}, next.prospect, { orgId: org ? org.orgId : null, existing: org });
  next.sender = Object.assign({}, record.sender || { orgId: caller.orgId || STAFF_ORG, email: caller.email, name: (caller.claims && caller.claims.name) || '' }, { brand: await brandFor(db, (record.sender && record.sender.orgId) || caller.orgId || STAFF_ORG) });
  next.status = 'sent'; next.sentAt = now; next.updatedAt = now; next.updatedBy = caller.email;
  next.acceptance = { keyHash: SP.hashKey(key), sentAt: now, sentTo: next.prospect.email, validUntil: now + SP.VALID_DAYS * 86400000, viewedAt: null };
  next.orderForm = SP.orderForm(next, bk);
  var url = customerUrl(next.id, key), mail = { skipped: true };
  try {
    mail = await MAIL.templates.proposalSent({ email: next.prospect.email, contactName: next.prospect.contactName, company: next.prospect.company, sender: next.sender.brand.name,
      platformName: next.sender.brand.platformName, url: url, planDisplay: next.pricing.planDisplay, monthlyDisplay: next.pricing.display.recurring,
      validUntil: new Date(next.acceptance.validUntil).toISOString().slice(0, 10), note: typeof input.note === 'string' ? input.note.slice(0, 600) : '', replyTo: next.sender.email }) || mail;
  } catch (e) { mail = { ok: false, error: e.message }; }
  next.mailState = mail.ok ? 'sent' : mail.skipped ? 'skipped' : 'review-required';
  next.history = history(next, { at: now, by: caller.email, action: 'sent', to: next.prospect.email, mailState: next.mailState });
  await coll(db).doc(next.id).set(next);
  return { id: next.id, status: next.status, url: url, validUntil: next.acceptance.validUntil, mailState: next.mailState, proposal: SP.projection(next, 'staff') };
}
async function decline(db, caller, input, now) {
  var record = await load(db, input.id);
  SP.transition(record, 'declined', now);
  var patch = { status: 'declined', updatedAt: now, updatedBy: caller.email, declinedAt: now, history: history(record, { at: now, by: caller.email, action: 'declined' }) };
  await coll(db).doc(record.id).update(patch);
  return { id: record.id, status: 'declined' };
}
/* The customer's own tenant admin accepts. Money moves only through the
 * paths that already own it; this endpoint never prices or grants. */
async function accept(db, caller, input, bk, now) {
  var record = await load(db, input.id);
  if (!SP.verifyKey(record, input.key)) fail(403, 'This proposal link is not valid');
  if (record.status === 'accepted') return record.acceptance.result;
  if (SP.expired(record, now)) { await coll(db).doc(record.id).update({ status: 'expired' }); fail(409, 'This proposal has expired; ask for a new one'); }
  SP.transition(record, 'accepted', now);
  if (caller.staff) fail(403, 'A customer accepts their own proposal; staff activate from the Package tab');
  var orgId = record.prospect.domain;
  if (!orgId || !(await db.doc('omega_orgs/' + orgId).get()).exists) fail(409, 'Sign up with this proposal to accept it');
  if (!caller.claims || caller.claims.email_verified !== true) fail(403, 'Verified email required');
  if (caller.orgId !== orgId) fail(403, 'Own organization required');
  if (!(await A.isTenantAdmin(caller, orgId))) fail(403, 'Ask your workspace administrator to accept');
  var c = await S.context(db, orgId), result;
  if (c.billing.packaged === true && c.billing.packagingState === 'paid') {
    var owned = S.bought(c.billing, c.billing).modules, add = record.selection.modules.filter(function (k) { return owned.indexOf(k) < 0; });
    if (!add.length) fail(409, 'Everything in this proposal is already in your package');
    var q = await C.preview(db, orgId, { add: add, plan: record.pricing.plan }, now);
    if (!q.canApply) fail(409, q.reason);
    var change = await C.apply(db, orgId, { add: add, plan: record.pricing.plan, previewId: q.previewId, effectiveAt: q.effectiveAt }, caller, now);
    result = { path: 'plan-change', changeId: change.changeId, state: change.state, todayDisplay: change.display, paymentLink: change.paymentLink || null, expiresOn: change.expiresOn || null };
  } else {
    var proposed = Policy.terms(record.selection, c.book, now);
    await c.root.collection('billing').doc('current').set({ proposedPackage: proposed, proposalId: record.id, updatedAt: now, updatedBy: caller.email }, { merge: true });
    await db.collection('omega_orgs').doc(STAFF_ORG).collection('notifications').doc('proposal-' + record.id).set({ kind: 'proposal', read: false, createdAt: now,
      text: 'Proposal accepted by ' + record.prospect.company + ' (' + orgId + '): activate it in the Package tab.', orgId: orgId, proposalId: record.id });
    result = { path: 'activation', state: c.org.status === 'pending' ? 'awaiting_approval' : 'awaiting_activation' };
  }
  var acceptance = Object.assign({}, record.acceptance, { acceptedAt: now, acceptedBy: caller.email, orgId: orgId, result: result });
  await coll(db).doc(record.id).update({ status: 'accepted', acceptance: acceptance, updatedAt: now, updatedBy: caller.email,
    history: history(record, { at: now, by: caller.email, action: 'accepted', path: result.path }) });
  return result;
}
module.exports = A.handler(async function (req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET' && req.method !== 'POST') fail(405, 'GET or POST required');
  var db = A.db(), now = Date.now(), input = req.method === 'GET' ? req.query || {} : req.body || {};
  if (req.method === 'GET' && input.key) return customerView(db, input.id, input.key, now);
  var caller = await A.authenticate(req);
  if (req.method === 'GET') {
    if (!caller.staff) fail(403, 'Staff only');
    if (input.id) return { proposal: SP.projection(await load(db, input.id), 'staff') };
    var rows = await coll(db).orderBy('updatedAt', 'desc').limit(50).get();
    return { proposals: rows.docs.map(function (d) { return SP.summaryRow(d.data()); }) };
  }
  if (Object.keys(input).some(function (k) { return FIELDS.indexOf(k) < 0; })) fail(400, 'Unsupported field');
  if (ACTIONS.indexOf(input.action) < 0) fail(400, 'Action must be one of ' + ACTIONS.join(', '));
  if (STAFF_ONLY.indexOf(input.action) >= 0 && !caller.staff) fail(403, 'Staff only');
  if (!caller.staff && (!caller.claims || caller.claims.email_verified !== true)) fail(403, 'Verified email required');
  var bk = await B.load(db, caller.staff && input.pricebookVersion ? input.pricebookVersion : B.VERSION);
  switch (input.action) {
    case 'context': return context(db, caller, input, bk);
    case 'recommend': {
      var d = SP.discovery(input.discovery), rec = SP.recommend(d, bk), sel = SP.selection({ modules: rec.modules, interval: input.interval }, bk, now), pr = SP.pricing(sel, bk, now);
      return { discovery: d, recommendation: rec, selection: sel.input, pricing: pr, value: SP.value(d, pr) };
    }
    case 'price': {
      var s2 = SP.selection(input.selection, bk, now), pr2 = SP.pricing(s2, bk, now), d2 = input.discovery ? SP.discovery(input.discovery) : null;
      var out2 = { selection: s2.input, pricing: pr2, value: d2 ? SP.value(d2, pr2) : null, terms: SP.terms(s2, pr2, bk, now) };
      if (input.prospect) out2.proposal = SP.projection(SP.compose({ status: 'preview', prospect: input.prospect, discovery: input.discovery, selection: input.selection, notes: input.notes,
        sender: { orgId: caller.orgId || STAFF_ORG, email: caller.email, name: (caller.claims && caller.claims.name) || '', brand: await brandFor(db, caller.orgId || STAFF_ORG) } }, bk, now), 'staff');
      return out2;
    }
    case 'save': return save(db, caller, input, bk, now);
    case 'send': return send(db, caller, input, bk, now);
    case 'decline': return decline(db, caller, input, now);
    case 'accept': return accept(db, caller, input, bk, now);
  }
});
