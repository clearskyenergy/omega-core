/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
/* ═══════════════════════════════════════════════════════════════════════════
   api/value-stack.js — the editor's Value Stack, one door

   GET  → deployed? version. No auth, no numbers.
   POST { action:'estimate', site, battery, solarKw, load, tariff, split,
          performance, cost, finance }
        → the full value-stack report for the system DRAWN on the site map:
          the dispatch-constrained annual stack, the incentives, and a
          20-year unlevered pre-tax IRR against the project's own cost.

   WHAT RUNS WHERE (CLAUDE.md, "where logic lives"). The rates, programmes,
   tariffs and dispatch are the IP and never reach a browser except as the
   streams of a result:
     - the annual stack is api/_lib/vpp-sim.js simulate() — the ONE
       hour-by-hour dispatch against the ONE tariff engine (bess-tariff.js),
       with the grid programmes open at the ZIP and PJM capacity through
       value-stack.js. This endpoint adds NO second copy of any rate.
     - incentives are value-stack.js incentives() (ITC; the ComEd rebate
       with its two conditions when the site is in ComEd territory).
     - the lifecycle and IRR are value-stack.js lifecycle() on the finance
       engine's own irr/payback (proforma-engine.js).
     - a missing project cost falls back to the ONE cost model
       (cost-model.js) at generic rates, and the result SAYS so.

   WHERE IS THE SITE. The editor sends what the map knows, in this order of
   preference: a ZIP, the address in the search box, the map centre. An
   address is geocoded (Census, then Nominatim — api/_lib/geocode.js); a
   bare point is reverse-geocoded to its state and ZCTA (Census). The
   response names which one answered, because "the ZIP you typed" and "the
   ZCTA under the map centre" deserve different trust.

   THE GATE is api/vpp-estimate.js's, on verify-token (no service account),
   keyed on the EDITOR: a missing omega_orgs record is allowed (legacy
   tenants have none); explicit pending/suspended/cancelled refuses;
   billing.toolAccess and member.toolAccess are allowlists that intersect,
   absent ≠ empty; toolOverrides.editor false refuses, true lifts the tier;
   a packaged workspace needs Omega Design (lite), which every package
   holds; a read that throws is 503, never a pass.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var auth = require('./_lib/verify-token');
var SIM = require('./_lib/vpp-sim');
var V = require('./_lib/value-stack');
var CM = require('./_lib/cost-model.js');
var GEO = require('./_lib/geocode');

var VERSION = 'value-stack-1';
var TOOL_KEY = 'editor';
var ACTIONS = ['estimate'];
var TIERS = ['trial', 'standard', 'pro', 'deluxe', 'enterprise', 'partner', 'internal'];
var CLOSED = ['pending', 'suspended', 'cancelled'];
var FAILED = 'The value stack could not run; check the inputs and retry.';

function refusal(bill, member) {
  bill = bill || {};
  var ov = bill.toolOverrides || {};
  if (ov[TOOL_KEY] === false) return 'The site designer is switched off for this organisation.';
  if (member && member.status && member.status !== 'active') return 'Your membership of this workspace is not active.';
  if (Array.isArray(bill.toolAccess) && bill.toolAccess.indexOf(TOOL_KEY) < 0)
    return 'The site designer is not in this organisation\'s product.';
  if (member && Array.isArray(member.toolAccess) && member.toolAccess.indexOf(TOOL_KEY) < 0)
    return 'Your account does not include the site designer; ask your workspace admin for access.';
  var tier = bill.tier || 'trial';
  if (ov[TOOL_KEY] !== true && TIERS.indexOf(tier) < 0)
    return 'The value stack is not included in this plan.';
  return null;
}

function bearer(req) {
  var m = /^Bearer (.+)$/.exec((req.headers && req.headers.authorization) || '');
  return m ? m[1] : null;
}

function gate(req) {
  var token = bearer(req);
  if (!token) return Promise.reject(auth.httpError(401, 'Sign in to run the value stack.'));
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
          ? 'This workspace is still being set up; the value stack opens once it is approved.'
          : 'This workspace is ' + org.status + ', so the value stack is unavailable.');
      }
      var access = require('./_lib/package-access');
      var projection = access.project(caller, r[1], org, r[2], Date.now());
      access.requireModule(projection, 'lite', { tools: [TOOL_KEY] });
      var why = projection.packaged ? null : refusal(r[1], r[2]);
      if (why) throw auth.httpError(403, why);
      return { caller: caller };
    }, function () {
      throw auth.httpError(503, 'Could not check access to the value stack right now; try again in a minute.');
    });
  });
}

function bodyOf(req) {
  var b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { return null; } }
  return (b && typeof b === 'object' && !Array.isArray(b)) ? b : null;
}

function num(v, d) { var n = Number(v); return (v == null || v === '' || !isFinite(n)) ? d : n; }
function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
function zipIn(text) {
  var m = /\b(\d{5})(?:-\d{4})?\b/.exec(String(text == null ? '' : text));
  return m ? m[1] : null;
}

/* ── WHERE: what the map knows → a ZIP, with its provenance ──────────────
   Resolves { zip, how, label } or { error }. `how` travels into the result
   so the report can say whether the market came from a typed ZIP, a
   geocoded address or the census geography under the map centre. */
