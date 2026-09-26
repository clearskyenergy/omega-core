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
     { created: true, host, status:'pending', orgId }
   ═══════════════════════════════════════════════════════════════════════════════ */
'use strict';
var A = require('./_lib/admin');
var M = require('./_lib/mail');
var PUBLIC = require('./_lib/public-domains');
var BP = require('./_lib/billing-profile'), PB = require('./_lib/pricebook'), MOD = require('./_lib/modules'), PR = require('./_lib/subscription-pricing'), POLICY = require('./_lib/package-billing-policy');
var BASE_HOST = process.env.TENANT_BASE_HOST || 'clearskyomega.com';
var TRIAL_DAYS = Number(process.env.TRIAL_DAYS || 14);
var RESERVED = ['app', 'www', 'api', 'alpha', 'next', 'staging', 'demo', 'admin', 'console', 'tools', 'osa', 'billing', 'support', 'mail', 'status'];

function slugify(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40); }

async function signupOptions(db) {
  if (process.env.PACKAGING_SIGNUP_ENABLED !== 'true') return { packaging: false, maxTrialDays: 14 };
  if (process.env.QBO_ENV !== 'sandbox') throw A.httpError(409, 'Packaged signup is sandbox-only');
  var book = await PB.load(db, PB.VERSION);
  if (!book.enabled) throw A.httpError(409, 'Packaged signup is not enabled in the price book');
  return { packaging: true, maxTrialDays: Math.min(book.policy.trialDays, 14), pricebookVersion: book.version,
    modules: PR.catalog(book), starters: MOD.starters(), starterLabels: MOD.starterLabels() };
}
async function packagedSignup(req, caller, domain, b, slug, host) {
  var db = A.db(); await signupOptions(db);
  var profile = BP.normalize(b.billingProfile), now = Date.now(), book = await PB.load(db, PB.VERSION);
  var selected = POLICY.terms({ modules: b.modules || ['lite'], interval: b.interval || 'monthly' }, book, now);
  if (b.vertical !== profile.vertical) throw A.httpError(400, 'Company type and billing profile must agree');
  var duration = Math.min(TRIAL_DAYS, 14);
  if (!isFinite(duration) || duration < 0 || Math.floor(duration) !== duration) throw A.httpError(500, 'Invalid trial configuration');
  var ref = db.collection('omega_orgs').doc(domain), name = String(b.companyName).trim();
  var result = await db.runTransaction(async function (tx) {
    var old = await tx.get(ref), publicRef = db.collection('tenant_public').doc(host), publicSnap = await tx.get(publicRef);
    if (old.exists) { var prior = old.data(); return { exists: true, orgId: domain, status: prior.status, host: (prior.domains || [])[0] || null }; }
    if (publicSnap.exists) throw A.httpError(409, 'Workspace address is already in use; choose another');
    var org = { name: name, slug: slug, domains: [host], logoUrl: b.logoUrl || '', vertical: profile.vertical,
      shell: 'default', status: 'pending', receivesFullBom: false, exportBrand: { name: name, logo: b.logoUrl || '' },
      signedUpAt: now, packagingSandbox: true, createdAt: now, updatedAt: now,
      signup: { email: caller.email, uid: caller.uid, phone: b.phone || null, note: b.note || null } };
    tx.create(ref, org);
    tx.create(ref.collection('billing').doc('profile'), Object.assign({}, profile, { createdAt: now, updatedBy: caller.email }));
    tx.create(ref.collection('billing').doc('current'), { packaged: true, packagingSignup: true, packagingState: 'pending',
      modules: ['lite'], proposedPackage: selected, pricebookVersion: book.version, trialDurationDays: duration,
      billingProvider: 'quickbooks', qboEnv: 'sandbox', createdAt: now });
    tx.create(ref.collection('members').doc(caller.uid), { email: caller.email, name: caller.claims.name || '', role: 'owner', status: 'active', createdAt: now });
    tx.create(publicRef, { orgId: domain, name: name, logoUrl: org.logoUrl, colors: null, exportBrand: org.exportBrand,
      tier: 'trial', vertical: profile.vertical, shell: 'default', domains: [host], status: 'pending', updatedAt: now });
    tx.set(db.collection('omega_orgs').doc('clearsky-usa.com').collection('notifications').doc(), { kind: 'signup',
      text: 'New packaged workspace request: ' + name + ' (' + domain + ')', orgId: domain, read: false, createdAt: now });
    return { created: true, orgId: domain, host: host, status: 'pending', trialEndsAt: null, trialStartsOnApproval: true };
  });
  if (!result.created) return result;
  await A.init().auth().setCustomUserClaims(caller.uid, { orgId: domain, role: 'owner' });
  await Promise.all([M.templates.signupReceived({ email: caller.email, company: name, host: host, packaging: true }),
    M.templates.signupAlert({ company: name, orgId: domain, email: caller.email, vertical: profile.vertical, host: host, phone: b.phone, note: b.note })]);
  return result;
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
    return orgRef.get().then(function (s) {
      /* ── already a tenant: auto-join. omega-tenant.js self-registers the
           member on their first visit to the tenant host. ── */
      if (s.exists) {
        var o = s.data();
        return { exists: true, orgId: domain, name: o.name, status: o.status || 'active', host: (o.domains && o.domains[0]) || null };
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
            M.templates.signupReceived({ email: email, name: first, company: name, host: host }),
            M.templates.signupAlert({ company: name, orgId: domain, email: email, vertical: vertical, host: host, phone: b.phone, note: b.note })
          ]);
        }).then(function () { return { created: true, orgId: domain, host: host, status: 'pending', trialEndsAt: trialEnds }; });
      });
    });
  });
});
