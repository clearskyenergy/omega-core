/* ═══════════════════════════════════════════════════════════════════════════════
   api/_lib/invest-math.js — the community-investment engine (pure, ES5)
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   WHAT LIVES HERE AND WHY IT IS NOT IN THE BROWSER
   Every number the investor storefront shows about money comes from this
   file, called through /api/invest. The CLAUDE.md IP rule is explicit:
   pricing, eligibility and financial modelling run in /api, never in shipped
   HTML. The page collects an amount and renders what comes back.

   THE MECHANISM, in one paragraph
   A campaign raises `goal` dollars in `unitsTotal` units of `unitPrice`
   each. The sponsor offers the crowd `sharePct` percent of the project's
   distributable cash (the PPA, the compute lease, or both) for `termYears`.
   An investor who buys `units` owns units/unitsTotal of the offering, and
   therefore (units/unitsTotal × sharePct) of the project's distributable
   cash. Year-one cash is `distributableAnnual`, escalated by `escalatorPct`
   and reduced by `degradationPct` each year, starting `codMonths` after
   funding. That per-year stream against the amount paid gives yield, MOIC,
   payback and IRR. Nothing here is hardcoded to a deal.

   NO DEPENDENCIES. scripts/tests/tinvest.js loads this with plain require.
   ═══════════════════════════════════════════════════════════════════════════════ */
'use strict';

function num(v, d) { var n = Number(v); return isFinite(n) ? n : (d || 0); }

/* How many whole units an amount buys. Never fractional; never negative. */
function unitsFor(amount, unitPrice) {
  var p = num(unitPrice);
  if (p <= 0) return 0;
  return Math.max(0, Math.floor(num(amount) / p));
}

/* Units the campaign can still sell. Pending (unpaid) pledges are NOT
   reserved: a checkout that is abandoned must not hold inventory. */
function unitsRemaining(c) {
  return Math.max(0, num(c.unitsTotal) - num(c.unitsSold));
}

/* Normalise the offer terms off a campaign document, with the defaults the
   sponsor console also shows, so a missing field never becomes NaN. */
function terms(c) {
  c = c || {};
  var o = c.offer || {};
  var unitPrice = num(c.unitPrice, 100);
  var goal = num(c.goal, 0);
  return {
    goal: goal,
    unitPrice: unitPrice,
    unitsTotal: num(c.unitsTotal) > 0 ? num(c.unitsTotal) : (unitPrice > 0 ? Math.floor(goal / unitPrice) : 0),
    sharePct: Math.min(100, Math.max(0, num(o.sharePct, 0))),
    termYears: Math.max(1, Math.min(40, Math.round(num(o.termYears, 10)))),
    distributableAnnual: Math.max(0, num(o.distributableAnnual, 0)),
    escalatorPct: num(o.escalatorPct, 0),
    degradationPct: Math.max(0, num(o.degradationPct, 0)),
    codMonths: Math.max(0, Math.round(num(o.codMonths, 0))),
    exitValue: Math.max(0, num(o.exitValue, 0)),
    platformFeePct: Math.max(0, num(o.platformFeePct, 0)),
    kind: o.kind === 'compute' || o.kind === 'hybrid' ? o.kind : 'ppa'
  };
}

/* Internal rate of return by bisection. cf[0] is the outlay (negative).
   Returns null when the stream never turns positive — a plain "no return"
   reads better than a -100% that looks like a computed figure. */
function irr(cf) {
  var pos = false, negv = false, i;
  for (i = 0; i < cf.length; i++) { if (cf[i] > 0) pos = true; if (cf[i] < 0) negv = true; }
  if (!pos || !negv) return null;
  function npvAt(r) { var s = 0; for (var k = 0; k < cf.length; k++) s += cf[k] / Math.pow(1 + r, k); return s; }
  var lo = -0.99, hi = 10, mid, v;
  if (npvAt(lo) * npvAt(hi) > 0) return null;
  for (i = 0; i < 200; i++) {
    mid = (lo + hi) / 2; v = npvAt(mid);
    if (Math.abs(v) < 1e-7) break;
    if (npvAt(lo) * v < 0) hi = mid; else lo = mid;
  }
  return mid;
}

