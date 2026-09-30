/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/compute-site.js — THE COMPUTE SITE PRO FORMA (server only, pure, ES5)

   WHAT IT ANSWERS. "Can this building's existing electrical service carry
   GPU compute pods beside its EV chargers, a battery and the building's own
   load — and if it can, what does the project return?" It is the metro-edge
   model Laitent (by Xeal) describes publicly: inference pods placed on power
   already permitted for EV charging, "one panel, two revenue streams"
   (laitent.ai/realestate, /computecustomers, read 2026-09-30).

   HOW. Hour by hour for a year (8,760 hours) on ONE service limit:

     1. THE BUILDING is firm. Its load is an interval file, 12–24 months of
        bills or a typical shape (vpp-sim.js buildLoad — the one load
        builder), priced on the one tariff engine (bess-tariff.js) through
        vpp-sim.js's calibrated tariff.
     2. FIRM COMPUTE is firm: the offtake GPUs (take-or-pay) and the edge
        contract GPUs (used by a diurnal inference-demand curve) must always
        have power. Every GPU draws idle power whenever it is on.
     3. EV CHARGING is scheduled next, inside what the service has left.
        Sessions arrive by the chosen pattern (residents overnight, workplace,
        retail, fleet or a custom window) and leave after their dwell.
        Unmanaged: each car charges at full power on arrival, held under the
        service by the panel's load management (NEC 625.42 EVEMS). Managed:
        each session's energy is placed in its cheapest hours without setting
        a new monthly peak, then valley-filled. What cannot be delivered
        before a car leaves is UNSERVED and reported, never assumed away.
     4. THE BATTERY AND ON-DEMAND COMPUTE share what is left. For each month
        a demand target is searched: the battery discharges to hold it, then
        on-demand GPUs are curtailed, and the target kept is the one that
        earns the most (on-demand revenue less energy, demand charges and
        battery wear). The battery charges in the cheapest hours with room
        and arbitrages a time-of-use spread when one pays. The service limit
        is hard: firm load above it is lost firm compute, reported.

   Then a year-by-year operating schedule (GPU-hour prices falling with the
   hardware's age and resetting at a refresh, offtake re-contracted each
   term, the first-year ramp, the battery's fade, utility escalation) feeds
   the ONE finance engine, api/_lib/proforma-engine.js, so the returns, the
   IRR build, the sensitivities and the investor deck are the BESS Pro
   Forma's own — the same arithmetic, the same page, the same deck.

   THREE WAYS TO OWN IT (Laitent's published host models, generalised):
     own    the project owns the GPUs, the pods, the chargers and the
            battery; sells compute (through an operator's platform, for a
            fee) and charging; pays the incremental electricity and the host
     infra  the investor owns the power and pod layer (not the GPUs) for a
            share of gross compute revenue; the compute operator owns the
            GPUs, runs them and (by default) pays their electricity
     lease  the host leases the power to an operator for fixed rent with
            electricity paid, with no or small capital (chargers)
   Every run prices all three side by side; the chosen one gets the full
   pro forma.

   HONESTY RULES (vpp-sim.js's):
     - every figure carries its tier: computed (this site's load and
       tariff), published (a dated public figure, with its source) or
       planning (a screening rate; its ref says what replaces it);
     - a load that cannot be served is reported (overload hours, unserved
       charging, curtailed GPU-hours), never silently dropped;
     - the load and tariff sources are stated, with a confidence that
       follows the weaker of the two.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var VS = require('./vpp-sim');
var PF = require('./proforma-engine');
var S = VS.site;

var VERSION = 'compute-site-1';
var H = S.HOURS_YEAR, DAYS = S.DAYS, MS = S.MONTH_START;
var MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* ── PUBLISHED AND PLANNING FIGURES ───────────────────────────────────────── */
var REFS = {
  laitentPlanner: 'Laitent cluster planner (laitent.ai/computecustomers, read 2026-09-30): 0.60 kW per RTX PRO 6000, ' +
    '0.70 kW per H200, 1.30 kW per B300; up to 48, 48 and 32 GPUs per pod.',
  laitentMix: 'Laitent\'s published revenue mix (laitent.ai/realestate, read 2026-09-30): 40% long-term offtake floor, ' +
    '30% local edge contracts, 30% on-demand overflow.',
  laitentModels: 'Laitent\'s published host models (laitent.ai/realestate, read 2026-09-30): tenant rent $25K/yr for 10 years ' +
    'with electricity paid and no capital; $80K for 8 chargers with $35K/yr rent; $372K for the compute layer at a 20% gross ' +
    'revenue share (~$140K/yr, 10-yr IRR 36%+).',
  gpuPrices: 'GPU rental indices, September 2026: H200 on-demand median $4.40/GPU-hr (listings $2.09–$13.78), spot from $1.99; ' +
    'B300 reserved median $5.71, on-demand median $7.87; RTX PRO 6000 from $0.93, median $1.48 (getdeploying.com GPU price ' +
    'index; jarvislabs.ai; thundercompute.com). The tier prices here are what an edge operator realises, below cloud list: ' +
    'a planning figure the operator\'s contract replaces.',
  gpuCapex: 'Purchase prices, September 2026: H200 NVL ~$31–32K a card and an 8-GPU HGX H200 server ~$370K (~$46K a GPU ' +
    'all-in); RTX PRO 6000 Blackwell Server Edition $14,999 a card (intuitionlabs.ai GPU pricing guide; Tom\'s Hardware). ' +
    'The per-GPU figure carries its share of the server, network and rack; B300 is a planning figure.',
  podInfra: 'Pod infrastructure (enclosure, cooling, 480 V distribution, networking) is a planning figure set against ' +
    'Laitent\'s published $372K for a property\'s compute layer; the integrator\'s quote replaces it.',
  nec: 'NEC 625.42: without an EV energy management system the service must carry every charger at its full rating; ' +
    'with one, the managed maximum governs.'
};

var GPU = {
  rtxpro6000: { name: 'NVIDIA RTX PRO 6000 Blackwell', short: 'RTX PRO 6000', kw: 0.60, podMax: 48, capexPerGpu: 20000,
                price: { offtake: 0.85, edge: 1.30, spot: 1.00 } },
  h200: { name: 'NVIDIA H200', short: 'H200', kw: 0.70, podMax: 48, capexPerGpu: 40000,
          price: { offtake: 2.25, edge: 3.25, spot: 2.50 } },
  b300: { name: 'NVIDIA B300', short: 'B300', kw: 1.30, podMax: 32, capexPerGpu: 62000,
          price: { offtake: 4.25, edge: 5.75, spot: 4.75 } },
  custom: { name: 'Custom accelerator', short: 'GPU', kw: null, podMax: 64, capexPerGpu: null,
            price: { offtake: null, edge: null, spot: null } }
};
var TIER_KEYS = ['offtake', 'edge', 'spot'];
var TIER_TEXT = {
  offtake: { label: 'Long-term offtake', note: 'Guaranteed-capacity contracts, take-or-pay: the durable base.' },
  edge: { label: 'Local edge contracts', note: 'Multi-tenant, low-latency contracts, paid per GPU-hour used.' },
  spot: { label: 'On-demand overflow', note: 'Spot GPU rentals: the one tier curtailed to hold the site\'s peak.' }
};

/* Inference demand through the day (mean 1): quiet before dawn, busy from
   mid-morning to late evening, as consumer and agentic traffic is. */
var DEMAND_SHAPE = normalise([0.62, 0.55, 0.50, 0.48, 0.50, 0.58, 0.72, 0.88, 1.00, 1.08, 1.12, 1.14,
                              1.15, 1.15, 1.14, 1.13, 1.13, 1.15, 1.20, 1.24, 1.22, 1.12, 0.95, 0.78]);

/* EV arrivals by hour (relative weights), how long a car stays, and the
   weekend's sessions as a share of a weekday's. */
var EV_PATTERNS = {
  overnight: { label: 'Residents, overnight (multifamily)', dwell: 11, weekend: 0.9,
               arrive: { 15: 4, 16: 8, 17: 16, 18: 20, 19: 18, 20: 13, 21: 9, 22: 7, 23: 5 } },
  workplace: { label: 'Workplace, daytime', dwell: 8, weekend: 0.15,
               arrive: { 6: 5, 7: 20, 8: 35, 9: 25, 10: 10, 11: 5 } },
  retail: { label: 'Retail and public, short stays', dwell: 2, weekend: 1.1,
            arrive: { 9: 5, 10: 8, 11: 10, 12: 12, 13: 11, 14: 10, 15: 9, 16: 9, 17: 10, 18: 9, 19: 7 } },
  fleet: { label: 'Fleet depot, overnight', dwell: 10, weekend: 0.3,
           arrive: { 17: 20, 18: 40, 19: 30, 20: 10 } },
  custom: { label: 'Custom arrival window', dwell: null, weekend: 1, arrive: null }
};
var HOST_TYPES = { multifamily: 'Multifamily (house meter)', commercial: 'Office / workplace', retail: 'Retail', industrial: 'Industrial' };
var HOST_WORDS = { multifamily: 'a multifamily residential property', commercial: 'an office building', retail: 'a retail property', industrial: 'an industrial facility' };
var STRUCTURES = {
  own: 'Own and operate the stack',
  infra: 'Own the power and pod layer for a revenue share',
  lease: 'Lease the power to a compute operator'
};
var SPOT_MODES = ['follow', 'always', 'offpeak'];

/* ── small helpers ───────────────────────────────────────────────────────── */
function num(v, d) { var n = Number(v); return (v == null || v === '' || typeof v === 'boolean' || !isFinite(n)) ? d : n; }
function r0(n) { return Math.round(n); }
function r1(n) { return Math.round(n * 10) / 10; }
function r2(n) { return Math.round(n * 100) / 100; }
function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
function fmt(n) { return Math.round(n).toLocaleString('en-US'); }
function money(n) { return (n < 0 ? '-$' : '$') + fmt(Math.abs(n)); }
function has(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); }
function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function obj(v) { return isObj(v) ? v : {}; }
function str(v, max) { return typeof v === 'string' ? v.trim().slice(0, max || 160) : (typeof v === 'number' && isFinite(v) ? String(v) : ''); }
function bool(v, d) { return v === true || v === 'true' ? true : (v === false || v === 'false' ? false : d); }
function normalise(a) { var s = 0, i; for (i = 0; i < a.length; i++) s += a[i]; var m = s / a.length; return a.map(function (x) { return x / m; }); }
function zeros(n) { return new Float64Array(n); }
function sum(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s; }
function max(a) { var m = -Infinity; for (var i = 0; i < a.length; i++) if (a[i] > m) m = a[i]; return m; }
function err(field, message) { return { field: field, message: message }; }

/* A number field: blank takes the default; out of range is an error. */
function rd(e, field, v, o) {
  if (v == null || v === '') return o.def == null ? null : o.def;
  var n = Number(v);
  if (typeof v === 'boolean' || !isFinite(n)) { e.push(err(field, o.label + ' must be a number.')); return o.def == null ? null : o.def; }
  if (o.int && Math.floor(n) !== n) { e.push(err(field, o.label + ' must be a whole number.')); return o.def == null ? null : o.def; }
  if ((o.min != null && n < o.min) || (o.max != null && n > o.max)) {
    e.push(err(field, o.label + ' must be between ' + fmtRange(o.min) + ' and ' + fmtRange(o.max) + '.'));
    return o.def == null ? null : o.def;
  }
  return n;
}
function fmtRange(v) { return v == null ? '' : (Math.abs(v) >= 1000 ? fmt(v) : String(v)); }
function pick(e, field, v, list, def, label) {
  if (v == null || v === '') return def;
  if (list.indexOf(v) < 0) { e.push(err(field, label + ' must be one of: ' + list.join(', ') + '.')); return def; }
  return v;
}

/* ── INPUT ───────────────────────────────────────────────────────────────── */
/* Everything the model needs, with the defaults a first screen runs on.
   Returns { cfg, errors }. The load, tariff and finance blocks are passed
   through to the builders that own them (vpp-sim.js, proforma-engine.js),
   which validate them in their own words. */
function read(input) {
  var e = [], x = obj(input);
  var site = obj(x.site), sv = obj(x.service), ev = obj(x.ev), cp = obj(x.compute), bt = obj(x.battery),
      so = obj(x.solar), dl = obj(x.deal), fi = obj(x.finance);
  var c = {};

  c.site = {
    name: str(site.name, 120) || 'Compute site', sponsor: str(site.sponsor, 120), host: str(site.host, 160),
    hostDescription: str(site.hostDescription, 400), street: str(site.street, 160), city: str(site.city, 80),
    zip: str(site.zip, 10), market: str(site.market, 12), utility: str(site.utility, 120),
    hostType: pick(e, 'site.hostType', site.hostType, Object.keys(HOST_TYPES), 'multifamily', 'The host type'),
    preparedDate: str(site.preparedDate, 10), bocMonth: str(site.bocMonth, 7), pisMonth: str(site.pisMonth, 7)
  };
  if (!/^\d{5}(-\d{4})?$/.test(c.site.zip)) e.push(err('site.zip', 'A five-digit US ZIP code is needed.'));

  /* The service: its rating in kW, or amps × volts, derated to the share
     the building may load continuously (NEC's 80% by default). */
  var amps = rd(e, 'service.amps', sv.amps, { min: 30, max: 10000, label: 'The service rating (A)' });
  var volts = rd(e, 'service.volts', sv.volts, { def: 480, min: 120, max: 34500, label: 'The service voltage (V)' });
  var phases = rd(e, 'service.phases', sv.phases, { def: 3, min: 1, max: 3, int: true, label: 'The phases' });
  var pf = rd(e, 'service.pf', sv.pf, { def: 0.95, min: 0.7, max: 1, label: 'The power factor' });
  var kw = rd(e, 'service.kw', sv.kw, { min: 10, max: 50000, label: 'The service capacity (kW)' });
  if (kw == null && amps != null) kw = amps * volts * (phases === 3 ? Math.sqrt(3) : 1) * pf / 1000;
  c.service = {
    kw: kw, amps: amps, volts: volts, phases: phases, pf: pf,
    loadingPct: rd(e, 'service.loadingPct', sv.loadingPct, { def: 80, min: 50, max: 100, label: 'The continuous loading limit (%)' }),
    upgradeKw: rd(e, 'service.upgradeKw', sv.upgradeKw, { def: 0, min: 0, max: 50000, label: 'The service upgrade (kW)' }),
    upgradeCost: rd(e, 'service.upgradeCost', sv.upgradeCost, { def: 0, min: 0, max: 1e8, label: 'The service upgrade cost ($)' })
  };
  if (kw == null) e.push(err('service.kw', 'The service size is needed: its kW, or its amps and voltage from the panel schedule.'));

  c.load = obj(x.load);
  c.tariff = x.tariff;

  var ports = rd(e, 'ev.ports', ev.ports, { def: 8, min: 0, max: 400, int: true, label: 'The number of EV ports' });
  var pattern = pick(e, 'ev.pattern', ev.pattern, Object.keys(EV_PATTERNS), 'overnight', 'The charging pattern');
  var P = EV_PATTERNS[pattern];
  c.ev = {
    ports: ports, pattern: pattern,
    kwPerPort: rd(e, 'ev.kwPerPort', ev.kwPerPort, { def: 11.5, min: 1, max: 400, label: 'The charger power (kW per port)' }),
    sessionsPerPortDay: rd(e, 'ev.sessionsPerPortDay', ev.sessionsPerPortDay, { def: 1, min: 0, max: 24, label: 'Sessions per port per weekday' }),
    weekendFactor: rd(e, 'ev.weekendFactor', ev.weekendFactor, { def: P.weekend, min: 0, max: 3, label: 'Weekend sessions (× a weekday)' }),
    kwhPerSession: rd(e, 'ev.kwhPerSession', ev.kwhPerSession, { def: 20, min: 1, max: 300, label: 'Energy per session (kWh)' }),
    arrivalStart: rd(e, 'ev.arrivalStart', ev.arrivalStart, { def: 17, min: 0, max: 23, int: true, label: 'The arrival window start (hour)' }),
    arrivalEnd: rd(e, 'ev.arrivalEnd', ev.arrivalEnd, { def: 21, min: 1, max: 24, int: true, label: 'The arrival window end (hour)' }),
    dwellHours: rd(e, 'ev.dwellHours', ev.dwellHours, { def: P.dwell || 8, min: 1, max: 24, int: true, label: 'The dwell (hours)' }),
    managed: bool(ev.managed, true),
    efficiencyPct: rd(e, 'ev.efficiencyPct', ev.efficiencyPct, { def: 92, min: 70, max: 100, label: 'Charger efficiency (%)' }),
    pricePerKwh: rd(e, 'ev.pricePerKwh', ev.pricePerKwh, { def: 0.35, min: 0, max: 2, label: 'The driver price ($/kWh)' }),
    priceEscPct: rd(e, 'ev.priceEscPct', ev.priceEscPct, { def: 2, min: -10, max: 20, label: 'The charging price escalator (%/yr)' }),
    existing: bool(ev.existing, false),
    capexPerPort: rd(e, 'ev.capexPerPort', ev.capexPerPort, { def: 9000, min: 0, max: 500000, label: 'Charger cost installed ($ per port)' }),
    networkPerPortYear: rd(e, 'ev.networkPerPortYear', ev.networkPerPortYear, { def: 300, min: 0, max: 20000, label: 'Network fee ($ per port-year)' }),
    omPerPortYear: rd(e, 'ev.omPerPortYear', ev.omPerPortYear, { def: 200, min: 0, max: 20000, label: 'Charger O&M ($ per port-year)' }),
    processingPct: rd(e, 'ev.processingPct', ev.processingPct, { def: 3, min: 0, max: 20, label: 'Payment processing (%)' })
  };
  if (c.ev.arrivalEnd <= c.ev.arrivalStart) e.push(err('ev.arrivalEnd', 'The arrival window must end after it starts.'));
  if (c.ev.sessionsPerPortDay * c.ev.dwellHours > 24) {
    e.push(err('ev.sessionsPerPortDay', 'At ' + c.ev.dwellHours + ' hours a stay, a port cannot host ' + c.ev.sessionsPerPortDay +
      ' sessions a day (' + r1(24 / c.ev.dwellHours) + ' at most).'));
  }

  var cls = pick(e, 'compute.gpuClass', cp.gpuClass, Object.keys(GPU), 'h200', 'The GPU class'), G = GPU[cls];
  var pods = rd(e, 'compute.pods', cp.pods, { def: 1, min: 0, max: 40, int: true, label: 'The number of pods' });
  var tiers = obj(cp.tiers), tv = {};
  TIER_KEYS.forEach(function (k) {
    var t = obj(tiers[k]);
    tv[k] = {
      sharePct: rd(e, 'compute.tiers.' + k + '.sharePct', t.sharePct, { def: k === 'offtake' ? 40 : 30, min: 0, max: 100, label: TIER_TEXT[k].label + ' share (%)' }),
      price: rd(e, 'compute.tiers.' + k + '.price', t.price, { def: G.price[k], min: 0, max: 100, label: TIER_TEXT[k].label + ' price ($/GPU-hr)' }),
      utilPct: k === 'offtake' ? 100
        : rd(e, 'compute.tiers.' + k + '.utilPct', t.utilPct, { def: k === 'edge' ? 70 : 40, min: 0, max: 100, label: TIER_TEXT[k].label + ' utilisation (%)' })
    };
    if (tv[k].price == null) e.push(err('compute.tiers.' + k + '.price', TIER_TEXT[k].label + ' needs a price for a custom GPU ($/GPU-hr).'));
  });
  var shareSum = tv.offtake.sharePct + tv.edge.sharePct + tv.spot.sharePct;
  if (Math.abs(shareSum - 100) > 0.01) e.push(err('compute.tiers', 'The three contract shares must add up to 100% (they add up to ' + r1(shareSum) + '%).'));
  c.compute = {
    gpuClass: cls, gpuName: G.name, gpuShort: G.short, pods: pods,
    kwPerGpu: rd(e, 'compute.kwPerGpu', cp.kwPerGpu, { def: G.kw, min: 0.05, max: 5, label: 'Power per GPU (kW)' }),
    gpusPerPod: rd(e, 'compute.gpusPerPod', cp.gpusPerPod, { def: G.podMax, min: 1, max: G.podMax, int: true, label: 'GPUs per pod' }),
    overheadPct: rd(e, 'compute.overheadPct', cp.overheadPct, { def: 20, min: 0, max: 150, label: 'Server overhead (%)' }),
    pue: rd(e, 'compute.pue', cp.pue, { def: 1.15, min: 1, max: 2, label: 'Cooling (PUE)' }),
    servePct: rd(e, 'compute.servePct', cp.servePct, { def: 85, min: 10, max: 110, label: 'Draw when serving (% of rating)' }),
    idlePct: rd(e, 'compute.idlePct', cp.idlePct, { def: 30, min: 0, max: 100, label: 'Draw when idle (% of rating)' }),
    availabilityPct: rd(e, 'compute.availabilityPct', cp.availabilityPct, { def: 98, min: 50, max: 100, label: 'Hardware availability (%)' }),
    tiers: tv,
    edgeStart: rd(e, 'compute.edgeStart', cp.edgeStart, { def: 0, min: 0, max: 23, int: true, label: 'Edge contract hours start' }),
    edgeEnd: rd(e, 'compute.edgeEnd', cp.edgeEnd, { def: 24, min: 1, max: 24, int: true, label: 'Edge contract hours end' }),
    spotMode: pick(e, 'compute.spotMode', cp.spotMode, SPOT_MODES, 'follow', 'The on-demand schedule'),
    offtakeTermYears: rd(e, 'compute.offtakeTermYears', cp.offtakeTermYears, { def: 3, min: 1, max: 15, int: true, label: 'The offtake contract term (years)' }),
    priceDeclinePct: rd(e, 'compute.priceDeclinePct', cp.priceDeclinePct, { def: 12, min: 0, max: 60, label: 'GPU-hour price decline (%/yr of age)' }),
    rampPct: rd(e, 'compute.rampPct', cp.rampPct, { def: 80, min: 10, max: 100, label: 'First-year utilisation ramp (%)' }),
    refreshYears: rd(e, 'compute.refreshYears', cp.refreshYears, { def: 5, min: 0, max: 15, int: true, label: 'The GPU refresh cycle (years, 0 = none)' }),
    refreshCostPct: rd(e, 'compute.refreshCostPct', cp.refreshCostPct, { def: 90, min: 0, max: 200, label: 'Refresh cost (% of today\'s GPU cost)' }),
    capexPerGpu: rd(e, 'compute.capexPerGpu', cp.capexPerGpu, { def: G.capexPerGpu, min: 0, max: 500000, label: 'GPU cost installed ($ per GPU)' }),
    podInfraPerPod: rd(e, 'compute.podInfraPerPod', cp.podInfraPerPod, { def: 250000, min: 0, max: 1e7, label: 'Pod infrastructure ($ per pod)' }),
    makeReady: rd(e, 'compute.makeReady', cp.makeReady, { def: 60000, min: 0, max: 1e7, label: 'Site electrical make-ready ($)' }),
    fiberInstall: rd(e, 'compute.fiberInstall', cp.fiberInstall, { def: 25000, min: 0, max: 1e7, label: 'Fiber backhaul install ($)' }),
    fiberPerMonth: rd(e, 'compute.fiberPerMonth', cp.fiberPerMonth, { def: 1500, min: 0, max: 1e6, label: 'Fiber backhaul ($/month)' }),
    hwOmPct: rd(e, 'compute.hwOmPct', cp.hwOmPct, { def: 3, min: 0, max: 30, label: 'Hardware O&M and warranty (% of GPU cost a year)' }),
    podOmPerYear: rd(e, 'compute.podOmPerYear', cp.podOmPerYear, { def: 8000, min: 0, max: 1e6, label: 'Pod O&M ($ per pod-year)' }),
    platformFeePct: rd(e, 'compute.platformFeePct', cp.platformFeePct, { def: 15, min: 0, max: 60, label: 'Operator platform fee (% of gross compute)' })
  };
  if (c.compute.kwPerGpu == null) e.push(err('compute.kwPerGpu', 'A custom GPU needs its power (kW per GPU).'));
  if (c.compute.capexPerGpu == null) e.push(err('compute.capexPerGpu', 'A custom GPU needs its installed cost ($ per GPU).'));
  if (c.compute.edgeEnd <= c.compute.edgeStart) e.push(err('compute.edgeEnd', 'The edge contract hours must end after they start.'));

  c.battery = {
    kw: rd(e, 'battery.kw', bt.kw, { def: 0, min: 0, max: 50000, label: 'Battery power (kW)' }),
    kwh: rd(e, 'battery.kwh', bt.kwh, { def: 0, min: 0, max: 200000, label: 'Battery energy (kWh)' }),
    rtePct: rd(e, 'battery.rtePct', bt.rtePct, { def: 88, min: 60, max: 98, label: 'Round-trip efficiency (%)' }),
    dodPct: rd(e, 'battery.dodPct', bt.dodPct, { def: 90, min: 50, max: 100, label: 'Usable depth (%)' }),
    capexPerKwh: rd(e, 'battery.capexPerKwh', bt.capexPerKwh, { def: 550, min: 0, max: 5000, label: 'Battery cost installed ($/kWh)' }),
    omPerKwhYear: rd(e, 'battery.omPerKwhYear', bt.omPerKwhYear, { def: 6, min: 0, max: 200, label: 'Battery O&M ($/kWh-yr)' }),
    fadePct: rd(e, 'battery.fadePct', bt.fadePct, { def: 2.5, min: 0, max: 10, label: 'Capacity fade (%/yr)' }),
    wearPerKwh: rd(e, 'battery.wearPerKwh', bt.wearPerKwh, { def: 0.03, min: 0, max: 1, label: 'Battery wear ($/kWh discharged)' }),
    lifeYears: rd(e, 'battery.lifeYears', bt.lifeYears, { def: 15, min: 5, max: 30, int: true, label: 'Battery life (years)' }),
    replaceCostPct: rd(e, 'battery.replaceCostPct', bt.replaceCostPct, { def: 60, min: 0, max: 150, label: 'Replacement cost (% of today\'s)' })
  };
  if ((c.battery.kw > 0) !== (c.battery.kwh > 0)) e.push(err('battery.kwh', 'A battery needs both its power (kW) and its energy (kWh).'));
  if (c.battery.kw > 0 && c.battery.kwh / c.battery.kw > 12) e.push(err('battery.kwh', 'More than twelve hours of storage is outside what this model covers.'));

  c.solar = {
    kwdc: rd(e, 'solar.kwdc', so.kwdc, { def: 0, min: 0, max: 50000, label: 'Solar (kW-dc)' }),
    capexPerW: rd(e, 'solar.capexPerW', so.capexPerW, { def: 2.4, min: 0, max: 20, label: 'Solar cost ($/W-dc)' })
  };

  var ls = obj(dl.lease);
  c.deal = {
    structure: pick(e, 'deal.structure', dl.structure, Object.keys(STRUCTURES), 'own', 'The ownership structure'),
    rentPerYear: rd(e, 'deal.rentPerYear', dl.rentPerYear, { def: 25000, min: 0, max: 1e8, label: 'Host rent ($/yr)' }),
    rentEscPct: rd(e, 'deal.rentEscPct', dl.rentEscPct, { def: 2, min: -10, max: 20, label: 'Host rent escalator (%/yr)' }),
    rentSharePct: rd(e, 'deal.rentSharePct', dl.rentSharePct, { def: 0, min: 0, max: 60, label: 'Host share of gross compute (%)' }),
    infraSharePct: rd(e, 'deal.infraSharePct', dl.infraSharePct, { def: 20, min: 0, max: 80, label: 'Infrastructure share of gross compute (%)' }),
    operatorPaysComputePower: bool(dl.operatorPaysComputePower, true),
    softCostPct: rd(e, 'deal.softCostPct', dl.softCostPct, { def: 8, min: 0, max: 50, label: 'Development and soft costs (% of hard cost)' }),
    insurancePct: rd(e, 'deal.insurancePct', dl.insurancePct, { def: 0.5, min: 0, max: 10, label: 'Insurance (% of capital cost a year)' }),
    lease: {
      rentPerYear: rd(e, 'deal.lease.rentPerYear', ls.rentPerYear, { def: 25000, min: 0, max: 1e8, label: 'Lease rent ($/yr)' }),
      escPct: rd(e, 'deal.lease.escPct', ls.escPct, { def: 2, min: -10, max: 20, label: 'Lease escalator (%/yr)' }),
      hostCapex: rd(e, 'deal.lease.hostCapex', ls.hostCapex, { def: 0, min: 0, max: 1e8, label: 'The host\'s own capital ($)' }),
      hostKeepsCharging: bool(ls.hostKeepsCharging, false),
      capRatePct: rd(e, 'deal.lease.capRatePct', ls.capRatePct, { def: 6, min: 1, max: 20, label: 'The cap rate (%)' })
    }
  };

  c.finance = {
    years: rd(e, 'finance.years', fi.years, { def: 10, min: 3, max: 25, int: true, label: 'The analysis term (years)' }),
    discountPct: rd(e, 'finance.discountPct', fi.discountPct, { def: 10, min: 0, max: 50, label: 'The discount rate (%)' }),
    inflationPct: rd(e, 'finance.inflationPct', fi.inflationPct, { def: 2.5, min: -5, max: 20, label: 'Inflation (%)' }),
    utilityEscPct: rd(e, 'finance.utilityEscPct', fi.utilityEscPct, { def: 3, min: -10, max: 20, label: 'Utility rate escalator (%/yr)' }),
    refreshFunding: pick(e, 'finance.refreshFunding', fi.refreshFunding, ['expense', 'reserve'], 'expense', 'The refresh funding'),
    tax: isObj(fi.tax) ? fi.tax : null,
    debt: isObj(fi.debt) ? fi.debt : null
  };
  return { cfg: c, errors: e };
}

/* ── THE SITE (built once per run, shared by every size the sweep tries) ── */
function prepare(c) {
  var loc = VS.locate(c.site.zip, c.site.market || null);
  if (!loc.ok) return { ok: false, errors: [err('site.zip', loc.error)] };
  var seg = c.site.hostType;
  var tariffSeg = seg === 'industrial' ? 'industrial' : 'commercial';
  var L = S.buildLoad({ load: c.load }, loc, seg);
  if (!L.ok) return { ok: false, errors: [err('load', L.error)] };
  var building = L.kw, h;
  var ct = S.calibratedTariff({ tariff: c.tariff }, loc, tariffSeg, L);
  if (!ct.ok) return { ok: false, errors: [err('tariff', ct.error)] };
  var t = ct.tf.tariff, price = S.priceSeries(t);
  var solar = c.solar.kwdc > 0 ? S.solarProfile(c.solar.kwdc, loc) : null;
  var limit = (c.service.kw + c.service.upgradeKw) * c.service.loadingPct / 100;

  /* The demand charges the monthly search prices: the flat charge per
     month and, when the tariff has one, the time-of-use demand period of
     every hour (first tier; the final bills use the whole tariff). */
  var flat = [], m;
  for (m = 0; m < 12; m++) {
    var fi = t.flatMonths[m];
    flat.push(fi >= 0 && t.flatRates[fi] && t.flatRates[fi][0] ? t.flatRates[fi][0].rate : 0);
  }
  var tou = null, touRate = null;
  if (t.hasTouDemand) {
    tou = new Int16Array(H);
    touRate = t.demandRates.map(function (r) { return r && r[0] ? r[0].rate : 0; });
    for (h = 0; h < H; h++) {
      var mo = S.monthOfHour(h), day = Math.floor(h / 24), hr = h % 24;
      tou[h] = (S.isWeekend(day) ? t.demandWeekend : t.demandWeekday)[mo][hr];
    }
  }
  /* On-peak, for the "off-peak only" on-demand schedule: an hour priced at
     its day's dearest energy rate when the day has a spread. */
  var onPeak = new Uint8Array(H);
  for (var d = 0; d < 365; d++) {
    var lo = Infinity, hi = -Infinity;
    for (h = d * 24; h < d * 24 + 24; h++) { if (price[h] < lo) lo = price[h]; if (price[h] > hi) hi = price[h]; }
    if (hi - lo > 1e-6) for (h = d * 24; h < d * 24 + 24; h++) if (price[h] >= hi - 1e-9) onPeak[h] = 1;
  }
  var bPeak = 0, bKwh = 0;
  for (h = 0; h < H; h++) { bKwh += building[h]; if (building[h] > bPeak) bPeak = building[h]; }
  return {
    ok: true, loc: loc, load: L, building: building, buildingPeak: bPeak, buildingKwh: bKwh,
    tariff: ct.tf, calib: ct.calib, t: t, price: price, solar: solar, limit: limit,
    flat: flat, tou: tou, touRate: touRate, onPeak: onPeak, wear: c.battery.wearPerKwh
  };
}

/* ── COMPUTE LOAD ────────────────────────────────────────────────────────── */
/* Per GPU at the meter: its rating plus the server's share, times cooling,
   at the draw it runs at serving or idle. */
function computeLoad(c, ctx, pods) {
  var k = c.compute, gpus = pods * k.gpusPerPod, rated = k.kwPerGpu * (1 + k.overheadPct / 100) * k.pue;
  var serve = rated * k.servePct / 100, idle = rated * k.idlePct / 100, delta = Math.max(0, serve - idle);
  var g = { offtake: gpus * k.tiers.offtake.sharePct / 100, edge: gpus * k.tiers.edge.sharePct / 100, spot: gpus * k.tiers.spot.sharePct / 100 };
  var firm = zeros(H), spotCap = zeros(H), edgeUsed = zeros(H), uE = k.tiers.edge.utilPct / 100, uS = k.tiers.spot.utilPct / 100;
  for (var h = 0; h < H; h++) {
    var hr = h % 24, sh = DEMAND_SHAPE[hr];
    var inEdge = hr >= k.edgeStart && hr < k.edgeEnd;
    var ue = inEdge ? Math.min(1, uE * sh) : 0;
    edgeUsed[h] = g.edge * ue;
    firm[h] = g.offtake * serve + g.edge * (ue * serve + (1 - ue) * idle) + g.spot * idle;
    var spotOk = k.spotMode !== 'offpeak' || !ctx.onPeak[h];
    spotCap[h] = spotOk ? g.spot * Math.min(1, uS * sh) : 0;
  }
  return { gpus: gpus, g: g, rated: rated, serve: serve, idle: idle, delta: delta, firm: firm, spotCap: spotCap, edgeUsed: edgeUsed,
           podKwRated: k.gpusPerPod * rated, podKwServe: k.gpusPerPod * serve };
}

/* ── EV SESSIONS ─────────────────────────────────────────────────────────── */
/* Expected sessions as cohorts: one per day and arrival hour, carrying its
   energy (at the meter, after charger losses), its window and the power its
   cars can draw together. Expected values, so a cohort may be a fraction of
   a car; the service check below also reports every port at full power. */
function evCohorts(c) {
  var v = c.ev, out = [];
  if (!(v.ports > 0) || !(v.sessionsPerPortDay > 0)) return out;
  var P = EV_PATTERNS[v.pattern], w = {}, tot = 0, hr;
  if (v.pattern === 'custom' || !P.arrive) {
    for (hr = v.arrivalStart; hr < v.arrivalEnd; hr++) { w[hr] = 1; tot++; }
  } else {
    for (hr in P.arrive) if (has(P.arrive, hr)) { w[hr] = P.arrive[hr]; tot += P.arrive[hr]; }
  }
  var dwell = v.dwellHours, eff = v.efficiencyPct / 100;
  var perSession = Math.min(v.kwhPerSession, v.kwPerPort * dwell * eff);
  for (var d = 0; d < 365; d++) {
    var n = v.ports * v.sessionsPerPortDay * (S.isWeekend(d) ? v.weekendFactor : 1);
    if (!(n > 0)) continue;
    for (hr in w) {
      if (!has(w, hr)) continue;
      var a = d * 24 + Number(hr), cars = n * w[hr] / tot;
      /* A typical year is cyclic: a car that arrives on the evening of
         31 December leaves on the morning of 1 January, not at midnight. */
      out.push({ a: a, z: a + dwell, cars: cars, kwh: cars * perSession / eff, pmax: cars * v.kwPerPort });
    }
  }
  return out;
}

/* Place every cohort's energy inside what the service leaves after the
   firm load. Unmanaged: as soon as the car arrives. Managed: its cheapest
   hours first without lifting the month's firm peak, then the lowest
   hours of its stay. Returns the hourly charging load and what could not
   be delivered. */
function planEv(c, ctx, cohorts, firm, managed, noLimit) {
  var ev = zeros(H), portCap = c.ev.ports * c.ev.kwPerPort, limit = noLimit ? Infinity : ctx.limit, unserved = 0, want = 0, i, h, j;
  var monthPeak = [];
  for (var m = 0; m < 12; m++) {
    var pk = 0; for (h = MS[m]; h < MS[m] + DAYS[m] * 24; h++) if (firm[h] > pk) pk = firm[h];
    monthPeak.push(pk);
  }
  function room(hh) { return Math.max(0, Math.min(limit - firm[hh] - ev[hh], portCap - ev[hh])); }
  var list = cohorts.slice();
  if (managed) list.sort(function (p, q) { return p.z - q.z || p.a - q.a; });
  /* cohorts that wrap past 31 December are placed first in January's
     hours by their true departure, so the EDF order above still holds */
  for (i = 0; i < list.length; i++) {
    var co = list[i], rem = co.kwh;
    want += co.kwh;
    if (!managed) {
      for (j = co.a; j < co.z && rem > 1e-9; j++) {
        h = j % H;
        var x = Math.min(rem, co.pmax, room(h));
        ev[h] += x; rem -= x;
      }
    } else {
      var hours = [], alloc = {};
      for (j = co.a; j < co.z; j++) hours.push(j % H);
      hours.sort(function (p, q) { return ctx.price[p] - ctx.price[q] || (firm[p] + ev[p]) - (firm[q] + ev[q]) || p - q; });
      for (j = 0; j < hours.length && rem > 1e-9; j++) {
        h = hours[j];
        var cap1 = Math.max(0, monthPeak[S.monthOfHour(h)] - firm[h] - ev[h]);
        var x1 = Math.min(rem, co.pmax, room(h), cap1);
        if (x1 > 0) { ev[h] += x1; rem -= x1; alloc[h] = x1; }
      }
      if (rem > 1e-9) {
        hours.sort(function (p, q) { return (firm[p] + ev[p]) - (firm[q] + ev[q]) || p - q; });
        for (j = 0; j < hours.length && rem > 1e-9; j++) {
          h = hours[j];
          var x2 = Math.min(rem, co.pmax - (alloc[h] || 0), room(h));
          if (x2 > 0) { ev[h] += x2; rem -= x2; }
        }
      }
    }
    unserved += Math.max(0, rem);
  }
  return { ev: ev, gridKwh: want - unserved, unservedKwh: unserved, wantKwh: want };
}

/* ── THE DISPATCH ────────────────────────────────────────────────────────── */
/* One month at demand target L. Priority follows the contracts: the
   building and firm compute first, charging (already placed), then the
   battery and on-demand GPUs.
     - a FIRM OVERLOAD hour (firm load above the service): on-demand GPUs
       stop, the battery discharges, anything left is lost firm compute;
     - the battery holds `firmAhead` — the energy firm overloads in the next
       24 hours will need — and when it holds less it charges now, under the
       hard limit, curtailing on-demand GPUs to make the room;
     - otherwise it holds the target L (never spending the firm reserve),
       then on-demand GPUs are curtailed; it charges with the room left in
       the day's cheapest hours (or when later hours today need it) and
       arbitrages a time-of-use spread that pays.
   `rec` writes the hours. Returns the month's value to the owner and the
   closing state of charge. */
function runMonth(ctx, m, L, soc, base, spotCap, cl, bat, curtailable, rec, firmAhead) {
  var a = MS[m], z = a + DAYS[m] * 24, P = bat.kw, E = bat.usable, ec = bat.eff, lim = ctx.limit, price = ctx.price;
  var energy = 0, peak = 0, spotRev = 0, dis = 0, chg = 0, curt = 0, over = 0, touPk = ctx.tou ? {} : null;
  var spotPrice = cl.spotPrice, sd = cl.delta, h;
  for (var d0 = a; d0 < z; d0 += 24) {
    var pMax = -Infinity, pMin = Infinity;
    for (h = d0; h < d0 + 24; h++) { if (price[h] > pMax) pMax = price[h]; if (price[h] < pMin) pMin = price[h]; }
    var spread = E > 0 && pMax * bat.rte - pMin > ctx.wear + 1e-6;
    /* energy the battery must still deliver today, from each hour on, to hold L */
    var later = new Float64Array(25);
    for (h = d0 + 23; h >= d0; h--) {
      var need = Math.max(0, base[h] + spotCap[h] * sd - L);
      later[h - d0] = later[h - d0 + 1] + Math.min(P, need);
    }
    for (h = d0; h < d0 + 24; h++) {
      var cap = spotCap[h], sold = cap, b = base[h], desired = b + sold * sd, dk = 0, ck = 0, lost = 0, n;
      var avail = soc * ec, resT = later[h - d0 + 1], resF = firmAhead ? firmAhead[h] : 0;
      if (b > lim + 1e-9) {
        sold = 0;
        if (P > 0) { dk = Math.min(P, avail, b - Math.min(L, lim)); soc -= dk / ec; }
        n = b - dk;
        if (n > lim) { lost = n - lim; n = lim; }
      } else if (P > 0 && resF > avail + 1e-9 && soc < E - 1e-9) {
        ck = Math.min(P, (E - soc) / ec, (resF - avail) / ec, Math.max(0, lim - b));
        soc += ck * ec;
        sold = sd > 0 ? Math.min(cap, Math.max(0, Math.min(L, lim) - b - ck) / sd) : cap;
        if (!curtailable && sd > 0) sold = Math.min(cap, Math.max(0, lim - b - ck) / sd);
        n = b + ck + sold * sd;
      } else if (desired > L + 1e-9) {
        var free = Math.max(0, avail - resF);
        var exB = Math.max(0, b - L), exS = desired - Math.max(b, L);
        if (P > 0) {
          var dB = Math.min(P, free, exB);
          var dS = Math.min(P - dB, Math.max(0, free - dB), exS);
          dk = dB + dS; soc -= dk / ec;
        }
        var ex = desired - dk - L;
        if (ex > 1e-9 && sd > 0 && sold > 0 && (curtailable || desired - dk > lim + 1e-9)) {
          var allow = curtailable ? ex : Math.max(0, desired - dk - lim);
          sold -= Math.min(sold, allow / sd);
        }
        n = b + sold * sd - dk;
        if (n > lim + 1e-9) { lost = n - lim; n = lim; }
      } else {
        var roomK = L - desired;
        if (spread && price[h] >= pMax - 1e-9 && avail > Math.max(resT, resF) + 1e-9 && P > 0) {
          dk = Math.min(P, avail - Math.max(resT, resF), Math.max(0, desired));
          soc -= dk / ec;
        } else if (P > 0 && roomK > 1e-9 && soc < E - 1e-9 && (price[h] <= pMin + 1e-9 || avail < resT || !spread)) {
          ck = Math.min(P, roomK, (E - soc) / ec);
          soc += ck * ec;
        }
        n = desired - dk + ck;
      }
      if (n < 0) n = 0;                 /* no export: surplus solar is not credited */
      energy += n * price[h];
      if (n > peak) peak = n;
      if (touPk) { var p = ctx.tou[h]; if (!(touPk[p] >= n)) touPk[p] = n; }
      spotRev += sold * spotPrice;
      dis += dk; chg += ck; curt += cap - sold; over += lost;
      if (rec) { rec.net[h] = n; rec.sold[h] = sold; rec.dis[h] = dk; rec.chg[h] = ck; rec.lost[h] = lost; rec.soc[h] = soc; }
    }
  }
  var demand = ctx.flat[m] * peak;
  if (touPk) for (var pp in touPk) if (has(touPk, pp)) demand += (ctx.touRate[pp] || 0) * touPk[pp];
  /* lost firm load is lost firm revenue: priced at the edge rate per GPU-hour */
  var value = spotRev - energy - demand - ctx.wear * dis - over / Math.max(cl.serve, 1e-9) * cl.firmPrice;
  return { value: value, soc: soc, peak: peak, energy: energy, demand: demand, spotRev: spotRev, dis: dis, chg: chg, curt: curt, over: over };
}

function dispatch(ctx, base, spotCap, cl, bat, spotMode) {
  var curtailable = spotMode !== 'always', lim = ctx.limit;
  var rec = { net: zeros(H), sold: zeros(H), dis: zeros(H), chg: zeros(H), lost: zeros(H), soc: zeros(H) };
  /* The energy firm overloads in the next 24 hours will ask of the battery
     (at most its power each hour), on a cyclic calendar. */
  var firmAhead = null;
  if (bat.kw > 0) {
    var ex = zeros(H), any = false, hh;
    for (hh = 0; hh < H; hh++) { ex[hh] = Math.min(bat.kw, Math.max(0, base[hh] - lim)); if (ex[hh] > 0) any = true; }
    if (any) {
      firmAhead = zeros(H);
      var run = 0;
      for (hh = 1; hh <= 24; hh++) run += ex[hh % H];
      for (hh = 0; hh < H; hh++) {
        firmAhead[hh] = run;
        run += ex[(hh + 25) % H] - ex[(hh + 1) % H];
      }
    }
  }
  var soc = bat.usable * 0.5, targets = [], months = [], m, h;
  for (m = 0; m < 12; m++) {
    var a = MS[m], z = a + DAYS[m] * 24, dMax = 0, bMax = 0;
    for (h = a; h < z; h++) {
      var dd = base[h] + spotCap[h] * cl.delta;
      if (dd > dMax) dMax = dd;
      if (base[h] > bMax) bMax = base[h];
    }
    var hi = Math.min(lim, dMax), lo = Math.max(0, Math.min(hi, (curtailable ? bMax : dMax) - bat.kw));
    var best = hi, bestV = -Infinity, i, L, v;
    if (hi - lo > 0.5 && (bat.kw > 0 || curtailable)) {
      var step = (hi - lo) / 16;
      for (i = 0; i <= 16; i++) {
        L = lo + step * i;
        v = runMonth(ctx, m, L, soc, base, spotCap, cl, bat, curtailable, null, firmAhead).value;
        if (v > bestV + 1e-6) { bestV = v; best = L; }
      }
      var from = Math.max(lo, best - step), to = Math.min(hi, best + step);
      for (i = 1; i < 8; i++) {
        L = from + (to - from) * i / 8;
        v = runMonth(ctx, m, L, soc, base, spotCap, cl, bat, curtailable, null, firmAhead).value;
        if (v > bestV + 1e-6) { bestV = v; best = L; }
      }
    }
    var r = runMonth(ctx, m, best, soc, base, spotCap, cl, bat, curtailable, rec, firmAhead);
    soc = r.soc;
    targets.push(best);
    months.push(r);
  }
  return { rec: rec, targets: targets, months: months };
}

/* ── ONE SIZE, ONE YEAR ──────────────────────────────────────────────────── */
function batteryOf(c, kw, kwh) {
  var rte = c.battery.rtePct / 100;
  return { kw: kw || 0, kwh: kwh || 0, usable: (kwh || 0) * c.battery.dodPct / 100, rte: rte, eff: Math.sqrt(rte) };
}

/* Everything physical about one configuration, and its year-one money. */
function evaluate(c, ctx, pods, bat, cohorts, cache) {
  var k = c.compute, cl = computeLoad(c, ctx, pods), h;
  cl.spotPrice = k.tiers.spot.price * k.availabilityPct / 100;
  cl.firmPrice = k.tiers.edge.price;
  var firm = zeros(H);
  for (h = 0; h < H; h++) firm[h] = ctx.building[h] - (ctx.solar ? ctx.solar[h] : 0) + cl.firm[h];
  var key = 'p' + pods, evp = cache && cache[key];
  if (!evp) {
    evp = planEv(c, ctx, cohorts, firm, c.ev.managed);
    if (cache) cache[key] = evp;
  }
  var base = zeros(H);
  for (h = 0; h < H; h++) base[h] = firm[h] + evp.ev[h];
  var D = dispatch(ctx, base, cl.spotCap, cl, bat, k.spotMode);
  var net = D.rec.net, sold = D.rec.sold;

  /* the year's physical totals */
  var computeKwh = 0, spotSoldH = 0, spotWantH = 0, edgeH = 0, overKwh = 0, overHours = 0, peak = 0, firmPeak = 0, disKwh = 0, chgKwh = 0;
  var overHourSet = 0;
  for (h = 0; h < H; h++) {
    computeKwh += cl.firm[h] + sold[h] * cl.delta;
    spotSoldH += sold[h]; spotWantH += cl.spotCap[h]; edgeH += cl.edgeUsed[h];
    overKwh += D.rec.lost[h]; if (D.rec.lost[h] > 1e-6) overHourSet++;
    if (net[h] > peak) peak = net[h];
    if (firm[h] > firmPeak) firmPeak = firm[h];
    disKwh += D.rec.dis[h]; chgKwh += D.rec.chg[h];
  }
  overHours = overHourSet;
  var lostGpuH = overKwh / Math.max(cl.serve, 1e-9);
  var av = k.availabilityPct / 100;
  var offtakeH = cl.g.offtake * H * av;
  var rev = {
    offtake: offtakeH * k.tiers.offtake.price,
    edge: Math.max(0, edgeH * av - lostGpuH) * k.tiers.edge.price,
    spot: spotSoldH * cl.spotPrice
  };
  var gross = rev.offtake + rev.edge + rev.spot;
  var evDelivered = evp.gridKwh * c.ev.efficiencyPct / 100;
  var bills = billsFor(ctx, net);
  return {
    pods: pods, gpus: cl.gpus, cl: cl, battery: bat, ev: evp, firm: firm, base: base, dispatch: D, net: net,
    peak: peak, firmPeak: firmPeak, overKwh: overKwh, overHours: overHours, lostGpuH: lostGpuH,
    gpuHours: { offtake: offtakeH, edge: edgeH * av, spot: spotSoldH, spotOffered: spotWantH },
    spotCurtailedGpuH: Math.max(0, spotWantH - spotSoldH),
    revenue: rev, grossCompute: gross,
    computeKwh: computeKwh, evGridKwh: evp.gridKwh, evDeliveredKwh: evDelivered, evRevenue: evDelivered * c.ev.pricePerKwh,
    batteryKwh: { discharged: disKwh, charged: chgKwh, losses: chgKwh - disKwh },
    bill: bills
  };
}

function billsFor(ctx, net) {
  var arr = new Array(H);
  for (var h = 0; h < H; h++) arr[h] = net[h] > 0 ? net[h] : 0;
  return S.bill(arr, ctx.t);
}

/* ── MONEY: capital, the operating schedule, the three structures ───────── */
function capexLines(c, pods, bat, who) {
  var k = c.compute, soft = 1 + c.deal.softCostPct / 100, out = [];
  function add(id, label, amount, asset, depClass) {
    if (amount > 0) out.push({ id: id, label: label, amount: Math.round(amount * soft), asset: asset, depClass: depClass });
  }
  var gpus = pods * k.gpusPerPod;
  if (who === 'own') add('gpu', 'GPU servers (' + fmt(gpus) + ' × ' + k.gpuShort + ')', gpus * k.capexPerGpu, 'other', 'macrs5');
  if (who !== 'lease') {
    add('pods', 'Compute pods, ' + pods + ' (enclosure, cooling, power, network)', pods * k.podInfraPerPod, 'other', 'macrs7');
    if (pods > 0) {
      add('makeready', 'Site electrical make-ready for the pods', k.makeReady, 'other', 'macrs7');
      add('fiber', 'Fiber backhaul installation', k.fiberInstall, 'other', 'macrs7');
    }
    if (!c.ev.existing && c.ev.ports > 0) add('ev', 'EV chargers, ' + c.ev.ports + ' ports at ' + c.ev.kwPerPort + ' kW', c.ev.ports * c.ev.capexPerPort, 'ev');
    if (bat.kwh > 0) {
      out.push({ id: 'bess', label: 'Battery, ' + fmt(bat.kw) + ' kW / ' + fmt(bat.kwh) + ' kWh', amount: Math.round(bat.kwh * c.battery.capexPerKwh * soft), asset: 'storage' });
    }
    if (c.solar.kwdc > 0) out.push({ id: 'solar', label: 'Solar, ' + fmt(c.solar.kwdc) + ' kW-dc', amount: Math.round(c.solar.kwdc * 1000 * c.solar.capexPerW * soft), asset: 'solar' });
    if (c.service.upgradeKw > 0 && c.service.upgradeCost > 0) add('upgrade', 'Service upgrade, +' + fmt(c.service.upgradeKw) + ' kW', c.service.upgradeCost, 'other', 'macrs15');
  } else if (c.deal.lease.hostCapex > 0) {
    out.push({ id: 'host', label: c.ev.ports > 0 ? 'Host\'s chargers and make-ready' : 'Host\'s make-ready', amount: Math.round(c.deal.lease.hostCapex), asset: c.ev.ports > 0 ? 'ev' : 'other', depClass: c.ev.ports > 0 ? undefined : 'macrs7' });
  }
  return out;
}

/* Year t's GPU price factor: the hardware's age since the last refresh,
   compounded at the decline; offtake re-prices only at each contract term. */
function refreshPlan(c, N) {
  var R = c.compute.refreshYears, events = [];
  if (R > 0) for (var y = R; y < N; y += R) if (N - y >= 2) events.push(y);
  return events;
}
function ageOf(t, events) {
  var start = 1;
  for (var i = 0; i < events.length; i++) if (t > events[i]) start = events[i] + 1;
  return t - start;
}

/* The year-by-year operating schedule for one structure. y1 is a full
   evaluate(); y0 the same site without the battery (the battery's value
   fades with its capacity, so its share of each line is kept apart). */
function schedule(c, y1, y0, who) {
  var N = c.finance.years, k = c.compute, dcl = k.priceDeclinePct / 100, esc = c.finance.utilityEscPct / 100, inf = c.finance.inflationPct / 100;
  var events = refreshPlan(c, N), fade = c.battery.fadePct / 100, t;
  var lines = { off: [], edge: [], spot: [], ev: [], share: [], rent: [], billUp: [], billDown: [], platform: [], hostRent: [],
                fiber: [], hwOm: [], podOm: [], evCost: [], batOm: [], ins: [], opRent: [] };
  var baseBill = y1.baseBill;
  var incWith = y1.bill.total - baseBill, incNo = y0 ? y0.bill.total - baseBill : incWith;
  var batBill = incWith - incNo;                           /* the battery's effect on the bill (≤ 0 is a saving) */
  var spotNo = y0 ? y0.revenue.spot : y1.revenue.spot, spotBat = y1.revenue.spot - spotNo;
  var capexTotal = 0, lines0 = capexLines(c, y1.pods, y1.battery, who);
  lines0.forEach(function (l) { capexTotal += l.amount; });
  var gpuCost = y1.pods * k.gpusPerPod * k.capexPerGpu;
  var kwhTotal = y1.computeKwh + y1.evGridKwh + y1.batteryKwh.losses;
  for (t = 1; t <= N; t++) {
    var age = ageOf(t, events), pf = Math.pow(1 - dcl, age);
    var offAge = age - age % k.offtakeTermYears, pfOff = Math.pow(1 - dcl, offAge);
    var ramp = t === 1 ? k.rampPct / 100 : 1, soh = Math.pow(1 - fade, t - 1), u = Math.pow(1 + esc, t - 1), g = Math.pow(1 + inf, t - 1);
    var off = y1.revenue.offtake * pfOff, edge = y1.revenue.edge * pf * ramp, spot = (spotNo + spotBat * soh) * pf * ramp;
    var gross = off + edge + spot;
    var evRev = y1.evRevenue * Math.pow(1 + c.ev.priceEscPct / 100, t - 1);
    var inc = (incNo + batBill * soh) * u;               /* the incremental bill this year */
    var computeShare = kwhTotal > 0 ? y1.computeKwh / kwhTotal : 0;
    lines.off.push(off); lines.edge.push(edge); lines.spot.push(spot); lines.ev.push(evRev);
    lines.share.push(gross * c.deal.infraSharePct / 100);
    lines.billUp.push(Math.max(0, inc)); lines.billDown.push(Math.max(0, -inc));
    lines.opRent.push(inc * computeShare);               /* what a compute operator reimburses for its power */
    lines.platform.push(gross * k.platformFeePct / 100);
    lines.hostRent.push(c.deal.rentPerYear * Math.pow(1 + c.deal.rentEscPct / 100, t - 1) + gross * c.deal.rentSharePct / 100);
    lines.fiber.push(y1.pods > 0 ? k.fiberPerMonth * 12 * g : 0);
    lines.hwOm.push(gpuCost * k.hwOmPct / 100 * g);
    lines.podOm.push(y1.pods * k.podOmPerYear * g);
    lines.evCost.push(c.ev.ports * (c.ev.networkPerPortYear + c.ev.omPerPortYear) * g + evRev * c.ev.processingPct / 100);
    lines.batOm.push(y1.battery.kwh * c.battery.omPerKwhYear * g);
    lines.ins.push(capexTotal * c.deal.insurancePct / 100 * g);
    lines.rent.push(c.deal.lease.rentPerYear * Math.pow(1 + c.deal.lease.escPct / 100, t - 1));
  }
  var rev = [], opex = [];
  function R(label, arr) { if (max(arr) > 0.5) rev.push({ label: label, schedule: arr.map(r0) }); }
  function O(id, label, arr) { if (max(arr) > 0.5) opex.push({ id: id, label: label, schedule: arr.map(r0) }); }
  if (who === 'own') {
    R('Compute: long-term offtake', lines.off);
    R('Compute: local edge contracts', lines.edge);
    R('Compute: on-demand overflow', lines.spot);
    R('EV charging', lines.ev);
    R('Building bill savings', lines.billDown);
    O('power', 'Electricity: the incremental utility bill', lines.billUp);
    O('platform', 'Operator platform fee (' + k.platformFeePct + '% of gross compute)', lines.platform);
    O('host', 'Host rent', lines.hostRent);
    O('fiber', 'Fiber backhaul', lines.fiber);
    O('hwom', 'GPU hardware O&M and warranty', lines.hwOm);
    O('podom', 'Pod O&M', lines.podOm);
    O('evops', 'Charger network, O&M and payment processing', lines.evCost);
    O('batom', 'Battery O&M', lines.batOm);
    O('ins', 'Insurance', lines.ins);
  } else if (who === 'infra') {
    R('Share of gross compute (' + c.deal.infraSharePct + '%)', lines.share);
    R('EV charging', lines.ev);
    R('Building bill savings', lines.billDown);
    var power = lines.billUp.map(function (b, i) {
      return c.deal.operatorPaysComputePower ? Math.max(0, b - Math.max(0, lines.opRent[i])) : b;
    });
    O('power', c.deal.operatorPaysComputePower ? 'Electricity: the incremental bill less the operator\'s compute power' : 'Electricity: the incremental utility bill', power);
    O('evops', 'Charger network, O&M and payment processing', lines.evCost);
    O('batom', 'Battery O&M', lines.batOm);
    O('ins', 'Insurance', lines.ins);
  } else {
    R('Lease rent from the compute operator', lines.rent);
    if (c.deal.lease.hostKeepsCharging) {
      R('EV charging', lines.ev);
      O('evops', 'Charger network, O&M and payment processing', lines.evCost);
    }
  }
  var totals = { gross: lines.off.map(function (x, i) { return x + lines.edge[i] + lines.spot[i]; }), refresh: events };
  return { revenue: rev, opex: opex, capex: lines0, capexTotal: capexTotal, events: events, gpuCost: gpuCost, totals: totals };
}

/* The finance engine's inputs for one structure. */
function engineInputs(c, ctx, y1, sch, who) {
  var s = c.site, N = c.finance.years, bat = y1.battery;
  var hasBat = bat.kwh > 0 && who !== 'lease', reps = [];
  if (hasBat && c.battery.lifeYears < N) reps.push({ year: c.battery.lifeYears, cost: Math.round(bat.kwh * c.battery.capexPerKwh * c.battery.replaceCostPct / 100) });
  var inp = {
    years: N,
    project: { name: s.name, sponsor: s.sponsor, host: s.host, hostDescription: s.hostDescription || HOST_WORDS[s.hostType],
               street: s.street, city: s.city, state: ctx.loc.state, zip: ctx.loc.zip, utility: s.utility,
               preparedDate: /^\d{4}-\d{2}-\d{2}$/.test(s.preparedDate) ? s.preparedDate : '',
               bocMonth: /^\d{4}-\d{2}$/.test(s.bocMonth) ? s.bocMonth : '', pisMonth: /^\d{4}-\d{2}$/.test(s.pisMonth) ? s.pisMonth : '' },
    solar: who !== 'lease' && c.solar.kwdc > 0 ? { kwDc: c.solar.kwdc, kwh1: Math.round(c.solar.kwdc * ctx.loc.solarYield) } : null,
    bess: hasBat ? { kw: bat.kw, kwh: bat.kwh, usableKwh: r2(bat.usable), dischargeKwh1: Math.round(y1.batteryKwh.discharged),
                     sizing: reps.length ? { replacements: reps } : null } : null,
    ev: c.ev.ports > 0 && (who !== 'lease' || c.deal.lease.hostKeepsCharging) ? { kw: r1(c.ev.ports * c.ev.kwPerPort) } : null,
    capex: { lines: sch.capex },
    revenue: { bess: { mode: hasBat ? 'site' : 'bundled' }, other: sch.revenue },
    opex: { lines: sch.opex },
    refresh: { mode: c.finance.refreshFunding, events: who === 'own' ? sch.events.map(function (y) {
      return { label: 'GPU refresh', year: y, cost: Math.round(sch.gpuCost * c.compute.refreshCostPct / 100) };
    }) : [] },
    discountPct: c.finance.discountPct,
    inflationPct: c.finance.inflationPct
  };
  if (c.finance.tax) inp.tax = c.finance.tax;
  if (c.finance.debt) {
    /* A compute lender lends over the hardware's life, not a solar tenor:
       seven years unless given, never past the term. */
    var dbt = JSON.parse(JSON.stringify(c.finance.debt));
    if (dbt.tenorYears == null || dbt.tenorYears === '') dbt.tenorYears = Math.min(7, N);
    inp.debt = dbt;
  }
  if (!inp.solar) inp.reserves = { equipment: { costPerW: 0 } };
  return inp;
}

/* A structure's returns: the engine's whole result, or for a lease with no
   capital, the value of the rent. */
function finance(c, ctx, y1, y0, who, full) {
  var sch = schedule(c, y1, y0, who);
  if (!(sch.capexTotal > 0)) {
    var d = c.finance.discountPct / 100, npv = 0, noi = 0, t;
    for (t = 1; t <= c.finance.years; t++) {
      var inc = 0, cost = 0;
      sch.revenue.forEach(function (l) { inc += l.schedule[t - 1]; });
      sch.opex.forEach(function (l) { cost += l.schedule[t - 1]; });
      if (t === 1) noi = inc - cost;
      npv += (inc - cost) / Math.pow(1 + d, t);
    }
    return { who: who, capital: 0, npv: npv, noi1: noi, valueUplift: noi / (c.deal.lease.capRatePct / 100), irr: null, schedule: sch, result: null };
  }
  var inp = engineInputs(c, ctx, y1, sch, who);
  var res = PF.run(inp);
  if (!res.ok) return { who: who, error: true, errors: res.errors, schedule: sch, inputs: inp };
  return { who: who, capital: sch.capexTotal, equity: res.sourcesUses.equity, irr: res.metrics.afterTaxIrr, npv: res.metrics.npv,
           payback: res.metrics.paybackYears, noi1: res.rows[0].ebitda, schedule: sch, inputs: inp, result: full ? res : null };
}

/* ── THE SCREEN ──────────────────────────────────────────────────────────── */
/* The Load Screen's gate ladder (editor.html patch 56), for a shared
   service instead of a substation: does the site advance, and what is the
   next thing that has to be true. */
function verdict(c, ctx, y1, necKw) {
  var lim = ctx.limit, unservedPct = y1.ev.wantKwh > 0 ? y1.ev.unservedKwh / y1.ev.wantKwh * 100 : 0;
  if (y1.firmPeak > lim + 1e-6 && y1.overKwh > 1e-3) {
    return { label: 'Not viable as configured', act: 'HOLD', tone: 'bad',
             gate: 'Firm load reaches ' + fmt(y1.firmPeak) + ' kW against a ' + fmt(lim) + ' kW limit for ' + y1.overHours +
                   ' hours: fewer pods, a battery sized to cover it, or a service upgrade' };
  }
  if (y1.overKwh > 1e-3) {
    return { label: 'Not viable as configured', act: 'HOLD', tone: 'bad',
             gate: fmt(y1.overHours) + ' hours exceed the service even with the battery: fewer pods or a larger battery' };
  }
  if (unservedPct > 5) {
    return { label: 'Viable for compute; charging is squeezed', act: 'VERIFY', tone: 'warn',
             gate: r1(unservedPct) + '% of the charging energy cannot be delivered before cars leave: ' +
                   (c.ev.managed ? 'fewer pods, a battery or a service upgrade' : 'manage the charging') };
  }
  if (!c.ev.managed && necKw > lim) {
    return { label: 'Viable only with load management', act: 'VERIFY', tone: 'warn',
             gate: 'Every charger at full power plus firm load is ' + fmt(necKw) + ' kW: install an EV energy management system (NEC 625.42)' };
  }
  if (y1.peak <= lim * 0.85) {
    return { label: 'Viable — fits the existing service', act: 'ADVANCE', tone: 'ok',
             gate: 'Utility notice of added load, then the panel and fiber survey' };
  }
  return { label: 'Viable — tight margin', act: 'ADVANCE', tone: 'ok',
           gate: 'A load study on the service and transformer before design' };
}

/* ── RESULT ASSEMBLY ─────────────────────────────────────────────────────── */
function dayOf(y1, ctx, day) {
  var out = [], rec = y1.dispatch.rec, cl = y1.cl;
  for (var h = day * 24; h < day * 24 + 24; h++) {
    out.push({ hour: h % 24, building: r1(ctx.building[h]), solar: ctx.solar ? r1(ctx.solar[h]) : 0,
               computeFirm: r1(cl.firm[h]), computeSpot: r1(rec.sold[h] * cl.delta), ev: r1(y1.ev.ev[h]),
               charge: r1(rec.chg[h]), discharge: r1(rec.dis[h]), net: r1(rec.net[h]),
               curtailedGpus: r1(cl.spotCap[h] - rec.sold[h]), soc: r1(rec.soc[h]) });
  }
  return out;
}
function sampleDays(y1, ctx) {
  function busiest(fromM, toM, weekend) {
    var best = -1, bd = MS[fromM] / 24;
    for (var h = MS[fromM]; h < MS[toM] + DAYS[toM] * 24; h++) {
      var d = Math.floor(h / 24);
      if (S.isWeekend(d) !== weekend) continue;
      var v = y1.base[h] + y1.cl.spotCap[h] * y1.cl.delta;
      if (v > best) { best = v; bd = d; }
    }
    return bd;
  }
  return [
    { key: 'summer', label: 'Peak summer weekday', day: busiest(5, 7, false) },
    { key: 'winter', label: 'Peak winter weekday', day: busiest(0, 1, false) },
    { key: 'weekend', label: 'Busiest weekend day', day: busiest(0, 11, true) }
  ].map(function (d) { return { key: d.key, label: d.label, date: dateOf(d.day), hours: dayOf(y1, ctx, d.day) }; });
}
function dateOf(day) {
  var m = S.monthOfHour(day * 24);
  return MONTH_NAMES[m] + ' ' + (day - MS[m] / 24 + 1);
}

function monthly(y1, ctx) {
  var out = [], rec = y1.dispatch.rec;
  for (var m = 0; m < 12; m++) {
    var a = MS[m], z = a + DAYS[m] * 24, pb = 0, pa = 0, pUn = 0, kB = 0, kC = 0, kE = 0, curt = 0;
    for (var h = a; h < z; h++) {
      if (ctx.building[h] > pb) pb = ctx.building[h];
      if (rec.net[h] > pa) pa = rec.net[h];
      var un = y1.base[h] + y1.cl.spotCap[h] * y1.cl.delta;
      if (un > pUn) pUn = un;
      kB += ctx.building[h]; kC += y1.cl.firm[h] + rec.sold[h] * y1.cl.delta; kE += y1.ev.ev[h];
      curt += y1.cl.spotCap[h] - rec.sold[h];
    }
    out.push({ month: m, name: MONTH_NAMES[m], buildingPeakKw: r1(pb), peakWithoutBatteryKw: r1(pUn), peakKw: r1(pa),
               targetKw: r1(y1.dispatch.targets[m]), buildingKwh: r0(kB), computeKwh: r0(kC), evKwh: r0(kE),
               curtailedGpuHours: r0(curt), bill: r0(y1.bill.months[m] ? y1.bill.months[m].subtotal : 0),
               baseBill: r0(y1.baseBillMonths[m] ? y1.baseBillMonths[m].subtotal : 0) });
  }
  return out;
}

/* A duration curve of the site's load (and of the load with no battery or
   curtailment), 52 points: what the service carries, hour by hour, sorted. */
function duration(y1) {
  var a = Array.prototype.slice.call(y1.net).sort(function (p, q) { return q - p; });
  var u = [];
  for (var h = 0; h < H; h++) u.push(y1.base[h] + y1.cl.spotCap[h] * y1.cl.delta);
  u.sort(function (p, q) { return q - p; });
  var out = [];
  for (var i = 0; i <= 51; i++) {
    var idx = Math.min(H - 1, Math.round(i / 51 * (H - 1)));
    out.push({ hours: idx + 1, kw: r1(a[idx]), unmanagedKw: r1(u[idx]) });
  }
  return out;
}

function story(c, ctx, y1, who, res) {
  var k = c.compute, place = [c.site.city, ctx.loc.state].filter(Boolean).join(', ');
  var parts = [];
  if (y1.pods > 0) parts.push(y1.pods + ' ' + k.gpuShort + ' pod' + (y1.pods === 1 ? '' : 's'));
  if (c.ev.ports > 0) parts.push(c.ev.ports + ' EV ports');
  if (y1.battery.kwh > 0) parts.push(fmt(y1.battery.kw) + ' kW / ' + fmt(y1.battery.kwh) + ' kWh battery');
  var title = parts.join(' + ') + (place ? ' in ' + place : '');
  if (title.length > 64) title = parts.slice(0, 2).join(' + ') + (place ? ' in ' + place : '');
  var flow = [];
  if (y1.pods > 0) flow.push(['compute', fmt(y1.gpus) + ' ' + k.gpuShort + ' GPUs', y1.pods + ' pod' + (y1.pods === 1 ? '' : 's') + ', ' + fmt(y1.cl.podKwServe * y1.pods) + ' kW serving']);
  if (c.ev.ports > 0) flow.push(['ev', c.ev.ports + ' EV ports', (c.ev.managed ? 'Managed' : 'Unmanaged') + ' charging, ' + fmt(c.ev.ports * c.ev.kwPerPort) + ' kW']);
  if (y1.battery.kwh > 0) flow.push(['bess', fmt(y1.battery.kw) + ' kW / ' + fmt(y1.battery.kwh) + ' kWh BESS', 'Holds the service limit and the peak']);
  if (c.solar.kwdc > 0) flow.unshift(['solar', fmt(c.solar.kwdc) + ' kW DC Solar', 'On the host site']);
  flow.push(['host', c.site.host || 'Site host', HOST_TYPES[c.site.hostType] + (c.site.city ? ', ' + c.site.city : '')]);
  flow.push(['grid', 'Existing service', fmt(c.service.kw) + ' kW' + (c.service.volts ? ' at ' + fmt(c.service.volts) + ' V' : '') + ', shared']);
  var terms = [c.finance.years + '-year analysis'];
  if (who === 'own') terms.push('Compute sold ' + k.tiers.offtake.sharePct + '% offtake · ' + k.tiers.edge.sharePct + '% edge · ' + k.tiers.spot.sharePct + '% on-demand');
  if (who === 'own' && (c.deal.rentPerYear > 0 || c.deal.rentSharePct > 0)) terms.push('Host rent ' + money(c.deal.rentPerYear) + '/yr' + (c.deal.rentSharePct ? ' + ' + c.deal.rentSharePct + '% of gross' : ''));
  if (who === 'infra') terms.push(c.deal.infraSharePct + '% of gross compute revenue to the project');
  if (who === 'lease') terms.push('Rent ' + money(c.deal.lease.rentPerYear) + '/yr, electricity paid');
  var m = res && res.metrics, su = res && res.sourcesUses;
  var who1 = c.site.sponsor || 'The sponsor';
  var sys = [];
  if (y1.pods > 0) sys.push(fmt(y1.gpus) + ' ' + k.gpuShort + ' GPUs in ' + y1.pods + ' compute pod' + (y1.pods === 1 ? '' : 's'));
  if (c.ev.ports > 0) sys.push(c.ev.ports + ' EV charging ports');
  if (y1.battery.kwh > 0) sys.push('a ' + fmt(y1.battery.kw) + ' kW / ' + fmt(y1.battery.kwh) + ' kWh battery');
  var where = (c.site.host ? ' at ' + c.site.host : '') + (place ? ' in ' + place : '');
  var narrative = su ? who1 + ' is seeking ' + ask(su.equity) + ' investment in a project that installs ' + listWords(sys) + where +
    ', on the building\'s existing ' + fmt(c.service.kw) + ' kW service. ' +
    (who === 'own' ? 'The project sells GPU-hours to inference customers and charging to drivers, and pays the site\'s added electricity. '
      : who === 'infra' ? 'The project owns the power and pod layer and receives ' + c.deal.infraSharePct + '% of gross compute revenue from the operator that owns the GPUs. '
      : 'The host leases the power to a compute operator. ') +
    'An hour-by-hour model of the building, the chargers, the compute and the battery holds the service below ' + fmt(ctx.limit) +
    ' kW' + (y1.overKwh > 0 ? ' except ' + fmt(y1.overHours) + ' hours' : '') + ', and the owner captures the project\'s ' +
    (res.tax && res.tax.itc && res.tax.itc.face > 0 ? 'investment tax credit and depreciation benefits.' : 'depreciation benefits.') : '';
  return { title: title, flow: flow, terms: terms, narrative: narrative };
}
function ask(v) {
  if (v >= 1e6) { var m = (Math.round(v / 1e4) / 100).toFixed(2); return (/^8/.test(m) ? 'an' : 'a') + ' $' + m + ' million'; }
  var k = Math.round(v / 1000) * 1000; return (/^8/.test(String(k)) || /^1[18],/.test(fmt(k)) ? 'an' : 'a') + ' ' + money(k);
}
function listWords(a) { return a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }

/* ── THE RUNS ────────────────────────────────────────────────────────────── */
function start(input) {
  var rd0 = read(input);
  if (rd0.errors.length) return { ok: false, errors: rd0.errors };
  var c = rd0.cfg, ctx = prepare(c);
  if (!ctx.ok) return { ok: false, errors: ctx.errors };
  ctx.baseBill = S.bill(Array.prototype.slice.call(ctx.building), ctx.t);
  return { ok: true, c: c, ctx: ctx, cohorts: evCohorts(c), cache: {} };
}
function full(run, pods, kw, kwh) {
  var c = run.c, ctx = run.ctx;
  var y1 = evaluate(c, ctx, pods, batteryOf(c, kw, kwh), run.cohorts, run.cache);
  y1.baseBill = ctx.baseBill.total; y1.baseBillMonths = ctx.baseBill.months;
  var y0 = null;
  if (kwh > 0) {
    y0 = run.cache['y0p' + pods];
    if (!y0) {
      y0 = evaluate(c, ctx, pods, batteryOf(c, 0, 0), run.cohorts, run.cache);
      y0.baseBill = ctx.baseBill.total; y0.baseBillMonths = ctx.baseBill.months;
      run.cache['y0p' + pods] = y0;
    }
  } else {
    run.cache['y0p' + pods] = y1;
  }
  return { y1: y1, y0: y0 };
}

/* The screen alone: will it fit, and what does year one look like. */
function screen(input) {
  var run = start(input);
  if (!run.ok) return run;
  var c = run.c, ctx = run.ctx, f = full(run, c.compute.pods, c.battery.kw, c.battery.kwh);
  return assembleScreen(c, ctx, f.y1, f.y0, run);
}

function assembleScreen(c, ctx, y1, y0, run) {
  var necKw = ctx.buildingPeak + y1.cl.podKwServe * y1.pods + c.ev.ports * c.ev.kwPerPort;
  var unm = planEv(c, ctx, run.cohorts, y1.firm, false, true), unmPeak = 0;
  for (var h = 0; h < H; h++) { var v = y1.firm[h] + unm.ev[h]; if (v > unmPeak) unmPeak = v; }
  var v1 = verdict(c, ctx, y1, necKw);
  var unservedPct = y1.ev.wantKwh > 0 ? y1.ev.unservedKwh / y1.ev.wantKwh * 100 : 0;
  var qRank = { high: 3, medium: 2, low: 1 }, tq = ctx.tariff.source === 'planning' ? (ctx.calib ? 'medium' : 'low') : 'high';
  var confidence = qRank[ctx.load.quality] <= qRank[tq] ? ctx.load.quality : tq;
  var podsFit = y1.cl.podKwServe > 0 ? Math.max(0, Math.floor((ctx.limit - ctx.buildingPeak) / y1.cl.podKwServe)) : null;
  return {
    ok: true, version: VERSION,
    site: { zip: ctx.loc.zip, state: ctx.loc.state, market: ctx.loc.market, marketName: ctx.loc.marketName, area: ctx.loc.area,
            hostType: c.site.hostType, hostTypeLabel: HOST_TYPES[c.site.hostType], climate: ctx.loc.climate },
    service: { kw: r1(c.service.kw), upgradeKw: c.service.upgradeKw, loadingPct: c.service.loadingPct, limitKw: r1(ctx.limit),
               amps: c.service.amps, volts: c.service.volts, phases: c.service.phases },
    load: { source: ctx.load.source, label: ctx.load.label, quality: ctx.load.quality, notes: ctx.load.notes,
            annualKwh: r0(ctx.buildingKwh), peakKw: r1(ctx.buildingPeak) },
    tariff: { source: ctx.tariff.source, label: ctx.tariff.label, rates: ctx.tariff.rates || null, calibration: ctx.calib },
    compute: { gpuClass: c.compute.gpuClass, gpuName: c.compute.gpuName, pods: y1.pods, gpus: y1.gpus,
               gpusByTier: { offtake: r1(y1.cl.g.offtake), edge: r1(y1.cl.g.edge), spot: r1(y1.cl.g.spot) },
               kwPerGpuAtMeter: r2(y1.cl.rated), podKwRated: r1(y1.cl.podKwRated), podKwServing: r1(y1.cl.podKwServe),
               kwh: r0(y1.computeKwh), gpuHours: { offtake: r0(y1.gpuHours.offtake), edge: r0(y1.gpuHours.edge), spot: r0(y1.gpuHours.spot),
               spotOffered: r0(y1.gpuHours.spotOffered), spotCurtailed: r0(y1.spotCurtailedGpuH), firmLost: r0(y1.lostGpuH) },
               revenue: { offtake: r0(y1.revenue.offtake), edge: r0(y1.revenue.edge), spot: r0(y1.revenue.spot), gross: r0(y1.grossCompute) },
               prices: { offtake: c.compute.tiers.offtake.price, edge: c.compute.tiers.edge.price, spot: c.compute.tiers.spot.price },
               podsThatFitWithoutBattery: podsFit },
    ev: { ports: c.ev.ports, kwPerPort: c.ev.kwPerPort, pattern: c.ev.pattern, patternLabel: EV_PATTERNS[c.ev.pattern].label,
          managed: c.ev.managed, nameplateKw: r1(c.ev.ports * c.ev.kwPerPort), wantKwh: r0(y1.ev.wantKwh), gridKwh: r0(y1.ev.gridKwh),
          deliveredKwh: r0(y1.evDeliveredKwh), unservedKwh: r0(y1.ev.unservedKwh), unservedPct: r1(unservedPct),
          revenue: r0(y1.evRevenue), unmanagedPeakKw: r1(unmPeak) },
    battery: { kw: y1.battery.kw, kwh: y1.battery.kwh, usableKwh: r1(y1.battery.usable), dischargedKwh: r0(y1.batteryKwh.discharged),
               cyclesPerYear: y1.battery.usable > 0 ? r0(y1.batteryKwh.discharged / y1.battery.usable) : 0,
               spotEnabled: y0 ? r0(y1.revenue.spot - y0.revenue.spot) : 0,
               billEffect: y0 ? r0(y1.bill.total - y0.bill.total) : 0 },
    solar: c.solar.kwdc > 0 ? { kwdc: c.solar.kwdc, annualKwh: r0(c.solar.kwdc * ctx.loc.solarYield) } : null,
    balance: { limitKw: r1(ctx.limit), peakKw: r1(y1.peak), firmPeakKw: r1(y1.firmPeak), headroomKw: r1(ctx.limit - y1.peak),
               necNameplateKw: r1(necKw), overloadHours: y1.overHours, overloadKwh: r0(y1.overKwh),
               utilisationPct: r1(y1.peak / ctx.limit * 100) },
    bill: { baseline: r0(y1.baseBill), withProject: r0(y1.bill.total), incremental: r0(y1.bill.total - y1.baseBill),
            withoutBattery: y0 ? r0(y0.bill.total) : null },
    verdict: v1,
    days: sampleDays(y1, ctx),
    months: monthly(y1, ctx),
    duration: duration(y1),
    confidence: confidence,
    refs: REFS
  };
}

/* The pro forma: the screen, the chosen structure's full finance result,
   the other two structures side by side, and the compute sensitivities. */
function model(input) {
  var run = start(input);
  if (!run.ok) return run;
  var c = run.c, ctx = run.ctx, who = c.deal.structure;
  var f = full(run, c.compute.pods, c.battery.kw, c.battery.kwh), y1 = f.y1, y0 = f.y0;
  var out = assembleScreen(c, ctx, y1, y0, run);
  var main = finance(c, ctx, y1, y0, who, true);
  if (main.error) return { ok: false, errors: main.errors.map(function (x) { return err('finance.' + x.field, x.message); }) };
  var deals = {};
  Object.keys(STRUCTURES).forEach(function (k) {
    var d = k === who ? main : finance(c, ctx, y1, y0, k, false);
    deals[k] = { key: k, label: STRUCTURES[k], capital: r0(d.capital || 0), equity: d.equity != null ? r0(d.equity) : null,
                 irr: d.irr != null ? d.irr : null, npv: d.npv != null ? r0(d.npv) : null,
                 payback: d.payback != null ? r2(d.payback) : null, year1: r0(d.noi1 || 0),
                 valueUplift: d.valueUplift != null ? r0(d.valueUplift) : null, error: d.error ? true : false };
  });
  var res = main.result;
  if (res) {
    res.sensitivity = res.sensitivity.concat(computeSensitivity(c, ctx, y1, y0, who, res));
    res.warnings = siteWarnings(c, ctx, y1, out).concat(res.warnings || []);
    res.assumptions = siteAssumptions(c, ctx, y1, y0, who, main.schedule).concat(res.assumptions || []);
  }
  out.structure = { key: who, label: STRUCTURES[who] };
  out.deals = deals;
  out.schedule = { refreshYears: main.schedule.events, revenue: main.schedule.revenue, opex: main.schedule.opex, capex: main.schedule.capex };
  out.proforma = res;
  out.lease = who === 'lease' && !res ? deals.lease : null;
  out.story = story(c, ctx, y1, who, res || { metrics: null, sourcesUses: null });
  out.disclaimer = 'A screening model by ClearSky-OMEGA: one year of hourly load on the existing service, and the investor case built on it by ' +
    'the BESS Pro Forma\'s finance engine. It is not a compute operator\'s offer, a utility load study or a tax opinion; planning figures are marked.';
  return out;
}

function computeSensitivity(c, ctx, y1, y0, who, base) {
  var out = [], baseIrr = base.metrics.afterTaxIrr;
  function add(key, label, mod) {
    var sch = schedule(c, y1, y0, who);
    mod(sch);
    var inp = engineInputs(c, ctx, y1, sch, who);
    var r = PF.run(inp);
    if (!r.ok) return;
    var v = r.metrics.afterTaxIrr;
    out.push({ key: key, label: label, afterTaxIrr: v, delta: v == null || baseIrr == null ? null : v - baseIrr });
  }
  function scaleRev(re, f) {
    return function (sch) { sch.revenue.forEach(function (l) { if (re.test(l.label)) l.schedule = l.schedule.map(function (x) { return Math.round(x * f); }); }); };
  }
  if (y1.pods > 0 && who !== 'lease') {
    add('gpu-20', 'GPU-hour prices −20%', scaleRev(/Compute|Share of gross/, 0.8));
    add('gpu+20', 'GPU-hour prices +20%', scaleRev(/Compute|Share of gross/, 1.2));
    var uE = c.compute.tiers.edge.utilPct, uS = c.compute.tiers.spot.utilPct;
    if (uE > 10 && uS > 10) {
      add('util-10', 'Edge and on-demand utilisation −10 points', function (sch) {
        sch.revenue.forEach(function (l) {
          var f = /edge/.test(l.label) ? (uE - 10) / uE : /on-demand/.test(l.label) ? (uS - 10) / uS : null;
          if (/Share of gross/.test(l.label)) {
            var share = (y1.revenue.offtake + y1.revenue.edge * (uE - 10) / uE + y1.revenue.spot * (uS - 10) / uS) / Math.max(1, y1.grossCompute);
            f = share;
          }
          if (f != null) l.schedule = l.schedule.map(function (x) { return Math.round(x * f); });
        });
      });
    }
  }
  add('power+25', 'Electricity rates +25%', function (sch) {
    sch.opex.forEach(function (l) { if (l.id === 'power') l.schedule = l.schedule.map(function (x) { return Math.round(x * 1.25); }); });
  });
  if (c.ev.ports > 0) add('ev-25', 'Charging sessions −25%', scaleRev(/^EV charging/, 0.75));
  return out;
}

function siteWarnings(c, ctx, y1, s) {
  var w = [];
  function add(level, code, text) { w.push({ level: level, code: code, text: text }); }
  if (y1.overKwh > 1e-3) add('critical', 'SERVICE_OVERLOAD', fmt(y1.overHours) + ' hours need more than the ' + fmt(ctx.limit) + ' kW the service may carry; ' +
    fmt(y1.lostGpuH) + ' firm GPU-hours are lost and counted as lost revenue. Fewer pods, a larger battery or a service upgrade fixes it.');
  if (s.ev.unservedPct > 1) add(s.ev.unservedPct > 5 ? 'warn' : 'info', 'EV_UNSERVED', r1(s.ev.unservedPct) + '% of the charging energy drivers want (' +
    fmt(s.ev.unservedKwh) + ' kWh a year) cannot be delivered before they leave, inside what the service has left.');
  if (!c.ev.managed && s.balance.necNameplateKw > ctx.limit) add('warn', 'NEC_UNMANAGED', 'Every charger at full power plus the building and the compute is ' +
    fmt(s.balance.necNameplateKw) + ' kW against a ' + fmt(ctx.limit) + ' kW limit: the chargers need an EV energy management system (NEC 625.42).');
  if (s.compute.gpuHours.spotCurtailed > 0 && y1.pods > 0) add('info', 'SPOT_CURTAILED', fmt(s.compute.gpuHours.spotCurtailed) + ' on-demand GPU-hours (' +
    r1(s.compute.gpuHours.spotCurtailed / Math.max(1, s.compute.gpuHours.spotOffered) * 100) + '% of those offered) are curtailed to hold the peak where that earns more.');
  if (ctx.tariff.source === 'planning') add(ctx.calib ? 'info' : 'warn', 'PLANNING_RATE', 'The electricity is priced on a planning rate for ' + ctx.loc.marketName +
    (ctx.calib ? ', scaled to the bills\' dollars' : '') + ': the utility\'s own tariff (a URDB record) replaces it.');
  if (ctx.load.source === 'profile') add('warn', 'LOAD_ASSUMED', 'The building\'s load is a typical shape, not this building\'s: 12 months of bills or an interval file replaces it.');
  if (y1.pods > 0) add('info', 'GPU_PRICES', 'GPU-hour prices are planning figures set below September 2026 cloud list; the compute operator\'s contract replaces them.');
  return w;
}

function siteAssumptions(c, ctx, y1, y0, who, sch) {
  var k = c.compute, a = [];
  a.push('The site is simulated for 8,760 hours on one service limit of ' + fmt(ctx.limit) + ' kW (' + fmt(c.service.kw) + ' kW' +
    (c.service.upgradeKw ? ' plus a ' + fmt(c.service.upgradeKw) + ' kW upgrade' : '') + ' at ' + c.service.loadingPct + '% continuous loading).');
  if (y1.pods > 0) {
    a.push(fmt(y1.gpus) + ' ' + k.gpuShort + ' GPUs draw ' + r2(y1.cl.rated) + ' kW each at the meter at full rating (' + k.kwPerGpu + ' kW, ' +
      k.overheadPct + '% server overhead, PUE ' + k.pue + '), ' + k.servePct + '% of that serving and ' + k.idlePct + '% idle.');
    a.push('Compute is sold ' + k.tiers.offtake.sharePct + '% on long-term offtake at $' + k.tiers.offtake.price + '/GPU-hr (take-or-pay), ' +
      k.tiers.edge.sharePct + '% on edge contracts at $' + k.tiers.edge.price + ' used ' + k.tiers.edge.utilPct + '% of the time on average, and ' +
      k.tiers.spot.sharePct + '% on demand at $' + k.tiers.spot.price + ' used ' + k.tiers.spot.utilPct + '% on average, both following a diurnal ' +
      'inference curve; ' + k.availabilityPct + '% hardware availability.');
    a.push('GPU-hour prices fall ' + k.priceDeclinePct + '% for each year of the hardware\'s age' +
      (sch.events.length ? ' and reset when the GPUs are refreshed in year ' + sch.events.join(' and ') : '') +
      '; offtake is re-priced every ' + k.offtakeTermYears + ' years; year one runs at ' + k.rampPct + '% of the steady utilisation.');
  }
  if (c.ev.ports > 0) {
    a.push(c.ev.ports + ' ports at ' + c.ev.kwPerPort + ' kW host ' + c.ev.sessionsPerPortDay + ' session(s) a port on a weekday (' +
      c.ev.weekendFactor + '× on weekends) of ' + c.ev.kwhPerSession + ' kWh, arriving ' + EV_PATTERNS[c.ev.pattern].label.toLowerCase() +
      ' and staying ' + c.ev.dwellHours + ' hours; ' + (c.ev.managed ? 'managed charging places each session in its cheapest hours without setting a new peak' :
      'unmanaged charging starts on arrival, held under the service by the panel\'s load management') + '; drivers pay $' + c.ev.pricePerKwh + '/kWh.');
  }
  if (y1.battery.kwh > 0) {
    a.push('The ' + fmt(y1.battery.kw) + ' kW / ' + fmt(y1.battery.kwh) + ' kWh battery (' + c.battery.rtePct + '% round trip, ' + c.battery.dodPct +
      '% usable) holds a monthly demand target searched for the most value, charges in the cheapest hours with room, and fades ' + c.battery.fadePct + '% a year.');
  }
  a.push('Electricity is the whole meter billed with the project less the building billed alone, on ' + ctx.tariff.label + '; it escalates ' +
    c.finance.utilityEscPct + '% a year. Surplus solar is not credited.');
  if (who === 'own') a.push('The project pays the operator\'s platform fee of ' + k.platformFeePct + '% of gross compute' +
    (c.deal.rentPerYear || c.deal.rentSharePct ? ' and the host ' + money(c.deal.rentPerYear) + ' a year' + (c.deal.rentSharePct ? ' plus ' + c.deal.rentSharePct + '% of gross compute' : '') : '') + '.');
  if (who === 'infra') a.push('The compute operator owns and refreshes the GPUs and pays the project ' + c.deal.infraSharePct + '% of gross compute revenue' +
    (c.deal.operatorPaysComputePower ? ', and pays for the compute\'s share of the added electricity' : '') + '.');
  a.push('Capital costs carry ' + c.deal.softCostPct + '% development and soft costs; GPU servers are 5-year MACRS, pods, make-ready and fiber 7-year, chargers ' +
    '5-year, a service upgrade 15-year; the battery and solar are energy property with their credit.');
  return a;
}

/* ── THE SIZING SWEEP ────────────────────────────────────────────────────── */
/* Pods × battery sizes, each run through the dispatch and the finance
   engine; the best is the highest NPV that fits (no firm overload, under
   5% unserved charging). */
function optimize(input) {
  var run = start(input);
  if (!run.ok) return run;
  var c = run.c, ctx = run.ctx, who = c.deal.structure === 'lease' ? 'own' : c.deal.structure;
  var cl1 = computeLoad(c, ctx, 1), podKw = cl1.podKwServe;
  var room = Math.max(0, ctx.limit - ctx.buildingPeak * 0.6);
  var maxPods = Math.max(1, Math.min(40, Math.ceil(room / Math.max(podKw, 1)) + 1));
  var podsList = [], step = Math.max(1, Math.ceil(maxPods / 12));
  for (var p = 1; p <= maxPods; p += step) podsList.push(p);
  if (podsList.indexOf(c.compute.pods) < 0 && c.compute.pods > 0) podsList.push(c.compute.pods);
  podsList.sort(function (a, b) { return a - b; });
  /* Batteries scaled to the service: a tenth, a quarter and two-fifths of
     the limit for two hours, the largest for four, and the user's own. */
  var sizes = [[0, 0]], seen = { '0/0': true };
  function addSize(kw, kwh) {
    var key = kw + '/' + kwh;
    if (kw > 0 && kwh > 0 && !seen[key]) { seen[key] = true; sizes.push([kw, kwh]); }
  }
  var kws = [0.1, 0.25, 0.4].map(function (f) { return Math.max(25, Math.round(ctx.limit * f / 25) * 25); });
  kws.forEach(function (kw) { addSize(kw, kw * 2); });
  addSize(kws[2], kws[2] * 4);
  if (c.battery.kwh > 0) addSize(c.battery.kw, c.battery.kwh);
  sizes.sort(function (a, b) { return a[1] - b[1] || a[0] - b[0]; });
  var grid = [], best = null, t0 = Date.now();
  for (var i = 0; i < podsList.length; i++) {
    for (var j = 0; j < sizes.length; j++) {
      var f = full(run, podsList[i], sizes[j][0], sizes[j][1]);
      var y1 = f.y1, fin = finance(c, ctx, y1, f.y0, who, false);
      var unservedPct = y1.ev.wantKwh > 0 ? y1.ev.unservedKwh / y1.ev.wantKwh * 100 : 0;
      var fits = y1.overKwh < 1e-3 && unservedPct <= 5;
      var cell = { pods: podsList[i], gpus: y1.gpus, batteryKw: sizes[j][0], batteryKwh: sizes[j][1], peakKw: r1(y1.peak),
                   overloadHours: y1.overHours, unservedPct: r1(unservedPct), spotCurtailedPct: r1(y1.spotCurtailedGpuH / Math.max(1, y1.gpuHours.spotOffered) * 100),
                   capital: r0(fin.capital || 0), irr: fin.irr != null ? fin.irr : null, npv: fin.npv != null ? r0(fin.npv) : null, fits: fits };
      grid.push(cell);
      if (fits && cell.npv != null && (!best || cell.npv > best.npv)) best = cell;
    }
    if (Date.now() - t0 > 40000) break;
  }
  return { ok: true, version: VERSION, structure: who, limitKw: r1(ctx.limit), pods: podsList, batteries: sizes.map(function (s) { return { kw: s[0], kwh: s[1] }; }),
           grid: grid, best: best, podKwServing: r1(podKw),
           note: 'Each cell is a full year of hourly dispatch and the finance engine\'s after-tax return; the best is the highest NPV that fits the service ' +
                 'with no lost firm compute and under 5% unserved charging.' };
}

/* What the page may offer: classes, patterns, structures and their
   defaults. No rates beyond the planning prices the inputs already show. */
function options() {
  var g = {};
  Object.keys(GPU).forEach(function (k) { g[k] = { name: GPU[k].name, short: GPU[k].short, kw: GPU[k].kw, podMax: GPU[k].podMax, capexPerGpu: GPU[k].capexPerGpu, price: GPU[k].price }; });
  var p = {};
  Object.keys(EV_PATTERNS).forEach(function (k) { p[k] = { label: EV_PATTERNS[k].label, dwell: EV_PATTERNS[k].dwell, weekend: EV_PATTERNS[k].weekend }; });
  var m = []; for (var k in VS.MARKETS) if (has(VS.MARKETS, k)) m.push({ key: k, name: VS.MARKETS[k] });
  return { version: VERSION, gpus: g, patterns: p, hostTypes: HOST_TYPES, structures: STRUCTURES, spotModes: SPOT_MODES,
           tiers: TIER_TEXT, markets: m, refs: REFS, finance: PF.defaults() };
}

module.exports = {
  VERSION: VERSION, GPU: GPU, EV_PATTERNS: EV_PATTERNS, STRUCTURES: STRUCTURES, REFS: REFS,
  read: read, screen: screen, model: model, optimize: optimize, options: options,
  _internal: { prepare: prepare, computeLoad: computeLoad, evCohorts: evCohorts, planEv: planEv, dispatch: dispatch,
               runMonth: runMonth, refreshPlan: refreshPlan, ageOf: ageOf, schedule: schedule, capexLines: capexLines,
               batteryOf: batteryOf, start: start, full: full }
};
