/* ═══════════════════════════════════════════════════════════════════════════════
   /api/omega-core.js — qualify a charging site for Omega-Core skids
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   The editor's Output › Omega-Core posts what the project knows — the Run,
   the ROM, the drawing (chargers, service, transformer, skids placed), the
   evidence the browser fanned out for (Grid Atlas, Network Proximity, the
   parcel) and the rep's answers — and this answers with the three gates
   (power, location, fiber), how many skids, the host's land lease, what that
   does to the charging site, and the end-of-term terms.

   The model is api/_lib/omega-core.js. This file is the door, and it
   refuses what the button hides (CLAUDE.md: a hidden link is not a gate):

     · the caller's Firebase ID token (verify-token, no service account);
     · a packaged workspace must hold Omega Compute, the module that owns the
       button and the skid's placement (package-access.withToken);
     · a legacy plan must open the editor's compute cap — the tier ladder,
       the JV orgs, a live Omega Compute add-on — by the ONE legacy rule
       Helios Intake asks (addons.judge → canCap), and Site Map must be in the
       workspace's product and the member's tools;
     · a workspace pending, suspended or cancelled is refused; a missing
       omega_orgs record fails OPEN, as the editor gate does for every legacy
       tenant the seed has not reached;
     · either tool switch (omegacore, or the Compute Land Lease it extends)
       turned off refuses it.

   The card discipline is compute-lease's: the offer to every entitled
   caller, the build-up to staff only.

   GET is a health check: the build, the card's version, the gates. It
   never returns the lease card or the price.

   ENVIRONMENT VARIABLES — none. This function does no network I/O.
   ═══════════════════════════════════════════════════════════════════════════════ */
'use strict';

var auth = require('./_lib/verify-token');
var OC = require('./_lib/omega-core');
var CL = require('./compute-lease')._model;

/* The tool switches that turn it off: its own, and the Compute Land Lease
   it is a form of. */
var SWITCHES = ['omegacore', 'computelease'];
var CLOSED = ['pending', 'suspended', 'cancelled'];

/* A legacy plan (billed outside the packaging engine): the same questions the
   editor asks before it shows the button. Null means open. */
function legacyRefusal(orgId, bill, member) {
  bill = bill || {};
  var ov = bill.toolOverrides || {};
  for (var i = 0; i < SWITCHES.length; i++)
    if (ov[SWITCHES[i]] === false) return 'Omega-Core is switched off for this organisation.';
  if (ov.editor === false) return 'Site Map is switched off for this organisation.';
  if (member && member.status && member.status !== 'active') return 'Your membership of this workspace is not active.';
  if (Array.isArray(bill.toolAccess) && bill.toolAccess.indexOf('editor') < 0)
    return 'Site Map is not in this organisation\'s product.';
  if (member && Array.isArray(member.toolAccess) && member.toolAccess.indexOf('editor') < 0)
    return 'Your account does not include Site Map; ask your workspace admin for access.';
  var AD = require('./_lib/addons'), on = AD.live(bill, Date.now());
  if (on.indexOf('compute') >= 0) return null;
  var ctx = AD.judge(orgId, bill, on).ctx;
  /* Site Map itself must open on the plan: the button is in it (Helios asks the same) */
  var editor = !ctx.tool || !ctx.tool('editor') || !ctx.canOpen || ctx.canOpen('editor');
  if (!editor) return 'Site Map is not in this workspace\'s product.';
  if (typeof ctx.canCap === 'function' && ctx.canCap('compute') === true) return null;
  return 'Omega-Core is part of Omega Compute, which this plan does not include (Modules › Opt in).';
}

module.exports = function (req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true, build: OC.BUILD, model: 'omega-core-v1',
      rateCard: { version: OC.RATE_CARD.version, asOf: OC.RATE_CARD.asOf },
      product: { name: OC.PRODUCT.name, computeKw: OC.PRODUCT.compute.kw, batteryKwh: OC.PRODUCT.battery.kwh,
                 batteryKw: OC.PRODUCT.battery.kw, skidIn: OC.PRODUCT.skid.lengthIn + ' x ' + OC.PRODUCT.skid.depthIn },
      gates: ['power', 'location', 'fiber (hard gate)'],
      body: 'POST { site:{name,address,lat,lng}, drawing:{units,chargers,service,xfmrKva,dcLoadKw,buildingKw}, '
          + 'run:{capex,incentive,netCost,annualRevenue,at,stale}, evidence:{gridAtlas,network,parcel,fiberOnFile}, rep:{...} }'
    });
  }
  if (req.method !== 'POST') return res.status(405).json({ build: OC.BUILD, error: 'GET or POST.' });
  return auth.authenticateWithTier(req).then(function (ctx) {
    /* the button is in Site Map: a packaged member must hold the editor itself */
    return require('./_lib/package-access').withToken(req, ctx, 'compute', { tools: ['editor'] })
      .then(null, function (e) {
        /* a Firestore read that failed (502) is try-again; a package that
           refuses (403) says why */
        if (e && e.status === 502) throw auth.httpError(503, 'Could not check access to Omega-Core right now; try again in a minute.');
        throw e;
      });
  }).then(function (a) {
    var token = String(req.headers.authorization || '').replace(/^Bearer /, '');
    var base = 'omega_orgs/' + encodeURIComponent(a.caller.orgId);
    /* Staff skip the entitlement checks, not the org read (the brand). */
    if (a.caller.staff) {
      return auth.readAsCaller(token, base)
        .then(function (org) { a.org = org || null; return a; },
              function () { a.org = null; return a; });
    }
    return Promise.all([
      auth.readAsCaller(token, base),
      auth.readAsCaller(token, base + '/members/' + encodeURIComponent(a.caller.uid))
    ]).then(function (items) {
      var org = items[0] || null, member = items[1] || null;
      if (org && CLOSED.indexOf(org.status) >= 0)
        throw auth.httpError(403, org.status === 'pending'
          ? 'This workspace is still being set up; Omega-Core opens once it is approved.'
          : 'This workspace is ' + org.status + ', so Omega-Core is unavailable.');
      if (!a.packageAccess) {
        var why = legacyRefusal(a.caller.orgId, a.billing, member);
        if (why) throw auth.httpError(403, why);
      }
      a.org = org;
      return a;
    }, function () {
      /* any failed read is "try again", never a pass and never its raw text */
      throw auth.httpError(503, 'Could not check access to Omega-Core right now; try again in a minute.');
    });
  }).then(function (a) {
    var body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
    body = (body && typeof body === 'object' && !Array.isArray(body)) ? body : {};
    if (!body.rep || typeof body.rep !== 'object')
      throw auth.httpError(400, 'rep:{} is required — the answers the rep captured. Send {} for a site with '
        + 'nothing known and every gate comes back unconfirmed, which is the honest answer.');
    return res.status(200).json(OC.evaluate(body, {
      disclose: !!(a && a.caller && a.caller.staff),
      brand: CL.brandOf(a && a.org)
    }));
  }).catch(function (e) {
    return res.status(e.status || 500).json({
      build: OC.BUILD,
      error: e.status ? e.message : 'Omega-Core qualification failed.',
      detail: e.status ? undefined : String((e && e.message) || e).slice(0, 300)
    });
  });
};

module.exports._model = OC;
module.exports._gate = { legacyRefusal: legacyRefusal, SWITCHES: SWITCHES, CLOSED: CLOSED };
