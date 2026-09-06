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
var BASE_HOST = process.env.TENANT_BASE_HOST || 'clearskyomega.com';
var TRIAL_DAYS = Number(process.env.TRIAL_DAYS || 30);
var RESERVED = ['app', 'www', 'api', 'alpha', 'next', 'staging', 'demo', 'admin', 'console', 'tools', 'osa', 'billing', 'support', 'mail', 'status'];

function slugify(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40); }

module.exports = A.handler(function (req) {
  if (req.method !== 'POST') throw A.httpError(405, 'POST only');
  var b = req.body || {};
  return A.authenticate(req).then(function (caller) {
    var email = String(caller.email || '').toLowerCase();
    var domain = A.orgOf(email);
    if (!domain || domain.indexOf('.') < 0) throw A.httpError(400, 'sign in with an email address first');
    if (PUBLIC.indexOf(domain) >= 0) throw A.httpError(403, 'ClearSky-OMEGA workspaces are created with a work email address. ' + domain + ' is a personal email provider. Ask your workspace owner to invite ' + email + ', or sign in with your company address.');
    if (!caller.claims.email_verified && !caller.staff) throw A.httpError(403, 'verify your email address first, then try again');

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
        var now = new Date(); var trialEnds = new Date(now.getTime() + TRIAL_DAYS * 86400000).toISOString();
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
        /* Tell ClearSky. The master console lists omega_orgs where status == 'pending'; this is the nudge. */
        batch.set(db.collection('omega_orgs').doc('csebuilders.com').collection('notifications').doc(), { kind: 'signup', text: 'New workspace request: ' + name + ' (' + domain + ') by ' + email + ' — ' + vertical, orgId: domain, read: false, createdAt: FV.serverTimestamp() });
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
