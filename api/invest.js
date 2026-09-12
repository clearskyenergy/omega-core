/* ═══════════════════════════════════════════════════════════════════════════════
   POST /api/invest   —  community investment: quotes, pledges, campaign lifecycle
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   The storefront (/portals/invest/) is a shop window. Every number about
   money and every decision about who may invest comes from here, because
   browser code is public and this is the IP (CLAUDE.md → IP protection).
   The engine is api/_lib/invest-math.js; state changes go through
   api/_lib/invest-ledger.js so the Stripe webhook and a staff click can
   never disagree.

   Body: { action, ... }.  Every action but `quote` requires a Firebase ID
   token (Authorization: Bearer).  `quote` accepts one when present so the
   projection can be personalised, and answers without one so a visitor can
   move the slider before creating an account — it reads only the public
   campaign document, the same one the browser already has.

   INVESTOR
     quote      { campaignId, amount }                → projection for that amount
     pledge     { campaignId, amount, perkId?, attest:{ name, country,
                  accredited, acceptedRisk, acceptedTerms } }
                → creates cf_pledges (pending) and a Stripe Checkout Session;
                  returns { pledgeId, url } or, with no Stripe key,
                  { pledgeId, manual:true, instructions }
     cancel     { pledgeId }                          → pending → cancelled

   SPONSOR (tenant user, canActInOrg(sponsorOrgId))
     submit     { campaignId }                        → draft → review; ClearSky notified

   STAFF
     review     { campaignId, decision:'launch'|'return', note? }
                  launch → live (terms validated, headline computed, unitsTotal set)
                  return → back to draft with reviewNote
     close      { campaignId, outcome:'funded'|'failed' }
                  failed refunds every paid Stripe pledge (best effort, recorded)
     confirm    { pledgeId, reference? }              → manual/wire payment received
     refund     { pledgeId, reason? }                 → one paid pledge → refunded
     distribute { campaignId, period, grossRevenue, distributable, note? }
                  → cf_distributions row with the per-unit figure

   ENV: STRIPE_SECRET_KEY (optional — manual mode without it),
        INVEST_BASE_URL (optional; defaults to the request origin),
        FIREBASE_SERVICE_ACCOUNT (required — this endpoint writes).
   ═══════════════════════════════════════════════════════════════════════════════ */
'use strict';
var A = require('./_lib/admin');
var IM = require('./_lib/invest-math');
var L = require('./_lib/invest-ledger');
var M = require('./_lib/mail');

var TERMS_VERSION = '2026-09-1';
var RISK_VERSION = '2026-09-1';
var OFFER_KINDS = ['ppa', 'compute', 'hybrid'];
var PROJECT_TYPES = ['compute', 'microgrid', 'bess', 'solar', 'ev'];

function usd(n) { return '$' + Math.round(Number(n) || 0).toLocaleString('en-US'); }

function optionalAuth(req) {
  if (!/^Bearer /.test(req.headers.authorization || '')) return Promise.resolve(null);
  return A.authenticate(req).catch(function () { return null; });
}

