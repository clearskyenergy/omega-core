/* api/_lib/invest-math.js — the numbers the storefront shows are the numbers
   an investor is paid on, so the engine is tested against hand-worked cases
   rather than trusted because it renders.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var path = require('path');
var IM = require(path.join(__dirname, '..', '..', 'api', '_lib', 'invest-math.js'));

var fails = 0;
function ok(c, m) { if (!c) { fails++; console.log('  FAIL ' + m); } else console.log('  ok   ' + m); }
function near(a, b, tol) { return Math.abs(a - b) <= (tol || 1e-6); }

/* A 1 MW compute container: $500,000 raise in $100 units, the crowd gets 40%
   of $180,000/yr distributable cash for 10 years, 2% escalator, no
   degradation, cash starts 6 months after funding. */
var C = {
  goal: 500000, unitPrice: 100,
  offer: { sharePct: 40, termYears: 10, distributableAnnual: 180000, escalatorPct: 2, degradationPct: 0, codMonths: 6, kind: 'compute' },
  raised: 125000, unitsSold: 1250, deadline: '2026-12-31T00:00:00Z', minRaise: 200000
};

console.log('units');
ok(IM.unitsFor(1000, 100) === 10, '$1,000 at $100/unit is 10 units');
ok(IM.unitsFor(1050, 100) === 10, 'a partial unit is never sold');
ok(IM.unitsFor(50, 100) === 0, 'below one unit is zero');
ok(IM.unitsFor(1000, 0) === 0, 'a zero unit price sells nothing rather than Infinity');
ok(IM.terms(C).unitsTotal === 5000, 'unitsTotal derives from goal / unitPrice when absent');
ok(IM.unitsRemaining(IM.terms(C)) === 5000, 'terms() alone has nothing sold');
ok(IM.unitsRemaining({ unitsTotal: 5000, unitsSold: 1250 }) === 3750, 'remaining = total - sold');

console.log('ownership');
var p = IM.projection(C, 50);   /* $5,000 */
ok(p.amount === 5000, 'amount = units × unitPrice');
ok(near(p.pctOfOffering, 0.01), '50 of 5,000 units is 1% of the offering');
ok(near(p.pctOfProject, 0.004), '1% of a 40% share is 0.4% of the project');

console.log('cash flows');
/* Year 1: crowd pool 72,000 × 1% = 720 × half a year = 360.
   Year 2: 720 × 1.02 = 734.40. Year 10: 720 × 1.02^9 = 860.46 */
ok(near(p.years[0].distribution, 360, 0.01), 'year 1 is half a year (COD at month 6)');
ok(near(p.years[1].distribution, 734.4, 0.01), 'year 2 is the first full escalated year');
ok(near(p.years[9].distribution, 720 * Math.pow(1.02, 9), 0.01), 'year 10 carries nine escalations');
ok(p.years.length === 10, 'ten years for a ten-year term');
ok(near(p.annualDistribution, 734.4, 0.01), 'headline annual distribution is the first FULL year');
ok(near(p.yieldPct, 734.4 / 5000 * 100, 1e-6), 'yield is that year over the amount paid');
ok(p.paybackYear === 8, 'payback lands in year 8 (7,110 cumulative by then)');
var expectTotal = 360 + 720 * 1.02 * (Math.pow(1.02, 9) - 1) / 0.02;   /* 7,523.85 */
ok(near(p.total, expectTotal, 0.01), 'total is the geometric sum of the stream');
ok(near(p.moic, expectTotal / 5000, 1e-6), 'MOIC ≈ 1.50x over the term');
ok(p.irrPct !== null && p.irrPct > 6 && p.irrPct < 9, 'IRR is a single-digit real number, not a fantasy');

console.log('degradation and exit value');
var D = { goal: 100000, unitPrice: 100, offer: { sharePct: 100, termYears: 3, distributableAnnual: 10000, escalatorPct: 0, degradationPct: 10, codMonths: 0, exitValue: 50000 } };
var q = IM.projection(D, 1000);  /* the whole offering */
ok(near(q.years[0].distribution, 10000, 0.01), 'year 1 full, COD at month 0');
ok(near(q.years[1].distribution, 9000, 0.01), 'year 2 loses 10%');
ok(near(q.years[2].distribution, 8100 + 50000, 0.01), 'exit value lands in the final year');
ok(near(q.total, 10000 + 9000 + 8100 + 50000, 0.01), 'total is the sum of the stream');

