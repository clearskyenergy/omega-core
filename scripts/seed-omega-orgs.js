#!/usr/bin/env node
/* scripts/seed-omega-orgs.js — create omega_orgs/{orgId}, billing/current and
   tenant_public/{host} for every tenant, from tenants/<slug>/tenant.json.
   DRY RUN BY DEFAULT. Prints what it would write. Pass --apply to write.
   Never overwrites a field that already has a value (merge, existing wins)
   unless --force.
   Usage: FIREBASE_SERVICE_ACCOUNT="$(cat sa.json)" node scripts/seed-omega-orgs.js [--apply] [--force] */
'use strict';
var fs = require('fs'), path = require('path');
var APPLY = process.argv.indexOf('--apply') >= 0, FORCE = process.argv.indexOf('--force') >= 0;
/* --create-owners: with --apply, create an Auth account for each tenant's
   ownerEmail that has none yet (no password set), and print — and email,
   when the mail transport is configured — Firebase's set-password link. */
var CREATE_OWNERS = process.argv.indexOf('--create-owners') >= 0;
var root = path.join(__dirname, '..', 'tenants');
/* ── tenants/<slug>/billing.json: WHAT THE ACCOUNT BOUGHT, KEPT OFF THE SITE ──
   A tenant folder is served (whitelabel-setup.html fetches tenant.json over
   HTTP), so a tenant.json that carried tier, add-ons and dates published
   them to anybody with the address (LIVE-1, 2026-09-24). Those fields may
   sit in billing.json beside it instead, which .vercelignore keeps off the
   site; this is its only reader. Only these keys: an invoice amount, a
   payment link or a Stripe id does not belong in the repo at all, so any
   other key is refused rather than seeded. A key in both files must agree,
   so the two can never quietly disagree about what a tenant pays for. */
var BILLING_FILE_KEYS = ['tier', 'addons', 'trialEndsAt', 'subscriptionDue', 'toolOverrides', 'paymentProvider'];
function loadSeed(d) {
  var t = JSON.parse(fs.readFileSync(path.join(root, d, 'tenant.json'))), bf = path.join(root, d, 'billing.json');
  if (fs.existsSync(bf)) {
    var b = JSON.parse(fs.readFileSync(bf));
    Object.keys(b).forEach(function (k) {
      if (BILLING_FILE_KEYS.indexOf(k) < 0) throw new Error('tenants/' + d + '/billing.json: ' + k + ' is not a field the seed takes from it (' + BILLING_FILE_KEYS.join(', ') + ')');
      if (t[k] !== undefined && JSON.stringify(t[k]) !== JSON.stringify(b[k])) throw new Error('tenants/' + d + ': ' + k + ' differs between tenant.json and billing.json; keep it in billing.json only');
      t[k] = b[k];
    });
  }
  t.slug = d; return t;
}
var seeds = fs.readdirSync(root).filter(function (d) { return fs.existsSync(path.join(root, d, 'tenant.json')); }).map(loadSeed);

/* 'deluxe' was missing here too, so a deluxe tenant's tenant_public said
   'standard' and their sign-in page painted the wrong tier before auth.
   Same omission as the two maps in omega-tenant.js; same ladder as
   omega-caps.js and api/tenant-billing.js. */
var TIER_PUBLIC = { trial: 'trial', standard: 'standard', pro: 'pro', deluxe: 'deluxe', enterprise: 'enterprise', internal: 'internal', partner: 'partner' };

/* The world-readable subset of a whiteLabel block. ONE allowlist, shared with
   api/tenant-branding.js — see api/_lib/whitelabel.js for what may cross into
   tenant_public and what may not. */
var pickPublicWL = require('../api/_lib/whitelabel').pickPublic;

/* ── STOREFRONT KEYS THAT MUST NOT COME OUT OF THE REPO ──────────────────
   capexPerKwh / capexPerKw are the installed-cost basis the public sizer
   sweeps against — the tenant's negotiated buy price. Every tenant.json under
   tenants/ is committed source, and CLAUDE.md is explicit that a contract value does
   not belong in the repo (the cleancell note already refuses to carry an
   invoice amount for the same reason).

   So the seed carries the storefront's PRESENTATION and its PUBLISHED product
   list, and refuses the cost basis loudly rather than dropping it silently —
   a key that vanished without a word would be set in tenant.json, committed,
   and then quietly absent in production. Set those two by hand in Firestore,
   or from the master console. */
