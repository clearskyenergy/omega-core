/* ═══════════════════════════════════════════════════════════════════════════════
   POST /api/tenant-signup   —  self-serve "Create your workspace"
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Called by /start.html after the person has signed in with Firebase Auth.
   The browser cannot create omega_orgs (rules: isAdmin only), so this is the
   one door. POLICY, as decided 2026-09-06:
     · work email only — public providers are refused (see _lib/public-domains.js)
     · the workspace is created PENDING; ClearSky approves (tenant-approve.js)
     · a second person from a domain that already has a tenant auto-joins as
       member — this endpoint just tells the page where to send them

   Body: { companyName, vertical: oem|developer|epc|installer, slug?, logoUrl?, phone?, note? }
   Returns:
     { exists: true,  host, status }          — domain already has a tenant
     { created: true, host, reserved, status:'pending', orgId }
   `host` is where the person SIGNS IN (api/_lib/kit.js home(): the open host
   until TENANT_WILDCARD_LIVE says *.clearskyomega.com serves); `reserved`
   is the slug host held on the record for that day.
   ═══════════════════════════════════════════════════════════════════════════════ */
'use strict';
var A = require('./_lib/admin');
var M = require('./_lib/mail');
var PUBLIC = require('./_lib/public-domains');
var BP = require('./_lib/billing-profile'), PB = require('./_lib/pricebook'), MOD = require('./_lib/modules'), PR = require('./_lib/subscription-pricing'), POLICY = require('./_lib/package-billing-policy'), S = require('./_lib/package-billing'), Mode = require('./_lib/packaging-mode');
var SP = require('./_lib/subscription-proposal'), K = require('./_lib/kit');
var BASE_HOST = process.env.TENANT_BASE_HOST || 'clearskyomega.com';
var TRIAL_DAYS = Number(process.env.TRIAL_DAYS || 14);
/* Labels a workspace may not take under clearskyomega.com: the hosts the
   platform serves itself (hub, open host, previews), mail and web plumbing,
   and our own names. A tenant_public record for one of these would pin the
   front door to a customer (launch review, 2026-09-26). */
var RESERVED = ['app', 'www', 'api', 'alpha', 'next', 'staging', 'demo', 'admin', 'console', 'tools', 'osa', 'billing', 'support', 'mail', 'status',
  'silmarillion', 'login', 'start', 'offerings', 'logic', 'office', 'plant', 'portal', 'portals', 'embed', 'static', 'cdn', 'assets', 'help', 'docs',
  'secure', 'auth', 'sso', 'account', 'accounts', 'clearsky', 'omega', 'clearskyomega', 'finance', 'financing', 'vercel', 'preview', 'test', 'dev',
  'beta', 'ftp', 'smtp', 'imap', 'pop', 'mx', 'ns1', 'ns2', 'autodiscover', 'm', 'mobile', 'pay', 'payments', 'invoice', 'invoices',
  'quickbooks', 'stripe', 'root', 'localhost'];

function slugify(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40); }
/* Where the person is SENT (api/_lib/kit.js home(), the one rule): the open
   host until TENANT_WILDCARD_LIVE says *.clearskyomega.com serves; the slug
   host stays RESERVED on the record (domains[0], tenant_public) for that day. */
function homeOf(org) { return K.home(org, { wildcard: process.env.TENANT_WILDCARD_LIVE === 'true' }); }
function hostFacts() { return { homeHost: homeOf(null), wildcard: process.env.TENANT_WILDCARD_LIVE === 'true' }; }

