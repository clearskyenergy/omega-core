/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
/* ═══════════════════════════════════════════════════════════════════════════
   api/compute-proforma.js — the Compute Site Pro Forma's one door (the
   page compute-proforma.html and the editor's Compute › Site Screen read it)

   GET  → deployed? which engines. No auth, no numbers.
   POST { action:'options' }            → GPU classes, charging patterns,
                                          structures, markets, the finance
                                          engine's defaults
   POST { action:'context' }            → the caller's brand, for the deck
   POST { action:'screen',   site:{…} } → the hour-by-hour load balance and
                                          the go / verify / hold verdict
   POST { action:'model',    site:{…} } → the screen plus the pro forma
                                          (api/_lib/proforma-engine.js) for
                                          the chosen structure, the other
                                          two side by side, sensitivities
   POST { action:'optimize', site:{…} } → pods × battery sizes, each a year
                                          of dispatch and a finance run
   POST { action:'portfolio', sites:[{id,name,at,input}], today } → the
                                          saved scenarios picked, each run as
                                          saved, the sum of their after-tax
                                          cash flows, what could not run and
                                          why, and the workbook (base64)
                                          (api/_lib/compute-portfolio.js)

   The load balance, the dispatch and the returns are the IP (CLAUDE.md,
   "where logic lives"): api/_lib/compute-site.js on the ONE tariff engine
   and the ONE finance engine. The page collects inputs, reads a file as
   text, posts and draws; nothing priced is computed in a browser.

   THE GATE is api/proforma.js's, on verify-token (no service account):
   a missing omega_orgs record is allowed (legacy tenants have none); an
   explicit pending/suspended/cancelled refuses; billing.toolAccess and
   member.toolAccess are allowlists that intersect, absent ≠ empty;
   toolOverrides.computeproforma false refuses, true lifts the tier; a
   packaged workspace needs Omega Compute ("Data center campus design,
   power and load screening", the October 2026 price book); a read that
   throws is 503, never a pass.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var auth = require('./_lib/verify-token');
var CS = require('./_lib/compute-site');
var CP = require('./_lib/compute-portfolio');
var PF = require('./_lib/proforma-engine');
var deckBrand = require('./_lib/deck-brand');

var TOOL_KEY = 'computeproforma';
var MODULE = 'compute';
var ACTIONS = ['options', 'context', 'screen', 'model', 'optimize', 'portfolio'];
var PORTFOLIO_BYTES = 4000000;
var TIERS = ['trial', 'standard', 'pro', 'deluxe', 'enterprise', 'partner', 'internal'];
var CLOSED = ['pending', 'suspended', 'cancelled'];
var PLATFORM = 'ClearSky-OMEGA';
var FAILED = 'The compute site model could not run; check the inputs and retry.';

function refusal(bill, member) {
  bill = bill || {};
  var ov = bill.toolOverrides || {};
  if (ov[TOOL_KEY] === false) return 'The Compute Site Pro Forma is switched off for this organisation.';
  if (member && member.status && member.status !== 'active') return 'Your membership of this workspace is not active.';
  if (Array.isArray(bill.toolAccess) && bill.toolAccess.indexOf(TOOL_KEY) < 0)
    return 'The Compute Site Pro Forma is not in this organisation\'s product.';
  if (member && Array.isArray(member.toolAccess) && member.toolAccess.indexOf(TOOL_KEY) < 0)
    return 'Your account does not include the Compute Site Pro Forma; ask your workspace admin for access.';
  var tier = bill.tier || 'trial';
  if (ov[TOOL_KEY] !== true && TIERS.indexOf(tier) < 0)
    return 'The Compute Site Pro Forma is not included in this plan.';
  return null;
}

function bearer(req) {
  var m = /^Bearer (.+)$/.exec((req.headers && req.headers.authorization) || '');
  return m ? m[1] : null;
}

function gate(req) {
  var token = bearer(req);
  if (!token) return Promise.reject(auth.httpError(401, 'Sign in to run the compute site model.'));
  return auth.verifyIdToken(token).then(function (caller) {
    if (!caller.orgId) throw auth.httpError(403, 'That account has no organisation.');
    var base = 'omega_orgs/' + encodeURIComponent(caller.orgId);
    if (caller.staff) {
      return auth.readAsCaller(token, base).then(
        function (org) { return { caller: caller, org: org || null }; },
        function () { return { caller: caller, org: null }; });
    }
    return Promise.all([
      auth.readAsCaller(token, base),
      auth.readAsCaller(token, base + '/billing/current'),
      auth.readAsCaller(token, base + '/members/' + encodeURIComponent(caller.uid))
    ]).then(function (r) {
      var org = r[0] || null;
      if (org && CLOSED.indexOf(org.status) >= 0) {
        throw auth.httpError(403, org.status === 'pending'
          ? 'This workspace is still being set up; the compute site model opens once it is approved.'
          : 'This workspace is ' + org.status + ', so the compute site model is unavailable.');
      }
      var access = require('./_lib/package-access');
      var projection = access.project(caller, r[1], org, r[2], Date.now());
      access.requireModule(projection, MODULE, { tools: [TOOL_KEY] });
      var why = projection.packaged ? null : refusal(r[1], r[2]);
      if (why) throw auth.httpError(403, why);
      return { caller: caller, org: org };
    }, function () {
      throw auth.httpError(503, 'Could not check access to the compute site model right now; try again in a minute.');
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
  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, engines: { site: CS.VERSION, finance: PF.VERSION } });
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok: false, error: 'GET or POST.' });
  }
  var action = '';
  return gate(req).then(function (g) {
    var body = bodyOf(req);
    if (!body) throw auth.httpError(400, 'Send a JSON object with an action.');
    action = typeof body.action === 'string' ? body.action : '';
    if (ACTIONS.indexOf(action) < 0) throw auth.httpError(400, 'action must be one of: ' + ACTIONS.join(', ') + '.');
    if (action === 'options') return res.status(200).json({ ok: true, options: CS.options() });
    if (action === 'context') {
      return res.status(200).json({ ok: true, orgId: g.caller.orgId, brand: deckBrand.brandOf(g.org, g.caller.orgId, PLATFORM) });
    }
    if (action === 'portfolio') return portfolio(res, g, body);
    var run = action === 'screen' ? CS.screen : action === 'optimize' ? CS.optimize : CS.model;
    var out = run(body.site);
    if (!out || out.ok === false) return res.status(400).json({ ok: false, errors: (out && out.errors) || [] });
    return res.status(200).json({ ok: true, result: out });
  }).catch(function (e) {
    var status = e && e.status;
    if (!status) {
      console.error('[compute-proforma] ' + (action || 'request') + ' failed:', (e && e.stack) || e);
      return res.status(500).json({ ok: false, error: FAILED });
    }
    return res.status(status).json({ ok: false, error: e.message });
  });
};

/* The date the workbook says it was prepared: the caller's own day when it
   sends one within a day of ours (a desk in California is a day behind UTC
   every evening), else today in UTC. */
function preparedDay(sent, now) {
  var today = new Date(now).toISOString().slice(0, 10);
  if (typeof sent !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(sent)) return today;
  var t = Date.parse(sent + 'T12:00:00Z');
  return isFinite(t) && Math.abs(t - now) <= 36 * 3600 * 1000 ? sent : today;
}

function portfolio(res, g, body) {
  var list = body.sites;
  if (!Array.isArray(list) || !list.length) return res.status(400).json({ ok: false, errors: [{ field: 'sites', message: 'Pick at least one saved scenario.' }] });
  if (JSON.stringify(list).length > PORTFOLIO_BYTES) {
    return res.status(413).json({ ok: false, error: 'Those scenarios are too large to run together; pick fewer.' });
  }
  var out = CP.run(list, { prepared: preparedDay(body.today, Date.now()), brand: deckBrand.brandOf(g.org, g.caller.orgId, PLATFORM) });
  if (!out || out.ok === false) return res.status(400).json({ ok: false, errors: (out && out.errors) || [] });
  return res.status(200).json({ ok: true, result: CP.forPage(out) });
}

module.exports._gate = { refusal: refusal, TOOL_KEY: TOOL_KEY, MODULE: MODULE };
module.exports._preparedDay = preparedDay;