function loadCampaign(db, id) {
  if (!id) throw A.httpError(400, 'campaignId is required');
  return db.collection('cf_campaigns').doc(String(id)).get().then(function (s) {
    if (!s.exists) throw A.httpError(404, 'campaign not found');
    var c = s.data(); c.id = s.id; return c;
  });
}
function loadRules(db) {
  return db.collection('cf_settings').doc('rules').get()
    .then(function (s) { return IM.rules(s.exists ? s.data() : {}); })
    .catch(function () { return IM.rules({}); });
}
function baseUrl(req) {
  if (process.env.INVEST_BASE_URL) return String(process.env.INVEST_BASE_URL).replace(/\/+$/, '');
  var origin = req.headers.origin;
  if (origin && /^https?:\/\//.test(origin)) return origin.replace(/\/+$/, '');
  return 'https://' + (req.headers['x-forwarded-host'] || req.headers.host || 'app.clearskyomega.com');
}
function stripeClient() {
  var key = process.env.STRIPE_SECRET_KEY;
  return key ? require('stripe')(key) : null;
}

/* ── quote ─────────────────────────────────────────────────────────────── */
function quote(req, b, db) {
  return loadCampaign(db, b.campaignId).then(function (c) {
    if (['live', 'funded', 'closed'].indexOf(c.status) < 0) throw A.httpError(404, 'campaign is not open');
    var units = IM.unitsFor(b.amount, c.unitPrice);
    var p = IM.projection(c, units);
    p.remainingUnits = IM.unitsRemaining(c);
    p.progress = IM.progress(c);
    p.headline = IM.headline(c);
    return optionalAuth(req).then(function (caller) {
      if (!caller) { p.personalized = false; return p; }
      return Promise.all([loadRules(db), db.collection('cf_investors').doc(caller.uid).get(), L.committedThisYear(caller.uid)]).then(function (r) {
        var inv = r[1].exists ? r[1].data() : {};
        inv.acceptedRisk = true;   /* the acknowledgement is collected at pledge time; a quote must not nag */
        var e = IM.eligibility(r[0], inv, p.amount, c, r[2]);
        p.personalized = true; p.eligible = e.ok; p.reasons = e.reasons; p.committedThisYear = r[2];
        p.minInvestment = e.minInvestment; p.maxInvestment = e.maxInvestment;
        return p;
      });
    });
  });
}

/* ── pledge ────────────────────────────────────────────────────────────── */
function pledge(req, b, db, FV, caller) {
  var at = b.attest || {};
  return Promise.all([loadCampaign(db, b.campaignId), loadRules(db), db.collection('cf_investors').doc(caller.uid).get(), L.committedThisYear(caller.uid)]).then(function (r) {
    var c = r[0], rules = r[1], invSnap = r[2], prior = r[3];
    if (c.status !== 'live') throw A.httpError(409, 'this campaign is not accepting investment');
    var prog = IM.progress(c);
    if (prog.expired) throw A.httpError(409, 'this campaign has closed');
    if (c.sponsorOrgId && c.sponsorOrgId === caller.orgId && !caller.staff) throw A.httpError(403, 'a sponsor cannot invest in its own campaign');

    var units = IM.unitsFor(b.amount, c.unitPrice);
    if (units < 1) throw A.httpError(400, 'the minimum is one unit of ' + usd(c.unitPrice));
    var remaining = IM.unitsRemaining(c);
    if (units > remaining) throw A.httpError(409, 'only ' + remaining + ' units remain');
    var amount = units * Number(c.unitPrice);

    var inv = invSnap.exists ? invSnap.data() : {};
    var merged = {
      status: inv.status || 'active',
      kyc: inv.kyc || 'none',
      accreditedVerified: inv.accreditedVerified === true,
      accredited: at.accredited === true || inv.accredited === true,
      country: String(at.country || inv.country || '').toUpperCase(),
      acceptedRisk: at.acceptedRisk === true
    };
    if (at.acceptedTerms !== true) throw A.httpError(400, 'Please accept the investment terms.');
    if (!merged.country) throw A.httpError(400, 'Country of residence is required.');
    var e = IM.eligibility(rules, merged, amount, c, prior);
    if (!e.ok) throw A.httpError(403, e.reasons.join(' '));

    var perk = null;
    if (b.perkId && Array.isArray(c.perks)) {
      for (var i = 0; i < c.perks.length; i++) if (c.perks[i].id === b.perkId) perk = c.perks[i];
      if (perk && Number(perk.minAmount) > amount) throw A.httpError(400, 'that perk needs at least ' + usd(perk.minAmount));
    }

    var p = IM.projection(c, units);
    var pRef = db.collection('cf_pledges').doc();
    var doc = {
      campaignId: c.id, campaignTitle: c.title || '', sponsorOrgId: c.sponsorOrgId || null,
      investorUid: caller.uid, investorEmail: String(caller.email || '').toLowerCase(), investorName: at.name || inv.name || caller.claims.name || '',
      amount: amount, units: units, unitPrice: Number(c.unitPrice),
      pctOfOffering: p.pctOfOffering, pctOfProject: p.pctOfProject,
      projectedAnnual: p.annualDistribution, projectedTotal: p.total,
      perkId: perk ? perk.id : null, perkTitle: perk ? perk.title : null,
      status: 'pending', paymentProvider: null,
      attest: { name: at.name || null, country: merged.country, accredited: merged.accredited, acceptedRisk: true, acceptedTerms: true, termsVersion: TERMS_VERSION, riskVersion: RISK_VERSION, ip: req.headers['x-forwarded-for'] || null, userAgent: req.headers['user-agent'] || null },
      createdAt: FV.serverTimestamp(), createdAtMs: Date.now(), updatedAt: FV.serverTimestamp()
    };
    /* The profile keeps what the person attested to, so the next pledge
       starts from it. Privilege fields (kyc, accreditedVerified, status)
       are never taken from the body. */
    var profilePatch = { email: doc.investorEmail, name: doc.investorName || inv.name || '', country: merged.country, accredited: merged.accredited,
      acceptedRiskVersion: RISK_VERSION, acceptedTermsVersion: TERMS_VERSION, lastPledgeAt: FV.serverTimestamp(), updatedAt: FV.serverTimestamp() };
    if (!invSnap.exists) { profilePatch.uid = caller.uid; profilePatch.status = 'active'; profilePatch.kyc = 'none'; profilePatch.accreditedVerified = false; profilePatch.createdAt = FV.serverTimestamp(); }

    var stripe = stripeClient();
    var base = baseUrl(req);
    if (!stripe) {
      doc.paymentProvider = 'manual';
      return db.batch().set(pRef, doc).set(db.collection('cf_investors').doc(caller.uid), profilePatch, { merge: true }).commit().then(function () {
        M.send(doc.investorEmail, 'Your commitment to ' + (c.title || 'the project'), M.layout('Commitment received',
          '<p>Thank you. Your commitment of <b>' + usd(amount) + '</b> (' + units + ' units) to <b>' + M.esc(c.title || '') + '</b> is recorded as pending.</p>' +
          '<p>Because card payment is not enabled yet, ClearSky will send funding instructions by email. Nothing is charged until you send funds, and the units are yours once the transfer clears.</p>' +
          '<p>Reference: <code>' + pRef.id + '</code></p>'));
        return { pledgeId: pRef.id, manual: true, amount: amount, units: units,
          instructions: 'Card payment is not enabled yet. ClearSky will email funding instructions; your units are reserved once the transfer clears.' };
      });
    }
    doc.paymentProvider = 'stripe';
    return db.batch().set(pRef, doc).set(db.collection('cf_investors').doc(caller.uid), profilePatch, { merge: true }).commit().then(function () {
      return stripe.checkout.sessions.create({
        mode: 'payment',
        customer_email: doc.investorEmail,
        client_reference_id: pRef.id,
        line_items: [{ quantity: units, price_data: { currency: 'usd', unit_amount: Math.round(Number(c.unitPrice) * 100),
          product_data: { name: (c.title || 'Project') + ' — investment unit', description: p.pctOfProject ? ((p.pctOfProject * 100).toFixed(4) + '% of project distributions for ' + p.termYears + ' years') : undefined } } }],
        metadata: { pledgeId: pRef.id, campaignId: c.id, investorUid: caller.uid, kind: 'cf_pledge' },
        payment_intent_data: { metadata: { pledgeId: pRef.id, campaignId: c.id, kind: 'cf_pledge' }, description: 'Community investment: ' + (c.title || c.id) },
        success_url: base + '/invest?paid=' + pRef.id + '#/portfolio',
        cancel_url: base + '/invest?cancelled=' + pRef.id + '#/c/' + c.id,
        expires_at: Math.floor(Date.now() / 1000) + 30 * 60
      });
    }).then(function (session) {
      return pRef.set({ stripeSessionId: session.id, stripePaymentIntent: session.payment_intent || null, updatedAt: FV.serverTimestamp() }, { merge: true })
        .then(function () { return { pledgeId: pRef.id, url: session.url, amount: amount, units: units }; });
    });
  });
}

function cancel(b, db, caller) {
  return db.collection('cf_pledges').doc(String(b.pledgeId || '')).get().then(function (s) {
    if (!s.exists) throw A.httpError(404, 'pledge not found');
    var p = s.data();
    if (p.investorUid !== caller.uid && !caller.staff) throw A.httpError(403, 'not your pledge');
    var stripe = stripeClient();
    var expire = (stripe && p.stripeSessionId) ? stripe.checkout.sessions.expire(p.stripeSessionId).catch(function () { return null; }) : Promise.resolve(null);
    return expire.then(function () { return L.markCancelled(s.id, caller.staff ? 'staff' : 'investor'); });
  });
}

/* ── sponsor: submit for review ────────────────────────────────────────── */
function submit(b, db, FV, caller) {
  return loadCampaign(db, b.campaignId).then(function (c) {
    return A.canActInOrg(caller, c.sponsorOrgId).then(function (ok) {
      if (!ok) throw A.httpError(403, 'not your campaign');
      if (c.status !== 'draft') throw A.httpError(409, 'campaign is ' + c.status);
      var problems = validateTerms(c);
      if (problems.length) throw A.httpError(400, problems.join(' '));
      var batch = db.batch();
      batch.set(db.collection('cf_campaigns').doc(c.id), { status: 'review', submittedAt: FV.serverTimestamp(), submittedBy: caller.email, reviewNote: null, updatedAt: FV.serverTimestamp() }, { merge: true });
      batch.set(db.collection('omega_orgs').doc('csebuilders.com').collection('notifications').doc(), { kind: 'invest-review', text: 'Campaign submitted for review: ' + (c.title || c.id) + ' (' + c.sponsorOrgId + ') by ' + caller.email + ' — ' + usd(c.goal), campaignId: c.id, orgId: c.sponsorOrgId, read: false, createdAt: FV.serverTimestamp() }, { merge: true });
      return batch.commit().then(function () {
        M.send(process.env.MAIL_NOTIFY || 'dev@clearsky-usa.com', 'Campaign for review: ' + (c.title || c.id), M.layout('Campaign submitted', '<p><b>' + M.esc(c.title || c.id) + '</b> from ' + M.esc(c.sponsorOrgId || '') + ' is waiting for review.</p><table>' + M.row('Goal', usd(c.goal)) + M.row('Unit', usd(c.unitPrice)) + M.row('Share', (c.offer && c.offer.sharePct) + '% for ' + (c.offer && c.offer.termYears) + ' yrs') + M.row('By', caller.email) + '</table>'));
        return { ok: true, status: 'review' };
      });
    });
  });
}

function validateTerms(c) {
  var t = IM.terms(c), out = [];
  if (!c.title || String(c.title).trim().length < 4) out.push('Title is required.');
  if (PROJECT_TYPES.indexOf(c.type) < 0) out.push('Project type must be one of ' + PROJECT_TYPES.join(', ') + '.');
  if (!(t.goal >= 1000)) out.push('Goal must be at least $1,000.');
  if (!(t.unitPrice >= 1)) out.push('Unit price must be at least $1.');
  if (t.unitsTotal < 1) out.push('Goal must cover at least one unit.');
  if (!(t.sharePct > 0)) out.push('Share offered to investors must be above 0%.');
  if (!(t.distributableAnnual > 0)) out.push('Projected annual distributable cash must be above $0.');
  if (OFFER_KINDS.indexOf(t.kind) < 0) out.push('Offer kind must be ppa, compute or hybrid.');
  if (!c.deadline || isNaN(new Date(c.deadline).getTime())) out.push('A funding deadline is required.');
  else if (new Date(c.deadline).getTime() < Date.now() + 86400000) out.push('The deadline must be at least a day away.');
  if (Number(c.minRaise) > t.goal) out.push('Minimum raise cannot exceed the goal.');
  return out;
}

/* ── staff: review / launch ────────────────────────────────────────────── */
function review(b, db, FV, caller) {
  return loadCampaign(db, b.campaignId).then(function (c) {
    var ref = db.collection('cf_campaigns').doc(c.id);
    if (b.decision === 'return') {
      if (c.status !== 'review' && c.status !== 'draft') throw A.httpError(409, 'campaign is ' + c.status);
      return ref.set({ status: 'draft', reviewNote: b.note || 'Returned for changes.', reviewedAt: FV.serverTimestamp(), reviewedBy: caller.email, updatedAt: FV.serverTimestamp() }, { merge: true })
        .then(function () { return { ok: true, status: 'draft' }; });
    }
    if (b.decision !== 'launch') throw A.httpError(400, 'decision must be launch|return');
    if (['review', 'draft'].indexOf(c.status) < 0) throw A.httpError(409, 'campaign is ' + c.status);
    var problems = validateTerms(c);
    if (problems.length) throw A.httpError(400, problems.join(' '));
    var t = IM.terms(c);
    var patch = { status: 'live', unitsTotal: t.unitsTotal, unitPrice: t.unitPrice, goal: t.goal,
      raised: Number(c.raised) || 0, unitsSold: Number(c.unitsSold) || 0, backers: Number(c.backers) || 0,
      headline: IM.headline(c), slug: c.slug || slugify(c.title) + '-' + c.id.slice(0, 5).toLowerCase(),
      launchedAt: FV.serverTimestamp(), reviewedAt: FV.serverTimestamp(), reviewedBy: caller.email, reviewNote: b.note || null, updatedAt: FV.serverTimestamp() };
    return ref.set(patch, { merge: true }).then(function () { return { ok: true, status: 'live', headline: patch.headline, unitsTotal: t.unitsTotal }; });
  });
}
function slugify(s) { return String(s || 'project').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48); }