async function signupOptions(db) {
  var facts = hostFacts();
  if (process.env.PACKAGING_SIGNUP_ENABLED !== 'true') return Object.assign({ packaging: false, maxTrialDays: 14, payNow: false }, facts);
  if (!Mode.open()) throw A.httpError(409, 'Packaged signup is sandbox-only until PACKAGING_LIVE=true with QBO_ENV=production');
  /* the switch turned on before the seed ran (or before the book was
     enabled): the page is told plainly and takes nobody's details; never a
     500, never a half-made record */
  var book;
  try { book = await PB.load(db, PB.VERSION); } catch (e) { if (e.status === 409 || /not seeded/i.test(String(e.message || ''))) return Object.assign({ packaging: false, maxTrialDays: 14, payNow: false, notReady: 'Signup is opening shortly: the price book ' + PB.VERSION + ' is not seeded for this company yet' }, facts); throw e; }
  if (!book.enabled) return Object.assign({ packaging: false, maxTrialDays: 14, payNow: false, notReady: 'Signup is opening shortly: the price book ' + book.version + ' is not enabled yet' }, facts);
  return Object.assign(facts, { packaging: true, maxTrialDays: Math.min(book.policy.trialDays, 14), pricebookVersion: book.version,
    /* pay at the end is offered only where the engine can issue an invoice (the billing flag; the engine's guard has the last word) */
    payNow: process.env.PACKAGING_BILLING_ENABLED === 'true' && book.enabled === true,
    modules: PR.catalog(book), starters: MOD.starters(), starterLabels: MOD.starterLabels(),
    // Phase 6: signup walks the same discovery a rep would (VALUE-LADDER §3.7).
    questions: SP.QUESTIONS, answers: SP.ANSWERS, spend: SP.SPEND, unitCosts: SP.UNIT_COSTS });
}
async function packagedSignup(req, caller, domain, b, slug, host) {
  var db = A.db(), options = await signupOptions(db);
  if (!options.packaging) throw A.httpError(409, options.notReady || 'Packaged signup is not open');
  var profile = BP.normalize(b.billingProfile), now = Date.now(), book = await PB.load(db, PB.VERSION);
  /* Phase 6. A signup may carry the discovery answers (stored for the rep who
     approves it; the recommendation proposes the package when none was
     picked) or a sent proposal's id and key, in which case the package,
     terms and credit are the ones the rep proposed and the proposal is
     accepted in the same transaction that creates the workspace. */
  var proposal = null, proposalRef = null;
  if (b.proposalId != null) {
    if (typeof b.proposalId !== 'string' || !/^sp-[a-f0-9]{16}$/.test(b.proposalId)) throw A.httpError(400, 'Invalid proposal id');
    proposalRef = db.collection('subscription_proposals').doc(b.proposalId);
    var ps = await proposalRef.get(); if (!ps.exists) throw A.httpError(404, 'Proposal not found');
    proposal = ps.data();
    if (!SP.verifyKey(proposal, b.proposalKey)) throw A.httpError(403, 'This proposal link is not valid');
    if (proposal.status !== 'sent') throw A.httpError(409, 'This proposal is ' + proposal.status);
    if (SP.expired(proposal, now)) throw A.httpError(409, 'This proposal has expired; ask for a new one');
    if (proposal.prospect.domain && proposal.prospect.domain !== domain) throw A.httpError(403, 'This proposal was prepared for ' + proposal.prospect.domain);
  }
  var discovery = b.discovery ? SP.discovery(b.discovery) : null, recommendation = discovery ? SP.recommend(discovery, book) : null;
  var choice = proposal ? proposal.selection : { modules: b.modules || (recommendation ? recommendation.modules : ['lite']), interval: b.interval || 'monthly' };
  /* a plan named by the offerings page (?plan=field) is asked for; the server's quote still decides whether it fits */
  if (!proposal && typeof b.plan === 'string' && ['field', 'pro', 'auto'].indexOf(b.plan) >= 0) choice.plan = b.plan;
  var selected = POLICY.terms(choice, book, now);
  if (b.vertical !== profile.vertical) throw A.httpError(400, 'Company type and billing profile must agree');
  var duration = Math.min(TRIAL_DAYS, 14);
  if (!isFinite(duration) || duration < 0 || Math.floor(duration) !== duration) throw A.httpError(500, 'Invalid trial configuration');
  var ref = db.collection('omega_orgs').doc(domain), name = String(b.companyName).trim();
  var result = await db.runTransaction(async function (tx) {
    var old = await tx.get(ref), publicRef = db.collection('tenant_public').doc(host), publicSnap = await tx.get(publicRef);
    var proposalSnap = proposalRef ? await tx.get(proposalRef) : null;
    if (old.exists) { var prior = old.data(); return { exists: true, orgId: domain, status: prior.status, host: homeOf(prior) }; }
    if (publicSnap.exists) throw A.httpError(409, 'Workspace address is already in use; choose another');
    var org = { name: name, slug: slug, domains: [host], logoUrl: b.logoUrl || '', vertical: profile.vertical,
      shell: 'default', status: 'pending', receivesFullBom: false, exportBrand: { name: name, logo: b.logoUrl || '' },
      signedUpAt: now, packaged: true, packagingSandbox: !Mode.live(), packagedLive: Mode.live(), createdAt: now, updatedAt: now,
      signup: { email: caller.email, uid: caller.uid, phone: b.phone || null, note: b.note || null } };
    tx.create(ref, org);
    tx.create(ref.collection('billing').doc('profile'), Object.assign({}, profile, { createdAt: now, updatedBy: caller.email }));
    tx.create(ref.collection('billing').doc('current'), { packaged: true, packagingSignup: true, packagingState: 'pending',
      modules: ['lite'], proposedPackage: selected, pricebookVersion: book.version, trialDurationDays: duration,
      proposalId: proposal ? proposal.id : null, signupDiscovery: discovery ? { discovery: discovery, recommendation: recommendation, at: now } : null,
      billingProvider: 'quickbooks', qboEnv: book.qbo.env, createdAt: now });
    if (proposalSnap) {
      if (!proposalSnap.exists || proposalSnap.data().status !== 'sent') throw A.httpError(409, 'This proposal is no longer open');
      tx.update(proposalRef, { status: 'accepted', updatedAt: now, updatedBy: caller.email,
        acceptance: Object.assign({}, proposalSnap.data().acceptance, { acceptedAt: now, acceptedBy: caller.email, orgId: domain, result: { path: 'signup', state: 'awaiting_approval', host: host } }),
        history: (proposalSnap.data().history || []).concat([{ at: now, by: caller.email, action: 'accepted', path: 'signup' }]).slice(-50) });
    }
    tx.create(ref.collection('members').doc(caller.uid), { email: caller.email, name: caller.claims.name || '', role: 'owner', status: 'active', createdAt: now });
    tx.create(publicRef, { orgId: domain, name: name, logoUrl: org.logoUrl, colors: null, exportBrand: org.exportBrand,
      tier: 'trial', vertical: profile.vertical, shell: 'default', domains: [host], status: 'pending', updatedAt: now });
    tx.set(db.collection('omega_orgs').doc('clearsky-usa.com').collection('notifications').doc(), { kind: 'signup',
      text: 'New packaged workspace request: ' + name + ' (' + domain + ')', orgId: domain, read: false, createdAt: now });
    return { created: true, orgId: domain, host: homeOf(org), reserved: host, status: 'pending', trialEndsAt: null, trialStartsOnApproval: true };
  });
  if (!result.created) return result;
  await A.init().auth().setCustomUserClaims(caller.uid, { orgId: domain, role: 'owner' });
  /* Pay at the end (2026-09-26, Tommy: one system, QuickBooks). The
     workspace is opened by its owner's payment, nobody's approval: the
     engine's own activation issues the first invoice now, with QuickBooks'
     card-payment page on it, and the workspace stays read-only until that
     invoice reconciles as paid (reconcile-now from the signup page or the
     workspace, or the daily runner). If the invoice cannot be issued, the
     request falls back to the approval path and says so. */
  if (b.payNow === true) {
    var publicRef2 = db.collection('tenant_public').doc(host);
    try {
      await ref.update({ status: 'active', approvedAt: now, approvedBy: 'self-serve', selfServe: true, updatedAt: now });
      await publicRef2.set({ status: 'active', updatedAt: now }, { merge: true });
      var input = { action: 'activate', modules: selected.modules, interval: selected.interval, pricebookVersion: book.version };
      if (selected.plan) input.plan = selected.plan;
      var previewed = await S.preview(db, domain, input, now);
      var applied = await S.apply(db, domain, Object.assign({}, input, { dryRun: false, previewId: previewed.previewId, effectiveAt: previewed.effectiveAt }),
        Object.assign({}, caller, { selfServe: true }), now);
      var after = (await ref.collection('billing').doc('current').get()).data() || {};
      Object.assign(result, { status: 'active', payNow: true, packagingState: applied.packagingState, paymentLink: applied.paymentLink || after.paymentLink || null,
        amountDue: after.amountDue == null ? null : after.amountDue, amountDueDisplay: after.amountDue == null ? null : PR.money(Math.round(after.amountDue * 100)),
        invoiceDate: applied.nextInvoiceOn ? previewed.invoice && previewed.invoice.date : null, monthlyDisplay: selected.monthlyDisplay || null, billingEmail: profile.email || caller.email });
      /* an invoice without QuickBooks' pay page (Payments off, or the link not
         returned) is not a dead end: the invoice itself was emailed by
         QuickBooks, the page says so, and ClearSky hears at once */
      if (!result.paymentLink) { result.payLinkMissing = true; await M.templates.billingAlert({ orgId: domain, company: name, text: 'The first invoice for ' + name + ' was issued without a pay link. QuickBooks Payments may be off; the customer was told the invoice is in their email. Check Settings → Payments in the production company.' }); }
    } catch (e) {
      var raw = String(e.message || e).slice(0, 200);
      await ref.update({ status: 'pending', approvedAt: null, approvedBy: null, selfServe: null, payNowError: raw, updatedAt: now });
      await publicRef2.set({ status: 'pending', updatedAt: now }, { merge: true });
      /* the engine's words are for staff (they name environments, books and
         realms); the customer hears what happens next, and ClearSky hears why */
      Object.assign(result, { payNow: false, payNowError: 'The first invoice could not be issued; your request goes to ClearSky for approval instead' });
      await M.templates.billingAlert({ orgId: domain, company: name, text: 'A pay-now signup by ' + caller.email + ' fell back to approval: ' + raw });
    }
  }
  var first = (caller.claims.name || caller.email.split('@')[0]).split(' ')[0];
  await Promise.all([M.templates.signupReceived({ email: caller.email, name: first, company: name, host: result.host, packaging: true, payNow: result.payNow === true, paymentLink: result.paymentLink || null, amountDueDisplay: result.amountDueDisplay || null }),
    M.templates.signupAlert({ company: name, orgId: domain, email: caller.email, vertical: profile.vertical, host: result.host, reserved: host, phone: b.phone, note: b.note, payNow: result.payNow === true })]);
  return result;
}

