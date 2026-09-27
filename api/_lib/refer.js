/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   refer.js — REFER & EARN (2026-09-27). A workspace sends a company to
   OMEGA; when that company becomes a PAYING customer, the workspace that
   sent it earns a $500 credit code to apply to its own bill. This file is
   the ONE place for the rules: the codes, who sent whom, the reward,
   applying a code and drawing it down on an invoice. Every writer calls
   here: api/refer.js (the page and the console), api/tenant-signup.js (who
   sent a new workspace), package-billing issue (the invoice) and reconcile
   (the payment), and the Stripe webhook (a Stripe payment).

     refer_links/{orgId}             the workspace's share code, in its link
                                     /start?ref=CODE; also its daily
                                     invitation count
     refer_signups/{referredOrgId}   who sent a new workspace: ONE per
                                     workspace, written when it is created.
                                     signed_up → rewarded | declined
     refer_credits/{CODE}            a $500 code. issued → applied → used
                                     (| void). It belongs to the workspace
                                     that earned it and no other can apply it.
     refer_invites/{orgId__domain}   the invitations a workspace emailed

   All four are Admin SDK only (firestore.rules): a browser that could write
   one could credit itself. NOT the `referrals` collection, which is the
   quote-request inbox (omega-referrals.js); nothing here reads or writes it.

   WHEN IT IS EARNED. When the referred workspace first PAYS: a subscription
   invoice reconciles paid in QuickBooks (package-billing reconcile), a
   Stripe invoice.paid with money on it, or ClearSky marks it by hand for a
   workspace invoiced outside both (qualify). Signing up earns nothing: a
   signup is free to fake, a payment is not.

   WHERE A CODE LANDS WHEN APPLIED (an owner or administrator applies it):
     packaged    the next QuickBooks subscription invoice, as a discount
                 (draw), never below $0; what is left carries to the next
     Stripe      the Stripe customer balance, which Stripe takes off the
                 next invoice (idempotent by code)
     otherwise   recorded, and ClearSky is told to take it off the next
                 invoice it issues by hand (settle records that it did)
   A code is money on a bill, never cash, and lapses a year after it is
   issued if nobody applies it. Design and what is not built:
   docs/REFER-AND-EARN.md. */
'use strict';
var crypto = require('crypto');
var P = require('./subscription-pricing'), K = require('./kit'), PUBLIC = require('./public-domains');

var REWARD_CENTS = 50000;       /* $500 for each company that becomes a paying customer */
var EXPIRES_DAYS = 365;         /* a code nobody applies lapses a year after it is issued */
var INVITES_PER_DAY = 20;       /* invitation emails per workspace per day */
var INVITE_DAYS = 90;           /* an emailed invitation credits a signup from that domain for 90 days */
var STAFF_ORG = 'clearsky-usa.com';
var DAY = 86400000;
/* 32 characters, so a random byte masked to five bits is uniform; no 0/O or 1/I to misread */
var ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function fail(message, status) { var e = new Error(message); e.status = status || 409; throw e; }
function random(n) { var b = crypto.randomBytes(n), s = ''; for (var i = 0; i < n; i++) s += ALPHABET[b[i] & 31]; return s; }
/* what a person typed or pasted, as a code: case, spaces and dashes do not matter */
function normalize(v) { var s = String(v == null ? '' : v).toUpperCase().replace(/[\s-]+/g, ''); return /^[0-9A-Z]{8,12}$/.test(s) ? s : ''; }
function isShare(c) { return /^[2-9A-HJ-NP-Z]{8}$/.test(c || ''); }
function isCredit(c) { return /^CR[2-9A-HJ-NP-Z]{10}$/.test(c || ''); }
function pretty(c) { return isCredit(c) ? c.slice(0, 2) + '-' + c.slice(2, 7) + '-' + c.slice(7) : c; }
function iso(ms) { return new Date(ms).toISOString().slice(0, 10); }
function money(cents) { return P.money(cents); }
/* the open host (kit.home): a referred company has no workspace yet, so it starts on the front door */
function url(code) { return 'https://' + K.home(null) + '/start?ref=' + encodeURIComponent(code); }
function clean(v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max); }
function expired(c, now) { return c.state === 'issued' && c.expiresAt != null && now > c.expiresAt; }

/* Mail is a courtesy copy and never fails what triggered it; a template the
   loaded mailer lacks (a test's stand-in) is skipped, not called. */
