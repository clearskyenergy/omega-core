/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   POST /api/price-site: authenticated tenant pricing using server-only engines.
   Supplier/installer keys select stored tenant records; empty keys mean none.
   Browser rate overrides are ignored for non-staff. Outputs include price,
   sourcing, estimate class/accuracy and the existing ComEd/PJM screening scenario.
   See docs/sitefinder-server-config.md. */
'use strict';

var A  = require('./_lib/admin');
/* THE one cost model. Not a copy of it, not an import of its tables — the
   same file clearsky-cost-estimator.html and clearsky-sitefinder.html load in
   a browser. Its export tail does `module.exports = M` for exactly this. */
var CM = require('./_lib/cost-model.js');
var E = require('./_lib/embed');
var V = require('./_lib/value-stack.js');

/* The wire tag the site finder stamps on a cost result and checks on the way
   back in (clearsky-sitefinder.html:4665, `var COST_IN`). Repeated here
   because a protocol tag has to appear on both ends of the wire; it is a
   string constant, not a rule, and it is the only literal in this file that is
   also written down somewhere else on purpose. */
var COST_IN = 'clearsky.cost-estimate/1';

/* The tools that entitle a caller to a price. BOTH, not just the estimator:
   the site finder is a TIER.ALL tool and CLAUDE.md records it as "a read-only
   consumer of toolData/{org}/tools/costestimator". Gating this endpoint on
   `costestimator` alone would take inline pricing away from every tenant below
   the deluxe tier who has it working in the browser today. A caller is refused
   only when BOTH doors are shut to them. */
var TOOL_KEYS = ['sitefinder', 'costestimator'];

/* OWN KEYS ONLY. The model's driver tables are plain objects, so a bare
   `CM.SOIL[v]` answers truthily for 'constructor', 'toString' and every other
   name on Object.prototype. That is not a theoretical tidiness point: price()
   does `soilM = M.SOIL[input.soil] || 1.00`, so a body carrying
   soil:'constructor' would put a FUNCTION into a multiply and return a total
   of NaN — a classless, meaningless number, from the one endpoint that must
   never emit one. Every lookup against a driver table goes through here. */
function has(obj, k) {
  return !!obj && Object.prototype.hasOwnProperty.call(obj, k);
}


/* ── THE NINE DRIVERS ─────────────────────────────────────────────────────
   `label` is the exact string clearsky-sitefinder.html:5372 puts in its
   `unanswered` array, because renderCostBack() counts that array and the
   packet ships it verbatim. `field` is what this endpoint's caller sends.
   `answered` decides whether a value is a real answer; `dflt` says what the
   model did instead, read back out of the model rather than retyped.

   An UNRECOGNISED value is not an answer. Sending soil:'sandy' would price at
   the model's 1.00 fallback while looking answered, which is how an estimate
   quietly promotes its own class. Those land in `rejectedInputs` by name. */