async function checkPayment(db, caller, domain, ref) {
  var snap = await ref.get(); if (!snap.exists) throw A.httpError(404, 'No workspace yet for ' + domain);
  var org = snap.data() || {}, member = await ref.collection('members').doc(caller.uid).get();
  if (!member.exists || member.data().role !== 'owner' || member.data().status === 'disabled') throw A.httpError(403, 'The workspace owner checks its payment');
  var r = await require('./_lib/plan-change').reconcileNow(db, domain, caller, Date.now());
  return Object.assign(r, { host: homeOf(org), status: org.status || 'active' });
}
module.exports = A.handler(function (req) {
  if (req.method !== 'POST' && req.method !== 'GET') throw A.httpError(405, 'GET or POST only');
  var b = req.body || {};
  return A.authenticate(req).then(function (caller) {
    var email = String(caller.email || '').toLowerCase();
    var domain = A.orgOf(email);
    if (!domain || domain.indexOf('.') < 0) throw A.httpError(400, 'sign in with an email address first');
    if (PUBLIC.indexOf(domain) >= 0) throw A.httpError(403, 'ClearSky-OMEGA workspaces are created with a work email address. ' + domain + ' is a personal email provider. Ask your workspace owner to invite ' + email + ', or sign in with your company address.');
    if ((!caller.claims || caller.claims.email_verified !== true) && !caller.staff) throw A.httpError(403, 'verify your email address first, then try again');

    if (req.method === 'GET') return signupOptions(A.db());

    var db = A.db(), FV = A.FieldValue();
    var orgRef = db.collection('omega_orgs').doc(domain);
    /* "I've paid" from the signup page: the owner asks for a look at
       QuickBooks now (plan-change reconcileNow, throttled) and gets the
       billing state back with the host to open when it is paid. */
    if (b.action === 'check-payment') return checkPayment(db, caller, domain, orgRef);
    return orgRef.get().then(function (s) {
      /* ── already a tenant: auto-join. omega-tenant.js self-registers the
           member on their first visit to the tenant host. ── */
      if (s.exists) {
        var o = s.data(), bill = null;
        return orgRef.collection('billing').doc('current').get().then(function (bs) {
          bill = bs.exists ? bs.data() : {};
          var out = { exists: true, orgId: domain, name: o.name, status: o.status || 'active', host: homeOf(o) };
          /* a workspace waiting for its first payment: the signup page resumes at the pay step */
          if (bill.packaged === true && bill.packagingState === 'awaiting_payment') Object.assign(out, { payNow: true, packagingState: bill.packagingState, paymentLink: bill.paymentLink || null,
            amountDue: bill.amountDue == null ? null : bill.amountDue, amountDueDisplay: bill.amountDue == null ? null : PR.money(Math.round(bill.amountDue * 100)) });
          return out;
        });
      }
      if (!b.companyName || String(b.companyName).trim().length < 2) throw A.httpError(400, 'companyName is required');
      var vertical = ['oem', 'developer', 'epc', 'installer'].indexOf(b.vertical) >= 0 ? b.vertical : 'developer';
      var slug = slugify(b.slug || domain.split('.')[0]);
      if (!slug || RESERVED.indexOf(slug) >= 0) slug = slugify(domain.replace(/\./g, '-'));
      var host = slug + '.' + BASE_HOST;

      /* slug collision → fall back to the full domain as slug */
      return db.collection('tenant_public').doc(host).get().then(function (tp) {
        if (tp.exists) { slug = slugify(domain.replace(/\./g, '-')); host = slug + '.' + BASE_HOST; }
        if (process.env.PACKAGING_SIGNUP_ENABLED === 'true') return packagedSignup(req, caller, domain, b, slug, host);
        /* New signups only: never rewrite an existing tenant's trial. Phase 4
           moves the clock to approval; this is the signup-path ceiling. */
        if (!isFinite(TRIAL_DAYS) || TRIAL_DAYS < 0) throw A.httpError(500, 'Invalid trial configuration');
        var now = new Date(); var trialEnds = new Date(now.getTime() + Math.min(TRIAL_DAYS, 14) * 86400000).toISOString();
        var name = String(b.companyName).trim();
        var org = { name: name, slug: slug, domains: [host], logoUrl: b.logoUrl || '', vertical: vertical, shell: 'default',
          status: 'pending', receivesFullBom: false, exportBrand: { name: name, logo: b.logoUrl || '' },
          signup: { email: email, uid: caller.uid, phone: b.phone || null, note: b.note || null, userAgent: req.headers['user-agent'] || null },
          createdAt: FV.serverTimestamp(), updatedAt: FV.serverTimestamp() };
        var billing = { tier: 'trial', addons: [], toolOverrides: {}, paymentProvider: 'manual', trialEndsAt: trialEnds, subscriptionDue: null, createdAt: FV.serverTimestamp() };
        var member = { email: email, name: caller.claims.name || '', role: 'owner', status: 'active', createdAt: FV.serverTimestamp() };
        var pub = { orgId: domain, name: name, logoUrl: b.logoUrl || '', colors: null, exportBrand: org.exportBrand, tier: 'trial', vertical: vertical, shell: 'default',
          domains: [host], status: 'pending', updatedAt: FV.serverTimestamp() };
        var batch = db.batch();
        batch.set(orgRef, org);
        batch.set(orgRef.collection('billing').doc('current'), billing);
        batch.set(orgRef.collection('members').doc(caller.uid), member);
        batch.set(db.collection('tenant_public').doc(host), pub);
        /* Tell ClearSky. The master console lists omega_orgs where status == 'pending'; this is the nudge.
           Into ClearSky's own org inbox: csebuilders.com is retired, and a note there would be readable by
           whoever held that domain next. */
        batch.set(db.collection('omega_orgs').doc('clearsky-usa.com').collection('notifications').doc(), { kind: 'signup', text: 'New workspace request: ' + name + ' (' + domain + ') by ' + email + ' — ' + vertical, orgId: domain, read: false, createdAt: FV.serverTimestamp() });
        return batch.commit().then(function () {
          return A.init().auth().setCustomUserClaims(caller.uid, Object.assign({}, caller.claims.orgId ? {} : {}, { orgId: domain, role: 'owner' }));
        }).then(function () {
          /* Courtesy copies. Best-effort; the Firestore rows are the record. */
          var first = (caller.claims.name || email.split('@')[0]).split(' ')[0];
          return Promise.all([
            M.templates.signupReceived({ email: email, name: first, company: name, host: homeOf(org) }),
            M.templates.signupAlert({ company: name, orgId: domain, email: email, vertical: vertical, host: homeOf(org), reserved: host, phone: b.phone, note: b.note })
          ]);
        }).then(function () { return { created: true, orgId: domain, host: homeOf(org), reserved: host, status: 'pending', trialEndsAt: trialEnds }; });
      });
    });
  });
});
