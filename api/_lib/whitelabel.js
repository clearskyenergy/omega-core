/* ═══════════════════════════════════════════════════════════════════════════════
   api/_lib/whitelabel.js — the ONE allowlist of world-readable white-label keys
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   omega_orgs/{orgId}.whiteLabel is the tenant's white-label configuration and
   it is scoped by a cross-org read refusal: a tenant may read their own record
   and nobody else's.

   tenant_public/{host} is `allow read: if true`. It exists because the SIGN-IN
   PAGE has to paint before there is a user, and a white-labelled tenant whose
   login screen says ClearSky-OMEGA has already given the game away.

   So a SUBSET of the block crosses into a world-readable document, and this
   file is the only place that decides which keys. Three writers need that
   decision — api/tenant-branding.js (a tenant admin saving branding),
   scripts/seed-omega-orgs.js (standing a tenant up) and the master console —
   and CLAUDE.md already records what happens when one decision lives in three
   files: orgAlias() is in three and every new tenant alias means editing all
   of them. Not repeating that here.

   ── THE TEST FOR ADDING A KEY ────────────────────────────────────────────
   "Is this key already visible in the rendered page to anybody who loads the
   tenant's site?" A platform name, a logo, an accent colour and the
   storefront's headline all are. A fulfilment routing rule, a cost basis, an
   internal contact and a contract term are NOT, and they do not go in this
   list however convenient it would be for a client to read them.

   `embed` is on the list, origins and all. That is deliberate: the origin
   allowlist is an allowlist, not a secret, and knowing which sites may frame
   a widget gets an attacker nothing the browser would honour.
   ═══════════════════════════════════════════════════════════════════════════════ */
'use strict';

var WL_PUBLIC = [
  'enabled',          /* whether the white label is on at all            */
  'platformName',     /* what the platform is called here                */
  'shortName',        /* the tight-space form, for chips and badges      */
  'attribution',      /* 'powered-by' | 'none' — a contract term         */
  'attributionText',  /* the line to print when attribution is on        */
  'markUrl',          /* the mark that replaces ours in dark chrome      */
  'supportEmail',     /* the tenant's own desk, shown to their users     */
  'accent',           /* --wl-accent                                     */
  'ink',              /* --wl-ink                                        */
  'embed'             /* the public storefront's presentation + origins  */
];

/* A new object, built key by key. Never a reference to the stored block and
   never a spread of it: a key added to omega_orgs next year must not become
   world-readable because a mirror forwarded whatever it was handed. */
function pickPublic(wl) {
  if (!wl || typeof wl !== 'object') return null;
  var out = {};
  for (var i = 0; i < WL_PUBLIC.length; i++) {
    var k = WL_PUBLIC[i];
    if (wl[k] !== undefined) out[k] = wl[k];
  }
  return out;
}

/* The world-readable record itself, built the same way by every writer
   (api/tenant-branding.js, api/logic-admin.js). Key by key, never a spread. */
var TIER_PUBLIC = { trial: 'trial', standard: 'standard', pro: 'pro', deluxe: 'deluxe', enterprise: 'enterprise', internal: 'internal', partner: 'partner' };
function publicRecord(orgId, org, updatedAt) {
  org = org || {};
  var out = { orgId: orgId, name: org.name || orgId, logoUrl: org.logoUrl || '', colors: org.colors || null, exportBrand: org.exportBrand || null,
    tier: TIER_PUBLIC[org.publicTier] || 'standard', vertical: org.vertical || null, shell: org.shell || 'default', domains: org.domains || [],
    whiteLabel: pickPublic(org.whiteLabel) };
  if (org.status) out.status = org.status;
  if (updatedAt !== undefined) out.updatedAt = updatedAt;
  return out;
}

module.exports = { WL_PUBLIC: WL_PUBLIC, pickPublic: pickPublic, publicRecord: publicRecord, TIER_PUBLIC: TIER_PUBLIC };