console.log('no-return streams');
ok(IM.irr([-100, 0, 0]) === null, 'a stream that never pays has no IRR, not -100%');
ok(IM.irr([100, 10]) === null, 'no outlay, no IRR');
var z = IM.projection({ goal: 1000, unitPrice: 100, offer: { sharePct: 0, termYears: 5, distributableAnnual: 5000 } }, 3);
ok(z.total === 0 && z.irrPct === null && z.paybackYear === null, 'a 0% share pays nothing and says so');
ok(IM.projection(C, 0).amount === 0, 'zero units is a zero quote, not NaN');

console.log('headline');
var h = IM.headline(C);
ok(h.unitsTotal === 5000 && h.unitPrice === 100, 'headline carries the unit terms');
ok(near(h.targetYieldPct, 14.4 * 1.02, 1e-6), 'one unit: $14.688 on $100 in the first full year, unrounded');
ok(h.kind === 'compute', 'kind passes through');

console.log('progress');
var g = IM.progress(C, Date.parse('2026-12-01T00:00:00Z'));
ok(near(g.pct, 25), '125k of 500k is 25%');
ok(g.daysLeft === 30, '30 days to the deadline');
ok(!g.expired && !g.reachedGoal && !g.reachedMin, 'not expired, goal not met, minimum not met');
var g2 = IM.progress({ goal: 100, raised: 250, deadline: '2020-01-01' }, Date.parse('2026-01-01'));
ok(g2.expired && g2.reachedGoal && g2.pct === 250, 'oversubscribed and past deadline');
ok(IM.progress({ goal: 100, raised: 10 }).daysLeft === null, 'no deadline is null, not 0');

console.log('proceeds');
var pr = IM.proceeds(500000, 3);
ok(pr.fee === 15000 && pr.net === 485000, '3% platform fee on $500k');

console.log('eligibility');
var R = IM.rules({ nonAccreditedAnnualCap: 2500, allowedCountries: ['US'] });
var inv = { country: 'US', acceptedRisk: true, accredited: false, status: 'active' };
ok(IM.eligibility(R, inv, 1000, C, 0).ok, 'a US retail investor may put $1,000 in');
ok(!IM.eligibility(R, inv, 50, C, 0).ok, 'below the platform minimum is refused');
var cap = IM.eligibility(R, inv, 1000, C, 2000);
ok(!cap.ok && /remaining/.test(cap.reasons[0]), 'the annual cap counts prior pledges and says what is left');
ok(IM.eligibility(R, { country: 'US', acceptedRisk: true, accredited: true }, 30000, C, 0).ok, 'an accredited investor clears both caps');
ok(!IM.eligibility(R, { country: 'DE', acceptedRisk: true }, 500, C, 0).ok, 'a country outside the list is refused');
ok(IM.eligibility(R, { acceptedRisk: true }, 500, C, 0).ok, 'an UNKNOWN country is not refused here — the API asks for it at pledge time');
ok(!IM.eligibility(R, { country: 'US' }, 500, C, 0).ok, 'the risk acknowledgement is required');
ok(!IM.eligibility(R, { country: 'US', acceptedRisk: true, status: 'suspended' }, 500, C, 0).ok, 'a suspended account is refused');
ok(!IM.eligibility(IM.rules({ requireKyc: true }), inv, 500, C, 0).ok, 'KYC can be switched on from settings');
ok(!IM.eligibility(R, inv, 1000, { minInvestment: 5000 }, 0).ok, 'a campaign minimum above the platform floor applies');
ok(IM.rules({ minInvestment: null }).minInvestment === 100, 'a null override keeps the default');

console.log(fails ? '\n' + fails + ' failing' : '\nall passing');
process.exit(fails ? 1 : 0);