function resolveZip(site) {
  site = site || {};
  var zip = zipIn(site.zip);
  if (zip) return Promise.resolve({ zip: zip, how: 'given', label: 'the ZIP given' });
  var addr = typeof site.address === 'string' ? site.address.trim() : '';
  var lat = num(site.lat, null), lng = num(site.lng, null);
  if (addr) {
    zip = zipIn(addr);
    if (zip) return Promise.resolve({ zip: zip, how: 'address', label: 'the ZIP in the site address' });
    return GEO.geocode(addr).then(function (hit) {
      var z = hit && zipIn(hit.matched);
      if (z) return { zip: z, how: 'geocoded', label: 'the address, geocoded (' + hit.source + ')' };
      if (hit && isFinite(hit.lat) && isFinite(hit.lng)) return fromPoint(hit.lat, hit.lng);
      if (lat != null && lng != null) return fromPoint(lat, lng);
      return { error: 'That address could not be placed. Add the ZIP to it, or move the map to the site.' };
    });
  }
  if (lat != null && lng != null) return fromPoint(lat, lng);
  return Promise.resolve({ error: 'Where is the site? Send a ZIP, the address, or the map position.' });
}
function fromPoint(lat, lng) {
  return GEO.reverse(lat, lng).then(function (hit) {
    if (hit && hit.zip) {
      return { zip: hit.zip, how: 'map', state: hit.state || null, county: hit.county || null,
               label: 'the census ZCTA under the map position' };
    }
    return { error: 'The map position did not resolve to a US ZIP. Type the site\'s ZIP.' };
  });
}

/* ── THE COST. The run's own total when the editor has one; the generic
   model otherwise — never a blank IRR and never a silent guess. ───────── */
function costOf(body, bat) {
  var c = (body.cost && typeof body.cost === 'object' && !Array.isArray(body.cost)) ? body.cost : {};
  var capex = num(c.capexUsd, null);
  if (capex != null && capex > 0 && capex <= 1e10) {
    return {
      capexUsd: capex,
      source: c.contracted === true ? 'contracted' : 'site-map',
      note: c.contracted === true
        ? 'A contracted price, as entered on the cost sheet.'
        : 'The Site Map run\'s own Total install for this drawing.'
    };
  }
  var hours = bat.kwh / bat.kw;
  var r = CM.price({ kw: bat.kw, hours: hours });
  if (!r || !r.total || !isFinite(r.total.base) || r.total.base <= 0) {
    return { capexUsd: null, source: 'none',
             note: 'No project cost: the run has not priced this site and the model could not either. The IRR is withheld rather than guessed.' };
  }
  return {
    capexUsd: r.total.base,
    source: 'model',
    note: 'No priced run on this drawing yet, so this is the cost model\'s GENERIC estimate for '
        + Math.round(bat.kw).toLocaleString() + ' kW / ' + (Math.round(hours * 10) / 10)
        + ' h (api/_lib/cost-model.js). Run the cost sheet for this site\'s own figure.'
  };
}

/* The owner's year-1 dollars per counted stream, classified for the
   lifecycle: bill streams are the customer's in full and ride the tariff;
   grid-programme earnings are shared with the operator and held flat. */
function ownerStreams(sim) {
  var out = [], i;
  var keep = (sim.split && isFinite(sim.split.owner)) ? sim.split.owner : 1;
  for (i = 0; i < sim.streams.length; i++) {
    var s = sim.streams[i];
    if (!s.counted || !(s.usd > 0)) continue;
    if (s.category === 'bill') {
      out.push({ id: s.id, name: s.name, usd: s.usd, tier: s.tier,
                 basis: s.id === 'bill.tou' ? 'energy' : 'power', escalates: true });
    } else {
      out.push({ id: s.id, name: s.name, usd: s.usd * keep, tier: s.tier, basis: 'power', escalates: false });
    }
  }
  return out;
}

