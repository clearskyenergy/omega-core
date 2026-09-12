/* ═══════════════════════════════════════════════════════════════════════════════
   POST /api/invest   —  SkyFund: quotes, pledges, banking, campaign lifecycle
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   The storefront (/portals/skyfund/) is a shop window. Every number about
   money and every decision about who may invest comes from here, because
   browser code is public and this is the IP (CLAUDE.md → IP protection).
   The engine is api/_lib/invest-math.js; state changes go through
   api/_lib/invest-ledger.js so a webhook and a staff click can never
   disagree; the bank rail is api/_lib/invest-bank.js.

   Body: { action, ... }.  Every action but `quote` and `bankStatus` requires
   a Firebase ID token (Authorization: Bearer).  `quote` accepts one when
   present so the projection can be personalised, and answers without one so
   a visitor can move the slider before creating an account — it reads only
   the public campaign document, the same one the browser already has.

   INVESTOR
     quote        { campaignId, amount }              → projection for that amount
     bankStatus   {}                                  → which rails are configured
     bankLinkToken{}                                  → a Plaid Link token (or a mock one)
     bankLink     { publicToken, accountId, name, mask, identity:{…} }
                                                      → links the account; opens the
                                                        Verified Customer (identity check)
     bankRemove   {}                                  → unlinks the account
     pledge       { campaignId, amount, perkId?, method: 'ach'|'card'|'wire',
                    attest:{ name, country, accredited, acceptedRisk, acceptedTerms } }
                  ach  → cf_pledges (processing) and an ACH debit into escrow;
                         settles by webhook (the mock rail settles at once)
                  card → cf_pledges (pending) and a Stripe Checkout Session
                  wire → cf_pledges (pending); ClearSky emails instructions
     cancel       { pledgeId }                        → pending → cancelled

   SPONSOR (tenant user, canActInOrg(sponsorOrgId))
     submit       { campaignId }                      → draft → review; ClearSky notified

   ADMIN (ClearSky domains, the 'staff' claim, or an active omega_staff admin)
     review       { campaignId, decision:'launch'|'return', note? }
     close        { campaignId, outcome:'funded'|'failed' }
                    failed refunds every paid pledge on its own rail
     confirm      { pledgeId, reference? }            → wire received → paid
     refund       { pledgeId, reason? }               → one paid pledge → refunded
     distribute   { campaignId, period, grossRevenue, distributable, note? }
     payout       { distributionId }                  → one cf_payouts row per holder,
                                                        ACH credits on the rail
     payoutMark   { payoutId, status:'paid'|'failed', reference? }  (hand-paid ones)
     investor     { uid, kyc?, accreditedVerified?, status?, note? }
     settings     { rules:{ minInvestment, maxInvestment, nonAccreditedAnnualCap,
                    accreditedRequiredAbove, allowedCountries[], requireKyc } }

   ENV: STRIPE_SECRET_KEY (optional), INVEST_ACH_PROVIDER + the DWOLLA_* /
        PLAID_* set (see _lib/invest-bank.js), INVEST_BASE_URL (optional),
        FIREBASE_SERVICE_ACCOUNT (required — this endpoint writes).
   ═══════════════════════════════════════════════════════════════════════════════ */
'use strict';
var A = require('./_lib/admin');
var IM = require('./_lib/invest-math');
var L = require('./_lib/invest-ledger');
var BK = require('./_lib/invest-bank');
var M = require('./_lib/mail');

var TERMS_VERSION = '2026-09-1';
var RISK_VERSION = '2026-09-1';
var OFFER_KINDS = ['ppa', 'compute', 'hybrid'];
var PROJECT_TYPES = ['compute', 'microgrid', 'bess', 'solar', 'ev'];
var KYC_STATES = ['none', 'pending', 'document', 'verified', 'failed'];
var INVESTOR_STATES = ['active', 'suspended'];

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
function loadInvestor(db, uid) {
  return db.collection('cf_investors').doc(uid).get().then(function (s) { var d = s.exists ? s.data() : {}; d.__exists = s.exists; return d; });
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
function bankReady(inv) { return !!(inv && inv.bank && inv.bank.fundingSourceId && inv.bank.status === 'verified'); }

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
      return Promise.all([loadRules(db), loadInvestor(db, caller.uid), L.committedThisYear(caller.uid)]).then(function (r) {
        var inv = r[1];
        inv.acceptedRisk = true;   /* the acknowledgement is collected at pledge time; a quote must not nag */
        var e = IM.eligibility(r[0], inv, p.amount, c, r[2]);
        p.personalized = true; p.eligible = e.ok; p.reasons = e.reasons; p.committedThisYear = r[2];
        p.minInvestment = e.minInvestment; p.maxInvestment = e.maxInvestment;
        p.bankReady = bankReady(inv);
        return p;
      });
    });
  });
}

