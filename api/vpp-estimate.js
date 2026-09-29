/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
/* ═══════════════════════════════════════════════════════════════════════════
   api/vpp-estimate.js — VPP earnings, one door (the VPP Earnings Simulator,
   and the editor's Analyze › VPP Earnings, read it)

   GET  → deployed? which simulation, is a live provider connected. No auth,
          no numbers.
   POST { action:'options' }            → site types, markets, default split
   POST { action:'estimate', site:{…} } → api/_lib/vpp-provider.js: the
          simulation (api/_lib/vpp-sim.js), plus a DividendVPP quote beside
          it once their API is connected

   The value-stack math is the IP (CLAUDE.md, "where logic lives"): the page
   collects the ZIP, site, battery and load, posts, and draws what comes
   back. Rates and programme figures never reach the browser except as the
   streams of a result.

   THE GATE is api/proforma.js's, on verify-token (no service account):
   a missing omega_orgs record is allowed (legacy tenants have none); an
   explicit pending/suspended/cancelled refuses; billing.toolAccess and
   member.toolAccess are allowlists that intersect, absent ≠ empty;
   toolOverrides.vppsim false refuses, true lifts the tier; a packaged
   workspace needs the Storage module (package-access.requireModule); a read
   that throws is 503, never a pass.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var auth = require('./_lib/verify-token');
var provider = require('./_lib/vpp-provider');
var SIM = require('./_lib/vpp-sim');

var TOOL_KEY = 'vppsim';
var ACTIONS = ['options', 'estimate'];
var TIERS = ['trial', 'standard', 'pro', 'deluxe', 'enterprise', 'partner', 'internal'];
var CLOSED = ['pending', 'suspended', 'cancelled'];
var FAILED = 'The VPP estimate could not run; check the inputs and retry.';

function refusal(bill, member) {
  bill = bill || {};
  var ov = bill.toolOverrides || {};
  if (ov[TOOL_KEY] === false) return 'The VPP Earnings Simulator is switched off for this organisation.';
  if (member && member.status && member.status !== 'active') return 'Your membership of this workspace is not active.';
  if (Array.isArray(bill.toolAccess) && bill.toolAccess.indexOf(TOOL_KEY) < 0)
    return 'The VPP Earnings Simulator is not in this organisation\'s product.';
  if (member && Array.isArray(member.toolAccess) && member.toolAccess.indexOf(TOOL_KEY) < 0)
    return 'Your account does not include the VPP Earnings Simulator; ask your workspace admin for access.';
  var tier = bill.tier || 'trial';
  if (ov[TOOL_KEY] !== true && TIERS.indexOf(tier) < 0)
    return 'The VPP Earnings Simulator is not included in this plan.';
  return null;
}

function bearer(req) {
  var m = /^Bearer (.+)$/.exec((req.headers && req.headers.authorization) || '');
  return m ? m[1] : null;
}

function gate(req) {
  var token = bearer(req);
  if (!token) return Promise.reject(auth.httpError(401, 'Sign in to run a VPP estimate.'));
  return auth.verifyIdToken(token).then(function (caller) {
    if (!caller.orgId) throw auth.httpError(403, 'That account has no organisation.');
    if (caller.staff) return { caller: caller };
    var base = 'omega_orgs/' + encodeURIComponent(caller.orgId);
    return Promise.all([
      auth.readAsCaller(token, base),
      auth.readAsCaller(token, base + '/billing/current'),
      auth.readAsCaller(token, base + '/members/' + encodeURIComponent(caller.uid))
    ]).then(function (r) {
      var org = r[0] || null;
      if (org && CLOSED.indexOf(org.status) >= 0) {
        throw auth.httpError(403, org.status === 'pending'
          ? 'This workspace is still being set up; the simulator opens once it is approved.'
          : 'This workspace is ' + org.status + ', so the simulator is unavailable.');
      }
      var access = require('./_lib/package-access');
      var projection = access.project(caller, r[1], org, r[2], Date.now());
      access.requireModule(projection, 'storage', { tools: [TOOL_KEY] });
      var why = projection.packaged ? null : refusal(r[1], r[2]);
      if (why) throw auth.httpError(403, why);
      return { caller: caller };
    }, function () {
      throw auth.httpError(503, 'Could not check access to the simulator right now; try again in a minute.');
    });
  });
}

function bodyOf(req) {
  var b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { return null; } }
  return (b && typeof b === 'object' && !Array.isArray(b)) ? b : null;
}

module.exports = function (req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method === 'GET') return res.status(200).json({ ok: true, provider: provider.describe() });
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok: false, error: 'GET or POST.' });
  }
  var action = '';
  return gate(req).then(function () {
    var body = bodyOf(req);
    if (!body) throw auth.httpError(400, 'Send a JSON object with an action.');
    action = typeof body.action === 'string' ? body.action : '';
    if (ACTIONS.indexOf(action) < 0) throw auth.httpError(400, 'action must be one of: ' + ACTIONS.join(', ') + '.');
    if (action === 'options') return res.status(200).json({ ok: true, options: SIM.options(), provider: provider.describe() });
    return provider.estimate(body.site).then(function (out) {
      if (!out || out.ok === false) {
        return res.status(400).json({ ok: false, errors: (out && out.errors) || [] });
      }
      return res.status(200).json({ ok: true, result: out });
    });
  }).catch(function (e) {
    var status = e && e.status;
    if (!status) {
      console.error('[vpp-estimate] ' + (action || 'request') + ' failed:', (e && e.stack) || e);
      return res.status(500).json({ ok: false, error: FAILED });
    }
    return res.status(status).json({ ok: false, error: e.message });
  });
};

module.exports._gate = { refusal: refusal };