/* THE PROJECTION. What `units` of campaign `c` are expected to pay, year by
   year, and the headline figures an investor screens on. Every figure is a
   projection of the sponsor's own model and is labelled as such on the page. */
function projection(c, units) {
  var t = terms(c);
  units = Math.max(0, Math.floor(num(units)));
  var amount = units * t.unitPrice;
  var pctOfOffering = t.unitsTotal > 0 ? units / t.unitsTotal : 0;
  var pctOfProject = pctOfOffering * t.sharePct / 100;
  var crowdAnnualY1 = t.distributableAnnual * t.sharePct / 100;
  var years = [], cf = [-amount], cumulative = 0, paybackYear = null, total = 0;
  var firstYear = Math.floor(t.codMonths / 12) + 1;
  var firstFrac = 1 - (t.codMonths % 12) / 12;
  for (var y = 1; y <= t.termYears; y++) {
    var d = 0;
    if (y >= firstYear) {
      var n = y - firstYear;              /* operating years elapsed */
      var factor = Math.pow(1 + t.escalatorPct / 100, n) * Math.pow(1 - t.degradationPct / 100, n);
      d = crowdAnnualY1 * pctOfOffering * factor;
      if (y === firstYear) d *= firstFrac;
    }
    if (y === t.termYears && t.exitValue > 0) d += t.exitValue * pctOfOffering;
    /* Not rounded here: a $100 unit of a large project can be worth a few
       tenths of a cent a year, and rounding per year would zero it. The page
       rounds for display. */
    cumulative += d; total += d; cf.push(d);
    if (paybackYear === null && amount > 0 && cumulative >= amount) paybackYear = y;
    years.push({ year: y, distribution: d, cumulative: cumulative });
  }
  var firstFull = null;
  for (var k = 0; k < years.length; k++) { if (years[k].year > firstYear || (years[k].year === firstYear && firstFrac === 1)) { firstFull = years[k].distribution; break; } }
  if (firstFull === null && years.length) firstFull = years[0].distribution;
  var r = irr(cf);
  return {
    units: units,
    unitPrice: t.unitPrice,
    amount: amount,
    pctOfOffering: pctOfOffering,
    pctOfProject: pctOfProject,
    termYears: t.termYears,
    kind: t.kind,
    sharePct: t.sharePct,
    annualDistribution: firstFull || 0,          /* first full operating year */
    yieldPct: amount > 0 && firstFull ? firstFull / amount * 100 : 0,
    total: total,
    moic: amount > 0 ? total / amount : 0,
    irrPct: r === null ? null : r * 100,
    paybackYear: paybackYear,
    codMonths: t.codMonths,
    years: years
  };
}

/* The campaign-level headline (what a card shows): target yield for one
   unit, and the offering's total projected payout. Same engine, one unit. */
function headline(c) {
  var t = terms(c);
  var p = projection(c, 1);
  return {
    unitPrice: t.unitPrice,
    unitsTotal: t.unitsTotal,
    targetYieldPct: p.yieldPct,
    irrPct: p.irrPct,
    moic: p.moic,
    termYears: t.termYears,
    sharePct: t.sharePct,
    kind: t.kind,
    paybackYear: p.paybackYear
  };
}

/* Campaign progress for cards and the sponsor console. `now` is injectable
   so the test does not depend on the clock. */
function progress(c, now) {
  now = now || Date.now();
  var goal = num(c.goal), raised = num(c.raised);
  var deadline = c.deadline ? new Date(c.deadline).getTime() : null;
  var msLeft = deadline ? deadline - now : null;
  return {
    pct: goal > 0 ? Math.min(999, raised / goal * 100) : 0,
    raised: raised,
    goal: goal,
    remaining: Math.max(0, goal - raised),
    daysLeft: msLeft === null ? null : Math.max(0, Math.ceil(msLeft / 86400000)),
    expired: msLeft !== null && msLeft <= 0,
    reachedGoal: goal > 0 && raised >= goal,
    reachedMin: num(c.minRaise) > 0 ? raised >= num(c.minRaise) : (goal > 0 && raised >= goal)
  };
}

/* What the sponsor nets after the platform fee. */
function proceeds(raised, platformFeePct) {
  var fee = Math.round(num(raised) * num(platformFeePct) / 100 * 100) / 100;
  return { gross: num(raised), fee: fee, net: Math.round((num(raised) - fee) * 100) / 100 };
}