function estimate(body) {
  var site = (body.site && typeof body.site === 'object' && !Array.isArray(body.site)) ? body.site : {};
  var b0 = (body.battery && typeof body.battery === 'object' && !Array.isArray(body.battery)) ? body.battery : {};
  var kw = num(b0.kw, null), kwh = num(b0.kwh, null);
  if (!(kw > 0) || !(kwh > 0)) {
    return Promise.resolve({ status: 400, body: { ok: false, errors: [{ field: 'battery',
      message: 'No battery on the site map. Place a BESS assembly or container first — this reads the system you have actually drawn, not a hypothetical one.' }] } });
  }
  return resolveZip(site).then(function (where) {
    if (where.error) {
      return { status: 400, body: { ok: false, errors: [{ field: 'site', message: where.error }] } };
    }
    var simInput = {
      zip: where.zip,
      segment: site.segment,
      market: site.market,
      battery: { kw: kw, kwh: kwh, rte: b0.rte },
      solarKw: body.solarKw,
      load: body.load,
      tariff: body.tariff,
      split: body.split,
      performance: body.performance
    };
    var sim = SIM.simulate(simInput);
    if (!sim.ok) return { status: 400, body: { ok: false, errors: sim.errors || [] } };

    var fin = (body.finance && typeof body.finance === 'object' && !Array.isArray(body.finance)) ? body.finance : {};
    var loc = SIM.locate(where.zip);
    var bat = { kw: kw, kwh: kwh };
    var cost = costOf(body, bat);

    var incentives = null, netCostUsd = null, lifecycle = null, lifecycleBankable = null;
    if (cost.capexUsd > 0) {
      var itcRate = clamp(num(fin.itcRate, 0.30), 0, 0.5);
      var rebatePerKwh = num(fin.rebatePerKwh, null);
      var incIn = { capexUsd: cost.capexUsd, kwh: kwh, itcRate: itcRate };
      if (rebatePerKwh != null && rebatePerKwh >= 0) {
        if (rebatePerKwh > 0) {
          incIn.rebatePerKwh = clamp(rebatePerKwh, 0, 1000);
          incIn.rebateName = typeof fin.rebateName === 'string' ? fin.rebateName.slice(0, 120) : 'Utility rebate';
          if (typeof fin.rebateRef === 'string') incIn.rebateRef = fin.rebateRef.slice(0, 500);
        }
      } else if (loc.ok && loc.comed) {
        incIn.rebatePerKwh = V.COMED_REBATE.perKwh;
        incIn.rebateName = 'ComEd storage rebate';
      }
      incentives = V.incentives(incIn);
      netCostUsd = Math.max(0, cost.capexUsd - incentives.total);
      var lcInput = function (streams) {
        return {
          capexUsd: cost.capexUsd,
          incentiveUsd: incentives.total,
          streams: streams,
          kwh: kwh,
          years: fin.years, omUsdYear: fin.omUsdYear, omPctOfCapex: fin.omPctOfCapex,
          omEscalation: fin.omEscalation, billEscalation: fin.billEscalation,
          energyFadePct: fin.energyFadePct, powerFadePct: fin.powerFadePct,
          augmentAtPct: fin.augmentAtPct, augmentCostPerKwh: fin.augmentCostPerKwh,
          discountRate: fin.discountRate
        };
      };
      var all = ownerStreams(sim);
      lifecycle = V.lifecycle(lcInput(all));
      /* The investor's case: only rates that are computed from this site's
         tariff or published by the programme — a planning figure is a lead,
         not collateral. Same cost, same incentives, so the two IRRs differ
         by exactly what the planning-grade streams claim. */
      lifecycleBankable = V.lifecycle(lcInput(all.filter(function (s) { return s.tier !== 'planning'; })));
    }
    var bank = V.bankability(sim.streams, sim.split);

    /* Built key by key, the embed-config discipline: a field somebody adds
       to the simulation next year does not ride out of here unreviewed —
       though here the sim is ours and already browser-safe, the habit is
       what keeps it that way. */
    var result = {
      ok: true, version: VERSION, at: new Date().toISOString(),
      resolved: { zip: where.zip, how: where.how, label: where.label,
                  address: typeof site.address === 'string' ? site.address.slice(0, 300) : null,
                  area: loc.ok ? loc.area : null },
      site: sim.site, load: sim.load, solar: sim.solar, battery: sim.battery,
      tariff: sim.tariff, bill: sim.bill,
      streams: sim.streams, missing: sim.missing, totals: sim.totals,
      split: sim.split, monthly: sim.monthly, sampleDay: sim.sampleDay,
      confidence: sim.confidence,
      cost: cost,
      incentives: incentives,
      netCostUsd: netCostUsd,
      lifecycle: lifecycle,
      bankability: {
        rows: bank.rows, totals: bank.totals, contracts: bank.contracts,
        lifecycle: lifecycleBankable,
        note: 'A saving is not revenue until a contract makes it one. Host streams become the ' +
              'project\'s income under an energy services / shared-savings agreement; programme ' +
              'streams pay through the counterparty named on each row. The bankable case counts ' +
              'computed and published rates only — planning figures are excluded until the ' +
              'programme\'s own terms replace them.'
      },
      disclaimer: 'Planning grade. The stack is a dispatch-constrained simulation on ' +
        (sim.tariff && sim.tariff.source === 'planning' ? 'a regional planning tariff' : 'the tariff given') +
        '; the IRR is unlevered and pre-tax. Programme terms, this customer\'s tariff and the Pro Forma replace it before a customer signs anything.'
    };
    return { status: 200, body: { ok: true, result: result } };
  });
}

module.exports = function (req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method === 'GET') return res.status(200).json({ ok: true, version: VERSION });
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
    return estimate(body).then(function (out) {
      return res.status(out.status).json(out.body);
    });
  }).catch(function (e) {
    var status = e && e.status;
    if (!status) {
      console.error('[value-stack] ' + (action || 'request') + ' failed:', (e && e.stack) || e);
      return res.status(500).json({ ok: false, error: FAILED });
    }
    return res.status(status).json({ ok: false, error: e.message });
  });
};

module.exports._helpers = { refusal: refusal, resolveZip: resolveZip, costOf: costOf, ownerStreams: ownerStreams };
