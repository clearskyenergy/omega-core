/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/portfolio/assess-supercharger.js — fast-charging posts bought
   and hosted on a site's FREE capacity: the capital, fifteen years of cash
   and the return
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   PURE, ES5, no clock, no Firestore. The host buys the posts and their
   installation, sets the price a kWh, pays for the electricity, pays the
   charger's maker a service fee on every kWh, and keeps the rest. This is
   the site-host return calculation the maker publishes for prospective
   hosts, carried as it computes: energy sold = posts × kWh a post a day ×
   365, growing with utilisation; revenue on the energy delivered after the
   line loss; electricity and the service fee on the energy drawn; rent
   escalating; a flat tax on the year's earnings; returns dated at each
   year end (XIRR / XNPV, so a leap year counts its day).

   THE CONVENTIONS, SAID ONCE
   · The price a kWh and the levelised electricity cost (supply and demand
     charges together) are the state's INDICATIVE figures from the maker's
     table unless typed. They are estimates, not a tariff and not a quote.
   · Utilisation is kWh delivered per post per day (low 150, medium 325,
     high 450) growing 7% a year; the service fee and the rent grow 3%.
   · The federal credit and any incentive are OFF unless asked for.
   · SIZING is this platform's, not the maker's: posts = the free capacity
     ÷ the planning draw a post (SIZING.kwPerPost, one power cabinet's
     1,200 kW across eight posts), never fewer than the programme's four.
     A site that cannot carry four is answered "does not fit", never sized
     down to an order nobody can place.
   Indicative only: nothing here is the maker's prediction or an offer.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

var VERSION = 'omega-supercharger-host-v1';

/* state → [levelised electricity cost $/kWh, indicative charging price $/kWh] */
var STATES = {
  AL: [0.198, 0.46], AK: [0.422, 0.54], AZ: [0.192, 0.53], AR: [0.197, 0.53], CA: [0.255, 0.59], CO: [0.193, 0.49], CT: [0.278, 0.59], DE: [0.199, 0.56],
  FL: [0.159, 0.46], GA: [0.098, 0.49], HI: [0.378, 0.86], ID: [0.136, 0.46], IL: [0.143, 0.50], IN: [0.214, 0.53], IA: [0.137, 0.45], KS: [0.200, 0.45],
  KY: [0.230, 0.54], LA: [0.170, 0.56], ME: [0.009, 0.61], MD: [0.154, 0.56], MA: [0.163, 0.52], MI: [0.191, 0.49], MN: [0.229, 0.48], MS: [0.189, 0.49],
  MO: [0.176, 0.45], MT: [0.382, 0.50], NE: [0.235, 0.42], NV: [0.194, 0.57], NH: [0.297, 0.56], NJ: [0.132, 0.63], NM: [0.203, 0.51], NY: [0.262, 0.61],
  NC: [0.168, 0.49], ND: [0.285, 0.44], OH: [0.084, 0.52], OK: [0.166, 0.51], OR: [0.183, 0.51], PA: [0.131, 0.53], PR: [0.348, 0.12], RI: [0.286, 0.55],
  SC: [0.177, 0.51], SD: [0.332, 0.46], TN: [0.240, 0.49], TX: [0.124, 0.51], UT: [0.223, 0.47], VT: [0.238, 0.47], VA: [0.091, 0.55], WA: [0.119, 0.49],
  DC: [0.327, 0.61], WV: [0.375, 0.53], WI: [0.249, 0.50], WY: [0.266, 0.59]
};
var INSTALL = { low: 25000, avg: 40000, high: 50000 };        /* turnkey installation a post */
var UTILIZATION = { low: 150, medium: 325, high: 450 };       /* kWh a post a day */
var SET = {
  years: 15, bomPerPost: 50000, pedestalUsd: 425, pedestals: false, installCase: 'avg', utilizationCase: 'medium',
  serviceFeePerKwh: 0.10, annualRentUsd: 0, federalCredit: false, federalCreditPct: 0.30, incentiveUsd: 0, additionalIncentiveUsd: 0,
  lossPct: 0.02, discountRate: 0.10, taxRate: 0.20,
  electricityEscalation: 0, priceEscalation: 0, rentEscalation: 0.03, utilizationGrowth: 0.07, serviceFeeEscalation: 0.03
};
var SIZING = { kwPerPost: 150, minPosts: 4, maxPosts: 40, basis: 'one power cabinet’s 1,200 kW across eight posts' };