/* ── ELIGIBILITY ──────────────────────────────────────────────────────────
   The rules an investor must clear before a pledge is even created. They
   are read from cf_settings/rules by the API and merged over these
   defaults, so ClearSky changes them in the console, not in a deploy.

   THIS IS NOT LEGAL ADVICE and the platform is not a registered funding
   portal. Offering securities to the public in the US goes through a
   registered intermediary (Reg CF), an accredited-only exemption (Reg D
   506(c)) or a qualified offering (Reg A+). These checks are the platform's
   own floor; counsel sets the ceiling. The README says the same. */
var DEFAULT_RULES = {
  minInvestment: 100,
  maxInvestment: 250000,
  nonAccreditedAnnualCap: 2500,
  accreditedRequiredAbove: 25000,
  allowedCountries: ['US'],
  requireKyc: false
};

function rules(overrides) {
  var r = {}, k;
  for (k in DEFAULT_RULES) if (DEFAULT_RULES.hasOwnProperty(k)) r[k] = DEFAULT_RULES[k];
  overrides = overrides || {};
  for (k in overrides) if (overrides.hasOwnProperty(k) && overrides[k] !== null && overrides[k] !== undefined) r[k] = overrides[k];
  return r;
}

/* eligibility(rules, investor, amount, campaign, priorThisYear)
   → { ok, reasons[] }. Every reason is a sentence the page can show. */
function eligibility(r, inv, amount, c, priorThisYear) {
  r = rules(r); inv = inv || {}; c = c || {};
  var reasons = [];
  amount = num(amount); priorThisYear = num(priorThisYear);
  var minInv = Math.max(num(r.minInvestment), num(c.minInvestment));
  var maxInv = num(c.maxInvestment) > 0 ? Math.min(num(r.maxInvestment), num(c.maxInvestment)) : num(r.maxInvestment);
  if (amount < minInv) reasons.push('The minimum investment is $' + minInv.toLocaleString('en-US') + '.');
  if (maxInv > 0 && amount > maxInv) reasons.push('The maximum investment is $' + maxInv.toLocaleString('en-US') + '.');
  if (inv.status === 'suspended') reasons.push('This account is suspended.');
  if (r.requireKyc && inv.kyc !== 'verified') reasons.push('Identity verification is required before investing.');
  /* A KNOWN country outside the list is refused. An unknown one is not — a
     first-time visitor has no profile yet, and a quote must not tell them
     they are ineligible for living nowhere. /api/invest requires the
     country at pledge time, where it is asked for. */
  if (inv.country && r.allowedCountries && r.allowedCountries.length && r.allowedCountries.indexOf(String(inv.country).toUpperCase()) < 0) {
    reasons.push('Investing is currently open to residents of ' + r.allowedCountries.join(', ') + ' only.');
  }
  var accredited = inv.accreditedVerified === true || inv.accredited === true;
  if (!accredited && num(r.nonAccreditedAnnualCap) > 0 && priorThisYear + amount > num(r.nonAccreditedAnnualCap)) {
    reasons.push('Non-accredited investors may invest up to $' + num(r.nonAccreditedAnnualCap).toLocaleString('en-US') + ' per year across all projects. You have $' + Math.max(0, num(r.nonAccreditedAnnualCap) - priorThisYear).toLocaleString('en-US') + ' remaining.');
  }
  if (num(r.accreditedRequiredAbove) > 0 && amount > num(r.accreditedRequiredAbove) && !accredited) {
    reasons.push('Investments above $' + num(r.accreditedRequiredAbove).toLocaleString('en-US') + ' are open to accredited investors.');
  }
  if (!inv.acceptedRisk) reasons.push('Please acknowledge the risk disclosure.');
  return { ok: reasons.length === 0, reasons: reasons, minInvestment: minInv, maxInvestment: maxInv };
}

module.exports = {
  unitsFor: unitsFor, unitsRemaining: unitsRemaining, terms: terms, irr: irr,
  projection: projection, headline: headline, progress: progress, proceeds: proceeds,
  DEFAULT_RULES: DEFAULT_RULES, rules: rules, eligibility: eligibility
};