function drivers(input, kwh) {
  var H = CM.helpers;
  return [
    { field: 'volt', label: 'interconnection voltage',
      answered: !!(input.volt && has(CM.VOLT, input.volt)),
      known: function (v) { return has(CM.VOLT, v); },
      dflt: function () {
        var V = CM.VOLT[''];
        return { multiplier: null, defaultedTo: V.label, factors: V.m };
      } },
    { field: 'poiFt', label: 'distance to the POI',
      answered: H.num(input.poiFt) != null && H.num(input.poiFt) >= 0,
      dflt: function () {
        return { multiplier: null,
                 defaultedTo: H.poi({ poiFt: null }) + ' ft of trench and cable' };
      } },
    { field: 'utilityUpgrade', label: 'utility-side upgrade',
      answered: !!(input.utilityUpgrade && has(CM.UPGRADE, input.utilityUpgrade)),
      known: function (v) { return has(CM.UPGRADE, v); },
      dflt: function () {
        var U = CM.UPGRADE[''];
        return { multiplier: null, defaultedTo: U.label,
                 /* Not folded into the total. Reported as an exposure by
                    price() when it is carried, and named here either way. */
                 exposureUsd: U.exposure || null };
      } },
    { field: 'padArea', label: 'equipment yard',
      answered: H.num(input.padArea) != null && H.num(input.padArea) > 0,
      dflt: function () {
        return { multiplier: null,
                 defaultedTo: (kwh == null ? null
                   : Math.round(H.pad({ kw: input.kw, hours: input.hours,
                                        padArea: null })).toLocaleString() +
                     ' sq ft, from the energy on site') };
      } },
    { field: 'soil', label: 'ground conditions',
      answered: !!(input.soil && has(CM.SOIL, input.soil)),
      known: function (v) { return has(CM.SOIL, v); },
      dflt: function () {
        return { multiplier: CM.SOIL[''], defaultedTo: CM.SOIL_LBL[''] };
      } },
    { field: 'ahj', label: 'AHJ',
      answered: !!(input.ahj && has(CM.AHJ, input.ahj)),
      known: function (v) { return has(CM.AHJ, v); },
      dflt: function () {
        return { multiplier: CM.AHJ[''], defaultedTo: CM.AHJ_LBL[''] };
      } },
    { field: 'labor', label: 'labour basis',
      answered: !!(input.labor && has(CM.LABOR, input.labor)),
      known: function (v) { return has(CM.LABOR, v); },
      dflt: function () {
        return { multiplier: CM.LABOR[''], defaultedTo: CM.LABOR_LBL[''] };
      } },
    { field: 'quoteDate', label: 'equipment quote date',
      answered: H.quoteAgeMonths({ quoteDate: input.quoteDate }) != null,
      dflt: function () {
        return { multiplier: H.escalation({}),
                 defaultedTo: 'equipment escalated as though the quote were a '
                            + 'quarter old' };
      } },
    { field: 'hours', label: 'duration',
      answered: H.num(input.hours) != null && H.num(input.hours) > 0,
      dflt: function () {
        return { multiplier: null,
                 defaultedTo: CM.DEFAULT_HOURS + ' hours' };
      } }
  ];
}


/* ── THE ORG'S OWN PRICING, READ SERVER-SIDE ──────────────────────────────
   toolData/{orgId}/tools/costestimator, the same document the estimator
   writes and clearsky-sitefinder.html:4738 reads. Shape confirmed against
   that read rather than assumed: the payload sits under `.data`, and carries
   { sel, vendors:{key:record}, installers:{key:record}, instSel }.

   Translation into priced lines is ratesFromVendor() and installerDivisions()
   in the shared model — the same two functions the estimator calls — so a
   quote entered once is the same number wherever a site is priced.

   Absent, denied or unreadable, this returns generic rates and SAYS SO. A
   missing quote must degrade to an honest number, never to a blank panel and
   never to a silent one: the reason lands in `supplier.note` and travels into
   the response. */
function orgPricing(org, selection) {
  selection = selection || {};
  return A.db().collection('toolData').doc(org)
    .collection('tools').doc('costestimator').get()
    .then(function (snap) {
      if (!snap.exists) {
        return { rates: null, installer: null, supplier: null,
                 note: 'No supplier pricing on file for this organisation; '
                     + 'priced at the model\'s generic rates.' };
      }
      var st = (snap.data() || {}).data || {};
      var vendors = st.vendors || {};
      var supplierKey = has(selection, 'supplierKey') ? selection.supplierKey : st.sel;
      var installerKey = has(selection, 'installerKey') ? selection.installerKey : st.instSel;
      var v = supplierKey && has(vendors, supplierKey) ? vendors[supplierKey] : null;
      var inst = installerKey && has(st.installers, installerKey) ? st.installers[installerKey] : null;

      if (!v || !CM.vendorHasPrice(v)) {
        return { rates: null, installer: inst || null, supplier: null,
                 note: v ? 'The selected supplier record carries no price; '
                         + 'priced at the model\'s generic rates.'
                         : 'No supplier is selected in the cost estimator; '
                         + 'priced at the model\'s generic rates.' };
      }
      return {
        rates: CM.ratesFromVendor(v),
        installer: inst || null,
        /* Only what identifies the document behind the rate. The record
           itself is not echoed — it is built key by key, the same discipline
           api/embed-config.js uses, so a field added to a vendor record next
           year cannot ride out of here by accident. */
        supplier: {
          name: v.name || null, model: v.model || null,
          tier: CM.vendorTier(v),
          ref: v.ref || null, date: v.date || null,
          expired: CM.quoteExpired(v), stale: CM.quoteStale(v),
          ageDays: CM.quoteAgeDays(v),
          atGate: CM.atGate(v), incoterm: v.incoterm || null
        },
        note: null
      };
    })
    ['catch'](function (e) {
      /* Named, not swallowed. A read that was denied and a supplier who has
         no quote produce the same generic total, and a reader has to be able
         to tell those two apart. */
      return { rates: null, installer: null, supplier: null,
               note: 'The organisation\'s supplier pricing could not be read; priced at generic rates.' };
    });
}