/* ── staff: close (funded | failed) ────────────────────────────────────── */
function close(b, db, FV, caller) {
  return loadCampaign(db, b.campaignId).then(function (c) {
    if (c.status !== 'live') throw A.httpError(409, 'campaign is ' + c.status);
    var ref = db.collection('cf_campaigns').doc(c.id);
    if (b.outcome === 'funded') {
      return ref.set({ status: 'funded', fundedAt: FV.serverTimestamp(), closedBy: caller.email, proceeds: IM.proceeds(c.raised, IM.terms(c).platformFeePct), updatedAt: FV.serverTimestamp() }, { merge: true })
        .then(function () { return { ok: true, status: 'funded' }; });
    }
    if (b.outcome !== 'failed') throw A.httpError(400, 'outcome must be funded|failed');
    var stripe = stripeClient();
    return db.collection('cf_pledges').where('campaignId', '==', c.id).get().then(function (q) {
      var jobs = [];
      q.forEach(function (d) {
        var p = d.data();
        if (p.status === 'pending' || p.status === 'processing') { jobs.push(L.markCancelled(d.id, 'campaign closed')); return; }
        if (p.status !== 'paid') return;
        if (p.paymentProvider === 'stripe' && stripe && p.stripePaymentIntent) {
          jobs.push(stripe.refunds.create({ payment_intent: p.stripePaymentIntent, metadata: { pledgeId: d.id, reason: 'campaign failed' } })
            .then(function (rf) { return L.markRefunded(d.id, { provider: 'stripe', refundId: rf.id, reason: 'campaign failed' }); })
            .catch(function (e) { return db.collection('cf_pledges').doc(d.id).set({ refundError: e.message, updatedAt: FV.serverTimestamp() }, { merge: true }).then(function () { return { failed: d.id, error: e.message }; }); }));
        } else {
          /* Manual money is returned by hand; the row says so until staff confirms. */
          jobs.push(db.collection('cf_pledges').doc(d.id).set({ refundDue: true, updatedAt: FV.serverTimestamp() }, { merge: true }).then(function () { return { manual: d.id }; }));
        }
      });
      return Promise.all(jobs);
    }).then(function (results) {
      return ref.set({ status: 'closed', outcome: 'failed', closedAt: FV.serverTimestamp(), closedBy: caller.email, closeNote: b.note || null, updatedAt: FV.serverTimestamp() }, { merge: true })
        .then(function () { return { ok: true, status: 'closed', refunds: results }; });
    });
  });
}

