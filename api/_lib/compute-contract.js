/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/compute-contract.js — the Omega Core skid under a CONTRACTED
   OFFTAKE: N years of take-or-pay at $X a GPU-hour, a partner's fee, and the
   cost of controlling the site
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   ─────────────────────────────────────────────────────────────────────────────
   WHAT IT ANSWERS
   ─────────────────────────────────────────────────────────────────────────────
   "If Lightsmith Energy finds a buyer who contracts this site's compute for
   N years at $X per GPU-hour and takes 10% of compute revenue, what do we
   earn?" (2026-10-25, for Solela Capital's compute-site diligence.) The skid
   model (omega-compute-model.js) only sells at a market reference, 85%
   utilised, prices falling 8% a year over 60 months; it had no take-or-pay
   contract and no named partner fee. This is that case, and the contract
   price each return needs (`priceFor`), because the price in the LOI drives
   everything: on the skid's own figures a 30% return and a 2-year payback
   are not the same price.

   ─────────────────────────────────────────────────────────────────────────────
   ONE ENGINE, ONE LIBRARY, ONE PRICE
   ─────────────────────────────────────────────────────────────────────────────
   The chipset library, the whole-node capacity rule, the input reader (its
   ranges and its words for a figure set aside), the monthly cash flow, the
   debt, the IRR and the bankability are omega-compute-model.js's. This file
   builds a `deal` and hands it to that cash flow (its `deal` argument); it
   never runs a month of its own. The skid's price is omega-core.js's
   PRODUCT.systemCostUsd and the land-lease card is its RATE_CARD; neither is
   typed here. It cannot live inside the skid model: omega-core.js requires
   that model, so the model reading omega-core.js would be circular.

   ─────────────────────────────────────────────────────────────────────────────
   THE CONVENTIONS, SAID ONCE
   ─────────────────────────────────────────────────────────────────────────────
   · Take-or-pay is paid on the GPU-hours the skid is UP (the model's 98%
     uptime): the contracted share whether used or not, so utilisation, the
     ramp and the market's price decline do not touch it; the price steps
     by the escalator each contract year. The rest is unsold unless
     `merchant`, which sells it at the public spot reference with the
     model's utilisation, ramp and decline.
   · The partner's fee is a share of GROSS compute revenue (contracted and
     merchant alike), its own line, paid before EBITDA, never inside opex.
   · Every …Pct in the input is a PERCENT (10 means 10%), as the lease card's
     escalator is; a value under 1 is read as typed and said. The `debt`
     block is the skid model's and is read as it reads it (ltc 0.8 or 80).
   · The model's term IS the contract term; the loan matures inside it.
   · roiPct = the project cash multiple − 1 over the term: (cash from
     operations + residual) ÷ capital − 1.
   · The equity IRR dates the equity put in at month 0 and each month's cash
     to equity after it, as the project IRR dates the capital. (The skid
     model's own figure dates month 1 at month 0 and reads higher.)

   ⚠ Lightsmith Energy's terms (Max, October 2026) are as STATED and
   UNVERIFIED: a 6-year term, 10% of compute revenue, 25–55% returns (30%
   "conservative"), about a 2-year payback, cards in about 36 weeks and
   cards collateralising up to 80%. Only the term and the fee are defaults;
   80% is used only when typed.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

var CM = require('./omega-compute-model');
var OC = require('./omega-core');

var BUILD = '2026-10-25.compute-contract-v1';

/* The partner's stated terms — one record, unverified. The targets priceFor
   solves are read off it. */
var PARTNER = {
  name: 'Lightsmith Energy',
  feePct: 10,
  termMonths: 72,
  stated: { returnPct: [25, 30, 55], conservativeReturnPct: 30, paybackMonths: 24, cardsLeadWeeks: 36, collateralLtcPct: 80 },
  verified: false
};
var ROUTES = ['own', 'buy', 'lease', 'takeover'];
var RC = OC.RATE_CARD;
var LIMITS = {
  units: [1, 3000], availableKw: [1, 200000],
  unitCostUsd: CM.LIMITS.capexCustom, termMonths: CM.LIMITS.termMonths, pricePerGpuHour: CM.LIMITS.customGpuHour,
  takeOrPayPct: [0, 100], escalatorPct: [-10, 10], feePct: [0, 50],
  purchasePriceUsd: [1, 100000000], rentEscalatorPct: [0, RC.entered.maxEscalatorPct], revenueSharePct: [0, 60],
  rentPerKwMonth: [RC.entered.minMonthly / RC.computeKwPerSkid, RC.entered.maxMonthly / RC.computeKwPerSkid],
  residualPct: [0, CM.LIMITS.residualPct[1] * 100], landResidualPct: [0, 200]
};
/* the skid model's operating figures a caller may set (read by its own
   readInputs, with its ranges); the contract owns the rest */
var OPERATING = ['electricity', 'pue', 'uptime', 'utilization', 'networkStoragePct', 'otherVariablePct', 'fixedOpexMonthly',
                 'electricityEscalationPct', 'fixedOpexEscalationPct', 'maintenanceReservePct', 'priceChangePct', 'priceRealization', 'ramp'];

/* ── small helpers ────────────────────────────────────────────────────── */
/* A number or a numeric string; anything else is unanswered, never 0. */
function num(v) {
  if (typeof v === 'number') return isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') { var n = Number(v); return isFinite(n) ? n : null; }
  return null;
}
function obj(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
function given(v) { return !(v === undefined || v === null || v === ''); }
function round(v, d) { var m = Math.pow(10, d || 0); return Math.round(v * m) / m; }
function r2(v) { return v == null ? null : round(v, 2); }
function fmt(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
function usd(n) { return '$' + fmt(n); }
function gpuHr(p, d) { return '$' + p.toFixed(d == null ? 2 : d); }
/* a price as written: to the cent when it is whole cents, else to 0.01¢ */
function gpuHrAsIs(p) { return gpuHr(p, Math.abs(p - round(p, 2)) < 1e-9 ? 2 : 4); }
function extend(a, b) { Object.keys(b).forEach(function (k) { a[k] = b[k]; }); return a; }
function yes(v) { return v === true || v === 'true' || v === 1 || v === '1' || v === 'yes'; }
function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }

/* A typed figure inside [lo, hi], or null with the reason said (the skid
   model's rule: set aside and named, never clamped into a number nobody
   typed). `instead` is what happens then, in words. */
function figure(v, lim, label, notes, instead) {
  if (!given(v)) return null;
  var n = num(v);
  if (n == null) { notes.push(label + ' of ' + JSON.stringify(v) + ' is not a number; ' + instead); return null; }
  if (n < lim[0] || n > lim[1]) { notes.push(label + ' of ' + n + ' is outside ' + lim[0] + '–' + lim[1] + '; ' + instead); return null; }
  return n;
}
/* A …Pct field: a percent. Under 1 is most often a fraction meant as a
   percent (0.025 for 2.5%), so it is read as typed AND said. */
function percent(v, lim, label, notes, instead) {
  var n = figure(v, lim, label, notes, instead);
  if (n != null && n !== 0 && Math.abs(n) < 1) notes.push(label + ' of ' + n + ' is read as ' + n + '% (every …Pct here is a percent: 10 means 10%).');
  return n;
}

/* The equity IRR with the equity put in at month 0 and each month after it
   at its own month — the project IRR's timing. Reads the engine's rows. */
function equityIrrPct(cf) {
  if (!cf.months.length) return null;
  var put = cf.debt.initialEquity;
  var flows = [-put].concat(cf.months.map(function (mm, i) { return mm.equity + (i === 0 ? put : 0); }));
  var x = CM.irr(flows);
  return x == null ? null : round(x * 100, 2);
}
/* roiPct: the project cash multiple − 1 over the term (cash from operations
   + residual ÷ capital − 1) — one rule for the answer and every ladder point */
function roiOf(cf, capital) { return capital > 0 ? round(((cf.totals.fcf + cf.totals.residual) / capital - 1) * 100, 2) : null; }

/* ── the contract-price LADDER: a slider's points (2026-10-25) ────────────
   The Solela portfolio's contract-price slider reads these and computes no
   return of its own. ±40% around the contract price given, else around the
   chipset's reference price (its public spot price, else its on-demand
   price: site-model's precedence); the finest of $0.05 and $0.10 that keeps
   it to 41 points (coarser, $0.25 up, only for a price over about $5), and
   centred on the price so the price given is itself a point. */
var LADDER = { spanPct: 40, steps: [0.05, 0.10, 0.25, 0.50, 1, 2.5, 5], maxPoints: 41 };
function referencePrice(c) {
  var s = CM.gpuPrice(c, 'spot'), d = CM.gpuPrice(c, 'on-demand');
  return s != null ? { price: s, basis: 'spot' } : d != null ? { price: d, basis: 'on-demand' } : null;
}
function ladderGrid(centre) {
  var half = centre * LADDER.spanPct / 100, last = LADDER.steps[LADDER.steps.length - 1];
  for (var i = 0; i < LADDER.steps.length; i++) {
    var n = Math.floor(half / LADDER.steps[i] + 1e-9);
    if (2 * n + 1 <= LADDER.maxPoints) return { step: LADDER.steps[i], n: n };
  }
  return { step: last, n: (LADDER.maxPoints - 1) / 2 };
}

/* ═══════════════════════════════════════════════════════════════════════════
   contractCase(input, opts)
   ═══════════════════════════════════════════════════════════════════════════
   input (every field optional; see docs/OMEGA-CORE.md › Contracted offtake):
     chipset, units | availableKw, unitCostUsd, residualPct,
     contract { termMonths, pricePerGpuHour, takeOrPayPct, escalatorPct, merchant,
                partner { name, feePct } | false },
     site { route own|buy|lease|takeover, purchasePriceUsd, landResidualPct,
            rentMonthly | rentPerKwMonth, rentEscalatorPct, revenueSharePct },
     debt { the skid model's block }, operating { the skid model's figures }
   opts: { months: true } adds the monthly rows; { ladder: false } skips the
   contract-price ladder (a slider's points, on by default). */
function contractCase(input, opts) {
  input = obj(input); opts = obj(opts);
  var notes = [], needs = [];
  var K = obj(input.contract), S = obj(input.site), op = obj(input.operating);

  /* ── the chipset ── */
  var c = given(input.chipset) ? CM.chipset(String(input.chipset)) : null;
  if (given(input.chipset) && !c) notes.push('Chipset "' + input.chipset + '" is not in the library; the NVIDIA HGX H100 is used.');
  if (!c) c = CM.chipset(CM.DEFAULTS.chipset);
  if (!given(input.chipset)) notes.push('Chipset: the ' + c.name + ' (the default).');

  /* ── the contract term (the model's term) ── */
  var term = figure(K.termMonths, LIMITS.termMonths, 'A contract term (months)', notes, 'Lightsmith Energy’s ' + PARTNER.termMonths + ' months is used.');
  if (term != null && term !== Math.floor(term)) { notes.push('A contract term of ' + term + ' months is read as ' + Math.floor(term) + ' whole months.'); term = Math.floor(term); }
  if (term == null) {
    term = PARTNER.termMonths;
    if (!given(K.termMonths)) notes.push('Term: ' + term + ' months, Lightsmith Energy’s stated 6-year standard (unverified).');
  }

  /* ── the skid model's inputs: its own reader, its own ranges ── */
  var raw = { chipset: c.key, termMonths: term, debt: input.debt };
  ['debtLtc', 'debtRate', 'debtMaturityMonths', 'debtInterestOnlyMonths', 'debtBalloonPct', 'debtFeePct', 'debtReserveMonths', 'debtTargetDscr']
    .forEach(function (k) { if (given(input[k])) raw[k] = input[k]; });
  Object.keys(op).forEach(function (k) {
    if (OPERATING.indexOf(k) >= 0) raw[k] = op[k];
    else notes.push('operating.' + k + ' is not one of the skid’s operating figures (' + OPERATING.join(', ') + '); it is set aside.');
  });
  var I = CM.readInputs(raw);
  notes = notes.concat(I.notes);

  /* the loan matures inside the contract */
  var D = obj(input.debt);
  if (I.debt.maturityMonths > term) {
    var matTyped = num(D.maturityMonths) != null || num(input.debtMaturityMonths) != null;
    var fall = Math.min(CM.DEFAULTS.debt.maturityMonths, term);
    notes.push((matTyped ? 'A loan maturity of ' + I.debt.maturityMonths + ' months' : 'The skid model’s ' + I.debt.maturityMonths + '-month loan')
      + ' runs past the ' + term + '-month contract; ' + fall + ' months is used so the loan is repaid inside the term.');
    I.debt.maturityMonths = fall;
    if (I.debt.interestOnlyMonths >= fall) { I.debt.interestOnlyMonths = Math.min(CM.DEFAULTS.debt.interestOnlyMonths, fall - 1); notes.push('Interest-only shortened to ' + I.debt.interestOnlyMonths + ' months to end before maturity.'); }
  }
  /* one debt note: every term, the loan-to-cost said for what it is, and
     how many were the skid model's own */
  var ltcTyped = num(D.ltc) != null || num(input.debtLtc) != null, dd = I.debt;
  var ltcWords = Math.round(dd.ltc * 100) + '% of cost' + (!ltcTyped
    ? ' (the skid model’s default; Lightsmith Energy’s ' + PARTNER.stated.collateralLtcPct + '%, the cards as collateral, is unconfirmed and used only when typed)'
    : Math.round(dd.ltc * 100) === PARTNER.stated.collateralLtcPct ? ' as typed (Lightsmith Energy’s stated figure for the cards as collateral, unconfirmed)' : ' as typed');
  var debtDefaults = ['rate', 'maturityMonths', 'interestOnlyMonths', 'balloonPct', 'feePct', 'reserveMonths', 'targetDscr'].filter(function (k) {
    return num(D[k]) == null && num(input['debt' + k.charAt(0).toUpperCase() + k.slice(1)]) == null;
  });
  notes.push('Debt: ' + ltcWords + ', at ' + round(dd.rate * 100, 2) + '% over ' + dd.maturityMonths + ' months with ' + dd.interestOnlyMonths + ' interest-only, a '
    + round(dd.balloonPct * 100, 1) + '% balloon at maturity, a ' + round(dd.feePct * 100, 1) + '% fee and a ' + dd.reserveMonths + '-month reserve (funded, not released), against a '
    + dd.targetDscr + 'x DSCR target' + (debtDefaults.length ? '; ' + (debtDefaults.length === 7 ? 'all' : debtDefaults.length + ' of those') + ' the skid model’s defaults' : '') + '.');

  /* ── sizing: whole skids, on the model's own capacity rule ── */
  var one = CM.capacity(c, I);
  var unitsTyped = figure(input.units, LIMITS.units, 'A skid count', notes, given(input.availableKw) ? 'the power decides.' : 'one skid is used.');
  if (unitsTyped != null && unitsTyped !== Math.floor(unitsTyped)) { notes.push('A skid count of ' + unitsTyped + ' is read as ' + Math.floor(unitsTyped) + ' whole skids.'); unitsTyped = Math.floor(unitsTyped); }
  var kw = figure(input.availableKw, LIMITS.availableKw, 'Available power (kW)', notes, unitsTyped != null ? 'the skid count is used.' : 'one skid is used.');
  function fits(cap) { return cap.facilityKw > 0 ? Math.floor(kw / cap.facilityKw + 1e-9) : 0; }
  var units, basis;
  if (kw != null) {
    var fit = fits(one);
    units = unitsTyped != null ? Math.min(unitsTyped, fit) : fit;
    basis = 'availableKw';
    if (unitsTyped != null && fit < unitsTyped) notes.push(fmt(kw) + ' kW carries ' + fit + ' of the ' + unitsTyped + ' skids asked; the case is priced on ' + fit + '.');
    else if (unitsTyped == null) notes.push('Sized on the power: ' + fmt(kw) + ' kW ÷ ' + one.facilityKw + ' kW a skid at the meter (' + one.nodes + ' nodes × '
      + c.nodeKw + ' kW × PUE ' + I.pue + ') = ' + plural(fit, 'skid') + '.');
    if (units > 0) notes.push('That is the compute’s own draw: each skid’s R60 recharging can add up to ' + OC.PRODUCT.battery.kw + ' kW (a '
      + OC.PRODUCT.meter.peakKw + ' kW planning peak a skid), which the controller must cap on this power.');
  } else if (unitsTyped != null) { units = unitsTyped; basis = 'units'; }
  else { units = 1; basis = 'default'; notes.push('One skid: neither a skid count nor the available power was given.'); }
  var byChipset = CM.CHIPSETS.map(function (k) {
    var ck = CM.capacity(k, I), n = kw != null ? fits(ck) : units;
    if (kw != null && unitsTyped != null) n = Math.min(n, unitsTyped);
    return { key: k.key, name: k.name, gpusPerUnit: ck.gpus, units: n, gpus: n * ck.gpus, itKwPerUnit: ck.installedKw, facilityKwPerUnit: ck.facilityKw };
  });
  var sizing = { units: units, gpus: units * one.gpus, itKw: r2(units * one.installedKw), facilityKw: r2(units * one.facilityKw), basis: basis,
                 availableKw: kw, perUnit: { nodes: one.nodes, gpus: one.gpus, itKw: one.installedKw, facilityKw: one.facilityKw, itCeilingKw: I.itLoadKw },
                 byChipset: byChipset };

  /* ── the contract ── */
  var price = figure(K.pricePerGpuHour, LIMITS.pricePerGpuHour, 'A contract price ($/GPU-hour)', notes, 'the case is not priced.');
  if (price === 0) { notes.push('A contract price of $0 prices nothing; the case is not priced.'); price = null; }
  var top = percent(K.takeOrPayPct, LIMITS.takeOrPayPct, 'A take-or-pay share', notes, '100% is used.');
  if (top == null) top = 100;
  var esc = percent(K.escalatorPct, LIMITS.escalatorPct, 'A contract escalator', notes, 'a flat price is used.');
  if (esc == null) {
    esc = 0;
    if (!given(K.escalatorPct)) notes.push('The contract price is flat for the term (no escalator typed); the market’s ' + Math.abs(round(I.priceChangePct * 100, 1))
      + '% a year decline does not apply to contracted hours.');
  }
  if (top === 100 && !given(K.takeOrPayPct)) notes.push('Take-or-pay: 100% of the GPU-hours the skid is up are contracted and paid whether used or not; utilisation does not apply.');
  if (top > 0) notes.push('Take-or-pay is paid on the hours the skid is available (' + round(I.uptime * 100, 1) + '% uptime); the hours it is down are not paid. '
    + 'The skid draws its full ' + one.facilityKw + ' kW at the meter whenever it is up, used or not, from month 1.');
  else notes.push('Take-or-pay of 0%: no hours are contracted, so the contract price earns nothing.');
  var spot = CM.gpuPrice(c, 'spot'), merchant = yes(K.merchant);
  if (top < 100) {
    if (merchant && spot != null) notes.push('The ' + round(100 - top, 2) + '% of hours not contracted is sold at the public spot market reference ('
      + gpuHr(spot, 4) + ' a GPU-hour for the ' + c.name + '), ' + Math.round(I.utilization * 100) + '% utilised, on the model’s ramp and its '
      + Math.abs(round(I.priceChangePct * 100, 1)) + '% a year decline.');
    else if (merchant) { notes.push('The ' + c.name + ' has no public spot price, so the ' + round(100 - top, 2) + '% of hours not contracted is unsold.'); merchant = false; }
    else notes.push('The ' + round(100 - top, 2) + '% of hours not contracted is unsold (merchant: true sells it at the spot market reference).');
  } else if (merchant) { notes.push('Merchant sales have nothing to sell at 100% take-or-pay.'); merchant = false; }

  /* ── the partner ── */
  var partner;
  if (K.partner === false) { partner = { name: null, feePct: 0 }; notes.push('No partner fee (partner: false).'); }
  else {
    var P = obj(K.partner);
    var pname = typeof P.name === 'string' && P.name.trim() ? P.name.trim().slice(0, 120) : PARTNER.name;
    var fee = percent(P.feePct, LIMITS.feePct, 'A partner fee', notes, PARTNER.feePct + '% is used.');
    partner = { name: pname, feePct: fee == null ? PARTNER.feePct : fee };
    notes.push('Partner: ' + pname + ' takes ' + partner.feePct + '% of gross compute revenue, its own line'
      + (pname === PARTNER.name && (fee == null || fee === PARTNER.feePct) ? ' (their stated term, unverified).' : '.'));
  }

  /* ── the site: own, buy, lease or take over the host agreement ── */
  var route = given(S.route) ? String(S.route).toLowerCase().trim() : null;
  if (route != null && ROUTES.indexOf(route) < 0) { notes.push('Site route "' + S.route + '" is not own, buy, lease or takeover; lease is used.'); route = null; }
  if (route == null) {
    route = 'lease';
    if (!given(S.route)) notes.push('Site control: lease (the default, as an Omega-Core skid pays its host); say own, buy, lease or takeover.');
  }
  var site = { route: route, rentMonthly: 0, rentEscalatorPct: null, rentSource: 'none', revenueSharePct: 0, purchasePriceUsd: 0, landResidualPct: 0 };
  var rentGiven = given(S.rentMonthly) || given(S.rentPerKwMonth), shareGiven = given(S.revenueSharePct);
  if (route === 'own' || route === 'buy') {
    if (rentGiven || shareGiven || given(S.rentEscalatorPct)) notes.push('A ' + (route === 'own' ? 'site owned' : 'site bought') + ' pays no rent or share; the rent and share typed are set aside.');
  }
  if (route === 'own') notes.push('Site owned: no rent and no purchase in the capital.');
  if (route === 'buy') {
    var buyAt = figure(S.purchasePriceUsd, LIMITS.purchasePriceUsd, 'A purchase price', notes, 'the case is not priced.');
    if (buyAt == null) { needs.push('site.purchasePriceUsd'); notes.push('A site bought needs its purchase price (site.purchasePriceUsd) in the capital; the case is not priced without it.'); }
    else {
      site.purchasePriceUsd = Math.round(buyAt);
      var landRes = percent(S.landResidualPct, LIMITS.landResidualPct, 'A land residual', notes, 'none is counted.');
      site.landResidualPct = landRes == null ? 0 : landRes;
      notes.push('Site bought for ' + usd(site.purchasePriceUsd) + ', in the capital (and in the loan at the same loan-to-cost). '
        + (site.landResidualPct ? site.landResidualPct + '% of it is counted back at the end of the term.' : 'Its value at the end of the term is not counted (site.landResidualPct counts a sale).'));
    }
  }
  if (route === 'lease' || route === 'takeover') {
    var maxRent = RC.entered.maxMonthly * Math.max(1, units);
    var rent = figure(S.rentMonthly, [RC.entered.minMonthly, maxRent], 'A site rent a month', notes, 'the rate on record or the card is used.');
    var perKw = rent == null ? figure(S.rentPerKwMonth, LIMITS.rentPerKwMonth, 'A rent per kW of compute a month', notes, 'the card is used.') : null;
    var share = percent(S.revenueSharePct, LIMITS.revenueSharePct, 'A site revenue share', notes, 'no share is used.');
    site.revenueSharePct = share == null ? 0 : share;
    var rentEsc = percent(S.rentEscalatorPct, LIMITS.rentEscalatorPct, 'A rent escalator', notes, 'the card’s ' + RC.escalatorPct.base + '% is used.');
    var kwCompute = RC.computeKwPerSkid * units;
    if (rent != null) { site.rentMonthly = Math.round(rent); site.rentSource = 'entered'; }
    else if (perKw != null) { site.rentMonthly = Math.round(perKw * kwCompute); site.rentSource = 'per-kw';
      notes.push('Rent: ' + usd(perKw) + ' per kW of compute a month × ' + fmt(kwCompute) + ' kW = ' + usd(site.rentMonthly) + ' a month.'); }
    else if (!(share > 0)) {
      site.rentMonthly = RC.monthlyPerSkid.base * units; site.rentSource = 'market';
      notes.push((route === 'takeover' ? 'The existing agreement’s rent was not given, so ' : 'No rent was given, so ') + 'the rent is the Omega-Core rate card’s floor, '
        + usd(RC.perKwMonth.base) + ' per kW of compute a month × ' + RC.computeKwPerSkid + ' kW = ' + usd(RC.monthlyPerSkid.base) + ' a skid a month'
        + (units > 1 ? ' (' + usd(site.rentMonthly) + ' for ' + units + ')' : '') + ': a market reference, not an offer'
        + (route === 'takeover' ? '; read the rent off the agreement.' : '.'));
    }
    if (site.rentMonthly > 0) {
      site.rentEscalatorPct = rentEsc == null ? RC.escalatorPct.base : rentEsc;
      if (rentEsc == null && !given(S.rentEscalatorPct)) notes.push('The rent escalates ' + site.rentEscalatorPct + '% a year (the Omega-Core rate card’s base; none was typed).');
    } else if (given(S.rentEscalatorPct)) notes.push('A rent escalator without a rent escalates nothing.');
    if (site.revenueSharePct) notes.push('The site takes ' + site.revenueSharePct + '% of gross compute revenue, a site cost beside the rent.');
    if (route === 'takeover') notes.push('Taking over the existing site host agreement: its rent and share are the agreement’s. Confirm it runs at least the '
      + term + '-month contract and may be assigned.');
  }

  /* ── the capital ── */
  var cost = figure(input.unitCostUsd, LIMITS.unitCostUsd, 'A unit cost', notes, 'the Omega-Core system cost as recorded is used.');
  var B = OC.PRODUCT.systemCostBreakdown;
  var dyn = CM.dynamicCapex(c, one.gpus);
  if (cost == null) {
    cost = OC.PRODUCT.systemCostUsd;
    notes.push('The capital is ' + usd(cost) + ' a skid, the Omega-Core system cost on record: ' + B.map(function (b) { return b.label + ', ' + usd(b.usd); }).join('; ')
      + '. The skid model’s chipset-scaled estimate for ' + one.gpus + ' ' + c.name + ' GPUs is ' + usd(dyn.low) + '–' + usd(dyn.high)
      + ' a skid (mid ' + usd(dyn.mid) + ') before the controller: confirm the recorded price covers the GPUs before relying on these returns.');
  }
  var equipment = Math.round(cost * units), land = site.purchasePriceUsd;
  var capex = { unitCostUsd: Math.round(cost), unitCostSource: given(input.unitCostUsd) && cost !== OC.PRODUCT.systemCostUsd ? 'entered' : 'recorded',
                units: units, equipment: equipment, land: land, total: equipment + land,
                chipsetEstimatePerUnit: { low: dyn.low, mid: dyn.mid, high: dyn.high, basis: 'the skid model’s chipset-scaled estimate for ' + one.gpus + ' ' + c.name + ' GPUs, before the controller' } };
  var resPct = percent(input.residualPct, LIMITS.residualPct, 'A residual value', notes, 'the skid model’s ' + Math.round(CM.DEFAULTS.residualPct * 100) + '% is used.');
  if (resPct == null) {
    resPct = CM.DEFAULTS.residualPct * 100;
    if (!given(input.residualPct)) notes.push('Residual: the skid (its cards) is worth ' + resPct + '% of its cost at the end of the term, an assumption, not an appraisal.');
  }
  I.residualPct = resPct / 100;
  var residualUsd = equipment * resPct / 100 + land * site.landResidualPct / 100;

  /* what the skid model assumed and nobody typed, in one line */
  var dflt = [];
  function was(k) { return !given(op[k]); }
  if (was('electricity')) dflt.push('power at $' + I.electricity.toFixed(3) + '/kWh' + (was('electricityEscalationPct') ? ' rising ' + round(I.electricityEscalationPct * 100, 1) + '% a year' : ''));
  if (was('pue')) dflt.push('PUE ' + I.pue);
  if (was('uptime')) dflt.push(round(I.uptime * 100, 1) + '% uptime');
  if (was('networkStoragePct') || was('otherVariablePct')) dflt.push('network and storage ' + round(I.networkStoragePct * 100, 1) + '% and other variable ' + round(I.otherVariablePct * 100, 1) + '% of revenue');
  if (was('maintenanceReservePct')) dflt.push('a ' + round(I.maintenanceReservePct * 100, 1) + '% maintenance reserve');
  if (was('fixedOpexMonthly')) dflt.push(usd(I.fixedOpexMonthly) + ' a skid a month fixed' + (was('fixedOpexEscalationPct') ? ', rising ' + round(I.fixedOpexEscalationPct * 100, 1) + '% a year' : ''));
  if (dflt.length) notes.push('The skid model’s operating figures: ' + dflt.join(', ') + '.');

  /* ── the cash flow: the skid model's, for the whole site ── */
  var IS = JSON.parse(JSON.stringify(I));
  IS.fixedOpexMonthly = I.fixedOpexMonthly * units;
  IS.includeLease = true;
  var capSite = { gpus: units * one.gpus, facilityKw: units * one.facilityKw };
  var lease = site.rentMonthly > 0 ? { monthly: site.rentMonthly, escalatorPct: site.rentEscalatorPct, source: site.rentSource } : null;
  var deal = { price: price || 0, takeOrPay: top / 100, escalator: esc / 100, merchant: merchant, merchantPrice: merchant ? spot : 0,
               fee: partner.feePct / 100, revenueShare: site.revenueSharePct / 100, residualUsd: residualUsd };
  function at(p, noFee) { var d = extend({}, deal); d.price = p; if (noFee) d.fee = 0; return CM.cashFlow(c, capSite, capex.total, IS, lease, d); }
  /* the figures a price gives: the answer's and each ladder point's, one rule */
  var years = term / 12;
  function figuresAt(p, cf) {
    cf = cf || at(p);
    var nf = deal.fee > 0 ? at(p, true) : cf;
    return { price: p, projectIrrPct: cf.returns.projectIrrPct, paybackMonths: cf.returns.projectPaybackMonth, projectMultiple: cf.returns.projectCashMultiple,
             roiPct: roiOf(cf, capex.total), irrWithoutFeePct: nf.returns.projectIrrPct,
             revenuePerYear: Math.round(cf.totals.revenue / years), partnerFeePerYear: Math.round(cf.totals.partnerFee / years) };
  }

  var out = {
    build: BUILD, model: 'compute-contract-v1', ok: true, priced: false, needs: needs,
    chipset: { key: c.key, name: c.name, gpusPerNode: c.gpusPerNode, nodeKw: c.nodeKw },
    partner: { name: partner.name, feePct: partner.feePct, stated: PARTNER.stated, verified: PARTNER.verified },
    contract: { termMonths: term, pricePerGpuHour: price, takeOrPayPct: top, escalatorPct: esc, merchant: merchant, merchantPricePerGpuHour: merchant ? r2(spot) : null },
    site: site,
    operating: { electricity: I.electricity, electricityEscalationPct: I.electricityEscalationPct, pue: I.pue, uptime: I.uptime, utilization: I.utilization,
                 networkStoragePct: I.networkStoragePct, otherVariablePct: I.otherVariablePct, maintenanceReservePct: I.maintenanceReservePct,
                 fixedOpexMonthlyPerUnit: I.fixedOpexMonthly, fixedOpexEscalationPct: I.fixedOpexEscalationPct, priceChangePct: I.priceChangePct },
    sizing: sizing, capex: capex,
    debt: null, returns: null, lines: null, totals: null, bankability: null,
    priceFor: null, priceForPayback: null, solved: [], ladder: null, ladderBasis: null,
    notes: notes,
    disclaimer: 'Planning estimate on the Omega Core skid model’s own figures, not an offer or an underwriting. The contract price, term and take-or-pay '
      + 'are what an offtaker signs; Lightsmith Energy’s terms are as stated and unverified; no taxes; the cards’ value at the end is an assumption; '
      + 'the debt terms are assumptions, not a lender’s offer.'
  };
  if (units < 1) {
    needs.push('availableKw');
    notes.push(fmt(kw) + ' kW carries no skid: one needs ' + one.facilityKw + ' kW at the meter (' + c.name + ').');
    return out;
  }
  if (route === 'buy' && !site.purchasePriceUsd) return out;

  /* ── the price each return needs, on the same engine ── */
  var MAXP = LIMITS.pricePerGpuHour[1];
  /* the lowest price at which ok() holds: bracketed by doubling from $1 (a
     GPU-hour price is dollars, not hundreds), then halved to a millionth of
     a dollar; null when nothing up to the price limit does it */
  function solve(ok) {
    if (ok(at(0))) return 0;
    var lo = 0, hi = 1;
    while (!ok(at(hi))) { if (hi >= MAXP) return null; lo = hi; hi = Math.min(MAXP, hi * 2); }
    while (hi - lo > 1e-6) { var mid = (lo + hi) / 2; if (ok(at(mid))) hi = mid; else lo = mid; }
    /* up to the next 0.01¢, never down: the price reported meets its target
       (a payback is a step, and rounding down can cross it) */
    var up = Math.ceil(hi * 10000 - 1e-7) / 10000;
    return ok(at(up)) ? up : hi;
  }
  function check(p) {
    var cf = at(p);
    return { price: p, projectIrrPct: cf.returns.projectIrrPct, equityIrrPct: equityIrrPct(cf), paybackMonths: cf.returns.projectPaybackMonth,
             minDscr: cf.bankability.minDscrAmortizing };
  }
  out.priceFor = {};
  PARTNER.stated.returnPct.forEach(function (t) {
    var p = solve(function (cf) { return cf.returns.projectIrrPct != null && cf.returns.projectIrrPct >= t; });
    out.priceFor[t] = p;
    if (p == null) notes.push('No contract price up to ' + gpuHr(MAXP) + ' a GPU-hour reaches a ' + t + '% project IRR here.');
    else out.solved.push(extend({ target: 'projectIrrPct', value: t }, check(p)));
  });
  var pb = PARTNER.stated.paybackMonths;
  var pp = solve(function (cf) { return cf.returns.projectPaybackMonth != null && cf.returns.projectPaybackMonth <= pb; });
  out.priceForPayback = {}; out.priceForPayback[pb] = pp;
  if (pp != null) out.solved.push(extend({ target: 'paybackMonths', value: pb }, check(pp)));
  else notes.push('No contract price up to ' + gpuHr(MAXP) + ' a GPU-hour pays back by month ' + pb + ' here.');
  var s30 = out.solved.filter(function (x) { return x.target === 'projectIrrPct' && x.value === PARTNER.stated.conservativeReturnPct; })[0];
  var sPb = out.solved.filter(function (x) { return x.target === 'paybackMonths'; })[0];
  if (s30 && sPb) notes.push('Lightsmith Energy’s stated terms, unverified: a ' + s30.value + '% project IRR needs ' + gpuHr(s30.price, 4) + ' a GPU-hour here and pays back in '
    + (s30.paybackMonths ? 'month ' + s30.paybackMonths : 'more than the term') + '; a ' + pb + '-month payback needs ' + gpuHr(sPb.price, 4) + ' (a ' + sPb.projectIrrPct
    + '% project IRR). ' + (sPb.price > s30.price ? 'The two are not the same contract price.' : 'Both hold at the higher of the two prices.'));

  /* ── the ladder: the same figures at each step of a contract-price slider ── */
  if (opts.ladder !== false) {
    var ref = price != null ? { price: price, basis: 'contract' } : referencePrice(c);
    if (!ref) notes.push('No contract price and no public reference price for the ' + c.name + ', so there is no price ladder; a contract price centres one.');
    else {
      var g = ladderGrid(ref.price), centre = price != null ? price : round(Math.round(ref.price / g.step) * g.step, 4);
      out.ladder = [];
      for (var k = -g.n; k <= g.n; k++) { var lp = round(centre + k * g.step, 4); if (lp > 0) out.ladder.push(figuresAt(lp)); }
      var lo = out.ladder[0].price, hi = out.ladder[out.ladder.length - 1].price;
      out.ladderBasis = { centre: centre, centreBasis: ref.basis, referencePricePerGpuHour: ref.basis === 'contract' ? null : r2(ref.price),
                          step: g.step, spanPct: LADDER.spanPct, points: out.ladder.length, from: lo, to: hi,
                          words: out.ladder.length + ' contract prices from ' + gpuHr(lo) + ' to ' + gpuHr(hi) + ' a GPU-hour in ' + gpuHr(g.step) + ' steps, '
                            + (ref.basis === 'contract' ? 'about the contract price, ' + gpuHrAsIs(price)
                                                        : 'about the ' + c.name + '’s public ' + ref.basis + ' reference, ' + gpuHrAsIs(ref.price) + ' (no contract price given)')
                            + ', each on the same engine as the answer' };
      if (ref.basis !== 'contract') notes.push('The price ladder is centred on the ' + c.name + '’s public ' + ref.basis + ' reference (' + gpuHrAsIs(ref.price)
        + ' a GPU-hour), ' + gpuHr(lo) + '–' + gpuHr(hi) + '; a contract price centres it there instead.');
    }
  }

  if (price == null) {
    needs.push('contract.pricePerGpuHour');
    notes.push('The contract price per GPU-hour (contract.pricePerGpuHour) is needed for a priced answer; the sizing and the price each return needs (priceFor) are given without it.');
    return out;
  }

  /* ── the priced answer ── */
  var cf = at(price), fig = figuresAt(price, cf);
  var put = cf.debt.initialEquity;
  out.priced = true;
  out.debt = cf.debt;
  out.returns = {
    projectIrrPct: fig.projectIrrPct,
    equityIrrPct: equityIrrPct(cf),
    roiPct: fig.roiPct,
    paybackMonths: fig.paybackMonths,
    equityPaybackMonths: cf.returns.equityPaybackMonth,
    projectMultiple: fig.projectMultiple,
    equityMultiple: cf.returns.equityCashMultiple,
    irrWithoutFeePct: fig.irrWithoutFeePct,
    revenuePerYear: fig.revenuePerYear,
    partnerFeePerYear: fig.partnerFeePerYear,
    roiBasis: 'project cash multiple − 1 over the ' + term + '-month term: (cash from operations + residual) ÷ capital − 1'
  };
  out.lines = cf.years.map(function (y, i) {
    var opex = y.network + y.other + y.fixed + y.maintenance;
    return { year: y.year, months: y.months, revenue: y.revenue, contracted: y.contracted, merchant: y.merchant, partnerFee: y.partnerFee,
             power: y.electricity, siteCost: y.lease + y.revenueShare, rent: y.lease, revenueShare: y.revenueShare, opex: opex, ebitda: y.ebitda,
             debtService: y.debtService, interest: y.interest, principal: y.principal, balloon: y.balloon, residual: y.residual,
             projectCashFlow: y.ebitda + y.residual, equityCashFlow: y.equity + (i === 0 ? put : 0), dscr: y.dscr };
  });
  out.totals = {};
  ['revenue', 'contracted', 'merchant', 'partnerFee', 'power', 'siteCost', 'rent', 'revenueShare', 'opex', 'ebitda', 'debtService', 'interest', 'principal', 'balloon', 'residual', 'projectCashFlow', 'equityCashFlow']
    .forEach(function (k) { out.totals[k] = out.lines.reduce(function (s, l) { return s + l[k]; }, 0); });
  out.totals.capital = capex.total;
  out.totals.initialEquity = put;
  out.bankability = cf.bankability;
  if (opts.months) out.months = cf.months;
  return out;
}

module.exports = { contractCase: contractCase, PARTNER: PARTNER, LIMITS: LIMITS, ROUTES: ROUTES, OPERATING: OPERATING, BUILD: BUILD };