/* ── banking: link / unlink ────────────────────────────────────────────── */
function bankLinkToken(b, db, caller) {
  return BK.adapter().linkToken(caller);
}
function bankLink(b, db, FV, caller) {
  return loadInvestor(db, caller.uid).then(function (inv) {
    var idn = b.identity || {};
    return BK.adapter().linkBank(caller, inv, b).then(function (bank) {
      var patch = { bank: bank, updatedAt: FV.serverTimestamp() };
      /* The rail's identity check IS the identity verification: a Verified
         Customer passed CIP. A pending/document status stays pending until
         the webhook says otherwise. Address and legal name are kept for the
         tax forms; date of birth and SSN are not written anywhere. */
      if (bank.identityStatus === 'verified') { patch.kyc = 'verified'; patch.kycProvider = BK.provider(); patch.kycAt = FV.serverTimestamp(); }
      else if (bank.identityStatus) { patch.kyc = bank.identityStatus === 'document' ? 'document' : 'pending'; patch.kycProvider = BK.provider(); }
      if (idn.firstName || idn.lastName) patch.name = ((idn.firstName || '') + ' ' + (idn.lastName || '')).trim();
      if (idn.address1) patch.address = { line1: idn.address1, line2: idn.address2 || null, city: idn.city || null, state: idn.state || null, postalCode: idn.postalCode || null, country: 'US' };
      if (!inv.__exists) { patch.uid = caller.uid; patch.email = String(caller.email || '').toLowerCase(); patch.status = 'active'; patch.accreditedVerified = false; patch.createdAt = FV.serverTimestamp(); if (!patch.kyc) patch.kyc = 'none'; }
      return db.collection('cf_investors').doc(caller.uid).set(patch, { merge: true }).then(function () { return { ok: true, bank: bank, kyc: patch.kyc || inv.kyc || 'none' }; });
    });
  });
}
function bankRemove(b, db, FV, caller) {
  return loadInvestor(db, caller.uid).then(function (inv) {
    if (!inv.bank) return { ok: true };
    return BK.adapter().removeBank(inv.bank).then(function () {
      return db.collection('cf_investors').doc(caller.uid).set({ bank: null, bankRemovedAt: FV.serverTimestamp(), updatedAt: FV.serverTimestamp() }, { merge: true });
    }).then(function () { return { ok: true }; });
  });
}