function confirm(b, db, caller) {
  return L.markPaid(b.pledgeId, { provider: 'manual', reference: b.reference || null, confirmedBy: caller.email, at: new Date().toISOString() }).then(function (r) {
    if (r.pledge && r.pledge.investorEmail && !r.already) {
      M.send(r.pledge.investorEmail, 'Your investment in ' + (r.pledge.campaignTitle || 'the project') + ' is confirmed',
        M.layout('Investment confirmed', '<p>Your ' + usd(r.pledge.amount) + ' (' + r.pledge.units + ' units) in <b>' + M.esc(r.pledge.campaignTitle || '') + '</b> is confirmed. You can follow the project and your distributions in your portfolio.</p>'));
    }
    return { ok: true, already: !!r.already };
  });
}
function refund(b, db, FV, caller) {
  return db.collection('cf_pledges').doc(String(b.pledgeId || '')).get().then(function (s) {
    if (!s.exists) throw A.httpError(404, 'pledge not found');
    var p = s.data(), stripe = stripeClient();
    if (p.paymentProvider === 'stripe' && stripe && p.stripePaymentIntent) {
      return stripe.refunds.create({ payment_intent: p.stripePaymentIntent, metadata: { pledgeId: s.id, reason: b.reason || 'staff' } })
        .then(function (rf) { return L.markRefunded(s.id, { provider: 'stripe', refundId: rf.id, reason: b.reason || null, by: caller.email }); });
    }
    return L.markRefunded(s.id, { provider: 'manual', reason: b.reason || null, by: caller.email });
  }).then(function () { return { ok: true }; });
}

