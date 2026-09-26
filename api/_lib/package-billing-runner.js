/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Bounded daily billing with five-minute continuation and reconciliation.
 * The existing Intuit webhook is only a wake-up hint; grants always come
 * from package-billing.reconcile reading QuickBooks invoices and payments.
 */
'use strict';
var S = require('./package-billing'), R = require('./proration'), P = require('./subscription-pricing');
var Mode = require('./packaging-mode');
var crypto = require('crypto');
function authorize(req) {
  var secret = process.env.CRON_SECRET, expected = Buffer.from('Bearer ' + (secret || ''));
  var actual = Buffer.from(req.headers && req.headers.authorization || '');
  if (!secret || actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    var e = new Error('Worker authorization required'); e.status = 401; throw e;
  }
}
async function notice(db, orgId, now) {
  var c = await S.context(db, orgId), b = c.billing; S.guard(c);
  var start = require('./package-billing-policy').instant(b.trialStartedAt), end = require('./package-billing-policy').instant(b.trialEndsAt);
  if (b.packagingState !== 'trial' || !isFinite(start) || now < start + 10 * R.DAY || now >= end) return;
  var quote = P.quote(b.modules, c.book, { plan: b.plan, builders: b.builders, viewers: b.viewers, credit: b.credit, now: now });
  var ref = c.root.collection('notifications').doc('package-trial-day-11');
  await db.runTransaction(async function (tx) {
    var old = await tx.get(ref); if (old.exists) return;
    tx.create(ref, { kind: 'billing', read: false, createdAt: now, packageMail: 'trialEnding', mailState: 'pending',
      text: 'Your trial ends on ' + R.iso(end) + '. Your plan: ' + quote.plan + ', ' + quote.display.monthly + '.',
      plan: quote.plan, monthlyDisplay: quote.display.monthly });
  });
}
async function deliver(db, orgId, now, mailer) {
  var root = db.doc('omega_orgs/' + orgId), org = (await root.get()).data();
  var billing = (await root.collection('billing').doc('current').get()).data();
  var profile = (await root.collection('billing').doc('profile').get()).data();
  var rows = await root.collection('notifications').where('mailState', '==', 'pending').limit(3).get();
  for (var i = 0; i < rows.docs.length; i++) {
    var row = rows.docs[i], data = row.data();
    if (['approved', 'trialEnding', 'packageInvoice'].indexOf(data.packageMail) < 0) continue;
    // SMTP cannot provide exactly-once delivery. Claim once; an ambiguous
    // crash remains visible as sending and requires operator review.
    var claimed = await db.runTransaction(async function (tx) {
      var fresh = await tx.get(row.ref); if (fresh.data().mailState !== 'pending') return false;
      tx.update(row.ref, { mailState: 'sending', mailAttemptedAt: now }); return true;
    });
    if (!claimed) continue;
    var payload = Object.assign({}, data, { email: data.packageMail === 'approved' && org.signup && org.signup.email || profile.email, company: org.name || orgId, orgId: orgId,
      host: (org.domains || [])[0], trialEndsAt: billing.trialEndsAt });
    try {
      var result = await mailer.templates[data.packageMail](payload);
      await row.ref.update({ mailState: result && result.ok ? 'sent' : 'review-required', mailCompletedAt: now });
    } catch (e) { await row.ref.update({ mailState: 'review-required', mailCompletedAt: now }); }
  }
}
async function tick(db, now, options) {
  options = options || {};
  if (process.env.PACKAGING_BILLING_ENABLED !== 'true') return { disabled: true };
  // Guard before any state change, even the worker cursor: the sandbox, or
  // production only under the live switch (packaging-mode).
  if (!Mode.open()) return { disabled: true, reason: 'sandbox-required' };
  var state = db.doc('integrations/packaging-billing'), id = crypto.randomBytes(12).toString('hex');
  var lease = await db.runTransaction(async function (tx) {
    var snap = await tx.get(state), old = snap.exists ? snap.data() : {};
    if (old.lock && old.lock.until > now) return null;
    tx.set(state, { lock: { id: id, until: now + 120000 } }, { merge: true }); return old;
  });
  if (!lease) return { busy: true };
  var count = Math.min(options.limit || 1, 5), results = [], last = lease.cursor || null;
  try {
    var query = db.collection('omega_orgs').where(Mode.live() ? 'packaged' : 'packagingSandbox', '==', true).orderBy('__name__').limit(count);
    if (last) query = query.startAfter(last);
    var rows = await query.get();
    for (var i = 0; i < rows.docs.length; i++) {
      var org = rows.docs[i];
      try {
        var c = await S.context(db, org.id);
        if (c.billing.packaged && c.org.status === 'active') {
          await notice(db, org.id, now);
          var invoice = await S.issue(db, org.id, now, options.qbo);
          var payment = await S.reconcile(db, org.id, now, options.qbo, { limit: 2 });
          await deliver(db, org.id, now, options.mail || require('./mail'));
          results.push({ orgId: org.id, invoice: invoice, payment: payment });
        }
      } catch (e) { results.push({ orgId: org.id, reviewRequired: true, error: String(e.message).slice(0, 200) }); }
      last = org.id;
    }
    await state.set({ cursor: rows.docs.length === count ? last : null, lastRunAt: now, results: results }, { merge: true });
    return { ok: true, results: results };
  } finally {
    await db.runTransaction(async function (tx) { var s = await tx.get(state); if (s.exists && s.data().lock && s.data().lock.id === id) tx.update(state, { lock: null }); });
  }
}
module.exports = { authorize: authorize, tick: tick, notice: notice, deliver: deliver };