/* ── pledge ────────────────────────────────────────────────────────────── */
function pledge(req, b, db, FV, caller) {
  var at = b.attest || {};
  return Promise.all([loadCampaign(db, b.campaignId), loadRules(db), loadInvestor(db, caller.uid), L.committedThisYear(caller.uid)]).then(function (r) {
    var c = r[0], rules = r[1], inv = r[2], prior = r[3];
    if (c.status !== 'live') throw A.httpError(409, 'this campaign is not accepting investment');
    var prog = IM.progress(c);
    if (prog.expired) throw A.httpError(409, 'this campaign has closed');
    if (c.sponsorOrgId && c.sponsorOrgId === caller.orgId && !caller.staff) throw A.httpError(403, 'a sponsor cannot invest in its own campaign');

    var units = IM.unitsFor(b.amount, c.unitPrice);
    if (units < 1) throw A.httpError(400, 'the minimum is one unit of ' + usd(c.unitPrice));
    var remaining = IM.unitsRemaining(c);
    if (units > remaining) throw A.httpError(409, 'only ' + remaining + ' units remain');
    var amount = units * Number(c.unitPrice);

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

    /* Which rail. 'auto' takes the best one the investor can use. */
    var stripe = stripeClient(), rail = BK.provider();
    var method = String(b.method || 'auto');
    if (method === 'auto') method = (rail !== 'none' && bankReady(inv)) ? 'ach' : (stripe ? 'card' : 'wire');
    if (method === 'ach' && (rail === 'none' || !bankReady(inv))) throw A.httpError(400, 'Link a verified bank account before paying by bank transfer.');
    if (method === 'card' && !stripe) throw A.httpError(400, 'Card payment is not enabled.');
    if (['ach', 'card', 'wire'].indexOf(method) < 0) throw A.httpError(400, 'method must be ach, card or wire');

    var p = IM.projection(c, units);
    var pRef = db.collection('cf_pledges').doc();
    var doc = {
      campaignId: c.id, campaignTitle: c.title || '', sponsorOrgId: c.sponsorOrgId || null,
      investorUid: caller.uid, investorEmail: String(caller.email || '').toLowerCase(), investorName: at.name || inv.name || caller.claims.name || '',
      amount: amount, units: units, unitPrice: Number(c.unitPrice),
      pctOfOffering: p.pctOfOffering, pctOfProject: p.pctOfProject,
      projectedAnnual: p.annualDistribution, projectedTotal: p.total,
      perkId: perk ? perk.id : null, perkTitle: perk ? perk.title : null,
      status: 'pending', paymentProvider: method === 'ach' ? 'ach:' + rail : (method === 'card' ? 'stripe' : 'manual'), method: method,
      attest: { name: at.name || null, country: merged.country, accredited: merged.accredited, acceptedRisk: true, acceptedTerms: true, termsVersion: TERMS_VERSION, riskVersion: RISK_VERSION, ip: req.headers['x-forwarded-for'] || null, userAgent: req.headers['user-agent'] || null },
      createdAt: FV.serverTimestamp(), createdAtMs: Date.now(), updatedAt: FV.serverTimestamp()
    };
    /* The profile keeps what the person attested to, so the next pledge
       starts from it. Privilege fields (kyc, accreditedVerified, status,
       bank) are never taken from the body. */
    var profilePatch = { email: doc.investorEmail, name: doc.investorName || inv.name || '', country: merged.country, accredited: merged.accredited,
      acceptedRiskVersion: RISK_VERSION, acceptedTermsVersion: TERMS_VERSION, lastPledgeAt: FV.serverTimestamp(), updatedAt: FV.serverTimestamp() };
    if (!inv.__exists) { profilePatch.uid = caller.uid; profilePatch.status = 'active'; profilePatch.kyc = 'none'; profilePatch.accreditedVerified = false; profilePatch.createdAt = FV.serverTimestamp(); }
    var write = db.batch().set(pRef, doc).set(db.collection('cf_investors').doc(caller.uid), profilePatch, { merge: true }).commit();

    if (method === 'ach') {
      return write.then(function () {
        return BK.adapter().debit(pRef.id, amount, inv.bank, { campaignId: c.id, investorUid: caller.uid });
      }).then(function (tr) {
        return L.markProcessing(pRef.id, { achTransferId: tr.transferId, achTransferUrl: tr.transferUrl || null, achStartedAt: FV.serverTimestamp() }).then(function () {
          if (tr.status !== 'processed') return { settled: false };
          return L.markPaid(pRef.id, { provider: doc.paymentProvider, transferId: tr.transferId, at: new Date().toISOString() }).then(function () { return { settled: true }; });
        }).then(function (s) {
          M.send(doc.investorEmail, 'Your investment in ' + (c.title || 'the project') + (s.settled ? ' is confirmed' : ' has started'), M.layout(s.settled ? 'Investment confirmed' : 'Bank transfer started',
            '<p>' + usd(amount) + ' (' + units + ' units) in <b>' + M.esc(c.title || '') + '</b>' + (s.settled ? ' is confirmed.' : ' is on its way from ' + M.esc((inv.bank.name || 'your bank') + ' •••• ' + (inv.bank.mask || '')) + '. Bank transfers settle in 3–5 business days; your units are confirmed when it lands.') + '</p>'));
          return { pledgeId: pRef.id, ach: true, settled: s.settled, amount: amount, units: units, bank: { name: inv.bank.name, mask: inv.bank.mask } };
        });
      }).catch(function (e) {
        /* The debit could not be started: release the row so the person can try another way. */
        return L.markCancelled(pRef.id, 'bank debit failed: ' + e.message).catch(function () { return null; }).then(function () { throw e; });
      });
    }
    if (method === 'wire') {
      return write.then(function () {
        M.send(doc.investorEmail, 'Your commitment to ' + (c.title || 'the project'), M.layout('Commitment received',
          '<p>Thank you. Your commitment of <b>' + usd(amount) + '</b> (' + units + ' units) to <b>' + M.esc(c.title || '') + '</b> is recorded as pending.</p>' +
          '<p>ClearSky will send wire instructions for the escrow account by email. Nothing is charged until you send funds, and the units are yours once the transfer clears.</p>' +
          '<p>Reference: <code>' + pRef.id + '</code></p>'));
        return { pledgeId: pRef.id, manual: true, amount: amount, units: units,
          instructions: 'ClearSky will email wire instructions for the escrow account. Your units are reserved once the transfer clears.' };
      });
    }
    var base = baseUrl(req);
    return write.then(function () {
      return stripe.checkout.sessions.create({
        mode: 'payment',
        customer_email: doc.investorEmail,
        client_reference_id: pRef.id,
        line_items: [{ quantity: units, price_data: { currency: 'usd', unit_amount: Math.round(Number(c.unitPrice) * 100),
          product_data: { name: (c.title || 'Project') + ' — investment unit', description: p.pctOfProject ? ((p.pctOfProject * 100).toFixed(4) + '% of project distributions for ' + p.termYears + ' years') : undefined } } }],
        metadata: { pledgeId: pRef.id, campaignId: c.id, investorUid: caller.uid, kind: 'cf_pledge' },
        payment_intent_data: { metadata: { pledgeId: pRef.id, campaignId: c.id, kind: 'cf_pledge' }, description: 'SkyFund investment: ' + (c.title || c.id) },
        success_url: base + '/skyfund?paid=' + pRef.id + '#/portfolio',
        cancel_url: base + '/skyfund?cancelled=' + pRef.id + '#/c/' + c.id,
        expires_at: Math.floor(Date.now() / 1000) + 30 * 60
      });
    }).then(function (session) {
      return pRef.set({ stripeSessionId: session.id, stripePaymentIntent: session.payment_intent || null, updatedAt: FV.serverTimestamp() }, { merge: true })
        .then(function () { return { pledgeId: pRef.id, url: session.url, amount: amount, units: units }; });
    });
  });
}