function mailer(deps) { if (deps && deps.mail) return deps.mail; try { return require('./mail'); } catch (e) { return null; } }
async function send(deps, name, o) {
  var m = mailer(deps);
  if (!m || !m.templates || typeof m.templates[name] !== 'function') return { skipped: true };
  try { return (await m.templates[name](o)) || { ok: true }; } catch (e) { console.warn('[refer] mail ' + name + ' skipped:', e && e.message); return { ok: false }; }
}

/* ── the share link ──────────────────────────────────────────────────────── */
async function link(db, orgId, caller, now) {
  var ref = db.doc('refer_links/' + orgId), have = await ref.get();
  if (have.exists && have.data().code) return { code: have.data().code, url: url(have.data().code) };
  for (var tries = 0; tries < 3; tries++) {
    var code = random(8), taken = await db.collection('refer_links').where('code', '==', code).limit(1).get();
    if (!taken.empty) continue;
    var rec = await db.runTransaction(async function (tx) {
      var snap = await tx.get(ref);
      if (snap.exists && snap.data().code) return snap.data();
      var made = Object.assign({}, snap.exists ? snap.data() : {}, { orgId: orgId, code: code, active: true, createdAt: now, createdBy: caller.email });
      tx.set(ref, made);
      return made;
    });
    return { code: rec.code, url: url(rec.code) };
  }
  fail('Could not make a referral link; try again', 503);
}

/* ── who sent a new workspace (tenant-signup, before it creates the org) ──
   The link's code first; else the earliest live invitation to the new
   domain. A code that names this same domain, a paused link, or a referrer
   that is cancelled or suspended credits nobody. Reads only. */
async function attribution(db, raw, domain, now) {
  var code = normalize(raw), by = null;
  if (isShare(code)) {
    var q = await db.collection('refer_links').where('code', '==', code).limit(2).get();
    if (q.size === 1) { var l = q.docs[0].data(); if (l.active !== false && l.orgId && l.orgId !== domain) by = { referrerOrgId: l.orgId, code: code, via: 'link' }; }
  }
  if (!by) {
    var inv = await db.collection('refer_invites').where('domain', '==', domain).get();
    var live = inv.docs.map(function (d) { return d.data(); })
      .filter(function (i) { return i.orgId && i.orgId !== domain && now - (i.lastAt || i.at || 0) <= INVITE_DAYS * DAY; })
      .sort(function (a, b) { return (a.at || 0) - (b.at || 0); });
    if (live.length) by = { referrerOrgId: live[0].orgId, code: null, via: 'invite', invitedBy: live[0].by || null };
  }
  if (!by) return null;
  var org = await db.doc('omega_orgs/' + by.referrerOrgId).get();
  if (!org.exists || ['cancelled', 'suspended'].indexOf(org.data().status) >= 0) return null;
  by.referrerName = org.data().name || by.referrerOrgId;
  return by;
}
/* the record tenant-signup writes in the transaction (or batch) that creates the workspace */
function signupRecord(by, orgId, name, email, now) {
  return { referredOrgId: orgId, referredName: name || orgId, referredEmail: email || null, referrerOrgId: by.referrerOrgId, referrerName: by.referrerName || by.referrerOrgId,
    code: by.code || null, via: by.via, invitedBy: by.invitedBy || null, state: 'signed_up', signedUpAt: now };
}
/* ClearSky hears about a referred signup (best effort, after it is written) */
async function signedUp(by, orgId, name, deps) {
  name = clean(name, 120) || orgId;
  return send(deps, 'referAlert', { orgId: by.referrerOrgId, subject: 'Referred signup: ' + name, title: 'A referred company signed up',
    text: (clean(by.referrerName, 120) || by.referrerOrgId) + ' referred ' + name + ' (' + orgId + ') by ' + (by.via === 'invite' ? 'an emailed invitation' : 'its link') + '. The ' + money(REWARD_CENTS) + ' credit is issued when ' + name + ' pays its first invoice.' });
}