var STOREFRONT_FORBIDDEN = ['capexPerKwh', 'capexPerKw'];
var STOREFRONT_KEYS = ['headline', 'intro', 'disclaimer', 'thanks', 'cta',
  'requireAddress', 'collectBill', 'showEconomics', 'emailCustomer',
  'dailyOrderCap', 'fulfilledBy', 'products',
  /* The site study (api/embed-layout.js). setbackFt/clearanceFt/aisleFt/
     rowsPerBlock are geometric ASSUMPTIONS, not a cost basis, so unlike
     capexPerKwh they belong in version control: they decide the unit count on
     a customer's drawing and a change to one should show up in a diff.
     dailyParcelCap is the spend limit on the metered parcel lookup. */
  'siteStudy', 'requireContactForLayout', 'dailyParcelCap', 'designerPitch',
  'setbackFt', 'clearanceFt', 'aisleFt', 'rowsPerBlock'];
/* Documentation keys in tenant.json that no reader consumes. Dropped here
   rather than seeded, so the file can explain its own product shape without
   putting a _comment block into Firestore. */
var STOREFRONT_DOC_KEYS = ['_productShape'];

function planStorefront(t) {
  var sf = t.storefront;
  if (!sf || typeof sf !== 'object') return null;
  STOREFRONT_FORBIDDEN.forEach(function (k) {
    if (sf[k] !== undefined) {
      throw new Error('tenants/' + t.slug + '/tenant.json: storefront.' + k + ' is a COST BASIS and '
        + 'must not live in the repo. Remove it and set it in Firestore '
        + '(omega_orgs/' + t.orgId + '/storefront/config). See CLAUDE.md IP protection.');
    }
  });
  var out = {};
  STOREFRONT_KEYS.forEach(function (k) { if (sf[k] !== undefined) out[k] = sf[k]; });
  STOREFRONT_DOC_KEYS.forEach(function (k) { delete out[k]; });
  return out;
}

function plan(t) {
  var org = { name: t.name, slug: t.slug, domains: t.domains || [], logoUrl: t.logoUrl || '', appIcon: t.appIcon || null, vertical: t.vertical || null, shell: t.shell || 'default',
    status: t.status || 'active', receivesFullBom: !!t.receivesFullBom, exportBrand: t.exportBrand || { name: t.name, logo: t.logoUrl || '' } };
  /* whiteLabel goes on the ORG record whole — that is the authority, and
     omega-tenant.js mergeEntitlements() reads it there once a user is signed
     in. Only the allowlisted subset reaches tenant_public below. */
  if (t.whiteLabel) org.whiteLabel = t.whiteLabel;
  var billing = { tier: t.tier || 'standard', addons: t.addons || [], toolOverrides: t.toolOverrides || {}, paymentProvider: t.paymentProvider || 'manual', trialEndsAt: t.trialEndsAt || null, subscriptionDue: t.subscriptionDue || null };
  /* toolAccess — THE ALLOWLIST, and therefore the PRODUCT. When a tenant.json
     carries it, that account gets exactly these tools whatever its tier: the
     white-labelled design tool Clean Cell resells is ['editor','gridatlas']
     and nothing else. Omitted (null, not []) means "whatever the plan
     includes", which is every tenant seeded so far — an empty array would
     mean NO tools, and omega-tools.js now reads it that way on purpose. */
  if (Array.isArray(t.toolAccess) && t.toolAccess.length) billing.toolAccess = t.toolAccess;
  var pub = { orgId: t.orgId, name: t.name, logoUrl: t.logoUrl || '', colors: t.colors || null, exportBrand: org.exportBrand, tier: TIER_PUBLIC[billing.tier] || 'standard',
    vertical: org.vertical, shell: org.shell, domains: org.domains, requiredTools: t.requiredTools || null, allowedEmails: t.allowedEmails || [],
    whiteLabel: pickPublicWL(t.whiteLabel) };
  return { orgId: t.orgId, org: org, billing: billing, pub: pub, storefront: planStorefront(t), owner: t.ownerEmail || null };
}
var plans = seeds.map(plan);
plans.forEach(function (p) { console.log('\n== ' + p.orgId + ' (' + p.org.slug + ')'); console.log('  omega_orgs:', JSON.stringify(p.org)); console.log('  billing/current:', JSON.stringify(p.billing)); console.log('  tenant_public:', p.pub.domains.join(', ') || '(no hostnames!)'); if (p.org.whiteLabel) console.log('  whiteLabel:', JSON.stringify(p.org.whiteLabel)); if (p.storefront) console.log('  storefront/config:', JSON.stringify(p.storefront)); if (p.owner) console.log('  owner:', p.owner); });
/* A tenant whose orgId is still undecided (OSA, pending the JV agreement)
   cannot be a Firestore document id: .doc('') throws, and because the write
   loop is neither transactional nor guarded, that throw would abort the run
   part-way and leave the control plane half seeded. Hold those back and keep
   going, so the decided tenants seed cleanly. */