/* ── THE GATE ─────────────────────────────────────────────────────────────
   Tenant status, then the tool allowlist. Both reads, plus billing, in one
   round trip.

   It FAILS OPEN on a missing omega_orgs record, for the reason CLAUDE.md
   states about the editor gate and tenantActive() in the rules: every legacy
   tenant has no record until the seed runs, and getting this backwards locks
   out paying customers. Only an explicit suspended or cancelled refuses.
   `pending` is allowed through — a pending tenant is a live 30-day trial, and
   omega-tenant.js already holds those users at the door.

   toolAccess follows the rule CLAUDE.md spells out: ABSENT is not EMPTY. null
   means "whatever the plan includes"; a present array is authoritative at any
   length, and org-level and member-level lists INTERSECT, so a tenant admin's
   member list can narrow the product but never widen it past what the org
   bought. This is a commercial control, not the security boundary — Firestore
   rules already scope toolData by org. */
function gate(caller, org) {
  var base = A.db().collection('omega_orgs').doc(org);
  return Promise.all([
    base.get(),
    A.billingOf(org),
    base.collection('members').doc(caller.uid).get()
  ]).then(function (r) {
    var orgDoc = r[0].exists ? (r[0].data() || {}) : null;
    var billing = r[1] || {};
    var member = r[2].exists ? (r[2].data() || {}) : null;

    if (caller.staff) return billing;
    var access = require('./_lib/package-access');
    var projection = access.project(caller, billing, orgDoc, member, Date.now());
    access.requireModule(projection, ['estimate', 'sitefinder'], { tools: TOOL_KEYS });
    if (projection.packaged) return billing;

    if (orgDoc && orgDoc.status && orgDoc.status !== 'active') {
      throw A.httpError(403, 'this organisation is ' + orgDoc.status);
    }
    if (member && member.status && member.status !== 'active') {
      throw A.httpError(403, 'an active organisation membership is required');
    }

    var overrides = billing.toolOverrides || {};
    var allowed = TOOL_KEYS.filter(function (k) {
      if (overrides[k] === false) return false;
      if (k === 'costestimator' && overrides[k] !== true &&
          ['deluxe', 'enterprise', 'partner', 'internal'].indexOf(String(billing.tier || '')) < 0) return false;
      if (Array.isArray(billing.toolAccess) && billing.toolAccess.indexOf(k) < 0) return false;
      if (member && Array.isArray(member.toolAccess) && member.toolAccess.indexOf(k) < 0) return false;
      return true;
    });
    if (!allowed.length) {
      throw A.httpError(403, 'pricing needs Site Finder or the Cost Estimator; '
        + 'this account has neither');
    }
    return billing;
  });
}

/* Echoed back key by key, never spread. The caller sent these and gets them
   back so the answer can be filed against the address it belongs to; building
   the object explicitly is what stops a field somebody adds to a site record
   later from riding out of here unreviewed. */
