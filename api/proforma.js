/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
/* ═══════════════════════════════════════════════════════════════════════════
   api/proforma.js — the BESS Pro Forma's one door to the server

   GET  → which engines are deployed. No auth, no numbers.
   POST { action:'context' }            → the caller's brand, the engine's
                                          defaults and the state tax table
   POST { action:'size',  sizing:{…} }  → _lib/proforma-sizing.js, the
                                          bridge to the ONE sizing engine
   POST { action:'model', inputs:{…} }  → _lib/proforma-engine.js, the
                                          SAM single-owner cash flow
   POST { action:'site', address:{…} }  → _lib/site-lookup.js: state tax,
                                          energy community, low income,
                                          PVWatts and URDB for one address

   WHY IT IS ONE ENDPOINT. The investor math is the thing being protected
   (CLAUDE.md, "where logic lives"): proforma.html collects inputs and
   renders what comes back, and every figure on the deck came through here.
   One gate in front of all three actions means a tenant who may not size a
   battery may not price one either, and there is one place to read it.

   THE GATE is api/listings.js's, on verify-token rather than admin.js so it
   runs without a service account (and in CI without firebase-admin):
   - A MISSING omega_orgs record is allowed. Every legacy tenant has none
     until the seed runs; tenantActive() in the rules and the editor gate
     read absence as active for the same reason, and getting it backwards
     locks out every paying customer. An EXPLICIT pending, suspended or
     cancelled refuses.
   - ABSENT IS NOT EMPTY. billing.toolAccess and member.toolAccess are
     allowlists that INTERSECT: null means "whatever the plan includes"; a
     present array is authoritative at any length, [] included. A member
     list narrows the product and never widens it.
   - toolOverrides.proforma === false refuses; === true lifts the tier
     check and nothing else — an allowlist still wins over it.
   - Staff skip the entitlement checks, not the brand: a ClearSky rep's deck
     carries ClearSky's brand by the same path a tenant's carries theirs.
   - A read that THROWS is 503, never a pass. That is why billing is read
     here and not taken from authenticateWithTier(), which answers a failed
     billing read with an empty record — and an empty record has no
     toolAccess, so a two-tool tenant would briefly own all of them.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var auth = require('./_lib/verify-token');
var WL = require('./_lib/whitelabel');
var engine = require('./_lib/proforma-engine');
var sizing = require('./_lib/proforma-sizing');
var site = require('./_lib/site-lookup');

var TOOL_KEY = 'proforma';
var SIZING_ENGINE = 'battery-tool-engine';
var ACTIONS = ['context', 'size', 'model', 'site'];
/* Every paid plan, and the trial. An unrecognised tier is a data-entry
   mistake on billing/current, and a mistake must not hand out a tool. */
var TIERS = ['trial', 'standard', 'pro', 'deluxe', 'enterprise', 'partner', 'internal'];
var CLOSED = ['pending', 'suspended', 'cancelled'];
var PLATFORM = 'ClearSky-OMEGA';
var FAILED = 'The pro forma could not run; check the inputs and retry.';

/* ── entitlement ─────────────────────────────────────────────────────────── */

/* billing/current + members/{uid} → why this caller may not use the pro
   forma, or null when they may. Order matters only for the message. */
function refusal(bill, member) {
  bill = bill || {};
  var ov = bill.toolOverrides || {};
  if (ov[TOOL_KEY] === false) return 'The BESS Pro Forma is switched off for this organisation.';
  if (member && member.status && member.status !== 'active')
    return 'Your membership of this workspace is not active.';
  if (Array.isArray(bill.toolAccess) && bill.toolAccess.indexOf(TOOL_KEY) < 0)
    return 'The BESS Pro Forma is not in this organisation\'s product.';
  if (member && Array.isArray(member.toolAccess) && member.toolAccess.indexOf(TOOL_KEY) < 0)
    return 'Your account does not include the BESS Pro Forma; ask your workspace admin for access.';
  var tier = bill.tier || 'trial';
  if (ov[TOOL_KEY] !== true && TIERS.indexOf(tier) < 0)
    return 'The BESS Pro Forma is not included in the ' + text(tier, 40) + ' plan.';
  return null;
}
function toolAllowed(bill, member) { return refusal(bill, member) === null; }

