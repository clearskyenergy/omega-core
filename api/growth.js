/* ═══════════════════════════════════════════════════════════════════════════
   GET /api/growth — the sign-up → trial → paying board, for staff and the
   sales agent
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   GET /api/growth              every workspace, most urgent first, with a
                                summary and today's list
   GET /api/growth?org=<orgId>  one workspace, with the facts behind the call

   Staff only (a VERIFIED @clearsky-usa.com address: caller.staff, never the
   email alone), or the sales agent's ClearSky-held machine key with the
   growth:read scope (api/_lib/agent-auth.js staffOrAgent). Read-only: this endpoint writes nothing, sends nothing and
   decides nothing about access or price. It assembles, per workspace, what
   the platform already records — the org record, billing/current, the
   member count, the last time anyone opened the dashboard (team_members
   .lastSeen), the project count and the newest project — through
   api/_lib/growth-board.js (shared with the sales dashboard, api/sales.js)
   and hands it to api/_lib/growth.js, the pure judgement and the tested part.

   Why an endpoint and not a console widget: the agent reads JSON. A page
   can read the same JSON later; the console is the packaging build's
   territory right now and is not touched here (docs/SALES-AGENT.md).

   Caps keep one call bounded on a large registry: 300 workspaces, and per
   workspace a count capped at 500 projects (the number a glance needs is
   "0, some, many", not an exact 1,204).
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var A = require('./_lib/admin');
var G = require('./_lib/growth');
var B = require('./_lib/growth-board');
var K = require('./_lib/agent-auth');

module.exports = A.handler(function (req) {
  if (req.method !== 'GET') throw A.httpError(405, 'GET only');
  /* a verified ClearSky person, or the sales agent's ClearSky-held key with
     growth:read (docs/SALES-AGENT.md §8: the machine credential) */
  return K.staffOrAgent(req, 'growth:read').then(function () {
    var db = A.db();
    var asked = (req.query && req.query.org) || '';
    var only = A.safeOrg(asked);
    if (asked && !only) throw A.httpError(400, 'org must be a workspace domain');
    return B.records(db, only).then(function (records) {
      if (only) { var one = G.judge(records[0]); one.facts = records[0]; return one; }
      var b = G.board(records);
      b.caps = B.CAPS;
      return b;
    });
  });
});