/* ── the reward: the referred workspace paid ────────────────────────────── */
async function owners(db, orgId) {
  var root = db.doc('omega_orgs/' + orgId), out = [];
  var q = await root.collection('members').where('role', '==', 'owner').limit(5).get();
  q.docs.forEach(function (d) { var m = d.data() || {}; if (m.status !== 'disabled' && m.email && out.indexOf(String(m.email).toLowerCase()) < 0) out.push(String(m.email).toLowerCase()); });
  if (!out.length) { var org = await root.get(); var e = org.exists && org.data().signup && org.data().signup.email; if (e) out.push(String(e).toLowerCase()); }
  return out;
}
async function onPaid(db, orgId, now, source, deps) {
  var sref = db.doc('refer_signups/' + orgId), first = await sref.get();
  if (!first.exists || first.data().state !== 'signed_up') return null;
  var out = null;
  for (var tries = 0; tries < 3 && !out; tries++) {
    var code = 'CR' + random(10), cref = db.doc('refer_credits/' + code);
    out = await db.runTransaction(async function (tx) {
      var s = await tx.get(sref), clash = await tx.get(cref);
      if (!s.exists || s.data().state !== 'signed_up') return { skipped: true };
      if (clash.exists) return null;
      var r = s.data(), referrer = await tx.get(db.doc('omega_orgs/' + r.referrerOrgId));
      var referrerName = clean(referrer.exists ? referrer.data().name : r.referrerName, 120) || r.referrerOrgId;
      var credit = { code: code, orgId: r.referrerOrgId, amountCents: REWARD_CENTS, remainingCents: REWARD_CENTS, state: 'issued',
        referredOrgId: orgId, referredName: clean(r.referredName, 120) || orgId, source: source, issuedAt: now, expiresAt: now + EXPIRES_DAYS * DAY };
      tx.set(cref, credit);
      tx.update(sref, { state: 'rewarded', rewardedAt: now, rewardedBy: source, creditCode: code });
      tx.set(db.doc('omega_orgs/' + r.referrerOrgId + '/notifications/refer-earned-' + orgId), { kind: 'billing', read: false, createdAt: now, code: code,
        text: credit.referredName + ' became an OMEGA customer through your referral. Your workspace earned a ' + money(REWARD_CENTS) + ' credit: code ' + pretty(code) + '. Apply it to your bill from Refer & earn.' });
      tx.set(db.doc('omega_orgs/' + STAFF_ORG + '/notifications/refer-earned-' + orgId), { kind: 'referral', read: false, createdAt: now, orgId: r.referrerOrgId,
        text: 'Referral rewarded: ' + referrerName + ' sent ' + credit.referredName + ' (' + orgId + '), which paid (' + source + '). ' + money(REWARD_CENTS) + ' code ' + pretty(code) + ' issued.' });
      tx.set(db.doc('omega_orgs/' + r.referrerOrgId + '/admin_audit/refer-earned-' + orgId), { at: now, by: source, action: 'referral-rewarded', code: code,
        changed: { referredOrgId: orgId, referredName: credit.referredName, amountCents: REWARD_CENTS, expiresOn: iso(credit.expiresAt) } });
      return { code: code, referrerOrgId: r.referrerOrgId, referrerName: referrerName, referredOrgId: orgId, referredName: credit.referredName, invitedBy: r.invitedBy || null, expiresAt: credit.expiresAt, source: source };
    });
  }
  if (!out) fail('Could not issue the referral credit; it is retried on the next payment check', 503);
  if (out.skipped) return null;
  var to = await owners(db, out.referrerOrgId);
  if (out.invitedBy && to.indexOf(String(out.invitedBy).toLowerCase()) < 0) to.push(String(out.invitedBy).toLowerCase());
  var host = 'https://' + K.home(null) + '/workspace#refer';
  for (var i = 0; i < to.length; i++) await send(deps, 'referEarned', { email: to[i], company: out.referrerName, referredName: out.referredName, code: pretty(out.code), display: money(REWARD_CENTS), expiresOn: iso(out.expiresAt), url: host });
  await send(deps, 'referAlert', { orgId: out.referrerOrgId, subject: 'Referral rewarded: ' + out.referrerName + ' (' + money(REWARD_CENTS) + ')', title: 'A referral became a customer',
    text: out.referrerName + ' referred ' + out.referredName + ' (' + out.referredOrgId + '), which paid (' + out.source + '). Code ' + pretty(out.code) + ' for ' + money(REWARD_CENTS) + ' was issued to ' + out.referrerName + '.' });
  return out;
}