function closedMessage(status) {
  return status === 'pending'
    ? 'This workspace is still being set up; the pro forma opens once it is approved.'
    : 'This workspace is ' + status + ', so the pro forma is unavailable.';
}

function bearer(req) {
  var m = /^Bearer (.+)$/.exec((req.headers && req.headers.authorization) || '');
  return m ? m[1] : null;
}

/* Resolves { caller, org } or rejects with an httpError. Every read goes
   out AS THE CALLER, so firestore.rules still decide what they can see. */
function gate(req) {
  var token = bearer(req);
  if (!token) return Promise.reject(auth.httpError(401, 'Sign in to use the pro forma.'));
  return auth.verifyIdToken(token).then(function (caller) {
    if (!caller.orgId) throw auth.httpError(403, 'That account has no organisation.');
    var base = 'omega_orgs/' + encodeURIComponent(caller.orgId);

    /* For staff the org is read for the brand only, best-effort: a branding
       read must not be able to fail a support session. */
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
      if (org && CLOSED.indexOf(org.status) >= 0) throw auth.httpError(403, closedMessage(org.status));
      var why = refusal(r[1], r[2]);
      if (why) throw auth.httpError(403, why);
      return { caller: caller, org: org };
    }, function () {
      throw auth.httpError(503, 'Could not check access to the pro forma right now; try again in a minute.');
    });
  });
}

/* ── brand ───────────────────────────────────────────────────────────────── */

function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
/* Stored strings reach a printed deck: control characters out, length
   capped, anything that is not a string or a number treated as unset. */
function text(v, max) {
  if (typeof v !== 'string' && typeof v !== 'number') return '';
  return String(v).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/^\s+|\s+$/g, '').slice(0, max);
}
function hex(v) {
  var m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text(v, 16));
  if (!m) return null;
  var h = m[1];
  if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
  return '#' + h.toUpperCase();
}
/* An https URL or a same-origin path, nothing else. Not http (a mixed-
   content hole in a printed deck), not data: or javascript:, and not
   '//host' or '/\host', which a browser reads as another origin. */