function siteEcho(s) {
  if (!s || typeof s !== 'object') return null;
  return {
    id: s.id == null ? null : String(s.id),
    addr: s.addr == null ? null : String(s.addr),
    lat: CM.helpers.num(s.lat), lon: CM.helpers.num(s.lon),
    feederId: s.feederId == null ? null : String(s.feederId),
    type: s.type == null ? null : String(s.type),
    sqft: CM.helpers.num(s.sqft),
    positionIsBuilding: (s.positionIsBuilding === true || s.positionIsBuilding === false)
      ? s.positionIsBuilding : null
  };
}

module.exports = A.handler(function (req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') throw A.httpError(405, 'POST only');
  var b = req.body;
  if (!b || typeof b !== 'object' || Array.isArray(b)) throw A.httpError(400, 'a JSON object is required');

  return A.authenticate(req).then(function (caller) {
    if (A.isDegraded && A.isDegraded()) throw A.httpError(503, 'pricing is temporarily unavailable');
    var org = A.safeOrg(b.orgId || caller.orgId);
    if (!org) throw A.httpError(400, 'orgId is not a domain');

    return A.canActInOrg(caller, org).then(function (ok) {
      if (!ok) throw A.httpError(403, 'not your organisation');
      return gate(caller, org);
    }).then(function () {
      E.rateLimit('price-site:' + org, 60);
      validateInput(b);
      return orgPricing(org, b);
    }).then(function (pricing) {
      return finish(caller, org, b, pricing);
    });
  }).catch(function (err) {
    if (err && err.status && err.status < 500) throw err;
    throw A.httpError(503, 'pricing is temporarily unavailable');
  });
});

function validateInput(b) {
  var bounds = { kw: [0, 10000000], hours: [0, 24], poiFt: [0, 10000000], padArea: [0, 1000000000] };
  Object.keys(bounds).forEach(function (key) {
    var v = b[key];
    if (v == null || v === '') { if (key === 'kw') throw A.httpError(400, 'kw is required'); return; }
    var n = (typeof v === 'number' || (typeof v === 'string' && v.trim())) ? Number(v) : NaN;
    if (!isFinite(n) || n < bounds[key][0] || n > bounds[key][1] || ((key === 'kw' || key === 'hours') && n === 0))
      throw A.httpError(400, key + ' is outside the supported range');
  });
  if (b.carryUpgrade != null && typeof b.carryUpgrade !== 'boolean') throw A.httpError(400, 'carryUpgrade must be boolean');
  ['supplierKey', 'installerKey'].forEach(function (key) {
    if (has(b, key) && (typeof b[key] !== 'string' || b[key].length > 200)) throw A.httpError(400, key + ' must be a string');
  });
}

