/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * Whether a workspace runs the public storefront (Omega Storefront, the
 * `whitelabel` module on a legacy plan): a toolOverrides switch either way,
 * else the 'whitelabel' add-on or the staff-written whiteLabel.enabled on the
 * tenant record. Never the tier.
 *
 * The ONE rule. api/_lib/embed.js gates the storefront with it, and the
 * store's twin, OmegaWorkspaceHub.storefront, is held to it case for case by
 * scripts/tests/tworkspacehub.js, so "On your plan" is what the storefront
 * opens. Pure and dependency-free, so that test runs without an install.
 */
'use strict';
function storefrontEntitled(billing, whiteLabel) {
  var b = billing || {}, overrides = b.toolOverrides || {}, addons = b.addons || [], wl = whiteLabel || {};
  return overrides.whitelabel === true
    || (overrides.whitelabel !== false
        && (addons.indexOf('whitelabel') >= 0 || wl.enabled === true));
}
module.exports = { storefrontEntitled: storefrontEntitled };
