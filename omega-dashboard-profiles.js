/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * omega-dashboard-profiles.js — what kind of company this is, and therefore
 * what its dashboard is for.
 *
 * The vertical already says what a tenant does. Until now three modules each
 * turned that into their own yes/no — referrals had one list, owned assets
 * had another, the starter widgets came from a Firestore collection nobody
 * had seeded — and an installer was handed a quote-request inbox it will
 * never receive anything in. This is the one table.
 *
 * A profile is a DEFAULT. omega_orgs.dashboardProfile picks a different one
 * for a tenant (NextNRG is a developer that also sells technology: pick
 * 'oem', or keep 'developer' and switch referrals on), and
 * omega_orgs.dashboardBlocks overrides any single block. Both are set from
 * the admin console, and a written override always beats the table.
 *
 * Blocks are the things that mount or not. Widgets are the starter board for
 * somebody who has never arranged one; they can add more from the palette.
 * ES5, because every shell loads it.
 */
(function (root) {
  'use strict';

  var PROFILES = {
    developer: {
      label: 'Developer / owner',
      hint: 'Owns and finances sites. Sends quote requests; does not receive them.',
      blocks: { referrals: false, assets: true, quotes: true, marketplace: true,
                portfolio: true, pipeline: true, analytics: true, taskflow: true },
      widgets: ['stage', 'capex', 'pl', 'funnel']
    },
    oem: {
      label: 'OEM / technology',
      hint: 'Receives quote requests from developers and installers, and quotes them.',
      blocks: { referrals: true, assets: false, quotes: true, marketplace: true,
                portfolio: false, pipeline: true, analytics: true, taskflow: true },
      widgets: ['funnel', 'stage', 'ptype']
    },
    epc: {
      label: 'EPC / engineering',
      hint: 'Receives scopes to price and build.',
      blocks: { referrals: true, assets: false, quotes: true, marketplace: true,
                portfolio: true, pipeline: true, analytics: true, taskflow: true },
      widgets: ['stage', 'ptype', 'funnel']
    },
    installer: {
      label: 'Installer / sales channel',
      hint: 'Requests quotes and pushes sites to the marketplace. Does not receive referrals.',
      blocks: { referrals: false, assets: false, quotes: true, marketplace: true,
                portfolio: true, pipeline: true, analytics: false, taskflow: true },
      widgets: ['stage', 'ptype']
    },
    distributor: {
      label: 'Distributor',
      hint: 'Receives quote requests from the channel and quotes them.',
      blocks: { referrals: true, assets: false, quotes: true, marketplace: true,
                portfolio: false, pipeline: true, analytics: false, taskflow: true },
      widgets: ['funnel', 'ptype']
    },
    finance: {
      label: 'Capital partner',
      hint: 'Deal room, marketplace, offers and investments. No project tooling.',
      blocks: { referrals: false, assets: false, quotes: false, marketplace: false,
                portfolio: false, pipeline: false, analytics: false, taskflow: false },
      widgets: ['finroom', 'finmarket', 'finoffers', 'fininvest']
    }
  };

  /* Which dashboard blocks each profile block name governs. The dashboard's
     built-in cards are keyed by data-block; two more are mounted by modules. */
  var BLOCK_IDS = {
    portfolio: ['portfolio'], pipeline: ['pipeline'], analytics: ['analytics'],
    taskflow: ['taskflow'], referrals: ['referrals'], assets: ['owned-assets']
  };

  function keyFor(ws) {
    if (!ws) return null;
    var k = String(ws.dashboardProfile || '').toLowerCase();
    if (PROFILES[k]) return k;
    if (ws.financeOrgKey) return 'finance';
    var v = String(ws.vertical || '').toLowerCase();
    return PROFILES[v] ? v : 'developer';
  }

  /* The resolved profile: table default, then the tenant's per-block
     overrides. Returns null when the workspace is not known yet — a caller
     that needs a yes/no before then should keep waiting, not guess. */
  function resolve(ws) {
    var key = keyFor(ws);
    if (!key) return null;
    var base = PROFILES[key], blocks = {}, k;
    for (k in base.blocks) if (base.blocks.hasOwnProperty(k)) blocks[k] = base.blocks[k];
    var ov = (ws && ws.dashboardBlocks) || {};
    for (k in ov) if (ov.hasOwnProperty(k) && (ov[k] === true || ov[k] === false)) blocks[k] = ov[k];
    return { key: key, label: base.label, hint: base.hint, blocks: blocks,
             widgets: base.widgets.slice(), explicit: !!(ws && PROFILES[String(ws.dashboardProfile||'').toLowerCase()]) };
  }

  /* true / false / 'unknown'. 'unknown' when the workspace has not resolved;
     the mount loops in omega-referrals and omega-assets already treat that
     as "keep polling", which is the correct answer to a question asked too
     early. */
  function wants(ws, block) {
    var p = resolve(ws);
    if (!p) return 'unknown';
    return p.blocks[block] === true;
  }

  /* data-block ids the profile hides on the dashboard. */
  function hiddenBlockIds(ws) {
    var p = resolve(ws), out = [];
    if (!p) return out;
    for (var name in BLOCK_IDS) if (BLOCK_IDS.hasOwnProperty(name) && p.blocks[name] === false)
      out = out.concat(BLOCK_IDS[name]);
    return out;
  }

  root.OmegaDashProfiles = { PROFILES: PROFILES, keyFor: keyFor, resolve: resolve,
                             wants: wants, hiddenBlockIds: hiddenBlockIds };
})(typeof globalThis !== 'undefined' ? globalThis : this);
if (typeof module !== 'undefined' && module.exports)
  module.exports = (typeof globalThis !== 'undefined' ? globalThis : this).OmegaDashProfiles;
