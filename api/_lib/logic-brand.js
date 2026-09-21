/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
function color(v, fallback) { return /^#[0-9a-f]{6}$/i.test(String(v || '')) ? v : fallback; }
module.exports = function (org) {
  org = org || {};
  var wl = org.whiteLabel || {}, em = wl.embed || {}, c = org.colors || {};
  var logo = String(org.logoUrl || '');
  return { name: String(wl.platformName || org.name || 'Customer portal').slice(0, 160),
    logoUrl: /^(https:\/\/|\/(?!\/))/.test(logo) ? logo : '',
    primary: color(c.primary || em.accent || wl.accent, '#3FAFC6'),
    accent: color(c.accent, '#EE5A4F'), ink: color(c.ink || em.ink, '#0B2733') };
};
