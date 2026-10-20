/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * The brand a printed deck is drawn with, read from ONE omega_orgs record.
 * The BESS Pro Forma (api/proforma.js) and the Subscription Proposal
 * (api/subscription-proposal.js) share it, so a tenant's mark, colours,
 * tagline and white-label attribution are decided in one place.
 *
 * A seller's COMPANY (the letterhead a customer quote prints: legal name,
 * address, phone, email, website) is `omega_orgs/{org}.company`, written by
 * the tenant's owner or an administrator through api/tenant-branding.js
 * (cleanCompany() below is the one validator). When the record carries none,
 * a server caller may hand the workspace's private billing profile
 * (omega_orgs/{org}/billing/profile, Admin SDK) as opts.profile and the
 * legal name, address, phone and website are read from it; the answer says
 * which (`company.source`). `company` is never mirrored to tenant_public:
 * whitelabel.publicRecord() builds that document key by key.
 */
'use strict';
var WL = require('./whitelabel');
var PLATFORM = 'ClearSky-OMEGA';
function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
/* Stored strings reach a printed deck: control characters out, length
   capped, anything that is not a string or a number treated as unset. */
function text(v, max) {
  if (typeof v !== 'string' && typeof v !== 'number') return '';
  return String(v).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/^\s+|\s+$/g, '').slice(0, max);
}
function hex(v) {
  var m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text(v, 16));
  if (!m) return null;
  var h = m[1];
  if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
  return '#' + h.toUpperCase();
}
/* An https URL or a same-origin path, nothing else. Not http (a mixed-
   content hole in a printed deck), not data: or javascript:, and not
   '//host' or '/\host', which a browser reads as another origin. */
function safeUrl(v) {
  var s = text(v, 2048);
  if (/^https:\/\/[^\s"'<>\\]+$/i.test(s)) return s;
  if (/^\/(?!\/)[^\s"'<>\\]*$/.test(s)) return s;
  return '';
}
/* ── the seller's company ─────────────────────────────────────────────── */
var ADDRESS_KEYS = ['line1', 'line2', 'city', 'state', 'postalCode', 'country'];
var COMPANY_KEYS = ['legalName', 'address', 'phone', 'email', 'website'];
function companyFail(message) { var e = new Error(message); e.status = 400; throw e; }
/* What a tenant admin may store as omega_orgs/{org}.company: those five keys
   and nothing else, every value a short string with no control characters,
   the email an address, the website http(s). null clears it. */
function cleanCompany(v) {
  if (v === null) return null;
  if (!isObj(v)) companyFail('company must be an object');
  Object.keys(v).forEach(function (k) { if (COMPANY_KEYS.indexOf(k) < 0) companyFail('Unsupported company field: ' + String(k).slice(0, 40)); });
  function field(x, name, max) {
    if (x == null || x === '') return '';
    if (typeof x !== 'string' || x.length > max || /[\u0000-\u001f\u007f]/.test(x)) companyFail('Invalid company ' + name);
    return x.trim();
  }
  var a = v.address == null ? {} : v.address, address = {};
  if (!isObj(a)) companyFail('company.address must be an object');
  Object.keys(a).forEach(function (k) { if (ADDRESS_KEYS.indexOf(k) < 0) companyFail('Unsupported company address field: ' + String(k).slice(0, 40)); });
  ADDRESS_KEYS.forEach(function (k) { address[k] = field(a[k], 'address.' + k, k === 'country' ? 60 : 120); });
  var out = { legalName: field(v.legalName, 'legal name', 120), address: address, phone: field(v.phone, 'phone', 40), email: field(v.email, 'email', 254).toLowerCase(), website: field(v.website, 'website', 300) };
  if (out.phone && !/^[0-9+()\-.\s x#]+$/i.test(out.phone)) companyFail('Invalid company phone');
  if (out.email && !/^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/.test(out.email)) companyFail('Invalid company email');
  if (out.website && !/^https?:\/\/[^\s"'<>\\]+$/i.test(out.website)) companyFail('Company website must be an http(s) URL');
  return out;
}
/* The company a document prints, read (never thrown on: a stored record is
   cleaned field by field, anything unusable reads as blank). The record's
   own `company` wins; else the billing profile's legal name, address, phone
   and website (its email is the accounts-payable address, not a sales one,
   so it is not used). null when neither names anything. */
function companyOf(org, profile) {
  function pick(src, source, withEmail) {
    if (!isObj(src)) return null;
    var a = isObj(src.address) ? src.address : {}, address = {};
    ADDRESS_KEYS.forEach(function (k) { address[k] = text(a[k], k === 'country' ? 60 : 120); });
    var email = withEmail ? text(src.email, 254).toLowerCase() : '', site = text(src.website, 300);
    var out = { legalName: text(src.legalName, 120), address: address, phone: text(src.phone, 40),
      email: /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/.test(email) ? email : '',
      website: /^https?:\/\/[^\s"'<>\\]+$/i.test(site) ? site : '', source: source };
    var any = out.legalName || out.phone || out.email || out.website || ADDRESS_KEYS.some(function (k) { return address[k]; });
    return any ? out : null;
  }
  org = isObj(org) ? org : {};
  return pick(org.company, 'record', true) || pick(profile, 'billing-profile', false);
}
/* omega_orgs/{orgId} → the brand a deck is drawn with. Read from the
   CALLER's own record only, so the client on the deck is whoever produced
   it and no tenant is ever a default.
   - The logo is the first usable one of exportBrand.logo, exportBrand.logoUrl
     and the org logo: an export logo that fails the URL check falls back to
     the tenant's own mark rather than to none.
   - colors are org.colors, each hex-checked. exportBrand.accent fills an
     unset primary, since exportBrand is the tenant's own statement of how
     their documents look; it never overrides colors that are set.
   - attribution and platformName follow the white-label contract through
     api/_lib/whitelabel.js, the one server-side copy of that rule.
   - company, when asked for (opts.company or opts.profile), is
     companyOf(org, opts.profile) above (null when none). */
function brandOf(org, orgId, platform, opts) {
  org = isObj(org) ? org : {};
  var eb = isObj(org.exportBrand) ? org.exportBrand : {};
  var c = isObj(org.colors) ? org.colors : {};
  var wl = isObj(org.whiteLabel) ? org.whiteLabel : null;
  var colors = { primary: hex(c.primary) || hex(eb.accent), accent: hex(c.accent), ink: hex(c.ink) };
  var logos = [eb.logo, eb.logoUrl, org.logoUrl], logoUrl = '', i;
  for (i = 0; i < logos.length && !logoUrl; i++) logoUrl = safeUrl(logos[i]);
  var platformName = WL.isOn(wl) ? text(wl.platformName, 80) : '';
  var out = {
    name: text(eb.name, 120) || text(org.name, 120) || text(orgId, 120),
    logoUrl: logoUrl,
    colors: colors.primary || colors.accent || colors.ink ? colors : null,
    tagline: text(eb.tagline, 160),
    attribution: WL.attributionLine(wl),
    platformName: platformName || platform || PLATFORM
  };
  /* asked for (opts.company, or a billing profile handed over): the six keys
     above stay exactly the Pro Forma's contract for every other caller */
  if (opts && (opts.company === true || 'profile' in opts)) out.company = companyOf(org, opts.profile);
  return out;
}
module.exports = { PLATFORM: PLATFORM, isObj: isObj, text: text, hex: hex, safeUrl: safeUrl, brandOf: brandOf,
  companyOf: companyOf, cleanCompany: cleanCompany, COMPANY_KEYS: COMPANY_KEYS, ADDRESS_KEYS: ADDRESS_KEYS };
