/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   The tenant's brand as the CUSTOMER sees it — the customer app, the desktop
   portal, Editor Lite, the PO pages and the customer app's manifest — plus
   `workspace`, the tenant's own name, which ClearSky's Omega Logic app shows
   to say whose workspace is open. Every key here is public (the customer app
   paints before anybody signs in), so only white-label keys that are already
   world-readable (api/_lib/whitelabel.js WL_PUBLIC) may feed it. */
'use strict';
var W = require('./whitelabel');
function color(v, fallback) { return /^#[0-9a-f]{6}$/i.test(String(v || '')) ? v : fallback; }
function mailbox(v) { var s = String(v || '').trim(); return /^[^@\s<>"]+@[^@\s<>"]+\.[^@\s<>"]+$/.test(s) ? s.slice(0, 160) : ''; }
module.exports = function (org) {
  org = org || {};
  var wl = org.whiteLabel || {}, em = wl.embed || {}, c = org.colors || {}, on = W.isOn(wl);
  var logo = String(org.logoUrl || '');
  var name = String((on ? wl.platformName : '') || org.name || 'Customer portal').slice(0, 160);
  return { name: name,
    shortName: String((on ? (wl.shortName || wl.platformName) : '') || org.name || name).slice(0, 40),
    /* the tenant's own name, for ClearSky's Omega Logic product to say whose
       workspace it has open (the white-label `name` above is what the
       tenant's CUSTOMERS see) */
    workspace: String(org.name || '').slice(0, 120),
    logoUrl: /^(https:\/\/|\/(?!\/))/.test(logo) ? logo : '',
    primary: color(c.primary || em.accent || wl.accent, '#3FAFC6'),
    accent: color(c.accent, '#EE5A4F'), ink: color(c.ink || em.ink || wl.ink, '#0B2733'),
    /* the tenant's own desk, for their customers' questions */
    supportEmail: mailbox(em.supportEmail || wl.supportEmail),
    /* "Powered by …" per the contract (whiteLabel.attribution); '' = none */
    attribution: W.attributionLine(wl) };
};
