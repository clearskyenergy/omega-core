/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * The brand a printed deck is drawn with, read from ONE omega_orgs record.
 * The BESS Pro Forma (api/proforma.js) and the Subscription Proposal
 * (api/subscription-proposal.js) share it, so a tenant's mark, colours,
 * tagline and white-label attribution are decided in one place.
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
     api/_lib/whitelabel.js, the one server-side copy of that rule. */
function brandOf(org, orgId, platform) {
  org = isObj(org) ? org : {};
  var eb = isObj(org.exportBrand) ? org.exportBrand : {};
  var c = isObj(org.colors) ? org.colors : {};
  var wl = isObj(org.whiteLabel) ? org.whiteLabel : null;
  var colors = { primary: hex(c.primary) || hex(eb.accent), accent: hex(c.accent), ink: hex(c.ink) };
  var logos = [eb.logo, eb.logoUrl, org.logoUrl], logoUrl = '', i;
  for (i = 0; i < logos.length && !logoUrl; i++) logoUrl = safeUrl(logos[i]);
  var platformName = WL.isOn(wl) ? text(wl.platformName, 80) : '';
  return {
    name: text(eb.name, 120) || text(org.name, 120) || text(orgId, 120),
    logoUrl: logoUrl,
    colors: colors.primary || colors.accent || colors.ink ? colors : null,
    tagline: text(eb.tagline, 160),
    attribution: WL.attributionLine(wl),
    platformName: platformName || platform || PLATFORM
  };
}
module.exports = { PLATFORM: PLATFORM, isObj: isObj, text: text, hex: hex, safeUrl: safeUrl, brandOf: brandOf };