function cancel(b, db, caller, isAdmin) {
  return db.collection('cf_pledges').doc(String(b.pledgeId || '')).get().then(function (s) {
    if (!s.exists) throw A.httpError(404, 'pledge not found');
    var p = s.data();
    if (p.investorUid !== caller.uid && !isAdmin) throw A.httpError(403, 'not your pledge');
    if (p.status === 'processing' && /^ach:/.test(p.paymentProvider || '') && !isAdmin) throw A.httpError(409, 'a bank transfer already in flight cannot be cancelled here; it will be refunded once it settles — contact support');
    var stripe = stripeClient();
    var expire = (stripe && p.stripeSessionId) ? stripe.checkout.sessions.expire(p.stripeSessionId).catch(function () { return null; }) : Promise.resolve(null);
    return expire.then(function () { return L.markCancelled(s.id, isAdmin ? 'staff' : 'investor'); });
  });
}

/* ── refunds, on whichever rail the money came in ──────────────────────── */
function refundPledge(db, FV, pledgeId, p, reason, by) {
  var stripe = stripeClient();
  if (p.paymentProvider === 'stripe' && stripe && p.stripePaymentIntent) {
    return stripe.refunds.create({ payment_intent: p.stripePaymentIntent, metadata: { pledgeId: pledgeId, reason: reason || 'staff' } })
      .then(function (rf) { return L.markRefunded(pledgeId, { provider: 'stripe', refundId: rf.id, reason: reason || null, by: by }); });
  }
  if (/^ach:/.test(p.paymentProvider || '')) {
    return loadInvestor(db, p.investorUid).then(function (inv) {
      if (!inv.bank || !inv.bank.fundingSourceId) return db.collection('cf_pledges').doc(pledgeId).set({ refundDue: true, refundNote: 'investor has no linked bank; refund by hand', updatedAt: FV.serverTimestamp() }, { merge: true }).then(function () { return { manual: pledgeId }; });
      return BK.adapter().refund(pledgeId, p.amount, inv.bank, { reason: reason || 'staff' }).then(function (tr) {
        return L.markRefunding(pledgeId, { provider: p.paymentProvider, transferId: tr.transferId, transferUrl: tr.transferUrl || null, reason: reason || null, by: by }).then(function () {
          if (tr.status !== 'processed') return { refunding: pledgeId, transferId: tr.transferId };
          return L.markRefunded(pledgeId, { settledAt: new Date().toISOString() }).then(function () { return { refunded: pledgeId }; });
        });
      });
    });
  }
  /* Wire money is returned by hand; the row says so until staff marks it. */
  return db.collection('cf_pledges').doc(pledgeId).set({ refundDue: true, updatedAt: FV.serverTimestamp() }, { merge: true }).then(function () { return { manual: pledgeId }; });
}
function refund(b, db, FV, caller) {
  return db.collection('cf_pledges').doc(String(b.pledgeId || '')).get().then(function (s) {
    if (!s.exists) throw A.httpError(404, 'pledge not found');
    var p = s.data();
    if (p.status !== 'paid') throw A.httpError(409, 'pledge is ' + p.status + ', not refundable');
    if (b.manual === true) return L.markRefunded(s.id, { provider: 'manual', reason: b.reason || null, by: caller.email }).then(function () { return { refunded: s.id }; });
    return refundPledge(db, FV, s.id, p, b.reason, caller.email);
  }).then(function (r) { return Object.assign({ ok: true }, r || {}); });
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

/* ── admin: review / launch ────────────────────────────────────────────── */
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

/* ── admin: close (funded | failed) ────────────────────────────────────── */
function close(b, db, FV, caller) {
  return loadCampaign(db, b.campaignId).then(function (c) {
    if (c.status !== 'live') throw A.httpError(409, 'campaign is ' + c.status);
    var ref = db.collection('cf_campaigns').doc(c.id);
    if (b.outcome === 'funded') {
      return ref.set({ status: 'funded', fundedAt: FV.serverTimestamp(), closedBy: caller.email, proceeds: IM.proceeds(c.raised, IM.terms(c).platformFeePct), updatedAt: FV.serverTimestamp() }, { merge: true })
        .then(function () { return { ok: true, status: 'funded' }; });
    }
    if (b.outcome !== 'failed') throw A.httpError(400, 'outcome must be funded|failed');
    return db.collection('cf_pledges').where('campaignId', '==', c.id).get().then(function (q) {
      var jobs = [];
      q.forEach(function (d) {
        var p = d.data();
        if (p.status === 'pending') { jobs.push(L.markCancelled(d.id, 'campaign closed')); return; }
        if (p.status === 'processing') { jobs.push(db.collection('cf_pledges').doc(d.id).set({ refundDue: true, refundNote: 'campaign closed while the debit was in flight; refund when it settles', updatedAt: FV.serverTimestamp() }, { merge: true }).then(function () { return { inFlight: d.id }; })); return; }
        if (p.status !== 'paid') return;
        jobs.push(refundPledge(db, FV, d.id, p, 'campaign failed', caller.email)
          .catch(function (e) { return db.collection('cf_pledges').doc(d.id).set({ refundError: e.message, refundDue: true, updatedAt: FV.serverTimestamp() }, { merge: true }).then(function () { return { failed: d.id, error: e.message }; }); }));
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

/* ── admin: declare a distribution, then pay it out ────────────────────── */
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
/* One payout per holder: their paid units × per-unit. Holders with a verified
   bank get an ACH credit on the rail; the rest are `unbanked` and paid by
   hand. Idempotent: a distribution that already has payouts is not paid twice. */
function payout(b, db, FV, caller) {
  var dRef = db.collection('cf_distributions').doc(String(b.distributionId || ''));
  return dRef.get().then(function (ds) {
    if (!ds.exists) throw A.httpError(404, 'distribution not found');
    var d = ds.data();
    if (d.status !== 'declared') throw A.httpError(409, 'distribution is ' + d.status + '; payouts were already created');
    return Promise.all([loadCampaign(db, d.campaignId), db.collection('cf_pledges').where('campaignId', '==', d.campaignId).where('status', '==', 'paid').get()]).then(function (r) {
      var c = r[0], holders = {};
      r[1].forEach(function (p) { var x = p.data(); var h = holders[x.investorUid] || (holders[x.investorUid] = { uid: x.investorUid, email: x.investorEmail, name: x.investorName, units: 0 }); h.units += Number(x.units) || 0; });
      var uids = Object.keys(holders);
      if (!uids.length) throw A.httpError(409, 'no paid holders');
      var rail = BK.provider();
      return Promise.all(uids.map(function (uid) { return loadInvestor(db, uid); })).then(function (invs) {
        var jobs = uids.map(function (uid, i) {
          var h = holders[uid], inv = invs[i], amount = Math.round(h.units * d.perUnit * 100) / 100;
          var pRef = db.collection('cf_payouts').doc();
          var row = { distributionId: dRef.id, campaignId: d.campaignId, campaignTitle: d.campaignTitle || c.title || '', sponsorOrgId: d.sponsorOrgId || c.sponsorOrgId || null, period: d.period,
            investorUid: uid, investorEmail: h.email, investorName: h.name || inv.name || '', units: h.units, perUnit: d.perUnit, amount: amount,
            status: 'pending', provider: null, createdAt: FV.serverTimestamp(), createdAtMs: Date.now(), updatedAt: FV.serverTimestamp(), createdBy: caller.email };
          if (amount <= 0) { row.status = 'paid'; row.settlement = { note: 'zero amount' }; return pRef.set(row).then(function () { return { uid: uid, status: 'paid', amount: 0 }; }); }
          if (rail === 'none' || !bankReady(inv)) { row.status = 'unbanked'; return pRef.set(row).then(function () { return { uid: uid, status: 'unbanked', amount: amount }; }); }
          row.provider = 'ach:' + rail; row.bank = { name: inv.bank.name, mask: inv.bank.mask };
          return pRef.set(row).then(function () {
            return BK.adapter().credit(pRef.id, amount, inv.bank, (c.bank && c.bank.distributionSourceUrl) || null, { distributionId: dRef.id, campaignId: d.campaignId, investorUid: uid });
          }).then(function (tr) {
            return pRef.set({ status: 'processing', transferId: tr.transferId, transferUrl: tr.transferUrl || null, updatedAt: FV.serverTimestamp() }, { merge: true }).then(function () {
              if (tr.status !== 'processed') return { uid: uid, status: 'processing', amount: amount };
              return L.payoutSettled(pRef.id, { provider: row.provider, transferId: tr.transferId, at: new Date().toISOString() }).then(function () { return { uid: uid, status: 'paid', amount: amount }; });
            });
          }).catch(function (e) {
            return pRef.set({ status: 'failed', failure: { reason: e.message }, updatedAt: FV.serverTimestamp() }, { merge: true }).then(function () { return { uid: uid, status: 'failed', amount: amount, error: e.message }; });
          });
        });
        return Promise.all(jobs);
      }).then(function (results) {
        return L.settleDistribution(db, dRef.id).then(function (status) {
          return dRef.set({ paidOutBy: caller.email, paidOutAt: FV.serverTimestamp(), updatedAt: FV.serverTimestamp() }, { merge: true }).then(function () { return { ok: true, status: status, payouts: results }; });
        });
      });
    });
  });
}
function payoutMark(b, db, FV, caller) {
  var ref = db.collection('cf_payouts').doc(String(b.payoutId || ''));
  return ref.get().then(function (s) {
    if (!s.exists) throw A.httpError(404, 'payout not found');
    if (b.status === 'paid') return L.payoutSettled(s.id, { provider: 'manual', reference: b.reference || null, by: caller.email, at: new Date().toISOString() });
    if (b.status === 'failed') return L.payoutFailed(s.id, { reason: b.reference || 'marked failed', by: caller.email });
    throw A.httpError(400, 'status must be paid|failed');
  }).then(function (r) { return { ok: true, distributionStatus: r.distributionStatus || null }; });
}

/* ── admin: investors and settings ─────────────────────────────────────── */
function investor(b, db, FV, caller) {
  var uid = String(b.uid || '');
  if (!uid) throw A.httpError(400, 'uid is required');
  var patch = { updatedAt: FV.serverTimestamp(), reviewedBy: caller.email, reviewedAt: FV.serverTimestamp() };
  if (b.kyc !== undefined) { if (KYC_STATES.indexOf(b.kyc) < 0) throw A.httpError(400, 'kyc must be one of ' + KYC_STATES.join(', ')); patch.kyc = b.kyc; patch.kycProvider = 'staff'; patch.kycAt = FV.serverTimestamp(); }
  if (b.accreditedVerified !== undefined) { patch.accreditedVerified = b.accreditedVerified === true; patch.accreditedVerifiedAt = b.accreditedVerified === true ? FV.serverTimestamp() : null; patch.accreditedVerifiedBy = caller.email; }
  if (b.status !== undefined) { if (INVESTOR_STATES.indexOf(b.status) < 0) throw A.httpError(400, 'status must be active|suspended'); patch.status = b.status; }
  if (b.note !== undefined) patch.adminNote = String(b.note || '').slice(0, 1000);
  return db.collection('cf_investors').doc(uid).get().then(function (s) {
    if (!s.exists) throw A.httpError(404, 'investor not found');
    return db.collection('cf_investors').doc(uid).set(patch, { merge: true });
  }).then(function () { return { ok: true }; });
}
function settings(b, db, FV, caller) {
  var r = b.rules || {}, out = { updatedAt: FV.serverTimestamp(), updatedBy: caller.email };
  ['minInvestment', 'maxInvestment', 'nonAccreditedAnnualCap', 'accreditedRequiredAbove'].forEach(function (k) {
    if (r[k] === undefined || r[k] === null || r[k] === '') return;
    var n = Number(r[k]); if (!isFinite(n) || n < 0) throw A.httpError(400, k + ' must be a non-negative number'); out[k] = n;
  });
  if (r.allowedCountries !== undefined) {
    var list = Array.isArray(r.allowedCountries) ? r.allowedCountries : String(r.allowedCountries).split(/[,\s]+/);
    out.allowedCountries = list.map(function (x) { return String(x).trim().toUpperCase(); }).filter(function (x) { return /^[A-Z]{2}$/.test(x); });
  }
  if (r.requireKyc !== undefined) out.requireKyc = r.requireKyc === true;
  if (out.minInvestment !== undefined && out.maxInvestment !== undefined && out.minInvestment > out.maxInvestment) throw A.httpError(400, 'minInvestment cannot exceed maxInvestment');
  return db.collection('cf_settings').doc('rules').set(out, { merge: true }).then(function () { return loadRules(db); }).then(function (rules) { return { ok: true, rules: rules }; });
}

module.exports = A.handler(function (req) {
  if (req.method !== 'POST') throw A.httpError(405, 'POST only');
  var b = req.body || {};
  var db = A.db(), FV = A.FieldValue();
  if (b.action === 'quote') return quote(req, b, db);
  if (b.action === 'bankStatus') return Promise.resolve(BK.status());
  return A.authenticate(req).then(function (caller) {
    switch (b.action) {
      case 'pledge':        return pledge(req, b, db, FV, caller);
      case 'bankLinkToken': return bankLinkToken(b, db, caller);
      case 'bankLink':      return bankLink(b, db, FV, caller);
      case 'bankRemove':    return bankRemove(b, db, FV, caller);
      case 'submit':        return submit(b, db, FV, caller);
      case 'cancel':        return A.isPlatformAdmin(caller).then(function (adm) { return cancel(b, db, caller, adm); });
    }
    var ADMIN = { review: 1, close: 1, confirm: 1, refund: 1, distribute: 1, payout: 1, payoutMark: 1, investor: 1, settings: 1 };
    if (!ADMIN[b.action]) throw A.httpError(400, 'unknown action');
    return A.isPlatformAdmin(caller).then(function (adm) {
      if (!adm) throw A.httpError(403, 'admin only');
      switch (b.action) {
        case 'review':     return review(b, db, FV, caller);
        case 'close':      return close(b, db, FV, caller);
        case 'confirm':    return confirm(b, db, caller);
        case 'refund':     return refund(b, db, FV, caller);
        case 'distribute': return distribute(b, db, FV, caller);
        case 'payout':     return payout(b, db, FV, caller);
        case 'payoutMark': return payoutMark(b, db, FV, caller);
        case 'investor':   return investor(b, db, FV, caller);
        case 'settings':   return settings(b, db, FV, caller);
      }
    });
  });
});