function num(v) { return v == null || v === '' || !isFinite(Number(v)) ? null : Number(v); }
function r2(v) { return v == null ? null : Math.round(v * 100) / 100; }
function fmt(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

/* year-end dates as day numbers: the investment the day before operations start, then each year end */
function dayNo(y, m, d) { return Math.round(Date.UTC(y, m - 1, d) / 864e5); }
function xnpv(rate, flows, days) { var t = 0; for (var i = 0; i < flows.length; i++) t += flows[i] / Math.pow(1 + rate, (days[i] - days[0]) / 365); return t; }
function xirr(flows, days) {
  function f(r) { return xnpv(r, flows, days); }
  var lo = -0.99, hi = 20, flo = f(lo), fhi = f(hi);
  if (!isFinite(flo) || !isFinite(fhi) || flo * fhi > 0) return null;
  for (var i = 0; i < 200; i++) { var mid = (lo + hi) / 2, fm = f(mid); if (Math.abs(fm) < 1e-7) return mid; if (flo * fm < 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; } }
  return (lo + hi) / 2;
}

/* how many posts the free capacity carries */
function sizePosts(availableKw, sizing) {
  var S = sizing || SIZING, kw = num(availableKw);
  if (kw == null) return { posts: null, fits: false, reason: 'No free capacity on file to size posts on' };
  var n = Math.min(S.maxPosts, Math.floor(kw / S.kwPerPost + 1e-9));
  if (n < S.minPosts) return { posts: 0, fits: false, needKw: S.minPosts * S.kwPerPost,
    reason: fmt(kw) + ' kW does not carry the ' + S.minPosts + '-post minimum (' + fmt(S.minPosts * S.kwPerPost) + ' kW at ' + S.kwPerPost + ' kW a post)' };
  return { posts: n, fits: true, drawKw: n * S.kwPerPost, basis: fmt(kw) + ' kW ÷ ' + S.kwPerPost + ' kW a post (' + S.basis + ')' + (n === S.maxPosts ? ', held at ' + S.maxPosts : '') };
}

/* input: { state, posts | availableKw, startYear, pricePerKwh?, electricityPerKwh?, kwhPerPostDay?,
            installPerPost?, assumptions?, sizing? }  →  the case */
function superchargerCase(input) {
  input = input || {};
  var notes = [], A = {}, over = input.assumptions && typeof input.assumptions === 'object' ? input.assumptions : {};
  Object.keys(SET).forEach(function (k) { A[k] = over[k] != null ? over[k] : SET[k]; });
  Object.keys(over).forEach(function (k) { if (!(k in SET)) notes.push('assumptions.' + k + ' is not one of the charging set’s figures; it is set aside.'); });
  var S = {}; Object.keys(SIZING).forEach(function (k) { S[k] = input.sizing && input.sizing[k] != null ? input.sizing[k] : SIZING[k]; });
  var st = String(input.state || '').toUpperCase().trim(), row = STATES[st] || null;

  var posts = num(input.posts), sized = null;
  if (posts == null) { sized = sizePosts(input.availableKw, S); if (!sized.fits) return { ok: false, version: VERSION, reason: sized.reason, needKw: sized.needKw || null, sizing: sized, notes: notes }; posts = sized.posts; }
  posts = Math.floor(posts);
  if (!(posts >= 1)) return { ok: false, version: VERSION, reason: 'No posts to price', notes: notes };

  var price = num(input.pricePerKwh), elec = num(input.electricityPerKwh);
  if (price == null) { if (!row) return { ok: false, version: VERSION, reason: st ? 'No indicative charging price on file for ' + st : 'The site’s state is not on file, so there is no price or electricity cost to use', notes: notes };
    price = row[1]; notes.push('Price: $' + price.toFixed(2) + ' a kWh, the indicative figure for ' + st + '. The host sets its own.'); }
  if (elec == null) { if (!row) return { ok: false, version: VERSION, reason: 'No levelised electricity cost on file for ' + (st || 'this site'), notes: notes };
    elec = row[0]; notes.push('Electricity: $' + elec.toFixed(3) + ' a kWh levelised (supply and demand charges), the indicative figure for ' + st + ', not the site’s tariff.'); }
  var util = num(input.kwhPerPostDay);
  if (util == null) { util = UTILIZATION[A.utilizationCase] || UTILIZATION.medium; notes.push('Utilisation: ' + util + ' kWh a post a day (the ' + (UTILIZATION[A.utilizationCase] ? A.utilizationCase : 'medium') + ' case), growing ' + Math.round(A.utilizationGrowth * 100) + '% a year. Use the site’s own where it is known.'); }
  var install = num(input.installPerPost);
  if (install == null) { install = INSTALL[A.installCase] || INSTALL.avg; notes.push('Installation: $' + fmt(install) + ' a post (the ' + (INSTALL[A.installCase] ? A.installCase : 'avg') + ' case of $' + fmt(INSTALL.low) + '–$' + fmt(INSTALL.high) + '); it varies by property.'); }
  if (!A.annualRentUsd) notes.push('No site rent is counted; set one where the host is paid.');

  var years = Math.min(30, Math.max(1, Math.floor(A.years))), y0 = Math.floor(num(input.startYear) || 2027);
  var creditFactor = A.federalCredit ? 1 - A.federalCreditPct : 1;
  var equipment = posts * A.bomPerPost + (A.pedestals ? 0.5 * A.pedestalUsd * posts : 0);
  var capex = creditFactor * equipment + install * posts;
  var flows = [-capex + A.incentiveUsd + A.additionalIncentiveUsd], pre = [flows[0]], days = [dayNo(y0 - 1, 12, 31)];
  var rows = [], cum = flows[0], payback = null, revTotal = 0, baseKwh = posts * util * 365;
  for (var y = 1; y <= years; y++) {
    var g = y - 1, kwh = baseKwh * Math.pow(1 + A.utilizationGrowth, g);
    var p = price * Math.pow(1 + A.priceEscalation, g), e = elec * Math.pow(1 + A.electricityEscalation, g), fee = A.serviceFeePerKwh * Math.pow(1 + A.serviceFeeEscalation, g), rent = A.annualRentUsd * Math.pow(1 + A.rentEscalation, g);
    var revenue = kwh * (1 - A.lossPct) * p, operating = kwh * (e + fee), ebt = revenue - operating - rent, tax = A.taxRate * ebt, post = ebt - tax, before = cum;
    cum += post; revTotal += revenue;
    if (payback == null && before < 0 && cum > 0) payback = -before / post + (y - 1);
    flows.push(post); pre.push(ebt); days.push(dayNo(y0 + y - 1, 12, 31));
    rows.push({ year: y, kwh: Math.round(kwh), price: r2(p), revenue: r2(revenue), electricity: r2(kwh * e), serviceFee: r2(kwh * fee), rent: r2(rent), earningsBeforeTax: r2(ebt), tax: r2(tax), cashFlow: r2(post), cumulative: r2(cum) });
  }
  var irrPre = xirr(pre, days), irrPost = xirr(flows, days);
  notes.push('Indicative only: these are planning figures, not the charger maker’s prediction or an offer, and the price and electricity cost are state estimates.');
  return {
    ok: true, version: VERSION,
    sizing: { posts: posts, kwPerPost: S.kwPerPost, drawKw: posts * S.kwPerPost, basis: sized ? sized.basis : 'the post count given' },
    inputs: { state: st || null, pricePerKwh: price, electricityPerKwh: elec, kwhPerPostDay: util, installPerPost: install, bomPerPost: A.bomPerPost, serviceFeePerKwh: A.serviceFeePerKwh, annualRentUsd: A.annualRentUsd, years: years, startYear: y0 },
    capex: { equipment: r2(creditFactor * equipment), installation: r2(install * posts), total: r2(capex), perPost: r2(capex / posts) },
    year1: { kwh: rows[0].kwh, revenue: rows[0].revenue, earningsBeforeTax: rows[0].earningsBeforeTax, cashFlow: rows[0].cashFlow },
    projections: rows,
    returns: { irrPct: irrPost == null ? null : +(irrPost * 100).toFixed(2), irrBasis: 'after-tax IRR over ' + years + ' years', preTaxIrrPct: irrPre == null ? null : +(irrPre * 100).toFixed(2),
      npv: r2(xnpv(A.discountRate, flows, days)), discountRatePct: A.discountRate * 100, paybackYears: payback == null ? null : +payback.toFixed(2),
      averageRevenue: r2(revTotal / years), cumulative: r2(cum) },
    notes: notes
  };
}

module.exports = { VERSION: VERSION, SET: SET, SIZING: SIZING, STATES: STATES, INSTALL: INSTALL, UTILIZATION: UTILIZATION, superchargerCase: superchargerCase, sizePosts: sizePosts, xirr: xirr, xnpv: xnpv };