/* ── applying a code to the bill ─────────────────────────────────────────── */
function routeText(route, amountCents) {
  if (route === 'invoice') return money(amountCents) + ' comes off your next invoice. Anything the invoice does not use carries to the one after.';
  if (route === 'stripe') return money(amountCents) + ' is on your Stripe balance and comes off your next invoice.';
  return money(amountCents) + ' is recorded on your account; ClearSky takes it off your next invoice.';
}
async function stripeCredit(customerId, c, orgId, deps) {
  var stripe = deps && deps.stripe ? deps.stripe : (process.env.STRIPE_SECRET_KEY ? require('stripe')(process.env.STRIPE_SECRET_KEY) : null);
  if (!stripe) throw new Error('STRIPE_SECRET_KEY is not set on this deployment');
  /* a negative balance is a credit Stripe applies to the customer's next invoice; one per code, however often this is retried */
  return stripe.customers.createBalanceTransaction(customerId, { amount: -c.amountCents, currency: 'usd',
    description: 'OMEGA referral credit ' + pretty(c.code) + (c.referredName ? ' (' + c.referredName + ')' : ''), metadata: { orgId: orgId, code: c.code, kind: 'omega-referral-credit' } },
    { idempotencyKey: 'omega-referral-credit-' + c.code });
}
async function apply(db, orgId, raw, caller, now, deps) {
  var code = normalize(raw);
  if (!isCredit(code)) fail('Enter the code as it appears in your email, like CR-7K3PQ-9XD2M', 400);
  var cref = db.doc('refer_credits/' + code), root = db.doc('omega_orgs/' + orgId), current = root.collection('billing').doc('current');
  var rows = await Promise.all([cref.get(), current.get(), root.get()]), c = rows[0].exists ? rows[0].data() : null;
  /* the same answer for a code that does not exist and one that is another workspace's: a code cannot be probed */
  if (!c || c.orgId !== orgId) fail('That code is not one of this workspace’s credits', 404);
  if (c.state === 'applied' || c.state === 'used') return { ok: true, already: true, code: code, pretty: pretty(code), route: c.route, display: money(c.amountCents),
    text: c.state === 'used' ? 'Already used: it came off an invoice.' : 'Already applied. ' + routeText(c.route, c.remainingCents == null ? c.amountCents : c.remainingCents) };
  if (c.state === 'void') fail('That code was withdrawn by ClearSky', 409);
  if (expired(c, now)) fail('That code expired on ' + iso(c.expiresAt), 409);
  if (c.state !== 'issued') fail('That code cannot be applied', 409);
  if (!rows[2].exists || rows[2].data().status !== 'active') fail('Your workspace is not active', 409);
  /* no billing record (a workspace ClearSky invoices entirely by hand): the
     credit goes to ClearSky like any hand-billed one, and no billing record
     is ever made out of a code (the opt-in rule) */
  var bill = rows[1].exists ? rows[1].data() : {}, route = bill.packaged === true ? 'invoice' : bill.stripeCustomerId ? 'stripe' : 'manual', txn = null, stripeError = null;
  var company = clean(rows[2].data().name, 120) || orgId;
  if (route === 'stripe') {
    try { txn = await stripeCredit(bill.stripeCustomerId, c, orgId, deps); }
    catch (e) { route = 'manual'; stripeError = String(e && e.message || e).slice(0, 200); }
  }
  var done = await db.runTransaction(async function (tx) {
    var fresh = await tx.get(cref), live = await tx.get(current), f = fresh.data();
    if (f.state === 'applied' || f.state === 'used') return { already: true, credit: f };
    if (f.state !== 'issued' || f.orgId !== orgId) fail('That code changed; refresh and try again', 409);
    var patch = { state: 'applied', route: route, appliedAt: now, appliedBy: caller.email, remainingCents: route === 'stripe' ? 0 : f.amountCents };
    if (txn) patch.stripeBalanceTxn = txn.id || null;
    if (stripeError) patch.stripeError = stripeError;
    tx.update(cref, patch);
    var event = { at: now, by: caller.email, action: 'referral-credit-applied', code: code, changed: { amountCents: f.amountCents, route: route, referredName: f.referredName || null } };
    if (live.exists) tx.set(current.collection('history').doc('refer-' + code), event);
    tx.set(root.collection('admin_audit').doc('refer-apply-' + code), event);
    if (route === 'manual') tx.set(db.doc('omega_orgs/' + STAFF_ORG + '/notifications/refer-apply-' + code), { kind: 'referral', read: false, createdAt: now, orgId: orgId,
      text: 'Take ' + money(f.amountCents) + ' off the next invoice for ' + company + ': referral credit ' + pretty(code) + ' applied by ' + caller.email + '. Mark it taken off in the tenant’s Referrals panel.' });
    return { credit: Object.assign({}, f, patch) };
  });
  var credit = done.credit;
  if (!done.already && credit.route === 'manual') await send(deps, 'referAlert', { orgId: orgId, subject: 'Take ' + money(credit.amountCents) + ' off ' + company + '’s next invoice', title: 'A referral credit was applied',
    text: company + ' applied referral credit ' + pretty(code) + ' (' + money(credit.amountCents) + '). This workspace is invoiced outside the package engine' + (stripeError ? ' (Stripe refused: ' + stripeError + ')' : '') + ': take it off the next invoice, then mark it taken off in the tenant’s Referrals panel.' });
  return { ok: true, already: !!done.already, code: code, pretty: pretty(code), route: credit.route, display: money(credit.amountCents), text: (done.already ? 'Already applied. ' : 'Applied. ') + routeText(credit.route, credit.amountCents) };
}