function safeUrl(v) {
  var s = text(v, 2048);
  if (/^https:\/\/[^\s"'<>\\]+$/i.test(s)) return s;
  if (/^\/(?!\/)[^\s"'<>\\]*$/.test(s)) return s;
  return '';
}

/* omega_orgs/{orgId} → the brand a deck is drawn with. Read from the
   CALLER's own record only, so the client on the deck is whoever produced
   it and no tenant is ever a default.
   - The logo is the first usable one of exportBrand.logo, exportBrand.logoUrl
     and the org logo: an export logo that fails the URL check falls back to
     the tenant's own mark rather than to none.
   - colors are org.colors, each hex-checked. exportBrand.accent fills an
     unset primary, since exportBrand is the tenant's own statement of how
     their documents look; it never overrides colors that are set.
   - attribution and platformName follow the white-label contract through
     api/_lib/whitelabel.js, the one server-side copy of that rule. */
function brandOf(org, orgId) {
  org = isObj(org) ? org : {};
  var eb = isObj(org.exportBrand) ? org.exportBrand : {};
  var c = isObj(org.colors) ? org.colors : {};
  var wl = isObj(org.whiteLabel) ? org.whiteLabel : null;
  var colors = { primary: hex(c.primary) || hex(eb.accent), accent: hex(c.accent), ink: hex(c.ink) };
  var logos = [eb.logo, eb.logoUrl, org.logoUrl], logoUrl = '', i;
  for (i = 0; i < logos.length && !logoUrl; i++) logoUrl = safeUrl(logos[i]);
  var platformName = WL.isOn(wl) ? text(wl.platformName, 80) : '';
  return {
    name: text(eb.name, 120) || text(org.name, 120) || text(orgId, 120),
    logoUrl: logoUrl,
    colors: colors.primary || colors.accent || colors.ink ? colors : null,
    tagline: text(eb.tagline, 160),
    attribution: WL.attributionLine(wl),
    platformName: platformName || PLATFORM
  };
}

/* ── handler ─────────────────────────────────────────────────────────────── */

/* Vercel parses a JSON body into an object; a text/plain POST arrives as a
   string. Either is accepted; anything else is not a request. */
function bodyOf(req) {
  var b = req.body;
  if (typeof b === 'string') {
    try { b = JSON.parse(b); } catch (e) { return null; }
  }
  return isObj(b) ? b : null;
}

module.exports = function (req, res) {
  res.setHeader('Cache-Control', 'private, no-store');

  /* "Is it deployed, and which engines?" answerable from an address bar.
     No defaults, no tables: those are behind the gate with everything else. */
  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, build: engine.VERSION,
      engines: { finance: engine.VERSION, sizing: SIZING_ENGINE } });
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok: false, error: 'GET or POST.' });
  }

  var action = '';
  /* The gate runs before the body is looked at, so a caller who may not
     use the pro forma learns nothing about what it accepts. */
  return gate(req).then(function (g) {
    var body = bodyOf(req);
    if (!body) throw auth.httpError(400, 'Send a JSON object with an action.');
    action = typeof body.action === 'string' ? body.action : '';
    if (ACTIONS.indexOf(action) < 0)
      throw auth.httpError(400, 'action must be one of: ' + ACTIONS.join(', ') + '.');

    if (action === 'context') {
      return res.status(200).json({
        ok: true,
        orgId: g.caller.orgId,
        brand: brandOf(g.org, g.caller.orgId),
        defaults: engine.defaults(),
        stateTax: engine.STATE_TAX
      });
    }

    /* A load or tariff the engine cannot size is unprocessable, not a
       fault: 422 with the bridge's reason and the request path it names,
       the answer /api/bess-size gives for the same data. */
    if (action === 'size') {
      var sized = sizing.size(body.sizing);
      if (!sized || sized.ok === false) {
        return res.status(422).json({ ok: false,
          error: (sized && sized.error) || 'Could not size from this data.',
          field: (sized && sized.field) || null });
      }
      return res.status(200).json({ ok: true, sizing: sized });
    }

    /* Public-data facts for one address. Behind the same gate because it
       spends the platform's API quota; each source fails into its own
       errors entry, so only a request that cannot be looked up is a 400.
       The body may carry the user's own API keys: it is never logged. */
    if (action === 'site') {
      return site.lookup(body).then(function (found) {
        if (!found || found.ok === false) {
          return res.status(400).json({ ok: false,
            error: (found && found.error) || 'Send the site address.',
            field: (found && found.field) || 'address' });
        }
        return res.status(200).json(found);
      });
    }

    /* The engine collects every input error in one pass, so the page can
       mark all of them at once rather than one per round trip. */
    var result = engine.run(body.inputs);
    if (!result || result.ok === false) {
      return res.status(400).json({ ok: false,
        errors: (result && Array.isArray(result.errors)) ? result.errors : [] });
    }
    return res.status(200).json({ ok: true, result: result });
  }).catch(function (e) {
    var status = e && e.status;
    if (!status) {
      /* The stack goes to the function log, never to the browser. */
      console.error('[proforma] ' + (action || 'request') + ' failed:', (e && e.stack) || e);
      return res.status(500).json({ ok: false, error: FAILED });
    }
    return res.status(status).json({ ok: false, error: e.message });
  });
};

/* For scripts/tests/tproformaapi.js: the gate's pure decisions, testable
   with no token and no network. */
module.exports._gate = { toolAllowed: toolAllowed, brandOf: brandOf };