function finish(caller, org, b, pricing) {
  var H = CM.helpers;
  var kw = H.num(b.kw);
  if (kw == null || !(kw > 0)) throw A.httpError(400, 'kw is required and must be greater than zero');

  /* ── WHAT WAS ACTUALLY ANSWERED ──────────────────────────────────────
     Built before pricing, because the class depends on it and because an
     unrecognised value has to be stripped BEFORE it reaches the model — where
     it would fall back to 1.00 and look like an answer. */
  var input = {
    kw: kw,
    hours: H.num(b.hours),
    volt: b.volt == null ? '' : String(b.volt),
    poiFt: H.num(b.poiFt),
    padArea: H.num(b.padArea),
    soil: b.soil == null ? '' : String(b.soil),
    ahj: b.ahj == null ? '' : String(b.ahj),
    labor: b.labor == null ? '' : String(b.labor),
    utilityUpgrade: b.utilityUpgrade == null ? '' : String(b.utilityUpgrade),
    carryUpgrade: !!b.carryUpgrade,
    quoteDate: b.quoteDate == null ? '' : String(b.quoteDate)
  };

  var rejected = [];
  var list = drivers(input, null);
  var i, d;
  for (i = 0; i < list.length; i++) {
    d = list[i];
    if (d.known && input[d.field] && !d.known(input[d.field])) {
      rejected.push({ field: d.field, sent: String(input[d.field]),
        why: 'not one of the values this model recognises; treated as '
           + 'unanswered rather than priced as typical' });
      input[d.field] = '';
      d.answered = false;
    }
  }

  /* Staff-only overrides. See the header: a tier is a claim about a document,
     and a claim in a request body has none behind it. */
  var ignored = [];
  if (caller.staff) {
    if (b.rates && typeof b.rates === 'object') input.rates = b.rates;
    if (b.installer && typeof b.installer === 'object') input.installer = b.installer;
  } else {
    if (b.rates) ignored.push({ field: 'rates',
      why: 'rate overrides carry a provenance tier and are read from '
         + 'toolData/' + org + '/tools/costestimator, not from the browser' });
    if (b.installer) ignored.push({ field: 'installer',
      why: 'the installer quote is read from the organisation\'s own record, '
         + 'not from the browser' });
  }
  if (!input.rates && pricing.rates) input.rates = pricing.rates;
  if (!input.installer && pricing.installer) input.installer = pricing.installer;

  var r = CM.price(input);
  if (!r) throw A.httpError(400, 'the model could not price this input');
  if (!r.total || !['base', 'lo', 'hi'].every(function (k) {
    return typeof r.total[k] === 'number' && isFinite(r.total[k]) && r.total[k] >= 0;
  })) throw A.httpError(500, 'the model returned invalid totals');

  /* Re-run the driver list now that kWh is known — the equipment-yard default
     is a function of the energy on site. */
  var finalList = drivers(input, r.kwh);
  var unanswered = [], defaults = [], openFields = [];
  for (i = 0; i < finalList.length; i++) {
    d = finalList[i];
    if (d.answered) continue;
    var info = d.dflt();
    unanswered.push(d.label);
    openFields.push(d.field);
    defaults.push({
      driver: d.label, field: d.field,
      /* A multiplier where the default IS a multiplier, and null where it is
         a quantity. Reporting "250" as a multiplier would be a lie that reads
         like diligence. `defaultedTo` always says it in words. */
      multiplier: info.multiplier == null ? null : info.multiplier,
      defaultedTo: info.defaultedTo,
      factors: info.factors || null,
      exposureUsd: info.exposureUsd || null
    });
  }

  /* assumedSize: whether the kW priced came from a circuit or from somebody's
     stated assumption. The caller may say outright; absent that it is inferred
     from whether a feeder is attributed, which is the same test the site
     finder's sizePick() makes. Inferred or stated, the response says which —
     it changes how the number should be read, so it does not get to be a bare
     boolean. */
  var siteInfo = siteEcho(b.site);
  var assumed, assumedBasis;
  if (b.assumedSize === true || b.assumedSize === false) {
    assumed = b.assumedSize;
    assumedBasis = 'stated by the caller';
  } else {
    assumed = !(siteInfo && siteInfo.feederId);
    assumedBasis = assumed
      ? 'inferred: no circuit is attributed to this site, so the kW priced is '
        + 'an assumption, not a capacity'
      : 'inferred: priced against the circuit attributed to this site';
  }

  var posBad = !!(siteInfo && siteInfo.positionIsBuilding === false);
  var cls = CM.estimateClass({ open: unanswered.length, posBad: posBad,
    gaps: Array.isArray(b.gaps) ? b.gaps.length : 0,
    voltOpen: openFields.indexOf('volt') >= 0,
    upgradeOpen: openFields.indexOf('utilityUpgrade') >= 0 }, r);
  /* AN ESTIMATE NEVER TRAVELS WITHOUT ITS CLASS. If the band cannot be
     resolved the answer is a refusal, not a bare total — a number that leaves
     here unclassed is the one failure mode this endpoint exists to prevent. */
  if (!cls) {
    throw A.httpError(500, 'the estimate class could not be determined, so no '
      + 'total was returned');
  }

  var why = cls.why;
  why += assumed
    ? ' Priced at an assumed ' + Math.round(r.kw).toLocaleString() + ' kW for '
      + r.hours + ' hours; attribute a circuit and this re-prices against what '
      + 'the feeder will take.'
    : ' Priced from the circuit\'s available ' + Math.round(r.kw).toLocaleString()
      + ' kW at ' + r.hours + ' hours.';

  var stack = V.stack({ kw: r.kw, hours: r.hours, demandLoPerKwMonth: 8,
    demandHiPerKwMonth: 14, vppPerKwYear: 150 });
  var incentives = V.incentives({ capexUsd: r.total.base, kwh: r.kwh, itcRate: 0.30,
    rebatePerKwh: V.COMED_REBATE.perKwh, rebateName: 'ComEd storage rebate' });
  var netCost = Math.max(0, r.total.base - incentives.total);
  return {
    financial: {
      stack: stack, incentives: incentives,
      utility: V.utilityCost({ kw: r.kw, upgradeUsd: null, upgradeCarried: true, standbyPerKwMonth: null }),
      netCostUsd: netCost, paybackYears: stack && stack.perYear > 0 ? netCost / stack.perYear : null,
      basis: 'Existing ComEd/PJM screening scenario; eligibility and rates are not independently verified for this site.'
    },
    type: COST_IN,
    siteId: siteInfo ? siteInfo.id : null,
    site: siteInfo,
    at: new Date().toISOString(),
    orgId: org,

    /* WHO PRICED IT. `pricedBy` names this endpoint; `basis` is the sentence
       a packet should print. clearsky-sitefinder.html's sitePacket() currently
       derives that sentence from pricedBy === 'sitefinder' and would otherwise
       claim "Returned by the cost estimator", which is false for this path —
       hence the sentence travelling in its own field. */
    pricedBy: 'api/price-site',
    basis: 'Priced by /api/price-site against api/_lib/cost-model.js, the same '
         + 'model and the same tables the cost estimator runs.',

    kw: r.kw, kwh: r.kwh, hours: r.hours,
    pad: r.pad, poiFt: r.poiFt,
    voltage: r.voltage, voltLabel: r.voltLabel,
    assumedSize: assumed, assumedSizeBasis: assumedBasis,

    total: r.total, perKw: r.perKw, perKwh: r.perKwh, subtotal: r.subtotal,
    subtotalPerKwh: r.subtotalPerKwh,
    divisions: r.divisions, markups: r.markups,
    upgrade: r.upgrade, upgradeLine: r.upgradeLine,
    escalation: r.escalation, quoteAgeMonths: r.quoteAgeMonths,

    /* Costs that are real and NOT in the total. They travel with the estimate
       because a total handed on without them is a number somebody will treat
       as complete. */
    exposures: r.exposures || [],

    estimateClass: cls.label,
    estimateClassPlain: cls.plain,
    estimateClassWhy: why,
    accuracyLow: cls.lo, accuracyHigh: cls.hi,
    accuracy: {
      standard: 'AACE 18R-97',
      aace: cls.n, low: cls.lo, high: cls.hi,
      rangeLowUsd: Math.round(r.total.base * (1 + cls.lo)),
      rangeHighUsd: Math.round(r.total.base * (1 + cls.hi)),
      evidenceShare: cls.evidenceShare,
      /* Declared on the wire, not only in a comment. A consumer that stores
         this response is entitled to know the band came from a copy. */
      bandSource: 'api/_lib/cost-model.js'
    },

    unanswered: unanswered,
    defaults: defaults,
    rejectedInputs: rejected,
    ignoredInputs: ignored,

    sourcing: r.sourcing || null,
    supplier: pricing.supplier,
    supplierNote: pricing.note,
    installerUsed: (input.installer && input.installer.name) || null,

    notAQuote: 'An estimate, not a bid. No agreed contingency, no site walk, '
             + 'no firm equipment pricing.'
  };
}

module.exports._helpers = { gate: gate, orgPricing: orgPricing, validateInput: validateInput, finish: finish };