var skipped = plans.filter(function (p) { return !p.orgId || !String(p.orgId).trim(); });
plans = plans.filter(function (p) { return p.orgId && String(p.orgId).trim(); });
if (skipped.length) {
  console.log('\nSKIPPED — no orgId set (decide it in tenants/<slug>/tenant.json, then re-run):');
  skipped.forEach(function (p) { console.log('  · ' + p.org.slug + '  hosts: ' + (p.pub.domains.join(', ') || '(none)')); });
}

if (!APPLY) { console.log('\nDRY RUN — nothing written. Re-run with --apply.'); process.exit(0); }

var admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
var db = admin.firestore(), FV = admin.firestore.FieldValue;
function mergeKeep(ref, data) { return ref.get().then(function (s) { var cur = s.exists ? s.data() : {}; var out = {}; Object.keys(data).forEach(function (k) { if (FORCE || cur[k] === undefined || cur[k] === null || cur[k] === '') out[k] = data[k]; }); out.updatedAt = FV.serverTimestamp(); if (!s.exists) out.createdAt = FV.serverTimestamp(); return ref.set(out, { merge: true }); }); }
(async function () {
  for (var i = 0; i < plans.length; i++) {
    var p = plans[i], ref = db.collection('omega_orgs').doc(p.orgId);
    await mergeKeep(ref, p.org);
    await mergeKeep(ref.collection('billing').doc('current'), p.billing);
    /* mergeKeep, so a products list edited in Firestore is not clobbered by a
       re-run of the seed. --force is the way to push the repo's version. */
    if (p.storefront) await mergeKeep(ref.collection('storefront').doc('config'), p.storefront);
    for (var h = 0; h < p.pub.domains.length; h++) await mergeKeep(db.collection('tenant_public').doc(String(p.pub.domains[h]).toLowerCase()), p.pub);
    if (p.owner) {
      try {
        var u = null;
        try { u = await admin.auth().getUserByEmail(p.owner); }
        catch (e0) {
          /* --create-owners: stand the owner's account up WITHOUT a password
             and hand back Firebase's own set-password link, so the person
             chooses their password and nobody here ever handles one. */
          if (!CREATE_OWNERS || !(e0 && e0.code === 'auth/user-not-found')) throw e0;
          u = await admin.auth().createUser({ email: p.owner.toLowerCase(), emailVerified: false, displayName: p.org.name });
          console.log('  owner account created (no password):', p.owner);
        }
        await mergeKeep(ref.collection('members').doc(u.uid), { email: p.owner.toLowerCase(), role: 'owner', status: 'active' });
        await admin.auth().setCustomUserClaims(u.uid, Object.assign({}, u.customClaims || {}, { orgId: p.orgId, role: 'owner' }));
        console.log('  owner set:', p.owner);
        if (CREATE_OWNERS) {
          var host = p.pub.domains[0] || (p.org.slug + '.clearskyomega.com');
          var link = await admin.auth().generatePasswordResetLink(p.owner.toLowerCase(), { url: 'https://' + host + '/' });
          console.log('  set-password link for ' + p.owner + ' (valid ~1 hour):\n    ' + link);
          try {
            var M = require('../api/_lib/mail');
            if (M && typeof M.configured === 'function' && M.configured()) {
              var html = M.layout('Your ' + p.org.name + ' workspace is ready',
                '<p>ClearSky has set up <b>' + M.esc(p.org.name) + '</b> on ClearSky-OMEGA at <b>' + M.esc(host) + '</b>.</p>'
                + '<p>Choose your password to get in. The link is good for about an hour; after that, use “Forgot password” on the sign-in page with this address.</p>'
                + M.button(link, 'Set your password')
                + '<p>Colleagues at ' + M.esc(p.orgId) + ' can sign in with their work email and will join your workspace automatically.</p>');
              var r = await M.send(p.owner.toLowerCase(), p.org.name + ' on ClearSky-OMEGA — set your password', html,
                'Your ' + p.org.name + ' workspace is ready at https://' + host + '/. Set your password: ' + link);
              console.log('  set-password email:', (r && r.ok) ? 'sent' : ('not sent — ' + ((r && (r.error || (r.skipped && 'no mailbox configured'))) || 'send failed')));
            } else console.log('  set-password email: not sent — no mail transport configured; send the link above yourself.');
          } catch (em) { console.log('  set-password email: not sent —', em.message); }
        }
      }
      catch (e) { console.log('  owner NOT set (no Auth user yet? pass --create-owners to create one):', p.owner, e.message); }
    }
    console.log('written:', p.orgId);
  }
})();
