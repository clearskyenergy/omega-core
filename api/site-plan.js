/* ═══════════════════════════════════════════════════════════════════════════════
   POST /api/site-plan   —  a constrained BESS layout from reviewed site evidence
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Body:   { site: {...} }                    the schema in scripts/site-agent/
                                              example-site.json, local feet
   200:    { status:'concept_ready', layout:{...}, alternatives:[...], checks,
             unverified:[...] }               a placement, a route, and what
                                              this never checked
           { status:'needs_input', missing:[...] }   evidence it will not invent
           { status:'blocked', reason }       the bounded search found nothing
   400:    the site object is malformed (a self-intersecting parcel, a building
           outside it, a service offset with no wall left for the gear)
   401:    bad or missing Firebase ID token
   403:    tenant not active, or the tier/add-on does not carry the tool
   405:    anything but POST

   WHY THIS IS A FUNCTION AND NOT A MODULE IN THE PAGE. CLAUDE.md names site
   viability scoring among the things that must be server-side, and this is the
   same class: the placement sweep, the clearance rules and the A* route are the
   method, not the answer. Shipped to the browser, any tenant reads how OMEGA
   decides where a battery goes. The planner already lived in api/_lib/ for this
   reason; until now the only caller was the local MCP server in scripts/, which
   required a Claude Code operator at the machine. This is the door that lets the
   editor itself ask, with a token and an entitlement behind it.

   WHAT IT REFUSES. The planner does not invent evidence, and neither does this.
   A request with no surveyed parcel, no confirmed service wall, no equipment
   footprint or no documented clearance basis comes back 200 with needs_input
   and the list — not a plausible drawing. 'blocked' means this bounded search
   found no route, which is not the same as proving none exists. Both are
   answers; neither is a failure, so neither is an error status.

   WHAT IT IS NOT. Two nodes and one conduit is not an electrical one-line. No
   conductor or protection sizing, no trench depth or bend radius, no utility
   approval, no manufacturer installation review, no field locate. The response
   carries `unverified` for exactly this reason and the caller must show it.

   GATING. Tier and add-on are read the way /api/parcel reads them, from
   omega_orgs/{orgId}/billing/current, with toolOverrides winning either way.
   The planner is pure CPU with no upstream cost, so the gate is about who the
   tool is sold to, not about spend. Staff always pass.

   SIZE. A site object is small — a parcel ring, a few rectangles. The cap is
   here so a pathological polygon cannot turn one request into a long CPU burn
   on a shared serverless runtime; the planner has its own grid bounds and
   throws before searching when the study area is too large.
   ═══════════════════════════════════════════════════════════════════════════════ */
'use strict';
var A = require('./_lib/admin');
var planner = require('./_lib/site-agent-planner');

var TOOL_ID = 'site-plan';
/* Tiers that carry constrained layout. Mirrors the shape of REGRID_TIERS in
   /api/parcel: a list here, an override in Firestore, staff above both. */
var PLAN_TIERS = ['pro', 'enterprise'];
var PLAN_ADDON = 'autodesign';
var MAX_BODY_CHARS = 200000;
var MAX_PARCEL_VERTICES = 100;
var MAX_OBSTACLES = 200;

function entitled(bill) {
  var b = bill || {};
  var ov = b.toolOverrides || {};
  if (ov[TOOL_ID] === false) return false;
  if (ov[TOOL_ID] === true) return true;
  if ((b.addons || []).indexOf(PLAN_ADDON) >= 0) return true;
  return PLAN_TIERS.indexOf(String(b.tier || '').toLowerCase()) >= 0;
}

function entitle(caller) {
  if (caller.staff) return Promise.resolve(true);
  /* Degraded mode (no service account) verifies identity but cannot read
     billing. /api/parcel falls back to its free sources; there is no free
     half of a layout, so this refuses rather than hand the method to an
     unentitled tenant because Firestore happened to be unreachable. */
  if (typeof A.isDegraded === 'function' && A.isDegraded())
    throw A.httpError(503, 'server has no Firestore credential; entitlement cannot be checked');
  return A.db().collection('omega_orgs').doc(caller.orgId).get().then(function (s) {
    var org = s.exists ? (s.data() || {}) : null;
    if (!org || (org.status || 'active') !== 'active') throw A.httpError(403, 'tenant is not active');
    return A.billingOf(caller.orgId).then(function (bill) {
      if (!entitled(bill)) throw A.httpError(403, 'constrained layout is not on this plan');
      return true;
    });
  });
}

/* Cheap shape checks before the planner sees it. The planner does the real
   validation — this only stops an object that would waste the call. */
function guard(site) {
  if (!site || typeof site !== 'object' || Array.isArray(site))
    throw A.httpError(400, 'site must be an object; see scripts/site-agent/example-site.json');
  var size;
  try { size = JSON.stringify(site).length; } catch (e) { throw A.httpError(400, 'site is not serialisable'); }
  if (size > MAX_BODY_CHARS) throw A.httpError(400, 'site object is too large');
  if (Array.isArray(site.parcel) && site.parcel.length > MAX_PARCEL_VERTICES)
    throw A.httpError(400, 'parcel polygon has more than ' + MAX_PARCEL_VERTICES + ' vertices');
  if (Array.isArray(site.obstacles) && site.obstacles.length > MAX_OBSTACLES)
    throw A.httpError(400, 'more than ' + MAX_OBSTACLES + ' obstacles');
}

module.exports = A.handler(function (req) {
  if (req.method !== 'POST') throw A.httpError(405, 'POST only');

  return A.authenticate(req).then(function (caller) {
    var b = req.body && typeof req.body === 'object' ? req.body : {};
    var site = b.site;
    guard(site);

    return entitle(caller).then(function () {
      var out;
      try {
        out = planner.plan(site);
      } catch (e) {
        /* The planner throws for geometry it will not reason about: a
           self-intersecting parcel, a building outside it, a service offset
           with no wall left. That is the caller's input, so it is a 400 and
           the message is the planner's own — it names the thing to fix. */
        throw A.httpError(400, e.message || 'the site geometry could not be planned');
      }
      console.log('[site-plan]', caller.orgId, out.status,
        out.status === 'concept_ready' ? Math.round(out.layout.routeLengthFt) + ' ft route' :
        out.status === 'needs_input' ? out.missing.length + ' missing' : out.reason);
      return out;
    });
  });
});

module.exports._helpers = { entitled: entitled, guard: guard, PLAN_TIERS: PLAN_TIERS, PLAN_ADDON: PLAN_ADDON };
