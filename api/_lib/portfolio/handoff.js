/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/portfolio/handoff.js — tool launch contract (spec §8.2)
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   PURE. Routes come from the existing registry (omega-tools.js keys/files;
   a test pins them). A launch carries only opaque selectors in the URL —
   siteId/projectId/scenarioId/handoff id — never customer data or tokens;
   the tool fetches the authorized context server-side by handoff id.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var TOOLS = {
  editor:      { registryKey: 'editor',          route: '/editor.html',              action: 'Open Site Map',        returns: ['editorProjectId', 'revision', 'featureCount'] },
  gridatlas:   { registryKey: 'gridatlas',       route: '/grid-atlas.html',          action: 'Grid screen',          returns: ['layers', 'screen', 'freshness'] },
  fiber:       { registryKey: null,              route: '/api/network-proximity',    action: 'Fiber proximity',      returns: ['distanceM', 'method', 'carriers'], api: true },
  parcel:      { registryKey: 'parcelscreening', route: '/screening.html?tool=parcel', action: 'Parcel screening',   returns: ['findings', 'boundarySource'] },
  bess:        { registryKey: 'bessscreening',   route: '/screening.html?tool=bess', action: 'BESS screening',       returns: ['alternatives', 'constraints'] },
  valuestack:  { registryKey: 'valuestack',      route: '/valuestack.html',          action: 'Value stack',          returns: ['stack', 'conflicts'] },
  compute:     { registryKey: 'computeproforma', route: '/compute-proforma.html',     action: 'Compute pro forma',    returns: ['cashFlows', 'returns'] }
};
var STATUSES = ['requested', 'running', 'complete', 'failed', 'unavailable', 'locked', 'no-coverage', 'stale'];
function launch(tool, ctx, entitlements) {
  var t = TOOLS[tool]; if (!t) return { ok: false, status: 'unavailable', reason: 'Unknown tool' };
  if (t.registryKey && entitlements && entitlements[t.registryKey] === false) return { ok: false, status: 'locked', reason: 'Not included in this workspace plan', retry: false };
  var q = ['handoff=' + encodeURIComponent(ctx.handoffId), 'site=' + encodeURIComponent(ctx.siteId)];
  if (ctx.projectId) q.push('project=' + encodeURIComponent(ctx.projectId));
  if (ctx.scenarioId) q.push('scenario=' + encodeURIComponent(ctx.scenarioId));
  q.push('return=' + encodeURIComponent('/portfolio-assets.html#site=' + ctx.siteId));
  return { ok: true, status: 'requested', url: t.route + (t.route.indexOf('?') >= 0 ? '&' : '?') + q.join('&'), tool: tool, action: t.action };
}
/* A tool's result → a persisted analysis record. Never fabricates. */
function record(tool, ctx, result) {
  var st = result && STATUSES.indexOf(result.status) >= 0 ? result.status : 'failed';
  return { kind: { editor: 'design', gridatlas: 'power', fiber: 'fiber', parcel: 'parcel', bess: 'power', valuestack: 'value-stack', compute: 'finance' }[tool] || tool, tool: tool,
    engineVersion: result && result.engineVersion || null, inputRevision: ctx.inputRevision || null, status: st === 'complete' ? 'current' : st,
    result: st === 'complete' ? result.data || null : null, warnings: result && result.warnings || [], retryable: st === 'failed' || st === 'unavailable' || st === 'no-coverage', at: ctx.now };
}
module.exports = { TOOLS: TOOLS, STATUSES: STATUSES, launch: launch, record: record };