/* ── the invoice: package-billing issue() draws applied credits ──────────
   Pure. The credits the workspace applied (state 'applied', something left,
   the oldest first) come off a NEW invoice plan as discount lines on the
   price book's `credit` item (QuickBooks has it already: a discount is a
   DiscountLineDetail, which qbo-billing sums into its one discount line),
   never below $0. Returns the plan with the lines, its subtotal and a
   `credits` note of what was drawn, and each credit's new remainder for
   recordDraws to write in the same transaction. */
function draw(plan, credits) {
  var room = Math.max(0, (plan.lines || []).reduce(function (n, l) { return n + l.amountCents; }, 0)), lines = (plan.lines || []).slice(), used = [];
  (credits || []).filter(function (c) { return c && c.state === 'applied' && (c.remainingCents || 0) > 0 && isCredit(c.code); })
    .sort(function (a, b) { return (a.appliedAt || 0) - (b.appliedAt || 0) || (a.code < b.code ? -1 : 1); })
    .forEach(function (c) {
      if (!room) return;
      var take = Math.min(room, c.remainingCents); room -= take;
      lines.push({ itemKey: 'credit', kind: 'referral', code: c.code, name: 'Referral credit ' + pretty(c.code), quantity: 1, amountCents: -take });
      used.push({ code: c.code, cents: take, remainingCents: c.remainingCents - take, draws: (c.draws || []).concat([{ date: plan.date, cents: take }]) });
    });
  if (!used.length) return { plan: plan, used: [] };
  var subtotal = lines.reduce(function (n, l) { return n + l.amountCents; }, 0);
  return { plan: Object.assign({}, plan, { lines: lines, subtotalCents: subtotal, credits: used.map(function (u) { return { code: u.code, cents: u.cents }; }),
    display: Object.assign({}, plan.display || {}, { subtotal: money(subtotal) }) }), used: used };
}
function appliedQuery(db, orgId) { return db.collection('refer_credits').where('orgId', '==', orgId).where('state', '==', 'applied'); }
function recordDraws(tx, db, used, now) {
  (used || []).forEach(function (u) { tx.update(db.doc('refer_credits/' + u.code), { remainingCents: u.remainingCents, state: u.remainingCents > 0 ? 'applied' : 'used', draws: u.draws, lastDrawnAt: now }); });
}
function covered(plan) { return ((plan && plan.credits) || []).reduce(function (n, x) { return n + (x.cents || 0); }, 0); }