/* ── staff: declare a distribution ─────────────────────────────────────── */
function distribute(b, db, FV, caller) {
  return loadCampaign(db, b.campaignId).then(function (c) {
    if (c.status !== 'funded') throw A.httpError(409, 'distributions are declared on funded campaigns only');
    var t = IM.terms(c);
    var unitsSold = Number(c.unitsSold) || 0;
    if (unitsSold < 1) throw A.httpError(409, 'no units are held');
    var distributable = Number(b.distributable);
    if (!(distributable > 0)) throw A.httpError(400, 'distributable must be above 0');
    if (!b.period) throw A.httpError(400, 'period is required (e.g. 2027-Q1)');
    var crowdPool = distributable * t.sharePct / 100;
    var perUnit = crowdPool / unitsSold;
    var ref = db.collection('cf_distributions').doc();
    return ref.set({ campaignId: c.id, campaignTitle: c.title || '', sponsorOrgId: c.sponsorOrgId || null, period: String(b.period),
      grossRevenue: Number(b.grossRevenue) || null, distributable: distributable, sharePct: t.sharePct, crowdPool: crowdPool, unitsSold: unitsSold, perUnit: perUnit,
      note: b.note || null, status: 'declared', declaredBy: caller.email, createdAt: FV.serverTimestamp(), createdAtMs: Date.now() })
      .then(function () {
        return db.collection('cf_campaigns').doc(c.id).set({ distributions: FV.increment(1), distributedTotal: FV.increment(crowdPool), lastDistributionAt: FV.serverTimestamp(), updatedAt: FV.serverTimestamp() }, { merge: true });
      }).then(function () { return { ok: true, id: ref.id, crowdPool: crowdPool, perUnit: perUnit }; });
  });
}

module.exports = A.handler(function (req) {
  if (req.method !== 'POST') throw A.httpError(405, 'POST only');
  var b = req.body || {};
  var db = A.db(), FV = A.FieldValue();
  if (b.action === 'quote') return quote(req, b, db);
  return A.authenticate(req).then(function (caller) {
    switch (b.action) {
      case 'pledge':     return pledge(req, b, db, FV, caller);
      case 'cancel':     return cancel(b, db, caller);
      case 'submit':     return submit(b, db, FV, caller);
      case 'review':     if (!caller.staff) throw A.httpError(403, 'staff only'); return review(b, db, FV, caller);
      case 'close':      if (!caller.staff) throw A.httpError(403, 'staff only'); return close(b, db, FV, caller);
      case 'confirm':    if (!caller.staff) throw A.httpError(403, 'staff only'); return confirm(b, db, caller);
      case 'refund':     if (!caller.staff) throw A.httpError(403, 'staff only'); return refund(b, db, FV, caller);
      case 'distribute': if (!caller.staff) throw A.httpError(403, 'staff only'); return distribute(b, db, FV, caller);
      default: throw A.httpError(400, 'unknown action');
    }
  });
});