/* ── invitations by email ────────────────────────────────────────────────── */
async function invite(db, orgId, input, caller, now, deps) {
  var email = String(input.email || '').trim().toLowerCase();
  if (email.length > 200 || !/^[^\s@<>"]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(email)) fail('Enter their work email address', 400);
  var A = require('./admin'), domain = A.safeOrg(email.split('@')[1]);
  if (!domain) fail('Enter their work email address', 400);
  if (PUBLIC.indexOf(domain) >= 0) fail('Invite them at their work address: OMEGA workspaces are made with a company email, not ' + domain, 400);
  if (domain === orgId) fail('That is a colleague: anyone at @' + orgId + ' joins this workspace by signing in', 400);
  var org = await db.doc('omega_orgs/' + orgId).get();
  if (!org.exists || org.data().status !== 'active') fail('Your workspace can refer companies once it is active', 409);
  var name = clean(input.name, 80), company = clean(input.company, 120), note = clean(input.note, 500), l = await link(db, orgId, caller, now);
  var lref = db.doc('refer_links/' + orgId), iref = db.doc('refer_invites/' + orgId + '__' + domain), day = iso(now);
  await db.runTransaction(async function (tx) {
    var ls = await tx.get(lref), is = await tx.get(iref), ld = ls.exists ? ls.data() : {}, count = ld.invites && ld.invites.day === day ? ld.invites.count || 0 : 0;
    if (count >= INVITES_PER_DAY) fail('That is ' + INVITES_PER_DAY + ' invitations today; send more tomorrow, or share your link', 429);
    var prev = is.exists ? is.data() : null;
    tx.set(lref, { invites: { day: day, count: count + 1 } }, { merge: true });
    tx.set(iref, { orgId: orgId, domain: domain, email: email, name: name || null, company: company || null, by: caller.email, at: prev ? prev.at : now, lastAt: now, count: (prev && prev.count || 0) + 1 });
  });
  var who = clean(caller.claims && caller.claims.name, 80) || caller.email.split('@')[0];
  var sent = await send(deps, 'referInvite', { email: email, name: name, company: company, note: note, inviterName: who, inviterEmail: caller.email, workspace: clean(org.data().name, 120) || orgId, url: l.url });
  return { ok: true, email: email, sent: !!(sent && sent.ok), url: l.url,
    text: sent && sent.ok ? 'Invitation sent to ' + email + '. When ' + (company || domain) + ' becomes a customer, your workspace earns ' + money(REWARD_CENTS) + '.' : 'Recorded, but the email could not be sent from here: send ' + email + ' your link instead.' };
}

/* ── what the page shows ─────────────────────────────────────────────────── */
function creditView(c, now, staff) {
  var left = c.remainingCents == null ? c.amountCents : c.remainingCents, out = { code: c.code, pretty: pretty(c.code), amountCents: c.amountCents, display: money(c.amountCents),
    state: expired(c, now) ? 'expired' : c.state, remainingCents: left, remainingDisplay: money(left), route: c.route || null, referredName: c.referredName || null,
    issuedOn: c.issuedAt ? iso(c.issuedAt) : null, expiresOn: c.expiresAt ? iso(c.expiresAt) : null, appliedOn: c.appliedAt ? iso(c.appliedAt) : null, appliedBy: c.appliedBy || null,
    draws: (c.draws || []).map(function (d) { return { date: d.date, cents: d.cents, display: money(d.cents) }; }) };
  if (staff) Object.assign(out, { referredOrgId: c.referredOrgId || null, source: c.source || null, stripeBalanceTxn: c.stripeBalanceTxn || null, stripeError: c.stripeError || null,
    settledBy: c.settledBy || null, settledNote: c.settledNote || null, voidedBy: c.voidedBy || null, voidReason: c.voidReason || null });
  return out;
}
function referralView(r, staff) {
  var out = { name: r.referredName || r.referredOrgId, state: r.state, via: r.via || null, signedUpOn: r.signedUpAt ? iso(r.signedUpAt) : null, rewardedOn: r.rewardedAt ? iso(r.rewardedAt) : null };
  if (staff) Object.assign(out, { referredOrgId: r.referredOrgId, referrerOrgId: r.referrerOrgId, referrerName: r.referrerName || null, referredEmail: r.referredEmail || null, invitedBy: r.invitedBy || null,
    creditCode: r.creditCode ? pretty(r.creditCode) : null, declineReason: r.declineReason || null });
  return out;
}
async function summary(db, orgId, now, opts) {
  opts = opts || {};
  var rows = await Promise.all([db.doc('omega_orgs/' + orgId).get(), db.doc('refer_links/' + orgId).get(),
    db.collection('refer_credits').where('orgId', '==', orgId).get(), db.collection('refer_signups').where('referrerOrgId', '==', orgId).get(),
    db.collection('refer_invites').where('orgId', '==', orgId).get(), opts.staff ? db.doc('refer_signups/' + orgId).get() : null]);
  var org = rows[0].exists ? rows[0].data() : null, status = org && org.status || null, l = rows[1].exists ? rows[1].data() : null;
  var credits = rows[2].docs.map(function (d) { return creditView(d.data(), now, opts.staff); }).sort(function (a, b) { return String(b.issuedOn).localeCompare(String(a.issuedOn)); });
  var referrals = rows[3].docs.map(function (d) { return d.data(); }).sort(function (a, b) { return (b.signedUpAt || 0) - (a.signedUpAt || 0); });
  var joined = referrals.map(function (r) { return r.referredOrgId; });
  var waiting = credits.filter(function (c) { return c.state === 'issued'; }), onBill = credits.filter(function (c) { return c.state === 'applied' && c.route !== 'stripe' && c.remainingCents > 0; });
  var sum = function (list, k) { return list.reduce(function (n, c) { return n + (c[k] || 0); }, 0); };
  var out = { orgId: orgId, status: status, canRefer: status === 'active',
    reason: status === 'active' ? null : !org ? 'This workspace is not set up yet.' : status === 'pending' ? 'Your workspace can refer companies once it is approved.' : 'Referrals are paused while this workspace is ' + status + '.',
    reward: { cents: REWARD_CENTS, display: money(REWARD_CENTS), expiresDays: EXPIRES_DAYS, invitesPerDay: INVITES_PER_DAY },
    link: l && l.code ? { code: l.code, url: url(l.code), active: l.active !== false } : null,
    credits: credits, waiting: { count: waiting.length, cents: sum(waiting, 'amountCents'), display: money(sum(waiting, 'amountCents')) },
    onBill: { cents: sum(onBill, 'remainingCents'), display: money(sum(onBill, 'remainingCents')) },
    referrals: referrals.map(function (r) { return referralView(r, opts.staff); }),
    invites: rows[4].docs.map(function (d) { var i = d.data(); return { email: i.email, name: i.name || null, company: i.company || null, sentOn: iso(i.lastAt || i.at), count: i.count || 1, joined: joined.indexOf(i.domain) >= 0 }; })
      .sort(function (a, b) { return b.sentOn.localeCompare(a.sentOn); }).slice(0, 50) };
  if (opts.staff) out.referredBy = rows[5] && rows[5].exists ? referralView(rows[5].data(), true) : null;
  return out;
}

/* ── ClearSky's controls (api/refer.js, staff only) ──────────────────────── */
function audit(tx, db, orgId, id, event) { tx.set(db.doc('omega_orgs/' + orgId + '/admin_audit/' + id), event); }
/* a referred workspace billed outside QuickBooks and Stripe paid: reward it by hand */
async function qualify(db, referredOrgId, caller, now, deps) {
  var out = await onPaid(db, referredOrgId, now, 'staff:' + caller.email, deps);
  if (!out) fail('No open referral for ' + referredOrgId + ': it was never referred, or it is already rewarded or declined', 409);
  return { ok: true, code: out.code, pretty: pretty(out.code), referrerOrgId: out.referrerOrgId, display: money(REWARD_CENTS) };
}
/* a referral that came in outside the link (a call, an introduction): recorded before the company pays */
async function attribute(db, referredOrgId, referrerOrgId, caller, now) {
  if (!referrerOrgId || referrerOrgId === referredOrgId) fail('Name the workspace that referred ' + referredOrgId, 400);
  var sref = db.doc('refer_signups/' + referredOrgId);
  return db.runTransaction(async function (tx) {
    var s = await tx.get(sref), a = await tx.get(db.doc('omega_orgs/' + referredOrgId)), b = await tx.get(db.doc('omega_orgs/' + referrerOrgId));
    if (!a.exists) fail('No workspace ' + referredOrgId, 404);
    if (s.exists) fail(referredOrgId + ' is already recorded as referred by ' + (s.data().referrerName || s.data().referrerOrgId), 409);
    if (!b.exists) fail('No workspace ' + referrerOrgId, 404);
    var rec = signupRecord({ referrerOrgId: referrerOrgId, referrerName: b.data().name || referrerOrgId, via: 'staff' }, referredOrgId, a.data().name, a.data().signup && a.data().signup.email, now);
    rec.recordedBy = caller.email;
    tx.set(sref, rec);
    var event = { at: now, by: caller.email, action: 'referral-recorded', changed: { referredOrgId: referredOrgId, referrerOrgId: referrerOrgId } };
    audit(tx, db, referredOrgId, 'refer-recorded-' + referredOrgId, event); audit(tx, db, referrerOrgId, 'refer-recorded-' + referredOrgId, event);
    return { ok: true, state: rec.state, referredOrgId: referredOrgId, referrerOrgId: referrerOrgId };
  });
}
/* not a real referral (the same company under another domain, say): no credit will be issued */
async function decline(db, referredOrgId, caller, now, reason) {
  reason = clean(reason, 300); if (reason.length < 5) fail('Say why the referral is declined', 400);
  var sref = db.doc('refer_signups/' + referredOrgId);
  return db.runTransaction(async function (tx) {
    var s = await tx.get(sref); if (!s.exists) fail('No referral recorded for ' + referredOrgId, 404);
    var r = s.data(); if (r.state !== 'signed_up') fail('Only a referral waiting for its first payment can be declined; this one is ' + r.state, 409);
    tx.update(sref, { state: 'declined', declinedAt: now, declinedBy: caller.email, declineReason: reason });
    audit(tx, db, r.referrerOrgId, 'refer-declined-' + referredOrgId, { at: now, by: caller.email, action: 'referral-declined', changed: { referredOrgId: referredOrgId, reason: reason } });
    return { ok: true, state: 'declined' };
  });
}
/* a credit on a hand-invoiced account was taken off an invoice: say which */
async function settle(db, raw, caller, now, note) {
  var code = normalize(raw); if (!isCredit(code)) fail('Invalid code', 400);
  note = clean(note, 300); if (note.length < 5) fail('Say which invoice it came off', 400);
  var cref = db.doc('refer_credits/' + code);
  return db.runTransaction(async function (tx) {
    var s = await tx.get(cref); if (!s.exists) fail('No such code', 404);
    var c = s.data(); if (c.state !== 'applied' || !(c.remainingCents > 0)) fail('Only an applied credit with something left can be marked taken off', 409);
    tx.update(cref, { state: 'used', remainingCents: 0, settledAt: now, settledBy: caller.email, settledNote: note, draws: (c.draws || []).concat([{ date: iso(now), cents: c.remainingCents, note: note }]) });
    audit(tx, db, c.orgId, 'refer-settled-' + code, { at: now, by: caller.email, action: 'referral-credit-settled', code: code, changed: { cents: c.remainingCents, note: note } });
    return { ok: true, state: 'used', code: code };
  });
}
/* withdraw a code nothing has been taken off yet (a mistake, or a refunded first payment) */
async function voidCredit(db, raw, caller, now, reason) {
  var code = normalize(raw); if (!isCredit(code)) fail('Invalid code', 400);
  reason = clean(reason, 300); if (reason.length < 5) fail('Say why the code is withdrawn', 400);
  var cref = db.doc('refer_credits/' + code);
  return db.runTransaction(async function (tx) {
    var s = await tx.get(cref); if (!s.exists) fail('No such code', 404);
    var c = s.data(), untouched = c.state === 'issued' || (c.state === 'applied' && c.route !== 'stripe' && c.remainingCents === c.amountCents);
    if (!untouched) fail(c.state === 'void' ? 'Already withdrawn' : c.route === 'stripe' ? 'This credit is on the Stripe balance: reverse it in Stripe' : 'Part of this credit was already taken off an invoice', 409);
    tx.update(cref, { state: 'void', remainingCents: 0, voidedAt: now, voidedBy: caller.email, voidReason: reason });
    audit(tx, db, c.orgId, 'refer-void-' + code, { at: now, by: caller.email, action: 'referral-credit-void', code: code, changed: { was: c.state, reason: reason } });
    return { ok: true, state: 'void', code: code };
  });
}

module.exports = { REWARD_CENTS: REWARD_CENTS, EXPIRES_DAYS: EXPIRES_DAYS, INVITES_PER_DAY: INVITES_PER_DAY, INVITE_DAYS: INVITE_DAYS,
  normalize: normalize, isShare: isShare, isCredit: isCredit, pretty: pretty, url: url,
  link: link, attribution: attribution, signupRecord: signupRecord, signedUp: signedUp, onPaid: onPaid, apply: apply,
  draw: draw, appliedQuery: appliedQuery, recordDraws: recordDraws, covered: covered, invite: invite, summary: summary,
  qualify: qualify, attribute: attribute, decline: decline, settle: settle, voidCredit: voidCredit };
